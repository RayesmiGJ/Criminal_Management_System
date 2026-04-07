// Global variables
let personData = { victims: [], witnesses: [], suspects: [], criminals: [] };
let activeOcrEngine = 'tesseract';
let puterReady = false;

// Store geocoding results for crime hotspot mapping
let currentCoordinates = { lat: null, lng: null };

// Global array for evidence images (Base64 strings)
let evidenceImages = []; // each item: { base64: string, name: string }

// Firebase Config
const firebaseConfig = {
    apiKey: "AIzaSyBnMI6S8fig-fl8exIAt5tDz9qWWrWGHAM",
    authDomain: "crime-management-fdd43.firebaseapp.com",
    projectId: "crime-management-fdd43",
    storageBucket: "crime-management-fdd43.firebasestorage.app", // kept for compatibility but not used
    messagingSenderId: "990509285734",
    appId: "1:990509285734:web:4798f9666ff2dea537c8a7",
    measurementId: "G-QTG266883M",
};
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

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

async function listenForRefNo() {
    try {
        const snapshot = await db.collection("firs").get();
        let maxRef = 1000;
        
        snapshot.forEach(doc => {
            const data = doc.data();
            const ref = data.refID || data.refNo || '';
            const match = ref.match(/REF(\d+)/);
            if (match && match[1]) {
                const num = parseInt(match[1]);
                if (num > maxRef) maxRef = num;
            }
        });
        
        const counterDoc = await db.collection("settings").doc("firCounter").get();
        
        if (counterDoc.exists) {
            let lastRefNo = counterDoc.data().lastRefNo || 1000;
            if (lastRefNo < maxRef) {
                await db.collection("settings").doc("firCounter").update({ lastRefNo: maxRef });
                document.getElementById("refNo").value = "REF" + (maxRef + 1);
            } else {
                document.getElementById("refNo").value = "REF" + (lastRefNo + 1);
            }
        } else {
            await db.collection("settings").doc("firCounter").set({ lastRefNo: maxRef });
            document.getElementById("refNo").value = "REF" + (maxRef + 1);
        }
    } catch (error) {
        console.error("Error setting reference number:", error);
        document.getElementById("refNo").value = "REF" + Date.now().toString().slice(-4);
    }
}

document.addEventListener('DOMContentLoaded', function() {
    listenForRefNo();
    setDate();
    addPerson('victim');
    updateStats();
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
    personData[`${type}s`][index] = { id: personId, imageBase64: null };
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
        newData[i] = oldData ? { ...oldData, id: card.id } : { id: card.id, imageBase64: null };
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

// Compress image and return Base64 string (max 800px, quality 0.6)
async function compressImageToBase64(file) {
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
                const base64 = canvas.toDataURL('image/jpeg', 0.6);
                resolve(base64);
            };
        };
    });
}

async function previewPersonImage(input, personId) {
    const card = document.getElementById(personId);
    const preview = card.querySelector('.image-preview');
    const removeBtn = card.querySelector('.remove-image');
    if (input.files && input.files[0]) {
        try {
            const base64 = await compressImageToBase64(input.files[0]);
            preview.innerHTML = `<img src="${base64}" alt="Preview">`;
            removeBtn.style.display = 'flex';
            const type = personId.split('_')[0] + 's';
            const index = Array.from(card.parentNode.children).indexOf(card);
            if (!personData[type]) personData[type] = [];
            if (!personData[type][index]) personData[type][index] = {};
            personData[type][index].imageBase64 = base64;
            personData[type][index].id = personId;
        } catch (err) {
            console.error("Image compression failed", err);
        }
    }
}

function removePersonImage(personId) {
    const card = document.getElementById(personId);
    const preview = card.querySelector('.image-preview');
    const imageInput = card.querySelector('input[type="file"]');
    const removeBtn = card.querySelector('.remove-image');
    preview.innerHTML = `<i class="fas fa-user"></i><span>Click to upload photo</span>`;
    if (imageInput) imageInput.value = '';
    removeBtn.style.display = 'none';
    const type = personId.split('_')[0] + 's';
    const index = Array.from(card.parentNode.children).indexOf(card);
    if (personData[type] && personData[type][index]) personData[type][index].imageBase64 = null;
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
                imageBase64: (personData[`${type}s`] && personData[`${type}s`][i]) ? personData[`${type}s`][i].imageBase64 : null
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

// Evidence Management (Base64 only)
async function manageMedia(input) {
    const files = Array.from(input.files);
    const gallery = document.getElementById('mediaGallery');
    const statusDiv = document.getElementById('bgUploadStatus');
    statusDiv.style.display = 'block';
    statusDiv.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Converting evidence images to Base64...';
    
    for (const file of files) {
        if (file.type.startsWith('image/')) {
            try {
                const base64 = await compressImageToBase64(file);
                evidenceImages.push({ base64, name: file.name });
                // Display thumbnail
                const item = document.createElement('div');
                item.className = 'evidence-item';
                item.innerHTML = `<img src="${base64}" style="width:80px; height:80px; object-fit:cover; border-radius:8px;"><p>${file.name.substring(0,20)}</p><button type="button" class="remove-evidence" onclick="removeEvidenceImage('${file.name}')">✕</button>`;
                gallery.appendChild(item);
            } catch (err) {
                console.error("Evidence image conversion failed", err);
            }
        } else {
            alert(`Skipped ${file.name}: only images are supported for Base64 storage.`);
        }
    }
    statusDiv.style.display = 'none';
    input.value = '';
}

function removeEvidenceImage(name) {
    evidenceImages = evidenceImages.filter(img => img.name !== name);
    renderEvidenceGallery();
}

function renderEvidenceGallery() {
    const gallery = document.getElementById('mediaGallery');
    gallery.innerHTML = '';
    evidenceImages.forEach(img => {
        const item = document.createElement('div');
        item.className = 'evidence-item';
        item.innerHTML = `<img src="${img.base64}" style="width:80px; height:80px; object-fit:cover; border-radius:8px;"><p>${img.name.substring(0,20)}</p><button type="button" class="remove-evidence" onclick="removeEvidenceImage('${img.name}')">✕</button>`;
        gallery.appendChild(item);
    });
}

// Geocoding (unchanged)
async function geocodeAddress(address) {
    if (!address || address.trim() === '') {
        document.getElementById('locationStatus').innerHTML = '';
        currentCoordinates = { lat: null, lng: null };
        return;
    }
    const statusEl = document.getElementById('locationStatus');
    statusEl.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Geocoding location...';
    try {
        const response = await fetch(
            `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}&limit=1`,
            { headers: { 'User-Agent': 'SecureCloud-Crime-Records/1.0' } }
        );
        const data = await response.json();
        if (data && data.length > 0) {
            currentCoordinates = { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
            statusEl.innerHTML = `<i class="fas fa-check-circle"></i> Location found! (${currentCoordinates.lat.toFixed(4)}, ${currentCoordinates.lng.toFixed(4)})`;
        } else {
            currentCoordinates = { lat: null, lng: null };
            statusEl.innerHTML = '<i class="fas fa-exclamation-triangle"></i> Location not found.';
        }
    } catch (error) {
        currentCoordinates = { lat: null, lng: null };
        statusEl.innerHTML = '<i class="fas fa-exclamation-circle"></i> Geocoding error.';
    }
}

// OCR functions (unchanged – keep all original OCR code)
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
    if (!puterReady) {
        await initializePuter();
        await new Promise(resolve => setTimeout(resolve, 2000));
        if (!puterReady) {
            setOcrStatus('Puter not ready, falling back to Tesseract...', 'error');
            return await ocrTesseract(file, bar);
        }
    }
    const selectedModel = document.getElementById('claudeModel').value;
    setOcrStatus('Converting image...');
    bar.style.width = '20%';
    const b64 = await fileToBase64(file);
    bar.style.width = '40%';
    setOcrStatus('Connecting to Claude via Puter...');
    try {
        const response = await puter.ai.chat([
            {
                role: "user",
                content: [
                    { type: "image_url", image_url: { url: `data:image/jpeg;base64,${b64}` } },
                    { type: "text", text: "You are an OCR engine. Transcribe any text visible. Output ONLY the transcribed text." }
                ]
            }
        ]);
        bar.style.width = '80%';
        let extractedText = '';
        if (response?.message?.content) {
            if (Array.isArray(response.message.content)) {
                for (const item of response.message.content) if (item?.text) extractedText += item.text;
            } else if (typeof response.message.content === 'string') extractedText = response.message.content;
        } else if (response?.content) extractedText = response.content;
        else if (typeof response === 'string') extractedText = response;
        if (!extractedText || extractedText.trim() === '') throw new Error('No text extracted');
        bar.style.width = '100%';
        setOcrStatus('Transcription complete!', 'success');
        return extractedText.trim();
    } catch (error) {
        console.error('Claude OCR error:', error);
        setOcrStatus('Claude failed, trying Tesseract fallback...', 'error');
        try {
            bar.style.width = '20%';
            const fallbackText = await ocrTesseract(file, bar);
            bar.style.width = '100%';
            return fallbackText;
        } catch (fallbackError) {
            throw new Error(`OCR failed: ${error.message}`);
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
        if (activeOcrEngine === 'claude' && file.type.startsWith('image/')) {
            setOcrStatus('Preprocessing image...');
            processedFile = file;
        }
        if (activeOcrEngine === 'google') text = await ocrGoogle(processedFile, bar);
        else if (activeOcrEngine === 'claude') text = await ocrClaude(processedFile, bar);
        else text = await ocrTesseract(processedFile, bar);
        complaintArea.value = text;
        if (text && text.length > 0) setOcrStatus('✓ Text extracted successfully!', 'success');
        else setOcrStatus('⚠ No text detected', 'error');
    } catch (err) {
        setOcrStatus('Error: ' + err.message, 'error');
        alert('OCR Error: ' + err.message);
    } finally {
        wrapper.style.display = 'none';
        bar.style.width = '0%';
        input.value = '';
    }
}

// Submit FIR – store Base64 images directly in Firestore
async function submitFIR() {
    const category = document.getElementById("category").value;
    const incidentLocation = document.getElementById("incidentLocation").value.trim();
    const incidentDescription = document.getElementById("incidentDescription").value.trim();
    if (!category || !incidentLocation || !incidentDescription) {
        alert("Please fill all required fields (Category, Location, Description).");
        return;
    }
    const victimsContainer = document.getElementById('victimsContainer');
    if (victimsContainer.children.length === 0) {
        alert("At least one victim is required.");
        return;
    }
    const firstVictimName = victimsContainer.querySelector('.victim-name')?.value.trim();
    if (!firstVictimName) {
        alert("Please enter the first victim's name.");
        return;
    }

    let refID = document.getElementById("refNo").value;
    const persons = collectPersonData();
    const submitBtn = document.querySelector('.btn-submit');
    const originalText = submitBtn.textContent;
    submitBtn.textContent = 'Saving...';
    submitBtn.disabled = true;

    try {
        // Quick geocode (2 sec timeout)
        let coordinates = { lat: null, lng: null };
        if (incidentLocation) {
            try {
                const geocodePromise = fetch(
                    `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(incidentLocation)}&limit=1`,
                    { headers: { 'User-Agent': 'SecureCloud-Crime-Records/1.0' } }
                ).then(r => r.json());
                const data = await Promise.race([geocodePromise, new Promise(resolve => setTimeout(() => resolve(null), 2000))]);
                if (data && data.length > 0) {
                    coordinates = { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
                }
            } catch (e) { console.log('Geocoding timeout'); }
        }

        // Prepare FIR data with Base64 images
        const firData = {
            refID,
            date: document.getElementById("date").value,
            category,
            incidentLocation,
            incidentDescription,
            complaint: document.getElementById("complaint").value.trim() || '',
            propertySeizure: document.getElementById("propertySeizure").value,
            victimCount: persons.victims.length,
            witnessCount: persons.witnesses.length,
            suspectCount: persons.suspects.length,
            criminalCount: persons.criminals.length,
            victims: persons.victims,
            witnesses: persons.witnesses,
            suspects: persons.suspects,
            criminals: persons.criminals,
            evidenceImages: evidenceImages, // array of {base64, name}
            latitude: coordinates.lat,
            longitude: coordinates.lng,
            geocoded: !!coordinates.lat,
            timestamp: firebase.firestore.FieldValue.serverTimestamp()
        };

        // Save to Firestore
        await db.collection("firs").doc(refID).set(firData);

        // Update counter
        const refNumber = parseInt(refID.replace('REF', ''));
        await db.collection("settings").doc("firCounter").set({ lastRefNo: refNumber }, { merge: true });

        // Show success modal
        document.getElementById("modalRef").innerText = "Ref: " + refID;
        let summaryText = `Victims: ${firData.victimCount}, Witnesses: ${firData.witnessCount}, Suspects: ${firData.suspectCount}, Criminals: ${firData.criminalCount}`;
        if (firData.geocoded) summaryText += `\n📍 Location mapped for crime hotspot`;
        document.getElementById("modalSummary").innerText = summaryText;

        // Display images in modal
        const modalImagesDiv = document.getElementById("modalImages");
        modalImagesDiv.innerHTML = '';
        // Person images
        const allPersons = [...persons.victims, ...persons.witnesses, ...persons.suspects, ...persons.criminals];
        allPersons.forEach(p => {
            if (p.imageBase64) {
                const img = document.createElement('img');
                img.src = p.imageBase64;
                img.style.width = '80px'; img.style.height = '80px'; img.style.objectFit = 'cover';
                img.title = 'Person photo';
                modalImagesDiv.appendChild(img);
            }
        });
        // Evidence images
        evidenceImages.forEach(ev => {
            const img = document.createElement('img');
            img.src = ev.base64;
            img.style.width = '80px'; img.style.height = '80px'; img.style.objectFit = 'cover';
            img.title = ev.name;
            modalImagesDiv.appendChild(img);
        });
        if (modalImagesDiv.children.length === 0) modalImagesDiv.innerHTML = '<p>No images attached.</p>';

        document.getElementById("resultModal").style.display = 'flex';
        resetForm();
    } catch (e) {
        console.error("Save Error:", e);
        alert("Save Error: " + e.message);
    } finally {
        submitBtn.textContent = originalText;
        submitBtn.disabled = false;
    }
}

// ===================== RETRIEVAL FUNCTIONS =====================
async function showAllFIRs() {
    const modal = document.getElementById('retrieveModal');
    const container = document.getElementById('firListContainer');
    container.innerHTML = '<div style="text-align:center;"><i class="fas fa-spinner fa-spin"></i> Loading FIRs...</div>';
    modal.style.display = 'flex';

    try {
        const snapshot = await db.collection("firs").orderBy("timestamp", "desc").get();
        if (snapshot.empty) {
            container.innerHTML = '<p>No FIRs found.</p>';
            return;
        }

        let html = '';
        snapshot.forEach(doc => {
            const fir = doc.data();
            html += `
                <div style="border: 1px solid #334155; border-radius: 16px; margin-bottom: 20px; padding: 15px; background: #0f172a;">
                    <h4 style="color: var(--accent-gold);">${fir.refID}</h4>
                    <p><strong>Date:</strong> ${fir.date}</p>
                    <p><strong>Category:</strong> ${fir.category}</p>
                    <p><strong>Location:</strong> ${fir.incidentLocation}</p>
                    <p><strong>Description:</strong> ${fir.incidentDescription.substring(0, 100)}${fir.incidentDescription.length > 100 ? '...' : ''}</p>
                    <p><strong>Victims:</strong> ${fir.victimCount} | <strong>Witnesses:</strong> ${fir.witnessCount} | <strong>Suspects:</strong> ${fir.suspectCount} | <strong>Criminals:</strong> ${fir.criminalCount}</p>
                    <div style="margin-top: 10px;">
                        <strong>Images:</strong><br>
                        <div style="display: flex; flex-wrap: wrap; gap: 8px; margin-top: 5px;">
            `;
            // Person images
            const allPersons = [...(fir.victims || []), ...(fir.witnesses || []), ...(fir.suspects || []), ...(fir.criminals || [])];
            allPersons.forEach(p => {
                if (p.imageBase64) {
                    html += `<img src="${p.imageBase64}" style="width:60px; height:60px; object-fit:cover; border-radius:8px;" title="Person photo">`;
                }
            });
            // Evidence images
            (fir.evidenceImages || []).forEach(ev => {
                if (ev.base64) {
                    html += `<img src="${ev.base64}" style="width:60px; height:60px; object-fit:cover; border-radius:8px;" title="${ev.name}">`;
                }
            });
            if (allPersons.length === 0 && (!fir.evidenceImages || fir.evidenceImages.length === 0)) {
                html += `<span style="color:#64748b;">No images</span>`;
            }
            html += `</div></div><hr style="border-color:#334155;">`;
            html += `<button class="btn-submit" style="background: #2563eb; padding: 6px 12px; font-size: 0.8rem; margin-top: 8px;" onclick="viewFirDetails('${doc.id}')">View Full Details</button>`;
            html += `</div>`;
        });
        container.innerHTML = html;
    } catch (error) {
        console.error("Error retrieving FIRs:", error);
        container.innerHTML = '<p style="color: #ef4444;">Error loading FIRs. Check console.</p>';
    }
}

async function viewFirDetails(docId) {
    const doc = await db.collection("firs").doc(docId).get();
    if (!doc.exists) {
        alert("FIR not found");
        return;
    }
    const fir = doc.data();
    // Show details in a nested alert or a new modal – for simplicity we use a formatted alert
    let details = `FIR: ${fir.refID}\nDate: ${fir.date}\nCategory: ${fir.category}\nLocation: ${fir.incidentLocation}\nDescription: ${fir.incidentDescription}\nComplaint: ${fir.complaint || 'N/A'}\nProperty Seizure: ${fir.propertySeizure || 'N/A'}\n\nVictims:\n`;
    (fir.victims || []).forEach((v, i) => {
        details += `  ${i+1}. ${v.name || 'N/A'} (Age: ${v.age || '?'}, Contact: ${v.contact || 'N/A'})\n`;
    });
    details += `\nWitnesses:\n`;
    (fir.witnesses || []).forEach((w, i) => {
        details += `  ${i+1}. ${w.name || 'N/A'} (Relation: ${w.relation || 'N/A'})\n`;
    });
    details += `\nSuspects:\n`;
    (fir.suspects || []).forEach((s, i) => {
        details += `  ${i+1}. ${s.name || 'N/A'} (Last seen: ${s.lastSeen || 'N/A'})\n`;
    });
    details += `\nCriminals:\n`;
    (fir.criminals || []).forEach((c, i) => {
        details += `  ${i+1}. ${c.name || 'N/A'} (Record: ${c.record || 'N/A'})\n`;
    });
    alert(details);
}

function closeRetrieveModal() {
    document.getElementById('retrieveModal').style.display = 'none';
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
    evidenceImages = [];
    renderEvidenceGallery();
    setDate();
    updateStats();
    setOcrStatus('');
    selectOcrEngine('tesseract');
    currentCoordinates = { lat: null, lng: null };
    document.getElementById('locationStatus').innerHTML = '';
    listenForRefNo();
    document.getElementById('bgUploadStatus').style.display = 'none';
}

function closeModal() { document.getElementById("resultModal").style.display = 'none'; }
function setDate() { document.getElementById("date").value = new Date().toLocaleDateString("en-IN"); }