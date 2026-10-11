import { redirect } from "next/navigation";
import { AppChrome } from "@/src/components/chrome/AIcreditspage";
import { SettingsScreen } from "@/src/components/account/SettingsScreen";
import { getServerAccountSession } from "@/src/lib/account/access";
import { getAccountPlanStatus } from "@/src/lib/account/aiCredits";

// SPEC-0020 Phase 3: Diamond Animator's settings (separate from Profile and the plan).
export default async function SettingsPage() {
  const session = await getServerAccountSession();
  if (!session) redirect("/");
  if (getAccountPlanStatus(session.user.id).locked) redirect("/");
  return (
    <div style={{ minHeight: "100vh", background: "var(--da-page, #030914)", color: "var(--da-text, #f6f9ff)" }}>
      <AppChrome page="dashboard" />
      <SettingsScreen />
    </div>
  );
}
