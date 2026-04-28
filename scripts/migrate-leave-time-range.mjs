// 時間休の入力を「時間数」→「開始時刻+終了時刻」に変更
//
// leave_requests に以下を追加:
//   - start_time TEXT  HH:MM
//   - end_time   TEXT  HH:MM
//
// hours_used は引き続き保持（end-start から算出した値を保存）。
// 既存の half_am / half_pm レコードはそのまま（表示は互換ラベルで対応）。

import { createClient } from "@libsql/client";

const url = process.env.TURSO_DATABASE_URL ?? "file:./unitime.db";
const authToken = process.env.TURSO_AUTH_TOKEN;
const db = createClient({ url, authToken });

console.log(`📂 DB: ${url}`);

const cols = await db.execute(`PRAGMA table_info(leave_requests)`);
const existing = new Set(cols.rows.map((r) => r.name));

const additions = [
  { name: "start_time", sql: "TEXT" },
  { name: "end_time", sql: "TEXT" },
];

for (const col of additions) {
  if (existing.has(col.name)) {
    console.log(`⏭  ${col.name} は既に存在`);
    continue;
  }
  await db.execute(
    `ALTER TABLE leave_requests ADD COLUMN ${col.name} ${col.sql}`,
  );
  console.log(`✅ ${col.name} を追加`);
}

console.log("\n✅ leave_requests 時刻カラム追加完了");
process.exit(0);
