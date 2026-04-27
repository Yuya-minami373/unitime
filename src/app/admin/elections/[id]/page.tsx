import { redirect, notFound } from "next/navigation";
import { revalidatePath } from "next/cache";
import { ArrowLeft, Calendar, MapPin, DollarSign, Users } from "lucide-react";
import Link from "next/link";
import { getCurrentUser, canManageMasters } from "@/lib/auth";
import { dbAll, dbGet, dbRun } from "@/lib/db";
import AppShell from "@/components/AppShell";
import { STATUS_OPTIONS } from "@/lib/elections";
import { RateRow, UnsetRoleRow } from "./RateRow";
import { StaffingGrid, type CellKey, type Station, type Role } from "./StaffingGrid";

const SHIFT_TIME: Record<"early" | "late" | "full", { start: string; end: string }> = {
  early: { start: "08:30", end: "14:30" },
  late: { start: "14:30", end: "20:00" },
  full: { start: "08:30", end: "20:00" },
};

function eachDateInclusive(start: string, end: string): string[] {
  const dates: string[] = [];
  const s = new Date(`${start}T00:00:00+09:00`);
  const e = new Date(`${end}T00:00:00+09:00`);
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime()) || s > e) return dates;
  const cur = new Date(s);
  while (cur <= e) {
    const y = cur.getUTCFullYear();
    const m = String(cur.getUTCMonth() + 1).padStart(2, "0");
    const d = String(cur.getUTCDate()).padStart(2, "0");
    dates.push(`${y}-${m}-${d}`);
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return dates;
}

type ElectionDetail = {
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
};

type RoleWithRate = {
  role_id: number;
  role_name: string;
  role_description: string | null;
  is_default: number;
  display_order: number;
  hourly_rate: number | null;
  notes: string | null;
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

async function upsertRate(formData: FormData) {
  "use server";
  const current = await getCurrentUser();
  if (!canManageMasters(current)) redirect("/admin");

  const election_id = Number(formData.get("election_id"));
  const role_id = Number(formData.get("role_id"));
  const hourly_rate = Number(formData.get("hourly_rate"));
  const notes = String(formData.get("notes") ?? "").trim() || null;

  if (!election_id || !role_id || !hourly_rate || hourly_rate < 0) {
    redirect(`/admin/elections/${election_id}?error=invalid_rate`);
  }

  // election_id と role_id 存在確認
  const [election, role] = await Promise.all([
    dbGet<{ id: number }>(`SELECT id FROM elections WHERE id = ?`, [election_id]),
    dbGet<{ id: number }>(`SELECT id FROM roles WHERE id = ?`, [role_id]),
  ]);
  if (!election || !role) {
    redirect(`/admin/elections/${election_id}?error=not_found`);
  }

  try {
    // INSERT OR REPLACE を使うと id が変わるので、UPSERT (ON CONFLICT) を使う
    await dbRun(
      `INSERT INTO election_role_rates (election_id, role_id, hourly_rate, notes)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(election_id, role_id) DO UPDATE SET
         hourly_rate = excluded.hourly_rate,
         notes = excluded.notes`,
      [election_id, role_id, hourly_rate, notes],
    );
  } catch (err) {
    console.error("[admin/elections/[id]] upsertRate failed:", err);
    const msg = err instanceof Error ? err.message : "unknown";
    redirect(
      `/admin/elections/${election_id}?error=db_error&detail=${encodeURIComponent(msg.slice(0, 200))}`,
    );
  }

  revalidatePath(`/admin/elections/${election_id}`);
  redirect(`/admin/elections/${election_id}?success=rate_saved`);
}

async function deleteRate(formData: FormData) {
  "use server";
  const current = await getCurrentUser();
  if (!canManageMasters(current)) redirect("/admin");

  const election_id = Number(formData.get("election_id"));
  const role_id = Number(formData.get("role_id"));
  if (!election_id || !role_id) redirect(`/admin/elections/${election_id}`);

  await dbRun(
    `DELETE FROM election_role_rates WHERE election_id = ? AND role_id = ?`,
    [election_id, role_id],
  );

  revalidatePath(`/admin/elections/${election_id}`);
  redirect(`/admin/elections/${election_id}?success=rate_deleted`);
}

async function saveStaffingRequirements(formData: FormData) {
  "use server";
  const current = await getCurrentUser();
  if (!canManageMasters(current)) redirect("/admin");

  const election_id = Number(formData.get("election_id"));
  if (!election_id) redirect(`/admin/elections/${election_id}?error=invalid_election`);

  const election = await dbGet<{
    id: number;
    municipality_id: number;
    prevoting_start_date: string | null;
    prevoting_end_date: string | null;
  }>(
    `SELECT id, municipality_id, prevoting_start_date, prevoting_end_date
     FROM elections WHERE id = ?`,
    [election_id],
  );
  if (!election) redirect(`/admin/elections/${election_id}?error=not_found`);
  if (!election.prevoting_start_date || !election.prevoting_end_date) {
    redirect(`/admin/elections/${election_id}?error=no_prevoting_period`);
  }

  const dates = eachDateInclusive(
    election.prevoting_start_date,
    election.prevoting_end_date,
  );
  if (dates.length === 0) {
    redirect(`/admin/elections/${election_id}?error=invalid_date_range`);
  }

  // セル抽出: name="cell_{stationId}_{roleId}_{shiftKey}" のものを全て読み取り
  const cells: Array<{
    stationId: number;
    roleId: number;
    shiftKey: "early" | "late" | "full";
    count: number;
  }> = [];

  for (const [name, value] of formData.entries()) {
    if (!name.startsWith("cell_")) continue;
    const parts = name.slice(5).split("_");
    if (parts.length !== 3) continue;
    const stationId = Number(parts[0]);
    const roleId = Number(parts[1]);
    const shiftKey = parts[2];
    if (!stationId || !roleId) continue;
    if (shiftKey !== "early" && shiftKey !== "late" && shiftKey !== "full") continue;
    const raw = String(value ?? "").trim();
    const count = raw === "" ? 0 : Math.max(0, Math.floor(Number(raw)));
    if (Number.isNaN(count)) continue;
    cells.push({ stationId, roleId, shiftKey, count });
  }

  // 投票所・役割の整合性チェック（DB側でFKもあるが軽く先行チェック）
  const validStationIds = new Set(
    (
      await dbAll<{ id: number }>(
        `SELECT id FROM polling_stations WHERE municipality_id = ? AND is_active = 1`,
        [election.municipality_id],
      )
    ).map((r) => r.id),
  );
  const validRoleIds = new Set(
    (await dbAll<{ id: number }>(`SELECT id FROM roles`, [])).map((r) => r.id),
  );

  try {
    for (const cell of cells) {
      if (!validStationIds.has(cell.stationId)) continue;
      if (!validRoleIds.has(cell.roleId)) continue;
      const time = SHIFT_TIME[cell.shiftKey];
      for (const date of dates) {
        if (cell.count === 0) {
          await dbRun(
            `DELETE FROM election_staffing_requirements
             WHERE election_id = ? AND polling_station_id = ?
               AND date = ? AND phase = 'prevoting'
               AND shift_type = ? AND role_id = ?`,
            [election_id, cell.stationId, date, cell.shiftKey, cell.roleId],
          );
        } else {
          await dbRun(
            `INSERT INTO election_staffing_requirements
               (election_id, polling_station_id, date, phase, shift_type, role_id,
                required_count, scheduled_start, scheduled_end)
             VALUES (?, ?, ?, 'prevoting', ?, ?, ?, ?, ?)
             ON CONFLICT(election_id, polling_station_id, date, phase, shift_type, role_id)
             DO UPDATE SET
               required_count = excluded.required_count,
               scheduled_start = excluded.scheduled_start,
               scheduled_end = excluded.scheduled_end`,
            [
              election_id,
              cell.stationId,
              date,
              cell.shiftKey,
              cell.roleId,
              cell.count,
              time.start,
              time.end,
            ],
          );
        }
      }
    }
  } catch (err) {
    console.error("[admin/elections/[id]] saveStaffingRequirements failed:", err);
    const msg = err instanceof Error ? err.message : "unknown";
    redirect(
      `/admin/elections/${election_id}?error=db_error&detail=${encodeURIComponent(msg.slice(0, 200))}`,
    );
  }

  revalidatePath(`/admin/elections/${election_id}`);
  redirect(`/admin/elections/${election_id}?success=staffing_saved`);
}

export default async function ElectionDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; success?: string; detail?: string }>;
}) {
  const current = await getCurrentUser();
  if (!current) redirect("/login");
  if (!canManageMasters(current)) redirect("/admin");

  const { id } = await params;
  const electionId = Number(id);
  if (!electionId) notFound();

  const sp = await searchParams;

  const election = await dbGet<ElectionDetail>(
    `SELECT
       e.id, e.municipality_id, e.name, e.election_date,
       e.prevoting_start_date, e.prevoting_end_date, e.status, e.notes,
       m.name as municipality_name, m.prefecture
     FROM elections e
     INNER JOIN municipalities m ON m.id = e.municipality_id
     WHERE e.id = ?`,
    [electionId],
  );
  if (!election) notFound();

  // 全役割 LEFT JOIN 既存時給設定
  const rolesWithRates = await dbAll<RoleWithRate>(
    `SELECT
       r.id as role_id, r.name as role_name, r.description as role_description,
       r.is_default, r.display_order,
       err.hourly_rate, err.notes
     FROM roles r
     LEFT JOIN election_role_rates err
       ON err.role_id = r.id AND err.election_id = ?
     ORDER BY r.display_order, r.id`,
    [electionId],
  );

  // 必要人数定義に必要なデータ
  const stationsRaw = await dbAll<Station>(
    `SELECT id, name FROM polling_stations
     WHERE municipality_id = ? AND is_active = 1
     ORDER BY name`,
    [election.municipality_id],
  );
  const rolesRaw = await dbAll<Role>(
    `SELECT id, name, is_default FROM roles
     ORDER BY display_order, id`,
    [],
  );
  const existingStaffing = await dbAll<{
    polling_station_id: number;
    role_id: number;
    shift_type: string;
    required_count: number;
  }>(
    `SELECT polling_station_id, role_id, shift_type, MAX(required_count) as required_count
     FROM election_staffing_requirements
     WHERE election_id = ? AND phase = 'prevoting'
     GROUP BY polling_station_id, role_id, shift_type`,
    [electionId],
  );
  const initialCounts = {} as Record<CellKey, number>;
  for (const row of existingStaffing) {
    if (
      row.shift_type !== "early" &&
      row.shift_type !== "late" &&
      row.shift_type !== "full"
    )
      continue;
    const key: CellKey = `${row.polling_station_id}_${row.role_id}_${row.shift_type}`;
    initialCounts[key] = row.required_count;
  }

  const errorMessage = errorToMessage(sp.error, sp.detail);
  const successMessage = successToMessage(sp.success);

  const setCount = rolesWithRates.filter((r) => r.hourly_rate !== null).length;
  const hasPrevotingPeriod = Boolean(
    election.prevoting_start_date && election.prevoting_end_date,
  );
  const staffingSetCount = existingStaffing.reduce(
    (acc, r) => acc + (r.required_count > 0 ? 1 : 0),
    0,
  );
  const staffingDayCount = hasPrevotingPeriod
    ? eachDateInclusive(
        election.prevoting_start_date as string,
        election.prevoting_end_date as string,
      ).length
    : 0;

  return (
    <AppShell user={{ name: current.name, role: current.role, employment: current.employment_type }}>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-1">
          <Link
            href="/admin/elections"
            className="flex items-center gap-1 text-[12px] text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
          >
            <ArrowLeft size={12} />
            案件一覧に戻る
          </Link>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <span
              className={`rounded-[4px] border px-1.5 py-0.5 text-[10px] font-medium ${STATUS_BADGE[election.status] ?? ""}`}
            >
              {STATUS_LABEL[election.status] ?? election.status}
            </span>
            <h1 className="text-[20px] font-semibold tracking-tight md:text-[22px]">
              {election.name}
            </h1>
          </div>
        </div>
        <Link
          href={`/admin/elections?editId=${election.id}#edit-form`}
          className="u-btn u-btn-secondary"
        >
          案件情報を編集
        </Link>
      </div>

      {/* Summary card */}
      <div className="u-card mb-6 p-5">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <SummaryItem icon={MapPin} label="自治体">
            {election.prefecture && (
              <span className="text-[11px] text-[var(--text-tertiary)]">
                {election.prefecture} ・{" "}
              </span>
            )}
            {election.municipality_name}
          </SummaryItem>
          <SummaryItem icon={Calendar} label="投開票日">
            <span className="tabular-nums">{election.election_date}</span>
          </SummaryItem>
          <SummaryItem icon={Calendar} label="期日前投票">
            {election.prevoting_start_date && election.prevoting_end_date ? (
              <span className="tabular-nums">
                {election.prevoting_start_date} 〜 {election.prevoting_end_date}
              </span>
            ) : (
              <span className="text-[var(--text-quaternary)]">未設定</span>
            )}
          </SummaryItem>
        </div>
        {election.notes && (
          <div className="mt-4 border-t border-[var(--border-light)] pt-3 text-[12px] text-[var(--text-secondary)]">
            <span className="text-[var(--text-tertiary)]">備考: </span>
            {election.notes}
          </div>
        )}
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

      {/* Hourly rates section */}
      <section className="u-card mb-6 overflow-hidden">
        <header className="flex items-center justify-between gap-3 border-b border-[var(--border-light)] bg-[var(--brand-50)] px-4 py-3">
          <div className="flex items-center gap-2">
            <DollarSign size={16} strokeWidth={1.75} className="text-[var(--brand-primary)]" />
            <h2 className="text-[14px] font-semibold tracking-tight">役割別 標準時給</h2>
          </div>
          <span className="text-[11px] text-[var(--text-tertiary)] tabular-nums">
            {setCount} / {rolesWithRates.length} 役割を設定済
          </span>
        </header>
        <ul className="divide-y divide-[var(--border-light)]">
          {rolesWithRates.map((r) =>
            r.hourly_rate !== null ? (
              <RateRow
                key={r.role_id}
                electionId={election.id}
                roleId={r.role_id}
                roleName={r.role_name}
                roleDescription={r.role_description}
                isDefault={r.is_default}
                hourlyRate={r.hourly_rate}
                notes={r.notes}
                upsertAction={upsertRate}
                deleteAction={deleteRate}
              />
            ) : (
              <UnsetRoleRow
                key={r.role_id}
                electionId={election.id}
                roleId={r.role_id}
                roleName={r.role_name}
                roleDescription={r.role_description}
                isDefault={r.is_default}
                upsertAction={upsertRate}
              />
            ),
          )}
        </ul>
        <div className="border-t border-[var(--border-light)] bg-[var(--bg-body)] px-4 py-2.5 text-[11px] text-[var(--text-tertiary)]">
          ※ ここで設定した時給が、シフト実績に基づく稼働コスト集計（S8）の単価になります。
        </div>
      </section>

      {/* Staffing requirements section (期日前のみ・Phase 3a) */}
      <section className="u-card overflow-hidden">
        <header className="flex items-center justify-between gap-3 border-b border-[var(--border-light)] bg-[var(--brand-50)] px-4 py-3">
          <div className="flex items-center gap-2">
            <Users size={16} strokeWidth={1.75} className="text-[var(--brand-primary)]" />
            <h2 className="text-[14px] font-semibold tracking-tight">
              必要人数定義（期日前投票）
            </h2>
          </div>
          {hasPrevotingPeriod && stationsRaw.length > 0 && (
            <span className="text-[11px] text-[var(--text-tertiary)] tabular-nums">
              {staffingSetCount} セル設定済 ・ 全{staffingDayCount}日に適用
            </span>
          )}
        </header>

        {!hasPrevotingPeriod ? (
          <div className="px-4 py-10 text-center text-[13px] text-[var(--text-tertiary)]">
            期日前投票期間が未設定です。
            <br />
            「案件情報を編集」から開始日・終了日を設定してください。
          </div>
        ) : stationsRaw.length === 0 ? (
          <div className="px-4 py-10 text-center text-[13px] text-[var(--text-tertiary)]">
            この自治体に投票所が登録されていません。
            <br />
            <Link
              href={`/admin/polling-stations?filterMuni=${election.municipality_id}`}
              className="text-[var(--brand-accent)] hover:underline"
            >
              投票所マスタ
            </Link>
            から登録してください。
          </div>
        ) : (
          <StaffingGrid
            electionId={election.id}
            stations={stationsRaw}
            roles={rolesRaw}
            initialCounts={initialCounts}
            prevotingStart={election.prevoting_start_date as string}
            prevotingEnd={election.prevoting_end_date as string}
            saveAction={saveStaffingRequirements}
          />
        )}
      </section>
    </AppShell>
  );
}

function SummaryItem({
  icon: Icon,
  label,
  children,
}: {
  icon: typeof MapPin;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-2.5">
      <Icon size={16} strokeWidth={1.75} className="mt-0.5 text-[var(--brand-primary)]/70" />
      <div className="flex min-w-0 flex-col">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-tertiary)]">
          {label}
        </span>
        <span className="text-[13px] text-[var(--text-primary)]">{children}</span>
      </div>
    </div>
  );
}

function errorToMessage(code: string | undefined, detail: string | undefined): string | null {
  if (!code) return null;
  switch (code) {
    case "invalid_rate":
      return "時給は0以上の数値を入力してください。";
    case "not_found":
      return "案件または役割が見つかりません。";
    case "invalid_election":
      return "案件IDが不正です。";
    case "no_prevoting_period":
      return "期日前投票期間が未設定です。先に案件情報を編集してください。";
    case "invalid_date_range":
      return "期日前投票期間の日付範囲が不正です。";
    case "db_error":
      return `保存に失敗しました: ${detail ?? "DBエラー"}`;
    default:
      return `エラーが発生しました（${code}）`;
  }
}

function successToMessage(code: string | undefined): string | null {
  if (!code) return null;
  switch (code) {
    case "rate_saved":
      return "時給を保存しました。";
    case "rate_deleted":
      return "時給設定を削除しました。";
    case "staffing_saved":
      return "必要人数を保存しました。";
    default:
      return null;
  }
}
