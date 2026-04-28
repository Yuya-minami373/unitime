import { redirect } from "next/navigation";
import Link from "next/link";
import {
  Receipt,
  CalendarDays,
  CheckCircle2,
  Clock,
  XCircle,
  ShieldAlert,
  ExternalLink,
} from "lucide-react";
import { getCurrentUser, isAdmin } from "@/lib/auth";
import AppShell from "@/components/AppShell";
import { dbAll } from "@/lib/db";
import {
  listAllExpenses,
  statusLabel,
  formatYen,
  type ExpenseStatus,
  type ExpenseClaim,
} from "@/lib/expenses";
import { currentYearMonth } from "@/lib/time";
import {
  durationTypeLabel,
  formatDays,
  leaveTypeLabel,
  listSpecialPolicies,
  requestToDays,
  STATUS_LABEL,
  type LeaveRequest,
} from "@/lib/leaves";
import ApprovalActions from "../expenses/ApprovalActions";
import { LeaveApprovalActions } from "./LeaveApprovalActions";

type SearchParams = {
  tab?: string;
  subtab?: string;
  ym?: string;
  success?: string;
  error?: string;
};

type Tab = "expense" | "leave";

type LeaveRequestWithUser = LeaveRequest & {
  user_name: string | null;
  approver_name: string | null;
};

export default async function AdminRequestsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!isAdmin(user)) redirect("/");

  const sp = await searchParams;
  const tab: Tab = sp.tab === "leave" ? "leave" : "expense";

  return (
    <AppShell
      user={{ name: user.name, role: user.role, employment: user.employment_type }}
    >
      <div className="mb-6">
        <h1 className="text-[22px] font-semibold tracking-tight md:text-[24px]">
          各種申請の承認
        </h1>
        <p className="mt-1.5 text-[13px] text-[var(--text-tertiary)]">
          立替精算と休暇申請の承認・却下を行います
        </p>
      </div>

      {/* メインタブ */}
      <div className="mb-5 flex gap-1 border-b border-[var(--border-light)]">
        <TopTabLink
          href="/admin/requests?tab=expense"
          active={tab === "expense"}
          icon={Receipt}
        >
          立替精算
        </TopTabLink>
        <TopTabLink
          href="/admin/requests?tab=leave"
          active={tab === "leave"}
          icon={CalendarDays}
        >
          休暇
        </TopTabLink>
      </div>

      {tab === "expense" ? (
        <ExpenseAdminPanel
          subtab={sp.subtab === "history" ? "history" : "pending"}
          ym={sp.ym ?? currentYearMonth()}
        />
      ) : (
        <LeaveAdminPanel
          subtab={sp.subtab === "history" ? "history" : "pending"}
          successCode={sp.success}
          errorCode={sp.error}
        />
      )}
    </AppShell>
  );
}

// ============== 立替精算タブ =================
async function ExpenseAdminPanel({
  subtab,
  ym,
}: {
  subtab: "pending" | "history";
  ym: string;
}) {
  const [pendingClaims, monthlyClaims] = await Promise.all([
    listAllExpenses({ status: ["pending", "ai_flagged"] }),
    listAllExpenses({ ym }),
  ]);
  const aiEnabled = Boolean(process.env.ANTHROPIC_API_KEY?.startsWith("sk-ant"));

  const monthlyTotals = monthlyClaims.reduce(
    (acc, c) => {
      if (c.status === "approved") {
        acc.paidAmount += c.amount;
        acc.paidCount += 1;
      } else if (c.status === "pending" || c.status === "ai_flagged") {
        acc.pendingAmount += c.amount;
        acc.pendingCount += 1;
      }
      return acc;
    },
    { paidAmount: 0, pendingAmount: 0, paidCount: 0, pendingCount: 0 },
  );

  return (
    <>
      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
        <KpiTile
          label="承認待ち"
          value={`${pendingClaims.length} 件`}
          accent={pendingClaims.length > 0 ? "amber" : "neutral"}
        />
        <KpiTile
          label="承認待ち金額"
          value={formatYen(monthlyTotals.pendingAmount)}
          accent="amber"
        />
        <KpiTile
          label={`${ym.replace("-", "年")}月 承認済`}
          value={`${monthlyTotals.paidCount} 件`}
          accent="emerald"
        />
        <KpiTile
          label={`${ym.replace("-", "年")}月 振込済`}
          value={formatYen(monthlyTotals.paidAmount)}
          accent="emerald"
        />
      </div>

      <div className="mb-4 flex items-center gap-1 border-b border-[var(--border-light)]">
        <SubTabLink
          href="/admin/requests?tab=expense"
          label="承認待ち"
          active={subtab === "pending"}
          count={pendingClaims.length}
        />
        <SubTabLink
          href={`/admin/requests?tab=expense&subtab=history&ym=${ym}`}
          label="月次履歴"
          active={subtab === "history"}
        />
      </div>

      {subtab === "pending" ? (
        pendingClaims.length === 0 ? (
          <EmptyState message="承認待ちの立替精算はありません" />
        ) : (
          <div className="space-y-3">
            {pendingClaims.map((c) => (
              <PendingExpenseCard key={c.id} claim={c} aiEnabled={aiEnabled} />
            ))}
          </div>
        )
      ) : (
        <ExpenseHistoryTable claims={monthlyClaims} />
      )}
    </>
  );
}

function PendingExpenseCard({
  claim,
  aiEnabled,
}: {
  claim: ExpenseClaim;
  aiEnabled: boolean;
}) {
  const aiStatus = claim.ai_check_status;
  const showAiAlert = aiStatus === "warn" || aiStatus === "ng";

  return (
    <div className="u-card p-4 md:p-5">
      <div className="flex flex-col items-start justify-between gap-3 md:flex-row md:flex-wrap md:gap-4">
        <div className="w-full flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[15px] font-semibold text-[var(--text-primary)]">
              {claim.user_name}
            </span>
            <span className="rounded-[4px] bg-[var(--brand-50)] px-2 py-0.5 text-[11px] font-medium text-[var(--brand-primary)]">
              {claim.category}
            </span>
            {aiStatus === "ok" && (
              <span className="inline-flex items-center gap-1 rounded-[4px] border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
                ✅ AIチェック: 問題なし
              </span>
            )}
            {showAiAlert && (
              <span
                className={`inline-flex items-center gap-1 rounded-[4px] border px-2 py-0.5 text-[11px] font-medium ${
                  aiStatus === "ng"
                    ? "border-rose-200 bg-rose-50 text-rose-700"
                    : "border-orange-200 bg-orange-50 text-orange-700"
                }`}
              >
                <ShieldAlert size={11} strokeWidth={2} />
                {aiStatus === "ng" ? "AI: 疑義あり" : "AI: 要確認"}
              </span>
            )}
            {!aiStatus && aiEnabled && (
              <span className="inline-flex items-center gap-1 rounded-[4px] border border-[var(--border-light)] bg-white px-2 py-0.5 text-[11px] font-medium text-[var(--text-tertiary)]">
                <Clock size={11} strokeWidth={2} />
                AIチェック中…
              </span>
            )}
          </div>
          <div className="mt-1 text-[12px] text-[var(--text-tertiary)] tabular-nums">
            申請日 {claim.claim_date}
          </div>

          {showAiAlert && claim.ai_check_reason && (
            <div
              className={`mt-3 flex items-start gap-2 rounded-[6px] border px-3 py-2 text-[12px] ${
                aiStatus === "ng"
                  ? "border-rose-200 bg-rose-50 text-rose-700"
                  : "border-orange-200 bg-orange-50 text-orange-700"
              }`}
            >
              <ShieldAlert size={13} strokeWidth={2} className="mt-0.5 shrink-0" />
              <div>
                <div className="font-semibold">AI確認事項</div>
                <div className="mt-0.5 leading-relaxed">{claim.ai_check_reason}</div>
              </div>
            </div>
          )}

          <div className="mt-3 text-[13px] text-[var(--text-secondary)]">
            {claim.purpose}
          </div>
          {claim.category === "交通費" && (claim.route_from || claim.route_to) && (
            <div className="mt-1 text-[12px] text-[var(--text-tertiary)]">
              経路: {claim.route_from} → {claim.route_to}
            </div>
          )}
          {claim.project_name && (
            <div className="mt-1 text-[12px] text-[var(--text-tertiary)]">
              案件: {claim.project_name}
            </div>
          )}
          {claim.notes && (
            <div className="mt-1 text-[12px] text-[var(--text-tertiary)]">
              備考: {claim.notes}
            </div>
          )}
          {claim.receipt_path && (
            <a
              href={claim.receipt_path}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-flex items-center gap-1 text-[12px] text-[var(--brand-accent)] hover:underline"
            >
              <ExternalLink size={11} strokeWidth={2} />
              領収書を開く
            </a>
          )}
        </div>

        <div className="flex w-full items-center justify-between gap-3 md:w-auto md:flex-col md:items-end">
          <div className="text-[20px] font-semibold tabular-nums text-[var(--text-primary)] md:text-[22px]">
            {formatYen(claim.amount)}
          </div>
          <ApprovalActions
            id={claim.id}
            amount={claim.amount}
            userName={claim.user_name ?? "申請者"}
          />
        </div>
      </div>
    </div>
  );
}

function ExpenseHistoryTable({ claims }: { claims: ExpenseClaim[] }) {
  if (claims.length === 0) {
    return <EmptyState message="この月の立替精算申請はありません" />;
  }
  return (
    <div className="u-card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="border-b border-[var(--border-brand)] bg-[var(--brand-50)] text-left">
              <Th>申請日</Th>
              <Th>申請者</Th>
              <Th>カテゴリ</Th>
              <Th>用途</Th>
              <Th align="right">金額</Th>
              <Th>状態</Th>
              <Th>承認者</Th>
            </tr>
          </thead>
          <tbody>
            {claims.map((c) => (
              <tr
                key={c.id}
                className="border-b border-[var(--border-light)] transition-colors last:border-0 hover:bg-[var(--brand-50)]/50"
              >
                <Td mono>{c.claim_date}</Td>
                <Td>{c.user_name}</Td>
                <Td>
                  <span className="rounded-[4px] bg-[var(--brand-50)] px-1.5 py-0.5 text-[11px] font-medium text-[var(--brand-primary)]">
                    {c.category}
                  </span>
                </Td>
                <Td>
                  <div className="max-w-[240px] truncate">{c.purpose}</div>
                </Td>
                <Td mono align="right" strong>
                  {formatYen(c.amount)}
                </Td>
                <Td>
                  <ExpenseStatusChip status={c.status} />
                </Td>
                <Td>
                  {c.approver_name ? (
                    <span className="text-[12px] text-[var(--text-tertiary)]">
                      {c.approver_name}
                    </span>
                  ) : (
                    <span className="text-[12px] text-[var(--text-quaternary)]">
                      —
                    </span>
                  )}
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ============== 休暇タブ =================
async function LeaveAdminPanel({
  subtab,
  successCode,
  errorCode,
}: {
  subtab: "pending" | "history";
  successCode: string | undefined;
  errorCode: string | undefined;
}) {
  const [pending, history, policies] = await Promise.all([
    dbAll<LeaveRequestWithUser>(
      `SELECT lr.id, lr.user_id, lr.leave_type, lr.special_policy_code,
              lr.start_date, lr.end_date, lr.duration_type, lr.hours_used,
              lr.start_time, lr.end_time,
              lr.reason, lr.status, lr.approver_id, lr.approved_at,
              lr.rejection_reason, lr.created_at,
              u.name as user_name, NULL as approver_name
       FROM leave_requests lr
       INNER JOIN users u ON u.id = lr.user_id
       WHERE lr.status = 'pending'
       ORDER BY lr.start_date ASC, lr.id ASC`,
      [],
    ),
    dbAll<LeaveRequestWithUser>(
      `SELECT lr.id, lr.user_id, lr.leave_type, lr.special_policy_code,
              lr.start_date, lr.end_date, lr.duration_type, lr.hours_used,
              lr.start_time, lr.end_time,
              lr.reason, lr.status, lr.approver_id, lr.approved_at,
              lr.rejection_reason, lr.created_at,
              u.name as user_name, ap.name as approver_name
       FROM leave_requests lr
       INNER JOIN users u ON u.id = lr.user_id
       LEFT JOIN users ap ON ap.id = lr.approver_id
       WHERE lr.status != 'pending'
       ORDER BY lr.updated_at DESC, lr.id DESC
       LIMIT 100`,
      [],
    ),
    listSpecialPolicies(),
  ]);

  const policyByCode = new Map(policies.map((p) => [p.code, p]));

  return (
    <>
      {successCode && (
        <div className="mb-4 rounded-[8px] border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-[13px] text-emerald-800">
          ✅ {leaveSuccessMessage(successCode)}
        </div>
      )}
      {errorCode && (
        <div className="mb-4 rounded-[8px] border border-rose-200 bg-rose-50 px-4 py-2.5 text-[13px] text-rose-800">
          ⚠️ {errorCode}
        </div>
      )}

      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-4">
        <KpiTile
          label="承認待ち"
          value={`${pending.length} 件`}
          accent={pending.length > 0 ? "amber" : "neutral"}
        />
        <KpiTile
          label="承認待ち日数合計"
          value={formatDays(
            pending.reduce((sum, r) => sum + requestToDays(r), 0),
          )}
          accent="amber"
        />
        <KpiTile
          label="直近処理（最新100件）"
          value={`${history.length} 件`}
          accent="neutral"
        />
      </div>

      <div className="mb-4 flex items-center gap-1 border-b border-[var(--border-light)]">
        <SubTabLink
          href="/admin/requests?tab=leave"
          label="承認待ち"
          active={subtab === "pending"}
          count={pending.length}
        />
        <SubTabLink
          href="/admin/requests?tab=leave&subtab=history"
          label="処理履歴"
          active={subtab === "history"}
        />
      </div>

      {subtab === "pending" ? (
        pending.length === 0 ? (
          <EmptyState message="承認待ちの休暇申請はありません" />
        ) : (
          <div className="space-y-3">
            {pending.map((r) => (
              <PendingLeaveCard
                key={r.id}
                req={r}
                policyName={
                  r.special_policy_code
                    ? policyByCode.get(r.special_policy_code)?.name ?? null
                    : null
                }
              />
            ))}
          </div>
        )
      ) : (
        <LeaveHistoryTable
          claims={history}
          policyByCode={policyByCode}
        />
      )}
    </>
  );
}

function PendingLeaveCard({
  req,
  policyName,
}: {
  req: LeaveRequestWithUser;
  policyName: string | null;
}) {
  const days = requestToDays(req);
  return (
    <div className="u-card p-4 md:p-5">
      <div className="flex flex-col items-start justify-between gap-3 md:flex-row md:gap-4">
        <div className="w-full flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[15px] font-semibold text-[var(--text-primary)]">
              {req.user_name}
            </span>
            <span className="rounded-[4px] bg-[var(--brand-50)] px-2 py-0.5 text-[11px] font-medium text-[var(--brand-primary)]">
              {leaveTypeLabel(req.leave_type)}
            </span>
            {policyName && (
              <span className="rounded-[4px] border border-[var(--border-light)] bg-white px-2 py-0.5 text-[11px] text-[var(--text-secondary)]">
                {policyName}
              </span>
            )}
          </div>
          <div className="mt-2 flex flex-wrap items-baseline gap-3 text-[13px]">
            <span className="tabular-nums text-[var(--text-primary)]">
              {req.start_date}
              {req.start_date !== req.end_date && (
                <span className="text-[var(--text-tertiary)]"> 〜 {req.end_date}</span>
              )}
            </span>
            <span className="text-[12px] text-[var(--text-tertiary)]">
              {durationTypeLabel(req.duration_type)}
              {req.duration_type === "hourly" && req.start_time && req.end_time && (
                <span className="ml-1 tabular-nums">
                  {req.start_time}〜{req.end_time}
                  {req.hours_used ? `（${req.hours_used}h）` : null}
                </span>
              )}
              {req.duration_type === "hourly" && !req.start_time && req.hours_used && (
                <span className="ml-1 tabular-nums">{req.hours_used}h</span>
              )}
            </span>
            <span className="font-semibold tabular-nums">
              控除 {formatDays(days)}
            </span>
          </div>
          {req.reason && (
            <div className="mt-2 text-[12px] text-[var(--text-secondary)]">
              理由: {req.reason}
            </div>
          )}
          <div className="mt-1 text-[11px] tabular-nums text-[var(--text-tertiary)]">
            申請日 {req.created_at.slice(0, 10)}
          </div>
        </div>
        <div className="w-full md:w-auto md:flex-shrink-0">
          <LeaveApprovalActions id={req.id} userName={req.user_name ?? "申請者"} />
        </div>
      </div>
    </div>
  );
}

function LeaveHistoryTable({
  claims,
  policyByCode,
}: {
  claims: LeaveRequestWithUser[];
  policyByCode: Map<string, { name: string }>;
}) {
  if (claims.length === 0) {
    return <EmptyState message="処理済の休暇申請はありません" />;
  }
  return (
    <div className="u-card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-[12px]">
          <thead>
            <tr className="border-b border-[var(--border-brand)] bg-[var(--brand-50)] text-left text-[11px] text-[var(--text-tertiary)]">
              <th className="px-3 py-2 font-normal">期間</th>
              <th className="px-3 py-2 font-normal">申請者</th>
              <th className="px-3 py-2 font-normal">種別</th>
              <th className="px-3 py-2 font-normal">区分</th>
              <th className="px-3 py-2 text-right font-normal">日数</th>
              <th className="px-3 py-2 font-normal">状態</th>
              <th className="px-3 py-2 font-normal">処理者</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border-light)]">
            {claims.map((r) => {
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
                  <td className="px-3 py-2.5 align-top">{r.user_name}</td>
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
                    {r.duration_type === "hourly" && r.start_time && r.end_time && (
                      <span className="ml-1 tabular-nums text-[var(--text-tertiary)]">
                        {r.start_time}〜{r.end_time}
                      </span>
                    )}
                    {r.duration_type === "hourly" && !r.start_time && r.hours_used && (
                      <span className="ml-1 tabular-nums">{r.hours_used}h</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums align-top">
                    {formatDays(days)}
                  </td>
                  <td className="px-3 py-2.5 align-top">
                    <LeaveStatusChip status={r.status} />
                    {r.status === "rejected" && r.rejection_reason && (
                      <div className="mt-0.5 text-[10px] text-rose-700">
                        {r.rejection_reason}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2.5 align-top text-[11px] text-[var(--text-tertiary)]">
                    {r.approver_name ?? "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ============== 共通 =================

function TopTabLink({
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

function SubTabLink({
  href,
  label,
  active,
  count,
}: {
  href: string;
  label: string;
  active: boolean;
  count?: number;
}) {
  return (
    <Link
      href={href}
      className={`relative px-3 py-2 text-[12px] font-medium transition-colors ${
        active
          ? "text-[var(--brand-accent)] after:absolute after:bottom-[-1px] after:left-0 after:right-0 after:h-[2px] after:bg-[var(--brand-accent)]"
          : "text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
      }`}
    >
      {label}
      {count !== undefined && count > 0 && (
        <span className="ml-1 inline-flex items-center justify-center rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800">
          {count}
        </span>
      )}
    </Link>
  );
}

function KpiTile({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent: "neutral" | "amber" | "emerald";
}) {
  const valueColor =
    accent === "amber"
      ? "text-amber-700"
      : accent === "emerald"
        ? "text-emerald-700"
        : "text-[var(--text-primary)]";
  return (
    <div className="u-card flex flex-col justify-between p-5">
      <span className="micro-label">{label}</span>
      <div
        className={`mt-3 text-[22px] font-semibold leading-none tracking-tight tabular-nums ${valueColor}`}
      >
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

function EmptyState({ message }: { message: string }) {
  return (
    <div className="u-card p-12 text-center text-[13px] text-[var(--text-tertiary)]">
      {message}
    </div>
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

function leaveSuccessMessage(code: string): string {
  switch (code) {
    case "approved":
      return "休暇申請を承認しました。";
    case "rejected":
      return "休暇申請を却下しました。";
    default:
      return code;
  }
}
