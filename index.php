<?php
// Auto-create DB on first visit
$db_path = __DIR__ . '/db/quiz.sqlite';
if (!file_exists($db_path)) {
    ob_start(); require __DIR__ . '/setup.php'; ob_end_clean();
}
?>
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>CS6250 Study Quiz</title>
  <link rel="stylesheet" href="assets/css/style.css">
</head>
<body>

<div class="app-shell">

  <header>
    <a class="logo" href="#" onclick="setView('home');return false;">
      <span class="logo-dot"></span>
      CS6250 Study Quiz
    </a>
    <nav>
      <button data-view="home" class="active">Quiz</button>
      <button data-view="stats">Stats</button>
    </nav>
  </header>

  <main>

    <!-- ── Home ─────────────────────────────────────────────────────────── -->
    <div id="page-home">

      <!-- File loader (shown when no questions are loaded) -->
      <div id="file-loader" class="card mb-2">
        <p style="font-size:15px;font-weight:500;margin-bottom:6px">Load your questions file</p>
        <p class="text-muted mb-2">Select your local <code>questions.json</code> file. It's read directly in your browser — nothing is uploaded to the server.</p>
        <label id="file-label" class="btn btn-primary" style="display:inline-flex;cursor:pointer;">
          Choose questions.json
          <input type="file" id="file-input" accept=".json,application/json" style="display:none">
        </label>
        <p id="file-error" class="text-muted mt-1" style="color:var(--red);display:none"></p>
        <p class="text-muted mt-1" style="font-size:12px">Don't have one yet? Download the example: <a href="data/questions.example.json" download>questions.example.json</a></p>
      </div>

      <!-- Module selector (shown once questions are loaded) -->
      <div id="module-selector" class="card mb-2" style="display:none">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;flex-wrap:wrap;gap:8px">
          <div>
            <span id="file-loaded-name" style="font-size:14px;font-weight:500;color:var(--text)"></span>
            <span id="file-loaded-count" class="text-muted" style="font-size:13px;margin-left:6px"></span>
          </div>
          <button class="btn btn-sm" id="change-file-btn">Change file</button>
        </div>
        <p class="text-muted mb-2" style="font-size:13px">Select modules. Every question is shown once before any repeats.</p>
        <div class="mod-grid" id="mod-grid"></div>
        <button id="start-btn" class="btn btn-primary btn-block" disabled>Select a module to start →</button>
      </div>

    </div>

    <!-- ── Quiz ──────────────────────────────────────────────────────────── -->
    <div id="page-quiz" class="hidden">
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
      <div class="session-counter" id="session-score"></div>
    </div>

    <!-- ── Stats ─────────────────────────────────────────────────────────── -->
    <div id="page-stats" class="hidden">
      <div class="spinner"></div>
    </div>

  </main>
</div>

<script src="assets/js/quiz.js"></script>
</body>
</html>
