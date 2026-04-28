import { NextResponse } from "next/server";
import { getCurrentUser, isAdmin } from "@/lib/auth";
import { rejectStampRequest } from "@/lib/stamp-requests";
import { dbGet } from "@/lib/db";
import { notifyStampRequestRejected } from "@/lib/teams-notify";

export async function POST(
  req: Request,
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

  const body = await req.json();
  const reason = String(body.reason ?? "").trim();

  try {
    await rejectStampRequest({ requestId, approverId: user.id, reason });

    const detail = await dbGet<{
      user_name: string;
      action: string;
      punch_type: string;
      target_business_day: string;
    }>(
      `SELECT u.name AS user_name, r.action, r.punch_type, r.target_business_day
       FROM stamp_requests r JOIN users u ON u.id = r.user_id
       WHERE r.id = ?`,
      [requestId],
    );

    if (detail) {
      try {
        await notifyStampRequestRejected({
          requestId,
          userName: detail.user_name,
          approverName: user.name,
          action: detail.action,
          punchType: detail.punch_type,
          targetBusinessDay: detail.target_business_day,
          reason,
        });
      } catch (err) {
        console.error("[stamp-request] reject notify failed:", err);
      }
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "却下に失敗しました";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
