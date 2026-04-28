import { redirect } from "next/navigation";
import Link from "next/link";
import {
  Plus,
  CheckCircle2,
  Clock,
  XCircle,
  ShieldAlert,
  Receipt,
  CalendarDays,
  Ban,
} from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import AppShell from "@/components/AppShell";
import { dbAll } from "@/lib/db";
import {
  listExpensesForUser,
  monthlyStatsForUser,
  statusLabel,
  formatYen,
  type ExpenseStatus,
} from "@/lib/expenses";
import { currentYearMonth } from "@/lib/time";
import {
  calcBalanceForUser,
  durationTypeLabel,
  formatDays,
  leaveTypeLabel,
  listSpecialPolicies,
  nextPaidLeaveGrant,
  requestToDays,
  STATUS_LABEL,
  type LeaveGrant,
  type LeaveRequest,
} from "@/lib/leaves";
import { cancelLeaveRequest } from "./actions";

type Tab = "expense" | "leave";

export default async function RequestsPage({
  searchParams,
}: {
  searchParams: Promise<{
    tab?: string;
    new?: string;
    error?: string;
    success?: string;
  }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.employment_type === "crew") redirect("/");

  const sp = await searchParams;
  const tab: Tab = sp.tab === "leave" ? "leave" : "expense";

  return (
    <AppShell
      user={{ name: user.name, role: user.role, employment: user.employment_type }}
    >
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight md:text-[24px]">
            各種申請
          </h1>
          <p className="mt-1.5 text-[13px] text-[var(--text-tertiary)]">
            {user.name} の立替精算と休暇申請
          </p>
        </div>
        <Link
          href={tab === "expense" ? "/expenses/new" : "/requests/leaves/new"}
          className="u-btn u-btn-primary"
        >
          <Plus size={14} strokeWidth={1.75} />
          {tab === "expense" ? "立替精算を新規申請" : "休暇を新規申請"}
        </Link>
      </div>

      {/* タブ */}
      <div className="mb-5 flex gap-1 border-b border-[var(--border-light)]">
        <TabLink href="/requests?tab=expense" active={tab === "expense"} icon={Receipt}>
          立替精算
        </TabLink>
        <TabLink href="/requests?tab=leave" active={tab === "leave"} icon={CalendarDays}>
          休暇
        </TabLink>
      </div>

      {tab === "expense" ? (
        <ExpensePanel userId={user.id} newId={sp.new} />
      ) : (
        <LeavePanel
          userId={user.id}
          newId={sp.new}
          successCode={sp.success}
          errorCode={sp.error}
        />
      )}
    </AppShell>
  );
}

function TabLink({
  href,
  active,
  icon: Icon,
  children,
}: {
  href: string;
  active: boolean;
  icon: typeof Receipt;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={`flex items-center gap-1.5 border-b-2 px-3 py-2 text-[13px] font-medium transition-colors ${
        active
          ? "border-[var(--brand-accent)] text-[var(--brand-accent)]"
          : "border-transparent text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
      }`}
    >
      <Icon size={14} strokeWidth={1.75} />
      {children}
    </Link>
  );
}

// ============== 立替精算パネル =================
async function ExpensePanel({
  userId,
  newId,
}: {
  userId: number;
  newId: string | undefined;
}) {
  const ym = currentYearMonth();
  const [claims, stats] = await Promise.all([
    listExpensesForUser(userId),
    monthlyStatsForUser(userId, ym),
  ]);

  return (
    <>
      {newId && (
        <div className="mb-5 flex items-center gap-2 rounded-[8px] border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-[13px] text-emerald-700">
          <CheckCircle2 size={16} strokeWidth={1.75} />
          申請を受け付けました（ID: {newId}）。承認後に振込が完了します。
        </div>
      )}

      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-4">
        <StatTile label="今月 承認済・振込済" value={formatYen(stats.totalAmount)} />
        <StatTile label="申請中" value={`${stats.pendingCount} 件`} />
        <StatTile label="今月 承認済件数" value={`${stats.approvedCount} 件`} />
      </div>

      {claims.length === 0 ? (
        <div className="u-card flex flex-col items-center justify-center gap-3 p-12 text-center">
          <Receipt size={28} strokeWidth={1.5} className="text-[var(--text-quaternary)]" />
          <div>
            <p className="text-[14px] font-medium text-[var(--text-secondary)]">
              まだ申請がありません
            </p>
            <p className="mt-1 text-[12px] text-[var(--text-quaternary)]">
              交通費・立替経費を申請すると、ここに一覧が表示されます
            </p>
          </div>
          <Link href="/expenses/new" className="u-btn u-btn-primary mt-2">
            <Plus size={14} strokeWidth={1.75} />
            最初の申請を作成
          </Link>
        </div>
      ) : (
        <div className="u-card overflow-hidden">
          <ul className="divide-y divide-[var(--border-light)] md:hidden">
            {claims.map((c) => (
              <li key={c.id} className="px-4 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 flex-col gap-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="tabular-nums text-[12px] text-[var(--text-tertiary)]">
                        {c.claim_date}
                      </span>
                      <span className="rounded-[4px] bg-[var(--brand-50)] px-2 py-0.5 text-[11px] font-medium text-[var(--brand-primary)]">
                        {c.category}
                      </span>
                    </div>
                    <div className="text-[13px] text-[var(--text-primary)] break-words">
                      {c.purpose}
                    </div>
                    {c.category === "交通費" && (c.route_from || c.route_to) && (
                      <div className="text-[11px] text-[var(--text-quaternary)] break-words">
                        {c.route_from} → {c.route_to}
                      </div>
                    )}
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <span className="tabular-nums text-[14px] font-semibold text-[var(--text-primary)]">
                      {formatYen(c.amount)}
                    </span>
                    <ExpenseStatusChip status={c.status} />
                  </div>
                </div>
              </li>
            ))}
          </ul>

          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-[var(--border-brand)] bg-[var(--brand-50)] text-left">
                  <Th>申請日</Th>
                  <Th>カテゴリ</Th>
                  <Th>用途</Th>
                  <Th align="right">金額</Th>
                  <Th>ステータス</Th>
                </tr>
              </thead>
              <tbody>
                {claims.map((c) => (
                  <tr
                    key={c.id}
                    className="border-b border-[var(--border-light)] transition-colors last:border-0 hover:bg-[var(--brand-50)]/50"
                  >
                    <Td mono>{c.claim_date}</Td>
                    <Td>
                      <span className="rounded-[4px] bg-[var(--brand-50)] px-2 py-0.5 text-[11px] font-medium text-[var(--brand-primary)]">
                        {c.category}
                      </span>
                    </Td>
                    <Td>
                      <div className="max-w-[280px] truncate">{c.purpose}</div>
                      {c.category === "交通費" && (c.route_from || c.route_to) && (
                        <div className="mt-0.5 truncate text-[11px] text-[var(--text-quaternary)]">
                          {c.route_from} → {c.route_to}
                        </div>
                      )}
                    </Td>
                    <Td mono align="right" strong>
                      {formatYen(c.amount)}
                    </Td>
                    <Td>
                      <ExpenseStatusChip status={c.status} />
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}

// ============== 休暇申請パネル =================
async function LeavePanel({
  userId,
  newId,
  successCode,
  errorCode,
}: {
  userId: number;
  newId: string | undefined;
  successCode: string | undefined;
  errorCode: string | undefined;
}) {
  // ユーザーの hire_date を取得（次回付与予定の表示用）
  const userRow = await import("@/lib/db").then(({ dbGet }) =>
    dbGet<{ hire_date: string | null }>(
      `SELECT hire_date FROM users WHERE id = ?`,
      [userId],
    ),
  );

  const [balances, requests, grants, policies] = await Promise.all([
    calcBalanceForUser(userId),
    dbAll<LeaveRequest>(
      `SELECT id, user_id, leave_type, special_policy_code, start_date, end_date,
              duration_type, hours_used, reason, status, approver_id, approved_at,
              rejection_reason, created_at
       FROM leave_requests
       WHERE user_id = ?
       ORDER BY start_date DESC, id DESC`,
      [userId],
    ),
    dbAll<LeaveGrant>(
      `SELECT id, user_id, leave_type, special_policy_code, granted_days, granted_at, source, notes
       FROM leave_grants
       WHERE user_id = ?
       ORDER BY granted_at DESC`,
      [userId],
    ),
    listSpecialPolicies(),
  ]);

  const policyByCode = new Map(policies.map((p) => [p.code, p]));
  const paidBalance = balances.paid;
  const specialBalance = balances.special;
  const next = userRow?.hire_date ? nextPaidLeaveGrant(userRow.hire_date) : null;

  return (
    <>
      {newId && (
        <div className="mb-5 flex items-center gap-2 rounded-[8px] border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-[13px] text-emerald-700">
          <CheckCircle2 size={16} strokeWidth={1.75} />
          休暇申請を受け付けました（ID: {newId}）。
        </div>
      )}
      {successCode && (
        <div className="mb-5 rounded-[8px] border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-[13px] text-emerald-700">
          ✅ {successMessage(successCode)}
        </div>
      )}
      {errorCode && (
        <div className="mb-5 rounded-[8px] border border-rose-200 bg-rose-50 px-4 py-2.5 text-[13px] text-rose-800">
          ⚠️ {errorMessage(errorCode)}
        </div>
      )}

      {/* 残日数 */}
      <div className="mb-5 grid grid-cols-1 gap-3 md:grid-cols-2 md:gap-4">
        <BalanceCard
          title="年次有給休暇"
          balance={paidBalance}
          subtitle={
            next
              ? `次回付与予定: ${next.granted_at}（+${next.days}日）`
              : userRow?.hire_date
                ? "次回付与予定なし"
                : "入社日が未登録のため自動付与は無効"
          }
        />
        <BalanceCard
          title="特別休暇"
          balance={specialBalance}
          subtitle="慶弔等の事由発生時に管理者が付与"
        />
      </div>

      {/* 申請一覧 */}
      <section className="u-card mb-6 overflow-hidden">
        <header className="border-b border-[var(--border-light)] bg-[var(--brand-50)] px-4 py-3">
          <h2 className="text-[14px] font-semibold tracking-tight">申請履歴</h2>
        </header>
        {requests.length === 0 ? (
          <div className="px-4 py-10 text-center text-[13px] text-[var(--text-tertiary)]">
            まだ申請はありません。
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead className="bg-[var(--bg-body)] text-[11px] text-[var(--text-tertiary)]">
                <tr>
                  <th className="px-3 py-2 text-left font-normal">期間</th>
                  <th className="px-3 py-2 text-left font-normal">種別</th>
                  <th className="px-3 py-2 text-left font-normal">区分</th>
                  <th className="px-3 py-2 text-right font-normal">日数</th>
                  <th className="px-3 py-2 text-left font-normal">理由</th>
                  <th className="px-3 py-2 text-left font-normal">状態</th>
                  <th className="px-3 py-2 text-right font-normal">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-light)]">
                {requests.map((r) => {
                  const policy = r.special_policy_code
                    ? policyByCode.get(r.special_policy_code)
                    : null;
                  const days = requestToDays(r);
                  return (
                    <tr key={r.id}>
                      <td className="px-3 py-2.5 align-top tabular-nums">
                        {r.start_date}
                        {r.start_date !== r.end_date && (
                          <span className="text-[var(--text-tertiary)]">
                            {" "}〜 {r.end_date}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 align-top">
                        {leaveTypeLabel(r.leave_type)}
                        {policy && (
                          <span className="block text-[10px] text-[var(--text-tertiary)]">
                            {policy.name}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 align-top text-[11px]">
                        {durationTypeLabel(r.duration_type)}
                        {r.duration_type === "hourly" && r.hours_used && (
                          <span className="ml-1 tabular-nums">
                            {r.hours_used}h
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums align-top">
                        {formatDays(days)}
                      </td>
                      <td className="px-3 py-2.5 align-top max-w-[200px] truncate">
                        {r.reason ?? (
                          <span className="text-[var(--text-quaternary)]">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 align-top">
                        <LeaveStatusChip status={r.status} />
                        {r.status === "rejected" && r.rejection_reason && (
                          <div className="mt-0.5 text-[10px] text-rose-700">
                            {r.rejection_reason}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-right align-top">
                        {r.status === "pending" && (
                          <form
                            action={cancelLeaveRequest}
                            onSubmit={undefined}
                          >
                            <input type="hidden" name="id" value={r.id} />
                            <button
                              type="submit"
                              className="text-[11px] text-rose-600 hover:text-rose-800"
                            >
                              <Ban size={11} className="inline" /> 取消
                            </button>
                          </form>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* 付与履歴 */}
      <section className="u-card overflow-hidden">
        <header className="border-b border-[var(--border-light)] bg-[var(--brand-50)] px-4 py-3">
          <h2 className="text-[14px] font-semibold tracking-tight">付与履歴</h2>
        </header>
        {grants.length === 0 ? (
          <div className="px-4 py-10 text-center text-[13px] text-[var(--text-tertiary)]">
            付与履歴はまだありません。
          </div>
        ) : (
          <ul className="divide-y divide-[var(--border-light)] text-[12px]">
            {grants.map((g) => {
              const policy = g.special_policy_code
                ? policyByCode.get(g.special_policy_code)
                : null;
              return (
                <li
                  key={g.id}
                  className="flex items-center justify-between gap-3 px-4 py-2.5"
                >
                  <div className="flex flex-col">
                    <span>
                      {leaveTypeLabel(g.leave_type)}
                      {policy && (
                        <span className="ml-1 text-[var(--text-tertiary)]">
                          ({policy.name})
                        </span>
                      )}
                      <span className="ml-2 rounded-[3px] border border-[var(--border-light)] bg-white px-1 py-0.5 text-[10px] text-[var(--text-tertiary)]">
                        {g.source === "auto" ? "自動付与" : "手動付与"}
                      </span>
                    </span>
                    {g.notes && (
                      <span className="text-[10px] text-[var(--text-tertiary)]">
                        {g.notes}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="tabular-nums text-[var(--text-tertiary)]">
                      {g.granted_at}
                    </span>
                    <span className="tabular-nums font-semibold">
                      +{formatDays(g.granted_days)}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </>
  );
}

function BalanceCard({
  title,
  balance,
  subtitle,
}: {
  title: string;
  balance:
    | {
        granted_days: number;
        expired_days?: number;
        used_days: number;
        pending_days: number;
        remaining_days: number;
      }
    | undefined;
  subtitle?: string;
}) {
  const granted = balance?.granted_days ?? 0;
  const expired = balance?.expired_days ?? 0;
  const used = balance?.used_days ?? 0;
  const pending = balance?.pending_days ?? 0;
  const remaining = balance?.remaining_days ?? 0;
  return (
    <div className="u-card p-4 md:p-5">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[12px] font-medium text-[var(--text-secondary)]">
          {title}
        </span>
        <span className="text-[10px] text-[var(--text-tertiary)]">残日数</span>
      </div>
      <div className="mt-1 flex items-baseline gap-2">
        <span className="text-[28px] font-semibold tabular-nums tracking-tight">
          {formatDays(remaining)}
        </span>
        {pending > 0 && (
          <span className="text-[11px] text-amber-700">
            （申請中: {formatDays(pending)}）
          </span>
        )}
      </div>
      <div className="mt-1 text-[11px] tabular-nums text-[var(--text-tertiary)]">
        付与累計 {formatDays(granted)} ・ 使用 {formatDays(used)}
        {expired > 0 && (
          <span className="ml-1 text-rose-600">・ 期限切れ {formatDays(expired)}</span>
        )}
      </div>
      {subtitle && (
        <div className="mt-2 text-[11px] text-[var(--text-tertiary)]">{subtitle}</div>
      )}
    </div>
  );
}

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="u-card flex flex-col justify-between p-5">
      <span className="micro-label">{label}</span>
      <div className="mt-3 text-[22px] font-semibold leading-none tracking-tight tabular-nums">
        {value}
      </div>
    </div>
  );
}

function ExpenseStatusChip({ status }: { status: ExpenseStatus }) {
  const config: Record<
    ExpenseStatus,
    { Icon: typeof Clock; bg: string; fg: string; border: string }
  > = {
    pending: {
      Icon: Clock,
      bg: "bg-amber-50",
      fg: "text-amber-700",
      border: "border-amber-200",
    },
    ai_flagged: {
      Icon: ShieldAlert,
      bg: "bg-orange-50",
      fg: "text-orange-700",
      border: "border-orange-200",
    },
    approved: {
      Icon: CheckCircle2,
      bg: "bg-emerald-50",
      fg: "text-emerald-700",
      border: "border-emerald-200",
    },
    rejected: {
      Icon: XCircle,
      bg: "bg-rose-50",
      fg: "text-rose-700",
      border: "border-rose-200",
    },
  };
  const c = config[status];
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-[4px] border ${c.border} ${c.bg} ${c.fg} px-2 py-0.5 text-[11px] font-medium`}
    >
      <c.Icon size={11} strokeWidth={2} />
      {statusLabel(status)}
    </span>
  );
}

function LeaveStatusChip({ status }: { status: string }) {
  const config: Record<string, { bg: string; fg: string; border: string }> = {
    pending: { bg: "bg-amber-50", fg: "text-amber-800", border: "border-amber-200" },
    approved: {
      bg: "bg-emerald-50",
      fg: "text-emerald-800",
      border: "border-emerald-200",
    },
    rejected: { bg: "bg-rose-50", fg: "text-rose-800", border: "border-rose-200" },
    cancelled: { bg: "bg-slate-50", fg: "text-slate-700", border: "border-slate-200" },
  };
  const c = config[status] ?? config.pending!;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-[4px] border ${c.border} ${c.bg} ${c.fg} px-2 py-0.5 text-[11px] font-medium`}
    >
      {STATUS_LABEL[status] ?? status}
    </span>
  );
}

function Th({ children, align }: { children: React.ReactNode; align?: "right" }) {
  return (
    <th
      className={`px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-[var(--text-tertiary)] ${
        align === "right" ? "text-right" : ""
      }`}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  mono,
  strong,
  align,
}: {
  children: React.ReactNode;
  mono?: boolean;
  strong?: boolean;
  align?: "right";
}) {
  const classes = [
    "px-4 py-2.5",
    mono ? "tabular-nums" : "",
    strong ? "font-semibold text-[var(--text-primary)]" : "",
    align === "right" ? "text-right" : "",
  ].join(" ");
  return <td className={classes}>{children}</td>;
}

function successMessage(code: string): string {
  switch (code) {
    case "cancelled":
      return "申請を取消しました。";
    default:
      return code;
  }
}
function errorMessage(code: string): string {
  switch (code) {
    case "invalid_type":
      return "休暇種別が不正です。";
    case "invalid_duration":
      return "区分が不正です。";
    case "date_required":
      return "開始日を入力してください。";
    case "hours_required":
      return "時間休の時間数を入力してください。";
    case "single_day_only":
      return "半休・時間休は単日のみです。";
    case "policy_required":
      return "特別休暇の事由を選択してください。";
    case "not_found":
      return "対象の申請が見つかりません。";
    case "cannot_cancel":
      return "承認待ち以外の申請は取消できません。";
    case "db_error":
      return "保存に失敗しました（DBエラー）。";
    default:
      return `エラー（${code}）`;
  }
}
