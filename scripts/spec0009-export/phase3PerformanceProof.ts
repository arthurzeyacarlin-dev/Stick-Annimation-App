import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { chromium, type Page } from "playwright-core";

const url = process.argv.find(argument => argument.startsWith("--url="))?.slice(6) ?? "http://127.0.0.1:57500/";
const cancelOnly = process.argv.includes("--cancel-only");
assert.match(url, /^http:\/\/127\.0\.0\.1:[0-9]+\/$/);
const origin = new URL(url).origin;
const outputRoot = "output/spec-0009/phase-3";
mkdirSync(`${outputRoot}/mp4`, { recursive: true });

let assertions = 0;
const check = (value: unknown, label: string) => { assertions += 1; assert.ok(value, label); };
const equal = (actual: unknown, expected: unknown, label: string) => { assertions += 1; assert.deepEqual(actual, expected, label); };
const digest = (value: Uint8Array | string) => createHash("sha256").update(value).digest("hex");
const initialGitStatus = execFileSync("git", ["status", "--porcelain=v1", "--untracked-files=all"], { encoding: "utf8" });
const errors: string[] = [];
const externalRequests: string[] = [];

const browser = await chromium.launch({
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: !process.argv.includes("--headed"),
  args: ["--disable-background-networking", "--disable-component-update", "--disable-sync", "--disable-extensions", "--no-first-run", "--enable-precise-memory-info"],
});
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: "reduce" });
await context.addInitScript(() => {
  localStorage.setItem("da_welcome_seen", "1");
  const proof = { heapSamples: [] as number[], longTasks: [] as Array<{ startTime: number; duration: number; statusText: string }> };
  (window as unknown as { __phase3Performance?: typeof proof }).__phase3Performance = proof;
  const sampleHeap = () => {
    const used = (performance as Performance & { memory?: { usedJSHeapSize?: number } }).memory?.usedJSHeapSize;
    if (typeof used === "number") proof.heapSamples.push(used);
  };
  sampleHeap();
  window.setInterval(sampleHeap, 250);
  try {
    new PerformanceObserver(list => {
      for (const entry of list.getEntries()) proof.longTasks.push({
        startTime: entry.startTime,
        duration: entry.duration,
        statusText: document.querySelector('[role="status"]')?.textContent?.trim() ?? "",
      });
    }).observe({ type: "longtask", buffered: true });
  } catch {}
  Object.defineProperty(window, "showSaveFilePicker", {
    configurable: true,
    value: async (options?: { suggestedName?: string }) => {
      const root = await navigator.storage.getDirectory();
      return root.getFileHandle(options?.suggestedName ?? "Diamond Animation.mp4", { create: true });
    },
  });
});
await context.route("**/*", async route => {
  const requestUrl = new URL(route.request().url());
  if (requestUrl.origin === origin || requestUrl.protocol === "data:" || requestUrl.protocol === "blob:") return route.continue();
  externalRequests.push(route.request().url());
  return route.abort();
});
const page = await context.newPage();
const cdp = await context.newCDPSession(page);
page.setDefaultTimeout(45_000);
page.on("pageerror", error => errors.push(`page:${error.message}`));
page.on("console", message => { if (message.type() === "error") errors.push(`console:${message.text()}`); });

const storageDigest = async (target: Page) => target.evaluate(async () => {
  const database = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("diamond-animation-unified-v2");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  const transaction = database.transaction(["heads", "versions", "assetMetadata"], "readonly");
  const read = (store: string) => new Promise<unknown[]>((resolve, reject) => {
    const request = transaction.objectStore(store).getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  const data = JSON.stringify(await Promise.all([read("heads"), read("versions"), read("assetMetadata")]));
  database.close();
  const bytes = new TextEncoder().encode(data);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(hash)].map(value => value.toString(16).padStart(2, "0")).join("");
});

const seedPerformanceFixture = async (target: Page, input: { frameCount: number; revision: number; title: string }) => target.evaluate(async fixture => {
  const database = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("diamond-animation-unified-v2");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  const readAll = <T,>(store: string) => new Promise<T[]>((resolve, reject) => {
    const transaction = database.transaction(store, "readonly");
    const request = transaction.objectStore(store).getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  const versions = await readAll<Record<string, unknown>>("versions");
  const source = versions.find(version => version.revision === 1);
  if (!source) throw new Error("missing_fixture_source");
  // The fixture is deliberately assembled inside the browser from the app's
  // already-validated V2 record; runtime validation re-checks the result.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const project = structuredClone(source.encodedProject as Record<string, unknown>) as any;
  const timestamp = new Date().toISOString();
  project.title = fixture.title;
  project.updatedAt = timestamp;
  project.revision = fixture.revision;
  project.document.fps = 24;
  delete project.compatibility;

  const makeWavDataUrl = () => {
    const sampleRate = 48_000;
    const samples = 4_800;
    const bytes = new Uint8Array(44 + samples * 2);
    const view = new DataView(bytes.buffer);
    const text = (offset: number, value: string) => [...value].forEach((character, index) => view.setUint8(offset + index, character.charCodeAt(0)));
    text(0, "RIFF"); view.setUint32(4, bytes.length - 8, true); text(8, "WAVE"); text(12, "fmt "); view.setUint32(16, 16, true);
    view.setUint16(20, 1, true); view.setUint16(22, 1, true); view.setUint32(24, sampleRate, true); view.setUint32(28, sampleRate * 2, true);
    view.setUint16(32, 2, true); view.setUint16(34, 16, true); text(36, "data"); view.setUint32(40, samples * 2, true);
    for (let index = 0; index < samples; index += 1) view.setInt16(44 + index * 2, Math.round(Math.sin(index * 2 * Math.PI * 440 / sampleRate) * 2400), true);
    let binary = "";
    for (let offset = 0; offset < bytes.length; offset += 8192) binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
    return `data:audio/wav;base64,${btoa(binary)}`;
  };
  const audioDataUrl = makeWavDataUrl();
  const layers = Array.from({ length: 8 }, (_, layerIndex) => {
    const layerId = crypto.randomUUID();
    const ownerCellId = crypto.randomUUID();
    const content = {
      items: [{
        itemId: crypto.randomUUID(), kind: "drawing-text/v1", text: `Performance layer ${layerIndex + 1}`, x: 700 + layerIndex * 18,
        y: 360 + layerIndex * 28, color: layerIndex % 2 ? "#2255aa" : "#101418", fontSize: 42, rotation: 0, width: 420,
        flipX: false, flipY: false, fontFamily: "Arial", bold: layerIndex % 2 === 0, italic: false,
      }],
      soundAttachment: layerIndex === 0 ? {
        id: "phase3-performance-tone", title: "Synthetic performance tone", description: "Local proof fixture", timingFeel: null,
        intensityFeel: null, audioDataUrl, contentType: "sfx", speechText: null, sourceTask: "generate-sounds", attachedAt: timestamp,
      } : null,
      dormantSourceContent: null,
    };
    return {
      layerId, name: `Performance Layer ${layerIndex + 1}`, orderIndex: layerIndex, visible: true, locked: false,
      cells: Array.from({ length: fixture.frameCount }, (_, frameIndex) => frameIndex === 0
        ? { cellId: ownerCellId, cellType: "keyframe", ownerCellId, content }
        : { cellId: crypto.randomUUID(), cellType: "hold", ownerCellId, content: null }),
    };
  });
  project.document.layers = layers;
  project.document.reopenState = { activeLayerId: layers[0].layerId, currentFrameIndex: 0, onionEnabled: false };

  const encoder = new TextEncoder();
  const hashBytes = async (bytes: Uint8Array) => {
    const result = await crypto.subtle.digest("SHA-256", Uint8Array.from(bytes).buffer);
    return [...new Uint8Array(result)].map(value => value.toString(16).padStart(2, "0")).join("");
  };
  const assets = new Map<string, { assetId: string; sha256: string; byteLength: number; encoding: "data-url"; bytes: Uint8Array }>();
  const visit = async (value: unknown): Promise<unknown> => {
    if (typeof value === "string" && /^data:(?:image|audio)\//.test(value)) {
      const bytes = encoder.encode(value);
      const sha256 = await hashBytes(bytes);
      const assetId = `sha256:${sha256}`;
      assets.set(assetId, { assetId, sha256, byteLength: bytes.byteLength, encoding: "data-url", bytes });
      return { __unifiedAssetRef: assetId, encoding: "data-url", constructorName: null, byteLength: bytes.byteLength };
    }
    if (Array.isArray(value)) return Promise.all(value.map(visit));
    if (value !== null && typeof value === "object") {
      const result: Record<string, unknown> = {};
      for (const [key, entry] of Object.entries(value as Record<string, unknown>)) result[key] = await visit(entry);
      return result;
    }
    return value;
  };
  const encodedProject = await visit(project);
  const encodedJson = JSON.stringify(encodedProject);
  const metadataBytes = encoder.encode(encodedJson);
  const projectDigest = await hashBytes(metadataBytes);
  const assetList = [...assets.values()].sort((left, right) => left.assetId.localeCompare(right.assetId));
  const storedByteLength = metadataBytes.byteLength + assetList.reduce((total, asset) => total + asset.byteLength, 0);
  const version = {
    projectId: project.projectId,
    revision: fixture.revision,
    projectDigest,
    metadataByteLength: metadataBytes.byteLength,
    storedByteLength,
    assetIds: assetList.map(asset => asset.assetId),
    encodedProject,
  };
  const head = {
    projectId: project.projectId,
    title: fixture.title,
    createdAt: project.createdAt,
    updatedAt: timestamp,
    activeRevision: fixture.revision,
    projectDigest,
    storedByteLength,
    provenance: project.provenance,
  };
  const transaction = database.transaction(["heads", "versions", "assets", "assetMetadata"], "readwrite");
  transaction.objectStore("versions").put(version);
  transaction.objectStore("heads").put(head);
  for (const asset of assetList) {
    transaction.objectStore("assets").put(asset);
    transaction.objectStore("assetMetadata").put({ assetId: asset.assetId, sha256: asset.sha256, byteLength: asset.byteLength, encoding: asset.encoding });
  }
  await new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = transaction.onabort = () => reject(transaction.error);
  });
  database.close();
  return { projectId: project.projectId, projectDigest, frameCount: fixture.frameCount, fps: 24, durationSeconds: fixture.frameCount / 24, layers: 8, textItemsPerFrame: 8, audio: true, metadataByteLength: metadataBytes.byteLength, storedByteLength };
}, input);

const openFixtureExport = async (target: Page, title: string) => {
  await target.reload({ waitUntil: "networkidle" });
  await target.getByRole("button", { name: /Export/ }).click();
  await target.getByRole("main", { name: "Choose a saved animation to export" }).waitFor();
  const card = target.getByRole("button", { name: new RegExp(title) });
  await card.waitFor();
  await card.click();
  const startedAt = performance.now();
  await target.getByRole("button", { name: "Use this animation" }).click();
  await target.locator('canvas[aria-label="Selected saved animation"]').waitFor();
  await target.getByText(/Frame 1\//).waitFor();
  return performance.now() - startedAt;
};

const readFileReceipt = async (target: Page, name: string) => target.evaluate(async fileName => {
  const root = await navigator.storage.getDirectory();
  const file = await (await root.getFileHandle(fileName)).getFile();
  const bytes = new Uint8Array(await file.arrayBuffer());
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return {
    bytes: file.size,
    sha256: [...new Uint8Array(hash)].map(value => value.toString(16).padStart(2, "0")).join(""),
    base64: await new Promise<string>((resolve, reject) => {
      const reader = new FileReader(); reader.onerror = () => reject(reader.error);
      reader.onload = () => resolve(String(reader.result).split(",")[1] ?? ""); reader.readAsDataURL(file);
    }),
  };
}, name);

const exportPerformanceCase = async (target: Page, input: { id: string; tier: "720p" | "1080p"; maximumMs: number; expectedFrames: number }) => {
  await target.getByRole("radio", { name: input.tier }).check();
  await target.getByLabel("Video file name").fill(input.id);
  const stateBefore = await storageDigest(target);
  await cdp.send("HeapProfiler.collectGarbage");
  await target.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  const performanceBefore = await target.evaluate(() => {
    const proof = (window as unknown as { __phase3Performance: { heapSamples: number[]; longTasks: Array<{ startTime: number; duration: number; statusText: string }> } }).__phase3Performance;
    return { heap: proof.heapSamples.at(-1) ?? null, browserNow: performance.now() };
  });
  await target.getByRole("button", { name: "Export video" }).click();
  await target.getByRole("button", { name: "Choose save location…" }).waitFor();
  const startedAt = performance.now();
  await target.getByRole("button", { name: "Choose save location…" }).click();
  const success = target.getByText(new RegExp(`Saved and validated ${input.id}\\.mp4`));
  await success.waitFor({ timeout: input.maximumMs + 30_000 });
  const elapsedMs = performance.now() - startedAt;
  const visibleReceipt = (await success.textContent()) ?? "";
  check(visibleReceipt.includes(`${input.expectedFrames} frames`), `${input.id} visible receipt has exact frame count`);
  check(elapsedMs <= input.maximumMs, `${input.id} completes inside performance gate`);
  const performanceAfter = await target.evaluate(() => {
    const proof = (window as unknown as { __phase3Performance: { heapSamples: number[]; longTasks: Array<{ startTime: number; duration: number; statusText: string }> } }).__phase3Performance;
    return { heapSamples: proof.heapSamples, longTasks: proof.longTasks };
  });
  const relevantHeap = performanceAfter.heapSamples.filter(value => performanceBefore.heap === null || value >= 0);
  const peakHeapBytes = relevantHeap.length ? Math.max(...relevantHeap) : null;
  const baselineHeapBytes = performanceBefore.heap;
  if (peakHeapBytes !== null && baselineHeapBytes !== null) {
    check(peakHeapBytes <= 512 * 1024 * 1024, `${input.id} peak sampled JS heap stays at or below 512 MiB`);
    check(peakHeapBytes - baselineHeapBytes <= 256 * 1024 * 1024, `${input.id} heap growth stays at or below 256 MiB`);
  }
  const exportLongTasks = performanceAfter.longTasks.filter(entry => entry.startTime >= performanceBefore.browserNow);
  const maximumLongTaskMs = exportLongTasks.length ? Math.max(...exportLongTasks.map(entry => entry.duration)) : 0;
  console.log(JSON.stringify({ diagnostic: input.id, elapsedMs, baselineHeapBytes, peakHeapBytes, longTasks: exportLongTasks }));
  const enumeratedExceptions = exportLongTasks.filter(entry => entry.duration >= 250);
  check(enumeratedExceptions.every(entry => entry.duration < 500 && entry.statusText.includes("Preflighting · 50%")), `${input.id} any 250 ms exception is bounded and isolated to traced audio preflight`);
  const stateAfter = await storageDigest(target);
  equal(stateAfter, stateBefore, `${input.id} export does not mutate project storage`);
  const file = await readFileReceipt(target, `${input.id}.mp4`);
  check(file.bytes > 0 && /^[0-9a-f]{64}$/.test(file.sha256), `${input.id} output is non-empty and hash-bound`);
  const bytes = Buffer.from(file.base64, "base64");
  writeFileSync(`${outputRoot}/mp4/${input.id}.mp4`, bytes);
  equal(digest(bytes), file.sha256, `${input.id} Node and browser hashes agree`);
  return { id: input.id, tier: input.tier, status: "PASS", elapsedMs, maximumMs: input.maximumMs, visibleReceipt, bytes: file.bytes, sha256: file.sha256, baselineHeapBytes, peakHeapBytes, maximumLongTaskMs, longTaskCount: exportLongTasks.length, enumeratedExceptions };
};

await page.goto(url, { waitUntil: "networkidle" });
await page.getByRole("button", { name: /New Project/ }).click();
await page.locator('canvas[data-workspace-canvas="editable"]').waitFor();
await page.getByRole("button", { name: "File" }).click();
await page.getByRole("menuitem", { name: "Save As" }).click();
const dialog = page.getByRole("dialog", { name: "Save project as" });
await dialog.getByLabel("Project name").fill("Phase 3 Performance Seed");
await dialog.getByRole("button", { name: "Save copy" }).click();
await page.getByText("Saved on this browser", { exact: true }).waitFor();

let longFixture: Awaited<ReturnType<typeof seedPerformanceFixture>> | null = null;
let longFirstFrameMs: number | null = null;
let longExport: Awaited<ReturnType<typeof exportPerformanceCase>> | null = null;
if (!cancelOnly) {
  longFixture = await seedPerformanceFixture(page, { frameCount: 7_200, revision: 2, title: "Phase 3 Five Minute Fixture" });
  equal(longFixture, { ...longFixture, frameCount: 7_200, fps: 24, durationSeconds: 300, layers: 8, textItemsPerFrame: 8, audio: true }, "five-minute fixture has exact duration/content classes");
  longFirstFrameMs = await openFixtureExport(page, "Phase 3 Five Minute Fixture");
  await page.getByRole("note").getByText(/Long exports can use significant local CPU/).waitFor();
  longExport = await exportPerformanceCase(page, { id: "phase3-five-minute-720", tier: "720p", maximumMs: 600_000, expectedFrames: 7_200 });
}

const shortFixture = await seedPerformanceFixture(page, { frameCount: 1_440, revision: cancelOnly ? 2 : 3, title: "Phase 3 Sixty Second Fixture" });
equal(shortFixture.durationSeconds, 60, "sixty-second fixture duration is exact");
const shortFirstFrameMs = await openFixtureExport(page, "Phase 3 Sixty Second Fixture");
check(shortFirstFrameMs < 2_000, "60-second eight-layer selected player first frame is under 2 seconds");
const shortExport = cancelOnly ? null : await exportPerformanceCase(page, { id: "phase3-sixty-second-1080", tier: "1080p", maximumMs: 240_000, expectedFrames: 1_440 });

await page.getByLabel("Video file name").fill("phase3-cancel-performance");
await page.getByRole("button", { name: "Export video" }).click();
await page.getByRole("button", { name: "Choose save location…" }).click();
await page.getByRole("button", { name: "Cancel export" }).waitFor();
const cancelClickAt = performance.now();
await page.getByRole("button", { name: "Cancel export" }).click();
await page.getByRole("button", { name: "Cancelling…" }).waitFor();
const cancelAcknowledgedMs = performance.now() - cancelClickAt;
await page.getByRole("alert").getByText(/Export was cancelled/).waitFor({ timeout: 2_000 });
const cancelTerminalMs = performance.now() - cancelClickAt;
check(cancelAcknowledgedMs < 250, "cancel acknowledgement is under 250 ms");
check(cancelTerminalMs < 2_000, "cancel reaches terminal state under 2 seconds");
const cancelledBytes = await page.evaluate(async () => {
  const root = await navigator.storage.getDirectory();
  const file = await (await root.getFileHandle("phase3-cancel-performance.mp4")).getFile();
  return file.size;
});
equal(cancelledBytes, 0, "cancelled long export is truncated to zero bytes");

equal(errors, [], "performance proof has no page or console errors");
equal(externalRequests, [], "performance proof makes no external requests");
equal(execFileSync("git", ["status", "--porcelain=v1", "--untracked-files=all"], { encoding: "utf8" }), initialGitStatus, "performance proof creates no repository changes");
const result = {
  kind: "spec0009-phase3-performance-proof",
  version: 1,
  status: "PASS",
  assertions,
  environment: { browser: browser.version(), userAgent: await page.evaluate(() => navigator.userAgent), platform: await page.evaluate(() => navigator.platform), build: "Next.js 16.1.6 production", encoder: "mediabunny/1.58.1" },
  fixtures: { long: longFixture, short: shortFixture },
  firstFrame: { fiveMinuteMs: longFirstFrameMs, sixtySecondMs: shortFirstFrameMs },
  exports: [longExport, shortExport].filter((entry): entry is NonNullable<typeof entry> => entry !== null),
  cancel: { status: "PASS", cancelAcknowledgedMs, cancelTerminalMs, remainingBytes: cancelledBytes },
  isolation: { externalRequests: 0, providerCalls: 0, paidCalls: 0, creditChanges: 0, repositoryWrites: 0 },
};
writeFileSync(`${outputRoot}/${cancelOnly ? "performance-cancel-debug.json" : "performance.json"}`, `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify({ status: result.status, assertions, firstFrame: result.firstFrame, exports: result.exports.map(entry => ({ id: entry.id, elapsedMs: entry.elapsedMs, bytes: entry.bytes, peakHeapBytes: entry.peakHeapBytes, maximumLongTaskMs: entry.maximumLongTaskMs })), cancel: result.cancel }));
await browser.close();
