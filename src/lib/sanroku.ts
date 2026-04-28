// 36協定遵守監視: 集計・閾値判定・通知制御
//
// 関数群:
//   - calcMonthlyOvertimeStatus(userId, year, month)   月時間外労働の状況
//   - calcAgreementYearStatus(userId)                  協定年度の年累計
//   - calcMonthlyHolidayWorkStatus(userId, year, month) 休日労働カウンタ
//   - calcMonthlyTotalStatus(userId, year, month)       月時間外+休日労働合算
//   - calcMultiMonthAverage(userId, monthCount)         直近Nヶ月平均
//   - getUserSanrokuOverview(userId)                   全社員ダッシュボード用1関数
//   - hasNotified / recordNotification                 通知重複防止

import { dbAll, dbGet, dbRun } from "./db";
import {
  businessMonthRange,
  businessDayFromIso,
  isAgreementHoliday,
  jstComponents,
  nowBusinessDay,
} from "./time";
import {
  AGREEMENT,
  classifyOvertimeStage,
  agreementYearRange,
  currentAgreementYear,
  type OvertimeStage,
} from "./sanroku-config";
import { summarizeMonth, calcMonthTotal, type AttendanceRecord } from "./attendance";

type MonthlyOvertimeStatus = {
  year: number;
  month: number;
  overtimeMinutes: number;
  stage: OvertimeStage;
  remainingToCritical: number; // 45hまで残り（分）
  ratio: number; // 0..1（45h基準）
};

export async function calcMonthlyOvertimeStatus(
  userId: number,
  year: number,
  month: number,
  standardWorkMinutes: number,
): Promise<MonthlyOvertimeStatus> {
  const range = businessMonthRange(year, month);
  const records = await dbAll<AttendanceRecord>(
    `SELECT punch_type, punched_at, latitude, longitude, kind, leave_minutes
     FROM attendance_records
     WHERE user_id = ? AND punched_at >= ? AND punched_at < ?
     ORDER BY punched_at ASC`,
    [userId, range.startIso, range.endIso],
  );
  const summaries = summarizeMonth(year, month, records, standardWorkMinutes);
  const total = calcMonthTotal(summaries);
  const overtime = total.totalOvertimeMinutes;
  return {
    year,
    month,
    overtimeMinutes: overtime,
    stage: classifyOvertimeStage(overtime),
    remainingToCritical: Math.max(0, AGREEMENT.thresholds.critical - overtime),
    ratio: Math.min(1, overtime / AGREEMENT.thresholds.critical),
  };
}

type AgreementYearStatus = {
  agreementYear: number;
  startIso: string;
  endIso: string;
  overtimeMinutes: number;
  ratio: number; // 0..1（360h基準）
  remainingMinutes: number;
  monthsElapsed: number;
  paceMinutesPerMonth: number; // 現ペース（分/月）
  forecastAnnualMinutes: number; // 年度末予測（このペースなら年合計）
};

export async function calcAgreementYearStatus(
  userId: number,
  standardWorkMinutes: number,
): Promise<AgreementYearStatus> {
  const today = nowBusinessDay();
  const ay = currentAgreementYear(today);
  const range = agreementYearRange(ay);

  // 年度開始から現在までの全月の overtime を合算
  const records = await dbAll<AttendanceRecord & { user_id: number }>(
    `SELECT user_id, punch_type, punched_at, latitude, longitude, kind, leave_minutes
     FROM attendance_records
     WHERE user_id = ? AND punched_at >= ? AND punched_at < ?
     ORDER BY punched_at ASC`,
    [userId, range.startIso, range.endIso],
  );

  // 業務月単位で集計
  const monthsMap = new Map<string, AttendanceRecord[]>();
  for (const r of records) {
    const businessDay = businessDayFromIso(r.punched_at);
    const ym = businessDay.slice(0, 7);
    if (!monthsMap.has(ym)) monthsMap.set(ym, []);
    monthsMap.get(ym)!.push(r);
  }

  let overtimeTotal = 0;
  for (const [ym, recs] of monthsMap.entries()) {
    const [y, m] = ym.split("-").map(Number);
    const summaries = summarizeMonth(y!, m!, recs, standardWorkMinutes);
    overtimeTotal += calcMonthTotal(summaries).totalOvertimeMinutes;
  }

  // 経過月数: 起点から今日までの月数
  const startC = jstComponents(range.startIso);
  const todayC = { year: Number(today.slice(0, 4)), month: Number(today.slice(5, 7)), day: Number(today.slice(8, 10)) };
  let monthsElapsed = (todayC.year - startC.year) * 12 + (todayC.month - startC.month);
  if (todayC.day < startC.day) monthsElapsed -= 1;
  monthsElapsed = Math.max(1, monthsElapsed + 1); // 最低1ヶ月扱い（割り算ガード）

  const paceMinutesPerMonth = overtimeTotal / monthsElapsed;
  const forecastAnnualMinutes = paceMinutesPerMonth * 12;

  return {
    agreementYear: ay,
    startIso: range.startIso,
    endIso: range.endIso,
    overtimeMinutes: overtimeTotal,
    ratio: Math.min(1, overtimeTotal / AGREEMENT.annualOvertimeLimit),
    remainingMinutes: Math.max(0, AGREEMENT.annualOvertimeLimit - overtimeTotal),
    monthsElapsed,
    paceMinutesPerMonth,
    forecastAnnualMinutes,
  };
}

type HolidayWorkDay = {
  date: string;
  workMinutes: number;
  outOfHours: boolean; // 9:00-17:00枠外打刻あり
  clockIn: string | null;
  clockOut: string | null;
};

type MonthlyHolidayWorkStatus = {
  year: number;
  month: number;
  totalDays: number;
  withinLimit: boolean;
  outOfHoursDays: HolidayWorkDay[];
  days: HolidayWorkDay[];
};

export async function calcMonthlyHolidayWorkStatus(
  userId: number,
  year: number,
  month: number,
): Promise<MonthlyHolidayWorkStatus> {
  const range = businessMonthRange(year, month);
  const records = await dbAll<{
    punch_type: string;
    punched_at: string;
    kind: string | null;
  }>(
    `SELECT punch_type, punched_at, kind
     FROM attendance_records
     WHERE user_id = ? AND punched_at >= ? AND punched_at < ?
       AND (kind IS NULL OR kind = 'work')
     ORDER BY punched_at ASC`,
    [userId, range.startIso, range.endIso],
  );

  // 業務日でグループ化し、土日祝の日のみ抽出
  const byDay = new Map<string, typeof records>();
  for (const r of records) {
    const day = businessDayFromIso(r.punched_at);
    if (!byDay.has(day)) byDay.set(day, []);
    byDay.get(day)!.push(r);
  }

  const days: HolidayWorkDay[] = [];
  for (const [day, recs] of byDay.entries()) {
    if (!isAgreementHoliday(day)) continue;
    const sorted = [...recs].sort((a, b) => (a.punched_at < b.punched_at ? -1 : 1));
    const clockIn = sorted.find((r) => r.punch_type === "clock_in")?.punched_at ?? null;
    const clockOuts = sorted.filter((r) => r.punch_type === "clock_out");
    const clockOut = clockOuts[clockOuts.length - 1]?.punched_at ?? null;
    if (!clockIn) continue; // 出勤打刻が無い日はスキップ

    const inComp = jstComponents(clockIn);
    const outComp = clockOut ? jstComponents(clockOut) : null;
    const inMin = inComp.hour * 60 + inComp.minute;
    const outMin = outComp ? outComp.hour * 60 + outComp.minute : null;
    const outOfHours =
      inMin < AGREEMENT.holidayWork.timeRange.start ||
      (outMin !== null && outMin > AGREEMENT.holidayWork.timeRange.end);
    const workMin =
      clockIn && clockOut ? (Date.parse(clockOut) - Date.parse(clockIn)) / 60000 : 0;
    days.push({
      date: day,
      workMinutes: Math.round(workMin),
      outOfHours,
      clockIn,
      clockOut,
    });
  }

  days.sort((a, b) => (a.date < b.date ? -1 : 1));
  return {
    year,
    month,
    totalDays: days.length,
    withinLimit: days.length <= AGREEMENT.holidayWork.monthlyLimit,
    outOfHoursDays: days.filter((d) => d.outOfHours),
    days,
  };
}

type MonthlyTotalStatus = {
  year: number;
  month: number;
  overtimeMinutes: number;
  holidayWorkMinutes: number;
  totalMinutes: number;
  legalLimitExceeded: boolean; // 100h以上
  legalCautionExceeded: boolean; // 80h以上
};

export async function calcMonthlyTotalStatus(
  userId: number,
  year: number,
  month: number,
  standardWorkMinutes: number,
): Promise<MonthlyTotalStatus> {
  const [overtime, holiday] = await Promise.all([
    calcMonthlyOvertimeStatus(userId, year, month, standardWorkMinutes),
    calcMonthlyHolidayWorkStatus(userId, year, month),
  ]);
  const holidayMin = holiday.days.reduce((s, d) => s + d.workMinutes, 0);
  const total = overtime.overtimeMinutes + holidayMin;
  return {
    year,
    month,
    overtimeMinutes: overtime.overtimeMinutes,
    holidayWorkMinutes: holidayMin,
    totalMinutes: total,
    legalLimitExceeded: total >= AGREEMENT.legalLimits.monthlyTotalLimit,
    legalCautionExceeded: total >= AGREEMENT.legalLimits.monthlyTotalCaution,
  };
}

type MultiMonthAverageEntry = {
  span: number; // 何ヶ月の平均か（2-6）
  averageMinutes: number;
  exceeded: boolean; // 80h超
  months: { ym: string; totalMinutes: number }[];
};

export async function calcMultiMonthAverages(
  userId: number,
  standardWorkMinutes: number,
  baseYear?: number,
  baseMonth?: number,
): Promise<MultiMonthAverageEntry[]> {
  const today = nowBusinessDay();
  const by = baseYear ?? Number(today.slice(0, 4));
  const bm = baseMonth ?? Number(today.slice(5, 7));

  // 直近6ヶ月の月集計を一気に計算
  const monthly: { ym: string; totalMinutes: number }[] = [];
  for (let i = 5; i >= 0; i--) {
    const dt = new Date(Date.UTC(by, bm - 1 - i, 1));
    const y = dt.getUTCFullYear();
    const m = dt.getUTCMonth() + 1;
    const total = await calcMonthlyTotalStatus(userId, y, m, standardWorkMinutes);
    monthly.push({
      ym: `${y}-${String(m).padStart(2, "0")}`,
      totalMinutes: total.totalMinutes,
    });
  }

  return AGREEMENT.legalLimits.multiMonthSpans.map((span) => {
    const slice = monthly.slice(-span);
    const avg = slice.reduce((s, x) => s + x.totalMinutes, 0) / slice.length;
    return {
      span,
      averageMinutes: avg,
      exceeded: avg > AGREEMENT.legalLimits.multiMonthAverageLimit,
      months: slice,
    };
  });
}

// 本人ダッシュボード/管理者一覧で使う総合ステータス
export type SanrokuOverview = {
  userId: number;
  monthly: MonthlyOvertimeStatus;
  agreementYear: AgreementYearStatus;
  holiday: MonthlyHolidayWorkStatus;
  total: MonthlyTotalStatus;
  multiMonth: MultiMonthAverageEntry[];
  worstStage: OvertimeStage; // 単月段階または法定違反/予兆を反映した最大警告レベル
};

export async function getUserSanrokuOverview(
  userId: number,
  standardWorkMinutes: number,
  baseYear?: number,
  baseMonth?: number,
): Promise<SanrokuOverview> {
  const today = nowBusinessDay();
  const y = baseYear ?? Number(today.slice(0, 4));
  const m = baseMonth ?? Number(today.slice(5, 7));

  const [monthly, agreementYear, holiday, total, multiMonth] = await Promise.all([
    calcMonthlyOvertimeStatus(userId, y, m, standardWorkMinutes),
    calcAgreementYearStatus(userId, standardWorkMinutes),
    calcMonthlyHolidayWorkStatus(userId, y, m),
    calcMonthlyTotalStatus(userId, y, m, standardWorkMinutes),
    calcMultiMonthAverages(userId, standardWorkMinutes, y, m),
  ]);

  // 最大警告レベルを判定
  let worst: OvertimeStage = monthly.stage;
  if (!holiday.withinLimit) worst = "critical";
  if (total.legalLimitExceeded) worst = "critical";
  if (multiMonth.some((e) => e.exceeded)) worst = "critical";
  if (worst !== "critical") {
    if (total.legalCautionExceeded) worst = worst === "safe" || worst === "caution" ? "warning" : worst;
    if (holiday.outOfHoursDays.length > 0 && worst === "safe") worst = "caution";
  }

  return {
    userId,
    monthly,
    agreementYear,
    holiday,
    total,
    multiMonth,
    worstStage: worst,
  };
}

// ========= 通知重複防止 =========

export async function hasNotified(
  userId: number,
  type: string,
  period: string,
): Promise<boolean> {
  const row = await dbGet(
    `SELECT 1 FROM notification_log WHERE user_id = ? AND notification_type = ? AND target_period = ?`,
    [userId, type, period],
  );
  return !!row;
}

export async function recordNotification(
  userId: number,
  type: string,
  period: string,
): Promise<void> {
  // INSERT OR IGNORE: UNIQUE制約があるので二重実行しても1件のみ
  await dbRun(
    `INSERT OR IGNORE INTO notification_log (user_id, notification_type, target_period)
     VALUES (?, ?, ?)`,
    [userId, type, period],
  );
}

// ========= 打刻時の閾値チェック・通知ディスパッチャ =========
//
// /api/punch で退勤打刻時に呼び出される。
// 該当月の状況を計算し、新規閾値到達があればTeams通知を発火する。
// 通知履歴に既に記録があるパターンはスキップ（重複通知防止）。

import {
  notifyOvertimeThreshold,
  notifyHolidayWorkViolation,
  notifyHolidayWorkOutOfHours,
  notifyMonthlyTotalCaution,
} from "./teams-notify";

export async function checkAndNotifySanroku(args: {
  userId: number;
  userName: string;
  standardWorkMinutes: number;
  appBaseUrl?: string;
}): Promise<void> {
  const today = nowBusinessDay();
  const year = Number(today.slice(0, 4));
  const month = Number(today.slice(5, 7));
  const ym = `${year}-${String(month).padStart(2, "0")}`;

  const overview = await getUserSanrokuOverview(
    args.userId,
    args.standardWorkMinutes,
    year,
    month,
  );

  // 1) 月時間外段階アラート
  const stage = overview.monthly.stage;
  if (stage === "caution" || stage === "warning" || stage === "critical") {
    const type = `overtime_${stage}`;
    if (!(await hasNotified(args.userId, type, ym))) {
      await notifyOvertimeThreshold({
        userName: args.userName,
        level: stage,
        overtimeMinutes: overview.monthly.overtimeMinutes,
        year,
        month,
        appBaseUrl: args.appBaseUrl,
      });
      await recordNotification(args.userId, type, ym);
    }
  }

  // 2) 休日労働違反
  if (!overview.holiday.withinLimit) {
    const type = "holiday_work_violation";
    if (!(await hasNotified(args.userId, type, ym))) {
      await notifyHolidayWorkViolation({
        userName: args.userName,
        year,
        month,
        totalDays: overview.holiday.totalDays,
        dates: overview.holiday.days.map((d) => d.date),
        appBaseUrl: args.appBaseUrl,
      });
      await recordNotification(args.userId, type, ym);
    }
  }

  // 3) 9-17時枠外の休日打刻（日単位で通知）
  for (const d of overview.holiday.outOfHoursDays) {
    const type = "holiday_work_outofhours";
    if (!(await hasNotified(args.userId, type, d.date))) {
      await notifyHolidayWorkOutOfHours({
        userName: args.userName,
        date: d.date,
        clockIn: d.clockIn,
        clockOut: d.clockOut,
        appBaseUrl: args.appBaseUrl,
      });
      await recordNotification(args.userId, type, d.date);
    }
  }

  // 4) 月100h予兆（80h到達）
  if (overview.total.legalCautionExceeded) {
    const type = "monthly_total_caution";
    if (!(await hasNotified(args.userId, type, ym))) {
      await notifyMonthlyTotalCaution({
        userName: args.userName,
        year,
        month,
        totalMinutes: overview.total.totalMinutes,
        appBaseUrl: args.appBaseUrl,
      });
      await recordNotification(args.userId, type, ym);
    }
  }
}
