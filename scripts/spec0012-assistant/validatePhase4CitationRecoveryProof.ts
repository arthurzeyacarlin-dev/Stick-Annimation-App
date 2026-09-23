import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

const base = "741ee803f9e0bd72f7c64174a77e52a6ac3a7b17";
const root = "output/spec-0012/phase-4-citation-recovery";
const allowlist = [
  "scripts/spec0012-assistant/phase4BrowserProof.ts",
  "scripts/spec0012-assistant/phase4Fixtures.ts",
  "scripts/spec0012-assistant/phase4Oracle.ts",
  "scripts/spec0012-assistant/phase4Regressions.ts",
  "scripts/spec0012-assistant/recordPhase4CitationRecoveryProof.ts",
  "scripts/spec0012-assistant/validatePhase4CitationRecoveryProof.ts",
  "src/lib/assistant/assistantProvider.ts",
].sort();
const evidencePaths = [
  ".playwright-cli/page-2026-09-23T11-48-53-552Z.png",
  ".playwright-cli/page-2026-09-23T11-49-03-676Z.yml",
  `${root}/live/result.json`,
  `${root}/receipts/diff-check.json`,
  `${root}/receipts/focused-lint.json`,
  `${root}/receipts/typescript.json`,
  `${root}/review-server.json`,
  "output/spec-0012/phase-4/browser/result.json",
  "output/spec-0012/phase-4/build/result.json",
  "output/spec-0012/phase-4/corrupt-row/result.json",
  "output/spec-0012/phase-4/oracle/result.json",
  "output/spec-0012/phase-4/regression-browsers/result.json",
  "output/spec-0012/phase-4/regressions/result.json",
].sort();
const git = (...args: string[]) => execFileSync("git", args, { encoding: "utf8" }).trim();
const sha = (bytes: string | Buffer) => createHash("sha256").update(bytes).digest("hex");
const json = (path: string) => JSON.parse(readFileSync(path, "utf8"));
type Binding = { path: string; bytes: number; sha256: string };
const verify = (binding: Binding) => { assert.ok(!binding.path.startsWith("/") && !binding.path.includes("..") && !binding.path.includes(".env")); const bytes = readFileSync(binding.path); assert.equal(bytes.length, binding.bytes); assert.equal(sha(bytes), binding.sha256, binding.path); };
const manifest = json(`${root}/proof-manifest.json`);

function validate(value: typeof manifest) {
  assert.equal(value.schema, "spec-0012-phase-4-citation-recovery-proof/v1"); assert.equal(value.status, "PASS"); assert.equal(value.base, base); assert.equal(value.head, base); assert.equal(value.role, "Spec Executor"); assert.equal(value.worktree, process.cwd()); assert.equal(value.indexEmpty, true);
  assert.equal(git("rev-parse", "HEAD"), base); assert.equal(git("diff", "--cached", "--name-only"), "");
  const dirty = execFileSync("git", ["status", "--porcelain", "--untracked-files=all"], { encoding: "utf8" }).split("\n").filter(Boolean).map(line => line.slice(3)).sort();
  assert.deepEqual(dirty, allowlist); assert.deepEqual(value.dirtyPathAllowlist, allowlist); assert.deepEqual(value.actualDirtyPaths, allowlist);
  assert.deepEqual(value.sources.map((binding: Binding) => binding.path), allowlist); value.sources.forEach(verify); assert.equal(value.sourceDigest, sha(JSON.stringify(value.sources.map(({ path, sha256 }: Binding) => ({ path, sha256 })))));
  assert.deepEqual(value.evidence.map((binding: Binding) => binding.path), evidencePaths); value.evidence.forEach(verify);
  assert.deepEqual(value.limits, { model: "gpt-5.6-terra", hardDeadlineMs: 55000, searchDeadlineMs: 30000, requestUsd: .15, webSearchToolCalls: 2, processedSources: 8, displayedSources: 6, maxRetries: 0, store: false, arbitraryFetch: false, mediaInspection: false, projectMutation: false });
  assert.deepEqual(value.proof, { deterministicAssertions: 66, browserAssertions: 25, corruptRowAssertions: 27, protectedOracleSuites: 4, protectedBrowserSuites: 6, focusedBuild: "PASS", fullBuild: "INHERITED_BASELINE_FAILURE", typecheck: "PASS", focusedLint: "PASS", diffCheck: "PASS" });
  assert.deepEqual(value.recovery, { source: "web_search_call.action.sources", zeroAnnotationOnly: true, neutralHostnameLabels: true, wholeAnswerAssociation: true, anyPresentAnnotationStillStrict: true, forgedPrivateAndMisalignedAnnotationsRejected: true, missingOrPrivateSourceMetadataRejected: true });
  assert.equal(value.live.status, "PASS"); assert.equal(value.live.reviewUrl, "http://127.0.0.1:58040/assistant"); assert.equal(value.live.liveCalls, 1); assert.equal(value.live.assistantPostRequests, 1); assert.equal(value.live.automaticRetries, 0); assert.equal(value.live.toolCalls, 1);
  assert.equal(value.live.processedSourceCount, 8); assert.equal(value.live.displayedSourceCount, 6); assert.equal(value.live.missingAnnotationRecoveryObserved, true); assert.equal(value.live.recoveryEvidence.sourceTitlesAreNeutralHostnames, true); assert.equal(value.live.recoveryEvidence.allCitationRangesAttachToWholeAnswer, true);
  assert.equal(value.live.formerFailureVisible, false); assert.equal(value.live.citationsPersistedAcrossReload, true); assert.equal(value.live.consoleErrors, 0); assert.equal(value.live.consoleWarnings, 0); assert.equal(value.live.hardDeadlineMs, 55000); assert.ok(value.live.jobElapsedMs < value.live.hardDeadlineMs); assert.ok(value.live.finalizingMs >= 2700 && value.live.finalizingMs < 5000); assert.ok(value.live.estimatedCostUsd <= value.live.requestCostCeilingUsd);
  const health = spawnSync("curl", ["-sS", "-o", "/dev/null", "-w", "%{http_code}", value.live.reviewUrl], { encoding: "utf8" }); assert.equal(health.status, 0); assert.equal(health.stdout, "200");
  const reviewServer = json(`${root}/review-server.json`); assert.equal(reviewServer.status, "PASS"); assert.equal(reviewServer.pid, Number(execFileSync("lsof", ["-nP", "-iTCP:58040", "-sTCP:LISTEN", "-t"], { encoding: "utf8" }).trim())); assert.equal(reviewServer.cwd, process.cwd()); assert.equal(reviewServer.onlyFreshReviewPort, true); assert.equal(reviewServer.credentialFileIgnored, true); assert.equal(reviewServer.credentialFileTracked, false); assert.equal(reviewServer.credentialFileSymlink, true); assert.equal(reviewServer.credentialContentsReadOrPrinted, false);
  const oracle = json("output/spec-0012/phase-4/oracle/result.json"); assert.equal(oracle.assertions.length, 66); for (const label of ["forged citation fails closed", "private citation fails closed", "misaligned citation fails closed", "missing source metadata fails closed", "private source metadata fails closed", "missing-annotation recovery uses the original Responses request without retry or duplicate answer"]) assert.ok(oracle.assertions.includes(label));
  const browser = json("output/spec-0012/phase-4/browser/result.json"); assert.equal(browser.assertions.length, 25); assert.deepEqual(browser.errors, []); assert.deepEqual(browser.forbidden, []); assert.equal(browser.realProviderCalls, 0); assert.equal(browser.paidCalls, 0);
  const regressions = json("output/spec-0012/phase-4/regressions/result.json"); assert.deepEqual(regressions.protectedDiff, []); assert.deepEqual(value.protected.protectedDiff, []); assert.equal(value.protected.canonicalControlPlaneChanged, false); assert.equal(value.protected.corruptRowCanonicalBytesPreserved, true); assert.equal(value.protected.projectMutation, false); assert.equal(value.protected.unrelatedApiRequests, 0);
  assert.equal(value.humanAcceptance, "pending"); for (const key of ["controlPlaneUpdated", "staged", "committed", "merged", "pushed", "published", "deployed", "laterPhaseStarted"]) assert.equal(value[key], false);
  assert.deepEqual(git("diff", "--name-only", base, "--", ...regressions.protectedFamilies).split("\n").filter(Boolean), []);
}

validate(manifest);
const mutations: Array<[string, (value: typeof manifest) => void]> = [
  ["base", value => { value.base = "0".repeat(40); }], ["allowlist", value => { value.dirtyPathAllowlist.pop(); }], ["source", value => { value.sources[0].sha256 = "0".repeat(64); }], ["evidence", value => { value.evidence[0].sha256 = "0".repeat(64); }],
  ["retry", value => { value.live.automaticRetries = 1; }], ["duplicate request", value => { value.live.assistantPostRequests = 2; }], ["deadline", value => { value.live.jobElapsedMs = 55000; }], ["cost", value => { value.live.estimatedCostUsd = .16; }],
  ["recovery", value => { value.live.missingAnnotationRecoveryObserved = false; }], ["strict rejection", value => { value.recovery.anyPresentAnnotationStillStrict = false; }], ["protected diff", value => { value.protected.protectedDiff.push("docs/README.md"); }], ["publication", value => { value.published = true; }],
];
for (const [name, mutate] of mutations) { const candidate = structuredClone(manifest); mutate(candidate); assert.throws(() => validate(candidate), `must reject ${name}`); }
const receipt = { status: "PASS", manifestSha256: sha(readFileSync(`${root}/proof-manifest.json`)), sourceDigest: manifest.sourceDigest, sourceFiles: manifest.sources.length, evidenceFiles: manifest.evidence.length, mutationRejections: mutations.map(([name]) => name), liveCalls: 1, automaticRetries: 0, missingAnnotationRecoveryProven: true, strictInvalidCitationRejectionProven: true, indexEmpty: true };
writeFileSync(`${root}/validation-receipt.json`, `${JSON.stringify(receipt, null, 2)}\n`, { flag: "wx" });
console.log(JSON.stringify(receipt));
