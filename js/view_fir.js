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
    const storage = firebase.storage();

    let allRecords = [];
    let currentEditDocId = null;
    let currentEditData = null;
    let newEvidenceFiles = [];
    let existingEvidenceUrls = [];

    // Load FIR list
    async function loadFIRData() {
        let tableBody = document.querySelector("#firTable tbody");
        tableBody.innerHTML = "<tr><td colspan='7'>Loading...<\/td><\/tr>";
        let categories = new Set();
        allRecords = [];
        try {
            const snapshot = await db.collection("firs").get();
            tableBody.innerHTML = "";
            snapshot.forEach(doc => {
                let record = doc.data();
                record.id = doc.id;
                allRecords.push(record);
                let victimName = record.victims?.[0]?.name || record.victimName || (record.criminalDetails?.name) || '';
                let victimContact = record.victims?.[0]?.contact || record.victimContact || '';
                let status = record.status || 'Pending';
                let isClosed = (status === 'Case Closed');
                let row = tableBody.insertRow();
                row.innerHTML = `
                    <td class="refCol">${record.refID || record.refNo || ''}<\/td>
                    <td>${record.date || ''}<\/td>
                    <td>${record.category || ''}<\/td>
                    <td>${victimName}<\/td>
                    <td>${victimContact}<\/td>
                    <td><span class="${getStatusClass(status)}">${status}<\/span><\/td>
                    <td><button class="btn btn-edit" onclick="openEditModal('${doc.id}')" ${isClosed ? 'disabled' : ''}>${isClosed ? 'Closed' : 'Edit Case'}<\/button><\/td>
                `;
                row.cells[0].onclick = () => showDetails(record);
                if(record.category) categories.add(record.category);
            });
            let catFilter = document.getElementById("categoryFilter");
            catFilter.innerHTML = '<option value="">All Categories</option>';
            categories.forEach(c => { let opt = document.createElement("option"); opt.value = c; opt.textContent = c; catFilter.appendChild(opt); });
        } catch(e) { console.error(e); tableBody.innerHTML = "<tr><td colspan='7'>Error loading data<\/td><\/tr>"; }
    }

    function getStatusClass(status) {
        if(status === 'Pending') return 'status-pending';
        if(status === 'Arrested') return 'status-arrested';
        if(status === 'Case Closed') return 'status-closed';
        return '';
    }

    function filterTable() {
        let search = document.getElementById("searchInput").value.toLowerCase();
        let rows = document.querySelectorAll("#firTable tbody tr");
        rows.forEach(row => {
            let ref = row.cells[0].textContent.toLowerCase();
            let name = row.cells[3].textContent.toLowerCase();
            row.style.display = (ref.includes(search) || name.includes(search)) ? "" : "none";
        });
    }
    function filterByCategory() {
        let selected = document.getElementById("categoryFilter").value.toLowerCase();
        let rows = document.querySelectorAll("#firTable tbody tr");
        rows.forEach(row => {
            let cat = row.cells[2].textContent.toLowerCase();
            row.style.display = !selected || cat === selected ? "" : "none";
        });
    }

    // ========== LINE-BY-LINE DETAILS MODAL ==========
    function showDetails(record) {
        let html = `
            <div class="detail-line"><strong>Reference ID:</strong> ${record.refID}</div>
            <div class="detail-line"><strong>Date of Registration:</strong> ${record.date || 'N/A'}</div>
            <div class="detail-line"><strong>Incident Category:</strong> ${record.category || 'N/A'}</div>
            <div class="detail-line"><strong>Incident Location:</strong> ${record.incidentLocation || 'N/A'}</div>
            <div class="detail-line"><strong>Incident Description:</strong> ${record.incidentDescription || 'N/A'}</div>
            <div class="detail-line"><strong>Complaint Statement:</strong> ${record.complaint || 'N/A'}</div>
            <div class="detail-line"><strong>Property Seized:</strong> ${record.propertySeizure || 'None'}</div>
            <div class="detail-line"><strong>Current Status:</strong> <span class="${getStatusClass(record.status)}">${record.status || 'Pending'}</span></div>
        `;

        // Victims
        if (record.victims && record.victims.length > 0) {
            html += `<div class="section-title"><i class="fas fa-user-injured"></i> Victim(s)</div>`;
            record.victims.forEach((v, i) => {
                html += `<div class="sub-section">`;
                html += `<div class="detail-line"><strong>Victim ${i+1} - Name:</strong> ${v.name || 'N/A'}</div>`;
                html += `<div class="detail-line"><strong>Age:</strong> ${v.age || 'N/A'}</div>`;
                html += `<div class="detail-line"><strong>Contact:</strong> ${v.contact || 'N/A'}</div>`;
                html += `<div class="detail-line"><strong>Address:</strong> ${v.address || 'N/A'}</div>`;
                html += `<div class="detail-line"><strong>ID Proof:</strong> ${v.idProof || 'N/A'}</div>`;
                html += `<div class="detail-line"><strong>Occupation:</strong> ${v.occupation || 'N/A'}</div>`;
                if (v.imageUrl) html += `<div class="detail-line"><strong>Photo:</strong> <img src="${v.imageUrl}" style="max-width:150px; border-radius:8px;"></div>`;
                html += `</div>`;
            });
        } else if (record.victimName) {
            html += `<div class="section-title"><i class="fas fa-user-injured"></i> Victim</div>`;
            html += `<div class="sub-section">`;
            html += `<div class="detail-line"><strong>Name:</strong> ${record.victimName}</div>`;
            html += `<div class="detail-line"><strong>Age:</strong> ${record.victimAge || 'N/A'}</div>`;
            html += `<div class="detail-line"><strong>Contact:</strong> ${record.victimContact || 'N/A'}</div>`;
            html += `<div class="detail-line"><strong>Address:</strong> ${record.victimAddress || 'N/A'}</div>`;
            html += `<div class="detail-line"><strong>ID Proof:</strong> ${record.victimIdProof || 'N/A'}</div>`;
            html += `<div class="detail-line"><strong>Occupation:</strong> ${record.victimOccupation || 'N/A'}</div>`;
            html += `</div>`;
        }

        // Witnesses
        if (record.witnesses && record.witnesses.length > 0) {
            html += `<div class="section-title"><i class="fas fa-users"></i> Witness(es)</div>`;
            record.witnesses.forEach((w, i) => {
                html += `<div class="sub-section">`;
                html += `<div class="detail-line"><strong>Witness ${i+1} - Name:</strong> ${w.name || 'N/A'}</div>`;
                html += `<div class="detail-line"><strong>Age:</strong> ${w.age || 'N/A'}</div>`;
                html += `<div class="detail-line"><strong>Contact:</strong> ${w.contact || 'N/A'}</div>`;
                html += `<div class="detail-line"><strong>Address:</strong> ${w.address || 'N/A'}</div>`;
                html += `<div class="detail-line"><strong>Statement:</strong> ${w.statement || 'N/A'}</div>`;
                if (w.imageUrl) html += `<div class="detail-line"><strong>Photo:</strong> <img src="${w.imageUrl}" style="max-width:150px; border-radius:8px;"></div>`;
                html += `</div>`;
            });
        }

        // Suspects
        if (record.suspects && record.suspects.length > 0) {
            html += `<div class="section-title"><i class="fas fa-user-secret"></i> Suspect(s)</div>`;
            record.suspects.forEach((s, i) => {
                html += `<div class="sub-section">`;
                html += `<div class="detail-line"><strong>Suspect ${i+1} - Name/Alias:</strong> ${s.name || 'N/A'}</div>`;
                html += `<div class="detail-line"><strong>Estimated Age:</strong> ${s.age || 'N/A'}</div>`;
                html += `<div class="detail-line"><strong>Gender:</strong> ${s.gender || 'N/A'}</div>`;
                html += `<div class="detail-line"><strong>Height:</strong> ${s.height || 'N/A'}</div>`;
                html += `<div class="detail-line"><strong>Build:</strong> ${s.build || 'N/A'}</div>`;
                html += `<div class="detail-line"><strong>Distinguishing Marks:</strong> ${s.marks || 'N/A'}</div>`;
                html += `<div class="detail-line"><strong>Last Seen:</strong> ${s.lastSeen || 'N/A'}</div>`;
                if (s.imageUrl) html += `<div class="detail-line"><strong>Photo:</strong> <img src="${s.imageUrl}" style="max-width:150px; border-radius:8px;"></div>`;
                html += `</div>`;
            });
        }

        // Criminals
        if (record.criminals && record.criminals.length > 0) {
            html += `<div class="section-title"><i class="fas fa-skull-crosswalk"></i> Criminal(s)</div>`;
            record.criminals.forEach((c, i) => {
                html += `<div class="sub-section">`;
                html += `<div class="detail-line"><strong>Criminal ${i+1} - Name:</strong> ${c.name || 'N/A'}</div>`;
                html += `<div class="detail-line"><strong>Alias:</strong> ${c.alias || 'N/A'}</div>`;
                html += `<div class="detail-line"><strong>Age:</strong> ${c.age || 'N/A'}</div>`;
                html += `<div class="detail-line"><strong>Gender:</strong> ${c.gender || 'N/A'}</div>`;
                html += `<div class="detail-line"><strong>Address:</strong> ${c.address || 'N/A'}</div>`;
                html += `<div class="detail-line"><strong>Previous Record:</strong> ${c.record || 'N/A'}</div>`;
                html += `<div class="detail-line"><strong>Criminal History:</strong> ${c.history || 'N/A'}</div>`;
                if (c.imageUrl) html += `<div class="detail-line"><strong>Photo:</strong> <img src="${c.imageUrl}" style="max-width:150px; border-radius:8px;"></div>`;
                html += `</div>`;
            });
        } else if (record.criminalDetails) {
            html += `<div class="section-title"><i class="fas fa-skull-crosswalk"></i> Criminal Details</div>`;
            html += `<div class="sub-section">`;
            html += `<div class="detail-line"><strong>Name:</strong> ${record.criminalDetails.name || record.criminalDetails.cName || 'N/A'}</div>`;
            html += `<div class="detail-line"><strong>Age:</strong> ${record.criminalDetails.age || record.criminalDetails.cAge || 'N/A'}</div>`;
            html += `<div class="detail-line"><strong>Address:</strong> ${record.criminalDetails.address || record.criminalDetails.cAddress || 'N/A'}</div>`;
            html += `<div class="detail-line"><strong>Marks:</strong> ${record.criminalDetails.marks || record.criminalDetails.cMarks || 'N/A'}</div>`;
            html += `<div class="detail-line"><strong>Extra:</strong> ${record.criminalDetails.extra || record.criminalDetails.cExtra || 'N/A'}</div>`;
            html += `</div>`;
        }

        // Evidence
        if (record.evidence && record.evidence.length > 0) {
            html += `<div class="section-title"><i class="fas fa-cloud-upload-alt"></i> Evidence Files</div>`;
            html += `<div class="sub-section">`;
            record.evidence.forEach(url => {
                let ext = url.split('.').pop().toLowerCase();
                if (url.match(/\.(jpg|jpeg|png|gif|webp)$/i)) {
                    html += `<div class="evidence-item"><img src="${url}" class="evidence-img" onclick="window.open('${url}','_blank')"></div>`;
                } else if (url.match(/\.(mp4|webm|ogg)$/i)) {
                    html += `<div class="evidence-item"><video controls class="evidence-video"><source src="${url}"></video></div>`;
                } else if (url.match(/\.(mp3|wav|ogg)$/i)) {
                    html += `<div class="evidence-item"><audio controls><source src="${url}"></audio></div>`;
                } else {
                    html += `<div class="evidence-item"><i class="fas fa-file"></i> <a href="${url}" target="_blank">View File</a></div>`;
                }
            });
            html += `</div>`;
        }

        // Judgement
        if (record.judgement) {
            html += `<div class="section-title"><i class="fas fa-gavel"></i> Court Judgement</div>`;
            html += `<div class="detail-line">${record.judgement}</div>`;
        }

        document.getElementById("modalBody").innerHTML = html;
        document.getElementById("detailsModal").style.display = "flex";
    }

    function closeModal() { document.getElementById("detailsModal").style.display = "none"; }

    // ========== EDIT MODAL FUNCTIONS (unchanged from previous working version) ==========
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
            if(!currentEditData.victims) currentEditData.victims = [];
            if(!currentEditData.witnesses) currentEditData.witnesses = [];
            if(!currentEditData.suspects) currentEditData.suspects = [];
            if(!currentEditData.criminals) currentEditData.criminals = [];
            existingEvidenceUrls = currentEditData.evidence || [];
            newEvidenceFiles = [];
            renderFullEditForm();
        }
        document.getElementById("editModal").style.display = "flex";
    }
    
    function renderArrestedEditForm() {
        let container = document.getElementById("editFormContainer");
        container.innerHTML = `
            <div class="info-message">
                <i class="fas fa-gavel"></i> This case is marked as <strong>Arrested</strong>. You can only enter the final judgement and close the case.
            </div>
            <div class="judgement-area" style="display:block;">
                <label>Final Court Judgement:</label>
                <textarea id="arrestedJudgement" rows="4" placeholder="Enter detailed judgement, sentence, etc.">${escapeHtml(currentEditData.judgement || '')}</textarea>
            </div>
            <button class="save-btn" onclick="closeArrestedCase()"><i class="fas fa-check-circle"></i> Close Case (Submit Judgement)</button>
        `;
    }
    
    function renderFullEditForm() {
        let container = document.getElementById("editFormContainer");
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
                    <i class="fas fa-plus"></i> Add Evidence (Image/Audio/Video)
                </div>
                <input type="file" id="evidenceFileInput" accept="image/*,audio/*,video/*" style="display:none" onchange="addNewEvidenceFile(this)">
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
        
        let evidenceDiv = document.getElementById("evidenceList");
        existingEvidenceUrls.forEach((url, idx) => {
            addEvidenceItemToGrid(url, idx, true);
        });
        window.workflowStatus = currentEditData.status || 'Pending';
    }
    
    function renderPersonSection(type, dataArray) {
        let typeLabel = {victim:'Victim', witness:'Witness', suspect:'Suspect', criminal:'Criminal'}[type];
        let icon = type === 'victim' ? 'fa-user-injured' : (type === 'witness' ? 'fa-user' : (type === 'suspect' ? 'fa-user-secret' : 'fa-skull-crosswalk'));
        if (!dataArray) dataArray = [];
        let cardsHtml = '';
        dataArray.forEach((person, idx) => {
            const personId = `${type}_${Date.now()}_${idx}`;
            const imageUrl = person.imageUrl || '';
            let previewContent = '';
            if (imageUrl) {
                previewContent = `<img src="${imageUrl}" alt="Preview">`;
            } else {
                previewContent = `<i class="fas fa-user"></i><span>Click to upload photo</span>`;
            }
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
                            <div class="person-details">
                                ${getPersonFields(type, person, idx)}
                            </div>
                        </div>
                    </div>
                </div>
            `;
        });
        let addButton = `<div class="btn-add-person" onclick="addPerson('${type}')"><i class="fas fa-plus"></i> Add ${typeLabel}</div>`;
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
        if(type === 'victim') newPerson = { name: '', age: '', contact: '', address: '', idProof: '', occupation: '', imageUrl: null };
        else if(type === 'witness') newPerson = { name: '', age: '', contact: '', address: '', statement: '', imageUrl: null };
        else if(type === 'suspect') newPerson = { name: '', age: '', gender: 'Male', height: '', build: '', marks: '', lastSeen: '', imageUrl: null };
        else if(type === 'criminal') newPerson = { name: '', alias: '', age: '', gender: 'Male', address: '', record: '', history: '', imageUrl: null };
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
        const card = document.querySelector(`.person-card[data-type="${type}"][data-idx="${idx}"]`);
        const previewDiv = card.querySelector('.image-preview');
        const reader = new FileReader();
        reader.onload = function(e) {
            previewDiv.innerHTML = `<img src="${e.target.result}" alt="Preview">`;
            const removeBtn = card.querySelector('.remove-image');
            if (removeBtn) removeBtn.style.display = 'flex';
        };
        reader.readAsDataURL(file);
        const refId = currentEditData.refID;
        const path = `firs/${refId}/${type}_${idx}_${Date.now()}.jpg`;
        const storageRef = storage.ref().child(path);
        await storageRef.put(file);
        const url = await storageRef.getDownloadURL();
        currentEditData[type+'s'][idx].imageUrl = url;
    };
    
    window.removePersonImage = function(type, idx, personId) {
        const card = document.querySelector(`.person-card[data-type="${type}"][data-idx="${idx}"]`);
        const previewDiv = card.querySelector('.image-preview');
        previewDiv.innerHTML = `<i class="fas fa-user"></i><span>Click to upload photo</span>`;
        const removeBtn = card.querySelector('.remove-image');
        if (removeBtn) removeBtn.style.display = 'none';
        if (currentEditData[type+'s'][idx]) {
            currentEditData[type+'s'][idx].imageUrl = null;
        }
    };
    
    function addNewEvidenceFile(input) {
        if(!input.files.length) return;
        const file = input.files[0];
        newEvidenceFiles.push(file);
        const idx = newEvidenceFiles.length - 1;
        const url = URL.createObjectURL(file);
        addEvidenceItemToGrid(url, idx, false);
        input.value = '';
    }
    
    function addEvidenceItemToGrid(url, idx, isExisting) {
        let div = document.createElement('div');
        div.className = 'evidence-item-edit';
        div.setAttribute('data-idx', idx);
        div.setAttribute('data-existing', isExisting);
        if(url.match(/\.(jpg|jpeg|png|gif|webp)$/i) || (!isExisting && url.startsWith('blob:'))) {
            div.innerHTML = `<img src="${url}" style="max-width:100%; max-height:80px;"><div class="remove-evidence" onclick="removeEvidenceItem(${idx}, ${isExisting})">×</div>`;
        } else if(url.match(/\.(mp4|webm|ogg)$/i)) {
            div.innerHTML = `<video controls style="max-width:100%; max-height:80px;"><source src="${url}"></video><div class="remove-evidence" onclick="removeEvidenceItem(${idx}, ${isExisting})">×</div>`;
        } else if(url.match(/\.(mp3|wav|ogg)$/i)) {
            div.innerHTML = `<audio controls style="width:100%;"><source src="${url}"></audio><div class="remove-evidence" onclick="removeEvidenceItem(${idx}, ${isExisting})">×</div>`;
        } else {
            div.innerHTML = `<i class="fas fa-file"></i><p>${url.substring(0,30)}...</p><div class="remove-evidence" onclick="removeEvidenceItem(${idx}, ${isExisting})">×</div>`;
        }
        document.getElementById("evidenceList").appendChild(div);
    }
    
    window.removeEvidenceItem = function(idx, isExisting) {
        if(isExisting) {
            existingEvidenceUrls.splice(idx, 1);
        } else {
            newEvidenceFiles.splice(idx, 1);
        }
        renderFullEditForm();
    };
    
    async function uploadNewEvidenceFiles(refId) {
        const uploadedUrls = [];
        for(let file of newEvidenceFiles) {
            const ext = file.name.split('.').pop();
            const path = `firs/${refId}/evidence_${Date.now()}_${Math.random()}.${ext}`;
            const storageRef = storage.ref().child(path);
            await storageRef.put(file);
            const url = await storageRef.getDownloadURL();
            uploadedUrls.push(url);
        }
        return uploadedUrls;
    }
    
    window.setWorkflowStatus = function(status) {
        window.workflowStatus = status;
        document.querySelectorAll('.workflow-btn').forEach(btn => btn.classList.remove('active'));
        event.target.classList.add('active');
    };
    
    async function saveFullCaseUpdates() {
        let victims = collectPersons('victim');
        let witnesses = collectPersons('witness');
        let suspects = collectPersons('suspect');
        let criminals = collectPersons('criminal');
        let propertySeizure = document.getElementById("editPropertySeizure")?.value || '';
        let newEvidenceUrls = [];
        if(newEvidenceFiles.length > 0) {
            newEvidenceUrls = await uploadNewEvidenceFiles(currentEditData.refID);
        }
        const allEvidenceUrls = [...existingEvidenceUrls, ...newEvidenceUrls];
        let updatePayload = {
            victims: victims,
            witnesses: witnesses,
            suspects: suspects,
            criminals: criminals,
            victimCount: victims.length,
            witnessCount: witnesses.length,
            suspectCount: suspects.length,
            criminalCount: criminals.length,
            propertySeizure: propertySeizure,
            evidence: allEvidenceUrls,
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
    
    function collectPersons(type) {
        let persons = [];
        let cards = document.querySelectorAll(`.person-card[data-type="${type}"]`);
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
            let existing = currentEditData[type+'s']?.[idx];
            if(existing && existing.imageUrl && !person.imageUrl) person.imageUrl = existing.imageUrl;
            persons.push(person);
        });
        return persons;
    }
    
    async function closeArrestedCase() {
        let judgement = document.getElementById("arrestedJudgement")?.value.trim();
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
    
    window.onload = loadFIRData;