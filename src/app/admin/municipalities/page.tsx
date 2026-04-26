import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { Plus, ArrowLeft, Pencil, Trash2, X } from "lucide-react";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { dbAll, dbRun, dbGet } from "@/lib/db";
import AppShell from "@/components/AppShell";
import { ConfirmForm } from "./MunicipalityActions";
import { MunicipalityForm } from "./MunicipalityForm";
import { PREFECTURES } from "@/lib/jp-municipalities";

type Municipality = {
  id: number;
  name: string;
  prefecture: string | null;
  notes: string | null;
  station_count: number;
  election_count: number;
};

async function createMunicipality(formData: FormData) {
  "use server";
  const current = await getCurrentUser();
  if (!current || current.employment_type !== "employee") redirect("/admin");

  const name = String(formData.get("name") ?? "").trim();
  const prefecture = String(formData.get("prefecture") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim() || null;

  if (!name || !prefecture) {
    redirect("/admin/municipalities?error=required");
  }
  if (!PREFECTURES.includes(prefecture)) {
    redirect("/admin/municipalities?error=invalid_prefecture");
  }

  const existing = await dbGet<{ id: number }>(
    `SELECT id FROM municipalities WHERE name = ?`,
    [name],
  );
  if (existing) {
    redirect(
      `/admin/municipalities?error=duplicate&name=${encodeURIComponent(name)}`,
    );
  }

  try {
    await dbRun(
      `INSERT INTO municipalities (name, prefecture, notes) VALUES (?, ?, ?)`,
      [name, prefecture, notes],
    );
  } catch (err) {
    console.error("[admin/municipalities] create failed:", err);
    const msg = err instanceof Error ? err.message : "unknown";
    redirect(
      `/admin/municipalities?error=db_error&detail=${encodeURIComponent(
        msg.slice(0, 200),
      )}`,
    );
  }

  revalidatePath("/admin/municipalities");
  redirect("/admin/municipalities?success=created");
}

async function updateMunicipality(formData: FormData) {
  "use server";
  const current = await getCurrentUser();
  if (!current || current.employment_type !== "employee") redirect("/admin");

  const id = Number(formData.get("id"));
  const name = String(formData.get("name") ?? "").trim();
  const prefecture = String(formData.get("prefecture") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim() || null;

  if (!id || !name || !prefecture) {
    redirect(`/admin/municipalities?error=required&editId=${id}`);
  }
  if (!PREFECTURES.includes(prefecture)) {
    redirect(`/admin/municipalities?error=invalid_prefecture&editId=${id}`);
  }

  const dup = await dbGet<{ id: number }>(
    `SELECT id FROM municipalities WHERE name = ? AND id != ?`,
    [name, id],
  );
  if (dup) {
    redirect(
      `/admin/municipalities?error=duplicate&name=${encodeURIComponent(name)}&editId=${id}`,
    );
  }

  try {
    await dbRun(
      `UPDATE municipalities
       SET name = ?, prefecture = ?, notes = ?, updated_at = datetime('now', '+9 hours')
       WHERE id = ?`,
      [name, prefecture, notes, id],
    );
  } catch (err) {
    console.error("[admin/municipalities] update failed:", err);
    const msg = err instanceof Error ? err.message : "unknown";
    redirect(
      `/admin/municipalities?error=db_error&detail=${encodeURIComponent(
        msg.slice(0, 200),
      )}&editId=${id}`,
    );
  }

  revalidatePath("/admin/municipalities");
  redirect("/admin/municipalities?success=updated");
}

async function deleteMunicipality(formData: FormData) {
  "use server";
  const current = await getCurrentUser();
  if (!current || current.employment_type !== "employee") redirect("/admin");

  const id = Number(formData.get("id"));
  if (!id) redirect("/admin/municipalities");

  // 関連件数チェック（CASCADEだが事故防止）
  const station = await dbGet<{ c: number }>(
    `SELECT COUNT(*) as c FROM polling_stations WHERE municipality_id = ?`,
    [id],
  );
  const election = await dbGet<{ c: number }>(
    `SELECT COUNT(*) as c FROM elections WHERE municipality_id = ?`,
    [id],
  );
  const stationCount = station?.c ?? 0;
  const electionCount = election?.c ?? 0;

  if (stationCount > 0 || electionCount > 0) {
    redirect(
      `/admin/municipalities?error=has_relations&stations=${stationCount}&elections=${electionCount}`,
    );
  }

  await dbRun(`DELETE FROM municipalities WHERE id = ?`, [id]);
  revalidatePath("/admin/municipalities");
  redirect("/admin/municipalities?success=deleted");
}

export default async function MunicipalitiesPage({
  searchParams,
}: {
  searchParams: Promise<{
    error?: string;
    success?: string;
    name?: string;
    detail?: string;
    editId?: string;
    stations?: string;
    elections?: string;
  }>;
}) {
  const current = await getCurrentUser();
  if (!current) redirect("/login");
  if (current.employment_type !== "employee") redirect("/admin");

  const sp = await searchParams;
  const editId = sp.editId ? Number(sp.editId) : null;

  const municipalities = await dbAll<Municipality>(
    `SELECT
       m.id, m.name, m.prefecture, m.notes,
       (SELECT COUNT(*) FROM polling_stations WHERE municipality_id = m.id) as station_count,
       (SELECT COUNT(*) FROM elections WHERE municipality_id = m.id) as election_count
     FROM municipalities m
     ORDER BY m.name`,
  );

  const editTarget =
    editId !== null
      ? municipalities.find((m) => m.id === editId) ?? null
      : null;

  const errorMessage = errorToMessage(sp.error, sp.name, sp.detail, sp.stations, sp.elections);
  const successMessage = successToMessage(sp.success);

  return (
    <AppShell user={{ name: current.name, role: current.role, employment: current.employment_type }}>
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight md:text-[24px]">
            自治体マスタ
          </h1>
          <p className="mt-1.5 text-[13px] text-[var(--text-tertiary)]">
            UniPollクルーが稼働する自治体の登録・管理
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
        {municipalities.length === 0 ? (
          <div className="px-6 py-10 text-center text-[13px] text-[var(--text-tertiary)]">
            自治体がまだ登録されていません。下のフォームから登録してください。
          </div>
        ) : (
          <>
            {/* Mobile cards */}
            <ul className="divide-y divide-[var(--border-light)] md:hidden">
              {municipalities.map((m) => (
                <li key={m.id} className="px-4 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 flex-col gap-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[14px] font-semibold text-[var(--text-primary)]">
                          {m.name}
                        </span>
                        {m.prefecture && (
                          <span className="rounded-[4px] border border-[var(--border-light)] bg-white px-1.5 py-0.5 text-[10px] font-medium text-[var(--text-tertiary)]">
                            {m.prefecture}
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-[var(--text-tertiary)] tabular-nums">
                        投票所 {m.station_count} 箇所 / 案件 {m.election_count} 件
                      </div>
                      {m.notes && (
                        <div className="text-[11px] text-[var(--text-secondary)] line-clamp-2">
                          {m.notes}
                        </div>
                      )}
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-2">
                      <Link
                        href={`/admin/municipalities?editId=${m.id}#edit-form`}
                        className="text-[11px] font-medium text-[var(--brand-accent)] hover:text-[var(--brand-primary)]"
                      >
                        <Pencil size={12} className="inline" /> 編集
                      </Link>
                      {m.station_count === 0 && m.election_count === 0 && (
                        <ConfirmForm
                          action={deleteMunicipality}
                          confirmMessage={`${m.name} を削除します。よろしいですか？`}
                        >
                          <input type="hidden" name="id" value={m.id} />
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
                    <Th>自治体名</Th>
                    <Th>都道府県</Th>
                    <Th className="text-right">投票所</Th>
                    <Th className="text-right">案件</Th>
                    <Th>備考</Th>
                    <Th></Th>
                  </tr>
                </thead>
                <tbody>
                  {municipalities.map((m) => (
                    <tr
                      key={m.id}
                      className="border-b border-[var(--border-light)] last:border-0 hover:bg-[var(--bg-body)]"
                    >
                      <td className="px-4 py-3 font-semibold text-[var(--text-primary)]">
                        {m.name}
                      </td>
                      <td className="px-4 py-3 text-[12px] text-[var(--text-secondary)]">
                        {m.prefecture ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-[var(--text-secondary)]">
                        {m.station_count}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-[var(--text-secondary)]">
                        {m.election_count}
                      </td>
                      <td className="px-4 py-3 text-[12px] text-[var(--text-tertiary)] max-w-[280px] truncate">
                        {m.notes ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-3">
                          <Link
                            href={`/admin/municipalities?editId=${m.id}#edit-form`}
                            className="text-[12px] font-medium text-[var(--brand-accent)] hover:text-[var(--brand-primary)]"
                          >
                            <Pencil size={12} className="inline" /> 編集
                          </Link>
                          {m.station_count === 0 && m.election_count === 0 && (
                            <ConfirmForm
                              action={deleteMunicipality}
                              confirmMessage={`${m.name} を削除します。よろしいですか？`}
                            >
                              <input type="hidden" name="id" value={m.id} />
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
              <Plus size={16} strokeWidth={1.75} className="text-[var(--text-secondary)]" />
            )}
            <h2 className="text-[14px] font-semibold tracking-tight">
              {editTarget ? `${editTarget.name} を編集` : "新規自治体登録"}
            </h2>
          </div>
          {editTarget && (
            <Link
              href="/admin/municipalities"
              className="flex items-center gap-1 text-[12px] text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
            >
              <X size={12} /> 編集をキャンセル
            </Link>
          )}
        </div>
        <MunicipalityForm
          action={editTarget ? updateMunicipality : createMunicipality}
          isEdit={!!editTarget}
          defaultId={editTarget?.id}
          defaultName={editTarget?.name}
          defaultPrefecture={editTarget?.prefecture ?? undefined}
          defaultNotes={editTarget?.notes ?? undefined}
        />
      </div>
    </AppShell>
  );
}

function errorToMessage(
  code: string | undefined,
  name: string | undefined,
  detail: string | undefined,
  stations: string | undefined,
  elections: string | undefined,
): string | null {
  if (!code) return null;
  switch (code) {
    case "required":
      return "都道府県と自治体名は必須項目です。";
    case "invalid_prefecture":
      return "都道府県は候補から正確に選んでください（47都道府県のいずれか）。";
    case "duplicate":
      return `自治体「${name}」は既に登録されています。`;
    case "has_relations":
      return `関連データ（投票所 ${stations ?? 0} 件 / 案件 ${elections ?? 0} 件）が紐付いているため削除できません。先に投票所・案件を削除してください。`;
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
      return "自治体を登録しました。";
    case "updated":
      return "変更を保存しました。";
    case "deleted":
      return "自治体を削除しました。";
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

