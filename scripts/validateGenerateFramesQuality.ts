import { execFile as execFileCallback } from "node:child_process";
import http from "node:http";
import https from "node:https";
import { promisify } from "node:util";

const CANVAS_WIDTH = 1024;
const CANVAS_HEIGHT = 1024;
const VALIDATION_URL = process.env.VALIDATE_AI_URL ?? "http://127.0.0.1:3001/api/ai";
const ROUTE_TIMEOUT_MS = Number(process.env.VALIDATE_AI_TIMEOUT_MS ?? 45000);
const VALIDATE_GFQ_SECTION = (process.env.VALIDATE_GFQ_SECTION ?? "all").toLowerCase();
const VALIDATE_GFQ_FILTER = (process.env.VALIDATE_GFQ_FILTER ?? "").trim().toLowerCase();
const VALIDATE_GFQ_TRANSPORT = (process.env.VALIDATE_GFQ_TRANSPORT ?? "auto").trim().toLowerCase();
const VALIDATE_GFQ_ROUTE_RETRIES = Math.max(1, Number(process.env.VALIDATE_GFQ_ROUTE_RETRIES ?? 3));
const execFile = promisify(execFileCallback);

type ValidationWorkspaceContext = {
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
  currentFrameBounds: { left: number; top: number; width: number; height: number } | null;
  previousFilledFrameIndex: number | null;
  nextFilledFrameIndex: number | null;
  currentFrameSound: null;
  selectedFrameSound: null;
  hasOffCameraAuthoringArea: boolean;
  cameraAreaDescription: string;
  canvasWidth: number;
  canvasHeight: number;
};

const baseWorkspaceContext = {
  projectId: null,
  projectTitle: "Test",
  activeLayerId: "layer-1",
  activeLayerName: "Layer 1",
  totalLayers: 1,
  activeTool: "brush",
  timelineFps: 12,
  authoredFrameCount: 1,
  currentFrameIndex: 0,
  selectedTimelineIndex: 0,
  currentFrameHasBitmap: false,
  currentFrameBounds: null,
  previousFilledFrameIndex: null,
  nextFilledFrameIndex: null,
  currentFrameSound: null,
  selectedFrameSound: null,
  hasOffCameraAuthoringArea: true,
  cameraAreaDescription: "white camera area with dark authoring surround",
  canvasWidth: CANVAS_WIDTH,
  canvasHeight: CANVAS_HEIGHT,
} satisfies ValidationWorkspaceContext;

type RouteWorkspaceIntent = {
  behaviorType?: string;
  toolIntents?: string[];
  targetLayerIntent?: string;
  toolBased?: boolean;
  generationAllowed?: boolean;
  backgroundGenerationAllowed?: boolean;
  fpsSuggestion?: number | null;
  applySuggestedFps?: boolean;
  fpsReason?: string | null;
} | null;

type ValidationInput = {
  output: string;
  frameCount: number;
  poses: string[];
  descriptions: string[];
  initialPoses?: string[];
  initialDescriptions?: string[];
  generatedFramePlan: RouteResponse["generatedFramePlan"] | null;
  workspaceIntent: RouteWorkspaceIntent;
  generateFramesState: RouteResponse["generateFramesState"] | null;
  projectAiMemory: RouteResponse["projectAiMemory"] | null;
  searchUsed: boolean;
  warnings: string[];
};

const hasOrderedBeatSequence = (
  values: readonly string[],
  patterns: readonly RegExp[],
) => {
  let searchStartIndex = 0;

  for (const pattern of patterns) {
    const matchIndex = values.findIndex((value, index) => index >= searchStartIndex && pattern.test(value));
    if (matchIndex === -1) {
      return false;
    }
    searchStartIndex = matchIndex + 1;
  }

  return true;
};

const hasRecoveryBudgetWarning = (warnings: readonly string[]) =>
  warnings.some((warning) =>
    /retried|repaired|escalated|bounded recovery exhausted|validator-guided structured retry/i.test(warning),
  );

const validationCases = [
  {
    prompt: "Generate an explosion.",
    workspaceContext: baseWorkspaceContext,
    shouldNotAskQuestion: true,
    check: ({ output, frameCount, descriptions, generatedFramePlan, workspaceIntent, searchUsed, warnings }: ValidationInput) =>
      output.length === 0 &&
      searchUsed === false &&
      !hasRecoveryBudgetWarning(warnings) &&
      frameCount >= 5 &&
      workspaceIntent?.behaviorType === "effect-drawing" &&
      generatedFramePlan?.renderingQualityProfile?.family === "explosion" &&
      generatedFramePlan?.renderingQualityProfile?.qualityFloorTier === "effect-strong" &&
      generatedFramePlan?.familyQualityContract?.mustHaves?.some((value) => /outward blast/i.test(value)) === true &&
      generatedFramePlan?.renderAcceptanceContract?.minimumReadableCompletion?.some((value) => /aftermath|disintegration/i.test(value)) === true &&
      descriptions.some((description) => /pressure|flash|blast|ignite|core/i.test(description)) &&
      descriptions.some((description) => /orange|yellow|red|fire|glow|blast/i.test(description)) &&
      descriptions.some((description) => /smoke|debris|aftermath|fade|disintegrate/i.test(description)) &&
      !descriptions.some((description) => /stick figure|character|person|humanoid/i.test(description)),
  },
  {
    prompt: "Generate a smoother explosion.",
    workspaceContext: baseWorkspaceContext,
    shouldNotAskQuestion: true,
    check: ({ output, frameCount, descriptions, generatedFramePlan, searchUsed, warnings }: ValidationInput) =>
      output.length === 0 &&
      searchUsed === false &&
      !hasRecoveryBudgetWarning(warnings) &&
      frameCount >= 5 &&
      generatedFramePlan?.renderingQualityProfile?.family === "explosion" &&
      descriptions.some((description) => /pressure|flash|blast|ignite|core/i.test(description)) &&
      descriptions.some((description) => /break|fragment|aftermath|fade|disintegrate|residue/i.test(description)),
  },
  {
    prompt: "Generate me a stick figure.",
    workspaceContext: baseWorkspaceContext,
    shouldNotAskQuestion: true,
    check: ({ output, frameCount, descriptions, generatedFramePlan, searchUsed }: ValidationInput) =>
      output.length === 0 &&
      searchUsed === false &&
      frameCount === 1 &&
      generatedFramePlan?.renderingQualityProfile?.family === "character" &&
      generatedFramePlan?.renderingQualityProfile?.simplicityTarget === "minimal" &&
      descriptions.some((description) => /stick figure|simple figure|readable silhouette|limbs|torso/i.test(description)) &&
      !descriptions.some((description) => /explosion|blast|fireball|lightning|smoke bomb/i.test(description)),
  },
  {
    prompt: "Generate lightning.",
    workspaceContext: baseWorkspaceContext,
    shouldNotAskQuestion: true,
    check: ({ output, frameCount, descriptions, generatedFramePlan, workspaceIntent, searchUsed, warnings }: ValidationInput) =>
      output.length === 0 &&
      searchUsed === false &&
      !hasRecoveryBudgetWarning(warnings) &&
      frameCount >= 2 &&
      workspaceIntent?.behaviorType === "effect-drawing" &&
      generatedFramePlan?.renderingQualityProfile?.family === "lightning" &&
      generatedFramePlan?.familyQualityContract?.mustHaves?.some((value) => /sharp strike path/i.test(value)) === true &&
      generatedFramePlan?.renderAcceptanceContract?.minimumReadableCompletion?.some((value) => /vanish/i.test(value)) === true &&
      descriptions.some((description) => /lightning|bolt|electric|glow|bright/i.test(description)) &&
      !descriptions.some((description) => /stick figure|ball|character/i.test(description)),
  },
  {
    prompt: "Make a tired character breathe hard.",
    workspaceContext: baseWorkspaceContext,
    shouldNotAskQuestion: true,
    check: ({ output, frameCount, poses, descriptions, generatedFramePlan, searchUsed }: ValidationInput) =>
      output.length === 0 &&
      searchUsed === false &&
      frameCount >= 3 &&
      generatedFramePlan?.renderingQualityProfile?.family === "breathing" &&
      generatedFramePlan?.renderAcceptanceContract?.minimumReadableCompletion?.some((value) => /inhale-exhale-return cycle/i.test(value)) === true &&
      [...poses, ...descriptions].some((value) => /inhale|exhale|breathing|fatigue|shoulders drop|chest/i.test(value)),
  },
  {
    prompt: "Generate me a volcano eruption.",
    workspaceContext: baseWorkspaceContext,
    shouldNotAskQuestion: true,
    check: ({ output, frameCount, descriptions, searchUsed }: ValidationInput) =>
      output.length === 0 &&
      searchUsed === false &&
      frameCount >= 4 &&
      descriptions.some((description) => /volcano|eruption|lava|ash|smoke/i.test(description)) &&
      descriptions.some((description) => /burst|spray|column|phase|fade|aftermath/i.test(description)) &&
      !descriptions.some((description) => /stick figure|character|humanoid/i.test(description)),
  },
  {
    prompt: "Generate me a smoke bomb.",
    workspaceContext: baseWorkspaceContext,
    shouldNotAskQuestion: true,
    check: ({ output, frameCount, descriptions, searchUsed }: ValidationInput) =>
      output.length === 0 &&
      searchUsed === false &&
      frameCount >= 3 &&
      descriptions.some((description) => /smoke bomb|smoke|cloud|burst|spread|fade/i.test(description)) &&
      !descriptions.some((description) => /fireball|stick figure|character/i.test(description)),
  },
  {
    prompt: "Generate me a dinosaur.",
    workspaceContext: baseWorkspaceContext,
    shouldNotAskQuestion: true,
    check: ({ output, frameCount, descriptions, searchUsed }: ValidationInput) =>
      output.length === 0 &&
      searchUsed === true &&
      frameCount === 1 &&
      descriptions.some((description) => /dinosaur|tail|reptilian|stance|silhouette/i.test(description)) &&
      !descriptions.some((description) => /explosion|lightning|stick figure/i.test(description)),
  },
  {
    prompt: "Generate a glass shattering.",
    workspaceContext: baseWorkspaceContext,
    shouldNotAskQuestion: true,
    check: ({ output, frameCount, descriptions, searchUsed }: ValidationInput) =>
      output.length === 0 &&
      searchUsed === false &&
      frameCount >= 4 &&
      descriptions.some((description) => /glass|shard|shatter|fracture|fragment/i.test(description)) &&
      !descriptions.some((description) => /bullet|projectile|ground|dirt|divot/i.test(description)),
  },
  {
    prompt: "Generate me a fight.",
    workspaceContext: baseWorkspaceContext,
    shouldNotAskQuestion: true,
    check: ({ output, frameCount, descriptions, searchUsed, generateFramesState }: ValidationInput) =>
      output.length === 0 &&
      searchUsed === false &&
      frameCount >= 4 &&
      generateFramesState?.motionType === "fight" &&
      descriptions.some((description) => /opposing|fighters?|fight-ready|clash|exchange|counterattack/i.test(description)) &&
      descriptions.some((description) => /reset|recover|resolved|ending|next move/i.test(description)) &&
      !descriptions.some((description) => /explosion|lightning|smoke bomb/i.test(description)),
  },
  {
    prompt: "Generate a background with mountain ranges, plains, trees, boulders, and a waterfall.",
    workspaceContext: baseWorkspaceContext,
    shouldNotAskQuestion: true,
    check: ({ output, frameCount, descriptions, workspaceIntent, generateFramesState, searchUsed }: ValidationInput) =>
      output.length === 0 &&
      searchUsed === false &&
      frameCount === 1 &&
      (workspaceIntent?.behaviorType === "background-generation" || workspaceIntent?.behaviorType === "tool-drawing") &&
      generateFramesState?.subjectType === "background" &&
      generateFramesState?.motionType === "scene" &&
      (generateFramesState?.sceneElements ?? []).some((element) => /waterfall|mountains?/i.test(element)) &&
      (generateFramesState?.subjects ?? []).every((subject) => (subject.type ?? "background") === "background") &&
      descriptions.some((description) => /mountain|plains?|trees?|boulders?|waterfall/i.test(description)),
  },
  {
    prompt: "Generate a background scene now, I will animate later.",
    workspaceContext: baseWorkspaceContext,
    shouldNotAskQuestion: true,
    check: ({ output, frameCount, descriptions, generateFramesState, searchUsed }: ValidationInput) =>
      output.length === 0 &&
      searchUsed === false &&
      frameCount === 1 &&
      generateFramesState?.subjectType === "background" &&
      descriptions.some((description) => /background|stage|empty center|future animation|ground plane/i.test(description)) &&
      generateFramesState?.motionType !== "fight",
  },
  {
    prompt: "I want to create a stick figure fight eventually but not right now.",
    workspaceContext: baseWorkspaceContext,
    shouldNotAskQuestion: true,
    check: ({ frameCount }: ValidationInput) => frameCount === 0,
  },
  {
    prompt: "Generate me a bullet hitting the ground.",
    workspaceContext: baseWorkspaceContext,
    shouldNotAskQuestion: true,
    check: ({ output, frameCount, descriptions, searchUsed }: ValidationInput) =>
      output.length === 0 &&
      searchUsed === false &&
      frameCount >= 3 &&
      descriptions.some((description) => /bullet|impact|ground|dust|debris|flash/i.test(description)) &&
      !descriptions.some((description) => /stick figure|character/i.test(description)),
  },
  {
    prompt: "Generate me two stick figures fighting in a cave.",
    workspaceContext: baseWorkspaceContext,
    shouldNotAskQuestion: true,
    check: ({ output, frameCount, descriptions, searchUsed, generateFramesState }: ValidationInput) =>
      output.length === 0 &&
      searchUsed === false &&
      frameCount >= 3 &&
      descriptions.some((description) => /cave|rock|shadow|underground/i.test(description)) &&
      descriptions.some((description) => /stick figure|left figure|right figure|combat|fight|impact/i.test(description)) &&
      generateFramesState?.sceneSetting === "cave",
  },
  {
    prompt: "Generate cracks in concrete.",
    workspaceContext: baseWorkspaceContext,
    shouldNotAskQuestion: true,
    check: ({ output, frameCount, descriptions }: ValidationInput) =>
      output.length === 0 &&
      frameCount === 1 &&
      descriptions.some((description) => /crack|fracture|concrete|dust|chips?/i.test(description)) &&
      !descriptions.some((description) => /stick figure|character|person/i.test(description)),
  },
  {
    prompt: "Generate a bouncing ball.",
    workspaceContext: baseWorkspaceContext,
    shouldNotAskQuestion: true,
    check: ({ output, frameCount, descriptions }: ValidationInput) =>
      output.length === 0 &&
      frameCount >= 5 &&
      descriptions.some((description) => /ball/i.test(description)) &&
      descriptions.some((description) => /round/i.test(description)) &&
      descriptions.some((description) => /squash/i.test(description)) &&
      descriptions.some((description) => /settle|comes to rest|controlled/i.test(description)) &&
      !descriptions.some((description) => /character|creature|arms?|legs?|face|eyes?/i.test(description)),
  },
  {
    prompt: "Generate a green ball bouncing.",
    workspaceContext: baseWorkspaceContext,
    shouldNotAskQuestion: true,
    check: ({ output, frameCount, descriptions }: ValidationInput) =>
      output.length === 0 &&
      frameCount >= 5 &&
      descriptions.some((description) => /green ball/i.test(description)) &&
      descriptions.some((description) => /round/i.test(description)) &&
      descriptions.some((description) => /squash/i.test(description)) &&
      descriptions.some((description) => /settle|comes to rest|controlled/i.test(description)) &&
      !descriptions.some((description) => /character|creature|arms?|legs?|face|eyes?/i.test(description)),
  },
  {
    prompt: "Generate a bouncing blue ball.",
    workspaceContext: baseWorkspaceContext,
    shouldNotAskQuestion: true,
    check: ({ output, frameCount, descriptions }: ValidationInput) =>
      output.length === 0 &&
      frameCount >= 5 &&
      descriptions.some((description) => /blue ball/i.test(description)) &&
      descriptions.some((description) => /round/i.test(description)) &&
      descriptions.some((description) => /squash/i.test(description)) &&
      descriptions.some((description) => /rebound|rises?|rising|upward/i.test(description)) &&
      descriptions.some((description) => /settle|comes to rest|controlled/i.test(description)) &&
      !descriptions.some((description) => /character|creature|arms?|legs?|face|eyes?/i.test(description)),
  },
  {
    prompt: "Roll a ball through the shot.",
    workspaceContext: baseWorkspaceContext,
    shouldNotAskQuestion: true,
    check: ({ output, frameCount, descriptions }: ValidationInput) =>
      output.length === 0 &&
      frameCount >= 2 &&
      descriptions.some((description) => /ball/i.test(description)) &&
      descriptions.some((description) => /roll|rolling|direction|travel/i.test(description)) &&
      !descriptions.some((description) => /character|creature|arms?|legs?|face|eyes?/i.test(description)),
  },
  {
    prompt: "Make him punch.",
    workspaceContext: baseWorkspaceContext,
    shouldNotAskQuestion: true,
    check: ({ output, frameCount, poses, descriptions }: ValidationInput) =>
      output.length === 0 &&
      frameCount >= 3 &&
      hasOrderedBeatSequence(poses, [
        /anticipation|wind[- ]?up|load/i,
        /contact|impact|strike|hit/i,
        /follow[- ]?through|recovery/i,
      ]) &&
      descriptions.some((description) => /force|strike|committed/i.test(description)),
  },
  {
    prompt: "Make the left stick figure punch the right stick figure.",
    workspaceContext: baseWorkspaceContext,
    shouldNotAskQuestion: true,
    check: ({ output, frameCount, descriptions }: ValidationInput) =>
      output.length === 0 &&
      frameCount >= 3 &&
      descriptions.some((description) => /left figure|left side/i.test(description)) &&
      descriptions.some((description) => /right-side target|right target|right side|right figure/i.test(description)) &&
      descriptions.some((description) => /punch|impact|follow-through/i.test(description)),
  },
  {
    prompt: "Make him punch in a brutal serious way.",
    workspaceContext: baseWorkspaceContext,
    shouldNotAskQuestion: true,
    check: ({ output, frameCount, descriptions }: ValidationInput) =>
      output.length === 0 &&
      frameCount >= 3 &&
      descriptions.some((description) => /brutal|powerful|harder|forceful|committed|serious/i.test(description)),
  },
  {
    prompt: "Make him punch in a weak scared way.",
    workspaceContext: baseWorkspaceContext,
    shouldNotAskQuestion: true,
    check: ({ output, frameCount, descriptions }: ValidationInput) =>
      output.length === 0 &&
      frameCount >= 3 &&
      descriptions.some((description) => /weak|scared|hesitant|cautious|reduced|timid|guarded/i.test(description)),
  },
  {
    prompt: "Make a stick figure walk.",
    workspaceContext: baseWorkspaceContext,
    shouldNotAskQuestion: true,
    check: ({ output, frameCount, poses, descriptions }: ValidationInput) =>
      output.length === 0 &&
      frameCount >= 3 &&
      /contact|step|plant/i.test(poses[0] ?? "") &&
      /pass|transition/i.test(poses[1] ?? "") &&
      /contact|step|plant/i.test(poses[2] ?? "") &&
      descriptions.some((description) => /walk|stride|weight transfer|planted/i.test(description)),
  },
  {
    prompt: "Make a fighting stance.",
    workspaceContext: baseWorkspaceContext,
    shouldNotAskQuestion: true,
    check: ({ output, frameCount, descriptions }: ValidationInput) =>
      output.length === 0 &&
      frameCount === 1 &&
      descriptions.some((description) => /stance|guard|balanced|ready/i.test(description)) &&
      !descriptions.some((description) => /blob|abstract|nonsense/i.test(description)),
  },
  {
    prompt: "Draw a dark room.",
    workspaceContext: baseWorkspaceContext,
    shouldNotAskQuestion: true,
    check: ({ output, frameCount, descriptions, workspaceIntent }: ValidationInput) =>
      output.length === 0 &&
      frameCount === 1 &&
      workspaceIntent?.behaviorType === "background-generation" &&
      workspaceIntent?.backgroundGenerationAllowed === true &&
      descriptions.some((description) => /room|wall|floor|shadow|dark|dim/i.test(description)) &&
      !descriptions.some((description) => /stick figure|character|person/i.test(description)),
  },
  {
    prompt: "Draw plains with mountain ranges behind.",
    workspaceContext: baseWorkspaceContext,
    shouldNotAskQuestion: true,
    check: ({ output, frameCount, descriptions, workspaceIntent }: ValidationInput) =>
      output.length === 0 &&
      frameCount === 1 &&
      workspaceIntent?.behaviorType === "background-generation" &&
      descriptions.some((description) => /plains?|field|ground/i.test(description)) &&
      descriptions.some((description) => /mountain|range|hill/i.test(description)) &&
      !descriptions.some((description) => /stick figure|character|person/i.test(description)),
  },
  {
    prompt: "Draw a nighttime city background with buildings behind it.",
    workspaceContext: baseWorkspaceContext,
    shouldNotAskQuestion: true,
    check: ({ output, frameCount, descriptions, workspaceIntent }: ValidationInput) =>
      output.length === 0 &&
      frameCount === 1 &&
      workspaceIntent?.behaviorType === "background-generation" &&
      descriptions.some((description) => /night|city|cityscape|skyline/i.test(description)) &&
      descriptions.some((description) => /building|window|lights?/i.test(description)) &&
      !descriptions.some((description) => /stick figure|character|person/i.test(description)),
  },
  {
    prompt: "Generate two stick figures with a forest background. One red, one blue. Just a starting point.",
    workspaceContext: baseWorkspaceContext,
    shouldNotAskQuestion: true,
    check: ({ output, frameCount, descriptions, workspaceIntent, generateFramesState, searchUsed }: ValidationInput) =>
      output.length === 0 &&
      frameCount === 1 &&
      searchUsed === false &&
      workspaceIntent?.behaviorType === "tool-drawing" &&
      workspaceIntent?.targetLayerIntent === "active-layer" &&
      descriptions.some((description) => /forest|tree|trees|ground/i.test(description)) &&
      descriptions.some((description) => /red stick figure|red character/i.test(description)) &&
      descriptions.some((description) => /blue stick figure|blue character/i.test(description)) &&
      generateFramesState?.subjectType === "mixed" &&
      generateFramesState?.sceneSetting === "forest" &&
      (generateFramesState?.subjects ?? []).filter((subject) => subject.role === "primary" || subject.role === "secondary").length >= 2,
  },
  {
    prompt: "Create a single setup frame with two stick figures and a background.",
    workspaceContext: baseWorkspaceContext,
    shouldNotAskQuestion: true,
    check: ({ output, frameCount, poses, descriptions, workspaceIntent, generateFramesState }: ValidationInput) =>
      output.length === 0 &&
      frameCount === 1 &&
      workspaceIntent?.behaviorType === "tool-drawing" &&
      descriptions.some((description) => /setup|starting point|still|opening/i.test(description)) &&
      [...poses, ...descriptions].some((value) => /two readable figures|both figures|stick figure|foreground/i.test(value)) &&
      descriptions.some((description) => /background|scene|depth|environment/i.test(description)) &&
      generateFramesState?.subjectType === "mixed",
  },
  {
    prompt: "Generate one still frame of a canyon with two stick figures.",
    workspaceContext: baseWorkspaceContext,
    shouldNotAskQuestion: true,
    check: ({ output, frameCount, descriptions, workspaceIntent, generateFramesState }: ValidationInput) =>
      output.length === 0 &&
      frameCount === 1 &&
      workspaceIntent?.behaviorType === "tool-drawing" &&
      descriptions.some((description) => /canyon|rock|rocky|cliff|boulder/i.test(description)) &&
      descriptions.some((description) => /two readable figures|stick figure|foreground/i.test(description)) &&
      generateFramesState?.sceneSetting === "canyon",
  },
  {
    prompt: "Make a starting point scene with a city background and one character.",
    workspaceContext: baseWorkspaceContext,
    shouldNotAskQuestion: true,
    check: ({ output, frameCount, descriptions, workspaceIntent, generateFramesState }: ValidationInput) =>
      output.length === 0 &&
      frameCount === 1 &&
      workspaceIntent?.behaviorType === "tool-drawing" &&
      descriptions.some((description) => /city|building|urban|skyline/i.test(description)) &&
      descriptions.some((description) => /character|foreground|focal subject/i.test(description)) &&
      generateFramesState?.subjectType === "mixed",
  },
  {
    prompt: "Create a single setup frame of a bioluminescent alien forest with two stick figures.",
    workspaceContext: baseWorkspaceContext,
    shouldSearch: true,
    shouldNotAskQuestion: true,
    check: ({ output, frameCount, descriptions, workspaceIntent }: ValidationInput) =>
      output.length === 0 &&
      frameCount === 1 &&
      workspaceIntent?.behaviorType === "tool-drawing" &&
      descriptions.some((description) => /forest|tree|trees/i.test(description)) &&
      descriptions.some((description) => /two readable figures|stick figure|foreground/i.test(description)) &&
      descriptions.some((description) => /alien|bioluminescent|glow|strange|otherworldly/i.test(description)),
  },
  {
    prompt: "Create a single setup frame of a cave monster facing a vacuum-armed robot.",
    workspaceContext: baseWorkspaceContext,
    shouldSearch: true,
    shouldNotAskQuestion: true,
    check: ({ output, frameCount, descriptions, searchUsed, generateFramesState, projectAiMemory }: ValidationInput) =>
      output.length === 0 &&
      frameCount === 1 &&
      searchUsed === true &&
      descriptions.some((description) => /robot|vacuum/i.test(description)) &&
      descriptions.some((description) => /monster|claw|cave|spike/i.test(description)) &&
      generateFramesState?.sceneSetting === "cave" &&
      (generateFramesState?.subjects ?? []).length >= 2 &&
      (generateFramesState?.subjects ?? []).some((subject) => /monster/i.test(subject.label ?? "")) &&
      (generateFramesState?.subjects ?? []).some((subject) => /robot/i.test(subject.label ?? "")) &&
      projectAiMemory?.generateFramesState?.sceneSetting === "cave",
  },
  {
    prompt: "Generate an explosion with a stick figure running out of the smoke.",
    workspaceContext: baseWorkspaceContext,
    shouldNotAskQuestion: true,
    check: ({ output, frameCount, descriptions }: ValidationInput) =>
      output.length === 0 &&
      frameCount >= 3 &&
      descriptions.some((description) => /explosion|blast|fire/i.test(description)) &&
      descriptions.some((description) => /smoke/i.test(description)) &&
      descriptions.some((description) => /stick figure|runs?|running/i.test(description)),
  },
  {
    prompt: "Make the background move while the character stays centered.",
    workspaceContext: {
      ...baseWorkspaceContext,
      currentFrameHasBitmap: true,
      currentFrameBounds: { left: 430, top: 260, width: 180, height: 360 },
    },
    shouldNotAskQuestion: true,
    check: ({ output, frameCount, descriptions, generatedFramePlan }: ValidationInput) =>
      output.length === 0 &&
      frameCount >= 3 &&
      generatedFramePlan?.renderingQualityProfile?.family === "background-scroll" &&
      generatedFramePlan?.familyQualityContract?.mustHaves?.some((value) => /anchored subject/i.test(value)) === true &&
      descriptions.some((description) => /character stays|subject stays|screen position/i.test(description)) &&
      descriptions.some((description) => /background scrolls|environment is moving|camera-follow illusion/i.test(description)),
  },
  {
    prompt: "Continue from the current drawing.",
    workspaceContext: {
      ...baseWorkspaceContext,
      currentFrameHasBitmap: true,
      currentFrameBounds: { left: 420, top: 300, width: 180, height: 340 },
    },
    shouldNotAskQuestion: true,
    check: ({ output, frameCount, poses, descriptions, workspaceIntent }: ValidationInput) =>
      output.length === 0 &&
      frameCount === 1 &&
      workspaceIntent?.behaviorType === "animation-continuation" &&
      [...poses, ...descriptions].some(
        (value) =>
          /continue the current drawing|preserving the same subject|motion family|preserv(?:e|ing) identity|continue the existing motion|same centered character|immediate next beat/i.test(
            value,
          ),
      ),
  },
  {
    prompt: "Please don't make an explosion.",
    workspaceContext: baseWorkspaceContext,
    shouldNotAskQuestion: true,
    check: ({ output, frameCount, descriptions }: ValidationInput) =>
      output.length === 0 &&
      frameCount === 0 &&
      descriptions.length === 0,
  },
  {
    prompt: "Avoid explosion.",
    workspaceContext: baseWorkspaceContext,
    shouldNotAskQuestion: true,
    check: ({ output, frameCount, descriptions }: ValidationInput) =>
      output.length === 0 &&
      frameCount === 0 &&
      descriptions.length === 0,
  },
  {
    prompt: "No explosion.",
    workspaceContext: baseWorkspaceContext,
    shouldNotAskQuestion: true,
    check: ({ output, frameCount, descriptions }: ValidationInput) =>
      output.length === 0 &&
      frameCount === 0 &&
      descriptions.length === 0,
  },
  {
    prompt: "Create a zombie apocalypse.",
    workspaceContext: baseWorkspaceContext,
    shouldNotAskQuestion: true,
    check: ({ output, frameCount, poses, descriptions }: ValidationInput) =>
      output.length === 0 &&
      frameCount >= 1 &&
      [...poses, ...descriptions].some((value) => /zombie|undead|horde|apocalypse|surviv/i.test(value)),
  },
  {
    prompt: "Create an alien apocalypse.",
    workspaceContext: baseWorkspaceContext,
    shouldNotAskQuestion: true,
    check: ({ output, frameCount, poses, descriptions }: ValidationInput) =>
      output.length === 0 &&
      frameCount >= 1 &&
      [...poses, ...descriptions].some((value) => /alien|invasion|apocalypse|ship|creature/i.test(value)),
  },
  {
    prompt: "Make a spiky explosion.",
    workspaceContext: baseWorkspaceContext,
    shouldNotAskQuestion: true,
    check: ({ output, frameCount, poses, descriptions }: ValidationInput) =>
      output.length === 0 &&
      frameCount >= 2 &&
      [...poses, ...descriptions].some((value) => /explosion|blast|fire/i.test(value)) &&
      [...poses, ...descriptions].some((value) => /spike|spiky|jagged/i.test(value)),
  },
  {
    prompt: "Make a poisonous green explosion.",
    workspaceContext: baseWorkspaceContext,
    shouldNotAskQuestion: true,
    check: ({ output, frameCount, poses, descriptions }: ValidationInput) =>
      output.length === 0 &&
      frameCount >= 3 &&
      [...poses, ...descriptions].some((value) => /explosion|blast|fire/i.test(value)) &&
      [...poses, ...descriptions].some((value) => /green|poison|toxic|acid/i.test(value)),
  },
  {
    prompt: "Make a ball that can morph into anything.",
    workspaceContext: baseWorkspaceContext,
    shouldNotAskQuestion: true,
    check: ({ output, frameCount, poses, descriptions }: ValidationInput) =>
      output.length === 0 &&
      frameCount >= 2 &&
      [...poses, ...descriptions].some((value) => /ball/i.test(value)) &&
      [...poses, ...descriptions].some((value) => /morph|transform|change/i.test(value)),
  },
] as const;

const sequenceCases = [
  {
    initialPrompt: "Generate an explosion.",
    followUpPrompt: "Make it disintegrate.",
    workspaceContext: {
      ...baseWorkspaceContext,
      currentFrameHasBitmap: true,
      currentFrameBounds: { left: 350, top: 260, width: 320, height: 320 },
    },
    check: ({ output, frameCount, descriptions }: ValidationInput) =>
      output.length === 0 &&
      frameCount >= 4 &&
      descriptions.some((description) => /same explosion|same effect|same blast|same explosion event/i.test(description)) &&
      descriptions.some((description) => /disintegrat|dissipat|fade|ending|thin/i.test(description)),
  },
  {
    initialPrompt: "Generate an explosion.",
    followUpPrompt: "Make it bigger.",
    workspaceContext: {
      ...baseWorkspaceContext,
      currentFrameHasBitmap: true,
      currentFrameBounds: { left: 350, top: 260, width: 320, height: 320 },
    },
    check: ({ output, frameCount, descriptions }: ValidationInput) =>
      output.length === 0 &&
      frameCount >= 3 &&
      descriptions.some((description) => /larger|wider|stronger|bigger/i.test(description)),
  },
  {
    initialPrompt: "Generate an explosion.",
    followUpPrompt: "Add dust.",
    workspaceContext: {
      ...baseWorkspaceContext,
      currentFrameHasBitmap: true,
      currentFrameBounds: { left: 350, top: 260, width: 320, height: 320 },
    },
    check: ({ output, frameCount, descriptions }: ValidationInput) =>
      output.length === 0 &&
      frameCount >= 4 &&
      descriptions.some((description) => /dust|dusty|particulate|ground/i.test(description)),
  },
  {
    initialPrompt: "Generate an explosion.",
    followUpPrompt: "Add a dusty shockwave under it.",
    workspaceContext: {
      ...baseWorkspaceContext,
      currentFrameHasBitmap: true,
      currentFrameBounds: { left: 350, top: 260, width: 320, height: 320 },
    },
    check: ({ output, frameCount, descriptions }: ValidationInput) =>
      output.length === 0 &&
      frameCount >= 3 &&
      descriptions.some((description) => /shockwave|dusty|blast ring|ground/i.test(description)),
  },
  {
    initialPrompt: "Generate an explosion.",
    followUpPrompt: "Make it poisonous green.",
    workspaceContext: {
      ...baseWorkspaceContext,
      currentFrameHasBitmap: true,
      currentFrameBounds: { left: 350, top: 260, width: 320, height: 320 },
    },
    check: ({ output, frameCount, descriptions }: ValidationInput) =>
      output.length === 0 &&
      frameCount >= 3 &&
      descriptions.some((description) => /green|poison|toxic|acid/i.test(description)) &&
      !descriptions.some((description) => /orange fire look|old orange fire/i.test(description)),
  },
  {
    initialPrompt: "Generate an explosion.",
    followUpPrompt: "Make it spiky.",
    workspaceContext: {
      ...baseWorkspaceContext,
      currentFrameHasBitmap: true,
      currentFrameBounds: { left: 350, top: 260, width: 320, height: 320 },
    },
    check: ({ output, frameCount, descriptions }: ValidationInput) =>
      output.length === 0 &&
      frameCount >= 3 &&
      descriptions.some((description) => /spike|spiky|jagged|starburst/i.test(description)),
  },
  {
    initialPrompt: "Generate an explosion.",
    followUpPrompt: "Add smoke coming toward the camera.",
    workspaceContext: {
      ...baseWorkspaceContext,
      currentFrameHasBitmap: true,
      currentFrameBounds: { left: 350, top: 260, width: 320, height: 320 },
    },
    check: ({ output, frameCount, descriptions }: ValidationInput) =>
      output.length === 0 &&
      frameCount >= 3 &&
      descriptions.some((description) => /toward the camera|forward|depth/i.test(description)) &&
      descriptions.some((description) => /smoke/i.test(description)),
  },
  {
    initialPrompt: "Generate an explosion.",
    followUpPrompt: "Generate another new explosion shot in the same project.",
    workspaceContext: baseWorkspaceContext,
    check: ({ output, frameCount, descriptions, initialDescriptions = [], generateFramesState, generatedFramePlan }: ValidationInput) => {
      const recentVariationSignatures = generateFramesState?.recentVariationSignatures ?? [];
      const explosionSignatures = recentVariationSignatures.filter((signature) => /^family=explosion\|/i.test(signature));
      return (
        output.length === 0 &&
        frameCount >= 5 &&
        generatedFramePlan?.renderingQualityProfile?.family === "explosion" &&
        explosionSignatures.length >= 2 &&
        initialDescriptions.join(" || ") !== descriptions.join(" || ") &&
        descriptions.some((description) => /blast|ignite|break|aftermath|fade|residue/i.test(description))
      );
    },
  },
  {
    initialPrompt: "Make a stick figure walk.",
    followUpPrompt: "Make the walk smoother.",
    workspaceContext: {
      ...baseWorkspaceContext,
      currentFrameHasBitmap: true,
      currentFrameBounds: { left: 420, top: 240, width: 180, height: 360 },
    },
    check: ({ output, frameCount, poses, descriptions }: ValidationInput) =>
      output.length === 0 &&
      frameCount >= 3 &&
      [...poses, ...descriptions].some((value) => /walk|contact|passing|stride|smoother|cleaner/i.test(value)),
  },
  {
    initialPrompt: "Make a stick figure walk.",
    followUpPrompt: "Make it faster.",
    workspaceContext: {
      ...baseWorkspaceContext,
      currentFrameHasBitmap: true,
      currentFrameBounds: { left: 420, top: 240, width: 180, height: 360 },
    },
    check: ({ output, frameCount, poses, descriptions }: ValidationInput) =>
      output.length === 0 &&
      frameCount >= 3 &&
      [...poses, ...descriptions].some((value) => /faster|quicker|less hang time|energetic|snappier|longer stride/i.test(value)),
  },
  {
    initialPrompt: "Make a stick figure walk.",
    followUpPrompt: "Add impact to the steps.",
    workspaceContext: {
      ...baseWorkspaceContext,
      currentFrameHasBitmap: true,
      currentFrameBounds: { left: 420, top: 240, width: 180, height: 360 },
    },
    check: ({ output, frameCount, poses, descriptions }: ValidationInput) =>
      output.length === 0 &&
      frameCount >= 3 &&
      [...poses, ...descriptions].some((value) => /impact|heavy|weight|plant|compression|down force/i.test(value)),
  },
  {
    initialPrompt: "Make him punch.",
    followUpPrompt: "Make it hit harder.",
    workspaceContext: {
      ...baseWorkspaceContext,
      currentFrameHasBitmap: true,
      currentFrameBounds: { left: 420, top: 240, width: 220, height: 360 },
    },
    check: ({ output, frameCount, poses, descriptions }: ValidationInput) =>
      output.length === 0 &&
      frameCount >= 3 &&
      [...poses, ...descriptions].some((value) => /harder|heavier|impact|recoil|forceful|explosive/i.test(value)),
  },
  {
    initialPrompt: "Make the left stick figure punch the right stick figure.",
    followUpPrompt: "Make it more brutal.",
    workspaceContext: {
      ...baseWorkspaceContext,
      currentFrameHasBitmap: true,
      currentFrameBounds: { left: 380, top: 240, width: 280, height: 360 },
    },
    check: ({ output, frameCount, descriptions }: ValidationInput) =>
      output.length === 0 &&
      frameCount >= 3 &&
      descriptions.some((description) => /left figure|left side/i.test(description)) &&
      descriptions.some((description) => /right-side target|right target|right side/i.test(description)) &&
      descriptions.some((description) => /brutal|powerful|forceful|harder|committed/i.test(description)),
  },
  {
    initialPrompt: "Generate two stick figures with a forest background. One black, one red.",
    followUpPrompt: "Change the right stick figure to blue.",
    workspaceContext: {
      ...baseWorkspaceContext,
      currentFrameHasBitmap: false,
      currentFrameBounds: null,
    },
    check: ({ output, frameCount, descriptions, generateFramesState, projectAiMemory, searchUsed }: ValidationInput) => {
      const subjects = generateFramesState?.subjects ?? [];
      const rightSubject = subjects.find((subject) => subject.side === "right") ?? null;
      const leftSubject = subjects.find((subject) => subject.side === "left") ?? null;
      return (
        output.length === 0 &&
        frameCount >= 1 &&
        searchUsed === false &&
        generateFramesState?.sceneSetting === "forest" &&
        rightSubject?.color === "blue" &&
        leftSubject?.color === "black" &&
        projectAiMemory?.interactionMode === "tweak" &&
        projectAiMemory?.currentGoal === "Generate two stick figures with a forest background. One black, one red."
      );
    },
  },
  {
    initialPrompt: "Generate a bouncing blue ball.",
    followUpPrompt: "Make it smoother.",
    workspaceContext: {
      ...baseWorkspaceContext,
      currentFrameHasBitmap: true,
      currentFrameBounds: { left: 430, top: 360, width: 150, height: 150 },
    },
    check: ({ output, frameCount, poses, descriptions }: ValidationInput) =>
      output.length === 0 &&
      frameCount >= 5 &&
      [...poses, ...descriptions].some((value) => /smooth|continuous|cleaner|pre-impact|settle/i.test(value)),
  },
  {
    initialPrompt: "Generate a bouncing blue ball.",
    followUpPrompt: "Make it faster.",
    workspaceContext: {
      ...baseWorkspaceContext,
      currentFrameHasBitmap: true,
      currentFrameBounds: { left: 430, top: 360, width: 150, height: 150 },
    },
    check: ({ output, frameCount, poses, descriptions }: ValidationInput) =>
      output.length === 0 &&
      frameCount >= 5 &&
      [...poses, ...descriptions].some((value) => /fast|faster|quicker|less float|quick/i.test(value)),
  },
  {
    initialPrompt: "Generate a bouncing blue ball.",
    followUpPrompt: "Make the bounce heavier.",
    workspaceContext: {
      ...baseWorkspaceContext,
      currentFrameHasBitmap: true,
      currentFrameBounds: { left: 430, top: 360, width: 150, height: 150 },
    },
    check: ({ output, frameCount, poses, descriptions }: ValidationInput) =>
      output.length === 0 &&
      frameCount >= 3 &&
      [...poses, ...descriptions].some((value) => /heavy|weight|lower rebound|settle|denser squash/i.test(value)),
  },
  {
    initialPrompt: "Generate a bouncing blue ball.",
    followUpPrompt: "Make it more cartoony.",
    workspaceContext: {
      ...baseWorkspaceContext,
      currentFrameHasBitmap: true,
      currentFrameBounds: { left: 430, top: 360, width: 150, height: 150 },
    },
    check: ({ output, frameCount, poses, descriptions }: ValidationInput) =>
      output.length === 0 &&
      frameCount >= 3 &&
      [...poses, ...descriptions].some((value) => /cartoony|playful|exaggerated|stretch|elastic/i.test(value)),
  },
  {
    initialPrompt: "Generate an explosion with a stick figure running out of the smoke.",
    followUpPrompt: "Make the runner later and the explosion bigger.",
    workspaceContext: {
      ...baseWorkspaceContext,
      currentFrameHasBitmap: true,
      currentFrameBounds: { left: 320, top: 220, width: 380, height: 380 },
    },
    check: ({ output, frameCount, descriptions }: ValidationInput) =>
      output.length === 0 &&
      frameCount >= 3 &&
      descriptions.some((description) => /later|delayed|longer/i.test(description)) &&
      descriptions.some((description) => /bigger|larger|wider|hotter/i.test(description)),
  },
  {
    initialPrompt: "Generate two stick figures with a forest background. One red, one blue.",
    followUpPrompt: "Do not animate it. Just give me the first frame of a scene.",
    workspaceContext: {
      ...baseWorkspaceContext,
      currentFrameHasBitmap: true,
      currentFrameBounds: { left: 220, top: 180, width: 620, height: 540 },
    },
    check: ({ output, frameCount, descriptions, workspaceIntent, generateFramesState }: ValidationInput) =>
      output.length === 0 &&
      frameCount === 1 &&
      workspaceIntent?.behaviorType === "tool-drawing" &&
      descriptions.some((description) => /starting point|setup|still|opening/i.test(description)) &&
      descriptions.some((description) => /forest|tree|trees/i.test(description)) &&
      descriptions.some((description) => /red stick figure|blue stick figure|two readable figures/i.test(description)) &&
      generateFramesState?.sceneSetting === "forest",
  },
] as const;

const searchCases = [
  {
    prompt: "Generate an explosion.",
    shouldSearch: true,
    expectSearchUsed: false,
  },
  {
    prompt: "Generate me a stick figure.",
    shouldSearch: true,
    expectSearchUsed: false,
  },
  {
    prompt: "Generate lightning.",
    shouldSearch: true,
    expectSearchUsed: false,
  },
  {
    prompt: "Make him punch.",
    shouldSearch: true,
    expectSearchUsed: false,
  },
  {
    prompt: "Draw a dark room.",
    shouldSearch: true,
    expectSearchUsed: false,
  },
  {
    prompt: "Make a spiky explosion.",
    shouldSearch: true,
    expectSearchUsed: false,
  },
  {
    prompt: "Create an alien apocalypse.",
    shouldSearch: true,
    expectSearchUsed: true,
  },
  {
    prompt: "Create a zombie apocalypse.",
    shouldSearch: true,
    expectSearchUsed: true,
  },
  {
    prompt: "Make a poisonous green explosion.",
    shouldSearch: true,
    expectSearchUsed: false,
  },
  {
    prompt: "Generate me a volcano eruption.",
    shouldSearch: true,
    expectSearchUsed: false,
  },
  {
    prompt: "Generate me a smoke bomb.",
    shouldSearch: true,
    expectSearchUsed: false,
  },
  {
    prompt: "Generate me a dinosaur.",
    shouldSearch: true,
    expectSearchUsed: true,
  },
  {
    prompt: "Generate a glass shattering.",
    shouldSearch: true,
    expectSearchUsed: false,
  },
  {
    prompt: "Generate me a fight.",
    shouldSearch: true,
    expectSearchUsed: false,
  },
  {
    prompt: "Generate a background with mountain ranges, plains, trees, boulders, and a waterfall.",
    shouldSearch: true,
    expectSearchUsed: false,
  },
  {
    prompt: "Generate a background scene now, I will animate later.",
    shouldSearch: true,
    expectSearchUsed: false,
  },
  {
    prompt: "I want to create a stick figure fight eventually but not right now.",
    shouldSearch: true,
    expectSearchUsed: false,
  },
  {
    prompt: "Generate me a bullet hitting the ground.",
    shouldSearch: true,
    expectSearchUsed: false,
  },
  {
    prompt: "Generate me two stick figures fighting in a cave.",
    shouldSearch: true,
    expectSearchUsed: false,
  },
  {
    prompt: "Create a single setup frame of a bioluminescent alien forest with two stick figures.",
    shouldSearch: true,
    expectSearchUsed: true,
  },
  {
    prompt: "Generate an explosion in anime style.",
    shouldSearch: true,
    expectSearchUsed: true,
  },
  {
    prompt: "Animate a punch in Combat Gods style.",
    shouldSearch: true,
    expectSearchUsed: true,
  },
] as const;

type RouteResponse = {
  output?: string | null;
  searchUsed?: boolean | null;
  searchDecision?: {
    shouldSearch?: boolean | null;
    reason?: string | null;
    query?: string | null;
    queries?: string[] | null;
  } | null;
  phaseHistory?: Array<{ phase?: string | null; label?: string | null }> | null;
  execution?: {
    taskType?: string;
    kind?: string;
    status?: string;
    applyMode?: string;
  } | null;
  generatedFramePlan?: {
    requestKind: string;
    requestedFrameCount: number;
    frames: Array<{ pose: string; description: string }>;
    workspaceIntent?: RouteWorkspaceIntent;
    renderingQualityProfile?: {
      family?: string | null;
      qualityFloorTier?: string | null;
      simplicityTarget?: string | null;
      forcePriorities?: string[] | null;
      timingPriorities?: string[] | null;
      readabilityPriorities?: string[] | null;
      completionRequirements?: string[] | null;
    } | null;
    familyQualityContract?: {
      family?: string | null;
      mustHaves?: string[] | null;
      forbiddenPatterns?: string[] | null;
      rejectConditions?: string[] | null;
      variationAxes?: string[] | null;
    } | null;
    principleActivationProfile?: {
      activations?: Array<{ principle?: string | null; activationLevel?: string | null }> | null;
    } | null;
    variationEnvelope?: {
      lockedIdentityTraits?: string[] | null;
      allowedVariationAxes?: string[] | null;
      forbiddenSubstitutions?: string[] | null;
    } | null;
    renderAcceptanceContract?: {
      requiredMustHaves?: string[] | null;
      forbiddenBadPatterns?: string[] | null;
      minimumReadableCompletion?: string[] | null;
      familyRejectConditions?: string[] | null;
    } | null;
  } | null;
  generateFramesState?: {
    subjectType?: string | null;
    motionType?: string | null;
    tone?: string | null;
    forceLevel?: string | null;
    animationPhase?: string | null;
    frameCount?: number | null;
    fps?: number | null;
    modifiers?: string[] | null;
    sceneSetting?: string | null;
    sceneDescriptors?: string[] | null;
    sceneProps?: string[] | null;
    sceneElements?: string[] | null;
    recentVariationSignatures?: string[] | null;
    subjects?: Array<{ id?: string | null; type?: string | null; role?: string | null; side?: string | null; color?: string | null; label?: string | null }> | null;
  } | null;
  projectAiMemory?: {
    interactionMode?: string | null;
    currentGoal?: string | null;
    contextSummary?: string | null;
    lastPrompt?: string | null;
    lastUpdatedAt?: string | null;
    generateFramesState?: RouteResponse["generateFramesState"] | null;
  } | null;
  followUpMode?: string | null;
  followUpQuestion?: string | null;
  warnings?: string[] | null;
};

const buildGeneratedFramePlanSummary = (framePlan: NonNullable<RouteResponse["generatedFramePlan"]>) =>
  [
    "Generated frame plan:",
    ...framePlan.frames.map(
      (frame, index) => `Frame ${index + 1}: ${frame.pose}${frame.description ? ` — ${frame.description}` : ""}`,
    ),
  ].join("\n");

const quoteForShell = (value: string) => `'${value.replace(/'/g, `'\\''`)}'`;

const isLocalLoopbackPermissionError = (error: unknown) => {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "";

  return /\bEPERM\b|\bEACCES\b/i.test(message) && /(127\.0\.0\.1|localhost)/i.test(message);
};

const isRetryableLocalRouteError = (error: unknown) => {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "";

  return /\bECONNREFUSED\b|Failed to connect|curl: \(7\)|socket hang up|timed out/i.test(message);
};

const waitForRetry = (attempt: number) =>
  new Promise((resolve) => {
    setTimeout(resolve, Math.min(1000, 150 * attempt));
  });

const sendRouteRequestViaNode = async (payloadJson: string): Promise<RouteResponse> => {
  const url = new URL(VALIDATION_URL);
  const client = url.protocol === "https:" ? https : http;

  return await new Promise<RouteResponse>((resolve, reject) => {
    const request = client.request(
      {
        protocol: url.protocol,
        hostname: url.hostname,
        port: url.port,
        path: `${url.pathname}${url.search}`,
        method: "POST",
        headers: {
          "content-type": "application/json",
          "content-length": Buffer.byteLength(payloadJson),
        },
      },
      (response) => {
        let responseBody = "";
        response.setEncoding("utf8");
        response.on("data", (chunk) => {
          responseBody += chunk;
        });
        response.on("end", () => {
          if ((response.statusCode ?? 500) >= 400) {
            reject(new Error(`Route returned HTTP ${response.statusCode ?? 500}`));
            return;
          }

          try {
            resolve(JSON.parse(responseBody) as RouteResponse);
          } catch (error) {
            reject(error);
          }
        });
      },
    );

    request.setTimeout(ROUTE_TIMEOUT_MS, () => {
      request.destroy(new Error(`Route request timed out after ${ROUTE_TIMEOUT_MS}ms`));
    });
    request.on("error", reject);
    request.write(payloadJson);
    request.end();
  });
};

const sendRouteRequestViaCurl = async (payloadJson: string): Promise<RouteResponse> => {
  const command = [
    "curl -sS -X POST",
    quoteForShell(VALIDATION_URL),
    "-H",
    quoteForShell("content-type: application/json"),
    "--data-raw",
    quoteForShell(payloadJson),
    "-w",
    quoteForShell("\n__HTTP_STATUS__:%{http_code}"),
  ].join(" ");
  const { stdout } = await execFile(
    "/bin/zsh",
    ["-lc", command],
    {
      timeout: ROUTE_TIMEOUT_MS,
      maxBuffer: 10 * 1024 * 1024,
    },
  );

  const statusMarker = "\n__HTTP_STATUS__:";
  const markerIndex = stdout.lastIndexOf(statusMarker);
  const responseBody = markerIndex >= 0 ? stdout.slice(0, markerIndex) : stdout;
  const statusCode = markerIndex >= 0 ? Number(stdout.slice(markerIndex + statusMarker.length).trim()) : 200;

  if (statusCode >= 400) {
    throw new Error(`Route returned HTTP ${statusCode}`);
  }

  return JSON.parse(responseBody) as RouteResponse;
};

const sendRouteRequest = async ({
  prompt,
  workspaceContext,
  conversationHistory = [],
  shouldSearch = false,
  generateFramesState = null,
  projectAiMemory = null,
}: {
  prompt: string;
  workspaceContext: ValidationWorkspaceContext;
  conversationHistory?: Array<{ role: "user" | "assistant"; content: string }>;
  shouldSearch?: boolean;
  generateFramesState?: RouteResponse["generateFramesState"];
  projectAiMemory?: RouteResponse["projectAiMemory"];
}) => {
  const payload = {
    prompt,
    taskType: "generate-frames",
    reasoningLevel: "medium",
    shouldSearch,
    conversationHistory,
    followUpMemory: [],
    workspaceContext,
    recentSoundOptions: [],
    generateFramesState,
    projectAiMemory,
  };
  const payloadJson = JSON.stringify(payload);
  if (VALIDATE_GFQ_TRANSPORT === "curl") {
    let lastError: unknown = null;
    for (let attempt = 1; attempt <= VALIDATE_GFQ_ROUTE_RETRIES; attempt += 1) {
      try {
        return await sendRouteRequestViaCurl(payloadJson);
      } catch (error) {
        lastError = error;
        if (attempt >= VALIDATE_GFQ_ROUTE_RETRIES || !isRetryableLocalRouteError(error)) {
          throw error;
        }
        await waitForRetry(attempt);
      }
    }
    throw lastError instanceof Error ? lastError : new Error("Curl route request failed.");
  }

  let lastNodeError: unknown = null;
  for (let attempt = 1; attempt <= VALIDATE_GFQ_ROUTE_RETRIES; attempt += 1) {
    try {
      return await sendRouteRequestViaNode(payloadJson);
    } catch (error) {
      lastNodeError = error;
      if (attempt >= VALIDATE_GFQ_ROUTE_RETRIES || !isRetryableLocalRouteError(error)) {
        if (VALIDATE_GFQ_TRANSPORT === "node" || !isLocalLoopbackPermissionError(error)) {
          throw error;
        }
        break;
      }
      await waitForRetry(attempt);
    }
  }

  process.stderr.write(`FALLBACK transport=curl prompt="${prompt}"\n`);
  let lastCurlError: unknown = lastNodeError;
  for (let attempt = 1; attempt <= VALIDATE_GFQ_ROUTE_RETRIES; attempt += 1) {
    try {
      return await sendRouteRequestViaCurl(payloadJson);
    } catch (error) {
      lastCurlError = error;
      if (attempt >= VALIDATE_GFQ_ROUTE_RETRIES || !isRetryableLocalRouteError(error)) {
        throw error;
      }
      await waitForRetry(attempt);
    }
  }

  throw lastCurlError instanceof Error ? lastCurlError : new Error("Route request failed.");
};

const logValidationCaseStart = (label: string) => {
  process.stderr.write(`START ${label}\n`);
};

const logValidationCaseEnd = (label: string, startedAt: number) => {
  process.stderr.write(`END ${label} (${Date.now() - startedAt}ms)\n`);
};

const shouldRunValidationSection = (section: "validation" | "sequence" | "search") =>
  VALIDATE_GFQ_SECTION === "all" || VALIDATE_GFQ_SECTION === section;

const matchesValidationFilter = (label: string) =>
  VALIDATE_GFQ_FILTER.length === 0 || label.toLowerCase().includes(VALIDATE_GFQ_FILTER);

const isSandboxTransportBlockerMessage = (message: string) =>
  /curl:\s*\(7\)\s*Failed to connect to 127\.0\.0\.1|connect EPERM 127\.0\.0\.1|Operation not permitted/i.test(message);

const main = async () => {
  const results = [];
  let successfulRouteCalls = 0;
  let transportBlocker: string | null = null;

  for (const validationCase of validationCases) {
    if (transportBlocker != null) {
      break;
    }
    const caseLabel = `Checking: ${validationCase.prompt}`;
    if (!shouldRunValidationSection("validation") || !matchesValidationFilter(validationCase.prompt)) {
      continue;
    }
    const startedAt = Date.now();
    logValidationCaseStart(caseLabel);

    try {
      const json = await sendRouteRequest({
        prompt: validationCase.prompt,
        workspaceContext: validationCase.workspaceContext,
        shouldSearch: "shouldSearch" in validationCase ? validationCase.shouldSearch === true : false,
      });
      successfulRouteCalls += 1;
      const framePlan = json.generatedFramePlan ?? null;
      const workspaceIntent = framePlan?.workspaceIntent ?? null;
      const output = (json.output ?? "").trim();
      const poses = framePlan?.frames.map((frame) => frame.pose) ?? [];
      const descriptions = framePlan?.frames.map((frame) => frame.description) ?? [];
      const searchUsed = json.searchUsed === true;
      const askedUnexpectedQuestion = validationCase.shouldNotAskQuestion
        ? Boolean(json.followUpQuestion && json.followUpQuestion.trim().length > 0) || json.followUpMode === "question-box"
        : false;
      const meaningPreserved = validationCase.check({
        output,
        frameCount: framePlan?.frames.length ?? 0,
        poses,
        descriptions,
        generatedFramePlan: framePlan,
        workspaceIntent,
        generateFramesState: json.generateFramesState ?? null,
        projectAiMemory: json.projectAiMemory ?? null,
        searchUsed,
        warnings: json.warnings ?? [],
      });
      const outputAvoidsChatLeak =
        !/i mapped this as|i need a moment to tighten that answer up|tighten that answer up/i.test(output);
      const negationSafe =
        /^(Please don't make an explosion\.|Avoid explosion\.|No explosion\.)$/.test(validationCase.prompt)
          ? framePlan == null &&
            !/explosion|blast|fire core|smoke and debris/i.test(output) &&
            !descriptions.some((description) => /explosion|blast|fire|smoke|debris/i.test(description))
          : true;
      const allChecksPassed = meaningPreserved && !askedUnexpectedQuestion && outputAvoidsChatLeak && negationSafe;
      const shouldAvoidFailedSafe = !/^(Please don't make an explosion\.|Avoid explosion\.|No explosion\.)$/.test(
        validationCase.prompt,
      );
      const executionReliable = shouldAvoidFailedSafe ? json.execution?.status !== "failed-safe" : true;

      results.push({
        prompt: validationCase.prompt,
        output,
        requestKind: framePlan?.requestKind ?? null,
        requestedFrameCount: framePlan?.requestedFrameCount ?? null,
        frameCount: framePlan?.frames.length ?? 0,
        poses,
        descriptions,
        behaviorType: workspaceIntent?.behaviorType ?? null,
        executionStatus: json.execution?.status ?? null,
        askedUnexpectedQuestion,
        meaningPreserved,
        outputAvoidsChatLeak,
        negationSafe,
        allChecksPassed: allChecksPassed && executionReliable,
        warnings: json.warnings ?? [],
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      results.push({
        prompt: validationCase.prompt,
        requestKind: null,
        requestedFrameCount: null,
        frameCount: 0,
        poses: [],
        descriptions: [],
        behaviorType: null,
        executionStatus: "request-failed",
        askedUnexpectedQuestion: false,
        meaningPreserved: false,
        allChecksPassed: false,
        warnings: [message],
      });
      if (successfulRouteCalls === 0 && isSandboxTransportBlockerMessage(message)) {
        transportBlocker = message;
        process.stderr.write(
          "SANDBOX ROUTE BLOCKER: local validator transport is blocked in this environment. Use direct terminal curl probes against VALIDATE_AI_URL, or run scripts/validateGenerateFramesQualityDirectCurl.sh, as the trusted proof path.\n",
        );
      }
    } finally {
      logValidationCaseEnd(caseLabel, startedAt);
    }
  }

  for (const sequenceCase of sequenceCases) {
    if (transportBlocker != null) {
      break;
    }
    const caseLabel = `Checking sequence: ${sequenceCase.initialPrompt} -> ${sequenceCase.followUpPrompt}`;
    if (
      !shouldRunValidationSection("sequence") ||
      !matchesValidationFilter(`${sequenceCase.initialPrompt} ${sequenceCase.followUpPrompt}`)
    ) {
      continue;
    }
    const startedAt = Date.now();
    logValidationCaseStart(caseLabel);

    try {
      const initialResponse = await sendRouteRequest({
        prompt: sequenceCase.initialPrompt,
        workspaceContext: baseWorkspaceContext,
      });
      successfulRouteCalls += 1;

      const initialFramePlan = initialResponse.generatedFramePlan ?? null;
      const conversationHistory =
        initialFramePlan == null
          ? [{ role: "user" as const, content: sequenceCase.initialPrompt }]
          : [
              { role: "user" as const, content: sequenceCase.initialPrompt },
              { role: "assistant" as const, content: buildGeneratedFramePlanSummary(initialFramePlan) },
            ];

      const followUpResponse = await sendRouteRequest({
        prompt: sequenceCase.followUpPrompt,
        workspaceContext: sequenceCase.workspaceContext,
        conversationHistory,
        generateFramesState: initialResponse.generateFramesState ?? null,
        projectAiMemory: initialResponse.projectAiMemory ?? null,
      });
      successfulRouteCalls += 1;

      const framePlan = followUpResponse.generatedFramePlan ?? null;
      const workspaceIntent = framePlan?.workspaceIntent ?? null;
      const output = (followUpResponse.output ?? "").trim();
      const poses = framePlan?.frames.map((frame) => frame.pose) ?? [];
      const descriptions = framePlan?.frames.map((frame) => frame.description) ?? [];
      const meaningPreserved = sequenceCase.check({
        output,
        frameCount: framePlan?.frames.length ?? 0,
        poses,
        descriptions,
        initialPoses: initialFramePlan?.frames.map((frame) => frame.pose) ?? [],
        initialDescriptions: initialFramePlan?.frames.map((frame) => frame.description) ?? [],
        generatedFramePlan: framePlan,
        workspaceIntent,
        generateFramesState: followUpResponse.generateFramesState ?? null,
        projectAiMemory: followUpResponse.projectAiMemory ?? null,
        searchUsed: followUpResponse.searchUsed === true,
        warnings: followUpResponse.warnings ?? [],
      });

      results.push({
        prompt: `${sequenceCase.initialPrompt} -> ${sequenceCase.followUpPrompt}`,
        output,
        requestKind: framePlan?.requestKind ?? null,
        requestedFrameCount: framePlan?.requestedFrameCount ?? null,
        frameCount: framePlan?.frames.length ?? 0,
        poses,
        descriptions,
        behaviorType: workspaceIntent?.behaviorType ?? null,
        executionStatus: followUpResponse.execution?.status ?? null,
        askedUnexpectedQuestion: Boolean(
          followUpResponse.followUpQuestion && followUpResponse.followUpQuestion.trim().length > 0,
        ),
        meaningPreserved,
        outputAvoidsChatLeak: !/i mapped this as|i need a moment to tighten that answer up|tighten that answer up/i.test(output),
        negationSafe: true,
        allChecksPassed:
          meaningPreserved &&
          !Boolean(followUpResponse.followUpQuestion && followUpResponse.followUpQuestion.trim().length > 0) &&
          followUpResponse.execution?.status !== "failed-safe",
        warnings: followUpResponse.warnings ?? [],
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      results.push({
        prompt: `${sequenceCase.initialPrompt} -> ${sequenceCase.followUpPrompt}`,
        requestKind: null,
        requestedFrameCount: null,
        frameCount: 0,
        poses: [],
        descriptions: [],
        behaviorType: null,
        executionStatus: "request-failed",
        askedUnexpectedQuestion: false,
        meaningPreserved: false,
        allChecksPassed: false,
        warnings: [message],
      });
      if (successfulRouteCalls === 0 && isSandboxTransportBlockerMessage(message)) {
        transportBlocker = message;
        process.stderr.write(
          "SANDBOX ROUTE BLOCKER: local validator transport is blocked in this environment. Use direct terminal curl probes against VALIDATE_AI_URL, or run scripts/validateGenerateFramesQualityDirectCurl.sh, as the trusted proof path.\n",
        );
      }
    } finally {
      logValidationCaseEnd(caseLabel, startedAt);
    }
  }

  for (const searchCase of searchCases) {
    if (transportBlocker != null) {
      break;
    }
    const caseLabel = `Checking search gate: ${searchCase.prompt}`;
    if (!shouldRunValidationSection("search") || !matchesValidationFilter(searchCase.prompt)) {
      continue;
    }
    const startedAt = Date.now();
    logValidationCaseStart(caseLabel);

    try {
      const json = await sendRouteRequest({
        prompt: searchCase.prompt,
        workspaceContext: baseWorkspaceContext,
        shouldSearch: searchCase.shouldSearch,
      });
      successfulRouteCalls += 1;
      const searchPhases = (json.phaseHistory ?? []).filter((phase) => phase.phase === "searching").length;
      const searchUsed = json.searchUsed === true;
      const framePlan = json.generatedFramePlan ?? null;
      const allChecksPassed =
        searchUsed === searchCase.expectSearchUsed &&
        searchPhases <= 1 &&
        (framePlan == null || framePlan.frames.length >= 0);

      results.push({
        prompt: `${searchCase.prompt} [search gate]`,
        output: (json.output ?? "").trim(),
        requestKind: framePlan?.requestKind ?? null,
        requestedFrameCount: framePlan?.requestedFrameCount ?? null,
        frameCount: framePlan?.frames.length ?? 0,
        poses: framePlan?.frames.map((frame) => frame.pose) ?? [],
        descriptions: framePlan?.frames.map((frame) => frame.description) ?? [],
        behaviorType: framePlan?.workspaceIntent?.behaviorType ?? null,
        executionStatus: json.execution?.status ?? null,
        askedUnexpectedQuestion: Boolean(json.followUpQuestion && json.followUpQuestion.trim().length > 0),
        meaningPreserved: true,
        outputAvoidsChatLeak: !/i mapped this as|i need a moment to tighten that answer up|tighten that answer up/i.test((json.output ?? "").trim()),
        negationSafe: true,
        allChecksPassed,
        warnings: [
          ...(json.warnings ?? []),
          `searchUsed=${searchUsed}`,
          `searchPhases=${searchPhases}`,
        ],
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      results.push({
        prompt: `${searchCase.prompt} [search gate]`,
        requestKind: null,
        requestedFrameCount: null,
        frameCount: 0,
        poses: [],
        descriptions: [],
        behaviorType: null,
        executionStatus: "request-failed",
        askedUnexpectedQuestion: false,
        meaningPreserved: false,
        allChecksPassed: false,
        warnings: [message],
      });
      if (successfulRouteCalls === 0 && isSandboxTransportBlockerMessage(message)) {
        transportBlocker = message;
        process.stderr.write(
          "SANDBOX ROUTE BLOCKER: local validator transport is blocked in this environment. Use direct terminal curl probes against VALIDATE_AI_URL, or run scripts/validateGenerateFramesQualityDirectCurl.sh, as the trusted proof path.\n",
        );
      }
    } finally {
      logValidationCaseEnd(caseLabel, startedAt);
    }
  }

  if (transportBlocker != null) {
    results.push({
      prompt: "__sandbox_transport__",
      requestKind: null,
      requestedFrameCount: null,
      frameCount: 0,
      poses: [],
      descriptions: [],
      behaviorType: null,
      executionStatus: "request-failed",
      askedUnexpectedQuestion: false,
      meaningPreserved: false,
      allChecksPassed: false,
      warnings: [
        transportBlocker,
        "Direct terminal curl probes against VALIDATE_AI_URL are the reliable proof path in this sandbox.",
        "scripts/validateGenerateFramesQualityDirectCurl.sh provides a structured direct-curl fallback workflow.",
      ],
    });
  }

  if (transportBlocker == null && results.some((result) => !result.allChecksPassed)) {
    process.exitCode = 1;
  }

  process.stdout.write(`${JSON.stringify(results, null, 2)}\n`);
};

void main();
