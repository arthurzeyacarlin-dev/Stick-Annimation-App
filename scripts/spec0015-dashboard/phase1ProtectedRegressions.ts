import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const base = "1c45a016da73e86356ed65720209181468bad37d";
const url = process.env.SPEC0015_BASE_URL ?? "http://127.0.0.1:58525";
const output = resolve("output/spec0015/phase1/protected");
mkdirSync(output, { recursive: true });
const sha = (bytes: Buffer | string) => createHash("sha256").update(bytes).digest("hex");
const protectedPaths = [
  "app/page.tsx", "app/assistant/page.tsx", "app/api/ai-animator/route.ts", "app/api/diamond-assistant/route.ts",
  "app/api/diamond-assistant-transcription/route.ts", "app/layout.tsx",
  "src/components/chrome/AIcreditspage.tsx", "src/components/assistant/DiamondAssistantScreen.tsx",
  "src/components/assistant/useAssistantSessions.ts", "src/components/assistant/AssistantComposer.tsx",
  "src/components/workspace/DrawingWorkspace.tsx", "src/components/workspace/ai/DrawingAiPanel.tsx",
  "src/components/export/AnimationExportFlow.tsx", "src/lib/export/exportVideo.ts",
  "src/lib/ai/aiAnimatorContract.ts", "src/lib/ai/aiAnimatorJobService.ts", "src/lib/ai/aiAnimatorStorage.ts",
  "src/lib/assistant/assistantContracts.ts", "src/lib/assistant/assistantStorage.ts",
  "src/lib/assistant/assistantJobService.ts", "src/lib/assistant/assistantProvider.ts",
  "src/lib/assistant/assistantSearchPolicy.ts", "src/lib/assistant/assistantTranscriptionService.ts",
  "src/lib/notifications/assistantCompletionObserver.ts", "src/lib/notifications/terraCompletionObserver.ts",
  "src/lib/notifications/notificationNavigation.ts", "src/lib/openai/client.ts", "src/lib/openai/generateAiAnimatorReply.ts",
];
const sourceHashes = protectedPaths.map((path) => {
  const bytes = readFileSync(path);
  const old = spawnSync("git", ["show", `${base}:${path}`], { maxBuffer: 64 * 1024 * 1024 });
  assert.equal(old.status, 0, `${path}: ${old.stderr}`);
  assert.deepEqual(bytes, old.stdout, `protected source changed: ${path}`);
  return { path, bytes: bytes.length, sha256: sha(bytes) };
});

// Re-execute the accepted ordinary Assistant/Project AI browser flow with its
// deterministic HTTP doubles. The adaptation changes only its ignored output.
const historical = readFileSync("scripts/spec0014-notifications/phase2BrowserProof.ts", "utf8");
const from = 'resolve("output/spec0014/phase2/browser")';
assert.equal(historical.split(from).length - 1, 1);
const close = "  await context.close();";
assert.equal(historical.split(close).length - 1, 1);
const assistantReturn = '  return {\n    schema: "diamond-assistant-job/v1", jobId: job.request.jobId';
assert.equal(historical.split(assistantReturn).length - 1, 1);
const searchBranch = `  if (job.request.message === "assistant-dashboard-search") {
    const answer = "Synthetic source confirms this.";
    return {
      schema: "diamond-assistant-job/v1", jobId: job.request.jobId, sessionId: job.request.sessionId, turnId: job.request.turnId,
      reasoning: job.request.reasoningLevel, catalogVersion: job.request.catalogVersion, status: "done",
      events: [base, { sequence: 2, at: job.createdAt + 1, status: "finalizing" }, { sequence: 3, at: job.createdAt + 2, status: "done" }], error: null,
      result: {
        reply: { answer, title: "Synthetic search", citations: [{ index: 1, title: "Synthetic source", url: "https://example.org/source", startIndex: 0, endIndex: 16 }] },
        usage: { inputTokens: 20, outputTokens: 10, totalTokens: 30, estimatedCostUsd: .01016, priceDate: "2026-09-23",
          responseId: \`response_\${job.request.jobId}\`, latencyMs: 2, model: "gpt-5.6-terra", reasoning: job.request.reasoningLevel, toolCalls: 1 },
        search: { topic: "Synthetic dashboard search", toolCalls: 1, processedSourceCount: 1,
          actions: [{ type: "search", queries: ["synthetic guidance"] }], sources: [{ title: "Synthetic source", url: "https://example.org/source" }] },
      },
    };
  }
`;
const dashboardIntegration = `
  await page.goto(\`\${origin}/assistant\`);
  await page.getByRole("button", { name: "New Chat", exact: true }).click();
  await sendAssistant(page, "assistant-dashboard-search");
  lastAssistantJob().released = true;
  await page.getByRole("article", { name: "Assistant reply" }).filter({ hasText: "Synthetic source confirms this." }).waitFor();
  await page.goto(\`\${origin}/credits\`);
  await page.getByRole("button", { name: "Refresh" }).waitFor();
  await page.locator("[data-testid='usage-bar']").last().waitFor();
  const contribution = async () => Number(await page.locator("[data-testid='usage-bar']").last().getAttribute("data-selected-tokens"));
  const combinedDashboard = await contribution();
  await page.getByRole("button", { name: "Project AI", exact: true }).click();
  const projectDashboard = await contribution();
  await page.getByRole("button", { name: "Assistant", exact: true }).click();
  const assistantDashboard = await contribution();
  check(projectDashboard > 0, "ordinary mocked Project AI completions appear on Dashboard");
  check(assistantDashboard > 0, "ordinary mocked Assistant completions appear on Dashboard");
  equal(combinedDashboard, projectDashboard + assistantDashboard, "ordinary source receipts combine exactly once in Dashboard");
  check(await page.getByText("1 search call(s)", { exact: true }).isVisible(), "hosted-search-shaped receipt counted separately once");
  equal(assistantPosts, 10, "Dashboard visit creates no Assistant POST after search-shaped send");
  equal(terraPosts, 7, "Dashboard visit creates no Project AI POST");
  await screenshot(page, "dashboard-after-ordinary-ai");
  writeFileSync(resolve(outputRoot, "dashboard-integration.json"), JSON.stringify({ combinedDashboard, projectDashboard, assistantDashboard, assistantPosts, terraPosts, hostedSearchCalls: 1 }, null, 2));
`;
const adapted = historical.replace(from, `resolve(${JSON.stringify(output)})`).replace(assistantReturn, searchBranch + assistantReturn)
  .replace(close, dashboardIntegration + close);
const runner = resolve(output, "ordinary-flows-adapted.ts");
writeFileSync(runner, adapted);
const run = spawnSync(process.execPath, ["--experimental-strip-types", runner, `--url=${url}/`], {
  cwd: process.cwd(), encoding: "utf8", maxBuffer: 128 * 1024 * 1024,
  timeout: 180_000, env: { ...process.env, OPENAI_API_KEY: "", SUPABASE_URL: "", SUPABASE_ANON_KEY: "", SUPABASE_SERVICE_ROLE_KEY: "" },
});
writeFileSync(resolve(output, "ordinary-flows.log"), `${run.stdout ?? ""}\n${run.stderr ?? ""}`);
rmSync(runner);
assert.equal(run.status, 0, (run.stderr ?? run.stdout ?? "").slice(-10_000));
const browser = JSON.parse(readFileSync(resolve(output, "result.json"), "utf8")) as {
  status: string; assertionCount: number; assistantPosts: number; terraPosts: number;
  realProviderCalls: number; paidCalls: number; externalRequests: unknown[]; errors: unknown[];
};
assert.equal(browser.status, "PASS");
assert.ok(browser.assertionCount >= 48);
assert.equal(browser.assistantPosts, 10);
assert.equal(browser.terraPosts, 7);
assert.equal(browser.realProviderCalls, 0);
assert.equal(browser.paidCalls, 0);
assert.deepEqual(browser.externalRequests, []);
assert.deepEqual(browser.errors, []);

const exportOutput = resolve(output, "export");
mkdirSync(exportOutput, { recursive: true });
const exportSource = readFileSync("scripts/spec0009-export/phase3BrowserProof.ts", "utf8");
const exportOutputFrom = 'const outputRoot = "output/spec-0009/phase-3";';
const exportCaseFrom = `const realCases: RealExportCase[] = [
  { id: "original-720", destination: "Original", tier: "720p" },
  { id: "wide-1080", destination: "YouTube", tier: "1080p" },
  { id: "vertical-720", destination: "TikTok", tier: "720p" },
  { id: "portrait-720", destination: "Instagram Feed", tier: "720p" },
  { id: "square-720", destination: "Custom / Other", tier: "720p", customShape: "1:1" },
  { id: "custom-1024x768", destination: "Custom / Other", customShape: "custom", customDimensions: [1024, 768] },
];`;
assert.equal(exportSource.split(exportOutputFrom).length - 1, 1);
assert.equal(exportSource.split(exportCaseFrom).length - 1, 1);
assert.equal(exportSource.split('getByRole("main", { name: "Projects" })').length - 1, 1);
assert.equal(exportSource.split('getByText("No saved projects yet.")').length - 1, 2);
assert.equal(exportSource.split('getByRole("button", { name: "Open SPEC-0009 Phase 3 Social Destinations" })').length - 1, 1);
const reopenOld = `await page.reload({ waitUntil: "networkidle" });
await page.getByRole("button", { name: /Open Project/ }).click();`;
assert.equal(exportSource.split(reopenOld).length - 1, 1);
const oldTerra = `await page.getByLabel("Message AI Animator").fill("hello");
await page.getByRole("button", { name: "Send AI message" }).click();
await page.locator("[data-ai-assistant-message]").filter({ hasText: "Hello! I’m Terra." }).waitFor();
equal(terraRequests.length, 1, "one no-cost Terra regression request");
equal((terraRequests[0] as { message?: unknown }).message, "hello", "Terra receives the exact regression message");`;
assert.equal(exportSource.split(oldTerra).length - 1, 1);
const exportRunner = resolve(exportOutput, "single-export-adapted.ts");
writeFileSync(exportRunner, exportSource.replace(exportOutputFrom, `const outputRoot = ${JSON.stringify(exportOutput)};`)
  .replace(exportCaseFrom, `const realCases: RealExportCase[] = [{ id: "original-720", destination: "Original", tier: "720p" }];`)
  .replace('getByRole("main", { name: "Projects" })', 'getByRole("main", { name: "Open Project" })')
  .replaceAll('getByText("No saved projects yet.")', 'getByText("No saved projects", { exact: true })')
  .replace('getByRole("button", { name: "Open SPEC-0009 Phase 3 Social Destinations" })', 'getByRole("button", { name: "Edit SPEC-0009 Phase 3 Social Destinations" })')
  .replace(oldTerra, 'equal(terraRequests.length, 0, "Export does not request Project AI");')
  .replace(reopenOld, `await page.reload({ waitUntil: "networkidle" });
await page.screenshot({ path: \`\${outputRoot}/after-reload.png\`, fullPage: true });
await page.getByRole("button", { name: "Discard Draft" }).click();
await page.getByRole("alert").getByRole("button", { name: "Discard Draft" }).click();
await page.getByRole("button", { name: /Open Project/ }).click();`));
const exportRun = spawnSync(process.execPath, ["--experimental-strip-types", exportRunner, `--url=${url}/`], {
  cwd: process.cwd(), encoding: "utf8", maxBuffer: 128 * 1024 * 1024,
  timeout: 240_000, env: { ...process.env, OPENAI_API_KEY: "", SUPABASE_URL: "", SUPABASE_ANON_KEY: "", SUPABASE_SERVICE_ROLE_KEY: "" },
});
writeFileSync(resolve(exportOutput, "single-export.log"), `${exportRun.stdout ?? ""}\n${exportRun.stderr ?? ""}`);
rmSync(exportRunner);
assert.equal(exportRun.status, 0, (exportRun.stderr ?? exportRun.stdout ?? "").slice(-10_000));
const exportBrowser = JSON.parse(readFileSync(resolve(exportOutput, "browser.json"), "utf8")) as {
  status: string; assertions: number; facts: { exports: Array<{ status: string; sha256: string; bytes: number }> };
  isolation: { externalRequests: number; aiProviderCalls: number; paidCalls: number; creditChanges: number; repositoryWrites: number };
  errors: unknown[]; requestFailures: unknown[];
};
assert.equal(exportBrowser.status, "PASS");
assert.equal(exportBrowser.facts.exports.length, 1);
assert.equal(exportBrowser.facts.exports[0].status, "PASS");
assert.ok(exportBrowser.facts.exports[0].bytes > 0);
assert.deepEqual(exportBrowser.isolation, { externalRequests: 0, aiProviderCalls: 0, paidCalls: 0, creditChanges: 0, repositoryWrites: 0 });
assert.deepEqual(exportBrowser.errors, []);
assert.deepEqual(exportBrowser.requestFailures, []);
const result = {
  schema: "spec0015-phase1-protected-regressions/v1", status: "PASS", base,
  protectedRuntime: { status: "BYTE_IDENTICAL", paths: sourceHashes.length, aggregateSha256: sha(JSON.stringify(sourceHashes)), files: sourceHashes },
  ordinaryFlows: { assertionCount: browser.assertionCount, assistantPosts: browser.assistantPosts, terraPosts: browser.terraPosts,
    dashboardIntegration: JSON.parse(readFileSync(resolve(output, "dashboard-integration.json"), "utf8")) },
  localExport: { status: "PASS", assertions: exportBrowser.assertions, mp4: exportBrowser.facts.exports[0], isolation: exportBrowser.isolation },
  network: { realProviderCalls: 0, paidCalls: 0, externalRequests: [] },
  boundaries: { aiRequestOwnersUnchanged: true, notificationOwnersUnchanged: true, workspaceUnchanged: true, exportUnchanged: true },
};
writeFileSync(resolve(output, "protected.json"), `${JSON.stringify(result, null, 2)}\n`);
console.log(`SPEC-0015 Phase 1 protected regressions PASS (${browser.assertionCount} ordinary AI assertions, one local MP4, ${sourceHashes.length} byte-identical owners)`);
