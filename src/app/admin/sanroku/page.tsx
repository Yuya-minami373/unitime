// 36協定遵守監視ドリルダウン画面（管理者専用）
//
// 全社員の遵守状況を一覧表示。社員選択でその社員の月別推移＋複数月平均推移を見せる。

import { redirect } from "next/navigation";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { dbAll } from "@/lib/db";
import { jstComponents, nowBusinessDay } from "@/lib/time";
import AppShell from "@/components/AppShell";
import { SanrokuCard } from "@/components/SanrokuCard";
import { getUserSanrokuOverview, calcMonthlyTotalStatus } from "@/lib/sanroku";
import { AGREEMENT } from "@/lib/sanroku-config";

type User = {
  id: number;
  name: string;
  login_id: string;
  employment_type: string;
  standard_work_minutes: number | null;
};

export default async function SanrokuPage({
  searchParams,
}: {
  searchParams: Promise<{ user_id?: string; ym?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "owner" && user.role !== "admin") redirect("/");

  const params = await searchParams;
  const today = nowBusinessDay();
  const nowJst = jstComponents();
  const targetYm = params.ym ?? `${nowJst.year}-${String(nowJst.month).padStart(2, "0")}`;
  const [yearStr, monthStr] = targetYm.split("-");
  const year = Number(yearStr);
  const month = Number(monthStr);

  // 監視対象は社員のみ
  const employees = await dbAll<User>(
    `SELECT id, name, login_id, employment_type, standard_work_minutes
     FROM users
     WHERE status = 'active' AND employment_type = 'employee'
     ORDER BY id`,
  );

  // 全社員の概要を並列計算
  const overviews = await Promise.all(
    employees.map(async (u) => ({
      user: u,
      overview: await getUserSanrokuOverview(
        u.id,
        u.standard_work_minutes ?? 420,
        year,
        month,
      ),
    })),
  );

  // 選択中の社員（クエリパラメータから or 1人目）
  const selectedUserId = params.user_id ? Number(params.user_id) : employees[0]?.id ?? null;
  const selected = overviews.find((o) => o.user.id === selectedUserId) ?? overviews[0];

  // 過去12ヶ月の合算推移（選択社員）
  const trailing12: { ym: string; totalMinutes: number; overtimeMinutes: number }[] = [];
  if (selected) {
    for (let i = 11; i >= 0; i--) {
      const dt = new Date(Date.UTC(year, month - 1 - i, 1));
      const y = dt.getUTCFullYear();
      const m = dt.getUTCMonth() + 1;
      const status = await calcMonthlyTotalStatus(
        selected.user.id,
        y,
        m,
        selected.user.standard_work_minutes ?? 420,
      );
      trailing12.push({
        ym: `${y}-${String(m).padStart(2, "0")}`,
        totalMinutes: status.totalMinutes,
        overtimeMinutes: status.overtimeMinutes,
      });
    }
  }

  const max12 = Math.max(...trailing12.map((m) => m.totalMinutes), 80 * 60);

  return (
    <AppShell user={{ name: user.name, role: user.role, employment: user.employment_type }}>
      <div className="mb-5 flex items-center gap-2 text-[12px]">
        <Link
          href="/admin"
          className="inline-flex items-center gap-1 text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
        >
          <ChevronLeft size={14} strokeWidth={1.75} />
          チーム
        </Link>
        <span className="text-[var(--text-quaternary)]">/</span>
        <span className="text-[var(--text-secondary)]">36協定遵守状況</span>
      </div>

      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight md:text-[24px]">
            36協定 遵守監視
          </h1>
          <p className="mt-1.5 text-[12px] text-[var(--text-tertiary)]">
            協定届出: 横浜南労基署 受付 令和8年1月16日 / 月45h・年360h（特別条項なし）
          </p>
        </div>
        <div className="text-[11px] text-[var(--text-tertiary)]">
          基準月: {year}年{month}月 / 業務日: {today}
        </div>
      </div>

      {/* 全社員サマリ */}
      <section className="u-card mb-5 overflow-hidden">
        <div className="border-b border-[var(--border-light)] px-5 py-3">
          <h2 className="text-[14px] font-semibold tracking-tight">社員別 遵守状況</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-[var(--border-light)] bg-[var(--brand-50)] text-left">
                <Th>氏名</Th>
                <Th>月時間外</Th>
                <Th>段階</Th>
                <Th>年累計</Th>
                <Th>休日労働</Th>
                <Th>当月合算</Th>
                <Th>複数月平均</Th>
                <Th>{""}</Th>
              </tr>
            </thead>
            <tbody>
              {overviews.map(({ user: u, overview }) => {
                const stageLabel: Record<string, { label: string; bg: string; fg: string }> = {
                  safe: { label: "—", bg: "bg-[var(--bg-subtle-alt)]", fg: "text-[var(--text-tertiary)]" },
                  caution: { label: "🟡 30h", bg: "bg-yellow-100", fg: "text-yellow-700" },
                  warning: { label: "🟠 40h", bg: "bg-[var(--accent-amber-soft)]", fg: "text-[#b45309]" },
                  critical: { label: "🔴 45h", bg: "bg-[var(--accent-rose-soft)]", fg: "text-[#be123c]" },
                };
                const stage = stageLabel[overview.monthly.stage]!;
                const exceededMM = overview.multiMonth.filter((e) => e.exceeded);
                const isSelected = u.id === selectedUserId;
                return (
                  <tr
                    key={u.id}
                    className={`border-b border-[var(--border-light)] transition-colors last:border-0 ${
                      isSelected ? "bg-[var(--brand-50)]" : "hover:bg-[var(--brand-50)]"
                    }`}
                  >
                    <td className="px-4 py-3">
                      <span className="font-semibold text-[var(--text-primary)]">{u.name}</span>
                    </td>
                    <td className="px-4 py-3 tabular-nums">
                      {(overview.monthly.overtimeMinutes / 60).toFixed(1)}h
                    </td>
                    <td className="px-4 py-3">
                      <span className={`rounded-[4px] px-1.5 py-0.5 text-[10.5px] font-semibold ${stage.bg} ${stage.fg}`}>
                        {stage.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 tabular-nums">
                      {(overview.agreementYear.overtimeMinutes / 60).toFixed(1)}h / 360h
                    </td>
                    <td className="px-4 py-3 tabular-nums">
                      <span className={overview.holiday.withinLimit ? "" : "font-semibold text-[#be123c]"}>
                        {overview.holiday.totalDays} / {AGREEMENT.holidayWork.monthlyLimit}回
                      </span>
                      {overview.holiday.outOfHoursDays.length > 0 && (
                        <span className="ml-1.5 text-[10.5px] text-[#b45309]">
                          ⚠️枠外{overview.holiday.outOfHoursDays.length}件
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 tabular-nums">
                      <span className={overview.total.legalLimitExceeded ? "font-semibold text-[#be123c]" : overview.total.legalCautionExceeded ? "font-semibold text-[#b45309]" : ""}>
                        {(overview.total.totalMinutes / 60).toFixed(1)}h
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {exceededMM.length > 0 ? (
                        <span className="rounded-[4px] bg-[var(--accent-rose-soft)] px-1.5 py-0.5 text-[10.5px] font-semibold text-[#be123c]">
                          🚨 {exceededMM.map((e) => `${e.span}M`).join(", ")} 超過
                        </span>
                      ) : (
                        <span className="text-[var(--text-quaternary)]">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/admin/sanroku?user_id=${u.id}&ym=${targetYm}`}
                        className="text-[12px] font-medium text-[var(--brand-accent)] hover:underline"
                      >
                        詳細
                      </Link>
                    </td>
                  </tr>
                );
              })}
              {overviews.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-[var(--text-tertiary)]">
                    社員ユーザーがいません
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* 選択社員の詳細 */}
      {selected && (
        <>
          <h2 className="mb-3 text-[14px] font-semibold tracking-tight">
            {selected.user.name}さんの遵守状況詳細
          </h2>

          <div className="mb-5">
            <SanrokuCard overview={selected.overview} />
          </div>

          {/* 過去12ヶ月の月別推移 */}
          <section className="u-card mb-5 p-5">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-[13px] font-semibold tracking-tight">
                過去12ヶ月の時間外+休日労働 推移
              </h3>
              <span className="text-[11px] text-[var(--text-tertiary)]">
                赤線: 月100h（法定上限）/ 橙線: 月80h（予兆）
              </span>
            </div>
            <div className="relative flex h-[180px] items-end justify-between gap-2 border-b border-[var(--border-light)] pb-2">
              {/* 80h reference line */}
              <div
                className="absolute left-0 right-0 border-t border-dashed border-[var(--accent-amber)]"
                style={{ top: `${(1 - (80 * 60) / max12) * 100}%` }}
              />
              <span
                className="absolute right-0 -mt-3 bg-[var(--bg-surface)] pl-1 text-[10px] text-[#b45309]"
                style={{ top: `${(1 - (80 * 60) / max12) * 100}%` }}
              >
                80h
              </span>
              {max12 >= 100 * 60 && (
                <>
                  <div
                    className="absolute left-0 right-0 border-t border-dashed border-[var(--accent-rose)]"
                    style={{ top: `${(1 - (100 * 60) / max12) * 100}%` }}
                  />
                  <span
                    className="absolute right-0 -mt-3 bg-[var(--bg-surface)] pl-1 text-[10px] text-[#be123c]"
                    style={{ top: `${(1 - (100 * 60) / max12) * 100}%` }}
                  >
                    100h
                  </span>
                </>
              )}
              {trailing12.map((m) => {
                const height = Math.min(100, Math.round((m.totalMinutes / max12) * 100));
                const overtimeHeight = Math.min(
                  100,
                  Math.round((m.overtimeMinutes / max12) * 100),
                );
                const isThisMonth = m.ym === targetYm;
                const totalH = (m.totalMinutes / 60).toFixed(1);
                return (
                  <div
                    key={m.ym}
                    className="relative z-10 flex flex-1 flex-col items-center gap-1.5"
                  >
                    <div className="flex h-full w-full flex-col justify-end">
                      <div
                        className={`relative w-full rounded-t-[3px] transition-colors ${
                          isThisMonth
                            ? "bg-gradient-to-t from-[var(--brand-primary)] to-[var(--brand-accent)]"
                            : m.totalMinutes >= 100 * 60
                              ? "bg-[var(--accent-rose)]"
                              : m.totalMinutes >= 80 * 60
                                ? "bg-[var(--accent-amber)]"
                                : m.totalMinutes > 0
                                  ? "bg-[var(--brand-accent-soft)] border-t-2 border-[var(--brand-accent)]"
                                  : "border border-dashed border-b-0 border-[var(--border-light)] bg-transparent"
                        }`}
                        style={{ height: `${Math.max(2, height)}%` }}
                        title={`${m.ym}: 合算${totalH}h（時間外${(m.overtimeMinutes / 60).toFixed(1)}h）`}
                      >
                        {/* 時間外部分の点線オーバーレイ */}
                        {m.overtimeMinutes > 0 && (
                          <div
                            className="absolute bottom-0 left-0 right-0 border-t-2 border-dashed border-white/60"
                            style={{ height: `${(overtimeHeight / height) * 100}%` }}
                          />
                        )}
                      </div>
                    </div>
                    <span
                      className={`text-[10px] font-medium ${
                        isThisMonth ? "font-semibold text-[var(--brand-primary)]" : "text-[var(--text-quaternary)]"
                      }`}
                    >
                      {m.ym.slice(5)}
                    </span>
                  </div>
                );
              })}
            </div>
          </section>

          {/* 複数月平均 */}
          <section className="u-card p-5">
            <div className="mb-4">
              <h3 className="text-[13px] font-semibold tracking-tight">
                複数月平均（80h以下が法定義務）
              </h3>
            </div>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
              {selected.overview.multiMonth.map((e) => (
                <div
                  key={e.span}
                  className={`rounded-[8px] border px-3 py-2.5 ${
                    e.exceeded
                      ? "border-[var(--accent-rose)] bg-[var(--accent-rose-soft)]/40"
                      : "border-[var(--border-light)] bg-white"
                  }`}
                >
                  <div className="text-[10px] text-[var(--text-tertiary)]">
                    直近{e.span}ヶ月平均
                  </div>
                  <div
                    className={`mt-0.5 tabular-nums text-[18px] font-semibold ${
                      e.exceeded ? "text-[#be123c]" : "text-[var(--text-primary)]"
                    }`}
                  >
                    {(e.averageMinutes / 60).toFixed(1)}
                    <span className="ml-0.5 text-[11px] font-normal text-[var(--text-tertiary)]">h</span>
                  </div>
                  {e.exceeded && (
                    <div className="mt-1 text-[10px] font-semibold text-[#be123c]">🚨 80h超過</div>
                  )}
                </div>
              ))}
            </div>
          </section>
        </>
      )}
    </AppShell>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-[var(--text-tertiary)]">
      {children}
    </th>
  );
}
