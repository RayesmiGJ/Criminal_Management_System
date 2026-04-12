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
let searchModel = {
    avgDocLength: 0,
    docFreq: new Map(),
    totalDocs: 0
};

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

function normalizeText(input) {
    return String(input || '')
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function tokenizeText(text) {
    return normalizeText(text).split(' ').filter(token => token.length >= 2);
}

function buildWordNgrams(text) {
    const words = normalizeText(text).split(' ').filter(Boolean);
    const grams = [];
    for (let i = 0; i < words.length; i++) {
        grams.push(words[i]);
        if (i < words.length - 1) grams.push(`${words[i]} ${words[i + 1]}`);
    }
    return grams;
}

function buildCharTrigrams(text) {
    const normalized = normalizeText(text).replace(/ /g, '_');
    const trigrams = [];
    if (normalized.length < 3) return trigrams;
    for (let i = 0; i <= normalized.length - 3; i++) {
        trigrams.push(normalized.slice(i, i + 3));
    }
    return trigrams;
}

function toFrequencyMap(items) {
    const map = new Map();
    items.forEach((item) => map.set(item, (map.get(item) || 0) + 1));
    return map;
}

function cosineSimilarity(mapA, mapB) {
    if (!mapA.size || !mapB.size) return 0;
    let dot = 0;
    let magA = 0;
    let magB = 0;

    mapA.forEach((value, key) => {
        magA += value * value;
        const bValue = mapB.get(key) || 0;
        dot += value * bValue;
    });
    mapB.forEach((value) => {
        magB += value * value;
    });

    if (!magA || !magB) return 0;
    return dot / (Math.sqrt(magA) * Math.sqrt(magB));
}

function buildCaseSemanticText(caseData) {
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
    ].join(' ');
}

function buildSearchModel(cases) {
    const docFreq = new Map();
    let totalTokens = 0;

    cases.forEach((caseData) => {
        const docText = buildCaseSemanticText(caseData);
        const tokens = tokenizeText(docText);
        totalTokens += tokens.length;
        const uniqueTokens = new Set(tokens);
        uniqueTokens.forEach((token) => {
            docFreq.set(token, (docFreq.get(token) || 0) + 1);
        });
    });

    const totalDocs = cases.length;
    const avgDocLength = totalDocs ? (totalTokens / totalDocs) : 0;
    searchModel = { avgDocLength, docFreq, totalDocs };
}

function termFrequency(tokens) {
    const tf = new Map();
    tokens.forEach((token) => {
        tf.set(token, (tf.get(token) || 0) + 1);
    });
    return tf;
}

function bm25Score(promptTokens, docTokens) {
    if (!promptTokens.length || !docTokens.length || !searchModel.totalDocs) return 0;
    const tf = termFrequency(docTokens);
    const docLen = docTokens.length;

    const k1 = 1.5;
    const b = 0.75;
    let score = 0;

    promptTokens.forEach((term) => {
        const freq = tf.get(term) || 0;
        if (!freq) return;

        const df = searchModel.docFreq.get(term) || 0;
        const idf = Math.log(1 + ((searchModel.totalDocs - df + 0.5) / (df + 0.5)));
        const numerator = freq * (k1 + 1);
        const denominator = freq + k1 * (1 - b + b * (docLen / (searchModel.avgDocLength || 1)));
        score += idf * (numerator / denominator);
    });

    return score;
}

function normalizeScores(rawScores) {
    if (!rawScores.length) return [];
    const maxScore = Math.max(...rawScores.map(r => r.rawScore));
    const minScore = Math.min(...rawScores.map(r => r.rawScore));
    const span = maxScore - minScore;

    return rawScores.map((r) => {
        const normalized = span > 0 ? ((r.rawScore - minScore) / span) : (r.rawScore > 0 ? 1 : 0);
        return {
            caseData: r.caseData,
            score: Math.round(normalized * 100)
        };
    });
}

function scoreCaseFromPrompt(caseData, prompt) {
    const promptTokens = tokenizeText(prompt);
    const docTokens = tokenizeText(buildCaseSemanticText(caseData));
    return bm25Score(promptTokens, docTokens);
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
            buildSearchModel(allCases);
            document.getElementById('totalCases').textContent = allCases.length;
            localStorage.setItem(PROMPT_CACHE_KEY, JSON.stringify({ savedAt: Date.now(), cases: allCases }));
            cacheHint.textContent = 'Live data synced.';
        } else {
            buildSearchModel(allCases);
        }
    } catch (err) {
        console.error(err);
        if (!allCases.length) {
            cacheHint.textContent = 'Unable to load data. Check connection.';
        } else {
            buildSearchModel(allCases);
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
    const rawResults = allCases
        .map(c => ({
            caseData: c,
            rawScore: scoreCaseFromPrompt(c, prompt)
        }))
        .sort((a, b) => b.rawScore - a.rawScore);

    const results = normalizeScores(rawResults)
        .filter(r => r.score > 0)
        .sort((a, b) => b.score - a.score);

    const elapsed = Math.round(performance.now() - start);
    document.getElementById('processingTime').textContent = `${elapsed}ms`;
    document.getElementById('matchCount').textContent = results.length;

    const container = document.getElementById('resultsContainer');
    if (!results.length) {
        container.innerHTML = `<div class="empty-state">No predictive matches found for the current prompt.</div>`;
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