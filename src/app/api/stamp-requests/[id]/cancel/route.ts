import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { cancelStampRequest } from "@/lib/stamp-requests";

export async function POST(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await ctx.params;
  const requestId = Number(id);
  if (!Number.isFinite(requestId)) {
    return NextResponse.json({ error: "invalid id" }, { status: 400 });
  }

  try {
    await cancelStampRequest({ requestId, userId: user.id });
    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "取消に失敗しました";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
