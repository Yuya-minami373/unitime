"use client";

import { useEffect, useState } from "react";

type Props = {
  userName: string;
  ym: string;
  workDays: number;
  workHours: string;
  scheduledOvertimeHours: string;
  overtimeHours: string;
  nightHours: string;
  holidayHours: string;
  weekendDays: number;
};

// ページ上部KPIが画面外に出たら、コンパクトな圧縮バーをスクロール追従で表示
export default function StickySummaryBar(props: Props) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    function onScroll() {
      // 上から260pxスクロールしたら表示（KPIカードを過ぎた付近）
      setVisible(window.scrollY > 260);
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div
      className={`pointer-events-none fixed left-0 right-0 top-0 z-30 transition-all duration-200 md:left-[240px] ${
        visible ? "translate-y-0 opacity-100" : "-translate-y-full opacity-0"
      }`}
    >
      <div className="pointer-events-auto border-b border-[var(--border-brand)] bg-white/95 backdrop-blur-sm shadow-[0_2px_8px_rgba(0,0,0,0.04)]">
        <div className="mx-auto max-w-[1200px] px-5 py-2.5 md:px-8">
          <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-1.5">
            <div className="flex items-center gap-2 text-[12px] text-[var(--text-tertiary)]">
              <span className="font-semibold text-[var(--text-primary)]">
                {props.userName}
              </span>
              <span>/</span>
              <span className="tabular-nums">{props.ym}</span>
            </div>
            <div className="flex items-center gap-x-5 gap-y-1 text-[12px] flex-wrap">
              <Metric label="稼働" value={`${props.workDays}日`} />
              <Metric label="実働" value={`${props.workHours}h`} strong />
              <Metric
                label="所定外"
                value={`${props.scheduledOvertimeHours}h`}
                muted={props.scheduledOvertimeHours === "0.0"}
              />
              <Metric label="法定外" value={`${props.overtimeHours}h`} indigo muted={props.overtimeHours === "0.0"} />
              <Metric label="深夜" value={`${props.nightHours}h`} indigo muted={props.nightHours === "0.0"} />
              <Metric label="土日" value={`${props.weekendDays}日`} amber muted={props.weekendDays === 0} />
              <Metric label="法休" value={`${props.holidayHours}h`} rose muted={props.holidayHours === "0.0"} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Metric({
  label,
  value,
  strong,
  indigo,
  amber,
  rose,
  muted,
}: {
  label: string;
  value: string;
  strong?: boolean;
  indigo?: boolean;
  amber?: boolean;
  rose?: boolean;
  muted?: boolean;
}) {
  const valueColor = muted
    ? "text-[var(--text-quaternary)]"
    : indigo
    ? "text-[var(--accent-indigo)]"
    : amber
    ? "text-amber-700"
    : rose
    ? "text-rose-700"
    : strong
    ? "text-[var(--text-primary)]"
    : "text-[var(--text-secondary)]";
  return (
    <span className="inline-flex items-baseline gap-1">
      <span className="text-[10px] uppercase tracking-wider text-[var(--text-quaternary)]">
        {label}
      </span>
      <span className={`tabular-nums font-semibold ${valueColor}`}>{value}</span>
    </span>
  );
}
