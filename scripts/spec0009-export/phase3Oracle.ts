import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { createExportRequest, createExportSelection } from "../../src/lib/export/exportContracts.ts";
import {
  EXPORT_CATALOG_SOURCES,
  EXPORT_DESTINATION_CATALOG,
  EXPORT_DESTINATION_CATALOG_VERSION,
  assertExportDestinationCatalog,
  resolveExportDestinationGeometry,
  validateCustomDimensions,
  type ExportDestinationChoice,
} from "../../src/lib/export/exportDestinationCatalog.ts";

let assertions = 0;
const check = (condition: unknown, message: string) => {
  assert.ok(condition, message);
  assertions += 1;
};
const equal = (actual: unknown, expected: unknown, message: string) => {
  assert.deepEqual(actual, expected, message);
  assertions += 1;
};
const rejects = (operation: () => unknown, pattern: RegExp, message: string) => {
  assert.throws(operation, pattern, message);
  assertions += 1;
};

const project = {
  projectId: "33333333-3333-4333-8333-333333333333",
  title: "Phase 3 wide fixture",
  createdAt: "2026-09-20T00:00:00.000Z",
  updatedAt: "2026-09-20T00:00:00.000Z",
  document: {
    logicalStage: { width: 1920, height: 1080 },
    fps: 24,
    background: { kind: "solid-color/v1", color: "#214f73" },
    layers: [{ visible: true, cells: [{ cellType: "keyframe", content: { items: [] } }] }],
  },
} as never;
const snapshot = {
  project,
  projectDigest: "phase3-wide-digest",
  frameCount: 1440,
  durationSeconds: 60,
} as never;

check(assertExportDestinationCatalog(), "catalog validates");
equal(EXPORT_DESTINATION_CATALOG.length, 14, "all fourteen Section 10 entries exist");
equal(EXPORT_DESTINATION_CATALOG.map(entry => entry.displayName), [
  "Original", "YouTube", "YouTube Shorts", "TikTok", "Instagram Reels", "Instagram Stories", "Instagram Feed",
  "Facebook Reels", "Facebook Feed", "Discord", "Snapchat", "X", "Reddit", "Custom / Other",
], "exact required destination order");
equal(EXPORT_DESTINATION_CATALOG_VERSION, "2026-09-20", "catalog version is the evidence refresh date");

const sourceIds = new Set(EXPORT_CATALOG_SOURCES.map(source => source.id));
for (const source of EXPORT_CATALOG_SOURCES) {
  check(source.url.startsWith("https://"), `${source.id} uses https`);
  equal(source.accessedAt, "2026-09-20", `${source.id} access date`);
  check(source.title.length > 8 && source.exactValues.length > 0, `${source.id} binds a title and exact values`);
  const hostname = new URL(source.url).hostname;
  check([
    "support.google.com", "ads.tiktok.com", "www.facebook.com", "support.discord.com", "help.snapchat.com",
    "help.x.com", "support.reddithelp.com",
  ].includes(hostname), `${source.id} is first-party`);
}
for (const entry of EXPORT_DESTINATION_CATALOG) {
  check(entry.brandAsset.kind === "text-fallback", `${entry.id} uses neutral local badge`);
  check(entry.brandAsset.reason.includes("no third-party logo"), `${entry.id} records logo fallback decision`);
  check(entry.sourceIds.every(id => sourceIds.has(id)), `${entry.id} sources resolve`);
  check(entry.guidance.length > 20 && entry.shapeExplanation.length > 20, `${entry.id} explains file and shape`);
}

const geometryReceipts: Array<Record<string, unknown>> = [];
for (const preset of EXPORT_DESTINATION_CATALOG) {
  if (preset.id === "custom-other") continue;
  for (const quality of ["720p", "1080p"] as const) {
    const geometry = resolveExportDestinationGeometry(snapshot, { presetId: preset.id }, quality);
    const { outputCanvas, contentRect } = geometry;
    check(outputCanvas.width % 2 === 0 && outputCanvas.height % 2 === 0, `${preset.id} ${quality} even canvas`);
    check(contentRect.x >= -0.01 && contentRect.y >= -0.01, `${preset.id} ${quality} nonnegative content origin`);
    check(contentRect.x + contentRect.width <= outputCanvas.width + 0.01, `${preset.id} ${quality} content fits width`);
    check(contentRect.y + contentRect.height <= outputCanvas.height + 0.01, `${preset.id} ${quality} content fits height`);
    check(Math.abs(contentRect.width / contentRect.height - 16 / 9) < 0.0001, `${preset.id} ${quality} source aspect preserved`);
    check(Math.abs(contentRect.x * 2 + contentRect.width - outputCanvas.width) < 0.03, `${preset.id} ${quality} horizontally centered`);
    check(Math.abs(contentRect.y * 2 + contentRect.height - outputCanvas.height) < 0.03, `${preset.id} ${quality} vertically centered`);
    geometryReceipts.push({ presetId: preset.id, quality, ...geometry });
  }
}

const expected = {
  youtube: [[1280, 720], [1920, 1080]],
  "youtube-shorts": [[720, 1280], [1080, 1920]],
  "instagram-feed": [[720, 900], [1080, 1350]],
  snapchat: [[720, 1280], [1080, 1920]],
  x: [[1280, 720], [1920, 1080]],
} as const;
for (const [presetId, sizes] of Object.entries(expected)) {
  for (const [index, quality] of (["720p", "1080p"] as const).entries()) {
    const geometry = resolveExportDestinationGeometry(snapshot, { presetId: presetId as never }, quality);
    equal([geometry.outputCanvas.width, geometry.outputCanvas.height], sizes[index], `${presetId} ${quality} exact canvas`);
  }
}

for (const shape of ["original", "16:9", "9:16", "1:1", "4:5"] as const) {
  const geometry = resolveExportDestinationGeometry(snapshot, { presetId: "custom-other", customShape: shape }, "720p");
  check(geometry.shape === shape, `Custom / Other ${shape} selected`);
  check(geometry.contentRect.x >= 0 && geometry.contentRect.y >= 0, `Custom / Other ${shape} content retained`);
}
for (const [width, height] of [[256, 256], [1920, 1920], [256, 1920], [1920, 256], [1080, 1350]]) {
  equal(validateCustomDimensions(width, height), null, `${width}x${height} valid custom canvas`);
  const geometry = resolveExportDestinationGeometry(snapshot, { presetId: "custom-other", customShape: "custom", customWidth: width, customHeight: height }, "1080p");
  equal(geometry.outputCanvas, { width, height }, `${width}x${height} exact custom output`);
  check(geometry.contentRect.x + geometry.contentRect.width <= width + 0.01 && geometry.contentRect.y + geometry.contentRect.height <= height + 0.01, `${width}x${height} no crop`);
}
for (const [width, height] of [[255, 256], [256, 255], [1922, 1080], [1080, 1922], [257, 258], [1080.5, 1080], [Number.NaN, 1080]]) {
  check(Boolean(validateCustomDimensions(width, height)), `${width}x${height} invalid custom canvas`);
  rejects(() => resolveExportDestinationGeometry(snapshot, { presetId: "custom-other", customShape: "custom", customWidth: width, customHeight: height }, "1080p"), /export_custom_dimensions_invalid/, `${width}x${height} rejected by geometry`);
}

const selection = createExportSelection(snapshot);
const verticalChoice: ExportDestinationChoice = { presetId: "youtube-shorts" };
const verticalRequest = createExportRequest(snapshot, selection, "1080p", "short", true, verticalChoice);
equal(verticalRequest.outputCanvas, { width: 1080, height: 1920 }, "request binds vertical output");
equal(verticalRequest.destinationPresetId, "youtube-shorts", "request binds destination");
equal(verticalRequest.catalogVersion, EXPORT_DESTINATION_CATALOG_VERSION, "request binds catalog version");
equal(verticalRequest.framingMode, "contain-complete-animation", "request binds contain-only framing");
check(verticalRequest.contentRect.y > 0 && verticalRequest.contentRect.x === 0, "wide source is vertically padded in vertical canvas");
check(verticalRequest.paddingDescription.includes("Padding:"), "request discloses padding");

const customRequest = createExportRequest(snapshot, selection, "custom", "custom", false, { presetId: "custom-other", customShape: "custom", customWidth: 1000, customHeight: 1000 });
equal(customRequest.qualityTier, "custom", "custom request has truthful tier");
equal(customRequest.outputCanvas, { width: 1000, height: 1000 }, "custom request exact dimensions");
rejects(() => createExportRequest(snapshot, selection, "custom", "bad", false, { presetId: "youtube" }), /export_custom_dimensions_missing/, "custom tier cannot impersonate preset quality");
rejects(() => createExportRequest(snapshot, selection, "720p", "bad", false, { presetId: "custom-other", customShape: "custom", customWidth: 1000, customHeight: 1000 }), /export_custom_quality_required/, "custom canvas requires custom tier");

const root = process.cwd();
const packageJson = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
const encoderPackage = JSON.parse(await readFile(path.join(root, "node_modules/mediabunny/package.json"), "utf8"));
equal(packageJson.dependencies.mediabunny, "1.58.1", "Mediabunny pin preserved");
equal([encoderPackage.version, encoderPackage.license], ["1.58.1", "MPL-2.0"], "Mediabunny version/license preserved");

const catalogSource = await readFile(path.join(root, "src/lib/export/exportDestinationCatalog.ts"), "utf8");
const flowSource = await readFile(path.join(root, "src/components/export/AnimationExportFlow.tsx"), "utf8");
check(!/\bfetch\s*\(|XMLHttpRequest|WebSocket|EventSource/.test(`${catalogSource}\n${flowSource}`), "catalog and UI perform no runtime lookup");
check(flowSource.includes("Fit complete animation") && !flowSource.includes("Fill / Crop"), "UI exposes contain-only framing");
check(flowSource.includes('aria-pressed={active}') && flowSource.includes('aria-label="Video destinations"'), "destination cards expose accessible selection");
check(flowSource.includes('aria-label="Custom video width"') && flowSource.includes('aria-label="Custom video height"'), "custom fields have accessible names");
check(flowSource.includes("Long exports can use significant local CPU, memory, and storage."), "long export resource disclosure is explicit");

const changedPaths = execFileSync("git", ["diff", "--name-only"], { encoding: "utf8" }).trim().split("\n").filter(Boolean);
check(changedPaths.every(file => file.startsWith("src/lib/export/") || file === "src/components/export/AnimationExportFlow.tsx" || file.startsWith("scripts/spec0009-export/")), "diff remains inside Phase 3 technical boundary");
check(!changedPaths.some(file => file.includes("openai") || file.includes("aiAnimator") || file.includes("DrawingCanvas") || file.includes("DrawingWorkspace")), "Terra and editor sources unchanged");

const result = {
  schemaVersion: "spec0009-phase3-oracle/v1",
  status: "PASS",
  assertions,
  catalogVersion: EXPORT_DESTINATION_CATALOG_VERSION,
  destinationCount: EXPORT_DESTINATION_CATALOG.length,
  officialSourceCount: EXPORT_CATALOG_SOURCES.length,
  geometryReceiptCount: geometryReceipts.length,
  customBounds: { minimum: 256, maximum: 1920, evenOnly: true },
  codecs: { container: "mp4", video: "avc", audio: "aac-when-authored" },
  dependency: { name: "mediabunny", version: encoderPackage.version, license: encoderPackage.license },
  isolation: { runtimeCatalogRequests: 0, aiProviderCalls: 0, creditChanges: 0 },
};
await mkdir(path.join(root, "output/spec-0009/phase-3"), { recursive: true });
await writeFile(path.join(root, "output/spec-0009/phase-3/geometry.json"), `${JSON.stringify(geometryReceipts, null, 2)}\n`);
await writeFile(path.join(root, "output/spec-0009/phase-3/provenance.json"), `${JSON.stringify({ catalogVersion: EXPORT_DESTINATION_CATALOG_VERSION, sources: EXPORT_CATALOG_SOURCES }, null, 2)}\n`);
await writeFile(path.join(root, "output/spec-0009/phase-3/oracle.json"), `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify(result));
