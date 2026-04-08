    // ==================== FIREBASE CONFIGURATION ====================
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
    
    // ==================== DOM ELEMENTS ====================
    const modal = document.getElementById("myModal");
    const openModalBtn = document.getElementById("openModalBtn");
    const closeModalSpan = document.getElementById("closeModal");
    const form = document.getElementById("addMartyrForm");
    const tableBody = document.getElementById("tableBody");
    let currentPhotoBase64 = null;
    
    // Helper: format date from YYYY-MM-DD to DD-MM-YYYY
    function formatDate(dateStr) {
        if (!dateStr) return "N/A";
        const parts = dateStr.split("-");
        if (parts.length === 3) return `${parts[2]}-${parts[1]}-${parts[0]}`;
        return dateStr;
    }
    
    // Escape HTML
    function escapeHtml(str) {
        if (!str) return '';
        return str.replace(/[&<>]/g, function(m) {
            if (m === '&') return '&amp;';
            if (m === '<') return '&lt;';
            if (m === '>') return '&gt;';
            return m;
        });
    }
    
    // ==================== LOAD MARTYRS FROM FIRESTORE ====================
    async function loadMartyrs() {
        tableBody.innerHTML = '<tr><td colspan="7" class="loading">Loading martyrs...</td></tr>';
        try {
            const snapshot = await db.collection("martyrs").orderBy("martyrDate", "desc").get();
            if (snapshot.empty) {
                tableBody.innerHTML = '<tr><td colspan="7" class="loading">No records found. Add a martyr.</td></tr>';
                return;
            }
            let html = '';
            let sno = 1;
            snapshot.forEach(doc => {
                const data = doc.data();
                const joinDateFormatted = formatDate(data.joinDate);
                const martyrDateFormatted = formatDate(data.martyrDate);
                const photoHTML = data.photoBase64 ? 
                    `<img src="${data.photoBase64}" class="martyr-photo" alt="photo">` : 
                    '<span style="color:#94a3b8;">No photo</span>';
                html += `
                    <tr>
                        <td>${sno++}</td>
                        <td><strong>${escapeHtml(data.name)}</strong></td>
                        <td>${escapeHtml(data.rank)}</td>
                        <td>Joined: ${joinDateFormatted}<br>Martyred: ${martyrDateFormatted}</td>
                        <td>${escapeHtml(data.place)}</td>
                        <td style="max-width: 300px;">${escapeHtml(data.incident)}</td>
                        <td>${photoHTML}</td>
                    </tr>
                `;
            });
            tableBody.innerHTML = html;
        } catch (error) {
            console.error("Error loading martyrs:", error);
            tableBody.innerHTML = `<tr><td colspan="7" class="error-message">Error loading data: ${error.message}. Check Firestore rules.</td></tr>`;
        }
    }
    
    // ==================== IMAGE HANDLING (Base64) ====================
    function previewImage(input) {
        const file = input.files[0];
        if (!file) return;
        
        // Validate size (max 500KB for Base64 storage efficiency)
        if (file.size > 500 * 1024) {
            alert("Image too large. Please select an image under 500KB.");
            input.value = "";
            return;
        }
        
        const reader = new FileReader();
        reader.onload = (e) => {
            currentPhotoBase64 = e.target.result;
            const previewImg = document.getElementById("photoPreview");
            previewImg.src = currentPhotoBase64;
            previewImg.style.display = "block";
            document.querySelector("#photoPreviewArea p").style.display = "none";
            document.querySelector("#photoPreviewArea i").style.display = "none";
            document.getElementById("removePhotoBtn").style.display = "inline-block";
        };
        reader.readAsDataURL(file);
    }
    
    function removePhoto() {
        currentPhotoBase64 = null;
        const previewImg = document.getElementById("photoPreview");
        previewImg.style.display = "none";
        previewImg.src = "";
        document.querySelector("#photoPreviewArea p").style.display = "block";
        document.querySelector("#photoPreviewArea i").style.display = "block";
        document.getElementById("photoInput").value = "";
        document.getElementById("removePhotoBtn").style.display = "none";
    }
    
    // ==================== FORM SUBMIT (Store Base64 in Firestore) ====================
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const name = document.getElementById('name').value.trim();
        const rank = document.getElementById('rank').value.trim();
        const joinDate = document.getElementById('joinDate').value;
        const martyrDate = document.getElementById('martyrDate').value;
        const place = document.getElementById('place').value.trim();
        const incident = document.getElementById('incident').value.trim();
        
        if (!name || !rank || !joinDate || !martyrDate || !place || !incident) {
            alert("Please fill all required fields (*).");
            return;
        }
        
        const submitBtn = form.querySelector('button[type="submit"]');
        const originalText = submitBtn.innerText;
        submitBtn.disabled = true;
        submitBtn.innerText = "Saving...";
        
        try {
            const data = {
                name,
                rank,
                joinDate,
                martyrDate,
                place,
                incident,
                photoBase64: currentPhotoBase64 || null,
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            };
            
            await db.collection("martyrs").add(data);
            alert("✅ Record added successfully!");
            form.reset();
            removePhoto();
            modal.style.display = "none";
            loadMartyrs();
        } catch (error) {
            console.error("Submission error:", error);
            alert("❌ Failed to add record:\n" + error.message + "\n\nCheck Firestore rules (allow read/write).");
        } finally {
            submitBtn.disabled = false;
            submitBtn.innerText = originalText;
        }
    });
    
    // ==================== MODAL CONTROLS ====================
    openModalBtn.onclick = () => {
        modal.style.display = "flex";
        form.reset();
        removePhoto();
    };
    closeModalSpan.onclick = () => modal.style.display = "none";
    window.onclick = (e) => {
        if (e.target === modal) modal.style.display = "none";
    };
    
    // ==================== INITIAL LOAD ====================
    loadMartyrs();
    
    console.log("Martyrs page using Firestore only (Base64 images, round large photos). No delete button.");
