import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { chromium, type Page, type Route } from "playwright-core";

const url = process.argv.find(argument => argument.startsWith("--url="))?.slice(6) ?? "http://127.0.0.1:57200/";
assert.match(url, /^http:\/\/127\.0\.0\.1:[0-9]+\/$/);
const origin = new URL(url).origin;
const outputRoot = "output/spec-0009/phase-1/correction";
mkdirSync(outputRoot, { recursive: true });

let assertions = 0;
const check = (value: unknown, label: string) => { assertions += 1; assert.ok(value, label); };
const equal = (actual: unknown, expected: unknown, label: string) => { assertions += 1; assert.deepEqual(actual, expected, label); };
const close = (actual: number, expected: number, tolerance: number, label: string) => {
  assertions += 1;
  assert.ok(Math.abs(actual - expected) <= tolerance, `${label}: ${actual} vs ${expected}`);
};

const errors: string[] = [];
const externalRequests: string[] = [];
const capturedTerraRequests: unknown[] = [];
const terraJobs = new Map<string, Record<string, unknown>>();
const now = () => new Date().toISOString();
const digest = (value: string) => createHash("sha256").update(value).digest("hex");

const terraSnapshot = (request: Record<string, unknown>, done: boolean) => {
  const createdAt = now();
  const jobId = String(request.jobId);
  const projectId = String((request.workspace as { projectId?: unknown })?.projectId ?? "");
  const reasoningLevel = String(request.reasoningLevel ?? "medium");
  const effort = reasoningLevel === "extra-high" ? "xhigh" : reasoningLevel;
  const events = done
    ? [
        { sequence: 1, status: "thinking", createdAt },
        {
          sequence: 2,
          status: "done",
          createdAt,
          reply: {
            intent: "conversation",
            reply: "Hello! I’m Terra. It’s nice to meet you—what would you like to talk through?",
            focusedQuestion: null,
            planSummary: null,
          },
          provider: {
            requestedModel: "gpt-5.6-terra",
            providerModel: "gpt-5.6-terra",
            responseId: `no-cost-double-${jobId}`,
            usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0, estimatedCostUsd: 0 },
            latencyMs: 1,
            promptDigest: digest(String(request.message)),
          },
        },
      ]
    : [{ sequence: 1, status: "thinking", createdAt }];
  return {
    version: 1,
    jobId,
    turnId: String(request.turnId),
    projectId,
    projectGeneration: Number((request.workspace as { projectGeneration?: unknown })?.projectGeneration ?? 0),
    reasoningLevel,
    intent: done ? "conversation" : null,
    status: done ? "done" : "thinking",
    lastSequence: events.length,
    createdAt,
    updatedAt: createdAt,
    completedAt: done ? createdAt : null,
    telemetry: {
      model: "gpt-5.6-terra",
      effort,
      outcome: done ? "succeeded" : "active",
      latencyMs: done ? 1 : null,
      promptDigest: digest(String(request.message)),
      usage: done
        ? { inputTokens: 0, outputTokens: 0, totalTokens: 0, estimatedCostUsd: 0 }
        : { inputTokens: null, outputTokens: null, totalTokens: null, estimatedCostUsd: null },
    },
    events,
  };
};

const routeTerra = async (route: Route) => {
  const request = route.request();
  const requestUrl = new URL(request.url());
  if (request.method() === "POST") {
    const body = request.postDataJSON() as Record<string, unknown>;
    capturedTerraRequests.push(body);
    terraJobs.set(String(body.jobId), body);
    await route.fulfill({ status: 202, contentType: "application/json", body: JSON.stringify(terraSnapshot(body, false)) });
    return;
  }
  const body = terraJobs.get(requestUrl.searchParams.get("jobId") ?? "");
  if (!body) {
    await route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ error: "missing test job" }) });
    return;
  }
  await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(terraSnapshot(body, true)) });
};

type CanvasStats = { count: number; centroidX: number; centroidY: number; width: number; height: number; sha256: string };
const canvasStats = async (page: Page, selector: string, transparent: boolean): Promise<CanvasStats> =>
  page.locator(selector).evaluate(async (element, useTransparency) => {
    const canvas = element as HTMLCanvasElement;
    const pixels = canvas.getContext("2d")!.getImageData(0, 0, canvas.width, canvas.height).data;
    let count = 0; let sumX = 0; let sumY = 0;
    for (let y = 0; y < canvas.height; y += 1) for (let x = 0; x < canvas.width; x += 1) {
      const offset = (y * canvas.width + x) * 4;
      const painted = useTransparency
        ? pixels[offset + 3] > 24
        : pixels[offset + 3] > 24 && (pixels[offset] < 205 || pixels[offset + 1] < 205 || pixels[offset + 2] < 205);
      if (!painted) continue;
      count += 1; sumX += x; sumY += y;
    }
    const hash = await crypto.subtle.digest("SHA-256", pixels as Uint8ClampedArray<ArrayBuffer>);
    return {
      count,
      centroidX: count ? sumX / count : -1,
      centroidY: count ? sumY / count : -1,
      width: canvas.width,
      height: canvas.height,
      sha256: [...new Uint8Array(hash)].map(value => value.toString(16).padStart(2, "0")).join(""),
    };
  }, transparent);

const visibleStageCoordinate = (centroid: number, extent: number) =>
  (centroid / extent - (4.6 - 1) / (2 * 4.6)) * 4.6;

const browser = await chromium.launch({
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: !process.argv.includes("--headed"),
  args: ["--disable-background-networking", "--disable-component-update", "--disable-sync", "--disable-extensions", "--no-first-run"],
});
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await context.addInitScript(() => localStorage.setItem("da_welcome_seen", "1"));
await context.route("**/*", async route => {
  const requestUrl = new URL(route.request().url());
  if (requestUrl.origin === origin && requestUrl.pathname === "/api/ai-animator") return routeTerra(route);
  if (requestUrl.origin === origin || requestUrl.protocol === "data:" || requestUrl.protocol === "blob:") return route.continue();
  externalRequests.push(route.request().url());
  return route.abort();
});
const page = await context.newPage();
page.setDefaultTimeout(20_000);
page.on("pageerror", error => errors.push(`page:${error.message}`));
page.on("console", message => { if (message.type() === "error") errors.push(`console:${message.text()}`); });

await page.goto(url);
await page.getByRole("button", { name: /^New Project/ }).click();
const editable = page.locator('canvas[data-workspace-canvas="editable"]');
await editable.waitFor();

await page.getByRole("button", { name: "File" }).click();
await page.getByRole("menuitem", { name: "Save As" }).click();
const saveDialog = page.getByRole("dialog", { name: "Save project as" });
await saveDialog.waitFor();
equal(await saveDialog.getByLabel("Project name").inputValue(), "Untitled Project", "Save As starts with the current title");
equal(await saveDialog.getByLabel("Project name").evaluate(element => element === document.activeElement), true, "Save As name receives focus");
await saveDialog.getByLabel("Project name").fill("   ");
await saveDialog.getByRole("button", { name: "Save copy" }).click();
await saveDialog.getByRole("alert").waitFor();
equal((await saveDialog.getByRole("alert").textContent())?.trim(), "Enter a project name.", "blank Save As is rejected accessibly");
await saveDialog.getByRole("button", { name: "Cancel" }).click();
equal(await page.getByText("Untitled Project", { exact: true }).count(), 1, "Cancel leaves the current title unchanged");

await page.getByRole("button", { name: "File" }).click();
await page.getByRole("menuitem", { name: "Save As" }).click();
await page.getByRole("dialog", { name: "Save project as" }).getByLabel("Project name").fill("SPEC-0009 Raster Parity");
await page.getByRole("dialog", { name: "Save project as" }).getByRole("button", { name: "Save copy" }).click();
await page.getByText("Saved on this browser", { exact: true }).waitFor();
check(await page.getByText("SPEC-0009 Raster Parity", { exact: true }).count() >= 1, "valid Save As updates the visible project title");
equal(await page.getByRole("dialog", { name: "Save project as" }).count(), 0, "successful Save As closes the dialog");

await page.getByRole("button", { name: "Brush", exact: true }).last().click();
const canvasBox = await editable.boundingBox();
assert.ok(canvasBox);
await page.mouse.move(canvasBox.x + canvasBox.width * 0.47, canvasBox.y + canvasBox.height * 0.40);
await page.mouse.down();
await page.mouse.move(canvasBox.x + canvasBox.width * 0.53, canvasBox.y + canvasBox.height * 0.60, { steps: 10 });
await page.mouse.up();

let cells = page.locator('[data-timeline-cell="true"]');
await cells.nth(0).click({ button: "right" });
await page.getByRole("button", { name: "Insert Frame" }).click();
await page.waitForFunction(() => document.querySelectorAll('[data-timeline-cell="true"]').length >= 2);
cells = page.locator('[data-timeline-cell="true"]');
await cells.nth(1).click({ button: "right" });
await page.getByRole("button", { name: "Insert Blank Keyframe" }).click();
await page.waitForFunction(() => document.querySelectorAll('[data-timeline-cell="true"]').length >= 3);
await page.mouse.move(canvasBox.x + canvasBox.width * 0.55, canvasBox.y + canvasBox.height * 0.43);
await page.mouse.down();
await page.mouse.move(canvasBox.x + canvasBox.width * 0.59, canvasBox.y + canvasBox.height * 0.59, { steps: 10 });
await page.mouse.up();

await page.getByRole("button", { name: "File" }).click();
await page.getByRole("menuitem", { name: "Save", exact: true }).click();
await page.getByText("Saved on this browser", { exact: true }).waitFor();

cells = page.locator('[data-timeline-cell="true"]');
await cells.nth(0).click(); await page.waitForTimeout(80);
const workspaceFrame0 = await canvasStats(page, 'canvas[data-workspace-canvas="editable"]', true);
await cells.nth(1).click(); await page.waitForTimeout(80);
const workspaceFrame1 = await canvasStats(page, 'canvas[data-workspace-canvas="editable"]', true);
await cells.nth(2).click(); await page.waitForTimeout(80);
const workspaceFrame2 = await canvasStats(page, 'canvas[data-workspace-canvas="editable"]', true);
check(workspaceFrame0.count > 20, "workspace frame 1 contains the drawn raster");
equal(workspaceFrame1.sha256, workspaceFrame0.sha256, "workspace hold frame is byte-identical to its owner");
check(workspaceFrame2.count > 20 && workspaceFrame2.sha256 !== workspaceFrame0.sha256, "workspace later keyframe contains a different raster position");

await page.getByRole("button", { name: "File" }).click();
await page.getByRole("menuitem", { name: "Export…" }).click();
await page.getByRole("main", { name: "Choose a saved animation to export" }).waitFor();
const card = page.getByRole("button", { name: /SPEC-0009 Raster Parity/ });
await card.waitFor();
await page.waitForFunction(() => document.querySelectorAll('canvas[aria-label$="thumbnail"]').length > 0);
const thumbnail = await canvasStats(page, 'canvas[aria-label$="thumbnail"]', false);
check(thumbnail.count > 20, "chooser thumbnail contains the saved drawn raster");
await page.screenshot({ path: `${outputRoot}/chooser-raster.png`, fullPage: true });
await card.click();
await page.getByRole("button", { name: "Use this animation" }).click();
const playerCanvas = page.locator('canvas[aria-label="Selected saved animation"]');
await playerCanvas.waitFor();
const scrubber = page.getByRole("slider", { name: "Animation position" });
const exportFrames: CanvasStats[] = [];
for (const index of [0, 1, 2]) {
  await scrubber.fill(String(index));
  await page.waitForTimeout(120);
  exportFrames.push(await canvasStats(page, 'canvas[aria-label="Selected saved animation"]', false));
}
check(exportFrames.every(frame => frame.count > 20), "every authored export frame contains its saved raster");
equal(exportFrames[1].sha256, exportFrames[0].sha256, "export hold frame is pixel-identical to its owner");
check(exportFrames[2].sha256 !== exportFrames[0].sha256, "export later keyframe preserves the moved raster");
close(exportFrames[0].centroidX / exportFrames[0].width, visibleStageCoordinate(workspaceFrame0.centroidX, workspaceFrame0.width), 0.025, "export frame 1 x matches workspace stage mapping");
close(exportFrames[0].centroidY / exportFrames[0].height, visibleStageCoordinate(workspaceFrame0.centroidY, workspaceFrame0.height), 0.025, "export frame 1 y matches workspace stage mapping");
close(exportFrames[2].centroidX / exportFrames[2].width, visibleStageCoordinate(workspaceFrame2.centroidX, workspaceFrame2.width), 0.025, "export frame 3 x matches workspace stage mapping");
close(exportFrames[2].centroidY / exportFrames[2].height, visibleStageCoordinate(workspaceFrame2.centroidY, workspaceFrame2.height), 0.025, "export frame 3 y matches workspace stage mapping");

await scrubber.fill("0");
await page.getByRole("button", { name: "Play" }).click();
const seenFrames = new Set<string>();
for (let sample = 0; sample < 14; sample += 1) {
  const label = await page.getByText(/Frame [1-3]\/3/).textContent();
  const match = label?.match(/Frame ([1-3])\/3/);
  if (match) seenFrames.add(match[1]);
  await page.waitForTimeout(60);
}
await page.getByRole("button", { name: "Pause" }).click();
equal([...seenFrames].sort(), ["1", "2", "3"], "player advances through every frame at the saved FPS and loops");
await page.screenshot({ path: `${outputRoot}/player-raster.png`, fullPage: true });

await page.getByRole("button", { name: "Change animation" }).click();
await page.getByRole("button", { name: "← Back" }).click();
await page.getByLabel("Message AI Animator").fill("hello");
await page.getByRole("button", { name: "Send AI message" }).click();
await page.locator("[data-ai-assistant-message]").filter({ hasText: "Hello! I’m Terra." }).waitFor({ timeout: 10_000 });
equal(capturedTerraRequests.length, 1, "normal conversation submits exactly one Terra job");
equal((capturedTerraRequests[0] as { message?: unknown }).message, "hello", "normal conversation reaches Terra with the exact message");
equal(await page.getByText(/Generate Frames can reach the AI route/).count(), 0, "Terra conversation never exposes the Generate Frames missing-key message");

equal(errors, [], "fresh correction flow has no page or console errors");
equal(externalRequests, [], "correction proof makes no external request");

const result = {
  kind: "spec0009-phase1-correction-browser",
  version: 1,
  status: "PASS",
  assertions,
  facts: {
    saveAsDialog: { prefilled: true, blankRejected: true, cancelSafe: true, savedTitle: "SPEC-0009 Raster Parity" },
    export: {
      frameCount: 3,
      holdOwnerPixelParity: exportFrames[1].sha256 === exportFrames[0].sha256,
      allFramesVisible: exportFrames.map(frame => frame.count),
      playerFramesSeen: [...seenFrames].sort(),
    },
    terra: { requestCount: capturedTerraRequests.length, provider: "no-cost browser double", paidCalls: 0, replyVisible: true },
    externalRequests: externalRequests.length,
    consoleErrors: errors.length,
  },
};
writeFileSync(`${outputRoot}/browser.json`, `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify(result));
await browser.close();
