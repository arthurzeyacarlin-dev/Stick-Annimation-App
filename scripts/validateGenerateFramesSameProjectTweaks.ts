export {};

import { execFile } from "node:child_process";
import { promisify } from "node:util";

const VALIDATE_AI_URL = process.env.VALIDATE_AI_URL ?? "http://127.0.0.1:3011/api/ai";
const VALIDATE_AI_TIMEOUT_MS = Number.parseInt(process.env.VALIDATE_AI_TIMEOUT_MS ?? "90000", 10);
const VALIDATE_REASONING_LEVEL = process.env.VALIDATE_REASONING_LEVEL ?? "medium";
const execFileAsync = promisify(execFile);

type RouteSubject = {
  id?: string | null;
  side?: string | null;
  role?: string | null;
  label?: string | null;
  color?: string | null;
  details?: string[] | null;
  type?: string | null;
};

type RouteState = {
  ownerProjectId?: string | null;
  subjectType?: string | null;
  motionType?: string | null;
  tone?: string | null;
  forceLevel?: string | null;
  sceneSetting?: string | null;
  subjects?: RouteSubject[] | null;
  recentEdits?: string[] | null;
};

type RouteResponse = {
  execution?: {
    status?: string | null;
  } | null;
  searchUsed?: boolean | null;
  generateFramesState?: RouteState | null;
  projectAiMemory?: {
    ownerProjectId?: string | null;
    interactionMode?: string | null;
    currentGoal?: string | null;
    contextSummary?: string | null;
    recentEdits?: string[] | null;
    generateFramesState?: RouteState | null;
  } | null;
};

const makeWorkspaceContext = (projectId: string) => ({
  projectId,
  projectTitle: "Same Project Tweak Validation",
  activeLayerId: "layer-1",
  activeLayerName: "Layer 1",
  totalLayers: 2,
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
  canvasWidth: 1024,
  canvasHeight: 1024,
});

const postToRoute = async ({
  projectId,
  prompt,
  generateFramesState,
  projectAiMemory,
}: {
  projectId: string;
  prompt: string;
  generateFramesState?: unknown;
  projectAiMemory?: unknown;
}) => {
  const requestBody = JSON.stringify({
    prompt,
    taskType: "generate-frames",
    reasoningLevel: VALIDATE_REASONING_LEVEL,
    shouldSearch: false,
    conversationHistory: [],
    followUpMemory: [],
    workspaceContext: makeWorkspaceContext(projectId),
    recentSoundOptions: [],
    generateFramesState: generateFramesState ?? null,
    projectAiMemory: projectAiMemory ?? null,
  });

  const { stdout } = await execFileAsync(
    "curl",
    [
      "-s",
      "-X",
      "POST",
      VALIDATE_AI_URL,
      "-H",
      "content-type: application/json",
      "--data-raw",
      requestBody,
    ],
    {
      timeout: VALIDATE_AI_TIMEOUT_MS,
      maxBuffer: 8 * 1024 * 1024,
    },
  );

  return JSON.parse(stdout) as RouteResponse;
};

const getSubjects = (response: RouteResponse) =>
  response.projectAiMemory?.generateFramesState?.subjects ??
  response.generateFramesState?.subjects ??
  [];

const findByColor = (subjects: readonly RouteSubject[], color: string) =>
  subjects.find((subject) => (subject.color ?? "").toLowerCase() === color.toLowerCase()) ?? null;

const hasDetail = (subject: RouteSubject | null, pattern: RegExp) =>
  (subject?.details ?? []).some((detail) => pattern.test(detail));

const projectId = "project-same-project-tweak-validation";

const step1 = await postToRoute({
  projectId,
  prompt: "Generate two stick figures. The one on the left is red and the one on the right is blue.",
});

const step2 = await postToRoute({
  projectId,
  prompt: "The blue stick figure's head needs to be a solid blue. The red stick figure's head also needs to be a solid red. No face is visible.",
  generateFramesState: step1.generateFramesState ?? null,
  projectAiMemory: step1.projectAiMemory ?? null,
});

const step3 = await postToRoute({
  projectId,
  prompt: "Make them face each other in a guard stance.",
  generateFramesState: step2.generateFramesState ?? null,
  projectAiMemory: step2.projectAiMemory ?? null,
});

const step4 = await postToRoute({
  projectId,
  prompt: "Make the blue one slightly taller.",
  generateFramesState: step3.generateFramesState ?? null,
  projectAiMemory: step3.projectAiMemory ?? null,
});

const step5 = await postToRoute({
  projectId,
  prompt: "Continue from the current drawing.",
  generateFramesState: step4.generateFramesState ?? null,
  projectAiMemory: step4.projectAiMemory ?? null,
});

const singleProjectId = "project-single-figure-tweak-validation";

const singleStep1 = await postToRoute({
  projectId: singleProjectId,
  prompt: "Generate me a stick figure.",
});

const singleStep2 = await postToRoute({
  projectId: singleProjectId,
  prompt: "Make him bigger.",
  generateFramesState: singleStep1.generateFramesState ?? null,
  projectAiMemory: singleStep1.projectAiMemory ?? null,
});

const singleStep3 = await postToRoute({
  projectId: singleProjectId,
  prompt: "Make him green.",
  generateFramesState: singleStep2.generateFramesState ?? null,
  projectAiMemory: singleStep2.projectAiMemory ?? null,
});

const singleStep4 = await postToRoute({
  projectId: singleProjectId,
  prompt: "Make him punch another stick figure.",
  generateFramesState: singleStep3.generateFramesState ?? null,
  projectAiMemory: singleStep3.projectAiMemory ?? null,
});

const singleStep5 = await postToRoute({
  projectId: singleProjectId,
  prompt: "Make the punch more violent.",
  generateFramesState: singleStep4.generateFramesState ?? null,
  projectAiMemory: singleStep4.projectAiMemory ?? null,
});

const backgroundProjectId = "project-background-addition-validation";

const backgroundStep1 = await postToRoute({
  projectId: backgroundProjectId,
  prompt: "Generate two stick figures. The one on the left is red and the one on the right is blue.",
});

const backgroundStep2 = await postToRoute({
  projectId: backgroundProjectId,
  prompt: "Add a cave background behind them.",
  generateFramesState: backgroundStep1.generateFramesState ?? null,
  projectAiMemory: backgroundStep1.projectAiMemory ?? null,
});

const step1Subjects = getSubjects(step1);
const step2Subjects = getSubjects(step2);
const step3Subjects = getSubjects(step3);
const step4Subjects = getSubjects(step4);
const step5State = step5.projectAiMemory?.generateFramesState ?? step5.generateFramesState ?? null;
const singleStep5State = singleStep5.projectAiMemory?.generateFramesState ?? singleStep5.generateFramesState ?? null;
const backgroundSubjects = getSubjects(backgroundStep2);

const redStep2 = findByColor(step2Subjects, "red");
const blueStep2 = findByColor(step2Subjects, "blue");
const redStep3 = findByColor(step3Subjects, "red");
const blueStep3 = findByColor(step3Subjects, "blue");
const redStep4 = findByColor(step4Subjects, "red");
const blueStep4 = findByColor(step4Subjects, "blue");

const results = {
  sameProjectChainStartsWithTwoColoredSubjects:
    step1.execution?.status === "completed-frames" &&
    step1.searchUsed === false &&
    step1Subjects.filter((subject) => subject.type === "character").length >= 2 &&
    findByColor(step1Subjects, "red") != null &&
    findByColor(step1Subjects, "blue") != null,
  targetedHeadTweaksPreserveBothSubjectsAndHideFaces:
    step2.execution?.status === "completed-frames" &&
    step2.projectAiMemory?.interactionMode === "tweak" &&
    step2Subjects.filter((subject) => subject.type === "character").length >= 2 &&
    hasDetail(redStep2, /\bsolid red head\b/i) &&
    hasDetail(blueStep2, /\bsolid blue head\b/i) &&
    hasDetail(redStep2, /\bno visible face\b/i) &&
    hasDetail(blueStep2, /\bno visible face\b/i),
  guardStanceEditKeepsTwoSubjectScene:
    step3Subjects.filter((subject) => subject.type === "character").length >= 2 &&
    hasDetail(redStep3, /\bguard stance\b/i) &&
    hasDetail(blueStep3, /\bguard stance\b/i) &&
    hasDetail(redStep3, /\bfacing each other\b/i) &&
    hasDetail(blueStep3, /\bfacing each other\b/i),
  targetedScaleEditBindsToBlueFigureOnly:
    hasDetail(blueStep4, /\bslightly taller\b|\btaller\b/i) &&
    !hasDetail(redStep4, /\bslightly taller\b|\btaller\b/i),
  continueFromCurrentDrawingKeepsStateAnchor:
    step5.projectAiMemory?.interactionMode === "continue" &&
    (step5State?.subjects ?? []).filter((subject) => subject.type === "character").length >= 2 &&
    (step5.projectAiMemory?.recentEdits ?? []).length >= 3,
  singleFigureTweaksStayStateful:
    singleStep5.projectAiMemory?.interactionMode === "tweak" &&
    (singleStep5State?.subjects ?? []).filter((subject) => subject.type === "character").length >= 2 &&
    findByColor(singleStep5State?.subjects ?? [], "green") != null &&
    ((singleStep5State?.forceLevel ?? "") === "high" || (singleStep5State?.tone ?? "") === "brutal"),
  backgroundAdditionKeepsCharacterAndAddsScene:
    backgroundStep2.projectAiMemory?.interactionMode === "tweak" &&
    backgroundStep2.searchUsed === false &&
    (backgroundStep2.projectAiMemory?.generateFramesState?.sceneSetting ?? backgroundStep2.generateFramesState?.sceneSetting) === "cave" &&
    backgroundSubjects.filter((subject) => subject.type === "character").length >= 2 &&
    backgroundSubjects.some((subject) => subject.type === "background"),
};

const allChecksPassed = Object.values(results).every(Boolean);

console.log(
  JSON.stringify(
    {
      allChecksPassed,
      results,
      diagnostics: {
        step2Subjects,
        step3Subjects,
        step4Subjects,
        step5InteractionMode: step5.projectAiMemory?.interactionMode ?? null,
        singleStep5State,
        backgroundState: backgroundStep2.projectAiMemory?.generateFramesState ?? backgroundStep2.generateFramesState ?? null,
      },
    },
    null,
    2,
  ),
);

if (!allChecksPassed) {
  process.exit(1);
}
