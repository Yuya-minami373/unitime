import { redirect } from "next/navigation";
import Link from "next/link";
import {
  Receipt,
  CheckCircle2,
  Clock,
  XCircle,
  ShieldAlert,
  ExternalLink,
} from "lucide-react";
import { getCurrentUser, isAdmin } from "@/lib/auth";
import AppShell from "@/components/AppShell";
import {
  listAllExpenses,
  statusLabel,
  formatYen,
  type ExpenseStatus,
  type ExpenseClaim,
} from "@/lib/expenses";
import { currentYearMonth } from "@/lib/time";
import ApprovalActions from "./ApprovalActions";

type SearchParams = { tab?: string; ym?: string };

export default async function AdminExpensesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!isAdmin(user)) redirect("/");

  const { tab, ym } = await searchParams;
  const activeTab = tab === "history" ? "history" : "pending";
  const targetYm = ym ?? currentYearMonth();

  const [pendingClaims, monthlyClaims] = await Promise.all([
    listAllExpenses({ status: ["pending", "ai_flagged"] }),
    listAllExpenses({ ym: targetYm }),
  ]);

  // AI一次チェックが有効か（ANTHROPIC_API_KEYが設定されていれば有効）
  const aiEnabled = Boolean(process.env.ANTHROPIC_API_KEY?.startsWith("sk-ant"));

  // 月次統計
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
    <AppShell user={{ name: user.name, role: user.role, employment: user.employment_type }}>
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight md:text-[24px]">
            精算承認
          </h1>
          <p className="mt-1.5 text-[13px] text-[var(--text-tertiary)]">
            立替精算・交通費申請の承認管理。承認=振込完了として処理されます
          </p>
        </div>
      </div>

      {/* KPI */}
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
          label={`${targetYm.replace("-", "年")}月 承認済`}
          value={`${monthlyTotals.paidCount} 件`}
          accent="emerald"
        />
        <KpiTile
          label={`${targetYm.replace("-", "年")}月 振込済`}
          value={formatYen(monthlyTotals.paidAmount)}
          accent="emerald"
        />
      </div>

      {/* Tabs */}
      <div className="mb-4 flex items-center gap-1 border-b border-[var(--border-light)]">
        <TabLink href="/admin/expenses" label="承認待ち" active={activeTab === "pending"} count={pendingClaims.length} />
        <TabLink href={`/admin/expenses?tab=history&ym=${targetYm}`} label="月次履歴" active={activeTab === "history"} />
      </div>

      {activeTab === "pending" ? (
        pendingClaims.length === 0 ? (
          <EmptyState message="承認待ちの申請はありません" />
        ) : (
          <div className="space-y-3">
            {pendingClaims.map((c) => (
              <PendingCard key={c.id} claim={c} aiEnabled={aiEnabled} />
            ))}
          </div>
        )
      ) : (
        <HistoryTable claims={monthlyClaims} />
      )}
    </AppShell>
  );
}

function PendingCard({ claim, aiEnabled }: { claim: ExpenseClaim; aiEnabled: boolean }) {
  // ai_flagged (warn/ng) は AI 要確認として目立たせる。それ以外は単なる「申請中」
  const aiStatus = claim.ai_check_status;
  const showAiAlert = aiStatus === "warn" || aiStatus === "ng";

  return (
    <div className="u-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[15px] font-semibold text-[var(--text-primary)]">
              {claim.user_name}
            </span>
            <span className="rounded-[4px] bg-[var(--brand-50)] px-2 py-0.5 text-[11px] font-medium text-[var(--brand-primary)]">
              {claim.category}
            </span>
            {/* AIチェック結果のバッジを1つに統一 */}
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

          {/* AI確認事項を目立つバナーで表示 */}
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

        <div className="flex flex-col items-end gap-3">
          <div className="text-[22px] font-semibold tabular-nums text-[var(--text-primary)]">
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

function HistoryTable({ claims }: { claims: ExpenseClaim[] }) {
  if (claims.length === 0) {
    return <EmptyState message="この月の申請はありません" />;
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
              <Th>ステータス</Th>
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
                  <StatusChip status={c.status} />
                </Td>
                <Td>
                  {c.approver_name ? (
                    <span className="text-[12px] text-[var(--text-tertiary)]">
                      {c.approver_name}
                    </span>
                  ) : (
                    <span className="text-[12px] text-[var(--text-quaternary)]">—</span>
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

function StatusChip({ status }: { status: ExpenseStatus }) {
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
      <div className={`mt-3 text-[22px] font-semibold leading-none tracking-tight tabular-nums ${valueColor}`}>
        {value}
      </div>
    </div>
  );
}

function TabLink({
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
      className={`relative px-3 py-2 text-[13px] font-medium transition-colors ${
        active
          ? "text-[var(--brand-primary)]"
          : "text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]"
      }`}
    >
      {label}
      {count !== undefined && count > 0 && (
        <span className="ml-1.5 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">
          {count}
        </span>
      )}
      {active && (
        <span className="absolute bottom-0 left-0 h-[2px] w-full bg-[var(--brand-accent)]" />
      )}
    </Link>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="u-card flex flex-col items-center justify-center gap-3 p-12 text-center">
      <Receipt size={28} strokeWidth={1.5} className="text-[var(--text-quaternary)]" />
      <p className="text-[13px] text-[var(--text-tertiary)]">{message}</p>
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
