import type {
  DrawingAiConversationMessage,
  DrawingAiEngineCommandParameters,
  DrawingAiEngineCommandType,
  DrawingAiTaskType,
} from "./drawingAiContract";

export type OtherTaskRequestType = "plan" | "sound" | "frame" | "ui" | "unknown";
export type OtherTaskRouteTarget = DrawingAiTaskType;
export type OtherTaskCommandType = DrawingAiEngineCommandType | "routing-question";
export type OtherTaskCommandChain = "new" | "continue";

export type OtherTaskIntentExample = {
  id: string;
  userPrompt: string;
  requestType: OtherTaskRequestType;
  preferredRoute: OtherTaskRouteTarget;
  commandType: OtherTaskCommandType;
  commandAction: string;
  targetSystem: string;
  commandParameters: DrawingAiEngineCommandParameters;
  commandChain: OtherTaskCommandChain;
  likelyMeaning: string;
  expectedOutcome: string;
  executionGoal: string;
  notes: string;
  tags: string[];
};

export type OtherTaskExample = {
  id: string;
  mode: "other";
  category: string;
  requestType: OtherTaskRequestType;
  userPrompt: string;
  requestSummary: string;
  likelyMeaning: string[];
  expectedOutcome: string[];
  routingDecision: string;
  commandType: OtherTaskCommandType;
  commandAction: string;
  targetSystem: string;
  commandParameters: DrawingAiEngineCommandParameters;
  executionGoal: string;
  commandChain: OtherTaskCommandChain;
  knownFacts: string[];
  missingFacts: string[];
  strongestGap: string;
  bestQuestion: string | null;
  acceptableOptions: string[];
  badQuestions: string[];
  reasoning: string;
  shouldAskQuestion: boolean;
  shouldProceedWithoutQuestion: boolean;
  maxQuestionsBeforeProceeding: number;
  responseFocus: string[];
  consistencyRules: string[];
  qualityNotes: string[];
  badStyleNotes: string[];
  preferredRoute: OtherTaskRouteTarget;
  tags: string[];
  version: number;
  isActive: boolean;
};

type ExampleInput = Omit<
  OtherTaskExample,
  | "mode"
  | "version"
  | "isActive"
  | "maxQuestionsBeforeProceeding"
  | "responseFocus"
  | "consistencyRules"
  | "qualityNotes"
  | "badStyleNotes"
> &
  Partial<
    Pick<
      OtherTaskExample,
      "maxQuestionsBeforeProceeding" | "responseFocus" | "consistencyRules" | "qualityNotes" | "badStyleNotes"
    >
  >;

const TRAINING_VERSION = 4;
const DEFAULT_MAX_QUESTIONS = 1;

const COMMON_QUALITY_NOTES = [
  "Every example should expose request type, command type, command action, target system, command parameters, execution goal, and command chain.",
  "Classify the request before responding: plan, sound, frame, UI, or unknown.",
  "Task Other only converts user intent into engine-command intent.",
  "Translate likely human intent into engine-facing command intent: command type, action, parameters, target system, and execution goal.",
  "If the route is unclear, ask exactly one targeted question that decides the command path.",
  "If the request is clearly plan, frame, or sound work, prepare a command envelope with that planner as target system.",
  "If the request is clearly UI or workspace work, prepare a UI command envelope instead of describing click paths or step sequences.",
  "Keep continuation requests on the same command chain unless the user explicitly resets direction.",
  "Do not emit final plan content, final frame content, final sound content, or UI step sequences from Task Other.",
] as const;

const COMMON_BAD_STYLE_NOTES = [
  "Do not emit generated plan, frame, or sound content from Task Other.",
  "Do not describe UI clicks, buttons, or step-by-step procedures.",
  "Do not ask multiple questions in a row.",
  "Do not ask generic filler like 'Which direction generally?' or 'What's the task?'.",
  "Do not keep a clear plan, frame, or sound request in Other.",
  "Do not emit walkthrough text, coaching text, or non-command text when the job is command preparation.",
  "Do not break continuation requests into a brand-new command chain unless the user asks for a reset.",
];

const COMMON_CONSISTENCY_RULES = [
  "Always identify the request type internally before composing the reply.",
  "Use the smallest confident route: Generate Plans command planner, Generate Frames command planner, Generate Sounds command planner, or workspace UI command preparation.",
  "When the user likely wants a creative output, prepare the right command envelope instead of inventing fallback content.",
  "When the user likely wants a workspace or UI result, prepare a workspace UI command instead of describing click paths.",
  "If the request is ambiguous across task families, ask one targeted routing question and stop there.",
  "If the user says same project or implies continuation, keep the same command chain and only modify the requested part.",
  "Human expectation should map to command parameters and execution goals.",
] as const;

const createExample = (input: ExampleInput): OtherTaskExample => ({
  ...input,
  mode: "other",
  maxQuestionsBeforeProceeding: Math.min(
    input.maxQuestionsBeforeProceeding ?? (input.shouldAskQuestion ? DEFAULT_MAX_QUESTIONS : 0),
    DEFAULT_MAX_QUESTIONS,
  ),
  responseFocus: input.responseFocus ?? [],
  consistencyRules: input.consistencyRules ?? [...COMMON_CONSISTENCY_RULES],
  qualityNotes: input.qualityNotes ?? [...COMMON_QUALITY_NOTES],
  badStyleNotes: input.badStyleNotes ?? [...COMMON_BAD_STYLE_NOTES],
  version: TRAINING_VERSION,
  isActive: true,
});

const createProceedExample = (
  input: Omit<ExampleInput, "shouldAskQuestion" | "shouldProceedWithoutQuestion" | "bestQuestion" | "acceptableOptions"> & {
    bestQuestion?: string | null;
    acceptableOptions?: string[];
  },
) =>
  createExample({
    ...input,
    shouldAskQuestion: false,
    shouldProceedWithoutQuestion: true,
    bestQuestion: input.bestQuestion ?? null,
    acceptableOptions: input.acceptableOptions ?? [],
    maxQuestionsBeforeProceeding: 0,
  });

const createQuestionExample = (
  input: Omit<ExampleInput, "shouldAskQuestion" | "shouldProceedWithoutQuestion"> & {
    bestQuestion: string;
  },
) =>
  createExample({
    ...input,
    shouldAskQuestion: true,
    shouldProceedWithoutQuestion: false,
    maxQuestionsBeforeProceeding: 1,
  });

export const GENERATE_OTHER_INTENT_EXAMPLES: OtherTaskIntentExample[] = [
  {
    id: "other-intent-unknown-greeting",
    userPrompt: "hello",
    requestType: "unknown",
    preferredRoute: "other",
    commandType: "routing-question",
    commandAction: "resolve-command-path",
    targetSystem: "Task Other router",
    commandParameters: {
      decisionNeeded: "command-family",
    },
    commandChain: "new",
    likelyMeaning: "No command family is stated yet.",
    expectedOutcome: "Ask one routing question that selects the command lane.",
    executionGoal: "Resolve whether the request should route to plan, frame, sound, or UI commands.",
    notes: "Greeting-only input stays in routing when Task Other is active.",
    tags: ["unknown", "greeting", "clarify"],
  },
  {
    id: "other-intent-unknown-low-context",
    userPrompt: "this feels off",
    requestType: "unknown",
    preferredRoute: "other",
    commandType: "routing-question",
    commandAction: "resolve-fix-target",
    targetSystem: "Task Other router",
    commandParameters: {
      decisionNeeded: "fix-target",
    },
    commandChain: "continue",
    likelyMeaning: "The user expects a change, but the command family is missing.",
    expectedOutcome: "Ask one routing question that decides the execution path.",
    executionGoal: "Resolve whether the change belongs to plan, frame, sound, or UI commands.",
    notes: "Low-context revision requests stay in routing until the command family is known.",
    tags: ["unknown", "revision", "clarify"],
  },
  {
    id: "other-intent-ui-tool",
    userPrompt: "what does this button do",
    requestType: "ui",
    preferredRoute: "other",
    commandType: "ui-command",
    commandAction: "inspect-tool-intent",
    targetSystem: "workspace-ui engine",
    commandParameters: {
      scope: "current-tool",
    },
    commandChain: "new",
    likelyMeaning: "The user wants the selected control mapped to its intended behavior.",
    expectedOutcome: "Prepare a UI inspection command intent.",
    executionGoal: "Map the request to tool-intent inspection for the workspace engine.",
    notes: "Tool-behavior questions stay in Task Other as UI command preparation.",
    tags: ["ui", "button", "tool"],
  },
  {
    id: "other-intent-plan-direct",
    userPrompt: "turn this into a plan",
    requestType: "plan",
    preferredRoute: "generate-plans",
    commandType: "plan-command",
    commandAction: "prepare-plan-sequence",
    targetSystem: "Generate Plans command planner",
    commandParameters: {
      mode: "direct-plan",
      preserveContext: true,
    },
    commandChain: "new",
    likelyMeaning: "The user wants story or sequence planning.",
    expectedOutcome: "Prepare plan commands, not a final plan inside Task Other.",
    executionGoal: "Prepare engine-ready planning commands with targetSystem=Generate Plans command planner.",
    notes: "Direct planning language maps to plan-command preparation.",
    tags: ["plan", "story", "routing"],
  },
  {
    id: "other-intent-plan-next-beat",
    userPrompt: "what should happen next after this moment",
    requestType: "plan",
    preferredRoute: "generate-plans",
    commandType: "plan-command",
    commandAction: "extend-plan-sequence",
    targetSystem: "Generate Plans command planner",
    commandParameters: {
      continuation: true,
      preserveProjectContext: true,
      modifyOnlyRequestedPart: true,
    },
    commandChain: "continue",
    likelyMeaning: "The user wants the next beat or story continuation.",
    expectedOutcome: "Prepare the next-beat planning command chain.",
    executionGoal: "Continue the same plan command chain in Generate Plans.",
    notes: "Next-beat requests map to plan-command continuation even when phrased loosely.",
    tags: ["plan", "next-beat", "continuation"],
  },
  {
    id: "other-intent-frame-direct",
    userPrompt: "draw the next frame where he raises his arm",
    requestType: "frame",
    preferredRoute: "generate-frames",
    commandType: "frame-command",
    commandAction: "prepare-next-frame",
    targetSystem: "Generate Frames command planner",
    commandParameters: {
      poseAction: "raise-arm",
      continuation: true,
    },
    commandChain: "continue",
    likelyMeaning: "The user wants the next frame result.",
    expectedOutcome: "Prepare frame commands for the next pose.",
    executionGoal: "Prepare frame commands with targetSystem=Generate Frames command planner.",
    notes: "Direct frame-generation language maps to frame-command preparation.",
    tags: ["frame", "pose", "routing"],
  },
  {
    id: "other-intent-frame-batch",
    userPrompt: "make 14 frames",
    requestType: "unknown",
    preferredRoute: "other",
    commandType: "routing-question",
    commandAction: "resolve-frame-batch-anchor",
    targetSystem: "Task Other router",
    commandParameters: {
      frameCount: 14,
      decisionNeeded: "frame-batch-anchor",
    },
    commandChain: "new",
    likelyMeaning: "The user wants a frame batch, but the batch anchor is missing.",
    expectedOutcome: "Ask one routing question that decides whether the batch starts new or continues current context.",
    executionGoal: "Resolve whether the frame batch should create a new sequence or continue the current one.",
    notes: "Unanchored frame-batch requests stay in routing until sequence direction is clear.",
    tags: ["frame", "batch", "clarify"],
  },
  {
    id: "other-intent-frame-batch-anchored",
    userPrompt: "make 14 frames for this fight",
    requestType: "frame",
    preferredRoute: "generate-frames",
    commandType: "frame-command",
    commandAction: "generate-frame-batch",
    targetSystem: "Generate Frames command planner",
    commandParameters: {
      frameCount: 14,
      continuation: true,
      preserveProjectContext: true,
    },
    commandChain: "continue",
    likelyMeaning: "The user wants a frame batch generated from the current scene anchor.",
    expectedOutcome: "Prepare a frame-batch command envelope.",
    executionGoal: "Prepare a frame-batch command with the requested frame count and current scene anchor.",
    notes: "Anchored frame counts map to frame-batch commands.",
    tags: ["frame", "batch", "anchored"],
  },
  {
    id: "other-intent-frame-cleanup",
    userPrompt: "clean up this rough pose without changing it",
    requestType: "frame",
    preferredRoute: "generate-frames",
    commandType: "frame-command",
    commandAction: "prepare-frame-cleanup",
    targetSystem: "Generate Frames command planner",
    commandParameters: {
      preservePoseIntent: true,
      modifyOnlyRequestedPart: true,
      cleanupPass: true,
    },
    commandChain: "continue",
    likelyMeaning: "The user wants a cleanup pass on the current drawing.",
    expectedOutcome: "Prepare a frame-cleanup command set.",
    executionGoal: "Preserve the same frame command chain and modify only cleanup-related parameters.",
    notes: "Pose cleanup is still a frame-command request, not a generic fallback.",
    tags: ["frame", "cleanup", "pose"],
  },
  {
    id: "other-intent-sound-options",
    userPrompt: "give me 3 sound options for this explosion",
    requestType: "sound",
    preferredRoute: "generate-sounds",
    commandType: "sound-command",
    commandAction: "prepare-sound-options",
    targetSystem: "Generate Sounds command planner",
    commandParameters: {
      optionCount: 3,
      soundFamily: "explosion",
    },
    commandChain: "new",
    likelyMeaning: "The user wants sound ideation for one animation beat.",
    expectedOutcome: "Prepare sound behavior commands, not final audio output inside Task Other.",
    executionGoal: "Prepare sound behavior commands with targetSystem=Generate Sounds command planner.",
    notes: "Direct sound-option language maps to sound-command preparation.",
    tags: ["sound", "options", "explosion"],
  },
  {
    id: "other-intent-sound-choice",
    userPrompt: "i pick 2",
    requestType: "sound",
    preferredRoute: "generate-sounds",
    commandType: "sound-command",
    commandAction: "continue-sound-option-chain",
    targetSystem: "Generate Sounds command planner",
    commandParameters: {
      selectedOption: 2,
      continuation: true,
    },
    commandChain: "continue",
    likelyMeaning: "The user is selecting from a prior sound set.",
    expectedOutcome: "Continue the same sound command chain with the chosen option.",
    executionGoal: "Resolve the current sound command branch without resetting the chain.",
    notes: "Numeric choice replies should stay inside the existing sound command chain.",
    tags: ["sound", "choice", "follow-up"],
  },
  {
    id: "other-intent-ui-export",
    userPrompt: "export this",
    requestType: "ui",
    preferredRoute: "other",
    commandType: "ui-command",
    commandAction: "prepare-export-command",
    targetSystem: "workspace-ui engine",
    commandParameters: {
      commandFamily: "export",
      decisionNeeded: "export-target",
    },
    commandChain: "new",
    likelyMeaning: "The user wants export behavior configured.",
    expectedOutcome: "Prepare an export command intent.",
    executionGoal: "Map the request to a workspace UI export command.",
    notes: "Export requests stay in Task Other as UI command preparation.",
    tags: ["ui", "export", "workspace"],
  },
  {
    id: "other-intent-ui-import",
    userPrompt: "where do imported things go",
    requestType: "ui",
    preferredRoute: "other",
    commandType: "ui-command",
    commandAction: "prepare-import-placement-intent",
    targetSystem: "workspace-ui engine",
    commandParameters: {
      scope: "imported-assets",
      preserveProjectContext: true,
    },
    commandChain: "continue",
    likelyMeaning: "The user wants imported assets mapped into the correct workspace area.",
    expectedOutcome: "Prepare an import-placement command intent.",
    executionGoal: "Map the request to import-placement or import-organization behavior.",
    notes: "Import-placement questions are UI command requests.",
    tags: ["ui", "import", "organization"],
  },
  {
    id: "other-intent-custom-rename-project",
    userPrompt: "rename this project to Arena Fight",
    requestType: "unknown",
    preferredRoute: "other",
    commandType: "custom-command",
    commandAction: "prepare-custom-command",
    targetSystem: "engine",
    commandParameters: {
      intent: "rename project to Arena Fight",
      preserveProjectContext: true,
      modifyOnlyRequestedPart: true,
    },
    commandChain: "continue",
    likelyMeaning: "The user wants a direct project-level rename command.",
    expectedOutcome: "Prepare a custom command envelope.",
    executionGoal: "Prepare a generic engine command for a clear rename request without explanation.",
    notes: "Clear non-plan, non-frame, non-sound, non-UI requests can map to custom-command.",
    tags: ["custom", "rename", "project"],
  },
  {
    id: "other-intent-custom-duplicate-scene",
    userPrompt: "duplicate this scene",
    requestType: "unknown",
    preferredRoute: "other",
    commandType: "custom-command",
    commandAction: "prepare-custom-command",
    targetSystem: "engine",
    commandParameters: {
      intent: "duplicate this scene",
      preserveProjectContext: true,
      modifyOnlyRequestedPart: true,
    },
    commandChain: "continue",
    likelyMeaning: "The user wants a direct scene duplication command.",
    expectedOutcome: "Prepare a custom command envelope.",
    executionGoal: "Prepare a generic engine command for a clear duplication request without explanation.",
    notes: "Clear non-plan, non-frame, non-sound, non-UI requests can map to custom-command.",
    tags: ["custom", "duplicate", "scene"],
  },
  {
    id: "other-intent-unknown-continue",
    userPrompt: "continue this",
    requestType: "unknown",
    preferredRoute: "other",
    commandType: "routing-question",
    commandAction: "resolve-command-path",
    targetSystem: "Task Other router",
    commandParameters: {
      continuation: true,
      decisionNeeded: "command-family",
    },
    commandChain: "continue",
    likelyMeaning: "The user wants continuation, but the target command family is missing.",
    expectedOutcome: "Ask one routing question that decides the command path.",
    executionGoal: "Resolve whether to continue a plan, frame, sound, or UI command chain.",
    notes: "When the output family is unclear, Other should resolve the command path once.",
    tags: ["unknown", "continuation", "clarify"],
  },
  {
    id: "other-intent-unknown-better",
    userPrompt: "make this better",
    requestType: "unknown",
    preferredRoute: "other",
    commandType: "routing-question",
    commandAction: "resolve-improvement-target",
    targetSystem: "Task Other router",
    commandParameters: {
      decisionNeeded: "improvement-target",
    },
    commandChain: "continue",
    likelyMeaning: "The user wants a modification, but the command family is not specified.",
    expectedOutcome: "Ask one improvement-target question that decides the command path.",
    executionGoal: "Identify which command system should receive the modification request.",
    notes: "Improvement language alone is not enough to prepare the right command safely.",
    tags: ["unknown", "improve", "clarify"],
  },
];

const PLAN_ROUTE_EXAMPLES: OtherTaskExample[] = [
  createProceedExample({
    id: "other-route-plan-direct",
    category: "route-plan",
    requestType: "plan",
    userPrompt: "Turn this into a plan.",
    requestSummary: "Classify as plan. Prepare plan-command envelope.",
    likelyMeaning: ["The user wants the story or sequence organized into beats."],
    expectedOutcome: ["Prepare planning commands as a command envelope."],
    routingDecision: "Prepare a plan-command envelope with targetSystem=Generate Plans command planner.",
    commandType: "plan-command",
    commandAction: "prepare-plan-sequence",
    targetSystem: "Generate Plans command planner",
    commandParameters: {
      mode: "direct-plan",
      preserveContext: true,
    },
    executionGoal: "Produce ordered plan commands instead of a final plan inside Task Other.",
    commandChain: "new",
    knownFacts: ["The user explicitly asked for a plan."],
    missingFacts: [],
    strongestGap: "",
    bestQuestion: null,
    acceptableOptions: [],
    badQuestions: ["What button are you using?", "What else should happen somewhere?"],
    reasoning: "Explicit plan intent -> prepare plan-command envelope.",
    preferredRoute: "generate-plans",
    responseFocus: [
      "Classify this as a plan request.",
      "Prepare a plan-command envelope.",
      "Do not emit plan content from Task Other.",
    ],
    tags: ["plan", "routing", "direct"],
  }),
  createProceedExample({
    id: "other-route-plan-continuation",
    category: "route-plan",
    requestType: "plan",
    userPrompt: "Same project, add the next beat after this moment.",
    requestSummary: "Classify as plan. Continue existing plan-command chain.",
    likelyMeaning: ["The user wants the current story or sequence extended."],
    expectedOutcome: ["Prepare the next planning command segment without resetting project context."],
    routingDecision: "Preserve continuity and continue the same plan-command chain in Generate Plans.",
    commandType: "plan-command",
    commandAction: "extend-plan-sequence",
    targetSystem: "Generate Plans command planner",
    commandParameters: {
      continuation: true,
      preserveProjectContext: true,
      modifyOnlyRequestedPart: true,
    },
    executionGoal: "Continue the same planning command chain and insert only the requested beat.",
    commandChain: "continue",
    knownFacts: ["The same project should continue.", "The user asked for the next beat."],
    missingFacts: [],
    strongestGap: "",
    bestQuestion: null,
    acceptableOptions: [],
    badQuestions: ["Should this export somewhere?", "What frame are you on?"],
    reasoning: "Continuation language plus beat language makes this a planning command continuation.",
    preferredRoute: "generate-plans",
    responseFocus: [
      "Read this as plan continuation.",
      "Continue the same command chain.",
      "Do not emit plan content from Task Other.",
    ],
    tags: ["plan", "continuation", "same-project"],
  }),
];

const FRAME_ROUTE_EXAMPLES: OtherTaskExample[] = [
  createProceedExample({
    id: "other-route-frame-direct",
    category: "route-frame",
    requestType: "frame",
    userPrompt: "Draw the next frame where he turns and raises his arm.",
    requestSummary: "Classify as frame. Prepare next-frame command envelope.",
    likelyMeaning: ["The user wants the next pose or frame prepared for execution."],
    expectedOutcome: ["Prepare frame commands for the next pose state."],
    routingDecision: "Prepare a frame-command envelope with targetSystem=Generate Frames command planner.",
    commandType: "frame-command",
    commandAction: "prepare-next-frame",
    targetSystem: "Generate Frames command planner",
    commandParameters: {
      poseAction: "turn-and-raise-arm",
      continuation: true,
    },
    executionGoal: "Produce frame commands for the next visible pose.",
    commandChain: "continue",
    knownFacts: ["The user explicitly asked for the next frame."],
    missingFacts: [],
    strongestGap: "",
    bestQuestion: null,
    acceptableOptions: [],
    badQuestions: ["What export target do you need?", "Should I plan the story first?"],
    reasoning: "Direct frame requests should be translated into frame commands and handed off immediately.",
    preferredRoute: "generate-frames",
    responseFocus: [
      "Classify this as a frame request.",
      "Prepare frame commands for the next pose.",
      "Do not emit frame content from Task Other.",
    ],
    tags: ["frame", "routing", "direct"],
  }),
  createQuestionExample({
    id: "other-route-frame-batch",
    category: "route-frame",
    requestType: "unknown",
    userPrompt: "Make 14 frames.",
    requestSummary: "Classify as unknown until the batch anchor is known. Ask one frame-batch routing question.",
    likelyMeaning: ["The user wants a frame batch, but the sequence anchor is missing."],
    expectedOutcome: ["Ask one routing question that decides whether the batch starts new or continues current context."],
    routingDecision: "Stay in Task Other only long enough to resolve whether the frame batch starts a new sequence or continues the current one.",
    commandType: "routing-question",
    commandAction: "resolve-frame-batch-anchor",
    targetSystem: "Task Other router",
    commandParameters: {
      frameCount: 14,
      decisionNeeded: "frame-batch-anchor",
    },
    executionGoal: "Resolve whether the frame batch should create a new frame sequence or continue the current one.",
    commandChain: "new",
    knownFacts: ["The requested frame count is 14."],
    missingFacts: ["Whether the batch starts a new sequence or continues the current one."],
    strongestGap: "The frame-sequence anchor is missing.",
    bestQuestion: "Should this create a new frame sequence or continue the current one?",
    acceptableOptions: ["Create a new frame sequence", "Continue the current one"],
    badQuestions: ["What should each frame look like in prose?", "Should I route export first?"],
    reasoning: "Unanchored frame-count requests should resolve sequence direction before command preparation.",
    preferredRoute: "generate-frames",
    responseFocus: [
      "Classify this as unknown until the frame-sequence anchor is known.",
      "Ask exactly one frame-batch routing question.",
      "Do not emit frame content from Task Other.",
    ],
    tags: ["frame", "batch", "clarify"],
  }),
  createProceedExample({
    id: "other-route-frame-batch-anchored",
    category: "route-frame",
    requestType: "frame",
    userPrompt: "Make 14 frames for this fight.",
    requestSummary: "Classify as frame. Prepare frame-batch command for the anchored scene.",
    likelyMeaning: ["The user wants a frame batch prepared from the current scene anchor."],
    expectedOutcome: ["Prepare a frame-command envelope with frameCount=14."],
    routingDecision: "Prepare a frame-batch command envelope with targetSystem=Generate Frames command planner.",
    commandType: "frame-command",
    commandAction: "generate-frame-batch",
    targetSystem: "Generate Frames command planner",
    commandParameters: {
      frameCount: 14,
      continuation: true,
      preserveProjectContext: true,
    },
    executionGoal: "Prepare a frame-batch command for the requested frame count and anchored scene.",
    commandChain: "continue",
    knownFacts: ["The requested frame count is 14.", "The request is anchored to the current fight."],
    missingFacts: [],
    strongestGap: "",
    bestQuestion: null,
    acceptableOptions: [],
    badQuestions: ["What should each frame look like in prose?", "Should I route export first?"],
    reasoning: "Anchored frame count -> generate-frame-batch command.",
    preferredRoute: "generate-frames",
    responseFocus: [
      "Classify this as a frame batch request.",
      "Map the frame count into command parameters.",
      "Do not emit frame content from Task Other.",
    ],
    tags: ["frame", "batch", "anchored"],
  }),
  createProceedExample({
    id: "other-route-frame-cleanup",
    category: "route-frame",
    requestType: "frame",
    userPrompt: "Clean up this rough pose without changing the pose idea.",
    requestSummary: "Classify as frame. Continue frame-command chain with cleanup-only modification.",
    likelyMeaning: ["The drawing should stay the same idea but be cleaned up visually."],
    expectedOutcome: ["Prepare cleanup-oriented frame commands that preserve the existing pose intent."],
    routingDecision: "Prepare a frame-cleanup command update and send it to Generate Frames.",
    commandType: "frame-command",
    commandAction: "prepare-frame-cleanup",
    targetSystem: "Generate Frames command planner",
    commandParameters: {
      preservePoseIntent: true,
      modifyOnlyRequestedPart: true,
      cleanupPass: true,
    },
    executionGoal: "Continue the same frame command chain and modify only cleanup-related parameters.",
    commandChain: "continue",
    knownFacts: ["The user wants pose cleanup.", "The original pose idea should stay."],
    missingFacts: [],
    strongestGap: "",
    bestQuestion: null,
    acceptableOptions: [],
    badQuestions: ["Should I map workspace layout first?", "Do you want a sound instead?"],
    reasoning: "Cleanup intent -> frame-command modification with pose preservation.",
    preferredRoute: "generate-frames",
    responseFocus: [
      "Treat cleanup as frame-command work.",
      "Preserve the existing pose intent.",
      "Do not emit frame content from Task Other.",
    ],
    tags: ["frame", "cleanup", "pose"],
  }),
];

const SOUND_ROUTE_EXAMPLES: OtherTaskExample[] = [
  createProceedExample({
    id: "other-route-sound-options",
    category: "route-sound",
    requestType: "sound",
    userPrompt: "Give me 3 sound options for this explosion.",
    requestSummary: "Classify as sound. Prepare sound-option command envelope.",
    likelyMeaning: ["The user needs sound ideation for one animation beat."],
    expectedOutcome: ["Prepare sound behavior commands or options for the sound system."],
    routingDecision: "Prepare a sound-command envelope with targetSystem=Generate Sounds command planner.",
    commandType: "sound-command",
    commandAction: "prepare-sound-options",
    targetSystem: "Generate Sounds command planner",
    commandParameters: {
      optionCount: 3,
      soundFamily: "explosion",
    },
    executionGoal: "Produce sound behavior commands, not final audio output in Task Other.",
    commandChain: "new",
    knownFacts: ["The user explicitly asked for sound options.", "The sound target is an explosion."],
    missingFacts: [],
    strongestGap: "",
    bestQuestion: null,
    acceptableOptions: [],
    badQuestions: ["What should happen next in the story?", "Should this export somewhere?"],
    reasoning: "Option-generation for audio belongs in the sound command planner, not in Task Other.",
    preferredRoute: "generate-sounds",
    responseFocus: [
      "Classify this as a sound request.",
      "Prepare sound behavior commands.",
      "Do not improvise sound options inside Task Other.",
    ],
    tags: ["sound", "options", "routing"],
  }),
  createProceedExample({
    id: "other-route-sound-follow-up",
    category: "route-sound",
    requestType: "sound",
    userPrompt: "I pick 2.",
    requestSummary: "Classify as sound. Continue existing sound-command branch.",
    likelyMeaning: ["This is a follow-up branch selection inside the current sound chain."],
    expectedOutcome: ["Continue the existing sound command chain with the chosen branch."],
    routingDecision: "Continue the same sound-command chain in Generate Sounds.",
    commandType: "sound-command",
    commandAction: "continue-sound-option-chain",
    targetSystem: "Generate Sounds command planner",
    commandParameters: {
      selectedOption: 2,
      continuation: true,
    },
    executionGoal: "Resolve the selected sound command branch without generating a new unrelated set.",
    commandChain: "continue",
    knownFacts: ["The user is choosing by number from existing options."],
    missingFacts: [],
    strongestGap: "",
    bestQuestion: null,
    acceptableOptions: [],
    badQuestions: ["What else should change?", "Do you want a frame instead?"],
    reasoning: "Numeric sound selections should continue the same command chain instead of resetting to Other.",
    preferredRoute: "generate-sounds",
    responseFocus: [
      "Recognize this as a sound follow-up.",
      "Continue the same command chain.",
      "Do not ask filler when the branch choice is already clear.",
    ],
    tags: ["sound", "choice", "follow-up"],
  }),
  createProceedExample({
    id: "other-route-sound-revision",
    category: "route-sound",
    requestType: "sound",
    userPrompt: "Same impact, but make the hit sharper.",
    requestSummary: "Classify as sound. Continue sound-command chain with targeted modification.",
    likelyMeaning: [
      "The same sound family should stay.",
      "Impact weight or attack should increase.",
      "Timing should stay anchored unless the user changes it.",
    ],
    expectedOutcome: ["Prepare a sound-command revision that changes only the requested impact characteristics."],
    routingDecision: "Continue the same sound-command chain and modify only the requested impact parameters.",
    commandType: "sound-command",
    commandAction: "revise-sound-behavior",
    targetSystem: "Generate Sounds command planner",
    commandParameters: {
      continuation: true,
      preserveTiming: true,
      impactSharpness: "higher",
      modifyOnlyRequestedPart: true,
    },
    executionGoal: "Translate human expectation into command-level changes: sharper attack, stronger hit identity, same timing base.",
    commandChain: "continue",
    knownFacts: ["The same sound family should continue.", "The requested change is sharper impact."],
    missingFacts: [],
    strongestGap: "",
    bestQuestion: null,
    acceptableOptions: [],
    badQuestions: ["Should I improve the pose too?", "What workspace panel are you using?"],
    reasoning: "Revision language plus sound vocabulary -> sound-command modification.",
    preferredRoute: "generate-sounds",
    responseFocus: [
      "Classify this as a sound revision.",
      "Map human expectation to command-level parameter changes.",
      "Continue the same command chain.",
    ],
    tags: ["sound", "revision", "continuation"],
  }),
];

const UI_ROUTE_EXAMPLES: OtherTaskExample[] = [
  createQuestionExample({
    id: "other-route-ui-export-unclear-target",
    category: "route-ui",
    requestType: "ui",
    userPrompt: "Export this cleanly.",
    requestSummary: "Classify as UI. Resolve export-command target before command preparation.",
    likelyMeaning: ["The user wants export behavior prepared, but the export target is not locked."],
    expectedOutcome: ["Ask one command-path question so the correct export command can be prepared."],
    routingDecision: "Stay in Task Other only long enough to resolve the export command path.",
    commandType: "routing-question",
    commandAction: "resolve-export-command-path",
    targetSystem: "Task Other router",
    commandParameters: {
      commandFamily: "export",
      decisionNeeded: "export-target",
    },
    executionGoal: "Choose the right export command variant before handing work to the workspace UI engine.",
    commandChain: "new",
    knownFacts: ["The request is about exporting."],
    missingFacts: ["What the export is for."],
    strongestGap: "What export target should drive the command.",
    bestQuestion: "Should this become an editing export, sharing export, or final-delivery export command?",
    acceptableOptions: ["Editing export", "Sharing export", "Final-delivery export"],
    badQuestions: ["What else should happen?", "What story is this?"],
    reasoning: "This is clearly a UI command request, but one routing question is needed to choose the right export command variant.",
    preferredRoute: "other",
    responseFocus: [
      "Classify this as UI command work.",
      "Ask exactly one command-path question.",
      "Do not explain UI behavior.",
    ],
    tags: ["ui", "export", "question-first"],
  }),
  createProceedExample({
    id: "other-route-ui-export-discord",
    category: "route-ui",
    requestType: "ui",
    userPrompt: "How do i export this for Discord?",
    requestSummary: "Classify as UI. Prepare sharing export command.",
    likelyMeaning: ["The user wants the project exported for Discord sharing."],
    expectedOutcome: ["Prepare a sharing export command with target=discord."],
    routingDecision: "Prepare an export-project command for the workspace UI engine.",
    commandType: "ui-command",
    commandAction: "export-project",
    targetSystem: "workspace-ui engine",
    commandParameters: {
      target: "discord",
      exportMode: "sharing",
    },
    executionGoal: "Prepare the export command that the workspace UI engine should execute for Discord sharing.",
    commandChain: "new",
    knownFacts: ["The export target is sharing on Discord."],
    missingFacts: [],
    strongestGap: "",
    bestQuestion: null,
    acceptableOptions: [],
    badQuestions: ["What should happen next in the scene?", "Do you want sound options too?"],
    reasoning: "This is a UI intent that should map to an export command with explicit target parameters.",
    preferredRoute: "other",
    responseFocus: [
      "Prepare UI command intent.",
      "Map to export-project with target=discord.",
      "Do not explain UI behavior.",
    ],
    tags: ["ui", "export", "sharing"],
  }),
  createProceedExample({
    id: "other-route-ui-import-location",
    category: "route-ui",
    requestType: "ui",
    userPrompt: "Wait where do imported things go again?",
    requestSummary: "Classify as UI. Prepare import-placement command.",
    likelyMeaning: ["The user wants imported assets mapped into the right workspace area."],
    expectedOutcome: ["Prepare import-placement command intent."],
    routingDecision: "Prepare a prepare-import-placement-intent command for the workspace UI engine.",
    commandType: "ui-command",
    commandAction: "prepare-import-placement-intent",
    targetSystem: "workspace-ui engine",
    commandParameters: {
      scope: "imported-assets",
      preserveProjectContext: true,
    },
    executionGoal: "Prepare the correct import-placement behavior for the current project context.",
    commandChain: "continue",
    knownFacts: ["The question is about imported items and where they belong."],
    missingFacts: [],
    strongestGap: "",
    bestQuestion: null,
    acceptableOptions: [],
    badQuestions: ["What frame should I draw?", "Should I make a new plan?"],
    reasoning: "Import-location intent -> prepare import-placement command.",
    preferredRoute: "other",
    responseFocus: [
      "Prepare UI command intent.",
      "Map to prepare-import-placement-intent.",
      "Do not explain UI behavior.",
    ],
    tags: ["ui", "import", "organization"],
  }),
  createProceedExample({
    id: "other-route-ui-tool-purpose",
    category: "route-ui",
    requestType: "ui",
    userPrompt: "What does this button do?",
    requestSummary: "Classify as UI. Prepare tool-intent inspection command.",
    likelyMeaning: ["The user needs the system to identify the tool's intended behavior."],
    expectedOutcome: ["Prepare a UI inspection command or tool-intent lookup."],
    routingDecision: "Prepare an inspect-tool-intent command.",
    commandType: "ui-command",
    commandAction: "inspect-tool-intent",
    targetSystem: "workspace-ui engine",
    commandParameters: {
      scope: "current-tool",
    },
    executionGoal: "Resolve what behavior the selected UI control should trigger.",
    commandChain: "new",
    knownFacts: ["The request is about a tool or button."],
    missingFacts: [],
    strongestGap: "",
    bestQuestion: null,
    acceptableOptions: [],
    badQuestions: ["What sound family do you want?", "What beat should come next?"],
    reasoning: "Tool-behavior intent -> prepare inspect-tool-intent command.",
    preferredRoute: "other",
    responseFocus: [
      "Prepare UI command intent.",
      "Map to inspect-tool-intent.",
      "Do not explain UI behavior.",
    ],
    tags: ["ui", "button", "tool"],
  }),
  createProceedExample({
    id: "other-route-ui-layer-cleanup",
    category: "route-ui",
    requestType: "ui",
    userPrompt: "My layers are a total mess.",
    requestSummary: "Classify as UI. Continue workspace command chain with layer organization.",
    likelyMeaning: ["The user wants the layer stack reorganized while keeping the current project context."],
    expectedOutcome: ["Prepare a layer-organization UI command intent."],
    routingDecision: "Prepare a layer-organization UI command and continue the same workspace command chain.",
    commandType: "ui-command",
    commandAction: "organize-layers",
    targetSystem: "workspace-ui engine",
    commandParameters: {
      scope: "current-project",
      preserveProjectContext: true,
      modifyOnlyRequestedPart: true,
    },
    executionGoal: "Prepare layer-organization behavior without changing story, frame, or sound intent.",
    commandChain: "continue",
    knownFacts: ["The layer setup is messy.", "The user wants cleanup applied to the current project."],
    missingFacts: [],
    strongestGap: "",
    bestQuestion: null,
    acceptableOptions: [],
    badQuestions: ["What scene genre is this?", "Should I make sound options?"],
    reasoning: "Layer-cleanup intent -> prepare organize-layers command.",
    preferredRoute: "other",
    responseFocus: [
      "Classify this as UI command work.",
      "Continue the same workspace command chain.",
      "Do not guess unrelated creative output.",
    ],
    tags: ["ui", "layers", "cleanup"],
  }),
];

const UNKNOWN_CLARIFIER_EXAMPLES: OtherTaskExample[] = [
  createQuestionExample({
    id: "other-route-unknown-continue",
    category: "clarify-unknown",
    requestType: "unknown",
    userPrompt: "Continue this.",
    requestSummary: "Classify as unknown. Resolve command family with one routing question.",
    likelyMeaning: ["They may want the next plan step, the next frame step, the next sound step, or the next UI command in the same project."],
    expectedOutcome: ["Ask one routing question that decides the command path."],
    routingDecision: "Stay in Task Other only long enough to resolve the command family.",
    commandType: "routing-question",
    commandAction: "resolve-command-path",
    targetSystem: "Task Other router",
    commandParameters: {
      continuation: true,
      decisionNeeded: "command-family",
    },
    executionGoal: "Resolve whether to continue a plan, frame, sound, or UI command chain.",
    commandChain: "continue",
    knownFacts: ["The user wants some kind of continuation."],
    missingFacts: ["Whether the continuation is plan, frame, sound, or UI."],
    strongestGap: "Which command system should continue.",
    bestQuestion: "Should this continue the plan command chain, frame command chain, sound command chain, or UI command chain?",
    acceptableOptions: ["Plan command chain", "Frame command chain", "Sound command chain", "UI command chain"],
    badQuestions: ["What else is happening?", "Which tools are open?"],
    reasoning: "Continuation alone is not enough to prepare safe command intent, so Task Other should resolve the route once and stop.",
    preferredRoute: "other",
    responseFocus: [
      "Classify this as unknown.",
      "Ask one routing question that separates the likely command families.",
      "Do not prepare the wrong command before the route is clear.",
    ],
    tags: ["unknown", "continuation", "clarify"],
  }),
  createQuestionExample({
    id: "other-route-unknown-better",
    category: "clarify-unknown",
    requestType: "unknown",
    userPrompt: "Make this better.",
    requestSummary: "Classify as unknown. Resolve modification target with one routing question.",
    likelyMeaning: ["They may want plan improvement, frame improvement, sound improvement, or UI/workspace command changes."],
    expectedOutcome: ["Ask one smart clarifying question that decides the execution path."],
    routingDecision: "Stay in Task Other only long enough to resolve the improvement target.",
    commandType: "routing-question",
    commandAction: "resolve-improvement-target",
    targetSystem: "Task Other router",
    commandParameters: {
      decisionNeeded: "improvement-target",
    },
    executionGoal: "Identify which command system should receive the modification request.",
    commandChain: "continue",
    knownFacts: ["The user wants improvement."],
    missingFacts: ["What exactly should be improved."],
    strongestGap: "Which command system should receive the change.",
    bestQuestion: "Should this modify the plan command chain, frame command chain, sound command chain, or UI command chain?",
    acceptableOptions: ["Plan command chain", "Frame command chain", "Sound command chain", "UI command chain"],
    badQuestions: ["What else is happening?", "What style do you want?"],
    reasoning: "Improvement language alone should never trigger a random command guess.",
    preferredRoute: "other",
    responseFocus: [
      "Treat the request as unknown until the target command family is named.",
      "Ask exactly one targeted clarifier.",
      "Avoid generic filler and avoid guessing.",
    ],
    tags: ["unknown", "improve", "clarify"],
  }),
  createQuestionExample({
    id: "other-route-unknown-fix",
    category: "clarify-unknown",
    requestType: "unknown",
    userPrompt: "Fix this please.",
    requestSummary: "Classify as unknown. Resolve fix target with one routing question.",
    likelyMeaning: ["The user expects the system to identify the right command lane before execution."],
    expectedOutcome: ["Ask one targeted routing question and prepare nothing else yet."],
    routingDecision: "Use one routing question to decide which command system should receive the fix.",
    commandType: "routing-question",
    commandAction: "resolve-fix-target",
    targetSystem: "Task Other router",
    commandParameters: {
      decisionNeeded: "fix-target",
    },
    executionGoal: "Resolve whether the fix belongs to planning, frames, sounds, or workspace UI commands.",
    commandChain: "continue",
    knownFacts: ["The user wants something fixed."],
    missingFacts: ["What needs fixing."],
    strongestGap: "Which system should receive the fix command.",
    bestQuestion: "Should this fix the plan command chain, frame command chain, sound command chain, or UI command chain?",
    acceptableOptions: ["Plan command chain", "Frame command chain", "Sound command chain", "UI command chain"],
    badQuestions: ["Which panel is open?", "What should I build from scratch?"],
    reasoning: "The safe move is one routing question that unlocks execution path selection.",
    preferredRoute: "other",
    responseFocus: [
      "Keep this in Other only as a router.",
      "Ask one precise routing question.",
      "Do not prepare fallback content.",
    ],
    tags: ["unknown", "fix", "clarify"],
  }),
  createQuestionExample({
    id: "other-route-unknown-greeting",
    category: "clarify-unknown",
    requestType: "unknown",
    userPrompt: "Hello.",
    requestSummary: "Classify as unknown. Resolve command family with one routing question.",
    likelyMeaning: ["No plan, frame, sound, or UI command is named yet."],
    expectedOutcome: ["Ask one routing question that selects the command lane."],
    routingDecision: "Stay in Task Other only long enough to identify the command family.",
    commandType: "routing-question",
    commandAction: "resolve-command-path",
    targetSystem: "Task Other router",
    commandParameters: {
      decisionNeeded: "command-family",
    },
    executionGoal: "Resolve whether the request should route to plan, frame, sound, or UI commands.",
    commandChain: "new",
    knownFacts: ["No actionable command family is present yet."],
    missingFacts: ["Which command system should receive the request."],
    strongestGap: "The command family is missing.",
    bestQuestion: "Should this route to a plan command, frame command, sound command, or UI command?",
    acceptableOptions: ["Plan command", "Frame command", "Sound command", "UI command"],
    badQuestions: ["How are you?", "What are you working on generally?"],
    reasoning: "Greeting-only input in Task Other still requires one routing question.",
    preferredRoute: "other",
    responseFocus: [
      "Keep Task Other in routing mode.",
      "Ask one command-family question.",
      "Do not switch out of routing mode.",
    ],
    tags: ["unknown", "greeting", "clarify"],
  }),
];

const CUSTOM_ROUTE_EXAMPLES: OtherTaskExample[] = [
  createProceedExample({
    id: "other-route-custom-rename-project",
    category: "route-custom",
    requestType: "unknown",
    userPrompt: "Rename this project to Arena Fight.",
    requestSummary: "Classify as clear custom intent. Prepare a generic engine command envelope.",
    likelyMeaning: ["The user wants the current project renamed without changing anything else."],
    expectedOutcome: ["Prepare a custom-command envelope."],
    routingDecision: "Prepare a custom-command envelope for the engine.",
    commandType: "custom-command",
    commandAction: "prepare-custom-command",
    targetSystem: "engine",
    commandParameters: {
      intent: "rename project to Arena Fight",
      preserveProjectContext: true,
      modifyOnlyRequestedPart: true,
    },
    executionGoal: "Prepare a generic engine command for a direct rename request.",
    commandChain: "continue",
    knownFacts: ["The request is to rename the current project to Arena Fight."],
    missingFacts: [],
    strongestGap: "",
    bestQuestion: null,
    acceptableOptions: [],
    badQuestions: ["Which frame should I draw?", "Should I explain where to rename it?"],
    reasoning: "Clear non-plan, non-frame, non-sound, non-UI intent -> prepare custom-command.",
    preferredRoute: "other",
    responseFocus: [
      "Prepare custom command intent.",
      "Map to prepare-custom-command.",
      "Do not explain workflow.",
    ],
    tags: ["custom", "rename", "project"],
  }),
  createProceedExample({
    id: "other-route-custom-duplicate-scene",
    category: "route-custom",
    requestType: "unknown",
    userPrompt: "Duplicate this scene.",
    requestSummary: "Classify as clear custom intent. Prepare a generic engine command envelope.",
    likelyMeaning: ["The user wants the current scene duplicated without unrelated changes."],
    expectedOutcome: ["Prepare a custom-command envelope."],
    routingDecision: "Prepare a custom-command envelope for the engine.",
    commandType: "custom-command",
    commandAction: "prepare-custom-command",
    targetSystem: "engine",
    commandParameters: {
      intent: "duplicate this scene",
      preserveProjectContext: true,
      modifyOnlyRequestedPart: true,
    },
    executionGoal: "Prepare a generic engine command for a direct scene duplication request.",
    commandChain: "continue",
    knownFacts: ["The request is to duplicate the current scene."],
    missingFacts: [],
    strongestGap: "",
    bestQuestion: null,
    acceptableOptions: [],
    badQuestions: ["Which export target is needed?", "Should I explain duplication steps?"],
    reasoning: "Clear non-plan, non-frame, non-sound, non-UI intent -> prepare custom-command.",
    preferredRoute: "other",
    responseFocus: [
      "Prepare custom command intent.",
      "Map to prepare-custom-command.",
      "Do not explain workflow.",
    ],
    tags: ["custom", "duplicate", "scene"],
  }),
];

const OTHER_EXAMPLES: OtherTaskExample[] = [
  ...PLAN_ROUTE_EXAMPLES,
  ...FRAME_ROUTE_EXAMPLES,
  ...SOUND_ROUTE_EXAMPLES,
  ...UI_ROUTE_EXAMPLES,
  ...CUSTOM_ROUTE_EXAMPLES,
  ...UNKNOWN_CLARIFIER_EXAMPLES,
];

const PLAN_PATTERN =
  /\b(plan\b|story\b|beat\b|beats\b|next beat|what should happen next|turn this into a plan|outline\b|storyboard\b|continue the story|add the next beat|scene idea)\b/i;
const FRAME_PATTERN =
  /\b(draw\b|frame\b|pose\b|poses\b|animate\b|animation\b|clean up this rough pose|clean up this pose|cleanup\b|redraw\b|next frame|inbetween\b|in-between\b|motion\b|turns and raises his arm)\b/i;
const SOUND_PATTERN =
  /\b(sound\b|sfx\b|audio\b|impact\b|explosion\b|portal\b|whoosh\b|ambience\b|footstep\b|footsteps\b|hit\b|sharper\b|echo\b|reverb\b|option\s*[1-4]\b|pick\s*[1-4]\b)\b/i;
const UI_PATTERN =
  /\b(save\b|export\b|import\b|button\b|tool\b|ui\b|workspace\b|layer\b|layers\b|timeline\b|symbol\b|symbols\b|library\b|rename\b|organize\b|organise\b|project setup\b|setup\b|workflow\b|panel\b)\b/i;
const UNKNOWN_PATTERN =
  /\b(continue this|make this better|fix this please|fix this\b|change this\b|modify this\b|improve this\b|help with this|what should i do with this|something feels off|this feels wrong)\b/i;
const ACTION_PATTERN =
  /\b(help\b|make\b|fix\b|change\b|modify\b|improve\b|continue\b|draw\b|give\b|turn\b|save\b|export\b|import\b|clean up\b|organize\b|what does\b|how do i\b)\b/i;
const CHOICE_FOLLOWUP_PATTERN =
  /^\s*(?:(?:i\s+(?:pick|choose|want))\s*)?(?:option\s*)?[1-4]\s*\.?$/i;

const getNormalizedText = (value: string) =>
  value
    .toLowerCase()
    .replace(/[“”]/g, '"')
    .replace(/[’]/g, "'")
    .replace(/[\u2013\u2014]/g, " ")
    .replace(/[^\w\s'/-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const getTokenSet = (value: string) =>
  getNormalizedText(value)
    .split(/\s+/)
    .filter((token) => token.length > 2);

const scoreTokenOverlap = (text: string, tags: string[], userTokens: Set<string>) => {
  const exampleTokens = new Set(getTokenSet([text, ...tags].join(" ")));
  let overlap = 0;

  for (const token of userTokens) {
    if (exampleTokens.has(token)) {
      overlap += 1;
    }
  }

  return overlap;
};

const scoreExample = ({
  example,
  userMessage,
  analysisInput,
}: {
  example: OtherTaskExample;
  userMessage: string;
  analysisInput: string;
}) => {
  const normalized = getNormalizedText([userMessage, analysisInput].join(" "));
  const userTokens = new Set(getTokenSet([userMessage, analysisInput].join(" ")));
  const planMatch = PLAN_PATTERN.test(normalized);
  const frameMatch = FRAME_PATTERN.test(normalized);
  const soundMatch = SOUND_PATTERN.test(normalized) || CHOICE_FOLLOWUP_PATTERN.test(userMessage.trim());
  const uiMatch = UI_PATTERN.test(normalized);
  const unknownMatch = UNKNOWN_PATTERN.test(normalized);
  const familyMatchCount = [planMatch, frameMatch, soundMatch, uiMatch].filter(Boolean).length;

  let score = scoreTokenOverlap(
    [
      example.userPrompt,
      example.requestSummary,
      example.routingDecision,
      example.commandAction,
      example.executionGoal,
      ...example.likelyMeaning,
      ...example.expectedOutcome,
      ...example.responseFocus,
    ].join(" "),
    example.tags,
    userTokens,
  );

  if (example.requestType === "plan" && planMatch) {
    score += 16;
  }

  if (example.requestType === "frame" && frameMatch) {
    score += 16;
  }

  if (example.requestType === "sound" && soundMatch) {
    score += 16;
  }

  if (example.requestType === "ui" && uiMatch) {
    score += 16;
  }

  if (example.requestType === "unknown" && (unknownMatch || familyMatchCount === 0 || familyMatchCount > 1)) {
    score += 14;
  }

  if (example.preferredRoute === "generate-plans" && planMatch) {
    score += 4;
  }

  if (example.preferredRoute === "generate-frames" && frameMatch) {
    score += 4;
  }

  if (example.preferredRoute === "generate-sounds" && soundMatch) {
    score += 4;
  }

  if (example.preferredRoute === "other" && uiMatch) {
    score += 4;
  }

  if (example.shouldAskQuestion && (example.requestType === "unknown" || familyMatchCount !== 1)) {
    score += 5;
  }

  if (example.requestType === "unknown" && familyMatchCount === 0 && ACTION_PATTERN.test(normalized)) {
    score += 6;
  }

  return score;
};

export const GENERATE_OTHER_LLM_TRAINING_EXAMPLES = OTHER_EXAMPLES;

export const buildOtherTaskAnalysisInput = ({
  userMessage,
  conversationHistory = [],
}: {
  userMessage: string;
  conversationHistory?: DrawingAiConversationMessage[];
}) => {
  const trimmedHistory = conversationHistory
    .map((message) => `${message.role}: ${message.content.trim()}`)
    .filter((line) => line.trim().length > 0)
    .slice(-6);

  return [userMessage.trim(), ...trimmedHistory].filter(Boolean).join("\n");
};

export const selectRelevantOtherExamples = ({
  examples = GENERATE_OTHER_LLM_TRAINING_EXAMPLES,
  userMessage,
  analysisInput,
  limit = 6,
}: {
  examples?: OtherTaskExample[];
  userMessage: string;
  analysisInput: string;
  limit?: number;
}) => {
  const rankedExamples = examples
    .map((example) => ({
      example,
      score: scoreExample({
        example,
        userMessage,
        analysisInput,
      }),
    }))
    .filter(({ score }) => score > 0)
    .sort((left, right) => right.score - left.score);

  if (rankedExamples.length === 0) {
    return [];
  }

  const selected: OtherTaskExample[] = [];
  const seenCategories = new Set<string>();

  for (const { example } of rankedExamples) {
    if (selected.length >= limit) {
      break;
    }

    if (!seenCategories.has(example.category)) {
      selected.push(example);
      seenCategories.add(example.category);
    }
  }

  if (selected.length >= limit) {
    return selected.slice(0, limit);
  }

  for (const { example } of rankedExamples) {
    if (selected.length >= limit) {
      break;
    }

    if (!selected.some((selectedExample) => selectedExample.id === example.id)) {
      selected.push(example);
    }
  }

  return selected.slice(0, limit);
};

export const formatOtherExamplesForPrompt = (examples: OtherTaskExample[]) =>
  examples
    .map((example, index) => {
      const commandEnvelope = JSON.stringify(
        {
          commandType: example.commandType,
          commandAction: example.commandAction,
          targetSystem: example.targetSystem,
          commandParameters: example.commandParameters,
          executionGoal: example.executionGoal,
          commandChain: example.commandChain,
        },
        null,
        2,
      );
      const lines = [
        `Example ${index + 1}: ${example.category}`,
        `Command envelope:\n${commandEnvelope}`,
        `Request type: ${example.requestType}`,
        `Preferred route: ${example.preferredRoute}`,
        `Command type: ${example.commandType}`,
        `Command action: ${example.commandAction}`,
        `Target system: ${example.targetSystem}`,
        `Command chain: ${example.commandChain}`,
        `Command parameters: ${JSON.stringify(example.commandParameters)}`,
        `Execution goal: ${example.executionGoal}`,
        `User prompt: ${example.userPrompt}`,
        `Request: ${example.requestSummary}`,
        `Likely meaning: ${example.likelyMeaning.join(" | ") || "(none)"}`,
        `Expected outcome: ${example.expectedOutcome.join(" | ") || "(none)"}`,
        `Routing decision: ${example.routingDecision}`,
        `Known facts: ${example.knownFacts.join(" | ") || "(none)"}`,
        `Missing facts: ${example.missingFacts.join(" | ") || "(none)"}`,
        `Strongest gap: ${example.strongestGap || "(none)"}`,
        `Decision: ask=${example.shouldAskQuestion ? "yes" : "no"} | proceed=${example.shouldProceedWithoutQuestion ? "yes" : "no"} | max-questions=${example.maxQuestionsBeforeProceeding}`,
        `Best question: ${example.bestQuestion ?? "(proceed without asking)"}`,
        `Acceptable options: ${example.acceptableOptions.join(" | ") || "(none)"}`,
        `Response focus: ${example.responseFocus.join(" | ") || "(none)"}`,
        `Consistency rules: ${example.consistencyRules.join(" | ") || "(none)"}`,
        `Bad questions: ${example.badQuestions.join(" | ") || "(none)"}`,
        `Bad style to avoid: ${example.badStyleNotes.join(" | ") || "(none)"}`,
        `Quality notes: ${example.qualityNotes.join(" | ") || "(none)"}`,
        `Tags: ${example.tags.join(" | ") || "(none)"}`,
        `Reasoning: ${example.reasoning}`,
      ];

      return lines.join("\n");
    })
    .join("\n\n");

export const formatOtherIntentExamplesForPrompt = (examples: OtherTaskIntentExample[]) =>
  examples
    .map((example, index) => {
      const commandEnvelope = JSON.stringify(
        {
          commandType: example.commandType,
          commandAction: example.commandAction,
          targetSystem: example.targetSystem,
          commandParameters: example.commandParameters,
          executionGoal: example.executionGoal,
          commandChain: example.commandChain,
        },
        null,
        2,
      );

      return [
        `Intent example ${index + 1}: ${example.userPrompt}`,
        `Command envelope:\n${commandEnvelope}`,
        `Request type: ${example.requestType}`,
        `Preferred route: ${example.preferredRoute}`,
        `Likely meaning: ${example.likelyMeaning}`,
        `Expected outcome: ${example.expectedOutcome}`,
        `Execution goal: ${example.executionGoal}`,
        `Notes: ${example.notes}`,
        `Tags: ${example.tags.join(" | ")}`,
      ].join("\n");
    })
    .join("\n");
