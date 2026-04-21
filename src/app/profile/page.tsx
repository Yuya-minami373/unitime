import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import AppShell from "@/components/AppShell";
import { changePasswordAndRedirect } from "./actions";

export default async function ProfilePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; success?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const { error, success } = await searchParams;

  return (
    <AppShell user={{ name: user.name, role: user.role, employment: user.employment_type }}>
      <div className="mb-8">
        <h1 className="text-[22px] font-semibold tracking-tight md:text-[24px]">
          プロフィール
        </h1>
        <p className="mt-1.5 text-[13px] text-[var(--text-tertiary)]">
          アカウント情報の確認・パスワード変更
        </p>
      </div>

      <div className="max-w-[560px] space-y-6">
        <section className="rounded-[10px] border border-[var(--border-default)] bg-white p-5 shadow-[var(--shadow-subtle)]">
          <h2 className="mb-3 text-[14px] font-semibold">アカウント情報</h2>
          <dl className="grid grid-cols-[120px_1fr] gap-y-2 text-[13px]">
            <dt className="text-[var(--text-tertiary)]">氏名</dt>
            <dd className="font-medium">{user.name}</dd>
            <dt className="text-[var(--text-tertiary)]">ログインID</dt>
            <dd className="font-mono text-[12px]">{user.login_id}</dd>
            <dt className="text-[var(--text-tertiary)]">メール</dt>
            <dd>{user.email ?? "未設定"}</dd>
            <dt className="text-[var(--text-tertiary)]">雇用形態</dt>
            <dd>{employmentLabel(user.employment_type)}</dd>
          </dl>
        </section>

        <section className="rounded-[10px] border border-[var(--border-default)] bg-white p-5 shadow-[var(--shadow-subtle)]">
          <h2 className="mb-3 text-[14px] font-semibold">パスワード変更</h2>

          {success && (
            <div className="mb-3 rounded-[6px] bg-emerald-50 px-3 py-2 text-[12px] text-emerald-800">
              ✅ パスワードを変更しました
            </div>
          )}
          {error && (
            <div className="mb-3 rounded-[6px] bg-rose-50 px-3 py-2 text-[12px] text-rose-800">
              {error}
            </div>
          )}

          <form action={changePasswordAndRedirect} className="space-y-3">
            <Field
              label="現在のパスワード"
              name="current_password"
              type="password"
              required
              autoComplete="current-password"
            />
            <Field
              label="新しいパスワード（8文字以上）"
              name="new_password"
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
            />
            <Field
              label="新しいパスワード（確認）"
              name="confirm_password"
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
            />
            <button type="submit" className="u-btn-primary mt-2">
              パスワードを変更
            </button>
          </form>
        </section>
      </div>
    </AppShell>
  );
}

function Field({
  label,
  name,
  type,
  required,
  minLength,
  autoComplete,
}: {
  label: string;
  name: string;
  type: string;
  required?: boolean;
  minLength?: number;
  autoComplete?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[12px] font-medium text-[var(--text-secondary)]">
        {label}
      </span>
      <input
        type={type}
        name={name}
        required={required}
        minLength={minLength}
        autoComplete={autoComplete}
        className="w-full rounded-[6px] border border-[var(--border-default)] bg-white px-3 py-2 text-[13px] focus:border-[var(--brand-accent)] focus:outline-none"
      />
    </label>
  );
}

function employmentLabel(t: string): string {
  return (
    { executive: "役員", employee: "社員", contractor: "業務委託", crew: "クルー" }[t] ??
    t
  );
}
