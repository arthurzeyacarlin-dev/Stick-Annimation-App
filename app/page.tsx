import { AuthScreen } from "@/src/components/auth/AuthScreen";
import ExistingHome from "@/src/components/account/ExistingHome";
import { TrialEndedScreen } from "@/src/components/account/TrialEndedScreen";
import { getServerAccountSession } from "@/src/lib/account/access";
import { redirect } from "next/navigation";
import { ensureLegacyTrialGate, getAccountPlanStatus } from "@/src/lib/account/aiCredits";

export const dynamic = "force-dynamic";

// Redesign (Arthur 2026-10-26): Phase 1 = the new sign-up / log-in screen; Phase 2 = the new main screen (drawn by
// MainScreen inside ExistingHome, which keeps the project / recent-project / export code). Other screens come later.
export default async function Page() {
  const session = await getServerAccountSession();
  if (!session) return <AuthScreen />;
  // After the free trial (or a plan) ends, the main screen is replaced by the locked screen (unchanged, SPEC-0020).
  // (dad, Nov 26) an account from before the email rule that never opened the app: it confirms its email too
  ensureLegacyTrialGate(session.user.id, new Date(session.user.createdAt).getTime());
  const plan = getAccountPlanStatus(session.user.id);
  // (dad, Nov 26) this inbox already had its free trial: straight to Plans, with the kind words there
  if (plan.lockReason === "no_trial") redirect("/plans");
  if (plan.locked) return <TrialEndedScreen name={session.user.name} lockReason={plan.lockReason} />;
  return <ExistingHome />;
}
