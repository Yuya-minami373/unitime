// JST時刻ユーティリティ
// 方針: 保存は "YYYY-MM-DDTHH:MM:SS.sss+09:00" 形式のISO文字列（nowJST()）。
// 表示・集計で使う年月日・時刻はすべて「JST壁時計」をランタイムTZ非依存で算出する。
// 実装: Dateのms値に+9h加算してからgetUTC*系で取り出す（Vercel=UTC / ローカル=JST どちらでも同じ結果）。

const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

export type JSTComponents = {
  year: number;
  month: number; // 1-12
  day: number;
  hour: number;
  minute: number;
  second: number;
  dayOfWeek: number; // 0=Sun, 6=Sat
};

export function jstComponents(input: string | Date = new Date()): JSTComponents {
  const d = input instanceof Date ? input : new Date(input);
  const shifted = new Date(d.getTime() + JST_OFFSET_MS);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    hour: shifted.getUTCHours(),
    minute: shifted.getUTCMinutes(),
    second: shifted.getUTCSeconds(),
    dayOfWeek: shifted.getUTCDay(),
  };
}

export function nowJST(): string {
  const d = new Date();
  const jst = new Date(d.getTime() + JST_OFFSET_MS);
  return jst.toISOString().replace("Z", "+09:00");
}

export function formatDate(iso: string): string {
  const { year, month, day } = jstComponents(iso);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function formatTime(iso: string): string {
  const { hour, minute } = jstComponents(iso);
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

export function formatDateTime(iso: string): string {
  return `${formatDate(iso)} ${formatTime(iso)}`;
}

export function formatHours(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}:${String(m).padStart(2, "0")}`;
}

export function yearMonth(iso: string): string {
  const { year, month } = jstComponents(iso);
  return `${year}-${String(month).padStart(2, "0")}`;
}

export function currentYearMonth(): string {
  return yearMonth(nowJST());
}

export function daysInMonth(year: number, month: number): number {
  // monthは1-12。Date.UTC(year, month, 0) は翌月0日 = 今月末日
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

const DAY_JP = ["日", "月", "火", "水", "木", "金", "土"];
export function dayOfWeekJP(iso: string): string {
  return DAY_JP[jstComponents(iso).dayOfWeek]!;
}

// "YYYY-MM-DD" 文字列から曜日番号（0=日）。TZ非依存
export function dayOfWeekFromYmd(ymd: string): number {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y!, m! - 1, d!)).getUTCDay();
}
