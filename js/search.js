// ==================== FIREBASE CONFIGURATION ====================
const firebaseConfig = {
    apiKey: "AIzaSyBnMI6S8fig-fl8exIAt5tDz9qWWrWGHAM",
    authDomain: "crime-management-fdd43.firebaseapp.com",
    projectId: "crime-management-fdd43",
    storageBucket: "crime-management-fdd43.appspot.com",
    messagingSenderId: "990509285734",
    appId: "1:990509285734:web:4798f9666ff2dea537c8a7"
};

if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}
const db = firebase.firestore();

// ==================== GLOBAL VARIABLES ====================
let allCases = [];
let expandedRow = null;
let currentEditDocId = null;
let currentEditData = null;
let newEvidenceBase64 = [];
let existingEvidenceBase64 = [];
const SEARCH_CACHE_KEY = 'searchCasesCache_v1';

// ==================== SMART CASE LINKING ENGINE (with spelling tolerance) ====================
class SmartCaseLinkingEngine {
    constructor() {
        this.cases = [];
        this.synonyms = {
            'murder': ['homicide', 'killing', 'manslaughter', 'slaying'],
            'theft': ['burglary', 'robbery', 'larceny', 'stealing', 'stolen'],
            'cyber': ['hacking', 'online fraud', 'phishing', 'data breach'],
            'assault': ['battery', 'attack', 'violence', 'beating'],
            'kidnapping': ['abduction', 'ransom', 'hostage'],
            'fraud': ['scam', 'cheating', 'forgery', 'embezzlement'],
            'riot': ['protest', 'unrest', 'disturbance', 'mob'],
            'car': ['vehicle', 'automobile', 'truck', 'bike', 'motorcycle'],
            'phone': ['mobile', 'smartphone', 'iphone', 'android'],
            'gold': ['jewelry', 'ornament', 'necklace', 'chain'],
            'knife': ['blade', 'dagger', 'sword', 'knives'],
            'gun': ['firearm', 'pistol', 'revolver', 'weapon']
        };
    }

    fuzzyMatch(str1, str2) {
        if (!str1 || !str2) return 0;
        str1 = str1.toLowerCase();
        str2 = str2.toLowerCase();
        if (str1 === str2) return 1;
        
        const len1 = str1.length;
        const len2 = str2.length;
        const matrix = Array(len1 + 1).fill().map(() => Array(len2 + 1).fill(0));
        
        for (let i = 0; i <= len1; i++) matrix[i][0] = i;
        for (let j = 0; j <= len2; j++) matrix[0][j] = j;
        
        for (let i = 1; i <= len1; i++) {
            for (let j = 1; j <= len2; j++) {
                const cost = str1[i-1] === str2[j-1] ? 0 : 1;
                matrix[i][j] = Math.min(
                    matrix[i-1][j] + 1,
                    matrix[i][j-1] + 1,
                    matrix[i-1][j-1] + cost
                );
            }
        }
        
        const maxLen = Math.max(len1, len2);
        const similarity = 1 - (matrix[len1][len2] / maxLen);
        return Math.max(0, Math.min(1, similarity));
    }

    fuzzyMatchInText(keyword, text) {
        if (!keyword || !text) return false;
        const words = text.toLowerCase().split(/\W+/);
        for (const word of words) {
            if (this.fuzzyMatch(keyword, word) >= 0.7) return true;
        }
        return false;
    }

    textSimilarity(text1, text2) {
        if (!text1 || !text2) return 0;
        const words1 = text1.toLowerCase().split(/\W+/);
        const words2 = text2.toLowerCase().split(/\W+/);
        const set1 = new Set(words1);
        const set2 = new Set(words2);
        const intersection = new Set([...set1].filter(x => set2.has(x)));
        const union = new Set([...set1, ...set2]);
        return intersection.size / union.size;
    }

    getWordVariants(word) {
        const variants = new Set([word]);
        if (word.endsWith('s')) variants.add(word.slice(0, -1));
        else variants.add(word + 's');
        if (word === 'knife') variants.add('knives');
        if (word === 'knives') variants.add('knife');
        if (word === 'thief') variants.add('thieves');
        if (word === 'thieves') variants.add('thief');
        return Array.from(variants);
    }

    universalSearch(searchTerm, filters = {}) {
        if (!searchTerm || searchTerm.trim() === '') return [];
        
        const searchLower = searchTerm.toLowerCase().trim();
        let keywords = searchLower.split(/\s+/).filter(k => k.length > 0);
        
        if (keywords.length === 1) {
            const singleWord = keywords[0];
            const variants = this.getWordVariants(singleWord);
            let synonymsList = [];
            for (const [key, values] of Object.entries(this.synonyms)) {
                if (key === singleWord || values.includes(singleWord)) {
                    synonymsList = values;
                    break;
                }
            }
            keywords = [...new Set([...variants, ...synonymsList])];
        }
        
        const results = [];
        let anchorCase = null;
        for (const keyword of keywords) {
            anchorCase = this.cases.find(c => c.refID.toLowerCase().includes(keyword));
            if (anchorCase) break;
        }
        
        for (const caseData of this.cases) {
            if (filters.crimeType && caseData.category !== filters.crimeType) continue;
            if (filters.status && caseData.status !== filters.status) continue;
            
            const docText = [
                caseData.refID, caseData.category, caseData.victimName,
                caseData.suspectName, caseData.criminalName, caseData.complaint,
                caseData.phone, caseData.location, caseData.weapon,
                caseData.victimContact, caseData.victimAddress
            ].filter(Boolean).join(' ').toLowerCase();
            
            let totalScore = 0;
            let matchedKeywords = [];
            let matchDetails = [];
            let isExactIdMatch = false;
            
            for (const keyword of keywords) {
                if (keyword.length < 2) continue;
                
                if (caseData.refID.toLowerCase() === keyword) {
                    isExactIdMatch = true;
                    totalScore += 100;
                    matchedKeywords.push(keyword);
                    matchDetails.push(`ðŸŽ¯ Exact Case ID match: ${keyword}`);
                }
                else if (caseData.refID.toLowerCase().includes(keyword)) {
                    totalScore += 60;
                    matchedKeywords.push(keyword);
                    matchDetails.push(`ðŸ“‹ Case ID contains: ${keyword}`);
                }
                else if (caseData.victimName.toLowerCase().includes(keyword)) {
                    totalScore += 45;
                    matchedKeywords.push(keyword);
                    matchDetails.push(`ðŸ‘¤ Victim name contains: ${keyword}`);
                }
                else if (this.fuzzyMatchInText(keyword, caseData.victimName)) {
                    totalScore += 35;
                    matchedKeywords.push(keyword);
                    matchDetails.push(`ðŸ‘¤ Victim name (fuzzy): ${keyword}`);
                }
                else if (caseData.suspectName && caseData.suspectName.toLowerCase().includes(keyword)) {
                    totalScore += 45;
                    matchedKeywords.push(keyword);
                    matchDetails.push(`ðŸ•µï¸ Suspect name contains: ${keyword}`);
                }
                else if (caseData.suspectName && this.fuzzyMatchInText(keyword, caseData.suspectName)) {
                    totalScore += 35;
                    matchedKeywords.push(keyword);
                    matchDetails.push(`ðŸ•µï¸ Suspect name (fuzzy): ${keyword}`);
                }
                else if (caseData.criminalName && caseData.criminalName.toLowerCase().includes(keyword)) {
                    totalScore += 45;
                    matchedKeywords.push(keyword);
                    matchDetails.push(`âš ï¸ Criminal name contains: ${keyword}`);
                }
                else if (caseData.criminalName && this.fuzzyMatchInText(keyword, caseData.criminalName)) {
                    totalScore += 35;
                    matchedKeywords.push(keyword);
                    matchDetails.push(`âš ï¸ Criminal name (fuzzy): ${keyword}`);
                }
                else if (caseData.category.toLowerCase().includes(keyword)) {
                    totalScore += 40;
                    matchedKeywords.push(keyword);
                    matchDetails.push(`ðŸŽ­ Crime type: ${keyword}`);
                }
                else if (this.fuzzyMatchInText(keyword, caseData.category)) {
                    totalScore += 30;
                    matchedKeywords.push(keyword);
                    matchDetails.push(`ðŸŽ­ Crime type (fuzzy): ${keyword}`);
                }
                else if (caseData.phone && caseData.phone.includes(keyword)) {
                    totalScore += 40;
                    matchedKeywords.push(keyword);
                    matchDetails.push(`ðŸ“ž Phone number: ${keyword}`);
                }
                else if (caseData.location && caseData.location.toLowerCase().includes(keyword)) {
                    totalScore += 35;
                    matchedKeywords.push(keyword);
                    matchDetails.push(`ðŸ“ Location: ${keyword}`);
                }
                else if (caseData.location && this.fuzzyMatchInText(keyword, caseData.location)) {
                    totalScore += 25;
                    matchedKeywords.push(keyword);
                    matchDetails.push(`ðŸ“ Location (fuzzy): ${keyword}`);
                }
                else if (caseData.complaint.toLowerCase().includes(keyword)) {
                    totalScore += 30;
                    matchedKeywords.push(keyword);
                    matchDetails.push(`ðŸ“ Description contains: ${keyword}`);
                }
                else if (this.fuzzyMatchInText(keyword, caseData.complaint)) {
                    totalScore += 20;
                    matchedKeywords.push(keyword);
                    matchDetails.push(`ðŸ“ Description (fuzzy): ${keyword}`);
                }
                else if (docText.includes(keyword)) {
                    totalScore += 15;
                    matchedKeywords.push(keyword);
                    matchDetails.push(`ðŸ” Found in case details: ${keyword}`);
                }
                else if (this.fuzzyMatchInText(keyword, docText)) {
                    totalScore += 12;
                    matchedKeywords.push(keyword);
                    matchDetails.push(`ðŸ” Fuzzy match in case details: ${keyword}`);
                }
            }
            
            if (anchorCase && anchorCase.id !== caseData.id) {
                const anchorText = [anchorCase.category, anchorCase.complaint, anchorCase.location].join(' ').toLowerCase();
                const semanticScore = this.textSimilarity(anchorText, docText);
                if (semanticScore > 0.3) {
                    const boost = Math.round(semanticScore * 40);
                    totalScore += boost;
                    matchDetails.push(`ðŸ”— Semantically related to case ${anchorCase.refID} (${Math.round(semanticScore * 100)}% similar)`);
                }
                const anchorKeywords = anchorText.split(/\W+/).filter(k => k.length > 3);
                const sharedKeywords = anchorKeywords.filter(k => docText.includes(k));
                if (sharedKeywords.length > 0) {
                    totalScore += Math.min(sharedKeywords.length * 8, 30);
                    matchDetails.push(`ðŸ”‘ Shares keywords with case ${anchorCase.refID}: ${sharedKeywords.slice(0, 3).join(', ')}`);
                }
            }
            
            if (matchedKeywords.length > 0 || (anchorCase && anchorCase.id !== caseData.id)) {
                let finalScore = isExactIdMatch ? 100 : Math.min(totalScore, 100);
                if (!isExactIdMatch && matchedKeywords.length > 0) {
                    const ratio = matchedKeywords.length / keywords.length;
                    finalScore = Math.min(100, finalScore * (0.6 + ratio * 0.4));
                }
                if (finalScore < 25 && matchDetails.some(d => d.includes('semantically'))) finalScore = 25;
                results.push({
                    case: caseData,
                    score: Math.round(finalScore),
                    matchedKeywords: matchedKeywords.slice(0, 5),
                    matchDetails: matchDetails.slice(0, 5)
                });
            }
        }
        results.sort((a, b) => b.score - a.score);
        return results;
    }

    findSimilarCases(targetCase, matchType = 'hybrid', filters = {}) {
        const results = [];
        for (const candidate of this.cases) {
            if (candidate.id === targetCase.id) continue;
            if (filters.crimeType && candidate.category !== filters.crimeType) continue;
            if (filters.status && candidate.status !== filters.status) continue;
            const matchResult = this.calculateSimilarity(targetCase, candidate, matchType);
            if (matchResult.score > 20) {
                results.push({ case: candidate, confidence: matchResult.score, reasons: matchResult.reasons });
            }
        }
        results.sort((a, b) => b.confidence - a.confidence);
        return results;
    }

    calculateSimilarity(case1, case2, matchType = 'hybrid') {
        const scores = [], reasons = [];
        if (case1.category && case2.category) {
            const crimeMatch = matchType === 'exact' ? (case1.category === case2.category ? 1 : 0) : this.fuzzyMatch(case1.category, case2.category);
            if (crimeMatch > 0.7) reasons.push('ðŸŽ¯ Same crime category');
            scores.push({ weight: 0.30, value: crimeMatch });
        }
        if (case1.complaint && case2.complaint) {
            const moSim = this.textSimilarity(case1.complaint, case2.complaint);
            if (moSim > 0.5) reasons.push('ðŸ“ Similar modus operandi');
            scores.push({ weight: 0.25, value: moSim });
        }
        const name1 = case1.victimName || case1.suspectName || '';
        const name2 = case2.victimName || case2.suspectName || '';
        if (name1 && name2) {
            const nameMatch = this.fuzzyMatch(name1, name2);
            if (nameMatch > 0.7) reasons.push('ðŸ‘¤ Same/similar person name');
            scores.push({ weight: 0.20, value: nameMatch });
        }
        if (case1.phone && case2.phone) {
            const phoneMatch = this.fuzzyMatch(case1.phone, case2.phone);
            if (phoneMatch > 0.8) reasons.push('ðŸ“ž Same phone number');
            scores.push({ weight: 0.15, value: phoneMatch });
        }
        const kw1 = (case1.complaint + ' ' + case1.category).toLowerCase().split(/\W+/);
        const kw2 = (case2.complaint + ' ' + case2.category).toLowerCase().split(/\W+/);
        const common = kw1.filter(k => kw2.includes(k) && k.length > 3);
        if (common.length > 0) {
            const kwScore = Math.min(common.length / 5, 1);
            if (kwScore > 0.3) reasons.push(`ðŸ”‘ Common keywords: ${common.slice(0, 3).join(', ')}`);
            scores.push({ weight: 0.10, value: kwScore });
        }
        let total = 0, weight = 0;
        for (const s of scores) { total += s.weight * s.value; weight += s.weight; }
        return { score: Math.round((total / weight) * 100), reasons: reasons.slice(0, 4) };
    }

    loadCases(cases) { this.cases = cases; }
}

const linkingEngine = new SmartCaseLinkingEngine();

// ==================== COMPRESS IMAGE TO BASE64 ====================
async function compressImageToBase64(file) {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = (e) => {
            const img = new Image();
            img.src = e.target.result;
            img.onload = () => {
                let width = img.width, height = img.height;
                const maxDim = 800;
                if (width > maxDim) { height = Math.round(height * (maxDim / width)); width = maxDim; }
                const canvas = document.createElement('canvas');
                canvas.width = width; canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);
                resolve(canvas.toDataURL('image/jpeg', 0.6));
            };
        };
    });
}

// ==================== LOAD ALL FIRs ====================
async function loadAllCases() {
    const resultsDiv = document.getElementById('resultsContainer');
    resultsDiv.innerHTML = '<div class="spinner"></div><div style="text-align:center;">Loading cases...</div>';
    try {
        const cachedRaw = localStorage.getItem(SEARCH_CACHE_KEY);
        if (cachedRaw) {
            const cached = JSON.parse(cachedRaw);
            if (Array.isArray(cached.cases) && cached.cases.length) {
                allCases = cached.cases;
                linkingEngine.loadCases(allCases);
                document.getElementById('totalCases').textContent = allCases.length;
                resultsDiv.innerHTML = `<div class="empty-state"><i class="fas fa-check-circle" style="font-size:48px;margin-bottom:15px;color:var(--success);"></i><p>${allCases.length} cases loaded from cache!</p><p style="font-size:0.8rem;margin-top:10px;">Refreshing with live data...</p></div>`;
            }
        }

        const snapshot = await db.collection('firs').get();
        allCases = [];
        for (const doc of snapshot.docs) {
            const data = doc.data();
            let victimName = 'Unknown', victimContact = '', victimAddress = '', victimAge = '', victimIdProof = '', victimOccupation = '';
            if (data.victims && data.victims.length > 0) {
                victimName = data.victims[0].name || 'Unknown';
                victimContact = data.victims[0].contact || '';
                victimAddress = data.victims[0].address || '';
                victimAge = data.victims[0].age || '';
                victimIdProof = data.victims[0].idProof || '';
                victimOccupation = data.victims[0].occupation || '';
            } else if (data.victimName) {
                victimName = data.victimName;
                victimContact = data.victimContact || '';
                victimAddress = data.victimAddress || '';
                victimAge = data.victimAge || '';
                victimIdProof = data.victimIdProof || '';
                victimOccupation = data.victimOccupation || '';
            }
            let suspectNames = [], suspectDetails = [];
            if (data.suspects && data.suspects.length > 0) {
                suspectNames = data.suspects.map(s => s.name).filter(n => n);
                suspectDetails = data.suspects;
            } else if (data.suspectName) suspectNames = [data.suspectName];
            let criminalNames = [], criminalDetails = [];
            if (data.criminals && data.criminals.length > 0) {
                criminalNames = data.criminals.map(c => c.name).filter(n => n);
                criminalDetails = data.criminals;
            } else if (data.criminalDetails && data.criminalDetails.name) {
                criminalNames = [data.criminalDetails.name];
                criminalDetails = [data.criminalDetails];
            }
            let witnesses = data.witnesses || [];
            let photos = [];
            if (data.photos && data.photos.length > 0) photos = data.photos;
            else if (data.photoURL) photos = [data.photoURL];
            else if (data.imageUrl) photos = [data.imageUrl];
            const description = data.complaint || data.incidentDescription || '';
            const location = data.location || data.incidentLocation || '';
            allCases.push({
                id: doc.id,
                refID: data.refID || data.refNo || doc.id.slice(0, 8),
                category: data.category || 'Unknown',
                complaint: description,
                victimName, victimContact, victimAddress, victimAge, victimIdProof, victimOccupation,
                suspectName: suspectNames.join(', ') || 'Unknown',
                suspectDetails, criminalName: criminalNames.join(', ') || '', criminalDetails,
                witnesses, location, date: data.date || 'Unknown',
                status: data.status || 'Pending',
                phone: victimContact || data.phone || data.contactNumber || '',
                weapon: data.weapon || '', propertySeizure: data.propertySeizure || '',
                judgement: data.judgement || '', photos, fullData: data
            });
        }
        linkingEngine.loadCases(allCases);
        localStorage.setItem(SEARCH_CACHE_KEY, JSON.stringify({ savedAt: Date.now(), cases: allCases }));
        document.getElementById('totalCases').textContent = allCases.length;
        resultsDiv.innerHTML = `<div class="empty-state"><i class="fas fa-check-circle" style="font-size:48px;margin-bottom:15px;color:var(--success);"></i><p>${allCases.length} cases loaded successfully!</p><p style="font-size:0.8rem;margin-top:10px;">Now searching across ALL case fields including victims, suspects, criminals, and photos.</p></div>`;
    } catch (error) {
        console.error(error);
        if (!allCases.length) {
            resultsDiv.innerHTML = `<div class="empty-state"><p style="color:var(--danger);">Error loading cases: ${error.message}</p></div>`;
        }
    }
}

// ==================== DISPLAY SEARCH RESULTS ====================
function displaySearchResults(results, searchTerm) {
    const resultsDiv = document.getElementById('resultsContainer');
    if (results.length === 0) {
        resultsDiv.innerHTML = `<div class="empty-state"><i class="fas fa-search" style="font-size:48px;margin-bottom:15px;"></i><p>No cases found matching "${escapeHtml(searchTerm)}"</p><p style="font-size:0.8rem;">Try different keywords or remove filters</p><p style="font-size:0.8rem;margin-top:5px;">ðŸ’¡ Tip: Use multiple keywords like "John theft phone" or a full paragraph description</p></div>`;
        return;
    }
    const topResult = results[0];
    const hasSemantic = results.some(r => r.matchDetails && r.matchDetails.some(d => d.includes('semantically')));
    resultsDiv.innerHTML = `
        <div class="explanation-box">
            <div class="explanation-title"><i class="fas fa-search"></i> Semantic Search Results for: "${escapeHtml(searchTerm)}" ${hasSemantic ? '<span class="semantic-badge">âœ¨ Semantic Matches Found</span>' : ''}</div>
            <div style="font-size:0.85rem;color:var(--text-dim);">Found ${results.length} matching cases | Best match: ${topResult.score}% relevance ${hasSemantic ? '<br>ðŸ”— <strong>Including semantically related cases</strong>' : ''}</div>
        </div>
        <div class="results-table">
            <table><thead><tr><th style="width:30px;"></th><th>Case ID</th><th>Crime Type</th><th>Victim Name</th><th>Status</th><th>Match %</th><th>Actions</th></tr></thead><tbody>
            ${results.map((r, idx) => `
                <tr class="expandable-row" onclick="toggleExplanation(${idx}, '${r.case.id}', ${JSON.stringify(r.matchDetails || []).replace(/"/g, '&quot;')}, ${r.score}, '${escapeHtml(searchTerm).replace(/'/g, "\\'")}')">
                    <td><span id="icon-${idx}" class="expand-icon"><i class="fas fa-chevron-right"></i></span></td>
                    <td><strong>${r.case.refID}</strong></td><td>${r.case.category}</td><td>${r.case.victimName}</td><td>${r.case.status}</td>
                    <td><span class="confidence-badge ${r.score >= 70 ? 'confidence-high' : (r.score >= 40 ? 'confidence-medium' : 'confidence-low')}">${r.score}%</span></td>
                    <td><button class="btn" onclick="event.stopPropagation(); findSimilarToCase('${r.case.id}')"><i class="fas fa-link"></i> Find Similar</button></td>
                </tr>
                <tr id="detail-${idx}" class="detail-row"><td colspan="7" class="detail-cell"></td></tr>
            `).join('')}
            </tbody></table>
        </div>`;
}

function toggleExplanation(rowId, caseId, matchDetails, confidence, searchTerm) {
    const detailRow = document.getElementById(`detail-${rowId}`);
    const expandIcon = document.getElementById(`icon-${rowId}`);
    if (detailRow.classList.contains('show')) {
        detailRow.classList.remove('show');
        expandIcon.innerHTML = '<i class="fas fa-chevron-right"></i>';
        expandedRow = null;
    } else {
        if (expandedRow) {
            const prevRow = document.getElementById(`detail-${expandedRow}`);
            const prevIcon = document.getElementById(`icon-${expandedRow}`);
            if (prevRow) prevRow.classList.remove('show');
            if (prevIcon) prevIcon.innerHTML = '<i class="fas fa-chevron-right"></i>';
        }
        detailRow.classList.add('show');
        expandIcon.innerHTML = '<i class="fas fa-chevron-down"></i>';
        expandedRow = rowId;
        const caseData = allCases.find(c => c.id === caseId);
        let reasonsHtml = matchDetails && matchDetails.length ? matchDetails.map(r => `<li><i class="fas fa-check-circle"></i> ${r}</li>`).join('') : '<li><i class="fas fa-info-circle"></i> Match found based on keyword relevance</li>';
        detailRow.innerHTML = `<td colspan="7" class="detail-cell"><div class="explanation-box"><div class="explanation-title"><i class="fas fa-brain"></i> Explainable AI - Semantic Link Analysis <span class="semantic-badge">Semantic Search</span></div><div style="display:flex;gap:20px;flex-wrap:wrap;margin-bottom:10px;"><div><strong style="color:var(--accent-gold);">Confidence Score:</strong> <span class="confidence-badge ${confidence >= 70 ? 'confidence-high' : (confidence >= 40 ? 'confidence-medium' : 'confidence-low')}">${confidence}%</span></div><div><strong style="color:var(--accent-gold);">Case ID:</strong> ${caseData.refID}</div><div><strong style="color:var(--accent-gold);">Crime Type:</strong> ${caseData.category}</div></div><div style="margin-top:10px;"><strong style="color:var(--accent-blue);"><i class="fas fa-list"></i> Matching & Semantic Reasons:</strong><ul class="explanation-reasons">${reasonsHtml}</ul></div><div style="margin-top:15px;"><button class="btn" onclick="event.stopPropagation(); showCaseDetails('${caseId}')"><i class="fas fa-eye"></i> View Full Case Details</button> <button class="btn btn-purple" onclick="event.stopPropagation(); findSimilarToCase('${caseId}')"><i class="fas fa-link"></i> Find Similar Cases</button></div></div></td>`;
    }
}

// ==================== CASE DETAILS MODAL ====================
function showCaseDetails(caseId) {
    const caseData = allCases.find(c => c.id === caseId);
    if (!caseData) return;
    const modal = document.getElementById('caseModal');
    const modalBody = document.getElementById('modalBody');
    const fullData = caseData.fullData || caseData;
    let html = `<div class="detail-section"><h4><i class="fas fa-barcode"></i> Case Information</h4><p><strong>Case ID:</strong> ${caseData.refID}</p><p><strong>Crime Type:</strong> ${caseData.category}</p><p><strong>Date:</strong> ${caseData.date}</p><p><strong>Status:</strong> <span class="${caseData.status === 'Pending' ? 'status-pending' : (caseData.status === 'Arrested' ? 'status-arrested' : 'status-closed')}">${caseData.status}</span></p><p><strong>Location:</strong> ${caseData.location}</p></div>`;
    if (caseData.photos && caseData.photos.length) {
        html += `<div class="detail-section"><h4><i class="fas fa-images"></i> Case Photos / Evidence (${caseData.photos.length})</h4><div class="photo-gallery">${caseData.photos.map((photo, idx) => `<div class="photo-item" onclick="showFullscreenImage('${photo}')"><img src="${photo}" alt="Evidence ${idx+1}" onerror="this.src='https://via.placeholder.com/150?text=No+Image'"><div class="photo-label">Evidence ${idx+1}</div></div>`).join('')}</div></div>`;
    }
    if (fullData.victims && fullData.victims.length) {
        html += `<div class="detail-section"><h4><i class="fas fa-user-injured"></i> Victim Details</h4>`;
        fullData.victims.forEach(v => { html += `<div class="person-card"><div class="person-grid"><p><strong>Name:</strong> ${v.name || 'N/A'}</p><p><strong>Age:</strong> ${v.age || 'N/A'}</p><p><strong>Contact:</strong> ${v.contact || 'N/A'}</p><p><strong>Address:</strong> ${v.address || 'N/A'}</p><p><strong>ID Proof:</strong> ${v.idProof || 'N/A'}</p><p><strong>Occupation:</strong> ${v.occupation || 'N/A'}</p></div></div>`; });
        html += `</div>`;
    } else if (caseData.victimName && caseData.victimName !== 'Unknown') {
        html += `<div class="detail-section"><h4><i class="fas fa-user-injured"></i> Victim Details</h4><div class="person-card"><div class="person-grid"><p><strong>Name:</strong> ${caseData.victimName}</p><p><strong>Contact:</strong> ${caseData.victimContact || 'N/A'}</p><p><strong>Address:</strong> ${caseData.victimAddress || 'N/A'}</p><p><strong>Age:</strong> ${caseData.victimAge || 'N/A'}</p><p><strong>ID Proof:</strong> ${caseData.victimIdProof || 'N/A'}</p><p><strong>Occupation:</strong> ${caseData.victimOccupation || 'N/A'}</p></div></div></div>`;
    }
    if (caseData.suspectDetails && caseData.suspectDetails.length) {
        html += `<div class="detail-section"><h4><i class="fas fa-user-secret"></i> Suspect Details</h4>`;
        caseData.suspectDetails.forEach(s => { html += `<div class="person-card"><div class="person-grid"><p><strong>Name:</strong> ${s.name || 'N/A'}</p><p><strong>Age:</strong> ${s.age || 'N/A'}</p><p><strong>Gender:</strong> ${s.gender || 'N/A'}</p><p><strong>Height:</strong> ${s.height || 'N/A'}</p><p><strong>Build:</strong> ${s.build || 'N/A'}</p><p><strong>Marks:</strong> ${s.marks || 'N/A'}</p><p><strong>Last Seen:</strong> ${s.lastSeen || 'N/A'}</p></div></div>`; });
        html += `</div>`;
    } else if (caseData.suspectName && caseData.suspectName !== 'Unknown') {
        html += `<div class="detail-section"><h4><i class="fas fa-user-secret"></i> Suspect Details</h4><div class="person-card"><p><strong>Name:</strong> ${caseData.suspectName}</p></div></div>`;
    }
    if (caseData.criminalDetails && caseData.criminalDetails.length) {
        html += `<div class="detail-section"><h4><i class="fas fa-skull-crosswalk"></i> Criminal Details</h4>`;
        caseData.criminalDetails.forEach(c => { html += `<div class="person-card"><div class="person-grid"><p><strong>Name:</strong> ${c.name || 'N/A'}</p><p><strong>Alias:</strong> ${c.alias || 'N/A'}</p><p><strong>Age:</strong> ${c.age || 'N/A'}</p><p><strong>Gender:</strong> ${c.gender || 'N/A'}</p><p><strong>Address:</strong> ${c.address || 'N/A'}</p><p><strong>Previous Record:</strong> ${c.record || 'N/A'}</p></div></div>`; });
        html += `</div>`;
    } else if (caseData.criminalName) {
        html += `<div class="detail-section"><h4><i class="fas fa-skull-crosswalk"></i> Criminal Details</h4><div class="person-card"><p><strong>Name:</strong> ${caseData.criminalName}</p></div></div>`;
    }
    if (caseData.witnesses && caseData.witnesses.length) {
        html += `<div class="detail-section"><h4><i class="fas fa-users"></i> Witness Details</h4>`;
        caseData.witnesses.forEach(w => { html += `<div class="person-card"><div class="person-grid"><p><strong>Name:</strong> ${w.name || 'N/A'}</p><p><strong>Age:</strong> ${w.age || 'N/A'}</p><p><strong>Contact:</strong> ${w.contact || 'N/A'}</p><p><strong>Address:</strong> ${w.address || 'N/A'}</p><p><strong>Statement:</strong> ${w.statement || 'N/A'}</p></div></div>`; });
        html += `</div>`;
    }
    html += `<div class="detail-section"><h4><i class="fas fa-file-alt"></i> Case Description / Modus Operandi</h4><p>${caseData.complaint || 'No description available'}</p></div>`;
    if (caseData.propertySeizure) html += `<div class="detail-section"><h4><i class="fas fa-box"></i> Property Seizure</h4><p>${caseData.propertySeizure}</p></div>`;
    if (caseData.judgement) html += `<div class="detail-section"><h4><i class="fas fa-gavel"></i> Court Judgement</h4><p>${caseData.judgement}</p></div>`;
    html += `<div style="margin-top:20px;display:flex;gap:10px;justify-content:flex-end;"><button class="btn" onclick="findSimilarToCase('${caseData.id}'); closeModal();"><i class="fas fa-link"></i> Find Similar Cases</button><button class="btn" style="background:linear-gradient(135deg,#10b981,#059669);" onclick="closeModal()"><i class="fas fa-times"></i> Close</button></div>`;
    modalBody.innerHTML = html;
    modal.classList.add('active');
}

function showFullscreenImage(imageUrl) {
    const modal = document.getElementById('fullscreenModal');
    const img = document.getElementById('fullscreenImage');
    img.src = imageUrl;
    modal.classList.add('active');
}

function closeFullscreen() { document.getElementById('fullscreenModal').classList.remove('active'); }
function closeModal() { document.getElementById('caseModal').classList.remove('active'); }

// ==================== UNIVERSAL SEARCH ====================
async function universalSearch() {
    const searchTerm = document.getElementById('searchInput').value.trim();
    if (!searchTerm) { alert('Please enter a search term'); return; }
    const crimeFilter = document.getElementById('crimeTypeFilter').value;
    const statusFilter = document.getElementById('statusFilter').value;
    const resultsDiv = document.getElementById('resultsContainer');
    resultsDiv.innerHTML = '<div class="spinner"></div><div style="text-align:center;">ðŸ” Performing semantic search across all cases...</div>';
    setTimeout(() => {
        const start = performance.now();
        const searchResults = linkingEngine.universalSearch(searchTerm, { crimeType: crimeFilter, status: statusFilter });
        const time = performance.now() - start;
        document.getElementById('processingTime').textContent = Math.round(time) + 'ms';
        document.getElementById('linkedCases').textContent = searchResults.length;
        if (searchResults.length) {
            const avg = searchResults.reduce((a,b) => a + b.score, 0) / searchResults.length;
            document.getElementById('avgConfidence').textContent = Math.round(avg) + '%';
        }
        displaySearchResults(searchResults, searchTerm);
    }, 100);
}

async function findSimilarToCase(caseId) {
    const targetCase = allCases.find(c => c.id === caseId);
    if (!targetCase) return;
    const matchType = document.getElementById('matchType').value;
    const crimeFilter = document.getElementById('crimeTypeFilter').value;
    const statusFilter = document.getElementById('statusFilter').value;
    const resultsDiv = document.getElementById('resultsContainer');
    resultsDiv.innerHTML = '<div class="spinner"></div><div style="text-align:center;">Finding similar cases...</div>';
    setTimeout(() => {
        const start = performance.now();
        const similar = linkingEngine.findSimilarCases(targetCase, matchType, { crimeType: crimeFilter, status: statusFilter });
        const time = performance.now() - start;
        document.getElementById('processingTime').textContent = Math.round(time) + 'ms';
        document.getElementById('linkedCases').textContent = similar.length;
        if (similar.length) {
            const avg = similar.reduce((a,b) => a + b.confidence, 0) / similar.length;
            document.getElementById('avgConfidence').textContent = Math.round(avg) + '%';
        }
        displaySimilarResults(targetCase, similar);
    }, 100);
}

function displaySimilarResults(targetCase, results) {
    const resultsDiv = document.getElementById('resultsContainer');
    if (results.length === 0) {
        resultsDiv.innerHTML = `<div class="empty-state"><i class="fas fa-search" style="font-size:48px;margin-bottom:15px;"></i><p>No similar cases found for Case ${targetCase.refID}</p></div>`;
        return;
    }
    resultsDiv.innerHTML = `
        <div class="explanation-box"><div class="explanation-title"><i class="fas fa-link"></i> Cases Similar to: ${targetCase.refID} (${targetCase.category})</div><div style="font-size:0.85rem;color:var(--text-dim);">Victim: ${targetCase.victimName} | Status: ${targetCase.status} | Found ${results.length} similar cases</div></div>
        <div class="results-table"><table><thead><tr><th style="width:30px;"></th><th>Case ID</th><th>Crime Type</th><th>Victim Name</th><th>Status</th><th>Confidence</th><th>Actions</th></tr></thead><tbody>
        ${results.map((r, idx) => `
            <tr class="expandable-row" onclick="toggleExplanation(${idx}, '${r.case.id}', ${JSON.stringify(r.reasons || []).replace(/"/g, '&quot;')}, ${r.confidence}, '')">
                <td><span id="icon-${idx}" class="expand-icon"><i class="fas fa-chevron-right"></i></span></td>
                <td><strong>${r.case.refID}</strong></td><td>${r.case.category}</td><td>${r.case.victimName}</td><td>${r.case.status}</td>
                <td><span class="confidence-badge ${r.confidence >= 70 ? 'confidence-high' : (r.confidence >= 40 ? 'confidence-medium' : 'confidence-low')}">${r.confidence}%</span></td>
                <td><button class="btn" onclick="event.stopPropagation(); findSimilarToCase('${r.case.id}')"><i class="fas fa-link"></i> Find Similar</button></td>
            </tr>
            <tr id="detail-${idx}" class="detail-row"><td colspan="7" class="detail-cell"></td></tr>
        `).join('')}
        </tbody></table></div>`;
}

function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>]/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[m]));
}

// ==================== INITIALIZATION & EVENT LISTENERS ====================
document.getElementById('searchInput').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') universalSearch();
});

if (sessionStorage.getItem('isLoggedIn') !== 'true') {
    window.location.href = 'index.html';
} else {
    loadAllCases();
}



