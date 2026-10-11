import { AccountEntry } from "@/src/components/account/AccountEntry";
import ExistingHome from "@/src/components/account/ExistingHome";
import { TrialEndedScreen } from "@/src/components/account/TrialEndedScreen";
import { getServerAccountSession } from "@/src/lib/account/access";
import { getAccountPlanStatus } from "@/src/lib/account/aiCredits";

export const dynamic = "force-dynamic";

export default async function Page() {
  const session = await getServerAccountSession();
  if (!session) return <AccountEntry />;
  // SPEC-0020 Phase 2: after the free trial, without a plan, only Profile and Log out stay open.
  if (getAccountPlanStatus(session.user.id).locked) return <TrialEndedScreen name={session.user.name} />;
  return <ExistingHome />;
}
