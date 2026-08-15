import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {existsSync, lstatSync, readFileSync} from "node:fs";
import {relative, resolve, sep} from "node:path";

export const SPEC_ID = "SPEC-0001" as const;
export const PHASE = "1.5" as const;
export const PHASE15_PROOF_BASE = "a35a268764c21eedffcf3d82b59718699b62d4d0" as const;
export const BASE_COMMIT = PHASE15_PROOF_BASE;
export const OUTPUT_ROOT = "output/spec-0001/phase-1.5" as const;
export const FIXTURE_ROOT = "scripts/fixtures/spec0001-browser/v1" as const;
export const ANCHOR_PATH = "src/components/workspace/stickfigure/StickFigureWorkspace.tsx" as const;
export const ANCHOR_MARKER = "/* SPEC0001_BROWSER_DRIVER_ANCHOR_V1 */" as const;
export const DRIVER_BINDING = "__SPEC0001_BROWSER_DRIVER_V1" as const;
export const BROWSER_EXECUTABLE = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" as const;
export const FIXED_DRAWING_PROMPT = "Create one frame with a centered solid red square on a transparent canvas." as const;
export const VIEWPORTS = [
  {width: 1440, height: 900},
  {width: 1024, height: 768},
] as const;
export const DRIVER_OPERATIONS = ["tester.connection.ping/v1", "stick.phase2.checkpoint/v1"] as const;
export const FORBIDDEN_URLS = ["/__spec0001-browser", "/api/__spec0001-browser", "/_next/static/spec0001-browser"] as const;
export const PRODUCTION_MARKERS = [
  "SPEC0001_BROWSER_DRIVER_ANCHOR_V1", "spec0001-browser", "runSpec0001BrowserProof",
  "__SPEC0001_BROWSER_DRIVER_V1", "scripts/fixtures/spec0001-browser", "/__spec0001-browser",
  "/api/__spec0001-browser", "/_next/static/spec0001-browser", "Browser Tester", "playwright-core",
] as const;
export const SERVER_GUARD_CHECKS = ["fetch", "http", "https", "net", "tls", "dns", "child"] as const;
export const ACCEPTED_CONSOLE_WARNING_PATTERNS = [
  "^Canvas2D: Multiple readback operations using getImageData are faster with the willReadFrequently attribute set to true\\. See: https://html\\.spec\\.whatwg\\.org/multipage/canvas\\.html#concept-canvas-will-read-frequently$",
] as const;
export const ACTIONS = [
  ["welcome-never", "click", "button:Don't show again", "each-viewport-welcome"],
  ["welcome-hidden", "assert-inert", "dialog:Welcome to Diamond Animator", "each-viewport-welcome"],
  ["welcome-visible", "assert-visible", "dialog:Welcome to Diamond Animator", "each-viewport-stick"],
  ["welcome-close", "click", "button:Close welcome", "each-viewport-stick"],
  ["home", "assert-visible", "button:New Project", "each-viewport-stick"],
  ["new", "click", "button:New Project", "each-viewport-stick"],
  ["stick", "click", "button:Stick Figure Animation", "each-viewport-stick"],
  ["tools", "click", "button:Stick Figure Tools", "each-viewport-stick"],
  ["creator", "click", "button:Create New Stick Figure", "each-viewport-stick"],
  ["save-disabled", "assert-disabled", "button:Save Stick Figure", "each-viewport-stick"],
  ["creator-back", "click", "button:Back", "each-viewport-stick"],
  ["drawing-welcome-visible", "assert-visible", "dialog:Welcome to Diamond Animator", "drawing-initial"],
  ["drawing-welcome-close", "click", "button:Close welcome", "drawing-initial"],
  ["drawing-home", "assert-visible", "button:New Project", "drawing-initial"],
  ["drawing-new", "click", "button:New Project", "drawing-initial"],
  ["drawing-open", "click", "button:Drawing Animation", "drawing-initial"],
  ["task-open", "click", "button:Task: Generate Plans", "drawing-initial"],
  ["task-frames", "click", "menuitemradio:Generate Frames", "drawing-initial"],
  ["prompt", "fill", "textbox:Chat here", "drawing-initial"],
  ["submit", "press", "textbox:Enter", "drawing-initial"],
  ["canvas-applied", "assert-visible-change", "drawing editable canvas", "drawing-initial"],
  ["drawing-settled", "assert-settled", "AI input and generated canvas", "drawing-initial"],
  ["drawing-resized", "resize", "same Drawing context:1024x768", "drawing-resized"],
  ["drawing-resize-input-usable", "assert-enabled", "AI input and submit", "drawing-resized"],
  ["drawing-resize-stable", "assert-settled", "same generated timeline bitmap", "drawing-resized"],
  ["drawing-undo", "click-and-assert", "button:Undo removes generated bitmap", "drawing-resized"],
  ["drawing-redo", "click-and-assert", "button:Redo restores generated bitmap", "drawing-resized"],
  ["drawing-play", "click", "button:Play", "drawing-resized"],
  ["drawing-pause", "click-and-assert", "button:Pause restores generated bitmap", "drawing-resized"],
] as const;
export const SCREENSHOT_TEMPLATES = [
  "stick-{viewport}", "creator-{viewport}", "stick-after-back-{viewport}",
  "drawing-canvas-before-{viewport}", "drawing-canvas-after-{viewport}", "drawing-result-{viewport}",
] as const;
export const PRODUCTION_SCREENSHOTS = ["production-home-1024x768"] as const;
export const SETTLED_ABSENT_TEXT = ["Analyzing message", "Thinking", "Planning animation", "Drawing", "Generating frames"] as const;
export const PHASE15_AUTHORIZED_PATHS = [
  "package-lock.json", "package.json", "src/components/workspace/DrawingCanvas.tsx", ANCHOR_PATH, "scripts/runSpec0001BrowserProof.ts",
  "scripts/spec0001-browser/browserTesterContract.ts", "scripts/spec0001-browser/finalizePhase15Closeout.ts",
  "scripts/spec0001-browser/networkDeny.cjs", "scripts/spec0001-browser/recordPhase15Proof.ts",
  "scripts/spec0001-browser/validatePhase15.ts", "scripts/spec0001-browser/validatePhase15Proof.ts",
  ...[
    "drawing-generate-frames-response.json", "next-font-google-response.json", "phase-1.5-browser-plan.json",
    "phase-1.5-closeout.schema.json", "phase-1.5-negative-cases.json", "phase-1.5-proof-commands.json",
    "phase-1.5-proof-manifest.schema.json", "tester-action-registry.schema.json", "tester-core.schema.json",
    "tester-result.schema.json",
  ].map((name) => `${FIXTURE_ROOT}/${name}`),
  ...[
    "geist-cyrillic.woff2", "geist-latin-ext.woff2", "geist-latin.woff2", "geist-mono-cyrillic.woff2",
    "geist-mono-latin-ext.woff2", "geist-mono-latin.woff2",
  ].map((name) => `${FIXTURE_ROOT}/fonts/${name}`),
].sort();

export type DriverOperation = (typeof DRIVER_OPERATIONS)[number];
export type JsonObject = Record<string, unknown>;
export type FileBinding = {path: string; sha256: string; byteLength: number};
export type BrowserPlan = ReturnType<typeof validateBrowserPlan>;

export const sha256Bytes = (value: Uint8Array | string) =>
  `sha256:${createHash("sha256").update(value).digest("hex")}`;

export const stableJson = (value: unknown): string => {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  const object = value as JsonObject;
  return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${stableJson(object[key])}`).join(",")}}`;
};

export const strictObject = (value: unknown, keys: readonly string[], label: string): JsonObject => {
  assert.ok(value !== null && typeof value === "object" && !Array.isArray(value), `${label} must be an object.`);
  assert.deepEqual(Object.keys(value as JsonObject).sort(), [...keys].sort(), `${label} fields must be exact.`);
  return value as JsonObject;
};

const SCHEMA_KEYS = new Set([
  "$id", "$schema", "additionalProperties", "const", "enum", "items", "maxItems", "minItems", "minLength",
  "minimum", "pattern", "properties", "required", "type",
]);

export const validateJsonSchema = (value: unknown, schemaValue: unknown, label: string): void => {
  assert.ok(schemaValue !== null && typeof schemaValue === "object" && !Array.isArray(schemaValue), `${label} schema must be an object.`);
  const schema = schemaValue as JsonObject;
  for (const key of Object.keys(schema)) assert.ok(SCHEMA_KEYS.has(key), `${label} schema keyword is unsupported: ${key}`);
  if ("const" in schema) assert.deepEqual(value, schema.const, `${label} const mismatch.`);
  if (Array.isArray(schema.enum)) assert.ok(schema.enum.some((candidate) => stableJson(candidate) === stableJson(value)), `${label} enum mismatch.`);
  if (schema.type === "object") {
    assert.ok(value !== null && typeof value === "object" && !Array.isArray(value), `${label} must be an object.`);
    const object = value as JsonObject;
    const properties = (schema.properties ?? {}) as Record<string, unknown>;
    const required = (schema.required ?? []) as string[];
    assert.ok(Array.isArray(required) && required.every((key) => typeof key === "string"), `${label} required keys are invalid.`);
    for (const key of required) assert.ok(Object.hasOwn(object, key), `${label} missing required field: ${key}`);
    if (schema.additionalProperties === false) assert.deepEqual(Object.keys(object).sort(), Object.keys(properties).filter((key) => Object.hasOwn(object, key)).sort(), `${label} has unknown fields.`);
    for (const [key, childSchema] of Object.entries(properties)) if (Object.hasOwn(object, key)) validateJsonSchema(object[key], childSchema, `${label}.${key}`);
  } else if (schema.type === "array") {
    assert.ok(Array.isArray(value), `${label} must be an array.`);
    if (schema.minItems !== undefined) assert.ok(value.length >= Number(schema.minItems), `${label} has too few items.`);
    if (schema.maxItems !== undefined) assert.ok(value.length <= Number(schema.maxItems), `${label} has too many items.`);
    if (schema.items !== undefined) value.forEach((entry, index) => validateJsonSchema(entry, schema.items, `${label}[${index}]`));
  } else if (schema.type === "string") {
    assert.ok(typeof value === "string", `${label} must be a string.`);
    if (schema.minLength !== undefined) assert.ok((value as string).length >= Number(schema.minLength), `${label} is too short.`);
  } else if (schema.type === "integer") {
    assert.ok(Number.isSafeInteger(value), `${label} must be an integer.`);
    if (schema.minimum !== undefined) assert.ok(Number(value) >= Number(schema.minimum), `${label} is below minimum.`);
  }
  if (schema.pattern !== undefined) {
    assert.ok(typeof value === "string", `${label} pattern requires a string.`);
    assert.match(value as string, new RegExp(String(schema.pattern)), `${label} pattern mismatch.`);
  }
};

export const repositoryPath = (root: string, path: string, label = "Path") => {
  assert.ok(path.length > 0 && !path.includes("\0"), `${label} is invalid.`);
  const absolute = resolve(root, path);
  const local = relative(root, absolute);
  assert.ok(local !== ".." && !local.startsWith(`..${sep}`), `${label} escapes the repository.`);
  return absolute;
};

export const rejectSymlinkComponents = (root: string, path: string) => {
  const absolute = repositoryPath(root, path);
  let current = root;
  for (const part of relative(root, absolute).split(sep).filter(Boolean)) {
    current = resolve(current, part);
    if (existsSync(current)) assert.ok(!lstatSync(current).isSymbolicLink(), `Symlink path rejected: ${relative(root, current)}`);
  }
};

export const readJson = (root: string, path: string): unknown =>
  JSON.parse(readFileSync(repositoryPath(root, path), "utf8"));

export const bindFile = (root: string, path: string): FileBinding => {
  rejectSymlinkComponents(root, path);
  const bytes = readFileSync(repositoryPath(root, path));
  return {path, sha256: sha256Bytes(bytes), byteLength: bytes.byteLength};
};

export const validateRunBaselinePolicy = ({
  head,
  requestedBase,
  changedPaths,
}: {
  head: string;
  requestedBase?: string;
  changedPaths: readonly string[];
}) => {
  assert.match(head, /^[0-9a-f]{40}$/, "HEAD must be a full commit SHA.");
  if (requestedBase !== undefined) assert.equal(requestedBase, head, "Requested run base must equal current HEAD.");
  const changed = [...changedPaths].sort();
  if (head === PHASE15_PROOF_BASE && JSON.stringify(changed) === JSON.stringify(PHASE15_AUTHORIZED_PATHS)) {
    return {mode: "phase-1.5-bootstrap" as const, baselineCommit: head, allowedPaths: changed};
  }
  assert.deepEqual(changed, [], "Reusable browser proof requires a clean integrated worktree; versioned extensions must define their own exact allowlist.");
  return {mode: "integrated-current-head" as const, baselineCommit: head, allowedPaths: [] as string[]};
};

export const validateBrowserPlan = (value: unknown) => {
  const plan = strictObject(value, [
    "acceptedConsoleWarningPatterns", "actions", "browserGuardChecks", "driverContextTemplates", "driverOperations",
    "drawingRequestCount", "drawingViewportMode", "fixedPrompt", "forbiddenUrls", "phase", "planVersion", "productionMarkers", "productionScreenshotIds",
    "request", "screenshotTemplates", "serverGuardChecks", "settledAbsentText", "settledSuccessText", "specId", "viewports",
  ], "Browser plan");
  assert.equal(plan.planVersion, 1);
  assert.equal(plan.specId, SPEC_ID);
  assert.equal(plan.phase, PHASE);
  assert.equal(plan.fixedPrompt, FIXED_DRAWING_PROMPT);
  assert.deepEqual(plan.viewports, VIEWPORTS);
  assert.deepEqual(plan.driverOperations, DRIVER_OPERATIONS);
  assert.deepEqual(plan.driverContextTemplates, ["stick-{viewport}"]);
  assert.deepEqual(plan.forbiddenUrls, FORBIDDEN_URLS);
  assert.deepEqual(plan.productionMarkers, PRODUCTION_MARKERS);
  assert.deepEqual(plan.serverGuardChecks, SERVER_GUARD_CHECKS);
  assert.deepEqual(plan.browserGuardChecks, ["fetch", "websocket"]);
  assert.deepEqual(plan.acceptedConsoleWarningPatterns, ACCEPTED_CONSOLE_WARNING_PATTERNS);
  assert.equal(plan.drawingRequestCount, 1);
  assert.equal(plan.drawingViewportMode, "one-context-resize");
  assert.deepEqual(plan.settledAbsentText, SETTLED_ABSENT_TEXT);
  assert.equal(plan.settledSuccessText, "Frame generated locally.");
  assert.deepEqual(plan.screenshotTemplates, SCREENSHOT_TEMPLATES);
  assert.deepEqual(plan.productionScreenshotIds, PRODUCTION_SCREENSHOTS);
  assert.ok(Array.isArray(plan.actions));
  const actions = plan.actions.map((value, index) => {
    const action = strictObject(value, ["id", "kind", "scope", "target"], `Browser plan action ${index}`);
    return [action.id, action.kind, action.target, action.scope];
  });
  assert.deepEqual(actions, ACTIONS);
  const request = strictObject(plan.request, ["method", "path", "requestBodySha256", "responseBodySha256"], "Browser plan request");
  assert.deepEqual(request, {
    method: "POST", path: "/api/ai",
    requestBodySha256: "sha256:8775678a977ed294b7e8d0a54dd45a25a6efab8106220657fd47558dd2bd96f2",
    responseBodySha256: "sha256:be9309952b4adc14ac89abab00b084e72aa5bb228ab7eb9512b22c2b8f2c9817",
  });
  return plan as JsonObject & {
    actions: Array<{id: string; kind: string; target: string}>;
    forbiddenUrls: string[];
    productionMarkers: string[];
    settledAbsentText: string[];
    settledSuccessText: string;
    request: {method: string; path: string; requestBodySha256: string; responseBodySha256: string};
  };
};

export const validateDriverEnvelope = (value: unknown) => {
  const envelope = strictObject(value, ["contractVersion", "operation", "payload"], "Driver envelope");
  assert.equal(envelope.contractVersion, 1, "Driver contract version mismatch.");
  assert.ok(DRIVER_OPERATIONS.includes(envelope.operation as DriverOperation), "Unregistered driver operation.");
  const payload = envelope.payload as unknown;
  if (envelope.operation === "tester.connection.ping/v1") {
    const ping = strictObject(payload, ["connected", "transport"], "Driver ping payload");
    assert.equal(ping.connected, true);
    assert.equal(ping.transport, "playwright-binding");
  } else {
    const checkpoint = strictObject(
      payload,
      ["activeLayerId", "authoredFrameCount", "currentFrameIndex", "jointCount", "limbCount", "selectedTimelineIndex"],
      "Stick checkpoint payload",
    );
    for (const key of ["authoredFrameCount", "currentFrameIndex", "jointCount", "limbCount", "selectedTimelineIndex"]) {
      assert.ok(Number.isSafeInteger(checkpoint[key]) && (checkpoint[key] as number) >= 0, `${key} must be a non-negative integer.`);
    }
    assert.equal(typeof checkpoint.activeLayerId, "string");
  }
  return envelope as {contractVersion: 1; operation: DriverOperation; payload: JsonObject};
};

export const assertExactBase = (value: unknown) => assert.equal(value, BASE_COMMIT, "Phase 1.5 base mismatch.");
