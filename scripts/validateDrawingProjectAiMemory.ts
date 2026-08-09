export {};

type LocalStorageLike = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
};

const storage = new Map<string, string>();

const localStorageMock: LocalStorageLike = {
  getItem: (key) => storage.get(key) ?? null,
  setItem: (key, value) => {
    storage.set(key, value);
  },
  removeItem: (key) => {
    storage.delete(key);
  },
};

Object.assign(globalThis, {
  window: {
    localStorage: localStorageMock,
  },
});

const drawingProjectStorageModuleUrl = new URL("../src/lib/drawingProjectStorage.ts", import.meta.url);

const {
  saveStoredDrawingProject,
  getStoredDrawingProject,
  listStoredDrawingProjects,
  deleteStoredDrawingProject,
  updateStoredDrawingProjectAiMemory,
} = await import(drawingProjectStorageModuleUrl.href);

const baseProjectData = {
  version: 1 as const,
  activeTool: "Select" as const,
  brushSize: 4,
  eraserSize: 12,
  fillColor: "#000000",
  timelineFps: 12,
  shapeType: "Square" as const,
  activeLayerId: "layer-1",
  currentFrameIndex: 0,
  selectedTimelineIndex: 0,
  isOnionEnabled: false,
  layers: [
    {
      id: "layer-1",
      name: "Layer 1",
      orderIndex: 0,
      timelineFrames: [
        {
          id: 1,
          kind: "key" as const,
          cellType: "filled" as const,
          stateId: 1,
          bitmap: null,
          previewUrl: null,
          tweenEndBitmap: null,
          tweenEndPreviewUrl: null,
          motionTween: null,
        },
      ],
    },
  ],
  nextTimelineFrameId: 2,
  nextLayerNumber: 2,
};

const makeMemory = (goal: string, sideColor: string, ownerProjectId: string | null = null) => ({
  version: 1 as const,
  ownerProjectId,
  taskType: "generate-frames" as const,
  interactionMode: "tweak" as const,
  currentGoal: goal,
  contextSummary: `${sideColor} figure update`,
  lastPrompt: `Make the right figure ${sideColor}.`,
  lastUpdatedAt: new Date().toISOString(),
  generateFramesState: {
    ownerProjectId,
    subjectType: "mixed" as const,
    subjects: [
      {
        id: "attacker",
        type: "character" as const,
        role: "attacker" as const,
        side: "left" as const,
        color: "black",
      },
      {
        id: "defender",
        type: "character" as const,
        role: "defender" as const,
        side: "right" as const,
        color: sideColor,
      },
    ],
    motionType: "punch" as const,
    tone: "serious" as const,
    forceLevel: "medium" as const,
    animationPhase: "progression" as const,
    frameCount: 8,
    fps: 12,
    modifiers: [],
    sceneSetting: "forest",
    sceneDescriptors: [],
    sceneProps: ["trees"],
    recentEdits: ["Change the right figure to blue."],
  },
  recentEdits: ["Change the right figure to blue."],
});

const projectAMemory = makeMemory("Forest duel", "blue");
const projectBMemory = makeMemory("City chase", "red");

const projectA = saveStoredDrawingProject({
  name: "Project A",
  data: baseProjectData,
  previewDataUrl: null,
  aiMemory: projectAMemory,
});

const reopenedA = getStoredDrawingProject(projectA.id);
const projectB = saveStoredDrawingProject({
  name: "Project B",
  data: baseProjectData,
  previewDataUrl: null,
  aiMemory: projectBMemory,
});

const rejectedForeignUpdate = updateStoredDrawingProjectAiMemory(projectB.id, {
  ...projectBMemory,
  ownerProjectId: projectA.id,
  currentGoal: "City chase revised",
});

const reopenedBAfterRejectedUpdate = getStoredDrawingProject(projectB.id);
updateStoredDrawingProjectAiMemory(projectB.id, {
  ...projectBMemory,
  ownerProjectId: projectB.id,
  currentGoal: "City chase revised",
});

const reopenedB = getStoredDrawingProject(projectB.id);
const projectBSaveAs = saveStoredDrawingProject({
  name: "Project B Save As",
  data: baseProjectData,
  previewDataUrl: null,
  aiMemory: reopenedB?.aiMemory ?? null,
});

const beforeUnsavedCount = listStoredDrawingProjects().length;
const unsavedSessionMemory = makeMemory("Scratch scene", "green");
void unsavedSessionMemory;
const afterUnsavedCount = listStoredDrawingProjects().length;

const deletedA = deleteStoredDrawingProject(projectA.id);
const afterDeleteA = getStoredDrawingProject(projectA.id);
const remainingProjectIds = listStoredDrawingProjects().map((project: { id: string }) => project.id);

const results = {
  restoredSavedProjectMemory:
    reopenedA?.aiMemory?.currentGoal === "Forest duel" &&
    reopenedA.aiMemory?.generateFramesState?.subjects?.[1]?.color === "blue" &&
    reopenedA.aiMemory?.ownerProjectId === projectA.id &&
    reopenedA.aiMemory?.generateFramesState?.ownerProjectId === projectA.id,
  rejectsForeignProjectMemoryUpdate:
    rejectedForeignUpdate === null &&
    reopenedBAfterRejectedUpdate?.aiMemory?.currentGoal === "City chase" &&
    reopenedBAfterRejectedUpdate?.aiMemory?.ownerProjectId === projectB.id &&
    reopenedBAfterRejectedUpdate?.aiMemory?.generateFramesState?.ownerProjectId === projectB.id,
  separateProjectMemory:
    reopenedB?.aiMemory?.currentGoal === "City chase revised" &&
    reopenedA?.aiMemory?.currentGoal === "Forest duel" &&
    reopenedB?.aiMemory?.ownerProjectId === projectB.id &&
    reopenedB?.aiMemory?.generateFramesState?.ownerProjectId === projectB.id,
  saveAsBindsNewProjectIdentity:
    projectBSaveAs.id !== projectB.id &&
    projectBSaveAs.aiMemory?.currentGoal === "City chase revised" &&
    projectBSaveAs.aiMemory?.ownerProjectId === projectBSaveAs.id &&
    projectBSaveAs.aiMemory?.generateFramesState?.ownerProjectId === projectBSaveAs.id,
  unsavedDoesNotPersistLongTerm: beforeUnsavedCount === afterUnsavedCount,
  deleteRemovesProjectMemory:
    deletedA === true &&
    afterDeleteA === null &&
    !remainingProjectIds.includes(projectA.id),
};

const allChecksPassed = Object.values(results).every(Boolean);

console.log(
  JSON.stringify(
    {
      allChecksPassed,
      results,
      savedProjectCount: listStoredDrawingProjects().length,
    },
    null,
    2,
  ),
);

if (!allChecksPassed) {
  process.exit(1);
}
