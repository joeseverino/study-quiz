/* quiz.js — CS6250 Study Quiz
   Questions loaded from a local JSON file (never uploaded to server).
   Stats tracked server-side via api.php (SQLite). */

const API        = 'api.php';
const LS_KEY     = 'cs6250_questions';
const CREATE_KEY = 'cs6250_created_deck';

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

async function api(action, method = 'GET', body = null) {
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (body) opts.body = JSON.stringify(body);
  try {
    const r = await fetch(`${API}?action=${action}`, opts);
    return await r.json();
  } catch { return { error: 'Network error' }; }
}

// ── View switching ─────────────────────────────────────────────────────────
function setView(v) {
  $$('nav button').forEach(b => b.classList.toggle('active', b.dataset.view === v));
  $('#page-home').classList.toggle('hidden',  v !== 'home');
  $('#page-quiz').classList.toggle('hidden',  v !== 'quiz');
  $('#page-stats').classList.toggle('hidden', v !== 'stats');
  if (v === 'stats') loadStats();
}

// ── Modal system ───────────────────────────────────────────────────────────
function openModal(type) {
  const overlay = $('#modal-overlay');
  overlay.classList.remove('hidden');
  document.body.style.overflow = 'hidden';

  const titles = { upload: 'Upload deck', create: 'Create deck', demo: 'Demo' };
  $('#modal-title').textContent = titles[type] || '';

  if (type === 'upload')      renderUploadModal();
  else if (type === 'create') renderCreateModal();
  else if (type === 'demo')   renderDemoModal();
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
    sub.innerHTML = `<span style="color:var(--green-mid)">${loadedFileName} · ${allQuestions.length} questions</span>`;
  } else {
    sub.textContent = 'Load a questions.json file';
  }
}

function showModalError(msg) {
  const el = $('#modal-file-error');
  if (el) { el.textContent = msg; el.style.display = ''; }
}

function renderModalModuleSelector() {
  const content = $('#modal-content');
  content.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;flex-wrap:wrap;gap:8px">
      <div>
        <span style="font-size:14px;font-weight:500;color:var(--text)">${escapeHtml(loadedFileName)}</span>
        <span style="font-size:13px;color:var(--text-3);margin-left:6px">· ${allQuestions.length} questions</span>
      </div>
      <button class="btn btn-sm" onclick="clearQuestions()">Change file</button>
    </div>
    <p style="font-size:13px;color:var(--text-3);margin-bottom:14px">Pick modules to study. Questions are randomized every session.</p>
    <div class="mod-grid" id="mod-grid"></div>
    <button id="start-btn" class="btn btn-primary btn-block mt-1" onclick="modalStartQuiz()" disabled>Start →</button>`;

  renderModuleGrid();
  selectAll();
}

function clearQuestions() {
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

// ── Quiz start ─────────────────────────────────────────────────────────────
async function startQuiz() {
  const pool   = allQuestions.filter(q => selectedMods.has(q.mod));
  deck         = shuffle(pool);   // always shuffled
  deckPos      = 0;
  round        = 1;
  sessionRight = 0;
  sessionTotal = 0;
  sessionByMod = {};
  answered     = false;

  const res = await api('start_session', 'POST', { modules: [...selectedMods] });
  sessionId = res.session_id || null;

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
  answered = false;
  currentQ = deck[deckPos];
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
    api('answer', 'POST', {
      session_id:  sessionId,
      question_id: currentQ.id,
      module_id:   currentQ.mod,
      correct:     correct ? 1 : 0,
    });
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

async function quitQuiz() {
  if (sessionId) await api('end_session', 'POST', { session_id: sessionId });
  showResults();
}

// ── Results ────────────────────────────────────────────────────────────────
function showResults() {
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

async function restartSame() {
  deck         = shuffle(getPool());
  deckPos      = 0;
  round        = 1;
  sessionRight = 0;
  sessionTotal = 0;
  sessionByMod = {};
  answered     = false;

  const res = await api('start_session', 'POST', { modules: [...selectedMods] });
  sessionId = res.session_id || null;

  restoreQuizShell();
  renderQuestion();
}

// ── Stats ──────────────────────────────────────────────────────────────────
async function loadStats() {
  const page = $('#page-stats');
  page.innerHTML = '<div class="spinner"></div>';

  const res = await api('stats');
  if (res.error) {
    page.innerHTML = `<div class="card empty-state"><p>${res.error}</p></div>`;
    return;
  }

  const { totals, sessions, weak } = res;
  const ta  = parseInt(totals.total_answered) || 0;
  const tc  = parseInt(totals.total_correct)  || 0;
  const ts  = parseInt(totals.total_sessions) || 0;
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
            return new Date(s.started_at.replace(' ', 'T') + 'Z')
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

  // Escape key closes modal
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeModal();
  });

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
