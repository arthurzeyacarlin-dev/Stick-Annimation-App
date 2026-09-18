import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { chromium, type Page } from "playwright-core";

const url = process.argv.find(argument => argument.startsWith("--url="))?.slice(6) ?? "http://127.0.0.1:56940/";
assert.match(url, /^http:\/\/127\.0\.0\.1:[0-9]+\/$/);
const output = "output/spec-0007/phase-3/browser";
mkdirSync(output, { recursive: true });
let assertions = 0;
const check = (value: unknown, label: string) => { assertions += 1; assert.ok(value, label); };
const equal = (actual: unknown, expected: unknown, label: string) => { assertions += 1; assert.deepEqual(actual, expected, label); };
const settle = (page: Page) => page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));

const canvasSnapshot = (page: Page) => page.locator('canvas[data-workspace-canvas="editable"]').evaluate(async element => {
  const canvas = element as HTMLCanvasElement;
  const bytes = canvas.getContext("2d")!.getImageData(0, 0, canvas.width, canvas.height).data;
  const digest = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes as BufferSource)), value => value.toString(16).padStart(2, "0")).join("");
  let pixels = 0, left = canvas.width, top = canvas.height, right = -1, bottom = -1;
  for (let offset = 3; offset < bytes.length; offset += 4) {
    if (!bytes[offset]) continue;
    const index = (offset - 3) / 4;
    const x = index % canvas.width;
    const y = Math.floor(index / canvas.width);
    pixels += 1; left = Math.min(left, x); top = Math.min(top, y); right = Math.max(right, x); bottom = Math.max(bottom, y);
  }
  const bounds = canvas.getBoundingClientRect();
  return {
    digest, pixels,
    pixelBounds: pixels ? { left, top, right, bottom } : null,
    cssBounds: { left: bounds.left, top: bounds.top, width: bounds.width, height: bounds.height },
    width: canvas.width, height: canvas.height,
  };
});

const browser = await chromium.launch({
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true,
  args: ["--disable-background-networking", "--disable-component-update", "--disable-sync", "--disable-extensions", "--no-first-run"],
});
const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
await context.addInitScript(() => localStorage.setItem("da_welcome_seen", "1"));
const page = await context.newPage();
const errors: string[] = [];
page.on("pageerror", error => errors.push(`page:${error.message}`));
page.on("console", message => { if (message.type() === "error") errors.push(`console:${message.text()}`); });
await page.goto(url);
await page.evaluate(() => new Promise<void>((resolve, reject) => {
  const request = indexedDB.deleteDatabase("diamond-animation-unified-v2");
  request.onsuccess = () => resolve(); request.onerror = () => reject(request.error); request.onblocked = () => reject(new Error("blocked"));
}));

await page.evaluate(async () => {
  const sha256 = async (bytes: Uint8Array) => `sha256:${Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes as BufferSource)), value => value.toString(16).padStart(2, "0")).join("")}`;
  const projectId = "11111111-1111-4111-8111-111111111111";
  const layerId = "22222222-2222-4222-8222-222222222222";
  const cellId = "33333333-3333-4333-8333-333333333333";
  const definitionId = "66666666-6666-4666-8666-666666666666";
  const rig = { figures: [], structureGraph: { joints: [{ id: "a", x: 600, y: 250 }, { id: "b", x: 900, y: 520 }, { id: "c", x: 1120, y: 760 }], limbs: [{ id: "ab", startJointId: "a", endJointId: "b" }, { id: "bc", startJointId: "b", endJointId: "c" }], activeJointId: null } };
  const symbolCanvas = document.createElement("canvas"); symbolCanvas.width = 120; symbolCanvas.height = 120;
  const symbolContext = symbolCanvas.getContext("2d")!; symbolContext.strokeStyle = symbolContext.fillStyle = "#101218"; symbolContext.lineWidth = 14; symbolContext.lineCap = "round";
  symbolContext.beginPath(); symbolContext.moveTo(15, 15); symbolContext.lineTo(60, 60); symbolContext.lineTo(105, 20); symbolContext.stroke();
  for (const [x, y] of [[15, 15], [60, 60], [105, 20]]) { symbolContext.beginPath(); symbolContext.arc(x, y, 7, 0, Math.PI * 2); symbolContext.fill(); }
  const pngDataUrl = symbolCanvas.toDataURL("image/png");
  const pngBytes = Uint8Array.from(atob(pngDataUrl.slice(pngDataUrl.indexOf(",") + 1)), character => character.charCodeAt(0));
  const assetSha256 = await sha256(pngBytes);
  const structuredPayload = { version: 1, joints: [{ id: "sa", x: 0.125, y: 0.125 }, { id: "sb", x: 0.5, y: 0.5 }, { id: "sc", x: 0.875, y: 0.1666666667 }], limbs: [{ id: "sab", startJointId: "sa", endJointId: "sb" }, { id: "sbc", startJointId: "sb", endJointId: "sc" }], drawingPngDataUrl: null };
  const definitionDigest = await sha256(new TextEncoder().encode(JSON.stringify({ name: "Legacy Rig Symbol", sourceCategory: "Stick Figure Symbol", width: 120, height: 120, assetSha256, structuredPayload })));
  const definition = { definitionId, name: "Legacy Rig Symbol", sourceCategory: "Stick Figure Symbol", width: 120, height: 120, pngDataUrl, assetSha256, definitionDigest, structuredPayload };
  const project = {
    kind: "diamond-animation-project", schemaVersion: 2, projectId, title: "Legacy Rig Review", createdAt: "2026-09-18T00:00:00.000Z", updatedAt: "2026-09-18T00:00:00.000Z", revision: 1, provenance: { kind: "native" }, auxiliary: { drawingAiMemory: null, stickAiCreationLatch: null },
    document: { kind: "diamond-animation-document", schemaVersion: 2, projectId, logicalStage: { width: 1920, height: 1080, origin: "top-left", xAxis: "right", yAxis: "down" }, fps: 12,
      layers: [{ layerId, name: "Rig Layer", orderIndex: 0, visible: true, locked: false, cells: [{ cellId, cellType: "keyframe", ownerCellId: cellId, content: { items: [
        { itemId: "44444444-4444-4444-8444-444444444444", kind: "stick-rig/v1", content: rig },
        { itemId: "55555555-5555-4555-8555-555555555555", kind: "symbol-instance/v1", definitionId, definitionDigest, x: 1250, y: 350, width: 240, height: 240, rotation: 15, flipX: false, flipY: false },
      ], soundAttachment: null } }] }], catalogs: { symbols: [definition], assets: [] }, toolState: { drawingTool: "Select", stickTool: "Select / Move Joint" }, reopenState: { activeLayerId: layerId, currentFrameIndex: 0, onionEnabled: false } },
    compatibility: { drawingData: null, stickByCell: { "legacy:1": rig }, symbolInstancesByCell: {} },
  };
  const database = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("diamond-animation-unified-v2", 2);
    request.onupgradeneeded = () => {
      const db = request.result;
      const stores: Array<[string, IDBObjectStoreParameters]> = [["projects", { keyPath: "projectId" }], ["heads", { keyPath: "projectId" }], ["versions", { keyPath: ["projectId", "revision", "projectDigest"] }], ["assets", { keyPath: "assetId" }], ["assetMetadata", { keyPath: "assetId" }]];
      for (const [name, options] of stores) if (!db.objectStoreNames.contains(name)) db.createObjectStore(name, options);
    };
    request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
  });
  await new Promise<void>((resolve, reject) => { const transaction = database.transaction("projects", "readwrite"); transaction.objectStore("projects").put(project); transaction.oncomplete = () => resolve(); transaction.onerror = () => reject(transaction.error); });
  database.close();
});

await page.goto(url);
await page.getByRole("button", { name: /^Open Project/ }).click();
await page.getByRole("button", { name: "Open Legacy Rig Review" }).click();
await page.locator('canvas[data-workspace-canvas="editable"]').waitFor();
await settle(page);
equal(await page.getByRole("button", { name: /Stick Figure Tools|Rig Tools|Add Limb|Select \/ Move Joint|Stick Figure Creator|Rig Builder/ }).count(), 0, "retired authoring controls are absent");
equal(await page.locator('[aria-label="Editable stick figure content"]').count(), 0, "retired structured-rig SVG is absent");
for (const tab of ["Properties", "Library", "Assets"]) check(await page.getByRole("button", { name: tab, exact: true }).isVisible(), `${tab} remains visible`);
const migrated = await canvasSnapshot(page);
check(migrated.pixels > 0 && migrated.pixelBounds, "legacy rig opens as visible ordinary pixels");
await page.screenshot({ path: `${output}/migrated-rig-and-symbol.png` });

await page.getByRole("button", { name: "Eraser", exact: true }).click();
const centerX = (migrated.pixelBounds!.left + migrated.pixelBounds!.right) / 2;
const centerY = (migrated.pixelBounds!.top + migrated.pixelBounds!.bottom) / 2;
const cssX = migrated.cssBounds.left + centerX / migrated.width * migrated.cssBounds.width;
const cssY = migrated.cssBounds.top + centerY / migrated.height * migrated.cssBounds.height;
await page.mouse.move(cssX - 30, cssY); await page.mouse.down(); await page.mouse.move(cssX + 30, cssY, { steps: 8 }); await page.mouse.up(); await settle(page);
const erased = await canvasSnapshot(page);
check(erased.digest !== migrated.digest, "migrated rig pixels are immediately editable by Eraser");
await page.getByRole("button", { name: "Undo", exact: true }).click(); await settle(page);
equal((await canvasSnapshot(page)).digest, migrated.digest, "Undo exactly restores migrated rig pixels");

const sourceBeforeSave = await page.evaluate(async () => {
  type StoredProject = { revision: number; document: { layers: Array<{ cells: Array<{ content: { items: Array<{ kind: string }> } }> }>; catalogs: { symbols: Array<{ structuredPayload?: unknown }> } } };
  const database = await new Promise<IDBDatabase>((resolve, reject) => { const request = indexedDB.open("diamond-animation-unified-v2"); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
  const project = await new Promise<StoredProject>((resolve, reject) => { const request = database.transaction("projects", "readonly").objectStore("projects").get("11111111-1111-4111-8111-111111111111"); request.onsuccess = () => resolve(request.result as StoredProject); request.onerror = () => reject(request.error); });
  database.close(); return { revision: project.revision, kind: project.document.layers[0].cells[0].content.items[0].kind, structured: Boolean(project.document.catalogs.symbols[0].structuredPayload) };
});
equal(sourceBeforeSave, { revision: 1, kind: "stick-rig/v1", structured: true }, "Open leaves the historical source untouched");
await page.getByRole("button", { name: "File", exact: true }).click();
await page.getByText("Save", { exact: true }).click();
await page.getByRole("status").filter({ hasText: "Saved on this browser" }).waitFor();

const saved = await page.evaluate(async () => {
  type EncodedProject = { document: { layers: Array<{ cells: Array<{ content: { items: Array<{ kind: string }> } }> }>; catalogs: { symbols: Array<{ structuredPayload?: unknown; sourceCategory: string }> } }; auxiliary: { rigRetirementReceipt: { version: number; recovery: { revision: number } } } };
  type VersionRow = { revision: number; encodedProject: EncodedProject };
  type HeadRow = { activeRevision: number };
  const database = await new Promise<IDBDatabase>((resolve, reject) => { const request = indexedDB.open("diamond-animation-unified-v2"); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
  const transaction = database.transaction(["projects", "heads", "versions"], "readonly");
  const all = <T,>(store: string) => new Promise<T[]>((resolve, reject) => { const request = transaction.objectStore(store).getAll(); request.onsuccess = () => resolve(request.result as T[]); request.onerror = () => reject(request.error); });
  const [projects, heads, versions] = await Promise.all([all<unknown>("projects"), all<HeadRow>("heads"), all<VersionRow>("versions")]); database.close();
  versions.sort((left, right) => left.revision - right.revision);
  const oldProject = versions[0].encodedProject, migratedProject = versions[1].encodedProject;
  return { directProjects: projects.length, headRevision: heads[0].activeRevision, revisions: versions.map(value => value.revision), oldKind: oldProject.document.layers[0].cells[0].content.items[0].kind, oldStructured: Boolean(oldProject.document.catalogs.symbols[0].structuredPayload), newKinds: migratedProject.document.layers[0].cells[0].content.items.map((item: { kind: string }) => item.kind), newStructured: Boolean(migratedProject.document.catalogs.symbols[0].structuredPayload), newCategory: migratedProject.document.catalogs.symbols[0].sourceCategory, receipt: migratedProject.auxiliary.rigRetirementReceipt };
});
equal(saved.directProjects, 0, "direct record is adopted into versioned storage");
equal(saved.headRevision, 2, "first Save publishes revision 2");
equal(saved.revisions, [1, 2], "exact pre-migration predecessor is retained");
equal(saved.oldKind, "stick-rig/v1", "recovery predecessor retains original rig bytes");
equal(saved.oldStructured, true, "recovery predecessor retains original structured symbol");
equal(saved.newKinds, ["drawing-raster/v1", "symbol-instance/v1"], "saved migrated owner contains only ordinary items");
equal(saved.newStructured, false, "saved symbol is raster-only");
equal(saved.newCategory, "Drawing Symbol", "rig-only symbol becomes Drawing Symbol");
equal(saved.receipt.version, 3, "saved project includes the versioned migration receipt");
equal(saved.receipt.recovery.revision, 1, "receipt binds the exact recovery predecessor");

await page.goto(url); await page.getByRole("button", { name: /^Open Project/ }).click(); await page.getByRole("button", { name: "Open Legacy Rig Review" }).click(); await page.locator('canvas[data-workspace-canvas="editable"]').waitFor(); await settle(page);
equal((await canvasSnapshot(page)).digest, migrated.digest, "Save/Open preserves exact migrated pixels without duplicate conversion");
equal(errors, [], "no page or console errors");

await context.close(); await browser.close();
const result = { status: "PASS", assertions, migration: saved, sourceBeforeSave, migratedPixels: migrated.pixels, errors };
writeFileSync(`${output}/phase3-browser.json`, JSON.stringify(result, null, 2) + "\n");
console.log(JSON.stringify({ status: result.status, assertions, migratedPixels: result.migratedPixels }));
