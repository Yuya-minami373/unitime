import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { Plus, ArrowLeft, Pencil, Trash2, X, UserCog } from "lucide-react";
import Link from "next/link";
import { getCurrentUser, canManageMasters } from "@/lib/auth";
import { dbAll, dbRun, dbGet } from "@/lib/db";
import AppShell from "@/components/AppShell";
import { ConfirmForm } from "./RoleActions";

type Role = {
  id: number;
  name: string;
  description: string | null;
  is_default: number;
  display_order: number;
  rate_count: number;
  shift_count: number;
  preference_count: number;
};

async function createRole(formData: FormData) {
  "use server";
  const current = await getCurrentUser();
  if (!canManageMasters(current)) redirect("/admin");

  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim() || null;
  const display_order = Number(formData.get("display_order") ?? 0);

  if (!name) {
    redirect("/admin/roles?error=required");
  }

  const dup = await dbGet<{ id: number }>(
    `SELECT id FROM roles WHERE name = ?`,
    [name],
  );
  if (dup) {
    redirect(`/admin/roles?error=duplicate&name=${encodeURIComponent(name)}`);
  }

  try {
    await dbRun(
      `INSERT INTO roles (name, description, is_default, display_order) VALUES (?, ?, 0, ?)`,
      [name, description, display_order],
    );
  } catch (err) {
    console.error("[admin/roles] create failed:", err);
    const msg = err instanceof Error ? err.message : "unknown";
    redirect(
      `/admin/roles?error=db_error&detail=${encodeURIComponent(msg.slice(0, 200))}`,
    );
  }

  revalidatePath("/admin/roles");
  redirect("/admin/roles?success=created");
}

async function updateRole(formData: FormData) {
  "use server";
  const current = await getCurrentUser();
  if (!canManageMasters(current)) redirect("/admin");

  const id = Number(formData.get("id"));
  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim() || null;
  const display_order = Number(formData.get("display_order") ?? 0);

  if (!id || !name) {
    redirect(`/admin/roles?error=required&editId=${id}`);
  }

  const dup = await dbGet<{ id: number }>(
    `SELECT id FROM roles WHERE name = ? AND id != ?`,
    [name, id],
  );
  if (dup) {
    redirect(
      `/admin/roles?error=duplicate&name=${encodeURIComponent(name)}&editId=${id}`,
    );
  }

  try {
    await dbRun(
      `UPDATE roles SET name = ?, description = ?, display_order = ? WHERE id = ?`,
      [name, description, display_order, id],
    );
  } catch (err) {
    console.error("[admin/roles] update failed:", err);
    const msg = err instanceof Error ? err.message : "unknown";
    redirect(
      `/admin/roles?error=db_error&detail=${encodeURIComponent(msg.slice(0, 200))}&editId=${id}`,
    );
  }

  revalidatePath("/admin/roles");
  redirect("/admin/roles?success=updated");
}

async function deleteRole(formData: FormData) {
  "use server";
  const current = await getCurrentUser();
  if (!canManageMasters(current)) redirect("/admin");

  const id = Number(formData.get("id"));
  if (!id) redirect("/admin/roles");

  const role = await dbGet<{ is_default: number }>(
    `SELECT is_default FROM roles WHERE id = ?`,
    [id],
  );
  if (!role) redirect("/admin/roles");
  if (role.is_default === 1) {
    redirect("/admin/roles?error=is_default_role");
  }

  const usage = await dbGet<{ rates: number; shifts: number; prefs: number }>(
    `SELECT
       (SELECT COUNT(*) FROM election_role_rates WHERE role_id = ?) as rates,
       (SELECT COUNT(*) FROM crew_shifts WHERE role_id = ?) as shifts,
       (SELECT COUNT(*) FROM shift_preferences WHERE preferred_role_id = ?) as prefs`,
    [id, id, id],
  );
  if (usage && (usage.rates > 0 || usage.shifts > 0 || usage.prefs > 0)) {
    redirect(
      `/admin/roles?error=has_relations&rates=${usage.rates}&shifts=${usage.shifts}&prefs=${usage.prefs}`,
    );
  }

  await dbRun(`DELETE FROM roles WHERE id = ?`, [id]);
  revalidatePath("/admin/roles");
  redirect("/admin/roles?success=deleted");
}

export default async function RolesPage({
  searchParams,
}: {
  searchParams: Promise<{
    error?: string;
    success?: string;
    name?: string;
    detail?: string;
    editId?: string;
    rates?: string;
    shifts?: string;
    prefs?: string;
  }>;
}) {
  const current = await getCurrentUser();
  if (!current) redirect("/login");
  if (!canManageMasters(current)) redirect("/admin");

  const sp = await searchParams;
  const editId = sp.editId ? Number(sp.editId) : null;

  const roles = await dbAll<Role>(
    `SELECT
       r.id, r.name, r.description, r.is_default, r.display_order,
       (SELECT COUNT(*) FROM election_role_rates WHERE role_id = r.id) as rate_count,
       (SELECT COUNT(*) FROM crew_shifts WHERE role_id = r.id) as shift_count,
       (SELECT COUNT(*) FROM shift_preferences WHERE preferred_role_id = r.id) as preference_count
     FROM roles r
     ORDER BY r.display_order, r.id`,
  );

  const editTarget =
    editId !== null ? roles.find((r) => r.id === editId) ?? null : null;

  const errorMessage = errorToMessage(
    sp.error,
    sp.name,
    sp.detail,
    sp.rates,
    sp.shifts,
    sp.prefs,
  );
  const successMessage = successToMessage(sp.success);

  return (
    <AppShell user={{ name: current.name, role: current.role, employment: current.employment_type }}>
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight md:text-[24px]">
            役割マスタ
          </h1>
          <p className="mt-1.5 text-[13px] text-[var(--text-tertiary)]">
            投票所でのクルー役割（一般・庶務・現場マネージャーなど）の管理
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

      {/* List */}
      <div className="u-card mb-8 overflow-hidden">
        {roles.length === 0 ? (
          <div className="px-6 py-10 text-center text-[13px] text-[var(--text-tertiary)]">
            役割がまだ登録されていません。
          </div>
        ) : (
          <>
            {/* Mobile cards */}
            <ul className="divide-y divide-[var(--border-light)] md:hidden">
              {roles.map((r) => (
                <li key={r.id} className="px-4 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 flex-col gap-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[14px] font-semibold text-[var(--text-primary)]">
                          {r.name}
                        </span>
                        {r.is_default === 1 && (
                          <span className="rounded-[4px] border border-[var(--brand-accent-border)] bg-[var(--brand-accent-soft)] px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-[var(--brand-accent)]">
                            標準
                          </span>
                        )}
                      </div>
                      {r.description && (
                        <div className="text-[11px] text-[var(--text-secondary)]">
                          {r.description}
                        </div>
                      )}
                      <div className="text-[11px] text-[var(--text-tertiary)] tabular-nums">
                        順序 {r.display_order} / 案件時給 {r.rate_count} / シフト {r.shift_count} / 希望 {r.preference_count}
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-2">
                      <Link
                        href={`/admin/roles?editId=${r.id}#edit-form`}
                        className="text-[11px] font-medium text-[var(--brand-accent)] hover:text-[var(--brand-primary)]"
                      >
                        <Pencil size={12} className="inline" /> 編集
                      </Link>
                      {r.is_default === 0 &&
                        r.rate_count === 0 &&
                        r.shift_count === 0 &&
                        r.preference_count === 0 && (
                          <ConfirmForm
                            action={deleteRole}
                            confirmMessage={`${r.name} を削除します。よろしいですか？`}
                          >
                            <input type="hidden" name="id" value={r.id} />
                            <button
                              type="submit"
                              className="text-[11px] font-medium text-rose-600 hover:text-rose-800"
                            >
                              <Trash2 size={12} className="inline" /> 削除
                            </button>
                          </ConfirmForm>
                        )}
                    </div>
                  </div>
                </li>
              ))}
            </ul>

            {/* Desktop table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="border-b border-[var(--border-brand)] bg-[var(--brand-50)] text-left">
                    <Th className="text-right">順</Th>
                    <Th>役割名</Th>
                    <Th>説明</Th>
                    <Th>種別</Th>
                    <Th className="text-right">利用件数</Th>
                    <Th></Th>
                  </tr>
                </thead>
                <tbody>
                  {roles.map((r) => (
                    <tr
                      key={r.id}
                      className="border-b border-[var(--border-light)] last:border-0 hover:bg-[var(--bg-body)]"
                    >
                      <td className="px-4 py-3 text-right tabular-nums text-[12px] text-[var(--text-tertiary)]">
                        {r.display_order}
                      </td>
                      <td className="px-4 py-3 font-semibold text-[var(--text-primary)]">
                        {r.name}
                      </td>
                      <td className="px-4 py-3 text-[12px] text-[var(--text-secondary)] max-w-[400px]">
                        {r.description ?? "—"}
                      </td>
                      <td className="px-4 py-3">
                        {r.is_default === 1 ? (
                          <span className="rounded-[4px] border border-[var(--brand-accent-border)] bg-[var(--brand-accent-soft)] px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-[var(--brand-accent)]">
                            標準
                          </span>
                        ) : (
                          <span className="text-[11px] text-[var(--text-tertiary)]">追加</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right text-[11px] tabular-nums text-[var(--text-tertiary)]">
                        時給{r.rate_count}/シフト{r.shift_count}/希望{r.preference_count}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-3">
                          <Link
                            href={`/admin/roles?editId=${r.id}#edit-form`}
                            className="text-[12px] font-medium text-[var(--brand-accent)] hover:text-[var(--brand-primary)]"
                          >
                            <Pencil size={12} className="inline" /> 編集
                          </Link>
                          {r.is_default === 0 &&
                            r.rate_count === 0 &&
                            r.shift_count === 0 &&
                            r.preference_count === 0 && (
                              <ConfirmForm
                                action={deleteRole}
                                confirmMessage={`${r.name} を削除します。よろしいですか？`}
                              >
                                <input type="hidden" name="id" value={r.id} />
                                <button
                                  type="submit"
                                  className="text-[12px] font-medium text-rose-600 hover:text-rose-800"
                                >
                                  <Trash2 size={12} className="inline" /> 削除
                                </button>
                              </ConfirmForm>
                            )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {/* Create / Edit form */}
      <div id="edit-form" className="u-card p-6">
        <div className="mb-5 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            {editTarget ? (
              <Pencil size={16} strokeWidth={1.75} className="text-[var(--text-secondary)]" />
            ) : (
              <UserCog size={16} strokeWidth={1.75} className="text-[var(--text-secondary)]" />
            )}
            <h2 className="text-[14px] font-semibold tracking-tight">
              {editTarget ? `${editTarget.name} を編集` : "新規役割登録"}
            </h2>
          </div>
          {editTarget && (
            <Link
              href="/admin/roles"
              className="flex items-center gap-1 text-[12px] text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
            >
              <X size={12} /> 編集をキャンセル
            </Link>
          )}
        </div>
        <form
          action={editTarget ? updateRole : createRole}
          className="grid grid-cols-1 gap-4 md:grid-cols-2"
        >
          {editTarget && <input type="hidden" name="id" value={editTarget.id} />}
          <FormField label="役割名" required>
            <input
              name="name"
              required
              defaultValue={editTarget?.name ?? ""}
              className="u-input"
              placeholder="例: 開票担当"
            />
          </FormField>
          <FormField label="表示順">
            <input
              name="display_order"
              type="number"
              min="0"
              defaultValue={editTarget?.display_order ?? roles.length + 1}
              className="u-input"
            />
          </FormField>
          <div className="md:col-span-2">
            <FormField label="説明">
              <textarea
                name="description"
                defaultValue={editTarget?.description ?? ""}
                className="u-input min-h-[80px]"
                placeholder="役割の業務内容（例: 開票作業の補助・票分類）"
              />
            </FormField>
          </div>
          <div className="flex items-end md:col-span-2">
            <button type="submit" className="u-btn u-btn-primary">
              {editTarget ? (
                <>
                  <Pencil size={14} strokeWidth={1.75} />
                  変更を保存
                </>
              ) : (
                <>
                  <Plus size={14} strokeWidth={1.75} />
                  役割を登録
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </AppShell>
  );
}

function errorToMessage(
  code: string | undefined,
  name: string | undefined,
  detail: string | undefined,
  rates: string | undefined,
  shifts: string | undefined,
  prefs: string | undefined,
): string | null {
  if (!code) return null;
  switch (code) {
    case "required":
      return "役割名は必須項目です。";
    case "duplicate":
      return `役割「${name}」は既に登録されています。`;
    case "is_default_role":
      return "標準役割（一般・庶務・現場マネージャー）は削除できません。名前や説明の編集のみ可能です。";
    case "has_relations":
      return `この役割には案件時給 ${rates ?? 0} / シフト ${shifts ?? 0} / 希望 ${prefs ?? 0} 件が紐付いているため削除できません。`;
    case "db_error":
      return `保存に失敗しました: ${detail ?? "DBエラー"}`;
    default:
      return `エラーが発生しました（${code}）`;
  }
}

function successToMessage(code: string | undefined): string | null {
  if (!code) return null;
  switch (code) {
    case "created":
      return "役割を登録しました。";
    case "updated":
      return "変更を保存しました。";
    case "deleted":
      return "役割を削除しました。";
    default:
      return null;
  }
}

function Th({
  children,
  className = "",
}: {
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <th
      className={`px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-[var(--text-tertiary)] ${className}`}
    >
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
