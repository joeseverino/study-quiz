/* quiz.js — CS6250 Study Quiz
   Questions are loaded from a local JSON file (never uploaded to the server).
   Stats are tracked server-side via api.php. */

const API    = 'api.php';
const LS_KEY = 'cs6250_questions';

// ── State ─────────────────────────────────────────────────────────────────
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

// ── Helpers ───────────────────────────────────────────────────────────────
const $  = (s, ctx = document) => ctx.querySelector(s);
const $$ = (s, ctx = document) => [...ctx.querySelectorAll(s)];

function shuffle(arr) {
  return arr.map(v => ({ v, s: Math.random() }))
            .sort((a, b) => a.s - b.s)
            .map(x => x.v);
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

// ── File loading ───────────────────────────────────────────────────────────
function initFileInput() {
  const input = $('#file-input');
  input.addEventListener('change', () => {
    const file = input.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload  = e => parseQuestions(e.target.result, file.name);
    reader.onerror = () => showFileError('Could not read file.');
    reader.readAsText(file);
    input.value = '';
  });

  $('#change-file-btn').addEventListener('click', () => {
    allQuestions = [];
    allModules   = [];
    selectedMods = new Set();
    try { localStorage.removeItem(LS_KEY); } catch {}
    $('#module-selector').style.display = 'none';
    $('#file-loader').style.display = '';
  });
}

function parseQuestions(text, filename) {
  let data;
  try { data = JSON.parse(text); }
  catch { showFileError('Invalid JSON — could not parse the file.'); return; }

  if (!Array.isArray(data) || !data.length) {
    showFileError('File must be a non-empty JSON array.'); return;
  }
  const s = data[0];
  if (!s.id || !s.q || !Array.isArray(s.opts) || s.ans === undefined) {
    showFileError('Questions need id, q, opts (array), and ans fields.'); return;
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

  hideFileError();
  $('#file-loader').style.display = 'none';
  $('#module-selector').style.display = '';
  $('#file-loaded-name').textContent  = loadedFileName;
  $('#file-loaded-count').textContent = `· ${allQuestions.length} questions`;
  renderModuleGrid();
  selectAll(); // default: all modules selected, ready to start immediately
}

function showFileError(msg) {
  const el = $('#file-error');
  el.textContent = msg;
  el.style.display = '';
}

function hideFileError() {
  $('#file-error').style.display = 'none';
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
                     <div class="mod-name">${m.name}</div>
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
    btn.className = 'opt';
    btn.dataset.i = i;
    // Keyboard label: 1-4 for MCQ, T/F for true-false
    const lbl = isTF ? (i === 0 ? 'T' : 'F') : (i + 1);
    btn.innerHTML = `<span class="opt-ltr">${lbl}</span><span>${o}</span>`;
    btn.addEventListener('click', () => pickAnswer(i));
    opts.appendChild(btn);
  });

  const fb = $('#q-fb');
  fb.className = 'fb';
  fb.style.display = 'none';
  fb.innerHTML = '';
  $('#btn-next').classList.add('hidden');

  // Keyboard hint
  $('#kbd-hint').innerHTML = isTF
    ? 'Press <kbd>T</kbd> True &nbsp;·&nbsp; <kbd>F</kbd> False'
    : 'Press <kbd>1</kbd> <kbd>2</kbd> <kbd>3</kbd> <kbd>4</kbd> to answer';

  $('#session-score').textContent = sessionTotal > 0
    ? `Session: ${sessionRight} / ${sessionTotal} correct` : '';
}

// ── Answer ────────────────────────────────────────────────────────────────
async function pickAnswer(chosen) {
  if (answered) return;
  answered = true;

  const correct = (chosen === currentQ.ans);

  $$('.opt').forEach(b => b.disabled = true);
  $$('.opt').forEach(btn => {
    const i = parseInt(btn.dataset.i);
    if (i === currentQ.ans)           btn.classList.add('correct');
    else if (i === chosen && !correct) btn.classList.add('wrong');
  });

  sessionTotal++;
  if (correct) sessionRight++;
  if (!sessionByMod[currentQ.mod])
    sessionByMod[currentQ.mod] = { right: 0, total: 0, name: currentQ.mod_name };
  sessionByMod[currentQ.mod].total++;
  if (correct) sessionByMod[currentQ.mod].right++;

  // Always show explanation — correct or wrong
  const expHtml = currentQ.exp
    ? `<div class="fb-explain">${currentQ.exp}</div>` : '';

  const fb = $('#q-fb');
  if (correct) {
    fb.className = 'fb ok';
    fb.innerHTML = `<div class="fb-label">Correct!</div>${expHtml}`;
  } else {
    fb.className = 'fb bad';
    fb.innerHTML = `<div class="fb-label">Not quite — correct: <strong>${currentQ.opts[currentQ.ans]}</strong></div>${expHtml}`;
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
        <span class="mod-row-name">M${id}: ${m.name || ''}</span>
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
        const q = allQuestions.find(x => x.id === w.question_id);
        const qtext = q ? q.q : `Question ${w.question_id}`;
        return `<div class="weak-item">
          <div class="weak-q">${qtext}</div>
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
  $$('nav button[data-view]').forEach(btn => {
    btn.addEventListener('click', () => setView(btn.dataset.view));
  });

  $('#start-btn').addEventListener('click', startQuiz);
  initFileInput();

  // Restore from localStorage if available
  try {
    const cached = localStorage.getItem(LS_KEY);
    if (cached) {
      const { filename, questions } = JSON.parse(cached);
      if (Array.isArray(questions) && questions.length > 0) {
        applyQuestions(questions, filename);
        return;
      }
    }
  } catch {}

  // No cache — show file loader
  $('#file-loader').style.display = '';
  $('#module-selector').style.display = 'none';
});
