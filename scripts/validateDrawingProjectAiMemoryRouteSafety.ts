export {};

const routeUtilsModuleUrl = new URL("../src/lib/ai/drawingProjectAiMemoryRouteUtils.ts", import.meta.url);
const syncModuleUrl = new URL("../src/lib/ai/drawingProjectAiMemorySync.ts", import.meta.url);

const { shouldRejectStaleDrawingProjectAiMemorySave } = await import(routeUtilsModuleUrl.href);
const { saveDrawingProjectAiMemoryToSupabase } = await import(syncModuleUrl.href);

const makeMemory = (projectId: string, updatedAt: string) => ({
  version: 1 as const,
  ownerProjectId: projectId,
  taskType: "generate-frames" as const,
  interactionMode: "tweak" as const,
  currentGoal: "Arena fight scene",
  contextSummary: "punch | left fighter, right fighter | setting arena",
  lastPrompt: "Make the punch harder.",
  lastUpdatedAt: updatedAt,
  recentEdits: ["Make the punch harder."],
  generateFramesState: {
    ownerProjectId: projectId,
    subjectType: "mixed" as const,
    subjects: [
      {
        id: "attacker",
        type: "character" as const,
        role: "attacker" as const,
        side: "left" as const,
        color: "black",
        label: "left fighter",
      },
      {
        id: "defender",
        type: "character" as const,
        role: "defender" as const,
        side: "right" as const,
        color: "red",
        label: "right fighter",
      },
    ],
    motionType: "punch" as const,
    tone: "serious" as const,
    forceLevel: "medium" as const,
    animationPhase: "progression" as const,
    frameCount: 8,
    fps: 12,
    modifiers: [],
    sceneSetting: "arena",
    sceneDescriptors: [],
    sceneProps: ["rubble"],
    recentEdits: ["Make the punch harder."],
  },
});

const olderMemory = makeMemory("project-a", "2026-03-30T00:00:00.000Z");
const newerMemory = makeMemory("project-a", "2026-03-30T00:00:10.000Z");
const foreignScopedMemory = makeMemory("project-a", "2026-03-30T00:00:20.000Z");

const originalFetch = globalThis.fetch;
let fetchCallCount = 0;

const useFetchMock = (status: number) => {
  fetchCallCount = 0;
  globalThis.fetch = (async () => {
    fetchCallCount += 1;
    return new Response(JSON.stringify({ ok: status < 400 }), {
      status,
      headers: {
        "Content-Type": "application/json",
      },
    });
  }) as typeof fetch;
};

const helperRejectsOlderIncoming =
  shouldRejectStaleDrawingProjectAiMemorySave({
    existingMemory: newerMemory,
    incomingMemory: olderMemory,
  }) === true &&
  shouldRejectStaleDrawingProjectAiMemorySave({
    existingMemory: olderMemory,
    incomingMemory: newerMemory,
  }) === false;

useFetchMock(409);
const staleSaveResult = await saveDrawingProjectAiMemoryToSupabase("project-a", olderMemory);

useFetchMock(200);
const savedResult = await saveDrawingProjectAiMemoryToSupabase("project-a", newerMemory);

useFetchMock(200);
const foreignScopedSaveResult = await saveDrawingProjectAiMemoryToSupabase("project-b", foreignScopedMemory);
const foreignScopedFetchCallCount = fetchCallCount;

globalThis.fetch = originalFetch;

const results = {
  helperRejectsOlderIncoming,
  clientMaps409ToRejectedStale: staleSaveResult === "rejected-stale",
  clientMaps200ToSaved: savedResult === "saved",
  clientRejectsForeignScopedMemoryWithoutFetch: foreignScopedSaveResult === "failed" && foreignScopedFetchCallCount === 0,
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
