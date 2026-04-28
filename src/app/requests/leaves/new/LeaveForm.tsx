"use client";

import { useState } from "react";
import { Send } from "lucide-react";
import {
  DURATION_TYPES,
  LEAVE_TYPES,
  hoursFromTimeRange,
  type SpecialLeavePolicy,
} from "@/lib/leaves";

type Action = (formData: FormData) => void | Promise<void>;

export function LeaveForm({
  policies,
  action,
}: {
  policies: SpecialLeavePolicy[];
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

  return (
    <form action={action} className="grid grid-cols-1 gap-4 md:grid-cols-2">
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
          className="u-input"
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
          disabled={isHourly}
          className="u-input disabled:opacity-50"
        />
      </Field>

      {isHourly && (
        <>
          <Field label="開始時刻" required hint="1時間単位">
            <input
              name="start_time"
              type="time"
              step={3600}
              required
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              className="u-input"
            />
          </Field>

          <Field label="終了時刻" required hint="開始より後">
            <input
              name="end_time"
              type="time"
              step={3600}
              required
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
              className="u-input"
            />
          </Field>

          <div className="md:col-span-2">
            <div className="rounded-md border border-[var(--border-default)] bg-[var(--surface-subtle)] px-3 py-2 text-[12px] text-[var(--text-secondary)]">
              {hoursLabel ? (
                <>
                  消化時間: <span className="font-semibold text-[var(--text-primary)]">{hoursLabel}</span>
                  <span className="ml-2 text-[11px] text-[var(--text-tertiary)]">
                    （8時間=1日換算）
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
