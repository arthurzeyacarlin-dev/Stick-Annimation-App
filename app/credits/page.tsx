import { AppChrome } from "@/src/components/chrome/AIcreditspage";
import { AiDashboardScreen } from "@/src/components/ai-dashboard/AiDashboardScreen";
import { getServerAccountSession } from "@/src/lib/account/access";
import { getAccountPlanStatus } from "@/src/lib/account/aiCredits";
import { redirect } from "next/navigation";

export default async function CreditsPage() {
  const session = await getServerAccountSession();
  if (!session) redirect("/");
  // SPEC-0020 Phase 2 + 9: a locked account (trial or plan over) sees the locked screen on Home (watch and export only).
  if (getAccountPlanStatus(session.user.id).locked) redirect("/");
  return (
    <div className="da-polished-page" style={{ minHeight: "100vh", background: "var(--da-page, #030914)", color: "var(--da-text, #f6f9ff)" }}>
      <AppChrome page="dashboard" />
      {/* SPEC-0020 Phase 9: the test controls exist only in development (the server decides; /api/dev/plan is 404 elsewhere). */}
      <AiDashboardScreen />
    </div>
  );
}
