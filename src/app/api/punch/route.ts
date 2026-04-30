import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { dbRun, dbGet } from "@/lib/db";
import { nowJST, nowBusinessDay, businessDayRange } from "@/lib/time";
import { assertBusinessDayOpen, MonthClosedError } from "@/lib/monthly-close";
import { logPunchHistory } from "@/lib/punch-history";

const VALID_TYPES = ["clock_in", "clock_out", "break_start", "break_end"] as const;
type PunchType = (typeof VALID_TYPES)[number];

// 連打防止のしきい値（ミリ秒）
const MIN_PUNCH_INTERVAL_MS = 3_000;

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json();
  const punchType = body.punch_type as PunchType;
  if (!VALID_TYPES.includes(punchType)) {
    return NextResponse.json({ error: "invalid punch_type" }, { status: 400 });
  }

  const latitude = typeof body.latitude === "number" ? body.latitude : null;
  const longitude = typeof body.longitude === "number" ? body.longitude : null;
  const accuracy = typeof body.accuracy === "number" ? body.accuracy : null;
  const memo = typeof body.memo === "string" ? body.memo.slice(0, 500) : null;

  // "今日" は業務日ベース（JST 04:00 境界）
  const today = nowBusinessDay();
  const todayRange = businessDayRange(today);

  // 月締めチェック: 今日の業務月が締め済みなら打刻不可
  try {
    await assertBusinessDayOpen(today);
  } catch (err) {
    if (err instanceof MonthClosedError) {
      return NextResponse.json({ error: err.message }, { status: 403 });
    }
    throw err;
  }

  // 1) 今日(業務日)の最後の打刻（状態遷移判定）。leave行は除外
  const lastToday = await dbGet<{ punch_type: string; punched_at: string }>(
    `SELECT punch_type, punched_at FROM attendance_records
     WHERE user_id = ? AND punched_at >= ? AND punched_at < ?
       AND kind = 'work'
     ORDER BY punched_at DESC LIMIT 1`,
    [user.id, todayRange.startIso, todayRange.endIso],
  );

  // 2) 連打防止: 3秒以内の再打刻をブロック
  if (lastToday) {
    const diffMs = Date.parse(nowJST()) - Date.parse(lastToday.punched_at);
    if (diffMs >= 0 && diffMs < MIN_PUNCH_INTERVAL_MS) {
      return NextResponse.json(
        { error: "打刻が短時間に連続しています。数秒おいてから再度お試しください。" },
        { status: 429 },
      );
    }
  }

  // 3) 状態遷移バリデーション
  //    過去日の未退勤があっても翌日以降の出勤打刻はブロックしない（仕様: 2026-04-30）。
  //    退勤忘れは anomalies.ts の missing_clock_out で検知され、HomeReminderBanner と
  //    月末リマインドCron で本人に通知される。後追いは打刻申請（/requests/stamps/new）で補完。
  const allowed = getAllowedNextPunches(lastToday?.punch_type);
  if (!allowed.includes(punchType)) {
    return NextResponse.json(
      { error: stateErrorMessage(lastToday?.punch_type, punchType) },
      { status: 400 },
    );
  }

  const punchedAt = nowJST();
  const insertResult = await dbRun(
    `INSERT INTO attendance_records
     (user_id, punch_type, punched_at, latitude, longitude, accuracy, memo, kind)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'work')`,
    [user.id, punchType, punchedAt, latitude, longitude, accuracy, memo],
  );

  // Phase B #5: 監査ログ記録（labor law 109条準拠）
  try {
    await logPunchHistory({
      attendanceRecordId: Number(insertResult.lastInsertRowid),
      userId: user.id,
      event: "created",
      newPunchedAt: punchedAt,
      newPunchType: punchType,
      operatedByUserId: user.id,
    });
  } catch (err) {
    console.error("[punch-history] log failed:", err);
  }

  // Phase B #4: 退勤時に36協定遵守状況をチェック・通知
  // 社員のみ対象（業務委託・クルーは協定対象外）
  // 通知失敗は打刻自体の成功には影響させない（ログのみ）
  if (punchType === "clock_out" && user.employment_type === "employee") {
    try {
      const { checkAndNotifySanroku } = await import("@/lib/sanroku");
      await checkAndNotifySanroku({
        userId: user.id,
        userName: user.name,
        standardWorkMinutes: user.standard_work_minutes ?? 420,
        appBaseUrl: process.env.APP_BASE_URL,
      });
    } catch (err) {
      console.error("[sanroku] threshold check failed:", err);
    }
  }

  return NextResponse.json({ ok: true });
}

function getAllowedNextPunches(last: string | undefined): PunchType[] {
  if (!last) return ["clock_in"];
  switch (last) {
    case "clock_in":
      return ["break_start", "clock_out"];
    case "break_start":
      return ["break_end"];
    case "break_end":
      return ["break_start", "clock_out"];
    case "clock_out":
      return ["clock_in"];
    default:
      return ["clock_in"];
  }
}

function labelOf(t: PunchType): string {
  return { clock_in: "出勤", clock_out: "退勤", break_start: "休憩開始", break_end: "休憩終了" }[t];
}

// 状態と試行アクションに応じた人間可読エラー
function stateErrorMessage(last: string | undefined, tried: PunchType): string {
  const want = labelOf(tried);
  if (!last) {
    if (tried !== "clock_in") return `まず出勤打刻を行ってください（${want}は不可）`;
  }
  switch (last) {
    case "clock_in":
    case "break_end":
      if (tried === "clock_in") return "既に出勤中です";
      if (tried === "break_end") return "休憩中ではありません";
      break;
    case "break_start":
      if (tried === "clock_in") return "休憩中のため出勤打刻はできません";
      if (tried === "clock_out") return "休憩中のため退勤打刻はできません。先に休憩終了を打刻してください";
      if (tried === "break_start") return "既に休憩中です";
      break;
    case "clock_out":
      if (tried === "clock_out") return "既に退勤済みです";
      if (tried === "break_start" || tried === "break_end") return "退勤済みのため休憩打刻はできません";
      break;
  }
  return `現在の状態では「${want}」の打刻はできません`;
}
