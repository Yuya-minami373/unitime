import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { dbRun, dbGet } from "@/lib/db";
import { nowJST } from "@/lib/time";

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

  const today = nowJST().slice(0, 10);

  // 1) 今日の最後の打刻（状態遷移判定）
  const lastToday = await dbGet<{ punch_type: string; punched_at: string }>(
    `SELECT punch_type, punched_at FROM attendance_records
     WHERE user_id = ? AND substr(punched_at, 1, 10) = ?
     ORDER BY punched_at DESC LIMIT 1`,
    [user.id, today],
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

  // 3) クロスデー未退勤チェック: 前日以前に clock_in のまま退勤打刻がない場合は clock_in をブロック
  if (punchType === "clock_in") {
    const openShift = await dbGet<{ punched_at: string }>(
      `SELECT punched_at FROM attendance_records a
       WHERE user_id = ? AND punch_type = 'clock_in'
         AND substr(punched_at, 1, 10) < ?
         AND NOT EXISTS (
           SELECT 1 FROM attendance_records b
           WHERE b.user_id = a.user_id
             AND b.punch_type = 'clock_out'
             AND b.punched_at > a.punched_at
             AND substr(b.punched_at, 1, 10) = substr(a.punched_at, 1, 10)
         )
       ORDER BY punched_at DESC LIMIT 1`,
      [user.id, today],
    );
    if (openShift) {
      const date = openShift.punched_at.slice(0, 10);
      return NextResponse.json(
        {
          error: `${date} の退勤打刻が未完了です。管理者に修正を依頼してください。`,
        },
        { status: 409 },
      );
    }
  }

  // 4) 状態遷移バリデーション
  const allowed = getAllowedNextPunches(lastToday?.punch_type);
  if (!allowed.includes(punchType)) {
    return NextResponse.json(
      { error: stateErrorMessage(lastToday?.punch_type, punchType) },
      { status: 400 },
    );
  }

  await dbRun(
    `INSERT INTO attendance_records
     (user_id, punch_type, punched_at, latitude, longitude, accuracy, memo)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [user.id, punchType, nowJST(), latitude, longitude, accuracy, memo],
  );

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
