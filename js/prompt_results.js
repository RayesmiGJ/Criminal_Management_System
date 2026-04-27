    // Firebase Config
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

    const PROMPT_CACHE_KEY = 'promptCasesCache_v1';
    let allCases = [];
    let searchModel = { avgDocLength: 0, docFreq: new Map(), totalDocs: 0 };

    function escapeHtml(str) {
        if (!str) return '';
        return str.replace(/[&<>]/g, m => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;' }[m]));
    }

    function normalizeCaseData(data, id) {
        return {
            id,
            refID: data.refID || data.refNo || id,
            category: data.category || 'Unknown',
            status: data.status || 'Pending',
            incidentLocation: data.incidentLocation || data.location || 'N/A',
            incidentDescription: data.incidentDescription || data.complaint || '',
            complaint: data.complaint || '',
            victims: data.victims || [],
            suspects: data.suspects || [],
            criminals: data.criminals || [],
            witnesses: data.witnesses || [],
            propertySeizure: data.propertySeizure || '',
            judgement: data.judgement || '',
            evidenceImages: data.evidenceImages || [],
            fullData: data
        };
    }

    function buildCaseSemanticText(caseData) {
        const names = [];
        caseData.victims.forEach(v => v?.name && names.push(v.name));
        caseData.suspects.forEach(s => s?.name && names.push(s.name));
        caseData.criminals.forEach(c => c?.name && names.push(c.name));
        caseData.witnesses.forEach(w => w?.name && names.push(w.name));
        return [
            caseData.refID, caseData.category, caseData.status,
            caseData.incidentLocation, caseData.incidentDescription,
            caseData.complaint, names.join(' ')
        ].join(' ');
    }

    function normalizeText(input) {
        return String(input || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
    }

    function tokenizeText(text) {
        return normalizeText(text).split(' ').filter(t => t.length >= 2);
    }

    function buildSearchModel(cases) {
        const docFreq = new Map();
        let totalTokens = 0;
        for (const c of cases) {
            const tokens = tokenizeText(buildCaseSemanticText(c));
            totalTokens += tokens.length;
            const unique = new Set(tokens);
            for (const t of unique) docFreq.set(t, (docFreq.get(t) || 0) + 1);
        }
        searchModel = {
            avgDocLength: cases.length ? totalTokens / cases.length : 0,
            docFreq,
            totalDocs: cases.length
        };
    }

    function bm25Score(promptTokens, docTokens) {
        if (!promptTokens.length || !docTokens.length || !searchModel.totalDocs) return 0;
        const tf = new Map();
        for (const t of docTokens) tf.set(t, (tf.get(t) || 0) + 1);
        const docLen = docTokens.length;
        const k1 = 1.5, b = 0.75;
        let score = 0;
        for (const term of promptTokens) {
            const freq = tf.get(term) || 0;
            if (!freq) continue;
            const df = searchModel.docFreq.get(term) || 0;
            const idf = Math.log(1 + ((searchModel.totalDocs - df + 0.5) / (df + 0.5)));
            const numerator = freq * (k1 + 1);
            const denominator = freq + k1 * (1 - b + b * (docLen / (searchModel.avgDocLength || 1)));
            score += idf * (numerator / denominator);
        }
        return score;
    }

    function scoreCaseFromPrompt(caseData, prompt) {
        const promptTokens = tokenizeText(prompt);
        const docTokens = tokenizeText(buildCaseSemanticText(caseData));
        return bm25Score(promptTokens, docTokens);
    }

    function normalizeScores(rawScores) {
        if (!rawScores.length) return [];
        const maxScore = Math.max(...rawScores.map(r => r.rawScore));
        const minScore = Math.min(...rawScores.map(r => r.rawScore));
        const span = maxScore - minScore;
        return rawScores.map(r => ({
            caseData: r.caseData,
            score: span > 0 ? Math.round(((r.rawScore - minScore) / span) * 100) : (r.rawScore > 0 ? 100 : 0)
        }));
    }

    async function loadCases() {
        const cacheHint = document.getElementById('cacheHint');
        try {
            const cachedRaw = localStorage.getItem(PROMPT_CACHE_KEY);
            if (cachedRaw) {
                const cached = JSON.parse(cachedRaw);
                if (Array.isArray(cached.cases)) {
                    allCases = cached.cases;
                    document.getElementById('totalCases').textContent = allCases.length;
                    cacheHint.textContent = 'Loaded from cache, syncing...';
                }
            }
            const snapshot = await db.collection('firs').orderBy('timestamp', 'desc').limit(400).get();
            const fresh = [];
            snapshot.forEach(doc => fresh.push(normalizeCaseData(doc.data(), doc.id)));
            if (fresh.length) {
                allCases = fresh;
                buildSearchModel(allCases);
                document.getElementById('totalCases').textContent = allCases.length;
                localStorage.setItem(PROMPT_CACHE_KEY, JSON.stringify({ savedAt: Date.now(), cases: allCases }));
                cacheHint.textContent = 'Live data synced.';
            } else if (!allCases.length) {
                buildSearchModel(allCases);
            }
        } catch (err) {
            console.error(err);
            if (!allCases.length) cacheHint.textContent = 'Unable to load data. Check connection.';
            else buildSearchModel(allCases);
        }
    }

    // Show full case details in modal (with all images)
    function showCaseDetails(caseId) {
        const caseData = allCases.find(c => c.id === caseId);
        if (!caseData) { alert("Case not found"); return; }
        const fullData = caseData.fullData;
        
        let html = `<div class="detail-section"><h4><i class="fas fa-barcode"></i> Case Information</h4>
                    <p><strong>Case ID:</strong> ${escapeHtml(caseData.refID)}</p>
                    <p><strong>Crime Type:</strong> ${escapeHtml(caseData.category)}</p>
                    <p><strong>Status:</strong> ${caseData.status}</p>
                    <p><strong>Location:</strong> ${escapeHtml(caseData.incidentLocation)}</p>
                    <p><strong>Description:</strong> ${escapeHtml(caseData.incidentDescription || caseData.complaint || 'N/A')}</p></div>`;
        
        function renderPersonGallery(persons, label, detailFields) {
            if (!persons || !persons.length) return '';
            let gallery = `<div class="detail-section"><h4><i class="fas fa-images"></i> ${label} Photos</h4><div class="photo-gallery">`;
            persons.forEach((p, idx) => {
                if (p.imageBase64) {
                    gallery += `<div class="photo-item" onclick="openFullscreen('${p.imageBase64}')">
                        <img src="${p.imageBase64}" alt="${label} ${idx+1}">
                        <span>${escapeHtml(p.name || label)}</span>
                    </div>`;
                }
            });
            gallery += `</div></div>`;
            let details = `<div class="detail-section"><h4><i class="fas fa-user"></i> ${label} Details</h4>`;
            persons.forEach(p => {
                details += `<div class="person-card-small"><div class="person-grid">`;
                for (const [key, labelText] of Object.entries(detailFields)) {
                    const val = p[key] || 'N/A';
                    details += `<p><strong>${labelText}:</strong> ${escapeHtml(val)}</p>`;
                }
                details += `</div></div>`;
            });
            details += `</div>`;
            return gallery + details;
        }
        
        if (fullData.victims && fullData.victims.length) {
            html += renderPersonGallery(fullData.victims, "Victim", {
                name: "Name", age: "Age", contact: "Contact", address: "Address",
                idProof: "ID Proof", occupation: "Occupation"
            });
        }
        if (fullData.suspects && fullData.suspects.length) {
            html += renderPersonGallery(fullData.suspects, "Suspect", {
                name: "Name", age: "Age", gender: "Gender", height: "Height",
                build: "Build", marks: "Marks", lastSeen: "Last Seen"
            });
        }
        if (fullData.criminals && fullData.criminals.length) {
            html += renderPersonGallery(fullData.criminals, "Criminal", {
                name: "Name", alias: "Alias", age: "Age", gender: "Gender",
                address: "Address", record: "Previous Record", history: "History"
            });
        }
        if (fullData.witnesses && fullData.witnesses.length) {
            html += renderPersonGallery(fullData.witnesses, "Witness", {
                name: "Name", age: "Age", contact: "Contact", address: "Address", statement: "Statement"
            });
        }
        if (fullData.evidenceImages && fullData.evidenceImages.length) {
            html += `<div class="detail-section"><h4><i class="fas fa-cloud-upload-alt"></i> Evidence Images</h4><div class="photo-gallery">`;
            for (const ev of fullData.evidenceImages) {
                if (ev.base64) {
                    const title = ev.details ? escapeHtml(ev.details) : (ev.name || 'Evidence');
                    html += `<div class="photo-item" onclick="openFullscreen('${ev.base64}')">
                        <img src="${ev.base64}" alt="Evidence">
                        <span>${title}</span>
                    </div>`;
                }
            }
            html += `</div></div>`;
        }
        if (fullData.propertySeizure) {
            html += `<div class="detail-section"><h4><i class="fas fa-box"></i> Property Seizure</h4><p>${escapeHtml(fullData.propertySeizure)}</p></div>`;
        }
        if (fullData.judgement) {
            html += `<div class="detail-section"><h4><i class="fas fa-gavel"></i> Court Judgement</h4><p>${escapeHtml(fullData.judgement)}</p></div>`;
        }
        
        document.getElementById('modalBody').innerHTML = html;
        document.getElementById('caseModal').style.display = 'flex';
    }

    function openFullscreen(src) {
        document.getElementById('fullscreenImage').src = src;
        document.getElementById('fullscreenModal').style.display = 'flex';
    }
    function closeFullscreen() { document.getElementById('fullscreenModal').style.display = 'none'; }
    function closeModal() { document.getElementById('caseModal').style.display = 'none'; }

    // Run search and display results with "View Details" button
    function runPromptSearch() {
        const prompt = document.getElementById('promptInput').value.trim();
        if (!prompt) { alert('Please enter a prompt first.'); return; }
        const start = performance.now();
        const rawResults = allCases.map(c => ({ caseData: c, rawScore: scoreCaseFromPrompt(c, prompt) }))
            .sort((a,b) => b.rawScore - a.rawScore);
        const results = normalizeScores(rawResults).filter(r => r.score > 0);
        const elapsed = Math.round(performance.now() - start);
        document.getElementById('processingTime').textContent = `${elapsed}ms`;
        document.getElementById('matchCount').textContent = results.length;
        
        const container = document.getElementById('resultsContainer');
        if (!results.length) {
            container.innerHTML = `<div class="empty-state">No predictive matches found for the current prompt.</div>`;
            return;
        }
        
        container.innerHTML = results.slice(0, 30).map(result => {
            const c = result.caseData;
            const snippet = escapeHtml((c.incidentDescription || c.complaint || '').slice(0, 120));
            return `
                <div class="result-card">
                    <div class="result-title">${escapeHtml(c.refID)} <span class="badge">${result.score}%</span></div>
                    <div class="result-meta">${escapeHtml(c.category)} | ${escapeHtml(c.status)}</div>
                    <div class="result-meta">${escapeHtml(c.incidentLocation)}</div>
                    <div class="result-meta">${snippet}${snippet.length === 120 ? '...' : ''}</div>
                    <button class="view-details-btn" onclick="showCaseDetails('${c.id}')"><i class="fas fa-eye"></i> View Full Details</button>
                </div>
            `;
        }).join('');
    }

    // Keyboard shortcut
    document.getElementById('promptInput').addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) runPromptSearch();
    });

    loadCases();
