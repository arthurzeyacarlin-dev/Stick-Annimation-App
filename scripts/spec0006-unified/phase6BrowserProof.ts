import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { chromium, type BrowserContext, type Page } from "playwright-core";
import { migrateLegacySourceReadOnly } from "../../src/lib/animation/unifiedAnimationMigration.ts";
import { createUnifiedProjectStorageV2 } from "../../src/lib/animation/unifiedProjectStorageV2.ts";
import type { StoredDrawingProject } from "../../src/lib/drawingProjectStorage.ts";
import { createPhase2Sources } from "./phase2FixtureFactory.ts";
import { createLargePhase6Project, Phase6MemoryStorageAdapter } from "./phase6FixtureFactory.ts";

const url = process.argv.find(argument => argument.startsWith("--url="))?.slice(6) ?? "http://127.0.0.1:56666/";
assert.match(url, /^http:\/\/127\.0\.0\.1:(?!3000\/)[0-9]+\/$/);
const output = resolve("output/spec-0006/phase-6/browser");
mkdirSync(output, { recursive: true });
const pause = (milliseconds = 180) => new Promise(resolveDelay => setTimeout(resolveDelay, milliseconds));
const sha = (value: string) => createHash("sha256").update(value).digest("hex");
const percentile = (values: number[], fraction: number) => [...values].sort((a, b) => a - b)[Math.min(values.length - 1, Math.floor(values.length * fraction))];
const median = (values: number[]) => percentile(values, 0.5);

const sources = await createPhase2Sources();
const drawingV1Source = sources.find(source => source.sourceKind === "drawing-v1");
if (!drawingV1Source || drawingV1Source.sourceKind !== "drawing-v1") throw new Error("drawing_v1_missing");
const unifiedRaw = structuredClone(drawingV1Source.project) as StoredDrawingProject;
unifiedRaw.id = "60000000-0000-4000-8000-000000000015";
unifiedRaw.name = "Unified study (V1)";
const unifiedMigration = await migrateLegacySourceReadOnly({ sourceKind: "drawing-v1", project: unifiedRaw });
if (!unifiedMigration.ok) throw new Error(unifiedMigration.error.code);
const unifiedV1 = {
  project: unifiedMigration.candidate.project,
  resolvedAssets: unifiedMigration.candidate.resolvedAssets.map(asset => ({ assetId: asset.assetId, bytesBase64: Buffer.from(asset.bytes).toString("base64") })),
};
const transport = await Promise.all(sources.map(async source => source.sourceKind === "drawing-v2" ? {
  ...source,
  record: {
    ...source.record,
    assets: await Promise.all(source.record.assets.map(async asset => ({ ...asset, bytes: Buffer.from(await asset.bytes.arrayBuffer()).toString("base64") }))),
  },
} : source));
const largeCanonicalTemplate = await (async () => {
  const project = await createLargePhase6Project({ width: 4563, height: 3302, firstFill: 17, secondFill: 29 });
  const adapter = new Phase6MemoryStorageAdapter();
  const saved = await createUnifiedProjectStorageV2(adapter).write({ ...project, revision: 1 }, null);
  const head = adapter.heads.get(saved.projectId);
  const version = [...adapter.versions.values()].find(candidate => candidate.projectId === saved.projectId && candidate.revision === 1);
  if (!head || !version) throw new Error("large_template_prepare_failed");
  return {
    head: structuredClone(head),
    version: structuredClone(version),
    smallAssets: [...adapter.assets.values()].filter(asset => asset.byteLength !== 60_268_104).map(asset => ({
      assetId: asset.assetId,
      sha256: asset.sha256,
      byteLength: asset.byteLength,
      encoding: asset.encoding,
      bytesBase64: Buffer.from(asset.bytes).toString("base64"),
    })),
  };
})();

type ProfileResult = {
  profile: string;
  viewport: { width: number; height: number; deviceScaleFactor: number };
  operations: string[];
  adoption: unknown[];
  native: unknown;
  large: unknown;
  timings: { openMs: number[]; saveMs: number[]; selectionSettleMs: number[]; longTasksMs: number[] };
  sourceBefore: unknown;
  sourceAfter: unknown;
  screenshots: string[];
};
const profileResults: ProfileResult[] = [];
const requests: Array<{ method: string; url: string; disposition: string }> = [];
const pageErrors: string[] = [];
const consoleErrors: string[] = [];

const browser = await chromium.launch({
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: !process.argv.includes("--headed"),
  args: ["--disable-background-networking", "--disable-component-update", "--disable-sync", "--disable-extensions", "--no-first-run", "--js-flags=--expose-gc"],
});

const configure = async (context: BrowserContext) => {
  await context.route("**/*", async route => {
    const request = route.request();
    const parsed = new URL(request.url());
    const sameOrigin = parsed.origin === new URL(url).origin;
    const availability = sameOrigin && parsed.pathname === "/api/ai" && request.method() === "GET";
    const allowed = sameOrigin && !parsed.pathname.startsWith("/api/");
    const disposition = availability ? "fulfilled-disabled-ai" : allowed ? "loopback" : "blocked";
    requests.push({ method: request.method(), url: `${parsed.origin}${parsed.pathname}`, disposition });
    if (availability) await route.fulfill({ status: 200, contentType: "application/json", body: '{"available":false,"reason":"phase6-proof"}' });
    else if (allowed) await route.continue();
    else await route.abort();
  });
  await context.addInitScript(() => {
    localStorage.setItem("da_welcome_seen", "1");
    const note = (entry: string) => {
      const values = JSON.parse(document.documentElement?.dataset.phase6Writes ?? "[]");
      values.push(entry);
      if (document.documentElement) document.documentElement.dataset.phase6Writes = JSON.stringify(values);
    };
    const set = Storage.prototype.setItem;
    const remove = Storage.prototype.removeItem;
    Storage.prototype.setItem = function(key, value) { note(`localStorage.set:${key}`); return set.call(this, key, value); };
    Storage.prototype.removeItem = function(key) { note(`localStorage.remove:${key}`); return remove.call(this, key); };
    for (const operation of ["put", "add", "delete", "clear"] as const) {
      const original = IDBObjectStore.prototype[operation];
      Object.defineProperty(IDBObjectStore.prototype, operation, {
        configurable: true,
        value: function(this: IDBObjectStore, ...args: unknown[]) { note(`idb.${operation}:${this.name}`); return Reflect.apply(original, this, args); },
      });
    }
    const observer = new PerformanceObserver(list => {
      const existing = JSON.parse(document.documentElement?.dataset.phase6LongTasks ?? "[]");
      for (const entry of list.getEntries()) existing.push(entry.duration);
      if (document.documentElement) document.documentElement.dataset.phase6LongTasks = JSON.stringify(existing);
    });
    try { observer.observe({ type: "longtask", buffered: true }); } catch {}
  });
};

const seed = (page: Page) => page.evaluate(async ({ values, unified }) => {
  const drawings = values.filter(value => value.sourceKind === "drawing-v1").map(value => "project" in value ? value.project : null);
  localStorage.setItem("da_saved_drawing_projects", JSON.stringify(drawings));
  const sticks = values.filter(value => value.sourceKind.startsWith("stick")).map(value => "project" in value ? value.project : null);
  localStorage.setItem("da_saved_stick_projects_v1", JSON.stringify({ storageVersion: 1, projects: sticks }));
  localStorage.setItem("da_saved_unified_projects_v1", JSON.stringify({ storageVersion: 1, projects: [unified] }));
  const source = values.find(value => value.sourceKind === "drawing-v2");
  if (!source || source.sourceKind !== "drawing-v2") throw new Error("drawing_v2_missing");
  const record = {
    ...source.record,
    assets: source.record.assets.map(asset => ({
      ...asset,
      bytes: new Blob([Uint8Array.from(atob(asset.bytes), character => character.charCodeAt(0))], { type: asset.kind === "raster-png" ? "image/png" : "audio/wav" }),
    })),
  };
  const database = await new Promise<IDBDatabase>((resolveDatabase, rejectDatabase) => {
    const open = indexedDB.open("diamond-animator-local", 1);
    open.onupgradeneeded = () => {
      for (const [name, keyPath] of [["drawingProjectHeadsV2", "projectId"], ["drawingProjectVersionsV2", ["projectId", "storageRevision"]], ["drawingProjectPreviewsV1", "projectId"], ["drawingProjectAuxiliaryV1", "projectId"], ["drawingProjectLegacyDeleteTombstonesV1", "projectId"]] as const) {
        if (!open.result.objectStoreNames.contains(name)) open.result.createObjectStore(name, { keyPath: typeof keyPath === "string" ? keyPath : [...keyPath] });
      }
    };
    open.onsuccess = () => resolveDatabase(open.result);
    open.onerror = () => rejectDatabase(open.error);
  });
  await new Promise<void>((resolveTransaction, rejectTransaction) => {
    const transaction = database.transaction(["drawingProjectHeadsV2", "drawingProjectVersionsV2"], "readwrite");
    transaction.objectStore("drawingProjectHeadsV2").put(source.head);
    transaction.objectStore("drawingProjectVersionsV2").put(record);
    transaction.oncomplete = () => resolveTransaction();
    transaction.onerror = () => rejectTransaction(transaction.error);
  });
  database.close();
}, { values: transport, unified: unifiedV1 });

const resetWrites = (page: Page) => page.evaluate(() => { document.documentElement.dataset.phase6Writes = "[]"; });
const writes = (page: Page) => page.evaluate(() => JSON.parse(document.documentElement.dataset.phase6Writes ?? "[]") as string[]);
const sourceWrites = async (page: Page) => (await writes(page)).filter(entry =>
  entry.includes("da_saved_drawing_projects") || entry.includes("da_saved_stick_projects_v1") || entry.includes("da_saved_unified_projects_v1") ||
  entry.includes("drawingProjectHeadsV2") || entry.includes("drawingProjectVersionsV2") || entry.includes("drawingProjectAuxiliaryV1") || entry.includes("drawingProjectPreviewsV1"));

const sourceSnapshot = (page: Page) => page.evaluate(async () => {
  const digest = async (bytes: Uint8Array) => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes.slice().buffer))).map(value => value.toString(16).padStart(2, "0")).join("");
  const normalize = async (value: unknown): Promise<unknown> => {
    if (value instanceof Blob) return { type: value.type, bytes: value.size, sha256: await digest(new Uint8Array(await value.arrayBuffer())) };
    if (ArrayBuffer.isView(value)) return { bytes: value.byteLength, sha256: await digest(new Uint8Array(value.buffer, value.byteOffset, value.byteLength)) };
    if (Array.isArray(value)) return Promise.all(value.map(normalize));
    if (value && typeof value === "object") return Object.fromEntries(await Promise.all(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(async ([key, entry]) => [key, await normalize(entry)])));
    return value;
  };
  const local: Record<string, unknown> = {};
  for (const key of ["da_saved_drawing_projects", "da_saved_stick_projects_v1", "da_saved_unified_projects_v1"]) {
    const raw = localStorage.getItem(key);
    local[key] = raw === null ? null : { bytes: new TextEncoder().encode(raw).byteLength, sha256: await digest(new TextEncoder().encode(raw)) };
  }
  const databases = await indexedDB.databases();
  const indexed: Record<string, unknown> = {};
  if (databases.some(database => database.name === "diamond-animator-local")) {
    const database = await new Promise<IDBDatabase>((resolveDatabase, rejectDatabase) => { const open = indexedDB.open("diamond-animator-local"); open.onsuccess = () => resolveDatabase(open.result); open.onerror = () => rejectDatabase(open.error); });
    for (const name of Array.from(database.objectStoreNames)) {
      const rows = await new Promise<unknown[]>((resolveRows, rejectRows) => { const request = database.transaction(name, "readonly").objectStore(name).getAll(); request.onsuccess = () => resolveRows(request.result); request.onerror = () => rejectRows(request.error); });
      const encoded = new TextEncoder().encode(JSON.stringify(await normalize(rows)));
      indexed[name] = { records: rows.length, sha256: await digest(encoded) };
    }
    database.close();
  }
  return { local, indexed };
});

const canonicalSnapshot = (page: Page) => page.evaluate(async () => {
  const database = await new Promise<IDBDatabase>((resolveDatabase, rejectDatabase) => { const open = indexedDB.open("diamond-animation-unified-v2"); open.onsuccess = () => resolveDatabase(open.result); open.onerror = () => rejectDatabase(open.error); });
  const readAll = <T>(name: string) => new Promise<T[]>((resolveRows, rejectRows) => { const request = database.transaction(name, "readonly").objectStore(name).getAll(); request.onsuccess = () => resolveRows(request.result); request.onerror = () => rejectRows(request.error); });
  const heads = await readAll<{ projectId: string; title: string; activeRevision: number; projectDigest: string; provenance?: { kind: string; sourceKind?: string; sourceProjectId?: string; sourceRecordDigest?: string; parentProjectId?: string } }>("heads");
  const versions = await readAll<{ projectId: string; revision: number; projectDigest: string; storedByteLength: number; assetIds: string[]; encodedProject: unknown }>("versions");
  const metadata = await readAll<{ assetId: string; byteLength: number }>("assetMetadata");
  database.close();
  return {
    heads: heads.sort((a, b) => a.projectId.localeCompare(b.projectId)),
    versions: versions.map(version => ({ projectId: version.projectId, revision: version.revision, projectDigest: version.projectDigest, storedByteLength: version.storedByteLength, assetIds: version.assetIds })).sort((a, b) => a.projectId.localeCompare(b.projectId) || a.revision - b.revision),
    assets: { count: metadata.length, bytes: metadata.reduce((total, asset) => total + asset.byteLength, 0), ids: metadata.map(asset => asset.assetId).sort() },
  };
});

const seedLargeCanonicalV2 = (page: Page, input: {
  projectId: string;
  title: string;
  template: typeof largeCanonicalTemplate;
}) => page.evaluate(async values => {
  const database = await new Promise<IDBDatabase>((resolveDatabase, rejectDatabase) => {
    const open = indexedDB.open("diamond-animation-unified-v2");
    open.onsuccess = () => resolveDatabase(open.result);
    open.onerror = () => rejectDatabase(open.error);
  });
  const project = structuredClone(values.template.version.encodedProject) as {
    projectId: string;
    title: string;
    revision: number;
    createdAt: string;
    updatedAt: string;
    provenance: { kind: "native" };
    auxiliary?: { drawingAiMemory?: Record<string, unknown> | null; stickAiCreationLatch?: { projectId: string } | null };
    document: { projectId: string; layers: Array<{ cells: Array<{ content: { items: Array<Record<string, unknown>> } | null }> }> };
  };
  if (project.projectId !== values.projectId || project.document.projectId !== values.projectId || project.title !== values.title) throw new Error("large_template_identity");
  if (project.auxiliary?.drawingAiMemory) {
    const rebindMemory = (value: unknown) => {
      if (Array.isArray(value)) value.forEach(rebindMemory);
      else if (value && typeof value === "object") {
        for (const [key, entry] of Object.entries(value)) {
          if (key === "ownerProjectId") (value as Record<string, unknown>)[key] = values.projectId;
          else rebindMemory(entry);
        }
      }
    };
    rebindMemory(project.auxiliary.drawingAiMemory);
  }
  if (project.auxiliary?.stickAiCreationLatch) project.auxiliary.stickAiCreationLatch.projectId = values.projectId;
  const raster = project.document.layers.flatMap(layer => layer.cells).flatMap(cell => cell.content?.items ?? []).find(item => item.kind === "drawing-raster/v1") as {
    bitmap: Record<string, unknown> | null;
    tweenEndBitmap: Record<string, unknown> | null;
    motionTween: { mode: "position"; stageWidth: number; stageHeight: number; spriteBitmap: Record<string, unknown> | null; startOrigin: { x: number; y: number } | null; endOrigin: { x: number; y: number } | null } | null;
  } | undefined;
  if (!raster) throw new Error("large_template_raster_missing");
  const width = 4563;
  const height = 3302;
  const byteLength = width * height * 4;
  const first = new Uint8Array(byteLength);
  first.fill(17); first[0] = 18; first[first.length - 1] = 19;
  const second = new Uint8Array(byteLength);
  second.fill(29); second[0] = 30; second[second.length - 1] = 31;
  const digest = async (bytes: Uint8Array) => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes as BufferSource))).map(value => value.toString(16).padStart(2, "0")).join("");
  const firstDigest = await digest(first);
  const secondDigest = await digest(second);
  if (firstDigest !== "bec5d1eeab02892c679f6eebf16eef7b06d773ec130225d10e524f350be72029" || secondDigest !== "8b240803f9735aad67c47d5184540e8ad47bcc44f7dd1a3b8935064a0f8b77ec") throw new Error("large_fixture_digest");
  const firstId = `sha256:${firstDigest}`;
  const secondId = `sha256:${secondDigest}`;
  const reference = (assetId: string) => ({ __unifiedAssetRef: assetId, encoding: "typed-array", constructorName: "Uint8ClampedArray", byteLength });
  raster.bitmap = { width, height, data: reference(firstId), x: 0, y: 0, stageWidth: width, stageHeight: height };
  raster.tweenEndBitmap = { width, height, data: reference(secondId), x: 0, y: 0, stageWidth: width, stageHeight: height };
  raster.motionTween = { mode: "position", stageWidth: 1920, stageHeight: 1080, spriteBitmap: null, startOrigin: { x: 120, y: 80 }, endOrigin: { x: 220, y: 180 } };
  raster.motionTween.spriteBitmap = { width, height, data: reference(firstId) };
  const referencedIds = new Set<string>();
  const collectReferences = (value: unknown) => {
    if (value && typeof value === "object" && !Array.isArray(value) && "__unifiedAssetRef" in value) {
      referencedIds.add((value as { __unifiedAssetRef: string }).__unifiedAssetRef);
      return;
    }
    if (Array.isArray(value)) value.forEach(collectReferences);
    else if (value && typeof value === "object") Object.values(value).forEach(collectReferences);
  };
  collectReferences(project);
  const encodedJson = JSON.stringify(project);
  const metadataByteLength = new TextEncoder().encode(encodedJson).byteLength;
  const projectDigest = await digest(new TextEncoder().encode(encodedJson));
  if (projectDigest !== values.template.head.projectDigest) throw new Error("large_template_project_digest");
  const storedByteLength = metadataByteLength + [...referencedIds].reduce((total, assetId) => {
    if (assetId === firstId || assetId === secondId) return total + byteLength;
    const asset = values.template.smallAssets.find(candidate => candidate.assetId === assetId);
    if (!asset) throw new Error("large_template_asset_missing");
    return total + asset.byteLength;
  }, 0);
  await new Promise<void>((resolveTransaction, rejectTransaction) => {
    const write = database.transaction(["heads", "versions", "assets", "assetMetadata"], "readwrite");
    write.objectStore("assets").put({ assetId: firstId, sha256: firstDigest, byteLength, encoding: "typed-array", bytes: first });
    write.objectStore("assets").put({ assetId: secondId, sha256: secondDigest, byteLength, encoding: "typed-array", bytes: second });
    write.objectStore("assetMetadata").put({ assetId: firstId, sha256: firstDigest, byteLength, encoding: "typed-array" });
    write.objectStore("assetMetadata").put({ assetId: secondId, sha256: secondDigest, byteLength, encoding: "typed-array" });
    for (const asset of values.template.smallAssets) {
      if (!referencedIds.has(asset.assetId)) continue;
      const bytes = Uint8Array.from(atob(asset.bytesBase64), character => character.charCodeAt(0));
      write.objectStore("assets").put({ assetId: asset.assetId, sha256: asset.sha256, byteLength: asset.byteLength, encoding: asset.encoding, bytes });
      write.objectStore("assetMetadata").put({ assetId: asset.assetId, sha256: asset.sha256, byteLength: asset.byteLength, encoding: asset.encoding });
    }
    write.objectStore("versions").put({ projectId: values.projectId, revision: 1, projectDigest, metadataByteLength, storedByteLength, assetIds: [...referencedIds].sort(), encodedProject: project });
    write.objectStore("heads").put({ ...values.template.head, projectId: values.projectId, title: values.title, projectDigest, storedByteLength });
    write.oncomplete = () => resolveTransaction();
    write.onerror = () => rejectTransaction(write.error);
  });
  database.close();
  return { width, height, byteLength, projectDigest, storedByteLength };
}, input);

const largePersistenceSnapshot = (page: Page, projectId: string) => page.evaluate(async id => {
  const database = await new Promise<IDBDatabase>((resolveDatabase, rejectDatabase) => {
    const open = indexedDB.open("diamond-animation-unified-v2");
    open.onsuccess = () => resolveDatabase(open.result);
    open.onerror = () => rejectDatabase(open.error);
  });
  const read = <T>(store: string, key: IDBValidKey) => new Promise<T | undefined>((resolveRequest, rejectRequest) => {
    const request = database.transaction(store, "readonly").objectStore(store).get(key);
    request.onsuccess = () => resolveRequest(request.result);
    request.onerror = () => rejectRequest(request.error);
  });
  const head = await read<{ activeRevision: number; projectDigest: string; storedByteLength: number }>("heads", id);
  if (!head) throw new Error("large_head_missing");
  const version = await read<{ assetIds: string[] }>("versions", [id, head.activeRevision, head.projectDigest]);
  if (!version) throw new Error("large_version_missing");
  const metadata = await Promise.all(version.assetIds.map(assetId => read<{ assetId: string; byteLength: number }>("assetMetadata", assetId)));
  const direct = await read<unknown>("projects", id);
  database.close();
  return {
    revision: head.activeRevision,
    storedByteLength: head.storedByteLength,
    assetByteLengths: metadata.map(asset => asset?.byteLength ?? -1).sort((a, b) => b - a),
    largeAssetCount: metadata.filter(asset => asset?.byteLength === 60_268_104).length,
    directRecordRetired: direct === undefined,
  };
}, projectId);

const browserHeap = (page: Page, collect = false) => page.evaluate(async shouldCollect => {
  const exposed = globalThis as typeof globalThis & { gc?: () => void };
  if (shouldCollect) {
    exposed.gc?.();
    await new Promise<void>(resolveFrame => requestAnimationFrame(() => requestAnimationFrame(() => resolveFrame())));
  }
  const memory = (performance as Performance & { memory?: { usedJSHeapSize: number; totalJSHeapSize: number; jsHeapSizeLimit: number } }).memory;
  return memory ? { used: memory.usedJSHeapSize, total: memory.totalJSHeapSize, limit: memory.jsHeapSizeLimit } : null;
}, collect);

const home = async (page: Page) => {
  if (page.url() === "about:blank") await page.goto(url, { waitUntil: "networkidle" });
  else await page.reload({ waitUntil: "networkidle" });
  await page.getByRole("button", { name: /^Open Project/ }).waitFor();
};
const openProjects = async (page: Page) => {
  await home(page);
  await page.getByRole("button", { name: /^Open Project/ }).click();
  await page.getByRole("main", { name: "Projects", exact: true }).waitFor();
  await page.locator('[data-project-card="true"]').first().waitFor();
};
const waitForSettledRaster = async (page: Page) => {
  await page.waitForFunction(() => {
    const canvas = document.querySelector<HTMLCanvasElement>('[data-workspace-canvas="editable"]');
    const context = canvas?.getContext("2d", { willReadFrequently: true });
    if (!canvas || !context || canvas.width < 1 || canvas.height < 1) return false;
    return context.getImageData(Math.floor(canvas.width / 2), Math.floor(canvas.height / 2), 1, 1).data[3] > 0;
  }, undefined, { timeout: 30_000 });
};
const openTitle = async (page: Page, title: string, options: { waitForRaster?: boolean } = {}) => {
  await openProjects(page);
  const card = page.getByRole("button", { name: `Open ${title}`, exact: true });
  assert.equal(await card.count(), 1, `one card for ${title}`);
  const started = performance.now();
  await card.click();
  await page.getByText(title, { exact: true }).first().waitFor();
  try {
    await page.getByRole("button", { name: "File", exact: true }).waitFor();
    if (options.waitForRaster) await waitForSettledRaster(page);
  } catch (error) {
    throw new Error(`open_failed:${title}:${(await page.locator("body").innerText()).slice(0, 1200)}:console=${consoleErrors.slice(-5).join("|")}`, { cause: error });
  }
  return performance.now() - started;
};
const commonEditor = async (page: Page) => {
  for (const tab of ["Stick Figure Tools", "Properties", "Library", "Assets"]) {
    const button = page.getByRole("button", { name: tab, exact: true });
    assert.equal(await button.count(), 1);
    assert.equal(await button.isVisible(), true, `${tab} remains visible`);
  }
  assert.equal(await page.getByRole("button", { name: /Drawing Animation|Stick Figure Animation/ }).count(), 0);
  assert.equal(await page.getByRole("button", { name: "File", exact: true }).count(), 1);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth), false);
  const stage = await page.locator('[data-workspace-stage-guide="camera"]').boundingBox();
  assert.ok(stage && stage.width >= 260 && stage.height >= 146, `usable stage is at least 260x146 (received ${stage?.width ?? 0}x${stage?.height ?? 0})`);
};
const drawStroke = async (page: Page, offset = 0) => {
  await page.getByRole("button", { name: "Brush", exact: true }).click();
  const guide = await page.locator('[data-workspace-stage-guide="camera"]').boundingBox();
  assert.ok(guide);
  await page.mouse.move(guide.x + guide.width * (0.35 + offset * 0.01), guide.y + guide.height * 0.4);
  await page.mouse.down();
  await page.mouse.move(guide.x + guide.width * (0.5 + offset * 0.01), guide.y + guide.height * 0.52, { steps: 8 });
  await page.mouse.up();
  await pause();
};
const addStickSegment = async (page: Page) => {
  await page.getByRole("button", { name: "Stick Figure Tools", exact: true }).click();
  await page.getByRole("button", { name: "Add Limb", exact: true }).click();
  const overlay = page.locator('svg[aria-label="Editable stick figure content"]');
  const box = await overlay.boundingBox();
  assert.ok(box);
  await page.mouse.move(box.x + box.width * 0.32, box.y + box.height * 0.38);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.56, box.y + box.height * 0.62, { steps: 8 });
  await page.mouse.up();
  await pause();
};
const save = async (page: Page) => {
  const started = performance.now();
  await page.getByRole("button", { name: "File", exact: true }).click();
  await page.getByRole("menuitem", { name: "Save", exact: true }).click();
  await page.getByRole("status").filter({ hasText: "Saved on this browser" }).waitFor();
  return performance.now() - started;
};
const saveAs = async (page: Page, title: string) => {
  page.once("dialog", dialog => dialog.accept(title));
  await page.getByRole("button", { name: "File", exact: true }).click();
  await page.getByRole("menuitem", { name: "Save As", exact: true }).click();
  await page.getByText(title, { exact: true }).first().waitFor();
  await page.getByRole("status").filter({ hasText: "Saved on this browser" }).waitFor();
};
const visualInventory = (page: Page) => page.evaluate(() => {
  const canvas = document.querySelector<HTMLCanvasElement>('[data-workspace-canvas="editable"]');
  const context = canvas?.getContext("2d", { willReadFrequently: true });
  let opaque = 0;
  if (canvas && context) {
    const data = context.getImageData(0, 0, canvas.width, canvas.height).data;
    for (let index = 3; index < data.length; index += 4) if (data[index] > 0) opaque += 1;
  }
  const overlay = document.querySelector<SVGSVGElement>('svg[aria-label="Editable stick figure content"]');
  const stage = document.querySelector<HTMLElement>('[data-workspace-stage-guide="camera"]')?.getBoundingClientRect();
  return { opaque, segments: overlay?.querySelectorAll("line").length ?? 0, joints: overlay?.querySelectorAll("circle").length ?? 0, stage: stage ? { width: stage.width, height: stage.height } : null };
});
const screenshot = async (page: Page, name: string, target: string[]) => {
  const filename = `${name}.png`;
  await page.screenshot({ path: resolve(output, filename), fullPage: true });
  writeFileSync(resolve(output, `${name}.a11y.txt`), await page.locator("body").ariaSnapshot());
  target.push(filename);
};

try {
  for (const viewport of [{ name: "desktop", width: 1440, height: 900, deviceScaleFactor: 1 }, { name: "compact", width: 390, height: 844, deviceScaleFactor: 2 }]) {
    const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height }, deviceScaleFactor: viewport.deviceScaleFactor, serviceWorkers: "block" });
    await configure(context);
    const page = await context.newPage();
    page.on("pageerror", error => pageErrors.push(`${viewport.name}:${error.message}`));
    page.on("console", message => {
      if (message.type() !== "error") return;
      const location = message.location().url;
      if (location && new URL(location).pathname === "/favicon.ico") return;
      consoleErrors.push(`${viewport.name}:${location}:${message.text()}`);
    });
    await page.goto(url, { waitUntil: "networkidle" });
    await seed(page);
    await resetWrites(page);
    const sourceBefore = await sourceSnapshot(page);
    const operations: string[] = [];
    const screenshots: string[] = [];
    const timings = { openMs: [] as number[], saveMs: [] as number[], selectionSettleMs: [] as number[], longTasksMs: [] as number[] };

    await home(page);
    await page.getByRole("button", { name: /^New Project/ }).click();
    await page.getByText("Untitled Project", { exact: true }).waitFor();
    await commonEditor(page);
    await drawStroke(page);
    await addStickSegment(page);
    const nativeBeforeSave = await visualInventory(page);
    assert.ok(nativeBeforeSave.opaque > 0 && nativeBeforeSave.segments > 0);
    timings.saveMs.push(await save(page));
    let canonical = await canonicalSnapshot(page);
    const nativeHead = canonical.heads.find(head => head.title === "Untitled Project");
    assert.ok(nativeHead && nativeHead.provenance?.kind === "native");
    assert.equal(nativeHead.activeRevision, 1);
    operations.push(`${viewport.name}:native-first-save`);

    const gate = await page.evaluateHandle(() => {
      const original = crypto.subtle.digest.bind(crypto.subtle);
      let release!: () => void;
      const blocked = new Promise<void>(resolveGate => { release = resolveGate; });
      crypto.subtle.digest = async (algorithm, data) => { await blocked; return original(algorithm, data); };
      return { release() { crypto.subtle.digest = original; release(); } };
    });
    await page.getByRole("button", { name: "File", exact: true }).click();
    await page.getByRole("menuitem", { name: "Save", exact: true }).click();
    await page.getByRole("status").filter({ hasText: "Saving" }).waitFor();
    await drawStroke(page, 1);
    await gate.evaluate(value => value.release());
    await page.getByRole("status").filter({ hasText: "Unsaved changes" }).waitFor();
    operations.push(`${viewport.name}:stale-generation-dirty`);
    timings.saveMs.push(await save(page));

    if (viewport.name === "desktop") {
      const second = await context.newPage();
      second.on("pageerror", error => pageErrors.push(`desktop-race:${error.message}`));
      await openTitle(second, "Untitled Project");
      await drawStroke(page, 2);
      await drawStroke(second, 3);
      await save(page);
      await second.getByRole("button", { name: "File", exact: true }).click();
      await second.getByRole("menuitem", { name: "Save", exact: true }).click();
      await second.getByRole("status").filter({ hasText: "Save failed" }).waitFor();
      operations.push("desktop:concurrent-tab-cas");
      await second.close();
    }

    await saveAs(page, `${viewport.name} Native Copy`);
    const nativeCopyInventory = await visualInventory(page);
    assert.ok(nativeCopyInventory.opaque > 0 && nativeCopyInventory.segments > 0);
    canonical = await canonicalSnapshot(page);
    const nativeCopyHead = canonical.heads.find(head => head.title === `${viewport.name} Native Copy`);
    assert.ok(nativeCopyHead?.provenance?.kind === "copy" && nativeCopyHead.provenance.parentProjectId === nativeHead.projectId);
    assert.ok(canonical.heads.some(head => head.projectId === nativeHead.projectId));
    operations.push(`${viewport.name}:native-save-as`);

    const largeId = largeCanonicalTemplate.head.projectId;
    const largeTitle = largeCanonicalTemplate.head.title;
    const largeSeed = await seedLargeCanonicalV2(page, { template: largeCanonicalTemplate, projectId: largeId, title: largeTitle });
    const largeShellOpenMs = await openTitle(page, largeTitle);
    await commonEditor(page);
    const largeImmediateSaveMs = await save(page);
    const largeImmediatelySaved = await largePersistenceSnapshot(page, largeId);
    assert.equal(largeImmediatelySaved.revision, 2);
    assert.equal(largeImmediatelySaved.largeAssetCount, 2, `immediate large persistence snapshot ${JSON.stringify(largeImmediatelySaved)}`);
    const largeOpenMs = await openTitle(page, largeTitle, { waitForRaster: true });
    await commonEditor(page);
    const largeOpenHeap = await browserHeap(page);
    const largeSaveMs = await save(page);
    const largeSaved = await largePersistenceSnapshot(page, largeId);
    {
      assert.equal(largeSaved.revision, 3);
      assert.equal(largeSaved.largeAssetCount, 2, `large persistence snapshot ${JSON.stringify(largeSaved)}`);
      assert.equal(largeSaved.directRecordRetired, true);
      assert.ok(largeSaved.storedByteLength < 134_217_728);
    }
    const largeReopenMs = await openTitle(page, largeTitle, { waitForRaster: true });
    await commonEditor(page);
    const largeReopenHeap = await browserHeap(page);
    await home(page);
    const largeIdleHeap = await browserHeap(page, true);
    const largeHeapSamples = [largeOpenHeap?.used ?? 0, largeReopenHeap?.used ?? 0];
    assert.ok(Math.max(...largeHeapSamples) <= 512 * 1024 * 1024, `large browser sampled JS heap stays within 512 MiB: ${JSON.stringify({ largeOpenHeap, largeReopenHeap, largeIdleHeap })}`);
    assert.ok((largeIdleHeap?.used ?? 0) <= 320 * 1024 * 1024, `large browser settled JS heap stays within 320 MiB: ${JSON.stringify(largeIdleHeap)}`);
    assert.ok(largeOpenMs <= (viewport.name === "desktop" ? 7500 : 12000));
    assert.ok(largeReopenMs <= (viewport.name === "desktop" ? 7500 : 12000));
    assert.ok(largeSaveMs <= (viewport.name === "desktop" ? 10000 : 15000));
    operations.push(`${viewport.name}:large-v2-open-save-reopen`);

    for (let run = 0; run < 5; run += 1) {
      timings.openMs.push(await openTitle(page, `${viewport.name} Native Copy`));
      await drawStroke(page, 4 + run);
      timings.saveMs.push(await save(page));
    }
    await page.evaluate(() => { document.documentElement.dataset.phase6LongTasks = "[]"; });
    const frameOne = page.locator('[data-timeline-cell="true"][data-frame-index="0"]').first();
    for (let index = 0; index < 120; index += 1) {
      const started = performance.now();
      await frameOne.click();
      await page.evaluate(() => new Promise<void>(resolveFrame => requestAnimationFrame(() => resolveFrame())));
      timings.selectionSettleMs.push(performance.now() - started);
    }
    timings.longTasksMs = await page.evaluate(() => JSON.parse(document.documentElement.dataset.phase6LongTasks ?? "[]") as number[]);
    await screenshot(page, `${viewport.name}-native-reopen`, screenshots);

    const sourceCases: readonly {
      title: string;
      kind: "drawing-v1" | "drawing-v2" | "stick-v1" | "stick-v2" | "unified-v1";
      sourceId: string;
      opposite: "drawing" | "stick";
    }[] = [
      { title: "Drawing study (V1)", kind: "drawing-v1", sourceId: "60000000-0000-4000-8000-000000000011", opposite: "stick" },
      { title: "Drawing study (V2)", kind: "drawing-v2", sourceId: "60000000-0000-4000-8000-000000000012", opposite: "stick" },
      { title: "Stick study (V1)", kind: "stick-v1", sourceId: "60000000-0000-4000-8000-000000000013", opposite: "drawing" },
      { title: "Stick study (V2)", kind: "stick-v2", sourceId: "60000000-0000-4000-8000-000000000014", opposite: "drawing" },
      { title: "Unified study (V1)", kind: "unified-v1", sourceId: unifiedMigration.candidate.project.projectId, opposite: "stick" },
    ];
    const adoption: unknown[] = [];
    for (const sourceCase of sourceCases) {
      await openTitle(page, sourceCase.title);
      await commonEditor(page);
      const beforeEdit = await visualInventory(page);
      if (sourceCase.opposite === "stick") await addStickSegment(page); else await drawStroke(page);
      const edited = await visualInventory(page);
      if (sourceCase.opposite === "stick") assert.ok(edited.segments > beforeEdit.segments, `${sourceCase.kind} opposite stick edit`);
      else assert.ok(edited.opaque > beforeEdit.opaque, `${sourceCase.kind} opposite Drawing edit`);
      const beforeCanonical = await canonicalSnapshot(page);
      timings.saveMs.push(await save(page));
      const afterSave = await canonicalSnapshot(page);
      const adopted = afterSave.heads.find(head => !beforeCanonical.heads.some(previous => previous.projectId === head.projectId));
      assert.ok(adopted);
      assert.notEqual(adopted.projectId, sourceCase.sourceId);
      assert.equal(adopted.activeRevision, 1);
      assert.equal(adopted.provenance?.kind, "legacy-adoption");
      assert.equal(adopted.provenance?.sourceKind, sourceCase.kind);
      assert.equal(adopted.provenance?.sourceProjectId, sourceCase.sourceId);
      assert.deepEqual(await sourceSnapshot(page), sourceBefore);
      await openTitle(page, sourceCase.title);
      const reopened = await visualInventory(page);
      if (sourceCase.opposite === "stick") assert.ok(reopened.segments > beforeEdit.segments); else assert.ok(reopened.opaque > beforeEdit.opaque);
      await openProjects(page);
      assert.equal(await page.getByRole("button", { name: `Open ${sourceCase.title}`, exact: true }).count(), 1);
      assert.equal(await page.getByRole("button", { name: `Open ${sourceCase.title}`, exact: true }).getByText("Saved here · original kept", { exact: true }).count(), 1);
      await page.getByRole("button", { name: `Open ${sourceCase.title}`, exact: true }).click();
      await page.getByText(sourceCase.title, { exact: true }).first().waitFor();
      const oldHead = afterSave.heads.find(head => head.projectId === adopted.projectId)!;
      const copyTitle = `${viewport.name} ${sourceCase.kind} Copy`;
      await saveAs(page, copyTitle);
      const afterCopy = await canonicalSnapshot(page);
      const copyHead = afterCopy.heads.find(head => head.title === copyTitle);
      assert.ok(copyHead?.provenance?.kind === "copy" && copyHead.provenance.parentProjectId === adopted.projectId);
      assert.equal(afterCopy.heads.find(head => head.projectId === adopted.projectId)?.projectDigest, oldHead.projectDigest);
      assert.deepEqual(await sourceSnapshot(page), sourceBefore);
      adoption.push({ ...sourceCase, adoptedProjectId: adopted.projectId, copyProjectId: copyHead.projectId, reopened, sourceDigest: adopted.provenance?.sourceRecordDigest });
      operations.push(`${viewport.name}:${sourceCase.kind}:open-adopt-reopen-save-as`);
    }
    await screenshot(page, `${viewport.name}-last-adopted-copy`, screenshots);
    const sourceAfter = await sourceSnapshot(page);
    assert.deepEqual(sourceAfter, sourceBefore);
    assert.deepEqual(await sourceWrites(page), []);
    assert.ok(median(timings.openMs) <= (viewport.name === "desktop" ? 5000 : 8000));
    assert.ok(Math.max(...timings.openMs) <= (viewport.name === "desktop" ? 7500 : 12000));
    assert.ok(median(timings.saveMs) <= (viewport.name === "desktop" ? 6000 : 10000));
    assert.ok(Math.max(...timings.saveMs) <= (viewport.name === "desktop" ? 10000 : 15000));
    assert.ok(percentile(timings.selectionSettleMs, 0.95) <= (viewport.name === "desktop" ? 100 : 150));
    assert.ok(timings.longTasksMs.filter(value => value > 500).length === 0);
    assert.ok(timings.longTasksMs.filter(value => value > 100).length <= (viewport.name === "desktop" ? 5 : 8));
    profileResults.push({
      profile: viewport.name,
      viewport,
      operations,
      adoption,
      native: { originalId: nativeHead.projectId, copyId: nativeCopyHead.projectId, beforeSave: nativeBeforeSave, reopened: nativeCopyInventory },
      large: { seed: largeSeed, shellOpenMs: largeShellOpenMs, immediateSaveMs: largeImmediateSaveMs, immediatelyPersisted: largeImmediatelySaved, openMs: largeOpenMs, saveMs: largeSaveMs, reopenMs: largeReopenMs, persisted: largeSaved, heap: { open: largeOpenHeap, reopen: largeReopenHeap, settled: largeIdleHeap } },
      timings,
      sourceBefore,
      sourceAfter,
      screenshots,
    });
    await context.close();
  }
  assert.deepEqual(pageErrors, []);
  assert.deepEqual(consoleErrors, []);
  assert.equal(requests.filter(request => request.disposition === "blocked").length, 0);
  const result = {
    status: "PASS",
    url,
    profiles: profileResults,
    requests,
    pageErrors,
    consoleErrors,
    externalRequests: 0,
    realApiRequests: 0,
    sourceWrites: 0,
    sourceKinds: ["drawing-v1", "drawing-v2", "stick-v1", "stick-v2", "unified-v1", "unified-v2"],
    limits: { compactEvidence: "Chromium browser profile, not a physical phone", memory: "JS heap samples do not measure native/GPU allocations" },
    createdAt: new Date().toISOString(),
  };
  const resultPath = resolve(output, "result.json");
  writeFileSync(resultPath, JSON.stringify(result, null, 2) + "\n");
  console.log(JSON.stringify({ status: "PASS", profiles: profileResults.length, operations: profileResults.reduce((total, profile) => total + profile.operations.length, 0), sourceAdoptions: profileResults.reduce((total, profile) => total + profile.adoption.length, 0), screenshots: profileResults.flatMap(profile => profile.screenshots).length, result: resultPath, sha256: sha(JSON.stringify(result)) }));
} finally {
  await browser.close();
}
