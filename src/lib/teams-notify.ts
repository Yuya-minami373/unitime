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

// --- Phase B #4: 36協定遵守監視 通知ヘルパー ---

function formatHours(minutes: number): string {
  return (minutes / 60).toFixed(1);
}

export type SanrokuThresholdLevel = "caution" | "warning" | "critical";

export async function notifyOvertimeThreshold(args: {
  userName: string;
  level: SanrokuThresholdLevel;
  overtimeMinutes: number;
  year: number;
  month: number;
  appBaseUrl?: string;
}): Promise<boolean> {
  const base = args.appBaseUrl ?? process.env.APP_BASE_URL ?? "";
  const url = base ? `${base}/admin/sanroku` : "/admin/sanroku";
  const labelMap = {
    caution: { emoji: "🟡", label: "30h到達（注意）", limit: "45h" },
    warning: { emoji: "🟠", label: "40h到達（警告）", limit: "45h" },
    critical: { emoji: "🔴", label: "45h到達（協定上限到達）", limit: "45h" },
  } as const;
  const { emoji, label, limit } = labelMap[args.level];

  const note =
    args.level === "critical"
      ? "<br><br>⚠️ 36協定の月時間外労働上限に到達しました。これ以上の残業は協定違反となるため、本日以降の残業を停止してください。"
      : args.level === "warning"
        ? "<br><br>⚠️ 残り時間外余力が5時間を切りました。月末までの稼働見込みを確認してください。"
        : "";

  const message = `
<b>${args.userName}</b> さんの ${args.year}年${args.month}月の時間外労働が ${labelMap[args.level].label} に達しました。
<br><br>
<b>当月時間外</b>: ${formatHours(args.overtimeMinutes)}h / ${limit}<br>
<b>協定有効期間</b>: 2026/1/16 〜 2027/1/15（特別条項なし）${note}
<br><br>
詳細: <a href="${url}">${url}</a>
  `.trim();

  return await postToTeams({
    title: `${emoji} 36協定 時間外労働${args.level === "critical" ? "違反" : "警告"}（${args.userName} / ${formatHours(args.overtimeMinutes)}h）`,
    message,
    mention: args.level !== "caution",
  });
}

export async function notifyHolidayWorkViolation(args: {
  userName: string;
  year: number;
  month: number;
  totalDays: number;
  dates: string[];
  appBaseUrl?: string;
}): Promise<boolean> {
  const base = args.appBaseUrl ?? process.env.APP_BASE_URL ?? "";
  const url = base ? `${base}/admin/sanroku` : "/admin/sanroku";

  const message = `
<b>${args.userName}</b> さんの ${args.year}年${args.month}月の休日労働が <b>${args.totalDays}回</b> となり、36協定の上限（月1回）を超過しました。
<br><br>
<b>休日労働日</b>: ${args.dates.join(", ")}<br>
<b>協定上限</b>: 土日祝・月1回・9:00-17:00（特別条項なし）
<br><br>
⚠️ 即座に対応が必要です。詳細: <a href="${url}">${url}</a>
  `.trim();

  return await postToTeams({
    title: `🚨 36協定 休日労働違反（${args.userName} / ${args.totalDays}回）`,
    message,
    mention: true,
  });
}

export async function notifyHolidayWorkOutOfHours(args: {
  userName: string;
  date: string;
  clockIn: string | null;
  clockOut: string | null;
  appBaseUrl?: string;
}): Promise<boolean> {
  const base = args.appBaseUrl ?? process.env.APP_BASE_URL ?? "";
  const url = base ? `${base}/admin/sanroku` : "/admin/sanroku";

  const inLabel = args.clockIn ? args.clockIn.slice(11, 16) : "—";
  const outLabel = args.clockOut ? args.clockOut.slice(11, 16) : "—";

  const message = `
<b>${args.userName}</b> さんの ${args.date} の休日打刻が、協定で定める時間帯（9:00-17:00）の枠外で記録されました。
<br><br>
<b>出勤</b>: ${inLabel}<br>
<b>退勤</b>: ${outLabel}<br>
<b>協定上限</b>: 土日祝・月1回・9:00-17:00
<br><br>
詳細: <a href="${url}">${url}</a>
  `.trim();

  return await postToTeams({
    title: `⚠️ 36協定 休日労働 時間帯外（${args.userName} / ${args.date}）`,
    message,
    mention: true,
  });
}

export async function notifyMonthlyTotalCaution(args: {
  userName: string;
  year: number;
  month: number;
  totalMinutes: number;
  appBaseUrl?: string;
}): Promise<boolean> {
  const base = args.appBaseUrl ?? process.env.APP_BASE_URL ?? "";
  const url = base ? `${base}/admin/sanroku` : "/admin/sanroku";

  const message = `
<b>${args.userName}</b> さんの ${args.year}年${args.month}月の時間外+休日労働の合計が <b>80h</b> に到達しました。
<br><br>
<b>合算</b>: ${formatHours(args.totalMinutes)}h / 100h（法定義務上限）<br>
<b>法定義務</b>: 月100h未満（特別条項なし協定でも遵守必須）
<br><br>
⚠️ このまま増加すると100h超で違反となります。詳細: <a href="${url}">${url}</a>
  `.trim();

  return await postToTeams({
    title: `⚠️ 36協定 月100h予兆（${args.userName} / ${formatHours(args.totalMinutes)}h）`,
    message,
    mention: true,
  });
}
