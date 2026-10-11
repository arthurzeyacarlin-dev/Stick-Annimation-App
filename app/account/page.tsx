import { redirect } from "next/navigation";
import { AppChrome } from "@/src/components/chrome/AIcreditspage";
import { AccountProfileScreen } from "@/src/components/account/AccountProfileScreen";
import { getServerAccountSession } from "@/src/lib/account/access";

// SPEC-0020 Phase 1: Profile and Settings (opened from the profile circle's menu or the side menu).
export default async function AccountPage() {
  if (!await getServerAccountSession()) redirect("/");
  return (
    <div style={{ minHeight: "100vh", background: "#030914", color: "#f6f9ff" }}>
      <AppChrome page="dashboard" />
      <AccountProfileScreen />
    </div>
  );
}
