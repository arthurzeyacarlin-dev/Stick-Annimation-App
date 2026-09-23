import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

const base = "741ee803f9e0bd72f7c64174a77e52a6ac3a7b17";
const root = "output/spec-0012/phase-4-reply-reveal";
const manifestPath = `${root}/proof-manifest.json`;
const allowlist = [
  "scripts/spec0012-assistant/phase4BrowserProof.ts", "scripts/spec0012-assistant/phase4Fixtures.ts", "scripts/spec0012-assistant/phase4Oracle.ts", "scripts/spec0012-assistant/phase4Regressions.ts",
  "scripts/spec0012-assistant/phase4ReplyRevealBrowserProof.ts", "scripts/spec0012-assistant/phase4ReplyRevealOracle.ts", "scripts/spec0012-assistant/phase4ReplyRevealRegressions.ts",
  "scripts/spec0012-assistant/recordPhase4CitationRecoveryProof.ts", "scripts/spec0012-assistant/recordPhase4ReplyRevealProof.ts", "scripts/spec0012-assistant/validatePhase4CitationRecoveryProof.ts", "scripts/spec0012-assistant/validatePhase4ReplyRevealProof.ts",
  "src/components/assistant/AssistantConversation.tsx", "src/components/assistant/useAssistantSessions.ts", "src/lib/assistant/assistantProvider.ts",
].sort();
const evidencePaths = [
  ".playwright-cli/page-2026-09-23T13-01-43-201Z.yml", ".playwright-cli/page-2026-09-23T13-01-57-243Z.png",
  `${root}/browser/final-conversation.png`, `${root}/browser/pre-fix-failure.json`, `${root}/browser/result.json`, `${root}/oracle/result.json`,
  `${root}/receipts/diff-check.json`, `${root}/receipts/focused-lint.json`, `${root}/receipts/typescript.json`, `${root}/regressions/result.json`, `${root}/review-server.json`,
  "output/spec-0012/phase-4/browser/result.json", "output/spec-0012/phase-4/build/result.json", "output/spec-0012/phase-4/oracle/result.json", "output/spec-0012/phase-4/regressions/result.json",
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
const git = (...args: string[]) => execFileSync("git", args, { encoding: "utf8" }).trim();
const sha = (bytes: string | Buffer) => createHash("sha256").update(bytes).digest("hex");
const json = (path: string) => JSON.parse(readFileSync(path, "utf8"));
type Binding = { path: string; bytes: number; sha256: string };
const verify = (binding: Binding) => { assert.ok(!binding.path.startsWith("/") && !binding.path.includes("..") && !binding.path.includes(".env")); const bytes = readFileSync(binding.path); assert.equal(bytes.length, binding.bytes); assert.equal(sha(bytes), binding.sha256, binding.path); };
const manifest = json(manifestPath);

function validate(value: typeof manifest) {
  assert.equal(value.schema, "spec-0012-phase-4-reply-reveal-correction-proof/v1"); assert.equal(value.status, "PASS"); assert.equal(value.base, base); assert.equal(value.head, base); assert.equal(value.role, "Spec Executor"); assert.equal(value.worktree, process.cwd()); assert.equal(value.indexEmpty, true);
  assert.equal(git("rev-parse", "HEAD"), base); assert.equal(git("diff", "--cached", "--name-only"), "");
  const dirty = execFileSync("git", ["status", "--porcelain", "--untracked-files=all"], { encoding: "utf8" }).split("\n").filter(Boolean).map(line => line.slice(3)).sort();
  assert.deepEqual(dirty, allowlist); assert.deepEqual(value.dirtyPathAllowlist, allowlist); assert.deepEqual(value.actualDirtyPaths, allowlist);
  assert.deepEqual(value.sources.map((binding: Binding) => binding.path), allowlist);
  value.sources.forEach(verify);
  const sourceDigest = sha(JSON.stringify(value.sources.map(({ path, sha256 }: Binding) => ({ path, sha256 }))));
  assert.equal(value.sourceDigest, sourceDigest);
  assert.deepEqual(value.evidence.map((binding: Binding) => binding.path), evidencePaths); value.evidence.forEach(verify);
  assert.deepEqual(value.acceptedV1.sourceSha256, acceptedV1); assert.equal(value.acceptedV1.archiveSha256, "669d212c317f68f24cc0af1c262297508b94e9ad04e0b03ea6aaf5b96813f772"); assert.equal(value.acceptedV1.byteIdentical, true); assert.equal(value.acceptedV1.worktreeStatusPreserved, true);
  for (const [path, expected] of Object.entries(acceptedV1)) assert.equal(sha(readFileSync(path)), expected);
  assert.deepEqual(value.fix, { observedPendingToDoneTransition: true, exactSessionTurnRevealMarker: true, lateMarkerRemountsOnlyAssistantText: true, existingRevealImplementationReused: true, timingOrColorChanged: false });
  assert.deepEqual(value.proof, { preFixRaceReproduced: true, replyRevealAssertions: 208, completions: 25, localCompletions: 13, searchedCompletions: 12, storageFirstCrossTabCompletions: 1, revealRate: 1, duplicateAnswers: 0, historicalReloadAnimations: 0, reducedMotionAnimations: 0, correctionOracleAssertions: 12, acceptedV1OracleAssertions: 66, acceptedV1BrowserAssertions: 25, acceptedV1RegressionSuites: 4, protectedBrowserSuites: 6, focusedBuild: "PASS", fullBuild: "INHERITED_BASELINE_FAILURE", typecheck: "PASS", focusedLint: "PASS", diffCheck: "PASS", manualBrowserConsoleErrors: 0, manualBrowserConsoleWarnings: 0 });
  assert.equal(value.provider.deterministicCalls, 26); assert.equal(value.provider.realProviderCalls, 0); assert.equal(value.provider.paidCalls, 0); assert.equal(value.provider.acceptedV1ProviderSha256, acceptedV1["src/lib/assistant/assistantProvider.ts"]); assert.equal(value.provider.model, "gpt-5.6-terra"); assert.equal(value.provider.providerSearchContentPromptsReasoningChanged, false);
  assert.deepEqual(value.protected, { canonicalControlPlaneChanged: false, nonAssistantProductFamiliesChanged: false, protectedDiff: [], storageSchemaChanged: false, lifecycleChanged: false, citationChanged: false, projectMutation: false, unrelatedApiRequests: 0 });
  assert.equal(value.review.url, "http://127.0.0.1:58060/assistant"); assert.equal(value.review.mode, "production"); assert.equal(value.review.onlyActiveReviewPort, true); assert.equal(value.review.oldV1PortClosed, true); assert.equal(value.review.credentialFileIgnored, true); assert.equal(value.review.credentialFileTracked, false); assert.equal(value.review.credentialFileSymlink, true); assert.equal(value.review.credentialContentsReadOrPrinted, false); assert.equal(value.review.manualPlaywright.consoleErrors, 0); assert.equal(value.review.manualPlaywright.consoleWarnings, 0);
  const health = spawnSync("curl", ["-sS", "-o", "/dev/null", "-w", "%{http_code}", value.review.url], { encoding: "utf8" }); assert.equal(health.status, 0); assert.equal(health.stdout, "200");
  const pid = Number(execFileSync("lsof", ["-nP", "-iTCP:58060", "-sTCP:LISTEN", "-t"], { encoding: "utf8" }).trim()); assert.equal(value.review.pid, pid);
  const cwd = execFileSync("lsof", ["-a", "-p", String(pid), "-d", "cwd", "-Fn"], { encoding: "utf8" }).split("\n").find(line => line.startsWith("n"))?.slice(1); assert.equal(value.review.cwd, cwd); assert.equal(cwd, process.cwd());
  assert.equal(spawnSync("lsof", ["-nP", "-iTCP:58040", "-sTCP:LISTEN", "-t"], { encoding: "utf8" }).stdout.trim(), "");
  const reveal = json(`${root}/browser/result.json`); assert.equal(reveal.status, "PASS"); assert.equal(reveal.revealRate, 1); assert.equal(reveal.duplicateAnswers, 0); assert.equal(reveal.historicalReloadAnimations, 0); assert.equal(reveal.reducedMotionAnimations, 0); assert.deepEqual(reveal.errors, []); assert.deepEqual(reveal.forbidden, []);
  const preFix = json(`${root}/browser/pre-fix-failure.json`); assert.equal(preFix.status, "FAIL"); assert.match(preFix.error, /passive-tab completion has multiple intermediate visible reveal states/);
  assert.equal(value.humanAcceptance, "pending"); for (const key of ["controlPlaneUpdated", "staged", "committed", "merged", "pushed", "published", "deployed", "laterPhaseStarted"]) assert.equal(value[key], false);
}

validate(manifest);
const mutations: Array<[string, (value: typeof manifest) => void]> = [
  ["base", value => { value.base = "0".repeat(40); }], ["allowlist", value => { value.dirtyPathAllowlist.pop(); }], ["source", value => { value.sources[0].sha256 = "0".repeat(64); }], ["evidence", value => { value.evidence[0].sha256 = "0".repeat(64); }],
  ["accepted V1", value => { value.acceptedV1.byteIdentical = false; }], ["reveal rate", value => { value.proof.revealRate = .96; }], ["duplicate answer", value => { value.proof.duplicateAnswers = 1; }], ["historical replay", value => { value.proof.historicalReloadAnimations = 1; }],
  ["provider", value => { value.provider.realProviderCalls = 1; }], ["lifecycle", value => { value.protected.lifecycleChanged = true; }], ["citations", value => { value.protected.citationChanged = true; }], ["protected diff", value => { value.protected.protectedDiff.push("docs/README.md"); }], ["publication", value => { value.published = true; }],
];
for (const [name, mutate] of mutations) { const candidate = structuredClone(manifest); mutate(candidate); assert.throws(() => validate(candidate), `must reject ${name}`); }
const receipt = { status: "PASS", manifestSha256: sha(readFileSync(manifestPath)), sourceDigest: manifest.sourceDigest, sourceFiles: manifest.sources.length, evidenceFiles: manifest.evidence.length, mutationRejections: mutations.map(([name]) => name), completions: 25, revealRate: 1, duplicateAnswers: 0, historicalReloadAnimations: 0, realProviderCalls: 0, indexEmpty: true, reviewUrl: manifest.review.url };
writeFileSync(`${root}/validation-receipt.json`, `${JSON.stringify(receipt, null, 2)}\n`, { flag: "wx" });
console.log(JSON.stringify(receipt));
