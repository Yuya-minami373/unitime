import { redirect } from "next/navigation";

// /admin/punch-history は /admin/monthly-close?subtab=history に統合済み
export default async function DeprecatedPunchHistoryRedirect({
  searchParams,
}: {
  searchParams: Promise<{
    user_id?: string;
    event?: string;
    from?: string;
    to?: string;
  }>;
}) {
  const sp = await searchParams;
  const params = new URLSearchParams({ subtab: "history" });
  if (sp.user_id) params.set("user_id", sp.user_id);
  if (sp.event) params.set("event", sp.event);
  if (sp.from) params.set("from", sp.from);
  if (sp.to) params.set("to", sp.to);
  redirect(`/admin/monthly-close?${params.toString()}`);
}
