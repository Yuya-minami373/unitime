"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  LogIn,
  LogOut,
  Coffee,
  CheckCircle2,
  MapPin,
  PlayCircle,
  type LucideIcon,
} from "lucide-react";
import { formatTime as formatJSTTime } from "@/lib/time";

type TodayRecord = {
  punch_type: string;
  punched_at: string;
  latitude: number | null;
  longitude: number | null;
};

const LABEL: Record<string, string> = {
  clock_in: "出勤",
  clock_out: "退勤",
  break_start: "休憩開始",
  break_end: "休憩終了",
};

const TIMELINE_STYLE: Record<
  string,
  { icon: LucideIcon; bg: string; fg: string }
> = {
  clock_in: {
    icon: LogIn,
    bg: "bg-[var(--brand-accent-soft)]",
    fg: "text-[var(--brand-accent)]",
  },
  clock_out: {
    icon: LogOut,
    bg: "bg-[var(--bg-subtle)]",
    fg: "text-[var(--text-secondary)]",
  },
  break_start: { icon: Coffee, bg: "bg-amber-50", fg: "text-amber-600" },
  break_end: { icon: PlayCircle, bg: "bg-emerald-50", fg: "text-emerald-600" },
};

function getNextAllowed(lastType: string | undefined): string[] {
  if (!lastType) return ["clock_in"];
  switch (lastType) {
    case "clock_in":
    case "break_end":
      return ["break_start", "clock_out"];
    case "break_start":
      return ["break_end"];
    case "clock_out":
      return ["clock_in"];
    default:
      return ["clock_in"];
  }
}

type Status = "off" | "working" | "break" | "done";

function getStatus(lastType: string | undefined): Status {
  switch (lastType) {
    case "clock_in":
    case "break_end":
      return "working";
    case "break_start":
      return "break";
    case "clock_out":
      return "done";
    default:
      return "off";
  }
}

const formatTime = formatJSTTime;

// 勤務中の経過時間を計算（休憩時間を差し引く）
function computeElapsedMinutes(records: TodayRecord[], now: Date): number {
  const clockIn = records.find((r) => r.punch_type === "clock_in");
  if (!clockIn) return 0;

  const clockOut = [...records].reverse().find((r) => r.punch_type === "clock_out");

  // 休憩合計時間
  let breakMinutes = 0;
  let breakStart: Date | null = null;
  const sorted = [...records].sort((a, b) =>
    a.punched_at < b.punched_at ? -1 : 1,
  );
  for (const r of sorted) {
    if (r.punch_type === "break_start") {
      breakStart = new Date(r.punched_at);
    } else if (r.punch_type === "break_end" && breakStart) {
      breakMinutes += (new Date(r.punched_at).getTime() - breakStart.getTime()) / 60000;
      breakStart = null;
    }
  }
  // 現在休憩中なら、休憩開始から今までを差し引く
  if (breakStart) {
    breakMinutes += (now.getTime() - breakStart.getTime()) / 60000;
  }

  const endTime = clockOut ? new Date(clockOut.punched_at) : now;
  const totalMin = (endTime.getTime() - new Date(clockIn.punched_at).getTime()) / 60000;
  return Math.max(0, Math.floor(totalMin - breakMinutes));
}

export default function PunchPanel({
  initialRecords,
}: {
  initialRecords: TodayRecord[];
}) {
  const router = useRouter();
  const [records] = useState<TodayRecord[]>(initialRecords);
  const [now, setNow] = useState<Date | null>(null);
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setNow(new Date());
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const sorted = [...records].sort((a, b) =>
    a.punched_at > b.punched_at ? -1 : 1,
  );
  const lastType = sorted[0]?.punch_type;
  const allowed = getNextAllowed(lastType);
  const status = getStatus(lastType);

  const clockInRecord = records.find((r) => r.punch_type === "clock_in");
  const clockOutRecord = [...records]
    .reverse()
    .find((r) => r.punch_type === "clock_out");
  const elapsedMin = now && clockInRecord ? computeElapsedMinutes(records, now) : 0;
  const elapsedH = Math.floor(elapsedMin / 60);
  const elapsedM = elapsedMin % 60;

  async function handlePunch(punchType: string) {
    setLoading(punchType);
    setError(null);

    let coords: { latitude?: number; longitude?: number; accuracy?: number } = {};
    if ("geolocation" in navigator) {
      try {
        const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, {
            enableHighAccuracy: true,
            timeout: 8000,
            maximumAge: 60000,
          });
        });
        coords = {
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        };
      } catch {
        /* 位置情報なしでも打刻可能 */
      }
    }

    const res = await fetch("/api/punch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ punch_type: punchType, ...coords }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({ error: "エラーが発生しました" }));
      setError(data.error ?? "エラーが発生しました");
      setLoading(null);
      return;
    }
    setLoading(null);
    router.refresh();
  }

  const canClockIn = allowed.includes("clock_in");
  const canClockOut = allowed.includes("clock_out");
  const canBreakStart = allowed.includes("break_start");
  const canBreakEnd = allowed.includes("break_end");

  const statusPill = (() => {
    if (status === "working")
      return (
        <span className="u-pill u-pill-working">
          <span className="u-dot u-dot-indigo animate-pulse" />
          勤務中
        </span>
      );
    if (status === "break")
      return (
        <span className="u-pill u-pill-break">
          <span className="u-dot u-dot-muted" />
          休憩中
        </span>
      );
    if (status === "done")
      return (
        <span className="u-pill u-pill-off">
          <CheckCircle2 size={12} strokeWidth={2} />
          退勤済
        </span>
      );
    return (
      <span className="u-pill u-pill-off">
        <span className="u-dot u-dot-muted" />
        未出勤
      </span>
    );
  })();

  // 勤務中/休憩中のみ「09:19 START」のラベルを出す。退勤済時はサマリで出退勤時刻を出すので省略
  const startLabel =
    clockInRecord && status !== "done"
      ? `${formatTime(clockInRecord.punched_at)} START`
      : null;

  return (
    <div className="flex flex-col gap-6">
      {/* Hero Punch Panel */}
      <section className="relative flex flex-col gap-4 overflow-hidden rounded-[8px] border border-[var(--border-light)] bg-white p-4 shadow-[var(--shadow-subtle)] md:flex-row md:items-center md:justify-between md:gap-5 md:p-6">
        {/* 左端アクセントバー */}
        <div
          aria-hidden
          className={`absolute left-0 top-0 h-full w-[3px] ${
            status === "working"
              ? "bg-[var(--brand-accent)]"
              : status === "break"
              ? "bg-amber-400"
              : status === "done"
              ? "bg-[var(--border-dark)]"
              : "bg-[var(--border-light)]"
          }`}
        />
        {/* 背景の超subtle青ウォッシュ */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-60"
          style={{
            background:
              "radial-gradient(ellipse 500px 200px at 10% 50%, rgba(37, 99, 235, 0.04), transparent 70%)",
          }}
        />

        <div className="relative flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-3">
            {statusPill}
            {startLabel && (
              <span className="text-[12px] font-medium tracking-wide text-[var(--text-quaternary)]">
                {startLabel}
              </span>
            )}
          </div>
          {status === "done" && clockInRecord && clockOutRecord ? (
            // 退勤済: 出退勤時刻のサマリ表示
            <div className="flex flex-col gap-1">
              <div className="flex items-baseline gap-2 text-[var(--text-primary)]">
                <span className="tabular-nums text-[28px] font-semibold leading-none tracking-tight md:text-[34px]">
                  {formatTime(clockInRecord.punched_at)}
                </span>
                <span className="text-[18px] text-[var(--text-quaternary)] md:text-[22px]">→</span>
                <span className="tabular-nums text-[28px] font-semibold leading-none tracking-tight md:text-[34px]">
                  {formatTime(clockOutRecord.punched_at)}
                </span>
              </div>
              <span className="text-[12px] text-[var(--text-tertiary)]">
                本日の勤務 {elapsedH}h {String(elapsedM).padStart(2, "0")}m ・お疲れ様でした
              </span>
            </div>
          ) : (
            <div className="flex items-baseline gap-1">
              {clockInRecord ? (
                <>
                  <span
                    className={`tabular-nums text-[42px] font-semibold leading-none tracking-tighter md:text-[52px] ${
                      status === "working"
                        ? "text-[var(--brand-primary)]"
                        : "text-[var(--text-primary)]"
                    }`}
                  >
                    {elapsedH}
                  </span>
                  <span className="text-[18px] font-medium text-[var(--text-tertiary)] md:text-[22px]">
                    h
                  </span>
                  <span
                    className={`ml-2 tabular-nums text-[52px] font-semibold leading-none tracking-tighter ${
                      status === "working"
                        ? "text-[var(--brand-primary)]"
                        : "text-[var(--text-primary)]"
                    }`}
                  >
                    {String(elapsedM).padStart(2, "0")}
                  </span>
                  <span className="text-[18px] font-medium text-[var(--text-tertiary)] md:text-[22px]">
                    m
                  </span>
                </>
              ) : (
                <span className="text-[22px] font-medium text-[var(--text-tertiary)]">
                  打刻をしてください
                </span>
              )}
            </div>
          )}
        </div>

        <div className="relative flex w-full flex-col gap-2 md:w-auto md:items-end">
          {/* メインアクション: 出勤・退勤 */}
          <div className="grid grid-cols-2 gap-2.5 md:flex md:flex-wrap">
            <button
              disabled={!canClockIn || loading !== null}
              onClick={() => handlePunch("clock_in")}
              className={`u-btn ${canClockIn ? "u-btn-primary" : "u-btn-disabled"}`}
            >
              <LogIn size={16} strokeWidth={1.75} />
              出勤
            </button>
            <button
              disabled={!canClockOut || loading !== null}
              onClick={() => handlePunch("clock_out")}
              className={`u-btn ${canClockOut ? "u-btn-primary" : "u-btn-disabled"}`}
            >
              <LogOut size={16} strokeWidth={1.75} />
              退勤
            </button>
          </div>
          {/* 任意: 休憩打刻（通常は自動控除） */}
          <div className="flex items-center gap-2">
            {canBreakEnd ? (
              <button
                disabled={loading !== null}
                onClick={() => handlePunch("break_end")}
                className="inline-flex items-center gap-1 rounded-[6px] border border-[var(--border-light)] bg-white px-2.5 py-1 text-[12px] font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-subtle)]"
              >
                <Coffee size={13} strokeWidth={1.75} />
                休憩終了
              </button>
            ) : (
              <button
                disabled={!canBreakStart || loading !== null}
                onClick={() => handlePunch("break_start")}
                className={`inline-flex items-center gap-1 rounded-[6px] border px-2.5 py-1 text-[12px] font-medium transition-colors ${
                  canBreakStart
                    ? "border-[var(--border-light)] bg-white text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)]"
                    : "border-[var(--border-light)] bg-[var(--bg-subtle)] text-[var(--text-quaternary)] cursor-not-allowed"
                }`}
              >
                <Coffee size={13} strokeWidth={1.75} />
                休憩開始
              </button>
            )}
          </div>
        </div>
      </section>

      {/* 休憩自動控除の注記 */}
      <div className="-mt-2 rounded-[6px] border border-[var(--border-light)] bg-[var(--bg-subtle)] px-3 py-2 text-[11px] leading-relaxed text-[var(--text-tertiary)]">
        💡 休憩時間は労基34条に基づき自動控除されます（6h超→45分、8h超→60分）。通常は休憩打刻不要。長めに休んだ場合のみ「休憩開始／終了」で記録してください。
      </div>

      {error && (
        <div className="rounded-[6px] border border-[var(--border-light)] bg-[var(--bg-subtle)] px-3 py-2 text-[12px] text-[var(--text-secondary)]">
          {error}
        </div>
      )}

      {/* Today's Timeline */}
      <section className="u-card p-6">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-[14px] font-semibold tracking-tight">今日のタイムライン</h2>
          <span className="text-[11px] text-[var(--text-quaternary)]">
            {records.length} 件
          </span>
        </div>

        {records.length === 0 ? (
          <div className="py-8 text-center text-[13px] text-[var(--text-quaternary)]">
            まだ打刻がありません
          </div>
        ) : (
          <div className="relative flex flex-col">
            {[...records]
              .sort((a, b) => (a.punched_at > b.punched_at ? -1 : 1))
              .map((r, i, arr) => {
                const style = TIMELINE_STYLE[r.punch_type];
                const Icon = style?.icon ?? LogIn;
                const isLast = i === arr.length - 1;
                return (
                  <div key={i} className="relative flex items-start gap-3 pb-4 last:pb-0">
                    {!isLast && (
                      <div className="absolute left-[13px] top-8 bottom-0 w-px bg-[var(--border-light)]" />
                    )}
                    <div
                      className={`relative z-10 flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${style?.bg ?? ""}`}
                    >
                      <Icon
                        size={13}
                        strokeWidth={2}
                        className={style?.fg ?? ""}
                      />
                    </div>
                    <div className="flex flex-1 flex-col gap-0.5 pt-0.5">
                      <div className="flex items-center gap-2">
                        <span className="text-[13px] font-semibold text-[var(--text-primary)]">
                          {LABEL[r.punch_type]}
                        </span>
                        <span className="tabular-nums text-[12px] text-[var(--text-tertiary)]">
                          {formatTime(r.punched_at)}
                        </span>
                      </div>
                      {r.latitude !== null && (
                        <span className="flex items-center gap-1 text-[11px] text-[var(--text-quaternary)]">
                          <MapPin size={11} strokeWidth={1.75} />
                          位置情報を記録
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
          </div>
        )}
      </section>
    </div>
  );
}
