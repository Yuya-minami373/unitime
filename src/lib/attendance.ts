// 打刻データから日別/月次集計を計算するユーティリティ

import { jstComponents, dayOfWeekFromYmd, businessDayFromIso } from "./time";

const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

export type AttendanceRecord = {
  punch_type: string;
  punched_at: string;
  latitude?: number | null;
  longitude?: number | null;
  // Phase B #2-B: 休暇承認による自動生成行
  kind?: string | null;       // 'work' | 'leave' （未指定なら 'work' 扱い）
  leave_minutes?: number | null;
};

export type DaySummary = {
  date: string;
  clockIn: string | null;
  clockOut: string | null;
  clockInLat: number | null;
  clockInLng: number | null;
  clockOutLat: number | null;
  clockOutLng: number | null;
  breakMinutes: number;
  autoBreakApplied: boolean;   // 自動控除が効いた日か（手動打刻が法定最低を満たさないケース）
  workMinutes: number;
  scheduledOvertimeMinutes: number; // 所定超え〜法定8hまで（所定外・割増なし）
  overtimeMinutes: number;          // 法定外残業（>8h・25%割増対象）
  nightMinutes: number;       // 深夜時間帯（22:00-翌5:00）の実働分（日跨ぎ対応）
  nightOvertimeMinutes: number; // 深夜帯と法定外残業帯の重なり（深夜+残業の50%対象）
  isWeekend: boolean;          // 土日判定
  holidayMinutes: number;      // 法定休日労働時間（MVPでは日曜のみ法定休日扱い）
  // Phase B #2-B: 休暇情報
  leaveMinutes: number;        // 承認済休暇の控除分（全休=480 / 半休=240 / 時間休=hours*60）
  leaveDays: number;           // 0 / 0.5 / 1 / 0〜1 (時間休の按分)
  records: AttendanceRecord[];
};

const LEGAL_DAILY_MINUTES = 8 * 60; // 労基法32条: 1日8時間

// 労基法34条: 6h超→45分、8h超→60分（拘束時間ベース）
function requiredBreakMinutes(grossMinutes: number): number {
  if (grossMinutes > 8 * 60) return 60;
  if (grossMinutes > 6 * 60) return 45;
  return 0;
}

// 区間 [startMs, endMs] と 各JST日の深夜帯[0:00-5:00] / [22:00-24:00] の重なり（分）
// 絶対時刻ベースで日跨ぎ・複数日跨ぎに対応
function nightOverlapMs(startMs: number, endMs: number): number {
  if (endMs <= startMs) return 0;
  const startC = jstComponents(new Date(startMs));
  const endC = jstComponents(new Date(endMs));
  // JST 0:00 of YYYY-MM-DD = Date.UTC(Y, M-1, D) - JST_OFFSET_MS
  const startMid = Date.UTC(startC.year, startC.month - 1, startC.day) - JST_OFFSET_MS;
  const endMid = Date.UTC(endC.year, endC.month - 1, endC.day) - JST_OFFSET_MS;

  let total = 0;
  for (let mid = startMid; mid <= endMid; mid += 86400000) {
    // 早朝 00:00-05:00
    const s1 = Math.max(startMs, mid);
    const e1 = Math.min(endMs, mid + 5 * 3600000);
    if (e1 > s1) total += (e1 - s1) / 60000;
    // 夜 22:00-24:00
    const s2 = Math.max(startMs, mid + 22 * 3600000);
    const e2 = Math.min(endMs, mid + 24 * 3600000);
    if (e2 > s2) total += (e2 - s2) / 60000;
  }
  return total;
}

// JST壁時計の0:00起点minutesに変換（Vercel=UTCでも正しいJST分を返す）
function toMinutes(iso: string): number {
  const c = jstComponents(iso);
  return c.hour * 60 + c.minute + c.second / 60;
}

function minuteDiff(start: string, end: string): number {
  return (new Date(end).getTime() - new Date(start).getTime()) / 60000;
}

// 1日分のレコードから日次サマリを計算
// standardWorkMinutes は「所定労働時間（分）」。既定はユニポール標準7h15m=435分
export function summarizeDay(
  date: string,
  records: AttendanceRecord[],
  standardWorkMinutes: number = 435,
): DaySummary {
  const sorted = [...records].sort((a, b) =>
    a.punched_at < b.punched_at ? -1 : 1,
  );

  // 休暇行を分離して別集計（kindが無い既存データはwork扱い）
  const leaveRows = sorted.filter((r) => r.kind === "leave");
  const leaveMinutesTotal = leaveRows.reduce(
    (sum, r) => sum + (r.leave_minutes ?? 0),
    0,
  );
  const leaveDays = leaveMinutesTotal / 480; // 8h=1日換算

  const clockInRec = sorted.find((r) => r.punch_type === "clock_in");
  const clockOutRecords = sorted.filter((r) => r.punch_type === "clock_out");
  const clockOutRec = clockOutRecords[clockOutRecords.length - 1];
  const clockIn = clockInRec?.punched_at ?? null;
  const clockOut = clockOutRec?.punched_at ?? null;

  // 休憩時間の合計を計算（手動打刻分）
  let manualBreakMinutes = 0;
  let breakStart: string | null = null;
  for (const r of sorted) {
    if (r.punch_type === "break_start") {
      breakStart = r.punched_at;
    } else if (r.punch_type === "break_end" && breakStart) {
      manualBreakMinutes += minuteDiff(breakStart, r.punched_at);
      breakStart = null;
    }
  }

  // 実働時間 = 退勤 - 出勤 - 休憩（手動打刻が法定最低未満なら自動控除）
  let workMinutes = 0;
  let effectiveBreakMinutes = manualBreakMinutes;
  let autoBreakApplied = false;
  if (clockIn && clockOut) {
    const grossMinutes = minuteDiff(clockIn, clockOut);
    const required = requiredBreakMinutes(grossMinutes);
    if (manualBreakMinutes < required) {
      effectiveBreakMinutes = required;
      autoBreakApplied = required > 0;
    }
    workMinutes = Math.max(0, grossMinutes - effectiveBreakMinutes);
  }

  // 2段残業計算:
  //   所定超え〜法定8h  → 所定外残業（割増なし）
  //   法定8h超           → 法定外残業（25%割増対象）
  const overLegal = Math.max(0, workMinutes - LEGAL_DAILY_MINUTES);
  const overStandard = Math.max(
    0,
    Math.min(workMinutes, LEGAL_DAILY_MINUTES) - standardWorkMinutes,
  );
  const scheduledOvertimeMinutes = overStandard;
  const overtimeMinutes = overLegal;

  // 深夜時間帯の実働分（絶対時刻ベース・日跨ぎ対応）
  // 注: 休憩時間帯と深夜帯の重なりは控除していない（次フェーズで精緻化）
  let nightMinutes = 0;
  let nightOvertimeMinutes = 0;
  if (clockIn && clockOut) {
    const inMs = new Date(clockIn).getTime();
    const outMs = new Date(clockOut).getTime();
    nightMinutes = nightOverlapMs(inMs, outMs);
    // 法定外残業帯（=退勤側からovertimeMinutes分）と深夜帯の重なり
    // ※ 休憩を厳密に分けていないので近似。MVPとして妥当な精度
    if (overtimeMinutes > 0) {
      const overtimeStartMs = Math.max(inMs, outMs - overtimeMinutes * 60000);
      nightOvertimeMinutes = nightOverlapMs(overtimeStartMs, outMs);
    }
  }

  // 曜日判定（土日）※ dateは"YYYY-MM-DD"のJSTローカル日付
  const dow = dayOfWeekFromYmd(date);
  const isWeekend = dow === 0 || dow === 6;

  // 法定休日労働（MVPでは日曜のみ法定休日と扱う。社労士計算への参考値）
  const holidayMinutes = dow === 0 ? Math.round(workMinutes) : 0;

  return {
    date,
    clockIn,
    clockOut,
    clockInLat: clockInRec?.latitude ?? null,
    clockInLng: clockInRec?.longitude ?? null,
    clockOutLat: clockOutRec?.latitude ?? null,
    clockOutLng: clockOutRec?.longitude ?? null,
    breakMinutes: Math.round(effectiveBreakMinutes),
    autoBreakApplied,
    workMinutes: Math.round(workMinutes),
    scheduledOvertimeMinutes: Math.round(scheduledOvertimeMinutes),
    overtimeMinutes: Math.round(overtimeMinutes),
    nightMinutes: Math.round(nightMinutes),
    nightOvertimeMinutes: Math.round(nightOvertimeMinutes),
    isWeekend,
    holidayMinutes,
    leaveMinutes: Math.round(leaveMinutesTotal),
    leaveDays: Math.round(leaveDays * 100) / 100,
    records: sorted,
  };
}

// 月次のレコードを業務日別にグループ化してサマリを返す
// 「業務日」は JST 04:00 を境界とする（time.ts businessDayFromIso 参照）
// 当月の業務日 = 業務日が "YYYY-MM-DD" 形式で当月内に収まるもの
export function summarizeMonth(
  year: number,
  month: number,
  records: AttendanceRecord[],
  standardWorkMinutes: number = 435,
): DaySummary[] {
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const byDate = new Map<string, AttendanceRecord[]>();

  for (const r of records) {
    const businessDay = businessDayFromIso(r.punched_at);
    if (!byDate.has(businessDay)) byDate.set(businessDay, []);
    byDate.get(businessDay)!.push(r);
  }

  const result: DaySummary[] = [];
  for (let day = 1; day <= daysInMonth; day++) {
    const date = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const dayRecords = byDate.get(date) ?? [];
    result.push(summarizeDay(date, dayRecords, standardWorkMinutes));
  }

  return result;
}

export type MonthTotal = {
  workDays: number;
  totalWorkMinutes: number;
  totalBreakMinutes: number;
  totalScheduledOvertimeMinutes: number; // 所定外・法定内（割増なし）
  totalOvertimeMinutes: number;          // 法定外残業（25%割増対象）
  totalNightMinutes: number;      // 深夜時間帯の実働分合計
  totalNightOvertimeMinutes: number; // 深夜帯と法定外残業帯の重なり合計（+25%加算対象）
  weekendWorkDays: number;        // 土日出勤日数
  totalHolidayMinutes: number;    // 法定休日労働時間合計（日曜のみ）
  totalLeaveDays: number;         // 当月の休暇消化日数（半休=0.5 / 時間休=hours/8）
  totalLeaveMinutes: number;      // 控除分の合計（参考値）
};

export function calcMonthTotal(summaries: DaySummary[]): MonthTotal {
  let workDays = 0;
  let totalWorkMinutes = 0;
  let totalBreakMinutes = 0;
  let totalScheduledOvertimeMinutes = 0;
  let totalOvertimeMinutes = 0;
  let totalNightMinutes = 0;
  let totalNightOvertimeMinutes = 0;
  let weekendWorkDays = 0;
  let totalHolidayMinutes = 0;
  let totalLeaveDays = 0;
  let totalLeaveMinutes = 0;

  for (const s of summaries) {
    if (s.workMinutes > 0) workDays++;
    totalWorkMinutes += s.workMinutes;
    totalBreakMinutes += s.breakMinutes;
    totalScheduledOvertimeMinutes += s.scheduledOvertimeMinutes;
    totalOvertimeMinutes += s.overtimeMinutes;
    totalNightMinutes += s.nightMinutes;
    totalNightOvertimeMinutes += s.nightOvertimeMinutes;
    if (s.isWeekend && s.workMinutes > 0) weekendWorkDays++;
    totalHolidayMinutes += s.holidayMinutes;
    totalLeaveDays += s.leaveDays;
    totalLeaveMinutes += s.leaveMinutes;
  }

  return {
    workDays,
    totalWorkMinutes,
    totalBreakMinutes,
    totalScheduledOvertimeMinutes,
    totalOvertimeMinutes,
    totalNightMinutes,
    totalNightOvertimeMinutes,
    weekendWorkDays,
    totalHolidayMinutes,
    totalLeaveDays: Math.round(totalLeaveDays * 100) / 100,
    totalLeaveMinutes,
  };
}

export function formatMinutes(minutes: number): string {
  if (minutes <= 0) return "0:00";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}:${String(m).padStart(2, "0")}`;
}

// 時間のみ（小数第1位）、例: "32.5h"
export function formatHoursDecimal(minutes: number): string {
  if (minutes <= 0) return "0.0";
  return (minutes / 60).toFixed(1);
}

// 今週の月曜日（JST）をYYYY-MM-DDで返す。TZ非依存
export function startOfWeek(date: Date = new Date()): string {
  const c = jstComponents(date);
  // Date.UTC で JST壁時計の年月日を構築 → getUTCDay で曜日取得
  const base = new Date(Date.UTC(c.year, c.month - 1, c.day));
  const day = base.getUTCDay(); // 0=Sun, 1=Mon
  const diff = day === 0 ? -6 : 1 - day;
  const monday = new Date(Date.UTC(c.year, c.month - 1, c.day + diff));
  return `${monday.getUTCFullYear()}-${String(monday.getUTCMonth() + 1).padStart(2, "0")}-${String(monday.getUTCDate()).padStart(2, "0")}`;
}

// 週曜日ラベル
export const WEEK_DAYS = ["月", "火", "水", "木", "金", "土", "日"];

// 今週7日の日付配列。TZ非依存
export function weekDates(date: Date = new Date()): string[] {
  const start = startOfWeek(date);
  const [y, m, d] = start.split("-").map(Number);
  const result: string[] = [];
  for (let i = 0; i < 7; i++) {
    const dt = new Date(Date.UTC(y!, m! - 1, d! + i));
    result.push(
      `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`,
    );
  }
  return result;
}

// 現在の勤務ステータス: 打刻レコードから「出勤中/休憩中/退勤済/未出勤」を判定
export type WorkStatus = "working" | "break" | "done" | "off";

export function currentWorkStatus(records: AttendanceRecord[]): WorkStatus {
  if (records.length === 0) return "off";
  const sorted = [...records].sort((a, b) =>
    a.punched_at < b.punched_at ? -1 : 1,
  );
  const last = sorted[sorted.length - 1];
  if (last.punch_type === "clock_out") return "done";
  if (last.punch_type === "break_start") return "break";
  if (last.punch_type === "clock_in" || last.punch_type === "break_end")
    return "working";
  return "off";
}

// 所定労働日数: 月曜〜金曜（祝日未考慮、MVP版）。TZ非依存
export function countWorkdays(year: number, month: number): number {
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  let count = 0;
  for (let day = 1; day <= daysInMonth; day++) {
    const dow = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
    if (dow !== 0 && dow !== 6) count++;
  }
  return count;
}

// 平均出勤・退勤時刻（打刻がある日のみ対象）
export function averageTimes(summaries: DaySummary[]): {
  avgClockIn: string | null;
  avgClockOut: string | null;
} {
  const inMinutes: number[] = [];
  const outMinutes: number[] = [];
  for (const s of summaries) {
    if (s.clockIn) inMinutes.push(toMinutes(s.clockIn));
    if (s.clockOut) outMinutes.push(toMinutes(s.clockOut));
  }
  const fmt = (mins: number) => {
    const h = Math.floor(mins / 60);
    const m = Math.round(mins % 60);
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  };
  return {
    avgClockIn: inMinutes.length
      ? fmt(inMinutes.reduce((a, b) => a + b, 0) / inMinutes.length)
      : null,
    avgClockOut: outMinutes.length
      ? fmt(outMinutes.reduce((a, b) => a + b, 0) / outMinutes.length)
      : null,
  };
}

// 打刻異常検知: 退勤忘れ・14時間超連続を返す
// ※ 労基34条の休憩未取得は「自動控除」で吸収するため、本アラートからは外す
export type AttendanceAnomaly = {
  date: string;
  type: "missing_clock_out" | "long_shift";
  label: string;
  detail: string;
};

export function detectAnomalies(
  summaries: DaySummary[],
  today: string,
): AttendanceAnomaly[] {
  const out: AttendanceAnomaly[] = [];
  for (const s of summaries) {
    if (s.date > today) continue;
    // 退勤忘れ: 出勤あり・退勤なし・今日以外
    if (s.clockIn && !s.clockOut && s.date !== today) {
      out.push({
        date: s.date,
        type: "missing_clock_out",
        label: "退勤打刻なし",
        detail: `${s.date.slice(5)} 出勤のみ`,
      });
    }
    // 14時間以上連続勤務
    if (s.workMinutes >= 14 * 60) {
      out.push({
        date: s.date,
        type: "long_shift",
        label: "長時間勤務",
        detail: `${s.date.slice(5)} 実働${formatHoursDecimal(s.workMinutes)}h`,
      });
    }
  }
  return out;
}

// 36協定アラートレベル判定（月45h/80hが代表的閾値）
export type OvertimeLevel = "safe" | "watch" | "warning" | "critical";
export function overtimeLevel(overtimeMinutes: number): OvertimeLevel {
  const h = overtimeMinutes / 60;
  if (h >= 80) return "critical";
  if (h >= 45) return "warning";
  if (h >= 30) return "watch";
  return "safe";
}

// 連続出勤日数: 今日から遡って連続して勤務記録のある日数。TZ非依存（UTC基準で日付進行）
export function calcStreak(summaries: DaySummary[], today: string): number {
  const byDate = new Map(summaries.map((s) => [s.date, s]));
  let streak = 0;
  const [ty, tm, td] = today.split("-").map(Number);
  let cursor = new Date(Date.UTC(ty!, tm! - 1, td!));

  while (true) {
    const key = `${cursor.getUTCFullYear()}-${String(cursor.getUTCMonth() + 1).padStart(2, "0")}-${String(cursor.getUTCDate()).padStart(2, "0")}`;
    const s = byDate.get(key);
    if (!s || s.workMinutes === 0) {
      const dayOfWeek = cursor.getUTCDay();
      if (dayOfWeek === 0 || dayOfWeek === 6) {
        cursor = new Date(cursor.getTime() - 24 * 60 * 60 * 1000);
        continue;
      }
      break;
    }
    streak++;
    cursor = new Date(cursor.getTime() - 24 * 60 * 60 * 1000);
    if (streak > 365) break;
  }

  return streak;
}
