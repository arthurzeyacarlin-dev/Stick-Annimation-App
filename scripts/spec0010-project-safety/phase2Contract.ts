import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { createNativeUnifiedProjectV2 } from "../../src/lib/animation/unifiedWorkspaceFactoryV2.ts";
import {
  createProjectRecoveryStorageV1,
  type ProjectRecoveryCandidateV1,
  type ProjectRecoveryOwnerV1,
  type ProjectRecoveryStorageAdapterV1,
} from "../../src/lib/animation/projectRecoveryStorageV1.ts";
import type { UnifiedEncodedAssetV2 } from "../../src/lib/animation/unifiedProjectStorageV2.ts";
import { assertProjectRecoveryEnvelopeV1 } from "../../src/lib/animation/projectRecoveryContractV1.ts";

const OUTPUT_ROOT = "output/spec-0010/phase-2";
mkdirSync(OUTPUT_ROOT, { recursive: true });
let assertions = 0;
const check = (value: unknown, label: string) => { assertions += 1; assert.ok(value, label); };
const equal = (actual: unknown, expected: unknown, label: string) => { assertions += 1; assert.deepEqual(actual, expected, label); };
const rejects = async (action: () => Promise<unknown>, pattern: RegExp, label: string) => {
  assertions += 1;
  await assert.rejects(action, pattern, label);
};

class MemoryRecoveryAdapter implements ProjectRecoveryStorageAdapterV1 {
  head: ProjectRecoveryCandidateV1["envelope"] | null = null;
  owner: ProjectRecoveryOwnerV1 | null = null;
  candidates = new Map<string, ProjectRecoveryCandidateV1>();
  assets = new Map<string, UnifiedEncodedAssetV2>();
  key(sequence: number, digest: string) { return `${sequence}:${digest}`; }
  async readHead() { return this.head ? structuredClone(this.head) : null; }
  async readCandidate(sequence: number, digest: string) { return structuredClone(this.candidates.get(this.key(sequence, digest)) ?? null); }
  async readAssets(ids: readonly string[]) { return ids.map(id => structuredClone(this.assets.get(id)!)); }
  async stage(input: { owner: ProjectRecoveryOwnerV1; candidate: ProjectRecoveryCandidateV1; assets: UnifiedEncodedAssetV2[] }) {
    if (this.owner && (this.owner.ownerSessionId !== input.owner.ownerSessionId || this.owner.workspaceInstanceId !== input.owner.workspaceInstanceId)) throw new Error("recovery_conflict");
    if (this.owner && input.owner.latestStagedSequence <= this.owner.latestStagedSequence) throw new Error("recovery_stale_sequence");
    if (this.head && input.candidate.draftSequence <= this.head.draftSequence) throw new Error("recovery_stale_sequence");
    for (const [key, candidate] of this.candidates) {
      if (!this.head || candidate.draftSequence !== this.head.draftSequence || candidate.candidateDigest !== this.head.candidateDigest) this.candidates.delete(key);
    }
    const keep = new Set([...(this.head?.assetBindings.map(binding => binding.assetId) ?? []), ...input.assets.map(asset => asset.assetId)]);
    for (const id of this.assets.keys()) if (!keep.has(id)) this.assets.delete(id);
    for (const asset of input.assets) this.assets.set(asset.assetId, structuredClone(asset));
    this.owner = structuredClone(input.owner);
    this.candidates.set(this.key(input.candidate.draftSequence, input.candidate.candidateDigest), structuredClone(input.candidate));
  }
  async publish(input: { ownerSessionId: string; workspaceInstanceId: string; draftSequence: number; candidateDigest: string }) {
    if (!this.owner || this.owner.ownerSessionId !== input.ownerSessionId || this.owner.workspaceInstanceId !== input.workspaceInstanceId || this.owner.latestStagedSequence !== input.draftSequence) throw new Error("recovery_conflict");
    const key = this.key(input.draftSequence, input.candidateDigest);
    const candidate = this.candidates.get(key);
    if (!candidate) throw new Error("recovery_candidate_missing");
    const current = { ...candidate.envelope, status: "current" as const };
    candidate.envelope = current;
    this.head = current;
    for (const candidateKey of this.candidates.keys()) if (candidateKey !== key) this.candidates.delete(candidateKey);
    const keep = new Set(current.assetBindings.map(binding => binding.assetId));
    for (const id of this.assets.keys()) if (!keep.has(id)) this.assets.delete(id);
  }
  async abandon(input: { ownerSessionId: string; workspaceInstanceId: string; draftSequence: number; candidateDigest: string }) {
    if (!this.owner || this.owner.ownerSessionId !== input.ownerSessionId || this.owner.workspaceInstanceId !== input.workspaceInstanceId || this.owner.latestStagedSequence !== input.draftSequence) return;
    this.candidates.delete(this.key(input.draftSequence, input.candidateDigest));
    if (this.head) this.owner.latestStagedSequence = this.head.draftSequence;
    else this.owner = null;
    const keep = new Set(this.head?.assetBindings.map(binding => binding.assetId) ?? []);
    for (const id of this.assets.keys()) if (!keep.has(id)) this.assets.delete(id);
  }
  async clear(input: { ownerSessionId: string; workspaceInstanceId: string; workspaceGeneration: number; candidateDigest: string }) {
    if (!this.head) return "none" as const;
    if (!this.owner || this.head.ownerSessionId !== input.ownerSessionId || this.head.workspaceInstanceId !== input.workspaceInstanceId) return "not-matched" as const;
    if (this.owner.latestStagedSequence !== this.head.draftSequence) return "newer-draft" as const;
    if (this.head.workspaceGeneration !== input.workspaceGeneration || this.head.candidateDigest !== input.candidateDigest) return "not-matched" as const;
    this.head = null; this.owner = null; this.candidates.clear(); this.assets.clear();
    return "cleared" as const;
  }
}

const adapter = new MemoryRecoveryAdapter();
const storage = createProjectRecoveryStorageV1(adapter);
const source = createNativeUnifiedProjectV2("2026-09-21T00:00:00.000Z");
const candidate1 = structuredClone(source);
candidate1.document.fps = 18;
const owner = { ownerSessionId: "session-a", workspaceInstanceId: "workspace-a" };

const first = await storage.write({
  candidate: candidate1, sourceProject: source, ...owner, draftSequence: 1, workspaceGeneration: 1,
  lastMeaningfulEditAt: "2026-09-21T00:00:01.000Z", now: "2026-09-21T00:00:02.000Z",
});
equal(first.envelope.status, "current", "first draft publishes as current");
equal(first.project.document.fps, 18, "first draft hydrates exact edited project");
equal(adapter.candidates.size, 1, "one logical candidate is retained");

const candidate2 = structuredClone(source);
candidate2.document.background = { kind: "solid-color/v1", color: "#223344" };
const primaryCell = candidate2.document.layers[0].cells[0];
primaryCell.cellType = "keyframe";
primaryCell.content = {
  items: [{
    itemId: crypto.randomUUID(), kind: "drawing-text/v1", text: "Recovery proof", x: 160, y: 220,
    color: "#112233", fontSize: 72, rotation: 0, width: 640, flipX: false, flipY: false,
    fontFamily: "Arial", bold: true, italic: false,
  }],
  soundAttachment: {
    id: "phase2-audio", title: "Local recovery tone", description: "Deterministic embedded audio fixture",
    timingFeel: null, intensityFeel: null, audioDataUrl: "data:audio/wav;base64,UklGRg==",
    contentType: "sfx", speechText: null, sourceTask: "generate-sounds", attachedAt: "2026-09-21T00:00:03.000Z",
  },
};
candidate2.document.layers.push({
  layerId: crypto.randomUUID(), name: "Recovery overlay", orderIndex: 1, visible: true, locked: false,
  cells: [{ cellId: crypto.randomUUID(), cellType: "blank-keyframe", ownerCellId: "", content: { items: [], soundAttachment: null } }],
});
candidate2.document.layers[1].cells[0].ownerCellId = candidate2.document.layers[1].cells[0].cellId;
const second = await storage.write({
  candidate: candidate2, sourceProject: source, ...owner, draftSequence: 2, workspaceGeneration: 2,
  lastMeaningfulEditAt: "2026-09-21T00:00:03.000Z", now: "2026-09-21T00:00:04.000Z",
});
equal(second.project.document.background?.color, "#223344", "newest verified draft replaces the prior generation");
equal(second.project.document.layers.length, 2, "mixed fixture hydrates its added layer");
equal(second.project.document.layers[0].cells[0].content?.items[0].kind, "drawing-text/v1", "mixed fixture hydrates text content");
equal(second.project.document.layers[0].cells[0].content?.soundAttachment?.audioDataUrl, "data:audio/wav;base64,UklGRg==", "mixed fixture hydrates embedded audio");
equal(adapter.candidates.size, 1, "replacement does not accumulate candidate history");

const candidate3 = structuredClone(source);
candidate3.document.fps = 24;
await rejects(() => storage.write({
  candidate: candidate3, sourceProject: source, ...owner, draftSequence: 3, workspaceGeneration: 3,
  lastMeaningfulEditAt: "2026-09-21T00:00:05.000Z", now: "2026-09-21T00:00:06.000Z",
}, { beforePublish: () => { throw new Error("injected_publish_failure"); } }), /injected_publish_failure/, "failure before publication rejects");
const afterFailure = await storage.readCurrent();
equal(afterFailure?.envelope.candidateDigest, second.envelope.candidateDigest, "failed replacement preserves preceding valid draft");
equal(afterFailure?.project.document.background?.color, "#223344", "failed replacement preserves preceding payload");
equal(adapter.candidates.size, 1, "failed staged replacement is abandoned without accumulation");

await rejects(() => storage.write({
  candidate: candidate3, sourceProject: source, ownerSessionId: "session-b", workspaceInstanceId: "workspace-b",
  draftSequence: 4, workspaceGeneration: 4, lastMeaningfulEditAt: "2026-09-21T00:00:07.000Z", now: "2026-09-21T00:00:08.000Z",
}), /recovery_conflict/, "foreign session cannot overwrite the active draft");

equal(await storage.clear({ ...owner, workspaceGeneration: 2, candidateDigest: "0".repeat(64) }), "not-matched", "wrong digest does not clear the draft");
equal(await storage.clear({ ...owner, workspaceGeneration: 2, candidateDigest: second.envelope.candidateDigest }), "cleared", "exact covered generation and digest clear the draft");
equal(await storage.inspect(), { kind: "none" }, "clearing verifies no current draft remains");

const invalid = structuredClone(second.envelope);
invalid.storedByteLength = 134_217_729;
assertions += 1;
assert.throws(() => assertProjectRecoveryEnvelopeV1(invalid), /recovery_invalid_record/, "oversized envelope fails closed");
check(second.envelope.assetBindings.every(binding => binding.assetId === `sha256:${binding.sha256}`), "asset identifiers bind their digests");

const result = {
  kind: "spec0010-phase2-contract",
  version: 1,
  status: "PASS",
  assertions,
  facts: {
    database: "separate recovery-only owner",
    logicalDrafts: 1,
    precedingValidDraftSurvivesFault: true,
    foreignWriterRejected: true,
    exactClearRequired: true,
    officialWrites: 0,
    externalRequests: 0,
  },
};
writeFileSync(`${OUTPUT_ROOT}/contract.json`, `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify(result));
