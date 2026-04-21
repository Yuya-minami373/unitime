import { createClient } from "@libsql/client";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const schemaPath = join(__dirname, "..", "src", "lib", "schema.sql");

const url = process.env.TURSO_DATABASE_URL ?? "file:./unitime.db";
const authToken = process.env.TURSO_AUTH_TOKEN;

const db = createClient({ url, authToken });
const rawSchema = readFileSync(schemaPath, "utf8");

// コメント行（-- で始まる行）を除去してからセミコロンで分割
const schema = rawSchema
  .split("\n")
  .filter((line) => !line.trim().startsWith("--"))
  .join("\n");

const statements = schema
  .split(";")
  .map((s) => s.trim())
  .filter((s) => s.length > 0);

console.log(`📂 DB: ${url}`);
console.log(`📝 Executing ${statements.length} statements...`);

for (const stmt of statements) {
  await db.execute(stmt);
  const firstLine = stmt.split("\n")[0].slice(0, 60);
  console.log(`  ✅ ${firstLine}...`);
}

console.log("✅ DB initialization complete");
process.exit(0);
