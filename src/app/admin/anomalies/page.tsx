import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, AlertTriangle, ChevronLeft, ChevronRight } from "lucide-react";
import { getCurrentUser, isAdmin } from "@/lib/auth";
import AppShell from "@/components/AppShell";
import { detectAnomaliesForMonth, type AnomalyType } from "@/lib/anomalies";
import { jstComponents, nowJST } from "@/lib/time";

const TYPE_STYLE: Record<AnomalyType, { className: string; label: string }> = {
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

function shiftMonth(ym: string, delta: number): string {
  const [y, m] = ym.split("-").map(Number);
  if (!y || !m) return ym;
  const dt = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}`;
}

export default async function AnomaliesPage({
  searchParams,
}: {
  searchParams: Promise<{ ym?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!isAdmin(user)) redirect("/");

  const sp = await searchParams;
  const c = jstComponents(nowJST());
  const currentYm = `${c.year}-${String(c.month).padStart(2, "0")}`;
  const ym = sp.ym && /^\d{4}-\d{2}$/.test(sp.ym) ? sp.ym : currentYm;
  const [year, month] = ym.split("-").map(Number) as [number, number];

  const items = await detectAnomaliesForMonth({
    year,
    month,
    includeWeekdayNoPunch: true,
  });

  // ユーザーごとにグルーピング
  const byUser = new Map<number, typeof items>();
  for (const it of items) {
    if (!byUser.has(it.userId)) byUser.set(it.userId, []);
    byUser.get(it.userId)!.push(it);
  }

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
          <AlertTriangle size={20} strokeWidth={1.75} className="text-amber-600" />
          打刻漏れ疑い一覧
        </h1>
        <p className="mt-1.5 text-[13px] text-[var(--text-tertiary)]">
          月次で検知した打刻欠損・整合性問題の一覧。月締め前にチェックしてください
        </p>
      </div>

      {/* 月切替 */}
      <div className="mb-5 flex items-center gap-3">
        <Link
          href={`/admin/anomalies?ym=${shiftMonth(ym, -1)}`}
          className="rounded-[6px] border border-[var(--border-light)] p-1.5 hover:bg-[var(--bg-subtle-alt)]"
        >
          <ChevronLeft size={14} />
        </Link>
        <span className="text-[16px] font-semibold tabular-nums">{ym}</span>
        <Link
          href={`/admin/anomalies?ym=${shiftMonth(ym, 1)}`}
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
                  const style = TYPE_STYLE[a.type];
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
    </AppShell>
  );
}
