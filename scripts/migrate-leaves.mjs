// 休暇申請ワークフロー (Phase B #2-A)
//
// 追加内容:
//   1. special_leave_policies   特別休暇の規程マスタ（結婚・忌引・配偶者出産 等）
//   2. leave_grants             付与履歴（有給は法定通り auto / 特別は申請時 manual）
//   3. leave_requests           申請履歴
//   + 規程デフォルト値を INSERT OR IGNORE でシード
//
// 残日数 = SUM(leave_grants.granted_days) - SUM(approved leave_requests in days)
// 年度概念は granted_at の年（YYYY-）を使ってアプリ側で集計する。

import { createClient } from "@libsql/client";

const url = process.env.TURSO_DATABASE_URL ?? "file:./unitime.db";
const authToken = process.env.TURSO_AUTH_TOKEN;
const db = createClient({ url, authToken });

console.log(`📂 DB: ${url}`);

await db.execute(`
  CREATE TABLE IF NOT EXISTS special_leave_policies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    default_days REAL NOT NULL,
    description TEXT,
    is_active INTEGER NOT NULL DEFAULT 1,
    display_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now', '+9 hours'))
  )
`);
console.log("✅ special_leave_policies");

await db.execute(`
  CREATE TABLE IF NOT EXISTS leave_grants (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    leave_type TEXT NOT NULL,
    special_policy_code TEXT,
    granted_days REAL NOT NULL,
    granted_at TEXT NOT NULL,
    source TEXT NOT NULL DEFAULT 'manual',
    notes TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now', '+9 hours'))
  )
`);
await db.execute(
  `CREATE INDEX IF NOT EXISTS idx_leave_grants_user ON leave_grants(user_id)`,
);
await db.execute(
  `CREATE INDEX IF NOT EXISTS idx_leave_grants_at ON leave_grants(granted_at)`,
);
console.log("✅ leave_grants");

await db.execute(`
  CREATE TABLE IF NOT EXISTS leave_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    leave_type TEXT NOT NULL,
    special_policy_code TEXT,
    start_date TEXT NOT NULL,
    end_date TEXT NOT NULL,
    duration_type TEXT NOT NULL,
    hours_used REAL,
    reason TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    approver_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    approved_at TEXT,
    rejection_reason TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now', '+9 hours')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now', '+9 hours'))
  )
`);
await db.execute(
  `CREATE INDEX IF NOT EXISTS idx_leave_requests_user ON leave_requests(user_id)`,
);
await db.execute(
  `CREATE INDEX IF NOT EXISTS idx_leave_requests_status ON leave_requests(status)`,
);
await db.execute(
  `CREATE INDEX IF NOT EXISTS idx_leave_requests_approver ON leave_requests(approver_id)`,
);
console.log("✅ leave_requests");

// 特別休暇規程シード
const policies = [
  ["marriage", "結婚休暇", 5, "本人の結婚時に付与", 1],
  ["funeral_1st", "忌引（1親等）", 5, "父母・配偶者・子の忌引", 2],
  ["funeral_2nd", "忌引（2親等）", 3, "祖父母・兄弟姉妹・配偶者の父母", 3],
  ["funeral_3rd", "忌引（3親等）", 1, "おじ・おば・甥姪・配偶者の祖父母兄弟", 4],
  ["birth", "配偶者出産休暇", 3, "配偶者の出産時", 5],
  ["jury", "裁判員・公務", 0, "実日数。0=実日数（申請時に日数指定）", 6],
  ["disaster", "災害特別休暇", 0, "実日数（申請時に日数指定）", 7],
];
let inserted = 0;
let skipped = 0;
for (const [code, name, days, desc, order] of policies) {
  const result = await db.execute({
    sql: `INSERT OR IGNORE INTO special_leave_policies
            (code, name, default_days, description, display_order)
          VALUES (?, ?, ?, ?, ?)`,
    args: [code, name, days, desc, order],
  });
  if (result.rowsAffected > 0) inserted++;
  else skipped++;
}
console.log(`✅ 規程シード: ${inserted} 件追加 / ${skipped} 件スキップ`);

console.log("\n✅ 休暇申請ワークフロー（Phase B #2-A）DB セットアップ完了");
process.exit(0);
