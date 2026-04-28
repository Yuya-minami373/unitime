// 36協定遵守状況カード（本人ダッシュボード・管理者ダッシュボード共通）
//
// 表示内容:
//   - 月時間外労働: 段階色プログレスバー (45h上限)
//   - 協定年度時間外: プログレスバー (360h上限)
//   - 当月休日労働: 1/1回 (上限到達時赤)
//   - 月100h予兆 (時間外+休日合算が80h以上で表示)
//   - 複数月平均超過 (直近2-6ヶ月平均が80h超で表示)

import { ShieldAlert, Calendar, AlertTriangle } from "lucide-react";
import type { SanrokuOverview } from "@/lib/sanroku";
import { AGREEMENT, type OvertimeStage } from "@/lib/sanroku-config";

const STAGE_COLOR: Record<
  OvertimeStage,
  { bar: string; track: string; valueText: string; bg: string }
> = {
  safe: {
    bar: "bg-[var(--brand-accent)]",
    track: "bg-[var(--bg-subtle-alt)]",
    valueText: "text-[var(--brand-primary)]",
    bg: "bg-[var(--brand-accent-soft)]",
  },
  caution: {
    bar: "bg-yellow-400",
    track: "bg-yellow-100",
    valueText: "text-yellow-700",
    bg: "bg-yellow-50",
  },
  warning: {
    bar: "bg-[var(--accent-amber)]",
    track: "bg-[var(--accent-amber-soft)]",
    valueText: "text-[#b45309]",
    bg: "bg-[var(--accent-amber-soft)]",
  },
  critical: {
    bar: "bg-[var(--accent-rose)]",
    track: "bg-[var(--accent-rose-soft)]",
    valueText: "text-[#be123c]",
    bg: "bg-[var(--accent-rose-soft)]",
  },
};

function formatH(min: number): string {
  return (min / 60).toFixed(1);
}

export function SanrokuCard({ overview }: { overview: SanrokuOverview }) {
  const monthlyColor = STAGE_COLOR[overview.monthly.stage];
  const yearStage =
    overview.agreementYear.ratio >= 1
      ? "critical"
      : overview.agreementYear.ratio >= 8 / 9 // 320h以上
        ? "warning"
        : overview.agreementYear.ratio >= 0.5
          ? "caution"
          : "safe";
  const yearColor = STAGE_COLOR[yearStage as OvertimeStage];

  const holidayWithin = overview.holiday.withinLimit;
  const holidayColor = holidayWithin
    ? STAGE_COLOR.safe
    : STAGE_COLOR.critical;

  const showLegalCaution = overview.total.legalCautionExceeded && !overview.total.legalLimitExceeded;
  const showLegalViolation = overview.total.legalLimitExceeded;
  const exceededMultiMonth = overview.multiMonth.filter((e) => e.exceeded);

  return (
    <section className="u-card p-5">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ShieldAlert
            size={14}
            strokeWidth={1.75}
            className="text-[var(--accent-amber)]"
          />
          <h2 className="text-[14px] font-semibold tracking-tight">
            36協定 遵守状況
          </h2>
        </div>
        <span className="text-[11px] text-[var(--text-tertiary)]">
          有効期間: {AGREEMENT.startDate} 〜 {AGREEMENT.endDate}（特別条項なし）
        </span>
      </div>

      <div className="flex flex-col gap-4">
        {/* 月時間外 */}
        <Bar
          label="今月の時間外"
          value={`${formatH(overview.monthly.overtimeMinutes)}h / 45h`}
          ratio={overview.monthly.ratio}
          color={monthlyColor}
          stages={[
            { at: 30 / 45, label: "30h" },
            { at: 40 / 45, label: "40h" },
          ]}
          stageLabel={
            overview.monthly.stage === "critical"
              ? "🔴 協定上限到達"
              : overview.monthly.stage === "warning"
                ? "🟠 40h警告"
                : overview.monthly.stage === "caution"
                  ? "🟡 30h注意"
                  : ""
          }
        />

        {/* 年累計 */}
        <Bar
          label={`協定年度の時間外 (${overview.agreementYear.monthsElapsed}ヶ月経過)`}
          value={`${formatH(overview.agreementYear.overtimeMinutes)}h / 360h`}
          ratio={overview.agreementYear.ratio}
          color={yearColor}
          subText={
            overview.agreementYear.forecastAnnualMinutes >= AGREEMENT.annualOvertimeLimit
              ? `⚠️ 現ペース予測: 年${formatH(overview.agreementYear.forecastAnnualMinutes)}h（360h超過見込み）`
              : `現ペース予測: 年${formatH(overview.agreementYear.forecastAnnualMinutes)}h`
          }
        />

        {/* 休日労働 */}
        <div>
          <div className="mb-1.5 flex items-baseline justify-between">
            <span className="text-[12px] font-medium text-[var(--text-secondary)]">
              <Calendar size={11} strokeWidth={1.75} className="mr-1 inline" />
              今月の休日労働
            </span>
            <span className={`tabular-nums text-[12.5px] font-semibold ${holidayColor.valueText}`}>
              {overview.holiday.totalDays} / {AGREEMENT.holidayWork.monthlyLimit}回
              {!holidayWithin && (
                <span className="ml-1.5 rounded-[4px] bg-[var(--accent-rose)] px-1.5 py-0.5 text-[10px] text-white">
                  協定違反
                </span>
              )}
            </span>
          </div>
          {overview.holiday.days.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {overview.holiday.days.map((d) => (
                <span
                  key={d.date}
                  className={`rounded-[4px] px-1.5 py-0.5 text-[10.5px] tabular-nums ${
                    d.outOfHours
                      ? "bg-[var(--accent-amber-soft)] text-[#b45309]"
                      : "bg-[var(--bg-subtle-alt)] text-[var(--text-secondary)]"
                  }`}
                  title={d.outOfHours ? "9:00-17:00 枠外打刻あり" : ""}
                >
                  {d.date.slice(5)}
                  {d.outOfHours && " ⚠️"}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* 法定義務予兆/違反バナー */}
        {(showLegalCaution || showLegalViolation || exceededMultiMonth.length > 0) && (
          <div
            className={`rounded-[8px] border px-3 py-2.5 text-[12px] ${
              showLegalViolation || exceededMultiMonth.length > 0
                ? "border-[var(--accent-rose)] bg-[var(--accent-rose-soft)]/60 text-[#be123c]"
                : "border-[var(--accent-amber)] bg-[var(--accent-amber-soft)]/60 text-[#b45309]"
            }`}
          >
            <div className="flex items-center gap-1.5 font-semibold">
              <AlertTriangle size={12} strokeWidth={1.75} />
              法定義務（特別条項なしでも遵守必須）
            </div>
            <ul className="mt-1.5 ml-4 list-disc space-y-0.5">
              {showLegalCaution && (
                <li>月100h未満予兆: 当月合算 {formatH(overview.total.totalMinutes)}h / 100h</li>
              )}
              {showLegalViolation && (
                <li>🚨 月100h違反: 当月合算 {formatH(overview.total.totalMinutes)}h</li>
              )}
              {exceededMultiMonth.map((e) => (
                <li key={e.span}>
                  🚨 直近{e.span}ヶ月平均 {formatH(e.averageMinutes)}h（80h超過）
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </section>
  );
}

function Bar({
  label,
  value,
  ratio,
  color,
  subText,
  stages,
  stageLabel,
}: {
  label: string;
  value: string;
  ratio: number;
  color: { bar: string; track: string; valueText: string };
  subText?: string;
  stages?: { at: number; label: string }[];
  stageLabel?: string;
}) {
  const pct = Math.min(100, Math.max(2, ratio * 100));
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between">
        <span className="text-[12px] font-medium text-[var(--text-secondary)]">{label}</span>
        <span className={`tabular-nums text-[12.5px] font-semibold ${color.valueText}`}>
          {value}
          {stageLabel && (
            <span className="ml-2 text-[10.5px] font-medium">{stageLabel}</span>
          )}
        </span>
      </div>
      <div className={`relative h-2 w-full overflow-hidden rounded-full ${color.track}`}>
        <div
          className={`h-full rounded-full ${color.bar} transition-[width] duration-500`}
          style={{ width: `${pct}%` }}
        />
        {stages?.map((s) => (
          <div
            key={s.label}
            className="absolute top-0 h-full w-px bg-[var(--text-tertiary)]/40"
            style={{ left: `${s.at * 100}%` }}
            title={s.label}
          />
        ))}
      </div>
      {subText && (
        <p className="mt-1 text-[10.5px] text-[var(--text-tertiary)]">{subText}</p>
      )}
    </div>
  );
}
