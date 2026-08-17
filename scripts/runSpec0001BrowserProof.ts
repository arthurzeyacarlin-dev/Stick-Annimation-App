import assert from "node:assert/strict";
import {spawn, spawnSync, type ChildProcess} from "node:child_process";
import {createHash} from "node:crypto";
import {createServer, isIP} from "node:net";
import {
  appendFileSync,
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  realpathSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmdirSync,
  rmSync,
  statSync,
  openSync,
  readSync,
  closeSync,
  writeFileSync,
} from "node:fs";
import {get as httpGet} from "node:http";
import {dirname, relative, resolve, sep} from "node:path";
import {chromium, type BrowserContext, type Page, type Route, type WebSocketRoute} from "playwright-core";
import {
  ACTIONS,
  ACCEPTED_CONSOLE_WARNING_PATTERNS,
  ANCHOR_MARKER,
  ANCHOR_PATH,
  BROWSER_EXECUTABLE,
  DRIVER_BINDING,
  FIXED_DRAWING_PROMPT,
  FIXTURE_ROOT,
  OUTPUT_ROOT,
  PHASE,
  PHASE15_PROOF_BASE,
  PRODUCTION_MARKERS,
  PRODUCTION_SCREENSHOTS,
  SCREENSHOT_TEMPLATES,
  SERVER_GUARD_CHECKS,
  SETTLED_ABSENT_TEXT,
  SPEC_ID,
  VIEWPORTS,
  bindFile,
  readJson,
  repositoryPath,
  sha256Bytes,
  strictObject,
  stableJson,
  validateBrowserPlan,
  validateDriverEnvelope,
  validateJsonSchema,
  validateRunBaselinePolicy,
  type FileBinding,
  type JsonObject,
} from "./spec0001-browser/browserTesterContract.ts";
import {
  COMPATIBILITY_OUTPUT_ROOT,
  loadTesterExtensionGraph,
  parseBrowserProofCli,
  validateExtensionResult,
  type ExtensionResult,
  type NormalizedAction,
  type ValidatedTesterExtension,
} from "./spec0001-browser/browserTesterExtensionContract.ts";

const ROOT = process.cwd();
const BROWSER_OUTPUT = `${OUTPUT_ROOT}/browser`;
const SCREENSHOT_ROOT = `${BROWSER_OUTPUT}/screenshots`;
const TEMP_ROOT = `${BROWSER_OUTPUT}/temporary`;
const NETWORK_LEDGER = `${BROWSER_OUTPUT}/server-network.ndjson`;
const BROWSER_LEDGER = `${BROWSER_OUTPUT}/browser-network.ndjson`;
const CONSOLE_LEDGER = `${BROWSER_OUTPUT}/console.ndjson`;
const SERVER_LOG = `${BROWSER_OUTPUT}/server.log`;
const RESULT_PATH = `${BROWSER_OUTPUT}/result.json`;
const FAILURE_PATH = `${BROWSER_OUTPUT}/failure.json`;
const NEGATIVE_PATH = `${BROWSER_OUTPUT}/negative-cases.json`;
const FONT_METADATA_PATH = `${FIXTURE_ROOT}/next-font-google-response.json`;
const DRAWING_RESPONSE_PATH = `${FIXTURE_ROOT}/drawing-generate-frames-response.json`;
const PLAN_PATH = `${FIXTURE_ROOT}/phase-1.5-browser-plan.json`;
const NETWORK_GUARD_PATH = "scripts/spec0001-browser/networkDeny.cjs";
const NEXT_DIR = ".next";
let COMPATIBILITY_SYNTHETIC_ROOT = `${COMPATIBILITY_OUTPUT_ROOT}/synthetic`;
let COMPATIBILITY_SCREENSHOT_ROOT = `${COMPATIBILITY_SYNTHETIC_ROOT}/screenshots`;
let COMPATIBILITY_TEMP_ROOT = `${COMPATIBILITY_SYNTHETIC_ROOT}/temporary`;
let COMPATIBILITY_ACTION_LEDGER = `${COMPATIBILITY_SYNTHETIC_ROOT}/action-ledger.json`;
let COMPATIBILITY_CHECKPOINT_LEDGER = `${COMPATIBILITY_SYNTHETIC_ROOT}/checkpoint-ledger.json`;
let COMPATIBILITY_STORAGE_LEDGER = `${COMPATIBILITY_SYNTHETIC_ROOT}/storage-ledger.json`;
let COMPATIBILITY_REQUEST_LEDGER = `${COMPATIBILITY_SYNTHETIC_ROOT}/request-ledger.json`;
let COMPATIBILITY_NETWORK_LEDGER = `${COMPATIBILITY_SYNTHETIC_ROOT}/network-ledger.json`;
let COMPATIBILITY_CONSOLE_LEDGER = `${COMPATIBILITY_SYNTHETIC_ROOT}/console-ledger.json`;
let COMPATIBILITY_REGRESSION_LEDGER = `${COMPATIBILITY_SYNTHETIC_ROOT}/regression-ledger.json`;
let COMPATIBILITY_CLEANUP_LEDGER = `${COMPATIBILITY_SYNTHETIC_ROOT}/cleanup.json`;
let COMPATIBILITY_RESULT_PATH = `${COMPATIBILITY_SYNTHETIC_ROOT}/runner-result.json`;
let COMPATIBILITY_SERVER_LOG = `${COMPATIBILITY_TEMP_ROOT}/server.log`;
let COMPATIBILITY_SERVER_NETWORK_LEDGER = `${COMPATIBILITY_TEMP_ROOT}/server-network.ndjson`;
let COMPATIBILITY_BROWSER_NETWORK_LEDGER = `${COMPATIBILITY_TEMP_ROOT}/browser-network.ndjson`;
let COMPATIBILITY_BROWSER_CONSOLE_LEDGER = `${COMPATIBILITY_TEMP_ROOT}/console.ndjson`;
let compatibilityNetworkGuardV2Path: string | null = null;
const COMPATIBILITY_DRIVER_BINDING = "__SPEC0001_BROWSER_DRIVER_V2__";
const COMPATIBILITY_COMMAND_EVENT = "__spec0001BrowserCommandV2";
const COMPATIBILITY_PRODUCTION_MARKERS = [
  ...PRODUCTION_MARKERS,
  COMPATIBILITY_DRIVER_BINDING,
  COMPATIBILITY_COMMAND_EVENT,
  "compatibility.command-result/v2",
  "in-memory-phase2-shaped-synthetic/v1",
] as const;
const DRIVER_INSTRUMENTATION = `  useEffect(() => {
    const driver = (window as Window & {${DRIVER_BINDING}?: (message: unknown) => Promise<void>})
      .${DRIVER_BINDING};
    if (typeof driver !== "function") return;
    void driver({contractVersion: 1, operation: "tester.connection.ping/v1", payload: {connected: true, transport: "playwright-binding"}});
    void driver({
      contractVersion: 1,
      operation: "stick.phase2.checkpoint/v1",
      payload: {
        activeLayerId,
        authoredFrameCount: authoredPlaybackFrameCount,
        currentFrameIndex,
        jointCount: structureGraph.joints.length,
        limbCount: structureGraph.limbs.length,
        selectedTimelineIndex,
      },
    });
  }, [activeLayerId, authoredPlaybackFrameCount, currentFrameIndex, selectedTimelineIndex, structureGraph.joints.length, structureGraph.limbs.length]);`;

const COMPATIBILITY_DRIVER_INSTRUMENTATION = `  const spec0001CompatibilityStateRef = useRef({
    fixtureId: null as string | null,
    revision: 0,
    selectedPart: null as string | null,
    pointer: null as null | {pointerId: number; startX: number; startY: number; x: number; y: number; cancelled: boolean},
    joints: {
      head: {x: 320, y: 132},
      body: {x: 320, y: 238},
      leftArm: {x: 258, y: 220},
      rightArm: {x: 382, y: 220},
      leftLeg: {x: 286, y: 352},
      rightLeg: {x: 354, y: 352},
    },
    publications: {} as Record<string, {status: "pending" | "ready" | "failed" | "stale"; revision: number}>,
    lastPublication: null as string | null,
  });
  useEffect(() => {
    const publish = (operation: string, payload: Record<string, unknown>) => {
      const binding = (window as Window & {${COMPATIBILITY_DRIVER_BINDING}?: (message: unknown) => Promise<void>}).${COMPATIBILITY_DRIVER_BINDING};
      if (typeof binding === "function") void binding({contractVersion: 2, operation, payload});
    };
    const checkpoint = () => {
      const state = spec0001CompatibilityStateRef.current;
      return {
        fixtureId: state.fixtureId,
        revision: state.revision,
        selectedPart: state.selectedPart,
        pointer: state.pointer,
        joints: state.joints,
        publications: state.publications,
        lastPublication: state.lastPublication,
      };
    };
    const onCommand = (event: Event) => {
      const detail = (event as CustomEvent<{commandId?: unknown; operation?: unknown; payload?: unknown}>).detail;
      if (!detail || typeof detail.commandId !== "string" || typeof detail.operation !== "string" || typeof detail.payload !== "object" || detail.payload === null || Array.isArray(detail.payload)) return;
      const payload = detail.payload as Record<string, unknown>;
      const state = spec0001CompatibilityStateRef.current;
      let response: Record<string, unknown> = {};
      switch (detail.operation) {
        case "fixture.mount/v1": {
          if (typeof payload.fixtureId !== "string") return;
          state.fixtureId = payload.fixtureId;
          state.revision += 1;
          response = {fixtureId: state.fixtureId, revision: state.revision};
          break;
        }
        case "manual.select-part/v1": {
          if (!["head", "body", "leftArm", "rightArm", "leftLeg", "rightLeg"].includes(String(payload.part))) return;
          state.selectedPart = String(payload.part);
          response = {selectedPart: state.selectedPart};
          break;
        }
        case "manual.move-part/v1": {
          if (typeof payload.part !== "string" || typeof payload.x !== "number" || typeof payload.y !== "number" || !(payload.part in state.joints)) return;
          state.joints[payload.part as keyof typeof state.joints] = {x: payload.x, y: payload.y};
          state.selectedPart = payload.part;
          state.revision += 1;
          response = {part: payload.part, point: state.joints[payload.part as keyof typeof state.joints], revision: state.revision};
          break;
        }
        case "pointer.down/v1": {
          if (typeof payload.pointerId !== "number" || typeof payload.x !== "number" || typeof payload.y !== "number") return;
          state.pointer = {pointerId: payload.pointerId, startX: payload.x, startY: payload.y, x: payload.x, y: payload.y, cancelled: false};
          response = {pointer: state.pointer};
          break;
        }
        case "pointer.move/v1": {
          if (!state.pointer || state.pointer.pointerId !== payload.pointerId || typeof payload.x !== "number" || typeof payload.y !== "number") return;
          state.pointer = {...state.pointer, x: payload.x, y: payload.y};
          response = {pointer: state.pointer};
          break;
        }
        case "pointer.up/v1": {
          if (!state.pointer || state.pointer.pointerId !== payload.pointerId) return;
          state.revision += 1;
          response = {pointer: state.pointer, committed: true, revision: state.revision};
          state.pointer = null;
          break;
        }
        case "pointer.cancel/v1": {
          if (!state.pointer || state.pointer.pointerId !== payload.pointerId) return;
          response = {pointer: {...state.pointer, cancelled: true}, restored: true, revision: state.revision};
          state.pointer = null;
          break;
        }
        case "publication.begin/v1": {
          if (typeof payload.publicationId !== "string") return;
          state.publications[payload.publicationId] = {status: "pending", revision: state.revision};
          response = {publicationId: payload.publicationId, status: "pending"};
          break;
        }
        case "publication.complete/v1": {
          if (typeof payload.publicationId !== "string" || !state.publications[payload.publicationId] || !["ready", "failed", "stale"].includes(String(payload.status))) return;
          state.publications[payload.publicationId] = {...state.publications[payload.publicationId], status: String(payload.status) as "ready" | "failed" | "stale"};
          if (payload.status === "ready") state.lastPublication = payload.publicationId;
          response = {publicationId: payload.publicationId, status: payload.status, lastPublication: state.lastPublication};
          break;
        }
        case "checkpoint.read/v1": {
          response = checkpoint();
          break;
        }
        default: return;
      }
      publish("compatibility.command-result/v2", {commandId: detail.commandId, operation: detail.operation, response, checkpoint: checkpoint()});
    };
    const canvasPointer = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof HTMLElement) || target.style.touchAction !== "none") return;
      const operation = event.type === "pointerdown" ? "pointer.down/v1" : event.type === "pointermove" ? "pointer.move/v1" : event.type === "pointerup" ? "pointer.up/v1" : "pointer.cancel/v1";
      onCommand(new CustomEvent(${JSON.stringify(COMPATIBILITY_COMMAND_EVENT)}, {detail: {commandId: "pointer-" + event.type + "-" + event.timeStamp, operation, payload: {pointerId: event.pointerId, x: event.clientX, y: event.clientY}}}));
      event.preventDefault();
      event.stopImmediatePropagation();
    };
    window.addEventListener(${JSON.stringify(COMPATIBILITY_COMMAND_EVENT)}, onCommand);
    for (const type of ["pointerdown", "pointermove", "pointerup", "pointercancel"] as const) window.addEventListener(type, canvasPointer, true);
    publish("tester.connection.ping/v2", {connected: true, transport: "playwright-binding", adapterKind: "in-memory-phase2-shaped-synthetic/v1"});
    return () => {
      window.removeEventListener(${JSON.stringify(COMPATIBILITY_COMMAND_EVENT)}, onCommand);
      for (const type of ["pointerdown", "pointermove", "pointerup", "pointercancel"] as const) window.removeEventListener(type, canvasPointer, true);
    };
  }, []);`;

const PHASE2_WORKSPACE_PORT_INSTRUMENTATION = `  useEffect(() => {
    const ports = spec0001Phase2BrowserPortsV1;
    const required = ["mountDocument", "dispatchCompletedJointEdit", "beginDocumentPublication", "completeDocumentPublication", "readCheckpoint"] as const;
    for (const name of required) {
      if (typeof ports[name] !== "function") throw new Error("SPEC0001_PHASE2_PORT_MISSING:" + name);
    }
    const publish = (operation: string, payload: Record<string, unknown>) => {
      const binding = (window as Window & {${COMPATIBILITY_DRIVER_BINDING}?: (message: unknown) => Promise<void>}).${COMPATIBILITY_DRIVER_BINDING};
      if (typeof binding === "function") void binding({contractVersion: 2, operation, payload});
    };
    const onCommand = async (event: Event) => {
      const detail = (event as CustomEvent<{commandId?: unknown; operation?: unknown; payload?: unknown}>).detail;
      if (!detail || typeof detail.commandId !== "string" || typeof detail.operation !== "string" || typeof detail.payload !== "object" || detail.payload === null || Array.isArray(detail.payload)) return;
      const payload = detail.payload as Record<string, unknown>;
      let response: unknown;
      if (detail.operation === "workspace.mount-document/v1") response = await ports.mountDocument(payload.fixture);
      else if (detail.operation === "workspace.dispatch-completed-joint-edit/v1") response = await ports.dispatchCompletedJointEdit(payload.fixture);
      else if (detail.operation === "workspace.begin-document-publication/v1") response = await ports.beginDocumentPublication(payload.fixture);
      else if (detail.operation === "workspace.complete-document-publication/v1") response = await ports.completeDocumentPublication(payload.fixture);
      else if (detail.operation === "workspace.read-checkpoint/v1") response = await ports.readCheckpoint(payload.operationId);
      else return;
      const checkpoint = detail.operation === "workspace.read-checkpoint/v1" ? response : await ports.readCheckpoint(detail.commandId);
      publish("compatibility.command-result/v2", {commandId: detail.commandId, operation: detail.operation, response, checkpoint});
    };
    const listener = (event: Event) => { void onCommand(event); };
    window.addEventListener(${JSON.stringify(COMPATIBILITY_COMMAND_EVENT)}, listener);
    publish("tester.connection.ping/v2", {connected: true, transport: "playwright-binding", adapterKind: "phase-2-product-ports/v1"});
    return () => window.removeEventListener(${JSON.stringify(COMPATIBILITY_COMMAND_EVENT)}, listener);
  }, []);`;

type Operation = {id: string; viewport: string; action: string; target: string; passed: true; at: string};
type ScreenshotEvidence = FileBinding & {id: string; viewport: {width: number; height: number}};
type RunningServer = {child: ChildProcess; port: number; mode: "development" | "production"};
type RunPolicy = ReturnType<typeof validateRunBaselinePolicy>;
type CompatibilityOperation = {
  stepId: string;
  actionId: string;
  contextId: string;
  family: NormalizedAction["family"];
  status: "passed";
  at: string;
  expectedEvidenceDigest?: string;
  observedEvidenceDigest?: string;
  evidence?: JsonObject;
};
type CompatibilityCommandMessage = {
  contextId: string;
  operation: string;
  payload: JsonObject;
};

const operations: Operation[] = [];
const screenshots: ScreenshotEvidence[] = [];
const driverMessages: Array<{context: string; envelope: ReturnType<typeof validateDriverEnvelope>}> = [];
const requestRecords: JsonObject[] = [];
const drawingSettlements: JsonObject[] = [];
const browserNetwork: JsonObject[] = [];
const consoleRecords: JsonObject[] = [];
const browserPolicyViolations: JsonObject[] = [];
const expectedBrowserDenials: JsonObject[] = [];
const expectedBrowserSelfTestConsole: JsonObject[] = [];
const seenDriverMessages = new Set<string>();
const negativeResults: Array<{name: string; status: "passed"; expectedCode: string}> = [];
const observedBrowserVersions = new Set<string>();
const ownedProfiles = new Set<string>();
const ownedPorts = new Set<number>();
let activeContext: BrowserContext | null = null;
let activeServer: RunningServer | null = null;
let anchorOriginal: Buffer | null = null;
let anchorOriginalHash: string | null = null;
let anchorReplacementHash: string | null = null;
let cleanupStarted = false;
let runPolicy: RunPolicy;
let plan: ReturnType<typeof validateBrowserPlan>;

const compatibilityOperations: CompatibilityOperation[] = [];
const compatibilityCheckpoints: JsonObject[] = [];
const compatibilityStorage: JsonObject[] = [];
const compatibilityRequests: JsonObject[] = [];
const compatibilityBrowserNetwork: JsonObject[] = [];
const compatibilityConsole: JsonObject[] = [];
const compatibilityPolicyViolations: JsonObject[] = [];
const compatibilityExpectedDenials: JsonObject[] = [];
const compatibilityRegressions: JsonObject[] = [];
const compatibilityScreenshots: ScreenshotEvidence[] = [];
const compatibilityDriverMessages: CompatibilityCommandMessage[] = [];
const compatibilityPendingCommands = new Map<string, {contextId: string; operation: string; resolve: (message: CompatibilityCommandMessage) => void; reject: (error: Error) => void}>();
const compatibilityOwnedContexts = new Map<BrowserContext, string>();
const compatibilityEnvironment = {installedFixtureId: null as string | null, activeGates: new Set<string>(), revision: 0};
const compatibilityBrowserVersions = new Set<string>();
let compatibilityGraph: ValidatedTesterExtension | null = null;
let compatibilityOutputInitialized = false;
let compatibilityAnchorOriginal: Buffer | null = null;
let compatibilityAnchorOriginalHash: string | null = null;
let compatibilityAnchorReplacementHash: string | null = null;
let compatibilityCleanupPromise: Promise<void> | null = null;
let compatibilityOwnsNext = false;
let compatibilityOwnsTempRoot = false;
const compatibilityExpectedSyntheticState = {
  fixtureId: null as string | null,
  revision: 0,
  selectedPart: null as string | null,
  pointer: null as null | {pointerId: number; startX: number; startY: number; x: number; y: number; cancelled: boolean},
  joints: {
    head: {x: 320, y: 132}, body: {x: 320, y: 238}, leftArm: {x: 258, y: 220},
    rightArm: {x: 382, y: 220}, leftLeg: {x: 286, y: 352}, rightLeg: {x: 354, y: 352},
  },
  publications: {} as Record<string, {status: "pending" | "ready" | "failed" | "stale"; revision: number}>,
  lastPublication: null as string | null,
};

const now = () => new Date().toISOString();
const recordOperation = (id: string, viewport: string, action: string, target: string) =>
  operations.push({id, viewport, action, target, passed: true, at: now()});

const GIT_EXECUTABLE = "/usr/bin/git";
const GIT_ENVIRONMENT = Object.freeze({
  PATH: "/usr/bin:/bin",
  HOME: process.env.HOME,
  LC_ALL: "C",
  GIT_CONFIG_NOSYSTEM: "1",
  GIT_CONFIG_GLOBAL: "/dev/null",
  GIT_OPTIONAL_LOCKS: "0",
  GIT_TERMINAL_PROMPT: "0",
}) as unknown as NodeJS.ProcessEnv;

const git = (...argv: string[]) => {
  const result = spawnSync(GIT_EXECUTABLE, argv, {cwd: ROOT, env: GIT_ENVIRONMENT, encoding: "utf8", shell: false});
  assert.equal(result.status, 0, result.stderr || `git ${argv.join(" ")} failed`);
  return result.stdout.trim();
};

const configureExtensionOutputPaths = (graph: ValidatedTesterExtension) => {
  const executionLeaf = graph.adapter.executionProfile === "synthetic-state-machine/v1" ? "synthetic" : "browser";
  COMPATIBILITY_SYNTHETIC_ROOT = `${graph.outputRoot}/${executionLeaf}`;
  COMPATIBILITY_SCREENSHOT_ROOT = `${COMPATIBILITY_SYNTHETIC_ROOT}/screenshots`;
  COMPATIBILITY_TEMP_ROOT = `${COMPATIBILITY_SYNTHETIC_ROOT}/temporary`;
  COMPATIBILITY_ACTION_LEDGER = `${COMPATIBILITY_SYNTHETIC_ROOT}/action-ledger.json`;
  COMPATIBILITY_CHECKPOINT_LEDGER = `${COMPATIBILITY_SYNTHETIC_ROOT}/checkpoint-ledger.json`;
  COMPATIBILITY_STORAGE_LEDGER = `${COMPATIBILITY_SYNTHETIC_ROOT}/storage-ledger.json`;
  COMPATIBILITY_REQUEST_LEDGER = `${COMPATIBILITY_SYNTHETIC_ROOT}/request-ledger.json`;
  COMPATIBILITY_NETWORK_LEDGER = `${COMPATIBILITY_SYNTHETIC_ROOT}/network-ledger.json`;
  COMPATIBILITY_CONSOLE_LEDGER = `${COMPATIBILITY_SYNTHETIC_ROOT}/console-ledger.json`;
  COMPATIBILITY_REGRESSION_LEDGER = `${COMPATIBILITY_SYNTHETIC_ROOT}/regression-ledger.json`;
  COMPATIBILITY_CLEANUP_LEDGER = `${COMPATIBILITY_SYNTHETIC_ROOT}/cleanup.json`;
  COMPATIBILITY_RESULT_PATH = `${COMPATIBILITY_SYNTHETIC_ROOT}/runner-result.json`;
  COMPATIBILITY_SERVER_LOG = `${COMPATIBILITY_TEMP_ROOT}/server.log`;
  COMPATIBILITY_SERVER_NETWORK_LEDGER = `${COMPATIBILITY_TEMP_ROOT}/server-network.ndjson`;
  COMPATIBILITY_BROWSER_NETWORK_LEDGER = `${COMPATIBILITY_TEMP_ROOT}/browser-network.ndjson`;
  COMPATIBILITY_BROWSER_CONSOLE_LEDGER = `${COMPATIBILITY_TEMP_ROOT}/console.ndjson`;
};

const assertExtensionOwnedPath = (path: string) => {
  const absolute = repositoryPath(ROOT, path, "Extension-owned path");
  const local = relative(ROOT, absolute);
  assert.ok(local === NEXT_DIR || local.startsWith(`${NEXT_DIR}${sep}`) || local === COMPATIBILITY_SYNTHETIC_ROOT || local.startsWith(`${COMPATIBILITY_SYNTHETIC_ROOT}${sep}`), `Extension path is outside owned roots: ${local}`);
  return {absolute, local};
};

const verifyRealPathComponent = (absolute: string) => {
  const rootReal = realpathSync(ROOT);
  const local = relative(ROOT, absolute);
  const expected = resolve(rootReal, local);
  assert.equal(lstatSync(absolute).isSymbolicLink(), false, `Symlink path component rejected: ${local}`);
  assert.equal(realpathSync(absolute), expected, `Real path component escaped its expected location: ${local}`);
};

const ensureSafeExtensionDirectory = (path: string) => {
  const {absolute} = assertExtensionOwnedPath(path);
  let current = ROOT;
  for (const part of relative(ROOT, absolute).split(sep).filter(Boolean)) {
    current = resolve(current, part);
    if (!existsSync(current)) mkdirSync(current, {mode: 0o700});
    verifyRealPathComponent(current);
    assert.equal(lstatSync(current).isDirectory(), true, `Extension directory component is not a directory: ${relative(ROOT, current)}`);
  }
  return absolute;
};

const secureExtensionFilePath = (path: string, createParent = false) => {
  const {absolute} = assertExtensionOwnedPath(path);
  const parent = dirname(absolute);
  if (createParent) ensureSafeExtensionDirectory(relative(ROOT, parent));
  else {
    assert.ok(existsSync(parent), `Extension output parent is missing: ${relative(ROOT, parent)}`);
    let current = ROOT;
    for (const part of relative(ROOT, parent).split(sep).filter(Boolean)) {
      current = resolve(current, part);
      assert.ok(existsSync(current), `Extension output parent component is missing: ${relative(ROOT, current)}`);
      verifyRealPathComponent(current);
      assert.equal(lstatSync(current).isDirectory(), true);
    }
  }
  if (existsSync(absolute)) verifyRealPathComponent(absolute);
  return absolute;
};

const writeExtensionJson = (path: string, value: unknown) => {
  writeFileSync(secureExtensionFilePath(path, true), `${JSON.stringify(value, null, 2)}\n`, {encoding: "utf8", mode: 0o600, flag: "wx"});
};

const appendExtensionJsonLine = (path: string, value: unknown) => {
  const absolute = secureExtensionFilePath(path, true);
  assert.ok(existsSync(absolute) && lstatSync(absolute).isFile(), `Extension append target is missing or invalid: ${path}`);
  appendFileSync(absolute, `${JSON.stringify(value)}\n`, {encoding: "utf8", mode: 0o600});
};

const snapshotExtensionSourceState = (graph: ValidatedTesterExtension) => {
  const paths = [...new Set([
    ...graph.git.dirtyExpectedPaths,
    graph.catalogBinding.path,
    graph.planBinding.path,
    graph.registryBinding.path,
    graph.adapterBinding.path,
    ANCHOR_PATH,
    NETWORK_GUARD_PATH,
    "package.json",
    "package-lock.json",
  ])].sort((left, right) => left.localeCompare(right));
  const entries = paths.map((path) => {
    const absolute = repositoryPath(ROOT, path, "Source snapshot path");
    assert.ok(existsSync(absolute), `Source snapshot path is missing: ${path}`);
    let current = ROOT;
    for (const part of relative(ROOT, absolute).split(sep).filter(Boolean)) {
      current = resolve(current, part);
      verifyRealPathComponent(current);
    }
    const status = lstatSync(absolute);
    assert.equal(status.isFile(), true, `Source snapshot path is not a regular file: ${path}`);
    const bytes = readFileSync(absolute);
    return {path, mode: status.mode & 0o7777, byteLength: bytes.byteLength, sha256: sha256Bytes(bytes)};
  });
  const status = spawnSync(GIT_EXECUTABLE, ["status", "--porcelain=v2", "-z", "--", ...paths], {cwd: ROOT, env: GIT_ENVIRONMENT, encoding: "buffer", shell: false, maxBuffer: 16 * 1024 * 1024});
  assert.equal(status.status, 0, Buffer.from(status.stderr ?? []).toString("utf8") || "Unable to snapshot source Git status.");
  const statusBytes = Buffer.from(status.stdout ?? []);
  return {paths, entries, gitStatus: {byteLength: statusBytes.byteLength, sha256: sha256Bytes(statusBytes)}};
};

const externalFileEvidence = (path: string) => {
  const hash = spawnSync("shasum", ["-a", "256", path], {encoding: "utf8", shell: false});
  assert.equal(hash.status, 0, hash.stderr || `Unable to hash ${path}`);
  return {path, byteLength: statSync(path).size, sha256: `sha256:${hash.stdout.trim().split(/\s+/)[0]}`};
};

const compatibilityExecutableEvidence = (path: typeof BROWSER_EXECUTABLE): ExtensionResult["runtime"]["browserExecutable"] => {
  const status = lstatSync(path);
  assert.equal(status.isSymbolicLink(), false, `Compatibility executable must not be a symlink: ${path}`);
  assert.equal(status.isFile(), true, `Compatibility executable must be a regular file: ${path}`);
  assert.equal(realpathSync(path), path, `Compatibility executable real path drift: ${path}`);
  const descriptor = openSync(path, "r");
  const hash = createHash("sha256");
  const chunk = Buffer.allocUnsafe(1024 * 1024);
  let byteLength = 0;
  try {
    for (;;) {
      const count = readSync(descriptor, chunk, 0, chunk.byteLength, null);
      if (count === 0) break;
      hash.update(chunk.subarray(0, count));
      byteLength += count;
    }
  } finally { closeSync(descriptor); }
  assert.equal(byteLength, status.size, `Compatibility executable changed while hashing: ${path}`);
  return {path, byteLength, sha256: `sha256:${hash.digest("hex")}`};
};

const changedPaths = () => [...new Set([
  ...git("diff", "--name-only", "-z", "HEAD").split("\0").filter(Boolean),
  ...git("ls-files", "--others", "--exclude-standard", "-z").split("\0").filter(Boolean),
])].sort();

const productSourceInventory = (policy: RunPolicy) => {
  const paths = git("ls-files", "-z", "app", "src").split("\0").filter(Boolean).sort();
  assert.ok(paths.includes("app/layout.tsx"));
  assert.ok(paths.includes(ANCHOR_PATH));
  const inventory = paths.map((path) => {
    const base = spawnSync(GIT_EXECUTABLE, ["show", `${policy.baselineCommit}:${path}`], {cwd: ROOT, env: GIT_ENVIRONMENT, encoding: "buffer", shell: false, maxBuffer: 16 * 1024 * 1024});
    assert.equal(base.status, 0, Buffer.from(base.stderr ?? "").toString("utf8") || `Unable to read base ${path}`);
    const baseBytes = Buffer.from(base.stdout ?? "");
    const currentBytes = readFileSync(repositoryPath(ROOT, path));
    const baseSha256 = sha256Bytes(baseBytes);
    const currentSha256 = sha256Bytes(currentBytes);
    if (policy.mode === "phase-1.5-bootstrap" && path === ANCHOR_PATH) {
      const withoutAnchor = currentBytes.toString("utf8").replace(`  ${ANCHOR_MARKER}\n\n`, "");
      assert.deepEqual(Buffer.from(withoutAnchor), baseBytes, "The authorized anchor file has changes beyond the inert marker.");
      return {path, baseSha256, currentSha256, status: "authorized-anchor-only"};
    }
    if (policy.mode === "phase-1.5-bootstrap" && path === "src/components/workspace/DrawingCanvas.tsx") {
      assert.notEqual(currentSha256, baseSha256, "The authorized Drawing correction must differ from the historical base.");
      return {path, baseSha256, currentSha256, status: "authorized-drawing-correction"};
    }
    assert.equal(currentSha256, baseSha256, `Product source differs from base outside the authorized anchor: ${path}`);
    return {path, baseSha256, currentSha256, status: "equal"};
  });
  const layout = inventory.find((entry) => entry.path === "app/layout.tsx");
  assert.ok(layout && layout.status === "equal");
  return {
    trackedFileCount: inventory.length,
    stylesheetCount: inventory.filter((entry) => /\.(?:css|less|sass|scss)$/.test(entry.path)).length,
    changedPaths: inventory.filter((entry) => entry.status !== "equal").map((entry) => entry.path),
    layout,
    inventory,
  };
};

const safeRemoveOwned = (path: string) => {
  const absolute = repositoryPath(ROOT, path, "Owned cleanup path");
  const local = relative(ROOT, absolute);
  assert.ok(local === NEXT_DIR || local.startsWith(`${BROWSER_OUTPUT}${sep}`), `Refused cleanup outside tester-owned roots: ${local}`);
  if (existsSync(absolute)) rmSync(absolute, {recursive: true, force: false});
};

const ensureNoCollisions = () => {
  const requestedBase = process.argv.find((value) => value.startsWith("--run-base="))?.slice("--run-base=".length);
  runPolicy = validateRunBaselinePolicy({head: git("rev-parse", "HEAD"), requestedBase, changedPaths: changedPaths()});
  assert.equal(git("diff", "--cached", "--name-only"), "", "Browser proof requires an empty index.");
  assert.ok(!existsSync(resolve(ROOT, NEXT_DIR)), "Refusing pre-existing .next collision.");
  assert.ok(!existsSync(resolve(ROOT, BROWSER_OUTPUT)), "Refusing pre-existing browser evidence collision.");
  assertEnvironment(BROWSER_EXECUTABLE, resolve(ROOT, "node_modules/playwright-core/package.json"));
};

const writeJson = (path: string, value: unknown) => {
  const absolute = repositoryPath(ROOT, path);
  mkdirSync(dirname(absolute), {recursive: true, mode: 0o700});
  writeFileSync(absolute, `${JSON.stringify(value, null, 2)}\n`, {encoding: "utf8", mode: 0o600});
};

const appendJsonLine = (path: string, value: unknown) => {
  appendFileSync(repositoryPath(ROOT, path), `${JSON.stringify(value)}\n`, {encoding: "utf8", mode: 0o600});
};

const recordNegative = async (name: string, expectedCode: string, operation: () => unknown | Promise<unknown>) => {
  await operation();
  negativeResults.push({name, status: "passed", expectedCode});
};

const expectRejected = async (name: string, operation: () => unknown | Promise<unknown>, expectedCode = "rejected") => {
  let rejected = false;
  try { await operation(); }
  catch (error) {
    rejected = expectedCode === "rejected" || (error instanceof Error && (error.message.includes(expectedCode) || (error as NodeJS.ErrnoException).code === expectedCode));
  }
  assert.ok(rejected, `Negative case did not reject as ${expectedCode}: ${name}`);
  negativeResults.push({name, status: "passed", expectedCode});
};

const validateFixturePlan = () => {
  return validateBrowserPlan(readJson(ROOT, PLAN_PATH));
};

const buildFontResponseMap = (metadataValue: unknown) => {
  const metadata = strictObject(metadataValue, ["fixtureVersion", "responses"], "Font fixture");
  assert.equal(metadata.fixtureVersion, 1);
  assert.ok(Array.isArray(metadata.responses) && metadata.responses.length === 2, "Exactly two next/font CSS responses are required.");
  const responseMap: Record<string, string> = {};
  const responseEvidence: JsonObject[] = [];
  for (const responseValue of metadata.responses) {
    const response = strictObject(responseValue, ["faces", "family", "url"], "Font response");
    assert.ok(typeof response.url === "string" && typeof response.family === "string");
    assert.ok(Array.isArray(response.faces) && response.faces.length === 3);
    const css: string[] = [];
    const faces: FileBinding[] = [];
    for (const faceValue of response.faces) {
      const face = strictObject(faceValue, ["file", "sha256", "subset", "unicodeRange"], "Font face");
      assert.equal(typeof face.file, "string");
      const binding = bindFile(ROOT, face.file as string);
      assert.equal(binding.sha256, face.sha256, `Font hash mismatch: ${face.file}`);
      faces.push(binding);
      const fontPath = repositoryPath(ROOT, face.file as string).replaceAll("\\", "\\\\").replaceAll("'", "\\'");
      css.push(`/* ${face.subset} */\n@font-face { font-family: '${response.family}'; font-style: normal; font-weight: 100 900; font-display: swap; src: url(${fontPath}) format('woff2'); unicode-range: ${face.unicodeRange}; }`);
    }
    responseMap[response.url as string] = css.join("\n");
    responseEvidence.push({url: response.url, family: response.family, faces, cssSha256: sha256Bytes(responseMap[response.url as string])});
  }
  assert.deepEqual(Object.keys(responseMap), [
    "https://fonts.googleapis.com/css2?family=Geist:wght@100..900&display=swap",
    "https://fonts.googleapis.com/css2?family=Geist+Mono:wght@100..900&display=swap",
  ], "Only the two exact checked-in next/font requests are allowed.");
  return {responseMap, responseEvidence};
};

const prepareFontMock = () => {
  const {responseMap, responseEvidence} = buildFontResponseMap(readJson(ROOT, FONT_METADATA_PATH));
  const path = `${TEMP_ROOT}/next-font-responses.cjs`;
  const bytes = `"use strict";\nmodule.exports = ${JSON.stringify(responseMap, null, 2)};\n`;
  writeFileSync(repositoryPath(ROOT, path), bytes, {encoding: "utf8", mode: 0o600});
  return {path: repositoryPath(ROOT, path), binding: bindFile(ROOT, FONT_METADATA_PATH), responseMap, responseEvidence};
};

const assertEnvironment = (browserPath: string, dependencyPath: string) => {
  assert.ok(existsSync(browserPath) && lstatSync(browserPath).isFile(), "Allowlisted local Google Chrome is missing.");
  assert.ok(existsSync(dependencyPath) && lstatSync(dependencyPath).isFile(), "Pinned playwright-core is missing.");
};

const assertAnchorTransition = (preimage: Uint8Array, replacement: Uint8Array, restored: Uint8Array) => {
  const preimageText = Buffer.from(preimage).toString("utf8");
  const replacementText = Buffer.from(replacement).toString("utf8");
  assert.equal(preimageText.split(ANCHOR_MARKER).length - 1, 1, "Anchor preimage is invalid.");
  assert.equal(replacementText.includes(ANCHOR_MARKER), false, "Anchor replacement retained its marker.");
  assert.ok(replacementText.includes(DRIVER_BINDING), "Anchor replacement is missing the driver binding.");
  assert.deepEqual(Buffer.from(restored), Buffer.from(preimage), "Anchor restoration differs from its preimage.");
};

const atomicWriteAnchor = (bytes: Uint8Array | string) => {
  const temporaryPath = repositoryPath(ROOT, `${TEMP_ROOT}/anchor-source.tmp`);
  mkdirSync(dirname(temporaryPath), {recursive: true, mode: 0o700});
  writeFileSync(temporaryPath, bytes);
  renameSync(temporaryPath, repositoryPath(ROOT, ANCHOR_PATH));
};

const installAnchor = () => {
  const path = repositoryPath(ROOT, ANCHOR_PATH);
  const bytes = readFileSync(path);
  const text = bytes.toString("utf8");
  assert.equal(text.split(ANCHOR_MARKER).length - 1, 1, "Anchor marker must appear exactly once.");
  anchorOriginal = bytes;
  anchorOriginalHash = sha256Bytes(bytes);
  const replaced = text.replace(`  ${ANCHOR_MARKER}`, DRIVER_INSTRUMENTATION);
  assert.notEqual(replaced, text);
  atomicWriteAnchor(replaced);
  anchorReplacementHash = sha256Bytes(replaced);
  assertAnchorTransition(bytes, Buffer.from(replaced), bytes);
};

const restoreAnchor = () => {
  if (anchorOriginal === null) return;
  atomicWriteAnchor(anchorOriginal);
  assert.equal(sha256Bytes(readFileSync(repositoryPath(ROOT, ANCHOR_PATH))), anchorOriginalHash, "Anchor byte restoration failed.");
};

const safeRemoveCompatibilityOwned = (path: string) => {
  const {absolute, local} = assertExtensionOwnedPath(path);
  if (!existsSync(absolute)) return;
  const parent = dirname(absolute);
  let current = ROOT;
  for (const part of relative(ROOT, parent).split(sep).filter(Boolean)) {
    current = resolve(current, part);
    verifyRealPathComponent(current);
  }
  const removeNode = (target: string) => {
    const status = lstatSync(target);
    if (status.isSymbolicLink() || status.isFile()) {
      rmSync(target, {force: false});
      return;
    }
    assert.equal(status.isDirectory(), true, `Unsupported owned cleanup node: ${relative(ROOT, target)}`);
    verifyRealPathComponent(target);
    for (const entry of readdirSync(target)) removeNode(resolve(target, entry));
    rmdirSync(target);
  };
  assert.equal(lstatSync(absolute).isSymbolicLink(), false, `Owned cleanup root is a symlink: ${local}`);
  removeNode(absolute);
};

const listCompatibilityEntries = (path: string): string[] => {
  const absolute = assertExtensionOwnedPath(path).absolute;
  if (!existsSync(absolute)) return [];
  verifyRealPathComponent(absolute);
  if (!lstatSync(absolute).isDirectory()) return [path];
  return readdirSync(absolute, {withFileTypes: true}).flatMap((entry) => {
    const child = `${path}/${entry.name}`;
    assert.equal(entry.isSymbolicLink(), false, `Compatibility output symlink rejected: ${child}`);
    return entry.isDirectory() ? listCompatibilityEntries(child) : [child];
  }).sort();
};

const ensureCompatibilityNoCollisions = () => {
  assert.ok(!existsSync(resolve(ROOT, NEXT_DIR)), "Refusing pre-existing .next collision.");
  const existing = listCompatibilityEntries(COMPATIBILITY_SYNTHETIC_ROOT);
  assert.deepEqual(existing, existing.length === 0 ? [] : [`${COMPATIBILITY_SYNTHETIC_ROOT}/negative-ledger.json`], "Compatibility runner permits only the self-test negative ledger at entry.");
  assertEnvironment(BROWSER_EXECUTABLE, resolve(ROOT, "node_modules/playwright-core/package.json"));
};

const runCompatibilityCollisionPreservationSelfTest = (graph: ValidatedTesterExtension) => {
  assert.equal(compatibilityOwnsNext, false);
  assert.equal(compatibilityOwnsTempRoot, false);
  const nextSentinel = `${NEXT_DIR}/spec0001-unowned-collision.txt`;
  const tempSentinel = `${COMPATIBILITY_TEMP_ROOT}/spec0001-unowned-collision.txt`;
  const sentinelBytes = "SPEC0001_UNOWNED_COLLISION_SENTINEL\n";
  ensureSafeExtensionDirectory(NEXT_DIR);
  ensureSafeExtensionDirectory(COMPATIBILITY_TEMP_ROOT);
  writeFileSync(secureExtensionFilePath(nextSentinel, true), sentinelBytes, {encoding: "utf8", mode: 0o640, flag: "wx"});
  writeFileSync(secureExtensionFilePath(tempSentinel, true), sentinelBytes, {encoding: "utf8", mode: 0o640, flag: "wx"});
  const expected = {
    sha256: sha256Bytes(sentinelBytes),
    nextMode: lstatSync(secureExtensionFilePath(nextSentinel)).mode & 0o7777,
    tempMode: lstatSync(secureExtensionFilePath(tempSentinel)).mode & 0o7777,
  };
  const executeCollision = () => spawnSync(process.execPath, ["--experimental-strip-types", repositoryPath(ROOT, "scripts/runSpec0001BrowserProof.ts"), `--plan=${graph.planBinding.path}`], {
    cwd: ROOT,
    env: {PATH: "/usr/bin:/bin", HOME: process.env.HOME, TMPDIR: process.env.TMPDIR, LANG: process.env.LANG, LC_ALL: process.env.LC_ALL, NODE_NO_WARNINGS: "1"} as unknown as NodeJS.ProcessEnv,
    encoding: "utf8",
    shell: false,
    maxBuffer: 16 * 1024 * 1024,
  });
  const cases: JsonObject[] = [];
  try {
    const nextCollision = executeCollision();
    assert.equal(nextCollision.status, 1, `Pre-existing .next collision did not reject: ${nextCollision.stderr}`);
    assert.match(nextCollision.stderr, /pre-existing \.next collision/i);
    assert.equal(sha256Bytes(readFileSync(secureExtensionFilePath(nextSentinel))), expected.sha256);
    assert.equal(sha256Bytes(readFileSync(secureExtensionFilePath(tempSentinel))), expected.sha256);
    assert.equal(lstatSync(secureExtensionFilePath(nextSentinel)).mode & 0o7777, expected.nextMode);
    assert.equal(lstatSync(secureExtensionFilePath(tempSentinel)).mode & 0o7777, expected.tempMode);
    cases.push({collision: ".next", exitCode: nextCollision.status, sentinelsPreserved: true});
    safeRemoveCompatibilityOwned(NEXT_DIR);

    const tempCollision = executeCollision();
    assert.equal(tempCollision.status, 1, `Pre-existing temporary collision did not reject: ${tempCollision.stderr}`);
    assert.match(tempCollision.stderr, /permits only the self-test negative ledger at entry/i);
    assert.equal(sha256Bytes(readFileSync(secureExtensionFilePath(tempSentinel))), expected.sha256);
    assert.equal(lstatSync(secureExtensionFilePath(tempSentinel)).mode & 0o7777, expected.tempMode);
    cases.push({collision: "temporary", exitCode: tempCollision.status, sentinelsPreserved: true});
  } finally {
    if (existsSync(assertExtensionOwnedPath(NEXT_DIR).absolute)) safeRemoveCompatibilityOwned(NEXT_DIR);
    if (existsSync(assertExtensionOwnedPath(COMPATIBILITY_TEMP_ROOT).absolute)) safeRemoveCompatibilityOwned(COMPATIBILITY_TEMP_ROOT);
  }
  assert.equal(compatibilityOwnsNext, false);
  assert.equal(compatibilityOwnsTempRoot, false);
  return {sentinelSha256: expected.sha256, sentinelByteLength: Buffer.byteLength(sentinelBytes), cases};
};

const atomicWriteCompatibilityAnchor = (bytes: Uint8Array | string) => {
  const temporaryPath = secureExtensionFilePath(`${COMPATIBILITY_TEMP_ROOT}/anchor-source.tmp`, true);
  writeFileSync(temporaryPath, bytes, {flag: "wx"});
  renameSync(temporaryPath, repositoryPath(ROOT, ANCHOR_PATH));
};

const installCompatibilityAnchor = () => {
  assert.ok(compatibilityGraph, "Compatibility graph is required before anchor installation.");
  const path = repositoryPath(ROOT, ANCHOR_PATH);
  const bytes = readFileSync(path);
  const text = bytes.toString("utf8");
  assert.equal(text.split(ANCHOR_MARKER).length - 1, 1, "Compatibility anchor marker must appear exactly once.");
  const phase2Profile = compatibilityGraph.adapter.executionProfile === "phase2-workspace-ports/v1";
  if (phase2Profile) {
    assert.equal(compatibilityGraph.adapter.workspacePortBinding, "spec0001Phase2BrowserPortsV1");
    assert.match(text, /\bspec0001Phase2BrowserPortsV1\b/, "Phase 2 workspace port object is absent from the exact anchor preimage.");
  } else assert.equal(compatibilityGraph.adapter.workspacePortBinding, null);
  compatibilityAnchorOriginal = bytes;
  compatibilityAnchorOriginalHash = sha256Bytes(bytes);
  const instrumentation = phase2Profile ? PHASE2_WORKSPACE_PORT_INSTRUMENTATION : COMPATIBILITY_DRIVER_INSTRUMENTATION;
  const replaced = text.replace(`  ${ANCHOR_MARKER}`, instrumentation);
  assert.notEqual(replaced, text);
  assert.equal(replaced.includes(ANCHOR_MARKER), false);
  assert.ok(replaced.includes(COMPATIBILITY_DRIVER_BINDING));
  atomicWriteCompatibilityAnchor(replaced);
  compatibilityAnchorReplacementHash = sha256Bytes(replaced);
  assert.notEqual(compatibilityAnchorReplacementHash, compatibilityAnchorOriginalHash);
};

const restoreCompatibilityAnchor = () => {
  if (compatibilityAnchorOriginal === null) return;
  atomicWriteCompatibilityAnchor(compatibilityAnchorOriginal);
  assert.equal(sha256Bytes(readFileSync(repositoryPath(ROOT, ANCHOR_PATH))), compatibilityAnchorOriginalHash, "Compatibility anchor byte restoration failed.");
};

const prepareCompatibilityFontMock = () => {
  const {responseMap, responseEvidence} = buildFontResponseMap(readJson(ROOT, FONT_METADATA_PATH));
  const path = `${COMPATIBILITY_TEMP_ROOT}/next-font-responses.cjs`;
  const bytes = `"use strict";\nmodule.exports = ${JSON.stringify(responseMap, null, 2)};\n`;
  writeFileSync(secureExtensionFilePath(path, true), bytes, {encoding: "utf8", mode: 0o600, flag: "wx"});
  return {path: secureExtensionFilePath(path), binding: bindFile(ROOT, FONT_METADATA_PATH), responseMap, responseEvidence};
};

const COMPATIBILITY_NETWORK_GUARD_V2_SOURCE = `"use strict";
const fs = require("node:fs");
const http = require("node:http");
const https = require("node:https");
const net = require("node:net");
const tls = require("node:tls");
const dns = require("node:dns");
const childProcess = require("node:child_process");
const path = require("node:path");
const ledgerPath = process.env.SPEC0001_NETWORK_LEDGER || "";
const root = process.env.SPEC0001_REPOSITORY_ROOT || "";
const frozenGuard = root + "/scripts/spec0001-browser/networkDeny.cjs";
const thisGuard = __filename;
require(frozenGuard);
const record = (entry) => { if (ledgerPath) fs.appendFileSync(ledgerPath, JSON.stringify({...entry, pid: process.pid, at: new Date().toISOString()}) + "\\n", {encoding: "utf8", mode: 0o600}); };
const denied = (primitive, target) => { const error = new Error("SPEC0001_NETWORK_DENIED:" + primitive + ":" + target); error.code = "SPEC0001_NETWORK_DENIED"; record({result: "denied", primitive, target: String(target).slice(0, 240)}); return error; };
const nextVersionTarget = "https://registry.npmjs.org/-/package/next/dist-tags";
const nextVersionModule = require.resolve(root + "/node_modules/next/dist/server/dev/hot-reloader-shared-utils.js");
const nextVersionExports = require(nextVersionModule);
if (Object.keys(nextVersionExports).sort().join(",") !== "getVersionInfo,matchNextPageBundleRequest" || typeof nextVersionExports.matchNextPageBundleRequest !== "function") throw new Error("Compatibility Next version-info module shape drifted.");
const installedNextVersion = require(root + "/node_modules/next/package.json").version;
const compatibilityGetVersionInfo = async () => { record({result: "suppressed", primitive: "v2.framework.next.getVersionInfo", target: nextVersionTarget}); return {installed: installedNextVersion, staleness: "unknown"}; };
require.cache[nextVersionModule].exports = {__esModule: true, getVersionInfo: compatibilityGetVersionInfo, matchNextPageBundleRequest: nextVersionExports.matchNextPageBundleRequest};
const telemetryStorageModule = require.resolve(root + "/node_modules/next/dist/telemetry/storage.js");
const telemetryStorageExports = require(telemetryStorageModule);
if (Object.keys(telemetryStorageExports).join(",") !== "Telemetry" || typeof telemetryStorageExports.Telemetry !== "function") throw new Error("Compatibility Next telemetry module shape drifted.");
const OriginalTelemetry = telemetryStorageExports.Telemetry;
const compatibilityTelemetryTarget = "dev:repository-root";
const suppressTelemetryDetached = (mode, dir) => { if (process.env.NEXT_TELEMETRY_DISABLED !== "1" || mode !== "dev" || path.resolve(String(dir || "")) !== root) return false; record({result: "suppressed", primitive: "v2.framework.next.telemetry.flushDetached", target: compatibilityTelemetryTarget}); return true; };
const wrapTelemetryInstance = (instance) => { if (!instance || typeof instance.flushDetached !== "function") throw new Error("Compatibility Next telemetry instance shape drifted."); const prior = instance.flushDetached; instance.flushDetached = function(mode, dir) { if (suppressTelemetryDetached(mode, dir)) return; return prior.call(this, mode, dir); }; return instance; };
class CompatibilityTelemetry extends OriginalTelemetry { constructor(options) { super(options); return wrapTelemetryInstance(this); } }
require.cache[telemetryStorageModule].exports = {__esModule: true, Telemetry: CompatibilityTelemetry};
const normalizedHost = (value) => String(value || "").replace(/^\\[|\\]$/g, "").toLowerCase();
const exactLoopback = (value) => { const host = normalizedHost(value); const family = net.isIP(host); return family === 4 ? host.split(".")[0] === "127" : family === 6 && host === "::1"; };
const parseUrl = (input) => { try { if (input instanceof URL) return input; if (typeof input === "string") return new URL(input); if (input && typeof input.href === "string") return new URL(input.href); const protocol = input && input.protocol ? input.protocol : "http:"; const host = input && (input.hostname || input.host) ? input.hostname || input.host : ""; const port = input && input.port ? ":" + input.port : ""; const path = input && input.path ? input.path : "/"; return new URL(protocol + "//" + host + port + path); } catch { return null; } };
const wrapHttp = (primitive, prior) => function(input, ...args) { const url = parseUrl(input); if (!url || !exactLoopback(url.hostname)) throw denied(primitive, url ? url.origin : "malformed"); return prior.call(this, input, ...args); };
if (typeof globalThis.fetch === "function") { const prior = globalThis.fetch; globalThis.fetch = async function(input, init) { const url = parseUrl(input); if (!url || !exactLoopback(url.hostname)) throw denied("v2.fetch", url ? url.origin : "malformed"); return prior.call(this, input, init); }; }
http.request = wrapHttp("v2.http.request", http.request);
http.get = wrapHttp("v2.http.get", http.get);
https.request = wrapHttp("v2.https.request", https.request);
https.get = wrapHttp("v2.https.get", https.get);
const socketHost = (args) => { const first = args[0]; if (first && typeof first === "object") return first.host || first.hostname || ""; return typeof args[1] === "string" ? args[1] : ""; };
const wrapSocket = (primitive, prior) => function(...args) { const host = socketHost(args); if (!exactLoopback(host)) throw denied(primitive, host || "missing-host"); return prior.apply(this, args); };
net.connect = wrapSocket("v2.net.connect", net.connect);
net.createConnection = wrapSocket("v2.net.createConnection", net.createConnection);
tls.connect = wrapSocket("v2.tls.connect", tls.connect);
const wrapDns = (primitive, prior) => function(host, ...args) { if (exactLoopback(host)) return prior.call(this, host, ...args); const error = denied(primitive, host || "missing-host"); const callback = args.find((entry) => typeof entry === "function"); if (callback) { queueMicrotask(() => callback(error)); return; } throw error; };
dns.lookup = wrapDns("v2.dns.lookup", dns.lookup);
dns.resolve = wrapDns("v2.dns.resolve", dns.resolve);
dns.reverse = wrapDns("v2.dns.reverse", dns.reverse);
if (dns.promises) { const lookup = dns.promises.lookup.bind(dns.promises); const resolve = dns.promises.resolve.bind(dns.promises); const reverse = dns.promises.reverse.bind(dns.promises); dns.promises.lookup = async (host, options) => exactLoopback(host) ? lookup(host, options) : Promise.reject(denied("v2.dns.promises.lookup", host)); dns.promises.resolve = async (host, rrtype) => exactLoopback(host) ? resolve(host, rrtype) : Promise.reject(denied("v2.dns.promises.resolve", host)); dns.promises.reverse = async (host) => exactLoopback(host) ? reverse(host) : Promise.reject(denied("v2.dns.promises.reverse", host)); }
const allowedModules = new Set([root + "/node_modules/next/dist/server/lib/start-server.js", root + "/node_modules/next/dist/compiled/jest-worker/processChild.js"]);
const allowedNodeOptions = new Set(["--require=" + thisGuard, "--require=" + thisGuard + " --enable-source-maps"]);
const sensitiveEnvironment = ["NODE_PATH", "LD_PRELOAD", "DYLD_INSERT_LIBRARIES", "DYLD_LIBRARY_PATH", "NODE_REPL_EXTERNAL_MODULE", "NODE_V8_COVERAGE", "NODE_ICU_DATA", "OPENSSL_CONF", "SSL_CERT_FILE", "SSL_CERT_DIR"];
const allowedEnvironmentChange = (key) => key === "NODE_OPTIONS" || key === "JEST_WORKER_ID" || key === "IS_NEXT_WORKER" || key === "FORCE_COLOR" || key === "WATCHPACK_WATCHER_LIMIT" || key === "TURBOPACK" || key === "NODE_EXTRA_CA_CERTS" || key.startsWith("NEXT_PRIVATE_");
const inheritedGuardEnvironment = (options) => { const env = options && options.env ? options.env : process.env; if (env.SPEC0001_NETWORK_LEDGER !== process.env.SPEC0001_NETWORK_LEDGER || env.SPEC0001_REPOSITORY_ROOT !== process.env.SPEC0001_REPOSITORY_ROOT || !allowedNodeOptions.has(String(env.NODE_OPTIONS || ""))) return false; for (const key of sensitiveEnvironment) if (env[key] !== process.env[key]) return false; for (const key of Object.keys(process.env)) if (!(key in env) && !allowedEnvironmentChange(key)) return false; for (const key of Object.keys(env)) if (env[key] !== process.env[key] && !allowedEnvironmentChange(key)) return false; return true; };
const closedChildOptions = (options, fork) => { if (options && options.shell !== undefined && options.shell !== false) return false; if (fork && options && options.execPath !== undefined && options.execPath !== process.execPath) return false; const effectiveExecArgv = fork ? (options && options.execArgv !== undefined ? options.execArgv : process.execArgv) : []; if (fork && (!Array.isArray(effectiveExecArgv) || effectiveExecArgv.length !== 0)) return false; return true; };
const priorSpawn = childProcess.spawn;
childProcess.spawn = function(command, args, options) { const argv = Array.isArray(args) ? args : []; const childOptions = Array.isArray(args) ? options : args; if (command !== process.execPath || argv.length !== 1 || !allowedModules.has(argv[0]) || !inheritedGuardEnvironment(childOptions) || !closedChildOptions(childOptions, false)) throw denied("v2.child_process.spawn", command + ":" + argv.join(" ")); return priorSpawn.call(this, command, args, options); };
const priorSpawnSync = childProcess.spawnSync;
childProcess.spawnSync = function(command, args, options) { const argv = Array.isArray(args) ? args : []; const childOptions = Array.isArray(args) ? options : args; if (command !== process.execPath || argv.length !== 1 || !allowedModules.has(argv[0]) || !inheritedGuardEnvironment(childOptions) || !closedChildOptions(childOptions, false)) throw denied("v2.child_process.spawnSync", command + ":" + argv.join(" ")); return priorSpawnSync.call(this, command, args, options); };
const priorFork = childProcess.fork;
childProcess.fork = function(modulePath, args, options) { const argv = Array.isArray(args) ? args : []; const childOptions = Array.isArray(args) ? options : args; if (argv.length !== 0 || !allowedModules.has(String(modulePath)) || !inheritedGuardEnvironment(childOptions) || !closedChildOptions(childOptions, true)) throw denied("v2.child_process.fork", modulePath); return priorFork.call(this, modulePath, argv, childOptions); };
globalThis.__SPEC0001_COMPATIBILITY_NETWORK_SELF_TEST_V2 = async () => { const checks = []; const expect = async (name, operation) => { try { await operation(); checks.push({name, denied: false}); } catch (error) { checks.push({name, denied: Boolean(error && error.code === "SPEC0001_NETWORK_DENIED")}); } }; const startServer = root + "/node_modules/next/dist/server/lib/start-server.js"; const processChild = root + "/node_modules/next/dist/compiled/jest-worker/processChild.js"; const detachedFlush = root + "/node_modules/next/dist/telemetry/detached-flush.js"; await expect("deceptive-127-host", () => http.request("http://127.attacker.example/spec0001")); await expect("node-next-marker", () => childProcess.spawn(process.execPath, [root + "/node_modules/next/deceptive-marker.js"], {env: process.env})); await expect("next-child-env-stripping", () => childProcess.fork(startServer, [], {env: {}})); await expect("next-child-appended-preload", () => childProcess.spawn(process.execPath, [processChild], {env: {...process.env, NODE_OPTIONS: process.env.NODE_OPTIONS + " --require=/tmp/spec0001-evil.cjs"}})); await expect("next-child-shell", () => childProcess.spawn(process.execPath, [processChild], {env: process.env, shell: true})); await expect("next-fork-exec-path", () => childProcess.fork(startServer, [], {env: process.env, execPath: "/bin/sh"})); await expect("next-fork-exec-argv", () => childProcess.fork(startServer, [], {env: process.env, execArgv: ["--require=/tmp/spec0001-evil.cjs"]})); await expect("next-child-loader-env", () => childProcess.spawn(process.execPath, [processChild], {env: {...process.env, NODE_PATH: "/tmp/spec0001-evil-modules"}})); await expect("next-fork-inherited-exec-argv", () => childProcess.fork(startServer, [], {env: process.env})); const versionInfo = await require(nextVersionModule).getVersionInfo(); if (versionInfo.installed !== installedNextVersion || versionInfo.staleness !== "unknown") throw new Error("Compatibility Next version-info suppression self-test failed."); checks.push({name: "next-version-info-suppressed", denied: false, suppressed: true}); await expect("next-version-info-direct-fetch", () => globalThis.fetch(nextVersionTarget)); let telemetryFallbackCalled = false; const telemetryProbe = wrapTelemetryInstance({flushDetached() { telemetryFallbackCalled = true; }}); telemetryProbe.flushDetached("dev", root); if (telemetryFallbackCalled) throw new Error("Compatibility Next telemetry suppression self-test failed."); checks.push({name: "next-telemetry-flush-suppressed", denied: false, suppressed: true}); await expect("next-telemetry-detached-spawn", () => childProcess.spawn(process.execPath, [detachedFlush, "dev", root, "_events_" + process.pid + ".json"], {detached: true, windowsHide: true, shell: false})); if (!checks.every((entry) => entry.denied === true || entry.suppressed === true)) throw new Error("Compatibility v2 network guard self-test failed: " + JSON.stringify(checks)); return checks; };
`;

const prepareCompatibilityNetworkGuardV2 = () => {
  const path = `${COMPATIBILITY_TEMP_ROOT}/network-guard-v2.cjs`;
  const absolute = secureExtensionFilePath(path, true);
  writeFileSync(absolute, COMPATIBILITY_NETWORK_GUARD_V2_SOURCE, {encoding: "utf8", mode: 0o600, flag: "wx"});
  compatibilityNetworkGuardV2Path = absolute;
  return {path: absolute, byteLength: Buffer.byteLength(COMPATIBILITY_NETWORK_GUARD_V2_SOURCE), sha256: sha256Bytes(COMPATIBILITY_NETWORK_GUARD_V2_SOURCE)};
};

const allocatePort = () => new Promise<number>((resolvePort, reject) => {
  const server = createServer();
  server.unref();
  server.once("error", reject);
  server.listen(0, "127.0.0.1", () => {
    const address = server.address();
    assert.ok(address && typeof address === "object");
    const port = address.port;
    server.close((error) => error ? reject(error) : resolvePort(port));
  });
});

const scrubbedEnvironment = (fontMockPath: string) => {
  const env = {} as NodeJS.ProcessEnv;
  for (const key of ["PATH", "TMPDIR", "TEMP", "TMP", "LANG", "LC_ALL", "SHELL", "TERM"]) {
    if (process.env[key]) env[key] = process.env[key];
  }
  return {
    ...env,
    NEXT_TELEMETRY_DISABLED: "1",
    NEXT_FONT_GOOGLE_MOCKED_RESPONSES: fontMockPath,
    NODE_OPTIONS: `--require=${repositoryPath(ROOT, NETWORK_GUARD_PATH)}`,
    SPEC0001_NETWORK_LEDGER: repositoryPath(ROOT, NETWORK_LEDGER),
    SPEC0001_REPOSITORY_ROOT: ROOT,
  };
};

const waitForHttp = async (url: string, timeoutMs = 120_000) => {
  const deadline = Date.now() + timeoutMs;
  let lastError = "not started";
  while (Date.now() < deadline) {
    try {
      const status = await new Promise<number>((resolveStatus, reject) => {
        const request = httpGet(url, (response) => {
          response.resume();
          response.on("end", () => resolveStatus(response.statusCode ?? 0));
        });
        request.setTimeout(2_000, () => request.destroy(new Error("timeout")));
        request.on("error", reject);
      });
      if (status >= 200 && status < 500) return status;
      lastError = `status ${status}`;
    } catch (error) { lastError = error instanceof Error ? error.message : String(error); }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 250));
  }
  throw new Error(`Server readiness timeout: ${lastError}`);
};

const startServer = async (mode: "development" | "production", fontMockPath: string): Promise<RunningServer> => {
  const port = await allocatePort();
  ownedPorts.add(port);
  const nextBin = repositoryPath(ROOT, "node_modules/next/dist/bin/next");
  const args = mode === "development"
    ? [nextBin, "dev", "--webpack", "--hostname", "127.0.0.1", "--port", String(port)]
    : [nextBin, "start", "--hostname", "127.0.0.1", "--port", String(port)];
  const child = spawn(process.execPath, args, {
    cwd: ROOT,
    env: scrubbedEnvironment(fontMockPath),
    shell: false,
    detached: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout?.on("data", (chunk) => appendFileSync(repositoryPath(ROOT, SERVER_LOG), chunk));
  child.stderr?.on("data", (chunk) => appendFileSync(repositoryPath(ROOT, SERVER_LOG), chunk));
  const running = {child, port, mode};
  activeServer = running;
  try {
    await new Promise<void>((resolveSpawn, rejectSpawn) => {
      child.once("spawn", resolveSpawn);
      child.once("error", rejectSpawn);
    });
  } catch (error) {
    if (activeServer === running) activeServer = null;
    await provePortReleased(port);
    throw error;
  }
  child.once("exit", (code, signal) => {
    if (activeServer?.child === child && code !== 0 && signal !== "SIGTERM") {
      appendJsonLine(CONSOLE_LEDGER, {source: "server", type: "unexpected-exit", code, signal});
    }
  });
  await waitForHttp(`http://127.0.0.1:${port}/`);
  return running;
};

const compatibilityScrubbedEnvironment = (fontMockPath: string) => {
  assert.ok(compatibilityNetworkGuardV2Path, "Compatibility v2 network guard must be prepared before server startup.");
  const env = {} as NodeJS.ProcessEnv;
  for (const key of ["PATH", "TMPDIR", "TEMP", "TMP", "LANG", "LC_ALL", "SHELL", "TERM"]) {
    if (process.env[key]) env[key] = process.env[key];
  }
  return {
    ...env,
    NEXT_TELEMETRY_DISABLED: "1",
    NEXT_DISABLE_MEM_OVERRIDE: "1",
    NEXT_FONT_GOOGLE_MOCKED_RESPONSES: fontMockPath,
    NODE_OPTIONS: `--require=${compatibilityNetworkGuardV2Path}`,
    SPEC0001_NETWORK_LEDGER: secureExtensionFilePath(COMPATIBILITY_SERVER_NETWORK_LEDGER, true),
    SPEC0001_REPOSITORY_ROOT: ROOT,
  };
};

const claimCompatibilityNextOutput = () => {
  const nextPath = assertExtensionOwnedPath(NEXT_DIR).absolute;
  if (existsSync(nextPath)) assert.equal(compatibilityOwnsNext, true, "Refusing an unowned pre-existing .next directory.");
  else compatibilityOwnsNext = true;
};

const removeCompatibilityNextIfOwned = () => {
  if (!compatibilityOwnsNext) return;
  const nextPath = assertExtensionOwnedPath(NEXT_DIR).absolute;
  if (existsSync(nextPath)) safeRemoveCompatibilityOwned(NEXT_DIR);
  compatibilityOwnsNext = false;
};

const startCompatibilityServer = async (mode: "development" | "production", fontMockPath: string): Promise<RunningServer> => {
  claimCompatibilityNextOutput();
  const port = await allocatePort();
  ownedPorts.add(port);
  const nextBin = repositoryPath(ROOT, "node_modules/next/dist/bin/next");
  const args = mode === "development"
    ? [nextBin, "dev", "--webpack", "--hostname", "127.0.0.1", "--port", String(port)]
    : [nextBin, "start", "--hostname", "127.0.0.1", "--port", String(port)];
  const child = spawn(process.execPath, args, {
    cwd: ROOT,
    env: compatibilityScrubbedEnvironment(fontMockPath),
    shell: false,
    detached: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout?.on("data", (chunk) => appendFileSync(secureExtensionFilePath(COMPATIBILITY_SERVER_LOG), chunk));
  child.stderr?.on("data", (chunk) => appendFileSync(secureExtensionFilePath(COMPATIBILITY_SERVER_LOG), chunk));
  const running = {child, port, mode};
  activeServer = running;
  try {
    await new Promise<void>((resolveSpawn, rejectSpawn) => {
      child.once("spawn", resolveSpawn);
      child.once("error", rejectSpawn);
    });
  } catch (error) {
    if (activeServer === running) activeServer = null;
    await provePortReleased(port);
    throw error;
  }
  await waitForHttp(`http://127.0.0.1:${port}/`);
  return running;
};

const provePortReleased = async (port: number) => {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    const released = await new Promise<boolean>((resolveReleased) => {
      const probe = createServer();
      probe.once("error", () => resolveReleased(false));
      probe.listen(port, "127.0.0.1", () => probe.close((error) => resolveReleased(!error)));
    });
    if (released) {
      ownedPorts.delete(port);
      return;
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 100));
  }
  throw new Error(`Loopback port ${port} was not released within 5000ms.`);
};

const proveProcessGroupReleased = (pid: number) => {
  assert.ok(Number.isSafeInteger(pid) && pid > 1, "Process-group release proof requires a positive child PID.");
  try {
    process.kill(-pid, 0);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ESRCH") return;
    throw error;
  }
  throw new Error(`Server process group ${pid} remains alive after cleanup.`);
};

const waitForChildEvent = (child: ChildProcess, event: "exit" | "close", timeoutMs: number) => new Promise<void>((resolveEvent, rejectTimeout) => {
  if (event === "exit" && (child.exitCode !== null || child.signalCode !== null)) { resolveEvent(); return; }
  if (event === "close" && [child.stdout, child.stderr].every((stream) => stream === null || stream.readableEnded || stream.destroyed)) { resolveEvent(); return; }
  const timeout = setTimeout(() => rejectTimeout(new Error(`Server child did not emit ${event} within ${timeoutMs}ms.`)), timeoutMs);
  child.once(event, () => { clearTimeout(timeout); resolveEvent(); });
});

const waitForChildPipesClosed = async (child: ChildProcess) => {
  const pipesClosed = [child.stdout, child.stderr].every((stream) => stream === null || stream.readableEnded || stream.destroyed);
  if (!pipesClosed) await waitForChildEvent(child, "close", 5_000);
};

const stopServer = async (server: RunningServer | null) => {
  if (!server || server.child.exitCode !== null || server.child.signalCode !== null) {
    if (activeServer === server) activeServer = null;
    if (server) {
      const exitedPid = server.child.pid;
      assert.ok(Number.isSafeInteger(exitedPid) && (exitedPid ?? 0) > 1, "Exited server is missing its positive child PID.");
      await waitForChildPipesClosed(server.child);
      proveProcessGroupReleased(exitedPid!);
      if (ownedPorts.has(server.port)) await provePortReleased(server.port);
    }
    return;
  }
  const pid = server.child.pid;
  assert.ok(Number.isSafeInteger(pid) && (pid ?? 0) > 1, "Refusing process-group cleanup without a positive child PID.");
  try { process.kill(-pid!, "SIGTERM"); }
  catch { try { server.child.kill("SIGTERM"); } catch {} }
  try { await waitForChildEvent(server.child, "exit", 8_000); } catch {}
  if (server.child.exitCode === null && server.child.signalCode === null) {
    try { process.kill(-pid!, "SIGKILL"); } catch { try { server.child.kill("SIGKILL"); } catch {} }
    await waitForChildEvent(server.child, "exit", 5_000);
  }
  await waitForChildPipesClosed(server.child);
  if (activeServer === server) activeServer = null;
  proveProcessGroupReleased(pid!);
  await provePortReleased(server.port);
};

const browserRoute = async (route: Route, apiResponse: unknown | null, networkMode: "enforce" | "self-test") => {
  const request = route.request();
  const url = new URL(request.url());
  const isLoopback = url.hostname === "127.0.0.1" || url.hostname === "::1";
  const entry = {at: now(), method: request.method(), protocol: url.protocol, host: url.host, path: url.pathname, allowed: isLoopback, selfTest: networkMode === "self-test"};
  browserNetwork.push(entry);
  appendJsonLine(BROWSER_LEDGER, entry);
  if (!isLoopback) {
    await route.abort("blockedbyclient");
    const violation = {...entry, code: "SPEC0001_BROWSER_NETWORK_DENIED"};
    (networkMode === "enforce" ? browserPolicyViolations : expectedBrowserDenials).push(violation);
    return;
  }
  if (url.pathname === "/api/ai") {
    assert.ok(apiResponse !== null, "Unexpected /api/ai request outside Drawing proof.");
    assert.equal(request.method(), "POST");
    const body = request.postDataJSON() as JsonObject;
    assert.equal(body.workspaceType, "drawing");
    assert.equal(body.taskType, "generate-frames");
    assert.equal(body.prompt, FIXED_DRAWING_PROMPT);
    if (requestRecords.length !== 0) {
      const violation = {...entry, code: "SPEC0001_SECOND_DRAWING_REQUEST_DENIED"};
      browserPolicyViolations.push(violation);
      await route.abort("blockedbyclient");
      return;
    }
    requestRecords.push({method: "POST", path: "/api/ai", requestBodySha256: sha256Bytes(JSON.stringify(body)), responseBodySha256: sha256Bytes(JSON.stringify(apiResponse))});
    await route.fulfill({status: 200, contentType: "application/json", body: JSON.stringify(apiResponse)});
    appendJsonLine(BROWSER_LEDGER, {at: now(), method: "POST", path: "/api/ai", fulfilled: true, status: 200});
    return;
  }
  await route.continue();
};

const browserWebSocketRoute = async (webSocket: WebSocketRoute, networkMode: "enforce" | "self-test") => {
  const url = new URL(webSocket.url());
  const isLoopback = url.hostname === "127.0.0.1" || url.hostname === "::1";
  const entry = {at: now(), method: "WEBSOCKET", protocol: url.protocol, host: url.host, path: url.pathname, allowed: isLoopback, selfTest: networkMode === "self-test"};
  browserNetwork.push(entry);
  appendJsonLine(BROWSER_LEDGER, entry);
  if (!isLoopback) {
    const violation = {...entry, code: "SPEC0001_BROWSER_NETWORK_DENIED"};
    (networkMode === "enforce" ? browserPolicyViolations : expectedBrowserDenials).push(violation);
    await webSocket.close({code: 1008, reason: "SPEC0001_BROWSER_NETWORK_DENIED"});
    return;
  }
  webSocket.connectToServer();
};

const compatibilityBrowserRoute = async (route: Route, apiResponse: unknown | null, selfTest = false) => {
  const request = route.request();
  const url = new URL(request.url());
  const isLoopback = url.hostname === "127.0.0.1" || url.hostname === "::1";
  const entry = {at: now(), channel: "browser", method: request.method(), protocol: url.protocol, host: url.host, path: url.pathname, allowed: isLoopback, expectedSelfTest: selfTest};
  compatibilityBrowserNetwork.push(entry);
  appendExtensionJsonLine(COMPATIBILITY_BROWSER_NETWORK_LEDGER, entry);
  if (!isLoopback) {
    await route.abort("blockedbyclient");
    const denial = {...entry, code: "SPEC0001_BROWSER_NETWORK_DENIED"};
    (selfTest ? compatibilityExpectedDenials : compatibilityPolicyViolations).push(denial);
    return;
  }
  if (url.pathname === "/api/ai") {
    if (apiResponse === null || compatibilityRequests.length !== 0) {
      compatibilityPolicyViolations.push({...entry, code: "SPEC0001_UNEXPECTED_API_REQUEST"});
      await route.abort("blockedbyclient");
      return;
    }
    assert.equal(request.method(), "POST");
    const body = request.postDataJSON() as JsonObject;
    assert.equal(body.workspaceType, "drawing");
    assert.equal(body.taskType, "generate-frames");
    assert.equal(body.prompt, FIXED_DRAWING_PROMPT);
    compatibilityRequests.push({method: "POST", path: "/api/ai", requestBodySha256: sha256Bytes(JSON.stringify(body)), responseBodySha256: sha256Bytes(JSON.stringify(apiResponse))});
    await route.fulfill({status: 200, contentType: "application/json", body: JSON.stringify(apiResponse)});
    return;
  }
  await route.continue();
};

const compatibilityBrowserWebSocketRoute = async (webSocket: WebSocketRoute, selfTest = false) => {
  const url = new URL(webSocket.url());
  const isLoopback = url.hostname === "127.0.0.1" || url.hostname === "::1";
  const entry = {at: now(), channel: "browser", method: "WEBSOCKET", protocol: url.protocol, host: url.host, path: url.pathname, allowed: isLoopback, expectedSelfTest: selfTest};
  compatibilityBrowserNetwork.push(entry);
  appendExtensionJsonLine(COMPATIBILITY_BROWSER_NETWORK_LEDGER, entry);
  if (!isLoopback) {
    const denial = {...entry, code: "SPEC0001_BROWSER_NETWORK_DENIED"};
    (selfTest ? compatibilityExpectedDenials : compatibilityPolicyViolations).push(denial);
    await webSocket.close({code: 1008, reason: "SPEC0001_BROWSER_NETWORK_DENIED"});
    return;
  }
  webSocket.connectToServer();
};

const validateCompatibilityDriverMessage = (value: unknown): {operation: string; payload: JsonObject} => {
  const envelope = strictObject(value, ["contractVersion", "operation", "payload"], "Compatibility driver envelope");
  assert.equal(envelope.contractVersion, 2);
  assert.ok(envelope.operation === "tester.connection.ping/v2" || envelope.operation === "compatibility.command-result/v2", "Unknown compatibility driver operation.");
  const payload = strictObject(envelope.payload, envelope.operation === "tester.connection.ping/v2"
    ? ["adapterKind", "connected", "transport"]
    : ["checkpoint", "commandId", "operation", "response"], "Compatibility driver payload");
  if (envelope.operation === "tester.connection.ping/v2") {
    assert.deepEqual(payload, {connected: true, transport: "playwright-binding", adapterKind: compatibilityGraph?.adapter.adapterKind});
  } else {
    assert.equal(typeof payload.commandId, "string");
    assert.equal(typeof payload.operation, "string");
    const response = strictObject(payload.response, Object.keys(payload.response as JsonObject).sort(), "Compatibility command response");
    assert.ok(Object.keys(response).length > 0, "Compatibility command response cannot be empty.");
    if (compatibilityGraph?.adapter.executionProfile === "synthetic-state-machine/v1") {
      strictObject(payload.checkpoint, ["fixtureId", "joints", "lastPublication", "pointer", "publications", "revision", "selectedPart"], "Compatibility workspace checkpoint");
    } else strictObject(payload.checkpoint, Object.keys(payload.checkpoint as JsonObject).sort(), "Phase 2 workspace checkpoint");
  }
  return {operation: envelope.operation as string, payload};
};

const createCompatibilityContext = async (
  contextId: string,
  viewport: {width: number; height: number},
  port: number,
  apiResponse: unknown | null = null,
  selfTest = false,
) => {
  const profile = `${COMPATIBILITY_TEMP_ROOT}/profiles/${contextId}`;
  assert.ok(!existsSync(repositoryPath(ROOT, profile)), `Compatibility profile collision: ${profile}`);
  ensureSafeExtensionDirectory(profile);
  ownedProfiles.add(profile);
  const context = await chromium.launchPersistentContext(repositoryPath(ROOT, profile), {
    executablePath: BROWSER_EXECUTABLE,
    headless: true,
    handleSIGINT: false,
    handleSIGTERM: false,
    handleSIGHUP: false,
    serviceWorkers: "block",
    viewport,
    args: [
      "--disable-background-networking", "--disable-component-update", "--disable-default-apps",
      "--disable-extensions", "--disable-sync", "--metrics-recording-only", "--no-first-run", "--no-default-browser-check",
    ],
  });
  const browserVersion = context.browser()?.version();
  assert.ok(browserVersion);
  compatibilityBrowserVersions.add(browserVersion);
  activeContext = context;
  compatibilityOwnedContexts.set(context, profile);
  await context.route("**/*", (route) => compatibilityBrowserRoute(route, apiResponse, selfTest));
  await context.routeWebSocket("**/*", (webSocket) => compatibilityBrowserWebSocketRoute(webSocket, selfTest));
  await context.exposeBinding(COMPATIBILITY_DRIVER_BINDING, async (_source, value) => {
    const envelope = validateCompatibilityDriverMessage(value);
    const message = {contextId, operation: envelope.operation, payload: envelope.payload};
    compatibilityDriverMessages.push(message);
    if (envelope.operation === "compatibility.command-result/v2") {
      const pending = compatibilityPendingCommands.get(String(envelope.payload.commandId));
      if (pending) {
        compatibilityPendingCommands.delete(String(envelope.payload.commandId));
        if (pending.contextId !== contextId || pending.operation !== envelope.payload.operation) pending.reject(new Error(`Compatibility command response binding mismatch: ${String(envelope.payload.commandId)}`));
        else pending.resolve(message);
      }
    }
  });
  const page = context.pages()[0] ?? await context.newPage();
  page.on("pageerror", (error) => {
    const entry = {at: now(), contextId, type: "pageerror", message: error.message.slice(0, 500)};
    compatibilityConsole.push(entry);
    appendExtensionJsonLine(COMPATIBILITY_BROWSER_CONSOLE_LEDGER, entry);
  });
  page.on("console", (message) => {
    if (message.type() !== "warning" && message.type() !== "error") return;
    const entry = {at: now(), contextId, type: message.type(), message: message.text().slice(0, 500), expectedSelfTest: selfTest};
    if (!selfTest) compatibilityConsole.push(entry);
    appendExtensionJsonLine(COMPATIBILITY_BROWSER_CONSOLE_LEDGER, entry);
  });
  await page.goto(`http://127.0.0.1:${port}/`, {waitUntil: "domcontentloaded"});
  await readCompatibilityStorage(page, contextId, "after-navigation");
  return {context, page, profile};
};

const closeCompatibilityContext = async (context: BrowserContext, profile: string) => {
  const contextId = profile.split("/").at(-1)!;
  const page = context.pages()[0];
  if (page) await readCompatibilityStorage(page, contextId, "before-close");
  await context.close();
  compatibilityOwnedContexts.delete(context);
  if (activeContext === context) activeContext = null;
  safeRemoveCompatibilityOwned(profile);
  ownedProfiles.delete(profile);
};

const assertNoBrowserPolicyViolations = (violations: readonly JsonObject[]) => {
  assert.deepEqual(violations, [], `Blocked non-loopback browser attempts fail the run: ${stableJson(violations)}`);
};

const assertConsolePolicy = () => {
  const errors = consoleRecords.filter((entry) => entry.type === "pageerror" || entry.type === "error");
  const warnings = consoleRecords.filter((entry) => entry.type === "warning");
  assert.deepEqual(errors, [], "Browser console/page errors are forbidden.");
  for (const warning of warnings) {
    assert.ok(ACCEPTED_CONSOLE_WARNING_PATTERNS.some((pattern) => new RegExp(pattern).test(String(warning.message))), `Unexpected browser warning: ${warning.message}`);
  }
  const ledger = readFileSync(repositoryPath(ROOT, CONSOLE_LEDGER), "utf8").trim().split("\n").filter(Boolean).map((line) => JSON.parse(line) as JsonObject);
  const expectedSelfTests = ledger.filter((entry) => entry.expectedSelfTest === true).map((entry) => Object.fromEntries(Object.entries(entry).filter(([key]) => key !== "expectedSelfTest")));
  assert.deepEqual(expectedSelfTests, expectedBrowserSelfTestConsole, "Expected browser self-test console ledger mismatch.");
  const expectedServerFailures = ledger.filter((entry) => entry.source === "server");
  assert.deepEqual(expectedServerFailures, [{source: "server", type: "unexpected-exit", code: null, signal: "SIGKILL"}], "Injected server-failure console ledger mismatch.");
  const applicationRecords = ledger.filter((entry) => entry.expectedSelfTest !== true && entry.source !== "server");
  assert.deepEqual(applicationRecords, consoleRecords, "Application console ledger mismatch.");
  return warnings;
};

const createContext = async (
  name: string,
  viewport: {width: number; height: number},
  port: number,
  apiResponse: unknown | null = null,
  networkMode: "enforce" | "self-test" = "enforce",
) => {
  const profile = `${TEMP_ROOT}/profiles/${name}`;
  assert.ok(!existsSync(repositoryPath(ROOT, profile)), `Profile collision: ${profile}`);
  mkdirSync(repositoryPath(ROOT, profile), {recursive: true, mode: 0o700});
  ownedProfiles.add(profile);
  const context = await chromium.launchPersistentContext(repositoryPath(ROOT, profile), {
    executablePath: BROWSER_EXECUTABLE,
    headless: true,
    viewport,
    args: [
      "--disable-background-networking",
      "--disable-component-update",
      "--disable-default-apps",
      "--disable-extensions",
      "--disable-sync",
      "--metrics-recording-only",
      "--no-first-run",
      "--no-default-browser-check",
    ],
  });
  const browserVersion = context.browser()?.version();
  assert.ok(browserVersion, "The launched browser did not report a version.");
  observedBrowserVersions.add(browserVersion);
  activeContext = context;
  await context.route("**/*", (route) => browserRoute(route, apiResponse, networkMode));
  await context.routeWebSocket("**/*", (webSocket) => browserWebSocketRoute(webSocket, networkMode));
  await context.exposeBinding(DRIVER_BINDING, async (_source, value) => {
    const envelope = validateDriverEnvelope(value);
    const key = `${name}:${stableJson(envelope)}`;
    if (!seenDriverMessages.has(key)) {
      seenDriverMessages.add(key);
      driverMessages.push({context: name, envelope});
    }
  });
  const page = context.pages()[0] ?? await context.newPage();
  page.on("pageerror", (error) => {
    const entry = {at: now(), context: name, type: "pageerror", message: error.message.slice(0, 500)};
    consoleRecords.push(entry); appendJsonLine(CONSOLE_LEDGER, entry);
  });
  page.on("response", (response) => {
    if (new URL(response.url()).pathname !== "/api/ai") return;
    appendJsonLine(BROWSER_LEDGER, {at: now(), method: response.request().method(), path: "/api/ai", browserReceived: true, status: response.status()});
  });
  page.on("requestfailed", (request) => {
    const url = new URL(request.url());
    if (url.pathname !== "/api/ai") return;
    appendJsonLine(BROWSER_LEDGER, {at: now(), method: request.method(), path: "/api/ai", requestFailed: request.failure()?.errorText ?? "unknown"});
  });
  page.on("console", (message) => {
    if (message.type() !== "warning" && message.type() !== "error") return;
    const entry = {at: now(), context: name, type: message.type(), message: message.text().slice(0, 500)};
    if (networkMode === "self-test" && name === "websocket-self-test" && entry.type === "error" && entry.message === "Failed to load resource: net::ERR_BLOCKED_BY_CLIENT.Inspector") {
      expectedBrowserSelfTestConsole.push(entry);
      appendJsonLine(CONSOLE_LEDGER, {...entry, expectedSelfTest: true});
      return;
    }
    consoleRecords.push(entry); appendJsonLine(CONSOLE_LEDGER, entry);
  });
  await page.goto(`http://127.0.0.1:${port}/`, {waitUntil: "domcontentloaded"});
  return {context, page, profile};
};

const closeContext = async (context: BrowserContext, profile: string) => {
  await context.close();
  activeContext = null;
  safeRemoveOwned(profile);
  ownedProfiles.delete(profile);
};

const visible = async (page: Page, role: Parameters<Page["getByRole"]>[0], name: string | RegExp) => {
  const locator = page.getByRole(role, {name, exact: typeof name === "string"});
  await locator.waitFor({state: "visible", timeout: 30_000});
  return locator;
};

const screenshot = async (page: Page, id: string, viewport: {width: number; height: number}, locator?: ReturnType<Page["locator"]>) => {
  const path = `${SCREENSHOT_ROOT}/${id}.png`;
  if (locator) await locator.screenshot({path: repositoryPath(ROOT, path)});
  else await page.screenshot({path: repositoryPath(ROOT, path), fullPage: false});
  screenshots.push({...bindFile(ROOT, path), id, viewport});
  return screenshots.at(-1)!;
};

const canvasPixelEvidence = async (canvas: ReturnType<Page["locator"]>) => canvas.evaluate((node) => {
  const element = node as HTMLCanvasElement;
  const context = element.getContext("2d");
  if (!context) throw new Error("Editable Canvas2D context is unavailable.");
  const pixels = context.getImageData(0, 0, element.width, element.height).data;
  let opaquePixels = 0;
  let redPixels = 0;
  for (let index = 0; index < pixels.length; index += 4) {
    const red = pixels[index]; const green = pixels[index + 1]; const blue = pixels[index + 2]; const alpha = pixels[index + 3];
    if (alpha > 32) opaquePixels += 1;
    if (alpha > 32 && red >= 180 && green <= 180 && blue <= 180 && red > green * 1.25 && red > blue * 1.25) redPixels += 1;
  }
  return {width: element.width, height: element.height, opaquePixels, redPixels};
});

const waitForWelcomeInert = async (page: Page) => {
  const dialog = page.getByRole("dialog", {name: "Welcome to Diamond Animator"});
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const style = await dialog.getAttribute("style");
    if (/opacity:\s*0/.test(style ?? "") && /pointer-events:\s*none/.test(style ?? "")) return style!;
    await page.waitForTimeout(50);
  }
  throw new Error("Welcome dialog did not become visually inert.");
};

const dismissWelcome = async (page: Page, operationPrefix: string, viewportId = operationPrefix) => {
  await visible(page, "dialog", "Welcome to Diamond Animator");
  recordOperation(`${operationPrefix}-welcome-visible`, viewportId, "assert-visible", "dialog:Welcome to Diamond Animator");
  await (await visible(page, "button", "Close welcome")).click();
  recordOperation(`${operationPrefix}-welcome-close`, viewportId, "click", "button:Close welcome");
  await waitForWelcomeInert(page);
};

const openNewProject = async (page: Page, operationPrefix: string, viewportId = operationPrefix) => {
  const button = await visible(page, "button", /^New Project\b/);
  recordOperation(`${operationPrefix}-home`, viewportId, "assert-visible", "button:New Project");
  await button.click();
  recordOperation(`${operationPrefix}-new`, viewportId, "click", "button:New Project");
  await visible(page, "button", /^Drawing Animation\b/);
  await visible(page, "button", /^Stick Figure Animation\b/);
};

const runStickFlow = async (server: RunningServer, viewport: {width: number; height: number}) => {
  const viewportId = `${viewport.width}x${viewport.height}`;
  const {context, page, profile} = await createContext(`stick-${viewportId}`, viewport, server.port);
  try {
    await dismissWelcome(page, viewportId);
    await openNewProject(page, viewportId);
    await (await visible(page, "button", /^Stick Figure Animation\b/)).click();
    recordOperation(`${viewportId}-stick`, viewportId, "click", "button:Stick Figure Animation");
    await visible(page, "button", "Stick Figure Tools");
    await screenshot(page, `stick-${viewportId}`, viewport);
    await page.getByRole("button", {name: "Stick Figure Tools", exact: true}).click();
    recordOperation(`${viewportId}-tools`, viewportId, "click", "button:Stick Figure Tools");
    await (await visible(page, "button", "Create New Stick Figure")).click();
    recordOperation(`${viewportId}-creator`, viewportId, "click", "button:Create New Stick Figure");
    const save = await visible(page, "button", "Save Stick Figure");
    assert.equal(await save.isDisabled(), true, "Creator Save must remain disabled.");
    recordOperation(`${viewportId}-save-disabled`, viewportId, "assert-disabled", "button:Save Stick Figure");
    await screenshot(page, `creator-${viewportId}`, viewport);
    await (await visible(page, "button", "Back")).click();
    recordOperation(`${viewportId}-creator-back`, viewportId, "click", "button:Back");
    await visible(page, "button", "Stick Figure Tools");
    await screenshot(page, `stick-after-back-${viewportId}`, viewport);
  } finally { await closeContext(context, profile); }
};

const runWelcomePersistenceFlow = async (server: RunningServer, viewport: {width: number; height: number}) => {
  const viewportId = `${viewport.width}x${viewport.height}`;
  const {context, page, profile} = await createContext(`welcome-${viewportId}`, viewport, server.port);
  try {
    await visible(page, "dialog", "Welcome to Diamond Animator");
    await (await visible(page, "button", "Don't show again")).click();
    recordOperation(`${viewportId}-welcome-never`, viewportId, "click", "button:Don't show again");
    await page.reload({waitUntil: "domcontentloaded"});
    await visible(page, "button", /^New Project\b/);
    await waitForWelcomeInert(page);
    recordOperation(`${viewportId}-welcome-hidden`, viewportId, "assert-inert", "dialog:Welcome to Diamond Animator");
  } finally { await closeContext(context, profile); }
};

const runDrawingFlow = async (server: RunningServer, response: unknown) => {
  const initialViewport = VIEWPORTS[0];
  const resizedViewport = VIEWPORTS[1];
  const initialViewportId = `${initialViewport.width}x${initialViewport.height}`;
  const resizedViewportId = `${resizedViewport.width}x${resizedViewport.height}`;
  const {context, page, profile} = await createContext(`drawing-${initialViewportId}`, initialViewport, server.port, response);
  try {
    await dismissWelcome(page, `${initialViewportId}-drawing`, initialViewportId);
    await openNewProject(page, `${initialViewportId}-drawing`, initialViewportId);
    await (await visible(page, "button", /^Drawing Animation\b/)).click();
    recordOperation(`${initialViewportId}-drawing-open`, initialViewportId, "click", "button:Drawing Animation");
    const taskButton = await visible(page, "button", /Task: Generate Plans/);
    await taskButton.click();
    recordOperation(`${initialViewportId}-task-open`, initialViewportId, "click", "button:Task: Generate Plans");
    await (await visible(page, "menuitemradio", /^Generate Frames\b/)).click();
    recordOperation(`${initialViewportId}-task-frames`, initialViewportId, "click", "menuitemradio:Generate Frames");
    const textarea = page.getByPlaceholder("Chat here");
    await textarea.waitFor({state: "visible"});
    const canvas = page.locator('[data-workspace-canvas="editable"]');
    await canvas.waitFor({state: "visible"});
    const before = await screenshot(page, `drawing-canvas-before-${initialViewportId}`, initialViewport, canvas);
    const beforePixels = await canvasPixelEvidence(canvas);
    assert.equal(beforePixels.redPixels, 0, "Fresh Drawing canvas unexpectedly contains red pixels.");
    await textarea.fill(FIXED_DRAWING_PROMPT);
    recordOperation(`${initialViewportId}-prompt`, initialViewportId, "fill", "textbox:Chat here");
    await textarea.press("Enter");
    recordOperation(`${initialViewportId}-submit`, initialViewportId, "press", "textbox:Enter");
    let appliedPixels = await canvasPixelEvidence(canvas);
    for (let attempt = 0; attempt < 120 && appliedPixels.redPixels < 100; attempt += 1) {
      await page.waitForTimeout(250);
      appliedPixels = await canvasPixelEvidence(canvas);
    }
    const visibleText = await page.locator("body").innerText();
    assert.ok(appliedPixels.redPixels >= 100, `Canvas did not contain the deterministic red-square pixels. Evidence ${JSON.stringify(appliedPixels)}. Visible text tail:\n${visibleText.slice(-2400)}`);
    const after = await screenshot(page, `drawing-canvas-after-${initialViewportId}`, initialViewport, canvas);
    assert.notEqual(after.sha256, before.sha256, "Canvas screenshot must visibly change after generated-frame apply.");
    assert.doesNotMatch(visibleText, /could not apply|nothing was applied|something went wrong|No safe frame plan/i);
    recordOperation(`${initialViewportId}-canvas-applied`, initialViewportId, "assert-visible-change", "drawing editable canvas");
    for (const label of SETTLED_ABSENT_TEXT) {
      await page.getByText(label, {exact: true}).waitFor({state: "hidden", timeout: 30_000});
    }
    await page.getByText(plan.settledSuccessText, {exact: true}).waitFor({state: "visible", timeout: 30_000});
    const preProbePixels = await canvasPixelEvidence(canvas);
    assert.ok(preProbePixels.redPixels >= 100, "Deterministic red-square pixels disappeared when the UI status settled.");
    assert.equal(await textarea.isEnabled(), true, "Drawing input must be usable after the generated frame settles.");
    await textarea.fill("Phase 1.5 readiness probe");
    const submit = textarea.locator("xpath=ancestor::form").locator('button[type="submit"]');
    assert.equal(await submit.isEnabled(), true, "Drawing submit must be usable after the generated frame settles.");
    await textarea.fill("");
    let settledPixels = await canvasPixelEvidence(canvas);
    for (let attempt = 0; attempt < 120 && settledPixels.redPixels < 100; attempt += 1) {
      await page.waitForTimeout(250);
      settledPixels = await canvasPixelEvidence(canvas);
    }
    const stableCanvas = sha256Bytes(await canvas.screenshot());
    await page.waitForTimeout(500);
    assert.equal(sha256Bytes(await canvas.screenshot()), stableCanvas, "Generated canvas changed after the settled state.");
    assert.ok(settledPixels.redPixels >= 100, "Deterministic red-square pixels disappeared after the settled state.");
    assert.notEqual(stableCanvas, before.sha256, "Settled generated canvas reverted to the fresh-canvas screenshot.");
    const settledText = await page.locator("body").innerText();
    assert.doesNotMatch(settledText, /could not apply|nothing was applied|something went wrong|No safe frame plan/i);
    for (const label of SETTLED_ABSENT_TEXT) assert.ok(!settledText.split("\n").includes(label), `Late status remained visible: ${label}`);
    drawingSettlements.push({viewport: initialViewportId, status: "settled", inputUsable: true, submitUsableAfterProbe: true, canvasStable: true, lateFailure: false, absentStatusLabels: [...SETTLED_ABSENT_TEXT], beforePixels, appliedPixels, settledPixels});
    recordOperation(`${initialViewportId}-drawing-settled`, initialViewportId, "assert-settled", "AI input and generated canvas");
    await screenshot(page, `drawing-result-${initialViewportId}`, initialViewport);

    assert.equal(requestRecords.length, 1, "The initial Drawing settlement must use exactly one mocked POST.");
    await page.setViewportSize(resizedViewport);
    recordOperation(`${resizedViewportId}-drawing-resized`, resizedViewportId, "resize", "same Drawing context:1024x768");
    let resizedPixels = await canvasPixelEvidence(canvas);
    for (let attempt = 0; attempt < 120 && resizedPixels.redPixels < 100; attempt += 1) {
      await page.waitForTimeout(100);
      resizedPixels = await canvasPixelEvidence(canvas);
    }
    assert.ok(resizedPixels.redPixels >= 100, `Generated timeline pixels did not survive resize: ${JSON.stringify(resizedPixels)}`);
    assert.equal(resizedPixels.redPixels, settledPixels.redPixels, "Resize must preserve the exact deterministic red-pixel count.");
    assert.equal(resizedPixels.opaquePixels, settledPixels.opaquePixels, "Resize must preserve the exact deterministic opaque-pixel count.");
    await screenshot(page, `drawing-canvas-before-${resizedViewportId}`, resizedViewport, canvas);
    assert.equal(await textarea.isEnabled(), true, "Drawing input must remain usable after resize.");
    await textarea.fill("Phase 1.5 resized readiness probe");
    assert.equal(await submit.isEnabled(), true, "Drawing submit must remain usable after resize.");
    await textarea.fill("");
    recordOperation(`${resizedViewportId}-drawing-resize-input-usable`, resizedViewportId, "assert-enabled", "AI input and submit");
    const resizedStableCanvas = sha256Bytes(await canvas.screenshot());
    await page.waitForTimeout(500);
    assert.equal(sha256Bytes(await canvas.screenshot()), resizedStableCanvas, "Generated canvas changed after the resized stability checkpoint.");
    const resizedSettledPixels = await canvasPixelEvidence(canvas);
    assert.equal(resizedSettledPixels.redPixels, settledPixels.redPixels, "Settled resized canvas lost deterministic red pixels.");
    assert.equal(resizedSettledPixels.opaquePixels, settledPixels.opaquePixels, "Settled resized canvas lost deterministic opaque pixels.");
    const resizedText = await page.locator("body").innerText();
    assert.doesNotMatch(resizedText, /could not apply|nothing was applied|something went wrong|No safe frame plan/i);
    for (const label of SETTLED_ABSENT_TEXT) assert.ok(!resizedText.split("\n").includes(label), `Late resized status remained visible: ${label}`);
    await page.getByText(plan.settledSuccessText, {exact: true}).waitFor({state: "visible"});
    recordOperation(`${resizedViewportId}-drawing-resize-stable`, resizedViewportId, "assert-settled", "same generated timeline bitmap");
    drawingSettlements.push({viewport: resizedViewportId, status: "settled", inputUsable: true, submitUsableAfterProbe: true, canvasStable: true, lateFailure: false, absentStatusLabels: [...SETTLED_ABSENT_TEXT], beforePixels: resizedPixels, appliedPixels: resizedPixels, settledPixels: resizedSettledPixels});
    await screenshot(page, `drawing-canvas-after-${resizedViewportId}`, resizedViewport, canvas);
    await screenshot(page, `drawing-result-${resizedViewportId}`, resizedViewport);
    writeFileSync(repositoryPath(ROOT, `${BROWSER_OUTPUT}/drawing-visible.txt`), `${initialViewportId}\n${settledText}\n\n${resizedViewportId}\n${resizedText}\n`, {encoding: "utf8", mode: 0o600});

    const undo = page.getByRole("button", {name: "Undo", exact: true});
    const redo = page.getByRole("button", {name: "Redo", exact: true});
    assert.equal(await undo.isEnabled(), true, "Drawing Undo must be available after generated-frame apply.");
    await undo.click();
    let undoPixels = await canvasPixelEvidence(canvas);
    for (let attempt = 0; attempt < 80 && undoPixels.redPixels !== 0; attempt += 1) {
      await page.waitForTimeout(100);
      undoPixels = await canvasPixelEvidence(canvas);
    }
    assert.equal(undoPixels.redPixels, 0, "Drawing Undo must remove the generated bitmap.");
    recordOperation(`${resizedViewportId}-drawing-undo`, resizedViewportId, "click-and-assert", "button:Undo removes generated bitmap");
    assert.equal(await redo.isEnabled(), true, "Drawing Redo must be available after Undo.");
    await redo.click();
    let redoPixels = await canvasPixelEvidence(canvas);
    for (let attempt = 0; attempt < 80 && redoPixels.redPixels < 100; attempt += 1) {
      await page.waitForTimeout(100);
      redoPixels = await canvasPixelEvidence(canvas);
    }
    assert.equal(redoPixels.redPixels, settledPixels.redPixels, "Drawing Redo must restore the exact generated bitmap.");
    recordOperation(`${resizedViewportId}-drawing-redo`, resizedViewportId, "click-and-assert", "button:Redo restores generated bitmap");
    await (await visible(page, "button", "Play")).click();
    recordOperation(`${resizedViewportId}-drawing-play`, resizedViewportId, "click", "button:Play");
    await page.waitForTimeout(250);
    await (await visible(page, "button", "Pause")).click();
    let pausedPixels = await canvasPixelEvidence(canvas);
    for (let attempt = 0; attempt < 80 && pausedPixels.redPixels < 100; attempt += 1) {
      await page.waitForTimeout(100);
      pausedPixels = await canvasPixelEvidence(canvas);
    }
    assert.equal(pausedPixels.redPixels, settledPixels.redPixels, "Play/Pause must restore the exact generated bitmap.");
    recordOperation(`${resizedViewportId}-drawing-pause`, resizedViewportId, "click-and-assert", "button:Pause restores generated bitmap");
    assert.equal(requestRecords.length, 1, "Resize and protected Drawing regressions must not issue a second POST.");
  } finally { await closeContext(context, profile); }
};

const runNetworkGuardSelfTest = () => {
  const script = "globalThis.__SPEC0001_NETWORK_DENY_SELF_TEST_V1().then((v)=>{process.stdout.write(JSON.stringify(v))}).catch((e)=>{console.error(e);process.exit(1)})";
  const result = spawnSync(process.execPath, ["-e", script], {
    cwd: ROOT,
    env: {
      PATH: process.env.PATH,
      NODE_OPTIONS: `--require=${repositoryPath(ROOT, NETWORK_GUARD_PATH)}`,
      SPEC0001_NETWORK_LEDGER: repositoryPath(ROOT, NETWORK_LEDGER),
      SPEC0001_REPOSITORY_ROOT: ROOT,
    } as unknown as NodeJS.ProcessEnv,
    encoding: "utf8",
    shell: false,
  });
  assert.equal(result.status, 0, result.stderr || "Network guard self-test failed.");
  const checks = JSON.parse(result.stdout) as Array<{name: string; denied: boolean}>;
  assert.deepEqual(checks.map((entry) => entry.name), SERVER_GUARD_CHECKS);
  assert.ok(checks.every((entry) => entry.denied));
  const negativeNames = ["non-loopback-fetch", "non-loopback-http", "non-loopback-https", "non-loopback-socket", "non-loopback-tls", "dns", "unguarded-child"];
  for (const name of negativeNames) negativeResults.push({name, status: "passed", expectedCode: "SPEC0001_NETWORK_DENIED"});
  return checks;
};

const runBrowserWebSocketSelfTest = async (server: RunningServer) => {
  const before = expectedBrowserDenials.length;
  const {context, page, profile} = await createContext("websocket-self-test", {width: 1024, height: 768}, server.port, null, "self-test");
  try {
    const fetchOutcome = await page.evaluate(() => fetch("https://203.0.113.1/spec0001-browser-fetch-denial")
      .then(() => "opened", () => "denied"));
    assert.equal(fetchOutcome, "denied");
    const outcome = await page.evaluate(() => new Promise<string>((resolveOutcome) => {
      const socket = new WebSocket("wss://203.0.113.1/spec0001-browser-denial");
      socket.addEventListener("open", () => resolveOutcome("opened"), {once: true});
      socket.addEventListener("error", () => resolveOutcome("denied"), {once: true});
      socket.addEventListener("close", () => resolveOutcome("denied"), {once: true});
      window.setTimeout(() => resolveOutcome("timeout"), 5_000);
    }));
    assert.equal(outcome, "denied");
  } finally { await closeContext(context, profile); }
  assert.equal(expectedBrowserDenials.length, before + 2);
  const denials = expectedBrowserDenials.slice(before);
  assert.deepEqual(denials.map((entry) => entry.method), ["GET", "WEBSOCKET"]);
  assert.ok(denials.every((entry) => entry.allowed === false));
  await expectRejected("non-loopback-websocket", () => assertNoBrowserPolicyViolations(denials), "SPEC0001_BROWSER_NETWORK_DENIED");
  return {name: "browser-egress", denied: true, mechanisms: ["playwright.route", "playwright.routeWebSocket"], checks: ["fetch", "websocket"]};
};

const runStaticNegativeDrills = async () => {
  await recordNegative("integrated-current-head-accepted", "accepted", () => {
    const policy = validateRunBaselinePolicy({head: "b".repeat(40), changedPaths: []});
    assert.equal(policy.mode, "integrated-current-head");
  });
  await expectRejected("incorrect-run-base", () => validateRunBaselinePolicy({head: "b".repeat(40), requestedBase: "c".repeat(40), changedPaths: []}));
  await expectRejected("unallowlisted-diff", () => validateRunBaselinePolicy({head: "b".repeat(40), changedPaths: ["app/page.tsx"]}));
  await expectRejected("unknown-driver-operation", () => validateDriverEnvelope({contractVersion: 1, operation: "arbitrary.evaluate/v1", payload: {}}));

  const fonts = readJson(ROOT, FONT_METADATA_PATH) as JsonObject;
  const unexpected = structuredClone(fonts) as {responses: Array<JsonObject>};
  unexpected.responses[0].url = "https://fonts.googleapis.com/css2?family=Unexpected";
  await expectRejected("unexpected-font-url", () => buildFontResponseMap(unexpected));
  const malformed = structuredClone(fonts) as {responses: Array<JsonObject>};
  delete malformed.responses[0].family;
  await expectRejected("malformed-font-response", () => buildFontResponseMap(malformed));
  const mismatched = structuredClone(fonts) as {responses: Array<{faces: Array<JsonObject>}>};
  mismatched.responses[0].faces[0].sha256 = `sha256:${"0".repeat(64)}`;
  await expectRejected("font-hash-mismatch", () => buildFontResponseMap(mismatched));

  const preimage = readFileSync(repositoryPath(ROOT, ANCHOR_PATH));
  const replacement = Buffer.from(preimage.toString("utf8").replace(`  ${ANCHOR_MARKER}`, DRIVER_INSTRUMENTATION));
  await expectRejected("wrong-anchor-preimage", () => assertAnchorTransition(Buffer.from("wrong"), replacement, Buffer.from("wrong")));
  await expectRejected("wrong-anchor-replacement", () => assertAnchorTransition(preimage, preimage, preimage));
  await expectRejected("wrong-anchor-restoration", () => assertAnchorTransition(preimage, replacement, Buffer.concat([preimage, Buffer.from("x")])));
  await expectRejected("missing-browser", () => assertEnvironment(resolve(ROOT, `${TEMP_ROOT}/missing-browser`), resolve(ROOT, "node_modules/playwright-core/package.json")));
  await expectRejected("missing-dependency", () => assertEnvironment(BROWSER_EXECUTABLE, resolve(ROOT, `${TEMP_ROOT}/missing-playwright-core.json`)));
  await expectRejected("preexisting-output-collision", () => assert.equal(existsSync(repositoryPath(ROOT, PLAN_PATH)), false, "Pre-existing owned output collision."));

  const negativeScanRoot = `${TEMP_ROOT}/negative-production-scan`;
  mkdirSync(repositoryPath(ROOT, negativeScanRoot), {recursive: true, mode: 0o700});
  const leakCases = [
    ["production-marker-leak", "marker.bin", `prefix-${ANCHOR_MARKER}-suffix`],
    ["production-import-leak", "import.js", "scripts/fixtures/spec0001-browser/v1/phase-1.5-browser-plan.json"],
    ["production-route-leak", "route.txt", "/__spec0001-browser"],
    ["production-ui-leak", "ui.html", "<button>Browser Tester</button>"],
    ["production-asset-leak", "large-asset.bin", "spec0001-browser"],
    ["production-test-font-leak", "font.txt", "scripts/fixtures/spec0001-browser/v1/fonts/geist-latin.woff2"],
  ] as const;
  for (const [name, filename, contents] of leakCases) {
    const path = `${negativeScanRoot}/${filename}`;
    const prefix = name === "production-asset-leak" ? Buffer.alloc(17 * 1024 * 1024, 0) : Buffer.alloc(0);
    writeFileSync(repositoryPath(ROOT, path), Buffer.concat([prefix, Buffer.from(contents)]), {mode: 0o600});
    const evidence = scanFileEvidence(repositoryPath(ROOT, path), PRODUCTION_MARKERS);
    await expectRejected(name, () => assert.equal(evidence.leaked, false, `Seeded production leak: ${name}`));
  }
  safeRemoveOwned(negativeScanRoot);
};

const runServerFailureDrill = async (fontMockPath: string) => {
  const server = await startServer("development", fontMockPath);
  try {
    const pid = server.child.pid;
    assert.ok(Number.isSafeInteger(pid) && (pid ?? 0) > 1, "Injected failure drill requires a positive child PID.");
    process.kill(-pid!, "SIGKILL");
    await new Promise<void>((resolveExit) => server.child.once("exit", () => resolveExit()));
  } finally {
    if (activeServer === server) activeServer = null;
    if (ownedPorts.has(server.port)) await provePortReleased(server.port);
    if (existsSync(resolve(ROOT, NEXT_DIR))) safeRemoveOwned(NEXT_DIR);
  }
  assertCleanResources("server failure drill");
  negativeResults.push({name: "server-failure-cleanup", status: "passed", expectedCode: "cleaned"});
};

const runBuildFailureDrill = (fontMockPath: string) => {
  const result = spawnSync(process.execPath, [repositoryPath(ROOT, "node_modules/next/dist/bin/next"), "build", "--definitely-invalid-spec0001-option"], {
    cwd: ROOT, env: scrubbedEnvironment(fontMockPath), encoding: "utf8", shell: false, maxBuffer: 16 * 1024 * 1024,
  });
  assert.notEqual(result.status, 0, "Injected build failure unexpectedly succeeded.");
  if (existsSync(resolve(ROOT, NEXT_DIR))) safeRemoveOwned(NEXT_DIR);
  assertCleanResources("build failure drill");
  negativeResults.push({name: "build-failure-cleanup", status: "passed", expectedCode: "cleaned"});
};

const runBrowserFailureDrill = async () => {
  const profile = `${TEMP_ROOT}/profiles/browser-failure`;
  mkdirSync(repositoryPath(ROOT, profile), {recursive: true, mode: 0o700});
  let rejected = false;
  try {
    await chromium.launchPersistentContext(repositoryPath(ROOT, profile), {executablePath: repositoryPath(ROOT, `${TEMP_ROOT}/missing-browser`), headless: true});
  } catch { rejected = true; }
  finally { safeRemoveOwned(profile); }
  assert.equal(rejected, true);
  assertCleanResources("browser failure drill");
  negativeResults.push({name: "browser-failure-cleanup", status: "passed", expectedCode: "cleaned"});
};

const runSignalDrill = async (signal: "SIGINT" | "SIGTERM") => {
  const profile = repositoryPath(ROOT, `${TEMP_ROOT}/signal-${signal}-profile`);
  const receipt = repositoryPath(ROOT, `${BROWSER_OUTPUT}/signal-${signal.toLowerCase()}.json`);
  assert.ok(!existsSync(profile) && !existsSync(receipt));
  const script = `const fs=require('node:fs');const http=require('node:http');(async()=>{const {chromium}=await import('playwright-core');fs.mkdirSync(${JSON.stringify(profile)},{recursive:true,mode:0o700});const server=http.createServer((q,r)=>{r.end('ok')});await new Promise(r=>server.listen(0,'127.0.0.1',r));const port=server.address().port;const context=await chromium.launchPersistentContext(${JSON.stringify(profile)},{executablePath:${JSON.stringify(BROWSER_EXECUTABLE)},headless:true,handleSIGINT:false,handleSIGTERM:false,handleSIGHUP:false,args:['--disable-background-networking','--disable-component-update','--disable-default-apps','--disable-extensions','--disable-sync','--no-first-run']});let done=false;const cleanup=async()=>{if(done)return;done=true;await context.close().catch(()=>{});await new Promise(r=>server.close(()=>r()));const probe=http.createServer();await new Promise((r,j)=>{probe.once('error',j);probe.listen(port,'127.0.0.1',()=>probe.close(e=>e?j(e):r()))});fs.rmSync(${JSON.stringify(profile)},{recursive:true,force:true});fs.writeFileSync(${JSON.stringify(receipt)},JSON.stringify({signal:${JSON.stringify(signal)},contextClosed:true,serverClosed:true,portReleased:true,profileRemoved:!fs.existsSync(${JSON.stringify(profile)})})+'\\n',{mode:0o600});process.exit(${signal === "SIGINT" ? 130 : 143})};process.on(${JSON.stringify(signal)},()=>void cleanup());process.stdout.write('READY\\n')})().catch(e=>{console.error(e);process.exit(1)})`;
  const child = spawn(process.execPath, ["-e", script], {cwd: ROOT, env: {...process.env}, shell: false, stdio: ["ignore", "pipe", "pipe"]});
  await new Promise<void>((resolveReady, rejectReady) => {
    let stdout = ""; let stderr = "";
    const timeout = setTimeout(() => rejectReady(new Error(`Signal drill readiness timeout: ${stderr}`)), 30_000);
    child.stdout?.on("data", (chunk) => { stdout += String(chunk); if (stdout.includes("READY")) { clearTimeout(timeout); resolveReady(); } });
    child.stderr?.on("data", (chunk) => { stderr += String(chunk); });
    child.once("exit", (code) => { if (!stdout.includes("READY")) { clearTimeout(timeout); rejectReady(new Error(`Signal drill exited ${code}: ${stderr}`)); } });
  });
  child.kill(signal);
  const exitCode = await new Promise<number | null>((resolveExit) => child.once("exit", (code) => resolveExit(code)));
  assert.equal(exitCode, signal === "SIGINT" ? 130 : 143);
  const result = strictObject(readJson(ROOT, relative(ROOT, receipt)), ["contextClosed", "portReleased", "profileRemoved", "serverClosed", "signal"], `${signal} drill receipt`);
  assert.deepEqual(result, {signal, contextClosed: true, serverClosed: true, portReleased: true, profileRemoved: true});
  negativeResults.push({name: `${signal.toLowerCase()}-cleanup`, status: "passed", expectedCode: "cleaned"});
};

const expectedOperationEvidence = () => {
  const scoped = (scope: (typeof ACTIONS)[number][3], viewport: (typeof VIEWPORTS)[number]) => {
    const viewportId = `${viewport.width}x${viewport.height}`;
    return ACTIONS.filter((entry) => entry[3] === scope).map(([id, action, target]) => ({id: `${viewportId}-${id}`, viewport: viewportId, action, target, passed: true}));
  };
  return [
    ...VIEWPORTS.flatMap((viewport) => [...scoped("each-viewport-welcome", viewport), ...scoped("each-viewport-stick", viewport)]),
    ...scoped("drawing-initial", VIEWPORTS[0]),
    ...scoped("drawing-resized", VIEWPORTS[1]),
  ];
};

const expectedScreenshotIds = () => [
  ...VIEWPORTS.flatMap((viewport) => SCREENSHOT_TEMPLATES.slice(0, 3).map((template) => template.replace("{viewport}", `${viewport.width}x${viewport.height}`))),
  ...VIEWPORTS.flatMap((viewport) => SCREENSHOT_TEMPLATES.slice(3).map((template) => template.replace("{viewport}", `${viewport.width}x${viewport.height}`))),
  ...PRODUCTION_SCREENSHOTS,
];

const assertExactRequestRecords = (records: unknown) => {
  assert.deepEqual(records, [plan.request], "Drawing request ledger must contain exactly one deterministic mocked POST.");
};

const validateExactResult = (value: unknown) => {
  validateJsonSchema(value, readJson(ROOT, `${FIXTURE_ROOT}/tester-result.schema.json`), "Browser result schema");
  const result = strictObject(value, [
    "browserExecutable", "browserVersion", "cleanup", "console", "dependency", "drawingSettlements", "driverMessages", "failureDrill",
    "fontFixture", "fontRequests", "fontResponses", "headCommit", "historicalProofBase", "negativeCases", "negativeEvidence",
    "network", "operations", "phase", "plan", "productSource", "production", "recordedAt", "requestRecords",
    "resultVersion", "runBaseline", "screenshots", "source", "specId", "status",
  ], "Browser result");
  assert.equal(result.resultVersion, 1);
  assert.equal(result.specId, SPEC_ID);
  assert.equal(result.phase, PHASE);
  assert.equal(result.status, "passed");
  assert.equal(result.historicalProofBase, PHASE15_PROOF_BASE);
  assert.equal(result.headCommit, git("rev-parse", "HEAD"));
  assert.deepEqual((result.operations as Operation[]).map(({id, viewport, action, target, passed}) => ({id, viewport, action, target, passed})), expectedOperationEvidence());
  assert.deepEqual((result.screenshots as ScreenshotEvidence[]).map((entry) => entry.id), expectedScreenshotIds());
  assertExactRequestRecords(result.requestRecords);
  assert.ok(Array.isArray(result.drawingSettlements) && result.drawingSettlements.length === VIEWPORTS.length);
  for (const [index, settlementValue] of result.drawingSettlements.entries()) {
    const settlement = strictObject(settlementValue, ["absentStatusLabels", "appliedPixels", "beforePixels", "canvasStable", "inputUsable", "lateFailure", "settledPixels", "status", "submitUsableAfterProbe", "viewport"], `Drawing settlement ${index}`);
    assert.equal(settlement.viewport, `${VIEWPORTS[index].width}x${VIEWPORTS[index].height}`);
    if (index === 0) assert.equal((settlement.beforePixels as JsonObject).redPixels, 0);
    else assert.ok(Number((settlement.beforePixels as JsonObject).redPixels) >= 100);
    assert.ok(Number((settlement.appliedPixels as JsonObject).redPixels) >= 100);
    assert.ok(Number((settlement.settledPixels as JsonObject).redPixels) >= 100);
  }
  const consoleEvidence = strictObject(result.console, ["acceptedWarningPatterns", "errorCount", "records", "warningCount"], "Console evidence");
  assert.deepEqual(consoleEvidence.acceptedWarningPatterns, ACCEPTED_CONSOLE_WARNING_PATTERNS);
  assert.equal(consoleEvidence.errorCount, 0);
  assert.equal(consoleEvidence.warningCount, (consoleEvidence.records as JsonObject[]).filter((entry) => entry.type === "warning").length);
  for (const record of consoleEvidence.records as JsonObject[]) {
    assert.equal(record.type, "warning");
    assert.ok(ACCEPTED_CONSOLE_WARNING_PATTERNS.some((pattern) => new RegExp(pattern).test(String(record.message))));
  }
  return result;
};

const runBuild = (fontMockPath: string) => {
  for (const buildMode of ["compile", "generate"] as const) {
    const result = spawnSync(
      process.execPath,
      [repositoryPath(ROOT, "node_modules/next/dist/bin/next"), "build", "--webpack", "--experimental-build-mode", buildMode],
      {
        cwd: ROOT,
        env: scrubbedEnvironment(fontMockPath),
        encoding: "utf8",
        shell: false,
        maxBuffer: 64 * 1024 * 1024,
      },
    );
    appendFileSync(repositoryPath(ROOT, SERVER_LOG), `\n[production build ${buildMode}]\n${result.stdout}${result.stderr}`);
    assert.equal(result.status, 0, `Guarded production ${buildMode} failed.\n${result.stdout}\n${result.stderr}`);
  }
};

const runCompatibilityBuild = (fontMockPath: string) => {
  claimCompatibilityNextOutput();
  for (const buildMode of ["compile", "generate"] as const) {
    const result = spawnSync(
      process.execPath,
      [repositoryPath(ROOT, "node_modules/next/dist/bin/next"), "build", "--webpack", "--experimental-build-mode", buildMode],
      {cwd: ROOT, env: compatibilityScrubbedEnvironment(fontMockPath), encoding: "utf8", shell: false, maxBuffer: 64 * 1024 * 1024},
    );
    appendFileSync(secureExtensionFilePath(COMPATIBILITY_SERVER_LOG), `\n[extension production build ${buildMode}]\n${result.stdout}${result.stderr}`);
    assert.equal(result.status, 0, `Guarded extension production ${buildMode} failed.\n${result.stdout}\n${result.stderr}`);
  }
};

const listFiles = (directory: string): string[] => {
  if (!existsSync(directory)) return [];
  const results: string[] = [];
  for (const entry of readdirSync(directory, {withFileTypes: true})) {
    const absolute = resolve(directory, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`Production output symlink rejected: ${absolute}`);
    if (entry.isDirectory()) results.push(...listFiles(absolute));
    else if (entry.isFile()) results.push(absolute);
  }
  return results;
};

const scanFileEvidence = (file: string, markers: readonly string[]) => {
  const local = relative(ROOT, file);
  const descriptor = openSync(file, "r");
  const hash = createHash("sha256");
  const chunk = Buffer.allocUnsafe(1024 * 1024);
  const maxMarkerBytes = Math.max(...markers.map((marker) => Buffer.byteLength(marker)));
  let carry = Buffer.alloc(0);
  let byteLength = 0;
  let leaked = markers.some((marker) => local.includes(marker));
  try {
    for (;;) {
      const count = readSync(descriptor, chunk, 0, chunk.byteLength, null);
      if (count === 0) break;
      const bytes = chunk.subarray(0, count);
      hash.update(bytes);
      byteLength += count;
      const searchable = Buffer.concat([carry, bytes]);
      if (markers.some((marker) => searchable.includes(Buffer.from(marker)))) leaked = true;
      carry = searchable.subarray(Math.max(0, searchable.byteLength - maxMarkerBytes + 1));
    }
  } finally { closeSync(descriptor); }
  return {path: local, byteLength, sha256: `sha256:${hash.digest("hex")}`, leaked};
};

const scanProduction = (markers: readonly string[] = PRODUCTION_MARKERS) => {
  const files = listFiles(resolve(ROOT, NEXT_DIR)).filter((file) => !relative(ROOT, file).startsWith(`${NEXT_DIR}${sep}cache${sep}`));
  const leaks: string[] = [];
  const inventory: JsonObject[] = [];
  for (const file of files) {
    const evidence = scanFileEvidence(file, markers);
    if (evidence.leaked) leaks.push(evidence.path);
    inventory.push({path: evidence.path, byteLength: evidence.byteLength, sha256: evidence.sha256});
  }
  assert.deepEqual(leaks, [], `Tester leaked into production output: ${leaks.join(", ")}`);
  return {fileCount: files.length, scannedMarkers: [...markers], excludedNonDeployableRoots: [".next/cache"], inventory, leaks};
};

const productionSmoke = async (server: RunningServer) => {
  const paths = plan.forbiddenUrls;
  const statuses: JsonObject[] = [];
  for (const path of paths) {
    const status = await waitForHttp(`http://127.0.0.1:${server.port}${path}`, 15_000);
    assert.equal(status, 404, `Forbidden tester URL must return 404: ${path}`);
    statuses.push({path, status});
  }
  const {context, page, profile} = await createContext("production-smoke", {width: 1024, height: 768}, server.port);
  try {
    await visible(page, "button", /^New Project\b/);
    const html = await page.content();
    assert.ok(!html.includes("SPEC0001") && !html.includes("spec0001-browser") && !html.includes("Browser Tester"));
    await screenshot(page, "production-home-1024x768", {width: 1024, height: 768});
  } finally { await closeContext(context, profile); }
  return statuses;
};

const compatibilityProductionSmoke = async (server: RunningServer) => {
  const forbiddenPaths = validateFixturePlan().forbiddenUrls;
  const forbiddenUrlResults: JsonObject[] = [];
  for (const path of forbiddenPaths) {
    const status = await waitForHttp(`http://127.0.0.1:${server.port}${path}`, 15_000);
    assert.equal(status, 404, `Forbidden tester URL must return 404: ${path}`);
    forbiddenUrlResults.push({path, status});
  }
  const {context, page, profile} = await createCompatibilityContext("extension-production-smoke", {width: 1024, height: 768}, server.port);
  try {
    await visible(page, "button", /^New Project\b/);
    const html = await page.content();
    for (const marker of COMPATIBILITY_PRODUCTION_MARKERS) assert.equal(html.includes(marker), false, `Production HTML contains tester marker: ${marker}`);
  } finally { await closeCompatibilityContext(context, profile); }
  return forbiddenUrlResults;
};

const assertCleanResources = (label: string) => {
  assert.equal(activeContext, null, `${label}: browser context remains open.`);
  assert.equal(activeServer, null, `${label}: server remains open.`);
  assert.equal(ownedProfiles.size, 0, `${label}: profile remains registered.`);
  assert.equal(ownedPorts.size, 0, `${label}: loopback port remains owned.`);
  assert.ok(!existsSync(resolve(ROOT, NEXT_DIR)), `${label}: .next remains.`);
  assert.equal(sha256Bytes(readFileSync(repositoryPath(ROOT, ANCHOR_PATH))), anchorOriginalHash, `${label}: anchor not restored.`);
};

const runInjectedFailureDrill = async (fontMockPath: string) => {
  installAnchor();
  let server: RunningServer | null = null;
  let contextInfo: Awaited<ReturnType<typeof createContext>> | null = null;
  let observed = false;
  try {
    server = await startServer("development", fontMockPath);
    contextInfo = await createContext("injected-failure", {width: 1024, height: 768}, server.port);
    await visible(contextInfo.page, "dialog", "Welcome to Diamond Animator");
    throw new Error("SPEC0001_INJECTED_FAILURE_AFTER_BROWSER_START");
  } catch (error) {
    observed = error instanceof Error && error.message === "SPEC0001_INJECTED_FAILURE_AFTER_BROWSER_START";
    assert.ok(observed, `Unexpected injected-failure result: ${String(error)}`);
  } finally {
    if (contextInfo) await closeContext(contextInfo.context, contextInfo.profile);
    await stopServer(server);
    restoreAnchor();
    if (existsSync(resolve(ROOT, NEXT_DIR))) safeRemoveOwned(NEXT_DIR);
  }
  assertCleanResources("injected failure");
  negativeResults.push({name: "injected-run-failure-cleanup", status: "passed", expectedCode: "cleaned"});
  return {injectedFailure: "observed", cleanup: "passed"};
};

const dispatchCompatibilityCommand = async (page: Page, contextId: string, operation: string, payload: JsonObject) => {
  const commandId = `command-${compatibilityDriverMessages.length + 1}-${createHash("sha256").update(`${operation}:${stableJson(payload)}`).digest("hex").slice(0, 12)}`;
  const response = new Promise<CompatibilityCommandMessage>((resolveMessage, rejectMessage) => {
    const timeout = setTimeout(() => {
      compatibilityPendingCommands.delete(commandId);
      rejectMessage(new Error(`Compatibility driver command timed out: ${operation}`));
    }, 30_000);
    compatibilityPendingCommands.set(commandId, {
      contextId,
      operation,
      resolve: (message) => { clearTimeout(timeout); resolveMessage(message); },
      reject: (error) => { clearTimeout(timeout); rejectMessage(error); },
    });
  });
  await page.evaluate(({eventName, detail}) => {
    window.dispatchEvent(new CustomEvent(eventName, {detail}));
  }, {eventName: COMPATIBILITY_COMMAND_EVENT, detail: {commandId, operation, payload}});
  return response;
};

const dispatchCompatibilityPointer = async (page: Page, contextId: string, action: Extract<NormalizedAction, {family: "pointer"}>) => {
  assert.ok(compatibilityGraph?.adapter.pointerTargets.some((target) => target.targetId === action.targetId && target.targetKind === "authorized-canvas"));
  const authorizedCanvases = page.locator('[style*="touch-action: none"]:not([aria-hidden="true"])');
  assert.equal(await authorizedCanvases.count(), 1, `Pointer target ${action.targetId} must resolve to exactly one closed authorized canvas.`);
  const canvas = authorizedCanvases.first();
  await canvas.waitFor({state: "visible", timeout: 30_000});
  const messageCount = compatibilityDriverMessages.length;
  const eventName = action.operation === "down" ? "pointerdown" : action.operation === "move" ? "pointermove" : action.operation === "up" ? "pointerup" : "pointercancel";
  await canvas.dispatchEvent(eventName, {
    pointerId: action.pointerId,
    pointerType: "mouse",
    isPrimary: true,
    button: action.button,
    buttons: action.operation === "up" || action.operation === "cancel" ? 0 : 1,
    clientX: action.point.x,
    clientY: action.point.y,
  });
  if (compatibilityGraph?.adapter.executionProfile === "phase2-workspace-ports/v1") {
    const message = await dispatchCompatibilityCommand(page, contextId, "workspace.read-checkpoint/v1", {operationId: `pointer-${action.actionId}`});
    return message.payload;
  }
  for (let attempt = 0; attempt < 100 && compatibilityDriverMessages.length === messageCount; attempt += 1) await page.waitForTimeout(20);
  assert.equal(compatibilityDriverMessages.length, messageCount + 1, `Pointer ${action.operation} did not emit exactly one driver result.`);
  return compatibilityDriverMessages.at(-1)!.payload;
};

const canonicalCompatibilityCommandEvidence = (value: JsonObject, actionId: string) => {
  const payload = strictObject(value, ["checkpoint", "commandId", "operation", "response"], `Command evidence ${actionId}`);
  assert.equal(typeof payload.commandId, "string", `Command evidence ${actionId} is missing its internal transport identifier.`);
  assert.equal(typeof payload.operation, "string", `Command evidence ${actionId} is missing its operation.`);
  assert.ok(typeof payload.response === "object" && payload.response !== null && !Array.isArray(payload.response), `Command evidence ${actionId} has an invalid response.`);
  assert.ok(typeof payload.checkpoint === "object" && payload.checkpoint !== null && !Array.isArray(payload.checkpoint), `Command evidence ${actionId} has an invalid checkpoint.`);
  const evidence = {operation: payload.operation, response: payload.response, checkpoint: payload.checkpoint};
  const serialized = JSON.stringify(evidence);
  assert.ok(serialized.length <= 1024 * 1024, `Command evidence ${actionId} exceeds the closed one-megabyte ceiling.`);
  const canonical = JSON.parse(serialized) as JsonObject;
  assert.deepEqual(canonical, evidence, `Command evidence ${actionId} is not lossless strict JSON.`);
  return canonical;
};

const SYNTHETIC_BUILT_IN_FIXTURES: Record<string, JsonObject> = {
  "synthetic-environment-plan": {fixtureVersion: 1, gateIds: ["environment-release"], isolation: "in-memory"},
  "synthetic-gate-release": {fixtureVersion: 1, gateId: "environment-release"},
  "synthetic-joint-edit": {fixtureVersion: 1, editIds: ["manual-ready-position", "manual-inward-pose", "manual-outward-pose"]},
  "synthetic-publication-completion": {fixtureVersion: 1, completionOrder: ["publication-b", "publication-a"], winner: "publication-b"},
  "synthetic-publication-plan": {fixtureVersion: 1, publicationIds: ["publication-a", "publication-b"]},
  "synthetic-wave-document": {fixtureVersion: 1, documentId: "synthetic-wave-document", frameCount: 3, storage: "test-owned-memory"},
};

const resolveCompatibilityFixture = (graph: ValidatedTesterExtension, fixtureId: string, operation: string, channel: "driver" | "environment") => {
  const fixture = graph.registry.fixtures.find((entry) => entry.fixtureId === fixtureId);
  assert.ok(fixture, `Unknown compatibility fixture: ${fixtureId}`);
  const ports = channel === "driver" ? graph.adapter.driverOperations : graph.adapter.environmentOperations;
  const port = ports.find((entry) => entry.operation === operation);
  assert.ok(port?.fixtureKinds.includes(fixture.fixtureKind), `Fixture ${fixtureId} is unauthorized for ${operation}.`);
  if (fixture.sourceKind === "adapter-built-in") {
    assert.equal(graph.adapter.executionProfile, "synthetic-state-machine/v1");
    const value = SYNTHETIC_BUILT_IN_FIXTURES[fixtureId];
    assert.ok(value, `Missing closed synthetic fixture implementation: ${fixtureId}`);
    const implementationDigest = sha256Bytes(stableJson(value));
    assert.equal(fixture.expectedFixtureDigest, implementationDigest, `Built-in fixture semantic digest drift: ${fixtureId}`);
    return {fixtureId, fixtureKind: fixture.fixtureKind, sourceKind: fixture.sourceKind, implementationDigest, value};
  }
  assert.equal(graph.adapter.executionProfile, "phase2-workspace-ports/v1");
  const observed = bindFile(ROOT, fixture.binding.path);
  assert.deepEqual(observed, fixture.binding, `Repository fixture binding drift: ${fixtureId}`);
  assert.equal(fixture.expectedFixtureDigest, observed.sha256, `Repository fixture digest drift: ${fixtureId}`);
  const value = readJson(ROOT, fixture.binding.path);
  assert.ok(typeof value === "object" && value !== null && !Array.isArray(value), `Repository fixture must be an object: ${fixtureId}`);
  return {fixtureId, fixtureKind: fixture.fixtureKind, sourceKind: fixture.sourceKind, binding: fixture.binding, value: value as JsonObject};
};

const compatibilityDriverPayload = (graph: ValidatedTesterExtension, action: Extract<NormalizedAction, {family: "workspace-driver"}>): {operation: string; payload: JsonObject} => {
  const fixture = action.fixtureId === null ? null : resolveCompatibilityFixture(graph, action.fixtureId, action.operation, "driver");
  if (graph.adapter.executionProfile === "phase2-workspace-ports/v1") {
    const operationByPort = {
      mountDocument: "workspace.mount-document/v1",
      dispatchCompletedJointEdit: "workspace.dispatch-completed-joint-edit/v1",
      beginDocumentPublication: "workspace.begin-document-publication/v1",
      completeDocumentPublication: "workspace.complete-document-publication/v1",
      readCheckpoint: "workspace.read-checkpoint/v1",
    } as const;
    return {operation: operationByPort[action.operation], payload: {operationId: action.operationId, fixtureId: action.fixtureId, fixture: fixture?.value ?? null}};
  }
  if (action.operation === "mountDocument") {
    assert.ok(action.fixtureId);
    return {operation: "fixture.mount/v1", payload: {fixtureId: action.fixtureId, fixtureKind: fixture!.fixtureKind, fixture: fixture!.value}};
  }
  if (action.operation === "dispatchCompletedJointEdit") {
    const editByOperation: Record<string, {part: string; x: number; y: number}> = {
      "manual-ready-position": {part: "rightArm", x: 382, y: 220},
      "manual-inward-pose": {part: "rightArm", x: 355, y: 174},
      "manual-outward-pose": {part: "rightArm", x: 422, y: 142},
    };
    const edit = editByOperation[action.operationId];
    assert.ok(edit, `Unknown completed-joint-edit operationId: ${action.operationId}`);
    return {operation: "manual.move-part/v1", payload: edit};
  }
  if (action.operation === "beginDocumentPublication") {
    return {operation: "publication.begin/v1", payload: {publicationId: action.operationId}};
  }
  if (action.operation === "completeDocumentPublication") {
    assert.ok(action.operationId === "publication-a" || action.operationId === "publication-b", `Unknown publication completion: ${action.operationId}`);
    return {operation: "publication.complete/v1", payload: {publicationId: action.operationId, status: action.operationId === "publication-b" ? "ready" : "stale"}};
  }
  assert.equal(action.operation, "readCheckpoint");
  return {operation: "checkpoint.read/v1", payload: {checkpointId: action.operationId}};
};

const expectedSyntheticCheckpoint = () => structuredClone(compatibilityExpectedSyntheticState) as unknown as JsonObject;

const assertSyntheticTransition = (action: NormalizedAction, evidence: JsonObject) => {
  if (compatibilityGraph?.adapter.executionProfile !== "synthetic-state-machine/v1") return;
  if (action.family !== "pointer" && action.family !== "workspace-driver" && action.family !== "checkpoint") return;
  if (action.family === "checkpoint" && action.channel === "runner-environment") return;
  const payload = strictObject(evidence, ["checkpoint", "operation", "response"], `Synthetic transition ${action.actionId}`);
  const response = payload.response as JsonObject;
  if (action.family === "workspace-driver") {
    if (action.operation === "mountDocument") {
      compatibilityExpectedSyntheticState.fixtureId = action.fixtureId;
      compatibilityExpectedSyntheticState.revision += 1;
      assert.deepEqual(response, {fixtureId: action.fixtureId, revision: compatibilityExpectedSyntheticState.revision});
    } else if (action.operation === "dispatchCompletedJointEdit") {
      const edits = {
        "manual-ready-position": {part: "rightArm", x: 382, y: 220},
        "manual-inward-pose": {part: "rightArm", x: 355, y: 174},
        "manual-outward-pose": {part: "rightArm", x: 422, y: 142},
      } as const;
      const edit = edits[action.operationId as keyof typeof edits];
      assert.ok(edit, `Unknown synthetic joint edit: ${action.operationId}`);
      compatibilityExpectedSyntheticState.joints[edit.part] = {x: edit.x, y: edit.y};
      compatibilityExpectedSyntheticState.selectedPart = edit.part;
      compatibilityExpectedSyntheticState.revision += 1;
      assert.deepEqual(response, {part: edit.part, point: {x: edit.x, y: edit.y}, revision: compatibilityExpectedSyntheticState.revision});
    } else if (action.operation === "beginDocumentPublication") {
      compatibilityExpectedSyntheticState.publications[action.operationId] = {status: "pending", revision: compatibilityExpectedSyntheticState.revision};
      assert.deepEqual(response, {publicationId: action.operationId, status: "pending"});
    } else if (action.operation === "completeDocumentPublication") {
      const status = action.operationId === "publication-b" ? "ready" : "stale";
      assert.ok(compatibilityExpectedSyntheticState.publications[action.operationId]);
      compatibilityExpectedSyntheticState.publications[action.operationId] = {...compatibilityExpectedSyntheticState.publications[action.operationId], status};
      if (status === "ready") compatibilityExpectedSyntheticState.lastPublication = action.operationId;
      assert.deepEqual(response, {publicationId: action.operationId, status, lastPublication: compatibilityExpectedSyntheticState.lastPublication});
    } else {
      assert.equal(action.operation, "readCheckpoint");
      assert.deepEqual(response, expectedSyntheticCheckpoint());
    }
  } else if (action.family === "pointer") {
    if (action.operation === "down") {
      compatibilityExpectedSyntheticState.pointer = {pointerId: action.pointerId, startX: action.point.x, startY: action.point.y, x: action.point.x, y: action.point.y, cancelled: false};
      assert.deepEqual(response, {pointer: compatibilityExpectedSyntheticState.pointer});
    } else if (action.operation === "move") {
      assert.ok(compatibilityExpectedSyntheticState.pointer && compatibilityExpectedSyntheticState.pointer.pointerId === action.pointerId);
      compatibilityExpectedSyntheticState.pointer = {...compatibilityExpectedSyntheticState.pointer, x: action.point.x, y: action.point.y};
      assert.deepEqual(response, {pointer: compatibilityExpectedSyntheticState.pointer});
    } else if (action.operation === "up") {
      assert.ok(compatibilityExpectedSyntheticState.pointer && compatibilityExpectedSyntheticState.pointer.pointerId === action.pointerId);
      const committedPointer = compatibilityExpectedSyntheticState.pointer;
      compatibilityExpectedSyntheticState.revision += 1;
      compatibilityExpectedSyntheticState.pointer = null;
      assert.deepEqual(response, {pointer: committedPointer, committed: true, revision: compatibilityExpectedSyntheticState.revision});
    } else {
      assert.equal(action.operation, "cancel");
      assert.ok(compatibilityExpectedSyntheticState.pointer && compatibilityExpectedSyntheticState.pointer.pointerId === action.pointerId);
      const cancelled = {...compatibilityExpectedSyntheticState.pointer, cancelled: true};
      const unchangedRevision = compatibilityExpectedSyntheticState.revision;
      compatibilityExpectedSyntheticState.pointer = null;
      assert.deepEqual(response, {pointer: cancelled, restored: true, revision: unchangedRevision});
    }
  } else if (action.family !== "checkpoint" || action.channel !== "workspace-driver") return;
  else assert.deepEqual(response, expectedSyntheticCheckpoint());
  assert.deepEqual(payload.checkpoint, expectedSyntheticCheckpoint(), `Synthetic checkpoint transition mismatch after ${action.actionId}.`);
};

const runCompatibilityEnvironmentAction = (action: Extract<NormalizedAction, {family: "runner-environment"}>) => {
  assert.ok(compatibilityGraph);
  const fixture = action.fixtureId === null ? null : resolveCompatibilityFixture(compatibilityGraph, action.fixtureId, action.operation, "environment");
  if (action.operation === "installEnvironmentPlan") {
    assert.ok(action.fixtureId);
    assert.equal(compatibilityEnvironment.installedFixtureId, null, "An environment plan is already installed.");
    compatibilityEnvironment.installedFixtureId = action.fixtureId;
    const gateIds = fixture?.value.gateIds;
    assert.ok(Array.isArray(gateIds) && gateIds.length > 0 && gateIds.every((entry) => typeof entry === "string"), "Environment plan fixture requires closed gateIds.");
    for (const gateId of gateIds) compatibilityEnvironment.activeGates.add(gateId as string);
    compatibilityEnvironment.revision += 1;
  } else if (action.operation === "releaseEnvironmentGate") {
    const gateId = fixture?.value.gateId;
    assert.equal(typeof gateId, "string", "Environment gate-release fixture requires gateId.");
    assert.equal(compatibilityEnvironment.activeGates.delete(gateId as string), true, `Unknown environment gate: ${String(gateId)}`);
    compatibilityEnvironment.revision += 1;
  } else if (action.operation === "readEnvironmentCheckpoint") {
    compatibilityCheckpoints.push({channel: "runner-environment", checkpointId: action.operationId, fixtureId: compatibilityEnvironment.installedFixtureId, activeGates: [...compatibilityEnvironment.activeGates].sort(), revision: compatibilityEnvironment.revision});
  } else {
    assert.equal(action.operation, "clearEnvironmentPlan");
    assert.equal(compatibilityEnvironment.activeGates.size, 0, "Environment gates must be released before clear.");
    compatibilityEnvironment.installedFixtureId = null;
    compatibilityEnvironment.revision += 1;
  }
  return {fixtureId: compatibilityEnvironment.installedFixtureId, fixtureKind: fixture?.fixtureKind ?? null, sourceKind: fixture?.sourceKind ?? null, activeGates: [...compatibilityEnvironment.activeGates].sort(), revision: compatibilityEnvironment.revision};
};

const readCompatibilityStorage = async (page: Page, contextId: string, checkpoint: string) => {
  const evidence = await page.evaluate(async () => {
    if (typeof indexedDB.databases !== "function") throw new Error("SPEC0001_INDEXEDDB_ENUMERATION_UNAVAILABLE");
    if (typeof caches?.keys !== "function") throw new Error("SPEC0001_CACHESTORAGE_ENUMERATION_UNAVAILABLE");
    if (!("serviceWorker" in navigator) || typeof navigator.serviceWorker.getRegistrations !== "function") throw new Error("SPEC0001_SERVICE_WORKER_ENUMERATION_UNAVAILABLE");
    const opfsAvailable = typeof navigator.storage?.getDirectory === "function";
    const opfsEntries: string[] = [];
    if (opfsAvailable) {
      const root = await navigator.storage.getDirectory();
      const keys = (root as unknown as {keys(): AsyncIterableIterator<string>}).keys();
      for await (const name of keys) opfsEntries.push(name);
    }
    return {
      localStorageKeys: Object.keys(window.localStorage).sort(),
      sessionStorageKeys: Object.keys(window.sessionStorage).sort(),
      indexedDatabaseCount: (await indexedDB.databases()).length,
      cacheCount: (await caches.keys()).length,
      serviceWorkerCount: (await navigator.serviceWorker.getRegistrations()).length,
      opfsAvailable,
      opfsEntries: opfsEntries.sort(),
    };
  });
  const productPreferenceCheckpoint =
    (contextId === "synthetic-1024x768" && (checkpoint === "after-actions" || checkpoint === "before-close")) ||
    (contextId.startsWith("regression-") && checkpoint === "before-close");
  const expectedLocalStorageKeys = productPreferenceCheckpoint
    ? ["da_drawing_ai_control_preferences_v1", "da_welcome_seen"]
    : [];
  assert.deepEqual(evidence, {localStorageKeys: expectedLocalStorageKeys, sessionStorageKeys: [], indexedDatabaseCount: 0, cacheCount: 0, serviceWorkerCount: 0, opfsAvailable: evidence.opfsAvailable, opfsEntries: []}, `Unexpected browser storage state in ${contextId}:${checkpoint}`);
  assert.equal(typeof evidence.opfsAvailable, "boolean", `OPFS availability evidence is invalid in ${contextId}:${checkpoint}.`);
  const record = {contextId, checkpoint, ...evidence};
  compatibilityStorage.push(record);
  return record;
};

const compatibilityDismissWelcome = async (page: Page) => {
  await visible(page, "dialog", "Welcome to Diamond Animator");
  await (await visible(page, "button", "Close welcome")).click();
  await waitForWelcomeInert(page);
};

const compatibilityOpenNewProject = async (page: Page) => {
  await (await visible(page, "button", /^New Project\b/)).click();
  await visible(page, "button", /^Drawing Animation\b/);
  await visible(page, "button", /^Stick Figure Animation\b/);
};

const pushCompatibilityRegression = (group: string, assertions: string[]) => {
  const entry = {group, status: "passed", assertions, at: now()};
  compatibilityRegressions.push(entry);
  return entry;
};

const runCompatibilityProtectedRegressions = async (server: RunningServer) => {
  if (compatibilityRegressions.length !== 0) return;
  const viewport = {width: 1024, height: 768};
  const regressionPlan = validateFixturePlan();

  {
    const {context, page, profile} = await createCompatibilityContext("regression-home-new-drawing", viewport, server.port);
    try {
      await compatibilityDismissWelcome(page);
      await compatibilityOpenNewProject(page);
      await (await visible(page, "button", /^Drawing Animation\b/)).click();
      await visible(page, "button", /Task: Generate Plans/);
      pushCompatibilityRegression("home-new-drawing", ["Home New Project visible", "project chooser visible", "Drawing workspace opened"]);
    } finally { await closeCompatibilityContext(context, profile); }
  }

  {
    const {context, page, profile} = await createCompatibilityContext("regression-home-new-stick", viewport, server.port);
    try {
      await compatibilityDismissWelcome(page);
      await compatibilityOpenNewProject(page);
      await (await visible(page, "button", /^Stick Figure Animation\b/)).click();
      await visible(page, "button", "Stick Figure Tools");
      pushCompatibilityRegression("home-new-stick", ["Home New Project visible", "project chooser visible", "Stick workspace opened"]);
    } finally { await closeCompatibilityContext(context, profile); }
  }

  {
    const {context, page, profile} = await createCompatibilityContext("regression-stick-creator-back", viewport, server.port);
    try {
      await compatibilityDismissWelcome(page);
      await compatibilityOpenNewProject(page);
      await (await visible(page, "button", /^Stick Figure Animation\b/)).click();
      await (await visible(page, "button", "Stick Figure Tools")).click();
      await (await visible(page, "button", "Create New Stick Figure")).click();
      const save = await visible(page, "button", "Save Stick Figure");
      assert.equal(await save.isDisabled(), true);
      await (await visible(page, "button", "Back")).click();
      await visible(page, "button", "Stick Figure Tools");
      pushCompatibilityRegression("stick-creator-back", ["Stick tools opened", "Creator opened", "Save remained disabled", "Back restored Stick workspace"]);
    } finally { await closeCompatibilityContext(context, profile); }
  }

  {
    const response = readJson(ROOT, DRAWING_RESPONSE_PATH);
    const {context, page, profile} = await createCompatibilityContext("regression-drawing-protected", viewport, server.port, response);
    try {
      await compatibilityDismissWelcome(page);
      await compatibilityOpenNewProject(page);
      await (await visible(page, "button", /^Drawing Animation\b/)).click();
      const taskButton = await visible(page, "button", /Task: Generate Plans/);
      await taskButton.click();
      await (await visible(page, "menuitemradio", /^Generate Frames\b/)).click();
      const textarea = page.getByPlaceholder("Chat here");
      const canvas = page.locator('[data-workspace-canvas="editable"]');
      await textarea.waitFor({state: "visible"});
      await canvas.waitFor({state: "visible"});
      const before = await canvasPixelEvidence(canvas);
      assert.equal(before.redPixels, 0);
      await textarea.fill(FIXED_DRAWING_PROMPT);
      await textarea.press("Enter");
      let generated = await canvasPixelEvidence(canvas);
      for (let attempt = 0; attempt < 120 && generated.redPixels < 100; attempt += 1) {
        await page.waitForTimeout(250);
        generated = await canvasPixelEvidence(canvas);
      }
      assert.ok(generated.redPixels >= 100);
      await page.getByText(regressionPlan.settledSuccessText, {exact: true}).waitFor({state: "visible", timeout: 30_000});
      for (const label of SETTLED_ABSENT_TEXT) await page.getByText(label, {exact: true}).waitFor({state: "hidden", timeout: 30_000});
      assert.equal(await textarea.isEnabled(), true);
      pushCompatibilityRegression("drawing-generate-frames", ["Generate Frames selected", "one deterministic mocked response applied", "settled success visible", "input re-enabled", "generated pixels visible"]);

      const undo = page.getByRole("button", {name: "Undo", exact: true});
      const redo = page.getByRole("button", {name: "Redo", exact: true});
      assert.equal(await undo.isEnabled(), true);
      await undo.click();
      let undone = await canvasPixelEvidence(canvas);
      for (let attempt = 0; attempt < 80 && undone.redPixels !== 0; attempt += 1) {
        await page.waitForTimeout(100);
        undone = await canvasPixelEvidence(canvas);
      }
      assert.equal(undone.redPixels, 0);
      assert.equal(await redo.isEnabled(), true);
      await redo.click();
      let redone = await canvasPixelEvidence(canvas);
      for (let attempt = 0; attempt < 80 && redone.redPixels < 100; attempt += 1) {
        await page.waitForTimeout(100);
        redone = await canvasPixelEvidence(canvas);
      }
      assert.equal(redone.redPixels, generated.redPixels);
      await (await visible(page, "button", "Play")).click();
      await page.waitForTimeout(250);
      await (await visible(page, "button", "Pause")).click();
      let paused = await canvasPixelEvidence(canvas);
      for (let attempt = 0; attempt < 80 && paused.redPixels < 100; attempt += 1) {
        await page.waitForTimeout(100);
        paused = await canvasPixelEvidence(canvas);
      }
      assert.equal(paused.redPixels, generated.redPixels);
      assert.equal(compatibilityRequests.length, 1);
      pushCompatibilityRegression("drawing-undo-redo-play-pause", ["Undo removed generated pixels", "Redo restored exact red-pixel count", "Play exposed Pause", "Pause restored exact red-pixel count", "no second request"]);
    } finally { await closeCompatibilityContext(context, profile); }
  }
};

const waitForCompatibilityDriver = async (page: Page, contextId: string) => {
  for (let attempt = 0; attempt < 150; attempt += 1) {
    if (compatibilityDriverMessages.some((message) => message.contextId === contextId && message.operation === "tester.connection.ping/v2")) return;
    await page.waitForTimeout(100);
  }
  throw new Error(`Compatibility driver did not connect in context ${contextId}.`);
};

const executeCompatibilityAction = async (
  step: ValidatedTesterExtension["plan"]["steps"][number],
  action: NormalizedAction,
  page: Page,
  viewport: {width: number; height: number},
  server: RunningServer,
) => {
  let evidence: JsonObject = {};
  if (action.family === "visible-role") {
    const locator = page.getByRole(action.role as Parameters<Page["getByRole"]>[0], {name: action.accessibleName, exact: true});
    if (action.operation === "assert-hidden") await locator.waitFor({state: "hidden", timeout: 30_000});
    else {
      await locator.waitFor({state: "visible", timeout: 30_000});
      if (action.operation === "click") await locator.click();
      else if (action.operation === "fill") {
        assert.ok(action.input && "text" in action.input);
        await locator.fill(action.input.text);
      } else if (action.operation === "press") {
        assert.ok(action.input && "key" in action.input);
        await locator.press(action.input.key);
      } else if (action.operation === "assert-enabled") assert.equal(await locator.isEnabled(), true);
      else if (action.operation === "assert-disabled") assert.equal(await locator.isDisabled(), true);
      else assert.equal(action.operation, "assert-visible");
    }
    evidence = {operation: action.operation, role: action.role, accessibleName: action.accessibleName};
  } else if (action.family === "visible-testid") {
    const locator = page.getByTestId(action.testId);
    await locator.waitFor({state: "visible", timeout: 30_000});
    if (action.operation === "click") await locator.click();
    else if (action.operation === "assert-enabled") assert.equal(await locator.isEnabled(), true);
    else if (action.operation === "assert-disabled") assert.equal(await locator.isDisabled(), true);
    else assert.equal(action.operation, "assert-visible");
    evidence = {operation: action.operation, testId: action.testId};
  } else if (action.family === "pointer") {
    await waitForCompatibilityDriver(page, step.contextId);
    evidence = canonicalCompatibilityCommandEvidence(await dispatchCompatibilityPointer(page, step.contextId, action), action.actionId);
  } else if (action.family === "workspace-driver") {
    await waitForCompatibilityDriver(page, step.contextId);
    if (action.fixtureId !== null) assert.ok(compatibilityGraph?.registry.fixtures.some((fixture) => fixture.fixtureId === action.fixtureId));
    const command = compatibilityDriverPayload(compatibilityGraph!, action);
    const message = await dispatchCompatibilityCommand(page, step.contextId, command.operation, command.payload);
    evidence = canonicalCompatibilityCommandEvidence(message.payload, action.actionId);
    if (action.operation === "readCheckpoint") compatibilityCheckpoints.push({channel: "workspace-driver", checkpointId: action.operationId, ...evidence});
  } else if (action.family === "runner-environment") {
    if (action.fixtureId !== null) assert.ok(compatibilityGraph?.registry.fixtures.some((fixture) => fixture.fixtureId === action.fixtureId));
    evidence = runCompatibilityEnvironmentAction(action);
  } else if (action.family === "checkpoint") {
    if (action.channel === "workspace-driver") {
      await waitForCompatibilityDriver(page, step.contextId);
      const checkpointOperation = compatibilityGraph?.adapter.executionProfile === "synthetic-state-machine/v1" ? "checkpoint.read/v1" : "workspace.read-checkpoint/v1";
      const message = await dispatchCompatibilityCommand(page, step.contextId, checkpointOperation, {checkpointId: action.checkpointId, operationId: action.checkpointId});
      evidence = canonicalCompatibilityCommandEvidence(message.payload, action.actionId);
      compatibilityCheckpoints.push({channel: action.channel, checkpointId: action.checkpointId, ...evidence});
    } else {
      evidence = {fixtureId: compatibilityEnvironment.installedFixtureId, activeGates: [...compatibilityEnvironment.activeGates].sort(), revision: compatibilityEnvironment.revision};
      compatibilityCheckpoints.push({channel: action.channel, checkpointId: action.checkpointId, ...evidence});
    }
  } else if (action.family === "screenshot") {
    assert.ok(compatibilityGraph?.plan.evidence.screenshotIds.includes(action.screenshotId));
    const path = `${COMPATIBILITY_SCREENSHOT_ROOT}/${action.screenshotId}.png`;
    const screenshotBytes = await page.screenshot({fullPage: false});
    writeFileSync(secureExtensionFilePath(path, true), screenshotBytes, {mode: 0o600, flag: "wx"});
    const binding = {...bindFile(ROOT, path), id: action.screenshotId, viewport};
    compatibilityScreenshots.push(binding);
    evidence = binding;
  } else {
    assert.equal(action.family, "protected-regression");
    await runCompatibilityProtectedRegressions(server);
    const regression = compatibilityRegressions.find((entry) => entry.group === action.group);
    assert.ok(regression, `Protected regression group did not run: ${action.group}`);
    evidence = regression;
  }
  assertSyntheticTransition(action, evidence);
  let ledgerEvidence = evidence;
  if ((action.family === "workspace-driver" || action.family === "runner-environment") && action.fixtureId !== null) {
    const fixture = compatibilityGraph!.registry.fixtures.find((entry) => entry.fixtureId === action.fixtureId)!;
    const resolved = resolveCompatibilityFixture(compatibilityGraph!, action.fixtureId, action.operation, action.family === "workspace-driver" ? "driver" : "environment");
    ledgerEvidence = {
      result: evidence,
      fixture: {
        fixtureId: fixture.fixtureId,
        fixtureKind: fixture.fixtureKind,
        sourceKind: fixture.sourceKind,
        expectedFixtureDigest: fixture.expectedFixtureDigest,
        observedFixtureDigest: "implementationDigest" in resolved ? resolved.implementationDigest : resolved.binding.sha256,
        binding: "binding" in resolved ? resolved.binding : null,
      },
    };
  }
  const stateful = action.family === "pointer" || action.family === "workspace-driver" || action.family === "runner-environment" || action.family === "checkpoint";
  const expectedEvidenceDigest = (action as NormalizedAction & {expectedEvidenceDigest?: unknown}).expectedEvidenceDigest;
  const observedEvidenceDigest = stateful ? sha256Bytes(stableJson(evidence)) : undefined;
  if (stateful) {
    assert.equal(typeof expectedEvidenceDigest, "string", `Stateful action ${action.actionId} is missing its frozen expected evidence digest.`);
    assert.equal(observedEvidenceDigest, expectedEvidenceDigest, `Stateful action evidence drift: ${action.actionId}`);
  } else assert.equal(expectedEvidenceDigest, undefined, `Stateless action ${action.actionId} must not carry an expected evidence digest.`);
  compatibilityOperations.push({
    stepId: step.stepId,
    actionId: action.actionId,
    contextId: step.contextId,
    family: action.family,
    status: "passed",
    at: now(),
    ...(stateful ? {expectedEvidenceDigest: expectedEvidenceDigest as string, observedEvidenceDigest} : {}),
    evidence: ledgerEvidence,
  });
};

const runCompatibilityNetworkGuardSelfTest = (guardV2Path: string) => {
  const execute = (script: string, nodeOptions: string) => spawnSync(process.execPath, ["-e", script], {
    cwd: ROOT,
    env: {
      PATH: process.env.PATH,
      NODE_OPTIONS: nodeOptions,
      NEXT_TELEMETRY_DISABLED: "1",
      SPEC0001_NETWORK_LEDGER: secureExtensionFilePath(COMPATIBILITY_SERVER_NETWORK_LEDGER, true),
      SPEC0001_REPOSITORY_ROOT: ROOT,
    } as unknown as NodeJS.ProcessEnv,
    encoding: "utf8",
    shell: false,
  });
  const frozenPath = repositoryPath(ROOT, NETWORK_GUARD_PATH);
  const v1Result = execute("globalThis.__SPEC0001_NETWORK_DENY_SELF_TEST_V1().then((v)=>process.stdout.write(JSON.stringify({pid:process.pid,checks:v}))).catch((e)=>{console.error(e);process.exit(1)})", `--require=${frozenPath}`);
  assert.equal(v1Result.status, 0, v1Result.stderr || "Frozen network guard self-test failed.");
  const v1 = JSON.parse(v1Result.stdout) as {pid: number; checks: Array<{name: string; denied: boolean}>};
  assert.ok(Number.isSafeInteger(v1.pid) && v1.pid > 1);
  assert.deepEqual(v1.checks.map((entry) => entry.name), SERVER_GUARD_CHECKS);
  assert.ok(v1.checks.every((entry) => entry.denied));
  const v2Result = execute("globalThis.__SPEC0001_COMPATIBILITY_NETWORK_SELF_TEST_V2().then((v)=>process.stdout.write(JSON.stringify({pid:process.pid,checks:v}))).catch((e)=>{console.error(e);process.exit(1)})", `--require=${guardV2Path}`);
  assert.equal(v2Result.status, 0, v2Result.stderr || "Compatibility v2 network guard self-test failed.");
  const v2 = JSON.parse(v2Result.stdout) as {pid: number; checks: Array<{name: string; denied: boolean; suppressed?: boolean}>};
  assert.ok(Number.isSafeInteger(v2.pid) && v2.pid > 1);
  assert.deepEqual(v2.checks.map((entry) => entry.name), [
    "deceptive-127-host", "node-next-marker", "next-child-env-stripping", "next-child-appended-preload", "next-child-shell",
    "next-fork-exec-path", "next-fork-exec-argv", "next-child-loader-env", "next-fork-inherited-exec-argv",
    "next-version-info-suppressed", "next-version-info-direct-fetch", "next-telemetry-flush-suppressed", "next-telemetry-detached-spawn",
  ]);
  assert.ok(v2.checks.every((entry, index) => index === 9 || index === 11 ? entry.denied === false && entry.suppressed === true : entry.denied === true && entry.suppressed === undefined));
  const ledgerEntries = readNdjson(COMPATIBILITY_SERVER_NETWORK_LEDGER);
  assert.equal(ledgerEntries.length, SERVER_GUARD_CHECKS.length + 13, "Network ledger must contain only the exact v1+v2 guard self-test prefix before server startup.");
  return {
    segments: [{pid: v1.pid, entryCount: SERVER_GUARD_CHECKS.length}, {pid: v2.pid, entryCount: 13}],
    checks: [...v1.checks, ...v2.checks],
    ledgerEntryCount: ledgerEntries.length,
    ledgerSha256: sha256Bytes(stableJson(ledgerEntries)),
  };
};

const runCompatibilityBrowserDenialSelfTest = async (server: RunningServer) => {
  const before = compatibilityExpectedDenials.length;
  const {context, page, profile} = await createCompatibilityContext("network-denial-self-test", {width: 1024, height: 768}, server.port, null, true);
  try {
    const fetchOutcome = await page.evaluate(() => fetch("https://203.0.113.1/spec0001-compatibility-fetch-denial").then(() => "opened", () => "denied"));
    assert.equal(fetchOutcome, "denied");
    const websocketOutcome = await page.evaluate(() => new Promise<string>((resolveOutcome) => {
      const socket = new WebSocket("wss://203.0.113.1/spec0001-compatibility-websocket-denial");
      socket.addEventListener("open", () => resolveOutcome("opened"), {once: true});
      socket.addEventListener("error", () => resolveOutcome("denied"), {once: true});
      socket.addEventListener("close", () => resolveOutcome("denied"), {once: true});
      window.setTimeout(() => resolveOutcome("timeout"), 5_000);
    }));
    assert.equal(websocketOutcome, "denied");
  } finally { await closeCompatibilityContext(context, profile); }
  assert.equal(compatibilityExpectedDenials.length, before + 2);
  assert.deepEqual(compatibilityExpectedDenials.slice(before).map((entry) => entry.method), ["GET", "WEBSOCKET"]);
};

const readNdjson = (path: string) => {
  const absolute = secureExtensionFilePath(path);
  if (!existsSync(absolute)) return [];
  return readFileSync(absolute, "utf8").trim().split("\n").filter(Boolean).map((line) => JSON.parse(line) as JsonObject);
};

const validateCompatibilityConsoleEvidence = (entries: JsonObject[]) => {
  const selfTestEntries = entries.filter((entry) => entry.expectedSelfTest === true);
  for (const [index, entry] of selfTestEntries.entries()) {
    const normalized = strictObject(entry, ["at", "contextId", "expectedSelfTest", "message", "type"], `Browser denial self-test console ${index}`);
    assert.equal(normalized.contextId, "network-denial-self-test");
    assert.equal(normalized.type, "error");
    const message = String(normalized.message);
    assert.ok(message.includes("net::ERR_BLOCKED_BY_CLIENT") || message.includes("wss://203.0.113.1/spec0001-compatibility-websocket-denial"), `Unexpected denial self-test console message: ${message}`);
  }
  const applicationEntries = entries.filter((entry) => entry.expectedSelfTest !== true);
  assert.deepEqual(applicationEntries, compatibilityConsole, "Compatibility application console ledger differs from in-memory evidence.");
  return {applicationEntries: applicationEntries.length, expectedSelfTestEntries: selfTestEntries.length};
};

const exactZero = (value: number, label: string): 0 => {
  assert.equal(value, 0, `${label} must be zero.`);
  return value as 0;
};

const isExactLoopbackHost = (value: string) => {
  const host = value.replace(/^\[|\]$/g, "").toLowerCase();
  const family = isIP(host);
  return (family === 4 && host.split(".")[0] === "127") || (family === 6 && host === "::1");
};

const isExactLoopbackTarget = (value: string) => {
  if (isExactLoopbackHost(value)) return true;
  try { return isExactLoopbackHost(new URL(value).hostname); }
  catch {
    const hostWithoutPort = value.match(/^([^:]+):\d+$/)?.[1];
    return hostWithoutPort !== undefined && isExactLoopbackHost(hostWithoutPort);
  }
};

const validateCompatibilityNetworkEvidence = (serverEntries: JsonObject[], browserEntries: JsonObject[], selfTest: ReturnType<typeof runCompatibilityNetworkGuardSelfTest>) => {
  const expectedSelfTestPrimitives = [
    "fetch", "http.request", "https.request", "net.connect", "tls.connect", "dns.promises.lookup", "child_process.spawn",
    "v2.http.request", "v2.child_process.spawn", "v2.child_process.fork", "v2.child_process.spawn", "v2.child_process.spawn",
    "v2.child_process.fork", "v2.child_process.fork", "v2.child_process.spawn", "v2.child_process.fork",
    "v2.framework.next.getVersionInfo", "v2.fetch", "v2.framework.next.telemetry.flushDetached", "v2.child_process.spawn",
  ];
  const normalizedServer = serverEntries.map((entry, index) => strictObject(entry, ["at", "pid", "primitive", "result", "target"], `Server network ledger ${index}`));
  const selfTestEntries = normalizedServer.slice(0, selfTest.ledgerEntryCount);
  assert.equal(sha256Bytes(stableJson(selfTestEntries)), selfTest.ledgerSha256, "Server denial self-test ledger prefix changed after startup.");
  let segmentOffset = 0;
  for (const segment of selfTest.segments) {
    assert.ok(selfTestEntries.slice(segmentOffset, segmentOffset + segment.entryCount).every((entry) => entry.pid === segment.pid), "Server denial self-test PID binding changed.");
    segmentOffset += segment.entryCount;
  }
  assert.deepEqual(selfTestEntries.map((entry) => entry.primitive), expectedSelfTestPrimitives, "Server denial self-test ledger changed.");
  assert.ok(selfTestEntries.every((entry, index) => index === 16 || index === 18 ? entry.result === "suppressed" : entry.result === "denied"));
  const runtimeServerEntries = normalizedServer.slice(selfTest.ledgerEntryCount);
  const runtimeDenials = runtimeServerEntries.filter((entry) => entry.result === "denied");
  assert.equal(runtimeDenials.length, 0, `Unexpected server/child network denials: ${stableJson(runtimeDenials)}`);
  const runtimeSuppressions = runtimeServerEntries.filter((entry) => entry.result === "suppressed");
  assert.deepEqual(runtimeSuppressions.map((entry) => ({primitive: entry.primitive, target: entry.target})), [
    {primitive: "v2.framework.next.getVersionInfo", target: "https://registry.npmjs.org/-/package/next/dist-tags"},
    {primitive: "v2.framework.next.telemetry.flushDetached", target: "dev:repository-root"},
    {primitive: "v2.framework.next.telemetry.flushDetached", target: "dev:repository-root"},
  ], "Next development-only network suppressions changed.");
  for (const entry of runtimeServerEntries.filter((entry) => entry.result !== "suppressed")) {
    assert.equal(entry.result, "allowed");
    const target = String(entry.target);
    const loopback = target === "next-internal-node-child" || isExactLoopbackTarget(target);
    assert.equal(loopback, true, `Unexpected allowed server network target: ${target}`);
  }

  const normalizedBrowser = browserEntries.map((entry, index) => strictObject(entry, ["allowed", "at", "channel", "expectedSelfTest", "host", "method", "path", "protocol"], `Browser network ledger ${index}`));
  const browserDenied = normalizedBrowser.filter((entry) => entry.allowed === false);
  const expectedBrowserDenied = browserDenied.filter((entry) => entry.expectedSelfTest === true);
  assert.deepEqual(expectedBrowserDenied.map((entry) => entry.method), ["GET", "WEBSOCKET"], "Browser denial self-test ledger changed.");
  const unexpectedBrowserDenied = browserDenied.filter((entry) => entry.expectedSelfTest !== true);
  assert.deepEqual(unexpectedBrowserDenied, [], `Unexpected browser non-loopback attempts: ${stableJson(unexpectedBrowserDenied)}`);
  assert.ok(normalizedBrowser.filter((entry) => entry.allowed === true).every((entry) => {
    try {
      return isExactLoopbackHost(new URL(`${String(entry.protocol)}//${String(entry.host)}`).hostname);
    } catch { return false; }
  }), "Browser ledger contains an allowed non-loopback target.");

  const childNonLoopbackAttempts = runtimeDenials.filter((entry) => String(entry.primitive).startsWith("child_process.")).length;
  const serverNonLoopbackAttempts = runtimeDenials.length - childNonLoopbackAttempts;
  const browserNonLoopbackAttempts = unexpectedBrowserDenied.length;
  const counts = {
    browserNonLoopbackAttempts: exactZero(browserNonLoopbackAttempts, "Browser non-loopback attempt count"),
    serverNonLoopbackAttempts: exactZero(serverNonLoopbackAttempts, "Server non-loopback attempt count"),
    childNonLoopbackAttempts: exactZero(childNonLoopbackAttempts, "Child non-loopback attempt count"),
  };
  return {
    counts,
    selfTests: {serverSegments: selfTest.segments, serverLedgerPrefixSha256: selfTest.ledgerSha256, serverPrimitives: expectedSelfTestPrimitives, browserMethods: ["GET", "WEBSOCKET"]},
    runtimeEntryCounts: {server: runtimeServerEntries.length, browser: normalizedBrowser.length},
  };
};

const performCompatibilityCleanup = async () => {
  const failures: unknown[] = [];
  for (const [context, profile] of [...compatibilityOwnedContexts]) {
    try { await context.close(); } catch (error) { failures.push(error); }
    compatibilityOwnedContexts.delete(context);
    try { safeRemoveCompatibilityOwned(profile); } catch (error) { failures.push(error); }
    ownedProfiles.delete(profile);
  }
  activeContext = null;
  try { await stopServer(activeServer); } catch (error) { failures.push(error); }
  try { restoreCompatibilityAnchor(); } catch (error) { failures.push(error); }
  for (const [commandId, pending] of compatibilityPendingCommands) {
    pending.reject(new Error(`Compatibility cleanup cancelled pending command: ${commandId}`));
    compatibilityPendingCommands.delete(commandId);
  }
  compatibilityEnvironment.activeGates.clear();
  compatibilityEnvironment.installedFixtureId = null;
  for (const profile of [...ownedProfiles]) {
    if (!profile.startsWith(`${COMPATIBILITY_TEMP_ROOT}/`)) continue;
    try { safeRemoveCompatibilityOwned(profile); } catch (error) { failures.push(error); }
    ownedProfiles.delete(profile);
  }
  try { removeCompatibilityNextIfOwned(); } catch (error) { failures.push(error); }
  if (compatibilityOwnsTempRoot) {
    try {
      if (existsSync(assertExtensionOwnedPath(COMPATIBILITY_TEMP_ROOT).absolute)) safeRemoveCompatibilityOwned(COMPATIBILITY_TEMP_ROOT);
      compatibilityOwnsTempRoot = false;
    } catch (error) { failures.push(error); }
  }
  if (failures.length > 0) throw new AggregateError(failures, "Compatibility cleanup failed closed.");
};

const cleanupCompatibility = () => {
  compatibilityCleanupPromise ??= performCompatibilityCleanup();
  return compatibilityCleanupPromise;
};

const runVersion2Proof = async (graph: ValidatedTesterExtension) => {
  compatibilityGraph = graph;
  configureExtensionOutputPaths(graph);
  ensureCompatibilityNoCollisions();
  const collisionPreservation = runCompatibilityCollisionPreservationSelfTest(graph);
  const browserExecutable = compatibilityExecutableEvidence(BROWSER_EXECUTABLE);
  const preRunSourceSnapshot = snapshotExtensionSourceState(graph);
  ensureSafeExtensionDirectory(COMPATIBILITY_SCREENSHOT_ROOT);
  ensureSafeExtensionDirectory(COMPATIBILITY_TEMP_ROOT);
  compatibilityOwnsTempRoot = true;
  compatibilityOutputInitialized = true;
  for (const ledger of [COMPATIBILITY_SERVER_LOG, COMPATIBILITY_SERVER_NETWORK_LEDGER, COMPATIBILITY_BROWSER_NETWORK_LEDGER, COMPATIBILITY_BROWSER_CONSOLE_LEDGER]) {
    writeFileSync(secureExtensionFilePath(ledger, true), "", {encoding: "utf8", mode: 0o600, flag: "wx"});
  }
  const lifecycleDrills = await runCompatibilityLifecycleDrills(graph);
  const font = prepareCompatibilityFontMock();
  const guardV2 = prepareCompatibilityNetworkGuardV2();
  const guardSelfTest = runCompatibilityNetworkGuardSelfTest(guardV2.path);
  installCompatibilityAnchor();
  const contexts = new Map<string, Awaited<ReturnType<typeof createCompatibilityContext>>>();
  let server: RunningServer | null = null;
  try {
    server = await startCompatibilityServer("development", font.path);
    await runCompatibilityBrowserDenialSelfTest(server);
    for (const contextPlan of graph.plan.contexts) {
      const contextInfo = await createCompatibilityContext(contextPlan.contextId, contextPlan.viewport, server.port);
      contexts.set(contextPlan.contextId, contextInfo);
      await readCompatibilityStorage(contextInfo.page, contextPlan.contextId, "before-actions");
      await compatibilityDismissWelcome(contextInfo.page);
      await compatibilityOpenNewProject(contextInfo.page);
      await (await visible(contextInfo.page, "button", /^Stick Figure Animation\b/)).click();
      await visible(contextInfo.page, "button", "Stick Figure Tools");
      await waitForCompatibilityDriver(contextInfo.page, contextPlan.contextId);
    }
    const actions = new Map(graph.registry.actions.map((action) => [action.actionId, action]));
    assert.equal(actions.size, graph.registry.actions.length, "Compatibility registry action identifiers must be unique.");
    for (const step of graph.plan.steps) {
      const action = actions.get(step.actionId);
      assert.ok(action, `Missing selected compatibility action: ${step.actionId}`);
      const contextPlan = graph.plan.contexts.find((entry) => entry.contextId === step.contextId);
      const contextInfo = contexts.get(step.contextId);
      assert.ok(contextPlan && contextInfo, `Missing compatibility context: ${step.contextId}`);
      await executeCompatibilityAction(step, action, contextInfo.page, contextPlan.viewport, server);
    }
    for (const [contextId, contextInfo] of contexts) await readCompatibilityStorage(contextInfo.page, contextId, "after-actions");
  } finally {
    for (const [contextId, contextInfo] of [...contexts]) {
      await closeCompatibilityContext(contextInfo.context, contextInfo.profile);
      contexts.delete(contextId);
    }
    await stopServer(server);
    restoreCompatibilityAnchor();
    removeCompatibilityNextIfOwned();
  }

  runCompatibilityBuild(font.path);
  const productionScan = scanProduction(COMPATIBILITY_PRODUCTION_MARKERS);
  let productionServer: RunningServer | null = null;
  let forbiddenUrlResults: JsonObject[] = [];
  try {
    productionServer = await startCompatibilityServer("production", font.path);
    forbiddenUrlResults = await compatibilityProductionSmoke(productionServer);
  } finally {
    await stopServer(productionServer);
    removeCompatibilityNextIfOwned();
  }
  const productionEvidence = {scan: productionScan, forbiddenUrlResults, testerExcluded: true};

  assert.deepEqual(compatibilityPolicyViolations, [], `Compatibility browser policy violation: ${stableJson(compatibilityPolicyViolations)}`);
  const consoleErrors = compatibilityConsole.filter((entry) => entry.type === "error" || entry.type === "pageerror");
  assert.deepEqual(consoleErrors, [], `Compatibility browser console errors: ${stableJson(consoleErrors)}`);
  for (const warning of compatibilityConsole.filter((entry) => entry.type === "warning")) {
    assert.ok(ACCEPTED_CONSOLE_WARNING_PATTERNS.some((pattern) => new RegExp(pattern).test(String(warning.message))), `Unexpected compatibility browser warning: ${warning.message}`);
  }
  assert.deepEqual(compatibilityOperations.map((entry) => entry.actionId), graph.plan.steps.map((step) => step.actionId));
  if (graph.adapter.executionProfile === "synthetic-state-machine/v1") {
    assert.equal(compatibilityExpectedSyntheticState.fixtureId, "synthetic-wave-document");
    assert.equal(compatibilityExpectedSyntheticState.revision, 5, "Synthetic revision must include mount, three manual edits, and pointer-up commit only.");
    assert.deepEqual(compatibilityExpectedSyntheticState.joints.rightArm, {x: 422, y: 142}, "Synthetic manual wave must finish at the exact outward pose.");
    assert.equal(compatibilityExpectedSyntheticState.pointer, null, "Synthetic pointer state must be terminally clear.");
    assert.deepEqual(compatibilityExpectedSyntheticState.publications, {
      "publication-a": {status: "stale", revision: 5},
      "publication-b": {status: "ready", revision: 5},
    });
    assert.equal(compatibilityExpectedSyntheticState.lastPublication, "publication-b", "Out-of-order publication A must not replace ready winner B.");
  }
  assert.deepEqual(compatibilityScreenshots.map((entry) => entry.id), graph.plan.evidence.screenshotIds);
  if (graph.adapter.executionProfile === "synthetic-state-machine/v1") assert.equal(compatibilityScreenshots.length, 1, "Compatibility synthetic proof requires exactly one screenshot.");
  assert.deepEqual(compatibilityRegressions.map((entry) => String(entry.group)).sort(), [...graph.plan.evidence.protectedRegressionGroups].sort());
  assert.equal(compatibilityRequests.length, 1, "Compatibility protected Drawing regressions require exactly one mocked request.");
  assert.equal(compatibilityEnvironment.activeGates.size, 0);
  assert.equal(compatibilityEnvironment.installedFixtureId, null);
  assert.equal(compatibilityBrowserVersions.size, 1);
  assert.deepEqual(changedPaths(), graph.git.observedDirtyPaths, "Compatibility proof changed tracked or nonignored source bytes.");
  const serverNetwork = readNdjson(COMPATIBILITY_SERVER_NETWORK_LEDGER);
  const browserNetworkEvidence = readNdjson(COMPATIBILITY_BROWSER_NETWORK_LEDGER);
  const browserConsoleEvidence = readNdjson(COMPATIBILITY_BROWSER_CONSOLE_LEDGER);
  const validatedNetwork = validateCompatibilityNetworkEvidence(serverNetwork, browserNetworkEvidence, guardSelfTest);
  const validatedConsole = validateCompatibilityConsoleEvidence(browserConsoleEvidence);
  const realApiRouteRequests = (readFileSync(secureExtensionFilePath(COMPATIBILITY_SERVER_LOG), "utf8").match(/\bPOST \/api\/ai\b/g) ?? []).length;
  assert.equal(realApiRouteRequests, 0, "The real Next /api/ai route received a compatibility request.");

  await cleanupCompatibility();
  const postRunSourceSnapshot = snapshotExtensionSourceState(graph);
  assert.deepEqual(postRunSourceSnapshot, preRunSourceSnapshot, "Compatibility proof changed authorized source bytes, modes, or Git status.");
  const observedCleanup = {
    anchorRestored: compatibilityAnchorOriginalHash !== null && sha256Bytes(readFileSync(repositoryPath(ROOT, ANCHOR_PATH))) === compatibilityAnchorOriginalHash,
    sourceRestored: JSON.stringify(postRunSourceSnapshot) === JSON.stringify(preRunSourceSnapshot),
    browserContextsOpen: compatibilityOwnedContexts.size,
    activeGates: compatibilityEnvironment.activeGates.size,
    activeIntercepts: compatibilityOwnedContexts.size,
    openChildProcesses: activeServer === null ? 0 : 1,
    openPorts: ownedPorts.size,
    residualPaths: [COMPATIBILITY_TEMP_ROOT, NEXT_DIR].filter((path) => existsSync(assertExtensionOwnedPath(path).absolute)),
  };
  assert.deepEqual(observedCleanup, {anchorRestored: true, sourceRestored: true, browserContextsOpen: 0, activeGates: 0, activeIntercepts: 0, openChildProcesses: 0, openPorts: 0, residualPaths: []});
  const cleanupEvidence = observedCleanup as ExtensionResult["cleanup"];
  const storageResidue = compatibilityStorage.some((entry) =>
    (entry.localStorageKeys as unknown[]).some((key) => key !== "da_drawing_ai_control_preferences_v1" && key !== "da_welcome_seen") || (entry.sessionStorageKeys as unknown[]).length !== 0 ||
    entry.indexedDatabaseCount !== 0 || entry.cacheCount !== 0 || entry.serviceWorkerCount !== 0 || (entry.opfsEntries as unknown[]).length !== 0);
  assert.equal(storageResidue, false, "Compatibility storage ledger contains residue.");

  writeExtensionJson(COMPATIBILITY_ACTION_LEDGER, {ledgerVersion: 1, authorizationId: graph.authorizationId, actions: compatibilityOperations});
  writeExtensionJson(COMPATIBILITY_CHECKPOINT_LEDGER, {ledgerVersion: 1, authorizationId: graph.authorizationId, checkpoints: compatibilityCheckpoints});
  writeExtensionJson(COMPATIBILITY_STORAGE_LEDGER, {ledgerVersion: 1, authorizationId: graph.authorizationId, records: compatibilityStorage, residue: storageResidue});
  writeExtensionJson(COMPATIBILITY_REQUEST_LEDGER, {ledgerVersion: 1, authorizationId: graph.authorizationId, interceptedRequests: compatibilityRequests, realApiRouteRequests});
  writeExtensionJson(COMPATIBILITY_NETWORK_LEDGER, {ledgerVersion: 1, authorizationId: graph.authorizationId, guardV2: {byteLength: guardV2.byteLength, sha256: guardV2.sha256}, guardChecks: guardSelfTest.checks, derived: validatedNetwork, expectedBrowserDenials: compatibilityExpectedDenials, browserPolicyViolations: compatibilityPolicyViolations, server: serverNetwork, browser: browserNetworkEvidence});
  writeExtensionJson(COMPATIBILITY_CONSOLE_LEDGER, {ledgerVersion: 1, authorizationId: graph.authorizationId, derived: validatedConsole, application: compatibilityConsole, complete: browserConsoleEvidence});
  writeExtensionJson(COMPATIBILITY_REGRESSION_LEDGER, {ledgerVersion: 1, authorizationId: graph.authorizationId, productPhaseClaimed: graph.adapter.productPhaseClaimed, groups: compatibilityRegressions, production: productionEvidence});
  writeExtensionJson(COMPATIBILITY_CLEANUP_LEDGER, {ledgerVersion: 1, authorizationId: graph.authorizationId, collisionPreservation, lifecycleDrills, preRunSourceSnapshot, postRunSourceSnapshot, snapshotsIdentical: true, ...cleanupEvidence});
  assert.deepEqual(compatibilityExecutableEvidence(BROWSER_EXECUTABLE), browserExecutable, "Compatibility browser executable changed during proof execution.");

  const result: ExtensionResult = {
    resultVersion: 2,
    specId: "SPEC-0001",
    proofPurpose: graph.plan.proofPurpose,
    status: "passed",
    recordedAt: now(),
    productPhaseClaimed: graph.adapter.productPhaseClaimed,
    runtime: {nodeVersion: process.version, playwrightCoreVersion: "1.62.1", browserVersion: [...compatibilityBrowserVersions][0], browserExecutable},
    derivedGitState: graph.git.derivedGitState,
    baseCommit: graph.git.baseCommit,
    headCommit: graph.git.headCommit,
    observedDirtyPaths: graph.git.observedDirtyPaths,
    dirtyExpectedPaths: graph.git.dirtyExpectedPaths,
    cleanExpectedPaths: graph.git.cleanExpectedPaths,
    selectedExpectedPaths: graph.git.selectedExpectedPaths,
    authorization: {authorizationId: graph.authorizationId, materializationKind: graph.materializationKind},
    bindings: {catalog: graph.catalogBinding, plan: graph.planBinding, registry: graph.registryBinding, adapter: graph.adapterBinding},
    execution: {
      selectedActionIds: graph.plan.steps.map((step) => step.actionId),
      actionCount: compatibilityOperations.length,
      checkpointCount: compatibilityCheckpoints.length,
      screenshotCount: compatibilityScreenshots.length,
      protectedRegressionGroups: graph.plan.evidence.protectedRegressionGroups,
    },
    evidence: {
      ledgerKinds: graph.plan.evidence.ledgerKinds,
      screenshotIds: graph.plan.evidence.screenshotIds,
      protectedRegressionGroups: graph.plan.evidence.protectedRegressionGroups,
    },
    network: validatedNetwork.counts,
    cleanup: cleanupEvidence,
  };
  validateExtensionResult(result, ROOT, true);
  writeExtensionJson(COMPATIBILITY_RESULT_PATH, result);
  console.log(`SPEC-0001 ${graph.plan.proofPurpose} browser proof PASS: ${compatibilityOperations.length} closed actions, ${compatibilityCheckpoints.length} checkpoints, ${compatibilityScreenshots.length} screenshots, ${compatibilityRegressions.length} protected regression groups, productPhaseClaimed=${graph.adapter.productPhaseClaimed}.`);
};

const cleanup = async () => {
  if (cleanupStarted) return;
  cleanupStarted = true;
  try { if (activeContext) await activeContext.close(); } catch {}
  activeContext = null;
  try { await stopServer(activeServer); } catch {}
  try { restoreAnchor(); } catch {}
  for (const profile of [...ownedProfiles]) {
    try { safeRemoveOwned(profile); } catch {}
    ownedProfiles.delete(profile);
  }
  try { if (existsSync(resolve(ROOT, NEXT_DIR))) safeRemoveOwned(NEXT_DIR); } catch {}
  try { if (existsSync(resolve(ROOT, TEMP_ROOT))) safeRemoveOwned(TEMP_ROOT); } catch {}
};

const main = async () => {
  ensureNoCollisions();
  plan = validateFixturePlan();
  mkdirSync(repositoryPath(ROOT, SCREENSHOT_ROOT), {recursive: true, mode: 0o700});
  mkdirSync(repositoryPath(ROOT, TEMP_ROOT), {recursive: true, mode: 0o700});
  for (const ledger of [NETWORK_LEDGER, BROWSER_LEDGER, CONSOLE_LEDGER, SERVER_LOG]) {
    writeFileSync(repositoryPath(ROOT, ledger), "", {encoding: "utf8", mode: 0o600});
  }
  chmodSync(repositoryPath(ROOT, BROWSER_OUTPUT), 0o700);
  const font = prepareFontMock();
  await runStaticNegativeDrills();
  const guardChecks = runNetworkGuardSelfTest();
  const failureDrill = await runInjectedFailureDrill(font.path);
  installAnchor();
  let websocketServer: RunningServer | null = null;
  let websocketCheck: JsonObject;
  try {
    websocketServer = await startServer("development", font.path);
    websocketCheck = await runBrowserWebSocketSelfTest(websocketServer);
  } finally {
    await stopServer(websocketServer);
    restoreAnchor();
    if (existsSync(resolve(ROOT, NEXT_DIR))) safeRemoveOwned(NEXT_DIR);
  }
  assertCleanResources("WebSocket self-test");
  await runServerFailureDrill(font.path);
  runBuildFailureDrill(font.path);
  await runBrowserFailureDrill();
  await runSignalDrill("SIGINT");
  await runSignalDrill("SIGTERM");

  installAnchor();
  let devServer: RunningServer | null = null;
  try {
    devServer = await startServer("development", font.path);
    for (const viewport of VIEWPORTS) {
      await runWelcomePersistenceFlow(devServer, viewport);
      await runStickFlow(devServer, viewport);
    }
    await runDrawingFlow(devServer, readJson(ROOT, DRAWING_RESPONSE_PATH));
  } finally {
    await stopServer(devServer);
    restoreAnchor();
    if (existsSync(resolve(ROOT, NEXT_DIR))) safeRemoveOwned(NEXT_DIR);
  }

  const expectedDriverContexts = VIEWPORTS.map((viewport) => `stick-${viewport.width}x${viewport.height}`);
  assert.deepEqual(driverMessages.map((message) => message.context), expectedDriverContexts.flatMap((context) => [context, context]));
  for (const [index, message] of driverMessages.entries()) {
    assert.equal(message.envelope.operation, index % 2 === 0 ? "tester.connection.ping/v1" : "stick.phase2.checkpoint/v1");
    if (message.envelope.operation === "stick.phase2.checkpoint/v1") {
      assert.deepEqual(message.envelope.payload, {activeLayerId: "stick-layer-1", authoredFrameCount: 1, currentFrameIndex: 0, jointCount: 0, limbCount: 0, selectedTimelineIndex: 0});
    }
  }
  assert.equal(requestRecords.length, 1, "Drawing proof must intercept exactly one /api/ai request total.");
  assertExactRequestRecords(requestRecords);
  assertConsolePolicy();
  assertNoBrowserPolicyViolations(browserPolicyViolations);
  assert.deepEqual(operations.map(({id, viewport, action, target, passed}) => ({id, viewport, action, target, passed})), expectedOperationEvidence());
  assert.deepEqual(screenshots.map((entry) => entry.id), expectedScreenshotIds().slice(0, -PRODUCTION_SCREENSHOTS.length));

  runBuild(font.path);
  const productionScan = scanProduction();
  const productionServer = await startServer("production", font.path);
  let forbiddenUrlResults: JsonObject[] = [];
  try { forbiddenUrlResults = await productionSmoke(productionServer); }
  finally {
    await stopServer(productionServer);
    if (existsSync(resolve(ROOT, NEXT_DIR))) safeRemoveOwned(NEXT_DIR);
  }

  if (existsSync(resolve(ROOT, TEMP_ROOT))) safeRemoveOwned(TEMP_ROOT);
  assertCleanResources("golden run");
  const finalWarnings = assertConsolePolicy();
  const realApiRouteRequests = (readFileSync(repositoryPath(ROOT, SERVER_LOG), "utf8").match(/\bPOST \/api\/ai\b/g) ?? []).length;
  assert.equal(realApiRouteRequests, 0, "The real Next /api/ai route must never receive the mocked Drawing request.");
  negativeResults.push({name: "success-cleanup", status: "passed", expectedCode: "cleaned"});
  await expectRejected("missing-evidence-field", () => strictObject({status: "passed"}, ["status", "cleanup"], "Seeded missing evidence"));
  await expectRejected("extra-evidence-field", () => strictObject({status: "passed", cleanup: {}, extra: true}, ["status", "cleanup"], "Seeded extra evidence"));
  await expectRejected("tampered-evidence-value", () => assertExactRequestRecords([plan.request, plan.request]));
  const negativeFixture = strictObject(readJson(ROOT, `${FIXTURE_ROOT}/phase-1.5-negative-cases.json`), ["cases", "fixtureVersion"], "Negative cases fixture");
  assert.equal(negativeFixture.fixtureVersion, 1);
  assert.ok(Array.isArray(negativeFixture.cases));
  const expectedNegativeCases = negativeFixture.cases.map((value, index) => strictObject(value, ["category", "expectedCode", "name"], `Negative case ${index}`));
  const expectedNegativeByName = expectedNegativeCases.map((entry) => ({name: entry.name, expectedCode: entry.expectedCode})).sort((left, right) => String(left.name).localeCompare(String(right.name)));
  const actualNegativeByName = negativeResults.map(({name, expectedCode}) => ({name, expectedCode})).sort((left, right) => left.name.localeCompare(right.name));
  assert.deepEqual(actualNegativeByName, expectedNegativeByName, "Every frozen negative case must execute exactly once.");
  writeJson(NEGATIVE_PATH, {fixture: bindFile(ROOT, `${FIXTURE_ROOT}/phase-1.5-negative-cases.json`), results: negativeResults.sort((left, right) => left.name.localeCompare(right.name))});
  assert.equal(observedBrowserVersions.size, 1, "All proof contexts must use one browser version.");
  const browserVersion = [...observedBrowserVersions][0];
  const productSource = productSourceInventory(runPolicy);
  const result = {
    resultVersion: 1,
    specId: SPEC_ID,
    phase: PHASE,
    status: "passed",
    recordedAt: now(),
    historicalProofBase: PHASE15_PROOF_BASE,
    headCommit: git("rev-parse", "HEAD"),
    runBaseline: runPolicy,
    browserVersion,
    browserExecutable: externalFileEvidence(BROWSER_EXECUTABLE),
    dependency: {name: "playwright-core", version: "1.62.1", browserDownload: false},
    fontFixture: font.binding,
    fontRequests: Object.keys(font.responseMap),
    fontResponses: font.responseEvidence,
    plan: bindFile(ROOT, PLAN_PATH),
    operations,
    driverMessages,
    requestRecords,
    drawingSettlements,
    screenshots,
    console: {records: consoleRecords, errorCount: 0, warningCount: finalWarnings.length, acceptedWarningPatterns: [...ACCEPTED_CONSOLE_WARNING_PATTERNS]},
    network: {
      guardChecks,
      websocketCheck,
      browserRequests: browserNetwork.length,
      nonLoopbackAttempts: browserNetwork.filter((entry) => entry.allowed === false && entry.selfTest !== true).length,
      realApiRouteRequests,
      expectedSelfTestDenials: expectedBrowserDenials,
      expectedSelfTestConsole: expectedBrowserSelfTestConsole,
      policyViolations: browserPolicyViolations,
      serverLedger: bindFile(ROOT, NETWORK_LEDGER),
      browserLedger: bindFile(ROOT, BROWSER_LEDGER),
    },
    production: {scan: productionScan, forbiddenUrlResults},
    source: {
      anchorPath: ANCHOR_PATH,
      preimageSha256: anchorOriginalHash,
      replacementSha256: anchorReplacementHash,
      restoredSha256: sha256Bytes(readFileSync(repositoryPath(ROOT, ANCHOR_PATH))),
      instrumentationAttributableDiff: 0,
    },
    productSource,
    failureDrill,
    negativeCases: bindFile(ROOT, `${FIXTURE_ROOT}/phase-1.5-negative-cases.json`),
    negativeEvidence: bindFile(ROOT, NEGATIVE_PATH),
    cleanup: {
      status: "passed",
      openBrowserContexts: 0,
      openServers: 0,
      residualProfiles: 0,
      residualPorts: 0,
      nextBuildPresent: false,
      temporaryFontSetupPresent: false,
      anchorRestored: true,
    },
  };
  validateExactResult(result);
  writeJson(RESULT_PATH, result);
  console.log(`SPEC-0001 Phase 1.5 browser proof PASS: ${operations.length} operations, ${screenshots.length} screenshots, ${requestRecords.length} deterministic Drawing requests.`);
};

const reportLegacyFailure = async (error: unknown) => {
  await cleanup();
  try {
    mkdirSync(repositoryPath(ROOT, BROWSER_OUTPUT), {recursive: true, mode: 0o700});
    writeJson(FAILURE_PATH, {
      resultVersion: 1,
      specId: SPEC_ID,
      phase: PHASE,
      status: "failed",
      error: error instanceof Error ? error.message : String(error),
      cleanup: {anchorRestored: anchorOriginalHash === null || sha256Bytes(readFileSync(repositoryPath(ROOT, ANCHOR_PATH))) === anchorOriginalHash, openServer: activeServer !== null, openContext: activeContext !== null, residualProfiles: ownedProfiles.size, residualPorts: ownedPorts.size},
    });
  } catch {}
  console.error(error);
  process.exitCode = 1;
};

const reportCompatibilityFailure = async (error: unknown) => {
  let cleanupError: unknown = null;
  try { await cleanupCompatibility(); }
  catch (observedCleanupError) { cleanupError = observedCleanupError; }
  if (compatibilityOutputInitialized) {
    try {
      writeExtensionJson(COMPATIBILITY_RESULT_PATH, {
        resultVersion: 2,
        specId: "SPEC-0001",
        proofPurpose: compatibilityGraph?.plan.proofPurpose ?? "phase-1.5-compatibility-synthetic",
        status: "failed",
        recordedAt: now(),
        productPhaseClaimed: compatibilityGraph?.adapter.productPhaseClaimed ?? false,
        error: error instanceof Error ? error.message : String(error),
        cleanupError: cleanupError === null ? null : cleanupError instanceof Error ? cleanupError.message : String(cleanupError),
        cleanup: {
          anchorRestored: compatibilityAnchorOriginalHash === null || sha256Bytes(readFileSync(repositoryPath(ROOT, ANCHOR_PATH))) === compatibilityAnchorOriginalHash,
          sourceRestored: compatibilityGraph === null || JSON.stringify(changedPaths()) === JSON.stringify(compatibilityGraph.git.observedDirtyPaths),
          browserContextsOpen: compatibilityOwnedContexts.size,
          activeGates: compatibilityEnvironment.activeGates.size,
          openChildProcesses: activeServer === null ? 0 : 1,
          openPorts: ownedPorts.size,
        },
      });
    } catch {}
  }
  console.error(error);
  if (cleanupError !== null) console.error(cleanupError);
  process.exitCode = 1;
};

let activeTopLevelCleanup: () => Promise<void> = cleanup;
const onSignal = (signal: NodeJS.Signals) => {
  void activeTopLevelCleanup().then(
    () => process.exit(signal === "SIGINT" ? 130 : 143),
    (error) => { console.error(error); process.exit(1); },
  );
};

type CompatibilityLifecycleDrillMode = "failure" | "signal";

export const runCompatibilityLifecycleDrill = async (planPath: string, mode: CompatibilityLifecycleDrillMode) => {
  assert.ok(mode === "failure" || mode === "signal", "Unknown compatibility lifecycle drill mode.");
  const graph = loadTesterExtensionGraph(ROOT, planPath);
  compatibilityGraph = graph;
  configureExtensionOutputPaths(graph);
  COMPATIBILITY_TEMP_ROOT = `${COMPATIBILITY_SYNTHETIC_ROOT}/lifecycle-${mode}-drill`;
  COMPATIBILITY_SERVER_LOG = `${COMPATIBILITY_TEMP_ROOT}/server.log`;
  COMPATIBILITY_SERVER_NETWORK_LEDGER = `${COMPATIBILITY_TEMP_ROOT}/server-network.ndjson`;
  COMPATIBILITY_BROWSER_NETWORK_LEDGER = `${COMPATIBILITY_TEMP_ROOT}/browser-network.ndjson`;
  COMPATIBILITY_BROWSER_CONSOLE_LEDGER = `${COMPATIBILITY_TEMP_ROOT}/console.ndjson`;
  assert.ok(!existsSync(assertExtensionOwnedPath(COMPATIBILITY_TEMP_ROOT).absolute), `Lifecycle drill output collision: ${COMPATIBILITY_TEMP_ROOT}`);
  assert.ok(!existsSync(assertExtensionOwnedPath(NEXT_DIR).absolute), "Lifecycle drill requires no pre-existing .next output.");
  const preRunSourceSnapshot = snapshotExtensionSourceState(graph);
  ensureSafeExtensionDirectory(COMPATIBILITY_TEMP_ROOT);
  compatibilityOwnsTempRoot = true;
  for (const ledger of [COMPATIBILITY_SERVER_LOG, COMPATIBILITY_SERVER_NETWORK_LEDGER, COMPATIBILITY_BROWSER_NETWORK_LEDGER, COMPATIBILITY_BROWSER_CONSOLE_LEDGER]) {
    writeFileSync(secureExtensionFilePath(ledger, true), "", {encoding: "utf8", mode: 0o600, flag: "wx"});
  }
  const font = prepareCompatibilityFontMock();
  prepareCompatibilityNetworkGuardV2();
  installCompatibilityAnchor();
  let server: RunningServer | null = null;
  let contextInfo: Awaited<ReturnType<typeof createCompatibilityContext>> | null = null;
  try {
    server = await startCompatibilityServer("development", font.path);
    contextInfo = await createCompatibilityContext(`lifecycle-${mode}`, {width: 1024, height: 768}, server.port);
    await compatibilityDismissWelcome(contextInfo.page);
    await compatibilityOpenNewProject(contextInfo.page);
    await (await visible(contextInfo.page, "button", /^Stick Figure Animation\b/)).click();
    await visible(contextInfo.page, "button", "Stick Figure Tools");
    await waitForCompatibilityDriver(contextInfo.page, `lifecycle-${mode}`);
    const live = {
      anchorInstalled: compatibilityAnchorReplacementHash !== null && sha256Bytes(readFileSync(repositoryPath(ROOT, ANCHOR_PATH))) === compatibilityAnchorReplacementHash,
      browserContextsOpen: compatibilityOwnedContexts.size,
      openChildProcesses: activeServer === null ? 0 : 1,
      openPorts: ownedPorts.size,
      port: server.port,
      profile: contextInfo.profile,
    };
    assert.deepEqual({...live, port: 1, profile: "present"}, {anchorInstalled: true, browserContextsOpen: 1, openChildProcesses: 1, openPorts: 1, port: 1, profile: "present"});
    assert.ok(Number.isSafeInteger(live.port) && live.port > 0 && existsSync(assertExtensionOwnedPath(live.profile).absolute));
    if (mode === "signal") {
      activeTopLevelCleanup = cleanupCompatibility;
      process.once("SIGINT", () => onSignal("SIGINT"));
      process.once("SIGTERM", () => onSignal("SIGTERM"));
      process.stdout.write(`SPEC0001_LIFECYCLE_READY:${JSON.stringify(live)}\n`);
      await new Promise<never>(() => {});
    }
    throw new Error("SPEC0001_INJECTED_V2_LIFECYCLE_FAILURE");
  } catch (error) {
    if (mode !== "failure" || !(error instanceof Error) || error.message !== "SPEC0001_INJECTED_V2_LIFECYCLE_FAILURE") {
      try { await cleanupCompatibility(); } catch {}
      throw error;
    }
  }
  await cleanupCompatibility();
  const postRunSourceSnapshot = snapshotExtensionSourceState(graph);
  assert.deepEqual(postRunSourceSnapshot, preRunSourceSnapshot, "V2 failure drill changed source bytes, modes, or Git state.");
  const receipt = {
    mode,
    status: "passed",
    anchorRestored: compatibilityAnchorOriginalHash !== null && sha256Bytes(readFileSync(repositoryPath(ROOT, ANCHOR_PATH))) === compatibilityAnchorOriginalHash,
    sourceRestored: true,
    browserContextsOpen: compatibilityOwnedContexts.size,
    openChildProcesses: activeServer === null ? 0 : 1,
    openPorts: ownedPorts.size,
    profileRemoved: contextInfo === null || !existsSync(assertExtensionOwnedPath(contextInfo.profile).absolute),
    nextRemoved: !existsSync(assertExtensionOwnedPath(NEXT_DIR).absolute),
    temporaryRemoved: !existsSync(assertExtensionOwnedPath(COMPATIBILITY_TEMP_ROOT).absolute),
  };
  assert.deepEqual(receipt, {mode: "failure", status: "passed", anchorRestored: true, sourceRestored: true, browserContextsOpen: 0, openChildProcesses: 0, openPorts: 0, profileRemoved: true, nextRemoved: true, temporaryRemoved: true});
  process.stdout.write(`SPEC0001_LIFECYCLE_RESULT:${JSON.stringify(receipt)}\n`);
};

const runCompatibilityLifecycleDrillChild = async (graph: ValidatedTesterExtension, mode: CompatibilityLifecycleDrillMode, signal?: "SIGINT" | "SIGTERM") => {
  const runnerPath = repositoryPath(ROOT, "scripts/runSpec0001BrowserProof.ts");
  const script = `const {pathToFileURL}=require("node:url");import(pathToFileURL(${JSON.stringify(runnerPath)}).href).then((module)=>module.runCompatibilityLifecycleDrill(${JSON.stringify(graph.planBinding.path)},${JSON.stringify(mode)})).catch((error)=>{console.error(error);process.exit(1)});`;
  const before = snapshotExtensionSourceState(graph);
  const child = spawn(process.execPath, ["--experimental-strip-types", "-e", script], {
    cwd: ROOT,
    env: {
      PATH: "/usr/bin:/bin",
      HOME: process.env.HOME,
      TMPDIR: process.env.TMPDIR,
      LANG: process.env.LANG,
      LC_ALL: process.env.LC_ALL,
    } as unknown as NodeJS.ProcessEnv,
    shell: false,
    stdio: ["ignore", "pipe", "pipe"],
  });
  await new Promise<void>((resolveSpawn, rejectSpawn) => { child.once("spawn", resolveSpawn); child.once("error", rejectSpawn); });
  assert.ok(Number.isSafeInteger(child.pid) && (child.pid ?? 0) > 1, "Lifecycle drill child is missing its positive PID.");
  let stdout = "";
  let stderr = "";
  child.stdout?.on("data", (chunk) => { stdout += String(chunk); });
  child.stderr?.on("data", (chunk) => { stderr += String(chunk); });
  const childOutcome = new Promise<{code: number | null; signal: NodeJS.Signals | null}>((resolveClose, rejectTimeout) => {
    const timeout = setTimeout(() => rejectTimeout(new Error(`V2 lifecycle ${mode} drill timed out: ${stderr}`)), 240_000);
    child.once("close", (code, childSignal) => { clearTimeout(timeout); resolveClose({code, signal: childSignal}); });
  });
  let live: JsonObject | null = null;
  if (mode === "signal") {
    const deadline = Date.now() + 180_000;
    while (Date.now() < deadline && child.exitCode === null && child.signalCode === null && !stdout.includes("SPEC0001_LIFECYCLE_READY:")) await new Promise((resolveDelay) => setTimeout(resolveDelay, 50));
    const readyLine = stdout.split("\n").find((line) => line.startsWith("SPEC0001_LIFECYCLE_READY:"));
    assert.ok(readyLine, `V2 ${signal} drill did not become ready: ${stderr}`);
    live = JSON.parse(readyLine.slice("SPEC0001_LIFECYCLE_READY:".length)) as JsonObject;
    assert.ok(signal);
    assert.equal(child.kill(signal), true, `Unable to deliver ${signal} to lifecycle drill child.`);
  }
  const outcome = await childOutcome;
  if (mode === "failure") {
    assert.deepEqual(outcome, {code: 0, signal: null}, `V2 failure drill failed: ${stderr}`);
    const resultLine = stdout.split("\n").find((line) => line.startsWith("SPEC0001_LIFECYCLE_RESULT:"));
    assert.ok(resultLine, `V2 failure drill receipt is missing: ${stderr}`);
    live = JSON.parse(resultLine.slice("SPEC0001_LIFECYCLE_RESULT:".length)) as JsonObject;
  } else assert.deepEqual(outcome, {code: signal === "SIGINT" ? 130 : 143, signal: null}, `V2 ${signal} cleanup drill failed: ${stderr}`);
  const after = snapshotExtensionSourceState(graph);
  assert.deepEqual(after, before, `V2 lifecycle ${mode} child changed source bytes, modes, or Git state.`);
  assert.ok(!existsSync(assertExtensionOwnedPath(`${COMPATIBILITY_SYNTHETIC_ROOT}/lifecycle-${mode}-drill`).absolute));
  assert.ok(!existsSync(assertExtensionOwnedPath(NEXT_DIR).absolute));
  if (mode === "signal") {
    assert.ok(live && Number.isSafeInteger(live.port));
    await provePortReleased(Number(live.port));
    assert.ok(typeof live.profile === "string" && !existsSync(assertExtensionOwnedPath(live.profile).absolute));
  }
  return {mode, signal: signal ?? null, exitCode: outcome.code, sourceRestored: true, outputRemoved: true, live};
};

const runCompatibilityLifecycleDrills = async (graph: ValidatedTesterExtension) => [
  await runCompatibilityLifecycleDrillChild(graph, "failure"),
  await runCompatibilityLifecycleDrillChild(graph, "signal", "SIGINT"),
  await runCompatibilityLifecycleDrillChild(graph, "signal", "SIGTERM"),
];

const dispatchBrowserProof = () => {
  let invocation: ReturnType<typeof parseBrowserProofCli>;
  try { invocation = parseBrowserProofCli(process.argv.slice(2)); }
  catch (error) {
    console.error(error);
    process.exitCode = 1;
    return;
  }
  if (invocation.mode === "legacy") {
    process.once("SIGINT", () => onSignal("SIGINT"));
    process.once("SIGTERM", () => onSignal("SIGTERM"));
    void main().catch(reportLegacyFailure);
    return;
  }
  let graph: ValidatedTesterExtension;
  try { graph = loadTesterExtensionGraph(ROOT, invocation.planPath); }
  catch (error) {
    console.error(error);
    process.exitCode = 1;
    return;
  }
  activeTopLevelCleanup = cleanupCompatibility;
  process.once("SIGINT", () => onSignal("SIGINT"));
  process.once("SIGTERM", () => onSignal("SIGTERM"));
  void runVersion2Proof(graph).catch(reportCompatibilityFailure);
};

if (process.argv[1] && resolve(process.argv[1]) === repositoryPath(ROOT, "scripts/runSpec0001BrowserProof.ts")) dispatchBrowserProof();
