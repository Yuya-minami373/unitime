import { redirect } from "next/navigation";
import Link from "next/link";
import { Plus, CheckCircle2, Clock, XCircle, ShieldAlert, Receipt } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import AppShell from "@/components/AppShell";
import {
  listExpensesForUser,
  monthlyStatsForUser,
  statusLabel,
  formatYen,
  type ExpenseStatus,
} from "@/lib/expenses";
import { currentYearMonth } from "@/lib/time";

export default async function ExpensesPage({
  searchParams,
}: {
  searchParams: Promise<{ new?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role === "owner") redirect("/admin/expenses");
  // クルーは立替精算機能の対象外（打刻のみ）
  if (user.employment_type === "crew") redirect("/");

  const { new: newId } = await searchParams;
  const ym = currentYearMonth();

  const [claims, stats] = await Promise.all([
    listExpensesForUser(user.id),
    monthlyStatsForUser(user.id, ym),
  ]);

  return (
    <AppShell user={{ name: user.name, role: user.role, employment: user.employment_type }}>
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight md:text-[24px]">
            立替精算
          </h1>
          <p className="mt-1.5 text-[13px] text-[var(--text-tertiary)]">
            {user.name} の申請一覧
          </p>
        </div>
        <Link href="/expenses/new" className="u-btn u-btn-primary">
          <Plus size={14} strokeWidth={1.75} />
          新規申請
        </Link>
      </div>

      {newId && (
        <div className="mb-5 flex items-center gap-2 rounded-[8px] border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-[13px] text-emerald-700">
          <CheckCircle2 size={16} strokeWidth={1.75} />
          申請を受け付けました（ID: {newId}）。承認後に振込が完了します。
        </div>
      )}

      {/* 今月KPI */}
      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-4">
        <StatTile label="今月 承認済・振込済" value={formatYen(stats.totalAmount)} />
        <StatTile label="申請中" value={`${stats.pendingCount} 件`} />
        <StatTile label="今月 承認済件数" value={`${stats.approvedCount} 件`} />
      </div>

      {/* 一覧 */}
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
          <div className="overflow-x-auto">
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
                      <StatusChip status={c.status} />
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </AppShell>
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
