// 打刻監査ログ
//
// 労基法109条準拠。すべての打刻データ変更（作成・修正・削除）を永続保存。
// この履歴は労基署対応・賃金請求権の時効対応で参照される。

import { dbAll, dbRun } from "./db";

export type PunchHistoryEvent =
  | "created"
  | "modified"
  | "deleted"
  | "admin_direct_edit";

export type PunchHistoryRow = {
  id: number;
  attendance_record_id: number | null;
  user_id: number;
  event: PunchHistoryEvent;
  previous_punched_at: string | null;
  new_punched_at: string | null;
  previous_punch_type: string | null;
  new_punch_type: string | null;
  operated_by_user_id: number | null;
  source_request_id: number | null;
  reason: string | null;
  created_at: string;
};

export async function logPunchHistory(args: {
  attendanceRecordId: number | null;
  userId: number;
  event: PunchHistoryEvent;
  previousPunchedAt?: string | null;
  newPunchedAt?: string | null;
  previousPunchType?: string | null;
  newPunchType?: string | null;
  operatedByUserId: number;
  sourceRequestId?: number | null;
  reason?: string | null;
}): Promise<void> {
  await dbRun(
    `INSERT INTO punch_history
       (attendance_record_id, user_id, event,
        previous_punched_at, new_punched_at,
        previous_punch_type, new_punch_type,
        operated_by_user_id, source_request_id, reason)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      args.attendanceRecordId,
      args.userId,
      args.event,
      args.previousPunchedAt ?? null,
      args.newPunchedAt ?? null,
      args.previousPunchType ?? null,
      args.newPunchType ?? null,
      args.operatedByUserId,
      args.sourceRequestId ?? null,
      args.reason ?? null,
    ],
  );
}

export async function listPunchHistory(args: {
  userId?: number;
  fromDate?: string; // YYYY-MM-DD（created_at 比較用ISO先頭一致）
  toDate?: string;
  event?: PunchHistoryEvent;
  limit?: number;
}): Promise<PunchHistoryRow[]> {
  const where: string[] = [];
  const params: (string | number)[] = [];
  if (args.userId) {
    where.push("user_id = ?");
    params.push(args.userId);
  }
  if (args.event) {
    where.push("event = ?");
    params.push(args.event);
  }
  if (args.fromDate) {
    where.push("created_at >= ?");
    params.push(`${args.fromDate}T00:00:00+09:00`);
  }
  if (args.toDate) {
    where.push("created_at <= ?");
    params.push(`${args.toDate}T23:59:59+09:00`);
  }
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const limit = args.limit ?? 200;
  return await dbAll<PunchHistoryRow>(
    `SELECT * FROM punch_history ${whereSql}
     ORDER BY created_at DESC LIMIT ${limit}`,
    params,
  );
}
