import { NextResponse } from "next/server";
import { getCurrentUser, isAdmin } from "@/lib/auth";
import { detectAnomaliesForMonth } from "@/lib/anomalies";
import { jstComponents, nowJST } from "@/lib/time";

export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!isAdmin(user)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const url = new URL(req.url);
  const ym = url.searchParams.get("ym"); // YYYY-MM
  const includeWeekdayNoPunch = url.searchParams.get("weekday_no_punch") !== "0";

  let year: number;
  let month: number;
  if (ym && /^\d{4}-\d{2}$/.test(ym)) {
    [year, month] = ym.split("-").map(Number) as [number, number];
  } else {
    const c = jstComponents(nowJST());
    year = c.year;
    month = c.month;
  }

  const items = await detectAnomaliesForMonth({
    year,
    month,
    includeWeekdayNoPunch,
  });

  return NextResponse.json({ year, month, items });
}
