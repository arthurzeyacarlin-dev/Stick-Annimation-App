import {
  MAX_FRAMES_PER_REQUEST,
  clampRequestedFrameCount,
  type DrawingAiFrameRequestKind,
} from "./frameGenerationSafety.ts";

export const DRAWING_AI_REASONING_LEVELS = ["low", "medium", "high", "extra-high"] as const;
export type DrawingAiReasoningLevel = (typeof DRAWING_AI_REASONING_LEVELS)[number];

export const DRAWING_AI_TASK_TYPES = ["generate-plans", "generate-frames", "generate-sounds", "other"] as const;
export type DrawingAiTaskType = (typeof DRAWING_AI_TASK_TYPES)[number];
export const DRAWING_AI_SOUND_FAMILIES = [
  "bone-break",
  "cartoon-bounce",
  "ui-beep",
  "zipper",
  "creature",
  "thunder",
  "electricity",
  "volcano",
  "pebble-water",
  "water",
  "fire",
  "footsteps",
  "rain",
  "wind",
  "rustle",
  "debris",
  "branch-snap",
  "door",
  "door-sci-fi",
  "explosion",
  "punch",
  "kick",
  "sword",
  "whoosh",
  "impact",
  "laser",
  "energy",
  "magic",
  "vehicle-pass",
  "background-rumble",
  "room-tone",
  "portal",
  "generic",
] as const;
export type DrawingAiSoundFamily = (typeof DRAWING_AI_SOUND_FAMILIES)[number];
export type DrawingAiSoundProfile = string;

export type DrawingAiMode = "chat";
export type DrawingAiInteractionIntentKind = "conversation" | "feedback" | "task";
export type DrawingAiFollowUpMode = "none" | "question-box";
export type DrawingAiFollowUpAnswerSource = "typed" | "option";
export type DrawingAiFollowUpInteractionKind = "answer" | "edit";
export type DrawingAiQuestionCardKind = "planning" | "drawing" | "sound" | "general";
export type DrawingAiResultKind = "message" | "question" | "sound-options";
export type DrawingAiTaskPhase =
  | "analyzing-message"
  | "thinking"
  | "searching"
  | "planning"
  | "planning-animation"
  | "drawing"
  | "generating-frames"
  | "generating-sound-effects"
  | "working";
export type DrawingAiGuidedPlanningStatus = "questioning" | "ready-to-plan" | "plan-complete";
export type DrawingAiGuidedPlanningSceneType =
  | "fight"
  | "chase"
  | "exploration"
  | "discovery"
  | "escape"
  | "emotional"
  | "comedy"
  | "general"
  | "unknown";

export const DEFAULT_DRAWING_AI_REASONING_LEVEL: DrawingAiReasoningLevel = "medium";
export const DEFAULT_DRAWING_AI_TASK_TYPE: DrawingAiTaskType = "other";

export type DrawingAiConversationMessage = {
  role: "user" | "assistant";
  content: string;
};

export type DrawingAiWorkspaceBitmapBounds = {
  left: number;
  top: number;
  width: number;
  height: number;
};

export type DrawingAiWorkspaceSoundSummary = {
  title: string;
  description: string;
  timingFeel: string | null;
  intensityFeel: string | null;
};

export type DrawingAiWorkspaceContext = {
  projectId: string | null;
  projectTitle: string;
  activeLayerId: string;
  activeLayerName: string;
  totalLayers: number;
  activeTool: string;
  timelineFps: number;
  authoredFrameCount: number;
  currentFrameIndex: number;
  selectedTimelineIndex: number;
  currentFrameHasBitmap: boolean;
  currentFrameBounds: DrawingAiWorkspaceBitmapBounds | null;
  previousFilledFrameIndex: number | null;
  nextFilledFrameIndex: number | null;
  currentFrameSound: DrawingAiWorkspaceSoundSummary | null;
  selectedFrameSound: DrawingAiWorkspaceSoundSummary | null;
  hasOffCameraAuthoringArea: boolean;
  cameraAreaDescription: string;
  canvasWidth: number;
  canvasHeight: number;
};

export type DrawingAiTaskIntentExample = {
  id: string;
  userPrompt: string;
  intent: DrawingAiInteractionIntentKind;
  notes: string;
  tags: string[];
};

export type DrawingAiFollowUpMemoryItem = {
  question: string;
  answer: string;
  followUpMultiSelect?: boolean | null;
  followUpOptions?: string[] | null;
  normalizedValues?: string[] | null;
};

export type DrawingAiActiveFollowUp = {
  question: string;
  followUpMultiSelect?: boolean | null;
  followUpOptions?: string[] | null;
};

export type DrawingAiRequest = {
  prompt: string;
  shouldSearch: boolean;
  reasoningLevel: DrawingAiReasoningLevel;
  taskType: DrawingAiTaskType;
  workspaceType?: DrawingAiWorkspaceType | null;
  conversationHistory?: DrawingAiConversationMessage[];
  followUpMemory?: DrawingAiFollowUpMemoryItem[];
  activeFollowUp?: DrawingAiActiveFollowUp | null;
  followUpAnswerSource?: DrawingAiFollowUpAnswerSource | null;
  followUpInteractionKind?: DrawingAiFollowUpInteractionKind | null;
  workspaceContext?: DrawingAiWorkspaceContext | null;
  recentSoundOptions?: DrawingAiSoundOption[] | null;
  generateFramesState?: DrawingAiGenerateFramesState | null;
  projectAiMemory?: DrawingAiProjectMemory | null;
};

export type DrawingAiGuidedPlanningState = {
  status: DrawingAiGuidedPlanningStatus;
  sceneType: DrawingAiGuidedPlanningSceneType;
};

export const DRAWING_AI_WORKSPACE_TYPES = ["drawing", "stick-figure", "other"] as const;
export type DrawingAiWorkspaceType = (typeof DRAWING_AI_WORKSPACE_TYPES)[number];

export type DrawingAiSoundOption = {
  id: string;
  title: string;
  description: string;
  timingFeel: string | null;
  intensityFeel: string | null;
  durationSeconds?: number | null;
  negativeConstraints?: string[] | null;
  contentType?: "sfx" | "voice-placeholder" | null;
  speechText?: string | null;
  soundFamily?: DrawingAiSoundFamily | null;
  soundProfile?: DrawingAiSoundProfile | null;
  planId?: string | null;
  planSummary?: string | null;
  previewSignature?: string | null;
  validationStatus?: "valid" | "adjusted-once" | "needs-clarification" | null;
  referenceUsed?: boolean | null;
  referenceSummary?: string | null;
};

export type DrawingAiGeneratedFrameDraft = {
  pose: string;
  description: string;
};

export const DRAWING_AI_GENERATED_FRAME_BEHAVIOR_TYPES = [
  "tool-drawing",
  "animation-continuation",
  "cleanup-edit",
  "effect-drawing",
  "background-generation",
] as const;
export type DrawingAiGeneratedFrameBehaviorType =
  (typeof DRAWING_AI_GENERATED_FRAME_BEHAVIOR_TYPES)[number];

export const DRAWING_AI_GENERATED_FRAME_TOOL_INTENTS = [
  "brush",
  "erase",
  "fill",
  "shape",
  "knife",
  "lasso",
  "timeline",
  "layer",
  "fps",
  "glow-brush",
] as const;
export type DrawingAiGeneratedFrameToolIntent =
  (typeof DRAWING_AI_GENERATED_FRAME_TOOL_INTENTS)[number];

export const DRAWING_AI_GENERATED_FRAME_LAYER_INTENTS = [
  "active-layer",
  "action-layer",
  "background-layer",
] as const;
export type DrawingAiGeneratedFrameLayerIntent =
  (typeof DRAWING_AI_GENERATED_FRAME_LAYER_INTENTS)[number];

export type DrawingAiGeneratedFrameWorkspaceIntent = {
  behaviorType: DrawingAiGeneratedFrameBehaviorType;
  toolIntents: DrawingAiGeneratedFrameToolIntent[];
  targetLayerIntent: DrawingAiGeneratedFrameLayerIntent;
  toolBased: boolean;
  generationAllowed: boolean;
  backgroundGenerationAllowed: boolean;
  fpsSuggestion: number | null;
  applySuggestedFps: boolean;
  fpsReason: string | null;
};

export type DrawingAiGeneratedFramePlan = {
  requestKind: DrawingAiFrameRequestKind;
  requestedFrameCount: number;
  frames: DrawingAiGeneratedFrameDraft[];
  workspaceIntent: DrawingAiGeneratedFrameWorkspaceIntent | null;
  renderingQualityProfile?: DrawingAiRenderingQualityProfile | null;
  familyQualityContract?: DrawingAiFamilyQualityContract | null;
  principleActivationProfile?: DrawingAiPrincipleActivationProfile | null;
  variationEnvelope?: DrawingAiVariationEnvelope | null;
  renderAcceptanceContract?: DrawingAiRenderAcceptanceContract | null;
};

export const DRAWING_AI_GENERATE_FRAMES_STATE_SUBJECT_TYPES = [
  "effect",
  "object",
  "character",
  "background",
  "mixed",
] as const;
export type DrawingAiGenerateFramesStateSubjectType =
  (typeof DRAWING_AI_GENERATE_FRAMES_STATE_SUBJECT_TYPES)[number];

export const DRAWING_AI_GENERATE_FRAMES_STATE_SUBJECT_ROLES = [
  "primary",
  "secondary",
  "attacker",
  "defender",
  "runner",
  "target",
  "background",
  "scene-element",
] as const;
export type DrawingAiGenerateFramesStateSubjectRole =
  (typeof DRAWING_AI_GENERATE_FRAMES_STATE_SUBJECT_ROLES)[number];

export const DRAWING_AI_GENERATE_FRAMES_STATE_SUBJECT_SIDES = ["left", "right", "center"] as const;
export type DrawingAiGenerateFramesStateSubjectSide =
  (typeof DRAWING_AI_GENERATE_FRAMES_STATE_SUBJECT_SIDES)[number];

export const DRAWING_AI_GENERATE_FRAMES_STATE_TONES = [
  "neutral",
  "brutal",
  "powerful",
  "serious",
  "weak",
  "scared",
  "hesitant",
] as const;
export type DrawingAiGenerateFramesStateTone =
  (typeof DRAWING_AI_GENERATE_FRAMES_STATE_TONES)[number];

export const DRAWING_AI_GENERATE_FRAMES_STATE_FORCE_LEVELS = ["low", "medium", "high"] as const;
export type DrawingAiGenerateFramesStateForceLevel =
  (typeof DRAWING_AI_GENERATE_FRAMES_STATE_FORCE_LEVELS)[number];

export const DRAWING_AI_GENERATE_FRAMES_STATE_PHASES = ["start", "progression", "ending"] as const;
export type DrawingAiGenerateFramesStatePhase =
  (typeof DRAWING_AI_GENERATE_FRAMES_STATE_PHASES)[number];

export const DRAWING_AI_GENERATE_FRAMES_STATE_MOTION_TYPES = [
  "unknown",
  "action",
  "explosion",
  "lightning",
  "shockwave",
  "smoke",
  "impact",
  "eruption",
  "bounce",
  "roll",
  "morph",
  "punch",
  "kick",
  "fight",
  "walk",
  "run",
  "stance",
  "background-scroll",
  "scene",
] as const;
export type DrawingAiGenerateFramesStateMotionType =
  (typeof DRAWING_AI_GENERATE_FRAMES_STATE_MOTION_TYPES)[number];

export const DRAWING_AI_GENERATE_FRAMES_PROJECT_SCOPES = ["same-project", "new-project"] as const;
export type DrawingAiGenerateFramesProjectScope =
  (typeof DRAWING_AI_GENERATE_FRAMES_PROJECT_SCOPES)[number];

export const DRAWING_AI_GENERATE_FRAMES_SHOT_SCOPES = [
  "create-first-shot",
  "tweak-current-shot",
  "continue-current-shot",
  "new-shot-same-project",
] as const;
export type DrawingAiGenerateFramesShotScope =
  (typeof DRAWING_AI_GENERATE_FRAMES_SHOT_SCOPES)[number];

export const DRAWING_AI_EXECUTION_COMPLEXITY_LEVELS = ["simple", "medium", "high"] as const;
export type DrawingAiExecutionComplexityLevel =
  (typeof DRAWING_AI_EXECUTION_COMPLEXITY_LEVELS)[number];

export const DRAWING_AI_EXECUTION_MOTION_EMPHASES = ["none", "light", "strong"] as const;
export type DrawingAiExecutionMotionEmphasis =
  (typeof DRAWING_AI_EXECUTION_MOTION_EMPHASES)[number];

export const DRAWING_AI_EXECUTION_EFFECT_EMPHASES = ["none", "supporting", "primary"] as const;
export type DrawingAiExecutionEffectEmphasis =
  (typeof DRAWING_AI_EXECUTION_EFFECT_EMPHASES)[number];

export const DRAWING_AI_EXECUTION_QUALITY_FLOORS = ["simple-good", "high-quality"] as const;
export type DrawingAiExecutionQualityFloor =
  (typeof DRAWING_AI_EXECUTION_QUALITY_FLOORS)[number];

export const DRAWING_AI_RENDERING_QUALITY_FAMILIES = [
  "character",
  "explosion",
  "lightning",
  "projectile",
  "combat",
  "breathing",
  "background",
  "background-scroll",
  "generic-effect",
  "generic-object",
  "generic-mixed",
] as const;
export type DrawingAiRenderingQualityFamily =
  (typeof DRAWING_AI_RENDERING_QUALITY_FAMILIES)[number];

export const DRAWING_AI_RENDERING_QUALITY_FLOOR_TIERS = [
  "simple-good",
  "action-strong",
  "effect-strong",
  "story-strong",
] as const;
export type DrawingAiRenderingQualityFloorTier =
  (typeof DRAWING_AI_RENDERING_QUALITY_FLOOR_TIERS)[number];

export const DRAWING_AI_RENDERING_SIMPLICITY_TARGETS = ["minimal", "balanced", "pushed"] as const;
export type DrawingAiRenderingSimplicityTarget =
  (typeof DRAWING_AI_RENDERING_SIMPLICITY_TARGETS)[number];

export const DRAWING_AI_ANIMATION_PRINCIPLES = [
  "squash-and-stretch",
  "anticipation",
  "staging",
  "straight-ahead-vs-pose-to-pose",
  "follow-through-and-overlap",
  "slow-in-and-slow-out",
  "arcs",
  "secondary-action",
  "timing",
  "exaggeration",
  "solid-drawing",
  "appeal",
] as const;
export type DrawingAiAnimationPrinciple =
  (typeof DRAWING_AI_ANIMATION_PRINCIPLES)[number];

export const DRAWING_AI_PRINCIPLE_ACTIVATION_LEVELS = ["off", "supporting", "primary"] as const;
export type DrawingAiPrincipleActivationLevel =
  (typeof DRAWING_AI_PRINCIPLE_ACTIVATION_LEVELS)[number];

export const DRAWING_AI_SEARCH_CONFIDENCE_LEVELS = ["high", "medium", "low"] as const;
export type DrawingAiSearchConfidenceLevel =
  (typeof DRAWING_AI_SEARCH_CONFIDENCE_LEVELS)[number];

export const DRAWING_AI_EXECUTION_BREVITY_LIMITS = ["strict", "balanced", "cinematic"] as const;
export type DrawingAiExecutionBrevityLimit =
  (typeof DRAWING_AI_EXECUTION_BREVITY_LIMITS)[number];

export const DRAWING_AI_EXECUTION_ADD_ON_POLICIES = ["core-first", "support-only"] as const;
export type DrawingAiExecutionAddOnPolicy =
  (typeof DRAWING_AI_EXECUTION_ADD_ON_POLICIES)[number];

export const DRAWING_AI_EXECUTION_BEAT_COMPLETION_ROLES = [
  "setup",
  "action",
  "contact",
  "recovery",
  "residue",
  "vanish",
  "transition",
  "settle",
  "other",
] as const;
export type DrawingAiExecutionBeatCompletionRole =
  (typeof DRAWING_AI_EXECUTION_BEAT_COMPLETION_ROLES)[number];

export const DRAWING_AI_EXECUTION_BEAT_EXPLICITNESS = ["explicit", "injected"] as const;
export type DrawingAiExecutionBeatExplicitness =
  (typeof DRAWING_AI_EXECUTION_BEAT_EXPLICITNESS)[number];

export const DRAWING_AI_SUBJECT_BINDING_TYPES = [
  "color",
  "side",
  "role",
  "label",
  "pronoun",
  "group",
] as const;
export type DrawingAiSubjectBindingType =
  (typeof DRAWING_AI_SUBJECT_BINDING_TYPES)[number];

export const DRAWING_AI_LAYER_PLAN_MODES = [
  "preserve-active",
  "target-existing-background",
  "create-background",
  "target-existing-effect",
  "create-effect-overlay",
] as const;
export type DrawingAiLayerPlanMode =
  (typeof DRAWING_AI_LAYER_PLAN_MODES)[number];

export const DRAWING_AI_CAMERA_PLAN_MODES = [
  "static",
  "anchored-subject-scroll",
  "scene-offset-progression",
] as const;
export type DrawingAiCameraPlanMode =
  (typeof DRAWING_AI_CAMERA_PLAN_MODES)[number];

export type DrawingAiExecutionBeat = {
  id: string;
  order: number;
  label: string;
  subjectIds: string[];
  sceneBinding?: string | null;
  explicitness: DrawingAiExecutionBeatExplicitness;
  mandatory: boolean;
  completionRole: DrawingAiExecutionBeatCompletionRole;
};

export type DrawingAiSubjectBinding = {
  alias: string;
  subjectId: string;
  bindingType: DrawingAiSubjectBindingType;
};

export type DrawingAiLayerPlan = {
  mode: DrawingAiLayerPlanMode;
  preserveExistingContent: boolean;
  reason: string | null;
};

export type DrawingAiCameraPlan = {
  mode: DrawingAiCameraPlanMode;
  focusSubjectId: string | null;
  direction: string | null;
};

export type DrawingAiSearchConfidenceProfile = {
  subject: DrawingAiSearchConfidenceLevel;
  motion: DrawingAiSearchConfidenceLevel;
  scene: DrawingAiSearchConfidenceLevel;
  style: DrawingAiSearchConfidenceLevel;
  continuity: DrawingAiSearchConfidenceLevel;
  overall: DrawingAiSearchConfidenceLevel;
};

export type DrawingAiExecutionGuidanceProfile = {
  complexityLevel: DrawingAiExecutionComplexityLevel;
  motionEmphasis: DrawingAiExecutionMotionEmphasis;
  effectEmphasis: DrawingAiExecutionEffectEmphasis;
  silhouetteGuidance: string[];
  structureGuidance: string[];
  motionGuidance: string[];
  completionGuidance: string[];
  sceneGuidance: string[];
  brevityPreservationLimit: DrawingAiExecutionBrevityLimit;
  addOnPolicy: DrawingAiExecutionAddOnPolicy;
  antiPatternWatchlist: string[];
  repairPriorities: string[];
  stylePrinciples?: string[];
};

export type DrawingAiPrincipleActivation = {
  principle: DrawingAiAnimationPrinciple;
  activationLevel: DrawingAiPrincipleActivationLevel;
  requiredUse: string;
  misuseToForbid: string;
};

export type DrawingAiPrincipleActivationProfile = {
  activations: DrawingAiPrincipleActivation[];
};

export type DrawingAiVariationEnvelope = {
  lockedIdentityTraits: string[];
  allowedVariationAxes: string[];
  forbiddenSubstitutions: string[];
};

export type DrawingAiFamilyQualityContract = {
  family: DrawingAiRenderingQualityFamily;
  mustHaves: string[];
  forbiddenPatterns: string[];
  rejectConditions: string[];
  variationAxes: string[];
};

export type DrawingAiRenderAcceptanceContract = {
  requiredMustHaves: string[];
  forbiddenBadPatterns: string[];
  minimumReadableCompletion: string[];
  familyRejectConditions: string[];
  brevityProtections: string[];
  continuityProtections: string[];
};

export type DrawingAiRenderingQualityProfile = {
  family: DrawingAiRenderingQualityFamily;
  qualityFloorTier: DrawingAiRenderingQualityFloorTier;
  simplicityTarget: DrawingAiRenderingSimplicityTarget;
  forcePriorities: string[];
  timingPriorities: string[];
  readabilityPriorities: string[];
  drawingClarityPriorities: string[];
  completionRequirements: string[];
  consistencyLocks: string[];
  antiTemplateVariationRange: string[];
  antiBadOutputWatchlist: string[];
  repairPriorities: string[];
};

export type DrawingAiQualityFailureReport = {
  category: string;
  reason: string;
  violatedRules: string[];
  repairPriority: string | null;
};

export type DrawingAiProjectStoryState = {
  currentStoryGoal: string | null;
  openSequenceArc: string | null;
  castRegistry: string[];
  styleAnchors: string[];
  recentSceneSummaries: string[];
};

export type DrawingAiGenerateFramesStateSubject = {
  id: string;
  type: Exclude<DrawingAiGenerateFramesStateSubjectType, "mixed">;
  role: DrawingAiGenerateFramesStateSubjectRole;
  side: DrawingAiGenerateFramesStateSubjectSide;
  color: string | null;
  label?: string | null;
  details?: string[];
};

export type DrawingAiGenerateFramesState = {
  ownerProjectId?: string | null;
  subjectType: DrawingAiGenerateFramesStateSubjectType;
  subjects: DrawingAiGenerateFramesStateSubject[];
  projectScope?: DrawingAiGenerateFramesProjectScope | null;
  shotScope?: DrawingAiGenerateFramesShotScope | null;
  motionType: DrawingAiGenerateFramesStateMotionType;
  tone: DrawingAiGenerateFramesStateTone;
  forceLevel: DrawingAiGenerateFramesStateForceLevel;
  animationPhase: DrawingAiGenerateFramesStatePhase;
  frameCount: number;
  fps: number;
  modifiers: string[];
  sceneSetting: string | null;
  sceneDescriptors: string[];
  sceneProps: string[];
  sceneElements?: string[];
  focusTargets?: string[];
  actionKeywords?: string[];
  buildDirection?: string | null;
  sequenceBeats?: DrawingAiExecutionBeat[];
  subjectBindings?: DrawingAiSubjectBinding[];
  layerPlan?: DrawingAiLayerPlan | null;
  cameraPlan?: DrawingAiCameraPlan | null;
  executionGuidance?: DrawingAiExecutionGuidanceProfile | null;
  searchConfidence?: DrawingAiSearchConfidenceProfile | null;
  qualityFloor?: DrawingAiExecutionQualityFloor | null;
  recentVariationSignatures?: string[];
  recentEdits: string[];
};

export const DRAWING_AI_PROJECT_INTERACTION_MODES = ["create", "continue", "tweak", "discuss"] as const;
export type DrawingAiProjectInteractionMode = (typeof DRAWING_AI_PROJECT_INTERACTION_MODES)[number];

export type DrawingAiProjectMemory = {
  version: 1;
  ownerProjectId: string | null;
  taskType: DrawingAiTaskType | null;
  interactionMode: DrawingAiProjectInteractionMode;
  currentGoal: string | null;
  contextSummary: string | null;
  lastPrompt: string | null;
  lastUpdatedAt: string;
  recentEdits: string[];
  storyState?: DrawingAiProjectStoryState | null;
  generateFramesState: DrawingAiGenerateFramesState | null;
};

export type DrawingAiTaskPhaseRecord = {
  phase: DrawingAiTaskPhase;
  label: string;
};

export type DrawingAiSearchDecision = {
  shouldSearch: boolean;
  reason: string | null;
  query: string | null;
  queries?: string[] | null;
};

export type DrawingAiExecutionStatus =
  | "completed-action"
  | "prepared-command"
  | "completed-plan"
  | "completed-frames"
  | "completed-sound"
  | "refinement"
  | "partial-support"
  | "question-needed"
  | "failed-safe"
  | "unsupported";

export type DrawingAiTaskExecution =
  | {
      taskType: "generate-plans";
      kind: "question-needed" | "completed-plan" | "refinement";
      status: DrawingAiExecutionStatus;
      continuation: boolean;
    }
  | {
      taskType: "generate-frames";
      kind:
        | "question-needed"
        | "single-frame"
        | "multi-frame"
        | "continuation"
        | "cleanup"
        | "in-between"
        | "refinement"
        | "style-edit"
        | "unsupported";
      status: DrawingAiExecutionStatus;
      continuation: boolean;
      supportLevel: "full" | "partial";
      applyMode: "none" | "single-frame" | "multi-frame";
      estimatedFrameCount: number | null;
    }
  | {
      taskType: "generate-sounds";
      kind:
        | "question-needed"
        | "single-sound"
        | "options"
        | "revised-sound"
        | "continuation"
        | "timing-cue"
        | "attached-to-frame"
        | "imported-option-to-frame"
        | "voice-request-placeholder";
      status: DrawingAiExecutionStatus;
      continuation: boolean;
      optionCount: number | null;
    }
  | {
      taskType: "other";
      kind: "prepared-command" | "unsupported" | "question-needed" | "redirect";
      status: DrawingAiExecutionStatus;
      continuation: boolean;
    };

export type DrawingAiEngineCommandSystem = DrawingAiTaskType | "workspace-ui" | "engine";
export type DrawingAiEngineCommandType =
  | "plan-command"
  | "frame-command"
  | "sound-command"
  | "ui-command"
  | "custom-command";
export type DrawingAiEngineCommandMode = "execute-now" | "prepare-only";
export type DrawingAiEngineCommandChain = "new" | "continue";
export type DrawingAiEngineCommandParameterValue = string | number | boolean | null | string[];
export type DrawingAiEngineCommandParameters = Record<string, DrawingAiEngineCommandParameterValue>;

export type DrawingAiActionPlan =
  | {
      type: "engine-command";
      commandType: DrawingAiEngineCommandType;
      action:
        | "prepare-plan-sequence"
        | "extend-plan-sequence"
        | "prepare-next-frame"
        | "prepare-frame-cleanup"
        | "generate-frame-batch"
        | "prepare-sound-options"
        | "continue-sound-option-chain"
        | "revise-sound-behavior"
        | "save-project"
        | "export-current-frame"
        | "attach-sound-option-to-frame"
        | "export-project"
        | "prepare-import-placement-intent"
        | "inspect-tool-intent"
        | "organize-layers"
        | "prepare-custom-command";
      label: string;
      targetSystem: DrawingAiEngineCommandSystem;
      executionGoal: string;
      executionMode: DrawingAiEngineCommandMode;
      commandChain: DrawingAiEngineCommandChain;
      parameters?: DrawingAiEngineCommandParameters | null;
      frameIndex?: number;
      soundOption?: DrawingAiSoundOption;
    }
  | null;

export const DRAWING_AI_SOUND_OPTION_DRAG_TYPE = "application/x-diamond-sound-option";

export const isDrawingAiVoicePlaceholderSoundOption = (option: DrawingAiSoundOption) =>
  option.contentType === "voice-placeholder";

export const isDrawingAiSoundFamily = (value: unknown): value is DrawingAiSoundFamily =>
  typeof value === "string" && (DRAWING_AI_SOUND_FAMILIES as readonly string[]).includes(value);

export const isDrawingAiWorkspaceType = (value: unknown): value is DrawingAiWorkspaceType =>
  typeof value === "string" && (DRAWING_AI_WORKSPACE_TYPES as readonly string[]).includes(value);

export type DrawingAiResponse = {
  output: string;
  mode: "chat";
  resultKind: DrawingAiResultKind;
  taskType: DrawingAiTaskType;
  reasoningLevel: DrawingAiReasoningLevel;
  searchUsed: boolean;
  searchDecision: DrawingAiSearchDecision | null;
  phaseHistory: DrawingAiTaskPhaseRecord[];
  execution: DrawingAiTaskExecution | null;
  warnings: string[];
  preReply: string | null;
  guidedPlanning: DrawingAiGuidedPlanningState | null;
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

export const DRAWING_AI_FALLBACK_OUTPUT = JSON.stringify(
  {
    commands: [
      {
        type: "no_plan",
        target: "engine",
        parameters: {
          timing: "halt",
          spacing: "none",
          intensity: "none",
          sequence: "blocked",
          constraints: "fallback-safe-stop",
          style: "command-director",
          continuation: false,
          reason: "AI command generation fallback activated.",
        },
      },
    ],
  },
  null,
  2,
);
export const DRAWING_AI_FOLLOW_UP_FALLBACK_OUTPUT = "";
export const DRAWING_AI_EDITED_FOLLOW_UP_FALLBACK_OUTPUT = "";
export const DRAWING_AI_FINAL_PLAN_FALLBACK_OUTPUT = JSON.stringify(
  {
    commands: [
      {
        type: "define_execution_target",
        target: "sequence",
        parameters: {
          timing: "normal",
          spacing: "medium",
          intensity: "medium",
          sequence: "open",
          constraints: "preserve-user-intent",
          style: "command-plan",
          continuation: false,
          instruction: "Use the user's request as the execution target.",
        },
      },
      {
        type: "define_sequence_start",
        target: "sequence_start",
        parameters: {
          timing: "normal",
          spacing: "tight",
          intensity: "medium",
          sequence: "start",
          constraints: "preserve-user-order",
          style: "command-plan",
          continuation: false,
          instruction: "Open on the first clear action from the request.",
        },
      },
      {
        type: "define_sequence_escalation",
        target: "sequence_escalation",
        parameters: {
          timing: "fast",
          spacing: "tight",
          intensity: "heavy",
          sequence: "escalation",
          constraints: "keep-cause-and-effect",
          style: "command-plan",
          continuation: false,
          instruction: "Escalate through the main turn or conflict increase.",
        },
      },
      {
        type: "define_final_result",
        target: "final_result",
        parameters: {
          timing: "normal",
          spacing: "medium",
          intensity: "medium",
          sequence: "settle",
          constraints: "finish-on-payoff",
          style: "command-plan",
          continuation: false,
          instruction: "Finish on the clearest payoff or settle state.",
        },
      },
    ],
  },
  null,
  2,
);

export const normalizeDrawingAiFollowUpQuestion = (value: string) => value.trim().toLowerCase();
export const getDrawingAiFollowUpQuestionKey = normalizeDrawingAiFollowUpQuestion;

const normalizeFollowUpOptions = (value: string[] | null | undefined) => {
  if (!Array.isArray(value)) {
    return null;
  }

  const nextValues = value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter((item) => item.length > 0);

  return nextValues.length > 0 ? [...new Set(nextValues)] : null;
};

export const normalizeDrawingAiFollowUpMemory = (
  followUpMemory: DrawingAiFollowUpMemoryItem[],
) => {
  const orderedKeys: string[] = [];
  const entries = new Map<string, DrawingAiFollowUpMemoryItem>();

  for (const item of followUpMemory) {
    const question = item.question.trim();
    const answer = item.answer.trim();
    if (!question || !answer) {
      continue;
    }

    const normalizedQuestion = normalizeDrawingAiFollowUpQuestion(question);
    const normalizedEntry: DrawingAiFollowUpMemoryItem = {
      question,
      answer,
      followUpMultiSelect: item.followUpMultiSelect === true,
      followUpOptions: normalizeFollowUpOptions(item.followUpOptions),
      normalizedValues: normalizeFollowUpOptions(item.normalizedValues),
    };

    const existingIndex = orderedKeys.indexOf(normalizedQuestion);
    if (existingIndex >= 0) {
      orderedKeys.splice(existingIndex, 1);
    }

    orderedKeys.push(normalizedQuestion);
    entries.set(normalizedQuestion, normalizedEntry);
  }

  return orderedKeys
    .map((key) => entries.get(key))
    .filter((item): item is DrawingAiFollowUpMemoryItem => item != null);
};

type NormalizeDrawingAiResponseOptions = {
  fallbackOutput?: string;
  fallbackTaskType?: DrawingAiTaskType;
  fallbackReasoningLevel?: DrawingAiReasoningLevel;
  logContext?: string;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object";

const isDrawingAiWorkspaceBitmapBounds = (value: unknown): value is DrawingAiWorkspaceBitmapBounds => {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.left === "number" &&
    typeof value.top === "number" &&
    typeof value.width === "number" &&
    typeof value.height === "number"
  );
};

const isDrawingAiWorkspaceSoundSummary = (value: unknown): value is DrawingAiWorkspaceSoundSummary => {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.title === "string" &&
    typeof value.description === "string" &&
    (value.timingFeel === null || value.timingFeel === undefined || typeof value.timingFeel === "string") &&
    (value.intensityFeel === null || value.intensityFeel === undefined || typeof value.intensityFeel === "string")
  );
};

export const isDrawingAiWorkspaceContext = (value: unknown): value is DrawingAiWorkspaceContext => {
  if (!isRecord(value)) {
    return false;
  }

  return (
    (value.projectId === null || value.projectId === undefined || typeof value.projectId === "string") &&
    typeof value.projectTitle === "string" &&
    typeof value.activeLayerId === "string" &&
    typeof value.activeLayerName === "string" &&
    typeof value.totalLayers === "number" &&
    typeof value.activeTool === "string" &&
    typeof value.timelineFps === "number" &&
    typeof value.authoredFrameCount === "number" &&
    typeof value.currentFrameIndex === "number" &&
    typeof value.selectedTimelineIndex === "number" &&
    typeof value.currentFrameHasBitmap === "boolean" &&
    (value.currentFrameBounds === null || value.currentFrameBounds === undefined || isDrawingAiWorkspaceBitmapBounds(value.currentFrameBounds)) &&
    (value.previousFilledFrameIndex === null || value.previousFilledFrameIndex === undefined || typeof value.previousFilledFrameIndex === "number") &&
    (value.nextFilledFrameIndex === null || value.nextFilledFrameIndex === undefined || typeof value.nextFilledFrameIndex === "number") &&
    (value.currentFrameSound === null || value.currentFrameSound === undefined || isDrawingAiWorkspaceSoundSummary(value.currentFrameSound)) &&
    (value.selectedFrameSound === null || value.selectedFrameSound === undefined || isDrawingAiWorkspaceSoundSummary(value.selectedFrameSound)) &&
    typeof value.hasOffCameraAuthoringArea === "boolean" &&
    typeof value.cameraAreaDescription === "string" &&
    typeof value.canvasWidth === "number" &&
    typeof value.canvasHeight === "number"
  );
};

export const isDrawingAiReasoningLevel = (value: unknown): value is DrawingAiReasoningLevel =>
  typeof value === "string" &&
  (DRAWING_AI_REASONING_LEVELS as readonly string[]).includes(value);

export const isDrawingAiTaskType = (value: unknown): value is DrawingAiTaskType =>
  typeof value === "string" &&
  (DRAWING_AI_TASK_TYPES as readonly string[]).includes(value);

export const isDrawingAiConversationMessage = (value: unknown): value is DrawingAiConversationMessage => {
  if (!isRecord(value)) {
    return false;
  }

  return (
    (value.role === "user" || value.role === "assistant") &&
    typeof value.content === "string"
  );
};

export const isDrawingAiFollowUpMemoryItem = (value: unknown): value is DrawingAiFollowUpMemoryItem => {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.question === "string" &&
    value.question.trim().length > 0 &&
    typeof value.answer === "string" &&
    value.answer.trim().length > 0 &&
    (value.followUpMultiSelect == null || typeof value.followUpMultiSelect === "boolean") &&
    (value.followUpOptions === null ||
      value.followUpOptions === undefined ||
      (Array.isArray(value.followUpOptions) &&
        value.followUpOptions.every((option) => typeof option === "string"))) &&
    (value.normalizedValues === null ||
      value.normalizedValues === undefined ||
      (Array.isArray(value.normalizedValues) &&
        value.normalizedValues.every((option) => typeof option === "string")))
  );
};

export const isDrawingAiActiveFollowUp = (value: unknown): value is DrawingAiActiveFollowUp => {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.question === "string" &&
    value.question.trim().length > 0 &&
    (value.followUpMultiSelect == null || typeof value.followUpMultiSelect === "boolean") &&
    (value.followUpOptions === null ||
      value.followUpOptions === undefined ||
      (Array.isArray(value.followUpOptions) &&
        value.followUpOptions.every((option) => typeof option === "string")))
  );
};

export const isDrawingAiFollowUpAnswerSource = (value: unknown): value is DrawingAiFollowUpAnswerSource =>
  value === "typed" || value === "option";

export const isDrawingAiFollowUpInteractionKind = (value: unknown): value is DrawingAiFollowUpInteractionKind =>
  value === "answer" || value === "edit";

export const isDrawingAiGuidedPlanningStatus = (
  value: unknown,
): value is DrawingAiGuidedPlanningStatus =>
  value === "questioning" || value === "ready-to-plan" || value === "plan-complete";

export const isDrawingAiGuidedPlanningSceneType = (
  value: unknown,
): value is DrawingAiGuidedPlanningSceneType =>
  value === "fight" ||
  value === "chase" ||
  value === "exploration" ||
  value === "discovery" ||
  value === "escape" ||
  value === "emotional" ||
  value === "comedy" ||
  value === "general" ||
  value === "unknown";

export const isDrawingAiGuidedPlanningState = (
  value: unknown,
): value is DrawingAiGuidedPlanningState => {
  if (!isRecord(value)) {
    return false;
  }

  return (
    isDrawingAiGuidedPlanningStatus(value.status) &&
    isDrawingAiGuidedPlanningSceneType(value.sceneType)
  );
};

export const isDrawingAiQuestionCardKind = (value: unknown): value is DrawingAiQuestionCardKind =>
  value === "planning" || value === "drawing" || value === "sound" || value === "general";

export const isDrawingAiResultKind = (value: unknown): value is DrawingAiResultKind =>
  value === "message" || value === "question" || value === "sound-options";

export const isDrawingAiTaskPhase = (value: unknown): value is DrawingAiTaskPhase =>
  value === "analyzing-message" ||
  value === "thinking" ||
  value === "searching" ||
  value === "planning" ||
  value === "planning-animation" ||
  value === "drawing" ||
  value === "generating-frames" ||
  value === "generating-sound-effects" ||
  value === "working";

export const isDrawingAiSoundOption = (value: unknown): value is DrawingAiSoundOption => {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.id === "string" &&
    value.id.trim().length > 0 &&
    typeof value.title === "string" &&
    value.title.trim().length > 0 &&
    typeof value.description === "string" &&
    value.description.trim().length > 0 &&
    (value.timingFeel === null || value.timingFeel === undefined || typeof value.timingFeel === "string") &&
    (value.intensityFeel === null || value.intensityFeel === undefined || typeof value.intensityFeel === "string") &&
    (value.durationSeconds === null ||
      value.durationSeconds === undefined ||
      (typeof value.durationSeconds === "number" && Number.isFinite(value.durationSeconds) && value.durationSeconds > 0)) &&
    (value.negativeConstraints === null ||
      value.negativeConstraints === undefined ||
      (Array.isArray(value.negativeConstraints) &&
        value.negativeConstraints.every((constraint) => typeof constraint === "string"))) &&
    (value.contentType === null ||
      value.contentType === undefined ||
      value.contentType === "sfx" ||
      value.contentType === "voice-placeholder") &&
    (value.speechText === null || value.speechText === undefined || typeof value.speechText === "string") &&
    (value.soundFamily === null || value.soundFamily === undefined || isDrawingAiSoundFamily(value.soundFamily)) &&
    (value.soundProfile === null || value.soundProfile === undefined || typeof value.soundProfile === "string") &&
    (value.planId === null || value.planId === undefined || typeof value.planId === "string") &&
    (value.planSummary === null || value.planSummary === undefined || typeof value.planSummary === "string") &&
    (value.previewSignature === null || value.previewSignature === undefined || typeof value.previewSignature === "string") &&
    (value.validationStatus === null ||
      value.validationStatus === undefined ||
      value.validationStatus === "valid" ||
      value.validationStatus === "adjusted-once" ||
      value.validationStatus === "needs-clarification") &&
    (value.referenceUsed === null || value.referenceUsed === undefined || typeof value.referenceUsed === "boolean") &&
    (value.referenceSummary === null || value.referenceSummary === undefined || typeof value.referenceSummary === "string")
  );
};

const isDrawingAiTaskPhaseRecord = (value: unknown): value is DrawingAiTaskPhaseRecord => {
  if (!isRecord(value)) {
    return false;
  }

  return isDrawingAiTaskPhase(value.phase) && typeof value.label === "string";
};

const isDrawingAiFrameRequestKind = (value: unknown): value is DrawingAiFrameRequestKind =>
  value === "single-frame" || value === "in-between" || value === "continuation" || value === "small-animation";

const isDrawingAiGeneratedFrameDraft = (value: unknown): value is DrawingAiGeneratedFrameDraft =>
  isRecord(value) && typeof value.pose === "string" && typeof value.description === "string";

const isDrawingAiGeneratedFrameBehaviorType = (
  value: unknown,
): value is DrawingAiGeneratedFrameBehaviorType =>
  typeof value === "string" &&
  (DRAWING_AI_GENERATED_FRAME_BEHAVIOR_TYPES as readonly string[]).includes(value);

const isDrawingAiGeneratedFrameToolIntent = (
  value: unknown,
): value is DrawingAiGeneratedFrameToolIntent =>
  typeof value === "string" &&
  (DRAWING_AI_GENERATED_FRAME_TOOL_INTENTS as readonly string[]).includes(value);

const isDrawingAiGeneratedFrameLayerIntent = (
  value: unknown,
): value is DrawingAiGeneratedFrameLayerIntent =>
  typeof value === "string" &&
  (DRAWING_AI_GENERATED_FRAME_LAYER_INTENTS as readonly string[]).includes(value);

const isDrawingAiGeneratedFrameWorkspaceIntent = (
  value: unknown,
): value is DrawingAiGeneratedFrameWorkspaceIntent =>
  isRecord(value) &&
  isDrawingAiGeneratedFrameBehaviorType(value.behaviorType) &&
  Array.isArray(value.toolIntents) &&
  value.toolIntents.every((toolIntent) => isDrawingAiGeneratedFrameToolIntent(toolIntent)) &&
  isDrawingAiGeneratedFrameLayerIntent(value.targetLayerIntent) &&
  typeof value.toolBased === "boolean" &&
  typeof value.generationAllowed === "boolean" &&
  typeof value.backgroundGenerationAllowed === "boolean" &&
  (value.fpsSuggestion === null || value.fpsSuggestion === undefined || typeof value.fpsSuggestion === "number") &&
  typeof value.applySuggestedFps === "boolean" &&
  (value.fpsReason === null || value.fpsReason === undefined || typeof value.fpsReason === "string");

const isDrawingAiGeneratedFramePlan = (value: unknown): value is DrawingAiGeneratedFramePlan =>
  isRecord(value) &&
  isDrawingAiFrameRequestKind(value.requestKind) &&
  typeof value.requestedFrameCount === "number" &&
  Array.isArray(value.frames) &&
  value.frames.length <= MAX_FRAMES_PER_REQUEST &&
  value.frames.every((frame) => isDrawingAiGeneratedFrameDraft(frame)) &&
  (value.workspaceIntent === null ||
    value.workspaceIntent === undefined ||
    isDrawingAiGeneratedFrameWorkspaceIntent(value.workspaceIntent)) &&
  (value.renderingQualityProfile === null ||
    value.renderingQualityProfile === undefined ||
    sanitizeDrawingAiRenderingQualityProfile(value.renderingQualityProfile) !== null) &&
  (value.familyQualityContract === null ||
    value.familyQualityContract === undefined ||
    sanitizeDrawingAiFamilyQualityContract(value.familyQualityContract) !== null) &&
  (value.principleActivationProfile === null ||
    value.principleActivationProfile === undefined ||
    sanitizeDrawingAiPrincipleActivationProfile(value.principleActivationProfile) !== null) &&
  (value.variationEnvelope === null ||
    value.variationEnvelope === undefined ||
    sanitizeDrawingAiVariationEnvelope(value.variationEnvelope) !== null) &&
  (value.renderAcceptanceContract === null ||
    value.renderAcceptanceContract === undefined ||
    sanitizeDrawingAiRenderAcceptanceContract(value.renderAcceptanceContract) !== null);

const isDrawingAiSearchDecision = (value: unknown): value is DrawingAiSearchDecision => {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.shouldSearch === "boolean" &&
    (value.reason === null || value.reason === undefined || typeof value.reason === "string") &&
    (value.query === null || value.query === undefined || typeof value.query === "string") &&
    (value.queries === null ||
      value.queries === undefined ||
      (Array.isArray(value.queries) &&
        value.queries.every((query) => typeof query === "string")))
  );
};

const isDrawingAiTaskExecution = (value: unknown): value is DrawingAiTaskExecution => {
  if (!isRecord(value) || !isDrawingAiTaskType(value.taskType) || typeof value.kind !== "string") {
    return false;
  }

  if (value.taskType === "generate-plans") {
    return (
      (value.kind === "question-needed" || value.kind === "completed-plan" || value.kind === "refinement") &&
      (value.status === "question-needed" ||
        value.status === "completed-plan" ||
        value.status === "refinement" ||
        value.status === "failed-safe") &&
      typeof value.continuation === "boolean"
    );
  }

  if (value.taskType === "generate-frames") {
    return (
      (value.kind === "question-needed" ||
        value.kind === "single-frame" ||
        value.kind === "multi-frame" ||
        value.kind === "continuation" ||
        value.kind === "cleanup" ||
        value.kind === "in-between" ||
        value.kind === "refinement" ||
        value.kind === "style-edit" ||
        value.kind === "unsupported") &&
      (value.status === "question-needed" ||
        value.status === "prepared-command" ||
        value.status === "completed-frames" ||
        value.status === "refinement" ||
        value.status === "partial-support" ||
        value.status === "failed-safe" ||
        value.status === "unsupported") &&
      typeof value.continuation === "boolean" &&
      (value.supportLevel === "full" || value.supportLevel === "partial") &&
      (value.applyMode === "none" || value.applyMode === "single-frame" || value.applyMode === "multi-frame") &&
      (value.estimatedFrameCount === null ||
        value.estimatedFrameCount === undefined ||
        typeof value.estimatedFrameCount === "number")
    );
  }

  if (value.taskType === "generate-sounds") {
    return (
      (value.kind === "question-needed" ||
        value.kind === "single-sound" ||
        value.kind === "options" ||
        value.kind === "revised-sound" ||
        value.kind === "continuation" ||
        value.kind === "timing-cue" ||
        value.kind === "attached-to-frame" ||
        value.kind === "imported-option-to-frame" ||
        value.kind === "voice-request-placeholder") &&
      (value.status === "question-needed" ||
        value.status === "completed-sound" ||
        value.status === "refinement" ||
        value.status === "completed-action" ||
        value.status === "prepared-command" ||
        value.status === "partial-support" ||
        value.status === "failed-safe") &&
      typeof value.continuation === "boolean" &&
      (value.optionCount === null || value.optionCount === undefined || typeof value.optionCount === "number")
    );
  }

  return (
    (value.kind === "prepared-command" ||
      value.kind === "unsupported" ||
      value.kind === "question-needed" ||
      value.kind === "redirect") &&
    (value.status === "completed-action" ||
      value.status === "prepared-command" ||
      value.status === "unsupported" ||
      value.status === "question-needed" ||
      value.status === "failed-safe") &&
    typeof value.continuation === "boolean"
  );
};

export const isDrawingAiResponse = (value: unknown): value is DrawingAiResponse => {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.output === "string" &&
    value.mode === "chat" &&
    isDrawingAiResultKind(value.resultKind) &&
    isDrawingAiTaskType(value.taskType) &&
    isDrawingAiReasoningLevel(value.reasoningLevel) &&
    typeof value.searchUsed === "boolean" &&
    (value.searchDecision === null || isDrawingAiSearchDecision(value.searchDecision)) &&
    Array.isArray(value.phaseHistory) &&
    value.phaseHistory.every((phase) => isDrawingAiTaskPhaseRecord(phase)) &&
    (value.execution === null || isDrawingAiTaskExecution(value.execution)) &&
    Array.isArray(value.warnings) &&
    value.warnings.every((warning) => typeof warning === "string") &&
    (value.preReply === null || typeof value.preReply === "string") &&
    (value.guidedPlanning === null || isDrawingAiGuidedPlanningState(value.guidedPlanning)) &&
    (value.questionCardKind === null || isDrawingAiQuestionCardKind(value.questionCardKind)) &&
    (value.followUpMode === "none" || value.followUpMode === "question-box") &&
    (value.followUpQuestion === null || typeof value.followUpQuestion === "string") &&
    (value.followUpMultiSelect === null || typeof value.followUpMultiSelect === "boolean") &&
    (value.followUpOptions === null ||
      (Array.isArray(value.followUpOptions) &&
        value.followUpOptions.every((option) => typeof option === "string"))) &&
    (value.generatedFramePlan === null ||
      value.generatedFramePlan === undefined ||
      isDrawingAiGeneratedFramePlan(value.generatedFramePlan)) &&
    (value.generateFramesState === null ||
      value.generateFramesState === undefined ||
      sanitizeDrawingAiGenerateFramesState(value.generateFramesState) !== null) &&
    (value.projectAiMemory === null ||
      value.projectAiMemory === undefined ||
      sanitizeDrawingAiProjectMemory(value.projectAiMemory) !== null) &&
    (value.soundOptions === null ||
      (Array.isArray(value.soundOptions) &&
        value.soundOptions.every((option) => isDrawingAiSoundOption(option)))) &&
    (value.actionPlan === null || sanitizeWorkspaceActionPlan(value.actionPlan) !== null)
  );
};

const sanitizeStringArray = (value: unknown) => {
  if (!Array.isArray(value)) {
    return null;
  }

  const nextValues = value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter((item) => item.length > 0);

  return nextValues.length > 0 ? nextValues : null;
};

const sanitizeEngineCommandParameters = (value: unknown): DrawingAiEngineCommandParameters | null => {
  if (!isRecord(value)) {
    return null;
  }

  const nextEntries: Array<[string, DrawingAiEngineCommandParameterValue]> = [];

  for (const [key, rawValue] of Object.entries(value)) {
    if (typeof key !== "string" || key.trim().length === 0) {
      continue;
    }

    if (
      rawValue === null ||
      typeof rawValue === "string" ||
      typeof rawValue === "number" ||
      typeof rawValue === "boolean"
    ) {
      nextEntries.push([key, rawValue]);
      continue;
    }

    if (
      Array.isArray(rawValue) &&
      rawValue.every((item) => typeof item === "string")
    ) {
      const normalizedArray = rawValue.map((item) => item.trim()).filter((item) => item.length > 0);
      nextEntries.push([key, normalizedArray]);
    }
  }

  if (nextEntries.length === 0) {
    return null;
  }

  return Object.fromEntries(nextEntries);
};

const sanitizeBoundedStringArray = (value: unknown, maxItems: number) =>
  (sanitizeStringArray(value) ?? []).slice(0, Math.max(0, maxItems));

const isDrawingAiGenerateFramesStateSubjectType = (value: unknown): value is DrawingAiGenerateFramesStateSubjectType =>
  typeof value === "string" && (DRAWING_AI_GENERATE_FRAMES_STATE_SUBJECT_TYPES as readonly string[]).includes(value);

const isDrawingAiGenerateFramesStateSubjectRole = (value: unknown): value is DrawingAiGenerateFramesStateSubjectRole =>
  typeof value === "string" && (DRAWING_AI_GENERATE_FRAMES_STATE_SUBJECT_ROLES as readonly string[]).includes(value);

const isDrawingAiGenerateFramesStateSubjectSide = (value: unknown): value is DrawingAiGenerateFramesStateSubjectSide =>
  typeof value === "string" && (DRAWING_AI_GENERATE_FRAMES_STATE_SUBJECT_SIDES as readonly string[]).includes(value);

const isDrawingAiGenerateFramesStateTone = (value: unknown): value is DrawingAiGenerateFramesStateTone =>
  typeof value === "string" && (DRAWING_AI_GENERATE_FRAMES_STATE_TONES as readonly string[]).includes(value);

const isDrawingAiGenerateFramesStateForceLevel = (value: unknown): value is DrawingAiGenerateFramesStateForceLevel =>
  typeof value === "string" && (DRAWING_AI_GENERATE_FRAMES_STATE_FORCE_LEVELS as readonly string[]).includes(value);

const isDrawingAiGenerateFramesStatePhase = (value: unknown): value is DrawingAiGenerateFramesStatePhase =>
  typeof value === "string" && (DRAWING_AI_GENERATE_FRAMES_STATE_PHASES as readonly string[]).includes(value);

const isDrawingAiGenerateFramesStateMotionType = (value: unknown): value is DrawingAiGenerateFramesStateMotionType =>
  typeof value === "string" && (DRAWING_AI_GENERATE_FRAMES_STATE_MOTION_TYPES as readonly string[]).includes(value);

const isDrawingAiGenerateFramesProjectScope = (value: unknown): value is DrawingAiGenerateFramesProjectScope =>
  typeof value === "string" && (DRAWING_AI_GENERATE_FRAMES_PROJECT_SCOPES as readonly string[]).includes(value);

const isDrawingAiGenerateFramesShotScope = (value: unknown): value is DrawingAiGenerateFramesShotScope =>
  typeof value === "string" && (DRAWING_AI_GENERATE_FRAMES_SHOT_SCOPES as readonly string[]).includes(value);

const isDrawingAiExecutionComplexityLevel = (value: unknown): value is DrawingAiExecutionComplexityLevel =>
  typeof value === "string" && (DRAWING_AI_EXECUTION_COMPLEXITY_LEVELS as readonly string[]).includes(value);

const isDrawingAiExecutionMotionEmphasis = (value: unknown): value is DrawingAiExecutionMotionEmphasis =>
  typeof value === "string" && (DRAWING_AI_EXECUTION_MOTION_EMPHASES as readonly string[]).includes(value);

const isDrawingAiExecutionEffectEmphasis = (value: unknown): value is DrawingAiExecutionEffectEmphasis =>
  typeof value === "string" && (DRAWING_AI_EXECUTION_EFFECT_EMPHASES as readonly string[]).includes(value);

const isDrawingAiExecutionQualityFloor = (value: unknown): value is DrawingAiExecutionQualityFloor =>
  typeof value === "string" && (DRAWING_AI_EXECUTION_QUALITY_FLOORS as readonly string[]).includes(value);

const isDrawingAiRenderingQualityFamily = (value: unknown): value is DrawingAiRenderingQualityFamily =>
  typeof value === "string" && (DRAWING_AI_RENDERING_QUALITY_FAMILIES as readonly string[]).includes(value);

const isDrawingAiRenderingQualityFloorTier = (value: unknown): value is DrawingAiRenderingQualityFloorTier =>
  typeof value === "string" && (DRAWING_AI_RENDERING_QUALITY_FLOOR_TIERS as readonly string[]).includes(value);

const isDrawingAiRenderingSimplicityTarget = (value: unknown): value is DrawingAiRenderingSimplicityTarget =>
  typeof value === "string" && (DRAWING_AI_RENDERING_SIMPLICITY_TARGETS as readonly string[]).includes(value);

const isDrawingAiAnimationPrinciple = (value: unknown): value is DrawingAiAnimationPrinciple =>
  typeof value === "string" && (DRAWING_AI_ANIMATION_PRINCIPLES as readonly string[]).includes(value);

const isDrawingAiPrincipleActivationLevel = (value: unknown): value is DrawingAiPrincipleActivationLevel =>
  typeof value === "string" && (DRAWING_AI_PRINCIPLE_ACTIVATION_LEVELS as readonly string[]).includes(value);

const isDrawingAiSearchConfidenceLevel = (value: unknown): value is DrawingAiSearchConfidenceLevel =>
  typeof value === "string" && (DRAWING_AI_SEARCH_CONFIDENCE_LEVELS as readonly string[]).includes(value);

const isDrawingAiExecutionBrevityLimit = (value: unknown): value is DrawingAiExecutionBrevityLimit =>
  typeof value === "string" && (DRAWING_AI_EXECUTION_BREVITY_LIMITS as readonly string[]).includes(value);

const isDrawingAiExecutionAddOnPolicy = (value: unknown): value is DrawingAiExecutionAddOnPolicy =>
  typeof value === "string" && (DRAWING_AI_EXECUTION_ADD_ON_POLICIES as readonly string[]).includes(value);

const isDrawingAiExecutionBeatCompletionRole = (value: unknown): value is DrawingAiExecutionBeatCompletionRole =>
  typeof value === "string" && (DRAWING_AI_EXECUTION_BEAT_COMPLETION_ROLES as readonly string[]).includes(value);

const isDrawingAiExecutionBeatExplicitness = (value: unknown): value is DrawingAiExecutionBeatExplicitness =>
  typeof value === "string" && (DRAWING_AI_EXECUTION_BEAT_EXPLICITNESS as readonly string[]).includes(value);

const isDrawingAiSubjectBindingType = (value: unknown): value is DrawingAiSubjectBindingType =>
  typeof value === "string" && (DRAWING_AI_SUBJECT_BINDING_TYPES as readonly string[]).includes(value);

const isDrawingAiLayerPlanMode = (value: unknown): value is DrawingAiLayerPlanMode =>
  typeof value === "string" && (DRAWING_AI_LAYER_PLAN_MODES as readonly string[]).includes(value);

const isDrawingAiCameraPlanMode = (value: unknown): value is DrawingAiCameraPlanMode =>
  typeof value === "string" && (DRAWING_AI_CAMERA_PLAN_MODES as readonly string[]).includes(value);

const isDrawingAiProjectInteractionMode = (value: unknown): value is DrawingAiProjectInteractionMode =>
  typeof value === "string" && (DRAWING_AI_PROJECT_INTERACTION_MODES as readonly string[]).includes(value);

const sanitizeDrawingAiPrincipleActivation = (value: unknown): DrawingAiPrincipleActivation | null => {
  if (!isRecord(value) || !isDrawingAiAnimationPrinciple(value.principle)) {
    return null;
  }

  const requiredUse = typeof value.requiredUse === "string" ? value.requiredUse.trim() : "";
  const misuseToForbid = typeof value.misuseToForbid === "string" ? value.misuseToForbid.trim() : "";
  if (requiredUse.length === 0 || misuseToForbid.length === 0) {
    return null;
  }

  return {
    principle: value.principle,
    activationLevel: isDrawingAiPrincipleActivationLevel(value.activationLevel) ? value.activationLevel : "supporting",
    requiredUse,
    misuseToForbid,
  };
};

const sanitizeDrawingAiPrincipleActivationProfile = (
  value: unknown,
): DrawingAiPrincipleActivationProfile | null => {
  if (!isRecord(value) || !Array.isArray(value.activations)) {
    return null;
  }

  const activations = value.activations
    .map((activation) => sanitizeDrawingAiPrincipleActivation(activation))
    .filter((activation): activation is DrawingAiPrincipleActivation => activation != null)
    .slice(0, 12);

  return activations.length > 0 ? { activations } : null;
};

const sanitizeDrawingAiVariationEnvelope = (value: unknown): DrawingAiVariationEnvelope | null => {
  if (!isRecord(value)) {
    return null;
  }

  const lockedIdentityTraits = sanitizeBoundedStringArray(value.lockedIdentityTraits, 16);
  const allowedVariationAxes = sanitizeBoundedStringArray(value.allowedVariationAxes, 16);
  const forbiddenSubstitutions = sanitizeBoundedStringArray(value.forbiddenSubstitutions, 16);
  if (lockedIdentityTraits.length === 0 && allowedVariationAxes.length === 0 && forbiddenSubstitutions.length === 0) {
    return null;
  }

  return {
    lockedIdentityTraits,
    allowedVariationAxes,
    forbiddenSubstitutions,
  };
};

const sanitizeDrawingAiFamilyQualityContract = (value: unknown): DrawingAiFamilyQualityContract | null => {
  if (!isRecord(value) || !isDrawingAiRenderingQualityFamily(value.family)) {
    return null;
  }

  const mustHaves = sanitizeBoundedStringArray(value.mustHaves, 16);
  const forbiddenPatterns = sanitizeBoundedStringArray(value.forbiddenPatterns, 16);
  const rejectConditions = sanitizeBoundedStringArray(value.rejectConditions, 16);
  const variationAxes = sanitizeBoundedStringArray(value.variationAxes, 16);
  if (mustHaves.length === 0 && forbiddenPatterns.length === 0 && rejectConditions.length === 0) {
    return null;
  }

  return {
    family: value.family,
    mustHaves,
    forbiddenPatterns,
    rejectConditions,
    variationAxes,
  };
};

const sanitizeDrawingAiRenderAcceptanceContract = (value: unknown): DrawingAiRenderAcceptanceContract | null => {
  if (!isRecord(value)) {
    return null;
  }

  const requiredMustHaves = sanitizeBoundedStringArray(value.requiredMustHaves, 20);
  const forbiddenBadPatterns = sanitizeBoundedStringArray(value.forbiddenBadPatterns, 20);
  const minimumReadableCompletion = sanitizeBoundedStringArray(value.minimumReadableCompletion, 12);
  const familyRejectConditions = sanitizeBoundedStringArray(value.familyRejectConditions, 12);
  const brevityProtections = sanitizeBoundedStringArray(value.brevityProtections, 12);
  const continuityProtections = sanitizeBoundedStringArray(value.continuityProtections, 12);
  if (
    requiredMustHaves.length === 0 &&
    forbiddenBadPatterns.length === 0 &&
    minimumReadableCompletion.length === 0 &&
    familyRejectConditions.length === 0
  ) {
    return null;
  }

  return {
    requiredMustHaves,
    forbiddenBadPatterns,
    minimumReadableCompletion,
    familyRejectConditions,
    brevityProtections,
    continuityProtections,
  };
};

const sanitizeDrawingAiRenderingQualityProfile = (
  value: unknown,
): DrawingAiRenderingQualityProfile | null => {
  if (!isRecord(value) || !isDrawingAiRenderingQualityFamily(value.family)) {
    return null;
  }

  return {
    family: value.family,
    qualityFloorTier: isDrawingAiRenderingQualityFloorTier(value.qualityFloorTier)
      ? value.qualityFloorTier
      : "simple-good",
    simplicityTarget: isDrawingAiRenderingSimplicityTarget(value.simplicityTarget)
      ? value.simplicityTarget
      : "balanced",
    forcePriorities: sanitizeBoundedStringArray(value.forcePriorities, 12),
    timingPriorities: sanitizeBoundedStringArray(value.timingPriorities, 12),
    readabilityPriorities: sanitizeBoundedStringArray(value.readabilityPriorities, 12),
    drawingClarityPriorities: sanitizeBoundedStringArray(value.drawingClarityPriorities, 12),
    completionRequirements: sanitizeBoundedStringArray(value.completionRequirements, 12),
    consistencyLocks: sanitizeBoundedStringArray(value.consistencyLocks, 12),
    antiTemplateVariationRange: sanitizeBoundedStringArray(value.antiTemplateVariationRange, 12),
    antiBadOutputWatchlist: sanitizeBoundedStringArray(value.antiBadOutputWatchlist, 20),
    repairPriorities: sanitizeBoundedStringArray(value.repairPriorities, 12),
  };
};

const sanitizeDrawingAiExecutionBeat = (value: unknown): DrawingAiExecutionBeat | null => {
  if (!isRecord(value) || typeof value.id !== "string" || typeof value.label !== "string") {
    return null;
  }

  const id = value.id.trim();
  const label = value.label.trim();
  if (id.length === 0 || label.length === 0) {
    return null;
  }

  return {
    id,
    order: typeof value.order === "number" && Number.isFinite(value.order) ? Math.max(0, Math.floor(value.order)) : 0,
    label,
    subjectIds: sanitizeBoundedStringArray(value.subjectIds, 8),
    sceneBinding:
      typeof value.sceneBinding === "string" && value.sceneBinding.trim().length > 0
        ? value.sceneBinding.trim()
        : null,
    explicitness: isDrawingAiExecutionBeatExplicitness(value.explicitness) ? value.explicitness : "explicit",
    mandatory: value.mandatory !== false,
    completionRole: isDrawingAiExecutionBeatCompletionRole(value.completionRole) ? value.completionRole : "other",
  };
};

const sanitizeDrawingAiSubjectBinding = (value: unknown): DrawingAiSubjectBinding | null => {
  if (
    !isRecord(value) ||
    typeof value.alias !== "string" ||
    typeof value.subjectId !== "string" ||
    !isDrawingAiSubjectBindingType(value.bindingType)
  ) {
    return null;
  }

  const alias = value.alias.trim();
  const subjectId = value.subjectId.trim();
  if (alias.length === 0 || subjectId.length === 0) {
    return null;
  }

  return {
    alias,
    subjectId,
    bindingType: value.bindingType,
  };
};

const sanitizeDrawingAiLayerPlan = (value: unknown): DrawingAiLayerPlan | null => {
  if (!isRecord(value) || !isDrawingAiLayerPlanMode(value.mode)) {
    return null;
  }

  return {
    mode: value.mode,
    preserveExistingContent: value.preserveExistingContent !== false,
    reason: typeof value.reason === "string" && value.reason.trim().length > 0 ? value.reason.trim() : null,
  };
};

const sanitizeDrawingAiCameraPlan = (value: unknown): DrawingAiCameraPlan | null => {
  if (!isRecord(value) || !isDrawingAiCameraPlanMode(value.mode)) {
    return null;
  }

  return {
    mode: value.mode,
    focusSubjectId:
      typeof value.focusSubjectId === "string" && value.focusSubjectId.trim().length > 0
        ? value.focusSubjectId.trim()
        : null,
    direction:
      typeof value.direction === "string" && value.direction.trim().length > 0 ? value.direction.trim() : null,
  };
};

const sanitizeDrawingAiSearchConfidenceProfile = (
  value: unknown,
): DrawingAiSearchConfidenceProfile | null => {
  if (!isRecord(value)) {
    return null;
  }

  const subject = isDrawingAiSearchConfidenceLevel(value.subject) ? value.subject : null;
  const motion = isDrawingAiSearchConfidenceLevel(value.motion) ? value.motion : null;
  const scene = isDrawingAiSearchConfidenceLevel(value.scene) ? value.scene : null;
  const style = isDrawingAiSearchConfidenceLevel(value.style) ? value.style : null;
  const continuity = isDrawingAiSearchConfidenceLevel(value.continuity) ? value.continuity : null;
  const overall = isDrawingAiSearchConfidenceLevel(value.overall) ? value.overall : null;
  if (subject == null || motion == null || scene == null || style == null || continuity == null || overall == null) {
    return null;
  }

  return {
    subject,
    motion,
    scene,
    style,
    continuity,
    overall,
  };
};

const sanitizeDrawingAiExecutionGuidanceProfile = (
  value: unknown,
): DrawingAiExecutionGuidanceProfile | null => {
  if (
    !isRecord(value) ||
    !isDrawingAiExecutionComplexityLevel(value.complexityLevel) ||
    !isDrawingAiExecutionMotionEmphasis(value.motionEmphasis) ||
    !isDrawingAiExecutionEffectEmphasis(value.effectEmphasis) ||
    !isDrawingAiExecutionBrevityLimit(value.brevityPreservationLimit) ||
    !isDrawingAiExecutionAddOnPolicy(value.addOnPolicy)
  ) {
    return null;
  }

  return {
    complexityLevel: value.complexityLevel,
    motionEmphasis: value.motionEmphasis,
    effectEmphasis: value.effectEmphasis,
    silhouetteGuidance: sanitizeBoundedStringArray(value.silhouetteGuidance, 8),
    structureGuidance: sanitizeBoundedStringArray(value.structureGuidance, 8),
    motionGuidance: sanitizeBoundedStringArray(value.motionGuidance, 8),
    completionGuidance: sanitizeBoundedStringArray(value.completionGuidance, 8),
    sceneGuidance: sanitizeBoundedStringArray(value.sceneGuidance, 8),
    brevityPreservationLimit: value.brevityPreservationLimit,
    addOnPolicy: value.addOnPolicy,
    antiPatternWatchlist: sanitizeBoundedStringArray(value.antiPatternWatchlist, 12),
    repairPriorities: sanitizeBoundedStringArray(value.repairPriorities, 10),
    stylePrinciples: sanitizeBoundedStringArray(value.stylePrinciples, 8),
  };
};

const sanitizeDrawingAiProjectStoryState = (value: unknown): DrawingAiProjectStoryState | null => {
  if (!isRecord(value)) {
    return null;
  }

  return {
    currentStoryGoal:
      typeof value.currentStoryGoal === "string" && value.currentStoryGoal.trim().length > 0
        ? value.currentStoryGoal.trim()
        : null,
    openSequenceArc:
      typeof value.openSequenceArc === "string" && value.openSequenceArc.trim().length > 0
        ? value.openSequenceArc.trim()
        : null,
    castRegistry: sanitizeBoundedStringArray(value.castRegistry, 12),
    styleAnchors: sanitizeBoundedStringArray(value.styleAnchors, 12),
    recentSceneSummaries: sanitizeBoundedStringArray(value.recentSceneSummaries, 12),
  };
};

export const sanitizeDrawingAiGenerateFramesState = (value: unknown): DrawingAiGenerateFramesState | null => {
  if (!isRecord(value) || !isDrawingAiGenerateFramesStateSubjectType(value.subjectType)) {
    return null;
  }

  const subjects = Array.isArray(value.subjects)
    ? value.subjects
        .filter(
          (subject): subject is DrawingAiGenerateFramesStateSubject =>
            isRecord(subject) &&
            typeof subject.id === "string" &&
            subject.id.trim().length > 0 &&
            isDrawingAiGenerateFramesStateSubjectType(subject.type) &&
            subject.type !== "mixed" &&
            isDrawingAiGenerateFramesStateSubjectRole(subject.role) &&
            isDrawingAiGenerateFramesStateSubjectSide(subject.side) &&
            (subject.color === null || typeof subject.color === "string") &&
            (subject.label === undefined || subject.label === null || typeof subject.label === "string") &&
            (subject.details === undefined ||
              (Array.isArray(subject.details) && subject.details.every((detail) => typeof detail === "string"))),
        )
        .map((subject) => ({
          id: subject.id.trim(),
          type: subject.type,
          role: subject.role,
          side: subject.side,
          color: typeof subject.color === "string" && subject.color.trim().length > 0 ? subject.color.trim() : null,
          label: typeof subject.label === "string" && subject.label.trim().length > 0 ? subject.label.trim() : null,
          details: Array.isArray(subject.details)
            ? Array.from(
                new Set(
                  subject.details
                    .map((detail) => detail.trim())
                    .filter((detail) => detail.length > 0),
                ),
              )
            : [],
        }))
    : [];

  return {
    ownerProjectId:
      typeof value.ownerProjectId === "string" && value.ownerProjectId.trim().length > 0
        ? value.ownerProjectId.trim()
        : null,
    subjectType: value.subjectType,
    subjects,
    projectScope: isDrawingAiGenerateFramesProjectScope(value.projectScope) ? value.projectScope : null,
    shotScope: isDrawingAiGenerateFramesShotScope(value.shotScope) ? value.shotScope : null,
    motionType: isDrawingAiGenerateFramesStateMotionType(value.motionType) ? value.motionType : "unknown",
    tone: isDrawingAiGenerateFramesStateTone(value.tone) ? value.tone : "neutral",
    forceLevel: isDrawingAiGenerateFramesStateForceLevel(value.forceLevel) ? value.forceLevel : "medium",
    animationPhase: isDrawingAiGenerateFramesStatePhase(value.animationPhase) ? value.animationPhase : "progression",
    frameCount:
      typeof value.frameCount === "number" && Number.isFinite(value.frameCount)
        ? clampRequestedFrameCount(value.frameCount)
        : 1,
    fps:
      typeof value.fps === "number" && Number.isFinite(value.fps)
        ? Math.max(1, Math.min(55, Math.round(value.fps)))
        : 12,
    modifiers: sanitizeStringArray(value.modifiers) ?? [],
    sceneSetting: typeof value.sceneSetting === "string" && value.sceneSetting.trim().length > 0 ? value.sceneSetting.trim() : null,
    sceneDescriptors: sanitizeStringArray(value.sceneDescriptors) ?? [],
    sceneProps: sanitizeStringArray(value.sceneProps) ?? [],
    sceneElements: sanitizeStringArray(value.sceneElements) ?? [],
    focusTargets: sanitizeStringArray(value.focusTargets) ?? [],
    actionKeywords: sanitizeStringArray(value.actionKeywords) ?? [],
    buildDirection:
      typeof value.buildDirection === "string" && value.buildDirection.trim().length > 0
        ? value.buildDirection.trim()
        : null,
    sequenceBeats: Array.isArray(value.sequenceBeats)
      ? value.sequenceBeats
          .map((beat) => sanitizeDrawingAiExecutionBeat(beat))
          .filter((beat): beat is DrawingAiExecutionBeat => beat != null)
          .slice(0, 12)
      : [],
    subjectBindings: Array.isArray(value.subjectBindings)
      ? value.subjectBindings
          .map((binding) => sanitizeDrawingAiSubjectBinding(binding))
          .filter((binding): binding is DrawingAiSubjectBinding => binding != null)
          .slice(0, 16)
      : [],
    layerPlan: sanitizeDrawingAiLayerPlan(value.layerPlan),
    cameraPlan: sanitizeDrawingAiCameraPlan(value.cameraPlan),
    executionGuidance: sanitizeDrawingAiExecutionGuidanceProfile(value.executionGuidance),
    searchConfidence: sanitizeDrawingAiSearchConfidenceProfile(value.searchConfidence),
    qualityFloor: isDrawingAiExecutionQualityFloor(value.qualityFloor) ? value.qualityFloor : null,
    recentVariationSignatures: sanitizeBoundedStringArray(value.recentVariationSignatures, 8),
    recentEdits: sanitizeStringArray(value.recentEdits) ?? [],
  };
};

export const isDrawingAiGenerateFramesState = (value: unknown): value is DrawingAiGenerateFramesState =>
  sanitizeDrawingAiGenerateFramesState(value) !== null;

export const sanitizeDrawingAiProjectMemory = (value: unknown): DrawingAiProjectMemory | null => {
  if (!isRecord(value)) {
    return null;
  }

  const generateFramesState =
    value.generateFramesState === null || value.generateFramesState === undefined
      ? null
      : sanitizeDrawingAiGenerateFramesState(value.generateFramesState);
  if (value.generateFramesState != null && generateFramesState == null) {
    return null;
  }

  return {
    version: 1,
    ownerProjectId:
      typeof value.ownerProjectId === "string" && value.ownerProjectId.trim().length > 0
        ? value.ownerProjectId.trim()
        : null,
    taskType: isDrawingAiTaskType(value.taskType) ? value.taskType : null,
    interactionMode: isDrawingAiProjectInteractionMode(value.interactionMode) ? value.interactionMode : "create",
    currentGoal: typeof value.currentGoal === "string" && value.currentGoal.trim().length > 0 ? value.currentGoal.trim() : null,
    contextSummary:
      typeof value.contextSummary === "string" && value.contextSummary.trim().length > 0
        ? value.contextSummary.trim()
        : null,
    lastPrompt: typeof value.lastPrompt === "string" && value.lastPrompt.trim().length > 0 ? value.lastPrompt.trim() : null,
    lastUpdatedAt:
      typeof value.lastUpdatedAt === "string" && value.lastUpdatedAt.trim().length > 0
        ? value.lastUpdatedAt.trim()
        : new Date(0).toISOString(),
    recentEdits: sanitizeStringArray(value.recentEdits) ?? [],
    storyState: sanitizeDrawingAiProjectStoryState(value.storyState),
    generateFramesState,
  };
};

export const isDrawingAiProjectMemory = (value: unknown): value is DrawingAiProjectMemory =>
  sanitizeDrawingAiProjectMemory(value) !== null;

const sanitizePositiveNumber = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;

const sanitizeSoundOptions = (value: unknown): DrawingAiSoundOption[] | null => {
  if (!Array.isArray(value)) {
    return null;
  }

  const nextOptions: DrawingAiSoundOption[] = value
    .filter((item): item is DrawingAiSoundOption => isDrawingAiSoundOption(item))
    .map((option) => ({
      id: option.id.trim(),
      title: option.title.trim(),
      description: option.description.trim(),
      timingFeel: typeof option.timingFeel === "string" && option.timingFeel.trim().length > 0 ? option.timingFeel.trim() : null,
      intensityFeel:
        typeof option.intensityFeel === "string" && option.intensityFeel.trim().length > 0
          ? option.intensityFeel.trim()
          : null,
      durationSeconds: sanitizePositiveNumber(option.durationSeconds),
      negativeConstraints: sanitizeStringArray(option.negativeConstraints),
      contentType: option.contentType === "voice-placeholder" ? "voice-placeholder" : "sfx",
      speechText: typeof option.speechText === "string" && option.speechText.trim().length > 0 ? option.speechText.trim() : null,
      soundFamily: isDrawingAiSoundFamily(option.soundFamily) ? option.soundFamily : null,
      soundProfile:
        typeof option.soundProfile === "string" && option.soundProfile.trim().length > 0
          ? option.soundProfile.trim()
          : null,
      planId: typeof option.planId === "string" && option.planId.trim().length > 0 ? option.planId.trim() : null,
      planSummary:
        typeof option.planSummary === "string" && option.planSummary.trim().length > 0
          ? option.planSummary.trim()
          : null,
      previewSignature:
        typeof option.previewSignature === "string" && option.previewSignature.trim().length > 0
          ? option.previewSignature.trim()
          : null,
      validationStatus:
        option.validationStatus === "valid" ||
        option.validationStatus === "adjusted-once" ||
        option.validationStatus === "needs-clarification"
          ? option.validationStatus
          : null,
      referenceUsed: typeof option.referenceUsed === "boolean" ? option.referenceUsed : null,
      referenceSummary:
        typeof option.referenceSummary === "string" && option.referenceSummary.trim().length > 0
          ? option.referenceSummary.trim()
          : null,
    }));

  return nextOptions.length > 0 ? nextOptions : null;
};

const sanitizeGeneratedFramePlan = (value: unknown): DrawingAiGeneratedFramePlan | null => {
  if (!isRecord(value) || !isDrawingAiFrameRequestKind(value.requestKind) || typeof value.requestedFrameCount !== "number") {
    return null;
  }

  if (!Array.isArray(value.frames)) {
    return null;
  }

  const requestedFrameCount = clampRequestedFrameCount(value.requestedFrameCount);
  const frames = value.frames
    .filter((frame): frame is DrawingAiGeneratedFrameDraft => isDrawingAiGeneratedFrameDraft(frame))
    .map((frame) => ({
      pose: frame.pose.trim(),
      description: frame.description.trim(),
    }))
    .filter((frame) => frame.pose.length > 0 || frame.description.length > 0)
    .slice(0, Math.min(MAX_FRAMES_PER_REQUEST, requestedFrameCount));

  const workspaceIntent = isDrawingAiGeneratedFrameWorkspaceIntent(value.workspaceIntent)
    ? {
        behaviorType: value.workspaceIntent.behaviorType,
        toolIntents: [...new Set(value.workspaceIntent.toolIntents)],
        targetLayerIntent: value.workspaceIntent.targetLayerIntent,
        toolBased: value.workspaceIntent.toolBased,
        generationAllowed: value.workspaceIntent.generationAllowed,
        backgroundGenerationAllowed: value.workspaceIntent.backgroundGenerationAllowed,
        fpsSuggestion:
          typeof value.workspaceIntent.fpsSuggestion === "number" && Number.isFinite(value.workspaceIntent.fpsSuggestion)
            ? Math.max(1, Math.min(55, Math.round(value.workspaceIntent.fpsSuggestion)))
            : null,
        applySuggestedFps: value.workspaceIntent.applySuggestedFps,
        fpsReason:
          typeof value.workspaceIntent.fpsReason === "string" && value.workspaceIntent.fpsReason.trim().length > 0
            ? value.workspaceIntent.fpsReason.trim()
            : null,
      }
    : null;

  return {
    requestKind: value.requestKind,
    requestedFrameCount,
    frames,
    workspaceIntent,
    renderingQualityProfile: sanitizeDrawingAiRenderingQualityProfile(value.renderingQualityProfile),
    familyQualityContract: sanitizeDrawingAiFamilyQualityContract(value.familyQualityContract),
    principleActivationProfile: sanitizeDrawingAiPrincipleActivationProfile(value.principleActivationProfile),
    variationEnvelope: sanitizeDrawingAiVariationEnvelope(value.variationEnvelope),
    renderAcceptanceContract: sanitizeDrawingAiRenderAcceptanceContract(value.renderAcceptanceContract),
  };
};

const sanitizeWorkspaceActionPlan = (value: unknown): DrawingAiActionPlan => {
  if (!isRecord(value) || value.type !== "engine-command") {
    return null;
  }

  if (typeof value.label !== "string" || value.label.trim().length === 0) {
    return null;
  }

  if (
    (value.commandType !== "plan-command" &&
      value.commandType !== "frame-command" &&
      value.commandType !== "sound-command" &&
      value.commandType !== "ui-command" &&
      value.commandType !== "custom-command") ||
    (value.targetSystem !== "other" &&
      value.targetSystem !== "generate-plans" &&
      value.targetSystem !== "generate-frames" &&
      value.targetSystem !== "generate-sounds" &&
      value.targetSystem !== "workspace-ui" &&
      value.targetSystem !== "engine") ||
    typeof value.executionGoal !== "string" ||
    value.executionGoal.trim().length === 0 ||
    (value.executionMode !== "execute-now" && value.executionMode !== "prepare-only") ||
    (value.commandChain !== "new" && value.commandChain !== "continue")
  ) {
    return null;
  }

  const baseActionPlan: {
    type: "engine-command";
    commandType: DrawingAiEngineCommandType;
    label: string;
    targetSystem: DrawingAiEngineCommandSystem;
    executionGoal: string;
    executionMode: DrawingAiEngineCommandMode;
    commandChain: DrawingAiEngineCommandChain;
    parameters: DrawingAiEngineCommandParameters | null;
  } = {
    type: "engine-command" as const,
    commandType: value.commandType,
    label: value.label.trim(),
    targetSystem: value.targetSystem,
    executionGoal: value.executionGoal.trim(),
    executionMode: value.executionMode,
    commandChain: value.commandChain,
    parameters: sanitizeEngineCommandParameters(value.parameters),
  };

  if (
    value.action === "prepare-plan-sequence" ||
    value.action === "extend-plan-sequence" ||
    value.action === "prepare-next-frame" ||
    value.action === "prepare-frame-cleanup" ||
    value.action === "generate-frame-batch" ||
    value.action === "prepare-sound-options" ||
    value.action === "continue-sound-option-chain" ||
    value.action === "revise-sound-behavior" ||
    value.action === "save-project" ||
    value.action === "export-current-frame" ||
    value.action === "export-project" ||
    value.action === "prepare-import-placement-intent" ||
    value.action === "inspect-tool-intent" ||
    value.action === "organize-layers" ||
    value.action === "prepare-custom-command"
  ) {
    return {
      ...baseActionPlan,
      action: value.action,
    };
  }

  if (
    value.action === "attach-sound-option-to-frame" &&
    typeof value.frameIndex === "number" &&
    Number.isFinite(value.frameIndex) &&
    value.frameIndex >= 0 &&
    isDrawingAiSoundOption(value.soundOption)
  ) {
    return {
      ...baseActionPlan,
      action: value.action,
      frameIndex: Math.floor(value.frameIndex),
      soundOption: {
        id: value.soundOption.id,
        title: value.soundOption.title,
        description: value.soundOption.description,
        timingFeel: value.soundOption.timingFeel ?? null,
        intensityFeel: value.soundOption.intensityFeel ?? null,
        durationSeconds: sanitizePositiveNumber(value.soundOption.durationSeconds),
        negativeConstraints: sanitizeStringArray(value.soundOption.negativeConstraints),
        contentType: value.soundOption.contentType === "voice-placeholder" ? "voice-placeholder" : "sfx",
        speechText: typeof value.soundOption.speechText === "string" ? value.soundOption.speechText : null,
        soundFamily: isDrawingAiSoundFamily(value.soundOption.soundFamily) ? value.soundOption.soundFamily : null,
        soundProfile: typeof value.soundOption.soundProfile === "string" ? value.soundOption.soundProfile : null,
        planId: typeof value.soundOption.planId === "string" ? value.soundOption.planId : null,
        planSummary: typeof value.soundOption.planSummary === "string" ? value.soundOption.planSummary : null,
        previewSignature:
          typeof value.soundOption.previewSignature === "string" ? value.soundOption.previewSignature : null,
        validationStatus:
          value.soundOption.validationStatus === "valid" ||
          value.soundOption.validationStatus === "adjusted-once" ||
          value.soundOption.validationStatus === "needs-clarification"
            ? value.soundOption.validationStatus
            : null,
        referenceUsed: typeof value.soundOption.referenceUsed === "boolean" ? value.soundOption.referenceUsed : null,
        referenceSummary:
          typeof value.soundOption.referenceSummary === "string" ? value.soundOption.referenceSummary : null,
      },
    };
  }

  return null;
};

const sanitizeRecentSoundOptions = (value: unknown): DrawingAiSoundOption[] | null => {
  if (!Array.isArray(value)) {
    return null;
  }

  const nextOptions: DrawingAiSoundOption[] = value
    .filter((item): item is DrawingAiSoundOption => isDrawingAiSoundOption(item))
    .map((item) => ({
      id: item.id,
      title: item.title,
      description: item.description,
      timingFeel: item.timingFeel ?? null,
      intensityFeel: item.intensityFeel ?? null,
      durationSeconds: sanitizePositiveNumber(item.durationSeconds),
      negativeConstraints: sanitizeStringArray(item.negativeConstraints),
      contentType: item.contentType === "voice-placeholder" ? "voice-placeholder" : "sfx",
      speechText: typeof item.speechText === "string" ? item.speechText : null,
      soundFamily: isDrawingAiSoundFamily(item.soundFamily) ? item.soundFamily : null,
      soundProfile: typeof item.soundProfile === "string" ? item.soundProfile : null,
      planId: typeof item.planId === "string" ? item.planId : null,
      planSummary: typeof item.planSummary === "string" ? item.planSummary : null,
      previewSignature: typeof item.previewSignature === "string" ? item.previewSignature : null,
      validationStatus:
        item.validationStatus === "valid" ||
        item.validationStatus === "adjusted-once" ||
        item.validationStatus === "needs-clarification"
          ? item.validationStatus
          : null,
      referenceUsed: typeof item.referenceUsed === "boolean" ? item.referenceUsed : null,
      referenceSummary: typeof item.referenceSummary === "string" ? item.referenceSummary : null,
    }));

  return nextOptions.length > 0 ? nextOptions : null;
};

const sanitizeTaskPhaseHistory = (value: unknown): DrawingAiTaskPhaseRecord[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((item): item is DrawingAiTaskPhaseRecord => isDrawingAiTaskPhaseRecord(item))
    .map((item) => ({
      phase: item.phase,
      label: item.label.trim(),
    }))
    .filter((item) => item.label.length > 0);
};

const sanitizeSearchDecision = (value: unknown): DrawingAiSearchDecision | null => {
  if (!isDrawingAiSearchDecision(value)) {
    return null;
  }

  return {
    shouldSearch: value.shouldSearch,
    reason: typeof value.reason === "string" && value.reason.trim().length > 0 ? value.reason.trim() : null,
    query: typeof value.query === "string" && value.query.trim().length > 0 ? value.query.trim() : null,
    queries:
      Array.isArray(value.queries)
        ? value.queries.map((query) => query.trim()).filter((query) => query.length > 0).slice(0, 6)
        : null,
  };
};

const sanitizeTaskExecution = (value: unknown): DrawingAiTaskExecution | null => {
  if (!isDrawingAiTaskExecution(value)) {
    return null;
  }

  if (value.taskType === "generate-plans") {
    return {
      taskType: value.taskType,
      kind: value.kind,
      status: value.status,
      continuation: value.continuation,
    };
  }

  if (value.taskType === "generate-frames") {
    return {
      taskType: value.taskType,
      kind: value.kind,
      status: value.status,
      continuation: value.continuation,
      supportLevel: value.supportLevel,
      applyMode: value.applyMode,
      estimatedFrameCount:
        typeof value.estimatedFrameCount === "number" ? value.estimatedFrameCount : null,
    };
  }

  if (value.taskType === "generate-sounds") {
    return {
      taskType: value.taskType,
      kind: value.kind,
      status: value.status,
      continuation: value.continuation,
      optionCount: typeof value.optionCount === "number" ? value.optionCount : null,
    };
  }

  return {
    taskType: value.taskType,
    kind: value.kind,
    status: value.status,
    continuation: value.continuation,
  };
};

const getDefaultQuestionCardKindForTask = (taskType: DrawingAiTaskType): DrawingAiQuestionCardKind =>
  taskType === "generate-plans"
    ? "planning"
    : taskType === "generate-frames"
      ? "drawing"
      : taskType === "generate-sounds"
        ? "sound"
        : "general";

export const normalizeDrawingAiResponse = (
  value: unknown,
  {
    fallbackOutput = DRAWING_AI_FALLBACK_OUTPUT,
    fallbackTaskType = DEFAULT_DRAWING_AI_TASK_TYPE,
    fallbackReasoningLevel = DEFAULT_DRAWING_AI_REASONING_LEVEL,
    logContext = "Drawing AI response",
  }: NormalizeDrawingAiResponseOptions = {},
): DrawingAiResponse => {
  const safeFallbackOutput = fallbackOutput.trim() || DRAWING_AI_FALLBACK_OUTPUT;
  let didWarn = false;
  const warnOnce = (reason: string) => {
    if (didWarn) {
      return;
    }

    didWarn = true;
    console.warn(`${logContext}: ${reason}`, value);
  };

  if (!isRecord(value)) {
    warnOnce("response was not an object");
    return {
      output: safeFallbackOutput,
      mode: "chat",
      resultKind: "message",
      taskType: fallbackTaskType,
      reasoningLevel: fallbackReasoningLevel,
      searchUsed: false,
      searchDecision: null,
      phaseHistory: [],
      execution: null,
      warnings: [],
      preReply: null,
      guidedPlanning: null,
      questionCardKind: null,
      followUpMode: "none",
      followUpQuestion: null,
      followUpMultiSelect: null,
      followUpOptions: null,
      generatedFramePlan: null,
      generateFramesState: null,
      projectAiMemory: null,
      soundOptions: null,
      actionPlan: null,
    };
  }

  const normalizedFollowUpQuestion =
    typeof value.followUpQuestion === "string" && value.followUpQuestion.trim().length > 0
      ? value.followUpQuestion.trim()
      : null;
  const normalizedFollowUpOptions = sanitizeStringArray(value.followUpOptions);
  const resolvedTaskType = isDrawingAiTaskType(value.taskType) ? value.taskType : fallbackTaskType;
  const allowBlankQuestionBoxOutput =
    value.followUpMode === "question-box" &&
    (normalizedFollowUpQuestion !== null || normalizedFollowUpOptions !== null);
  const allowBlankGenerateFramesOutput =
    resolvedTaskType === "generate-frames" &&
    value.followUpMode !== "question-box" &&
    typeof value.output === "string" &&
    value.output.trim().length === 0;
  const normalizedOutput =
    typeof value.output === "string"
      ? allowBlankQuestionBoxOutput || allowBlankGenerateFramesOutput
        ? value.output.trim()
        : value.output.trim().length > 0
          ? value.output.trim()
          : safeFallbackOutput
      : safeFallbackOutput;
  if (
    !allowBlankQuestionBoxOutput &&
    !allowBlankGenerateFramesOutput &&
    normalizedOutput === safeFallbackOutput &&
    (!(typeof value.output === "string") || value.output.trim().length === 0)
  ) {
    warnOnce("response was missing usable output text");
  }

  const normalizedWarnings = Array.isArray(value.warnings)
    ? value.warnings.filter((warning): warning is string => typeof warning === "string")
    : [];
  const normalizedSearchDecision = sanitizeSearchDecision(value.searchDecision);
  const normalizedPhaseHistory = sanitizeTaskPhaseHistory(value.phaseHistory);
  const normalizedExecution = sanitizeTaskExecution(value.execution);
  const normalizedPreReply =
    typeof value.preReply === "string" && value.preReply.trim().length > 0
      ? value.preReply.trim()
      : null;
  const normalizedGuidedPlanning = isDrawingAiGuidedPlanningState(value.guidedPlanning)
    ? value.guidedPlanning
    : null;
  const normalizedFollowUpMode =
    value.followUpMode === "question-box" &&
    (normalizedFollowUpQuestion !== null || normalizedFollowUpOptions !== null)
      ? "question-box"
      : "none";
  const normalizedGeneratedFramePlan =
    resolvedTaskType === "generate-frames" && normalizedFollowUpMode === "none"
      ? sanitizeGeneratedFramePlan(value.generatedFramePlan)
      : null;
  const normalizedGenerateFramesState =
    resolvedTaskType === "generate-frames" ? sanitizeDrawingAiGenerateFramesState(value.generateFramesState) : null;
  const normalizedProjectAiMemory = sanitizeDrawingAiProjectMemory(value.projectAiMemory);
  const normalizedSoundOptions =
    resolvedTaskType === "generate-sounds" ? sanitizeSoundOptions(value.soundOptions) : null;
  const normalizedQuestionCardKind =
    normalizedFollowUpMode === "question-box"
      ? isDrawingAiQuestionCardKind(value.questionCardKind)
        ? value.questionCardKind
        : getDefaultQuestionCardKindForTask(resolvedTaskType)
      : null;
  const normalizedResultKind =
    normalizedFollowUpMode === "question-box"
      ? "question"
      : normalizedSoundOptions && normalizedSoundOptions.length > 0
        ? "sound-options"
        : "message";

  return {
    output: normalizedOutput,
    mode: "chat",
    resultKind: normalizedResultKind,
    taskType: resolvedTaskType,
    reasoningLevel: isDrawingAiReasoningLevel(value.reasoningLevel)
      ? value.reasoningLevel
      : fallbackReasoningLevel,
    searchUsed: typeof value.searchUsed === "boolean" ? value.searchUsed : false,
    searchDecision: normalizedSearchDecision,
    phaseHistory: normalizedPhaseHistory,
    execution: normalizedExecution,
    warnings: normalizedWarnings,
    preReply: normalizedPreReply,
    guidedPlanning: normalizedGuidedPlanning,
    questionCardKind: normalizedQuestionCardKind,
    followUpMode: normalizedFollowUpMode,
    followUpQuestion: normalizedFollowUpMode === "question-box" ? normalizedFollowUpQuestion : null,
    followUpMultiSelect:
      normalizedFollowUpMode === "question-box" && typeof value.followUpMultiSelect === "boolean"
        ? value.followUpMultiSelect
        : null,
    followUpOptions: normalizedFollowUpMode === "question-box" ? normalizedFollowUpOptions : null,
    generatedFramePlan: normalizedFollowUpMode === "question-box" ? null : normalizedGeneratedFramePlan,
    generateFramesState: normalizedFollowUpMode === "question-box" ? null : normalizedGenerateFramesState,
    projectAiMemory: normalizedProjectAiMemory,
    soundOptions: normalizedFollowUpMode === "question-box" ? null : normalizedSoundOptions,
    actionPlan: normalizedFollowUpMode === "question-box" ? null : sanitizeWorkspaceActionPlan(value.actionPlan),
  };
};
