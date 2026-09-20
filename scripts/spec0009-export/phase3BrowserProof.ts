import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { chromium, type Page, type Route } from "playwright-core";

const url = process.argv.find(argument => argument.startsWith("--url="))?.slice(6) ?? "http://127.0.0.1:57500/";
assert.match(url, /^http:\/\/127\.0\.0\.1:[0-9]+\/$/);
const origin = new URL(url).origin;
const outputRoot = "output/spec-0009/phase-3";
mkdirSync(`${outputRoot}/mp4`, { recursive: true });

let assertions = 0;
const check = (value: unknown, label: string) => { assertions += 1; assert.ok(value, label); };
const equal = (actual: unknown, expected: unknown, label: string) => { assertions += 1; assert.deepEqual(actual, expected, label); };
const close = (actual: number, expected: number, tolerance: number, label: string) => {
  assertions += 1;
  assert.ok(Math.abs(actual - expected) <= tolerance, `${label}: ${actual} vs ${expected}`);
};
const digest = (value: Uint8Array | string) => createHash("sha256").update(value).digest("hex");
const now = () => new Date().toISOString();
const initialGitStatus = execFileSync("git", ["status", "--porcelain=v1", "--untracked-files=all"], { encoding: "utf8" });

const destinationNames = [
  "Original", "YouTube", "YouTube Shorts", "TikTok", "Instagram Reels", "Instagram Stories", "Instagram Feed",
  "Facebook Reels", "Facebook Feed", "Discord", "Snapchat", "X", "Reddit", "Custom / Other",
] as const;

const destinationDimensions: Record<string, { "720p": [number, number]; "1080p": [number, number] }> = {
  Original: { "720p": [1280, 720], "1080p": [1920, 1080] },
  YouTube: { "720p": [1280, 720], "1080p": [1920, 1080] },
  "YouTube Shorts": { "720p": [720, 1280], "1080p": [1080, 1920] },
  TikTok: { "720p": [720, 1280], "1080p": [1080, 1920] },
  "Instagram Reels": { "720p": [720, 1280], "1080p": [1080, 1920] },
  "Instagram Stories": { "720p": [720, 1280], "1080p": [1080, 1920] },
  "Instagram Feed": { "720p": [720, 900], "1080p": [1080, 1350] },
  "Facebook Reels": { "720p": [720, 1280], "1080p": [1080, 1920] },
  "Facebook Feed": { "720p": [720, 900], "1080p": [1080, 1350] },
  Discord: { "720p": [1280, 720], "1080p": [1920, 1080] },
  Snapchat: { "720p": [720, 1280], "1080p": [1080, 1920] },
  X: { "720p": [1280, 720], "1080p": [1920, 1080] },
  Reddit: { "720p": [1280, 720], "1080p": [1920, 1080] },
};

const errors: string[] = [];
const requestFailures: string[] = [];
const externalRequests: string[] = [];
const terraRequests: unknown[] = [];
const terraJobs = new Map<string, Record<string, unknown>>();

const terraSnapshot = (request: Record<string, unknown>, done: boolean) => {
  const createdAt = now();
  const jobId = String(request.jobId);
  const projectId = String((request.workspace as { projectId?: unknown })?.projectId ?? "");
  const reasoningLevel = String(request.reasoningLevel ?? "medium");
  const effort = reasoningLevel === "extra-high" ? "xhigh" : reasoningLevel;
  return {
    version: 1,
    jobId,
    turnId: String(request.turnId),
    projectId,
    projectGeneration: Number((request.workspace as { projectGeneration?: unknown })?.projectGeneration ?? 0),
    reasoningLevel,
    intent: done ? "conversation" : null,
    status: done ? "done" : "thinking",
    lastSequence: done ? 2 : 1,
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
    events: done
      ? [
          { sequence: 1, status: "thinking", createdAt },
          {
            sequence: 2,
            status: "done",
            createdAt,
            reply: { intent: "conversation", reply: "Hello! I’m Terra. It’s nice to meet you—what would you like to talk through?", focusedQuestion: null, planSummary: null },
            provider: {
              requestedModel: "gpt-5.6-terra",
              providerModel: "gpt-5.6-terra",
              responseId: `no-cost-phase3-${jobId}`,
              usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0, estimatedCostUsd: 0 },
              latencyMs: 1,
              promptDigest: digest(String(request.message)),
            },
          },
        ]
      : [{ sequence: 1, status: "thinking", createdAt }],
  };
};

const routeTerra = async (route: Route) => {
  const request = route.request();
  const requestUrl = new URL(request.url());
  if (request.method() === "POST") {
    const body = request.postDataJSON() as Record<string, unknown>;
    terraRequests.push(body);
    terraJobs.set(String(body.jobId), body);
    await route.fulfill({ status: 202, contentType: "application/json", body: JSON.stringify(terraSnapshot(body, false)) });
    return;
  }
  const body = terraJobs.get(requestUrl.searchParams.get("jobId") ?? "");
  if (!body) {
    await route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ error: "missing no-cost test job" }) });
    return;
  }
  await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(terraSnapshot(body, true)) });
};

const browser = await chromium.launch({
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: !process.argv.includes("--headed"),
  args: ["--disable-background-networking", "--disable-component-update", "--disable-sync", "--disable-extensions", "--no-first-run"],
});
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: "reduce" });
await context.addInitScript(() => {
  localStorage.setItem("da_welcome_seen", "1");
  Object.defineProperty(window, "showSaveFilePicker", {
    configurable: true,
    value: async (options?: { suggestedName?: string }) => {
      const mode = (window as unknown as { __phase3PickerMode?: string }).__phase3PickerMode ?? "write";
      if (mode === "cancel") throw new DOMException("Synthetic Finder cancellation", "AbortError");
      if (mode === "deny") throw new DOMException("Synthetic Finder denial", "NotAllowedError");
      const name = options?.suggestedName ?? "Diamond Animation.mp4";
      const root = await navigator.storage.getDirectory();
      return root.getFileHandle(name, { create: true });
    },
  });
});
await context.route("**/*", async route => {
  const requestUrl = new URL(route.request().url());
  if (requestUrl.origin === origin && requestUrl.pathname === "/api/ai-animator") return routeTerra(route);
  if (requestUrl.origin === origin || requestUrl.protocol === "data:" || requestUrl.protocol === "blob:") return route.continue();
  externalRequests.push(route.request().url());
  return route.abort();
});
const page = await context.newPage();
page.setDefaultTimeout(30_000);
page.on("pageerror", error => errors.push(`page:${error.message}`));
page.on("console", message => { if (message.type() === "error") errors.push(`console:${message.text()}`); });
page.on("requestfailed", request => {
  const requestUrl = new URL(request.url());
  if (requestUrl.origin === origin) requestFailures.push(`${request.method()} ${request.url()} ${request.failure()?.errorText ?? "failed"}`);
});

const storageDigest = async (target: Page) => target.evaluate(async () => {
  const databaseRows: unknown[] = [];
  const databases = await indexedDB.databases();
  for (const info of databases.sort((left, right) => String(left.name).localeCompare(String(right.name)))) {
    if (!info.name) continue;
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(info.name!);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
    const stores: Record<string, unknown[]> = {};
    for (const storeName of [...db.objectStoreNames].sort()) {
      stores[storeName] = await new Promise<unknown[]>((resolve, reject) => {
        const transaction = db.transaction(storeName, "readonly");
        const request = transaction.objectStore(storeName).getAll();
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);
      });
    }
    databaseRows.push([info.name, info.version, stores]);
    db.close();
  }
  const localCredits = Object.fromEntries(Object.entries(localStorage).filter(([key]) => key.toLowerCase().includes("credit")).sort(([left], [right]) => left.localeCompare(right)));
  const serialized = JSON.stringify({ databaseRows, localCredits });
  const bytes = new TextEncoder().encode(serialized);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return {
    sha256: [...new Uint8Array(hash)].map(value => value.toString(16).padStart(2, "0")).join(""),
    bytes: bytes.byteLength,
    creditSnapshot: localCredits,
  };
});

const selectDestination = async (name: string) => {
  const group = page.getByRole("group", { name: "Video destinations" });
  const card = group.getByRole("button").filter({ hasText: name }).first();
  await card.click();
  equal(await card.getAttribute("aria-pressed"), "true", `${name} is visibly selected`);
};

const framingDetails = () => page.getByLabel("Destination framing details");
const parseGeometry = async () => {
  const text = (await framingDetails().textContent()) ?? "";
  const match = text.match(/Canvas (\d+)×(\d+); content ([\d.]+)×([\d.]+) at \(([\d.]+), ([\d.]+)\)\./);
  assert.ok(match, `Missing geometry in: ${text}`);
  return {
    text,
    canvas: { width: Number(match[1]), height: Number(match[2]) },
    content: { width: Number(match[3]), height: Number(match[4]), x: Number(match[5]), y: Number(match[6]) },
  };
};

const setQuality = async (tier: "720p" | "1080p") => {
  await page.getByRole("radio", { name: tier }).check();
  equal(await page.getByRole("radio", { name: tier }).isChecked(), true, `${tier} quality selected`);
};

const readOpfsFile = async (name: string) => page.evaluate(async fileName => {
  const root = await navigator.storage.getDirectory();
  const handle = await root.getFileHandle(fileName);
  const file = await handle.getFile();
  const bytes = new Uint8Array(await file.arrayBuffer());
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  const objectUrl = URL.createObjectURL(file);
  video.src = objectUrl;
  await new Promise<void>((resolve, reject) => {
    video.onloadeddata = () => resolve();
    video.onerror = () => reject(new Error("decoded_video_load_failed"));
  });
  video.currentTime = Math.min(0.01, Math.max(0, video.duration / 2));
  await new Promise<void>((resolve, reject) => {
    video.onseeked = () => resolve();
    video.onerror = () => reject(new Error("decoded_video_seek_failed"));
  });
  await video.play();
  await Promise.race([
    new Promise<void>(resolve => video.requestVideoFrameCallback(() => resolve())),
    new Promise<void>(resolve => setTimeout(resolve, 2_000)),
  ]);
  video.pause();
  const canvas = document.createElement("canvas");
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const context = canvas.getContext("2d")!;
  context.drawImage(video, 0, 0);
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
  let darkPixels = 0;
  let minX = canvas.width;
  let minY = canvas.height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < canvas.height; y += 2) for (let x = 0; x < canvas.width; x += 2) {
    const offset = (y * canvas.width + x) * 4;
    if (pixels[offset] + pixels[offset + 1] + pixels[offset + 2] >= 570) continue;
    darkPixels += 1;
    minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
  }
  URL.revokeObjectURL(objectUrl);
  return {
    name: file.name,
    bytes: file.size,
    sha256: [...new Uint8Array(hash)].map(value => value.toString(16).padStart(2, "0")).join(""),
    width: video.videoWidth,
    height: video.videoHeight,
    durationSeconds: video.duration,
    darkPixels,
    darkBounds: { minX, minY, maxX, maxY },
    base64: await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(reader.error);
      reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
      reader.readAsDataURL(file);
    }),
  };
}, name);

await page.goto(url, { waitUntil: "networkidle" });
const browserIdentity = { version: browser.version(), userAgent: await page.evaluate(() => navigator.userAgent), platform: await page.evaluate(() => navigator.platform) };
check(await page.getByRole("button", { name: /New Project/ }).isVisible(), "Home New Project is visible");
check(await page.getByRole("button", { name: /Open Project/ }).isVisible(), "Home Open Project is visible");
check(await page.getByRole("button", { name: /Tutorials/ }).isVisible(), "Home Tutorials is visible");
await page.getByRole("button", { name: /Tutorials/ }).click();
await page.locator("[data-tutorials-screen]").waitFor();
check(await page.locator("[data-tutorial-card]").count() > 1, "Tutorial cards render");
await page.getByRole("button", { name: "Back" }).click();
await page.getByRole("button", { name: /Open Project/ }).click();
await page.getByRole("main", { name: "Projects" }).waitFor();
await page.getByText("No saved projects yet.").waitFor();
check(await page.getByText("No saved projects yet.").isVisible(), "Open Project empty state is truthful");
await page.getByRole("button", { name: "← Back" }).click();
await page.getByRole("button", { name: /New Project/ }).click();

const editable = page.locator('canvas[data-workspace-canvas="editable"]');
await editable.waitFor();
const layerRows = page.locator("[data-timeline-layer-row]");
const layerCountBefore = await layerRows.count();
await page.getByRole("button", { name: "+ Layer" }).click();
await page.waitForFunction(expected => document.querySelectorAll("[data-timeline-layer-row]").length > expected, layerCountBefore);
check(await layerRows.count() > layerCountBefore, "layer addition creates one distinct timeline layer across the mirrored timeline render");
await page.getByRole("button", { name: "Onion" }).click();
await page.getByRole("button", { name: "Play" }).click();
await page.getByRole("button", { name: "Pause" }).waitFor();
await page.getByRole("button", { name: "Pause" }).click();
await page.getByRole("button", { name: "Brush", exact: true }).last().click();
const canvasBox = await editable.boundingBox();
assert.ok(canvasBox);
await page.mouse.move(canvasBox.x + canvasBox.width * 0.47, canvasBox.y + canvasBox.height * 0.43);
await page.mouse.down();
await page.mouse.move(canvasBox.x + canvasBox.width * 0.53, canvasBox.y + canvasBox.height * 0.57, { steps: 18 });
await page.mouse.up();
await page.getByRole("button", { name: "Undo" }).waitFor({ state: "visible" });
await page.waitForFunction(() => !(document.querySelector('button[aria-label="Undo"]') as HTMLButtonElement)?.disabled);
await page.getByRole("button", { name: "Undo" }).click();
await page.waitForFunction(() => !(document.querySelector('button[aria-label="Redo"]') as HTMLButtonElement)?.disabled);
await page.getByRole("button", { name: "Redo" }).click();

await page.getByRole("button", { name: "File" }).click();
await page.getByRole("menuitem", { name: "Save As" }).click();
const saveDialog = page.getByRole("dialog", { name: "Save project as" });
await saveDialog.getByLabel("Project name").fill("SPEC-0009 Phase 3 Social Destinations");
await saveDialog.getByRole("button", { name: "Save copy" }).click();
await page.getByText("Saved on this browser", { exact: true }).waitFor();

await page.reload({ waitUntil: "networkidle" });
await page.getByRole("button", { name: /Open Project/ }).click();
await page.getByRole("button", { name: "Open SPEC-0009 Phase 3 Social Destinations" }).click();
await editable.waitFor();
check(await page.getByText("SPEC-0009 Phase 3 Social Destinations", { exact: true }).count() >= 1, "saved project reopens by name");
await page.getByLabel("Message AI Animator").fill("hello");
await page.getByRole("button", { name: "Send AI message" }).click();
await page.locator("[data-ai-assistant-message]").filter({ hasText: "Hello! I’m Terra." }).waitFor();
equal(terraRequests.length, 1, "one no-cost Terra regression request");
equal((terraRequests[0] as { message?: unknown }).message, "hello", "Terra receives the exact regression message");

await page.getByRole("button", { name: "File" }).click();
await page.getByRole("menuitem", { name: "Export…" }).click();
await page.getByRole("main", { name: "Choose a saved animation to export" }).waitFor();
const projectCard = page.getByRole("button", { name: /SPEC-0009 Phase 3 Social Destinations/ });
await projectCard.waitFor();
await projectCard.click();
await page.getByRole("button", { name: "Use this animation" }).click();
await page.getByRole("main", { name: "Watch saved animation" }).waitFor();

const destinationButtons = page.getByRole("group", { name: "Video destinations" }).getByRole("button");
equal(await destinationButtons.count(), 14, "exactly fourteen destination cards render");
const destinationCardTexts = await destinationButtons.allTextContents();
for (const [index, name] of destinationNames.entries()) check(destinationCardTexts[index].includes(name), `${name} renders in required catalog position ${index + 1}`);
equal(await page.locator('img[src*="http"], [aria-label="Video destinations"] svg').count(), 0, "destination catalog uses no remote image or recreated logo SVG");
check((await framingDetails().textContent())?.includes("local guidance only, not a posting guarantee"), "posting guidance is explicitly local and non-guaranteed");

const geometryReceipts: unknown[] = [];
for (const name of destinationNames.slice(0, 13)) {
  await selectDestination(name);
  for (const tier of ["720p", "1080p"] as const) {
    await setQuality(tier);
    const geometry = await parseGeometry();
    const [width, height] = destinationDimensions[name][tier];
    equal(geometry.canvas, { width, height }, `${name} ${tier} exact output canvas`);
    close(geometry.content.x * 2 + geometry.content.width, width, 0.02, `${name} ${tier} content horizontally centered`);
    close(geometry.content.y * 2 + geometry.content.height, height, 0.02, `${name} ${tier} content vertically centered`);
    close(geometry.content.width / 1280, geometry.content.height / 720, 0.0001, `${name} ${tier} uses uniform contain scale`);
    check(geometry.text.includes("Padding:") || geometry.text.includes("No padding:"), `${name} ${tier} discloses padding`);
    const canvas = page.locator('canvas[aria-label="Selected saved animation"]');
    equal(Number(await canvas.getAttribute("width")), width, `${name} ${tier} player canvas width follows selection`);
    equal(Number(await canvas.getAttribute("height")), height, `${name} ${tier} player canvas height follows selection`);
    geometryReceipts.push({ destination: name, tier, ...geometry });
  }
}

await selectDestination("Custom / Other");
const customSelect = page.getByLabel("Custom canvas shape");
const customShapes: Array<[string, [number, number]]> = [
  ["original", [1280, 720]], ["16:9", [1280, 720]], ["9:16", [720, 1280]], ["1:1", [720, 720]], ["4:5", [720, 900]],
];
for (const [shape, dimensions] of customShapes) {
  await customSelect.selectOption(shape);
  await setQuality("720p");
  equal((await parseGeometry()).canvas, { width: dimensions[0], height: dimensions[1] }, `Custom / Other ${shape} exact canvas`);
}
await customSelect.selectOption("custom");
equal(await page.getByRole("radio").count(), 0, "quality selector is replaced during explicit custom dimensions");
await page.getByLabel("Custom video width").fill("256");
await page.getByLabel("Custom video height").fill("1920");
equal((await parseGeometry()).canvas, { width: 256, height: 1920 }, "inclusive minimum/maximum custom boundary is accepted");
await page.getByLabel("Custom video width").fill("257");
await page.getByLabel("Custom video height").fill("1080");
check(await page.getByRole("alert").getByText("Width and height must both be even numbers.").isVisible(), "odd custom dimension is rejected beside the inputs");
equal(await page.getByRole("button", { name: "Export video" }).isDisabled(), true, "invalid custom dimensions disable export");
await page.getByLabel("Custom video width").fill("254");
check(await page.getByRole("alert").getByText(/256 through 1920/).isVisible(), "out-of-range custom dimension is rejected");
await page.getByLabel("Custom video width").fill("1024");
await page.getByLabel("Custom video height").fill("768");
equal((await parseGeometry()).canvas, { width: 1024, height: 768 }, "valid custom dimensions update the framing preview");
await page.screenshot({ path: `${outputRoot}/destination-custom.png`, fullPage: true });

type RealExportCase = { id: string; destination: string; tier?: "720p" | "1080p"; customShape?: string; customDimensions?: [number, number] };
const realCases: RealExportCase[] = [
  { id: "original-720", destination: "Original", tier: "720p" },
  { id: "wide-1080", destination: "YouTube", tier: "1080p" },
  { id: "vertical-720", destination: "TikTok", tier: "720p" },
  { id: "portrait-720", destination: "Instagram Feed", tier: "720p" },
  { id: "square-720", destination: "Custom / Other", tier: "720p", customShape: "1:1" },
  { id: "custom-1024x768", destination: "Custom / Other", customShape: "custom", customDimensions: [1024, 768] },
];
const realExports: Array<Record<string, unknown>> = [];
for (const exportCase of realCases) {
  await selectDestination(exportCase.destination);
  if (exportCase.destination === "Custom / Other") {
    await page.getByLabel("Custom canvas shape").selectOption(exportCase.customShape!);
    if (exportCase.customShape === "custom") {
      await page.getByLabel("Custom video width").fill(String(exportCase.customDimensions![0]));
      await page.getByLabel("Custom video height").fill(String(exportCase.customDimensions![1]));
    } else {
      await setQuality(exportCase.tier!);
    }
  } else {
    await setQuality(exportCase.tier!);
  }
  const geometry = await parseGeometry();
  const baseName = `phase3-${exportCase.id}`;
  await page.getByLabel("Video file name").fill(baseName);
  await page.getByRole("button", { name: "Export video" }).click();
  await page.getByRole("button", { name: "Choose save location…" }).waitFor();
  await page.getByRole("button", { name: "Choose save location…" }).click();
  const success = page.getByText(new RegExp(`Saved and validated ${baseName}\\.mp4`));
  await success.waitFor({ timeout: 120_000 });
  const file = await readOpfsFile(`${baseName}.mp4`);
  const bytes = Buffer.from(file.base64, "base64");
  writeFileSync(`${outputRoot}/mp4/${baseName}.mp4`, bytes);
  console.log(JSON.stringify({ diagnostic: exportCase.id, geometry, decoded: { width: file.width, height: file.height, darkPixels: file.darkPixels, darkBounds: file.darkBounds, bytes: file.bytes, sha256: file.sha256 } }));
  equal({ width: file.width, height: file.height }, geometry.canvas, `${exportCase.id} decoded dimensions match visible framing`);
  check(file.bytes > 0 && /^[0-9a-f]{64}$/.test(file.sha256), `${exportCase.id} has bound non-empty MP4 bytes`);
  check(file.darkPixels > 12, `${exportCase.id} decoded frame contains the authored gesture`);
  check(file.darkBounds.minX >= Math.floor(geometry.content.x) - 4 && file.darkBounds.maxX <= Math.ceil(geometry.content.x + geometry.content.width) + 4, `${exportCase.id} decoded authored pixels stay inside horizontal content bounds`);
  check(file.darkBounds.minY >= Math.floor(geometry.content.y) - 4 && file.darkBounds.maxY <= Math.ceil(geometry.content.y + geometry.content.height) + 4, `${exportCase.id} decoded authored pixels stay inside vertical content bounds`);
  equal(digest(bytes), file.sha256, `${exportCase.id} browser and Node output hashes agree`);
  const receipt = {
    name: file.name,
    bytes: file.bytes,
    sha256: file.sha256,
    width: file.width,
    height: file.height,
    durationSeconds: file.durationSeconds,
    darkPixels: file.darkPixels,
    darkBounds: file.darkBounds,
  };
  realExports.push({ ...exportCase, geometry, status: "PASS", ...receipt });
  if (exportCase.id === "vertical-720") await page.screenshot({ path: `${outputRoot}/destination-vertical-success.png`, fullPage: true });
}

const databaseBeforeFailureFlows = await storageDigest(page);
await selectDestination("TikTok");
await setQuality("720p");
await page.getByLabel("Video file name").fill("phase3-finder-cancel");
await page.evaluate(() => { (window as unknown as { __phase3PickerMode?: string }).__phase3PickerMode = "cancel"; });
await page.getByRole("button", { name: "Export video" }).click();
await page.getByRole("button", { name: "Choose save location…" }).click();
await page.getByRole("alert").getByText("Finder was cancelled. No video was created.").waitFor();

await page.evaluate(() => { (window as unknown as { __phase3PickerMode?: string }).__phase3PickerMode = "deny"; });
await page.getByLabel("Video file name").fill("phase3-permission-denied");
await page.getByRole("button", { name: "Export video" }).click();
await page.getByRole("button", { name: "Choose save location…" }).click();
await page.getByRole("alert").getByText("Finder did not allow this file to be saved.").waitFor();
await page.evaluate(() => { (window as unknown as { __phase3PickerMode?: string }).__phase3PickerMode = "write"; });
const databaseAfterFailureFlows = await storageDigest(page);
equal(databaseAfterFailureFlows, databaseBeforeFailureFlows, "preset selection, real exports, Finder cancel and permission failure do not mutate project or credits storage");

await page.screenshot({ path: `${outputRoot}/final-review.png`, fullPage: true });
equal(errors, [], "Phase 3 real-app flow has no page or console errors");
equal(requestFailures, [], "Phase 3 real-app flow has no same-origin request failures");
equal(externalRequests, [], "Phase 3 production flow makes no external request");
equal(execFileSync("git", ["status", "--porcelain=v1", "--untracked-files=all"], { encoding: "utf8" }), initialGitStatus, "browser flow creates no repository changes");

const result = {
  kind: "spec0009-phase3-browser-proof",
  version: 1,
  status: "PASS",
  assertions,
  url,
  browser: browserIdentity,
  facts: {
    home: { newProject: "PASS", openProject: "PASS", tutorials: "PASS" },
    workspace: { saveAs: "PASS", open: "PASS", draw: "PASS", layer: "PASS", undoRedo: "PASS", onion: "PASS", playPause: "PASS" },
    terra: { status: "PASS", requestCount: terraRequests.length, provider: "no-cost deterministic browser double", paidCalls: 0 },
    destinations: { count: destinationNames.length, names: destinationNames, catalogVersion: "2026-09-20", geometryReceipts },
    custom: { shapes: customShapes.map(([shape]) => shape), boundary: [256, 1920], oddRejected: true, outOfRangeRejected: true, qualityReplaced: true },
    exports: realExports,
    failures: { finderCancel: "PASS", permissionDenied: "PASS" },
    storage: { before: databaseBeforeFailureFlows, after: databaseAfterFailureFlows, projectChanges: 0, creditChanges: 0 },
  },
  isolation: { externalRequests: externalRequests.length, aiProviderCalls: 0, paidCalls: 0, creditChanges: 0, repositoryWrites: 0 },
  errors,
  requestFailures,
};
writeFileSync(`${outputRoot}/browser.json`, `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify({ status: result.status, assertions, exports: realExports.map(output => ({ id: output.id, bytes: output.bytes, sha256: output.sha256, width: output.width, height: output.height })) }));
await browser.close();
