import type { DrawingAiReasoningLevel } from "./drawingAiContract";

export const AI_ANIMATOR_MODEL = "gpt-5.6-terra" as const;
export const AI_ANIMATOR_MAX_INPUT_CHARACTERS = 48_000;
export const AI_ANIMATOR_MAX_OUTPUT_TOKENS = 1_200;
export const AI_ANIMATOR_RECENT_MESSAGE_LIMIT = 12;

export const AI_ANIMATOR_INTENTS = [
  "conversation",
  "create-animation",
  "edit-animation",
  "clarify",
] as const;
export type AiAnimatorIntent = (typeof AI_ANIMATOR_INTENTS)[number];

export const AI_ANIMATOR_REASONING_EFFORT = {
  low: "low",
  medium: "medium",
  high: "high",
  "extra-high": "xhigh",
} as const satisfies Record<DrawingAiReasoningLevel, "low" | "medium" | "high" | "xhigh">;

export type AiAnimatorConversationMessage = {
  id: string;
  jobId?: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
};

export type AiAnimatorWorkspaceSummary = {
  projectId: string;
  projectTitle: string;
  projectGeneration: number;
  totalLayers: number;
  authoredFrameCount: number;
  timelineFps: number;
  activeTool: string;
};

export type AiAnimatorRequest = {
  jobId: string;
  turnId: string;
  message: string;
  reasoningLevel: DrawingAiReasoningLevel;
  recentConversation: Array<Pick<AiAnimatorConversationMessage, "role" | "content">>;
  workspace: AiAnimatorWorkspaceSummary;
};

export type AiAnimatorStructuredReply = {
  intent: AiAnimatorIntent;
  reply: string;
  focusedQuestion: string | null;
  planSummary: string | null;
};

export type AiAnimatorUsage = {
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
  estimatedCostUsd: number | null;
};

export type AiAnimatorProviderResult = {
  reply: AiAnimatorStructuredReply;
  requestedModel: typeof AI_ANIMATOR_MODEL;
  providerModel: string;
  responseId: string | null;
  usage: AiAnimatorUsage;
  latencyMs: number;
  promptDigest: string;
};

export type AiAnimatorTelemetry = {
  model: typeof AI_ANIMATOR_MODEL;
  effort: "low" | "medium" | "high" | "xhigh";
  outcome: "active" | "succeeded" | "failed" | "cancelled";
  latencyMs: number | null;
  promptDigest: string;
  usage: AiAnimatorUsage;
};

export type AiAnimatorJobStatus = "thinking" | "planning" | "done" | "failed" | "cancelled";

export type AiAnimatorJobEvent = {
  sequence: number;
  status: AiAnimatorJobStatus;
  createdAt: string;
  reply?: AiAnimatorStructuredReply;
  errorCode?: string;
  errorMessage?: string;
  provider?: Omit<AiAnimatorProviderResult, "reply">;
};

export type AiAnimatorJobSnapshot = {
  version: 1;
  jobId: string;
  turnId: string;
  projectId: string;
  projectGeneration: number;
  reasoningLevel: DrawingAiReasoningLevel;
  intent: AiAnimatorIntent | null;
  status: AiAnimatorJobStatus;
  lastSequence: number;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  telemetry: AiAnimatorTelemetry;
  events: AiAnimatorJobEvent[];
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const boundedText = (value: unknown, maxLength: number, allowEmpty = false) => {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  if ((!allowEmpty && !trimmed) || trimmed.length > maxLength) {
    return null;
  }
  return trimmed;
};

export const normalizeAiAnimatorRequest = (value: unknown): AiAnimatorRequest | null => {
  if (!isRecord(value)) {
    return null;
  }
  const jobId = boundedText(value.jobId, 128);
  const turnId = boundedText(value.turnId, 128);
  const message = boundedText(value.message, AI_ANIMATOR_MAX_INPUT_CHARACTERS);
  const reasoningLevel = value.reasoningLevel;
  const workspace = value.workspace;
  const recentConversation = value.recentConversation;
  if (
    !jobId ||
    !turnId ||
    !message ||
    typeof reasoningLevel !== "string" ||
    !(reasoningLevel in AI_ANIMATOR_REASONING_EFFORT) ||
    !isRecord(workspace) ||
    !Array.isArray(recentConversation) ||
    recentConversation.length > AI_ANIMATOR_RECENT_MESSAGE_LIMIT
  ) {
    return null;
  }

  const projectId = boundedText(workspace.projectId, 256);
  const projectTitle = boundedText(workspace.projectTitle, 512, true);
  const activeTool = boundedText(workspace.activeTool, 128, true);
  const numericFields = [
    workspace.projectGeneration,
    workspace.totalLayers,
    workspace.authoredFrameCount,
    workspace.timelineFps,
  ];
  if (
    !projectId ||
    projectTitle === null ||
    activeTool === null ||
    numericFields.some((entry) => !Number.isSafeInteger(entry) || Number(entry) < 0)
  ) {
    return null;
  }

  const conversation: AiAnimatorRequest["recentConversation"] = [];
  let conversationCharacters = 0;
  for (const item of recentConversation) {
    if (!isRecord(item) || (item.role !== "user" && item.role !== "assistant")) {
      return null;
    }
    const content = boundedText(item.content, 8_000);
    if (!content) {
      return null;
    }
    conversationCharacters += content.length;
    if (conversationCharacters > 24_000) {
      return null;
    }
    conversation.push({ role: item.role, content });
  }

  return {
    jobId,
    turnId,
    message,
    reasoningLevel: reasoningLevel as DrawingAiReasoningLevel,
    recentConversation: conversation,
    workspace: {
      projectId,
      projectTitle,
      projectGeneration: Number(workspace.projectGeneration),
      totalLayers: Number(workspace.totalLayers),
      authoredFrameCount: Number(workspace.authoredFrameCount),
      timelineFps: Number(workspace.timelineFps),
      activeTool,
    },
  };
};

export const normalizeAiAnimatorStructuredReply = (value: unknown): AiAnimatorStructuredReply | null => {
  if (!isRecord(value) || !AI_ANIMATOR_INTENTS.includes(value.intent as AiAnimatorIntent)) {
    return null;
  }
  const reply = boundedText(value.reply, 8_000);
  const focusedQuestion = value.focusedQuestion === null ? null : boundedText(value.focusedQuestion, 1_000);
  const planSummary = value.planSummary === null ? null : boundedText(value.planSummary, 2_000);
  if (!reply || (value.focusedQuestion !== null && !focusedQuestion) || (value.planSummary !== null && !planSummary)) {
    return null;
  }
  if (value.intent === "clarify" && !focusedQuestion) {
    return null;
  }
  return {
    intent: value.intent as AiAnimatorIntent,
    reply,
    focusedQuestion,
    planSummary,
  };
};

export const AI_ANIMATOR_RESPONSE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["intent", "reply", "focusedQuestion", "planSummary"],
  properties: {
    intent: { type: "string", enum: [...AI_ANIMATOR_INTENTS] },
    reply: { type: "string", minLength: 1, maxLength: 8_000 },
    focusedQuestion: { anyOf: [{ type: "string", minLength: 1, maxLength: 1_000 }, { type: "null" }] },
    planSummary: { anyOf: [{ type: "string", minLength: 1, maxLength: 2_000 }, { type: "null" }] },
  },
} as const;

export const isAiAnimatorTerminalStatus = (status: AiAnimatorJobStatus) =>
  status === "done" || status === "failed" || status === "cancelled";

export const normalizeAiAnimatorJobSnapshot = (value: unknown): AiAnimatorJobSnapshot | null => {
  if (!isRecord(value) || value.version !== 1 || !Array.isArray(value.events)) return null;
  const jobId = boundedText(value.jobId, 128);
  const turnId = boundedText(value.turnId, 128);
  const projectId = boundedText(value.projectId, 256);
  const createdAt = boundedText(value.createdAt, 128);
  const updatedAt = boundedText(value.updatedAt, 128);
  const statuses: AiAnimatorJobStatus[] = ["thinking", "planning", "done", "failed", "cancelled"];
  const telemetry = value.telemetry;
  const intent = value.intent;
  const terminal = statuses.includes(value.status as AiAnimatorJobStatus) && isAiAnimatorTerminalStatus(value.status as AiAnimatorJobStatus);
  if (!jobId || !turnId || !projectId || !createdAt || !updatedAt || !statuses.includes(value.status as AiAnimatorJobStatus) ||
    !Number.isSafeInteger(value.projectGeneration) || Number(value.projectGeneration) < 0 ||
    !Number.isSafeInteger(value.lastSequence) || Number(value.lastSequence) < 1 ||
    typeof value.reasoningLevel !== "string" ||
    !(value.reasoningLevel in AI_ANIMATOR_REASONING_EFFORT) ||
    (intent !== null && !AI_ANIMATOR_INTENTS.includes(intent as AiAnimatorIntent)) ||
    (terminal ? typeof value.completedAt !== "string" : value.completedAt !== null) ||
    !isRecord(telemetry) || telemetry.model !== AI_ANIMATOR_MODEL ||
    telemetry.effort !== AI_ANIMATOR_REASONING_EFFORT[value.reasoningLevel as DrawingAiReasoningLevel] ||
    !["active", "succeeded", "failed", "cancelled"].includes(String(telemetry.outcome)) ||
    !/^[0-9a-f]{64}$/.test(String(telemetry.promptDigest)) ||
    (telemetry.latencyMs !== null && (!Number.isFinite(telemetry.latencyMs) || Number(telemetry.latencyMs) < 0)) ||
    !isRecord(telemetry.usage)) return null;
  let expectedSequence = 1;
  for (const event of value.events) {
    if (!isRecord(event) || event.sequence !== expectedSequence || !statuses.includes(event.status as AiAnimatorJobStatus)) return null;
    expectedSequence += 1;
  }
  if (value.events.length !== value.lastSequence || value.events.at(-1)?.status !== value.status) return null;
  return value as AiAnimatorJobSnapshot;
};
