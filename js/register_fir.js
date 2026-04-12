// Global variables
let personData = { victims: [], witnesses: [], suspects: [], criminals: [] };
let activeOcrEngine = 'ocrspace';

// Store geocoding results for crime hotspot mapping
let currentCoordinates = { lat: null, lng: null };

// Global evidence collection
let evidenceImages = []; // each item: { id, base64, name, details }
const REF_COUNTER_KEY = 'firLocalCounter_v1';
const FIR_CACHE_KEY = 'firListCache_v1';
const OCR_SPACE_API_KEY = 'K88367723088957';
const OCR_SPACE_LANGUAGE = 'auto';
const OCR_SPACE_ENGINE = '3';

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

// Best-effort local persistence for faster loads/offline reads.
db.enablePersistence({ synchronizeTabs: true }).catch(() => {});

function openImageViewer(src, caption) {
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(2,6,23,.92);display:flex;align-items:center;justify-content:center;z-index:99999;padding:16px;';
    overlay.innerHTML = `
        <div style="max-width:92vw;max-height:92vh;text-align:center;">
            <img src="${src}" alt="Evidence preview" style="max-width:92vw;max-height:84vh;border-radius:10px;box-shadow:0 10px 30px rgba(0,0,0,.5);">
            <div style="color:#e2e8f0;margin-top:10px;font-size:13px;">${caption || ''}</div>
            <button type="button" style="margin-top:10px;background:#1e293b;color:#fff;border:none;padding:8px 14px;border-radius:6px;cursor:pointer;">Close</button>
        </div>
    `;
    const closeBtn = overlay.querySelector('button');
    const close = () => overlay.remove();
    closeBtn.addEventListener('click', close);
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) close();
    });
    document.body.appendChild(overlay);
}

// Helper Functions
function getPlural(type) {
    if (type === "witness") return "witnesses";
    return type + "s";
}

function readLocalRefCounter() {
    const n = parseInt(localStorage.getItem(REF_COUNTER_KEY) || '1000', 10);
    return Number.isFinite(n) && n >= 1000 ? n : 1000;
}

function writeLocalRefCounter(value) {
    localStorage.setItem(REF_COUNTER_KEY, String(value));
}

function reserveNextRefNo() {
    const nextCounter = readLocalRefCounter() + 1;
    writeLocalRefCounter(nextCounter);
    return `REF${nextCounter}`;
}

function syncCachedFirList(firs) {
    try {
        localStorage.setItem(FIR_CACHE_KEY, JSON.stringify({ updatedAt: Date.now(), firs }));
    } catch (e) {
        console.warn('Could not cache FIR list:', e);
    }
}

async function listenForRefNo() {
    // Offline-first: always generate from local counter first, then sync upward when online.
    if (!document.getElementById("refNo").value) {
        document.getElementById("refNo").value = reserveNextRefNo();
    }

    try {
        const counterDoc = await db.collection("settings").doc("firCounter").get();
        const remoteCounter = counterDoc.exists ? (counterDoc.data().lastRefNo || 1000) : 1000;
        const localCounter = readLocalRefCounter();
        const mergedCounter = Math.max(remoteCounter, localCounter);
        if (mergedCounter !== localCounter) writeLocalRefCounter(mergedCounter);
        if (mergedCounter !== remoteCounter) {
            await db.collection("settings").doc("firCounter").set({ lastRefNo: mergedCounter }, { merge: true });
        }
        if (!document.getElementById("refNo").value) {
            document.getElementById("refNo").value = `REF${mergedCounter + 1}`;
        }
    } catch (error) {
        // No internet / permission issues: local counter is enough to stay continuous.
        console.warn("Reference counter sync unavailable, using local sequence.");
    }
}

document.addEventListener('DOMContentLoaded', function() {
    listenForRefNo();
    setDate();
    addPerson('victim');
    updateStats();
    selectOcrEngine('ocrspace');
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
                <button type="button" class="remove-image" onclick="removePersonImage('${personId}')">Ã—</button>
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

function createEvidenceItem(base64, name) {
    return {
        id: `evidence_${Date.now()}_${Math.random().toString(16).slice(2, 7)}`,
        base64,
        name: name || 'evidence-image',
        details: ''
    };
}

function normalizeEvidenceItem(item) {
    if (!item) return null;
    if (typeof item === 'string') return createEvidenceItem(item, 'legacy-image');
    return {
        id: item.id || `evidence_${Date.now()}_${Math.random().toString(16).slice(2, 7)}`,
        base64: item.base64 || '',
        name: item.name || 'evidence-image',
        details: item.details || ''
    };
}

function safeTitle(text) {
    return String(text || '').replace(/'/g, '&#39;').replace(/"/g, '&quot;');
}

function updateEvidenceDetails(id, value) {
    const evidence = evidenceImages.find(e => e.id === id);
    if (evidence) evidence.details = value;
}

// Evidence Management (Base64 only)
async function manageMedia(input) {
    const files = Array.from(input.files);
    const statusDiv = document.getElementById('bgUploadStatus');
    statusDiv.style.display = 'block';
    statusDiv.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Converting evidence images to Base64...';

    for (const file of files) {
        if (file.type.startsWith('image/')) {
            try {
                const base64 = await compressImageToBase64(file);
                evidenceImages.push(createEvidenceItem(base64, file.name));
            } catch (err) {
                console.error('Evidence image conversion failed', err);
            }
        } else {
            alert(`Skipped ${file.name}: only images are supported for Base64 storage.`);
        }
    }

    statusDiv.style.display = 'none';
    input.value = '';
    renderEvidenceGallery();
}

function removeEvidenceImage(id) {
    evidenceImages = evidenceImages.filter(img => img.id !== id);
    renderEvidenceGallery();
}

function renderEvidenceGallery() {
    const gallery = document.getElementById('mediaGallery');
    gallery.innerHTML = '';

    evidenceImages = evidenceImages.map(normalizeEvidenceItem).filter(Boolean);

    evidenceImages.forEach(img => {
        const caption = img.details ? `${img.name} - ${img.details}` : img.name;
        const item = document.createElement('div');
        item.className = 'evidence-item';
        item.innerHTML = `
            <img src="${img.base64}" style="width:100%; height:90px; object-fit:cover; border-radius:8px; cursor:pointer;" title="Click to view full image" onclick="openImageViewer('${img.base64}', '${safeTitle(caption)}')">
            <p>${(img.name || '').substring(0, 30)}</p>
            <input type="text" class="evidence-detail-input" placeholder="Add image details..." value="${(img.details || '').replace(/\"/g, '&quot;')}" oninput="updateEvidenceDetails('${img.id}', this.value)">
            <button type="button" class="remove-evidence" onclick="removeEvidenceImage('${img.id}')">×</button>
        `;
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

// OCR functions (unchanged â€“ keep all original OCR code)
function selectOcrEngine(engine) {
    activeOcrEngine = engine;
    document.querySelectorAll('.ocr-engine-btn').forEach(b => b.classList.remove('active'));
    const btn = document.getElementById('eng-' + engine);
    if (btn) btn.classList.add('active');
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

function dataUrlToBlob(dataUrl) {
    const [header, base64] = dataUrl.split(',');
    const mime = (header.match(/:(.*?);/) || [])[1] || 'image/jpeg';
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new Blob([bytes], { type: mime });
}

async function preprocessImageForOCR(file) {
    if (!file?.type?.startsWith('image/')) return file;
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d', { willReadFrequently: true });
                const maxSide = 1800;
                const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
                canvas.width = Math.max(1, Math.round(img.width * scale));
                canvas.height = Math.max(1, Math.round(img.height * scale));
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

                const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                const d = imageData.data;

                // Gentle contrast + grayscale (avoid over-binarizing, which can scramble handwriting).
                for (let i = 0; i < d.length; i += 4) {
                    const gray = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
                    const boosted = Math.min(255, Math.max(0, (gray - 128) * 1.18 + 128));
                    d[i] = boosted;
                    d[i + 1] = boosted;
                    d[i + 2] = boosted;
                }

                ctx.putImageData(imageData, 0, 0);
                resolve(dataUrlToBlob(canvas.toDataURL('image/jpeg', 0.92)));
            };
            img.onerror = () => resolve(file);
            img.src = e.target.result;
        };
        reader.onerror = () => resolve(file);
        reader.readAsDataURL(file);
    });
}

function hasMostlyEnglishLetters(text) {
    const letters = (text || '').match(/[A-Za-z]/g) || [];
    const nonAscii = (text || '').match(/[^\x00-\x7F]/g) || [];
    if (!text || text.trim().length < 8) return true;
    return letters.length >= nonAscii.length;
}

function cleanOcrText(text) {
    return String(text || '')
        .replace(/[ \t]+/g, ' ')
        .replace(/\r/g, '')
        .replace(/\n{3,}/g, '\n\n')
        .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
        .trim();
}

function scoreTextQuality(text) {
    const t = String(text || '');
    if (!t.trim()) return 0;
    const letters = (t.match(/[A-Za-z]/g) || []).length;
    const digits = (t.match(/[0-9]/g) || []).length;
    const spaces = (t.match(/\s/g) || []).length;
    const junk = (t.match(/[^A-Za-z0-9\s.,;:'"!?()\-\/]/g) || []).length;
    const longRuns = (t.match(/(.)\1{4,}/g) || []).length;
    const len = t.length;

    const readable = Math.max(0, (letters + digits + spaces - junk) / Math.max(1, len));
    const penalty = (junk / Math.max(1, len)) + (longRuns * 0.08);
    return Math.max(0, Math.min(1, readable - penalty));
}

async function extractBestOcrText(processedFile, bar) {
    const raw = await ocrSpace(processedFile, bar);
    const cleaned = cleanOcrText(raw);
    const score = scoreTextQuality(cleaned);
    return { text: cleaned, score, engine: 'ocrspace' };
}

async function ocrSpace(file, bar) {
    setOcrStatus(`Uploading to OCR.Space (${OCR_SPACE_LANGUAGE})...`);
    bar.style.width = '25%';
    const base64 = await fileToBase64(file);

    const formData = new FormData();
    formData.append('apikey', OCR_SPACE_API_KEY);
    formData.append('base64Image', `data:image/jpeg;base64,${base64}`);
    formData.append('language', OCR_SPACE_LANGUAGE);
    formData.append('OCREngine', OCR_SPACE_ENGINE);
    formData.append('isOverlayRequired', 'false');
    formData.append('detectOrientation', 'true');
    formData.append('scale', 'true');
    formData.append('isTable', 'false');

    const response = await fetch('https://api.ocr.space/parse/image', {
        method: 'POST',
        body: formData
    });

    bar.style.width = '80%';
    if (!response.ok) {
        throw new Error(`OCR.Space request failed (${response.status}).`);
    }

    const data = await response.json();
    if (data?.IsErroredOnProcessing) {
        throw new Error(data?.ErrorMessage?.[0] || 'Cloud OCR processing error.');
    }
    const parsed = data?.ParsedResults?.[0]?.ParsedText || '';
    const text = parsed || data?.text || '';
    bar.style.width = '100%';
    return String(text || '').trim();
}

async function translateTextToEnglish(text) {
    const source = (text || '').trim();
    if (!source) return { text: source, translated: false };
    if (hasMostlyEnglishLetters(source)) return { text: source, translated: false };

    // Translator endpoint.
    try {
        const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=en&dt=t&q=${encodeURIComponent(source)}`;
        const response = await fetch(url);
        const data = await response.json();
        const translated = Array.isArray(data?.[0]) ? data[0].map(part => part?.[0] || '').join('') : '';
        if (translated.trim()) return { text: translated.trim(), translated: true };
    } catch (e) {
        console.warn('Web translation unavailable:', e);
    }

    return { text: source, translated: false };
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
        if (file.type.startsWith('image/')) {
            setOcrStatus('Preprocessing image for OCR...');
            processedFile = await preprocessImageForOCR(file);
        }
        const best = await extractBestOcrText(processedFile, bar);
        text = best.text;

        if (text && text.trim().length > 0) {
            setOcrStatus('Detected text. Checking language...');
            const translated = await translateTextToEnglish(text);
            complaintArea.value = cleanOcrText(translated.text);
            if (translated.translated) {
                setOcrStatus('Text extracted and translated to English.', 'success');
            } else {
                setOcrStatus(`Text extracted successfully (${best.engine}).`, 'success');
            }
        }
        else setOcrStatus('âš  No text detected', 'error');
    } catch (err) {
        setOcrStatus('Error: ' + err.message, 'error');
        alert('OCR Error: ' + err.message);
    } finally {
        wrapper.style.display = 'none';
        bar.style.width = '0%';
        input.value = '';
    }
}

// Submit FIR â€“ store Base64 images directly in Firestore
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

    let refID = document.getElementById("refNo").value || reserveNextRefNo();
    if (!refID.startsWith('REF')) {
        refID = reserveNextRefNo();
    }
    document.getElementById("refNo").value = refID;
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
            evidenceImages: evidenceImages.map(normalizeEvidenceItem).filter(Boolean),
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
        if (firData.geocoded) summaryText += `\nðŸ“ Location mapped for crime hotspot`;
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
                img.style.cursor = 'pointer';
                img.onclick = () => openImageViewer(p.imageBase64, 'Person photo');
                modalImagesDiv.appendChild(img);
            }
        });
        // Evidence images
        evidenceImages.forEach(ev => {
            const img = document.createElement('img');
            img.src = ev.base64;
            img.style.width = '80px'; img.style.height = '80px'; img.style.objectFit = 'cover';
            img.title = ev.details ? `${ev.name} - ${ev.details}` : ev.name;
            img.style.cursor = 'pointer';
            img.onclick = () => openImageViewer(ev.base64, img.title);
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
        const cachedRaw = localStorage.getItem(FIR_CACHE_KEY);
        if (cachedRaw) {
            const cached = JSON.parse(cachedRaw);
            if (cached?.firs?.length) {
                container.innerHTML = '';
                cached.firs.forEach(fir => container.insertAdjacentHTML('beforeend', renderFirCardHtml(fir.id, fir)));
            }
        }

        const snapshot = await db.collection("firs").orderBy("timestamp", "desc").limit(300).get();
        if (snapshot.empty && !container.innerHTML.trim()) {
            container.innerHTML = '<p>No FIRs found.</p>';
            return;
        }

        const fresh = [];
        let html = '';
        snapshot.forEach(doc => {
            const fir = doc.data();
            fresh.push({ id: doc.id, ...fir });
            html += renderFirCardHtml(doc.id, fir);
        });

        if (html) container.innerHTML = html;
        if (fresh.length) syncCachedFirList(fresh);
    } catch (error) {
        console.error("Error retrieving FIRs:", error);
        if (!container.innerHTML.trim()) {
            container.innerHTML = '<p style="color: #ef4444;">Error loading FIRs. Check console.</p>';
        }
    }
}

function renderFirCardHtml(docId, fir) {
    let html = `
                <div style="border: 1px solid #334155; border-radius: 16px; margin-bottom: 20px; padding: 15px; background: #0f172a;">
                    <h4 style="color: var(--accent-gold);">${fir.refID}</h4>
                    <p><strong>Date:</strong> ${fir.date}</p>
                    <p><strong>Category:</strong> ${fir.category}</p>
                    <p><strong>Location:</strong> ${fir.incidentLocation}</p>
                    <p><strong>Description:</strong> ${(fir.incidentDescription || '').substring(0, 100)}${(fir.incidentDescription || '').length > 100 ? '...' : ''}</p>
                    <p><strong>Victims:</strong> ${fir.victimCount || 0} | <strong>Witnesses:</strong> ${fir.witnessCount || 0} | <strong>Suspects:</strong> ${fir.suspectCount || 0} | <strong>Criminals:</strong> ${fir.criminalCount || 0}</p>
                    <div style="margin-top: 10px;">
                        <strong>Images:</strong><br>
                        <div style="display: flex; flex-wrap: wrap; gap: 8px; margin-top: 5px;">
            `;
    const allPersons = [...(fir.victims || []), ...(fir.witnesses || []), ...(fir.suspects || []), ...(fir.criminals || [])];
    allPersons.forEach(p => {
        if (p.imageBase64) {
            html += `<img src="${p.imageBase64}" style="width:60px; height:60px; object-fit:cover; border-radius:8px; cursor:pointer;" title="Person photo" onclick="openImageViewer('${p.imageBase64}', 'Person photo')">`;
        }
    });
    (fir.evidenceImages || []).forEach(ev => {
        if (ev?.base64) {
            const title = ev.details ? `${ev.name || 'Evidence'} - ${ev.details}` : (ev.name || 'Evidence');
            html += `<img src="${ev.base64}" style="width:60px; height:60px; object-fit:cover; border-radius:8px; cursor:pointer;" title="${title}" onclick="openImageViewer('${ev.base64}', '${safeTitle(title)}')">`;
        }
    });
    if (allPersons.length === 0 && (!fir.evidenceImages || fir.evidenceImages.length === 0)) {
        html += `<span style="color:#64748b;">No images</span>`;
    }
    html += `</div></div><hr style="border-color:#334155;">`;
    html += `<button class="btn-submit" style="background: #2563eb; padding: 6px 12px; font-size: 0.8rem; margin-top: 8px;" onclick="viewFirDetails('${docId}')">View Full Details</button>`;
    html += `</div>`;
    return html;
}

async function viewFirDetails(docId) {
    const doc = await db.collection("firs").doc(docId).get();
    if (!doc.exists) {
        alert("FIR not found");
        return;
    }
    const fir = doc.data();
    // Show details in a nested alert or a new modal â€“ for simplicity we use a formatted alert
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
    selectOcrEngine('ocrspace');
    currentCoordinates = { lat: null, lng: null };
    document.getElementById('locationStatus').innerHTML = '';
    listenForRefNo();
    document.getElementById('bgUploadStatus').style.display = 'none';
}

function closeModal() { document.getElementById("resultModal").style.display = 'none'; }
function setDate() { document.getElementById("date").value = new Date().toLocaleDateString("en-IN"); }

