import { createClient } from "@libsql/client";

const url = process.env.TURSO_DATABASE_URL ?? "file:./unitime.db";
const authToken = process.env.TURSO_AUTH_TOKEN;
const db = createClient({ url, authToken });

console.log(`📂 DB: ${url}`);

const info = await db.execute("PRAGMA table_info(users)");
const hasLat = info.rows.some((r) => r.name === "home_latitude");
const hasLng = info.rows.some((r) => r.name === "home_longitude");

if (hasLat && hasLng) {
  console.log("✅ home_latitude / home_longitude は既に存在します。スキップ");
} else {
  if (!hasLat) {
    await db.execute("ALTER TABLE users ADD COLUMN home_latitude REAL");
    console.log("✅ home_latitude カラムを追加");
  }
  if (!hasLng) {
    await db.execute("ALTER TABLE users ADD COLUMN home_longitude REAL");
    console.log("✅ home_longitude カラムを追加");
  }
}

process.exit(0);
