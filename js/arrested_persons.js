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

    let arrestedData = [];

    // Helper: extract criminal details (handles new & old format)
    function getCriminalDetails(record) {
        if (record.criminals && record.criminals.length > 0) {
            return record.criminals[0];
        }
        if (record.criminalDetails) {
            return {
                name: record.criminalDetails.name || record.criminalDetails.cName,
                age: record.criminalDetails.age || record.criminalDetails.cAge,
                address: record.criminalDetails.address || record.criminalDetails.cAddress,
                marks: record.criminalDetails.marks || record.criminalDetails.cMarks,
                extra: record.criminalDetails.extra || record.criminalDetails.cExtra,
                imageUrl: record.criminalDetails.imageUrl,
                alias: record.criminalDetails.alias,
                gender: record.criminalDetails.gender,
                record: record.criminalDetails.record,
                history: record.criminalDetails.history
            };
        }
        return null;
    }

    async function loadArrestedData() {
        const grid = document.getElementById('arrestedGrid');
        grid.innerHTML = '<div style="grid-column:1/-1; text-align:center; padding:50px;">Loading intelligence data...</div>';
        
        const snapshot = await db.collection("firs").where("status", "in", ["Arrested", "Case Closed"]).get();
        arrestedData = [];
        const categories = new Set();

        for (const doc of snapshot.docs) {
            const record = doc.data();
            const criminal = getCriminalDetails(record);
            if (criminal && criminal.name) {
                categories.add(record.category || 'Unknown');
                arrestedData.push({
                    id: doc.id,
                    refID: record.refID || record.refNo,
                    criminal: criminal,
                    category: record.category || 'Unknown',
                    status: record.status,
                    judgement: record.judgement,
                    date: record.date,
                    incidentLocation: record.incidentLocation,
                    complaint: record.complaint,
                    incidentDescription: record.incidentDescription,
                    propertySeizure: record.propertySeizure
                });
            }
        }

        // Populate category filter
        const catFilter = document.getElementById('categoryFilter');
        catFilter.innerHTML = '<option value="">All Crime Categories</option>';
        Array.from(categories).sort().forEach(cat => {
            const opt = document.createElement('option');
            opt.value = cat;
            opt.textContent = cat;
            catFilter.appendChild(opt);
        });

        renderCards(arrestedData);
    }

    function renderCards(data) {
        const grid = document.getElementById('arrestedGrid');
        if (data.length === 0) {
            grid.innerHTML = '<div style="grid-column:1/-1; text-align:center; padding:50px;">No arrested persons found.</div>';
            return;
        }

        grid.innerHTML = '';
        data.forEach(item => {
            const card = document.createElement('div');
            card.className = 'arrested-card';
            card.onclick = () => showDetails(item);
            
            const photoUrl = item.criminal.imageUrl;
            const photoHtml = photoUrl 
                ? `<img src="${photoUrl}" class="card-photo" onerror="this.src='https://via.placeholder.com/70?text=No+Image'">`
                : `<div class="card-photo-placeholder"><i class="fas fa-user"></i></div>`;
            
            const statusClass = item.status === 'Arrested' ? 'status-arrested' : 'status-closed';
            
            card.innerHTML = `
                <div class="card-header">
                    ${photoHtml}
                    <div class="card-title">
                        <h3>${escapeHtml(item.criminal.name)}</h3>
                        <div class="ref-id">${item.refID}</div>
                    </div>
                    <div><span class="status-badge ${statusClass}">${item.status}</span></div>
                </div>
                <div class="card-body">
                    <div class="info-item"><i class="fas fa-birthday-cake"></i> Age: ${item.criminal.age || 'N/A'}</div>
                    <div class="info-item"><i class="fas fa-folder"></i> Crime: ${item.category}</div>
                    <div class="info-item"><i class="fas fa-calendar"></i> Date: ${item.date || 'N/A'}</div>
                    <div class="info-item"><i class="fas fa-map-marker-alt"></i> Location: ${item.incidentLocation ? item.incidentLocation.substring(0,30) : 'N/A'}</div>
                </div>
                <div class="card-footer">
                    <button class="btn-details" onclick="event.stopPropagation(); showDetails(${JSON.stringify(item).replace(/'/g, "&#39;")})">View Full Details</button>
                </div>
            `;
            grid.appendChild(card);
        });
    }

    function filterCards() {
        const search = document.getElementById('searchInput').value.toLowerCase();
        const category = document.getElementById('categoryFilter').value;
        const fromDate = document.getElementById('dateFrom').value;
        const toDate = document.getElementById('dateTo').value;

        let filtered = [...arrestedData];
        if (search) {
            filtered = filtered.filter(item => 
                item.refID.toLowerCase().includes(search) || 
                (item.criminal.name && item.criminal.name.toLowerCase().includes(search))
            );
        }
        if (category) {
            filtered = filtered.filter(item => item.category === category);
        }
        if (fromDate) {
            filtered = filtered.filter(item => item.date && item.date >= fromDate);
        }
        if (toDate) {
            filtered = filtered.filter(item => item.date && item.date <= toDate);
        }
        renderCards(filtered);
    }

    function showDetails(item) {
        const criminal = item.criminal;
        const modalBody = document.getElementById('modalBody');
        let photoHtml = '';
        if (criminal.imageUrl) {
            photoHtml = `<div><img src="${criminal.imageUrl}" class="modal-photo" alt="Criminal Photo"></div>`;
        }
        modalBody.innerHTML = `
            ${photoHtml}
            <div class="detail-line"><strong>Case ID:</strong> ${item.refID}</div>
            <div class="detail-line"><strong>Crime Category:</strong> ${item.category}</div>
            <div class="detail-line"><strong>Criminal Name:</strong> ${criminal.name || 'N/A'}</div>
            <div class="detail-line"><strong>Alias:</strong> ${criminal.alias || 'N/A'}</div>
            <div class="detail-line"><strong>Age:</strong> ${criminal.age || 'N/A'}</div>
            <div class="detail-line"><strong>Gender:</strong> ${criminal.gender || 'N/A'}</div>
            <div class="detail-line"><strong>Address:</strong> ${criminal.address || 'N/A'}</div>
            <div class="detail-line"><strong>Distinguishing Marks:</strong> ${criminal.marks || 'N/A'}</div>
            <div class="detail-line"><strong>Previous Record:</strong> ${criminal.record || 'N/A'}</div>
            <div class="detail-line"><strong>Criminal History:</strong> ${criminal.history || 'N/A'}</div>
            <div class="detail-line"><strong>Incident Location:</strong> ${item.incidentLocation || 'N/A'}</div>
            <div class="detail-line"><strong>Date of Incident:</strong> ${item.date || 'N/A'}</div>
            <div class="detail-line"><strong>Status:</strong> ${item.status}</div>
            ${item.status === 'Case Closed' && item.judgement ? `<div class="detail-line"><strong>Judgement:</strong> ${item.judgement}</div>` : ''}
        `;
        document.getElementById('detailsModal').style.display = 'flex';
    }

    function closeModal() { document.getElementById('detailsModal').style.display = 'none'; }

    function exportToCSV() {
        let csvRows = [["Ref ID", "Criminal Name", "Age", "Gender", "Crime Category", "Arrest Date", "Status", "Address", "Previous Record", "Judgement"]];
        arrestedData.forEach(item => {
            csvRows.push([
                item.refID,
                item.criminal.name || '',
                item.criminal.age || '',
                item.criminal.gender || '',
                item.category,
                item.date || '',
                item.status,
                item.criminal.address || '',
                item.criminal.record || '',
                item.status === 'Case Closed' ? (item.judgement || '') : ''
            ]);
        });
        const csvContent = csvRows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(",")).join("\n");
        const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8;" });
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = `arrested_persons_${new Date().toISOString().slice(0,10)}.csv`;
        link.click();
        URL.revokeObjectURL(link.href);
    }

    function escapeHtml(str) {
        if (!str) return '';
        return str.replace(/[&<>]/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[m]));
    }

    window.onload = loadArrestedData;
