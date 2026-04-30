import { redirect } from "next/navigation";

// /requests/stamps は /requests?tab=stamp に統合済み
export default function DeprecatedMyStampsRedirect() {
  redirect("/requests?tab=stamp");
}
