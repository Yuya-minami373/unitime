"use client";

import { useState } from "react";
import { Send } from "lucide-react";
import {
  DURATION_TYPES,
  LEAVE_TYPES,
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

  const isSpecial = leaveType === "special";
  const isHourly = durationType === "hourly";
  const isHalf = durationType === "half_am" || durationType === "half_pm";
  const isSingleDayOnly = isHourly || isHalf;

  // 半休/時間休は単日のみ → start_date を end_date にも反映
  function handleStartChange(value: string) {
    setStartDate(value);
    if (isSingleDayOnly || !endDate || endDate < value) {
      setEndDate(value);
    }
  }

  function handleDurationChange(value: string) {
    setDurationType(value);
    if (value === "hourly" || value === "half_am" || value === "half_pm") {
      setEndDate(startDate);
    }
  }

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

      {isHourly && (
        <Field label="時間数（h）" required hint="1時間単位推奨。8h=1日換算">
          <input
            name="hours_used"
            type="number"
            min="0.5"
            step="0.5"
            required
            className="u-input"
            placeholder="例: 2"
          />
        </Field>
      )}

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
        hint={isSingleDayOnly ? "半休/時間休は単日のみ" : "終日休のみ複数日可"}
      >
        <input
          name="end_date"
          type="date"
          required
          value={endDate}
          onChange={(e) => setEndDate(e.target.value)}
          disabled={isSingleDayOnly}
          className="u-input disabled:opacity-50"
        />
      </Field>

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
