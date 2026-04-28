"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";

type RecentRecord = {
  id: number;
  punch_type: string;
  punched_at: string;
  kind: string | null;
};

type Action = "add" | "modify" | "delete";
type PunchType = "clock_in" | "clock_out" | "break_start" | "break_end";

const PUNCH_OPTIONS: Array<{ value: PunchType; label: string }> = [
  { value: "clock_in", label: "出勤" },
  { value: "clock_out", label: "退勤" },
  { value: "break_start", label: "休憩開始" },
  { value: "break_end", label: "休憩終了" },
];

// 5分刻み 5:00-23:55 のプルダウン候補
const TIME_OPTIONS: string[] = [];
for (let h = 5; h < 24; h++) {
  for (let m = 0; m < 60; m += 5) {
    TIME_OPTIONS.push(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
  }
}

function formatTime(iso: string): string {
  return iso.slice(11, 16);
}

function formatDate(iso: string): string {
  return iso.slice(0, 10);
}

export default function StampRequestForm({
  initialDate,
  initialAction,
  initialPunchType,
  initialRecordId,
  recentRecords,
}: {
  initialDate: string;
  initialAction: Action;
  initialPunchType: PunchType;
  initialRecordId: number | null;
  recentRecords: RecentRecord[];
}) {
  const router = useRouter();
  const [action, setAction] = useState<Action>(initialAction);
  const [date, setDate] = useState(initialDate);
  const [punchType, setPunchType] = useState<PunchType>(initialPunchType);
  const [time, setTime] = useState<string>("09:15");
  const [recordId, setRecordId] = useState<number | null>(initialRecordId);
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 選択日付の自分の打刻列（modify/delete のセレクト候補）
  const dayRecords = useMemo(
    () => recentRecords.filter((r) => formatDate(r.punched_at) === date),
    [recentRecords, date],
  );

  const selectedRecord = useMemo(
    () => recentRecords.find((r) => r.id === recordId) ?? null,
    [recentRecords, recordId],
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (reason.trim().length < 3) {
      setError("理由は3文字以上で入力してください");
      return;
    }
    if ((action === "modify" || action === "delete") && !recordId) {
      setError("修正・削除の場合は対象の打刻を選択してください");
      return;
    }
    if (action !== "delete" && !time) {
      setError("時刻を選択してください");
      return;
    }

    setSubmitting(true);
    try {
      const newPunchedAt =
        action === "delete"
          ? null
          : `${date}T${time}:00.000+09:00`;

      const res = await fetch("/api/stamp-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          target_business_day: date,
          punch_type: action !== "add" && selectedRecord ? selectedRecord.punch_type : punchType,
          new_punched_at: newPunchedAt,
          target_record_id: action === "add" ? null : recordId,
          previous_punched_at: selectedRecord?.punched_at ?? null,
          reason: reason.trim(),
        }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setError(data.error ?? "申請に失敗しました");
        return;
      }
      router.push("/requests/stamps?new=1");
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      {/* アクション選択 */}
      <div>
        <label className="mb-2 block text-[12px] font-medium text-[var(--text-secondary)]">
          操作
        </label>
        <div className="grid grid-cols-3 gap-2">
          {(["add", "modify", "delete"] as Action[]).map((a) => (
            <button
              key={a}
              type="button"
              onClick={() => {
                setAction(a);
                if (a === "add") setRecordId(null);
              }}
              className={`rounded-[8px] border px-3 py-2 text-[13px] font-medium transition-colors ${
                action === a
                  ? "border-[var(--brand-accent)] bg-[var(--brand-accent-soft)] text-[var(--brand-primary)]"
                  : "border-[var(--border-light)] bg-white text-[var(--text-secondary)] hover:bg-[var(--bg-subtle-alt)]"
              }`}
            >
              {a === "add" ? "追加" : a === "modify" ? "修正" : "削除"}
            </button>
          ))}
        </div>
      </div>

      {/* 対象日 */}
      <div>
        <label className="mb-1.5 block text-[12px] font-medium text-[var(--text-secondary)]">
          対象日
        </label>
        <input
          type="date"
          value={date}
          onChange={(e) => {
            setDate(e.target.value);
            setRecordId(null);
          }}
          className="u-input w-full"
          required
        />
      </div>

      {/* 既存打刻の選択（修正・削除時） */}
      {(action === "modify" || action === "delete") && (
        <div>
          <label className="mb-1.5 block text-[12px] font-medium text-[var(--text-secondary)]">
            対象の打刻
          </label>
          {dayRecords.length === 0 ? (
            <p className="rounded-[6px] bg-amber-50 px-3 py-2 text-[12px] text-amber-700">
              {date} の打刻記録がありません。「追加」を選択してください。
            </p>
          ) : (
            <div className="flex flex-col gap-1.5">
              {dayRecords.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => {
                    setRecordId(r.id);
                    setPunchType(r.punch_type as PunchType);
                  }}
                  className={`rounded-[6px] border px-3 py-2 text-left text-[13px] transition-colors ${
                    recordId === r.id
                      ? "border-[var(--brand-accent)] bg-[var(--brand-accent-soft)]"
                      : "border-[var(--border-light)] hover:bg-[var(--bg-subtle-alt)]"
                  }`}
                >
                  <span className="tabular-nums font-medium">{formatTime(r.punched_at)}</span>
                  <span className="ml-2 text-[var(--text-secondary)]">
                    {PUNCH_OPTIONS.find((o) => o.value === r.punch_type)?.label ?? r.punch_type}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 打刻種別（追加時） */}
      {action === "add" && (
        <div>
          <label className="mb-1.5 block text-[12px] font-medium text-[var(--text-secondary)]">
            打刻種別
          </label>
          <select
            value={punchType}
            onChange={(e) => setPunchType(e.target.value as PunchType)}
            className="u-input w-full"
          >
            {PUNCH_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* 時刻（追加・修正時） */}
      {action !== "delete" && (
        <div>
          <label className="mb-1.5 block text-[12px] font-medium text-[var(--text-secondary)]">
            時刻 {action === "modify" && "（変更後）"}
          </label>
          <select
            value={time}
            onChange={(e) => setTime(e.target.value)}
            className="u-input w-full"
            required
          >
            {TIME_OPTIONS.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          {action === "modify" && selectedRecord && (
            <p className="mt-1 text-[11.5px] text-[var(--text-tertiary)] tabular-nums">
              現在: {formatTime(selectedRecord.punched_at)} → {time}
            </p>
          )}
        </div>
      )}

      {/* 理由 */}
      <div>
        <label className="mb-1.5 block text-[12px] font-medium text-[var(--text-secondary)]">
          理由 <span className="text-rose-600">必須</span>
        </label>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={3}
          maxLength={500}
          required
          minLength={3}
          placeholder="例) 退勤打刻を忘れて翌朝気づいた。実際は18:00に退社した。"
          className="u-input w-full"
        />
        <p className="mt-0.5 text-[11px] text-[var(--text-quaternary)]">
          {reason.length} / 500 文字
        </p>
      </div>

      {error && (
        <div className="rounded-[6px] border border-rose-200 bg-rose-50 px-3 py-2 text-[12px] text-rose-700">
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="u-btn u-btn-primary w-full md:w-auto"
      >
        {submitting ? "送信中…" : "申請する"}
      </button>
    </form>
  );
}
