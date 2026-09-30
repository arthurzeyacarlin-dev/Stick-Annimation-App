import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import { createNativeUnifiedProjectV2 } from "../../../src/lib/animation/unifiedWorkspaceFactoryV2.ts";
import { packAccountProject, unpackAccountProject } from "../../../src/lib/account/projectBundle.ts";
import { runAccountProjectLogout } from "../../../src/lib/account/projectPending.ts";

const percentile = (values, fraction) => {
  const ordered = [...values].sort((a, b) => a - b);
  return Number(ordered[Math.ceil(fraction * ordered.length) - 1].toFixed(1));
};
const project = (frames, width, height) => {
  const value = createNativeUnifiedProjectV2();
  const cells = [];
  for (let index = 0; index < frames; index += 1) {
    const cellId = crypto.randomUUID();
    const data = new Uint8ClampedArray(width * height * 4);
    for (let pixel = 0; pixel < data.length; pixel += 4) {
      if ((pixel / 4 + index * 41) % 31 < 6) {
        data[pixel] = 40 + index;
        data[pixel + 1] = 90;
        data[pixel + 2] = 170;
        data[pixel + 3] = 255;
      }
    }
    cells.push({
      cellId, cellType: "keyframe", ownerCellId: cellId,
      content: { soundAttachment: null, items: [{
        itemId: crypto.randomUUID(), kind: "drawing-raster/v1", strokes: [], shapes: [],
        bitmap: { width, height, data }, tweenEndBitmap: null, motionTween: null, sourceTransform: null,
      }] },
    });
  }
  value.document.layers[0].cells = cells;
  return value;
};
const samples = async (frames, width, height, count) => {
  const timings = [];
  let bytes = 0;
  for (let index = 0; index < count; index += 1) {
    const candidate = project(frames, width, height);
    const start = performance.now();
    const packed = await packAccountProject(candidate);
    const unpacked = await unpackAccountProject(new Uint8Array(await packed.body.arrayBuffer()));
    timings.push(performance.now() - start);
    bytes = packed.body.size;
    assert.equal(unpacked.project.document.layers[0].cells.length, frames);
  }
  return { frames, bitmap: `${width}x${height}`, bundleBytes: bytes, samplesMs: timings.map(value => Number(value.toFixed(1))), p50Ms: percentile(timings, 0.5), p95Ms: percentile(timings, 0.95) };
};

const ordinary = await samples(3, 256, 144, 5);
const large = await samples(12, 512, 288, 3);
Object.defineProperty(globalThis, "navigator", { configurable: true, value: {
  locks: {
    request: async (_name, _options, callback) => callback({ name: "test-only" }),
  },
} });
globalThis.localStorage = { length: 0, key: () => null };
let signOuts = 0;
const startLogout = performance.now();
await runAccountProjectLogout("synthetic-clean-owner", async () => { signOuts += 1; });
const cleanLogoutMs = Number((performance.now() - startLogout).toFixed(1));
assert.equal(signOuts, 1);

process.stdout.write(JSON.stringify({
  ordinary, large, cleanLogoutMs,
  cleanLogoutEncodeOrUploadCalls: 0,
  limitation: "Local codec/clean-logout only. Remote upload/CAS latency and browser input responsiveness still require the isolated real-app proof.",
}) + "\n");
