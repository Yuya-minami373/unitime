// Vercel Cron: 月締め前リマインド
// schedule: 0 0 * * *  (UTC) = 09:00 JST 毎日
// 当日が「当月末日」または「当月末日 - 3日」のときに Teams通知を送る

import { NextRequest, NextResponse } from "next/server";
import { jstComponents, nowJST, daysInMonth } from "@/lib/time";
import {
  pendingStampRequestCount,
} from "@/lib/stamp-requests";
import { detectAnomaliesForMonth } from "@/lib/anomalies";
import { isMonthClosed, previousBusinessMonth } from "@/lib/monthly-close";
import { notifyMonthlyCloseReminder } from "@/lib/teams-notify";
import { hasNotified, recordNotification } from "@/lib/sanroku";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  const expected = process.env.CRON_SECRET
    ? `Bearer ${process.env.CRON_SECRET}`
    : null;
  if (expected && auth !== expected) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const c = jstComponents(nowJST());
  const todayYm = `${c.year}-${String(c.month).padStart(2, "0")}`;
  const today = `${todayYm}-${String(c.day).padStart(2, "0")}`;
  const lastDay = daysInMonth(c.year, c.month);
  const daysToEnd = lastDay - c.day;

  // 「当月末3日前」と「当月末日」のみ発火
  let phase: 0 | 3 | null = null;
  if (daysToEnd === 3) phase = 3;
  else if (daysToEnd === 0) phase = 0;
  else {
    return NextResponse.json({ ok: true, skipped: "not reminder day", today });
  }

  // 対象月は「当月」（リマインドなので翌月初に締める対象）
  const targetMonth = todayYm;

  // 既に締め済みならスキップ
  if (await isMonthClosed(targetMonth)) {
    return NextResponse.json({ ok: true, skipped: "already closed", targetMonth });
  }

  // 重複通知防止（target_period に phase 情報を含める）
  const notifyType = phase === 0 ? "monthly_close_reminder_today" : "monthly_close_reminder_3d";
  // user_id は通知メッセージとして共有なので 0（システム通知）扱いで記録
  if (await hasNotified(0, notifyType, targetMonth)) {
    return NextResponse.json({ ok: true, skipped: "already notified", targetMonth, phase });
  }

  // 状況集計
  const [pendingCount, anomalies] = await Promise.all([
    pendingStampRequestCount(),
    detectAnomaliesForMonth({
      year: c.year,
      month: c.month,
      includeWeekdayNoPunch: true,
    }),
  ]);

  await notifyMonthlyCloseReminder({
    targetMonth,
    daysBeforeClose: phase,
    pendingStampRequests: pendingCount,
    anomalyCount: anomalies.length,
    appBaseUrl: process.env.APP_BASE_URL,
  });
  await recordNotification(0, notifyType, targetMonth);

  return NextResponse.json({
    ok: true,
    today,
    phase,
    targetMonth,
    pendingCount,
    anomalies: anomalies.length,
  });
}
