import type { Metadata } from "next";
import { DiamondAssistantScreen } from "@/src/components/assistant/DiamondAssistantScreen";
import { getServerAccountSession } from "@/src/lib/account/access";
import { getAccountPlanStatus } from "@/src/lib/account/aiCredits";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
  title: "Assistant | Diamond Animator",
  description: "Ask questions and get guidance about Diamond Animator.",
};

export default async function AssistantPage() {
  const session = await getServerAccountSession();
  if (!session) redirect("/");
  // SPEC-0020 Phase 2: a locked account (trial over, no plan) sees the "trial ended" screen on Home.
  if (getAccountPlanStatus(session.user.id).locked) redirect("/");
  return <DiamondAssistantScreen />;
}
