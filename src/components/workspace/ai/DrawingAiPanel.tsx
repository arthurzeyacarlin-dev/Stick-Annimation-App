import { useEffect, useRef, useState } from "react";
import type { DragEvent, FormEvent, KeyboardEvent } from "react";
import {
  DRAWING_AI_FALLBACK_OUTPUT,
  DRAWING_AI_EDITED_FOLLOW_UP_FALLBACK_OUTPUT,
  DRAWING_AI_FINAL_PLAN_FALLBACK_OUTPUT,
  DRAWING_AI_FOLLOW_UP_FALLBACK_OUTPUT,
  DRAWING_AI_SOUND_OPTION_DRAG_TYPE,
  isDrawingAiVoicePlaceholderSoundOption,
  normalizeDrawingAiFollowUpQuestion,
  normalizeDrawingAiResponse,
  type DrawingAiActiveFollowUp,
  type DrawingAiActionPlan,
  type DrawingAiConversationMessage,
  type DrawingAiGenerateFramesState,
  type DrawingAiGeneratedFramePlan,
  type DrawingAiTaskExecution,
  type DrawingAiFollowUpMode,
  type DrawingAiFollowUpInteractionKind,
  type DrawingAiFollowUpMemoryItem,
  type DrawingAiProjectMemory,
  type DrawingAiQuestionCardKind,
  type DrawingAiReasoningLevel as ReasoningLevel,
  type DrawingAiRequest,
  type DrawingAiSoundOption,
  type DrawingAiTaskPhase,
  type DrawingAiTaskType as TaskType,
  type DrawingAiWorkspaceContext,
} from "@/src/lib/ai/drawingAiContract";
import { renderGeneratedFrame, type GeneratedFrameRenderResult } from "@/src/lib/ai/drawingFrameExecutor";
import {
  bindDrawingAiGenerateFramesStateToProject,
  bindDrawingAiProjectMemoryToProject,
  doesDrawingAiProjectMemoryMatchProject,
} from "@/src/lib/ai/drawingAiProjectMemory";
import { isVoiceLikeSoundOption, synthesizeSoundOptionToDataUrl } from "@/src/lib/ai/drawingSoundSynthesis";
import {
  isSoundGenerationEnabled,
  SOUND_GENERATION_DISABLED_MESSAGE,
} from "@/src/lib/ai/drawingSoundAvailability";
import { isDrawingAiTaskExecutionTemporarilyDisabled } from "@/src/lib/ai/drawingAiTaskAvailability";
import {
  readDrawingAiControlPreferences,
  writeDrawingAiControlPreferences,
} from "@/src/lib/ai/drawingAiControlPreferences";
import { FRAME_GENERATION_DEBOUNCE_MS } from "@/src/lib/ai/frameGenerationSafety";
import {
  buildDrawingAiExecutionPhasePlan,
  buildDrawingAiPendingPhasePlan,
  buildDrawingAiSearchDecision,
  getDrawingAiTaskPhaseLabel,
} from "@/src/lib/ai/drawingAiTaskPipeline";
import { WorkspaceAiComposerShell, WorkspaceAiPanelShell } from "./WorkspaceAiPanelShell";

type AIMessage = {
  role: "user" | "assistant";
  content: string;
  display?: "message" | "status" | "memory";
  taskType?: TaskType;
  resultKind?: "message" | "question" | "sound-options";
  questionCardKind?: DrawingAiQuestionCardKind | null;
  followUpMode?: DrawingAiFollowUpMode;
  followUpQuestion?: string | null;
  followUpMultiSelect?: boolean | null;
  followUpOptions?: string[] | null;
  generatedFramePlan?: DrawingAiGeneratedFramePlan | null;
  soundOptions?: DrawingAiSoundOption[] | null;
  actionPlan?: DrawingAiActionPlan;
  memoryAnswer?: string | null;
  excludeFromAiContext?: boolean;
};

type PendingAssistantReply = {
  requestPrompt: string;
  output: string;
  preReply: string | null;
  taskType: TaskType;
  execution: DrawingAiTaskExecution | null;
  resultKind: "message" | "question" | "sound-options";
  questionCardKind: DrawingAiQuestionCardKind | null;
  followUpMode: DrawingAiFollowUpMode;
  followUpQuestion: string | null;
  followUpMultiSelect: boolean | null;
  followUpOptions: string[] | null;
  generatedFramePlan: DrawingAiGeneratedFramePlan | null;
  generateFramesState: DrawingAiGenerateFramesState | null;
  projectAiMemory: DrawingAiProjectMemory | null;
  soundOptions: DrawingAiSoundOption[] | null;
  actionPlan: DrawingAiActionPlan;
};

type FollowUpMemoryRow = DrawingAiFollowUpMemoryItem & {
  followUpIntro?: string | null;
  taskType?: TaskType;
  questionCardKind?: DrawingAiQuestionCardKind | null;
};

type DrawingAiPanelProps = {
  workspaceContext?: DrawingAiWorkspaceContext | null;
  projectAiMemory?: DrawingAiProjectMemory | null;
  onProjectAiMemoryChange?: (memory: DrawingAiProjectMemory | null) => void;
  onApplyGeneratedFrame?: (result: ReturnType<typeof renderGeneratedFrame>, source: { prompt: string; response: string }) => Promise<boolean> | boolean;
  onExecuteActionPlan?: (actionPlan: NonNullable<DrawingAiActionPlan>) => Promise<boolean> | boolean;
  readOnly?: boolean;
};

type StatusPhase = "idle" | DrawingAiTaskPhase | "revealing";

const ANALYZING_STATUS_MS = 650;
const THINKING_STATUS_MS = 300;
const SEARCHING_STATUS_MS = 1100;
const PLANNING_STATUS_MS = 320;
const EXECUTING_STATUS_MS = 260;
const MAX_COMPOSER_TEXTAREA_HEIGHT = 42;
const PRE_PLAN_BUBBLE_PAUSE_MS = 820;
const TYPE_MY_OWN_ANSWER_OPTION = "I'll type my own";
const COMMAND_DIRECTOR_MODE = true;
const REASONING_OPTIONS: Array<{
  value: ReasoningLevel;
  label: string;
  description: string;
  tint: string;
}> = [
  {
    value: "low",
    label: "Low",
    description: "Low reasoning for simple tasks and lighter thinking.",
    tint: "rgba(78, 214, 132, 0.92)",
  },
  {
    value: "medium",
    label: "Medium",
    description: "Medium reasoning for balanced thinking and normal tasks.",
    tint: "rgba(239, 203, 90, 0.94)",
  },
  {
    value: "high",
    label: "High",
    description: "High reasoning for stronger thinking and harder tasks.",
    tint: "rgba(255, 162, 78, 0.95)",
  },
  {
    value: "extra-high",
    label: "Extra High",
    description: "Extra high reasoning for high and complex tasks and pushing the AI to the limit.",
    tint: "rgba(255, 105, 105, 0.98)",
  },
];
const TASK_OPTIONS: Array<{
  value: TaskType;
  label: string;
  description: string;
  tint: string;
}> = [
  {
    value: "generate-plans",
    label: "Generate Plans",
    description: "Create clear plans for animations, scenes, and ideas.",
    tint: "rgba(110, 170, 255, 0.96)",
  },
  {
    value: "generate-frames",
    label: "Generate Frames",
    description: "Prepare frame ideas and visual generation tasks.",
    tint: "rgba(84, 214, 201, 0.96)",
  },
  {
    value: "generate-sounds",
    label: "Generate Sounds",
    description: "Create music, sound effects, and audio ideas.",
    tint: "rgba(196, 134, 255, 0.96)",
  },
  {
    value: "other",
    label: "Other",
    description: "Use your own custom task by describing what you want.",
    tint: "rgba(214, 219, 228, 0.90)",
  },
];

const looksLikeFreshGeneratePlansStory = (input: string) => {
  const trimmedInput = input.trim();
  if (!trimmedInput) {
    return false;
  }

  const wordCount = trimmedInput.split(/\s+/).filter(Boolean).length;
  const normalizedInput = trimmedInput.toLowerCase();
  const hasMultipleSentenceMarkers = (trimmedInput.match(/[.!?]/g) ?? []).length >= 2;
  const hasStoryTransition = /\b(after|before|then|when|while|suddenly|right then|later)\b/.test(normalizedInput);
  const hasNarrativeDensity =
    /\bhe\b|\bshe\b|\bthey\b|\bsomeone\b|\bsomething\b/.test(normalizedInput) &&
    /\bsees\b|\bnotices\b|\bwalks\b|\bhears\b|\bfinds\b|\bopens\b|\bresponds\b|\blooks\b/.test(normalizedInput);

  return wordCount >= 14 || hasMultipleSentenceMarkers || (wordCount >= 10 && hasStoryTransition) || (wordCount >= 10 && hasNarrativeDensity);
};

const getNaturalGeneratePlansFollowUpRecoveryLine = (_isEditingExistingFollowUp = false) => "";

const shouldTreatFollowUpAsMultiSelect = (
  question: string | null | undefined,
  explicitMultiSelect: boolean | null | undefined,
) => {
  void question;
  return explicitMultiSelect === true;
};

const getStatusPhaseDuration = (phase: StatusPhase) => {
  if (phase === "analyzing-message") {
    return ANALYZING_STATUS_MS;
  }

  if (phase === "searching") {
    return SEARCHING_STATUS_MS;
  }

  if (phase === "thinking") {
    return THINKING_STATUS_MS;
  }

  if (phase === "planning" || phase === "planning-animation") {
    return PLANNING_STATUS_MS;
  }

  if (phase === "drawing" || phase === "generating-frames" || phase === "generating-sound-effects" || phase === "working") {
    return EXECUTING_STATUS_MS;
  }

  return 0;
};

const getQuestionCardLabel = (taskType: TaskType | undefined, kind: DrawingAiQuestionCardKind | null | undefined) => {
  if (kind === "planning" || taskType === "generate-plans") {
    return "Planning Question";
  }

  if (kind === "drawing" || taskType === "generate-frames") {
    return "Drawing Question";
  }

  if (kind === "sound" || taskType === "generate-sounds") {
    return "Sound Question";
  }

  return "Question";
};

const getSoundPreviewCacheKey = (option: DrawingAiSoundOption) =>
  [
    option.id,
    option.title,
    option.description,
    option.timingFeel ?? "",
    option.intensityFeel ?? "",
    option.durationSeconds != null ? option.durationSeconds.toFixed(3) : "",
    (option.negativeConstraints ?? []).join("|"),
    option.contentType ?? "sfx",
    option.speechText ?? "",
    option.soundFamily ?? "",
    option.soundProfile ?? "",
    option.planId ?? "",
    option.planSummary ?? "",
    option.previewSignature ?? "",
    option.validationStatus ?? "",
    option.referenceUsed === true ? "reference-used" : "",
    option.referenceSummary ?? "",
  ].join("::");

const getSoundPreviewLabel = (option: DrawingAiSoundOption) =>
  isDrawingAiVoicePlaceholderSoundOption(option)
    ? `Voice placeholder ready for ${option.title}. Local speech preview is not supported yet, but you can attach it to a timeline frame.`
    : `Preview ready for ${option.title}. Drag it to a timeline frame to attach it.`;

const hasGenerateFramesManualFallbackLanguage = (value: string) =>
  /\b(can(?:not|'t)|unable to)\b.*\b(canvas|chat|place|draw)\b/i.test(value) ||
  /\b(brush tool|drawing tool|draw it manually|manually draw|use the brush|use the drawing tool|switch tools?|draw it yourself|make it yourself)\b/i.test(value);

const buildGenerateFramesSuccessMessage = (
  result: Extract<GeneratedFrameRenderResult, { ok: true }>,
) => {
  const appliedFrameCount = result.frames.length;
  if (appliedFrameCount > 1) {
    return result.supportLevel === "partial"
      ? `Animation updated with ${appliedFrameCount} frames.`
      : `${result.summary} created across ${appliedFrameCount} frames.`;
  }

  return result.supportLevel === "partial"
    ? "Animation updated."
    : `${result.summary} created.`;
};

const buildUnsupportedGenerateFramesMessage = (reason: string) =>
  reason.trim().length > 0
    ? `Generate Frames could not apply the result automatically. ${reason}`
    : "Generate Frames could not apply the result automatically.";

const buildCommandDirectorQuestionOutput = (targetTaskType: TaskType, question: string) =>
  JSON.stringify(
    {
      commands: [
        {
          type: "request_execution_lock",
          target: targetTaskType,
          parameters: {
            timing: "immediate",
            spacing: "none",
            intensity: "locked",
            sequence: "critical-lock",
            constraints: "one-critical-execution-lock-missing",
            style: "question",
            continuation: false,
            question: question.trim(),
          },
        },
      ],
    },
    null,
    2,
  );

const buildActionPlanSuccessMessage = (actionPlan: NonNullable<DrawingAiActionPlan>) => {
  if (actionPlan.action === "save-project") {
    return "Engine executed the save-project command.";
  }

  if (actionPlan.action === "export-current-frame") {
    return "Engine executed the export-current-frame command.";
  }

  if (actionPlan.action === "attach-sound-option-to-frame" && actionPlan.soundOption && typeof actionPlan.frameIndex === "number") {
    return isDrawingAiVoicePlaceholderSoundOption(actionPlan.soundOption)
      ? `Engine executed the attach-sound-option-to-frame command for frame ${actionPlan.frameIndex + 1}. Local speech preview is still not supported.`
      : `Engine executed the attach-sound-option-to-frame command for frame ${actionPlan.frameIndex + 1}.`;
  }

  return "Engine executed the prepared command.";
};

export function DrawingAiPanel({
  workspaceContext = null,
  projectAiMemory = null,
  onProjectAiMemoryChange,
  onApplyGeneratedFrame,
  onExecuteActionPlan,
  readOnly = false,
}: DrawingAiPanelProps = {}) {
  const [initialControlPreferences] = useState(readDrawingAiControlPreferences);
  const [messages, setMessages] = useState<AIMessage[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isGeneratingFrames, setIsGeneratingFrames] = useState(false);
  const [reasoningLevel, setReasoningLevel] = useState<ReasoningLevel>(
    initialControlPreferences.reasoningLevel,
  );
  const [isReasoningMenuOpen, setIsReasoningMenuOpen] = useState(false);
  const [reasoningPreviewLevel, setReasoningPreviewLevel] = useState<ReasoningLevel | null>(null);
  const [taskType, setTaskType] = useState<TaskType>(initialControlPreferences.taskType);
  const [isTaskMenuOpen, setIsTaskMenuOpen] = useState(false);
  const [taskPreviewType, setTaskPreviewType] = useState<TaskType | null>(null);
  const [activeFollowUpSelections, setActiveFollowUpSelections] = useState<string[]>([]);
  const [followUpMemoryRows, setFollowUpMemoryRows] = useState<FollowUpMemoryRow[]>([]);
  const [generateFramesState, setGenerateFramesState] = useState<DrawingAiGenerateFramesState | null>(null);
  const [typedFollowUpTargetQuestion, setTypedFollowUpTargetQuestion] = useState<string | null>(null);
  const [previewedSoundOptionState, setPreviewedSoundOptionState] = useState<{
    key: string;
    messageIndex: number;
    label: string;
  } | null>(null);
  const aiMessagesRef = useRef<HTMLDivElement | null>(null);
  const aiComposerRef = useRef<HTMLTextAreaElement | null>(null);
  const reasoningControlRef = useRef<HTMLDivElement | null>(null);
  const reasoningButtonRef = useRef<HTMLButtonElement | null>(null);
  const reasoningOptionRefs = useRef<Record<ReasoningLevel, HTMLButtonElement | null>>({
    low: null,
    medium: null,
    high: null,
    "extra-high": null,
  });
  const taskControlRef = useRef<HTMLDivElement | null>(null);
  const taskButtonRef = useRef<HTMLButtonElement | null>(null);
  const taskOptionRefs = useRef<Record<TaskType, HTMLButtonElement | null>>({
    "generate-plans": null,
    "generate-frames": null,
    "generate-sounds": null,
    other: null,
  });
  const pendingRequestAbortRef = useRef<AbortController | null>(null);
  const isGeneratingFramesRef = useRef(false);
  const lastGenerateFramesRequestAtRef = useRef(0);
  const statusPhaseTimeoutRef = useRef<number | null>(null);
  const revealStartTimeoutRef = useRef<number | null>(null);
  const preReplyTimeoutRef = useRef<number | null>(null);
  const responseRevealTimeoutRef = useRef<number | null>(null);
  const pendingAssistantReplyRef = useRef<PendingAssistantReply | null>(null);
  const hasShownPendingPreReplyRef = useRef(false);
  const statusPhaseRef = useRef<StatusPhase>("idle");
  const statusPhaseStartedAtRef = useRef<number>(0);
  const statusSequenceRef = useRef<StatusPhase[]>([]);
  const statusSequenceIndexRef = useRef<number>(-1);
  const activeFollowUpKeyRef = useRef<string | null>(null);
  const previewedSoundOptionTimeoutRef = useRef<number | null>(null);
  const suppressNextSoundOptionClickRef = useRef(false);
  const previewAudioElementRef = useRef<HTMLAudioElement | null>(null);
  const soundPreviewCacheRef = useRef<Map<string, string>>(new Map());
  const soundPreviewPromiseCacheRef = useRef<Map<string, Promise<string>>>(new Map());

  useEffect(() => {
    setGenerateFramesState(projectAiMemory?.generateFramesState ?? null);
  }, [projectAiMemory?.generateFramesState, projectAiMemory?.lastUpdatedAt, workspaceContext?.projectId, workspaceContext?.projectTitle]);

  useEffect(() => {
    writeDrawingAiControlPreferences({
      reasoningLevel,
      taskType,
    });
  }, [reasoningLevel, taskType]);

  const releaseFrameGenerationLock = () => {
    isGeneratingFramesRef.current = false;
    setIsGeneratingFrames(false);
  };

  useEffect(
    () => () => {
      pendingRequestAbortRef.current?.abort();
      isGeneratingFramesRef.current = false;
      if (statusPhaseTimeoutRef.current) {
        window.clearTimeout(statusPhaseTimeoutRef.current);
      }
      if (revealStartTimeoutRef.current) {
        window.clearTimeout(revealStartTimeoutRef.current);
      }
      if (preReplyTimeoutRef.current) {
        window.clearTimeout(preReplyTimeoutRef.current);
      }
      if (responseRevealTimeoutRef.current) {
        window.clearTimeout(responseRevealTimeoutRef.current);
      }
      if (previewedSoundOptionTimeoutRef.current) {
        window.clearTimeout(previewedSoundOptionTimeoutRef.current);
      }
      if (previewAudioElementRef.current) {
        previewAudioElementRef.current.pause();
        previewAudioElementRef.current = null;
      }
    },
    [],
  );

  useEffect(() => {
    const container = aiMessagesRef.current;
    if (!container) {
      return;
    }

    container.scrollTop = container.scrollHeight;
  }, [isLoading, messages]);

  useEffect(() => {
    const textarea = aiComposerRef.current;
    if (!textarea) {
      return;
    }

    textarea.style.height = "0px";
    textarea.style.height = `${Math.min(textarea.scrollHeight, MAX_COMPOSER_TEXTAREA_HEIGHT)}px`;
    textarea.style.overflowY = textarea.scrollHeight > MAX_COMPOSER_TEXTAREA_HEIGHT ? "auto" : "hidden";
  }, [inputValue]);

  useEffect(() => {
    if (!isReasoningMenuOpen && !isTaskMenuOpen) {
      return;
    }

    const handlePointerDown = (event: globalThis.PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) {
        return;
      }

      if (
        reasoningControlRef.current?.contains(target) ||
        taskControlRef.current?.contains(target)
      ) {
        return;
      }

      setIsReasoningMenuOpen(false);
      setReasoningPreviewLevel(null);
      setIsTaskMenuOpen(false);
      setTaskPreviewType(null);
    };

    const handleFocusIn = (event: FocusEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) {
        return;
      }

      if (
        reasoningControlRef.current?.contains(target) ||
        taskControlRef.current?.contains(target)
      ) {
        return;
      }

      setIsReasoningMenuOpen(false);
      setReasoningPreviewLevel(null);
      setIsTaskMenuOpen(false);
      setTaskPreviewType(null);
    };

    window.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("focusin", handleFocusIn);

    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("focusin", handleFocusIn);
    };
  }, [isReasoningMenuOpen, isTaskMenuOpen]);

  const selectedReasoningOption =
    REASONING_OPTIONS.find((option) => option.value === reasoningLevel) ?? REASONING_OPTIONS[1];
  const previewReasoningLevel = reasoningPreviewLevel ?? reasoningLevel;
  const previewReasoningIndex = Math.max(
    0,
    REASONING_OPTIONS.findIndex((option) => option.value === previewReasoningLevel),
  );
  const previewReasoningOption = REASONING_OPTIONS[previewReasoningIndex] ?? selectedReasoningOption;
  const selectedTaskOption =
    TASK_OPTIONS.find((option) => option.value === taskType) ?? TASK_OPTIONS[0];
  const previewTaskType = taskPreviewType ?? taskType;
  const previewTaskIndex = Math.max(
    0,
    TASK_OPTIONS.findIndex((option) => option.value === previewTaskType),
  );
  const previewTaskOption = TASK_OPTIONS[previewTaskIndex] ?? selectedTaskOption;
  const activeFollowUpMessageIndex = (() => {
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      const message = messages[index];
      if (
        message?.role === "assistant" &&
        message.display === "message" &&
        message.followUpMode === "question-box"
      ) {
        return index;
      }
    }

    return -1;
  })();
  const activeFollowUpMessage =
    activeFollowUpMessageIndex >= 0 ? messages[activeFollowUpMessageIndex] : null;
  const activeFollowUpQuestionKey = activeFollowUpMessage?.followUpQuestion
    ? normalizeDrawingAiFollowUpQuestion(activeFollowUpMessage.followUpQuestion)
    : null;
  const activeFollowUpKey = activeFollowUpMessage
    ? `${activeFollowUpMessage.followUpQuestion ?? ""}::${(activeFollowUpMessage.followUpOptions ?? []).join("||")}`
    : null;

  const normalizeFollowUpQuestion = (question: string) => normalizeDrawingAiFollowUpQuestion(question);

  const sanitizeFollowUpOptions = (options: string[] | null | undefined) => {
    if (!Array.isArray(options)) {
      return null;
    }

    const nextOptions = options
      .map((option) => option.trim())
      .filter((option) => option.length > 0);

    return nextOptions.length > 0 ? nextOptions : null;
  };

  const sanitizeFollowUpIntro = (value: string | null | undefined) => {
    if (typeof value !== "string") {
      return null;
    }

    const trimmedValue = value.trim();
    return trimmedValue.length > 0 ? trimmedValue : null;
  };

  const buildActiveFollowUpFromMessage = (
    message: Pick<AIMessage, "followUpQuestion" | "followUpMultiSelect" | "followUpOptions"> | null,
  ): DrawingAiActiveFollowUp | null => {
    const question = message?.followUpQuestion?.trim() ?? "";
    if (!question) {
      return null;
    }

    return {
      question,
      followUpMultiSelect: shouldTreatFollowUpAsMultiSelect(
        message?.followUpQuestion,
        message?.followUpMultiSelect,
      ),
      followUpOptions: sanitizeFollowUpOptions(message?.followUpOptions),
    };
  };

  const dedupeFollowUpMemoryRows = (rows: FollowUpMemoryRow[]) => {
    const seenQuestions = new Set<string>();

    return rows.filter((row) => {
      const normalizedQuestion = normalizeFollowUpQuestion(row.question);
      if (!normalizedQuestion || seenQuestions.has(normalizedQuestion)) {
        return false;
      }

      seenQuestions.add(normalizedQuestion);
      return true;
    });
  };

  const filterAndDedupeMemoryMessages = (
    currentMessages: AIMessage[],
    allowedQuestions: Set<string>,
  ) => {
    const seenQuestions = new Set<string>();

    return currentMessages.filter((message) => {
      if (message.display !== "memory") {
        return true;
      }

      const normalizedQuestion = normalizeFollowUpQuestion(message.followUpQuestion ?? "");
      if (!normalizedQuestion || !allowedQuestions.has(normalizedQuestion) || seenQuestions.has(normalizedQuestion)) {
        return false;
      }

      seenQuestions.add(normalizedQuestion);
      return true;
    });
  };

  const upsertFollowUpMemoryRow = (
    currentRows: FollowUpMemoryRow[],
    nextRow: FollowUpMemoryRow,
    { trimDependentRows = false }: { trimDependentRows?: boolean } = {},
  ) => {
    const normalizedQuestion = normalizeFollowUpQuestion(nextRow.question);
    const sanitizedRow: FollowUpMemoryRow = {
      question: nextRow.question.trim(),
      answer: nextRow.answer.trim(),
      followUpIntro: sanitizeFollowUpIntro(nextRow.followUpIntro),
      followUpMultiSelect: shouldTreatFollowUpAsMultiSelect(
        nextRow.question,
        nextRow.followUpMultiSelect,
      ),
      followUpOptions: sanitizeFollowUpOptions(nextRow.followUpOptions),
    };
    const existingRowIndex = currentRows.findIndex(
      (row) => normalizeFollowUpQuestion(row.question) === normalizedQuestion,
    );

    if (existingRowIndex >= 0) {
      if (trimDependentRows) {
        return dedupeFollowUpMemoryRows([...currentRows.slice(0, existingRowIndex), sanitizedRow]);
      }

      return dedupeFollowUpMemoryRows(
        currentRows.map((row, index) => (index === existingRowIndex ? sanitizedRow : row)),
      );
    }

    return dedupeFollowUpMemoryRows([...currentRows, sanitizedRow]);
  };

  const removeTrailingQuestionBox = (currentMessages: AIMessage[], question?: string | null) => {
    if (currentMessages.length === 0) {
      return currentMessages;
    }

    const nextMessages = [...currentMessages];
    const lastMessage = nextMessages[nextMessages.length - 1];
    if (
      lastMessage.role === "assistant" &&
      lastMessage.display === "message" &&
      lastMessage.followUpMode === "question-box" &&
      (!question || normalizeFollowUpQuestion(lastMessage.followUpQuestion ?? "") === normalizeFollowUpQuestion(question))
    ) {
      nextMessages.pop();
    }

    return nextMessages;
  };

  const buildFollowUpMemoryMessage = (memoryRow: FollowUpMemoryRow): AIMessage => ({
    role: "assistant",
    content: "",
    display: "memory",
    taskType: memoryRow.taskType,
    questionCardKind: memoryRow.questionCardKind ?? null,
    followUpQuestion: memoryRow.question,
    followUpMultiSelect: memoryRow.followUpMultiSelect === true,
    followUpOptions: sanitizeFollowUpOptions(memoryRow.followUpOptions),
    soundOptions: null,
    memoryAnswer: memoryRow.answer,
    excludeFromAiContext: true,
  });

  const replaceQuestionBoxWithMemoryRow = (
    currentMessages: AIMessage[],
    memoryRow: FollowUpMemoryRow,
    nextFollowUpMemoryRows?: FollowUpMemoryRow[],
  ) => {
    const nextMessages = [...currentMessages];
    const normalizedQuestion = normalizeFollowUpQuestion(memoryRow.question);
    const allowedQuestions = new Set(
      (nextFollowUpMemoryRows ?? [memoryRow]).map((row) => normalizeFollowUpQuestion(row.question)),
    );

    for (let index = nextMessages.length - 1; index >= 0; index -= 1) {
      const message = nextMessages[index];
      if (
        message.role === "assistant" &&
        message.display === "message" &&
        message.followUpMode === "question-box" &&
        normalizeFollowUpQuestion(message.followUpQuestion ?? "") === normalizedQuestion
      ) {
        const rewoundMessages = nextMessages.slice(0, index + 1);
        rewoundMessages[index] = buildFollowUpMemoryMessage(memoryRow);
        return filterAndDedupeMemoryMessages(rewoundMessages, allowedQuestions);
      }
    }

    for (let index = 0; index < nextMessages.length; index += 1) {
      const message = nextMessages[index];
      if (
        message.role === "assistant" &&
        message.display === "memory" &&
        normalizeFollowUpQuestion(message.followUpQuestion ?? "") === normalizedQuestion
      ) {
        const rewoundMessages = nextMessages.slice(0, index + 1);
        rewoundMessages[index] = buildFollowUpMemoryMessage(memoryRow);
        return filterAndDedupeMemoryMessages(rewoundMessages, allowedQuestions);
      }
    }

    const messagesWithoutExistingQuestion = nextMessages.filter((message) => {
      const messageQuestion = normalizeFollowUpQuestion(message.followUpQuestion ?? "");
      if (messageQuestion !== normalizedQuestion) {
        return true;
      }

      return !(message.role === "assistant" && (message.display === "memory" || message.followUpMode === "question-box"));
    });

    return filterAndDedupeMemoryMessages(
      [...messagesWithoutExistingQuestion, buildFollowUpMemoryMessage(memoryRow)],
      allowedQuestions,
    );
  };

  const reopenMemoryRowAtIndex = (
    currentMessages: AIMessage[],
    index: number,
    memoryRow: FollowUpMemoryRow,
  ) => {
    const nextMessages = currentMessages.slice(0, index + 1);
    if (!nextMessages[index]) {
      return nextMessages;
    }

    nextMessages[index] = {
      role: "assistant",
      content: sanitizeFollowUpIntro(memoryRow.followUpIntro) ?? "",
      display: "message",
      taskType: memoryRow.taskType,
      resultKind: "question",
      questionCardKind: memoryRow.questionCardKind ?? null,
      followUpMode: "question-box",
      followUpQuestion: memoryRow.question,
      followUpMultiSelect: memoryRow.followUpMultiSelect === true,
      followUpOptions: memoryRow.followUpOptions ?? null,
      soundOptions: null,
      excludeFromAiContext: true,
    };

    return nextMessages;
  };

  const trimFollowUpMemoryRowsThroughQuestion = (
    currentRows: FollowUpMemoryRow[],
    question: string,
  ) => {
    const normalizedQuestion = normalizeFollowUpQuestion(question);
    const existingRowIndex = currentRows.findIndex(
      (row) => normalizeFollowUpQuestion(row.question) === normalizedQuestion,
    );

    if (existingRowIndex < 0) {
      return dedupeFollowUpMemoryRows(currentRows);
    }

    return dedupeFollowUpMemoryRows(currentRows.slice(0, existingRowIndex + 1));
  };

  useEffect(() => {
    if (activeFollowUpKeyRef.current === activeFollowUpKey) {
      return;
    }

    activeFollowUpKeyRef.current = activeFollowUpKey;
    setActiveFollowUpSelections([]);
  }, [activeFollowUpKey]);

  useEffect(() => {
    if (!activeFollowUpQuestionKey) {
      setTypedFollowUpTargetQuestion(null);
      return;
    }

    if (typedFollowUpTargetQuestion && typedFollowUpTargetQuestion !== activeFollowUpQuestionKey) {
      setTypedFollowUpTargetQuestion(null);
    }
  }, [activeFollowUpQuestionKey, typedFollowUpTargetQuestion]);

  const focusReasoningOption = (level: ReasoningLevel) => {
    window.requestAnimationFrame(() => {
      reasoningOptionRefs.current[level]?.focus();
    });
  };

  const focusTaskOption = (nextTaskType: TaskType) => {
    window.requestAnimationFrame(() => {
      taskOptionRefs.current[nextTaskType]?.focus();
    });
  };

  const closeReasoningMenu = (restoreButtonFocus = false) => {
    setIsReasoningMenuOpen(false);
    setReasoningPreviewLevel(null);

    if (restoreButtonFocus) {
      window.requestAnimationFrame(() => {
        reasoningButtonRef.current?.focus();
      });
    }
  };

  const openReasoningMenu = () => {
    if (readOnly) {
      return;
    }

    setIsTaskMenuOpen(false);
    setTaskPreviewType(null);
    setIsReasoningMenuOpen(true);
    setReasoningPreviewLevel(reasoningLevel);
    focusReasoningOption(reasoningLevel);
  };

  const moveReasoningOptionFocus = (direction: number) => {
    const nextIndex = Math.min(
      REASONING_OPTIONS.length - 1,
      Math.max(0, previewReasoningIndex + direction),
    );
    const nextOption = REASONING_OPTIONS[nextIndex];
    if (!nextOption) {
      return;
    }

    setReasoningPreviewLevel(nextOption.value);
    focusReasoningOption(nextOption.value);
  };

  const selectReasoningLevel = (nextLevel: ReasoningLevel, restoreButtonFocus = true) => {
    setReasoningLevel(nextLevel);
    closeReasoningMenu(restoreButtonFocus);
  };

  const closeTaskMenu = (restoreButtonFocus = false) => {
    setIsTaskMenuOpen(false);
    setTaskPreviewType(null);

    if (restoreButtonFocus) {
      window.requestAnimationFrame(() => {
        taskButtonRef.current?.focus();
      });
    }
  };

  const openTaskMenu = () => {
    if (readOnly) {
      return;
    }

    setIsReasoningMenuOpen(false);
    setReasoningPreviewLevel(null);
    setIsTaskMenuOpen(true);
    setTaskPreviewType(taskType);
    focusTaskOption(taskType);
  };

  const moveTaskOptionFocus = (direction: number) => {
    const nextIndex = Math.min(
      TASK_OPTIONS.length - 1,
      Math.max(0, previewTaskIndex + direction),
    );
    const nextOption = TASK_OPTIONS[nextIndex];
    if (!nextOption) {
      return;
    }

    setTaskPreviewType(nextOption.value);
    focusTaskOption(nextOption.value);
  };

  const selectTaskType = (nextTaskType: TaskType, restoreButtonFocus = true) => {
    setTaskType(nextTaskType);
    setPreviewedSoundOptionState(null);
    closeTaskMenu(restoreButtonFocus);
  };

  const getConversationHistoryFromMessages = (
    messageList: AIMessage[],
  ): DrawingAiConversationMessage[] =>
    messageList
      .filter((message) => message.display === "message" && !message.excludeFromAiContext)
      .map((message) => ({
        role: message.role,
        content: [
          message.content,
          message.taskType === "generate-frames" &&
          Array.isArray(message.generatedFramePlan?.frames) &&
          message.generatedFramePlan.frames.length > 0
            ? [
                "Generated frame plan:",
                ...message.generatedFramePlan.frames.map(
                  (frame, index) =>
                    `Frame ${index + 1}: ${frame.pose}${frame.description ? ` — ${frame.description}` : ""}`,
                ),
              ].join("\n")
            : null,
          Array.isArray(message.soundOptions) && message.soundOptions.length > 0
            ? message.soundOptions
                .map((option, optionIndex) => {
                  const detailParts = [
                    option.description,
                    option.timingFeel ? `Timing: ${option.timingFeel}` : null,
                    option.intensityFeel ? `Feel: ${option.intensityFeel}` : null,
                  ].filter(Boolean);

                  return `${optionIndex + 1}. ${option.title}${detailParts.length > 0 ? ` — ${detailParts.join(" | ")}` : ""}`;
                })
                .join("\n")
            : null,
        ]
          .filter((part): part is string => typeof part === "string" && part.trim().length > 0)
          .join("\n"),
      }))
      .slice(-8);

  const getMostRecentSoundOptionsFromMessages = (messageList: AIMessage[]): DrawingAiSoundOption[] | null => {
    for (let index = messageList.length - 1; index >= 0; index -= 1) {
      const message = messageList[index];
      if (!message || message.role !== "assistant" || !Array.isArray(message.soundOptions) || message.soundOptions.length === 0) {
        continue;
      }

      return message.soundOptions;
    }

    return null;
  };

  const clearAiTimers = () => {
    if (statusPhaseTimeoutRef.current) {
      window.clearTimeout(statusPhaseTimeoutRef.current);
      statusPhaseTimeoutRef.current = null;
    }

    if (revealStartTimeoutRef.current) {
      window.clearTimeout(revealStartTimeoutRef.current);
      revealStartTimeoutRef.current = null;
    }

    if (preReplyTimeoutRef.current) {
      window.clearTimeout(preReplyTimeoutRef.current);
      preReplyTimeoutRef.current = null;
    }

    if (responseRevealTimeoutRef.current) {
      window.clearTimeout(responseRevealTimeoutRef.current);
      responseRevealTimeoutRef.current = null;
    }
  };

  const appendAssistantMessage = ({
    content,
    display,
    taskType: messageTaskType = taskType,
    resultKind = "message",
    questionCardKind = null,
    followUpMode = "none",
    followUpQuestion = null,
    followUpMultiSelect = null,
    followUpOptions = null,
    generatedFramePlan = null,
    soundOptions = null,
    actionPlan = null,
    excludeFromAiContext = false,
  }: {
    content: string;
    display: "message" | "status";
    taskType?: TaskType;
    resultKind?: "message" | "question" | "sound-options";
    questionCardKind?: DrawingAiQuestionCardKind | null;
    followUpMode?: DrawingAiFollowUpMode;
    followUpQuestion?: string | null;
    followUpMultiSelect?: boolean | null;
    followUpOptions?: string[] | null;
    generatedFramePlan?: DrawingAiGeneratedFramePlan | null;
    soundOptions?: DrawingAiSoundOption[] | null;
    actionPlan?: DrawingAiActionPlan;
    excludeFromAiContext?: boolean;
  }) => {
    setMessages((currentMessages) => [
      ...currentMessages,
      {
        role: "assistant",
        content,
        display,
        taskType: messageTaskType,
        resultKind,
        questionCardKind,
        followUpMode,
        followUpQuestion,
        followUpMultiSelect,
        followUpOptions,
        generatedFramePlan,
        soundOptions,
        actionPlan,
        excludeFromAiContext,
      },
    ]);
  };

  const replaceLastAssistantSlot = (
    content: string,
    display: "message" | "status",
    {
      taskType: messageTaskType = taskType,
      resultKind = "message",
      questionCardKind = null,
      followUpMode = "none",
      followUpQuestion = null,
      followUpMultiSelect = null,
      followUpOptions = null,
      generatedFramePlan = null,
      soundOptions = null,
      actionPlan = null,
      excludeFromAiContext = false,
    }: {
      taskType?: TaskType;
      resultKind?: "message" | "question" | "sound-options";
      questionCardKind?: DrawingAiQuestionCardKind | null;
      followUpMode?: DrawingAiFollowUpMode;
      followUpQuestion?: string | null;
      followUpMultiSelect?: boolean | null;
      followUpOptions?: string[] | null;
      generatedFramePlan?: DrawingAiGeneratedFramePlan | null;
      soundOptions?: DrawingAiSoundOption[] | null;
      actionPlan?: DrawingAiActionPlan;
      excludeFromAiContext?: boolean;
    } = {},
  ) => {
    setMessages((currentMessages) => {
      if (currentMessages.length === 0) {
        return [
          {
            role: "assistant",
            content,
            display,
            taskType: messageTaskType,
            resultKind,
            questionCardKind,
            followUpMode,
            followUpQuestion,
            followUpMultiSelect,
            followUpOptions,
            generatedFramePlan,
            soundOptions,
            actionPlan,
            excludeFromAiContext,
          },
        ];
      }

      const nextMessages = [...currentMessages];
      const lastMessage = nextMessages[nextMessages.length - 1];

      if (lastMessage.role !== "assistant") {
        return [
          ...nextMessages,
          {
            role: "assistant",
            content,
            display,
            taskType: messageTaskType,
            resultKind,
            questionCardKind,
            followUpMode,
            followUpQuestion,
            followUpMultiSelect,
            followUpOptions,
            generatedFramePlan,
            soundOptions,
            actionPlan,
            excludeFromAiContext,
          },
        ];
      }

      nextMessages[nextMessages.length - 1] = {
        role: "assistant",
        content,
        display,
        taskType: messageTaskType,
        resultKind,
        questionCardKind,
        followUpMode,
        followUpQuestion,
        followUpMultiSelect,
        followUpOptions,
        generatedFramePlan,
        soundOptions,
        actionPlan,
        excludeFromAiContext,
      };
      return nextMessages;
    });
  };

  const setStatusPhase = (phase: StatusPhase) => {
    statusPhaseRef.current = phase;
    statusPhaseStartedAtRef.current = phase === "idle" ? 0 : Date.now();

    if (phase === "idle") {
      statusSequenceRef.current = [];
      statusSequenceIndexRef.current = -1;
      return;
    }

    if (phase === "revealing") {
      return;
    }

    replaceLastAssistantSlot(getDrawingAiTaskPhaseLabel(phase), "status");
  };

  const scheduleNextStatusPhase = () => {
    const currentPhase = statusSequenceRef.current[statusSequenceIndexRef.current];
    const phaseDuration = currentPhase ? getStatusPhaseDuration(currentPhase) : 0;

    if (phaseDuration <= 0) {
      return;
    }

    statusPhaseTimeoutRef.current = window.setTimeout(() => {
      statusPhaseTimeoutRef.current = null;
      advanceStatusSequence();
    }, phaseDuration);
  };

  const startStatusSequence = (phases: StatusPhase[]) => {
    statusSequenceRef.current = phases;
    statusSequenceIndexRef.current = 0;
    setStatusPhase(phases[0]);
    scheduleNextStatusPhase();
  };

  const advanceStatusSequence = () => {
    if (statusPhaseRef.current === "idle" || statusPhaseRef.current === "revealing") {
      return;
    }

    const nextIndex = statusSequenceIndexRef.current + 1;
    if (nextIndex >= statusSequenceRef.current.length) {
      maybeStartAssistantReveal();
      return;
    }

    statusSequenceIndexRef.current = nextIndex;
    setStatusPhase(statusSequenceRef.current[nextIndex]);
    scheduleNextStatusPhase();
  };

  const maybeStartAssistantReveal = () => {
    const pendingAssistantReply = pendingAssistantReplyRef.current;
    if (!pendingAssistantReply) {
      return;
    }

    if (statusPhaseRef.current === "revealing") {
      return;
    }

    if (statusSequenceRef.current.length > 0 && statusSequenceIndexRef.current < statusSequenceRef.current.length - 1) {
      return;
    }

    const currentPhaseDuration = getStatusPhaseDuration(statusPhaseRef.current);
    if (currentPhaseDuration > 0) {
      const elapsedCurrentPhaseMs = Date.now() - statusPhaseStartedAtRef.current;
      const remainingCurrentPhaseMs = Math.max(0, currentPhaseDuration - elapsedCurrentPhaseMs);

      if (remainingCurrentPhaseMs > 0) {
        if (revealStartTimeoutRef.current) {
          window.clearTimeout(revealStartTimeoutRef.current);
        }

        revealStartTimeoutRef.current = window.setTimeout(() => {
          revealStartTimeoutRef.current = null;
          maybeStartAssistantReveal();
        }, remainingCurrentPhaseMs);
        return;
      }
    }

    if (revealStartTimeoutRef.current) {
      window.clearTimeout(revealStartTimeoutRef.current);
      revealStartTimeoutRef.current = null;
    }

    if (pendingAssistantReply.preReply && !hasShownPendingPreReplyRef.current) {
      hasShownPendingPreReplyRef.current = true;
      revealAssistantText({
        responseText: pendingAssistantReply.preReply,
        taskType: pendingAssistantReply.taskType,
        resultKind: "message",
        excludeFromAiContext: true,
        onComplete: () => {
          preReplyTimeoutRef.current = window.setTimeout(() => {
            preReplyTimeoutRef.current = null;
            appendAssistantMessage({
              content: "",
              display: "message",
              taskType: pendingAssistantReply.taskType,
              resultKind: pendingAssistantReply.resultKind,
              questionCardKind: pendingAssistantReply.questionCardKind,
              followUpMode: pendingAssistantReply.followUpMode,
              followUpQuestion: pendingAssistantReply.followUpQuestion,
              followUpMultiSelect: pendingAssistantReply.followUpMultiSelect,
              followUpOptions: pendingAssistantReply.followUpOptions,
              generatedFramePlan: pendingAssistantReply.generatedFramePlan,
            });
            revealAssistantMessage(
              pendingAssistantReply.requestPrompt,
              pendingAssistantReply.output,
              pendingAssistantReply.taskType,
              pendingAssistantReply.execution,
              pendingAssistantReply.resultKind,
              pendingAssistantReply.questionCardKind,
              pendingAssistantReply.followUpMode,
              pendingAssistantReply.followUpQuestion,
              pendingAssistantReply.followUpMultiSelect,
              pendingAssistantReply.followUpOptions,
              pendingAssistantReply.generatedFramePlan,
              pendingAssistantReply.generateFramesState,
              pendingAssistantReply.projectAiMemory,
              pendingAssistantReply.soundOptions,
              pendingAssistantReply.actionPlan,
            );
          }, PRE_PLAN_BUBBLE_PAUSE_MS);
        },
      });
      return;
    }

    revealAssistantMessage(
      pendingAssistantReply.requestPrompt,
      pendingAssistantReply.output,
      pendingAssistantReply.taskType,
      pendingAssistantReply.execution,
      pendingAssistantReply.resultKind,
      pendingAssistantReply.questionCardKind,
      pendingAssistantReply.followUpMode,
      pendingAssistantReply.followUpQuestion,
      pendingAssistantReply.followUpMultiSelect,
      pendingAssistantReply.followUpOptions,
      pendingAssistantReply.generatedFramePlan,
      pendingAssistantReply.generateFramesState,
      pendingAssistantReply.projectAiMemory,
      pendingAssistantReply.soundOptions,
      pendingAssistantReply.actionPlan,
    );
  };

  const revealAssistantText = ({
    responseText,
    taskType: messageTaskType = taskType,
    resultKind = "message",
    questionCardKind = null,
    followUpMode = "none",
    followUpQuestion = null,
    followUpMultiSelect = null,
    followUpOptions = null,
    generatedFramePlan = null,
    soundOptions = null,
    actionPlan = null,
    excludeFromAiContext = false,
    onComplete,
  }: {
    responseText: string;
    taskType?: TaskType;
    resultKind?: "message" | "question" | "sound-options";
    questionCardKind?: DrawingAiQuestionCardKind | null;
    followUpMode?: DrawingAiFollowUpMode;
    followUpQuestion?: string | null;
    followUpMultiSelect?: boolean | null;
    followUpOptions?: string[] | null;
    generatedFramePlan?: DrawingAiGeneratedFramePlan | null;
    soundOptions?: DrawingAiSoundOption[] | null;
    actionPlan?: DrawingAiActionPlan;
    excludeFromAiContext?: boolean;
    onComplete?: () => void;
  }) => {
    if (responseText.length === 0) {
      setStatusPhase("revealing");
      replaceLastAssistantSlot("", "message", {
        taskType: messageTaskType,
        resultKind: followUpMode === "question-box" ? "question" : resultKind,
        questionCardKind: followUpMode === "question-box" ? questionCardKind : null,
        followUpMode,
        followUpQuestion,
        followUpMultiSelect,
        followUpOptions,
        generatedFramePlan,
        soundOptions,
        actionPlan,
        excludeFromAiContext,
      });
      onComplete?.();
      return;
    }

    let revealedLength = 0;
    const revealChunkSize = Math.max(4, Math.ceil(responseText.length / 42));
    const revealNextChunk = () => {
      revealedLength = Math.min(responseText.length, revealedLength + revealChunkSize);
      return responseText.slice(0, revealedLength);
    };

    setStatusPhase("revealing");
    replaceLastAssistantSlot(revealNextChunk(), "message", {
      taskType: messageTaskType,
      resultKind: followUpMode === "question-box" ? "question" : resultKind,
      questionCardKind: followUpMode === "question-box" ? questionCardKind : null,
      generatedFramePlan: null,
      soundOptions: null,
    });

    const step = () => {
      const nextContent = revealNextChunk();
      const isComplete = revealedLength >= responseText.length;
      replaceLastAssistantSlot(nextContent, "message", {
        taskType: messageTaskType,
        resultKind: isComplete ? (followUpMode === "question-box" ? "question" : resultKind) : "message",
        questionCardKind: isComplete && followUpMode === "question-box" ? questionCardKind : null,
        followUpMode: isComplete ? followUpMode : "none",
        followUpQuestion: isComplete ? followUpQuestion : null,
        followUpMultiSelect: isComplete ? followUpMultiSelect : null,
        followUpOptions: isComplete ? followUpOptions : null,
        generatedFramePlan: isComplete ? generatedFramePlan : null,
        soundOptions: isComplete ? soundOptions : null,
        actionPlan: isComplete ? actionPlan : null,
        excludeFromAiContext: isComplete ? excludeFromAiContext : false,
      });

      if (isComplete) {
        responseRevealTimeoutRef.current = null;
        onComplete?.();
        return;
      }

      responseRevealTimeoutRef.current = window.setTimeout(step, 18);
    };

    responseRevealTimeoutRef.current = window.setTimeout(step, 18);
  };

  const revealAssistantMessage = (
    requestPrompt: string,
    responseText: string,
    messageTaskType: TaskType,
    execution: DrawingAiTaskExecution | null,
    resultKind: "message" | "question" | "sound-options",
    questionCardKind: DrawingAiQuestionCardKind | null,
    followUpMode: DrawingAiFollowUpMode,
    followUpQuestion: string | null,
    followUpMultiSelect: boolean | null,
    followUpOptions: string[] | null,
    generatedFramePlan: DrawingAiGeneratedFramePlan | null,
    nextGenerateFramesState: DrawingAiGenerateFramesState | null,
    nextProjectAiMemory: DrawingAiProjectMemory | null,
    soundOptions: DrawingAiSoundOption[] | null,
    actionPlan: DrawingAiActionPlan,
  ) => {
    pendingAssistantReplyRef.current = null;
    hasShownPendingPreReplyRef.current = false;
    void (async () => {
      let nextResponseText = responseText;
      let nextGeneratedFramePlan = generatedFramePlan;
      let resolvedGenerateFramesState = nextGenerateFramesState;
      let resolvedProjectAiMemory = nextProjectAiMemory;
      const isTaskExecutionDisabled = isDrawingAiTaskExecutionTemporarilyDisabled(messageTaskType);

      try {
        if (
          !isTaskExecutionDisabled &&
          messageTaskType === "generate-frames" &&
          execution?.taskType === "generate-frames" &&
          execution.applyMode !== "none" &&
          followUpMode === "none" &&
          typeof onApplyGeneratedFrame === "function" &&
          workspaceContext
        ) {
          if (isGeneratingFramesRef.current) {
            if (!COMMAND_DIRECTOR_MODE) {
              nextResponseText = "Frame generation is already running. Please wait for the current request to finish.";
            }
          } else if (!generatedFramePlan || generatedFramePlan.frames.length === 0) {
            if (!COMMAND_DIRECTOR_MODE) {
              nextResponseText = buildUnsupportedGenerateFramesMessage(
                "The structured frame data was missing, so nothing was applied to the timeline.",
              );
            }
            nextGeneratedFramePlan = null;
          } else {
            isGeneratingFramesRef.current = true;
            setIsGeneratingFrames(true);

          replaceLastAssistantSlot("Drawing", "status", {
            taskType: messageTaskType,
            resultKind: "message",
            excludeFromAiContext: true,
          });

            const frameRenderResult = renderGeneratedFrame({
              userPrompt: requestPrompt,
              generatedFramePlan,
              workspaceContext,
              width: workspaceContext.canvasWidth,
              height: workspaceContext.canvasHeight,
            });

            if (frameRenderResult.ok) {
              replaceLastAssistantSlot("Generating frames", "status", {
                taskType: messageTaskType,
                resultKind: "message",
                excludeFromAiContext: true,
              });

              const applied = await onApplyGeneratedFrame(frameRenderResult, {
                prompt: requestPrompt,
                response: responseText,
              });

              if (!COMMAND_DIRECTOR_MODE) {
                nextResponseText = applied
                  ? buildGenerateFramesSuccessMessage(frameRenderResult)
                  : "I understood that as a drawable frame, but I couldn't apply it to the active frame.";
              }
              if (!applied) {
                nextGeneratedFramePlan = null;
                resolvedGenerateFramesState = null;
                resolvedProjectAiMemory = projectAiMemory;
              }
            } else if ((!nextResponseText.trim() || hasGenerateFramesManualFallbackLanguage(nextResponseText)) && !COMMAND_DIRECTOR_MODE) {
              nextResponseText = buildUnsupportedGenerateFramesMessage(frameRenderResult.reason);
              nextGeneratedFramePlan = null;
              resolvedGenerateFramesState = null;
              resolvedProjectAiMemory = projectAiMemory;
            }

            releaseFrameGenerationLock();
          }
        }
      } catch (error) {
        console.error("Drawing AI workspace action failed.", error);
        if (messageTaskType === "generate-frames") {
          if (!COMMAND_DIRECTOR_MODE) {
            nextResponseText = "I understood that as a drawable frame, but something went wrong while applying it to the active frame.";
          }
          nextGeneratedFramePlan = null;
          resolvedGenerateFramesState = null;
          resolvedProjectAiMemory = projectAiMemory;
        }
        releaseFrameGenerationLock();
      }

      if (
        !isTaskExecutionDisabled &&
        isSoundGenerationEnabled() &&
        messageTaskType === "generate-sounds" &&
        execution?.taskType === "generate-sounds" &&
        soundOptions?.length
      ) {
        for (const option of soundOptions) {
          if (isVoiceLikeSoundOption(option)) {
            continue;
          }
          void ensureSoundPreviewDataUrl(option);
        }
      }

      revealAssistantText({
        responseText: nextResponseText,
        taskType: messageTaskType,
        resultKind,
        questionCardKind,
        followUpMode,
        followUpQuestion,
        followUpMultiSelect,
        followUpOptions,
        generatedFramePlan: nextGeneratedFramePlan,
        soundOptions,
        actionPlan,
        excludeFromAiContext: followUpMode === "question-box",
        onComplete: async () => {
          if (messageTaskType === "generate-frames" && nextGeneratedFramePlan && resolvedGenerateFramesState) {
            setGenerateFramesState(resolvedGenerateFramesState);
          }
          if (
            resolvedProjectAiMemory &&
            typeof onProjectAiMemoryChange === "function" &&
            (messageTaskType !== "generate-frames" ||
              execution?.taskType !== "generate-frames" ||
              execution.applyMode === "none" ||
              Boolean(nextGeneratedFramePlan && resolvedGenerateFramesState))
          ) {
            onProjectAiMemoryChange(
              messageTaskType === "generate-frames" && resolvedGenerateFramesState
                ? {
                    ...resolvedProjectAiMemory,
                    generateFramesState: resolvedGenerateFramesState,
                  }
                : resolvedProjectAiMemory,
            );
          }
          try {
            if (
              !isTaskExecutionDisabled &&
              actionPlan &&
              actionPlan.executionMode === "execute-now" &&
              typeof onExecuteActionPlan === "function"
            ) {
              const executed = await onExecuteActionPlan(actionPlan);
              if (!executed && !COMMAND_DIRECTOR_MODE) {
                replaceLastAssistantSlot(
                  actionPlan.action === "save-project"
                    ? "The engine could not execute the prepared save-project command automatically."
                    : actionPlan.action === "attach-sound-option-to-frame"
                      ? "The engine could not execute the prepared attach-sound-option-to-frame command automatically."
                    : "The engine could not execute the prepared command automatically.",
                  "message",
                  {
                    taskType: messageTaskType,
                    resultKind: "message",
                  },
                );
              } else if (executed && !COMMAND_DIRECTOR_MODE) {
                replaceLastAssistantSlot(buildActionPlanSuccessMessage(actionPlan), "message", {
                  taskType: messageTaskType,
                  resultKind: "message",
                });
              }
            }
          } catch (error) {
            console.error("Drawing AI workspace action failed.", error);
            if (!COMMAND_DIRECTOR_MODE) {
              replaceLastAssistantSlot(
                actionPlan?.action === "save-project"
                  ? "The engine could not execute the prepared save-project command automatically."
                  : actionPlan?.action === "attach-sound-option-to-frame"
                    ? "The engine could not execute the prepared attach-sound-option-to-frame command automatically."
                  : "The engine could not execute the prepared command automatically.",
                "message",
                {
                  taskType: messageTaskType,
                  resultKind: "message",
                },
              );
            }
          }

          setStatusPhase("idle");
          releaseFrameGenerationLock();
          setIsLoading(false);
        },
      });
    })();
  };

  const submitAiPrompt = async (
    promptText: string,
    {
      activeFollowUp = null,
      followUpAnswerSource = null,
    }: {
      activeFollowUp?: DrawingAiActiveFollowUp | null;
      followUpAnswerSource?: "typed" | "option" | null;
    } = {},
  ) => {
    const trimmedInput = promptText.trim();
    if (!trimmedInput || ((isLoading || isGeneratingFrames) && activeFollowUp === null)) {
      return;
    }

    if (taskType === "generate-frames" && activeFollowUp === null) {
      const now = Date.now();
      if (
        isGeneratingFramesRef.current ||
        now - lastGenerateFramesRequestAtRef.current < FRAME_GENERATION_DEBOUNCE_MS
      ) {
        return;
      }
      lastGenerateFramesRequestAtRef.current = now;
    }

    setPreviewedSoundOptionState(null);
    const isEditingExistingFollowUp =
      activeFollowUp !== null &&
      followUpMemoryRows.some(
        (row) =>
          normalizeFollowUpQuestion(row.question) ===
          normalizeFollowUpQuestion(activeFollowUp.question),
      );
    const followUpInteractionKind: DrawingAiFollowUpInteractionKind | null =
      activeFollowUp !== null
        ? isEditingExistingFollowUp
          ? "edit"
          : "answer"
        : null;
    const activeFollowUpIntro =
      activeFollowUp !== null ? sanitizeFollowUpIntro(activeFollowUpMessage?.content ?? null) : null;
    const resolvedMemoryRow =
      activeFollowUp && trimmedInput
        ? {
            question: activeFollowUp.question,
            answer: trimmedInput,
            followUpIntro: activeFollowUpIntro,
            followUpMultiSelect: activeFollowUp.followUpMultiSelect === true,
            followUpOptions: activeFollowUp.followUpOptions ?? null,
            taskType: activeFollowUpMessage?.taskType ?? taskType,
            questionCardKind: activeFollowUpMessage?.questionCardKind ?? null,
          }
        : null;
    const nextFollowUpMemoryRows = resolvedMemoryRow
      ? upsertFollowUpMemoryRow(followUpMemoryRows, resolvedMemoryRow, {
          trimDependentRows: activeFollowUp !== null,
        })
      : followUpMemoryRows;
    const shouldStartFreshGeneratePlansSession = taskType === "generate-plans" && activeFollowUp === null;
    const nextMessagesBeforeRequest = resolvedMemoryRow
      ? replaceQuestionBoxWithMemoryRow(messages, resolvedMemoryRow, nextFollowUpMemoryRows)
      : removeTrailingQuestionBox(messages, activeFollowUp?.question ?? null);
    const conversationHistory = shouldStartFreshGeneratePlansSession
      ? []
      : getConversationHistoryFromMessages(nextMessagesBeforeRequest);
    const recentSoundOptions =
      taskType === "generate-sounds" && !isSoundGenerationEnabled()
        ? null
        : getMostRecentSoundOptionsFromMessages(nextMessagesBeforeRequest);
    const requestFollowUpMemory = shouldStartFreshGeneratePlansSession ? [] : nextFollowUpMemoryRows;
    const searchDecision = buildDrawingAiSearchDecision({
      userMessage: trimmedInput,
      taskType,
    });
    const pendingPhases = buildDrawingAiPendingPhasePlan({
      shouldSearch: searchDecision.shouldSearch,
    });

    setMessages([
      ...nextMessagesBeforeRequest,
      {
        role: "user",
        content: trimmedInput,
        display: "message",
        taskType,
        resultKind: "message",
        excludeFromAiContext: activeFollowUp !== null,
      },
      {
        role: "assistant",
        content: getDrawingAiTaskPhaseLabel("analyzing-message"),
        display: "status",
        taskType,
        resultKind: "message",
        followUpOptions: null,
        soundOptions: null,
        excludeFromAiContext: true,
      },
    ]);
    if (activeFollowUp) {
      setFollowUpMemoryRows(nextFollowUpMemoryRows);
      setActiveFollowUpSelections([]);
    }
    setTypedFollowUpTargetQuestion(null);
    setIsReasoningMenuOpen(false);
    setReasoningPreviewLevel(null);
    setIsTaskMenuOpen(false);
    setTaskPreviewType(null);
    setInputValue("");
    setIsLoading(true);
    clearAiTimers();
    pendingAssistantReplyRef.current = null;
    hasShownPendingPreReplyRef.current = false;
    startStatusSequence(pendingPhases);
    pendingRequestAbortRef.current?.abort();
    const abortController = new AbortController();
    pendingRequestAbortRef.current = abortController;

    try {
      const currentProjectId =
        typeof workspaceContext?.projectId === "string" && workspaceContext.projectId.trim().length > 0
          ? workspaceContext.projectId.trim()
          : null;
      const scopedGenerateFramesState =
        taskType === "generate-frames"
          ? bindDrawingAiGenerateFramesStateToProject(generateFramesState, currentProjectId)
          : null;
      const boundProjectAiMemory = doesDrawingAiProjectMemoryMatchProject(projectAiMemory, currentProjectId)
        ? bindDrawingAiProjectMemoryToProject(projectAiMemory, currentProjectId)
        : null;
      const scopedProjectAiMemory =
        boundProjectAiMemory != null
          ? {
              ...boundProjectAiMemory,
              generateFramesState: scopedGenerateFramesState ?? boundProjectAiMemory.generateFramesState ?? null,
            }
          : null;
      const requestBody: DrawingAiRequest = {
        prompt: trimmedInput,
        shouldSearch: searchDecision.shouldSearch,
        reasoningLevel,
        taskType,
        workspaceType: "drawing",
        conversationHistory,
        followUpMemory: requestFollowUpMemory,
        activeFollowUp,
        followUpAnswerSource,
        followUpInteractionKind,
        workspaceContext,
        recentSoundOptions,
        generateFramesState: scopedGenerateFramesState,
        projectAiMemory: scopedProjectAiMemory,
      };

      const response = await fetch("/api/ai", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
        signal: abortController.signal,
      });

      const responseText = await response.text();
      let responseBody: unknown = null;

      if (responseText.trim().length > 0) {
        try {
          responseBody = JSON.parse(responseText);
        } catch {
          if (!response.ok) {
            throw new Error(
              `AI request failed with status ${response.status}: ${responseText.trim().slice(0, 240)}`,
            );
          }

          throw new Error(`AI route returned invalid JSON: ${responseText.trim().slice(0, 240)}`);
        }
      }

      if (!response.ok) {
        const routeError =
          responseBody &&
          typeof responseBody === "object" &&
          "error" in responseBody &&
          typeof (responseBody as { error?: unknown }).error === "string"
            ? (responseBody as { error: string }).error.trim()
            : "";
        throw new Error(
          routeError.length > 0 ? routeError : `AI request failed with status ${response.status}`,
        );
      }

      const responseFallbackOutput = activeFollowUp
        ? isEditingExistingFollowUp
          ? DRAWING_AI_EDITED_FOLLOW_UP_FALLBACK_OUTPUT
          : DRAWING_AI_FOLLOW_UP_FALLBACK_OUTPUT
        : taskType === "generate-plans"
          ? DRAWING_AI_FINAL_PLAN_FALLBACK_OUTPUT
          : DRAWING_AI_FALLBACK_OUTPUT;
      const parsedResponse = normalizeDrawingAiResponse(responseBody, {
        fallbackOutput: responseFallbackOutput,
        fallbackTaskType: taskType,
        fallbackReasoningLevel: reasoningLevel,
        logContext: "Drawing AI panel response parsing",
      });
      const normalizedReturnedFollowUpQuestion = parsedResponse?.followUpQuestion?.trim() || null;
      const shouldAllowBlankFollowUpOutput =
        parsedResponse.followUpMode === "question-box" &&
        (normalizedReturnedFollowUpQuestion !== null ||
          (Array.isArray(parsedResponse.followUpOptions) && parsedResponse.followUpOptions.length > 0));
      const shouldAllowBlankGenerateFramesOutput =
        parsedResponse.taskType === "generate-frames" && parsedResponse.followUpMode === "none";
      const output = shouldAllowBlankFollowUpOutput
        ? parsedResponse.output.trim()
        : shouldAllowBlankGenerateFramesOutput
        ? parsedResponse.output.trim()
        : parsedResponse.output.trim() || responseFallbackOutput;
      const shouldReaskActiveFollowUp =
        taskType === "generate-plans" &&
        activeFollowUp !== null &&
        parsedResponse.followUpMode === "none" &&
        output === responseFallbackOutput;
      const shouldSuppressRepeatedFollowUpQuestion =
        activeFollowUp !== null &&
        normalizedReturnedFollowUpQuestion !== null &&
        normalizeFollowUpQuestion(normalizedReturnedFollowUpQuestion) ===
          normalizeFollowUpQuestion(activeFollowUp.question);

      pendingAssistantReplyRef.current = {
        requestPrompt: trimmedInput,
        output:
          shouldReaskActiveFollowUp && !COMMAND_DIRECTOR_MODE
            ? activeFollowUpIntro ?? getNaturalGeneratePlansFollowUpRecoveryLine(isEditingExistingFollowUp)
            : shouldReaskActiveFollowUp && activeFollowUp
              ? buildCommandDirectorQuestionOutput("generate-plans", activeFollowUp.question)
              : output,
        preReply: parsedResponse?.preReply?.trim() || null,
        taskType: parsedResponse.taskType,
        execution: shouldReaskActiveFollowUp ? null : parsedResponse.execution ?? null,
        resultKind: parsedResponse.resultKind,
        questionCardKind: parsedResponse.questionCardKind,
        followUpMode:
          shouldReaskActiveFollowUp
            ? "question-box"
            : shouldSuppressRepeatedFollowUpQuestion
              ? "none"
              : parsedResponse?.followUpMode ?? "none",
        followUpQuestion: shouldSuppressRepeatedFollowUpQuestion
          ? null
          : shouldReaskActiveFollowUp
            ? activeFollowUp.question
            : normalizedReturnedFollowUpQuestion,
        followUpMultiSelect: shouldTreatFollowUpAsMultiSelect(
          shouldSuppressRepeatedFollowUpQuestion
            ? null
            : shouldReaskActiveFollowUp
              ? activeFollowUp.question
              : normalizedReturnedFollowUpQuestion,
          shouldSuppressRepeatedFollowUpQuestion
            ? null
            : shouldReaskActiveFollowUp
              ? activeFollowUp.followUpMultiSelect ?? null
              : parsedResponse?.followUpMultiSelect ?? null,
        ),
        followUpOptions:
          shouldSuppressRepeatedFollowUpQuestion
            ? null
            : shouldReaskActiveFollowUp
              ? COMMAND_DIRECTOR_MODE
                ? null
                : activeFollowUp.followUpOptions ?? null
              : COMMAND_DIRECTOR_MODE
                ? null
                : parsedResponse?.followUpOptions?.filter((option) => option.trim().length > 0) ?? null,
        generatedFramePlan: shouldReaskActiveFollowUp ? null : parsedResponse.generatedFramePlan ?? null,
        generateFramesState: shouldReaskActiveFollowUp ? null : parsedResponse.generateFramesState ?? null,
        projectAiMemory: shouldReaskActiveFollowUp ? null : parsedResponse.projectAiMemory ?? null,
        soundOptions: shouldReaskActiveFollowUp ? null : parsedResponse.soundOptions ?? null,
        actionPlan: shouldReaskActiveFollowUp ? null : parsedResponse.actionPlan ?? null,
      };
      hasShownPendingPreReplyRef.current = false;

      const executionPhases = buildDrawingAiExecutionPhasePlan({
        taskType: parsedResponse.taskType,
        execution: shouldReaskActiveFollowUp ? null : parsedResponse.execution ?? null,
      });
      if (executionPhases.length > 0) {
        startStatusSequence(executionPhases);
      }

      maybeStartAssistantReveal();
    } catch (error) {
      if (abortController.signal.aborted) {
        return;
      }

      clearAiTimers();
      pendingAssistantReplyRef.current = null;
      hasShownPendingPreReplyRef.current = false;
      console.error("Drawing workspace AI request failed:", error);
      if (taskType === "generate-plans" && activeFollowUp) {
        replaceLastAssistantSlot(
          COMMAND_DIRECTOR_MODE
            ? buildCommandDirectorQuestionOutput("generate-plans", activeFollowUp.question)
            : activeFollowUpIntro ?? getNaturalGeneratePlansFollowUpRecoveryLine(isEditingExistingFollowUp),
          "message",
          {
          followUpMode: "question-box",
          followUpQuestion: activeFollowUp.question,
          followUpMultiSelect: activeFollowUp.followUpMultiSelect ?? null,
          followUpOptions: activeFollowUp.followUpOptions ?? null,
          excludeFromAiContext: true,
          },
        );
      } else {
        replaceLastAssistantSlot(
          taskType === "generate-plans"
            ? DRAWING_AI_FINAL_PLAN_FALLBACK_OUTPUT
            : error instanceof Error && error.message.trim().length > 0
              ? error.message.trim()
              : "Sorry, I ran into an error. Please try again.",
          "message",
        );
      }
      setStatusPhase("idle");
      releaseFrameGenerationLock();
      setIsLoading(false);
    } finally {
      if (pendingRequestAbortRef.current === abortController) {
        pendingRequestAbortRef.current = null;
      }
    }
  };

  const handleAISubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (readOnly) {
      return;
    }
    const activeFollowUp = buildActiveFollowUpFromMessage(activeFollowUpMessage);
    const shouldTreatTypedSubmitAsFreshStory =
      taskType === "generate-plans" &&
      activeFollowUp !== null &&
      (
        typedFollowUpTargetQuestion == null ||
        typedFollowUpTargetQuestion !== activeFollowUpQuestionKey ||
        looksLikeFreshGeneratePlansStory(inputValue)
      );

    await submitAiPrompt(inputValue, {
      activeFollowUp: shouldTreatTypedSubmitAsFreshStory ? null : activeFollowUp,
      followUpAnswerSource: shouldTreatTypedSubmitAsFreshStory ? null : activeFollowUp ? "typed" : null,
    });
  };

  const handleComposerKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== "Enter" || event.shiftKey) {
      return;
    }

    event.preventDefault();
    event.currentTarget.form?.requestSubmit();
  };

  const focusComposerForCustomAnswer = () => {
    setActiveFollowUpSelections([]);
    setTypedFollowUpTargetQuestion(activeFollowUpQuestionKey);
    window.requestAnimationFrame(() => {
      aiComposerRef.current?.focus();
    });
  };

  const handleFollowUpOptionClick = (option: string, multiSelect: boolean) => {
    const activeFollowUp = buildActiveFollowUpFromMessage(activeFollowUpMessage);
    if (option === TYPE_MY_OWN_ANSWER_OPTION) {
      focusComposerForCustomAnswer();
      return;
    }

    setTypedFollowUpTargetQuestion(null);
    if (multiSelect) {
      setActiveFollowUpSelections((currentSelections) =>
        currentSelections.includes(option)
          ? currentSelections.filter((selection) => selection !== option)
          : [...currentSelections, option],
      );
      return;
    }

    void submitAiPrompt(option, {
      activeFollowUp,
      followUpAnswerSource: "option",
    });
  };

  const handleFollowUpContinue = () => {
    if (activeFollowUpSelections.length === 0) {
      return;
    }

    setTypedFollowUpTargetQuestion(null);
    void submitAiPrompt(activeFollowUpSelections.join(", "), {
      activeFollowUp: buildActiveFollowUpFromMessage(activeFollowUpMessage),
      followUpAnswerSource: "option",
    });
  };

  const showPreviewedSoundOptionState = (messageIndex: number, option: DrawingAiSoundOption) => {
    if (previewedSoundOptionTimeoutRef.current) {
      window.clearTimeout(previewedSoundOptionTimeoutRef.current);
    }

    setPreviewedSoundOptionState({
      key: `${messageIndex}:${option.id}`,
      messageIndex,
      label: getSoundPreviewLabel(option),
    });

    previewedSoundOptionTimeoutRef.current = window.setTimeout(() => {
      setPreviewedSoundOptionState((currentState) =>
        currentState?.messageIndex === messageIndex && currentState.key === `${messageIndex}:${option.id}` ? null : currentState,
      );
      previewedSoundOptionTimeoutRef.current = null;
    }, 2600);
  };

  const ensureSoundPreviewDataUrl = async (option: DrawingAiSoundOption) => {
    if (!isSoundGenerationEnabled()) {
      throw new Error(SOUND_GENERATION_DISABLED_MESSAGE);
    }

    if (isVoiceLikeSoundOption(option)) {
      throw new Error("Local speech preview is not supported yet.");
    }

    const previewCacheKey = getSoundPreviewCacheKey(option);
    const cachedPreview = soundPreviewCacheRef.current.get(previewCacheKey);
    if (cachedPreview) {
      return cachedPreview;
    }

    const inFlightPreview = soundPreviewPromiseCacheRef.current.get(previewCacheKey);
    if (inFlightPreview) {
      return inFlightPreview;
    }

    const nextPreviewPromise = synthesizeSoundOptionToDataUrl(option)
      .then((dataUrl) => {
        soundPreviewCacheRef.current.set(previewCacheKey, dataUrl);
        soundPreviewPromiseCacheRef.current.delete(previewCacheKey);
        return dataUrl;
      })
      .catch((error) => {
        soundPreviewPromiseCacheRef.current.delete(previewCacheKey);
        throw error;
      });

    soundPreviewPromiseCacheRef.current.set(previewCacheKey, nextPreviewPromise);
    return nextPreviewPromise;
  };

  const playPreviewAudio = async (messageIndex: number, option: DrawingAiSoundOption) => {
    if (!isSoundGenerationEnabled()) {
      setPreviewedSoundOptionState({
        key: `${messageIndex}:${option.id}`,
        messageIndex,
        label: SOUND_GENERATION_DISABLED_MESSAGE,
      });
      return;
    }

    showPreviewedSoundOptionState(messageIndex, option);

    if (isVoiceLikeSoundOption(option)) {
      setPreviewedSoundOptionState({
        key: `${messageIndex}:${option.id}`,
        messageIndex,
        label: `Local speech preview is not supported yet for ${option.title}, but you can attach this voice placeholder to a timeline frame.`,
      });
      return;
    }

    try {
      const dataUrl = await ensureSoundPreviewDataUrl(option);
      if (previewAudioElementRef.current) {
        previewAudioElementRef.current.pause();
      }

      const audio = new Audio(dataUrl);
      audio.currentTime = 0;
      previewAudioElementRef.current = audio;
      await audio.play();
      setPreviewedSoundOptionState({
        key: `${messageIndex}:${option.id}`,
        messageIndex,
        label: `Playing ${option.title}. Drag it to a timeline frame to attach it.`,
      });
    } catch (error) {
      console.warn("Sound preview synthesis failed.", error);
      setPreviewedSoundOptionState({
        key: `${messageIndex}:${option.id}`,
        messageIndex,
        label:
          error instanceof Error && error.message === SOUND_GENERATION_DISABLED_MESSAGE
            ? SOUND_GENERATION_DISABLED_MESSAGE
            : `I couldn't preview ${option.title} automatically yet.`,
      });
    }
  };

  const handleSoundOptionClick = (messageIndex: number, option: DrawingAiSoundOption) => {
    if (suppressNextSoundOptionClickRef.current) {
      suppressNextSoundOptionClickRef.current = false;
      return;
    }

    if (!isSoundGenerationEnabled()) {
      setPreviewedSoundOptionState({
        key: `${messageIndex}:${option.id}`,
        messageIndex,
        label: SOUND_GENERATION_DISABLED_MESSAGE,
      });
      return;
    }

    void playPreviewAudio(messageIndex, option);
  };

  const handleSoundOptionDragStart = (event: DragEvent<HTMLButtonElement>, option: DrawingAiSoundOption) => {
    if (!isSoundGenerationEnabled()) {
      event.preventDefault();
      suppressNextSoundOptionClickRef.current = false;
      return;
    }

    suppressNextSoundOptionClickRef.current = true;
    event.dataTransfer.effectAllowed = "copy";
    event.dataTransfer.setData(DRAWING_AI_SOUND_OPTION_DRAG_TYPE, JSON.stringify(option));
    event.dataTransfer.setData("text/plain", option.title);
  };

  const handleSoundOptionDragEnd = () => {
    window.setTimeout(() => {
      suppressNextSoundOptionClickRef.current = false;
    }, 0);
  };

  const handleFollowUpMemoryRowClick = (messageIndex: number, memoryRow: FollowUpMemoryRow) => {
    if (isLoading || isGeneratingFrames) {
      pendingRequestAbortRef.current?.abort();
      pendingRequestAbortRef.current = null;
      clearAiTimers();
      pendingAssistantReplyRef.current = null;
      hasShownPendingPreReplyRef.current = false;
      setStatusPhase("idle");
      releaseFrameGenerationLock();
      setIsLoading(false);
    }

    const nextSelections =
      memoryRow.followUpMultiSelect && Array.isArray(memoryRow.followUpOptions)
        ? memoryRow.answer
            .split(",")
            .map((selection) => selection.trim())
            .filter((selection) => memoryRow.followUpOptions?.includes(selection))
        : [];

    setActiveFollowUpSelections(nextSelections);
    setTypedFollowUpTargetQuestion(normalizeFollowUpQuestion(memoryRow.question));
    setFollowUpMemoryRows((currentRows) =>
      trimFollowUpMemoryRowsThroughQuestion(currentRows, memoryRow.question),
    );
    setMessages((currentMessages) => reopenMemoryRowAtIndex(currentMessages, messageIndex, memoryRow));
  };

  const handleReasoningButtonKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (isReasoningMenuOpen) {
        closeReasoningMenu();
        return;
      }

      openReasoningMenu();
      return;
    }

    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      openReasoningMenu();
      return;
    }

    if (event.key === "Escape" && isReasoningMenuOpen) {
      event.preventDefault();
      closeReasoningMenu(true);
    }
  };

  const handleReasoningOptionKeyDown = (
    event: KeyboardEvent<HTMLButtonElement>,
    optionIndex: number,
  ) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      moveReasoningOptionFocus(optionIndex >= REASONING_OPTIONS.length - 1 ? 0 : 1);
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      moveReasoningOptionFocus(optionIndex <= 0 ? 0 : -1);
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      closeReasoningMenu(true);
    }
  };

  const handleTaskButtonKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (isTaskMenuOpen) {
        closeTaskMenu();
        return;
      }

      openTaskMenu();
      return;
    }

    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      openTaskMenu();
      return;
    }

    if (event.key === "Escape" && isTaskMenuOpen) {
      event.preventDefault();
      closeTaskMenu(true);
    }
  };

  const handleTaskOptionKeyDown = (
    event: KeyboardEvent<HTMLButtonElement>,
    optionIndex: number,
  ) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      moveTaskOptionFocus(optionIndex >= TASK_OPTIONS.length - 1 ? 0 : 1);
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      moveTaskOptionFocus(optionIndex <= 0 ? 0 : -1);
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      closeTaskMenu(true);
    }
  };

  const renderGenerateFramesResultCard = (message: AIMessage) => {
    const framePlan = message.generatedFramePlan ?? null;

    if (!framePlan || framePlan.frames.length === 0) {
      return (
        <div
          style={{
            width: "min(460px, 92%)",
            padding: "12px 13px",
            borderRadius: 14,
            background: "rgba(255,255,255,0.05)",
            border: "1px solid rgba(255,255,255,0.12)",
            color: "rgba(240,244,248,0.86)",
          }}
        >
          <div
            style={{
              fontSize: 10,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: "rgba(180,224,214,0.70)",
              fontWeight: 800,
            }}
          >
            Generate Frames
          </div>
          <div
            style={{
              marginTop: 7,
              fontSize: 13,
              lineHeight: 1.45,
            }}
          >
            No safe frame plan was generated.
          </div>
        </div>
      );
    }

    return (
      <div
        style={{
          width: "min(460px, 92%)",
          padding: "12px 13px",
          borderRadius: 14,
          background: "rgba(76, 214, 201, 0.10)",
          border: "1px solid rgba(76, 214, 201, 0.24)",
          boxShadow: "0 16px 34px rgba(0,0,0,0.16)",
          color: "rgba(245,248,250,0.94)",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 12,
            alignItems: "baseline",
          }}
        >
          <div
            style={{
              fontSize: 10,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: "rgba(180,224,214,0.78)",
              fontWeight: 800,
            }}
          >
            Generate Frames
          </div>
          <div
            style={{
              fontSize: 11,
              color: "rgba(226,235,240,0.68)",
            }}
          >
            {framePlan.frames.length} frame{framePlan.frames.length === 1 ? "" : "s"} • {framePlan.requestKind}
          </div>
        </div>

        <div
          style={{
            marginTop: 10,
            display: "flex",
            flexDirection: "column",
            gap: 9,
          }}
        >
          {framePlan.frames.map((frame, frameIndex) => (
            <div
              key={`${frame.pose}-${frameIndex}`}
              style={{
                padding: "9px 10px",
                borderRadius: 10,
                background: "rgba(255,255,255,0.06)",
                border: "1px solid rgba(255,255,255,0.08)",
              }}
            >
              <div
                style={{
                  fontSize: 11,
                  color: "rgba(180,224,214,0.74)",
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                  fontWeight: 700,
                }}
              >
                Frame {frameIndex + 1}
              </div>
              <div
                style={{
                  marginTop: 4,
                  fontSize: 13,
                  color: "rgba(255,255,255,0.96)",
                  fontWeight: 700,
                  lineHeight: 1.35,
                }}
              >
                {frame.pose}
              </div>
              <div
                style={{
                  marginTop: 4,
                  fontSize: 12,
                  color: "rgba(232,237,242,0.82)",
                  lineHeight: 1.45,
                  whiteSpace: "pre-wrap",
                }}
              >
                {frame.description}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <>
      <style>{`
        .workspace-ai-composer-textarea {
          scrollbar-width: thin;
          scrollbar-color: rgba(255,255,255,0.18) transparent;
        }

        .workspace-ai-composer-textarea::-webkit-scrollbar {
          width: 10px;
        }

        .workspace-ai-composer-textarea::-webkit-scrollbar-track {
          background: transparent;
        }

        .workspace-ai-composer-textarea::-webkit-scrollbar-thumb {
          background: rgba(255,255,255,0.18);
          border-radius: 999px;
          border: 2px solid transparent;
          background-clip: padding-box;
        }

        .workspace-ai-composer-textarea::-webkit-scrollbar-thumb:hover {
          background: rgba(255,255,255,0.24);
          border: 2px solid transparent;
          background-clip: padding-box;
        }

        .workspace-ai-followup-memory-row {
          width: 100%;
          padding: 6px 8px;
          border-radius: 10px;
          border: none;
          background: transparent;
          text-align: left;
          cursor: pointer;
          transition: background-color 120ms ease;
        }

        .workspace-ai-followup-memory-row:hover {
          background: rgba(255,255,255,0.05);
        }

        .workspace-ai-status-placeholder {
          color: rgba(255,255,255,0.94);
          font-size: 12px;
          line-height: 1.2;
          letter-spacing: 0.01em;
          user-select: none;
          padding: 2px 0 4px 0;
        }

        .workspace-ai-status-label {
          display: inline-block;
          position: relative;
          color: rgba(255,255,255,0.94);
          will-change: transform;
          transform: translateZ(0);
        }

        .workspace-ai-status-label::after {
          content: attr(data-text);
          position: absolute;
          inset: 0;
          display: block;
          color: transparent;
          background-image: linear-gradient(
            98deg,
            rgba(19,22,28,0) 0%,
            rgba(19,22,28,0) 18%,
            rgba(132,141,152,0.14) 28%,
            rgba(97,107,119,0.32) 38%,
            rgba(58,66,76,0.56) 46%,
            rgba(22,25,31,0.80) 53%,
            rgba(10,12,16,0.88) 58%,
            rgba(22,25,31,0.80) 63%,
            rgba(58,66,76,0.56) 70%,
            rgba(97,107,119,0.32) 78%,
            rgba(132,141,152,0.14) 88%,
            rgba(19,22,28,0) 100%
          );
          background-size: 250% 100%;
          background-position: 150% 50%;
          background-repeat: no-repeat;
          -webkit-background-clip: text;
          background-clip: text;
          -webkit-text-fill-color: transparent;
          animation: workspace-ai-status-sweep 1.65s ease-in-out infinite;
          pointer-events: none;
          will-change: background-position;
        }

        @keyframes workspace-ai-status-sweep {
          0% {
            background-position: 150% 50%;
          }

          100% {
            background-position: -50% 50%;
          }
        }
      `}</style>
      <WorkspaceAiPanelShell
        bodyRef={aiMessagesRef}
        body={
          <>
            {messages.length === 0 && !isLoading && (
              <div
                style={{
                  flex: 1,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  textAlign: "center",
                  color: "rgba(255,255,255,0.34)",
                  fontSize: 14,
                  userSelect: "none",
                }}
              >
                Ask the assistant for help with your drawing.
              </div>
            )}

            {messages.map((message, index) => {
              const isQuestionBox = !COMMAND_DIRECTOR_MODE && message.followUpMode === "question-box";
              const isCurrentQuestionBox = isQuestionBox && index === activeFollowUpMessageIndex;
              const isMultiSelectQuestion = shouldTreatFollowUpAsMultiSelect(
                message.followUpQuestion,
                message.followUpMultiSelect,
              );
              const isMemoryRow = message.display === "memory";
              const messageTaskType = message.taskType ?? taskType;
              const questionCardLabel = getQuestionCardLabel(messageTaskType, message.questionCardKind);
              const soundOptions = Array.isArray(message.soundOptions) ? message.soundOptions : [];
              const isSoundOptionsMessage = !COMMAND_DIRECTOR_MODE && soundOptions.length > 0;
              const isGenerateFramesResultMessage =
                !COMMAND_DIRECTOR_MODE &&
                message.role === "assistant" &&
                messageTaskType === "generate-frames" &&
                message.display === "message" &&
                !isQuestionBox &&
                message.content.trim().length === 0;

              return (
                <div
                  key={`${message.role}-${index}-${message.content}-${message.followUpQuestion ?? ""}`}
                  style={{
                    display: "flex",
                    justifyContent: message.role === "user" ? "flex-end" : "flex-start",
                  }}
                >
                  <div
                    className={message.display === "status" ? "workspace-ai-status-placeholder" : undefined}
                    style={
                      message.display === "status"
                        ? {
                            maxWidth: "85%",
                            minHeight: 18,
                          }
                        : isMemoryRow
                          ? {
                              width: "min(430px, 90%)",
                            }
                          : isGenerateFramesResultMessage
                            ? {
                                width: "min(460px, 92%)",
                              }
                            : isQuestionBox
                              ? {
                                  width: "min(430px, 90%)",
                                  padding: "12px 13px",
                                  borderRadius: 14,
                                  background: "rgba(228,234,244,0.18)",
                                  border: "1px solid rgba(255,255,255,0.22)",
                                  boxShadow: "0 16px 34px rgba(0,0,0,0.20)",
                                  color: "rgba(248,250,252,0.96)",
                                }
                              : {
                                  maxWidth: "85%",
                                  padding: "10px 12px",
                                  borderRadius: 12,
                                  background: message.role === "user" ? "rgba(110,170,255,0.16)" : "rgba(255,255,255,0.06)",
                                  border:
                                    message.role === "user"
                                      ? "1px solid rgba(110,170,255,0.24)"
                                      : "1px solid rgba(255,255,255,0.10)",
                                  color: "rgba(255,255,255,0.88)",
                                  fontSize: 13,
                                  lineHeight: 1.45,
                                  fontFamily:
                                    COMMAND_DIRECTOR_MODE && message.role === "assistant"
                                      ? "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, Liberation Mono, monospace"
                                      : undefined,
                                  whiteSpace: "pre-wrap",
                                  wordBreak: "break-word",
                                }
                    }
                  >
                    {message.display === "status" ? (
                      <span className="workspace-ai-status-label" data-text={message.content}>
                        {message.content}
                      </span>
                    ) : isMemoryRow ? (
                      <button
                        type="button"
                        className="workspace-ai-followup-memory-row"
                        onClick={() =>
                          handleFollowUpMemoryRowClick(
                            index,
                            followUpMemoryRows.find(
                              (row) =>
                                normalizeFollowUpQuestion(row.question) ===
                                normalizeFollowUpQuestion(message.followUpQuestion ?? ""),
                            ) ?? {
                              question: message.followUpQuestion ?? "",
                              answer: message.memoryAnswer ?? "",
                              followUpIntro: null,
                              followUpMultiSelect: message.followUpMultiSelect === true,
                              followUpOptions: message.followUpOptions ?? null,
                              taskType: message.taskType,
                              questionCardKind: message.questionCardKind ?? null,
                            },
                          )
                        }
                        style={{
                          opacity: 1,
                          cursor: "pointer",
                          transition: "opacity 120ms ease",
                        }}
                      >
                        <div
                          style={{
                            color: "rgba(255,255,255,0.92)",
                            fontSize: 12,
                            fontWeight: 700,
                            lineHeight: 1.3,
                          }}
                        >
                          {message.followUpQuestion}
                        </div>
                        <div
                          style={{
                            marginTop: 2,
                            color: "rgba(220,225,234,0.62)",
                            fontSize: 11,
                            lineHeight: 1.35,
                            whiteSpace: "pre-wrap",
                            wordBreak: "break-word",
                          }}
                        >
                          {message.memoryAnswer}
                        </div>
                      </button>
                    ) : isQuestionBox ? (
                      <div>
                        <div
                          style={{
                            fontSize: 10,
                            letterSpacing: "0.12em",
                            textTransform: "uppercase",
                            color: "rgba(230,236,244,0.70)",
                            fontWeight: 800,
                          }}
                        >
                          {questionCardLabel}
                        </div>

                        {message.content.trim().length > 0 && (
                          <div
                            style={{
                              marginTop: 6,
                              color: "rgba(248,250,252,0.84)",
                              fontSize: 12,
                              lineHeight: 1.45,
                            }}
                          >
                            {message.content}
                          </div>
                        )}

                        {message.followUpQuestion && (
                          <div
                            style={{
                              marginTop: 8,
                              color: "rgba(255,255,255,0.98)",
                              fontSize: 13,
                              fontWeight: 700,
                              lineHeight: 1.4,
                            }}
                          >
                            {message.followUpQuestion}
                          </div>
                        )}

                        {Array.isArray(message.followUpOptions) && message.followUpOptions.length > 0 && (
                          <div
                            style={{
                              marginTop: 12,
                              display: "flex",
                              flexDirection: "column",
                              gap: 8,
                            }}
                          >
                            {message.followUpOptions.map((option) => {
                              const isSelected =
                                isCurrentQuestionBox && activeFollowUpSelections.includes(option);

                              return (
                                <button
                                  key={option}
                                  type="button"
                                  disabled={!isCurrentQuestionBox}
                                  onClick={() => handleFollowUpOptionClick(option, isMultiSelectQuestion)}
                                  style={{
                                    width: "100%",
                                    padding: "10px 12px",
                                    borderRadius: 12,
                                    border: isSelected
                                      ? "1px solid rgba(110,170,255,0.48)"
                                      : "1px solid rgba(255,255,255,0.12)",
                                    background: isSelected
                                      ? "rgba(110,170,255,0.20)"
                                      : "rgba(255,255,255,0.07)",
                                    color: isSelected
                                      ? "rgba(222,238,255,0.98)"
                                      : "rgba(250,252,255,0.92)",
                                    fontSize: 12,
                                    fontWeight: isSelected ? 700 : 600,
                                    lineHeight: 1.35,
                                    cursor: isCurrentQuestionBox ? "pointer" : "default",
                                    textAlign: "left",
                                    opacity: isCurrentQuestionBox ? 1 : 0.78,
                                  }}
                                >
                                  {option}
                                </button>
                              );
                            })}
                          </div>
                        )}

                        <div
                          style={{
                            marginTop: 12,
                            display: "flex",
                            flexDirection: "column",
                            gap: 8,
                          }}
                        >
                          {isMultiSelectQuestion &&
                            isCurrentQuestionBox &&
                            activeFollowUpSelections.length > 0 && (
                            <button
                              type="button"
                              onClick={handleFollowUpContinue}
                              style={{
                                width: "100%",
                                padding: "10px 12px",
                                borderRadius: 12,
                                border: "1px solid rgba(110,170,255,0.34)",
                                background: "rgba(110,170,255,0.18)",
                                color: "rgba(225,239,255,0.98)",
                                fontSize: 12,
                                fontWeight: 700,
                                lineHeight: 1.35,
                                cursor: "pointer",
                                textAlign: "left",
                                opacity: isCurrentQuestionBox ? 1 : 0.78,
                              }}
                            >
                              Continue with selected
                            </button>
                          )}

                          <button
                            type="button"
                            disabled={!isCurrentQuestionBox}
                            onClick={focusComposerForCustomAnswer}
                            style={{
                              width: "100%",
                              padding: "10px 12px",
                              borderRadius: 12,
                              border: "1px solid rgba(255,255,255,0.10)",
                              background: "rgba(36,40,48,0.86)",
                              color: "rgba(243,246,252,0.84)",
                              fontSize: 12,
                              fontWeight: 600,
                              lineHeight: 1.35,
                              cursor: isCurrentQuestionBox ? "pointer" : "default",
                              textAlign: "left",
                              opacity: isCurrentQuestionBox ? 1 : 0.78,
                            }}
                          >
                            {TYPE_MY_OWN_ANSWER_OPTION}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div>
                        {isGenerateFramesResultMessage ? (
                          renderGenerateFramesResultCard(message)
                        ) : (
                          <>
                            {message.content.trim().length > 0 && (
                              <div
                                style={{
                                  whiteSpace: "pre-wrap",
                                  wordBreak: "break-word",
                                }}
                              >
                                {message.content}
                              </div>
                            )}

                            {isSoundOptionsMessage && (
                              <div
                                style={{
                                  marginTop: message.content.trim().length > 0 ? 10 : 0,
                                  display: "flex",
                                  flexDirection: "column",
                                  gap: 8,
                                }}
                              >
                                {soundOptions.map((option, optionIndex) => {
                                  const optionKey = `${index}:${option.id}`;
                                  const isPreviewed = previewedSoundOptionState?.key === optionKey;

                                  return (
                                    <button
                                      key={option.id}
                                      type="button"
                                      draggable={isSoundGenerationEnabled()}
                                      onClick={() => void handleSoundOptionClick(index, option)}
                                      onDragStart={(event) => handleSoundOptionDragStart(event, option)}
                                      onDragEnd={handleSoundOptionDragEnd}
                                      style={{
                                        width: "100%",
                                        padding: "10px 12px",
                                        borderRadius: 12,
                                        border: isPreviewed
                                          ? "1px solid rgba(102,196,255,0.72)"
                                          : "1px solid rgba(142,102,255,0.34)",
                                        background: isPreviewed
                                          ? "rgba(102,196,255,0.16)"
                                          : "rgba(126,86,255,0.12)",
                                        color: "rgba(244,246,255,0.96)",
                                        textAlign: "left",
                                        cursor: isSoundGenerationEnabled() ? "grab" : "not-allowed",
                                        opacity: isSoundGenerationEnabled() ? 1 : 0.72,
                                      }}
                                    >
                                      <div
                                        style={{
                                          fontSize: 11,
                                          letterSpacing: "0.08em",
                                          textTransform: "uppercase",
                                          color: isPreviewed ? "rgba(192,232,255,0.96)" : "rgba(220,204,255,0.84)",
                                          fontWeight: 800,
                                        }}
                                      >
                                        Sound Effect {optionIndex + 1}
                                      </div>
                                      <div
                                        style={{
                                          marginTop: 4,
                                          fontSize: 13,
                                          fontWeight: 700,
                                          color: "rgba(255,255,255,0.96)",
                                        }}
                                      >
                                        {option.title}
                                      </div>
                                      <div
                                        style={{
                                          marginTop: 4,
                                          fontSize: 12,
                                          lineHeight: 1.4,
                                          color: "rgba(236,238,248,0.84)",
                                          whiteSpace: "pre-wrap",
                                          wordBreak: "break-word",
                                        }}
                                      >
                                        {option.description}
                                      </div>
                                      <div
                                        style={{
                                          marginTop: 6,
                                          display: "flex",
                                          gap: 10,
                                          flexWrap: "wrap",
                                          fontSize: 11,
                                          color: "rgba(222,226,242,0.74)",
                                        }}
                                      >
                                        {option.timingFeel && <span>Timing: {option.timingFeel}</span>}
                                        {option.intensityFeel && <span>Feel: {option.intensityFeel}</span>}
                                      </div>
                                      <div
                                        style={{
                                          marginTop: 8,
                                          fontSize: 11,
                                          color: isPreviewed ? "rgba(192,232,255,0.88)" : "rgba(222,226,242,0.70)",
                                          fontWeight: 600,
                                        }}
                                      >
                                        {isSoundGenerationEnabled()
                                          ? "Click to preview. Drag to the timeline to attach."
                                          : SOUND_GENERATION_DISABLED_MESSAGE}
                                      </div>
                                    </button>
                                  );
                                })}

                                {previewedSoundOptionState?.messageIndex === index && (
                                  <div
                                    style={{
                                      fontSize: 11,
                                      color: "rgba(192,232,255,0.86)",
                                      fontWeight: 600,
                                    }}
                                  >
                                    {previewedSoundOptionState.label}
                                  </div>
                                )}
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </>
        }
        composer={
          <form onSubmit={handleAISubmit}>
            <WorkspaceAiComposerShell
              input={
                <textarea
                  className="workspace-ai-composer-textarea"
                  ref={aiComposerRef}
                  value={inputValue}
                  onChange={(event) => {
                    if (readOnly) {
                      return;
                    }

                    setInputValue(event.target.value);
                  }}
                  onKeyDown={(event) => {
                    if (readOnly) {
                      return;
                    }

                    handleComposerKeyDown(event);
                  }}
                  placeholder="Chat here"
                  disabled={isLoading || isGeneratingFrames}
                  readOnly={readOnly}
                  tabIndex={readOnly ? -1 : undefined}
                  rows={1}
                  style={{
                    flex: 1,
                    minWidth: 0,
                    minHeight: 18,
                    maxHeight: MAX_COMPOSER_TEXTAREA_HEIGHT,
                    padding: 0,
                    paddingRight: 2,
                    border: "none",
                    background: "transparent",
                    color: "rgba(255,255,255,0.92)",
                    fontSize: 12,
                    lineHeight: 1.45,
                    resize: "none",
                    outline: "none",
                    overflowY: "hidden",
                    fontFamily: "inherit",
                  }}
                />
              }
              controls={
                <>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      flexShrink: 0,
                    }}
                  >
                    <div
                      ref={reasoningControlRef}
                      style={{
                        position: "relative",
                        flexShrink: 0,
                      }}
                    >
                      {isReasoningMenuOpen && (
                        <div
                          id="drawing-ai-reasoning-menu"
                          role="menu"
                          aria-label="Reasoning options"
                          onMouseLeave={() => setReasoningPreviewLevel(null)}
                          style={{
                            position: "absolute",
                            right: 0,
                            bottom: "calc(100% + 8px)",
                            width: 280,
                            maxWidth: "min(280px, calc(100vw - 56px))",
                            padding: 6,
                            borderRadius: 14,
                            border: "1px solid rgba(255,255,255,0.10)",
                            background: "rgba(16,20,26,0.98)",
                            boxShadow: "0 18px 42px rgba(0,0,0,0.38)",
                            display: "flex",
                            flexDirection: "column",
                            gap: 6,
                            zIndex: 20,
                          }}
                        >
                          {REASONING_OPTIONS.map((option, optionIndex) => {
                            const isSelected = option.value === reasoningLevel;
                            const isPreviewed = option.value === previewReasoningOption.value;

                            return (
                              <button
                                key={option.value}
                                ref={(node) => {
                                  reasoningOptionRefs.current[option.value] = node;
                                }}
                                type="button"
                                role="menuitemradio"
                                aria-checked={isSelected}
                                onClick={() => selectReasoningLevel(option.value)}
                                onMouseEnter={() => setReasoningPreviewLevel(option.value)}
                                onFocus={() => setReasoningPreviewLevel(option.value)}
                                onKeyDown={(event) => handleReasoningOptionKeyDown(event, optionIndex)}
                                style={{
                                  width: "100%",
                                  padding: "10px 11px",
                                  borderRadius: 10,
                                  border: isSelected
                                    ? `1px solid ${option.tint}`
                                    : "1px solid rgba(255,255,255,0.06)",
                                  background: isSelected
                                    ? "rgba(255,255,255,0.07)"
                                    : isPreviewed
                                      ? "rgba(255,255,255,0.05)"
                                      : "rgba(255,255,255,0.03)",
                                  display: "flex",
                                  alignItems: "flex-start",
                                  gap: 10,
                                  textAlign: "left",
                                  cursor: "pointer",
                                  outline: "none",
                                }}
                              >
                                <div
                                  aria-hidden="true"
                                  style={{
                                    width: 8,
                                    height: 8,
                                    borderRadius: 999,
                                    marginTop: 5,
                                    background: option.tint,
                                    boxShadow: isSelected ? `0 0 0 3px ${option.tint.replace(/0\.\d+\)/, "0.14)")}` : "none",
                                    flexShrink: 0,
                                  }}
                                />
                                <div style={{ minWidth: 0 }}>
                                  <div
                                    style={{
                                      color: isSelected ? option.tint : "rgba(255,255,255,0.92)",
                                      fontSize: 12,
                                      fontWeight: 700,
                                      lineHeight: 1.2,
                                    }}
                                  >
                                    {option.label}
                                  </div>
                                  <div
                                    style={{
                                      marginTop: 4,
                                      color: "rgba(255,255,255,0.56)",
                                      fontSize: 11,
                                      lineHeight: 1.35,
                                    }}
                                  >
                                    {option.description}
                                  </div>
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      )}

                      <button
                        ref={reasoningButtonRef}
                        type="button"
                        aria-haspopup="menu"
                        aria-expanded={isReasoningMenuOpen}
                        aria-controls="drawing-ai-reasoning-menu"
                        onClick={() => {
                          if (readOnly) {
                            return;
                          }

                          if (isReasoningMenuOpen) {
                            closeReasoningMenu();
                            return;
                          }

                          openReasoningMenu();
                        }}
                        onKeyDown={(event) => {
                          if (readOnly) {
                            return;
                          }

                          handleReasoningButtonKeyDown(event);
                        }}
                        style={{
                          height: 30,
                          padding: "0 10px",
                          borderRadius: 999,
                          border: isReasoningMenuOpen
                            ? "1px solid rgba(110,170,255,0.34)"
                            : "1px solid rgba(255,255,255,0.10)",
                          background: "rgba(255,255,255,0.04)",
                          color: "rgba(255,255,255,0.86)",
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 8,
                          cursor: "pointer",
                          boxShadow: isReasoningMenuOpen ? "0 0 0 1px rgba(110,170,255,0.10)" : "none",
                          outline: "none",
                        }}
                      >
                        <div
                          aria-hidden="true"
                          style={{
                            width: 7,
                            height: 7,
                            borderRadius: 999,
                            background: selectedReasoningOption.tint,
                            boxShadow: `0 0 0 3px ${selectedReasoningOption.tint.replace(/0\.\d+\)/, "0.12)")}`,
                            flexShrink: 0,
                          }}
                        />
                        <span
                          style={{
                            fontSize: 11,
                            lineHeight: 1,
                            whiteSpace: "nowrap",
                          }}
                        >
                          Reasoning: {selectedReasoningOption.label}
                        </span>
                        <svg
                          viewBox="0 0 12 12"
                          aria-hidden="true"
                          style={{
                            width: 10,
                            height: 10,
                            display: "block",
                            opacity: 0.72,
                            transform: isReasoningMenuOpen ? "rotate(180deg)" : "rotate(0deg)",
                            transition: "transform 140ms ease",
                          }}
                        >
                          <path
                            d="M2.25 4.25L6 8l3.75-3.75"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      </button>
                    </div>

                    <div
                      ref={taskControlRef}
                      style={{
                        position: "relative",
                        flexShrink: 0,
                      }}
                    >
                      {isTaskMenuOpen && (
                        <div
                          id="drawing-ai-task-menu"
                          role="menu"
                          aria-label="Task options"
                          onMouseLeave={() => setTaskPreviewType(null)}
                          style={{
                            position: "absolute",
                            right: 0,
                            bottom: "calc(100% + 8px)",
                            width: 280,
                            maxWidth: "min(280px, calc(100vw - 56px))",
                            padding: 6,
                            borderRadius: 14,
                            border: "1px solid rgba(255,255,255,0.10)",
                            background: "rgba(16,20,26,0.98)",
                            boxShadow: "0 18px 42px rgba(0,0,0,0.38)",
                            display: "flex",
                            flexDirection: "column",
                            gap: 6,
                            zIndex: 20,
                          }}
                        >
                          {TASK_OPTIONS.map((option, optionIndex) => {
                            const isSelected = option.value === taskType;
                            const isPreviewed = option.value === previewTaskOption.value;

                            return (
                              <button
                                key={option.value}
                                ref={(node) => {
                                  taskOptionRefs.current[option.value] = node;
                                }}
                                type="button"
                                role="menuitemradio"
                                aria-checked={isSelected}
                                onClick={() => selectTaskType(option.value)}
                                onMouseEnter={() => setTaskPreviewType(option.value)}
                                onFocus={() => setTaskPreviewType(option.value)}
                                onKeyDown={(event) => handleTaskOptionKeyDown(event, optionIndex)}
                                style={{
                                  width: "100%",
                                  padding: "10px 11px",
                                  borderRadius: 10,
                                  border: isSelected
                                    ? `1px solid ${option.tint}`
                                    : "1px solid rgba(255,255,255,0.06)",
                                  background: isSelected
                                    ? "rgba(255,255,255,0.07)"
                                    : isPreviewed
                                      ? "rgba(255,255,255,0.05)"
                                      : "rgba(255,255,255,0.03)",
                                  display: "flex",
                                  alignItems: "flex-start",
                                  gap: 10,
                                  textAlign: "left",
                                  cursor: "pointer",
                                  outline: "none",
                                }}
                              >
                                <div
                                  aria-hidden="true"
                                  style={{
                                    width: 8,
                                    height: 8,
                                    borderRadius: 999,
                                    marginTop: 5,
                                    background: option.tint,
                                    boxShadow: isSelected ? `0 0 0 3px ${option.tint.replace(/0\.\d+\)/, "0.14)")}` : "none",
                                    flexShrink: 0,
                                  }}
                                />
                                <div style={{ minWidth: 0 }}>
                                  <div
                                    style={{
                                      color: isSelected ? option.tint : "rgba(255,255,255,0.92)",
                                      fontSize: 12,
                                      fontWeight: 700,
                                      lineHeight: 1.2,
                                    }}
                                  >
                                    {option.label}
                                  </div>
                                  <div
                                    style={{
                                      marginTop: 4,
                                      color: "rgba(255,255,255,0.56)",
                                      fontSize: 11,
                                      lineHeight: 1.35,
                                    }}
                                  >
                                    {option.description}
                                  </div>
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      )}

                      <button
                        ref={taskButtonRef}
                        type="button"
                        aria-haspopup="menu"
                        aria-expanded={isTaskMenuOpen}
                        aria-controls="drawing-ai-task-menu"
                        onClick={() => {
                          if (readOnly) {
                            return;
                          }

                          if (isTaskMenuOpen) {
                            closeTaskMenu();
                            return;
                          }

                          openTaskMenu();
                        }}
                        onKeyDown={(event) => {
                          if (readOnly) {
                            return;
                          }

                          handleTaskButtonKeyDown(event);
                        }}
                        style={{
                          height: 30,
                          padding: "0 10px",
                          borderRadius: 999,
                          border: isTaskMenuOpen
                            ? "1px solid rgba(110,170,255,0.34)"
                            : "1px solid rgba(255,255,255,0.10)",
                          background: "rgba(255,255,255,0.04)",
                          color: "rgba(255,255,255,0.86)",
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 8,
                          cursor: "pointer",
                          boxShadow: isTaskMenuOpen ? "0 0 0 1px rgba(110,170,255,0.10)" : "none",
                          outline: "none",
                        }}
                      >
                        <div
                          aria-hidden="true"
                          style={{
                            width: 7,
                            height: 7,
                            borderRadius: 999,
                            background: selectedTaskOption.tint,
                            boxShadow: `0 0 0 3px ${selectedTaskOption.tint.replace(/0\.\d+\)/, "0.12)")}`,
                            flexShrink: 0,
                          }}
                        />
                        <span
                          style={{
                            fontSize: 11,
                            lineHeight: 1,
                            whiteSpace: "nowrap",
                          }}
                        >
                          Task: {selectedTaskOption.label}
                        </span>
                        <svg
                          viewBox="0 0 12 12"
                          aria-hidden="true"
                          style={{
                            width: 10,
                            height: 10,
                            display: "block",
                            opacity: 0.72,
                            transform: isTaskMenuOpen ? "rotate(180deg)" : "rotate(0deg)",
                            transition: "transform 140ms ease",
                          }}
                        >
                          <path
                            d="M2.25 4.25L6 8l3.75-3.75"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      </button>
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={isLoading || isGeneratingFrames || inputValue.trim().length === 0}
                    style={{
                      width: 28,
                      height: 28,
                      border: "none",
                      padding: 0,
                      cursor: isLoading || isGeneratingFrames || inputValue.trim().length === 0 ? "default" : "pointer",
                      opacity: isLoading || isGeneratingFrames || inputValue.trim().length === 0 ? 0.5 : 1,
                      background: "rgba(255,255,255,0.96)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                      borderRadius: 999,
                      boxShadow: "0 0 10px rgba(255,255,255,0.08)",
                      alignSelf: "flex-end",
                    }}
                  >
                    <svg viewBox="0 0 24 24" style={{ width: 16, height: 16, display: "block" }} aria-hidden="true">
                      <path
                        d="M5 12.5l4.2 4.2L19 7.8"
                        fill="none"
                        stroke="#0b0d12"
                        strokeWidth="2.8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </button>
                </>
              }
            />
          </form>
        }
      />
    </>
  );
}
