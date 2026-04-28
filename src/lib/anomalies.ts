// 打刻漏れ検知（Phase B #5 拡張版）
//
// 既存 attendance.ts の detectAnomalies() を内包しつつ、以下を追加:
//   - missing_clock_in: 退勤打刻のみで出勤打刻なし
//   - extreme_short_shift: 実働 < 3時間（推定漏れ）
//   - weekday_no_punch: 平日（祝日除く）に打刻ゼロかつ承認済休暇もなし（社員のみ）
//   - unpaired_break: break_start に対応する break_end 無し

import { dbAll } from "./db";
import {
  businessMonthRange,
  isJapaneseHoliday,
  dayOfWeekFromYmd,
  nowBusinessDay,
} from "./time";
import { summarizeMonth, type AttendanceRecord } from "./attendance";

const SHORT_SHIFT_THRESHOLD_MIN = 3 * 60; // 3時間未満は短勤務疑い

export type AnomalyType =
  | "missing_clock_out"
  | "missing_clock_in"
  | "long_shift"
  | "extreme_short_shift"
  | "weekday_no_punch"
  | "unpaired_break";

export type AnomalyEntry = {
  userId: number;
  userName: string;
  date: string;
  type: AnomalyType;
  label: string;
  detail: string;
};

const TYPE_LABELS: Record<AnomalyType, string> = {
  missing_clock_out: "退勤打刻なし",
  missing_clock_in: "出勤打刻なし",
  long_shift: "長時間勤務",
  extreme_short_shift: "極端に短い勤務",
  weekday_no_punch: "平日打刻なし",
  unpaired_break: "休憩終了打刻なし",
};

type UserRow = {
  id: number;
  name: string;
  employment_type: string;
  standard_work_minutes: number | null;
  hire_date: string | null;
};

export async function detectAnomaliesForMonth(args: {
  year: number;
  month: number;
  includeWeekdayNoPunch?: boolean; // false なら weekday_no_punch を含めない
}): Promise<AnomalyEntry[]> {
  const range = businessMonthRange(args.year, args.month);
  const today = nowBusinessDay();

  // 全アクティブユーザー
  const users = await dbAll<UserRow>(
    `SELECT id, name, employment_type, standard_work_minutes, hire_date
     FROM users WHERE status = 'active' ORDER BY id`,
  );

  // 全員の打刻 + 全員の承認済休暇申請を1クエリで取得
  const [allRecords, approvedLeaves] = await Promise.all([
    dbAll<{
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
    ),
    dbAll<{ user_id: number; start_date: string; end_date: string }>(
      `SELECT user_id, start_date, end_date FROM leave_requests
       WHERE status = 'approved'
         AND start_date <= ? AND end_date >= ?`,
      [range.endIso.slice(0, 10), range.startIso.slice(0, 10)],
    ),
  ]);

  // ユーザーごとにグルーピング
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

  // 承認済休暇 by user-date set
  const leavesByUser = new Map<number, Set<string>>();
  for (const lv of approvedLeaves) {
    if (!leavesByUser.has(lv.user_id)) leavesByUser.set(lv.user_id, new Set());
    const set = leavesByUser.get(lv.user_id)!;
    // 期間内の全日を入れる
    const [sy, sm, sd] = lv.start_date.split("-").map(Number);
    const [ey, em, ed] = lv.end_date.split("-").map(Number);
    if (!sy || !ey) continue;
    let cursor = new Date(Date.UTC(sy, sm! - 1, sd));
    const endDt = new Date(Date.UTC(ey, em! - 1, ed));
    while (cursor.getTime() <= endDt.getTime()) {
      set.add(
        `${cursor.getUTCFullYear()}-${String(cursor.getUTCMonth() + 1).padStart(2, "0")}-${String(cursor.getUTCDate()).padStart(2, "0")}`,
      );
      cursor = new Date(cursor.getTime() + 24 * 60 * 60 * 1000);
    }
  }

  const anomalies: AnomalyEntry[] = [];

  for (const u of users) {
    const recs = recordsByUser.get(u.id) ?? [];
    const summaries = summarizeMonth(
      args.year,
      args.month,
      recs,
      u.standard_work_minutes ?? 420,
    );

    for (const s of summaries) {
      if (s.date > today) continue;
      // 入社日より前は対象外
      if (u.hire_date && s.date < u.hire_date) continue;

      const dow = dayOfWeekFromYmd(s.date);
      const isWeekend = dow === 0 || dow === 6;
      const isHoliday = isJapaneseHoliday(s.date);
      const isWeekdayBusiness = !isWeekend && !isHoliday;
      const hasLeave = leavesByUser.get(u.id)?.has(s.date) ?? false;

      // 1) 退勤打刻なし（既存仕様）
      if (s.clockIn && !s.clockOut && s.date !== today) {
        anomalies.push({
          userId: u.id,
          userName: u.name,
          date: s.date,
          type: "missing_clock_out",
          label: TYPE_LABELS.missing_clock_out,
          detail: `${s.date.slice(5)} 出勤のみ・退勤打刻なし`,
        });
      }

      // 2) 出勤打刻なし（退勤のみ）
      if (!s.clockIn && s.clockOut) {
        anomalies.push({
          userId: u.id,
          userName: u.name,
          date: s.date,
          type: "missing_clock_in",
          label: TYPE_LABELS.missing_clock_in,
          detail: `${s.date.slice(5)} 退勤のみ・出勤打刻なし`,
        });
      }

      // 3) 14h超の長時間勤務
      if (s.workMinutes >= 14 * 60) {
        anomalies.push({
          userId: u.id,
          userName: u.name,
          date: s.date,
          type: "long_shift",
          label: TYPE_LABELS.long_shift,
          detail: `${s.date.slice(5)} 実働${(s.workMinutes / 60).toFixed(1)}h`,
        });
      }

      // 4) 極端に短い勤務（出退勤両方ありで実働 < 3h）
      if (s.clockIn && s.clockOut && s.workMinutes > 0 && s.workMinutes < SHORT_SHIFT_THRESHOLD_MIN) {
        anomalies.push({
          userId: u.id,
          userName: u.name,
          date: s.date,
          type: "extreme_short_shift",
          label: TYPE_LABELS.extreme_short_shift,
          detail: `${s.date.slice(5)} 実働${(s.workMinutes / 60).toFixed(1)}h（3h未満）`,
        });
      }

      // 5) 平日打刻ゼロ（社員のみ・含めるオプションがONの時）
      if (
        args.includeWeekdayNoPunch !== false &&
        u.employment_type === "employee" &&
        isWeekdayBusiness &&
        !s.clockIn &&
        !s.clockOut &&
        !hasLeave &&
        s.date !== today
      ) {
        anomalies.push({
          userId: u.id,
          userName: u.name,
          date: s.date,
          type: "weekday_no_punch",
          label: TYPE_LABELS.weekday_no_punch,
          detail: `${s.date.slice(5)} 打刻なし・休暇なし`,
        });
      }

      // 6) break_start に対応する break_end が無い
      const breakStarts = s.records.filter((r) => r.punch_type === "break_start");
      const breakEnds = s.records.filter((r) => r.punch_type === "break_end");
      if (breakStarts.length > breakEnds.length) {
        anomalies.push({
          userId: u.id,
          userName: u.name,
          date: s.date,
          type: "unpaired_break",
          label: TYPE_LABELS.unpaired_break,
          detail: `${s.date.slice(5)} 休憩開始${breakStarts.length}回 / 終了${breakEnds.length}回`,
        });
      }
    }
  }

  return anomalies;
}

export async function detectAnomaliesForUser(args: {
  userId: number;
  year: number;
  month: number;
}): Promise<AnomalyEntry[]> {
  const all = await detectAnomaliesForMonth({
    year: args.year,
    month: args.month,
    includeWeekdayNoPunch: true,
  });
  return all.filter((a) => a.userId === args.userId);
}
