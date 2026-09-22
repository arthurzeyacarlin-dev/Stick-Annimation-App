import type { Metadata } from "next";
import { DiamondAssistantScreen } from "@/src/components/assistant/DiamondAssistantScreen";

export const metadata: Metadata = {
  title: "Assistant | Diamond Animator",
  description: "The Diamond Animator guidance Assistant preview.",
};

export default function AssistantPage() {
  return <DiamondAssistantScreen />;
}
