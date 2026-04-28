// 法定有給休暇の自動付与（実行は手動・将来cron化）
//
// 動作:
//   1. employment_type='employee' かつ hire_date がある全ユーザーを取得
//   2. 各ユーザーの法定付与スケジュールを計算（入社6ヶ月後10日 → 1.5年後11日 → ... → 6.5年後20日 → 以降毎年20日）
//   3. asOf 以前の付与日について、leave_grants に未登録なら追加
//      （重複防止: user_id + leave_type='paid' + granted_at の組で存在チェック）
//
// 起動: node scripts/grant-paid-leave.mjs [YYYY-MM-DD]
//   引数なし: 今日基準。ある場合: その日付基準（過去のキャッチアップに使う）

import { createClient } from "@libsql/client";

const url = process.env.TURSO_DATABASE_URL ?? "file:./unitime.db";
const authToken = process.env.TURSO_AUTH_TOKEN;
const db = createClient({ url, authToken });

const arg = process.argv[2];
const today = arg ?? new Date().toISOString().slice(0, 10);
console.log(`📂 DB: ${url}`);
console.log(`📅 asOf: ${today}\n`);

const PAID_LEAVE_TABLE = [
  { yearsAfterHire: 0.5, days: 10 },
  { yearsAfterHire: 1.5, days: 11 },
  { yearsAfterHire: 2.5, days: 12 },
  { yearsAfterHire: 3.5, days: 14 },
  { yearsAfterHire: 4.5, days: 16 },
  { yearsAfterHire: 5.5, days: 18 },
  { yearsAfterHire: 6.5, days: 20 },
];

function paidLeaveSchedule(hireDate, asOfDate) {
  if (!hireDate) return [];
  const hire = new Date(`${hireDate}T00:00:00+09:00`);
  const asOf = new Date(`${asOfDate}T00:00:00+09:00`);
  if (Number.isNaN(hire.getTime()) || Number.isNaN(asOf.getTime())) return [];

  const result = [];
  for (const row of PAID_LEAVE_TABLE) {
    const grantDate = new Date(hire);
    grantDate.setMonth(grantDate.getMonth() + Math.round(row.yearsAfterHire * 12));
    if (grantDate > asOf) break;
    const ymd = `${grantDate.getFullYear()}-${String(grantDate.getMonth() + 1).padStart(2, "0")}-${String(grantDate.getDate()).padStart(2, "0")}`;
    result.push({ granted_at: ymd, days: row.days });
  }
  // 6.5年以降は毎年
  const last = result[result.length - 1];
  if (last && last.days === 20) {
    let nextDate = new Date(`${last.granted_at}T00:00:00+09:00`);
    while (true) {
      nextDate.setFullYear(nextDate.getFullYear() + 1);
      if (nextDate > asOf) break;
      const ymd = `${nextDate.getFullYear()}-${String(nextDate.getMonth() + 1).padStart(2, "0")}-${String(nextDate.getDate()).padStart(2, "0")}`;
      result.push({ granted_at: ymd, days: 20 });
    }
  }
  return result;
}

const usersRes = await db.execute({
  sql: `SELECT id, name, hire_date FROM users
        WHERE employment_type = 'employee' AND hire_date IS NOT NULL AND status = 'active'`,
  args: [],
});

let totalGranted = 0;
let totalSkipped = 0;
for (const u of usersRes.rows) {
  console.log(`👤 ${u.name} (id=${u.id}, hire=${u.hire_date})`);
  const schedule = paidLeaveSchedule(u.hire_date, today);
  if (schedule.length === 0) {
    console.log(`   ⏸  まだ付与日に達していません`);
    continue;
  }
  for (const item of schedule) {
    // 重複チェック
    const existRes = await db.execute({
      sql: `SELECT id FROM leave_grants
            WHERE user_id = ? AND leave_type = 'paid' AND granted_at = ?`,
      args: [u.id, item.granted_at],
    });
    if (existRes.rows.length > 0) {
      console.log(`   ⏭  ${item.granted_at}: +${item.days}日 (既存・スキップ)`);
      totalSkipped++;
      continue;
    }
    await db.execute({
      sql: `INSERT INTO leave_grants
              (user_id, leave_type, granted_days, granted_at, source, notes)
            VALUES (?, 'paid', ?, ?, 'auto', ?)`,
      args: [
        u.id,
        item.days,
        item.granted_at,
        `労基39条 法定付与 (入社${PAID_LEAVE_TABLE.find((p) => p.days === item.days)?.yearsAfterHire ?? "?"}年経過)`,
      ],
    });
    console.log(`   ✅ ${item.granted_at}: +${item.days}日 を付与しました`);
    totalGranted++;
  }
}

console.log(`\n✅ 完了: ${totalGranted} 件付与 / ${totalSkipped} 件スキップ`);
process.exit(0);
