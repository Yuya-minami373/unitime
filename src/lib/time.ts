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

// =====================================================================
// 日本の祝日判定
// japanese-holidays パッケージを使い、振替休日も祝日として扱う。
// TZ非依存実装: ymd文字列から年を取り出してgetHolidaysOf(y)を直接参照
// =====================================================================

// 簡易キャッシュ: 同一年の祝日リストを使い回す（毎回パッケージ呼び出し回避）
const HOLIDAY_CACHE = new Map<number, Set<string>>();

function loadHolidaysOf(year: number): Set<string> {
  const cached = HOLIDAY_CACHE.get(year);
  if (cached) return cached;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const jh = require("japanese-holidays") as {
    getHolidaysOf: (y: number, furikae?: boolean) => { month: number; date: number; name: string }[];
  };
  const set = new Set<string>();
  for (const h of jh.getHolidaysOf(year, true)) {
    set.add(`${year}-${String(h.month).padStart(2, "0")}-${String(h.date).padStart(2, "0")}`);
  }
  HOLIDAY_CACHE.set(year, set);
  return set;
}

export function isJapaneseHoliday(ymd: string): boolean {
  const y = Number(ymd.slice(0, 4));
  return loadHolidaysOf(y).has(ymd);
}

// 「土日祝」の判定（協定上の休日労働対象日）
export function isAgreementHoliday(ymd: string): boolean {
  const dow = dayOfWeekFromYmd(ymd);
  if (dow === 0 || dow === 6) return true;
  return isJapaneseHoliday(ymd);
}

// =====================================================================
// 業務日（business day）境界
// 0:00基準では23時出勤・翌2時退勤などの日跨ぎ勤務が分断されてしまうため、
// JST 04:00 を境界とする「業務日」概念を導入する。
//   - 04:00以降の打刻 → その暦日の業務日に属する
//   - 00:00〜03:59の打刻 → 前日の業務日に属する
// クルー開票業務（22-23時頃終了）まで安全にカバーする想定。
// =====================================================================
export const BUSINESS_DAY_BOUNDARY_HOUR = 4;

// ISO文字列からその打刻が属する業務日（YYYY-MM-DD）を返す
export function businessDayFromIso(iso: string): string {
  const c = jstComponents(iso);
  if (c.hour >= BUSINESS_DAY_BOUNDARY_HOUR) {
    return `${c.year}-${String(c.month).padStart(2, "0")}-${String(c.day).padStart(2, "0")}`;
  }
  // 00:00〜03:59 は前日の業務日
  const prev = new Date(Date.UTC(c.year, c.month - 1, c.day - 1));
  return `${prev.getUTCFullYear()}-${String(prev.getUTCMonth() + 1).padStart(2, "0")}-${String(prev.getUTCDate()).padStart(2, "0")}`;
}

export function nowBusinessDay(): string {
  return businessDayFromIso(nowJST());
}

// 業務月レンジ（SQL BETWEEN/比較用のISO文字列）
//   year=2026, month=4 の場合: 2026-04-01T04:00:00+09:00 ～ 2026-05-01T04:00:00+09:00（exclusive）
export function businessMonthRange(
  year: number,
  month: number,
): { startIso: string; endIso: string } {
  const startIso = `${year}-${String(month).padStart(2, "0")}-01T04:00:00+09:00`;
  const nextYear = month === 12 ? year + 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;
  const endIso = `${nextYear}-${String(nextMonth).padStart(2, "0")}-01T04:00:00+09:00`;
  return { startIso, endIso };
}

// 業務日レンジ（SQL用）
//   "2026-04-26" の場合: 2026-04-26T04:00:00+09:00 ～ 2026-04-27T04:00:00+09:00
export function businessDayRange(ymd: string): { startIso: string; endIso: string } {
  const [y, m, d] = ymd.split("-").map(Number);
  const startIso = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}T04:00:00+09:00`;
  const next = new Date(Date.UTC(y!, m! - 1, d! + 1));
  const endIso = `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}-${String(next.getUTCDate()).padStart(2, "0")}T04:00:00+09:00`;
  return { startIso, endIso };
}
