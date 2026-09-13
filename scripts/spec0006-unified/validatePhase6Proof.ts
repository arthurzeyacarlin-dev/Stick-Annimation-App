import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const manifestPath = "output/spec-0006/phase-6/proof-manifest.json";
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const digest = (path: string) => createHash("sha256").update(readFileSync(path)).digest("hex");
const git = (...args: string[]) => {
  const result = spawnSync("git", args, { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout;
};
const dirty = git("status", "--porcelain=v1", "--untracked-files=all").split("\n").filter(Boolean).map(line => line.slice(3)).sort();

assert.equal(manifest.kind, "spec0006-phase6-adoption-recovery-proof");
assert.equal(manifest.version, 1);
assert.equal(manifest.status, "PASS");
assert.equal(manifest.technicalAcceptance, "PASS");
assert.equal(manifest.baseSha, "62feafc220c35eb1203dc4f19820e533a54002e1");
assert.equal(manifest.headSha, manifest.baseSha);
assert.equal(git("rev-parse", "HEAD").trim(), manifest.headSha);
assert.equal(manifest.indexEmpty, true);
assert.equal(git("diff", "--cached", "--name-only"), "");
assert.ok(manifest.exactDirtyPaths.length <= manifest.pathCeiling);
assert.deepEqual(dirty, manifest.exactDirtyPaths);
assert.equal(manifest.sourceBindings.length, manifest.exactDirtyPaths.length);
for (const binding of [...manifest.sourceBindings, ...manifest.evidenceBindings]) {
  const bytes = readFileSync(binding.path);
  assert.equal(bytes.length, binding.bytes, binding.path);
  assert.equal(digest(binding.path), binding.sha256, binding.path);
}
assert.equal(manifest.commands.length >= 20, true);
assert.equal(manifest.commands.every((result: { exitCode: number }) => result.exitCode === 0), true);
assert.deepEqual(manifest.evidence.sourceKinds, ["drawing-v1", "drawing-v2", "stick-v1", "stick-v2", "unified-v1", "unified-v2"]);
assert.equal(manifest.evidence.adoptionFlows, 10);
assert.equal(manifest.evidence.deterministicAssertions, 1117);
assert.equal(manifest.evidence.deterministicCases, 1000);
assert.equal(manifest.evidence.historyOperations, 48);
assert.equal(manifest.evidence.recoveryFaults.length, 16);
assert.equal(manifest.evidence.sourceStoreWrites, 0);
assert.equal(manifest.evidence.externalRequests, 0);
assert.equal(manifest.evidence.realApiRequests, 0);
assert.equal(manifest.evidence.aiChanges, 0);
assert.match(manifest.evidence.compactLimitation, /not a physical phone/);
const browser = JSON.parse(readFileSync("output/spec-0006/phase-6/browser/result.json", "utf8"));
assert.equal(browser.status, "PASS");
assert.equal(browser.profiles.length, 2);
assert.equal(browser.requests.filter((request: { disposition: string }) => request.disposition === "blocked").length, 0);
assert.deepEqual(browser.pageErrors, []);
assert.deepEqual(browser.consoleErrors, []);
assert.deepEqual(browser.profiles.map((profile: { viewport: unknown }) => profile.viewport), [
  { name: "desktop", width: 1440, height: 900, deviceScaleFactor: 1 },
  { name: "compact", width: 390, height: 844, deviceScaleFactor: 2 },
]);
for (const profile of browser.profiles) {
  assert.equal(profile.adoption.length, 5);
  assert.deepEqual(profile.sourceAfter, profile.sourceBefore);
  assert.ok(profile.native.originalId !== profile.native.copyId);
  assert.ok(profile.native.beforeSave.opaque > 0 && profile.native.beforeSave.segments > 0);
  assert.equal(profile.timings.openMs.length, 5);
  assert.ok(profile.timings.saveMs.length >= 7);
  assert.equal(profile.timings.selectionSettleMs.length, 120);
  assert.equal(profile.large.immediatelyPersisted.revision, 2);
  assert.equal(profile.large.immediatelyPersisted.largeAssetCount, 2);
  assert.equal(profile.large.persisted.revision, 3);
  assert.equal(profile.large.persisted.largeAssetCount, 2);
  assert.equal(profile.large.persisted.directRecordRetired, true);
  assert.ok(profile.large.persisted.storedByteLength < 134_217_728);
  assert.ok(profile.large.heap.open.used <= 512 * 1024 * 1024);
  assert.ok(profile.large.heap.reopen.used <= 512 * 1024 * 1024);
  assert.ok(profile.large.heap.settled.used <= 320 * 1024 * 1024);
}
const listener = spawnSync("lsof", ["-nP", "-t", "-iTCP:56666", "-sTCP:LISTEN"], { encoding: "utf8" });
assert.equal(listener.status, 0);
assert.deepEqual(listener.stdout.trim().split("\n").filter(Boolean).map(Number), [manifest.review.listenerPid]);
const cwd = spawnSync("lsof", ["-a", "-p", String(manifest.review.listenerPid), "-d", "cwd", "-Fn"], { encoding: "utf8" }).stdout.split("\n").find(line => line.startsWith("n"))?.slice(1);
assert.equal(cwd, manifest.worktree);
assert.equal(manifest.review.url, "http://127.0.0.1:56666/");
assert.equal(manifest.review.serverPreserved, true);
console.log(JSON.stringify({ status: "PASS", integrity: "VALID", technicalAcceptance: "PASS", humanAcceptance: "pending Arthur", sourceBindings: manifest.sourceBindings.length, evidenceBindings: manifest.evidenceBindings.length, manifestBytes: readFileSync(manifestPath).length, manifestSha256: digest(manifestPath) }));
