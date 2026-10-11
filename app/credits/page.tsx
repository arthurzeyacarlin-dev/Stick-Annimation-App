import { AppChrome } from "@/src/components/chrome/AIcreditspage";
import { AiDashboardScreen } from "@/src/components/ai-dashboard/AiDashboardScreen";
import { getServerAccountSession } from "@/src/lib/account/access";
import { getAccountPlanStatus } from "@/src/lib/account/aiCredits";
import { redirect } from "next/navigation";

export default async function CreditsPage() {
  const session = await getServerAccountSession();
  if (!session) redirect("/");
  // SPEC-0020 Phase 2: a locked account (trial over, no plan) sees the "trial ended" screen on Home.
  if (getAccountPlanStatus(session.user.id).locked) redirect("/");
  return (
    <div style={{ minHeight: "100vh", background: "var(--da-page, #030914)", color: "var(--da-text, #f6f9ff)" }}>
      <AppChrome page="dashboard" />
      <AiDashboardScreen />
    </div>
  );
}
