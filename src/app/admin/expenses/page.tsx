import { redirect } from "next/navigation";

export default async function AdminExpensesRedirect({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; ym?: string }>;
}) {
  const sp = await searchParams;
  const params = new URLSearchParams({ tab: "expense" });
  if (sp.tab === "history") {
    params.set("subtab", "history");
    if (sp.ym) params.set("ym", sp.ym);
  }
  redirect(`/admin/requests?${params.toString()}`);
}
