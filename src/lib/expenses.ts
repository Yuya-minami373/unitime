// 立替精算・交通費申請のデータアクセス層

import { dbAll, dbGet, dbRun } from "./db";
import { nowJST } from "./time";

export const EXPENSE_CATEGORIES = [
  "交通費",
  "出張日当",
  "宿泊費",
  "物品購入",
  "通信費",
  "その他",
] as const;

export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

export type ExpenseStatus =
  | "pending" // 申請中
  | "ai_flagged" // AI要確認（owner目視待ち）
  | "approved" // 承認=振込完了
  | "rejected"; // 却下

export type AiCheckStatus = "ok" | "warn" | "ng" | null;

export type ExpenseClaim = {
  id: number;
  user_id: number;
  user_name?: string;
  claim_date: string; // YYYY-MM-DD
  category: ExpenseCategory;
  amount: number;
  purpose: string;
  route_from: string | null;
  route_to: string | null;
  project_name: string | null;
  receipt_path: string | null;
  status: ExpenseStatus;
  ai_check_status: AiCheckStatus;
  ai_check_reason: string | null;
  ai_confidence: number | null;
  approver_id: number | null;
  approver_name?: string;
  approved_at: string | null;
  notes: string | null;
  created_at: string;
};

export type CreateExpenseInput = {
  userId: number;
  claimDate: string;
  category: ExpenseCategory;
  amount: number;
  purpose: string;
  routeFrom?: string | null;
  routeTo?: string | null;
  projectName?: string | null;
  receiptPath?: string | null;
  notes?: string | null;
};

// ユーザー自身の申請一覧（新しい順）
export async function listExpensesForUser(userId: number): Promise<ExpenseClaim[]> {
  return await dbAll<ExpenseClaim>(
    `SELECT id, user_id, claim_date, category, amount, purpose,
            route_from, route_to, project_name, receipt_path,
            status, ai_check_status, ai_check_reason, ai_confidence,
            approver_id, approved_at, notes, created_at
     FROM expense_claims
     WHERE user_id = ?
     ORDER BY claim_date DESC, id DESC`,
    [userId],
  );
}

// owner/admin 承認用: 全申請（ユーザー名JOIN済み）
export async function listAllExpenses(
  filter?: { status?: ExpenseStatus | ExpenseStatus[]; ym?: string },
): Promise<ExpenseClaim[]> {
  const conditions: string[] = [];
  const args: (string | number)[] = [];

  if (filter?.status) {
    if (Array.isArray(filter.status)) {
      conditions.push(`e.status IN (${filter.status.map(() => "?").join(",")})`);
      args.push(...filter.status);
    } else {
      conditions.push("e.status = ?");
      args.push(filter.status);
    }
  }
  if (filter?.ym) {
    conditions.push("substr(e.claim_date, 1, 7) = ?");
    args.push(filter.ym);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  return await dbAll<ExpenseClaim>(
    `SELECT e.id, e.user_id, u.name AS user_name, e.claim_date, e.category, e.amount, e.purpose,
            e.route_from, e.route_to, e.project_name, e.receipt_path,
            e.status, e.ai_check_status, e.ai_check_reason, e.ai_confidence,
            e.approver_id, a.name AS approver_name, e.approved_at, e.notes, e.created_at
     FROM expense_claims e
     JOIN users u ON u.id = e.user_id
     LEFT JOIN users a ON a.id = e.approver_id
     ${where}
     ORDER BY e.claim_date DESC, e.id DESC`,
    args as never,
  );
}

export async function getExpenseById(id: number): Promise<ExpenseClaim | undefined> {
  return await dbGet<ExpenseClaim>(
    `SELECT e.id, e.user_id, u.name AS user_name, e.claim_date, e.category, e.amount, e.purpose,
            e.route_from, e.route_to, e.project_name, e.receipt_path,
            e.status, e.ai_check_status, e.ai_check_reason, e.ai_confidence,
            e.approver_id, a.name AS approver_name, e.approved_at, e.notes, e.created_at
     FROM expense_claims e
     JOIN users u ON u.id = e.user_id
     LEFT JOIN users a ON a.id = e.approver_id
     WHERE e.id = ?`,
    [id],
  );
}

export async function createExpense(input: CreateExpenseInput): Promise<number> {
  // 月締めチェック
  const { assertBusinessDayOpen } = await import("./monthly-close");
  await assertBusinessDayOpen(input.claimDate);

  const res = await dbRun(
    `INSERT INTO expense_claims
       (user_id, claim_date, category, amount, purpose,
        route_from, route_to, project_name, receipt_path, status, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)`,
    [
      input.userId,
      input.claimDate,
      input.category,
      input.amount,
      input.purpose,
      input.routeFrom ?? null,
      input.routeTo ?? null,
      input.projectName ?? null,
      input.receiptPath ?? null,
      input.notes ?? null,
    ],
  );
  return Number(res.lastInsertRowid ?? 0);
}

export async function approveExpense(id: number, approverId: number): Promise<void> {
  // 月締めチェック
  const target = await dbGet<{ claim_date: string }>(
    `SELECT claim_date FROM expense_claims WHERE id = ?`,
    [id],
  );
  if (target) {
    const { assertBusinessDayOpen } = await import("./monthly-close");
    await assertBusinessDayOpen(target.claim_date);
  }

  await dbRun(
    `UPDATE expense_claims
     SET status = 'approved', approver_id = ?, approved_at = ?
     WHERE id = ?`,
    [approverId, nowJST(), id],
  );
}

export async function rejectExpense(
  id: number,
  approverId: number,
  reason: string,
): Promise<void> {
  await dbRun(
    `UPDATE expense_claims
     SET status = 'rejected', approver_id = ?, approved_at = ?, notes = ?
     WHERE id = ?`,
    [approverId, nowJST(), reason, id],
  );
}

export async function setAiCheckResult(
  id: number,
  result: { status: AiCheckStatus; reason: string | null; confidence: number | null },
): Promise<void> {
  const claimStatus = result.status === "ng" || result.status === "warn" ? "ai_flagged" : "pending";
  await dbRun(
    `UPDATE expense_claims
     SET ai_check_status = ?, ai_check_reason = ?, ai_confidence = ?, status = ?
     WHERE id = ?`,
    [result.status, result.reason, result.confidence, claimStatus, id],
  );
}

// 統計: ユーザーごとの今月合計・ステータス別件数
export async function monthlyStatsForUser(
  userId: number,
  ym: string,
): Promise<{ totalAmount: number; pendingCount: number; approvedCount: number }> {
  const row = await dbGet<{ totalAmount: number; pendingCount: number; approvedCount: number }>(
    `SELECT
       COALESCE(SUM(CASE WHEN status='approved' THEN amount ELSE 0 END), 0) AS totalAmount,
       SUM(CASE WHEN status IN ('pending','ai_flagged') THEN 1 ELSE 0 END) AS pendingCount,
       SUM(CASE WHEN status='approved' THEN 1 ELSE 0 END) AS approvedCount
     FROM expense_claims
     WHERE user_id = ? AND substr(claim_date, 1, 7) = ?`,
    [userId, ym],
  );
  return (
    row ?? { totalAmount: 0, pendingCount: 0, approvedCount: 0 }
  );
}

// 表示用ラベル
export function statusLabel(s: ExpenseStatus): string {
  switch (s) {
    case "pending":
      return "申請中";
    case "ai_flagged":
      return "AI要確認";
    case "approved":
      return "承認済・振込完了";
    case "rejected":
      return "却下";
  }
}

export function formatYen(n: number): string {
  return `¥${n.toLocaleString("ja-JP")}`;
}
