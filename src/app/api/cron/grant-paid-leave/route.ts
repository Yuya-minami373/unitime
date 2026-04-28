// Vercel Cron: 法定有給休暇の自動付与
// schedule: 30 19 * * *  (UTC) = 04:30 JST 毎日
// vercel.json で設定。Vercel Cron は Authorization: Bearer ${CRON_SECRET} を自動付与

import { NextRequest, NextResponse } from "next/server";
import { dbAll, dbGet, dbRun } from "@/lib/db";
import { paidLeaveScheduleFromHireDate } from "@/lib/leaves";
import { nowBusinessDay } from "@/lib/time";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  // CRON_SECRET 検証（Vercel Cron は自動で Bearer トークンを付ける）
  const auth = req.headers.get("authorization");
  const expected = process.env.CRON_SECRET
    ? `Bearer ${process.env.CRON_SECRET}`
    : null;
  if (expected && auth !== expected) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const today = nowBusinessDay();
  const users = await dbAll<{ id: number; name: string; hire_date: string }>(
    `SELECT id, name, hire_date FROM users
     WHERE employment_type = 'employee' AND hire_date IS NOT NULL AND status = 'active'`,
  );

  let granted = 0;
  let skipped = 0;
  const log: string[] = [];

  for (const u of users) {
    const schedule = paidLeaveScheduleFromHireDate(u.hire_date, today);
    for (const item of schedule) {
      const exist = await dbGet<{ id: number }>(
        `SELECT id FROM leave_grants
         WHERE user_id = ? AND leave_type = 'paid' AND granted_at = ?`,
        [u.id, item.granted_at],
      );
      if (exist) {
        skipped++;
        continue;
      }
      await dbRun(
        `INSERT INTO leave_grants
           (user_id, leave_type, granted_days, granted_at, source, notes)
         VALUES (?, 'paid', ?, ?, 'auto', ?)`,
        [
          u.id,
          item.days,
          item.granted_at,
          `労基39条 法定付与（cron / asOf=${today}）`,
        ],
      );
      log.push(`u${u.id} ${u.name}: +${item.days}日 @ ${item.granted_at}`);
      granted++;
    }
  }

  console.log(`[cron grant-paid-leave] asOf=${today} granted=${granted} skipped=${skipped}`);
  for (const line of log) console.log(`  ${line}`);

  return NextResponse.json({
    ok: true,
    asOf: today,
    granted,
    skipped,
    details: log,
  });
}
