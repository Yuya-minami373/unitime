import { NextResponse } from "next/server";
import { getCurrentUser, isAdmin } from "@/lib/auth";
import { approveStampRequest } from "@/lib/stamp-requests";
import { dbGet } from "@/lib/db";
import { MonthClosedError } from "@/lib/monthly-close";
import { notifyStampRequestApproved } from "@/lib/teams-notify";
import { checkAndNotifySanroku } from "@/lib/sanroku";

export async function POST(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!isAdmin(user)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const { id } = await ctx.params;
  const requestId = Number(id);
  if (!Number.isFinite(requestId)) {
    return NextResponse.json({ error: "invalid id" }, { status: 400 });
  }

  try {
    await approveStampRequest({ requestId, approverId: user.id });

    // 申請者情報・申請内容を取得して Teams通知
    const detail = await dbGet<{
      user_id: number;
      user_name: string;
      employment_type: string;
      standard_work_minutes: number | null;
      action: string;
      punch_type: string;
      target_business_day: string;
    }>(
      `SELECT r.user_id, u.name AS user_name, u.employment_type,
              u.standard_work_minutes, r.action, r.punch_type, r.target_business_day
       FROM stamp_requests r JOIN users u ON u.id = r.user_id
       WHERE r.id = ?`,
      [requestId],
    );

    if (detail) {
      try {
        await notifyStampRequestApproved({
          requestId,
          userName: detail.user_name,
          approverName: user.name,
          action: detail.action,
          punchType: detail.punch_type,
          targetBusinessDay: detail.target_business_day,
        });
      } catch (err) {
        console.error("[stamp-request] approve notify failed:", err);
      }

      // 36協定 再評価（社員のみ・後出し残業の検知）
      if (detail.employment_type === "employee") {
        try {
          await checkAndNotifySanroku({
            userId: detail.user_id,
            userName: detail.user_name,
            standardWorkMinutes: detail.standard_work_minutes ?? 420,
            appBaseUrl: process.env.APP_BASE_URL,
          });
        } catch (err) {
          console.error("[sanroku] recheck after approve failed:", err);
        }
      }
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof MonthClosedError) {
      return NextResponse.json({ error: err.message }, { status: 403 });
    }
    const msg = err instanceof Error ? err.message : "承認に失敗しました";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
