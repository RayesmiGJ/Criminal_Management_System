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
    const storage = firebase.storage();

    let allCases = [];
    let expandedRow = null;

    class SmartCaseLinkingEngine {
        constructor() {
            this.cases = [];
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

        universalSearch(searchTerm, filters = {}) {
            if (!searchTerm || searchTerm.trim() === '') return [];
            
            const searchLower = searchTerm.toLowerCase().trim();
            const keywords = searchLower.split(/\s+/).filter(k => k.length > 1);
            const results = [];
            
            let anchorCase = null;
            let anchorCaseId = null;
            
            for (const keyword of keywords) {
                const refMatch = keyword.match(/(?:ref|case|fir)?[-\s]?([a-z0-9]+)/i);
                if (refMatch) {
                    anchorCaseId = keyword;
                    anchorCase = this.cases.find(c => 
                        c.refID.toLowerCase().includes(keyword) || 
                        keyword.includes(c.refID.toLowerCase())
                    );
                    if (anchorCase) break;
                }
            }
            
            for (const caseData of this.cases) {
                if (filters.crimeType && caseData.category !== filters.crimeType) continue;
                if (filters.status && caseData.status !== filters.status) continue;
                
                const docText = [
                    caseData.refID,
                    caseData.category,
                    caseData.victimName,
                    caseData.suspectName,
                    caseData.criminalName,
                    caseData.complaint,
                    caseData.phone,
                    caseData.location,
                    caseData.weapon,
                    caseData.victimContact,
                    caseData.victimAddress
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
                        matchDetails.push(`🎯 Exact Case ID match: ${keyword}`);
                    }
                    else if (caseData.refID.toLowerCase().includes(keyword)) {
                        totalScore += 60;
                        matchedKeywords.push(keyword);
                        matchDetails.push(`📋 Case ID contains: ${keyword}`);
                    }
                    else if (caseData.victimName.toLowerCase().includes(keyword)) {
                        totalScore += 45;
                        matchedKeywords.push(keyword);
                        matchDetails.push(`👤 Victim name contains: ${keyword}`);
                    }
                    else if (caseData.suspectName && caseData.suspectName.toLowerCase().includes(keyword)) {
                        totalScore += 45;
                        matchedKeywords.push(keyword);
                        matchDetails.push(`🕵️ Suspect name contains: ${keyword}`);
                    }
                    else if (caseData.criminalName && caseData.criminalName.toLowerCase().includes(keyword)) {
                        totalScore += 45;
                        matchedKeywords.push(keyword);
                        matchDetails.push(`⚠️ Criminal name contains: ${keyword}`);
                    }
                    else if (caseData.category.toLowerCase().includes(keyword)) {
                        totalScore += 40;
                        matchedKeywords.push(keyword);
                        matchDetails.push(`🎭 Crime type: ${keyword}`);
                    }
                    else if (caseData.phone && caseData.phone.includes(keyword)) {
                        totalScore += 40;
                        matchedKeywords.push(keyword);
                        matchDetails.push(`📞 Phone number: ${keyword}`);
                    }
                    else if (caseData.location && caseData.location.toLowerCase().includes(keyword)) {
                        totalScore += 35;
                        matchedKeywords.push(keyword);
                        matchDetails.push(`📍 Location: ${keyword}`);
                    }
                    else if (caseData.complaint.toLowerCase().includes(keyword)) {
                        totalScore += 30;
                        matchedKeywords.push(keyword);
                        matchDetails.push(`📝 Description contains: ${keyword}`);
                    }
                    else if (docText.includes(keyword)) {
                        totalScore += 15;
                        matchedKeywords.push(keyword);
                        matchDetails.push(`🔍 Found in case details: ${keyword}`);
                    }
                }
                
                if (anchorCase && anchorCase.id !== caseData.id) {
                    const anchorText = [
                        anchorCase.category,
                        anchorCase.complaint,
                        anchorCase.location
                    ].join(' ').toLowerCase();
                    
                    const semanticScore = this.textSimilarity(anchorText, docText);
                    
                    if (semanticScore > 0.3) {
                        const boostAmount = Math.round(semanticScore * 40);
                        totalScore += boostAmount;
                        matchDetails.push(`🔗 Semantically related to case ${anchorCase.refID} (${Math.round(semanticScore * 100)}% similar)`);
                    }
                    
                    const anchorKeywords = anchorText.split(/\W+/).filter(k => k.length > 3);
                    const sharedKeywords = anchorKeywords.filter(k => docText.includes(k));
                    
                    if (sharedKeywords.length > 0) {
                        const sharedBoost = Math.min(sharedKeywords.length * 8, 30);
                        totalScore += sharedBoost;
                        matchDetails.push(`🔑 Shares keywords with case ${anchorCase.refID}: ${sharedKeywords.slice(0, 3).join(', ')}`);
                    }
                }
                
                let finalScore = 0;
                if (matchedKeywords.length > 0 || (anchorCase && anchorCase.id !== caseData.id)) {
                    if (isExactIdMatch) {
                        finalScore = 100;
                    } else {
                        finalScore = Math.min(totalScore, 100);
                        const keywordMatchRatio = matchedKeywords.length / keywords.length;
                        if (keywordMatchRatio > 0) {
                            finalScore = Math.min(100, finalScore * (0.6 + (keywordMatchRatio * 0.4)));
                        }
                    }
                    
                    if (finalScore < 25 && matchDetails.some(d => d.includes('semantically'))) {
                        finalScore = 25;
                    }
                    
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
                    results.push({
                        case: candidate,
                        confidence: matchResult.score,
                        reasons: matchResult.reasons
                    });
                }
            }
            
            results.sort((a, b) => b.confidence - a.confidence);
            return results;
        }

        calculateSimilarity(case1, case2, matchType = 'hybrid') {
            const scores = [];
            const reasons = [];

            if (case1.category && case2.category) {
                const crimeMatch = matchType === 'exact' ? 
                    (case1.category === case2.category ? 1 : 0) :
                    this.fuzzyMatch(case1.category, case2.category);
                if (crimeMatch > 0.7) reasons.push('🎯 Same crime category');
                scores.push({ weight: 0.30, value: crimeMatch });
            }

            if (case1.complaint && case2.complaint) {
                const moSimilarity = this.textSimilarity(case1.complaint, case2.complaint);
                if (moSimilarity > 0.5) reasons.push('📝 Similar modus operandi');
                scores.push({ weight: 0.25, value: moSimilarity });
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

            const keywords1 = (case1.complaint + ' ' + case1.category).toLowerCase().split(/\W+/);
            const keywords2 = (case2.complaint + ' ' + case2.category).toLowerCase().split(/\W+/);
            const commonKeywords = keywords1.filter(k => keywords2.includes(k) && k.length > 3);
            if (commonKeywords.length > 0) {
                const keywordScore = Math.min(commonKeywords.length / 5, 1);
                if (keywordScore > 0.3) reasons.push(`🔑 Common keywords: ${commonKeywords.slice(0, 3).join(', ')}`);
                scores.push({ weight: 0.10, value: keywordScore });
            }

            let totalScore = 0;
            let totalWeight = 0;
            for (const s of scores) {
                totalScore += s.weight * s.value;
                totalWeight += s.weight;
            }
            
            const finalScore = totalWeight > 0 ? (totalScore / totalWeight) * 100 : 0;
            return {
                score: Math.round(finalScore),
                reasons: reasons.slice(0, 4)
            };
        }

        loadCases(cases) {
            this.cases = cases;
        }
    }

    const linkingEngine = new SmartCaseLinkingEngine();

    async function loadAllCases() {
        const resultsDiv = document.getElementById('resultsContainer');
        resultsDiv.innerHTML = '<div class="spinner"></div><div style="text-align:center;">Loading cases...</div>';
        
        try {
            const snapshot = await db.collection('firs').get();
            allCases = [];
            
            for (const doc of snapshot.docs) {
                const data = doc.data();
                
                let victimName = 'Unknown';
                let victimContact = '';
                let victimAddress = '';
                let victimAge = '';
                let victimIdProof = '';
                let victimOccupation = '';
                
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
                
                let suspectNames = [];
                let suspectDetails = [];
                if (data.suspects && data.suspects.length > 0) {
                    suspectNames = data.suspects.map(s => s.name).filter(n => n);
                    suspectDetails = data.suspects;
                } else if (data.suspectName) {
                    suspectNames = [data.suspectName];
                }
                
                let criminalNames = [];
                let criminalDetails = [];
                if (data.criminals && data.criminals.length > 0) {
                    criminalNames = data.criminals.map(c => c.name).filter(n => n);
                    criminalDetails = data.criminals;
                } else if (data.criminalDetails && data.criminalDetails.name) {
                    criminalNames = [data.criminalDetails.name];
                    criminalDetails = [data.criminalDetails];
                }
                
                let witnesses = data.witnesses || [];
                
                let photos = [];
                if (data.photos && data.photos.length > 0) {
                    photos = data.photos;
                } else if (data.photoURL) {
                    photos = [data.photoURL];
                } else if (data.imageUrl) {
                    photos = [data.imageUrl];
                }
                
                const description = data.complaint || data.incidentDescription || '';
                const location = data.location || data.incidentLocation || '';
                
                allCases.push({
                    id: doc.id,
                    refID: data.refID || data.refNo || doc.id.slice(0, 8),
                    category: data.category || 'Unknown',
                    complaint: description,
                    victimName: victimName,
                    victimContact: victimContact,
                    victimAddress: victimAddress,
                    victimAge: victimAge,
                    victimIdProof: victimIdProof,
                    victimOccupation: victimOccupation,
                    suspectName: suspectNames.join(', ') || 'Unknown',
                    suspectDetails: suspectDetails,
                    criminalName: criminalNames.join(', ') || '',
                    criminalDetails: criminalDetails,
                    witnesses: witnesses,
                    location: location,
                    date: data.date || 'Unknown',
                    status: data.status || 'Pending',
                    phone: victimContact || data.phone || data.contactNumber || '',
                    weapon: data.weapon || '',
                    propertySeizure: data.propertySeizure || '',
                    judgement: data.judgement || '',
                    photos: photos,
                    fullData: data
                });
            }
            
            linkingEngine.loadCases(allCases);
            document.getElementById('totalCases').textContent = allCases.length;
            
            resultsDiv.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-check-circle" style="font-size: 48px; margin-bottom: 15px; color: var(--success);"></i>
                    <p>${allCases.length} cases loaded successfully!</p>
                    <p style="font-size: 0.8rem; margin-top: 10px;">✨ Now searching across ALL case fields including victims, suspects, criminals, and photos!</p>
                </div>
            `;
            
        } catch (error) {
            console.error('Error loading cases:', error);
            resultsDiv.innerHTML = `<div class="empty-state"><p style="color: var(--danger);">Error loading cases: ${error.message}</p></div>`;
        }
    }

    function showFullscreenImage(imageUrl) {
        const fullscreenModal = document.getElementById('fullscreenModal');
        const fullscreenImage = document.getElementById('fullscreenImage');
        fullscreenImage.src = imageUrl;
        fullscreenModal.classList.add('active');
    }

    function closeFullscreen() {
        document.getElementById('fullscreenModal').classList.remove('active');
    }

    function showCaseDetails(caseId) {
        const caseData = allCases.find(c => c.id === caseId);
        if (!caseData) return;
        
        const modal = document.getElementById('caseModal');
        const modalBody = document.getElementById('modalBody');
        
        const fullData = caseData.fullData || caseData;
        
        let detailsHtml = `
            <div class="detail-section">
                <h4><i class="fas fa-barcode"></i> Case Information</h4>
                <p><strong>Case ID:</strong> ${caseData.refID}</p>
                <p><strong>Crime Type:</strong> ${caseData.category}</p>
                <p><strong>Date:</strong> ${caseData.date}</p>
                <p><strong>Status:</strong> <span class="${caseData.status === 'Pending' ? 'status-pending' : (caseData.status === 'Arrested' ? 'status-arrested' : 'status-closed')}">${caseData.status}</span></p>
                <p><strong>Location:</strong> ${caseData.location}</p>
            </div>
        `;
        
        // Photos Gallery
        if (caseData.photos && caseData.photos.length > 0) {
            detailsHtml += `
                <div class="detail-section">
                    <h4><i class="fas fa-images"></i> Case Photos / Evidence (${caseData.photos.length})</h4>
                    <div class="photo-gallery">
                        ${caseData.photos.map((photo, idx) => `
                            <div class="photo-item" onclick="showFullscreenImage('${photo}')">
                                <img src="${photo}" alt="Evidence Photo ${idx + 1}" onerror="this.src='https://via.placeholder.com/150?text=No+Image'">
                                <div class="photo-label">Evidence ${idx + 1}</div>
                            </div>
                        `).join('')}
                    </div>
                </div>
            `;
        }
        
        // Victim Details
        if (fullData.victims && fullData.victims.length > 0) {
            detailsHtml += `<div class="detail-section">
                <h4><i class="fas fa-user-injured"></i> Victim Details</h4>`;
            fullData.victims.forEach((v, i) => {
                detailsHtml += `
                    <div class="person-card">
                        <div class="person-grid">
                            <p><strong>Name:</strong> ${v.name || 'N/A'}</p>
                            <p><strong>Age:</strong> ${v.age || 'N/A'}</p>
                            <p><strong>Contact:</strong> ${v.contact || 'N/A'}</p>
                            <p><strong>Address:</strong> ${v.address || 'N/A'}</p>
                            <p><strong>ID Proof:</strong> ${v.idProof || 'N/A'}</p>
                            <p><strong>Occupation:</strong> ${v.occupation || 'N/A'}</p>
                        </div>
                    </div>
                `;
            });
            detailsHtml += `</div>`;
        } else if (caseData.victimName && caseData.victimName !== 'Unknown') {
            detailsHtml += `
                <div class="detail-section">
                    <h4><i class="fas fa-user-injured"></i> Victim Details</h4>
                    <div class="person-card">
                        <div class="person-grid">
                            <p><strong>Name:</strong> ${caseData.victimName}</p>
                            <p><strong>Contact:</strong> ${caseData.victimContact || 'N/A'}</p>
                            <p><strong>Address:</strong> ${caseData.victimAddress || 'N/A'}</p>
                            <p><strong>Age:</strong> ${caseData.victimAge || 'N/A'}</p>
                            <p><strong>ID Proof:</strong> ${caseData.victimIdProof || 'N/A'}</p>
                            <p><strong>Occupation:</strong> ${caseData.victimOccupation || 'N/A'}</p>
                        </div>
                    </div>
                </div>
            `;
        }
        
        // Suspect Details
        if (caseData.suspectDetails && caseData.suspectDetails.length > 0) {
            detailsHtml += `<div class="detail-section">
                <h4><i class="fas fa-user-secret"></i> Suspect Details</h4>`;
            caseData.suspectDetails.forEach((s, i) => {
                detailsHtml += `
                    <div class="person-card">
                        <div class="person-grid">
                            <p><strong>Name:</strong> ${s.name || 'N/A'}</p>
                            <p><strong>Age:</strong> ${s.age || 'N/A'}</p>
                            <p><strong>Gender:</strong> ${s.gender || 'N/A'}</p>
                            <p><strong>Height:</strong> ${s.height || 'N/A'}</p>
                            <p><strong>Build:</strong> ${s.build || 'N/A'}</p>
                            <p><strong>Marks:</strong> ${s.marks || 'N/A'}</p>
                            <p><strong>Last Seen:</strong> ${s.lastSeen || 'N/A'}</p>
                        </div>
                    </div>
                `;
            });
            detailsHtml += `</div>`;
        } else if (caseData.suspectName && caseData.suspectName !== 'Unknown') {
            detailsHtml += `
                <div class="detail-section">
                    <h4><i class="fas fa-user-secret"></i> Suspect Details</h4>
                    <div class="person-card">
                        <p><strong>Name:</strong> ${caseData.suspectName}</p>
                    </div>
                </div>
            `;
        }
        
        // Criminal Details
        if (caseData.criminalDetails && caseData.criminalDetails.length > 0) {
            detailsHtml += `<div class="detail-section">
                <h4><i class="fas fa-skull-crosswalk"></i> Criminal Details</h4>`;
            caseData.criminalDetails.forEach((c, i) => {
                detailsHtml += `
                    <div class="person-card">
                        <div class="person-grid">
                            <p><strong>Name:</strong> ${c.name || 'N/A'}</p>
                            <p><strong>Alias:</strong> ${c.alias || 'N/A'}</p>
                            <p><strong>Age:</strong> ${c.age || 'N/A'}</p>
                            <p><strong>Gender:</strong> ${c.gender || 'N/A'}</p>
                            <p><strong>Address:</strong> ${c.address || 'N/A'}</p>
                            <p><strong>Previous Record:</strong> ${c.record || 'N/A'}</p>
                        </div>
                    </div>
                `;
            });
            detailsHtml += `</div>`;
        } else if (caseData.criminalName && caseData.criminalName !== '') {
            detailsHtml += `
                <div class="detail-section">
                    <h4><i class="fas fa-skull-crosswalk"></i> Criminal Details</h4>
                    <div class="person-card">
                        <p><strong>Name:</strong> ${caseData.criminalName}</p>
                    </div>
                </div>
            `;
        }
        
        // Witnesses
        if (caseData.witnesses && caseData.witnesses.length > 0) {
            detailsHtml += `<div class="detail-section">
                <h4><i class="fas fa-users"></i> Witness Details</h4>`;
            caseData.witnesses.forEach((w, i) => {
                detailsHtml += `
                    <div class="person-card">
                        <div class="person-grid">
                            <p><strong>Name:</strong> ${w.name || 'N/A'}</p>
                            <p><strong>Age:</strong> ${w.age || 'N/A'}</p>
                            <p><strong>Contact:</strong> ${w.contact || 'N/A'}</p>
                            <p><strong>Address:</strong> ${w.address || 'N/A'}</p>
                            <p><strong>Statement:</strong> ${w.statement || 'N/A'}</p>
                        </div>
                    </div>
                `;
            });
            detailsHtml += `</div>`;
        }
        
        // Case Description
        detailsHtml += `
            <div class="detail-section">
                <h4><i class="fas fa-file-alt"></i> Case Description / Modus Operandi</h4>
                <p>${caseData.complaint || 'No description available'}</p>
            </div>
        `;
        
        // Property Seizure
        if (caseData.propertySeizure) {
            detailsHtml += `
                <div class="detail-section">
                    <h4><i class="fas fa-box"></i> Property Seizure</h4>
                    <p>${caseData.propertySeizure}</p>
                </div>
            `;
        }
        
        // Judgement
        if (caseData.judgement) {
            detailsHtml += `
                <div class="detail-section">
                    <h4><i class="fas fa-gavel"></i> Court Judgement</h4>
                    <p>${caseData.judgement}</p>
                </div>
            `;
        }
        
        detailsHtml += `
            <div style="margin-top: 20px; display: flex; gap: 10px; justify-content: flex-end;">
                <button class="btn" onclick="findSimilarToCase('${caseData.id}'); closeModal();">
                    <i class="fas fa-link"></i> Find Similar Cases
                </button>
                <button class="btn" style="background: linear-gradient(135deg, #10b981, #059669);" onclick="closeModal()">
                    <i class="fas fa-times"></i> Close
                </button>
            </div>
        `;
        
        modalBody.innerHTML = detailsHtml;
        modal.classList.add('active');
    }

    function closeModal() { 
        document.getElementById('caseModal').classList.remove('active'); 
    }

    async function universalSearch() {
        const searchTerm = document.getElementById('searchInput').value.trim();
        if (!searchTerm) {
            alert('Please enter a search term');
            return;
        }
        
        const crimeFilter = document.getElementById('crimeTypeFilter').value;
        const statusFilter = document.getElementById('statusFilter').value;
        
        const resultsDiv = document.getElementById('resultsContainer');
        resultsDiv.innerHTML = '<div class="spinner"></div><div style="text-align:center;">🔍 Performing semantic search across all cases...</div>';
        
        setTimeout(() => {
            const startTime = performance.now();
            
            const searchResults = linkingEngine.universalSearch(searchTerm, {
                crimeType: crimeFilter,
                status: statusFilter
            });
            
            const processingTime = performance.now() - startTime;
            document.getElementById('processingTime').textContent = Math.round(processingTime) + 'ms';
            document.getElementById('linkedCases').textContent = searchResults.length;
            
            if (searchResults.length > 0) {
                const avgConf = searchResults.reduce((a,b) => a + b.score, 0) / searchResults.length;
                document.getElementById('avgConfidence').textContent = Math.round(avgConf) + '%';
            }
            
            displaySearchResults(searchResults, searchTerm);
        }, 100);
    }

    function toggleExplanation(rowId, caseId, matchDetails, confidence, searchTerm) {
        const detailRow = document.getElementById(`detail-${rowId}`);
        const expandIcon = document.getElementById(`icon-${rowId}`);
        
        if (detailRow.classList.contains('show')) {
            detailRow.classList.remove('show');
            expandIcon.innerHTML = '<i class="fas fa-chevron-right"></i>';
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
            
            let reasonsHtml = '';
            if (matchDetails && matchDetails.length > 0) {
                reasonsHtml = matchDetails.map(r => `<li><i class="fas fa-check-circle"></i> ${r}</li>`).join('');
            } else {
                reasonsHtml = `<li><i class="fas fa-info-circle"></i> Match found based on keyword relevance</li>`;
            }
            
            detailRow.innerHTML = `
                <td colspan="7" class="detail-cell">
                    <div class="explanation-box">
                        <div class="explanation-title">
                            <i class="fas fa-brain"></i> Explainable AI - Semantic Link Analysis
                            <span class="semantic-badge">Semantic Search</span>
                        </div>
                        <div style="display: flex; gap: 20px; flex-wrap: wrap; margin-bottom: 10px;">
                            <div><strong style="color: var(--accent-gold);">Confidence Score:</strong> 
                                <span class="confidence-badge ${confidence >= 70 ? 'confidence-high' : (confidence >= 40 ? 'confidence-medium' : 'confidence-low')}">
                                    ${confidence}%
                                </span>
                            </div>
                            <div><strong style="color: var(--accent-gold);">Case ID:</strong> ${caseData.refID}</div>
                            <div><strong style="color: var(--accent-gold);">Crime Type:</strong> ${caseData.category}</div>
                        </div>
                        
                        <div style="margin-top: 10px;">
                            <strong style="color: var(--accent-blue);"><i class="fas fa-list"></i> Matching & Semantic Reasons:</strong>
                            <ul class="explanation-reasons">
                                ${reasonsHtml}
                            </ul>
                        </div>
                        
                        <div style="margin-top: 15px;">
                            <button class="btn" onclick="event.stopPropagation(); showCaseDetails('${caseId}')">
                                <i class="fas fa-eye"></i> View Full Case Details
                            </button>
                            <button class="btn btn-purple" onclick="event.stopPropagation(); findSimilarToCase('${caseId}')">
                                <i class="fas fa-link"></i> Find Similar Cases
                            </button>
                        </div>
                    </div>
                </td>
            `;
        }
    }

    function escapeHtml(str) {
        if (!str) return '';
        return str.replace(/[&<>]/g, function(m) {
            if (m === '&') return '&amp;';
            if (m === '<') return '&lt;';
            if (m === '>') return '&gt;';
            return m;
        });
    }

    function displaySearchResults(results, searchTerm) {
        const resultsDiv = document.getElementById('resultsContainer');
        
        if (results.length === 0) {
            resultsDiv.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-search" style="font-size: 48px; margin-bottom: 15px;"></i>
                    <p>No cases found matching "${escapeHtml(searchTerm)}"</p>
                    <p style="font-size: 0.8rem;">Try different keywords or remove filters</p>
                    <p style="font-size: 0.8rem; margin-top: 5px;">💡 Tip: Use multiple keywords like "John theft phone" or a full paragraph description</p>
                </div>
            `;
            return;
        }
        
        const topResult = results[0];
        const hasSemanticResults = results.some(r => r.matchDetails && r.matchDetails.some(d => d.includes('semantically')));
        
        resultsDiv.innerHTML = `
            <div class="explanation-box">
                <div class="explanation-title">
                    <i class="fas fa-search"></i> Semantic Search Results for: "${escapeHtml(searchTerm)}"
                    ${hasSemanticResults ? '<span class="semantic-badge">✨ Semantic Matches Found</span>' : ''}
                </div>
                <div style="font-size: 0.85rem; color: var(--text-dim);">
                    Found ${results.length} matching cases | Best match: ${topResult.score}% relevance
                    ${hasSemanticResults ? '<br>🔗 <strong>Including semantically related cases</strong> (cases that share concepts even without exact keywords)' : ''}
                </div>
            </div>
            
            <div class="results-table">
                <table>
                    <thead>
                        <tr>
                            <th style="width: 30px;"></th>
                            <th>Case ID</th>
                            <th>Crime Type</th>
                            <th>Victim Name</th>
                            <th>Status</th>
                            <th>Match %</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${results.map((r, idx) => `
                            <tr class="expandable-row" onclick="toggleExplanation(${idx}, '${r.case.id}', ${JSON.stringify(r.matchDetails || []).replace(/"/g, '&quot;')}, ${r.score}, '${escapeHtml(searchTerm).replace(/'/g, "\\'")}')">
                                <td><span id="icon-${idx}" class="expand-icon"><i class="fas fa-chevron-right"></i></span></td>
                                <td><strong>${r.case.refID}</strong></td>
                                <td>${r.case.category}</td>
                                <td>${r.case.victimName}</td>
                                <td>${r.case.status}</td>
                                <td>
                                    <span class="confidence-badge ${r.score >= 70 ? 'confidence-high' : (r.score >= 40 ? 'confidence-medium' : 'confidence-low')}">
                                        ${r.score}%
                                    </span>
                                </td>
                                <td>
                                    <button class="btn" onclick="event.stopPropagation(); findSimilarToCase('${r.case.id}')">
                                        <i class="fas fa-link"></i> Find Similar
                                    </button>
                                </td>
                            </tr>
                            <tr id="detail-${idx}" class="detail-row">
                                <td colspan="7" class="detail-cell"></td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;
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
            const startTime = performance.now();
            
            const similarResults = linkingEngine.findSimilarCases(targetCase, matchType, {
                crimeType: crimeFilter,
                status: statusFilter
            });
            
            const processingTime = performance.now() - startTime;
            document.getElementById('processingTime').textContent = Math.round(processingTime) + 'ms';
            document.getElementById('linkedCases').textContent = similarResults.length;
            
            if (similarResults.length > 0) {
                const avgConf = similarResults.reduce((a,b) => a + b.confidence, 0) / similarResults.length;
                document.getElementById('avgConfidence').textContent = Math.round(avgConf) + '%';
            }
            
            displaySimilarResults(targetCase, similarResults);
        }, 100);
    }

    function displaySimilarResults(targetCase, results) {
        const resultsDiv = document.getElementById('resultsContainer');
        
        if (results.length === 0) {
            resultsDiv.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-search" style="font-size: 48px; margin-bottom: 15px;"></i>
                    <p>No similar cases found for Case ${targetCase.refID}</p>
                </div>
            `;
            return;
        }
        
        resultsDiv.innerHTML = `
            <div class="explanation-box">
                <div class="explanation-title">
                    <i class="fas fa-link"></i> Cases Similar to: ${targetCase.refID} (${targetCase.category})
                </div>
                <div style="font-size: 0.85rem; color: var(--text-dim);">
                    Victim: ${targetCase.victimName} | Status: ${targetCase.status} | Found ${results.length} similar cases
                </div>
            </div>
            
            <div class="results-table">
                <table>
                    <thead>
                        <tr>
                            <th style="width: 30px;"></th>
                            <th>Case ID</th>
                            <th>Crime Type</th>
                            <th>Victim Name</th>
                            <th>Status</th>
                            <th>Confidence</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${results.map((r, idx) => `
                            <tr class="expandable-row" onclick="toggleExplanation(${idx}, '${r.case.id}', ${JSON.stringify(r.reasons || []).replace(/"/g, '&quot;')}, ${r.confidence}, '')">
                                <td><span id="icon-${idx}" class="expand-icon"><i class="fas fa-chevron-right"></i></span></td>
                                <td><strong>${r.case.refID}</strong></td>
                                <td>${r.case.category}</td>
                                <td>${r.case.victimName}</td>
                                <td>${r.case.status}</td>
                                <td>
                                    <span class="confidence-badge ${r.confidence >= 70 ? 'confidence-high' : (r.confidence >= 40 ? 'confidence-medium' : 'confidence-low')}">
                                        ${r.confidence}%
                                    </span>
                                </td>
                                <td>
                                    <button class="btn" onclick="event.stopPropagation(); findSimilarToCase('${r.case.id}')">
                                        <i class="fas fa-link"></i> Find Similar
                                    </button>
                                </td>
                            </tr>
                            <tr id="detail-${idx}" class="detail-row">
                                <td colspan="7" class="detail-cell"></td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;
    }

    document.getElementById('searchInput').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') universalSearch();
    });

    if (sessionStorage.getItem('isLoggedIn') !== 'true') {
        window.location.href = 'index.html';
    } else {
        loadAllCases();
    }
