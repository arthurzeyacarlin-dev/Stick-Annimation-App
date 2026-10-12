import { AccountEntry } from "@/src/components/account/AccountEntry";
import ExistingHome from "@/src/components/account/ExistingHome";
import { TrialEndedScreen } from "@/src/components/account/TrialEndedScreen";
import { getServerAccountSession } from "@/src/lib/account/access";
import { getAccountPlanStatus } from "@/src/lib/account/aiCredits";

export const dynamic = "force-dynamic";

export default async function Page() {
  const session = await getServerAccountSession();
  if (!session) return <AccountEntry />;
  // SPEC-0020 Phase 2 + 9: after the free trial (or a plan) ends, Home (and so the editor) is replaced by the locked
  // screen: watch and export only, plus Choose a plan, Profile and Log out.
  const plan = getAccountPlanStatus(session.user.id);
  if (plan.locked) return <TrialEndedScreen name={session.user.name} lockReason={plan.lockReason} showTestLink={process.env.NODE_ENV === "development"} />;
  return <ExistingHome />;
}
