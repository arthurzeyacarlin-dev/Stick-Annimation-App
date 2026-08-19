import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import {
  STICK_HISTORY_ENTRY_LIMIT,
  STICK_HISTORY_BYTE_LIMIT,
  STICK_ONION_NEXT_TINT,
  STICK_ONION_PREVIOUS_TINT,
  commitEditableStickHistory,
  createEditableStickEditorVersion,
  createEditableStickHistoryRoot,
  editableStickDocumentFromTimeline,
  editableStickHistoryVersionByteLength,
  editableStickViewFromTimeline,
  pruneEditableStickHistoryStack,
  redoEditableStickHistory,
  resolveEditableStickOnionOverlays,
  undoEditableStickHistory,
  verifyEditableStickEditorVersion,
} from "../src/lib/stickfigure/stickProjectHistory.ts";
import {
  STICK_PROJECT_STORAGE_KEY,
  STICK_PROJECT_STORAGE_BYTE_LIMIT,
  STICK_PROJECT_STORAGE_RECORD_LIMIT,
  createBrowserStickStorageCommitPort,
  openStickSavedProject,
  parseStickSavedProjectsEnvelope,
  prepareStickProjectSave,
  readStickSavedProjects,
  saveStickProject,
} from "../src/lib/stickProjectStorage.ts";
import {
  addEditableStickLayer,
  cloneEditableStickTimelineState,
  copyEditableStickTimelineFrame,
  createFreshEditableStickTimelineState,
  deleteEditableStickLayer,
  insertEditableStickTimelineFrame,
  pasteEditableStickTimelineFrame,
  removeEditableStickTimelineFrame,
  replaceEditableStickResolvedContent,
  resizeEditableStickTimelineSpan,
} from "../src/lib/stickfigure/stickTimeline.ts";
import {createEmptyStickFigureFrameContent, type StickFigureFrameContent} from "../src/components/workspace/stickfigure/types.ts";
import {canonicalJson} from "../src/lib/stickfigure/stickProjectContract.ts";

const ROOT = process.cwd();
const FIXTURE_ROOT = resolve(ROOT, "scripts/fixtures/stick-ai/v1");
const fixtureNames = [
  "wave-editor-history-root.json",
  "stick-manual-action-history-cases.json",
  "stick-history-cases.json",
  "stick-history-publication-race-cases.json",
  "stick-storage-cases.json",
  "stick-saved-projects.json",
  "manual-wave-saved-project.json",
  "non-wave-saved-project.json",
] as const;
for (const name of fixtureNames.filter((candidate) => candidate !== "wave-editor-history-root.json")) {
  const parsed = JSON.parse(readFileSync(resolve(FIXTURE_ROOT, name), "utf8")) as {fixtureVersion?: unknown; kind?: unknown};
  assert.equal(parsed.fixtureVersion, 1, `${name} fixtureVersion`);
  const expectedDriverKinds: Partial<Record<typeof name, string>> = {
    "stick-manual-action-history-cases.json": "stick-editor-transaction-v1",
    "stick-history-cases.json": "stick-document-publication-plan-v1",
    "stick-history-publication-race-cases.json": "stick-document-publication-completion-v1",
    "stick-saved-projects.json": "stick-mounted-open-cancel-v1",
    "manual-wave-saved-project.json": "stick-mounted-open-candidate-v1",
    "non-wave-saved-project.json": "stick-mounted-open-completion-v1",
  };
  if (expectedDriverKinds[name]) assert.equal(parsed.kind, expectedDriverKinds[name], `${name} driver fixture kind`);
}
const historyMountFixture = JSON.parse(readFileSync(resolve(FIXTURE_ROOT, "wave-editor-history-root.json"), "utf8")) as Record<string, unknown>;
assert.deepEqual(Object.keys(historyMountFixture).sort(), ["editorHistoryRoot", "expectedWorkspaceGeneration", "kind", "mountVersion", "savedBaselineMode", "workspaceInstancePolicy"].sort());
assert.equal(historyMountFixture.kind, "stick-workspace-history-mount-v1");
assert.equal(historyMountFixture.mountVersion, 1);
assert.equal(historyMountFixture.savedBaselineMode, "none");
assert.equal(historyMountFixture.expectedWorkspaceGeneration, 1);
assert.equal(historyMountFixture.workspaceInstancePolicy, "new_deterministic_uuid");
const mountedHistory = historyMountFixture.editorHistoryRoot as Awaited<ReturnType<typeof createEditableStickHistoryRoot>>;
assert.equal(await verifyEditableStickEditorVersion(mountedHistory.current), true);
assert.ok((await Promise.all(mountedHistory.undo.map(verifyEditableStickEditorVersion))).every(Boolean));
assert.ok((await Promise.all(mountedHistory.redo.map(verifyEditableStickEditorVersion))).every(Boolean));

const projectId = "10000000-0000-4000-8000-000000000001";
const timeline = createFreshEditableStickTimelineState();
const snapshot = {
  document: editableStickDocumentFromTimeline(timeline, {
    projectId,
    documentRevision: 0,
    title: "History validation project",
  }),
  viewState: editableStickViewFromTimeline(timeline),
};

let history = await createEditableStickHistoryRoot(snapshot);
assert.equal(history.undo.length, 0);
assert.equal(history.redo.length, 0);
for (let revision = 1; revision <= STICK_HISTORY_ENTRY_LIMIT + 1; revision += 1) {
  const nextTimeline = cloneEditableStickTimelineState(timeline);
  nextTimeline.fps = 1 + (revision % 55);
  history = await commitEditableStickHistory(history, {
    document: editableStickDocumentFromTimeline(nextTimeline, {
      projectId,
      documentRevision: revision,
      title: "History validation project",
    }),
    viewState: editableStickViewFromTimeline(nextTimeline),
  });
}
assert.equal(history.undo.length, STICK_HISTORY_ENTRY_LIMIT, "129th commit evicts the oldest history version");
assert.ok(history.undo.every((version) => editableStickHistoryVersionByteLength(version) > 0));

const beforeUndoDigest = history.current.documentDigest;
const undone = await undoEditableStickHistory(history);
assert.ok(undone);
assert.equal(undone.redo.length, 1);
const redone = await redoEditableStickHistory(undone);
assert.ok(redone);
assert.equal(redone.current.documentDigest, beforeUndoDigest);

const divergentTimeline = cloneEditableStickTimelineState(createFreshEditableStickTimelineState());
divergentTimeline.fps = 24;
const divergent = await commitEditableStickHistory(undone, {
  document: editableStickDocumentFromTimeline(divergentTimeline, {
    projectId,
    documentRevision: 1000,
    title: "History validation project",
  }),
  viewState: editableStickViewFromTimeline(divergentTimeline),
});
assert.equal(divergent.redo.length, 0, "divergent commits clear redo");

const tampered = structuredClone(divergent);
tampered.undo[tampered.undo.length - 1].documentDigest = "sha256:" + "0".repeat(64);
assert.equal(await undoEditableStickHistory(tampered), null, "tampered history digests fail closed");

const memory = new Map<string, string>();
const storage = {
  getItem: (key: string) => memory.get(key) ?? null,
  setItem: (key: string, value: string) => { memory.set(key, value); },
} as Storage;
const saved = await saveStickProject(storage, snapshot.document, snapshot.viewState, {
  now: () => "2026-08-18T00:00:00.000Z",
});
assert.deepEqual(saved, {ok: true, value: undefined});
assert.equal(memory.size, 1);
const firstRaw = memory.get(STICK_PROJECT_STORAGE_KEY)!;
const firstParsed = parseStickSavedProjectsEnvelope(firstRaw);
assert.ok(firstParsed.ok);
assert.equal(firstParsed.value.projects.length, 1);
assert.equal(firstParsed.value.projects[0].createdAt, "2026-08-18T00:00:00.000Z");

const laterDocument = {...snapshot.document, documentRevision: 1, fps: 18};
const laterSave = await saveStickProject(storage, laterDocument, snapshot.viewState, {
  now: () => "2026-08-18T01:00:00.000Z",
});
assert.ok(laterSave.ok);
const laterParsed = parseStickSavedProjectsEnvelope(memory.get(STICK_PROJECT_STORAGE_KEY)!);
assert.ok(laterParsed.ok);
assert.equal(laterParsed.value.projects.length, 1);
assert.equal(laterParsed.value.projects[0].createdAt, "2026-08-18T00:00:00.000Z");
assert.equal(laterParsed.value.projects[0].updatedAt, "2026-08-18T01:00:00.000Z");

const corrupt = prepareStickProjectSave("{", snapshot.document, snapshot.viewState, () => "2026-08-18T02:00:00.000Z");
assert.deepEqual(corrupt, {ok: false, error: "corrupt_storage"});
assert.deepEqual(parseStickSavedProjectsEnvelope(""), {ok: false, error: "corrupt_storage"});
assert.deepEqual(parseStickSavedProjectsEnvelope('{"projects":[],"storageVersion":2}'), {ok: false, error: "unsupported_storage_version"});
assert.equal(memory.get(STICK_PROJECT_STORAGE_KEY) === firstRaw, false, "successful later save replaces prior raw bytes");

let setItemCalls = 0;
const port = createBrowserStickStorageCommitPort({
  setItem: () => { setItemCalls += 1; },
});
const prepared = prepareStickProjectSave(null, snapshot.document, snapshot.viewState, () => "2026-08-18T03:00:00.000Z");
assert.ok(prepared.ok);
assert.ok((await port.commit(prepared.value)).ok);
assert.equal(setItemCalls, 1, "production commit delegates to exactly one synchronous setItem");

const pointContent = (offset: number): StickFigureFrameContent => ({
  figures: [],
  structureGraph: {
    activeJointId: null,
    joints: [
      {id: "stick-joint-1", x: 100 + offset, y: 100},
      {id: "stick-joint-2", x: 180 + offset, y: 180},
    ],
    limbs: [{id: "stick-limb-1", startJointId: "stick-joint-1", endJointId: "stick-joint-2"}],
  },
});
let onionTimeline = createFreshEditableStickTimelineState();
onionTimeline.layers[0].frames[0].content = pointContent(0);
onionTimeline.layers[0].frames[0].cellType = "keyframe";
onionTimeline.layers[0].frames[0].isBlank = false;
onionTimeline = insertEditableStickTimelineFrame(onionTimeline, onionTimeline.activeLayerId, "keyframe", 0) ?? onionTimeline;
onionTimeline.layers[0].frames[1].content = pointContent(20);
onionTimeline.layers[0].frames[1].cellType = "keyframe";
onionTimeline.layers[0].frames[1].isBlank = false;
onionTimeline = insertEditableStickTimelineFrame(onionTimeline, onionTimeline.activeLayerId, "keyframe", 1) ?? onionTimeline;
onionTimeline.layers[0].frames[2].content = pointContent(40);
onionTimeline.layers[0].frames[2].cellType = "keyframe";
onionTimeline.layers[0].frames[2].isBlank = false;
onionTimeline.selectedTimelineIndex = 1;
onionTimeline.currentFrameIndex = 1;
const overlays = resolveEditableStickOnionOverlays(onionTimeline);
assert.deepEqual(overlays.map(({side, sourceIndex, tint}) => ({side, sourceIndex, tint})), [
  {side: "previous", sourceIndex: 0, tint: STICK_ONION_PREVIOUS_TINT},
  {side: "next", sourceIndex: 2, tint: STICK_ONION_NEXT_TINT},
]);
onionTimeline.layers[0].frames[2].content = pointContent(0);
assert.deepEqual(resolveEditableStickOnionOverlays(onionTimeline).map((overlay) => overlay.side), ["previous"], "equal two-sided overlays retain previous only");
onionTimeline.layers[0].frames[0].content = createEmptyStickFigureFrameContent();
onionTimeline.layers[0].frames[0].cellType = "blank-keyframe";
onionTimeline.layers[0].frames[0].isBlank = true;
assert.deepEqual(resolveEditableStickOnionOverlays(onionTimeline).map((overlay) => overlay.side), ["next"], "blank boundary stops only the blocked side");

type TimelineState = ReturnType<typeof createFreshEditableStickTimelineState>;
const authoredBase = createFreshEditableStickTimelineState();
authoredBase.layers[0].frames[0].content = pointContent(0);
authoredBase.layers[0].frames[0].cellType = "keyframe";
authoredBase.layers[0].frames[0].isBlank = false;

const assertOneHistoryTransaction = async (
  caseId: string,
  baseTimeline: TimelineState,
  mutate: (source: TimelineState) => TimelineState | null,
) => {
  const baseSnapshot = {
    document: editableStickDocumentFromTimeline(baseTimeline, {
      projectId,
      documentRevision: 0,
      title: `Mutation ${caseId}`,
    }),
    viewState: editableStickViewFromTimeline(baseTimeline),
  };
  const baseRoot = await createEditableStickHistoryRoot(baseSnapshot);
  const nextTimeline = mutate(cloneEditableStickTimelineState(baseTimeline));
  assert.ok(nextTimeline, `${caseId} produced a canonical mutation`);
  const nextSnapshot = {
    document: editableStickDocumentFromTimeline(nextTimeline, {
      projectId,
      documentRevision: 1,
      title: `Mutation ${caseId}`,
    }),
    viewState: editableStickViewFromTimeline(nextTimeline),
  };
  const committed = await commitEditableStickHistory(baseRoot, nextSnapshot);
  assert.equal(committed.undo.length, 1, `${caseId} adds exactly one history entry`);
  assert.equal(committed.redo.length, 0, `${caseId} clears redo`);
  assert.equal(await verifyEditableStickEditorVersion(committed.current), true, `${caseId} current digest verifies`);
  const exactPostBytes = canonicalJson(committed.current.snapshot);
  const oneUndo = await undoEditableStickHistory(committed);
  assert.ok(oneUndo, `${caseId} can Undo`);
  assert.equal(canonicalJson(oneUndo.current.snapshot), canonicalJson(baseSnapshot), `${caseId} Undo restores exact snapshot bytes`);
  const oneRedo = await redoEditableStickHistory(oneUndo);
  assert.ok(oneRedo, `${caseId} can Redo`);
  assert.equal(canonicalJson(oneRedo.current.snapshot), exactPostBytes, `${caseId} Redo restores exact snapshot bytes`);
};

await assertOneHistoryTransaction("fps", authoredBase, (state) => { state.fps = 17; return state; });
await assertOneHistoryTransaction("insert-frame", authoredBase, (state) => insertEditableStickTimelineFrame(state, state.activeLayerId, "frame", 1));
await assertOneHistoryTransaction("insert-keyframe", authoredBase, (state) => insertEditableStickTimelineFrame(state, state.activeLayerId, "keyframe", 0));
await assertOneHistoryTransaction("insert-blank", authoredBase, (state) => insertEditableStickTimelineFrame(state, state.activeLayerId, "keyframe", 0, {blank: true}));
await assertOneHistoryTransaction("paste", authoredBase, (state) => pasteEditableStickTimelineFrame(state, state.activeLayerId, 0, pointContent(60)));
const removableBase = insertEditableStickTimelineFrame(authoredBase, authoredBase.activeLayerId, "frame", 1)!;
await assertOneHistoryTransaction("remove", removableBase, (state) => removeEditableStickTimelineFrame(state, state.activeLayerId, 0));
const resizableBase = insertEditableStickTimelineFrame(authoredBase, authoredBase.activeLayerId, "frame", 2)!;
await assertOneHistoryTransaction("resize-held-span", resizableBase, (state) => resizeEditableStickTimelineSpan(state, state.activeLayerId, state.layers[0].frames[0].stateId, 1));
await assertOneHistoryTransaction("add-layer", authoredBase, (state) => addEditableStickLayer(state));
const deletableBase = addEditableStickLayer(authoredBase);
await assertOneHistoryTransaction("delete-layer", deletableBase, (state) => deleteEditableStickLayer(state, state.activeLayerId));
await assertOneHistoryTransaction("content-add", createFreshEditableStickTimelineState(), (state) => replaceEditableStickResolvedContent(state, state.activeLayerId, 0, pointContent(0)));
await assertOneHistoryTransaction("content-clear", authoredBase, (state) => replaceEditableStickResolvedContent(state, state.activeLayerId, 0, createEmptyStickFigureFrameContent()));
await assertOneHistoryTransaction("joint-edit", authoredBase, (state) => {
  const content = copyEditableStickTimelineFrame(state, state.activeLayerId, 0)!;
  content.structureGraph.joints[0].x += 19;
  return replaceEditableStickResolvedContent(state, state.activeLayerId, 0, content);
});
await assertOneHistoryTransaction("limb-edit", authoredBase, (state) => {
  const content = copyEditableStickTimelineFrame(state, state.activeLayerId, 0)!;
  content.structureGraph.joints.push({id: "stick-joint-3", x: 230, y: 220});
  content.structureGraph.limbs.push({id: "stick-limb-2", startJointId: "stick-joint-2", endJointId: "stick-joint-3"});
  return replaceEditableStickResolvedContent(state, state.activeLayerId, 0, content);
});
const authoredBeforeCopy = canonicalJson(authoredBase);
const copied = copyEditableStickTimelineFrame(authoredBase, authoredBase.activeLayerId, 0);
assert.ok(copied);
assert.equal(canonicalJson(authoredBase), authoredBeforeCopy, "Copy is transient and does not mutate the document");
assert.equal(resizeEditableStickTimelineSpan(authoredBase, authoredBase.activeLayerId, authoredBase.layers[0].frames[0].stateId, 0), null, "No-op resize creates no candidate");
assert.equal(deleteEditableStickLayer(authoredBase, authoredBase.activeLayerId), null, "Deleting the only layer creates no candidate");
assert.equal(removeEditableStickTimelineFrame(authoredBase, "missing-layer", 0), null, "Invalid removal creates no candidate");

const byteBoundarySnapshot = (title: string) => ({...snapshot, document: {...snapshot.document, title}});
const emptyTitleVersion = await createEditableStickEditorVersion(byteBoundarySnapshot(""));
const exactTitleLength = STICK_HISTORY_BYTE_LIMIT - editableStickHistoryVersionByteLength(emptyTitleVersion);
assert.ok(exactTitleLength > 0);
const exactByteVersion = await createEditableStickEditorVersion(byteBoundarySnapshot("x".repeat(exactTitleLength)));
assert.equal(editableStickHistoryVersionByteLength(exactByteVersion), STICK_HISTORY_BYTE_LIMIT, "History byte ceiling is exact");
assert.equal(pruneEditableStickHistoryStack([exactByteVersion]).length, 1, "A stack exactly at the byte ceiling is retained");
const tinyVersion = await createEditableStickEditorVersion(byteBoundarySnapshot("tiny"));
const aboveByteStack = pruneEditableStickHistoryStack([tinyVersion, exactByteVersion]);
assert.equal(aboveByteStack.length, 1, "A stack above the byte ceiling evicts oldest-first");
assert.equal(aboveByteStack[0].documentDigest, exactByteVersion.documentDigest);

let recordCapRaw: string | null = null;
for (let index = 0; index < STICK_PROJECT_STORAGE_RECORD_LIMIT; index += 1) {
  const recordDocument = {
    ...snapshot.document,
    projectId: `10000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
  };
  const result = prepareStickProjectSave(recordCapRaw, recordDocument, snapshot.viewState, () => `2026-08-18T00:${String(index).padStart(2, "0")}:00.000Z`);
  assert.ok(result.ok, `Record ${index + 1} fits the exact 32-record cap`);
  recordCapRaw = result.value.nextRawBytes;
}
const recordOverflowDocument = {...snapshot.document, projectId: "10000000-0000-4000-8000-000000000099"};
assert.deepEqual(prepareStickProjectSave(recordCapRaw, recordOverflowDocument, snapshot.viewState, () => "2026-08-20T00:00:00.000Z"), {ok: false, error: "storage_limit_exceeded"});

const exactByteEnvelope = JSON.parse(firstRaw) as {storageVersion: 1; projects: Array<Record<string, unknown>>};
const exactByteFrame = ((exactByteEnvelope.projects[0].document as {layers: Array<{frames: Array<{content: StickFigureFrameContent}>}>}).layers[0].frames[0]);
exactByteFrame.content.figures = [{id: "large-figure", name: "", x: 0, y: 0, scale: 1, rotation: 0}];
const envelopeWithoutNameBytes = new TextEncoder().encode(JSON.stringify(exactByteEnvelope)).byteLength;
exactByteFrame.content.figures[0].name = "x".repeat(STICK_PROJECT_STORAGE_BYTE_LIMIT - envelopeWithoutNameBytes);
const exactEnvelopeRaw = JSON.stringify(exactByteEnvelope);
assert.equal(new TextEncoder().encode(exactEnvelopeRaw).byteLength, STICK_PROJECT_STORAGE_BYTE_LIMIT);
assert.equal(parseStickSavedProjectsEnvelope(exactEnvelopeRaw).ok, true, "Storage envelope exactly at the byte ceiling is accepted");
exactByteFrame.content.figures[0].name += "x";
assert.deepEqual(parseStickSavedProjectsEnvelope(JSON.stringify(exactByteEnvelope)), {ok: false, error: "storage_limit_exceeded"});

assert.deepEqual(readStickSavedProjects({getItem: () => { throw new Error("read"); }}), {ok: false, error: "storage_read_failed"});
assert.deepEqual(openStickSavedProject(storage, "10000000-0000-4000-8000-000000009999"), {ok: false, error: "project_not_found"});
assert.deepEqual(await createBrowserStickStorageCommitPort({setItem: () => { throw new DOMException("quota", "QuotaExceededError"); }}).commit(prepared.value), {ok: false, error: "quota_exceeded"});
assert.deepEqual(await createBrowserStickStorageCommitPort({setItem: () => { throw new Error("write"); }}).commit(prepared.value), {ok: false, error: "storage_write_failed"});
const duplicateEnvelope = JSON.parse(firstRaw) as {storageVersion: 1; projects: unknown[]};
duplicateEnvelope.projects.push(structuredClone(duplicateEnvelope.projects[0]));
assert.deepEqual(parseStickSavedProjectsEnvelope(JSON.stringify(duplicateEnvelope)), {ok: false, error: "invalid_saved_project"});

const firstAnchor = cloneEditableStickTimelineState(onionTimeline);
firstAnchor.layers[0].frames[0].content = pointContent(0);
firstAnchor.layers[0].frames[0].cellType = "keyframe";
firstAnchor.layers[0].frames[0].isBlank = false;
firstAnchor.selectedTimelineIndex = 0;
assert.deepEqual(resolveEditableStickOnionOverlays(firstAnchor).map((entry) => entry.side), ["next"], "First position has only an available next side");
const lastAnchor = cloneEditableStickTimelineState(firstAnchor);
lastAnchor.selectedTimelineIndex = lastAnchor.layers[0].frames.length - 1;
assert.deepEqual(resolveEditableStickOnionOverlays(lastAnchor).map((entry) => entry.side), ["previous"], "Last position has only an available previous side");
const missingActiveLayer = cloneEditableStickTimelineState(firstAnchor);
missingActiveLayer.activeLayerId = "missing-layer";
assert.deepEqual(resolveEditableStickOnionOverlays(missingActiveLayer), [], "Unavailable active layer has no onion overlays");
const blankAnchor = cloneEditableStickTimelineState(firstAnchor);
blankAnchor.layers[0].frames[1].content = createEmptyStickFigureFrameContent();
blankAnchor.layers[0].frames[1].cellType = "blank-keyframe";
blankAnchor.layers[0].frames[1].isBlank = true;
blankAnchor.layers[0].frames[2].content = pointContent(40);
blankAnchor.layers[0].frames[2].cellType = "keyframe";
blankAnchor.layers[0].frames[2].isBlank = false;
blankAnchor.selectedTimelineIndex = 1;
assert.deepEqual(resolveEditableStickOnionOverlays(blankAnchor).map((entry) => entry.side), ["previous", "next"], "A selected blank anchor can show immediate authored neighbors on both sides");
const activeSecondLayer = addEditableStickLayer(firstAnchor);
activeSecondLayer.layers[1].frames[0].content = pointContent(90);
activeSecondLayer.layers[1].frames[0].cellType = "keyframe";
activeSecondLayer.layers[1].frames[0].isBlank = false;
activeSecondLayer.layers[1].frames.push({...structuredClone(activeSecondLayer.layers[1].frames[0]), id: activeSecondLayer.nextFrameId++, stateId: activeSecondLayer.nextStateId++, content: pointContent(110)});
activeSecondLayer.selectedTimelineIndex = 0;
const secondLayerOverlay = resolveEditableStickOnionOverlays(activeSecondLayer);
assert.equal(secondLayerOverlay.length, 1);
assert.deepEqual(secondLayerOverlay[0].content, pointContent(110), "Onion lookup is owned by the active layer only");

console.log("SPEC-0001 Phase 3 Stick history, persistence, and onion validation passed.");
