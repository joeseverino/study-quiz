<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { exit; }

$db_path = __DIR__ . '/db/quiz.sqlite';

function db(): PDO {
    global $db_path;
    static $pdo = null;
    if ($pdo === null) {
        if (!file_exists($db_path)) {
            ob_start();
            require __DIR__ . '/setup.php';
            ob_end_clean();
        }
        $pdo = new PDO('sqlite:' . $db_path);
        $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
        $pdo->exec("PRAGMA journal_mode=WAL");
        $pdo->exec("PRAGMA foreign_keys=ON");
    }
    return $pdo;
}

function respond(array $data, int $code = 200): void {
    http_response_code($code);
    echo json_encode($data);
    exit;
}

function error(string $msg, int $code = 400): void {
    respond(['error' => $msg], $code);
}

$action = $_GET['action'] ?? '';
$body   = json_decode(file_get_contents('php://input'), true) ?? [];

// ── POST /api.php?action=start_session ────────────────────────────────────
// Body: { modules: [7, 8, ...] }
if ($action === 'start_session' && $_SERVER['REQUEST_METHOD'] === 'POST') {
    $modules = isset($body['modules']) ? json_encode($body['modules']) : '[]';
    $stmt = db()->prepare("INSERT INTO sessions (modules) VALUES (?)");
    $stmt->execute([$modules]);
    respond(['session_id' => (int) db()->lastInsertId()]);
}

// ── POST /api.php?action=answer ───────────────────────────────────────────
// Questions + answer checking happen client-side (questions.json never leaves the user's machine).
// This endpoint just records the result for stats tracking.
// Body: { session_id, question_id, module_id, correct: true|false }
if ($action === 'answer' && $_SERVER['REQUEST_METHOD'] === 'POST') {
    $session_id  = (int)  ($body['session_id']  ?? 0);
    $question_id = (string)($body['question_id'] ?? '');
    $module_id   = (int)  ($body['module_id']   ?? 0);
    $correct     = (int)  ($body['correct']      ?? 0);

    if (!$session_id || !$question_id) error('Missing session_id or question_id.');

    // Record answer
    $stmt = db()->prepare(
        "INSERT INTO answers (session_id, question_id, module_id, correct) VALUES (?,?,?,?)"
    );
    $stmt->execute([$session_id, $question_id, $module_id, $correct]);

    // Upsert question stats
    $stmt = db()->prepare("
        INSERT INTO question_stats (question_id, module_id, total_attempts, correct_count, last_seen)
        VALUES (?, ?, 1, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(question_id) DO UPDATE SET
            total_attempts = total_attempts + 1,
            correct_count  = correct_count + excluded.correct_count,
            last_seen      = CURRENT_TIMESTAMP
    ");
    $stmt->execute([$question_id, $module_id, $correct]);

    // Update session running totals
    $stmt = db()->prepare(
        "UPDATE sessions SET total = total + 1, correct = correct + ? WHERE id = ?"
    );
    $stmt->execute([$correct, $session_id]);

    respond(['ok' => true]);
}

// ── POST /api.php?action=end_session ──────────────────────────────────────
// Body: { session_id }
if ($action === 'end_session' && $_SERVER['REQUEST_METHOD'] === 'POST') {
    $session_id = (int)($body['session_id'] ?? 0);
    if (!$session_id) error('Missing session_id.');
    $stmt = db()->prepare(
        "UPDATE sessions SET ended_at = CURRENT_TIMESTAMP WHERE id = ?"
    );
    $stmt->execute([$session_id]);
    respond(['ok' => true]);
}

// ── GET /api.php?action=stats ─────────────────────────────────────────────
if ($action === 'stats') {
    $db = db();

    $totals = $db->query("
        SELECT COUNT(*) as total_sessions,
               COALESCE(SUM(total), 0)   as total_answered,
               COALESCE(SUM(correct), 0) as total_correct
        FROM sessions WHERE ended_at IS NOT NULL
    ")->fetch(PDO::FETCH_ASSOC);

    $sessions = $db->query("
        SELECT id, modules, correct, total, started_at, ended_at
        FROM sessions
        WHERE ended_at IS NOT NULL
        ORDER BY started_at DESC
        LIMIT 20
    ")->fetchAll(PDO::FETCH_ASSOC);

    // Weakest questions — hardest first
    $weak = $db->query("
        SELECT question_id, module_id, total_attempts, correct_count,
               (total_attempts - correct_count) AS wrong_count,
               ROUND(100.0 * correct_count / total_attempts, 1) AS pct
        FROM question_stats
        WHERE total_attempts >= 2
        ORDER BY pct ASC
        LIMIT 10
    ")->fetchAll(PDO::FETCH_ASSOC);

    respond([
        'totals'   => $totals,
        'sessions' => $sessions,
        'weak'     => $weak,
    ]);
}

error('Unknown action.', 404);
