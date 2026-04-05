
    // Global variables
    let personData = { victims: [], witnesses: [], suspects: [], criminals: [] };
    let activeOcrEngine = 'tesseract';
    let puterReady = false;
    
    // Store geocoding results for crime hotspot mapping
    let currentCoordinates = { lat: null, lng: null };

    // Firebase Config
    const firebaseConfig = {
        apiKey: "AIzaSyBnMI6S8fig-fl8exIAt5tDz9qWWrWGHAM",
        authDomain: "crime-management-fdd43.firebaseapp.com",
        projectId: "crime-management-fdd43",
        storageBucket: "crime-management-fdd43.firebasestorage.app",
        messagingSenderId: "990509285734",
        appId: "1:990509285734:web:4798f9666ff2dea537c8a7",
        measurementId: "G-QTG266883M",
    };
    firebase.initializeApp(firebaseConfig);
    const db = firebase.firestore();
    const storage = firebase.storage();

    // Helper Functions
    function getPlural(type) {
        if (type === "witness") return "witnesses";
        return type + "s";
    }

    // Initialize Puter
    function initializePuter() {
        const statusDiv = document.getElementById('puterStatus');
        const statusText = document.getElementById('puterStatusText');
        const retryBtn = document.getElementById('retryPuterBtn');
        
        statusDiv.style.display = 'block';
        retryBtn.style.display = 'none';
        statusText.innerHTML = '⏳ Initializing Puter...';
        
        let attempts = 0;
        const maxAttempts = 20;
        
        const checkPuter = setInterval(() => {
            attempts++;
            
            if (typeof puter !== 'undefined') {
                if (puter.ai) {
                    puterReady = true;
                    statusText.innerHTML = '✅ Puter is ready! Claude AI available.';
                    statusDiv.style.backgroundColor = 'rgba(52, 211, 153, 0.2)';
                    clearInterval(checkPuter);
                } else if (attempts >= maxAttempts) {
                    statusText.innerHTML = '❌ Puter AI not available. Click retry.';
                    statusDiv.style.backgroundColor = 'rgba(239, 68, 68, 0.2)';
                    retryBtn.style.display = 'inline-block';
                    clearInterval(checkPuter);
                }
            } else if (attempts >= maxAttempts) {
                statusText.innerHTML = '❌ Puter failed to load. Click retry.';
                statusDiv.style.backgroundColor = 'rgba(239, 68, 68, 0.2)';
                retryBtn.style.display = 'inline-block';
                clearInterval(checkPuter);
            }
        }, 500);
    }

    // ============= FIXED COUNTER FUNCTION =============
    async function listenForRefNo() {
        try {
            // First, find the highest REF number in existing FIRs
            const snapshot = await db.collection("firs").get();
            let maxRef = 1000; // Start from base
            
            snapshot.forEach(doc => {
                const data = doc.data();
                const ref = data.refID || data.refNo || '';
                
                // Extract number from REF1012 format
                const match = ref.match(/REF(\d+)/);
                if (match && match[1]) {
                    const num = parseInt(match[1]);
                    if (num > maxRef) {
                        maxRef = num;
                    }
                }
            });
            
            console.log("Highest REF found:", maxRef);
            
            // Now check/update the counter document
            const counterDoc = await db.collection("settings").doc("firCounter").get();
            
            if (counterDoc.exists) {
                let lastRefNo = counterDoc.data().lastRefNo || 1000;
                
                // If counter is less than actual max, update it
                if (lastRefNo < maxRef) {
                    await db.collection("settings").doc("firCounter").update({
                        lastRefNo: maxRef
                    });
                    document.getElementById("refNo").value = "REF" + (maxRef + 1);
                } else {
                    document.getElementById("refNo").value = "REF" + (lastRefNo + 1);
                }
            } else {
                // Create counter with actual max
                await db.collection("settings").doc("firCounter").set({ 
                    lastRefNo: maxRef 
                });
                document.getElementById("refNo").value = "REF" + (maxRef + 1);
            }
        } catch (error) {
            console.error("Error setting reference number:", error);
            // Fallback - just show next number based on current time
            document.getElementById("refNo").value = "REF" + Date.now().toString().slice(-4);
        }
    }

    // DOM Content Loaded
    document.addEventListener('DOMContentLoaded', function() {
        listenForRefNo();
        setDate();
        addPerson('victim');
        updateStats();
        
        // Initialize Puter after a short delay
        setTimeout(initializePuter, 1000);
    });

    // Person Management Functions
    function updatePersonCount(type, change) {
        const counter = document.getElementById(`${type}Counter`);
        if (!counter) return;
        let currentCount = parseInt(counter.textContent);
        const newCount = currentCount + change;
        if (type === 'victim' && newCount < 1) { alert('At least 1 victim is required'); return; }
        if (newCount < 0) return;
        if (newCount > 10) { alert('Maximum 10 persons allowed per category'); return; }
        counter.textContent = newCount;
        const container = document.getElementById(`${getPlural(type)}Container`);
        if (!container) return;
        const currentCards = container.children.length;
        if (newCount > currentCards) {
            for (let i = currentCards; i < newCount; i++) addPerson(type);
        } else if (newCount < currentCards) {
            removeLastPerson(type);
        }
        updateStats();
    }

    function addPerson(type) {
        const container = document.getElementById(`${getPlural(type)}Container`);
        if (!container) return;
        const index = container.children.length;
        const personId = `${type}_${Date.now()}_${index}`;
        const card = document.createElement('div');
        card.className = `person-card ${type}`;
        card.id = personId;
        let icon, title, fields;
        switch(type) {
            case 'victim':
                icon = 'fa-user-injured'; title = 'Victim';
                fields = `<div class="person-details">
                    <div><label class="required">Full Name:</label><input type="text" class="victim-name" placeholder="Full name" required></div>
                    <div><label>Age:</label><input type="number" class="victim-age" placeholder="Age"></div>
                    <div><label>Contact:</label><input type="tel" class="victim-contact" placeholder="Contact number"></div>
                    <div><label>Address:</label><input type="text" class="victim-address" placeholder="Address"></div>
                    <div><label>ID Proof:</label><input type="text" class="victim-id" placeholder="ID proof number"></div>
                    <div><label>Occupation:</label><input type="text" class="victim-occupation" placeholder="Occupation"></div>
                </div>`; break;
            case 'witness':
                icon = 'fa-user'; title = 'Witness';
                fields = `<div class="person-details">
                    <div><label>Full Name:</label><input type="text" class="witness-name" placeholder="Full name"></div>
                    <div><label>Age:</label><input type="number" class="witness-age" placeholder="Age"></div>
                    <div><label>Contact:</label><input type="tel" class="witness-contact" placeholder="Contact number"></div>
                    <div><label>Address:</label><input type="text" class="witness-address" placeholder="Address"></div>
                    <div><label>ID Proof:</label><input type="text" class="witness-id" placeholder="ID proof number"></div>
                    <div><label>Relation to Case:</label><input type="text" class="witness-relation" placeholder="Relation to victim/incident"></div>
                    <div><label>Statement:</label><textarea class="witness-statement" placeholder="Witness statement" rows="2"></textarea></div>
                </div>`; break;
            case 'suspect':
                icon = 'fa-user-secret'; title = 'Suspect';
                fields = `<div class="person-details">
                    <div><label>Name/Alias:</label><input type="text" class="suspect-name" placeholder="Name or alias"></div>
                    <div><label>Estimated Age:</label><input type="number" class="suspect-age" placeholder="Estimated age"></div>
                    <div><label>Gender:</label><select class="suspect-gender"><option value="">Select</option><option>Male</option><option>Female</option><option>Other</option></select></div>
                    <div><label>Height:</label><input type="text" class="suspect-height" placeholder="Height"></div>
                    <div><label>Build:</label><input type="text" class="suspect-build" placeholder="Physical build"></div>
                    <div><label>Distinguishing Marks:</label><textarea class="suspect-marks" placeholder="Tattoos, scars, etc." rows="2"></textarea></div>
                    <div><label>Last Seen:</label><input type="text" class="suspect-lastseen" placeholder="Last known location"></div>
                </div>`; break;
            case 'criminal':
                icon = 'fa-skull-crosswalk'; title = 'Criminal';
                fields = `<div class="person-details">
                    <div><label>Full Name:</label><input type="text" class="criminal-name" placeholder="Full name"></div>
                    <div><label>Alias:</label><input type="text" class="criminal-alias" placeholder="Known alias"></div>
                    <div><label>Age:</label><input type="number" class="criminal-age" placeholder="Age"></div>
                    <div><label>Gender:</label><select class="criminal-gender"><option value="">Select</option><option>Male</option><option>Female</option><option>Other</option></select></div>
                    <div><label>Known Address:</label><input type="text" class="criminal-address" placeholder="Address"></div>
                    <div><label>Previous Record:</label><input type="text" class="criminal-record" placeholder="CR/FIR numbers"></div>
                    <div><label>Criminal History:</label><textarea class="criminal-history" placeholder="Known criminal history" rows="2"></textarea></div>
                </div>`; break;
        }
        card.innerHTML = `
            <div class="person-header">
                <span class="person-title"><i class="fas ${icon}"></i> ${title} #${index + 1}</span>
                <button type="button" class="remove-person" onclick="removePerson('${personId}', '${type}')"><i class="fas fa-trash"></i> Remove</button>
            </div>
            <div class="person-content">
                <div class="image-upload-container">
                    <div class="image-preview" onclick="document.getElementById('${personId}_image').click()">
                        <i class="fas fa-user"></i>
                        <span>Click to upload photo</span>
                    </div>
                    <input type="file" id="${personId}_image" accept="image/*" style="display:none" onchange="previewPersonImage(this, '${personId}')">
                    <button type="button" class="remove-image" onclick="removePersonImage('${personId}')">×</button>
                </div>
                <div class="person-details-container">${fields}</div>
            </div>`;
        container.appendChild(card);
        if (!personData[`${type}s`]) personData[`${type}s`] = [];
        personData[`${type}s`][index] = { id: personId, imageFile: null, imageUrl: null };
    }

    function removePerson(personId, type) {
        const card = document.getElementById(personId);
        if (card) { card.remove(); updatePersonDataIndices(type); updatePersonCounters(); updateStats(); }
    }

    function updatePersonDataIndices(type) {
        const container = document.getElementById(`${getPlural(type)}Container`);
        const cards = container.children;
        const typePlural = `${type}s`;
        const newData = [];
        for (let i = 0; i < cards.length; i++) {
            const card = cards[i];
            const oldData = personData[typePlural].find(p => p && p.id === card.id);
            newData[i] = oldData ? { ...oldData, id: card.id } : { id: card.id, imageFile: null, imageUrl: null };
        }
        personData[typePlural] = newData;
    }

    function removeLastPerson(type) {
        const container = document.getElementById(`${getPlural(type)}Container`);
        if (container.children.length > 0) {
            container.removeChild(container.lastChild);
            const typePlural = `${type}s`;
            if (personData[typePlural] && personData[typePlural].length > 0) personData[typePlural].pop();
        }
    }

    function updatePersonCounters() {
        const types = ['victim', 'witness', 'suspect', 'criminal'];
        types.forEach(type => {
            const container = document.getElementById(`${getPlural(type)}Container`);
            const counter = document.getElementById(`${type}Counter`);
            if (container && counter) counter.textContent = container.children.length;
        });
    }

    function updateStats() {
        document.getElementById('victimCount').textContent = document.getElementById('victimsContainer').children.length;
        document.getElementById('witnessCount').textContent = document.getElementById('witnessesContainer').children.length;
        document.getElementById('suspectCount').textContent = document.getElementById('suspectsContainer').children.length;
        document.getElementById('criminalCount').textContent = document.getElementById('criminalsContainer').children.length;
    }

    function previewPersonImage(input, personId) {
        const card = document.getElementById(personId);
        const preview = card.querySelector('.image-preview');
        const removeBtn = card.querySelector('.remove-image');
        if (input.files && input.files[0]) {
            const reader = new FileReader();
            reader.onload = function(e) {
                preview.innerHTML = `<img src="${e.target.result}" alt="Preview">`;
                removeBtn.style.display = 'flex';
                const type = personId.split('_')[0] + 's';
                const index = Array.from(card.parentNode.children).indexOf(card);
                if (!personData[type]) personData[type] = [];
                if (!personData[type][index]) personData[type][index] = {};
                personData[type][index].imageFile = input.files[0];
                personData[type][index].id = personId;
            };
            reader.readAsDataURL(input.files[0]);
        }
    }

    function removePersonImage(personId) {
        const card = document.getElementById(personId);
        const preview = card.querySelector('.image-preview');
        const imageInput = card.querySelector('input[type="file"]');
        const removeBtn = card.querySelector('.remove-image');
        preview.innerHTML = `<i class="fas fa-user"></i><span>Click to upload photo</span>`;
        imageInput.value = '';
        removeBtn.style.display = 'none';
        const type = personId.split('_')[0] + 's';
        const index = Array.from(card.parentNode.children).indexOf(card);
        if (personData[type] && personData[type][index]) personData[type][index].imageFile = null;
    }

    function collectPersonData() {
        const collectedData = { victims: [], witnesses: [], suspects: [], criminals: [] };
        const types = ['victim', 'witness', 'suspect', 'criminal'];
        types.forEach(type => {
            const container = document.getElementById(`${type}sContainer`);
            if (!container) return;
            const cards = container.children;
            for (let i = 0; i < cards.length; i++) {
                const card = cards[i];
                const personInfo = {
                    id: card.id,
                    image: (personData[`${type}s`] && personData[`${type}s`][i]) ? personData[`${type}s`][i].imageFile : null,
                    imageUrl: null
                };
                if (type === 'victim') {
                    personInfo.name = card.querySelector('.victim-name')?.value || '';
                    personInfo.age = card.querySelector('.victim-age')?.value || '';
                    personInfo.contact = card.querySelector('.victim-contact')?.value || '';
                    personInfo.address = card.querySelector('.victim-address')?.value || '';
                    personInfo.idProof = card.querySelector('.victim-id')?.value || '';
                    personInfo.occupation = card.querySelector('.victim-occupation')?.value || '';
                } else if (type === 'witness') {
                    personInfo.name = card.querySelector('.witness-name')?.value || '';
                    personInfo.age = card.querySelector('.witness-age')?.value || '';
                    personInfo.contact = card.querySelector('.witness-contact')?.value || '';
                    personInfo.address = card.querySelector('.witness-address')?.value || '';
                    personInfo.idProof = card.querySelector('.witness-id')?.value || '';
                    personInfo.relation = card.querySelector('.witness-relation')?.value || '';
                    personInfo.statement = card.querySelector('.witness-statement')?.value || '';
                } else if (type === 'suspect') {
                    personInfo.name = card.querySelector('.suspect-name')?.value || '';
                    personInfo.age = card.querySelector('.suspect-age')?.value || '';
                    personInfo.gender = card.querySelector('.suspect-gender')?.value || '';
                    personInfo.height = card.querySelector('.suspect-height')?.value || '';
                    personInfo.build = card.querySelector('.suspect-build')?.value || '';
                    personInfo.marks = card.querySelector('.suspect-marks')?.value || '';
                    personInfo.lastSeen = card.querySelector('.suspect-lastseen')?.value || '';
                } else if (type === 'criminal') {
                    personInfo.name = card.querySelector('.criminal-name')?.value || '';
                    personInfo.alias = card.querySelector('.criminal-alias')?.value || '';
                    personInfo.age = card.querySelector('.criminal-age')?.value || '';
                    personInfo.gender = card.querySelector('.criminal-gender')?.value || '';
                    personInfo.address = card.querySelector('.criminal-address')?.value || '';
                    personInfo.record = card.querySelector('.criminal-record')?.value || '';
                    personInfo.history = card.querySelector('.criminal-history')?.value || '';
                }
                collectedData[`${type}s`].push(personInfo);
            }
        });
        return collectedData;
    }

    function manageMedia(input) {
        const gallery = document.getElementById('mediaGallery');
        Array.from(input.files).forEach(file => {
            const item = document.createElement('div');
            item.className = 'evidence-item';
            let icon = 'fa-file-alt';
            if (file.type.includes('image')) icon = 'fa-image';
            if (file.type.includes('video')) icon = 'fa-video';
            if (file.type.includes('audio')) icon = 'fa-microphone';
            item.innerHTML = `<i class="fas ${icon}"></i><p>${file.name}</p>`;
            gallery.appendChild(item);
        });
    }

    async function uploadImage(file, path) {
        if (!file) return null;
        try {
            const storageRef = storage.ref();
            const imageRef = storageRef.child(path);
            await imageRef.put(file);
            return await imageRef.getDownloadURL();
        } catch (error) {
            console.error("Error uploading image:", error);
            throw error;
        }
    }

    // ============= GEOCODING FUNCTIONS FOR CRIME HOTSPOT =============
    
    async function geocodeAddress(address) {
        if (!address || address.trim() === '') {
            document.getElementById('locationStatus').innerHTML = '';
            currentCoordinates = { lat: null, lng: null };
            return;
        }

        const statusEl = document.getElementById('locationStatus');
        statusEl.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Geocoding location...';
        statusEl.className = 'location-status';

        try {
            // Using OpenStreetMap Nominatim (free, no API key required)
            const response = await fetch(
                `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}&limit=1`,
                {
                    headers: {
                        'User-Agent': 'SecureCloud-Crime-Records/1.0'
                    }
                }
            );
            
            const data = await response.json();
            
            if (data && data.length > 0) {
                currentCoordinates = {
                    lat: parseFloat(data[0].lat),
                    lng: parseFloat(data[0].lon)
                };
                
                statusEl.innerHTML = `<i class="fas fa-check-circle"></i> Location found! (${currentCoordinates.lat.toFixed(4)}, ${currentCoordinates.lng.toFixed(4)})`;
                statusEl.className = 'location-status success';
                
                console.log('Geocoded coordinates for hotspot map:', currentCoordinates);
            } else {
                currentCoordinates = { lat: null, lng: null };
                statusEl.innerHTML = '<i class="fas fa-exclamation-triangle"></i> Location not found. Please enter a more specific address for hotspot mapping.';
                statusEl.className = 'location-status error';
            }
        } catch (error) {
            console.error('Geocoding error:', error);
            currentCoordinates = { lat: null, lng: null };
            statusEl.innerHTML = '<i class="fas fa-exclamation-circle"></i> Geocoding service unavailable. Location will not appear on hotspot map.';
            statusEl.className = 'location-status error';
        }
    }

    // ============= IMAGE PREPROCESSING FOR BETTER OCR =============
    
    async function preprocessImage(file) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            
            img.onload = () => {
                // Calculate new dimensions (max 2000px width/height)
                let width = img.width;
                let height = img.height;
                const maxDimension = 2000;
                
                if (width > maxDimension || height > maxDimension) {
                    if (width > height) {
                        height = Math.round(height * (maxDimension / width));
                        width = maxDimension;
                    } else {
                        width = Math.round(width * (maxDimension / height));
                        height = maxDimension;
                    }
                }
                
                canvas.width = width;
                canvas.height = height;
                
                // Draw image
                ctx.drawImage(img, 0, 0, width, height);
                
                // Try to improve contrast for better OCR
                const imageData = ctx.getImageData(0, 0, width, height);
                const data = imageData.data;
                
                // Simple contrast enhancement
                for (let i = 0; i < data.length; i += 4) {
                    // Convert to grayscale using luminance formula
                    const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
                    
                    // Apply contrast (adjust as needed)
                    let contrast = gray;
                    if (gray < 128) {
                        contrast = Math.max(0, gray - 20);
                    } else {
                        contrast = Math.min(255, gray + 20);
                    }
                    
                    data[i] = data[i + 1] = data[i + 2] = contrast;
                }
                
                ctx.putImageData(imageData, 0, 0);
                
                // Convert to blob with high quality
                canvas.toBlob(blob => {
                    const enhancedFile = new File([blob], file.name, { type: 'image/jpeg' });
                    resolve(enhancedFile);
                }, 'image/jpeg', 0.95);
            };
            
            img.onerror = reject;
            img.src = URL.createObjectURL(file);
        });
    }

    // ============= OCR Functions =============
    
    function selectOcrEngine(engine) {
        activeOcrEngine = engine;
        document.querySelectorAll('.ocr-engine-btn').forEach(b => b.classList.remove('active'));
        document.getElementById('eng-' + engine).classList.add('active');

        const keyWrap = document.getElementById('ocrApiKeyWrap');
        const claudeWrap = document.getElementById('claudeSettingsWrap');
        
        if (engine === 'google') {
            keyWrap.style.display = 'block';
            claudeWrap.style.display = 'none';
        } else if (engine === 'claude') {
            keyWrap.style.display = 'none';
            claudeWrap.style.display = 'block';
        } else {
            keyWrap.style.display = 'none';
            claudeWrap.style.display = 'none';
        }
        
        setOcrStatus('');
    }

    function setOcrStatus(msg, type) {
        const el = document.getElementById('ocrStatusLine');
        el.textContent = msg;
        el.className = 'ocr-status-line' + (type ? ' ' + type : '');
    }

    function fileToBase64(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result.split(',')[1]);
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    }

    async function ocrTesseract(file, bar) {
        setOcrStatus('Processing with Tesseract...');
        
        const worker = await Tesseract.createWorker('eng', 1, {
            logger: m => {
                if (m.status === 'recognizing text') {
                    bar.style.width = (m.progress * 100) + '%';
                    setOcrStatus('Recognizing... ' + Math.round(m.progress * 100) + '%');
                }
            }
        });

        try {
            const { data: { text } } = await worker.recognize(file);
            return text;
        } finally {
            await worker.terminate();
        }
    }

    async function ocrGoogle(file, bar) {
        const key = document.getElementById('ocrApiKey').value.trim();
        if (!key) throw new Error('Please enter your Google Vision API key.');

        setOcrStatus('Uploading to Google Vision...');
        bar.style.width = '30%';
        
        const b64 = await fileToBase64(file);

        bar.style.width = '60%';
        setOcrStatus('Analysing handwriting...');

        const response = await fetch(`https://vision.googleapis.com/v1/images:annotate?key=${key}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                requests: [{
                    image: { content: b64 },
                    features: [{ type: 'DOCUMENT_TEXT_DETECTION' }]
                }]
            })
        });

        const data = await response.json();
        if (data.error) throw new Error(data.error.message);

        bar.style.width = '100%';
        return data.responses?.[0]?.fullTextAnnotation?.text || '';
    }

    async function ocrClaude(file, bar) {
        // Check if Puter is ready
        if (!puterReady) {
            // Try to initialize one more time
            await initializePuter();
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            if (!puterReady) {
                // Fall back to Tesseract automatically
                setOcrStatus('Puter not ready, falling back to Tesseract...', 'error');
                return await ocrTesseract(file, bar);
            }
        }

        const selectedModel = document.getElementById('claudeModel').value;
        
        setOcrStatus('Converting image...');
        bar.style.width = '20%';
        
        // Convert image to base64
        const b64 = await fileToBase64(file);

        bar.style.width = '40%';
        setOcrStatus('Connecting to Claude via Puter...');

        try {
            // Make sure puter exists
            if (typeof puter === 'undefined') {
                throw new Error('Puter is not defined');
            }

            if (!puter.ai) {
                throw new Error('Puter AI is not available');
            }

            // Very explicit prompt to ensure transcription, not analysis
            const response = await puter.ai.chat([
                {
                    role: "user",
                    content: [
                        {
                            type: "image_url",
                            image_url: {
                                url: `data:image/jpeg;base64,${b64}`
                            }
                        },
                        {
                            type: "text",
                            text: "You are an OCR engine. Your ONLY task is to transcribe any text visible in this image. Do not comment on the image quality, do not provide any analysis, do not describe what you see. If you see text, output it exactly as written. If you cannot read some parts, mark them as [unclear]. If there is absolutely no text, output 'NO_TEXT_FOUND'. Output ONLY the transcribed text, nothing else before or after."
                        }
                    ]
                }
            ]);

            bar.style.width = '80%';
            setOcrStatus('Processing response...');

            // Extract text - handle different response formats
            let extractedText = '';
            
            if (response) {
                if (response.message && response.message.content) {
                    if (Array.isArray(response.message.content)) {
                        for (const item of response.message.content) {
                            if (item && item.text) extractedText += item.text;
                            else if (typeof item === 'string') extractedText += item;
                        }
                    } else if (typeof response.message.content === 'string') {
                        extractedText = response.message.content;
                    }
                } else if (response.content) {
                    if (Array.isArray(response.content)) {
                        for (const item of response.content) {
                            if (item && item.text) extractedText += item.text;
                            else if (typeof item === 'string') extractedText += item;
                        }
                    } else if (typeof response.content === 'string') {
                        extractedText = response.content;
                    }
                } else if (response.text) {
                    extractedText = response.text;
                } else if (typeof response === 'string') {
                    extractedText = response;
                } else {
                    // If we got an object but couldn't parse, stringify it
                    extractedText = JSON.stringify(response);
                }
            }

            // Check if the response contains meta-commentary about image quality
            if (extractedText && (
                extractedText.toLowerCase().includes('image is not clear') ||
                extractedText.toLowerCase().includes('low resolution') ||
                extractedText.toLowerCase().includes('cannot read') ||
                extractedText.toLowerCase().includes('unable to transcribe') ||
                extractedText.toLowerCase().includes('cannot see') ||
                extractedText.toLowerCase().includes('no text') ||
                extractedText.toLowerCase().includes('quality') ||
                extractedText.length < 10 // Suspiciously short response
            )) {
                console.warn('Claude returned quality warning, falling back to Tesseract');
                setOcrStatus('Claude reported issues, trying Tesseract...', 'error');
                
                // Fall back to Tesseract automatically
                bar.style.width = '20%';
                const fallbackText = await ocrTesseract(file, bar);
                if (fallbackText && fallbackText.length > 10 && !fallbackText.includes('NO_TEXT_FOUND')) {
                    bar.style.width = '100%';
                    setOcrStatus('Used Tesseract fallback successfully', 'success');
                    return fallbackText;
                }
                
                // If Tesseract also fails, return a helpful message
                return '[No readable text found in image. Please try a clearer image or type manually.]';
            }

            // Check if we got the special "NO_TEXT_FOUND" response
            if (extractedText.includes('NO_TEXT_FOUND')) {
                return '[No text detected in the image]';
            }

            if (!extractedText || extractedText.trim() === '') {
                throw new Error('No text was extracted from the image');
            }

            bar.style.width = '100%';
            setOcrStatus('Transcription complete!', 'success');
            return extractedText.trim();

        } catch (error) {
            console.error('Puter error details:', error);
            
            // Try fallback to Tesseract
            setOcrStatus('Claude failed, trying Tesseract fallback...', 'error');
            
            try {
                bar.style.width = '20%';
                const fallbackText = await ocrTesseract(file, bar);
                if (fallbackText && fallbackText.length > 10) {
                    bar.style.width = '100%';
                    setOcrStatus('Used Tesseract fallback successfully', 'success');
                    return fallbackText;
                }
            } catch (fallbackError) {
                console.error('Fallback also failed:', fallbackError);
            }
            
            // Provide helpful error messages
            if (error.message.includes('sign in') || error.message.includes('auth')) {
                throw new Error('Please sign in to Puter when prompted. It\'s free!');
            } else if (error.message.includes('network')) {
                throw new Error('Network error. Please check your internet connection.');
            } else if (error.message.includes('timeout')) {
                throw new Error('Request timed out. Please try again.');
            } else {
                throw new Error(`OCR failed: ${error.message || 'Unknown error'}`);
            }
        }
    }

    async function runOCR(input) {
        const file = input.files[0];
        if (!file) return;

        const complaintArea = document.getElementById('complaint');
        const bar = document.getElementById('progressBar');
        const wrapper = document.getElementById('progressWrapper');

        wrapper.style.display = 'block';
        bar.style.width = '0%';
        complaintArea.placeholder = 'Processing...';
        complaintArea.value = '';
        setOcrStatus('');

        try {
            let text = '';
            let processedFile = file;

            // Preprocess image for Claude to improve quality
            if (activeOcrEngine === 'claude' && file.type.startsWith('image/')) {
                setOcrStatus('Preprocessing image for better quality...');
                processedFile = await preprocessImage(file);
            }

            if (activeOcrEngine === 'google') {
                text = await ocrGoogle(processedFile, bar);
            } else if (activeOcrEngine === 'claude') {
                text = await ocrClaude(processedFile, bar);
            } else {
                text = await ocrTesseract(processedFile, bar);
            }

            complaintArea.value = text;
            
            if (text && text.length > 0 && !text.includes('NO_TEXT_FOUND')) {
                setOcrStatus('✓ Text extracted successfully!', 'success');
            } else {
                setOcrStatus('⚠ No text detected in image', 'error');
            }

        } catch (err) {
            console.error('OCR Error:', err);
            setOcrStatus('Error: ' + err.message, 'error');
            
            // Show user-friendly error message
            if (err.message.includes('quality')) {
                alert('Image quality too low. Please upload a clearer image or use Tesseract OCR.');
            } else {
                alert('OCR Error: ' + err.message);
            }
        } finally {
            wrapper.style.display = 'none';
            bar.style.width = '0%';
            input.value = '';
        }
    }

    // ============= FAST BACKGROUND UPLOAD FUNCTIONS =============
    
    // Check if any images exist
    function hasImages(persons) {
        const categories = ['victims', 'witnesses', 'suspects', 'criminals'];
        for (const category of categories) {
            if (persons[category]) {
                for (const person of persons[category]) {
                    if (person && person.image) return true;
                }
            }
        }
        return false;
    }

    // Ultra-fast compression (800px max, 60% quality)
    async function compressImageFast(file) {
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = (e) => {
                const img = new Image();
                img.src = e.target.result;
                img.onload = () => {
                    let width = img.width;
                    let height = img.height;
                    const maxDimension = 800;
                    
                    if (width > maxDimension) {
                        height = Math.round(height * (maxDimension / width));
                        width = maxDimension;
                    }
                    
                    const canvas = document.createElement('canvas');
                    canvas.width = width;
                    canvas.height = height;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0, width, height);
                    
                    canvas.toBlob((blob) => {
                        const compressedFile = new File([blob], file.name, { 
                            type: 'image/jpeg',
                            lastModified: Date.now()
                        });
                        resolve(compressedFile);
                    }, 'image/jpeg', 0.6);
                };
            };
        });
    }

    // Background upload function (doesn't block user)
    async function uploadImagesInBackground(persons, refID) {
        console.log('🖼️ Starting background image upload for FIR:', refID);
        document.getElementById('bgUploadStatus').classList.add('active');
        
        try {
            const categories = ['victims', 'witnesses', 'suspects', 'criminals'];
            let uploadCount = 0;
            let totalImages = 0;
            
            // Count total images first
            for (const category of categories) {
                if (persons[category]) {
                    for (const person of persons[category]) {
                        if (person && person.image) totalImages++;
                    }
                }
            }
            
            for (const category of categories) {
                if (persons[category]) {
                    for (let i = 0; i < persons[category].length; i++) {
                        const person = persons[category][i];
                        if (person && person.image) {
                            uploadCount++;
                            console.log(`Uploading image ${uploadCount}/${totalImages} for ${category}...`);
                            
                            // Compress image (smaller = faster)
                            const compressed = await compressImageFast(person.image);
                            
                            // Upload to Firebase Storage
                            const path = `firs/${refID}/${category.slice(0, -1)}_${i}_${Date.now()}.jpg`;
                            const url = await uploadImage(compressed, path);
                            
                            // Update FIR document with image URL
                            const updatePath = `${category}.${i}.imageUrl`;
                            await db.collection("firs").doc(refID).update({
                                [updatePath]: url,
                                [`${category}.${i}.imagePending`]: false
                            });
                            
                            console.log(`✅ Image ${uploadCount}/${totalImages} uploaded successfully`);
                        }
                    }
                }
            }
            
            // Mark all images as done
            await db.collection("firs").doc(refID).update({
                imagesPending: false
            });
            
            console.log('🎉 All background images uploaded for FIR:', refID);
            document.getElementById('bgUploadStatus').classList.remove('active');
            
        } catch (error) {
            console.error('❌ Background upload failed:', error);
            document.getElementById('bgUploadStatus').innerHTML = 
                '<i class="fas fa-exclamation-triangle" style="color: #ef4444;"></i> Some images failed to upload';
            setTimeout(() => {
                document.getElementById('bgUploadStatus').classList.remove('active');
            }, 5000);
        }
    }

    // ============= VALIDATED FAST submitFIR function (OCR Optional) =============
    async function submitFIR() {
        // ===== VALIDATION: Check all required fields =====
        
        // Check category
        const category = document.getElementById("category").value;
        if (!category) {
            alert("Please select an Incident Category");
            document.getElementById("category").focus();
            return;
        }
        
        // Check incident location
        const incidentLocation = document.getElementById("incidentLocation").value.trim();
        if (!incidentLocation) {
            alert("Please enter the Incident Location");
            document.getElementById("incidentLocation").focus();
            return;
        }
        
        // Check incident description
        const incidentDescription = document.getElementById("incidentDescription").value.trim();
        if (!incidentDescription) {
            alert("Please enter an Incident Description");
            document.getElementById("incidentDescription").focus();
            return;
        }
        
        // Check victims - at least one victim
        const victimsContainer = document.getElementById('victimsContainer');
        if (victimsContainer.children.length === 0) {
            alert("At least one victim is required");
            return;
        }
        
        // Check if first victim has name (only required field for victim)
        const firstVictimName = victimsContainer.querySelector('.victim-name')?.value.trim();
        if (!firstVictimName) {
            alert("Please enter the first victim's name");
            return;
        }

        let refID = document.getElementById("refNo").value;
        const persons = collectPersonData();
        const submitBtn = document.querySelector('.btn-submit');
        const originalText = submitBtn.textContent;
        
        // Simple loading state
        submitBtn.textContent = 'Saving...';
        submitBtn.disabled = true;

        try {
            // STEP 1: Quick geocode with timeout (max 2 seconds)
            let coordinates = { lat: null, lng: null };
            if (incidentLocation) {
                try {
                    const geocodePromise = fetch(
                        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(incidentLocation)}&limit=1`,
                        { headers: { 'User-Agent': 'SecureCloud-Crime-Records/1.0' } }
                    ).then(r => r.json());
                    
                    const data = await Promise.race([
                        geocodePromise,
                        new Promise(resolve => setTimeout(() => resolve(null), 2000))
                    ]);
                    
                    if (data && data.length > 0) {
                        coordinates = {
                            lat: parseFloat(data[0].lat),
                            lng: parseFloat(data[0].lon)
                        };
                    }
                } catch (e) {
                    console.log('Geocoding timeout - continuing without coordinates');
                }
            }

            // STEP 2: Prepare FIR data WITHOUT images (complaint is optional now)
            const strip = arr => (arr || []).map(v => { 
                if (!v) return null; 
                const { image, ...rest } = v; 
                return { 
                    ...rest, 
                    imageUrl: null,
                    imagePending: image ? true : false
                }; 
            }).filter(Boolean);

            const firData = {
                refID,
                date: document.getElementById("date").value,
                category: category,
                incidentLocation: incidentLocation,
                incidentDescription: incidentDescription,
                complaint: document.getElementById("complaint").value.trim() || '', // Optional - empty string if not provided
                propertySeizure: document.getElementById("propertySeizure").value,
                victimCount: persons.victims ? persons.victims.length : 0,
                witnessCount: persons.witnesses ? persons.witnesses.length : 0,
                suspectCount: persons.suspects ? persons.suspects.length : 0,
                criminalCount: persons.criminals ? persons.criminals.length : 0,
                victims: strip(persons.victims),
                witnesses: strip(persons.witnesses),
                suspects: strip(persons.suspects),
                criminals: strip(persons.criminals),
                latitude: coordinates.lat,
                longitude: coordinates.lng,
                geocoded: coordinates.lat ? true : false,
                timestamp: firebase.firestore.FieldValue.serverTimestamp(),
                imagesPending: hasImages(persons)
            };

            // STEP 3: Save FIR data IMMEDIATELY (1 second)
            await db.collection("firs").doc(refID).set(firData);
            
            // STEP 4: Update counter
            const refNumber = parseInt(refID.replace('REF', ''));
            await db.collection("settings").doc("firCounter").set({
                lastRefNo: refNumber
            }, { merge: true });

            // STEP 5: Show success to user IMMEDIATELY
            document.getElementById("modalRef").innerText = "Ref: " + refID;
            
            let summaryText = `Victims: ${firData.victimCount}, Witnesses: ${firData.witnessCount}, Suspects: ${firData.suspectCount}, Criminals: ${firData.criminalCount}`;
            if (firData.geocoded) {
                summaryText += `\n📍 Location mapped for crime hotspot`;
            }
            document.getElementById("modalSummary").innerText = summaryText;

            if (firData.imagesPending) {
                document.getElementById("modalImages").innerHTML = '<p style="color: var(--accent-blue);"><i class="fas fa-spinner fa-spin"></i> Images are uploading in background...</p>';
            } else {
                document.getElementById("modalImages").innerHTML = '';
            }
            
            document.getElementById("resultModal").style.display = 'flex';

            // STEP 6: Upload images in background (user already sees success)
            if (firData.imagesPending) {
                uploadImagesInBackground(persons, refID);
            }

            resetForm();
            
        } catch (e) {
            console.error("Save Error:", e);
            alert("Save Error: " + e.message);
        } finally {
            submitBtn.textContent = originalText;
            submitBtn.disabled = false;
        }
    }

    function resetForm() {
        document.getElementById("firForm").reset();
        ['victimsContainer', 'witnessesContainer', 'suspectsContainer', 'criminalsContainer'].forEach(id => {
            document.getElementById(id).innerHTML = '';
        });
        document.getElementById('victimCounter').textContent = '1';
        document.getElementById('witnessCounter').textContent = '0';
        document.getElementById('suspectCounter').textContent = '0';
        document.getElementById('criminalCounter').textContent = '0';
        addPerson('victim');
        personData = { victims: [], witnesses: [], suspects: [], criminals: [] };
        document.getElementById('mediaGallery').innerHTML = '';
        setDate();
        updateStats();
        setOcrStatus('');
        selectOcrEngine('tesseract');
        
        // Reset geocoding for crime hotspot
        currentCoordinates = { lat: null, lng: null };
        document.getElementById('locationStatus').innerHTML = '';
        
        // Refresh the reference number
        listenForRefNo();
        
        // Hide background upload status
        document.getElementById('bgUploadStatus').classList.remove('active');
        document.getElementById('bgUploadStatus').innerHTML = '<i class="fas fa-spinner fa-spin"></i> Images are uploading in background...';
    }

    function closeModal() { document.getElementById("resultModal").style.display = 'none'; }
    function setDate() { document.getElementById("date").value = new Date().toLocaleDateString("en-IN"); }
