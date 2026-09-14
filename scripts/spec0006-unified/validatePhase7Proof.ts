import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

const manifestPath = "output/spec-0006/phase-7/proof-manifest.json";
const manifestBytes = readFileSync(manifestPath);
const manifest = JSON.parse(manifestBytes.toString());
const digest = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const expectedPaths = [
  "scripts/fixtures/spec0006-unified/v2/phase7-acceptance-cases.json", "scripts/spec0006-unified/finalizePhase7Proof.ts",
  "scripts/spec0006-unified/phase7BrowserProof.ts", "scripts/spec0006-unified/recordPhase7Proof.ts",
  "scripts/spec0006-unified/revalidateHistoricalProofs.ts", "scripts/spec0006-unified/validatePhase7Authority.ts",
  "scripts/spec0006-unified/validatePhase7Proof.ts", "src/components/workspace/AnimationWorkspace.tsx",
  "src/components/workspace/DrawingCanvas.tsx", "src/components/workspace/DrawingWorkspace.tsx",
  "src/lib/animation/unifiedWorkspaceBootstrap.ts",
].sort();
let assertions = 0;
const equal = (actual: unknown, expected: unknown, message?: string) => { assertions += 1; assert.deepEqual(actual, expected, message); };
const ok = (actual: unknown, message?: string) => { assertions += 1; assert.ok(actual, message); };

equal(manifest.kind, "spec0006-phase7-retirement-full-acceptance-proof");
equal(manifest.status, "PASS"); equal(manifest.integrity, "VALID"); equal(manifest.technicalAcceptance, "PASS");
equal(manifest.baseSha, "cbe16411a0f83d3b86136f41d0a66d1874d009aa"); equal(manifest.headSha, manifest.baseSha);
equal(manifest.pathCeiling, 18); equal(manifest.indexEmpty, true); equal(manifest.exactDirtyPaths, expectedPaths);
equal(manifest.sourceBindings.length, expectedPaths.length); ok(manifest.sourceBindings.length <= manifest.pathCeiling);
for (const binding of [...manifest.sourceBindings, ...manifest.evidenceBindings]) {
  const bytes = readFileSync(binding.path); equal(bytes.length, binding.bytes, `${binding.path}:bytes`); equal(digest(bytes), binding.sha256, `${binding.path}:sha256`);
}
equal(manifest.commands.every((command: { exitCode: number }) => command.exitCode === 0), true);
equal(manifest.browserCommands.every((command: { exitCode: number }) => command.exitCode === 0), true);
equal(manifest.evidence.ordinaryFlows, 9); equal(manifest.evidence.regressions, 12);
equal(manifest.evidence.legacyWrites, 0); equal(manifest.evidence.secondCoordinatorMounts, 0);
equal(manifest.evidence.externalRequests, 0); equal(manifest.evidence.realApiRequests, 0);
equal(manifest.evidence.accessibility, { critical: 0, serious: 0, keyboardFocus: "PASS", zoom200Percent: "PASS", reducedMotion: "PASS" });
equal(manifest.evidence.historicalRevalidation.revalidated.length, 3);
equal(manifest.evidence.historicalRevalidation.unavailable.length, 4);
equal(manifest.evidence.historicalRevalidation.immutableHistoryRewritten, false);
equal(spawnSync("git", ["diff", "--cached", "--name-only"], { encoding: "utf8" }).stdout, "");
const dirty = spawnSync("git", ["status", "--porcelain=v1", "--untracked-files=all"], { encoding: "utf8" }).stdout.split("\n").filter(Boolean).map(line => line.slice(3)).sort();
equal(dirty, expectedPaths);
const pids = spawnSync("lsof", ["-nP", "-t", "-iTCP:56770", "-sTCP:LISTEN"], { encoding: "utf8" }).stdout.trim().split("\n").filter(Boolean).map(Number);
equal(pids, [manifest.review.listenerPid]);
const cwd = spawnSync("lsof", ["-a", "-p", String(pids[0]), "-d", "cwd", "-Fn"], { encoding: "utf8" }).stdout.split("\n").find(line => line.startsWith("n"))?.slice(1);
equal(cwd, manifest.worktree); equal(manifest.review.url, "http://127.0.0.1:56770/"); equal(manifest.review.serverPreserved, true);

const validates = (candidate: typeof manifest) => candidate.status === "PASS" && candidate.integrity === "VALID" && candidate.sourceBindings.length === expectedPaths.length && candidate.evidence.legacyWrites === 0 && candidate.evidence.externalRequests === 0 && candidate.evidence.realApiRequests === 0 && candidate.evidence.secondCoordinatorMounts === 0 && candidate.evidence.ordinaryFlows === 9 && candidate.evidence.regressions === 12 && candidate.pathCeiling === 18 && candidate.indexEmpty === true && candidate.headSha === candidate.baseSha;
for (const mutation of [
  { status: "FAIL" }, { integrity: "INVALID" }, { sourceBindings: [] }, { evidence: { ...manifest.evidence, legacyWrites: 1 } },
  { evidence: { ...manifest.evidence, externalRequests: 1 } }, { evidence: { ...manifest.evidence, realApiRequests: 1 } },
  { evidence: { ...manifest.evidence, secondCoordinatorMounts: 1 } }, { evidence: { ...manifest.evidence, ordinaryFlows: 8 } },
  { evidence: { ...manifest.evidence, regressions: 11 } }, { pathCeiling: 10 }, { indexEmpty: false }, { headSha: "0".repeat(40) },
]) {
  assertions += 1;
  assert.equal(validates({ ...manifest, ...mutation }), false);
}
console.log(JSON.stringify({ status: "PASS", integrity: "VALID", assertions, mutationCases: 12, manifestBytes: manifestBytes.length, manifestSha256: digest(manifestBytes), sourceBindings: manifest.sourceBindings.length, evidenceBindings: manifest.evidenceBindings.length }));
