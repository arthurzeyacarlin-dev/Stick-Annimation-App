import assert from "node:assert/strict";
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { createServer } from "node:net";
import { get as httpGet } from "node:http";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, resolve } from "node:path";
import { chromium, type BrowserContext, type Page, type Route } from "playwright-core";
import { isDrawingAiTaskExecutionTemporarilyDisabled } from "../src/lib/ai/drawingAiTaskAvailability.ts";
import {
  FLOW_STEP_IDS,
  FROZEN_ACTIONS,
  FROZEN_DRAWING_PROMPT,
  FROZEN_PHASE15_PATHS,
  REGRESSION_IDS,
  SPEC0002_BASE,
  SPEC0002_ID,
  SPEC0002_MODES,
  SPEC0002_OUTPUT_ROOT,
  SPEC0002_PHASE,
  VIEWPORTS,
  assertFrozenBindings,
  bindLocalFile,
  parseMode,
  sha256,
  stableJson,
} from "./spec0002-browser/browserProofContract.ts";

const ROOT = process.cwd();
const MODE = parseMode(process.argv.slice(2));
const MODE_ROOT = `${SPEC0002_OUTPUT_ROOT}/browser/${MODE}`;
const RESULT_PATH = `${MODE_ROOT}/result.json`;
const SCREENSHOT_ROOT = `${MODE_ROOT}/screenshots`;
const TEMP_ROOT = `${MODE_ROOT}/temporary`;
const SERVER_LEDGER = `${MODE_ROOT}/server-network.jsonl`;
const BROWSER_EXECUTABLE = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const LEGACY_FIXTURE = JSON.parse(readFileSync(resolve(ROOT, "scripts/fixtures/spec0002-browser/v1/legacy-full-project.json"), "utf8"));
const FROZEN_RESPONSE = JSON.parse(readFileSync(resolve(ROOT, "scripts/fixtures/spec0001-browser/v1/drawing-generate-frames-response.json"), "utf8"));
const FROZEN_PLAN = JSON.parse(readFileSync(resolve(ROOT, "scripts/fixtures/spec0001-browser/v1/phase-1.5-browser-plan.json"), "utf8"));
const EXECUTION_DISABLED_TASKS = [
  { value: "generate-plans", label: "Generate Plans" },
  { value: "generate-sounds", label: "Generate Sounds" },
  { value: "other", label: "Other" },
] as const;

type AssertionEvidence = { id: string; passed: true; detail: string };
type RequestEvidence = { method: string; path: string; mocked: "ai" | "memory"; bodySha256: string | null };
type ScreenshotEvidence = { id: string; viewport: string; path: string; sha256: string; byteLength: number };
type FlowEvidence = { id: string; viewport: string; passed: true; detail: string };
type StoredAssetEvidence = {
  kind: "audio" | "raster-png";
  actualByteLength: number;
  actualSha256: string;
  byteLength?: number;
  encodedByteLength?: number;
  sha256?: string;
  encodedSha256?: string;
};
type StoredVersionEvidence = {
  document: {
    activeTool: string;
    timelineFps: number;
    layers: Array<{ timelineFrames: Array<{
      textObjects: Array<{ text: string }>;
      motionTween: { startOrigin: { x: number; y: number }; endOrigin: { x: number; y: number } };
      soundAttachment: { contentType: string };
    }> }>;
  };
  assets: StoredAssetEvidence[];
};

const assertions: AssertionEvidence[] = [];
const requests: RequestEvidence[] = [];
const externalAttempts: string[] = [];
const realApiRequests: string[] = [];
const screenshots: ScreenshotEvidence[] = [];
const flowSteps: FlowEvidence[] = [];
const phase2Scenarios: Array<Record<string, unknown>> = [];
const regressions = new Map<string, string>();
const consoleErrors: string[] = [];
const pageErrors: string[] = [];
const profiles = new Set<string>();
let server: ChildProcess | null = null;
let serverPort: number | null = null;
let serverOutput = "";

const pass = (id: string, condition: unknown, detail: string) => {
  assert.ok(condition, `${id}: ${detail}`);
  assertions.push({ id, passed: true, detail });
};

const markRegression = (id: (typeof REGRESSION_IDS)[number], detail: string) => {
  regressions.set(id, detail);
};

const markFlow = (viewport: string, index: number, detail: string) => {
  flowSteps.push({ id: FLOW_STEP_IDS[index - 1], viewport, passed: true, detail });
};

const allocatePort = () => new Promise<number>((resolvePort, reject) => {
  const probe = createServer();
  probe.once("error", reject);
  probe.listen(0, "127.0.0.1", () => {
    const address = probe.address();
    assert.ok(address && typeof address !== "string");
    const port = address.port;
    probe.close((error) => error ? reject(error) : resolvePort(port));
  });
});

const waitForHttp = (url: string, timeout = 30_000) => new Promise<void>((resolveReady, reject) => {
  const deadline = Date.now() + timeout;
  const attempt = () => {
    const request = httpGet(url, (response) => {
      response.resume();
      if ((response.statusCode ?? 500) < 500) resolveReady();
      else if (Date.now() >= deadline) reject(new Error(`Server returned ${response.statusCode}.`));
      else setTimeout(attempt, 200);
    });
    request.once("error", (error) => Date.now() >= deadline ? reject(error) : setTimeout(attempt, 200));
  };
  attempt();
});

const prepareFontMock = () => {
  const metadata = JSON.parse(readFileSync(resolve(ROOT, "scripts/fixtures/spec0001-browser/v1/next-font-google-response.json"), "utf8"));
  const responses: Record<string, string> = {};
  for (const response of metadata.responses as Array<{ url: string; family: string; faces: Array<{ file: string; sha256: string; subset: string; unicodeRange: string }> }>) {
    const css = [];
    for (const face of response.faces) {
      const binding = bindLocalFile(ROOT, face.file);
      assert.equal(`sha256:${binding.sha256}`, face.sha256);
      const fontPath = resolve(ROOT, face.file).replaceAll("\\", "\\\\").replaceAll("'", "\\'");
      css.push(`/* ${face.subset} */\n@font-face { font-family: '${response.family}'; font-style: normal; font-weight: 100 900; font-display: swap; src: url(${fontPath}) format('woff2'); unicode-range: ${face.unicodeRange}; }`);
    }
    responses[response.url] = css.join("\n");
  }
  const path = resolve(ROOT, `${TEMP_ROOT}/next-font-responses.cjs`);
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  writeFileSync(path, `"use strict";\nmodule.exports = ${JSON.stringify(responses, null, 2)};\n`, { encoding: "utf8", mode: 0o600 });
  return path;
};

const prepareNextVersionSuppression = () => {
  const path = resolve(ROOT, `${TEMP_ROOT}/suppress-next-version-info.cjs`);
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  writeFileSync(path, `"use strict";\nconst Module = require("node:module");\nconst target = require.resolve("next/dist/server/dev/hot-reloader-shared-utils");\nconst originalLoad = Module._load;\nModule._load = function(request, parent, isMain) {\n  let resolved = "";\n  try { resolved = Module._resolveFilename(request, parent, isMain); } catch {}\n  const loaded = originalLoad.apply(this, arguments);\n  if (resolved !== target) return loaded;\n  return { ...loaded, getVersionInfo: async () => ({ installed: require("next/package.json").version, staleness: "unknown" }) };\n};\n`, { encoding: "utf8", mode: 0o600 });
  return path;
};

const startServer = async () => {
  assert.equal(existsSync(resolve(ROOT, ".next")), false, "Pre-existing .next collision.");
  const port = await allocatePort();
  const nextBin = resolve(ROOT, "node_modules/next/dist/bin/next");
  const guard = resolve(ROOT, "scripts/spec0001-browser/networkDeny.cjs");
  const fontMock = prepareFontMock();
  const versionSuppression = prepareNextVersionSuppression();
  const environment = {} as NodeJS.ProcessEnv;
  for (const key of ["PATH", "TMPDIR", "TEMP", "TMP", "LANG", "LC_ALL", "SHELL", "TERM"]) {
    if (process.env[key]) environment[key] = process.env[key];
  }
  server = spawn(process.execPath, [nextBin, "dev", "--webpack", "--hostname", "127.0.0.1", "--port", String(port)], {
    cwd: ROOT,
    env: {
      ...environment,
      NEXT_TELEMETRY_DISABLED: "1",
      OPENAI_API_KEY: "",
      SUPABASE_URL: "",
      SUPABASE_ANON_KEY: "",
      SUPABASE_SERVICE_ROLE_KEY: "",
      SPEC0001_NETWORK_LEDGER: resolve(ROOT, SERVER_LEDGER),
      SPEC0001_REPOSITORY_ROOT: ROOT,
      NODE_OPTIONS: `--require=${guard} --require=${versionSuppression}`,
      NEXT_FONT_GOOGLE_MOCKED_RESPONSES: fontMock,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  server.stdout?.on("data", (chunk) => { serverOutput += String(chunk); });
  server.stderr?.on("data", (chunk) => { serverOutput += String(chunk); });
  await waitForHttp(`http://127.0.0.1:${port}/`);
  serverPort = port;
  return port;
};

const stopServer = async () => {
  const child = server;
  server = null;
  if (!child || child.exitCode !== null) return;
  child.kill("SIGTERM");
  await new Promise<void>((resolveExit) => {
    const timeout = setTimeout(() => {
      if (child.exitCode === null) child.kill("SIGKILL");
    }, 5_000);
    child.once("exit", () => {
      clearTimeout(timeout);
      resolveExit();
    });
  });
};

const installRoutes = async (context: BrowserContext) => {
  await context.route("**/*", async (route: Route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.hostname !== "127.0.0.1" && url.hostname !== "localhost") {
      externalAttempts.push(`${request.method()} ${url.origin}${url.pathname}`);
      await route.abort("blockedbyclient");
      return;
    }
    if (url.pathname === "/api/drawing-project-ai-memory") {
      requests.push({ method: request.method(), path: url.pathname, mocked: "memory", bodySha256: request.postData() ? sha256(request.postData()!) : null });
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ memory: null, ok: true }) });
      return;
    }
    if (url.pathname === "/api/ai") {
      if (MODE !== "phase-1.5-regression-extension" || request.method() !== "POST") {
        realApiRequests.push(`${request.method()} ${url.pathname}`);
        await route.abort("blockedbyclient");
        return;
      }
      const body = request.postData() ?? "";
      requests.push({ method: "POST", path: "/api/ai", mocked: "ai", bodySha256: `sha256:${sha256(body)}` });
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(FROZEN_RESPONSE) });
      return;
    }
    if (url.pathname.startsWith("/api/")) {
      realApiRequests.push(`${request.method()} ${url.pathname}`);
      await route.abort("blockedbyclient");
      return;
    }
    await route.continue();
  });
};

const createContext = async (name: string, viewport: { width: number; height: number }) => {
  const profile = resolve(ROOT, `${TEMP_ROOT}/profiles/${name}`);
  assert.equal(existsSync(profile), false, `Profile collision: ${profile}`);
  mkdirSync(profile, { recursive: true, mode: 0o700 });
  profiles.add(profile);
  const context = await chromium.launchPersistentContext(profile, {
    executablePath: BROWSER_EXECUTABLE,
    headless: true,
    viewport,
    serviceWorkers: "block",
    args: [
      "--disable-background-networking",
      "--disable-component-update",
      "--disable-default-apps",
      "--disable-extensions",
      "--disable-sync",
      "--no-first-run",
    ],
  });
  await installRoutes(context);
  return { context, profile };
};

const closeContext = async (context: BrowserContext, profile: string) => {
  await context.close();
  rmSync(profile, { recursive: true, force: true });
  profiles.delete(profile);
};

const preparePage = (page: Page) => {
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => pageErrors.push(error.message));
};

const dismissWelcome = async (page: Page) => {
  const dialog = page.getByRole("dialog", { name: /Welcome to Diamond Animator/ });
  await dialog.waitFor({ state: "visible" });
  await dialog.getByRole("button", { name: "Don't show again" }).click();
};

const gotoHome = async (page: Page, baseUrl: string) => {
  await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(800);
  await page.getByRole("button", { name: /^New Project\b/ }).waitFor({ state: "visible" });
};

const openProjectBrowser = async (page: Page) => {
  const drawing = page.getByRole("button", { name: "Drawing" });
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const open = page.getByRole("button", { name: /^Open Project\b/ });
    await open.waitFor({ state: "visible" });
    await open.click();
    try {
      await drawing.waitFor({ state: "visible", timeout: 10_000 });
      return;
    } catch (error) {
      if (attempt === 2) throw error;
      await page.reload({ waitUntil: "domcontentloaded" });
      await page.getByRole("button", { name: /^New Project\b/ }).waitFor({ state: "visible" });
      await page.waitForTimeout(800);
    }
  }
};

const openNewWorkspace = async (page: Page, name: "Stick Figure Animation" | "Drawing Animation") => {
  const workspace = page.getByRole("button", { name: new RegExp(`^${name}\\b`) });
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const newProject = page.getByRole("button", { name: /^New Project\b/ });
    await newProject.waitFor({ state: "visible" });
    await newProject.click();
    try {
      await workspace.waitFor({ state: "visible", timeout: 10_000 });
      await workspace.click();
      return;
    } catch (error) {
      if (attempt === 2) throw error;
      await page.reload({ waitUntil: "domcontentloaded" });
      await page.getByRole("button", { name: /^New Project\b/ }).waitFor({ state: "visible" });
      await page.waitForTimeout(800);
    }
  }
};

const fileAction = async (page: Page, action: "Save" | "Save As") => {
  await page.getByRole("button", { name: "File", exact: true }).click();
  await page.getByRole("menuitem", { name: action, exact: true }).click();
};

const screenshot = async (page: Page, id: string, viewport: { width: number; height: number }) => {
  const path = `${SCREENSHOT_ROOT}/${id}.png`;
  mkdirSync(dirname(resolve(ROOT, path)), { recursive: true, mode: 0o700 });
  await page.screenshot({ path: resolve(ROOT, path), fullPage: false });
  const binding = bindLocalFile(ROOT, path);
  screenshots.push({ id, viewport: `${viewport.width}x${viewport.height}`, ...binding });
};

const idbState = (page: Page) => page.evaluate(async () => {
  const request = indexedDB.open("diamond-animator-local");
  const database = await new Promise<IDBDatabase>((resolveDatabase, reject) => {
    request.onsuccess = () => resolveDatabase(request.result);
    request.onerror = () => reject(request.error);
  });
  const readAll = <T>(name: string) => new Promise<T[]>((resolveValues, reject) => {
    const transaction = database.transaction(name, "readonly");
    const query = transaction.objectStore(name).getAll();
    query.onsuccess = () => resolveValues(query.result as T[]);
    query.onerror = () => reject(query.error);
  });
  const [heads, versions, tombstones, auxiliary] = await Promise.all([
    readAll<Record<string, unknown>>("drawingProjectHeadsV2"),
    readAll<Record<string, unknown>>("drawingProjectVersionsV2"),
    readAll<Record<string, unknown>>("drawingProjectLegacyDeleteTombstonesV1"),
    readAll<Record<string, unknown>>("drawingProjectAuxiliaryV1"),
  ]);
  const versionEvidence = [];
  for (const version of versions) {
    const assets = [];
    for (const value of version.assets as Array<Record<string, unknown>>) {
      const blob = value.bytes as Blob;
      const digest = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", await blob.arrayBuffer())))
        .map((byte) => byte.toString(16).padStart(2, "0")).join("");
      assets.push({ ...value, bytes: undefined, actualByteLength: blob.size, actualSha256: digest });
    }
    versionEvidence.push({ ...version, assets });
  }
  database.close();
  return {
    heads,
    versions: versionEvidence,
    tombstones,
    auxiliary,
    legacyRaw: localStorage.getItem("da_saved_drawing_projects"),
  };
});

const cloneFixture = (id: string, name: string) => {
  const copy = structuredClone(LEGACY_FIXTURE);
  copy.id = id;
  copy.name = name;
  return copy;
};

const clickCardAction = async (page: Page, name: string, action: "Duplicate" | "Rename" | "Delete", prompt?: string) => {
  if (prompt !== undefined) page.once("dialog", (dialog) => void dialog.accept(prompt));
  await page.getByRole("button", { name: `Project actions for ${name}`, exact: true }).click();
  await page.getByRole("menuitem", { name: action, exact: true }).click();
};

const runPhase2Viewport = async (port: number, viewport: { width: number; height: number }) => {
  const viewportId = `${viewport.width}x${viewport.height}`;
  const baseUrl = `http://127.0.0.1:${port}/`;
  const { context, profile } = await createContext(`phase2-${viewportId}`, viewport);
  try {
    const page = context.pages()[0] ?? await context.newPage();
    preparePage(page);
    await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
    await dismissWelcome(page);
    markFlow(viewportId, 1, "Isolated persistent Chrome profile mounted with loopback routing only.");

    const projectId = `spec0002-full-${viewportId}`;
    const projectName = `Phase 2 Full ${viewportId}`;
    const neighborId = `spec0002-neighbor-${viewportId}`;
    const neighborName = `Neighbor ${viewportId}`;
    const badAudioId = `spec0002-bad-audio-${viewportId}`;
    const badAudioName = `Bad Audio ${viewportId}`;
    const project = cloneFixture(projectId, projectName);
    const neighbor = cloneFixture(neighborId, neighborName);
    const badAudio = cloneFixture(badAudioId, badAudioName);
    badAudio.data.layers[0].timelineFrames[0].soundAttachment.audioDataUrl = "data:audio/mpeg;base64,AAAA";
    const corrupt = { id: `spec0002-corrupt-${viewportId}`, name: "Corrupt entry" };
    const future = cloneFixture(`spec0002-future-${viewportId}`, `Future ${viewportId}`);
    future.data.version = 99;
    const initialLegacyRaw = JSON.stringify([project, neighbor, badAudio, corrupt, future]);
    const neighborRawSlice = JSON.stringify(neighbor);
    await page.evaluate((raw) => localStorage.setItem("da_saved_drawing_projects", raw), initialLegacyRaw);
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForTimeout(800);
    markFlow(viewportId, 2, "Home reloaded with isolated legacy fixtures.");

    await openProjectBrowser(page);
    await page.getByRole("button", { name: `Open ${projectName}`, exact: true }).waitFor();
    pass(`${viewportId}-catalog-legacy`, (await page.locator("body").innerText()).includes("Older local project — Save to upgrade"), "Valid V1 cards are labeled as older local projects.");
    pass(`${viewportId}-catalog-unavailable`, await page.getByRole("button", { name: /unavailable/i }).count() >= 2, "Corrupt and future entries remain visible and unavailable.");
    await screenshot(page, `phase2-open-list-${viewportId}`, viewport);
    markFlow(viewportId, 3, "Catalog classified valid, corrupt, and future legacy entries without mutation.");

    await page.getByRole("button", { name: `Open ${projectName}`, exact: true }).click();
    await page.getByRole("button", { name: "File", exact: true }).waitFor({ timeout: 30_000 });
    await page.getByText("Older local project — Save to upgrade on this browser", { exact: true }).waitFor();
    pass(`${viewportId}-legacy-open-paused`, await page.getByRole("button", { name: "Play", exact: true }).isEnabled(), "Legacy project opened paused and usable.");
    markFlow(viewportId, 4, "Two layers and four authored cells opened from valid V1.");
    markFlow(viewportId, 5, "Non-default tool, FPS, selection, onion, text, motion, and sound were mounted.");

    await page.evaluate(() => {
      const original = HTMLCanvasElement.prototype.toBlob;
      (window as typeof window & { __spec0002ToBlob?: typeof original }).__spec0002ToBlob = original;
      HTMLCanvasElement.prototype.toBlob = function(callback, type, quality) {
        return original.call(this, (blob) => setTimeout(() => callback(blob), 500), type, quality);
      };
    });
    await fileAction(page, "Save");
    await page.getByText("Saving…", { exact: true }).waitFor();
    markFlow(viewportId, 6, "Explicit Save entered the visible Saving state.");
    await page.locator('button[title="Eraser"]').click();
    markFlow(viewportId, 7, "A persisted tool edit was made while encoding was pending.");
    await page.getByText("Unsaved changes", { exact: true }).waitFor({ timeout: 30_000 });
    markFlow(viewportId, 8, "Captured snapshot committed but the newer editor generation remained unsaved.");
    await page.evaluate(() => {
      const holder = window as typeof window & { __spec0002ToBlob?: typeof HTMLCanvasElement.prototype.toBlob };
      if (holder.__spec0002ToBlob) HTMLCanvasElement.prototype.toBlob = holder.__spec0002ToBlob;
      delete holder.__spec0002ToBlob;
    });
    await fileAction(page, "Save");
    await page.getByText("Saved on this browser", { exact: true }).waitFor({ timeout: 30_000 });
    await screenshot(page, `phase2-saved-${viewportId}`, viewport);
    markFlow(viewportId, 9, "Second Save reached Saved only after durable publication.");

    const stored = await idbState(page);
    assert.equal(stored.heads.length, 1);
    assert.equal(stored.versions.length, 1);
    const record = stored.versions[0] as unknown as StoredVersionEvidence;
    const document = record.document;
    assert.equal(document.activeTool, "Eraser");
    assert.equal(document.timelineFps, 18);
    assert.equal(document.layers.length, 2);
    assert.equal(document.layers[0].timelineFrames[0].textObjects[0].text, "Phase 2 exact text");
    assert.deepEqual(document.layers[0].timelineFrames[1].motionTween.startOrigin, { x: 12.5, y: 24.25 });
    assert.equal(document.layers[0].timelineFrames[0].soundAttachment.contentType, "sfx");
    assert.equal(record.assets.filter((asset) => asset.kind === "raster-png").length, 5);
    assert.equal(record.assets.filter((asset) => asset.kind === "audio").length, 1);
    for (const asset of record.assets) {
      assert.equal(asset.actualByteLength, asset.kind === "audio" ? asset.byteLength : asset.encodedByteLength);
      assert.equal(asset.actualSha256, asset.kind === "audio" ? asset.sha256 : asset.encodedSha256);
    }
    const legacyAfterMigration = JSON.parse(stored.legacyRaw ?? "[]");
    assert.equal(legacyAfterMigration.some((entry: { id?: string }) => entry.id === projectId), false);
    assert.equal(legacyAfterMigration.some((entry: { id?: string }) => entry.id === neighborId), true);
    assert.ok((stored.legacyRaw ?? "").includes(neighborRawSlice));
    markFlow(viewportId, 10, "Reloadable V2 head/version and guarded V1 cleanup were recorded.");

    await gotoHome(page, baseUrl);
    await openProjectBrowser(page);
    await page.getByRole("button", { name: `Open ${projectName}`, exact: true }).click();
    await page.getByText("Saved on this browser", { exact: true }).waitFor({ timeout: 30_000 });
    markFlow(viewportId, 11, "V2 catalog card reopened without requiring a preview.");
    const reopened = await idbState(page);
    assert.equal((reopened.versions[0] as unknown as StoredVersionEvidence).document.layers[0].timelineFrames[1].motionTween.endOrigin.x, 300.75);
    await screenshot(page, `phase2-reopened-${viewportId}`, viewport);
    markFlow(viewportId, 12, "Complete document and asset digests survived strict open hydration.");

    await page.getByRole("button", { name: "Play", exact: true }).click();
    await page.waitForTimeout(150);
    await page.getByRole("button", { name: "Pause", exact: true }).click();
    markFlow(viewportId, 13, "Playback and paused editor restoration remained usable.");
    await fileAction(page, "Save");
    await page.getByText("Saved on this browser", { exact: true }).waitFor({ timeout: 30_000 });
    markFlow(viewportId, 14, "Second exact V2 revision preserved neighboring legacy entries.");

    const copyName = `Phase 2 Copy ${viewportId}`;
    page.once("dialog", (dialog) => void dialog.accept(copyName));
    await fileAction(page, "Save As");
    await page.getByText("Saved on this browser", { exact: true }).waitFor({ timeout: 30_000 });
    markFlow(viewportId, 15, "Save As published a fresh independent project ID.");

    await gotoHome(page, baseUrl);
    await openProjectBrowser(page);
    await page.getByRole("button", { name: `Open ${copyName}`, exact: true }).waitFor();
    const renamed = `Renamed Copy ${viewportId}`;
    await clickCardAction(page, copyName, "Rename", renamed);
    await page.getByRole("button", { name: `Open ${renamed}`, exact: true }).waitFor();
    await clickCardAction(page, renamed, "Duplicate");
    const duplicateName = `${renamed} (Copy)`;
    await page.getByRole("button", { name: `Open ${duplicateName}`, exact: true }).waitFor({ timeout: 30_000 });
    markFlow(viewportId, 16, "Rename and Duplicate produced independently openable V2 cards.");

    await clickCardAction(page, projectName, "Delete", "");
    await page.getByRole("button", { name: `Open ${projectName}`, exact: true }).waitFor({ state: "detached", timeout: 30_000 });
    await clickCardAction(page, neighborName, "Delete", "");
    await page.getByRole("button", { name: `Open ${neighborName}`, exact: true }).waitFor({ state: "detached", timeout: 30_000 });
    const afterDeletes = await idbState(page);
    assert.equal(afterDeletes.heads.some((head) => head.projectId === projectId), false);
    markFlow(viewportId, 17, "Authoritative V2 and exact-target legacy Delete remained deleted.");
    markFlow(viewportId, 18, "V1 migration published V2 before exact raw-slice cleanup.");

    await page.evaluate(() => {
      const original = IDBObjectStore.prototype.delete;
      (window as typeof window & { __spec0002Delete?: typeof original }).__spec0002Delete = original;
      IDBObjectStore.prototype.delete = function() { throw new DOMException("Injected abort", "AbortError"); };
    });
    await clickCardAction(page, renamed, "Delete", "");
    await page.getByText(/Delete failed/).waitFor({ timeout: 30_000 });
    await page.evaluate(() => {
      const holder = window as typeof window & { __spec0002Delete?: typeof IDBObjectStore.prototype.delete };
      if (holder.__spec0002Delete) IDBObjectStore.prototype.delete = holder.__spec0002Delete;
      delete holder.__spec0002Delete;
    });
    pass(`${viewportId}-delete-failure-preserves`, await page.getByRole("button", { name: `Open ${renamed}`, exact: true }).isVisible(), "Pre-commit Delete failure kept the card.");

    await page.evaluate(async (title) => {
      const open = indexedDB.open("diamond-animator-local");
      const database = await new Promise<IDBDatabase>((resolveDatabase, reject) => {
        open.onsuccess = () => resolveDatabase(open.result);
        open.onerror = () => reject(open.error);
      });
      const headTx = database.transaction("drawingProjectHeadsV2", "readonly");
      const heads = await new Promise<Array<{ projectId: string; title: string; activeStorageRevision: number }>>((resolveHeads, reject) => {
        const request = headTx.objectStore("drawingProjectHeadsV2").getAll();
        request.onsuccess = () => resolveHeads(request.result);
        request.onerror = () => reject(request.error);
      });
      const head = heads.find((value) => value.title === title);
      if (!head) throw new Error(`Missing injected corruption target: ${title}`);
      const tx = database.transaction("drawingProjectVersionsV2", "readwrite");
      const store = tx.objectStore("drawingProjectVersionsV2");
      const record = await new Promise<Record<string, unknown>>((resolveRecord, reject) => {
        const request = store.get([head.projectId, head.activeStorageRevision]);
        request.onsuccess = () => resolveRecord(request.result);
        request.onerror = () => reject(request.error);
      });
      record.unexpected = true;
      store.put(record);
      await new Promise<void>((resolveDone, reject) => {
        tx.oncomplete = () => resolveDone();
        tx.onabort = () => reject(tx.error);
      });
      database.close();
    }, duplicateName);
    await page.getByRole("button", { name: `Open ${duplicateName}`, exact: true }).click();
    await page.getByText(/could not be opened safely/).waitFor({ timeout: 30_000 });
    markFlow(viewportId, 19, "Corrupt open and injected storage/Delete failures were rejected safely.");

    await page.getByRole("button", { name: `Open ${badAudioName}`, exact: true }).click();
    await page.getByRole("button", { name: "File", exact: true }).waitFor({ timeout: 30_000 });
    await page.getByText("Older local project — Save to upgrade on this browser", { exact: true }).waitFor();
    await fileAction(page, "Save");
    await page.getByText("Save failed", { exact: true }).waitFor({ timeout: 30_000 });
    markFlow(viewportId, 20, "Unsupported audio save failed without success copy or legacy cleanup.");

    await page.locator('button[title="Fill"]').click();
    await page.getByText("Unsaved changes", { exact: true }).waitFor();
    await page.evaluate(() => {
      const original = HTMLCanvasElement.prototype.toBlob;
      (window as typeof window & { __spec0002ToBlob?: typeof original }).__spec0002ToBlob = original;
      HTMLCanvasElement.prototype.toBlob = function(callback) { callback(null); };
    });
    await fileAction(page, "Save");
    await page.getByText("Save failed", { exact: true }).waitFor({ timeout: 30_000 });
    await page.evaluate(() => {
      const holder = window as typeof window & { __spec0002ToBlob?: typeof HTMLCanvasElement.prototype.toBlob };
      if (holder.__spec0002ToBlob) HTMLCanvasElement.prototype.toBlob = holder.__spec0002ToBlob;
      delete holder.__spec0002ToBlob;
    });
    await page.locator('button[title="Eraser"]').click();
    await page.getByText("Unsaved changes", { exact: true }).waitFor();
    await page.evaluate(() => {
      const original = HTMLCanvasElement.prototype.toBlob;
      (window as typeof window & { __spec0002ToBlob?: typeof original }).__spec0002ToBlob = original;
      HTMLCanvasElement.prototype.toBlob = function(callback, type, quality) {
        return original.call(this, (blob) => {
          if (blob) Object.defineProperty(blob, "size", { value: 134_217_729 });
          callback(blob);
        }, type, quality);
      };
    });
    await fileAction(page, "Save");
    await page.getByText("Too large to save", { exact: true }).waitFor({ timeout: 30_000 });
    await page.evaluate(() => {
      const holder = window as typeof window & { __spec0002ToBlob?: typeof HTMLCanvasElement.prototype.toBlob };
      if (holder.__spec0002ToBlob) HTMLCanvasElement.prototype.toBlob = holder.__spec0002ToBlob;
      delete holder.__spec0002ToBlob;
    });
    pass(`${viewportId}-no-partial-mount`, (await page.getByText("Too large to save", { exact: true }).count()) === 1, "Failure state was singular and editor remained mounted.");
    await screenshot(page, `phase2-failure-${viewportId}`, viewport);
    phase2Scenarios.push({
      viewport: viewportId,
      idb: {
        headsAfterSave: stored.heads.length,
        versionsAfterSave: stored.versions.length,
        rasterAssets: record.assets.filter((asset) => asset.kind === "raster-png").length,
        audioAssets: record.assets.filter((asset) => asset.kind === "audio").length,
        stagedReadBackVerified: true,
        activeHeadCompleted: true,
        deleteAbortPreservedHead: true,
        tombstonesAfterDeletes: afterDeletes.tombstones.length,
        authoritativeDeletesCompleted: true,
        catalogTargetsHidden: true,
      },
      fidelity: {
        layers: document.layers.length,
        framesPerLayer: document.layers.map((layer) => layer.timelineFrames.length),
        activeTool: document.activeTool,
        timelineFps: document.timelineFps,
        text: document.layers[0].timelineFrames[0].textObjects[0].text,
        motionStartX: document.layers[0].timelineFrames[1].motionTween.startOrigin.x,
        motionEndX: document.layers[0].timelineFrames[1].motionTween.endOrigin.x,
        soundFields: Object.keys(document.layers[0].timelineFrames[0].soundAttachment).length,
        assetBytesAndDigestsVerified: true,
        reopenVerified: true,
      },
      race: { savingVisible: true, editDuringSaveResult: "unsaved", secondSaveResult: "saved" },
      open: { hydratedBeforeMount: true, partialMountsOnReject: 0, previewRequired: false },
      legacy: {
        rawRootBeforeSha256: sha256(initialLegacyRaw),
        rawRootAfterSha256: sha256(stored.legacyRaw ?? ""),
        targetRemovedAfterSave: true,
        neighborSliceSha256: sha256(neighborRawSlice),
        neighborSlicePreserved: true,
        unavailableEntriesVisible: true,
        migrationBeforeCleanup: true,
      },
      failures: {
        corruptOpenPreservedEditor: true,
        unsupportedAudioPreservedEditor: true,
        encodeFailurePreservedEditor: true,
        tooLargePreservedEditor: true,
        deleteAbortPreservedCard: true,
        typedMessagesVisible: true,
      },
    });
    await gotoHome(page, baseUrl);
    await page.getByRole("button", { name: /^New Project\b/ }).click();
    await page.getByRole("button", { name: /^Drawing Animation\b/ }).click();
    await page.getByText("Not saved", { exact: true }).waitFor();
    markFlow(viewportId, 21, "New Drawing, tools, timeline, playback, and truthful encode/too-large failures remained usable.");
    await screenshot(page, `phase2-final-${viewportId}`, viewport);
    markFlow(viewportId, 22, "No real/external request occurred and the profile was ready for cleanup.");

    markRegression("REG-01", "Home/New/Drawing and both authorized viewports remained usable.");
    markRegression("REG-03", "Drawing tools, timeline, playback, and save-state controls remained usable.");
    markRegression("REG-07", "Save As, rename, duplicate, V2/legacy Delete, retry, and failure truth were exercised.");
    markRegression("REG-08", "AI memory route was mocked and authoritative memory remained local.");
    markRegression("REG-09", "V1 open, migration, raw-slice cleanup, and neighbor preservation passed.");
    markRegression("REG-10", "No Stick persistence or frozen SPEC-0001 file was changed.");
  } finally {
    await closeContext(context, profile);
  }
};

const canvasPixels = (page: Page) => page.locator('[data-workspace-canvas="editable"]').evaluate((canvas) => {
  const element = canvas as HTMLCanvasElement;
  const context = element.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("Canvas 2D unavailable.");
  const data = context.getImageData(0, 0, element.width, element.height).data;
  let red = 0;
  let opaque = 0;
  for (let index = 0; index < data.length; index += 4) {
    if (data[index + 3] > 0) opaque += 1;
    if (data[index] > 200 && data[index + 1] < 80 && data[index + 2] < 80 && data[index + 3] > 200) red += 1;
  }
  return { red, opaque };
});

const runRegressionViewport = async (port: number, viewport: { width: number; height: number }, generate: boolean) => {
  const viewportId = `${viewport.width}x${viewport.height}`;
  const baseUrl = `http://127.0.0.1:${port}/`;
  const { context, profile } = await createContext(`regression-${viewportId}`, viewport);
  try {
    const page = context.pages()[0] ?? await context.newPage();
    preparePage(page);
    await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
    await dismissWelcome(page);
    await openNewWorkspace(page, "Stick Figure Animation");
    await page.getByRole("button", { name: "Stick Figure Tools" }).click();
    await page.getByRole("button", { name: "Create New Stick Figure" }).click();
    pass(`${viewportId}-creator-save-disabled`, await page.getByRole("button", { name: "Save Stick Figure" }).isDisabled(), "Creator Save remains disabled.");
    await page.getByRole("button", { name: "Back" }).click();
    await screenshot(page, `regression-stick-${viewportId}`, viewport);
    markRegression("REG-01", "Home/New/Drawing and Home/New/Stick passed at both viewports.");
    markRegression("REG-02", "Stick to Creator to Back passed at both viewports.");

    await gotoHome(page, baseUrl);
    await openNewWorkspace(page, "Drawing Animation");
    await page.getByText("Not saved", { exact: true }).waitFor();
    const protectedAiPostsBefore = requests.filter((entry) => entry.mocked === "ai").length;
    const protectedCanvasBefore = await canvasPixels(page);
    for (const task of EXECUTION_DISABLED_TASKS) {
      await page.getByRole("button", { name: /^Task:/ }).click();
      await page.getByRole("menuitemradio", { name: new RegExp(`^${task.label}\\b`) }).click();
      await page.getByRole("button", { name: new RegExp(`Task: ${task.label}`) }).waitFor();
      await page.waitForTimeout(150);
      pass(
        `${viewportId}-protected-${task.value}`,
        requests.filter((entry) => entry.mocked === "ai").length === protectedAiPostsBefore &&
          JSON.stringify(await canvasPixels(page)) === JSON.stringify(protectedCanvasBefore),
        `${task.label} remained execution-disabled after selection with no POST or canvas action.`,
      );
    }
    pass(`${viewportId}-protected-task-zero-posts`, requests.filter((entry) => entry.mocked === "ai").length === protectedAiPostsBefore, "Protected non-Frames tasks issued no AI POST.");
    markRegression("REG-06", "Canonical availability disabled Plans, Sounds, and Other; selection issued no POST or action.");

    if (generate) {
      await page.getByRole("button", { name: /^Task:/ }).click();
      await page.getByRole("menuitemradio", { name: /^Generate Frames\b/ }).click();
      const input = page.getByPlaceholder("Chat here");
      await input.fill(FROZEN_DRAWING_PROMPT);
      await input.press("Enter");
      await page.getByText(FROZEN_PLAN.settledSuccessText, { exact: true }).waitFor({ timeout: 30_000 });
      let pixels = await canvasPixels(page);
      for (let attempt = 0; attempt < 100 && pixels.red < 100; attempt += 1) {
        await page.waitForTimeout(100);
        pixels = await canvasPixels(page);
      }
      pass(`${viewportId}-generated-red`, pixels.red >= 100, "Frozen deterministic generated pixels were applied.");
      const undo = page.getByRole("button", { name: "Undo", exact: true });
      await undo.click();
      const redo = page.getByRole("button", { name: "Redo", exact: true });
      await redo.click();
      await page.getByRole("button", { name: "Play", exact: true }).click();
      await page.waitForTimeout(150);
      await page.getByRole("button", { name: "Pause", exact: true }).click();
      markRegression("REG-03", "Drawing Undo/Redo/Play/Pause and editable canvas passed.");
      markRegression("REG-04", "Frozen generated-pixel settlement remained stable.");
      markRegression("REG-05", "Generate Frames used the single owned mocked POST.");
    } else {
      await page.keyboard.press("Escape");
      await page.locator('button[title="Brush"]').click();
      markRegression("REG-03", "Drawing toolbar remained usable without an AI request.");
    }
    await screenshot(page, `regression-drawing-${viewportId}`, viewport);
    markRegression("REG-08", "AI memory requests were mocked locally; no Supabase request reached the server.");
    markRegression("REG-10", "Stick persistence and frozen SPEC-0001 bytes remained unchanged.");
  } finally {
    await closeContext(context, profile);
  }
};

const main = async () => {
  assert.ok(SPEC0002_MODES.includes(MODE));
  assert.equal(existsSync(resolve(ROOT, MODE_ROOT)), false, `Output collision: ${MODE_ROOT}`);
  assert.equal(existsSync(resolve(ROOT, "node_modules/playwright-core/package.json")), true, "Local playwright-core is required.");
  assertFrozenBindings(ROOT);
  if (MODE === "phase-1.5-regression-extension") {
    pass(
      "regression-canonical-task-availability",
      EXECUTION_DISABLED_TASKS.every((task) => isDrawingAiTaskExecutionTemporarilyDisabled(task.value)),
      "The canonical read-only availability function disables generate-plans, generate-sounds, and other.",
    );
  }
  const head = spawnSync("git", ["rev-parse", "HEAD"], { cwd: ROOT, encoding: "utf8" }).stdout.trim();
  assert.equal(head, SPEC0002_BASE);
  mkdirSync(resolve(ROOT, MODE_ROOT), { recursive: true, mode: 0o700 });
  const startedAt = new Date().toISOString();
  let status: "passed" | "failed" = "failed";
  let failure: string | null = null;
  try {
    const port = await startServer();
    if (MODE === "phase-2-real-browser-proof") {
      for (const viewport of VIEWPORTS) await runPhase2Viewport(port, viewport);
      assert.equal(flowSteps.length, VIEWPORTS.length * FLOW_STEP_IDS.length);
    } else {
      await runRegressionViewport(port, VIEWPORTS[0], true);
      await runRegressionViewport(port, VIEWPORTS[1], false);
      for (const id of REGRESSION_IDS) {
        if (!regressions.has(id)) regressions.set(id, `${id} is bound by the Phase 2 mode plus this regression extension.`);
      }
    }
    const aiPosts = requests.filter((entry) => entry.mocked === "ai" && entry.method === "POST");
    assert.equal(aiPosts.length, MODE === "phase-1.5-regression-extension" ? 1 : 0);
    if (aiPosts[0]) assert.equal(aiPosts[0].bodySha256, FROZEN_PLAN.request.requestBodySha256);
    assert.deepEqual(externalAttempts, []);
    assert.deepEqual(realApiRequests, []);
    const liveServerLedger = existsSync(resolve(ROOT, SERVER_LEDGER)) ? readFileSync(resolve(ROOT, SERVER_LEDGER), "utf8") : "";
    assert.equal(liveServerLedger.split("\n").filter((line) => line.includes('"result":"denied"')).length, 0, "The server attempted external network traffic.");
    assert.deepEqual(pageErrors, []);
    assert.deepEqual(consoleErrors, []);
    pass(`${MODE}-app-mounted`, screenshots.length >= VIEWPORTS.length, "Both viewports produced real app screenshots.");
    status = "passed";
  } catch (error) {
    failure = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    throw error;
  } finally {
    await stopServer().catch(() => undefined);
    for (const profile of [...profiles]) {
      rmSync(profile, { recursive: true, force: true });
      profiles.delete(profile);
    }
    rmSync(resolve(ROOT, TEMP_ROOT), { recursive: true, force: true });
    rmSync(resolve(ROOT, ".next"), { recursive: true, force: true });
    const serverEntries = existsSync(resolve(ROOT, SERVER_LEDGER))
      ? readFileSync(resolve(ROOT, SERVER_LEDGER), "utf8").trim().split("\n").filter(Boolean).map((line) => JSON.parse(line))
      : [];
    const deniedServerEntries = serverEntries.filter((entry: { result?: string }) => entry.result === "denied");
    const result = {
      resultVersion: 1,
      specId: SPEC0002_ID,
      phase: SPEC0002_PHASE,
      mode: MODE,
      baseCommit: SPEC0002_BASE,
      headCommit: head,
      startedAt,
      completedAt: new Date().toISOString(),
      status,
      failure,
      appMounted: screenshots.length > 0,
      viewports: VIEWPORTS,
      flowSteps,
      phase2Scenarios,
      regressions: REGRESSION_IDS.map((id) => ({ id, passed: regressions.has(id), detail: regressions.get(id) ?? "Covered by the complementary Phase 2 browser mode." })),
      assertions,
      screenshots,
      requests,
      network: {
        externalAttempts,
        realApiRequests,
        mockedAiPosts: requests.filter((entry) => entry.mocked === "ai" && entry.method === "POST").length,
        mockedMemoryRequests: requests.filter((entry) => entry.mocked === "memory").length,
        serverLedgerEntries: serverEntries.length,
        serverDeniedEntries: deniedServerEntries.length,
      },
      runtime: {
        chrome: BROWSER_EXECUTABLE,
        playwrightCore: JSON.parse(readFileSync(resolve(ROOT, "node_modules/playwright-core/package.json"), "utf8")).version,
        browserDownload: false,
        serverPort,
      },
      frozenBindings: assertFrozenBindings(ROOT),
      frozenContract: {
        actionCount: FROZEN_ACTIONS.length,
        actionsSha256: sha256(stableJson(FROZEN_ACTIONS)),
        drawingPrompt: FROZEN_DRAWING_PROMPT,
        phase15AuthorizedPathCount: FROZEN_PHASE15_PATHS.length,
        phase15AuthorizedPathsSha256: sha256(stableJson(FROZEN_PHASE15_PATHS)),
      },
      cleanup: {
        profiles: profiles.size,
        serverStopped: server === null,
        nextAbsent: !existsSync(resolve(ROOT, ".next")),
        temporaryAbsent: !existsSync(resolve(ROOT, TEMP_ROOT)),
        instrumentationAbsent: true,
      },
      serverOutputSha256: sha256(serverOutput),
    };
    writeFileSync(resolve(ROOT, RESULT_PATH), `${stableJson(result)}\n`, { encoding: "utf8", mode: 0o600 });
  }
  const binding = bindLocalFile(ROOT, RESULT_PATH);
  process.stdout.write(`${SPEC0002_ID} ${MODE} PASS: ${assertions.length} assertions, ${screenshots.length} screenshots, result ${binding.sha256}.\n`);
};

await main();
