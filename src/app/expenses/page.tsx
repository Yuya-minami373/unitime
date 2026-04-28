import { redirect } from "next/navigation";

export default async function ExpensesRedirect({
  searchParams,
}: {
  searchParams: Promise<{ new?: string }>;
}) {
  const sp = await searchParams;
  const qs = sp.new ? `?tab=expense&new=${sp.new}` : "?tab=expense";
  redirect(`/requests${qs}`);
}
