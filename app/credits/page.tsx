import { AppChrome } from "@/src/components/chrome/AIcreditspage";
import { AiDashboardScreen } from "@/src/components/ai-dashboard/AiDashboardScreen";
import { getServerAccountSession } from "@/src/lib/account/access";
import { redirect } from "next/navigation";

export default async function CreditsPage() {
  if (!await getServerAccountSession()) redirect("/");
  return (
    <div style={{ minHeight: "100vh", background: "#080f1b", color: "#f4f7ff" }}>
      <AppChrome page="dashboard" />
      <AiDashboardScreen />
    </div>
  );
}
