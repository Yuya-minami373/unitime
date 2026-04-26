// Phase 3a S1.3: attendance_records テーブル拡張
//
// 追加カラム:
//   - crew_shift_id            INTEGER  紐付くクルーシフト（NULL OK）
//                              FK: crew_shifts(id) ON DELETE SET NULL
//   - registered_by_user_id    INTEGER  代行打刻者（本人打刻時は NULL or user_id と同値）
//                              FK: users(id) ON DELETE SET NULL
//
// 追加インデックス:
//   - idx_attendance_crew_shift ON attendance_records(crew_shift_id)
//
// 注意: SQLite は ALTER TABLE ADD COLUMN で REFERENCES 句を含む列を追加できる
// （その場合「テーブル定義の一部としての FK 宣言」となる）。新規行の整合性は確保される。

import { createClient } from "@libsql/client";

const url = process.env.TURSO_DATABASE_URL ?? "file:./unitime.db";
const authToken = process.env.TURSO_AUTH_TOKEN;
const db = createClient({ url, authToken });

console.log(`📂 DB: ${url}`);

const newColumns = [
  {
    name: "crew_shift_id",
    sql: "INTEGER REFERENCES crew_shifts(id) ON DELETE SET NULL",
  },
  {
    name: "registered_by_user_id",
    sql: "INTEGER REFERENCES users(id) ON DELETE SET NULL",
  },
];

// 前提: crew_shifts と users テーブルが存在すること
const tables = await db.execute(
  "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('crew_shifts', 'users')"
);
const tableNames = new Set(tables.rows.map((r) => r.name));
if (!tableNames.has("crew_shifts")) {
  console.error("❌ crew_shifts テーブルが存在しません。先に S1.1 を実行してください。");
  process.exit(1);
}
if (!tableNames.has("users")) {
  console.error("❌ users テーブルが存在しません。");
  process.exit(1);
}

const info = await db.execute("PRAGMA table_info(attendance_records)");
const existing = new Set(info.rows.map((r) => r.name));

let added = 0;
let skipped = 0;
for (const col of newColumns) {
  if (existing.has(col.name)) {
    console.log(`✅ ${col.name} は既に存在します（スキップ）`);
    skipped++;
  } else {
    await db.execute(`ALTER TABLE attendance_records ADD COLUMN ${col.name} ${col.sql}`);
    console.log(`✅ ${col.name} カラムを追加`);
    added++;
  }
}

await db.execute(
  "CREATE INDEX IF NOT EXISTS idx_attendance_crew_shift ON attendance_records(crew_shift_id)"
);
console.log("✅ idx_attendance_crew_shift インデックスを確認/作成");

console.log(`\n✅ Phase 3a S1.3 完了 (追加: ${added} / スキップ: ${skipped})`);
process.exit(0);
