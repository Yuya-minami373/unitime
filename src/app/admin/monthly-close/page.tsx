import { redirect } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Lock,
  Unlock,
  AlertTriangle,
  History as HistoryIcon,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { getCurrentUser, isAdmin, isOwner } from "@/lib/auth";
import AppShell from "@/components/AppShell";
import { listMonthlyCloses, previousBusinessMonth } from "@/lib/monthly-close";
import { pendingStampRequestCount } from "@/lib/stamp-requests";
import {
  detectAnomaliesForMonth,
  type AnomalyType,
} from "@/lib/anomalies";
import { listPunchHistory, type PunchHistoryEvent } from "@/lib/punch-history";
import { dbAll } from "@/lib/db";
import { jstComponents, nowJST, formatTime } from "@/lib/time";
import CloseMonthButton from "./CloseMonthButton";
import ReopenButton from "./ReopenButton";

type Subtab = "close" | "anomalies" | "history";

const ANOMALY_STYLE: Record<AnomalyType, { className: string; label: string }> = {
  missing_clock_out: {
    className: "bg-rose-50 text-rose-700 border-rose-200",
    label: "退勤忘れ",
  },
  missing_clock_in: {
    className: "bg-rose-50 text-rose-700 border-rose-200",
    label: "出勤忘れ",
  },
  long_shift: {
    className: "bg-amber-50 text-amber-700 border-amber-200",
    label: "長時間",
  },
  extreme_short_shift: {
    className: "bg-amber-50 text-amber-700 border-amber-200",
    label: "短勤務",
  },
  weekday_no_punch: {
    className: "bg-amber-50 text-amber-700 border-amber-200",
    label: "平日打刻なし",
  },
  unpaired_break: {
    className: "bg-gray-50 text-gray-700 border-gray-200",
    label: "休憩終了なし",
  },
};

const HISTORY_EVENT_LABELS: Record<string, { label: string; className: string }> = {
  created: { label: "作成", className: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  modified: { label: "修正", className: "bg-amber-50 text-amber-700 border-amber-200" },
  deleted: { label: "削除", className: "bg-rose-50 text-rose-700 border-rose-200" },
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

function shiftMonth(ym: string, delta: number): string {
  const [y, m] = ym.split("-").map(Number);
  if (!y || !m) return ym;
  const dt = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}`;
}

export default async function MonthlyManagementPage({
  searchParams,
}: {
  searchParams: Promise<{
    subtab?: string;
    ym?: string;
    user_id?: string;
    event?: string;
    from?: string;
    to?: string;
  }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!isAdmin(user)) redirect("/");

  const sp = await searchParams;
  const subtab: Subtab =
    sp.subtab === "anomalies" ? "anomalies" : sp.subtab === "history" ? "history" : "close";

  const c = jstComponents(nowJST());
  const today = `${c.year}-${String(c.month).padStart(2, "0")}-${String(c.day).padStart(2, "0")}`;
  const prevMonth = previousBusinessMonth(today);

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
          月次管理
        </h1>
        <p className="mt-1.5 text-[13px] text-[var(--text-tertiary)]">
          月締め実行・打刻漏れチェック・監査ログ参照
        </p>
      </div>

      <div className="mb-5 flex gap-1 border-b border-[var(--border-light)]">
        <TopTabLink
          href="/admin/monthly-close"
          active={subtab === "close"}
          icon={Lock}
        >
          月締め
        </TopTabLink>
        <TopTabLink
          href="/admin/monthly-close?subtab=anomalies"
          active={subtab === "anomalies"}
          icon={AlertTriangle}
        >
          打刻漏れ
        </TopTabLink>
        <TopTabLink
          href="/admin/monthly-close?subtab=history"
          active={subtab === "history"}
          icon={HistoryIcon}
        >
          監査ログ
        </TopTabLink>
      </div>

      {subtab === "close" && (
        <ClosePanel
          prevMonth={prevMonth}
          isOwnerUser={isOwner(user)}
        />
      )}

      {subtab === "anomalies" && (
        <AnomaliesPanel ym={sp.ym && /^\d{4}-\d{2}$/.test(sp.ym) ? sp.ym : prevMonth} />
      )}

      {subtab === "history" && (
        <HistoryPanel
          userId={sp.user_id ? Number(sp.user_id) : undefined}
          event={sp.event as PunchHistoryEvent | undefined}
          from={sp.from}
          to={sp.to}
        />
      )}
    </AppShell>
  );
}

function TopTabLink({
  href,
  active,
  icon: Icon,
  children,
}: {
  href: string;
  active: boolean;
  icon: typeof Lock;
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

// ============== 月締めパネル =================

async function ClosePanel({
  prevMonth,
  isOwnerUser,
}: {
  prevMonth: string;
  isOwnerUser: boolean;
}) {
  const [closes, pendingCount, anomalies] = await Promise.all([
    listMonthlyCloses(),
    pendingStampRequestCount(),
    detectAnomaliesForMonth({
      year: Number(prevMonth.slice(0, 4)),
      month: Number(prevMonth.slice(5, 7)),
      includeWeekdayNoPunch: true,
    }),
  ]);

  const prevAlreadyClosed = closes.some(
    (c) => c.target_month === prevMonth && c.status === "closed",
  );

  return (
    <>
      <section className="u-card mb-6 p-5">
        <div className="mb-3 flex items-center gap-2">
          <Lock size={14} strokeWidth={1.75} className="text-[var(--brand-accent)]" />
          <h2 className="text-[14px] font-semibold tracking-tight">
            次に締める月: {prevMonth}
          </h2>
        </div>

        {prevAlreadyClosed ? (
          <p className="rounded-[6px] bg-emerald-50 px-3 py-2 text-[12.5px] text-emerald-700">
            ✅ {prevMonth} は既に締め済みです
          </p>
        ) : (
          <>
            <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-3">
              <Stat
                label="未承認申請"
                value={`${pendingCount}件`}
                accent={pendingCount > 0 ? "amber" : "neutral"}
              />
              <Stat
                label="打刻漏れ疑い"
                value={`${anomalies.length}件`}
                accent={anomalies.length > 0 ? "amber" : "neutral"}
              />
              <Stat
                label="締め日"
                value={`${prevMonth.slice(5, 7)}月末`}
                accent="neutral"
              />
            </div>

            {(pendingCount > 0 || anomalies.length > 0) && (
              <div className="mb-4 flex items-start gap-2 rounded-[8px] border border-amber-200 bg-amber-50 px-3 py-2.5 text-[12.5px] text-amber-800">
                <AlertTriangle size={13} strokeWidth={2} className="mt-0.5 shrink-0" />
                <div>
                  <div className="font-medium">未処理が残っています</div>
                  <div className="mt-0.5">
                    締める前に
                    {pendingCount > 0 && (
                      <Link
                        href="/admin/requests?tab=stamp"
                        className="mx-1 underline hover:no-underline"
                      >
                        打刻申請の承認
                      </Link>
                    )}
                    {anomalies.length > 0 && (
                      <Link
                        href={`/admin/monthly-close?subtab=anomalies&ym=${prevMonth}`}
                        className="mx-1 underline hover:no-underline"
                      >
                        打刻漏れの確認
                      </Link>
                    )}
                    を完了してください
                  </div>
                </div>
              </div>
            )}

            <CloseMonthButton targetMonth={prevMonth} />
          </>
        )}
      </section>

      <section className="u-card overflow-hidden">
        <div className="border-b border-[var(--border-light)] px-5 py-3">
          <h2 className="text-[14px] font-semibold tracking-tight">締め履歴</h2>
        </div>

        {closes.length === 0 ? (
          <div className="p-12 text-center">
            <p className="text-[13px] text-[var(--text-tertiary)]">
              まだ締め履歴がありません
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-[var(--border-brand)] bg-[var(--brand-50)] text-left">
                  <th className="px-4 py-2.5 text-[12px] font-semibold">対象月</th>
                  <th className="px-4 py-2.5 text-[12px] font-semibold">状態</th>
                  <th className="px-4 py-2.5 text-[12px] font-semibold">締め日時</th>
                  <th className="px-4 py-2.5 text-[12px] font-semibold">解除履歴</th>
                  {isOwnerUser && (
                    <th className="px-4 py-2.5 text-[12px] font-semibold">操作</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {closes.map((row) => (
                  <tr
                    key={row.id}
                    className="border-b border-[var(--border-light)] last:border-0"
                  >
                    <td className="px-4 py-2.5 font-medium tabular-nums">
                      {row.target_month}
                    </td>
                    <td className="px-4 py-2.5">
                      {row.status === "closed" ? (
                        <span className="inline-flex items-center gap-1 rounded-[4px] border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[11px] font-medium text-emerald-700">
                          <Lock size={10} strokeWidth={2} />
                          締め済
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-[4px] border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[11px] font-medium text-amber-700">
                          <Unlock size={10} strokeWidth={2} />
                          オープン
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 tabular-nums text-[12px] text-[var(--text-secondary)]">
                      {row.closed_at?.replace("T", " ").slice(0, 16) ?? "—"}
                    </td>
                    <td className="px-4 py-2.5 text-[12px] text-[var(--text-tertiary)]">
                      {row.reopened_at ? (
                        <div>
                          <div className="tabular-nums">
                            {row.reopened_at.replace("T", " ").slice(0, 16)}
                          </div>
                          <div className="mt-0.5 text-[11px]">{row.reopen_reason}</div>
                        </div>
                      ) : (
                        "—"
                      )}
                    </td>
                    {isOwnerUser && (
                      <td className="px-4 py-2.5">
                        {row.status === "closed" && (
                          <ReopenButton targetMonth={row.target_month} />
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}

// ============== 打刻漏れパネル =================

async function AnomaliesPanel({ ym }: { ym: string }) {
  const [year, month] = ym.split("-").map(Number) as [number, number];
  const items = await detectAnomaliesForMonth({
    year,
    month,
    includeWeekdayNoPunch: true,
  });

  const byUser = new Map<number, typeof items>();
  for (const it of items) {
    if (!byUser.has(it.userId)) byUser.set(it.userId, []);
    byUser.get(it.userId)!.push(it);
  }

  return (
    <>
      <div className="mb-5 flex items-center gap-3">
        <Link
          href={`/admin/monthly-close?subtab=anomalies&ym=${shiftMonth(ym, -1)}`}
          className="rounded-[6px] border border-[var(--border-light)] p-1.5 hover:bg-[var(--bg-subtle-alt)]"
        >
          <ChevronLeft size={14} />
        </Link>
        <span className="text-[16px] font-semibold tabular-nums">{ym}</span>
        <Link
          href={`/admin/monthly-close?subtab=anomalies&ym=${shiftMonth(ym, 1)}`}
          className="rounded-[6px] border border-[var(--border-light)] p-1.5 hover:bg-[var(--bg-subtle-alt)]"
        >
          <ChevronRight size={14} />
        </Link>
        <span className="ml-3 text-[12px] text-[var(--text-tertiary)]">
          検知件数: <span className="font-semibold">{items.length}</span>件
        </span>
      </div>

      {byUser.size === 0 ? (
        <div className="u-card flex flex-col items-center justify-center gap-3 p-12 text-center">
          <AlertTriangle
            size={28}
            strokeWidth={1.5}
            className="text-[var(--text-quaternary)]"
          />
          <p className="text-[14px] font-medium text-[var(--text-secondary)]">
            この月の打刻漏れ疑いはありません ✨
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {Array.from(byUser.entries()).map(([userId, anomalies]) => (
            <div key={userId} className="u-card overflow-hidden">
              <div className="border-b border-[var(--border-light)] px-4 py-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-[14px] font-semibold">{anomalies[0]?.userName}</h3>
                  <span className="text-[11.5px] text-[var(--text-tertiary)]">
                    {anomalies.length}件
                  </span>
                </div>
              </div>
              <ul className="divide-y divide-[var(--border-light)]">
                {anomalies.map((a, idx) => {
                  const style = ANOMALY_STYLE[a.type];
                  return (
                    <li key={idx} className="px-4 py-2.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`inline-flex items-center rounded-[4px] border px-1.5 py-0.5 text-[11px] font-medium ${style.className}`}
                        >
                          {style.label}
                        </span>
                        <span className="tabular-nums text-[12px] text-[var(--text-secondary)]">
                          {a.date}
                        </span>
                        <span className="text-[12px] text-[var(--text-tertiary)]">
                          {a.detail}
                        </span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

// ============== 監査ログパネル =================

async function HistoryPanel({
  userId,
  event,
  from,
  to,
}: {
  userId?: number;
  event?: PunchHistoryEvent;
  from?: string;
  to?: string;
}) {
  const [items, users] = await Promise.all([
    listPunchHistory({ userId, event, fromDate: from, toDate: to, limit: 300 }),
    dbAll<{ id: number; name: string }>(
      `SELECT id, name FROM users WHERE status='active' ORDER BY id`,
    ),
  ]);

  const userMap = new Map(users.map((u) => [u.id, u.name]));

  return (
    <>
      <form className="u-card mb-5 p-4 md:p-5" method="get">
        <input type="hidden" name="subtab" value="history" />
        <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
          <div>
            <label className="mb-1 block text-[11px] font-medium text-[var(--text-secondary)]">
              ユーザー
            </label>
            <select
              name="user_id"
              defaultValue={userId ?? ""}
              className="u-input w-full"
            >
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
            <select
              name="event"
              defaultValue={event ?? ""}
              className="u-input w-full"
            >
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
              defaultValue={from ?? ""}
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
              defaultValue={to ?? ""}
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
                  const evt = HISTORY_EVENT_LABELS[it.event] ?? {
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
    </>
  );
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent: "amber" | "neutral";
}) {
  const valueClass =
    accent === "amber" ? "text-amber-700" : "text-[var(--text-primary)]";
  return (
    <div className="rounded-[8px] border border-[var(--border-light)] bg-white p-3">
      <div className="text-[11px] font-medium text-[var(--text-tertiary)]">{label}</div>
      <div className={`mt-1 text-[20px] font-semibold tabular-nums ${valueClass}`}>
        {value}
      </div>
    </div>
  );
}
