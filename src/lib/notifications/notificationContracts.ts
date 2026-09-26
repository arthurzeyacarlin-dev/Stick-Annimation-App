import { byteSize, digest, isId, stableJson, validateSession, type Session } from "../assistant/assistantContracts.ts";
import { normalizeAiAnimatorJobSnapshot, type AiAnimatorJobSnapshot } from "../ai/aiAnimatorContract.ts";
import { EXPORT_RENDERER_VERSION, sanitizeExportFilename, type ExportRequestV1, type ExportSelectionV1 } from "../export/exportContracts.ts";
import { EXPORT_DESTINATION_CATALOG_VERSION, getExportDestinationPreset } from "../export/exportDestinationCatalog.ts";
import type { ExportInspection } from "../export/exportVideo.ts";

export const DIAMOND_NOTIFICATION_SCHEMA_V1 = "diamond-notification/v1" as const;
export const DIAMOND_NOTIFICATION_ENVELOPE_SCHEMA_V1 = "diamond-notification-envelope/v1" as const;
export const DIAMOND_NOTIFICATION_BINDING_SCHEMA_V1 = "diamond-notification-terminal-binding/v1" as const;
export const DIAMOND_NOTIFICATION_MAX_BYTES_V1 = 8 * 1024;
export const ACTIVE_NOTIFICATION_EVENT_TYPES_V1 = ["export.completed", "export.failed", "assistant.reply.completed", "assistant.reply.failed", "workspace.terra.reply.completed", "workspace.terra.reply.failed", "system.internet.offline", "system.internet.restored"] as const;
export const DORMANT_NOTIFICATION_EVENT_TYPES_V1 = ["workspace.ai-animation.completed", "ai.usage.low", "app.update.available"] as const;
export type ActiveNotificationEventTypeV1 = (typeof ACTIVE_NOTIFICATION_EVENT_TYPES_V1)[number];
export type DormantNotificationEventTypeV1 = (typeof DORMANT_NOTIFICATION_EVENT_TYPES_V1)[number];
export type NotificationEventTypeV1 = ActiveNotificationEventTypeV1 | DormantNotificationEventTypeV1;
export type NotificationOutcomeV1 = "completed" | "failed" | "warning";

export type NotificationOriginV1 =
  | { kind: "assistant"; sessionId: string; turnId: string; jobId: string }
  | { kind: "workspace-terra"; workspaceIdentity: string; projectId: string | null; projectGeneration: number; jobId: string; projectTitle: string }
  | { kind: "export"; exportJobId: string; projectId: string; projectRevision: number; projectDigest: string; projectTitle: string; filename: string; receiptId: string }
  | { kind: "connectivity"; offlineIncidentId: string; offlineSince: number }
  | { kind: "connectivity-restored"; offlineIncidentId: string; offlineSince: number; restoredAt: number }
  | { kind: "workspace-ai-animation"; projectId: string; projectGeneration: number; jobId: string; transactionId: string; projectTitle: string }
  | { kind: "ai-usage"; usageScopeId: string; allowancePeriodId: string; remainingPercent: 10; thresholdEpisodeId: string }
  | { kind: "app-update"; updaterChannel: string; availableVersion: string };

export type NotificationTargetV1 =
  | { kind: "assistant-turn"; sessionId: string; turnId: string; jobId: string }
  | { kind: "workspace-terra-turn"; workspaceIdentity: string; projectId: string | null; projectGeneration: number; jobId: string; openAiPanel: true }
  | { kind: "export-result"; exportJobId: string; projectId: string; projectRevision: number; projectDigest: string; receiptId: string }
  | { kind: "connectivity-warning"; offlineIncidentId: string }
  | { kind: "connectivity-restored"; offlineIncidentId: string }
  | { kind: "workspace-ai-animation-result"; projectId: string; projectGeneration: number; jobId: string; transactionId: string }
  | { kind: "ai-usage-refill"; usageScopeId: string; allowancePeriodId: string; actionLabel: "Buy AI credits" | "Refill AI usage" }
  | { kind: "app-update"; updaterChannel: string; availableVersion: string };

export type NotificationSourceV1 = {
  kind: "export" | "assistant" | "workspace-terra" | "connectivity" | "workspace-ai-animation" | "ai-usage" | "updater";
  sourceId: string;
  attemptId: string;
  terminalSequence: number;
  terminalDigest: string;
};

export type DiamondNotificationV1 = {
  schema: typeof DIAMOND_NOTIFICATION_SCHEMA_V1;
  notificationId: string;
  eventType: NotificationEventTypeV1;
  producerVersion: 1;
  outcome: NotificationOutcomeV1;
  source: NotificationSourceV1;
  origin: NotificationOriginV1;
  target: NotificationTargetV1;
  title: string;
  body: string;
  occurredAt: number;
  createdAt: number;
  readAt: number | null;
  revision: number;
  payloadDigest: string;
};

export type NotificationTerminalBindingV1 = {
  schema: typeof DIAMOND_NOTIFICATION_BINDING_SCHEMA_V1;
  notificationId: string;
  eventType: NotificationEventTypeV1;
  outcome: NotificationOutcomeV1;
  source: NotificationSourceV1;
  origin: NotificationOriginV1;
  target: NotificationTargetV1;
  occurredAt: number;
  bindingDigest: string;
};
export type DiamondNotificationEnvelopeV1 = { schema: typeof DIAMOND_NOTIFICATION_ENVELOPE_SCHEMA_V1; notification: DiamondNotificationV1; binding: NotificationTerminalBindingV1 };

export type AssistantNotificationTerminalReceiptV1 = { schema: "assistant-notification-terminal/v1"; session: Session; sessionId: string; turnId: string; jobId: string; outcome: "done" | "failed" | "interrupted" | "cancelled"; occurredAt: number };
export type TerraLedgerTerminalV1 = { schema: "terra-ledger-terminal/v1"; projectId: string; projectGeneration: number; jobId: string; terminalSequence: number; outcome: "done" | "failed" | "cancelled"; messageId: string; committedAt: number; digest: string };
export type TerraNotificationTerminalReceiptV1 = { schema: "terra-notification-terminal/v1"; snapshot: AiAnimatorJobSnapshot; workspaceIdentity: string; projectId: string | null; projectGeneration: number; projectTitle: string; ledgerTerminal: TerraLedgerTerminalV1; outcome: "done" | "failed" | "cancelled"; occurredAt: number };
export type ExportTerminalResultV1 = { kind: "result"; inspection: ExportInspection; validationDigest: string };
export type ExportTerminalFailureV1 = { kind: "failure"; failedAfterStage: "rendering" | "encoding" | "writing" | "validating"; code: string };
export type ExportNotificationTerminalReceiptV1 = { schema: "export-notification-terminal/v1"; selection: ExportSelectionV1; request: ExportRequestV1; exportJobId: string; projectRevision: number; receiptId: string; terminalSequence: number; outcome: "completed" | "failed" | "cancelled"; occurredAt: number; terminal: ExportTerminalResultV1 | ExportTerminalFailureV1 | null };
export type OfflineNotificationTerminalReceiptV1 =
  | { schema: "offline-notification-terminal/v1"; offlineIncidentId: string; offlineSince: number; detectedAt: number; source: "browser-offline-event"; onlineBefore: true; onlineAfter: false }
  | { schema: "offline-notification-terminal/v1"; offlineIncidentId: string; offlineSince: number; detectedAt: number; source: "browser-initial-offline"; onlineBefore: false; onlineAfter: false };
export type OnlineNotificationTerminalReceiptV1 = { schema: "online-notification-terminal/v1"; offlineIncidentId: string; offlineSince: number; restoredAt: number; source: "browser-online-event"; onlineBefore: false; onlineAfter: true };
export type NotificationTerminalReceiptV1 = AssistantNotificationTerminalReceiptV1 | TerraNotificationTerminalReceiptV1 | ExportNotificationTerminalReceiptV1 | OfflineNotificationTerminalReceiptV1 | OnlineNotificationTerminalReceiptV1;

export class NotificationContractError extends Error {
  readonly code: string;
  constructor(code: string, message: string) { super(message); this.name = "NotificationContractError"; this.code = code; }
}
function fail(code: string, message: string): never { throw new NotificationContractError(code, message); }
const record = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const exactKeys = (value: unknown, keys: readonly string[]) => record(value) && Object.keys(value).sort().join("|") === [...keys].sort().join("|");
const integer = (value: unknown, min = 0) => typeof value === "number" && Number.isSafeInteger(value) && value >= min;
const timestamp = (value: unknown) => integer(value, 1) && Number(value) <= 8_640_000_000_000_000;
const hexDigest = (value: unknown) => typeof value === "string" && /^[0-9a-f]{64}$/.test(value);
const utf8Bytes = (value: string) => new TextEncoder().encode(value).byteLength;
const normalizedIdentity = (value: unknown) => typeof value === "string" && value === value.normalize("NFC") && utf8Bytes(value) >= 1 && utf8Bytes(value) <= 256 && !/[\u0000-\u001f\u007f]/.test(value);
const normalizedFilename = (value: unknown) => typeof value === "string" && value === value.normalize("NFC") && utf8Bytes(value) >= 1 && utf8Bytes(value) <= 255 && !/[\u0000-\u001f\u007f/\\:]/.test(value);
const scalarLength = (value: string) => Array.from(value).length;
const sanitizeProjectTitle = (value: string) => {
  const normalized = value.normalize("NFC").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim() || "Untitled project";
  const scalars = Array.from(normalized);
  return scalars.length <= 120 ? normalized : `${scalars.slice(0, 119).join("")}…`;
};
const bodyForProject = (prefix: string, title: string) => {
  const suffix = "”.";
  const available = 280 - scalarLength(prefix) - scalarLength(suffix);
  const scalars = Array.from(sanitizeProjectTitle(title));
  const shown = scalars.length <= available ? scalars.join("") : `${scalars.slice(0, Math.max(1, available - 1)).join("")}…`;
  return `${prefix}${shown}${suffix}`;
};

export const notificationCopyForV1 = (eventType: NotificationEventTypeV1, origin: NotificationOriginV1) => {
  switch (eventType) {
    case "export.completed": return { title: "Export complete", body: "Your animation is done exporting." };
    case "export.failed": return { title: "Export failed", body: "Your animation couldn't finish exporting." };
    case "assistant.reply.completed": return { title: "AI Assistant replied", body: "AI Assistant finished replying." };
    case "assistant.reply.failed": return { title: "AI Assistant reply failed", body: "AI Assistant couldn't finish replying." };
    case "workspace.terra.reply.completed": return { title: "Terra replied", body: bodyForProject("Terra finished replying in “", origin.kind === "workspace-terra" ? origin.projectTitle : "") };
    case "workspace.terra.reply.failed": return { title: "Terra reply failed", body: bodyForProject("Terra couldn't finish replying in “", origin.kind === "workspace-terra" ? origin.projectTitle : "") };
    case "system.internet.offline": return { title: "You're offline", body: "There is no internet, so AI calls are unavailable. Reconnect to use AI." };
    case "system.internet.restored": return { title: "Internet restored", body: "Your connection was restored at this time. You can try online and AI features while the browser remains online." };
    case "workspace.ai-animation.completed": return { title: "Animation ready", body: bodyForProject("AI Animator finished animating “", origin.kind === "workspace-ai-animation" ? origin.projectTitle : "") };
    case "ai.usage.low": return { title: "AI usage is low", body: "You have 10% of your AI usage remaining." };
    case "app.update.available": return { title: "Update available", body: "A new Diamond Animator update is available." };
  }
};

function validateOrigin(value: unknown): asserts value is NotificationOriginV1 {
  if (!record(value)) fail("origin", "Notification origin is invalid.");
  switch (value.kind) {
    case "assistant": if (!exactKeys(value, ["kind", "sessionId", "turnId", "jobId"]) || !isId(value.sessionId) || !isId(value.turnId) || !isId(value.jobId)) fail("origin", "Assistant origin is invalid."); return;
    case "workspace-terra": if (!exactKeys(value, ["kind", "workspaceIdentity", "projectId", "projectGeneration", "jobId", "projectTitle"]) || !normalizedIdentity(value.workspaceIdentity) || !(value.projectId === null || normalizedIdentity(value.projectId)) || !integer(value.projectGeneration) || !normalizedIdentity(value.jobId) || typeof value.projectTitle !== "string" || value.projectTitle !== sanitizeProjectTitle(value.projectTitle)) fail("origin", "Terra origin is invalid."); return;
    case "export": if (!exactKeys(value, ["kind", "exportJobId", "projectId", "projectRevision", "projectDigest", "projectTitle", "filename", "receiptId"]) || !normalizedIdentity(value.exportJobId) || !normalizedIdentity(value.projectId) || !integer(value.projectRevision, 1) || !hexDigest(value.projectDigest) || typeof value.projectTitle !== "string" || value.projectTitle !== sanitizeProjectTitle(value.projectTitle) || !normalizedFilename(value.filename) || !normalizedIdentity(value.receiptId)) fail("origin", "Export origin is invalid."); return;
    case "connectivity": if (!exactKeys(value, ["kind", "offlineIncidentId", "offlineSince"]) || !normalizedIdentity(value.offlineIncidentId) || !timestamp(value.offlineSince)) fail("origin", "Connectivity origin is invalid."); return;
    case "connectivity-restored": if (!exactKeys(value, ["kind", "offlineIncidentId", "offlineSince", "restoredAt"]) || !normalizedIdentity(value.offlineIncidentId) || !timestamp(value.offlineSince) || !timestamp(value.restoredAt) || Number(value.restoredAt) < Number(value.offlineSince)) fail("origin", "Restored connectivity origin is invalid."); return;
    case "workspace-ai-animation": if (!exactKeys(value, ["kind", "projectId", "projectGeneration", "jobId", "transactionId", "projectTitle"]) || !normalizedIdentity(value.projectId) || !integer(value.projectGeneration) || !normalizedIdentity(value.jobId) || !normalizedIdentity(value.transactionId) || typeof value.projectTitle !== "string" || value.projectTitle !== sanitizeProjectTitle(value.projectTitle)) fail("origin", "Future Animator origin is invalid."); return;
    case "ai-usage": if (!exactKeys(value, ["kind", "usageScopeId", "allowancePeriodId", "remainingPercent", "thresholdEpisodeId"]) || !normalizedIdentity(value.usageScopeId) || !normalizedIdentity(value.allowancePeriodId) || value.remainingPercent !== 10 || !normalizedIdentity(value.thresholdEpisodeId)) fail("origin", "Future usage origin is invalid."); return;
    case "app-update": if (!exactKeys(value, ["kind", "updaterChannel", "availableVersion"]) || !normalizedIdentity(value.updaterChannel) || !normalizedIdentity(value.availableVersion)) fail("origin", "Future updater origin is invalid."); return;
    default: fail("origin", "Unknown notification origin.");
  }
}

function validateTarget(value: unknown): asserts value is NotificationTargetV1 {
  if (!record(value)) fail("target", "Notification target is invalid.");
  switch (value.kind) {
    case "assistant-turn": if (!exactKeys(value, ["kind", "sessionId", "turnId", "jobId"]) || !isId(value.sessionId) || !isId(value.turnId) || !isId(value.jobId)) fail("target", "Assistant target is invalid."); return;
    case "workspace-terra-turn": if (!exactKeys(value, ["kind", "workspaceIdentity", "projectId", "projectGeneration", "jobId", "openAiPanel"]) || !normalizedIdentity(value.workspaceIdentity) || !(value.projectId === null || normalizedIdentity(value.projectId)) || !integer(value.projectGeneration) || !normalizedIdentity(value.jobId) || value.openAiPanel !== true) fail("target", "Terra target is invalid."); return;
    case "export-result": if (!exactKeys(value, ["kind", "exportJobId", "projectId", "projectRevision", "projectDigest", "receiptId"]) || !normalizedIdentity(value.exportJobId) || !normalizedIdentity(value.projectId) || !integer(value.projectRevision, 1) || !hexDigest(value.projectDigest) || !normalizedIdentity(value.receiptId)) fail("target", "Export target is invalid."); return;
    case "connectivity-warning": if (!exactKeys(value, ["kind", "offlineIncidentId"]) || !normalizedIdentity(value.offlineIncidentId)) fail("target", "Connectivity target is invalid."); return;
    case "connectivity-restored": if (!exactKeys(value, ["kind", "offlineIncidentId"]) || !normalizedIdentity(value.offlineIncidentId)) fail("target", "Restored connectivity target is invalid."); return;
    case "workspace-ai-animation-result": if (!exactKeys(value, ["kind", "projectId", "projectGeneration", "jobId", "transactionId"]) || !normalizedIdentity(value.projectId) || !integer(value.projectGeneration) || !normalizedIdentity(value.jobId) || !normalizedIdentity(value.transactionId)) fail("target", "Future Animator target is invalid."); return;
    case "ai-usage-refill": if (!exactKeys(value, ["kind", "usageScopeId", "allowancePeriodId", "actionLabel"]) || !normalizedIdentity(value.usageScopeId) || !normalizedIdentity(value.allowancePeriodId) || (value.actionLabel !== "Buy AI credits" && value.actionLabel !== "Refill AI usage")) fail("target", "Future usage target is invalid."); return;
    case "app-update": if (!exactKeys(value, ["kind", "updaterChannel", "availableVersion"]) || !normalizedIdentity(value.updaterChannel) || !normalizedIdentity(value.availableVersion)) fail("target", "Future updater target is invalid."); return;
    default: fail("target", "Unknown notification target.");
  }
}

export function requireNotificationOriginV1(value: unknown): NotificationOriginV1 {
  validateOrigin(value);
  return structuredClone(value);
}

export function requireNotificationTargetV1(value: unknown): NotificationTargetV1 {
  validateTarget(value);
  return structuredClone(value);
}

export const notificationIdentityEqualsV1 = (left: NotificationOriginV1 | NotificationTargetV1, right: NotificationOriginV1 | NotificationTargetV1) => stableJson(left) === stableJson(right);

const identitiesMatchEvent = (eventType: NotificationEventTypeV1, outcome: NotificationOutcomeV1, origin: NotificationOriginV1, target: NotificationTargetV1) => {
  if (eventType === "assistant.reply.completed" || eventType === "assistant.reply.failed") return origin.kind === "assistant" && target.kind === "assistant-turn" && origin.sessionId === target.sessionId && origin.turnId === target.turnId && origin.jobId === target.jobId && outcome === (eventType.endsWith("completed") ? "completed" : "failed");
  if (eventType === "workspace.terra.reply.completed" || eventType === "workspace.terra.reply.failed") return origin.kind === "workspace-terra" && target.kind === "workspace-terra-turn" && origin.workspaceIdentity === target.workspaceIdentity && origin.projectId === target.projectId && origin.projectGeneration === target.projectGeneration && origin.jobId === target.jobId && target.openAiPanel === true && outcome === (eventType.endsWith("completed") ? "completed" : "failed");
  if (eventType === "export.completed" || eventType === "export.failed") return origin.kind === "export" && target.kind === "export-result" && origin.exportJobId === target.exportJobId && origin.projectId === target.projectId && origin.projectRevision === target.projectRevision && origin.projectDigest === target.projectDigest && origin.receiptId === target.receiptId && outcome === (eventType.endsWith("completed") ? "completed" : "failed");
  if (eventType === "system.internet.offline") return origin.kind === "connectivity" && target.kind === "connectivity-warning" && origin.offlineIncidentId === target.offlineIncidentId && outcome === "warning";
  if (eventType === "system.internet.restored") return origin.kind === "connectivity-restored" && target.kind === "connectivity-restored" && origin.offlineIncidentId === target.offlineIncidentId && outcome === "completed";
  if (eventType === "workspace.ai-animation.completed") return origin.kind === "workspace-ai-animation" && target.kind === "workspace-ai-animation-result" && origin.projectId === target.projectId && origin.projectGeneration === target.projectGeneration && origin.jobId === target.jobId && origin.transactionId === target.transactionId && outcome === "completed";
  if (eventType === "ai.usage.low") return origin.kind === "ai-usage" && target.kind === "ai-usage-refill" && origin.usageScopeId === target.usageScopeId && origin.allowancePeriodId === target.allowancePeriodId && outcome === "warning";
  return eventType === "app.update.available" && origin.kind === "app-update" && target.kind === "app-update" && origin.updaterChannel === target.updaterChannel && origin.availableVersion === target.availableVersion && outcome === "warning";
};

const sourceIdentityFor = (origin: NotificationOriginV1) => {
  switch (origin.kind) {
    case "assistant": return { kind: "assistant" as const, sourceId: `${origin.sessionId}/${origin.turnId}`, attemptId: origin.jobId };
    case "workspace-terra": return { kind: "workspace-terra" as const, sourceId: `${origin.workspaceIdentity}/${origin.projectId ?? "null"}/${origin.projectGeneration}`, attemptId: origin.jobId };
    case "export": return { kind: "export" as const, sourceId: `${origin.projectId}/${origin.projectRevision}/${origin.projectDigest}`, attemptId: origin.exportJobId };
    case "connectivity": return { kind: "connectivity" as const, sourceId: "browser-profile", attemptId: origin.offlineIncidentId };
    case "connectivity-restored": return { kind: "connectivity" as const, sourceId: "browser-profile", attemptId: `restored-${origin.offlineIncidentId}` };
    case "workspace-ai-animation": return { kind: "workspace-ai-animation" as const, sourceId: `${origin.projectId}/${origin.projectGeneration}/${origin.transactionId}`, attemptId: origin.jobId };
    case "ai-usage": return { kind: "ai-usage" as const, sourceId: `${origin.usageScopeId}/${origin.allowancePeriodId}`, attemptId: origin.thresholdEpisodeId };
    case "app-update": return { kind: "updater" as const, sourceId: origin.updaterChannel, attemptId: origin.availableVersion };
  }
};

async function sealEnvelope(input: { eventType: ActiveNotificationEventTypeV1; outcome: NotificationOutcomeV1; occurredAt: number; terminalSequence: number; terminalDigest: string; origin: NotificationOriginV1; target: NotificationTargetV1; readAt: number | null; createdAt?: number }) {
  const createdAt = input.createdAt ?? Date.now();
  if (!timestamp(input.occurredAt) || !timestamp(createdAt) || input.occurredAt > createdAt) fail("timestamp", "Notification timestamps are invalid.");
  const sourceIdentity = sourceIdentityFor(input.origin);
  const source: NotificationSourceV1 = { ...sourceIdentity, terminalSequence: input.terminalSequence, terminalDigest: input.terminalDigest };
  const notificationId = await digest(`diamond-notification/v1 | ${source.kind} | ${source.sourceId} | ${source.attemptId}`);
  const copy = notificationCopyForV1(input.eventType, input.origin);
  const body = { schema: DIAMOND_NOTIFICATION_SCHEMA_V1, notificationId, eventType: input.eventType, producerVersion: 1 as const, outcome: input.outcome, source, origin: input.origin, target: input.target, ...copy, occurredAt: input.occurredAt, createdAt, readAt: input.readAt, revision: 1 };
  const notification: DiamondNotificationV1 = { ...body, payloadDigest: await digest(body) };
  const bindingBody = { schema: DIAMOND_NOTIFICATION_BINDING_SCHEMA_V1, notificationId, eventType: input.eventType, outcome: input.outcome, source, origin: input.origin, target: input.target, occurredAt: input.occurredAt };
  const binding: NotificationTerminalBindingV1 = { ...bindingBody, bindingDigest: await digest(bindingBody) };
  return { schema: DIAMOND_NOTIFICATION_ENVELOPE_SCHEMA_V1, notification, binding } satisfies DiamondNotificationEnvelopeV1;
}

const selectionKeys = ["schemaVersion", "selectionId", "projectId", "projectDigest", "title", "savedUpdatedAt", "fps", "authoredFrameCount", "durationMs"];
const requestKeys = ["schemaVersion", "requestId", "selectionId", "projectId", "projectDigest", "sanitizedBaseFilename", "qualityTier", "destinationPresetId", "catalogVersion", "framingMode", "sourceStage", "outputCanvas", "contentRect", "paddingDescription", "fps", "totalFrames", "durationMs", "container", "videoCodec", "audioCodec", "rendererVersion", "encoderVersion"];
const validateExportSources = (selection: ExportSelectionV1, request: ExportRequestV1) => {
  if (!exactKeys(selection, selectionKeys) || !exactKeys(request, requestKeys) || selection.schemaVersion !== "export-selection/v1" || request.schemaVersion !== "export-request/v1") fail("export-source", "Export source objects are invalid.");
  if (!normalizedIdentity(selection.selectionId) || !normalizedIdentity(selection.projectId) || !hexDigest(selection.projectDigest) || typeof selection.title !== "string" || sanitizeProjectTitle(selection.title) !== selection.title || !normalizedIdentity(request.requestId) || request.selectionId !== selection.selectionId || request.projectId !== selection.projectId || request.projectDigest !== selection.projectDigest || sanitizeExportFilename(request.sanitizedBaseFilename, selection.title) !== request.sanitizedBaseFilename || !normalizedFilename(request.sanitizedBaseFilename)) fail("export-source", "Export selection and request do not match.");
  if (!Number.isFinite(selection.fps) || selection.fps <= 0 || selection.fps > 240 || !integer(selection.authoredFrameCount, 1) || !integer(selection.durationMs, 1) || request.fps !== selection.fps || request.totalFrames !== selection.authoredFrameCount || request.durationMs !== selection.durationMs) fail("export-source", "Export timing is invalid.");
  if (!["720p", "1080p", "custom"].includes(request.qualityTier) || request.catalogVersion !== EXPORT_DESTINATION_CATALOG_VERSION || request.framingMode !== "contain-complete-animation" || request.container !== "mp4" || request.videoCodec !== "avc" || (request.audioCodec !== "aac" && request.audioCodec !== "none") || request.rendererVersion !== EXPORT_RENDERER_VERSION || request.encoderVersion !== "mediabunny/1.58.1") fail("export-source", "Export request format is invalid.");
  try { getExportDestinationPreset(request.destinationPresetId); } catch { fail("export-source", "Export destination is invalid."); }
  const positiveFinite = (value: unknown) => typeof value === "number" && Number.isFinite(value) && value > 0;
  if (!exactKeys(request.sourceStage, ["width", "height"]) || !exactKeys(request.outputCanvas, ["width", "height"]) || !exactKeys(request.contentRect, ["x", "y", "width", "height"]) || !positiveFinite(request.sourceStage.width) || !positiveFinite(request.sourceStage.height) || !integer(request.outputCanvas.width, 2) || !integer(request.outputCanvas.height, 2) || request.outputCanvas.width % 2 !== 0 || request.outputCanvas.height % 2 !== 0 || request.outputCanvas.width > 1920 || request.outputCanvas.height > 1920 || !Number.isFinite(request.contentRect.x) || !Number.isFinite(request.contentRect.y) || !positiveFinite(request.contentRect.width) || !positiveFinite(request.contentRect.height) || request.contentRect.x < 0 || request.contentRect.y < 0 || request.contentRect.x + request.contentRect.width > request.outputCanvas.width + .01 || request.contentRect.y + request.contentRect.height > request.outputCanvas.height + .01 || typeof request.paddingDescription !== "string" || request.paddingDescription.length < 1 || request.paddingDescription.length > 300) fail("export-source", "Export geometry is invalid.");
};
const inspectionKeys = ["filename", "byteLength", "width", "height", "fps", "frameCount", "durationSeconds", "videoCodec", "audioCodec"];
function validateInspection(value: unknown, request: ExportRequestV1): asserts value is ExportInspection {
  if (!record(value)) fail("export-inspection", "Export result inspection is invalid.");
  const inspection = value as Record<string, unknown>;
  if (!exactKeys(inspection, inspectionKeys) || !normalizedFilename(inspection.filename) || inspection.filename !== request.sanitizedBaseFilename || !integer(inspection.byteLength, 1) || inspection.width !== request.outputCanvas.width || inspection.height !== request.outputCanvas.height || typeof inspection.fps !== "number" || !Number.isFinite(inspection.fps) || Math.abs(inspection.fps - request.fps) > .05 || inspection.frameCount !== request.totalFrames || typeof inspection.durationSeconds !== "number" || !Number.isFinite(inspection.durationSeconds) || Math.abs(inspection.durationSeconds - request.durationMs / 1000) > .5 / request.fps || inspection.videoCodec !== "avc") fail("export-inspection", "Export result inspection is invalid.");
  if (request.audioCodec === "aac" ? inspection.audioCodec !== "aac" : inspection.audioCodec !== null) fail("export-inspection", "Export audio inspection does not match the request.");
}

export async function createNotificationEnvelopeFromTerminalV1(receipt: NotificationTerminalReceiptV1, readAt: number | null): Promise<DiamondNotificationEnvelopeV1> {
  if (!record(receipt)) fail("receipt", "Notification receipt is invalid.");
  if (receipt.schema === "assistant-notification-terminal/v1") {
    if (!exactKeys(receipt, ["schema", "session", "sessionId", "turnId", "jobId", "outcome", "occurredAt"]) || !isId(receipt.sessionId) || !isId(receipt.turnId) || !isId(receipt.jobId) || !timestamp(receipt.occurredAt) || !["done", "failed", "interrupted", "cancelled"].includes(String(receipt.outcome))) fail("receipt", "Assistant terminal receipt is invalid.");
    if (receipt.outcome === "cancelled") fail("silent-terminal", "Explicit cancellation does not publish a notification.");
    const session = await validateSession(receipt.session);
    const turnIndex = session.turns.findIndex(turn => turn.id === receipt.turnId);
    const turn = session.turns[turnIndex];
    if (session.id !== receipt.sessionId || !turn || turn.jobId !== receipt.jobId || turn.status !== receipt.outcome || turn.endedAt !== receipt.occurredAt) fail("source-mismatch", "Assistant terminal source does not match.");
    const origin = { kind: "assistant", sessionId: receipt.sessionId, turnId: receipt.turnId, jobId: receipt.jobId } as const;
    const target = { kind: "assistant-turn", sessionId: receipt.sessionId, turnId: receipt.turnId, jobId: receipt.jobId } as const;
    const committedMessages = session.messages.filter(message => message.turnId === turn.id);
    return sealEnvelope({ eventType: receipt.outcome === "done" ? "assistant.reply.completed" : "assistant.reply.failed", outcome: receipt.outcome === "done" ? "completed" : "failed", occurredAt: receipt.occurredAt, terminalSequence: turnIndex + 1, terminalDigest: await digest({ turn, committedMessages }), origin, target, readAt });
  }
  if (receipt.schema === "terra-notification-terminal/v1") {
    if (!exactKeys(receipt, ["schema", "snapshot", "workspaceIdentity", "projectId", "projectGeneration", "projectTitle", "ledgerTerminal", "outcome", "occurredAt"]) || !normalizedIdentity(receipt.workspaceIdentity) || !(receipt.projectId === null || normalizedIdentity(receipt.projectId)) || !integer(receipt.projectGeneration) || typeof receipt.projectTitle !== "string" || sanitizeProjectTitle(receipt.projectTitle) !== receipt.projectTitle || !timestamp(receipt.occurredAt) || !["done", "failed", "cancelled"].includes(String(receipt.outcome))) fail("receipt", "Terra terminal receipt is invalid.");
    if (receipt.outcome === "cancelled") fail("silent-terminal", "Explicit cancellation does not publish a notification.");
    const snapshot = normalizeAiAnimatorJobSnapshot(receipt.snapshot);
    const ledger = receipt.ledgerTerminal;
    if (!snapshot || snapshot.status !== receipt.outcome || snapshot.projectId !== receipt.projectId || snapshot.projectGeneration !== receipt.projectGeneration || Date.parse(snapshot.completedAt ?? "") !== receipt.occurredAt) fail("source-mismatch", "Terra terminal source does not match.");
    if (!exactKeys(ledger, ["schema", "projectId", "projectGeneration", "jobId", "terminalSequence", "outcome", "messageId", "committedAt", "digest"]) || ledger.schema !== "terra-ledger-terminal/v1" || !normalizedIdentity(ledger.projectId) || !integer(ledger.projectGeneration) || !normalizedIdentity(ledger.jobId) || !integer(ledger.terminalSequence, 1) || !["done", "failed", "cancelled"].includes(String(ledger.outcome)) || !normalizedIdentity(ledger.messageId) || !timestamp(ledger.committedAt) || !hexDigest(ledger.digest)) fail("terra-ledger", "Terra ledger terminal record is invalid.");
    const { digest: ledgerDigest, ...ledgerBody } = ledger;
    if (await digest(ledgerBody) !== ledgerDigest || ledger.projectId !== snapshot.projectId || ledger.projectGeneration !== snapshot.projectGeneration || ledger.jobId !== snapshot.jobId || ledger.terminalSequence !== snapshot.lastSequence || ledger.outcome !== snapshot.status || ledger.committedAt !== receipt.occurredAt) fail("terra-ledger", "Terra ledger terminal record does not match the snapshot.");
    const origin = { kind: "workspace-terra", workspaceIdentity: receipt.workspaceIdentity, projectId: receipt.projectId, projectGeneration: receipt.projectGeneration, jobId: snapshot.jobId, projectTitle: receipt.projectTitle } as const;
    const target = { kind: "workspace-terra-turn", workspaceIdentity: receipt.workspaceIdentity, projectId: receipt.projectId, projectGeneration: receipt.projectGeneration, jobId: snapshot.jobId, openAiPanel: true } as const;
    return sealEnvelope({ eventType: receipt.outcome === "done" ? "workspace.terra.reply.completed" : "workspace.terra.reply.failed", outcome: receipt.outcome === "done" ? "completed" : "failed", occurredAt: receipt.occurredAt, terminalSequence: snapshot.lastSequence, terminalDigest: await digest({ snapshot, ledgerTerminal: ledger }), origin, target, readAt });
  }
  if (receipt.schema === "export-notification-terminal/v1") {
    if (!exactKeys(receipt, ["schema", "selection", "request", "exportJobId", "projectRevision", "receiptId", "terminalSequence", "outcome", "occurredAt", "terminal"]) || !normalizedIdentity(receipt.exportJobId) || !integer(receipt.projectRevision, 1) || !normalizedIdentity(receipt.receiptId) || !integer(receipt.terminalSequence, 1) || !timestamp(receipt.occurredAt) || !["completed", "failed", "cancelled"].includes(String(receipt.outcome))) fail("receipt", "Export terminal receipt is invalid.");
    if (receipt.outcome === "cancelled") fail("silent-terminal", "Explicit or Finder cancellation does not publish a notification.");
    validateExportSources(receipt.selection, receipt.request);
    const terminal = receipt.terminal;
    if (receipt.outcome === "completed") {
      if (!terminal || terminal.kind !== "result" || !exactKeys(terminal, ["kind", "inspection", "validationDigest"]) || !hexDigest(terminal.validationDigest)) fail("export-terminal", "Export success has no validated result.");
      validateInspection(terminal.inspection, receipt.request);
      if (await digest(terminal.inspection) !== terminal.validationDigest) fail("export-terminal", "Export validation digest does not match its inspection.");
    } else if (!terminal || terminal.kind !== "failure" || !exactKeys(terminal, ["kind", "failedAfterStage", "code"]) || !["rendering", "encoding", "writing", "validating"].includes(terminal.failedAfterStage) || !normalizedIdentity(terminal.code)) fail("preflight-silence", "Only a failure after a file-writing job starts may publish.");
    const origin = { kind: "export", exportJobId: receipt.exportJobId, projectId: receipt.request.projectId, projectRevision: receipt.projectRevision, projectDigest: receipt.request.projectDigest, projectTitle: receipt.selection.title, filename: receipt.request.sanitizedBaseFilename, receiptId: receipt.receiptId } as const;
    const target = { kind: "export-result", exportJobId: receipt.exportJobId, projectId: receipt.request.projectId, projectRevision: receipt.projectRevision, projectDigest: receipt.request.projectDigest, receiptId: receipt.receiptId } as const;
    return sealEnvelope({ eventType: receipt.outcome === "completed" ? "export.completed" : "export.failed", outcome: receipt.outcome, occurredAt: receipt.occurredAt, terminalSequence: receipt.terminalSequence, terminalDigest: await digest(receipt), origin, target, readAt });
  }
  if (receipt.schema === "offline-notification-terminal/v1") {
    const truthfulSource = receipt.source === "browser-offline-event" && receipt.onlineBefore === true || receipt.source === "browser-initial-offline" && receipt.onlineBefore === false;
    if (!exactKeys(receipt, ["schema", "offlineIncidentId", "offlineSince", "detectedAt", "source", "onlineBefore", "onlineAfter"]) || !normalizedIdentity(receipt.offlineIncidentId) || !timestamp(receipt.offlineSince) || !timestamp(receipt.detectedAt) || receipt.offlineSince > receipt.detectedAt || !truthfulSource || receipt.onlineAfter !== false) fail("receipt", "Offline terminal receipt is invalid.");
    const origin = { kind: "connectivity", offlineIncidentId: receipt.offlineIncidentId, offlineSince: receipt.offlineSince } as const;
    const target = { kind: "connectivity-warning", offlineIncidentId: receipt.offlineIncidentId } as const;
    return sealEnvelope({ eventType: "system.internet.offline", outcome: "warning", occurredAt: receipt.detectedAt, terminalSequence: 1, terminalDigest: await digest(receipt), origin, target, readAt });
  }
  if (receipt.schema === "online-notification-terminal/v1") {
    if (!exactKeys(receipt, ["schema", "offlineIncidentId", "offlineSince", "restoredAt", "source", "onlineBefore", "onlineAfter"]) || !normalizedIdentity(receipt.offlineIncidentId) || !timestamp(receipt.offlineSince) || !timestamp(receipt.restoredAt) || receipt.restoredAt < receipt.offlineSince || receipt.source !== "browser-online-event" || receipt.onlineBefore !== false || receipt.onlineAfter !== true) fail("receipt", "Online terminal receipt is invalid.");
    const origin = { kind: "connectivity-restored", offlineIncidentId: receipt.offlineIncidentId, offlineSince: receipt.offlineSince, restoredAt: receipt.restoredAt } as const;
    const target = { kind: "connectivity-restored", offlineIncidentId: receipt.offlineIncidentId } as const;
    return sealEnvelope({ eventType: "system.internet.restored", outcome: "completed", occurredAt: receipt.restoredAt, terminalSequence: 2, terminalDigest: await digest(receipt), origin, target, readAt });
  }
  fail("event-type", "Unknown, game, or dormant notification publication is rejected.");
}

export async function resealNotificationReadStateV1(envelope: DiamondNotificationEnvelopeV1, readAt: number) {
  await validateNotificationEnvelopeV1(envelope);
  if (!timestamp(readAt) || readAt < envelope.notification.createdAt) fail("read-at", "Notification read time is invalid.");
  if (envelope.notification.readAt !== null) return envelope;
  const { payloadDigest: _prior, ...body } = envelope.notification;
  void _prior;
  const nextBody = { ...body, readAt, revision: body.revision + 1 };
  return { ...envelope, notification: { ...nextBody, payloadDigest: await digest(nextBody) } };
}

export async function validateNotificationEnvelopeV1(value: unknown): Promise<DiamondNotificationEnvelopeV1> {
  if (!record(value)) fail("envelope", "Notification envelope schema or fields are invalid.");
  const envelope = value as Record<string, unknown>;
  if (!exactKeys(envelope, ["schema", "notification", "binding"]) || envelope.schema !== DIAMOND_NOTIFICATION_ENVELOPE_SCHEMA_V1) fail("envelope", "Notification envelope schema or fields are invalid.");
  const notification = envelope.notification as DiamondNotificationV1;
  const binding = envelope.binding as NotificationTerminalBindingV1;
  const notificationKeys = ["schema", "notificationId", "eventType", "producerVersion", "outcome", "source", "origin", "target", "title", "body", "occurredAt", "createdAt", "readAt", "revision", "payloadDigest"];
  if (!exactKeys(notification, notificationKeys) || notification.schema !== DIAMOND_NOTIFICATION_SCHEMA_V1 || ![...ACTIVE_NOTIFICATION_EVENT_TYPES_V1, ...DORMANT_NOTIFICATION_EVENT_TYPES_V1].includes(notification.eventType as NotificationEventTypeV1) || notification.producerVersion !== 1 || !["completed", "failed", "warning"].includes(String(notification.outcome))) fail("notification", "Notification schema or fields are invalid.");
  if (!hexDigest(notification.notificationId) || !exactKeys(notification.source, ["kind", "sourceId", "attemptId", "terminalSequence", "terminalDigest"]) || !["export", "assistant", "workspace-terra", "connectivity", "workspace-ai-animation", "ai-usage", "updater"].includes(String(notification.source.kind)) || !normalizedIdentity(notification.source.sourceId) || !normalizedIdentity(notification.source.attemptId) || !integer(notification.source.terminalSequence, 1) || !hexDigest(notification.source.terminalDigest) || !timestamp(notification.occurredAt) || !timestamp(notification.createdAt) || notification.occurredAt > notification.createdAt || !(notification.readAt === null || (timestamp(notification.readAt) && notification.readAt >= notification.createdAt)) || !integer(notification.revision, 1) || !hexDigest(notification.payloadDigest)) fail("notification", "Notification values are invalid.");
  validateOrigin(notification.origin); validateTarget(notification.target);
  const copy = notificationCopyForV1(notification.eventType as NotificationEventTypeV1, notification.origin as NotificationOriginV1);
  if (notification.title !== copy.title || notification.body !== copy.body || scalarLength(notification.title) > 80 || scalarLength(notification.body) > 280 || !identitiesMatchEvent(notification.eventType as NotificationEventTypeV1, notification.outcome as NotificationOutcomeV1, notification.origin as NotificationOriginV1, notification.target as NotificationTargetV1)) fail("copy-or-identity", "Notification copy, outcome, origin, or target is incompatible.");
  const sourceIdentity = sourceIdentityFor(notification.origin as NotificationOriginV1);
  if (notification.source.kind !== sourceIdentity.kind || notification.source.sourceId !== sourceIdentity.sourceId || notification.source.attemptId !== sourceIdentity.attemptId) fail("source", "Notification source identity does not match its origin.");
  const expectedId = await digest(`diamond-notification/v1 | ${notification.source.kind} | ${notification.source.sourceId} | ${notification.source.attemptId}`);
  if (notification.notificationId !== expectedId) fail("notification-id", "Notification ID is invalid.");
  const { payloadDigest, ...notificationBody } = notification;
  if (await digest(notificationBody) !== payloadDigest) fail("notification-digest", "Notification payload failed its integrity check.");
  const bindingKeys = ["schema", "notificationId", "eventType", "outcome", "source", "origin", "target", "occurredAt", "bindingDigest"];
  if (!exactKeys(binding, bindingKeys) || binding.schema !== DIAMOND_NOTIFICATION_BINDING_SCHEMA_V1 || !hexDigest(binding.bindingDigest)) fail("binding", "Notification terminal binding is invalid.");
  validateOrigin(binding.origin); validateTarget(binding.target);
  const { bindingDigest, ...bindingBody } = binding;
  if (await digest(bindingBody) !== bindingDigest) fail("binding-digest", "Notification terminal binding seal is invalid.");
  if (binding.notificationId !== notification.notificationId || binding.eventType !== notification.eventType || binding.outcome !== notification.outcome || binding.occurredAt !== notification.occurredAt || stableJson(binding.source) !== stableJson(notification.source) || stableJson(binding.origin) !== stableJson(notification.origin) || stableJson(binding.target) !== stableJson(notification.target)) fail("binding-mismatch", "Notification and independently sealed terminal binding do not match.");
  if (byteSize(value) > DIAMOND_NOTIFICATION_MAX_BYTES_V1) fail("oversize", "Notification record exceeds 8 KiB.");
  return value as DiamondNotificationEnvelopeV1;
}

export const notificationBelongsToViewV1 = (notification: DiamondNotificationV1, view: "home" | "assistant") => view === "home" || notification.eventType === "assistant.reply.completed" || notification.eventType === "assistant.reply.failed" || notification.eventType === "system.internet.offline" || notification.eventType === "system.internet.restored";

// SHA-256 seals provide local integrity, not authentication. Code able to rewrite
// both objects can recompute and reseal both hashes.
