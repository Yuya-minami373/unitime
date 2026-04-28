"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Lock } from "lucide-react";

export default function CloseMonthButton({
  targetMonth,
}: {
  targetMonth: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function handleClose() {
    if (
      !confirm(
        `${targetMonth} を月締めします。\n\n締め後は当該月の打刻・申請が編集ロックされます。\n例外修正には締め解除（owner権限）が必要です。\n\n実行しますか？`,
      )
    )
      return;
    setBusy(true);
    try {
      const res = await fetch("/api/admin/monthly-close", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target_month: targetMonth }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        alert(data.error ?? "月締めに失敗しました");
        return;
      }
      alert(`${targetMonth} を締めました。スナップショットを保存しました。`);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleClose}
      disabled={busy}
      className="u-btn u-btn-primary"
    >
      <Lock size={14} strokeWidth={1.75} />
      {busy ? "締め処理中…" : `${targetMonth} を締める`}
    </button>
  );
}
