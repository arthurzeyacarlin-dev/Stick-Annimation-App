import {
  STICK_HUMANOID_TEMPLATE_ID,
  STICK_JOINT_ROLES,
  STICK_SEGMENT_ROLE_PAIRS,
  STICK_WAVE_FIXED_POINTS,
  applyStickManualActions,
  canonicalJson,
  cloneCanonical,
  deriveStickPoseId,
  digestCanonical,
  isLowercaseUuidV4,
  isSha256Digest,
  isStickManualWaveApplied,
  isStickPoseId,
  isStickWaveStarter,
  parseStickProjectDocument,
  projectStickAnimationContent,
  type StickContractErrorCodeV1,
  type StickContractResult,
  type StickManualActionV1,
  type StickPoseV1,
  type StickProjectDocumentV1,
} from "../stickfigure/stickProjectContract.ts";
import {
  STICK_AI_CANONICAL_INTENT_V2,
  interpretStickAiPromptV2,
  type StickAiInterpretedIntentV2,
} from "./stickFigureAiIntentMatcher.ts";

export const STICK_AI_CAPABILITY = "stick.pose-sequence.create/v1" as const;
export const STICK_AI_CANONICAL_PROMPT =
  "Create a simple three-pose wave animation with one stick figure at 12 FPS." as const;
export const STICK_AI_NORMALIZED_INTENT =
  "create a simple three-pose wave animation with one stick figure at 12 fps" as const;

export const STICK_AI_CAPABILITY_MANIFEST = {
  manifestVersion: 1,
  capabilities: [STICK_AI_CAPABILITY],
  promptIntentVersion: 1,
  limits: {
    maxActions: 1,
    maxRigs: 1,
    maxFigures: 1,
    maxTargetLayers: 1,
    maxKeyPoses: 3,
    maxTimelineFrames: 12,
    jointsPerPose: 11,
    segmentsPerRig: 10,
    allowedFps: [12],
    promptBytes: 128,
    requestBytes: 16_384,
    providerPlanBytes: 8_192,
    commandBytes: 32_768,
    coordinateSpace: "stick-stage-1920x1080-v1",
    search: "disabled",
    tools: "disabled",
  },
} as const;

export const STICK_AI_CAPABILITY_MANIFEST_V2 = {
  ...STICK_AI_CAPABILITY_MANIFEST,
  manifestVersion: 2,
  promptIntentVersion: 2,
} as const;

export type StickAiErrorCodeV1 =
  | "capability_disabled"
  | "missing_credentials"
  | "temporarily_unavailable"
  | "unsupported_prompt"
  | "unsupported_project_state"
  | "invalid_request"
  | "request_too_large"
  | "unsupported_version"
  | "capability_mismatch"
  | "invalid_provider_output"
  | "provider_refusal"
  | "unsupported_command"
  | "timeout"
  | "network_failure"
  | "aborted"
  | "preview_cancelled"
  | "stale_document"
  | "project_switched"
  | "idempotency_conflict"
  | "concurrency_conflict"
  | "transaction_failed";

export type StickAiContractErrorV1 = {
  code: StickAiErrorCodeV1 | StickContractErrorCodeV1;
  path: string;
  message: string;
};

export type StickAiContractResult<T> =
  | {ok: true; value: T}
  | {ok: false; error: StickAiContractErrorV1};

export type StickAiCapabilityManifestV1 = typeof STICK_AI_CAPABILITY_MANIFEST;
export type StickAiCapabilityManifestV2 = typeof STICK_AI_CAPABILITY_MANIFEST_V2;

export type StickAiProjectContextV1 = {
  kind: "stick-project-context";
  contextVersion: 1;
  schemaVersion: 1;
  projectId: string;
  documentRevision: number;
  baseDocumentDigest: string;
  workspaceType: "stick-figure";
  waveStarterEligible: true;
  coordinateSpace: "stick-stage-1920x1080-v1";
  fps: 12;
  activeLayerId: string;
  layerCount: 1;
  targetRigId: string;
  targetFigureId: string;
  starterPoseId: string;
  figureCount: 1;
  authoredPoseCount: 1;
  timelineFrameCount: 12;
  emptyCellCount: 11;
};

export type StickAiRequestV1 = {
  kind: "stick-ai-request";
  requestVersion: 1;
  requestId: string;
  transactionId: string;
  workspaceType: "stick-figure";
  prompt: string;
  capabilityManifest: StickAiCapabilityManifestV1;
  projectContext: StickAiProjectContextV1;
};

export type StickAiRequestV2 = {
  kind: "stick-ai-request";
  requestVersion: 2;
  requestId: string;
  transactionId: string;
  workspaceType: "stick-figure";
  prompt: string;
  capabilityManifest: StickAiCapabilityManifestV2;
  projectContext: StickAiProjectContextV1;
};

export type StickAiRequest = StickAiRequestV1 | StickAiRequestV2;

export type StickWaveBeatV1 = "ready" | "inward" | "outward";

export type StickWaveProviderPlanV1 = {
  kind: "stick-wave-plan";
  planVersion: 1;
  fps: 12;
  totalFrames: 12;
  poses: Array<{
    beat: StickWaveBeatV1;
    rightElbow: {x: number; y: number};
    rightHand: {x: number; y: number};
  }>;
};

export type StickWaveCommandPoseV1 = {
  sequenceIndex: number;
  beat: StickWaveBeatV1;
  ownerFrameIndex: number;
  pose: StickPoseV1;
};

export type StickWaveCommandV1 = {
  type: "stick.pose-sequence.create";
  actionVersion: 1;
  targetLayerId: string;
  targetRigId: string;
  targetFigureId: string;
  keyframeIndexes: [0, 4, 8];
  holdFramesPerPose: 4;
  frameIds: string[];
  poseEntries: StickWaveCommandPoseV1[];
};

export type StickCommandBatchV1 = {
  kind: "stick-command-batch";
  envelopeVersion: 1;
  commandVersion: 1;
  requestId: string;
  transactionId: string;
  workspaceType: "stick-figure";
  projectId: string;
  baseDocumentRevision: number;
  baseDocumentDigest: string;
  capabilityManifestVersion: 1;
  payloadDigest: string;
  commands: [StickWaveCommandV1];
};

export type StickCommandBatchV2 = Omit<StickCommandBatchV1, "envelopeVersion" | "capabilityManifestVersion"> & {
  envelopeVersion: 2;
  capabilityManifestVersion: 2;
  interpretedIntent: StickAiInterpretedIntentV2;
};

export const STICK_ANIMATION_PLAN_VERSION = 1 as const;
export const STICK_ANIMATION_PLAN_MIN_FRAMES = 8;
export const STICK_ANIMATION_PLAN_MAX_FRAMES = 24;
export const STICK_ANIMATION_PLAN_ALLOWED_FPS = [12, 24] as const;

export type StickAnimationPlanJointV1 = {
  role: (typeof STICK_JOINT_ROLES)[number];
  x: number;
  y: number;
};

export type StickAnimationSetTimingCommandV1 = {
  type: "set_timing";
  commandVersion: 1;
  fps: 12 | 24;
  totalFrameCount: number;
};

export type StickAnimationCreateKeyPoseCommandV1 = {
  type: "create_key_pose";
  commandVersion: 1;
  poseName: string;
  frameIndex: number;
  targetLayerId: string;
  targetRigId: string;
  targetFigureId: string;
  joints: StickAnimationPlanJointV1[];
};

export type StickAnimationHoldPoseCommandV1 = {
  type: "hold_pose";
  commandVersion: 1;
  poseName: string;
  startFrameIndex: number;
  endFrameIndex: number;
};

export type StickAnimationFinishCommandV1 = {
  type: "finish";
  commandVersion: 1;
};

export type StickAnimationPlanCommandV1 =
  | StickAnimationSetTimingCommandV1
  | StickAnimationCreateKeyPoseCommandV1
  | StickAnimationHoldPoseCommandV1
  | StickAnimationFinishCommandV1;

/**
 * SPEC-0004 Phase 1's fixture-only, action-neutral plan.  `poseName` is an
 * opaque local reference; no action label or natural-language token is part
 * of the executable contract.
 */
export type StickAnimationPlanV1 = {
  kind: "stick-animation-plan";
  planVersion: 1;
  requestId: string;
  transactionId: string;
  workspaceType: "stick-figure";
  projectId: string;
  baseDocumentRevision: number;
  baseDocumentDigest: string;
  commands: StickAnimationPlanCommandV1[];
};

export type StickCommandInputV1 = StickCommandBatchV1 | StickAnimationPlanV1;

export type StickCommandResultStatusV1 =
  | "previewed"
  | "applied"
  | "duplicate"
  | "rejected"
  | "failed"
  | "cancelled";

export type StickCommandResultV1 = {
  kind: "stick-command-result";
  resultVersion: 1;
  requestId: string;
  transactionId: string;
  projectId: string;
  envelopeDigest: string;
  status: StickCommandResultStatusV1;
  previousDocumentRevision: number;
  resultingDocumentRevision: number | null;
  mutationCount: number;
  preStateDigest: string;
  candidateDigest: string | null;
  previewSummary: {
    figureCount: 1;
    keyPoseCount: number;
    fps: 12 | 24;
    timelineFrameCount: number;
    durationMs: number;
  } | null;
  error: {code: StickAiErrorCodeV1; message: string} | null;
};

class AiValidationError extends Error {
  readonly detail: StickAiContractErrorV1;

  constructor(code: StickAiContractErrorV1["code"], path: string, message: string) {
    super(message);
    this.name = "AiValidationError";
    this.detail = {code, path, message};
  }
}

const fail = (code: StickAiContractErrorV1["code"], path: string, message: string): never => {
  throw new AiValidationError(code, path, message);
};

const capture = <T>(operation: () => T): StickAiContractResult<T> => {
  try {
    return {ok: true, value: operation()};
  } catch (error) {
    if (error instanceof AiValidationError) return {ok: false, error: error.detail};
    throw error;
  }
};

const captureAsync = async <T>(operation: () => Promise<T>): Promise<StickAiContractResult<T>> => {
  try {
    return {ok: true, value: await operation()};
  } catch (error) {
    if (error instanceof AiValidationError) return {ok: false, error: error.detail};
    throw error;
  }
};

const isPlainObject = (value: unknown): value is Record<string, unknown> => {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
};

const object = (value: unknown, keys: readonly string[], path: string) => {
  if (!isPlainObject(value)) return fail("invalid_request", path, "Expected a plain object.");
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== "string" || !keys.includes(key)) {
      return fail("invalid_request", `${path}.${String(key)}`, "Unknown field.");
    }
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !("value" in descriptor)) return fail("invalid_request", `${path}.${key}`, "Accessors are not allowed.");
  }
  for (const key of keys) {
    if (!Object.prototype.hasOwnProperty.call(value, key)) {
      return fail("invalid_request", `${path}.${key}`, "Missing field.");
    }
  }
  return value;
};

const array = (value: unknown, path: string) => {
  if (!Array.isArray(value)) return fail("invalid_request", path, "Expected an array.");
  for (let index = 0; index < value.length; index += 1) {
    if (!Object.prototype.hasOwnProperty.call(value, index)) {
      return fail("invalid_request", `${path}[${index}]`, "Sparse arrays are not allowed.");
    }
  }
  const extras = Reflect.ownKeys(value).filter((key) => {
    if (key === "length") return false;
    return typeof key !== "string" || !/^(0|[1-9][0-9]*)$/.test(key) || Number(key) >= value.length;
  });
  if (extras.length > 0) return fail("invalid_request", path, "Arrays may have indexed values only.");
  return value;
};

const literal = <T extends string | number | boolean | null>(value: unknown, expected: T, path: string): T => {
  if (value !== expected) {
    const code = path.toLowerCase().includes("version") ? "unsupported_version" : "invalid_request";
    return fail(code, path, `Expected ${JSON.stringify(expected)}.`);
  }
  return expected;
};

const integer = (value: unknown, path: string, min = 0, max = Number.MAX_SAFE_INTEGER) => {
  if (typeof value !== "number" || !Number.isFinite(value)) return fail("invalid_request", path, "Expected a finite number.");
  if (!Number.isSafeInteger(value) || Object.is(value, -0) || value < min || value > max) {
    return fail("invalid_request", path, "Expected a safe integer in range.");
  }
  return value;
};

const uuid = (value: unknown, path: string) => {
  if (!isLowercaseUuidV4(value)) return fail("invalid_request", path, "Expected a lowercase UUID v4.");
  return value;
};

const digest = (value: unknown, path: string) => {
  if (!isSha256Digest(value)) return fail("invalid_request", path, "Expected a SHA-256 digest.");
  return value;
};

const text = (value: unknown, path: string) => {
  if (typeof value !== "string") return fail("invalid_request", path, "Expected a string.");
  return value;
};

const equalCanonical = (left: unknown, right: unknown) => canonicalJson(left) === canonicalJson(right);

export const normalizeStickAiPrompt = (rawPrompt: unknown): StickAiContractResult<typeof STICK_AI_NORMALIZED_INTENT> =>
  capture(() => {
    if (typeof rawPrompt !== "string") return fail("unsupported_prompt", "$prompt", "Prompt must be a string.");
    for (let index = 0; index < rawPrompt.length; index += 1) {
      const code = rawPrompt.charCodeAt(index);
      if (code >= 0xd800 && code <= 0xdbff) {
        const next = rawPrompt.charCodeAt(index + 1);
        if (!(next >= 0xdc00 && next <= 0xdfff)) return fail("unsupported_prompt", "$prompt", "Prompt is not well-formed UTF-16.");
        index += 1;
      } else if (code >= 0xdc00 && code <= 0xdfff) {
        return fail("unsupported_prompt", "$prompt", "Prompt is not well-formed UTF-16.");
      }
    }
    if (new TextEncoder().encode(rawPrompt).byteLength > 128) {
      return fail("unsupported_prompt", "$prompt", "Prompt exceeds 128 UTF-8 bytes.");
    }
    let normalized = rawPrompt.normalize("NFC");
    normalized = normalized.replace(/^[ \t\r\n\f]+|[ \t\r\n\f]+$/g, "");
    normalized = normalized.replace(/[ \t\r\n\f]+/g, " ");
    normalized = normalized.replace(/[A-Z]/g, (letter) => letter.toLowerCase());
    if (/fps[.!?]$/.test(normalized)) normalized = normalized.slice(0, -1);
    if (/[.!?]/.test(normalized) || normalized !== STICK_AI_NORMALIZED_INTENT) {
      return fail("unsupported_prompt", "$prompt", "Prompt does not match the supported V1 intent.");
    }
    return STICK_AI_NORMALIZED_INTENT;
  });

const parseManifest = (value: unknown): StickAiCapabilityManifestV1 | StickAiCapabilityManifestV2 => {
  const root = object(value, ["manifestVersion", "capabilities", "promptIntentVersion", "limits"], "$request.capabilityManifest");
  const limits = object(
    root.limits,
    [
      "maxActions", "maxRigs", "maxFigures", "maxTargetLayers", "maxKeyPoses", "maxTimelineFrames",
      "jointsPerPose", "segmentsPerRig", "allowedFps", "promptBytes", "requestBytes", "providerPlanBytes",
      "commandBytes", "coordinateSpace", "search", "tools",
    ],
    "$request.capabilityManifest.limits",
  );
  const manifestVersion = integer(root.manifestVersion, "$request.capabilityManifest.manifestVersion", 1, 2);
  if (!(manifestVersion === 1 || manifestVersion === 2)) {
    return fail("unsupported_version", "$request.capabilityManifest.manifestVersion", "Unsupported capability manifest version.");
  }
  const parsed = {
    manifestVersion,
    capabilities: array(root.capabilities, "$request.capabilityManifest.capabilities").map((entry, index) =>
      literal(entry, STICK_AI_CAPABILITY, `$request.capabilityManifest.capabilities[${index}]`),
    ),
    promptIntentVersion: integer(root.promptIntentVersion, "$request.capabilityManifest.promptIntentVersion", 1, 2),
    limits: {
      maxActions: integer(limits.maxActions, "$request.capabilityManifest.limits.maxActions"),
      maxRigs: integer(limits.maxRigs, "$request.capabilityManifest.limits.maxRigs"),
      maxFigures: integer(limits.maxFigures, "$request.capabilityManifest.limits.maxFigures"),
      maxTargetLayers: integer(limits.maxTargetLayers, "$request.capabilityManifest.limits.maxTargetLayers"),
      maxKeyPoses: integer(limits.maxKeyPoses, "$request.capabilityManifest.limits.maxKeyPoses"),
      maxTimelineFrames: integer(limits.maxTimelineFrames, "$request.capabilityManifest.limits.maxTimelineFrames"),
      jointsPerPose: integer(limits.jointsPerPose, "$request.capabilityManifest.limits.jointsPerPose"),
      segmentsPerRig: integer(limits.segmentsPerRig, "$request.capabilityManifest.limits.segmentsPerRig"),
      allowedFps: array(limits.allowedFps, "$request.capabilityManifest.limits.allowedFps").map((entry, index) =>
        integer(entry, `$request.capabilityManifest.limits.allowedFps[${index}]`),
      ),
      promptBytes: integer(limits.promptBytes, "$request.capabilityManifest.limits.promptBytes"),
      requestBytes: integer(limits.requestBytes, "$request.capabilityManifest.limits.requestBytes"),
      providerPlanBytes: integer(limits.providerPlanBytes, "$request.capabilityManifest.limits.providerPlanBytes"),
      commandBytes: integer(limits.commandBytes, "$request.capabilityManifest.limits.commandBytes"),
      coordinateSpace: text(limits.coordinateSpace, "$request.capabilityManifest.limits.coordinateSpace"),
      search: text(limits.search, "$request.capabilityManifest.limits.search"),
      tools: text(limits.tools, "$request.capabilityManifest.limits.tools"),
    },
  };
  const expected = manifestVersion === 1 ? STICK_AI_CAPABILITY_MANIFEST : STICK_AI_CAPABILITY_MANIFEST_V2;
  if (!equalCanonical(parsed, expected)) {
    return fail("capability_mismatch", "$request.capabilityManifest", `Capability manifest does not exactly match V${manifestVersion}.`);
  }
  return cloneCanonical(expected);
};

const parseProjectContext = (value: unknown): StickAiProjectContextV1 => {
  const root = object(
    value,
    [
      "kind", "contextVersion", "schemaVersion", "projectId", "documentRevision", "baseDocumentDigest",
      "workspaceType", "waveStarterEligible", "coordinateSpace", "fps", "activeLayerId", "layerCount",
      "targetRigId", "targetFigureId", "starterPoseId", "figureCount", "authoredPoseCount",
      "timelineFrameCount", "emptyCellCount",
    ],
    "$request.projectContext",
  );
  return {
    kind: literal(root.kind, "stick-project-context", "$request.projectContext.kind"),
    contextVersion: literal(root.contextVersion, 1, "$request.projectContext.contextVersion"),
    schemaVersion: literal(root.schemaVersion, 1, "$request.projectContext.schemaVersion"),
    projectId: uuid(root.projectId, "$request.projectContext.projectId"),
    documentRevision: integer(root.documentRevision, "$request.projectContext.documentRevision"),
    baseDocumentDigest: digest(root.baseDocumentDigest, "$request.projectContext.baseDocumentDigest"),
    workspaceType: literal(root.workspaceType, "stick-figure", "$request.projectContext.workspaceType"),
    waveStarterEligible: literal(root.waveStarterEligible, true, "$request.projectContext.waveStarterEligible"),
    coordinateSpace: literal(root.coordinateSpace, "stick-stage-1920x1080-v1", "$request.projectContext.coordinateSpace"),
    fps: literal(root.fps, 12, "$request.projectContext.fps"),
    activeLayerId: uuid(root.activeLayerId, "$request.projectContext.activeLayerId"),
    layerCount: literal(root.layerCount, 1, "$request.projectContext.layerCount"),
    targetRigId: uuid(root.targetRigId, "$request.projectContext.targetRigId"),
    targetFigureId: uuid(root.targetFigureId, "$request.projectContext.targetFigureId"),
    starterPoseId: uuid(root.starterPoseId, "$request.projectContext.starterPoseId"),
    figureCount: literal(root.figureCount, 1, "$request.projectContext.figureCount"),
    authoredPoseCount: literal(root.authoredPoseCount, 1, "$request.projectContext.authoredPoseCount"),
    timelineFrameCount: literal(root.timelineFrameCount, 12, "$request.projectContext.timelineFrameCount"),
    emptyCellCount: literal(root.emptyCellCount, 11, "$request.projectContext.emptyCellCount"),
  };
};

export const buildStickAiProjectContext = async (
  documentInput: StickProjectDocumentV1,
): Promise<StickAiContractResult<StickAiProjectContextV1>> =>
  captureAsync(async () => {
    const parsed = parseStickProjectDocument(documentInput);
    if (!parsed.ok) return fail(parsed.error.code, parsed.error.path, parsed.error.message);
    const document = parsed.value;
    if (!isStickWaveStarter(document)) return fail("unsupported_project_state", "$document", "Document is not the exact wave starter.");
    const first = document.layers[0].cells[0];
    if (first.cellType !== "keyframe" || first.poses.length !== 1) {
      return fail("unsupported_project_state", "$document", "Starter pose is missing.");
    }
    return {
      kind: "stick-project-context",
      contextVersion: 1,
      schemaVersion: 1,
      projectId: document.projectId,
      documentRevision: 0,
      baseDocumentDigest: await digestCanonical(document),
      workspaceType: "stick-figure",
      waveStarterEligible: true,
      coordinateSpace: "stick-stage-1920x1080-v1",
      fps: 12,
      activeLayerId: document.layers[0].layerId,
      layerCount: 1,
      targetRigId: document.rigs[0].rigId,
      targetFigureId: document.figures[0].figureId,
      starterPoseId: first.poses[0].poseId,
      figureCount: 1,
      authoredPoseCount: 1,
      timelineFrameCount: 12,
      emptyCellCount: 11,
    };
  });

export const parseStickAiRequest = (
  value: unknown,
  expectedStarter?: StickProjectDocumentV1,
): StickAiContractResult<StickAiRequest> =>
  capture(() => {
    if (new TextEncoder().encode(canonicalJson(value)).byteLength > 16_384) {
      return fail("request_too_large", "$request", "Canonical request exceeds 16 KiB.");
    }
    const root = object(
      value,
      ["kind", "requestVersion", "requestId", "transactionId", "workspaceType", "prompt", "capabilityManifest", "projectContext"],
      "$request",
    );
    const prompt = text(root.prompt, "$request.prompt");
    const requestVersion = integer(root.requestVersion, "$request.requestVersion", 1, 2);
    if (!(requestVersion === 1 || requestVersion === 2)) {
      return fail("unsupported_version", "$request.requestVersion", "Unsupported Stick AI request version.");
    }
    if (requestVersion === 1) {
      const normalized = normalizeStickAiPrompt(prompt);
      if (!normalized.ok) return fail(normalized.error.code, normalized.error.path, normalized.error.message);
    } else {
      const interpreted = interpretStickAiPromptV2(prompt);
      if (!interpreted.ok) return fail("unsupported_prompt", "$request.prompt", interpreted.error.reason);
    }
    const manifest = parseManifest(root.capabilityManifest);
    if (manifest.manifestVersion !== requestVersion || manifest.promptIntentVersion !== requestVersion) {
      return requestVersion === 2 && manifest.manifestVersion === 1
        ? fail("unsupported_version", "$request.requestVersion", "A V2 request requires the V2 capability manifest.")
        : fail("capability_mismatch", "$request.capabilityManifest", "Request and manifest versions must match exactly.");
    }
    const request = {
      kind: literal(root.kind, "stick-ai-request", "$request.kind"),
      requestVersion,
      requestId: uuid(root.requestId, "$request.requestId"),
      transactionId: uuid(root.transactionId, "$request.transactionId"),
      workspaceType: literal(root.workspaceType, "stick-figure", "$request.workspaceType"),
      prompt,
      capabilityManifest: manifest,
      projectContext: parseProjectContext(root.projectContext),
    } as StickAiRequest;
    if (expectedStarter) {
      const parsed = parseStickProjectDocument(expectedStarter);
      if (!parsed.ok || !isStickWaveStarter(parsed.value)) {
        return fail("unsupported_project_state", "$document", "Expected document is not the exact starter.");
      }
      const document = parsed.value;
      const first = document.layers[0].cells[0];
      if (first.cellType !== "keyframe" || first.poses.length !== 1) return fail("unsupported_project_state", "$document", "Starter pose is missing.");
      const context = request.projectContext;
      const matches =
        context.projectId === document.projectId &&
        context.documentRevision === document.documentRevision &&
        context.activeLayerId === document.layers[0].layerId &&
        context.targetRigId === document.rigs[0].rigId &&
        context.targetFigureId === document.figures[0].figureId &&
        context.starterPoseId === first.poses[0].poseId;
      if (!matches) return fail("unsupported_project_state", "$request.projectContext", "Project context does not match the starter.");
    }
    return request;
  });

const parseArmPoint = (value: unknown, path: string) => {
  const point = object(value, ["x", "y"], path);
  return {x: integer(point.x, `${path}.x`, 100, 1820), y: integer(point.y, `${path}.y`, 100, 980)};
};

const squaredDistance = (a: {x: number; y: number}, b: {x: number; y: number}) =>
  (a.x - b.x) ** 2 + (a.y - b.y) ** 2;

type StickWaveArmPose = {
  rightElbow: {x: number; y: number};
  rightHand: {x: number; y: number};
};

const enforceStickWaveArmSafety = (
  poses: readonly StickWaveArmPose[],
  errorCode: "invalid_provider_output" | "unsupported_command",
  pathForPose: (index: number) => string,
) => {
  const neck = STICK_WAVE_FIXED_POINTS.neck;
  for (const [index, pose] of poses.entries()) {
    const posePath = pathForPose(index);
    for (const [name, point] of [["rightElbow", pose.rightElbow], ["rightHand", pose.rightHand]] as const) {
      if (point.x < 100 || point.x > 1820 || point.y < 100 || point.y > 980) {
        fail(errorCode, `${posePath}.${name}`, "Right-arm coordinates are outside V1 bounds.");
      }
    }
    const elbowLength = squaredDistance(neck, pose.rightElbow);
    const forearmLength = squaredDistance(pose.rightElbow, pose.rightHand);
    if (elbowLength < 100 ** 2 || elbowLength > 260 ** 2 || forearmLength < 80 ** 2 || forearmLength > 240 ** 2) {
      fail(errorCode, posePath, "Right-arm geometry is outside V1 bounds.");
    }
    if (pose.rightHand.y < 200 || pose.rightHand.y > 420) {
      fail(errorCode, `${posePath}.rightHand.y`, "Hand height is outside V1 bounds.");
    }
  }
  if (poses[0].rightHand.x < 1080 || poses[0].rightHand.x > 1240) {
    fail(errorCode, `${pathForPose(0)}.rightHand.x`, "Ready hand is outside V1 bounds.");
  }
  if (poses[1].rightHand.x < 980 || poses[1].rightHand.x > 1100 || poses[1].rightHand.y > 380) {
    fail(errorCode, `${pathForPose(1)}.rightHand`, "Inward hand is outside V1 bounds.");
  }
  if (poses[2].rightHand.x < poses[1].rightHand.x + 120 || poses[2].rightHand.x > 1280 || poses[2].rightHand.y > 380) {
    fail(errorCode, `${pathForPose(2)}.rightHand`, "Outward hand is outside V1 bounds.");
  }
  for (let left = 0; left < poses.length; left += 1) {
    for (let right = left + 1; right < poses.length; right += 1) {
      if (squaredDistance(poses[left].rightHand, poses[right].rightHand) < 80 ** 2) {
        fail(errorCode, pathForPose(left).replace(/\[\d+\]$/, ""), "Right-hand beats are too close together.");
      }
    }
  }
};

export const parseStickWaveProviderPlan = (value: unknown): StickAiContractResult<StickWaveProviderPlanV1> =>
  capture(() => {
    if (new TextEncoder().encode(canonicalJson(value)).byteLength > 8_192) {
      return fail("invalid_provider_output", "$plan", "Provider plan exceeds 8 KiB.");
    }
    const root = object(value, ["kind", "planVersion", "fps", "totalFrames", "poses"], "$plan");
    const entries = array(root.poses, "$plan.poses");
    if (entries.length !== 3) return fail("invalid_provider_output", "$plan.poses", "Exactly three beats are required.");
    const expectedBeats = ["ready", "inward", "outward"] as const;
    const poses = entries.map((entry, index) => {
      const path = `$plan.poses[${index}]`;
      const pose = object(entry, ["beat", "rightElbow", "rightHand"], path);
      return {
        beat: literal(pose.beat, expectedBeats[index], `${path}.beat`),
        rightElbow: parseArmPoint(pose.rightElbow, `${path}.rightElbow`),
        rightHand: parseArmPoint(pose.rightHand, `${path}.rightHand`),
      };
    });
    enforceStickWaveArmSafety(poses, "invalid_provider_output", (index) => `$plan.poses[${index}]`);
    return {
      kind: literal(root.kind, "stick-wave-plan", "$plan.kind"),
      planVersion: literal(root.planVersion, 1, "$plan.planVersion"),
      fps: literal(root.fps, 12, "$plan.fps"),
      totalFrames: literal(root.totalFrames, 12, "$plan.totalFrames"),
      poses,
    };
  });

const poseWithArm = (
  starter: StickProjectDocumentV1,
  sourcePose: StickPoseV1,
  poseId: string,
  rightElbow: {x: number; y: number},
  rightHand: {x: number; y: number},
): StickPoseV1 => {
  const pose = cloneCanonical(sourcePose);
  pose.poseId = poseId;
  const rig = starter.rigs[0];
  for (const role of STICK_JOINT_ROLES) {
    const jointIndex = rig.joints.findIndex((joint) => joint.role === role);
    const expected = role === "rightElbow" ? rightElbow : role === "rightHand" ? rightHand : STICK_WAVE_FIXED_POINTS[role as keyof typeof STICK_WAVE_FIXED_POINTS];
    if (expected) pose.points[jointIndex] = {...pose.points[jointIndex], ...expected};
  }
  return pose;
};

export const materializeStickWaveCommandBatch = async (
  starterInput: StickProjectDocumentV1,
  requestInput: StickAiRequest,
  planInput: StickWaveProviderPlanV1,
): Promise<StickAiContractResult<StickCommandBatchV1>> =>
  captureAsync(async () => {
    const starterResult = parseStickProjectDocument(starterInput);
    if (!starterResult.ok) return fail(starterResult.error.code, starterResult.error.path, starterResult.error.message);
    const starter = starterResult.value;
    if (!isStickWaveStarter(starter)) return fail("unsupported_project_state", "$document", "Document is not the exact starter.");
    const requestResult = parseStickAiRequest(requestInput, starter);
    if (!requestResult.ok) return fail(requestResult.error.code, requestResult.error.path, requestResult.error.message);
    const planResult = parseStickWaveProviderPlan(planInput);
    if (!planResult.ok) return fail(planResult.error.code, planResult.error.path, planResult.error.message);
    const request = requestResult.value;
    const plan = planResult.value;
    if (request.projectContext.baseDocumentDigest !== await digestCanonical(starter)) {
      return fail("stale_document", "$request.projectContext.baseDocumentDigest", "Base digest does not match starter.");
    }
    const firstCell = starter.layers[0].cells[0];
    if (firstCell.cellType !== "keyframe" || firstCell.poses.length !== 1) return fail("unsupported_project_state", "$document", "Starter pose is missing.");
    const poseIds = [
      firstCell.poses[0].poseId,
      await deriveStickPoseId(starter.projectId, request.transactionId, "pose:1"),
      await deriveStickPoseId(starter.projectId, request.transactionId, "pose:2"),
    ];
    const ownerIndexes = [0, 4, 8] as const;
    const poseEntries = plan.poses.map((entry, index): StickWaveCommandPoseV1 => ({
      sequenceIndex: index,
      beat: entry.beat,
      ownerFrameIndex: ownerIndexes[index],
      pose: poseWithArm(starter, firstCell.poses[0], poseIds[index], entry.rightElbow, entry.rightHand),
    }));
    const command: StickWaveCommandV1 = {
      type: "stick.pose-sequence.create",
      actionVersion: 1,
      targetLayerId: starter.layers[0].layerId,
      targetRigId: starter.rigs[0].rigId,
      targetFigureId: starter.figures[0].figureId,
      keyframeIndexes: [0, 4, 8],
      holdFramesPerPose: 4,
      frameIds: starter.layers[0].cells.map((cell) => cell.frameId),
      poseEntries,
    };
    const envelopeV1: StickCommandBatchV1 = {
      kind: "stick-command-batch",
      envelopeVersion: 1,
      commandVersion: 1,
      requestId: request.requestId,
      transactionId: request.transactionId,
      workspaceType: "stick-figure",
      projectId: starter.projectId,
      baseDocumentRevision: starter.documentRevision,
      baseDocumentDigest: request.projectContext.baseDocumentDigest,
      capabilityManifestVersion: 1,
      payloadDigest: await digestCanonical([command]),
      commands: [command],
    };
    const envelope = request.requestVersion === 1
      ? envelopeV1
      : ({
          ...envelopeV1,
          envelopeVersion: 2,
          capabilityManifestVersion: 2,
          interpretedIntent: {...STICK_AI_CANONICAL_INTENT_V2},
        } satisfies StickCommandBatchV2);
    if (new TextEncoder().encode(canonicalJson(envelope)).byteLength > 32_768) {
      return fail("unsupported_command", "$envelope", "Command envelope exceeds 32 KiB.");
    }
    return envelope as unknown as StickCommandBatchV1;
  });

const parseCommandPose = (value: unknown, path: string, starter: StickProjectDocumentV1): StickWaveCommandPoseV1 => {
  const root = object(value, ["sequenceIndex", "beat", "ownerFrameIndex", "pose"], path);
  const parsedPose = parseStickProjectDocument({
    ...starter,
    layers: [{...starter.layers[0], cells: [{...starter.layers[0].cells[0], cellType: "keyframe", poses: [root.pose]}]}],
  });
  if (!parsedPose.ok) return fail(parsedPose.error.code, `${path}.pose${parsedPose.error.path.slice(1)}`, parsedPose.error.message);
  const cell = parsedPose.value.layers[0].cells[0];
  if (cell.cellType !== "keyframe" || cell.poses.length !== 1) return fail("unsupported_command", `${path}.pose`, "Pose is missing.");
  const beat = text(root.beat, `${path}.beat`);
  if (!(beat === "ready" || beat === "inward" || beat === "outward")) return fail("unsupported_command", `${path}.beat`, "Unknown beat.");
  return {
    sequenceIndex: integer(root.sequenceIndex, `${path}.sequenceIndex`, 0, 2),
    beat,
    ownerFrameIndex: integer(root.ownerFrameIndex, `${path}.ownerFrameIndex`, 0, 11),
    pose: cell.poses[0],
  };
};

export const parseStickCommandBatch = async (
  value: unknown,
  starterInput: StickProjectDocumentV1,
): Promise<StickAiContractResult<StickCommandBatchV1>> =>
  captureAsync(async () => {
    if (new TextEncoder().encode(canonicalJson(value)).byteLength > 32_768) return fail("unsupported_command", "$envelope", "Command exceeds 32 KiB.");
    const starterResult = parseStickProjectDocument(starterInput);
    if (!starterResult.ok || !isStickWaveStarter(starterResult.value)) return fail("unsupported_project_state", "$document", "Document is not starter eligible.");
    const starter = starterResult.value;
    if (!isPlainObject(value)) return fail("invalid_request", "$envelope", "Expected a plain object.");
    const envelopeVersion = integer(value.envelopeVersion, "$envelope.envelopeVersion", 1, 2);
    if (!(envelopeVersion === 1 || envelopeVersion === 2)) {
      return fail("unsupported_version", "$envelope.envelopeVersion", "Unsupported command envelope version.");
    }
    if (envelopeVersion === 2 && value.capabilityManifestVersion === 1 && !("interpretedIntent" in value)) {
      return fail("unsupported_version", "$envelope.envelopeVersion", "A V2 envelope requires the complete V2 contract.");
    }
    const root = object(
      value,
      envelopeVersion === 1
        ? ["kind", "envelopeVersion", "commandVersion", "requestId", "transactionId", "workspaceType", "projectId", "baseDocumentRevision", "baseDocumentDigest", "capabilityManifestVersion", "payloadDigest", "commands"]
        : ["kind", "envelopeVersion", "commandVersion", "requestId", "transactionId", "workspaceType", "projectId", "baseDocumentRevision", "baseDocumentDigest", "capabilityManifestVersion", "interpretedIntent", "payloadDigest", "commands"],
      "$envelope",
    );
    const commands = array(root.commands, "$envelope.commands");
    if (commands.length !== 1) return fail("unsupported_command", "$envelope.commands", "Exactly one command is required.");
    const commandValue = object(
      commands[0],
      ["type", "actionVersion", "targetLayerId", "targetRigId", "targetFigureId", "keyframeIndexes", "holdFramesPerPose", "frameIds", "poseEntries"],
      "$envelope.commands[0]",
    );
    const keyframeIndexes = array(commandValue.keyframeIndexes, "$envelope.commands[0].keyframeIndexes").map((entry, index) => integer(entry, `$envelope.commands[0].keyframeIndexes[${index}]`));
    const frameIds = array(commandValue.frameIds, "$envelope.commands[0].frameIds").map((entry, index) => uuid(entry, `$envelope.commands[0].frameIds[${index}]`));
    const poseEntries = array(commandValue.poseEntries, "$envelope.commands[0].poseEntries").map((entry, index) =>
      parseCommandPose(entry, `$envelope.commands[0].poseEntries[${index}]`, starter),
    );
    const command: StickWaveCommandV1 = {
      type: literal(commandValue.type, "stick.pose-sequence.create", "$envelope.commands[0].type"),
      actionVersion: literal(commandValue.actionVersion, 1, "$envelope.commands[0].actionVersion"),
      targetLayerId: uuid(commandValue.targetLayerId, "$envelope.commands[0].targetLayerId"),
      targetRigId: uuid(commandValue.targetRigId, "$envelope.commands[0].targetRigId"),
      targetFigureId: uuid(commandValue.targetFigureId, "$envelope.commands[0].targetFigureId"),
      keyframeIndexes: keyframeIndexes as [0, 4, 8],
      holdFramesPerPose: literal(commandValue.holdFramesPerPose, 4, "$envelope.commands[0].holdFramesPerPose"),
      frameIds,
      poseEntries,
    };
    const baseEnvelope: StickCommandBatchV1 = {
      kind: literal(root.kind, "stick-command-batch", "$envelope.kind"),
      envelopeVersion: 1,
      commandVersion: literal(root.commandVersion, 1, "$envelope.commandVersion"),
      requestId: uuid(root.requestId, "$envelope.requestId"),
      transactionId: uuid(root.transactionId, "$envelope.transactionId"),
      workspaceType: literal(root.workspaceType, "stick-figure", "$envelope.workspaceType"),
      projectId: uuid(root.projectId, "$envelope.projectId"),
      baseDocumentRevision: integer(root.baseDocumentRevision, "$envelope.baseDocumentRevision"),
      baseDocumentDigest: digest(root.baseDocumentDigest, "$envelope.baseDocumentDigest"),
      capabilityManifestVersion: 1,
      payloadDigest: digest(root.payloadDigest, "$envelope.payloadDigest"),
      commands: [command],
    };
    const envelope = envelopeVersion === 1
      ? (() => {
          literal(root.capabilityManifestVersion, 1, "$envelope.capabilityManifestVersion");
          return baseEnvelope;
        })()
      : (() => {
          literal(root.capabilityManifestVersion, 2, "$envelope.capabilityManifestVersion");
          if (!equalCanonical(root.interpretedIntent, STICK_AI_CANONICAL_INTENT_V2)) {
            return fail("unsupported_command", "$envelope.interpretedIntent", "Server interpreted intent is not canonical V2.");
          }
          return {
            ...baseEnvelope,
            envelopeVersion: 2,
            capabilityManifestVersion: 2,
            interpretedIntent: {...STICK_AI_CANONICAL_INTENT_V2},
          } satisfies StickCommandBatchV2;
        })();
    const expectedTuples = [[0, "ready", 0], [1, "inward", 4], [2, "outward", 8]] as const;
    const first = starter.layers[0].cells[0];
    if (first.cellType !== "keyframe" || first.poses.length !== 1) return fail("unsupported_project_state", "$document", "Starter pose missing.");
    const expectedPoseIds = [
      first.poses[0].poseId,
      await deriveStickPoseId(starter.projectId, envelope.transactionId, "pose:1"),
      await deriveStickPoseId(starter.projectId, envelope.transactionId, "pose:2"),
    ];
    const identityMatches =
      envelope.projectId === starter.projectId &&
      envelope.baseDocumentRevision === 0 &&
      envelope.baseDocumentDigest === await digestCanonical(starter) &&
      command.targetLayerId === starter.layers[0].layerId &&
      command.targetRigId === starter.rigs[0].rigId &&
      command.targetFigureId === starter.figures[0].figureId &&
      equalCanonical(command.keyframeIndexes, [0, 4, 8]) &&
      equalCanonical(command.frameIds, starter.layers[0].cells.map((cell) => cell.frameId));
    if (!identityMatches) return fail("unsupported_command", "$envelope.commands[0]", "Command does not preserve starter identities.");
    if (poseEntries.length !== 3) return fail("unsupported_command", "$envelope.commands[0].poseEntries", "Exactly three poses are required.");
    for (const [index, entry] of poseEntries.entries()) {
      const tuple = expectedTuples[index];
      if (entry.sequenceIndex !== tuple[0] || entry.beat !== tuple[1] || entry.ownerFrameIndex !== tuple[2]) {
        return fail("unsupported_command", `$envelope.commands[0].poseEntries[${index}]`, "Command pose tuple is invalid.");
      }
      if (!isStickPoseId(entry.pose.poseId) || entry.pose.poseId !== expectedPoseIds[index]) {
        return fail("unsupported_command", `$envelope.commands[0].poseEntries[${index}].pose.poseId`, "Pose ID is invalid.");
      }
      if (entry.pose.figureId !== starter.figures[0].figureId || entry.pose.rigId !== starter.rigs[0].rigId) {
        return fail("unsupported_command", `$envelope.commands[0].poseEntries[${index}].pose`, "Pose binding changed.");
      }
      const pointMap = new Map(starter.rigs[0].joints.map((joint, pointIndex) => [joint.role, entry.pose.points[pointIndex]]));
      for (const [role, expectedPoint] of Object.entries(STICK_WAVE_FIXED_POINTS)) {
        const actual = pointMap.get(role as (typeof STICK_JOINT_ROLES)[number]);
        if (!actual || actual.x !== expectedPoint.x || actual.y !== expectedPoint.y) {
          return fail("unsupported_command", `$envelope.commands[0].poseEntries[${index}].pose.points`, "Fixed body point changed.");
        }
      }
    }
    enforceStickWaveArmSafety(
      poseEntries.map((entry) => ({
        rightElbow: entry.pose.points[STICK_JOINT_ROLES.indexOf("rightElbow")],
        rightHand: entry.pose.points[STICK_JOINT_ROLES.indexOf("rightHand")],
      })),
      "unsupported_command",
      (index) => `$envelope.commands[0].poseEntries[${index}].pose`,
    );
    if (envelope.payloadDigest !== await digestCanonical([command])) return fail("unsupported_command", "$envelope.payloadDigest", "Payload digest mismatch.");
    return envelope as unknown as StickCommandBatchV1;
  });

const planCommandType = (value: unknown, path: string) => {
  if (!isPlainObject(value)) return fail("invalid_request", path, "Expected a plain command object.");
  const descriptor = Object.getOwnPropertyDescriptor(value, "type");
  if (!descriptor || !("value" in descriptor) || typeof descriptor.value !== "string") {
    return fail("invalid_request", `${path}.type`, "A command type is required.");
  }
  return descriptor.value;
};

const parsePlanPoseName = (value: unknown, path: string) => {
  const name = text(value, path);
  if (!/^[a-z][a-z0-9_-]{0,31}$/.test(name)) {
    return fail("unsupported_command", path, "Pose names must be bounded lowercase opaque identifiers.");
  }
  return name;
};

/** Strict parser for the action-neutral SPEC-0004 Phase 1 fixture plan. */
export const parseStickAnimationPlan = async (
  value: unknown,
  starterInput: StickProjectDocumentV1,
): Promise<StickAiContractResult<StickAnimationPlanV1>> =>
  captureAsync(async () => {
    if (new TextEncoder().encode(canonicalJson(value)).byteLength > 32_768) {
      return fail("unsupported_command", "$plan", "Plan exceeds 32 KiB.");
    }
    const starterResult = parseStickProjectDocument(starterInput);
    if (!starterResult.ok || !isStickWaveStarter(starterResult.value)) {
      return fail("unsupported_project_state", "$document", "Document is not the exact fresh one-figure starter.");
    }
    const starter = starterResult.value;
    const root = object(
      value,
      [
        "kind", "planVersion", "requestId", "transactionId", "workspaceType", "projectId",
        "baseDocumentRevision", "baseDocumentDigest", "commands",
      ],
      "$plan",
    );
    const commandsInput = array(root.commands, "$plan.commands");
    if (commandsInput.length < 3 || commandsInput.length > 50) {
      return fail("unsupported_command", "$plan.commands", "Plan command count is outside the Phase 1 bound.");
    }

    const plan: StickAnimationPlanV1 = {
      kind: literal(root.kind, "stick-animation-plan", "$plan.kind"),
      planVersion: literal(root.planVersion, STICK_ANIMATION_PLAN_VERSION, "$plan.planVersion"),
      requestId: uuid(root.requestId, "$plan.requestId"),
      transactionId: uuid(root.transactionId, "$plan.transactionId"),
      workspaceType: literal(root.workspaceType, "stick-figure", "$plan.workspaceType"),
      projectId: uuid(root.projectId, "$plan.projectId"),
      baseDocumentRevision: integer(root.baseDocumentRevision, "$plan.baseDocumentRevision"),
      baseDocumentDigest: digest(root.baseDocumentDigest, "$plan.baseDocumentDigest"),
      commands: [],
    };
    if (plan.projectId !== starter.projectId) {
      return fail("unsupported_command", "$plan.projectId", "Plan project identity does not match the starter.");
    }
    if (plan.baseDocumentRevision !== starter.documentRevision) {
      return fail("stale_document", "$plan.baseDocumentRevision", "Plan document revision is stale.");
    }
    if (plan.baseDocumentDigest !== await digestCanonical(starter)) {
      return fail("stale_document", "$plan.baseDocumentDigest", "Plan document digest is stale.");
    }

    let timing: StickAnimationSetTimingCommandV1 | null = null;
    let coverageCursor = 0;
    let activePoseName: string | null = null;
    let finishCount = 0;
    const poseNames = new Set<string>();
    const poseIndexes = new Set<number>();
    const heldPoseNames = new Set<string>();

    for (const [commandIndex, commandInput] of commandsInput.entries()) {
      const path = `$plan.commands[${commandIndex}]`;
      const type = planCommandType(commandInput, path);
      if (type === "set_timing") {
        const command = object(commandInput, ["type", "commandVersion", "fps", "totalFrameCount"], path);
        if (commandIndex !== 0 || timing !== null) {
          return fail("unsupported_command", path, "set_timing must appear exactly once and first.");
        }
        const fps = integer(command.fps, `${path}.fps`, 12, 24);
        if (!(STICK_ANIMATION_PLAN_ALLOWED_FPS as readonly number[]).includes(fps)) {
          return fail("unsupported_command", `${path}.fps`, "Phase 1 supports only 12 or 24 FPS.");
        }
        timing = {
          type: literal(command.type, "set_timing", `${path}.type`),
          commandVersion: literal(command.commandVersion, 1, `${path}.commandVersion`),
          fps: fps as 12 | 24,
          totalFrameCount: integer(
            command.totalFrameCount,
            `${path}.totalFrameCount`,
            STICK_ANIMATION_PLAN_MIN_FRAMES,
            STICK_ANIMATION_PLAN_MAX_FRAMES,
          ),
        };
        plan.commands.push(timing);
        continue;
      }
      if (timing === null) return fail("unsupported_command", path, "set_timing must be the first command.");
      if (type === "create_key_pose") {
        const command = object(
          commandInput,
          ["type", "commandVersion", "poseName", "frameIndex", "targetLayerId", "targetRigId", "targetFigureId", "joints"],
          path,
        );
        const poseName = parsePlanPoseName(command.poseName, `${path}.poseName`);
        if (poseNames.has(poseName)) return fail("unsupported_command", `${path}.poseName`, "Pose names must be unique.");
        const frameIndex = integer(command.frameIndex, `${path}.frameIndex`, 0, timing.totalFrameCount - 1);
        if (poseIndexes.has(frameIndex)) return fail("unsupported_command", `${path}.frameIndex`, "Key-pose frame indexes must be unique.");
        if (frameIndex !== coverageCursor) {
          return fail("unsupported_command", `${path}.frameIndex`, "Key poses and holds must cover the timeline contiguously in order.");
        }
        const targetLayerId = uuid(command.targetLayerId, `${path}.targetLayerId`);
        const targetRigId = uuid(command.targetRigId, `${path}.targetRigId`);
        const targetFigureId = uuid(command.targetFigureId, `${path}.targetFigureId`);
        if (targetLayerId !== starter.layers[0].layerId || targetRigId !== starter.rigs[0].rigId || targetFigureId !== starter.figures[0].figureId) {
          return fail("unsupported_command", path, "A key pose must target the one existing layer, rig, and figure.");
        }
        const jointsInput = array(command.joints, `${path}.joints`);
        if (jointsInput.length !== STICK_JOINT_ROLES.length) {
          return fail("unsupported_command", `${path}.joints`, `A complete pose requires exactly ${STICK_JOINT_ROLES.length} joints.`);
        }
        const joints = jointsInput.map((jointInput, jointIndex): StickAnimationPlanJointV1 => {
          const jointPath = `${path}.joints[${jointIndex}]`;
          const joint = object(jointInput, ["role", "x", "y"], jointPath);
          const role = text(joint.role, `${jointPath}.role`);
          if (role !== STICK_JOINT_ROLES[jointIndex]) {
            return fail("unsupported_command", `${jointPath}.role`, "Joint roles must be complete, unique, and in canonical order.");
          }
          return {
            role,
            x: integer(joint.x, `${jointPath}.x`, 0, starter.coordinateSpace.width - 1),
            y: integer(joint.y, `${jointPath}.y`, 0, starter.coordinateSpace.height - 1),
          };
        });
        const parsed: StickAnimationCreateKeyPoseCommandV1 = {
          type: literal(command.type, "create_key_pose", `${path}.type`),
          commandVersion: literal(command.commandVersion, 1, `${path}.commandVersion`),
          poseName,
          frameIndex,
          targetLayerId,
          targetRigId,
          targetFigureId,
          joints,
        };
        poseNames.add(poseName);
        poseIndexes.add(frameIndex);
        activePoseName = poseName;
        coverageCursor += 1;
        plan.commands.push(parsed);
        continue;
      }
      if (type === "hold_pose") {
        const command = object(commandInput, ["type", "commandVersion", "poseName", "startFrameIndex", "endFrameIndex"], path);
        const poseName = parsePlanPoseName(command.poseName, `${path}.poseName`);
        if (!poseNames.has(poseName) || poseName !== activePoseName) {
          return fail("unsupported_command", `${path}.poseName`, "A hold must name the immediately active earlier key pose.");
        }
        if (heldPoseNames.has(poseName)) return fail("unsupported_command", `${path}.poseName`, "A pose may have only one explicit hold range.");
        const startFrameIndex = integer(command.startFrameIndex, `${path}.startFrameIndex`, 0, timing.totalFrameCount - 1);
        const endFrameIndex = integer(command.endFrameIndex, `${path}.endFrameIndex`, 0, timing.totalFrameCount - 1);
        if (startFrameIndex !== coverageCursor || endFrameIndex < startFrameIndex) {
          return fail("unsupported_command", path, "A hold range must be non-empty, contiguous, ordered, and non-overlapping.");
        }
        const parsed: StickAnimationHoldPoseCommandV1 = {
          type: literal(command.type, "hold_pose", `${path}.type`),
          commandVersion: literal(command.commandVersion, 1, `${path}.commandVersion`),
          poseName,
          startFrameIndex,
          endFrameIndex,
        };
        heldPoseNames.add(poseName);
        coverageCursor = endFrameIndex + 1;
        plan.commands.push(parsed);
        continue;
      }
      if (type === "finish") {
        const command = object(commandInput, ["type", "commandVersion"], path);
        if (commandIndex !== commandsInput.length - 1 || finishCount !== 0) {
          return fail("unsupported_command", path, "finish must appear exactly once and last.");
        }
        finishCount += 1;
        plan.commands.push({
          type: literal(command.type, "finish", `${path}.type`),
          commandVersion: literal(command.commandVersion, 1, `${path}.commandVersion`),
        });
        continue;
      }
      return fail("unsupported_command", `${path}.type`, "Unknown Phase 1 plan command.");
    }
    if (finishCount !== 1 || plan.commands.at(-1)?.type !== "finish") {
      return fail("unsupported_command", "$plan.commands", "finish must appear exactly once and last.");
    }
    if (timing === null || poseNames.size === 0 || coverageCursor !== timing.totalFrameCount) {
      return fail("unsupported_command", "$plan.commands", "The complete bounded timeline must resolve without gaps.");
    }
    return cloneCanonical(plan);
  });

export const parseStickCommandInput = async (
  value: unknown,
  starter: StickProjectDocumentV1,
): Promise<StickAiContractResult<StickCommandInputV1>> => {
  if (isPlainObject(value) && Object.getOwnPropertyDescriptor(value, "kind")?.value === "stick-animation-plan") {
    return parseStickAnimationPlan(value, starter);
  }
  return parseStickCommandBatch(value, starter);
};

/** Shared manual-action trace used by both the Phase 1 contract and Phase 4 executor. */
export const stickManualActionsFromCommand = (command: StickWaveCommandV1): StickManualActionV1[] => {
  const actions: StickManualActionV1[] = [];
  command.poseEntries.forEach((entry, index) => {
    if (index > 0) {
      actions.push({actionVersion: 1, type: "hold-pose-through", targetFrameIndex: index === 1 ? 3 : 7});
      actions.push({actionVersion: 1, type: "insert-blank-keyframe", targetFrameIndex: entry.ownerFrameIndex});
      actions.push({actionVersion: 1, type: "start-pose-from-previous", targetFrameIndex: entry.ownerFrameIndex, newPoseId: entry.pose.poseId});
    }
    const elbow = entry.pose.points[STICK_JOINT_ROLES.indexOf("rightElbow")];
    const hand = entry.pose.points[STICK_JOINT_ROLES.indexOf("rightHand")];
    actions.push({actionVersion: 1, type: "set-joint", targetFrameIndex: entry.ownerFrameIndex, jointRole: "rightElbow", point: {x: elbow.x, y: elbow.y}});
    actions.push({actionVersion: 1, type: "set-joint", targetFrameIndex: entry.ownerFrameIndex, jointRole: "rightHand", point: {x: hand.x, y: hand.y}});
  });
  actions.push({actionVersion: 1, type: "hold-pose-through", targetFrameIndex: 11});
  return actions;
};

export const applyStickCommandBatch = async (
  starterInput: StickProjectDocumentV1,
  envelopeInput: StickCommandBatchV1,
): Promise<StickAiContractResult<StickProjectDocumentV1>> =>
  captureAsync(async () => {
    const parsed = await parseStickCommandBatch(envelopeInput, starterInput);
    if (!parsed.ok) return fail(parsed.error.code, parsed.error.path, parsed.error.message);
    const result = applyStickManualActions(starterInput, stickManualActionsFromCommand(parsed.value.commands[0]), "single", "allow-derived");
    if (!result.ok) return fail(result.error.code, result.error.path, result.error.message);
    if (!isStickManualWaveApplied(result.value, starterInput)) return fail("transaction_failed", "$document", "Command did not materialize the wave profile.");
    return result.value;
  });

const AI_ERROR_CODES = new Set<StickAiErrorCodeV1>([
  "capability_disabled", "missing_credentials", "temporarily_unavailable", "unsupported_prompt",
  "unsupported_project_state", "invalid_request", "request_too_large", "unsupported_version",
  "capability_mismatch", "invalid_provider_output", "provider_refusal", "unsupported_command", "timeout",
  "network_failure", "aborted", "preview_cancelled", "stale_document", "project_switched",
  "idempotency_conflict", "concurrency_conflict", "transaction_failed",
]);

const parsePreviewSummary = (value: unknown, path: string) => {
  const root = object(value, ["figureCount", "keyPoseCount", "fps", "timelineFrameCount", "durationMs"], path);
  const fps = integer(root.fps, `${path}.fps`, 12, 24);
  if (!(STICK_ANIMATION_PLAN_ALLOWED_FPS as readonly number[]).includes(fps)) {
    return fail("invalid_request", `${path}.fps`, "Preview FPS is outside the supported set.");
  }
  return {
    figureCount: literal(root.figureCount, 1, `${path}.figureCount`),
    keyPoseCount: integer(root.keyPoseCount, `${path}.keyPoseCount`, 1, STICK_ANIMATION_PLAN_MAX_FRAMES),
    fps: fps as 12 | 24,
    timelineFrameCount: integer(
      root.timelineFrameCount,
      `${path}.timelineFrameCount`,
      STICK_ANIMATION_PLAN_MIN_FRAMES,
      STICK_ANIMATION_PLAN_MAX_FRAMES,
    ),
    durationMs: integer(root.durationMs, `${path}.durationMs`, 1, 2000),
  };
};

export const parseStickCommandResult = (value: unknown): StickAiContractResult<StickCommandResultV1> =>
  capture(() => {
    const root = object(
      value,
      ["kind", "resultVersion", "requestId", "transactionId", "projectId", "envelopeDigest", "status", "previousDocumentRevision", "resultingDocumentRevision", "mutationCount", "preStateDigest", "candidateDigest", "previewSummary", "error"],
      "$result",
    );
    const status = text(root.status, "$result.status") as StickCommandResultStatusV1;
    if (!(status === "previewed" || status === "applied" || status === "duplicate" || status === "rejected" || status === "failed" || status === "cancelled")) {
      return fail("invalid_request", "$result.status", "Unknown result status.");
    }
    const positive = status === "previewed" || status === "applied" || status === "duplicate";
    const parsedError = root.error === null
      ? null
      : (() => {
          const error = object(root.error, ["code", "message"], "$result.error");
          const code = text(error.code, "$result.error.code") as StickAiErrorCodeV1;
          if (!AI_ERROR_CODES.has(code)) return fail("invalid_request", "$result.error.code", "Unknown error code.");
          return {code, message: text(error.message, "$result.error.message")};
        })();
    if (positive !== (root.candidateDigest !== null && root.previewSummary !== null && parsedError === null)) {
      return fail("invalid_request", "$result", "Result nullability does not match its status.");
    }
    if (status === "cancelled" && parsedError?.code !== "preview_cancelled") {
      return fail("invalid_request", "$result.error.code", "Cancelled results use preview_cancelled.");
    }
    const resultingRevision = root.resultingDocumentRevision === null ? null : integer(root.resultingDocumentRevision, "$result.resultingDocumentRevision");
    const expectedMutationCount = status === "applied" ? 1 : 0;
    if (root.mutationCount !== expectedMutationCount) return fail("invalid_request", "$result.mutationCount", "Mutation count does not match status.");
    if ((status === "applied" || status === "duplicate") !== (resultingRevision !== null)) {
      return fail("invalid_request", "$result.resultingDocumentRevision", "Resulting revision does not match status.");
    }
    return {
      kind: literal(root.kind, "stick-command-result", "$result.kind"),
      resultVersion: literal(root.resultVersion, 1, "$result.resultVersion"),
      requestId: uuid(root.requestId, "$result.requestId"),
      transactionId: uuid(root.transactionId, "$result.transactionId"),
      projectId: uuid(root.projectId, "$result.projectId"),
      envelopeDigest: digest(root.envelopeDigest, "$result.envelopeDigest"),
      status,
      previousDocumentRevision: integer(root.previousDocumentRevision, "$result.previousDocumentRevision"),
      resultingDocumentRevision: resultingRevision,
      mutationCount: expectedMutationCount,
      preStateDigest: digest(root.preStateDigest, "$result.preStateDigest"),
      candidateDigest: root.candidateDigest === null ? null : digest(root.candidateDigest, "$result.candidateDigest"),
      previewSummary: root.previewSummary === null ? null : parsePreviewSummary(root.previewSummary, "$result.previewSummary"),
      error: parsedError,
    };
  });

export const projectStickAnimationContentWithDigest = async (document: StickProjectDocumentV1) => {
  const projection = projectStickAnimationContent(document);
  if (!projection.ok) return projection as StickContractResult<never>;
  return {ok: true as const, value: {content: projection.value, animationContentDigest: await digestCanonical(projection.value)}};
};

export const STICK_WAVE_BEATS = [
  {beat: "ready", rightElbow: {x: 1080, y: 360}, rightHand: {x: 1160, y: 260}},
  {beat: "inward", rightElbow: {x: 1080, y: 300}, rightHand: {x: 1020, y: 220}},
  {beat: "outward", rightElbow: {x: 1120, y: 300}, rightHand: {x: 1280, y: 220}},
] as const;

export const STICK_GOLDEN_PROVIDER_PLAN: StickWaveProviderPlanV1 = {
  kind: "stick-wave-plan",
  planVersion: 1,
  fps: 12,
  totalFrames: 12,
  poses: STICK_WAVE_BEATS.map((entry) => cloneCanonical(entry)),
};

export const assertNoAiOnlyStickRepresentation = (value: unknown) => {
  const serialized = canonicalJson(value);
  return !/("poseRole"|"provenance"|"highlight"|"glow"|"headShape"|"radius"|"rotation")/.test(serialized);
};

export const assertStickTopologyIsFixed = (document: StickProjectDocumentV1) =>
  document.rigs.length === 1 &&
  document.figures.length === 1 &&
  document.rigs[0].templateId === STICK_HUMANOID_TEMPLATE_ID &&
  document.rigs[0].joints.length === STICK_JOINT_ROLES.length &&
  document.rigs[0].segments.length === STICK_SEGMENT_ROLE_PAIRS.length;
