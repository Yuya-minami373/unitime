import { redirect } from "next/navigation";
import Link from "next/link";
import {
  ChevronLeft,
  ChevronRight,
  Download,
  ArrowRight,
  Users as UsersIcon,
  CalendarCheck,
  Clock3,
  TrendingUp,
  AlertTriangle,
  ShieldAlert,
  Activity,
  Coffee,
  CheckCircle2,
  Circle,
  type LucideIcon,
} from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { dbAll } from "@/lib/db";
import { nowJST, jstComponents } from "@/lib/time";
import AppShell from "@/components/AppShell";
import {
  summarizeMonth,
  calcMonthTotal,
  formatHoursDecimal,
  currentWorkStatus,
  detectAnomalies,
  overtimeLevel,
  type AttendanceRecord,
  type WorkStatus,
  type OvertimeLevel,
} from "@/lib/attendance";
import { listAllExpenses, formatYen } from "@/lib/expenses";
import { Receipt } from "lucide-react";

type User = {
  id: number;
  name: string;
  login_id: string;
  employment_type: string;
  standard_work_minutes: number | null;
};

const EMPLOYMENT_LABEL: Record<string, string> = {
  employee: "社員",
  contractor: "業務委託",
  crew: "クルー",
};

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ ym?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  // admin以上のみ閲覧可
  if (user.role !== "owner" && user.role !== "admin") redirect("/");

  const params = await searchParams;
  const nowJst = jstComponents();
  const targetYm = params.ym ?? `${nowJst.year}-${String(nowJst.month).padStart(2, "0")}`;
  const [yearStr, monthStr] = targetYm.split("-");
  const year = Number(yearStr);
  const month = Number(monthStr);

  // 前月/翌月（Date.UTCで正規化。month=1→prevMonth=12/year-1, month=12→nextMonth=1/year+1）
  const prevDateUtc = new Date(Date.UTC(year, month - 2, 1));
  const nextDateUtc = new Date(Date.UTC(year, month, 1));
  const prevYm = `${prevDateUtc.getUTCFullYear()}-${String(prevDateUtc.getUTCMonth() + 1).padStart(2, "0")}`;
  const nextYm = `${nextDateUtc.getUTCFullYear()}-${String(nextDateUtc.getUTCMonth() + 1).padStart(2, "0")}`;

  const today = nowJST().slice(0, 10);

  // users / 全員分の月次打刻（1回で取得して後でuser_idでグループ化）/ 承認待ち精算 を並列取得
  const [users, allMonthRecords, pendingExpenses] = await Promise.all([
    dbAll<User>(
      `SELECT id, name, login_id, employment_type, standard_work_minutes
       FROM users
       WHERE status = 'active' AND role != 'owner'
       ORDER BY id`,
    ),
    dbAll<AttendanceRecord & { user_id: number }>(
      `SELECT user_id, punch_type, punched_at
       FROM attendance_records a
       WHERE substr(punched_at, 1, 7) = ?
         AND user_id IN (SELECT id FROM users WHERE status = 'active' AND role != 'owner')
       ORDER BY punched_at ASC`,
      [targetYm],
    ),
    listAllExpenses({ status: ["pending", "ai_flagged"] }),
  ]);

  // user_idごとにメモリ上でグループ化（N+1クエリを1クエリに圧縮）
  const recordsByUser = new Map<number, AttendanceRecord[]>();
  for (const r of allMonthRecords) {
    if (!recordsByUser.has(r.user_id)) recordsByUser.set(r.user_id, []);
    recordsByUser.get(r.user_id)!.push({
      punch_type: r.punch_type,
      punched_at: r.punched_at,
    });
  }

  const userSummaries = users.map((u) => {
    const records = recordsByUser.get(u.id) ?? [];
    const summaries = summarizeMonth(
      year,
      month,
      records,
      u.standard_work_minutes ?? 435,
    );
    const total = calcMonthTotal(summaries);

    const todayRecords = records.filter(
      (r) => r.punched_at.slice(0, 10) === today,
    );
    const status = currentWorkStatus(todayRecords);
    const anomalies = detectAnomalies(summaries, today);
    const level = overtimeLevel(total.totalOvertimeMinutes);

    return { user: u, total, status, anomalies, level };
  });

  // 在勤状況カウント
  const statusCounts = userSummaries.reduce(
    (acc, { status }) => {
      acc[status] = (acc[status] ?? 0) + 1;
      return acc;
    },
    { working: 0, break: 0, done: 0, off: 0 } as Record<WorkStatus, number>,
  );

  // 36協定警告対象メンバー
  const overtimeWarnings = userSummaries.filter(
    (s) => s.level === "warning" || s.level === "critical",
  );
  const overtimeWatch = userSummaries.filter((s) => s.level === "watch");

  // 異常検知フラット化
  const allAnomalies = userSummaries.flatMap((s) =>
    s.anomalies.map((a) => ({ ...a, userName: s.user.name })),
  );

  const pendingExpenseTotal = pendingExpenses.reduce((sum, c) => sum + c.amount, 0);
  const aiFlaggedCount = pendingExpenses.filter((c) => c.status === "ai_flagged").length;

  // チーム合計
  const teamTotal = userSummaries.reduce(
    (acc, { total }) => ({
      workDays: acc.workDays + total.workDays,
      workMinutes: acc.workMinutes + total.totalWorkMinutes,
      overtimeMinutes: acc.overtimeMinutes + total.totalOvertimeMinutes,
    }),
    { workDays: 0, workMinutes: 0, overtimeMinutes: 0 },
  );

  return (
    <AppShell user={{ name: user.name, role: user.role, employment: user.employment_type }}>
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight md:text-[24px]">
            チーム
          </h1>
          <p className="mt-1.5 text-[13px] text-[var(--text-tertiary)]">
            全メンバーの月次勤怠サマリ
          </p>
        </div>
        <Link href="/admin/users" className="u-btn u-btn-secondary">
          ユーザー管理
          <ArrowRight size={14} strokeWidth={1.75} />
        </Link>
      </div>

      {/* 承認待ちバナー（立替精算） */}
      {pendingExpenses.length > 0 && (
        <Link
          href="/admin/expenses"
          className="mb-5 flex items-center justify-between gap-2 rounded-[10px] border border-amber-200 bg-gradient-to-r from-amber-50 to-orange-50 px-4 py-3 transition-shadow hover:shadow-[var(--shadow-elevated)] md:gap-4 md:px-5 md:py-3.5"
        >
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-700">
              <Receipt size={16} strokeWidth={1.75} />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-x-2 text-[13px] font-semibold text-amber-900">
                <span>立替精算 承認待ち {pendingExpenses.length} 件</span>
                <span className="text-[12px] font-medium text-amber-800/80">
                  合計 {formatYen(pendingExpenseTotal)}
                </span>
                {aiFlaggedCount > 0 && (
                  <span className="rounded-[4px] bg-orange-100 px-1.5 py-0.5 text-[11px] text-orange-800">
                    AI要確認 {aiFlaggedCount}
                  </span>
                )}
              </div>
              <div className="mt-0.5 text-[11px] text-amber-700/80">
                承認=振込完了として処理されます
              </div>
            </div>
          </div>
          <ArrowRight size={16} strokeWidth={1.75} className="shrink-0 text-amber-700" />
        </Link>
      )}

      {/* Month nav */}
      <div className="u-card mb-5 flex items-center justify-between px-4 py-3">
        <Link
          href={`/admin?ym=${prevYm}`}
          className="flex items-center gap-1 rounded-[6px] px-2 py-1 text-[13px] text-[var(--text-tertiary)] transition-colors hover:bg-[var(--bg-body)] hover:text-[var(--text-primary)]"
        >
          <ChevronLeft size={14} strokeWidth={1.75} />
          {prevDateUtc.getUTCFullYear()}年{prevDateUtc.getUTCMonth() + 1}月
        </Link>
        <div className="text-[15px] font-semibold tracking-tight">
          {year}年{month}月
        </div>
        <Link
          href={`/admin?ym=${nextYm}`}
          className="flex items-center gap-1 rounded-[6px] px-2 py-1 text-[13px] text-[var(--text-tertiary)] transition-colors hover:bg-[var(--bg-body)] hover:text-[var(--text-primary)]"
        >
          {nextDateUtc.getUTCFullYear()}年{nextDateUtc.getUTCMonth() + 1}月
          <ChevronRight size={14} strokeWidth={1.75} />
        </Link>
      </div>

      {/* Team totals */}
      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
        <StatTile
          label="メンバー"
          value={String(users.length)}
          unit="人"
          icon={UsersIcon}
          tone="blue"
        />
        <StatTile
          label="総稼働日数"
          value={String(teamTotal.workDays)}
          unit="日"
          icon={CalendarCheck}
          tone="emerald"
        />
        <StatTile
          label="総実働時間"
          value={formatHoursDecimal(teamTotal.workMinutes)}
          unit="h"
          icon={Clock3}
          tone="blue"
        />
        <StatTile
          label="総残業時間"
          value={formatHoursDecimal(teamTotal.overtimeMinutes)}
          unit="h"
          icon={TrendingUp}
          tone={teamTotal.overtimeMinutes > 0 ? "rose" : "blue"}
          highlight={teamTotal.overtimeMinutes > 0}
        />
      </div>

      {/* Realtime attendance status */}
      <section className="u-card mb-5 p-5">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity size={14} strokeWidth={1.75} className="text-[var(--brand-accent)]" />
            <h2 className="text-[14px] font-semibold tracking-tight">
              現在の在勤状況
            </h2>
          </div>
          <span className="text-[11px] text-[var(--text-tertiary)]">
            {today} 時点
          </span>
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <StatusChip
            label="出勤中"
            count={statusCounts.working}
            tone="emerald"
            icon={Activity}
          />
          <StatusChip
            label="休憩中"
            count={statusCounts.break}
            tone="amber"
            icon={Coffee}
          />
          <StatusChip
            label="退勤済"
            count={statusCounts.done}
            tone="blue"
            icon={CheckCircle2}
          />
          <StatusChip
            label="未出勤"
            count={statusCounts.off}
            tone="muted"
            icon={Circle}
          />
        </div>
      </section>

      {/* 36協定アラート + 打刻異常 (2カラム) */}
      <div className="mb-5 grid gap-4 md:grid-cols-2">
        {/* 36協定 */}
        <section className="u-card p-5">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ShieldAlert
                size={14}
                strokeWidth={1.75}
                className="text-[var(--accent-amber)]"
              />
              <h2 className="text-[14px] font-semibold tracking-tight">
                36協定アラート
              </h2>
            </div>
            <span className="text-[11px] text-[var(--text-tertiary)]">
              月45h超で警告・80h超で重大
            </span>
          </div>
          {overtimeWarnings.length === 0 && overtimeWatch.length === 0 ? (
            <div className="rounded-[8px] bg-[var(--accent-emerald-soft)] px-3 py-2.5 text-[12.5px] text-[#047857]">
              ✓ 今月、警告対象はいません
            </div>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {overtimeWarnings.map((s) => (
                <OvertimeRow
                  key={s.user.id}
                  name={s.user.name}
                  minutes={s.total.totalOvertimeMinutes}
                  level={s.level}
                />
              ))}
              {overtimeWatch.map((s) => (
                <OvertimeRow
                  key={s.user.id}
                  name={s.user.name}
                  minutes={s.total.totalOvertimeMinutes}
                  level={s.level}
                />
              ))}
            </ul>
          )}
        </section>

        {/* 打刻異常 */}
        <section className="u-card p-5">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertTriangle
                size={14}
                strokeWidth={1.75}
                className="text-[var(--accent-rose)]"
              />
              <h2 className="text-[14px] font-semibold tracking-tight">
                打刻異常
              </h2>
            </div>
            <span className="text-[11px] text-[var(--text-tertiary)]">
              退勤忘れ・長時間・休憩未取得
            </span>
          </div>
          {allAnomalies.length === 0 ? (
            <div className="rounded-[8px] bg-[var(--accent-emerald-soft)] px-3 py-2.5 text-[12.5px] text-[#047857]">
              ✓ 今月、異常はありません
            </div>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {allAnomalies.slice(0, 5).map((a, i) => (
                <li
                  key={`${a.userName}-${a.date}-${a.type}-${i}`}
                  className="flex items-center justify-between gap-3 rounded-[6px] bg-[var(--accent-rose-soft)]/60 px-3 py-2"
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="shrink-0 text-[12px] font-medium text-[var(--text-primary)]">
                      {a.userName}
                    </span>
                    <span className="truncate text-[11.5px] text-[var(--text-tertiary)]">
                      {a.detail}
                    </span>
                  </div>
                  <span className="shrink-0 rounded-[4px] bg-white px-1.5 py-0.5 text-[10px] font-medium text-[var(--accent-rose)]">
                    {a.label}
                  </span>
                </li>
              ))}
              {allAnomalies.length > 5 && (
                <li className="pl-3 pt-1 text-[11px] text-[var(--text-tertiary)]">
                  他 {allAnomalies.length - 5} 件
                </li>
              )}
            </ul>
          )}
        </section>
      </div>

      {/* Members list (mobile: cards / desktop: table) */}
      <div className="u-card overflow-hidden">
        {/* Mobile cards */}
        <ul className="divide-y divide-[var(--border-light)] md:hidden">
          {userSummaries.map(({ user: u, total, status }) => (
            <li key={u.id} className="px-4 py-3">
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 flex-col gap-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[14px] font-semibold text-[var(--text-primary)]">
                      {u.name}
                    </span>
                    <span className="rounded-[4px] border border-[var(--border-light)] bg-white px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-[var(--text-tertiary)]">
                      {EMPLOYMENT_LABEL[u.employment_type] ?? u.employment_type}
                    </span>
                  </div>
                  <StatusPill status={status} />
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1 text-[11px]">
                  <Link
                    href={`/history?ym=${targetYm}&user_id=${u.id}`}
                    className="font-medium text-[var(--brand-accent)] hover:underline"
                  >
                    勤怠履歴
                  </Link>
                  <a
                    href={`/api/export?ym=${targetYm}&user_id=${u.id}`}
                    className="inline-flex items-center gap-1 font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                  >
                    <Download size={12} strokeWidth={1.75} />
                    Excel
                  </a>
                </div>
              </div>
              <div className="mt-2 grid grid-cols-3 gap-2 text-[11px]">
                <div className="flex flex-col">
                  <span className="text-[10px] uppercase tracking-wider text-[var(--text-tertiary)]">
                    稼働
                  </span>
                  <span className="tabular-nums text-[13px] font-medium">
                    {total.workDays}日
                  </span>
                </div>
                <div className="flex flex-col">
                  <span className="text-[10px] uppercase tracking-wider text-[var(--text-tertiary)]">
                    実働
                  </span>
                  <span className="tabular-nums text-[13px] font-medium">
                    {formatHoursDecimal(total.totalWorkMinutes)}h
                  </span>
                </div>
                <div className="flex flex-col">
                  <span className="text-[10px] uppercase tracking-wider text-[var(--text-tertiary)]">
                    残業
                  </span>
                  <span
                    className={`tabular-nums text-[13px] ${
                      total.totalOvertimeMinutes > 0
                        ? "font-medium text-[var(--accent-indigo)]"
                        : "text-[var(--text-quaternary)]"
                    }`}
                  >
                    {total.totalOvertimeMinutes > 0
                      ? `${formatHoursDecimal(total.totalOvertimeMinutes)}h`
                      : "—"}
                  </span>
                </div>
              </div>
            </li>
          ))}
        </ul>

        {/* Desktop table */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-[var(--border-brand)] bg-[var(--brand-50)] text-left">
                <Th>氏名</Th>
                <Th>状態</Th>
                <Th>雇用形態</Th>
                <Th>稼働日数</Th>
                <Th>実働時間</Th>
                <Th>残業時間</Th>
                <Th>操作</Th>
              </tr>
            </thead>
            <tbody>
              {userSummaries.map(({ user: u, total, status }) => (
                <tr
                  key={u.id}
                  className="border-b border-[var(--border-light)] transition-colors last:border-0 hover:bg-[var(--brand-50)]"
                >
                  <td className="px-4 py-3">
                    <span className="font-semibold text-[var(--text-primary)]">
                      {u.name}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <StatusPill status={status} />
                  </td>
                  <td className="px-4 py-3">
                    <span className="rounded-[4px] border border-[var(--border-light)] bg-white px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-[var(--text-tertiary)]">
                      {EMPLOYMENT_LABEL[u.employment_type] ?? u.employment_type}
                    </span>
                  </td>
                  <td className="px-4 py-3 tabular-nums">{total.workDays}日</td>
                  <td className="px-4 py-3 tabular-nums">
                    {formatHoursDecimal(total.totalWorkMinutes)}h
                  </td>
                  <td
                    className={`px-4 py-3 tabular-nums ${
                      total.totalOvertimeMinutes > 0
                        ? "font-medium text-[var(--accent-indigo)]"
                        : "text-[var(--text-quaternary)]"
                    }`}
                  >
                    {total.totalOvertimeMinutes > 0
                      ? `${formatHoursDecimal(total.totalOvertimeMinutes)}h`
                      : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <Link
                        href={`/history?ym=${targetYm}&user_id=${u.id}`}
                        className="inline-flex items-center gap-1 text-[12px] font-medium text-[var(--brand-accent)] transition-colors hover:underline"
                      >
                        勤怠履歴
                      </Link>
                      <a
                        href={`/api/export?ym=${targetYm}&user_id=${u.id}`}
                        className="inline-flex items-center gap-1 text-[12px] font-medium text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]"
                      >
                        <Download size={12} strokeWidth={1.75} />
                        Excel
                      </a>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </AppShell>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-[var(--text-tertiary)]">
      {children}
    </th>
  );
}

function StatusPill({ status }: { status: WorkStatus }) {
  const map: Record<WorkStatus, { label: string; dot: string; text: string; bg: string }> = {
    working: {
      label: "出勤中",
      dot: "bg-[var(--accent-emerald)]",
      text: "text-[#047857]",
      bg: "bg-[var(--accent-emerald-soft)]",
    },
    break: {
      label: "休憩中",
      dot: "bg-[var(--accent-amber)]",
      text: "text-[#b45309]",
      bg: "bg-[var(--accent-amber-soft)]",
    },
    done: {
      label: "退勤済",
      dot: "bg-[var(--brand-accent)]",
      text: "text-[var(--brand-primary)]",
      bg: "bg-[var(--brand-accent-soft)]",
    },
    off: {
      label: "未出勤",
      dot: "bg-[var(--text-quaternary)]",
      text: "text-[var(--text-tertiary)]",
      bg: "bg-[var(--bg-subtle-alt)]",
    },
  };
  const s = map[status];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium ${s.bg} ${s.text}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
      {s.label}
    </span>
  );
}

function StatusChip({
  label,
  count,
  tone,
  icon: Icon,
}: {
  label: string;
  count: number;
  tone: "emerald" | "amber" | "blue" | "muted";
  icon: LucideIcon;
}) {
  const map = {
    emerald: {
      bg: "bg-[var(--accent-emerald-soft)]",
      iconFg: "text-[var(--accent-emerald)]",
      value: "text-[#047857]",
    },
    amber: {
      bg: "bg-[var(--accent-amber-soft)]",
      iconFg: "text-[var(--accent-amber)]",
      value: "text-[#b45309]",
    },
    blue: {
      bg: "bg-[var(--brand-accent-soft)]",
      iconFg: "text-[var(--brand-accent)]",
      value: "text-[var(--brand-primary)]",
    },
    muted: {
      bg: "bg-[var(--bg-subtle-alt)]",
      iconFg: "text-[var(--text-tertiary)]",
      value: "text-[var(--text-secondary)]",
    },
  }[tone];
  return (
    <div className="flex items-center gap-3 rounded-[8px] border border-[var(--border-light)] bg-white px-3 py-2.5">
      <div className={`flex h-8 w-8 items-center justify-center rounded-[6px] ${map.bg}`}>
        <Icon size={14} strokeWidth={2} className={map.iconFg} />
      </div>
      <div className="flex flex-col">
        <span className="text-[11px] text-[var(--text-tertiary)]">{label}</span>
        <span className={`tabular-nums text-[18px] font-semibold leading-none ${map.value}`}>
          {count}
          <span className="ml-0.5 text-[11px] font-medium text-[var(--text-tertiary)]">人</span>
        </span>
      </div>
    </div>
  );
}

function OvertimeRow({
  name,
  minutes,
  level,
}: {
  name: string;
  minutes: number;
  level: OvertimeLevel;
}) {
  const map: Record<
    OvertimeLevel,
    { label: string; bg: string; badge: string; badgeFg: string }
  > = {
    critical: {
      label: "80h超",
      bg: "bg-[var(--accent-rose-soft)]/60",
      badge: "bg-[var(--accent-rose)]",
      badgeFg: "text-white",
    },
    warning: {
      label: "45h超",
      bg: "bg-[var(--accent-amber-soft)]/60",
      badge: "bg-[var(--accent-amber)]",
      badgeFg: "text-white",
    },
    watch: {
      label: "30h超",
      bg: "bg-[var(--brand-accent-soft)]",
      badge: "bg-[var(--brand-accent)]",
      badgeFg: "text-white",
    },
    safe: {
      label: "—",
      bg: "bg-transparent",
      badge: "bg-transparent",
      badgeFg: "text-[var(--text-tertiary)]",
    },
  };
  const s = map[level];
  return (
    <li className={`flex items-center justify-between gap-3 rounded-[6px] px-3 py-2 ${s.bg}`}>
      <div className="flex min-w-0 items-center gap-2">
        <span className="shrink-0 text-[12px] font-medium text-[var(--text-primary)]">
          {name}
        </span>
        <span className="truncate text-[11.5px] tabular-nums text-[var(--text-tertiary)]">
          残業 {formatHoursDecimal(minutes)}h
        </span>
      </div>
      <span
        className={`shrink-0 rounded-[4px] px-1.5 py-0.5 text-[10px] font-semibold ${s.badge} ${s.badgeFg}`}
      >
        {s.label}
      </span>
    </li>
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
