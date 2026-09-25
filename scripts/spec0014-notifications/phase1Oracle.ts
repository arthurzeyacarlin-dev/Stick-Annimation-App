import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { digest, sealSession, type Session, type Turn } from "../../src/lib/assistant/assistantContracts.ts";
import {
  ACTIVE_NOTIFICATION_EVENT_TYPES_V1,
  DORMANT_NOTIFICATION_EVENT_TYPES_V1,
  NotificationContractError,
  createNotificationEnvelopeFromTerminalV1,
  notificationCopyForV1,
  validateNotificationEnvelopeV1,
  type DiamondNotificationEnvelopeV1,
  type ExportNotificationTerminalReceiptV1,
  type NotificationTerminalReceiptV1,
  type TerraLedgerTerminalV1,
} from "../../src/lib/notifications/notificationContracts.ts";
import {
  createNotificationNavigationIntentV1,
  dispatchNotificationTargetV1,
  registerNotificationNavigationHandlerV1,
} from "../../src/lib/notifications/notificationNavigation.ts";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(scriptDirectory, "../..");
const evidencePath = resolve(repositoryRoot, "output/spec0014/phase1/oracle.json");
const FIXED_TIME = 1_780_000_000_000;
const HEX_A = "a".repeat(64);
const HEX_B = "b".repeat(64);
let assertions = 0;
const check = (condition: unknown, message: string) => { assertions += 1; assert.ok(condition, message); };
const equal = (actual: unknown, expected: unknown, message: string) => { assertions += 1; assert.deepEqual(actual, expected, message); };
const rejects = async (operation: () => Promise<unknown>, code?: string) => {
  assertions += 1;
  await assert.rejects(operation, error => error instanceof NotificationContractError && (!code || error.code === code));
};

const assistantUsage = {
  inputTokens: 10,
  outputTokens: 10,
  totalTokens: 20,
  estimatedCostUsd: .00014,
  priceDate: "2026-09-22" as const,
  responseId: "response_0001",
  latencyMs: 200,
  model: "gpt-5.6-terra" as const,
  reasoning: "low" as const,
  toolCalls: 0,
};

async function assistantSession(outcome: "done" | "failed" | "interrupted" | "cancelled", suffix: string, at = FIXED_TIME) {
  const turnId = `turn_${suffix}_0001`;
  const jobId = `job_${suffix}_00001`;
  const user = { id: `message_${suffix}_user`, turnId, role: "user" as const, text: "How do I animate this?", at: at - 500 };
  const turn: Turn = {
    id: turnId,
    jobId,
    status: outcome,
    reasoning: "low",
    at: at - 500,
    acceptedAt: at - 400,
    endedAt: at,
    contextIds: [],
    error: outcome === "done" ? null : outcome === "cancelled" ? "Cancelled by user." : outcome === "interrupted" ? "The server interrupted this reply." : "The reply failed.",
    usage: outcome === "done" ? assistantUsage : null,
  };
  const messages: Session["messages"] = [user];
  if (outcome === "done") messages.push({ id: `message_${suffix}_answer`, turnId, role: "assistant", text: "Use clear key poses.", at });
  const unsigned: Session = {
    schema: "diamond-assistant-session/v1",
    id: `session_${suffix}_0001`,
    title: "Animation help",
    titleSource: "automatic",
    manualTitleRevision: 0,
    createdAt: at - 1_000,
    updatedAt: at,
    reasoning: "low",
    revision: 1,
    digest: HEX_A,
    messages,
    turns: [turn],
  };
  return sealSession(unsigned);
}

async function assistantReceipt(outcome: "done" | "failed" | "interrupted" | "cancelled", suffix: string) {
  const session = await assistantSession(outcome, suffix);
  const turn = session.turns[0];
  return { schema: "assistant-notification-terminal/v1" as const, session, sessionId: session.id, turnId: turn.id, jobId: turn.jobId, outcome, occurredAt: turn.endedAt! };
}

async function terraReceipt(outcome: "done" | "failed" | "cancelled", suffix: string) {
  const occurredAt = FIXED_TIME + Number(suffix.slice(-1)) * 10;
  const snapshot = {
    version: 1 as const,
    jobId: `terra_job_${suffix}`,
    turnId: `terra_turn_${suffix}`,
    projectId: `project_${suffix}_0001`,
    projectGeneration: 4,
    reasoningLevel: "low" as const,
    intent: outcome === "done" ? "conversation" as const : null,
    status: outcome,
    lastSequence: 2,
    createdAt: new Date(occurredAt - 1_000).toISOString(),
    updatedAt: new Date(occurredAt).toISOString(),
    completedAt: new Date(occurredAt).toISOString(),
    telemetry: { model: "gpt-5.6-terra" as const, effort: "low" as const, outcome: outcome === "done" ? "succeeded" as const : outcome, latencyMs: 100, promptDigest: HEX_A, usage: { inputTokens: 4, outputTokens: 4, totalTokens: 8, estimatedCostUsd: .0001 } },
    events: [
      { sequence: 1, status: "thinking" as const, createdAt: new Date(occurredAt - 1_000).toISOString() },
      outcome === "done"
        ? { sequence: 2, status: "done" as const, createdAt: new Date(occurredAt).toISOString(), reply: { intent: "conversation" as const, reply: "Use stronger silhouettes.", focusedQuestion: null, planSummary: null } }
        : { sequence: 2, status: outcome, createdAt: new Date(occurredAt).toISOString(), errorCode: outcome === "cancelled" ? "cancelled" : "provider_failed", errorMessage: outcome === "cancelled" ? "Cancelled." : "Provider failed." },
    ],
  };
  const ledgerBody = { schema: "terra-ledger-terminal/v1" as const, projectId: snapshot.projectId, projectGeneration: snapshot.projectGeneration, jobId: snapshot.jobId, terminalSequence: snapshot.lastSequence, outcome, messageId: `ledger_message_${suffix}`, committedAt: occurredAt };
  const ledgerTerminal: TerraLedgerTerminalV1 = { ...ledgerBody, digest: await digest(ledgerBody) };
  return { schema: "terra-notification-terminal/v1" as const, snapshot, workspaceIdentity: `workspace_${suffix}_0001`, projectId: snapshot.projectId, projectGeneration: snapshot.projectGeneration, projectTitle: `Proof Project ${suffix}`, ledgerTerminal, outcome, occurredAt };
}

const exportSelection = {
  schemaVersion: "export-selection/v1" as const,
  selectionId: "selection_export_0001",
  projectId: "project_export_0001",
  projectDigest: HEX_B,
  title: "Proof Export",
  savedUpdatedAt: new Date(FIXED_TIME - 5_000).toISOString(),
  fps: 30,
  authoredFrameCount: 30,
  durationMs: 1_000,
};
const exportRequest = {
  schemaVersion: "export-request/v1" as const,
  requestId: "request_export_0001",
  selectionId: exportSelection.selectionId,
  projectId: exportSelection.projectId,
  projectDigest: exportSelection.projectDigest,
  sanitizedBaseFilename: "Proof Export.mp4",
  qualityTier: "720p" as const,
  destinationPresetId: "youtube" as const,
  catalogVersion: "2026-09-20" as const,
  framingMode: "contain-complete-animation" as const,
  sourceStage: { width: 1920, height: 1080 },
  outputCanvas: { width: 1280, height: 720 },
  contentRect: { x: 0, y: 0, width: 1280, height: 720 },
  paddingDescription: "No padding: the saved stage and output canvas have the same shape.",
  fps: 30,
  totalFrames: 30,
  durationMs: 1_000,
  container: "mp4" as const,
  videoCodec: "avc" as const,
  audioCodec: "none" as const,
  rendererVersion: "diamond-export-renderer/v1" as const,
  encoderVersion: "mediabunny/1.58.1" as const,
};

async function exportReceipt(outcome: "completed" | "failed" | "cancelled", receiptId: string): Promise<ExportNotificationTerminalReceiptV1> {
  const inspection = { filename: exportRequest.sanitizedBaseFilename, byteLength: 42_000, width: 1280, height: 720, fps: 30.04, frameCount: 30, durationSeconds: 1.01, videoCodec: "avc", audioCodec: null };
  return {
    schema: "export-notification-terminal/v1",
    selection: structuredClone(exportSelection),
    request: structuredClone(exportRequest),
    exportJobId: "export_job_0001",
    projectRevision: 7,
    receiptId,
    terminalSequence: 9,
    outcome,
    occurredAt: FIXED_TIME + 100,
    terminal: outcome === "completed" ? { kind: "result", inspection, validationDigest: await digest(inspection) } : outcome === "failed" ? { kind: "failure", failedAfterStage: "encoding", code: "export_encoder_failed" } : null,
  };
}

const clone = <T>(value: T): T => structuredClone(value);
const resealPayload = async (envelope: DiamondNotificationEnvelopeV1) => {
  const { payloadDigest: _old, ...body } = envelope.notification;
  void _old;
  envelope.notification.payloadDigest = await digest(body);
};
const resealBinding = async (envelope: DiamondNotificationEnvelopeV1) => {
  const { bindingDigest: _old, ...body } = envelope.binding;
  void _old;
  envelope.binding.bindingDigest = await digest(body);
};

async function main() {
  const receipts: NotificationTerminalReceiptV1[] = [
    await exportReceipt("completed", "export_receipt_success"),
    await exportReceipt("failed", "export_receipt_failure"),
    await assistantReceipt("done", "done"),
    await assistantReceipt("interrupted", "interrupted"),
    await terraReceipt("done", "done1"),
    await terraReceipt("failed", "fail2"),
    { schema: "offline-notification-terminal/v1", offlineIncidentId: "offline_incident_0001", offlineSince: FIXED_TIME - 100, detectedAt: FIXED_TIME, source: "browser-offline-event", onlineBefore: true, onlineAfter: false },
  ];
  const envelopes: DiamondNotificationEnvelopeV1[] = [];
  for (const receipt of receipts) {
    const envelope = await createNotificationEnvelopeFromTerminalV1(receipt, null);
    envelopes.push(await validateNotificationEnvelopeV1(envelope));
  }
  equal(envelopes.map(item => item.notification.eventType), ACTIVE_NOTIFICATION_EVENT_TYPES_V1, "all seven active terminal vectors validate in catalog order");
  for (const envelope of envelopes) {
    const exactCopy = notificationCopyForV1(envelope.notification.eventType, envelope.notification.origin);
    equal([envelope.notification.title, envelope.notification.body], [exactCopy.title, exactCopy.body], `${envelope.notification.eventType} uses closed copy`);
    check(envelope.notification.occurredAt <= envelope.notification.createdAt, "occurredAt precedes createdAt");
  }
  equal(envelopes[0].notification.notificationId, envelopes[1].notification.notificationId, "Export success and failure for one exportJobId share deterministic identity");
  check(envelopes[0].binding.bindingDigest !== envelopes[1].binding.bindingDigest, "conflicting terminal outcomes retain distinct independent bindings");
  equal(DORMANT_NOTIFICATION_EVENT_TYPES_V1.length, 3, "three dormant contracts are structurally reserved");

  const assistantCancel = await assistantReceipt("cancelled", "cancelled");
  const terraCancel = await terraReceipt("cancelled", "cancel3");
  const exportCancel = await exportReceipt("cancelled", "export_receipt_cancel");
  await rejects(() => createNotificationEnvelopeFromTerminalV1(assistantCancel, null), "silent-terminal");
  await rejects(() => createNotificationEnvelopeFromTerminalV1(terraCancel, null), "silent-terminal");
  await rejects(() => createNotificationEnvelopeFromTerminalV1(exportCancel, null), "silent-terminal");
  const preflight = await exportReceipt("failed", "export_receipt_preflight");
  preflight.terminal = { kind: "failure", failedAfterStage: "rendering", code: "export_preflight_failed" };
  (preflight.terminal as { failedAfterStage: string }).failedAfterStage = "preflighting";
  await rejects(() => createNotificationEnvelopeFromTerminalV1(preflight, null), "preflight-silence");
  await rejects(() => createNotificationEnvelopeFromTerminalV1({ schema: "game.notification/v1" } as unknown as NotificationTerminalReceiptV1, null), "event-type");
  await rejects(() => createNotificationEnvelopeFromTerminalV1({ schema: "app-update-notification/v1" } as unknown as NotificationTerminalReceiptV1, null), "event-type");

  const withUnknown = clone(await assistantReceipt("done", "unknown")) as unknown as Record<string, unknown>;
  withUnknown.extra = true;
  await rejects(() => createNotificationEnvelopeFromTerminalV1(withUnknown as unknown as NotificationTerminalReceiptV1, null), "receipt");
  const arbitraryCopy = clone(envelopes[0]);
  arbitraryCopy.notification.body = "Anything the producer wanted.";
  await resealPayload(arbitraryCopy);
  await rejects(() => validateNotificationEnvelopeV1(arbitraryCopy), "copy-or-identity");
  const targetTamper = clone(envelopes[0]);
  assert.equal(targetTamper.notification.target.kind, "export-result");
  targetTamper.notification.target.receiptId = "different_receipt_0001";
  await resealPayload(targetTamper);
  await rejects(() => validateNotificationEnvelopeV1(targetTamper), "copy-or-identity");

  const attackerReseal = clone(envelopes[0]);
  assert.equal(attackerReseal.notification.origin.kind, "export");
  assert.equal(attackerReseal.notification.target.kind, "export-result");
  attackerReseal.notification.origin.receiptId = "attacker_receipt_0001";
  attackerReseal.notification.target.receiptId = "attacker_receipt_0001";
  attackerReseal.binding.origin = clone(attackerReseal.notification.origin);
  attackerReseal.binding.target = clone(attackerReseal.notification.target);
  await resealPayload(attackerReseal);
  await resealBinding(attackerReseal);
  await validateNotificationEnvelopeV1(attackerReseal);
  check(true, "fully rewriting and resealing both objects demonstrates local integrity, not authentication");

  const unsafeFilename = await exportReceipt("completed", "export_receipt_unsafe");
  unsafeFilename.request.sanitizedBaseFilename = "../../secret.mp4";
  await rejects(() => createNotificationEnvelopeFromTerminalV1(unsafeFilename, null), "export-source");
  const malformedInspection = await exportReceipt("completed", "export_receipt_bad_media");
  assert.equal(malformedInspection.terminal?.kind, "result");
  if (malformedInspection.terminal?.kind === "result") {
    malformedInspection.terminal.inspection.videoCodec = "vp9";
    malformedInspection.terminal.validationDigest = await digest(malformedInspection.terminal.inspection);
  }
  await rejects(() => createNotificationEnvelopeFromTerminalV1(malformedInspection, null), "export-inspection");

  const firstSession = await assistantSession("done", "stable");
  const firstTurn = firstSession.turns[0];
  const firstReceipt = { schema: "assistant-notification-terminal/v1" as const, session: firstSession, sessionId: firstSession.id, turnId: firstTurn.id, jobId: firstTurn.jobId, outcome: "done" as const, occurredAt: firstTurn.endedAt! };
  const firstEnvelope = await createNotificationEnvelopeFromTerminalV1(firstReceipt, null);
  const laterTurn: Turn = { id: "turn_later_0001", jobId: "job_later_00001", status: "failed", reasoning: "low", at: FIXED_TIME + 1_000, acceptedAt: FIXED_TIME + 1_100, endedAt: FIXED_TIME + 2_000, contextIds: [], error: "Later failure.", usage: null };
  const laterSession = await sealSession({ ...firstSession, updatedAt: FIXED_TIME + 2_000, revision: 2, digest: HEX_A, messages: [...firstSession.messages, { id: "message_later_user", turnId: laterTurn.id, role: "user", text: "Another question", at: laterTurn.at }], turns: [...firstSession.turns, laterTurn] });
  const reconciled = await createNotificationEnvelopeFromTerminalV1({ ...firstReceipt, session: laterSession }, null);
  equal(reconciled.binding, firstEnvelope.binding, "Assistant terminal binding remains stable after unrelated later session writes");

  const intent = createNotificationNavigationIntentV1(envelopes[2].notification.target);
  check(!JSON.stringify(intent).includes("url"), "navigation intent contains typed identity and no URL");
  const handler = registerNotificationNavigationHandlerV1({ target: envelopes[2].notification.target, handler: () => "blocked-unsaved" });
  equal(await dispatchNotificationTargetV1(envelopes[2].notification.target), "blocked-unsaved", "exact target reaches the registered capture handler");
  equal(await dispatchNotificationTargetV1(envelopes[3].notification.target), "unavailable", "a different Assistant target cannot use a partial registration");
  handler.unregister();
  equal(await dispatchNotificationTargetV1(envelopes[2].notification.target), "unavailable", "unregistered destinations remain unavailable");

  const evidence = {
    schema: "spec0014-phase1-oracle-proof/v1",
    status: "PASS",
    assertions,
    activeVectors: envelopes.map(envelope => ({ eventType: envelope.notification.eventType, notificationId: envelope.notification.notificationId, title: envelope.notification.title, body: envelope.notification.body })),
    stableAssistantBinding: firstEnvelope.binding.bindingDigest,
    limits: { hashesAuthenticateWriters: false, productionProducersConnected: false, productionDestinationHandlersConnected: false },
  };
  await mkdir(dirname(evidencePath), { recursive: true });
  await writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`);
  process.stdout.write(`SPEC-0014 Phase 1 contract oracle PASS (${assertions} assertions)\n`);
}

await main();
