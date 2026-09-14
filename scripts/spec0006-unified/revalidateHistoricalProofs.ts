import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

const output = "output/spec-0006/phase-7/historical-revalidation.json";
const sha = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const available = [
  {
    phase: "phase-3-final",
    commit: "e11f6c453f13772ee9bd4b172a17bc68e1de65b9",
    path: "/Users/arthurcarlin/Projects/stick-animation-app/output/spec-0006/git-054/e11f6c453f13772ee9bd4b172a17bc68e1de65b9/accepted-phase3/proof-manifest.json",
    expectedSha256: "207aea2a7d664e49d28dd6b8c4704e50da9fae8d5197d9164ccbac871db4fcc0",
    expectedBytes: 22897,
  },
  {
    phase: "phase-5-final",
    commit: "a759ae8afbb67e8fb723983851ae36947fd97f17",
    path: "/Users/arthurcarlin/.codex/worktrees/2d14/stick-animation-app/output/recovery/GIT-057-phase-5-a759ae8/phase-5/proof-manifest.json",
    expectedSha256: "6a1c65c967f8f1d87a27e3834677bea84381f0c2577125bebfead6ca77308b6d",
    expectedBytes: 32852,
  },
  {
    phase: "phase-6-final",
    commit: "cbe16411a0f83d3b86136f41d0a66d1874d009aa",
    path: "/Users/arthurcarlin/.codex/worktrees/2d14/stick-animation-app/output/recovery/GIT-060-phase-6-cbe1641/phase-6/proof-manifest.json",
    expectedSha256: "5883ea735bd741b2f14e45d2fa84669ea3bb78ad5ed23693011e0280e4070902",
    expectedBytes: 43794,
  },
] as const;

const revalidated = available.map(entry => {
  const bytes = readFileSync(entry.path);
  assert.equal(bytes.length, entry.expectedBytes, `${entry.phase} manifest size`);
  assert.equal(sha(bytes), entry.expectedSha256, `${entry.phase} manifest digest`);
  const manifest = JSON.parse(bytes.toString()) as { status: string; sourceBindings: Array<{ path: string; bytes?: number; byteLength?: number; sha256: string }> };
  assert.equal(manifest.status, "PASS", `${entry.phase} status`);
  for (const binding of manifest.sourceBindings) {
    const source = execFileSync("git", ["show", `${entry.commit}:${binding.path}`]);
    assert.equal(source.length, binding.bytes ?? binding.byteLength, `${entry.phase}:${binding.path}:size`);
    assert.equal(sha(source), binding.sha256, `${entry.phase}:${binding.path}:sha256`);
  }
  return { phase: entry.phase, commit: entry.commit, manifestSha256: entry.expectedSha256, manifestBytes: bytes.length, sourceBindings: manifest.sourceBindings.length, status: "PASS" };
});

const unavailable = [
  { phase: "phase-1-final", commit: "804ff39dc73c88d4799570cce2ef18987745a0be", recordedSha256: "83614635c02f22d81205c441c46de3bff3a75f1c948661a1670a36eca75dbb29", recordedBytes: 9257 },
  { phase: "phase-2-final", commit: "d2096109900cc50a0a4dae2f603bd74b7b4a3427", recordedSha256: "ebfeb699c0d9bcedd5b6b7c90d5cb4b71a3fe3ea89326a2820b86882e2c27cb7", recordedBytes: 16649 },
  { phase: "phase-4a-checkpoint", commit: "9c971fa4f7ea0e636ecc6957755552f678f344df", recordedSha256: null, recordedBytes: null },
  { phase: "phase-4-final", commit: "9c971fa4f7ea0e636ecc6957755552f678f344df", recordedSha256: "9d2d18871981db2e499c689723730ada4690dd5cb94ab620a038e45557f298de", recordedBytes: null },
] as const;
for (const entry of unavailable) execFileSync("git", ["cat-file", "-e", `${entry.commit}^{commit}`]);

mkdirSync("output/spec-0006/phase-7", { recursive: true });
const result = {
  status: "PASS_WITH_RECORDED_GAPS",
  revalidated,
  unavailable: unavailable.map(entry => ({ ...entry, status: "SOURCE_COMMIT_PRESENT_MANIFEST_FILE_NOT_PRESERVED", claim: "record identity only; manifest bytes not falsely revalidated" })),
  immutableHistoryRewritten: false,
};
writeFileSync(output, JSON.stringify(result, null, 2) + "\n");
console.log(JSON.stringify({ status: result.status, fullyRevalidated: revalidated.length, unavailable: unavailable.length, output }));
