import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { createNativeUnifiedProjectV2 } from "../../src/lib/animation/unifiedWorkspaceFactoryV2.ts";
import { prepareRecoveryWorkspace } from "../../src/lib/animation/unifiedWorkspaceBootstrap.ts";
import {
  createProjectRecoveryStorageV1,
  type ProjectRecoveryCandidateV1,
  type ProjectRecoveryClaimInputV1,
  type ProjectRecoveryDiscardExpectationV1,
  type ProjectRecoveryOwnerV1,
  type ProjectRecoveryStorageAdapterV1,
} from "../../src/lib/animation/projectRecoveryStorageV1.ts";
import type { UnifiedEncodedAssetV2 } from "../../src/lib/animation/unifiedProjectStorageV2.ts";

const OUTPUT_ROOT = "output/spec-0010/phase-3";
mkdirSync(OUTPUT_ROOT, { recursive: true });
let assertions = 0;
const equal = (actual: unknown, expected: unknown, label: string) => { assertions += 1; assert.deepEqual(actual, expected, label); };
const check = (value: unknown, label: string) => { assertions += 1; assert.ok(value, label); };

class RecoveryMemoryAdapter implements ProjectRecoveryStorageAdapterV1 {
  head: ProjectRecoveryCandidateV1["envelope"] | null = null;
  owner: ProjectRecoveryOwnerV1 | null = null;
  candidates = new Map<string, ProjectRecoveryCandidateV1>();
  assets = new Map<string, UnifiedEncodedAssetV2>();
  key(sequence: number, digest: string) { return `${sequence}:${digest}`; }
  async readHead() { return this.head ? structuredClone(this.head) : null; }
  async readCandidate(sequence: number, digest: string) { return structuredClone(this.candidates.get(this.key(sequence, digest)) ?? null); }
  async readAssets(ids: readonly string[]) {
    return ids.map(id => {
      const asset = this.assets.get(id);
      if (!asset) throw new Error("recovery_asset_missing");
      return structuredClone(asset);
    });
  }
  async stage(input: { owner: ProjectRecoveryOwnerV1; candidate: ProjectRecoveryCandidateV1; assets: UnifiedEncodedAssetV2[] }) {
    if (this.owner && (this.owner.ownerSessionId !== input.owner.ownerSessionId || this.owner.workspaceInstanceId !== input.owner.workspaceInstanceId)) throw new Error("recovery_conflict");
    if (this.owner && input.owner.latestStagedSequence <= this.owner.latestStagedSequence) throw new Error("recovery_stale_sequence");
    this.owner = structuredClone(input.owner);
    this.candidates.set(this.key(input.candidate.draftSequence, input.candidate.candidateDigest), structuredClone(input.candidate));
    for (const asset of input.assets) this.assets.set(asset.assetId, structuredClone(asset));
  }
  async publish(input: { ownerSessionId: string; workspaceInstanceId: string; draftSequence: number; candidateDigest: string }) {
    if (!this.owner || this.owner.ownerSessionId !== input.ownerSessionId || this.owner.workspaceInstanceId !== input.workspaceInstanceId || this.owner.latestStagedSequence !== input.draftSequence) throw new Error("recovery_conflict");
    const candidate = this.candidates.get(this.key(input.draftSequence, input.candidateDigest));
    if (!candidate) throw new Error("recovery_candidate_missing");
    candidate.envelope = { ...candidate.envelope, status: "current" };
    this.head = structuredClone(candidate.envelope);
  }
  async abandon(input: { ownerSessionId: string; workspaceInstanceId: string; draftSequence: number; candidateDigest: string }) {
    this.candidates.delete(this.key(input.draftSequence, input.candidateDigest));
  }
  async clear() { this.head = null; this.owner = null; this.candidates.clear(); this.assets.clear(); return "cleared" as const; }
  async claim(input: ProjectRecoveryClaimInputV1) {
    if (!this.head) return "none" as const;
    if (this.head.ownerSessionId !== input.expectedOwnerSessionId || this.head.workspaceInstanceId !== input.expectedWorkspaceInstanceId ||
      this.head.draftSequence !== input.draftSequence || this.head.candidateDigest !== input.candidateDigest) return "changed" as const;
    const candidate = this.candidates.get(this.key(input.draftSequence, input.candidateDigest));
    if (!candidate) throw new Error("recovery_candidate_missing");
    this.head = { ...this.head, ownerSessionId: input.ownerSessionId, workspaceInstanceId: input.workspaceInstanceId };
    candidate.envelope = structuredClone(this.head);
    this.owner = {
      draftId: "latest", ownerSessionId: input.ownerSessionId, workspaceInstanceId: input.workspaceInstanceId,
      latestStagedSequence: input.draftSequence, updatedAt: "2026-09-21T03:00:00.000Z",
    };
    return "claimed" as const;
  }
  async discard(expectation: ProjectRecoveryDiscardExpectationV1) {
    if (!this.head) return "none" as const;
    const matches = expectation.kind === "invalid" || (
      this.head.ownerSessionId === expectation.ownerSessionId && this.head.workspaceInstanceId === expectation.workspaceInstanceId &&
      this.head.draftSequence === expectation.draftSequence && this.head.candidateDigest === expectation.candidateDigest
    );
    if (!matches) return "changed" as const;
    this.head = null; this.owner = null; this.candidates.clear(); this.assets.clear();
    return "discarded" as const;
  }
}

const source = createNativeUnifiedProjectV2("2026-09-21T01:00:00.000Z");
source.document.fps = 18;
const recovered = structuredClone(source);
recovered.document.fps = 24;
recovered.document.background = { kind: "solid-color/v1", color: "#173a5e" };
const adapter = new RecoveryMemoryAdapter();
const storage = createProjectRecoveryStorageV1(adapter);
const written = await storage.write({
  candidate: recovered,
  sourceProject: source,
  ownerSessionId: "session-before-crash",
  workspaceInstanceId: "workspace-before-crash",
  draftSequence: 1,
  workspaceGeneration: 3,
  lastMeaningfulEditAt: "2026-09-21T02:00:00.000Z",
  now: "2026-09-21T02:00:01.000Z",
});

equal((await storage.inspect()).kind, "valid", "startup inspection hydrates a valid draft");
const claimed = await storage.claim({
  expectedOwnerSessionId: written.envelope.ownerSessionId,
  expectedWorkspaceInstanceId: written.envelope.workspaceInstanceId,
  draftSequence: written.envelope.draftSequence,
  candidateDigest: written.envelope.candidateDigest,
  ownerSessionId: "session-after-restart",
  workspaceInstanceId: "workspace-after-restart",
});
check(typeof claimed !== "string", "exact generation can be claimed after explicit recovery");
if (typeof claimed === "string") throw new Error("claim_failed");
equal(claimed.project.document.fps, 24, "claim rehydrates the exact recovered candidate");
equal(claimed.envelope.ownerSessionId, "session-after-restart", "claim transfers recovery ownership");
equal(await storage.claim({
  expectedOwnerSessionId: "session-before-crash",
  expectedWorkspaceInstanceId: "workspace-before-crash",
  draftSequence: 1,
  candidateDigest: written.envelope.candidateDigest,
  ownerSessionId: "racing-session",
  workspaceInstanceId: "racing-workspace",
}), "changed", "a racing stale claim cannot steal the claimed draft");

const matching = await prepareRecoveryWorkspace(claimed.project, claimed.envelope, {
  readOfficialProject: async () => structuredClone(source),
  createId: () => "11111111-1111-4111-8111-111111111111",
});
equal(matching.detached, false, "matching official source keeps its identity binding");
equal(matching.candidate.editor.project.projectId, source.projectId, "matching recovery retains source project identity");
equal(matching.candidate.editor.project.document.fps, 24, "matching recovery retains unsaved content");

const detached = await prepareRecoveryWorkspace(claimed.project, claimed.envelope, {
  readOfficialProject: async () => { throw new Error("source_changed"); },
  createId: () => "22222222-2222-4222-8222-222222222222",
});
equal(detached.detached, true, "missing official source creates a detached workspace");
equal(detached.candidate.editor.project.projectId, "22222222-2222-4222-8222-222222222222", "detached recovery has a new transient identity");
equal(detached.candidate.editor.project.revision, 0, "detached recovery starts at revision zero");
check(detached.candidate.editor.project.title.includes("Recovered copy"), "detached recovery is clearly titled Recovered copy");
equal(source.projectId, claimed.project.projectId, "detaching does not mutate the original recovered payload or official source");

const newerSource = structuredClone(source);
newerSource.revision += 1;
const newerDetached = await prepareRecoveryWorkspace(claimed.project, claimed.envelope, {
  readOfficialProject: async () => newerSource,
  createId: () => "33333333-3333-4333-8333-333333333333",
});
equal(newerDetached.detached, true, "newer official revision detaches instead of overwriting the official source");
equal(newerDetached.candidate.editor.project.projectId, "33333333-3333-4333-8333-333333333333", "newer-source recovery receives a new identity");

const changedSource = structuredClone(source);
changedSource.title = "Official source changed at the same revision";
const changedDetached = await prepareRecoveryWorkspace(claimed.project, claimed.envelope, {
  readOfficialProject: async () => changedSource,
  createId: () => "44444444-4444-4444-8444-444444444444",
});
equal(changedDetached.detached, true, "same-revision digest mismatch detaches instead of overwriting the official source");

equal(await storage.discard({
  kind: "valid",
  ownerSessionId: "wrong-session",
  workspaceInstanceId: claimed.envelope.workspaceInstanceId,
  draftSequence: claimed.envelope.draftSequence,
  candidateDigest: claimed.envelope.candidateDigest,
}), "changed", "discard refuses a changed binding");
equal((await storage.inspect()).kind, "valid", "failed discard retains the draft");
equal(await storage.discard({
  kind: "valid",
  ownerSessionId: claimed.envelope.ownerSessionId,
  workspaceInstanceId: claimed.envelope.workspaceInstanceId,
  draftSequence: claimed.envelope.draftSequence,
  candidateDigest: claimed.envelope.candidateDigest,
}), "discarded", "confirmed exact discard removes the draft");
equal(await storage.inspect(), { kind: "none" }, "discard verifies recovery absence");

const missingAssetAdapter = new RecoveryMemoryAdapter();
const missingAssetStorage = createProjectRecoveryStorageV1(missingAssetAdapter);
const missingAssetWritten = await missingAssetStorage.write({
  candidate: recovered,
  sourceProject: source,
  ownerSessionId: "asset-session",
  workspaceInstanceId: "asset-workspace",
  draftSequence: 1,
  workspaceGeneration: 1,
  lastMeaningfulEditAt: "2026-09-21T02:10:00.000Z",
  now: "2026-09-21T02:10:01.000Z",
});
const missingAssetId = `sha256:${"0".repeat(64)}`;
const missingBinding = { assetId: missingAssetId, sha256: "0".repeat(64), byteLength: 1, encoding: "typed-array" as const };
if (!missingAssetAdapter.head) throw new Error("missing_asset_head");
const missingCandidate = missingAssetAdapter.candidates.get(missingAssetAdapter.key(1, missingAssetWritten.envelope.candidateDigest));
if (!missingCandidate) throw new Error("missing_asset_candidate");
missingAssetAdapter.head.assetBindings = [missingBinding];
missingCandidate.envelope.assetBindings = [missingBinding];
missingCandidate.version.assetIds = [missingAssetId];
const missingAssetInspection = await missingAssetStorage.inspect();
equal(missingAssetInspection.kind, "invalid", "missing recovery asset is classified as invalid");
if (missingAssetInspection.kind !== "invalid") throw new Error("expected_invalid_missing_asset");
equal(missingAssetInspection.error, "recovery_asset_missing", "missing recovery asset reports the bounded validation error");
check(Boolean(missingAssetInspection.envelope), "valid envelope remains available for exact discard when candidate assets are invalid");

const crossProjectAdapter = new RecoveryMemoryAdapter();
const crossProjectStorage = createProjectRecoveryStorageV1(crossProjectAdapter);
const crossProjectWritten = await crossProjectStorage.write({
  candidate: recovered,
  sourceProject: source,
  ownerSessionId: "cross-session",
  workspaceInstanceId: "cross-workspace",
  draftSequence: 1,
  workspaceGeneration: 1,
  lastMeaningfulEditAt: "2026-09-21T02:20:00.000Z",
  now: "2026-09-21T02:20:01.000Z",
});
const crossCandidate = crossProjectAdapter.candidates.get(crossProjectAdapter.key(1, crossProjectWritten.envelope.candidateDigest));
if (!crossCandidate) throw new Error("missing_cross_project_candidate");
crossCandidate.version.projectId = "55555555-5555-4555-8555-555555555555";
const crossProjectInspection = await crossProjectStorage.inspect();
equal(crossProjectInspection.kind, "invalid", "cross-project candidate binding is classified as invalid");
if (crossProjectInspection.kind !== "invalid") throw new Error("expected_invalid_cross_project");
equal(crossProjectInspection.error, "recovery_invalid_record", "cross-project candidate binding fails closed");

const oversizedAdapter = new RecoveryMemoryAdapter();
const oversizedStorage = createProjectRecoveryStorageV1(oversizedAdapter);
await oversizedStorage.write({
  candidate: recovered,
  sourceProject: source,
  ownerSessionId: "oversized-session",
  workspaceInstanceId: "oversized-workspace",
  draftSequence: 1,
  workspaceGeneration: 1,
  lastMeaningfulEditAt: "2026-09-21T02:30:00.000Z",
  now: "2026-09-21T02:30:01.000Z",
});
if (!oversizedAdapter.head) throw new Error("missing_oversized_head");
oversizedAdapter.head.storedByteLength = 134_217_729;
const oversizedInspection = await oversizedStorage.inspect();
equal(oversizedInspection.kind, "invalid", "oversized recovery envelope is classified as invalid");
if (oversizedInspection.kind !== "invalid") throw new Error("expected_invalid_oversized");
equal(oversizedInspection.error, "recovery_invalid_record", "oversized recovery envelope fails closed");

const result = {
  kind: "spec0010-phase3-contract",
  version: 1,
  status: "PASS",
  assertions,
  facts: {
    startupRevalidation: true,
    exactClaimCas: true,
    matchingSourceIdentityPreserved: true,
    staleSourceDetached: true,
    newerSourceDetached: true,
    changedSourceDetached: true,
    detachedRevision: 0,
    missingAssetInvalid: true,
    crossProjectInvalid: true,
    oversizedInvalid: true,
    exactDiscardOnly: true,
    officialWrites: 0,
    externalRequests: 0,
  },
};
writeFileSync(`${OUTPUT_ROOT}/contract.json`, `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify(result));
