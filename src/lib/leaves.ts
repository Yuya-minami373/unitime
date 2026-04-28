// 休暇申請のヘルパー（Phase B #2-A）
// - 残日数 = SUM(grants) - SUM(approved requests in days)
// - 半休 = 0.5日 / 時間休 = hours / 8 / 終日 = end - start + 1 (暦日カウント・MVP)

import { dbAll, dbGet } from "./db";

export const LEAVE_TYPES = [
  { value: "paid", label: "年次有給休暇" },
  { value: "special", label: "特別休暇" },
  { value: "compensatory", label: "代休" },
  { value: "substitute", label: "振替休日" },
  { value: "unpaid", label: "無給休暇" },
] as const;

export type LeaveType = (typeof LEAVE_TYPES)[number]["value"];

// 新規申請で選択可能な区分
export const DURATION_TYPES = [
  { value: "full", label: "終日" },
  { value: "hourly", label: "時間休" },
] as const;

export type DurationType = (typeof DURATION_TYPES)[number]["value"];

// 表示専用ラベル（過去の half_am / half_pm レコードの互換表示用）
const LEGACY_DURATION_LABELS: Record<string, string> = {
  half_am: "午前半休",
  half_pm: "午後半休",
};

export const STATUS_LABEL: Record<string, string> = {
  pending: "承認待ち",
  approved: "承認済",
  rejected: "却下",
  cancelled: "取消",
};

export type LeaveRequest = {
  id: number;
  user_id: number;
  leave_type: LeaveType;
  special_policy_code: string | null;
  start_date: string;
  end_date: string;
  duration_type: DurationType;
  hours_used: number | null;
  start_time: string | null;
  end_time: string | null;
  reason: string | null;
  status: string;
  approver_id: number | null;
  approved_at: string | null;
  rejection_reason: string | null;
  created_at: string;
};

export type LeaveGrant = {
  id: number;
  user_id: number;
  leave_type: LeaveType;
  special_policy_code: string | null;
  granted_days: number;
  granted_at: string;
  source: string;
  notes: string | null;
};

export type SpecialLeavePolicy = {
  id: number;
  code: string;
  name: string;
  default_days: number;
  description: string | null;
  is_active: number;
  display_order: number;
};

// 申請1件の消費日数を計算
// 暦日カウント（土日含む）。MVP簡略化、運用で土日を含む申請は分割推奨
// 過去データ互換: half_am/half_pm は 0.5日換算
export function requestToDays(req: {
  start_date: string;
  end_date: string;
  duration_type: string;
  hours_used: number | null;
}): number {
  if (req.duration_type === "half_am" || req.duration_type === "half_pm") {
    return 0.5;
  }
  if (req.duration_type === "hourly") {
    return Math.max(0, (req.hours_used ?? 0) / 8);
  }
  // full: 期間日数
  const startMs = Date.parse(`${req.start_date}T00:00:00+09:00`);
  const endMs = Date.parse(`${req.end_date}T00:00:00+09:00`);
  if (Number.isNaN(startMs) || Number.isNaN(endMs) || endMs < startMs) return 0;
  return Math.round((endMs - startMs) / 86400000) + 1;
}

// HH:MM × 2 から時間数を返す。end <= start や不正値は 0 を返す
export function hoursFromTimeRange(
  start: string | null | undefined,
  end: string | null | undefined,
): number {
  if (!start || !end) return 0;
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  if ([sh, sm, eh, em].some((n) => Number.isNaN(n))) return 0;
  const startMin = sh * 60 + sm;
  const endMin = eh * 60 + em;
  if (endMin <= startMin) return 0;
  return (endMin - startMin) / 60;
}

// 残日数集計（leave_type 別）
// 申請ステータスは approved + pending を「コミット済」「保留中」として別々に返す
export type LeaveBalance = {
  leave_type: string;
  granted_days: number;       // 有効な付与（時効未到達）の合計
  expired_days: number;       // 時効消滅した付与の合計（労基115条 2年）
  used_days: number;          // approved
  pending_days: number;       // pending
  remaining_days: number;     // granted - used
};

// asOf 日の2年前を YYYY-MM-DD で返す（時効境界。境界日を含むかは実装で「以後」とする）
function twoYearsAgo(asOfDate: string): string {
  const [y, m, d] = asOfDate.split("-").map(Number);
  const dt = new Date(Date.UTC(y!, m! - 1, d!));
  dt.setUTCFullYear(dt.getUTCFullYear() - 2);
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
}

export async function calcBalanceForUser(
  userId: number,
  asOfDate: string = new Date().toISOString().slice(0, 10),
): Promise<Record<string, LeaveBalance>> {
  const grants = await dbAll<LeaveGrant>(
    `SELECT id, user_id, leave_type, special_policy_code, granted_days, granted_at, source, notes
     FROM leave_grants
     WHERE user_id = ?`,
    [userId],
  );
  const requests = await dbAll<LeaveRequest>(
    `SELECT id, user_id, leave_type, special_policy_code, start_date, end_date,
            duration_type, hours_used, status
     FROM leave_requests
     WHERE user_id = ? AND status IN ('approved', 'pending')`,
    [userId],
  );

  // 時効境界（2年前以後の付与のみ有効。労基115条）
  // 'paid' のみ時効適用。特別休暇・代休・振休・無給はその場利用なので時効なし
  const expiryThreshold = twoYearsAgo(asOfDate);

  const balances: Record<string, LeaveBalance> = {};
  for (const g of grants) {
    if (!balances[g.leave_type]) {
      balances[g.leave_type] = {
        leave_type: g.leave_type,
        granted_days: 0,
        expired_days: 0,
        used_days: 0,
        pending_days: 0,
        remaining_days: 0,
      };
    }
    const isExpired = g.leave_type === "paid" && g.granted_at < expiryThreshold;
    if (isExpired) {
      balances[g.leave_type]!.expired_days += g.granted_days;
    } else {
      balances[g.leave_type]!.granted_days += g.granted_days;
    }
  }

  for (const r of requests) {
    const days = requestToDays(r);
    if (!balances[r.leave_type]) {
      balances[r.leave_type] = {
        leave_type: r.leave_type,
        granted_days: 0,
        expired_days: 0,
        used_days: 0,
        pending_days: 0,
        remaining_days: 0,
      };
    }
    if (r.status === "approved") balances[r.leave_type]!.used_days += days;
    else if (r.status === "pending") balances[r.leave_type]!.pending_days += days;
  }

  for (const b of Object.values(balances)) {
    b.remaining_days = b.granted_days - b.used_days;
  }

  return balances;
}

// 法定有給の付与表（労基39条）
// 入社からの経過年数 → 付与日数（週5日・週30h以上勤務想定。MVPは正社員のみ対応）
const PAID_LEAVE_TABLE: Array<{ yearsAfterHire: number; days: number }> = [
  { yearsAfterHire: 0.5, days: 10 },
  { yearsAfterHire: 1.5, days: 11 },
  { yearsAfterHire: 2.5, days: 12 },
  { yearsAfterHire: 3.5, days: 14 },
  { yearsAfterHire: 4.5, days: 16 },
  { yearsAfterHire: 5.5, days: 18 },
  { yearsAfterHire: 6.5, days: 20 },
];

// hire_date から付与スケジュールを生成
// asOf までに付与されるべき grant 配列（granted_at と days）を返す
export function paidLeaveScheduleFromHireDate(
  hireDate: string,
  asOfDate: string = new Date().toISOString().slice(0, 10),
): Array<{ granted_at: string; days: number }> {
  const result: Array<{ granted_at: string; days: number }> = [];
  if (!hireDate) return result;

  const hire = new Date(`${hireDate}T00:00:00+09:00`);
  const asOf = new Date(`${asOfDate}T00:00:00+09:00`);
  if (Number.isNaN(hire.getTime()) || Number.isNaN(asOf.getTime())) return result;

  for (const row of PAID_LEAVE_TABLE) {
    const grantDate = new Date(hire);
    // 月単位加算: row.yearsAfterHire * 12 ヶ月後
    grantDate.setMonth(grantDate.getMonth() + Math.round(row.yearsAfterHire * 12));
    if (grantDate > asOf) break;
    const ymd = `${grantDate.getFullYear()}-${String(grantDate.getMonth() + 1).padStart(2, "0")}-${String(grantDate.getDate()).padStart(2, "0")}`;
    result.push({ granted_at: ymd, days: row.days });
  }

  // 6.5年以降は毎年20日付与
  const last = result[result.length - 1];
  if (last && last.days === 20) {
    let nextDate = new Date(`${last.granted_at}T00:00:00+09:00`);
    while (true) {
      nextDate.setFullYear(nextDate.getFullYear() + 1);
      if (nextDate > asOf) break;
      const ymd = `${nextDate.getFullYear()}-${String(nextDate.getMonth() + 1).padStart(2, "0")}-${String(nextDate.getDate()).padStart(2, "0")}`;
      result.push({ granted_at: ymd, days: 20 });
    }
  }

  return result;
}

// 次回付与予定（asOf 以後の最も早い付与）
export function nextPaidLeaveGrant(
  hireDate: string,
  asOfDate: string = new Date().toISOString().slice(0, 10),
): { granted_at: string; days: number } | null {
  if (!hireDate) return null;
  const hire = new Date(`${hireDate}T00:00:00+09:00`);
  const asOf = new Date(`${asOfDate}T00:00:00+09:00`);
  if (Number.isNaN(hire.getTime()) || Number.isNaN(asOf.getTime())) return null;

  for (const row of PAID_LEAVE_TABLE) {
    const grantDate = new Date(hire);
    grantDate.setMonth(grantDate.getMonth() + Math.round(row.yearsAfterHire * 12));
    if (grantDate > asOf) {
      const ymd = `${grantDate.getFullYear()}-${String(grantDate.getMonth() + 1).padStart(2, "0")}-${String(grantDate.getDate()).padStart(2, "0")}`;
      return { granted_at: ymd, days: row.days };
    }
  }

  // 6.5年以降は毎年20日
  const lastBase = new Date(hire);
  lastBase.setMonth(lastBase.getMonth() + 6.5 * 12);
  let cursor = new Date(lastBase);
  while (cursor <= asOf) cursor.setFullYear(cursor.getFullYear() + 1);
  const ymd = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}-${String(cursor.getDate()).padStart(2, "0")}`;
  return { granted_at: ymd, days: 20 };
}

export async function listSpecialPolicies(): Promise<SpecialLeavePolicy[]> {
  return dbAll<SpecialLeavePolicy>(
    `SELECT id, code, name, default_days, description, is_active, display_order
     FROM special_leave_policies
     WHERE is_active = 1
     ORDER BY display_order, id`,
    [],
  );
}

export async function getSpecialPolicyByCode(
  code: string,
): Promise<SpecialLeavePolicy | null> {
  const r = await dbGet<SpecialLeavePolicy>(
    `SELECT id, code, name, default_days, description, is_active, display_order
     FROM special_leave_policies WHERE code = ?`,
    [code],
  );
  return r ?? null;
}

export function leaveTypeLabel(type: string): string {
  const found = LEAVE_TYPES.find((t) => t.value === type);
  return found?.label ?? type;
}

export function durationTypeLabel(type: string): string {
  const found = DURATION_TYPES.find((t) => t.value === type);
  if (found) return found.label;
  return LEGACY_DURATION_LABELS[type] ?? type;
}

export function formatDays(days: number): string {
  // 0.5の倍数や、時間休からの端数(0.125等)も綺麗に表示
  if (Number.isInteger(days)) return `${days}日`;
  // 1桁丸め
  return `${days.toFixed(1)}日`;
}
