import { notFound } from "next/navigation";
import { AppChrome } from "@/src/components/chrome/AIcreditspage";
import { ProblemReportsScreen } from "@/src/components/support/ProblemReportsScreen";
import { getServerAccountSession } from "@/src/lib/account/access";
import { isOwnerEmail } from "@/src/lib/account/owner";

// SPEC-0020 Phase 6: the owner's inbox of problem reports. Anyone else (or signed out) gets the normal "not found".
export const dynamic = "force-dynamic";

export default async function ProblemReportsPage() {
  const session = await getServerAccountSession();
  if (!session || !isOwnerEmail(session.user.email)) notFound();
  return (
    <div className="da-polished-page" style={{ minHeight: "100vh", background: "var(--da-page)", color: "var(--da-text)" }}>
      <AppChrome page="dashboard" />
      <ProblemReportsScreen />
    </div>
  );
}
