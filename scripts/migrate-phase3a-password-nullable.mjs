// Phase 3a S1.4: users.password_hash を NULLABLE 化
//
// 背景: SQLite は ALTER TABLE で NOT NULL を外せないため、
// SQLite 公式の "table redefinition" 手順に従ってテーブル再作成を行う。
// https://www.sqlite.org/lang_altertable.html#otheralter
//
// 安全策:
//   1. 既存DDLを sqlite_master から取得し、`password_hash TEXT NOT NULL` を `password_hash TEXT` に
//      置換することで、ローカル/本番のスキーマ差（home_latitude/longitude の有無等）を吸収。
//   2. PRAGMA foreign_keys=OFF してから子テーブル(attendance_records 等)のFKを破壊せずに RENAME。
//   3. トランザクション内で CREATE_NEW → INSERT → DROP_OLD → RENAME を atomic に実行。
//   4. 完了後に件数比較 + PRAGMA foreign_key_check で参照整合性を検査。
//   5. 既に NULLABLE 化済みなら即スキップ（冪等）。

import { createClient } from "@libsql/client";

const url = process.env.TURSO_DATABASE_URL ?? "file:./unitime.db";
const authToken = process.env.TURSO_AUTH_TOKEN;
const db = createClient({ url, authToken });

console.log(`📂 DB: ${url}`);

// 1. 既存DDLを取得
const ddlRow = await db.execute(
  "SELECT sql FROM sqlite_master WHERE type='table' AND name='users'"
);
if (ddlRow.rows.length === 0) {
  console.error("❌ users テーブルが存在しません");
  process.exit(1);
}
const oldDdl = ddlRow.rows[0].sql;

// 2. 既に NULLABLE 化済みか判定（冪等）
if (!oldDdl.includes("password_hash TEXT NOT NULL")) {
  console.log("✅ password_hash は既に NULLABLE です（スキップ）");
  process.exit(0);
}

// 3. 新DDL構築: 文字列置換のみ。他のNOT NULL（login_id, name, employment_type等）はそのまま温存
const newDdl = oldDdl
  .replace("password_hash TEXT NOT NULL", "password_hash TEXT")
  .replace(/^CREATE TABLE users\b/, "CREATE TABLE users_new");

console.log("📝 新DDL preview:");
console.log(newDdl);
console.log("");

// 4. 全カラム名取得（INSERT で順序を明示するため）
const cols = await db.execute("PRAGMA table_info(users)");
const colNames = cols.rows.map((r) => r.name).join(", ");
console.log(`📋 移行カラム (${cols.rows.length}個): ${colNames}\n`);

// 5. 移行前件数
const beforeCount = Number(
  (await db.execute("SELECT COUNT(*) as c FROM users")).rows[0].c
);
console.log(`👥 移行前件数: ${beforeCount} 件`);

// 6. PRAGMA foreign_keys = OFF（子テーブルのFKを名前ベースで温存するため）
await db.execute("PRAGMA foreign_keys = OFF");
console.log("🔒 PRAGMA foreign_keys = OFF\n");

// 7. トランザクション内で CREATE → INSERT → DROP → RENAME
const tx = await db.transaction("write");
try {
  await tx.execute(newDdl);
  console.log("  ✅ users_new 作成");
  await tx.execute(
    `INSERT INTO users_new (${colNames}) SELECT ${colNames} FROM users`
  );
  console.log("  ✅ データコピー完了");
  await tx.execute("DROP TABLE users");
  console.log("  ✅ 旧 users をドロップ");
  await tx.execute("ALTER TABLE users_new RENAME TO users");
  console.log("  ✅ users_new → users にリネーム");
  await tx.commit();
  console.log("  ✅ トランザクションコミット\n");
} catch (e) {
  await tx.rollback();
  await db.execute("PRAGMA foreign_keys = ON");
  console.error("❌ トランザクション失敗・ロールバック実行:", e);
  process.exit(1);
}

// 8. PRAGMA foreign_keys = ON
await db.execute("PRAGMA foreign_keys = ON");
console.log("🔓 PRAGMA foreign_keys = ON");

// 9. 検証: 件数一致
const afterCount = Number(
  (await db.execute("SELECT COUNT(*) as c FROM users")).rows[0].c
);
console.log(`👥 移行後件数: ${afterCount} 件`);
if (beforeCount !== afterCount) {
  console.error(`❌ 件数不一致! before=${beforeCount} after=${afterCount}`);
  process.exit(1);
}
console.log("  ✅ 件数一致");

// 10. 検証: password_hash が NULLABLE になっているか
const newInfo = await db.execute("PRAGMA table_info(users)");
const pwCol = newInfo.rows.find((r) => r.name === "password_hash");
if (!pwCol) {
  console.error("❌ password_hash カラムが消えました");
  process.exit(1);
}
if (pwCol.notnull !== 0) {
  console.error(`❌ password_hash がまだ notnull=${pwCol.notnull}`);
  process.exit(1);
}
console.log("  ✅ password_hash は NULLABLE になりました (notnull=0)");

// 11. 検証: 他のNOT NULL制約が温存されているか（login_id / name / employment_type / role / status / standard_work_minutes）
const expectedNotNull = ["login_id", "name", "employment_type", "role", "status", "standard_work_minutes"];
let allOk = true;
for (const colName of expectedNotNull) {
  const c = newInfo.rows.find((r) => r.name === colName);
  if (!c) {
    console.warn(`  ⚠️  ${colName} が存在しません`);
    allOk = false;
    continue;
  }
  if (c.notnull !== 1) {
    console.error(`  ❌ ${colName} のNOT NULLが失われた (notnull=${c.notnull})`);
    allOk = false;
  }
}
if (allOk) console.log("  ✅ 他のNOT NULL制約は温存");

// 12. 検証: UNIQUE制約 (login_id) が残っているか
const idx = await db.execute(
  "SELECT name FROM sqlite_master WHERE tbl_name='users' AND type='index'"
);
const hasAutoindex = idx.rows.some((r) => r.name.startsWith("sqlite_autoindex_users"));
console.log(`  ${hasAutoindex ? "✅" : "❌"} login_id UNIQUE インデックスは ${hasAutoindex ? "存在" : "失われた"}`);

// 13. 検証: PRAGMA foreign_key_check
const fkCheck = await db.execute("PRAGMA foreign_key_check");
if (fkCheck.rows.length === 0) {
  console.log("  ✅ FK 整合性チェック: 違反なし");
} else {
  console.error(`  ❌ FK 違反 ${fkCheck.rows.length}件:`);
  for (const r of fkCheck.rows) console.error("    ", r);
  process.exit(1);
}

// 14. 検証: 既存データのサンプルが正しく残っているか
const sample = await db.execute("SELECT id, login_id, name, password_hash IS NULL as pw_null FROM users ORDER BY id LIMIT 5");
console.log("\n📑 サンプル (先頭5件):");
for (const r of sample.rows) {
  console.log(`  ${r.id}. ${r.login_id} (${r.name}, pw_null=${r.pw_null})`);
}

console.log("\n✅ Phase 3a S1.4 完了 (password_hash → NULLABLE)");
process.exit(0);
