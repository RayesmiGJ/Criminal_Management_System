// Firebase Config (shared)
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

const PROMPT_CACHE_KEY = 'promptCasesCache_v1';
let allCases = [];

function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>]/g, m => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;' }[m]));
}

function normalizeCaseData(data, id) {
    const victims = data.victims || [];
    const suspects = data.suspects || [];
    const criminals = data.criminals || [];
    const witnesses = data.witnesses || [];

    return {
        id,
        refID: data.refID || data.refNo || id,
        category: data.category || 'Unknown',
        status: data.status || 'Pending',
        incidentLocation: data.incidentLocation || data.location || 'N/A',
        incidentDescription: data.incidentDescription || data.complaint || '',
        complaint: data.complaint || '',
        victims,
        suspects,
        criminals,
        witnesses
    };
}

function buildIndexText(caseData) {
    const names = [];
    caseData.victims.forEach(v => v?.name && names.push(v.name));
    caseData.suspects.forEach(s => s?.name && names.push(s.name));
    caseData.criminals.forEach(c => c?.name && names.push(c.name));
    caseData.witnesses.forEach(w => w?.name && names.push(w.name));

    return [
        caseData.refID,
        caseData.category,
        caseData.status,
        caseData.incidentLocation,
        caseData.incidentDescription,
        caseData.complaint,
        names.join(' ')
    ].join(' ').toLowerCase();
}

function tokenizePrompt(prompt) {
    return prompt
        .toLowerCase()
        .split(/\W+/)
        .filter(token => token.length >= 3);
}

function scoreCase(caseData, tokens) {
    const text = buildIndexText(caseData);
    let score = 0;
    if (tokens.length === 0) return 0;
    tokens.forEach(token => {
        if (caseData.refID.toLowerCase() === token) score += 100;
        else if (text.includes(token)) score += 10;
    });
    const ratio = score / (tokens.length * 10);
    return Math.min(100, Math.round(ratio * 100));
}

async function loadCases() {
    const cacheHint = document.getElementById('cacheHint');
    try {
        const cachedRaw = localStorage.getItem(PROMPT_CACHE_KEY);
        if (cachedRaw) {
            const cached = JSON.parse(cachedRaw);
            if (Array.isArray(cached.cases)) {
                allCases = cached.cases;
                document.getElementById('totalCases').textContent = allCases.length;
                cacheHint.textContent = 'Loaded from cache, syncing...';
            }
        }

        const snapshot = await db.collection('firs').orderBy('timestamp', 'desc').limit(400).get();
        const fresh = [];
        snapshot.forEach(doc => fresh.push(normalizeCaseData(doc.data(), doc.id)));
        if (fresh.length) {
            allCases = fresh;
            document.getElementById('totalCases').textContent = allCases.length;
            localStorage.setItem(PROMPT_CACHE_KEY, JSON.stringify({ savedAt: Date.now(), cases: allCases }));
            cacheHint.textContent = 'Live data synced.';
        }
    } catch (err) {
        console.error(err);
        if (!allCases.length) {
            cacheHint.textContent = 'Unable to load data. Check connection.';
        }
    }
}

function runPromptSearch() {
    const prompt = document.getElementById('promptInput').value.trim();
    if (!prompt) {
        alert('Please enter a prompt first.');
        return;
    }

    const start = performance.now();
    const tokens = tokenizePrompt(prompt);
    const results = allCases
        .map(c => ({
            caseData: c,
            score: scoreCase(c, tokens)
        }))
        .filter(r => r.score > 0)
        .sort((a, b) => b.score - a.score);

    const elapsed = Math.round(performance.now() - start);
    document.getElementById('processingTime').textContent = `${elapsed}ms`;
    document.getElementById('matchCount').textContent = results.length;

    const container = document.getElementById('resultsContainer');
    if (!results.length) {
        container.innerHTML = `<div class="empty-state">No matches found for your prompt. Try more details or different keywords.</div>`;
        return;
    }

    container.innerHTML = results.slice(0, 30).map(result => {
        const c = result.caseData;
        const snippet = escapeHtml((c.incidentDescription || c.complaint || '').slice(0, 120));
        return `
            <div class="result-card">
                <div class="result-title">${escapeHtml(c.refID)} <span class="badge">${result.score}%</span></div>
                <div class="result-meta">${escapeHtml(c.category)} | ${escapeHtml(c.status)}</div>
                <div class="result-meta">${escapeHtml(c.incidentLocation)}</div>
                <div class="result-meta">${snippet}${snippet.length === 120 ? '...' : ''}</div>
            </div>
        `;
    }).join('');
}

document.getElementById('promptInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        runPromptSearch();
    }
});

loadCases();