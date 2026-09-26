import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const base = "57f3a8560dc61f79db87c13dbff7285684b74793";
const outputRoot = resolve("output/spec0014/phase4/build");
const lintPaths = [
  "src/lib/notifications/notificationContracts.ts",
  "src/lib/notifications/notificationStorage.ts",
  "src/lib/notifications/offlineIncidentObserver.ts",
  "src/components/notifications/NotificationCenterProvider.tsx",
  "src/components/notifications/NotificationTrigger.tsx",
  "scripts/spec0014-notifications/phase4Oracle.ts",
  "scripts/spec0014-notifications/phase4BrowserProof.ts",
  "scripts/spec0014-notifications/phase4ProtectedRegressions.ts",
  "scripts/spec0014-notifications/phase4BuildProof.ts",
  "scripts/spec0014-notifications/phase4ReviewSetup.ts",
  "scripts/spec0014-notifications/recordPhase4Proof.ts",
  "scripts/spec0014-notifications/validatePhase4Proof.ts"
];
mkdirSync(outputRoot, { recursive: true });
let adapted = readFileSync("scripts/spec0014-notifications/phase1BuildProof.ts", "utf8");
adapted = adapted.replace('const base = "a5ca805b220357b5e8128bb6b76ea408e30fa790";', `const base = "${base}";`);
adapted = adapted.replace('resolve("output/spec0014/phase1/build")', 'resolve("output/spec0014/phase4/build")');
adapted = adapted.replace(/const focusedLintPaths = \[[\s\S]*?\n\];\nconst focusedBuildPaths/, `const focusedLintPaths = ${JSON.stringify(lintPaths, null, 2)};\nconst focusedBuildPaths`);
adapted = adapted.replace('const baselineCopy = "/private/tmp/spec0014-phase1-base-build";', 'const baselineCopy = "/private/tmp/spec0014-phase4-base-build";');
adapted = adapted.replaceAll("spec0014-phase1-build-proof/v1", "spec0014-phase4-build-proof/v1");
adapted = adapted.replaceAll("SPEC-0014 Phase 1 build checks", "SPEC-0014 Phase 4 build checks");
const runner = resolve(outputRoot, "runner-adapted.ts");
writeFileSync(runner, adapted);
const run = spawnSync(process.execPath, ["--experimental-strip-types", runner], { cwd: process.cwd(), encoding: "utf8", maxBuffer: 128 * 1024 * 1024, timeout: 900_000 });
writeFileSync(resolve(outputRoot, "runner.log"), `${run.stdout ?? ""}\n${run.stderr ?? ""}`);
rmSync(runner);
assert.equal(run.status, 0, (run.stderr ?? run.stdout ?? "").slice(-20_000));
process.stdout.write(run.stdout ?? "");
