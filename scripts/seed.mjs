import { createClient } from "@libsql/client";
import { createHash, randomBytes } from "crypto";

const url = process.env.TURSO_DATABASE_URL ?? "file:./unitime.db";
const authToken = process.env.TURSO_AUTH_TOKEN;
const db = createClient({ url, authToken });

function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  const hash = createHash("sha256").update(salt + password).digest("hex");
  return `${salt}:${hash}`;
}

const DEFAULT_PASSWORD = "unitime2026";

const users = [
  {
    login_id: "minami",
    name: "見波 祐哉",
    email: "yuya.minami@unipoll.co.jp",
    employment_type: "executive",
    role: "owner",
    salary_type: null,
    monthly_salary: null,
    hire_date: "2025-04-01",
  },
  {
    login_id: "watanabe",
    name: "渡邉 ひかり",
    email: null,
    employment_type: "employee",
    role: "member",
    salary_type: "monthly",
    monthly_salary: 350000,
    hire_date: "2025-06-01",
  },
];

console.log(`📂 DB: ${url}`);
console.log(`👥 Seeding ${users.length} users (default password: ${DEFAULT_PASSWORD})...`);

for (const u of users) {
  const existing = await db.execute({
    sql: "SELECT id FROM users WHERE login_id = ?",
    args: [u.login_id],
  });

  if (existing.rows.length > 0) {
    console.log(`  ⏭  ${u.login_id} already exists, skipping`);
    continue;
  }

  await db.execute({
    sql: `INSERT INTO users (login_id, password_hash, name, email, employment_type, role, salary_type, monthly_salary, hire_date)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      u.login_id,
      hashPassword(DEFAULT_PASSWORD),
      u.name,
      u.email,
      u.employment_type,
      u.role,
      u.salary_type,
      u.monthly_salary,
      u.hire_date,
    ],
  });

  console.log(`  ✅ Created: ${u.name} (${u.login_id})`);
}

console.log("✅ Seed complete");
console.log(`\n🔑 初期パスワード: ${DEFAULT_PASSWORD}`);
console.log("   ログイン後に各自変更してください");
process.exit(0);
