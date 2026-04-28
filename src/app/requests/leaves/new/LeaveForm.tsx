"use client";

import { useState } from "react";
import { Send } from "lucide-react";
import {
  DURATION_TYPES,
  LEAVE_TYPES,
  hoursFromTimeRange,
  formatDays,
  type SpecialLeavePolicy,
  type LeaveBalance,
} from "@/lib/leaves";

type Action = (formData: FormData) => void | Promise<void>;

// 所定 9:15-17:15 / 休憩 12:00-13:00
// 基本は :15 刻み、休憩境界に合わせて 12:00 と 13:00 を例外で追加
const HOUR_OPTIONS = [
  "9:15",
  "10:15",
  "11:15",
  "12:00",
  "13:00",
  "13:15",
  "14:15",
  "15:15",
  "16:15",
  "17:15",
];

export function LeaveForm({
  policies,
  balances,
  action,
}: {
  policies: SpecialLeavePolicy[];
  balances: { paid?: LeaveBalance; special?: LeaveBalance };
  action: Action;
}) {
  const [leaveType, setLeaveType] = useState("paid");
  const [durationType, setDurationType] = useState("full");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");

  const isSpecial = leaveType === "special";
  const isHourly = durationType === "hourly";

  // 時間休は単日のみ → start_date を end_date にも反映
  function handleStartChange(value: string) {
    setStartDate(value);
    if (isHourly || !endDate || endDate < value) {
      setEndDate(value);
    }
  }

  function handleDurationChange(value: string) {
    setDurationType(value);
    if (value === "hourly") {
      setEndDate(startDate);
    } else {
      // 終日に戻したら時刻はクリア
      setStartTime("");
      setEndTime("");
    }
  }

  const computedHours = isHourly ? hoursFromTimeRange(startTime, endTime) : 0;
  const hoursLabel = computedHours > 0
    ? Number.isInteger(computedHours)
      ? `${computedHours}時間`
      : `${computedHours.toFixed(1)}時間`
    : null;

  const currentBalance =
    leaveType === "paid"
      ? balances.paid
      : leaveType === "special"
        ? balances.special
        : null;

  // 日付inputをクリック/フォーカスしたらカレンダーを開く
  function openDatePicker(
    e: React.SyntheticEvent<HTMLInputElement>,
  ) {
    const el = e.currentTarget;
    if (typeof el.showPicker === "function") {
      try {
        el.showPicker();
      } catch {
        // ユーザー操作起因でない場合に投げる例外は無視
      }
    }
  }

  return (
    <form action={action} className="grid grid-cols-1 gap-4 md:grid-cols-2">
      {currentBalance ? (
        <BalanceBanner
          title={leaveType === "paid" ? "年次有給休暇" : "特別休暇"}
          balance={currentBalance}
        />
      ) : (
        <div className="md:col-span-2 rounded-md border border-[var(--border-default)] bg-[var(--surface-subtle)] px-3 py-2 text-[12px] text-[var(--text-tertiary)]">
          {leaveTypeShortLabel(leaveType)}は残日数管理の対象外です（実日数で記録）。
        </div>
      )}
      <Field label="休暇種別" required>
        <select
          name="leave_type"
          value={leaveType}
          onChange={(e) => setLeaveType(e.target.value)}
          required
          className="u-input"
        >
          {LEAVE_TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
      </Field>

      {isSpecial && (
        <Field label="特別休暇の事由" required>
          <select name="special_policy_code" required className="u-input">
            <option value="">選択してください</option>
            {policies.map((p) => (
              <option key={p.id} value={p.code}>
                {p.name}（規定 {p.default_days > 0 ? `${p.default_days}日` : "実日数"}）
              </option>
            ))}
          </select>
        </Field>
      )}

      <Field label="区分" required>
        <select
          name="duration_type"
          value={durationType}
          onChange={(e) => handleDurationChange(e.target.value)}
          required
          className="u-input"
        >
          {DURATION_TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
      </Field>

      <Field label="開始日" required>
        <input
          name="start_date"
          type="date"
          required
          value={startDate}
          onChange={(e) => handleStartChange(e.target.value)}
          onClick={openDatePicker}
          onFocus={openDatePicker}
          className="u-input cursor-pointer"
        />
      </Field>

      <Field
        label="終了日"
        required
        hint={isHourly ? "時間休は単日のみ" : "終日休のみ複数日可"}
      >
        <input
          name="end_date"
          type="date"
          required
          value={endDate}
          onChange={(e) => setEndDate(e.target.value)}
          onClick={openDatePicker}
          onFocus={openDatePicker}
          disabled={isHourly}
          className="u-input cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
        />
      </Field>

      {isHourly && (
        <>
          <Field label="開始時刻" required hint="所定 9:15〜17:15">
            <select
              name="start_time"
              required
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              className="u-input"
            >
              <option value="">選択してください</option>
              {HOUR_OPTIONS.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </Field>

          <Field label="終了時刻" required hint="開始より後">
            <select
              name="end_time"
              required
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
              className="u-input"
            >
              <option value="">選択してください</option>
              {HOUR_OPTIONS.map((t) => (
                <option key={t} value={t} disabled={!!startTime && t <= startTime}>
                  {t}
                </option>
              ))}
            </select>
          </Field>

          <div className="md:col-span-2">
            <div className="rounded-md border border-[var(--border-default)] bg-[var(--surface-subtle)] px-3 py-2 text-[12px] text-[var(--text-secondary)]">
              {hoursLabel ? (
                <>
                  消化時間: <span className="font-semibold text-[var(--text-primary)]">{hoursLabel}</span>
                  <span className="ml-2 text-[11px] text-[var(--text-tertiary)]">
                    （休憩12:00-13:00控除済 / 7時間=1日換算）
                  </span>
                </>
              ) : (
                <span className="text-[var(--text-tertiary)]">
                  開始時刻と終了時刻を入力してください
                </span>
              )}
            </div>
          </div>
        </>
      )}

      <div className="md:col-span-2">
        <Field label="理由・備考" hint="承認者に共有する情報">
          <textarea
            name="reason"
            className="u-input min-h-[80px]"
            placeholder={
              isSpecial
                ? "例: 配偶者の出産に伴う休暇"
                : "例: 私用のため / 通院のため"
            }
          />
        </Field>
      </div>

      <div className="md:col-span-2">
        <button type="submit" className="u-btn u-btn-primary">
          <Send size={14} strokeWidth={1.75} />
          申請する
        </button>
      </div>
    </form>
  );
}

function BalanceBanner({
  title,
  balance,
}: {
  title: string;
  balance: LeaveBalance;
}) {
  const expired = balance.expired_days ?? 0;
  const hasNote = balance.pending_days > 0 || expired > 0;
  return (
    <div className="md:col-span-2 rounded-md border border-[var(--border-brand)] bg-[var(--brand-50)] px-3 py-2.5">
      <div className="mb-2 text-[11px] font-medium text-[var(--text-secondary)]">
        {title}
      </div>
      <div className="grid grid-cols-3 divide-x divide-[var(--border-brand)] text-center">
        <BalanceMetric
          label="残日数"
          value={formatDays(balance.remaining_days)}
          emphasis
        />
        <BalanceMetric
          label="付与累計"
          value={formatDays(balance.granted_days)}
        />
        <BalanceMetric
          label="使用"
          value={formatDays(balance.used_days)}
        />
      </div>
      {hasNote && (
        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] tabular-nums">
          {balance.pending_days > 0 && (
            <span className="text-amber-700">
              申請中 {formatDays(balance.pending_days)}
            </span>
          )}
          {expired > 0 && (
            <span className="text-rose-600">
              期限切れ {formatDays(expired)}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

function BalanceMetric({
  label,
  value,
  emphasis,
}: {
  label: string;
  value: string;
  emphasis?: boolean;
}) {
  return (
    <div className="px-2">
      <div className="text-[10px] text-[var(--text-tertiary)]">{label}</div>
      <div
        className={
          emphasis
            ? "mt-0.5 text-[20px] font-semibold tabular-nums tracking-tight text-[var(--text-primary)]"
            : "mt-0.5 text-[14px] font-medium tabular-nums text-[var(--text-secondary)]"
        }
      >
        {value}
      </div>
    </div>
  );
}

function leaveTypeShortLabel(type: string): string {
  switch (type) {
    case "compensatory":
      return "代休";
    case "substitute":
      return "振替休日";
    case "unpaid":
      return "無給休暇";
    default:
      return "この休暇";
  }
}

function Field({
  label,
  required,
  hint,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-[12px] font-medium text-[var(--text-secondary)]">
        {label}
        {required && (
          <span className="ml-0.5 text-[var(--accent-indigo)]">*</span>
        )}
        {hint && (
          <span className="ml-1.5 text-[11px] font-normal text-[var(--text-tertiary)]">
            {hint}
          </span>
        )}
      </label>
      {children}
    </div>
  );
}
