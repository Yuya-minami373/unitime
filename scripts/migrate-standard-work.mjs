import { createClient } from "@libsql/client";

const url = process.env.TURSO_DATABASE_URL ?? "file:./unitime.db";
const authToken = process.env.TURSO_AUTH_TOKEN;
const db = createClient({ url, authToken });

console.log(`📂 DB: ${url}`);

// 既存カラム確認
const info = await db.execute("PRAGMA table_info(users)");
const hasColumn = info.rows.some((r) => r.name === "standard_work_minutes");

if (hasColumn) {
  console.log("✅ standard_work_minutes は既に存在します。スキップ");
} else {
  await db.execute(
    "ALTER TABLE users ADD COLUMN standard_work_minutes INTEGER NOT NULL DEFAULT 435",
  );
  console.log("✅ standard_work_minutes カラムを追加（既存ユーザーは 435分 = 7h15m）");
}

process.exit(0);
