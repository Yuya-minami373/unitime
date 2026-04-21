import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import AppShell from "@/components/AppShell";
import { nowJST } from "@/lib/time";
import ExpenseForm from "./ExpenseForm";

export default async function NewExpensePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role === "owner") redirect("/admin");
  if (user.employment_type === "crew") redirect("/");

  const { error } = await searchParams;
  const today = nowJST().slice(0, 10);

  return (
    <AppShell user={{ name: user.name, role: user.role, employment: user.employment_type }}>
      <div className="mb-8">
        <h1 className="text-[22px] font-semibold tracking-tight md:text-[24px]">
          立替精算・交通費申請
        </h1>
        <p className="mt-1.5 text-[13px] text-[var(--text-tertiary)]">
          経費の立替・交通費・出張費用を申請します。承認=振込完了です
        </p>
      </div>
      <div className="max-w-[720px]">
        <ExpenseForm initialDate={today} initialError={error} />
      </div>
    </AppShell>
  );
}
