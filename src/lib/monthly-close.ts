// 月締め状態管理
//
// 業務月（businessMonthRange 基準）単位で 'open' / 'closed' を管理。
// 締め後は当該月の打刻・各種申請の書込APIを全てブロックする。
// 締め解除（reopen）は理由必須で監査ログを残す。

import { dbAll, dbGet, dbRun } from "./db";
import { businessDayFromIso, nowJST } from "./time";

export class MonthClosedError extends Error {
  constructor(public targetMonth: string) {
    super(`${targetMonth} は締め済みです。修正には締め解除が必要です。`);
    this.name = "MonthClosedError";
  }
}

export type MonthlyCloseRow = {
  id: number;
  target_month: string;
  status: "open" | "closed";
  closed_by_user_id: number | null;
  closed_at: string | null;
  reopened_by_user_id: number | null;
  reopened_at: string | null;
  reopen_reason: string | null;
  summary_snapshot: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

// 業務日 YYYY-MM-DD を業務月 YYYY-MM に変換
export function businessMonthOf(businessDay: string): string {
  return businessDay.slice(0, 7);
}

// ISO 文字列の打刻時刻から業務月を取得
export function businessMonthOfIso(iso: string): string {
  return businessMonthOf(businessDayFromIso(iso));
}

export async function getMonthlyClose(
  targetMonth: string,
): Promise<MonthlyCloseRow | undefined> {
  return await dbGet<MonthlyCloseRow>(
    `SELECT * FROM monthly_closes WHERE target_month = ?`,
    [targetMonth],
  );
}

export async function listMonthlyCloses(): Promise<MonthlyCloseRow[]> {
  return await dbAll<MonthlyCloseRow>(
    `SELECT * FROM monthly_closes ORDER BY target_month DESC`,
  );
}

export async function isMonthClosed(targetMonth: string): Promise<boolean> {
  const row = await getMonthlyClose(targetMonth);
  return row?.status === "closed";
}

// API入口で呼ぶガード。締め済みなら例外を投げる。
export async function assertBusinessDayOpen(
  businessDay: string,
): Promise<void> {
  const ym = businessMonthOf(businessDay);
  if (await isMonthClosed(ym)) {
    throw new MonthClosedError(ym);
  }
}

// ISO 打刻時刻バージョン
export async function assertBusinessDayOpenByIso(iso: string): Promise<void> {
  await assertBusinessDayOpen(businessDayFromIso(iso));
}

export async function closeMonth(args: {
  targetMonth: string;
  closedByUserId: number;
  summarySnapshot: unknown;
  notes?: string | null;
}): Promise<void> {
  const existing = await getMonthlyClose(args.targetMonth);
  const snapshotJson = JSON.stringify(args.summarySnapshot);
  const now = nowJST();
  if (existing) {
    if (existing.status === "closed") {
      throw new Error(`${args.targetMonth} は既に締め済みです`);
    }
    await dbRun(
      `UPDATE monthly_closes
       SET status='closed',
           closed_by_user_id=?,
           closed_at=?,
           summary_snapshot=?,
           notes=?,
           updated_at=?
       WHERE id=?`,
      [
        args.closedByUserId,
        now,
        snapshotJson,
        args.notes ?? null,
        now,
        existing.id,
      ],
    );
  } else {
    await dbRun(
      `INSERT INTO monthly_closes
        (target_month, status, closed_by_user_id, closed_at, summary_snapshot, notes, created_at, updated_at)
       VALUES (?, 'closed', ?, ?, ?, ?, ?, ?)`,
      [
        args.targetMonth,
        args.closedByUserId,
        now,
        snapshotJson,
        args.notes ?? null,
        now,
        now,
      ],
    );
  }
}

export async function reopenMonth(args: {
  targetMonth: string;
  reopenedByUserId: number;
  reason: string;
}): Promise<void> {
  const existing = await getMonthlyClose(args.targetMonth);
  if (!existing) {
    throw new Error(`${args.targetMonth} は締めていません`);
  }
  if (existing.status === "open") {
    throw new Error(`${args.targetMonth} は既にオープン状態です`);
  }
  if (!args.reason || args.reason.trim().length < 3) {
    throw new Error("締め解除には理由が必要です（3文字以上）");
  }
  const now = nowJST();
  await dbRun(
    `UPDATE monthly_closes
     SET status='open',
         reopened_by_user_id=?,
         reopened_at=?,
         reopen_reason=?,
         updated_at=?
     WHERE id=?`,
    [args.reopenedByUserId, now, args.reason.trim(), now, existing.id],
  );
}

// JST 今日の業務月の前月を返す（締め対象候補の標準値）
export function previousBusinessMonth(today: string): string {
  const [y, m] = today.split("-").map(Number);
  if (!y || !m) throw new Error(`invalid date: ${today}`);
  const prev = m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
  return prev;
}
