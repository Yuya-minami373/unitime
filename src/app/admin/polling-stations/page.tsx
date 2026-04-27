import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { Plus, ArrowLeft, Pencil, Trash2, X, MapPin } from "lucide-react";
import Link from "next/link";
import { getCurrentUser, canManageMasters } from "@/lib/auth";
import { dbAll, dbRun, dbGet } from "@/lib/db";
import AppShell from "@/components/AppShell";
import { ConfirmForm } from "./PollingStationActions";
import { PollingStationForm } from "./PollingStationForm";

type Municipality = {
  id: number;
  name: string;
  prefecture: string | null;
};

type PollingStation = {
  id: number;
  municipality_id: number;
  municipality_name: string;
  prefecture: string | null;
  name: string;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  is_active: number;
  notes: string | null;
  shift_count: number;
};

async function createPollingStation(formData: FormData) {
  "use server";
  const current = await getCurrentUser();
  if (!canManageMasters(current)) redirect("/admin");

  const municipality_id = Number(formData.get("municipality_id"));
  const name = String(formData.get("name") ?? "").trim();
  const address = String(formData.get("address") ?? "").trim() || null;
  const latRaw = String(formData.get("latitude") ?? "").trim();
  const lngRaw = String(formData.get("longitude") ?? "").trim();
  const latitude = latRaw === "" ? null : Number(latRaw);
  const longitude = lngRaw === "" ? null : Number(lngRaw);
  const notes = String(formData.get("notes") ?? "").trim() || null;
  const is_active = formData.get("is_active") ? 1 : 0;

  if (!municipality_id || !name) {
    redirect("/admin/polling-stations?error=required");
  }
  if (
    (latitude !== null && (Number.isNaN(latitude) || latitude < -90 || latitude > 90)) ||
    (longitude !== null && (Number.isNaN(longitude) || longitude < -180 || longitude > 180))
  ) {
    redirect("/admin/polling-stations?error=invalid_coords");
  }

  const muni = await dbGet<{ id: number }>(
    `SELECT id FROM municipalities WHERE id = ?`,
    [municipality_id],
  );
  if (!muni) {
    redirect("/admin/polling-stations?error=invalid_municipality");
  }

  const dup = await dbGet<{ id: number }>(
    `SELECT id FROM polling_stations WHERE municipality_id = ? AND name = ?`,
    [municipality_id, name],
  );
  if (dup) {
    redirect(
      `/admin/polling-stations?error=duplicate&name=${encodeURIComponent(name)}`,
    );
  }

  try {
    await dbRun(
      `INSERT INTO polling_stations
       (municipality_id, name, address, latitude, longitude, is_active, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [municipality_id, name, address, latitude, longitude, is_active, notes],
    );
  } catch (err) {
    console.error("[admin/polling-stations] create failed:", err);
    const msg = err instanceof Error ? err.message : "unknown";
    redirect(
      `/admin/polling-stations?error=db_error&detail=${encodeURIComponent(
        msg.slice(0, 200),
      )}`,
    );
  }

  revalidatePath("/admin/polling-stations");
  redirect("/admin/polling-stations?success=created");
}

async function updatePollingStation(formData: FormData) {
  "use server";
  const current = await getCurrentUser();
  if (!canManageMasters(current)) redirect("/admin");

  const id = Number(formData.get("id"));
  const municipality_id = Number(formData.get("municipality_id"));
  const name = String(formData.get("name") ?? "").trim();
  const address = String(formData.get("address") ?? "").trim() || null;
  const latRaw = String(formData.get("latitude") ?? "").trim();
  const lngRaw = String(formData.get("longitude") ?? "").trim();
  const latitude = latRaw === "" ? null : Number(latRaw);
  const longitude = lngRaw === "" ? null : Number(lngRaw);
  const notes = String(formData.get("notes") ?? "").trim() || null;
  const is_active = formData.get("is_active") ? 1 : 0;

  if (!id || !municipality_id || !name) {
    redirect(`/admin/polling-stations?error=required&editId=${id}`);
  }
  if (
    (latitude !== null && (Number.isNaN(latitude) || latitude < -90 || latitude > 90)) ||
    (longitude !== null && (Number.isNaN(longitude) || longitude < -180 || longitude > 180))
  ) {
    redirect(`/admin/polling-stations?error=invalid_coords&editId=${id}`);
  }

  const muni = await dbGet<{ id: number }>(
    `SELECT id FROM municipalities WHERE id = ?`,
    [municipality_id],
  );
  if (!muni) {
    redirect(`/admin/polling-stations?error=invalid_municipality&editId=${id}`);
  }

  const dup = await dbGet<{ id: number }>(
    `SELECT id FROM polling_stations
     WHERE municipality_id = ? AND name = ? AND id != ?`,
    [municipality_id, name, id],
  );
  if (dup) {
    redirect(
      `/admin/polling-stations?error=duplicate&name=${encodeURIComponent(name)}&editId=${id}`,
    );
  }

  try {
    await dbRun(
      `UPDATE polling_stations
       SET municipality_id = ?, name = ?, address = ?, latitude = ?, longitude = ?,
           is_active = ?, notes = ?, updated_at = datetime('now', '+9 hours')
       WHERE id = ?`,
      [municipality_id, name, address, latitude, longitude, is_active, notes, id],
    );
  } catch (err) {
    console.error("[admin/polling-stations] update failed:", err);
    const msg = err instanceof Error ? err.message : "unknown";
    redirect(
      `/admin/polling-stations?error=db_error&detail=${encodeURIComponent(
        msg.slice(0, 200),
      )}&editId=${id}`,
    );
  }

  revalidatePath("/admin/polling-stations");
  redirect("/admin/polling-stations?success=updated");
}

async function deletePollingStation(formData: FormData) {
  "use server";
  const current = await getCurrentUser();
  if (!canManageMasters(current)) redirect("/admin");

  const id = Number(formData.get("id"));
  if (!id) redirect("/admin/polling-stations");

  const shifts = await dbGet<{ c: number }>(
    `SELECT COUNT(*) as c FROM crew_shifts WHERE polling_station_id = ?`,
    [id],
  );
  const shiftCount = shifts?.c ?? 0;

  if (shiftCount > 0) {
    redirect(
      `/admin/polling-stations?error=has_shifts&shifts=${shiftCount}`,
    );
  }

  await dbRun(`DELETE FROM polling_stations WHERE id = ?`, [id]);
  revalidatePath("/admin/polling-stations");
  redirect("/admin/polling-stations?success=deleted");
}

export default async function PollingStationsPage({
  searchParams,
}: {
  searchParams: Promise<{
    error?: string;
    success?: string;
    name?: string;
    detail?: string;
    editId?: string;
    shifts?: string;
    filterMuni?: string;
  }>;
}) {
  const current = await getCurrentUser();
  if (!current) redirect("/login");
  if (!canManageMasters(current)) redirect("/admin");

  const sp = await searchParams;
  const editId = sp.editId ? Number(sp.editId) : null;
  const filterMuni = sp.filterMuni ? Number(sp.filterMuni) : null;

  const municipalities = await dbAll<Municipality>(
    `SELECT id, name, prefecture FROM municipalities ORDER BY prefecture, name`,
  );

  const stations = await dbAll<PollingStation>(
    `SELECT
       ps.id, ps.municipality_id, ps.name, ps.address, ps.latitude, ps.longitude,
       ps.is_active, ps.notes,
       m.name as municipality_name, m.prefecture,
       (SELECT COUNT(*) FROM crew_shifts WHERE polling_station_id = ps.id) as shift_count
     FROM polling_stations ps
     INNER JOIN municipalities m ON m.id = ps.municipality_id
     ${filterMuni ? `WHERE ps.municipality_id = ?` : ``}
     ORDER BY m.prefecture, m.name, ps.is_active DESC, ps.name`,
    filterMuni ? [filterMuni] : [],
  );

  const editTarget =
    editId !== null ? stations.find((s) => s.id === editId) ?? null : null;

  const errorMessage = errorToMessage(sp.error, sp.name, sp.detail, sp.shifts);
  const successMessage = successToMessage(sp.success);

  return (
    <AppShell user={{ name: current.name, role: current.role, employment: current.employment_type }}>
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight md:text-[24px]">
            投票所マスタ
          </h1>
          <p className="mt-1.5 text-[13px] text-[var(--text-tertiary)]">
            自治体ごとの投票所（期日前・当日・開票所）を登録・管理
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

      {/* Municipality filter */}
      {municipalities.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <span className="text-[12px] font-medium text-[var(--text-tertiary)]">
            自治体で絞り込み:
          </span>
          <Link
            href="/admin/polling-stations"
            className={`rounded-[6px] border px-2.5 py-1 text-[11px] transition-colors ${
              !filterMuni
                ? "border-[var(--brand-primary)] bg-[var(--brand-primary)] text-white"
                : "border-[var(--border-light)] bg-white text-[var(--text-secondary)] hover:border-[var(--brand-accent)]"
            }`}
          >
            すべて
          </Link>
          {municipalities.map((m) => (
            <Link
              key={m.id}
              href={`/admin/polling-stations?filterMuni=${m.id}`}
              className={`rounded-[6px] border px-2.5 py-1 text-[11px] transition-colors ${
                filterMuni === m.id
                  ? "border-[var(--brand-primary)] bg-[var(--brand-primary)] text-white"
                  : "border-[var(--border-light)] bg-white text-[var(--text-secondary)] hover:border-[var(--brand-accent)]"
              }`}
            >
              {m.name}
            </Link>
          ))}
        </div>
      )}

      {/* List */}
      <div className="u-card mb-8 overflow-hidden">
        {stations.length === 0 ? (
          <div className="px-6 py-10 text-center text-[13px] text-[var(--text-tertiary)]">
            {filterMuni
              ? "この自治体には投票所がまだ登録されていません。"
              : "投票所がまだ登録されていません。下のフォームから登録してください。"}
          </div>
        ) : (
          <>
            {/* Mobile cards */}
            <ul className="divide-y divide-[var(--border-light)] md:hidden">
              {stations.map((s) => (
                <li
                  key={s.id}
                  className={`px-4 py-3 ${s.is_active ? "" : "opacity-50"}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 flex-col gap-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[14px] font-semibold text-[var(--text-primary)]">
                          {s.name}
                        </span>
                        {!s.is_active && (
                          <span className="rounded-[4px] border border-[var(--border-light)] bg-white px-1.5 py-0.5 text-[10px] text-[var(--text-tertiary)]">
                            廃止
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-[var(--text-tertiary)]">
                        {s.prefecture && `${s.prefecture} ・ `}
                        {s.municipality_name}
                      </div>
                      {s.address && (
                        <div className="text-[11px] text-[var(--text-secondary)] line-clamp-2">
                          {s.address}
                        </div>
                      )}
                      <div className="text-[11px] text-[var(--text-tertiary)] tabular-nums">
                        {s.latitude != null && s.longitude != null && (
                          <span>
                            <MapPin size={10} className="inline" />{" "}
                            {s.latitude.toFixed(4)}, {s.longitude.toFixed(4)}
                          </span>
                        )}
                        <span className="ml-2">シフト {s.shift_count} 件</span>
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-2">
                      <Link
                        href={`/admin/polling-stations?editId=${s.id}${filterMuni ? `&filterMuni=${filterMuni}` : ""}#edit-form`}
                        className="text-[11px] font-medium text-[var(--brand-accent)] hover:text-[var(--brand-primary)]"
                      >
                        <Pencil size={12} className="inline" /> 編集
                      </Link>
                      {s.shift_count === 0 && (
                        <ConfirmForm
                          action={deletePollingStation}
                          confirmMessage={`${s.name} を削除します。よろしいですか？`}
                        >
                          <input type="hidden" name="id" value={s.id} />
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
                    <Th>自治体</Th>
                    <Th>投票所名</Th>
                    <Th>住所</Th>
                    <Th className="text-right">座標</Th>
                    <Th className="text-right">シフト</Th>
                    <Th>状態</Th>
                    <Th></Th>
                  </tr>
                </thead>
                <tbody>
                  {stations.map((s) => (
                    <tr
                      key={s.id}
                      className={`border-b border-[var(--border-light)] last:border-0 ${
                        s.is_active ? "hover:bg-[var(--bg-body)]" : "opacity-50"
                      }`}
                    >
                      <td className="px-4 py-3 text-[12px] text-[var(--text-secondary)]">
                        {s.prefecture && (
                          <span className="text-[10px] text-[var(--text-tertiary)]">
                            {s.prefecture} ・{" "}
                          </span>
                        )}
                        {s.municipality_name}
                      </td>
                      <td className="px-4 py-3 font-semibold text-[var(--text-primary)]">
                        {s.name}
                      </td>
                      <td className="px-4 py-3 text-[12px] text-[var(--text-tertiary)] max-w-[280px] truncate">
                        {s.address ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-[11px] text-[var(--text-tertiary)]">
                        {s.latitude != null && s.longitude != null ? (
                          <>
                            {s.latitude.toFixed(4)}
                            <br />
                            {s.longitude.toFixed(4)}
                          </>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-[var(--text-secondary)]">
                        {s.shift_count}
                      </td>
                      <td className="px-4 py-3">
                        {s.is_active ? (
                          <span className="flex items-center gap-1.5 text-[12px] text-[var(--text-secondary)]">
                            <span className="u-dot u-dot-indigo" />
                            有効
                          </span>
                        ) : (
                          <span className="text-[12px] text-[var(--text-quaternary)]">
                            廃止
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-3">
                          <Link
                            href={`/admin/polling-stations?editId=${s.id}${filterMuni ? `&filterMuni=${filterMuni}` : ""}#edit-form`}
                            className="text-[12px] font-medium text-[var(--brand-accent)] hover:text-[var(--brand-primary)]"
                          >
                            <Pencil size={12} className="inline" /> 編集
                          </Link>
                          {s.shift_count === 0 && (
                            <ConfirmForm
                              action={deletePollingStation}
                              confirmMessage={`${s.name} を削除します。よろしいですか？`}
                            >
                              <input type="hidden" name="id" value={s.id} />
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
              {editTarget ? `${editTarget.name} を編集` : "新規投票所登録"}
            </h2>
          </div>
          {editTarget && (
            <Link
              href={`/admin/polling-stations${filterMuni ? `?filterMuni=${filterMuni}` : ""}`}
              className="flex items-center gap-1 text-[12px] text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
            >
              <X size={12} /> 編集をキャンセル
            </Link>
          )}
        </div>
        <PollingStationForm
          action={editTarget ? updatePollingStation : createPollingStation}
          isEdit={!!editTarget}
          municipalities={municipalities}
          defaultId={editTarget?.id}
          defaultMunicipalityId={editTarget?.municipality_id ?? filterMuni ?? undefined}
          defaultName={editTarget?.name}
          defaultAddress={editTarget?.address ?? undefined}
          defaultLatitude={editTarget?.latitude}
          defaultLongitude={editTarget?.longitude}
          defaultIsActive={editTarget ? editTarget.is_active === 1 : true}
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
  shifts: string | undefined,
): string | null {
  if (!code) return null;
  switch (code) {
    case "required":
      return "自治体と投票所名は必須項目です。";
    case "invalid_coords":
      return "緯度は -90〜90、経度は -180〜180 の範囲で入力してください。";
    case "invalid_municipality":
      return "選択した自治体が見つかりません。再選択してください。";
    case "duplicate":
      return `同じ自治体に「${name}」という投票所が既に登録されています。`;
    case "has_shifts":
      return `この投票所には ${shifts ?? 0} 件のシフトが紐付いているため削除できません。「廃止」にすることで新規シフトでの選択を防げます。`;
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
      return "投票所を登録しました。";
    case "updated":
      return "変更を保存しました。";
    case "deleted":
      return "投票所を削除しました。";
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
