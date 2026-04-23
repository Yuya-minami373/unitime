"use client";

import { useState } from "react";
import { Home, MapPin, Loader2, CheckCircle2 } from "lucide-react";
import { saveHomeLocationAction, clearHomeLocationAction } from "./actions";

type Props = {
  hasHome: boolean;
  homeLat: number | null;
  homeLng: number | null;
};

export default function HomeLocationCard({ hasHome, homeLat, homeLng }: Props) {
  const [loading, setLoading] = useState(false);
  const [clientError, setClientError] = useState<string | null>(null);

  async function handleRegister() {
    setClientError(null);
    if (!("geolocation" in navigator)) {
      setClientError("このブラウザは位置情報に対応していません");
      return;
    }
    setLoading(true);
    try {
      const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 0,
        });
      });
      const fd = new FormData();
      fd.append("latitude", String(pos.coords.latitude));
      fd.append("longitude", String(pos.coords.longitude));
      await saveHomeLocationAction(fd);
    } catch (e) {
      setLoading(false);
      const err = e as GeolocationPositionError | Error;
      if ("code" in err && err.code === 1) {
        setClientError("位置情報の利用が拒否されました。ブラウザ設定で許可してください");
      } else {
        setClientError("位置情報の取得に失敗しました");
      }
    }
  }

  return (
    <section className="rounded-[10px] border border-[var(--border-default)] bg-white p-5 shadow-[var(--shadow-subtle)]">
      <div className="mb-1 flex items-center gap-2">
        <Home size={14} strokeWidth={2} className="text-[var(--text-secondary)]" />
        <h2 className="text-[14px] font-semibold">自宅の位置情報</h2>
      </div>
      <p className="mb-4 text-[12px] text-[var(--text-tertiary)]">
        在宅勤務時の打刻を「自宅」として記録するために使用します。自宅以外では登録しないでください。
      </p>

      {hasHome ? (
        <div className="space-y-3">
          <div className="flex items-center gap-2 rounded-[6px] bg-[var(--accent-emerald-soft)] px-3 py-2.5">
            <CheckCircle2 size={14} strokeWidth={2} className="text-[#047857]" />
            <div className="flex flex-col">
              <span className="text-[12.5px] font-medium text-[#047857]">登録済み</span>
              <span className="text-[11px] tabular-nums text-[var(--text-tertiary)]">
                {homeLat?.toFixed(6)}, {homeLng?.toFixed(6)}
              </span>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleRegister}
              disabled={loading}
              className="inline-flex items-center gap-1.5 rounded-[6px] border border-[var(--border-default)] bg-white px-3 py-1.5 text-[12px] font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-body)] disabled:opacity-50"
            >
              {loading ? (
                <Loader2 size={12} strokeWidth={2} className="animate-spin" />
              ) : (
                <MapPin size={12} strokeWidth={2} />
              )}
              現在地で再登録
            </button>
            <form action={clearHomeLocationAction}>
              <button
                type="submit"
                className="inline-flex items-center gap-1.5 rounded-[6px] px-3 py-1.5 text-[12px] font-medium text-[var(--text-tertiary)] transition-colors hover:text-rose-700"
              >
                登録を解除
              </button>
            </form>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={handleRegister}
          disabled={loading}
          className="inline-flex items-center gap-1.5 rounded-[6px] bg-[var(--brand-primary)] px-4 py-2 text-[13px] font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {loading ? (
            <Loader2 size={14} strokeWidth={2} className="animate-spin" />
          ) : (
            <MapPin size={14} strokeWidth={2} />
          )}
          現在地を自宅として登録
        </button>
      )}

      {clientError && (
        <div className="mt-3 rounded-[6px] bg-rose-50 px-3 py-2 text-[12px] text-rose-800">
          {clientError}
        </div>
      )}
    </section>
  );
}
