// 休暇承認→attendance自動反映 (Phase B #2-B)
//
// attendance_records に以下を追加:
//   - kind          'work' (default) | 'leave'
//   - leave_minutes 休暇控除時間（分）。全休=480, 半休=240, 時間休=hours*60
//   - leave_request_id  leave_requests.id（CASCADEで削除連動）
//
// leave 行のフォーマット:
//   - punch_type = 'leave'
//   - punched_at = 該当業務日 00:00:00 JST（businessDayFromIsoで正しくマップされる）
//   - kind = 'leave'
//   - leave_request_id = 元のleave_requests.id
//
// idempotent: (user_id, leave_request_id, punched_at) の組で UNIQUE 化

import { createClient } from "@libsql/client";

const url = process.env.TURSO_DATABASE_URL ?? "file:./unitime.db";
const authToken = process.env.TURSO_AUTH_TOKEN;
const db = createClient({ url, authToken });

console.log(`📂 DB: ${url}`);

// 既存カラムを取得（追加済みかチェック）
const cols = await db.execute(`PRAGMA table_info(attendance_records)`);
const existing = new Set(cols.rows.map((r) => r.name));

const additions = [
  { name: "kind", sql: "TEXT NOT NULL DEFAULT 'work'" },
  { name: "leave_minutes", sql: "INTEGER NOT NULL DEFAULT 0" },
  {
    name: "leave_request_id",
    sql: "INTEGER REFERENCES leave_requests(id) ON DELETE CASCADE",
  },
];

for (const col of additions) {
  if (existing.has(col.name)) {
    console.log(`⏭  ${col.name} は既に存在`);
    continue;
  }
  await db.execute(`ALTER TABLE attendance_records ADD COLUMN ${col.name} ${col.sql}`);
  console.log(`✅ ${col.name} を追加`);
}

// 同じ申請から同じ業務日へ重複INSERTされないようインデックス
await db.execute(
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_attendance_leave_request_day
   ON attendance_records(leave_request_id, punched_at)
   WHERE leave_request_id IS NOT NULL`,
);
console.log(`✅ idx_attendance_leave_request_day`);

// 既存データ: kindがNULLのままだとフィルタが効きにくいので明示
const updateRes = await db.execute(
  `UPDATE attendance_records SET kind = 'work' WHERE kind IS NULL`,
);
console.log(`✅ 既存 ${updateRes.rowsAffected} 行を kind='work' に正規化`);

console.log("\n✅ Phase B #2-B attendance連携カラム追加完了");
process.exit(0);
