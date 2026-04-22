import { redirect } from "next/navigation";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Download, ArrowLeft } from "lucide-react";
import { getCurrentUser, isAdmin } from "@/lib/auth";
import { dbAll, dbGet } from "@/lib/db";
import AppShell from "@/components/AppShell";
import StickySummaryBar from "./StickySummaryBar";
import {
  summarizeMonth,
  calcMonthTotal,
  formatMinutes,
  formatHoursDecimal,
  type AttendanceRecord,
} from "@/lib/attendance";
import { jstComponents, formatTime as formatJSTTime, dayOfWeekFromYmd } from "@/lib/time";

function formatTime(iso: string | null): string {
  if (!iso) return "—";
  return formatJSTTime(iso);
}

const DAY_JP = ["日", "月", "火", "水", "木", "金", "土"];

export default async function HistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ ym?: string; user_id?: string }>;
}) {
  const currentUser = await getCurrentUser();
  if (!currentUser) redirect("/login");

  const params = await searchParams;
  const nowJst = jstComponents();
  const todayStr = `${nowJst.year}-${String(nowJst.month).padStart(2, "0")}-${String(nowJst.day).padStart(2, "0")}`;
  const targetYm = params.ym ?? `${nowJst.year}-${String(nowJst.month).padStart(2, "0")}`;
  const [yearStr, monthStr] = targetYm.split("-");
  const year = Number(yearStr);
  const month = Number(monthStr);

  // 他ユーザー指定は admin/owner のみ
  let viewUser: { id: number; name: string; standard_work_minutes: number } = {
    id: currentUser.id,
    name: currentUser.name,
    standard_work_minutes: currentUser.standard_work_minutes,
  };
  const requestedId = params.user_id ? Number(params.user_id) : null;
  const isOtherUser = requestedId !== null && requestedId !== currentUser.id;
  if (isOtherUser) {
    if (!isAdmin(currentUser)) redirect("/history");
    const other = await dbGet<{
      id: number;
      name: string;
      standard_work_minutes: number | null;
    }>(
      `SELECT id, name, standard_work_minutes FROM users WHERE id = ?`,
      [requestedId],
    );
    if (!other) redirect("/admin");
    viewUser = {
      id: other.id,
      name: other.name,
      standard_work_minutes: other.standard_work_minutes ?? 435,
    };
  }

  const prevDateUtc = new Date(Date.UTC(year, month - 2, 1));
  const nextDateUtc = new Date(Date.UTC(year, month, 1));
  const prevYm = `${prevDateUtc.getUTCFullYear()}-${String(prevDateUtc.getUTCMonth() + 1).padStart(2, "0")}`;
  const nextYm = `${nextDateUtc.getUTCFullYear()}-${String(nextDateUtc.getUTCMonth() + 1).padStart(2, "0")}`;

  const records = await dbAll<AttendanceRecord>(
    `SELECT punch_type, punched_at
     FROM attendance_records
     WHERE user_id = ? AND substr(punched_at, 1, 7) = ?
     ORDER BY punched_at ASC`,
    [viewUser.id, targetYm],
  );

  const summaries = summarizeMonth(year, month, records, viewUser.standard_work_minutes);
  const total = calcMonthTotal(summaries);

  // 月ナビにuser_idを保持
  const userParam = isOtherUser ? `&user_id=${viewUser.id}` : "";

  return (
    <AppShell user={{ name: currentUser.name, role: currentUser.role, employment: currentUser.employment_type }}>
      {/* スティッキー圧縮サマリ（スクロール時のみ表示） */}
      <StickySummaryBar
        userName={viewUser.name}
        ym={`${year}年${month}月`}
        workDays={total.workDays}
        workHours={formatHoursDecimal(total.totalWorkMinutes)}
        scheduledOvertimeHours={formatHoursDecimal(total.totalScheduledOvertimeMinutes)}
        overtimeHours={formatHoursDecimal(total.totalOvertimeMinutes)}
        nightHours={formatHoursDecimal(total.totalNightMinutes)}
        holidayHours={formatHoursDecimal(total.totalHolidayMinutes)}
        weekendDays={total.weekendWorkDays}
      />

      {/* Header */}
      {isOtherUser && (
        <Link
          href="/admin"
          className="mb-3 inline-flex items-center gap-1 text-[13px] text-[var(--text-tertiary)] transition-colors hover:text-[var(--text-primary)]"
        >
          <ArrowLeft size={14} strokeWidth={1.75} />
          チーム一覧へ戻る
        </Link>
      )}
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight md:text-[24px]">
            勤怠履歴
          </h1>
          <p className="mt-1.5 text-[13px] text-[var(--text-tertiary)]">
            {viewUser.name} の月次勤怠記録
            {isOtherUser && (
              <span className="ml-2 rounded-[4px] bg-[var(--brand-50)] px-1.5 py-0.5 text-[11px] font-medium text-[var(--brand-primary)]">
                管理者閲覧
              </span>
            )}
          </p>
        </div>
        <a
          href={`/api/export?ym=${targetYm}&user_id=${viewUser.id}`}
          className="u-btn u-btn-secondary"
        >
          <Download size={14} strokeWidth={1.75} />
          Excel出力
        </a>
      </div>

      {/* Month nav */}
      <div className="u-card mb-5 flex items-center justify-between px-4 py-3">
        <Link
          href={`/history?ym=${prevYm}${userParam}`}
          className="flex items-center gap-1 rounded-[6px] px-2 py-1 text-[13px] text-[var(--text-tertiary)] transition-colors hover:bg-[var(--bg-body)] hover:text-[var(--text-primary)]"
        >
          <ChevronLeft size={14} strokeWidth={1.75} />
          {prevDateUtc.getUTCFullYear()}年{prevDateUtc.getUTCMonth() + 1}月
        </Link>
        <div className="text-[15px] font-semibold tracking-tight">
          {year}年{month}月
        </div>
        <Link
          href={`/history?ym=${nextYm}${userParam}`}
          className="flex items-center gap-1 rounded-[6px] px-2 py-1 text-[13px] text-[var(--text-tertiary)] transition-colors hover:bg-[var(--bg-body)] hover:text-[var(--text-primary)]"
        >
          {nextDateUtc.getUTCFullYear()}年{nextDateUtc.getUTCMonth() + 1}月
          <ChevronRight size={14} strokeWidth={1.75} />
        </Link>
      </div>

      {/* KPI row 1: 基本実績 */}
      <div className="mb-3 grid grid-cols-2 gap-3 md:grid-cols-5 md:gap-4">
        <StatTile label="稼働日数" value={String(total.workDays)} unit="日" />
        <StatTile label="総実働時間" value={formatHoursDecimal(total.totalWorkMinutes)} unit="h" />
        <StatTile label="総休憩時間" value={formatHoursDecimal(total.totalBreakMinutes)} unit="h" />
        <StatTile
          label="所定外残業"
          subLabel="法定8h以内・割増なし"
          value={formatHoursDecimal(total.totalScheduledOvertimeMinutes)}
          unit="h"
        />
        <StatTile
          label="法定外残業"
          subLabel="8h超・25%割増"
          value={formatHoursDecimal(total.totalOvertimeMinutes)}
          unit="h"
          accent={total.totalOvertimeMinutes > 0 ? "indigo" : "neutral"}
        />
      </div>

      {/* KPI row 2: 社労士向け実績（深夜・土日・法定休日） */}
      <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-3 md:gap-4">
        <StatTile
          label="深夜労働（22:00〜5:00）"
          value={formatHoursDecimal(total.totalNightMinutes)}
          unit="h"
          accent={total.totalNightMinutes > 0 ? "indigo" : "neutral"}
        />
        <StatTile
          label="土日出勤"
          value={String(total.weekendWorkDays)}
          unit="日"
          accent={total.weekendWorkDays > 0 ? "amber" : "neutral"}
        />
        <StatTile
          label="法定休日労働（日曜）"
          value={formatHoursDecimal(total.totalHolidayMinutes)}
          unit="h"
          accent={total.totalHolidayMinutes > 0 ? "rose" : "neutral"}
        />
      </div>

      <div className="mb-4 rounded-[6px] border border-[var(--border-light)] bg-[var(--brand-50)]/50 px-3 py-2 text-[11px] leading-relaxed text-[var(--text-tertiary)]">
        ※ 所定労働時間 {(viewUser.standard_work_minutes / 60).toFixed(2)}h（ユニポール標準: 9:15〜17:15・休憩45分）を基準に計算。
        「所定外」は所定超え〜法定8hまで（割増なし）、「法定外」は8h超（25%割増対象）。<br />
        ※ 深夜・土日・法定休日の割増計算は社労士事務所が実施します。本画面は実績把握のみが目的です。
        休憩欄の「自動」バッジは労基34条に基づく自動控除（6h超→45分、8h超→60分）が適用された日を示します。
      </div>

      {/* Daily list (mobile: cards / desktop: table) */}
      <div className="u-card overflow-hidden">
        {/* Mobile cards */}
        <ul className="divide-y divide-[var(--border-light)] md:hidden">
          {summaries.map((s) => {
            const [, sm, sd] = s.date.split("-").map(Number);
            const dow = dayOfWeekFromYmd(s.date);
            const isWeekend = dow === 0 || dow === 6;
            const isEmpty = s.workMinutes === 0;
            const isToday = s.date === todayStr;
            const isHolidayWork = s.holidayMinutes > 0;
            const dowColor =
              dow === 0 ? "text-red-500" : dow === 6 ? "text-blue-500" : "text-[var(--text-tertiary)]";
            return (
              <li
                key={s.date}
                className={`px-4 py-3 ${
                  isToday
                    ? "bg-[var(--brand-accent-soft)]"
                    : isWeekend && s.workMinutes > 0
                    ? "bg-amber-50/40"
                    : ""
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-baseline gap-2">
                    <span
                      className={`tabular-nums text-[15px] font-semibold ${
                        isToday
                          ? "text-[var(--text-primary)]"
                          : isEmpty
                          ? "text-[var(--text-quaternary)]"
                          : "text-[var(--text-primary)]"
                      }`}
                    >
                      {sm}/{sd}
                    </span>
                    <span className={`text-[12px] font-medium ${dowColor}`}>
                      {DAY_JP[dow]}
                    </span>
                    {isToday && (
                      <span className="rounded-[4px] bg-[var(--brand-primary)] px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-white">
                        今日
                      </span>
                    )}
                  </div>
                  <div className="tabular-nums text-[13px] text-[var(--text-secondary)]">
                    {isEmpty ? (
                      <span className="text-[var(--text-quaternary)]">—</span>
                    ) : (
                      <>
                        <span>{formatTime(s.clockIn)}</span>
                        <span className="mx-1 text-[var(--text-quaternary)]">→</span>
                        <span>{formatTime(s.clockOut)}</span>
                      </>
                    )}
                  </div>
                </div>
                {!isEmpty && (
                  <div className="mt-2 grid grid-cols-4 gap-2 text-[11px]">
                    <Metric label="実働" value={formatMinutes(s.workMinutes)} strong />
                    <Metric
                      label="休憩"
                      value={s.breakMinutes > 0 ? formatMinutes(s.breakMinutes) : "—"}
                      badge={s.autoBreakApplied ? "自動" : undefined}
                    />
                    <Metric
                      label="所定外"
                      value={s.scheduledOvertimeMinutes > 0 ? formatMinutes(s.scheduledOvertimeMinutes) : "—"}
                      muted={!s.scheduledOvertimeMinutes}
                    />
                    <Metric
                      label="法定外"
                      value={s.overtimeMinutes > 0 ? formatMinutes(s.overtimeMinutes) : "—"}
                      muted={!s.overtimeMinutes}
                      indigo={s.overtimeMinutes > 0}
                    />
                  </div>
                )}
                {(s.nightMinutes > 0 || isHolidayWork) && (
                  <div className="mt-2 flex flex-wrap gap-1.5 text-[11px]">
                    {s.nightMinutes > 0 && (
                      <span className="rounded-[4px] bg-indigo-50 px-1.5 py-0.5 font-medium text-[var(--accent-indigo)]">
                        深夜 {formatMinutes(s.nightMinutes)}
                      </span>
                    )}
                    {isHolidayWork && (
                      <span className="rounded-[4px] bg-rose-50 px-1.5 py-0.5 font-medium text-rose-700">
                        法定休日 {formatMinutes(s.holidayMinutes)}
                      </span>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>

        {/* Desktop table */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-[var(--border-brand)] bg-[var(--brand-50)] text-left">
                <Th>日付</Th>
                <Th>曜日</Th>
                <Th>出勤</Th>
                <Th>退勤</Th>
                <Th>休憩</Th>
                <Th>実働</Th>
                <Th title="所定超え〜法定8hまで（割増なし）">所定外</Th>
                <Th title="8h超・25%割増対象">法定外</Th>
                <Th>深夜</Th>
                <Th>法定休日</Th>
              </tr>
            </thead>
            <tbody>
              {summaries.map((s) => {
                // s.date は "YYYY-MM-DD" (JSTローカル日付)
                const [, sm, sd] = s.date.split("-").map(Number);
                const dow = dayOfWeekFromYmd(s.date);
                const isWeekend = dow === 0 || dow === 6;
                const isEmpty = s.workMinutes === 0;
                const isToday = s.date === todayStr;
                const isHolidayWork = s.holidayMinutes > 0;
                return (
                  <tr
                    key={s.date}
                    className={`border-b border-[var(--border-light)] transition-colors last:border-0 hover:bg-[var(--bg-body)] ${
                      isToday
                        ? "bg-[var(--brand-accent-soft)]"
                        : isWeekend && s.workMinutes > 0
                        ? "bg-amber-50/40"
                        : ""
                    }`}
                  >
                    <Td>
                      <span
                        className={`tabular-nums ${
                          isToday
                            ? "font-semibold text-[var(--text-primary)]"
                            : isEmpty
                            ? "text-[var(--text-quaternary)]"
                            : "text-[var(--text-secondary)]"
                        }`}
                      >
                        {sm}/{sd}
                      </span>
                    </Td>
                    <Td>
                      <span
                        className={`text-[12px] ${
                          dow === 0
                            ? "text-red-500"
                            : dow === 6
                            ? "text-blue-500"
                            : "text-[var(--text-tertiary)]"
                        }`}
                      >
                        {DAY_JP[dow]}
                      </span>
                    </Td>
                    <Td mono>{formatTime(s.clockIn)}</Td>
                    <Td mono>{formatTime(s.clockOut)}</Td>
                    <Td mono muted={!s.breakMinutes}>
                      {s.breakMinutes > 0 ? (
                        <span className="inline-flex items-center gap-1">
                          {formatMinutes(s.breakMinutes)}
                          {s.autoBreakApplied && (
                            <span
                              title="労基34条に基づき自動で控除（6h超→45分、8h超→60分）"
                              className="rounded-[3px] bg-[var(--bg-subtle)] px-1 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-[var(--text-tertiary)]"
                            >
                              自動
                            </span>
                          )}
                        </span>
                      ) : (
                        "—"
                      )}
                    </Td>
                    <Td mono strong={s.workMinutes > 0} muted={isEmpty}>
                      {s.workMinutes > 0 ? formatMinutes(s.workMinutes) : "—"}
                    </Td>
                    <Td mono muted={!s.scheduledOvertimeMinutes}>
                      {s.scheduledOvertimeMinutes > 0
                        ? formatMinutes(s.scheduledOvertimeMinutes)
                        : "—"}
                    </Td>
                    <Td mono muted={!s.overtimeMinutes} indigo={s.overtimeMinutes > 0}>
                      {s.overtimeMinutes > 0 ? formatMinutes(s.overtimeMinutes) : "—"}
                    </Td>
                    <Td mono muted={!s.nightMinutes} indigo={s.nightMinutes > 0}>
                      {s.nightMinutes > 0 ? formatMinutes(s.nightMinutes) : "—"}
                    </Td>
                    <Td mono muted={!isHolidayWork}>
                      {isHolidayWork ? (
                        <span className="rounded-[4px] bg-rose-50 px-1.5 py-0.5 text-[11px] font-medium text-rose-700">
                          {formatMinutes(s.holidayMinutes)}
                        </span>
                      ) : (
                        "—"
                      )}
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </AppShell>
  );
}

function Metric({
  label,
  value,
  strong,
  muted,
  indigo,
  badge,
}: {
  label: string;
  value: string;
  strong?: boolean;
  muted?: boolean;
  indigo?: boolean;
  badge?: string;
}) {
  const valueColor = indigo
    ? "text-[var(--accent-indigo)]"
    : muted
    ? "text-[var(--text-quaternary)]"
    : "text-[var(--text-primary)]";
  const weight = strong ? "font-semibold" : "font-medium";
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] uppercase tracking-wider text-[var(--text-tertiary)]">
        {label}
      </span>
      <span className={`tabular-nums text-[13px] ${weight} ${valueColor}`}>
        {value}
        {badge && (
          <span className="ml-1 rounded-[3px] bg-[var(--bg-subtle)] px-1 py-px text-[8px] font-semibold uppercase tracking-wider text-[var(--text-tertiary)] align-middle">
            {badge}
          </span>
        )}
      </span>
    </div>
  );
}

function Th({ children, title }: { children: React.ReactNode; title?: string }) {
  return (
    <th
      title={title}
      className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-[var(--text-tertiary)]"
    >
      {children}
    </th>
  );
}

function Td({
  children,
  mono,
  strong,
  muted,
  indigo,
}: {
  children: React.ReactNode;
  mono?: boolean;
  strong?: boolean;
  muted?: boolean;
  indigo?: boolean;
}) {
  const classes = [
    "px-4 py-2.5",
    mono ? "tabular-nums" : "",
    strong ? "font-semibold text-[var(--text-primary)]" : "",
    muted ? "text-[var(--text-quaternary)]" : "",
    indigo ? "text-[var(--accent-indigo)] font-medium" : "",
  ].join(" ");
  return <td className={classes}>{children}</td>;
}

function StatTile({
  label,
  subLabel,
  value,
  unit,
  accent = "neutral",
}: {
  label: string;
  subLabel?: string;
  value: string;
  unit: string;
  accent?: "neutral" | "indigo" | "amber" | "rose";
}) {
  const valueColor =
    accent === "indigo"
      ? "text-[var(--accent-indigo)]"
      : accent === "amber"
      ? "text-amber-700"
      : accent === "rose"
      ? "text-rose-700"
      : "text-[var(--text-primary)]";
  return (
    <div className="u-card flex flex-col justify-between p-5">
      <div className="flex flex-col gap-0.5">
        <span className="micro-label">{label}</span>
        {subLabel && (
          <span className="text-[10px] font-medium text-[var(--text-quaternary)]">
            {subLabel}
          </span>
        )}
      </div>
      <div className="mt-3 flex items-baseline">
        <span className={`tabular-nums text-[24px] font-semibold leading-none tracking-tight ${valueColor}`}>
          {value}
        </span>
        <span className="ml-1 text-[14px] text-[var(--text-tertiary)]">{unit}</span>
      </div>
    </div>
  );
}
