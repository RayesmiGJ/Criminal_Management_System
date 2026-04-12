// auth-check.js - RBAC-aware guard used by protected pages
(function () {
    const isLoggedIn = sessionStorage.getItem('isLoggedIn');
    const userData = sessionStorage.getItem('loggedInUser');
    const currentPage = (window.location.pathname.split('/').pop() || '').toLowerCase();

    if (isLoggedIn !== 'true' || !userData) {
        window.location.replace('index.html');
        return;
    }

    let user = null;
    try {
        user = JSON.parse(userData);
    } catch (e) {
        sessionStorage.clear();
        window.location.replace('index.html');
        return;
    }

    // Normalize role and keep session consistent across older records.
    let userRole = (sessionStorage.getItem('userRole') || user.role || '').toLowerCase();
    if (userRole !== 'admin' && userRole !== 'officer') {
        userRole = user.role === 'admin' ? 'admin' : 'officer';
    }
    sessionStorage.setItem('userRole', userRole);

    const adminOnlyPages = new Set(['admin_home.html', 'log_details.html']);
    const officerOnlyPages = new Set([
        'home.html',
        'register_fir.html',
        'view_fir.html',
        'search.html',
        'dashboard.html',
        'crime_hotspot.html',
        'arrested_persons.html',
        'face_matcher.html',
        'prompt_results.html'
    ]);

    if (adminOnlyPages.has(currentPage) && userRole !== 'admin') {
        window.location.replace('home.html');
        return;
    }

    if (officerOnlyPages.has(currentPage) && userRole !== 'officer') {
        window.location.replace('admin_home.html');
        return;
    }

    function prefetchByRole() {
        const officerPages = [
            'home.html',
            'register_fir.html',
            'view_fir.html',
            'search.html',
            'dashboard.html',
            'crime_hotspot.html',
            'arrested_persons.html',
            'face_matcher.html',
            'prompt_results.html'
        ];
        const adminPages = ['admin_home.html', 'log_details.html'];
        const pages = userRole === 'admin' ? adminPages : officerPages;
        pages
            .filter((p) => p !== currentPage)
            .forEach((p) => {
                const link = document.createElement('link');
                link.rel = 'prefetch';
                link.href = p;
                document.head.appendChild(link);
            });
    }

    function updateDisplay() {
        const displayName = (user.name || 'Officer').split(' ')[0];
        const userNameSpan = document.getElementById('userNameDisplay');
        if (userNameSpan) userNameSpan.textContent = displayName;

        const profileName = document.getElementById('profileName');
        if (profileName) profileName.textContent = user.name || 'Officer';

        const profileRank = document.getElementById('profileRank');
        if (profileRank) profileRank.textContent = user.rank || (userRole === 'admin' ? 'Administrator' : 'Officer');

        const profileBadge = document.getElementById('profileBadge');
        if (profileBadge) profileBadge.textContent = user.badgeNo || '-';

        const profileBatch = document.getElementById('profileBatch');
        if (profileBatch) profileBatch.textContent = user.batch || '-';

        const profilePhone = document.getElementById('profilePhone');
        if (profilePhone) profilePhone.textContent = user.phone || '-';

        const profileEmail = document.getElementById('profileEmail');
        if (profileEmail) profileEmail.textContent = user.email || '-';

        const profileDivision = document.getElementById('profileDivision');
        if (profileDivision) profileDivision.textContent = user.division || '-';

        const profileJoinDate = document.getElementById('profileJoinDate');
        if (profileJoinDate) profileJoinDate.textContent = user.joinDate || '-';

        const profileUnit = document.getElementById('profileUnit');
        if (profileUnit) profileUnit.innerHTML = `<i class="fas fa-badge-check"></i> ${user.unit || 'Police Unit'}`;
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', updateDisplay);
    } else {
        updateDisplay();
    }

    if ('requestIdleCallback' in window) {
        window.requestIdleCallback(prefetchByRole, { timeout: 1500 });
    } else {
        setTimeout(prefetchByRole, 500);
    }

    window.logout = function () {
        sessionStorage.clear();
        window.location.replace('index.html');
    };
})();