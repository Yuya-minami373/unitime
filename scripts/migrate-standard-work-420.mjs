// 所定労働時間の見直し: 435分(7h15m, 休憩45分) → 420分(7h, 休憩60分)
//
// 2026-04-28 祐哉さん再確認: 実際の休憩は12:00-13:00の1時間
// users.standard_work_minutes を 435 のものだけ 420 に更新する
// （個別に変更されているレコードは触らない）

import { createClient } from "@libsql/client";

const url = process.env.TURSO_DATABASE_URL ?? "file:./unitime.db";
const authToken = process.env.TURSO_AUTH_TOKEN;
const db = createClient({ url, authToken });

console.log(`📂 DB: ${url}`);

const before = await db.execute(
  `SELECT id, name, standard_work_minutes FROM users WHERE standard_work_minutes = 435`,
);
console.log(`対象 ${before.rows.length} 件:`);
for (const r of before.rows) {
  console.log(`  - id=${r.id} ${r.name} (${r.standard_work_minutes}分)`);
}

const result = await db.execute(
  `UPDATE users SET standard_work_minutes = 420 WHERE standard_work_minutes = 435`,
);
console.log(`✅ ${result.rowsAffected} 件を 420分 に更新`);

process.exit(0);
