import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";

// Independent expectations: no imports from the recorder or application implementation.
const root = "output/spec-0012/phase-2-correction", oldRoot = "output/spec-0012/phase-2";
const base = "652431396e78370f3dfb7549294e66d154c3b7d4";
const originalHash = "63a87f3e832a200a52c18115fa9ed7533eaf1fb4b5cfc01438e2c1f8c1b3c8ec";
const expected = [
  "app/api/diamond-assistant/route.ts", "app/assistant/page.tsx",
  ...["AssistantComposer.tsx", "AssistantConversation.tsx", "AssistantSessionSidebar.tsx", "AssistantText.tsx", "DiamondAssistantScreen.tsx", "diamondAssistant.module.css", "useAssistantSessions.ts"].map(p => `src/components/assistant/${p}`),
  ...["assistantContracts", "assistantJobService", "assistantKnowledge", "assistantProvider", "assistantStorage"].map(p => `src/lib/assistant/${p}.ts`),
  ...["phase2AnimatorSmoke", "phase2BrowserProof", "phase2BuildProof", "phase2FaultProof", "phase2Fixtures", "phase2Oracle", "phase2ProtectedBrowser", "phase2Regressions", "phase2RestartProof", "recordPhase2Proof", "validatePhase2Proof", "phase2CorrectionBrowser", "phase2CorrectionOracle", "recordPhase2CorrectionProof", "validatePhase2CorrectionProof"].map(p => `scripts/spec0012-assistant/${p}.ts`),
].sort();
const runtime = ["src/components/assistant/AssistantConversation.tsx", "src/components/assistant/AssistantSessionSidebar.tsx", "src/components/assistant/AssistantText.tsx", "src/components/assistant/diamondAssistant.module.css", "src/components/assistant/useAssistantSessions.ts", "src/lib/assistant/assistantJobService.ts", "src/lib/assistant/assistantProvider.ts"].sort();
const changedTests = ["phase2AnimatorSmoke", "phase2BrowserProof", "phase2BuildProof", "phase2FaultProof", "phase2Oracle", "phase2ProtectedBrowser", "phase2Regressions", "phase2RestartProof"].map(p => `scripts/spec0012-assistant/${p}.ts`).sort();
const additions = ["phase2CorrectionBrowser", "phase2CorrectionOracle", "recordPhase2CorrectionProof", "validatePhase2CorrectionProof"].map(p => `scripts/spec0012-assistant/${p}.ts`);
const json = (path: string) => JSON.parse(readFileSync(path, "utf8"));
const sha = (bytes: string | Buffer) => createHash("sha256").update(bytes).digest("hex");
const git = (...args: string[]) => execFileSync("git", args, { encoding: "utf8" }).trim();
const manifest = json(`${root}/proof-manifest.json`);
type Binding = { path: string; bytes: number; sha256: string };
const binding = (item: Binding) => { assert.ok(!item.path.includes("..") && !item.path.startsWith("/") && !item.path.includes(".env")); const bytes = readFileSync(item.path); assert.equal(item.bytes, bytes.length); assert.equal(item.sha256, sha(bytes), item.path); };
const validate = (value: typeof manifest) => {
  assert.equal(value.schema, "spec0012-phase2-correction-proof/v1"); assert.equal(value.status, "PASS_WITH_RECORDED_LIMITATIONS");
  assert.equal(value.base, base); assert.equal(value.head, base); assert.equal(git("rev-parse", "HEAD"), base); assert.equal(value.branch, ""); assert.equal(git("branch", "--show-current"), "");
  assert.equal(value.worktree, "/Users/arthurcarlin/.codex/worktrees/a996/stick-animation-app"); assert.equal(value.worktree, process.cwd()); assert.equal(value.indexEmpty, true); assert.equal(git("diff", "--cached", "--name-only"), "");
  const dirty = [...new Set([...git("ls-files", "-m").split("\n"), ...git("ls-files", "--others", "--exclude-standard").split("\n")].filter(Boolean))].sort();
  assert.deepEqual(dirty, expected); assert.deepEqual(value.actualDirtyPaths, expected); assert.deepEqual(value.dirtyPathAllowlist, expected); assert.deepEqual(value.sources.map((item: Binding) => item.path), expected);
  const bindings = [...value.sources, ...value.evidence] as Binding[]; assert.equal(new Set(bindings.map(item => item.path)).size, bindings.length); bindings.forEach(binding); assert.equal(value.sourceDigest, sha(JSON.stringify(value.sources)));
  assert.equal(value.original.manifest.path, `${oldRoot}/proof-manifest.json`); assert.equal(value.original.manifest.sha256, originalHash); binding(value.original.manifest);
  const original = json(value.original.manifest.path); assert.equal(value.original.evidencePreserved, 67); assert.equal(value.original.sourceDigest, "bfdcb27b4e2fc9a14d4b6708918822e167c4a6f74b1826bdb0bdd006c1000bbd");
  [...original.evidence, original.spec].forEach(binding); assert.equal(value.original.sourceSnapshots.length, 25);
  assert.deepEqual(value.original.sourceSnapshots.map((item: Binding) => item.path), original.sources.map((item: Binding) => item.path));
  for (const old of original.sources as Binding[]) {
    const backup = value.original.sourceSnapshots.find((item: Binding) => item.path === old.path); assert.equal(backup.backupPath, `${root}/baseline-sources/${old.path}.snapshot`); assert.equal(backup.sha256, old.sha256); assert.equal(backup.bytes, old.bytes); binding({ ...old, path: backup.backupPath });
    if (![...runtime, ...changedTests].includes(old.path)) assert.equal(sha(readFileSync(old.path)), old.sha256, `preserved phase2 file ${old.path}`);
  }
  assert.deepEqual(value.correctionRuntime, runtime); assert.deepEqual(value.correctionExistingTests, changedTests); assert.deepEqual(value.newTechnicalFiles, additions); assert.deepEqual(value.correctionDirtyPaths, [...runtime, ...changedTests, ...additions].sort());
  assert.equal(value.authority.phase, 2); assert.equal(value.authority.sourceTask, "01a0b45e-dd0b-73c3-b42d-d5b49dced309"); assert.match(value.authority.scope, /Five explicit/); assert.match(value.authority.supersession, /no canonical documentation edited/); assert.match(value.authority.modeLimitation, /No claim that Plan mode was active/); assert.match(value.authority.readOnlyReview, /sole Spec Executor/);
  assert.deepEqual(value.limits, { sessions: 50, messages: 200, sessionBytes: 1048576, databaseBytes: 33554432, contextMessages: 32, contextChars: 48000, inputTokens: 24000, outputTokens: 4000, deadlineMs: 90000, activePerSession: 1, activeEnvironment: 2 });
  const evidence = new Set(value.evidence.map((item: Binding) => item.path));
  const inventory = (path: string): string[] => readdirSync(path, { withFileTypes: true }).flatMap(entry => {
    if (entry.name === "baseline-sources" || entry.name.startsWith("profile-")) return [];
    if (entry.isDirectory()) return inventory(`${path}/${entry.name}`);
    if (/^(proof-manifest\.json|validation-receipt\.json|independent-validation.*|Implementation-Review-Packet\.md|review-server\.log)$/.test(entry.name)) return [];
    return [`${path}/${entry.name}`];
  });
  assert.deepEqual([...evidence].sort(), [...inventory(root), ...["full", "focused"].map(kind => `output/spec-0012/phase-1-correction/environment/phase2-correction-build-${kind}-network.jsonl`)].sort(), "every correction artifact and consumed build network ledger is hash-bound");
  const paths = ["oracle.json", "correction-oracle.json", "browser/result.json", "presentation/result.json", "faults/result.json", "protected-browser/result.json", "restart/result.json", "animator-smoke/result.json", "regressions/result.json", "build/result.json", "production-smoke.json"];
  for (const path of paths) { assert.ok(evidence.has(`${root}/${path}`)); const proof = json(`${root}/${path}`); assert.equal(proof.status, "PASS"); assert.equal(proof.realProviderCalls, 0); }
  for (const path of ["baseline-bindings.json", "reproduction.json", "review-server.json", "review-config.json", "production-verification.json", "network-proof.jsonl", "receipts/original-preservation.json"]) assert.ok(evidence.has(`${root}/${path}`));
  const presentation = json(`${root}/presentation/result.json`), oracle = json(`${root}/correction-oracle.json`), browser = json(`${root}/browser/result.json`), animator = json(`${root}/animator-smoke/result.json`), protectedProof = json(`${root}/protected-browser/result.json`), regressions = json(`${root}/regressions/result.json`), build = json(`${root}/build/result.json`);
  assert.ok(presentation.assertions.length >= 54); assert.ok(oracle.assertions.length >= 23); assert.ok(browser.assertions.length >= 90); assert.ok(animator.assertions >= 11); assert.ok(json(`${root}/oracle.json`).assertions.length >= 122); assert.ok(json(`${root}/faults/result.json`).assertions.length >= 20); assert.ok(protectedProof.assertions.length >= 21); assert.ok(json(`${root}/restart/result.json`).assertions.length >= 10);
  assert.deepEqual(presentation.errors, []); assert.deepEqual(presentation.forbidden, []); assert.equal(presentation.posts, presentation.deterministicProviderCalls); assert.equal(presentation.paidCalls, 0); assert.equal(presentation.nativeScrollbarPaintingEnabled, true); assert.deepEqual(presentation.thinkingStyle, presentation.acceptedStyle); assert.deepEqual(presentation.rawAcceptedStyle, animator.statusStyle);
  const normalizeEndpoints = (style: unknown) => JSON.parse(JSON.stringify(style).replaceAll(") 0%,", "),").replaceAll(") 100%)", "))")); assert.deepEqual(presentation.thinkingStyle, normalizeEndpoints(presentation.rawThinkingStyle)); assert.deepEqual(presentation.acceptedStyle, normalizeEndpoints(presentation.rawAcceptedStyle));
  assert.deepEqual(presentation.scrolling, { owners: 1, color: "rgba(0, 0, 0, 0) rgba(0, 0, 0, 0)", width: "thin" }); assert.deepEqual(presentation.activeScrollbar, { opacity: "1", width: "5px", color: "rgba(34, 47, 65, 0.92)" });
  assert.deepEqual(presentation.documentScroll, { scrollY: 0, scrollHeight: 814, clientHeight: 814, rootWidth: 1440, viewportWidth: 1440 });
  assert.ok(presentation.narrationDelayMs >= 7900 && presentation.narrationDelayMs < 10000); assert.ok(presentation.visibleFinalizingMs >= 2500 && presentation.visibleFinalizingMs < 3800); assert.ok(oracle.finalizingHoldMs >= 3000 && oracle.finalizingHoldMs < 3400);
  for (const assertion of ["automatic storage recovery never replays the one-shot narration", "manual rename during final hold wins over the returned automatic title", "cancelling a narrated Thinking wait clears the sentence", "UI cancellation wins throughout final hold", "lost finalizing job becomes Interrupted after server restart", "reconnect does not replay narration"]) assert.ok(presentation.assertions.includes(assertion), assertion);
  for (const file of presentation.screenshots) assert.ok(evidence.has(`${root}/presentation/${file}`));
  assert.equal(browser.accessibility.length, 6); browser.accessibility.forEach((profile: { violations: unknown[] }) => assert.deepEqual(profile.violations, [])); assert.deepEqual(browser.errors, []); assert.deepEqual(browser.foreignMutations, []); assert.deepEqual(browser.requests.filter((r: { kind: string }) => r.kind !== "provider-double"), []);
  assert.equal(protectedProof.beforeDigest, protectedProof.afterDigest); assert.deepEqual(protectedProof.errors, []); assert.deepEqual(protectedProof.network, []); assert.deepEqual(animator.errors, []); assert.deepEqual(animator.externalRequests, []); assert.deepEqual(animator.assistantRequests, []);
  assert.equal(regressions.receipts.length, 13); assert.deepEqual(regressions.protectedDiff, []); assert.equal(git("diff", "--name-only", base, "--", ...regressions.protectedFamilies, "app/ScrollbarActivity.tsx"), "");
  assert.equal(build.focused.status, "PASS"); assert.equal(build.full.status, "INHERITED_BASELINE_FAILURE"); assert.equal(build.full.path, "app/dev/ai-costs/lifetime/page.tsx");
  for (const id of ["typescript", "focused-lint", "diff-check"]) { assert.ok(evidence.has(`${root}/receipts/${id}.json`)); assert.equal(json(`${root}/receipts/${id}.json`).exitCode, 0); }
  const lint = json(`${root}/receipts/lint-nonregression.json`); assert.equal(lint.errors, 5); assert.equal(lint.warnings, 81); assert.deepEqual(lint.newFindings, []); for (const item of lint.verifiedUnchangedFiles) assert.deepEqual(readFileSync(item.path), execFileSync("git", ["show", `${base}:${item.path}`]));
  assert.deepEqual(value.correction, { finalizingMs: 3000, narrationDelayMs: 8000, sweepCycleMs: 3750, statusFontPx: 12, statusWeight: 750, baselineColor: "rgba(255, 255, 255, 0.48)", mask: "57% 100%", conversationScrollOwners: 1, visibleActivityScrollbars: 1, routineCountVisible: false, narrationPersisted: false, providerWorkRemainsThinking: true, resultPrivateDuringHold: true, oneShotAcrossRecovery: true, correctionBrowserAssertions: presentation.assertions.length, correctionOracleAssertions: oracle.assertions.length, measuredServerHoldMs: oracle.finalizingHoldMs, measuredVisibleHoldMs: presentation.visibleFinalizingMs });
  assert.deepEqual(value.automation, { realProviderCalls: 0, paidCalls: 0, searchCalls: 0, transcriptionCalls: 0, costUsd: 0, scope: "Executor automated correction verification only; no claim about Arthur manual calls or account lifetime usage" });
  for (const path of ["network-proof.jsonl", ...["full", "focused"].map(kind => `../phase-1-correction/environment/phase2-correction-build-${kind}-network.jsonl`)]) {
    const rows = readFileSync(`${root}/${path}`, "utf8").split("\n").filter(Boolean).map(line => JSON.parse(line));
    assert.deepEqual(rows.filter(row => row.result === "denied"), []);
  }
  const production = json(`${root}/production-verification.json`); assert.equal(production.mode, "production"); assert.equal(production.finalRuntimeSourceDigest, sha(JSON.stringify(runtime.map(path => ({ path, sha256: sha(readFileSync(path)) }))))); assert.ok(production.buildId); assert.deepEqual(production.suites, ["phase2AnimatorSmoke", "phase2BrowserProof", "phase2CorrectionBrowser", "phase2ProtectedBrowser", "phase2RestartProof", "phase2FaultProof"]);
  const review = json(`${root}/review-server.json`), config = json(`${root}/review-config.json`); assert.equal(review.cwd, process.cwd()); assert.equal(review.mode, "production"); assert.equal(review.port, 57970); assert.ok(Number.isInteger(review.pid) && review.pid > 0); assert.equal(review.providerCallsByExecutor, 0);
  assert.deepEqual(config, { status: "PASS", credentialFilePreserved: true, ignored: true, tracked: false, credentialPrintedOrHashed: false, automatedProviderCallsAfterEnablement: 0 }); assert.equal(git("ls-files", ".env.local"), ""); assert.equal(git("check-ignore", ".env.local"), ".env.local");
  assert.deepEqual(value.review, { url: "http://127.0.0.1:57970/assistant", homeUrl: "http://127.0.0.1:57970/", port: 57970, production: true, credentialFilePreserved: true, automatedCallsAfterCredentialEnablement: 0 });
  assert.equal(value.humanAcceptance, "pending Arthur and Project Manager"); for (const key of ["controlPlaneUpdated", "gitPublication", "staged", "committed", "pushed", "deployed", "laterPhaseStarted"]) assert.equal(value[key], false); assert.match(value.ownership, /Sole Spec Executor stops/); assert.match(value.cleanupPlan, /D-0054/);
  assert.deepEqual(value.limitations, ["Live Terra access, latency and answer quality unproven: executor made zero live calls", "Full build inherited unchanged app/dev/ai-costs/lifetime/page.tsx PageProps/searchParams failure; focused production build passes", "Full lint inherited 5 errors and 81 warnings in unchanged base files; focused lint passes", "Historical Animator transient reveal observation remains unproven; explicitly authorized focused Animator smoke and protected byte equality pass", "Chromium with emulated layouts/accessibility only; no physical device or non-Chromium claim", "Canonical control plane intentionally unchanged pending acceptance and sequential CPA propagation"]);
};
validate(manifest);
const mutations: Array<[string, (v: typeof manifest) => void]> = [
  ["base", v => { v.base = "0".repeat(40); }], ["allowlist", v => { v.dirtyPathAllowlist.pop(); }], ["runtime boundary", v => { v.correctionRuntime.push("app/globals.css"); }], ["source hash", v => { v.sources[0].sha256 = "0".repeat(64); }], ["evidence hash", v => { v.evidence[0].sha256 = "0".repeat(64); }], ["missing proof", v => { v.evidence = v.evidence.filter((item: Binding) => item.path !== `${root}/presentation/result.json`); }], ["original seal", v => { v.original.manifest.sha256 = "0".repeat(64); }], ["original snapshot", v => { v.original.sourceSnapshots.pop(); }],
  ["hold", v => { v.correction.finalizingMs = 0; }], ["sweep", v => { v.correction.sweepCycleMs = 3500; }], ["scrollbars", v => { v.correction.visibleActivityScrollbars = 2; }], ["counter", v => { v.correction.routineCountVisible = true; }], ["narration persistence", v => { v.correction.narrationPersisted = true; }], ["provider phase", v => { v.correction.providerWorkRemainsThinking = false; }], ["private hold", v => { v.correction.resultPrivateDuringHold = false; }], ["recovery replay", v => { v.correction.oneShotAcrossRecovery = false; }], ["capacity", v => { v.limits.sessions = 51; }], ["paid calls", v => { v.automation.paidCalls = 1; }], ["cost", v => { v.automation.costUsd = 1; }], ["acceptance", v => { v.humanAcceptance = "accepted"; }], ["control plane", v => { v.controlPlaneUpdated = true; }], ["publication", v => { v.gitPublication = true; }], ["next phase", v => { v.laterPhaseStarted = true; }],
];
for (const path of ["receipts/lint-nonregression.json", "browser/desktop-blank.png", "../phase-1-correction/environment/phase2-correction-build-full-network.jsonl"]) {
  const canonical = path.startsWith("../") ? `output/spec-0012/${path.slice(3)}` : `${root}/${path}`;
  mutations.push([`missing binding ${path}`, v => { v.evidence = v.evidence.filter((item: Binding) => item.path !== canonical); }]);
}
mutations.push(["contradictory limitation", v => { v.limitations[0] = "Live Terra fully verified"; }]);
for (const [name, mutate] of mutations) { const candidate = structuredClone(manifest); mutate(candidate); assert.throws(() => validate(candidate), `must reject ${name}`); }
const result = { status: "PASS", manifestSha256: sha(readFileSync(`${root}/proof-manifest.json`)), sourceDigest: manifest.sourceDigest, sourceFiles: expected.length, evidenceFiles: manifest.evidence.length, originalManifestSha256: originalHash, originalSourceSnapshots: 25, originalEvidenceBindings: 67, mutationRejections: mutations.map(([name]) => name), executorPaidCalls: 0 };
if (!process.argv.includes("--read-only")) writeFileSync(`${root}/validation-receipt.json`, JSON.stringify(result, null, 2), { flag: "wx" });
console.log(JSON.stringify(result));
