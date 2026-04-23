import { Building2, Home, MapPin } from "lucide-react";
import type { LocationLabel } from "@/lib/location";

export default function LocationBadge({
  label,
  showNone = false,
}: {
  label: LocationLabel;
  showNone?: boolean;
}) {
  if (label === "none" && !showNone) return null;

  if (label === "hq") {
    return (
      <span
        title="本社で打刻"
        className="inline-flex items-center gap-0.5 rounded-[4px] bg-[var(--brand-accent-soft)] px-1 py-0.5 text-[10px] font-medium text-[var(--brand-primary)]"
      >
        <Building2 size={10} strokeWidth={2} />
        本社
      </span>
    );
  }
  if (label === "home") {
    return (
      <span
        title="自宅で打刻"
        className="inline-flex items-center gap-0.5 rounded-[4px] bg-[var(--accent-emerald-soft)] px-1 py-0.5 text-[10px] font-medium text-[#047857]"
      >
        <Home size={10} strokeWidth={2} />
        自宅
      </span>
    );
  }
  if (label === "other") {
    return (
      <span
        title="本社・自宅外で打刻"
        className="inline-flex items-center gap-0.5 rounded-[4px] bg-[var(--accent-amber-soft)] px-1 py-0.5 text-[10px] font-medium text-[#b45309]"
      >
        <MapPin size={10} strokeWidth={2} />
        その他
      </span>
    );
  }
  // label === "none" && showNone
  return (
    <span
      title="位置情報の記録なし"
      className="inline-flex items-center rounded-[4px] bg-[var(--bg-subtle-alt)] px-1 py-0.5 text-[10px] font-medium text-[var(--text-quaternary)]"
    >
      位置情報なし
    </span>
  );
}
