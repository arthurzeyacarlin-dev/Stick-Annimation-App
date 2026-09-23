import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

const root = "output/spec-0012/phase-4-final-correction";
const sha = (bytes: string | Buffer) => createHash("sha256").update(bytes).digest("hex");
const json = (path: string) => JSON.parse(readFileSync(path, "utf8"));
const manifest = json(`${root}/proof-manifest.json`);
type Binding = { path: string; bytes: number; sha256: string };
const verify = (binding: Binding) => { assert.ok(!binding.path.startsWith("/") && !binding.path.includes("..") && !binding.path.includes(".env")); const bytes = readFileSync(binding.path); assert.equal(bytes.length, binding.bytes); assert.equal(sha(bytes), binding.sha256, binding.path); };
function validate(value: typeof manifest) {
  assert.equal(value.schema, "spec-0012-phase-4-final-correction-proof/v1"); assert.equal(value.base, "21c5b3d70bf3ae5444a310913dbccec9a63895d9"); assert.equal(value.role, "Spec Executor");
  const dirty = execFileSync("git", ["status", "--porcelain", "--untracked-files=all"], { encoding: "utf8" }).split("\n").filter(Boolean).map(line => line.slice(3)).sort();
  assert.deepEqual(value.dirtyPathAllowlist, dirty); assert.equal(execFileSync("git", ["diff", "--cached", "--name-only"], { encoding: "utf8" }).trim(), "");
  assert.deepEqual(value.sources.map((item: Binding) => item.path), value.dirtyPathAllowlist); value.sources.forEach(verify); value.evidence.forEach(verify);
  assert.equal(value.sourceDigest, sha(JSON.stringify(value.sources.map(({ path, sha256 }: Binding) => ({ path, sha256 })))))
  assert.deepEqual(value.proof, { deterministicAssertions: 57, finalizationAssertions: 23, browserAssertions: 23, protectedRegressionSuites: 4, typecheckPassed: true, focusedLintPassed: true, diffCheckPassed: true, liveProviderCalls: 2 });
  assert.equal(value.live.status, "PASS"); assert.equal(value.live.origin, "http://127.0.0.1:58050"); assert.equal(value.live.liveCalls, 2); assert.equal(value.live.retries, 0); assert.equal(value.live.hardDeadlineMs, 55000);
  assert.ok(value.live.greeting.elapsedMs < 58000 && value.live.search.elapsedMs < 58000); assert.ok(value.live.search.finalizingMs >= 2700 && value.live.search.finalizingMs < 5000);
  assert.equal(value.live.searchingTextObserved, true); assert.equal(value.live.finalizingObserved, true); assert.equal(value.live.reasoningChanged, true); assert.equal(value.live.citationsPersistedAcrossReload, true); assert.equal(value.live.projectSentinelUnchanged, true); assert.deepEqual(value.live.errors, []); assert.deepEqual(value.live.external, []);
  assert.equal(value.humanAcceptance, "pending"); assert.equal(value.controlPlaneUpdated, false); assert.equal(value.gitPublication, false);
}
validate(manifest);
for (const [name, mutate] of [
  ["base", (v: typeof manifest) => { v.base = "0".repeat(40); }], ["allowlist", (v: typeof manifest) => { v.dirtyPathAllowlist.pop(); }],
  ["source", (v: typeof manifest) => { v.sources[0].sha256 = "0".repeat(64); }], ["evidence", (v: typeof manifest) => { v.evidence[0].sha256 = "0".repeat(64); }],
  ["finalizing", (v: typeof manifest) => { v.live.search.finalizingMs = 300000; }], ["deadline", (v: typeof manifest) => { v.live.search.elapsedMs = 300000; }],
  ["retry", (v: typeof manifest) => { v.live.retries = 1; }], ["publication", (v: typeof manifest) => { v.gitPublication = true; }],
] as Array<[string, (value: typeof manifest) => void]>) { const candidate = structuredClone(manifest); mutate(candidate); assert.throws(() => validate(candidate), name); }
const receipt = { status: "PASS", manifestSha256: sha(readFileSync(`${root}/proof-manifest.json`)), sourceDigest: manifest.sourceDigest, dirtyPathAllowlist: manifest.dirtyPathAllowlist, sourceFiles: manifest.sources.length, evidenceFiles: manifest.evidence.length, mutationRejections: 8, indexEmpty: true };
writeFileSync(`${root}/validation-receipt.json`, `${JSON.stringify(receipt, null, 2)}\n`, { flag: "wx" }); console.log(JSON.stringify(receipt));
