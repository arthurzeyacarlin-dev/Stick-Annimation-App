import assert from "node:assert/strict";
import {spawn, spawnSync, type ChildProcess} from "node:child_process";
import {createHash} from "node:crypto";
import {createServer} from "node:net";
import {
  appendFileSync,
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
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

type Operation = {id: string; viewport: string; action: string; target: string; passed: true; at: string};
type ScreenshotEvidence = FileBinding & {id: string; viewport: {width: number; height: number}};
type RunningServer = {child: ChildProcess; port: number; mode: "development" | "production"};
type RunPolicy = ReturnType<typeof validateRunBaselinePolicy>;

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

const now = () => new Date().toISOString();
const recordOperation = (id: string, viewport: string, action: string, target: string) =>
  operations.push({id, viewport, action, target, passed: true, at: now()});

const git = (...argv: string[]) => {
  const result = spawnSync("git", argv, {cwd: ROOT, encoding: "utf8", shell: false});
  assert.equal(result.status, 0, result.stderr || `git ${argv.join(" ")} failed`);
  return result.stdout.trim();
};

const externalFileEvidence = (path: string) => {
  const hash = spawnSync("shasum", ["-a", "256", path], {encoding: "utf8", shell: false});
  assert.equal(hash.status, 0, hash.stderr || `Unable to hash ${path}`);
  return {path, byteLength: statSync(path).size, sha256: `sha256:${hash.stdout.trim().split(/\s+/)[0]}`};
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
    const base = spawnSync("git", ["show", `${policy.baselineCommit}:${path}`], {cwd: ROOT, encoding: "buffer", shell: false, maxBuffer: 16 * 1024 * 1024});
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
  child.once("exit", (code, signal) => {
    if (activeServer?.child === child && code !== 0 && signal !== "SIGTERM") {
      appendJsonLine(CONSOLE_LEDGER, {source: "server", type: "unexpected-exit", code, signal});
    }
  });
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

const stopServer = async (server: RunningServer | null) => {
  if (!server || server.child.exitCode !== null || server.child.signalCode !== null) {
    if (activeServer === server) activeServer = null;
    if (server && ownedPorts.has(server.port)) await provePortReleased(server.port);
    return;
  }
  try { process.kill(-(server.child.pid ?? 0), "SIGTERM"); }
  catch { try { server.child.kill("SIGTERM"); } catch {} }
  await Promise.race([
    new Promise<void>((resolveExit) => server.child.once("exit", () => resolveExit())),
    new Promise<void>((resolveDelay) => setTimeout(resolveDelay, 8_000)),
  ]);
  if (server.child.exitCode === null && server.child.signalCode === null) {
    try { process.kill(-(server.child.pid ?? 0), "SIGKILL"); } catch { try { server.child.kill("SIGKILL"); } catch {} }
    await Promise.race([
      new Promise<void>((resolveExit) => server.child.once("exit", () => resolveExit())),
      new Promise<void>((_resolveDelay, rejectDelay) => setTimeout(() => rejectDelay(new Error(`Server ${server.port} did not exit after SIGKILL.`)), 5_000)),
    ]);
  }
  if (activeServer === server) activeServer = null;
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
    process.kill(-(server.child.pid ?? 0), "SIGKILL");
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

const scanProduction = () => {
  const files = listFiles(resolve(ROOT, NEXT_DIR)).filter((file) => !relative(ROOT, file).startsWith(`${NEXT_DIR}${sep}cache${sep}`));
  const leaks: string[] = [];
  const inventory: JsonObject[] = [];
  for (const file of files) {
    const evidence = scanFileEvidence(file, PRODUCTION_MARKERS);
    if (evidence.leaked) leaks.push(evidence.path);
    inventory.push({path: evidence.path, byteLength: evidence.byteLength, sha256: evidence.sha256});
  }
  assert.deepEqual(leaks, [], `Tester leaked into production output: ${leaks.join(", ")}`);
  return {fileCount: files.length, scannedMarkers: [...PRODUCTION_MARKERS], excludedNonDeployableRoots: [".next/cache"], inventory, leaks};
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

const onSignal = (signal: NodeJS.Signals) => {
  void cleanup().finally(() => process.exit(signal === "SIGINT" ? 130 : 143));
};
process.once("SIGINT", () => onSignal("SIGINT"));
process.once("SIGTERM", () => onSignal("SIGTERM"));

main().catch(async (error) => {
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
});
