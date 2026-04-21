"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Upload, AlertCircle } from "lucide-react";
import { EXPENSE_CATEGORIES, type ExpenseCategory } from "@/lib/expenses";
import { createExpenseAction } from "../actions";

type Props = {
  initialDate: string;
  initialError?: string;
};

export default function ExpenseForm({ initialDate, initialError }: Props) {
  const router = useRouter();
  const [category, setCategory] = useState<ExpenseCategory>("交通費");
  const [error, setError] = useState<string | null>(initialError ?? null);
  const [isPending, startTransition] = useTransition();
  const [fileName, setFileName] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      const res = await createExpenseAction(formData);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      router.push(`/expenses?new=${res.id}`);
      router.refresh();
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <Link
        href="/expenses"
        className="inline-flex items-center gap-1 text-[13px] text-[var(--text-tertiary)] transition-colors hover:text-[var(--text-primary)]"
      >
        <ArrowLeft size={14} strokeWidth={1.75} />
        一覧へ戻る
      </Link>

      {error && (
        <div className="flex items-start gap-2 rounded-[8px] border border-rose-200 bg-rose-50 px-4 py-3 text-[13px] text-rose-700">
          <AlertCircle size={16} strokeWidth={1.75} className="mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="u-card space-y-5 p-5 md:p-6">
        {/* 日付 + カテゴリ */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field label="申請日" required>
            <input
              type="date"
              name="claim_date"
              defaultValue={initialDate}
              required
              className="u-input"
            />
          </Field>
          <Field label="カテゴリ" required>
            <select
              name="category"
              value={category}
              onChange={(e) => setCategory(e.target.value as ExpenseCategory)}
              className="u-input"
              required
            >
              {EXPENSE_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </Field>
        </div>

        {/* 金額 */}
        <Field label="金額（円）" required>
          <div className="relative">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[14px] text-[var(--text-tertiary)]">
              ¥
            </span>
            <input
              type="text"
              inputMode="numeric"
              name="amount"
              placeholder="1,200"
              required
              className="u-input tabular-nums"
              style={{ paddingLeft: "28px" }}
            />
          </div>
        </Field>

        {/* 交通費: 経路 */}
        {category === "交通費" && (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Field label="出発地" required>
              <input
                type="text"
                name="route_from"
                placeholder="例: 自宅"
                required
                className="u-input"
              />
            </Field>
            <Field label="到着地" required>
              <input
                type="text"
                name="route_to"
                placeholder="例: 深谷市役所"
                required
                className="u-input"
              />
            </Field>
          </div>
        )}

        {/* 用途 */}
        <Field label="用途・目的" required>
          <textarea
            name="purpose"
            rows={3}
            placeholder="例: 深谷市選管との定例MTG参加"
            required
            className="u-input resize-y"
          />
        </Field>

        {/* 案件名（任意） */}
        <Field label="案件名（任意）" hint="Phase3で案件マスタから選択予定">
          <input
            type="text"
            name="project_name"
            placeholder="例: 深谷市Opsデザイン"
            className="u-input"
          />
        </Field>

        {/* 領収書 */}
        <Field label="領収書" hint="jpg / png / pdf / heic / webp（10MBまで）">
          <label className="flex cursor-pointer items-center justify-center gap-2 rounded-[8px] border-2 border-dashed border-[var(--border-brand)] bg-[var(--brand-50)]/50 px-4 py-5 text-[13px] text-[var(--text-tertiary)] transition-colors hover:bg-[var(--brand-50)]">
            <Upload size={16} strokeWidth={1.75} />
            <span>
              {fileName ?? "クリックまたはドラッグして領収書をアップロード"}
            </span>
            <input
              type="file"
              name="receipt"
              accept="image/*,application/pdf"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                setFileName(f ? f.name : null);
              }}
            />
          </label>
        </Field>

        {/* 備考 */}
        <Field label="備考（任意）">
          <textarea
            name="notes"
            rows={2}
            placeholder="補足事項があれば記入"
            className="u-input resize-y"
          />
        </Field>
      </div>

      <div className="flex items-center justify-end gap-3">
        <Link href="/expenses" className="u-btn u-btn-secondary">
          キャンセル
        </Link>
        <button
          type="submit"
          disabled={isPending}
          className="u-btn u-btn-primary disabled:opacity-60"
        >
          {isPending ? "送信中…" : "申請する"}
        </button>
      </div>
    </form>
  );
}

function Field({
  label,
  hint,
  required,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline gap-2">
        <label className="text-[12px] font-semibold text-[var(--text-secondary)]">
          {label}
          {required && <span className="ml-1 text-rose-500">*</span>}
        </label>
        {hint && (
          <span className="text-[11px] text-[var(--text-quaternary)]">{hint}</span>
        )}
      </div>
      {children}
    </div>
  );
}
