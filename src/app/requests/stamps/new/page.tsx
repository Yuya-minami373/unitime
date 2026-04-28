import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import AppShell from "@/components/AppShell";
import { dbAll } from "@/lib/db";
import { jstComponents, businessMonthRange } from "@/lib/time";
import StampRequestForm from "./StampRequestForm";

export default async function NewStampRequestPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; record_id?: string; action?: string; punch_type?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const params = await searchParams;
  const c = jstComponents();
  const today = `${c.year}-${String(c.month).padStart(2, "0")}-${String(c.day).padStart(2, "0")}`;
  const initialDate = params.date ?? today;

  // 過去30日分の自分の打刻履歴（修正/削除対象を選ばせるため）
  const thirtyDaysAgo = new Date(Date.UTC(c.year, c.month - 1, c.day - 30));
  const fromIso = `${thirtyDaysAgo.getUTCFullYear()}-${String(thirtyDaysAgo.getUTCMonth() + 1).padStart(2, "0")}-${String(thirtyDaysAgo.getUTCDate()).padStart(2, "0")}T04:00:00+09:00`;

  const recentRecords = await dbAll<{
    id: number;
    punch_type: string;
    punched_at: string;
    kind: string | null;
  }>(
    `SELECT id, punch_type, punched_at, kind FROM attendance_records
     WHERE user_id = ? AND punched_at >= ? AND (kind IS NULL OR kind = 'work')
     ORDER BY punched_at DESC LIMIT 200`,
    [user.id, fromIso],
  );

  return (
    <AppShell
      user={{ name: user.name, role: user.role, employment: user.employment_type }}
    >
      <div className="mb-6">
        <Link
          href="/requests/stamps"
          className="flex items-center gap-1 text-[12px] text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
        >
          <ArrowLeft size={12} />
          申請一覧に戻る
        </Link>
        <h1 className="mt-1.5 text-[20px] font-semibold tracking-tight md:text-[22px]">
          打刻を申請
        </h1>
        <p className="mt-1 text-[12px] text-[var(--text-tertiary)]">
          管理者の承認後、勤怠データに反映されます。修正前後は監査ログに永久保存されます。
        </p>
      </div>

      <section className="u-card overflow-hidden">
        <div className="p-4 md:p-5">
          <StampRequestForm
            initialDate={initialDate}
            initialAction={(params.action as "add" | "modify" | "delete" | undefined) ?? "add"}
            initialPunchType={(params.punch_type as
              | "clock_in"
              | "clock_out"
              | "break_start"
              | "break_end"
              | undefined) ?? "clock_in"}
            initialRecordId={params.record_id ? Number(params.record_id) : null}
            recentRecords={recentRecords}
          />
        </div>
      </section>
    </AppShell>
  );
}
