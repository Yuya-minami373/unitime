import { redirect } from "next/navigation";

// /admin/anomalies は /admin/monthly-close?subtab=anomalies に統合済み
export default async function DeprecatedAnomaliesRedirect({
  searchParams,
}: {
  searchParams: Promise<{ ym?: string }>;
}) {
  const sp = await searchParams;
  const qs = sp.ym ? `&ym=${sp.ym}` : "";
  redirect(`/admin/monthly-close?subtab=anomalies${qs}`);
}
