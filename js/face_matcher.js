        // Firebase Config
        const firebaseConfig = {
            apiKey: "AIzaSyBnMI6S8fig-fl8exIAt5tDz9qWWrWGHAM",
            authDomain: "crime-management-fdd43.firebaseapp.com",
            projectId: "crime-management-fdd43",
            storageBucket: "crime-management-fdd43.appspot.com",
            messagingSenderId: "990509285734",
            appId: "1:990509285734:web:4798f9666ff2dea537c8a7"
        };
        firebase.initializeApp(firebaseConfig);
        const db = firebase.firestore();

        // GLOBALS
        let allCases = [];
        let linkingEngine = null;
        let faceMatcher = [];
        let modelsLoaded = false;
        let currentUploadedBase64 = null;

        // SMART LINKING ENGINE
        class SmartCaseLinkingEngine {
            constructor() {
                this.cases = [];
                this.synonyms = {
                    'murder': ['homicide', 'killing', 'manslaughter'],
                    'theft': ['burglary', 'robbery', 'larceny', 'stealing'],
                    'cyber': ['hacking', 'online fraud', 'phishing'],
                    'assault': ['battery', 'attack', 'violence'],
                    'kidnapping': ['abduction', 'ransom', 'hostage'],
                    'fraud': ['scam', 'cheating', 'forgery'],
                    'riot': ['protest', 'unrest', 'disturbance'],
                    'car': ['vehicle', 'automobile', 'truck'],
                    'phone': ['mobile', 'smartphone'],
                    'gold': ['jewelry', 'ornament', 'necklace'],
                    'knife': ['blade', 'dagger'],
                    'gun': ['firearm', 'pistol', 'revolver']
                };
            }

            fuzzyMatch(str1, str2) {
                if (!str1 || !str2) return 0;
                str1 = str1.toLowerCase(); str2 = str2.toLowerCase();
                if (str1 === str2) return 1;
                const len1 = str1.length, len2 = str2.length;
                const matrix = Array(len1+1).fill().map(() => Array(len2+1).fill(0));
                for (let i = 0; i <= len1; i++) matrix[i][0] = i;
                for (let j = 0; j <= len2; j++) matrix[0][j] = j;
                for (let i = 1; i <= len1; i++) {
                    for (let j = 1; j <= len2; j++) {
                        const cost = str1[i-1] === str2[j-1] ? 0 : 1;
                        matrix[i][j] = Math.min(matrix[i-1][j]+1, matrix[i][j-1]+1, matrix[i-1][j-1]+cost);
                    }
                }
                const maxLen = Math.max(len1,len2);
                return 1 - (matrix[len1][len2] / maxLen);
            }

            textSimilarity(text1, text2) {
                if (!text1 || !text2) return 0;
                const words1 = text1.toLowerCase().split(/\W+/);
                const words2 = text2.toLowerCase().split(/\W+/);
                const set1 = new Set(words1), set2 = new Set(words2);
                const inter = new Set([...set1].filter(x => set2.has(x)));
                const union = new Set([...set1, ...set2]);
                return inter.size / union.size;
            }

            calculateSimilarity(case1, case2) {
                const scores = [];
                if (case1.category && case2.category) {
                    let crimeMatch = this.fuzzyMatch(case1.category, case2.category);
                    scores.push({ weight: 0.30, value: crimeMatch });
                }
                if (case1.complaint && case2.complaint) {
                    let moSim = this.textSimilarity(case1.complaint, case2.complaint);
                    scores.push({ weight: 0.25, value: moSim });
                }
                const name1 = case1.victimName || case1.suspectName || '';
                const name2 = case2.victimName || case2.suspectName || '';
                if (name1 && name2) {
                    let nameMatch = this.fuzzyMatch(name1, name2);
                    scores.push({ weight: 0.20, value: nameMatch });
                }
                let total = 0, weight = 0;
                for (let s of scores) { total += s.weight * s.value; weight += s.weight; }
                return Math.round((total / weight) * 100);
            }

            findSimilarCases(targetCase) {
                let results = [];
                for (let candidate of this.cases) {
                    if (candidate.id === targetCase.id) continue;
                    let conf = this.calculateSimilarity(targetCase, candidate);
                    if (conf > 20) results.push({ case: candidate, confidence: conf });
                }
                results.sort((a,b) => b.confidence - a.confidence);
                return results;
            }

            loadCases(cases) { this.cases = cases; }
        }

        // LOAD ALL FIRs FOR LINKING
        async function loadAllCasesForLinking() {
            try {
                const snapshot = await db.collection('firs').get();
                const cases = [];
                for (const doc of snapshot.docs) {
                    const data = doc.data();
                    let victimName = 'Unknown', victimContact = '', victimAddress = '';
                    if (data.victims && data.victims.length) {
                        victimName = data.victims[0].name || 'Unknown';
                        victimContact = data.victims[0].contact || '';
                        victimAddress = data.victims[0].address || '';
                    } else if (data.victimName) {
                        victimName = data.victimName;
                        victimContact = data.victimContact || '';
                        victimAddress = data.victimAddress || '';
                    }
                    let suspectName = '';
                    if (data.suspects && data.suspects.length) suspectName = data.suspects[0].name || '';
                    else if (data.suspectName) suspectName = data.suspectName;
                    
                    cases.push({
                        id: doc.id,
                        refID: data.refID || doc.id,
                        category: data.category || 'Unknown',
                        status: data.status || 'Pending',
                        complaint: data.complaint || data.incidentDescription || '',
                        victimName, victimContact, victimAddress,
                        suspectName,
                        incidentLocation: data.incidentLocation || '',
                        fullData: data
                    });
                }
                linkingEngine = new SmartCaseLinkingEngine();
                linkingEngine.loadCases(cases);
                allCases = cases;
            } catch (err) { console.error(err); }
        }

        // FACE MODELS
        async function loadModels() {
            const statusDiv = document.getElementById("faceModelStatus");
            try {
                statusDiv.innerHTML = "<i class='fas fa-microchip'></i> Loading models...";
                const MODEL_URL = "https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.12/model/";
                await faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL);
                await faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL);
                await faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL);
                modelsLoaded = true;
                statusDiv.innerHTML = "<i class='fas fa-check-circle'></i> Face AI Ready";
            } catch (error) {
                console.error(error);
                statusDiv.innerHTML = "<i class='fas fa-exclamation-triangle'></i> Model failed (check network)";
            }
        }

        // PRELOAD FACE DESCRIPTORS
        async function preloadDescriptors() {
            faceMatcher = [];
            const snapshot = await db.collection("firs").get();
            for (const doc of snapshot.docs) {
                const data = doc.data();
                const categories = [
                    { type: "Criminal", list: data.criminals || [] },
                    { type: "Suspect", list: data.suspects || [] },
                    { type: "Witness", list: data.witnesses || [] },
                    { type: "Victim", list: data.victims || [] }
                ];
                for (const cat of categories) {
                    for (const person of cat.list) {
                        if (person.imageBase64) {
                            try {
                                const descriptor = await getDescriptor(person.imageBase64);
                                if (descriptor) {
                                    faceMatcher.push({
                                        descriptor,
                                        caseId: doc.id,
                                        name: person.name || "Unknown",
                                        refID: data.refID || doc.id,
                                        image: person.imageBase64,
                                        personType: cat.type,
                                        fullData: data
                                    });
                                }
                            } catch(e) { console.log("Face detection failed", person.name); }
                        }
                    }
                }
            }
            console.log("Total face descriptors:", faceMatcher.length);
        }

        function base64ToImage(base64) {
            return new Promise(resolve => {
                const img = new Image();
                img.src = base64;
                img.onload = () => resolve(img);
            });
        }

        async function getDescriptor(base64) {
            const img = await base64ToImage(base64);
            const detection = await faceapi.detectSingleFace(img, new faceapi.TinyFaceDetectorOptions())
                .withFaceLandmarks()
                .withFaceDescriptor();
            return detection ? detection.descriptor : null;
        }

        // HANDLE IMAGE UPLOAD
        function handleImageUpload(input) {
            const file = input.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = (e) => {
                currentUploadedBase64 = e.target.result;
                const previewImg = document.getElementById("previewImg");
                previewImg.src = currentUploadedBase64;
                previewImg.style.display = "block";
                document.querySelector(".placeholder-icon").style.display = "none";
                document.querySelector(".image-preview-area p").style.display = "none";
            };
            reader.readAsDataURL(file);
        }

        // MATCH FACE
        async function matchFaceFromUpload() {
            if (!modelsLoaded) { alert("Models still loading. Please wait."); return; }
            if (!currentUploadedBase64) { alert("Please select an image first."); return; }
            if (faceMatcher.length === 0) {
                document.getElementById("resultsContainer").innerHTML = `
                    <div class="empty-state"><i class="fas fa-spinner fa-pulse"></i><p>Loading face database...</p></div>
                `;
                await preloadDescriptors();
            }
            
            const uploadedDescriptor = await getDescriptor(currentUploadedBase64);
            if (!uploadedDescriptor) {
                document.getElementById("resultsContainer").innerHTML = `
                    <div class="empty-state"><i class="fas fa-face-frown"></i><p>No face detected in the image</p><small>Please upload a clear frontal face image.</small></div>
                `;
                return;
            }
            
            let matches = [];
            for (let person of faceMatcher) {
                const distance = faceapi.euclideanDistance(uploadedDescriptor, person.descriptor);
                const similarity = Math.max(0, ((1 - distance) * 100)).toFixed(2);
                if (distance < 0.65) {
                    matches.push({ ...person, similarity });
                }
            }
            matches.sort((a,b) => parseFloat(b.similarity) - parseFloat(a.similarity));
            displayMatches(matches);
        }

        function displayMatches(matches) {
            const container = document.getElementById("resultsContainer");
            if (!matches || matches.length === 0) {
                container.innerHTML = `<div class="empty-state"><i class="fas fa-user-slash"></i><p>No Match Found</p></div>`;
                document.getElementById("resultCount").innerText = "0 results";
                return;
            }
            let html = "";
            matches.slice(0, 10).forEach((m, idx) => {
                html += `
                    <div class="person-card">
                        <div class="person-flex">
                            <img src="${m.image}" alt="face">
                            <div class="person-info">
                                ${idx === 0 ? `<div class="best-match"><i class="fas fa-trophy"></i> Best Match</div>` : ""}
                                <div class="badge">${m.personType}</div>
                                <p><strong>Name:</strong> ${escapeHtml(m.name)}</p>
                                <p><strong>Case ID:</strong> ${m.refID}</p>
                                <p><strong>Match:</strong> <span class="similarity">${m.similarity}%</span></p>
                                <div class="action-buttons">
                                    <button class="small-btn" onclick="showCaseDetails('${m.caseId}')"><i class="fas fa-eye"></i> View Full Details</button>
                                    <button class="small-btn" onclick="findSimilarToCase('${m.caseId}')"><i class="fas fa-link"></i> Find Similar Cases</button>
                                </div>
                            </div>
                        </div>
                    </div>
                `;
            });
            container.innerHTML = html;
            document.getElementById("resultCount").innerText = `${matches.length} matches`;
        }

        // ========== IMPROVED: SHOW FULL CASE DETAILS WITH ALL IMAGES ==========
        async function showCaseDetails(caseId) {
            const caseData = allCases.find(c => c.id === caseId);
            if (!caseData) { alert("Case not found"); return; }
            const fullData = caseData.fullData;
            
            let html = `<div class="detail-section"><h4><i class="fas fa-barcode"></i> Case Information</h4>
                        <p><strong>Case ID:</strong> ${caseData.refID}</p>
                        <p><strong>Crime Type:</strong> ${caseData.category}</p>
                        <p><strong>Status:</strong> ${caseData.status}</p>
                        <p><strong>Location:</strong> ${escapeHtml(caseData.incidentLocation || 'N/A')}</p>
                        <p><strong>Description:</strong> ${escapeHtml(caseData.complaint || 'N/A')}</p></div>`;
            
            // Helper to generate image gallery for a list of persons
            function renderPersonGallery(persons, label) {
                if (!persons || !persons.length) return '';
                let gallery = `<div class="detail-section"><h4><i class="fas fa-images"></i> ${label} Photos</h4><div class="photo-gallery">`;
                persons.forEach((p, idx) => {
                    if (p.imageBase64) {
                        gallery += `
                            <div class="photo-item" onclick="openFullscreen('${p.imageBase64}')">
                                <img src="${p.imageBase64}" alt="${label} ${idx+1}">
                                <span>${escapeHtml(p.name || label)}</span>
                            </div>
                        `;
                    }
                });
                gallery += `</div></div>`;
                return gallery;
            }
            
            // Victim photos
            if (fullData.victims && fullData.victims.length) {
                html += renderPersonGallery(fullData.victims, "Victim");
                // Also show victim details
                html += `<div class="detail-section"><h4><i class="fas fa-user-injured"></i> Victim Details</h4>`;
                fullData.victims.forEach(v => {
                    html += `<div class="person-card-small"><div class="person-grid">
                        <p><strong>Name:</strong> ${escapeHtml(v.name || 'N/A')}</p>
                        <p><strong>Age:</strong> ${v.age || 'N/A'}</p>
                        <p><strong>Contact:</strong> ${v.contact || 'N/A'}</p>
                        <p><strong>Address:</strong> ${escapeHtml(v.address || 'N/A')}</p>
                        <p><strong>ID Proof:</strong> ${escapeHtml(v.idProof || 'N/A')}</p>
                        <p><strong>Occupation:</strong> ${escapeHtml(v.occupation || 'N/A')}</p>
                    </div></div>`;
                });
                html += `</div>`;
            } else if (caseData.victimName) {
                html += `<div class="detail-section"><h4><i class="fas fa-user-injured"></i> Victim Details</h4>
                        <div class="person-card-small"><p><strong>Name:</strong> ${escapeHtml(caseData.victimName)}</p>
                        <p><strong>Contact:</strong> ${escapeHtml(caseData.victimContact)}</p>
                        <p><strong>Address:</strong> ${escapeHtml(caseData.victimAddress)}</p></div></div>`;
            }
            
            // Suspect photos and details
            if (fullData.suspects && fullData.suspects.length) {
                html += renderPersonGallery(fullData.suspects, "Suspect");
                html += `<div class="detail-section"><h4><i class="fas fa-user-secret"></i> Suspect Details</h4>`;
                fullData.suspects.forEach(s => {
                    html += `<div class="person-card-small"><div class="person-grid">
                        <p><strong>Name:</strong> ${escapeHtml(s.name || 'N/A')}</p>
                        <p><strong>Age:</strong> ${s.age || 'N/A'}</p>
                        <p><strong>Gender:</strong> ${s.gender || 'N/A'}</p>
                        <p><strong>Height:</strong> ${s.height || 'N/A'}</p>
                        <p><strong>Build:</strong> ${s.build || 'N/A'}</p>
                        <p><strong>Marks:</strong> ${escapeHtml(s.marks || 'N/A')}</p>
                        <p><strong>Last Seen:</strong> ${escapeHtml(s.lastSeen || 'N/A')}</p>
                    </div></div>`;
                });
                html += `</div>`;
            }
            
            // Criminal photos and details
            if (fullData.criminals && fullData.criminals.length) {
                html += renderPersonGallery(fullData.criminals, "Criminal");
                html += `<div class="detail-section"><h4><i class="fas fa-skull-crosswalk"></i> Criminal Details</h4>`;
                fullData.criminals.forEach(c => {
                    html += `<div class="person-card-small"><div class="person-grid">
                        <p><strong>Name:</strong> ${escapeHtml(c.name || 'N/A')}</p>
                        <p><strong>Alias:</strong> ${escapeHtml(c.alias || 'N/A')}</p>
                        <p><strong>Age:</strong> ${c.age || 'N/A'}</p>
                        <p><strong>Gender:</strong> ${c.gender || 'N/A'}</p>
                        <p><strong>Address:</strong> ${escapeHtml(c.address || 'N/A')}</p>
                        <p><strong>Previous Record:</strong> ${escapeHtml(c.record || 'N/A')}</p>
                        <p><strong>Criminal History:</strong> ${escapeHtml(c.history || 'N/A')}</p>
                    </div></div>`;
                });
                html += `</div>`;
            }
            
            // Witness photos and details
            if (fullData.witnesses && fullData.witnesses.length) {
                html += renderPersonGallery(fullData.witnesses, "Witness");
                html += `<div class="detail-section"><h4><i class="fas fa-users"></i> Witness Details</h4>`;
                fullData.witnesses.forEach(w => {
                    html += `<div class="person-card-small"><div class="person-grid">
                        <p><strong>Name:</strong> ${escapeHtml(w.name || 'N/A')}</p>
                        <p><strong>Age:</strong> ${w.age || 'N/A'}</p>
                        <p><strong>Contact:</strong> ${w.contact || 'N/A'}</p>
                        <p><strong>Address:</strong> ${escapeHtml(w.address || 'N/A')}</p>
                        <p><strong>Statement:</strong> ${escapeHtml(w.statement || 'N/A')}</p>
                    </div></div>`;
                });
                html += `</div>`;
            }
            
            // Evidence Images (if any)
            if (fullData.evidenceImages && fullData.evidenceImages.length) {
                html += `<div class="detail-section"><h4><i class="fas fa-cloud-upload-alt"></i> Evidence Images</h4><div class="photo-gallery">`;
                fullData.evidenceImages.forEach(ev => {
                    if (ev.base64) {
                        const title = ev.details ? escapeHtml(ev.details) : (ev.name || 'Evidence');
                        html += `
                            <div class="photo-item" onclick="openFullscreen('${ev.base64}')">
                                <img src="${ev.base64}" alt="Evidence">
                                <span>${title}</span>
                            </div>
                        `;
                    }
                });
                html += `</div></div>`;
            }
            
            // Property Seizure & Judgement
            if (fullData.propertySeizure) {
                html += `<div class="detail-section"><h4><i class="fas fa-box"></i> Property Seizure</h4><p>${escapeHtml(fullData.propertySeizure)}</p></div>`;
            }
            if (fullData.judgement) {
                html += `<div class="detail-section"><h4><i class="fas fa-gavel"></i> Court Judgement</h4><p>${escapeHtml(fullData.judgement)}</p></div>`;
            }
            
            document.getElementById("modalBody").innerHTML = html;
            document.getElementById("caseModal").style.display = "flex";
        }

        // SMART LINKING
        async function findSimilarToCase(caseId) {
            const targetCase = allCases.find(c => c.id === caseId);
            if (!targetCase) return;
            const similar = linkingEngine.findSimilarCases(targetCase);
            const section = document.getElementById("similarCasesSection");
            const container = document.getElementById("similarCasesContainer");
            if (similar.length === 0) {
                section.style.display = "none";
                alert("No similar cases found.");
                return;
            }
            section.style.display = "block";
            let html = "";
            similar.slice(0, 12).forEach(s => {
                html += `
                    <div class="similar-card">
                        <h4>${escapeHtml(s.case.refID)} <span style="color:var(--accent-gold);">${s.confidence}% similar</span></h4>
                        <p><strong>Category:</strong> ${s.case.category}</p>
                        <p><strong>Victim:</strong> ${s.case.victimName}</p>
                        <p><strong>Status:</strong> ${s.case.status}</p>
                        <button class="small-btn" onclick="showCaseDetails('${s.case.id}')"><i class="fas fa-eye"></i> View Details</button>
                    </div>
                `;
            });
            container.innerHTML = html;
            section.scrollIntoView({ behavior: "smooth" });
        }

        function openFullscreen(imgSrc) {
            document.getElementById("fullscreenImage").src = imgSrc;
            document.getElementById("fullscreenModal").style.display = "flex";
        }
        function closeFullscreen() { document.getElementById("fullscreenModal").style.display = "none"; }
        function closeModal() { document.getElementById("caseModal").style.display = "none"; }
        function refreshPage() {
            currentUploadedBase64 = null;
            document.getElementById("previewImg").style.display = "none";
            document.querySelector(".placeholder-icon").style.display = "block";
            document.querySelector(".image-preview-area p").style.display = "block";
            document.getElementById("resultsContainer").innerHTML = `<div class="empty-state"><i class="fas fa-search"></i><p>No matches yet</p><small>Upload a face and click "Match Face"</small></div>`;
            document.getElementById("faceInput").value = "";
            document.getElementById("similarCasesSection").style.display = "none";
            document.getElementById("resultCount").innerText = "0 results";
        }
        function escapeHtml(str) { if(!str) return ''; return str.replace(/[&<>]/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[m])); }

        // INIT
        (async function init() {
            await loadModels();
            await loadAllCasesForLinking();
        })();