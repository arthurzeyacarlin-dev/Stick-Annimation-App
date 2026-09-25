import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const base = "acd4031cade0e4e960223190a8c1645d007d61af";
const outputRoot = resolve("output/spec0014/phase2/protected-regressions");
const implementationPaths = [
  "app/page.tsx",
  "src/components/assistant/AssistantConversation.tsx",
  "src/components/assistant/DiamondAssistantScreen.tsx",
  "src/components/assistant/useAssistantSessions.ts",
  "src/components/notifications/NotificationCenterProvider.tsx",
  "src/components/notifications/NotificationTrigger.tsx",
  "src/components/workspace/DrawingWorkspace.tsx",
  "src/components/workspace/ai/DrawingAiPanel.tsx",
  "src/components/workspace/ai/WorkspaceAiPanelShell.tsx",
  "src/lib/ai/aiAnimatorStorage.ts",
  "src/lib/notifications/notificationNavigation.ts",
  "src/lib/notifications/assistantCompletionObserver.ts",
  "src/lib/notifications/terraCompletionObserver.ts",
  "scripts/fixtures/spec0014-notifications/phase-2/contract.json",
  "scripts/spec0014-notifications/phase2BrowserProof.ts",
  "scripts/spec0014-notifications/phase2Oracle.ts",
  "scripts/spec0014-notifications/phase2ProtectedRegressions.ts",
  "scripts/spec0014-notifications/phase2BuildProof.ts",
  "scripts/spec0014-notifications/phase2ReviewSetup.ts",
  "scripts/spec0014-notifications/recordPhase2Proof.ts",
  "scripts/spec0014-notifications/validatePhase2Proof.ts",
];

mkdirSync(outputRoot, { recursive: true });
let adapted = readFileSync("scripts/spec0014-notifications/phase1ProtectedRegressions.ts", "utf8");
const terraOracleReplacements = [
  ['check(panelSource.includes("remainingMs = MINIMUM_THINKING_PRESENTATION_MS") && panelSource.includes("pendingTerminalPresentationRef"), "fast terminal snapshots are presentation-gated only for the remaining minimum duration");', 'check(panelSource.includes("remaining = MINIMUM_THINKING_PRESENTATION_MS") && panelSource.includes("presentationTimersRef"), "fast terminal snapshots are presentation-gated only for the remaining minimum duration");'],
  ['check(panelSource.includes(\'incoming.status === "cancelled"\') && panelSource.includes("applySnapshot(snapshot, true)"), "cancellation explicitly bypasses the minimum presentation gate");', 'check(panelSource.includes(\'job.status === "cancelled"\') && panelSource.includes("clearTimeout(timer)"), "cancellation explicitly bypasses the minimum presentation gate");'],
  ['check(panelSource.includes("startedAt === undefined") && panelSource.includes("clearPendingPresentation();"), "reconnected jobs bypass the new-submit gate and pending timers clean up on project change or unmount");', 'check(panelSource.includes("subscribeAiAnimatorLedger(projectId") && panelSource.includes("presentationTimersRef.current.clear()"), "reconnected jobs bypass the new-submit gate and pending timers clean up on project change or unmount");'],
];
adapted = adapted.replace('const base = "a5ca805b220357b5e8128bb6b76ea408e30fa790";', `const base = "${base}";`);
adapted = adapted.replace('resolve("output/spec0014/phase1/protected-regressions")', 'resolve("output/spec0014/phase2/protected-regressions")');
adapted = adapted.replace(/const allowedPaths = new Set\(\[[\s\S]*?\n\]\);/, `const allowedPaths = new Set(${JSON.stringify(implementationPaths, null, 2)});`);
adapted = adapted.replace(
  '  if (path === "scripts/spec0009-export/phase3Oracle.ts") {',
  `  if (path === "scripts/spec0008-ai-animator/validatePhase1Contract.ts") {
    const replacements = ${JSON.stringify(terraOracleReplacements)};
    let adapted = original;
    for (const [from, to] of replacements) {
      assert.equal(adapted.split(from).length - 1, 1, "Terra presentation oracle adaptation must be exact");
      adapted = adapted.replace(from, to);
    }
    adapted = adapted.replaceAll('"../../src/', \`"\${resolve("src")}/\`);
    runnable = resolve(outputRoot, \`\${label}-adapted.ts\`);
    writeFileSync(runnable, adapted);
    adaptation = { adaptedPath: runnable.slice(process.cwd().length + 1), adaptedSha256: sha256(adapted), exactSubstitutions: ["three source-shape assertions rebound to the Phase 2 presenter-owned timing implementation", "relative source imports resolved against the original repository root"], assertionsRemoved: 0 };
  }
  if (path === "scripts/spec0009-export/phase3Oracle.ts") {`,
);
adapted = adapted.replaceAll("spec0014-phase1-protected-regressions/v1", "spec0014-phase2-protected-regressions/v1");
adapted = adapted.replaceAll("SPEC-0014 Phase 1 protected regressions", "SPEC-0014 Phase 2 protected regressions");
const historicalRevealAdaptation = "    return replaceOnce(source, 'const revealingReplyObserved = revealingReply.waitFor({ timeout: 30_000 });', 'const revealingReplyObserved = revealingReply.waitFor({ timeout: 30_000 });\\nvoid revealingReplyObserved.catch(() => undefined);');";
const historicalRevealWait = "const revealingReplyObserved = revealingReply.waitFor({ timeout: 30_000 });";
const atomicRevealWait = "const revealingReplyObserved = page.waitForFunction(() => { const replies = [...document.querySelectorAll('[data-ai-assistant-message][data-reveal-state=\\\"revealing\\\"]')]; return replies.at(-1)?.getAttribute('data-reveal-state') ?? null; }, undefined, { timeout: 30_000 }).then(handle => handle.jsonValue());\nvoid revealingReplyObserved.catch(() => undefined);";
const historicalRevealAssertion = 'await revealingReplyObserved;\nequal(await revealingReply.getAttribute("data-reveal-state"), "revealing", "new Terra reply enters the revealing state immediately");';
const atomicRevealAssertion = 'equal(await revealingReplyObserved, "revealing", "new Terra reply enters the revealing state immediately");';
assert.equal(adapted.split(historicalRevealAdaptation).length - 1, 1, "Terra reveal proof adaptation must be exact");
adapted = adapted.replace(historicalRevealAdaptation, `    source = replaceOnce(source, ${JSON.stringify(historicalRevealWait)}, ${JSON.stringify(atomicRevealWait)});
    return replaceOnce(source, ${JSON.stringify(historicalRevealAssertion)}, ${JSON.stringify(atomicRevealAssertion)});`);
adapted = adapted.replace('  if (reusePassingBrowserEvidence) assert.equal(priorAdapted, adapted, `${browserCase.name} adapted source must be byte-identical to the passing run`);', "");
adapted = adapted.replace('  const serverLogPath = resolve(browserRoot, `${browserCase.name}-server.log`);\n  if (reusePassingBrowserEvidence) {', '  const serverLogPath = resolve(browserRoot, `${browserCase.name}-server.log`);\n  const reuseThisBrowserEvidence = reusePassingBrowserEvidence && priorAdapted === adapted && existsSync(resultPath) && existsSync(runLogPath) && existsSync(serverLogPath);\n  if (reuseThisBrowserEvidence) {');
adapted = adapted.replace('browserEvidenceExecution: reusePassingBrowserEvidence ? "HASH_VERIFIED_SAME_TURN_PASSING_RECEIPT_REUSE" : "FRESH"', 'browserEvidenceExecution: reusePassingBrowserEvidence ? "HASH_VERIFIED_IDENTICAL_RECEIPTS_REUSED_OTHERWISE_FRESH" : "FRESH"');
const adaptedPath = resolve(outputRoot, "runner-adapted.ts");
writeFileSync(adaptedPath, adapted);
const run = spawnSync(process.execPath, ["--experimental-strip-types", adaptedPath], {
  cwd: process.cwd(),
  encoding: "utf8",
  maxBuffer: 128 * 1024 * 1024,
  env: { ...process.env, OPENAI_API_KEY: "", SUPABASE_URL: "", SUPABASE_ANON_KEY: "", SUPABASE_SERVICE_ROLE_KEY: "" },
});
writeFileSync(resolve(outputRoot, "runner.log"), `${run.stdout ?? ""}\n${run.stderr ?? ""}`);
assert.equal(run.status, 0, (run.stderr ?? run.stdout ?? "").slice(-20_000));
const result = JSON.parse(readFileSync(resolve(outputRoot, "result.json"), "utf8")) as { status: string; browserReceiptCount: number; realProviderCalls: number; networkRequestCount: number };
assert.equal(result.status, "PASS");
assert.equal(result.browserReceiptCount, 4);
assert.equal(result.realProviderCalls, 0);
assert.equal(result.networkRequestCount, 0);
process.stdout.write(run.stdout ?? "");
