// SPEC-0020 Phase 2 (development only): test switch for plans, credits and the trial clock. 404 outside development.
import { notFound, redirect } from "next/navigation";
import { getServerAccountSession } from "@/src/lib/account/access";
import { moneyMode } from "@/src/lib/account/aiCredits";
import { TestPlanSwitch } from "./TestPlanSwitch";

export const dynamic = "force-dynamic";

export default async function DevPlanPage() {
  // Real money on (Nov 21): the test buttons don't exist, even on this Mac.
  if (process.env.NODE_ENV !== "development" || moneyMode() === "live") notFound();
  if (!await getServerAccountSession()) redirect("/");
  return <TestPlanSwitch />;
}
