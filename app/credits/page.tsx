import { AppChrome } from "@/src/components/chrome/AIcreditspage";
import { AiDashboardScreen } from "@/src/components/ai-dashboard/AiDashboardScreen";
import { getServerAccountSession } from "@/src/lib/account/access";
import { getAccountPlanStatus } from "@/src/lib/account/aiCredits";
import { redirect } from "next/navigation";

// Nov 21 (Arthur): opened from the Help Assistant's credits circle (?back=/assistant), the header says "Back" and goes back there.
const BACK_TARGETS: Record<string, string> = { "/assistant": "Back to the Help Assistant" };

export default async function CreditsPage({ searchParams }: { searchParams: Promise<{ back?: string | string[] }> }) {
  const backParam = (await searchParams).back;
  const backTo = typeof backParam === "string" && BACK_TARGETS[backParam] ? backParam : null;
  const session = await getServerAccountSession();
  if (!session) redirect("/");
  // SPEC-0020 Phase 2 + 9: a locked account (trial or plan over) sees the locked screen on Home (watch and export only).
  if (getAccountPlanStatus(session.user.id).locked) redirect("/");
  return (
    <div className="da-polished-page" style={{ minHeight: "100vh", background: "var(--da-page, #111113)", color: "var(--da-text, #f5f5f6)" }}>
      <AppChrome page="dashboard" back={backTo ? { href: backTo, label: BACK_TARGETS[backTo] } : undefined} />
      {/* SPEC-0020 Phase 9: the test controls exist only in development (the server decides; /api/dev/plan is 404 elsewhere). */}
      <AiDashboardScreen />
    </div>
  );
}
