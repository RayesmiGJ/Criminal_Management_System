
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

    let currentRole = 'officer';
    let officersList = []; // store fetched officers

    window.onload = async function() {
        if (sessionStorage.getItem('isLoggedIn') === 'true') {
            window.location.href = "home.html";
        }
        generateCaptcha();
        await loadOfficersFromFirestore();
        document.getElementById('password').addEventListener('keypress', e => { if(e.key === 'Enter') validateLogin(); });
        document.getElementById('captchaInput').addEventListener('keypress', e => { if(e.key === 'Enter') validateLogin(); });
    };

    // Load officers from Firestore
    async function loadOfficersFromFirestore() {
        const selectEl = document.getElementById('officerSelect');
        selectEl.innerHTML = '<option value="">Loading officers...</option>';
        try {
            const snapshot = await db.collection('users').where('role', '==', 'officer').get();
            officersList = [];
            selectEl.innerHTML = '<option value="">-- Select Officer --</option>';
            snapshot.forEach(doc => {
                const data = doc.data();
                officersList.push({ id: doc.id, ...data });
                const option = document.createElement('option');
                option.value = doc.id;
                option.textContent = `${data.name} (${data.rank}, ${data.division})`;
                selectEl.appendChild(option);
            });
            if (officersList.length === 0) {
                selectEl.innerHTML = '<option value="">No officers found. Please ask admin to add.</option>';
            }
        } catch (error) {
            console.error("Error loading officers:", error);
            selectEl.innerHTML = '<option value="">Error loading officers</option>';
        }
    }

    function selectRole(role) {
        currentRole = role;
        document.querySelectorAll('.role-option').forEach(opt => opt.classList.remove('selected'));
        document.querySelector(`.role-option[data-role="${role}"]`).classList.add('selected');
        if(role === 'officer') {
            document.getElementById('officerFields').style.display = 'block';
            document.getElementById('adminFields').style.display = 'none';
        } else {
            document.getElementById('officerFields').style.display = 'none';
            document.getElementById('adminFields').style.display = 'block';
        }
    }

    function generateCaptcha() {
        const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789abcdefghijklmnopqrstuvwxyz";
        let captcha = "";
        for(let i=0; i<6; i++) captcha += chars.charAt(Math.floor(Math.random() * chars.length));
        document.getElementById("captchaCode").textContent = captcha;
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
            console.log('Login recorded');
        } catch(e) { console.warn('Login record failed', e); }
    }

    async function validateLogin() {
        const captchaInput = document.getElementById("captchaInput").value.trim();
        const captchaCode = document.getElementById("captchaCode").textContent;
        const password = document.getElementById("password").value.trim();
        const errorDiv = document.getElementById("errorMessage");

        errorDiv.style.display = "none";
        if(!password || !captchaInput) {
            errorDiv.textContent = "❌ Please fill all fields!";
            errorDiv.style.display = "block";
            return;
        }
        if(captchaInput !== captchaCode) {
            errorDiv.textContent = "❌ Invalid captcha.";
            errorDiv.style.display = "block";
            generateCaptcha();
            document.getElementById("captchaInput").value = "";
            return;
        }

        if(currentRole === 'admin') {
            const adminUsername = document.getElementById("adminUsername").value.trim();
            if(!adminUsername) {
                errorDiv.textContent = "❌ Please enter admin username!";
                errorDiv.style.display = "block";
                return;
            }
            // Hardcoded admin for simplicity (you can move admin to Firestore too)
            if(adminUsername === "admin" && password === "admin123") {
                sessionStorage.setItem('isLoggedIn', 'true');
                sessionStorage.setItem('userRole', 'admin');
                sessionStorage.setItem('loggedInUser', JSON.stringify({ name:"System Administrator", role:"admin", email:"admin@police.gov.in" }));
                window.location.href = "admin_home.html";
            } else {
                errorDiv.textContent = "❌ Invalid Admin Credentials!";
                errorDiv.style.display = "block";
            }
        } else {
            const selectedDocId = document.getElementById("officerSelect").value;
            if(!selectedDocId) {
                errorDiv.textContent = "❌ Please select an officer!";
                errorDiv.style.display = "block";
                return;
            }
            const officer = officersList.find(o => o.id === selectedDocId);
            if(!officer) {
                errorDiv.textContent = "❌ Officer not found!";
                errorDiv.style.display = "block";
                return;
            }
            // Check password (plain text stored in Firestore for demo)
            if(password === officer.password) {
                // Record login
                await recordOfficerLogin(officer);
                sessionStorage.setItem('isLoggedIn', 'true');
                sessionStorage.setItem('userRole', 'officer');
                sessionStorage.setItem('loggedInUser', JSON.stringify(officer));
                window.location.href = "home.html";
            } else {
                errorDiv.textContent = "❌ Invalid password!";
                errorDiv.style.display = "block";
            }
        }
    }

    function clearForm() {
        document.getElementById("officerSelect").value = "";
        document.getElementById("password").value = "";
        document.getElementById("captchaInput").value = "";
        document.getElementById("adminUsername").value = "";
        document.getElementById("adminPassword").value = "";
        generateCaptcha();
        document.getElementById("errorMessage").style.display = "none";
    }