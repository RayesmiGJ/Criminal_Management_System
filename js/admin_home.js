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

    let currentUser = null;

    function loadUserProfile() {
        const userDataStr = sessionStorage.getItem('loggedInUser');
        const userRole = sessionStorage.getItem('userRole');
        if (!userDataStr || userRole !== 'admin') { window.location.replace('index.html'); return; }
        currentUser = JSON.parse(userDataStr);
        document.getElementById('userNameDisplay').textContent = 'Admin';
        document.getElementById('profileName').textContent = 'System Administrator';
        document.getElementById('profileRank').textContent = 'Administrator';
        document.getElementById('profileDetails').innerHTML = `
            <div class="profile-detail-row"><i class="fas fa-envelope"></i><span class="detail-label">Email:</span><span class="detail-value">${currentUser.email || 'admin@police.gov.in'}</span></div>
            <div class="profile-detail-row"><i class="fas fa-shield-alt"></i><span class="detail-label">Role:</span><span class="detail-value">Administrator</span></div>
            <div class="profile-badge"><i class="fas fa-crown"></i> Full System Access</div>
        `;
    }

    async function handleLogout() {
        sessionStorage.clear();
        window.location.replace('index.html');
    }

    function navigateTo(page) { window.location.href = page; }
    function toggleMenu() { document.getElementById('navLinks').classList.toggle('active'); }

    // Officer Management Functions
    async function loadOfficersForAdmin() {
        const container = document.getElementById('officerList');
        try {
            const snapshot = await db.collection('users').where('role', '==', 'officer').get();
            if (snapshot.empty) {
                container.innerHTML = '<p>No officers found. Add one above.</p>';
                return;
            }
            let html = '';
            snapshot.forEach(doc => {
                const data = doc.data();
                html += `
                    <div class="officer-item">
                        <div><strong>${data.name}</strong><br><small>${data.rank} | ${data.badgeNo}</small></div>
                        <div>
                            <button onclick="editOfficer('${doc.id}', '${data.name}', '${data.rank}', '${data.badgeNo}', '${data.phone}', '${data.email}', '${data.division}', '${data.unit}', '${data.joinDate}', '${data.officerId}')">Edit</button>
                            <button onclick="deleteOfficer('${doc.id}')">Delete</button>
                        </div>
                    </div>
                `;
            });
            container.innerHTML = html;
        } catch (error) {
            console.error(error);
            container.innerHTML = '<p>Error loading officers</p>';
        }
    }

    function openOfficerModal() {
        document.getElementById('officerModal').style.display = 'flex';
        document.getElementById('editOfficerId').value = '';
        document.getElementById('officerName').value = '';
        document.getElementById('officerRank').value = '';
        document.getElementById('officerBadge').value = '';
        document.getElementById('officerPhone').value = '';
        document.getElementById('officerEmail').value = '';
        document.getElementById('officerDivision').value = '';
        document.getElementById('officerUnit').value = '';
        document.getElementById('officerJoinDate').value = '';
        document.getElementById('officerId').value = '';
        document.getElementById('officerPassword').value = '';
        loadOfficersForAdmin();
    }

    function closeOfficerModal() {
        document.getElementById('officerModal').style.display = 'none';
    }

    async function saveOfficer() {
        const editId = document.getElementById('editOfficerId').value;
        const officerData = {
            name: document.getElementById('officerName').value,
            rank: document.getElementById('officerRank').value,
            badgeNo: document.getElementById('officerBadge').value,
            phone: document.getElementById('officerPhone').value,
            email: document.getElementById('officerEmail').value,
            division: document.getElementById('officerDivision').value,
            unit: document.getElementById('officerUnit').value,
            joinDate: document.getElementById('officerJoinDate').value,
            officerId: document.getElementById('officerId').value,
            password: document.getElementById('officerPassword').value,
            role: 'officer'
        };
        if (!officerData.name || !officerData.password) {
            alert('Please fill at least name and password');
            return;
        }
        try {
            if (editId) {
                await db.collection('users').doc(editId).update(officerData);
                alert('Officer updated');
            } else {
                await db.collection('users').add(officerData);
                alert('Officer added');
            }
            closeOfficerModal();
            openOfficerModal(); // refresh
        } catch (error) {
            console.error(error);
            alert('Error saving officer');
        }
    }

    function editOfficer(id, name, rank, badge, phone, email, division, unit, joinDate, officerId) {
        document.getElementById('editOfficerId').value = id;
        document.getElementById('officerName').value = name;
        document.getElementById('officerRank').value = rank;
        document.getElementById('officerBadge').value = badge;
        document.getElementById('officerPhone').value = phone;
        document.getElementById('officerEmail').value = email;
        document.getElementById('officerDivision').value = division;
        document.getElementById('officerUnit').value = unit;
        document.getElementById('officerJoinDate').value = joinDate;
        document.getElementById('officerId').value = officerId;
        document.getElementById('officerPassword').value = ''; // leave empty to keep old
    }

    async function deleteOfficer(id) {
        if (confirm('Delete this officer permanently?')) {
            await db.collection('users').doc(id).delete();
            openOfficerModal(); // refresh
        }
    }

    (function checkAuth() {
        if (sessionStorage.getItem('isLoggedIn') !== 'true' || sessionStorage.getItem('userRole') !== 'admin') {
            window.location.replace('index.html');
        }
        loadUserProfile();
    })();

    window.onclick = function(event) {
        const modal = document.getElementById('officerModal');
        if (event.target === modal) closeOfficerModal();
    };
