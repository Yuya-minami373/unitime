"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Unlock } from "lucide-react";

export default function ReopenButton({
  targetMonth,
}: {
  targetMonth: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function handleReopen() {
    const reason = prompt(
      `${targetMonth} の締め解除には理由が必要です。\n\n理由を入力してください（3文字以上）`,
    );
    if (!reason || reason.trim().length < 3) return;

    if (
      !confirm(
        `${targetMonth} の月締めを解除します。\n\n他社員の確定数値も書込可能状態になります。\n影響範囲を周知してから実行してください。\n\n実行しますか？`,
      )
    )
      return;

    setBusy(true);
    try {
      const res = await fetch(`/api/admin/monthly-close/${targetMonth}/reopen`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: reason.trim() }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        alert(data.error ?? "解除に失敗しました");
        return;
      }
      alert(`${targetMonth} を解除しました`);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleReopen}
      disabled={busy}
      className="inline-flex items-center gap-1 rounded-[6px] border border-[var(--border-light)] px-2 py-1 text-[11.5px] text-[var(--text-secondary)] hover:bg-[var(--bg-subtle-alt)] disabled:opacity-50"
    >
      <Unlock size={11} strokeWidth={1.75} />
      解除
    </button>
  );
}
