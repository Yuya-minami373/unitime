// Phase 3a S1.1: 新規11テーブルの追加マイグレーション
//
// 対象テーブル:
//   1. municipalities                       自治体マスタ
//   2. polling_stations                     投票所マスタ
//   3. roles                                役割マスタ（シード3件含む）
//   4. elections                            案件マスタ
//   5. election_role_rates                  案件×役割 標準時給
//   6. election_staffing_requirements       必要人数定義
//   7. crew_profiles                        クループロフィール
//   8. crew_available_municipalities        稼働可能自治体（N対N）
//   9. shift_preferences                    シフト希望
//  10. crew_shifts                          シフト確定
//  11. notifications                        通知センター
//
// 全て CREATE TABLE IF NOT EXISTS / CREATE INDEX IF NOT EXISTS で冪等。
// roles のシードは 1度だけ INSERT（既存件数チェックで多重投入回避）。
// datetime デフォルトは既存テーブル(users, attendance_records)に合わせて '+9 hours' 付き JST。

import { createClient } from "@libsql/client";

const url = process.env.TURSO_DATABASE_URL ?? "file:./unitime.db";
const authToken = process.env.TURSO_AUTH_TOKEN;
const db = createClient({ url, authToken });

console.log(`📂 DB: ${url}`);

const statements = [
  // 1. municipalities
  `CREATE TABLE IF NOT EXISTS municipalities (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     name TEXT NOT NULL UNIQUE,
     prefecture TEXT,
     notes TEXT,
     created_at TEXT NOT NULL DEFAULT (datetime('now', '+9 hours')),
     updated_at TEXT NOT NULL DEFAULT (datetime('now', '+9 hours'))
   )`,
  `CREATE INDEX IF NOT EXISTS idx_municipalities_name ON municipalities(name)`,

  // 2. polling_stations
  `CREATE TABLE IF NOT EXISTS polling_stations (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     municipality_id INTEGER NOT NULL REFERENCES municipalities(id) ON DELETE CASCADE,
     name TEXT NOT NULL,
     address TEXT,
     latitude REAL,
     longitude REAL,
     uniguide_polling_id TEXT,
     is_active INTEGER NOT NULL DEFAULT 1,
     notes TEXT,
     created_at TEXT NOT NULL DEFAULT (datetime('now', '+9 hours')),
     updated_at TEXT NOT NULL DEFAULT (datetime('now', '+9 hours')),
     UNIQUE(municipality_id, name)
   )`,
  `CREATE INDEX IF NOT EXISTS idx_polling_stations_municipality ON polling_stations(municipality_id)`,

  // 3. roles
  `CREATE TABLE IF NOT EXISTS roles (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     name TEXT NOT NULL UNIQUE,
     description TEXT,
     is_default INTEGER NOT NULL DEFAULT 0,
     display_order INTEGER NOT NULL DEFAULT 0,
     created_at TEXT NOT NULL DEFAULT (datetime('now', '+9 hours'))
   )`,

  // 4. elections
  `CREATE TABLE IF NOT EXISTS elections (
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
   )`,
  `CREATE INDEX IF NOT EXISTS idx_elections_municipality ON elections(municipality_id)`,
  `CREATE INDEX IF NOT EXISTS idx_elections_date ON elections(election_date)`,
  `CREATE INDEX IF NOT EXISTS idx_elections_status ON elections(status)`,

  // 5. election_role_rates
  `CREATE TABLE IF NOT EXISTS election_role_rates (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     election_id INTEGER NOT NULL REFERENCES elections(id) ON DELETE CASCADE,
     role_id INTEGER NOT NULL REFERENCES roles(id) ON DELETE RESTRICT,
     hourly_rate INTEGER NOT NULL,
     notes TEXT,
     created_at TEXT NOT NULL DEFAULT (datetime('now', '+9 hours')),
     UNIQUE(election_id, role_id)
   )`,
  `CREATE INDEX IF NOT EXISTS idx_election_role_rates_election ON election_role_rates(election_id)`,

  // 6. election_staffing_requirements
  `CREATE TABLE IF NOT EXISTS election_staffing_requirements (
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
   )`,
  `CREATE INDEX IF NOT EXISTS idx_staffing_election ON election_staffing_requirements(election_id)`,
  `CREATE INDEX IF NOT EXISTS idx_staffing_date ON election_staffing_requirements(date)`,

  // 7. crew_profiles
  `CREATE TABLE IF NOT EXISTS crew_profiles (
     user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
     registration_status TEXT NOT NULL DEFAULT 'active',
     registered_at TEXT NOT NULL DEFAULT (datetime('now', '+9 hours')),
     default_role_id INTEGER REFERENCES roles(id) ON DELETE SET NULL,
     has_election_day_experience INTEGER NOT NULL DEFAULT 0,
     has_prevoting_experience INTEGER NOT NULL DEFAULT 0,
     has_counting_experience INTEGER NOT NULL DEFAULT 0,
     transportation_unit_cost INTEGER NOT NULL DEFAULT 0,
     notes TEXT,
     updated_at TEXT NOT NULL DEFAULT (datetime('now', '+9 hours'))
   )`,
  `CREATE INDEX IF NOT EXISTS idx_crew_profiles_status ON crew_profiles(registration_status)`,

  // 8. crew_available_municipalities
  `CREATE TABLE IF NOT EXISTS crew_available_municipalities (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     municipality_id INTEGER NOT NULL REFERENCES municipalities(id) ON DELETE CASCADE,
     registered_at TEXT NOT NULL DEFAULT (datetime('now', '+9 hours')),
     UNIQUE(user_id, municipality_id)
   )`,
  `CREATE INDEX IF NOT EXISTS idx_crew_avail_user ON crew_available_municipalities(user_id)`,
  `CREATE INDEX IF NOT EXISTS idx_crew_avail_municipality ON crew_available_municipalities(municipality_id)`,

  // 9. shift_preferences
  `CREATE TABLE IF NOT EXISTS shift_preferences (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     election_id INTEGER NOT NULL REFERENCES elections(id) ON DELETE CASCADE,
     user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     date TEXT NOT NULL,
     preference TEXT NOT NULL,
     notes TEXT,
     submitted_at TEXT NOT NULL DEFAULT (datetime('now', '+9 hours')),
     UNIQUE(election_id, user_id, date)
   )`,
  `CREATE INDEX IF NOT EXISTS idx_shift_pref_election ON shift_preferences(election_id)`,
  `CREATE INDEX IF NOT EXISTS idx_shift_pref_user ON shift_preferences(user_id)`,
  `CREATE INDEX IF NOT EXISTS idx_shift_pref_date ON shift_preferences(date)`,

  // 10. crew_shifts
  `CREATE TABLE IF NOT EXISTS crew_shifts (
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
     hourly_rate INTEGER NOT NULL,
     status TEXT NOT NULL DEFAULT 'confirmed',
     cancellation_reason TEXT,
     notes TEXT,
     created_at TEXT NOT NULL DEFAULT (datetime('now', '+9 hours')),
     updated_at TEXT NOT NULL DEFAULT (datetime('now', '+9 hours')),
     UNIQUE(election_id, user_id, date, shift_type)
   )`,
  `CREATE INDEX IF NOT EXISTS idx_crew_shifts_election ON crew_shifts(election_id)`,
  `CREATE INDEX IF NOT EXISTS idx_crew_shifts_user ON crew_shifts(user_id)`,
  `CREATE INDEX IF NOT EXISTS idx_crew_shifts_polling ON crew_shifts(polling_station_id)`,
  `CREATE INDEX IF NOT EXISTS idx_crew_shifts_date ON crew_shifts(date)`,

  // 11. notifications
  `CREATE TABLE IF NOT EXISTS notifications (
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
   )`,
  `CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON notifications(user_id, is_read)`,
  `CREATE INDEX IF NOT EXISTS idx_notifications_created ON notifications(created_at)`,
];

console.log(`📝 Executing ${statements.length} statements...`);
for (const stmt of statements) {
  await db.execute(stmt);
  const head = stmt.split("\n")[0].slice(0, 70).trim();
  console.log(`  ✅ ${head}`);
}

// roles シード（既存件数0のときだけ投入）
const rolesCount = await db.execute("SELECT COUNT(*) as c FROM roles");
if (Number(rolesCount.rows[0].c) === 0) {
  console.log("🌱 roles シード投入...");
  await db.execute({
    sql: "INSERT INTO roles (name, description, is_default, display_order) VALUES (?, ?, 1, 1)",
    args: ["一般", "用紙交付・名簿対照・受付・案内整理を回しながら担当"],
  });
  await db.execute({
    sql: "INSERT INTO roles (name, description, is_default, display_order) VALUES (?, ?, 1, 2)",
    args: ["庶務", "事務作業・備品管理・記録"],
  });
  await db.execute({
    sql: "INSERT INTO roles (name, description, is_default, display_order) VALUES (?, ?, 1, 3)",
    args: ["現場マネージャー", "投票所責任者・クルーの代行打刻可"],
  });
  console.log("  ✅ 一般 / 庶務 / 現場マネージャー を投入");
} else {
  console.log(`✅ roles は既に ${rolesCount.rows[0].c} 件あります（シードスキップ）`);
}

console.log("✅ Phase 3a S1.1 (新規11テーブル) マイグレーション完了");
process.exit(0);
