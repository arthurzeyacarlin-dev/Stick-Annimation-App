import type { Metadata } from "next";
import { DiamondAssistantScreen } from "@/src/components/assistant/DiamondAssistantScreen";

export const metadata: Metadata = {
  title: "Assistant | Diamond Animator",
  description: "Ask questions and get guidance about Diamond Animator.",
};

export default function AssistantPage() {
  return <DiamondAssistantScreen />;
}
