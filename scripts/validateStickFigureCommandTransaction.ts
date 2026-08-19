import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import {
  STICK_COMMAND_FAILURE_POINTS,
  STICK_TERMINAL_LEDGER_LIMIT,
  StickFigureCommandTransactionV1,
  createStickCommandWorkspaceRoot,
} from "../src/lib/ai/stickFigureCommandExecutor.ts";
import type {StickCommandBatchV1} from "../src/lib/ai/stickFigureAiContract.ts";
import type {StickCommandOperationOutcomeV1} from "../src/lib/ai/stickFigureCommandExecutor.ts";
import {
  STICK_JOINT_ROLES,
  canonicalJson,
  cloneCanonical,
  deepFreeze,
  digestCanonical,
  isStickJointManuallyEditable,
  parseStickProjectDocument,
  projectStickAnimationContent,
  type StickProjectDocumentV1,
} from "../src/lib/stickfigure/stickProjectContract.ts";
import {
  commitCanonicalStickHistory,
  createEditableStickHistoryRoot,
  editableStickDocumentFromTimeline,
  editableStickViewFromTimeline,
  isEligibleEditableStickWaveStarter,
  redoCanonicalStickHistory,
  undoCanonicalStickHistory,
} from "../src/lib/stickfigure/stickProjectHistory.ts";
import {
  applyCompletedStickJointEdit,
  completeStickBootstrap,
  createStickBootstrapRoot,
  resolveStickTimelinePose,
  createFreshEditableStickTimelineState,
} from "../src/lib/stickfigure/stickTimeline.ts";

const ROOT = process.cwd();
const FIXTURES = resolve(ROOT, "scripts/fixtures/stick-ai/v1");
const read = <T,>(name: string) => JSON.parse(readFileSync(resolve(FIXTURES, name), "utf8")) as T;
const starter = read<StickProjectDocumentV1>("fresh-stick-project.json");
const envelope = read<StickCommandBatchV1>("wave-command-batch.json");
const aiGolden = read<StickProjectDocumentV1>("wave-applied-project.json");
const equivalence = read<{aiContent: unknown; animationContentDigest: string}>("manual-ai-content-equivalence.json");
const transactionCases = read<{fixtureVersion: number; terminalLedgerLimit: number; cases: unknown[]; failurePoints: string[]}>("stick-command-transaction-cases.json");
const raceCases = read<{fixtureVersion: number; cases: Array<{id: string; steps?: string[]}>}>("stick-command-publication-race-cases.json");

let assertions = 0;
const equal = <T,>(actual: T, expected: T, message: string) => {
  assert.deepEqual(actual, expected, message);
  assertions += 1;
};
const ok = (value: unknown, message: string) => {
  assert.ok(value, message);
  assertions += 1;
};
const resultOf = (outcome: StickCommandOperationOutcomeV1) => {
  if (!outcome.result) throw new Error(`Expected a terminal/preview result for ${outcome.outcomeCode}.`);
  return outcome.result;
};

const immutableProjection = (root: ReturnType<StickFigureCommandTransactionV1["snapshot"]>) => ({
  document: root.editorRoot.current.snapshot.document,
  history: root.editorRoot,
  lastSavedDocumentDigest: root.lastSavedDocumentDigest,
  workspaceGeneration: root.workspaceGeneration,
});

const newMachine = async () => new StickFigureCommandTransactionV1(
  await createStickCommandWorkspaceRoot(starter, "phase4-workspace-v1"),
);

// The Workspace adapter may start only from the exact pristine visible Stick project.
{
  const timeline = createFreshEditableStickTimelineState();
  const document = editableStickDocumentFromTimeline(timeline, {
    projectId: "00000000-0000-4000-8000-000000004010",
    documentRevision: 0,
    title: "Eligible blank Stick project",
  });
  const root = await createEditableStickHistoryRoot({document, viewState: editableStickViewFromTimeline(timeline)});
  equal(isEligibleEditableStickWaveStarter(root), true, "exact pristine visible project is eligible for the bounded wave command");
  const editedDocument = cloneCanonical(document);
  editedDocument.documentRevision = 1;
  const editedRoot = await createEditableStickHistoryRoot({document: editedDocument, viewState: editableStickViewFromTimeline(timeline)});
  equal(isEligibleEditableStickWaveStarter(editedRoot), false, "authored visible project cannot be overwritten by the bounded wave command");
  equal(isEligibleEditableStickWaveStarter({...root, undo: [root.current]}), false, "visible project with history cannot be treated as a fresh starter");
}

equal(transactionCases.fixtureVersion, 1, "transaction fixture version");
equal(transactionCases.terminalLedgerLimit, STICK_TERMINAL_LEDGER_LIMIT, "terminal ledger fixture limit");
equal(transactionCases.cases.length, 10, "transaction matrix row count");
equal(transactionCases.failurePoints, [...STICK_COMMAND_FAILURE_POINTS], "failure fixture points");
equal(raceCases.fixtureVersion, 1, "race fixture version");

// Preview is pure and exact redelivery reuses its result.
{
  const machine = await newMachine();
  const before = machine.snapshot();
  const preview = await machine.preview(deepFreeze(cloneCanonical(envelope)));
  equal(preview.outcomeCode, "preview_ready", "valid preview outcome");
  equal(resultOf(preview).status, "previewed", "valid preview result status");
  equal(immutableProjection(preview.root), immutableProjection(before), "preview leaves project/history/storage/generation unchanged");
  const redelivery = await machine.redeliver(envelope);
  equal(redelivery.outcomeCode, "preview_reused", "preview redelivery is reused");
  equal(redelivery.result, preview.result, "preview redelivery is byte-identical");
  equal(immutableProjection(redelivery.root), immutableProjection(before), "preview redelivery is a no-op");
}

// Gated publication exposes no partial root and performs one final composite swap.
{
  const machine = await newMachine();
  const before = machine.snapshot();
  const preview = await machine.preview(envelope);
  const pending = await machine.beginApplyPublication(envelope);
  equal(preview.outcomeCode, "preview_ready", "gated preview ready");
  equal(pending.outcomeCode, "apply_publication_pending", "gated apply pending");
  equal(immutableProjection(pending.root), immutableProjection(before), "pending publication exposes no mutation");
  equal(pending.root.transactionState.active?.phase, "committing", "one committing closure is active");
  const inProgress = await machine.redeliver(envelope);
  equal(inProgress.outcomeCode, "commit_in_progress", "redelivery during publication is in progress");
  equal(immutableProjection(inProgress.root), immutableProjection(before), "commit-in-progress is a no-op");
  const operationId = pending.root.transactionState.active?.phase === "committing"
    ? pending.root.transactionState.active.operationId
    : "";
  ok(operationId.length > 0, "publication operation ID exists");
  const applied = await machine.completeApplyPublication(operationId, envelope);
  equal(applied.outcomeCode, "applied", "publication completes once");
  equal(resultOf(applied).status, "applied", "publication result is applied");
  equal(resultOf(applied).mutationCount, 1, "publication reports one mutation");
  equal(applied.root.workspaceGeneration, before.workspaceGeneration + 1, "generation increments once");
  equal(applied.root.editorRoot.undo.length, before.editorRoot.undo.length + 1, "history gains one undo entry");
  equal(applied.root.editorRoot.redo.length, 0, "Apply clears redo");
  equal(applied.root.editorRoot.current.snapshot.document, aiGolden, "Apply reproduces the checked-in AI golden");
  equal<unknown>(projectStickAnimationContent(applied.root.editorRoot.current.snapshot.document), {ok: true, value: equivalence.aiContent}, "Apply content projection equals manual golden");
  equal(await digestCanonical(equivalence.aiContent), equivalence.animationContentDigest, "manual/AI content digest remains exact");
  const duplicate = await machine.redeliver(envelope);
  equal(duplicate.outcomeCode, "duplicate", "post-Apply redelivery is duplicate");
  equal(resultOf(duplicate).status, "duplicate", "duplicate status is stable");
  equal(resultOf(duplicate).mutationCount, 0, "duplicate mutation count is zero");
  equal(duplicate.root.editorRoot, applied.root.editorRoot, "duplicate leaves history/document unchanged");
  equal(
    raceCases.cases.find((entry) => entry.id === "gated-apply-publication")?.steps,
    ["preview_ready", "apply_publication_pending", "commit_in_progress", "applied", "duplicate"],
    "gated sequence fixture is exact",
  );

  const undone = await undoCanonicalStickHistory(applied.root.editorRoot);
  ok(undone, "AI Apply can be undone");
  equal(undone?.current.snapshot.document, starter, "Undo restores exact starter");
  const redone = undone ? await redoCanonicalStickHistory(undone) : null;
  ok(redone, "AI Apply can be redone");
  equal(redone?.current.snapshot.document, aiGolden, "Redo restores exact AI result");
  for (const role of STICK_JOINT_ROLES) {
    equal(isStickJointManuallyEditable(aiGolden, 0, role), true, `${role} remains manually editable after Apply`);
  }

  // Exercise the real Phase 2 completed-edit reducer for every ordinary joint,
  // then commit one correction through the Phase 3 canonical history path.
  const editWorkspace = completeStickBootstrap(
    createStickBootstrapRoot(
      aiGolden,
      "fixture",
      "none",
      "00000000-0000-4000-8000-000000004001",
      "00000000-0000-4000-8000-000000004002",
    ),
    aiGolden,
    "00000000-0000-4000-8000-000000004001",
    await digestCanonical(aiGolden),
  );
  if (editWorkspace.rootStatus !== "mounted") throw new Error("Applied AI fixture did not mount for manual-edit proof.");
  const resolved = resolveStickTimelinePose(aiGolden, 4);
  if (!resolved) throw new Error("Applied AI fixture has no editable middle pose.");
  let committedCorrection: StickProjectDocumentV1 | null = null;
  for (const [index, role] of STICK_JOINT_ROLES.entries()) {
    const joint = aiGolden.rigs[0].joints.find((candidate) => candidate.role === role);
    const point = joint && resolved.pose.points.find((candidate) => candidate.jointId === joint.jointId);
    if (!joint || !point) throw new Error(`Missing ${role} in applied AI fixture.`);
    const candidate = applyCompletedStickJointEdit(editWorkspace, {
      baseWorkspaceInstanceId: editWorkspace.workspaceInstanceId,
      projectId: aiGolden.projectId,
      baseRevision: aiGolden.documentRevision,
      baseWorkspaceGeneration: editWorkspace.workspaceGeneration,
      selectedFrameId: resolved.selectedCell.frameId,
      selectedFrameIndex: 4,
      controllingFrameId: resolved.controllingCell.frameId,
      controllingFrameIndex: resolved.controllingFrameIndex,
      poseId: resolved.pose.poseId,
      jointId: joint.jointId,
      jointRole: role,
      from: {x: point.x, y: point.y},
      to: {x: point.x + index + 1, y: point.y + index + 1},
      preStateDigest: editWorkspace.editorRoot.current.documentDigest,
    });
    ok(candidate, `${role} accepts a real completed manual edit after AI Apply`);
    if (role === "rightHand") committedCorrection = candidate;
  }
  if (!committedCorrection) throw new Error("Right-hand correction fixture was not produced.");
  const correctedHistory = await commitCanonicalStickHistory(applied.root.editorRoot, {
    document: committedCorrection,
    viewState: applied.root.editorRoot.current.snapshot.viewState,
  });
  equal(correctedHistory.undo.length, applied.root.editorRoot.undo.length + 1, "manual correction adds one normal Phase 3 history entry");
  const correctionUndone = await undoCanonicalStickHistory(correctedHistory);
  equal(correctionUndone?.current.snapshot.document, aiGolden, "Undo removes only the manual correction and restores AI Apply");
  const correctionRedone = correctionUndone ? await redoCanonicalStickHistory(correctionUndone) : null;
  equal(correctionRedone?.current.snapshot.document, committedCorrection, "Redo restores the manual correction exactly");
}

// Request start is a real non-terminal state, not a disguised rejection.
{
  const machine = await newMachine();
  const requesting = await machine.beginRequest(envelope);
  equal(requesting.outcomeCode, "requesting", "request enters requesting state");
  equal(requesting.result, null, "request start carries no fake terminal error result");
}

// A prepared fork can complete without changing the authoritative source.
{
  const machine = await newMachine();
  await machine.preview(envelope);
  const authoritativeBefore = machine.snapshot();
  const working = machine.fork();
  const pending = await working.beginApplyPublication(envelope);
  const operationId = pending.root.transactionState.active?.phase === "committing"
    ? pending.root.transactionState.active.operationId
    : "";
  const applied = await working.completeApplyPublication(operationId, envelope);
  equal(applied.outcomeCode, "applied", "isolated fork can prepare an applied root");
  equal(machine.snapshot(), authoritativeBefore, "isolated Apply cannot half-mutate the authoritative source machine");
  const unknown = await machine.completeApplyPublication("phase4-missing-operation", envelope);
  equal(unknown.outcomeCode, "rejected", "unknown publication completion returns a typed rejection");
  equal(resultOf(unknown).error?.code, "stale_document", "unknown completion never throws raw state");
}

// Same transaction with different bytes conflicts before stale checking.
{
  const machine = await newMachine();
  await machine.apply(envelope);
  const conflict = cloneCanonical(envelope);
  conflict.requestId = "00000000-0000-4000-8000-000000009999";
  const before = machine.snapshot();
  const result = await machine.redeliver(conflict);
  equal(result.outcomeCode, "rejected", "conflicting duplicate rejects");
  equal(resultOf(result).error?.code, "idempotency_conflict", "conflicting duplicate code");
  equal(immutableProjection(result.root), immutableProjection(before), "conflicting duplicate is a no-op");
}

// A conflicting redelivery is also idempotency-conflicted while Preview is active.
{
  const machine = await newMachine();
  await machine.preview(envelope);
  const conflict = cloneCanonical(envelope);
  conflict.requestId = "00000000-0000-4000-8000-000000009997";
  const before = machine.snapshot();
  const result = await machine.redeliver(conflict);
  equal(result.outcomeCode, "rejected", "active conflicting duplicate rejects");
  equal(resultOf(result).error?.code, "idempotency_conflict", "active conflicting duplicate code");
  equal(result.root, before, "active conflicting duplicate changes no request, ledger, project, history, or storage state");
}

// Cancel and Abort are terminal no-ops.
for (const operation of ["cancel", "abort"] as const) {
  const machine = await newMachine();
  const before = machine.snapshot();
  if (operation === "cancel") await machine.preview(envelope);
  else await machine.beginRequest(envelope);
  const result = operation === "cancel" ? await machine.cancelPreview(envelope) : await machine.abortRequest(envelope);
  equal(result.outcomeCode, operation === "cancel" ? "cancelled" : "aborted", `${operation} outcome`);
  equal(resultOf(result).error?.code, operation === "cancel" ? "preview_cancelled" : "aborted", `${operation} error code`);
  equal(immutableProjection(result.root), immutableProjection(before), `${operation} leaves project/history/storage unchanged`);
  equal(result.root.transactionState.active, null, `${operation} clears active state`);
}

// Stale and switched project requests fail closed.
{
  const machine = await newMachine();
  const stale = cloneCanonical(envelope);
  stale.baseDocumentRevision += 1;
  const before = machine.snapshot();
  const result = await machine.preview(stale);
  equal(resultOf(result).error?.code, "stale_document", "stale request rejects");
  equal(immutableProjection(result.root), immutableProjection(before), "stale request is a no-op");
  const repeated = await machine.preview(stale);
  equal(repeated.result, result.result, "rejected stale request is remembered exactly");
  equal(repeated.root.transactionState.terminalLedger.length, 1, "rejected stale redelivery creates no second terminal");
}
{
  const machine = await newMachine();
  const switched = cloneCanonical(starter);
  switched.projectId = "00000000-0000-4000-8000-000000009998";
  await machine.replaceProject(switched, "phase4-workspace-v2");
  const before = machine.snapshot();
  const result = await machine.preview(envelope);
  equal(resultOf(result).error?.code, "project_switched", "old-project request rejects");
  equal(immutableProjection(result.root), immutableProjection(before), "project switch rejection preserves replacement project");
}

// A human publication after preview wins; the delayed AI Apply becomes stale.
{
  const machine = await newMachine();
  await machine.preview(envelope);
  const manual = cloneCanonical(starter);
  manual.documentRevision = 1;
  const firstPose = manual.layers[0].cells[0];
  if (firstPose.cellType !== "keyframe") throw new Error("starter first cell must be a keyframe");
  firstPose.poses[0].points[6].x += 1;
  await machine.publishManualDocument(manual);
  const beforeAttempt = machine.snapshot();
  const result = await machine.beginApplyPublication(envelope);
  equal(resultOf(result).error?.code, "stale_document", "manual publication invalidates preview");
  equal(immutableProjection(result.root), immutableProjection(beforeAttempt), "stale AI Apply preserves the human edit");
}

// An authored edit published while candidate hashing is paused always wins.
{
  let releaseHash!: () => void;
  let markHashStarted!: () => void;
  const hashStarted = new Promise<void>((resolveStarted) => { markHashStarted = resolveStarted; });
  const hashRelease = new Promise<void>((resolveRelease) => { releaseHash = resolveRelease; });
  const machine = new StickFigureCommandTransactionV1(
    await createStickCommandWorkspaceRoot(starter, "phase4-delayed-hash"),
    {candidateHasher: async (document) => {
      markHashStarted();
      await hashRelease;
      return digestCanonical(document);
    }},
  );
  const delayedPreview = machine.preview(envelope);
  await hashStarted;
  const manual = cloneCanonical(starter);
  manual.documentRevision += 1;
  const first = manual.layers[0].cells[0];
  if (first.cellType !== "keyframe") throw new Error("starter first cell must be a keyframe");
  first.poses[0].points[0].x += 3;
  await machine.publishManualDocument(manual);
  releaseHash();
  const preview = await delayedPreview;
  equal(preview.outcomeCode, "preview_ready", "delayed candidate hash can finish without publishing AI content");
  const beforeAttempt = machine.snapshot();
  const stale = await machine.beginApplyPublication(envelope);
  equal(resultOf(stale).error?.code, "stale_document", "final CAS rejects a candidate hashed across an authored edit");
  equal(stale.root.editorRoot.current.snapshot.document, manual, "delayed hash race preserves only the human-authored document");
  equal(immutableProjection(stale.root), immutableProjection(beforeAttempt), "delayed hash race never exposes the AI candidate");
}

// Authored edits and project replacement after publication preparation win.
{
  const machine = await newMachine();
  await machine.preview(envelope);
  const pending = await machine.beginApplyPublication(envelope);
  const operationId = pending.root.transactionState.active?.phase === "committing"
    ? pending.root.transactionState.active.operationId
    : "";
  const manual = cloneCanonical(starter);
  manual.documentRevision += 1;
  const first = manual.layers[0].cells[0];
  if (first.cellType !== "keyframe") throw new Error("starter first cell must be a keyframe");
  first.poses[0].points[1].x += 2;
  await machine.publishManualDocument(manual);
  const stale = await machine.completeApplyPublication(operationId, envelope);
  equal(resultOf(stale).error?.code, "stale_document", "authored edit invalidates a prepared AI publication");
  equal(stale.root.editorRoot.current.snapshot.document, manual, "prepared publication never overwrites authored content");
}
{
  const machine = await newMachine();
  await machine.preview(envelope);
  const pending = await machine.beginApplyPublication(envelope);
  const operationId = pending.root.transactionState.active?.phase === "committing"
    ? pending.root.transactionState.active.operationId
    : "";
  const replacement = cloneCanonical(starter);
  replacement.projectId = "00000000-0000-4000-8000-000000004099";
  await machine.replaceProject(replacement, "phase4-replacement-workspace");
  const switched = await machine.completeApplyPublication(operationId, envelope);
  equal(resultOf(switched).error?.code, "project_switched", "project replacement invalidates a prepared AI publication");
  equal(switched.root.editorRoot.current.snapshot.document, replacement, "prepared publication never leaks into the replacement project");
}

// A conflicting envelope remains rejected while the exact commit stays pending.
{
  const machine = await newMachine();
  await machine.preview(envelope);
  const pending = await machine.beginApplyPublication(envelope);
  const conflict = cloneCanonical(envelope);
  conflict.requestId = "00000000-0000-4000-8000-000000004098";
  const before = machine.snapshot();
  const rejected = await machine.redeliver(conflict);
  equal(resultOf(rejected).error?.code, "idempotency_conflict", "conflicting envelope rejects while committing");
  equal(rejected.root, before, "conflicting envelope cannot disturb the prepared exact commit");
  const exact = await machine.redeliver(envelope);
  equal(exact.outcomeCode, "commit_in_progress", "exact redelivery still observes the original prepared commit");
  equal(pending.root.transactionState.active?.phase, "committing", "original commit remains pending after conflict");
}

// A selection-only view change is preserved by Apply and does not invalidate it.
{
  const machine = await newMachine();
  await machine.preview(envelope);
  const selection = {activeLayerId: starter.layers[0].layerId, currentFrameIndex: 4, selectedTimelineIndex: 4};
  machine.updateViewState(selection);
  const result = await machine.apply(envelope);
  equal(result.outcomeCode, "applied", "selection-only change does not invalidate Apply");
  equal(result.root.editorRoot.current.snapshot.viewState, selection, "Apply preserves the latest selection-only view");
}

// Pending/failed canonical publication blocks Preview without exposing mutation.
for (const publication of ["pending", "failed"] as const) {
  const machine = await newMachine();
  machine.setDocumentPublication(publication);
  const before = machine.snapshot();
  const result = await machine.preview(envelope);
  equal(result.outcomeCode, "rejected", `${publication} publication blocks preview`);
  equal(resultOf(result).error?.code, "stale_document", `${publication} publication uses stable rejection`);
  equal(immutableProjection(result.root), immutableProjection(before), `${publication} rejection is a no-op`);
}

// Every injected failure is an exact canonical/history/storage/generation no-op.
for (const failurePoint of STICK_COMMAND_FAILURE_POINTS) {
  const machine = new StickFigureCommandTransactionV1(
    await createStickCommandWorkspaceRoot(starter, `phase4-failure-${failurePoint}`),
    {failurePoint},
  );
  const before = machine.snapshot();
  const result = await machine.apply(envelope);
  equal(result.outcomeCode, "failed", `${failurePoint} fails safely`);
  equal(resultOf(result).error?.code, "transaction_failed", `${failurePoint} uses stable error code`);
  equal(immutableProjection(result.root), immutableProjection(before), `${failurePoint} is an exact no-op`);
  equal(result.root.transactionState.active, null, `${failurePoint} clears its closure`);
}

// The mounted-project terminal ledger is FIFO-bounded at 128 entries.
{
  const machine = await newMachine();
  for (let index = 0; index < STICK_TERMINAL_LEDGER_LIMIT + 1; index += 1) {
    const item = cloneCanonical(envelope);
    const suffix = String(index + 1).padStart(12, "0");
    item.requestId = `10000000-0000-4000-8000-${suffix}`;
    item.transactionId = `20000000-0000-4000-8000-${suffix}`;
    await machine.preview(item);
    await machine.cancelPreview(item);
  }
  const root = machine.snapshot();
  equal(root.transactionState.terminalLedger.length, STICK_TERMINAL_LEDGER_LIMIT, "ledger retains exactly 128 terminals");
  equal(root.transactionState.terminalLedger[0].transactionId, "20000000-0000-4000-8000-000000000002", "129th terminal evicts oldest");
  equal(root.transactionState.terminalLedger.at(-1)?.transactionId, "20000000-0000-4000-8000-000000000129", "ledger retains newest terminal");
  equal(root.editorRoot.current.snapshot.document, starter, "ledger churn never mutates project");
}

equal(parseStickProjectDocument(starter).ok, true, "starter remains valid after frozen-input proof");
ok(canonicalJson(starter).length > 0, "canonical starter bytes remain readable");

console.log(`SPEC-0001 Phase 4 command transaction validation passed (${assertions} assertions).`);
