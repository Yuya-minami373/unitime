"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, X } from "lucide-react";

export default function StampApprovalActions({
  requestId,
  userName,
}: {
  requestId: number;
  userName: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [showRejectForm, setShowRejectForm] = useState(false);
  const [rejectReason, setRejectReason] = useState("");

  async function handleApprove() {
    if (!confirm(`${userName} の打刻申請を承認します。よろしいですか？`)) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/stamp-requests/${requestId}/approve`, {
        method: "POST",
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        alert(data.error ?? "承認に失敗しました");
        return;
      }
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function handleReject() {
    if (rejectReason.trim().length < 3) {
      alert("却下理由を3文字以上で入力してください");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/stamp-requests/${requestId}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: rejectReason.trim() }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        alert(data.error ?? "却下に失敗しました");
        return;
      }
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  if (showRejectForm) {
    return (
      <div className="flex w-full shrink-0 flex-col gap-2 md:w-64">
        <textarea
          value={rejectReason}
          onChange={(e) => setRejectReason(e.target.value)}
          rows={3}
          placeholder="却下理由を入力（必須）"
          className="u-input w-full text-[12px]"
        />
        <div className="flex gap-2">
          <button
            type="button"
            onClick={handleReject}
            disabled={busy}
            className="u-btn flex-1 bg-rose-600 text-white hover:bg-rose-700 disabled:opacity-50"
          >
            却下する
          </button>
          <button
            type="button"
            onClick={() => setShowRejectForm(false)}
            disabled={busy}
            className="u-btn"
          >
            戻る
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex shrink-0 gap-2">
      <button
        type="button"
        onClick={handleApprove}
        disabled={busy}
        className="u-btn u-btn-primary"
      >
        <Check size={14} strokeWidth={1.75} />
        承認
      </button>
      <button
        type="button"
        onClick={() => setShowRejectForm(true)}
        disabled={busy}
        className="u-btn"
      >
        <X size={14} strokeWidth={1.75} />
        却下
      </button>
    </div>
  );
}
