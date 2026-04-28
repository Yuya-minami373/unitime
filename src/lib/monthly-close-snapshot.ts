// 月締め時のスナップショット生成
//
// 全社員 × 月集計をJSONにまとめて monthly_closes.summary_snapshot に保存。
// 後日 freee連動・労基署照会・社員からの問い合わせで参照する。

import { dbAll } from "./db";
import { businessMonthRange } from "./time";
import { summarizeMonth, calcMonthTotal, type AttendanceRecord } from "./attendance";
import { getUserSanrokuOverview } from "./sanroku";

type UserRow = {
  id: number;
  name: string;
  employment_type: string;
  standard_work_minutes: number | null;
};

export type MonthlyCloseSnapshot = {
  target_month: string;
  closed_at: string;
  users: Array<{
    user_id: number;
    name: string;
    employment_type: string;
    totals: {
      workDays: number;
      totalWorkMinutes: number;
      totalScheduledOvertimeMinutes: number;
      totalOvertimeMinutes: number;
      totalNightOvertimeMinutes: number;
      totalHolidayMinutes: number;
      totalLeaveDays: number;
    };
    sanroku?: {
      monthlyOvertimeMinutes: number;
      stage: string;
      agreementYearOvertimeMinutes: number;
    };
  }>;
  approved_stamp_requests: number;
  approved_leave_requests: number;
  approved_expense_claims: number;
};

export async function generateMonthlyCloseSnapshot(args: {
  targetMonth: string;     // YYYY-MM
  closedAt: string;
}): Promise<MonthlyCloseSnapshot> {
  const [y, m] = args.targetMonth.split("-").map(Number);
  if (!y || !m) throw new Error(`invalid targetMonth: ${args.targetMonth}`);
  const range = businessMonthRange(y, m);

  // 全アクティブユーザー
  const users = await dbAll<UserRow>(
    `SELECT id, name, employment_type, standard_work_minutes
     FROM users WHERE status = 'active' ORDER BY id`,
  );

  // 全員分の打刻を1クエリ取得 → メモリで user_id でグルーピング
  const allRecords = await dbAll<{
    user_id: number;
    punch_type: string;
    punched_at: string;
    kind: string | null;
    leave_minutes: number | null;
  }>(
    `SELECT user_id, punch_type, punched_at, kind, leave_minutes
     FROM attendance_records
     WHERE punched_at >= ? AND punched_at < ?`,
    [range.startIso, range.endIso],
  );

  const recordsByUser = new Map<number, AttendanceRecord[]>();
  for (const r of allRecords) {
    if (!recordsByUser.has(r.user_id)) recordsByUser.set(r.user_id, []);
    recordsByUser.get(r.user_id)!.push({
      punch_type: r.punch_type,
      punched_at: r.punched_at,
      kind: r.kind,
      leave_minutes: r.leave_minutes,
    });
  }

  const userSnapshots: MonthlyCloseSnapshot["users"] = [];
  for (const u of users) {
    const recs = recordsByUser.get(u.id) ?? [];
    const standardWork = u.standard_work_minutes ?? 420;
    const summaries = summarizeMonth(y, m, recs, standardWork);
    const total = calcMonthTotal(summaries);

    let sanroku: MonthlyCloseSnapshot["users"][number]["sanroku"] | undefined;
    if (u.employment_type === "employee") {
      try {
        const overview = await getUserSanrokuOverview(u.id, standardWork, y, m);
        sanroku = {
          monthlyOvertimeMinutes: overview.monthly.overtimeMinutes,
          stage: overview.monthly.stage,
          agreementYearOvertimeMinutes: overview.agreementYear.overtimeMinutes,
        };
      } catch {
        // 36協定計算失敗時はスナップショットに含めない（致命ではない）
      }
    }

    userSnapshots.push({
      user_id: u.id,
      name: u.name,
      employment_type: u.employment_type,
      totals: {
        workDays: total.workDays,
        totalWorkMinutes: total.totalWorkMinutes,
        totalScheduledOvertimeMinutes: total.totalScheduledOvertimeMinutes,
        totalOvertimeMinutes: total.totalOvertimeMinutes,
        totalNightOvertimeMinutes: total.totalNightOvertimeMinutes,
        totalHolidayMinutes: total.totalHolidayMinutes,
        totalLeaveDays: total.totalLeaveDays,
      },
      sanroku,
    });
  }

  // 承認済の各申請件数
  const stampCount = await dbAll<{ c: number }>(
    `SELECT COUNT(*) AS c FROM stamp_requests
     WHERE status='approved' AND target_business_day >= ? AND target_business_day < ?`,
    [`${args.targetMonth}-01`, nextMonthFirstDay(args.targetMonth)],
  );
  const leaveCount = await dbAll<{ c: number }>(
    `SELECT COUNT(*) AS c FROM leave_requests
     WHERE status='approved' AND start_date >= ? AND start_date < ?`,
    [`${args.targetMonth}-01`, nextMonthFirstDay(args.targetMonth)],
  );
  const expenseCount = await dbAll<{ c: number }>(
    `SELECT COUNT(*) AS c FROM expense_claims
     WHERE status='approved' AND claim_date >= ? AND claim_date < ?`,
    [`${args.targetMonth}-01`, nextMonthFirstDay(args.targetMonth)],
  );

  return {
    target_month: args.targetMonth,
    closed_at: args.closedAt,
    users: userSnapshots,
    approved_stamp_requests: stampCount[0]?.c ?? 0,
    approved_leave_requests: leaveCount[0]?.c ?? 0,
    approved_expense_claims: expenseCount[0]?.c ?? 0,
  };
}

function nextMonthFirstDay(targetMonth: string): string {
  const [y, m] = targetMonth.split("-").map(Number);
  if (!y || !m) throw new Error(`invalid month: ${targetMonth}`);
  const ny = m === 12 ? y + 1 : y;
  const nm = m === 12 ? 1 : m + 1;
  return `${ny}-${String(nm).padStart(2, "0")}-01`;
}
