<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Study Quiz</title>
  <link rel="stylesheet" href="assets/css/style.css?v=25">
</head>
<body>

<div class="bg-blobs" aria-hidden="true"></div>

<div class="app-shell">

  <header>
    <a class="logo" href="#" onclick="setView('home');return false;">
      <span class="logo-dot"></span>
      Study Quiz
    </a>
    <div id="header-context" class="header-context" aria-live="polite"></div>
    <div class="header-right">
      <nav>
        <button data-view="home" class="active">Quiz</button>
        <button data-view="stats">Stats</button>
      </nav>
      <div class="menu-wrap" id="menu-wrap">
        <button class="menu-btn" id="menu-btn" onclick="toggleMenu(event)" aria-label="Menu">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/>
          </svg>
        </button>
        <div class="menu-dropdown hidden" id="menu-dropdown">
          <button class="menu-item" id="mi-edit" onclick="menuEdit()">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            Edit cards
          </button>
          <button class="menu-item" id="mi-export" onclick="menuExport()">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            Export deck JSON
          </button>
          <div class="menu-divider"></div>
          <button class="menu-item menu-item-danger" id="mi-reset" onclick="menuResetConfirm()">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
            Reset stats
          </button>
          <div class="menu-reset-confirm hidden" id="mi-reset-confirm">
            <p>Reset stats for this deck?</p>
            <div class="menu-confirm-btns">
              <button class="btn btn-sm" onclick="menuResetGo()">Yes, reset</button>
              <button class="btn btn-sm" onclick="menuResetCancel()">Cancel</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </header>

  <main>

    <!-- ── Home ──────────────────────────────────────────────────────────── -->
    <div id="page-home">
      <div class="home-content">

        <!-- Resume banner (shown when a session is in progress) -->
        <div id="resume-card" class="hidden" role="button" tabindex="0"
             onclick="resumeSession()"
             onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();resumeSession()}">
          <div class="resume-icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="10"/>
              <polygon points="10 8 16 12 10 16 10 8" fill="currentColor" stroke="none"/>
            </svg>
          </div>
          <div class="resume-info">
            <div class="resume-title">Continue session</div>
            <div class="resume-sub" id="resume-sub"></div>
          </div>
          <div class="resume-arrow">→</div>
        </div>

        <!-- My Decks switcher (populated by JS) -->
        <div id="deck-switcher" class="hidden">
          <div class="home-section-label">My Decks</div>
          <div id="deck-list"></div>
        </div>

        <!-- Add a deck -->
        <div id="add-deck-label" class="home-section-label hidden">Add a deck</div>
        <div class="mode-grid">

          <!-- Upload -->
          <div id="card-upload" class="mode-card" role="button" tabindex="0"
               onclick="openModal('upload')"
               onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();openModal('upload')}">
            <div class="mode-icon-wrap">
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
                <line x1="12" y1="11" x2="12" y2="17"/>
                <polyline points="9 14 12 11 15 14"/>
              </svg>
            </div>
            <div class="mode-title">Upload</div>
            <div class="mode-sub">Drop a .json file or click to browse</div>
          </div>

          <!-- Create -->
          <div class="mode-card" role="button" tabindex="0"
               onclick="openModal('create')"
               onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();openModal('create')}">
            <div class="mode-icon-wrap">
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                <path d="M12 20h9"/>
                <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 9.5-9.5z"/>
              </svg>
            </div>
            <div class="mode-title">Create</div>
            <div class="mode-sub" id="create-sub">Build your own deck</div>
          </div>

          <!-- Demo -->
          <div class="mode-card" role="button" tabindex="0"
               onclick="openModal('demo')"
               onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();openModal('demo')}">
            <div class="mode-icon-wrap">
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="10"/>
                <polygon points="10 8 16 12 10 16 10 8" fill="currentColor" stroke="none"/>
              </svg>
            </div>
            <div class="mode-title">Demo</div>
            <div class="mode-sub">5 Georgia Tech questions</div>
          </div>

        </div><!-- /.mode-grid -->
      </div><!-- /.home-content -->
      <a class="home-footer-link" href="https://jseverino.com" target="_blank" rel="noopener noreferrer">Visit jseverino.com →</a>
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

<!-- ── Quiz action footer (sticky, shown after answering) ─────────────────── -->
<div id="quiz-footer" class="quiz-footer quiz-footer-hidden">
  <button class="btn btn-back" onclick="quitQuiz()">← Go Back</button>
  <button class="btn btn-primary" id="btn-next" onclick="nextQuestion()">Next →</button>
</div>

<script src="assets/js/quiz.js?v=23"></script>
</body>
</html>
