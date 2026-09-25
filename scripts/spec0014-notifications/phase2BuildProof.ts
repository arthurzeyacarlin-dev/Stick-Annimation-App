import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const base = "acd4031cade0e4e960223190a8c1645d007d61af";
const outputRoot = resolve("output/spec0014/phase2/build");
const lintPaths = [
  "app/page.tsx", "src/components/assistant/AssistantConversation.tsx", "src/components/assistant/DiamondAssistantScreen.tsx", "src/components/assistant/useAssistantSessions.ts",
  "src/components/notifications/NotificationCenterProvider.tsx", "src/components/notifications/NotificationTrigger.tsx", "src/components/workspace/DrawingWorkspace.tsx",
  "src/components/workspace/ai/DrawingAiPanel.tsx", "src/components/workspace/ai/WorkspaceAiPanelShell.tsx", "src/lib/ai/aiAnimatorStorage.ts",
  "src/lib/notifications/notificationNavigation.ts", "src/lib/notifications/assistantCompletionObserver.ts", "src/lib/notifications/terraCompletionObserver.ts",
  "scripts/spec0014-notifications/phase2BrowserProof.ts", "scripts/spec0014-notifications/phase2Oracle.ts", "scripts/spec0014-notifications/phase2ProtectedRegressions.ts",
  "scripts/spec0014-notifications/phase2BuildProof.ts", "scripts/spec0014-notifications/phase2ReviewSetup.ts", "scripts/spec0014-notifications/recordPhase2Proof.ts", "scripts/spec0014-notifications/validatePhase2Proof.ts",
];
mkdirSync(outputRoot, { recursive: true });
let adapted = readFileSync("scripts/spec0014-notifications/phase1BuildProof.ts", "utf8");
adapted = adapted.replace('const base = "a5ca805b220357b5e8128bb6b76ea408e30fa790";', `const base = "${base}";`);
adapted = adapted.replace('resolve("output/spec0014/phase1/build")', 'resolve("output/spec0014/phase2/build")');
adapted = adapted.replace(/const focusedLintPaths = \[[\s\S]*?\n\];\nconst focusedBuildPaths/, `const focusedLintPaths = ${JSON.stringify(lintPaths, null, 2)};\nconst focusedBuildPaths`);
adapted = adapted.replace('const baselineCopy = "/private/tmp/spec0014-phase1-base-build";', 'const baselineCopy = "/private/tmp/spec0014-phase2-base-build";');
adapted = adapted.replaceAll("spec0014-phase1-build-proof/v1", "spec0014-phase2-build-proof/v1");
adapted = adapted.replaceAll("SPEC-0014 Phase 1 build checks", "SPEC-0014 Phase 2 build checks");
const adaptedPath = resolve(outputRoot, "runner-adapted.ts");
writeFileSync(adaptedPath, adapted);
const run = spawnSync(process.execPath, ["--experimental-strip-types", adaptedPath], { cwd: process.cwd(), encoding: "utf8", maxBuffer: 128 * 1024 * 1024, timeout: 900_000 });
writeFileSync(resolve(outputRoot, "runner.log"), `${run.stdout ?? ""}\n${run.stderr ?? ""}`);
assert.equal(run.status, 0, (run.stderr ?? run.stdout ?? "").slice(-20_000));
process.stdout.write(run.stdout ?? "");
