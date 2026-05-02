/* quiz.js — CS6250 Study Quiz
   Fully local: questions are read client-side via FileReader and never leave
   the browser. Stats (sessions + question accuracy) are stored in localStorage. */

const LS_KEY        = 'cs6250_questions';
const CREATE_KEY    = 'cs6250_created_deck';
const SESSIONS_KEY  = 'cs6250_sessions';
const QSTATS_KEY    = 'cs6250_qstats';
const DECK_STATE_KEY = 'cs6250_deck_state'; // persists in-progress deck across export/import

// ── Demo questions ─────────────────────────────────────────────────────────
const DEMO_QUESTIONS = [
  {
    id: 'demo_1', mod: 0, mod_name: 'Georgia Tech Trivia', type: 'MCQ',
    q: 'What year was the Georgia Institute of Technology founded?',
    opts: ['1881', '1885', '1891', '1901'],
    ans: 1,
    exp: 'Georgia Tech was founded on October 13, 1885 as the Georgia School of Technology in Atlanta.'
  },
  {
    id: 'demo_2', mod: 0, mod_name: 'Georgia Tech Trivia', type: 'MCQ',
    q: "What is Georgia Tech's costumed mascot called?",
    opts: ["Ramblin' Wreck", 'Buzz', 'Sting', 'Yellowjacket Jack'],
    ans: 1,
    exp: "Buzz the Yellow Jacket is Georgia Tech's costumed mascot. The Ramblin' Wreck is the famous 1930 Ford Model A Sport Coupe — the official school vehicle."
  },
  {
    id: 'demo_3', mod: 0, mod_name: 'Georgia Tech Trivia', type: 'MCQ',
    q: 'Georgia Tech set the all-time college football scoring record in 1916 by defeating Cumberland College. What was the final score?',
    opts: ['150–0', '189–0', '222–0', '256–0'],
    ans: 2,
    exp: "On October 7, 1916, Georgia Tech defeated Cumberland College 222–0 — the largest margin of victory in college football history. The game is also notable because Cumberland had essentially no football team that year and fielded a squad of random students."
  },
  {
    id: 'demo_4', mod: 0, mod_name: 'Georgia Tech Trivia', type: 'MCQ',
    q: 'What is the nickname for the annual football rivalry between Georgia Tech and the University of Georgia?',
    opts: ['The Battle of Atlanta', 'Clean, Old-Fashioned Hate', 'The Southern Showdown', 'The Peach State Classic'],
    ans: 1,
    exp: '"Clean, Old-Fashioned Hate" is the beloved nickname for the Georgia–Georgia Tech rivalry, one of the oldest in college football.'
  },
  {
    id: 'demo_5', mod: 0, mod_name: 'Georgia Tech Trivia', type: 'MCQ',
    q: "In what Atlanta neighborhood is Georgia Tech's main campus located?",
    opts: ['Buckhead', 'Downtown', 'Midtown', 'Virginia-Highland'],
    ans: 2,
    exp: "Georgia Tech's campus sits in Midtown Atlanta, adjacent to Piedmont Park and the Atlanta BeltLine."
  }
];

// ── State ──────────────────────────────────────────────────────────────────
let allQuestions   = [];
let allModules     = [];
let selectedMods   = new Set();
let loadedFileName = '';

let deck         = [];
let deckPos      = 0;
let round        = 1;
let sessionId    = null;
let sessionRight = 0;
let sessionTotal = 0;
let sessionByMod = {};
let answered     = false;
let currentQ     = null;

// Edit modal state
let editView    = 'list'; // 'list' | 'edit' | 'new'
let editCardIdx = null;

// Edit-form option state (shared by "edit card" and "add card to deck" views)
let editOpts    = [];
let editCorrect = 0;

// Stats import pending data
let pendingImportData = null;

// Resume state — true whenever a session is actively in progress
let quizActive = false;

// Create-deck form state (live across re-renders of the card list)
let createOpts    = ['', '', '', ''];
let createCorrect = 0;

// ── Helpers ────────────────────────────────────────────────────────────────
const $  = (s, ctx = document) => ctx.querySelector(s);
const $$ = (s, ctx = document) => [...ctx.querySelectorAll(s)];

function shuffle(arr) {
  return arr.map(v => ({ v, s: Math.random() }))
            .sort((a, b) => a.s - b.s)
            .map(x => x.v);
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── Local stats storage ────────────────────────────────────────────────────
function getSessions() {
  try { return JSON.parse(localStorage.getItem(SESSIONS_KEY) || '[]'); } catch { return []; }
}
function saveSessions(s) {
  try { localStorage.setItem(SESSIONS_KEY, JSON.stringify(s)); } catch {}
}
function getQStats() {
  try { return JSON.parse(localStorage.getItem(QSTATS_KEY) || '{}'); } catch { return {}; }
}
function saveQStats(q) {
  try { localStorage.setItem(QSTATS_KEY, JSON.stringify(q)); } catch {}
}

function localStartSession(modules) {
  const session = { id: Date.now(), modules, correct: 0, total: 0,
                    started_at: new Date().toISOString(), ended_at: null };
  const all = getSessions();
  all.push(session);
  saveSessions(all);
  return session.id;
}

function localRecordAnswer(sessionId, questionId, moduleId, correct, questionObj) {
  const sessions = getSessions();
  const s = sessions.find(x => x.id === sessionId);
  if (s) { s.total++; if (correct) s.correct++; }
  saveSessions(sessions);

  const qstats = getQStats();
  if (!qstats[questionId]) {
    const card = questionObj ? {
      q:        questionObj.q    || null,
      opts:     questionObj.opts || null,
      ans:      questionObj.ans  ?? null,
      mod_name: questionObj.mod_name || null,
      type:     questionObj.type || 'MCQ',
      exp:      questionObj.exp  || null,
    } : null;
    qstats[questionId] = { question_id: questionId, module_id: moduleId, card,
                            total_attempts: 0, correct_count: 0, last_seen: null };
  }
  qstats[questionId].total_attempts++;
  if (correct) qstats[questionId].correct_count++;
  qstats[questionId].last_seen = new Date().toISOString();
  saveQStats(qstats);
}

function localEndSession(id) {
  const sessions = getSessions();
  const s = sessions.find(x => x.id === id);
  if (s) s.ended_at = new Date().toISOString();
  saveSessions(sessions);
}

function localGetStats() {
  const sessions = getSessions().filter(s => s.ended_at !== null);
  const qstats   = getQStats();

  const totals = {
    total_sessions: sessions.length,
    total_answered: sessions.reduce((n, s) => n + s.total,   0),
    total_correct:  sessions.reduce((n, s) => n + s.correct, 0),
  };

  const recent = [...sessions]
    .sort((a, b) => new Date(b.started_at) - new Date(a.started_at))
    .slice(0, 20)
    .map(s => ({ ...s, modules: JSON.stringify(s.modules) }));

  const weak = Object.values(qstats)
    .filter(q => q.total_attempts >= 2)
    .map(q => ({ ...q,
      wrong_count: q.total_attempts - q.correct_count,
      pct: Math.round(100 * q.correct_count / q.total_attempts * 10) / 10,
    }))
    .sort((a, b) => a.pct - b.pct)
    .slice(0, 10);

  return { totals, sessions: recent, weak };
}

function localResetStats() {
  try {
    localStorage.removeItem(SESSIONS_KEY);
    localStorage.removeItem(QSTATS_KEY);
    localStorage.removeItem(DECK_STATE_KEY);
  } catch {}
  // Also wipe the live session so resume card clears
  if (sessionId) { try { /* already wiped from storage */ } catch {} }
  sessionId    = null;
  quizActive   = false;
  deck         = [];
  deckPos      = 0;
  sessionRight = 0;
  sessionTotal = 0;
  sessionByMod = {};
}

// ── Deck-state save/restore (for export→import cross-device resume) ────────
function saveDeckState() {
  if (!quizActive || deck.length === 0) return;
  try {
    const state = {
      deckIds:       deck.map(q => q.id),
      deckPos,
      round,
      sessionRight,
      sessionTotal,
      sessionByMod,
      selectedModIds: [...selectedMods],
      loadedFileName,
    };
    localStorage.setItem(DECK_STATE_KEY, JSON.stringify(state));
  } catch {}
}

function tryRestoreDeckState() {
  try {
    const raw = localStorage.getItem(DECK_STATE_KEY);
    if (!raw || allQuestions.length === 0) return;
    const state = JSON.parse(raw);
    if (!state || !Array.isArray(state.deckIds) || state.deckIds.length === 0) return;

    // Rebuild deck from saved question IDs
    const qMap = {};
    allQuestions.forEach(q => { qMap[q.id] = q; });
    const restoredDeck = state.deckIds.map(id => qMap[id]).filter(Boolean);

    // Require ≥90% match — silently skip if questions don't match
    if (restoredDeck.length < Math.floor(state.deckIds.length * 0.9)) return;

    deck         = restoredDeck;
    deckPos      = Math.min(state.deckPos || 0, Math.max(0, deck.length - 1));
    round        = state.round || 1;
    sessionRight = state.sessionRight || 0;
    sessionTotal = state.sessionTotal || 0;
    sessionByMod = state.sessionByMod || {};
    if (Array.isArray(state.selectedModIds)) selectedMods = new Set(state.selectedModIds);

    // Start a fresh session on this device to track continued answers
    sessionId  = localStartSession([...selectedMods]);
    quizActive = true;

    localStorage.removeItem(DECK_STATE_KEY);
    updateResumeCard();
  } catch {
    // Silently ignore corrupt state
  }
}

// ── View switching ─────────────────────────────────────────────────────────
function setView(v) {
  $$('nav button').forEach(b => b.classList.toggle('active', b.dataset.view === v));
  $('#page-home').classList.toggle('hidden',  v !== 'home');
  $('#page-quiz').classList.toggle('hidden',  v !== 'quiz');
  $('#page-stats').classList.toggle('hidden', v !== 'stats');
  document.body.classList.toggle('view-home', v === 'home');
  if (v === 'stats') loadStats();
  if (v === 'home')  updateResumeCard();
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

function resumeSession() {
  setView('quiz');
}

// ── Modal system ───────────────────────────────────────────────────────────
function openModal(type) {
  const overlay = $('#modal-overlay');
  overlay.classList.remove('hidden');
  document.body.style.overflow = 'hidden';

  const titles = { upload: 'Upload deck', create: 'Create deck', demo: 'Demo', edit: 'Edit deck' };
  $('#modal-title').textContent = titles[type] || '';

  if (type === 'upload')      renderUploadModal();
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
  if (allQuestions.length > 0) {
    renderModalModuleSelector();
    return;
  }

  const content = $('#modal-content');
  content.innerHTML = `
    <div id="drop-zone">
      <div class="dz-icon">📂</div>
      <div class="dz-title">Drop your questions.json here</div>
      <div class="dz-sub">or click to browse your computer</div>
      <input type="file" id="modal-file-input" accept=".json,application/json" style="display:none">
      <button class="btn btn-primary btn-sm" onclick="$('#modal-file-input').click()">Choose file</button>
      <p id="modal-file-error" style="color:var(--red);font-size:12px;margin-top:10px;display:none;text-align:center"></p>
    </div>
    <p style="font-size:11px;color:var(--text-3);text-align:center;margin-top:10px">
      Read locally in your browser — nothing is uploaded to the server.
    </p>`;

  const dz    = $('#drop-zone');
  const input = $('#modal-file-input');

  dz.addEventListener('click', e => { if (e.target.tagName !== 'BUTTON' && e.target.tagName !== 'INPUT') input.click(); });
  dz.addEventListener('dragover',  e => { e.preventDefault(); dz.classList.add('drag-over'); });
  dz.addEventListener('dragleave', () => dz.classList.remove('drag-over'));
  dz.addEventListener('drop', e => {
    e.preventDefault();
    dz.classList.remove('drag-over');
    const file = e.dataTransfer.files[0];
    if (file) readJsonFile(file);
  });
  input.addEventListener('change', () => {
    if (input.files[0]) readJsonFile(input.files[0]);
    input.value = '';
  });
}

function readJsonFile(file) {
  const reader = new FileReader();
  reader.onload  = e => parseQuestions(e.target.result, file.name);
  reader.onerror = () => showModalError('Could not read file.');
  reader.readAsText(file);
}

function parseQuestions(text, filename) {
  let data;
  try { data = JSON.parse(text); }
  catch { showModalError('Invalid JSON — could not parse the file.'); return; }

  if (!Array.isArray(data) || !data.length) {
    showModalError('File must be a non-empty JSON array.'); return;
  }
  const s = data[0];
  if (!s.id || !s.q || !Array.isArray(s.opts) || s.ans === undefined) {
    showModalError('Questions must have id, q, opts (array), and ans fields.'); return;
  }

  try { localStorage.setItem(LS_KEY, JSON.stringify({ filename, questions: data })); }
  catch { /* storage full — fine */ }

  applyQuestions(data, filename);
}

function applyQuestions(data, filename) {
  // Loading new questions wipes any active session
  if (quizActive && sessionId) {
    localEndSession(sessionId);
    sessionId = null;
  }
  quizActive   = false;
  deck         = [];
  deckPos      = 0;
  sessionRight = 0;
  sessionTotal = 0;
  sessionByMod = {};

  allQuestions   = data;
  loadedFileName = filename || 'questions.json';

  const modMap = {};
  data.forEach(q => {
    if (!modMap[q.mod]) modMap[q.mod] = { id: q.mod, name: q.mod_name || `Module ${q.mod}`, count: 0 };
    modMap[q.mod].count++;
  });
  allModules = Object.values(modMap).sort((a, b) => a.id - b.id);

  updateDeckCard();

  // Try to restore a previously saved/imported deck position
  tryRestoreDeckState();

  // If the modal is open, transition to module selector
  if (!$('#modal-overlay').classList.contains('hidden')) {
    renderModalModuleSelector();
  }
}

// ── Deck card (home screen indicator for loaded deck) ──────────────────────
function updateDeckCard() {
  const card  = document.getElementById('deck-card');
  const title = document.getElementById('deck-title');
  const sub   = document.getElementById('deck-sub');
  if (!card) return;

  if (allQuestions.length > 0) {
    if (title) title.textContent = loadedFileName === 'demo' ? 'Demo deck' : loadedFileName;
    if (sub)   sub.textContent   = `${allQuestions.length} questions`;
    card.classList.remove('hidden');
  } else {
    card.classList.add('hidden');
  }

  // Keep the upload mode-card sub consistent
  const uploadSub = document.getElementById('upload-sub');
  if (uploadSub) {
    uploadSub.innerHTML = allQuestions.length > 0
      ? 'Change deck'
      : 'Load a questions.json file';
  }
}

// Legacy alias used in a few places
function updateUploadCard() { updateDeckCard(); }

function showModalError(msg) {
  const el = $('#modal-file-error');
  if (el) { el.textContent = msg; el.style.display = ''; }
}

function exportLoadedDeck() {
  if (!allQuestions.length) return;
  const blob = new Blob([JSON.stringify(allQuestions, null, 2)], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  let name   = loadedFileName || 'questions.json';
  if (name === 'demo') name = 'my-deck.json';
  if (!name.endsWith('.json')) name += '.json';
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

function renderModalModuleSelector() {
  const content = $('#modal-content');
  content.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;flex-wrap:wrap;gap:8px">
      <div>
        <span style="font-size:14px;font-weight:500;color:var(--text)">${escapeHtml(loadedFileName)}</span>
        <span style="font-size:13px;color:var(--text-3);margin-left:6px">· ${allQuestions.length} questions</span>
      </div>
      <div style="display:flex;gap:6px">
        <button class="btn btn-sm" onclick="exportLoadedDeck()" title="Download as JSON">↓ Export</button>
        <button class="btn btn-sm" onclick="clearQuestions()">Change file</button>
      </div>
    </div>
    <p style="font-size:13px;color:var(--text-3);margin-bottom:14px">Pick modules to study. Questions are randomized every session.</p>
    <div class="mod-grid" id="mod-grid"></div>
    <button id="start-btn" class="btn btn-primary btn-block mt-1" onclick="modalStartQuiz()" disabled>Start →</button>`;

  renderModuleGrid();
  selectAll();
}

function clearQuestions() {
  // End any active session when deck is cleared
  if (sessionId) { localEndSession(sessionId); sessionId = null; }
  localStorage.removeItem(DECK_STATE_KEY);
  quizActive     = false;
  deck           = [];
  deckPos        = 0;
  sessionRight   = 0;
  sessionTotal   = 0;
  sessionByMod   = {};
  allQuestions   = [];
  allModules     = [];
  selectedMods   = new Set();
  loadedFileName = '';
  try { localStorage.removeItem(LS_KEY); } catch {}
  updateDeckCard();
  updateResumeCard();
  renderUploadModal();
}

function modalStartQuiz() {
  closeModal();
  startQuiz();
}

// ── Module selector ────────────────────────────────────────────────────────
function renderModuleGrid() {
  const grid = $('#mod-grid');
  grid.innerHTML = '';

  allModules.forEach(m => {
    const btn = document.createElement('button');
    btn.className = 'mod-card';
    btn.dataset.modId = m.id;
    btn.innerHTML = `<div class="mod-num">Module ${m.id}</div>
                     <div class="mod-name">${escapeHtml(m.name)}</div>
                     <div class="mod-cnt">${m.count} questions</div>`;
    btn.addEventListener('click', () => toggleMod(m.id, btn));
    grid.appendChild(btn);
  });

  const all = document.createElement('button');
  all.className = 'mod-card';
  all.id = 'mod-all';
  all.innerHTML = `<div class="mod-num" style="color:var(--text-2)">All</div>
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
  if (btn) btn.disabled = selectedMods.size === 0;
}

// ── Create modal ───────────────────────────────────────────────────────────
function getCreatedDeck() {
  try { return JSON.parse(localStorage.getItem(CREATE_KEY) || '[]'); }
  catch { return []; }
}

function saveCreatedDeck(deck) {
  try { localStorage.setItem(CREATE_KEY, JSON.stringify(deck)); } catch {}
  updateCreateCard();
}

function updateCreateCard() {
  const sub = $('#create-sub');
  if (!sub) return;
  const deck = getCreatedDeck();
  sub.textContent = deck.length > 0
    ? `${deck.length} card${deck.length !== 1 ? 's' : ''} saved`
    : 'Build your own deck';
}

// ── Create-deck form helpers ───────────────────────────────────────────────
function resetCreateForm() {
  createOpts    = ['', '', '', ''];
  createCorrect = 0;
}

// Read current input values into createOpts without losing other state
function syncCreateOpts() {
  document.querySelectorAll('.create-opt-input').forEach((inp, i) => {
    if (i < createOpts.length) createOpts[i] = inp.value;
  });
}

// ── Edit-form option-row helpers (shared by edit & add-card views) ─────────
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
    const row = document.createElement('div');
    row.className = 'cr-opt-row' + (editCorrect === i ? ' is-correct' : '');

    const numBtn = document.createElement('button');
    numBtn.type        = 'button';
    numBtn.className   = 'cr-opt-num' + (editCorrect === i ? ' correct' : '');
    numBtn.title       = 'Mark as correct answer';
    numBtn.textContent = i + 1;
    numBtn.addEventListener('click', () => {
      syncEditOpts();
      editCorrect = i;
      renderEditOptionRows();
    });

    const inp = document.createElement('input');
    inp.className   = 'edit-opt-input';
    inp.id          = `eo-${i}`;
    inp.value       = val;
    inp.placeholder = `Option ${i + 1}`;

    row.appendChild(numBtn);
    row.appendChild(inp);

    if (editOpts.length > 2) {
      const delBtn = document.createElement('button');
      delBtn.type      = 'button';
      delBtn.className = 'cr-opt-del';
      delBtn.title     = 'Remove this option';
      delBtn.innerHTML = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;
      delBtn.addEventListener('click', () => {
        syncEditOpts();
        editOpts.splice(i, 1);
        if (editCorrect >= editOpts.length) editCorrect = editOpts.length - 1;
        renderEditOptionRows();
      });
      row.appendChild(delBtn);
    }

    wrap.appendChild(row);
  });

  if (editOpts.length < 8) {
    const addBtn = document.createElement('button');
    addBtn.type        = 'button';
    addBtn.className   = 'cr-add-opt';
    addBtn.textContent = '+ Add option';
    addBtn.addEventListener('click', () => {
      syncEditOpts();
      editOpts.push('');
      renderEditOptionRows();
      setTimeout(() => document.getElementById(`eo-${editOpts.length - 1}`)?.focus(), 40);
    });
    wrap.appendChild(addBtn);
  }
}

// Render the dynamic option rows inside #create-opts-wrap
function renderCreateOptionRows() {
  const wrap = document.getElementById('create-opts-wrap');
  if (!wrap) return;
  wrap.innerHTML = '';

  createOpts.forEach((val, i) => {
    const row = document.createElement('div');
    row.className = 'cr-opt-row' + (createCorrect === i ? ' is-correct' : '');

    // Numbered circle — click to mark as correct answer
    const numBtn = document.createElement('button');
    numBtn.type      = 'button';
    numBtn.className = 'cr-opt-num' + (createCorrect === i ? ' correct' : '');
    numBtn.title     = 'Mark as correct answer';
    numBtn.textContent = i + 1;
    numBtn.addEventListener('click', () => {
      syncCreateOpts();
      createCorrect = i;
      renderCreateOptionRows();
    });

    // Text input
    const inp = document.createElement('input');
    inp.className   = 'create-opt-input';
    inp.id          = `co-${i}`;
    inp.value       = val;
    inp.placeholder = `Option ${i + 1}`;

    row.appendChild(numBtn);
    row.appendChild(inp);

    // Remove button — only show when >2 options
    if (createOpts.length > 2) {
      const delBtn = document.createElement('button');
      delBtn.type      = 'button';
      delBtn.className = 'cr-opt-del';
      delBtn.title     = 'Remove this option';
      delBtn.innerHTML = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;
      delBtn.addEventListener('click', () => {
        syncCreateOpts();
        createOpts.splice(i, 1);
        if (createCorrect >= createOpts.length) createCorrect = createOpts.length - 1;
        renderCreateOptionRows();
      });
      row.appendChild(delBtn);
    }

    wrap.appendChild(row);
  });

  // Add option button — cap at 8
  if (createOpts.length < 8) {
    const addBtn = document.createElement('button');
    addBtn.type      = 'button';
    addBtn.className = 'cr-add-opt';
    addBtn.textContent = '+ Add option';
    addBtn.addEventListener('click', () => {
      syncCreateOpts();
      createOpts.push('');
      renderCreateOptionRows();
      setTimeout(() => document.getElementById(`co-${createOpts.length - 1}`)?.focus(), 40);
    });
    wrap.appendChild(addBtn);
  }
}

function renderCreateModal() {
  const createdDeck = getCreatedDeck();
  const hasCards    = createdDeck.length > 0;

  // Reset form for a fresh entry each time the modal is opened / a card is added
  resetCreateForm();

  $('#modal-content').innerHTML = `
    <div class="create-form">
      <div class="form-group">
        <label>Question</label>
        <textarea id="create-q" rows="3" placeholder="Type your question here…"></textarea>
      </div>
      <div class="form-group">
        <label>Options
          <span class="form-optional">— click a number to mark it correct</span>
        </label>
        <div id="create-opts-wrap"></div>
      </div>
      <div class="form-group">
        <label>Explanation <span class="form-optional">(optional)</span></label>
        <textarea id="create-exp" rows="2" placeholder="Explain the correct answer…"></textarea>
      </div>
      <p id="create-add-error" style="color:var(--red);font-size:12px;margin-bottom:8px;display:none"></p>
      <button class="btn btn-primary btn-block" onclick="addCreateCard()">+ Add to deck</button>
    </div>

    ${hasCards ? `
    <div style="margin-top:20px">
      <div class="section-label">Deck · ${createdDeck.length} question${createdDeck.length !== 1 ? 's' : ''}</div>
      <div class="create-card-list">
        ${createdDeck.map((q, i) => createCardItemHTML(q, i)).join('')}
      </div>
    </div>
    <div class="create-footer">
      <button class="btn" onclick="exportCreatedDeck()">⬇ Export JSON</button>
      <button class="btn btn-primary" onclick="studyCreatedDeck()">Study these →</button>
    </div>
    ` : ''}`;

  renderCreateOptionRows();
}

function createCardItemHTML(q, i) {
  return `<div class="create-card-item">
    <div class="create-card-num">${i + 1}</div>
    <div class="create-card-body">
      <div class="create-card-q">${escapeHtml(q.q)}</div>
      <div class="create-card-ans">✓ ${escapeHtml(q.opts[q.ans])}</div>
    </div>
    <button class="create-card-del" onclick="deleteCreateCard(${i})" title="Delete">✕</button>
  </div>`;
}

function addCreateCard() {
  // Sync inputs → createOpts before reading
  syncCreateOpts();

  const qText = ($('#create-q').value || '').trim();
  const exp   = ($('#create-exp').value || '').trim();
  const errEl = $('#create-add-error');

  if (!qText) { errEl.textContent = 'Please enter a question.'; errEl.style.display = ''; return; }

  const trimmedOpts = createOpts.map(o => o.trim());
  for (let i = 0; i < trimmedOpts.length; i++) {
    if (!trimmedOpts[i]) {
      errEl.textContent = `Please fill in Option ${i + 1}.`;
      errEl.style.display = '';
      return;
    }
  }
  errEl.style.display = 'none';

  const d = getCreatedDeck();
  d.push({
    id:       `created_${Date.now()}`,
    mod:      1,
    mod_name: 'My Deck',
    type:     'MCQ',
    q:        qText,
    opts:     trimmedOpts,
    ans:      createCorrect,
    exp,
  });
  saveCreatedDeck(d);
  renderCreateModal(); // resets form + shows updated list
}

function deleteCreateCard(idx) {
  const d = getCreatedDeck();
  d.splice(idx, 1);
  saveCreatedDeck(d);
  // Rebuild just the card list without touching the form
  const listWrap = document.querySelector('.create-card-list');
  const label    = document.querySelector('.section-label');
  if (d.length === 0) {
    // Remove the whole deck section
    document.querySelector('.create-footer')?.remove();
    listWrap?.closest('div')?.remove();
  } else {
    if (label) label.textContent = `Deck · ${d.length} question${d.length !== 1 ? 's' : ''}`;
    if (listWrap) listWrap.innerHTML = d.map((q, i) => createCardItemHTML(q, i)).join('');
  }
}

function exportCreatedDeck() {
  const d = getCreatedDeck();
  if (!d.length) return;
  const blob = new Blob([JSON.stringify(d, null, 2)], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = 'my-deck.json';
  a.click();
  URL.revokeObjectURL(url);
}

function studyCreatedDeck() {
  const d = getCreatedDeck();
  if (!d.length) return;
  allQuestions   = d;
  allModules     = [{ id: 1, name: 'My Deck', count: d.length }];
  selectedMods   = new Set([1]);
  loadedFileName = 'my-deck.json';
  closeModal();
  startQuiz();
}

// ── Demo modal ─────────────────────────────────────────────────────────────
function renderDemoModal() {
  $('#modal-content').innerHTML = `
    <div style="text-align:center;padding:1.5rem 0 0.5rem">
      <div style="font-size:44px;margin-bottom:14px">🐝</div>
      <div style="font-size:17px;font-weight:600;color:var(--text);margin-bottom:6px">Georgia Tech Trivia</div>
      <div style="font-size:13px;color:var(--text-3);margin-bottom:28px">5 questions about Georgia Tech history &amp; culture</div>
      <button class="btn btn-primary" style="padding:10px 28px;font-size:15px" onclick="startDemo()">Start demo →</button>
    </div>`;
}

function startDemo() {
  allQuestions   = DEMO_QUESTIONS;
  allModules     = [{ id: 0, name: 'Georgia Tech Trivia', count: DEMO_QUESTIONS.length }];
  selectedMods   = new Set([0]);
  loadedFileName = 'demo';
  closeModal();
  startQuiz();
}

// ── Header menu ────────────────────────────────────────────────────────────
function toggleMenu(e) {
  e.stopPropagation();
  const dropdown = document.getElementById('menu-dropdown');
  const isOpen   = !dropdown.classList.contains('hidden');
  if (isOpen) { closeMenu(); return; }
  menuResetCancel();
  menuImportCancel();
  updateMenuStates();
  dropdown.classList.remove('hidden');
  document.getElementById('menu-btn').classList.add('open');
}

function closeMenu() {
  menuImportCancel();
  document.getElementById('menu-dropdown')?.classList.add('hidden');
  document.getElementById('menu-btn')?.classList.remove('open');
}

function updateMenuStates() {
  const has = allQuestions.length > 0;
  ['mi-edit', 'mi-export', 'mi-clear'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.disabled = !has;
  });
}

function menuEdit()   { closeMenu(); openEditModal(); }
function menuExport() { closeMenu(); exportLoadedDeck(); }
function menuClear()  { closeMenu(); clearQuestions(); }

function menuResetConfirm() {
  document.getElementById('mi-reset').classList.add('hidden');
  document.getElementById('mi-reset-confirm').classList.remove('hidden');
}
function menuResetCancel() {
  document.getElementById('mi-reset')?.classList.remove('hidden');
  document.getElementById('mi-reset-confirm')?.classList.add('hidden');
}
function menuResetGo() {
  closeMenu();
  menuResetCancel();
  localResetStats();
  updateResumeCard();
  if (!$('#page-stats').classList.contains('hidden')) loadStats();
}

// ── Stats export / import ───────────────────────────────────────────────────
function menuExportStats() {
  closeMenu();
  const sessions = JSON.parse(localStorage.getItem(SESSIONS_KEY) || '[]');
  const qstats   = JSON.parse(localStorage.getItem(QSTATS_KEY)   || '{}');

  // Bundle current deck position so the other device can resume at the exact spot
  const deckState = (quizActive && deck.length > 0) ? {
    deckIds:        deck.map(q => q.id),
    deckPos,
    round,
    sessionRight,
    sessionTotal,
    sessionByMod,
    selectedModIds: [...selectedMods],
    loadedFileName,
  } : null;

  // Include the full questions array so the import is completely self-contained
  // (no need to separately load questions.json on the destination device)
  const questionsPayload = allQuestions.length > 0
    ? { filename: loadedFileName, data: allQuestions }
    : null;

  const payload = {
    version:     3,
    exported_at: new Date().toISOString(),
    sessions,
    qstats,
    deckState,
    questions:   questionsPayload,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `cs6250_save_${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function menuImportStats() {
  const input    = document.createElement('input');
  input.type     = 'file';
  input.accept   = '.json';
  input.onchange = e => {
    const file = e.target.files[0];
    if (!file) return;
    const reader   = new FileReader();
    reader.onload  = ev => {
      try {
        const data = JSON.parse(ev.target.result);
        if (!Array.isArray(data.sessions) || typeof data.qstats !== 'object') {
          throw new Error('Not a valid stats file.');
        }
        pendingImportData = data;
        const n        = data.sessions.length;
        const hasDeck  = !!(data.deckState && data.deckState.deckIds?.length);
        const hasQs    = !!(data.questions?.data?.length);
        const qCount   = hasQs ? data.questions.data.length : 0;
        const msg = document.getElementById('mi-import-msg');
        if (msg) {
          let line = `${n} session${n !== 1 ? 's' : ''}`;
          if (hasQs)   line += ` · ${qCount} questions`;
          if (hasDeck) line += ` · resume at Q${(data.deckState.deckPos || 0) + 1}`;
          msg.textContent = `Load save: ${line}`;
        }
        document.getElementById('mi-import-stats').classList.add('hidden');
        document.getElementById('mi-export-stats').disabled = true;
        document.getElementById('mi-import-confirm').classList.remove('hidden');
      } catch (err) {
        alert('Could not import: ' + err.message);
      }
    };
    reader.readAsText(file);
  };
  input.click();
}

function menuImportGo() {
  if (!pendingImportData) return;

  // Close any open (unended) sessions in the imported data so stats are clean
  const importedSessions = (pendingImportData.sessions || []).map(s =>
    s.ended_at ? s : { ...s, ended_at: new Date().toISOString() }
  );
  localStorage.setItem(SESSIONS_KEY, JSON.stringify(importedSessions));
  localStorage.setItem(QSTATS_KEY,   JSON.stringify(pendingImportData.qstats || {}));

  // ── Apply bundled questions if present (makes import self-contained) ──────
  if (pendingImportData.questions?.data?.length) {
    const { filename, data } = pendingImportData.questions;
    // Directly set questions state — bypass applyQuestions() to avoid
    // ending any session we're about to restore from the deckState
    allQuestions   = data;
    loadedFileName = filename || 'questions.json';
    const modMap   = {};
    data.forEach(q => {
      if (!modMap[q.mod]) modMap[q.mod] = { id: q.mod, name: q.mod_name || `Module ${q.mod}`, count: 0 };
      modMap[q.mod].count++;
    });
    allModules = Object.values(modMap).sort((a, b) => a.id - b.id);
    // Persist to localStorage so they survive a page refresh
    try { localStorage.setItem(LS_KEY, JSON.stringify({ filename: loadedFileName, questions: data })); } catch {}
    updateDeckCard();
  }

  // ── Restore deck position ─────────────────────────────────────────────────
  if (pendingImportData.deckState) {
    localStorage.setItem(DECK_STATE_KEY, JSON.stringify(pendingImportData.deckState));
    tryRestoreDeckState(); // works immediately now that questions are loaded above
  } else {
    localStorage.removeItem(DECK_STATE_KEY);
  }

  pendingImportData = null;
  closeMenu();
  if (!$('#page-stats').classList.contains('hidden')) loadStats();
}

function menuImportCancel() {
  pendingImportData = null;
  document.getElementById('mi-import-stats')?.classList.remove('hidden');
  const exportBtn = document.getElementById('mi-export-stats');
  if (exportBtn) exportBtn.disabled = false;
  document.getElementById('mi-import-confirm')?.classList.add('hidden');
}

// ── Edit modal ──────────────────────────────────────────────────────────────
function openEditModal() {
  allQuestions = JSON.parse(JSON.stringify(allQuestions));
  editView     = 'list';
  editCardIdx  = null;
  openModal('edit');
}

function renderEditModal() {
  if      (editView === 'list') renderEditList();
  else if (editView === 'edit') renderEditForm();
  else if (editView === 'new')  renderNewCardForm();
}

function renderEditList() {
  $('#modal-title').textContent = `Edit deck · ${allQuestions.length} card${allQuestions.length !== 1 ? 's' : ''}`;
  const cards = allQuestions.map((q, i) => `
    <div class="create-card-item">
      <div class="create-card-num">${i + 1}</div>
      <div class="create-card-body">
        <div class="create-card-q">${escapeHtml(q.q)}</div>
        <div class="create-card-ans">✓ ${escapeHtml(q.opts[q.ans])}</div>
      </div>
      <button class="create-card-edit" onclick="goEditCard(${i})" title="Edit">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
      </button>
      <button class="create-card-del" onclick="deleteEditCard(${i})" title="Delete">✕</button>
    </div>`).join('');

  $('#modal-content').innerHTML = `
    ${allQuestions.length > 0
      ? `<div class="create-card-list">${cards}</div>`
      : `<div class="empty-state" style="padding:2rem 0"><h3>No cards</h3><p>Add some cards below.</p></div>`}
    <div class="create-footer" style="margin-top:12px">
      <button class="btn" onclick="goNewCard()">+ Add card</button>
      <button class="btn btn-primary" onclick="exportLoadedDeck()">↓ Export JSON</button>
    </div>`;
}

function renderEditForm() {
  const q = allQuestions[editCardIdx];
  editOpts    = (q.opts || []).map(o => o);          // copy option array
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
  editOpts    = ['', '', '', ''];
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
  const qText      = ($('#edit-q').value || '').trim();
  const trimmedOpts = editOpts.map(o => o.trim());
  const exp        = ($('#edit-exp').value || '').trim();
  const err        = $('#edit-error');
  if (!qText) { err.textContent = 'Please enter a question.'; err.style.display = ''; return; }
  const emptyIdx = trimmedOpts.findIndex(o => !o);
  if (emptyIdx !== -1) { err.textContent = `Please fill in Option ${emptyIdx + 1}.`; err.style.display = ''; return; }
  allQuestions[editCardIdx] = { ...allQuestions[editCardIdx], q: qText, opts: trimmedOpts, ans: editCorrect, exp };
  updateDeckCard();
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
    id:       `edit_${Date.now()}`,
    mod:      allQuestions[0]?.mod      ?? 1,
    mod_name: allQuestions[0]?.mod_name ?? 'My Deck',
    type:     'MCQ',
    q: qText, opts: trimmedOpts, ans: editCorrect, exp,
  });
  updateDeckCard();
  goEditList();
}

function deleteEditCard(i) {
  allQuestions.splice(i, 1);
  updateDeckCard();
  renderEditList();
}

// ── Quiz start ─────────────────────────────────────────────────────────────
function startQuiz() {
  // Always end any existing session and clear saved deck state
  if (sessionId) { localEndSession(sessionId); sessionId = null; }
  localStorage.removeItem(DECK_STATE_KEY);

  quizActive   = false;
  const pool   = allQuestions.filter(q => selectedMods.has(q.mod));
  deck         = shuffle(pool);
  deckPos      = 0;
  round        = 1;
  sessionRight = 0;
  sessionTotal = 0;
  sessionByMod = {};
  answered     = false;
  sessionId    = localStartSession([...selectedMods]);
  restoreQuizShell();
  setView('quiz');
  renderQuestion();
}

function getPool() { return allQuestions.filter(q => selectedMods.has(q.mod)); }

// ── Quiz shell ─────────────────────────────────────────────────────────────
function restoreQuizShell() {
  // action-row lives OUTSIDE the card so it can be fixed at the bottom on mobile
  $('#page-quiz').innerHTML = `
    <div class="pbar-wrap"><div class="pbar-fill" id="pbar" style="width:0%"></div></div>
    <div class="meta-row">
      <span class="badge" id="q-pos"></span>
      <span class="mod-tag" id="q-mod"></span>
      <span class="round-tag" id="q-round"></span>
    </div>
    <div class="card quiz-card">
      <p class="q-text" id="q-text"></p>
      <div class="opts" id="q-opts"></div>
      <div class="fb" id="q-fb"></div>
    </div>
    <div class="kbd-hint" id="kbd-hint"></div>
    <div class="session-counter" id="session-score"></div>
    <div class="action-row">
      <button class="btn btn-primary hidden" id="btn-next" onclick="nextQuestion()">Next →</button>
      <button class="btn btn-back" onclick="quitQuiz()">← Go Back</button>
    </div>`;
}

// ── Render question ────────────────────────────────────────────────────────
function renderQuestion() {
  quizActive = true;
  answered   = false;
  currentQ   = deck[deckPos];
  const total = deck.length;
  const pos   = deckPos + 1;
  const isTF  = currentQ.type === 'T/F';

  $('#pbar').style.width    = Math.round(((pos - 1) / total) * 100) + '%';
  $('#q-pos').textContent   = `${pos} / ${total}`;
  $('#q-mod').textContent   = `M${currentQ.mod} · ${currentQ.mod_name || ''}`;
  $('#q-round').textContent = round > 1 ? `Round ${round}` : '';
  $('#q-text').textContent  = currentQ.q;

  const opts = $('#q-opts');
  opts.innerHTML = '';
  currentQ.opts.forEach((o, i) => {
    const btn = document.createElement('button');
    btn.className  = 'opt';
    btn.dataset.i  = i;
    const lbl      = isTF ? (i === 0 ? 'T' : 'F') : (i + 1);
    btn.innerHTML  = `<span class="opt-ltr">${lbl}</span><span>${escapeHtml(o)}</span>`;
    btn.addEventListener('click', () => pickAnswer(i));
    opts.appendChild(btn);
  });

  const fb = $('#q-fb');
  fb.className     = 'fb';
  fb.style.display = 'none';
  fb.innerHTML     = '';
  $('#btn-next').classList.add('hidden');

  // Keyboard hint — hidden on mobile via CSS
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

  $$('.opt').forEach(b => b.disabled = true);
  $$('.opt').forEach(btn => {
    const i = parseInt(btn.dataset.i);
    if (i === currentQ.ans)            btn.classList.add('correct');
    else if (i === chosen && !correct) btn.classList.add('wrong');
  });

  sessionTotal++;
  if (correct) sessionRight++;
  if (!sessionByMod[currentQ.mod])
    sessionByMod[currentQ.mod] = { right: 0, total: 0, name: currentQ.mod_name };
  sessionByMod[currentQ.mod].total++;
  if (correct) sessionByMod[currentQ.mod].right++;

  const expHtml = currentQ.exp
    ? `<div class="fb-explain">${escapeHtml(currentQ.exp)}</div>` : '';

  const fb = $('#q-fb');
  if (correct) {
    fb.className = 'fb ok';
    fb.innerHTML = `<div class="fb-label">Correct!</div>${expHtml}`;
  } else {
    fb.className = 'fb bad';
    fb.innerHTML = `<div class="fb-label">Not quite — correct: <strong>${escapeHtml(currentQ.opts[currentQ.ans])}</strong></div>${expHtml}`;
  }
  fb.style.display = 'block';
  $('#btn-next').classList.remove('hidden');
  $('#kbd-hint').innerHTML = 'Press <kbd>Space</kbd> <kbd>→</kbd> or <kbd>Enter</kbd> for next';
  $('#session-score').textContent = `Session: ${sessionRight} / ${sessionTotal} correct`;

  if (sessionId) {
    localRecordAnswer(sessionId, currentQ.id, currentQ.mod, correct ? 1 : 0, currentQ);
  }
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
    if (e.key === 'ArrowRight' || e.key === 'Enter' || e.key === ' ') {
      e.preventDefault(); // prevent space from scrolling the page
      nextQuestion();
    }
  }
});

// ── Next / Go Back ─────────────────────────────────────────────────────────
function nextQuestion() {
  deckPos++;
  if (deckPos >= deck.length) {
    if (round === 1) {
      // First pass complete — end session and show results
      if (sessionId) localEndSession(sessionId);
      quizActive = false;
      showResults();
      return;
    }
    // Round 2+ — reshuffle and keep going
    round++;
    deck    = shuffle(getPool());
    deckPos = 0;
  }
  renderQuestion();
}

// Go Back: preserve session so user can resume from the home screen
function quitQuiz() {
  setView('home');
  // quizActive stays true → resume card remains visible
}

// ── Results ────────────────────────────────────────────────────────────────
function showResults() {
  quizActive = false;
  if (sessionTotal === 0) { setView('home'); return; }

  const n   = sessionTotal;
  const pct = Math.round((sessionRight / n) * 100);

  let grade, gc;
  if (pct >= 90)      { grade = 'Outstanding';   gc = 'var(--green)'; }
  else if (pct >= 80) { grade = 'Very good';      gc = 'var(--green)'; }
  else if (pct >= 70) { grade = 'Good';           gc = 'var(--text)'; }
  else if (pct >= 60) { grade = 'Passing';        gc = 'var(--amber)'; }
  else                { grade = 'Keep reviewing'; gc = 'var(--red)'; }

  const r    = 44;
  const circ = 2 * Math.PI * r;
  const dash = (circ * pct / 100).toFixed(1);

  const modRows = Object.entries(sessionByMod)
    .map(([id, m]) => `
      <div class="mod-row">
        <span class="mod-row-name">M${id}: ${escapeHtml(m.name || '')}</span>
        <span class="mod-row-score">${m.right}/${m.total}</span>
      </div>`).join('');

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
      <div class="result-sub">${sessionRight} of ${n} correct · ${round > 1 ? round + ' rounds' : 'Round 1'}</div>
      <div class="stats-grid">
        <div class="stat-box"><div class="stat-val" style="color:var(--green)">${sessionRight}</div><div class="stat-lbl">Correct</div></div>
        <div class="stat-box"><div class="stat-val" style="color:var(--red)">${n - sessionRight}</div><div class="stat-lbl">Wrong</div></div>
        <div class="stat-box"><div class="stat-val">${n}</div><div class="stat-lbl">Answered</div></div>
      </div>
      ${Object.keys(sessionByMod).length > 1 ? `
        <div class="mod-breakdown">
          <div class="section-title">By module</div>
          ${modRows}
        </div>` : ''}
      <div class="result-btns">
        <button class="btn btn-primary" onclick="restartSame()">Go again →</button>
        <button class="btn" onclick="setView('home')">Change modules</button>
      </div>
    </div>`;
}

function restartSame() {
  deck         = shuffle(getPool());
  deckPos      = 0;
  round        = 1;
  sessionRight = 0;
  sessionTotal = 0;
  sessionByMod = {};
  answered     = false;
  sessionId    = localStartSession([...selectedMods]);
  restoreQuizShell();
  renderQuestion();
}

// ── Stats ──────────────────────────────────────────────────────────────────
function loadStats() {
  const page = $('#page-stats');
  page.innerHTML = '<div class="spinner"></div>';

  const { totals, sessions, weak } = localGetStats();
  const ta  = totals.total_answered || 0;
  const tc  = totals.total_correct  || 0;
  const ts  = totals.total_sessions || 0;
  const pct = ta > 0 ? Math.round(tc / ta * 100) : 0;

  const sessionRows = sessions.length === 0
    ? `<tr><td colspan="4" style="text-align:center;color:var(--text-3);padding:1.5rem">No completed sessions yet</td></tr>`
    : sessions.map(s => {
        let mods = '—';
        try { mods = JSON.parse(s.modules).map(m => `M${m}`).join(', '); } catch {}
        const p   = s.total > 0 ? Math.round(s.correct / s.total * 100) : 0;
        const cls = p >= 70 ? 'good' : p >= 50 ? 'mid' : 'low';
        const dt  = (() => {
          try {
            return new Date(s.started_at)
              .toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
          } catch { return s.started_at; }
        })();
        return `<tr>
          <td>${dt}</td>
          <td style="color:var(--text-3)">${mods}</td>
          <td>${s.correct}/${s.total}</td>
          <td><span class="pct-pill ${cls}">${p}%</span></td>
        </tr>`;
      }).join('');

  const weakRows = weak.length === 0
    ? `<div class="text-muted" style="padding:0.75rem 0">Answer ≥ 2 questions to see your weak spots.</div>`
    : weak.map(w => {
        const q     = allQuestions.find(x => x.id === w.question_id);
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

  page.innerHTML = `
    <div class="stats-page">
      <h2>Your stats</h2>
      <div class="overview-grid">
        <div class="stat-box"><div class="stat-val">${ts}</div><div class="stat-lbl">Sessions</div></div>
        <div class="stat-box"><div class="stat-val">${ta}</div><div class="stat-lbl">Answered</div></div>
        <div class="stat-box"><div class="stat-val">${pct}%</div><div class="stat-lbl">Overall</div></div>
      </div>
      <div class="section-title">Weakest questions (≥ 2 attempts)</div>
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

// ── Boot ───────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  document.body.classList.add('view-home');

  $$('nav button[data-view]').forEach(btn => {
    btn.addEventListener('click', () => setView(btn.dataset.view));
  });

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') { closeMenu(); closeModal(); }
  });

  document.addEventListener('click', e => {
    if (!document.getElementById('menu-wrap')?.contains(e.target)) closeMenu();
  });

  // Drag-to-upload on the home Upload card
  const uploadCard = document.getElementById('card-upload');
  if (uploadCard) {
    uploadCard.addEventListener('dragover', e => {
      e.preventDefault();
      e.stopPropagation();
      uploadCard.classList.add('drag-over');
    });
    uploadCard.addEventListener('dragleave', e => {
      if (!uploadCard.contains(e.relatedTarget)) {
        uploadCard.classList.remove('drag-over');
      }
    });
    uploadCard.addEventListener('drop', e => {
      e.preventDefault();
      e.stopPropagation();
      uploadCard.classList.remove('drag-over');
      const file = e.dataTransfer.files[0];
      if (!file) return;
      if (!file.name.endsWith('.json') && file.type !== 'application/json') {
        openModal('upload');
        setTimeout(() => showModalError('Please drop a .json file.'), 50);
        return;
      }
      const reader = new FileReader();
      reader.onload  = ev => { parseQuestions(ev.target.result, file.name); openModal('upload'); };
      reader.onerror = ()  => { openModal('upload'); setTimeout(() => showModalError('Could not read file.'), 50); };
      reader.readAsText(file);
    });
  }

  // Restore question cache from localStorage
  try {
    const cached = localStorage.getItem(LS_KEY);
    if (cached) {
      const { filename, questions } = JSON.parse(cached);
      if (Array.isArray(questions) && questions.length > 0) {
        allQuestions   = questions;
        loadedFileName = filename || 'questions.json';
        const modMap   = {};
        questions.forEach(q => {
          if (!modMap[q.mod]) modMap[q.mod] = { id: q.mod, name: q.mod_name || `Module ${q.mod}`, count: 0 };
          modMap[q.mod].count++;
        });
        allModules = Object.values(modMap).sort((a, b) => a.id - b.id);
        updateDeckCard();
        // Check for a pending deck-state restore (e.g. after importing stats)
        tryRestoreDeckState();
      }
    }
  } catch {}

  updateCreateCard();
});
