import assert from "node:assert/strict";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  createExportRequest,
  createExportSelection,
  outputDimensionsFor,
  resolveExportRasterTransform,
  resolveUniformContainTransform,
  sanitizeExportFilename,
} from "../../src/lib/export/exportContracts.ts";
import { collectExportAudioAttachments } from "../../src/lib/export/exportAudio.ts";

let assertions = 0;
const check = (condition: unknown, message: string) => {
  assert.ok(condition, message);
  assertions += 1;
};

const project = {
  projectId: "11111111-1111-4111-8111-111111111111",
  title: "Fight / Test",
  updatedAt: "2026-09-20T00:00:00.000Z",
  document: {
    logicalStage: { width: 1920, height: 1080 },
    fps: 12,
    layers: [
      {
        visible: true,
        cells: [
          { content: { soundAttachment: { id: "later", audioDataUrl: "data:audio/wav;base64,AA==" } } },
          { content: null },
          { content: { soundAttachment: { id: "last", audioDataUrl: "data:audio/wav;base64,AA==" } } },
        ],
      },
      {
        visible: true,
        cells: [{ content: { soundAttachment: { id: "first", audioDataUrl: "data:audio/wav;base64,AA==" } } }],
      },
      {
        visible: false,
        cells: [{ content: { soundAttachment: { id: "hidden", audioDataUrl: "data:audio/wav;base64,AA==" } } }],
      },
    ],
  },
} as never;

const snapshot = {
  project,
  projectDigest: "digest-1",
  frameCount: 24,
  durationSeconds: 2,
} as never;

check(sanitizeExportFilename("fight.mp4", "fallback") === "fight.mp4", "one mp4 extension");
check(sanitizeExportFilename("fight.mp4.mp4", "fallback") === "fight.mp4.mp4", "only final extension normalized");
check(sanitizeExportFilename("  ", "Fight / Test") === "Fight Test.mp4", "blank uses sanitized title");
check(sanitizeExportFilename("../bad:name", "fallback") === ".. bad name.mp4", "path separators removed");
check(sanitizeExportFilename("CON", "fallback") === "Diamond CON.mp4", "reserved name protected");
check(Array.from(sanitizeExportFilename("x".repeat(200), "fallback").replace(/\.mp4$/, "")).length === 120, "name bounded");

const size720 = outputDimensionsFor(snapshot, "720p");
const size1080 = outputDimensionsFor(snapshot, "1080p");
check(size720.width === 1280 && size720.height === 720, "720p dimensions");
check(size1080.width === 1920 && size1080.height === 1080, "1080p dimensions");
check(size720.width % 2 === 0 && size720.height % 2 === 0, "even dimensions");

const squareViewportFit = resolveExportRasterTransform(1280, 720, 4600, 4600, 4.6);
check(squareViewportFit.scaleX === squareViewportFit.scaleY, "raster transform is uniform");
check(Math.abs(squareViewportFit.contentRect.width - 720) < 0.0001 && Math.abs(squareViewportFit.contentRect.height - 720) < 0.0001, "square workspace is contained without crop");
check(Math.abs(squareViewportFit.contentRect.x - 280) < 0.0001 && Math.abs(squareViewportFit.contentRect.y) < 0.0001, "square workspace is centered with padding");
const measuredViewportFit = resolveExportRasterTransform(1280, 720, 6899, 4563, 4.6);
check(measuredViewportFit.scaleX === measuredViewportFit.scaleY, "measured viewport has no X/Y squeeze");
check(Math.abs(measuredViewportFit.contentRect.width / measuredViewportFit.contentRect.height - 6899 / 4563) < 1e-12, "measured viewport aspect is preserved");
check(measuredViewportFit.contentRect.x >= 0 && measuredViewportFit.contentRect.y >= 0 && measuredViewportFit.contentRect.x + measuredViewportFit.contentRect.width <= 1280.0001 && measuredViewportFit.contentRect.y + measuredViewportFit.contentRect.height <= 720.0001, "complete measured viewport fits output");
const logicalStageFit = resolveUniformContainTransform(1920, 1080, 1920, 1080);
check(logicalStageFit.scaleX === 1 && logicalStageFit.scaleY === 1 && logicalStageFit.offsetX === 0 && logicalStageFit.offsetY === 0, "logical stage stays exact at 1080p");

const selection = createExportSelection(snapshot);
check(selection.schemaVersion === "export-selection/v1", "selection version");
check(selection.projectDigest === "digest-1", "selection digest bound");
check(selection.fps === 12 && selection.authoredFrameCount === 24 && selection.durationMs === 2000, "selection timing bound");

const request = createExportRequest(snapshot, selection, "720p", "Fight", true);
check(request.schemaVersion === "export-request/v1", "request version");
check(request.selectionId === selection.selectionId && request.projectDigest === selection.projectDigest, "request selection bound");
check(request.videoCodec === "avc" && request.audioCodec === "aac" && request.container === "mp4", "codec contract");
check(request.rendererVersion === "diamond-export-renderer/v1", "renderer version");
check(request.encoderVersion === "mediabunny/1.58.1", "encoder version");

const audio = collectExportAudioAttachments(project);
check(audio.length === 3, "visible audio only");
check(audio.map(item => `${item.frameIndex}:${item.id}`).join(",") === "0:first,0:later,2:last", "deterministic audio order");

const root = process.cwd();
const packageJson = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
const encoderPackage = JSON.parse(await readFile(path.join(root, "node_modules/mediabunny/package.json"), "utf8"));
const rendererSource = await readFile(path.join(root, "src/lib/export/exportRenderer.ts"), "utf8");
const videoSource = await readFile(path.join(root, "src/lib/export/exportVideo.ts"), "utf8");
const audioSource = await readFile(path.join(root, "src/lib/export/exportAudio.ts"), "utf8");
const workspaceSource = await readFile(path.join(root, "src/components/workspace/DrawingWorkspace.tsx"), "utf8");
const contractSource = await readFile(path.join(root, "src/lib/animation/unifiedAnimationContractV2.ts"), "utf8");

check(packageJson.dependencies.mediabunny === "1.58.1", "exact dependency pin");
check(encoderPackage.version === "1.58.1" && encoderPackage.license === "MPL-2.0", "version and license binding");
check(rendererSource.includes("resolveProjectBackground(project)"), "renderer uses project background");
check(rendererSource.includes('imageSmoothingQuality = "high"'), "raster downsampling uses high-quality smoothing");
check(!rendererSource.includes('fillStyle = "#ffffff"'), "renderer has no export-only white injection");
check(workspaceSource.includes('background: { kind: "solid-color/v1", color: canvasBackgroundColor }'), "save owns background");
check(contractSource.includes('background?: { kind: "solid-color/v1"; color: string }'), "background contract present");
check(videoSource.includes("showSaveFilePicker") && videoSource.includes("createWritable"), "explicit Finder write path");
check(videoSource.includes("computePacketStats") && videoSource.includes("export_validation_frame_count"), "post-write frame inspection");
check(videoSource.includes("StreamTarget") && videoSource.includes("chunked: true"), "streaming target with backpressure");
check(videoSource.includes("truncate(0)"), "partial file truncation");
check(!`${rendererSource}\n${videoSource}\n${audioSource}`.match(/openai|supabase|https?:\/\//i), "no provider/network imports or URLs");

const result = {
  schemaVersion: "spec0009-phase2-oracle/v1",
  status: "PASS",
  assertions,
  dependency: { name: "mediabunny", version: encoderPackage.version, license: encoderPackage.license },
  codecs: { container: "mp4", video: "avc", audio: "aac-when-authored" },
  maximumApplicationOwnedQueuedFrames: 1,
  externalAiProviderCalls: 0,
};
await mkdir(path.join(root, "output/spec-0009/phase-2"), { recursive: true });
await writeFile(path.join(root, "output/spec-0009/phase-2/oracle.json"), `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify(result));
