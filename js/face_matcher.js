        // ==================== FIREBASE CONFIG ====================
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
        
        // ==================== GLOBALS ====================
        let allCases = [];
        let faceMatcher = [];
        let modelsLoaded = false;
        let currentUploadedBase64 = null;
        
        // ==================== HELPER: safe DOM update ====================
        function safeSetText(id, value) {
            const el = document.getElementById(id);
            if (el) el.innerText = value;
        }
        
        // ==================== LOAD MODELS (local folder "/models") ====================
        async function loadModels() {
            const statusDiv = document.getElementById("faceModelStatus");
            try {
                statusDiv.innerHTML = "<i class='fas fa-microchip'></i> Loading models...";
                const MODEL_URL = "/models";
                await faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL);
                await faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL);
                await faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL);
                modelsLoaded = true;
                statusDiv.innerHTML = "<i class='fas fa-check-circle'></i> Face AI Ready";
                console.log("Models loaded");
            } catch (error) {
                console.error(error);
                statusDiv.innerHTML = "<i class='fas fa-exclamation-triangle'></i> Model failed";
            }
        }
        
        // ==================== LOAD CASES (for search only) ====================
        async function loadCases() {
            try {
                const snapshot = await db.collection("firs").get();
                allCases = [];
                snapshot.forEach(doc => {
                    const data = doc.data();
                    allCases.push({
                        id: doc.id,
                        refID: data.refID || doc.id,
                        complaint: data.complaint || ""
                    });
                });
            } catch (error) {
                console.error("LOAD CASE ERROR:", error);
            }
        }
        
        // ==================== PRELOAD DESCRIPTORS ====================
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
                for (const category of categories) {
                    for (const person of category.list) {
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
                                        personType: category.type
                                    });
                                }
                            } catch (error) {
                                console.log("Face detection failed:", person.name);
                            }
                        }
                    }
                }
            }
            console.log("Total descriptors:", faceMatcher.length);
        }
        
        // ==================== BASE64 TO IMAGE ====================
        function base64ToImage(base64) {
            return new Promise(resolve => {
                const img = new Image();
                img.src = base64;
                img.onload = () => resolve(img);
            });
        }
        
        // ==================== GET FACE DESCRIPTOR ====================
        async function getDescriptor(base64) {
            const img = await base64ToImage(base64);
            const detection = await faceapi.detectSingleFace(img, new faceapi.TinyFaceDetectorOptions())
                .withFaceLandmarks()
                .withFaceDescriptor();
            return detection ? detection.descriptor : null;
        }
        
        // ==================== HANDLE IMAGE UPLOAD & PREVIEW ====================
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
        
        // ==================== MATCH FACE FROM UPLOADED IMAGE ====================
        async function matchFaceFromUpload() {
            if (!modelsLoaded) {
                alert("Models still loading. Please wait.");
                return;
            }
            if (!currentUploadedBase64) {
                alert("Please select an image first.");
                return;
            }
            if (faceMatcher.length === 0) {
                // Show loading indicator in results
                document.getElementById("resultsContainer").innerHTML = `
                    <div class="empty-state">
                        <i class="fas fa-spinner fa-pulse"></i>
                        <p>Loading face database...</p>
                    </div>
                `;
                await preloadDescriptors();
            }
            
            const uploadedDescriptor = await getDescriptor(currentUploadedBase64);
            if (!uploadedDescriptor) {
                showNoFaceDetected();
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
            matches.sort((a, b) => parseFloat(b.similarity) - parseFloat(a.similarity));
            displayMatches(matches);
        }
        
        function showNoFaceDetected() {
            document.getElementById("resultsContainer").innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-face-frown"></i>
                    <p>No face detected in the image</p>
                    <small>Please upload a clear frontal face image.</small>
                </div>
            `;
        }
        
        // ==================== DISPLAY MATCHES (no view button) ====================
        function displayMatches(matches) {
            const container = document.getElementById("resultsContainer");
            if (!matches || matches.length === 0) {
                container.innerHTML = `
                    <div class="empty-state">
                        <i class="fas fa-user-slash"></i>
                        <p>No Match Found</p>
                        <small>No person matched with the uploaded image.</small>
                    </div>
                `;
                return;
            }
            
            let html = "";
            matches.slice(0, 10).forEach((m, index) => {
                html += `
                    <div class="person-card">
                        <div class="person-flex">
                            <img src="${m.image}" alt="face">
                            <div class="person-info">
                                ${index === 0 ? `<div class="best-match"><i class="fas fa-trophy"></i> Best Match</div>` : ""}
                                <div class="badge">${m.personType}</div>
                                <p><strong>Name:</strong> ${m.name}</p>
                                <p><strong>Case ID:</strong> ${m.refID}</p>
                                <p><strong>Match:</strong> <span class="similarity">${m.similarity}%</span></p>
                            </div>
                        </div>
                    </div>
                `;
            });
            container.innerHTML = html;
        }
        
        // ==================== REFRESH FUNCTION ====================
        function refreshPage() {
            // Clear uploaded image
            currentUploadedBase64 = null;
            // Reset preview area
            const previewImg = document.getElementById("previewImg");
            previewImg.style.display = "none";
            previewImg.src = "";
            document.querySelector(".placeholder-icon").style.display = "block";
            document.querySelector(".image-preview-area p").style.display = "block";
            // Clear results
            document.getElementById("resultsContainer").innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-search"></i>
                    <p>No matches yet</p>
                    <small>Upload a face and click "Match Face"</small>
                </div>
            `;
            // Reset file input
            document.getElementById("faceInput").value = "";
            // Optional: reload descriptors if needed? Not necessary, keep them cached.
            console.log("Page refreshed");
        }
        
        // ==================== INIT ====================
        loadCases();
        loadModels();
        
        // Result count updater
        const observer = new MutationObserver(() => {
            const container = document.getElementById("resultsContainer");
            if (container) {
                const cards = container.querySelectorAll('.person-card');
                const countSpan = document.getElementById("resultCount");
                if (countSpan) countSpan.innerText = cards.length ? `${cards.length} matches` : '0 results';
            }
        });
        observer.observe(document.getElementById("resultsContainer"), { childList: true, subtree: true });
