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
  <title>CS6250 · Study Quiz</title>
  <link rel="stylesheet" href="assets/css/style.css">
</head>
<body>

<div class="app-shell">

  <header>
    <a class="logo" href="#" onclick="setView('home');return false;">
      <span class="logo-dot"></span>
      CS6250 · Study Quiz
    </a>
    <nav>
      <button data-view="home" class="active">Quiz</button>
      <button data-view="stats">Stats</button>
    </nav>
  </header>

  <main>

    <!-- ── Home ──────────────────────────────────────────────────────────── -->
    <div id="page-home">

      <!-- File loader (shown when no questions cached) -->
      <div id="file-loader" class="card mb-2" style="display:none">
        <label id="file-label" style="cursor:pointer;display:block">
          <div class="file-inner">
            <div class="file-icon">📂</div>
            <div class="file-title">Load your questions file</div>
            <div class="file-sub">Click to select <code>questions.json</code> from your computer</div>
            <span class="btn btn-primary btn-sm" style="pointer-events:none">Choose file</span>
          </div>
          <input type="file" id="file-input" accept=".json,application/json" style="display:none">
        </label>
        <p class="text-muted" style="font-size:12px;text-align:center">
          Read locally in your browser — nothing is uploaded to the server.
        </p>
        <p id="file-error" class="text-muted mt-1" style="color:var(--red);display:none;text-align:center"></p>
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
        <p class="text-muted mb-2" style="font-size:13px">
          Pick modules to study. Questions are randomized every session.
        </p>
        <div class="mod-grid" id="mod-grid"></div>
        <button id="start-btn" class="btn btn-primary btn-block mt-1" disabled>Start →</button>
      </div>

    </div>

    <!-- ── Quiz ───────────────────────────────────────────────────────────── -->
    <div id="page-quiz" class="hidden"></div>

    <!-- ── Stats ──────────────────────────────────────────────────────────── -->
    <div id="page-stats" class="hidden">
      <div class="spinner"></div>
    </div>

  </main>
</div>

<script src="assets/js/quiz.js"></script>
</body>
</html>
