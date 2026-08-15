import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { chromium } from "playwright-core";
import ts from "typescript";

let assertions = 0;
const equal = (actual: unknown, expected: unknown, message?: string) => { assertions += 1; assert.equal(actual, expected, message); };
const deepEqual = (actual: unknown, expected: unknown, message?: string) => { assertions += 1; assert.deepEqual(actual, expected, message); };
const ok = (actual: unknown, message?: string) => { assertions += 1; assert.ok(actual, message); };

const root = process.cwd();
const fixtureRoot = resolve(root, "scripts/fixtures/drawing-persistence/v2");
const cases = JSON.parse(readFileSync(resolve(fixtureRoot, "browser-engine-cases.json"), "utf8"));
equal(cases.fixtureVersion, 1);
equal(cases.cases.length, 12);

const temporaryRoot = mkdtempSync(resolve(tmpdir(), "diamond-spec0002-engine-"));
const profileRoot = resolve(temporaryRoot, "chrome-profile");
const webRoot = resolve(temporaryRoot, "web");
const moduleSources = [
  "drawingProjectV2Contract.ts",
  "drawingProjectV2Canonical.ts",
  "drawingProjectRasterCodec.ts",
  "drawingProjectAudioCodec.ts",
  "drawingProjectV1Compatibility.ts",
  "drawingProjectV2Repository.ts",
  "drawingProjectIndexedDb.ts",
];

const ensureDirectory = async () => {
  const { mkdir } = await import("node:fs/promises");
  await mkdir(webRoot, { recursive: true });
};
await ensureDirectory();
for (const sourceName of moduleSources) {
  const source = readFileSync(resolve(root, "src/lib", sourceName), "utf8");
  const transpiled = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
    fileName: sourceName,
    reportDiagnostics: true,
  });
  if (transpiled.diagnostics?.some((diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error)) {
    throw new Error(`Browser transpile failed for ${sourceName}.`);
  }
  writeFileSync(resolve(webRoot, sourceName.replace(/\.ts$/, ".js")), transpiled.outputText.replace(/\.ts"/g, '.js"'));
}

const engineSource = String.raw`
import { createDrawingProjectIndexedDbAdapter } from "./drawingProjectIndexedDb.js";
import { createDrawingProjectV2Repository } from "./drawingProjectV2Repository.js";
import { encodeDrawingRasterAsset, verifyDrawingRasterAsset } from "./drawingProjectRasterCodec.js";
import { createCanonicalWavDataUrl, hydrateDrawingSoundAttachment, snapshotDrawingSoundAttachment } from "./drawingProjectAudioCodec.js";
import { attemptDrawingProjectLegacyCleanup, classifyDrawingProjectV1RawRoot, DRAWING_PROJECT_V1_STORAGE_KEY } from "./drawingProjectV1Compatibility.js";

const nativeEncoder = ({width, height, rgba}) => new Promise((resolve, reject) => {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", {willReadFrequently: true});
  context.putImageData(new ImageData(new Uint8ClampedArray(rgba), width, height), 0, 0);
  canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("toBlob returned null")), "image/png");
});

const nativeDecoder = async (encoded) => {
  const bitmap = await createImageBitmap(new Blob([encoded], {type: "image/png"}));
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const context = canvas.getContext("2d", {willReadFrequently: true});
  context.drawImage(bitmap, 0, 0);
  const rgba = new Uint8Array(context.getImageData(0, 0, bitmap.width, bitmap.height).data);
  return {width: bitmap.width, height: bitmap.height, rgba, release: () => bitmap.close()};
};

const legacyProject = (id) => ({
  id, name: "Legacy " + id,
  data: {version:1,activeTool:"Brush",brushSize:10,eraserSize:20,fillColor:"#000000",timelineFps:12,shapeType:"Square",activeLayerId:"legacy-layer",currentFrameIndex:0,selectedTimelineIndex:0,isOnionEnabled:false,layers:[{id:"legacy-layer",name:"Layer 1",orderIndex:0,timelineFrames:[{id:1,kind:"keyframe",cellType:"keyframe",stateId:1,bitmap:null,previewUrl:null,tweenEndBitmap:null,tweenEndPreviewUrl:null,motionTween:null,soundAttachment:null,textObjects:[]}]}],nextTimelineFrameId:2,nextLayerNumber:2},
  previewDataUrl:null,aiMemory:null,created_at:"2026-08-15T00:00:00.000Z",updated_at:"2026-08-15T00:00:00.000Z"
});

window.runSpec0002Engine = async () => {
  const opaque = new Uint8Array([255, 10, 20, 255, 30, 240, 40, 255, 50, 60, 230, 255, 80, 90, 100, 255]);
  const transparent = new Uint8Array([255, 0, 0, 255, 0, 0, 0, 0, 0, 255, 0, 128, 0, 0, 255, 255]);
  const rasterResults = [];
  let primaryAsset = null;
  for (const [name, rgba] of [["opaque", opaque], ["transparent", transparent]]) {
    const asset = await encodeDrawingRasterAsset({assetId: "raster-" + name, width:2, height:2, rgba}, nativeEncoder);
    const counts = {blobReads:0,pngPreflights:0,nativeDecodes:0,releases:0};
    const decoded = await verifyDrawingRasterAsset(asset, nativeDecoder, counts);
    rasterResults.push({name, exact: Array.from(decoded.rgba).join(",") === Array.from(rgba).join(","), counts, encodedBytes:asset.encodedByteLength});
    if (name === "transparent") primaryAsset = asset;
  }
  const oversizedCounts = {blobReads:0,pngPreflights:0,nativeDecodes:0,releases:0};
  const oversizedBlob = new class extends Blob {
    constructor() { super([new Uint8Array([1])], {type:"image/png"}); this.reads = 0; }
    get size() { return 134217729; }
    async arrayBuffer() { this.reads += 1; throw new Error("UNSAFE_READ_REACHED"); }
  }();
  let oversizedCode = null;
  try {
    await encodeDrawingRasterAsset({assetId:"oversized-browser",width:1,height:1,rgba:new Uint8Array(4)}, async () => oversizedBlob, oversizedCounts);
  } catch (error) {
    oversizedCode = error.code;
  }
  const wav = new Uint8Array([82,73,70,70,4,0,0,0,87,65,86,69]);
  const liveSound = {id:"sound-browser",title:"Browser wave",description:"Exact",timingFeel:null,intensityFeel:"soft",audioDataUrl:createCanonicalWavDataUrl(wav),contentType:"sfx",speechText:null,sourceTask:"generate-sounds",attachedAt:"2026-08-15T00:00:00.000Z"};
  const sound = await snapshotDrawingSoundAttachment(liveSound);
  const hydratedSound = await hydrateDrawingSoundAttachment(sound.attachment, sound.asset);
  const documentValue = {
    kind:"diamond-drawing-document",schemaVersion:2,activeTool:"Brush",brushSize:10,eraserSize:20,fillColor:"#000000",timelineFps:12,shapeType:"Square",activeLayerId:"layer-1",currentFrameIndex:0,selectedTimelineIndex:0,isOnionEnabled:false,
    layers:[{id:"layer-1",name:"Layer 1",orderIndex:0,timelineFrames:[{id:1,kind:"keyframe",cellType:"keyframe",stateId:1,isBlank:false,hasTweenEndpoint:false,bitmap:{assetId:primaryAsset.assetId},tweenEndBitmap:null,motionTween:null,soundAttachment:sound.attachment,textObjects:[]}]}],nextTimelineFrameId:2,nextLayerNumber:2
  };
  const dbName = "diamond-spec0002-" + crypto.randomUUID();
  const adapter = createDrawingProjectIndexedDbAdapter({indexedDB, databaseName:dbName});
  const repository = createDrawingProjectV2Repository(adapter, {legacyMaintainer: async () => ({status:"pending",legacyPresence:"present",code:"maintenance_required"})});
  const saved = await repository.save({projectId:"browser-project",title:"Browser",createdAt:"2026-08-15T00:00:00.000Z",updatedAt:"2026-08-15T00:00:00.000Z",expectedRevision:null,document:documentValue,assets:[primaryAsset,sound.asset]});
  const readBack = await adapter.readVersion("browser-project", 1);
  let duplicateStageCode = null;
  try { await adapter.stageCandidate(saved.record); } catch (error) { duplicateStageCode = error.code; }
  const headAfterDuplicate = await adapter.getHead("browser-project");

  const rawDb = await new Promise((resolve, reject) => { const request=indexedDB.open(dbName,1); request.onsuccess=()=>resolve(request.result); request.onerror=()=>reject(request.error); });
  const abortTransaction = rawDb.transaction("drawingProjectHeadsV2", "readwrite");
  abortTransaction.objectStore("drawingProjectHeadsV2").put({...saved.head,projectId:"aborted-head"});
  const abortObserved = new Promise((resolve) => { abortTransaction.onabort=()=>resolve(true); abortTransaction.oncomplete=()=>resolve(false); });
  abortTransaction.abort();
  const aborted = await abortObserved;
  rawDb.close();
  const abortedHead = await adapter.getHead("aborted-head");

  const deleted = await repository.deleteV2({projectId:"browser-project",expectedRevision:1,legacyRecordDigest:"1".repeat(64)});
  const tombstones = await adapter.listTombstones();
  const legacyResult = await classifyDrawingProjectV1RawRoot(JSON.stringify([legacyProject("browser-project")]));
  const catalog = await repository.loadCatalog(legacyResult);

  const targetSlice = "  " + JSON.stringify(legacyProject("cleanup-target")) + " ";
  const neighborSlice = "\n " + JSON.stringify(legacyProject("cleanup-neighbor")) + "  ";
  localStorage.setItem(DRAWING_PROJECT_V1_STORAGE_KEY, "[" + targetSlice + "," + neighborSlice + "]");
  const cleanup = await attemptDrawingProjectLegacyCleanup(
    {getItem:(key)=>localStorage.getItem(key),setItem:(key,value)=>localStorage.setItem(key,value)},
    {request:(name,callback)=>navigator.locks.request(name,{ifAvailable:true},(lock)=>lock?callback():null)},
    "cleanup-target",
    null,
  );
  const cleanupRoot = localStorage.getItem(DRAWING_PROJECT_V1_STORAGE_KEY);
  localStorage.clear();
  await adapter.deleteDatabase();
  return {
    rasterResults,
    oversizedEncoder:{code:oversizedCode,reads:oversizedBlob.reads,counts:oversizedCounts},
    audioExact: JSON.stringify(hydratedSound) === JSON.stringify(liveSound),
    save:{status:saved.status,revision:saved.head.activeStorageRevision,readBack:Boolean(readBack),duplicateStageCode,headRevisionAfterDuplicate:headAfterDuplicate?.activeStorageRevision},
    abort:{aborted,headAbsent:abortedHead===null},
    deletion:{status:deleted.status,legacyCleanup:deleted.legacyCleanup,tombstoneCount:tombstones.length,catalogHasDeleted:catalog.entries.some((entry)=>entry.projectId==="browser-project")},
    cleanup:{status:cleanup.status,neighborExact:cleanupRoot === "[" + neighborSlice + "]"},
    noAppMount:document.querySelector("[data-diamond-animator], #__next")===null,
    indexedDbAbsentAfterCleanup:!indexedDB.databases || !(await indexedDB.databases()).some((entry)=>entry.name===dbName),
  };
};
`;
writeFileSync(resolve(webRoot, "engine.js"), engineSource);
writeFileSync(resolve(webRoot, "index.html"), '<!doctype html><meta charset="utf-8"><title>SPEC-0002 isolated engine</title><main id="engine-only">isolated engine</main><script type="module" src="/engine.js"></script>');

const serverScript = resolve(fixtureRoot, "browserEngineServer.cjs");
const denyScript = resolve(fixtureRoot, "network-deny.cjs");
const server = spawn(process.execPath, [serverScript], {
  cwd: root,
  env: {
    PATH: process.env.PATH ?? "",
    NODE_ENV: "test",
    NODE_OPTIONS: `--require=${denyScript}`,
    SPEC0002_BROWSER_ROOT: webRoot,
  },
  stdio: ["ignore", "pipe", "pipe"] as const,
});
let serverStderr = "";
server.stderr.setEncoding("utf8");
server.stderr.on("data", (chunk: string) => { serverStderr += chunk; });
const ready = await new Promise<{ port: number; serverDenials: Array<{ primitive: string }> }>((resolveReady, rejectReady) => {
  let buffer = "";
  const timeout = setTimeout(() => rejectReady(new Error(`Server ready timeout: ${serverStderr}`)), 10_000);
  server.stdout.setEncoding("utf8");
  server.stdout.on("data", (chunk: string) => {
    buffer += chunk;
    const lineEnd = buffer.indexOf("\n");
    if (lineEnd >= 0) {
      clearTimeout(timeout);
      resolveReady(JSON.parse(buffer.slice(0, lineEnd)));
    }
  });
  server.once("exit", (code: number | null) => {
    clearTimeout(timeout);
    rejectReady(new Error(`Server exited before ready (${code}): ${serverStderr}`));
  });
});

const origin = `http://127.0.0.1:${ready.port}`;
const browserLedger: Array<{ type: string; url: string }> = [];
let context: Awaited<ReturnType<typeof chromium.launchPersistentContext>> | null = null;
try {
  context = await chromium.launchPersistentContext(profileRoot, {
    executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    headless: true,
    serviceWorkers: "block",
    args: [
      "--disable-background-networking",
      "--disable-component-update",
      "--disable-default-apps",
      "--disable-domain-reliability",
      "--disable-features=MediaRouter,OptimizationHints,Translate",
      "--disable-sync",
      "--metrics-recording-only",
      "--no-first-run",
    ],
  });
  await context.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.origin === origin) await route.continue();
    else {
      browserLedger.push({ type: "fetch", url: url.href });
      await route.abort("blockedbyclient");
    }
  });
  await context.routeWebSocket(/.*/, (socket) => {
    const url = new URL(socket.url());
    if (url.origin !== origin) {
      browserLedger.push({ type: "websocket", url: url.href });
      socket.close({ code: 1008, reason: "SPEC0002_BROWSER_NETWORK_DENIED" });
    }
  });
  const page = context.pages()[0] ?? await context.newPage();
  await page.goto(origin, { waitUntil: "load" });
  await page.waitForFunction(() => typeof (window as unknown as { runSpec0002Engine?: unknown }).runSpec0002Engine === "function");
  const importState = await page.evaluate(async () => ({
    databaseCount: indexedDB.databases ? (await indexedDB.databases()).length : 0,
    localStorageLength: localStorage.length,
  }));
  deepEqual(importState, { databaseCount: 0, localStorageLength: 0 });
  const fetchDenied = await page.evaluate(async () => {
    try { await fetch("https://spec0002.invalid/browser-fetch"); return false; } catch { return true; }
  });
  const websocketDenied = await page.evaluate(() => new Promise<boolean>((resolveDenied) => {
    const socket = new WebSocket("wss://spec0002.invalid/browser-websocket");
    const timeout = setTimeout(() => resolveDenied(false), 2_000);
    socket.onopen = () => { clearTimeout(timeout); resolveDenied(false); };
    socket.onerror = () => { clearTimeout(timeout); resolveDenied(true); };
    socket.onclose = () => { clearTimeout(timeout); resolveDenied(true); };
  }));
  const result = await page.evaluate(() => (window as unknown as { runSpec0002Engine: () => Promise<unknown> }).runSpec0002Engine()) as {
    rasterResults: Array<{ name: string; exact: boolean; counts: Record<string, number>; encodedBytes: number }>;
    oversizedEncoder: { code: string; reads: number; counts: Record<string, number> };
    audioExact: boolean;
    save: { status: string; revision: number; readBack: boolean; duplicateStageCode: string; headRevisionAfterDuplicate: number };
    abort: { aborted: boolean; headAbsent: boolean };
    deletion: { status: string; legacyCleanup: string; tombstoneCount: number; catalogHasDeleted: boolean };
    cleanup: { status: string; neighborExact: boolean };
    noAppMount: boolean;
    indexedDbAbsentAfterCleanup: boolean;
  };
  deepEqual(result.rasterResults.map(({ name, exact }) => ({ name, exact })), [{ name: "opaque", exact: true }, { name: "transparent", exact: true }]);
  for (const raster of result.rasterResults) {
    deepEqual(raster.counts, { blobReads: 1, pngPreflights: 1, nativeDecodes: 1, releases: 1 });
    ok(raster.encodedBytes > 0);
  }
  deepEqual(result.oversizedEncoder, {
    code: "project_too_large",
    reads: 0,
    counts: { blobReads: 0, pngPreflights: 0, nativeDecodes: 0, releases: 0 },
  });
  equal(result.audioExact, true);
  deepEqual(result.save, { status: "saved", revision: 1, readBack: true, duplicateStageCode: "storage_write_failed", headRevisionAfterDuplicate: 1 });
  deepEqual(result.abort, { aborted: true, headAbsent: true });
  deepEqual(result.deletion, { status: "deleted", legacyCleanup: "pending", tombstoneCount: 1, catalogHasDeleted: false });
  deepEqual(result.cleanup, { status: "cleaned", neighborExact: true });
  equal(result.noAppMount, true);
  equal(result.indexedDbAbsentAfterCleanup, true);
  equal(fetchDenied, true);
  equal(websocketDenied, true);
  deepEqual(browserLedger.map((entry) => entry.type).sort(), ["fetch", "websocket"]);
  equal(ready.serverDenials.length, 8);
  deepEqual(new Set(ready.serverDenials.map((entry) => entry.primitive)), new Set(["fetch", "http.get", "https.get", "net.connect", "tls.connect", "dns.lookup", "dns.promises.lookup", "child_process.spawn"]));
  equal(dirname(fileURLToPath(import.meta.url)), resolve(root, "scripts"));
  equal(basename(serverScript), "browserEngineServer.cjs");
  console.log(`SPEC-0002 browser engine validator passed. ASSERTIONS: ${assertions}`);
  console.log(JSON.stringify({ browser: await context.browser()?.version(), result, network: { browserLedger, serverDenials: ready.serverDenials.length, nonLoopbackTraffic: 0 }, appMounted: false }));
} finally {
  if (context) await context.close().catch(() => undefined);
  server.kill("SIGTERM");
  await new Promise<void>((resolveExit) => {
    if (server.exitCode !== null) resolveExit();
    else {
      const timeout = setTimeout(() => { server.kill("SIGKILL"); resolveExit(); }, 5_000);
      server.once("exit", () => { clearTimeout(timeout); resolveExit(); });
    }
  });
  rmSync(temporaryRoot, { recursive: true, force: true });
}
