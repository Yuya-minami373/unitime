import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import Link from "next/link";
import { UserPlus, Pencil, Trash2, Power } from "lucide-react";
import { getCurrentUser, canManageMasters } from "@/lib/auth";
import { dbAll, dbGet, dbRun } from "@/lib/db";
import AppShell from "@/components/AppShell";
import { CrewForm } from "./CrewForm";

type CrewRow = {
  id: number;
  login_id: string;
  name: string;
  email: string | null;
  phone: string | null;
  status: string;
  registration_status: string | null;
  default_role_id: number | null;
  default_role_name: string | null;
  has_election_day_experience: number | null;
  has_prevoting_experience: number | null;
  has_counting_experience: number | null;
  transportation_unit_cost: number | null;
  postal_code: string | null;
  address: string | null;
  emergency_contact: string | null;
  notes: string | null;
  training_status: string | null;
  training_completed_at: string | null;
  training_notes: string | null;
  available_municipality_count: number;
  experienced_role_count: number;
  experienced_role_names: string | null;
  shift_count: number;
  preference_count: number;
};

type RoleOption = { id: number; name: string };
type MunicipalityOption = {
  id: number;
  name: string;
  prefecture: string | null;
};

async function createCrew(formData: FormData) {
  "use server";
  const current = await getCurrentUser();
  if (!canManageMasters(current)) redirect("/admin");

  const result = await upsertCrewFromForm(formData, null);
  if (typeof result === "string") redirect(`/admin/crews?error=${result}`);

  revalidatePath("/admin/crews");
  redirect(`/admin/crews?success=created`);
}

async function updateCrew(formData: FormData) {
  "use server";
  const current = await getCurrentUser();
  if (!canManageMasters(current)) redirect("/admin");

  const id = Number(formData.get("id"));
  if (!id) redirect("/admin/crews?error=invalid_id");

  const result = await upsertCrewFromForm(formData, id);
  if (typeof result === "string") redirect(`/admin/crews?error=${result}&editId=${id}`);

  revalidatePath("/admin/crews");
  redirect(`/admin/crews?success=updated`);
}

async function deactivateCrew(formData: FormData) {
  "use server";
  const current = await getCurrentUser();
  if (!canManageMasters(current)) redirect("/admin");

  const id = Number(formData.get("id"));
  if (!id) redirect("/admin/crews?error=invalid_id");

  const target = await dbGet<{ id: number; employment_type: string }>(
    `SELECT id, employment_type FROM users WHERE id = ?`,
    [id],
  );
  if (!target || target.employment_type !== "crew") {
    redirect(`/admin/crews?error=not_found`);
  }

  await dbRun(`UPDATE users SET status = 'inactive' WHERE id = ?`, [id]);
  await dbRun(
    `UPDATE crew_profiles SET registration_status = 'inactive', updated_at = datetime('now', '+9 hours')
     WHERE user_id = ?`,
    [id],
  );

  revalidatePath("/admin/crews");
  redirect(`/admin/crews?success=deactivated`);
}

async function reactivateCrew(formData: FormData) {
  "use server";
  const current = await getCurrentUser();
  if (!canManageMasters(current)) redirect("/admin");

  const id = Number(formData.get("id"));
  if (!id) redirect("/admin/crews?error=invalid_id");

  await dbRun(`UPDATE users SET status = 'active' WHERE id = ?`, [id]);
  await dbRun(
    `UPDATE crew_profiles SET registration_status = 'active', updated_at = datetime('now', '+9 hours')
     WHERE user_id = ?`,
    [id],
  );

  revalidatePath("/admin/crews");
  redirect(`/admin/crews?success=reactivated`);
}

async function deleteCrew(formData: FormData) {
  "use server";
  const current = await getCurrentUser();
  if (!canManageMasters(current)) redirect("/admin");

  const id = Number(formData.get("id"));
  if (!id) redirect("/admin/crews?error=invalid_id");

  // 関連データがある場合は削除させない
  const [shifts, prefs, attendance] = await Promise.all([
    dbGet<{ c: number }>(`SELECT COUNT(*) as c FROM crew_shifts WHERE user_id = ?`, [id]),
    dbGet<{ c: number }>(`SELECT COUNT(*) as c FROM shift_preferences WHERE user_id = ?`, [id]),
    dbGet<{ c: number }>(`SELECT COUNT(*) as c FROM attendance_records WHERE user_id = ?`, [id]),
  ]);
  if ((shifts?.c ?? 0) > 0 || (prefs?.c ?? 0) > 0 || (attendance?.c ?? 0) > 0) {
    redirect(`/admin/crews?error=has_relations`);
  }

  await dbRun(`DELETE FROM users WHERE id = ?`, [id]);

  revalidatePath("/admin/crews");
  redirect(`/admin/crews?success=deleted`);
}

// 共通: フォームから user/crew_profile/available_municipalities を一括 upsert
// 戻り値: 成功時 number(user_id) / 失敗時 エラーコード string
async function upsertCrewFromForm(
  formData: FormData,
  existingId: number | null,
): Promise<number | string> {
  const name = String(formData.get("name") ?? "").trim();
  const login_id = String(formData.get("login_id") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim() || null;
  const phone = String(formData.get("phone") ?? "").trim() || null;
  const postal_code = String(formData.get("postal_code") ?? "").trim() || null;
  const address = String(formData.get("address") ?? "").trim() || null;
  const emergency_contact = String(formData.get("emergency_contact") ?? "").trim() || null;
  const status = String(formData.get("status") ?? "active");

  const default_role_id_raw = String(formData.get("default_role_id") ?? "").trim();
  const default_role_id = default_role_id_raw ? Number(default_role_id_raw) : null;
  const has_prevoting_experience = formData.get("has_prevoting_experience") === "1" ? 1 : 0;
  const has_election_day_experience =
    formData.get("has_election_day_experience") === "1" ? 1 : 0;
  const has_counting_experience = formData.get("has_counting_experience") === "1" ? 1 : 0;
  const transportation_unit_cost = Math.max(
    0,
    Math.floor(Number(formData.get("transportation_unit_cost") ?? 0)),
  );
  const notes = String(formData.get("notes") ?? "").trim() || null;
  const registration_status =
    status === "inactive" ? "inactive" : "active";

  const training_status_raw = String(formData.get("training_status") ?? "not_started");
  const training_status = (
    ["not_started", "in_progress", "completed"] as const
  ).includes(training_status_raw as never)
    ? training_status_raw
    : "not_started";
  const training_completed_at =
    String(formData.get("training_completed_at") ?? "").trim() || null;
  const training_notes = String(formData.get("training_notes") ?? "").trim() || null;

  const municipalityIds = formData
    .getAll("available_municipality_id")
    .map((v) => Number(v))
    .filter((n) => Number.isFinite(n) && n > 0);

  const experiencedRoleIds = formData
    .getAll("experienced_role_id")
    .map((v) => Number(v))
    .filter((n) => Number.isFinite(n) && n > 0);

  if (!name) return "name_required";
  if (!login_id) return "login_id_required";
  if (municipalityIds.length === 0) return "municipality_required";

  // login_id 重複チェック
  const dup = await dbGet<{ id: number }>(
    `SELECT id FROM users WHERE login_id = ? AND id != ?`,
    [login_id, existingId ?? 0],
  );
  if (dup) return "login_id_duplicated";

  let userId: number;
  try {
    if (existingId) {
      await dbRun(
        `UPDATE users SET
           login_id = ?, name = ?, email = ?, phone = ?,
           postal_code = ?, address = ?, emergency_contact = ?,
           status = ?, updated_at = datetime('now', '+9 hours')
         WHERE id = ? AND employment_type = 'crew'`,
        [
          login_id,
          name,
          email,
          phone,
          postal_code,
          address,
          emergency_contact,
          status,
          existingId,
        ],
      );
      userId = existingId;
    } else {
      const insert = await dbRun(
        `INSERT INTO users
           (login_id, password_hash, name, email, phone,
            postal_code, address, emergency_contact,
            employment_type, role, status,
            standard_work_minutes,
            created_at, updated_at)
         VALUES (?, NULL, ?, ?, ?, ?, ?, ?, 'crew', 'member', ?, 0,
                 datetime('now', '+9 hours'), datetime('now', '+9 hours'))`,
        [
          login_id,
          name,
          email,
          phone,
          postal_code,
          address,
          emergency_contact,
          status,
        ],
      );
      userId = Number(insert.lastInsertRowid);
      if (!userId) return "db_error";
    }

    // crew_profiles upsert
    await dbRun(
      `INSERT INTO crew_profiles
         (user_id, registration_status, default_role_id,
          has_election_day_experience, has_prevoting_experience, has_counting_experience,
          transportation_unit_cost, notes,
          training_status, training_completed_at, training_notes,
          updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', '+9 hours'))
       ON CONFLICT(user_id) DO UPDATE SET
         registration_status = excluded.registration_status,
         default_role_id = excluded.default_role_id,
         has_election_day_experience = excluded.has_election_day_experience,
         has_prevoting_experience = excluded.has_prevoting_experience,
         has_counting_experience = excluded.has_counting_experience,
         transportation_unit_cost = excluded.transportation_unit_cost,
         notes = excluded.notes,
         training_status = excluded.training_status,
         training_completed_at = excluded.training_completed_at,
         training_notes = excluded.training_notes,
         updated_at = excluded.updated_at`,
      [
        userId,
        registration_status,
        default_role_id,
        has_election_day_experience,
        has_prevoting_experience,
        has_counting_experience,
        transportation_unit_cost,
        notes,
        training_status,
        training_completed_at,
        training_notes,
      ],
    );

    // 稼働可能自治体: いったん全削除→再投入（差分計算より単純で意図が明確）
    await dbRun(`DELETE FROM crew_available_municipalities WHERE user_id = ?`, [userId]);
    for (const muniId of municipalityIds) {
      await dbRun(
        `INSERT OR IGNORE INTO crew_available_municipalities (user_id, municipality_id)
         VALUES (?, ?)`,
        [userId, muniId],
      );
    }

    // 経験役割: 同上
    await dbRun(`DELETE FROM crew_experienced_roles WHERE user_id = ?`, [userId]);
    for (const roleId of experiencedRoleIds) {
      await dbRun(
        `INSERT OR IGNORE INTO crew_experienced_roles (user_id, role_id)
         VALUES (?, ?)`,
        [userId, roleId],
      );
    }
  } catch (err) {
    console.error("[admin/crews] upsertCrewFromForm failed:", err);
    return "db_error";
  }

  return userId;
}

export default async function CrewsPage({
  searchParams,
}: {
  searchParams: Promise<{
    error?: string;
    success?: string;
    editId?: string;
    statusFilter?: string;
  }>;
}) {
  const current = await getCurrentUser();
  if (!current) redirect("/login");
  if (!canManageMasters(current)) redirect("/admin");

  const sp = await searchParams;
  const editId = sp.editId ? Number(sp.editId) : null;
  const statusFilter = sp.statusFilter === "inactive" ? "inactive" : "active";

  const crews = await dbAll<CrewRow>(
    `SELECT
       u.id, u.login_id, u.name, u.email, u.phone, u.status,
       u.postal_code, u.address, u.emergency_contact,
       cp.registration_status, cp.default_role_id,
       r.name as default_role_name,
       cp.has_election_day_experience, cp.has_prevoting_experience, cp.has_counting_experience,
       cp.transportation_unit_cost, cp.notes,
       cp.training_status, cp.training_completed_at, cp.training_notes,
       (SELECT COUNT(*) FROM crew_available_municipalities WHERE user_id = u.id) as available_municipality_count,
       (SELECT COUNT(*) FROM crew_experienced_roles WHERE user_id = u.id) as experienced_role_count,
       (SELECT GROUP_CONCAT(r2.name, ' / ')
          FROM crew_experienced_roles cer
          INNER JOIN roles r2 ON r2.id = cer.role_id
         WHERE cer.user_id = u.id
         ORDER BY r2.display_order, r2.id) as experienced_role_names,
       (SELECT COUNT(*) FROM crew_shifts WHERE user_id = u.id) as shift_count,
       (SELECT COUNT(*) FROM shift_preferences WHERE user_id = u.id) as preference_count
     FROM users u
     LEFT JOIN crew_profiles cp ON cp.user_id = u.id
     LEFT JOIN roles r ON r.id = cp.default_role_id
     WHERE u.employment_type = 'crew' AND u.status = ?
     ORDER BY u.name COLLATE NOCASE, u.id`,
    [statusFilter],
  );

  const roles = await dbAll<RoleOption>(
    `SELECT id, name FROM roles ORDER BY display_order, id`,
    [],
  );
  const municipalities = await dbAll<MunicipalityOption>(
    `SELECT id, name, prefecture FROM municipalities ORDER BY name`,
    [],
  );

  // 編集対象取得
  let editTarget:
    | (CrewRow & {
        available_municipality_ids: number[];
        experienced_role_ids: number[];
      })
    | null = null;
  if (editId) {
    const target = crews.find((c) => c.id === editId);
    if (target) {
      const [availMunis, expRoles] = await Promise.all([
        dbAll<{ municipality_id: number }>(
          `SELECT municipality_id FROM crew_available_municipalities WHERE user_id = ?`,
          [editId],
        ),
        dbAll<{ role_id: number }>(
          `SELECT role_id FROM crew_experienced_roles WHERE user_id = ?`,
          [editId],
        ),
      ]);
      editTarget = {
        ...target,
        available_municipality_ids: availMunis.map((m) => m.municipality_id),
        experienced_role_ids: expRoles.map((r) => r.role_id),
      };
    }
  }

  const errorMessage = errorToMessage(sp.error);
  const successMessage = successToMessage(sp.success);
  const inactiveCount = await dbGet<{ c: number }>(
    `SELECT COUNT(*) as c FROM users WHERE employment_type = 'crew' AND status = 'inactive'`,
    [],
  );
  const activeCount = await dbGet<{ c: number }>(
    `SELECT COUNT(*) as c FROM users WHERE employment_type = 'crew' AND status = 'active'`,
    [],
  );

  return (
    <AppShell user={{ name: current.name, role: current.role, employment: current.employment_type }}>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[20px] font-semibold tracking-tight md:text-[22px]">
            クルー名簿
          </h1>
          <p className="mt-1 text-[12px] text-[var(--text-tertiary)]">
            シフト調整・稼働コスト集計の前提となるクルー情報を管理します。
          </p>
        </div>
        <div className="flex items-center gap-1.5 text-[12px]">
          <Link
            href="/admin/crews?statusFilter=active"
            className={`u-btn ${statusFilter === "active" ? "u-btn-primary" : "u-btn-secondary"}`}
          >
            稼働中 {activeCount?.c ?? 0}
          </Link>
          <Link
            href="/admin/crews?statusFilter=inactive"
            className={`u-btn ${statusFilter === "inactive" ? "u-btn-primary" : "u-btn-secondary"}`}
          >
            休止中 {inactiveCount?.c ?? 0}
          </Link>
        </div>
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

      {/* 登録/編集フォーム */}
      <section id="crew-form" className="u-card mb-6 overflow-hidden">
        <header className="flex items-center justify-between gap-3 border-b border-[var(--border-light)] bg-[var(--brand-50)] px-4 py-3">
          <div className="flex items-center gap-2">
            <UserPlus size={16} strokeWidth={1.75} className="text-[var(--brand-primary)]" />
            <h2 className="text-[14px] font-semibold tracking-tight">
              {editTarget ? `編集: ${editTarget.name}` : "新規クルー登録"}
            </h2>
          </div>
          {editTarget && (
            <Link
              href="/admin/crews"
              className="text-[12px] text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
            >
              編集をやめて新規入力に戻る
            </Link>
          )}
        </header>
        <div className="p-4 md:p-5">
          {municipalities.length === 0 ? (
            <div className="text-center text-[13px] text-[var(--text-tertiary)]">
              先に「自治体マスタ」で稼働可能自治体を登録してください。
              <br />
              <Link
                href="/admin/municipalities"
                className="text-[var(--brand-accent)] hover:underline"
              >
                自治体マスタへ
              </Link>
            </div>
          ) : (
            <CrewForm
              key={editTarget?.id ?? "new"}
              action={editTarget ? updateCrew : createCrew}
              isEdit={Boolean(editTarget)}
              roles={roles}
              municipalities={municipalities}
              defaultId={editTarget?.id}
              defaultName={editTarget?.name}
              defaultLoginId={editTarget?.login_id}
              defaultEmail={editTarget?.email ?? ""}
              defaultPhone={editTarget?.phone ?? ""}
              defaultPostalCode={editTarget?.postal_code ?? ""}
              defaultAddress={editTarget?.address ?? ""}
              defaultEmergencyContact={editTarget?.emergency_contact ?? ""}
              defaultStatus={editTarget?.status ?? "active"}
              defaultRoleId={editTarget?.default_role_id ?? null}
              defaultHasPrevoting={Boolean(editTarget?.has_prevoting_experience)}
              defaultHasElectionDay={Boolean(editTarget?.has_election_day_experience)}
              defaultHasCounting={Boolean(editTarget?.has_counting_experience)}
              defaultTransportationUnitCost={editTarget?.transportation_unit_cost ?? 0}
              defaultNotes={editTarget?.notes ?? ""}
              defaultMunicipalityIds={editTarget?.available_municipality_ids ?? []}
              defaultExperiencedRoleIds={editTarget?.experienced_role_ids ?? []}
              defaultTrainingStatus={editTarget?.training_status ?? "not_started"}
              defaultTrainingCompletedAt={editTarget?.training_completed_at ?? ""}
              defaultTrainingNotes={editTarget?.training_notes ?? ""}
            />
          )}
        </div>
      </section>

      {/* 一覧 */}
      <section className="u-card overflow-hidden">
        <header className="flex items-center justify-between gap-3 border-b border-[var(--border-light)] bg-[var(--brand-50)] px-4 py-3">
          <h2 className="text-[14px] font-semibold tracking-tight">
            クルー一覧（{statusFilter === "active" ? "稼働中" : "休止中"}）
          </h2>
          <span className="text-[11px] text-[var(--text-tertiary)] tabular-nums">
            {crews.length} 名
          </span>
        </header>

        {crews.length === 0 ? (
          <div className="px-4 py-10 text-center text-[13px] text-[var(--text-tertiary)]">
            該当するクルーは登録されていません。
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-[12px]">
              <thead className="bg-[var(--bg-body)] text-[11px] text-[var(--text-tertiary)]">
                <tr>
                  <th className="px-3 py-2 text-left font-normal">氏名</th>
                  <th className="px-3 py-2 text-left font-normal">連絡先</th>
                  <th className="px-3 py-2 text-left font-normal">デフォルト役割</th>
                  <th className="px-3 py-2 text-left font-normal">経験役割</th>
                  <th className="px-3 py-2 text-left font-normal">業務経験</th>
                  <th className="px-3 py-2 text-left font-normal">研修</th>
                  <th className="px-3 py-2 text-right font-normal">交通費(/出勤)</th>
                  <th className="px-3 py-2 text-right font-normal">稼働可</th>
                  <th className="px-3 py-2 text-right font-normal">シフト</th>
                  <th className="px-3 py-2 text-right font-normal">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-light)]">
                {crews.map((c) => (
                  <tr key={c.id}>
                    <td className="px-3 py-2.5 align-top">
                      <div className="font-semibold text-[var(--text-primary)]">{c.name}</div>
                      <div className="text-[10px] text-[var(--text-tertiary)]">
                        ID: {c.login_id}
                      </div>
                    </td>
                    <td className="px-3 py-2.5 align-top text-[11px]">
                      {c.email && <div>{c.email}</div>}
                      {c.phone && (
                        <div className="text-[var(--text-secondary)]">{c.phone}</div>
                      )}
                      {!c.email && !c.phone && (
                        <span className="text-[var(--text-quaternary)]">-</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 align-top">
                      {c.default_role_name ?? (
                        <span className="text-[var(--text-quaternary)]">未設定</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 align-top text-[11px]">
                      {c.experienced_role_count > 0 ? (
                        <span className="text-[var(--text-secondary)]">
                          {c.experienced_role_names ?? "-"}
                        </span>
                      ) : (
                        <span className="text-[var(--text-quaternary)]">-</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 align-top text-[10px]">
                      <ExperienceTag label="期日前" on={Boolean(c.has_prevoting_experience)} />
                      <ExperienceTag label="当日" on={Boolean(c.has_election_day_experience)} />
                      <ExperienceTag label="開票" on={Boolean(c.has_counting_experience)} />
                    </td>
                    <td className="px-3 py-2.5 align-top text-[11px]">
                      <TrainingBadge
                        status={c.training_status}
                        completedAt={c.training_completed_at}
                      />
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums align-top">
                      ¥{(c.transportation_unit_cost ?? 0).toLocaleString()}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums align-top">
                      {c.available_municipality_count} 自治体
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums align-top">
                      {c.shift_count}
                    </td>
                    <td className="px-3 py-2.5 align-top">
                      <div className="flex flex-col items-end gap-1.5">
                        <Link
                          href={`/admin/crews?editId=${c.id}#crew-form`}
                          className="flex items-center gap-1 text-[11px] font-medium text-[var(--brand-accent)] hover:text-[var(--brand-primary)]"
                        >
                          <Pencil size={11} />
                          編集
                        </Link>
                        {statusFilter === "active" ? (
                          <form action={deactivateCrew}>
                            <input type="hidden" name="id" value={c.id} />
                            <button
                              type="submit"
                              className="flex items-center gap-1 text-[11px] text-amber-700 hover:text-amber-900"
                            >
                              <Power size={11} />
                              休止
                            </button>
                          </form>
                        ) : (
                          <form action={reactivateCrew}>
                            <input type="hidden" name="id" value={c.id} />
                            <button
                              type="submit"
                              className="flex items-center gap-1 text-[11px] text-emerald-700 hover:text-emerald-900"
                            >
                              <Power size={11} />
                              復帰
                            </button>
                          </form>
                        )}
                        <form
                          action={deleteCrew}
                          onSubmit={undefined}
                        >
                          <input type="hidden" name="id" value={c.id} />
                          <button
                            type="submit"
                            className="flex items-center gap-1 text-[11px] text-rose-600 hover:text-rose-800"
                          >
                            <Trash2 size={11} />
                            削除
                          </button>
                        </form>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </AppShell>
  );
}

function TrainingBadge({
  status,
  completedAt,
}: {
  status: string | null;
  completedAt: string | null;
}) {
  const s = status ?? "not_started";
  const config: Record<string, { label: string; cls: string }> = {
    not_started: {
      label: "未受講",
      cls: "border-slate-200 bg-slate-50 text-slate-600",
    },
    in_progress: {
      label: "受講中",
      cls: "border-amber-200 bg-amber-50 text-amber-800",
    },
    completed: {
      label: "受講済",
      cls: "border-emerald-200 bg-emerald-50 text-emerald-800",
    },
  };
  const c = config[s] ?? config.not_started;
  return (
    <div className="flex flex-col gap-0.5">
      <span
        className={`inline-block w-fit rounded-[3px] border px-1.5 py-0.5 text-[10px] font-medium ${c.cls}`}
      >
        {c.label}
      </span>
      {s === "completed" && completedAt && (
        <span className="text-[10px] tabular-nums text-[var(--text-tertiary)]">
          {completedAt}
        </span>
      )}
    </div>
  );
}

function ExperienceTag({ label, on }: { label: string; on: boolean }) {
  if (!on) {
    return (
      <span className="mr-1 inline-block text-[var(--text-quaternary)]">
        {label}
      </span>
    );
  }
  return (
    <span className="mr-1 inline-block rounded-[3px] border border-emerald-200 bg-emerald-50 px-1 py-0.5 text-emerald-800">
      {label}
    </span>
  );
}

function errorToMessage(code: string | undefined): string | null {
  if (!code) return null;
  switch (code) {
    case "name_required":
      return "氏名を入力してください。";
    case "login_id_required":
      return "ログインID（メールアドレスまたは任意のID）を入力してください。";
    case "login_id_duplicated":
      return "そのログインIDは既に使われています。別のIDを指定してください。";
    case "municipality_required":
      return "稼働可能な自治体を1つ以上選択してください。";
    case "invalid_id":
      return "対象のクルーIDが不正です。";
    case "not_found":
      return "対象のクルーが見つかりません。";
    case "has_relations":
      return "シフト・希望・打刻が紐づいているため削除できません。代わりに「休止」にしてください。";
    case "db_error":
      return "保存に失敗しました（DBエラー）。";
    default:
      return `エラーが発生しました（${code}）`;
  }
}

function successToMessage(code: string | undefined): string | null {
  if (!code) return null;
  switch (code) {
    case "created":
      return "クルーを登録しました。";
    case "updated":
      return "クルー情報を更新しました。";
    case "deactivated":
      return "クルーを休止に切り替えました。";
    case "reactivated":
      return "クルーを稼働中に戻しました。";
    case "deleted":
      return "クルーを削除しました。";
    default:
      return null;
  }
}
