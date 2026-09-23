import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { lstatSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";

const base = "741ee803f9e0bd72f7c64174a77e52a6ac3a7b17";
const root = "output/spec-0012/phase-4-citation-recovery";
const reviewUrl = "http://127.0.0.1:58040/assistant";
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
const bind = (path: string) => { const bytes = readFileSync(path); return { path, bytes: bytes.length, sha256: sha(bytes) }; };
const json = (path: string) => JSON.parse(readFileSync(path, "utf8"));
const dirty = execFileSync("git", ["status", "--porcelain", "--untracked-files=all"], { encoding: "utf8" }).split("\n").filter(Boolean).map(line => line.slice(3)).sort();

assert.equal(git("rev-parse", "HEAD"), base);
assert.equal(git("diff", "--cached", "--name-only"), "");
assert.deepEqual(dirty, allowlist);
mkdirSync(`${root}/receipts`, { recursive: true });
for (const [id, command, args] of [
  ["typescript", process.execPath, ["node_modules/typescript/bin/tsc", "--noEmit", "--incremental", "false"]],
  ["focused-lint", process.execPath, ["node_modules/eslint/bin/eslint.js", ...allowlist]],
  ["diff-check", "git", ["diff", "--check"]],
] as Array<[string, string, string[]]>) {
  const result = spawnSync(command, args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  writeFileSync(`${root}/receipts/${id}.json`, `${JSON.stringify({ id, command: [command, ...args], exitCode: result.status, stdout: result.stdout, stderr: result.stderr }, null, 2)}\n`, { flag: "wx" });
  assert.equal(result.status, 0, result.stdout + result.stderr);
}

const health = spawnSync("curl", ["-sS", "-o", "/dev/null", "-w", "%{http_code}", reviewUrl], { encoding: "utf8" });
assert.equal(health.status, 0); assert.equal(health.stdout, "200");
const listener = execFileSync("lsof", ["-nP", "-iTCP:58040", "-sTCP:LISTEN", "-t"], { encoding: "utf8" }).trim(); assert.match(listener, /^\d+$/);
const listenerCwd = execFileSync("lsof", ["-a", "-p", listener, "-d", "cwd", "-Fn"], { encoding: "utf8" }).split("\n").find(line => line.startsWith("n"))?.slice(1);
assert.equal(listenerCwd, process.cwd());
const reviewPorts = [...new Set([...execFileSync("lsof", ["-nP", "-iTCP", "-sTCP:LISTEN"], { encoding: "utf8" }).matchAll(/:(58\d{3}) \(LISTEN\)/g)].map(match => Number(match[1])))];
assert.deepEqual(reviewPorts, [58040]);
writeFileSync(`${root}/review-server.json`, `${JSON.stringify({ status: "PASS", url: reviewUrl, port: 58040, pid: Number(listener), mode: "production", healthStatus: 200, cwd: listenerCwd, onlyFreshReviewPort: true, credentialFileIgnored: git("check-ignore", ".env.local") === ".env.local", credentialFileTracked: git("ls-files", ".env.local") !== "", credentialFileSymlink: lstatSync(".env.local").isSymbolicLink(), credentialContentsReadOrPrinted: false }, null, 2)}\n`, { flag: "wx" });

const oracle = json("output/spec-0012/phase-4/oracle/result.json");
const browser = json("output/spec-0012/phase-4/browser/result.json");
const build = json("output/spec-0012/phase-4/build/result.json");
const corruptRow = json("output/spec-0012/phase-4/corrupt-row/result.json");
const regressions = json("output/spec-0012/phase-4/regressions/result.json");
const browserRegressions = json("output/spec-0012/phase-4/regression-browsers/result.json");
const live = json(`${root}/live/result.json`);
assert.equal(oracle.status, "PASS"); assert.equal(oracle.assertions.length, 66);
assert.equal(browser.status, "PASS"); assert.equal(browser.assertions.length, 25); assert.deepEqual(browser.errors, []); assert.deepEqual(browser.forbidden, []); assert.equal(browser.searchTransportCalls, 3);
assert.equal(build.focused.status, "PASS"); assert.equal(corruptRow.status, "PASS"); assert.equal(corruptRow.assertionCount, 27);
assert.equal(regressions.status, "PASS"); assert.equal(regressions.receipts.length, 4); assert.deepEqual(regressions.protectedDiff, []);
assert.equal(browserRegressions.status, "PASS"); assert.equal(browserRegressions.receipts.length, 6); assert.ok(browserRegressions.receipts.every((receipt: { exitCode: number }) => receipt.exitCode === 0));
assert.equal(live.status, "PASS"); assert.equal(live.liveCalls, 1); assert.equal(live.assistantPostRequests, 1); assert.equal(live.automaticRetries, 0); assert.equal(live.toolCalls, 1);
assert.equal(live.missingAnnotationRecoveryObserved, true); assert.equal(live.recoveryEvidence.sourceTitlesAreNeutralHostnames, true); assert.equal(live.recoveryEvidence.allCitationRangesAttachToWholeAnswer, true);
assert.equal(live.formerFailureVisible, false); assert.equal(live.citationsPersistedAcrossReload, true); assert.equal(live.consoleErrors, 0); assert.equal(live.consoleWarnings, 0);
assert.equal(live.hardDeadlineMs, 55000); assert.ok(live.jobElapsedMs < live.hardDeadlineMs); assert.ok(live.finalizingMs >= 2700 && live.finalizingMs < 5000); assert.ok(live.estimatedCostUsd <= live.requestCostCeilingUsd);

const sources = allowlist.map(bind); const evidence = evidencePaths.map(bind);
const manifest = {
  schema: "spec-0012-phase-4-citation-recovery-proof/v1", status: "PASS", generatedAt: new Date().toISOString(), base, head: git("rev-parse", "HEAD"), role: "Spec Executor", worktree: process.cwd(), indexEmpty: true,
  scope: "Recover a cited answer only when a successful hosted search has zero usable URL annotations and provider-owned web_search_call.action.sources; keep all present annotations on the existing strict validation path.",
  dirtyPathAllowlist: allowlist, actualDirtyPaths: dirty, sources, sourceDigest: sha(JSON.stringify(sources.map(({ path, sha256 }) => ({ path, sha256 })))), evidence,
  limits: { model: "gpt-5.6-terra", hardDeadlineMs: 55000, searchDeadlineMs: 30000, requestUsd: .15, webSearchToolCalls: 2, processedSources: 8, displayedSources: 6, maxRetries: 0, store: false, arbitraryFetch: false, mediaInspection: false, projectMutation: false },
  proof: { deterministicAssertions: oracle.assertions.length, browserAssertions: browser.assertions.length, corruptRowAssertions: corruptRow.assertionCount, protectedOracleSuites: regressions.receipts.length, protectedBrowserSuites: browserRegressions.receipts.length, focusedBuild: build.focused.status, fullBuild: build.full.status, typecheck: "PASS", focusedLint: "PASS", diffCheck: "PASS" },
  recovery: { source: "web_search_call.action.sources", zeroAnnotationOnly: true, neutralHostnameLabels: true, wholeAnswerAssociation: true, anyPresentAnnotationStillStrict: true, forgedPrivateAndMisalignedAnnotationsRejected: true, missingOrPrivateSourceMetadataRejected: true },
  live: { ...live, reviewUrl, reviewPid: Number(listener), onlyFreshReviewPort: true },
  protected: { canonicalControlPlaneChanged: false, protectedDiff: regressions.protectedDiff, corruptRowCanonicalBytesPreserved: corruptRow.corruptRow.exactCanonicalEquality, projectMutation: false, unrelatedApiRequests: 0 },
  humanAcceptance: "pending", controlPlaneUpdated: false, staged: false, committed: false, merged: false, pushed: false, published: false, deployed: false, laterPhaseStarted: false,
  intentionallyUnchanged: ["model and reasoning choices", "request/tool/source/cost/deadline limits", "job lifecycle and finalization timing", "Assistant UI and IndexedDB schema", "animation, export, project, tutorial, recovery, and AI Animator systems", "canonical docs and project tree"],
};
assert.deepEqual(git("diff", "--name-only", base, "--", ...regressions.protectedFamilies).split("\n").filter(Boolean), []);
writeFileSync(`${root}/proof-manifest.json`, `${JSON.stringify(manifest, null, 2)}\n`, { flag: "wx" });
console.log(JSON.stringify({ status: "SEALED", manifest: bind(`${root}/proof-manifest.json`), sourceDigest: manifest.sourceDigest, sources: sources.length, evidence: evidence.length }));
