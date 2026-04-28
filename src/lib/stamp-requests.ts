// 打刻申請の作成・取消・承認反映ロジック
//
// 申請ライフサイクル:
//   作成(pending) → 承認(approved) → attendance_records に反映 + punch_history 記録
//                → 却下(rejected) / 取消(cancelled) → 反映なし
//
// 承認時に attendance_records への INSERT/UPDATE/DELETE を実行し、
// 同時に punch_history へ修正前後を記録する。整合性は dbTransaction でまとめる。

import { dbAll, dbGet, dbRun, dbTransaction } from "./db";
import { businessDayRange, nowJST } from "./time";
import { logPunchHistory } from "./punch-history";
import { assertBusinessDayOpen } from "./monthly-close";

export const STAMP_REQUEST_ACTIONS = ["add", "modify", "delete"] as const;
export type StampRequestAction = (typeof STAMP_REQUEST_ACTIONS)[number];

export const STAMP_PUNCH_TYPES = [
  "clock_in",
  "clock_out",
  "break_start",
  "break_end",
] as const;
export type StampPunchType = (typeof STAMP_PUNCH_TYPES)[number];

export type StampRequestStatus = "pending" | "approved" | "rejected" | "cancelled";

export type StampRequestRow = {
  id: number;
  user_id: number;
  request_kind: string;
  action: StampRequestAction;
  target_business_day: string;
  punch_type: StampPunchType;
  new_punched_at: string | null;
  target_record_id: number | null;
  previous_punched_at: string | null;
  reason: string;
  status: StampRequestStatus;
  approver_id: number | null;
  approved_at: string | null;
  rejection_reason: string | null;
  cancelled_at: string | null;
  created_at: string;
  updated_at: string;
};

export type StampRequestWithUser = StampRequestRow & {
  user_name: string;
  approver_name: string | null;
};

// =====================================================================
// 申請作成
// =====================================================================

export type CreateStampRequestInput = {
  userId: number;
  action: StampRequestAction;
  targetBusinessDay: string;     // YYYY-MM-DD
  punchType: StampPunchType;
  newPunchedAt?: string | null;  // ISO +09:00（add/modify 必須）
  targetRecordId?: number | null; // modify/delete 必須
  reason: string;
  requestKind?: string;          // 'forgot' (default) | 'admin_proxy' | etc.
};

export async function createStampRequest(
  input: CreateStampRequestInput,
): Promise<{ id: number }> {
  // 月締めチェック
  await assertBusinessDayOpen(input.targetBusinessDay);

  if (!STAMP_REQUEST_ACTIONS.includes(input.action)) {
    throw new Error(`invalid action: ${input.action}`);
  }
  if (!STAMP_PUNCH_TYPES.includes(input.punchType)) {
    throw new Error(`invalid punch_type: ${input.punchType}`);
  }
  if (!input.reason || input.reason.trim().length < 3) {
    throw new Error("理由は3文字以上で入力してください");
  }

  // 未来日付の申請禁止
  const today = nowJST().slice(0, 10);
  if (input.targetBusinessDay > today) {
    throw new Error("未来日付の申請はできません");
  }

  // 既存値のスナップショット取得（modify/delete 時）
  let previousPunchedAt: string | null = null;
  if (input.action === "modify" || input.action === "delete") {
    if (!input.targetRecordId) {
      throw new Error(`${input.action} には target_record_id が必要です`);
    }
    const target = await dbGet<{ user_id: number; punched_at: string; punch_type: string }>(
      `SELECT user_id, punched_at, punch_type FROM attendance_records WHERE id = ?`,
      [input.targetRecordId],
    );
    if (!target) {
      throw new Error("対象の打刻が見つかりません");
    }
    if (target.user_id !== input.userId) {
      throw new Error("自分の打刻のみ申請対象にできます");
    }
    previousPunchedAt = target.punched_at;
  }

  if ((input.action === "add" || input.action === "modify") && !input.newPunchedAt) {
    throw new Error(`${input.action} には new_punched_at が必要です`);
  }

  const result = await dbRun(
    `INSERT INTO stamp_requests
       (user_id, request_kind, action, target_business_day, punch_type,
        new_punched_at, target_record_id, previous_punched_at, reason, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
    [
      input.userId,
      input.requestKind ?? "forgot",
      input.action,
      input.targetBusinessDay,
      input.punchType,
      input.newPunchedAt ?? null,
      input.targetRecordId ?? null,
      previousPunchedAt,
      input.reason.trim(),
    ],
  );
  return { id: Number(result.lastInsertRowid) };
}

// =====================================================================
// 申請取消（本人・pending のみ）
// =====================================================================

export async function cancelStampRequest(args: {
  requestId: number;
  userId: number;
}): Promise<void> {
  const req = await dbGet<StampRequestRow>(
    `SELECT * FROM stamp_requests WHERE id = ?`,
    [args.requestId],
  );
  if (!req) throw new Error("申請が見つかりません");
  if (req.user_id !== args.userId) throw new Error("自分の申請のみ取消可能です");
  if (req.status !== "pending") {
    throw new Error("承認・却下済みの申請は取消できません");
  }
  const now = nowJST();
  await dbRun(
    `UPDATE stamp_requests
     SET status='cancelled', cancelled_at=?, updated_at=?
     WHERE id = ?`,
    [now, now, args.requestId],
  );
}

// =====================================================================
// 申請承認（管理者のみ）→ attendance_records に反映 + punch_history 記録
// =====================================================================

export async function approveStampRequest(args: {
  requestId: number;
  approverId: number;
}): Promise<{ recordId: number | null }> {
  const req = await dbGet<StampRequestRow>(
    `SELECT * FROM stamp_requests WHERE id = ?`,
    [args.requestId],
  );
  if (!req) throw new Error("申請が見つかりません");
  if (req.status !== "pending") {
    throw new Error("pending状態の申請のみ承認できます");
  }

  // 月締めチェック（承認時にも再評価）
  await assertBusinessDayOpen(req.target_business_day);

  // 整合性チェック: 反映後の状態遷移列が壊れないか
  await assertCoherentAfterApply(req);

  const now = nowJST();
  let resultRecordId: number | null = null;

  // dbTransaction でまとめて反映 + 履歴記録 + ステータス更新
  // 失敗時は status を pending のまま戻す
  // ※ punch_history の INSERT は同一トランザクションで行う必要があるため、
  //   logPunchHistory は使わず生 SQL を tx.execute で発行する
  await dbTransaction(async (tx) => {
    if (req.action === "add") {
      if (!req.new_punched_at) throw new Error("new_punched_at が空です");
      // INSERT → lastInsertRowid を取得するため一旦 commit外で実行
      const insertRes = await dbRun(
        `INSERT INTO attendance_records
           (user_id, punch_type, punched_at, kind)
         VALUES (?, ?, ?, 'work')`,
        [req.user_id, req.punch_type, req.new_punched_at],
      );
      resultRecordId = Number(insertRes.lastInsertRowid);
      await tx.execute(
        `INSERT INTO punch_history
           (attendance_record_id, user_id, event,
            previous_punched_at, new_punched_at,
            previous_punch_type, new_punch_type,
            operated_by_user_id, source_request_id, reason)
         VALUES (?, ?, 'created', NULL, ?, NULL, ?, ?, ?, ?)`,
        [
          resultRecordId,
          req.user_id,
          req.new_punched_at,
          req.punch_type,
          args.approverId,
          req.id,
          req.reason,
        ],
      );
    } else if (req.action === "modify") {
      if (!req.target_record_id || !req.new_punched_at) {
        throw new Error("modify には target_record_id と new_punched_at が必要です");
      }
      await tx.execute(
        `UPDATE attendance_records SET punched_at = ? WHERE id = ?`,
        [req.new_punched_at, req.target_record_id],
      );
      resultRecordId = req.target_record_id;
      await tx.execute(
        `INSERT INTO punch_history
           (attendance_record_id, user_id, event,
            previous_punched_at, new_punched_at,
            previous_punch_type, new_punch_type,
            operated_by_user_id, source_request_id, reason)
         VALUES (?, ?, 'modified', ?, ?, ?, ?, ?, ?, ?)`,
        [
          req.target_record_id,
          req.user_id,
          req.previous_punched_at,
          req.new_punched_at,
          req.punch_type,
          req.punch_type,
          args.approverId,
          req.id,
          req.reason,
        ],
      );
    } else if (req.action === "delete") {
      if (!req.target_record_id) throw new Error("delete には target_record_id が必要です");
      // 履歴を先に記録してから DELETE（FK SET NULL の仕様に依存しない）
      await tx.execute(
        `INSERT INTO punch_history
           (attendance_record_id, user_id, event,
            previous_punched_at, new_punched_at,
            previous_punch_type, new_punch_type,
            operated_by_user_id, source_request_id, reason)
         VALUES (?, ?, 'deleted', ?, NULL, ?, NULL, ?, ?, ?)`,
        [
          req.target_record_id,
          req.user_id,
          req.previous_punched_at,
          req.punch_type,
          args.approverId,
          req.id,
          req.reason,
        ],
      );
      await tx.execute(`DELETE FROM attendance_records WHERE id = ?`, [
        req.target_record_id,
      ]);
      resultRecordId = null;
    }

    await tx.execute(
      `UPDATE stamp_requests
       SET status='approved', approver_id=?, approved_at=?, updated_at=?
       WHERE id=?`,
      [args.approverId, now, now, req.id],
    );
  });

  return { recordId: resultRecordId };
}

// =====================================================================
// 申請却下（管理者のみ）
// =====================================================================

export async function rejectStampRequest(args: {
  requestId: number;
  approverId: number;
  reason: string;
}): Promise<void> {
  const req = await dbGet<StampRequestRow>(
    `SELECT * FROM stamp_requests WHERE id = ?`,
    [args.requestId],
  );
  if (!req) throw new Error("申請が見つかりません");
  if (req.status !== "pending") {
    throw new Error("pending状態の申請のみ却下できます");
  }
  if (!args.reason || args.reason.trim().length < 3) {
    throw new Error("却下理由を3文字以上で入力してください");
  }
  const now = nowJST();
  await dbRun(
    `UPDATE stamp_requests
     SET status='rejected', approver_id=?, approved_at=?, rejection_reason=?, updated_at=?
     WHERE id=?`,
    [args.approverId, now, args.reason.trim(), now, req.id],
  );
}

// =====================================================================
// 整合性チェック: 反映後の打刻列が状態遷移ルールに違反しないか
// =====================================================================

async function assertCoherentAfterApply(req: StampRequestRow): Promise<void> {
  const range = businessDayRange(req.target_business_day);
  const existing = await dbAll<{
    id: number;
    punch_type: string;
    punched_at: string;
  }>(
    `SELECT id, punch_type, punched_at FROM attendance_records
     WHERE user_id = ? AND punched_at >= ? AND punched_at < ?
       AND (kind IS NULL OR kind = 'work')
     ORDER BY punched_at ASC`,
    [req.user_id, range.startIso, range.endIso],
  );

  // 申請を反映した想定の列を作る
  let simulated = existing.map((r) => ({ ...r }));
  if (req.action === "add" && req.new_punched_at) {
    simulated.push({
      id: -1,
      punch_type: req.punch_type,
      punched_at: req.new_punched_at,
    });
  } else if (req.action === "modify" && req.target_record_id && req.new_punched_at) {
    simulated = simulated.map((r) =>
      r.id === req.target_record_id
        ? { ...r, punched_at: req.new_punched_at as string }
        : r,
    );
  } else if (req.action === "delete" && req.target_record_id) {
    simulated = simulated.filter((r) => r.id !== req.target_record_id);
  }
  simulated.sort((a, b) => (a.punched_at < b.punched_at ? -1 : 1));

  // 状態遷移検証
  let last: string | null = null;
  for (const r of simulated) {
    const allowed = nextAllowed(last);
    if (!allowed.includes(r.punch_type)) {
      throw new Error(
        `状態遷移エラー: ${last ?? "(初期)"} の後に ${r.punch_type} が続きます。元の打刻データと整合しません`,
      );
    }
    last = r.punch_type;
  }
}

function nextAllowed(last: string | null): string[] {
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

// =====================================================================
// 一覧取得
// =====================================================================

export async function listMyStampRequests(
  userId: number,
): Promise<StampRequestRow[]> {
  return await dbAll<StampRequestRow>(
    `SELECT * FROM stamp_requests WHERE user_id = ? ORDER BY created_at DESC LIMIT 100`,
    [userId],
  );
}

export async function listAllStampRequests(args?: {
  status?: StampRequestStatus;
}): Promise<StampRequestWithUser[]> {
  const where = args?.status ? `WHERE r.status = ?` : "";
  const params = args?.status ? [args.status] : [];
  return await dbAll<StampRequestWithUser>(
    `SELECT r.*, u.name AS user_name, a.name AS approver_name
     FROM stamp_requests r
     JOIN users u ON u.id = r.user_id
     LEFT JOIN users a ON a.id = r.approver_id
     ${where}
     ORDER BY r.created_at DESC LIMIT 200`,
    params,
  );
}

export async function pendingStampRequestCount(): Promise<number> {
  const row = await dbGet<{ c: number }>(
    `SELECT COUNT(*) AS c FROM stamp_requests WHERE status = 'pending'`,
  );
  return row?.c ?? 0;
}

// 自分のpending件数
export async function myPendingStampRequestCount(userId: number): Promise<number> {
  const row = await dbGet<{ c: number }>(
    `SELECT COUNT(*) AS c FROM stamp_requests WHERE user_id = ? AND status = 'pending'`,
    [userId],
  );
  return row?.c ?? 0;
}
