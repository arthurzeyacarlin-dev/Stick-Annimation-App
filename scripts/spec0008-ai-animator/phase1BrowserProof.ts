import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { chromium, type BrowserContext, type Locator, type Page, type Route } from "playwright-core";
import sharp from "sharp";

type Intent = "conversation" | "create-animation" | "edit-animation" | "clarify";
type Job = { request: Record<string, unknown>; status: "thinking" | "done" | "failed" | "cancelled"; polls: number; reply: string; intent: Intent; events: Array<Record<string, unknown>> };
const url = process.argv.find(argument => argument.startsWith("--url="))?.slice(6) ?? "http://127.0.0.1:57120/";
assert.match(url, /^http:\/\/127\.0\.0\.1:[0-9]+\/$/);
const origin = new URL(url).origin;
const outputRoot = "output/spec-0008/phase-1/browser";
mkdirSync(outputRoot, { recursive: true });
const fixture = JSON.parse(readFileSync("scripts/fixtures/spec0008-ai-animator/v1/semantic-cases.json", "utf8")) as Array<{ prompt: string; intent: Intent }>;
const intents = new Map(fixture.map(item => [item.prompt, item.intent]));
const jobs = new Map<string, Job>();
const capturedRequests: Array<Record<string, unknown>> = [];
const externalRequests: string[] = [];
const errors: string[] = [];
let lastTerminalFulfilledAt = 0;
let assertions = 0;
const MASK_BAND_RATIO = 0.57;
const MASK_TRAVEL_START_PERCENT = -132.5581;
const MASK_TRAVEL_END_PERCENT = 232.5581;
const TRAVEL_SAMPLE_TIMES_MS = [200, 500, 800] as const;
const check = (value: unknown, label: string) => { assertions += 1; assert.ok(value, label); };
const equal = (actual: unknown, expected: unknown, label: string) => { assertions += 1; assert.deepEqual(actual, expected, label); };
const digest = (value: string) => createHash("sha256").update(value).digest("hex");
const renderedColorBounds = async (png: Buffer) => {
  const { data, info } = await sharp(png).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const coloredX: number[] = [];
  for (let y = 0; y < info.height; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      const offset = (y * info.width + x) * info.channels;
      const red = data[offset]; const blue = data[offset + 2];
      if (blue - red >= 18 && blue > 95) coloredX.push(x);
    }
  }
  assert.ok(coloredX.length > 0, "rendered sweep contains visible blue/cyan pixels");
  const minX = Math.min(...coloredX);
  const maxX = Math.max(...coloredX);
  return { count: coloredX.length, minRatio: minX / info.width, maxRatio: (maxX + 1) / info.width, spanRatio: (maxX - minX + 1) / info.width };
};

const assistantReply = (prompt: string, intent: Intent) => {
  if (prompt === "presentation-hold") return "First line arrives quickly.\nSecond line keeps its spacing while the cool leading edge moves.";
  if (prompt === "fast-success") return "The fast local response waited for both Thinking sweeps before appearing.";
  if (prompt === "hello") return "Hello! I’m Terra. Nice to meet you—what would you like to talk through?";
  if (prompt === "Hi, this is a test. Can you respond back?") return "Absolutely—I can respond. Your test message came through clearly.";
  if (prompt === "You're Terra, right?") return "Yes—I’m Terra, and I remember that this started as a quick response test.";
  if (prompt === "What color pairs well with deep blue?") return "Warm gold, coral, or a pale cyan can all pair well with deep blue, depending on the mood you want.";
  if (prompt.includes("brainstorm")) return "Three directions: awkward zero-gravity timing, a tiny UFO with an oversized parking problem, or a deadpan alien commuter comedy.";
  if (intent === "create-animation") return "I understand the scene and can outline its beats. No animation was changed. Animation creation and editing arrive in later phases.";
  if (intent === "edit-animation") return "I understand the requested revision and can describe a safe edit plan. No animation was changed. Animation creation and editing arrive in later phases.";
  if (intent === "clarify") return "Which exact part should I change?";
  if (prompt.startsWith("Reasoning probe")) return `I received the ${prompt.toLowerCase()}.`;
  if (prompt === "reload-hold") return "I reconnected to the same project-bound request after reload.";
  return "That makes sense. Tell me a little more about the direction you have in mind.";
};

const snapshot = (jobId: string, job: Job) => {
  const request = job.request as { turnId: string; message: string; workspace: { projectId: string; projectGeneration: number }; reasoningLevel: "low" | "medium" | "high" | "extra-high" };
  const now = new Date().toISOString();
  const terminal = job.status === "done" || job.status === "failed" || job.status === "cancelled";
  const effort = request.reasoningLevel === "extra-high" ? "xhigh" : request.reasoningLevel;
  return {
    version: 1, jobId, turnId: request.turnId, projectId: request.workspace.projectId, projectGeneration: request.workspace.projectGeneration,
    reasoningLevel: request.reasoningLevel, intent: job.status === "done" ? job.intent : null, status: job.status, lastSequence: job.events.length,
    createdAt: job.events[0]?.createdAt ?? now, updatedAt: now, completedAt: terminal ? now : null,
    telemetry: {
      model: "gpt-5.6-terra", effort, outcome: job.status === "done" ? "succeeded" : job.status === "failed" ? "failed" : job.status === "cancelled" ? "cancelled" : "active",
      latencyMs: terminal ? 10 : null, promptDigest: digest(request.message),
      usage: terminal ? { inputTokens: 100, outputTokens: 30, totalTokens: 130, estimatedCostUsd: 0.00056 } : { inputTokens: null, outputTokens: null, totalTokens: null, estimatedCostUsd: null },
    },
    events: job.events,
  };
};

const routeAi = async (route: Route) => {
  const request = route.request();
  const requestUrl = new URL(request.url());
  if (request.method() === "POST") {
    const body = request.postDataJSON() as Record<string, unknown>;
    capturedRequests.push(body);
    const jobId = String(body.jobId);
    const prompt = String(body.message);
    const intent = intents.get(prompt) ?? (prompt.startsWith("Reasoning probe") || prompt === "reload-hold" || prompt === "cancel-hold" ? "conversation" : "conversation");
    const now = new Date().toISOString();
    const job: Job = { request: body, status: "thinking", polls: 0, reply: assistantReply(prompt, intent), intent, events: [{ sequence: 1, status: "thinking", createdAt: now }] };
    jobs.set(jobId, job);
    if (prompt === "fast-provider-failure") {
      job.status = "failed";
      job.events.push({ sequence: 2, status: "failed", createdAt: new Date().toISOString(), errorCode: "pretend_provider_failure", errorMessage: "Pretend provider failed. No animation changed." });
      lastTerminalFulfilledAt = Date.now();
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ error: "Pretend provider failed. No animation changed." }) });
      return;
    }
    await route.fulfill({ status: 202, contentType: "application/json", body: JSON.stringify(snapshot(jobId, job)) });
    return;
  }
  const deleteBody = request.method() === "DELETE" ? request.postDataJSON() as { jobId?: string } : null;
  const jobId = deleteBody?.jobId ?? requestUrl.searchParams.get("jobId") ?? "";
  const job = jobs.get(jobId);
  if (!job) {
    await route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ error: "missing" }) });
    return;
  }
  if (request.method() === "DELETE") {
    if (job.status === "thinking") {
      job.status = "cancelled";
      job.events.push({ sequence: 2, status: "cancelled", createdAt: new Date().toISOString() });
    }
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(snapshot(jobId, job)) });
    return;
  }
  job.polls += 1;
  const prompt = String(job.request.message);
  const requiredPolls = prompt === "presentation-hold" ? 60 : prompt === "reload-hold" ? 2 : 1;
  if (job.status === "thinking" && prompt !== "cancel-hold" && job.polls >= requiredPolls) {
    const sequence = job.events.length + 1;
    if (prompt === "fast-provider-failure") {
      job.status = "failed";
      job.events.push({ sequence, status: "failed", createdAt: new Date().toISOString(), errorCode: "pretend_provider_failure", errorMessage: "Pretend provider failed. No animation changed." });
    } else {
      job.status = "done";
      job.events.push({
        sequence, status: "done", createdAt: new Date().toISOString(),
        reply: { intent: job.intent, reply: job.reply, focusedQuestion: job.intent === "clarify" ? "Which exact part should I change?" : null, planSummary: job.intent === "create-animation" || job.intent === "edit-animation" ? "Non-mutating readiness plan" : null },
        provider: { requestedModel: "gpt-5.6-terra", providerModel: "gpt-5.6-terra", responseId: `double-${jobId}`, usage: { inputTokens: 100, outputTokens: 30, totalTokens: 130, estimatedCostUsd: 0.00056 } },
      });
    }
  }
  if (job.status === "done" || job.status === "failed") lastTerminalFulfilledAt = Date.now();
  await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(snapshot(jobId, job)) });
};

const installRoutes = async (context: BrowserContext) => {
  await context.route("**/*", async route => {
    const requestUrl = new URL(route.request().url());
    if (requestUrl.origin === origin && requestUrl.pathname === "/api/ai-animator") return routeAi(route);
    if (requestUrl.origin === origin || requestUrl.protocol === "data:" || requestUrl.protocol === "blob:") return route.continue();
    externalRequests.push(route.request().url());
    return route.abort();
  });
};

const openNew = async (page: Page) => {
  await page.goto(url);
  await page.getByRole("button", { name: /^New Project/ }).click();
  await page.locator('canvas[data-workspace-canvas="editable"]').waitFor();
  await page.getByLabel("Message AI Animator").waitFor();
};
const send = async (page: Page, prompt: string, expected: RegExp) => {
  await page.getByLabel("Message AI Animator").fill(prompt);
  await page.getByRole("button", { name: /^(Send|Send AI message)$/ }).click();
  const status = page.getByRole("status", { name: "AI Animator request status" });
  await status.waitFor();
  equal((await status.textContent())?.trim(), "Thinking", `${prompt}: visible truthful Thinking`);
  await page.locator("[data-ai-assistant-message]").filter({ hasText: expected }).last().waitFor();
};
const canvasDigest = async (page: Page) => page.locator('canvas[data-workspace-canvas="editable"]').evaluate(async element => {
  const canvas = element as HTMLCanvasElement;
  const bytes = canvas.getContext("2d")!.getImageData(0, 0, canvas.width, canvas.height).data;
  return [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes as BufferSource))].map(value => value.toString(16).padStart(2, "0")).join("");
});
const projectStoreDigest = async (page: Page) => page.evaluate(async () => {
  const result: Record<string, unknown[]> = {};
  const database = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("diamond-animation-unified-v2");
    request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
  });
  for (const name of [...database.objectStoreNames]) {
    result[name] = await new Promise<unknown[]>((resolve, reject) => {
      const request = database.transaction(name, "readonly").objectStore(name).getAll();
      request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
    });
  }
  database.close();
  return JSON.stringify(result, (_key, value) => ArrayBuffer.isView(value) ? Array.from(new Uint8Array(value.buffer, value.byteOffset, value.byteLength)) : value);
});

const browser = await chromium.launch({
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: !process.argv.includes("--headed"),
  args: ["--disable-background-networking", "--disable-component-update", "--disable-sync", "--disable-extensions", "--no-first-run"],
});
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await context.addInitScript(() => localStorage.setItem("da_welcome_seen", "1"));
await installRoutes(context);
const page = await context.newPage();
page.setDefaultTimeout(15_000);
page.on("pageerror", error => errors.push(`page:${error.message}`));
page.on("console", message => { if (message.type() === "error") errors.push(`console:${message.text()}`); });
await openNew(page);

equal(await page.getByRole("button", { name: "Reasoning: Medium" }).count(), 1, "New starts at Medium");
equal(await page.getByText("Generate Plans", { exact: true }).count(), 0, "task picker Generate Plans is absent");
equal(await page.getByText("Generate Frames", { exact: true }).count(), 0, "task picker Generate Frames is absent");
equal(await page.getByText("Generate Sounds", { exact: true }).count(), 0, "task picker Generate Sounds is absent");

await page.getByRole("button", { name: "Brush", exact: true }).click();
const canvas = page.locator('canvas[data-workspace-canvas="editable"]');
const box = await canvas.boundingBox();
assert.ok(box);
await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
await page.mouse.down(); await page.mouse.move(box.x + box.width / 2 + 42, box.y + box.height / 2 + 15, { steps: 4 }); await page.mouse.up();
let beforeCanvas = await canvasDigest(page);
let beforeStore = await projectStoreDigest(page);

const sidebar = page.locator('[data-workspace-right-panel="true"]');
const sidebarResizer = page.getByRole("separator", { name: "Resize workspace sidebar" });
const canvasArea = page.locator('[data-workspace-canvas-area="true"]');
const canvasHost = page.locator('[data-workspace-canvas-host="true"]');
const splitArea = page.locator('[data-workspace-canvas-panel-split="true"]');
const toolBar = page.locator('[data-workspace-tool-bar="true"]');
const propertiesSection = sidebar.locator(".workspace-properties-scroll");
const aiSection = sidebar.locator(".workspace-ai-panel-shell");
const timeline = page.locator(".drawing-timeline");
type LayoutBox = { x: number; y: number; width: number; height: number; right: number; bottom: number };
const layoutBox = async (locator: Locator): Promise<LayoutBox> => {
  const box = await locator.boundingBox();
  assert.ok(box, "layout target has a browser box");
  return { ...box, right: box.x + box.width, bottom: box.y + box.height };
};
const readSidebarLayout = async () => ({
  panel: await layoutBox(sidebar),
  canvas: await layoutBox(canvasArea),
  split: await layoutBox(splitArea),
  properties: await layoutBox(propertiesSection),
  ai: await layoutBox(aiSection),
  timeline: await layoutBox(timeline),
});
const closeEnough = (actual: number, expected: number, tolerance = 1) => Math.abs(actual - expected) <= tolerance;
const authoringGeometry = async () => page.evaluate(() => {
  const readRect = (element: Element | null) => {
    if (!element) throw new Error("missing geometry element");
    const rect = element.getBoundingClientRect();
    const round = (value: number) => Math.round(value * 1_000) / 1_000;
    return { x: round(rect.x), y: round(rect.y), width: round(rect.width), height: round(rect.height), right: round(rect.right), bottom: round(rect.bottom) };
  };
  const host = document.querySelector('[data-workspace-canvas-host="true"]');
  const editable = document.querySelector('canvas[data-workspace-canvas="editable"]') as HTMLCanvasElement | null;
  if (!host || !editable) throw new Error("missing authoring surface");
  const editableRect = editable.getBoundingClientRect();
  const sampleClient = { x: editableRect.left + editableRect.width * 0.27, y: editableRect.top + editableRect.height * 0.61 };
  return {
    canvasArea: readRect(document.querySelector('[data-workspace-canvas-area="true"]')),
    canvasHost: readRect(host),
    stage: readRect(document.querySelector('[data-workspace-stage-guide="camera"]')),
    timeline: readRect(document.querySelector('.drawing-timeline')),
    toolbar: readRect(document.querySelector('[data-workspace-tool-bar="true"]')),
    pointerSample: {
      clientX: Math.round(sampleClient.x * 1_000) / 1_000,
      clientY: Math.round(sampleClient.y * 1_000) / 1_000,
      backingX: Math.round(((sampleClient.x - editableRect.left) * editable.width / editableRect.width) * 1_000) / 1_000,
      backingY: Math.round(((sampleClient.y - editableRect.top) * editable.height / editableRect.height) * 1_000) / 1_000,
    },
    surfaces: [...host.querySelectorAll("canvas, svg")].map((surface, index) => ({
      key: surface instanceof HTMLCanvasElement ? `canvas:${surface.dataset.workspaceCanvas ?? index}` : `svg:${surface.getAttribute("aria-label") ?? index}`,
      rect: readRect(surface),
      backing: surface instanceof HTMLCanvasElement ? { width: surface.width, height: surface.height } : null,
      viewBox: surface instanceof SVGSVGElement ? surface.getAttribute("viewBox") : null,
    })),
  };
});
type AuthoringGeometry = Awaited<ReturnType<typeof authoringGeometry>>;
const stableAuthoringGeometry = (geometry: AuthoringGeometry) => ({
  canvasArea: { y: geometry.canvasArea.y, width: geometry.canvasArea.width, height: geometry.canvasArea.height },
  canvasHost: { y: geometry.canvasHost.y, width: geometry.canvasHost.width, height: geometry.canvasHost.height },
  stage: { y: geometry.stage.y, width: geometry.stage.width, height: geometry.stage.height },
  timeline: geometry.timeline,
  pointerBackingSample: { x: geometry.pointerSample.backingX, y: geometry.pointerSample.backingY },
  surfaces: geometry.surfaces.map(surface => ({
    key: surface.key,
    rect: { y: surface.rect.y, width: surface.rect.width, height: surface.rect.height },
    backing: surface.backing,
    viewBox: surface.viewBox,
  })),
});
const stageCenterX = (geometry: AuthoringGeometry) => geometry.stage.x + geometry.stage.width / 2;
const visiblePaneCenterX = (layout: Awaited<ReturnType<typeof readSidebarLayout>>) => (layout.split.x + layout.panel.x) / 2;
const verifyStageCenter = (layout: Awaited<ReturnType<typeof readSidebarLayout>>, geometry: AuthoringGeometry, label: string) => {
  check(closeEnough(stageCenterX(geometry), visiblePaneCenterX(layout), 1), `${label}: white stage stays centered in the visible left workspace`);
};
const toolNames = ["Select", "Lasso", "Brush", "Eraser", "Fill", "Text", "Shape", "Knife"] as const;
const verifyToolBar = async (layout: Awaited<ReturnType<typeof readSidebarLayout>>, label: string) => {
  const bar = await layoutBox(toolBar);
  check(closeEnough(bar.right, layout.panel.x, 1), `${label}: toolbar right edge joins the sidebar left edge`);
  equal(await toolBar.locator('[data-workspace-tool]').count(), 8, `${label}: all eight toolbar buttons render`);
  for (const toolName of toolNames) {
    const button = page.getByRole("button", { name: toolName, exact: true });
    const buttonBox = await layoutBox(button);
    check(buttonBox.x >= bar.x - 1 && buttonBox.right <= bar.right + 1, `${label}: ${toolName} is fully visible inside the toolbar`);
    await button.click();
  }
  return bar;
};
const verifyBrushDrawUndo = async (label: string) => {
  await page.getByRole("button", { name: "Brush", exact: true }).click();
  const before = await canvasDigest(page);
  const host = await layoutBox(canvasHost);
  const startX = host.x + host.width * 0.24;
  const startY = host.y + host.height * 0.72;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + 32, startY + 10, { steps: 4 });
  await page.mouse.up();
  check((await canvasDigest(page)) !== before, `${label}: Brush maps to the moved canvas and commits one visible mutation`);
  await page.getByRole("button", { name: "Undo" }).click();
  equal(await canvasDigest(page), before, `${label}: one Undo restores the exact raster digest`);
};
const dragSidebar = async (deltaX: number) => {
  const box = await layoutBox(sidebarResizer);
  const startX = box.x + box.width / 2;
  const startY = box.y + Math.min(120, box.height / 2);
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + deltaX, startY, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(180);
};

const baselineSidebarLayout = await readSidebarLayout();
const baselineAuthoringGeometry = await authoringGeometry();
const baselineStableAuthoringGeometry = stableAuthoringGeometry(baselineAuthoringGeometry);
equal(Math.round(baselineSidebarLayout.panel.width), 420, "desktop right sidebar starts at the exact sensible default width");
check(closeEnough(baselineSidebarLayout.properties.right, baselineSidebarLayout.panel.right) && closeEnough(baselineSidebarLayout.ai.right, baselineSidebarLayout.panel.right), "Properties and AI sections share the full panel right edge at default width");
equal(await sidebarResizer.evaluate(element => getComputedStyle(element).cursor), "col-resize", "desktop separator exposes the column-resize cursor");
verifyStageCenter(baselineSidebarLayout, baselineAuthoringGeometry, "420px default");
const defaultToolBarBox = await verifyToolBar(baselineSidebarLayout, "420px default");
await verifyBrushDrawUndo("420px default");
await page.screenshot({ path: `${outputRoot}/sidebar-default.png`, fullPage: true });

const rightClickBox = await layoutBox(sidebarResizer);
await page.mouse.click(rightClickBox.x + rightClickBox.width / 2, rightClickBox.y + 100, { button: "right" });
await page.waitForTimeout(80);
equal(Math.round((await layoutBox(sidebar)).width), 420, "non-primary/right-button pointer input cannot begin a sidebar resize");

await dragSidebar(-180);
const wideSidebarLayout = await readSidebarLayout();
const wideAuthoringGeometry = await authoringGeometry();
equal(Math.round(wideSidebarLayout.panel.width), 520, "dragging the divider left enforces the exact 520px maximum sidebar width");
equal(stableAuthoringGeometry(wideAuthoringGeometry), baselineStableAuthoringGeometry, "520px sidebar preserves canvas/stage sizes, surface/backing sizes, pointer mapping, and timeline geometry");
check(closeEnough(stageCenterX(wideAuthoringGeometry) - stageCenterX(baselineAuthoringGeometry), -50, 1), "520px sidebar moves the unchanged stage left by half the 100px width delta");
verifyStageCenter(wideSidebarLayout, wideAuthoringGeometry, "520px maximum");
const wideToolBarBox = await verifyToolBar(wideSidebarLayout, "520px maximum");
check(wideToolBarBox.width < defaultToolBarBox.width, "520px sidebar compresses toolbar spacing without hiding tools");
await verifyBrushDrawUndo("520px maximum");
equal(digest(await projectStoreDigest(page)), digest(beforeStore), "520px centering/tool flows preserve exact persisted project bytes");
check(closeEnough(wideSidebarLayout.properties.width - baselineSidebarLayout.properties.width, 100, 2) && closeEnough(wideSidebarLayout.ai.width - baselineSidebarLayout.ai.width, 100, 2), "Properties and AI sections widen together by the same amount");
check(closeEnough(wideSidebarLayout.properties.right, wideSidebarLayout.ai.right) && closeEnough(wideSidebarLayout.ai.right, wideSidebarLayout.panel.right), "Properties and AI section right edges remain aligned after widening");
check(closeEnough(wideSidebarLayout.canvas.right - wideSidebarLayout.panel.x, 50, 2), "520px sidebar overlays 50px of the translated fixed-size canvas layer");
const sidebarCoveredPoint = { x: wideSidebarLayout.panel.x + 24, y: (await layoutBox(canvasHost)).y + 120 };
check(await page.evaluate(point => Boolean(document.elementFromPoint(point.x, point.y)?.closest('[data-workspace-right-panel="true"]')), sidebarCoveredPoint), "the widened sidebar is topmost over the canvas overlap");
const coveredSidebarRaster = await canvasDigest(page);
await page.mouse.click(sidebarCoveredPoint.x, sidebarCoveredPoint.y);
equal(await canvasDigest(page), coveredSidebarRaster, "a click in the sidebar-covered canvas region cannot leak through or draw");
await page.screenshot({ path: `${outputRoot}/sidebar-wide.png`, fullPage: true });

await dragSidebar(2_000);
const narrowSidebarLayout = await readSidebarLayout();
const narrowAuthoringGeometry = await authoringGeometry();
equal(Math.round(narrowSidebarLayout.panel.width), 280, "dragging right enforces the exact safe minimum sidebar width");
equal(stableAuthoringGeometry(narrowAuthoringGeometry), baselineStableAuthoringGeometry, "280px sidebar preserves canvas/stage sizes, surface/backing sizes, pointer mapping, and timeline geometry");
check(closeEnough(stageCenterX(narrowAuthoringGeometry) - stageCenterX(baselineAuthoringGeometry), 70, 1), "280px sidebar moves the unchanged stage right by half the 140px width delta");
verifyStageCenter(narrowSidebarLayout, narrowAuthoringGeometry, "280px minimum");
const narrowToolBarBox = await verifyToolBar(narrowSidebarLayout, "280px minimum");
check(narrowToolBarBox.width > defaultToolBarBox.width, "280px sidebar expands toolbar spacing without leaving a gap");
await verifyBrushDrawUndo("280px minimum");
equal(digest(await projectStoreDigest(page)), digest(beforeStore), "280px centering/tool flows preserve exact persisted project bytes");
check(closeEnough(narrowSidebarLayout.panel.x - narrowSidebarLayout.canvas.right, 70, 2), "280px sidebar reveals the expected 70px background gap after canvas recentering");
await page.screenshot({ path: `${outputRoot}/sidebar-narrow.png`, fullPage: true });

await dragSidebar(-2_000);
const maximumSidebarLayout = await readSidebarLayout();
equal(Math.round(maximumSidebarLayout.panel.width), 520, "dragging past the left limit remains clamped at the exact 520px maximum");
equal(await authoringGeometry(), wideAuthoringGeometry, "past-limit sidebar drag preserves the exact centered maximum geometry");

await dragSidebar(maximumSidebarLayout.panel.width - 430);
const snappedSidebarLayout = await readSidebarLayout();
equal(Math.round(snappedSidebarLayout.panel.width), 420, "dragging within the sixteen-pixel snap zone lands on the exact default width");
equal(await authoringGeometry(), baselineAuthoringGeometry, "420px snap restores the visual join without resizing the canvas");

const cancelledStart = await layoutBox(sidebarResizer);
await page.mouse.move(cancelledStart.x + cancelledStart.width / 2, cancelledStart.y + 100);
await page.mouse.down();
await page.mouse.move(cancelledStart.x - 36, cancelledStart.y + 100, { steps: 3 });
await sidebarResizer.dispatchEvent("pointercancel", { pointerId: 1, isPrimary: true, button: 0 });
const cancelledWidth = (await layoutBox(sidebar)).width;
await page.mouse.move(cancelledStart.x - 160, cancelledStart.y + 100, { steps: 3 });
await page.mouse.up();
check(closeEnough((await layoutBox(sidebar)).width, cancelledWidth), "pointer cancel ends the resize and blocks later pointer movement");
await sidebarResizer.dblclick();

const lostCaptureStart = await layoutBox(sidebarResizer);
await page.mouse.move(lostCaptureStart.x + lostCaptureStart.width / 2, lostCaptureStart.y + 100);
await page.mouse.down();
await page.mouse.move(lostCaptureStart.x - 36, lostCaptureStart.y + 100, { steps: 3 });
const releasedCapture = await sidebarResizer.evaluate(element => {
  if (!element.hasPointerCapture(1)) return false;
  element.releasePointerCapture(1);
  return true;
});
check(releasedCapture, "real drag owns pointer capture before lost-capture recovery");
const lostCaptureWidth = (await layoutBox(sidebar)).width;
await page.mouse.move(lostCaptureStart.x - 160, lostCaptureStart.y + 100, { steps: 3 });
await page.mouse.up();
check(closeEnough((await layoutBox(sidebar)).width, lostCaptureWidth), "lost pointer capture ends the resize and blocks later pointer movement");
await sidebarResizer.dblclick();

await sidebarResizer.focus();
await page.keyboard.press("ArrowLeft");
equal(Math.round((await layoutBox(sidebar)).width), 432, "ArrowLeft widens the focused separator by the accessible keyboard step");
await page.keyboard.press("ArrowRight");
equal(Math.round((await layoutBox(sidebar)).width), 420, "ArrowRight narrows the focused separator by the accessible keyboard step");
await page.keyboard.press("End");
equal(Math.round((await layoutBox(sidebar)).width), 520, "End moves the accessible separator to its exact maximum");
await page.keyboard.press("Home");
equal(Math.round((await layoutBox(sidebar)).width), 280, "Home moves the accessible separator to its safe minimum");
await page.keyboard.press("Enter");
equal(Math.round((await layoutBox(sidebar)).width), 420, "Enter resets the accessible separator to its exact default");
await page.keyboard.press("End");
await sidebarResizer.dblclick();
equal(Math.round((await layoutBox(sidebar)).width), 420, "double-click resets a non-default sidebar width");

await dragSidebar(-180);
for (const tab of ["Library", "Assets", "Properties"] as const) {
  await page.getByRole("button", { name: tab, exact: true }).click();
  equal(Math.round((await layoutBox(sidebar)).width), 520, `${tab} preserves the shared resized sidebar width`);
}
equal(await page.getByLabel("Message AI Animator").count(), 1, "AI chat composer remains visible and singular after resize and tab switching");
equal(capturedRequests.length, 0, "sidebar resizing and tab switching issue zero AI requests");

await page.setViewportSize({ width: 641, height: 844 });
await page.waitForTimeout(250);
const narrowDesktopSidebarLayout = await readSidebarLayout();
equal(Math.round(narrowDesktopSidebarLayout.canvas.width), 360, "a narrow desktop clamps the fixed canvas reservation to the effective default and preserves the protected 360px workspace");
equal(Math.round(narrowDesktopSidebarLayout.panel.width), 281, "a narrow desktop keeps the overlay within its dynamic safe maximum");

await page.setViewportSize({ width: 390, height: 844 });
await page.waitForTimeout(250);
const compactSidebarLayout = await readSidebarLayout();
const compactSidebarStyle = await sidebar.evaluate(element => {
  const style = getComputedStyle(element);
  return { flexBasis: style.flexBasis, borderLeft: style.borderLeftWidth, borderTop: style.borderTopWidth };
});
equal(Math.round(compactSidebarLayout.panel.width), Math.round(compactSidebarLayout.split.width), "compact layout keeps the existing full-width stacked right panel");
equal(compactSidebarStyle, { flexBasis: "200px", borderLeft: "0px", borderTop: "1px" }, "compact layout keeps its existing 200px stack basis and top-border geometry");
equal(await sidebar.locator('[data-workspace-right-panel-resizer="true"]').evaluate(element => getComputedStyle(element).display), "none", "desktop sidebar resizer is hidden and non-interactive at the compact breakpoint");
equal(Math.round((await layoutBox(toolBar)).width), Math.round(compactSidebarLayout.split.width), "compact layout keeps the toolbar full-width instead of applying the desktop panel subtraction");
for (const toolName of toolNames) {
  const buttonBox = await layoutBox(page.getByRole("button", { name: toolName, exact: true }));
  check(buttonBox.x >= -1 && buttonBox.right <= compactSidebarLayout.split.right + 1, `compact: ${toolName} stays fully visible`);
}
await page.screenshot({ path: `${outputRoot}/sidebar-compact.png`, fullPage: true });

await page.setViewportSize({ width: 1440, height: 900 });
await page.waitForTimeout(250);
await sidebarResizer.dblclick();
await page.waitForTimeout(180);
equal(Math.round((await layoutBox(sidebar)).width), 420, "desktop default is restored after compact layout without compact-state contamination");
equal(await canvasDigest(page), beforeCanvas, "sidebar resize cycles preserve exact raster canvas bytes after returning to default geometry");
equal(digest(await projectStoreDigest(page)), digest(beforeStore), "sidebar resize cycles preserve exact project repository bytes");
const sidebarFinalTimeline = await layoutBox(timeline);
check(closeEnough(sidebarFinalTimeline.x, baselineSidebarLayout.timeline.x) && closeEnough(sidebarFinalTimeline.y, baselineSidebarLayout.timeline.y) && closeEnough(sidebarFinalTimeline.width, baselineSidebarLayout.timeline.width) && closeEnough(sidebarFinalTimeline.height, baselineSidebarLayout.timeline.height), "timeline geometry remains exact after all drag, keyboard, tab, and compact resize flows");

const preExpansionGeometry = await authoringGeometry();
await page.getByRole("button", { name: "+ Layer", exact: true }).click();
await page.getByRole("button", { name: "+ Layer", exact: true }).click();
await page.waitForTimeout(180);
const expandedTimeline = page.locator('[data-timeline-panel="overlay"]');
const timelineResizeHandle = page.locator('[data-timeline-panel-resizer="true"]');
const expandedTimelineBox = await layoutBox(expandedTimeline);
const timelineRootBox = await layoutBox(timeline);
equal(await authoringGeometry(), preExpansionGeometry, "auto-expanding to three layers leaves canvas, stage, all surface/backing, pointer-map, toolbar, and reserved timeline geometry unchanged");
check(expandedTimelineBox.bottom > timelineRootBox.bottom + 70, "three-layer timeline expands downward as an overlay over the unchanged canvas");
await page.screenshot({ path: `${outputRoot}/timeline-expanded.png`, fullPage: true });
const overlayHandleBox = await layoutBox(timelineResizeHandle);
const overlayPoint = { x: overlayHandleBox.x + overlayHandleBox.width / 2, y: overlayHandleBox.y + overlayHandleBox.height / 2 };
check(await page.evaluate(point => Boolean(document.elementFromPoint(point.x, point.y)?.closest('[data-timeline-panel="overlay"]')), overlayPoint), "expanded timeline is topmost and intercepts its covered canvas region");
const overlayClickRaster = await canvasDigest(page);
await page.mouse.click(overlayPoint.x, overlayPoint.y);
equal(await canvasDigest(page), overlayClickRaster, "clicking the timeline overlay cannot leak through or draw on the canvas");

const overlayCells = expandedTimeline.locator('[data-timeline-cell="true"]');
const layerIds = [...new Set(await overlayCells.evaluateAll(elements => elements.map(element => element.getAttribute("data-layer-id")).filter((value): value is string => Boolean(value))))];
equal(layerIds.length, 3, "expanded timeline renders all three real layers");
const overlapLayerRow = expandedTimeline.locator(`[data-timeline-layer-row="${layerIds[1]}"]`);
const overlapLayerRowBox = await layoutBox(overlapLayerRow);
const timelineSidebarOverlapPoint = { x: baselineSidebarLayout.panel.x + 24, y: overlapLayerRowBox.y + overlapLayerRowBox.height / 2 };
check(await page.evaluate(point => Boolean(document.elementFromPoint(point.x, point.y)?.closest('[data-timeline-panel="overlay"]')), timelineSidebarOverlapPoint), "expanded timeline is topmost over the right sidebar at their physical overlap");
await page.mouse.click(timelineSidebarOverlapPoint.x, timelineSidebarOverlapPoint.y);
equal(await overlapLayerRow.locator('xpath=..').getAttribute("data-timeline-layer-active"), "true", "clicking the over-sidebar layer/frame cell activates that timeline layer");
const sourceCell = expandedTimeline.locator(`[data-timeline-cell="true"][data-layer-id="${layerIds[0]}"][data-frame-index="0"]`);
await sourceCell.click();
equal(await sourceCell.evaluate(element => element.getAttribute("data-layer-id")), layerIds[0], "representative layer selection targets the requested real layer");
await sourceCell.click({ button: "right" });
await page.getByRole("button", { name: "Copy Frame", exact: true }).click();
const sourceLayerRow = expandedTimeline.locator(`[data-timeline-layer-row="${layerIds[0]}"]`);
const sourceLayerRowBox = await layoutBox(sourceLayerRow);
await page.mouse.click(sourceLayerRowBox.x + 2 * 17 + 8, sourceLayerRowBox.y + sourceLayerRowBox.height / 2, { button: "right" });
await page.getByRole("button", { name: "Paste Frame", exact: true }).click();
await page.mouse.click(sourceLayerRowBox.x + 4 * 17 + 8, sourceLayerRowBox.y + sourceLayerRowBox.height / 2, { button: "right" });
await page.getByRole("button", { name: "Insert Frame", exact: true }).click();
await page.mouse.click(sourceLayerRowBox.x + 6 * 17 + 8, sourceLayerRowBox.y + sourceLayerRowBox.height / 2, { button: "right" });
await page.getByRole("button", { name: "Insert Keyframe", exact: true }).click();
await page.getByRole("button", { name: "Onion", exact: true }).click();
await page.getByRole("button", { name: "Onion", exact: true }).click();
await page.getByRole("button", { name: "Play", exact: true }).click();
await page.waitForTimeout(80);
await page.getByRole("button", { name: "Pause", exact: true }).click();
const timelineScrollbar = expandedTimeline.locator('input.timeline-bottom-scrollbar-slider');
await timelineScrollbar.evaluate((element: HTMLInputElement) => {
  element.value = "120";
  element.dispatchEvent(new Event("input", { bubbles: true }));
  element.dispatchEvent(new Event("change", { bubbles: true }));
});
equal(Number(await timelineScrollbar.inputValue()), 120, "horizontal timeline scrollbar remains operational in the overlay");

const dragTimelineResize = async (deltaY: number) => {
  const handle = await layoutBox(timelineResizeHandle);
  const x = handle.x + handle.width / 2;
  const y = handle.y + handle.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x, y + deltaY, { steps: 6 });
  await page.mouse.up();
  await page.waitForTimeout(120);
};
await dragTimelineResize(-30);
const partiallyCollapsedHeight = (await layoutBox(expandedTimeline)).height;
await dragTimelineResize(100);
const reexpandedHeight = (await layoutBox(expandedTimeline)).height;
check(reexpandedHeight > partiallyCollapsedHeight, "dragging the horizontal timeline handle down re-expands the overlay");
await dragTimelineResize(-200);
equal(Math.round((await layoutBox(expandedTimeline)).height), 66, "dragging the timeline handle up collapses to one row plus its overlay handle");
await page.screenshot({ path: `${outputRoot}/timeline-collapsed.png`, fullPage: true });
equal(await authoringGeometry(), preExpansionGeometry, "timeline expand, action, resize, and collapse flows never resize the authoring canvas or reserved desktop row");
await dragTimelineResize(100);
check((await layoutBox(expandedTimeline)).height > 100, "collapsed overlay can be expanded again with the existing handle");

await sidebarResizer.focus();
await page.keyboard.press("End");
const postTimelineSidebar = await readSidebarLayout();
const postTimelineCoveredPoint = { x: postTimelineSidebar.panel.x + 24, y: (await layoutBox(canvasHost)).y + 180 };
const preCoveredClickDigest = await canvasDigest(page);
await page.mouse.click(postTimelineCoveredPoint.x, postTimelineCoveredPoint.y);
equal(await canvasDigest(page), preCoveredClickDigest, "covered canvas clicks remain blocked after timeline interactions");
const preDrawDigest = await canvasDigest(page);
const uncoveredCanvasBox = await layoutBox(canvasHost);
await page.getByRole("button", { name: "Brush", exact: true }).click();
await page.mouse.move(uncoveredCanvasBox.x + uncoveredCanvasBox.width * 0.24, uncoveredCanvasBox.y + uncoveredCanvasBox.height * 0.72);
await page.mouse.down();
await page.mouse.move(uncoveredCanvasBox.x + uncoveredCanvasBox.width * 0.24 + 36, uncoveredCanvasBox.y + uncoveredCanvasBox.height * 0.72 + 12, { steps: 4 });
await page.mouse.up();
check((await canvasDigest(page)) !== preDrawDigest, "drawing in the uncovered canvas uses the preserved mapping and commits exactly one visible mutation");
await page.getByRole("button", { name: "Undo" }).click();
equal(await canvasDigest(page), preDrawDigest, "one undo restores the exact pre-draw raster digest");
equal(capturedRequests.length, 0, "all sidebar and timeline correction flows issue zero AI/provider requests");

// Keep the original one-layer AI persistence/reconnect proof isolated from the
// intentionally mutated three-layer layout/action fixture above.
await openNew(page);
beforeCanvas = await canvasDigest(page);
beforeStore = await projectStoreDigest(page);

await page.getByLabel("Message AI Animator").fill("presentation-hold");
const presentationSubmittedAt = Date.now();
await page.getByRole("button", { name: /^(Send|Send AI message)$/ }).click();
const presentationStatus = page.getByRole("status", { name: "AI Animator request status" });
await presentationStatus.waitFor();
equal((await presentationStatus.textContent())?.trim(), "Thinking", "presentation flow exposes only truthful Thinking");
const thinking = presentationStatus.locator(".ai-animator-thinking");
const presentationReply = page.locator("[data-ai-assistant-message]").last();
const revealingReply = page.locator('[data-ai-assistant-message][data-reveal-state="revealing"]').last();
const revealingReplyObserved = revealingReply.waitFor({ timeout: 30_000 });
const sweepContract = await thinking.evaluate(element => {
  const primary = getComputedStyle(element, "::before");
  const follow = getComputedStyle(element, "::after");
  const split = (value: string) => value.split(",").map(part => part.trim());
  const keyframePositions = (animationName: string) => {
    const animation = element.getAnimations({ subtree: true }).find(candidate => (candidate as CSSAnimation).animationName === animationName);
    if (!animation?.effect) return [];
    return (animation.effect as KeyframeEffect).getKeyframes().map(keyframe => {
      const values = keyframe as unknown as Record<string, unknown>;
      return Number.parseFloat(String(values.webkitMaskPositionX ?? values.maskPositionX ?? "NaN"));
    });
  };
  return {
    pattern: element.getAttribute("data-sweep-pattern"),
    primaryName: split(primary.animationName)[0],
    primaryVisibilityName: split(primary.animationName)[1],
    followName: split(follow.animationName)[0],
    followVisibilityName: split(follow.animationName)[1],
    primaryDuration: split(primary.animationDuration)[0],
    followDuration: split(follow.animationDuration)[0],
    primaryTiming: split(primary.animationTimingFunction)[0],
    primaryVisibilityTiming: split(primary.animationTimingFunction).slice(1).join(", "),
    followTiming: split(follow.animationTimingFunction)[0],
    followVisibilityTiming: split(follow.animationTimingFunction).slice(1).join(", "),
    primaryGradient: primary.backgroundImage,
    followGradient: follow.backgroundImage,
    primaryMaskSize: primary.webkitMaskSize,
    followMaskSize: follow.webkitMaskSize,
    primaryKeyframePositions: keyframePositions("ai-animator-sweep-primary"),
    followKeyframePositions: keyframePositions("ai-animator-sweep-follow"),
    baseColor: getComputedStyle(element).color,
  };
});
equal(sweepContract.pattern, "paired-continuous-long-pause", "Thinking declares the continuous paired sweep and long-pause contract");
equal(sweepContract.primaryName, "ai-animator-sweep-primary", "bright-blue primary sweep is active");
equal(sweepContract.followName, "ai-animator-sweep-follow", "cyan/deeper-blue follow sweep is distinct");
equal([sweepContract.primaryVisibilityName, sweepContract.followVisibilityName], ["ai-animator-sweep-primary-visibility", "ai-animator-sweep-follow-visibility"], "discrete visibility animations prevent any fractional overlap at handoff");
equal([sweepContract.primaryDuration, sweepContract.followDuration], ["3.75s", "3.75s"], "both sweeps share the exact 3.75-second cycle");
equal([sweepContract.primaryTiming, sweepContract.followTiming], ["linear", "linear"], "both sweeps use steady linear motion");
equal([sweepContract.primaryVisibilityTiming, sweepContract.followVisibilityTiming], ["steps(1)", "steps(1)"], "visibility switches discretely at the immediate handoff boundaries");
equal([sweepContract.primaryMaskSize, sweepContract.followMaskSize], ["57% 100%", "57% 100%"], "both highlights use a broad fifty-seven-percent mask");
check(Math.abs(sweepContract.primaryKeyframePositions[0] - MASK_TRAVEL_START_PERCENT) < 0.001 && Math.abs(sweepContract.primaryKeyframePositions.at(-1)! - MASK_TRAVEL_END_PERCENT) < 0.001, "primary keyframes run from fully outside left to fully outside right");
check(Math.abs(sweepContract.followKeyframePositions[0] - MASK_TRAVEL_START_PERCENT) < 0.001 && Math.abs(sweepContract.followKeyframePositions.at(-1)! - MASK_TRAVEL_END_PERCENT) < 0.001, "follow keyframes run from fully outside left to fully outside right");
const startOffsetRatio = (1 - MASK_BAND_RATIO) * MASK_TRAVEL_START_PERCENT / 100;
const endOffsetRatio = (1 - MASK_BAND_RATIO) * MASK_TRAVEL_END_PERCENT / 100;
check(Math.abs(startOffsetRatio + MASK_BAND_RATIO) < 0.000_01, "derived left endpoint places the entire fifty-seven-percent mask immediately outside the label");
check(Math.abs(endOffsetRatio - 1) < 0.000_01, "derived right endpoint places the entire fifty-seven-percent mask immediately outside the label");
check(sweepContract.primaryGradient.includes("rgb(47, 134, 255)") && sweepContract.primaryGradient.includes("rgb(169, 238, 255)") && sweepContract.followGradient.includes("rgb(16, 63, 130)") && sweepContract.followGradient.includes("rgb(72, 206, 231)"), "the primary and follow gradients are visibly distinct bright-blue and darker cyan/blue fills");
equal(sweepContract.baseColor, "rgba(255, 255, 255, 0.48)", "the quiet base Thinking text remains readable");
const seekSweep = (elapsedMs: number) => thinking.evaluate(async (element, requestedElapsedMs) => {
  element.classList.remove("ai-animator-thinking");
  void (element as HTMLElement).offsetWidth;
  element.classList.add("ai-animator-thinking");
  await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
  for (const animation of element.getAnimations({ subtree: true })) {
    animation.pause();
    animation.currentTime = requestedElapsedMs;
  }
  await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
}, elapsedMs);
const readSweepFrame = (pseudo: "::before" | "::after") => thinking.evaluate((element, requestedPseudo) => {
  const style = getComputedStyle(element, requestedPseudo);
  const rect = element.getBoundingClientRect();
  const maskSize = style.webkitMaskSize || style.maskSize;
  const bandPercent = Number.parseFloat(maskSize);
  return {
    primary: Number.parseFloat(getComputedStyle(element, "::before").opacity),
    follow: Number.parseFloat(getComputedStyle(element, "::after").opacity),
    position: style.webkitMaskPosition || style.maskPosition,
    duration: style.animationDuration.split(",")[0].trim(),
    labelWidthPx: rect.width,
    bandPercent,
    bandWidthPx: rect.width * bandPercent / 100,
  };
}, pseudo);
type SweepFrame = Awaited<ReturnType<typeof readSweepFrame>> & { bounds: Awaited<ReturnType<typeof renderedColorBounds>> };
const captureSweepFrame = async (pseudo: "::before" | "::after", elapsedMs: number, artifactName: string): Promise<SweepFrame> => {
  await seekSweep(elapsedMs);
  const frame = await readSweepFrame(pseudo);
  await page.screenshot({ path: `${outputRoot}/${artifactName}`, fullPage: true });
  return { ...frame, bounds: await renderedColorBounds(await thinking.screenshot()) };
};
const positionPercent = (frame: SweepFrame) => Number.parseFloat(frame.position);
const expectedPosition = (localElapsedMs: number) => MASK_TRAVEL_START_PERCENT + (MASK_TRAVEL_END_PERCENT - MASK_TRAVEL_START_PERCENT) * localElapsedMs / 1_000;
const assertFullTraversal = (frames: SweepFrame[], layer: "primary" | "follow", label: string) => {
  const positions = frames.map(positionPercent);
  const expected = TRAVEL_SAMPLE_TIMES_MS.map(expectedPosition);
  frames.forEach((frame, index) => {
    check(Math.abs(positions[index] - expected[index]) < 8, `${label}: ${["early", "center", "late"][index]} computed mask position follows the full-travel linear geometry`);
    const other = layer === "primary" ? frame.follow : frame.primary;
    check(frame[layer] >= 0.95 && other <= 0.05, `${label}: ${["early", "center", "late"][index]} sample isolates the intended sweep layer`);
  });
  check(frames[0].bounds.maxRatio < 0.48, `${label}: early highlighted pixels are confined to the left side`);
  check(frames[1].bounds.minRatio > 0.10 && frames[1].bounds.maxRatio > 0.55 && frames[1].bounds.maxRatio < 0.92, `${label}: center highlighted pixels cross the label midpoint without filling the label`);
  check(frames[2].bounds.minRatio > 0.52 && frames[2].bounds.maxRatio > 0.78, `${label}: late highlighted pixels are confined to the right side`);
  check(frames[0].bounds.maxRatio < frames[1].bounds.maxRatio && frames[1].bounds.minRatio < frames[2].bounds.minRatio, `${label}: actual highlighted pixels advance left-to-center-to-right with no persistent center band`);
};

const primaryFrames = [
  await captureSweepFrame("::before", 200, "thinking-primary-early.png"),
  await captureSweepFrame("::before", 500, "thinking-primary.png"),
  await captureSweepFrame("::before", 800, "thinking-primary-late.png"),
];
assertFullTraversal(primaryFrames, "primary", "primary sweep");
const primaryMid = primaryFrames[1];
check(primaryMid.bandPercent >= 50 && primaryMid.bandPercent <= 58, "primary highlight spans about half of the rendered label");
const primaryRenderedBandRatio = primaryMid.bounds.spanRatio;
check(primaryRenderedBandRatio >= 0.50 && primaryRenderedBandRatio <= 0.58, "primary centered pixels visibly span about half of the rendered label");

const followFrames = [
  await captureSweepFrame("::after", 1_200, "thinking-follow-early.png"),
  await captureSweepFrame("::after", 1_500, "thinking-follow.png"),
  await captureSweepFrame("::after", 1_800, "thinking-follow-late.png"),
];
assertFullTraversal(followFrames, "follow", "follow sweep");
const followMid = followFrames[1];
check(followMid.bandPercent >= 50 && followMid.bandPercent <= 58, "follow highlight spans about half of the rendered label");
const followRenderedBandRatio = followMid.bounds.spanRatio;
check(followRenderedBandRatio >= 0.50 && followRenderedBandRatio <= 0.58, "follow centered pixels visibly span about half of the rendered label");

const shortLabelWidthPx = primaryMid.labelWidthPx;
const longLabel = "Drawing frame by frame";
await thinking.evaluate((element, text) => { element.setAttribute("data-text", text); element.textContent = text; }, longLabel);
const longLabelFrames = [
  await captureSweepFrame("::before", 200, "thinking-long-label-early.png"),
  await captureSweepFrame("::before", 500, "thinking-long-label.png"),
  await captureSweepFrame("::before", 800, "thinking-long-label-late.png"),
];
assertFullTraversal(longLabelFrames, "primary", "long-label primary sweep");
const longLabelMid = longLabelFrames[1];
check(longLabelMid.labelWidthPx > shortLabelWidthPx * 2, "synthetic future status is materially longer than Thinking");
equal(longLabelMid.duration, "3.75s", "long synthetic status retains the fixed cycle and one-second primary window");
check(longLabelMid.bandPercent >= 50 && longLabelMid.bandPercent <= 58, "long synthetic status retains the same proportional broad gradient block");
check(longLabelMid.bandWidthPx > primaryMid.bandWidthPx * 2, "long synthetic status scales the broad band in pixels and therefore sweeps faster over the fixed one-second window");
const longLabelRenderedBandRatio = longLabelMid.bounds.spanRatio;
check(longLabelRenderedBandRatio >= 0.50 && longLabelRenderedBandRatio <= 0.58, "long synthetic status visibly retains the same broad proportional fill");
await thinking.evaluate(element => { element.setAttribute("data-text", "Thinking"); element.textContent = "Thinking"; });

await seekSweep(0);
await thinking.evaluate(element => { for (const animation of element.getAnimations({ subtree: true })) animation.play(); });
type SweepState = "primary" | "follow" | "empty" | "overlap";
const sweepSamples: Array<{ elapsedMs: number; primary: number; follow: number; state: SweepState }> = [];
const sweepStartedAt = Date.now();
while (Date.now() - sweepStartedAt <= 3_900) {
  const sample = await thinking.evaluate(element => ({
    primary: Number.parseFloat(getComputedStyle(element, "::before").opacity),
    follow: Number.parseFloat(getComputedStyle(element, "::after").opacity),
  }));
  const primaryVisible = sample.primary > 0.05;
  const followVisible = sample.follow > 0.05;
  sweepSamples.push({ ...sample, elapsedMs: Date.now() - sweepStartedAt, state: primaryVisible && followVisible ? "overlap" : primaryVisible ? "primary" : followVisible ? "follow" : "empty" });
  await page.waitForTimeout(25);
}
const sweepRuns: Array<{ state: SweepState; startMs: number; endMs: number; durationMs: number }> = [];
for (const sample of sweepSamples) {
  const current = sweepRuns.at(-1);
  if (!current || current.state !== sample.state) {
    sweepRuns.push({ state: sample.state, startMs: sample.elapsedMs, endMs: sample.elapsedMs + 25, durationMs: 25 });
  } else {
    current.endMs = sample.elapsedMs + 25;
    current.durationMs = current.endMs - current.startMs;
  }
}
const primaryRunIndex = sweepRuns.findIndex(run => run.state === "primary");
const primaryRun = sweepRuns[primaryRunIndex]!;
const followRun = sweepRuns[primaryRunIndex + 1]!;
const finalPauseRun = sweepRuns[primaryRunIndex + 2]!;
check(Boolean(primaryRun && followRun && finalPauseRun), "one complete primary-follow-long-pause sequence was measured");
equal([primaryRun.state, followRun.state, finalPauseRun.state], ["primary", "follow", "empty"], "measured sweep state order has an immediate handoff and no overlap");
check(primaryRun.durationMs >= 850 && primaryRun.durationMs <= 1_100, "primary visible interval is approximately one second");
check(followRun.durationMs >= 850 && followRun.durationMs <= 1_100, "follow visible interval is approximately one second");
const transitionGapMs = Math.max(0, followRun.startMs - primaryRun.endMs);
check(transitionGapMs <= 50, "primary hands off to follow within one animation frame without a deliberate empty gap");
check(finalPauseRun.durationMs >= 1_600 && finalPauseRun.durationMs <= 1_900, "final fully empty pause is approximately 1.75 seconds");
equal(sweepSamples.filter(sample => sample.state === "overlap").length, 0, "primary and follow highlights never overlap");
await revealingReplyObserved;
equal(await revealingReply.getAttribute("data-reveal-state"), "revealing", "new Terra reply enters the revealing state immediately");
await presentationStatus.waitFor({ state: "detached" });
const presentationStatusRemovalMs = Date.now() - lastTerminalFulfilledAt;
const slowThinkingVisibleMs = lastTerminalFulfilledAt - presentationSubmittedAt;
check(slowThinkingVisibleMs > 2_000, "naturally slow response keeps Thinking for its real duration beyond the minimum");
check(lastTerminalFulfilledAt > 0 && presentationStatusRemovalMs < 500, "naturally slow terminal response reveals immediately without added post-completion delay");
const assistantBoxStyle = await presentationReply.evaluate(element => {
  const style = getComputedStyle(element);
  return { background: style.backgroundColor, border: style.borderTopWidth, radius: style.borderRadius, padding: style.paddingTop };
});
equal(assistantBoxStyle, { background: "rgba(0, 0, 0, 0)", border: "0px", radius: "0px", padding: "0px" }, "Terra reply has no bubble background, border, radius, or padding");
const userBoxStyle = await page.locator("[data-ai-user-message]").last().evaluate(element => {
  const style = getComputedStyle(element);
  return { alignSelf: style.alignSelf, background: style.backgroundColor, border: style.borderTopWidth, padding: style.paddingTop };
});
check(userBoxStyle.alignSelf === "flex-end" && userBoxStyle.background !== "rgba(0, 0, 0, 0)" && userBoxStyle.border !== "0px" && userBoxStyle.padding !== "0px", "user message keeps its right-side chat bubble");
const leadingEdge = presentationReply.locator(".ai-animator-typewriter-edge");
await leadingEdge.waitFor();
const partialReveal = await presentationReply.locator("[data-ai-assistant-visual]").textContent();
check(Boolean(partialReveal) && partialReveal!.length < assistantReply("presentation-hold", "conversation").length, "new Terra reply begins as a fast progressive reveal");
const edgeStyle = await leadingEdge.evaluate(element => ({
  backgroundImage: getComputedStyle(element).backgroundImage,
  textFill: getComputedStyle(element).getPropertyValue("-webkit-text-fill-color"),
}));
check(edgeStyle.backgroundImage.includes("linear-gradient") && (edgeStyle.textFill === "transparent" || edgeStyle.textFill === "rgba(0, 0, 0, 0)"), "progressive reveal carries a cool blue/cyan leading edge");
await page.locator('[data-ai-assistant-message][data-reveal-state="complete"]').last().waitFor();
const presentationRevealMs = Date.now() - lastTerminalFulfilledAt;
check(presentationRevealMs < 1_200, "multi-line typewriter reveal completes quickly");
equal(await presentationReply.locator("[data-ai-assistant-visual]").textContent(), assistantReply("presentation-hold", "conversation"), "completed reveal preserves exact multi-line reply text");
equal(await presentationReply.locator(".ai-animator-sr-only").textContent(), `Terra: ${assistantReply("presentation-hold", "conversation")}`, "assistive technology receives one coherent full Terra reply");
await page.screenshot({ path: `${outputRoot}/presentation.png`, fullPage: true });

const observeFastTerminal = async (prompt: string, expected: RegExp) => {
  await page.getByLabel("Message AI Animator").fill(prompt);
  const submittedAt = Date.now();
  await page.getByRole("button", { name: /^(Send|Send AI message)$/ }).click();
  const status = page.getByRole("status", { name: "AI Animator request status" });
  await status.waitFor();
  const statusStartedAt = Date.now();
  const statusThinking = status.locator(".ai-animator-thinking");
  const travelPositions = { primary: [] as number[], follow: [] as number[] };
  for (const targetMs of [200, 500, 800, 1_200, 1_500, 1_800]) {
    await page.waitForTimeout(Math.max(0, targetMs - (Date.now() - statusStartedAt)));
    const layer = targetMs < 1_000 ? "primary" : "follow";
    const sample = await statusThinking.evaluate((element, requestedLayer) => {
      const pseudo = requestedLayer === "primary" ? "::before" : "::after";
      return {
        primary: Number.parseFloat(getComputedStyle(element, "::before").opacity),
        follow: Number.parseFloat(getComputedStyle(element, "::after").opacity),
        position: Number.parseFloat(getComputedStyle(element, pseudo).webkitMaskPosition || getComputedStyle(element, pseudo).maskPosition),
      };
    }, layer);
    const localElapsedMs = targetMs % 1_000;
    check(Math.abs(sample.position - expectedPosition(localElapsedMs)) < 18, `${prompt}: ${layer} ${localElapsedMs}ms position demonstrates the same complete off-label traversal`);
    check(sample[layer] >= 0.95 && sample[layer === "primary" ? "follow" : "primary"] <= 0.05, `${prompt}: ${layer} ${localElapsedMs}ms sample remains visible and isolated`);
    travelPositions[layer].push(sample.position);
  }
  check(travelPositions.primary[0] < 0 && travelPositions.primary[1] > 30 && travelPositions.primary[2] > 120, `${prompt}: primary sweep is observed entering left, crossing center, and exiting right`);
  check(travelPositions.follow[0] < 0 && travelPositions.follow[1] > 30 && travelPositions.follow[2] > 120, `${prompt}: follow sweep is observed entering left, crossing center, and exiting right`);
  check(lastTerminalFulfilledAt - submittedAt < 1_000, `${prompt}: intercepted pretend terminal result arrived quickly`);
  const reply = page.locator("[data-ai-assistant-message]").filter({ hasText: expected }).last();
  equal(await reply.count(), 0, `${prompt}: terminal message stays hidden while the two-sweep minimum is active`);
  equal(await page.getByText(expected).count(), 0, `${prompt}: no terminal text leaks elsewhere ahead of the minimum presentation`);
  await reply.waitFor();
  const thinkingVisibleMs = Date.now() - submittedAt;
  check(thinkingVisibleMs >= 1_980 && thinkingVisibleMs <= 2_600, `${prompt}: Thinking remains visible for the exact two-second minimum within browser scheduling tolerance`);
  await status.waitFor({ state: "detached" });
  return { thinkingVisibleMs, primaryObserved: true, followObserved: true, travelPositions };
};

const fastSuccess = await observeFastTerminal("fast-success", /fast local response waited for both Thinking sweeps/i);
const fastFailure = await observeFastTerminal("fast-provider-failure", /Pretend provider failed\. No animation changed\./);

await send(page, "hello", /Hello! I’m Terra/);
await send(page, "Hi, this is a test. Can you respond back?", /test message came through clearly/);
await send(page, "You're Terra, right?", /remember that this started as a quick response test/);
await send(page, "What color pairs well with deep blue?", /Warm gold, coral, or a pale cyan/);
await send(page, "Could we brainstorm three funny ways an alien might miss a bus?", /Three directions/);
await send(page, "Please animate a stick figure dodging two shurikens.", /No animation was changed/);
await send(page, "Change the current animation so the landing happens more slowly.", /safe edit plan/);
await send(page, "Make it better.", /Which exact part should I change/);
equal(await canvasDigest(page), beforeCanvas, "all conversation/create/edit/clarify flows preserve exact canvas bytes");
equal(digest(await projectStoreDigest(page)), digest(beforeStore), "all AI flows preserve exact project repository bytes");

for (const option of ["Low", "Medium", "High", "Extra High"]) {
  await page.getByRole("button", { name: /^Reasoning:/ }).click();
  await page.getByRole("menuitemradio", { name: option, exact: true }).click();
  await send(page, `Reasoning probe ${option}`, new RegExp(`received the reasoning probe ${option.toLowerCase()}`));
}
const lastFour = capturedRequests.slice(-4);
equal(lastFour.map(request => request.reasoningLevel), ["low", "medium", "high", "extra-high"], "all four visible reasoning choices reach the request exactly");
check(lastFour.every(request => !Object.hasOwn(request, "taskType") && !Object.hasOwn(request, "shouldSearch")), "task/search routing fields are absent from requests");
check(capturedRequests.every(request => JSON.stringify(request).length < 30_000 && !JSON.stringify(request).includes("bitmap") && !JSON.stringify(request).includes("dataUrl")), "request projection is bounded text and minimal metadata only");

await page.getByLabel("Message AI Animator").fill("cancel-hold");
await page.getByRole("button", { name: /^(Send|Send AI message)$/ }).click();
const cancellationStatus = page.getByRole("status", { name: "AI Animator request status" });
await cancellationStatus.waitFor();
const cancellationStartedAt = Date.now();
await page.getByRole("button", { name: /^Cancel AI Animator job/ }).click();
await page.locator("[data-ai-assistant-message]").filter({ hasText: "Cancelled. No animation changed." }).last().waitFor();
const cancellationRevealMs = Date.now() - cancellationStartedAt;
check(cancellationRevealMs < 500, "cancellation bypasses the two-second minimum and reveals immediately");
await cancellationStatus.waitFor({ state: "detached" });

await page.getByRole("button", { name: "File", exact: true }).click();
await page.getByRole("menuitem", { name: "Save", exact: true }).click();
await page.getByText("Saved on this browser", { exact: true }).waitFor({ timeout: 60_000 });
await page.getByLabel("Message AI Animator").fill("reload-hold");
await page.getByRole("button", { name: /^(Send|Send AI message)$/ }).click();
await page.getByRole("status", { name: "AI Animator request status" }).waitFor();
await page.reload();
await page.getByRole("button", { name: /^Open Project/ }).click();
await page.getByRole("button", { name: "Open Untitled Project", exact: true }).click();
await page.getByLabel("Message AI Animator").waitFor();
const reconnectReadyAt = Date.now();
await page.locator("[data-ai-assistant-message]").filter({ hasText: "I reconnected to the same project-bound request after reload." }).last().waitFor();
const reconnectTerminalRevealMs = Date.now() - reconnectReadyAt;
check(reconnectTerminalRevealMs < 1_500, "reconnected old job does not replay the new-submit two-second minimum");
check((await page.locator("[data-ai-assistant-message]").filter({ hasText: "Hello! I’m Terra. Nice to meet you—what would you like to talk through?" }).count()) === 1, "transcript persists across reload");
check(await page.locator('[data-ai-assistant-message][data-reveal-state="revealing"]').count() === 0, "persisted transcript does not replay old typewriter reveals after reload");

await page.getByRole("button", { name: /^Reasoning:/ }).click();
await page.getByRole("menuitemradio", { name: "Extra High", exact: true }).click();
await page.goto(url);
await page.getByRole("button", { name: /^New Project/ }).click();
await page.getByLabel("Message AI Animator").waitFor();
equal(await page.getByRole("button", { name: "Reasoning: Medium" }).count(), 1, "another New resets reasoning to Medium");
equal(await page.locator("[data-ai-assistant-message]").filter({ hasText: "Hello! I’m Terra. Nice to meet you—what would you like to talk through?" }).count(), 0, "new project does not expose prior transcript");

await page.setViewportSize({ width: 390, height: 844 });
await page.evaluate(() => { document.documentElement.style.zoom = "2"; });
const overflow = await page.evaluate(() => ({ width: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
check(overflow.width <= overflow.client + 2, "compact 200% zoom has no horizontal page overflow");
await page.evaluate(() => { document.documentElement.style.zoom = ""; });
const compactComposer = await page.getByLabel("Message AI Animator").boundingBox();
check(compactComposer && compactComposer.y >= 0 && compactComposer.y + compactComposer.height <= 844, "compact composer is fully visible above the toolbar");
await page.screenshot({ path: `${outputRoot}/compact.png`, fullPage: true });
await page.setViewportSize({ width: 1440, height: 900 });
await page.screenshot({ path: `${outputRoot}/desktop.png`, fullPage: true });

const reducedContext = await browser.newContext({ viewport: { width: 1024, height: 768 }, reducedMotion: "reduce" });
await reducedContext.addInitScript(() => localStorage.setItem("da_welcome_seen", "1"));
await installRoutes(reducedContext);
const reducedPage = await reducedContext.newPage();
reducedPage.on("pageerror", error => errors.push(`reduced-page:${error.message}`));
reducedPage.on("console", message => { if (message.type() === "error") errors.push(`reduced-console:${message.text()}`); });
await openNew(reducedPage);
await reducedPage.getByLabel("Message AI Animator").fill("hello");
await reducedPage.getByRole("button", { name: /^(Send|Send AI message)$/ }).click();
const reducedStatus = reducedPage.getByRole("status", { name: "AI Animator request status" });
await reducedStatus.waitFor();
equal((await reducedStatus.textContent())?.trim(), "Thinking", "reduced motion preserves readable Thinking");
const reducedSweepDisplays = await reducedPage.locator(".ai-animator-thinking").evaluate(element => [getComputedStyle(element, "::before").display, getComputedStyle(element, "::after").display]);
equal(reducedSweepDisplays, ["none", "none"], "reduced motion removes both paired sweeps");
const reducedReply = reducedPage.locator("[data-ai-assistant-message]").last();
await reducedReply.waitFor();
const reducedVisualDisplay = await reducedReply.locator("[data-ai-assistant-visual]").evaluate(element => getComputedStyle(element).display);
equal(reducedVisualDisplay, "none", "reduced motion disables the visual typewriter path");
const reducedCopy = await reducedReply.locator(".ai-animator-reduced-copy").evaluate(element => ({ display: getComputedStyle(element).display, text: element.textContent }));
equal(reducedCopy, { display: "inline", text: assistantReply("hello", "conversation") }, "reduced motion exposes the full readable reply immediately");
await reducedContext.close();

equal(externalRequests, [], "browser made zero external/provider/search requests");
equal(errors, [], "browser recorded zero page/console errors");
await browser.close();
const result = {
  status: "PASS", assertions, capturedRequests: capturedRequests.length,
  intents: capturedRequests.map(request => ({ message: request.message, reasoningLevel: request.reasoningLevel })),
  externalRequests, errors,
  screenshots: ["sidebar-default.png", "sidebar-wide.png", "sidebar-narrow.png", "sidebar-compact.png", "timeline-expanded.png", "timeline-collapsed.png", "thinking-primary-early.png", "thinking-primary.png", "thinking-primary-late.png", "thinking-follow-early.png", "thinking-follow.png", "thinking-follow-late.png", "thinking-long-label-early.png", "thinking-long-label.png", "thinking-long-label-late.png", "presentation.png", "compact.png", "desktop.png"],
  canvasDigest: beforeCanvas, projectStoreDigest: digest(beforeStore),
  sidebarResize: {
    defaultWidthPx: baselineSidebarLayout.panel.width,
    wideWidthPx: wideSidebarLayout.panel.width,
    minimumWidthPx: narrowSidebarLayout.panel.width,
    maximumWidthPx: maximumSidebarLayout.panel.width,
    snappedWidthPx: snappedSidebarLayout.panel.width,
    minimumWorkspaceWidthPx: narrowDesktopSidebarLayout.canvas.width,
    timelineBefore: baselineSidebarLayout.timeline,
    timelineAfter: sidebarFinalTimeline,
    propertiesWideWidthPx: wideSidebarLayout.properties.width,
    aiWideWidthPx: wideSidebarLayout.ai.width,
    compactPanelWidthPx: compactSidebarLayout.panel.width,
    compactSplitWidthPx: compactSidebarLayout.split.width,
    compactFlexBasis: compactSidebarStyle.flexBasis,
    compactBorderLeft: compactSidebarStyle.borderLeft,
    compactBorderTop: compactSidebarStyle.borderTop,
    rightClickRejected: true,
    pointerCancelRecovered: true,
    lostPointerCaptureRecovered: true,
    keyboardResizePassed: true,
    doubleClickResetPassed: true,
    tabWidthPersistencePassed: true,
    rasterDigestPreserved: true,
    projectDigestPreserved: true,
    canvasGeometryPreserved: true,
    overlayClickThroughBlocked: true,
    defaultStageCenterPx: stageCenterX(baselineAuthoringGeometry),
    minimumStageCenterPx: stageCenterX(narrowAuthoringGeometry),
    maximumStageCenterPx: stageCenterX(wideAuthoringGeometry),
    defaultVisiblePaneCenterPx: visiblePaneCenterX(baselineSidebarLayout),
    minimumVisiblePaneCenterPx: visiblePaneCenterX(narrowSidebarLayout),
    maximumVisiblePaneCenterPx: visiblePaneCenterX(wideSidebarLayout),
    defaultToolBarRightPx: defaultToolBarBox.right,
    minimumToolBarRightPx: narrowToolBarBox.right,
    maximumToolBarRightPx: wideToolBarBox.right,
    allToolsVisibleAndClickable: true,
    drawUndoAtAllWidthsPassed: true,
    aiRequests: 0,
  },
  timelineOverlay: {
    layerCount: layerIds.length,
    reservedHeightPx: timelineRootBox.height,
    expandedHeightPx: expandedTimelineBox.height,
    partiallyCollapsedHeightPx: partiallyCollapsedHeight,
    reexpandedHeightPx: reexpandedHeight,
    collapsedHeightPx: 66,
    canvasGeometryPreserved: true,
    overlayClickThroughBlocked: true,
    layerSelectionPassed: true,
    frameInsertPassed: true,
    keyframeInsertPassed: true,
    copyPastePassed: true,
    onionPassed: true,
    playbackPassed: true,
    horizontalScrollPassed: true,
    drawUndoPassed: true,
    aboveSidebarPassed: true,
    aiRequests: 0,
  },
  presentation: {
    sweepPattern: sweepContract.pattern,
    sweepOrder: [sweepContract.primaryName, sweepContract.followName],
    cycleDurationMs: 3_750,
    timingFunctions: [sweepContract.primaryTiming, sweepContract.followTiming],
    broadGradientBandPercent: primaryMid.bandPercent,
    maskTravelStartPercent: MASK_TRAVEL_START_PERCENT,
    maskTravelEndPercent: MASK_TRAVEL_END_PERCENT,
    maskStartOffsetRatio: startOffsetRatio,
    maskEndOffsetRatio: endOffsetRatio,
    primaryTravelPositions: primaryFrames.map(positionPercent),
    followTravelPositions: followFrames.map(positionPercent),
    longLabelTravelPositions: longLabelFrames.map(positionPercent),
    primaryRenderedBounds: primaryFrames.map(frame => frame.bounds),
    followRenderedBounds: followFrames.map(frame => frame.bounds),
    longLabelRenderedBounds: longLabelFrames.map(frame => frame.bounds),
    primaryVisibleMs: primaryRun.durationMs,
    transitionGapMs,
    followVisibleMs: followRun.durationMs,
    finalPauseMs: finalPauseRun.durationMs,
    overlapSamples: 0,
    primaryMidOpacity: primaryMid.primary,
    followMidOpacity: followMid.follow,
    primaryMidPosition: primaryMid.position,
    followMidPosition: followMid.position,
    primaryBandWidthPx: primaryMid.bandWidthPx,
    followBandWidthPx: followMid.bandWidthPx,
    primaryRenderedBandRatio,
    followRenderedBandRatio,
    shortLabelWidthPx,
    longLabelWidthPx: longLabelMid.labelWidthPx,
    longLabelBandWidthPx: longLabelMid.bandWidthPx,
    longLabelRenderedBandRatio,
    longLabelDuration: longLabelMid.duration,
    minimumThinkingMs: 2_000,
    fastSuccessThinkingMs: fastSuccess.thinkingVisibleMs,
    fastFailureThinkingMs: fastFailure.thinkingVisibleMs,
    fastSuccessSweepsObserved: [fastSuccess.primaryObserved, fastSuccess.followObserved],
    fastFailureSweepsObserved: [fastFailure.primaryObserved, fastFailure.followObserved],
    fastSuccessTravelPositions: fastSuccess.travelPositions,
    fastFailureTravelPositions: fastFailure.travelPositions,
    slowThinkingVisibleMs,
    slowTerminalRevealDelayMs: presentationStatusRemovalMs,
    cancellationRevealMs,
    reconnectTerminalRevealMs,
    persistedTerminalHoldReplayed: false,
    statusRemovalMs: presentationStatusRemovalMs,
    revealMs: presentationRevealMs,
    assistantStyle: assistantBoxStyle,
    userBubblePreserved: true,
    leadingGradient: edgeStyle.backgroundImage,
    coherentAccessibleReply: true,
    persistedRepliesReplay: false,
    reducedSweepDisplays,
    reducedVisualDisplay,
    reducedCopyDisplay: reducedCopy.display,
  },
};
writeFileSync(`${outputRoot}/browser-result.json`, `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify(result));
