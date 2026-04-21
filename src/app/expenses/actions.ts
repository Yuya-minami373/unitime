"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import { randomBytes } from "crypto";
import { put } from "@vercel/blob";
import { getCurrentUser, isAdmin } from "@/lib/auth";
import {
  createExpense,
  EXPENSE_CATEGORIES,
  approveExpense,
  rejectExpense,
  getExpenseById,
  setAiCheckResult,
  type ExpenseCategory,
} from "@/lib/expenses";
import { runKeiCheck } from "@/lib/kei-check";
import {
  notifyExpenseCreated,
  notifyExpenseApproved,
  notifyExpenseRejected,
} from "@/lib/teams-notify";

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_EXT = new Set([".jpg", ".jpeg", ".png", ".pdf", ".heic", ".webp"]);

export type CreateExpenseResult =
  | { ok: true; id: number }
  | { ok: false; error: string };

function parseAmount(raw: FormDataEntryValue | null): number {
  if (typeof raw !== "string") return NaN;
  // カンマ区切り・全角数字も許容
  const normalized = raw.replace(/,/g, "").replace(/[０-９]/g, (c) =>
    String.fromCharCode(c.charCodeAt(0) - 0xfee0),
  );
  const n = Number(normalized);
  return Number.isFinite(n) ? Math.floor(n) : NaN;
}

async function saveReceipt(file: File, userId: number): Promise<string> {
  const ext = path.extname(file.name).toLowerCase();
  const filename = `u${userId}_${Date.now()}_${randomBytes(4).toString("hex")}${ext}`;

  // Vercel Blob（本番）— BLOB_READ_WRITE_TOKEN が設定されていればBlob、なければローカルFS
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    const blob = await put(`receipts/${filename}`, file, {
      access: "public",
      contentType: file.type || undefined,
    });
    return blob.url;
  }

  // ローカル開発: public/receipts/ に保存
  const buf = Buffer.from(await file.arrayBuffer());
  const dir = path.join(process.cwd(), "public", "receipts");
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, filename), buf);
  return `/receipts/${filename}`;
}

export async function createExpenseAction(formData: FormData): Promise<CreateExpenseResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "ログインが必要です" };
  if (user.employment_type === "crew") {
    return { ok: false, error: "クルーは立替精算の対象外です" };
  }

  const claimDate = formData.get("claim_date");
  const category = formData.get("category");
  const purpose = formData.get("purpose");
  const routeFrom = formData.get("route_from");
  const routeTo = formData.get("route_to");
  const projectName = formData.get("project_name");
  const notes = formData.get("notes");
  const receipt = formData.get("receipt");

  const amount = parseAmount(formData.get("amount"));

  // バリデーション
  if (typeof claimDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(claimDate)) {
    return { ok: false, error: "日付が不正です" };
  }
  if (typeof category !== "string" || !EXPENSE_CATEGORIES.includes(category as ExpenseCategory)) {
    return { ok: false, error: "カテゴリを選択してください" };
  }
  if (!Number.isFinite(amount) || amount <= 0) {
    return { ok: false, error: "金額は1円以上の整数で入力してください" };
  }
  if (amount > 10_000_000) {
    return { ok: false, error: "金額が大きすぎます（1,000万円上限）" };
  }
  if (typeof purpose !== "string" || purpose.trim().length < 2) {
    return { ok: false, error: "用途を2文字以上で入力してください" };
  }
  if (category === "交通費") {
    if (typeof routeFrom !== "string" || !routeFrom.trim()) {
      return { ok: false, error: "出発地を入力してください" };
    }
    if (typeof routeTo !== "string" || !routeTo.trim()) {
      return { ok: false, error: "到着地を入力してください" };
    }
  }

  let receiptPath: string | null = null;
  if (receipt instanceof File && receipt.size > 0) {
    if (receipt.size > MAX_FILE_SIZE) {
      return { ok: false, error: "領収書は10MB以下にしてください" };
    }
    const ext = path.extname(receipt.name).toLowerCase();
    if (!ALLOWED_EXT.has(ext)) {
      return { ok: false, error: "対応形式: jpg / png / pdf / heic / webp" };
    }
    try {
      receiptPath = await saveReceipt(receipt, user.id);
    } catch {
      return { ok: false, error: "領収書のアップロードに失敗しました" };
    }
  }

  const id = await createExpense({
    userId: user.id,
    claimDate,
    category: category as ExpenseCategory,
    amount,
    purpose: purpose.trim(),
    routeFrom: typeof routeFrom === "string" && routeFrom.trim() ? routeFrom.trim() : null,
    routeTo: typeof routeTo === "string" && routeTo.trim() ? routeTo.trim() : null,
    projectName:
      typeof projectName === "string" && projectName.trim() ? projectName.trim() : null,
    receiptPath,
    notes: typeof notes === "string" && notes.trim() ? notes.trim() : null,
  });

  // Teams通知を非同期で実行（申請レスポンスをブロックしない）
  // AI一次チェックは ANTHROPIC_API_KEY が設定されている場合のみ実行
  const aiCheckEnabled = Boolean(process.env.ANTHROPIC_API_KEY?.startsWith("sk-ant"));

  (async () => {
    try {
      if (aiCheckEnabled) {
        const result = await runKeiCheck({
          id,
          user_id: user.id,
          claim_date: claimDate,
          category: category as ExpenseCategory,
          amount,
          receipt_path: receiptPath,
        });
        await setAiCheckResult(id, {
          status: result.status,
          reason: result.reason,
          confidence: result.confidence,
        });
        await notifyExpenseCreated({
          id,
          userName: user.name,
          category: category as string,
          amount,
          purpose: purpose.trim(),
          claimDate,
          aiStatus: result.status,
          aiReason: result.reason,
        });
      } else {
        // AI無効時: 相場・重複だけはチェック可能だが今回はスキップして通知のみ
        await notifyExpenseCreated({
          id,
          userName: user.name,
          category: category as string,
          amount,
          purpose: purpose.trim(),
          claimDate,
          aiStatus: null,
          aiReason: null,
        });
      }
    } catch (err) {
      console.error("[expense] background error:", err);
    }
  })();

  revalidatePath("/expenses");
  return { ok: true, id };
}

export async function createExpenseAndRedirect(formData: FormData): Promise<void> {
  const res = await createExpenseAction(formData);
  if (!res.ok) {
    // エラー時はクエリで戻す
    redirect(`/expenses/new?error=${encodeURIComponent(res.error)}`);
  }
  redirect(`/expenses?new=${res.id}`);
}

export type ApproveResult = { ok: true } | { ok: false; error: string };

export async function approveExpenseAction(id: number): Promise<ApproveResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "ログインが必要です" };
  if (!isAdmin(user)) return { ok: false, error: "承認権限がありません" };

  const claim = await getExpenseById(id);
  if (!claim) return { ok: false, error: "対象の申請が見つかりません" };
  if (claim.status === "approved") return { ok: false, error: "すでに承認済みです" };
  if (claim.status === "rejected") return { ok: false, error: "却下済みの申請です" };

  await approveExpense(id, user.id);

  // 非同期でTeams通知
  notifyExpenseApproved({
    id,
    userName: claim.user_name ?? "申請者",
    approverName: user.name,
    amount: claim.amount,
    category: claim.category,
  }).catch((err) => console.error("[expense] approve notify failed:", err));

  revalidatePath("/admin/expenses");
  revalidatePath("/expenses");
  return { ok: true };
}

export async function rejectExpenseAction(
  id: number,
  reason: string,
): Promise<ApproveResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "ログインが必要です" };
  if (!isAdmin(user)) return { ok: false, error: "承認権限がありません" };

  const trimmed = reason.trim();
  if (trimmed.length < 2) {
    return { ok: false, error: "却下理由を2文字以上で入力してください" };
  }

  const claim = await getExpenseById(id);
  if (!claim) return { ok: false, error: "対象の申請が見つかりません" };
  if (claim.status === "approved") return { ok: false, error: "すでに承認済みです" };
  if (claim.status === "rejected") return { ok: false, error: "却下済みの申請です" };

  await rejectExpense(id, user.id, trimmed);

  notifyExpenseRejected({
    id,
    userName: claim.user_name ?? "申請者",
    approverName: user.name,
    amount: claim.amount,
    category: claim.category,
    reason: trimmed,
  }).catch((err) => console.error("[expense] reject notify failed:", err));

  revalidatePath("/admin/expenses");
  revalidatePath("/expenses");
  return { ok: true };
}
