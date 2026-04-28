import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Lock, Unlock, AlertTriangle } from "lucide-react";
import { getCurrentUser, isAdmin, isOwner } from "@/lib/auth";
import AppShell from "@/components/AppShell";
import { listMonthlyCloses, previousBusinessMonth } from "@/lib/monthly-close";
import { pendingStampRequestCount } from "@/lib/stamp-requests";
import { detectAnomaliesForMonth } from "@/lib/anomalies";
import { jstComponents, nowJST } from "@/lib/time";
import CloseMonthButton from "./CloseMonthButton";
import ReopenButton from "./ReopenButton";

export default async function MonthlyClosePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!isAdmin(user)) redirect("/");

  const c = jstComponents(nowJST());
  const today = `${c.year}-${String(c.month).padStart(2, "0")}-${String(c.day).padStart(2, "0")}`;
  const prevMonth = previousBusinessMonth(today);

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
          月締め管理
        </h1>
        <p className="mt-1.5 text-[13px] text-[var(--text-tertiary)]">
          月末締めを実行すると当該月の打刻・各種申請が編集ロックされ、スナップショットが永久保存されます
        </p>
      </div>

      {/* 当月の締め予定セクション */}
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
                        href="/admin/stamp-requests"
                        className="mx-1 underline hover:no-underline"
                      >
                        打刻申請の承認
                      </Link>
                    )}
                    {anomalies.length > 0 && (
                      <Link
                        href={`/admin/anomalies?ym=${prevMonth}`}
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

      {/* 締め履歴 */}
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
                  {isOwner(user) && (
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
                    {isOwner(user) && (
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
    </AppShell>
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
