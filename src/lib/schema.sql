-- UniTime DB Schema
-- 統合ユーザーモデル: 社員/業務委託/クルーを同一テーブルで管理
-- Phase 3a (2026-04-26) でクルー管理機能の11テーブル + users/attendance_records 拡張を追加

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  login_id TEXT UNIQUE NOT NULL,
  -- Phase 3a: クルー本人ログイン許可のため NULLABLE 化
  -- ログインしないクルー（紙のみ登録）は NULL のまま
  password_hash TEXT,
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
  -- 自宅座標（社員のみ任意登録・在宅打刻の位置ラベル判定に使用）
  home_latitude REAL,
  home_longitude REAL,
  -- Phase 3a: クルー名簿用の連絡先情報
  phone TEXT,
  postal_code TEXT,
  address TEXT,
  emergency_contact TEXT,
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
  -- Phase 3a: クルーシフトとの紐付け（社員打刻は NULL のまま）
  crew_shift_id INTEGER REFERENCES crew_shifts(id) ON DELETE SET NULL,
  -- Phase 3a: 代行打刻者（本人打刻時は NULL or user_id と同値）
  registered_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT DEFAULT (datetime('now', '+9 hours')),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_attendance_user_date
  ON attendance_records(user_id, punched_at);
CREATE INDEX IF NOT EXISTS idx_attendance_crew_shift
  ON attendance_records(crew_shift_id);

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

-- ===== Phase B #2-A: 休暇申請ワークフロー =====
-- 残日数 = SUM(leave_grants.granted_days) - SUM(approved leave_requests in days)
-- 年度概念は granted_at の年（YYYY-）でアプリ側集計

CREATE TABLE IF NOT EXISTS special_leave_policies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  default_days REAL NOT NULL,
  description TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now', '+9 hours'))
);

INSERT OR IGNORE INTO special_leave_policies (code, name, default_days, description, display_order) VALUES
  ('marriage', '結婚休暇', 5, '本人の結婚時に付与', 1),
  ('funeral_1st', '忌引（1親等）', 5, '父母・配偶者・子の忌引', 2),
  ('funeral_2nd', '忌引（2親等）', 3, '祖父母・兄弟姉妹・配偶者の父母', 3),
  ('funeral_3rd', '忌引（3親等）', 1, 'おじ・おば・甥姪・配偶者の祖父母兄弟', 4),
  ('birth', '配偶者出産休暇', 3, '配偶者の出産時', 5),
  ('jury', '裁判員・公務', 0, '実日数。0=実日数（申請時に日数指定）', 6),
  ('disaster', '災害特別休暇', 0, '実日数（申請時に日数指定）', 7);

-- 付与履歴: 有給は法定通り auto / 特別は申請時 manual
CREATE TABLE IF NOT EXISTS leave_grants (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  leave_type TEXT NOT NULL,         -- 'paid' / 'special'
  special_policy_code TEXT,         -- type='special'のみ。policies.codeへの論理参照
  granted_days REAL NOT NULL,
  granted_at TEXT NOT NULL,         -- YYYY-MM-DD
  source TEXT NOT NULL DEFAULT 'manual',  -- 'auto' / 'manual'
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now', '+9 hours'))
);
CREATE INDEX IF NOT EXISTS idx_leave_grants_user ON leave_grants(user_id);
CREATE INDEX IF NOT EXISTS idx_leave_grants_at ON leave_grants(granted_at);

-- 申請履歴
CREATE TABLE IF NOT EXISTS leave_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  leave_type TEXT NOT NULL,         -- 'paid' / 'special' / 'compensatory' / 'substitute' / 'unpaid'
  special_policy_code TEXT,         -- type='special'のみ
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  duration_type TEXT NOT NULL,      -- 'full' / 'half_am' / 'half_pm' / 'hourly'
  hours_used REAL,                  -- 'hourly'のみ
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'pending',  -- 'pending' / 'approved' / 'rejected' / 'cancelled'
  approver_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  approved_at TEXT,
  rejection_reason TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now', '+9 hours')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now', '+9 hours'))
);
CREATE INDEX IF NOT EXISTS idx_leave_requests_user ON leave_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_leave_requests_status ON leave_requests(status);
CREATE INDEX IF NOT EXISTS idx_leave_requests_approver ON leave_requests(approver_id);

-- ===== Phase 3a: クルー管理機能（2026-04-26 要件定義） =====
-- 詳細: docs/phase3a_requirements.md

-- 自治体マスタ（freee タグの自治体名と一致させる）
CREATE TABLE IF NOT EXISTS municipalities (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  prefecture TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now', '+9 hours')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now', '+9 hours'))
);

CREATE INDEX IF NOT EXISTS idx_municipalities_name ON municipalities(name);

-- 投票所マスタ
CREATE TABLE IF NOT EXISTS polling_stations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  municipality_id INTEGER NOT NULL REFERENCES municipalities(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  address TEXT,
  latitude REAL,
  longitude REAL,
  -- 将来 UniGuide-prod と連携時の参照ID（NULL OK）
  uniguide_polling_id TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now', '+9 hours')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now', '+9 hours')),
  UNIQUE(municipality_id, name)
);

CREATE INDEX IF NOT EXISTS idx_polling_stations_municipality
  ON polling_stations(municipality_id);

-- 役割マスタ（一般・庶務・現場マネージャー）
CREATE TABLE IF NOT EXISTS roles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  is_default INTEGER NOT NULL DEFAULT 0,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now', '+9 hours'))
);

-- 役割シード（重複投入は UNIQUE(name) で防止）
INSERT OR IGNORE INTO roles (name, description, is_default, display_order) VALUES
  ('一般', '用紙交付・名簿対照・受付・案内整理を回しながら担当', 1, 1),
  ('庶務', '事務作業・備品管理・記録', 1, 2),
  ('現場マネージャー', '投票所責任者・クルーの代行打刻可', 1, 3);

-- 案件マスタ（自治体×選挙日。同日複数選挙は1案件にまとめる）
CREATE TABLE IF NOT EXISTS elections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  municipality_id INTEGER NOT NULL REFERENCES municipalities(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  election_date TEXT NOT NULL,
  prevoting_start_date TEXT,
  prevoting_end_date TEXT,
  status TEXT NOT NULL DEFAULT 'planning',
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now', '+9 hours')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now', '+9 hours'))
);

CREATE INDEX IF NOT EXISTS idx_elections_municipality ON elections(municipality_id);
CREATE INDEX IF NOT EXISTS idx_elections_date ON elections(election_date);
CREATE INDEX IF NOT EXISTS idx_elections_status ON elections(status);

-- 案件×役割 標準時給
CREATE TABLE IF NOT EXISTS election_role_rates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  election_id INTEGER NOT NULL REFERENCES elections(id) ON DELETE CASCADE,
  role_id INTEGER NOT NULL REFERENCES roles(id) ON DELETE RESTRICT,
  hourly_rate INTEGER NOT NULL,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now', '+9 hours')),
  UNIQUE(election_id, role_id)
);

CREATE INDEX IF NOT EXISTS idx_election_role_rates_election
  ON election_role_rates(election_id);

-- 必要人数定義（投票所・日付・フェーズ・シフト・役割ごとの必要人数）
CREATE TABLE IF NOT EXISTS election_staffing_requirements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  election_id INTEGER NOT NULL REFERENCES elections(id) ON DELETE CASCADE,
  polling_station_id INTEGER NOT NULL REFERENCES polling_stations(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  phase TEXT NOT NULL,
  shift_type TEXT NOT NULL,
  role_id INTEGER NOT NULL REFERENCES roles(id) ON DELETE RESTRICT,
  required_count INTEGER NOT NULL,
  scheduled_start TEXT,
  scheduled_end TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now', '+9 hours')),
  UNIQUE(election_id, polling_station_id, date, phase, shift_type, role_id)
);

CREATE INDEX IF NOT EXISTS idx_staffing_election ON election_staffing_requirements(election_id);
CREATE INDEX IF NOT EXISTS idx_staffing_date ON election_staffing_requirements(date);

-- クループロフィール（user_id をPKに使う 1対1）
CREATE TABLE IF NOT EXISTS crew_profiles (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  registration_status TEXT NOT NULL DEFAULT 'active',
  registered_at TEXT NOT NULL DEFAULT (datetime('now', '+9 hours')),
  default_role_id INTEGER REFERENCES roles(id) ON DELETE SET NULL,
  has_election_day_experience INTEGER NOT NULL DEFAULT 0,
  has_prevoting_experience INTEGER NOT NULL DEFAULT 0,
  has_counting_experience INTEGER NOT NULL DEFAULT 0,
  -- 1出勤あたりの交通費（円）
  transportation_unit_cost INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now', '+9 hours')),
  -- 当社研修の受講状況（not_started / in_progress / completed）
  training_status TEXT NOT NULL DEFAULT 'not_started',
  training_completed_at TEXT,
  training_notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_crew_profiles_status ON crew_profiles(registration_status);

-- 稼働可能自治体（クルー×自治体 N対N）
CREATE TABLE IF NOT EXISTS crew_available_municipalities (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  municipality_id INTEGER NOT NULL REFERENCES municipalities(id) ON DELETE CASCADE,
  registered_at TEXT NOT NULL DEFAULT (datetime('now', '+9 hours')),
  UNIQUE(user_id, municipality_id)
);

CREATE INDEX IF NOT EXISTS idx_crew_avail_user ON crew_available_municipalities(user_id);
CREATE INDEX IF NOT EXISTS idx_crew_avail_municipality
  ON crew_available_municipalities(municipality_id);

-- 経験役割（クルー×役割 N対N）
CREATE TABLE IF NOT EXISTS crew_experienced_roles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_id INTEGER NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  registered_at TEXT NOT NULL DEFAULT (datetime('now', '+9 hours')),
  UNIQUE(user_id, role_id)
);

CREATE INDEX IF NOT EXISTS idx_crew_exp_roles_user ON crew_experienced_roles(user_id);
CREATE INDEX IF NOT EXISTS idx_crew_exp_roles_role ON crew_experienced_roles(role_id);

-- シフト希望（クルー本人入力）
CREATE TABLE IF NOT EXISTS shift_preferences (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  election_id INTEGER NOT NULL REFERENCES elections(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  -- full_day / first_half / second_half / unavailable
  preference TEXT NOT NULL,
  notes TEXT,
  submitted_at TEXT NOT NULL DEFAULT (datetime('now', '+9 hours')),
  UNIQUE(election_id, user_id, date)
);

CREATE INDEX IF NOT EXISTS idx_shift_pref_election ON shift_preferences(election_id);
CREATE INDEX IF NOT EXISTS idx_shift_pref_user ON shift_preferences(user_id);
CREATE INDEX IF NOT EXISTS idx_shift_pref_date ON shift_preferences(date);

-- シフト確定（半日交代の場合は1日2レコード許容）
CREATE TABLE IF NOT EXISTS crew_shifts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  election_id INTEGER NOT NULL REFERENCES elections(id) ON DELETE CASCADE,
  polling_station_id INTEGER NOT NULL REFERENCES polling_stations(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_id INTEGER NOT NULL REFERENCES roles(id) ON DELETE RESTRICT,
  date TEXT NOT NULL,
  phase TEXT NOT NULL,
  shift_type TEXT NOT NULL,
  scheduled_start TEXT NOT NULL,
  scheduled_end TEXT NOT NULL,
  -- election_role_rates から自動セット、上書き可能
  hourly_rate INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'confirmed',
  cancellation_reason TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now', '+9 hours')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now', '+9 hours')),
  UNIQUE(election_id, user_id, date, shift_type)
);

CREATE INDEX IF NOT EXISTS idx_crew_shifts_election ON crew_shifts(election_id);
CREATE INDEX IF NOT EXISTS idx_crew_shifts_user ON crew_shifts(user_id);
CREATE INDEX IF NOT EXISTS idx_crew_shifts_polling ON crew_shifts(polling_station_id);
CREATE INDEX IF NOT EXISTS idx_crew_shifts_date ON crew_shifts(date);

-- 通知センター（UniTime内通知 + メール送信ステータス）
CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  related_election_id INTEGER REFERENCES elections(id) ON DELETE SET NULL,
  related_shift_id INTEGER REFERENCES crew_shifts(id) ON DELETE SET NULL,
  is_read INTEGER NOT NULL DEFAULT 0,
  email_sent_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now', '+9 hours')),
  read_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_unread
  ON notifications(user_id, is_read);
CREATE INDEX IF NOT EXISTS idx_notifications_created
  ON notifications(created_at);
