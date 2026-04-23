// 打刻位置のラベル判定（本社 / 自宅 / その他 / 位置情報なし）
// 座標 × 基準点（本社=環境変数、自宅=ユーザー個別）を Haversine で距離計算し、
// 半径内に入っていればそのラベルを返す。記録のみで打刻制限はしない（参考情報）。

export type LocationLabel = "hq" | "home" | "other" | "none";

const EARTH_RADIUS_METERS = 6_371_000;

export function haversineDistance(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_METERS * c;
}

export function getHQCoords(): { lat: number; lng: number } | null {
  const lat = Number(process.env.HQ_LATITUDE);
  const lng = Number(process.env.HQ_LONGITUDE);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

export function getGeofenceRadius(): number {
  const r = Number(process.env.GEOFENCE_RADIUS_METERS);
  return Number.isFinite(r) && r > 0 ? r : 100;
}

export function classifyLocation(
  punchLat: number | null | undefined,
  punchLng: number | null | undefined,
  home: { lat: number | null; lng: number | null } | null,
  hq: { lat: number; lng: number } | null,
  radiusMeters: number,
): LocationLabel {
  if (punchLat == null || punchLng == null) return "none";

  if (hq) {
    const d = haversineDistance(punchLat, punchLng, hq.lat, hq.lng);
    if (d <= radiusMeters) return "hq";
  }

  if (home && home.lat != null && home.lng != null) {
    const d = haversineDistance(punchLat, punchLng, home.lat, home.lng);
    if (d <= radiusMeters) return "home";
  }

  return "other";
}

export const LOCATION_LABEL_JP: Record<LocationLabel, string> = {
  hq: "本社",
  home: "自宅",
  other: "その他",
  none: "位置情報なし",
};
