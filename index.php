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
      <div class="mode-grid">

        <button class="mode-card" onclick="openModal('upload')">
          <div class="mode-icon">📁</div>
          <div class="mode-title">Upload</div>
          <div class="mode-sub" id="upload-sub">Load a questions.json file</div>
        </button>

        <button class="mode-card" onclick="openModal('create')">
          <div class="mode-icon">✏️</div>
          <div class="mode-title">Create</div>
          <div class="mode-sub" id="create-sub">Build your own deck</div>
        </button>

        <button class="mode-card" onclick="openModal('demo')">
          <div class="mode-icon">▶️</div>
          <div class="mode-title">Demo</div>
          <div class="mode-sub">5 Georgia Tech questions</div>
        </button>

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

<!-- ── Modal overlay ─────────────────────────────────────────────────────── -->
<div id="modal-overlay" class="hidden" onclick="handleOverlayClick(event)">
  <div id="modal-box">
    <div id="modal-header">
      <span id="modal-title"></span>
      <button id="modal-close" onclick="closeModal()">✕</button>
    </div>
    <div id="modal-content"></div>
  </div>
</div>

<script src="assets/js/quiz.js"></script>
</body>
</html>
