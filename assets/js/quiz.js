/* quiz.js — CS6250 Study Quiz
   Multi-deck support. All data stays local in localStorage.
   JSON deck format: { title, description, questions: [...] }
   (bare arrays are also accepted for backwards compat) */

// ── Storage key helpers ────────────────────────────────────────────────────
const REGISTRY_KEY = 'cs6250_registry';   // { [deckId]: DeckMeta }
const ACTIVE_KEY   = 'cs6250_active';     // active deckId string
const CREATE_KEY        = 'cs6250_created';       // Question[] for builder
const CREATE_TITLE_KEY  = 'cs6250_created_title'; // deck name for builder
const CREATE_DESC_KEY   = 'cs6250_created_desc';  // deck description for builder

function deckQsKey(id)    { return `cs6250_qs_${id}`; }
function deckStatsKey(id) { return `cs6250_stats_${id}`; }

// ── Demo deck ──────────────────────────────────────────────────────────────
const DEMO_ID    = 'deck_demo';
const DEMO_TITLE = 'Georgia Tech Trivia';
const DEMO_DESC  = '5 questions about Georgia Tech history & culture — a quick warm-up before the real thing.';
const DEMO_QUESTIONS = [
  { id:'demo_1', mod:0, mod_name:'Georgia Tech Trivia', type:'MCQ',
    q:'What year was the Georgia Institute of Technology founded?',
    opts:['1881','1885','1891','1901'], ans:1,
    exp:'Georgia Tech was founded on October 13, 1885 as the Georgia School of Technology in Atlanta.' },
  { id:'demo_2', mod:0, mod_name:'Georgia Tech Trivia', type:'MCQ',
    q:"What is Georgia Tech's costumed mascot called?",
    opts:["Ramblin' Wreck",'Buzz','Sting','Yellowjacket Jack'], ans:1,
    exp:"Buzz the Yellow Jacket is Georgia Tech's costumed mascot. The Ramblin' Wreck is the famous 1930 Ford Model A Sport Coupe — the official school vehicle." },
  { id:'demo_3', mod:0, mod_name:'Georgia Tech Trivia', type:'MCQ',
    q:'Georgia Tech set the all-time college football scoring record in 1916. What was the final score against Cumberland College?',
    opts:['150–0','189–0','222–0','256–0'], ans:2,
    exp:'On October 7, 1916, Georgia Tech defeated Cumberland College 222–0 — the largest margin of victory in college football history.' },
  { id:'demo_4', mod:0, mod_name:'Georgia Tech Trivia', type:'MCQ',
    q:'What is the nickname for the annual football rivalry between Georgia Tech and UGA?',
    opts:['The Battle of Atlanta','Clean, Old-Fashioned Hate','The Southern Showdown','The Peach State Classic'], ans:1,
    exp:'"Clean, Old-Fashioned Hate" is the beloved nickname for the Georgia–Georgia Tech rivalry, one of the oldest in college football.' },
  { id:'demo_5', mod:0, mod_name:'Georgia Tech Trivia', type:'MCQ',
    q:"In what Atlanta neighborhood is Georgia Tech's main campus located?",
    opts:['Buckhead','Downtown','Midtown','Virginia-Highland'], ans:2,
    exp:"Georgia Tech's campus sits in Midtown Atlanta, adjacent to Piedmont Park and the Atlanta BeltLine." }
];

// ── Module-level state ─────────────────────────────────────────────────────
let allQuestions   = [];
let allModules     = [];
let selectedMods   = new Set();
let loadedFileName = '';
let loadedTitle    = '';
let loadedDesc     = '';
let activeDeckId   = null;

let deck         = [];
let deckPos      = 0;
let round        = 1;
let sessionId    = null;
let sessionRight = 0;
let sessionTotal = 0;
let sessionByMod = {};
let answered         = false;
let currentQ         = null;
let quizActive       = false;
let currentStreak    = 0;
let bestStreak       = 0;
let wrongAnswers     = [];   // questions answered wrong this session
let sessionStartTime = null;
let shuffleMode      = true; // false = in original file order

let studyMode        = 'spaced';  // 'spaced' | 'classic'
let srsOriginalCount = 0;
let srsCompleted     = new Set(); // card IDs answered correctly this SRS session
let lastAnswerCorrect = false;
let cardsFilter      = 'all';
let cardsSearch      = '';

// Edit modal state
let editView    = 'list';
let editCardIdx = null;
let editOpts    = [];
let editCorrect = 0;

// Create deck form state
let createOpts    = ['','','',''];
let createCorrect = 0;

// Pending import confirmation
let pendingImportData   = null;
let pendingImportDeckId = null;

let currentView = 'home';   // active view — controls header menu visibility
let statsDeckId = null;     // deck shown on stats page; null = active, 'all' = aggregate

// ── Helpers ────────────────────────────────────────────────────────────────
const $  = (s, ctx = document) => ctx.querySelector(s);
const $$ = (s, ctx = document) => [...ctx.querySelectorAll(s)];

function shuffle(arr) {
  return arr.map(v => ({ v, s: Math.random() })).sort((a, b) => a.s - b.s).map(x => x.v);
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── Registry: deck metadata ────────────────────────────────────────────────
// { [deckId]: { id, title, description, filename, questionCount, addedAt } }
function getRegistry() {
  try { return JSON.parse(localStorage.getItem(REGISTRY_KEY) || '{}'); } catch { return {}; }
}
function saveRegistry(r) {
  try { localStorage.setItem(REGISTRY_KEY, JSON.stringify(r)); } catch {}
}
function upsertDeckMeta(id, patch) {
  const r = getRegistry();
  r[id] = { ...r[id], ...patch, id };
  saveRegistry(r);
}
function deleteDeckMeta(id) {
  const r = getRegistry(); delete r[id]; saveRegistry(r);
}

// ── Per-deck questions ─────────────────────────────────────────────────────
function getDeckQuestions(id) {
  try { const raw = localStorage.getItem(deckQsKey(id)); return raw ? JSON.parse(raw) : []; }
  catch { return []; }
}
function saveDeckQuestions(id, qs) {
  try { localStorage.setItem(deckQsKey(id), JSON.stringify(qs)); } catch {}
}

// ── Per-deck stats: { sessions, qstats, deckState } ───────────────────────
function getDeckStats(id) {
  try { const raw = localStorage.getItem(deckStatsKey(id)); return raw ? JSON.parse(raw) : { sessions:[], qstats:{}, deckState:null }; }
  catch { return { sessions:[], qstats:{}, deckState:null }; }
}
function saveDeckStats(id, obj) {
  try { localStorage.setItem(deckStatsKey(id), JSON.stringify(obj)); } catch {}
}

// ── Session / qstats — scoped to active deck ──────────────────────────────
function getSessions() { return activeDeckId ? (getDeckStats(activeDeckId).sessions || []) : []; }
function saveSessions(s) {
  if (!activeDeckId) return;
  const obj = getDeckStats(activeDeckId); obj.sessions = s; saveDeckStats(activeDeckId, obj);
}
function getQStats()  { return activeDeckId ? (getDeckStats(activeDeckId).qstats || {}) : {}; }
function saveQStats(q) {
  if (!activeDeckId) return;
  const obj = getDeckStats(activeDeckId); obj.qstats = q; saveDeckStats(activeDeckId, obj);
}

// ── Icon SVG strings ────────────────────────────────────────────────────────
const ICONS = {
  flag:     `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></svg>`,
  newCard:  `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>`,
  learning: `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-3.1"/></svg>`,
  review:   `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>`,
  known:    `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`,
  spaced:   `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>`,
  classic:  `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>`,
  calendar: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>`,
  streak:   `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>`,
  check:    `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`,
  arrowR:   `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>`,
  play:     `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="5 3 19 12 5 21 5 3"/></svg>`,
  stack:    `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="12 2 2 7 12 22 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>`,
  pencil:   `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>`,
};

// ── SRS helpers ────────────────────────────────────────────────────────────
const DEFAULT_SRS = () => ({
  correct:0, total:0, interval:0, easeFactor:2.5, repetitions:0,
  nextReview:null, state:'new', flagged:false, lastAnswered:null
});

function getCardSRSData(qid) {
  const qs = getQStats();
  return { ...DEFAULT_SRS(), ...(qs[qid] || {}) };
}

function updateCardSRS(qid, correct) {
  const qs = getQStats();
  const s  = { ...DEFAULT_SRS(), ...(qs[qid] || {}) };
  s.total++;
  if (correct) s.correct++;
  s.lastAnswered = Date.now();
  if (correct) {
    if      (s.repetitions === 0) s.interval = 1;
    else if (s.repetitions === 1) s.interval = 3;
    else s.interval = Math.round(s.interval * s.easeFactor);
    s.interval    = Math.min(s.interval, 180);
    s.easeFactor  = Math.max(1.3, s.easeFactor + 0.05);
    s.repetitions++;
  } else {
    s.repetitions = 0;
    s.interval    = 1;
    s.easeFactor  = Math.max(1.3, s.easeFactor - 0.2);
  }
  s.nextReview = Date.now() + s.interval * 24 * 60 * 60 * 1000;
  if      (s.repetitions === 0 && s.total === 0) s.state = 'new';
  else if (s.repetitions === 0)                  s.state = 'learning';
  else if (s.interval < 4)                       s.state = 'learning';
  else if (s.interval < 21)                      s.state = 'review';
  else                                            s.state = 'known';
  qs[qid] = s;
  saveQStats(qs);
  return s;
}

function toggleFlag(qid) {
  if (!qid) return;
  const qs = getQStats();
  const s  = { ...DEFAULT_SRS(), ...(qs[qid] || {}) };
  s.flagged = !s.flagged;
  qs[qid] = s;
  saveQStats(qs);
  const btn = document.getElementById('flag-btn');
  if (btn) btn.classList.toggle('is-flagged', s.flagged);
  if (currentView === 'cards') renderCardRows();
}

function buildSRSQueue() {
  const now  = Date.now();
  const qs   = getQStats();
  const pool = allQuestions.filter(q => selectedMods.has(q.mod));
  const due  = pool.filter(q => {
    const s = qs[q.id];
    return !s || !s.nextReview || s.state === 'new' || s.nextReview <= now;
  });
  due.sort((a, b) => {
    const sa = qs[a.id], sb = qs[b.id];
    const aNew = !sa || sa.state === 'new';
    const bNew = !sb || sb.state === 'new';
    if (aNew && !bNew) return -1;
    if (bNew && !aNew) return  1;
    return (sa?.nextReview || 0) - (sb?.nextReview || 0);
  });
  return shuffle(due);
}

function getStateCounts(deckId) {
  const questions = getDeckQuestions(deckId);
  const qs   = (getDeckStats(deckId).qstats) || {};
  const now  = Date.now();
  const c    = { new:0, learning:0, review:0, known:0, flagged:0, total: questions.length };
  questions.forEach(q => {
    const s = qs[q.id];
    c[s?.state || 'new']++;
    if (s?.flagged) c.flagged++;
  });
  c.due = questions.filter(q => {
    const s = qs[q.id];
    return !s || !s.nextReview || s.state === 'new' || s.nextReview <= now;
  }).length;
  return c;
}

// ── Exam countdown ─────────────────────────────────────────────────────────
function getExamDaysLeft(deckId) {
  const meta = getRegistry()[deckId];
  if (!meta?.examDate) return null;
  const exam  = new Date(meta.examDate + 'T00:00:00');
  const today = new Date(); today.setHours(0,0,0,0);
  return Math.round((exam - today) / 86400000);
}

function openSetExamDate(deckId) {
  closeDeckMenuPortal();
  const meta = getRegistry()[deckId] || {};
  $('#modal-overlay').classList.remove('hidden');
  document.body.style.overflow = 'hidden';
  $('#modal-title').textContent = 'Set exam date';
  const cur = meta.examDate || '';
  $('#modal-content').innerHTML = `
    <p style="font-size:13px;color:var(--text-3);margin-bottom:16px">
      Enter your exam date to see a countdown and daily goal on the deck card.
    </p>
    <input type="date" id="exam-date-input" value="${cur}"
      style="width:100%;padding:10px 12px;border-radius:10px;border:1px solid var(--border);
             font-size:14px;color:var(--text);background:rgba(255,255,255,.8);margin-bottom:16px">
    <div style="display:flex;gap:8px">
      <button class="btn btn-primary btn-block" onclick="saveExamDate('${deckId}')">Save</button>
      ${cur ? `<button class="btn btn-block" onclick="saveExamDate('${deckId}', true)" style="color:#ef4444">Clear</button>` : ''}
    </div>`;
}

function saveExamDate(deckId, clear) {
  const val = clear ? '' : (document.getElementById('exam-date-input')?.value || '');
  upsertDeckMeta(deckId, { examDate: val || null });
  closeModal();
  renderDeckSwitcher();
}

// ── Card browser ───────────────────────────────────────────────────────────
function renderCardsView() {
  const el = document.getElementById('page-cards');
  if (!el) return;
  // Auto-load if memory is empty (e.g. navigated to Cards before clicking Study)
  if (!allQuestions.length) {
    const reg = getRegistry();
    const savedId = localStorage.getItem(ACTIVE_KEY);
    const fallbackId = (savedId && reg[savedId]) ? savedId : Object.keys(reg)[0];
    if (fallbackId) loadDeckIntoMemory(fallbackId);
  }
  if (!activeDeckId || !allQuestions.length) {
    el.innerHTML = `<div class="cards-empty">Add a deck to get started.</div>`;
    return;
  }
  const counts  = getStateCounts(activeDeckId);
  const filters = ['all','new','learning','review','known','flagged'];
  const labels  = { all:'All', new:`${ICONS.newCard} New`, learning:`${ICONS.learning} Learning`, review:`${ICONS.review} Review`, known:`${ICONS.known} Known`, flagged:`${ICONS.flag} Flagged` };

  const filterBtns = filters.map(f => {
    const cnt    = f === 'all' ? allQuestions.length : counts[f] || 0;
    const active = cardsFilter === f ? ' active' : '';
    return `<button class="cards-filter-btn${active}" data-filter="${f}" onclick="setCardsFilter('${f}')">${labels[f]} <span class="filter-count">${cnt}</span></button>`;
  }).join('');

  // Render shell only — rows live in #cards-rows and are updated by renderCardRows()
  el.innerHTML = `
    <div class="cards-header">
      <div class="cards-title">${escapeHtml(loadedTitle || 'Cards')}</div>
      <input class="cards-search" type="search" placeholder="Search…" autocomplete="off"
        value="${escapeHtml(cardsSearch)}">
    </div>
    <div class="cards-filter-bar">${filterBtns}</div>
    <div id="cards-rows"></div>`;

  // Attach listener AFTER injecting HTML so the element exists
  const inp = el.querySelector('.cards-search');
  if (inp) {
    inp.addEventListener('input', e => { cardsSearch = e.target.value; renderCardRows(); });
  }
  renderCardRows();
}

function renderCardRows() {
  const rowsEl = document.getElementById('cards-rows');
  if (!rowsEl) return;
  const qs = getQStats();
  let cards = allQuestions;
  if (cardsFilter !== 'all') {
    cards = cardsFilter === 'flagged'
      ? cards.filter(q => qs[q.id]?.flagged)
      : cards.filter(q => (qs[q.id]?.state || 'new') === cardsFilter);
  }
  if (cardsSearch.trim()) {
    const term = cardsSearch.trim().toLowerCase();
    cards = cards.filter(q =>
      q.q.toLowerCase().includes(term) ||
      (q.opts && q.opts.some(o => o.toLowerCase().includes(term)))
    );
  }
  rowsEl.innerHTML = cards.map(q => {
    const s       = { ...DEFAULT_SRS(), ...(qs[q.id] || {}) };
    const state   = s.state || 'new';
    const flagCls = s.flagged ? ' is-flagged' : '';
    return `<div class="card-row">
      <div class="card-row-q" title="${escapeHtml(q.q)}">${escapeHtml(q.q)}</div>
      <span class="card-row-mod">M${q.mod}</span>
      <span class="state-badge state-${state}">${state}</span>
      <button class="card-row-flag${flagCls}" onclick="toggleFlag('${q.id}')" title="${s.flagged ? 'Unflag' : 'Flag'}">${ICONS.flag}</button>
    </div>`;
  }).join('') || `<div class="cards-empty">No cards match.</div>`;
}

function setCardsFilter(f) {
  cardsFilter = f;
  // Update active class without rebuilding the whole shell
  document.querySelectorAll('.cards-filter-btn').forEach(b =>
    b.classList.toggle('active', b.dataset.filter === f)
  );
  renderCardRows();
}

function localStartSession(modules) {
  const session = { id: Date.now(), modules, correct:0, total:0,
                    started_at: new Date().toISOString(), ended_at: null };
  const all = getSessions(); all.push(session); saveSessions(all);
  return session.id;
}

function localRecordAnswer(sid, questionId, moduleId, correct, questionObj) {
  const sessions = getSessions();
  const s = sessions.find(x => x.id === sid);
  if (s) { s.total++; if (correct) s.correct++; }
  saveSessions(sessions);

  const qstats = getQStats();
  if (!qstats[questionId]) {
    const card = questionObj ? {
      q: questionObj.q||null, opts: questionObj.opts||null, ans: questionObj.ans??null,
      mod_name: questionObj.mod_name||null, type: questionObj.type||'MCQ', exp: questionObj.exp||null,
    } : null;
    qstats[questionId] = { question_id:questionId, module_id:moduleId, card,
                            total_attempts:0, correct_count:0, last_seen:null };
  }
  qstats[questionId].total_attempts++;
  if (correct) qstats[questionId].correct_count++;
  qstats[questionId].last_seen = new Date().toISOString();
  saveQStats(qstats);
}

function localEndSession(id) {
  const sessions = getSessions();
  const s = sessions.find(x => x.id === id);
  if (s) {
    s.ended_at = new Date().toISOString();
    if (sessionStartTime) s.duration_seconds = Math.round((Date.now() - sessionStartTime) / 1000);
    s.best_streak = bestStreak;
  }
  saveSessions(sessions);
}

function localGetStats() {
  const sessions = getSessions().filter(s => s.ended_at !== null);
  const qstats   = getQStats();
  const totals = {
    total_sessions: sessions.length,
    total_answered: sessions.reduce((n,s) => n + s.total,   0),
    total_correct:  sessions.reduce((n,s) => n + s.correct, 0),
  };
  const recent = [...sessions]
    .sort((a,b) => new Date(b.started_at) - new Date(a.started_at))
    .slice(0, 20)
    .map(s => ({ ...s, modules: JSON.stringify(s.modules) }));
  const weak = Object.values(qstats)
    .filter(q => q.total_attempts >= 2)
    .map(q => ({ ...q,
      wrong_count: q.total_attempts - q.correct_count,
      pct: Math.round(100 * q.correct_count / q.total_attempts * 10) / 10,
    }))
    .sort((a,b) => a.pct - b.pct)
    .slice(0, 10);
  return { totals, sessions: recent, weak };
}

function localResetStats() {
  if (!activeDeckId) return;
  const obj = getDeckStats(activeDeckId);
  obj.sessions = []; obj.qstats = {}; obj.deckState = null;
  saveDeckStats(activeDeckId, obj);
  sessionId    = null; quizActive   = false;
  deck         = []; deckPos      = 0;
  sessionRight = 0; sessionTotal = 0; sessionByMod = {};
}

// ── Deck state save / restore ─────────────────────────────────────────────
function saveDeckState() {
  if (!quizActive || deck.length === 0 || !activeDeckId) return;
  const state = {
    deckIds: deck.map(q => q.id), deckPos, round,
    sessionRight, sessionTotal, sessionByMod,
    selectedModIds: [...selectedMods],
  };
  const obj = getDeckStats(activeDeckId);
  obj.deckState = state;
  saveDeckStats(activeDeckId, obj);
}

function tryRestoreDeckState() {
  if (!activeDeckId || allQuestions.length === 0) return;
  try {
    const obj   = getDeckStats(activeDeckId);
    const state = obj.deckState;
    if (!state || !Array.isArray(state.deckIds) || !state.deckIds.length) return;

    const qMap = {}; allQuestions.forEach(q => { qMap[q.id] = q; });
    const restoredDeck = state.deckIds.map(id => qMap[id]).filter(Boolean);
    if (restoredDeck.length < Math.floor(state.deckIds.length * 0.9)) return;

    deck         = restoredDeck;
    deckPos      = Math.min(state.deckPos || 0, Math.max(0, deck.length - 1));
    round        = state.round || 1;
    sessionRight = state.sessionRight || 0;
    sessionTotal = state.sessionTotal || 0;
    sessionByMod = state.sessionByMod || {};
    if (Array.isArray(state.selectedModIds)) selectedMods = new Set(state.selectedModIds);

    sessionId  = localStartSession([...selectedMods]);
    quizActive = true;

    obj.deckState = null;
    saveDeckStats(activeDeckId, obj);
    updateResumeCard();
  } catch {}
}

// ── Active deck management ─────────────────────────────────────────────────
function setActiveDeckId(id) {
  activeDeckId = id;
  try { id ? localStorage.setItem(ACTIVE_KEY, id) : localStorage.removeItem(ACTIVE_KEY); } catch {}
}

// Load registered deck into memory without starting quiz
function loadDeckIntoMemory(deckId) {
  const meta = getRegistry()[deckId];
  if (!meta) return false;
  const questions = getDeckQuestions(deckId);
  if (!questions.length) return false;

  // Save + end current session if switching decks
  if (activeDeckId && activeDeckId !== deckId) {
    if (quizActive) saveDeckState();
    if (sessionId)  { localEndSession(sessionId); sessionId = null; }
    quizActive = false; deck = []; deckPos = 0;
    sessionRight = 0; sessionTotal = 0; sessionByMod = {};
  }

  setActiveDeckId(deckId);
  allQuestions   = questions;
  loadedFileName = meta.filename    || '';
  loadedTitle    = meta.title       || '';
  loadedDesc     = meta.description || '';

  const modMap = {};
  questions.forEach(q => {
    if (!modMap[q.mod]) modMap[q.mod] = { id:q.mod, name:q.mod_name||`Module ${q.mod}`, count:0 };
    modMap[q.mod].count++;
  });
  allModules   = Object.values(modMap).sort((a,b) => a.id - b.id);
  selectedMods = new Set(allModules.map(m => m.id));
  return true;
}

// Open module selector / resume prompt for a loaded deck (never the file picker)
function openStudyOptions() {
  const titles = { upload:'Load deck', create:'Create deck', demo:'Demo', edit:'Edit deck' };
  $('#modal-overlay').classList.remove('hidden');
  document.body.style.overflow = 'hidden';
  $('#modal-title').textContent = 'Study deck';
  renderModalModuleSelector();
}

// "Study →" button on a deck card
function studyDeck(deckId) {
  if (!loadDeckIntoMemory(deckId)) return;
  // Always open the module selector — never auto-resume a stale session.
  // Save current progress first so the "Continue session" banner can offer it.
  if (quizActive) saveDeckState();
  quizActive = false;
  deck = []; deckPos = 0;
  openStudyOptions();
}

function editDeck(deckId) {
  if (!loadDeckIntoMemory(deckId)) return;
  updateMenuStates();
  openEditModal();
}

// ── View switching ─────────────────────────────────────────────────────────
function setView(v) {
  currentView = v;
  $$('nav button').forEach(b => b.classList.toggle('active', b.dataset.view === v));
  $('#page-home').classList.toggle('hidden',  v !== 'home');
  $('#page-quiz').classList.toggle('hidden',  v !== 'quiz');
  $('#page-stats').classList.toggle('hidden', v !== 'stats');
  const cardsPage = document.getElementById('page-cards');
  if (cardsPage) cardsPage.classList.toggle('hidden', v !== 'cards');
  document.body.classList.toggle('view-home', v === 'home');

  // Header context: show deck name while studying
  const ctx = document.getElementById('header-context');
  if (ctx) {
    if (v === 'quiz' && loadedTitle) {
      ctx.textContent = loadedTitle;
      ctx.classList.add('header-context-visible');
    } else {
      ctx.textContent = '';
      ctx.classList.remove('header-context-visible');
    }
  }
  // Hide the quiz footer whenever leaving quiz view
  if (v !== 'quiz') $('#quiz-footer').classList.add('quiz-footer-hidden');

  updateMenuStates();
  if (v === 'stats') loadStats();
  if (v === 'home')  { updateResumeCard(); renderDeckSwitcher(); }
  if (v === 'cards') renderCardsView();
}

function updateResumeCard() {
  const card = document.getElementById('resume-card');
  const sub  = document.getElementById('resume-sub');
  if (!card) return;
  if (quizActive && deck.length > 0) {
    const scoreText = sessionTotal > 0 ? ` · ${sessionRight}/${sessionTotal} correct` : '';
    if (sub) sub.textContent = `${deckPos} / ${deck.length} answered${scoreText}`;
    card.classList.remove('hidden');
  } else {
    card.classList.add('hidden');
  }
}

function resumeSession() { setView('quiz'); }

// ── Deck Switcher ──────────────────────────────────────────────────────────
function renderDeckSwitcher() {
  const switcherEl = document.getElementById('deck-switcher');
  const listEl     = document.getElementById('deck-list');
  const addLabel   = document.getElementById('add-deck-label');
  if (!switcherEl || !listEl) return;

  const reg = getRegistry();
  const ids = Object.keys(reg).sort((a,b) => (reg[b].addedAt||0) - (reg[a].addedAt||0));

  if (ids.length === 0) {
    switcherEl.classList.add('hidden');
    if (addLabel) addLabel.classList.add('hidden');
    return;
  }

  switcherEl.classList.remove('hidden');
  if (addLabel) addLabel.classList.remove('hidden');
  listEl.innerHTML = '';

  ids.forEach(id => {
    const meta     = reg[id];
    const stats    = getDeckStats(id);
    const sessions = (stats.sessions || []).filter(s => s.ended_at);
    const isActive = id === activeDeckId;
    const icon     = id === DEMO_ID ? ICONS.play : id === 'deck_created' ? ICONS.pencil : ICONS.stack;
    const metaLine = `${meta.questionCount || '?'} questions${sessions.length > 0 ? ` · ${sessions.length} session${sessions.length !== 1 ? 's' : ''}` : ''}`;

    // Mastery bar
    const sc = getStateCounts(id);
    const masteryBar = `<div class="mastery-bar">
      <div class="mastery-seg new"      style="flex:${sc.new}"></div>
      <div class="mastery-seg learning" style="flex:${sc.learning}"></div>
      <div class="mastery-seg review"   style="flex:${sc.review}"></div>
      <div class="mastery-seg known"    style="flex:${sc.known}"></div>
    </div>`;
    // Exam countdown
    const daysLeft = getExamDaysLeft(id);
    const examHtml = daysLeft !== null
      ? `<div class="exam-countdown${daysLeft <= 3 ? ' urgent' : ''}">
           ${ICONS.calendar} ${daysLeft > 0 ? `${daysLeft} day${daysLeft!==1?'s':''} until exam` : daysLeft===0 ? 'Exam today!' : 'Exam passed'}
         </div>` : '';
    const dueHtml = sc.due > 0 ? ` · <span style="color:var(--green-mid);font-weight:600">${sc.due} due</span>` : '';

    const card = document.createElement('div');
    card.className = 'deck-entry' + (isActive ? ' is-active' : '');
    card.innerHTML = `
      <div class="deck-entry-main">
        <div class="deck-entry-icon">${icon}</div>
        <div class="deck-entry-info">
          <div class="deck-entry-title">${escapeHtml(meta.title || meta.filename || 'Untitled')}</div>
          ${meta.description ? `<div class="deck-entry-desc">${escapeHtml(meta.description)}</div>` : ''}
          <div class="deck-entry-meta">${metaLine}${dueHtml}</div>
          ${masteryBar}
          ${examHtml}
        </div>
      </div>
      <div class="deck-entry-btns">
        <button class="btn btn-primary deck-study-btn" onclick="studyDeck('${id}')">Study ${ICONS.arrowR}</button>
        <button class="btn" onclick="viewDeckStats('${id}')">Stats</button>
        <div class="deck-menu-wrap" id="dm-wrap-${id}">
          <button class="deck-menu-btn" id="dm-btn-${id}" onclick="toggleDeckMenu(event,'${id}')" title="More options">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/>
            </svg>
          </button>
        </div>
      </div>`;
    listEl.appendChild(card);
  });
}

function confirmRemoveDeck(id) {
  const meta = getRegistry()[id];
  const name = meta?.title || meta?.filename || 'this deck';
  if (!confirm(`Remove "${name}" from your library?\n\nStats will be deleted. The original file won't be affected.`)) return;
  removeDeck(id);
}

function removeDeck(id) {
  const wasActive = id === activeDeckId;
  if (wasActive) {
    if (quizActive && sessionId) { localEndSession(sessionId); }
    sessionId    = null; quizActive   = false;
    deck         = []; deckPos      = 0;
    allQuestions = []; allModules   = [];
    selectedMods = new Set();
    loadedTitle  = ''; loadedDesc   = ''; loadedFileName = '';
    setActiveDeckId(null);
  }
  deleteDeckMeta(id);
  try { localStorage.removeItem(deckQsKey(id));    } catch {}
  try { localStorage.removeItem(deckStatsKey(id)); } catch {}
  // Always return to home so the quiz view can't linger with deleted questions
  setView('home');
  updateMenuStates();
}

// ── Per-deck export / import save state ───────────────────────────────────
function exportDeckState(deckId) {
  const meta = getRegistry()[deckId];
  if (!meta) return;
  const qs    = getDeckQuestions(deckId);
  const stats = getDeckStats(deckId);

  // Capture live session position if this is the active deck in-progress
  let deckState = stats.deckState;
  if (deckId === activeDeckId && quizActive && deck.length > 0) {
    deckState = {
      deckIds: deck.map(q => q.id), deckPos, round,
      sessionRight, sessionTotal, sessionByMod,
      selectedModIds: [...selectedMods],
    };
  }

  const payload = {
    version:     4,
    exported_at: new Date().toISOString(),
    deckId,
    title:       meta.title       || '',
    description: meta.description || '',
    filename:    meta.filename    || '',
    sessions:    stats.sessions   || [],
    qstats:      stats.qstats     || {},
    deckState,
    questions:   qs,
  };

  const blob = new Blob([JSON.stringify(payload, null, 2)], { type:'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  const name = (meta.title || meta.filename || 'deck').replace(/[^a-z0-9]/gi,'_').toLowerCase();
  a.download = `save_${name}_${new Date().toISOString().slice(0,10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}


function applyImportedState() {
  if (!pendingImportData) return;
  const data   = pendingImportData;
  const deckId = pendingImportDeckId;

  // Close any open sessions in the imported data
  const importedSessions = (data.sessions || []).map(s =>
    s.ended_at ? s : { ...s, ended_at: new Date().toISOString() }
  );

  // If save file contains questions, register the deck (self-contained import)
  if (Array.isArray(data.questions) && data.questions.length) {
    const id = deckId || data.deckId || `deck_${Date.now()}`;
    upsertDeckMeta(id, {
      title:         data.title       || '',
      description:   data.description || '',
      filename:      data.filename    || '',
      questionCount: data.questions.length,
      addedAt:       getRegistry()[id]?.addedAt || Date.now(),
    });
    saveDeckQuestions(id, data.questions);
    pendingImportDeckId = id;
  }

  const targetId = pendingImportDeckId;
  if (!targetId) { alert('Could not determine which deck to import into.'); return; }

  const obj = getDeckStats(targetId);
  obj.sessions  = importedSessions;
  obj.qstats    = data.qstats || {};
  obj.deckState = data.deckState || null;
  saveDeckStats(targetId, obj);

  // If importing into the active deck, reload questions and try to restore position
  if (targetId === activeDeckId) {
    allQuestions = getDeckQuestions(targetId);
    tryRestoreDeckState();
  }

  pendingImportData   = null;
  pendingImportDeckId = null;
  renderDeckSwitcher();
  updateResumeCard();
  if (!$('#page-stats').classList.contains('hidden')) loadStats();
  alert('Save state imported successfully!');
}

// ── Deck management helpers ───────────────────────────────────────────────

// Navigate to stats page pre-filtered to a specific deck
function viewDeckStats(deckId) {
  statsDeckId = deckId;
  setView('stats');
}

// Called by the stats deck picker <select>
function statsChangeDeck(val) {
  statsDeckId = val;
  loadStats();
}

// Export just the question JSON (no stats) for a deck by id
function exportDeckById(deckId) {
  const meta = getRegistry()[deckId];
  if (!meta) return;
  const qs = getDeckQuestions(deckId);
  if (!qs.length) return;
  const payload = { title: meta.title || '', description: meta.description || '', questions: qs };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = ((meta.title || meta.filename || 'deck').replace(/[^a-z0-9]/gi, '_').toLowerCase()) + '.json';
  a.click();
  URL.revokeObjectURL(url);
}

// Build the HTML for a per-deck ⋯ dropdown
function buildDeckMenuHtml(id) {
  const SVG = {
    edit:   `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>`,
    export: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>`,
    trash:  `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>`,
  };
  return `
    <button class="menu-item" onclick="closeDeckMenuPortal();editDeck('${id}')">${SVG.edit} Edit deck</button>
    <button class="menu-item" onclick="closeDeckMenuPortal();exportDeckById('${id}')">${SVG.export} Export deck JSON</button>
    <button class="menu-item" onclick="closeDeckMenuPortal();exportDeckState('${id}')">${SVG.export} Export save state</button>
    <button class="menu-item" onclick="openSetExamDate('${id}')">${ICONS.calendar} Set exam date</button>
    <div class="menu-divider"></div>
    <button class="menu-item menu-item-danger" onclick="closeDeckMenuPortal();confirmRemoveDeck('${id}')">${SVG.trash} Remove</button>`;
}

// Close the shared portal dropdown
function closeDeckMenuPortal() {
  const p = document.getElementById('dm-portal');
  if (p) p.remove();
}

// Toggle a per-deck ⋯ dropdown via a body-level portal (bypasses backdrop-filter stacking contexts)
function toggleDeckMenu(e, id) {
  e.stopPropagation();
  const existing = document.getElementById('dm-portal');
  const alreadyOpen = existing && existing.dataset.deckId === id;
  closeDeckMenuPortal();
  if (alreadyOpen) return;

  const btn  = document.getElementById('dm-btn-' + id);
  if (!btn) return;
  const rect = btn.getBoundingClientRect();

  const portal = document.createElement('div');
  portal.id            = 'dm-portal';
  portal.className     = 'deck-menu';
  portal.dataset.deckId = id;
  portal.style.cssText = `
    position: fixed;
    top:  ${rect.bottom + 4}px;
    right: ${window.innerWidth - rect.right}px;
    z-index: 9999;
  `;
  portal.innerHTML = buildDeckMenuHtml(id);
  document.body.appendChild(portal);
}

// Live-save deck name while user types in the Edit deck modal
function saveDeckNameLive(val) {
  if (!activeDeckId) return;
  const trimmed = val.trim();
  upsertDeckMeta(activeDeckId, { title: trimmed });
  loadedTitle = trimmed;
  // Update modal title to reflect new name
  const n = getDeckQuestions(activeDeckId).length || allQuestions.length;
  $('#modal-title').textContent = `Edit deck · ${n} card${n !== 1 ? 's' : ''}`;
}

// Live-save deck description while user types in the Edit deck modal
function saveDeckDescLive(val) {
  if (!activeDeckId) return;
  upsertDeckMeta(activeDeckId, { description: val.trim() });
  loadedDesc = val.trim();
}

// ── Modal system ───────────────────────────────────────────────────────────
function openModal(type) {
  $('#modal-overlay').classList.remove('hidden');
  document.body.style.overflow = 'hidden';
  const titles = { upload:'Load deck', create:'Create deck', demo:'Demo', edit:'Edit deck' };
  $('#modal-title').textContent = titles[type] || '';
  if      (type === 'upload') renderUploadModal();
  else if (type === 'create') renderCreateModal();
  else if (type === 'demo')   renderDemoModal();
  else if (type === 'edit')   renderEditModal();
}
function closeModal() {
  $('#modal-overlay').classList.add('hidden');
  document.body.style.overflow = '';
}
function handleOverlayClick(e) {
  if (e.target.id === 'modal-overlay') closeModal();
}

// ── Upload modal ───────────────────────────────────────────────────────────
function renderUploadModal() {

  $('#modal-content').innerHTML = `
    <div id="drop-zone">
      <div class="dz-icon">📂</div>
      <div class="dz-title">Drop a deck or save-state JSON</div>
      <div class="dz-sub">or click to browse</div>
      <input type="file" id="modal-file-input" accept=".json,application/json" style="display:none">
      <button class="btn btn-primary btn-sm" onclick="$('#modal-file-input').click()">Choose file</button>
      <p id="modal-file-error" style="color:var(--red);font-size:12px;margin-top:10px;display:none;text-align:center"></p>
    </div>
    <p style="font-size:11px;color:var(--text-3);text-align:center;margin-top:10px">
      Deck JSON or save-state files — read locally, nothing uploaded.
    </p>`;

  const dz    = $('#drop-zone');
  const input = $('#modal-file-input');
  dz.addEventListener('click', e => {
    if (e.target.tagName !== 'BUTTON' && e.target.tagName !== 'INPUT') input.click();
  });
  dz.addEventListener('dragover',  e => { e.preventDefault(); dz.classList.add('drag-over'); });
  dz.addEventListener('dragleave', () => dz.classList.remove('drag-over'));
  dz.addEventListener('drop', e => {
    e.preventDefault(); dz.classList.remove('drag-over');
    if (e.dataTransfer.files[0]) readJsonFile(e.dataTransfer.files[0]);
  });
  input.addEventListener('change', () => {
    if (input.files[0]) readJsonFile(input.files[0]); input.value = '';
  });
}

function readJsonFile(file) {
  const reader   = new FileReader();
  reader.onload  = e => detectAndLoadFile(e.target.result, file.name);
  reader.onerror = () => showModalError('Could not read file.');
  reader.readAsText(file);
}

// Route uploaded JSON: save state → applyImportedState; deck pack → parseAndRegisterDeck
function detectAndLoadFile(text, filename) {
  let parsed;
  try { parsed = JSON.parse(text); }
  catch { showModalError('Invalid JSON — could not parse the file.'); return; }
  // Save states have sessions[] + qstats{}
  if (parsed && Array.isArray(parsed.sessions) && typeof parsed.qstats === 'object') {
    pendingImportData   = parsed;
    pendingImportDeckId = parsed.deckId || null;
    closeModal();
    applyImportedState();
    return;
  }
  parseAndRegisterDeck(text, filename);
}

// Handles both bare array and {title,description,questions} formats
function parseAndRegisterDeck(text, filename) {
  let parsed;
  try { parsed = JSON.parse(text); }
  catch { showModalError('Invalid JSON — could not parse the file.'); return; }

  let title = '', description = '', questions;
  if (Array.isArray(parsed)) {
    questions = parsed;
  } else if (parsed && Array.isArray(parsed.questions)) {
    title       = parsed.title       || '';
    description = parsed.description || '';
    questions   = parsed.questions;
  } else {
    showModalError('File must be a JSON array or { title, description, questions } object.'); return;
  }

  if (!questions.length) { showModalError('No questions found in this file.'); return; }
  const s = questions[0];
  if (!s.id || !s.q || !Array.isArray(s.opts) || s.ans === undefined) {
    showModalError('Questions need id, q, opts[], and ans fields.'); return;
  }

  registerAndLoadDeck({ title, description, filename, questions });
}

// Register in library, set as active, show module selector
function registerAndLoadDeck({ id, title, description, filename, questions }) {
  const deckId = id || `deck_${Date.now()}`;

  // End current session if switching decks
  if (activeDeckId && activeDeckId !== deckId) {
    if (quizActive) saveDeckState();
    if (sessionId)  { localEndSession(sessionId); sessionId = null; }
    quizActive = false; deck = []; deckPos = 0;
    sessionRight = 0; sessionTotal = 0; sessionByMod = {};
  }

  upsertDeckMeta(deckId, {
    title, description, filename,
    questionCount: questions.length,
    addedAt: getRegistry()[deckId]?.addedAt || Date.now(),
  });
  saveDeckQuestions(deckId, questions);
  setActiveDeckId(deckId);

  allQuestions   = questions;
  loadedFileName = filename    || '';
  loadedTitle    = title       || '';
  loadedDesc     = description || '';

  const modMap = {};
  questions.forEach(q => {
    if (!modMap[q.mod]) modMap[q.mod] = { id:q.mod, name:q.mod_name||`Module ${q.mod}`, count:0 };
    modMap[q.mod].count++;
  });
  allModules   = Object.values(modMap).sort((a,b) => a.id - b.id);
  selectedMods = new Set(allModules.map(m => m.id));

  updateMenuStates();
  renderDeckSwitcher();
  if (!$('#modal-overlay').classList.contains('hidden')) renderModalModuleSelector();
}

function showModalError(msg) {
  const el = $('#modal-file-error');
  if (el) { el.textContent = msg; el.style.display = ''; }
}

// Export the deck JSON (with title/description)
function exportLoadedDeck() {
  if (!allQuestions.length) return;
  const payload = {
    title:       loadedTitle || loadedFileName || 'My Deck',
    description: loadedDesc  || '',
    questions:   allQuestions,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type:'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  let name   = loadedFileName || 'questions.json';
  if (name === 'demo') name = 'georgia-tech-trivia.json';
  if (!name.endsWith('.json')) name += '.json';
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

// After editing cards: persist changes back to the deck registry
function syncEditedDeckToStorage() {
  if (!activeDeckId) return;
  saveDeckQuestions(activeDeckId, allQuestions);
  upsertDeckMeta(activeDeckId, { questionCount: allQuestions.length });
  renderDeckSwitcher();
}

// ── Module selector ────────────────────────────────────────────────────────
function renderModalModuleSelector() {
  const displayName = loadedTitle || loadedFileName || 'Deck';
  $('#modal-content').innerHTML = `
    <div style="margin-bottom:14px">
      <div style="font-size:15px;font-weight:600;color:var(--text)">${escapeHtml(displayName)}</div>
      ${loadedDesc ? `<div style="font-size:13px;color:var(--text-3);margin-top:3px">${escapeHtml(loadedDesc)}</div>` : ''}
    </div>
    <div class="mode-toggle" style="margin-bottom:14px">
      <button class="mode-toggle-btn${studyMode==='spaced'?' active':''}" data-mode="spaced" onclick="setStudyMode('spaced')">${ICONS.spaced} Spaced</button>
      <button class="mode-toggle-btn${studyMode==='classic'?' active':''}" data-mode="classic" onclick="setStudyMode('classic')">${ICONS.classic} Classic</button>
    </div>
    <div id="srs-due-info" style="font-size:13px;margin-bottom:12px;${studyMode!=='spaced'?'display:none':''}"></div>
    <p style="font-size:13px;color:var(--text-3);margin-bottom:14px">Pick modules to study.</p>
    <div class="mod-grid" id="mod-grid"></div>
    <div id="shuffle-row" style="${studyMode==='classic'?'':'display:none'}">
      <label class="shuffle-toggle" style="margin-top:14px">
        <input type="checkbox" id="shuffle-chk" ${shuffleMode ? 'checked' : ''}
               onchange="shuffleMode = this.checked">
        <span>Shuffle questions</span>
      </label>
    </div>
    <button id="start-btn" class="btn btn-primary btn-block mt-1" onclick="modalStartQuiz()" disabled>Start ${ICONS.arrowR}</button>`;
  renderModuleGrid();
  selectAll();
  updateModalDueCount();
}

function modalStartQuiz() { closeModal(); startQuiz(); }

function renderModuleGrid() {
  const grid = $('#mod-grid');
  grid.innerHTML = '';
  allModules.forEach(m => {
    const btn = document.createElement('button');
    btn.className   = 'mod-card';
    btn.dataset.modId = m.id;
    btn.innerHTML   = `<div class="mod-num">Module ${m.id}</div>
                       <div class="mod-name">${escapeHtml(m.name)}</div>
                       <div class="mod-cnt">${m.count} questions</div>`;
    btn.addEventListener('click', () => toggleMod(m.id, btn));
    grid.appendChild(btn);
  });
  const all = document.createElement('button');
  all.className = 'mod-card'; all.id = 'mod-all';
  all.innerHTML   = `<div class="mod-num" style="color:var(--text-2)">All</div>
                     <div class="mod-name">All modules</div>
                     <div class="mod-cnt">${allQuestions.length} questions total</div>`;
  all.addEventListener('click', selectAll);
  grid.appendChild(all);
  updateStartBtn();
}
function toggleMod(id, card) {
  $('#mod-all')?.classList.remove('selected');
  card.classList.toggle('selected');
  if (card.classList.contains('selected')) selectedMods.add(id);
  else selectedMods.delete(id);
  updateStartBtn();
}
function selectAll() {
  selectedMods = new Set(allModules.map(m => m.id));
  $$('.mod-card').forEach(c => c.classList.remove('selected'));
  $('#mod-all')?.classList.add('selected');
  updateStartBtn();
}
function updateStartBtn() {
  const btn = $('#start-btn');
  if (!btn) return;
  if (studyMode === 'spaced') {
    updateModalDueCount(); // this handles enabling/disabling
  } else {
    btn.disabled = selectedMods.size === 0;
  }
}

function setStudyMode(mode) {
  studyMode = mode;
  $$('.mode-toggle-btn').forEach(b => b.classList.toggle('active', b.dataset.mode === mode));
  const shuffleRow = document.getElementById('shuffle-row');
  if (shuffleRow) shuffleRow.style.display = mode === 'classic' ? '' : 'none';
  updateModalDueCount();
}

function updateModalDueCount() {
  const el = document.getElementById('srs-due-info');
  if (!el) return;
  if (studyMode === 'spaced') {
    const q = buildSRSQueue();
    el.innerHTML = q.length > 0
      ? `<span style="color:var(--green-mid);font-weight:600">${q.length} card${q.length!==1?'s':''} due for review</span>`
      : `<span style="color:var(--text-3)">${ICONS.check} All caught up — no cards due!</span>`;
    const btn = document.getElementById('start-btn');
    if (btn) btn.disabled = q.length === 0;
    el.style.display = '';
  } else {
    el.style.display = 'none';
    const btn = document.getElementById('start-btn');
    if (btn) btn.disabled = selectedMods.size === 0;
  }
}

// ── Demo modal ─────────────────────────────────────────────────────────────
function renderDemoModal() {
  $('#modal-content').innerHTML = `
    <div style="text-align:center;padding:1.5rem 0 0.5rem">
      <div style="width:52px;height:52px;border-radius:14px;background:var(--surface2);display:flex;align-items:center;justify-content:center;margin:0 auto 14px"><svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3"/></svg></div>
      <div style="font-size:17px;font-weight:600;color:var(--text);margin-bottom:6px">${escapeHtml(DEMO_TITLE)}</div>
      <div style="font-size:13px;color:var(--text-3);margin-bottom:28px">${escapeHtml(DEMO_DESC)}</div>
      <button class="btn btn-primary" style="padding:10px 28px;font-size:15px" onclick="startDemo()">Load demo ${ICONS.arrowR}</button>
    </div>`;
}

function startDemo() {
  registerAndLoadDeck({ id:DEMO_ID, title:DEMO_TITLE, description:DEMO_DESC,
                        filename:'demo', questions:DEMO_QUESTIONS });
}

// ── Create deck ────────────────────────────────────────────────────────────
function getCreatedDeck() {
  try { return JSON.parse(localStorage.getItem(CREATE_KEY) || '[]'); } catch { return []; }
}
function saveCreatedDeck(d) {
  try { localStorage.setItem(CREATE_KEY, JSON.stringify(d)); } catch {}
  updateCreateCard();
}
function updateCreateCard() {
  const sub = $('#create-sub');
  if (!sub) return;
  const d = getCreatedDeck();
  sub.textContent = d.length > 0 ? `${d.length} card${d.length !== 1 ? 's' : ''} saved` : 'Build your own deck';
}

function studyCreatedDeck() {
  const d = getCreatedDeck();
  if (!d.length) return;
  const title = (localStorage.getItem(CREATE_TITLE_KEY) || '').trim() || 'My Deck';
  const desc  = (localStorage.getItem(CREATE_DESC_KEY)  || '').trim() || '';
  registerAndLoadDeck({
    id: 'deck_created', title, description: desc,
    filename: 'my-deck.json', questions: d,
  });
  // Clear the create buffer so next Create session starts fresh
  saveCreatedDeck([]);
  try { localStorage.removeItem(CREATE_TITLE_KEY); localStorage.removeItem(CREATE_DESC_KEY); } catch {}
}

// ── Create-deck form helpers ───────────────────────────────────────────────
function resetCreateForm() { createOpts = ['','','',''];  createCorrect = 0; }

function syncCreateOpts() {
  document.querySelectorAll('.create-opt-input').forEach((inp, i) => {
    if (i < createOpts.length) createOpts[i] = inp.value;
  });
}

function renderCreateOptionRows() {
  const wrap = document.getElementById('create-opts-wrap');
  if (!wrap) return;
  wrap.innerHTML = '';
  createOpts.forEach((val, i) => {
    const row    = document.createElement('div');
    row.className = 'cr-opt-row' + (createCorrect === i ? ' is-correct' : '');
    const numBtn = document.createElement('button');
    numBtn.type = 'button'; numBtn.className = 'cr-opt-num' + (createCorrect === i ? ' correct' : '');
    numBtn.title = 'Mark as correct'; numBtn.textContent = i + 1;
    numBtn.addEventListener('click', () => { syncCreateOpts(); createCorrect = i; renderCreateOptionRows(); });
    const inp = document.createElement('input');
    inp.className = 'create-opt-input'; inp.id = `co-${i}`; inp.value = val; inp.placeholder = `Option ${i + 1}`;
    row.appendChild(numBtn); row.appendChild(inp);
    if (createOpts.length > 2) {
      const del = document.createElement('button');
      del.type = 'button'; del.className = 'cr-opt-del'; del.title = 'Remove';
      del.innerHTML = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;
      del.addEventListener('click', () => {
        syncCreateOpts(); createOpts.splice(i, 1);
        if (createCorrect >= createOpts.length) createCorrect = createOpts.length - 1;
        renderCreateOptionRows();
      });
      row.appendChild(del);
    }
    wrap.appendChild(row);
  });
  if (createOpts.length < 8) {
    const add = document.createElement('button');
    add.type = 'button'; add.className = 'cr-add-opt'; add.textContent = '+ Add option';
    add.addEventListener('click', () => {
      syncCreateOpts(); createOpts.push(''); renderCreateOptionRows();
      setTimeout(() => document.getElementById(`co-${createOpts.length - 1}`)?.focus(), 40);
    });
    wrap.appendChild(add);
  }
}

function renderCreateModal() {
  const createdDeck  = getCreatedDeck();
  const storedTitle  = localStorage.getItem(CREATE_TITLE_KEY) || '';
  const storedDesc   = localStorage.getItem(CREATE_DESC_KEY)  || '';
  $('#modal-title').textContent = 'Create deck';
  const cards = createdDeck.map((q, i) => `
    <div class="create-card-item">
      <div class="create-card-num">${i + 1}</div>
      <div class="create-card-body">
        <div class="create-card-q">${escapeHtml(q.q)}</div>
        <div class="create-card-ans">✓ ${escapeHtml(q.opts[q.ans])}</div>
      </div>
      <button class="create-card-del" onclick="deleteCreateCard(${i})" title="Delete">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
          <path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
        </svg>
      </button>
    </div>`).join('');

  $('#modal-content').innerHTML = `
    <div class="deck-meta-fields">
      <div class="form-group">
        <label>Deck name</label>
        <input id="create-deck-name" type="text" value="${escapeHtml(storedTitle)}" placeholder="My Deck"
               oninput="localStorage.setItem('${CREATE_TITLE_KEY}', this.value)">
      </div>
      <div class="form-group">
        <label>Description <span class="form-optional">(optional)</span></label>
        <textarea id="create-deck-desc" rows="2" placeholder="What does this deck cover?"
                  oninput="localStorage.setItem('${CREATE_DESC_KEY}', this.value)">${escapeHtml(storedDesc)}</textarea>
      </div>
    </div>
    <hr class="deck-meta-divider">
    <div class="create-card-list" id="create-card-list">
      ${createdDeck.length > 0 ? cards
        : `<div class="empty-state" style="padding:2rem 0"><h3>No cards yet</h3><p>Add your first card below.</p></div>`}
    </div>
    <hr style="border:none;border-top:1px solid var(--border);margin:16px 0">
    <div class="form-group">
      <label>Question</label>
      <textarea id="create-q" rows="3" placeholder="Type your question here…"></textarea>
    </div>
    <div class="form-group">
      <label>Options <span class="form-optional">— click number to mark correct</span></label>
      <div id="create-opts-wrap"></div>
    </div>
    <div class="form-group">
      <label>Explanation <span class="form-optional">(optional)</span></label>
      <textarea id="create-exp" rows="2" placeholder="Explain the correct answer…"></textarea>
    </div>
    <p id="create-error" style="color:var(--red);font-size:12px;margin-bottom:8px;display:none"></p>
    <div style="display:flex;gap:10px;margin-top:4px">
      <button class="btn" onclick="addCreateCard()">+ Add card</button>
      ${createdDeck.length > 0
        ? `<button class="btn btn-primary" style="flex:1" onclick="studyCreatedDeck()">Study deck ${ICONS.arrowR}</button>`
        : ''}
    </div>`;

  resetCreateForm();
  renderCreateOptionRows();
}

function addCreateCard() {
  syncCreateOpts();
  const qText       = ($('#create-q').value || '').trim();
  const trimmedOpts = createOpts.map(o => o.trim());
  const exp         = ($('#create-exp').value || '').trim();
  const err         = $('#create-error');

  if (!qText) { err.textContent = 'Please enter a question.'; err.style.display = ''; return; }
  const emptyIdx = trimmedOpts.findIndex(o => !o);
  if (emptyIdx !== -1) { err.textContent = `Please fill in Option ${emptyIdx + 1}.`; err.style.display = ''; return; }

  const d = getCreatedDeck();
  const deckTitle = (localStorage.getItem(CREATE_TITLE_KEY) || '').trim() || 'My Deck';
  d.push({
    id: `created_${Date.now()}`, mod: 1, mod_name: deckTitle, type: 'MCQ',
    q: qText, opts: trimmedOpts, ans: createCorrect, exp,
  });
  saveCreatedDeck(d);
  renderCreateModal();
}

function deleteCreateCard(i) {
  const d = getCreatedDeck(); d.splice(i, 1); saveCreatedDeck(d);
  renderCreateModal();
}

// ── Edit-form option helpers (shared by Edit & Add-card views) ────────────
function syncEditOpts() {
  document.querySelectorAll('.edit-opt-input').forEach((inp, i) => {
    if (i < editOpts.length) editOpts[i] = inp.value;
  });
}

function renderEditOptionRows() {
  const wrap = document.getElementById('edit-opts-wrap');
  if (!wrap) return;
  wrap.innerHTML = '';
  editOpts.forEach((val, i) => {
    const row    = document.createElement('div');
    row.className = 'cr-opt-row' + (editCorrect === i ? ' is-correct' : '');
    const numBtn = document.createElement('button');
    numBtn.type = 'button'; numBtn.className = 'cr-opt-num' + (editCorrect === i ? ' correct' : '');
    numBtn.title = 'Mark as correct'; numBtn.textContent = i + 1;
    numBtn.addEventListener('click', () => { syncEditOpts(); editCorrect = i; renderEditOptionRows(); });
    const inp = document.createElement('input');
    inp.className = 'edit-opt-input'; inp.id = `eo-${i}`; inp.value = val; inp.placeholder = `Option ${i + 1}`;
    row.appendChild(numBtn); row.appendChild(inp);
    if (editOpts.length > 2) {
      const del = document.createElement('button');
      del.type = 'button'; del.className = 'cr-opt-del'; del.title = 'Remove';
      del.innerHTML = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;
      del.addEventListener('click', () => {
        syncEditOpts(); editOpts.splice(i, 1);
        if (editCorrect >= editOpts.length) editCorrect = editOpts.length - 1;
        renderEditOptionRows();
      });
      row.appendChild(del);
    }
    wrap.appendChild(row);
  });
  if (editOpts.length < 8) {
    const add = document.createElement('button');
    add.type = 'button'; add.className = 'cr-add-opt'; add.textContent = '+ Add option';
    add.addEventListener('click', () => {
      syncEditOpts(); editOpts.push(''); renderEditOptionRows();
      setTimeout(() => document.getElementById(`eo-${editOpts.length - 1}`)?.focus(), 40);
    });
    wrap.appendChild(add);
  }
}

// ── Edit modal ──────────────────────────────────────────────────────────────
function openEditModal() {
  allQuestions = JSON.parse(JSON.stringify(allQuestions));
  editView = 'list'; editCardIdx = null;
  openModal('edit');
}

function renderEditModal() {
  if      (editView === 'list') renderEditList();
  else if (editView === 'edit') renderEditForm();
  else if (editView === 'new')  renderNewCardForm();
}

function renderEditList() {
  const n = allQuestions.length;
  $('#modal-title').textContent = `Edit deck · ${n} card${n !== 1 ? 's' : ''}`;
  const meta = activeDeckId ? (getRegistry()[activeDeckId] || {}) : {};
  const cards = allQuestions.map((q, i) => `
    <div class="create-card-item">
      <div class="create-card-num">${i + 1}</div>
      <div class="create-card-body">
        <div class="create-card-q">${escapeHtml(q.q)}</div>
        <div class="create-card-ans">✓ ${escapeHtml(q.opts[q.ans])}</div>
      </div>
      <button class="create-card-edit" onclick="goEditCard(${i})" title="Edit">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
      </button>
      <button class="create-card-del" onclick="deleteEditCard(${i})" title="Delete">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
      </button>
    </div>`).join('');

  $('#modal-content').innerHTML = `
    <div class="deck-meta-fields">
      <div class="form-group">
        <label>Deck name</label>
        <input id="edit-deck-name" type="text" value="${escapeHtml(meta.title || '')}" placeholder="Deck name"
               oninput="saveDeckNameLive(this.value)">
      </div>
      <div class="form-group">
        <label>Description <span class="form-optional">(optional)</span></label>
        <textarea id="edit-deck-desc" rows="2" placeholder="Short description"
                  oninput="saveDeckDescLive(this.value)">${escapeHtml(meta.description || '')}</textarea>
      </div>
    </div>
    <hr class="deck-meta-divider">
    <div class="create-card-list">
      ${n > 0 ? cards
        : `<div class="empty-state" style="padding:2rem 0"><h3>No cards</h3><p>Add some cards below.</p></div>`}
    </div>
    <div class="create-footer" style="margin-top:12px">
      <button class="btn" onclick="goNewCard()">+ Add card</button>
      <button class="btn btn-primary" onclick="exportLoadedDeck()">↓ Export JSON</button>
    </div>`;
}

function renderEditForm() {
  const q = allQuestions[editCardIdx];
  editOpts    = (q.opts || []).map(o => o);
  editCorrect = q.ans ?? 0;
  $('#modal-title').textContent = `Edit card ${editCardIdx + 1} of ${allQuestions.length}`;
  $('#modal-content').innerHTML = `
    <button class="btn btn-sm" style="margin-bottom:14px" onclick="goEditList()">← Back to deck</button>
    <div class="form-group">
      <label>Question</label>
      <textarea id="edit-q" rows="3">${escapeHtml(q.q)}</textarea>
    </div>
    <div class="form-group">
      <label>Options <span class="form-optional">— click number to mark correct</span></label>
      <div id="edit-opts-wrap"></div>
    </div>
    <div class="form-group">
      <label>Explanation <span class="form-optional">(optional)</span></label>
      <textarea id="edit-exp" rows="2">${escapeHtml(q.exp || '')}</textarea>
    </div>
    <p id="edit-error" style="color:var(--red);font-size:12px;margin-bottom:8px;display:none"></p>
    <div style="display:flex;gap:10px">
      <button class="btn" onclick="goEditList()">Cancel</button>
      <button class="btn btn-primary" style="flex:1" onclick="saveEditCard()">Save changes</button>
    </div>`;
  renderEditOptionRows();
}

function renderNewCardForm() {
  editOpts    = ['','','',''];
  editCorrect = 0;
  $('#modal-title').textContent = 'Add card';
  $('#modal-content').innerHTML = `
    <button class="btn btn-sm" style="margin-bottom:14px" onclick="goEditList()">← Back to deck</button>
    <div class="form-group">
      <label>Question</label>
      <textarea id="new-q" rows="3" placeholder="Type your question here…"></textarea>
    </div>
    <div class="form-group">
      <label>Options <span class="form-optional">— click number to mark correct</span></label>
      <div id="edit-opts-wrap"></div>
    </div>
    <div class="form-group">
      <label>Explanation <span class="form-optional">(optional)</span></label>
      <textarea id="new-exp" rows="2" placeholder="Explain the correct answer…"></textarea>
    </div>
    <p id="new-error" style="color:var(--red);font-size:12px;margin-bottom:8px;display:none"></p>
    <div style="display:flex;gap:10px">
      <button class="btn" onclick="goEditList()">Cancel</button>
      <button class="btn btn-primary" style="flex:1" onclick="saveNewEditCard()">Add to deck</button>
    </div>`;
  renderEditOptionRows();
}

function goEditCard(i) { editCardIdx = i; editView = 'edit'; renderEditModal(); }
function goNewCard()   { editView = 'new';  renderEditModal(); }
function goEditList()  { editView = 'list'; renderEditModal(); }

function saveEditCard() {
  syncEditOpts();
  const qText       = ($('#edit-q').value || '').trim();
  const trimmedOpts = editOpts.map(o => o.trim());
  const exp         = ($('#edit-exp').value || '').trim();
  const err         = $('#edit-error');
  if (!qText) { err.textContent = 'Please enter a question.'; err.style.display = ''; return; }
  const emptyIdx = trimmedOpts.findIndex(o => !o);
  if (emptyIdx !== -1) { err.textContent = `Please fill in Option ${emptyIdx + 1}.`; err.style.display = ''; return; }
  allQuestions[editCardIdx] = { ...allQuestions[editCardIdx], q:qText, opts:trimmedOpts, ans:editCorrect, exp };
  syncEditedDeckToStorage();
  goEditList();
}

function saveNewEditCard() {
  syncEditOpts();
  const qText       = ($('#new-q').value || '').trim();
  const trimmedOpts = editOpts.map(o => o.trim());
  const exp         = ($('#new-exp').value || '').trim();
  const err         = $('#new-error');
  if (!qText) { err.textContent = 'Please enter a question.'; err.style.display = ''; return; }
  const emptyIdx = trimmedOpts.findIndex(o => !o);
  if (emptyIdx !== -1) { err.textContent = `Please fill in Option ${emptyIdx + 1}.`; err.style.display = ''; return; }
  allQuestions.push({
    id: `edit_${Date.now()}`,
    mod:      allQuestions[0]?.mod      ?? 1,
    mod_name: allQuestions[0]?.mod_name ?? 'My Deck',
    type: 'MCQ', q:qText, opts:trimmedOpts, ans:editCorrect, exp,
  });
  syncEditedDeckToStorage();
  goEditList();
}

function deleteEditCard(i) {
  allQuestions.splice(i, 1);
  syncEditedDeckToStorage();
  renderEditList();
}

// ── Quiz start ─────────────────────────────────────────────────────────────
function startQuiz() {
  if (sessionId) { localEndSession(sessionId); sessionId = null; }

  // Clear any saved deck state for this deck
  if (activeDeckId) {
    const obj = getDeckStats(activeDeckId);
    obj.deckState = null;
    saveDeckStats(activeDeckId, obj);
  }

  quizActive        = false;
  srsCompleted      = new Set();
  lastAnswerCorrect = false;

  if (studyMode === 'spaced') {
    deck = buildSRSQueue();
    srsOriginalCount = deck.length;
    if (!deck.length) { return; }
  } else {
    const pool = allQuestions.filter(q => selectedMods.has(q.mod));
    deck = shuffleMode ? shuffle(pool) : [...pool];
    srsOriginalCount = deck.length;
  }

  if (!deck.length) return;

  deckPos          = 0;
  round            = 1;
  sessionRight     = 0;
  sessionTotal     = 0;
  sessionByMod     = {};
  answered         = false;
  currentStreak    = 0;
  bestStreak       = 0;
  wrongAnswers     = [];
  sessionStartTime = Date.now();
  sessionId        = localStartSession([...selectedMods]);
  quizActive       = true;
  restoreQuizShell();
  setView('quiz');
  renderQuestion();
}

function getPool() { return allQuestions.filter(q => selectedMods.has(q.mod)); }

// ── Quiz shell ─────────────────────────────────────────────────────────────
function restoreQuizShell() {
  $('#quiz-footer').classList.add('quiz-footer-hidden');
  $('#page-quiz').innerHTML = `
    <div class="pbar-wrap"><div class="pbar-fill" id="pbar" style="width:0%"></div></div>
    <div class="meta-row">
      <span class="badge" id="q-pos"></span>
      <span class="mod-tag" id="q-mod"></span>
      <span class="round-tag" id="q-round"></span>
      <button class="flag-btn" id="flag-btn" title="Flag card" onclick="toggleFlag(currentQ&&currentQ.id)">${ICONS.flag}</button>
    </div>
    <div class="card quiz-card">
      <p class="q-text" id="q-text"></p>
      <div class="opts" id="q-opts"></div>
      <div class="fb" id="q-fb"></div>
    </div>
    <div class="kbd-hint" id="kbd-hint"></div>
    <div class="session-counter" id="session-score"></div>`;
}

// ── Render question ────────────────────────────────────────────────────────
function renderQuestion() {
  answered = false;
  currentQ = deck[deckPos];
  const total = deck.length;
  const pos   = deckPos + 1;
  const isTF  = currentQ.type === 'T/F';

  if (studyMode === 'spaced') {
    const pct = srsOriginalCount > 0 ? Math.round((srsCompleted.size / srsOriginalCount) * 100) : 0;
    $('#pbar').style.width  = pct + '%';
    $('#q-pos').textContent = `${srsCompleted.size} / ${srsOriginalCount}`;
  } else {
    $('#pbar').style.width  = Math.round(((pos - 1) / total) * 100) + '%';
    $('#q-pos').textContent = `${pos} / ${total}`;
  }
  $('#q-mod').textContent   = `M${currentQ.mod} · ${currentQ.mod_name || ''}`;
  $('#q-round').textContent = round > 1 ? `Round ${round}` : '';
  $('#q-text').textContent  = currentQ.q;

  // Update flag button
  const flagBtn = document.getElementById('flag-btn');
  if (flagBtn) {
    const srsData = getCardSRSData(currentQ.id);
    flagBtn.classList.toggle('is-flagged', !!srsData.flagged);
  }

  const opts = $('#q-opts');
  opts.innerHTML = '';
  currentQ.opts.forEach((o, i) => {
    const btn = document.createElement('button');
    btn.className = 'opt'; btn.dataset.i = i;
    const lbl = isTF ? (i === 0 ? 'T' : 'F') : (i + 1);
    btn.innerHTML = `<span class="opt-ltr">${lbl}</span><span>${escapeHtml(o)}</span>`;
    btn.addEventListener('click', () => pickAnswer(i));
    opts.appendChild(btn);
  });

  const fb = $('#q-fb');
  fb.className = 'fb'; fb.style.display = 'none'; fb.innerHTML = '';
  $('#quiz-footer').classList.add('quiz-footer-hidden');

  $('#kbd-hint').innerHTML = isTF
    ? 'Press <kbd>T</kbd> True &nbsp;·&nbsp; <kbd>F</kbd> False'
    : 'Press <kbd>1</kbd> <kbd>2</kbd> <kbd>3</kbd> <kbd>4</kbd> to answer';
  $('#session-score').textContent = sessionTotal > 0
    ? `Session: ${sessionRight} / ${sessionTotal} correct` : '';
}

// ── Answer ─────────────────────────────────────────────────────────────────
async function pickAnswer(chosen) {
  if (answered) return;
  answered = true;
  const correct = (chosen === currentQ.ans);
  lastAnswerCorrect = correct;
  updateCardSRS(currentQ.id, correct);
  if (studyMode === 'spaced' && correct) srsCompleted.add(currentQ.id);

  $$('.opt').forEach(b => b.disabled = true);
  $$('.opt').forEach(btn => {
    const i = parseInt(btn.dataset.i);
    if (i === currentQ.ans)            btn.classList.add('correct');
    else if (i === chosen && !correct) btn.classList.add('wrong');
  });

  sessionTotal++; if (correct) sessionRight++;
  if (!sessionByMod[currentQ.mod])
    sessionByMod[currentQ.mod] = { right:0, total:0, name:currentQ.mod_name };
  sessionByMod[currentQ.mod].total++;
  if (correct) sessionByMod[currentQ.mod].right++;

  // Streak tracking
  if (correct) {
    currentStreak++;
    if (currentStreak > bestStreak) bestStreak = currentStreak;
  } else {
    wrongAnswers.push(currentQ);
    currentStreak = 0;
  }

  const expHtml = currentQ.exp ? `<div class="fb-explain">${escapeHtml(currentQ.exp)}</div>` : '';
  const streakHtml = currentStreak >= 3
    ? `<div class="streak-badge">${ICONS.streak} ${currentStreak} in a row</div>` : '';
  const qid = currentQ.id;

  const fb = $('#q-fb');
  if (correct) {
    fb.className = 'fb ok';
    fb.innerHTML = `<div class="fb-label">Correct!</div>${streakHtml}${expHtml}`;
  } else {
    fb.className = 'fb bad';
    fb.innerHTML = `<div class="fb-label">Not quite — correct: <strong>${escapeHtml(currentQ.opts[currentQ.ans])}</strong></div>${expHtml}`;
  }

  // Confidence tap buttons
  const confHtml = `<div class="conf-row">
    <span class="conf-label">How did that feel?</span>
    <button class="conf-btn conf-got-it"   onclick="markConfidence('${qid}','known')">✓ Got it</button>
    <button class="conf-btn conf-shaky"    onclick="markConfidence('${qid}','shaky')">~ Still shaky</button>
  </div>`;
  fb.innerHTML += confHtml;

  fb.style.display = 'block';
  $('#quiz-footer').classList.remove('quiz-footer-hidden');
  $('#kbd-hint').innerHTML = 'Press <kbd>Space</kbd> or <kbd>→</kbd> for next';

  const streakText = currentStreak >= 2 ? `  ${ICONS.streak} ${currentStreak}` : '';
  $('#session-score').textContent = `Session: ${sessionRight} / ${sessionTotal} correct${streakText}`;

  if (sessionId) localRecordAnswer(sessionId, currentQ.id, currentQ.mod, correct ? 1 : 0, currentQ);
}

function markConfidence(questionId, level) {
  const qstats = getQStats();
  if (qstats[questionId]) {
    qstats[questionId].confidence = level;
    saveQStats(qstats);
  }
  // Update button visuals
  $$('.conf-btn').forEach(b => b.classList.remove('conf-selected'));
  const sel = level === 'known' ? '.conf-got-it' : '.conf-shaky';
  $(sel)?.classList.add('conf-selected');
}

// ── Keyboard shortcuts ─────────────────────────────────────────────────────
document.addEventListener('keydown', e => {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
  if (!$('#modal-overlay').classList.contains('hidden')) return;
  if ($('#page-quiz').classList.contains('hidden') || !currentQ) return;

  const isTF = currentQ.type === 'T/F';
  if (!answered) {
    if (isTF) {
      if (e.key === 't' || e.key === 'T' || e.key === '1') pickAnswer(0);
      else if (e.key === 'f' || e.key === 'F' || e.key === '2') pickAnswer(1);
    } else {
      const n = parseInt(e.key);
      if (n >= 1 && n <= currentQ.opts.length) pickAnswer(n - 1);
    }
  } else {
    if (e.key === 'ArrowRight' || e.key === ' ') {
      e.preventDefault();
      nextQuestion();
    }
  }
});

// ── Next / Go Back ─────────────────────────────────────────────────────────
function nextQuestion() {
  if (studyMode === 'spaced') {
    if (!lastAnswerCorrect) {
      // Requeue wrong card ~4 positions ahead
      const insertAt = Math.min(deckPos + 4, deck.length);
      deck.splice(insertAt, 0, currentQ);
    }
    deckPos++;
    if (deckPos >= deck.length) {
      if (sessionId) localEndSession(sessionId);
      quizActive = false;
      showResults();
      return;
    }
  } else {
    // Classic mode — original behavior
    deckPos++;
    if (deckPos >= deck.length) {
      if (round === 1) {
        if (sessionId) localEndSession(sessionId);
        quizActive = false;
        showResults();
        return;
      }
      round++; deck = shuffle(getPool()); deckPos = 0;
    }
  }
  renderQuestion();
}

function quitQuiz() {
  setView('home');
  // quizActive stays true → resume card stays visible
}

// ── Results ────────────────────────────────────────────────────────────────
function showResults() {
  quizActive = false;
  if (sessionTotal === 0) { setView('home'); return; }

  const n   = sessionTotal;
  const pct = Math.round((sessionRight / n) * 100);
  let grade, gc;
  if (pct >= 90)      { grade='Outstanding';   gc='var(--green)'; }
  else if (pct >= 80) { grade='Very good';      gc='var(--green)'; }
  else if (pct >= 70) { grade='Good';           gc='var(--text)'; }
  else if (pct >= 60) { grade='Passing';        gc='var(--amber)'; }
  else                { grade='Keep reviewing'; gc='var(--red)'; }

  const r    = 44;
  const circ = 2 * Math.PI * r;
  const dash = (circ * pct / 100).toFixed(1);

  // Timer
  const elapsed  = sessionStartTime ? Math.round((Date.now() - sessionStartTime) / 1000) : 0;
  const mins     = Math.floor(elapsed / 60);
  const secs     = elapsed % 60;
  const timeStr  = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;

  const modRows = Object.entries(sessionByMod)
    .map(([id, m]) => `
      <div class="mod-row">
        <span class="mod-row-name">M${id}: ${escapeHtml(m.name || '')}</span>
        <span class="mod-row-score">${m.right}/${m.total}</span>
      </div>`).join('');

  const retryBtn = wrongAnswers.length > 0
    ? `<button class="btn btn-primary" onclick="drillWrongAnswers()">Retry missed (${wrongAnswers.length}) ${ICONS.arrowR}</button>`
    : '';
  const streakLine = bestStreak >= 3
    ? `<div class="result-streak">${ICONS.streak} Best streak: ${bestStreak} in a row</div>` : '';

  $('#page-quiz').innerHTML = `
    <div class="card results-center">
      <div class="score-ring">
        <svg width="108" height="108" viewBox="0 0 108 108">
          <circle cx="54" cy="54" r="${r}" fill="none" stroke="var(--surface2)" stroke-width="8"/>
          <circle cx="54" cy="54" r="${r}" fill="none" stroke="var(--green-mid)" stroke-width="8"
            stroke-dasharray="${dash} ${circ.toFixed(1)}" stroke-linecap="round"/>
        </svg>
        <div class="score-pct">${pct}%</div>
      </div>
      <div class="result-grade" style="color:${gc}">${grade}</div>
      <div class="result-sub">${sessionRight} of ${n} correct · ${timeStr}</div>
      ${streakLine}
      <div class="stats-grid">
        <div class="stat-box"><div class="stat-val" style="color:var(--green)">${sessionRight}</div><div class="stat-lbl">Correct</div></div>
        <div class="stat-box"><div class="stat-val" style="color:var(--red)">${n - sessionRight}</div><div class="stat-lbl">Wrong</div></div>
        <div class="stat-box"><div class="stat-val">${timeStr}</div><div class="stat-lbl">Time</div></div>
      </div>
      ${Object.keys(sessionByMod).length > 1 ? `
        <div class="mod-breakdown">
          <div class="section-title">By module</div>${modRows}
        </div>` : ''}
      <div class="result-btns">
        ${retryBtn}
        <button class="btn ${wrongAnswers.length === 0 ? 'btn-primary' : ''}" onclick="restartSame()">Go again ${ICONS.arrowR}</button>
        <button class="btn" onclick="setView('home')">Change modules</button>
      </div>
    </div>`;
}

function drillWrongAnswers() {
  if (!wrongAnswers.length) return;
  if (sessionId) { localEndSession(sessionId); }
  const pool       = [...new Map(wrongAnswers.map(q => [q.id, q])).values()]; // dedupe
  deck             = shuffle(pool);
  deckPos          = 0; round = 1;
  sessionRight     = 0; sessionTotal = 0; sessionByMod = {};
  currentStreak    = 0; bestStreak = 0; wrongAnswers = [];
  sessionStartTime = Date.now();
  sessionId        = localStartSession([...selectedMods]);
  quizActive       = true;
  restoreQuizShell();
  renderQuestion();
}

function restartSame() {
  if (sessionId) { localEndSession(sessionId); }
  deck             = shuffleMode ? shuffle(getPool()) : [...getPool()];
  deckPos          = 0; round = 1;
  sessionRight     = 0; sessionTotal = 0; sessionByMod = {};
  currentStreak    = 0; bestStreak = 0; wrongAnswers = [];
  sessionStartTime = Date.now();
  answered         = false;
  sessionId        = localStartSession([...selectedMods]);
  restoreQuizShell();
  renderQuestion();
}

function drillWeakSpots() {
  const { weak } = localGetStats();
  if (!weak.length) return;
  // Resolve full question objects from allQuestions
  const pool = weak
    .map(w => allQuestions.find(q => String(q.id) === String(w.question_id)))
    .filter(Boolean);
  if (!pool.length) return;
  setView('quiz');
  if (sessionId) { localEndSession(sessionId); }
  deck             = shuffle(pool);
  deckPos          = 0; round = 1;
  sessionRight     = 0; sessionTotal = 0; sessionByMod = {};
  currentStreak    = 0; bestStreak = 0; wrongAnswers = [];
  sessionStartTime = Date.now();
  sessionId        = localStartSession([...selectedMods]);
  quizActive       = true;
  restoreQuizShell();
  renderQuestion();
}

// ── Accuracy-over-time SVG chart ───────────────────────────────────────────
function renderAccuracyChart(sessions) {
  const MIN_SESSIONS = 2;
  const sorted = [...sessions]
    .filter(s => s.ended_at && s.total > 0)
    .sort((a, b) => new Date(a.started_at) - new Date(b.started_at))
    .slice(-30); // last 30 sessions max

  if (sorted.length < MIN_SESSIONS) return '';

  const pts = sorted.map(s => Math.round(s.correct / s.total * 100));
  const W = 520, H = 130, PAD = { top: 16, right: 16, bottom: 28, left: 36 };
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top  - PAD.bottom;

  const xStep  = innerW / (pts.length - 1);
  const yScale = v => innerH - (v / 100) * innerH;

  // Polyline
  const polyPts = pts.map((v, i) => `${PAD.left + i * xStep},${PAD.top + yScale(v)}`).join(' ');

  // Area fill (close path down to baseline)
  const first = `${PAD.left},${PAD.top + yScale(pts[0])}`;
  const last  = `${PAD.left + (pts.length - 1) * xStep},${PAD.top + yScale(pts[pts.length - 1])}`;
  const areaPath = `M${first} L${pts.map((v, i) => `${PAD.left + i * xStep},${PAD.top + yScale(v)}`).join(' L')} L${last.split(',')[0]},${PAD.top + innerH} L${PAD.left},${PAD.top + innerH} Z`;

  // Y-axis labels: 0%, 50%, 100%
  const yLabels = [0, 50, 100].map(v => {
    const y = PAD.top + yScale(v);
    return `<text x="${PAD.left - 6}" y="${y + 4}" text-anchor="end" class="chart-label">${v}%</text>
            <line x1="${PAD.left}" y1="${y}" x2="${PAD.left + innerW}" y2="${y}" class="chart-grid"/>`;
  }).join('');

  // X-axis: first and last date labels
  const fmtDate = iso => { try { return new Date(iso).toLocaleDateString('en-US', { month:'short', day:'numeric' }); } catch { return ''; } };
  const xLabels = `
    <text x="${PAD.left}" y="${H - 4}" text-anchor="start" class="chart-label">${fmtDate(sorted[0].started_at)}</text>
    <text x="${PAD.left + innerW}" y="${H - 4}" text-anchor="end" class="chart-label">${fmtDate(sorted[sorted.length - 1].started_at)}</text>`;

  // Dots
  const dots = pts.map((v, i) => {
    const cx = PAD.left + i * xStep, cy = PAD.top + yScale(v);
    const cls = v >= 70 ? 'dot-good' : v >= 50 ? 'dot-mid' : 'dot-low';
    return `<circle cx="${cx}" cy="${cy}" r="3.5" class="chart-dot ${cls}"><title>${v}% · ${fmtDate(sorted[i].started_at)}</title></circle>`;
  }).join('');

  return `
    <div class="section-title" style="margin-top:20px">Accuracy over time</div>
    <div class="card chart-card">
      <svg viewBox="0 0 ${W} ${H}" class="accuracy-chart" aria-label="Accuracy over time">
        <defs>
          <linearGradient id="chartGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stop-color="var(--accent)" stop-opacity="0.25"/>
            <stop offset="100%" stop-color="var(--accent)" stop-opacity="0"/>
          </linearGradient>
        </defs>
        ${yLabels}
        <path d="${areaPath}" fill="url(#chartGrad)"/>
        <polyline points="${polyPts}" fill="none" stroke="var(--accent)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
        ${dots}
        ${xLabels}
      </svg>
    </div>`;
}

// ── Stats page ─────────────────────────────────────────────────────────────
function loadStats() {
  const page = $('#page-stats');
  page.innerHTML = '<div class="spinner"></div>';

  const reg        = getRegistry();
  const allDeckIds = Object.keys(reg);

  if (allDeckIds.length === 0) {
    page.innerHTML = `<div class="stats-page"><h2>Stats</h2><div class="empty-state" style="padding:3rem 0"><p>Load a deck to see your stats.</p></div></div>`;
    return;
  }

  // Determine which deck(s) to show — respect statsDeckId, fall back to active, then all
  const viewId  = statsDeckId || activeDeckId || 'all';
  const targets = viewId === 'all' ? allDeckIds : (reg[viewId] ? [viewId] : allDeckIds);

  // Build deck picker
  const pickerHtml = `
    <select class="stats-deck-select" onchange="statsChangeDeck(this.value)">
      <option value="all" ${viewId === 'all' ? 'selected' : ''}>All decks</option>
      ${allDeckIds.map(id => {
          const m = reg[id];
          return `<option value="${id}" ${viewId === id ? 'selected' : ''}>${escapeHtml(m.title || m.filename || 'Untitled')}</option>`;
        }).join('')}
    </select>`;

  // Aggregate data across target decks
  let aggSessions = [], aggQStats = {}, aggQs = [];
  targets.forEach(id => {
    const ds = getDeckStats(id);
    aggSessions = aggSessions.concat(ds.sessions || []);
    Object.entries(ds.qstats || {}).forEach(([qid, stat]) => {
      if (aggQStats[qid]) {
        aggQStats[qid].total_attempts += stat.total_attempts;
        aggQStats[qid].correct_count  += stat.correct_count;
        if ((stat.last_seen || '') > (aggQStats[qid].last_seen || '')) aggQStats[qid].last_seen = stat.last_seen;
      } else {
        aggQStats[qid] = { ...stat };
      }
    });
    aggQs = aggQs.concat(getDeckQuestions(id));
  });

  const qMap    = {};
  aggQs.forEach(q => { qMap[q.id] = q; });

  const sessions = aggSessions.filter(s => s.ended_at);
  const ta  = sessions.reduce((n, s) => n + s.total,   0);
  const tc  = sessions.reduce((n, s) => n + s.correct, 0);
  const ts  = sessions.length;
  const pct = ta > 0 ? Math.round(tc / ta * 100) : 0;

  const recent = [...sessions]
    .sort((a, b) => new Date(b.started_at) - new Date(a.started_at))
    .slice(0, 20);

  const weak = Object.values(aggQStats)
    .filter(q => q.total_attempts >= 2)
    .map(q => ({ ...q, wrong_count: q.total_attempts - q.correct_count, pct: Math.round(100 * q.correct_count / q.total_attempts * 10) / 10 }))
    .sort((a, b) => a.pct - b.pct)
    .slice(0, 10);

  const sessionRows = recent.length === 0
    ? `<tr><td colspan="4" style="text-align:center;color:var(--text-3);padding:1.5rem">No completed sessions yet</td></tr>`
    : recent.map(s => {
        let mods = '—';
        try { mods = JSON.parse(s.modules).map(m => `M${m}`).join(', '); } catch {}
        const p   = s.total > 0 ? Math.round(s.correct / s.total * 100) : 0;
        const cls = p >= 70 ? 'good' : p >= 50 ? 'mid' : 'low';
        const dt  = (() => { try { return new Date(s.started_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }); } catch { return s.started_at; } })();
        return `<tr><td>${dt}</td><td style="color:var(--text-3)">${mods}</td><td>${s.correct}/${s.total}</td><td><span class="pct-pill ${cls}">${p}%</span></td></tr>`;
      }).join('');

  const weakRows = weak.length === 0
    ? `<div class="text-muted" style="padding:0.75rem 0">Answer ≥ 2 questions to see your weak spots.</div>`
    : weak.map(w => {
        const q     = qMap[w.question_id];
        const qtext = q ? q.q : `Question ${w.question_id}`;
        return `<div class="weak-item">
          <div class="weak-q">${escapeHtml(qtext)}</div>
          <div class="weak-meta">
            <span>Module ${w.module_id}</span>
            <span>${w.wrong_count} wrong / ${w.total_attempts} attempts</span>
            <span class="weak-pct">${w.pct}% correct</span>
          </div>
        </div>`;
      }).join('');

  // Drill button only works when the viewed deck is also the active deck
  const canDrill = weak.length > 0 && targets.length === 1 && targets[0] === activeDeckId && allQuestions.length > 0;

  const chartHtml = renderAccuracyChart(sessions);

  page.innerHTML = `
    <div class="stats-page">
      <div class="stats-header">
        <h2>Stats</h2>
        ${pickerHtml}
      </div>
      <div class="overview-grid">
        <div class="stat-box"><div class="stat-val">${ts}</div><div class="stat-lbl">Sessions</div></div>
        <div class="stat-box"><div class="stat-val">${ta}</div><div class="stat-lbl">Answered</div></div>
        <div class="stat-box"><div class="stat-val">${pct}%</div><div class="stat-lbl">Overall</div></div>
      </div>
      ${chartHtml}
      <div class="section-title" style="display:flex;align-items:center;justify-content:space-between;margin-top:20px">
        <span>Weakest questions (≥ 2 attempts)</span>
        ${canDrill ? `<button class="btn btn-sm btn-primary" onclick="drillWeakSpots()">Drill these ${ICONS.arrowR}</button>` : ''}
      </div>
      <div class="weak-list">${weakRows}</div>
      <div class="section-title mt-2">Recent sessions</div>
      <div class="card" style="padding:0;overflow:hidden">
        <table class="session-table">
          <thead><tr><th>Date</th><th>Modules</th><th>Score</th><th>%</th></tr></thead>
          <tbody>${sessionRows}</tbody>
        </table>
      </div>
    </div>`;
}

// ── Header menu ────────────────────────────────────────────────────────────
function toggleMenu(e) {
  e.stopPropagation();
  const dropdown = document.getElementById('menu-dropdown');
  const isOpen   = !dropdown.classList.contains('hidden');
  if (isOpen) { closeMenu(); return; }
  menuResetCancel();
  updateMenuStates();
  dropdown.classList.remove('hidden');
  document.getElementById('menu-btn').classList.add('open');
}

function closeMenu() {
  document.getElementById('menu-dropdown')?.classList.add('hidden');
  document.getElementById('menu-btn')?.classList.remove('open');
}

function updateMenuStates() {
  const has     = allQuestions.length > 0;
  const inStudy = currentView === 'quiz' && has;
  ['mi-edit', 'mi-export'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.disabled      = !has;
    el.style.display = inStudy ? '' : 'none';
  });
  // Hide the divider above Reset when the study-only items are hidden
  const divider = document.querySelector('.menu-dropdown .menu-divider');
  if (divider) divider.style.display = inStudy ? '' : 'none';
}

function menuEdit() {
  closeMenu();
  allQuestions = JSON.parse(JSON.stringify(allQuestions));
  // If a question is currently on screen, jump straight to editing it
  if (currentQ) {
    const idx = allQuestions.findIndex(q => q.id === currentQ.id);
    if (idx !== -1) {
      editCardIdx = idx;
      editView    = 'edit';
      openModal('edit');
      return;
    }
  }
  // Fallback: open the full list
  editView    = 'list';
  editCardIdx = null;
  openModal('edit');
}
function menuExport() { closeMenu(); exportLoadedDeck(); }

function menuResetConfirm() {
  document.getElementById('mi-reset').classList.add('hidden');
  document.getElementById('mi-reset-confirm').classList.remove('hidden');
}
function menuResetCancel() {
  document.getElementById('mi-reset')?.classList.remove('hidden');
  document.getElementById('mi-reset-confirm')?.classList.add('hidden');
}
function menuResetGo() {
  closeMenu(); menuResetCancel();
  localResetStats();
  updateResumeCard();
  renderDeckSwitcher();
  if (!$('#page-stats').classList.contains('hidden')) loadStats();
}

// ── Migration from old single-deck storage format ─────────────────────────
function migrateOldStorage() {
  if (localStorage.getItem(REGISTRY_KEY)) return; // already migrated
  const old = localStorage.getItem('cs6250_questions');
  if (!old) return;
  try {
    const { filename, questions } = JSON.parse(old);
    if (!Array.isArray(questions) || !questions.length) return;
    const id = `deck_${Date.now()}`;
    upsertDeckMeta(id, { title:'', description:'', filename: filename||'questions.json',
                          questionCount: questions.length, addedAt: Date.now() });
    saveDeckQuestions(id, questions);
    // Migrate old stats
    const oldSessions = JSON.parse(localStorage.getItem('cs6250_sessions') || '[]');
    const oldQStats   = JSON.parse(localStorage.getItem('cs6250_qstats')   || '{}');
    const oldDState   = JSON.parse(localStorage.getItem('cs6250_deck_state') || 'null');
    saveDeckStats(id, { sessions: oldSessions, qstats: oldQStats, deckState: oldDState });
    localStorage.setItem(ACTIVE_KEY, id);
  } catch {}
  // Remove old keys
  ['cs6250_questions','cs6250_sessions','cs6250_qstats','cs6250_deck_state'].forEach(k => {
    try { localStorage.removeItem(k); } catch {}
  });
}

// ── Boot ───────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  document.body.classList.add('view-home');

  // Migrate from old single-deck format if needed
  migrateOldStorage();

  $$('nav button[data-view]').forEach(btn => {
    btn.addEventListener('click', () => setView(btn.dataset.view));
  });

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') { closeMenu(); closeModal(); closeDeckMenuPortal(); }
  });

  document.addEventListener('click', e => {
    if (!document.getElementById('menu-wrap')?.contains(e.target)) closeMenu();
    // Close portal deck menu when clicking outside it
    const portal = document.getElementById('dm-portal');
    if (portal && !portal.contains(e.target) && !e.target.closest?.('.deck-menu-btn')) {
      closeDeckMenuPortal();
    }
  });

  // Drag-to-upload on the home Upload card
  const uploadCard = document.getElementById('card-upload');
  if (uploadCard) {
    uploadCard.addEventListener('dragover', e => {
      e.preventDefault(); e.stopPropagation(); uploadCard.classList.add('drag-over');
    });
    uploadCard.addEventListener('dragleave', e => {
      if (!uploadCard.contains(e.relatedTarget)) uploadCard.classList.remove('drag-over');
    });
    uploadCard.addEventListener('drop', e => {
      e.preventDefault(); e.stopPropagation();
      uploadCard.classList.remove('drag-over');
      const file = e.dataTransfer.files[0];
      if (!file) return;
      if (!file.name.endsWith('.json') && file.type !== 'application/json') {
        openModal('upload'); setTimeout(() => showModalError('Please drop a .json file.'), 50); return;
      }
      const reader   = new FileReader();
      reader.onload  = ev => {
        let parsed;
        try { parsed = JSON.parse(ev.target.result); }
        catch { openModal('upload'); setTimeout(() => showModalError('Invalid JSON — could not parse the file.'), 50); return; }
        // Save state: import silently (no modal needed)
        if (parsed && Array.isArray(parsed.sessions) && typeof parsed.qstats === 'object') {
          pendingImportData   = parsed;
          pendingImportDeckId = parsed.deckId || null;
          applyImportedState();
        } else {
          // Deck JSON: register then open module selector
          parseAndRegisterDeck(ev.target.result, file.name);
          openModal('upload');
        }
      };
      reader.onerror = ()  => { openModal('upload'); setTimeout(() => showModalError('Could not read file.'), 50); };
      reader.readAsText(file);
    });
  }

  // Restore active deck from registry
  try {
    const savedActiveId = localStorage.getItem(ACTIVE_KEY);
    const reg = getRegistry();
    if (savedActiveId && reg[savedActiveId]) {
      loadDeckIntoMemory(savedActiveId);
      tryRestoreDeckState();
    }
  } catch {}

  updateCreateCard();
  updateMenuStates();
  renderDeckSwitcher();
  updateResumeCard();
});
