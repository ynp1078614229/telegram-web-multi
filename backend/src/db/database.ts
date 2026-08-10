import Database from 'better-sqlite3';
import path from 'path';
import bcrypt from 'bcryptjs';

const dbPath = path.join(__dirname, '../../data.db');
const db: any = new Database(dbPath);

db.pragma('journal_mode = WAL');
db.pragma('foreign_key_checks = ON');

// Initialize tables
db.exec(`
  CREATE TABLE IF NOT EXISTS admin_users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS accounts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    telegram_user_id INTEGER UNIQUE,
    phone TEXT,
    first_name TEXT,
    username TEXT,
    session_string TEXT,
    client_token TEXT UNIQUE,
    is_active INTEGER DEFAULT 1,
    client_port INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_seen_at DATETIME
  );

  CREATE TABLE IF NOT EXISTS auto_replies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    account_id INTEGER NOT NULL,
    keyword TEXT NOT NULL,
    match_type TEXT DEFAULT 'contains',
    reply_text TEXT NOT NULL,
    is_active INTEGER DEFAULT 1,
    match_count INTEGER DEFAULT 0,
    priority INTEGER DEFAULT 0,
    match_mode TEXT DEFAULT 'any',
    delay_min INTEGER DEFAULT 0,
    delay_max INTEGER DEFAULT 1000,
    cooldown INTEGER DEFAULT 0,
    scope TEXT DEFAULT 'all',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS auto_reply_cooldowns (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    rule_id INTEGER NOT NULL,
    chat_id INTEGER NOT NULL,
    last_triggered_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (rule_id) REFERENCES auto_replies(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS auto_reply_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    account_id INTEGER NOT NULL,
    rule_id INTEGER NOT NULL,
    from_user_id TEXT DEFAULT '',
    from_user_name TEXT DEFAULT '',
    keyword TEXT DEFAULT '',
    reply_text TEXT DEFAULT '',
    chat_type TEXT DEFAULT 'private',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (rule_id) REFERENCES auto_replies(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS auth_state (
    account_id INTEGER NOT NULL,
    key TEXT NOT NULL,
    value TEXT DEFAULT '',
    PRIMARY KEY (account_id, key)
  );

  CREATE TABLE IF NOT EXISTS auth_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    phone TEXT NOT NULL,
    phone_code_hash TEXT NOT NULL,
    account_id INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE INDEX IF NOT EXISTS idx_auto_reply_logs_account ON auto_reply_logs(account_id);
  CREATE INDEX IF NOT EXISTS idx_auto_reply_logs_rule ON auto_reply_logs(rule_id);
`);

// Initialize admin user from env
const adminUsername = process.env.ADMIN_USERNAME || 'admin';
const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';
const existing = db.prepare('SELECT id FROM admin_users WHERE username = ?').get(adminUsername);
if (!existing) {
  const hash = bcrypt.hashSync(adminPassword, 10);
  db.prepare('INSERT INTO admin_users (username, password_hash) VALUES (?, ?)').run(adminUsername, hash);
  console.log(`Admin user created: ${adminUsername}`);
}

export default db;
