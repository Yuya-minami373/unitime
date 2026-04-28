"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";

export default function CancelButton({ requestId }: { requestId: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function handleCancel() {
    if (!confirm("この申請を取消します。よろしいですか？")) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/stamp-requests/${requestId}/cancel`, {
        method: "POST",
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        alert(data.error ?? "取消に失敗しました");
        return;
      }
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleCancel}
      disabled={busy}
      className="flex shrink-0 items-center gap-1 rounded-[6px] border border-[var(--border-light)] px-2 py-1 text-[11.5px] text-[var(--text-secondary)] hover:bg-[var(--bg-subtle-alt)] disabled:opacity-50"
    >
      <X size={11} strokeWidth={1.75} />
      取消
    </button>
  );
}
