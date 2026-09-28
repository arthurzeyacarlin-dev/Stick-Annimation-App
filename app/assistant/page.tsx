import type { Metadata } from "next";
import { DiamondAssistantScreen } from "@/src/components/assistant/DiamondAssistantScreen";
import { getServerAccountSession } from "@/src/lib/account/access";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
  title: "Assistant | Diamond Animator",
  description: "Ask questions and get guidance about Diamond Animator.",
};

export default async function AssistantPage() {
  if (!await getServerAccountSession()) redirect("/");
  return <DiamondAssistantScreen />;
}
