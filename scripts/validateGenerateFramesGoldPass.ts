export {};

import { execFile } from "node:child_process";
import { promisify } from "node:util";

const VALIDATE_AI_URL = process.env.VALIDATE_AI_URL ?? "http://127.0.0.1:3014/api/ai";
const VALIDATE_AI_TIMEOUT_MS = Number.parseInt(process.env.VALIDATE_AI_TIMEOUT_MS ?? "90000", 10);
const VALIDATE_REASONING_LEVEL = process.env.VALIDATE_REASONING_LEVEL ?? "medium";
const execFileAsync = promisify(execFile);

type RouteResponse = {
  output?: string | null;
  searchUsed?: boolean | null;
  execution?: {
    status?: string | null;
  } | null;
  generatedFramePlan?: {
    requestKind?: string | null;
    requestedFrameCount?: number | null;
    frames?: Array<{ pose?: string | null; description?: string | null }> | null;
  } | null;
  generateFramesState?: {
    motionType?: string | null;
    sceneSetting?: string | null;
  } | null;
};

const baseWorkspaceContext = {
  projectId: "gold-pass-validation",
  projectTitle: "Gold Pass Validation",
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
};

const postToRoute = async (prompt: string, projectId = "gold-pass-validation") => {
  const requestBody = JSON.stringify({
    prompt,
    taskType: "generate-frames",
    reasoningLevel: VALIDATE_REASONING_LEVEL,
    shouldSearch: false,
    conversationHistory: [],
    followUpMemory: [],
    workspaceContext: {
      ...baseWorkspaceContext,
      projectId,
    },
    recentSoundOptions: [],
    generateFramesState: null,
    projectAiMemory: null,
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

const aggregateFrames = (response: RouteResponse) =>
  (response.generatedFramePlan?.frames ?? [])
    .map((frame) => `${frame.pose ?? ""} ${frame.description ?? ""}`.trim())
    .join(" ")
    .toLowerCase();

const getFrameCount = (response: RouteResponse) => response.generatedFramePlan?.frames?.length ?? 0;

const cases = [
  {
    name: "simple-stick-figure",
    prompt: "Generate me a stick figure.",
    check: (response: RouteResponse) => {
      const aggregate = aggregateFrames(response);
      return (
        response.execution?.status === "completed-frames" &&
        response.searchUsed === false &&
        getFrameCount(response) === 1 &&
        /\bstick figure\b/.test(aggregate) &&
        /\bsolid head\b|\bhead silhouette\b/.test(aggregate)
      );
    },
  },
  {
    name: "simple-explosion",
    prompt: "Generate an explosion.",
    check: (response: RouteResponse) => {
      const aggregate = aggregateFrames(response);
      return (
        response.execution?.status === "completed-frames" &&
        response.searchUsed === false &&
        getFrameCount(response) >= 5 &&
        /\bexplosion|blast\b/.test(aggregate) &&
        /\bexpand|outward|peak\b/.test(aggregate) &&
        /\bbreakup|fragment|debris\b/.test(aggregate) &&
        /\bsmoke|residue|fade|aftermath\b/.test(aggregate)
      );
    },
  },
  {
    name: "lightning",
    prompt: "Generate lightning with a glow and ghost trail.",
    check: (response: RouteResponse) => {
      const aggregate = aggregateFrames(response);
      return (
        response.execution?.status === "completed-frames" &&
        response.searchUsed === false &&
        getFrameCount(response) >= 4 &&
        /\blightning|bolt|electric\b/.test(aggregate) &&
        /\bzigzag|branch|ghost trail|ghost|glow\b/.test(aggregate) &&
        /\bvanish|collapse|disappear\b/.test(aggregate)
      );
    },
  },
  {
    name: "camera-follow-neighborhood",
    prompt: "Generate a sad stick figure walking through a neighborhood while the camera follows and the background moves behind him.",
    check: (response: RouteResponse) => {
      const aggregate = aggregateFrames(response);
      return (
        response.execution?.status === "completed-frames" &&
        response.searchUsed === false &&
        response.generateFramesState?.motionType === "background-scroll" &&
        response.generateFramesState?.sceneSetting === "neighborhood" &&
        getFrameCount(response) >= 3 &&
        /\banchored|same screen position|centered\b/.test(aggregate) &&
        /\bneighborhood|houses|sidewalk\b/.test(aggregate) &&
        /\bbackground|environment\b/.test(aggregate)
      );
    },
  },
  {
    name: "hard-combo",
    prompt: "Generate a red stick figure who throws a right-hand fireball, jumps, spins, kicks a blue stick figure, then lands in a guard stance.",
    check: (response: RouteResponse) => {
      const aggregate = aggregateFrames(response);
      return (
        response.execution?.status === "completed-frames" &&
        response.searchUsed === false &&
        getFrameCount(response) >= 5 &&
        /\bright hand\b|\bright-hand\b/.test(aggregate) &&
        /\bjump|spin|kick\b/.test(aggregate) &&
        /\bguard stance|landing\b/.test(aggregate)
      );
    },
  },
  {
    name: "style-reference-searches",
    prompt: "Generate two stick figures fighting in the style of Alan Becker.",
    check: (response: RouteResponse) => response.execution?.status === "completed-frames" && response.searchUsed === true,
  },
  {
    name: "easy-known-object-no-search",
    prompt: "Generate a tree.",
    check: (response: RouteResponse) => {
      const aggregate = aggregateFrames(response);
      return (
        response.execution?.status === "completed-frames" &&
        response.searchUsed === false &&
        getFrameCount(response) === 1 &&
        /\btree|trunk|canopy\b/.test(aggregate)
      );
    },
  },
] as const;

const results = [];

for (const validationCase of cases) {
  const response = await postToRoute(validationCase.prompt, `gold-pass-${validationCase.name}`);
  results.push({
    name: validationCase.name,
    passed: validationCase.check(response),
    searchUsed: response.searchUsed ?? null,
    motionType: response.generateFramesState?.motionType ?? null,
    sceneSetting: response.generateFramesState?.sceneSetting ?? null,
    frameCount: getFrameCount(response),
    aggregate: aggregateFrames(response),
  });
}

const allPassed = results.every((result) => result.passed);

console.log(
  JSON.stringify(
    {
      allPassed,
      results,
    },
    null,
    2,
  ),
);

if (!allPassed) {
  process.exitCode = 1;
}
