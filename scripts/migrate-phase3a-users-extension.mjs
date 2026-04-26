// Phase 3a S1.2: users テーブル拡張
//
// 追加カラム:
//   - phone               TEXT     電話番号
//   - postal_code         TEXT     郵便番号
//   - address             TEXT     住所
//   - emergency_contact   TEXT     緊急連絡先（氏名・続柄・電話番号などを自由記述）
//
// 既存パターン (migrate-home-location.mjs) に倣い、カラム存在チェック→ALTER で冪等。
// ※ password_hash の NULLABLE 化は別マイグレーション (S1.4) で実施する。

import { createClient } from "@libsql/client";

const url = process.env.TURSO_DATABASE_URL ?? "file:./unitime.db";
const authToken = process.env.TURSO_AUTH_TOKEN;
const db = createClient({ url, authToken });

console.log(`📂 DB: ${url}`);

const newColumns = [
  { name: "phone", type: "TEXT" },
  { name: "postal_code", type: "TEXT" },
  { name: "address", type: "TEXT" },
  { name: "emergency_contact", type: "TEXT" },
];

const info = await db.execute("PRAGMA table_info(users)");
const existing = new Set(info.rows.map((r) => r.name));

let added = 0;
let skipped = 0;
for (const col of newColumns) {
  if (existing.has(col.name)) {
    console.log(`✅ ${col.name} は既に存在します（スキップ）`);
    skipped++;
  } else {
    await db.execute(`ALTER TABLE users ADD COLUMN ${col.name} ${col.type}`);
    console.log(`✅ ${col.name} カラムを追加`);
    added++;
  }
}

console.log(`\n✅ Phase 3a S1.2 完了 (追加: ${added} / スキップ: ${skipped})`);
process.exit(0);
