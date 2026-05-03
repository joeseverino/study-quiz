# Study Quiz

A lightweight, self-hosted multiple-choice quiz app. All progress saves locally in the browser — nothing is uploaded to a server.

## Features

- Upload any `.json` deck, or build one from scratch in the app
- Module filtering, shuffle mode, streaks, confidence tracking
- Weak-spot drilling and session history
- Export / import save states to sync progress across devices
- Light + dark mode

---

## Quick start

**No server required** — just open `index.php` directly in your browser.

Or run a local dev server:

```bash
cd study-quiz
php -S localhost:8080
# open http://localhost:8080
```

---

## Deck format

Decks are `.json` files (gitignored — never committed). Copy the example to get started:

```bash
cp data/questions.example.json data/questions.json
```

Full format documented in `data/questions.example.json`. The short version:

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

You can also build and export decks directly in the app (Create → export as JSON).

---

## Deploying to a server

Any static file server works. Example configs:

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

    # Block direct access to data/
    location ~ ^/data/ {
        deny all;
        return 404;
    }
}
```

### Apache

```apache
<DirectoryMatch "^.*(data)$">
    Require all denied
</DirectoryMatch>
```

---

## File structure

```
study-quiz/
├── index.php                   # App entry point (pure HTML)
├── assets/
│   ├── css/style.css           # Styles (light + dark mode)
│   └── js/quiz.js              # All quiz logic (localStorage, no backend)
├── data/
│   ├── questions.json          # Your questions (gitignored, local only)
│   └── questions.example.json # Format reference
└── .gitignore
```
