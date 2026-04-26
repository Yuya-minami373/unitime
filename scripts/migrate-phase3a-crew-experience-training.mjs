// Phase 3a 追加: クルー経験役割 + 研修ステータス
//
// 追加内容:
//   1. crew_profiles に研修関連カラム追加
//      - training_status         TEXT  DEFAULT 'not_started'  (not_started/in_progress/completed)
//      - training_completed_at   TEXT                          (受講完了日 YYYY-MM-DD)
//      - training_notes          TEXT                          (任意・メモ)
//   2. crew_experienced_roles テーブル新設（user_id × role_id N対N）
//
// 全て IF NOT EXISTS / カラム存在チェックで冪等。

import { createClient } from "@libsql/client";

const url = process.env.TURSO_DATABASE_URL ?? "file:./unitime.db";
const authToken = process.env.TURSO_AUTH_TOKEN;
const db = createClient({ url, authToken });

console.log(`📂 DB: ${url}`);

// 1. crew_profiles 拡張
const newColumns = [
  { name: "training_status", type: "TEXT NOT NULL DEFAULT 'not_started'" },
  { name: "training_completed_at", type: "TEXT" },
  { name: "training_notes", type: "TEXT" },
];

const profilesInfo = await db.execute("PRAGMA table_info(crew_profiles)");
const existing = new Set(profilesInfo.rows.map((r) => r.name));

let added = 0;
let skipped = 0;
for (const col of newColumns) {
  if (existing.has(col.name)) {
    console.log(`✅ crew_profiles.${col.name} は既に存在します（スキップ）`);
    skipped++;
  } else {
    await db.execute(`ALTER TABLE crew_profiles ADD COLUMN ${col.name} ${col.type}`);
    console.log(`✅ crew_profiles.${col.name} カラムを追加`);
    added++;
  }
}

// 2. crew_experienced_roles 新規作成
await db.execute(`
  CREATE TABLE IF NOT EXISTS crew_experienced_roles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role_id INTEGER NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    registered_at TEXT NOT NULL DEFAULT (datetime('now', '+9 hours')),
    UNIQUE(user_id, role_id)
  )
`);
await db.execute(
  `CREATE INDEX IF NOT EXISTS idx_crew_exp_roles_user ON crew_experienced_roles(user_id)`,
);
await db.execute(
  `CREATE INDEX IF NOT EXISTS idx_crew_exp_roles_role ON crew_experienced_roles(role_id)`,
);
console.log(`✅ crew_experienced_roles テーブル / インデックス を確認`);

console.log(
  `\n✅ 完了 (crew_profiles: 追加 ${added} / スキップ ${skipped} ・ crew_experienced_roles: OK)`,
);
process.exit(0);
