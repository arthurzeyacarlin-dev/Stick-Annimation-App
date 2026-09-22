import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";

const root = "output/spec-0012/phase-2-correction";
const oldRoot = "output/spec-0012/phase-2";
const oldHash = "63a87f3e832a200a52c18115fa9ed7533eaf1fb4b5cfc01438e2c1f8c1b3c8ec";
const base = "652431396e78370f3dfb7549294e66d154c3b7d4";
const git = (...args: string[]) => execFileSync("git", args, { encoding: "utf8" }).trim();
const sha = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
const json = (path: string) => JSON.parse(readFileSync(path, "utf8"));
const bind = (path: string) => { const bytes = readFileSync(path); return { path, bytes: bytes.length, sha256: sha(bytes) }; };
type Binding = ReturnType<typeof bind>;
const original = json(`${oldRoot}/proof-manifest.json`);
const baseline = json(`${root}/baseline-bindings.json`);
assert.equal(bind(`${oldRoot}/proof-manifest.json`).sha256, oldHash);
for (const item of [...original.evidence, original.spec] as Binding[]) assert.deepEqual(bind(item.path), item);
for (const item of original.sources as Binding[]) {
  const backup = baseline.sources.find((s: Binding) => s.path === item.path);
  assert.ok(backup); const bytes = readFileSync(backup.backupPath); assert.equal(bytes.length, item.bytes); assert.equal(sha(bytes), item.sha256);
}
const additions = ["phase2CorrectionBrowser", "phase2CorrectionOracle", "recordPhase2CorrectionProof", "validatePhase2CorrectionProof"].map(name => `scripts/spec0012-assistant/${name}.ts`);
const paths = [...original.dirtyPathAllowlist, ...additions].sort();
const dirty = [...new Set([...git("ls-files", "-m").split("\n"), ...git("ls-files", "--others", "--exclude-standard").split("\n")].filter(Boolean))].sort();
assert.equal(git("rev-parse", "HEAD"), base); assert.equal(git("branch", "--show-current"), ""); assert.equal(git("diff", "--cached", "--name-only"), ""); assert.deepEqual(dirty, paths);
const correctionRuntime = ["src/components/assistant/AssistantConversation.tsx", "src/components/assistant/AssistantSessionSidebar.tsx", "src/components/assistant/AssistantText.tsx", "src/components/assistant/diamondAssistant.module.css", "src/components/assistant/useAssistantSessions.ts", "src/lib/assistant/assistantJobService.ts", "src/lib/assistant/assistantProvider.ts"].sort();
const correctionExistingTests = ["phase2AnimatorSmoke", "phase2BrowserProof", "phase2BuildProof", "phase2FaultProof", "phase2Oracle", "phase2ProtectedBrowser", "phase2Regressions", "phase2RestartProof"].map(name => `scripts/spec0012-assistant/${name}.ts`).sort();
const changedExisting = original.sources.filter((item: Binding) => bind(item.path).sha256 !== item.sha256).map((item: Binding) => item.path).sort();
assert.deepEqual(changedExisting, [...correctionRuntime, ...correctionExistingTests].sort());
mkdirSync(`${root}/receipts`, { recursive: true });
if (!process.argv.includes("--seal")) {
  for (const [id, command, args] of [
    ["typescript", process.execPath, ["node_modules/typescript/bin/tsc", "--noEmit", "--incremental", "false"]],
    ["focused-lint", process.execPath, ["node_modules/eslint/bin/eslint.js", ...paths.filter(p => /\.tsx?$/.test(p))]],
    ["diff-check", "git", ["diff", "--check"]],
  ] as Array<[string, string, string[]]>) {
    const result = spawnSync(command, args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
    writeFileSync(`${root}/receipts/${id}.json`, JSON.stringify({ id, command: [command, ...args], exitCode: result.status, stdout: result.stdout, stderr: result.stderr }, null, 2)); assert.equal(result.status, 0, result.stdout + result.stderr);
  }
  const lint = spawnSync(process.execPath, ["node_modules/eslint/bin/eslint.js", ".", "--ignore-pattern", "output/**", "--format", "json", "--output-file", `${root}/lint-final.json`], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }); assert.equal(lint.status, 1);
  const findings = (json(`${root}/lint-final.json`) as Array<{ filePath: string; errorCount: number; warningCount: number }>).filter(item => item.errorCount || item.warningCount);
  for (const item of findings) { const path = item.filePath.replace(`${process.cwd()}/`, ""); assert.deepEqual(readFileSync(path), execFileSync("git", ["show", `${base}:${path}`])); }
  const errors = findings.reduce((sum, x) => sum + x.errorCount, 0), warnings = findings.reduce((sum, x) => sum + x.warningCount, 0); assert.equal(errors, 5); assert.equal(warnings, 81);
  writeFileSync(`${root}/receipts/lint-nonregression.json`, JSON.stringify({ status: "PASS", errors, warnings, newFindings: [], verifiedUnchangedFiles: findings.map(item => bind(item.filePath.replace(`${process.cwd()}/`, ""))) }, null, 2));
  writeFileSync(`${root}/receipts/original-preservation.json`, JSON.stringify({ status: "PASS", manifestSha256: oldHash, originalSourceSnapshots: original.sources.length, originalEvidenceBindings: original.evidence.length, originalSpecUnchanged: true, correctionRuntime, correctionExistingTests, newTechnicalFiles: additions, unchangedOriginalPaths: original.sources.filter((item: Binding) => !changedExisting.includes(item.path)).map((item: Binding) => item.path) }, null, 2));
  console.log("PASS TypeScript, focused lint, inherited full lint, empty index, exact source boundary and original sealed proof preservation");
} else {
  const resultPaths = ["oracle.json", "correction-oracle.json", "browser/result.json", "presentation/result.json", "faults/result.json", "protected-browser/result.json", "restart/result.json", "animator-smoke/result.json", "regressions/result.json", "build/result.json", "production-smoke.json"];
  for (const path of resultPaths) assert.equal(json(`${root}/${path}`).status, "PASS");
  for (const id of ["typescript", "focused-lint", "diff-check"]) assert.equal(json(`${root}/receipts/${id}.json`).exitCode, 0);
  const collect = (path: string): string[] => readdirSync(path, { withFileTypes: true }).flatMap(entry => {
    if (entry.name.startsWith("profile-") || entry.name === "baseline-sources") return [];
    return entry.isDirectory() ? collect(`${path}/${entry.name}`) : [`${path}/${entry.name}`];
  });
  const excluded = /\/(proof-manifest\.json|validation-receipt\.json|independent-validation[^/]*|Implementation-Review-Packet\.md|review-server\.log)$/;
  const evidencePaths = [...collect(root).filter(path => !excluded.test(path)), ...["full", "focused"].map(kind => `output/spec-0012/phase-1-correction/environment/phase2-correction-build-${kind}-network.jsonl`)].sort();
  const presentation = json(`${root}/presentation/result.json`), oracle = json(`${root}/correction-oracle.json`);
  const sources = paths.map(bind);
  const manifest = {
    schema: "spec0012-phase2-correction-proof/v1", status: "PASS_WITH_RECORDED_LIMITATIONS", generatedAt: new Date().toISOString(), base, head: git("rev-parse", "HEAD"), branch: "", worktree: process.cwd(), indexEmpty: true,
    dirtyPathAllowlist: paths, actualDirtyPaths: dirty, sources, sourceDigest: sha(JSON.stringify(sources)), evidence: evidencePaths.map(bind),
    original: { manifest: bind(`${oldRoot}/proof-manifest.json`), sourceSnapshots: baseline.sources, evidencePreserved: original.evidence.length, sourceDigest: original.sourceDigest },
    correctionRuntime, correctionExistingTests, newTechnicalFiles: additions, correctionDirtyPaths: [...changedExisting, ...additions].sort(),
    authority: { sourceTask: "01a0b45e-dd0b-73c3-b42d-d5b49dced309", phase: 2, scope: "Five explicit Arthur/PM corrections in the same exclusively owned Executor worktree: one fading scrollbar, no routine N/50, exact Animator status styling, validated 3s final hold, one local long-wait sentence", supersession: "Latest explicit correction delegation supersedes stale canonical 3.5s/no-artificial-finalizing prose; no canonical documentation edited by Executor", modeLimitation: "Default mode; no mode-switch tool available. Read-only boot and tracing preceded edits. No claim that Plan mode was active.", readOnlyReview: "Existing reviewer inspected sources only; sole Spec Executor made all edits; no new executor or ownership transfer" },
    limits: original.limits,
    correction: { finalizingMs: 3000, narrationDelayMs: 8000, sweepCycleMs: 3750, statusFontPx: 12, statusWeight: 750, baselineColor: "rgba(255, 255, 255, 0.48)", mask: "57% 100%", conversationScrollOwners: 1, visibleActivityScrollbars: 1, routineCountVisible: false, narrationPersisted: false, providerWorkRemainsThinking: true, resultPrivateDuringHold: true, oneShotAcrossRecovery: true, correctionBrowserAssertions: presentation.assertions.length, correctionOracleAssertions: oracle.assertions.length, measuredServerHoldMs: oracle.finalizingHoldMs, measuredVisibleHoldMs: presentation.visibleFinalizingMs },
    automation: { realProviderCalls: 0, paidCalls: 0, searchCalls: 0, transcriptionCalls: 0, costUsd: 0, scope: "Executor automated correction verification only; no claim about Arthur manual calls or account lifetime usage" },
    review: { url: "http://127.0.0.1:57970/assistant", homeUrl: "http://127.0.0.1:57970/", port: 57970, production: true, credentialFilePreserved: true, automatedCallsAfterCredentialEnablement: 0 },
    humanAcceptance: "pending Arthur and Project Manager", controlPlaneUpdated: false, gitPublication: false, staged: false, committed: false, pushed: false, deployed: false, laterPhaseStarted: false,
    ownership: "Sole Spec Executor stops after this packet; original worktree retained; CPA ownership transfer has not occurred",
    cleanupPlan: "Retain worktree, exact review server and sealed proof through acceptance, sequential CPA propagation and separate publication/synchronization. D-0054 cleanup remains separately authorized.",
    limitations: ["Live Terra access, latency and answer quality unproven: executor made zero live calls", "Full build inherited unchanged app/dev/ai-costs/lifetime/page.tsx PageProps/searchParams failure; focused production build passes", "Full lint inherited 5 errors and 81 warnings in unchanged base files; focused lint passes", "Historical Animator transient reveal observation remains unproven; explicitly authorized focused Animator smoke and protected byte equality pass", "Chromium with emulated layouts/accessibility only; no physical device or non-Chromium claim", "Canonical control plane intentionally unchanged pending acceptance and sequential CPA propagation"],
  };
  writeFileSync(`${root}/proof-manifest.json`, `${JSON.stringify(manifest, null, 2)}\n`, { flag: "wx" });
  console.log(JSON.stringify({ status: "SEALED", manifest: bind(`${root}/proof-manifest.json`), sourceDigest: manifest.sourceDigest, sourceFiles: paths.length, evidenceFiles: evidencePaths.length }));
}
