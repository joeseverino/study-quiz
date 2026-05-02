/* quiz.js — CS6250 Study Quiz
   Fully local: questions are read client-side via FileReader and never leave
   the browser. Stats (sessions + question accuracy) are stored in localStorage. */

const LS_KEY        = 'cs6250_questions';
const CREATE_KEY    = 'cs6250_created_deck';
const SESSIONS_KEY  = 'cs6250_sessions';
const QSTATS_KEY    = 'cs6250_qstats';

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
    q: "Georgia Tech's OMSCS program launched in 2014 in partnership with which company?",
    opts: ['Coursera', 'edX', 'Udacity', 'LinkedIn Learning'],
    ans: 2,
    exp: "Georgia Tech partnered with Udacity and AT&T to launch the Online Master of Science in Computer Science (OMSCS), making it one of the first affordable, fully online CS master's degrees at scale."
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

// Resume state — true only while a question is actively on screen
let quizActive = false;

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

function localRecordAnswer(sessionId, questionId, moduleId, correct) {
  const sessions = getSessions();
  const s = sessions.find(x => x.id === sessionId);
  if (s) { s.total++; if (correct) s.correct++; }
  saveSessions(sessions);

  const qstats = getQStats();
  if (!qstats[questionId]) {
    qstats[questionId] = { question_id: questionId, module_id: moduleId,
                            total_attempts: 0, correct_count: 0, last_seen: null };
  }
  qstats[questionId].total_attempts++;
  if (correct) qstats[questionId].correct_count++;
  qstats[questionId].last_seen = new Date().toISOString();
  saveQStats(qstats);
}

function localEndSession(sessionId) {
  const sessions = getSessions();
  const s = sessions.find(x => x.id === sessionId);
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

  // Most-recent first, last 20, modules serialised to match renderer
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
  try { localStorage.removeItem(SESSIONS_KEY); localStorage.removeItem(QSTATS_KEY); } catch {}
}

// ── View switching ─────────────────────────────────────────────────────────
function setView(v) {
  $$('nav button').forEach(b => b.classList.toggle('active', b.dataset.view === v));
  $('#page-home').classList.toggle('hidden',  v !== 'home');
  $('#page-quiz').classList.toggle('hidden',  v !== 'quiz');
  $('#page-stats').classList.toggle('hidden', v !== 'stats');
  if (v === 'stats') loadStats();
  if (v === 'home')  updateResumeCard();
}

function updateResumeCard() {
  const card = document.getElementById('resume-card');
  const sub  = document.getElementById('resume-sub');
  if (!card) return;
  if (quizActive && deck.length > 0) {
    const q         = deck[deckPos];
    const modLabel  = q ? (q.mod_name || `Module ${q.mod}`) : '';
    const scoreText = sessionTotal > 0 ? ` · ${sessionRight}/${sessionTotal} correct` : '';
    if (sub) sub.textContent = `${modLabel} · Q ${deckPos + 1} of ${deck.length}${scoreText}`;
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
  // If questions already loaded, skip straight to module selector
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
  allQuestions   = data;
  loadedFileName = filename || 'questions.json';

  const modMap = {};
  data.forEach(q => {
    if (!modMap[q.mod]) modMap[q.mod] = { id: q.mod, name: q.mod_name || `Module ${q.mod}`, count: 0 };
    modMap[q.mod].count++;
  });
  allModules = Object.values(modMap).sort((a, b) => a.id - b.id);

  updateUploadCard();

  // If the modal is open, transition to module selector
  if (!$('#modal-overlay').classList.contains('hidden')) {
    renderModalModuleSelector();
  }
}

function updateUploadCard() {
  const sub = $('#upload-sub');
  if (!sub) return;
  if (allQuestions.length > 0) {
    sub.innerHTML = `<span style="color:var(--green-mid)">${escapeHtml(loadedFileName)} · ${allQuestions.length} questions</span>`;
  } else {
    sub.innerHTML = `Drop .json here<br><span style="font-size:10px;opacity:.75">or click to browse</span>`;
  }
}

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
  quizActive     = false;
  deck           = [];
  allQuestions   = [];
  allModules     = [];
  selectedMods   = new Set();
  loadedFileName = '';
  try { localStorage.removeItem(LS_KEY); } catch {}
  updateUploadCard();
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

function renderCreateModal() {
  const createdDeck = getCreatedDeck();
  const hasCards    = createdDeck.length > 0;

  $('#modal-content').innerHTML = `
    <div class="create-form">
      <div class="form-group">
        <label>Question</label>
        <textarea id="create-q" rows="3" placeholder="Type your question here…"></textarea>
      </div>
      <div class="form-group">
        <label>Options</label>
        <div class="create-opts-grid">
          <input id="opt-0" placeholder="Option 1" />
          <input id="opt-1" placeholder="Option 2" />
          <input id="opt-2" placeholder="Option 3" />
          <input id="opt-3" placeholder="Option 4" />
        </div>
      </div>
      <div class="form-group">
        <label>Correct answer</label>
        <select id="create-correct">
          <option value="0">Option 1</option>
          <option value="1">Option 2</option>
          <option value="2">Option 3</option>
          <option value="3">Option 4</option>
        </select>
      </div>
      <div class="form-group">
        <label>Explanation <span class="form-optional">(optional)</span></label>
        <textarea id="create-exp" rows="2" placeholder="Explain the correct answer…"></textarea>
      </div>
      <button class="btn btn-primary btn-block" onclick="addCreateCard()">+ Add question</button>
      <p id="create-add-error" style="color:var(--red);font-size:12px;margin-top:6px;display:none"></p>
    </div>

    ${hasCards ? `
    <div style="margin-top:18px">
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
  const qText = ($('#create-q').value || '').trim();
  const opts  = [
    ($('#opt-0').value || '').trim(),
    ($('#opt-1').value || '').trim(),
    ($('#opt-2').value || '').trim(),
    ($('#opt-3').value || '').trim(),
  ];
  const ans   = parseInt($('#create-correct').value);
  const exp   = ($('#create-exp').value || '').trim();
  const errEl = $('#create-add-error');

  if (!qText)        { errEl.textContent = 'Please enter a question.'; errEl.style.display = ''; return; }
  if (!opts[0])      { errEl.textContent = 'Please fill in Option 1.'; errEl.style.display = ''; return; }
  if (!opts[1])      { errEl.textContent = 'Please fill in Option 2.'; errEl.style.display = ''; return; }
  if (!opts[2])      { errEl.textContent = 'Please fill in Option 3.'; errEl.style.display = ''; return; }
  if (!opts[3])      { errEl.textContent = 'Please fill in Option 4.'; errEl.style.display = ''; return; }
  errEl.style.display = 'none';

  const deck = getCreatedDeck();
  deck.push({
    id:       `created_${Date.now()}`,
    mod:      1,
    mod_name: 'My Deck',
    type:     'MCQ',
    q:        qText,
    opts,
    ans,
    exp,
  });
  saveCreatedDeck(deck);
  renderCreateModal(); // re-render to show new card in list
}

function deleteCreateCard(idx) {
  const deck = getCreatedDeck();
  deck.splice(idx, 1);
  saveCreatedDeck(deck);
  renderCreateModal();
}

function exportCreatedDeck() {
  const deck = getCreatedDeck();
  if (!deck.length) return;
  const blob = new Blob([JSON.stringify(deck, null, 2)], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = 'my-deck.json';
  a.click();
  URL.revokeObjectURL(url);
}

function studyCreatedDeck() {
  const deck = getCreatedDeck();
  if (!deck.length) return;
  allQuestions   = deck;
  allModules     = [{ id: 1, name: 'My Deck', count: deck.length }];
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
  menuResetCancel(); // reset any leftover confirm state
  updateMenuStates();
  dropdown.classList.remove('hidden');
  document.getElementById('menu-btn').classList.add('open');
}

function closeMenu() {
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
  if (!$('#page-stats').classList.contains('hidden')) loadStats();
}

// ── Edit modal ──────────────────────────────────────────────────────────────
function openEditModal() {
  // Deep-copy so we never mutate DEMO_QUESTIONS or stale references
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
  $('#modal-title').textContent = `Edit card ${editCardIdx + 1} of ${allQuestions.length}`;
  $('#modal-content').innerHTML = `
    <button class="btn btn-sm" style="margin-bottom:14px" onclick="goEditList()">← Back to deck</button>
    <div class="form-group">
      <label>Question</label>
      <textarea id="edit-q" rows="3">${escapeHtml(q.q)}</textarea>
    </div>
    <div class="form-group">
      <label>Options</label>
      <div class="create-opts-grid">
        <input id="edit-opt-0" value="${escapeHtml(q.opts[0] || '')}" placeholder="Option 1"/>
        <input id="edit-opt-1" value="${escapeHtml(q.opts[1] || '')}" placeholder="Option 2"/>
        <input id="edit-opt-2" value="${escapeHtml(q.opts[2] || '')}" placeholder="Option 3"/>
        <input id="edit-opt-3" value="${escapeHtml(q.opts[3] || '')}" placeholder="Option 4"/>
      </div>
    </div>
    <div class="form-group">
      <label>Correct answer</label>
      <select id="edit-correct">
        <option value="0" ${q.ans === 0 ? 'selected' : ''}>Option 1</option>
        <option value="1" ${q.ans === 1 ? 'selected' : ''}>Option 2</option>
        <option value="2" ${q.ans === 2 ? 'selected' : ''}>Option 3</option>
        <option value="3" ${q.ans === 3 ? 'selected' : ''}>Option 4</option>
      </select>
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
}

function renderNewCardForm() {
  $('#modal-title').textContent = 'Add card';
  $('#modal-content').innerHTML = `
    <button class="btn btn-sm" style="margin-bottom:14px" onclick="goEditList()">← Back to deck</button>
    <div class="form-group">
      <label>Question</label>
      <textarea id="new-q" rows="3" placeholder="Type your question here…"></textarea>
    </div>
    <div class="form-group">
      <label>Options</label>
      <div class="create-opts-grid">
        <input id="new-opt-0" placeholder="Option 1"/>
        <input id="new-opt-1" placeholder="Option 2"/>
        <input id="new-opt-2" placeholder="Option 3"/>
        <input id="new-opt-3" placeholder="Option 4"/>
      </div>
    </div>
    <div class="form-group">
      <label>Correct answer</label>
      <select id="new-correct">
        <option value="0">Option 1</option>
        <option value="1">Option 2</option>
        <option value="2">Option 3</option>
        <option value="3">Option 4</option>
      </select>
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
}

function goEditCard(i) { editCardIdx = i; editView = 'edit'; renderEditModal(); }
function goNewCard()   { editView = 'new';  renderEditModal(); }
function goEditList()  { editView = 'list'; renderEditModal(); }

function saveEditCard() {
  const qText = ($('#edit-q').value || '').trim();
  const opts  = [0,1,2,3].map(n => ($(`#edit-opt-${n}`).value || '').trim());
  const ans   = parseInt($('#edit-correct').value);
  const exp   = ($('#edit-exp').value || '').trim();
  const err   = $('#edit-error');
  if (!qText)   { err.textContent = 'Please enter a question.';   err.style.display = ''; return; }
  if (!opts[0]) { err.textContent = 'Please fill in Option 1.';   err.style.display = ''; return; }
  if (!opts[1]) { err.textContent = 'Please fill in Option 2.';   err.style.display = ''; return; }
  if (!opts[2]) { err.textContent = 'Please fill in Option 3.';   err.style.display = ''; return; }
  if (!opts[3]) { err.textContent = 'Please fill in Option 4.';   err.style.display = ''; return; }
  allQuestions[editCardIdx] = { ...allQuestions[editCardIdx], q: qText, opts, ans, exp };
  updateUploadCard();
  goEditList();
}

function saveNewEditCard() {
  const qText = ($('#new-q').value || '').trim();
  const opts  = [0,1,2,3].map(n => ($(`#new-opt-${n}`).value || '').trim());
  const ans   = parseInt($('#new-correct').value);
  const exp   = ($('#new-exp').value || '').trim();
  const err   = $('#new-error');
  if (!qText)   { err.textContent = 'Please enter a question.';   err.style.display = ''; return; }
  if (!opts[0]) { err.textContent = 'Please fill in Option 1.';   err.style.display = ''; return; }
  if (!opts[1]) { err.textContent = 'Please fill in Option 2.';   err.style.display = ''; return; }
  if (!opts[2]) { err.textContent = 'Please fill in Option 3.';   err.style.display = ''; return; }
  if (!opts[3]) { err.textContent = 'Please fill in Option 4.';   err.style.display = ''; return; }
  allQuestions.push({
    id:       `edit_${Date.now()}`,
    mod:      allQuestions[0]?.mod      ?? 1,
    mod_name: allQuestions[0]?.mod_name ?? 'My Deck',
    type:     'MCQ',
    q: qText, opts, ans, exp,
  });
  updateUploadCard();
  goEditList();
}

function deleteEditCard(i) {
  allQuestions.splice(i, 1);
  updateUploadCard();
  renderEditList();
}

// ── Quiz start ─────────────────────────────────────────────────────────────
function startQuiz() {
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
  $('#page-quiz').innerHTML = `
    <div class="pbar-wrap"><div class="pbar-fill" id="pbar" style="width:0%"></div></div>
    <div class="meta-row">
      <span class="badge" id="q-pos"></span>
      <span class="mod-tag" id="q-mod"></span>
      <span class="round-tag" id="q-round"></span>
    </div>
    <div class="card">
      <p class="q-text" id="q-text"></p>
      <div class="opts" id="q-opts"></div>
      <div class="fb" id="q-fb"></div>
      <div class="action-row">
        <button class="btn btn-primary hidden" id="btn-next" onclick="nextQuestion()">Next →</button>
        <button class="btn btn-quit" onclick="quitQuiz()">← Quit</button>
      </div>
    </div>
    <div class="kbd-hint" id="kbd-hint"></div>
    <div class="session-counter" id="session-score"></div>`;
}

// ── Render question ────────────────────────────────────────────────────────
function renderQuestion() {
  quizActive = true;
  answered   = false;
  currentQ   = deck[deckPos];
  const total = getPool().length;
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
  $('#kbd-hint').innerHTML = 'Press <kbd>→</kbd> or <kbd>Enter</kbd> for next';
  $('#session-score').textContent = `Session: ${sessionRight} / ${sessionTotal} correct`;

  if (sessionId) {
    localRecordAnswer(sessionId, currentQ.id, currentQ.mod, correct ? 1 : 0);
  }
}

// ── Keyboard shortcuts ─────────────────────────────────────────────────────
document.addEventListener('keydown', e => {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
  if (!$('#modal-overlay').classList.contains('hidden')) return; // modal open
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
    if (e.key === 'ArrowRight' || e.key === 'Enter') nextQuestion();
  }
});

// ── Next / Quit ────────────────────────────────────────────────────────────
function nextQuestion() {
  deckPos++;
  if (deckPos >= deck.length) {
    round++;
    deck    = shuffle(getPool());
    deckPos = 0;
  }
  renderQuestion();
}

function quitQuiz() {
  quizActive = false;
  if (sessionId) localEndSession(sessionId);
  showResults();
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
  // Nav buttons
  $$('nav button[data-view]').forEach(btn => {
    btn.addEventListener('click', () => setView(btn.dataset.view));
  });

  // Escape key closes modal or menu
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') { closeMenu(); closeModal(); }
  });

  // Click outside closes menu
  document.addEventListener('click', e => {
    if (!document.getElementById('menu-wrap')?.contains(e.target)) closeMenu();
  });

  // ── Drag-to-upload on the home Upload card ──────────────────────────────
  const uploadCard = document.getElementById('card-upload');
  if (uploadCard) {
    uploadCard.addEventListener('dragover', e => {
      e.preventDefault();
      e.stopPropagation();
      uploadCard.classList.add('drag-over');
    });
    uploadCard.addEventListener('dragleave', e => {
      // Only remove if leaving the card itself (not a child)
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
      // Read → parse → open modal (allQuestions will be set, so modal goes
      // straight to the module selector instead of the drop zone).
      const reader = new FileReader();
      reader.onload  = ev => { parseQuestions(ev.target.result, file.name); openModal('upload'); };
      reader.onerror = ()  => { openModal('upload'); setTimeout(() => showModalError('Could not read file.'), 50); };
      reader.readAsText(file);
    });
  }

  // Restore question cache from localStorage — just update card display, don't open modal
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
        updateUploadCard();
      }
    }
  } catch {}

  // Update create card state
  updateCreateCard();
});
