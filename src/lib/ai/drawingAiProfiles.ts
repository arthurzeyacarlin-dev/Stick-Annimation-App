import type { DrawingAiReasoningLevel } from "./drawingAiContract";

export type DrawingAiReasoningEffort = "low" | "medium" | "high" | "xhigh";

export type DrawingAiReasoningProfile = {
  level: DrawingAiReasoningLevel;
  reasoningEffort: DrawingAiReasoningEffort;
  maxOutputTokens: number;
  maxSearchResults: number;
  promptInstruction: string;
};

const DRAWING_AI_REASONING_PROFILES: Record<DrawingAiReasoningLevel, DrawingAiReasoningProfile> = {
  low: {
    level: "low",
    reasoningEffort: "low",
    maxOutputTokens: 320,
    maxSearchResults: 2,
    promptInstruction: "Use lighter reasoning. Answer directly and keep the depth light unless the user clearly needs more.",
  },
  medium: {
    level: "medium",
    reasoningEffort: "medium",
    maxOutputTokens: 520,
    maxSearchResults: 4,
    promptInstruction: "Use balanced reasoning. Give a clear, practical answer with normal depth.",
  },
  high: {
    level: "high",
    reasoningEffort: "high",
    maxOutputTokens: 760,
    maxSearchResults: 5,
    promptInstruction: "Use stronger reasoning. Think more carefully before answering and give a stronger breakdown when it helps.",
  },
  "extra-high": {
    level: "extra-high",
    reasoningEffort: "xhigh",
    maxOutputTokens: 980,
    maxSearchResults: 6,
    promptInstruction: "Use the strongest reasoning. Push the thinking depth harder before answering while keeping the final response clean and easy to follow.",
  },
};

export const getDrawingAiReasoningProfile = (level: DrawingAiReasoningLevel): DrawingAiReasoningProfile =>
  DRAWING_AI_REASONING_PROFILES[level];
