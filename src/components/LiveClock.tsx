"use client";

import { useEffect, useState } from "react";
import { Clock } from "lucide-react";
import { jstComponents } from "@/lib/time";

export default function LiveClock() {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // SSRでは固定表示、クライアント側で更新（ブラウザTZに依存せずJSTを表示）
  const c = now ? jstComponents(now) : null;
  const hh = c ? String(c.hour).padStart(2, "0") : "--";
  const mm = c ? String(c.minute).padStart(2, "0") : "--";
  const ss = c ? String(c.second).padStart(2, "0") : "--";

  return (
    <div className="u-card inline-flex items-center gap-3 px-4 py-3">
      <div className="flex h-8 w-8 items-center justify-center rounded-[6px] bg-[var(--brand-accent-soft)]">
        <Clock size={15} strokeWidth={2} className="text-[var(--brand-accent)]" />
      </div>
      <div className="flex flex-col">
        <span className="micro-label leading-none">現在時刻</span>
        <span className="mt-1 tabular-nums text-[22px] font-semibold leading-none tracking-tight text-[var(--text-primary)]">
          {hh}:{mm}
          <span className="ml-0.5 text-[16px] font-medium text-[var(--text-tertiary)]">
            :{ss}
          </span>
        </span>
      </div>
    </div>
  );
}
