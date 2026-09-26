import { AppChrome } from "@/src/components/chrome/AIcreditspage";
import { AiDashboardScreen } from "@/src/components/ai-dashboard/AiDashboardScreen";

export default function CreditsPage() {
  return (
    <div style={{ minHeight: "100vh", background: "#080f1b", color: "#f4f7ff" }}>
      <AppChrome />
      <AiDashboardScreen />
    </div>
  );
}
