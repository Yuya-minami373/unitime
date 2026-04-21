// 打刻データから日別/月次集計を計算するユーティリティ

export type AttendanceRecord = {
  punch_type: string;
  punched_at: string;
};

export type DaySummary = {
  date: string;
  clockIn: string | null;
  clockOut: string | null;
  breakMinutes: number;
  autoBreakApplied: boolean;   // 自動控除が効いた日か（手動打刻が法定最低を満たさないケース）
  workMinutes: number;
  scheduledOvertimeMinutes: number; // 所定超え〜法定8hまで（所定外・割増なし）
  overtimeMinutes: number;          // 法定外残業（>8h・25%割増対象）
  nightMinutes: number;       // 深夜時間帯（22:00-5:00）の実働分
  isWeekend: boolean;          // 土日判定
  holidayMinutes: number;      // 法定休日労働時間（MVPでは日曜のみ法定休日扱い）
  records: AttendanceRecord[];
};

const LEGAL_DAILY_MINUTES = 8 * 60; // 労基法32条: 1日8時間

// 労基法34条: 6h超→45分、8h超→60分（拘束時間ベース）
function requiredBreakMinutes(grossMinutes: number): number {
  if (grossMinutes > 8 * 60) return 60;
  if (grossMinutes > 6 * 60) return 45;
  return 0;
}

// 22:00-5:00 と 労働時間帯の重なり（分）を計算
// startMin/endMin は「その日0:00起点のminutes」。日跨ぎは考慮しない前提（MVP）
function overlapWithNight(startMin: number, endMin: number): number {
  // 深夜帯は [0, 5*60] と [22*60, 24*60] の2区間
  const intervals: [number, number][] = [
    [0, 5 * 60],
    [22 * 60, 24 * 60],
  ];
  let total = 0;
  for (const [ns, ne] of intervals) {
    const s = Math.max(startMin, ns);
    const e = Math.min(endMin, ne);
    if (e > s) total += e - s;
  }
  return total;
}

function toMinutes(iso: string): number {
  const d = new Date(iso);
  return d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60;
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

  const clockIn = sorted.find((r) => r.punch_type === "clock_in")?.punched_at ?? null;
  const clockOutRecords = sorted.filter((r) => r.punch_type === "clock_out");
  const clockOut = clockOutRecords[clockOutRecords.length - 1]?.punched_at ?? null;

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

  // 深夜時間帯の実働分（休憩考慮せず、打刻の出退勤時間帯との重なりのみ）
  let nightMinutes = 0;
  if (clockIn && clockOut) {
    const inMin = toMinutes(clockIn);
    const outMin = toMinutes(clockOut);
    // 日跨ぎしない前提（MVP）
    if (outMin > inMin) {
      nightMinutes = overlapWithNight(inMin, outMin);
    }
  }

  // 曜日判定（土日）
  const dow = new Date(date).getDay();
  const isWeekend = dow === 0 || dow === 6;

  // 法定休日労働（MVPでは日曜のみ法定休日と扱う。社労士計算への参考値）
  const holidayMinutes = dow === 0 ? Math.round(workMinutes) : 0;

  return {
    date,
    clockIn,
    clockOut,
    breakMinutes: Math.round(effectiveBreakMinutes),
    autoBreakApplied,
    workMinutes: Math.round(workMinutes),
    scheduledOvertimeMinutes: Math.round(scheduledOvertimeMinutes),
    overtimeMinutes: Math.round(overtimeMinutes),
    nightMinutes: Math.round(nightMinutes),
    isWeekend,
    holidayMinutes,
    records: sorted,
  };
}

// 月次のレコードを日別にグループ化してサマリを返す
export function summarizeMonth(
  year: number,
  month: number,
  records: AttendanceRecord[],
  standardWorkMinutes: number = 435,
): DaySummary[] {
  const daysInMonth = new Date(year, month, 0).getDate();
  const byDate = new Map<string, AttendanceRecord[]>();

  for (const r of records) {
    const date = r.punched_at.slice(0, 10);
    if (!byDate.has(date)) byDate.set(date, []);
    byDate.get(date)!.push(r);
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
  weekendWorkDays: number;        // 土日出勤日数
  totalHolidayMinutes: number;    // 法定休日労働時間合計（日曜のみ）
};

export function calcMonthTotal(summaries: DaySummary[]): MonthTotal {
  let workDays = 0;
  let totalWorkMinutes = 0;
  let totalBreakMinutes = 0;
  let totalScheduledOvertimeMinutes = 0;
  let totalOvertimeMinutes = 0;
  let totalNightMinutes = 0;
  let weekendWorkDays = 0;
  let totalHolidayMinutes = 0;

  for (const s of summaries) {
    if (s.workMinutes > 0) workDays++;
    totalWorkMinutes += s.workMinutes;
    totalBreakMinutes += s.breakMinutes;
    totalScheduledOvertimeMinutes += s.scheduledOvertimeMinutes;
    totalOvertimeMinutes += s.overtimeMinutes;
    totalNightMinutes += s.nightMinutes;
    if (s.isWeekend && s.workMinutes > 0) weekendWorkDays++;
    totalHolidayMinutes += s.holidayMinutes;
  }

  return {
    workDays,
    totalWorkMinutes,
    totalBreakMinutes,
    totalScheduledOvertimeMinutes,
    totalOvertimeMinutes,
    totalNightMinutes,
    weekendWorkDays,
    totalHolidayMinutes,
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

// 今週の月曜日（JST）をYYYY-MM-DDで返す
export function startOfWeek(date: Date = new Date()): string {
  const d = new Date(date);
  const day = d.getDay(); // 0=Sun, 1=Mon
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// 週曜日ラベル
export const WEEK_DAYS = ["月", "火", "水", "木", "金", "土", "日"];

// 今週7日の日付配列
export function weekDates(date: Date = new Date()): string[] {
  const start = startOfWeek(date);
  const [y, m, d] = start.split("-").map(Number);
  const result: string[] = [];
  for (let i = 0; i < 7; i++) {
    const dt = new Date(y, m - 1, d + i);
    result.push(
      `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`,
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

// 所定労働日数: 月曜〜金曜（祝日未考慮、MVP版）
export function countWorkdays(year: number, month: number): number {
  const daysInMonth = new Date(year, month, 0).getDate();
  let count = 0;
  for (let day = 1; day <= daysInMonth; day++) {
    const dow = new Date(year, month - 1, day).getDay();
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

// 連続出勤日数: 今日から遡って連続して勤務記録のある日数
export function calcStreak(summaries: DaySummary[], today: string): number {
  const byDate = new Map(summaries.map((s) => [s.date, s]));
  let streak = 0;
  let cursor = new Date(today);

  while (true) {
    const key = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}-${String(cursor.getDate()).padStart(2, "0")}`;
    const s = byDate.get(key);
    if (!s || s.workMinutes === 0) {
      // 休日（土日）はスキップしてストリーク継続
      const dayOfWeek = cursor.getDay();
      if (dayOfWeek === 0 || dayOfWeek === 6) {
        cursor.setDate(cursor.getDate() - 1);
        continue;
      }
      break;
    }
    streak++;
    cursor.setDate(cursor.getDate() - 1);
    if (streak > 365) break;
  }

  return streak;
}
