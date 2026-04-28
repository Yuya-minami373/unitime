import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import {
  createStampRequest,
  listMyStampRequests,
  type StampRequestAction,
  type StampPunchType,
} from "@/lib/stamp-requests";
import { MonthClosedError } from "@/lib/monthly-close";
import { notifyStampRequestCreated } from "@/lib/teams-notify";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const rows = await listMyStampRequests(user.id);
  return NextResponse.json({ items: rows });
}

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json();
  try {
    const result = await createStampRequest({
      userId: user.id,
      action: body.action as StampRequestAction,
      targetBusinessDay: body.target_business_day as string,
      punchType: body.punch_type as StampPunchType,
      newPunchedAt: body.new_punched_at ?? null,
      targetRecordId: body.target_record_id ?? null,
      reason: body.reason as string,
    });

    // Teams通知（管理者へ）— 失敗しても申請自体は成功扱い
    try {
      await notifyStampRequestCreated({
        requestId: result.id,
        userName: user.name,
        action: body.action,
        punchType: body.punch_type,
        targetBusinessDay: body.target_business_day,
        newPunchedAt: body.new_punched_at ?? null,
        previousPunchedAt: body.previous_punched_at ?? null,
        reason: body.reason,
        appBaseUrl: process.env.APP_BASE_URL,
      });
    } catch (err) {
      console.error("[stamp-request] notify failed:", err);
    }

    return NextResponse.json({ ok: true, id: result.id });
  } catch (err) {
    if (err instanceof MonthClosedError) {
      return NextResponse.json({ error: err.message }, { status: 403 });
    }
    const msg = err instanceof Error ? err.message : "申請に失敗しました";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
