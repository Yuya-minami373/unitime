import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, History } from "lucide-react";
import { getCurrentUser, isAdmin } from "@/lib/auth";
import AppShell from "@/components/AppShell";
import { listPunchHistory } from "@/lib/punch-history";
import { dbAll } from "@/lib/db";
import { formatTime } from "@/lib/time";

const EVENT_LABELS: Record<string, { label: string; className: string }> = {
  created: {
    label: "作成",
    className: "bg-emerald-50 text-emerald-700 border-emerald-200",
  },
  modified: {
    label: "修正",
    className: "bg-amber-50 text-amber-700 border-amber-200",
  },
  deleted: {
    label: "削除",
    className: "bg-rose-50 text-rose-700 border-rose-200",
  },
  admin_direct_edit: {
    label: "管理者直接編集",
    className: "bg-violet-50 text-violet-700 border-violet-200",
  },
};

const PUNCH_LABEL: Record<string, string> = {
  clock_in: "出勤",
  clock_out: "退勤",
  break_start: "休憩開始",
  break_end: "休憩終了",
};

export default async function PunchHistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ user_id?: string; event?: string; from?: string; to?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!isAdmin(user)) redirect("/");

  const sp = await searchParams;
  const userId = sp.user_id ? Number(sp.user_id) : undefined;
  const event = sp.event as
    | "created"
    | "modified"
    | "deleted"
    | "admin_direct_edit"
    | undefined;

  const [items, users] = await Promise.all([
    listPunchHistory({
      userId,
      event,
      fromDate: sp.from,
      toDate: sp.to,
      limit: 300,
    }),
    dbAll<{ id: number; name: string }>(
      `SELECT id, name FROM users WHERE status='active' ORDER BY id`,
    ),
  ]);

  const userMap = new Map(users.map((u) => [u.id, u.name]));

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
        <h1 className="mt-1.5 flex items-center gap-2 text-[22px] font-semibold tracking-tight md:text-[24px]">
          <History size={20} strokeWidth={1.75} />
          打刻監査ログ
        </h1>
        <p className="mt-1.5 text-[13px] text-[var(--text-tertiary)]">
          全打刻データの作成・修正・削除を労基法109条に基づき永続保存しています（労基署対応用）
        </p>
      </div>

      {/* フィルタ */}
      <form className="u-card mb-5 p-4 md:p-5" method="get">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
          <div>
            <label className="mb-1 block text-[11px] font-medium text-[var(--text-secondary)]">
              ユーザー
            </label>
            <select name="user_id" defaultValue={sp.user_id ?? ""} className="u-input w-full">
              <option value="">全員</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-medium text-[var(--text-secondary)]">
              イベント
            </label>
            <select name="event" defaultValue={sp.event ?? ""} className="u-input w-full">
              <option value="">全て</option>
              <option value="created">作成</option>
              <option value="modified">修正</option>
              <option value="deleted">削除</option>
              <option value="admin_direct_edit">管理者編集</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-medium text-[var(--text-secondary)]">
              開始日
            </label>
            <input
              type="date"
              name="from"
              defaultValue={sp.from ?? ""}
              className="u-input w-full"
            />
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-medium text-[var(--text-secondary)]">
              終了日
            </label>
            <input
              type="date"
              name="to"
              defaultValue={sp.to ?? ""}
              className="u-input w-full"
            />
          </div>
        </div>
        <div className="mt-3 flex justify-end">
          <button type="submit" className="u-btn u-btn-primary">
            絞り込み
          </button>
        </div>
      </form>

      <div className="u-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-[12px]">
            <thead>
              <tr className="border-b border-[var(--border-brand)] bg-[var(--brand-50)] text-left">
                <th className="px-3 py-2 font-semibold">日時</th>
                <th className="px-3 py-2 font-semibold">対象者</th>
                <th className="px-3 py-2 font-semibold">イベント</th>
                <th className="px-3 py-2 font-semibold">打刻種別</th>
                <th className="px-3 py-2 font-semibold">変更前→変更後</th>
                <th className="px-3 py-2 font-semibold">操作者</th>
                <th className="px-3 py-2 font-semibold">理由</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-12 text-center text-[var(--text-tertiary)]">
                    該当する履歴がありません
                  </td>
                </tr>
              ) : (
                items.map((it) => {
                  const evt = EVENT_LABELS[it.event] ?? {
                    label: it.event,
                    className: "bg-gray-50 text-gray-700 border-gray-200",
                  };
                  return (
                    <tr
                      key={it.id}
                      className="border-b border-[var(--border-light)] last:border-0 hover:bg-[var(--brand-50)]/40"
                    >
                      <td className="px-3 py-2 tabular-nums whitespace-nowrap">
                        {it.created_at.replace("T", " ").slice(0, 16)}
                      </td>
                      <td className="px-3 py-2">
                        {userMap.get(it.user_id) ?? `#${it.user_id}`}
                      </td>
                      <td className="px-3 py-2">
                        <span
                          className={`inline-flex items-center rounded-[4px] border px-1.5 py-0.5 text-[11px] font-medium ${evt.className}`}
                        >
                          {evt.label}
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        {PUNCH_LABEL[it.new_punch_type ?? it.previous_punch_type ?? ""] ??
                          it.new_punch_type ??
                          it.previous_punch_type ??
                          "—"}
                      </td>
                      <td className="px-3 py-2 tabular-nums text-[11.5px]">
                        {it.event === "created"
                          ? `→ ${it.new_punched_at ? formatTime(it.new_punched_at) : "—"}`
                          : it.event === "deleted"
                          ? `${it.previous_punched_at ? formatTime(it.previous_punched_at) : "—"} → 削除`
                          : `${it.previous_punched_at ? formatTime(it.previous_punched_at) : "—"} → ${it.new_punched_at ? formatTime(it.new_punched_at) : "—"}`}
                      </td>
                      <td className="px-3 py-2 text-[11.5px]">
                        {it.operated_by_user_id
                          ? userMap.get(it.operated_by_user_id) ?? `#${it.operated_by_user_id}`
                          : "—"}
                      </td>
                      <td className="px-3 py-2 text-[11.5px] text-[var(--text-tertiary)]">
                        <div className="max-w-[280px] truncate" title={it.reason ?? ""}>
                          {it.reason ?? "—"}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </AppShell>
  );
}
