"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getCurrentUser, canManageMasters } from "@/lib/auth";
import { dbRun, dbGet } from "@/lib/db";
import { nowJST } from "@/lib/time";
import {
  type DurationType,
  type LeaveType,
  LEAVE_TYPES,
  DURATION_TYPES,
  hoursFromTimeRange,
} from "@/lib/leaves";

const VALID_LEAVE_TYPES = LEAVE_TYPES.map((t) => t.value);
const VALID_DURATION_TYPES = DURATION_TYPES.map((t) => t.value);

const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

// start_date 〜 end_date の暦日配列（JST基準）
function enumerateDatesJST(start: string, end: string): string[] {
  const startMs = Date.parse(`${start}T00:00:00+09:00`);
  const endMs = Date.parse(`${end}T00:00:00+09:00`);
  if (Number.isNaN(startMs) || Number.isNaN(endMs) || endMs < startMs) return [];
  const result: string[] = [];
  for (let ms = startMs; ms <= endMs; ms += 86400000) {
    const d = new Date(ms + JST_OFFSET_MS);
    result.push(
      `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`,
    );
  }
  return result;
}

// 1日あたり控除分（実労働分・休憩控除済み）
// 全休=420（所定実働7h）
// 時間休=hours_used*60（hours_used は既に hoursFromTimeRange で休憩控除済み）
// 過去データ互換: half_am/half_pm=210（所定の半分）
function leaveMinutesPerDay(
  duration_type: string,
  hours_used: number | null,
): number {
  if (duration_type === "half_am" || duration_type === "half_pm") return 210;
  if (duration_type === "hourly")
    return Math.max(0, Math.round((hours_used ?? 0) * 60));
  return 420;
}

// 承認された申請から attendance_records へ leave 行を作成
// punched_at = 業務日 04:00 JST にすることで businessDayFromIso() で正しくマップされる
async function syncAttendanceLeaveRows(leaveRequestId: number): Promise<void> {
  const req = await dbGet<{
    id: number;
    user_id: number;
    start_date: string;
    end_date: string;
    duration_type: string;
    hours_used: number | null;
  }>(
    `SELECT id, user_id, start_date, end_date, duration_type, hours_used
     FROM leave_requests WHERE id = ?`,
    [leaveRequestId],
  );
  if (!req) return;

  const dates = enumerateDatesJST(req.start_date, req.end_date);
  const minutes = leaveMinutesPerDay(req.duration_type, req.hours_used);

  for (const date of dates) {
    const punchedAt = `${date}T04:00:00.000+09:00`;
    // UNIQUE (leave_request_id, punched_at) により重複INSERTは無視される
    await dbRun(
      `INSERT OR IGNORE INTO attendance_records
         (user_id, punch_type, punched_at, kind, leave_minutes, leave_request_id)
       VALUES (?, 'leave', ?, 'leave', ?, ?)`,
      [req.user_id, punchedAt, minutes, leaveRequestId],
    );
  }
}

async function deleteAttendanceLeaveRows(leaveRequestId: number): Promise<void> {
  await dbRun(
    `DELETE FROM attendance_records WHERE leave_request_id = ?`,
    [leaveRequestId],
  );
}

export async function createLeaveRequest(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.employment_type === "crew") redirect("/");

  const leave_type = String(formData.get("leave_type") ?? "");
  const duration_type = String(formData.get("duration_type") ?? "");
  const start_date = String(formData.get("start_date") ?? "").trim();
  const end_date = String(formData.get("end_date") ?? "").trim() || start_date;
  const start_time = String(formData.get("start_time") ?? "").trim() || null;
  const end_time = String(formData.get("end_time") ?? "").trim() || null;
  const reason = String(formData.get("reason") ?? "").trim() || null;
  const special_policy_code =
    String(formData.get("special_policy_code") ?? "").trim() || null;

  if (!VALID_LEAVE_TYPES.includes(leave_type as LeaveType)) {
    redirect("/requests?tab=leave&error=invalid_type");
  }
  if (!VALID_DURATION_TYPES.includes(duration_type as DurationType)) {
    redirect("/requests?tab=leave&error=invalid_duration");
  }
  if (!start_date) redirect("/requests?tab=leave&error=date_required");

  // 時間休: 開始/終了時刻必須・end > start・hours_used を自動算出
  let hours_used: number | null = null;
  if (duration_type === "hourly") {
    if (!start_time || !end_time) {
      redirect("/requests?tab=leave&error=time_required");
    }
    const computed = hoursFromTimeRange(start_time, end_time);
    if (computed <= 0) {
      redirect("/requests?tab=leave&error=time_invalid");
    }
    hours_used = computed;
    // 時間休は単日のみ
    if (end_date !== start_date) {
      redirect("/requests?tab=leave&error=single_day_only");
    }
  }

  if (leave_type === "special" && !special_policy_code) {
    redirect("/requests?tab=leave&error=policy_required");
  }

  try {
    const result = await dbRun(
      `INSERT INTO leave_requests
         (user_id, leave_type, special_policy_code, start_date, end_date,
          duration_type, hours_used, start_time, end_time,
          reason, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)`,
      [
        user.id,
        leave_type,
        leave_type === "special" ? special_policy_code : null,
        start_date,
        end_date,
        duration_type,
        hours_used,
        duration_type === "hourly" ? start_time : null,
        duration_type === "hourly" ? end_time : null,
        reason,
        nowJST(),
        nowJST(),
      ],
    );
    revalidatePath("/requests");
    revalidatePath("/admin/requests");
    redirect(`/requests?tab=leave&new=${result.lastInsertRowid}`);
  } catch (err) {
    if (err instanceof Error && err.message.includes("NEXT_REDIRECT")) throw err;
    console.error("[requests] createLeaveRequest failed:", err);
    redirect("/requests?tab=leave&error=db_error");
  }
}

export async function approveLeaveRequest(formData: FormData) {
  const current = await getCurrentUser();
  if (!canManageMasters(current)) redirect("/admin");

  const id = Number(formData.get("id"));
  if (!id) redirect("/admin/requests?tab=leave&error=invalid_id");

  const result = await dbRun(
    `UPDATE leave_requests
     SET status = 'approved', approver_id = ?, approved_at = ?, updated_at = ?
     WHERE id = ? AND status = 'pending'`,
    [current!.id, nowJST(), nowJST(), id],
  );
  // 承認が成功した場合のみ attendance に反映
  if (result.rowsAffected > 0) {
    await syncAttendanceLeaveRows(id);
  }

  revalidatePath("/admin/requests");
  revalidatePath("/requests");
  revalidatePath("/history");
  revalidatePath("/");
  redirect("/admin/requests?tab=leave&success=approved");
}

export async function rejectLeaveRequest(formData: FormData) {
  const current = await getCurrentUser();
  if (!canManageMasters(current)) redirect("/admin");

  const id = Number(formData.get("id"));
  if (!id) redirect("/admin/requests?tab=leave&error=invalid_id");
  const reason = String(formData.get("rejection_reason") ?? "").trim() || null;

  await dbRun(
    `UPDATE leave_requests
     SET status = 'rejected', approver_id = ?, approved_at = ?,
         rejection_reason = ?, updated_at = ?
     WHERE id = ? AND status = 'pending'`,
    [current!.id, nowJST(), reason, nowJST(), id],
  );
  // pending→rejected なので元々attendanceには無いが、念のため掃除
  await deleteAttendanceLeaveRows(id);

  revalidatePath("/admin/requests");
  revalidatePath("/requests");
  redirect("/admin/requests?tab=leave&success=rejected");
}

export async function cancelLeaveRequest(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const id = Number(formData.get("id"));
  if (!id) redirect("/requests?tab=leave&error=invalid_id");

  // 自分の申請のみ取消可能。pending または approved を対象（承認後の取消も許容）
  const target = await dbGet<{ id: number; user_id: number; status: string }>(
    `SELECT id, user_id, status FROM leave_requests WHERE id = ?`,
    [id],
  );
  if (!target || target.user_id !== user.id) {
    redirect("/requests?tab=leave&error=not_found");
  }
  if (target.status !== "pending" && target.status !== "approved") {
    redirect("/requests?tab=leave&error=cannot_cancel");
  }

  await dbRun(
    `UPDATE leave_requests SET status = 'cancelled', updated_at = ? WHERE id = ?`,
    [nowJST(), id],
  );
  // 承認済みからの取消なら attendance も削除
  await deleteAttendanceLeaveRows(id);

  revalidatePath("/requests");
  revalidatePath("/admin/requests");
  revalidatePath("/history");
  revalidatePath("/");
  redirect("/requests?tab=leave&success=cancelled");
}
