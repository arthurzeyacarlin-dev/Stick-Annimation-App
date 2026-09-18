import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { chromium, type Page } from "playwright-core";

type FilePayload = { name: string; mimeType: string; buffer: Buffer };

const url = process.argv.find(argument => argument.startsWith("--url="))?.slice(6) ?? "http://127.0.0.1:56950/";
assert.match(url, /^http:\/\/127\.0\.0\.1:[0-9]+\/$/);
const output = "output/spec-0007/phase-4/browser";
mkdirSync(output, { recursive: true });
let assertions = 0;
const check = (value: unknown, label: string) => { assertions += 1; assert.ok(value, label); };
const equal = (actual: unknown, expected: unknown, label: string) => { assertions += 1; assert.deepEqual(actual, expected, label); };
const settle = (page: Page) => page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));

const makeImage = async (page: Page, name: string, mimeType: "image/png" | "image/jpeg" | "image/webp", color: string, width = 96, height = 64): Promise<FilePayload> => {
  const bytes = await page.evaluate(async ({ mimeType, color, width, height }) => {
    const canvas = document.createElement("canvas"); canvas.width = width; canvas.height = height;
    const context = canvas.getContext("2d")!;
    context.fillStyle = color; context.fillRect(0, 0, width, height);
    context.fillStyle = "rgba(255,255,255,.9)"; context.fillRect(8, 8, width / 2, height / 3);
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error("encode_failed")), mimeType, .92));
    return Array.from(new Uint8Array(await blob.arrayBuffer()));
  }, { mimeType, color, width, height });
  return { name, mimeType, buffer: Buffer.from(bytes) };
};

const canvasSnapshot = (page: Page) => page.locator('canvas[data-workspace-canvas="editable"]').evaluate(async element => {
  const canvas = element as HTMLCanvasElement;
  const bytes = canvas.getContext("2d")!.getImageData(0, 0, canvas.width, canvas.height).data;
  const digest = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes as BufferSource)), value => value.toString(16).padStart(2, "0")).join("");
  let pixels = 0;
  for (let offset = 3; offset < bytes.length; offset += 4) if (bytes[offset]) pixels += 1;
  return { digest, pixels };
});

const browser = await chromium.launch({
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true,
  args: ["--disable-background-networking", "--disable-component-update", "--disable-sync", "--disable-extensions", "--no-first-run", "--js-flags=--expose-gc"],
});
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await context.addInitScript(() => {
  localStorage.setItem("da_welcome_seen", "1");
  const create = URL.createObjectURL.bind(URL), revoke = URL.revokeObjectURL.bind(URL);
  Object.defineProperty(globalThis, "__assetUrlLedger", { value: { created: 0, revoked: 0 }, configurable: true });
  URL.createObjectURL = blob => { (globalThis as typeof globalThis & { __assetUrlLedger: { created: number } }).__assetUrlLedger.created += 1; return create(blob); };
  URL.revokeObjectURL = value => { (globalThis as typeof globalThis & { __assetUrlLedger: { revoked: number } }).__assetUrlLedger.revoked += 1; revoke(value); };
});
const page = await context.newPage();
const errors: string[] = [];
const externalRequests: string[] = [];
page.on("pageerror", error => errors.push(`page:${error.message}`));
page.on("console", message => { if (message.type() === "error") errors.push(`console:${message.text()}`); });
page.on("request", request => {
  const target = new URL(request.url());
  if (["http:", "https:"].includes(target.protocol) && !['127.0.0.1', 'localhost'].includes(target.hostname)) externalRequests.push(request.url());
});
await page.goto(url);
await page.evaluate(() => new Promise<void>((resolve, reject) => {
  const request = indexedDB.deleteDatabase("diamond-animation-unified-v2");
  request.onsuccess = () => resolve(); request.onerror = () => reject(request.error); request.onblocked = () => reject(new Error("blocked"));
}));
await page.goto(url);
await page.getByRole("button", { name: /^New Project/ }).click();
await page.getByRole("button", { name: "Assets", exact: true }).click();
const input = page.getByLabel("Choose asset images");

const png = await makeImage(page, "obsidian.png", "image/png", "#241238");
const jpeg = await makeImage(page, "background.jpg", "image/jpeg", "#2480b8");
const webp = await makeImage(page, "character.webp", "image/webp", "#e35935");
const importStarted = performance.now();
await input.setInputFiles([png, jpeg, webp]);
await page.getByRole("status").filter({ hasText: "Imported 3 assets." }).waitFor();
const representativeImportMs = performance.now() - importStarted;
equal(await page.locator("[data-asset-card]").count(), 3, "PNG/JPEG/WebP batch imports atomically in chooser order");
for (const label of ["PNG • 96×64", "JPEG • 96×64", "WebP • 96×64"]) check(await page.getByText(label, { exact: true }).isVisible(), `${label} metadata is truthful`);
equal(await page.locator('[data-asset-card] [role="img"]').count(), 3, "all imported stills have previews");
check(representativeImportMs <= 1_000, "representative desktop import completes within one second");

const beforeInvalid = await page.locator("[data-asset-card]").count();
const fresh = await makeImage(page, "would-have-imported.png", "image/png", "#1a8a55");
await input.setInputFiles([fresh, { name: "not-an-image.svg", mimeType: "image/svg+xml", buffer: Buffer.from("<svg/>") }]);
await page.getByRole("status").filter({ hasText: "not a supported static PNG, JPEG, or WebP" }).waitFor();
equal(await page.locator("[data-asset-card]").count(), beforeInvalid, "one invalid file rejects the entire mixed batch");
await input.setInputFiles([{ ...png, name: "same-pixels.png" }]);
await page.getByRole("status").filter({ hasText: "already in Assets" }).waitFor();
equal(await page.locator("[data-asset-card]").count(), 3, "duplicate bytes are rejected under a different name");
const differentNamedPng = await makeImage(page, "obsidian.png", "image/png", "#00c37a");
await input.setInputFiles([differentNamedPng]);
await page.getByRole("status").filter({ hasText: "already exists" }).waitFor();
equal(await page.locator("[data-asset-card]").count(), 3, "case-stable name collision is rejected");

const dropped = await makeImage(page, "dropped.png", "image/png", "#885500", 80, 80);
await page.evaluate(({ name, mimeType, bytes }) => {
  const zone = document.querySelector("[data-assets-drop-zone]")!;
  const transfer = new DataTransfer();
  transfer.items.add(new File([Uint8Array.from(bytes)], name, { type: mimeType }));
  zone.dispatchEvent(new DragEvent("dragover", { bubbles: true, cancelable: true, dataTransfer: transfer }));
  zone.dispatchEvent(new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer: transfer }));
}, { name: dropped.name, mimeType: dropped.mimeType, bytes: Array.from(dropped.buffer) });
await page.getByRole("status").filter({ hasText: "Imported 1 asset." }).waitFor();
equal(await page.locator("[data-asset-card]").count(), 4, "OS file drop imports through the same guarded path");

await page.evaluate(() => {
  const card = document.querySelector('[data-asset-card]')!;
  const host = document.querySelector('canvas[data-workspace-canvas="editable"]')!.parentElement!.parentElement!;
  const bounds = host.getBoundingClientRect();
  const transfer = new DataTransfer();
  card.dispatchEvent(new DragEvent("dragstart", { bubbles: true, cancelable: true, dataTransfer: transfer }));
  host.dispatchEvent(new DragEvent("dragover", { bubbles: true, cancelable: true, clientX: bounds.left + bounds.width / 2, clientY: bounds.top + bounds.height / 2, dataTransfer: transfer }));
  host.dispatchEvent(new DragEvent("drop", { bubbles: true, cancelable: true, clientX: bounds.left + bounds.width / 2, clientY: bounds.top + bounds.height / 2, dataTransfer: transfer }));
});
await page.getByText("Placed asset", { exact: true }).waitFor();
check(await page.getByLabel("Lock image proportions").isChecked(), "new placement locks image proportions by default");
await page.getByLabel("Lock image proportions").uncheck();
check(!(await page.getByLabel("Lock image proportions").isChecked()), "proportion lock has an explicit unlock");
await page.getByLabel("Lock image proportions").check();
await page.getByLabel("Rotation").fill("23");
await page.getByRole("button", { name: "Assets", exact: true }).click();
await page.getByRole("button", { name: "Delete obsidian.png asset" }).click();
await page.getByRole("status").filter({ hasText: "Finish or cancel the placed image" }).waitFor();
equal(await page.locator("[data-asset-card]").count(), 4, "referenced catalog entry cannot be deleted");
await page.getByRole("button", { name: "Properties", exact: true }).click();
const beforePlacement = await canvasSnapshot(page);
await page.getByRole("button", { name: "Commit Placement" }).click();
await settle(page);
const afterPlacement = await canvasSnapshot(page);
check(afterPlacement.digest !== beforePlacement.digest && afterPlacement.pixels > beforePlacement.pixels, "placed image commits visibly to the ordinary raster canvas");

await page.getByRole("button", { name: "Assets", exact: true }).click();
await page.getByRole("button", { name: "Delete obsidian.png asset" }).click();
await page.getByRole("status").filter({ hasText: "Deleted obsidian.png from Assets." }).waitFor();
equal(await page.locator("[data-asset-card]").count(), 3, "unreferenced catalog entry deletes explicitly");
equal((await canvasSnapshot(page)).digest, afterPlacement.digest, "catalog deletion preserves placed raster pixels");
await page.getByRole("button", { name: "Undo", exact: true }).click(); await settle(page);
equal(await page.locator("[data-asset-card]").count(), 4, "Undo restores deleted catalog entry");
await page.getByRole("button", { name: "Redo", exact: true }).click(); await settle(page);
equal(await page.locator("[data-asset-card]").count(), 3, "Redo removes only the catalog entry again");
equal((await canvasSnapshot(page)).digest, afterPlacement.digest, "Undo/Redo catalog history never changes unrelated pixels");

await page.getByRole("button", { name: "File", exact: true }).click();
await page.getByText("Save", { exact: true }).click();
await page.getByRole("status").filter({ hasText: "Saved on this browser" }).waitFor();
await page.goto(url);
await page.getByRole("button", { name: /^Open Project/ }).click();
await page.getByRole("button", { name: /Open Untitled Project/ }).click();
await page.locator('canvas[data-workspace-canvas="editable"]').waitFor();
await settle(page);
await page.getByRole("button", { name: "Assets", exact: true }).click();
equal(await page.locator("[data-asset-card]").count(), 3, "Save/reload/Open preserves the exact remaining catalog");
equal((await canvasSnapshot(page)).digest, afterPlacement.digest, "Save/reload/Open preserves placed image pixels");

const cycleDurations: number[] = [];
const heapSamples: number[] = [];
for (let index = 0; index < 20; index += 1) {
  const cycle = { ...fresh, name: `cycle-${index}.png` };
  const started = performance.now();
  await input.setInputFiles([cycle]);
  await page.getByRole("status").filter({ hasText: "Imported 1 asset." }).waitFor();
  cycleDurations.push(performance.now() - started);
  await page.getByRole("button", { name: `Delete ${cycle.name} asset` }).click();
  await page.getByRole("status").filter({ hasText: `Deleted ${cycle.name} from Assets.` }).waitFor();
  await page.evaluate(() => {
    const target = globalThis as typeof globalThis & { gc?: () => void };
    target.gc?.();
  });
  heapSamples.push(await page.evaluate(() => (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize ?? 0));
}
equal(await page.locator("[data-asset-card]").count(), 3, "20 import/preview/remove cycles leave no catalog growth");
const urlLedger = await page.evaluate(() => (globalThis as typeof globalThis & { __assetUrlLedger: { created: number; revoked: number } }).__assetUrlLedger);
equal(urlLedger.created, urlLedger.revoked, "every temporary decode URL is revoked");
const nonZeroHeap = heapSamples.filter(Boolean);
check(nonZeroHeap.length === 0 || Math.max(...nonZeroHeap) < 320 * 1024 * 1024, "settled browser heap remains below 320 MiB");
check(nonZeroHeap.length < 3 || nonZeroHeap.some((value, index) => index > 0 && value <= nonZeroHeap[index - 1]), "settled heap does not grow monotonically across all cycles");

await page.setViewportSize({ width: 390, height: 844 });
await page.getByRole("button", { name: "Assets", exact: true }).click();
check(await page.getByRole("button", { name: "Import Images" }).isVisible(), "compact Assets import remains visible");
const compact = await makeImage(page, "compact.png", "image/png", "#3b5bdb", 32, 32);
const compactStarted = performance.now();
await input.setInputFiles([compact]);
await page.getByRole("status").filter({ hasText: "Imported 1 asset." }).waitFor();
const compactImportMs = performance.now() - compactStarted;
check(compactImportMs <= 2_000, "representative compact import completes within two seconds");
await page.getByRole("button", { name: "Delete compact.png asset" }).focus();
await page.keyboard.press("Enter");
await page.getByRole("status").filter({ hasText: "Deleted compact.png from Assets." }).waitFor();
await settle(page);
equal(await page.locator("[data-asset-card]").count(), 3, "keyboard catalog delete works in compact view");

equal(externalRequests, [], "Assets lifecycle performs no external network request");
equal(errors, [], "no browser page or console errors");
await page.screenshot({ path: `${output}/assets-final.png`, fullPage: true });
await context.close(); await browser.close();

const sortedDurations = [...cycleDurations].sort((left, right) => left - right);
const result = {
  status: "PASS",
  assertions,
  representativeImportMs,
  compactImportMs,
  cycleP95Ms: sortedDurations[Math.ceil(sortedDurations.length * .95) - 1],
  urlLedger,
  heapSamples,
  finalCanvas: afterPlacement,
  externalRequests,
  errors,
};
writeFileSync(`${output}/phase4-browser.json`, JSON.stringify(result, null, 2) + "\n");
console.log(JSON.stringify({ status: result.status, assertions, representativeImportMs, compactImportMs, cycleP95Ms: result.cycleP95Ms, urlLedger }));
