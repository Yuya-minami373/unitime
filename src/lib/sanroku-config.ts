// 36協定（時間外労働・休日労働協定）の制約定数
// 横浜南労基署 受付 令和8年1月16日（事業場: 株式会社ユニポール）
// 法人番号 4020001162172 / 労働保険番号 14-1-404776-000

export const AGREEMENT = {
  // 協定有効期間（YYYY-MM-DD）
  startDate: "2026-01-16",
  endDate: "2027-01-15",

  // 時間外労働の上限（分）
  monthlyOvertimeLimit: 45 * 60,
  annualOvertimeLimit: 360 * 60,

  // 段階アラート閾値（分）
  thresholds: {
    caution: 30 * 60, // 黄
    warning: 40 * 60, // オレンジ
    critical: 45 * 60, // 赤（協定上限）
  },

  // 休日労働
  holidayWork: {
    monthlyLimit: 1, // 月1回まで
    timeRange: { start: 9 * 60, end: 17 * 60 }, // 9:00〜17:00（分）
  },

  // 法定義務（特別条項なし協定でも遵守必須）
  legalLimits: {
    monthlyTotalLimit: 100 * 60, // 単月100h未満
    monthlyTotalCaution: 80 * 60, // 80h到達で予兆警告
    multiMonthAverageLimit: 80 * 60, // 直近2-6ヶ月平均80h以下
    multiMonthSpans: [2, 3, 4, 5, 6] as const,
  },

  // 監視対象（社員のみ。業務委託・クルーは対象外）
  targetEmploymentTypes: ["employee"] as const,
} as const;

export type OvertimeStage = "safe" | "caution" | "warning" | "critical";

export function classifyOvertimeStage(minutes: number): OvertimeStage {
  if (minutes >= AGREEMENT.thresholds.critical) return "critical";
  if (minutes >= AGREEMENT.thresholds.warning) return "warning";
  if (minutes >= AGREEMENT.thresholds.caution) return "caution";
  return "safe";
}

// 協定年度（startDate 起点）の "年度月" 番号 (1〜12) と年度番号を返す
//   例: startDate=2026-01-16 のとき
//     2026-01-20 → year=1, month=1
//     2026-12-15 → year=1, month=12
//     2027-01-16 → year=2, month=1
export function agreementPeriod(ymd: string): { year: number; month: number } {
  const [ay, am, ad] = AGREEMENT.startDate.split("-").map(Number);
  const [ty, tm, td] = ymd.split("-").map(Number);
  // 起点日からの "1ヶ月" 単位を月分割で算出する。
  // ここでは「起点と同じ日(ad)以降」を新しい年度月にすすめる定義
  // 例: 起点 1/16 の場合、各月 16日始まり〜翌月15日までが1ヶ月
  let totalMonths = (ty - ay) * 12 + (tm - am);
  if (td < ad) totalMonths -= 1;
  if (totalMonths < 0) totalMonths = 0;
  const year = Math.floor(totalMonths / 12) + 1;
  const month = (totalMonths % 12) + 1;
  return { year, month };
}

// 協定年度のSQL用範囲（year=1: 2026-01-16〜2027-01-15, year=2: 2027-01-16〜...）
export function agreementYearRange(year: number = 1): { startIso: string; endIso: string } {
  const [ay, am, ad] = AGREEMENT.startDate.split("-").map(Number);
  const startUtc = new Date(Date.UTC(ay! + (year - 1), am! - 1, ad!));
  const endUtc = new Date(Date.UTC(ay! + year, am! - 1, ad!));
  const fmt = (d: Date) =>
    `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}T04:00:00+09:00`;
  return { startIso: fmt(startUtc), endIso: fmt(endUtc) };
}

// 現在時点が協定年度何年目に属するかを返す
export function currentAgreementYear(ymd: string): number {
  const [ay, am, ad] = AGREEMENT.startDate.split("-").map(Number);
  const [ty, tm, td] = ymd.split("-").map(Number);
  let totalMonths = (ty - ay) * 12 + (tm - am);
  if (td < ad) totalMonths -= 1;
  if (totalMonths < 0) return 1;
  return Math.floor(totalMonths / 12) + 1;
}
