import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { Plus, ArrowLeft } from "lucide-react";
import Link from "next/link";
import { getCurrentUser, hashPassword } from "@/lib/auth";
import { dbAll, dbRun } from "@/lib/db";
import AppShell from "@/components/AppShell";
import { ConfirmForm } from "./UserActionButtons";

type User = {
  id: number;
  login_id: string;
  name: string;
  email: string | null;
  employment_type: string;
  role: string;
  monthly_salary: number | null;
  hourly_rate: number | null;
  hire_date: string | null;
  status: string;
};

async function createUser(formData: FormData) {
  "use server";
  const current = await getCurrentUser();
  if (!current || current.role !== "owner") redirect("/admin");

  const login_id = String(formData.get("login_id") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim() || null;
  const password = String(formData.get("password") ?? "").trim();
  const employment_type = String(formData.get("employment_type") ?? "employee");
  const role = String(formData.get("role") ?? "member");
  const salary_type = String(formData.get("salary_type") ?? "monthly");
  const salary = Number(formData.get("salary") ?? 0);
  const hire_date = String(formData.get("hire_date") ?? "") || null;

  if (!login_id || !name || !password) {
    redirect("/admin/users?error=required");
  }
  if (password.length < 8) {
    redirect("/admin/users?error=short_password");
  }

  // 重複 login_id の事前チェック（同姓同名の別人対応も考え、login_idのみ見る）
  const existing = await dbAll<{ id: number; status: string }>(
    `SELECT id, status FROM users WHERE login_id = ?`,
    [login_id],
  );
  if (existing.length > 0) {
    const status = existing[0].status;
    const code = status === "retired" ? "duplicate_retired" : "duplicate_active";
    redirect(`/admin/users?error=${code}&login_id=${encodeURIComponent(login_id)}`);
  }

  const { hash } = hashPassword(password);
  try {
    await dbRun(
      `INSERT INTO users (login_id, password_hash, name, email, employment_type, role, salary_type, monthly_salary, hourly_rate, hire_date)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        login_id,
        hash,
        name,
        email,
        employment_type,
        role,
        salary_type,
        salary_type === "monthly" ? salary : null,
        salary_type === "hourly" ? salary : null,
        hire_date,
      ],
    );
  } catch (err) {
    console.error("[admin/users] createUser failed:", err);
    const msg = err instanceof Error ? err.message : "unknown";
    redirect(`/admin/users?error=db_error&detail=${encodeURIComponent(msg.slice(0, 200))}`);
  }

  revalidatePath("/admin/users");
  redirect("/admin/users?success=created");
}

async function deactivateUser(formData: FormData) {
  "use server";
  const current = await getCurrentUser();
  if (!current || current.role !== "owner") redirect("/admin");

  const userId = Number(formData.get("user_id"));
  if (userId === current.id) {
    redirect("/admin/users?error=self");
  }

  await dbRun(`UPDATE users SET status = 'retired' WHERE id = ?`, [userId]);
  revalidatePath("/admin/users");
  redirect("/admin/users?success=retired");
}

async function reactivateUser(formData: FormData) {
  "use server";
  const current = await getCurrentUser();
  if (!current || current.role !== "owner") redirect("/admin");

  const userId = Number(formData.get("user_id"));
  await dbRun(`UPDATE users SET status = 'active' WHERE id = ?`, [userId]);
  revalidatePath("/admin/users");
  redirect("/admin/users?success=reactivated");
}

const EMPLOYMENT_LABEL: Record<string, string> = {
  employee: "社員",
  contractor: "業務委託",
  crew: "クルー",
};

export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; success?: string; login_id?: string; detail?: string }>;
}) {
  const current = await getCurrentUser();
  if (!current) redirect("/login");
  // ユーザー管理（給与情報含む）は owner のみ
  if (current.role !== "owner") redirect("/admin");

  const { error, success, login_id: errLoginId, detail } = await searchParams;

  const users = await dbAll<User>(
    `SELECT id, login_id, name, email, employment_type, role, monthly_salary, hourly_rate, hire_date, status
     FROM users ORDER BY status = 'active' DESC, id`,
  );

  const errorMessage = errorToMessage(error, errLoginId, detail);
  const successMessage = successToMessage(success);

  return (
    <AppShell user={{ name: current.name, role: current.role, employment: current.employment_type }}>
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight md:text-[24px]">
            ユーザー管理
          </h1>
          <p className="mt-1.5 text-[13px] text-[var(--text-tertiary)]">
            社員・業務委託・クルーの登録と管理
          </p>
        </div>
        <Link href="/admin" className="u-btn u-btn-secondary">
          <ArrowLeft size={14} strokeWidth={1.75} />
          チームに戻る
        </Link>
      </div>

      {successMessage && (
        <div className="mb-4 rounded-[8px] border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-[13px] text-emerald-800">
          ✅ {successMessage}
        </div>
      )}
      {errorMessage && (
        <div className="mb-4 rounded-[8px] border border-rose-200 bg-rose-50 px-4 py-2.5 text-[13px] text-rose-800">
          ⚠️ {errorMessage}
        </div>
      )}

      {/* Users table */}
      <div className="u-card mb-8 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-[var(--border-brand)] bg-[var(--brand-50)] text-left">
                <Th>ログインID</Th>
                <Th>氏名</Th>
                <Th>雇用形態</Th>
                <Th>権限</Th>
                <Th>給与</Th>
                <Th>入社日</Th>
                <Th>状態</Th>
                <Th></Th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr
                  key={u.id}
                  className={`border-b border-[var(--border-light)] last:border-0 ${
                    u.status === "retired" ? "opacity-50" : "hover:bg-[var(--bg-body)]"
                  }`}
                >
                  <td className="px-4 py-3 tabular-nums text-[var(--text-secondary)]">
                    {u.login_id}
                  </td>
                  <td className="px-4 py-3 font-semibold text-[var(--text-primary)]">
                    {u.name}
                  </td>
                  <td className="px-4 py-3">
                    <span className="rounded-[4px] border border-[var(--border-light)] bg-white px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-[var(--text-tertiary)]">
                      {EMPLOYMENT_LABEL[u.employment_type] ?? u.employment_type}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {u.role === "owner" ? (
                      <span className="rounded-[4px] border border-[var(--brand-primary)] bg-[var(--brand-primary)] px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-white">
                        代表
                      </span>
                    ) : u.role === "admin" ? (
                      <span className="rounded-[4px] border border-[var(--brand-accent-border)] bg-[var(--brand-accent-soft)] px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-[var(--brand-accent)]">
                        管理者
                      </span>
                    ) : (
                      <span className="text-[12px] text-[var(--text-tertiary)]">一般</span>
                    )}
                  </td>
                  <td className="px-4 py-3 tabular-nums text-[12px] text-[var(--text-secondary)]">
                    {u.monthly_salary
                      ? `月${(u.monthly_salary / 10000).toFixed(0)}万`
                      : u.hourly_rate
                      ? `時給¥${u.hourly_rate}`
                      : "—"}
                  </td>
                  <td className="px-4 py-3 tabular-nums text-[12px] text-[var(--text-tertiary)]">
                    {u.hire_date ?? "—"}
                  </td>
                  <td className="px-4 py-3">
                    {u.status === "active" ? (
                      <span className="flex items-center gap-1.5 text-[12px] text-[var(--text-secondary)]">
                        <span className="u-dot u-dot-indigo" />
                        在籍
                      </span>
                    ) : (
                      <span className="text-[12px] text-[var(--text-quaternary)]">退職</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {u.status === "active" && u.id !== current.id && (
                      <ConfirmForm
                        action={deactivateUser}
                        confirmMessage={`${u.name} さんを退職処理します。よろしいですか？\n\n（「復職」ボタンで元に戻せます）`}
                      >
                        <input type="hidden" name="user_id" value={u.id} />
                        <button
                          type="submit"
                          className="text-[12px] font-medium text-[var(--text-tertiary)] transition-colors hover:text-[var(--text-primary)]"
                        >
                          退職処理
                        </button>
                      </ConfirmForm>
                    )}
                    {u.status === "retired" && (
                      <ConfirmForm
                        action={reactivateUser}
                        confirmMessage={`${u.name} さんを在籍に戻します。よろしいですか？`}
                      >
                        <input type="hidden" name="user_id" value={u.id} />
                        <button
                          type="submit"
                          className="text-[12px] font-medium text-[var(--brand-accent)] transition-colors hover:text-[var(--brand-primary)]"
                        >
                          復職
                        </button>
                      </ConfirmForm>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create form */}
      <div className="u-card p-6">
        <div className="mb-5 flex items-center gap-2">
          <Plus size={16} strokeWidth={1.75} className="text-[var(--text-secondary)]" />
          <h2 className="text-[14px] font-semibold tracking-tight">新規ユーザー登録</h2>
        </div>
        <form action={createUser} className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <FormField label="ログインID" required>
            <input name="login_id" required className="u-input" placeholder="例: yamada" />
          </FormField>
          <FormField label="氏名" required>
            <input name="name" required className="u-input" placeholder="例: 山田 太郎" />
          </FormField>
          <FormField label="メールアドレス">
            <input name="email" type="email" className="u-input" />
          </FormField>
          <FormField label="初期パスワード" required>
            <input
              name="password"
              required
              className="u-input"
              placeholder="8文字以上推奨"
            />
          </FormField>
          <FormField label="雇用形態">
            <select name="employment_type" className="u-input">
              <option value="employee">社員</option>
              <option value="contractor">業務委託</option>
              <option value="crew">クルー</option>
            </select>
          </FormField>
          <FormField label="権限">
            <select name="role" className="u-input">
              <option value="member">一般</option>
              <option value="admin">管理者</option>
            </select>
          </FormField>
          <FormField label="給与形態">
            <select name="salary_type" className="u-input">
              <option value="monthly">月給</option>
              <option value="hourly">時給</option>
              <option value="daily">日給</option>
            </select>
          </FormField>
          <FormField label="給与額">
            <input
              name="salary"
              type="number"
              className="u-input"
              placeholder="月給350000 / 時給1500"
            />
          </FormField>
          <FormField label="入社日">
            <input name="hire_date" type="date" className="u-input" />
          </FormField>
          <div className="flex items-end md:col-span-2">
            <button type="submit" className="u-btn u-btn-primary">
              <Plus size={14} strokeWidth={1.75} />
              ユーザーを登録
            </button>
          </div>
        </form>
      </div>
    </AppShell>
  );
}

function errorToMessage(
  code: string | undefined,
  loginId: string | undefined,
  detail: string | undefined,
): string | null {
  if (!code) return null;
  switch (code) {
    case "required":
      return "ログインID・氏名・初期パスワードは必須項目です。";
    case "short_password":
      return "初期パスワードは8文字以上で設定してください。";
    case "duplicate_active":
      return `ログインID「${loginId}」は既に在籍中のユーザーで使われています。別のIDを指定してください。`;
    case "duplicate_retired":
      return `ログインID「${loginId}」は退職済みユーザーで使用されています。新規作成ではなく、テーブルの「復職」ボタンで戻せます。別人として登録する場合は別のログインIDを指定してください。`;
    case "self":
      return "自分自身を退職処理することはできません。";
    case "db_error":
      return `登録に失敗しました: ${detail ?? "DBエラー"}`;
    default:
      return `エラーが発生しました（${code}）`;
  }
}

function successToMessage(code: string | undefined): string | null {
  if (!code) return null;
  switch (code) {
    case "created":
      return "ユーザーを登録しました。";
    case "retired":
      return "退職処理を完了しました。";
    case "reactivated":
      return "在籍ステータスに戻しました。";
    default:
      return null;
  }
}

function Th({ children }: { children?: React.ReactNode }) {
  return (
    <th className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-[var(--text-tertiary)]">
      {children}
    </th>
  );
}

function FormField({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-[12px] font-medium text-[var(--text-secondary)]">
        {label}
        {required && <span className="ml-0.5 text-[var(--accent-indigo)]">*</span>}
      </label>
      {children}
    </div>
  );
}
