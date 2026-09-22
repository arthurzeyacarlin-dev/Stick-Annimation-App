import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

// Independent fixed expectations; deliberately does not import the recorder.
const expected = [
  "app/api/diamond-assistant/route.ts", "app/assistant/page.tsx",
  "src/components/assistant/AssistantComposer.tsx", "src/components/assistant/AssistantConversation.tsx", "src/components/assistant/AssistantSessionSidebar.tsx", "src/components/assistant/AssistantText.tsx", "src/components/assistant/DiamondAssistantScreen.tsx", "src/components/assistant/diamondAssistant.module.css", "src/components/assistant/useAssistantSessions.ts",
  "src/lib/assistant/assistantContracts.ts", "src/lib/assistant/assistantJobService.ts", "src/lib/assistant/assistantKnowledge.ts", "src/lib/assistant/assistantProvider.ts", "src/lib/assistant/assistantStorage.ts",
  "scripts/spec0012-assistant/phase2AnimatorSmoke.ts", "scripts/spec0012-assistant/phase2BrowserProof.ts", "scripts/spec0012-assistant/phase2BuildProof.ts", "scripts/spec0012-assistant/phase2FaultProof.ts", "scripts/spec0012-assistant/phase2Fixtures.ts", "scripts/spec0012-assistant/phase2Oracle.ts", "scripts/spec0012-assistant/phase2ProtectedBrowser.ts", "scripts/spec0012-assistant/phase2Regressions.ts", "scripts/spec0012-assistant/phase2RestartProof.ts", "scripts/spec0012-assistant/recordPhase2Proof.ts", "scripts/spec0012-assistant/validatePhase2Proof.ts",
].sort();
const output = "output/spec-0012/phase-2"; const manifestPath = `${output}/proof-manifest.json`;
const json = (path: string) => JSON.parse(readFileSync(path, "utf8"));
const sha = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
const git = (...args: string[]) => execFileSync("git", args, { encoding: "utf8" }).trim();
const manifest = json(manifestPath);
type Binding = { path: string; bytes: number; sha256: string };
const validate = (value: typeof manifest) => {
  assert.equal(value.schema, "spec0012-phase2-proof/v1"); assert.equal(value.status, "PASS_WITH_RECORDED_LIMITATIONS");
  assert.equal(value.base, "652431396e78370f3dfb7549294e66d154c3b7d4"); assert.equal(value.head, value.base); assert.equal(git("rev-parse", "HEAD"), value.base);
  assert.equal(value.branch, ""); assert.equal(git("branch", "--show-current"), "");
  assert.equal(value.worktree, "/Users/arthurcarlin/.codex/worktrees/a996/stick-animation-app"); assert.equal(value.worktree, process.cwd());
  assert.equal(value.indexEmpty, true); assert.equal(git("diff", "--cached", "--name-only"), "");
  assert.deepEqual(value.dirtyPathAllowlist, expected); assert.deepEqual(value.actualDirtyPaths, expected);
  assert.deepEqual([...new Set([...git("ls-files", "-m").split("\n"), ...git("ls-files", "--others", "--exclude-standard").split("\n")].filter(Boolean))].sort(), expected);
  assert.deepEqual(value.sources.map((binding: Binding) => binding.path), expected);
  assert.equal(value.spec.path, "docs/specs/0012-diamond-animator-guidance-assistant.md"); assert.deepEqual(readFileSync(value.spec.path), execFileSync("git", ["show", `${value.base}:${value.spec.path}`]));
  const bindings: Binding[] = [...value.sources, ...value.evidence, value.spec]; assert.equal(new Set(bindings.map(item => item.path)).size, bindings.length);
  for (const item of bindings) { assert.ok(!item.path.includes("..") && !item.path.startsWith("/")); const bytes = readFileSync(item.path); assert.equal(item.bytes, bytes.length); assert.equal(item.sha256, sha(bytes), item.path); }
  assert.equal(value.sourceDigest, sha(JSON.stringify(value.sources)));
  assert.equal(value.authority.phase, 2); assert.equal(value.authority.sourceTask, "01a0b45e-dd0b-73c3-b42d-d5b49dced309"); assert.match(value.authority.scope, /moved forward from Phase 3/); assert.match(value.authority.modeLimitation, /no claim that Plan mode was active/);
  assert.deepEqual(value.limits, { sessions: 50, messages: 200, sessionBytes: 1048576, databaseBytes: 33554432, contextMessages: 32, contextChars: 48000, inputTokens: 24000, outputTokens: 4000, deadlineMs: 90000, activePerSession: 1, activeEnvironment: 2 });
  const evidence = new Set(value.evidence.map((item: Binding) => item.path));
  for (const path of ["oracle.json", "browser/result.json", "faults/result.json", "protected-browser/result.json", "restart/result.json", "animator-smoke/result.json", "regressions/result.json", "build/result.json", "review-server.json", "review-config.json", "production-smoke.json", "production-smoke.png", "network-proof.jsonl", "animator/run.log", "lint-final.json"]) assert.ok(evidence.has(`${output}/${path}`), `required evidence ${path}`);
  const browser = json(`${output}/browser/result.json`), oracle = json(`${output}/oracle.json`), faults = json(`${output}/faults/result.json`), protectedProof = json(`${output}/protected-browser/result.json`), restart = json(`${output}/restart/result.json`), animator = json(`${output}/animator-smoke/result.json`), regressions = json(`${output}/regressions/result.json`), build = json(`${output}/build/result.json`);
  for (const proof of [browser, oracle, faults, protectedProof, restart, animator, regressions, build]) { assert.equal(proof.status, "PASS"); assert.equal(proof.realProviderCalls, 0); }
  assert.ok(browser.assertions.length >= 89); assert.ok(oracle.assertions.length >= 122); assert.ok(faults.assertions.length >= 20); assert.ok(protectedProof.assertions.length >= 21); assert.ok(restart.assertions.length >= 10); assert.ok(animator.assertions >= 11);
  assert.equal(restart.actualBrowserRelaunch, true); assert.equal(restart.posts, 3); assert.equal(restart.deterministicProviderCalls, 3);
  assert.deepEqual(browser.errors, []); assert.deepEqual(browser.foreignMutations, []); assert.deepEqual(browser.requests.filter((r: { kind: string }) => r.kind !== "provider-double"), []);
  assert.equal(browser.accessibility.length, 6); for (const profile of browser.accessibility) assert.deepEqual(profile.violations, []);
  for (const file of browser.screenshots) assert.ok(evidence.has(`${output}/browser/${file}`));
  assert.equal(protectedProof.beforeDigest, protectedProof.afterDigest); assert.deepEqual(protectedProof.errors, []); assert.deepEqual(protectedProof.network, []);
  assert.deepEqual(animator.errors, []); assert.deepEqual(animator.externalRequests, []); assert.deepEqual(animator.assistantRequests, []);
  assert.equal(regressions.receipts.length, 13); assert.deepEqual(regressions.protectedDiff, []); assert.match(regressions.historicalBrowserLimitation, /not claimed/);
  assert.equal(git("diff", "--name-only", value.base, "--", ...regressions.protectedFamilies), "");
  assert.equal(build.focused.status, "PASS"); assert.equal(build.full.status, "INHERITED_BASELINE_FAILURE"); assert.equal(build.full.path, "app/dev/ai-costs/lifetime/page.tsx");
  assert.deepEqual(build.focused.routes, ["app/page.tsx", "app/assistant/page.tsx", "app/api/ai-animator/route.ts", "app/api/diamond-assistant/route.ts", "app/favicon.ico"]);
  for (const id of ["typescript", "focused-lint", "diff-check"]) { const path = `${output}/receipts/${id}.json`; assert.ok(evidence.has(path)); assert.equal(json(path).exitCode, 0); }
  const lint = json(`${output}/receipts/lint-nonregression.json`); assert.equal(lint.errors, 5); assert.equal(lint.warnings, 81); assert.deepEqual(lint.newFindings, []);
  for (const item of lint.verifiedUnchangedFiles) assert.deepEqual(readFileSync(item.path), execFileSync("git", ["show", `${value.base}:${item.path}`]));
  assert.deepEqual(value.summary, { model: "gpt-5.6-terra", reasoning: ["low", "medium", "high", "xhigh"], defaultReasoning: "medium", realProviderCalls: 0, paidCalls: 0, searchCalls: 0, transcriptionCalls: 0, automatedCostUsd: 0, browserAssertions: browser.assertions.length, oracleAssertions: oracle.assertions.length, accessibility: browser.accessibility, foreignMutations: browser.foreignMutations, storageDigests: { before: protectedProof.beforeDigest, after: protectedProof.afterDigest }, performanceScope: "Functional responsive-layout and bounded activity/reveal checks; no quantitative performance benchmark claimed", focusedBuild: "PASS", fullBuild: "INHERITED_BASELINE_FAILURE", fullLint: lint, historicalAnimatorFullSuite: "TRANSIENT_REVEAL_OBSERVATION_FAILED", focusedAnimatorSmoke: "PASS", protectedTechnicalOracles: 13, deniedFrameworkVersionChecks: 1 });
  const denied = readFileSync(`${output}/network-proof.jsonl`, "utf8").split("\n").filter(Boolean).map(line => JSON.parse(line)).filter(entry => entry.result === "denied");
  assert.equal(denied.length, 1); assert.equal(denied[0].target, "https://registry.npmjs.org"); assert.equal(denied[0].primitive, "fetch");
  for (const path of ["full", "focused"].map(kind => `output/spec-0012/phase-1-correction/environment/phase2-build-${kind}-network.jsonl`)) { assert.ok(evidence.has(path)); assert.ok(readFileSync(path, "utf8").split("\n").filter(Boolean).every(line => JSON.parse(line).result !== "denied")); }
  const review = json(`${output}/review-server.json`), config = json(`${output}/review-config.json`), production = json(`${output}/production-smoke.json`);
  assert.equal(review.cwd, process.cwd()); assert.equal(review.port, 57970); assert.equal(review.mode, "production"); assert.ok(Number.isInteger(review.pid) && review.pid > 0);
  assert.deepEqual(config, { status: "PASS", serverOnlyCredentialPresent: true, copiedFromExistingCanonicalIgnoredFile: true, ignored: true, tracked: false, credentialPrintedOrHashed: false, automatedProviderCallsAfterEnablement: 0 });
  assert.equal(git("ls-files", ".env.local"), ""); assert.equal(git("check-ignore", ".env.local"), ".env.local");
  assert.equal(production.status, "PASS"); assert.equal(production.realProviderCalls, 0); assert.deepEqual(production.errors, []);
  assert.equal(value.review.url, "http://127.0.0.1:57970/assistant"); assert.equal(value.review.port, 57970);
  assert.equal(value.humanAcceptance, "pending Arthur and Project Manager"); for (const key of ["controlPlaneUpdated", "gitPublication", "staged", "committed", "pushed", "deployed", "laterPhaseStarted"]) assert.equal(value[key], false);
  assert.match(value.ownership, /Spec Executor stops/); assert.match(value.cleanupPlan, /D-0054/); assert.equal(value.limitations.length, 6);
};
validate(manifest);
const mutations: Array<[string, (value: typeof manifest) => void]> = [
  ["base", v => { v.base = "0".repeat(40); }], ["path set", v => { v.dirtyPathAllowlist.pop(); }], ["source hash", v => { v.sources[0].sha256 = "0".repeat(64); }], ["artifact hash", v => { v.evidence[0].sha256 = "0".repeat(64); }], ["required artifact", v => { v.evidence = v.evidence.filter((x: Binding) => !x.path.endsWith("browser/result.json")); }],
  ["capacity", v => { v.limits.sessions = 51; }], ["request count", v => { v.summary.realProviderCalls = 1; }], ["cost", v => { v.summary.automatedCostUsd = .1; }], ["storage digest", v => { v.summary.storageDigests.after = "0".repeat(64); }], ["accessibility", v => { v.summary.accessibility[0].violations.push("fake"); }], ["performance claim", v => { v.summary.performanceScope = "All performance verified"; }], ["historical regression", v => { v.summary.historicalAnimatorFullSuite = "PASS"; }], ["model", v => { v.summary.model = "other"; }], ["acceptance", v => { v.humanAcceptance = "accepted"; }], ["control plane", v => { v.controlPlaneUpdated = true; }], ["publication", v => { v.gitPublication = true; }], ["next phase", v => { v.laterPhaseStarted = true; }],
];
for (const [name, change] of mutations) { const candidate = structuredClone(manifest); change(candidate); assert.throws(() => validate(candidate), `must reject ${name}`); }
const result = { status: "PASS", manifestSha256: sha(readFileSync(manifestPath)), sourceDigest: manifest.sourceDigest, sourceFiles: expected.length, evidenceFiles: manifest.evidence.length, mutationRejections: mutations.map(([name]) => name), paidCalls: 0 };
if (!process.argv.includes("--read-only")) writeFileSync(`${output}/validation-receipt.json`, JSON.stringify(result, null, 2), { flag: "wx" });
console.log(JSON.stringify(result));
