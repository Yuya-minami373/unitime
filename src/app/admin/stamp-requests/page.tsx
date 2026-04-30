import { redirect } from "next/navigation";

// /admin/stamp-requests は /admin/requests?tab=stamp に統合済み
export default function DeprecatedStampRequestsRedirect() {
  redirect("/admin/requests?tab=stamp");
}
