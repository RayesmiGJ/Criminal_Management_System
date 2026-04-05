    const firebaseConfig = {
        apiKey: "AIzaSyBnMI6S8fig-fl8exIAt5tDz9qWWrWGHAM",
        authDomain: "crime-management-fdd43.firebaseapp.com",
        projectId: "crime-management-fdd43",
        storageBucket: "crime-management-fdd43.appspot.com",
        messagingSenderId: "990509285734",
        appId: "1:990509285734:web:4798f9666ff2dea537c8a7"
    };
    
    if (!firebase.apps.length) {
        firebase.initializeApp(firebaseConfig);
    }
    const db = firebase.firestore();

    let currentUser = null;
    let userRole = null;
    let heartbeatInterval = null;

    // ========== HEARTBEAT: Update lastHeartbeat every 30 seconds ==========
    async function updateHeartbeat() {
        if (!currentUser || userRole !== 'officer' || !currentUser.officerId) return;
        try {
            const snapshot = await db.collection('officerLogs')
                .where('officerId', '==', currentUser.officerId)
                .where('status', '==', 'active')
                .get();
            const batch = db.batch();
            snapshot.forEach(doc => {
                batch.update(doc.ref, { lastHeartbeat: firebase.firestore.FieldValue.serverTimestamp() });
            });
            await batch.commit();
            console.log("Heartbeat updated");
        } catch (err) {
            console.warn("Heartbeat failed", err);
        }
    }

    function startHeartbeat() {
        if (heartbeatInterval) clearInterval(heartbeatInterval);
        updateHeartbeat(); // immediate first ping
        heartbeatInterval = setInterval(updateHeartbeat, 30000); // every 30 sec
    }

    function stopHeartbeat() {
        if (heartbeatInterval) {
            clearInterval(heartbeatInterval);
            heartbeatInterval = null;
        }
    }

    // ========== LOGOUT RECORDING (improved) ==========
    async function recordOfficerLogout(officerId, retries = 2) {
        if (!officerId) return false;
        try {
            const snapshot = await db.collection('officerLogs')
                .where('officerId', '==', officerId)
                .where('status', '==', 'active')
                .get();
            if (snapshot.empty) return false;
            const batch = db.batch();
            snapshot.forEach(doc => {
                const data = doc.data();
                const loginTime = data.loginTime?.toDate() || new Date();
                const sessionDuration = Math.round((new Date() - loginTime) / 1000 / 60);
                batch.update(doc.ref, {
                    status: 'loggedout',
                    logoutTime: firebase.firestore.FieldValue.serverTimestamp(),
                    sessionDuration: sessionDuration
                });
            });
            await batch.commit();
            return true;
        } catch (err) {
            console.error(err);
            if (retries > 0) {
                await new Promise(r => setTimeout(r, 500));
                return recordOfficerLogout(officerId, retries - 1);
            }
            return false;
        }
    }

    // ========== LOGOUT BUTTON HANDLER ==========
    async function handleLogout() {
        const logoutBtn = document.getElementById('logoutButton');
        logoutBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Logging out...';
        logoutBtn.disabled = true;
        
        if (userRole === 'officer' && currentUser?.officerId) {
            await recordOfficerLogout(currentUser.officerId);
        }
        stopHeartbeat();
        sessionStorage.clear();
        window.location.replace('index.html');
    }

    // ========== BEFOREUNLOAD – try to record logout, but heartbeat will clean up if it fails ==========
    window.addEventListener('beforeunload', () => {
        if (userRole === 'officer' && currentUser?.officerId) {
            recordOfficerLogout(currentUser.officerId); // best effort
        }
    });

    // ========== LOAD USER PROFILE ==========
    function loadUserProfile() {
        const userDataStr = sessionStorage.getItem('loggedInUser');
        userRole = sessionStorage.getItem('userRole');
        if (!userDataStr) {
            window.location.replace('index.html');
            return;
        }
        currentUser = JSON.parse(userDataStr);
        console.log("User loaded:", currentUser.name, "Role:", userRole, "OfficerId:", currentUser.officerId);
        
        document.getElementById('welcomeTitle').innerHTML = 'Central Command Dashboard';
        document.getElementById('userNameDisplay').textContent = userRole === 'admin' ? 'Admin' : (currentUser.name?.split(' ')[0] || 'Officer');
        document.getElementById('profileName').textContent = userRole === 'admin' ? 'System Administrator' : currentUser.name;
        document.getElementById('profileRank').textContent = userRole === 'admin' ? 'Administrator' : (currentUser.rank || 'Officer');
        
        const profileDetails = document.getElementById('profileDetails');
        if (userRole === 'admin') {
            profileDetails.innerHTML = `
                <div class="profile-detail-row"><i class="fas fa-envelope"></i><span class="detail-label">Email:</span><span class="detail-value">${currentUser.email || 'admin@police.gov.in'}</span></div>
                <div class="profile-detail-row"><i class="fas fa-shield-alt"></i><span class="detail-label">Role:</span><span class="detail-value">Administrator</span></div>
                <div class="profile-badge"><i class="fas fa-crown"></i> Full System Access</div>
            `;
        } else {
            profileDetails.innerHTML = `
                <div class="profile-detail-row"><i class="fas fa-id-card"></i><span class="detail-label">Badge No:</span><span class="detail-value">${currentUser.badgeNo || '-'}</span></div>
                <div class="profile-detail-row"><i class="fas fa-phone"></i><span class="detail-label">Phone:</span><span class="detail-value">${currentUser.phone || '-'}</span></div>
                <div class="profile-detail-row"><i class="fas fa-envelope"></i><span class="detail-label">Email:</span><span class="detail-value">${currentUser.email || '-'}</span></div>
                <div class="profile-detail-row"><i class="fas fa-building"></i><span class="detail-label">Division:</span><span class="detail-value">${currentUser.division || '-'}</span></div>
                <div class="profile-detail-row"><i class="fas fa-calendar-alt"></i><span class="detail-label">Joined:</span><span class="detail-value">${currentUser.joinDate || '-'}</span></div>
                <div class="profile-badge"><i class="fas fa-badge-check"></i> ${currentUser.unit || 'Police Unit'}</div>
            `;
            // Start heartbeat only for officers
            startHeartbeat();
        }
    }
    
    document.getElementById('logoutButton').addEventListener('click', handleLogout);
    
    // ========== AUTH CHECK ==========
    (function checkAuth() {
        if (sessionStorage.getItem('isLoggedIn') !== 'true') {
            window.location.replace('index.html');
            return;
        }
        loadUserProfile();
        setInterval(checkSession, 1000);
    })();

    function checkSession() {
        if (sessionStorage.getItem('isLoggedIn') !== 'true') {
            window.location.replace('index.html');
        }
    }

    function navigateTo(page) {
        if (sessionStorage.getItem('isLoggedIn') !== 'true') {
            window.location.replace('index.html');
            return;
        }
        window.location.href = page;
    }

    function toggleMenu() {
        document.getElementById('navLinks').classList.toggle('active');
    }

    window.addEventListener('pageshow', (event) => {
        if (event.persisted || (window.performance?.navigation?.type === 2)) {
            if (sessionStorage.getItem('isLoggedIn') !== 'true') window.location.replace('index.html');
        }
    });

    history.pushState(null, null, location.href);
    window.addEventListener('popstate', () => {
        if (sessionStorage.getItem('isLoggedIn') !== 'true') window.location.replace('index.html');
        else history.pushState(null, null, location.href);
    });
