# CS6250 Study Quiz

Interactive quiz web app for OMSCS CS6250 Exam 2. Questions are stored locally (never committed to git).

## Setup

### 1. Point your domain
In your DNS / hosting panel, point `quiz.jseverino.net` to your server and set the document root to this folder.

### 2. Server requirements
- PHP 7.4+ with PDO and SQLite3 extensions
- Apache or Nginx with PHP-FPM

### 3. Questions file
Your questions are already in `data/questions.php` (gitignored — local only).
If you clone this repo on another machine, copy `data/questions.example.php` → `data/questions.php` and fill it in.

### 4. Database
The SQLite database is created automatically on first visit. It lives at `db/quiz.sqlite` (gitignored).

To create it manually:
```bash
php setup.php
```

Or just visit the site — `index.php` auto-runs setup if the DB doesn't exist.

### 5. File permissions
```bash
chmod 755 db/
chmod 644 db/quiz.sqlite   # after first visit
```

---

## Nginx config (example)

```nginx
server {
    listen 80;
    server_name quiz.jseverino.net;
    root /path/to/study-quiz;
    index index.php;

    location / {
        try_files $uri $uri/ /index.php?$query_string;
    }

    location ~ \.php$ {
        fastcgi_pass unix:/run/php/php8.2-fpm.sock;
        fastcgi_index index.php;
        include fastcgi_params;
        fastcgi_param SCRIPT_FILENAME $realpath_root$fastcgi_script_name;
    }

    # Block direct access to data/ and db/
    location ~ ^/(data|db)/ {
        deny all;
        return 404;
    }
}
```

## Apache config (example .htaccess)

```apache
# Block access to data/ and db/
<DirectoryMatch "^.*(data|db)$">
    Require all denied
</DirectoryMatch>
```

---

## Running locally (dev)

```bash
cd study-quiz
php -S localhost:8080
# then open http://localhost:8080
```

---

## File structure

```
study-quiz/
├── index.php              # Main app shell
├── api.php                # REST API (questions, sessions, stats)
├── setup.php              # DB setup (run once)
├── assets/
│   ├── css/style.css      # Styles (light + dark mode)
│   └── js/quiz.js         # Quiz logic
├── data/
│   ├── questions.php      # ← YOUR QUESTIONS (gitignored, local only)
│   └── questions.example.php
├── db/
│   └── quiz.sqlite        # SQLite DB (gitignored, auto-created)
└── .gitignore
```

## API endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `api.php?action=questions` | Returns questions (no answers) |
| GET | `api.php?action=modules` | Returns module list |
| POST | `api.php?action=start_session` | Creates session, returns `session_id` |
| POST | `api.php?action=answer` | Records answer, returns correctness + explanation |
| POST | `api.php?action=end_session` | Finalizes session |
| GET | `api.php?action=stats` | Returns overall stats, session history, weakest questions |
