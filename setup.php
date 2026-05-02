<?php
// Run this once to create the SQLite database: php setup.php
// Or visit /setup.php in your browser (then delete or protect it).

$db_path = __DIR__ . '/db/quiz.sqlite';

if (!is_dir(__DIR__ . '/db')) {
    mkdir(__DIR__ . '/db', 0755, true);
}

try {
    $pdo = new PDO('sqlite:' . $db_path);
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

    $pdo->exec("PRAGMA journal_mode=WAL");
    $pdo->exec("PRAGMA foreign_keys=ON");

    $pdo->exec("
        CREATE TABLE IF NOT EXISTS sessions (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            modules    TEXT,
            correct    INTEGER DEFAULT 0,
            total      INTEGER DEFAULT 0,
            started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            ended_at   DATETIME
        )
    ");

    $pdo->exec("
        CREATE TABLE IF NOT EXISTS answers (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id  INTEGER,
            question_id TEXT,
            module_id   INTEGER,
            correct     INTEGER,
            answered_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (session_id) REFERENCES sessions(id)
        )
    ");

    $pdo->exec("
        CREATE TABLE IF NOT EXISTS question_stats (
            question_id    TEXT PRIMARY KEY,
            module_id      INTEGER,
            total_attempts INTEGER DEFAULT 0,
            correct_count  INTEGER DEFAULT 0,
            last_seen      DATETIME
        )
    ");

    echo "Database created successfully at: $db_path\n";
    echo "You can now delete or restrict access to setup.php.\n";

} catch (Exception $e) {
    http_response_code(500);
    echo "Setup failed: " . $e->getMessage() . "\n";
}
