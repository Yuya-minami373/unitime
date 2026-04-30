// 月締めリマインド + 打刻漏れアラート（ホーム画面上部）

import Link from "next/link";
import { ClipboardList, AlertCircle, Bell } from "lucide-react";
import type { AnomalyEntry } from "@/lib/anomalies";

export default function HomeReminderBanner({
  targetMonth,
  isClosed,
  showReminder,
  pendingStampRequests,
  myAnomalies,
}: {
  targetMonth: string;
  isClosed: boolean;
  showReminder: boolean;
  pendingStampRequests: number;
  myAnomalies: AnomalyEntry[];
}) {
  // 何も表示すべきものが無ければ非表示
  const hasMyIssues = pendingStampRequests > 0 || myAnomalies.length > 0;
  if (!showReminder && !hasMyIssues) return null;

  return (
    <section className="flex flex-col gap-2.5">
      {/* 月締めリマインドバナー（締め前のみ表示） */}
      {showReminder && !isClosed && (
        <div className="rounded-[8px] border border-amber-200 bg-amber-50 px-4 py-2.5">
          <div className="flex items-start gap-2">
            <Bell
              size={14}
              strokeWidth={1.75}
              className="mt-0.5 shrink-0 text-amber-700"
            />
            <div className="flex-1">
              <div className="text-[12.5px] font-semibold text-amber-900">
                {targetMonth} の月締めが近づいています
              </div>
              <div className="mt-0.5 text-[11.5px] text-amber-800">
                打刻忘れ・打刻ミスがあれば月末までに
                <Link
                  href="/requests/stamps/new"
                  className="mx-1 underline hover:no-underline"
                >
                  打刻申請
                </Link>
                してください
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 自分の打刻漏れアラート */}
      {myAnomalies.length > 0 && (
        <div className="rounded-[8px] border border-rose-200 bg-rose-50 px-4 py-2.5">
          <div className="flex items-start gap-2">
            <AlertCircle
              size={14}
              strokeWidth={1.75}
              className="mt-0.5 shrink-0 text-rose-700"
            />
            <div className="flex-1">
              <div className="text-[12.5px] font-semibold text-rose-900">
                打刻漏れ疑い: {myAnomalies.length}件
              </div>
              <ul className="mt-1 space-y-0.5 text-[11.5px] text-rose-800">
                {myAnomalies.slice(0, 5).map((a, i) => (
                  <li key={i} className="tabular-nums">
                    {a.label}: {a.detail}
                  </li>
                ))}
              </ul>
              <Link
                href="/requests/stamps/new"
                className="mt-1.5 inline-block text-[11.5px] text-rose-700 underline hover:no-underline"
              >
                打刻申請する →
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* 自分の申請中件数 */}
      {pendingStampRequests > 0 && (
        <div className="rounded-[8px] border border-[var(--border-light)] bg-white px-4 py-2.5">
          <div className="flex items-start gap-2">
            <ClipboardList
              size={14}
              strokeWidth={1.75}
              className="mt-0.5 shrink-0 text-[var(--brand-accent)]"
            />
            <div className="flex-1">
              <div className="text-[12.5px] font-medium text-[var(--text-primary)]">
                打刻申請: {pendingStampRequests}件 承認待ち
              </div>
              <Link
                href="/requests?tab=stamp"
                className="mt-0.5 inline-block text-[11.5px] text-[var(--brand-accent)] underline hover:no-underline"
              >
                申請一覧を見る →
              </Link>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
