// ==================== FIREBASE CONFIGURATION ====================
const firebaseConfig = {
    apiKey: "AIzaSyBnMI6S8fig-fl8exIAt5tDz9qWWrWGHAM",
    authDomain: "crime-management-fdd43.firebaseapp.com",
    projectId: "crime-management-fdd43",
    storageBucket: "crime-management-fdd43.appspot.com",
    messagingSenderId: "990509285734",
    appId: "1:990509285734:web:4798f9666ff2dea537c8a7"
};

if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

// ==================== GLOBAL VARIABLES ====================
let allCases = [];
let expandedRow = null;
let currentEditDocId = null;
let currentEditData = null;
let newEvidenceBase64 = [];
let existingEvidenceBase64 = [];

// Face recognition state
let faceModelsLoaded = false;

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
        const len1 = str1.length, len2 = str2.length;
        const matrix = Array(len1 + 1).fill().map(() => Array(len2 + 1).fill(0));
        for (let i = 0; i <= len1; i++) matrix[i][0] = i;
        for (let j = 0; j <= len2; j++) matrix[0][j] = j;
        for (let i = 1; i <= len1; i++) {
            for (let j = 1; j <= len2; j++) {
                const cost = str1[i-1] === str2[j-1] ? 0 : 1;
                matrix[i][j] = Math.min(matrix[i-1][j] + 1, matrix[i][j-1] + 1, matrix[i-1][j-1] + cost);
            }
        }
        const maxLen = Math.max(len1, len2);
        return 1 - (matrix[len1][len2] / maxLen);
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
        const set1 = new Set(words1), set2 = new Set(words2);
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
                caseData.refID, caseData.category, caseData.victimName, caseData.suspectName,
                caseData.criminalName, caseData.complaint, caseData.phone, caseData.location,
                caseData.weapon, caseData.victimContact, caseData.victimAddress
            ].filter(Boolean).join(' ').toLowerCase();
            let totalScore = 0, matchedKeywords = [], matchDetails = [], isExactIdMatch = false;
            for (const keyword of keywords) {
                if (keyword.length < 2) continue;
                if (caseData.refID.toLowerCase() === keyword) {
                    isExactIdMatch = true;
                    totalScore += 100;
                    matchedKeywords.push(keyword);
                    matchDetails.push(`🎯 Exact Case ID match: ${keyword}`);
                } else if (caseData.refID.toLowerCase().includes(keyword)) {
                    totalScore += 60;
                    matchedKeywords.push(keyword);
                    matchDetails.push(`📋 Case ID contains: ${keyword}`);
                } else if (caseData.victimName.toLowerCase().includes(keyword)) {
                    totalScore += 45;
                    matchedKeywords.push(keyword);
                    matchDetails.push(`👤 Victim name contains: ${keyword}`);
                } else if (this.fuzzyMatchInText(keyword, caseData.victimName)) {
                    totalScore += 35;
                    matchedKeywords.push(keyword);
                    matchDetails.push(`👤 Victim name (fuzzy): ${keyword}`);
                } else if (caseData.suspectName && caseData.suspectName.toLowerCase().includes(keyword)) {
                    totalScore += 45;
                    matchedKeywords.push(keyword);
                    matchDetails.push(`🕵️ Suspect name contains: ${keyword}`);
                } else if (caseData.suspectName && this.fuzzyMatchInText(keyword, caseData.suspectName)) {
                    totalScore += 35;
                    matchedKeywords.push(keyword);
                    matchDetails.push(`🕵️ Suspect name (fuzzy): ${keyword}`);
                } else if (caseData.criminalName && caseData.criminalName.toLowerCase().includes(keyword)) {
                    totalScore += 45;
                    matchedKeywords.push(keyword);
                    matchDetails.push(`⚠️ Criminal name contains: ${keyword}`);
                } else if (caseData.criminalName && this.fuzzyMatchInText(keyword, caseData.criminalName)) {
                    totalScore += 35;
                    matchedKeywords.push(keyword);
                    matchDetails.push(`⚠️ Criminal name (fuzzy): ${keyword}`);
                } else if (caseData.category.toLowerCase().includes(keyword)) {
                    totalScore += 40;
                    matchedKeywords.push(keyword);
                    matchDetails.push(`🎭 Crime type: ${keyword}`);
                } else if (this.fuzzyMatchInText(keyword, caseData.category)) {
                    totalScore += 30;
                    matchedKeywords.push(keyword);
                    matchDetails.push(`🎭 Crime type (fuzzy): ${keyword}`);
                } else if (caseData.phone && caseData.phone.includes(keyword)) {
                    totalScore += 40;
                    matchedKeywords.push(keyword);
                    matchDetails.push(`📞 Phone number: ${keyword}`);
                } else if (caseData.location && caseData.location.toLowerCase().includes(keyword)) {
                    totalScore += 35;
                    matchedKeywords.push(keyword);
                    matchDetails.push(`📍 Location: ${keyword}`);
                } else if (caseData.location && this.fuzzyMatchInText(keyword, caseData.location)) {
                    totalScore += 25;
                    matchedKeywords.push(keyword);
                    matchDetails.push(`📍 Location (fuzzy): ${keyword}`);
                } else if (caseData.complaint.toLowerCase().includes(keyword)) {
                    totalScore += 30;
                    matchedKeywords.push(keyword);
                    matchDetails.push(`📝 Description contains: ${keyword}`);
                } else if (this.fuzzyMatchInText(keyword, caseData.complaint)) {
                    totalScore += 20;
                    matchedKeywords.push(keyword);
                    matchDetails.push(`📝 Description (fuzzy): ${keyword}`);
                } else if (docText.includes(keyword)) {
                    totalScore += 15;
                    matchedKeywords.push(keyword);
                    matchDetails.push(`🔍 Found in case details: ${keyword}`);
                } else if (this.fuzzyMatchInText(keyword, docText)) {
                    totalScore += 12;
                    matchedKeywords.push(keyword);
                    matchDetails.push(`🔍 Fuzzy match in case details: ${keyword}`);
                }
            }
            if (anchorCase && anchorCase.id !== caseData.id) {
                const anchorText = [anchorCase.category, anchorCase.complaint, anchorCase.location].join(' ').toLowerCase();
                const semanticScore = this.textSimilarity(anchorText, docText);
                if (semanticScore > 0.3) {
                    totalScore += Math.round(semanticScore * 40);
                    matchDetails.push(`🔗 Semantically related to case ${anchorCase.refID} (${Math.round(semanticScore * 100)}% similar)`);
                }
                const anchorKeywords = anchorText.split(/\W+/).filter(k => k.length > 3);
                const sharedKeywords = anchorKeywords.filter(k => docText.includes(k));
                if (sharedKeywords.length > 0) {
                    totalScore += Math.min(sharedKeywords.length * 8, 30);
                    matchDetails.push(`🔑 Shares keywords with case ${anchorCase.refID}: ${sharedKeywords.slice(0, 3).join(', ')}`);
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
            if (matchResult.score > 20) results.push({ case: candidate, confidence: matchResult.score, reasons: matchResult.reasons });
        }
        results.sort((a, b) => b.confidence - a.confidence);
        return results;
    }

    calculateSimilarity(case1, case2, matchType = 'hybrid') {
        const scores = [], reasons = [];
        if (case1.category && case2.category) {
            const crimeMatch = matchType === 'exact' ? (case1.category === case2.category ? 1 : 0) : this.fuzzyMatch(case1.category, case2.category);
            if (crimeMatch > 0.7) reasons.push('🎯 Same crime category');
            scores.push({ weight: 0.30, value: crimeMatch });
        }
        if (case1.complaint && case2.complaint) {
            const moSim = this.textSimilarity(case1.complaint, case2.complaint);
            if (moSim > 0.5) reasons.push('📝 Similar modus operandi');
            scores.push({ weight: 0.25, value: moSim });
        }
        const name1 = case1.victimName || case1.suspectName || '';
        const name2 = case2.victimName || case2.suspectName || '';
        if (name1 && name2) {
            const nameMatch = this.fuzzyMatch(name1, name2);
            if (nameMatch > 0.7) reasons.push('👤 Same/similar person name');
            scores.push({ weight: 0.20, value: nameMatch });
        }
        if (case1.phone && case2.phone) {
            const phoneMatch = this.fuzzyMatch(case1.phone, case2.phone);
            if (phoneMatch > 0.8) reasons.push('📞 Same phone number');
            scores.push({ weight: 0.15, value: phoneMatch });
        }
        const kw1 = (case1.complaint + ' ' + case1.category).toLowerCase().split(/\W+/);
        const kw2 = (case2.complaint + ' ' + case2.category).toLowerCase().split(/\W+/);
        const common = kw1.filter(k => kw2.includes(k) && k.length > 3);
        if (common.length > 0) {
            const kwScore = Math.min(common.length / 5, 1);
            if (kwScore > 0.3) reasons.push(`🔑 Common keywords: ${common.slice(0, 3).join(', ')}`);
            scores.push({ weight: 0.10, value: kwScore });
        }
        let total = 0, weight = 0;
        for (const s of scores) { total += s.weight * s.value; weight += s.weight; }
        return { score: Math.round((total / weight) * 100), reasons: reasons.slice(0, 4) };
    }

    loadCases(cases) { this.cases = cases; }
}

const linkingEngine = new SmartCaseLinkingEngine();

// ==================== HELPER FUNCTIONS ====================
function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>]/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[m]));
}

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

function base64ToImage(base64) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = base64;
    });
}

// ==================== FACE MATCHING FUNCTIONS ====================
async function loadFaceModels() {
    const statusDiv = document.getElementById('faceModelStatus');
    if (statusDiv) statusDiv.innerHTML = '🔄 Loading face models...';
    try {
        const MODEL_URL = 'https://raw.githubusercontent.com/justadudewhohacks/face-api.js/master/weights';
        await faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL);
        await faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL);
        await faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL);
        faceModelsLoaded = true;
        if (statusDiv) statusDiv.innerHTML = '✅ Face models ready';
        console.log('Face models loaded');
    } catch (err) {
        console.error(err);
        if (statusDiv) statusDiv.innerHTML = '❌ Face models failed';
    }
}

async function getFaceDescriptorFromImage(imgElement) {
    if (!faceModelsLoaded) throw new Error('Face models not loaded');
    const detection = await faceapi.detectSingleFace(imgElement, new faceapi.TinyFaceDetectorOptions())
        .withFaceLandmarks()
        .withFaceDescriptor();
    return detection ? detection.descriptor : null;
}

async function getFaceDescriptorFromBase64(base64) {
    const img = await base64ToImage(base64);
    return await getFaceDescriptorFromImage(img);
}

async function storeFaceDescriptor(caseId, personType, personIndex, descriptor) {
    if (!descriptor) return;
    const descriptorArray = Array.from(descriptor);
    const ref = db.collection('firs').doc(caseId);
    await ref.update({
        [`${personType}s.${personIndex}.faceDescriptor`]: descriptorArray
    });
    console.log(`Face descriptor stored for ${personType} ${personIndex} in ${caseId}`);
}

async function loadAllFaceDescriptors() {
    const snapshot = await db.collection('firs').get();
    const descriptors = [];
    for (const doc of snapshot.docs) {
        const data = doc.data();
        const caseId = doc.id;
        if (data.suspects && data.suspects.length) {
            data.suspects.forEach((suspect, idx) => {
                if (suspect.faceDescriptor && suspect.faceDescriptor.length === 128) {
                    descriptors.push({
                        descriptor: new Float32Array(suspect.faceDescriptor),
                        label: `${data.refID} - Suspect: ${suspect.name || 'Unknown'}`,
                        caseId, personType: 'suspect', personIndex: idx, name: suspect.name
                    });
                }
            });
        }
        if (data.criminals && data.criminals.length) {
            data.criminals.forEach((criminal, idx) => {
                if (criminal.faceDescriptor && criminal.faceDescriptor.length === 128) {
                    descriptors.push({
                        descriptor: new Float32Array(criminal.faceDescriptor),
                        label: `${data.refID} - Criminal: ${criminal.name || 'Unknown'}`,
                        caseId, personType: 'criminal', personIndex: idx, name: criminal.name
                    });
                }
            });
        }
    }
    return descriptors;
}

function findMatchingFaces(queryDescriptor, storedDescriptors, threshold = 50) {
    const results = [];
    for (const stored of storedDescriptors) {
        const distance = faceapi.euclideanDistance(queryDescriptor, stored.descriptor);
        const similarity = Math.max(0, Math.min(100, (1 - distance) * 100));
        if (similarity >= threshold) {
            results.push({ ...stored, similarity: Math.round(similarity), distance });
        }
    }
    results.sort((a, b) => b.similarity - a.similarity);
    return results;
}

async function matchFaceFromUpload(fileInput) {
    if (!faceModelsLoaded) { alert('Face models are still loading. Please wait.'); return; }
    const file = fileInput.files[0];
    if (!file) return;
    const modal = document.getElementById('faceMatchModal');
    const resultsDiv = document.getElementById('faceMatchResults');
    modal.style.display = 'flex';
    resultsDiv.innerHTML = '<div class="spinner"></div><p>Processing face...</p>';
    try {
        const reader = new FileReader();
        const base64 = await new Promise(resolve => { reader.onload = () => resolve(reader.result); reader.readAsDataURL(file); });
        const img = await base64ToImage(base64);
        const queryDescriptor = await getFaceDescriptorFromImage(img);
        if (!queryDescriptor) { resultsDiv.innerHTML = '<p>No face detected in the image.</p>'; return; }
        const storedDescriptors = await loadAllFaceDescriptors();
        if (storedDescriptors.length === 0) { resultsDiv.innerHTML = '<p>No face data in database. Upload suspect/criminal photos first.</p>'; return; }
        const matches = findMatchingFaces(queryDescriptor, storedDescriptors, 50);
        if (matches.length === 0) { resultsDiv.innerHTML = '<p>No matching faces found.</p>'; return; }
        let html = `<h4>Top ${Math.min(matches.length, 10)} Matches:</h4><ul style="list-style:none; padding:0;">`;
        matches.slice(0, 10).forEach(m => {
            html += `<li style="margin-bottom:15px; border-bottom:1px solid #334155; padding-bottom:10px;">
                        <strong>${m.label}</strong><br>
                        Similarity: <span class="confidence-badge ${m.similarity >= 80 ? 'confidence-high' : (m.similarity >= 60 ? 'confidence-medium' : 'confidence-low')}">${m.similarity}%</span><br>
                        <button class="btn btn-primary" onclick="viewCase('${m.caseId}')">View Case</button>
                     </li>`;
        });
        html += `</ul>`;
        resultsDiv.innerHTML = html;
    } catch (err) {
        resultsDiv.innerHTML = `<p style="color:#ef4444;">Error: ${err.message}</p>`;
    }
}

window.viewCase = function(caseId) {
    closeFaceMatchModal();
    const caseData = allCases.find(c => c.id === caseId);
    if (caseData) showCaseDetails(caseId);
    else alert('Case not found');
};

function closeFaceMatchModal() { document.getElementById('faceMatchModal').style.display = 'none'; }

// ==================== LOAD ALL CASES FROM FIRESTORE ====================
async function loadAllCases() {
    const resultsDiv = document.getElementById('resultsContainer');
    resultsDiv.innerHTML = '<div class="spinner"></div><div>Loading cases...</div>';
    try {
        const snapshot = await db.collection('firs').get();
        allCases = [];
        const categories = new Set();
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
            if (data.suspects && data.suspects.length) {
                suspectNames = data.suspects.map(s => s.name).filter(n => n);
                suspectDetails = data.suspects;
            } else if (data.suspectName) suspectNames = [data.suspectName];
            let criminalNames = [], criminalDetails = [];
            if (data.criminals && data.criminals.length) {
                criminalNames = data.criminals.map(c => c.name).filter(n => n);
                criminalDetails = data.criminals;
            } else if (data.criminalDetails && data.criminalDetails.name) {
                criminalNames = [data.criminalDetails.name];
                criminalDetails = [data.criminalDetails];
            }
            let witnesses = data.witnesses || [];
            let photos = [];
            if (data.photos && data.photos.length) photos = data.photos;
            else if (data.photoURL) photos = [data.photoURL];
            else if (data.imageUrl) photos = [data.imageUrl];
            const description = data.complaint || data.incidentDescription || '';
            const location = data.location || data.incidentLocation || '';
            allCases.push({
                id: doc.id, refID: data.refID || data.refNo || doc.id.slice(0, 8),
                category: data.category || 'Unknown', complaint: description,
                victimName, victimContact, victimAddress, victimAge, victimIdProof, victimOccupation,
                suspectName: suspectNames.join(', ') || 'Unknown', suspectDetails,
                criminalName: criminalNames.join(', ') || '', criminalDetails,
                witnesses, location, date: data.date || 'Unknown',
                status: data.status || 'Pending',
                phone: victimContact || data.phone || data.contactNumber || '',
                weapon: data.weapon || '', propertySeizure: data.propertySeizure || '',
                judgement: data.judgement || '', photos, fullData: data
            });
            if (data.category) categories.add(data.category);
        }
        linkingEngine.loadCases(allCases);
        document.getElementById('totalCases').textContent = allCases.length;
        const catFilter = document.getElementById('crimeTypeFilter');
        catFilter.innerHTML = '<option value="">All Crime Types</option>';
        categories.forEach(c => { const opt = document.createElement('option'); opt.value = c; opt.textContent = c; catFilter.appendChild(opt); });
        resultsDiv.innerHTML = `<div class="empty-state"><i class="fas fa-check-circle"></i><p>${allCases.length} cases loaded. Use search to find cases.</p></div>`;
    } catch (err) {
        resultsDiv.innerHTML = `<div class="empty-state"><p style="color:#ef4444;">Error: ${err.message}</p></div>`;
    }
}

// ==================== SEARCH & DISPLAY ====================
async function universalSearch() {
    const searchTerm = document.getElementById('searchInput').value.trim();
    if (!searchTerm) { alert('Enter search term'); return; }
    const crimeFilter = document.getElementById('crimeTypeFilter').value;
    const statusFilter = document.getElementById('statusFilter').value;
    const resultsDiv = document.getElementById('resultsContainer');
    resultsDiv.innerHTML = '<div class="spinner"></div><div>Searching...</div>';
    setTimeout(() => {
        const start = performance.now();
        const results = linkingEngine.universalSearch(searchTerm, { crimeType: crimeFilter, status: statusFilter });
        const time = performance.now() - start;
        document.getElementById('processingTime').textContent = Math.round(time) + 'ms';
        document.getElementById('linkedCases').textContent = results.length;
        if (results.length) {
            const avg = results.reduce((a,b) => a + b.score, 0) / results.length;
            document.getElementById('avgConfidence').textContent = Math.round(avg) + '%';
        }
        displaySearchResults(results, searchTerm);
    }, 100);
}

function displaySearchResults(results, searchTerm) {
    const resultsDiv = document.getElementById('resultsContainer');
    if (results.length === 0) {
        resultsDiv.innerHTML = `<div class="empty-state"><i class="fas fa-search"></i><p>No matches for "${escapeHtml(searchTerm)}"</p></div>`;
        return;
    }
    const top = results[0];
    const hasSemantic = results.some(r => r.matchDetails && r.matchDetails.some(d => d.includes('semantically')));
    let html = `<div class="explanation-box"><div class="explanation-title"><i class="fas fa-search"></i> Results for "${escapeHtml(searchTerm)}" ${hasSemantic ? '<span class="semantic-badge">Semantic Matches</span>' : ''}</div><div>Found ${results.length} cases | Best: ${top.score}% relevance</div></div>`;
    html += `<div class="results-table"><table style="width:100%"><thead><tr><th style="width:30px"></th><th>Case ID</th><th>Crime Type</th><th>Victim</th><th>Status</th><th>Match %</th><th>Actions</th></tr></thead><tbody>`;
    results.forEach((r, idx) => {
        html += `<tr class="expandable-row" onclick="toggleExplanation(${idx}, '${r.case.id}', ${JSON.stringify(r.matchDetails || []).replace(/"/g, '&quot;')}, ${r.score})">
                    <td><span id="icon-${idx}" class="expand-icon"><i class="fas fa-chevron-right"></i></span></td>
                    <td><strong>${r.case.refID}</strong></td>
                    <td>${r.case.category}</td>
                    <td>${r.case.victimName}</td>
                    <td>${r.case.status}</td>
                    <td><span class="confidence-badge ${r.score >= 70 ? 'confidence-high' : (r.score >= 40 ? 'confidence-medium' : 'confidence-low')}">${r.score}%</span></td>
                    <td><button class="btn btn-primary" onclick="event.stopPropagation(); findSimilarToCase('${r.case.id}')">Find Similar</button></td>
                </tr>
                <tr id="detail-${idx}" class="detail-row"><td colspan="7" class="detail-cell"></td></tr>`;
    });
    html += `</tbody></table></div>`;
    resultsDiv.innerHTML = html;
}

function toggleExplanation(rowId, caseId, matchDetails, confidence) {
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
        let reasons = matchDetails && matchDetails.length ? matchDetails.map(r => `<li><i class="fas fa-check-circle"></i> ${r}</li>`).join('') : '<li>Match based on keyword relevance</li>';
        detailRow.innerHTML = `<td colspan="7"><div class="explanation-box"><div class="explanation-title">Explainable AI</div><div><strong>Confidence:</strong> <span class="confidence-badge ${confidence >= 70 ? 'confidence-high' : (confidence >= 40 ? 'confidence-medium' : 'confidence-low')}">${confidence}%</span></div><ul class="explanation-reasons">${reasons}</ul><div><button class="btn btn-primary" onclick="showCaseDetails('${caseId}')">View Full Case</button></div></div></td>`;
    }
}

function showCaseDetails(caseId) {
    const caseData = allCases.find(c => c.id === caseId);
    if (!caseData) return;
    const modal = document.getElementById('caseModal');
    const modalBody = document.getElementById('modalBody');
    let html = `<div class="detail-section"><h4>Case Information</h4><p><strong>ID:</strong> ${caseData.refID}</p><p><strong>Crime:</strong> ${caseData.category}</p><p><strong>Date:</strong> ${caseData.date}</p><p><strong>Status:</strong> <span class="${caseData.status === 'Pending' ? 'status-pending' : (caseData.status === 'Arrested' ? 'status-arrested' : 'status-closed')}">${caseData.status}</span></p><p><strong>Location:</strong> ${caseData.location}</p><p><strong>Description:</strong> ${caseData.complaint}</p></div>`;
    if (caseData.photos && caseData.photos.length) {
        html += `<div class="detail-section"><h4>Evidence Photos</h4><div class="photo-gallery">${caseData.photos.map(p => `<div class="photo-item" onclick="showFullscreenImage('${p}')"><img src="${p}" onerror="this.src='https://via.placeholder.com/100'"></div>`).join('')}</div></div>`;
    }
    if (caseData.fullData.victims && caseData.fullData.victims.length) {
        html += `<div class="detail-section"><h4>Victims</h4>`;
        caseData.fullData.victims.forEach(v => { html += `<div class="person-card"><div class="person-grid"><p><strong>Name:</strong> ${v.name || 'N/A'}</p><p><strong>Contact:</strong> ${v.contact || 'N/A'}</p><p><strong>Address:</strong> ${v.address || 'N/A'}</p></div></div>`; });
        html += `</div>`;
    }
    if (caseData.suspectDetails && caseData.suspectDetails.length) {
        html += `<div class="detail-section"><h4>Suspects</h4>`;
        caseData.suspectDetails.forEach(s => { html += `<div class="person-card"><div class="person-grid"><p><strong>Name:</strong> ${s.name || 'N/A'}</p><p><strong>Age:</strong> ${s.age || 'N/A'}</p><p><strong>Gender:</strong> ${s.gender || 'N/A'}</p></div></div>`; });
        html += `</div>`;
    }
    if (caseData.criminalDetails && caseData.criminalDetails.length) {
        html += `<div class="detail-section"><h4>Criminals</h4>`;
        caseData.criminalDetails.forEach(c => { html += `<div class="person-card"><div class="person-grid"><p><strong>Name:</strong> ${c.name || 'N/A'}</p><p><strong>Alias:</strong> ${c.alias || 'N/A'}</p><p><strong>Record:</strong> ${c.record || 'N/A'}</p></div></div>`; });
        html += `</div>`;
    }
    html += `<div style="margin-top:20px;"><button class="btn btn-primary" onclick="findSimilarToCase('${caseId}'); closeModal();">Find Similar Cases</button></div>`;
    modalBody.innerHTML = html;
    modal.style.display = 'flex';
}

function showFullscreenImage(url) {
    const img = document.getElementById('fullscreenImage');
    img.src = url;
    document.getElementById('fullscreenModal').style.display = 'flex';
}

function closeFullscreen() { document.getElementById('fullscreenModal').style.display = 'none'; }
function closeModal() { document.getElementById('caseModal').style.display = 'none'; }
function closeEditModal() { document.getElementById('editModal').style.display = 'none'; }

async function findSimilarToCase(caseId) {
    const target = allCases.find(c => c.id === caseId);
    if (!target) return;
    const matchType = document.getElementById('matchType').value;
    const crimeFilter = document.getElementById('crimeTypeFilter').value;
    const statusFilter = document.getElementById('statusFilter').value;
    const resultsDiv = document.getElementById('resultsContainer');
    resultsDiv.innerHTML = '<div class="spinner"></div><div>Finding similar cases...</div>';
    setTimeout(() => {
        const start = performance.now();
        const similar = linkingEngine.findSimilarCases(target, matchType, { crimeType: crimeFilter, status: statusFilter });
        const time = performance.now() - start;
        document.getElementById('processingTime').textContent = Math.round(time) + 'ms';
        document.getElementById('linkedCases').textContent = similar.length;
        if (similar.length) {
            const avg = similar.reduce((a,b) => a + b.confidence, 0) / similar.length;
            document.getElementById('avgConfidence').textContent = Math.round(avg) + '%';
        }
        displaySimilarResults(target, similar);
    }, 100);
}

function displaySimilarResults(target, results) {
    const resultsDiv = document.getElementById('resultsContainer');
    if (results.length === 0) {
        resultsDiv.innerHTML = `<div class="empty-state"><p>No similar cases found for ${target.refID}</p></div>`;
        return;
    }
    let html = `<div class="explanation-box"><div class="explanation-title"><i class="fas fa-link"></i> Cases similar to ${target.refID}</div><div>Found ${results.length} similar cases</div></div>`;
    html += `<div class="results-table"><table style="width:100%"><thead><tr><th style="width:30px"></th><th>Case ID</th><th>Crime Type</th><th>Victim</th><th>Status</th><th>Confidence</th><th>Actions</th></tr></thead><tbody>`;
    results.forEach((r, idx) => {
        html += `<tr class="expandable-row" onclick="toggleExplanation(${idx}, '${r.case.id}', ${JSON.stringify(r.reasons || []).replace(/"/g, '&quot;')}, ${r.confidence})">
                    <td><span id="icon-${idx}" class="expand-icon"><i class="fas fa-chevron-right"></i></span></td>
                    <td><strong>${r.case.refID}</strong></td>
                    <td>${r.case.category}</td>
                    <td>${r.case.victimName}</td>
                    <td>${r.case.status}</td>
                    <td><span class="confidence-badge ${r.confidence >= 70 ? 'confidence-high' : (r.confidence >= 40 ? 'confidence-medium' : 'confidence-low')}">${r.confidence}%</span></td>
                    <td><button class="btn btn-primary" onclick="event.stopPropagation(); findSimilarToCase('${r.case.id}')">Find Similar</button></td>
                </tr>
                <tr id="detail-${idx}" class="detail-row"><td colspan="7" class="detail-cell"></td></tr>`;
    });
    html += `</tbody></table></div>`;
    resultsDiv.innerHTML = html;
}

// ==================== INITIALIZATION ====================
document.getElementById('searchInput').addEventListener('keypress', (e) => { if (e.key === 'Enter') universalSearch(); });
if (sessionStorage.getItem('isLoggedIn') !== 'true') window.location.href = 'index.html';
loadAllCases();
loadFaceModels();