// ケイAI一次チェック: 立替精算の自動審査
// - 領収書OCR（添付がある場合）
// - 金額 vs カテゴリの相場チェック
// - 同ユーザー・直近30日の重複検知
// 結果は status=ok/warn/ng + 理由 + 信頼度

import Anthropic from "@anthropic-ai/sdk";
import { readFile } from "fs/promises";
import path from "path";
import { dbAll } from "./db";
import type { ExpenseClaim, ExpenseCategory, AiCheckStatus } from "./expenses";

const MODEL = process.env.ANTHROPIC_MODEL ?? "claude-haiku-4-5-20251001";

export type KeiCheckResult = {
  status: AiCheckStatus; // ok | warn | ng | null
  reason: string | null;
  confidence: number | null;
  details?: {
    ocrAmount?: number | null;
    ocrVendor?: string | null;
    marketCheck?: string;
    duplicateIds?: number[];
  };
};

// カテゴリ別の相場レンジ（円）。これを大幅超過するとwarn
const MARKET_RANGE: Record<ExpenseCategory, { typical: [number, number]; max: number }> = {
  交通費: { typical: [100, 5000], max: 30000 },
  出張日当: { typical: [3000, 10000], max: 30000 },
  宿泊費: { typical: [6000, 20000], max: 60000 },
  物品購入: { typical: [500, 30000], max: 200000 },
  通信費: { typical: [1000, 15000], max: 50000 },
  その他: { typical: [500, 30000], max: 200000 },
};

// 直近30日の重複候補を取得（同user・同日±3日・同金額±10%・同カテゴリ）
async function findDuplicates(claim: {
  id?: number;
  userId: number;
  claimDate: string;
  category: ExpenseCategory;
  amount: number;
}): Promise<number[]> {
  const amountMin = Math.floor(claim.amount * 0.9);
  const amountMax = Math.ceil(claim.amount * 1.1);
  const d = new Date(claim.claimDate);
  const lower = new Date(d);
  lower.setDate(lower.getDate() - 3);
  const upper = new Date(d);
  upper.setDate(upper.getDate() + 3);
  const toYmd = (x: Date) =>
    `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;

  const rows = await dbAll<{ id: number }>(
    `SELECT id FROM expense_claims
     WHERE user_id = ?
       AND category = ?
       AND claim_date BETWEEN ? AND ?
       AND amount BETWEEN ? AND ?
       AND status != 'rejected'
       AND id != ?`,
    [
      claim.userId,
      claim.category,
      toYmd(lower),
      toYmd(upper),
      amountMin,
      amountMax,
      claim.id ?? -1,
    ],
  );
  return rows.map((r) => r.id);
}

function checkMarketRange(category: ExpenseCategory, amount: number): {
  level: "ok" | "warn" | "ng";
  msg: string;
} {
  const range = MARKET_RANGE[category];
  if (amount <= range.typical[1]) return { level: "ok", msg: "相場内" };
  if (amount <= range.max) {
    return {
      level: "warn",
      msg: `${category}としては高め（相場目安: ¥${range.typical[0].toLocaleString()}〜¥${range.typical[1].toLocaleString()}）`,
    };
  }
  return {
    level: "ng",
    msg: `${category}の上限目安¥${range.max.toLocaleString()}を超過`,
  };
}

async function readReceiptAsBase64(
  receiptPath: string,
): Promise<{ data: string; mediaType: string } | null> {
  try {
    const abs = path.join(process.cwd(), "public", receiptPath.replace(/^\//, ""));
    const buf = await readFile(abs);
    const ext = path.extname(receiptPath).toLowerCase();
    const mediaType =
      ext === ".png"
        ? "image/png"
        : ext === ".webp"
        ? "image/webp"
        : ext === ".pdf"
        ? "application/pdf"
        : "image/jpeg";
    return { data: buf.toString("base64"), mediaType };
  } catch {
    return null;
  }
}

type OcrExtract = {
  ocrAmount: number | null;
  ocrVendor: string | null;
  summary: string;
};

// Claude API で領収書を読み取り、金額・店舗名・要約を抽出
async function ocrReceipt(
  receiptPath: string,
  claimedAmount: number,
): Promise<OcrExtract | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  const receipt = await readReceiptAsBase64(receiptPath);
  if (!receipt) return null;

  // PDFはvisionで読めないのでスキップ（TODO: 将来pdf-to-image対応）
  if (receipt.mediaType === "application/pdf") {
    return {
      ocrAmount: null,
      ocrVendor: null,
      summary: "PDFのためOCR未対応（目視確認してください）",
    };
  }

  const client = new Anthropic({ apiKey });
  try {
    const res = await client.messages.create({
      model: MODEL,
      max_tokens: 512,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: {
                type: "base64",
                media_type: receipt.mediaType as
                  | "image/jpeg"
                  | "image/png"
                  | "image/gif"
                  | "image/webp",
                data: receipt.data,
              },
            },
            {
              type: "text",
              text: `この領収書から以下をJSON形式で抽出してください。値が読み取れない場合はnull。
申請金額: ¥${claimedAmount.toLocaleString()}

{
  "total_amount": 数値または null,
  "vendor": "店舗名" または null,
  "date": "YYYY-MM-DD" または null,
  "note": "特記事項（手書き・レシート破損・金額不鮮明など）" または null
}

JSONのみを返してください（説明文・マークダウン不要）。`,
            },
          ],
        },
      ],
    });

    const text = res.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");

    // JSON抽出
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;
    const parsed = JSON.parse(match[0]) as {
      total_amount: number | null;
      vendor: string | null;
      date: string | null;
      note: string | null;
    };

    const parts: string[] = [];
    if (parsed.vendor) parts.push(`店舗: ${parsed.vendor}`);
    if (parsed.total_amount !== null) parts.push(`領収額: ¥${parsed.total_amount.toLocaleString()}`);
    if (parsed.date) parts.push(`領収日: ${parsed.date}`);
    if (parsed.note) parts.push(`備考: ${parsed.note}`);

    return {
      ocrAmount: parsed.total_amount,
      ocrVendor: parsed.vendor,
      summary: parts.join(" / ") || "読取不能",
    };
  } catch (err) {
    console.error("[kei-check] OCR failed:", err);
    return null;
  }
}

export async function runKeiCheck(
  claim: Pick<
    ExpenseClaim,
    "id" | "user_id" | "claim_date" | "category" | "amount" | "receipt_path"
  >,
): Promise<KeiCheckResult> {
  const reasons: string[] = [];
  let level: "ok" | "warn" | "ng" = "ok";

  // 1. 相場チェック
  const market = checkMarketRange(claim.category, claim.amount);
  if (market.level !== "ok") {
    reasons.push(market.msg);
    level = market.level;
  }

  // 2. 重複チェック
  const dupIds = await findDuplicates({
    id: claim.id,
    userId: claim.user_id,
    claimDate: claim.claim_date,
    category: claim.category,
    amount: claim.amount,
  });
  if (dupIds.length > 0) {
    reasons.push(`類似申請あり（ID: ${dupIds.join(", ")}）。重複の可能性を確認してください`);
    if (level === "ok") level = "warn";
  }

  // 3. OCR（領収書ありの場合）
  let ocrAmount: number | null = null;
  let ocrVendor: string | null = null;
  if (claim.receipt_path) {
    const ocr = await ocrReceipt(claim.receipt_path, claim.amount);
    if (ocr) {
      ocrAmount = ocr.ocrAmount;
      ocrVendor = ocr.ocrVendor;
      if (ocr.ocrAmount !== null) {
        const diff = Math.abs(ocr.ocrAmount - claim.amount);
        const diffRate = diff / claim.amount;
        if (diffRate > 0.02 && diff > 10) {
          reasons.push(
            `申請金額¥${claim.amount.toLocaleString()}と領収書金額¥${ocr.ocrAmount.toLocaleString()}に差異（¥${diff.toLocaleString()}）`,
          );
          level = level === "ok" ? "warn" : level;
        } else {
          reasons.push(`領収書OCR一致: ${ocr.summary}`);
        }
      } else {
        reasons.push(`領収書OCR: ${ocr.summary}`);
      }
    }
  } else {
    reasons.push("領収書未添付");
    if (level === "ok") level = "warn";
  }

  // 4. 信頼度（簡易: warn/ng要因の数から算出）
  const confidence =
    level === "ok" ? 0.95 : level === "warn" ? 0.65 : 0.3;

  return {
    status: level,
    reason: reasons.join(" / "),
    confidence,
    details: {
      ocrAmount,
      ocrVendor,
      marketCheck: market.msg,
      duplicateIds: dupIds,
    },
  };
}
