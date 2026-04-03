// auth-check.js - SIMPLE WORKING VERSION
(function() {
    console.log('========== AUTH CHECK START ==========');
    console.log('Current page:', window.location.href);
    
    // Check if user is logged in
    const isLoggedIn = sessionStorage.getItem('isLoggedIn');
    const userData = sessionStorage.getItem('loggedInUser');
    
    console.log('isLoggedIn value:', isLoggedIn);
    console.log('userData exists:', userData ? 'YES' : 'NO');
    
    // IMPORTANT: If NOT logged in, redirect to login page
    if (isLoggedIn !== 'true' || !userData) {
        console.log('❌ NOT LOGGED IN - Redirecting to index.html');
        // Force redirect
        window.location.href = 'index.html';
        return; // Stop execution
    }
    
    console.log('✅ USER IS LOGGED IN - Access granted');
    
    // Parse user data
    let user = null;
    try {
        user = JSON.parse(userData);
        console.log('Welcome:', user.name);
    } catch(e) {
        console.error('Error parsing user data:', e);
        sessionStorage.clear();
        window.location.href = 'index.html';
        return;
    }
    
    // Update display elements if they exist
    function updateDisplay() {
        const userNameSpan = document.getElementById('userNameDisplay');
        if (userNameSpan) userNameSpan.textContent = user.name.split(' ')[0];
        
        const profileName = document.getElementById('profileName');
        if (profileName) profileName.textContent = user.name;
        
        const profileRank = document.getElementById('profileRank');
        if (profileRank) profileRank.textContent = user.rank;
        
        const profileBadge = document.getElementById('profileBadge');
        if (profileBadge) profileBadge.textContent = user.badgeNo;
        
        const profileBatch = document.getElementById('profileBatch');
        if (profileBatch) profileBatch.textContent = user.batch;
        
        const profilePhone = document.getElementById('profilePhone');
        if (profilePhone) profilePhone.textContent = user.phone;
        
        const profileEmail = document.getElementById('profileEmail');
        if (profileEmail) profileEmail.textContent = user.email;
        
        const profileDivision = document.getElementById('profileDivision');
        if (profileDivision) profileDivision.textContent = user.division;
        
        const profileJoinDate = document.getElementById('profileJoinDate');
        if (profileJoinDate) profileJoinDate.textContent = user.joinDate;
        
        const profileUnit = document.getElementById('profileUnit');
        if (profileUnit) profileUnit.innerHTML = `<i class="fas fa-badge-check"></i> ${user.unit}`;
    }
    
    // Update display
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', updateDisplay);
    } else {
        updateDisplay();
    }
    
    // Make logout function available
    window.logout = function() {
        console.log('Logging out...');
        sessionStorage.clear();
        window.location.href = 'index.html';
    };
    
    console.log('========== AUTH CHECK COMPLETE ==========');
})();