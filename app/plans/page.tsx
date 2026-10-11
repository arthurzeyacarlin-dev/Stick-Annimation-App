import { redirect } from "next/navigation";
import { AppChrome } from "@/src/components/chrome/AIcreditspage";
import { PlansScreen } from "@/src/components/account/PlansScreen";
import { getServerAccountSession } from "@/src/lib/account/access";

// SPEC-0020 Phase 2: choose a plan. Open even when the trial has ended (that's how you unlock the app).
export default async function PlansPage() {
  if (!await getServerAccountSession()) redirect("/");
  return (
    <div style={{ minHeight: "100vh", background: "#030914", color: "#f6f9ff" }}>
      <AppChrome page="dashboard" />
      <PlansScreen />
    </div>
  );
}
