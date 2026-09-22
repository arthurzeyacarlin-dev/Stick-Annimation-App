import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";

const output = "output/spec-0012/phase-2"; const base = "652431396e78370f3dfb7549294e66d154c3b7d4";
const paths = ["app/assistant/page.tsx", "app/api/diamond-assistant/route.ts",
  ...["DiamondAssistantScreen.tsx", "diamondAssistant.module.css", "AssistantComposer.tsx", "AssistantConversation.tsx", "AssistantSessionSidebar.tsx", "AssistantText.tsx", "useAssistantSessions.ts"].map(p => `src/components/assistant/${p}`),
  ...["assistantContracts", "assistantStorage", "assistantKnowledge", "assistantJobService", "assistantProvider"].map(p => `src/lib/assistant/${p}.ts`),
  ...["phase2AnimatorSmoke", "phase2BrowserProof", "phase2BuildProof", "phase2FaultProof", "phase2Fixtures", "phase2Oracle", "phase2ProtectedBrowser", "phase2Regressions", "phase2RestartProof", "recordPhase2Proof", "validatePhase2Proof"].map(p => `scripts/spec0012-assistant/${p}.ts`),
].sort();
const git = (...args: string[]) => execFileSync("git", args, { encoding: "utf8" }).trim();
const sha = (data: string | Buffer) => createHash("sha256").update(data).digest("hex");
const bind = (path: string) => { const bytes = readFileSync(path); return { path, bytes: bytes.length, sha256: sha(bytes) }; };
const json = (path: string) => JSON.parse(readFileSync(path, "utf8"));
const dirty = [...new Set([...git("ls-files", "-m").split("\n"), ...git("ls-files", "--others", "--exclude-standard").split("\n")].filter(Boolean))].sort();
assert.equal(git("rev-parse", "HEAD"), base); assert.equal(git("diff", "--cached", "--name-only"), ""); assert.deepEqual(dirty, paths);
mkdirSync(`${output}/receipts`, { recursive: true });
if (!process.argv.includes("--seal")) {
  for (const [id, command, args] of [
    ["typescript", process.execPath, ["node_modules/typescript/bin/tsc", "--noEmit", "--incremental", "false"]],
    ["focused-lint", process.execPath, ["node_modules/eslint/bin/eslint.js", ...paths.filter(p => /\.tsx?$/.test(p))]],
    ["diff-check", "git", ["diff", "--check"]],
  ] as Array<[string, string, string[]]>) {
    const result = spawnSync(command, args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
    writeFileSync(`${output}/receipts/${id}.json`, JSON.stringify({ id, command: [command, ...args], exitCode: result.status, stdout: result.stdout, stderr: result.stderr }, null, 2)); assert.equal(result.status, 0, result.stdout + result.stderr);
  }
  const lint = json(`${output}/lint-final.json`) as Array<{ filePath: string; errorCount: number; warningCount: number }>;
  const findings = lint.filter(entry => entry.errorCount || entry.warningCount);
  for (const entry of findings) { const path = entry.filePath.replace(`${process.cwd()}/`, ""); assert.deepEqual(readFileSync(path), execFileSync("git", ["show", `${base}:${path}`]), `all lint findings belong to unchanged base file ${path}`); }
  writeFileSync(`${output}/receipts/lint-nonregression.json`, JSON.stringify({ status: "PASS", errors: findings.reduce((n, x) => n + x.errorCount, 0), warnings: findings.reduce((n, x) => n + x.warningCount, 0), newFindings: [], verifiedUnchangedFiles: findings.map(entry => bind(entry.filePath.replace(`${process.cwd()}/`, ""))) }, null, 2));
  console.log("PASS final TypeScript, focused lint, diff, and full-lint unchanged-source gates");
} else {
  const resultPaths = ["oracle.json", "browser/result.json", "faults/result.json", "protected-browser/result.json", "restart/result.json", "animator-smoke/result.json", "regressions/result.json", "build/result.json"];
  for (const path of resultPaths) assert.equal(json(`${output}/${path}`).status, "PASS");
  for (const id of ["typescript", "focused-lint", "diff-check"]) assert.equal(json(`${output}/receipts/${id}.json`).exitCode, 0);
  const collect = (path: string): string[] => readdirSync(path, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? collect(`${path}/${entry.name}`) : [`${path}/${entry.name}`]);
  const evidencePaths = [...["browser", "faults", "protected-browser", "animator-smoke", "regressions", "build", "receipts"].flatMap(p => collect(`${output}/${p}`)),
    ...["oracle.json", "oracle-run.log", "lint-final.json", "restart/result.json", "restart/recovered.png", "animator/run.log", "animator/adapter-binding.json", "animator/adapted-browser.mjs", "review-server.json", "review-config.json", "production-smoke.json", "production-smoke.png", "production-smoke.mjs", "network-proof.jsonl"].map(p => `${output}/${p}`),
    ...["phase2-build-full-network.jsonl", "phase2-build-focused-network.jsonl", "font-responses.cjs"].map(p => `output/spec-0012/phase-1-correction/environment/${p}`),
  ].sort();
  const browser = json(`${output}/browser/result.json`); const protectedProof = json(`${output}/protected-browser/result.json`);
  const manifest = {
    schema: "spec0012-phase2-proof/v1", status: "PASS_WITH_RECORDED_LIMITATIONS", generatedAt: new Date().toISOString(), base, head: git("rev-parse", "HEAD"), branch: git("branch", "--show-current"), worktree: process.cwd(), indexEmpty: true,
    dirtyPathAllowlist: paths, actualDirtyPaths: dirty, sources: paths.map(bind), sourceDigest: sha(JSON.stringify(paths.map(bind))), evidence: evidencePaths.map(bind), spec: bind("docs/specs/0012-diamond-animator-guidance-assistant.md"),
    authority: { sourceTask: "01a0b45e-dd0b-73c3-b42d-d5b49dced309", phase: 2, scope: "Explicit Arthur/PM delegation: persistent chats plus first functional Terra guidance moved forward from Phase 3; no search, microphone, project context or mutation", modeLimitation: "Task launched in Default mode with no mode-switch tool. Read-only boot, source trace and exact plan preceded implementation; no claim that Plan mode was active.", historicalRegressionSteer: "PM explicitly accepted focused deterministic Animator browser smoke plus unchanged-byte proof when historical transient timing observation remains unresolved." },
    limits: { sessions: 50, messages: 200, sessionBytes: 1048576, databaseBytes: 33554432, contextMessages: 32, contextChars: 48000, inputTokens: 24000, outputTokens: 4000, deadlineMs: 90000, activePerSession: 1, activeEnvironment: 2 },
    summary: { model: "gpt-5.6-terra", reasoning: ["low", "medium", "high", "xhigh"], defaultReasoning: "medium", realProviderCalls: 0, paidCalls: 0, searchCalls: 0, transcriptionCalls: 0, automatedCostUsd: 0,
      browserAssertions: browser.assertions.length, oracleAssertions: json(`${output}/oracle.json`).assertions.length, accessibility: browser.accessibility, foreignMutations: browser.foreignMutations, storageDigests: { before: protectedProof.beforeDigest, after: protectedProof.afterDigest },
      performanceScope: "Functional responsive-layout and bounded activity/reveal checks; no quantitative performance benchmark claimed", focusedBuild: "PASS", fullBuild: "INHERITED_BASELINE_FAILURE", fullLint: json(`${output}/receipts/lint-nonregression.json`), historicalAnimatorFullSuite: "TRANSIENT_REVEAL_OBSERVATION_FAILED", focusedAnimatorSmoke: "PASS", protectedTechnicalOracles: 13, deniedFrameworkVersionChecks: 1 },
    review: { url: "http://127.0.0.1:57970/assistant", homeUrl: "http://127.0.0.1:57970/", port: 57970, providerMode: "Ignored existing credential available for Arthur manual review; automated proof used doubles/no-key network guard only" },
    humanAcceptance: "pending Arthur and Project Manager", controlPlaneUpdated: false, gitPublication: false, staged: false, committed: false, pushed: false, deployed: false, laterPhaseStarted: false,
    ownership: "Spec Executor stops after Implementation Review Packet; worktree retained; no simultaneous architect owner",
    cleanupPlan: "Retain exact worktree and review server until acceptance, sequential CPA propagation and separately authorized publication/synchronization. Authorized D-0054 cleanup then preserves proof and removes only the obsolete executor copy/server/branch.",
    limitations: ["Zero live-provider calls: live access/latency/answer quality are not proven", "Full build retains unchanged app/dev/ai-costs/lifetime/page.tsx PageProps/searchParams error", "Full lint retains errors/warnings only in byte-identical base files", "Historical Animator suite did not observe its transient revealing state at 30s/90s; focused real-browser smoke and protected byte checks pass", "Chromium and emulated viewport/accessibility profiles only; no physical-device or non-Chromium claim", "Canonical documentation intentionally remains unchanged pending acceptance and CPA propagation"],
  };
  writeFileSync(`${output}/proof-manifest.json`, `${JSON.stringify(manifest, null, 2)}\n`, { flag: "wx" }); console.log(JSON.stringify({ status: "SEALED", manifest: bind(`${output}/proof-manifest.json`), sourceDigest: manifest.sourceDigest, pathCount: paths.length }));
}
