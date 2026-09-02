import {
  assertNoAiOnlyStickRepresentation,
  assertStickTopologyIsFixed,
  parseStickAnimationPlan,
  parseStickCommandInput,
  stickManualActionsFromCommand,
  type StickAiErrorCodeV1,
  type StickAiContractResult,
  type StickAnimationPlanV1,
  type StickCommandInputV1,
  type StickCommandResultV1,
} from "./stickFigureAiContract.ts";
import {
  cloneCanonical,
  deepFreeze,
  digestCanonical,
  applyStickManualActions,
  isSha256Digest,
  isStickManualWaveApplied,
  parseStickProjectDocument,
  projectStickAnimationContent,
  type StickEditorViewStateV1,
  type StickProjectDocumentV1,
  type StickTimelineCellV1,
} from "../stickfigure/stickProjectContract.ts";
import {
  commitCanonicalStickHistory,
  createCanonicalStickHistoryRoot,
  type CanonicalStickEditorHistoryRootV1,
} from "../stickfigure/stickProjectHistory.ts";
import {
  STICK_PHASE2_MOTION_MATERIALIZER,
  materializeParsedStickAnimationMotionPlan,
} from "./stickFigureMotionEngine.ts";

export const STICK_TERMINAL_LEDGER_LIMIT = 128;

export const STICK_COMMAND_FAILURE_POINTS = [
  "after_envelope_validation",
  "after_action_application",
  "after_candidate_validation",
  "during_candidate_hashing",
  "after_history_construction",
] as const;

export type StickCommandFailurePointV1 = typeof STICK_COMMAND_FAILURE_POINTS[number];

export type StickCommandTerminalLedgerEntryV1 = {
  transactionId: string;
  envelopeDigest: string;
  projectId: string;
  status: "applied" | "cancelled" | "rejected" | "failed";
  result: StickCommandResultV1;
};

export type StickCommandActiveTransactionV1 =
  | {
      phase: "requesting";
      requestId: string;
      transactionId: string;
      envelopeDigest: string;
      workspaceInstanceId: string;
      projectId: string;
      baseDocumentRevision: number;
      baseDocumentDigest: string;
      baseWorkspaceGeneration: number;
    }
  | {
      phase: "preview_ready";
      requestId: string;
      transactionId: string;
      envelopeDigest: string;
      workspaceInstanceId: string;
      projectId: string;
      baseDocumentRevision: number;
      baseDocumentDigest: string;
      baseWorkspaceGeneration: number;
      candidateDigest: string;
      previewResultDigest: string;
    }
  | {
      phase: "committing";
      operationId: string;
      requestId: string;
      transactionId: string;
      envelopeDigest: string;
      workspaceInstanceId: string;
      projectId: string;
      baseDocumentRevision: number;
      baseDocumentDigest: string;
      baseWorkspaceGeneration: number;
      candidateDigest: string;
      preparedTransactionPlanDigest: string;
    };

export type StickCommandWorkspaceRootV1 = {
  workspaceInstanceId: string;
  workspaceGeneration: number;
  documentPublication: "ready" | "pending" | "failed";
  editorRoot: CanonicalStickEditorHistoryRootV1;
  lastSavedDocumentDigest: string | null;
  transactionState: {
    active: StickCommandActiveTransactionV1 | null;
    terminalLedger: StickCommandTerminalLedgerEntryV1[];
  };
};

type PreparedPreviewV1 = {
  envelope: StickCommandInputV1;
  envelopeDigest: string;
  candidate: StickProjectDocumentV1;
  candidateDigest: string;
  previewResult: StickCommandResultV1;
};

type PreparedApplyV1 = PreparedPreviewV1 & {
  operationId: string;
  historyRoot: CanonicalStickEditorHistoryRootV1;
  preparedTransactionPlanDigest: string;
};

export type StickCommandOperationOutcomeV1 =
  | {
      root: StickCommandWorkspaceRootV1;
      result: null;
      outcomeCode: "requesting";
    }
  | {
      root: StickCommandWorkspaceRootV1;
      result: StickCommandResultV1;
      outcomeCode:
    | "preview_ready"
    | "preview_reused"
    | "apply_publication_pending"
    | "commit_in_progress"
    | "applied"
    | "duplicate"
    | "cancelled"
    | "aborted"
    | "rejected"
    | "failed";
    };

export type StickAnimationPlanMaterializerV1 = "phase-1-holds" | typeof STICK_PHASE2_MOTION_MATERIALIZER;

export type StickFigureCommandTransactionOptionsV1 = {
  failurePoint?: StickCommandFailurePointV1 | null;
  candidateHasher?: (document: StickProjectDocumentV1) => Promise<string>;
  animationPlanMaterializer?: StickAnimationPlanMaterializerV1;
};

const cloneRoot = (root: StickCommandWorkspaceRootV1): StickCommandWorkspaceRootV1 => cloneCanonical(root);

type StickPreviewSummaryV1 = NonNullable<StickCommandResultV1["previewSummary"]>;

const summarizeCandidate = (document: StickProjectDocumentV1): StickPreviewSummaryV1 => ({
  figureCount: 1,
  keyPoseCount: document.layers[0].cells.filter((cell) => cell.cellType === "keyframe" && cell.poses.length === 1).length,
  fps: document.fps as 12 | 24,
  timelineFrameCount: document.layers[0].cells.length,
  durationMs: Math.round(document.layers[0].cells.length / document.fps * 1000),
});

const makeResult = (
  envelope: StickCommandInputV1,
  envelopeDigest: string,
  status: StickCommandResultV1["status"],
  preStateDigest: string,
  candidateDigest: string | null,
  resultingDocumentRevision: number | null,
  error: StickCommandResultV1["error"] = null,
  summary: StickPreviewSummaryV1 | null = null,
): StickCommandResultV1 => ({
  kind: "stick-command-result",
  resultVersion: 1,
  requestId: envelope.requestId,
  transactionId: envelope.transactionId,
  projectId: envelope.projectId,
  envelopeDigest,
  status,
  previousDocumentRevision: envelope.baseDocumentRevision,
  resultingDocumentRevision,
  mutationCount: status === "applied" ? 1 : 0,
  preStateDigest,
  candidateDigest,
  previewSummary: candidateDigest === null ? null : summary,
  error,
});

const errorMessage = (code: StickAiErrorCodeV1) => {
  switch (code) {
    case "aborted": return "The request was stopped.";
    case "preview_cancelled": return "The preview was cancelled.";
    case "stale_document": return "The Stick project changed before this command could be applied.";
    case "project_switched": return "A different Stick project is now open.";
    case "idempotency_conflict": return "This transaction ID was already used for different content.";
    case "concurrency_conflict": return "Another Stick operation is already active.";
    default: return "The Stick command transaction failed safely.";
  }
};

const failureResult = async (
  root: StickCommandWorkspaceRootV1,
  envelope: StickCommandInputV1,
  status: "rejected" | "failed" | "cancelled",
  code: StickAiErrorCodeV1,
  suppliedEnvelopeDigest?: string,
): Promise<StickCommandResultV1> => makeResult(
  envelope,
  suppliedEnvelopeDigest ?? await digestCanonical(envelope),
  status,
  root.editorRoot.current.documentDigest,
  null,
  null,
  {code, message: errorMessage(code)},
);

const appendTerminal = (
  ledger: StickCommandTerminalLedgerEntryV1[],
  entry: StickCommandTerminalLedgerEntryV1,
) => [...ledger, cloneCanonical(entry)].slice(-STICK_TERMINAL_LEDGER_LIMIT);

const sameBase = (root: StickCommandWorkspaceRootV1, envelope: StickCommandInputV1) =>
  root.documentPublication === "ready" &&
  root.editorRoot.current.snapshot.document.projectId === envelope.projectId &&
  root.editorRoot.current.snapshot.document.documentRevision === envelope.baseDocumentRevision &&
  root.editorRoot.current.documentDigest === envelope.baseDocumentDigest;

const defaultView = (document: StickProjectDocumentV1): StickEditorViewStateV1 => ({
  activeLayerId: document.layers[0]?.layerId ?? "",
  currentFrameIndex: 0,
  selectedTimelineIndex: 0,
});

const deriveGeneralPlanHex = async (plan: StickAnimationPlanV1, slot: string) => {
  const bytes = new TextEncoder().encode([
    "diamond-animator/spec-0004-phase-1/v1",
    plan.projectId,
    plan.transactionId,
    slot,
  ].join("\0"));
  const digest = new Uint8Array(await globalThis.crypto.subtle.digest("SHA-256", bytes));
  return [...digest].map((byte) => byte.toString(16).padStart(2, "0")).join("");
};

const deriveGeneralPlanFrameId = async (plan: StickAnimationPlanV1, frameIndex: number) => {
  const hex = await deriveGeneralPlanHex(plan, `frame:${frameIndex}`);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
};

const deriveGeneralPlanPoseId = async (plan: StickAnimationPlanV1, poseName: string, frameIndex: number) =>
  `pose_${(await deriveGeneralPlanHex(plan, `pose:${poseName}:${frameIndex}`)).slice(0, 32)}`;

const materializeParsedStickAnimationPlan = async (
  plan: StickAnimationPlanV1,
  starter: StickProjectDocumentV1,
): Promise<StickAiContractResult<StickProjectDocumentV1>> => {
  const timing = plan.commands[0];
  if (timing.type !== "set_timing") {
    return {ok: false, error: {code: "unsupported_command", path: "$plan.commands[0]", message: "Timing is missing."}};
  }
  const frameIds = await Promise.all(Array.from({length: timing.totalFrameCount}, (_, frameIndex) =>
    starter.layers[0].cells[frameIndex]?.frameId ?? deriveGeneralPlanFrameId(plan, frameIndex),
  ));
  const cells: StickTimelineCellV1[] = frameIds.map((frameId, index) => ({frameId, index, cellType: "empty"}));
  const ownerFrameIdByPoseName = new Map<string, string>();

  for (const command of plan.commands) {
    switch (command.type) {
      case "set_timing":
        break;
      case "create_key_pose": {
        const poseId = await deriveGeneralPlanPoseId(plan, command.poseName, command.frameIndex);
        cells[command.frameIndex] = {
          frameId: frameIds[command.frameIndex],
          index: command.frameIndex,
          cellType: "keyframe",
          poses: [{
            poseId,
            figureId: command.targetFigureId,
            rigId: command.targetRigId,
            points: command.joints.map((joint, jointIndex) => ({
              jointId: starter.rigs[0].joints[jointIndex].jointId,
              x: joint.x,
              y: joint.y,
            })),
          }],
        };
        ownerFrameIdByPoseName.set(command.poseName, frameIds[command.frameIndex]);
        break;
      }
      case "hold_pose": {
        const ownerFrameId = ownerFrameIdByPoseName.get(command.poseName);
        if (!ownerFrameId) {
          return {ok: false, error: {code: "unsupported_command", path: "$plan.commands", message: "Hold owner is missing."}};
        }
        for (let frameIndex = command.startFrameIndex; frameIndex <= command.endFrameIndex; frameIndex += 1) {
          cells[frameIndex] = {frameId: frameIds[frameIndex], index: frameIndex, cellType: "hold", ownerFrameId};
        }
        break;
      }
      case "finish":
        break;
    }
  }

  const candidate = {
    ...cloneCanonical(starter),
    documentRevision: starter.documentRevision + 1,
    fps: timing.fps,
    layers: [{...cloneCanonical(starter.layers[0]), cells}],
  };
  const parsed = parseStickProjectDocument(candidate);
  if (!parsed.ok) return {ok: false, error: parsed.error};
  const projection = projectStickAnimationContent(parsed.value);
  if (!projection.ok || !assertStickTopologyIsFixed(parsed.value) || !assertNoAiOnlyStickRepresentation(parsed.value)) {
    return {ok: false, error: {code: "transaction_failed", path: "$document", message: "The plan did not materialize safe editable Stick content."}};
  }
  return {ok: true, value: parsed.value};
};

/** Materializes every Phase 1 fixture with the same four-command executor. */
export const materializeStickAnimationPlan = async (
  value: unknown,
  starter: StickProjectDocumentV1,
): Promise<StickAiContractResult<StickProjectDocumentV1>> => {
  const parsed = await parseStickAnimationPlan(value, starter);
  return parsed.ok ? materializeParsedStickAnimationPlan(parsed.value, starter) : parsed;
};

export const createStickCommandWorkspaceRoot = async (
  document: StickProjectDocumentV1,
  workspaceInstanceId: string,
  workspaceGeneration = 0,
  viewState: StickEditorViewStateV1 = defaultView(document),
): Promise<StickCommandWorkspaceRootV1> => {
  const parsed = parseStickProjectDocument(document);
  if (!parsed.ok) throw new Error(`Invalid initial Stick document: ${parsed.error.code}`);
  return {
    workspaceInstanceId,
    workspaceGeneration,
    documentPublication: "ready",
    editorRoot: await createCanonicalStickHistoryRoot({document: parsed.value, viewState}),
    lastSavedDocumentDigest: null,
    transactionState: {active: null, terminalLedger: []},
  };
};

export class StickFigureCommandTransactionV1 {
  #root: StickCommandWorkspaceRootV1;
  #previews = new Map<string, PreparedPreviewV1>();
  #applies = new Map<string, PreparedApplyV1>();
  #invalidatedApplies = new Map<string, PreparedApplyV1>();
  #failurePoint: StickCommandFailurePointV1 | null;
  #candidateHasher: (document: StickProjectDocumentV1) => Promise<string>;
  #animationPlanMaterializer: StickAnimationPlanMaterializerV1;
  #operationCounter = 0;

  constructor(root: StickCommandWorkspaceRootV1, options: StickFigureCommandTransactionOptionsV1 = {}) {
    this.#root = cloneRoot(root);
    this.#failurePoint = options.failurePoint ?? null;
    this.#candidateHasher = options.candidateHasher ?? digestCanonical;
    const materializer = options.animationPlanMaterializer ?? "phase-1-holds";
    if (materializer !== "phase-1-holds" && materializer !== STICK_PHASE2_MOTION_MATERIALIZER) {
      throw new TypeError("Unknown Stick animation-plan materializer.");
    }
    this.#animationPlanMaterializer = materializer;
  }

  snapshot() { return cloneRoot(this.#root); }

  /** Read-only candidate access used by the isolated Phase 1 proof/review harness. */
  readPreviewCandidate(transactionId?: string) {
    const active = this.#root.transactionState.active;
    const resolvedTransactionId = transactionId ?? active?.transactionId;
    if (!resolvedTransactionId || active?.phase !== "preview_ready" || active.transactionId !== resolvedTransactionId) return null;
    const preview = this.#previews.get(resolvedTransactionId);
    return preview ? cloneCanonical(preview.candidate) : null;
  }

  /** Creates an isolated working copy so a caller can prepare one composite publication before making it authoritative. */
  fork() {
    const next = new StickFigureCommandTransactionV1(this.#root, {
      failurePoint: this.#failurePoint,
      candidateHasher: this.#candidateHasher,
      animationPlanMaterializer: this.#animationPlanMaterializer,
    });
    next.#previews = new Map([...this.#previews].map(([key, value]) => [key, cloneCanonical(value)]));
    next.#applies = new Map([...this.#applies].map(([key, value]) => [key, cloneCanonical(value)]));
    next.#invalidatedApplies = new Map([...this.#invalidatedApplies].map(([key, value]) => [key, cloneCanonical(value)]));
    next.#operationCounter = this.#operationCounter;
    return next;
  }

  armFailure(point: StickCommandFailurePointV1 | null) { this.#failurePoint = point; }

  setDocumentPublication(status: StickCommandWorkspaceRootV1["documentPublication"]) {
    this.#root.documentPublication = status;
    return this.snapshot();
  }

  updateViewState(viewState: StickEditorViewStateV1) {
    this.#root.editorRoot.current.snapshot.viewState = cloneCanonical(viewState);
    return this.snapshot();
  }

  #consumeFailure(point: StickCommandFailurePointV1) {
    if (this.#failurePoint !== point) return false;
    this.#failurePoint = null;
    return true;
  }

  async #terminalOrConflict(envelope: StickCommandInputV1, envelopeDigest: string) {
    const terminal = this.#root.transactionState.terminalLedger.find((entry) => entry.transactionId === envelope.transactionId);
    if (!terminal) return null;
    if (terminal.envelopeDigest !== envelopeDigest) {
      const result = await failureResult(this.#root, envelope, "rejected", "idempotency_conflict", envelopeDigest);
      return {root: this.snapshot(), result, outcomeCode: "rejected" as const};
    }
    if (terminal.status === "applied") {
      const result = {...cloneCanonical(terminal.result), status: "duplicate" as const, mutationCount: 0};
      return {root: this.snapshot(), result, outcomeCode: "duplicate" as const};
    }
    return {
      root: this.snapshot(),
      result: cloneCanonical(terminal.result),
      outcomeCode: terminal.status === "cancelled"
        ? "cancelled" as const
        : terminal.status === "rejected"
          ? "rejected" as const
          : "failed" as const,
    };
  }

  async #activeConflict(envelope: StickCommandInputV1, envelopeDigest: string) {
    const active = this.#root.transactionState.active;
    if (!active || active.transactionId !== envelope.transactionId || active.envelopeDigest === envelopeDigest) return null;
    const result = await failureResult(this.#root, envelope, "rejected", "idempotency_conflict", envelopeDigest);
    return {root: this.snapshot(), result, outcomeCode: "rejected" as const};
  }

  async #rejectUnseen(
    envelope: StickCommandInputV1,
    envelopeDigest: string,
    code: StickAiErrorCodeV1,
    remember = true,
  ): Promise<StickCommandOperationOutcomeV1> {
    const result = await failureResult(this.#root, envelope, "rejected", code, envelopeDigest);
    if (remember) {
      this.#root.transactionState.terminalLedger = appendTerminal(this.#root.transactionState.terminalLedger, {
        transactionId: envelope.transactionId,
        envelopeDigest,
        projectId: envelope.projectId,
        status: "rejected",
        result,
      });
    }
    return {root: this.snapshot(), result, outcomeCode: "rejected"};
  }

  async beginRequest(envelope: StickCommandInputV1): Promise<StickCommandOperationOutcomeV1> {
    const envelopeDigest = await digestCanonical(envelope);
    const terminal = await this.#terminalOrConflict(envelope, envelopeDigest);
    if (terminal) return terminal;
    const activeConflict = await this.#activeConflict(envelope, envelopeDigest);
    if (activeConflict) return activeConflict;
    const active = this.#root.transactionState.active;
    if (active) {
      if (active.transactionId === envelope.transactionId && active.envelopeDigest === envelopeDigest) {
        if (active.phase === "preview_ready") return this.redeliver(envelope);
        if (active.phase === "committing") return this.redeliver(envelope);
        return {root: this.snapshot(), result: null, outcomeCode: "requesting"};
      }
      return this.#rejectUnseen(envelope, envelopeDigest, "concurrency_conflict");
    }
    if (!sameBase(this.#root, envelope)) {
      const code = this.#root.editorRoot.current.snapshot.document.projectId === envelope.projectId ? "stale_document" : "project_switched";
      return this.#rejectUnseen(envelope, envelopeDigest, code, code !== "project_switched");
    }
    this.#root.transactionState.active = {
      phase: "requesting",
      requestId: envelope.requestId,
      transactionId: envelope.transactionId,
      envelopeDigest,
      workspaceInstanceId: this.#root.workspaceInstanceId,
      projectId: envelope.projectId,
      baseDocumentRevision: envelope.baseDocumentRevision,
      baseDocumentDigest: envelope.baseDocumentDigest,
      baseWorkspaceGeneration: this.#root.workspaceGeneration,
    };
    return {root: this.snapshot(), result: null, outcomeCode: "requesting"};
  }

  async preview(envelope: StickCommandInputV1): Promise<StickCommandOperationOutcomeV1> {
    const envelopeDigest = await digestCanonical(envelope);
    const terminal = await this.#terminalOrConflict(envelope, envelopeDigest);
    if (terminal) return terminal;
    const activeConflict = await this.#activeConflict(envelope, envelopeDigest);
    if (activeConflict) return activeConflict;
    const active = this.#root.transactionState.active;
    if (active?.transactionId === envelope.transactionId && active.envelopeDigest === envelopeDigest && active.phase === "preview_ready") {
      const preview = this.#previews.get(envelope.transactionId);
      if (preview) return {root: this.snapshot(), result: cloneCanonical(preview.previewResult), outcomeCode: "preview_reused"};
    }
    if (!active) {
      const begun = await this.beginRequest(envelope);
      if (begun.outcomeCode !== "requesting") return begun;
    }
    const requesting = this.#root.transactionState.active;
    if (!requesting || requesting.phase !== "requesting" || requesting.transactionId !== envelope.transactionId || requesting.envelopeDigest !== envelopeDigest) {
      return this.#rejectUnseen(envelope, envelopeDigest, "concurrency_conflict");
    }
    const parsed = await parseStickCommandInput(envelope, this.#root.editorRoot.current.snapshot.document);
    if (!parsed.ok || this.#consumeFailure("after_envelope_validation")) {
      return this.#failActive(envelope, envelopeDigest, parsed.ok ? "transaction_failed" : parsed.error.code as StickAiErrorCodeV1);
    }
    const candidateResult = parsed.value.kind === "stick-animation-plan"
      ? this.#animationPlanMaterializer === STICK_PHASE2_MOTION_MATERIALIZER
        ? await materializeParsedStickAnimationMotionPlan(parsed.value, this.#root.editorRoot.current.snapshot.document)
        : await materializeParsedStickAnimationPlan(parsed.value, this.#root.editorRoot.current.snapshot.document)
      : applyStickManualActions(
          this.#root.editorRoot.current.snapshot.document,
          stickManualActionsFromCommand(parsed.value.commands[0]),
          "single",
          "allow-derived",
        );
    if (!candidateResult.ok || this.#consumeFailure("after_action_application")) {
      return this.#failActive(envelope, envelopeDigest, candidateResult.ok ? "transaction_failed" : candidateResult.error.code as StickAiErrorCodeV1);
    }
    const candidateParsed = parseStickProjectDocument(candidateResult.value);
    const candidateMatchesInput = candidateParsed.ok && (parsed.value.kind === "stick-animation-plan"
      ? projectStickAnimationContent(candidateParsed.value).ok && assertStickTopologyIsFixed(candidateParsed.value) && assertNoAiOnlyStickRepresentation(candidateParsed.value)
      : isStickManualWaveApplied(candidateParsed.value, this.#root.editorRoot.current.snapshot.document));
    if (!candidateParsed.ok || !candidateMatchesInput ||
      this.#consumeFailure("after_candidate_validation")) {
      return this.#failActive(envelope, envelopeDigest, "transaction_failed");
    }
    if (this.#consumeFailure("during_candidate_hashing")) return this.#failActive(envelope, envelopeDigest, "transaction_failed");
    const candidateDigest = await this.#candidateHasher(candidateParsed.value);
    if (!isSha256Digest(candidateDigest)) return this.#failActive(envelope, envelopeDigest, "transaction_failed");
    const result = makeResult(
      envelope,
      envelopeDigest,
      "previewed",
      this.#root.editorRoot.current.documentDigest,
      candidateDigest,
      null,
      null,
      summarizeCandidate(candidateParsed.value),
    );
    const previewResultDigest = await digestCanonical(result);
    this.#previews.set(envelope.transactionId, deepFreeze({
      envelope: cloneCanonical(envelope), envelopeDigest, candidate: candidateParsed.value, candidateDigest, previewResult: result,
    }));
    this.#root.transactionState.active = {
      phase: "preview_ready",
      requestId: envelope.requestId,
      transactionId: envelope.transactionId,
      envelopeDigest,
      workspaceInstanceId: requesting.workspaceInstanceId,
      projectId: envelope.projectId,
      baseDocumentRevision: envelope.baseDocumentRevision,
      baseDocumentDigest: envelope.baseDocumentDigest,
      baseWorkspaceGeneration: requesting.baseWorkspaceGeneration,
      candidateDigest,
      previewResultDigest,
    };
    return {root: this.snapshot(), result: cloneCanonical(result), outcomeCode: "preview_ready"};
  }

  async #failActive(envelope: StickCommandInputV1, envelopeDigest: string, code: StickAiErrorCodeV1): Promise<StickCommandOperationOutcomeV1> {
    const result = await failureResult(this.#root, envelope, "failed", code, envelopeDigest);
    this.#previews.delete(envelope.transactionId);
    this.#root.transactionState.active = null;
    this.#root.transactionState.terminalLedger = appendTerminal(this.#root.transactionState.terminalLedger, {
      transactionId: envelope.transactionId, envelopeDigest, projectId: envelope.projectId, status: "failed", result,
    });
    return {root: this.snapshot(), result, outcomeCode: "failed"};
  }

  /** Consumes the active transaction as one stable terminal rejection without publishing its candidate. */
  async rejectActive(
    envelope: StickCommandInputV1,
    code: Extract<StickAiErrorCodeV1, "stale_document" | "project_switched" | "concurrency_conflict">,
  ): Promise<StickCommandOperationOutcomeV1> {
    const envelopeDigest = await digestCanonical(envelope);
    const terminal = await this.#terminalOrConflict(envelope, envelopeDigest);
    if (terminal) return terminal;
    const activeConflict = await this.#activeConflict(envelope, envelopeDigest);
    if (activeConflict) return activeConflict;
    const active = this.#root.transactionState.active;
    if (!active || active.transactionId !== envelope.transactionId || active.envelopeDigest !== envelopeDigest) {
      return this.#rejectUnseen(envelope, envelopeDigest, code, code !== "project_switched");
    }
    const result = await failureResult(this.#root, envelope, "rejected", code, envelopeDigest);
    this.#previews.delete(envelope.transactionId);
    if (active.phase === "committing") {
      this.#applies.delete(active.operationId);
      this.#invalidatedApplies.delete(active.operationId);
    }
    this.#root.transactionState.active = null;
    if (code !== "project_switched") {
      this.#root.transactionState.terminalLedger = appendTerminal(this.#root.transactionState.terminalLedger, {
        transactionId: envelope.transactionId,
        envelopeDigest,
        projectId: envelope.projectId,
        status: "rejected",
        result,
      });
    }
    return {root: this.snapshot(), result, outcomeCode: "rejected"};
  }

  async cancelPreview(envelope: StickCommandInputV1): Promise<StickCommandOperationOutcomeV1> {
    const envelopeDigest = await digestCanonical(envelope);
    const terminal = await this.#terminalOrConflict(envelope, envelopeDigest);
    if (terminal) return terminal;
    const activeConflict = await this.#activeConflict(envelope, envelopeDigest);
    if (activeConflict) return activeConflict;
    const active = this.#root.transactionState.active;
    if (!active || active.transactionId !== envelope.transactionId || active.envelopeDigest !== envelopeDigest || active.phase === "committing") {
      return this.#rejectUnseen(envelope, envelopeDigest, "stale_document");
    }
    const result = await failureResult(this.#root, envelope, "cancelled", "preview_cancelled", envelopeDigest);
    this.#previews.delete(envelope.transactionId);
    this.#root.transactionState.active = null;
    this.#root.transactionState.terminalLedger = appendTerminal(this.#root.transactionState.terminalLedger, {
      transactionId: envelope.transactionId, envelopeDigest, projectId: envelope.projectId, status: "cancelled", result,
    });
    return {root: this.snapshot(), result, outcomeCode: "cancelled"};
  }

  async abortRequest(envelope: StickCommandInputV1): Promise<StickCommandOperationOutcomeV1> {
    const envelopeDigest = await digestCanonical(envelope);
    const terminal = await this.#terminalOrConflict(envelope, envelopeDigest);
    if (terminal) return terminal;
    const activeConflict = await this.#activeConflict(envelope, envelopeDigest);
    if (activeConflict) return activeConflict;
    const active = this.#root.transactionState.active;
    if (!active || active.transactionId !== envelope.transactionId || active.envelopeDigest !== envelopeDigest || active.phase === "committing") {
      return this.#rejectUnseen(envelope, envelopeDigest, "stale_document");
    }
    const result = await failureResult(this.#root, envelope, "failed", "aborted", envelopeDigest);
    this.#previews.delete(envelope.transactionId);
    this.#root.transactionState.active = null;
    this.#root.transactionState.terminalLedger = appendTerminal(this.#root.transactionState.terminalLedger, {
      transactionId: envelope.transactionId, envelopeDigest, projectId: envelope.projectId, status: "failed", result,
    });
    return {root: this.snapshot(), result, outcomeCode: "aborted"};
  }

  async beginApplyPublication(envelope: StickCommandInputV1): Promise<StickCommandOperationOutcomeV1> {
    const envelopeDigest = await digestCanonical(envelope);
    const terminal = await this.#terminalOrConflict(envelope, envelopeDigest);
    if (terminal) return terminal;
    const activeConflict = await this.#activeConflict(envelope, envelopeDigest);
    if (activeConflict) return activeConflict;
    const active = this.#root.transactionState.active;
    const preview = this.#previews.get(envelope.transactionId);
    if (!active || active.phase !== "preview_ready" || !preview || active.envelopeDigest !== envelopeDigest) {
      return this.#rejectUnseen(envelope, envelopeDigest, "stale_document");
    }
    if (!sameBase(this.#root, envelope) || this.#root.workspaceInstanceId !== active.workspaceInstanceId || this.#root.workspaceGeneration !== active.baseWorkspaceGeneration) {
      const code = this.#root.workspaceInstanceId === active.workspaceInstanceId ? "stale_document" : "project_switched";
      const result = await failureResult(this.#root, envelope, "rejected", code, envelopeDigest);
      this.#previews.delete(envelope.transactionId);
      this.#root.transactionState.active = null;
      if (code !== "project_switched") {
        this.#root.transactionState.terminalLedger = appendTerminal(this.#root.transactionState.terminalLedger, {
          transactionId: envelope.transactionId,
          envelopeDigest,
          projectId: envelope.projectId,
          status: "rejected",
          result,
        });
      }
      return {root: this.snapshot(), result, outcomeCode: "rejected"};
    }
    const historyRoot = await commitCanonicalStickHistory(this.#root.editorRoot, {
      document: preview.candidate,
      viewState: cloneCanonical(this.#root.editorRoot.current.snapshot.viewState),
    });
    if (this.#consumeFailure("after_history_construction")) return this.#failActive(envelope, envelopeDigest, "transaction_failed");
    const operationId = `phase4-apply-${++this.#operationCounter}`;
    const preparedTransactionPlanDigest = await digestCanonical({
      operationId, envelopeDigest, candidateDigest: preview.candidateDigest,
      currentDigest: historyRoot.current.documentDigest, undoDepth: historyRoot.undo.length, redoDepth: historyRoot.redo.length,
    });
    const prepared = deepFreeze({...preview, operationId, historyRoot, preparedTransactionPlanDigest});
    this.#applies.set(operationId, prepared);
    this.#root.transactionState.active = {
      phase: "committing",
      operationId,
      requestId: envelope.requestId,
      transactionId: envelope.transactionId,
      envelopeDigest,
      workspaceInstanceId: active.workspaceInstanceId,
      projectId: envelope.projectId,
      baseDocumentRevision: envelope.baseDocumentRevision,
      baseDocumentDigest: envelope.baseDocumentDigest,
      baseWorkspaceGeneration: active.baseWorkspaceGeneration,
      candidateDigest: preview.candidateDigest,
      preparedTransactionPlanDigest,
    };
    return {root: this.snapshot(), result: cloneCanonical(preview.previewResult), outcomeCode: "apply_publication_pending"};
  }

  async completeApplyPublication(
    operationId: string,
    envelope: StickCommandInputV1,
  ): Promise<StickCommandOperationOutcomeV1> {
    const active = this.#root.transactionState.active;
    const prepared = this.#applies.get(operationId) ?? this.#invalidatedApplies.get(operationId);
    if (!active || active.phase !== "committing" || active.operationId !== operationId || !prepared ||
      active.preparedTransactionPlanDigest !== prepared.preparedTransactionPlanDigest ||
      this.#root.workspaceInstanceId !== active.workspaceInstanceId || this.#root.workspaceGeneration !== active.baseWorkspaceGeneration ||
      this.#root.editorRoot.current.documentDigest !== active.baseDocumentDigest || this.#root.documentPublication !== "ready") {
      if (!prepared) return this.#rejectUnseen(envelope, await digestCanonical(envelope), "stale_document", false);
      const code: StickAiErrorCodeV1 = this.#root.workspaceInstanceId !== active?.workspaceInstanceId
        ? "project_switched"
        : "stale_document";
      const result = await failureResult(this.#root, prepared.envelope, "rejected", code, prepared.envelopeDigest);
      this.#previews.delete(prepared.envelope.transactionId);
      this.#applies.delete(operationId);
      this.#invalidatedApplies.delete(operationId);
      this.#root.transactionState.active = null;
      if (this.#root.editorRoot.current.snapshot.document.projectId === prepared.envelope.projectId) {
        this.#root.transactionState.terminalLedger = appendTerminal(this.#root.transactionState.terminalLedger, {
          transactionId: prepared.envelope.transactionId,
          envelopeDigest: prepared.envelopeDigest,
          projectId: prepared.envelope.projectId,
          status: "rejected",
          result,
        });
      }
      return {root: this.snapshot(), result, outcomeCode: "rejected"};
    }
    const result = makeResult(
      prepared.envelope,
      prepared.envelopeDigest,
      "applied",
      active.baseDocumentDigest,
      prepared.candidateDigest,
      prepared.historyRoot.current.snapshot.document.documentRevision,
      null,
      prepared.previewResult.previewSummary,
    );
    const terminal: StickCommandTerminalLedgerEntryV1 = {
      transactionId: prepared.envelope.transactionId,
      envelopeDigest: prepared.envelopeDigest,
      projectId: prepared.envelope.projectId,
      status: "applied",
      result,
    };
    this.#root = {
      ...this.#root,
      workspaceGeneration: this.#root.workspaceGeneration + 1,
      editorRoot: cloneCanonical(prepared.historyRoot),
      transactionState: {
        active: null,
        terminalLedger: appendTerminal(this.#root.transactionState.terminalLedger, terminal),
      },
    };
    this.#previews.delete(prepared.envelope.transactionId);
    this.#applies.delete(operationId);
    return {root: this.snapshot(), result, outcomeCode: "applied"};
  }

  async apply(envelope: StickCommandInputV1): Promise<StickCommandOperationOutcomeV1> {
    const preview = await this.preview(envelope);
    if (preview.outcomeCode !== "preview_ready" && preview.outcomeCode !== "preview_reused") return preview;
    const pending = await this.beginApplyPublication(envelope);
    if (pending.outcomeCode !== "apply_publication_pending") return pending;
    const active = this.#root.transactionState.active;
    if (!active || active.phase !== "committing") {
      return this.#rejectUnseen(envelope, await digestCanonical(envelope), "stale_document", false);
    }
    return this.completeApplyPublication(active.operationId, envelope);
  }

  async redeliver(envelope: StickCommandInputV1): Promise<StickCommandOperationOutcomeV1> {
    const envelopeDigest = await digestCanonical(envelope);
    const terminal = await this.#terminalOrConflict(envelope, envelopeDigest);
    if (terminal) return terminal;
    const activeConflict = await this.#activeConflict(envelope, envelopeDigest);
    if (activeConflict) return activeConflict;
    const active = this.#root.transactionState.active;
    if (active?.transactionId === envelope.transactionId && active.envelopeDigest === envelopeDigest) {
      if (active.phase === "preview_ready") {
        const preview = this.#previews.get(envelope.transactionId);
        if (preview) return {root: this.snapshot(), result: cloneCanonical(preview.previewResult), outcomeCode: "preview_reused"};
      }
      if (active.phase === "committing") {
        const preview = this.#previews.get(envelope.transactionId);
        if (preview) return {root: this.snapshot(), result: cloneCanonical(preview.previewResult), outcomeCode: "commit_in_progress"};
      }
    }
    return this.#rejectUnseen(envelope, envelopeDigest, "stale_document");
  }

  async replaceProject(document: StickProjectDocumentV1, workspaceInstanceId: string) {
    const parsed = parseStickProjectDocument(document);
    if (!parsed.ok || !isSha256Digest(await digestCanonical(parsed.value))) throw new Error("Invalid replacement Stick project.");
    this.#previews.clear();
    for (const [operationId, prepared] of this.#applies) this.#invalidatedApplies.set(operationId, prepared);
    this.#applies.clear();
    this.#root = await createStickCommandWorkspaceRoot(parsed.value, workspaceInstanceId, this.#root.workspaceGeneration + 1);
    return this.snapshot();
  }

  /** Publishes an ordinary human-authored document through the same history root. */
  async publishManualDocument(document: StickProjectDocumentV1) {
    const parsed = parseStickProjectDocument(document);
    if (!parsed.ok) throw new Error(`Invalid manual Stick publication: ${parsed.error.code}`);
    if (parsed.value.projectId !== this.#root.editorRoot.current.snapshot.document.projectId) {
      throw new Error("Manual publication belongs to a different Stick project.");
    }
    this.#root = {
      ...this.#root,
      workspaceGeneration: this.#root.workspaceGeneration + 1,
      editorRoot: await commitCanonicalStickHistory(this.#root.editorRoot, {
        document: parsed.value,
        viewState: cloneCanonical(this.#root.editorRoot.current.snapshot.viewState),
      }),
    };
    return this.snapshot();
  }
}

export const previewStickCommandBatch = async (
  preState: StickCommandWorkspaceRootV1,
  envelope: StickCommandInputV1,
  options: StickFigureCommandTransactionOptionsV1 = {},
) => new StickFigureCommandTransactionV1(preState, options).preview(envelope);

export const applyStickCommandBatch = async (
  preState: StickCommandWorkspaceRootV1,
  envelope: StickCommandInputV1,
  options: StickFigureCommandTransactionOptionsV1 = {},
) => new StickFigureCommandTransactionV1(preState, options).apply(envelope);
