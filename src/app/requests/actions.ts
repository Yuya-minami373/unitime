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
} from "@/lib/leaves";

const VALID_LEAVE_TYPES = LEAVE_TYPES.map((t) => t.value);
const VALID_DURATION_TYPES = DURATION_TYPES.map((t) => t.value);

export async function createLeaveRequest(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.employment_type === "crew") redirect("/");

  const leave_type = String(formData.get("leave_type") ?? "");
  const duration_type = String(formData.get("duration_type") ?? "");
  const start_date = String(formData.get("start_date") ?? "").trim();
  const end_date = String(formData.get("end_date") ?? "").trim() || start_date;
  const hours_used_raw = String(formData.get("hours_used") ?? "").trim();
  const hours_used = hours_used_raw ? Number(hours_used_raw) : null;
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
  if (duration_type === "hourly" && (!hours_used || hours_used <= 0)) {
    redirect("/requests?tab=leave&error=hours_required");
  }
  // 半休/時間休は単日のみ
  if (
    (duration_type === "half_am" ||
      duration_type === "half_pm" ||
      duration_type === "hourly") &&
    end_date !== start_date
  ) {
    redirect("/requests?tab=leave&error=single_day_only");
  }
  if (leave_type === "special" && !special_policy_code) {
    redirect("/requests?tab=leave&error=policy_required");
  }

  try {
    const result = await dbRun(
      `INSERT INTO leave_requests
         (user_id, leave_type, special_policy_code, start_date, end_date,
          duration_type, hours_used, reason, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)`,
      [
        user.id,
        leave_type,
        leave_type === "special" ? special_policy_code : null,
        start_date,
        end_date,
        duration_type,
        duration_type === "hourly" ? hours_used : null,
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

  await dbRun(
    `UPDATE leave_requests
     SET status = 'approved', approver_id = ?, approved_at = ?, updated_at = ?
     WHERE id = ? AND status = 'pending'`,
    [current!.id, nowJST(), nowJST(), id],
  );

  revalidatePath("/admin/requests");
  revalidatePath("/requests");
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

  revalidatePath("/admin/requests");
  revalidatePath("/requests");
  redirect("/admin/requests?tab=leave&success=rejected");
}

export async function cancelLeaveRequest(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const id = Number(formData.get("id"));
  if (!id) redirect("/requests?tab=leave&error=invalid_id");

  // 自分の申請のみ取消可能・status='pending'のみ
  const target = await dbGet<{ id: number; user_id: number; status: string }>(
    `SELECT id, user_id, status FROM leave_requests WHERE id = ?`,
    [id],
  );
  if (!target || target.user_id !== user.id) {
    redirect("/requests?tab=leave&error=not_found");
  }
  if (target.status !== "pending") {
    redirect("/requests?tab=leave&error=cannot_cancel");
  }

  await dbRun(
    `UPDATE leave_requests SET status = 'cancelled', updated_at = ? WHERE id = ?`,
    [nowJST(), id],
  );

  revalidatePath("/requests");
  revalidatePath("/admin/requests");
  redirect("/requests?tab=leave&success=cancelled");
}
