"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, X, AlertCircle } from "lucide-react";
import { approveExpenseAction, rejectExpenseAction } from "@/app/expenses/actions";

type Props = {
  id: number;
  amount: number;
  userName: string;
};

export default function ApprovalActions({ id, amount, userName }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [showReject, setShowReject] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  function handleApprove() {
    const confirmed = window.confirm(
      `${userName}さんの申請（¥${amount.toLocaleString("ja-JP")}）を承認します。\n承認=振込完了として扱われます。よろしいですか？`,
    );
    if (!confirmed) return;

    setError(null);
    startTransition(async () => {
      const res = await approveExpenseAction(id);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      router.refresh();
    });
  }

  function handleReject() {
    if (!reason.trim()) {
      setError("却下理由を入力してください");
      return;
    }
    setError(null);
    startTransition(async () => {
      const res = await rejectExpenseAction(id, reason);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setShowReject(false);
      setReason("");
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col items-end gap-2">
      {error && (
        <div className="flex items-center gap-1 text-[11px] text-rose-600">
          <AlertCircle size={11} strokeWidth={2} />
          {error}
        </div>
      )}
      {showReject ? (
        <div className="flex flex-col items-end gap-1.5">
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="却下理由"
            rows={2}
            className="u-input w-[220px] text-[12px]"
            autoFocus
          />
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => {
                setShowReject(false);
                setReason("");
                setError(null);
              }}
              disabled={isPending}
              className="rounded-[6px] px-2 py-1 text-[11px] text-[var(--text-tertiary)] transition-colors hover:bg-[var(--bg-body)]"
            >
              キャンセル
            </button>
            <button
              type="button"
              onClick={handleReject}
              disabled={isPending}
              className="inline-flex items-center gap-1 rounded-[6px] border border-rose-200 bg-rose-50 px-2.5 py-1 text-[11px] font-medium text-rose-700 transition-colors hover:bg-rose-100 disabled:opacity-60"
            >
              却下確定
            </button>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setShowReject(true)}
            disabled={isPending}
            className="inline-flex items-center gap-1 rounded-[6px] border border-[var(--border-light)] bg-white px-2.5 py-1 text-[11px] font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-body)] disabled:opacity-60"
          >
            <X size={11} strokeWidth={2} />
            却下
          </button>
          <button
            type="button"
            onClick={handleApprove}
            disabled={isPending}
            className="inline-flex items-center gap-1 rounded-[6px] border border-emerald-300 bg-emerald-500 px-2.5 py-1 text-[11px] font-semibold text-white transition-colors hover:bg-emerald-600 disabled:opacity-60"
          >
            <Check size={11} strokeWidth={2.5} />
            {isPending ? "…" : "承認=振込"}
          </button>
        </div>
      )}
    </div>
  );
}
