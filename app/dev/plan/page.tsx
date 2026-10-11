// SPEC-0020 Phase 2 (development only): test switch for plans, credits and the trial clock. 404 outside development.
import { notFound, redirect } from "next/navigation";
import { getServerAccountSession } from "@/src/lib/account/access";
import { TestPlanSwitch } from "./TestPlanSwitch";

export const dynamic = "force-dynamic";

export default async function DevPlanPage() {
  if (process.env.NODE_ENV !== "development") notFound();
  if (!await getServerAccountSession()) redirect("/");
  return <TestPlanSwitch />;
}
