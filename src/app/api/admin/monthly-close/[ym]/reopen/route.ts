import { NextResponse } from "next/server";
import { getCurrentUser, isOwner } from "@/lib/auth";
import { reopenMonth } from "@/lib/monthly-close";

export async function POST(
  req: Request,
  ctx: { params: Promise<{ ym: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  // 締め解除は owner のみ
  if (!isOwner(user)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const { ym } = await ctx.params;
  if (!/^\d{4}-\d{2}$/.test(ym)) {
    return NextResponse.json({ error: "invalid month format" }, { status: 400 });
  }

  const body = await req.json();
  const reason = String(body.reason ?? "").trim();

  try {
    await reopenMonth({
      targetMonth: ym,
      reopenedByUserId: user.id,
      reason,
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "解除に失敗しました";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
