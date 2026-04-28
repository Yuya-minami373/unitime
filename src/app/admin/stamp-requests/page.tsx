import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Clock, CheckCircle2, XCircle, Ban } from "lucide-react";
import { getCurrentUser, isAdmin } from "@/lib/auth";
import AppShell from "@/components/AppShell";
import { listAllStampRequests } from "@/lib/stamp-requests";
import { formatTime } from "@/lib/time";
import StampApprovalActions from "./StampApprovalActions";

const STATUS_STYLE = {
  pending: {
    label: "申請中",
    className: "bg-amber-50 text-amber-700 border-amber-200",
    icon: Clock,
  },
  approved: {
    label: "承認済",
    className: "bg-emerald-50 text-emerald-700 border-emerald-200",
    icon: CheckCircle2,
  },
  rejected: {
    label: "却下",
    className: "bg-rose-50 text-rose-700 border-rose-200",
    icon: XCircle,
  },
  cancelled: {
    label: "取消済",
    className: "bg-gray-50 text-gray-600 border-gray-200",
    icon: Ban,
  },
} as const;

const PUNCH_LABEL: Record<string, string> = {
  clock_in: "出勤",
  clock_out: "退勤",
  break_start: "休憩開始",
  break_end: "休憩終了",
};

const ACTION_LABEL: Record<string, string> = {
  add: "追加",
  modify: "修正",
  delete: "削除",
};

export default async function AdminStampRequestsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!isAdmin(user)) redirect("/");

  const sp = await searchParams;
  const tab = sp.tab === "history" ? "history" : "pending";

  const items = await listAllStampRequests(
    tab === "pending" ? { status: "pending" } : undefined,
  );

  const pendingCount = (await listAllStampRequests({ status: "pending" })).length;

  return (
    <AppShell
      user={{ name: user.name, role: user.role, employment: user.employment_type }}
    >
      <div className="mb-6">
        <Link
          href="/admin"
          className="flex items-center gap-1 text-[12px] text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
        >
          <ArrowLeft size={12} />
          管理画面に戻る
        </Link>
        <h1 className="mt-1.5 text-[22px] font-semibold tracking-tight md:text-[24px]">
          打刻申請の承認
        </h1>
        <p className="mt-1.5 text-[13px] text-[var(--text-tertiary)]">
          打刻忘れ・打刻ミスの修正申請を承認・却下します（労基署対応のため修正前後は監査ログに永久保存）
        </p>
      </div>

      <div className="mb-5 flex gap-1 border-b border-[var(--border-light)]">
        <TabLink
          href="/admin/stamp-requests"
          active={tab === "pending"}
          label="承認待ち"
          count={pendingCount}
        />
        <TabLink
          href="/admin/stamp-requests?tab=history"
          active={tab === "history"}
          label="履歴"
        />
      </div>

      {items.length === 0 ? (
        <div className="u-card flex flex-col items-center justify-center gap-3 p-12 text-center">
          <Clock size={28} strokeWidth={1.5} className="text-[var(--text-quaternary)]" />
          <p className="text-[14px] font-medium text-[var(--text-secondary)]">
            {tab === "pending" ? "承認待ちの打刻申請はありません" : "申請履歴はありません"}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((it) => {
            const status = STATUS_STYLE[it.status];
            const StatusIcon = status.icon;
            return (
              <div key={it.id} className="u-card p-4 md:p-5">
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`inline-flex items-center gap-1 rounded-[4px] border px-1.5 py-0.5 text-[11px] font-medium ${status.className}`}
                      >
                        <StatusIcon size={10} strokeWidth={2} />
                        {status.label}
                      </span>
                      <span className="text-[15px] font-semibold text-[var(--text-primary)]">
                        {it.user_name}
                      </span>
                      <span className="tabular-nums text-[12px] text-[var(--text-tertiary)]">
                        {it.target_business_day}
                      </span>
                      <span className="rounded-[4px] bg-[var(--brand-50)] px-1.5 py-0.5 text-[11px] font-medium text-[var(--brand-primary)]">
                        {PUNCH_LABEL[it.punch_type] ?? it.punch_type}
                      </span>
                      <span className="rounded-[4px] bg-[var(--bg-subtle-alt)] px-1.5 py-0.5 text-[11px] text-[var(--text-secondary)]">
                        {ACTION_LABEL[it.action] ?? it.action}
                      </span>
                    </div>

                    <div className="mt-2 text-[13px] tabular-nums text-[var(--text-secondary)]">
                      {it.action === "add"
                        ? `→ ${formatTime(it.new_punched_at!)}`
                        : it.action === "modify"
                        ? `${formatTime(it.previous_punched_at!)} → ${formatTime(it.new_punched_at!)}`
                        : `削除: ${formatTime(it.previous_punched_at!)}`}
                    </div>

                    <div className="mt-2 rounded-[6px] bg-[var(--bg-subtle-alt)] p-2 text-[12.5px] text-[var(--text-secondary)]">
                      <span className="font-medium">理由:</span> {it.reason}
                    </div>

                    {it.rejection_reason && (
                      <div className="mt-2 rounded-[6px] border border-rose-200 bg-rose-50 px-3 py-2 text-[12px] text-rose-700">
                        却下理由: {it.rejection_reason}
                      </div>
                    )}

                    <div className="mt-2 text-[11px] text-[var(--text-quaternary)]">
                      申請日時: {it.created_at.replace("T", " ").slice(0, 16)}
                      {it.approved_at && (
                        <> ／ 処理日時: {it.approved_at.replace("T", " ").slice(0, 16)}</>
                      )}
                    </div>
                  </div>

                  {it.status === "pending" && (
                    <StampApprovalActions requestId={it.id} userName={it.user_name} />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </AppShell>
  );
}

function TabLink({
  href,
  active,
  label,
  count,
}: {
  href: string;
  active: boolean;
  label: string;
  count?: number;
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
      {label}
      {typeof count === "number" && count > 0 && (
        <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">
          {count}
        </span>
      )}
    </Link>
  );
}
