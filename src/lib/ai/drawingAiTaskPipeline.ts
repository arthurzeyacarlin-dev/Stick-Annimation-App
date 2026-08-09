import type {
  DrawingAiInteractionIntentKind,
  DrawingAiSearchDecision,
  DrawingAiTaskExecution,
  DrawingAiTaskPhase,
  DrawingAiTaskPhaseRecord,
  DrawingAiTaskType,
} from "./drawingAiContract";

type BuildPendingPhasePlanInput = {
  intentKind?: DrawingAiInteractionIntentKind;
  shouldSearch: boolean;
};

type BuildPhaseHistoryInput = {
  taskType: DrawingAiTaskType;
  searchUsed: boolean;
  execution: DrawingAiTaskExecution | null;
  intentKind?: DrawingAiInteractionIntentKind;
};

const EXTERNAL_REFERENCE_PATTERN =
  /\b(youtube|youtu\.be|tiktok|vimeo|reference|references|inspiration|inspirations|find examples|example clips?|look up|search for|style ref(?:erence)?|show me refs?|real-world reference|animation reference)\b/i;

export const getDrawingAiTaskPhaseLabel = (phase: DrawingAiTaskPhase) => {
  if (phase === "analyzing-message") {
    return "Analyzing message";
  }

  if (phase === "thinking") {
    return "Thinking";
  }

  if (phase === "searching") {
    return "Searching";
  }

  if (phase === "planning") {
    return "Planning";
  }

  if (phase === "planning-animation") {
    return "Planning animation";
  }

  if (phase === "drawing") {
    return "Drawing";
  }

  if (phase === "generating-frames") {
    return "Generating frames";
  }

  if (phase === "generating-sound-effects") {
    return "Planning engine sound behavior";
  }

  return "Working";
};

export const buildDrawingAiSearchDecision = ({
  userMessage,
  taskType,
  requestedSearch = false,
}: {
  userMessage: string;
  taskType: DrawingAiTaskType;
  requestedSearch?: boolean;
}): DrawingAiSearchDecision => {
  const trimmedMessage = userMessage.trim();
  if (!trimmedMessage) {
    return {
      shouldSearch: false,
      reason: null,
      query: null,
    };
  }

  const wantsExternalReference = EXTERNAL_REFERENCE_PATTERN.test(trimmedMessage);
  const shouldSearch = requestedSearch || wantsExternalReference;

  if (!shouldSearch) {
    return {
      shouldSearch: false,
      reason: null,
      query: null,
    };
  }

  const reason =
    taskType === "generate-frames"
      ? "The user asked for outside references or inspiration for animation framing."
      : taskType === "generate-sounds"
        ? "The user asked for outside references or inspiration for sound behavior planning."
        : taskType === "generate-plans"
          ? "The user asked for outside references or inspiration for planning."
          : "The user asked for outside references or inspiration for workspace help.";

  return {
    shouldSearch: true,
    reason,
    query: trimmedMessage,
  };
};

export const buildDrawingAiPendingPhasePlan = ({
  intentKind = "task",
  shouldSearch,
}: BuildPendingPhasePlanInput): DrawingAiTaskPhase[] => {
  const phases: DrawingAiTaskPhase[] = ["analyzing-message", "thinking"];

  if (shouldSearch) {
    phases.push("searching", "thinking");
  }

  return phases;
};

export const buildDrawingAiExecutionPhasePlan = ({
  taskType,
  execution,
}: {
  taskType: DrawingAiTaskType;
  execution: DrawingAiTaskExecution | null;
}): DrawingAiTaskPhase[] => {
  if (!execution) {
    return [];
  }

  if (taskType === "generate-plans") {
    return execution.kind === "question-needed" ? [] : ["planning"];
  }

  if (taskType === "generate-frames") {
    if (execution.kind === "question-needed" || execution.kind === "unsupported") {
      return [];
    }

    return ["planning-animation"];
  }

  if (taskType === "generate-sounds") {
    if (execution.kind === "question-needed") {
      return [];
    }

    if (execution.kind === "imported-option-to-frame" || execution.kind === "voice-request-placeholder") {
      return ["working"];
    }

    if (execution.kind === "attached-to-frame") {
      return ["generating-sound-effects", "working"];
    }

    return ["generating-sound-effects"];
  }

  return execution.kind === "question-needed" ? [] : ["working"];
};

const toPhaseHistory = (phases: DrawingAiTaskPhase[]): DrawingAiTaskPhaseRecord[] =>
  phases.map((phase) => ({
    phase,
    label: getDrawingAiTaskPhaseLabel(phase),
  }));

export const buildDrawingAiPhaseHistory = ({
  taskType,
  searchUsed,
  execution,
  intentKind = "task",
}: BuildPhaseHistoryInput): DrawingAiTaskPhaseRecord[] => {
  const phases = buildDrawingAiPendingPhasePlan({
    intentKind,
    shouldSearch: searchUsed,
  });

  if (!execution) {
    return toPhaseHistory(phases);
  }

  if (execution.taskType === "generate-frames") {
    const framePhases = [...phases, ...buildDrawingAiExecutionPhasePlan({ taskType, execution })];
    if (execution.applyMode !== "none") {
      framePhases.push("drawing", "generating-frames");
    }
    return toPhaseHistory(framePhases);
  }

  if (execution.taskType === "generate-plans") {
    return toPhaseHistory([...phases, ...buildDrawingAiExecutionPhasePlan({ taskType, execution })]);
  }

  if (execution.taskType === "generate-sounds") {
    return toPhaseHistory([...phases, ...buildDrawingAiExecutionPhasePlan({ taskType, execution })]);
  }

  return toPhaseHistory([...phases, ...buildDrawingAiExecutionPhasePlan({ taskType, execution })]);
};
