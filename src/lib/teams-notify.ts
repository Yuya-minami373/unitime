// Teams通知: 既存の Vercel Teams プロキシ経由で投稿
// POST https://unipoll-teams-proxy.vercel.app/api/teams-post

const PROXY_URL =
  process.env.TEAMS_PROXY_URL ??
  "https://unipoll-teams-proxy.vercel.app/api/teams-post";

const DEFAULT_CHANNEL = process.env.UNITIME_TEAMS_CHANNEL ?? "claude_keiri";

export type TeamsChannel =
  | "claude_keiei"
  | "claude_senkan"
  | "claude_gijiroku"
  | "claude_hisho"
  | "claude_keiri"
  | "claude_cfo";

export type TeamsPostPayload = {
  channel?: TeamsChannel;
  title: string;
  message: string; // HTML可
  mention?: boolean;
};

export async function postToTeams(payload: TeamsPostPayload): Promise<boolean> {
  const apiKey = process.env.TEAMS_PROXY_API_KEY;
  if (!apiKey) {
    console.warn("[teams-notify] TEAMS_PROXY_API_KEY not set, skipping notification");
    return false;
  }
  try {
    const res = await fetch(PROXY_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
      },
      body: JSON.stringify({
        channel: payload.channel ?? DEFAULT_CHANNEL,
        title: payload.title,
        message: payload.message,
        mention: payload.mention ?? true,
      }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.error(`[teams-notify] ${res.status}: ${text.slice(0, 200)}`);
      return false;
    }
    return true;
  } catch (err) {
    console.error("[teams-notify] post failed:", err);
    return false;
  }
}

// --- 立替精算用ヘルパー ---

function formatYen(n: number): string {
  return `¥${n.toLocaleString("ja-JP")}`;
}

export async function notifyExpenseCreated(args: {
  id: number;
  userName: string;
  category: string;
  amount: number;
  purpose: string;
  claimDate: string;
  aiStatus?: "ok" | "warn" | "ng" | null;
  aiReason?: string | null;
  appBaseUrl?: string;
}): Promise<boolean> {
  const base = args.appBaseUrl ?? process.env.APP_BASE_URL ?? "";
  const url = base ? `${base}/admin/expenses` : "/admin/expenses";

  const aiBadge = args.aiStatus
    ? args.aiStatus === "ok"
      ? "✅ AI: 問題なし"
      : args.aiStatus === "warn"
      ? "⚠️ AI: 要確認"
      : "🚨 AI: 疑義あり"
    : "";

  const message = `
<b>${args.userName}</b> さんから立替精算の申請が届きました。
<br><br>
<b>申請日</b>: ${args.claimDate}<br>
<b>カテゴリ</b>: ${args.category}<br>
<b>金額</b>: ${formatYen(args.amount)}<br>
<b>用途</b>: ${args.purpose}
${aiBadge ? `<br><br>${aiBadge}${args.aiReason ? `<br><i>${args.aiReason}</i>` : ""}` : ""}
<br><br>
承認画面: <a href="${url}">${url}</a>
  `.trim();

  return await postToTeams({
    title: `💸 立替精算 申請（${args.userName} / ${formatYen(args.amount)}）`,
    message,
    mention: true,
  });
}

export async function notifyExpenseApproved(args: {
  id: number;
  userName: string;
  approverName: string;
  amount: number;
  category: string;
}): Promise<boolean> {
  const message = `
<b>${args.userName}</b> さんの立替精算を <b>${args.approverName}</b> が承認しました（振込完了扱い）。
<br><br>
<b>カテゴリ</b>: ${args.category}<br>
<b>金額</b>: ${formatYen(args.amount)}
  `.trim();

  return await postToTeams({
    title: `✅ 立替精算 承認=振込完了（${args.userName} / ${formatYen(args.amount)}）`,
    message,
    mention: false,
  });
}

export async function notifyExpenseRejected(args: {
  id: number;
  userName: string;
  approverName: string;
  amount: number;
  category: string;
  reason: string;
}): Promise<boolean> {
  const message = `
<b>${args.userName}</b> さんの立替精算が <b>${args.approverName}</b> により却下されました。
<br><br>
<b>カテゴリ</b>: ${args.category}<br>
<b>金額</b>: ${formatYen(args.amount)}<br>
<b>却下理由</b>: ${args.reason}
  `.trim();

  return await postToTeams({
    title: `❌ 立替精算 却下（${args.userName} / ${formatYen(args.amount)}）`,
    message,
    mention: false,
  });
}
