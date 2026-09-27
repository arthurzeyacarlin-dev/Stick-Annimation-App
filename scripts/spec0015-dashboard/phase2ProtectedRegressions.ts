import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const base = "02a80577f562e9524d2e177c222d19f99f517278";
const url = process.env.SPEC0015_BASE_URL ?? "http://127.0.0.1:58540";
const output = resolve("output/spec0015/phase2/protected");
mkdirSync(output, { recursive: true });
const protectedPaths = [
  "app/page.tsx", "app/assistant/page.tsx", "app/credits/page.tsx", "app/layout.tsx",
  "src/components/ai-dashboard/AiDashboard.module.css", "src/components/ai-dashboard/AiDashboardScreen.tsx",
  "src/components/ai-dashboard/AiUsageChart.tsx", "src/lib/ai-dashboard/dashboardAggregation.ts",
  "src/lib/ai-dashboard/dashboardContract.ts", "src/lib/ai-dashboard/dashboardSources.ts",
  "src/components/chrome/AIcreditspage.tsx", "src/components/assistant/DiamondAssistantScreen.tsx",
  "src/components/assistant/useAssistantSessions.ts", "src/components/assistant/AssistantComposer.tsx",
  "src/components/workspace/DrawingWorkspace.tsx", "src/components/workspace/ai/DrawingAiPanel.tsx",
  "src/components/export/AnimationExportFlow.tsx", "src/lib/export/exportVideo.ts",
  "src/lib/ai/aiAnimatorContract.ts", "src/lib/ai/aiAnimatorStorage.ts",
  "src/lib/assistant/assistantContracts.ts", "src/lib/assistant/assistantStorage.ts", "src/lib/assistant/assistantSearchPolicy.ts",
  "src/lib/notifications/assistantCompletionObserver.ts", "src/lib/notifications/terraCompletionObserver.ts",
  "src/lib/notifications/notificationNavigation.ts", "src/lib/openai/client.ts",
];
const original = readFileSync("scripts/spec0015-dashboard/phase1ProtectedRegressions.ts", "utf8");
const pathsStart = original.indexOf("const protectedPaths = [");
const pathsEnd = original.indexOf("];", pathsStart) + 2;
assert.ok(pathsStart >= 0 && pathsEnd > pathsStart);
let adapted = `${original.slice(0, pathsStart)}const protectedPaths = ${JSON.stringify(protectedPaths, null, 2)};${original.slice(pathsEnd)}`;
adapted = adapted
  .replace('const base = "1c45a016da73e86356ed65720209181468bad37d";', `const base = ${JSON.stringify(base)};`)
  .replace('const url = process.env.SPEC0015_BASE_URL ?? "http://127.0.0.1:58525";', `const url = ${JSON.stringify(url)};`)
  .replace('resolve("output/spec0015/phase1/protected")', `resolve(${JSON.stringify(output)})`)
  .replace('schema: "spec0015-phase1-protected-regressions/v1"', 'schema: "spec0015-phase2-protected-regressions/v1"')
  .replace("SPEC-0015 Phase 1 protected regressions PASS", "SPEC-0015 Phase 2 protected regressions PASS");
const runner = resolve(output, "phase2-protected-adapted.ts");
writeFileSync(runner, adapted);
const run = spawnSync(process.execPath, ["--experimental-strip-types", runner], {
  cwd: process.cwd(), encoding: "utf8", maxBuffer: 128 * 1024 * 1024, timeout: 420_000,
  env: { ...process.env, SPEC0015_BASE_URL: url, OPENAI_API_KEY: "", SUPABASE_URL: "", SUPABASE_ANON_KEY: "", SUPABASE_SERVICE_ROLE_KEY: "" },
});
writeFileSync(resolve(output, "protected-run.log"), `${run.stdout ?? ""}\n${run.stderr ?? ""}`);
rmSync(runner);
assert.equal(run.status, 0, (run.stderr ?? run.stdout ?? "").slice(-12_000));
const result = JSON.parse(readFileSync(resolve(output, "protected.json"), "utf8")) as {
  schema: string; status: string; base: string; protectedRuntime: { status: string; paths: number };
  ordinaryFlows: { assertionCount: number; assistantPosts: number; terraPosts: number };
  localExport: { status: string; mp4: { bytes: number; sha256: string }; isolation: Record<string, number> };
  network: { realProviderCalls: number; paidCalls: number; externalRequests: unknown[] };
};
assert.equal(result.schema, "spec0015-phase2-protected-regressions/v1");
assert.equal(result.status, "PASS"); assert.equal(result.base, base);
assert.equal(result.protectedRuntime.status, "BYTE_IDENTICAL"); assert.equal(result.protectedRuntime.paths, protectedPaths.length);
assert.ok(result.ordinaryFlows.assertionCount >= 48); assert.equal(result.ordinaryFlows.assistantPosts, 10);
assert.equal(result.ordinaryFlows.terraPosts, 7); assert.equal(result.localExport.status, "PASS");
assert.ok(result.localExport.mp4.bytes > 0); assert.deepEqual(result.localExport.isolation,
  { externalRequests: 0, aiProviderCalls: 0, paidCalls: 0, creditChanges: 0, repositoryWrites: 0 });
assert.deepEqual(result.network, { realProviderCalls: 0, paidCalls: 0, externalRequests: [] });
const final = { ...result, boundaries: { phase1DashboardByteIdentical: true, phase1ChartByteIdentical: true,
  ordinaryAiUiFlowsPreserved: true, notificationsPreserved: true, workspacePreserved: true, exportPreserved: true,
  providerPayloadProof: "output/spec0015/phase2/runtime/runtime.json", telemetryNotBillingReady: true } };
writeFileSync(resolve(output, "protected.json"), `${JSON.stringify(final, null, 2)}\n`);
console.log(`SPEC-0015 Phase 2 protected regressions PASS (${result.ordinaryFlows.assertionCount} ordinary AI assertions, one local MP4, ${protectedPaths.length} byte-identical owners)`);
