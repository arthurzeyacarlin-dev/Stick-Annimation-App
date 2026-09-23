import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { lstatSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";

const base = "741ee803f9e0bd72f7c64174a77e52a6ac3a7b17";
const root = "output/spec-0012/phase-4-reply-reveal";
const reviewUrl = "http://127.0.0.1:58060/assistant";
const acceptedReviewWorktree = "/Users/arthurcarlin/.codex/worktrees/941f/stick-animation-app";
const acceptedArchive = "/Users/arthurcarlin/Projects/stick-animation-app/output/recovery/SPEC-0012-PHASE4-CITATION-V1-2026-09-23/accepted-review-copy.tar.gz";
const acceptedArchiveSha256 = "669d212c317f68f24cc0af1c262297508b94e9ad04e0b03ea6aaf5b96813f772";
const allowlist = [
  "scripts/spec0012-assistant/phase4BrowserProof.ts",
  "scripts/spec0012-assistant/phase4Fixtures.ts",
  "scripts/spec0012-assistant/phase4Oracle.ts",
  "scripts/spec0012-assistant/phase4Regressions.ts",
  "scripts/spec0012-assistant/phase4ReplyRevealBrowserProof.ts",
  "scripts/spec0012-assistant/phase4ReplyRevealOracle.ts",
  "scripts/spec0012-assistant/phase4ReplyRevealRegressions.ts",
  "scripts/spec0012-assistant/recordPhase4CitationRecoveryProof.ts",
  "scripts/spec0012-assistant/recordPhase4ReplyRevealProof.ts",
  "scripts/spec0012-assistant/validatePhase4CitationRecoveryProof.ts",
  "scripts/spec0012-assistant/validatePhase4ReplyRevealProof.ts",
  "src/components/assistant/AssistantConversation.tsx",
  "src/components/assistant/useAssistantSessions.ts",
  "src/lib/assistant/assistantProvider.ts",
].sort();
const acceptedV1 = {
  "scripts/spec0012-assistant/phase4BrowserProof.ts": "430122bbb19efe6138db3018bd80f50a9b8e951a1233b281e17e38f08d8f5c7b",
  "scripts/spec0012-assistant/phase4Fixtures.ts": "d8cd91e9864cdc238080b856433d91c219b0c2f9cc0443c0fdaee374264da861",
  "scripts/spec0012-assistant/phase4Oracle.ts": "22eb028e1553d51dc35ad2fa5b86ea3c8a3e790c848031feb118aa9b4e3497ab",
  "scripts/spec0012-assistant/phase4Regressions.ts": "5343ae340a6e273757c7b84dd0794ccd179cbf4ef00dd93e86df175ef3649745",
  "scripts/spec0012-assistant/recordPhase4CitationRecoveryProof.ts": "e8ce1f949157a032240bb26328a633c2055d62ec04dd35fd7ebbf44c67fcdecf",
  "scripts/spec0012-assistant/validatePhase4CitationRecoveryProof.ts": "fcfd72836a05d08b14f7d8184e85ee323a3842549e9f553ed698e361b1e0d536",
  "src/lib/assistant/assistantProvider.ts": "4e07076ad13404577aea9e53145558be3d88d388ad6ae9b515c88dcb8edc0e58",
} as const;
const evidencePaths = [
  ".playwright-cli/page-2026-09-23T13-01-43-201Z.yml",
  ".playwright-cli/page-2026-09-23T13-01-57-243Z.png",
  `${root}/browser/final-conversation.png`,
  `${root}/browser/pre-fix-failure.json`,
  `${root}/browser/result.json`,
  `${root}/oracle/result.json`,
  `${root}/receipts/diff-check.json`,
  `${root}/receipts/focused-lint.json`,
  `${root}/receipts/typescript.json`,
  `${root}/regressions/result.json`,
  `${root}/review-server.json`,
  "output/spec-0012/phase-4/browser/result.json",
  "output/spec-0012/phase-4/build/result.json",
  "output/spec-0012/phase-4/oracle/result.json",
  "output/spec-0012/phase-4/regressions/result.json",
].sort();
const git = (...args: string[]) => execFileSync("git", args, { encoding: "utf8" }).trim();
const sha = (bytes: string | Buffer) => createHash("sha256").update(bytes).digest("hex");
const bind = (path: string) => { const bytes = readFileSync(path); return { path, bytes: bytes.length, sha256: sha(bytes) }; };
const json = (path: string) => JSON.parse(readFileSync(path, "utf8"));
const dirty = execFileSync("git", ["status", "--porcelain", "--untracked-files=all"], { encoding: "utf8" }).split("\n").filter(Boolean).map(line => line.slice(3)).sort();
const fileSha = (path: string) => sha(readFileSync(path));

assert.equal(git("rev-parse", "HEAD"), base);
assert.equal(git("diff", "--cached", "--name-only"), "");
assert.deepEqual(dirty, allowlist);
for (const [path, expected] of Object.entries(acceptedV1)) {
  assert.equal(fileSha(path), expected, `${path} must remain byte-identical to accepted V1`);
  assert.equal(fileSha(`${acceptedReviewWorktree}/${path}`), expected, `${path} must match the preserved V1 worktree`);
}
assert.equal(execFileSync("shasum", ["-a", "256", acceptedArchive], { encoding: "utf8" }).split(/\s+/)[0], acceptedArchiveSha256);
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
const listener = execFileSync("lsof", ["-nP", "-iTCP:58060", "-sTCP:LISTEN", "-t"], { encoding: "utf8" }).trim();
assert.match(listener, /^\d+$/);
const listenerCwd = execFileSync("lsof", ["-a", "-p", listener, "-d", "cwd", "-Fn"], { encoding: "utf8" }).split("\n").find(line => line.startsWith("n"))?.slice(1);
assert.equal(listenerCwd, process.cwd());
const oldListener = spawnSync("lsof", ["-nP", "-iTCP:58040", "-sTCP:LISTEN", "-t"], { encoding: "utf8" });
assert.equal(oldListener.stdout.trim(), "");
const reviewPorts = [...new Set([...execFileSync("lsof", ["-nP", "-iTCP", "-sTCP:LISTEN"], { encoding: "utf8" }).matchAll(/:(58\d{3}) \(LISTEN\)/g)].map(match => Number(match[1])))];
assert.deepEqual(reviewPorts, [58060]);
const acceptedReviewDirty = execFileSync("git", ["-C", acceptedReviewWorktree, "status", "--porcelain", "--untracked-files=all"], { encoding: "utf8" }).split("\n").filter(Boolean).map(line => line.slice(3)).sort();
assert.deepEqual(acceptedReviewDirty, Object.keys(acceptedV1).sort());
const reviewServer = { status: "PASS", url: reviewUrl, port: 58060, pid: Number(listener), mode: "production", healthStatus: 200, cwd: listenerCwd, onlyActiveReviewPort: true, oldV1PortClosed: true, acceptedReviewWorktree, acceptedReviewDirty, acceptedArchive, acceptedArchiveSha256, credentialFileIgnored: git("check-ignore", ".env.local") === ".env.local", credentialFileTracked: git("ls-files", ".env.local") !== "", credentialFileSymlink: lstatSync(".env.local").isSymbolicLink(), credentialContentsReadOrPrinted: false, manualPlaywright: { pageTitle: "Assistant | Diamond Animator", consoleErrors: 0, consoleWarnings: 0, shellRendered: true } };
assert.equal(reviewServer.credentialFileIgnored, true); assert.equal(reviewServer.credentialFileTracked, false); assert.equal(reviewServer.credentialFileSymlink, true);
writeFileSync(`${root}/review-server.json`, `${JSON.stringify(reviewServer, null, 2)}\n`, { flag: "wx" });

const reveal = json(`${root}/browser/result.json`); const preFix = json(`${root}/browser/pre-fix-failure.json`); const revealOracle = json(`${root}/oracle/result.json`); const revealRegressions = json(`${root}/regressions/result.json`);
const phase4Browser = json("output/spec-0012/phase-4/browser/result.json"); const phase4Oracle = json("output/spec-0012/phase-4/oracle/result.json"); const phase4Regressions = json("output/spec-0012/phase-4/regressions/result.json"); const build = json("output/spec-0012/phase-4/build/result.json");
assert.equal(reveal.status, "PASS"); assert.equal(reveal.iterationsPerPath, 12); assert.equal(reveal.completions, 25); assert.equal(reveal.localCompletions, 13); assert.equal(reveal.searchedCompletions, 12); assert.equal(reveal.revealRate, 1); assert.equal(reveal.assertions.length, 208); assert.deepEqual(reveal.errors, []); assert.deepEqual(reveal.forbidden, []); assert.equal(reveal.duplicateAnswers, 0); assert.equal(reveal.historicalReloadAnimations, 0); assert.equal(reveal.reducedMotionAnimations, 0);
assert.equal(preFix.status, "FAIL"); assert.match(preFix.error, /passive-tab completion has multiple intermediate visible reveal states/);
assert.equal(revealOracle.status, "PASS"); assert.equal(revealOracle.assertions.length, 12); assert.equal(revealOracle.providerSha256, acceptedV1["src/lib/assistant/assistantProvider.ts"]); assert.equal(revealOracle.realProviderCalls, 0); assert.equal(revealOracle.paidCalls, 0);
assert.equal(revealRegressions.status, "PASS"); assert.equal(revealRegressions.receipts.length, 6); assert.deepEqual(revealRegressions.protectedDiff, []); assert.ok(revealRegressions.receipts.every((receipt: { exitCode: number }) => receipt.exitCode === 0));
assert.equal(phase4Browser.status, "PASS"); assert.equal(phase4Browser.assertions.length, 25); assert.equal(phase4Browser.realProviderCalls, 0); assert.equal(phase4Browser.paidCalls, 0); assert.deepEqual(phase4Browser.errors, []); assert.deepEqual(phase4Browser.forbidden, []);
assert.equal(phase4Oracle.status, "PASS"); assert.equal(phase4Oracle.assertions.length, 66); assert.equal(phase4Regressions.status, "PASS"); assert.equal(phase4Regressions.receipts.length, 4); assert.deepEqual(phase4Regressions.protectedDiff, []); assert.equal(build.focused.status, "PASS"); assert.equal(build.full.status, "INHERITED_BASELINE_FAILURE");

const sources = allowlist.map(bind); const evidence = evidencePaths.map(bind);
const manifest = {
  schema: "spec-0012-phase-4-reply-reveal-correction-proof/v1", status: "PASS", generatedAt: new Date().toISOString(), base, head: git("rev-parse", "HEAD"), role: "Spec Executor", worktree: process.cwd(), indexEmpty: true,
  scope: "Make every newly completed Assistant reply use the existing fast reveal and blue leading gradient, including storage-first cross-tab publication, without replaying persisted answers.",
  dirtyPathAllowlist: allowlist, actualDirtyPaths: dirty, sources, sourceDigest: sha(JSON.stringify(sources.map(({ path, sha256 }) => ({ path, sha256 })))), evidence,
  acceptedV1: { worktree: acceptedReviewWorktree, archive: acceptedArchive, archiveSha256: acceptedArchiveSha256, sourceSha256: acceptedV1, byteIdentical: true, worktreeStatusPreserved: true },
  rootCause: "finishTurn storage invalidation could publish a completed message before the initiating tab committed its reveal marker; AssistantText then mounted with animate=false and retained the full initial character count.",
  fix: { observedPendingToDoneTransition: true, exactSessionTurnRevealMarker: true, lateMarkerRemountsOnlyAssistantText: true, existingRevealImplementationReused: true, timingOrColorChanged: false },
  proof: { preFixRaceReproduced: true, replyRevealAssertions: 208, completions: 25, localCompletions: 13, searchedCompletions: 12, storageFirstCrossTabCompletions: 1, revealRate: 1, duplicateAnswers: 0, historicalReloadAnimations: 0, reducedMotionAnimations: 0, correctionOracleAssertions: 12, acceptedV1OracleAssertions: 66, acceptedV1BrowserAssertions: 25, acceptedV1RegressionSuites: 4, protectedBrowserSuites: 6, focusedBuild: build.focused.status, fullBuild: build.full.status, typecheck: "PASS", focusedLint: "PASS", diffCheck: "PASS", manualBrowserConsoleErrors: 0, manualBrowserConsoleWarnings: 0 },
  provider: { deterministicCalls: reveal.providerCalls, realProviderCalls: 0, paidCalls: 0, acceptedV1ProviderSha256: acceptedV1["src/lib/assistant/assistantProvider.ts"], model: "gpt-5.6-terra", providerSearchContentPromptsReasoningChanged: false },
  protected: { canonicalControlPlaneChanged: false, nonAssistantProductFamiliesChanged: false, protectedDiff: revealRegressions.protectedDiff, storageSchemaChanged: false, lifecycleChanged: false, citationChanged: false, projectMutation: false, unrelatedApiRequests: 0 },
  review: reviewServer,
  humanAcceptance: "pending", controlPlaneUpdated: false, staged: false, committed: false, merged: false, pushed: false, published: false, deployed: false, laterPhaseStarted: false,
  intentionallyUnchanged: ["accepted V1 provider, search, content, prompt, model, and reasoning bytes", "job lifecycle, persistence schema, citation behavior, and request limits", "existing AssistantText timing and blue-gradient CSS", "all non-Assistant product surfaces", "canonical docs, AGENTS.md, and project/project_structure.txt"],
};
writeFileSync(`${root}/proof-manifest.json`, `${JSON.stringify(manifest, null, 2)}\n`, { flag: "wx" });
console.log(JSON.stringify({ status: "SEALED", manifest: bind(`${root}/proof-manifest.json`), sourceDigest: manifest.sourceDigest, sources: sources.length, evidence: evidence.length, reviewUrl }));
