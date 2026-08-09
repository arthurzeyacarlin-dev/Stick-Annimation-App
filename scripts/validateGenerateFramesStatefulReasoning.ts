export {};

import { execFile } from "node:child_process";
import { promisify } from "node:util";

const VALIDATE_AI_URL = process.env.VALIDATE_AI_URL ?? "http://127.0.0.1:3002/api/ai";
const VALIDATE_AI_TIMEOUT_MS = Number.parseInt(process.env.VALIDATE_AI_TIMEOUT_MS ?? "60000", 10);
const execFileAsync = promisify(execFile);

type RouteResponse = {
  searchUsed?: boolean | null;
  execution?: {
    status?: string | null;
  } | null;
  generatedFramePlan?: {
    frames?: Array<{
      pose?: string | null;
      description?: string | null;
    }> | null;
  } | null;
  generateFramesState?: {
    ownerProjectId?: string | null;
    sceneSetting?: string | null;
    sceneDescriptors?: string[] | null;
    sceneProps?: string[] | null;
    tone?: string | null;
    actionKeywords?: string[] | null;
    buildDirection?: string | null;
    subjects?: Array<{
      side?: string | null;
      label?: string | null;
      color?: string | null;
      details?: string[] | null;
    }> | null;
  } | null;
  projectAiMemory?: {
    ownerProjectId?: string | null;
    interactionMode?: string | null;
    currentGoal?: string | null;
    contextSummary?: string | null;
    recentEdits?: string[] | null;
    generateFramesState?: RouteResponse["generateFramesState"] | null;
  } | null;
};

const makeWorkspaceContext = (projectId: string) => ({
  projectId,
  projectTitle: "Stateful Reasoning Validation",
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
    reasoningLevel: "high",
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

const projectId = "project-stateful-reasoning";
const initialPrompt =
  "Create a single setup frame of a mantis priest facing a chrome wolf on a floating tram platform, with rain and cables in the background.";
const continuationPrompt =
  "Give the chrome wolf a lantern and make it more scared, but keep the same scene and subjects.";

const initialResponse = await postToRoute({
  projectId,
  prompt: initialPrompt,
});

const continuationResponse = await postToRoute({
  projectId,
  prompt: continuationPrompt,
  generateFramesState: initialResponse.generateFramesState ?? null,
  projectAiMemory: initialResponse.projectAiMemory ?? null,
});

const stateAfterContinuation = continuationResponse.projectAiMemory?.generateFramesState ?? null;
const rightSubject =
  stateAfterContinuation?.subjects?.find((subject) => subject.side === "right") ?? null;

const results = {
  broaderCustomSetupSearchesOnceAndCompletes:
    initialResponse.execution?.status === "completed-frames" &&
    initialResponse.searchUsed === true &&
    (initialResponse.generatedFramePlan?.frames?.length ?? 0) === 1,
  customSubjectsSurviveStateStorage:
    (initialResponse.generateFramesState?.subjects ?? []).some((subject) => /mantis priest/i.test(subject.label ?? "")) &&
    (initialResponse.generateFramesState?.subjects ?? []).some((subject) => /chrome wolf/i.test(subject.label ?? "")) &&
    (initialResponse.generateFramesState?.actionKeywords ?? []).length >= 1,
  customContinuationStaysLocalAndProjectScoped:
    continuationResponse.searchUsed === false &&
    continuationResponse.projectAiMemory?.ownerProjectId === projectId &&
    continuationResponse.generateFramesState?.ownerProjectId === projectId &&
    continuationResponse.projectAiMemory?.interactionMode === "tweak",
  customContinuationPreservesSceneAndAddsRequestedEdit:
    /chrome wolf/i.test(rightSubject?.label ?? "") &&
    ((rightSubject?.details ?? []).some((detail) => /lantern/i.test(detail)) ||
      /lantern/i.test(rightSubject?.label ?? "")) &&
    stateAfterContinuation?.tone === "scared" &&
    (stateAfterContinuation?.sceneProps ?? []).includes("cables"),
  buildDirectionAndGoalRemainAnchored:
    typeof stateAfterContinuation?.buildDirection === "string" &&
    (stateAfterContinuation?.buildDirection?.length ?? 0) > 0 &&
    continuationResponse.projectAiMemory?.currentGoal === initialPrompt &&
    (continuationResponse.projectAiMemory?.contextSummary ?? "").length > 0,
};

const allChecksPassed = Object.values(results).every(Boolean);

console.log(
  JSON.stringify(
    {
      allChecksPassed,
      results,
    },
    null,
    2,
  ),
);

if (!allChecksPassed) {
  process.exit(1);
}
