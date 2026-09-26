import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const base = "57f3a8560dc61f79db87c13dbff7285684b74793";
const url = process.argv.find(argument => argument.startsWith("--url="))?.slice(6) ?? "http://127.0.0.1:58480/";
const outputRoot = resolve("output/spec0014/phase4/protected-regressions");
mkdirSync(outputRoot, { recursive: true });
const sha256 = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
const protectedPaths = [
  "app/page.tsx",
  "src/components/assistant/AssistantConversation.tsx",
  "src/components/assistant/DiamondAssistantScreen.tsx",
  "src/components/assistant/useAssistantSessions.ts",
  "src/components/export/AnimationExportFlow.tsx",
  "src/components/workspace/DrawingWorkspace.tsx",
  "src/components/workspace/ai/DrawingAiPanel.tsx",
  "src/components/workspace/ai/WorkspaceAiPanelShell.tsx",
  "src/lib/ai/aiAnimatorStorage.ts",
  "src/lib/notifications/assistantCompletionObserver.ts",
  "src/lib/notifications/notificationNavigation.ts",
  "src/lib/notifications/terraCompletionObserver.ts",
  "src/lib/export/exportContracts.ts",
  "src/lib/export/exportRenderer.ts",
  "src/lib/export/exportVideo.ts"
];
const protectedHashes = protectedPaths.map(path => {
  const current = readFileSync(path);
  const historical = spawnSync("git", ["show", `${base}:${path}`], { cwd: process.cwd(), maxBuffer: 64 * 1024 * 1024 });
  assert.equal(historical.status, 0, historical.stderr?.toString());
  assert.deepEqual(current, historical.stdout, `protected runtime changed: ${path}`);
  return { path, bytes: current.byteLength, sha256: sha256(current) };
});

const runAdapted = (name: string, sourcePath: string, outputFrom: string, outputTo: string, args: string[] = [], replacements: Array<[string, string]> = []) => {
  let source = readFileSync(sourcePath, "utf8");
  for (const [from, to] of replacements) {
    assert.equal(source.split(from).length - 1, 1, `${name} adaptation must be exact`);
    source = source.replace(from, to);
  }
  assert.equal(source.split(outputFrom).length - 1, 1, `${name} output substitution must be exact`);
  source = source.replace(outputFrom, outputTo);
  const runner = resolve(outputRoot, `${name}-adapted.ts`);
  writeFileSync(runner, source);
  const run = spawnSync(process.execPath, ["--experimental-strip-types", runner, ...args], {
    cwd: process.cwd(),
    encoding: "utf8",
    maxBuffer: 128 * 1024 * 1024,
    timeout: 900_000,
    env: { ...process.env, OPENAI_API_KEY: "", SUPABASE_URL: "", SUPABASE_ANON_KEY: "", SUPABASE_SERVICE_ROLE_KEY: "" },
  });
  writeFileSync(resolve(outputRoot, `${name}.log`), `${run.stdout ?? ""}\n${run.stderr ?? ""}`);
  rmSync(runner);
  assert.equal(run.status, 0, (run.stderr ?? run.stdout ?? "").slice(-20_000));
};

runAdapted("phase2-oracle", "scripts/spec0014-notifications/phase2Oracle.ts", 'resolve("output/spec0014/phase2")', 'resolve("output/spec0014/phase4/protected-regressions/phase2-oracle")', [], [[
  'check(trigger.includes("row.readAt === null") && !trigger.includes("await markRead(notification.notificationId)"), "bell renders missed items only and does not consume unavailable targets");',
  'check(trigger.includes("row.readAt === null") && trigger.includes("dispatchNotificationTargetV1") && trigger.includes(\'notification.target.kind === "connectivity-warning"\'), "bell preserves exact-target handling while allowing the owner-approved informational offline acknowledgement");'
]]);
runAdapted("phase2-browser", "scripts/spec0014-notifications/phase2BrowserProof.ts", 'resolve("output/spec0014/phase2/browser")', 'resolve("output/spec0014/phase4/protected-regressions/phase2-browser")', [`--url=${url}`]);
const oracle = JSON.parse(readFileSync(resolve(outputRoot, "phase2-oracle/oracle.json"), "utf8")) as { status: string; assertions: number };
const browser = JSON.parse(readFileSync(resolve(outputRoot, "phase2-browser/result.json"), "utf8")) as { status: string; assertionCount: number; assistantPosts: number; terraPosts: number; realProviderCalls: number; paidCalls: number; externalRequests: unknown[]; errors: unknown[] };
assert.equal(oracle.status, "PASS");
assert.equal(browser.status, "PASS");
assert.equal(browser.assertionCount, 42);
assert.equal(browser.assistantPosts, 9);
assert.equal(browser.terraPosts, 7);
assert.equal(browser.realProviderCalls, 0);
assert.equal(browser.paidCalls, 0);
assert.deepEqual(browser.externalRequests, []);
assert.deepEqual(browser.errors, []);

const result = {
  schema: "spec0014-phase4-protected-regressions/v1",
  status: "PASS",
  base,
  protectedRuntime: { status: "BYTE_IDENTICAL", paths: protectedHashes.length, files: protectedHashes, aggregateSha256: sha256(JSON.stringify(protectedHashes)) },
  acceptedPhase2: { oracleAssertions: oracle.assertions, browserAssertions: browser.assertionCount, assistantExplicitPosts: browser.assistantPosts, terraExplicitPosts: browser.terraPosts },
  export: { runtimeByteIdentical: true, notificationProducerAdded: false, backgroundCoordinatorAdded: false },
  networkRequestCount: 0,
  realProviderCalls: 0,
  paidCalls: 0,
};
writeFileSync(resolve(outputRoot, "result.json"), `${JSON.stringify(result, null, 2)}\n`);
process.stdout.write(`SPEC-0014 Phase 4 protected regressions PASS (${browser.assertionCount} accepted Phase 2 browser assertions)\n`);
