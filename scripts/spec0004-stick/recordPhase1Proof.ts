import assert from "node:assert/strict";
import {spawnSync} from "node:child_process";
import {createHash} from "node:crypto";
import {mkdirSync, readFileSync, readdirSync, statSync, writeFileSync} from "node:fs";
import {dirname, relative, resolve} from "node:path";
import {
  materializeStickAnimationPlan,
  createStickCommandWorkspaceRoot,
  StickFigureCommandTransactionV1,
} from "../../src/lib/ai/stickFigureCommandExecutor.ts";
import {
  parseStickAnimationPlan,
  type StickAnimationPlanV1,
} from "../../src/lib/ai/stickFigureAiContract.ts";
import {
  STICK_JOINT_ROLES,
  canonicalJson,
  deriveStickLineHead,
  digestCanonical,
  isStickJointManuallyEditable,
  parseStickProjectDocument,
  projectStickAnimationContent,
  type StickProjectDocumentV1,
} from "../../src/lib/stickfigure/stickProjectContract.ts";
import {
  commitEditableStickHistory,
  consumeStickAiCreationLatch,
  createEditableStickHistoryRoot,
  createStickAiCreationLatch,
  editableStickDocumentFromTimeline,
  editableStickTimelineFromCanonicalAnimation,
  editableStickTimelineFromSnapshot,
  editableStickViewFromTimeline,
  isEligibleEditableStickAiStarter,
  redoEditableStickHistory,
  undoEditableStickHistory,
} from "../../src/lib/stickfigure/stickProjectHistory.ts";
import {createFreshEditableStickTimelineState} from "../../src/lib/stickfigure/stickTimeline.ts";
import {
  openStickSavedProject,
  parseStickSavedProjectsEnvelope,
  saveStickProject,
  type StickSavedProjectRecordLegacyV1,
} from "../../src/lib/stickProjectStorage.ts";

const ROOT = process.cwd();
const V1 = resolve(ROOT, "scripts/fixtures/stick-ai/v1");
const V3 = resolve(ROOT, "scripts/fixtures/stick-ai/v3");
const CASES = resolve(ROOT, "scripts/fixtures/spec0004-stick/v1/phase1-plan-cases.json");
const readJson = <T,>(path: string): T => JSON.parse(readFileSync(path, "utf8")) as T;
const sha256 = (value: string | Buffer) => `sha256:${createHash("sha256").update(value).digest("hex")}`;
const clone = <T,>(value: T): T => structuredClone(value);
let assertions = 0;
const equal = (actual: unknown, expected: unknown, message: string) => {
  assert.deepEqual(actual, expected, message);
  assertions += 1;
};
const ok = (value: unknown, message: string) => {
  assert.ok(value, message);
  assertions += 1;
};
const mustParsePlan = async (plan: unknown, starter: StickProjectDocumentV1, message: string) => {
  const result = await parseStickAnimationPlan(plan, starter);
  if (!result.ok) assert.fail(`${message}: ${JSON.stringify(result.error)}`);
  assertions += 1;
  return result.value;
};
const mustMaterialize = async (plan: unknown, starter: StickProjectDocumentV1, message: string) => {
  const result = await materializeStickAnimationPlan(plan, starter);
  if (!result.ok) assert.fail(`${message}: ${JSON.stringify(result.error)}`);
  assertions += 1;
  return result.value;
};

type Phase1Cases = {
  fixtureVersion: 1;
  validFixtures: string[];
  validBoundCases: string[];
  invalidCases: Array<{id: string; operation: string}>;
};

const starter = readJson<StickProjectDocumentV1>(resolve(V1, "fresh-stick-project.json"));
const starterParsed = parseStickProjectDocument(starter);
ok(starterParsed.ok, "canonical Phase 1 starter parses");
const cases = readJson<Phase1Cases>(CASES);
equal(cases.fixtureVersion, 1, "Phase 1 case fixture version");
equal(cases.validFixtures, ["wave", "jump", "bow", "dodge"], "exact named fixed fixture set");

const fixtureResults: Array<{
  fixture: string;
  planDigest: string;
  candidateDigest: string;
  keyPoseCount: number;
  frameCount: number;
  fps: number;
}> = [];

for (const fixture of cases.validFixtures) {
  const plan = readJson<StickAnimationPlanV1>(resolve(V3, `${fixture}.json`));
  const parsed = await mustParsePlan(plan, starter, `${fixture} plan validates`);
  const candidate = await mustMaterialize(parsed, starter, `${fixture} plan materializes`);
  const projection = projectStickAnimationContent(candidate);
  ok(projection.ok, `${fixture} has a complete resolved timeline`);
  equal(candidate.layers.length, 1, `${fixture} preserves one layer`);
  equal(candidate.rigs.length, 1, `${fixture} preserves one rig`);
  equal(candidate.figures.length, 1, `${fixture} preserves one figure`);
  equal(candidate.rigs[0].joints.map((joint) => joint.role), [...STICK_JOINT_ROLES], `${fixture} preserves all normal joint roles`);
  for (let frameIndex = 0; frameIndex < candidate.layers[0].cells.length; frameIndex += 1) {
    for (const role of STICK_JOINT_ROLES) {
      ok(isStickJointManuallyEditable(candidate, frameIndex, role), `${fixture} frame ${frameIndex} ${role} remains manually editable`);
    }
  }
  const firstCell = candidate.layers[0].cells[0];
  if (firstCell.cellType !== "keyframe") assert.fail(`${fixture} first cell must be a key pose`);
  const head = firstCell.poses[0].points[0];
  equal(deriveStickLineHead(head).length, 80, `${fixture} uses the derived horizontal line head`);
  fixtureResults.push({
    fixture,
    planDigest: await digestCanonical(parsed),
    candidateDigest: await digestCanonical(candidate),
    keyPoseCount: candidate.layers[0].cells.filter((cell) => cell.cellType === "keyframe").length,
    frameCount: candidate.layers[0].cells.length,
    fps: candidate.fps,
  });
}
equal(new Set(fixtureResults.map((result) => result.candidateDigest)).size, 4, "all four fixtures produce visibly distinct candidate bytes");

const generalExecutorSource = materializeStickAnimationPlan.toString();
for (const actionName of cases.validFixtures) {
  ok(!generalExecutorSource.includes(actionName), `general executor has no ${actionName} branch`);
}

const wave = readJson<StickAnimationPlanV1>(resolve(V3, "wave.json"));
const changeCommand = (plan: StickAnimationPlanV1, index: number) =>
  plan.commands[index] as unknown as Record<string, unknown>;
const changeJoints = (plan: StickAnimationPlanV1, index: number) =>
  changeCommand(plan, index).joints as Array<Record<string, unknown>>;

const minimum = clone(wave);
changeCommand(minimum, 0).totalFrameCount = 8;
changeCommand(minimum, 2).endFrameIndex = 2;
changeCommand(minimum, 3).frameIndex = 3;
changeCommand(minimum, 4).startFrameIndex = 4;
changeCommand(minimum, 4).endFrameIndex = 5;
changeCommand(minimum, 5).frameIndex = 6;
changeCommand(minimum, 6).startFrameIndex = 7;
changeCommand(minimum, 6).endFrameIndex = 7;
equal((await mustMaterialize(minimum, starter, "minimum bound plan materializes")).layers[0].cells.length, 8, "8-frame lower bound is accepted");

const maximum = clone(wave);
changeCommand(maximum, 0).fps = 24;
changeCommand(maximum, 0).totalFrameCount = 24;
changeCommand(maximum, 2).endFrameIndex = 7;
changeCommand(maximum, 3).frameIndex = 8;
changeCommand(maximum, 4).startFrameIndex = 9;
changeCommand(maximum, 4).endFrameIndex = 15;
changeCommand(maximum, 5).frameIndex = 16;
changeCommand(maximum, 6).startFrameIndex = 17;
changeCommand(maximum, 6).endFrameIndex = 23;
const maximumCandidate = await mustMaterialize(maximum, starter, "maximum bound plan materializes");
equal([maximumCandidate.layers[0].cells.length, maximumCandidate.fps], [24, 24], "24-frame/24-FPS upper bound is accepted");

const invalidResults: Array<{id: string; code: string; path: string}> = [];
for (const testCase of cases.invalidCases) {
  const plan = clone(wave);
  const inputStarter = clone(starter);
  const commands = plan.commands as unknown as Array<Record<string, unknown>>;
  switch (testCase.operation) {
    case "unknown-command": commands[1].type = "teleport"; break;
    case "missing-command": delete commands[1].type; break;
    case "reordered-command": [commands[0], commands[1]] = [commands[1], commands[0]]; break;
    case "duplicate-timing": commands.splice(1, 0, clone(commands[0])); break;
    case "missing-finish": commands.pop(); break;
    case "duplicate-finish": commands.splice(commands.length - 1, 0, clone(commands.at(-1)!)); break;
    case "missing-joint": changeJoints(plan, 1).pop(); break;
    case "extra-joint": changeJoints(plan, 1).push(clone(changeJoints(plan, 1)[0])); break;
    case "aliased-joint": changeJoints(plan, 1)[0].role = "skull"; break;
    case "out-of-bounds-point": changeJoints(plan, 1)[0].x = 1920; break;
    case "non-integer-point": changeJoints(plan, 1)[0].x = 1.5; break;
    case "duplicate-pose-index": commands[3].frameIndex = 0; break;
    case "out-of-range-pose-index": commands[5].frameIndex = 12; break;
    case "overlapping-hold": commands[4].startFrameIndex = 4; break;
    case "timeline-gap": commands[2].endFrameIndex = 2; break;
    case "invalid-hold-owner": commands[2].poseName = "pose-2"; break;
    case "frame-oversize": commands[0].totalFrameCount = 25; break;
    case "fps-oversize": commands[0].fps = 25; break;
    case "wrong-layer": commands[1].targetLayerId = "90000000-0000-4000-8000-000000000004"; break;
    case "wrong-rig": commands[1].targetRigId = "90000000-0000-4000-8000-000000000002"; break;
    case "wrong-figure": commands[1].targetFigureId = "90000000-0000-4000-8000-000000000003"; break;
    case "non-fresh-state": inputStarter.documentRevision = 1; break;
    case "digest-mismatch": plan.baseDocumentDigest = `sha256:${"0".repeat(64)}`; break;
    case "revision-mismatch": plan.baseDocumentRevision = 1; break;
    case "unknown-plan-field": (plan as unknown as Record<string, unknown>).actionName = "wave"; break;
    case "unknown-command-field": commands[1].copyFromPose = "pose-0"; break;
    default: assert.fail(`Unknown invalid-case operation ${testCase.operation}`);
  }
  const beforePlan = canonicalJson(plan);
  const beforeStarter = canonicalJson(inputStarter);
  const result = await parseStickAnimationPlan(plan, inputStarter);
  ok(!result.ok, `${testCase.id} rejects`);
  if (result.ok) assert.fail(`${testCase.id} unexpectedly parsed`);
  equal(canonicalJson(plan), beforePlan, `${testCase.id} rejection does not mutate plan`);
  equal(canonicalJson(inputStarter), beforeStarter, `${testCase.id} rejection does not mutate document`);
  invalidResults.push({id: testCase.id, code: result.error.code, path: result.error.path});
}
equal(invalidResults.map((result) => result.id), cases.invalidCases.map((testCase) => testCase.id), "every named rejection case executed");

const immutableTransactionState = (machine: StickFigureCommandTransactionV1) => {
  const root = machine.snapshot();
  return canonicalJson({
    document: root.editorRoot.current.snapshot.document,
    history: root.editorRoot,
    lastSavedDocumentDigest: root.lastSavedDocumentDigest,
    workspaceGeneration: root.workspaceGeneration,
  });
};
const transactionPlan = readJson<StickAnimationPlanV1>(resolve(V3, "jump.json"));
const previewMachine = new StickFigureCommandTransactionV1(await createStickCommandWorkspaceRoot(starter, "spec0004-preview"));
const previewBefore = immutableTransactionState(previewMachine);
const preview = await previewMachine.preview(transactionPlan);
equal(preview.outcomeCode, "preview_ready", "general plan preview is ready");
equal(immutableTransactionState(previewMachine), previewBefore, "preview is a document/history/storage no-op");
const cancelled = await previewMachine.cancelPreview(transactionPlan);
equal(cancelled.outcomeCode, "cancelled", "general plan preview cancels");
equal(immutableTransactionState(previewMachine), previewBefore, "cancel is a document/history/storage no-op");

const retryMachine = new StickFigureCommandTransactionV1(await createStickCommandWorkspaceRoot(starter, "spec0004-retry"), {failurePoint: "after_action_application"});
const retryBefore = immutableTransactionState(retryMachine);
const failed = await retryMachine.apply(transactionPlan);
equal(failed.outcomeCode, "failed", "injected general-plan failure is terminal");
equal(immutableTransactionState(retryMachine), retryBefore, "failure is an exact document/history/storage no-op");
const retry = await retryMachine.preview(readJson<StickAnimationPlanV1>(resolve(V3, "bow.json")));
equal(retry.outcomeCode, "preview_ready", "a different valid attempt is permitted after failure");

const applyMachine = new StickFigureCommandTransactionV1(await createStickCommandWorkspaceRoot(starter, "spec0004-apply"));
const applied = await applyMachine.apply(transactionPlan);
equal(applied.outcomeCode, "applied", "general plan applies");
equal(applied.root.editorRoot.undo.length, 1, "Apply adds exactly one canonical history action");
equal(applied.root.editorRoot.redo.length, 0, "Apply clears canonical redo");
const acceptedCanonical = applied.root.editorRoot.current.snapshot.document;
const duplicate = await applyMachine.apply(transactionPlan);
equal(duplicate.outcomeCode, "duplicate", "exact Apply redelivery is idempotent");
equal(duplicate.root.editorRoot.undo.length, 1, "duplicate Apply adds no history action");

const stalePlan = clone(transactionPlan);
stalePlan.baseDocumentDigest = `sha256:${"f".repeat(64)}`;
const staleMachine = new StickFigureCommandTransactionV1(await createStickCommandWorkspaceRoot(starter, "spec0004-stale"));
const staleBefore = immutableTransactionState(staleMachine);
const stale = await staleMachine.preview(stalePlan);
equal(stale.result?.error?.code, "stale_document", "stale base digest rejects");
equal(immutableTransactionState(staleMachine), staleBefore, "stale rejection is a no-op");

const concurrencyMachine = new StickFigureCommandTransactionV1(await createStickCommandWorkspaceRoot(starter, "spec0004-concurrency"));
await concurrencyMachine.beginRequest(transactionPlan);
const concurrent = await concurrencyMachine.preview(readJson<StickAnimationPlanV1>(resolve(V3, "bow.json")));
equal(concurrent.result?.error?.code, "concurrency_conflict", "concurrent distinct transaction rejects");
const conflicting = clone(transactionPlan);
conflicting.requestId = "80000000-0000-4000-8000-000000000711";
const idempotency = await concurrencyMachine.preview(conflicting);
equal(idempotency.result?.error?.code, "idempotency_conflict", "same transaction with different bytes rejects");

const projectSwitchMachine = new StickFigureCommandTransactionV1(await createStickCommandWorkspaceRoot(starter, "spec0004-project-a"));
await projectSwitchMachine.preview(transactionPlan);
const pending = await projectSwitchMachine.beginApplyPublication(transactionPlan);
const operationId = pending.root.transactionState.active?.phase === "committing"
  ? pending.root.transactionState.active.operationId
  : null;
ok(operationId, "project-switch proof prepares Apply");
const replacement = clone(starter);
replacement.projectId = "70000000-0000-4000-8000-000000000001";
await projectSwitchMachine.replaceProject(replacement, "spec0004-project-b");
const switched = await projectSwitchMachine.completeApplyPublication(operationId!, transactionPlan);
equal(switched.result?.error?.code, "project_switched", "project switch invalidates pending Apply");
equal(switched.root.editorRoot.current.snapshot.document.projectId, replacement.projectId, "pending candidate never leaks across project switch");

const freshTimeline = createFreshEditableStickTimelineState();
const visibleProjectId = "60000000-0000-4000-8000-000000000001";
const preApplyDocument = editableStickDocumentFromTimeline(freshTimeline, {
  projectId: visibleProjectId,
  documentRevision: 0,
  title: "SPEC-0004 Phase 1 proof",
});
const preApplySnapshot = {document: preApplyDocument, viewState: editableStickViewFromTimeline(freshTimeline)};
const preApplyHistory = await createEditableStickHistoryRoot(preApplySnapshot);
const unconsumedLatch = createStickAiCreationLatch(visibleProjectId, "unconsumed");
ok(isEligibleEditableStickAiStarter(preApplyHistory, unconsumedLatch), "true fresh visible project with unconsumed latch is eligible");
const acceptedTimeline = editableStickTimelineFromCanonicalAnimation(
  acceptedCanonical,
  editableStickTimelineFromSnapshot(preApplySnapshot),
);
const acceptedDocument = editableStickDocumentFromTimeline(acceptedTimeline, {
  projectId: visibleProjectId,
  documentRevision: 1,
  title: preApplyDocument.title,
});
const acceptedHistory = await commitEditableStickHistory(preApplyHistory, {
  document: acceptedDocument,
  viewState: editableStickViewFromTimeline(acceptedTimeline),
});
const consumedLatch = consumeStickAiCreationLatch(unconsumedLatch, visibleProjectId);
ok(consumedLatch, "successful Apply consumes the project-bound latch");
equal(acceptedHistory.undo.length, 1, "visible Apply is exactly one undoable change");
const acceptedBytes = canonicalJson(acceptedHistory.current.snapshot.document);
const undone = await undoEditableStickHistory(acceptedHistory);
ok(undone, "visible Apply can be undone");
equal(canonicalJson(undone!.current.snapshot.document), canonicalJson(preApplyDocument), "Undo restores exact pre-Apply document bytes");
equal(consumedLatch!.status, "consumed", "Undo does not reopen AI creation");
const redone = await redoEditableStickHistory(undone!);
ok(redone, "visible Apply can be redone");
equal(canonicalJson(redone!.current.snapshot.document), acceptedBytes, "Redo restores exact accepted document bytes");
equal(isEligibleEditableStickAiStarter(redone!, consumedLatch!), false, "consumed latch blocks later AI creation");

const manuallyEdited = clone(redone!.current.snapshot.document);
const firstVisibleFrame = manuallyEdited.layers[0].frames[0];
if (!firstVisibleFrame.content) assert.fail("accepted visible frame must contain editable structure content");
const firstVisibleJoint = firstVisibleFrame.content.structureGraph.joints[0];
const originalVisibleX = firstVisibleJoint.x;
firstVisibleJoint.x += 7;
manuallyEdited.documentRevision += 1;
const manualHistory = await commitEditableStickHistory(redone!, {
  document: manuallyEdited,
  viewState: redone!.current.snapshot.viewState,
});
equal(manualHistory.current.snapshot.document.layers[0].frames[0].content?.structureGraph.joints[0].x, originalVisibleX + 7, "generated normal joint accepts a manual edit");
equal(consumedLatch!.status, "consumed", "manual editing does not change the latch");

const memory = new Map<string, string>();
const storage = {
  getItem: (key: string) => memory.get(key) ?? null,
  setItem: (key: string, value: string) => { memory.set(key, value); },
} as Storage;
const savedAccepted = await saveStickProject(storage, acceptedDocument, acceptedHistory.current.snapshot.viewState, {
  now: () => "2026-09-01T00:00:00.000Z",
  aiCreationLatch: consumedLatch!,
});
ok(savedAccepted.ok, "accepted animation and consumed latch save");
const openedAccepted = openStickSavedProject(storage, visibleProjectId);
ok(openedAccepted.ok, "accepted animation reopens");
if (!openedAccepted.ok || openedAccepted.value.recordVersion !== 2) assert.fail("accepted animation must reopen as V2");
equal(canonicalJson(openedAccepted.value.document), canonicalJson(acceptedDocument), "Save/Open preserves exact accepted document bytes");
equal(openedAccepted.value.aiCreationLatch, consumedLatch, "Save/Open preserves consumed latch");

const freshStorage = new Map<string, string>();
const freshPort = {
  getItem: (key: string) => freshStorage.get(key) ?? null,
  setItem: (key: string, value: string) => { freshStorage.set(key, value); },
} as Storage;
ok((await saveStickProject(freshPort, preApplyDocument, preApplySnapshot.viewState, {
  now: () => "2026-09-01T00:01:00.000Z",
  aiCreationLatch: unconsumedLatch,
})).ok, "new fresh record saves its unconsumed latch");
const openedFresh = openStickSavedProject(freshPort, visibleProjectId);
ok(openedFresh.ok && openedFresh.value.recordVersion === 2 && openedFresh.value.aiCreationLatch.status === "unconsumed", "new V2 fresh record safely preserves unconsumed latch");

const legacyRecord: StickSavedProjectRecordLegacyV1 = {
  recordVersion: 1,
  projectId: visibleProjectId,
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-08-01T00:00:00.000Z",
  document: clone(preApplyDocument),
  reopenState: clone(preApplySnapshot.viewState),
};
const legacyRaw = canonicalJson({storageVersion: 1, projects: [legacyRecord]});
const legacyParsed = parseStickSavedProjectsEnvelope(legacyRaw);
ok(legacyParsed.ok, "existing V1 saved record still parses");
equal(legacyParsed.ok ? legacyParsed.value.projects[0].document : null, legacyRecord.document, "V1 reopen preserves document data");
const legacyMemory = new Map([["da_saved_stick_projects_v1", legacyRaw]]);
const legacyStorage = {
  getItem: (key: string) => legacyMemory.get(key) ?? null,
  setItem: (key: string, value: string) => { legacyMemory.set(key, value); },
} as Storage;
const beforeLegacyOpen = legacyMemory.get("da_saved_stick_projects_v1");
const openedLegacy = openStickSavedProject(legacyStorage, visibleProjectId);
ok(openedLegacy.ok && openedLegacy.value.recordVersion === 1, "legacy V1 opens without silent migration");
equal(legacyMemory.get("da_saved_stick_projects_v1"), beforeLegacyOpen, "Open performs no storage write");
const legacyDefaultLatch = createStickAiCreationLatch(visibleProjectId, "consumed");
equal(isEligibleEditableStickAiStarter(preApplyHistory, legacyDefaultLatch), false, "absent legacy latch defaults to consumed/not eligible");
ok((await saveStickProject(legacyStorage, legacyRecord.document, legacyRecord.reopenState, {
  now: () => "2026-09-01T00:02:00.000Z",
})).ok, "normal explicit Save migrates legacy record");
const migrated = openStickSavedProject(legacyStorage, visibleProjectId);
ok(migrated.ok && migrated.value.recordVersion === 2 && migrated.value.aiCreationLatch.status === "consumed", "explicit Save is the only V1-to-V2 migration and cannot grant eligibility");

const panelSource = readFileSync(resolve(ROOT, "src/components/workspace/stickfigure/StickFigureAiPanel.tsx"), "utf8");
ok(panelSource.includes('"AI editing comes later; use manual tools."'), "post-Apply result copy is exact");
ok(panelSource.indexOf("snapshot.aiCreationConsumed") < panelSource.indexOf("interpretStickAiPromptV2(prompt)"), "post-Apply no-op occurs before local interpretation");
ok(panelSource.indexOf("snapshot.aiCreationConsumed") < panelSource.indexOf('fetch("/api/ai", {\n        method: "POST"'), "post-Apply no-op occurs before provider/API routing");

const executorSource = readFileSync(resolve(ROOT, "src/lib/ai/stickFigureCommandExecutor.ts"), "utf8");
const generalStart = executorSource.indexOf("const materializeParsedStickAnimationPlan");
const generalEnd = executorSource.indexOf("/** Materializes every Phase 1 fixture", generalStart);
const generalBody = executorSource.slice(generalStart, generalEnd);
for (const forbidden of ["wave", "jump", "bow", "dodge", "fetch(", "openai", "provider", "api/ai", "glow", "locked"]) {
  ok(!generalBody.toLowerCase().includes(forbidden), `general executor contains no ${forbidden} branch/artifact`);
}

const outputIndex = process.argv.indexOf("--output");
const outputPath = resolve(ROOT, outputIndex >= 0 && process.argv[outputIndex + 1]
  ? process.argv[outputIndex + 1]
  : "output/spec-0004/phase-1/unit-proof.json");
const receipt = {
  receiptVersion: 1,
  phase: "SPEC-0004 Phase 1",
  generatedAt: new Date().toISOString(),
  nodeVersion: process.version,
  assertions,
  fixtureResults,
  invalidResults,
  validBounds: cases.validBoundCases,
  transactionProof: {
    previewNoop: true,
    cancelNoop: true,
    failureNoop: true,
    retryAllowed: true,
    staleNoop: true,
    projectSwitchNoop: true,
    idempotencyGuard: true,
    concurrencyGuard: true,
    applyHistoryActions: 1,
  },
  latchPersistenceProof: {
    applyConsumed: true,
    undoStillConsumed: true,
    redoExactBytes: true,
    saveOpenExactBytes: true,
    freshV2UnconsumedPreserved: true,
    legacyV1DefaultConsumed: true,
    legacyOpenNoWrite: true,
    explicitSaveMigrationOnly: true,
  },
  manualEditProof: {allFramesAndJointsEditable: true, visibleJointEditCommitted: true},
  zeroProviderRequests: true,
};
mkdirSync(dirname(outputPath), {recursive: true});
const receiptBytes = `${JSON.stringify(receipt, null, 2)}\n`;
writeFileSync(outputPath, receiptBytes);
console.log(`SPEC-0004 Phase 1 unit proof passed (${assertions} assertions).`);
console.log(`Receipt: ${outputPath}`);
console.log(`Receipt SHA-256: ${sha256(receiptBytes)}`);

type ProofCommand = {
  name: string;
  argv: string[];
  acceptBaselineLint?: boolean;
};

const PHASE_1_AUTHORIZED_PATH_CEILING = [
  "src/lib/ai/stickFigureAiContract.ts",
  "src/lib/ai/stickFigureCommandExecutor.ts",
  "src/lib/ai/stickFigureAiWorkspaceAdapter.ts",
  "src/lib/ai/stickFigureAiMockServer.ts",
  "src/lib/stickfigure/stickProjectContract.ts",
  "src/lib/stickfigure/stickProjectHistory.ts",
  "src/lib/stickProjectStorage.ts",
  "src/components/workspace/stickfigure/StickFigureAiPanel.tsx",
  "src/components/workspace/stickfigure/StickFigureWorkspace.tsx",
  "scripts/validateStickFigureAiContracts.ts",
  "scripts/validateStickFigureCommandTransaction.ts",
  "scripts/validateStickHistoryPersistence.ts",
  "scripts/validateStickFigureAiUiAdapter.ts",
  "scripts/fixtures/stick-ai/v3/**",
  "scripts/fixtures/spec0004-stick/v1/**",
  "scripts/spec0004-stick/phase1BrowserProof.ts",
  "scripts/spec0004-stick/recordPhase1Proof.ts",
  "scripts/spec0004-stick/validatePhase1Proof.ts",
] as const;

const isAuthorizedPhase1Path = (path: string) =>
  PHASE_1_AUTHORIZED_PATH_CEILING.some((allowed) =>
    allowed.endsWith("/**") ? path.startsWith(allowed.slice(0, -2)) : path === allowed,
  );

const runGit = (args: string[]) => {
  const result = spawnSync("git", args, {cwd: ROOT, encoding: "utf8"});
  assert.equal(result.status, 0, `git ${args.join(" ")} failed: ${result.stderr}`);
  return result.stdout.trim();
};

const walkFiles = (directory: string): string[] => readdirSync(directory, {withFileTypes: true})
  .flatMap((entry) => {
    const path = resolve(directory, entry.name);
    return entry.isDirectory() ? walkFiles(path) : [path];
  });

if (process.argv.includes("--finalize")) {
  const proofRoot = resolve(ROOT, "output/spec-0004/phase-1");
  const receiptsRoot = resolve(proofRoot, "receipts");
  mkdirSync(receiptsRoot, {recursive: true});
  const focusedLintPaths = [
    "src/lib/ai/stickFigureAiContract.ts",
    "src/lib/ai/stickFigureCommandExecutor.ts",
    "src/lib/ai/stickFigureAiWorkspaceAdapter.ts",
    "src/lib/stickfigure/stickProjectHistory.ts",
    "src/lib/stickProjectStorage.ts",
    "src/components/workspace/stickfigure/StickFigureAiPanel.tsx",
    "src/components/workspace/stickfigure/StickFigureWorkspace.tsx",
    "scripts/validateStickFigureAiUiAdapter.ts",
    "scripts/spec0004-stick/phase1BrowserProof.ts",
    "scripts/spec0004-stick/recordPhase1Proof.ts",
    "scripts/spec0004-stick/validatePhase1Proof.ts",
  ];
  const commands: ProofCommand[] = [
    {name: "spec0001-contract-regression", argv: ["node", "--experimental-strip-types", "scripts/validateStickFigureAiContracts.ts"]},
    {name: "spec0001-command-transaction-regression", argv: ["node", "--experimental-strip-types", "scripts/validateStickFigureCommandTransaction.ts"]},
    {name: "spec0001-history-persistence-regression", argv: ["node", "--experimental-strip-types", "scripts/validateStickHistoryPersistence.ts"]},
    {name: "spec0001-wave-typo-ui-regression", argv: ["node", "--experimental-strip-types", "scripts/validateStickFigureAiUiAdapter.ts"]},
    {name: "spec0001-mock-route-regression", argv: ["node", "--experimental-strip-types", "scripts/validateStickFigureAiMockRoute.ts"]},
    {name: "spec0001-pose-timeline-regression", argv: ["node", "--experimental-strip-types", "scripts/validateStickPoseTimeline.ts"]},
    {name: "drawing-ai-preferences-regression", argv: ["node", "--experimental-strip-types", "scripts/validateDrawingAiControlPreferences.ts"]},
    {name: "drawing-project-memory-regression", argv: ["node", "--experimental-strip-types", "scripts/validateDrawingProjectAiMemory.ts"]},
    {name: "drawing-route-safety-regression", argv: ["node", "--experimental-strip-types", "scripts/validateDrawingProjectAiMemoryRouteSafety.ts"]},
    {name: "timeline-playback-regression", argv: ["node", "--experimental-strip-types", "scripts/validateTimelinePlaybackSmoothing.ts"]},
    {name: "typescript", argv: ["./node_modules/.bin/tsc", "--noEmit", "--incremental", "false"]},
    {name: "focused-lint", argv: ["./node_modules/.bin/eslint", ...focusedLintPaths]},
    {name: "full-lint-measured-baseline", argv: ["npm", "run", "lint"], acceptBaselineLint: true},
    {name: "diff-check", argv: ["git", "diff", "--check"]},
  ];
  const proofEnvironment = {
    ...process.env,
    DIAMOND_STICK_AI_V1_MODE: "mock",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "",
    NEXT_PUBLIC_SUPABASE_URL: "",
    NEXT_TELEMETRY_DISABLED: "1",
    OPENAI_API_KEY: "",
    SUPABASE_SERVICE_ROLE_KEY: "",
  };
  const testResults = commands.map((command) => {
    const result = spawnSync(command.argv[0], command.argv.slice(1), {
      cwd: ROOT,
      encoding: "utf8",
      env: proofEnvironment,
      maxBuffer: 16 * 1024 * 1024,
    });
    const combinedOutput = `${result.stdout ?? ""}${result.stderr ?? ""}`.replaceAll(ROOT, "<PHASE1_WORKTREE>");
    const baselineMatched = command.acceptBaselineLint === true
      && result.status === 1
      && combinedOutput.includes("77 problems (5 errors, 72 warnings)");
    const passed = result.status === 0 || baselineMatched;
    assert.equal(passed, true, `${command.name} failed with exit ${result.status}: ${combinedOutput.slice(-2_000)}`);
    const receiptPath = resolve(receiptsRoot, `${command.name}.json`);
    const commandReceipt = {
      receiptVersion: 1,
      name: command.name,
      argv: command.argv,
      exitCode: result.status,
      status: baselineMatched ? "accepted-identical-baseline" : "passed",
      stdoutAndStderr: combinedOutput,
    };
    const bytes = `${JSON.stringify(commandReceipt, null, 2)}\n`;
    writeFileSync(receiptPath, bytes);
    return {
      name: command.name,
      command: command.argv.join(" "),
      exitCode: result.status,
      status: commandReceipt.status,
      receiptPath: relative(ROOT, receiptPath),
      receiptSha256: sha256(bytes),
      receiptBytes: Buffer.byteLength(bytes),
    };
  });

  const activationSha = "9fae072359f3c0d10f1ed2bcee8da9ebc11d54ec";
  equal(runGit(["rev-parse", "HEAD"]), activationSha, "final proof remains on the exact activation HEAD");
  equal(runGit(["rev-parse", "main"]), activationSha, "local canonical main remains on the exact activation SHA");
  equal(runGit(["diff", "--cached", "--name-only"]), "", "final proof index remains empty");
  const changedTracked = runGit(["diff", "--name-only"]).split("\n").filter(Boolean);
  const untracked = runGit(["ls-files", "--others", "--exclude-standard"]).split("\n").filter(Boolean);
  const dirtyPaths = [...new Set([...changedTracked, ...untracked])].sort();
  ok(dirtyPaths.length > 0, "Phase 1 implementation has a nonempty exact dirty-path set");
  for (const path of dirtyPaths) ok(isAuthorizedPhase1Path(path), `${path} is inside the Phase 1 authorization ceiling`);

  const browserPath = resolve(proofRoot, "browser/browser-proof.json");
  const browserBytes = readFileSync(browserPath, "utf8");
  const browser = JSON.parse(browserBytes) as {
    review: {url: string; serverPid: number; unpublished: boolean; non3000: boolean};
    browserEvidence: {
      fixtureEvidence: unknown[];
      screenshots: unknown[];
      flows: string[];
      network: {externalRequests: number; apiRequests: number; providerRequests: number};
      consoleErrors: unknown[];
    };
  };
  equal(browser.review.unpublished, true, "review copy is unpublished");
  equal(browser.review.non3000, true, "review copy uses a non-3000 port");
  equal(browser.browserEvidence.fixtureEvidence.length, 4, "browser receipt covers four fixed fixture plans");
  equal(browser.browserEvidence.network.externalRequests, 0, "browser proof made zero external requests");
  equal(browser.browserEvidence.network.apiRequests, 0, "browser proof made zero API requests");
  equal(browser.browserEvidence.network.providerRequests, 0, "browser proof made zero provider requests");
  equal(browser.browserEvidence.consoleErrors.length, 0, "browser proof recorded zero console errors");
  process.kill(browser.review.serverPid, 0);

  const excludedArtifacts = new Set([
    resolve(proofRoot, "proof-manifest.json"),
    resolve(proofRoot, "proof-manifest-validation.json"),
    resolve(proofRoot, "browser/review-server.log"),
  ]);
  const artifacts = walkFiles(proofRoot)
    .filter((path) => !excludedArtifacts.has(path))
    .sort()
    .map((path) => {
      const bytes = readFileSync(path);
      return {
        path: relative(ROOT, path),
        sha256: sha256(bytes),
        bytes: statSync(path).size,
      };
    });
  const unit = JSON.parse(receiptBytes) as {assertions: number; invalidResults: unknown[]; fixtureResults: unknown[]};
  const manifest = {
    manifestVersion: 1,
    phase: "SPEC-0004 Phase 1 — Safe One-Time Animation Builder",
    generatedAt: new Date().toISOString(),
    activation: {
      head: activationSha,
      localMain: activationSha,
      activationParent: "a853bf96f193b1e4ae297dc8e76c4fceb485612c",
      indexEmpty: true,
      dedicatedWorktree: ROOT,
    },
    scope: {
      authorizedPathCeiling: PHASE_1_AUTHORIZED_PATH_CEILING,
      exactDirtyPathAllowlist: dirtyPaths,
      outsideAllowlistPaths: [],
      docsChanged: false,
      projectStructureChanged: false,
      packageOrConfigChanged: false,
      apiOrProviderPathChanged: false,
      stagedPaths: [],
    },
    counts: {
      unitAssertions: unit.assertions,
      invalidRejectionCases: unit.invalidResults.length,
      validFixturePlans: unit.fixtureResults.length,
      technicalTestReceipts: testResults.length,
      browserScreenshots: browser.browserEvidence.screenshots.length,
      browserFlows: browser.browserEvidence.flows.length,
      proofArtifacts: artifacts.length,
    },
    testResults,
    browser: {
      receiptPath: relative(ROOT, browserPath),
      receiptSha256: sha256(browserBytes),
      receiptBytes: Buffer.byteLength(browserBytes),
      reviewUrl: browser.review.url,
      serverPid: browser.review.serverPid,
      fixtureCount: browser.browserEvidence.fixtureEvidence.length,
      externalRequests: 0,
      apiRequests: 0,
      providerRequests: 0,
    },
    historicalHarnessBoundary: {
      unchanged: true,
      registrationSelfTestNotUsed: true,
      reason: "The immutable SPEC-0001 Phase 6 harness rejects new SPEC-0004 dirty paths outside its historical authorization ceiling; protected behavior is proved by its source-direct validators plus the independent SPEC-0004 browser proof.",
    },
    artifacts,
    unchangedSystems: [
      "SPEC-0001 V1/V2 deterministic wave command and typo behavior",
      "human Stick timeline, Play/Pause, onion, Creator, and manual tools",
      "Drawing workspace and Drawing AI memory/routes",
      "app/api/ai/route.ts and all provider/API clients",
      "Home, dashboard, auth, billing, and deployment systems",
      "AGENTS.md, docs/**, and project/project_structure.txt",
    ],
  };
  const manifestPath = resolve(proofRoot, "proof-manifest.json");
  const manifestBytes = `${JSON.stringify(manifest, null, 2)}\n`;
  writeFileSync(manifestPath, manifestBytes);
  console.log(`Final technical proof manifest: ${manifestPath}`);
  console.log(`Manifest SHA-256: ${sha256(manifestBytes)}`);
  console.log(`Manifest bytes: ${Buffer.byteLength(manifestBytes)}`);
  console.log(`Artifacts: ${artifacts.length}; receipts: ${testResults.length}; dirty paths: ${dirtyPaths.length}.`);
}
