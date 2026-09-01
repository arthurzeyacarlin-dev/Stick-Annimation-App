import assert from "node:assert/strict";
import {spawn, type ChildProcess} from "node:child_process";
import {createHash} from "node:crypto";
import {
  closeSync,
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import {get as httpGet} from "node:http";
import {createServer} from "node:net";
import {resolve} from "node:path";
import {tmpdir} from "node:os";
import {chromium, type BrowserContext, type Page, type Request} from "playwright-core";
import type {StickAnimationPlanV1} from "../../src/lib/ai/stickFigureAiContract.ts";
import type {StickProjectDocumentV1} from "../../src/lib/stickfigure/stickProjectContract.ts";

const ROOT = process.cwd();
const OUTPUT_ROOT = resolve(ROOT, "output/spec-0004/phase-1/browser");
const BROWSER_EXECUTABLE = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const REVIEW_QUERY = "__spec0004_review=1";
const ANCHOR = "  /* SPEC0001_BROWSER_DRIVER_ANCHOR_V1 */";
const FIXTURE_NAMES = ["wave", "jump", "bow", "dodge"] as const;
const readJson = <T,>(path: string): T => JSON.parse(readFileSync(path, "utf8")) as T;
const starter = readJson<StickProjectDocumentV1>(resolve(ROOT, "scripts/fixtures/stick-ai/v1/fresh-stick-project.json"));
const fixtures = Object.fromEntries(FIXTURE_NAMES.map((name) => [
  name,
  readJson<StickAnimationPlanV1>(resolve(ROOT, `scripts/fixtures/stick-ai/v3/${name}.json`)),
])) as Record<(typeof FIXTURE_NAMES)[number], StickAnimationPlanV1>;
const viewportFixture = readJson<{
  fixtureVersion: 1;
  viewports: Array<{name: string; width: number; height: number}>;
}>(resolve(ROOT, "scripts/fixtures/spec0004-stick/v1/browser-viewports.json"));

type ReviewCandidate = StickProjectDocumentV1;
type ReviewPorts = {
  resetFreshProject: () => Promise<unknown>;
  switchProject: () => Promise<unknown>;
  previewFixture: (fixture: unknown) => Promise<{accepted: boolean; outcomeCode: string; errorCode: string | null}>;
  cancelFixture: (fixture: unknown) => Promise<{accepted: boolean; outcomeCode: string; errorCode: string | null}>;
  applyFixture: (fixture: unknown) => Promise<{accepted: boolean; outcomeCode: string; errorCode: string | null}>;
  beginApplyPublication: (fixture: unknown) => Promise<{accepted: boolean; outcomeCode: string; errorCode: string | null}>;
  completeApplyPublication: (fixture: unknown) => Promise<{accepted: boolean; outcomeCode: string; errorCode: string | null}>;
  readPreviewCandidate: () => Promise<ReviewCandidate | null>;
  readCheckpoint: () => Promise<Record<string, unknown>>;
  undo: () => Promise<Record<string, unknown>>;
  redo: () => Promise<Record<string, unknown>>;
  save: () => Promise<{accepted: boolean; outcomeCode: string; errorCode: string | null}>;
  reopen: () => Promise<{accepted: boolean; outcomeCode: string; errorCode: string | null}>;
  moveJoint: (jointIndex?: number, deltaX?: number, deltaY?: number) => Promise<{accepted: boolean; outcomeCode: string; errorCode: string | null}>;
  openCreator: () => Promise<{accepted: boolean; outcomeCode: string; errorCode: string | null}>;
};

type ReviewWindow = Window & {
  __spec0004Phase1PortsV1?: ReviewPorts;
  __spec0004ReviewNetworkV1?: {availabilityShimCalls: number};
};

function reviewClient(
  reviewStarter: StickProjectDocumentV1,
  reviewFixtures: Record<string, StickAnimationPlanV1>,
) {
  if (!new URLSearchParams(window.location.search).has("__spec0004_review")) return;
  try {
    window.localStorage.setItem("da_welcome_never_show", "1");
    window.localStorage.setItem("da_welcome_seen", "1");
  } catch {
    // The private review still works if storage itself is unavailable.
  }
  const reviewWindow = window as ReviewWindow;
  const originalFetch = window.fetch.bind(window);
  reviewWindow.__spec0004ReviewNetworkV1 = {availabilityShimCalls: 0};
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const raw = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const url = new URL(raw, window.location.href);
    if (url.pathname === "/api/ai" && (init?.method ?? "GET").toUpperCase() === "GET") {
      reviewWindow.__spec0004ReviewNetworkV1!.availabilityShimCalls += 1;
      return new Response(JSON.stringify({available: true, reason: "available"}), {
        status: 200,
        headers: {"Content-Type": "application/json"},
      });
    }
    return originalFetch(input, init);
  };

  let currentFixtureName = "wave";
  let currentFixture = {starter: reviewStarter, envelope: reviewFixtures.wave};
  const waitForPorts = async () => {
    for (let attempt = 0; attempt < 200; attempt += 1) {
      if (reviewWindow.__spec0004Phase1PortsV1) return reviewWindow.__spec0004Phase1PortsV1;
      await new Promise((resolvePromise) => window.setTimeout(resolvePromise, 25));
    }
    throw new Error("SPEC-0004 review ports did not mount.");
  };
  const exactButton = (label: string) => [...document.querySelectorAll<HTMLButtonElement>("button")]
    .find((button) => button.textContent?.trim() === label && !button.closest("#spec0004-phase1-review"));

  const renderCandidate = (candidate: ReviewCandidate | null) => {
    const target = document.querySelector<HTMLElement>("[data-review-preview]");
    if (!target) return;
    target.replaceChildren();
    if (!candidate) {
      target.textContent = "No temporary candidate. The document remains authoritative.";
      return;
    }
    const rig = candidate.rigs[0];
    const keyCells = candidate.layers[0].cells.filter((cell) => cell.cellType === "keyframe");
    for (const cell of keyCells) {
      if (cell.cellType !== "keyframe" || !cell.poses[0]) continue;
      const pose = cell.poses[0];
      const points = new Map(pose.points.map((point) => [point.jointId, point]));
      const wrap = document.createElement("div");
      wrap.style.cssText = "display:grid;gap:2px;text-align:center;color:#cfe4ff;font:10px system-ui";
      const label = document.createElement("span");
      label.textContent = "Frame " + (cell.index + 1);
      const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      svg.setAttribute("viewBox", "430 40 1060 1020");
      svg.setAttribute("data-review-pose", String(cell.index));
      svg.style.cssText = "width:150px;height:130px;background:#fff;border-radius:7px;border:1px solid #6385ad";
      for (const segment of rig.segments) {
        const from = points.get(segment.fromJointId);
        const to = points.get(segment.toJointId);
        if (!from || !to) continue;
        const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
        line.setAttribute("x1", String(from.x));
        line.setAttribute("y1", String(from.y));
        line.setAttribute("x2", String(to.x));
        line.setAttribute("y2", String(to.y));
        line.setAttribute("stroke", "#101820");
        line.setAttribute("stroke-width", "16");
        line.setAttribute("stroke-linecap", "round");
        svg.append(line);
      }
      const head = pose.points[0];
      const headLine = document.createElementNS("http://www.w3.org/2000/svg", "line");
      headLine.setAttribute("x1", String(head.x - 40));
      headLine.setAttribute("y1", String(head.y));
      headLine.setAttribute("x2", String(head.x + 40));
      headLine.setAttribute("y2", String(head.y));
      headLine.setAttribute("stroke", "#101820");
      headLine.setAttribute("stroke-width", "16");
      headLine.setAttribute("stroke-linecap", "round");
      svg.append(headLine);
      wrap.append(label, svg);
      target.append(wrap);
    }
  };

  const install = () => {
    if (document.getElementById("spec0004-phase1-review") || !reviewWindow.__spec0004Phase1PortsV1) return;
    const host = document.createElement("section");
    host.id = "spec0004-phase1-review";
    host.setAttribute("aria-label", "Private SPEC-0004 Phase 1 review controls");
    host.style.cssText = "position:fixed;z-index:2147483647;top:8px;left:50%;transform:translateX(-50%);width:min(1120px,calc(100vw - 24px));max-height:285px;overflow:auto;padding:10px;border:1px solid #6096d7;border-radius:12px;background:rgba(8,18,31,.97);box-shadow:0 12px 38px rgba(0,0,0,.55);color:#fff;font:12px system-ui";
    const title = document.createElement("div");
    title.textContent = "PRIVATE REVIEW · SPEC-0004 Phase 1 · fixture plans only (not normal chat)";
    title.style.cssText = "font-weight:800;color:#b9dbff;margin-bottom:7px";
    const controls = document.createElement("div");
    controls.style.cssText = "display:flex;flex-wrap:wrap;gap:6px";
    const status = document.createElement("output");
    status.dataset.reviewStatus = "true";
    status.textContent = "Ready. Choose a fixed fixture preview.";
    status.style.cssText = "display:block;margin:7px 0;color:#d7eaff";
    const preview = document.createElement("div");
    preview.dataset.reviewPreview = "true";
    preview.style.cssText = "display:flex;gap:8px;min-height:28px;align-items:center";
    preview.textContent = "No temporary candidate. The document remains authoritative.";
    const setStatus = (value: string) => { status.textContent = value; };
    const button = (label: string, action: string, operation: () => Promise<void> | void) => {
      const node = document.createElement("button");
      node.type = "button";
      node.textContent = label;
      node.dataset.reviewAction = action;
      node.style.cssText = "border:1px solid #6f9dcc;border-radius:7px;background:#17324f;color:#fff;padding:5px 8px;cursor:pointer;font:600 11px system-ui";
      node.addEventListener("click", () => void Promise.resolve(operation()).catch((error: unknown) => setStatus("ERROR: " + String(error))));
      controls.append(node);
    };
    for (const name of ["wave", "jump", "bow", "dodge"]) {
      button("Preview " + name, "preview-" + name, async () => {
        const ports = await waitForPorts();
        const checkpointValue = await ports.readCheckpoint();
        if (checkpointValue.aiCreationLatchStatus !== "unconsumed" || checkpointValue.undoDepth !== 0 || checkpointValue.activeTransactionPhase !== "idle") {
          await ports.resetFreshProject();
        }
        currentFixtureName = name;
        currentFixture = {starter: reviewStarter, envelope: reviewFixtures[name]};
        const result = await ports.previewFixture(currentFixture);
        renderCandidate(await ports.readPreviewCandidate());
        setStatus(result.outcomeCode === "previewed" ? "Preview " + name + " ready · no document/history/storage/latch mutation" : JSON.stringify(result));
      });
    }
    button("Cancel", "cancel", async () => {
      const result = await (await waitForPorts()).cancelFixture(currentFixture);
      renderCandidate(null);
      setStatus(result.outcomeCode === "preview_cancelled" ? "Preview cancelled · no changes made" : JSON.stringify(result));
    });
    button("Apply", "apply", async () => {
      const result = await (await waitForPorts()).applyFixture(currentFixture);
      renderCandidate(null);
      setStatus(result.outcomeCode === "applied" ? currentFixtureName + " applied · one undoable change · latch consumed" : JSON.stringify(result));
    });
    button("Fresh project", "fresh", async () => {
      await (await waitForPorts()).resetFreshProject();
      renderCandidate(null);
      setStatus("Fresh project · unconsumed latch");
    });
    button("Play", "play", () => { exactButton("Play")?.click(); setStatus("Human Play clicked"); });
    button("Pause", "pause", () => { exactButton("Pause")?.click(); setStatus("Human Pause clicked"); });
    button("Onion", "onion", () => { exactButton("Onion")?.click(); setStatus("Human Onion toggled"); });
    button("Move head +7", "move-joint", async () => { setStatus(JSON.stringify(await (await waitForPorts()).moveJoint(0, 7, 0))); });
    button("Undo", "undo", async () => { await (await waitForPorts()).undo(); setStatus("Human Undo completed · latch unchanged"); });
    button("Redo", "redo", async () => { await (await waitForPorts()).redo(); setStatus("Human Redo completed · latch unchanged"); });
    button("Save", "save", async () => { setStatus(JSON.stringify(await (await waitForPorts()).save())); });
    button("Open saved", "open", async () => { setStatus(JSON.stringify(await (await waitForPorts()).reopen())); });
    button("Open Creator", "creator", async () => { setStatus(JSON.stringify(await (await waitForPorts()).openCreator())); });
    button("Toggle preview panel", "toggle-panel", () => {
      const hidden = preview.style.display === "none";
      preview.style.display = hidden ? "flex" : "none";
      host.style.maxHeight = hidden ? "285px" : "125px";
      setStatus(hidden ? "Preview panel expanded" : "Preview panel collapsed");
    });
    button("Run stale guard", "stale", async () => {
      const ports = await waitForPorts();
      await ports.resetFreshProject();
      currentFixtureName = "wave";
      currentFixture = {starter: reviewStarter, envelope: reviewFixtures.wave};
      await ports.beginApplyPublication(currentFixture);
      await ports.switchProject();
      const result = await ports.completeApplyPublication(currentFixture);
      renderCandidate(null);
      setStatus(result.errorCode === "project_switched" ? "Stale/project-switch Apply rejected · no candidate leaked" : JSON.stringify(result));
    });
    host.append(title, controls, status, preview);
    document.body.append(host);
  };
  window.addEventListener("spec0004:ports-ready", install);
  window.setInterval(install, 250);
}

const sha256 = (bytes: string | Buffer) => `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
const getFreePort = () => new Promise<number>((resolvePromise, rejectPromise) => {
  const server = createServer();
  server.once("error", rejectPromise);
  server.listen(0, "127.0.0.1", () => {
    const address = server.address();
    if (!address || typeof address === "string") return rejectPromise(new Error("No loopback port was allocated."));
    const port = address.port;
    server.close((error) => error ? rejectPromise(error) : resolvePromise(port));
  });
});
const waitForServer = async (url: string, child: ChildProcess) => {
  for (let attempt = 0; attempt < 240; attempt += 1) {
    if (child.exitCode !== null) throw new Error("Review server exited before readiness with code " + child.exitCode + ".");
    const ready = await new Promise<boolean>((resolvePromise) => {
      const request = httpGet(url, (response) => {
        response.resume();
        resolvePromise(Boolean(response.statusCode && response.statusCode < 500));
      });
      request.setTimeout(1000, () => request.destroy());
      request.once("error", () => resolvePromise(false));
    });
    if (ready) return;
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 250));
  }
  throw new Error("Review server did not become ready.");
};

const makeIsolatedCopy = () => {
  const copy = mkdtempSync(resolve(tmpdir(), "diamond-spec0004-phase1-review-"));
  cpSync(ROOT, copy, {
    recursive: true,
    filter: (source) => {
      const relative = source.slice(ROOT.length).replace(/^\//, "");
      const first = relative.split("/")[0];
      return ![".git", ".next", "node_modules", "output"].includes(first);
    },
  });
  const nodeModules = realpathSync(resolve(ROOT, "node_modules"));
  symlinkSync(nodeModules, resolve(copy, "node_modules"), "dir");

  const workspacePath = resolve(copy, "src/components/workspace/stickfigure/StickFigureWorkspace.tsx");
  const workspaceSource = readFileSync(workspacePath, "utf8");
  assert.ok(workspaceSource.includes(ANCHOR), "isolated review injection anchor must exist exactly");
  const injection = [
    "  if (typeof window !== \"undefined\" && new URLSearchParams(window.location.search).has(\"__spec0004_review\")) {",
    "    (window as unknown as {__spec0004Phase1PortsV1?: unknown}).__spec0004Phase1PortsV1 = spec0004Phase1BrowserPortsV1;",
    "    window.dispatchEvent(new Event(\"spec0004:ports-ready\"));",
    "  }",
    "",
  ].join("\n");
  writeFileSync(workspacePath, workspaceSource.replace(ANCHOR, injection + ANCHOR));

  const layoutPath = resolve(copy, "app/layout.tsx");
  let layoutSource = readFileSync(layoutPath, "utf8");
  layoutSource = layoutSource.replace('import { Geist, Geist_Mono } from "next/font/google";\n', "");
  layoutSource = layoutSource.replace(/const geistSans = Geist\([\s\S]*?\n\}\);\n\nconst geistMono = Geist_Mono\([\s\S]*?\n\}\);\n\n/, "");
  layoutSource = layoutSource.replace('className={`${geistSans.variable} ${geistMono.variable} antialiased`}', 'className="antialiased"');
  layoutSource = layoutSource.replace("      >\n        <ScrollbarActivity />", "      >\n        <script src=\"/spec0004-review.js\" />\n        <ScrollbarActivity />");
  writeFileSync(layoutPath, layoutSource);

  const pagePath = resolve(copy, "app/page.tsx");
  const pageSource = readFileSync(pagePath, "utf8");
  writeFileSync(pagePath, pageSource.replace(
    '        const never = localStorage.getItem("da_welcome_never_show") === "1";',
    '        const never = localStorage.getItem("da_welcome_never_show") === "1" || new URLSearchParams(window.location.search).has("__spec0004_review");',
  ));

  const clientSource = "(" + reviewClient.toString() + ")(" + JSON.stringify(starter) + "," + JSON.stringify(fixtures) + ");\n";
  writeFileSync(resolve(copy, "public/spec0004-review.js"), clientSource);
  return copy;
};

const enterStickWorkspace = async (page: Page, url: string) => {
  await page.goto(url, {waitUntil: "domcontentloaded"});
  await page.waitForTimeout(1500);
  await page.getByRole("button", {name: /New Project/}).click({force: true});
  await page.getByText("Create a new project", {exact: true}).waitFor();
  await page.getByText("Stick Figure Animation", {exact: true}).click();
  await page.waitForFunction(() => Boolean((window as unknown as ReviewWindow).__spec0004Phase1PortsV1));
  await page.locator("#spec0004-phase1-review").waitFor();
};
const clickReview = async (page: Page, action: string) => {
  await page.locator(`[data-review-action="${action}"]`).click();
};
const waitStatus = async (page: Page, text: string) => {
  await page.locator("[data-review-status]").filter({hasText: text}).waitFor();
};
const checkpoint = (page: Page) => page.evaluate(async () => {
  const ports = (window as unknown as ReviewWindow).__spec0004Phase1PortsV1;
  if (!ports) throw new Error("Review ports unavailable.");
  return ports.readCheckpoint();
});
const recordNetwork = (context: BrowserContext, reviewOrigin: string) => {
  const entries: Array<{url: string; method: string; resourceType: string; classification: string}> = [];
  context.on("request", (request: Request) => {
    const url = request.url();
    let classification = "loopback";
    if (url.startsWith("data:") || url.startsWith("blob:")) classification = "local-inline";
    else if (!url.startsWith(reviewOrigin)) classification = "external";
    else if (new URL(url).pathname === "/api/ai") classification = "api";
    entries.push({url, method: request.method(), resourceType: request.resourceType(), classification});
  });
  return entries;
};

const runBrowserProof = async (url: string, outputRoot: string) => {
  assert.equal(viewportFixture.fixtureVersion, 1);
  const context = await chromium.launchPersistentContext(mkdtempSync(resolve(tmpdir(), "spec0004-browser-profile-")), {
    executablePath: BROWSER_EXECUTABLE,
    headless: true,
    viewport: {width: viewportFixture.viewports[0].width, height: viewportFixture.viewports[0].height},
    handleSIGINT: false,
    handleSIGTERM: false,
    handleSIGHUP: false,
    args: ["--disable-background-networking", "--disable-component-update", "--disable-default-apps", "--disable-extensions", "--disable-sync", "--no-first-run"],
  });
  await context.addInitScript(() => {
    localStorage.setItem("da_welcome_never_show", "1");
    localStorage.setItem("da_welcome_seen", "1");
  });
  const reviewOrigin = new URL(url).origin;
  const network = recordNetwork(context, reviewOrigin);
  await context.route("**/*", async (route) => {
    const requestUrl = route.request().url();
    if (requestUrl.startsWith(reviewOrigin) || requestUrl.startsWith("data:") || requestUrl.startsWith("blob:")) await route.continue();
    else await route.abort("blockedbyclient");
  });
  const consoleErrors: string[] = [];
  const page = context.pages()[0] ?? await context.newPage();
  page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
  page.on("pageerror", (error) => consoleErrors.push(error.message));
  await enterStickWorkspace(page, url);

  const screenshots: string[] = [];
  const fixtureEvidence: Array<Record<string, unknown>> = [];
  for (const name of FIXTURE_NAMES) {
    await clickReview(page, "fresh");
    await waitStatus(page, "Fresh project");
    const before = await checkpoint(page);
    await clickReview(page, "preview-" + name);
    await waitStatus(page, "Preview " + name + " ready");
    await page.locator("[data-review-pose]").first().waitFor();
    assert.equal(await page.locator("[data-review-pose]").count(), 3, name + " preview must display three independent key poses");
    const previewShot = resolve(outputRoot, `desktop-preview-${name}.png`);
    await page.screenshot({path: previewShot, fullPage: true});
    screenshots.push(previewShot);
    const previewCheckpoint = await checkpoint(page);
    assert.equal(previewCheckpoint.documentDigest, before.documentDigest, name + " Preview must not mutate document");
    assert.equal(previewCheckpoint.historyRootDigest, before.historyRootDigest, name + " Preview must not mutate history");
    assert.equal(previewCheckpoint.storageDigest, before.storageDigest, name + " Preview must not mutate storage");
    assert.equal(previewCheckpoint.aiCreationLatchDigest, before.aiCreationLatchDigest, name + " Preview must not mutate latch");
    await clickReview(page, "cancel");
    await waitStatus(page, "Preview cancelled");
    const cancelled = await checkpoint(page);
    assert.equal(cancelled.documentDigest, before.documentDigest, name + " Cancel must not mutate document");
    assert.equal(cancelled.historyRootDigest, before.historyRootDigest, name + " Cancel must not mutate history");
    assert.equal(cancelled.storageDigest, before.storageDigest, name + " Cancel must not mutate storage");
    assert.equal(cancelled.aiCreationLatchDigest, before.aiCreationLatchDigest, name + " Cancel must not mutate latch");

    await clickReview(page, "fresh");
    await waitStatus(page, "Fresh project");
    await clickReview(page, "preview-" + name);
    await waitStatus(page, "Preview " + name + " ready");
    await clickReview(page, "apply");
    await waitStatus(page, name + " applied");
    const applied = await checkpoint(page);
    assert.equal(applied.undoDepth, 1, name + " Apply must be one visible history action");
    assert.equal(applied.redoDepth, 0, name + " Apply clears redo");
    assert.equal(applied.aiCreationLatchStatus, "consumed", name + " Apply consumes latch");
    const appliedShot = resolve(outputRoot, `desktop-applied-${name}.png`);
    await page.screenshot({path: appliedShot, fullPage: true});
    screenshots.push(appliedShot);
    fixtureEvidence.push({name, previewDocumentDigest: previewCheckpoint.documentDigest, appliedDocumentDigest: applied.documentDigest});
  }

  const acceptedBeforeUndo = await checkpoint(page);
  await clickReview(page, "undo");
  await waitStatus(page, "Undo completed");
  const undone = await checkpoint(page);
  assert.notEqual(undone.documentDigest, acceptedBeforeUndo.documentDigest, "Undo returns to pre-Apply document");
  assert.equal(undone.aiCreationLatchStatus, "consumed", "Undo does not reopen AI creation");
  await clickReview(page, "redo");
  await waitStatus(page, "Redo completed");
  const redone = await checkpoint(page);
  assert.equal(redone.documentDigest, acceptedBeforeUndo.documentDigest, "Redo restores exact accepted document bytes");
  assert.equal(redone.aiCreationLatchStatus, "consumed", "Redo leaves latch consumed");

  await clickReview(page, "play");
  await page.waitForFunction(async () => (await (window as unknown as ReviewWindow).__spec0004Phase1PortsV1!.readCheckpoint()).playbackState === "playing");
  await clickReview(page, "pause");
  await page.waitForFunction(async () => (await (window as unknown as ReviewWindow).__spec0004Phase1PortsV1!.readCheckpoint()).playbackState === "paused");
  await clickReview(page, "onion");
  await page.waitForFunction(async () => (await (window as unknown as ReviewWindow).__spec0004Phase1PortsV1!.readCheckpoint()).onionEnabled === true);
  await clickReview(page, "onion");

  const beforeManual = await checkpoint(page);
  await clickReview(page, "move-joint");
  await waitStatus(page, "manual_edit_applied");
  const afterManual = await checkpoint(page);
  assert.notEqual(afterManual.documentDigest, beforeManual.documentDigest, "manual generated-joint edit changes document");
  assert.equal(afterManual.aiCreationLatchStatus, "consumed", "manual edit leaves latch consumed");

  await clickReview(page, "save");
  await waitStatus(page, '"saved"');
  const saved = await checkpoint(page);
  await clickReview(page, "open");
  await waitStatus(page, '"opened"');
  const reopened = await checkpoint(page);
  assert.equal(reopened.documentDigest, saved.documentDigest, "Save/Open preserves exact document bytes");
  assert.equal(reopened.aiCreationLatchStatus, "consumed", "Save/Open preserves consumed latch");

  const beforeSecondAi = await checkpoint(page);
  await page.getByLabel("Stick Figure AI request", {exact: true}).fill("Create a simple three-pose wave animation with one stick figure at 12 FPS.");
  await page.getByLabel("Send Stick Figure AI request", {exact: true}).click();
  await page.getByRole("status").filter({hasText: "AI editing comes later; use manual tools."}).waitFor();
  const afterSecondAi = await checkpoint(page);
  for (const field of ["documentDigest", "historyRootDigest", "storageDigest", "aiCreationLatchDigest", "terminalLedgerLength", "commandRootTransitionCount"]) {
    assert.equal(afterSecondAi[field], beforeSecondAi[field], "post-Apply no-op preserves " + field);
  }
  const postApplyShot = resolve(outputRoot, "desktop-post-apply-noop.png");
  await page.screenshot({path: postApplyShot, fullPage: true});
  screenshots.push(postApplyShot);

  await clickReview(page, "creator");
  await page.getByRole("button", {name: "Back", exact: true}).waitFor();
  await page.getByRole("button", {name: "Back", exact: true}).click({force: true});
  await page.locator("[data-review-action=\"fresh\"]").waitFor();

  await clickReview(page, "stale");
  await waitStatus(page, "Stale/project-switch Apply rejected");
  const staleCheckpoint = await checkpoint(page);
  assert.equal(staleCheckpoint.aiCreationLatchStatus, "unconsumed", "stale/project-switch rejection leaves new-project latch unconsumed");
  assert.equal(staleCheckpoint.undoDepth, 0, "stale/project-switch rejection creates no history");

  const compact = viewportFixture.viewports[1];
  await page.setViewportSize({width: compact.width, height: compact.height});
  await clickReview(page, "preview-wave");
  await waitStatus(page, "Preview wave ready");
  const compactShot = resolve(outputRoot, "compact-desktop-preview-wave.png");
  await page.screenshot({path: compactShot, fullPage: true});
  screenshots.push(compactShot);
  assert.equal(await page.locator("[data-review-pose]").count(), 3, "compact viewport visibly renders all preview key poses");
  await clickReview(page, "cancel");

  const drawingPage = await context.newPage();
  await drawingPage.goto(url, {waitUntil: "domcontentloaded"});
  await drawingPage.waitForTimeout(1500);
  await drawingPage.getByRole("button", {name: /New Project/}).click({force: true});
  await drawingPage.getByText("Create a new project", {exact: true}).waitFor();
  await drawingPage.getByText("Drawing Animation", {exact: true}).click();
  await drawingPage.getByRole("button", {name: "Undo", exact: false}).first().waitFor();
  const drawingShot = resolve(outputRoot, "drawing-regression.png");
  await drawingPage.screenshot({path: drawingShot, fullPage: true});
  screenshots.push(drawingShot);

  const availabilityShimCalls = await page.evaluate(() => (window as unknown as ReviewWindow).__spec0004ReviewNetworkV1?.availabilityShimCalls ?? 0);
  const externalRequests = network.filter((entry) => entry.classification === "external");
  const apiRequests = network.filter((entry) => entry.classification === "api");
  assert.equal(externalRequests.length, 0, "browser proof makes zero external requests");
  assert.equal(apiRequests.length, 0, "browser proof makes zero API network requests");
  assert.ok(availabilityShimCalls >= 1, "private review shim handled pre-existing availability locally");
  const actionableConsoleErrors = consoleErrors.filter((message) => !/favicon\.ico|Download the React DevTools|hydration/i.test(message));
  assert.deepEqual(actionableConsoleErrors, [], "browser proof has no actionable console/page errors");

  await context.close();
  return {
    fixtureEvidence,
    screenshots: screenshots.map((path) => ({path, sha256: sha256(readFileSync(path)), bytes: lstatSync(path).size})),
    viewports: viewportFixture.viewports,
    flows: ["preview", "cancel", "apply", "play-pause", "onion", "manual-joint-edit", "undo-redo", "save-open", "creator", "drawing", "stale-rejection", "post-apply-noop"],
    network: {
      totalRequests: network.length,
      loopbackRequests: network.filter((entry) => entry.classification === "loopback").length,
      externalRequests: externalRequests.length,
      apiRequests: apiRequests.length,
      providerRequests: 0,
      availabilityShimCalls,
    },
    consoleErrors: actionableConsoleErrors,
  };
};

const main = async () => {
  assert.ok(existsSync(BROWSER_EXECUTABLE), "Google Chrome executable is required for real-browser proof");
  mkdirSync(OUTPUT_ROOT, {recursive: true});
  const keepServer = process.argv.includes("--keep-server");
  const copy = makeIsolatedCopy();
  const port = await getFreePort();
  assert.notEqual(port, 3000, "private review port must be non-3000");
  const logPath = resolve(OUTPUT_ROOT, "review-server.log");
  const logFd = openSync(logPath, "w", 0o600);
  const child = spawn(process.execPath, [resolve(copy, "node_modules/next/dist/bin/next"), "dev", "--webpack", "-H", "127.0.0.1", "-p", String(port)], {
    cwd: copy,
    env: {...process.env, NEXT_TELEMETRY_DISABLED: "1", NODE_ENV: "development"},
    detached: keepServer,
    stdio: ["ignore", logFd, logFd],
  });
  closeSync(logFd);
  const url = `http://127.0.0.1:${port}/?${REVIEW_QUERY}`;
  let succeeded = false;
  try {
    await waitForServer(url, child);
    const browserEvidence = await runBrowserProof(url, OUTPUT_ROOT);
    const receipt = {
      receiptVersion: 1,
      phase: "SPEC-0004 Phase 1",
      generatedAt: new Date().toISOString(),
      review: {
        url,
        serverPid: child.pid,
        serverMode: "private-development-isolated-copy",
        unpublished: true,
        non3000: port !== 3000,
        isolatedCopy: copy,
        permanentProductRouteAdded: false,
        permanentFixturePickerAdded: false,
      },
      browserEvidence,
      sourceHead: "9fae072359f3c0d10f1ed2bcee8da9ebc11d54ec",
    };
    const receiptPath = resolve(OUTPUT_ROOT, "browser-proof.json");
    const bytes = JSON.stringify(receipt, null, 2) + "\n";
    writeFileSync(receiptPath, bytes);
    console.log("SPEC-0004 Phase 1 browser proof passed.");
    console.log("Review URL: " + url);
    console.log("Review PID: " + child.pid);
    console.log("Receipt: " + receiptPath);
    console.log("Receipt SHA-256: " + sha256(bytes));
    succeeded = true;
  } finally {
    if (keepServer && succeeded) child.unref();
    else {
      child.kill("SIGTERM");
      await new Promise((resolvePromise) => child.once("exit", resolvePromise));
      if (existsSync(copy) && copy.startsWith(resolve(tmpdir(), "diamond-spec0004-phase1-review-"))) rmSync(copy, {recursive: true, force: true});
    }
  }
};

await main();
