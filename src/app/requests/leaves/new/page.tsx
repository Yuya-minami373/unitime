import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import AppShell from "@/components/AppShell";
import { listSpecialPolicies, calcBalanceForUser } from "@/lib/leaves";
import { createLeaveRequest } from "../../actions";
import { LeaveForm } from "./LeaveForm";

export default async function NewLeavePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.employment_type === "crew") redirect("/");

  const [policies, balances] = await Promise.all([
    listSpecialPolicies(),
    calcBalanceForUser(user.id),
  ]);

  return (
    <AppShell
      user={{ name: user.name, role: user.role, employment: user.employment_type }}
    >
      <div className="mb-6">
        <Link
          href="/requests?tab=leave"
          className="flex items-center gap-1 text-[12px] text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
        >
          <ArrowLeft size={12} />
          申請一覧に戻る
        </Link>
        <h1 className="mt-1.5 text-[20px] font-semibold tracking-tight md:text-[22px]">
          休暇を新規申請
        </h1>
        <p className="mt-1 text-[12px] text-[var(--text-tertiary)]">
          承認後、勤怠への反映と残日数控除が行われます（残日数管理は有給・特別休暇のみ）。
        </p>
      </div>

      <section className="u-card overflow-hidden">
        <div className="p-4 md:p-5">
          <LeaveForm
            policies={policies}
            balances={{ paid: balances.paid, special: balances.special }}
            action={createLeaveRequest}
          />
        </div>
      </section>
    </AppShell>
  );
}
