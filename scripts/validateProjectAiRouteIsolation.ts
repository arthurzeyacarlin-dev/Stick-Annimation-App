export {};

const VALIDATE_AI_URL = process.env.VALIDATE_AI_URL ?? "http://127.0.0.1:3002/api/ai";

type RouteResponse = {
  warnings?: string[] | null;
  execution?: {
    status?: string | null;
  } | null;
  generateFramesState?: {
    ownerProjectId?: string | null;
    motionType?: string | null;
  } | null;
  projectAiMemory?: {
    ownerProjectId?: string | null;
    currentGoal?: string | null;
    generateFramesState?: {
      ownerProjectId?: string | null;
      motionType?: string | null;
    } | null;
  } | null;
};

const makeWorkspaceContext = (projectId: string | null) => ({
  projectId,
  projectTitle: projectId ? `Project ${projectId}` : "Unsaved Scratch",
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

const staleFightState = {
  ownerProjectId: "project-a",
  subjectType: "mixed",
  subjects: [
    {
      id: "attacker",
      type: "character",
      role: "attacker",
      side: "left",
      color: "black",
      label: "left fighter",
    },
    {
      id: "defender",
      type: "character",
      role: "defender",
      side: "right",
      color: "red",
      label: "right fighter",
    },
  ],
  motionType: "punch",
  tone: "serious",
  forceLevel: "medium",
  animationPhase: "progression",
  frameCount: 10,
  fps: 12,
  modifiers: [],
  sceneSetting: "arena",
  sceneDescriptors: [],
  sceneProps: ["dust"],
  recentEdits: ["Make the punch harder."],
} as const;

const staleFightMemory = {
  version: 1,
  ownerProjectId: "project-a",
  taskType: "generate-frames",
  interactionMode: "continue",
  currentGoal: "Arena fight scene",
  contextSummary: "punch | left fighter, right fighter | setting arena",
  lastPrompt: "Make the punch harder.",
  lastUpdatedAt: "2026-03-30T00:00:00.000Z",
  recentEdits: ["Make the punch harder."],
  generateFramesState: staleFightState,
} as const;

const postToRoute = async (workspaceProjectId: string | null) => {
  const response = await fetch(VALIDATE_AI_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      prompt: "Generate lightning.",
      taskType: "generate-frames",
      reasoningLevel: "medium",
      shouldSearch: false,
      conversationHistory: [],
      followUpMemory: [],
      workspaceContext: makeWorkspaceContext(workspaceProjectId),
      generateFramesState: staleFightState,
      projectAiMemory: staleFightMemory,
      recentSoundOptions: [],
    }),
  });

  if (!response.ok) {
    throw new Error(`Route request failed with status ${response.status}`);
  }

  return (await response.json()) as RouteResponse;
};

const savedProjectResponse = await postToRoute("project-b");
const unsavedProjectResponse = await postToRoute(null);

const savedWarnings = savedProjectResponse.warnings ?? [];
const unsavedWarnings = unsavedProjectResponse.warnings ?? [];

const results = {
  savedProjectRejectsForeignMemory:
    savedProjectResponse.execution?.status === "completed-frames" &&
    savedWarnings.some((warning) => /Ignored project AI memory from a different project scope\./i.test(warning)) &&
    savedWarnings.some((warning) => /Ignored Generate Frames continuation state from a different project scope\./i.test(warning)) &&
    savedProjectResponse.projectAiMemory?.ownerProjectId === "project-b" &&
    savedProjectResponse.projectAiMemory?.generateFramesState?.ownerProjectId === "project-b" &&
    savedProjectResponse.generateFramesState?.ownerProjectId === "project-b" &&
    savedProjectResponse.generateFramesState?.motionType === "lightning" &&
    savedProjectResponse.projectAiMemory?.currentGoal === "Generate lightning.",
  unsavedProjectRejectsSavedMemory:
    unsavedProjectResponse.execution?.status === "completed-frames" &&
    unsavedWarnings.some((warning) => /Ignored project AI memory from a different project scope\./i.test(warning)) &&
    unsavedWarnings.some((warning) => /Ignored Generate Frames continuation state from a different project scope\./i.test(warning)) &&
    unsavedProjectResponse.projectAiMemory?.ownerProjectId === null &&
    unsavedProjectResponse.projectAiMemory?.generateFramesState?.ownerProjectId === null &&
    unsavedProjectResponse.generateFramesState?.ownerProjectId === null &&
    unsavedProjectResponse.generateFramesState?.motionType === "lightning",
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
