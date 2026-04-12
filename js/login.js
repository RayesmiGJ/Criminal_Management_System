// Firebase Config
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
db.enablePersistence({ synchronizeTabs: true }).catch(() => {});

const OFFICER_CACHE_KEY = 'cachedOfficers_v1';
let currentRole = 'officer';
let officersList = [];

window.onload = async function () {
    if (sessionStorage.getItem('isLoggedIn') === 'true') {
        const role = (sessionStorage.getItem('userRole') || '').toLowerCase();
        window.location.replace(role === 'admin' ? 'admin_home.html' : 'home.html');
        return;
    }

    generateCaptcha();
    await loadOfficersFromFirestore();

    document.getElementById('password').addEventListener('keypress', e => {
        if (e.key === 'Enter') validateLogin();
    });
    document.getElementById('adminPassword').addEventListener('keypress', e => {
        if (e.key === 'Enter') validateLogin();
    });
    document.getElementById('captchaInput').addEventListener('keypress', e => {
        if (e.key === 'Enter') validateLogin();
    });
};

function cacheOfficers(list) {
    try {
        localStorage.setItem(OFFICER_CACHE_KEY, JSON.stringify({
            savedAt: Date.now(),
            officers: list
        }));
    } catch (e) {
        console.warn('Could not cache officers:', e);
    }
}

function readCachedOfficers() {
    try {
        const raw = localStorage.getItem(OFFICER_CACHE_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed.officers) ? parsed.officers : [];
    } catch (e) {
        return [];
    }
}

function renderOfficerOptions(list, fromCache) {
    const selectEl = document.getElementById('officerSelect');
    officersList = list;
    selectEl.innerHTML = '<option value="">-- Select Officer --</option>';

    list.forEach(officer => {
        const option = document.createElement('option');
        option.value = officer.id;
        option.textContent = `${officer.name || 'Unknown'} (${officer.rank || 'Officer'}, ${officer.division || 'N/A'})`;
        selectEl.appendChild(option);
    });

    if (list.length === 0) {
        selectEl.innerHTML = `<option value="">${fromCache ? 'No cached officers found. Connect internet once.' : 'No officers found. Please ask admin to add.'}</option>`;
    }
}

// Load officers from Firestore with offline fallback
async function loadOfficersFromFirestore() {
    const selectEl = document.getElementById('officerSelect');
    selectEl.innerHTML = '<option value="">Loading officers...</option>';

    try {
        const snapshot = await db.collection('users').where('role', '==', 'officer').get();
        const fetched = [];
        snapshot.forEach(doc => fetched.push({ id: doc.id, ...doc.data() }));

        renderOfficerOptions(fetched, false);
        if (fetched.length) cacheOfficers(fetched);
    } catch (error) {
        console.warn('Online officer load failed, using cache:', error);
        const cached = readCachedOfficers();
        renderOfficerOptions(cached, true);
    }
}

function selectRole(role) {
    currentRole = role;
    document.querySelectorAll('.role-option').forEach(opt => opt.classList.remove('selected'));
    document.querySelector(`.role-option[data-role="${role}"]`).classList.add('selected');

    if (role === 'officer') {
        document.getElementById('officerFields').style.display = 'block';
        document.getElementById('adminFields').style.display = 'none';
    } else {
        document.getElementById('officerFields').style.display = 'none';
        document.getElementById('adminFields').style.display = 'block';
    }
}

function generateCaptcha() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789abcdefghijklmnopqrstuvwxyz';
    let captcha = '';
    for (let i = 0; i < 6; i++) captcha += chars.charAt(Math.floor(Math.random() * chars.length));
    document.getElementById('captchaCode').textContent = captcha;
}

// Record login in Firestore
async function recordOfficerLogin(officerData) {
    const record = {
        officerId: officerData.officerId,
        officerName: officerData.name,
        rank: officerData.rank,
        phoneNumber: officerData.phone,
        email: officerData.email,
        loginTime: firebase.firestore.FieldValue.serverTimestamp(),
        status: 'active',
        sessionId: Date.now().toString(),
        badgeNo: officerData.badgeNo,
        division: officerData.division
    };

    try {
        await db.collection('officerLogs').add(record);
    } catch (e) {
        // Keep login flow non-blocking on poor/offline network.
        console.warn('Login record failed:', e);
    }
}

async function validateLogin() {
    const captchaInput = document.getElementById('captchaInput').value.trim();
    const captchaCode = document.getElementById('captchaCode').textContent;
    const officerPassword = document.getElementById('password').value.trim();
    const adminPassword = document.getElementById('adminPassword').value.trim();
    const errorDiv = document.getElementById('errorMessage');

    errorDiv.style.display = 'none';

    if (!captchaInput) {
        errorDiv.textContent = 'Please fill captcha.';
        errorDiv.style.display = 'block';
        return;
    }

    if (captchaInput !== captchaCode) {
        errorDiv.textContent = 'Invalid captcha.';
        errorDiv.style.display = 'block';
        generateCaptcha();
        document.getElementById('captchaInput').value = '';
        return;
    }

    if (currentRole === 'admin') {
        const adminUsername = document.getElementById('adminUsername').value.trim();
        if (!adminUsername || !adminPassword) {
            errorDiv.textContent = 'Please enter admin username and password.';
            errorDiv.style.display = 'block';
            return;
        }

        if (adminUsername === 'admin' && adminPassword === 'admin123') {
            sessionStorage.setItem('isLoggedIn', 'true');
            sessionStorage.setItem('userRole', 'admin');
            sessionStorage.setItem('loggedInUser', JSON.stringify({
                name: 'System Administrator',
                role: 'admin',
                email: 'admin@police.gov.in'
            }));
            window.location.replace('admin_home.html');
        } else {
            errorDiv.textContent = 'Invalid Admin Credentials!';
            errorDiv.style.display = 'block';
        }

        return;
    }

    if (!officerPassword) {
        errorDiv.textContent = 'Please enter officer password.';
        errorDiv.style.display = 'block';
        return;
    }

    const selectedDocId = document.getElementById('officerSelect').value;
    if (!selectedDocId) {
        errorDiv.textContent = 'Please select an officer!';
        errorDiv.style.display = 'block';
        return;
    }

    const officer = officersList.find(o => o.id === selectedDocId);
    if (!officer) {
        errorDiv.textContent = 'Officer not found in loaded list.';
        errorDiv.style.display = 'block';
        return;
    }

    if ((officer.role || '').toLowerCase() !== 'officer') {
        errorDiv.textContent = 'Selected user does not have officer access.';
        errorDiv.style.display = 'block';
        return;
    }

    if (officerPassword === officer.password) {
        await recordOfficerLogin(officer);
        sessionStorage.setItem('isLoggedIn', 'true');
        sessionStorage.setItem('userRole', 'officer');
        sessionStorage.setItem('loggedInUser', JSON.stringify(officer));
        window.location.replace('home.html');
    } else {
        errorDiv.textContent = 'Invalid password!';
        errorDiv.style.display = 'block';
    }
}

function clearForm() {
    document.getElementById('officerSelect').value = '';
    document.getElementById('password').value = '';
    document.getElementById('captchaInput').value = '';
    document.getElementById('adminUsername').value = '';
    document.getElementById('adminPassword').value = '';
    generateCaptcha();
    document.getElementById('errorMessage').style.display = 'none';
}