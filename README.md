# Study Quiz

A lightweight, self-hosted multiple-choice quiz app. All progress is saved locally in the browser — nothing is sent to a server.

Live demo: [quiz.jseverino.net](https://quiz.jseverino.net)

---

## Features

**Decks**
- Upload any `.json` deck file by dropping it on the home screen or using the Upload card
- Build a deck from scratch with the in-app card editor (Create)
- Manage multiple decks simultaneously — each with independent stats and progress
- Edit deck name, description, and individual cards at any time
- Try it instantly with the built-in Georgia Tech trivia demo

**Studying**
- Module filtering — study only the modules you want within a deck
- Shuffle mode — randomize question order each session
- Streak tracking — see your current and best streak during a session
- Confidence rating — mark each question "Got it" or "Still shaky" after answering
- Resume — pick up exactly where you left off if you leave mid-session
- Keyboard shortcuts — press `1`–`4` to select an answer, `Space` or `→` to advance

**Stats**
- Per-deck or all-decks aggregate view
- Accuracy-over-time chart (last 30 sessions)
- Weakest questions ranked by accuracy (requires ≥ 2 attempts)
- Weak-spot drill mode — start a focused session on your worst questions
- Full session history with date, modules studied, score, and percentage

**Data portability**
- Export deck JSON — share or back up the question set
- Export save state — a full snapshot of your stats and progress for a deck
- Import save state — restore or sync progress across devices by dropping a save file on the Upload card
- The app auto-detects whether a dropped file is a deck or a save state

**Display**
- Light and dark mode — follows your OS preference automatically

---

## Quick start

No build step, no dependencies. Open `index.php` in any browser or run a local server:

```bash
cd study-quiz
php -S localhost:8080
# open http://localhost:8080
```

Any other static file server works too (Python, Node, nginx, Apache).

---

## Deck format

Decks are `.json` files you create yourself or export from the app. The format is:

```json
{
  "title": "My Deck",
  "description": "What this deck covers.",
  "questions": [
    {
      "id": "q1",
      "mod": 1,
      "mod_name": "Module Name",
      "q": "Question text?",
      "opts": ["Option A", "Option B", "Option C", "Option D"],
      "ans": 0,
      "exp": "Explanation shown after answering."
    }
  ]
}
```

| Field | Required | Description |
|---|---|---|
| `title` | No | Deck name shown in the UI |
| `description` | No | Short description shown under the deck name |
| `questions` | Yes | Array of question objects |
| `id` | Yes | Unique string identifier for the question |
| `mod` | Yes | Module number (integer) — used for filtering |
| `mod_name` | Yes | Module display name |
| `q` | Yes | Question text |
| `opts` | Yes | Array of answer strings (2–8 options) |
| `ans` | Yes | Zero-based index of the correct answer |
| `exp` | No | Explanation shown after the user answers |

Questions with `"type": "T/F"` will render True/False buttons instead of numbered options. In that case `opts` should be `["True", "False"]` and `ans` is `0` for True or `1` for False.

You can also build decks entirely inside the app using the Create card, then export them as JSON.

---

## Save state format

When you export a save state (deck ⋯ menu → Export save state), you get a JSON file that includes the full question set plus all your stats. Dropping this file on the Upload card restores everything on any device — no account required.

---

## Generating decks with AI

The `skills/deck-generator/` folder contains a Claude skill that converts any study material — notes, slides, PDFs, outlines — into a ready-to-upload deck JSON file.

To use it in [Claude Cowork](https://claude.ai), install the skill and say something like:

> "Generate a Study Quiz deck from this document" (with your file attached)

Claude will ask about module structure, write questions and explanations, and save a `.json` file you can drop straight into the Upload card.

The deck schema is documented in `data/deck.schema.json` and the example deck in `data/questions.example.json`.

---

## Deploying to a server

Because the app is pure static HTML + JS, any web server can host it. Two examples:

### Nginx

```nginx
server {
    listen 80;
    server_name yourdomain.com;
    root /path/to/study-quiz;
    index index.php index.html;

    location / {
        try_files $uri $uri/ /index.php;
    }
}
```

### Apache

```apache
DirectoryIndex index.php index.html
```

---

## File structure

```
study-quiz/
├── index.php                    # App entry point (pure HTML — no PHP logic)
├── assets/
│   ├── css/style.css            # All styles, light + dark mode
│   └── js/quiz.js               # All app logic — localStorage only, no backend
├── data/
│   └── questions.example.json  # Deck format reference
└── .gitignore
```

All data lives in the browser's `localStorage`. Nothing is written to the server.

---

## Contributing

Bug reports and pull requests welcome. Keep PRs focused — one change per PR makes review easier.
