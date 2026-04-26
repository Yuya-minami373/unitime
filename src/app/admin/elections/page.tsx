import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { Plus, ArrowLeft, Pencil, Trash2, X, CalendarCheck } from "lucide-react";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { dbAll, dbRun, dbGet } from "@/lib/db";
import AppShell from "@/components/AppShell";
import { ConfirmForm } from "./ElectionActions";
import { ElectionForm } from "./ElectionForm";
import { STATUS_OPTIONS } from "@/lib/elections";

type Municipality = {
  id: number;
  name: string;
  prefecture: string | null;
};

type Election = {
  id: number;
  municipality_id: number;
  municipality_name: string;
  prefecture: string | null;
  name: string;
  election_date: string;
  prevoting_start_date: string | null;
  prevoting_end_date: string | null;
  status: string;
  notes: string | null;
  rate_count: number;
  staffing_count: number;
  shift_count: number;
  preference_count: number;
};

const STATUS_LABEL: Record<string, string> = Object.fromEntries(
  STATUS_OPTIONS.map((s) => [s.value, s.label]),
);

const STATUS_BADGE: Record<string, string> = {
  planning: "border-slate-200 bg-slate-50 text-slate-700",
  recruiting: "border-amber-200 bg-amber-50 text-amber-800",
  in_progress: "border-emerald-200 bg-emerald-50 text-emerald-800",
  completed: "border-blue-200 bg-blue-50 text-blue-800",
  cancelled: "border-rose-200 bg-rose-50 text-rose-800",
};

function validateDates(
  electionDate: string,
  prevotingStart: string | null,
  prevotingEnd: string | null,
): string | null {
  if (!electionDate) return null;
  if (prevotingStart && prevotingEnd && prevotingStart > prevotingEnd) {
    return "prevoting_order";
  }
  if (prevotingEnd && prevotingEnd > electionDate) {
    return "prevoting_after_election";
  }
  return null;
}

async function createElection(formData: FormData) {
  "use server";
  const current = await getCurrentUser();
  if (!current || current.employment_type !== "employee") redirect("/admin");

  const municipality_id = Number(formData.get("municipality_id"));
  const name = String(formData.get("name") ?? "").trim();
  const election_date = String(formData.get("election_date") ?? "").trim();
  const prevoting_start_date = String(formData.get("prevoting_start_date") ?? "").trim() || null;
  const prevoting_end_date = String(formData.get("prevoting_end_date") ?? "").trim() || null;
  const status = String(formData.get("status") ?? "planning");
  const notes = String(formData.get("notes") ?? "").trim() || null;

  if (!municipality_id || !name || !election_date) {
    redirect("/admin/elections?error=required");
  }
  if (!STATUS_LABEL[status]) {
    redirect("/admin/elections?error=invalid_status");
  }
  const dateErr = validateDates(election_date, prevoting_start_date, prevoting_end_date);
  if (dateErr) redirect(`/admin/elections?error=${dateErr}`);

  const muni = await dbGet<{ id: number }>(
    `SELECT id FROM municipalities WHERE id = ?`,
    [municipality_id],
  );
  if (!muni) redirect("/admin/elections?error=invalid_municipality");

  try {
    await dbRun(
      `INSERT INTO elections
       (municipality_id, name, election_date, prevoting_start_date, prevoting_end_date, status, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [municipality_id, name, election_date, prevoting_start_date, prevoting_end_date, status, notes],
    );
  } catch (err) {
    console.error("[admin/elections] create failed:", err);
    const msg = err instanceof Error ? err.message : "unknown";
    redirect(
      `/admin/elections?error=db_error&detail=${encodeURIComponent(msg.slice(0, 200))}`,
    );
  }

  revalidatePath("/admin/elections");
  redirect("/admin/elections?success=created");
}

async function updateElection(formData: FormData) {
  "use server";
  const current = await getCurrentUser();
  if (!current || current.employment_type !== "employee") redirect("/admin");

  const id = Number(formData.get("id"));
  const municipality_id = Number(formData.get("municipality_id"));
  const name = String(formData.get("name") ?? "").trim();
  const election_date = String(formData.get("election_date") ?? "").trim();
  const prevoting_start_date = String(formData.get("prevoting_start_date") ?? "").trim() || null;
  const prevoting_end_date = String(formData.get("prevoting_end_date") ?? "").trim() || null;
  const status = String(formData.get("status") ?? "planning");
  const notes = String(formData.get("notes") ?? "").trim() || null;

  if (!id || !municipality_id || !name || !election_date) {
    redirect(`/admin/elections?error=required&editId=${id}`);
  }
  if (!STATUS_LABEL[status]) {
    redirect(`/admin/elections?error=invalid_status&editId=${id}`);
  }
  const dateErr = validateDates(election_date, prevoting_start_date, prevoting_end_date);
  if (dateErr) redirect(`/admin/elections?error=${dateErr}&editId=${id}`);

  const muni = await dbGet<{ id: number }>(
    `SELECT id FROM municipalities WHERE id = ?`,
    [municipality_id],
  );
  if (!muni) redirect(`/admin/elections?error=invalid_municipality&editId=${id}`);

  try {
    await dbRun(
      `UPDATE elections
       SET municipality_id = ?, name = ?, election_date = ?,
           prevoting_start_date = ?, prevoting_end_date = ?, status = ?, notes = ?,
           updated_at = datetime('now', '+9 hours')
       WHERE id = ?`,
      [
        municipality_id,
        name,
        election_date,
        prevoting_start_date,
        prevoting_end_date,
        status,
        notes,
        id,
      ],
    );
  } catch (err) {
    console.error("[admin/elections] update failed:", err);
    const msg = err instanceof Error ? err.message : "unknown";
    redirect(
      `/admin/elections?error=db_error&detail=${encodeURIComponent(msg.slice(0, 200))}&editId=${id}`,
    );
  }

  revalidatePath("/admin/elections");
  redirect("/admin/elections?success=updated");
}

async function deleteElection(formData: FormData) {
  "use server";
  const current = await getCurrentUser();
  if (!current || current.employment_type !== "employee") redirect("/admin");

  const id = Number(formData.get("id"));
  if (!id) redirect("/admin/elections");

  const usage = await dbGet<{
    rates: number;
    staffing: number;
    shifts: number;
    prefs: number;
  }>(
    `SELECT
       (SELECT COUNT(*) FROM election_role_rates WHERE election_id = ?) as rates,
       (SELECT COUNT(*) FROM election_staffing_requirements WHERE election_id = ?) as staffing,
       (SELECT COUNT(*) FROM crew_shifts WHERE election_id = ?) as shifts,
       (SELECT COUNT(*) FROM shift_preferences WHERE election_id = ?) as prefs`,
    [id, id, id, id],
  );

  if (
    usage &&
    (usage.rates > 0 || usage.staffing > 0 || usage.shifts > 0 || usage.prefs > 0)
  ) {
    redirect(
      `/admin/elections?error=has_relations&rates=${usage.rates}&staffing=${usage.staffing}&shifts=${usage.shifts}&prefs=${usage.prefs}`,
    );
  }

  await dbRun(`DELETE FROM elections WHERE id = ?`, [id]);
  revalidatePath("/admin/elections");
  redirect("/admin/elections?success=deleted");
}

export default async function ElectionsPage({
  searchParams,
}: {
  searchParams: Promise<{
    error?: string;
    success?: string;
    detail?: string;
    editId?: string;
    rates?: string;
    staffing?: string;
    shifts?: string;
    prefs?: string;
    filterStatus?: string;
  }>;
}) {
  const current = await getCurrentUser();
  if (!current) redirect("/login");
  if (current.employment_type !== "employee") redirect("/admin");

  const sp = await searchParams;
  const editId = sp.editId ? Number(sp.editId) : null;
  const filterStatus = sp.filterStatus && STATUS_LABEL[sp.filterStatus] ? sp.filterStatus : null;

  const municipalities = await dbAll<Municipality>(
    `SELECT id, name, prefecture FROM municipalities ORDER BY prefecture, name`,
  );

  const elections = await dbAll<Election>(
    `SELECT
       e.id, e.municipality_id, e.name, e.election_date,
       e.prevoting_start_date, e.prevoting_end_date, e.status, e.notes,
       m.name as municipality_name, m.prefecture,
       (SELECT COUNT(*) FROM election_role_rates WHERE election_id = e.id) as rate_count,
       (SELECT COUNT(*) FROM election_staffing_requirements WHERE election_id = e.id) as staffing_count,
       (SELECT COUNT(*) FROM crew_shifts WHERE election_id = e.id) as shift_count,
       (SELECT COUNT(*) FROM shift_preferences WHERE election_id = e.id) as preference_count
     FROM elections e
     INNER JOIN municipalities m ON m.id = e.municipality_id
     ${filterStatus ? `WHERE e.status = ?` : ``}
     ORDER BY e.election_date DESC, e.id DESC`,
    filterStatus ? [filterStatus] : [],
  );

  const editTarget =
    editId !== null ? elections.find((e) => e.id === editId) ?? null : null;

  const errorMessage = errorToMessage(sp.error, sp.detail, sp);
  const successMessage = successToMessage(sp.success);

  return (
    <AppShell user={{ name: current.name, role: current.role, employment: current.employment_type }}>
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight md:text-[24px]">
            案件マスタ
          </h1>
          <p className="mt-1.5 text-[13px] text-[var(--text-tertiary)]">
            選挙案件（投開票日・期日前期間・ステータス）の登録と管理
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

      {/* Status filter */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <span className="text-[12px] font-medium text-[var(--text-tertiary)]">
          ステータスで絞り込み:
        </span>
        <Link
          href="/admin/elections"
          className={`rounded-[6px] border px-2.5 py-1 text-[11px] transition-colors ${
            !filterStatus
              ? "border-[var(--brand-primary)] bg-[var(--brand-primary)] text-white"
              : "border-[var(--border-light)] bg-white text-[var(--text-secondary)] hover:border-[var(--brand-accent)]"
          }`}
        >
          すべて
        </Link>
        {STATUS_OPTIONS.map((s) => (
          <Link
            key={s.value}
            href={`/admin/elections?filterStatus=${s.value}`}
            className={`rounded-[6px] border px-2.5 py-1 text-[11px] transition-colors ${
              filterStatus === s.value
                ? "border-[var(--brand-primary)] bg-[var(--brand-primary)] text-white"
                : "border-[var(--border-light)] bg-white text-[var(--text-secondary)] hover:border-[var(--brand-accent)]"
            }`}
          >
            {s.label}
          </Link>
        ))}
      </div>

      {/* List */}
      <div className="u-card mb-8 overflow-hidden">
        {elections.length === 0 ? (
          <div className="px-6 py-10 text-center text-[13px] text-[var(--text-tertiary)]">
            {filterStatus
              ? "このステータスの案件はありません。"
              : "案件がまだ登録されていません。下のフォームから登録してください。"}
          </div>
        ) : (
          <>
            {/* Mobile cards */}
            <ul className="divide-y divide-[var(--border-light)] md:hidden">
              {elections.map((e) => (
                <li key={e.id} className="px-4 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 flex-col gap-1.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`rounded-[4px] border px-1.5 py-0.5 text-[10px] font-medium ${STATUS_BADGE[e.status] ?? ""}`}
                        >
                          {STATUS_LABEL[e.status] ?? e.status}
                        </span>
                        <Link
                          href={`/admin/elections/${e.id}`}
                          className="text-[14px] font-semibold text-[var(--text-primary)] hover:text-[var(--brand-accent)]"
                        >
                          {e.name}
                        </Link>
                      </div>
                      <div className="text-[11px] text-[var(--text-tertiary)]">
                        {e.prefecture && `${e.prefecture} ・ `}
                        {e.municipality_name}
                      </div>
                      <div className="text-[11px] tabular-nums text-[var(--text-secondary)]">
                        投開票 {e.election_date}
                        {e.prevoting_start_date && e.prevoting_end_date && (
                          <span className="ml-2">
                            （期日前 {e.prevoting_start_date}〜{e.prevoting_end_date}）
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-[var(--text-tertiary)] tabular-nums">
                        時給{e.rate_count} / 人数定義{e.staffing_count} / シフト{e.shift_count} / 希望{e.preference_count}
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-2">
                      <Link
                        href={`/admin/elections?editId=${e.id}#edit-form`}
                        className="text-[11px] font-medium text-[var(--brand-accent)] hover:text-[var(--brand-primary)]"
                      >
                        <Pencil size={12} className="inline" /> 編集
                      </Link>
                      {e.rate_count === 0 &&
                        e.staffing_count === 0 &&
                        e.shift_count === 0 &&
                        e.preference_count === 0 && (
                          <ConfirmForm
                            action={deleteElection}
                            confirmMessage={`${e.name} を削除します。よろしいですか？`}
                          >
                            <input type="hidden" name="id" value={e.id} />
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
                    <Th>状態</Th>
                    <Th>案件名</Th>
                    <Th>自治体</Th>
                    <Th>投開票日</Th>
                    <Th>期日前期間</Th>
                    <Th className="text-right">設定状況</Th>
                    <Th></Th>
                  </tr>
                </thead>
                <tbody>
                  {elections.map((e) => (
                    <tr
                      key={e.id}
                      className="border-b border-[var(--border-light)] last:border-0 hover:bg-[var(--bg-body)]"
                    >
                      <td className="px-4 py-3">
                        <span
                          className={`rounded-[4px] border px-1.5 py-0.5 text-[10px] font-medium ${STATUS_BADGE[e.status] ?? ""}`}
                        >
                          {STATUS_LABEL[e.status] ?? e.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-semibold text-[var(--text-primary)]">
                        <Link
                          href={`/admin/elections/${e.id}`}
                          className="hover:text-[var(--brand-accent)] hover:underline"
                        >
                          {e.name}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-[12px] text-[var(--text-secondary)]">
                        {e.prefecture && (
                          <span className="text-[10px] text-[var(--text-tertiary)]">
                            {e.prefecture} ・{" "}
                          </span>
                        )}
                        {e.municipality_name}
                      </td>
                      <td className="px-4 py-3 tabular-nums text-[12px] text-[var(--text-secondary)]">
                        {e.election_date}
                      </td>
                      <td className="px-4 py-3 tabular-nums text-[11px] text-[var(--text-tertiary)]">
                        {e.prevoting_start_date && e.prevoting_end_date ? (
                          <>
                            {e.prevoting_start_date}
                            <br />
                            〜{e.prevoting_end_date}
                          </>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="px-4 py-3 text-right text-[11px] tabular-nums text-[var(--text-tertiary)]">
                        時給{e.rate_count}
                        <br />
                        人数定義{e.staffing_count}
                        <br />
                        シフト{e.shift_count} / 希望{e.preference_count}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-3">
                          <Link
                            href={`/admin/elections?editId=${e.id}#edit-form`}
                            className="text-[12px] font-medium text-[var(--brand-accent)] hover:text-[var(--brand-primary)]"
                          >
                            <Pencil size={12} className="inline" /> 編集
                          </Link>
                          {e.rate_count === 0 &&
                            e.staffing_count === 0 &&
                            e.shift_count === 0 &&
                            e.preference_count === 0 && (
                              <ConfirmForm
                                action={deleteElection}
                                confirmMessage={`${e.name} を削除します。よろしいですか？`}
                              >
                                <input type="hidden" name="id" value={e.id} />
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
              <CalendarCheck size={16} strokeWidth={1.75} className="text-[var(--text-secondary)]" />
            )}
            <h2 className="text-[14px] font-semibold tracking-tight">
              {editTarget ? `${editTarget.name} を編集` : "新規案件登録"}
            </h2>
          </div>
          {editTarget && (
            <Link
              href="/admin/elections"
              className="flex items-center gap-1 text-[12px] text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
            >
              <X size={12} /> 編集をキャンセル
            </Link>
          )}
        </div>
        <ElectionForm
          action={editTarget ? updateElection : createElection}
          isEdit={!!editTarget}
          municipalities={municipalities}
          defaultId={editTarget?.id}
          defaultMunicipalityId={editTarget?.municipality_id}
          defaultName={editTarget?.name}
          defaultElectionDate={editTarget?.election_date}
          defaultPrevotingStartDate={editTarget?.prevoting_start_date}
          defaultPrevotingEndDate={editTarget?.prevoting_end_date}
          defaultStatus={editTarget?.status}
          defaultNotes={editTarget?.notes ?? undefined}
        />
      </div>
    </AppShell>
  );
}

function errorToMessage(
  code: string | undefined,
  detail: string | undefined,
  sp: { rates?: string; staffing?: string; shifts?: string; prefs?: string },
): string | null {
  if (!code) return null;
  switch (code) {
    case "required":
      return "自治体・案件名・投開票日は必須項目です。";
    case "invalid_status":
      return "ステータスが不正です。";
    case "invalid_municipality":
      return "選択した自治体が見つかりません。再選択してください。";
    case "prevoting_order":
      return "期日前投票の開始日が終了日より後になっています。";
    case "prevoting_after_election":
      return "期日前投票の終了日は投開票日以前に設定してください。";
    case "has_relations":
      return `この案件には時給${sp.rates ?? 0}/必要人数${sp.staffing ?? 0}/シフト${sp.shifts ?? 0}/希望${sp.prefs ?? 0}件が紐付いているため削除できません。先にステータスを「中止」にする運用を推奨。`;
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
      return "案件を登録しました。次に「役割別時給」「必要人数」を設定してください（S2.5で詳細ページ実装予定）。";
    case "updated":
      return "変更を保存しました。";
    case "deleted":
      return "案件を削除しました。";
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
