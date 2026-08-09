export {};

const VALIDATE_AI_URL = process.env.VALIDATE_AI_URL ?? "http://127.0.0.1:3002/api/ai";
const VALIDATE_AI_TIMEOUT_MS = Number.parseInt(process.env.VALIDATE_AI_TIMEOUT_MS ?? "60000", 10);

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
    actionKeywords?: string[] | null;
    tone?: string | null;
    recentEdits?: string[] | null;
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
    recentEdits?: string[] | null;
    generateFramesState?: RouteResponse["generateFramesState"] | null;
  } | null;
};

const makeWorkspaceContext = (projectId: string) => ({
  projectId,
  projectTitle: "Continuation Breadth Validation",
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
  const response = await fetch(VALIDATE_AI_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
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
    }),
    signal: AbortSignal.timeout(VALIDATE_AI_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(`Route request failed with status ${response.status}`);
  }

  return (await response.json()) as RouteResponse;
};

const projectId = "project-continuation-breadth";
const initialPrompt =
  "Create a single setup frame in a bioluminescent alien cave with two stick fighters, crystal pillars, and glowing mushrooms. The left fighter is black and the right fighter is red.";

const initialResponse = await postToRoute({
  projectId,
  prompt: initialPrompt,
});

const propEditResponse = await postToRoute({
  projectId,
  prompt: "Make the left fighter hold a spear and keep the same scene.",
  generateFramesState: initialResponse.generateFramesState ?? null,
  projectAiMemory: initialResponse.projectAiMemory ?? null,
});

const toneEditResponse = await postToRoute({
  projectId,
  prompt: "Make it more ominous and add more vines, but keep the same scene and subjects.",
  generateFramesState: propEditResponse.generateFramesState ?? null,
  projectAiMemory: propEditResponse.projectAiMemory ?? null,
});

const customActionProjectId = "project-continuation-custom-action";
const customActionInitialResponse = await postToRoute({
  projectId: customActionProjectId,
  prompt: "Animate a mantis priest lunging at a chrome wolf on a floating tram platform.",
});

const customActionFollowUpResponse = await postToRoute({
  projectId: customActionProjectId,
  prompt: "Give the chrome wolf a lantern and make it more scared, but keep the same scene and subjects.",
  generateFramesState: customActionInitialResponse.generateFramesState ?? null,
  projectAiMemory: customActionInitialResponse.projectAiMemory ?? null,
});

const leftSubjectAfterPropEdit =
  propEditResponse.projectAiMemory?.generateFramesState?.subjects?.find((subject) => subject.side === "left") ?? null;
const finalState = toneEditResponse.projectAiMemory?.generateFramesState ?? null;
const customRightSubject =
  customActionFollowUpResponse.projectAiMemory?.generateFramesState?.subjects?.find((subject) => subject.side === "right") ?? null;

const results = {
  broaderSetupUsesSearchOnce:
    initialResponse.execution?.status === "completed-frames" &&
    initialResponse.searchUsed === true &&
    (initialResponse.generatedFramePlan?.frames?.length ?? 0) === 1 &&
    initialResponse.projectAiMemory?.currentGoal === initialPrompt,
  continuationKeepsProjectScopedState:
    propEditResponse.projectAiMemory?.ownerProjectId === projectId &&
    propEditResponse.generateFramesState?.ownerProjectId === projectId &&
    propEditResponse.projectAiMemory?.currentGoal === initialPrompt &&
    propEditResponse.searchUsed === false,
  continuationPreservesSubjectAndAddsProp:
    (/spear/i.test(leftSubjectAfterPropEdit?.label ?? "") ||
      (leftSubjectAfterPropEdit?.details ?? []).some((value) => /spear/i.test(value))) &&
    leftSubjectAfterPropEdit?.color === "black" &&
    propEditResponse.projectAiMemory?.generateFramesState?.sceneSetting === "cave" &&
    (propEditResponse.projectAiMemory?.generateFramesState?.sceneProps ?? []).includes("crystals") &&
    (propEditResponse.projectAiMemory?.generateFramesState?.sceneProps ?? []).includes("mushrooms"),
  secondEditCarriesToneAndSceneForward:
    finalState?.sceneSetting === "cave" &&
    (finalState?.sceneDescriptors ?? []).includes("bioluminescent") &&
    (finalState?.sceneDescriptors ?? []).includes("alien") &&
    (finalState?.sceneProps ?? []).includes("vines") &&
    toneEditResponse.searchUsed === false,
  recentEditChainPersists:
    (toneEditResponse.projectAiMemory?.recentEdits ?? []).length >= 2 &&
    (finalState?.recentEdits ?? []).length >= 2 &&
    (finalState?.recentEdits ?? []).some((value) => /spear/i.test(value)) &&
    (finalState?.recentEdits ?? []).some((value) => /ominous|vines/i.test(value)),
  customActionPromptBuildsStatefully:
    customActionInitialResponse.execution?.status === "completed-frames" &&
    customActionInitialResponse.searchUsed === true &&
    (customActionInitialResponse.generatedFramePlan?.frames?.length ?? 0) >= 3 &&
    (customActionInitialResponse.generateFramesState?.actionKeywords ?? []).includes("lunge") &&
    (customActionInitialResponse.generateFramesState?.sceneProps ?? []).includes("platform"),
  customActionContinuationPreservesSubjectAndAddsDetail:
    customActionFollowUpResponse.execution?.status === "completed-frames" &&
    customActionFollowUpResponse.searchUsed === false &&
    customActionFollowUpResponse.projectAiMemory?.interactionMode === "tweak" &&
    customActionFollowUpResponse.generateFramesState?.tone === "scared" &&
    /chrome wolf/i.test(customRightSubject?.label ?? "") &&
    ((customRightSubject?.details ?? []).some((value) => /lantern/i.test(value)) ||
      /lantern/i.test(customRightSubject?.label ?? "")),
};

const allChecksPassed = Object.values(results).every(Boolean);

console.log(
  JSON.stringify(
    {
      allChecksPassed,
      results,
      diagnostics: allChecksPassed
        ? undefined
        : {
            customActionInitialResponse: {
              searchUsed: customActionInitialResponse.searchUsed ?? null,
              status: customActionInitialResponse.execution?.status ?? null,
              frameCount: customActionInitialResponse.generatedFramePlan?.frames?.length ?? 0,
              actionKeywords: customActionInitialResponse.generateFramesState?.actionKeywords ?? null,
              sceneProps: customActionInitialResponse.generateFramesState?.sceneProps ?? null,
              subjects: customActionInitialResponse.generateFramesState?.subjects ?? null,
              projectInteractionMode: customActionInitialResponse.projectAiMemory?.interactionMode ?? null,
            },
            customActionFollowUpResponse: {
              searchUsed: customActionFollowUpResponse.searchUsed ?? null,
              status: customActionFollowUpResponse.execution?.status ?? null,
              tone: customActionFollowUpResponse.generateFramesState?.tone ?? null,
              subjects: customActionFollowUpResponse.projectAiMemory?.generateFramesState?.subjects ?? null,
              projectInteractionMode: customActionFollowUpResponse.projectAiMemory?.interactionMode ?? null,
            },
          },
    },
    null,
    2,
  ),
);

if (!allChecksPassed) {
  process.exit(1);
}
