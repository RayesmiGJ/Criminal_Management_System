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

    let allLogs = [];
    let currentPage = 1;
    const itemsPerPage = 20;

    // ========== STALE SESSION CLEANUP ==========
    // Mark any active session without a heartbeat in the last 2 minutes as logged out
    async function cleanupStaleSessions() {
        const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000);
        try {
            const snapshot = await db.collection('officerLogs')
                .where('status', '==', 'active')
                .get();
            const batch = db.batch();
            let updated = false;
            snapshot.forEach(doc => {
                const data = doc.data();
                const lastHeartbeat = data.lastHeartbeat ? data.lastHeartbeat.toDate() : null;
                if (!lastHeartbeat || lastHeartbeat < twoMinutesAgo) {
                    batch.update(doc.ref, {
                        status: 'loggedout',
                        logoutTime: firebase.firestore.FieldValue.serverTimestamp()
                    });
                    updated = true;
                }
            });
            if (updated) await batch.commit();
        } catch (err) {
            console.warn("Stale session cleanup failed", err);
        }
    }

    // Load logs from Firestore
    async function loadAllLogs() {
        const container = document.getElementById('logsContainer');
        container.innerHTML = '<div class="spinner"></div><div style="text-align:center;">Fetching logs from Firestore...</div>';
        
        try {
            // Clean up stale sessions before loading
            await cleanupStaleSessions();
            
            const snapshot = await db.collection('officerLogs')
                .orderBy('loginTime', 'desc')
                .get();
            
            allLogs = [];
            for (const doc of snapshot.docs) {
                const data = doc.data();
                let loginTime = data.loginTime ? data.loginTime.toDate() : null;
                let logoutTime = data.logoutTime ? data.logoutTime.toDate() : null;
                let duration = null;
                if (loginTime && logoutTime) {
                    duration = Math.round((logoutTime - loginTime) / 1000 / 60);
                }
                allLogs.push({
                    id: doc.id,
                    officerName: data.officerName || 'Unknown',
                    rank: data.rank || 'Officer',
                    phoneNumber: data.phoneNumber || 'N/A',
                    email: data.email || '',
                    loginTime: loginTime,
                    logoutTime: logoutTime,
                    status: data.status || 'loggedout',
                    sessionDuration: duration,
                    officerId: data.officerId,
                    badgeNo: data.badgeNo || '-',
                    division: data.division || '-'
                });
            }
            
            // Set default date filters (last 7 days)
            const today = new Date();
            const sevenDaysAgo = new Date();
            sevenDaysAgo.setDate(today.getDate() - 7);
            document.getElementById('fromDate').value = sevenDaysAgo.toISOString().split('T')[0];
            document.getElementById('toDate').value = today.toISOString().split('T')[0];
            
            applyFilters();
        } catch (error) {
            console.error('Firestore error:', error);
            container.innerHTML = `<div class="empty-state"><p style="color: var(--danger);">Error loading logs from Firestore: ${error.message}</p><p>Make sure the "officerLogs" collection exists and you have proper permissions.</p></div>`;
        }
    }

    function applyFilters() {
        const fromDate = document.getElementById('fromDate').value;
        const toDate = document.getElementById('toDate').value;
        const officerFilter = document.getElementById('officerFilter').value.toLowerCase();
        const statusFilter = document.getElementById('statusFilter').value;
        
        let filteredLogs = [...allLogs];
        
        if (fromDate) {
            const from = new Date(fromDate);
            from.setHours(0,0,0,0);
            filteredLogs = filteredLogs.filter(log => log.loginTime && log.loginTime >= from);
        }
        if (toDate) {
            const to = new Date(toDate);
            to.setHours(23,59,59,999);
            filteredLogs = filteredLogs.filter(log => log.loginTime && log.loginTime <= to);
        }
        if (officerFilter) {
            filteredLogs = filteredLogs.filter(log => log.officerName.toLowerCase().includes(officerFilter));
        }
        if (statusFilter) {
            filteredLogs = filteredLogs.filter(log => log.status === statusFilter);
        }
        
        displayLogs(filteredLogs);
    }

    function resetFilters() {
        document.getElementById('fromDate').value = '';
        document.getElementById('toDate').value = '';
        document.getElementById('officerFilter').value = '';
        document.getElementById('statusFilter').value = '';
        applyFilters();
    }

    function displayLogs(logs) {
        const container = document.getElementById('logsContainer');
        const paginationDiv = document.getElementById('pagination');
        
        if (logs.length === 0) {
            container.innerHTML = `<div class="empty-state"><i class="fas fa-search" style="font-size:48px;margin-bottom:15px;"></i><p>No logs found for the selected filters</p><p style="font-size:0.8rem;">Try adjusting date range or check if any officers have logged in.</p></div>`;
            paginationDiv.innerHTML = '';
            return;
        }
        
        const totalPages = Math.ceil(logs.length / itemsPerPage);
        const start = (currentPage-1) * itemsPerPage;
        const paginatedLogs = logs.slice(start, start+itemsPerPage);
        
        let html = `<div class="results-table">\n<table>\n<thead>\n<tr>
            <th><i class="fas fa-user"></i> Officer Name</th>
            <th><i class="fas fa-badge"></i> Rank</th>
            <th><i class="fas fa-phone"></i> Phone</th>
            <th><i class="fas fa-sign-in-alt"></i> Login Time</th>
            <th><i class="fas fa-sign-out-alt"></i> Logout Time</th>
            <th><i class="fas fa-hourglass-half"></i> Duration</th>
            <th><i class="fas fa-circle"></i> Status</th>
        </tr></thead><tbody>`;
        
        for (const log of paginatedLogs) {
            const loginStr = log.loginTime ? log.loginTime.toLocaleString() : 'N/A';
            const logoutStr = log.logoutTime ? log.logoutTime.toLocaleString() : (log.status === 'active' ? 'Still Active' : 'N/A');
            const durationStr = log.sessionDuration ? `${log.sessionDuration} min` : (log.status === 'active' ? 'In Progress' : 'N/A');
            
            html += `<tr>
                <td><strong>${escapeHtml(log.officerName)}</strong><br><small style="color:var(--text-dim);">${escapeHtml(log.badgeNo)}</small></td>
                <td>${escapeHtml(log.rank)}</td>
                <td>${escapeHtml(log.phoneNumber)}</td>
                <td>${loginStr}</td>
                <td>${logoutStr}</td>
                <td>${durationStr}</td>
                <td><span class="badge ${log.status === 'active' ? 'badge-active' : 'badge-loggedout'}">${log.status === 'active' ? '🟢 Active' : '🔴 Logged Out'}</span></td>
            </tr>`;
        }
        
        html += `</tbody>\n</table>\n</div>`;
        container.innerHTML = html;
        
        // Pagination
        let pagHtml = '';
        if (totalPages > 1) {
            pagHtml += `<button class="page-btn" onclick="changePage(1)" ${currentPage===1 ? 'disabled' : ''}>&laquo; First</button>`;
            pagHtml += `<button class="page-btn" onclick="changePage(${currentPage-1})" ${currentPage===1 ? 'disabled' : ''}>&lsaquo; Prev</button>`;
            for (let i = Math.max(1, currentPage-2); i <= Math.min(totalPages, currentPage+2); i++) {
                pagHtml += `<button class="page-btn ${i===currentPage ? 'active' : ''}" onclick="changePage(${i})">${i}</button>`;
            }
            pagHtml += `<button class="page-btn" onclick="changePage(${currentPage+1})" ${currentPage===totalPages ? 'disabled' : ''}>Next &rsaquo;</button>`;
            pagHtml += `<button class="page-btn" onclick="changePage(${totalPages})" ${currentPage===totalPages ? 'disabled' : ''}>Last &raquo;</button>`;
        }
        paginationDiv.innerHTML = pagHtml;
    }

    function changePage(page) {
        currentPage = page;
        applyFilters();
    }

    function exportToCSV() {
        const fromDate = document.getElementById('fromDate').value;
        const toDate = document.getElementById('toDate').value;
        const officerFilter = document.getElementById('officerFilter').value.toLowerCase();
        const statusFilter = document.getElementById('statusFilter').value;
        
        let filtered = [...allLogs];
        if (fromDate) { const from = new Date(fromDate); from.setHours(0,0,0,0); filtered = filtered.filter(l => l.loginTime && l.loginTime >= from); }
        if (toDate) { const to = new Date(toDate); to.setHours(23,59,59,999); filtered = filtered.filter(l => l.loginTime && l.loginTime <= to); }
        if (officerFilter) filtered = filtered.filter(l => l.officerName.toLowerCase().includes(officerFilter));
        if (statusFilter) filtered = filtered.filter(l => l.status === statusFilter);
        
        let csv = "\uFEFFOfficer Name,Rank,Phone Number,Login Time,Logout Time,Duration (mins),Status,Badge No,Division\n";
        for (const log of filtered) {
            csv += `"${escapeCsv(log.officerName)}","${escapeCsv(log.rank)}","${escapeCsv(log.phoneNumber)}","${log.loginTime?.toLocaleString()||'N/A'}","${log.logoutTime?.toLocaleString()||(log.status==='active'?'Still Active':'N/A')}","${log.sessionDuration||''}","${log.status}","${escapeCsv(log.badgeNo)}","${escapeCsv(log.division)}"\n`;
        }
        const blob = new Blob([csv], {type:'text/csv;charset=utf-8;'});
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `officer_logs_${new Date().toISOString().split('T')[0]}.csv`;
        link.click();
        URL.revokeObjectURL(link.href);
    }

    function escapeHtml(str) { if(!str) return ''; return str.replace(/[&<>]/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[m])); }
    function escapeCsv(str) { if(!str) return ''; return str.replace(/"/g, '""'); }

    // Auto-refresh every 30 seconds
    let refreshInterval;
    function startAutoRefresh() {
        if (refreshInterval) clearInterval(refreshInterval);
        refreshInterval = setInterval(() => { loadAllLogs(); }, 30000);
    }

    document.addEventListener('DOMContentLoaded', () => {
        loadAllLogs();
        startAutoRefresh();
    });