import { NextResponse } from "next/server";
import { getCurrentUser, isAdmin } from "@/lib/auth";
import {
  closeMonth,
  listMonthlyCloses,
  isMonthClosed,
} from "@/lib/monthly-close";
import { generateMonthlyCloseSnapshot } from "@/lib/monthly-close-snapshot";
import { nowJST } from "@/lib/time";
import { notifyMonthlyCloseDone } from "@/lib/teams-notify";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!isAdmin(user)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const items = await listMonthlyCloses();
  return NextResponse.json({ items });
}

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!isAdmin(user)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body = await req.json();
  const targetMonth = String(body.target_month ?? "").trim();
  if (!/^\d{4}-\d{2}$/.test(targetMonth)) {
    return NextResponse.json({ error: "target_month は YYYY-MM 形式で指定してください" }, { status: 400 });
  }

  if (await isMonthClosed(targetMonth)) {
    return NextResponse.json({ error: "既に締め済みです" }, { status: 400 });
  }

  const closedAt = nowJST();
  const snapshot = await generateMonthlyCloseSnapshot({ targetMonth, closedAt });

  await closeMonth({
    targetMonth,
    closedByUserId: user.id,
    summarySnapshot: snapshot,
    notes: body.notes ?? null,
  });

  // Teams通知（完了レポート）
  try {
    const totalWorkMinutes = snapshot.users.reduce(
      (s, u) => s + u.totals.totalWorkMinutes,
      0,
    );
    const sanrokuWarnings = snapshot.users.filter(
      (u) => u.sanroku && u.sanroku.stage !== "safe",
    ).length;
    await notifyMonthlyCloseDone({
      targetMonth,
      closedByName: user.name,
      totalUsers: snapshot.users.length,
      totalWorkHours: totalWorkMinutes / 60,
      sanrokuWarnings,
      appBaseUrl: process.env.APP_BASE_URL,
    });
  } catch (err) {
    console.error("[monthly-close] notify failed:", err);
  }

  return NextResponse.json({ ok: true, target_month: targetMonth });
}
