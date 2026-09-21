import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { UnifiedAnimationProjectV2 } from "../../src/lib/animation/unifiedAnimationContractV2.ts";
import { ProjectPlayerAudioController } from "../../src/lib/project-player/projectPlayerAudio.ts";

const outputRoot = resolve("output/spec-0011/phase-2/audio-oracle");
mkdirSync(outputRoot, { recursive: true });
let assertions = 0;
const check = (value: unknown, label: string) => { assertions += 1; assert.ok(value, label); };
const equal = (actual: unknown, expected: unknown, label: string) => { assertions += 1; assert.deepEqual(actual, expected, label); };
const close = (actual: number, expected: number, tolerance: number, label: string) => {
  assertions += 1;
  assert.ok(Math.abs(actual - expected) <= tolerance, `${label}: ${actual} vs ${expected}`);
};

type StartReceipt = { when: number; offset: number; duration: number };
const stats = { decodeCalls: 0, decodeInFlight: 0, maximumDecodeConcurrency: 0, starts: [] as StartReceipt[], stops: 0, disconnects: 0, closes: 0 };
let blockResume = false;

class FakeSource {
  buffer: { duration: number } | null = null;
  onended: (() => void) | null = null;
  connect() { return this; }
  disconnect() { stats.disconnects += 1; }
  start(when: number, offset: number, duration: number) { stats.starts.push({ when, offset, duration }); }
  stop() { stats.stops += 1; }
}

class FakeAudioContext {
  state: AudioContextState = "suspended";
  currentTime = 10;
  destination = {};
  async decodeAudioData() {
    stats.decodeCalls += 1;
    stats.decodeInFlight += 1;
    stats.maximumDecodeConcurrency = Math.max(stats.maximumDecodeConcurrency, stats.decodeInFlight);
    await new Promise(resolveDelay => setTimeout(resolveDelay, 5));
    stats.decodeInFlight -= 1;
    return { duration: 1 };
  }
  createBufferSource() { return new FakeSource(); }
  async resume() { if (!blockResume) this.state = "running"; }
  async close() { this.state = "closed"; stats.closes += 1; }
}

(globalThis as unknown as { AudioContext: typeof AudioContext }).AudioContext = FakeAudioContext as unknown as typeof AudioContext;

const sound = (id: string, dataUrl: string) => ({ id, audioDataUrl: dataUrl });
const audioA = "data:audio/wav;base64,AA==";
const audioB = "data:audio/wav;base64,AQ==";
const project = {
  document: {
    fps: 12,
    layers: [
      { visible: true, cells: [
        { content: { soundAttachment: sound("overlap-a", audioA) } },
        ...Array.from({ length: 5 }, () => ({ content: null })),
        { content: { soundAttachment: sound("later-b", audioB) } },
      ] },
      { visible: true, cells: [{ content: { soundAttachment: sound("overlap-a-copy", audioA) } }] },
      { visible: false, cells: [{ content: { soundAttachment: sound("hidden", audioB) } }] },
    ],
  },
} as unknown as UnifiedAnimationProjectV2;

const controller = new ProjectPlayerAudioController(project);
equal(controller.hasAuthoredAudio, true, "authored visible audio is detected");
const prepared = await controller.prepare();
equal(prepared, { status: "ready", attachmentCount: 3, uniqueAssetCount: 2 }, "visible attachments decode once per unique saved asset");
equal(stats.decodeCalls, 2, "two unique assets produce two decodes");
check(stats.maximumDecodeConcurrency <= 2, "decode concurrency is bounded to two");

const firstStart = await controller.start(0.25, 2);
equal(firstStart, { status: "scheduled", clockSeconds: 10 }, "audio schedule becomes the playback clock anchor");
equal(stats.starts.length, 3, "overlapping and future visible clips are all scheduled");
close(stats.starts[0].offset, 0.25, 1e-9, "mid-clip play uses the correct source offset");
close(stats.starts[1].offset, 0.25, 1e-9, "overlapping clip uses the same correct source offset");
close(stats.starts[2].when, 10.25, 1e-9, "future clip starts at frameIndex/fps relative to the clock anchor");
close(stats.starts[2].duration, 1, 1e-9, "future clip retains its decoded duration inside animation duration");

controller.stop();
check(stats.stops >= 3, "pause/seek stops every obsolete scheduled node");
const secondStart = await controller.start(0.75, 1.2);
equal(secondStart.status, "scheduled", "seek/resume reschedules from the requested media time");
const resumed = stats.starts.slice(3);
equal(resumed.length, 3, "seek reschedules every intersecting overlapping clip");
close(resumed[0].offset, 0.75, 1e-9, "seek into first clip uses exact offset");
close(resumed[2].offset, 0.25, 1e-9, "seek into later clip uses attachment-relative offset");
close(resumed[2].duration, 0.45, 1e-9, "later clip is trimmed at animation duration");

blockResume = true;
const blockedProject = new ProjectPlayerAudioController(project);
await blockedProject.prepare();
equal((await blockedProject.start(0, 2)).status, "blocked", "suspended browser audio remains truthfully blocked");
blockResume = false;
await blockedProject.close();

const corruptProject = {
  document: { fps: 12, layers: [{ visible: true, cells: [{ content: { soundAttachment: sound("corrupt", "data:audio/wav;base64,not-valid!") } }] }] },
} as unknown as UnifiedAnimationProjectV2;
const corrupt = new ProjectPlayerAudioController(corruptProject);
const corruptResult = await corrupt.prepare();
equal(corruptResult.status, "unavailable", "corrupt saved audio is disclosed as unavailable");
check(corruptResult.status === "unavailable" && corruptResult.detail.includes("corrupt"), "audio failure detail identifies the saved attachment");
await corrupt.close();

await controller.close();
check(stats.closes >= 3, "viewer teardown closes every created audio context");
check(stats.disconnects >= stats.stops, "stopped sources are disconnected during cleanup");

const result = {
  kind: "spec0011-phase2-audio-oracle",
  version: 1,
  status: "PASS",
  assertions,
  facts: {
    visibleAttachments: 3,
    uniqueAssets: 2,
    maximumDecodeConcurrency: stats.maximumDecodeConcurrency,
    scheduledStarts: stats.starts,
    stoppedNodes: stats.stops,
    disconnectedNodes: stats.disconnects,
    closedContexts: stats.closes,
    driftClockOwner: "AudioContext.currentTime",
    paidCalls: 0,
  },
};
writeFileSync(resolve(outputRoot, "result.json"), `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify(result));
