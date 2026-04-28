import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { dbAll } from "@/lib/db";
import { nowJST, jstComponents, nowBusinessDay, businessDayRange, businessMonthRange, businessDayFromIso } from "@/lib/time";
import AppShell from "@/components/AppShell";
import PunchPanel from "@/components/PunchPanel";
import LiveClock from "@/components/LiveClock";
import {
  Clock3,
  TrendingUp,
  CalendarCheck,
  Flame,
  Target,
  LogIn,
  LogOut as LogOutIcon,
  type LucideIcon,
} from "lucide-react";
import {
  summarizeMonth,
  calcMonthTotal,
  formatHoursDecimal,
  weekDates,
  calcStreak,
  summarizeDay,
  countWorkdays,
  averageTimes,
  WEEK_DAYS,
  type AttendanceRecord,
} from "@/lib/attendance";

type PunchRecord = {
  punch_type: string;
  punched_at: string;
  latitude: number | null;
  longitude: number | null;
};

const DAY_JP = ["日", "月", "火", "水", "木", "金", "土"];

export default async function HomePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  // 代表取締役など打刻対象外のユーザーは管理者画面へ
  if (user.role === "owner") redirect("/admin");

  // "今日" は業務日ベース（JST 04:00 境界。0:00〜3:59は前日扱い）
  const today = nowBusinessDay();
  const now = new Date();
  const jstNow = jstComponents(now);
  const [todayY, todayM] = today.split("-").map(Number);
  // 月集計は「業務月」基準。深夜帯にまたがる日は含む業務月で扱う
  const year = todayY!;
  const month = todayM!;
  const todayRange = businessDayRange(today);
  const monthRange = businessMonthRange(year, month);

  // 今週の日付範囲をまず決める
  const weekDateArray = weekDates(now);
  const weekStart = weekDateArray[0];
  const weekEnd = weekDateArray[6];

  // 本日(業務日)・今月(業務月)・今週の3クエリを並列実行
  const [records, monthRecords, weekRecords] = await Promise.all([
    dbAll<PunchRecord>(
      `SELECT punch_type, punched_at, latitude, longitude
       FROM attendance_records
       WHERE user_id = ? AND punched_at >= ? AND punched_at < ?
       ORDER BY punched_at DESC`,
      [user.id, todayRange.startIso, todayRange.endIso],
    ),
    dbAll<AttendanceRecord>(
      `SELECT punch_type, punched_at, kind, leave_minutes
       FROM attendance_records
       WHERE user_id = ? AND punched_at >= ? AND punched_at < ?
       ORDER BY punched_at ASC`,
      [user.id, monthRange.startIso, monthRange.endIso],
    ),
    dbAll<AttendanceRecord>(
      `SELECT punch_type, punched_at, kind, leave_minutes
       FROM attendance_records
       WHERE user_id = ?
         AND substr(punched_at, 1, 10) BETWEEN ? AND ?
       ORDER BY punched_at ASC`,
      [user.id, weekStart, weekEnd],
    ),
  ]);

  const monthSummaries = summarizeMonth(year, month, monthRecords, user.standard_work_minutes);
  const monthTotal = calcMonthTotal(monthSummaries);
  const streak = calcStreak(monthSummaries, today);

  // 月次進捗（所定労働日数ベース）
  const plannedWorkdays = countWorkdays(year, month);
  const targetMinutes = plannedWorkdays * user.standard_work_minutes; // 月所定時間
  const workDaysProgress = Math.min(
    100,
    plannedWorkdays === 0 ? 0 : (monthTotal.workDays / plannedWorkdays) * 100,
  );
  const workMinutesProgress = Math.min(
    100,
    targetMinutes === 0 ? 0 : (monthTotal.totalWorkMinutes / targetMinutes) * 100,
  );

  // 平均出退勤時刻（今月分）
  const { avgClockIn, avgClockOut } = averageTimes(monthSummaries);

  // 今週の日別集計（業務日ベース）
  const weekRecordsByDate = new Map<string, AttendanceRecord[]>();
  for (const r of weekRecords) {
    const date = businessDayFromIso(r.punched_at);
    if (!weekRecordsByDate.has(date)) weekRecordsByDate.set(date, []);
    weekRecordsByDate.get(date)!.push(r);
  }

  const weekDaySummaries = weekDateArray.map((d) =>
    summarizeDay(d, weekRecordsByDate.get(d) ?? [], user.standard_work_minutes),
  );
  const weekTotalMinutes = weekDaySummaries.reduce((s, d) => s + d.workMinutes, 0);
  const weekMaxMinutes = Math.max(
    ...weekDaySummaries.map((d) => d.workMinutes),
    8 * 60,
  );

  // 挨拶（JST壁時計ベース）
  const hour = jstNow.hour;
  const greeting =
    hour < 11 ? "おはようございます" : hour < 17 ? "こんにちは" : "お疲れ様です";
  const displayName = user.name.split(/\s+/)[0] ?? user.name;
  // dateLabel は業務日ベース（深夜0-4時の打刻時に前日が表示される）
  const [, , todayD] = today.split("-").map(Number);
  const todayDow = new Date(Date.UTC(year, month - 1, todayD!)).getUTCDay();
  const dateLabel = `${year}年${month}月${todayD}日（${DAY_JP[todayDow]}）`;

  return (
    <AppShell user={{ name: user.name, role: user.role, employment: user.employment_type }}>
      {/* Header */}
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight md:text-[24px]">
            {greeting}、{displayName}さん
          </h1>
          <p className="mt-1.5 text-[13px] text-[var(--text-tertiary)]">
            {dateLabel}
          </p>
        </div>
        <LiveClock />
      </div>

      <div className="flex flex-col gap-6">
        {/* Hero + Timeline */}
        <PunchPanel initialRecords={records} />

        {/* KPI Grid */}
        <section className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
          <StatTile
            label="今週の勤務時間"
            value={formatHoursDecimal(weekTotalMinutes)}
            unit="h"
            icon={Clock3}
            tone="blue"
          />
          <StatTile
            label="今月の残業"
            value={formatHoursDecimal(monthTotal.totalOvertimeMinutes)}
            unit="h"
            icon={TrendingUp}
            tone={monthTotal.totalOvertimeMinutes > 0 ? "amber" : "blue"}
            highlight={monthTotal.totalOvertimeMinutes > 0}
          />
          <StatTile
            label={`出勤日数 (${month}月)`}
            value={String(monthTotal.workDays)}
            unit="日"
            icon={CalendarCheck}
            tone="emerald"
          />
          <StatTile
            label="連続出勤"
            value={String(streak)}
            unit="日"
            icon={Flame}
            tone="rose"
          />
        </section>

        {/* Month progress + Avg times (2カラム) */}
        <section className="grid gap-4 md:grid-cols-2">
          {/* 進捗バー */}
          <div className="u-card p-5">
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Target size={14} strokeWidth={1.75} className="text-[var(--brand-accent)]" />
                <h2 className="text-[14px] font-semibold tracking-tight">
                  {month}月の進捗
                </h2>
              </div>
              <span className="text-[11px] text-[var(--text-tertiary)]">
                所定 {plannedWorkdays}日 / 月{formatHoursDecimal(targetMinutes)}h
              </span>
            </div>
            <ProgressBar
              label="稼働日数"
              valueLabel={`${monthTotal.workDays} / ${plannedWorkdays}日`}
              progress={workDaysProgress}
              tone="emerald"
            />
            <div className="mt-4">
              <ProgressBar
                label="実働時間"
                valueLabel={`${formatHoursDecimal(monthTotal.totalWorkMinutes)} / ${formatHoursDecimal(targetMinutes)}h`}
                progress={workMinutesProgress}
                tone="blue"
              />
            </div>
          </div>

          {/* 平均出退勤 */}
          <div className="u-card p-5">
            <div className="mb-4 flex items-center gap-2">
              <Clock3 size={14} strokeWidth={1.75} className="text-[var(--brand-accent)]" />
              <h2 className="text-[14px] font-semibold tracking-tight">
                平均出退勤時刻（今月）
              </h2>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <TimeTile
                label="平均出勤"
                value={avgClockIn ?? "—"}
                icon={LogIn}
                tone="emerald"
              />
              <TimeTile
                label="平均退勤"
                value={avgClockOut ?? "—"}
                icon={LogOutIcon}
                tone="blue"
              />
            </div>
            <p className="mt-3 text-[11px] leading-relaxed text-[var(--text-tertiary)]">
              打刻がある日の平均です。リズム把握の参考値としてお使いください。
            </p>
          </div>
        </section>

        {/* Week chart */}
        <section className="u-card p-6">
          <div className="mb-6 flex items-center justify-between">
            <h2 className="text-[14px] font-semibold tracking-tight">今週の推移</h2>
            <span className="tabular-nums text-[12px] text-[var(--text-tertiary)]">
              合計 {formatHoursDecimal(weekTotalMinutes)}h
            </span>
          </div>
          <div className="relative flex h-[180px] items-end justify-between gap-2 border-b border-[var(--border-light)] pb-2">
            {/* 8h reference line */}
            <div className="absolute left-0 right-0 top-[20%] border-t border-dashed border-[var(--border-light)]" />
            <span className="absolute right-0 top-[20%] -mt-3 bg-[var(--bg-surface)] pl-1 text-[10px] text-[var(--text-quaternary)]">
              8h
            </span>
            {weekDaySummaries.map((d, i) => {
              const height = Math.min(
                100,
                Math.round((d.workMinutes / weekMaxMinutes) * 100),
              );
              const isToday = d.date === today;
              return (
                <div
                  key={d.date}
                  className="relative z-10 flex flex-1 flex-col items-center gap-2"
                >
                  <div className="flex h-full w-full flex-col justify-end">
                    <div
                      className={`w-full rounded-t-[3px] transition-colors ${
                        isToday
                          ? "bg-gradient-to-t from-[var(--brand-primary)] to-[var(--brand-accent)]"
                          : d.workMinutes > 0
                          ? "bg-[var(--brand-accent-soft)] border-t-2 border-[var(--brand-accent)]"
                          : "border border-dashed border-b-0 border-[var(--border-light)] bg-transparent"
                      }`}
                      style={{ height: `${Math.max(4, height)}%` }}
                    />
                  </div>
                  <span
                    className={`text-[11px] font-medium uppercase tracking-wider ${
                      isToday
                        ? "font-semibold text-[var(--brand-primary)]"
                        : "text-[var(--text-quaternary)]"
                    }`}
                  >
                    {WEEK_DAYS[i]}
                  </span>
                </div>
              );
            })}
          </div>
        </section>
      </div>
    </AppShell>
  );
}

type Tone = "blue" | "emerald" | "amber" | "rose";

const TONE_STYLES: Record<
  Tone,
  { iconBg: string; iconFg: string; accentBar: string; value: string }
> = {
  blue: {
    iconBg: "bg-[var(--brand-accent-soft)]",
    iconFg: "text-[var(--brand-accent)]",
    accentBar: "bg-[var(--brand-accent)]",
    value: "text-[var(--brand-primary)]",
  },
  emerald: {
    iconBg: "bg-[var(--accent-emerald-soft)]",
    iconFg: "text-[var(--accent-emerald)]",
    accentBar: "bg-[var(--accent-emerald)]",
    value: "text-[#047857]",
  },
  amber: {
    iconBg: "bg-[var(--accent-amber-soft)]",
    iconFg: "text-[var(--accent-amber)]",
    accentBar: "bg-[var(--accent-amber)]",
    value: "text-[#b45309]",
  },
  rose: {
    iconBg: "bg-[var(--accent-rose-soft)]",
    iconFg: "text-[var(--accent-rose)]",
    accentBar: "bg-[var(--accent-rose)]",
    value: "text-[#be123c]",
  },
};

function ProgressBar({
  label,
  valueLabel,
  progress,
  tone,
}: {
  label: string;
  valueLabel: string;
  progress: number;
  tone: Tone;
}) {
  const t = TONE_STYLES[tone];
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between">
        <span className="text-[12px] font-medium text-[var(--text-secondary)]">{label}</span>
        <span className={`tabular-nums text-[12.5px] font-semibold ${t.value}`}>
          {valueLabel}
          <span className="ml-1.5 text-[11px] font-normal text-[var(--text-tertiary)]">
            {progress.toFixed(0)}%
          </span>
        </span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--bg-subtle-alt)]">
        <div
          className={`h-full rounded-full ${t.accentBar} transition-[width] duration-500`}
          style={{ width: `${Math.max(2, progress)}%` }}
        />
      </div>
    </div>
  );
}

function TimeTile({
  label,
  value,
  icon: Icon,
  tone,
}: {
  label: string;
  value: string;
  icon: LucideIcon;
  tone: Tone;
}) {
  const t = TONE_STYLES[tone];
  return (
    <div className="flex items-center gap-3 rounded-[8px] border border-[var(--border-light)] bg-white px-3 py-2.5">
      <div className={`flex h-8 w-8 items-center justify-center rounded-[6px] ${t.iconBg}`}>
        <Icon size={14} strokeWidth={2} className={t.iconFg} />
      </div>
      <div className="flex flex-col">
        <span className="text-[11px] text-[var(--text-tertiary)]">{label}</span>
        <span className="tabular-nums text-[18px] font-semibold leading-none text-[var(--text-primary)]">
          {value}
        </span>
      </div>
    </div>
  );
}

function StatTile({
  label,
  value,
  unit,
  icon: Icon,
  highlight,
  tone = "blue",
}: {
  label: string;
  value: string;
  unit: string;
  icon?: LucideIcon;
  highlight?: boolean;
  tone?: Tone;
}) {
  const t = TONE_STYLES[tone];
  return (
    <div className="u-card relative flex flex-col justify-between overflow-hidden p-5">
      <span className={`absolute left-0 top-0 h-full w-[3px] ${t.accentBar}`} />
      <div className="flex items-start justify-between">
        <span className="micro-label">{label}</span>
        {Icon && (
          <div
            className={`flex h-7 w-7 items-center justify-center rounded-[6px] ${t.iconBg} ${t.iconFg}`}
          >
            <Icon size={14} strokeWidth={2} />
          </div>
        )}
      </div>
      <div className="mt-3 flex items-baseline">
        <span
          className={`tabular-nums text-[26px] font-semibold leading-none tracking-tight ${
            highlight ? t.value : "text-[var(--text-primary)]"
          }`}
        >
          {value}
        </span>
        <span className="ml-1 text-[14px] text-[var(--text-tertiary)]">{unit}</span>
      </div>
    </div>
  );
}
