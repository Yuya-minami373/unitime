// Phase B #4: 36協定遵守監視
//
// notification_log テーブルを追加し、閾値到達時の重複通知を防止する。
// schema: (user_id, notification_type, target_period) UNIQUE
//
// idempotent: 既に存在する場合はスキップ

import { createClient } from "@libsql/client";

const url = process.env.TURSO_DATABASE_URL ?? "file:./unitime.db";
const authToken = process.env.TURSO_AUTH_TOKEN;
const db = createClient({ url, authToken });

console.log(`📂 DB: ${url}`);

await db.execute(`
  CREATE TABLE IF NOT EXISTS notification_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    notification_type TEXT NOT NULL,
    target_period TEXT NOT NULL,
    notified_at TEXT NOT NULL DEFAULT (datetime('now', '+9 hours')),
    UNIQUE(user_id, notification_type, target_period)
  )
`);
console.log(`✅ notification_log テーブル作成`);

await db.execute(`
  CREATE INDEX IF NOT EXISTS idx_notification_log_user
    ON notification_log(user_id, target_period)
`);
console.log(`✅ idx_notification_log_user`);

console.log("\n✅ Phase B #4 マイグレーション完了");
process.exit(0);
