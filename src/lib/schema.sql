-- UniTime DB Schema
-- 統合ユーザーモデル: 社員/業務委託/クルーを同一テーブルで管理

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  login_id TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  email TEXT,
  employment_type TEXT NOT NULL DEFAULT 'employee',
  role TEXT NOT NULL DEFAULT 'member',
  salary_type TEXT,
  monthly_salary INTEGER,
  hourly_rate INTEGER,
  hire_date TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  -- 所定労働時間（分）: ユニポール社員は9:15-17:15・休憩45分 = 7h15m = 435分
  standard_work_minutes INTEGER NOT NULL DEFAULT 435,
  created_at TEXT DEFAULT (datetime('now', '+9 hours')),
  updated_at TEXT DEFAULT (datetime('now', '+9 hours'))
);

CREATE TABLE IF NOT EXISTS attendance_records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  punch_type TEXT NOT NULL,
  punched_at TEXT NOT NULL,
  latitude REAL,
  longitude REAL,
  accuracy REAL,
  location_label TEXT,
  memo TEXT,
  created_at TEXT DEFAULT (datetime('now', '+9 hours')),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_attendance_user_date
  ON attendance_records(user_id, punched_at);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  created_at TEXT DEFAULT (datetime('now', '+9 hours')),
  expires_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

-- 立替精算・交通費申請（出張申請兼用）
CREATE TABLE IF NOT EXISTS expense_claims (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  claim_date TEXT NOT NULL,
  category TEXT NOT NULL,
  amount INTEGER NOT NULL,
  purpose TEXT NOT NULL,
  route_from TEXT,
  route_to TEXT,
  project_name TEXT,
  receipt_path TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  ai_check_status TEXT,
  ai_check_reason TEXT,
  ai_confidence REAL,
  approver_id INTEGER,
  approved_at TEXT,
  notes TEXT,
  created_at TEXT DEFAULT (datetime('now', '+9 hours')),
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (approver_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_expense_claims_user ON expense_claims(user_id);
CREATE INDEX IF NOT EXISTS idx_expense_claims_status ON expense_claims(status);
CREATE INDEX IF NOT EXISTS idx_expense_claims_claim_date ON expense_claims(claim_date);
