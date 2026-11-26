import { redirect } from "next/navigation";
import { AppChrome } from "@/src/components/chrome/AIcreditspage";
import { PlansScreen } from "@/src/components/account/PlansScreen";
import { getServerAccountSession } from "@/src/lib/account/access";

// SPEC-0020 Phase 2: choose a plan. Open even when the trial has ended (that's how you unlock the app).
// SPEC-0031: a signed-out visit to /plans?code=FIRSTDIAMOND keeps the code (the sign-up screen saves it for checkout).
export default async function PlansPage({ searchParams }: { searchParams: Promise<{ code?: string | string[] }> }) {
  if (!await getServerAccountSession()) {
    const code = (await searchParams).code;
    const clean = typeof code === "string" ? code.trim().slice(0, 40).replace(/[^A-Za-z0-9_-]/g, "") : "";
    redirect(clean ? `/?code=${encodeURIComponent(clean)}` : "/");
  }
  return (
    <div className="da-polished-page" style={{ minHeight: "100vh", background: "var(--da-page, #111113)", color: "var(--da-text, #f5f5f6)" }}>
      <AppChrome page="dashboard" />
      <PlansScreen />
    </div>
  );
}
