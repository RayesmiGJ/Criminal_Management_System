// Firebase Config (must match your registration page)
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

let allRecords = [];
let currentEditDocId = null;
let currentEditData = null;
let newEvidenceBase64 = [];     // array of {base64, name}
let existingEvidenceBase64 = []; // array of {base64, name} from Firestore

// Helper: compress image to Base64 (max 800px, quality 0.6)
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

// Load FIR list from Firestore
async function loadFIRData() {
    const tableBody = document.querySelector("#firTable tbody");
    tableBody.innerHTML = "<tr><td colspan='7'>Loading...<\/td><\/tr>";
    const categories = new Set();
    allRecords = [];
    try {
        const snapshot = await db.collection("firs").get();
        tableBody.innerHTML = "";
        snapshot.forEach(doc => {
            const record = doc.data();
            record.id = doc.id;
            allRecords.push(record);
            const victimName = record.victims?.[0]?.name || record.victimName || '';
            const victimContact = record.victims?.[0]?.contact || record.victimContact || '';
            const status = record.status || 'Pending';
            const isClosed = (status === 'Case Closed');
            const row = tableBody.insertRow();
            row.innerHTML = `
                <td class="refCol">${record.refID || record.refNo || ''}</td>
                <td>${record.date || ''}</td>
                <td>${record.category || ''}</td>
                <td>${escapeHtml(victimName)}</td>
                <td>${escapeHtml(victimContact)}</td>
                <td><span class="${getStatusClass(status)}">${status}</span></td>
                <td><button class="btn-edit" onclick="openEditModal('${doc.id}')" ${isClosed ? 'disabled' : ''}>${isClosed ? 'Closed' : 'Edit Case'}</button></td>
            `;
            row.cells[0].onclick = () => showDetails(record);
            if (record.category) categories.add(record.category);
        });
        const catFilter = document.getElementById("categoryFilter");
        if (catFilter) {
            catFilter.innerHTML = '<option value="">All Categories</option>';
            categories.forEach(c => {
                const opt = document.createElement("option");
                opt.value = c;
                opt.textContent = c;
                catFilter.appendChild(opt);
            });
        }
    } catch(e) {
        console.error(e);
        tableBody.innerHTML = "<tr><td colspan='7'>Error loading data<\/td><\/tr>";
    }
}

function getStatusClass(status) {
    if(status === 'Pending') return 'status-pending';
    if(status === 'Arrested') return 'status-arrested';
    if(status === 'Case Closed') return 'status-closed';
    return '';
}

function filterTable() {
    const search = document.getElementById("searchInput").value.toLowerCase();
    const rows = document.querySelectorAll("#firTable tbody tr");
    rows.forEach(row => {
        const ref = row.cells[0].textContent.toLowerCase();
        const name = row.cells[3].textContent.toLowerCase();
        row.style.display = (ref.includes(search) || name.includes(search)) ? "" : "none";
    });
}

function filterByCategory() {
    const selected = document.getElementById("categoryFilter").value.toLowerCase();
    const rows = document.querySelectorAll("#firTable tbody tr");
    rows.forEach(row => {
        const cat = row.cells[2].textContent.toLowerCase();
        row.style.display = !selected || cat === selected ? "" : "none";
    });
}

// Show detailed view (Base64 images displayed directly)
function showDetails(record) {
    let html = `
        <div class="detail-line"><strong>Reference ID:</strong> ${record.refID}</div>
        <div class="detail-line"><strong>Date:</strong> ${record.date || 'N/A'}</div>
        <div class="detail-line"><strong>Category:</strong> ${record.category || 'N/A'}</div>
        <div class="detail-line"><strong>Location:</strong> ${record.incidentLocation || 'N/A'}</div>
        <div class="detail-line"><strong>Description:</strong> ${record.incidentDescription || 'N/A'}</div>
        <div class="detail-line"><strong>Complaint:</strong> ${record.complaint || 'N/A'}</div>
        <div class="detail-line"><strong>Property Seized:</strong> ${record.propertySeizure || 'None'}</div>
        <div class="detail-line"><strong>Status:</strong> <span class="${getStatusClass(record.status)}">${record.status || 'Pending'}</span></div>
    `;

    // Victims
    if (record.victims && record.victims.length) {
        html += `<div class="section-title"><i class="fas fa-user-injured"></i> Victim(s)</div>`;
        record.victims.forEach((v, i) => {
            html += `<div class="sub-section">`;
            html += `<div><strong>Name:</strong> ${escapeHtml(v.name || 'N/A')}</div>`;
            html += `<div><strong>Age:</strong> ${v.age || 'N/A'}</div>`;
            html += `<div><strong>Contact:</strong> ${v.contact || 'N/A'}</div>`;
            html += `<div><strong>Address:</strong> ${escapeHtml(v.address || 'N/A')}</div>`;
            html += `<div><strong>ID Proof:</strong> ${v.idProof || 'N/A'}</div>`;
            html += `<div><strong>Occupation:</strong> ${v.occupation || 'N/A'}</div>`;
            if (v.imageBase64) html += `<div><strong>Photo:</strong> <img src="${v.imageBase64}" style="max-width:150px; border-radius:8px;"></div>`;
            html += `</div>`;
        });
    }

    // Witnesses
    if (record.witnesses && record.witnesses.length) {
        html += `<div class="section-title"><i class="fas fa-users"></i> Witness(es)</div>`;
        record.witnesses.forEach((w, i) => {
            html += `<div class="sub-section">`;
            html += `<div><strong>Name:</strong> ${escapeHtml(w.name || 'N/A')}</div>`;
            html += `<div><strong>Age:</strong> ${w.age || 'N/A'}</div>`;
            html += `<div><strong>Contact:</strong> ${w.contact || 'N/A'}</div>`;
            html += `<div><strong>Address:</strong> ${escapeHtml(w.address || 'N/A')}</div>`;
            html += `<div><strong>Statement:</strong> ${escapeHtml(w.statement || 'N/A')}</div>`;
            if (w.imageBase64) html += `<div><strong>Photo:</strong> <img src="${w.imageBase64}" style="max-width:150px; border-radius:8px;"></div>`;
            html += `</div>`;
        });
    }

    // Suspects
    if (record.suspects && record.suspects.length) {
        html += `<div class="section-title"><i class="fas fa-user-secret"></i> Suspect(s)</div>`;
        record.suspects.forEach((s, i) => {
            html += `<div class="sub-section">`;
            html += `<div><strong>Name/Alias:</strong> ${escapeHtml(s.name || 'N/A')}</div>`;
            html += `<div><strong>Age:</strong> ${s.age || 'N/A'}</div>`;
            html += `<div><strong>Gender:</strong> ${s.gender || 'N/A'}</div>`;
            html += `<div><strong>Height:</strong> ${s.height || 'N/A'}</div>`;
            html += `<div><strong>Build:</strong> ${s.build || 'N/A'}</div>`;
            html += `<div><strong>Marks:</strong> ${escapeHtml(s.marks || 'N/A')}</div>`;
            html += `<div><strong>Last Seen:</strong> ${escapeHtml(s.lastSeen || 'N/A')}</div>`;
            if (s.imageBase64) html += `<div><strong>Photo:</strong> <img src="${s.imageBase64}" style="max-width:150px; border-radius:8px;"></div>`;
            html += `</div>`;
        });
    }

    // Criminals
    if (record.criminals && record.criminals.length) {
        html += `<div class="section-title"><i class="fas fa-skull-crosswalk"></i> Criminal(s)</div>`;
        record.criminals.forEach((c, i) => {
            html += `<div class="sub-section">`;
            html += `<div><strong>Name:</strong> ${escapeHtml(c.name || 'N/A')}</div>`;
            html += `<div><strong>Alias:</strong> ${escapeHtml(c.alias || 'N/A')}</div>`;
            html += `<div><strong>Age:</strong> ${c.age || 'N/A'}</div>`;
            html += `<div><strong>Gender:</strong> ${c.gender || 'N/A'}</div>`;
            html += `<div><strong>Address:</strong> ${escapeHtml(c.address || 'N/A')}</div>`;
            html += `<div><strong>Previous Record:</strong> ${escapeHtml(c.record || 'N/A')}</div>`;
            html += `<div><strong>History:</strong> ${escapeHtml(c.history || 'N/A')}</div>`;
            if (c.imageBase64) html += `<div><strong>Photo:</strong> <img src="${c.imageBase64}" style="max-width:150px; border-radius:8px;"></div>`;
            html += `</div>`;
        });
    }

    // Evidence (Base64)
    if (record.evidenceImages && record.evidenceImages.length) {
        html += `<div class="section-title"><i class="fas fa-cloud-upload-alt"></i> Evidence Files</div>`;
        html += `<div class="evidence-grid">`;
        record.evidenceImages.forEach(ev => {
            if (ev.base64) {
                html += `<img src="${ev.base64}" class="evidence-img" onclick="window.open('${ev.base64}','_blank')">`;
            } else if (typeof ev === 'string') {
                html += `<img src="${ev}" class="evidence-img" onclick="window.open('${ev}','_blank')">`;
            }
        });
        html += `</div>`;
    } else if (record.evidence && record.evidence.length) { // backward compatibility
        html += `<div class="section-title"><i class="fas fa-cloud-upload-alt"></i> Evidence Files</div>`;
        html += `<div class="evidence-grid">`;
        record.evidence.forEach(url => {
            html += `<img src="${url}" class="evidence-img" onclick="window.open('${url}','_blank')">`;
        });
        html += `</div>`;
    }

    if (record.judgement) {
        html += `<div class="section-title"><i class="fas fa-gavel"></i> Court Judgement</div>`;
        html += `<div class="detail-line">${escapeHtml(record.judgement)}</div>`;
    }

    document.getElementById("modalBody").innerHTML = html;
    document.getElementById("detailsModal").style.display = "flex";
}

function closeModal() { document.getElementById("detailsModal").style.display = "none"; }

// ========== EDIT MODAL (Base64 version) ==========
async function openEditModal(docId) {
    currentEditDocId = docId;
    const doc = await db.collection("firs").doc(docId).get();
    currentEditData = doc.data();
    const status = currentEditData.status || 'Pending';
    if(status === 'Case Closed') {
        alert("This case is closed and cannot be edited.");
        return;
    }
    document.getElementById("editRefNo").innerText = currentEditData.refID;
    if(status === 'Arrested') {
        renderArrestedEditForm();
    } else {
        // Ensure arrays exist
        if(!currentEditData.victims) currentEditData.victims = [];
        if(!currentEditData.witnesses) currentEditData.witnesses = [];
        if(!currentEditData.suspects) currentEditData.suspects = [];
        if(!currentEditData.criminals) currentEditData.criminals = [];
        // Convert evidenceImages array to existingEvidenceBase64
        existingEvidenceBase64 = currentEditData.evidenceImages || [];
        newEvidenceBase64 = [];
        renderFullEditForm();
    }
    document.getElementById("editModal").style.display = "flex";
}

function renderArrestedEditForm() {
    const container = document.getElementById("editFormContainer");
    container.innerHTML = `
        <div class="info-message">
            <i class="fas fa-gavel"></i> This case is marked as <strong>Arrested</strong>. You can only enter the final judgement and close the case.
        </div>
        <div class="judgement-area">
            <label>Final Court Judgement:</label>
            <textarea id="arrestedJudgement" rows="4" placeholder="Enter detailed judgement, sentence, etc.">${escapeHtml(currentEditData.judgement || '')}</textarea>
        </div>
        <button class="save-btn" onclick="closeArrestedCase()"><i class="fas fa-check-circle"></i> Close Case (Submit Judgement)</button>
    `;
}

function renderFullEditForm() {
    const container = document.getElementById("editFormContainer");
    container.innerHTML = `
        <div class="stats-summary" style="display:flex; gap:15px; margin-bottom:20px; flex-wrap:wrap;">
            <span class="stat-badge"><i class="fas fa-user-injured"></i> Victims: ${currentEditData.victims.length}</span>
            <span class="stat-badge"><i class="fas fa-user"></i> Witnesses: ${currentEditData.witnesses.length}</span>
            <span class="stat-badge"><i class="fas fa-user-secret"></i> Suspects: ${currentEditData.suspects.length}</span>
            <span class="stat-badge"><i class="fas fa-skull-crosswalk"></i> Criminals: ${currentEditData.criminals.length}</span>
        </div>
        ${renderPersonSection('victim', currentEditData.victims)}
        ${renderPersonSection('witness', currentEditData.witnesses)}
        ${renderPersonSection('suspect', currentEditData.suspects)}
        ${renderPersonSection('criminal', currentEditData.criminals)}
        <div class="person-section">
            <div class="person-title"><i class="fas fa-cloud-upload-alt"></i> Multimedia Evidence</div>
            <div id="evidenceList" class="evidence-grid"></div>
            <div class="btn-add-evidence" onclick="document.getElementById('evidenceFileInput').click()">
                <i class="fas fa-plus"></i> Add Evidence (Image only, stored as Base64)
            </div>
            <input type="file" id="evidenceFileInput" accept="image/*" style="display:none" onchange="addNewEvidenceFile(this)">
        </div>
        <div class="property-field">
            <label><i class="fas fa-box"></i> Property Seized:</label>
            <textarea id="editPropertySeizure" rows="3" placeholder="List all seized items...">${escapeHtml(currentEditData.propertySeizure || '')}</textarea>
        </div>
        <div class="status-workflow">
            <button class="workflow-btn ${currentEditData.status === 'Pending' ? 'active' : ''}" onclick="setWorkflowStatus('Pending')">📋 Pending</button>
            <button class="workflow-btn ${currentEditData.status === 'Arrested' ? 'active' : ''}" onclick="setWorkflowStatus('Arrested')">⛓️ Mark as Arrested</button>
        </div>
        <button class="save-btn" onclick="saveFullCaseUpdates()"><i class="fas fa-save"></i> Save All Changes</button>
    `;
    // Render evidence grid
    const evidenceDiv = document.getElementById("evidenceList");
    evidenceDiv.innerHTML = '';
    [...existingEvidenceBase64, ...newEvidenceBase64].forEach((item, idx) => {
        const isExisting = idx < existingEvidenceBase64.length;
        const base64 = item.base64 || item;
        const name = item.name || 'evidence';
        const div = document.createElement('div');
        div.className = 'evidence-item-edit';
        div.setAttribute('data-idx', idx);
        div.setAttribute('data-existing', isExisting);
        div.innerHTML = `<img src="${base64}" style="max-width:100px; max-height:80px; border-radius:8px;"><div class="remove-evidence" onclick="removeEvidenceItem(${idx}, ${isExisting})">×</div>`;
        evidenceDiv.appendChild(div);
    });
    window.workflowStatus = currentEditData.status || 'Pending';
}

function renderPersonSection(type, dataArray) {
    const typeLabel = {victim:'Victim', witness:'Witness', suspect:'Suspect', criminal:'Criminal'}[type];
    const icon = type === 'victim' ? 'fa-user-injured' : (type === 'witness' ? 'fa-user' : (type === 'suspect' ? 'fa-user-secret' : 'fa-skull-crosswalk'));
    let cardsHtml = '';
    dataArray.forEach((person, idx) => {
        const personId = `${type}_${Date.now()}_${idx}`;
        const imageBase64 = person.imageBase64 || '';
        let previewContent = imageBase64 ? `<img src="${imageBase64}" alt="Preview">` : `<i class="fas fa-user"></i><span>Click to upload photo</span>`;
        cardsHtml += `
            <div class="person-card" data-type="${type}" data-idx="${idx}">
                <div class="person-header">
                    <span class="person-title">${typeLabel} ${idx+1}</span>
                    <button type="button" class="remove-person" onclick="removePerson('${type}', ${idx})">Remove</button>
                </div>
                <div class="person-content">
                    <div class="image-upload-container">
                        <div class="image-preview" onclick="document.getElementById('${personId}_image').click()">
                            ${previewContent}
                        </div>
                        <input type="file" id="${personId}_image" accept="image/*" style="display:none" onchange="previewAndUploadPersonImage('${type}', ${idx}, this, '${personId}')">
                        <button type="button" class="remove-image" onclick="removePersonImage('${type}', ${idx}, '${personId}')">×</button>
                    </div>
                    <div class="person-details-container">
                        ${getPersonFields(type, person, idx)}
                    </div>
                </div>
            </div>
        `;
    });
    const addButton = `<div class="btn-add-person" onclick="addPerson('${type}')"><i class="fas fa-plus"></i> Add ${typeLabel}</div>`;
    return `<div class="person-section"><div class="person-title"><i class="fas ${icon}"></i> ${typeLabel}s</div>${cardsHtml}${addButton}</div>`;
}

function getPersonFields(type, person, idx) {
    if(type === 'victim') {
        return `
            <input type="text" placeholder="Full Name" value="${escapeHtml(person.name||'')}" class="victim-name-${idx}">
            <input type="number" placeholder="Age" value="${person.age||''}" class="victim-age-${idx}">
            <input type="tel" placeholder="Contact" value="${person.contact||''}" class="victim-contact-${idx}">
            <input type="text" placeholder="Address" value="${escapeHtml(person.address||'')}" class="victim-address-${idx}">
            <input type="text" placeholder="ID Proof" value="${escapeHtml(person.idProof||'')}" class="victim-id-${idx}">
            <input type="text" placeholder="Occupation" value="${escapeHtml(person.occupation||'')}" class="victim-occupation-${idx}">
        `;
    } else if(type === 'witness') {
        return `
            <input type="text" placeholder="Full Name" value="${escapeHtml(person.name||'')}" class="witness-name-${idx}">
            <input type="number" placeholder="Age" value="${person.age||''}" class="witness-age-${idx}">
            <input type="tel" placeholder="Contact" value="${person.contact||''}" class="witness-contact-${idx}">
            <input type="text" placeholder="Address" value="${escapeHtml(person.address||'')}" class="witness-address-${idx}">
            <textarea placeholder="Statement" class="witness-statement-${idx}">${escapeHtml(person.statement||'')}</textarea>
        `;
    } else if(type === 'suspect') {
        return `
            <input type="text" placeholder="Name/Alias" value="${escapeHtml(person.name||'')}" class="suspect-name-${idx}">
            <input type="number" placeholder="Age" value="${person.age||''}" class="suspect-age-${idx}">
            <select class="suspect-gender-${idx}"><option ${person.gender==='Male'?'selected':''}>Male</option><option ${person.gender==='Female'?'selected':''}>Female</option><option ${person.gender==='Other'?'selected':''}>Other</option></select>
            <input type="text" placeholder="Height" value="${person.height||''}" class="suspect-height-${idx}">
            <input type="text" placeholder="Build" value="${person.build||''}" class="suspect-build-${idx}">
            <textarea placeholder="Marks" class="suspect-marks-${idx}">${escapeHtml(person.marks||'')}</textarea>
            <input type="text" placeholder="Last Seen" value="${escapeHtml(person.lastSeen||'')}" class="suspect-lastseen-${idx}">
        `;
    } else if(type === 'criminal') {
        return `
            <input type="text" placeholder="Full Name" value="${escapeHtml(person.name||'')}" class="criminal-name-${idx}">
            <input type="text" placeholder="Alias" value="${escapeHtml(person.alias||'')}" class="criminal-alias-${idx}">
            <input type="number" placeholder="Age" value="${person.age||''}" class="criminal-age-${idx}">
            <select class="criminal-gender-${idx}"><option ${person.gender==='Male'?'selected':''}>Male</option><option ${person.gender==='Female'?'selected':''}>Female</option><option ${person.gender==='Other'?'selected':''}>Other</option></select>
            <input type="text" placeholder="Address" value="${escapeHtml(person.address||'')}" class="criminal-address-${idx}">
            <input type="text" placeholder="Previous Record" value="${escapeHtml(person.record||'')}" class="criminal-record-${idx}">
            <textarea placeholder="Criminal History" class="criminal-history-${idx}">${escapeHtml(person.history||'')}</textarea>
        `;
    }
    return '';
}

window.addPerson = function(type) {
    let newPerson = {};
    if(type === 'victim') newPerson = { name: '', age: '', contact: '', address: '', idProof: '', occupation: '', imageBase64: null };
    else if(type === 'witness') newPerson = { name: '', age: '', contact: '', address: '', statement: '', imageBase64: null };
    else if(type === 'suspect') newPerson = { name: '', age: '', gender: 'Male', height: '', build: '', marks: '', lastSeen: '', imageBase64: null };
    else if(type === 'criminal') newPerson = { name: '', alias: '', age: '', gender: 'Male', address: '', record: '', history: '', imageBase64: null };
    currentEditData[type+'s'].push(newPerson);
    renderFullEditForm();
};

window.removePerson = function(type, idx) {
    currentEditData[type+'s'].splice(idx, 1);
    renderFullEditForm();
};

window.previewAndUploadPersonImage = async function(type, idx, input, personId) {
    if (!input.files.length) return;
    const file = input.files[0];
    const base64 = await compressImageToBase64(file);
    // Update preview
    const card = document.querySelector(`.person-card[data-type="${type}"][data-idx="${idx}"]`);
    const previewDiv = card.querySelector('.image-preview');
    previewDiv.innerHTML = `<img src="${base64}" alt="Preview">`;
    const removeBtn = card.querySelector('.remove-image');
    if (removeBtn) removeBtn.style.display = 'flex';
    // Store Base64 in currentEditData
    currentEditData[type+'s'][idx].imageBase64 = base64;
};

window.removePersonImage = function(type, idx, personId) {
    const card = document.querySelector(`.person-card[data-type="${type}"][data-idx="${idx}"]`);
    const previewDiv = card.querySelector('.image-preview');
    previewDiv.innerHTML = `<i class="fas fa-user"></i><span>Click to upload photo</span>`;
    const removeBtn = card.querySelector('.remove-image');
    if (removeBtn) removeBtn.style.display = 'none';
    currentEditData[type+'s'][idx].imageBase64 = null;
};

async function addNewEvidenceFile(input) {
    if(!input.files.length) return;
    const file = input.files[0];
    if (!file.type.startsWith('image/')) {
        alert("Only images can be stored as Base64 in Firestore.");
        input.value = '';
        return;
    }
    const base64 = await compressImageToBase64(file);
    newEvidenceBase64.push({ base64, name: file.name });
    renderFullEditForm();
    input.value = '';
}

window.removeEvidenceItem = function(idx, isExisting) {
    if(isExisting) {
        existingEvidenceBase64.splice(idx, 1);
    } else {
        const newIdx = idx - existingEvidenceBase64.length;
        newEvidenceBase64.splice(newIdx, 1);
    }
    renderFullEditForm();
};

window.setWorkflowStatus = function(status) {
    window.workflowStatus = status;
    document.querySelectorAll('.workflow-btn').forEach(btn => btn.classList.remove('active'));
    event.target.classList.add('active');
};

function collectPersons(type) {
    const persons = [];
    const cards = document.querySelectorAll(`.person-card[data-type="${type}"]`);
    cards.forEach((card, idx) => {
        let person = {};
        if(type === 'victim') {
            person.name = card.querySelector(`.victim-name-${idx}`)?.value || '';
            person.age = card.querySelector(`.victim-age-${idx}`)?.value || '';
            person.contact = card.querySelector(`.victim-contact-${idx}`)?.value || '';
            person.address = card.querySelector(`.victim-address-${idx}`)?.value || '';
            person.idProof = card.querySelector(`.victim-id-${idx}`)?.value || '';
            person.occupation = card.querySelector(`.victim-occupation-${idx}`)?.value || '';
        } else if(type === 'witness') {
            person.name = card.querySelector(`.witness-name-${idx}`)?.value || '';
            person.age = card.querySelector(`.witness-age-${idx}`)?.value || '';
            person.contact = card.querySelector(`.witness-contact-${idx}`)?.value || '';
            person.address = card.querySelector(`.witness-address-${idx}`)?.value || '';
            person.statement = card.querySelector(`.witness-statement-${idx}`)?.value || '';
        } else if(type === 'suspect') {
            person.name = card.querySelector(`.suspect-name-${idx}`)?.value || '';
            person.age = card.querySelector(`.suspect-age-${idx}`)?.value || '';
            person.gender = card.querySelector(`.suspect-gender-${idx}`)?.value || '';
            person.height = card.querySelector(`.suspect-height-${idx}`)?.value || '';
            person.build = card.querySelector(`.suspect-build-${idx}`)?.value || '';
            person.marks = card.querySelector(`.suspect-marks-${idx}`)?.value || '';
            person.lastSeen = card.querySelector(`.suspect-lastseen-${idx}`)?.value || '';
        } else if(type === 'criminal') {
            person.name = card.querySelector(`.criminal-name-${idx}`)?.value || '';
            person.alias = card.querySelector(`.criminal-alias-${idx}`)?.value || '';
            person.age = card.querySelector(`.criminal-age-${idx}`)?.value || '';
            person.gender = card.querySelector(`.criminal-gender-${idx}`)?.value || '';
            person.address = card.querySelector(`.criminal-address-${idx}`)?.value || '';
            person.record = card.querySelector(`.criminal-record-${idx}`)?.value || '';
            person.history = card.querySelector(`.criminal-history-${idx}`)?.value || '';
        }
        // Preserve existing Base64 if not overwritten by new upload
        const existing = currentEditData[type+'s']?.[idx];
        if (existing && existing.imageBase64 && !person.imageBase64) person.imageBase64 = existing.imageBase64;
        persons.push(person);
    });
    return persons;
}

async function saveFullCaseUpdates() {
    const victims = collectPersons('victim');
    const witnesses = collectPersons('witness');
    const suspects = collectPersons('suspect');
    const criminals = collectPersons('criminal');
    const propertySeizure = document.getElementById("editPropertySeizure")?.value || '';
    const allEvidence = [...existingEvidenceBase64, ...newEvidenceBase64];
    const updatePayload = {
        victims,
        witnesses,
        suspects,
        criminals,
        victimCount: victims.length,
        witnessCount: witnesses.length,
        suspectCount: suspects.length,
        criminalCount: criminals.length,
        propertySeizure,
        evidenceImages: allEvidence,
        status: window.workflowStatus
    };
    try {
        await db.collection("firs").doc(currentEditDocId).update(updatePayload);
        alert("Case updated successfully!");
        closeEditModal();
        loadFIRData();
    } catch(e) {
        alert("Error: " + e.message);
    }
}

async function closeArrestedCase() {
    const judgement = document.getElementById("arrestedJudgement")?.value.trim();
    if(!judgement) {
        alert("Please enter the court judgement before closing the case.");
        return;
    }
    try {
        await db.collection("firs").doc(currentEditDocId).update({
            status: 'Case Closed',
            judgement: judgement
        });
        alert("Case has been closed with judgement.");
        closeEditModal();
        loadFIRData();
    } catch(e) {
        alert("Error: " + e.message);
    }
}

function closeEditModal() { document.getElementById("editModal").style.display = "none"; }
function escapeHtml(str) { if(!str) return ''; return str.replace(/[&<>]/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[m])); }

// Initialize on page load
window.onload = loadFIRData;