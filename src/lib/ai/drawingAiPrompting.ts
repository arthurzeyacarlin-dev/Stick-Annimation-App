import {
  getDrawingAiFollowUpQuestionKey,
  DRAWING_AI_FINAL_PLAN_FALLBACK_OUTPUT,
  normalizeDrawingAiFollowUpMemory,
  normalizeDrawingAiFollowUpQuestion,
  type DrawingAiInteractionIntentKind,
  type DrawingAiSoundOption,
  type DrawingAiActiveFollowUp,
  type DrawingAiConversationMessage,
  type DrawingAiFollowUpMemoryItem,
  type DrawingAiTaskIntentExample,
  type DrawingAiTaskType,
  type DrawingAiWorkspaceContext,
  type DrawingAiGeneratedFrameDraft,
  type DrawingAiProjectMemory,
} from "./drawingAiContract";
import type { DrawingAiReasoningEffort } from "./drawingAiProfiles";
import {
  MAX_FRAMES_PER_REQUEST,
  clampFrameDraftsToRequest,
  inferDrawingAiFrameRequestKind,
  resolveRequestedFrameCount,
} from "./frameGenerationSafety";
import {
  formatGeneratePlansExamplesForPrompt,
  GENERATE_PLANS_INTENT_EXAMPLES,
  type GeneratePlansExample,
} from "./plansTraining";
import {
  formatGenerateFramesExamplesForPrompt,
  GENERATE_FRAMES_INTENT_EXAMPLES,
  type GenerateFramesExample,
} from "./DrawingWorkspaceTask_GenerateFrames";
import {
  formatGenerateFramesRuntimeAnalysisForPrompt,
  type GenerateFramesRuntimeAnalysis,
} from "./generateFramesRuntime";
import {
  formatOtherExamplesForPrompt,
  formatOtherIntentExamplesForPrompt,
  GENERATE_OTHER_INTENT_EXAMPLES,
  type OtherTaskExample,
  type OtherTaskIntentExample,
  type OtherTaskRouteTarget,
} from "./DrawingWorkspaceTask_Other";
import {
  formatGenerateSoundExamplesForPrompt,
  GENERATE_SOUND_INTENT_EXAMPLES,
  type GenerateSoundExample,
} from "./DrawingWorkspaceTask_GenerateSound";
import {
  AI_TEXT_BALANCED_MODEL,
  AI_TEXT_ECONOMY_MODEL,
  AI_TEXT_MODEL,
  generateAiObject,
  generateAiText,
  type GenerateAiObjectMetadata,
} from "@/src/lib/openai/generateAiText";

export type DrawingAiSearchReference = {
  title: string;
  summary: string;
  url: string;
};

type GenerateFramesStructuredResponse = {
  decision: "question" | "result" | "no-plan";
  question: string;
  options: string[];
  frames: DrawingAiGeneratedFrameDraft[];
};

type GenerateFramesModelSelectionMetadata = {
  defaultModel: string;
  initialModel: string;
  selectedModel: string;
  fallbackModelUsed: boolean;
  escalatedFromDefault: boolean;
  escalatedTo: string | null;
  escalationReason: string | null;
  complexityTier: "low" | "medium" | "high";
  complexitySignals: string[];
  selectionJustification?: string[];
  structuredRetryUsed?: boolean;
};

type GenerateFramesStructuredRecoveryConfig = {
  validatorFeedback?: string;
  minimumModel?: string;
  strongerRetryFirst?: boolean;
  attemptLabel?: string;
  failureCategory?: string;
  retryAxes?: string[];
  preservedContext?: string[];
};

type GenerateSoundStructuredResponse = {
  decision: "question" | "result";
  response: string;
  question: string;
  options: string[];
  soundOptions: Array<{
    title: string;
    description: string;
    timingFeel: string;
    intensityFeel: string;
  }>;
};

type GenerateSoundStructuredRuntimeResponse = {
  decision: "question" | "result";
  response: string;
  question: string;
  options: string[];
  soundOptions: DrawingAiSoundOption[];
  recoveryMode: "valid" | "repaired";
  warnings: string[];
};

export type DrawingAiTaskIntentClassification = {
  kind: DrawingAiInteractionIntentKind;
  effectiveTaskType: DrawingAiTaskType | null;
  routeTarget: DrawingAiTaskType | "conversation" | "feedback";
  confidence: number;
  reason: string;
};

type BuildDrawingAiSystemInstructionsInput = {
  taskType: DrawingAiTaskType;
  reasoningInstruction: string;
};

type BuildTaskPromptInput = {
  taskType: DrawingAiTaskType;
  userMessage: string;
  conversationHistory?: DrawingAiConversationMessage[];
  followUpMemory?: DrawingAiFollowUpMemoryItem[];
  workspaceContext?: DrawingAiWorkspaceContext | null;
  projectAiMemory?: DrawingAiProjectMemory | null;
  searchResults?: DrawingAiSearchReference[];
  generatePlansAnalysis?: GeneratePlansRequestAnalysis;
  otherTrainingExamples?: OtherTaskExample[];
  generatePlansTrainingExamples?: GeneratePlansExample[];
  generateFramesTrainingExamples?: GenerateFramesExample[];
  generateFramesRuntimeAnalysis?: GenerateFramesRuntimeAnalysis;
  generateSoundTrainingExamples?: GenerateSoundExample[];
};

const formatProjectAiMemory = (projectAiMemory: DrawingAiProjectMemory) =>
  [
    `Owner project: ${projectAiMemory.ownerProjectId ?? "(unsaved session)"}`,
    `Interaction mode: ${projectAiMemory.interactionMode}`,
    `Current goal: ${projectAiMemory.currentGoal ?? "(none)"}`,
    `Context summary: ${projectAiMemory.contextSummary ?? "(none)"}`,
    `Current frame state: ${projectAiMemory.generateFramesState ? JSON.stringify(projectAiMemory.generateFramesState) : "(none)"}`,
    `Recent edits: ${projectAiMemory.recentEdits.join(" | ") || "(none)"}`,
    `Last prompt: ${projectAiMemory.lastPrompt ?? "(none)"}`,
    `Last updated at: ${projectAiMemory.lastUpdatedAt}`,
  ].join("\n");

export type GeneratePlansRequestAnalysis = {
  needsClarification: boolean;
  clarificationMode: "question-box" | "message" | "none";
  sceneType:
    | "fight"
    | "chase"
    | "exploration"
    | "discovery"
    | "escape"
    | "emotional"
    | "comedy"
    | "general"
    | "unknown";
  followUpIntro: string | null;
  followUpQuestion: string | null;
  followUpMultiSelect: boolean;
  followUpOptions: string[] | null;
  classificationReason: string;
  missingCreativeLocks: string[];
  decision: "question" | "plan" | "clarify";
  questionKey: string | null;
  questionPriorityReason: string | null;
  responseScale?: GeneratePlansResponseScale;
  improveMode?: boolean;
  messyInput?: boolean;
  preserveIdentity?: boolean;
};

export type GeneratePlansResponseScale = "simple" | "standard" | "exploratory";

export type GeneratePlansBehaviorSignals = {
  normalized: string;
  responseScale: GeneratePlansResponseScale;
  improveMode: boolean;
  messyInput: boolean;
  preserveIdentity: boolean;
  likelyUnclear: boolean;
  hasContextToPreserve: boolean;
  shouldUseOptions: boolean;
  heuristicQuestion: string | null;
  heuristicOptions: string[] | null;
};

type AnalyzeGeneratePlansRequestInput = {
  analysisInput: string;
  userMessage?: string;
  followUpMemory?: DrawingAiFollowUpMemoryItem[];
  recentlyAnsweredQuestion?: string | null;
  reasoningEffort?: DrawingAiReasoningEffort;
  trainingExamples?: GeneratePlansExample[];
};

type GeneratePlansModelAnalysis = {
  decision: "question" | "plan" | "message";
  sceneType: GeneratePlansRequestAnalysis["sceneType"];
  response: string;
  storySummary: string;
  knownStoryAnchors: GeneratePlansKnownStoryAnchors;
  knownFacts: string[];
  missingFacts: string[];
  rankedMissingFacts: string[];
  highestPriorityGap: string;
  reasoningWhyThisGapMattersMost: string;
  question: string;
  options: string[];
  typedOnly: boolean;
  confidence: number;
};

type GeneratePlansQuestionCardValidationResult = {
  isValid: boolean;
  failureReasons: string[];
  canRepairToTypedOnly: boolean;
};

type GeneratePlansKnownStoryAnchors = {
  knownObject: string;
  knownCharacters: string[];
  knownPlace: string;
  knownTriggerAction: string;
  knownOutcomeResult: string;
  knownRevealPoint: string;
  knownNextBeat: string;
};

type GeneratePlansStructuredDecisionLog = {
  structuredAttempted: boolean;
  structuredRetryUsed: boolean;
  structuredRawOutputPreview: string;
  structuredParseRecovered: boolean;
  degradedFallbackUsed: boolean;
  degradedFallbackType: "typed-question" | "message" | "none";
  legacyAnalyzerBlocked: boolean;
  reason: string;
};

const GENERATE_PLANS_COLOR_TERMS = [
  "red",
  "blue",
  "green",
  "yellow",
  "orange",
  "purple",
  "pink",
  "black",
  "white",
  "gray",
  "grey",
] as const;

const GENERATE_PLANS_ENTITY_NOUNS = [
  "stick figure",
  "character",
  "fighter",
  "figure",
  "star",
  "dot",
  "circle",
  "square",
  "triangle",
  "ball",
  "orb",
] as const;

const GENERATE_PLANS_ACTION_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /\brolling attack\b/g, label: "rolling attack" },
  { pattern: /\bbouncing strike\b/g, label: "bouncing strike" },
  { pattern: /\bdribbling strike\b/g, label: "dribbling strike" },
  { pattern: /\bpunch(?:ing|es)?\b/g, label: "punching" },
  { pattern: /\bkick(?:ing|s)?\b/g, label: "kicking" },
  { pattern: /\bbounc(?:e|ing|es)\b/g, label: "bouncing" },
  { pattern: /\broll(?:ing|s)?\b/g, label: "rolling" },
  { pattern: /\bdribbl(?:e|ing|es)\b/g, label: "dribbling" },
  { pattern: /\bslash(?:ing|es)?\b/g, label: "slashing" },
  { pattern: /\bgrappl(?:e|ing|es)?\b/g, label: "grappling" },
  { pattern: /\bthrow(?:ing|s)?\b/g, label: "throwing" },
  { pattern: /\btackl(?:e|ing|es)?\b/g, label: "tackling" },
  { pattern: /\bjump(?:ing|s)?\b/g, label: "jumping" },
  { pattern: /\bdash(?:ing|es)?\b/g, label: "dashing" },
  { pattern: /\bblock(?:ing|s)?\b/g, label: "blocking" },
  { pattern: /\bcounter(?:ing|s)?\b/g, label: "countering" },
  { pattern: /\breact(?:ing|s)?\b/g, label: "reacting" },
];

const DRAWING_AI_BASE_INSTRUCTIONS =
  "You operate inside an animation workspace command system. " +
  "AI only outputs engine commands. " +
  'Return one JSON object only in the shape {"commands":[{"type":"...","target":"...","parameters":{...}}]}. ' +
  "Never describe, explain, narrate, simulate animation, offer options, or add prose outside the JSON object. " +
  "Every parameters object must include timing, spacing, intensity, sequence, constraints, style, and continuation. " +
  "Only ask one short critical execution-lock question when the command cannot be prepared safely, and encode that question inside the command JSON. " +
  "Do not pretend the workspace changed unless the route has a real executor path for that request.";

const DRAWING_AI_TASK_INSTRUCTIONS: Record<DrawingAiTaskType, string> = {
  other:
    "You are in Task Other mode. Act like a pure intent classifier and engine-command preparer for miscellaneous animation-workspace requests. " +
    "Classify the request internally before responding: plan, frame, sound, UI, or unknown. " +
    "When the route is clear, map the request to one command with type, target, and parameters. " +
    "If the request is clearly plan, frame, or sound work, set targetSystem to that command planner. " +
    "If the request is clearly UI or workspace work, keep it in Other and prepare a UI command envelope instead of describing click paths or step sequences. " +
    "If the request is clear but does not belong to plan, frame, sound, or UI, prepare a custom-command envelope for the engine. " +
    "For frame-batch requests, prepare generate-frame-batch only when the sequence anchor is clear; otherwise ask one routing question to decide whether the batch starts new or continues the current sequence. " +
    "If the route is unclear, ask one precise targeted question that decides the command path and stop. " +
    "Do not ask multiple questions, do not guess, and do not produce fallback content. " +
    "Do not explain UI, do not give steps, and do not generate plan, frame, or sound content. " +
    "Assume the engine executes; Task Other only prepares the intent. " +
    "Final output stays in the shared commands-array JSON contract.",
  "generate-frames":
    "You are the engine command director for Generate Frames. Understand user intent, preserve continuity, and convert the request into structured action commands that the engine will execute. " +
    "Think in this order: understand the request, identify the subject and motion, classify the family, expand human-expected defaults, detect what would fail professional motion review, preserve continuity, then define command steps. " +
    "Return execution-plan data only. Do not pad with assistant-style explanation, summaries, or fake helpful filler. " +
    "Do not invent a humanoid, stick figure, face, limbs, or generic pose unless the user explicitly asks for that kind of subject. " +
    "Object requests must stay objects, effect requests must stay effects, background requests must stay environments, and continuation requests must stay strict continuations of the current sequence. " +
    "For common asks like stick figures, explosions, bouncing balls, lightning, breathing, and punches, trust human-expected defaults without asking obvious filler questions or treating search as mandatory. " +
    "Use exact motion defaults when they are obvious: punch means anticipation, contact, follow-through, and recovery; jump means crouch, launch, peak, land, and settle; continuation means preserve the current scene and append the next command. " +
    "Search only when the knowledge is genuinely unclear, such as named style references, ambiguous concepts, misspelled or unfamiliar prompts, or structural details the runtime cannot already defend. " +
    "Think like an engine command director: identify motion intent, convert it into ordered execution steps, assign parameters, and lock continuity. " +
    "Use professional motion logic internally: anticipation, action, impact when applicable, follow-through, and recovery. Convert that logic into commands instead of explaining it. " +
    "Every step must produce pose plus description in engine-command form. Use action names like pose, punch, kick, jump, explosion, lightning, breathe, walk, run, projectile, scroll, or another concrete engine action when appropriate. " +
    "Default command parameters must cover durationFrames, intensity, timing, spacing, and an explicit command instruction. For still setup frames use action=pose, durationFrames=1, intensity=none, timing=static, spacing=none, and a hold command. " +
    "User-facing output still stays inside the shared commands-array JSON contract. " +
    "Never use soft quality words like readable, clean, nice, smooth, strong, good, feels, looks, or reads in the command output. Replace them with parameter changes or execution instructions. " +
    "Do not frame the task as physics simulation, rendering, or storytelling; frame it as execution planning for an engine. " +
    "If one critical execution detail is genuinely missing, ask one short precise question. Otherwise proceed directly to structured command output. " +
    "If the prompt explicitly blocks the detected subject or action, do not define it.",
  "generate-plans":
    "You are in Generate Plans mode. Act like an intent interpreter and animation director, not a fiction writer, renderer, or frame generator. " +
    "Decide what should happen, in what order, what should be preserved, what payoff should land, and what sequence should later be sent to the execution layer. " +
    "Build practical engine-ready plans with visual beats, motion steps, scene order, pacing, fight flow, emotional turns, and what should happen first, next, and last. " +
    "Default to plans that can hand off cleanly into Generate Frames as the execution layer. Favor readable actions, staging, and turns over abstract storytelling language. " +
    "Prefer animation usefulness and execution clarity over deep narrative meaning unless the user explicitly asks for structure help or direction establishment. " +
    "Match the user's scale: simple asks get one short command plan, exploratory asks still collapse to one strongest command plan, and unclear asks get one smart clarifying question only. " +
    'When a plan is ready, the final output must be one JSON object in the shape {"commands":[{"type":"...","target":"...","parameters":{...}}]}. ' +
    "Each parameters object must include timing, spacing, intensity, sequence, constraints, style, and continuation. " +
    "Improve-mode requests like make it better, improve this, or fix this must preserve the same core sequence idea, main action, and key character or object while improving clarity, impact, pacing, and animation readability. " +
    "Messy revision phrases like this sucks, do it again, no not like that, why does this look weird, or keep it but fix it still mean preserve the current sequence idea first and either improve it directly or ask one focused question. " +
    "Bad plans add random twists, replace the idea, jump to unrelated spectacle, or cram too many actions into one beat. Good plans use logical cause and effect, readable step-by-step motion, and only as much complexity as the user asked for. " +
    "If the user is clearly continuing the same project, sequence, scene, or current plan, preserve that context and extend or refine it instead of restarting from scratch unless they explicitly ask for a new one. " +
    "If the user input is messy but still usable, choose a strong safe direction and plan now instead of over-asking. " +
    "If the request is too unclear for a strong plan, ask only 1 short high-value follow-up question about the missing beat instead of pretending you understand.",
  "generate-sounds":
    "You are in Generate Sounds mode. You are planning engine-ready sound behavior for an animation workspace. " +
    "AI does not generate audio here. AI defines sound behavior, timing, structure, and execution logic that the engine will generate later. " +
    "Hard rules: you do NOT generate sound, you define behavior for engine execution, and all output must be executable. " +
    "Move toward practical sound intent that can later be attached to actions or timeline sound moments. " +
    "Give specific engine behavior with event type, trigger timing, start-to-peak-to-aftermath structure, attack, intensity, texture behavior, decay behavior, and layering only when needed. " +
    "Use action language such as define event, trigger beat, increase attack, increase weight, lower intensity, shorten decay, add brittle layer, and avoid alien texture. " +
    "Do not use descriptive sound-creation wording like a heavy hit with or this sounds like. " +
    "Always collapse to one strict engine command. Do not return variants, options, or A/B choices. " +
    "User-facing output stays inside the shared commands-array JSON contract. " +
    "If the user replies with a choice like 1, 2, or 3, treat that as selecting the current behavior plan and output one command for that selection. " +
    "If the user is continuing the same project or current behavior plan, preserve the established sound family, ambience bed, timing logic, and event identity unless they clearly ask to change it. " +
    "If the user is revising an existing sound with messy language like sharper, heavier, softer, harder, shorter, darker, cleaner, less tail, more bass, or same vibe but heavier, map that to engine-parameter changes in attack, weight, intensity, texture, timing, decay, or layering instead of restarting. " +
    "If the user says keep the same but change one thing, preserve the sound family and modify only the requested dimension instead of rebuilding from scratch. " +
    "If the user gives negative feedback like no not like that, too weak, too cartoony, or redo it darker, preserve the current sound role and revise it directly. " +
    "Treat frame-target language like on frame 1, on this frame, put it on frame 3, attach option 2 to frame 7, or place this on the first frame as a real placement instruction. " +
    "Every behavior plan must complete a full event shape: start -> peak -> aftermath. Do not stop at the peak moment. " +
    "Lock sound family identity. Explosion is not bone. Punch is not kick. Wind bed is not whoosh motion. Modifiers change behavior, not identity. " +
    "Voice, speech, dialogue, or spoken-line requests are not explosion or impact sounds. Do not map speech to blasts, booms, or arcade impact families. " +
    "If local speech generation is not available, be honest and treat it as a voice-request placeholder workflow instead of pretending speech audio was generated. " +
    "For cartoon bounce, boing, rubbery bounce, or springy bounce requests, default to playful, springy, rounded, readable toon language and never to explosion, blast, or broken noisy-hit language. " +
    "For explosion or blast requests, map user changes to engine behavior such as pressure front, blast body, low-end weight, aftermath length, debris layer, and negative texture constraints. Do not default to crunchy, overdriven, or dirty arcade wording unless the user explicitly wants that. " +
    "For wind, leaves, room tone, hallway air, background rumble, button clicks, beeps, confirm tones, and other non-fight sounds, default to airy, subtle, muted, restrained, environmental, click, chirp, pulse, rustle, or room-tone language instead of impact words. " +
    "For door, hinge, hallway-door, or old-wood open sounds, default to hinge strain, wood friction, groan, creak pulses, slow opening motion, and restrained room resonance. Do not turn them into whooshes, race-car sweeps, windy pass-by sounds, UFO beeps, or sci-fi tonal sweeps. " +
    "For race-car, engine, or vehicle pass-by sounds, default to engine rise, pass-by peak, approach, receding tail, doppler bend, and restrained road or air texture. Do not turn them into explosions, blasts, impact bodies, crunchy transients, UFO sweeps, or sci-fi beeps unless the user explicitly wants arcade stylization. " +
    "If enough is known, proceed immediately. If one critical detail is missing, ask one precise question only. " +
    "Do not claim audio was generated. Do not drift into plugin, DAW, synthesis, mixing, or music theory talk unless the user explicitly asks for that.",
};

const DRAWING_AI_SEARCH_GUIDANCE: Record<DrawingAiTaskType, string> = {
  other:
    "Use these search references as inspiration and context. Do not claim you watched, opened, or verified exact videos or pages unless the titles or snippets explicitly support that. Prefer wording like \"Based on the search references...\" or \"From the titles and snippets...\" when needed. Use them to prepare better routing or command intent, especially for workspace behavior, project organization, tool usage, and export or import intent when relevant.",
  "generate-frames":
    "Use these search references as inspiration and context for execution-command planning. Do not claim you watched, opened, or verified exact videos or pages unless the titles or snippets explicitly support that. Prefer wording like \"Based on the search references...\" or \"From the titles and snippets...\" when needed. Focus on ordered actions, pose progression, command timing, spacing, and readable motion structure.",
  "generate-plans":
    "Use these search references as inspiration and context for planning. Do not claim you watched, opened, or verified exact videos or pages unless the titles or snippets explicitly support that. Focus on beats, staging, order of work, motion clarity, and practical creative direction that can hand off into frames.",
  "generate-sounds":
    "Use these search references as inspiration and context for sound behavior planning. Do not claim you listened to, opened, or verified exact media unless the titles or snippets explicitly support that. Focus on viewer expectation, physical build, timing cues, family lock, start-to-peak-to-aftermath structure, texture, decay, layering when useful, and how the engine should execute the animation beat.",
};

const DRAWING_AI_TASK_LABELS: Record<DrawingAiTaskType, string> = {
  other: "Other",
  "generate-frames": "Generate Frames",
  "generate-plans": "Generate Plans",
  "generate-sounds": "Generate Sounds",
};

const formatWorkspaceContext = (workspaceContext: DrawingAiWorkspaceContext) =>
  [
    `Project: ${workspaceContext.projectTitle}${workspaceContext.projectId ? ` (${workspaceContext.projectId})` : ""}`,
    `Active layer: ${workspaceContext.activeLayerName} (${workspaceContext.activeLayerId})`,
    `Current frame: ${workspaceContext.currentFrameIndex + 1}`,
    `Selected timeline position: ${workspaceContext.selectedTimelineIndex + 1}`,
    `Authored frame count: ${workspaceContext.authoredFrameCount}`,
    `Active tool: ${workspaceContext.activeTool}`,
    `Timeline FPS: ${workspaceContext.timelineFps}`,
    `Canvas size: ${workspaceContext.canvasWidth} x ${workspaceContext.canvasHeight}`,
    `Current frame has content: ${workspaceContext.currentFrameHasBitmap ? "yes" : "no"}`,
    workspaceContext.currentFrameBounds
      ? `Current frame bounds: left ${Math.round(workspaceContext.currentFrameBounds.left)}, top ${Math.round(workspaceContext.currentFrameBounds.top)}, width ${Math.round(workspaceContext.currentFrameBounds.width)}, height ${Math.round(workspaceContext.currentFrameBounds.height)}`
      : "Current frame bounds: none",
    workspaceContext.previousFilledFrameIndex != null
      ? `Previous filled frame: ${workspaceContext.previousFilledFrameIndex + 1}`
      : "Previous filled frame: none",
    workspaceContext.nextFilledFrameIndex != null
      ? `Next filled frame: ${workspaceContext.nextFilledFrameIndex + 1}`
      : "Next filled frame: none",
    workspaceContext.currentFrameSound
      ? `Current frame sound: ${workspaceContext.currentFrameSound.title}${workspaceContext.currentFrameSound.timingFeel ? ` (${workspaceContext.currentFrameSound.timingFeel})` : ""}`
      : "Current frame sound: none",
    workspaceContext.selectedFrameSound
      ? `Selected frame sound: ${workspaceContext.selectedFrameSound.title}${workspaceContext.selectedFrameSound.timingFeel ? ` (${workspaceContext.selectedFrameSound.timingFeel})` : ""}`
      : "Selected frame sound: none",
    `Off-camera authoring space: ${workspaceContext.hasOffCameraAuthoringArea ? "available" : "not available"}`,
    `Camera area: ${workspaceContext.cameraAreaDescription}`,
  ].join("\n");

const CASUAL_GREETING_PATTERN = /^(hi|hello|hey|yo|sup|what(?:['’]s| is)\s+up|good morning|good afternoon|good evening)\b[!.?\s]*$/i;
const LEADING_GREETING_FILLER_PATTERN = /^(?:hi|hello|hey|yo|sup)(?:\s+there)?(?:[!.,\s-]+|$)/i;
const CASUAL_SHARING_PATTERN =
  /\b(just wanted to tell you|i had some(?:\s+\w+){0,3}\s+ideas|i have some(?:\s+\w+){0,3}\s+ideas|just sharing|thinking out loud|brainstorming|wanted your thoughts|wanted to talk them through)\b/i;
const FEEDBACK_PATTERN =
  /\b(do you think|what do you think|are these ideas good|is this idea good|do these(?:\s+\w+){0,3}\s+work|does this work|does this read|feedback|thoughts on)\b/i;
const OTHER_WORKSPACE_TASK_PATTERN =
  /\b(save|export|import|asset|assets|rename|organize|organise|layers?\b|symbols?\b|library\b|timeline\b|workspace\b|project\b|tool\b|button\b|feature\b|workflow\b|set up\b|setup\b|clean up\b|cleanup\b|prepare\b|manage\b)\b/i;
const GENERATE_PLANS_TASK_PATTERN =
  /\b(plan\b|make this into a plan|turn this into a plan|help me plan|storyboard|story beats|beat sheet|continue the current plan|add onto the current story|current plan|next beat|add a beat|help me make a story|build a story|come up with good ideas|help me make a good story|good story together|i don['’]?t know what to create|story ideas|alan becker style)\b/i;
const GENERATE_PLANS_COLLABORATIVE_IDEA_PATTERN =
  /\b(come up with (?:good )?ideas(?: with me)?|help me make a good story|good story together|i don['’]?t know what to create|help me figure out the story|brainstorm story ideas|story ideas for)\b/i;
const GENERATE_PLANS_SCENE_DESCRIPTION_PATTERN =
  /\b(?:a|an|the|two)\b.{0,80}\b(fight|chase|door|hallway|library|station|train|bridge|roof|classroom|school|student|robot|drawing|monster|camera|note|map|key|shadow|friend|enemy|balloon|cafeteria|performance|talent show)\b/i;
const GENERATE_FRAMES_TASK_PATTERN =
  /\b(draw\b|redraw|next frame|in[- ]between|inbetween|pose|stick(?:\s|-)?(?:figure|man|person)?|ball|circle|square|rectangle|block|rod|staff|robot|zombie|tree|plant|fan|propeller|creature|door|desk|crate|cloud|mountain|rock|background|backdrop|hallway|dark room|room|prop|scene element|walk(?:ing| cycle)?|run(?:ning| cycle)?|treadmill|walk in place|run in place|lightning|lightning strike|bolt|explosion|explode|blast|detonation|fire|flame|smoke|dust|debris|glow|energy trail|crack|cracks|fracture|fractures|concrete|sword slash|slash arc|effect|raise (?:the|his|her) arm|turn the head|make .* look|bigger|larger|smaller|shrink|fill(?:ed| in)? .*?(?:face|head)|make .*?(?:face|head) black|black face|white eyes|sunglasses|shades|punch|kick|jump|land|guard|run in|off[- ]camera|enter from|clean up|cleanup|silhouette|anticipation|follow[- ]through|expression|animate .* now|generate the animation|make the frames now|turn .* into frames|smooth this out|smooth the animation|same animation but|same bounce but|cleaner|pixely|pixelly|pixel-y|arcadey|arcade-y|no,? not like that|that(?:'s| is) wrong|fix it|redo it|try again|only change|keep everything else the same|don't redraw|do not redraw|keep the same drawing|keep the same character)\b/i;
const GENERATE_SOUND_TASK_PATTERN =
  /\b(sound\b|sfx\b|sound effect|options?\b|choices?\b|impact\b|whoosh\b|ambience\b|sting\b|roar\b|growl\b|scream\b|beep\b|alarm\b|portal\b|explosion\b|bone\b|fracture\b|crack\b|snap\b|voice\b|speech\b|dialogue\b|spoken\b|say(?:ing)?\b|harder\b|shorter\b|longer\b|cleaner\b|darker\b|brighter\b|softer\b|sharper\b|tail\b|reverb\b|bass\b|cartoony\b|heavier\b|lighter\b|combine\b|couple sound effects\b|rustle\b|crunch\b|leaves?\b|twig\b|branch\b|creak\b|door\b|hallway\b|footsteps?\b|debris\b|volcano\b|rumble\b|distant\b|background\b|button\b|click\b|menu\b|notification\b|interface\b|boing\b|bounce\b|bouncy\b|rubber(?:y)?\b|spring(?:y)?\b|race car\b|racecar\b|car\b|vehicle\b|engine\b|motor\b|pass(?:-by)?\b|zooms past\b|approach\b|approaching\b|receding\b|going away\b|doppler\b|road\b|option\s*[1-4]\b|glitch(?:y)?\b|anime\b|magical\b|robot(?:ic)?\b|ui\b|confirm\b|warning\b|import option\b|use sound\b|put option\b|attach .* frame\b|frame one\b|frame 1\b|first frame\b)\b/i;
const GENERATE_SOUND_LITERAL_SPEECH_PATTERN =
  /\b(?:voice|speech|dialogue|spoken|voice line|say(?:ing)?)\b|\b(?:put|place|attach|make)\s+(?:hello|hi|hey|yes|no|wait|stop|go)\s+(?:on|to|into|at)\b/i;
const GENERATE_PLANS_CONTINUATION_PATTERN =
  /\b(continue(?: this| the current| the same)?(?: story| scene| plan| animation)?|keep going|build on this(?: story| scene| beat)?|keep the same(?: story| scene| plan)?|same (?:project|story|scene|plan)|saved project|existing project|add another beat|add one more beat|extend this moment|after that part|next beat|add .* after this|after this (?:punch|kick|hit|beat|move)|insert .* after)\b/i;
const GENERATE_FRAMES_CONTINUATION_PATTERN =
  /\b(continue(?: this| the current| the same)?(?: animation| frame| motion| pose| scene| sequence)?|keep going|build on this|keep the same(?: scene| character| pose| animation)?|same (?:scene|sequence|animation|character|project)|current (?:animation|pose|sequence|scene)|after this hit|after that|then (?:he|she|they)\b|next (?:he|she|they)\b|now make (?:him|her|them)\b|extend this moment)\b/i;
const GENERATE_SOUND_CONTINUATION_PATTERN =
  /\b(continue(?: this| the current| the same)?(?: sound| ambience| cue| direction)?|keep going|build on this|keep the same(?: sound| sound family| style| ambience| portal| impact| vibe)?|same (?:sound|sound family|style|ambience|direction|project|vibe)|current (?:sound|ambience|cue)|second hit|third hit|next hit|follow[- ]up (?:sound|whoosh|impact|sting)|for the next beat|same one|same idea|same portal|same hit|same creepy hallway)\b/i;
const GENERATE_SOUND_CHOICE_PATTERN =
  /^\s*(?:(?:i\s+(?:pick|choose|want))\s*)?(?:option\s*)?[1-4]\s*\.?$/i;
const IMPROVE_IDEA_FEEDBACK_PATTERN =
  /\b(improve|make better|fix)\b.*\b(idea|story|concept|pose|frame idea|sound idea|animation idea)\b/i;
const REQUEST_VERB_PATTERN =
  /\b(help me|draw|redraw|generate|make|create|give|add|continue|turn|keep|need|want|animate|save|export|import|rename|organize|organise|clean up|cleanup|set up|setup|prepare|manage)\b/i;

const stripLeadingGreetingFiller = (value: string) => {
  const normalized = normalizeIntentText(value);
  const stripped = normalized.replace(LEADING_GREETING_FILLER_PATTERN, "").trim();
  return stripped.length > 0 ? stripped : normalized;
};

const inferTaskTypeFromActiveFollowUp = (activeFollowUp: DrawingAiActiveFollowUp): DrawingAiTaskType => {
  const questionText = `${activeFollowUp.question} ${(activeFollowUp.followUpOptions ?? []).join(" ")}`.toLowerCase();

  if (GENERATE_SOUND_TASK_PATTERN.test(questionText)) {
    return "generate-sounds";
  }

  if (GENERATE_FRAMES_TASK_PATTERN.test(questionText)) {
    return "generate-frames";
  }

  return "generate-plans";
};

const normalizeIntentText = (value: string) =>
  value
    .toLowerCase()
    .replace(/[“”]/g, '"')
    .replace(/[’]/g, "'")
    .replace(/[\u2013\u2014]/g, " ")
    .replace(/[^\w\s'/-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const getIntentTokens = (value: string) =>
  normalizeIntentText(value)
    .split(/\s+/)
    .filter((token) => token.length > 2);

const getIntentExamplesForTask = (taskType: DrawingAiTaskType): DrawingAiTaskIntentExample[] => {
  if (taskType === "generate-plans") {
    return GENERATE_PLANS_INTENT_EXAMPLES;
  }

  if (taskType === "generate-frames") {
    return GENERATE_FRAMES_INTENT_EXAMPLES;
  }

  if (taskType === "generate-sounds") {
    return GENERATE_SOUND_INTENT_EXAMPLES;
  }

  return [];
};

const scoreOtherIntentExamples = (
  examples: OtherTaskIntentExample[],
  userTokens: Set<string>,
  scores: Record<OtherTaskRouteTarget, number>,
) => {
  for (const example of examples) {
    const exampleTokens = new Set(getIntentTokens([example.userPrompt, example.notes, ...example.tags].join(" ")));
    let overlap = 0;

    for (const token of userTokens) {
      if (exampleTokens.has(token)) {
        overlap += 1;
      }
    }

    if (overlap > 0) {
      scores[example.preferredRoute] += overlap * 1.5;
    }
  }
};

const scoreIntentExamples = (
  examples: DrawingAiTaskIntentExample[],
  userTokens: Set<string>,
  scores: Record<DrawingAiInteractionIntentKind, number>,
) => {
  for (const example of examples) {
    const exampleTokens = new Set(getIntentTokens([example.userPrompt, example.notes, ...example.tags].join(" ")));
    let overlap = 0;

    for (const token of userTokens) {
      if (exampleTokens.has(token)) {
        overlap += 1;
      }
    }

    if (overlap > 0) {
      scores[example.intent] += overlap * 1.4;
    }
  }
};

export const classifyDrawingAiTaskIntent = ({
  taskType,
  userMessage,
  conversationHistory = [],
  activeFollowUp = null,
}: {
  taskType: DrawingAiTaskType;
  userMessage: string;
  conversationHistory?: DrawingAiConversationMessage[];
  activeFollowUp?: DrawingAiActiveFollowUp | null;
}): DrawingAiTaskIntentClassification => {
  if (activeFollowUp) {
    const followUpTaskType = taskType === "other" ? inferTaskTypeFromActiveFollowUp(activeFollowUp) : taskType;
    return {
      kind: "task",
      effectiveTaskType: followUpTaskType,
      routeTarget: followUpTaskType,
      confidence: 1,
      reason: "There is already an active task follow-up in progress.",
    };
  }

  const normalized = normalizeIntentText(userMessage);
  const soundNormalized = stripLeadingGreetingFiller(userMessage);
  const tokens = new Set(getIntentTokens(userMessage));
  const lastAssistantMessage =
    [...conversationHistory].reverse().find((message) => message.role === "assistant")?.content ?? "";
  const normalizedLastAssistant = normalizeIntentText(lastAssistantMessage);

  if (taskType === "generate-frames" && normalized.length > 0) {
    return {
      kind: "task",
      effectiveTaskType: "generate-frames",
      routeTarget: "generate-frames",
      confidence: 0.98,
      reason: "Generate Frames is an execution-locked task and should stay in engine-command preparation mode for non-empty requests.",
    };
  }

  if (taskType === "generate-plans" && normalized.length > 0) {
    return {
      kind: "task",
      effectiveTaskType: "generate-plans",
      routeTarget: "generate-plans",
      confidence: 0.99,
      reason: "Generate Plans is selected, so any non-empty input should be interpreted as sequence intent and converted into engine-command planning.",
    };
  }

  if (taskType === "generate-sounds" && normalized.length > 0) {
    return {
      kind: "task",
      effectiveTaskType: "generate-sounds",
      routeTarget: "generate-sounds",
      confidence: 0.98,
      reason: "Generate Sounds is selected, so any non-empty input should be interpreted as sound intent and converted into engine-command planning.",
    };
  }

  if (taskType === "other") {
    const routeScores: Record<OtherTaskRouteTarget, number> = {
      other: 0,
      "generate-plans": 0,
      "generate-frames": 0,
      "generate-sounds": 0,
    };

    if (!normalized) {
      routeScores.other += 8;
    }

    if (CASUAL_GREETING_PATTERN.test(userMessage.trim())) {
      routeScores.other += 10;
    }

    if (CASUAL_SHARING_PATTERN.test(normalized)) {
      routeScores.other += 6;
    }

    if (FEEDBACK_PATTERN.test(normalized)) {
      routeScores.other += 6;
    }

    if (IMPROVE_IDEA_FEEDBACK_PATTERN.test(normalized) && !GENERATE_PLANS_TASK_PATTERN.test(normalized)) {
      routeScores.other += 6;
    }

    if (OTHER_WORKSPACE_TASK_PATTERN.test(normalized) && REQUEST_VERB_PATTERN.test(normalized)) {
      routeScores.other += 12;
    }

    if (GENERATE_PLANS_TASK_PATTERN.test(normalized)) {
      routeScores["generate-plans"] += 14;
    }

    if (GENERATE_PLANS_COLLABORATIVE_IDEA_PATTERN.test(normalized)) {
      routeScores["generate-plans"] += 14;
    }

    if (GENERATE_PLANS_SCENE_DESCRIPTION_PATTERN.test(normalized)) {
      routeScores["generate-plans"] += 10;
    }

    if (GENERATE_PLANS_CONTINUATION_PATTERN.test(normalized)) {
      routeScores["generate-plans"] += 12;
    }

    if (GENERATE_FRAMES_TASK_PATTERN.test(normalized) && REQUEST_VERB_PATTERN.test(normalized)) {
      routeScores["generate-frames"] += 14;
    }

    if (GENERATE_FRAMES_CONTINUATION_PATTERN.test(normalized) && /\b(frame|pose|motion|animation|character|camera|staff|rod|bamboo|arm|head|kick|punch|swing|landing|run|jump)\b/.test(normalized)) {
      routeScores["generate-frames"] += 12;
    }

    if ((GENERATE_SOUND_TASK_PATTERN.test(soundNormalized) || GENERATE_SOUND_LITERAL_SPEECH_PATTERN.test(soundNormalized)) && (REQUEST_VERB_PATTERN.test(soundNormalized) || /\boptions?\b|\bchoices?\b/.test(soundNormalized) || /\bframe\b/.test(soundNormalized))) {
      routeScores["generate-sounds"] += 14;
    }

    if (GENERATE_SOUND_CONTINUATION_PATTERN.test(soundNormalized) && /\b(sound|ambience|impact|hit|whoosh|portal|sting|cue|sfx|crunch|creak|footstep|bone|voice)\b/.test(soundNormalized)) {
      routeScores["generate-sounds"] += 12;
    }

    if (GENERATE_SOUND_CHOICE_PATTERN.test(userMessage.trim()) && /\b1\.|\b2\.|\b3\.|\b4\./.test(normalizedLastAssistant)) {
      routeScores["generate-sounds"] += 16;
    }

    scoreOtherIntentExamples(GENERATE_OTHER_INTENT_EXAMPLES, tokens, routeScores);

    const rankedRoutes = (Object.entries(routeScores) as Array<[OtherTaskRouteTarget, number]>).sort(
      (left, right) => right[1] - left[1],
    );
    const [bestRoute, bestScore] = rankedRoutes[0] ?? ["other", 0];
    const secondScore = rankedRoutes[1]?.[1] ?? 0;
    const confidence = bestScore <= 0 ? 0.55 : Math.min(0.98, 0.55 + Math.max(0, bestScore - secondScore) / 20);

    return {
      kind: "task",
      effectiveTaskType: bestRoute,
      routeTarget: bestRoute,
      confidence,
      reason:
        bestRoute === "other"
          ? "The request does not yet identify a direct plan, frame, or sound lane, so Task Other should resolve or prepare the engine command intent."
          : `The user request is clearly closer to ${DRAWING_AI_TASK_LABELS[bestRoute]}, so that system should prepare the engine commands.`,
    };
  }

  const scores: Record<DrawingAiInteractionIntentKind, number> = {
    conversation: 0,
    feedback: 0,
    task: 0,
  };

  if (!normalized) {
    scores.conversation += 8;
  }

  if (CASUAL_GREETING_PATTERN.test(userMessage.trim())) {
    scores.conversation += 12;
  }

  if (CASUAL_SHARING_PATTERN.test(normalized)) {
    scores.conversation += 8;
    scores.feedback += 4;
  }

  if (FEEDBACK_PATTERN.test(normalized)) {
    scores.feedback += 10;
  }

  if (IMPROVE_IDEA_FEEDBACK_PATTERN.test(normalized) && !GENERATE_PLANS_TASK_PATTERN.test(normalized)) {
    scores.feedback += 8;
  }

  if (
    taskType === "generate-plans" &&
    (GENERATE_PLANS_TASK_PATTERN.test(normalized) ||
      GENERATE_PLANS_CONTINUATION_PATTERN.test(normalized) ||
      GENERATE_PLANS_COLLABORATIVE_IDEA_PATTERN.test(normalized))
  ) {
    scores.task += 12;
  }

  if (
    taskType === "generate-frames" &&
    ((GENERATE_FRAMES_TASK_PATTERN.test(normalized) && REQUEST_VERB_PATTERN.test(normalized)) ||
      GENERATE_FRAMES_CONTINUATION_PATTERN.test(normalized))
  ) {
    scores.task += 12;
  }

  if (
    taskType === "generate-sounds" &&
    (((GENERATE_SOUND_TASK_PATTERN.test(soundNormalized) || GENERATE_SOUND_LITERAL_SPEECH_PATTERN.test(soundNormalized)) &&
      (REQUEST_VERB_PATTERN.test(soundNormalized) || /\boptions?\b|\bchoices?\b/.test(soundNormalized) || /\bframe\b/.test(soundNormalized))) ||
      GENERATE_SOUND_CONTINUATION_PATTERN.test(soundNormalized))
  ) {
    scores.task += 12;
  }

  if (taskType === "generate-sounds" && GENERATE_SOUND_CHOICE_PATTERN.test(userMessage.trim()) && /\b1\.|\b2\.|\b3\.|\b4\./.test(normalizedLastAssistant)) {
    scores.task += 14;
  }

  scoreIntentExamples(getIntentExamplesForTask(taskType), tokens, scores);

  const rankedIntents = (Object.entries(scores) as Array<[DrawingAiInteractionIntentKind, number]>).sort(
    (left, right) => right[1] - left[1],
  );
  const [bestIntent, bestScore] = rankedIntents[0] ?? ["conversation", 0];
  const secondScore = rankedIntents[1]?.[1] ?? 0;
  const confidence = bestScore <= 0 ? 0.55 : Math.min(0.98, 0.55 + Math.max(0, bestScore - secondScore) / 20);

  if (bestIntent === "task" && bestScore >= secondScore + 2) {
    return {
      kind: "task",
      effectiveTaskType: taskType,
      routeTarget: taskType,
      confidence,
      reason: "The user message looks like an explicit task request for the selected tool.",
    };
  }

  if (bestIntent === "feedback" && bestScore >= secondScore + 1) {
    return {
      kind: "feedback",
      effectiveTaskType: null,
      routeTarget: "feedback",
      confidence,
      reason: "The user is asking for feedback, reactions, or brainstorming help rather than direct task output.",
    };
  }

  return {
    kind: "conversation",
    effectiveTaskType: null,
    routeTarget: "conversation",
    confidence,
    reason: "The message reads like casual conversation or idea sharing instead of a direct task request.",
  };
};

const GENERATE_FRAMES_STRUCTURED_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["decision", "question", "options", "frames"],
  properties: {
    decision: {
      type: "string",
      enum: ["question", "result", "no-plan"],
    },
    question: { type: "string" },
    options: {
      type: "array",
      items: { type: "string" },
      maxItems: 4,
    },
    frames: {
      type: "array",
      maxItems: MAX_FRAMES_PER_REQUEST,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["pose", "description"],
        properties: {
          pose: { type: "string" },
          description: { type: "string" },
        },
      },
    },
  },
} as const;

const GENERATE_SOUND_STRUCTURED_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["decision", "response", "question", "options", "soundOptions"],
  properties: {
    decision: {
      type: "string",
      enum: ["question", "result"],
    },
    response: { type: "string" },
    question: { type: "string" },
    options: {
      type: "array",
      items: { type: "string" },
      maxItems: 4,
    },
    soundOptions: {
      type: "array",
      maxItems: 4,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["title", "description", "timingFeel", "intensityFeel"],
        properties: {
          title: { type: "string" },
          description: { type: "string" },
          timingFeel: { type: "string" },
          intensityFeel: { type: "string" },
        },
      },
    },
  },
} as const;

const sanitizeStructuredOptions = (options: string[]) =>
  options.map((option) => option.trim()).filter((option) => option.length > 0).slice(0, 4);

const normalizeGenerateFramesStructuredObject = (
  value: Partial<GenerateFramesStructuredResponse>,
  requestedFrameCount: number,
): GenerateFramesStructuredResponse | null => {
  const decision =
    value.decision === "question"
      ? "question"
      : value.decision === "no-plan"
        ? "no-plan"
        : "result";
  const question = typeof value.question === "string" ? value.question.trim() : "";
  const options = sanitizeStructuredOptions(value.options ?? []);
  const frames =
    decision === "result"
      ? clampFrameDraftsToRequest(
          (value.frames ?? [])
            .map((frame) => ({
              pose: typeof frame.pose === "string" ? frame.pose.trim() : "",
              description: typeof frame.description === "string" ? frame.description.trim() : "",
            }))
            .filter((frame) => frame.pose.length > 0 || frame.description.length > 0),
          requestedFrameCount,
          "Generate Frames structured repair",
        )
      : [];

  if (decision === "question" && question.length === 0) {
    return null;
  }

  if (decision === "result" && frames.length === 0) {
    return null;
  }

  return {
    decision,
    question,
    options,
    frames,
  };
};

const slugifyDrawingAiOptionId = (value: string, fallbackIndex: number) => {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32);

  return slug.length > 0 ? slug : `sound-option-${fallbackIndex + 1}`;
};

const inferStructuredSoundFamily = (value: string): DrawingAiSoundOption["soundFamily"] => {
  const normalized = value.toLowerCase();
  if (/\b(explosion|blast|detonation|shockwave)\b/.test(normalized)) return "explosion";
  if (/\b(punch|fist|jab|hook|uppercut)\b/.test(normalized)) return "punch";
  if (/\b(kick|roundhouse|knee|boot|heel)\b/.test(normalized)) return "kick";
  if (/\b(bone|fracture|break|snap|crack)\b/.test(normalized)) return "bone-break";
  if (/\b(wind|gust|breeze)\b/.test(normalized)) return "wind";
  if (/\b(whoosh|swish|swoosh|swing)\b/.test(normalized)) return "whoosh";
  if (/\b(door|hinge|lock|latch)\b/.test(normalized)) return "door";
  if (/\b(footstep|walk|step|run|stomp)\b/.test(normalized)) return "footsteps";
  if (/\b(rain|drizzle|downpour)\b/.test(normalized)) return "rain";
  if (/\b(thunder|lightning|electric|zap)\b/.test(normalized)) return /\b(thunder|lightning)\b/.test(normalized) ? "thunder" : "electricity";
  if (/\b(water|splash|wet|spray)\b/.test(normalized)) return "water";
  if (/\b(zipper|zip|unzip)\b/.test(normalized)) return "zipper";
  if (/\b(button|ui|beep|chirp|confirm|menu|notification)\b/.test(normalized)) return "ui-beep";
  if (/\b(vehicle|car|engine|pass-by|pass by)\b/.test(normalized)) return "vehicle-pass";
  if (/\b(portal)\b/.test(normalized)) return "portal";
  if (/\b(magic|spell|arcane)\b/.test(normalized)) return "magic";
  if (/\b(energy)\b/.test(normalized)) return "energy";
  if (/\b(laser|plasma|blaster)\b/.test(normalized)) return "laser";
  if (/\b(creature|monster|beast|dragon|roar|growl)\b/.test(normalized)) return "creature";
  if (/\b(fire|flame|ignite|ignition)\b/.test(normalized)) return "fire";
  if (/\b(volcano|eruption|lava|magma)\b/.test(normalized)) return "volcano";
  if (/\b(room tone|room-tone|ambience|ambient|background)\b/.test(normalized)) return "room-tone";
  if (/\b(impact|hit|slam|landing)\b/.test(normalized)) return "impact";
  return "generic";
};

const getStructuredSoundShape = (family: NonNullable<DrawingAiSoundOption["soundFamily"]>) => {
  switch (family) {
    case "explosion":
      return { label: "explosion", start: "pressure build", peak: "blast body", aftermath: "debris tail", texture: "pressure-led blast" };
    case "punch":
      return { label: "punch impact", start: "drive-in", peak: "contact", aftermath: "short release", texture: "body-led contact" };
    case "kick":
      return { label: "kick impact", start: "swing", peak: "shoe contact", aftermath: "body transfer", texture: "leg-led contact" };
    case "bone-break":
      return { label: "bone break", start: "tension cue", peak: "fracture crack", aftermath: "body settle", texture: "dry anatomical fracture" };
    case "wind":
      return { label: "wind", start: "air onset", peak: "gust body", aftermath: "air fade", texture: "environmental air movement" };
    case "whoosh":
      return { label: "whoosh", start: "motion onset", peak: "air pass", aftermath: "release", texture: "air-motion" };
    case "door":
      return { label: "door", start: "hinge onset", peak: "movement body", aftermath: "settle", texture: "mechanical hinge movement" };
    case "footsteps":
      return { label: "footsteps", start: "weight transfer", peak: "surface contact", aftermath: "release", texture: "surface-led contact" };
    case "rain":
      return { label: "rain", start: "weather entry", peak: "drop field", aftermath: "soft release", texture: "weather bed" };
    case "thunder":
      return { label: "thunder strike", start: "flash crack", peak: "storm body", aftermath: "rolling tail", texture: "electric storm rollout" };
    case "electricity":
      return { label: "electric event", start: "charge onset", peak: "zap body", aftermath: "dissipate", texture: "bright electric" };
    case "water":
      return { label: "water splash", start: "wet onset", peak: "splash body", aftermath: "spray tail", texture: "wet surface spread" };
    case "zipper":
      return { label: "zipper", start: "slide start", peak: "tooth chatter", aftermath: "finish click", texture: "tight mechanical friction" };
    case "ui-beep":
      return { label: "ui beep", start: "input cue", peak: "confirm pulse", aftermath: "clean stop", texture: "clean electronic pulse" };
    case "vehicle-pass":
      return { label: "vehicle pass", start: "approach rise", peak: "pass peak", aftermath: "recede", texture: "engine-led pass-by" };
    case "portal":
      return { label: "portal event", start: "warp onset", peak: "opening body", aftermath: "resolve", texture: "warp-led energy" };
    case "magic":
      return { label: "magic event", start: "charge", peak: "bloom", aftermath: "resolve", texture: "magical release" };
    case "energy":
      return { label: "energy event", start: "charge", peak: "release", aftermath: "discharge", texture: "controlled energy" };
    case "laser":
      return { label: "laser", start: "charge", peak: "fire pulse", aftermath: "dissipate", texture: "focused energy" };
    case "creature":
      return { label: "creature event", start: "organic attack", peak: "chest body", aftermath: "breath release", texture: "organic chest-led" };
    case "fire":
      return { label: "fire event", start: "ignition onset", peak: "flame bloom", aftermath: "burn decay", texture: "flame-led" };
    case "volcano":
      return { label: "volcano eruption", start: "pressure vent", peak: "eruption body", aftermath: "ash rollout", texture: "pressure-led hot-rock" };
    case "room-tone":
      return { label: "room tone", start: "bed onset", peak: "place detail", aftermath: "open space", texture: "place identity bed" };
    case "impact":
      return { label: "impact", start: "approach", peak: "contact", aftermath: "settle", texture: "contact-led impact" };
    default:
      return { label: "sound event", start: "setup", peak: "main event", aftermath: "resolve", texture: "family texture" };
  }
};

const normalizeStructuredSoundDirectiveText = (value: string) =>
  value
    .trim()
    .replace(/\.$/, "")
    .replace(/^(?:a|an|the)\s+/i, "")
    .replace(/\bwith\b/gi, " -> ")
    .replace(/,\s*(?:and\s+)?/g, " -> ")
    .replace(/\s+and\s+/g, " -> ")
    .replace(/\s+into\s+/gi, " -> ")
    .replace(/\s+then\s+/gi, " -> ")
    .replace(/\s+followed by\s+/gi, " -> ")
    .replace(/\binstead of\b/gi, " | avoid ")
    .replace(/\bwithout\b/gi, " | avoid ")
    .replace(/\bpowerful\b/gi, "high-force")
    .replace(/\bheavy\b/gi, "high-weight")
    .replace(/\bclean\b/gi, "controlled")
    .replace(/\bcrunchy\b/gi, "brittle-texture")
    .replace(/\bairy\b/gi, "broadband-air")
    .replace(/\bsatisfying\b/gi, "full-event")
    .replace(/\s{2,}/g, " ");

const inferStructuredSoundIntensity = (value: string) => {
  const normalized = value.toLowerCase();
  if (/\b(heavy|heavier|hard|harder|big|bigger|strong|stronger|brutal|massive|bass)\b/.test(normalized)) return "heavy";
  if (/\b(soft|softer|light|subtle|quiet|gentle)\b/.test(normalized)) return "soft";
  return "medium";
};

const inferStructuredSoundAttack = (value: string) => {
  const normalized = value.toLowerCase();
  if (/\b(sharp|sharper|snap|snappy|crack|edge|attack|brittle)\b/.test(normalized)) return "high";
  if (/\b(soft|softer|rounded|muted|smooth)\b/.test(normalized)) return "low";
  return "medium";
};

const inferStructuredSoundDecay = (value: string) => {
  const normalized = value.toLowerCase();
  if (/\b(short|shorter|tight|quick|fast|compact)\b/.test(normalized)) return "short";
  if (/\b(long|longer|tail|linger|roll|extended|recede)\b/.test(normalized)) return "long";
  return "medium";
};

const buildStrictStructuredSoundCommand = (option: GenerateSoundStructuredResponse["soundOptions"][number]) => {
  const source = [option.title, option.description, option.timingFeel, option.intensityFeel].join(" ");
  const family = inferStructuredSoundFamily(source);
  const shape = getStructuredSoundShape(family ?? "generic");
  const layers =
    normalizeStructuredSoundDirectiveText(option.description).split("|")[0].trim() || `${shape.start} -> ${shape.peak} -> ${shape.aftermath}`;
  const trigger = normalizeStructuredSoundDirectiveText(option.timingFeel).replace(/^trigger\s+/i, "").trim() || "key animation beat";
  return [
    "define sound event ->",
    `type=${shape.label};`,
    `trigger=${trigger};`,
    `timing=${shape.start} -> ${shape.peak} -> ${shape.aftermath};`,
    `attack=${inferStructuredSoundAttack(source)};`,
    `intensity=${inferStructuredSoundIntensity(source)};`,
    `texture=${shape.texture};`,
    `decay=${inferStructuredSoundDecay(source)};`,
    `layers=${layers};`,
    `preserve=${shape.label};`,
  ].join(" ");
};

const rewriteStructuredSoundDescription = (option: GenerateSoundStructuredResponse["soundOptions"][number]) => {
  return buildStrictStructuredSoundCommand(option);
};

const rewriteStructuredSoundTitle = (option: GenerateSoundStructuredResponse["soundOptions"][number]) => {
  const family = inferStructuredSoundFamily([option.title, option.description, option.timingFeel, option.intensityFeel].join(" "));
  const shape = getStructuredSoundShape(family ?? "generic");
  const profile = inferStructuredSoundIntensity([option.title, option.description, option.intensityFeel].join(" "));
  return `type=${shape.label}; profile=${profile};`;
};

const rewriteStructuredSoundTiming = (value: string) => {
  const normalized = normalizeStructuredSoundDirectiveText(value);
  return `trigger=${normalized.replace(/^trigger\s+/i, "").trim()};`;
};

const rewriteStructuredSoundParams = (option: GenerateSoundStructuredResponse["soundOptions"][number]) => {
  const family = inferStructuredSoundFamily([option.title, option.description, option.timingFeel, option.intensityFeel].join(" "));
  const shape = getStructuredSoundShape(family ?? "generic");
  const source = [option.description, option.intensityFeel].join(" ");
  const normalized = normalizeStructuredSoundDirectiveText(option.intensityFeel);
  const parts = [
    `attack=${inferStructuredSoundAttack(source)};`,
    `preserve=${shape.label};`,
    normalized.length > 0 ? `modify=${normalized};` : null,
  ].filter((value): value is string => Boolean(value));

  return parts.join(" ");
};

const normalizeStructuredSoundOptions = (soundOptions: GenerateSoundStructuredResponse["soundOptions"]): DrawingAiSoundOption[] =>
  soundOptions
    .map((option, index) => ({
      id: slugifyDrawingAiOptionId(option.title, index),
      title: rewriteStructuredSoundTitle(option),
      description: rewriteStructuredSoundDescription(option),
      timingFeel: rewriteStructuredSoundTiming(option.timingFeel),
      intensityFeel: rewriteStructuredSoundParams(option),
      contentType: "sfx" as const,
      speechText: null,
      soundFamily: inferStructuredSoundFamily([option.title, option.description, option.timingFeel, option.intensityFeel].join(" ")),
    }))
    .filter((option) => option.title.length > 0 && option.description.length > 0)
    .slice(0, 4);

const normalizeGenerateSoundStructuredObject = (
  value: Partial<GenerateSoundStructuredResponse>,
  optionCount: number,
  recoveryMode: "valid" | "repaired",
  warning: string | null = null,
): GenerateSoundStructuredRuntimeResponse | null => {
  const soundOptions = normalizeStructuredSoundOptions(value.soundOptions ?? []).slice(0, optionCount);
  const decision = value.decision === "question" ? "question" : soundOptions.length > 0 ? "result" : "result";
  const response =
    decision === "question"
      ? ""
      : soundOptions[0]?.description ?? "";
  const question = typeof value.question === "string" ? value.question.trim() : "";
  const options = sanitizeStructuredOptions(value.options ?? []);

  if (decision === "question" && question.length === 0 && options.length === 0) {
    return null;
  }

  if (decision === "result" && soundOptions.length === 0 && response.length === 0) {
    return null;
  }

  return {
    decision,
    response,
    question,
    options,
    soundOptions,
    recoveryMode,
    warnings: warning ? [warning] : [],
  };
};

const extractLikelyJsonObject = (raw: string) => {
  const fencedMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fencedMatch?.[1] ?? raw;
  const firstBrace = candidate.indexOf("{");
  const lastBrace = candidate.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return candidate.slice(firstBrace, lastBrace + 1);
  }
  return candidate.trim();
};

const tryParseLooseJsonObject = (raw: string): Record<string, unknown> | null => {
  const candidate = extractLikelyJsonObject(raw);
  if (!candidate) {
    return null;
  }

  const attempts = [
    candidate,
    candidate.replace(/,\s*([}\]])/g, "$1"),
    candidate.replace(/[“”]/g, '"').replace(/[’]/g, "'").replace(/,\s*([}\]])/g, "$1"),
  ];

  for (const attempt of attempts) {
    try {
      const parsed = JSON.parse(attempt);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {}
  }

  return null;
};

const extractLooseStringField = (raw: string, key: string) => {
  const pattern = new RegExp(`"${key}"\\s*:\\s*"([\\s\\S]*?)(?<!\\\\)"`, "i");
  const match = raw.match(pattern);
  if (!match?.[1]) {
    return "";
  }

  return match[1]
    .replace(/\\"/g, '"')
    .replace(/\\n/g, "\n")
    .replace(/\\t/g, "\t")
    .trim();
};

const extractLooseStringArrayField = (raw: string, key: string) => {
  const pattern = new RegExp(`"${key}"\\s*:\\s*\\[([\\s\\S]*?)\\]`, "i");
  const match = raw.match(pattern);
  if (!match?.[1]) {
    return [];
  }

  return Array.from(match[1].matchAll(/"([^"]+)"/g))
    .map((entry) => entry[1]?.trim() ?? "")
    .filter((entry) => entry.length > 0)
    .slice(0, 4);
};

const extractLooseSoundOptions = (raw: string): GenerateSoundStructuredResponse["soundOptions"] => {
  const arrayPattern = /"soundOptions"\s*:\s*\[([\s\S]*?)\](?:\s*,|\s*})/i;
  const arrayBody = raw.match(arrayPattern)?.[1] ?? raw;
  const optionObjects = Array.from(arrayBody.matchAll(/\{[\s\S]*?"title"\s*:\s*"[\s\S]*?"description"\s*:\s*"[\s\S]*?"[\s\S]*?\}/g));

  return optionObjects
    .map((entry) => {
      const source = entry[0];
      const title = extractLooseStringField(source, "title");
      const description = extractLooseStringField(source, "description");
      const timingFeel = extractLooseStringField(source, "timingFeel");
      const intensityFeel = extractLooseStringField(source, "intensityFeel");
      return {
        title,
        description,
        timingFeel,
        intensityFeel,
      };
    })
    .filter((option) => option.title.length > 0 && option.description.length > 0)
    .slice(0, 4);
};

const extractLooseFrameDrafts = (raw: string): GenerateFramesStructuredResponse["frames"] => {
  const arrayPattern = /"frames"\s*:\s*\[([\s\S]*?)\](?:\s*,|\s*})/i;
  const arrayBody = raw.match(arrayPattern)?.[1] ?? raw;
  const frameObjects = Array.from(arrayBody.matchAll(/\{[\s\S]*?"pose"\s*:\s*"[\s\S]*?"description"\s*:\s*"[\s\S]*?"[\s\S]*?\}/g));

  return frameObjects
    .map((entry) => {
      const source = entry[0];
      const pose = extractLooseStringField(source, "pose");
      const description = extractLooseStringField(source, "description");
      return {
        pose,
        description,
      };
    })
    .filter((frame) => frame.pose.length > 0 || frame.description.length > 0)
    .slice(0, MAX_FRAMES_PER_REQUEST);
};

const repairGenerateFramesStructuredResponse = ({
  rawOutputPreview,
  requestedFrameCount,
}: {
  rawOutputPreview: string;
  requestedFrameCount: number;
}): GenerateFramesStructuredResponse | null => {
  const parsedObject = tryParseLooseJsonObject(rawOutputPreview);
  if (parsedObject) {
    const repaired = normalizeGenerateFramesStructuredObject(
      {
        decision:
          parsedObject.decision === "question"
            ? "question"
            : parsedObject.decision === "no-plan"
              ? "no-plan"
              : "result",
        question: typeof parsedObject.question === "string" ? parsedObject.question : "",
        options: Array.isArray(parsedObject.options)
          ? parsedObject.options.filter((value): value is string => typeof value === "string")
          : [],
        frames: Array.isArray(parsedObject.frames)
          ? parsedObject.frames
              .filter((entry): entry is GenerateFramesStructuredResponse["frames"][number] => typeof entry === "object" && entry !== null)
              .map((entry) => ({
                pose: typeof entry.pose === "string" ? entry.pose : "",
                description: typeof entry.description === "string" ? entry.description : "",
              }))
          : [],
      },
      requestedFrameCount,
    );

    if (repaired) {
      return repaired;
    }
  }

  return normalizeGenerateFramesStructuredObject(
    {
      decision:
        extractLooseStringField(rawOutputPreview, "decision") === "question"
          ? "question"
          : extractLooseStringField(rawOutputPreview, "decision") === "no-plan"
            ? "no-plan"
            : "result",
      question: extractLooseStringField(rawOutputPreview, "question"),
      options: extractLooseStringArrayField(rawOutputPreview, "options"),
      frames: extractLooseFrameDrafts(rawOutputPreview),
    },
    requestedFrameCount,
  );
};

const repairGenerateSoundStructuredResponse = ({
  rawOutputPreview,
  optionCount,
}: {
  rawOutputPreview: string;
  optionCount: number;
}): GenerateSoundStructuredRuntimeResponse | null => {
  const parsedObject = tryParseLooseJsonObject(rawOutputPreview);
  if (parsedObject) {
    const repaired = normalizeGenerateSoundStructuredObject(
      {
        decision: parsedObject.decision === "question" ? "question" : "result",
        response: typeof parsedObject.response === "string" ? parsedObject.response : "",
        question: typeof parsedObject.question === "string" ? parsedObject.question : "",
        options: Array.isArray(parsedObject.options) ? parsedObject.options.filter((value): value is string => typeof value === "string") : [],
        soundOptions: Array.isArray(parsedObject.soundOptions)
          ? parsedObject.soundOptions
              .filter((entry): entry is GenerateSoundStructuredResponse["soundOptions"][number] => typeof entry === "object" && entry !== null)
              .map((entry) => ({
                title: typeof entry.title === "string" ? entry.title : "",
                description: typeof entry.description === "string" ? entry.description : "",
                timingFeel: typeof entry.timingFeel === "string" ? entry.timingFeel : "",
                intensityFeel: typeof entry.intensityFeel === "string" ? entry.intensityFeel : "",
              }))
          : [],
      },
      optionCount,
      "repaired",
      "Generate Sounds structured output was repaired from partial model output.",
    );
    if (repaired) {
      return repaired;
    }
  }

  return normalizeGenerateSoundStructuredObject(
    {
      decision: extractLooseStringField(rawOutputPreview, "decision") === "question" ? "question" : "result",
      response: extractLooseStringField(rawOutputPreview, "response"),
      question: extractLooseStringField(rawOutputPreview, "question"),
      options: extractLooseStringArrayField(rawOutputPreview, "options"),
      soundOptions: extractLooseSoundOptions(rawOutputPreview),
    },
    optionCount,
    "repaired",
    "Generate Sounds structured output was repaired from partial model output.",
  );
};

const resolveRequestedGenerateSoundOptionCount = () => 1;

const GENERATE_FRAMES_DEFAULT_MODEL = AI_TEXT_ECONOMY_MODEL;
const GENERATE_FRAMES_MEDIUM_MODEL = AI_TEXT_BALANCED_MODEL;
const GENERATE_FRAMES_STRONG_MODEL = AI_TEXT_MODEL;
const GENERATE_FRAMES_MODEL_SEQUENCE = [
  GENERATE_FRAMES_DEFAULT_MODEL,
  GENERATE_FRAMES_MEDIUM_MODEL,
  GENERATE_FRAMES_STRONG_MODEL,
] as const;

const resolveGenerateFramesRecoveryModelFloor = ({
  preferredModel,
  minimumModel,
}: {
  preferredModel: string;
  minimumModel?: string;
}) => {
  const preferredModelIndex = GENERATE_FRAMES_MODEL_SEQUENCE.indexOf(
    preferredModel as (typeof GENERATE_FRAMES_MODEL_SEQUENCE)[number],
  );
  const minimumModelIndex = minimumModel
    ? GENERATE_FRAMES_MODEL_SEQUENCE.indexOf(minimumModel as (typeof GENERATE_FRAMES_MODEL_SEQUENCE)[number])
    : -1;

  if (minimumModelIndex < 0) {
    return preferredModel;
  }

  if (preferredModelIndex < 0 || preferredModelIndex < minimumModelIndex) {
    return GENERATE_FRAMES_MODEL_SEQUENCE[minimumModelIndex];
  }

  return preferredModel;
};
export type GenerateFramesComplexityTier = "low" | "medium" | "high";

const doesGenerateFramesQualityPressureNeedStrongerModel = ({
  userMessage,
  runtimeAnalysis,
  requestedFrameCount,
  requestKind,
}: {
  userMessage: string;
  runtimeAnalysis?: GenerateFramesRuntimeAnalysis;
  requestedFrameCount: number;
  requestKind: ReturnType<typeof inferDrawingAiFrameRequestKind>;
}) => {
  const qualityPressure =
    /\b(smooth|cinematic|complex|choreograph|violent|detailed|polish|dynamic|full ending|continuity|recognizable|correct|accurate|proper(?: effect)? layering|high quality|more readable|more believable)\b/i.test(
      userMessage,
    );

  if (!qualityPressure) {
    return false;
  }

  const subjectCount =
    runtimeAnalysis?.subjects.filter((subject) => subject.type === "character" || subject.type === "object").length ?? 0;
  const actionCount = new Set(runtimeAnalysis?.actionKeywords ?? []).size;
  const componentCount = new Set(runtimeAnalysis?.componentFamilies ?? []).size;
  const sceneComplexity =
    (runtimeAnalysis?.sceneSetting ? 1 : 0) +
    (runtimeAnalysis?.sceneDescriptors.length ?? 0) +
    (runtimeAnalysis?.sceneProps.length ?? 0) +
    (runtimeAnalysis?.sceneElements.length ?? 0);
  const animatedRequest = requestKind !== "single-frame" || runtimeAnalysis?.outputMode === "animation";
  const effectComplexity =
    runtimeAnalysis?.primaryFamily === "effect" ||
    runtimeAnalysis?.componentFamilies.includes("effect") ||
    ["lightning", "explosion", "shockwave", "smoke", "eruption", "impact"].includes(runtimeAnalysis?.motionType ?? "");
  const cameraMotionDemand =
    animatedRequest &&
    (
      runtimeAnalysis?.motionType === "background-scroll" ||
      /\b(camera (?:movement|moving|move|follow)|moving background|background move(?:ment)?|parallax|scroll(?:ing)? background)\b/i.test(
        userMessage,
      )
    );
  const stagedSequenceDemand =
    animatedRequest &&
    /\b(combo|multi-step|right hand|left hand|airborne|midair|mid-air|martial arts guard stance|guard stance)\b|->|→|\bthen\b|\bafter that\b|\bfollowed by\b|\bending in\b|\bending with\b|\bends in\b|\bends with\b/i.test(
      userMessage,
    );

  return (
    cameraMotionDemand ||
    stagedSequenceDemand ||
    subjectCount >= 2 ||
    actionCount >= 2 ||
    componentCount >= 2 ||
    sceneComplexity >= 2 ||
    requestedFrameCount >= 12 ||
    runtimeAnalysis?.shapeConfidence === "needs-reference" ||
    runtimeAnalysis?.expectationCoverage === "needs-reference" ||
    runtimeAnalysis?.humanExpectationRisk === "high" ||
    (runtimeAnalysis?.projectScope === "same-project" && runtimeAnalysis?.shotScope === "new-shot-same-project") ||
    (effectComplexity && sceneComplexity >= 1)
  );
};

const buildGenerateFramesModelSelectionJustification = ({
  userMessage,
  runtimeAnalysis,
}: {
  userMessage: string;
  runtimeAnalysis?: GenerateFramesRuntimeAnalysis;
}) => {
  const justification: string[] = [];
  const visibleSubjectCount =
    runtimeAnalysis?.subjects.filter((subject) => subject.type === "character" || subject.type === "object").length ?? 0;
  const sceneComplexity =
    (runtimeAnalysis?.sceneSetting ? 1 : 0) +
    (runtimeAnalysis?.sceneProps.length ?? 0) +
    (runtimeAnalysis?.sceneElements.length ?? 0);

  if (
    (runtimeAnalysis?.orderedBeats.length ?? 0) >= 3 ||
    (runtimeAnalysis?.sequenceBeats.length ?? 0) >= 5 ||
    /\b(combo|multi-step|right hand|left hand|airborne|midair|mid-air|then|after that|followed by|ending in|ends with)\b|->|→/i.test(
      userMessage,
    )
  ) {
    justification.push("higher-sequence-complexity");
  }

  if (
    runtimeAnalysis?.searchConfidence.style === "low" ||
    (runtimeAnalysis?.executionGuidance.stylePrinciples?.length ?? 0) > 0
  ) {
    justification.push("higher-style-grounding-need");
  }

  if (
    runtimeAnalysis?.projectScope === "same-project" &&
    runtimeAnalysis?.shotScope !== "create-first-shot" &&
    (
      visibleSubjectCount >= 2 ||
      sceneComplexity >= 2 ||
      (runtimeAnalysis?.focusTargets.length ?? 0) > 0 ||
      runtimeAnalysis?.shotScope === "new-shot-same-project"
    )
  ) {
    justification.push("higher-continuity-risk");
  }

  if (
    justification.length === 0 &&
    doesGenerateFramesQualityPressureNeedStrongerModel({
      userMessage,
      runtimeAnalysis,
      requestedFrameCount: runtimeAnalysis?.requestedFrameCount ?? resolveRequestedFrameCount(userMessage),
      requestKind: runtimeAnalysis?.requestKind ?? inferDrawingAiFrameRequestKind(userMessage),
    })
  ) {
    justification.push("higher-quality-pressure");
  }

  return justification;
};

const resolveGenerateFramesModelEscalationReason = ({
  selectionJustification,
  escalationAssessmentReason,
  recoveryDriven = false,
}: {
  selectionJustification: string[];
  escalationAssessmentReason?: string | null;
  recoveryDriven?: boolean;
}) => {
  if (recoveryDriven) {
    return "repeated-failure-to-clear-quality-floor-at-lower-tier";
  }

  if (selectionJustification.includes("higher-sequence-complexity")) {
    return "higher-sequence-complexity";
  }

  if (selectionJustification.includes("higher-style-grounding-need")) {
    return "higher-style-grounding-need";
  }

  if (selectionJustification.includes("higher-continuity-risk")) {
    return "higher-continuity-risk";
  }

  if (selectionJustification.includes("higher-quality-pressure")) {
    return "repeated-failure-to-clear-quality-floor-at-lower-tier";
  }

  if (typeof escalationAssessmentReason === "string" && escalationAssessmentReason.trim().length > 0) {
    return "repeated-failure-to-clear-quality-floor-at-lower-tier";
  }

  return "repeated-failure-to-clear-quality-floor-at-lower-tier";
};

export const assessGenerateFramesModelComplexity = ({
  userMessage,
  runtimeAnalysis,
  requestedFrameCount,
  requestKind,
}: {
  userMessage: string;
  runtimeAnalysis?: GenerateFramesRuntimeAnalysis;
  requestedFrameCount: number;
  requestKind: ReturnType<typeof inferDrawingAiFrameRequestKind>;
}) => {
  const complexitySignals: string[] = [];
  let score = 0;
  const subjectCount =
    runtimeAnalysis?.subjects.filter((subject) => subject.type === "character" || subject.type === "object").length ?? 0;
  const actionCount = new Set(runtimeAnalysis?.actionKeywords ?? []).size;
  const componentCount = new Set(runtimeAnalysis?.componentFamilies ?? []).size;
  const sceneComplexity =
    (runtimeAnalysis?.sceneSetting ? 1 : 0) +
    (runtimeAnalysis?.sceneDescriptors.length ?? 0) +
    (runtimeAnalysis?.sceneProps.length ?? 0) +
    (runtimeAnalysis?.sceneElements.length ?? 0);
  const effectComplexity =
    runtimeAnalysis?.primaryFamily === "effect" ||
    runtimeAnalysis?.componentFamilies.includes("effect") ||
    ["lightning", "explosion", "shockwave", "smoke", "eruption", "impact"].includes(runtimeAnalysis?.motionType ?? "");
  const animatedRequest = requestKind !== "single-frame" || runtimeAnalysis?.outputMode === "animation";
  const multiActorAction = subjectCount >= 2 && animatedRequest;
  const cameraMotionDemand =
    animatedRequest &&
    (
      runtimeAnalysis?.motionType === "background-scroll" ||
      /\b(camera (?:movement|moving|move|follow)|moving background|background move(?:ment)?|parallax|scroll(?:ing)? background)\b/i.test(
        userMessage,
      )
    );
  const backdropDemand = /\b(background|backdrop|scene|camera|parallax|full[- ]screen|full screen)\b/i.test(userMessage);
  const qualityPressure =
    /\b(smooth|cinematic|complex|choreograph|violent|detailed|polish|dynamic|full ending|continuity|recognizable|correct|accurate|proper(?: effect)? layering)\b/i.test(userMessage);
  const qualityPressureNeedsStrongerModel = doesGenerateFramesQualityPressureNeedStrongerModel({
    userMessage,
    runtimeAnalysis,
    requestedFrameCount,
    requestKind,
  });
  const premiumFinishPressure =
    /\b(cinematic|detailed|polish|high quality|full ending|continuity|recognizable|correct|accurate|proper(?: effect)? layering|more readable|more believable)\b/i.test(
      userMessage,
    );
  const stagedSequenceDemand =
    /\b(combo|multi-step|right hand|left hand|airborne|midair|mid-air|martial arts guard stance|guard stance)\b|->|→|\bthen\b|\bafter that\b|\bfollowed by\b|\bending in\b|\bending with\b|\bends in\b|\bends with\b/i.test(
      userMessage,
    ) &&
    animatedRequest;
  const densePrompt = userMessage.trim().length > 140 || /,/.test(userMessage);
  const sameWorldCreateContext =
    runtimeAnalysis?.interactionMode === "create" &&
    /\b(for (?:this|the current|the same)\s+(?:attack|move|combo|scene|shot|animation|sequence|project|world)|in (?:this|the current|the same)\s+(?:scene|shot|animation|sequence|project|world)|combine(?: it)? later|use(?: it)? later|separate asset|new projectile|new effect)\b/i.test(
      userMessage,
    );
  const expectationCoverageRisk = runtimeAnalysis?.expectationCoverage === "needs-reference";
  const shapeConfidenceRisk = runtimeAnalysis?.shapeConfidence === "needs-reference";
  const searchGroundingRisk = expectationCoverageRisk || shapeConfidenceRisk;
  const strictEffectPurity = runtimeAnalysis?.subjectPurityMode === "strict-effect-only";
  const completionSensitive =
    runtimeAnalysis?.expectedCompletionProfile != null &&
    !["none", "generic-action-complete", "walk-cycle", "run-cycle"].includes(runtimeAnalysis.expectedCompletionProfile);
  const humanExpectationRisk = runtimeAnalysis?.humanExpectationRisk === "high";
  const orderedBeatComplexity = (runtimeAnalysis?.orderedBeats.length ?? 0) >= 3;
  const nonNeutralTone = runtimeAnalysis?.tone != null && runtimeAnalysis.tone !== "neutral";
  const extremeChoreographyDemand = stagedSequenceDemand || orderedBeatComplexity;
  const layeredCoordinationDemand =
    (effectComplexity && backdropDemand && subjectCount >= 1) ||
    (multiActorAction && sceneComplexity >= 2);
  const hardInteractionDemand =
    multiActorAction &&
    (
      actionCount >= 2 ||
      runtimeAnalysis?.motionType === "fight" ||
      qualityPressure ||
      sceneComplexity >= 2 ||
      requestedFrameCount >= 8
    );
  const prolongedDemand =
    requestedFrameCount >= 12 &&
    (
      hardInteractionDemand ||
      layeredCoordinationDemand ||
      (cameraMotionDemand && sceneComplexity >= 2 && qualityPressure) ||
      (effectComplexity && backdropDemand && subjectCount >= 1)
    );
  const simpleContinuationReuse =
    (runtimeAnalysis?.interactionMode === "continue" ||
      (runtimeAnalysis?.interactionMode === "tweak" &&
        runtimeAnalysis.editIntents.every((intent) =>
          ["color", "scale", "timing", "tone", "scene", "motion", "transform", "prop"].includes(intent),
        ))) &&
    !premiumFinishPressure &&
    subjectCount <= 2 &&
    actionCount <= 1 &&
    componentCount <= 2 &&
    sceneComplexity <= 2 &&
    requestedFrameCount <= 6 &&
    !cameraMotionDemand &&
    !expectationCoverageRisk &&
    !shapeConfidenceRisk &&
    !orderedBeatComplexity &&
    !(effectComplexity && /\b(cinematic|full ending|complex|proper(?: effect)? layering)\b/i.test(userMessage));

  if (subjectCount >= 2) {
    score += 2;
    complexitySignals.push("multiple-subjects");
  }
  if (actionCount >= 2) {
    score += 2;
    complexitySignals.push("multi-action");
  } else if (actionCount === 1 && requestKind !== "single-frame") {
    score += 1;
    complexitySignals.push("animated-action");
  }
  if (componentCount >= 2) {
    score += 2;
    complexitySignals.push("mixed-components");
  }
  if (sceneComplexity >= 3) {
    score += sceneComplexity >= 5 ? 2 : 1;
    complexitySignals.push("scene-density");
  }
  if (effectComplexity) {
    score += componentCount >= 2 ? 2 : 1;
    complexitySignals.push("effect-timing");
  }
  if (cameraMotionDemand) {
    score += 2;
    complexitySignals.push("camera-motion");
  }
  if (effectComplexity && animatedRequest && backdropDemand) {
    score += 2;
    complexitySignals.push("effect-backdrop");
  }
  if (stagedSequenceDemand) {
    score += 3;
    complexitySignals.push("staged-sequence");
  }
  if (animatedRequest) {
    score += 1;
    complexitySignals.push("animation-sequence");
  }
  if (requestedFrameCount >= 16) {
    score += 3;
    complexitySignals.push("long-sequence");
  } else if (requestedFrameCount >= 12) {
    score += 2;
    complexitySignals.push("long-sequence");
  } else if (requestedFrameCount >= 8) {
    score += 1;
    complexitySignals.push("extended-sequence");
  }
  if (runtimeAnalysis?.interactionMode === "continue" || runtimeAnalysis?.interactionMode === "tweak") {
    if (simpleContinuationReuse) {
      score = Math.max(0, score - (subjectCount >= 2 || componentCount >= 2 || sceneComplexity >= 1 ? 3 : 1));
      complexitySignals.push(subjectCount >= 2 ? "paired-continuation-reuse" : "continuation-reuse");
    } else {
      score += sceneComplexity >= 2 || componentCount >= 2 ? 2 : 1;
      complexitySignals.push("continuation-complexity");
    }
  }
  if (sameWorldCreateContext) {
    score += qualityPressure || effectComplexity || actionCount >= 2 ? 2 : 1;
    complexitySignals.push("same-world-create");
  }
  if (expectationCoverageRisk) {
    score += 2;
    complexitySignals.push("needs-reference-coverage");
  }
  if (shapeConfidenceRisk) {
    score += 2;
    complexitySignals.push("shape-confidence-risk");
  }
  if (strictEffectPurity) {
    score += 1;
    complexitySignals.push("strict-effect-purity");
  }
  if (completionSensitive && animatedRequest) {
    score += 1;
    complexitySignals.push("completion-sensitive");
  }
  if (orderedBeatComplexity) {
    score += 2;
    complexitySignals.push("ordered-beats");
  }
  if (humanExpectationRisk) {
    score += 2;
    complexitySignals.push("human-expectation-risk");
  }
  if (nonNeutralTone && animatedRequest) {
    score += 1;
    complexitySignals.push("tone-sensitive-motion");
  }
  if (qualityPressureNeedsStrongerModel) {
    score += 2;
    complexitySignals.push("quality-pressure");
  } else if (densePrompt) {
    score += 1;
    complexitySignals.push("constraint-density");
  }

  const clearlySimpleRequest =
    subjectCount <= 1 &&
    actionCount <= 1 &&
    componentCount <= 1 &&
    sceneComplexity <= 1 &&
    !effectComplexity &&
    !sameWorldCreateContext &&
    requestedFrameCount <= 10 &&
    !qualityPressureNeedsStrongerModel &&
    (!animatedRequest || requestedFrameCount <= 10) &&
    runtimeAnalysis?.interactionMode !== "continue" &&
    !expectationCoverageRisk &&
    !shapeConfidenceRisk &&
    !strictEffectPurity &&
    !completionSensitive &&
    !orderedBeatComplexity &&
    !humanExpectationRisk;
  const simpleAnimatedLocalCandidate =
    animatedRequest &&
    runtimeAnalysis?.interactionMode === "create" &&
    subjectCount <= 1 &&
    actionCount <= 1 &&
    componentCount <= 1 &&
    sceneComplexity === 0 &&
    !effectComplexity &&
    !cameraMotionDemand &&
    !qualityPressureNeedsStrongerModel &&
    !searchGroundingRisk &&
    !strictEffectPurity &&
    !completionSensitive &&
    !orderedBeatComplexity &&
    !humanExpectationRisk &&
    !nonNeutralTone &&
    requestedFrameCount <= 10;
  const simpleTwoActorCombatCandidate =
    animatedRequest &&
    runtimeAnalysis?.interactionMode === "create" &&
    subjectCount === 2 &&
    actionCount <= 1 &&
    componentCount <= 1 &&
    sceneComplexity <= 1 &&
    !effectComplexity &&
    !cameraMotionDemand &&
    !qualityPressureNeedsStrongerModel &&
    !searchGroundingRisk &&
    !strictEffectPurity &&
    !orderedBeatComplexity &&
    !humanExpectationRisk &&
    !nonNeutralTone &&
    !sameWorldCreateContext &&
    (runtimeAnalysis?.motionType === "fight" ||
      runtimeAnalysis?.motionType === "punch" ||
      runtimeAnalysis?.motionType === "kick" ||
      /\b(punch|kick|fight|fighting|spar|sparring|guard stance|guard)\b/i.test(userMessage));
  const clearlyExtremeRequest =
    !simpleTwoActorCombatCandidate &&
    (
      extremeChoreographyDemand ||
      hardInteractionDemand ||
      layeredCoordinationDemand ||
      (effectComplexity && multiActorAction) ||
      prolongedDemand ||
      (
        searchGroundingRisk &&
        (extremeChoreographyDemand || hardInteractionDemand || layeredCoordinationDemand)
      ) ||
      (
        sameWorldCreateContext &&
        (extremeChoreographyDemand || hardInteractionDemand || layeredCoordinationDemand)
      )
    );

  const complexityTier: GenerateFramesComplexityTier =
    clearlyExtremeRequest
      ? "high"
      : clearlySimpleRequest || simpleContinuationReuse || simpleAnimatedLocalCandidate
        ? "low"
        : simpleTwoActorCombatCandidate
          ? "medium"
        : "medium";

  return {
    complexityTier,
    complexitySignals,
    initialModel:
      complexityTier === "high"
        ? GENERATE_FRAMES_STRONG_MODEL
        : complexityTier === "medium"
          ? GENERATE_FRAMES_MEDIUM_MODEL
          : GENERATE_FRAMES_DEFAULT_MODEL,
  };
};

const assessGenerateFramesStructuredEscalation = ({
  value,
  runtimeAnalysis,
  requestKind,
  requestedFrameCount,
}: {
  value: GenerateFramesStructuredResponse;
  runtimeAnalysis?: GenerateFramesRuntimeAnalysis;
  requestKind: ReturnType<typeof inferDrawingAiFrameRequestKind>;
  requestedFrameCount: number;
}) => {
  if (value.decision !== "result") {
    return {
      shouldEscalate: true,
      reason: value.decision === "question" ? "model-returned-question" : "model-returned-no-plan",
    };
  }

  const frames = clampFrameDraftsToRequest(value.frames ?? [], requestedFrameCount, "Generate Frames escalation assessment");
  const minimumExpectedFrames = requestKind === "single-frame" ? 1 : Math.min(3, Math.max(requestedFrameCount, 1));
  if (frames.length < minimumExpectedFrames) {
    return {
      shouldEscalate: true,
      reason: "too-few-frames",
    };
  }

  const normalizedFrames = frames.map((frame) => `${frame.pose} ${frame.description}`.toLowerCase());
  const firstFrame = normalizedFrames[0] ?? "";
  const endingWindow = normalizedFrames.slice(-Math.max(2, Math.ceil(normalizedFrames.length / 3))).join(" ");
  const lastFrame = normalizedFrames.at(-1) ?? "";
  const combinedFrames = normalizedFrames.join(" ");
  const middleWindow = normalizedFrames
    .slice(Math.max(1, Math.floor(normalizedFrames.length * 0.25)), Math.max(3, Math.ceil(normalizedFrames.length * 0.7)))
    .join(" ");
  const poseRoots = frames
    .map((frame) => frame.pose.trim().toLowerCase())
    .filter((pose) => pose.length > 0 && !pose.includes(" to "));
  const promptText = runtimeAnalysis?.prompt ?? "";
  const subjectLabelText = [
    runtimeAnalysis?.promptSubject ?? "",
    ...(runtimeAnalysis?.subjects.map((subject) => subject.label ?? "") ?? []),
  ]
    .join(" ")
    .toLowerCase();
  const hasSetupCue = /\b(setup|anticipation|wind[- ]?up|charge|crouch|ready|neutral|balanced|planted|takeoff)\b/.test(firstFrame);
  const hasEndingCue = /\b(recovery|recover|recoil|settle|balanced|reset|fade|vanish|collapse|disappear|residue|embers|haze|landing)\b/.test(endingWindow);
  const hasBackgroundScrollSetupCue =
    runtimeAnalysis?.motionType === "background-scroll" &&
    /\b(anchor(?:ed)?|center(?:ed)?|screen(?: |-)?space|screen position|fixed in frame|holds? position|same screen position|offset|scroll(?:ing)? start|wide environment|camera[- ]follow|environment moving)\b/.test(
      firstFrame,
    );
  const hasBackgroundScrollEndingCue =
    runtimeAnalysis?.motionType === "background-scroll" &&
    /\b(finish|ending offset|resolved?|settled?|complete(?:d)? move|final offset|scroll finish|ending position|slide(?:s|d|ing)? behind|shift(?:s|ed|ing)? behind|parallax|environment (?:continues )?(?:moving|scrolling|sliding|shifting)|background (?:continues )?(?:moving|scrolling|sliding|shifting))\b/.test(
      endingWindow,
    );
  const requiresFullArc =
    runtimeAnalysis?.outputMode === "animation" &&
    requestKind !== "continuation" &&
    runtimeAnalysis?.interactionMode !== "continue";

  const setupSatisfied = hasSetupCue || hasBackgroundScrollSetupCue;
  const endingSatisfied = hasEndingCue || hasBackgroundScrollEndingCue;

  if (requiresFullArc && (!setupSatisfied || !endingSatisfied)) {
    return {
      shouldEscalate: true,
      reason: !setupSatisfied ? "missing-setup-beat" : "missing-ending-beat",
    };
  }

  const stagedSequenceDemand =
    /\b(combo|multi-step|right hand|left hand|airborne|midair|mid-air|martial arts guard stance|guard stance)\b|->|→|\bthen\b|\bafter that\b|\bfollowed by\b|\bending in\b|\bending with\b|\bends in\b|\bends with\b/i.test(
      promptText,
    );
  if (stagedSequenceDemand) {
    if (/\bright hand\b/i.test(promptText) && !/\bright\b/.test(combinedFrames)) {
      return {
        shouldEscalate: true,
        reason: "missing-right-hand-beat",
      };
    }
    if (/\bleft hand\b/i.test(promptText) && !/\bleft\b/.test(combinedFrames)) {
      return {
        shouldEscalate: true,
        reason: "missing-left-hand-beat",
      };
    }
    if (/\bspin(?:ning)?\b/i.test(promptText) && !/\b(spin|turn|tornado)\b/.test(combinedFrames)) {
      return {
        shouldEscalate: true,
        reason: "missing-spin-beat",
      };
    }
    if (
      /\b(martial arts guard stance|guard stance|ready stance|landing|land)\b/i.test(promptText) &&
      !/\b(landing|land|guard|stance|recover|recovery|settle)\b/.test(endingWindow)
    ) {
      return {
        shouldEscalate: true,
        reason: "missing-guard-finish",
      };
    }
  }

  const requestedActorCount =
    runtimeAnalysis?.subjects.filter((subject) => subject.type === "character" || subject.type === "object").length ?? 0;
  if (
    requestedActorCount >= 2 &&
    !/\b(left|right|target|opponent|defender|attacker|other figure|second figure|both figures|two figures)\b/.test(combinedFrames)
  ) {
    return {
      shouldEscalate: true,
      reason: "missing-multi-actor-structure",
    };
  }

  if (
    runtimeAnalysis?.motionType === "lightning" &&
    (
      !/\b(fade|vanish|collapse|disappear|afterglow|ghost)\b/.test(endingWindow) ||
      !/\b(fade|vanish|collapse|disappear|afterglow|ghost)\b/.test(lastFrame)
    )
  ) {
    return { shouldEscalate: true, reason: "missing-lightning-ending" };
  }

  if (runtimeAnalysis?.motionType === "explosion") {
    if (/\b(pop|puff|firecracker|gunpowder|tiny burst|small burst|compact burst|spark burst)\b/.test(combinedFrames)) {
      return { shouldEscalate: true, reason: "weak-explosion-family" };
    }
    if (!/\b(expand|expansion|outward|spread|surge|rupture|blast|peak spread|wider|larger|violent)\b/.test(middleWindow)) {
      return { shouldEscalate: true, reason: "missing-explosion-scale" };
    }
    if (!/\b(breakup|break apart|fragment|debris|shards|fallout|outer shell|torn fire)\b/.test(combinedFrames)) {
      return { shouldEscalate: true, reason: "missing-explosion-breakup" };
    }
    if (!/\b(breakup|smoke|aftermath|disintegrat|fade|residue|embers|dust|fallout)\b/.test(endingWindow)) {
      return { shouldEscalate: true, reason: "missing-explosion-aftermath" };
    }
    if (
      /\b(peak|blast|burst|release|expanding|growing|surging)\b/.test(lastFrame) &&
      !/\b(smoke|aftermath|disintegrat|fade|residue|embers|dust|settle)\b/.test(lastFrame)
    ) {
      return { shouldEscalate: true, reason: "weak-explosion-ending" };
    }
  }

  if (runtimeAnalysis?.motionType === "smoke" && !/\b(dissipat|fade|thin|settle|haze)\b/.test(endingWindow)) {
    return { shouldEscalate: true, reason: "missing-smoke-dissipation" };
  }

  if (runtimeAnalysis?.subjectPurityMode === "strict-effect-only" && /\b(stick(?:\s|-)?figure|character|person|human|robot|fighter|arms?|legs?|torso|head)\b/.test(combinedFrames)) {
    return { shouldEscalate: true, reason: "effect-added-unrelated-subject" };
  }

  if (
    runtimeAnalysis?.subjectPurityMode === "strict-single-subject" &&
    /\b(another|second|opponent|defender|attacker|both figures?|two figures?)\b/.test(combinedFrames)
  ) {
    return { shouldEscalate: true, reason: "single-subject-added-extra-actor" };
  }

  if (
    runtimeAnalysis?.visualExpectationTags.includes("no-face-unless-asked") &&
    /\b(eyes?|mouth|eyebrows?|smile|grin|teeth|nose|facial)\b/.test(combinedFrames)
  ) {
    return { shouldEscalate: true, reason: "stick-figure-added-face" };
  }

  if (
    runtimeAnalysis?.expectedVisualClass === "still-object" &&
    /\b(scene|background|environment|composition|foreground|midground|depth)\b/.test(combinedFrames) &&
    !/\b(background|backdrop|scene|setting|environment|landscape)\b/.test(promptText)
  ) {
    return { shouldEscalate: true, reason: "wrong-visual-family" };
  }

  if (
    runtimeAnalysis?.expectedVisualClass === "still-object" &&
    /\b(run|walk|jump|punch|kick|explode|lightning|smoke|shockwave)\b/.test(combinedFrames)
  ) {
    return { shouldEscalate: true, reason: "wrong-visual-family" };
  }

  if (
    runtimeAnalysis?.expectedVisualClass === "event-animation" &&
    !/\b(explosion|blast|fireball|lightning|bolt|shockwave|smoke|dust|debris|flash|eruption|impact)\b/.test(combinedFrames)
  ) {
    return { shouldEscalate: true, reason: "wrong-visual-family" };
  }

  if (poseRoots.length >= 4 && new Set(poseRoots).size <= 2) {
    return { shouldEscalate: true, reason: "repeated-fallback-pattern" };
  }

  if (
    runtimeAnalysis?.orderedBeats.length &&
    runtimeAnalysis.orderedBeats.some((beat) => beat.includes("projectile")) &&
    !/\b(fireball|projectile|blast|orb)\b/.test(combinedFrames)
  ) {
    return { shouldEscalate: true, reason: "choreography-order-failure" };
  }

  if (
    runtimeAnalysis?.orderedBeats.length &&
    runtimeAnalysis.orderedBeats.includes("spin") &&
    !/\b(spin|turn|tornado)\b/.test(combinedFrames)
  ) {
    return { shouldEscalate: true, reason: "choreography-order-failure" };
  }

  if (
    runtimeAnalysis?.shapeConfidence === "needs-reference" &&
    runtimeAnalysis.visualExpectationTags.includes("recognizable-object") &&
    /\bthing|object|shape\b/.test(combinedFrames)
  ) {
    return { shouldEscalate: true, reason: "weak-appearance" };
  }

  if (/\btree\b/.test(subjectLabelText) && !/\b(trunk|canopy|branches?|leaves?|foliage)\b/.test(combinedFrames)) {
    return { shouldEscalate: true, reason: "weak-appearance" };
  }

  if (/\bfan|propeller\b/.test(subjectLabelText) && !/\b(hub|blades?|stand|cage|housing)\b/.test(combinedFrames)) {
    return { shouldEscalate: true, reason: "weak-appearance" };
  }

  if (/\bbox|crate|block|square|rectangle\b/.test(subjectLabelText) && !/\b(edges?|planes?|corners?|faces?|box[- ]like)\b/.test(combinedFrames)) {
    return { shouldEscalate: true, reason: "weak-appearance" };
  }

  if (/\brobot|android|mech\b/.test(subjectLabelText) && !/\b(mechanical|joint|panel|torso|limbs?|blocky)\b/.test(combinedFrames)) {
    return { shouldEscalate: true, reason: "weak-appearance" };
  }

  if (/\bstick(?:\s|-)?figure\b/.test(subjectLabelText) && !/\b(solid head|head|torso|arms?|legs?|limbs?|stick proportions?)\b/.test(combinedFrames)) {
    return { shouldEscalate: true, reason: "weak-appearance" };
  }

  if (
    runtimeAnalysis?.motionType === "punch" &&
    !/\b(torso|shoulder|hip|balance|guard|follow[- ]through|recovery)\b/.test(combinedFrames)
  ) {
    return { shouldEscalate: true, reason: "weak-motion-readability" };
  }

  if (
    runtimeAnalysis?.motionType === "kick" &&
    !/\b(hip|support|balance|chamber|leg|recovery|recoil)\b/.test(combinedFrames)
  ) {
    return { shouldEscalate: true, reason: "weak-motion-readability" };
  }

  if (
    (runtimeAnalysis?.motionType === "fight" ||
      (
        requestedActorCount >= 2 &&
        /\b(fight|fighting|punch|kick|strike|attack)\b/.test(promptText)
      )) &&
    !/\b(defender|target|opponent|recoil|recoils?|stagger|staggers?|stumble|stumbles?|flinch|flinches?|react|reacts?|snap(?:s|ping)? back)\b/.test(
      combinedFrames,
    )
  ) {
    return { shouldEscalate: true, reason: "weak-motion-readability" };
  }

  if (
    runtimeAnalysis?.humanExpectationRisk === "high" &&
    /\b(generic|thing|subject|event)\b/.test(combinedFrames)
  ) {
    return { shouldEscalate: true, reason: "human-expectation-failure" };
  }

  if (
    runtimeAnalysis?.actionKeywords.some((keyword) => ["punch", "kick", "jump", "walk", "run", "fight"].includes(keyword)) &&
    requiresFullArc &&
    !hasEndingCue
  ) {
    return { shouldEscalate: true, reason: "missing-action-recovery" };
  }

  return {
    shouldEscalate: false,
    reason: null,
  };
};

export const generateGenerateFramesStructuredResponse = async ({
  taskPrompt,
  systemInstructions,
  userMessage,
  runtimeAnalysis,
  reasoningEffort,
  maxOutputTokens = 820,
  recovery,
}: {
  taskPrompt: string;
  systemInstructions: string;
  userMessage: string;
  runtimeAnalysis?: GenerateFramesRuntimeAnalysis;
  reasoningEffort?: DrawingAiReasoningEffort;
  maxOutputTokens?: number;
  recovery?: GenerateFramesStructuredRecoveryConfig;
}) => {
  const requestedFrameCount = runtimeAnalysis?.requestedFrameCount ?? resolveRequestedFrameCount(userMessage);
  const requestKind = runtimeAnalysis?.requestKind ?? inferDrawingAiFrameRequestKind(userMessage);
  const frameCountBoost = requestedFrameCount > 6 ? (requestedFrameCount - 6) * 40 : 0;
  const orderedBeatBoost = (runtimeAnalysis?.orderedBeats.length ?? 0) >= 3 ? 140 : 0;
  const humanExpectationBoost =
    runtimeAnalysis?.humanExpectationRisk === "high"
      ? 140
      : runtimeAnalysis?.humanExpectationRisk === "medium"
        ? 60
        : 0;
  const shapeConfidenceBoost = runtimeAnalysis?.shapeConfidence === "needs-reference" ? 80 : 0;
  const multiActorBoost =
    (runtimeAnalysis?.subjects.filter((subject) => subject.type === "character" || subject.type === "object").length ?? 0) >= 2
      ? 80
      : 0;
  const effectiveMaxOutputTokens = Math.min(
    1400,
    Math.max(
      maxOutputTokens,
      820 + frameCountBoost + orderedBeatBoost + humanExpectationBoost + shapeConfidenceBoost + multiActorBoost,
    ),
  );
  const validatorFeedback = recovery?.validatorFeedback?.trim() ?? "";
  const recoveryAttemptLabel = recovery?.attemptLabel?.trim() ?? "";
  const failureCategory = recovery?.failureCategory?.trim() ?? "";
  const retryAxes = (recovery?.retryAxes ?? []).map((axis) => axis.trim()).filter((axis) => axis.length > 0);
  const preservedContext = (recovery?.preservedContext ?? [])
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
  const recoveryPromptBlock =
    validatorFeedback.length > 0
      ? [
          "The previous structured frame draft was rejected by runtime validation and must be repaired instead of abandoned.",
          `Rejected because: ${validatorFeedback}`,
          recoveryAttemptLabel.length > 0 ? `Recovery attempt label: ${recoveryAttemptLabel}` : null,
          failureCategory.length > 0 ? `Primary failure category: ${failureCategory}` : null,
          retryAxes.length > 0 ? `This retry must differ on these axes: ${retryAxes.join(", ")}` : null,
          preservedContext.length > 0 ? `Preserve these accepted anchors: ${preservedContext.join(", ")}` : null,
          "Preserve the same project, same current frame or sequence, same subjects, same side/color bindings, and same continuation context unless the user explicitly changes them.",
          "Repair the rejected weakness directly. Do not restart the scene, drop subjects, or swap the composition just because the prior draft was rejected.",
        ].join("\n\n")
      : null;
  const structuredPrompt = [
    taskPrompt,
    "Generate Frames runtime output must be engine-command data only.",
    "Return a JSON object that matches the schema exactly.",
    "Do not write assistant prose, markdown, lead-ins, explanations, or code fences outside the JSON object.",
    `This request has requestKind=${requestKind} and requestedFrameCount=${requestedFrameCount}.`,
    runtimeAnalysis?.noPlanReason
      ? `The runtime already identified a no-plan rule: ${runtimeAnalysis.noPlanReason}`
      : "No explicit no-plan rule is currently active.",
    recoveryPromptBlock,
    "Use decision=result only when you can defend the command steps from the prompt, subject focus, defaults, examples, continuity context, and any search grounding that was provided.",
    "Use decision=question only when one real blocker remains and it materially changes the result.",
    "When decision is question, ask exactly one question sentence and leave frames empty.",
    "If the only blocker is a missing continuation anchor, use decision=question and set question exactly to Continue from which frame or create new sequence?",
    "Use decision=no-plan when the request explicitly forbids the detected subject or is too underspecified to define safely without guessing.",
    `When decision is result, return exactly ${requestedFrameCount} command-step frame object${requestedFrameCount === 1 ? "" : "s"} in frames unless the request safely resolves to fewer because it is a strict continuation or a single-frame background edit.`,
    "Each frame object must contain only pose and description strings.",
    "Use pose as a short stage label only, such as setup, anticipation, action, impact, follow-through, recovery, or transition.",
    "Use description in this exact command format: action=<type>; durationFrames=<number>; intensity=<none|light|medium|heavy>; timing=<static|fast|normal|slow>; spacing=<none|tight|medium|wide>; command=<explicit execution instruction>;",
    "Use concrete action names when possible, such as pose, punch, kick, jump, explosion, lightning, breathe, walk, run, projectile, scroll, or impact.",
    "For still setup frames, use pose=setup and description=action=pose; durationFrames=1; intensity=none; timing=static; spacing=none; command=set pose and hold without transition;",
    "Keep description deterministic and executable. Do not write animation advice, scene narration, visual commentary, or quality judgments.",
    "Do not use soft words like readable, clean, nice, smooth, strong, good, feels, looks, or reads anywhere in pose or description.",
    "Never add a subject family the user did not request. Effect-only requests must stay effect-only; single-subject requests must not invent extra actors or props.",
    "Do not reuse generic fallback wording or vague placeholders when the requested subject or effect can be named directly.",
    "Treat the runtime analysis as a constraint contract: preserve subject purity, expected command family, and the required start-to-end completion profile.",
    "Training examples and prior patterns are guidance only. Never copy them literally or collapse a keyword into one fixed explosion, one fixed stick figure, one fixed lightning bolt, one fixed punch, or one fixed combo.",
    "Human expectation is the final acceptance gate: right category alone is not enough if the command chain still misses anticipation, action, impact, follow-through, recovery, or parameter control where the motion requires them.",
    "When the workspace already has a current frame or sequence and the prompt is a tweak, stay in the SAME sequence: preserve subject count, subject identity, colors, side placement, and scene continuity unless the prompt explicitly changes them.",
    "Bind edits to the referenced current subject only. Color, side, role, and relationship phrases like blue/red, left/right, attacker/defender, taller one, or guard stance should update the correct existing subject without restarting the scene.",
    "Before relying on search grounding, ask whether the runtime already understands the request. Common stick figures, punches, breathing, explosions, lightning, and basic scenes should usually be executed from local animator knowledge first.",
    "Preserve ordered beats, ownership, reaction, and stage progression when the runtime analysis or prompt describes a sequence or choreography.",
    "Translate every beat into an engine-readable command step instead of a loose note.",
    "Apply real action logic instead of category labels only: anticipation, impact timing, force control, follow-through, recovery, balance, and continuity all matter.",
    "Punches need wind-up, strike, impact, and recovery. Explosions need buildup, expansion, peak, breakup, and residue. Lightning needs a fast strike and quick vanish. Breathing needs subtle but visible rhythm.",
    "If the user says add, continue, or next, append new command steps to the current sequence instead of restarting.",
    "If the user says fix, change, or better, modify only the requested parameter or stage while preserving the rest of the command chain.",
    "Reject weak outputs: frozen halfway poses, random limb motion, low-force blast shapes, lingering active lightning, or breathing that collapses into generic idle bobbing.",
    "Prefer deterministic action logic and explicit execution instructions over vague generalities.",
    "Objects and props must stay recognizable rather than turning into messy blobs or generic placeholders.",
    "Effect add-ons should support the core action instead of replacing it: glow, blur, dust, smoke, and ghost trails should reinforce the main lightning or explosion beat and then resolve cleanly.",
    runtimeAnalysis?.motionType === "background-scroll"
      ? "For camera-follow or moving-background requests, keep the subject anchored in screen space while the environment scrolls behind them, and end on a final background offset command."
      : null,
    "Plain stick figures should default to a solid head, stable proportions, and no facial features unless the prompt explicitly asks for them.",
    "Background and effect additions should layer onto the existing composition without flattening or replacing the whole scene unless the prompt explicitly asks for a restart.",
    "Keep question empty unless decision is question. Keep options empty always.",
    "Do not invent assistant filler. Do not invent deterministic fallback language. Return runtime data only.",
  ]
    .filter((line): line is string => Boolean(line))
    .join("\n\n");

  const structuredInstructions = [
    systemInstructions,
    "For this structured Generate Frames call, return engine-command runtime data only and no assistant-style wording.",
  ].join("\n\n");
  const runStructuredAttempt = async ({
    model,
    strongerRetry = false,
  }: {
    model: string;
    strongerRetry?: boolean;
  }) => {
    const attemptReasoningEffort =
      model === GENERATE_FRAMES_MEDIUM_MODEL && reasoningEffort === "low" ? "medium" : reasoningEffort;
    const retryPromptSuffix = strongerRetry
      ? [
          "This is one stronger retry for a hard prompt because the previous structured output was weak or incomplete.",
          "Do not fall back to generic wording, placeholders, or no-plan unless the request is truly impossible to define safely.",
          "Be more concrete about recognizable shape, ordered beats, readable motion, and the ending state.",
          runtimeAnalysis?.motionType === "background-scroll"
            ? "For moving-background or camera-follow scenes, explicitly describe the anchored subject, the environment sliding behind them, and a final resolved background offset in the ending frames."
            : null,
          "For hard prompts, a specific complete result is preferred over a vague or underspecified one.",
        ]
            .filter((line): line is string => Boolean(line))
            .join("\n\n")
      : "";
    const attemptPrompt = retryPromptSuffix.length > 0 ? `${structuredPrompt}\n\n${retryPromptSuffix}` : structuredPrompt;
    const attemptMaxOutputTokens = strongerRetry ? Math.min(1700, effectiveMaxOutputTokens + 220) : effectiveMaxOutputTokens;
    const structuredObject = await generateAiObject<GenerateFramesStructuredResponse>({
      prompt: attemptPrompt,
      instructions: structuredInstructions,
      reasoningEffort: attemptReasoningEffort,
      maxOutputTokens: attemptMaxOutputTokens,
      schemaName: "generate_frames_structured_response",
      schema: GENERATE_FRAMES_STRUCTURED_SCHEMA,
      model,
      maxAttempts: 1,
    });
    return structuredObject.value;
  };

  const complexityAssessment = assessGenerateFramesModelComplexity({
    userMessage,
    runtimeAnalysis,
    requestedFrameCount,
    requestKind,
  });
  const selectionJustification = buildGenerateFramesModelSelectionJustification({
    userMessage,
    runtimeAnalysis,
  });

  const baseInitialModel = complexityAssessment.initialModel;
  const initialModel = resolveGenerateFramesRecoveryModelFloor({
    preferredModel: baseInitialModel,
    minimumModel: recovery?.minimumModel,
  });
  const selectedModel = initialModel;
  const fallbackModelUsed = initialModel !== baseInitialModel;
  const escalatedFromDefault = baseInitialModel === GENERATE_FRAMES_DEFAULT_MODEL && initialModel !== baseInitialModel;
  const escalatedTo: string | null = initialModel !== baseInitialModel ? initialModel : null;
  let escalationReason: string | null =
    initialModel !== baseInitialModel
      ? resolveGenerateFramesModelEscalationReason({
          selectionJustification,
          recoveryDriven: true,
        })
      : null;
  const strongerRetryRequested = recovery?.strongerRetryFirst === true;
  const structuredRetryUsed = strongerRetryRequested;
  const value = await runStructuredAttempt({
    model: selectedModel,
    strongerRetry: strongerRetryRequested,
  });
  const escalationAssessment = assessGenerateFramesStructuredEscalation({
    value,
    runtimeAnalysis,
    requestKind,
    requestedFrameCount,
  });
  if (!escalationReason && escalationAssessment.shouldEscalate && recovery != null) {
    escalationReason = resolveGenerateFramesModelEscalationReason({
      selectionJustification,
      escalationAssessmentReason: escalationAssessment.reason,
      recoveryDriven: validatorFeedback.length > 0,
    });
  }

  return {
    decision:
      value.decision === "question"
        ? "question"
        : value.decision === "no-plan"
          ? "no-plan"
          : "result",
    requestKind,
    requestedFrameCount,
    question: typeof value.question === "string" ? value.question.trim() : "",
    options: sanitizeStructuredOptions(value.options ?? []),
    frames:
      value.decision === "result"
        ? clampFrameDraftsToRequest(value.frames ?? [], requestedFrameCount, "Generate Frames structured response").map((frame) => ({
            pose: frame.pose.trim(),
            description: frame.description.trim(),
          }))
        : [],
    modelSelection: {
      defaultModel: GENERATE_FRAMES_DEFAULT_MODEL,
      initialModel,
      selectedModel,
      fallbackModelUsed,
      escalatedFromDefault,
      escalatedTo,
      escalationReason,
      complexityTier: complexityAssessment.complexityTier,
      complexitySignals: complexityAssessment.complexitySignals,
      selectionJustification,
      structuredRetryUsed,
    } satisfies GenerateFramesModelSelectionMetadata,
  };
};

export const generateGenerateSoundStructuredResponse = async ({
  taskPrompt,
  systemInstructions,
  userMessage,
  reasoningEffort,
  maxOutputTokens = 420,
}: {
  taskPrompt: string;
  systemInstructions: string;
  userMessage: string;
  reasoningEffort?: DrawingAiReasoningEffort;
  maxOutputTokens?: number;
}) => {
  const optionCount = resolveRequestedGenerateSoundOptionCount();
  const prompt = [
    taskPrompt,
    "Return JSON only.",
    "If one critical execution lock is missing, set decision to question and ask one short engine-focused question.",
    "If enough is known, set decision to result.",
    `When decision is result, return exactly ${optionCount} sound option${optionCount === 1 ? "" : "s"} in soundOptions.`,
    "Hard rules: you do NOT generate sound, you define behavior for engine execution, and all output must be executable.",
    "Each sound option must be a strict engine command, not generated audio copy.",
    "Use title as a short engine label like type=punch impact; profile=medium;.",
    "Use description as the exact command line in this format: define sound event -> type=<family>; trigger=<cue>; timing=<start -> peak -> aftermath>; attack=<level>; intensity=<level>; texture=<type>; decay=<length>; layers=<components>; preserve=<family>;.",
    "Use timingFeel as trigger=<cue>; only.",
    "Use intensityFeel as short engine modifiers like attack=<level>; preserve=<family>; modify=<requested change>;.",
    "Use engine action language only.",
    "Ban finished-audio description language that presents a result instead of an engine behavior plan.",
    "Every result must preserve family lock and include a full event shape: start -> peak -> aftermath.",
    "Modifiers only change attack, weight, intensity, texture, timing, decay, or layering. They do not change sound identity.",
    "If the request is continuing the same project or current behavior plan, keep the same sound family and only shape the next beat or requested parameter that the user is changing.",
    "If the request is revising an existing sound with wording like sharper, heavier, softer, harder, shorter, darker, cleaner, less tail, more bass, too soft, too cartoony, or same one but cleaner, preserve the current sound role and map the revision to engine parameters directly. sharper means attack up. heavier means weight up. softer means intensity down.",
    "If the request gives exact beat timing like right when the foot lands, before the blade connects, or on the lock click, make the placement explicit and precise.",
    "If the prompt starts with greeting filler like hello, hi, or hey, ignore the greeting and focus on the actual sound request.",
    "If the user asks for a button, beep, click, UI, menu, notification, confirm tone, or interface pulse, keep it clean, controlled, and electronic instead of fight-heavy.",
    "If the user asks for voice, speech, dialogue, or a spoken line, do not turn it into an explosion, impact, or generic blast.",
    "If speech preview is not actually available, keep the result literal and placeholder-friendly instead of inventing a fake procedural voice sound.",
    "If the user asks for an explosion or blast and wants it cleaner, fuller, stronger, less distorted, or less crunchy, map that to pressure-front control, stronger blast body, cleaner transient, heavier low-end body, and tighter aftermath control.",
    "If the user asks for wind, leaves, room tone, hallway air, distant background events, buttons, UI, menu clicks, or confirm beeps, keep the wording non-impact and use terms like airy, rustle, muted, subtle, restrained, room tone, click, chirp, pulse, or environmental texture.",
    "If the user asks for a door creak, hinge strain, slow open, old wooden door, or hallway door opening, keep the sound material-focused with hinge strain, wood groan, slow creak pulses, uneven pressure, and restrained room air instead of whoosh, pass-by, engine sweep, sci-fi beep, or vehicle-like language.",
    "If the user names a target frame, treat that as a placement instruction and keep the behavior plan anchored to that frame.",
    "If the user is attaching or importing an existing option to a frame, stay in that attach/import workflow instead of restarting planning.",
    "Always return one strict command.",
    "Do not imply a sound has already been imported to a frame unless the user explicitly approved an option or explicitly asked to attach the current one.",
    "The response field must contain only the best strict engine command with no intro line, no explanation, and no option-number language.",
    "Keep the single behavior plan focused, executable, and family-locked.",
    "If this is a follow-up selection or revision, keep the chosen base sound identity and change only what the user asked for.",
    "Do not ask filler. Do not drift into theory. Do not return empty soundOptions when decision is result.",
    "Do not write cinematic paragraphs.",
    "Do not describe emotion without giving usage.",
    "Do not return vague audio narration. Keep everything tied to action, timing, engine handoff, and workflow use.",
    "Do not drift into plugin, DAW, or music-production instructions.",
    "Do not default to fight terms like impact, readable body, attack, slam, or tail for non-fight UI or interface sounds.",
  ].join("\n\n");

  try {
    const { value } = await generateAiObject<GenerateSoundStructuredResponse>({
      prompt,
      instructions: systemInstructions,
      reasoningEffort,
      maxOutputTokens,
      schemaName: "generate_sound_structured_response",
      schema: GENERATE_SOUND_STRUCTURED_SCHEMA,
    });

    return normalizeGenerateSoundStructuredObject(
      {
        decision: value.decision,
        response: value.response,
        question: value.question,
        options: value.options ?? [],
        soundOptions: value.soundOptions ?? [],
      },
      optionCount,
      "valid",
    )!;
  } catch (error) {
    const metadata = getStructuredGenerationMetadataFromError(error);
    const repaired = metadata.rawOutputPreview
      ? repairGenerateSoundStructuredResponse({
          rawOutputPreview: metadata.rawOutputPreview,
          optionCount,
        })
      : null;

    if (repaired) {
      return repaired;
    }

    throw error;
  }
};

const GENERATE_PLANS_SCOPE_TERMS = [
  "story",
  "scene",
  "shot",
  "shots",
  "sequence",
  "animation",
  "animatic",
  "fight",
  "chase",
  "intro",
  "opening",
  "ending",
  "loop",
  "clip",
  "moment",
];

const GENERATE_PLANS_SUBJECT_TERMS = [
  "character",
  "characters",
  "figure",
  "figures",
  "stick figure",
  "fighter",
  "fighters",
  "hero",
  "villain",
  "enemy",
  "monster",
  "robot",
  "person",
  "people",
  "girl",
  "boy",
  "man",
  "woman",
  "duo",
  "team",
  "vs",
];

const GENERATE_PLANS_TONE_TERMS = [
  "mood",
  "tone",
  "emotional",
  "emotion",
  "dramatic",
  "funny",
  "stylish",
  "brutal",
  "fast",
  "slow",
  "serious",
  "dark",
  "light",
  "cute",
  "tense",
  "epic",
];

const GENERATE_PLANS_SCOPE_SIZE_TERMS = [
  "beat",
  "beats",
  "scene",
  "scenes",
  "shot",
  "shots",
  "frame",
  "frames",
  "second",
  "seconds",
  "short",
  "long",
  "open",
  "close",
  "start",
  "middle",
  "end",
];

const GENERATE_PLANS_VISUAL_TERMS = [
  "color",
  "colors",
  "look",
  "style",
  "visual",
  "outline",
  "silhouette",
  "glow",
  "red",
  "blue",
  "black",
  "white",
  "gray",
  "grey",
  "dark",
  "light",
];

const GENERATE_PLANS_SETTING_TERMS = [
  "background",
  "setting",
  "backdrop",
  "room",
  "hallway",
  "street",
  "alley",
  "arena",
  "forest",
  "city",
  "rooftop",
  "sky",
  "desert",
  "field",
  "space",
  "school",
  "house",
  "temple",
];

const GENERATE_PLANS_ACTION_TERMS = [
  "fight",
  "punch",
  "punching",
  "kick",
  "kicking",
  "run",
  "walk",
  "jump",
  "bounce",
  "bouncing",
  "roll",
  "rolling",
  "dribble",
  "dribbling",
  "attack",
  "hit",
  "slash",
  "slashing",
  "grapple",
  "grappling",
  "throw",
  "throwing",
  "tackle",
  "tackling",
  "dash",
  "dashing",
  "block",
  "blocking",
  "counter",
  "countering",
  "react",
  "reacting",
  "land",
  "transform",
  "reveal",
  "look",
  "turn",
  "fall",
  "smile",
  "cry",
  "talk",
  "chase",
  "escape",
  "discover",
  "react",
  "arrive",
];

const GENERATE_PLANS_INTENT_TERMS = [
  "plan",
  "planning",
  "storyboard",
  "story board",
  "sequence",
  "beats",
  "beat",
  "scene order",
  "give me a plan",
  "build a plan",
];

const GENERATE_PLANS_SEQUENCE_TERMS = [
  "start",
  "starts",
  "starting",
  "first",
  "then",
  "next",
  "after",
  "before",
  "again",
  "switch",
  "ending",
  "end",
  "wins",
  "loses",
];

const GENERATE_PLANS_CAMERA_REQUEST_TERMS = [
  "camera",
  "cinematic",
  "cinematography",
  "framing",
  "shot choice",
  "shot choices",
  "camera movement",
];

const GENERATE_PLANS_CAMERA_STYLE_TERMS = [
  "close-up",
  "close up",
  "close-up and punchy",
  "wide",
  "wide and readable",
  "tracking",
  "dynamic tracking",
  "handheld",
  "static camera",
  "mostly static camera",
  "locked camera",
  "overhead",
  "side view",
  "push in",
  "pull back",
  "cinematic wide",
];

const GENERATE_PLANS_SIDE_TERMS = [
  "left",
  "left figure",
  "left one",
  "right",
  "right figure",
  "right one",
  "red",
  "red outline",
  "blue",
  "blue outline",
  "hero",
  "villain",
  "first figure",
  "second figure",
  "one wins",
  "two fighters",
  "vs",
  "versus",
  "against",
];

const OPENING_ATTACK_QUESTION = "Who should act first in the executed sequence?";
const SCOPE_QUESTION = "What size execution plan should this use?";
const TONE_QUESTION = "What tone should this sequence execute with?";
const CAMERA_QUESTION = "What camera direction should this sequence use?";
const LENGTH_QUESTION = "How long should the executed sequence feel?";
const MAIN_ACTION_QUESTION = "What main action should be executed?";
const MAIN_IDEA_QUESTION = "What final result should this sequence build toward?";
const SCENE_TYPE_QUESTION = "What kind of sequence should be executed?";
const DISCOVERY_REVEAL_QUESTION = "What reveal should be executed?";
const EMOTIONAL_FEELING_QUESTION = "What emotional turn should be executed?";
const UNCLEAR_GENERATE_PLANS_MESSAGE =
  "One quick execution detail will lock the plan in cleanly.";
const GENERATE_PLANS_MODEL_ANALYSIS_INSTRUCTIONS = [
  "You are the reasoning layer for Generate Plans.",
  "The UI already knows how to show a question card or a final command plan. Your job is only to reason well.",
  "Follow this order every time: fully analyze the full message, identify the real intent, list what is already known, list what is still missing, decide whether a real lock-setting gap remains, then either ask one natural question or move to plan generation.",
  "Use the provided training examples as behavioral guidance. Learn the pattern from them, but do not copy them mechanically.",
  "The app is for stick figure animation planning, scene sequencing, and execution direction. Keep that audience in mind.",
  "Think like a human-aware director. Prefer visual beats, motion clarity, staging, and engine-ready actions over polished narrative prose.",
  "Match the user's scale: simple requests should lead to one clean command plan, exploratory requests should still collapse to one strongest command plan, and unclear requests should lead to one smart clarifying question.",
  "Improve mode means preserve the same core sequence direction, main action, and key character or object. Only improve clarity, impact, pacing, and animation readability.",
  "If the user gives negative revision phrasing like make it better, this sucks, do it again, fix this, make it cooler, why does this look weird, no not like that, or keep it but fix it, treat that as preserve-the-current-thing language first.",
  "Do not replace the user's intended direction, add random twists, or default to cinematic emotional escalation unless the user clearly asked for that.",
  "Good plans use logical cause and effect and readable step-by-step motion. Bad plans jump to unrelated events or cram too many actions into one beat.",
  "You are not the renderer. You are preparing the strongest sequence and payoff for later engine execution.",
  "Treat any story wording in the request as source intent only. Convert it into execution order, not narrative output.",
  "Remember common animation expectations: explosion means bright core, orange/yellow/red heat, fast expansion, fade, then smoke; punch means anticipation, hit, recoil; simple movement means smooth spacing, readable travel, and no floaty teleporting.",
  "Do not use canned question categories, template libraries, or pattern-driven filler.",
  "Do not ask about a fact that is already in the request context.",
  "Do not ask generic fallback questions such as What beat should execute next? when a sharper question exists.",
  "Do not ask What reveal should be executed when he finds it? when the object is already known.",
  "Do not use phrases such as first exchange, opening exchange, Character A, or Character B in user-facing questions.",
  "If you ask a question, keep it short, natural, and direct. Prefer one clean line over a chatty preamble.",
  "Good question style: What reveal should be executed on the next page? Who should call his name? What should respond outside when the beat executes? What addition should be executed on the project?",
  "Bad question style: Before I lock this plan, I need one more detail... What beat should execute next?",
  "Natural scene descriptions are already planning requests. Two stick figures fight on a rooftop should go straight to plan generation.",
  "For fight prompts with a clear setup, infer escalation and payoff automatically instead of reopening obvious details.",
  "For reveal or discovery prompts with a known object or trigger, infer setup -> reveal -> reaction -> payoff unless one real lock is missing.",
  "For emotional prompts, infer a visible relationship or decision change instead of asking for abstract feelings when the expected change is already obvious.",
  "Do not ask obvious questions humans already expect from the setup.",
  "If the request is complete enough for a strong ordered plan, choose plan and stop questioning.",
  "If the user gives a messy but usable prompt like make something cool, just do a fight, make it cooler, or continue this but better, prefer a strong safe plan over clarification.",
  "If the user says things like more cool, not boring, or this part sucks, infer the likely issue first: usually weak motion, weak impact, or unclear payoff.",
  "If the user is clearly refining or continuing an existing plan, preserve the current sequence direction and adjust only the requested part instead of restarting.",
  "If the user asks for story ideas or story improvement, reinterpret that as asking for one strong execution direction or an execution upgrade.",
  "For direction-establishment or direction-upgrade requests, ask only one focused lock-setting question at a time when needed, then move straight into one committed action chain.",
  "Never let the interaction drift into endless questioning. Hard cap: no more than 10 total questions, and usually 1 to 3 is enough.",
  "If you ask a question, ask exactly one natural plan-specific question.",
  "If a critical lock is missing, ask one typed-only question. Do not provide answer options.",
  "When planning is ready, think toward a JSON command payload with ordered actions, not prose sections.",
  "Keep response intro natural. Avoid robotic error language.",
  "Return only JSON that matches the schema.",
].join("\n");

const GENERATE_PLANS_KNOWN_STORY_ANCHORS_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    knownObject: {
      type: "string",
    },
    knownCharacters: {
      type: "array",
      items: {
        type: "string",
      },
      minItems: 0,
      maxItems: 6,
    },
    knownPlace: {
      type: "string",
    },
    knownTriggerAction: {
      type: "string",
    },
    knownOutcomeResult: {
      type: "string",
    },
    knownRevealPoint: {
      type: "string",
    },
    knownNextBeat: {
      type: "string",
    },
  },
  required: [
    "knownObject",
    "knownCharacters",
    "knownPlace",
    "knownTriggerAction",
    "knownOutcomeResult",
    "knownRevealPoint",
    "knownNextBeat",
  ],
} as const;

const GENERATE_PLANS_MODEL_ANALYSIS_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    decision: {
      type: "string",
      enum: ["question", "plan", "message"],
    },
    sceneType: {
      type: "string",
      enum: ["fight", "chase", "exploration", "discovery", "escape", "emotional", "comedy", "general", "unknown"],
    },
    response: {
      type: "string",
    },
    storySummary: {
      type: "string",
    },
    knownStoryAnchors: GENERATE_PLANS_KNOWN_STORY_ANCHORS_SCHEMA,
    knownFacts: {
      type: "array",
      items: {
        type: "string",
      },
      minItems: 0,
      maxItems: 8,
    },
    missingFacts: {
      type: "array",
      items: {
        type: "string",
      },
      minItems: 0,
      maxItems: 8,
    },
    rankedMissingFacts: {
      type: "array",
      items: {
        type: "string",
      },
      minItems: 0,
      maxItems: 8,
    },
    highestPriorityGap: {
      type: "string",
    },
    reasoningWhyThisGapMattersMost: {
      type: "string",
    },
    question: {
      type: "string",
    },
    options: {
      type: "array",
      items: {
        type: "string",
      },
      minItems: 0,
      maxItems: 4,
    },
    typedOnly: {
      type: "boolean",
    },
    confidence: {
      type: "number",
      minimum: 0,
      maximum: 1,
    },
  },
  required: [
    "decision",
    "sceneType",
    "response",
    "storySummary",
    "knownStoryAnchors",
    "knownFacts",
    "missingFacts",
    "rankedMissingFacts",
    "highestPriorityGap",
    "reasoningWhyThisGapMattersMost",
    "question",
    "options",
    "typedOnly",
    "confidence",
  ],
} as const;

const normalizeGeneratePlansInput = (value: string) =>
  value
    .toLowerCase()
    .replace(/[“”]/g, '"')
    .replace(/[’]/g, "'")
    .replace(/[\u2013\u2014]/g, " ")
    .replace(/[^\w\s'/-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const GENERATE_PLANS_SIMPLE_REQUEST_PATTERN =
  /\b(simple|short|quick|clean|basic|minimal)\b|\bwalk cycle\b|\bsimple funny animation\b|\bsimple fight\b/i;
const GENERATE_PLANS_IMPROVE_MODE_PATTERN =
  /\b(make (?:it|this|the [\w\s'-]{0,30}) better|improve (?:this|it)|fix (?:this|it)|make it cooler|make it punchier|clean it up|make it easier to animate|not boring)\b/i;
const GENERATE_PLANS_MESSY_INPUT_PATTERN =
  /\b(uhh|uh|idk|i don't know|not boring|this part sucks|kinda|sorta|whatever)\b/i;
const GENERATE_PLANS_VAGUE_ONLY_PATTERN =
  /^(idk|i don't know|idk what to do|what should i do|this part sucks)\b/i;
const GENERATE_PLANS_DIRECT_ACTION_HINT_PATTERN =
  /\b(fight|punch|kick|walk|walking|run|running|step|stepping|door|open|opening|reaction|explode|explosion|ball|drop|fall|falling|bounce|bouncing|funny|slip|counter|dodge|loop)\b/i;
const GENERATE_PLANS_DISCOVERY_SIGNAL_PATTERN =
  /\b(find|finds|found|discover|discovers|discovered|reveal|reveals|revealed|key|door|map|notebook|archive|shadow|note|clue)\b/i;
const GENERATE_PLANS_EMOTIONAL_SIGNAL_PATTERN =
  /\b(friend|friends|family|reunion|apolog|forgive|grief|hospital|camera|argue|argument|relationship|emotional|sad)\b/i;

const inferGeneratePlansAutoSceneType = (normalized: string): GeneratePlansRequestAnalysis["sceneType"] => {
  if (FIGHT_STORY_SIGNAL_PATTERN.test(normalized)) {
    return "fight";
  }

  if (/\b(chase|pursuit|route|catch|closing routes)\b/.test(normalized)) {
    return "chase";
  }

  if (/\b(escape|flee|run away)\b/.test(normalized)) {
    return "escape";
  }

  if (GENERATE_PLANS_DISCOVERY_SIGNAL_PATTERN.test(normalized)) {
    return "discovery";
  }

  if (GENERATE_PLANS_EMOTIONAL_SIGNAL_PATTERN.test(normalized)) {
    return "emotional";
  }

  if (/\b(funny|comedy|gag|cafeteria|silly)\b/.test(normalized)) {
    return "comedy";
  }

  return "general";
};

const shouldAutoPlanGeneratePlansRequest = ({
  normalized,
  hasContextToPreserve,
}: {
  normalized: string;
  hasContextToPreserve: boolean;
}) => {
  if (!normalized) {
    return false;
  }

  if (QUESTION_START_PATTERN.test(normalized) || /\b(i don't know|idk|what should i do|brainstorm|ideas|options)\b/.test(normalized)) {
    return false;
  }

  if (GENERATE_PLANS_CONTINUATION_PATTERN.test(normalized)) {
    return true;
  }

  if (
    FIGHT_STORY_SIGNAL_PATTERN.test(normalized) &&
    (MULTI_FIGHTER_STORY_PATTERN.test(normalized) || /\brooftop|roof|bridge|arena|hallway\b/.test(normalized))
  ) {
    return true;
  }

  if (GENERATE_PLANS_DISCOVERY_SIGNAL_PATTERN.test(normalized) && /\b(key|door|map|notebook|archive|shadow|note|clue)\b/.test(normalized)) {
    return true;
  }

  if (
    GENERATE_PLANS_EMOTIONAL_SIGNAL_PATTERN.test(normalized) &&
    /\b(friend|friends|family|reunion|hospital|camera|roof|bridge)\b/.test(normalized)
  ) {
    return true;
  }

  return hasContextToPreserve && /\b(add|after|then|continue|keep)\b/.test(normalized);
};

export const inferGeneratePlansBehaviorSignals = ({
  userMessage,
  followUpMemory = [],
  analysisInput = "",
  conversationHistory = [],
}: {
  userMessage: string;
  followUpMemory?: DrawingAiFollowUpMemoryItem[];
  analysisInput?: string;
  conversationHistory?: DrawingAiConversationMessage[];
}): GeneratePlansBehaviorSignals => {
  const normalized = normalizeGeneratePlansInput(userMessage);
  const tokenCount = normalized ? normalized.split(/\s+/).length : 0;
  const normalizedAnalysisInput = normalizeGeneratePlansInput(analysisInput);
  const hasContextFromAnalysisInput =
    normalizedAnalysisInput.length > 0 && normalizedAnalysisInput !== normalized;
  const priorUserMessages = conversationHistory
    .filter((message) => message.role === "user")
    .map((message) => normalizeGeneratePlansInput(message.content))
    .filter((message) => message.length > 0 && message !== normalized);
  const hasContextToPreserve =
    sanitizeFollowUpMemory(followUpMemory).length > 0 ||
    hasContextFromAnalysisInput ||
    priorUserMessages.length > 0;
  const improveMode = GENERATE_PLANS_IMPROVE_MODE_PATTERN.test(normalized);
  const simpleByLength =
    tokenCount > 0 &&
    tokenCount <= 6 &&
    !/\b(story|ideas|option|brainstorm|beginning|middle|ending|arc)\b/.test(normalized) &&
    !/\b(and|then|after|before|while)\b/.test(normalized);
  const responseScale: GeneratePlansResponseScale =
    GENERATE_PLANS_SIMPLE_REQUEST_PATTERN.test(normalized) ||
    (simpleByLength && (GENERATE_PLANS_DIRECT_ACTION_HINT_PATTERN.test(normalized) || improveMode))
      ? "simple"
      : "standard";
  const likelyUnclear =
    !hasContextToPreserve &&
    (GENERATE_PLANS_VAGUE_ONLY_PATTERN.test(normalized) ||
      (normalized.length <= 12 && !GENERATE_PLANS_DIRECT_ACTION_HINT_PATTERN.test(normalized)));
  const preserveIdentity =
    improveMode ||
    hasContextToPreserve ||
    /\bkeep the same|same idea|same plan|same scene|same animation|continue this|continue the|add .* after this|after this (?:punch|kick|hit|beat|move)|insert .* after\b/.test(normalized);

  return {
    normalized,
    responseScale,
    improveMode,
    messyInput: GENERATE_PLANS_MESSY_INPUT_PATTERN.test(normalized),
    preserveIdentity,
    likelyUnclear,
    hasContextToPreserve,
    shouldUseOptions: false,
    heuristicQuestion: null,
    heuristicOptions: null,
  };
};

const withGeneratePlansBehaviorSignals = (
  analysis: GeneratePlansRequestAnalysis,
  behaviorSignals: GeneratePlansBehaviorSignals,
): GeneratePlansRequestAnalysis => ({
  ...analysis,
  responseScale: behaviorSignals.responseScale,
  improveMode: behaviorSignals.improveMode,
  messyInput: behaviorSignals.messyInput,
  preserveIdentity: behaviorSignals.preserveIdentity,
});

export const shouldGeneratePlansFollowUpAllowMultiSelect = (question: string | null | undefined) => {
  void question;
  return false;
};

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const toTitleCase = (value: string) =>
  value.replace(/\b\w/g, (match) => match.toUpperCase());

const createGeneratePlansFollowUp = ({
  intro = "I can build a stronger plan once this detail is locked in.",
  question,
  options = null,
  multiSelect = false,
  missingCreativeLocks = [],
  questionKey = getDrawingAiFollowUpQuestionKey(question),
  questionPriorityReason = "next relevant missing creative lock",
}: {
  intro?: string;
  question: string;
  options?: string[] | null;
  multiSelect?: boolean;
  missingCreativeLocks?: string[];
  questionKey?: string;
  questionPriorityReason?: string;
}): GeneratePlansRequestAnalysis => ({
  needsClarification: true,
  clarificationMode: "question-box",
  sceneType: "general",
  followUpIntro: intro,
  followUpQuestion: question,
  followUpMultiSelect: multiSelect === true,
  followUpOptions: options,
  classificationReason: "",
  missingCreativeLocks,
  decision: "question",
  questionKey,
  questionPriorityReason,
});

const createGeneratePlansClarificationMessage = ({
  message = UNCLEAR_GENERATE_PLANS_MESSAGE,
  sceneType = "unknown",
}: {
  message?: string;
  sceneType?: GeneratePlansRequestAnalysis["sceneType"];
}): GeneratePlansRequestAnalysis => ({
  needsClarification: true,
  clarificationMode: "message",
  sceneType,
  followUpIntro: message,
  followUpQuestion: null,
  followUpMultiSelect: false,
  followUpOptions: null,
  classificationReason: "",
  missingCreativeLocks: [],
  decision: "clarify",
  questionKey: null,
  questionPriorityReason: null,
});

const extractMentionedActionChoices = (value: string) => {
  const matches = GENERATE_PLANS_ACTION_PATTERNS.flatMap(({ pattern, label }, patternIndex) => {
    const regex = new RegExp(pattern.source, pattern.flags);
    const patternMatches: Array<{ start: number; end: number; label: string; patternIndex: number }> = [];
    let match = regex.exec(value);

    while (match) {
      patternMatches.push({
        start: match.index,
        end: match.index + match[0].length,
        label,
        patternIndex,
      });
      match = regex.exec(value);
    }

    return patternMatches;
  }).sort((left, right) => {
    if (left.start !== right.start) {
      return left.start - right.start;
    }

    const leftLength = left.end - left.start;
    const rightLength = right.end - right.start;
    if (leftLength !== rightLength) {
      return rightLength - leftLength;
    }

    return left.patternIndex - right.patternIndex;
  });

  const selectedLabels: string[] = [];
  const occupiedRanges: Array<{ start: number; end: number }> = [];

  for (const match of matches) {
    if (selectedLabels.includes(match.label)) {
      continue;
    }

    const overlapsExistingRange = occupiedRanges.some(
      (range) => match.start < range.end && range.start < match.end,
    );
    if (overlapsExistingRange) {
      continue;
    }

    selectedLabels.push(match.label);
    occupiedRanges.push({ start: match.start, end: match.end });

    if (selectedLabels.length >= 4) {
      break;
    }
  }

  return selectedLabels;
};

const normalizeColorToken = (value: string) => (value === "grey" ? "gray" : value);
const COUNT_WORDS = ["one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"] as const;

const formatEntityLabel = ({
  color,
  noun,
  outline,
}: {
  color: string;
  noun: string;
  outline?: boolean;
}) => {
  if (outline) {
    return `${toTitleCase(color)}-outlined ${noun}`;
  }

  return `${toTitleCase(color)} ${noun}`;
};

const getPreferredEntityNoun = (value: string) => {
  if (value.includes("stick figure")) {
    return "figure";
  }

  const preferredNoun =
    GENERATE_PLANS_ENTITY_NOUNS.find((noun) => value.includes(noun)) ?? "character";

  return preferredNoun === "character" ? "character" : preferredNoun;
};

const extractDirectEntityLabels = (value: string) => {
  const nounPattern = [...GENERATE_PLANS_ENTITY_NOUNS]
    .sort((left, right) => right.length - left.length)
    .map((noun) => escapeRegExp(noun))
    .join("|");
  const directEntityPattern = new RegExp(
    `\\b(${GENERATE_PLANS_COLOR_TERMS.join("|")})\\s+(${nounPattern})\\b`,
    "g",
  );
  const seenLabels = new Set<string>();

  return [...value.matchAll(directEntityPattern)]
    .map((match) =>
      formatEntityLabel({
        color: normalizeColorToken(match[1]),
        noun: match[2] === "stick figure" ? "figure" : match[2],
      }),
    )
    .filter((label) => {
      const normalizedLabel = label.toLowerCase();
      if (seenLabels.has(normalizedLabel)) {
        return false;
      }

      seenLabels.add(normalizedLabel);
      return true;
    });
};

const extractOutlineEntityLabels = (value: string) => {
  const seenLabels = new Set<string>();

  return [...value.matchAll(/\b(red|blue|green|yellow|orange|purple|pink|black|white|gray|grey)\s+outline\b/g)]
    .map((match) =>
      formatEntityLabel({
        color: normalizeColorToken(match[1]),
        noun: "figure",
        outline: true,
      }),
    )
    .filter((label) => {
      const normalizedLabel = label.toLowerCase();
      if (seenLabels.has(normalizedLabel)) {
        return false;
      }

      seenLabels.add(normalizedLabel);
      return true;
    });
};

const extractFallbackColorEntityLabels = (value: string) => {
  const noun = getPreferredEntityNoun(value);
  const seenColors = new Set<string>();

  return [...value.matchAll(/\b(red|blue|green|yellow|orange|purple|pink|black|white|gray|grey)\b/g)]
    .map((match) => normalizeColorToken(match[1]))
    .filter((color) => {
      if (seenColors.has(color)) {
        return false;
      }

      seenColors.add(color);
      return true;
    })
    .map((color) =>
      formatEntityLabel({
        color,
        noun,
      }),
    );
};

const titleCaseCount = (value: string) => toTitleCase(value);

const formatSnackRoleLabel = (value: string) => {
  if (!/\b(snack|snacks|7 eleven|7-eleven|convenience store|store)\b/.test(value)) {
    return null;
  }

  if (/\b(girl|woman)\b/.test(value)) {
    return "Snack girl";
  }

  if (/\b(kid|boy)\b/.test(value)) {
    return "Snack kid";
  }

  if (/\b(dude|guy|man|person|character)\b/.test(value)) {
    return "Snack guy";
  }

  return "Snack character";
};

const extractColorRoleLabels = (value: string) => {
  const seenLabels = new Set<string>();

  return [
    ...value.matchAll(
      /\b(red|blue|green|yellow|orange|purple|pink|black|white|gray|grey)\s+(guy|dude|man|woman|girl|boy|kid)\b/g,
    ),
  ]
    .map((match) => `${toTitleCase(normalizeColorToken(match[1]))} ${match[2]}`)
    .filter((label) => {
      const normalizedLabel = label.toLowerCase();
      if (seenLabels.has(normalizedLabel)) {
        return false;
      }

      seenLabels.add(normalizedLabel);
      return true;
    });
};

const extractGroupEntityLabels = (value: string) => {
  const seenLabels = new Set<string>();
  const nextLabels: string[] = [];
  const aggressiveGroupContext = /\b(pick(?:ing)? on|jump(?:ing)?|bully|attack|attacking|gang up on)\b/.test(value);

  const pushLabel = (label: string | null) => {
    if (!label) {
      return;
    }

    const normalizedLabel = label.toLowerCase();
    if (seenLabels.has(normalizedLabel)) {
      return;
    }

    seenLabels.add(normalizedLabel);
    nextLabels.push(label);
  };

  for (const match of value.matchAll(
    new RegExp(
      `\\b(team|group|pack|gang|crowd)\\s+of\\s+(${COUNT_WORDS.join("|")}|\\d+)(?:\\s+(attackers|bullies|guys|kids|teens|fighters|friends|people))?\\b`,
      "g",
    ),
  )) {
    const count = titleCaseCount(match[2]);
    const role = match[3];
    if (role) {
      pushLabel(`${count} ${role}`);
      continue;
    }

    pushLabel(aggressiveGroupContext ? `${count} attackers` : `${toTitleCase(match[1])} of ${match[2]}`);
  }

  for (const match of value.matchAll(
    new RegExp(`\\b(${COUNT_WORDS.join("|")}|\\d+)\\s+(attackers|bullies|guys|kids|teens|fighters|friends|people)\\b`, "g"),
  )) {
    pushLabel(`${titleCaseCount(match[1])} ${match[2]}`);
  }

  return nextLabels;
};

const extractNarrativeEntityLabels = (value: string) =>
  sanitizeFollowUpOptions([
    ...(formatSnackRoleLabel(value) ? [formatSnackRoleLabel(value) as string] : []),
    ...(value.includes("main guy") ? ["Main guy"] : []),
    ...(value.includes("main character") ? ["Main character"] : []),
    ...(value.includes("bird") ? ["Bird"] : []),
    ...(value.includes("hero") ? ["Hero"] : []),
    ...(value.includes("villain") ? ["Villain"] : []),
    ...extractColorRoleLabels(value),
    ...extractGroupEntityLabels(value),
  ]);

const extractEntityLabels = (value: string) => {
  const explicitLeft = /\bleft(?: one| figure| character| dot| star)?\b/.test(value);
  const explicitRight = /\bright(?: one| figure| character| dot| star)?\b/.test(value);
  const directEntities = extractDirectEntityLabels(value);
  if (directEntities.length >= 2) {
    return directEntities.slice(0, 2);
  }

  const outlineEntities = extractOutlineEntityLabels(value);
  if (outlineEntities.length >= 2) {
    return outlineEntities.slice(0, 2);
  }

  const mergedNamedEntities = sanitizeFollowUpOptions([
    ...extractNarrativeEntityLabels(value),
    ...directEntities,
    ...outlineEntities,
    ...extractFallbackColorEntityLabels(value),
  ]);
  if (mergedNamedEntities.length >= 2) {
    return mergedNamedEntities.slice(0, 2);
  }

  if (explicitLeft && explicitRight) {
    return ["Left character", "Right character"];
  }

  if (explicitLeft) {
    return ["Left character", "Other character"];
  }

  if (explicitRight) {
    return ["Right character", "Other character"];
  }

  if (value.includes("vs") || value.includes("versus") || value.includes("against")) {
    return ["Character A", "Character B"];
  }

  return ["Character A", "Character B"];
};

const hasExplicitOpeningOwner = (value: string, entityLabels: string[]) => {
  const genericOwnerPattern =
    /\b(left(?: figure| one| character| dot| star)?|right(?: figure| one| character| dot| star)?|hero|villain|character a|character b|first figure|second figure)\s+(starts|opens|attacks|moves first|goes first|starts with|opens with)\b/;

  if (genericOwnerPattern.test(value)) {
    return true;
  }

  return entityLabels.some((entityLabel) => {
    const normalizedLabel = normalizeGeneratePlansInput(entityLabel);
    const escapedLabel = escapeRegExp(normalizedLabel);
    return (
      new RegExp(`\\b${escapedLabel}\\s+(starts|opens|attacks|moves first|goes first|starts with|opens with)\\b`).test(
        value,
      ) ||
      new RegExp(`\\bstart with\\s+${escapedLabel}\\b`).test(value)
    );
  });
};

const sanitizeFollowUpOptions = (options: string[]) => {
  const seen = new Set<string>();

  return options
    .map((option) => option.trim())
    .filter((option) => option.length > 0)
    .filter((option) => {
      const normalizedOption = option.toLowerCase();
      if (seen.has(normalizedOption)) {
        return false;
      }

      seen.add(normalizedOption);
      return true;
    })
    .slice(0, 4);
};

const GENERATE_PLANS_ENTITY_ALIAS_STOP_WORDS = new Set([
  "a",
  "an",
  "the",
  "character",
  "figure",
  "guy",
  "girl",
  "person",
  "people",
  "fighter",
  "team",
  "group",
  "pack",
]);

const slugifyGeneratePlansValue = (value: string) =>
  normalizeGeneratePlansInput(value)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

const hasMeaningfulFollowUpAnswer = (value: string) =>
  normalizeGeneratePlansInput(value)
    .split(/\s+/)
    .filter((token) => token.length > 2).length > 0;

const createTaggedValue = (prefix: string, value: string) => `${prefix}:${slugifyGeneratePlansValue(value)}`;

const buildCustomTagValues = (prefix: string, value: string) => {
  const fragments = value
    .split(/\s*(?:,|\/|&|\band\b|\bbut\b|\bwith\b)\s*/i)
    .map((fragment) => fragment.trim())
    .filter((fragment) => fragment.length > 0)
    .map((fragment) => createTaggedValue(prefix, fragment))
    .filter((fragment) => fragment !== `${prefix}:`)
    .slice(0, 3);

  return sanitizeFollowUpOptions(fragments);
};

const extractMappedTagValues = (
  value: string,
  prefix: string,
  mappings: Array<{ value: string; terms: string[] }>,
) => {
  const nextValues = mappings
    .filter(({ terms }) => terms.some((term) => value.includes(term)))
    .map(({ value: mappedValue }) => createTaggedValue(prefix, mappedValue));

  return sanitizeFollowUpOptions(nextValues);
};

const getBestEntityMatch = (value: string, storyContext: string) => {
  const normalizedValue = normalizeGeneratePlansInput(value);
  const entityLabels = extractEntityLabels(storyContext);
  let bestMatch: { label: string; index: number } | null = null;

  for (const entityLabel of entityLabels) {
    const normalizedLabel = normalizeGeneratePlansInput(entityLabel);
    const aliasCandidates = sanitizeFollowUpOptions([
      normalizedLabel,
      ...normalizedLabel
        .split(/\s+/)
        .filter((token) => token.length > 2 && !GENERATE_PLANS_ENTITY_ALIAS_STOP_WORDS.has(token)),
    ]);

    for (const alias of aliasCandidates) {
      const matchIndex = normalizedValue.indexOf(alias);
      if (matchIndex < 0) {
        continue;
      }

      if (bestMatch == null || matchIndex < bestMatch.index) {
        bestMatch = { label: entityLabel, index: matchIndex };
      }
    }
  }

  return bestMatch?.label ?? null;
};

const parseGeneratePlansFollowUpNormalizedValues = ({
  answer,
  question,
  storyContext,
}: {
  answer: string;
  question: string;
  storyContext: string;
}) => {
  const normalizedAnswer = normalizeGeneratePlansInput(answer);
  const normalizedQuestion = normalizeFollowUpQuestion(question);
  if (!normalizedAnswer || !normalizedQuestion) {
    return null;
  }

  if (normalizedQuestion === normalizeFollowUpQuestion(OPENING_ATTACK_QUESTION)) {
    if (hasSharedOpeningBeat(normalizedAnswer)) {
      return ["opening:simultaneous"];
    }

    const matchedEntity = getBestEntityMatch(normalizedAnswer, storyContext);
    if (matchedEntity) {
      return [createTaggedValue("opening", matchedEntity)];
    }

    if (hasMeaningfulFollowUpAnswer(normalizedAnswer)) {
      return ["opening:custom"];
    }

    return null;
  }

  if (normalizedQuestion === normalizeFollowUpQuestion(TONE_QUESTION)) {
    const mappedValues = extractMappedTagValues(normalizedAnswer, "tone", [
      { value: "serious", terms: ["serious", "grounded"] },
      { value: "stylish", terms: ["stylish", "cool"] },
      { value: "brutal", terms: ["brutal", "harsh", "violent"] },
      { value: "funny", terms: ["funny", "comedic", "goofy", "silly"] },
      { value: "mysterious", terms: ["mysterious", "mystery"] },
      { value: "magical", terms: ["magical", "magic"] },
      { value: "exciting", terms: ["exciting", "energetic"] },
      { value: "calm", terms: ["calm", "gentle", "peaceful", "quiet"] },
      { value: "urgent", terms: ["urgent", "urgently"] },
      { value: "tense", terms: ["tense", "stressful"] },
      { value: "wild", terms: ["wild", "chaotic"] },
      { value: "playful", terms: ["playful", "lighthearted"] },
      { value: "sad", terms: ["sad", "grief", "grieving"] },
      { value: "hopeful", terms: ["hopeful", "warm"] },
      { value: "heavy", terms: ["heavy", "intense"] },
    ]);
    return mappedValues.length > 0 ? mappedValues : buildCustomTagValues("tone", normalizedAnswer);
  }

  if (normalizedQuestion === normalizeFollowUpQuestion(CAMERA_QUESTION)) {
    const mappedValues = extractMappedTagValues(normalizedAnswer, "camera", [
      { value: "close-up-and-punchy", terms: ["close up", "close-up", "punchy"] },
      { value: "wide-and-readable", terms: ["wide", "readable"] },
      { value: "dynamic-tracking", terms: ["tracking", "dynamic", "follow"] },
      { value: "mostly-static-camera", terms: ["static", "locked", "still"] },
      { value: "handheld", terms: ["handheld"] },
      { value: "overhead", terms: ["overhead", "top down"] },
      { value: "side-view", terms: ["side view", "profile"] },
      { value: "push-in", terms: ["push in", "push-in"] },
      { value: "pull-back", terms: ["pull back", "pull-back"] },
    ]);
    return mappedValues.length > 0 ? mappedValues : buildCustomTagValues("camera", normalizedAnswer);
  }

  if (normalizedQuestion === normalizeFollowUpQuestion(LENGTH_QUESTION)) {
    const mappedValues = extractMappedTagValues(normalizedAnswer, "length", [
      { value: "short", terms: ["short", "brief", "quick"] },
      { value: "medium", terms: ["medium", "mid"] },
      { value: "long", terms: ["long", "extended", "slow burn"] },
    ]);
    if (mappedValues.length > 0) {
      return mappedValues;
    }

    if (/\b\d+\s*(second|seconds|sec|secs|minute|minutes|min|mins)\b/.test(normalizedAnswer)) {
      return ["length:timed"];
    }

    return hasMeaningfulFollowUpAnswer(normalizedAnswer) ? ["length:custom"] : null;
  }

  if (normalizedQuestion === normalizeFollowUpQuestion(SCOPE_QUESTION)) {
    const mappedValues = extractMappedTagValues(normalizedAnswer, "scope", [
      { value: "one-shot", terms: ["one shot", "single shot"] },
      { value: "short-scene", terms: ["short scene"] },
      { value: "full-scene", terms: ["full scene"] },
      { value: "full-sequence", terms: ["full sequence", "sequence"] },
      { value: "full-animation", terms: ["full animation", "whole animation"] },
    ]);
    return mappedValues.length > 0 ? mappedValues : (hasMeaningfulFollowUpAnswer(normalizedAnswer) ? ["scope:custom"] : null);
  }

  if (normalizedQuestion === normalizeFollowUpQuestion(DISCOVERY_REVEAL_QUESTION)) {
    const mappedValues = extractMappedTagValues(normalizedAnswer, "reveal", [
      { value: "magical", terms: ["magical", "magic"] },
      { value: "mysterious", terms: ["mysterious", "mystery"] },
      { value: "exciting", terms: ["exciting", "intense", "surprising"] },
      { value: "calm", terms: ["calm", "gentle", "quiet"] },
      { value: "slow", terms: ["slow", "gradual"] },
    ]);
    return mappedValues.length > 0 ? mappedValues : buildCustomTagValues("reveal", normalizedAnswer);
  }

  if (normalizedQuestion === normalizeFollowUpQuestion(EMOTIONAL_FEELING_QUESTION)) {
    const mappedValues = extractMappedTagValues(normalizedAnswer, "feeling", [
      { value: "tender", terms: ["tender", "soft", "gentle"] },
      { value: "sad", terms: ["sad", "grief", "quiet"] },
      { value: "hopeful", terms: ["hopeful", "warm"] },
      { value: "heavy", terms: ["heavy", "intense"] },
      { value: "loving", terms: ["loving", "love"] },
    ]);
    return mappedValues.length > 0 ? mappedValues : buildCustomTagValues("feeling", normalizedAnswer);
  }

  if (normalizedQuestion === normalizeFollowUpQuestion(MAIN_ACTION_QUESTION) ||
      normalizedQuestion === normalizeFollowUpQuestion(SCENE_TYPE_QUESTION)) {
    const mappedValues = extractMappedTagValues(normalizedAnswer, "scene", [
      { value: "fight", terms: ["fight", "combat", "battle", "duel"] },
      { value: "chase", terms: ["chase", "pursuit"] },
      { value: "escape", terms: ["escape", "flee", "run away"] },
      { value: "discovery", terms: ["discover", "discovery", "find", "reveal"] },
      { value: "exploration", terms: ["explore", "exploration", "journey"] },
      { value: "emotional", terms: ["emotional", "sad", "family", "grief"] },
      { value: "comedy", terms: ["funny", "comedy", "goofy", "silly"] },
    ]);
    return mappedValues.length > 0 ? mappedValues : (hasMeaningfulFollowUpAnswer(normalizedAnswer) ? ["scene:custom"] : null);
  }

  if (normalizedQuestion === normalizeFollowUpQuestion(MAIN_IDEA_QUESTION)) {
    return hasMeaningfulFollowUpAnswer(normalizedAnswer) ? ["goal:custom"] : null;
  }

  return hasMeaningfulFollowUpAnswer(normalizedAnswer) ? ["answer:custom"] : null;
};

const withSceneType = (
  analysis: GeneratePlansRequestAnalysis,
  sceneType: GeneratePlansRequestAnalysis["sceneType"],
  classificationReason = analysis.classificationReason,
): GeneratePlansRequestAnalysis => ({
  ...analysis,
  sceneType,
  classificationReason,
});

const createGeneratePlansReadyToPlan = ({
  sceneType,
  missingCreativeLocks = [],
}: {
  sceneType: GeneratePlansRequestAnalysis["sceneType"];
  missingCreativeLocks?: string[];
}): GeneratePlansRequestAnalysis => ({
  needsClarification: false,
  clarificationMode: "none",
  sceneType,
  followUpIntro: null,
  followUpQuestion: null,
  followUpMultiSelect: false,
  followUpOptions: null,
  classificationReason: "",
  missingCreativeLocks,
  decision: "plan",
  questionKey: null,
  questionPriorityReason: null,
});

const normalizeFollowUpQuestion = (value: string) => getDrawingAiFollowUpQuestionKey(value);

const hasSharedOpeningBeat = (value: string) =>
  /\b(both|together|same time|simultaneous|collide|collision|run into each other|rush in together|meet in the middle)\b/.test(
    value,
  );

const sanitizeFollowUpMemory = (followUpMemory: DrawingAiFollowUpMemoryItem[]) => {
  return normalizeDrawingAiFollowUpMemory(followUpMemory).map((item) => ({
    ...item,
    followUpOptions: sanitizeFollowUpOptions(item.followUpOptions ?? []),
    normalizedValues: sanitizeFollowUpOptions(item.normalizedValues ?? []),
  }));
};

const isClearlyUnusableGeneratePlansFollowUpAnswer = (value: string) => {
  const normalizedValue = normalizeGeneratePlansInput(value);
  if (!normalizedValue) {
    return true;
  }

  const unusableAnswers = new Set([
    "uh",
    "uhh",
    "uhhh",
    "umm",
    "ummm",
    "idk",
    "i dont know",
    "i do not know",
    "not sure",
    "maybe",
    "whatever",
    "anything",
    "something",
    "stuff",
    "...",
    "?",
  ]);

  return unusableAnswers.has(normalizedValue);
};

const shouldStopGeneratePlansQuestioningAfterAnswer = ({
  modelAnalysis,
  recentlyAnsweredQuestion,
  analysisInput,
}: {
  modelAnalysis: GeneratePlansModelAnalysis;
  recentlyAnsweredQuestion: string | null;
  analysisInput: string;
}) => {
  if (!recentlyAnsweredQuestion || modelAnalysis.decision !== "question") {
    return false;
  }

  const question = sanitizeModelGeneratedQuestion(modelAnalysis.question);
  const strongestSpecificQuestion = selectBestStorySpecificQuestionCandidate({
    analysisInput,
    highestPriorityGap: modelAnalysis.highestPriorityGap,
    recentlyAnsweredQuestion,
    allowGenericLastResort: false,
    modelAnalysis,
  });

  return Boolean(
    isGenericLastResortQuestion(question) ||
      soundsTemplateLikeQuestion(question) ||
      modelAnalysis.confidence < 0.45 ||
      questionAsksForAlreadyKnownFact({
        question,
        analysisInput,
        modelAnalysis,
      }) ||
      (!strongestSpecificQuestion && isBroadStoryQuestion(question)),
  );
};

export const resolveGeneratePlansFollowUpMemory = ({
  userMessage,
  followUpMemory = [],
  activeFollowUp = null,
  storyContext = "",
}: {
  userMessage: string;
  followUpMemory?: DrawingAiFollowUpMemoryItem[];
  activeFollowUp?: DrawingAiActiveFollowUp | null;
  storyContext?: string;
}) => {
  const resolvedMemory = sanitizeFollowUpMemory(followUpMemory);
  const answer = userMessage.trim();
  void storyContext;

  if (!activeFollowUp || !answer) {
    return {
      followUpMemory: resolvedMemory,
      parseSucceeded: true,
      normalizedValues: null as string[] | null,
    };
  }

  const question = activeFollowUp.question.trim();
  if (!question) {
    return {
      followUpMemory: resolvedMemory,
      parseSucceeded: true,
      normalizedValues: null as string[] | null,
    };
  }

  const normalizedQuestion = normalizeFollowUpQuestion(question);
  const options = sanitizeFollowUpOptions(activeFollowUp.followUpOptions ?? []);
  const existingQuestionIndex = resolvedMemory.findIndex(
    (item) => normalizeFollowUpQuestion(item.question) === normalizedQuestion,
  );
  const preservedMemory =
    existingQuestionIndex >= 0 ? resolvedMemory.slice(0, existingQuestionIndex) : resolvedMemory;

  if (isClearlyUnusableGeneratePlansFollowUpAnswer(answer)) {
    return {
      followUpMemory: preservedMemory,
      parseSucceeded: false,
      normalizedValues: null as string[] | null,
    };
  }

  return {
    followUpMemory: [
      ...preservedMemory,
      {
        question,
        answer,
        followUpMultiSelect: activeFollowUp.followUpMultiSelect === true,
        followUpOptions: options.length > 0 ? options : null,
        normalizedValues: null,
      },
    ],
    parseSucceeded: true,
    normalizedValues: null as string[] | null,
  };
};

const formatFollowUpMemory = (followUpMemory: DrawingAiFollowUpMemoryItem[]) =>
  followUpMemory
    .map((item) => `- ${item.question}\n  answer: ${item.answer}`)
    .join("\n");

const formatConversationHistory = (conversationHistory: DrawingAiConversationMessage[]) =>
  conversationHistory
    .map((message) => `${message.role === "assistant" ? "Assistant" : "User"}: ${message.content.trim()}`)
    .join("\n");

export const buildGeneratePlansAnalysisInput = ({
  userMessage,
  conversationHistory = [],
  followUpMemory = [],
}: {
  userMessage: string;
  conversationHistory?: DrawingAiConversationMessage[];
  followUpMemory?: DrawingAiFollowUpMemoryItem[];
}) =>
  [
    ...conversationHistory
      .filter((message) => message.role === "user")
      .map((message) => message.content.trim())
      .filter(Boolean),
    ...sanitizeFollowUpMemory(followUpMemory).map((item) => `${item.question}\n${item.answer}`),
    userMessage.trim(),
  ]
    .filter(Boolean)
    .join("\n");

const normalizeGeneratePlansModelSceneType = (
  value: string | null | undefined,
): GeneratePlansRequestAnalysis["sceneType"] => {
  if (
    value === "fight" ||
    value === "chase" ||
    value === "exploration" ||
    value === "discovery" ||
    value === "escape" ||
    value === "emotional" ||
    value === "comedy" ||
    value === "general" ||
    value === "unknown"
  ) {
    return value;
  }

  return "unknown";
};

const GENERIC_ENTITY_LABEL_PATTERNS = [
  /\bleft character\b/i,
  /\bright character\b/i,
  /\bother character\b/i,
  /\bleft figure\b/i,
  /\bright figure\b/i,
  /\bcharacter a\b/i,
  /\bcharacter b\b/i,
  /\bfirst figure\b/i,
  /\bsecond figure\b/i,
] as const;

const OPENING_QUESTION_PATTERNS = [
  /\bwho\b.*\b(start|starts|open|opens|attack|attacks|move first|moves first|go first|goes first)\b/i,
  /\bwhich\b.*\b(start|starts|open|opens|attack|attacks|move first|moves first|go first|goes first)\b/i,
] as const;

const WINNER_QUESTION_PATTERN = /\bwho\b.*\b(win|wins|won|winner)\b/i;
const COLLECTIVE_OPTION_PATTERN = /^(they|both|neither|no one|nobody|everyone)\b/i;
const INTERNAL_TEMPLATE_LANGUAGE_PATTERNS = [
  /\bfirst exchange\b/i,
  /\bopening exchange\b/i,
  /\bfill in first exchange\b/i,
  /\block the opening exchange\b/i,
] as const;
const FIGHT_STORY_SIGNAL_PATTERN =
  /\b(fight|fighting|fighter|fighters|duel|battle|combat|spar|sparring|opponent|versus|vs|against|punch|kick|attack|attacks|attacking|hit|hits|strikes?|wins?|won)\b/i;
const MULTI_FIGHTER_STORY_PATTERN =
  /\b(two|2|both)\s+(stick figures|fighters|characters|figures|people)\b|\bvs\b|\bversus\b|\bagainst\b/i;
const NON_FIGHT_PRIORITY_PATTERN =
  /\b(notice|notices|noticed|see|sees|saw|find|finds|found|discover|discovers|discovered|realize|realizes|realized|respond|responds|response|reveal|reveals|revealed|happen|happens|happened|change|changes|changed|reaction|reacts|reacting)\b/i;
const QUESTION_START_PATTERN = /^(who|what|where|when|why|how)\b/i;
const TEMPLATE_LIKE_QUESTION_PATTERNS = [
  /^what does (?:he|she|they) find\??$/i,
  /^what does (?:he|she|they) discover\??$/i,
  /^what does (?:he|she|they) notice\??$/i,
  /^what does (?:he|she|they) realize\??$/i,
  /^what causes (?:his|her|their) reaction\??$/i,
  /^what happens next\??$/i,
  /^what happens here\??$/i,
  /^what is the next key event\??$/i,
  /^before i lock .*who .*$/i,
  /^before i plan .*what .*$/i,
] as const;
const UNKNOWN_STORY_DETAIL_PATTERN = /\b(someone|somebody|something|anyone|anybody|anything|it|them|there)\b/i;
const GENERATE_PLANS_PLACE_STOP_WORDS = new Set([
  "empty",
  "middle",
  "next",
  "back",
  "front",
  "behind",
  "outside",
  "inside",
  "somewhere",
  "there",
  "here",
  "page",
  "shelf",
  "shelves",
  "project",
]);

const EMPTY_GENERATE_PLANS_KNOWN_STORY_ANCHORS: GeneratePlansKnownStoryAnchors = {
  knownObject: "",
  knownCharacters: [],
  knownPlace: "",
  knownTriggerAction: "",
  knownOutcomeResult: "",
  knownRevealPoint: "",
  knownNextBeat: "",
};

const normalizeGeneratePlansKnownStoryAnchors = (
  value: Partial<GeneratePlansKnownStoryAnchors> | null | undefined,
): GeneratePlansKnownStoryAnchors => ({
  knownObject: (value?.knownObject ?? "").trim(),
  knownCharacters: sanitizeFollowUpOptions(value?.knownCharacters ?? []),
  knownPlace: (value?.knownPlace ?? "").trim(),
  knownTriggerAction: (value?.knownTriggerAction ?? "").trim(),
  knownOutcomeResult: (value?.knownOutcomeResult ?? "").trim(),
  knownRevealPoint: (value?.knownRevealPoint ?? "").trim(),
  knownNextBeat: (value?.knownNextBeat ?? "").trim(),
});

const flattenGeneratePlansKnownStoryAnchors = (value: GeneratePlansKnownStoryAnchors) => [
  value.knownObject,
  ...value.knownCharacters,
  value.knownPlace,
  value.knownTriggerAction,
  value.knownOutcomeResult,
  value.knownRevealPoint,
  value.knownNextBeat,
].filter(Boolean);

const isGenericEntityLabel = (value: string) =>
  GENERIC_ENTITY_LABEL_PATTERNS.some((pattern) => pattern.test(value));

const hasSpecificStoryEntityLabels = (entityLabels: string[]) =>
  entityLabels.some((label) => !isGenericEntityLabel(label));

const containsGenericEntityLabel = (value: string) =>
  GENERIC_ENTITY_LABEL_PATTERNS.some((pattern) => pattern.test(value));

const extractActionStylesFromStoryFragment = (value: string) =>
  extractMentionedActionChoices(normalizeGeneratePlansInput(value));

const isOpeningQuestion = (value: string) =>
  OPENING_QUESTION_PATTERNS.some((pattern) => pattern.test(value));

const containsInternalTemplateLanguage = (value: string) =>
  INTERNAL_TEMPLATE_LANGUAGE_PATTERNS.some((pattern) => pattern.test(value));

const soundsTemplateLikeQuestion = (value: string) =>
  TEMPLATE_LIKE_QUESTION_PATTERNS.some((pattern) => pattern.test(value.trim()));

const GENERIC_FILLER_INTRO_PATTERNS = [
  /\bi understand the story so far\b/i,
  /\bi still need one missing detail before i can plan it well\b/i,
  /\bi just need one missing detail\b/i,
  /\bi just need the next key event\b/i,
] as const;

const GENERIC_LAST_RESORT_QUESTION_PATTERNS = [
  /^what happens next\??$/i,
  /^what beat should execute next\??$/i,
  /^what happens here\??$/i,
  /^what is the next key event\??$/i,
] as const;

type StorySpecificQuestionCandidate = {
  question: string;
  intro: string;
  specificityScore: number;
  isGenericLastResort?: boolean;
  gapPatterns?: RegExp[];
};

const sanitizeModelGeneratedQuestion = (value: string) => {
  const trimmedValue = value.trim();
  if (!trimmedValue) {
    return "";
  }

  if (/\bwho\b.*\b(open|opens)\b.*\b(first|opening)\s+exchange\b/i.test(trimmedValue)) {
    return "Who should act first in the executed fight?";
  }

  return trimmedValue.replace(/\s+/g, " ");
};

const sanitizeModelGeneratedIntro = (value: string) => {
  const trimmedValue = value.trim();
  if (
    !trimmedValue ||
    containsInternalTemplateLanguage(trimmedValue) ||
    GENERIC_FILLER_INTRO_PATTERNS.some((pattern) => pattern.test(trimmedValue))
  ) {
    return "";
  }

  return trimmedValue.replace(/\s+/g, " ");
};

const isGenericLastResortQuestion = (value: string) =>
  GENERIC_LAST_RESORT_QUESTION_PATTERNS.some((pattern) => pattern.test(value.trim()));

const normalizeGapForComparison = (value: string) =>
  normalizeGeneratePlansInput(value)
    .replace(/\b(the|a|an|detail|fact|gap|missing|need|needs|needed|lock|locked|in|this|scene|story)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const cleanKnownStoryDetail = (value: string | null | undefined) =>
  (value ?? "")
    .replace(/^(?:a|an|the|this|that|his|her|their|its)\s+/i, "")
    .replace(/\s+/g, " ")
    .trim();

const normalizeStoryAnchorValue = (value: string | null | undefined) =>
  cleanKnownStoryDetail(value)
    .replace(/\b(?:he|she|they|someone|somebody|something)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();

const sanitizeKnownStoryFactValues = (values: Array<string | null | undefined>) =>
  sanitizeFollowUpOptions(
    values
      .map((value) => normalizeStoryAnchorValue(value))
      .filter((value) => value.length > 0 && !UNKNOWN_STORY_DETAIL_PATTERN.test(value)),
  );

const buildKnownStoryFactCorpus = ({
  analysisInput,
  modelAnalysis,
}: {
  analysisInput: string;
  modelAnalysis: GeneratePlansModelAnalysis;
}) =>
  normalizeGeneratePlansInput(
    [
      analysisInput,
      modelAnalysis.storySummary,
      ...flattenGeneratePlansKnownStoryAnchors(
        normalizeGeneratePlansKnownStoryAnchors(modelAnalysis.knownStoryAnchors),
      ),
      ...(modelAnalysis.knownFacts ?? []),
    ]
      .filter(Boolean)
      .join("\n"),
  );

const extractKnownFoundObjectLabel = (knowledgeCorpus: string) => {
  const patterns = [
    /\b([a-z][\w'/-]*(?:\s+[a-z][\w'/-]*){0,4})\s+(?:he|she|they)\s+(?:just\s+|recently\s+)?(?:finds?|found|discovers?|discovered)\b/i,
    /\b(?:finds?|found|discovers?|discovered)\s+(?:a|an|the|this|that|his|her|their)\s+([a-z][\w'/-]*(?:\s+[a-z][\w'/-]*){0,4})\b/i,
  ] as const;

  for (const pattern of patterns) {
    const match = knowledgeCorpus.match(pattern);
    const candidate = cleanKnownStoryDetail(match?.[1]);
    if (candidate && !/\b(something|someone|anything|nothing|it|them|there)\b/i.test(candidate)) {
      return candidate;
    }
  }

  return null;
};

const extractKnownPlaceLabels = (knowledgeCorpus: string) => {
  const matches = Array.from(
    knowledgeCorpus.matchAll(
      /\b(?:in|inside|at)\s+(?:a|an|the)?\s*([a-z][\w'/-]*(?:\s+[a-z][\w'/-]*){0,4})\b/g,
    ),
  );

  return sanitizeKnownStoryFactValues(
    matches
      .map((match) => cleanKnownStoryDetail(match[1]))
      .filter((value) => {
        if (!value) {
          return false;
        }

        const tokens = value.split(/\s+/);
        const lastToken = tokens[tokens.length - 1] ?? "";
        return !GENERATE_PLANS_PLACE_STOP_WORDS.has(lastToken);
      }),
  );
};

const extractExplicitNamedActor = (knowledgeCorpus: string, actionPattern: RegExp) => {
  const match = knowledgeCorpus.match(actionPattern);
  const candidate = cleanKnownStoryDetail(match?.[1]);
  if (!candidate || UNKNOWN_STORY_DETAIL_PATTERN.test(candidate)) {
    return null;
  }

  return candidate;
};

const extractExplicitOutsideResponder = (knowledgeCorpus: string) => {
  const patterns = [
    /\b([a-z][\w'/-]*(?:\s+[a-z][\w'/-]*){0,3})\s+(?:responds?|reacts?)\s+outside\b/i,
    /\boutside,\s+([a-z][\w'/-]*(?:\s+[a-z][\w'/-]*){0,3})\s+(?:responds?|reacts?|answers?|calls?|howls?|barks?)\b/i,
  ] as const;

  for (const pattern of patterns) {
    const candidate = cleanKnownStoryDetail(knowledgeCorpus.match(pattern)?.[1]);
    if (candidate && !UNKNOWN_STORY_DETAIL_PATTERN.test(candidate)) {
      return candidate;
    }
  }

  return null;
};

const hasCompleteKnownStoryAnchors = (knownStoryAnchors: GeneratePlansKnownStoryAnchors | null | undefined) => {
  const normalizedAnchors = normalizeGeneratePlansKnownStoryAnchors(knownStoryAnchors);
  return (
    typeof normalizedAnchors.knownObject === "string" &&
    Array.isArray(normalizedAnchors.knownCharacters) &&
    typeof normalizedAnchors.knownPlace === "string" &&
    typeof normalizedAnchors.knownTriggerAction === "string" &&
    typeof normalizedAnchors.knownOutcomeResult === "string" &&
    typeof normalizedAnchors.knownRevealPoint === "string" &&
    typeof normalizedAnchors.knownNextBeat === "string"
  );
};

const buildKnownStoryFactProfile = ({
  analysisInput,
  modelAnalysis,
}: {
  analysisInput: string;
  modelAnalysis: GeneratePlansModelAnalysis;
}) => {
  const knownStoryAnchors = normalizeGeneratePlansKnownStoryAnchors(modelAnalysis.knownStoryAnchors);
  const knownFactCorpus = buildKnownStoryFactCorpus({
    analysisInput,
    modelAnalysis,
  });

  return {
    knownStoryAnchors,
    objectFacts: sanitizeKnownStoryFactValues([
      knownStoryAnchors.knownObject,
      extractKnownFoundObjectLabel(knownFactCorpus),
    ]),
    characterFacts: sanitizeKnownStoryFactValues([
      ...knownStoryAnchors.knownCharacters,
      ...extractEntityLabels(normalizeGeneratePlansInput(analysisInput)),
    ]),
    placeFacts: sanitizeKnownStoryFactValues([
      knownStoryAnchors.knownPlace,
      ...extractKnownPlaceLabels(knownFactCorpus),
    ]),
    callerFacts: sanitizeKnownStoryFactValues([
      extractExplicitNamedActor(
        knownFactCorpus,
        /\b([a-z][\w'/-]*(?:\s+[a-z][\w'/-]*){0,3})\s+calls?\s+(?:his|her|their)\s+name\b/i,
      ),
    ]),
    doorOpenerFacts: sanitizeKnownStoryFactValues([
      extractExplicitNamedActor(
        knownFactCorpus,
        /\b([a-z][\w'/-]*(?:\s+[a-z][\w'/-]*){0,3})\s+opens?\s+(?:the\s+)?(?:gym\s+)?door\b/i,
      ),
    ]),
    outsideResponderFacts: sanitizeKnownStoryFactValues([
      extractExplicitOutsideResponder(knownFactCorpus),
    ]),
    outcomeFacts: sanitizeKnownStoryFactValues([
      knownStoryAnchors.knownOutcomeResult,
      /\b(?:blue|red|green|yellow|orange|purple|pink|black|white|gray|grey|hero|villain|[a-z][\w'/-]*)\s+(?:wins?|won|beats?)\b/i.test(
        knownFactCorpus,
      )
        ? knownFactCorpus.match(
            /\b((?:blue|red|green|yellow|orange|purple|pink|black|white|gray|grey|hero|villain|[a-z][\w'/-]*)(?:\s+[a-z][\w'/-]*){0,2}\s+(?:wins?|won|beats?\s+[a-z][\w'/-]*(?:\s+[a-z][\w'/-]*){0,2}))\b/i,
          )?.[1] ?? ""
        : "",
    ]),
    revealFacts: sanitizeKnownStoryFactValues([
      knownStoryAnchors.knownRevealPoint,
    ]),
    nextBeatFacts: sanitizeKnownStoryFactValues([
      knownStoryAnchors.knownNextBeat,
      knownFactCorpus.match(
        /\b(?:then|next|after that|a moment later|moments later|suddenly)\s+([a-z][\w'/-]*(?:\s+[a-z][\w'/-]*){1,8})\b/i,
      )?.[1] ?? "",
    ]),
  };
};

const createSyntheticGeneratePlansModelAnalysis = ({
  highestPriorityGap = "",
}: {
  highestPriorityGap?: string;
} = {}): GeneratePlansModelAnalysis => ({
  decision: "question",
  sceneType: "general",
  response: "",
  storySummary: "",
  knownStoryAnchors: EMPTY_GENERATE_PLANS_KNOWN_STORY_ANCHORS,
  knownFacts: [],
  missingFacts: [],
  rankedMissingFacts: highestPriorityGap ? [highestPriorityGap] : [],
  highestPriorityGap,
  reasoningWhyThisGapMattersMost: "",
  question: "",
  options: [],
  typedOnly: true,
  confidence: 1,
});

const questionAsksForAlreadyKnownFact = ({
  question,
  analysisInput,
  modelAnalysis,
}: {
  question: string;
  analysisInput: string;
  modelAnalysis: GeneratePlansModelAnalysis;
}) => {
  const {
    objectFacts,
    placeFacts,
    callerFacts,
    doorOpenerFacts,
    outsideResponderFacts,
    outcomeFacts,
    nextBeatFacts,
  } = buildKnownStoryFactProfile({
    analysisInput,
    modelAnalysis,
  });

  if (
    /^(?:what|which)\b.*\b(find|discover)\b/i.test(question) &&
    objectFacts.length > 0
  ) {
    return `The request already locks the object: ${objectFacts[0]}.`;
  }

  if (/^where\b/i.test(question) && placeFacts.length > 0) {
    return `The request already locks the location: ${placeFacts[0]}.`;
  }

  if (/\bwho\b.*\bcalls?\b.*\bname\b/i.test(question) && callerFacts.length > 0) {
    return `The request already locks who calls his name: ${callerFacts[0]}.`;
  }

  if (/\bwho\b.*\bopens?\b.*\bdoor\b/i.test(question) && doorOpenerFacts.length > 0) {
    return `The request already locks who opens the door: ${doorOpenerFacts[0]}.`;
  }

  if (/\bwhat\b.*\bresponds?\b.*\boutside\b/i.test(question) && outsideResponderFacts.length > 0) {
    return `The request already locks what responds outside: ${outsideResponderFacts[0]}.`;
  }

  if (WINNER_QUESTION_PATTERN.test(question) && outcomeFacts.length > 0) {
    return `The request already locks the outcome: ${outcomeFacts[0]}.`;
  }

  if (isGenericLastResortQuestion(question) && nextBeatFacts.length > 0) {
    return `The request already includes the next beat: ${nextBeatFacts[0]}.`;
  }

  return null;
};

const buildKnownFactCheckQuestionFromGap = (highestPriorityGap: string) => {
  const normalizedGap = normalizeGapForComparison(highestPriorityGap);

  if (!normalizedGap) {
    return "";
  }

  if (QUESTION_START_PATTERN.test(highestPriorityGap.trim())) {
    return highestPriorityGap.trim();
  }

  if (/\bfind\b/.test(normalizedGap)) {
    return "What reveal should be executed when he finds it?";
  }

  if (/\bdiscover\b/.test(normalizedGap)) {
    return "What reveal should be executed when he discovers it?";
  }

  if (/\brespond\b/.test(normalizedGap) && /\boutside\b/.test(normalizedGap)) {
    return "What should respond outside when the beat executes?";
  }

  if (/\bwho\b/.test(normalizedGap) && /\bcalls?\b.*\bname\b/.test(normalizedGap)) {
    return "Who should call his name?";
  }

  return "";
};

const isBroadStoryQuestion = (value: string) =>
  [
    /^what does he find\??$/i,
    /^what reveal should be executed when he finds it\??$/i,
    /^what does he discover\??$/i,
    /^what reveal should be executed when he discovers it\??$/i,
    /^what does he notice\??$/i,
    /^what should be revealed when he notices it\??$/i,
    /^what does he realize\??$/i,
    /^what realization should be executed here\??$/i,
    /^what causes his reaction\??$/i,
  ].some((pattern) => pattern.test(value.trim()));

const hasCompleteStoryUnderstandingForQuestion = (modelAnalysis: GeneratePlansModelAnalysis) =>
  modelAnalysis.storySummary.trim().length > 0 &&
  hasCompleteKnownStoryAnchors(modelAnalysis.knownStoryAnchors) &&
  modelAnalysis.knownFacts.length > 0 &&
  modelAnalysis.missingFacts.length > 0 &&
  modelAnalysis.rankedMissingFacts.length > 0 &&
  modelAnalysis.highestPriorityGap.trim().length > 0 &&
  modelAnalysis.reasoningWhyThisGapMattersMost.trim().length > 0;

const questionMatchesHighestPriorityGap = (question: string, highestPriorityGap: string) => {
  const normalizedQuestion = normalizeGeneratePlansInput(question);
  const normalizedGap = normalizeGapForComparison(highestPriorityGap);

  if (!normalizedQuestion || !normalizedGap) {
    return true;
  }

  if (isOpeningQuestion(question)) {
    return /\b(open|opening|starts?|first attack|first hit|first punch|who attacks first)\b/.test(normalizedGap);
  }

  const questionTokens = new Set(
    normalizedQuestion
      .split(/\s+/)
      .filter((token) => token.length > 2 && !QUESTION_START_PATTERN.test(token)),
  );
  const gapTokens = normalizedGap.split(/\s+/).filter((token) => token.length > 2);

  if (gapTokens.some((token) => questionTokens.has(token))) {
    return true;
  }

  const semanticPairs: Array<[RegExp, RegExp]> = [
    [/\bnotice|notices|noticed|see|sees|saw\b/, /\bnotice|notices|noticed|see|sees|saw\b/],
    [/\brespond|responds|response|react|reacts|reaction\b/, /\brespond|responds|response|react|reacts|reaction\b/],
    [/\breveal|reveals|revealed\b/, /\breveal|reveals|revealed\b/],
    [/\bfind|finds|found|discover|discovers|discovered\b/, /\bfind|finds|found|discover|discovers|discovered\b/],
    [/\brealize|realizes|realized\b/, /\brealize|realizes|realized\b/],
    [/\bchoice|choose|chooses|chosen|decide|decides|decision\b/, /\bchoice|choose|chooses|chosen|decide|decides|decision\b/],
    [/\bhesitate|hesitates|hesitating|uncertain|unsure\b/, /\bhesitate|hesitates|hesitating|uncertain|unsure\b/],
    [/\binside|contents?|contains?\b/, /\binside|contents?|contains?\b/],
    [/\bwho\b.*\bwatch|standing\b/, /\bwho\b|\bidentity\b|\bwatch|standing\b/],
    [/\bwho\b.*\bcalls?\b.*\bname\b/, /\bcaller\b|\bidentity\b|\bcalls?\b.*\bname\b/],
    [/\bwho\b.*\bopens?\b.*\bdoor\b/, /\bdoor\b.*\bopen\b|\bopener\b|\bidentity\b/],
    [/\bnext page\b|\bturns?\b.*\bpage\b/, /\bnext page\b|\bpage\b|\bcontents?\b/],
    [/\bfreeze|freezes|frozen\b/, /\bfreeze|freezes|frozen\b|\bcause\b/],
    [/\bfamiliar\b/, /\bfamiliar\b|\bdrawing\b|\bsketch\b/],
    [/\bhappen|happens|happened\b/, /\bhappen|happens|happened\b/],
  ];

  return semanticPairs.some(
    ([questionPattern, gapPattern]) =>
      questionPattern.test(normalizedQuestion) && gapPattern.test(normalizedGap),
  );
};

const isStrongFightOpenerCase = ({
  modelAnalysis,
  normalizedStory,
  storyEntityLabels,
}: {
  modelAnalysis: GeneratePlansModelAnalysis;
  normalizedStory: string;
  storyEntityLabels: string[];
}) => {
  const highestPriorityGap = normalizeGapForComparison(modelAnalysis.highestPriorityGap);
  const rankedMissingFacts = (modelAnalysis.rankedMissingFacts ?? []).map(normalizeGapForComparison);
  const sceneType = normalizeGeneratePlansModelSceneType(modelAnalysis.sceneType);
  const openerIsKnown =
    hasExplicitOpeningOwner(normalizedStory, storyEntityLabels) || hasSharedOpeningBeat(normalizedStory);
  const hasFightSignals =
    sceneType === "fight" ||
    FIGHT_STORY_SIGNAL_PATTERN.test(normalizedStory) ||
    storyEntityLabels.length >= 2;
  const hasMultipleFighters =
    storyEntityLabels.length >= 2 || MULTI_FIGHTER_STORY_PATTERN.test(normalizedStory);
  const highestGapLooksLikeOpener =
    /\b(open|opening|starts?|first attack|first hit|first punch|who attacks first)\b/.test(highestPriorityGap);
  const strongerNonFightGapExists = rankedMissingFacts
    .slice(0, 2)
    .some((gap) => gap && gap !== highestPriorityGap && NON_FIGHT_PRIORITY_PATTERN.test(gap));

  return (
    hasFightSignals &&
    hasMultipleFighters &&
    !openerIsKnown &&
    highestGapLooksLikeOpener &&
    !strongerNonFightGapExists
  );
};

const selectBestStorySpecificQuestionCandidate = ({
  analysisInput,
  highestPriorityGap = "",
  recentlyAnsweredQuestion,
  allowGenericLastResort = true,
  modelAnalysis = null,
}: {
  analysisInput: string;
  highestPriorityGap?: string;
  recentlyAnsweredQuestion: string | null;
  allowGenericLastResort?: boolean;
  modelAnalysis?: GeneratePlansModelAnalysis | null;
}): StorySpecificQuestionCandidate | null => {
  const normalizedStory = normalizeGeneratePlansInput(analysisInput);
  const normalizedGap = normalizeGapForComparison(highestPriorityGap);
  const normalizedRecentQuestion = recentlyAnsweredQuestion
    ? normalizeFollowUpQuestion(recentlyAnsweredQuestion)
    : "";
  const storyActionStyles = new Set(extractActionStylesFromStoryFragment(normalizedStory));
  const modelAnalysisForComparison =
    modelAnalysis ?? createSyntheticGeneratePlansModelAnalysis({ highestPriorityGap });

  const candidates = [
    /\bnotebook\b/.test(normalizedStory) &&
    /\b(turns?|turned)\s+the\s+page\b|\bnext page\b|\bsuddenly freezes?\b/.test(normalizedStory)
      ? {
          question: "What reveal should be executed on the next page?",
          intro: "",
          specificityScore: 132,
          gapPatterns: [/\bnext page\b/, /\bturns?\b.*\bpage\b/, /\bfreeze|freezes|frozen\b/, /\bsee|saw\b/],
        }
      : null,
    /\benvelope\b/.test(normalizedStory)
      ? {
          question: "What content should be revealed from the envelope?",
          intro: "",
          specificityScore: 126,
          gapPatterns: [/\benvelope\b/, /\binside\b/, /\bcontents?\b/, /\bletter\b/, /\bmessage\b/],
        }
      : null,
    /\bfamiliar\b/.test(normalizedStory) && /\b(page|drawing|sketch)\b/.test(normalizedStory)
      ? {
          question: "Why should the drawing feel familiar in the executed beat?",
          intro: "",
          specificityScore: 124,
          gapPatterns: [/\bfamiliar\b/, /\bdrawing\b/, /\bpage\b/, /\bwhy\b/],
        }
      : null,
    /\bbag\b/.test(normalizedStory) && /\b(reaches? into|reach into|pulls? out|takes? out)\b/.test(normalizedStory)
      ? {
          question: "What item should be revealed from the bag?",
          intro: "",
          specificityScore: 120,
          gapPatterns: [/\bbag\b/, /\bpull\b/, /\btake out\b/, /\bitem\b/, /\bobject\b/],
        }
      : null,
    /\b(make|makes|made)\s+a\s+choice\b|\bdecides?\b/.test(normalizedStory)
      ? {
          question: "What choice should be executed for him?",
          intro: "",
          specificityScore: 118,
          gapPatterns: [/\bchoice\b/, /\bdecide\b/, /\bdecision\b/, /\bchoose\b/],
        }
      : null,
    /\bcalls?\s+his\s+name\b/.test(normalizedStory) && /\bbehind the shelves\b/.test(normalizedStory)
      ? {
          question: "Who should call his name from behind the shelves?",
          intro: "",
          specificityScore: 117,
          gapPatterns: [/\bcalls?\s+his\s+name\b/, /\bbehind the shelves\b/, /\bwho\b/],
        }
      : null,
    /\bproject\b/.test(normalizedStory) && /\b(adds?|added|placing|puts?)\b/.test(normalizedStory)
      ? {
          question: "What addition should be executed on the project?",
          intro: "",
          specificityScore: 115,
          gapPatterns: [/\bproject\b/, /\badd\b/, /\bdetail\b/, /\bitem\b/, /\bobject\b/],
        }
      : null,
    /\bsomeone\b.*\bedge of the court\b|\bedge of the court\b.*\bsomeone\b/.test(normalizedStory)
      ? {
          question: "Which character should be revealed at the edge of the court?",
          intro: "",
          specificityScore: 112,
          gapPatterns: [/\bedge of the court\b/, /\bwho\b/, /\bsomeone\b/, /\bwatch/i],
        }
      : null,
    /\bfootsteps?\b/.test(normalizedStory) && /\bhallway\b/.test(normalizedStory) && /\bclassroom\b/.test(normalizedStory)
      ? {
          question: "Which character should approach the classroom?",
          intro: "",
          specificityScore: 110,
          gapPatterns: [/\bfootsteps?\b/, /\bhallway\b/, /\bclassroom\b/, /\bwho\b/, /\barriv/i],
        }
      : null,
    /\bfreeze|freezes|frozen\b/.test(normalizedStory)
      ? {
          question: "What trigger should freeze him in the executed beat?",
          intro: "",
          specificityScore: 111,
          gapPatterns: [/\bfreeze|freezes|frozen\b/, /\bwhy\b/, /\bcause\b/, /\brealize\b/],
        }
      : null,
    /\bhesitate|hesitates|hesitating|unsure|uncertain\b/.test(normalizedStory) ||
    (/\bstops?\b/.test(normalizedStory) && /\bbefore\b/.test(normalizedStory))
      ? {
          question: "Why should he hesitate in the executed beat?",
          intro: "",
          specificityScore: 109,
          gapPatterns: [/\bhesitate\b/, /\bunsure\b/, /\buncertain\b/, /\bwhy\b/],
        }
      : null,
    /\bnotice|notices|noticed\b/.test(normalizedStory) && /\bsketch|drawing\b/.test(normalizedStory)
      ? {
          question: "What should be revealed on the sketch?",
          intro: "",
          specificityScore: 108,
          gapPatterns: [/\bnotice\b/, /\bsketch\b/, /\bdrawing\b/],
        }
      : null,
    /\bsomeone\b/.test(normalizedStory) && /\bwatch|watching|watched\b/.test(normalizedStory)
      ? {
          question: "Who should be revealed watching him?",
          intro: "",
          specificityScore: 107,
          gapPatterns: [/\bwho\b/, /\bsomeone\b/, /\bwatch/i],
        }
      : null,
    /\brespond|responds|response|react|reacts|reaction\b/.test(normalizedStory) && /\boutside\b/.test(normalizedStory)
      ? {
          question: "What should respond outside when the beat executes?",
          intro: "",
          specificityScore: 105,
          gapPatterns: [/\brespond\b/, /\boutside\b/, /\bwhat\b/],
        }
      : null,
    /\bexpression changes?\b|\bsurprised\b|\bstartled\b/.test(normalizedStory)
      ? {
          question: "What trigger should execute his reaction?",
          intro: "",
          specificityScore: 104,
          gapPatterns: [/\breaction\b/, /\bcause\b/, /\bsurprised\b/, /\bexpression\b/],
        }
      : null,
    /\bgym\b/.test(normalizedStory) && /\bdoor\b/.test(normalizedStory) && /\b(open|opens|opening)\b/.test(normalizedStory)
      ? {
          question: "Who should execute the gym-door opening?",
          intro: "",
          specificityScore: 102,
          gapPatterns: [/\bgym\b/, /\bdoor\b/, /\bwho\b/, /\bopen\b/],
        }
      : null,
    /\b(adds?|added|attach(?:es|ed)?|insert(?:s|ed)?|places?)\b/.test(normalizedStory)
      ? {
          question: "What addition should be executed?",
          intro: "",
          specificityScore: 92,
          gapPatterns: [/\badd\b/, /\battach\b/, /\binsert\b/, /\bplace\b/, /\bwhat\b/],
        }
      : null,
    /\bdoor\b/.test(normalizedStory) && /\b(open|opens|opening)\b/.test(normalizedStory)
      ? {
          question: "Who should execute the door-open beat?",
          intro: "",
          specificityScore: 96,
          gapPatterns: [/\bdoor\b/, /\bwho\b/, /\bopen\b/],
        }
      : null,
    /\bnotice|notices|noticed|see|sees|saw\b/.test(normalizedStory)
      ? {
          question: "What should be revealed when he notices it?",
          intro: "",
          specificityScore: 74,
          gapPatterns: [/\bnotice\b/, /\bsee\b/, /\bwhat\b/],
        }
      : null,
    allowGenericLastResort && /\bthen\b|\bafter\b|\bnext\b|\bsuddenly\b|\bhears\b|\bresponds\b|\bopens\b/.test(normalizedStory)
      ? {
          question: "What final result should this sequence land on?",
          intro: "",
          specificityScore: 1,
          isGenericLastResort: true,
          gapPatterns: [/\bnext\b/, /\bhappen\b/],
        }
      : null,
  ].flatMap((candidate) => (candidate ? [candidate] : []));

  const validCandidates = candidates
    .filter((candidate) => normalizeFollowUpQuestion(candidate.question) !== normalizedRecentQuestion)
    .filter((candidate) => !containsInternalTemplateLanguage(candidate.question))
    .filter((candidate) => !containsGenericEntityLabel(candidate.question))
    .filter(
      (candidate) =>
        !questionAsksForAlreadyKnownFact({
          question: candidate.question,
          analysisInput,
          modelAnalysis: modelAnalysisForComparison,
        }),
    )
    .filter(
      (candidate) =>
        !extractActionStylesFromStoryFragment(candidate.question).some((style) => !storyActionStyles.has(style)),
    )
    .map((candidate) => {
      const gapMatchBonus =
        normalizedGap.length > 0 &&
        (questionMatchesHighestPriorityGap(candidate.question, highestPriorityGap) ||
          candidate.gapPatterns?.some((pattern) => pattern.test(normalizedGap)))
          ? 1000
          : 0;

      return {
        ...candidate,
        rankScore: candidate.specificityScore + gapMatchBonus,
      };
    })
    .sort((left, right) => right.rankScore - left.rankScore);

  const specificCandidate = validCandidates.find((candidate) => candidate.isGenericLastResort !== true);
  if (specificCandidate) {
    return specificCandidate;
  }

  return allowGenericLastResort ? (validCandidates[0] ?? null) : null;
};

const buildTypedOnlyQuestionFromHighestPriorityGap = ({
  modelAnalysis,
  analysisInput,
}: {
  modelAnalysis: GeneratePlansModelAnalysis;
  analysisInput: string;
}) => {
  const normalizedStory = normalizeGeneratePlansInput(analysisInput);
  const storyEntityLabels = extractEntityLabels(normalizedStory);
  const sanitizedQuestion = sanitizeModelGeneratedQuestion(modelAnalysis.question);
  const bestSpecificCandidate = selectBestStorySpecificQuestionCandidate({
    analysisInput,
    highestPriorityGap: modelAnalysis.highestPriorityGap,
    recentlyAnsweredQuestion: null,
    allowGenericLastResort: false,
    modelAnalysis,
  });

  if (bestSpecificCandidate) {
    return bestSpecificCandidate.question;
  }

  if (
    sanitizedQuestion &&
    !containsInternalTemplateLanguage(sanitizedQuestion) &&
    !soundsTemplateLikeQuestion(sanitizedQuestion) &&
    !containsGenericEntityLabel(sanitizedQuestion) &&
    questionMatchesHighestPriorityGap(sanitizedQuestion, modelAnalysis.highestPriorityGap) &&
    !questionAsksForAlreadyKnownFact({
      question: sanitizedQuestion,
      analysisInput,
      modelAnalysis,
    }) &&
    (!isOpeningQuestion(sanitizedQuestion) ||
      isStrongFightOpenerCase({
        modelAnalysis,
        normalizedStory,
        storyEntityLabels,
      }))
  ) {
    return sanitizedQuestion;
  }

  const normalizedGap = normalizeGapForComparison(modelAnalysis.highestPriorityGap);
  if (
    /\b(open|opening|starts?|first attack|first hit|first punch|who attacks first)\b/.test(normalizedGap) &&
    isStrongFightOpenerCase({
      modelAnalysis,
      normalizedStory,
      storyEntityLabels,
    })
  ) {
    return "Who should act first in the executed fight?";
  }

  if (/\bnotice|notices|noticed\b/.test(normalizedGap) && /\bsketch|drawing\b/.test(normalizedStory)) {
    return "What should be revealed on the sketch?";
  }

  if (/\bnotice|notices|noticed|see|sees|saw\b/.test(normalizedGap)) {
    return "What should be revealed when he notices it?";
  }

  if (/\brespond|responds|response|react|reacts|reaction\b/.test(normalizedGap) && /\boutside\b/.test(normalizedStory)) {
    return "What should respond outside when the beat executes?";
  }

  if (/\brespond|responds|response|react|reacts|reaction\b/.test(normalizedGap)) {
    return "What should respond when this beat executes?";
  }

  if (/\breveal|reveals|revealed\b/.test(normalizedGap)) {
    return "What reveal should be executed here?";
  }

  if (/\bfind|finds|found|discover|discovers|discovered\b/.test(normalizedGap)) {
    if (
      !questionAsksForAlreadyKnownFact({
        question: "What reveal should be executed when he finds it?",
        analysisInput,
        modelAnalysis,
      })
    ) {
      return "What reveal should be executed when he finds it?";
    }
  }

  if (/\brealize|realizes|realized\b/.test(normalizedGap)) {
    return "What realization should be executed here?";
  }

  if (QUESTION_START_PATTERN.test(modelAnalysis.highestPriorityGap.trim())) {
    const trimmedGap = modelAnalysis.highestPriorityGap.trim();
    const naturalQuestion = trimmedGap.endsWith("?") ? trimmedGap : `${trimmedGap}?`;
    if (
      !soundsTemplateLikeQuestion(naturalQuestion) &&
      !questionAsksForAlreadyKnownFact({
        question: naturalQuestion,
        analysisInput,
        modelAnalysis,
      })
    ) {
      return naturalQuestion;
    }
  }

  if (normalizedGap) {
    if (/\bcaller|identity\b/.test(normalizedGap) && /\bbehind the shelves\b/.test(normalizedStory)) {
      return "Who should call his name from behind the shelves?";
    }

    if (/\bfreeze|freezes|frozen\b/.test(normalizedGap)) {
      return "What trigger should freeze him in the executed beat?";
    }

    if (/\bfamiliar\b/.test(normalizedGap) && /\bdrawing|page|sketch\b/.test(normalizedStory)) {
      return "Why should the drawing feel familiar in the executed beat?";
    }

    if (/\bnext page\b/.test(normalizedGap)) {
      return "What reveal should be executed on the next page?";
    }

    if (/\brespond|response|react\b/.test(normalizedGap) && /\boutside\b/.test(normalizedGap)) {
      return "What should respond outside when the beat executes?";
    }
  }

  return "What final result should this sequence land on?";
};

const buildSafeGeneratePlansFallbackQuestion = ({
  analysisInput,
  recentlyAnsweredQuestion,
}: {
  analysisInput: string;
  recentlyAnsweredQuestion: string | null;
}) => {
  return (
    selectBestStorySpecificQuestionCandidate({
      analysisInput,
      recentlyAnsweredQuestion,
      allowGenericLastResort: true,
      modelAnalysis: null,
    })?.question ?? null
  );
};

const buildSafeGeneratePlansFallbackIntro = (question: string) => {
  void question;
  return "";
};

const createSafeGeneratePlansFailureFallback = ({
  analysisInput,
  recentlyAnsweredQuestion,
}: {
  analysisInput: string;
  recentlyAnsweredQuestion: string | null;
}): {
  analysis: GeneratePlansRequestAnalysis;
  fallbackType: "typed-question" | "message";
} => {
  const fallbackQuestion = buildSafeGeneratePlansFallbackQuestion({
    analysisInput,
    recentlyAnsweredQuestion,
  });

  if (fallbackQuestion) {
    return {
      analysis: withSceneType(
        createGeneratePlansFollowUp({
          intro: buildSafeGeneratePlansFallbackIntro(fallbackQuestion),
          question: fallbackQuestion,
          options: null,
          multiSelect: false,
          missingCreativeLocks: [],
          questionPriorityReason: "safe degraded fallback from execution-grounded missing detail",
        }),
        "general",
        "safe degraded fallback from execution-grounded missing detail",
      ),
      fallbackType: "typed-question",
    };
  }

  return {
    analysis: withSceneType(
      createGeneratePlansFollowUp({
        intro: "",
        question: "What final result should this sequence land on?",
        options: null,
        multiSelect: false,
        missingCreativeLocks: ["Final result"],
        questionPriorityReason: "safe degraded fallback from missing final result lock",
      }),
      "general",
      "safe degraded fallback from missing final result lock",
    ),
    fallbackType: "typed-question",
  };
};

const logGeneratePlansStructuredDecision = ({
  structuredAttempted,
  structuredRetryUsed,
  structuredRawOutputPreview,
  structuredParseRecovered,
  degradedFallbackUsed,
  degradedFallbackType,
  legacyAnalyzerBlocked,
  reason,
}: GeneratePlansStructuredDecisionLog) => {
  console.info("Generate Plans structured decision.", {
    structuredAttempted,
    structuredRetryUsed,
    structuredRawOutputPreview,
    structuredParseRecovered,
    degradedFallbackUsed,
    degradedFallbackType,
    legacyAnalyzerBlocked,
    reason,
  });
};

const getStructuredGenerationMetadataFromError = (
  error: unknown,
): Pick<GenerateAiObjectMetadata, "retryUsed" | "parseRecovered" | "rawOutputPreview"> => {
  if (typeof error !== "object" || error === null) {
    return {
      retryUsed: false,
      parseRecovered: false,
      rawOutputPreview: "",
    };
  }

  const retryUsed = "retryUsed" in error && typeof error.retryUsed === "boolean" ? error.retryUsed : false;
  const parseRecovered =
    "parseRecovered" in error && typeof error.parseRecovered === "boolean" ? error.parseRecovered : false;
  const rawOutputPreview =
    "rawOutputPreview" in error && typeof error.rawOutputPreview === "string" ? error.rawOutputPreview : "";

  return {
    retryUsed,
    parseRecovered,
    rawOutputPreview,
  };
};

const optionAnswersWhoQuestion = (option: string, storyEntityLabels: string[]) => {
  const normalizedOption = normalizeGeneratePlansInput(option);
  if (COLLECTIVE_OPTION_PATTERN.test(option.trim())) {
    return true;
  }

  return storyEntityLabels.some((label) =>
    normalizedOption.includes(normalizeGeneratePlansInput(label)),
  );
};

const buildGeneratePlansModelAnalysisPrompt = ({
  analysisInput,
  userMessage,
  followUpMemory,
  recentlyAnsweredQuestion,
  trainingExamples = [],
  validationFeedback = [],
}: {
  analysisInput: string;
  userMessage: string;
  followUpMemory: DrawingAiFollowUpMemoryItem[];
  recentlyAnsweredQuestion: string | null;
  trainingExamples?: GeneratePlansExample[];
  validationFeedback?: string[];
}) =>
  (() => {
    const normalizedPlanningContext = analysisInput
      .trim()
      .replace(/\bstory ideas\b/gi, "direction options")
      .replace(/\bstory improvement\b/gi, "execution upgrade")
      .replace(/\bstory direction\b/gi, "execution direction")
      .replace(/\bstory path\b/gi, "sequence path")
      .replace(/\bcurrent story\b/gi, "current sequence")
      .replace(/\bstory\b/gi, "sequence");
    const behaviorSignals = inferGeneratePlansBehaviorSignals({
      userMessage,
      followUpMemory,
      analysisInput,
    });

    return [
    "Planning context (source only, not output tone):",
    normalizedPlanningContext || "(empty)",
    "",
    "Latest user message:",
    userMessage.trim() || "(empty)",
    "",
    "Locked planning details:",
    followUpMemory.length > 0 ? formatFollowUpMemory(followUpMemory) : "(none)",
    "",
    `Locked planning detail count: ${followUpMemory.length}`,
    "",
    "Most recently answered question:",
    recentlyAnsweredQuestion?.trim() || "(none)",
    "",
    "Behavior signals for this request:",
    `Scale: ${behaviorSignals.responseScale}`,
    `Improve mode: ${behaviorSignals.improveMode ? "yes" : "no"}`,
    `Messy input: ${behaviorSignals.messyInput ? "yes" : "no"}`,
    `Preserve identity: ${behaviorSignals.preserveIdentity ? "yes" : "no"}`,
    `Likely unclear without context: ${behaviorSignals.likelyUnclear ? "yes" : "no"}`,
    "",
    "Planning target:",
    "Return an execution-ready JSON command plan that can hand off directly into later engine execution.",
    'Final output shape when ready to plan: {"commands":[{"type":"...","target":"...","parameters":{...}}]}.',
    "Never replace the user's intended sequence just because the wording is vague.",
    "If the request is simple, prefer one clean command chain over option-spam.",
    "If the request is exploratory, choose one strongest direction and convert it into commands instead of returning multiple prose options.",
    "If the request is unclear, ask one smart execution-lock question only.",
    ...(trainingExamples.length > 0
      ? [
          "",
          "Relevant Generate Plans training examples:",
          formatGeneratePlansExamplesForPrompt(trainingExamples),
        ]
      : []),
    ...(validationFeedback.length > 0
      ? [
          "",
          "Previous draft failed validation. Fix these exact issues:",
          ...validationFeedback.map((reason) => `- ${reason}`),
        ]
      : []),
    ].join("\n");
  })();

const validateGeneratePlansQuestionCard = ({
  modelAnalysis,
  recentlyAnsweredQuestion,
}: {
  modelAnalysis: GeneratePlansModelAnalysis;
  recentlyAnsweredQuestion: string | null;
}): GeneratePlansQuestionCardValidationResult => {
  if (modelAnalysis.decision !== "question") {
    return {
      isValid: true,
      failureReasons: [],
      canRepairToTypedOnly: false,
    };
  }

  const failureReasons: string[] = [];
  const question = sanitizeModelGeneratedQuestion(modelAnalysis.question);
  const typedOnly = modelAnalysis.typedOnly === true;
  const options = sanitizeFollowUpOptions(modelAnalysis.options ?? []);
  const normalizedRecentQuestion = recentlyAnsweredQuestion
    ? normalizeFollowUpQuestion(recentlyAnsweredQuestion)
    : "";
  const normalizedQuestion = normalizeGeneratePlansInput(question);

  if (!question) {
    failureReasons.push("The question is empty.");
  }

  if (containsInternalTemplateLanguage(question) || containsInternalTemplateLanguage(modelAnalysis.response)) {
    failureReasons.push("The question card uses internal template language instead of natural phrasing.");
  }

  if (soundsTemplateLikeQuestion(question)) {
    failureReasons.push("The question sounds scripted instead of like a natural plan-specific follow-up.");
  }

  if (question.split(/[.?!]+/).filter(Boolean).length > 1 || question.trim().split(/\s+/).length > 18) {
    failureReasons.push("The question is too long or multi-part. Keep it to one short natural line.");
  }

  if (normalizedQuestion.length > 0 && normalizedQuestion === normalizedRecentQuestion) {
    failureReasons.push("The question repeats the most recently answered question.");
  }

  if (!typedOnly) {
    failureReasons.push("Generate Plans questions must stay typed-only.");
  }

  if (options.length > 0) {
    failureReasons.push("Generate Plans questions must not include follow-up options.");
  }

  return {
    isValid: failureReasons.length === 0,
    failureReasons,
    canRepairToTypedOnly: false,
  };
};

const repairWeakGeneratePlansQuestionCard = ({
  modelAnalysis,
  validationResult,
}: {
  modelAnalysis: GeneratePlansModelAnalysis;
  validationResult: GeneratePlansQuestionCardValidationResult;
}): GeneratePlansRequestAnalysis => {
  void validationResult;
  return withSceneType(
    createGeneratePlansFollowUp({
      intro: "",
      question: sanitizeModelGeneratedQuestion(modelAnalysis.question) || "What final result should this sequence land on?",
      options: null,
      multiSelect: false,
      missingCreativeLocks: modelAnalysis.highestPriorityGap.trim() ? [modelAnalysis.highestPriorityGap.trim()] : [],
      questionPriorityReason: modelAnalysis.reasoningWhyThisGapMattersMost.trim() || "repair weak question card to one lock-setting question",
    }),
    normalizeGeneratePlansModelSceneType(modelAnalysis.sceneType),
    modelAnalysis.reasoningWhyThisGapMattersMost.trim(),
  );
};

const mapGeneratePlansModelAnalysisToRequestAnalysis = ({
  modelAnalysis,
  recentlyAnsweredQuestion,
  analysisInput,
}: {
  modelAnalysis: GeneratePlansModelAnalysis;
  recentlyAnsweredQuestion: string | null;
  analysisInput: string;
}): GeneratePlansRequestAnalysis => {
  const sceneType = normalizeGeneratePlansModelSceneType(modelAnalysis.sceneType);
  const sanitizedQuestion = sanitizeModelGeneratedQuestion(modelAnalysis.question);
  const question = sanitizedQuestion || null;
  const normalizedRecentQuestion = recentlyAnsweredQuestion
    ? normalizeFollowUpQuestion(recentlyAnsweredQuestion)
    : "";
  const normalizedReturnedQuestion = question ? normalizeFollowUpQuestion(question) : "";
  const missingCreativeLocks = modelAnalysis.highestPriorityGap.trim()
    ? [modelAnalysis.highestPriorityGap.trim()]
    : [];
  const reasoning = modelAnalysis.reasoningWhyThisGapMattersMost.trim();
  void analysisInput;

  if (
    modelAnalysis.decision === "question" &&
    question &&
    normalizedReturnedQuestion.length > 0 &&
    normalizedReturnedQuestion !== normalizedRecentQuestion
  ) {
    return withSceneType(
      createGeneratePlansFollowUp({
        intro: "",
        question,
        options: null,
        multiSelect: false,
        missingCreativeLocks,
        questionPriorityReason: reasoning || "model-selected missing planning detail",
      }),
      sceneType,
      reasoning,
    );
  }

  if (modelAnalysis.decision === "message") {
    return withSceneType(
      createGeneratePlansFollowUp({
        intro: "",
        question: question || "What final result should this sequence land on?",
        options: null,
        multiSelect: false,
        missingCreativeLocks,
        questionPriorityReason: reasoning || "convert non-plan clarification into one lock-setting question",
      }),
      sceneType,
      reasoning,
    );
  }

  return withSceneType(
    createGeneratePlansReadyToPlan({
      sceneType,
      missingCreativeLocks,
    }),
    sceneType,
    reasoning,
  );
};

export const analyzeGeneratePlansRequest = async ({
  analysisInput,
  userMessage = "",
  followUpMemory = [],
  recentlyAnsweredQuestion = null,
  reasoningEffort = "medium",
  trainingExamples = [],
}: AnalyzeGeneratePlansRequestInput): Promise<GeneratePlansRequestAnalysis> => {
  const trimmedAnalysisInput = analysisInput.trim();
  const resolvedFollowUpMemory = sanitizeFollowUpMemory(followUpMemory);
  const behaviorSignals = inferGeneratePlansBehaviorSignals({
    userMessage,
    followUpMemory: resolvedFollowUpMemory,
    analysisInput: trimmedAnalysisInput,
  });
  if (!trimmedAnalysisInput) {
    return withGeneratePlansBehaviorSignals(
      createGeneratePlansClarificationMessage({
        sceneType: "unknown",
      }),
      behaviorSignals,
    );
  }

  if (
    shouldAutoPlanGeneratePlansRequest({
      normalized: behaviorSignals.normalized,
      hasContextToPreserve: behaviorSignals.hasContextToPreserve,
    })
  ) {
    const sceneType = inferGeneratePlansAutoSceneType(behaviorSignals.normalized);
    return withGeneratePlansBehaviorSignals(
      withSceneType(
        createGeneratePlansReadyToPlan({
          sceneType,
        }),
        sceneType,
        "obvious scene setup is already strong enough for immediate planning",
      ),
      behaviorSignals,
    );
  }

  if (behaviorSignals.heuristicQuestion) {
    return withGeneratePlansBehaviorSignals(
      withSceneType(
        createGeneratePlansFollowUp({
          intro: "",
          question: behaviorSignals.heuristicQuestion,
          options: behaviorSignals.heuristicOptions,
          multiSelect: false,
          missingCreativeLocks: [behaviorSignals.heuristicQuestion],
          questionPriorityReason: "short unclear prompt needs one high-value direction-setting question",
        }),
        "general",
        "behavior-signals heuristic selected a single clarifying question",
      ),
      behaviorSignals,
    );
  }

  let latestStructuredMetadata: GenerateAiObjectMetadata | null = null;
  try {
    const requestModelAnalysis = async (validationFeedback: string[] = []) => {
      const result = await generateAiObject<GeneratePlansModelAnalysis>({
        prompt: buildGeneratePlansModelAnalysisPrompt({
          analysisInput: trimmedAnalysisInput,
          userMessage,
          followUpMemory: resolvedFollowUpMemory,
          recentlyAnsweredQuestion,
          trainingExamples,
          validationFeedback,
        }),
        instructions: GENERATE_PLANS_MODEL_ANALYSIS_INSTRUCTIONS,
        reasoningEffort,
        maxOutputTokens: 420,
        schemaName: "generate_plans_follow_up_analysis",
        schema: GENERATE_PLANS_MODEL_ANALYSIS_SCHEMA,
      });

      latestStructuredMetadata = latestStructuredMetadata
        ? {
            retryUsed: latestStructuredMetadata.retryUsed || result.metadata.retryUsed,
            parseRecovered: latestStructuredMetadata.parseRecovered || result.metadata.parseRecovered,
            rawOutputPreview: result.metadata.rawOutputPreview || latestStructuredMetadata.rawOutputPreview,
          }
        : result.metadata;

      return result.value;
    };

    let modelAnalysis = await requestModelAnalysis();
    let validationResult = validateGeneratePlansQuestionCard({
      modelAnalysis,
      recentlyAnsweredQuestion,
    });

    if (!validationResult.isValid) {
      modelAnalysis = await requestModelAnalysis(validationResult.failureReasons);
      validationResult = validateGeneratePlansQuestionCard({
        modelAnalysis,
        recentlyAnsweredQuestion,
      });

      if (!validationResult.isValid) {
        const repairedAnalysis = repairWeakGeneratePlansQuestionCard({
          modelAnalysis,
          validationResult,
        });
        const structuredMetadata = latestStructuredMetadata ?? {
          retryUsed: false,
          parseRecovered: false,
          rawOutputPreview: "",
        };

        logGeneratePlansStructuredDecision({
          structuredAttempted: true,
          structuredRetryUsed: structuredMetadata.retryUsed,
          structuredRawOutputPreview: structuredMetadata.rawOutputPreview,
          structuredParseRecovered: structuredMetadata.parseRecovered,
          degradedFallbackUsed: true,
          degradedFallbackType: repairedAnalysis.clarificationMode === "question-box" ? "typed-question" : "message",
          legacyAnalyzerBlocked: false,
          reason: "structured output was valid JSON but failed question-card validation after retry",
        });

        return withGeneratePlansBehaviorSignals(repairedAnalysis, behaviorSignals);
      }
    }

    const mappedAnalysis = withGeneratePlansBehaviorSignals(
      mapGeneratePlansModelAnalysisToRequestAnalysis({
        modelAnalysis,
        recentlyAnsweredQuestion,
        analysisInput: trimmedAnalysisInput,
      }),
      behaviorSignals,
    );
    const structuredMetadata = latestStructuredMetadata ?? {
      retryUsed: false,
      parseRecovered: false,
      rawOutputPreview: "",
    };

    logGeneratePlansStructuredDecision({
      structuredAttempted: true,
      structuredRetryUsed: structuredMetadata.retryUsed,
      structuredRawOutputPreview: structuredMetadata.rawOutputPreview,
      structuredParseRecovered: structuredMetadata.parseRecovered,
      degradedFallbackUsed: false,
      degradedFallbackType: "none",
      legacyAnalyzerBlocked: false,
      reason: "structured analysis selected the final UI response",
    });

    return mappedAnalysis;
  } catch (error) {
    const errorMetadata = getStructuredGenerationMetadataFromError(error);
    const fallback = withGeneratePlansBehaviorSignals(
      createGeneratePlansClarificationMessage({
        message: UNCLEAR_GENERATE_PLANS_MESSAGE,
        sceneType: "general",
      }),
      behaviorSignals,
    );
    const structuredMetadata = latestStructuredMetadata ?? errorMetadata;

    console.warn("Generate Plans structured analysis failed. Blocking legacy analyzer fallback.", error);
    logGeneratePlansStructuredDecision({
      structuredAttempted: true,
      structuredRetryUsed: structuredMetadata.retryUsed,
      structuredRawOutputPreview: structuredMetadata.rawOutputPreview ?? "",
      structuredParseRecovered: structuredMetadata.parseRecovered,
      degradedFallbackUsed: true,
      degradedFallbackType: "message",
      legacyAnalyzerBlocked: true,
      reason: error instanceof Error ? error.message : "structured analysis failed",
    });

    return fallback;
  }
};

export const buildGeneratePlansFollowUpReply = (analysis: GeneratePlansRequestAnalysis) =>
  analysis.clarificationMode === "message"
    ? analysis.followUpIntro?.trim() || UNCLEAR_GENERATE_PLANS_MESSAGE
    : analysis.followUpIntro?.trim() ?? "";

const stripGeneratePlansHandoffLine = (value: string) =>
  value
    .replace(
      /\n*\s*If this plan looks good, switch to Generate Frames (?:so the execution layer can build it|and I'll start building it)\.\s*$/i,
      "",
    )
    .trim();

const looksLikeGeneratePlansStoryOptionsOutput = (value: string) =>
  /(^|\n)\s*(Execution Direction Option\s*[1-4]|Recommended Execution Direction|Direction Option\s*[1-4]|Recommended Direction|Story Option\s*[1-4]|Recommended Story):/i.test(
    value,
  );

const PLAN_SECTION_LABELS = ["Execution target", "Sequence start", "Sequence escalation", "Final result"] as const;
type GeneratePlansSectionLabel = (typeof PLAN_SECTION_LABELS)[number];

const limitGeneratePlansLineLength = (value: string, maxLength = 140) => {
  if (value.length <= maxLength) {
    return value;
  }

  const truncated = value.slice(0, maxLength).trim();
  const lastSpaceIndex = truncated.lastIndexOf(" ");
  const safeValue = lastSpaceIndex > 60 ? truncated.slice(0, lastSpaceIndex) : truncated;
  return `${safeValue.trimEnd()}...`;
};

const cleanGeneratePlansFragment = (value: string) =>
  value
    .replace(/^\s*(?:-|\*|\d+\.|beat\s*\d+:)\s+/i, "")
    .replace(/\s+/g, " ")
    .trim();

const splitGeneratePlansFragments = (value: string) => {
  const uniqueFragments = new Set<string>();

  for (const line of value.replace(/\r\n/g, "\n").split(/\n+/)) {
    const cleanedLine = cleanGeneratePlansFragment(line);
    if (!cleanedLine || /^(overall concept|beginning|middle|ending):$/i.test(cleanedLine)) {
      continue;
    }

    for (const fragment of cleanedLine.split(/(?<=[.!?;])\s+/)) {
      const normalizedFragment = cleanGeneratePlansFragment(fragment);
      if (!normalizedFragment) {
        continue;
      }

      uniqueFragments.add(limitGeneratePlansLineLength(normalizedFragment));
    }
  }

  return [...uniqueFragments];
};

const getGeneratePlansSectionLabel = (value: string): GeneratePlansSectionLabel | null => {
  const normalizedLabel = value.trim().toLowerCase();
  switch (normalizedLabel) {
    case "execution target":
    case "overall concept":
      return "Execution target";
    case "sequence start":
    case "beginning":
      return "Sequence start";
    case "sequence escalation":
    case "middle":
      return "Sequence escalation";
    case "final result":
    case "ending":
      return "Final result";
    default:
      return null;
  }
};

const extractGeneratePlansSections = (value: string) => {
  const matches = [...value.matchAll(/(?:^|\n)\s*(Execution target|Sequence start|Sequence escalation|Final result|Overall concept|Beginning|Middle|Ending):\s*/gi)];
  const sections = new Map<GeneratePlansSectionLabel, string>();

  for (let index = 0; index < matches.length; index += 1) {
    const match = matches[index];
    const label = getGeneratePlansSectionLabel(match[1] ?? "");
    if (!label || typeof match.index !== "number") {
      continue;
    }

    const startIndex = match.index + match[0].length;
    const endIndex =
      index + 1 < matches.length && typeof matches[index + 1]?.index === "number"
        ? matches[index + 1]!.index!
        : value.length;
    const sectionBody = stripGeneratePlansHandoffLine(value.slice(startIndex, endIndex));
    if (!sectionBody) {
      continue;
    }

    sections.set(label, sectionBody);
  }

  return sections;
};

type GeneratePlansCommandAction = {
  type: string;
  target: string;
  parameters: Record<string, unknown>;
};

type GeneratePlansCommandPayload = {
  commands: GeneratePlansCommandAction[];
};

const isPlainGeneratePlansRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const sanitizeGeneratePlansJsonValue = (value: unknown, depth = 0): unknown => {
  if (depth > 3) {
    return undefined;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed ? limitGeneratePlansLineLength(trimmed, 240) : undefined;
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : undefined;
  }

  if (typeof value === "boolean" || value === null) {
    return value;
  }

  if (Array.isArray(value)) {
    const nextValues = value
      .map((item) => sanitizeGeneratePlansJsonValue(item, depth + 1))
      .filter((item) => item !== undefined)
      .slice(0, 10);
    return nextValues.length > 0 ? nextValues : undefined;
  }

  if (!isPlainGeneratePlansRecord(value)) {
    return undefined;
  }

  const entries = Object.entries(value)
    .slice(0, 12)
    .map(([key, entryValue]) => [key, sanitizeGeneratePlansJsonValue(entryValue, depth + 1)] as const)
    .filter(([, entryValue]) => entryValue !== undefined);

  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
};

const buildGeneratePlansCommandAction = (
  type: string,
  target: string,
  parameters: Record<string, unknown>,
): GeneratePlansCommandAction => ({
  type,
  target,
  parameters,
});

const sanitizeGeneratePlansCommandAction = (value: unknown): GeneratePlansCommandAction | null => {
  if (!isPlainGeneratePlansRecord(value)) {
    return null;
  }

  const type = typeof value.type === "string" ? value.type.trim() : "";
  if (!type) {
    return null;
  }

  const explicitTarget = typeof value.target === "string" ? value.target.trim() : "";
  const explicitParameters = isPlainGeneratePlansRecord(value.parameters)
    ? (sanitizeGeneratePlansJsonValue(value.parameters) as Record<string, unknown> | undefined) ?? {}
    : {};
  const flattenedParameters = Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !["type", "target", "parameters"].includes(key))
      .map(([key, entryValue]) => [key, sanitizeGeneratePlansJsonValue(entryValue)] as const)
      .filter(([, entryValue]) => entryValue !== undefined),
  );
  const parameters = {
    ...flattenedParameters,
    ...explicitParameters,
  };
  const inferredTarget =
    explicitTarget ||
    (typeof value.actor === "string" && value.actor.trim()) ||
    (typeof value.environment === "string" ? "environment" : "") ||
    (typeof value.state === "string" ? "state" : "") ||
    "sequence";

  return {
    type,
    target: inferredTarget,
    parameters,
  };
};

const extractGeneratePlansJsonCandidate = (value: string) => {
  const trimmed = stripGeneratePlansHandoffLine(value).trim();
  const codeBlockMatch = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return codeBlockMatch?.[1]?.trim() || trimmed;
};

const parseGeneratePlansCommandPayload = (value: string): GeneratePlansCommandPayload | null => {
  const candidate = extractGeneratePlansJsonCandidate(value);
  if (!candidate) {
    return null;
  }

  try {
    const parsed = JSON.parse(candidate);
    if (!isPlainGeneratePlansRecord(parsed)) {
      return null;
    }

    const rawCommands = Array.isArray(parsed.commands)
      ? parsed.commands
      : Array.isArray(parsed.actions)
        ? parsed.actions
        : null;
    if (!rawCommands) {
      return null;
    }

    const commands = rawCommands
      .map((action) => sanitizeGeneratePlansCommandAction(action))
      .filter((action): action is GeneratePlansCommandAction => action !== null)
      .slice(0, 16);

    return commands.length > 0 ? { commands } : null;
  } catch {
    return null;
  }
};

const stringifyGeneratePlansCommandPayload = (payload: GeneratePlansCommandPayload) => JSON.stringify(payload, null, 2);

const buildGeneratePlansCommandPayloadFromOptions = (value: string): GeneratePlansCommandPayload | null => {
  const normalizedLines = value
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
  const selectedLine =
    normalizedLines.find((line) => /^(Recommended Execution Direction|Recommended Direction|Recommended Story):/i.test(line)) ??
    normalizedLines.find((line) =>
      /^(Execution Direction Option\s*\d+|Direction Option\s*\d+|Story Option\s*\d+):/i.test(line),
    );

  if (!selectedLine) {
    return null;
  }

  const [labelAndTitle, ...segments] = selectedLine.split("|").map((segment) => segment.trim()).filter(Boolean);
  const title = labelAndTitle.replace(/^(Recommended Execution Direction|Recommended Direction|Recommended Story|Execution Direction Option\s*\d+|Direction Option\s*\d+|Story Option\s*\d+):\s*/i, "").trim();
  const getSegmentValue = (prefix: string) =>
    segments.find((segment) => segment.toLowerCase().startsWith(prefix.toLowerCase()))?.slice(prefix.length).trim() ?? "";
  const actorFocus = getSegmentValue("Actor focus: ");
  const executionGoal = getSegmentValue("Execution goal: ");
  const blockingForce = getSegmentValue("Blocking force: ");
  const escalation = getSegmentValue("Escalation: ");
  const turningPoint = getSegmentValue("Turning point: ");
  const finalResult = getSegmentValue("Final result: ");

  const actions: GeneratePlansCommandAction[] = [
    buildGeneratePlansCommandAction("define_execution_target", "sequence", {
      title,
      actorFocus,
      goal: executionGoal,
    }),
    buildGeneratePlansCommandAction("define_sequence_start", "sequence_start", {
      instruction: executionGoal || title || "Use the recommended direction as the opening command.",
    }),
    buildGeneratePlansCommandAction("define_sequence_escalation", "sequence_escalation", {
      blockingForce,
      escalation,
    }),
    buildGeneratePlansCommandAction("define_turning_point", "turning_point", {
      instruction: turningPoint || "Lock the main turn before the final result.",
    }),
    buildGeneratePlansCommandAction("define_final_result", "final_result", {
      instruction: finalResult || "Finish on the recommended payoff.",
    }),
  ];

  return {
    commands: actions.filter((action) =>
      action.type === "define_execution_target" ||
      Object.values(action.parameters).some((entryValue) =>
        Array.isArray(entryValue) ? entryValue.length > 0 : Boolean(entryValue),
      ),
    ),
  };
};

const buildGeneratePlansCommandPayloadFromPlanText = ({
  planText,
  analysis,
}: {
  planText: string;
  analysis: GeneratePlansRequestAnalysis;
}): GeneratePlansCommandPayload => {
  const explicitSections = extractGeneratePlansSections(planText);
  const fallbackFragments = splitGeneratePlansFragments(planText);
  const responseScale = analysis.responseScale ?? "standard";
  const improveMode = analysis.improveMode === true;
  const preserveIdentity = analysis.preserveIdentity === true;
  let fallbackCursor = 0;
  const nextFallbackFragment = (fallback: string) => {
    while (fallbackCursor < fallbackFragments.length) {
      const fragment = fallbackFragments[fallbackCursor];
      fallbackCursor += 1;
      if (fragment) {
        return fragment;
      }
    }

    return fallback;
  };
  const sectionActionLimit = responseScale === "simple" ? 1 : 2;
  const actions: GeneratePlansCommandAction[] = [];

  if (preserveIdentity) {
    actions.push(
      buildGeneratePlansCommandAction("preserve_structure", "sequence", {
        mode: improveMode ? "improve" : "continue",
        instruction: improveMode
          ? "Modify only the weak section and preserve the current sequence direction."
          : "Continue the existing sequence without restarting or replacing solved beats.",
      }),
    );
  }

  const executionTarget = nextFallbackFragment(
    improveMode
      ? "Preserve the current setup and tighten the execution path."
      : "Use the user's setup as the execution target with a clear payoff.",
  );
  actions.push(
    buildGeneratePlansCommandAction("define_execution_target", "sequence", {
      instruction: explicitSections.get("Execution target") ?? executionTarget,
    }),
  );

  const sectionConfigs: Array<{
    label: Exclude<GeneratePlansSectionLabel, "Execution target">;
    type: "define_sequence_start" | "define_sequence_escalation" | "define_final_result";
    target: string;
    fallback: string;
  }> = [
    {
      label: "Sequence start",
      type: "define_sequence_start",
      target: "sequence_start",
      fallback: improveMode
        ? "Open on the same setup with clearer anticipation."
        : "Open with the first clear action from the user's setup.",
    },
    {
      label: "Sequence escalation",
      type: "define_sequence_escalation",
      target: "sequence_escalation",
      fallback: improveMode
        ? "Sharpen the main action and impact without changing the current sequence direction."
        : "Push the main turn or escalation before the finish.",
    },
    {
      label: "Final result",
      type: "define_final_result",
      target: "final_result",
      fallback: improveMode
        ? "Finish on the same outcome with a cleaner reaction or settle."
        : "Land on the clearest payoff beat or settle state.",
    },
  ];

  for (const sectionConfig of sectionConfigs) {
    const fragments = splitGeneratePlansFragments(explicitSections.get(sectionConfig.label) ?? nextFallbackFragment(sectionConfig.fallback))
      .slice(0, sectionActionLimit);
    const nextFragments = fragments.length > 0 ? fragments : [sectionConfig.fallback];

    nextFragments.forEach((fragment, index) => {
      actions.push(
        buildGeneratePlansCommandAction(sectionConfig.type, `${sectionConfig.target}_${index + 1}`, {
          instruction: fragment,
        }),
      );
    });
  }

  return {
    commands: actions,
  };
};

export const finalizeGeneratePlansOutput = ({
  output,
  analysis,
}: {
  output: string;
  analysis: GeneratePlansRequestAnalysis;
}) => {
  const trimmedOutput = output.trim();
  if (analysis.needsClarification) {
    return trimmedOutput;
  }

  if (!trimmedOutput) {
    return DRAWING_AI_FINAL_PLAN_FALLBACK_OUTPUT;
  }

  const planWithoutHandoff = stripGeneratePlansHandoffLine(trimmedOutput);
  const parsedPayload = parseGeneratePlansCommandPayload(planWithoutHandoff);
  if (parsedPayload) {
    return stringifyGeneratePlansCommandPayload(parsedPayload);
  }

  if (looksLikeGeneratePlansStoryOptionsOutput(planWithoutHandoff)) {
    const optionsPayload = buildGeneratePlansCommandPayloadFromOptions(planWithoutHandoff);
    return optionsPayload ? stringifyGeneratePlansCommandPayload(optionsPayload) : DRAWING_AI_FINAL_PLAN_FALLBACK_OUTPUT;
  }

  return stringifyGeneratePlansCommandPayload(
    buildGeneratePlansCommandPayloadFromPlanText({
      planText: planWithoutHandoff,
      analysis,
    }),
  );
};

const formatSearchResults = (searchResults: DrawingAiSearchReference[]) =>
  searchResults
    .map(
      (result) =>
        `- ${result.title}
  source: ${result.url}
  summary: ${result.summary}`,
    )
    .join("\n");

export const buildDrawingAiSystemInstructions = ({
  taskType,
  reasoningInstruction,
}: BuildDrawingAiSystemInstructionsInput) =>
  [
    DRAWING_AI_BASE_INSTRUCTIONS,
    reasoningInstruction,
    DRAWING_AI_TASK_INSTRUCTIONS[taskType],
  ].join("\n\n");

export const buildTaskPrompt = ({
  taskType,
  userMessage,
  conversationHistory = [],
  followUpMemory = [],
  workspaceContext = null,
  projectAiMemory = null,
  searchResults = [],
  generatePlansAnalysis,
  otherTrainingExamples = [],
  generatePlansTrainingExamples = [],
  generateFramesTrainingExamples = [],
  generateFramesRuntimeAnalysis,
  generateSoundTrainingExamples = [],
}: BuildTaskPromptInput) => {
  const promptSections = [
    `Task mode: ${DRAWING_AI_TASK_LABELS[taskType]}`,
  ];

  const trimmedConversationHistory = conversationHistory
    .map((message) => ({
      ...message,
      content: message.content.trim(),
    }))
    .filter((message) => message.content.length > 0)
    .slice(-8);

  if (trimmedConversationHistory.length > 0) {
    promptSections.push(`Recent conversation:\n${formatConversationHistory(trimmedConversationHistory)}`);
  }

  if (workspaceContext) {
    promptSections.push(`Real workspace context:\n${formatWorkspaceContext(workspaceContext)}`);
  }

  if (projectAiMemory) {
    promptSections.push(`Persisted project AI memory:\n${formatProjectAiMemory(projectAiMemory)}`);
  }

  if (searchResults.length > 0) {
    promptSections.push(`Relevant internet references:\n${formatSearchResults(searchResults)}`);
    promptSections.push(DRAWING_AI_SEARCH_GUIDANCE[taskType]);
  }

  if (taskType === "generate-plans") {
    const normalizedFollowUpMemory = sanitizeFollowUpMemory(followUpMemory);
    const latestUserRequestFromHistory =
      [...trimmedConversationHistory].reverse().find((message) => message.role === "user")?.content.trim() ?? null;
    const behaviorSignals = inferGeneratePlansBehaviorSignals({
      userMessage,
      followUpMemory: normalizedFollowUpMemory,
      conversationHistory: trimmedConversationHistory,
    });
    const analysis =
      generatePlansAnalysis ??
      withGeneratePlansBehaviorSignals(
        createGeneratePlansReadyToPlan({
          sceneType: "general",
        }),
        behaviorSignals,
      );
    const responseScale = analysis.responseScale ?? behaviorSignals.responseScale;
    const improveMode = analysis.improveMode ?? behaviorSignals.improveMode;
    const messyInput = analysis.messyInput ?? behaviorSignals.messyInput;
    const preserveIdentity = analysis.preserveIdentity ?? behaviorSignals.preserveIdentity;

    if (normalizedFollowUpMemory.length > 0) {
      if (latestUserRequestFromHistory && latestUserRequestFromHistory !== userMessage.trim()) {
        promptSections.push(`Original planning request:\n${latestUserRequestFromHistory}`);
        promptSections.push(`Latest follow-up answer or update:\n${userMessage.trim()}`);
      } else {
        promptSections.push(`User request:\n${userMessage.trim()}`);
      }
      promptSections.push(`Locked planning decisions:\n${formatFollowUpMemory(normalizedFollowUpMemory)}`);
    } else {
      promptSections.push(`User request:\n${userMessage.trim()}`);
    }

    promptSections.push(
      [
        "Behavior target for this request:",
        `Scale: ${responseScale}`,
        `Improve mode: ${improveMode ? "yes" : "no"}`,
        `Messy input: ${messyInput ? "yes" : "no"}`,
        `Preserve identity: ${preserveIdentity ? "yes" : "no"}`,
        responseScale === "simple"
          ? "Return 1 short command chain only."
          : responseScale === "exploratory"
            ? "Choose the strongest direction and return 1 committed command chain only."
            : "Return 1 strong command chain only.",
      ].join("\n"),
    );

    if (generatePlansTrainingExamples.length > 0) {
      promptSections.push(
        `Relevant Generate Plans training examples:\n${formatGeneratePlansExamplesForPrompt(generatePlansTrainingExamples)}`,
      );
    }

    if (analysis.needsClarification) {
      promptSections.push(
        [
          "The request is still too unclear for an execution-ready plan.",
          "Do not fake confidence and do not write a full plan yet.",
          "Ask one short typed-only question only.",
          "Do not write the full plan yet.",
          `The follow-up question is:\n${analysis.followUpQuestion ?? "What final result should this sequence land on?"}`,
        ].join("\n"),
      );
    } else {
      promptSections.push(
        [
          "The request is clear enough for a real plan. Use the user's details directly instead of asking more questions.",
          "Once enough info is known, do not ask more questions and do not loop back into clarification.",
          "Treat the plan like director guidance for later engine execution, not narrative prose.",
          "When you are ready to plan, output only valid JSON. No prose, no markdown fences, no extra explanation.",
          'Use this exact shape: {"commands":[{"type":"...","target":"...","parameters":{...}}]}.',
          "Match the user's scale instead of defaulting to a big polished answer.",
          "If the user is continuing the same project, sequence, scene, or current plan, preserve that existing context and extend or refine only the requested part instead of restarting the sequence.",
          preserveIdentity
            ? "This is identity-preserving territory. Keep the same core sequence direction, main action, and key character or object. Improve clarity, impact, pacing, and animation readability only."
            : "If the user input is messy but still usable, choose a strong safe direction and move forward now.",
          messyInput
            ? "Translate messy phrasing into the most likely animation issue first: weak motion, weak impact, flat pacing, or an unclear ending."
            : "Prefer clarity over complexity.",
          "Revision phrases like make it better, fix this, do it again, no not like that, why does this look weird, or keep it but fix it should preserve the current sequence direction first.",
          "If the user asks for story ideas, says they do not know what to create, or wants collaborative invention, reinterpret that as execution-direction planning and stay in Generate Plans task mode instead of drifting into casual discussion.",
          "Do not return multiple prose options in the final plan output. Choose one strongest direction and convert it into commands.",
          "Treat plain scene descriptions as planning requests immediately. Do not switch into chat, feedback, or discussion mode.",
          "For fights, infer readable escalation and a decisive payoff automatically when the setup is already clear.",
          "For reveal sequences, infer setup -> reveal -> reaction -> payoff when the object or trigger is already present.",
          "For emotional sequences, end on a visible decision or relationship change instead of mood-only description.",
          "Each action should read like later engine behavior, not like a creative pitch.",
          "If only one new continuation detail is missing, ask only about that new beat instead of reopening solved context.",
          "Write a compact, practical command plan that defines later engine behavior and can hand off directly into Generate Frames as the execution layer.",
          "Keep it clear, decisive, useful, and easy to scan.",
          "Do not overcomplicate a simple ask and do not answer with a huge paragraph.",
          "Do not write long paragraphs.",
          "Use visual action beats, staging, motion steps, reveal timing, impact timing, and payoff timing instead of abstract storytelling language.",
          "Each command should be ordered, explicit, and engine-ready.",
          "Convert human expectation into commands, not explanation.",
          "Make the impact moment, reveal moment, payoff moment, and final visual state easy to identify.",
          "Do not speak as if you already drew, rendered, or animated the result.",
          "Bad vs good reminders:",
          "Bad: random twists with no setup, replacing the user's intended direction, cinematic backstory for a tiny ask, or too many actions in one command.",
          "Good: logical cause and effect, clear step-by-step motion, one strongest direction, and a final command that proves the change.",
          "Animation expectation reminders:",
          "Explosion good pattern: bright core, orange/yellow/red heat, fast expansion, fade, then smoke.",
          "Punch good pattern: anticipation, hit, recoil.",
          "Movement good pattern: one clear action per beat, smooth spacing, readable silhouette, clear direction, no floaty teleporting.",
          "Everyday actions like walking, running, stepping, opening a door, falling, bouncing, or reacting should stay simple, readable, and physically believable.",
          "Avoid repeating what the user already said unless it clarifies the plan.",
          "If the user already defines sequence, progression, a midpoint turn, an ending, or a winner, preserve that structure and expand it instead of overwriting it.",
          "If the user already gives a beginning, middle turn, or ending result, keep those beats in the same order.",
          "Do not change who starts, who wins, or what happens in the middle unless the user explicitly changes it.",
          "Do not replace the user's beginning, middle, or ending with a different sequence path.",
          "Try to cover the execution target, the main flow, the sequence start, the escalation, the final result, visual direction, pacing, and final payoff through the action chain.",
          "Use the user's concrete details for the characters, action, look, background, and sequence idea when they are provided.",
          responseScale === "simple"
            ? "Keep the JSON command chain short. For simple asks, 3 to 5 commands is enough."
            : "Use as many commands as needed to keep the sequence readable, but do not pad it with filler commands.",
          'Good command style: {"type":"attack","target":"black","parameters":{"style":"aggressive"}}',
          'Bad command style: "Black attacks first and it feels intense."',
          "Do not add a handoff sentence, prose intro, or any text outside the JSON object.",
          "Do not claim you already prepared commands or changed the workspace.",
          "If one critical lock is missing, the only allowed non-plan output is one typed-only question with no options and no extra explanation.",
        ].join("\n"),
      );
    }
  } else if (taskType === "generate-frames") {
    promptSections.push(`User request:\n${userMessage.trim()}`);

    if (generateFramesRuntimeAnalysis) {
      promptSections.push(formatGenerateFramesRuntimeAnalysisForPrompt(generateFramesRuntimeAnalysis));
    }

    if (generateFramesTrainingExamples.length > 0) {
      promptSections.push(
        `Relevant Generate Frames training examples:\n${formatGenerateFramesExamplesForPrompt(generateFramesTrainingExamples)}`,
      );
    }

    promptSections.push(
      [
        "Treat this as execution-command runtime context, not a conversational answer task.",
        "Think in order: understand the full prompt, identify the real subject, decide event vs thing vs scene, decide action sequence vs still state, ask internally whether you already understand it, identify what is actually missing, use search references/examples only to fill those gaps, then define command steps.",
        "Training examples are behavioral guidance, not literal templates. Do not memorize one fixed explosion, stick figure, lightning bolt, walk cycle, punch, combo, or background and reuse it just because one keyword matched.",
        "Do not treat a pure action word like fight, run, jump, or punch as the literal identity label of one subject; infer the necessary actor count and role from the action.",
        "If the user says later, eventually, not yet, or not right now, treat that as planning or future intent instead of immediate command preparation unless the prompt also clearly asks for something to be executed now.",
        "Do not lock onto one familiar family or canned pattern just because one keyword looks familiar.",
        "Respect explicit exclusions and negation before extracting positive concepts or defining any action steps.",
        "If the user asks for a thing, default to a still/setup command unless motion is requested.",
        "If the user asks for an event, default to a full action progression unless they explicitly asked for a still frame.",
        "If the user asks for a scene or setup, default to a composed still-state command unless motion is requested.",
        "Infer motion from the full prompt meaning, not one keyword alone: fights, strikes, impacts, eruptions, crashes, and shattering usually need progression, while subject-only or setup-only asks usually stay still unless the full prompt clearly asks for motion.",
        "A scene can include event-like elements such as waterfalls, lava, smoke, rain, or energy without forcing the whole request into a full action sequence if the full prompt is still a setup or background request.",
        "Do not substitute a character, explosion, ball, or any other familiar family unless the user actually asked for it.",
        "If the user asks for a starting point, setup frame, still frame, first frame, or opening scene, treat that as a valid single-step Generate Frames request and define pose=setup with a static hold command instead of forcing action beats.",
        "If the prompt combines a background with one or more characters or props, preserve the full composition as one command step instead of collapsing it into only the background or only one subject.",
        "If the user says add, continue, or next, extend the current sequence from the latest beat instead of restarting or replanning everything.",
        "If the user says add, continue, or next but no accepted current frame or current sequence anchor exists, ask exactly one question: Continue from which frame or create new sequence?",
        "Do not fail a continuation request just because the anchor is missing; route it through that one question and preserve everything else.",
        "When there is already a current frame or sequence and the user says things like make him bigger, make him green, make the blue one's head solid blue, remove the face, move the red one left, make them face each other, put them in guard stance, or make the punch more violent, treat that as a same-project edit unless the user explicitly asked for a brand-new scene.",
        "For same-project edits, preserve subject count, left-right placement, subject colors, and current scene continuity unless the user explicitly asks to replace them.",
        "Bind edit targets carefully by color, side, role, and label so the requested tweak hits the correct existing subject instead of restarting or collapsing the scene.",
        "Use the actual frame-workspace context intelligently: current frame, timeline, layer role, FPS, and continuation state are fair game, but do not invent unsupported workspace actions or tools that were not provided.",
        "If the prompt explicitly mixes families, preserve all named parts together instead of letting one erase the other.",
        "Before drafting, make sure you can defend the subject shape, structure, color logic, added effects, and if animated the real start-middle-end execution order.",
        "Treat search as a gap-filler, not a default ritual. If the runtime already understands the request, do not search. Basic stick figures, explosions, lightning, breathing, punches, simple objects, and basic scenes are usually local-knowledge cases.",
        "Search when the request references a named style, an unclear or unfamiliar concept, a misspelling, or missing motion or structural detail the runtime cannot defend locally.",
        "Think like an engine command director: what action must execute, what parameters must change, what stage must come next, and what would fail professional motion review if executed.",
        "Also defend command quality before drafting: make silhouette, proportions, major parts, and continuity explicit enough that the engine receives deterministic action logic.",
        "For plain stick figures, default to a solid filled head when appropriate, do not add a face unless the user explicitly asks for one, keep limb lines stable, and keep posture unambiguous.",
        "For character-like still subjects, keep head, torso, and limb placement explicit. For effects, keep source, main shape, layering, and breakup explicit. For scenes, keep foreground, middle-ground, background, and major environment features explicit.",
        "If the user asked for an action sequence and did not limit it to a setup or first frame, finish the action with a recovery or settled end command instead of stopping at the midpoint or peak only.",
        "Apply real action-command principles. Punches need anticipation, contact, follow-through, and recovery. Jumps need crouch, launch, peak, land, and settle. Explosions need buildup, expansion, peak, breakup, and residue. Lightning needs a sharp strike and quick vanish. Breathing needs rhythmic subtle motion that is still visible.",
        "Every command step must use the exact format action=<type>; durationFrames=<number>; intensity=<none|light|medium|heavy>; timing=<static|fast|normal|slow>; spacing=<none|tight|medium|wide>; command=<explicit execution instruction>;",
        "Reject weak execution: frozen halfway motion, low-force output, random limb noise, mushy impacts, shapeless explosions, lingering active lightning, or breathing that collapses into idle drift.",
        "Use search references to ground missing motion or structural evidence, not to decorate an already-guessed answer.",
        "Ask only if one critical frame detail is genuinely missing and it materially changes the output.",
        "Do not ask obvious filler like explosion color, whether the ball should stay round, or whether a normal punch needs direction.",
        "Do not add faces, arms, legs, or humanoid behavior to an object request unless the user explicitly asks for that.",
        "Prefer structured command logic over abstract wording and avoid generic assistant-style explanation.",
        "Do not use soft words like readable, clean, nice, smooth, strong, good, feels, looks, or reads in the output. Replace them with parameters or explicit commands.",
        "Do not invent unrelated story beats, generic stick figures, generic filler poses, or random abstract shapes.",
        "If the runtime cannot defend a safe plan, return no-plan instead of guessing.",
      ].join("\n"),
    );
  } else if (taskType === "generate-sounds") {
    promptSections.push(`User request:\n${userMessage.trim()}`);

    if (generateSoundTrainingExamples.length > 0) {
      promptSections.push(
        `Relevant Generate Sound training examples:\n${formatGenerateSoundExamplesForPrompt(generateSoundTrainingExamples)}`,
      );
    }

    promptSections.push(
      [
        "Interpret the request like an animation-aware sound director.",
        "AI plans sound intent and structure here. The engine generates later. Do not talk like an audio-tool tutorial.",
        "Hard rules: you do NOT generate sound, you define behavior for engine execution, and all output must be executable.",
        "Your answer must produce a usable engine handoff, not theory or audio-creation copy.",
        "If the request already gives enough direction, move forward instead of stalling.",
        "First decide what the viewer expects to hear, then translate that into physical sound logic.",
        "Make sound type, timing, structure, intensity, texture, decay, and layering clear enough for the engine to execute.",
        "Use engine action language. Good: define explosion event -> strong pressure front -> heavy body -> long decay tail -> no alien texture.",
        "Bad: finished-audio description language instead of engine action language.",
        "Every behavior plan must describe a full event shape: start -> peak -> aftermath.",
        "Reject pop-only, peak-only, or aftermath-free answers.",
        "Lock the sound family. Explosion is not bone. Punch is not kick. Wind bed is not whoosh motion. Do not drift.",
        "Modifiers only change attack, weight, intensity, texture, timing, decay, or layering. Modifiers do not change the family.",
        "If the user says keep the same but change one thing, preserve the current family and modify only that requested dimension.",
        "If the user is continuing the same project, preserve the current sound family, ambience bed, or timing logic unless they clearly ask to change it.",
        "If the user is revising the current sound with messy wording like sharper, heavier, softer, harder, shorter, darker, cleaner, less tail, more bass, same vibe but heavier, or less cartoony, treat that as a direct sound revision request and map it to engine parameters. sharper means attack up. heavier means weight up. softer means intensity down.",
        "If the user gives negative feedback like no not like that, this sounds weak, too soft, too cartoony, redo it, or keep the first half and change the ending hit, preserve the current sound role and revise it instead of resetting.",
        "If the request starts with greeting filler like hello, hi, or hey, ignore the greeting and focus on the actual sound ask.",
        "If the request is a button, beep, click, UI, menu, confirm, notification, or interface sound, default to clean tech language instead of fight language.",
        "If the request is a cartoon bounce, boing, rubbery bounce, springy bounce, or playful landing, default to clean springy playful language and avoid blast, explosion, crunchy, or disordered wording.",
        "If the request is a race car, engine pass, vehicle pass-by, or a car coming toward the camera and away, default to engine rise, pass-by peak, receding tail, doppler bend, and restrained road-air texture instead of explosion or sci-fi sweep language.",
        "Ask only if one critical sound detail is genuinely missing.",
        "When enough is known, return concise, deterministic engine behavior plans.",
        "Always collapse to one strict engine command.",
        "If the user explicitly asks for multiple variants, choose the strongest single command instead of returning a set.",
        "If the user is choosing from an existing behavior-plan set, narrow down to the chosen result instead of generating a whole new set.",
        "If the user asks to import or place an existing option onto a frame, treat that as a real sound-workflow action request instead of restarting sound ideation.",
        "If the user asks to combine options like combine 1 and 3, blend the approved traits into one practical result instead of restarting with a fresh set.",
        "Do not imply a sound is already imported unless the workflow is actually in attach/import mode.",
        "When enough is known, proceed immediately and end in a clear engine behavior plan that could later be attached to a timeline sound marker.",
        "Treat Generate Sounds like a tool for defining, selecting, and attaching engine behavior plans in animation workflow.",
        "Keep engine handoffs structured and actionable: short label, clear behavior, start/peak/aftermath logic, when to use it, optional tweak.",
        "Link every behavior plan to a concrete animation moment like impact frame, landing frame, portal opening, footsteps, or reveal beat.",
        "Use family-appropriate wording. UI stays compact and clean. Cartoon bounce stays springy. Wind stays environmental. Doors stay mechanical. Vehicle pass stays approach-to-recede.",
        "Stay focused on timing, tone, texture, intensity, and how the sound supports the visual beat.",
        "When the user locks timing to a specific action or frame moment, make the sound placement exact and practical instead of vague.",
        "Treat frame references like on frame one, on this frame, right here, when he lands, or when the lock clicks as valid timing anchors for the engine behavior plan.",
        "Differentiate sound families cleanly: bone cracks and sharp body fractures should stay dry, sharp, and controlled, not boomy or explosion-like.",
        "Explicitly avoid soft-pop drift, explosion drift, generic fallback language, missing aftermath, and vague modifier wording.",
        "Non-fight sounds should stay clean and controlled: avoid disordered, harsh, crunchy, weird, or fake-distorted output unless the user explicitly asks for that texture.",
        "Help the user choose quickly with direct usage language like use this on the impact frame or this fits slower dramatic reveals.",
        "Generalize from the user's action, material, scale, and mood instead of acting like only a few preset sound categories exist.",
        "Do not invent unrelated story analysis or generic audio lectures.",
        "Do not write descriptive cinematic paragraphs when structured commands are more useful.",
        "Do not drift into DAW, plugin, synthesis, audio chain, or music-production talk.",
        "Do not turn simple sound requests into music composition talk.",
      ].join("\n"),
    );
  } else {
    promptSections.push(`User request:\n${userMessage.trim()}`);

    if (otherTrainingExamples.length > 0) {
      promptSections.push(`Relevant Task Other training examples:\n${formatOtherExamplesForPrompt(otherTrainingExamples)}`);
    }

    promptSections.push(
      `Task Other intent routing examples:\n${formatOtherIntentExamplesForPrompt(GENERATE_OTHER_INTENT_EXAMPLES)}`,
    );

    promptSections.push(
      [
        "Interpret this like a pure engine-command router for the animation workspace.",
        "Task Other does one job: convert user intent into engine command intent.",
        'If the route is clear, output one JSON object only in this shape: {"commands":[{"type":"...","target":"...","parameters":{...}}]}.',
        "Every parameters object must include timing, spacing, intensity, sequence, constraints, style, and continuation.",
        "Classify the request internally before responding: plan, sound, frame, UI, or unknown.",
        "When the route is clear, map the request to command type, target system, execution goal, command chain, and any route-specific parameters.",
        "If the request implies multiple actions in one batch, map that into commandParameters instead of expanding into prose.",
        "If the request is clearly plan, frame, or sound work, set targetSystem to that command planner.",
        "If the request is clearly UI or workspace work, keep it in Task Other and prepare a UI command envelope.",
        'If the request is clear but does not belong to plan, frame, sound, or UI, output one command with type="prepare-custom-command" and target="engine".',
        "Use what the user likely meant and what outcome they expect to choose the route and command shape.",
        "For frame-batch requests, prepare generate-frame-batch only when the sequence anchor is clear. If the anchor is missing, ask exactly one routing question: Should this create a new frame sequence or continue the current one?",
        "Treat greetings, vague reactions, and low-context statements as unknown until a command path is identified.",
        "Every routing decision should imply command type, command action, target system, command parameters, execution goal, and command chain.",
        "If the user says same project, continue, fix this, or make it better, preserve the same command chain unless they explicitly reset.",
        "If the route is unclear, ask exactly one targeted question that resolves the missing command-path decision.",
        'For greeting-only or random input, ask one routing question like "Which command chain: plan, frame, sound, or UI?"',
        "Treat save, export, import, naming, organization, setup, cleanup, layers, timeline, symbols, tools, and buttons as UI or workspace requests that stay in Other and map to UI commands.",
        "For UI requests, map directly to UI command action and parameters, not click paths or step sequences.",
        "Do not ask multiple questions.",
        "Do not invent fake system behavior or canned task-card voice.",
        "Do not guess a random plan, frame, or sound answer just because the request is ambiguous.",
        "Do not explain UI.",
        "Do not give steps.",
        "Do not generate plan, frame, or sound content.",
        "Do not describe UI steps, button paths, or manual workflows.",
        "Do not drift into generic productivity advice, walkthrough wording, or vague software prose.",
        "Keep the output short, structured, and deterministic.",
      ].join("\n"),
    );
  }

  return promptSections.join("\n\n");
};
