import assert from "node:assert/strict";
import {spawnSync} from "node:child_process";
import {existsSync, lstatSync, readFileSync, readdirSync} from "node:fs";
import {fileURLToPath} from "node:url";
import {relative, resolve, sep} from "node:path";
import {
  ACCEPTED_CONSOLE_WARNING_PATTERNS, ACTIONS, BASE_COMMIT, FIXTURE_ROOT, FORBIDDEN_URLS, OUTPUT_ROOT, PHASE, PHASE15_AUTHORIZED_PATHS,
  PRODUCTION_MARKERS, PRODUCTION_SCREENSHOTS, SCREENSHOT_TEMPLATES, SERVER_GUARD_CHECKS, SPEC_ID,
  VIEWPORTS, bindFile, readJson, repositoryPath, sha256Bytes, stableJson, strictObject, validateBrowserPlan, validateDriverEnvelope, validateJsonSchema,
  type FileBinding, type JsonObject,
} from "./browserTesterContract.ts";

const ROOT = process.cwd();
const BROWSER_ROOT = `${OUTPUT_ROOT}/browser`;

const validateBinding = (value: unknown, label: string): FileBinding => {
  const binding = strictObject(value, ["byteLength", "path", "sha256"], label) as FileBinding;
  assert.match(binding.sha256, /^sha256:[0-9a-f]{64}$/);
  const current = bindFile(ROOT, binding.path);
  assert.deepEqual(current, binding, `${label} binding mismatch.`);
  return binding;
};

const expectedOperations = () => {
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

const validateBrowserResult = (value: unknown, verifyBindings: boolean) => {
  validateJsonSchema(value, readJson(ROOT, `${FIXTURE_ROOT}/tester-result.schema.json`), "Browser result schema");
  const browser = strictObject(value, [
    "browserExecutable", "browserVersion", "cleanup", "console", "dependency", "drawingSettlements", "driverMessages", "failureDrill",
    "fontFixture", "fontRequests", "fontResponses", "headCommit", "historicalProofBase", "negativeCases", "negativeEvidence",
    "network", "operations", "phase", "plan", "productSource", "production", "recordedAt", "requestRecords",
    "resultVersion", "runBaseline", "screenshots", "source", "specId", "status",
  ], "Browser result");
  assert.equal(browser.resultVersion, 1);
  assert.equal(browser.specId, SPEC_ID);
  assert.equal(browser.phase, PHASE);
  assert.equal(browser.status, "passed");
  assert.equal(browser.historicalProofBase, BASE_COMMIT);
  assert.equal(browser.headCommit, BASE_COMMIT);
  assert.match(browser.recordedAt as string, /^\d{4}-\d{2}-\d{2}T/);

  const baseline = strictObject(browser.runBaseline, ["allowedPaths", "baselineCommit", "mode"], "Run baseline");
  assert.equal(baseline.mode, "phase-1.5-bootstrap");
  assert.equal(baseline.baselineCommit, BASE_COMMIT);
  assert.deepEqual(baseline.allowedPaths, PHASE15_AUTHORIZED_PATHS);
  const dependency = strictObject(browser.dependency, ["browserDownload", "name", "version"], "Dependency");
  assert.deepEqual(dependency, {name: "playwright-core", version: "1.62.1", browserDownload: false});
  const executable = strictObject(browser.browserExecutable, ["byteLength", "path", "sha256"], "Browser executable");
  assert.equal(executable.path, "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome");
  assert.match(executable.sha256 as string, /^sha256:[0-9a-f]{64}$/);
  assert.ok(Number(executable.byteLength) > 0);
  assert.equal(typeof browser.browserVersion, "string");

  if (verifyBindings) {
    validateBinding(browser.plan, "Plan binding");
    validateBinding(browser.fontFixture, "Font fixture binding");
    validateBinding(browser.negativeCases, "Negative fixture binding");
    validateBinding(browser.negativeEvidence, "Negative evidence binding");
  }
  const plan = validateBrowserPlan(readJson(ROOT, (browser.plan as FileBinding).path));
  assert.deepEqual(browser.fontRequests, [
    "https://fonts.googleapis.com/css2?family=Geist:wght@100..900&display=swap",
    "https://fonts.googleapis.com/css2?family=Geist+Mono:wght@100..900&display=swap",
  ]);
  assert.ok(Array.isArray(browser.fontResponses) && browser.fontResponses.length === 2);
  for (const [index, responseValue] of browser.fontResponses.entries()) {
    const response = strictObject(responseValue, ["cssSha256", "faces", "family", "url"], `Font response ${index}`);
    assert.equal(response.url, browser.fontRequests[index]);
    assert.match(response.cssSha256 as string, /^sha256:[0-9a-f]{64}$/);
    assert.ok(Array.isArray(response.faces) && response.faces.length === 3);
    if (verifyBindings) response.faces.forEach((face, faceIndex) => validateBinding(face, `Font response ${index} face ${faceIndex}`));
  }

  assert.ok(Array.isArray(browser.operations));
  const operations = browser.operations.map((value, index) => {
    const operation = strictObject(value, ["action", "at", "id", "passed", "target", "viewport"], `Operation ${index}`);
    assert.match(operation.at as string, /^\d{4}-\d{2}-\d{2}T/);
    return {id: operation.id, viewport: operation.viewport, action: operation.action, target: operation.target, passed: operation.passed};
  });
  assert.deepEqual(operations, expectedOperations());

  assert.ok(Array.isArray(browser.screenshots));
  const screenshotIds: string[] = [];
  for (const [index, screenshotValue] of browser.screenshots.entries()) {
    const screenshot = strictObject(screenshotValue, ["byteLength", "id", "path", "sha256", "viewport"], `Screenshot ${index}`);
    screenshotIds.push(screenshot.id as string);
    if (verifyBindings) validateBinding({byteLength: screenshot.byteLength, path: screenshot.path, sha256: screenshot.sha256}, `Screenshot ${index} file`);
  }
  assert.deepEqual(screenshotIds, expectedScreenshotIds());

  const expectedContexts = VIEWPORTS.map((viewport) => `stick-${viewport.width}x${viewport.height}`);
  assert.ok(Array.isArray(browser.driverMessages) && browser.driverMessages.length === expectedContexts.length * 2);
  browser.driverMessages.forEach((value, index) => {
    const message = strictObject(value, ["context", "envelope"], `Driver message ${index}`);
    assert.equal(message.context, expectedContexts[Math.floor(index / 2)]);
    const envelope = validateDriverEnvelope(message.envelope);
    assert.equal(envelope.operation, index % 2 === 0 ? "tester.connection.ping/v1" : "stick.phase2.checkpoint/v1");
    if (envelope.operation === "stick.phase2.checkpoint/v1") {
      assert.deepEqual(envelope.payload, {activeLayerId: "stick-layer-1", authoredFrameCount: 1, currentFrameIndex: 0, jointCount: 0, limbCount: 0, selectedTimelineIndex: 0});
    }
  });
  assert.deepEqual(browser.requestRecords, [plan.request]);
  assert.ok(Array.isArray(browser.drawingSettlements) && browser.drawingSettlements.length === VIEWPORTS.length);
  browser.drawingSettlements.forEach((value, index) => {
    const settlement = strictObject(value, ["absentStatusLabels", "appliedPixels", "beforePixels", "canvasStable", "inputUsable", "lateFailure", "settledPixels", "status", "submitUsableAfterProbe", "viewport"], `Drawing settlement ${index}`);
    assert.equal(settlement.viewport, `${VIEWPORTS[index].width}x${VIEWPORTS[index].height}`);
    assert.equal(settlement.status, "settled"); assert.equal(settlement.inputUsable, true); assert.equal(settlement.submitUsableAfterProbe, true);
    assert.equal(settlement.canvasStable, true); assert.equal(settlement.lateFailure, false); assert.deepEqual(settlement.absentStatusLabels, plan.settledAbsentText);
    for (const key of ["beforePixels", "appliedPixels", "settledPixels"] as const) strictObject(settlement[key], ["height", "opaquePixels", "redPixels", "width"], `Drawing settlement ${index} ${key}`);
    if (index === 0) assert.equal((settlement.beforePixels as JsonObject).redPixels, 0);
    else assert.ok(Number((settlement.beforePixels as JsonObject).redPixels) >= 100);
    assert.ok(Number((settlement.appliedPixels as JsonObject).redPixels) >= 100);
    assert.ok(Number((settlement.settledPixels as JsonObject).redPixels) >= 100);
  });

  const consoleEvidence = strictObject(browser.console, ["acceptedWarningPatterns", "errorCount", "records", "warningCount"], "Console evidence");
  assert.equal(consoleEvidence.errorCount, 0);
  assert.deepEqual(consoleEvidence.acceptedWarningPatterns, ACCEPTED_CONSOLE_WARNING_PATTERNS);
  assert.ok(Array.isArray(consoleEvidence.records));
  assert.equal(consoleEvidence.warningCount, consoleEvidence.records.length);
  for (const value of consoleEvidence.records) {
    const record = strictObject(value, ["at", "context", "message", "type"], "Accepted console warning");
    assert.equal(record.type, "warning");
    assert.ok(ACCEPTED_CONSOLE_WARNING_PATTERNS.some((pattern) => new RegExp(pattern).test(String(record.message))));
  }
  const network = strictObject(browser.network, ["browserLedger", "browserRequests", "expectedSelfTestConsole", "expectedSelfTestDenials", "guardChecks", "nonLoopbackAttempts", "policyViolations", "realApiRouteRequests", "serverLedger", "websocketCheck"], "Network evidence");
  assert.deepEqual((network.guardChecks as JsonObject[]).map((entry) => entry.name), SERVER_GUARD_CHECKS);
  assert.ok((network.guardChecks as JsonObject[]).every((entry) => entry.denied === true));
  assert.deepEqual(network.websocketCheck, {name: "browser-egress", denied: true, mechanisms: ["playwright.route", "playwright.routeWebSocket"], checks: ["fetch", "websocket"]});
  assert.equal(network.nonLoopbackAttempts, 0);
  assert.equal(network.realApiRouteRequests, 0);
  assert.deepEqual(network.policyViolations, []);
  assert.ok(Array.isArray(network.expectedSelfTestDenials) && network.expectedSelfTestDenials.length === 2);
  assert.ok(Array.isArray(network.expectedSelfTestConsole) && network.expectedSelfTestConsole.length === 1);
  assert.deepEqual(
    (network.expectedSelfTestConsole as JsonObject[]).map(({context, message, type}) => ({context, message, type})),
    [{context: "websocket-self-test", type: "error", message: "Failed to load resource: net::ERR_BLOCKED_BY_CLIENT.Inspector"}],
  );
  const browserDenials = (network.expectedSelfTestDenials as unknown[]).map((value, index) => strictObject(value, ["allowed", "at", "code", "host", "method", "path", "protocol", "selfTest"], `Browser denial ${index}`));
  assert.deepEqual(browserDenials.map((entry) => entry.method), ["GET", "WEBSOCKET"]);
  assert.ok(browserDenials.every((entry) => entry.allowed === false && entry.selfTest === true && entry.code === "SPEC0001_BROWSER_NETWORK_DENIED"));
  if (verifyBindings) {
    const consoleLines = readFileSync(resolve(ROOT, `${BROWSER_ROOT}/console.ndjson`), "utf8").trim().split("\n").filter(Boolean).map((line) => JSON.parse(line) as JsonObject);
    const selfTestConsole = consoleLines.filter((entry) => entry.expectedSelfTest === true).map((entry) => Object.fromEntries(Object.entries(entry).filter(([key]) => key !== "expectedSelfTest")));
    assert.deepEqual(selfTestConsole, network.expectedSelfTestConsole);
    assert.deepEqual(consoleLines.filter((entry) => entry.source === "server"), [{source: "server", type: "unexpected-exit", code: null, signal: "SIGKILL"}]);
    assert.deepEqual(consoleLines.filter((entry) => entry.expectedSelfTest !== true && entry.source !== "server"), consoleEvidence.records);
    validateBinding(network.serverLedger, "Server network ledger");
    validateBinding(network.browserLedger, "Browser network ledger");
    const browserLines = readFileSync(resolve(ROOT, (network.browserLedger as FileBinding).path), "utf8").trim().split("\n").filter(Boolean).map((line) => JSON.parse(line) as JsonObject);
    const denied = browserLines.filter((entry) => entry.allowed === false);
    assert.equal(denied.length, 2);
    assert.deepEqual(denied.map((entry) => entry.method), ["GET", "WEBSOCKET"]);
    assert.ok(denied.every((entry) => entry.selfTest === true));
    assert.ok(browserLines.every((entry) => entry.allowed !== false || entry.selfTest === true));
    const serverLines = readFileSync(resolve(ROOT, (network.serverLedger as FileBinding).path), "utf8").trim().split("\n").filter(Boolean).map((line) => JSON.parse(line) as JsonObject);
    const deniedPrimitives = new Set(serverLines.filter((entry) => entry.result === "denied").map((entry) => entry.primitive));
    for (const primitive of ["fetch", "http.request", "https.request", "net.connect", "tls.connect", "dns.promises.lookup", "child_process.spawn"]) assert.ok(deniedPrimitives.has(primitive));
    assert.doesNotMatch(readFileSync(resolve(ROOT, `${BROWSER_ROOT}/server.log`), "utf8"), /\bPOST \/api\/ai\b/);
  }

  const production = strictObject(browser.production, ["forbiddenUrlResults", "scan"], "Production evidence");
  assert.deepEqual(production.forbiddenUrlResults, FORBIDDEN_URLS.map((path) => ({path, status: 404})));
  const scan = strictObject(production.scan, ["excludedNonDeployableRoots", "fileCount", "inventory", "leaks", "scannedMarkers"], "Production scan");
  assert.deepEqual(scan.scannedMarkers, PRODUCTION_MARKERS);
  assert.deepEqual(scan.excludedNonDeployableRoots, [".next/cache"]);
  assert.deepEqual(scan.leaks, []);
  assert.ok(Array.isArray(scan.inventory) && scan.inventory.length === scan.fileCount && scan.inventory.length > 0);
  const productionPaths = new Set<string>();
  for (const [index, value] of scan.inventory.entries()) {
    const entry = strictObject(value, ["byteLength", "path", "sha256"], `Production inventory ${index}`);
    assert.match(entry.sha256 as string, /^sha256:[0-9a-f]{64}$/);
    assert.ok(Number(entry.byteLength) >= 0);
    assert.ok(!productionPaths.has(entry.path as string));
    productionPaths.add(entry.path as string);
  }

  const source = strictObject(browser.source, ["anchorPath", "instrumentationAttributableDiff", "preimageSha256", "replacementSha256", "restoredSha256"], "Source evidence");
  assert.equal(source.preimageSha256, source.restoredSha256);
  assert.notEqual(source.preimageSha256, source.replacementSha256);
  assert.equal(source.instrumentationAttributableDiff, 0);
  const productSource = strictObject(browser.productSource, ["changedPaths", "inventory", "layout", "stylesheetCount", "trackedFileCount"], "Product source evidence");
  assert.deepEqual(productSource.changedPaths, ["src/components/workspace/DrawingCanvas.tsx", "src/components/workspace/stickfigure/StickFigureWorkspace.tsx"]);
  assert.ok(Array.isArray(productSource.inventory) && productSource.inventory.length === productSource.trackedFileCount);
  assert.ok(Number(productSource.stylesheetCount) > 0);
  for (const value of productSource.inventory) {
    const entry = strictObject(value, ["baseSha256", "currentSha256", "path", "status"], "Product source entry");
    if (entry.path === "src/components/workspace/stickfigure/StickFigureWorkspace.tsx") assert.equal(entry.status, "authorized-anchor-only");
    else if (entry.path === "src/components/workspace/DrawingCanvas.tsx") {
      assert.equal(entry.status, "authorized-drawing-correction");
      assert.notEqual(entry.baseSha256, entry.currentSha256);
    }
    else { assert.equal(entry.status, "equal"); assert.equal(entry.baseSha256, entry.currentSha256); }
  }

  assert.deepEqual(browser.failureDrill, {injectedFailure: "observed", cleanup: "passed"});
  const negativeFixture = strictObject(readJson(ROOT, `${FIXTURE_ROOT}/phase-1.5-negative-cases.json`), ["cases", "fixtureVersion"], "Negative fixture");
  const negativeEvidence = strictObject(readJson(ROOT, (browser.negativeEvidence as FileBinding).path), ["fixture", "results"], "Negative evidence");
  if (verifyBindings) validateBinding(negativeEvidence.fixture, "Negative evidence fixture");
  assert.ok(Array.isArray(negativeEvidence.results));
  const expectedNegative = (negativeFixture.cases as JsonObject[]).map((entry) => ({name: entry.name, expectedCode: entry.expectedCode})).sort((left, right) => String(left.name).localeCompare(String(right.name)));
  const actualNegative = (negativeEvidence.results as JsonObject[]).map((entry) => {
    const result = strictObject(entry, ["expectedCode", "name", "status"], "Negative result");
    assert.equal(result.status, "passed");
    return {name: result.name, expectedCode: result.expectedCode};
  }).sort((left, right) => String(left.name).localeCompare(String(right.name)));
  assert.deepEqual(actualNegative, expectedNegative);
  const cleanup = strictObject(browser.cleanup, ["anchorRestored", "nextBuildPresent", "openBrowserContexts", "openServers", "residualPorts", "residualProfiles", "status", "temporaryFontSetupPresent"], "Cleanup evidence");
  assert.deepEqual(cleanup, {status: "passed", openBrowserContexts: 0, openServers: 0, residualProfiles: 0, residualPorts: 0, nextBuildPresent: false, temporaryFontSetupPresent: false, anchorRestored: true});
  return browser;
};

export const validateProof = (path: string) => {
  assert.equal(path, `${OUTPUT_ROOT}/proof-manifest.json`);
  const manifestValue = readJson(ROOT, path);
  validateJsonSchema(manifestValue, readJson(ROOT, `${FIXTURE_ROOT}/phase-1.5-proof-manifest.schema.json`), "Proof manifest schema");
  const manifest = strictObject(manifestValue, ["artifacts", "baseCommit", "browserEvidence", "commandConfig", "commandsPassed", "git", "headCommit", "lintBaseline", "manifestVersion", "phase", "receipts", "recordedAt", "runtime", "specId"], "Proof manifest");
  assert.equal(manifest.manifestVersion, 1);
  assert.equal(manifest.specId, SPEC_ID);
  assert.equal(manifest.phase, PHASE);
  assert.equal(manifest.baseCommit, BASE_COMMIT);
  assert.equal(manifest.headCommit, BASE_COMMIT);
  assert.equal(manifest.commandsPassed, true);
  assert.deepEqual(manifest.lintBaseline, {errors: 6, warnings: 73, phasePathFindings: 0});
  const runtime = strictObject(manifest.runtime, ["browserVersion", "nodeVersion", "npmVersion", "playwrightCoreVersion"], "Runtime");
  assert.equal(runtime.playwrightCoreVersion, "1.62.1");
  const gitState = strictObject(manifest.git, ["indexEmpty", "statusSha256"], "Git evidence");
  assert.equal(gitState.indexEmpty, true);
  assert.match(gitState.statusSha256 as string, /^sha256:[0-9a-f]{64}$/);
  validateBinding(manifest.commandConfig, "Command config binding");

  const expectedReceiptNames = ["phase-1.5-validator", "phase-1-contract-regression", "typescript", "lint-regression", "diff-check", "real-browser-proof", "status"];
  assert.ok(Array.isArray(manifest.receipts) && manifest.receipts.length === 7);
  manifest.receipts.forEach((value, index) => {
    const binding = validateBinding(value, `Receipt ${index}`);
    const receipt = strictObject(readJson(ROOT, binding.path), ["argv", "cwd", "durationMs", "env", "exitCode", "expectedExitCode", "lintBaseline", "name", "order", "passed", "privacy", "receiptVersion", "startedAt", "stderr", "stdout"], `Receipt ${index} value`);
    assert.equal(receipt.receiptVersion, 1); assert.equal(receipt.order, index); assert.equal(receipt.name, expectedReceiptNames[index]);
    assert.equal(receipt.passed, true); assert.equal(receipt.exitCode, index === 3 ? 1 : 0); assert.equal(receipt.expectedExitCode, index === 3 ? 1 : 0);
    for (const streamName of ["stdout", "stderr"] as const) {
      const stream = strictObject(receipt[streamName], ["byteLength", "data", "encoding", "sha256"], `Receipt ${index} ${streamName}`);
      assert.equal(stream.encoding, "base64");
      const bytes = Buffer.from(stream.data as string, "base64");
      assert.equal(bytes.byteLength, stream.byteLength); assert.equal(sha256Bytes(bytes), stream.sha256);
    }
  });

  const expectedBrowserFiles = [
    "browser-network.ndjson", "console.ndjson", "drawing-visible.txt",
    "negative-cases.json", "result.json", "server-network.ndjson", "server.log", "signal-sigint.json", "signal-sigterm.json",
    ...expectedScreenshotIds().map((id) => `screenshots/${id}.png`),
  ].map((path) => `${BROWSER_ROOT}/${path}`);
  const expectedArtifacts = [...PHASE15_AUTHORIZED_PATHS, ...expectedBrowserFiles].sort();
  assert.ok(Array.isArray(manifest.artifacts));
  const artifactPaths = manifest.artifacts.map((value) => validateBinding(value, "Artifact").path).sort();
  assert.deepEqual(artifactPaths, expectedArtifacts);
  assert.equal(artifactPaths.length, 49);
  assert.equal(new Set(artifactPaths).size, artifactPaths.length);

  const browserBinding = validateBinding(manifest.browserEvidence, "Browser evidence");
  const browserValue = readJson(ROOT, browserBinding.path);
  validateBrowserResult(browserValue, true);
  assert.ok(!existsSync(resolve(ROOT, ".next")));
  assert.ok(!existsSync(resolve(ROOT, `${BROWSER_ROOT}/temporary`)));
  const index = spawnSync("git", ["diff", "--cached", "--name-only"], {cwd: ROOT, encoding: "utf8"});
  assert.equal(index.status, 0); assert.equal(index.stdout.trim(), "");

  const missing = structuredClone(browserValue) as JsonObject; delete missing.cleanup;
  assert.throws(() => validateBrowserResult(missing, false));
  const extra = structuredClone(browserValue) as JsonObject; extra.unexpected = true;
  assert.throws(() => validateBrowserResult(extra, false));
  const tampered = structuredClone(browserValue) as {status: string}; tampered.status = "failed";
  assert.throws(() => validateBrowserResult(tampered, false));
  const duplicateRequest = structuredClone(browserValue) as {requestRecords: JsonObject[]}; duplicateRequest.requestRecords.push(duplicateRequest.requestRecords[0]);
  assert.throws(() => validateBrowserResult(duplicateRequest, false));
  const operation = structuredClone(browserValue) as {operations: Array<JsonObject>}; operation.operations[0].id = "tampered";
  assert.throws(() => validateBrowserResult(operation, false));
  const manifestTamper = structuredClone(manifest) as {browserEvidence: FileBinding}; manifestTamper.browserEvidence.sha256 = `sha256:${"0".repeat(64)}`;
  assert.throws(() => validateBinding(manifestTamper.browserEvidence, "Tampered browser binding"));
  return manifest;
};

export const PHASE15_CLOSEOUT_BASE = "3768226fd3aa3668a6cf7260da8476ceea0a084e" as const;
export const PHASE15_CLOSEOUT_BRANCH = "codex/spec-0001-phase-1.5-closeout" as const;
const CLOSEOUT_OUTPUT = `${OUTPUT_ROOT}/proof-closeout-manifest.json`;
const D0012_BASELINE_PATHS = [
  "docs/CURRENT_STATE.md",
  "docs/DECISIONS.md",
  "docs/SESSION_HANDOFF.md",
  "docs/TODO.md",
  "docs/changelog.md",
  "docs/specs/0001-first-reversible-ai-stick-animation.md",
  "docs/specs/README.md",
].sort();
const CLOSEOUT_CONTROL_PLANE_PATHS = [
  "docs/CURRENT_STATE.md",
  "docs/SESSION_HANDOFF.md",
  "docs/TODO.md",
  "docs/changelog.md",
  "docs/specs/0001-first-reversible-ai-stick-animation.md",
  "docs/specs/README.md",
  "docs/testing_workflow.md",
  "project/project_structure.txt",
].sort();
const PHASE15_EXISTING_PATHS = new Set([
  "package-lock.json",
  "package.json",
  "src/components/workspace/DrawingCanvas.tsx",
  "src/components/workspace/stickfigure/StickFigureWorkspace.tsx",
]);
const EXPECTED_DIRTY_ENTRIES = [
  ...PHASE15_AUTHORIZED_PATHS.map((path) => ({path, status: PHASE15_EXISTING_PATHS.has(path) ? " M" as const : "??" as const})),
  ...CLOSEOUT_CONTROL_PLANE_PATHS.map((path) => ({path, status: " M" as const})),
].sort((left, right) => left.path < right.path ? -1 : left.path > right.path ? 1 : 0);

type CloseoutStatus = "  " | " M" | "??";
type CloseoutFile = FileBinding & {status: CloseoutStatus};
type CloseoutGitPoint = {
  branch: string;
  headCommit: string;
  indexEmpty: boolean;
  localMainCommit: string;
  originMainCommit: string;
  porcelainSha256: string;
};
type CloseoutSnapshot = {
  ancestry: {changedPaths: string[]; commitCount: number; from: string; isAncestor: boolean; to: string};
  closeoutOutputExcluded: boolean;
  dirtyEntries: Array<{path: string; status: string}>;
  expectedIgnoredPaths: string[];
  git: CloseoutGitPoint;
  ignoredFiles: FileBinding[];
  implementationFiles: FileBinding[];
  proofImplementationFiles: FileBinding[];
  trackedState: CloseoutFile[];
};
type CloseoutPolicy = {
  acceptedProofSha256: string;
  actualProofSha256: string;
  baseCommit: string;
  first: CloseoutSnapshot;
  historicalBaseCommit: string;
  historicalHeadCommit: string;
  outputPath: string;
  second: CloseoutSnapshot;
};

const gitResult = (argv: string[]) => spawnSync("git", argv, {cwd: ROOT, encoding: "utf8", shell: false});
const gitOutput = (...argv: string[]) => {
  const result = gitResult(argv);
  assert.equal(result.status, 0, result.stderr || `git ${argv.join(" ")} failed`);
  return result.stdout;
};
const nulList = (value: string) => value.split("\0").filter(Boolean);
const normalizePath = (path: string) => path.split(sep).join("/");

const parseDirtyEntries = (porcelain: string) => nulList(porcelain).map((entry, index) => {
  assert.ok(entry.length >= 4 && entry[2] === " ", `Malformed porcelain entry ${index}.`);
  const status = entry.slice(0, 2);
  const path = entry.slice(3);
  assert.ok(status === " M" || status === "??", `Staged, deleted, renamed, or unsupported status rejected for ${path}: ${status}`);
  assert.ok(path.length > 0 && !path.includes("\n") && !path.includes("\r"), `Invalid porcelain path: ${path}`);
  return {path, status};
}).sort((left, right) => left.path < right.path ? -1 : left.path > right.path ? 1 : 0);

const listFiles = (rootPath: string): string[] => {
  const absolute = repositoryPath(ROOT, rootPath);
  assert.ok(existsSync(absolute), `Required artifact root is missing: ${rootPath}`);
  assert.ok(!lstatSync(absolute).isSymbolicLink() && lstatSync(absolute).isDirectory(), `Artifact root must be a real directory: ${rootPath}`);
  return readdirSync(absolute, {withFileTypes: true}).flatMap((entry) => {
    const child = resolve(absolute, entry.name);
    const path = normalizePath(relative(ROOT, child));
    assert.ok(!entry.isSymbolicLink(), `Symlink artifact rejected: ${path}`);
    if (entry.isDirectory()) return listFiles(path);
    assert.ok(entry.isFile(), `Unsupported artifact type: ${path}`);
    return [path];
  });
};

const structuralBinding = (value: unknown, label: string) => {
  const binding = strictObject(value, ["byteLength", "path", "sha256"], label);
  assert.equal(typeof binding.path, "string");
  assert.match(binding.sha256 as string, /^sha256:[0-9a-f]{64}$/);
  assert.ok(Number.isSafeInteger(binding.byteLength) && Number(binding.byteLength) >= 0);
  return binding as FileBinding;
};

const gitPoint = (porcelain: string): CloseoutGitPoint => ({
  branch: gitOutput("symbolic-ref", "--short", "HEAD").trim(),
  headCommit: gitOutput("rev-parse", "HEAD").trim(),
  indexEmpty: gitOutput("diff", "--cached", "--name-only", "-z") === "",
  localMainCommit: gitOutput("rev-parse", "refs/heads/main").trim(),
  originMainCommit: gitOutput("rev-parse", "refs/remotes/origin/main").trim(),
  porcelainSha256: sha256Bytes(porcelain),
});

const collectCloseoutSnapshot = ({
  allowExistingOutput,
  manifest,
  outputPath,
  proofPath,
}: {
  allowExistingOutput: boolean;
  manifest: JsonObject;
  outputPath: string;
  proofPath: string;
}): CloseoutSnapshot => {
  const porcelain = gitOutput("status", "--porcelain=v1", "-z", "--untracked-files=all");
  const dirtyEntries = parseDirtyEntries(porcelain);
  const git = gitPoint(porcelain);
  const ancestor = gitResult(["merge-base", "--is-ancestor", BASE_COMMIT, PHASE15_CLOSEOUT_BASE]);
  assert.ok(ancestor.status === 0 || ancestor.status === 1, ancestor.stderr || "Unable to check Phase 1.5 closeout ancestry.");
  const ancestry = {
    changedPaths: nulList(gitOutput("diff", "--name-only", "-z", BASE_COMMIT, PHASE15_CLOSEOUT_BASE)).sort(),
    commitCount: Number(gitOutput("rev-list", "--count", `${BASE_COMMIT}..${PHASE15_CLOSEOUT_BASE}`).trim()),
    from: BASE_COMMIT,
    isAncestor: ancestor.status === 0,
    to: PHASE15_CLOSEOUT_BASE,
  };

  const statusByPath = new Map(dirtyEntries.map((entry) => [entry.path, entry.status]));
  const trackedPaths = nulList(gitOutput("ls-files", "-z"));
  const untrackedPaths = dirtyEntries.filter((entry) => entry.status === "??").map((entry) => entry.path);
  const repositoryPaths = [...new Set([...trackedPaths, ...untrackedPaths])].sort();
  const trackedState = repositoryPaths.map((path): CloseoutFile => ({
    ...bindFile(ROOT, path),
    status: (statusByPath.get(path) ?? "  ") as CloseoutStatus,
  }));

  assert.ok(Array.isArray(manifest.artifacts));
  const artifactBindings = (manifest.artifacts as unknown[]).map((value, index) => structuralBinding(value, `Proof artifact ${index}`));
  const artifactByPath = new Map(artifactBindings.map((binding) => [binding.path, binding]));
  const implementationFiles = PHASE15_AUTHORIZED_PATHS.map((path) => bindFile(ROOT, path));
  const proofImplementationFiles = PHASE15_AUTHORIZED_PATHS.map((path) => {
    const binding = artifactByPath.get(path);
    assert.ok(binding, `Technical proof omits accepted implementation path: ${path}`);
    return binding;
  });

  assert.ok(Array.isArray(manifest.receipts));
  const receiptBindings = (manifest.receipts as unknown[]).map((value, index) => structuralBinding(value, `Proof receipt ${index}`));
  const expectedIgnoredPaths = [...new Set([
    proofPath,
    ...artifactBindings.filter((binding) => binding.path.startsWith(`${OUTPUT_ROOT}/`)).map((binding) => binding.path),
    ...receiptBindings.map((binding) => binding.path),
  ])].sort();
  assert.ok(!expectedIgnoredPaths.includes(outputPath), "Closeout output cannot be referenced by the technical proof.");
  const actualOutputPaths = listFiles(OUTPUT_ROOT).sort();
  const allowedOutputPaths = allowExistingOutput ? [...expectedIgnoredPaths, outputPath].sort() : expectedIgnoredPaths;
  assert.deepEqual(actualOutputPaths, allowedOutputPaths, "Ignored Phase 1.5 proof artifacts must be exact.");
  assert.equal(existsSync(repositoryPath(ROOT, outputPath)), allowExistingOutput, "Closeout output collision/state mismatch.");
  const ignoredFiles = expectedIgnoredPaths.map((path) => bindFile(ROOT, path));

  return {
    ancestry,
    closeoutOutputExcluded: !ignoredFiles.some((binding) => binding.path === outputPath),
    dirtyEntries,
    expectedIgnoredPaths,
    git,
    ignoredFiles,
    implementationFiles,
    proofImplementationFiles,
    trackedState,
  };
};

export const assertPhase15CloseoutPolicy = (policy: CloseoutPolicy) => {
  assert.equal(policy.historicalBaseCommit, BASE_COMMIT, "Historical proof base mismatch.");
  assert.equal(policy.historicalHeadCommit, BASE_COMMIT, "Historical proof HEAD mismatch.");
  assert.equal(policy.baseCommit, PHASE15_CLOSEOUT_BASE, "Closeout baseline mismatch.");
  assert.match(policy.acceptedProofSha256, /^sha256:[0-9a-f]{64}$/, "Accepted proof SHA-256 is malformed.");
  assert.equal(policy.actualProofSha256, policy.acceptedProofSha256, "Accepted proof SHA-256 does not match the actual proof bytes.");
  for (const [label, snapshot] of [["preflight", policy.first], ["prewrite", policy.second]] as const) {
    assert.equal(snapshot.git.branch, PHASE15_CLOSEOUT_BRANCH, `${label} closeout branch mismatch.`);
    assert.equal(snapshot.git.headCommit, PHASE15_CLOSEOUT_BASE, `${label} closeout HEAD mismatch.`);
    assert.equal(snapshot.git.localMainCommit, PHASE15_CLOSEOUT_BASE, `${label} local main mismatch.`);
    assert.equal(snapshot.git.originMainCommit, PHASE15_CLOSEOUT_BASE, `${label} origin/main mismatch.`);
    assert.equal(snapshot.git.indexEmpty, true, `${label} index must be empty.`);
    assert.equal(snapshot.ancestry.from, BASE_COMMIT);
    assert.equal(snapshot.ancestry.to, PHASE15_CLOSEOUT_BASE);
    assert.equal(snapshot.ancestry.isAncestor, true, `${label} historical proof base is not an ancestor of the closeout baseline.`);
    assert.equal(snapshot.ancestry.commitCount, 1, `${label} closeout baseline must be exactly one commit after the historical proof base.`);
    assert.deepEqual(snapshot.ancestry.changedPaths, D0012_BASELINE_PATHS, `${label} closeout baseline range is not the exact published D-0012 change.`);
    assert.deepEqual(snapshot.dirtyEntries, EXPECTED_DIRTY_ENTRIES, `${label} dirty-path/status allowlist mismatch.`);
    assert.deepEqual(snapshot.implementationFiles, snapshot.proofImplementationFiles, `${label} accepted implementation bytes differ from the technical proof.`);
    assert.deepEqual(snapshot.ignoredFiles.map((binding) => binding.path), snapshot.expectedIgnoredPaths, `${label} ignored proof inventory mismatch.`);
    assert.equal(snapshot.closeoutOutputExcluded, true, `${label} closeout output is self-referential.`);
    const trackedDirty = snapshot.trackedState.filter((entry) => entry.status !== "  ").map(({path, status}) => ({path, status}));
    assert.deepEqual(trackedDirty, EXPECTED_DIRTY_ENTRIES, `${label} tracked-state dirty inventory mismatch.`);
    assert.equal(new Set(snapshot.trackedState.map((entry) => entry.path)).size, snapshot.trackedState.length, `${label} tracked-state paths are not unique.`);
    snapshot.trackedState.forEach((entry, index) => structuralBinding(
      {byteLength: entry.byteLength, path: entry.path, sha256: entry.sha256},
      `${label} tracked-state binding ${index}`,
    ));
  }
  assert.equal(stableJson(policy.first), stableJson(policy.second), "Closeout Git/filesystem state changed between preflight and prewrite checks.");
};

const validateCloseoutShape = (value: unknown) => {
  validateJsonSchema(value, readJson(ROOT, `${FIXTURE_ROOT}/phase-1.5-closeout.schema.json`), "Closeout schema");
  const closeout = strictObject(value, ["baseCommit", "closeoutVersion", "indexEmpty", "phase", "proof", "specId", "status", "trackedState"], "Closeout");
  assert.equal(closeout.closeoutVersion, 1);
  assert.equal(closeout.specId, SPEC_ID);
  assert.equal(closeout.phase, PHASE);
  assert.equal(closeout.baseCommit, PHASE15_CLOSEOUT_BASE);
  assert.equal(closeout.indexEmpty, true);
  assert.equal(closeout.status, "validated");
  const proof = strictObject(closeout.proof, ["acceptedSha256", "artifacts", "closeoutGit", "historical", "implementation", "manifest"], "Closeout proof");
  assert.match(proof.acceptedSha256 as string, /^sha256:[0-9a-f]{64}$/);
  structuralBinding(proof.manifest, "Closeout proof manifest");
  const historical = strictObject(proof.historical, ["baseCommit", "headCommit"], "Closeout historical proof");
  assert.equal(historical.baseCommit, BASE_COMMIT);
  assert.equal(historical.headCommit, BASE_COMMIT);
  const closeoutGit = strictObject(proof.closeoutGit, ["ancestry", "baselineCommit", "preflight", "prewrite"], "Closeout Git evidence");
  assert.equal(closeoutGit.baselineCommit, PHASE15_CLOSEOUT_BASE);
  for (const key of ["preflight", "prewrite"] as const) {
    const point = strictObject(closeoutGit[key], ["branch", "headCommit", "indexEmpty", "localMainCommit", "originMainCommit", "porcelainSha256"], `Closeout ${key}`);
    assert.equal(point.indexEmpty, true);
    assert.match(point.porcelainSha256 as string, /^sha256:[0-9a-f]{64}$/);
  }
  const ancestry = strictObject(closeoutGit.ancestry, ["changedPaths", "commitCount", "from", "isAncestor", "to"], "Closeout ancestry");
  assert.equal(ancestry.isAncestor, true);
  assert.ok(Array.isArray(ancestry.changedPaths));
  const implementation = strictObject(proof.implementation, ["aggregateSha256", "controlPlanePaths", "files", "paths"], "Closeout implementation");
  assert.match(implementation.aggregateSha256 as string, /^sha256:[0-9a-f]{64}$/);
  assert.ok(Array.isArray(implementation.files));
  (implementation.files as unknown[]).forEach((entry, index) => structuralBinding(entry, `Closeout implementation binding ${index}`));
  const artifacts = strictObject(proof.artifacts, ["aggregateSha256", "closeoutOutputExcluded", "files", "root"], "Closeout artifacts");
  assert.equal(artifacts.closeoutOutputExcluded, true);
  assert.ok(Array.isArray(artifacts.files));
  (artifacts.files as unknown[]).forEach((entry, index) => structuralBinding(entry, `Closeout artifact binding ${index}`));
  assert.ok(Array.isArray(closeout.trackedState));
  (closeout.trackedState as unknown[]).forEach((value, index) => {
    const entry = strictObject(value, ["byteLength", "path", "sha256", "status"], `Closeout tracked state ${index}`);
    structuralBinding({byteLength: entry.byteLength, path: entry.path, sha256: entry.sha256}, `Closeout tracked binding ${index}`);
    assert.ok(["  ", " M", "??"].includes(entry.status as string));
  });
  return closeout;
};

export const buildPhase15Closeout = ({
  acceptedProofSha256,
  allowExistingOutput,
  baseCommit,
  outputPath,
  proofPath,
}: {
  acceptedProofSha256: string;
  allowExistingOutput: boolean;
  baseCommit: string;
  outputPath: string;
  proofPath: string;
}) => {
  assert.equal(baseCommit, PHASE15_CLOSEOUT_BASE, "Phase 1.5 closeout must use the approved D-0012 canonical baseline.");
  assert.equal(proofPath, `${OUTPUT_ROOT}/proof-manifest.json`);
  assert.equal(outputPath, CLOSEOUT_OUTPUT);
  assert.match(acceptedProofSha256, /^[0-9a-f]{64}$/, "--accepted-proof-sha256 must be 64 lowercase hexadecimal characters.");
  const proofBinding = bindFile(ROOT, proofPath);
  const acceptedSha256 = `sha256:${acceptedProofSha256}`;
  assert.equal(proofBinding.sha256, acceptedSha256, "Caller-supplied accepted proof SHA-256 does not match the actual proof bytes.");
  const manifest = validateProof(proofPath);
  const first = collectCloseoutSnapshot({allowExistingOutput, manifest, outputPath, proofPath});
  const second = collectCloseoutSnapshot({allowExistingOutput, manifest, outputPath, proofPath});
  assertPhase15CloseoutPolicy({
    acceptedProofSha256: acceptedSha256,
    actualProofSha256: proofBinding.sha256,
    baseCommit,
    first,
    historicalBaseCommit: manifest.baseCommit as string,
    historicalHeadCommit: manifest.headCommit as string,
    outputPath,
    second,
  });
  const closeout = {
    closeoutVersion: 1,
    specId: SPEC_ID,
    phase: PHASE,
    baseCommit: PHASE15_CLOSEOUT_BASE,
    proof: {
      acceptedSha256,
      manifest: proofBinding,
      historical: {baseCommit: manifest.baseCommit, headCommit: manifest.headCommit},
      closeoutGit: {
        baselineCommit: PHASE15_CLOSEOUT_BASE,
        preflight: first.git,
        prewrite: second.git,
        ancestry: second.ancestry,
      },
      implementation: {
        paths: [...PHASE15_AUTHORIZED_PATHS],
        controlPlanePaths: CLOSEOUT_CONTROL_PLANE_PATHS,
        files: second.implementationFiles,
        aggregateSha256: sha256Bytes(stableJson(second.implementationFiles)),
      },
      artifacts: {
        root: OUTPUT_ROOT,
        files: second.ignoredFiles,
        aggregateSha256: sha256Bytes(stableJson(second.ignoredFiles)),
        closeoutOutputExcluded: true,
      },
    },
    trackedState: second.trackedState,
    indexEmpty: true,
    status: "validated",
  };
  validateCloseoutShape(closeout);
  return closeout;
};

const runPhase15CloseoutSelfTests = () => {
  const fakeBinding = (path: string, digit = "1"): FileBinding => ({path, sha256: `sha256:${digit.repeat(64)}`, byteLength: 1});
  const implementationFiles = PHASE15_AUTHORIZED_PATHS.map((path) => fakeBinding(path));
  const ignoredFiles = [fakeBinding(`${OUTPUT_ROOT}/proof-manifest.json`), fakeBinding(`${OUTPUT_ROOT}/browser/result.json`)];
  const dirtyEntries = structuredClone(EXPECTED_DIRTY_ENTRIES) as Array<{path: string; status: string}>;
  const snapshot: CloseoutSnapshot = {
    ancestry: {changedPaths: D0012_BASELINE_PATHS, commitCount: 1, from: BASE_COMMIT, isAncestor: true, to: PHASE15_CLOSEOUT_BASE},
    closeoutOutputExcluded: true,
    dirtyEntries,
    expectedIgnoredPaths: ignoredFiles.map((binding) => binding.path),
    git: {
      branch: PHASE15_CLOSEOUT_BRANCH,
      headCommit: PHASE15_CLOSEOUT_BASE,
      indexEmpty: true,
      localMainCommit: PHASE15_CLOSEOUT_BASE,
      originMainCommit: PHASE15_CLOSEOUT_BASE,
      porcelainSha256: `sha256:${"2".repeat(64)}`,
    },
    ignoredFiles,
    implementationFiles,
    proofImplementationFiles: structuredClone(implementationFiles),
    trackedState: dirtyEntries.map((entry) => ({...fakeBinding(entry.path), status: entry.status as CloseoutStatus})),
  };
  const golden: CloseoutPolicy = {
    acceptedProofSha256: `sha256:${"3".repeat(64)}`,
    actualProofSha256: `sha256:${"3".repeat(64)}`,
    baseCommit: PHASE15_CLOSEOUT_BASE,
    first: snapshot,
    historicalBaseCommit: BASE_COMMIT,
    historicalHeadCommit: BASE_COMMIT,
    outputPath: CLOSEOUT_OUTPUT,
    second: structuredClone(snapshot),
  };
  assertPhase15CloseoutPolicy(golden);
  let rejected = 0;
  const expectRejected = (mutate: (candidate: CloseoutPolicy) => void) => {
    const candidate = structuredClone(golden);
    mutate(candidate);
    assert.throws(() => assertPhase15CloseoutPolicy(candidate));
    rejected += 1;
  };
  expectRejected((value) => { value.historicalBaseCommit = "b".repeat(40); });
  expectRejected((value) => { value.historicalHeadCommit = "b".repeat(40); });
  expectRejected((value) => { value.baseCommit = "b".repeat(40); });
  expectRejected((value) => { value.first.ancestry.isAncestor = false; value.second.ancestry.isAncestor = false; });
  expectRejected((value) => { value.actualProofSha256 = `sha256:${"4".repeat(64)}`; });
  expectRejected((value) => { value.first.implementationFiles[0].sha256 = `sha256:${"4".repeat(64)}`; value.second.implementationFiles[0].sha256 = `sha256:${"4".repeat(64)}`; });
  expectRejected((value) => { value.first.dirtyEntries.push({path: "unexpected.txt", status: "??"}); value.second.dirtyEntries.push({path: "unexpected.txt", status: "??"}); });
  expectRejected((value) => { value.first.dirtyEntries.pop(); value.second.dirtyEntries.pop(); });
  expectRejected((value) => { value.first.git.indexEmpty = false; value.second.git.indexEmpty = false; });
  expectRejected((value) => { value.first.git.localMainCommit = "b".repeat(40); value.second.git.localMainCommit = "b".repeat(40); });
  expectRejected((value) => { value.first.git.originMainCommit = "b".repeat(40); value.second.git.originMainCommit = "b".repeat(40); });
  expectRejected((value) => { value.second.git.porcelainSha256 = `sha256:${"4".repeat(64)}`; });
  expectRejected((value) => { value.first.ignoredFiles.push(fakeBinding(`${OUTPUT_ROOT}/unexpected.json`)); value.second.ignoredFiles.push(fakeBinding(`${OUTPUT_ROOT}/unexpected.json`)); });
  expectRejected((value) => { value.first.closeoutOutputExcluded = false; value.second.closeoutOutputExcluded = false; });
  expectRejected((value) => { value.first.trackedState[0].sha256 = `sha256:${"4".repeat(64)}`; });
  assert.equal(rejected, 15);
  return rejected;
};

export const validatePhase15Closeout = (path: string, acceptedProofSha256: string) => {
  assert.equal(path, CLOSEOUT_OUTPUT);
  const actual = validateCloseoutShape(readJson(ROOT, path));
  const expected = buildPhase15Closeout({
    acceptedProofSha256,
    allowExistingOutput: true,
    baseCommit: PHASE15_CLOSEOUT_BASE,
    outputPath: path,
    proofPath: `${OUTPUT_ROOT}/proof-manifest.json`,
  });
  assert.deepEqual(actual, expected, "Closeout manifest does not match independently reconstructed Git/filesystem evidence.");
  return actual;
};

const main = () => {
  if (process.argv.length === 3 && process.argv[2] === "--self-test-closeout") {
    const count = runPhase15CloseoutSelfTests();
    console.log(`SPEC-0001 Phase 1.5 closeout contract self-test PASS: exact positive case and ${count} fail-closed tamper cases.`);
    return;
  }
  const values = new Map<string, string>();
  for (const argument of process.argv.slice(2)) {
    const match = /^--(accepted-proof-sha256|manifest|closeout)=(.+)$/.exec(argument);
    assert.ok(match && !values.has(match[1]), `Unsupported argument: ${argument}`);
    values.set(match[1], match[2]);
  }
  if (values.has("manifest")) {
    assert.deepEqual([...values.keys()], ["manifest"], "Manifest validation accepts only --manifest.");
    validateProof(values.get("manifest")!);
    const closeoutCases = runPhase15CloseoutSelfTests();
    console.log(`SPEC-0001 Phase 1.5 proof manifest PASS: exact plan, one Drawing request across two viewports, operations, screenshots, driver envelopes, digests, ledgers, production inventory, 37 negative cases, cleanup, 49 artifacts, six evidence-tamper drills, and ${closeoutCases} closeout tamper drills independently validated.`);
    return;
  }
  assert.deepEqual([...values.keys()].sort(), ["accepted-proof-sha256", "closeout"], "Closeout validation requires exactly --closeout and --accepted-proof-sha256.");
  const closeout = validatePhase15Closeout(values.get("closeout")!, values.get("accepted-proof-sha256")!);
  const closeoutCases = runPhase15CloseoutSelfTests();
  console.log(`SPEC-0001 Phase 1.5 closeout manifest PASS: ${(closeout.trackedState as unknown[]).length} repository files and ${closeoutCases} fail-closed tamper cases independently validated.`);
};

if (resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) main();
