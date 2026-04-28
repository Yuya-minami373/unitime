import { redirect } from "next/navigation";
import Link from "next/link";
import { Plus, Clock, CheckCircle2, XCircle, Ban, ArrowLeft } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import AppShell from "@/components/AppShell";
import { listMyStampRequests } from "@/lib/stamp-requests";
import { formatTime } from "@/lib/time";
import CancelButton from "./CancelButton";

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

export default async function StampsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const items = await listMyStampRequests(user.id);

  return (
    <AppShell
      user={{ name: user.name, role: user.role, employment: user.employment_type }}
    >
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <Link
            href="/"
            className="flex items-center gap-1 text-[12px] text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
          >
            <ArrowLeft size={12} />
            ホームに戻る
          </Link>
          <h1 className="mt-1.5 text-[22px] font-semibold tracking-tight md:text-[24px]">
            打刻申請
          </h1>
          <p className="mt-1.5 text-[13px] text-[var(--text-tertiary)]">
            打刻忘れ・打刻ミスの修正申請（承認後に勤怠データへ反映されます）
          </p>
        </div>
        <Link href="/requests/stamps/new" className="u-btn u-btn-primary">
          <Plus size={14} strokeWidth={1.75} />
          新規申請
        </Link>
      </div>

      {items.length === 0 ? (
        <div className="u-card flex flex-col items-center justify-center gap-3 p-12 text-center">
          <Clock size={28} strokeWidth={1.5} className="text-[var(--text-quaternary)]" />
          <div>
            <p className="text-[14px] font-medium text-[var(--text-secondary)]">
              まだ申請がありません
            </p>
            <p className="mt-1 text-[12px] text-[var(--text-quaternary)]">
              打刻を忘れた / 押し間違えた場合は新規申請してください
            </p>
          </div>
        </div>
      ) : (
        <div className="u-card overflow-hidden">
          <ul className="divide-y divide-[var(--border-light)]">
            {items.map((it) => {
              const status = STATUS_STYLE[it.status];
              const StatusIcon = status.icon;
              return (
                <li key={it.id} className="px-4 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`inline-flex items-center gap-1 rounded-[4px] border px-1.5 py-0.5 text-[11px] font-medium ${status.className}`}
                        >
                          <StatusIcon size={10} strokeWidth={2} />
                          {status.label}
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
                      <div className="mt-1 text-[12.5px] tabular-nums text-[var(--text-secondary)]">
                        {it.action === "add"
                          ? `→ ${formatTime(it.new_punched_at!)}`
                          : it.action === "modify"
                          ? `${formatTime(it.previous_punched_at!)} → ${formatTime(it.new_punched_at!)}`
                          : `削除: ${formatTime(it.previous_punched_at!)}`}
                      </div>
                      <div className="mt-1 text-[12px] text-[var(--text-tertiary)] break-words">
                        理由: {it.reason}
                      </div>
                      {it.rejection_reason && (
                        <div className="mt-1 rounded-[4px] bg-rose-50 px-2 py-1 text-[11.5px] text-rose-700">
                          却下理由: {it.rejection_reason}
                        </div>
                      )}
                    </div>
                    {it.status === "pending" && (
                      <CancelButton requestId={it.id} />
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </AppShell>
  );
}
