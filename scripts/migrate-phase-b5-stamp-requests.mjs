// Phase B #5: 打刻申請・月締め機能
//
// 3 新規テーブル:
//   - stamp_requests: 打刻申請ワークフロー（add/modify/delete）
//   - punch_history:  監査ログ（修正前後を労基法109条で3年保存）
//   - monthly_closes: 月締め状態管理 + スナップショット
//
// idempotent: 既に存在する場合はスキップ

import { createClient } from "@libsql/client";

const url = process.env.TURSO_DATABASE_URL ?? "file:./unitime.db";
const authToken = process.env.TURSO_AUTH_TOKEN;
const db = createClient({ url, authToken });

console.log(`📂 DB: ${url}`);

// 1) stamp_requests
await db.execute(`
  CREATE TABLE IF NOT EXISTS stamp_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    request_kind TEXT NOT NULL DEFAULT 'forgot',
    action TEXT NOT NULL,
    target_business_day TEXT NOT NULL,
    punch_type TEXT NOT NULL,
    new_punched_at TEXT,
    target_record_id INTEGER REFERENCES attendance_records(id) ON DELETE SET NULL,
    previous_punched_at TEXT,
    reason TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    approver_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    approved_at TEXT,
    rejection_reason TEXT,
    cancelled_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now', '+9 hours')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now', '+9 hours'))
  )
`);
console.log(`✅ stamp_requests テーブル作成`);

await db.execute(
  `CREATE INDEX IF NOT EXISTS idx_stamp_requests_user ON stamp_requests(user_id)`,
);
await db.execute(
  `CREATE INDEX IF NOT EXISTS idx_stamp_requests_status ON stamp_requests(status)`,
);
await db.execute(
  `CREATE INDEX IF NOT EXISTS idx_stamp_requests_target_day ON stamp_requests(target_business_day)`,
);
console.log(`✅ stamp_requests インデックス`);

// 2) punch_history
await db.execute(`
  CREATE TABLE IF NOT EXISTS punch_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    attendance_record_id INTEGER,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    event TEXT NOT NULL,
    previous_punched_at TEXT,
    new_punched_at TEXT,
    previous_punch_type TEXT,
    new_punch_type TEXT,
    operated_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    source_request_id INTEGER REFERENCES stamp_requests(id) ON DELETE SET NULL,
    reason TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now', '+9 hours'))
  )
`);
console.log(`✅ punch_history テーブル作成`);

await db.execute(
  `CREATE INDEX IF NOT EXISTS idx_punch_history_user ON punch_history(user_id, created_at)`,
);
await db.execute(
  `CREATE INDEX IF NOT EXISTS idx_punch_history_record ON punch_history(attendance_record_id)`,
);
console.log(`✅ punch_history インデックス`);

// 3) monthly_closes
await db.execute(`
  CREATE TABLE IF NOT EXISTS monthly_closes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    target_month TEXT NOT NULL UNIQUE,
    status TEXT NOT NULL DEFAULT 'open',
    closed_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    closed_at TEXT,
    reopened_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    reopened_at TEXT,
    reopen_reason TEXT,
    summary_snapshot TEXT,
    notes TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now', '+9 hours')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now', '+9 hours'))
  )
`);
console.log(`✅ monthly_closes テーブル作成`);

await db.execute(
  `CREATE INDEX IF NOT EXISTS idx_monthly_closes_status ON monthly_closes(status)`,
);
console.log(`✅ monthly_closes インデックス`);

console.log("\n✅ Phase B #5 マイグレーション完了");
process.exit(0);
