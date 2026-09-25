import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { dirname, resolve } from "node:path";
import { mkdirSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";

const base = "a5ca805b220357b5e8128bb6b76ea408e30fa790";
const outputRoot = resolve("output/spec0014/phase1/build");
const nextBinary = resolve("node_modules/next/dist/bin/next");
const typescriptBinary = resolve("node_modules/typescript/bin/tsc");
const eslintBinary = resolve("node_modules/eslint/bin/eslint.js");
const networkGuard = resolve("scripts/spec0001-browser/networkDeny.cjs");
const networkLedger = resolve(outputRoot, "network.jsonl");
const focusedLintPaths = [
  "app/layout.tsx",
  "src/lib/notifications/notificationContracts.ts",
  "src/lib/notifications/notificationStorage.ts",
  "src/lib/notifications/notificationNavigation.ts",
  "src/components/notifications/NotificationCenterProvider.tsx",
  "src/components/notifications/NotificationTrigger.tsx",
  "src/components/chrome/AIcreditspage.tsx",
  "src/components/assistant/DiamondAssistantScreen.tsx",
  "scripts/spec0014-notifications/phase1Oracle.ts",
  "scripts/spec0014-notifications/phase1StorageProof.ts",
  "scripts/spec0014-notifications/phase1BrowserProof.ts",
  "scripts/spec0014-notifications/phase1ProtectedRegressions.ts",
  "scripts/spec0014-notifications/phase1BuildProof.ts",
  "scripts/spec0014-notifications/recordPhase1Proof.ts",
  "scripts/spec0014-notifications/validatePhase1Proof.ts",
  "scripts/spec0014-notifications/phase1ReviewSetup.ts",
];
const focusedBuildPaths = ["app/page.tsx", "app/assistant/page.tsx", "app/credits/page.tsx", "app/layout.tsx"];

mkdirSync(outputRoot, { recursive: true });
writeFileSync(networkLedger, "");
rmSync(resolve(".next"), { recursive: true, force: true });
const fontFixture = JSON.parse(readFileSync("scripts/fixtures/spec0001-browser/v1/next-font-google-response.json", "utf8")) as { responses: Array<{ url: string; family: string; faces: Array<{ file: string; sha256: string; subset: string; unicodeRange: string }> }> };
const fontResponses: Record<string, string> = {};
for (const response of fontFixture.responses) {
  fontResponses[response.url] = response.faces.map(face => {
    const bytes = readFileSync(face.file);
    assert.equal(`sha256:${createHash("sha256").update(bytes).digest("hex")}`, face.sha256);
    return `/* ${face.subset} */\n@font-face { font-family: '${response.family}'; font-style: normal; font-weight: 100 900; font-display: swap; src: url(${resolve(face.file)}) format('woff2'); unicode-range: ${face.unicodeRange}; }`;
  }).join("\n");
}
const fontResponsesPath = resolve(outputRoot, "font-responses.cjs");
writeFileSync(fontResponsesPath, `module.exports = ${JSON.stringify(fontResponses)};\n`);

const guardedEnvironment = {
  ...process.env,
  NEXT_TELEMETRY_DISABLED: "1",
  NEXT_FONT_GOOGLE_MOCKED_RESPONSES: fontResponsesPath,
  OPENAI_API_KEY: "",
  SUPABASE_URL: "",
  SUPABASE_ANON_KEY: "",
  SUPABASE_SERVICE_ROLE_KEY: "",
  SPEC0001_NETWORK_LEDGER: networkLedger,
  SPEC0001_REPOSITORY_ROOT: dirname(realpathSync("node_modules")),
  NODE_OPTIONS: `--require=${networkGuard}`,
};

type CommandResult = { label: string; command: string[]; exitCode: number; signal: NodeJS.Signals | null; timedOut: boolean; status: "PASS" | "MEASURED_BASELINE" | "OBSERVED_FAILURE" | "BLOCKED_BY_VERIFIED_BASELINE"; log: string; errors?: number; warnings?: number };
const results: CommandResult[] = [];
function run(label: string, args: string[], options: { measuredOnly?: boolean; cwd?: string; status?: CommandResult["status"]; timeoutMs?: number } = {}) {
  const commandCwd = options.cwd ?? process.cwd();
  const result = spawnSync(process.execPath, args, { cwd: commandCwd, env: guardedEnvironment, encoding: "utf8", maxBuffer: 128 * 1024 * 1024, timeout: options.timeoutMs, killSignal: "SIGTERM" });
  const logPath = resolve(outputRoot, `${label}.log`);
  const log = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
  writeFileSync(logPath, log);
  const summary = log.match(/(\d+) problems? \((\d+) errors?, (\d+) warnings?\)/);
  const receipt: CommandResult = {
    label,
    command: [process.execPath, ...args],
    exitCode: result.status ?? -1,
    signal: result.signal,
    timedOut: Boolean(result.error && "code" in result.error && result.error.code === "ETIMEDOUT"),
    status: options.status ?? (options.measuredOnly ? "MEASURED_BASELINE" : "PASS"),
    log: logPath.slice(process.cwd().length + 1),
    ...(summary ? { errors: Number(summary[2]), warnings: Number(summary[3]) } : {}),
  };
  if (!options.measuredOnly) assert.equal(result.status, 0, `${label}: ${log.slice(-12_000)}`);
  results.push(receipt);
  process.stdout.write(`${receipt.status} ${label}\n`);
  return receipt;
}

run("typescript", [typescriptBinary, "--noEmit"]);
run("focused-lint", [eslintBinary, ...focusedLintPaths]);
const fullLint = run("full-lint", [eslintBinary, "."], { measuredOnly: true });
assert.ok(fullLint.exitCode === 0 || (typeof fullLint.errors === "number" && fullLint.errors > 0), "full lint failure must have a measured ESLint summary");

const baselineCopy = "/private/tmp/spec0014-phase1-base-build";
rmSync(baselineCopy, { recursive: true, force: true }); mkdirSync(baselineCopy, { recursive: true });
const archive = spawnSync("git", ["archive", base], { cwd: process.cwd(), maxBuffer: 128 * 1024 * 1024 });
assert.equal(archive.status, 0, archive.stderr?.toString());
const extract = spawnSync("tar", ["-x", "-C", baselineCopy], { input: archive.stdout, maxBuffer: 128 * 1024 * 1024 });
assert.equal(extract.status, 0, extract.stderr?.toString());
symlinkSync(resolve("node_modules"), resolve(baselineCopy, "node_modules"), "dir");
const lintJson = (cwd: string, label: string) => {
  const result = spawnSync(process.execPath, [eslintBinary, ".", "--format", "json"], { cwd, env: guardedEnvironment, encoding: "utf8", maxBuffer: 128 * 1024 * 1024 });
  const path = resolve(outputRoot, `${label}.json`); writeFileSync(path, result.stdout ?? "[]");
  const entries = JSON.parse(result.stdout || "[]") as Array<{ filePath: string; messages: Array<{ severity: number; line: number; column: number; ruleId: string | null; message: string }> }>;
  return { exitCode: result.status ?? -1, entries };
};
const baselineLint = lintJson(baselineCopy, "full-lint-base");
const resultLint = lintJson(process.cwd(), "full-lint-result");
const normalizeErrors = (entries: typeof baselineLint.entries, root: string) => entries.flatMap(entry => entry.messages.filter(message => message.severity === 2).map(message => ({ path: entry.filePath.slice(root.length + 1), line: message.line, column: message.column, ruleId: message.ruleId, message: message.message }))).sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
const baselineErrors = normalizeErrors(baselineLint.entries, baselineCopy);
const resultErrors = normalizeErrors(resultLint.entries, process.cwd());
assert.deepEqual(resultErrors.filter(error => !focusedLintPaths.includes(error.path)), baselineErrors, "every full-lint error outside the clean focused allowlist must exactly match the authorized base");
assert.deepEqual(resultErrors.filter(error => focusedLintPaths.includes(error.path)), [], "focused implementation paths must add no lint error");
run("focused-build", [nextBinary, "build", "--webpack", "--debug-build-paths", focusedBuildPaths.join(",")]);

const defaultBuild = run("default-turbopack-build", [nextBinary, "build"], { measuredOnly: true, status: "OBSERVED_FAILURE", timeoutMs: 120_000 });
assert.notEqual(defaultBuild.exitCode, 0, "the default Turbopack build unexpectedly passed; update the receipt instead of preserving a false failure claim");

const currentFullBuild = run("full-webpack-build-current", [nextBinary, "build", "--webpack"], { measuredOnly: true, status: "BLOCKED_BY_VERIFIED_BASELINE" });
const baselineFullBuild = run("full-webpack-build-base", [nextBinary, "build", "--webpack"], { measuredOnly: true, cwd: baselineCopy, status: "BLOCKED_BY_VERIFIED_BASELINE" });
assert.notEqual(currentFullBuild.exitCode, 0, "the current full Webpack production build unexpectedly passed; update the receipt instead of preserving a false blocker claim");
assert.notEqual(baselineFullBuild.exitCode, 0, "the exact-base full Webpack production build did not reproduce the current blocker");

const blockedPath = "app/dev/ai-costs/lifetime/page.tsx";
const diagnosticFrom = (label: string) => {
  const log = readFileSync(resolve(outputRoot, `${label}.log`), "utf8").replaceAll(baselineCopy, "<WORKTREE>").replaceAll(process.cwd(), "<WORKTREE>");
  const match = log.match(/app\/dev\/ai-costs\/lifetime\/page\.tsx\nType error:[\s\S]*?\n\nNext\.js build worker exited with code: 1 and signal: null/);
  assert.ok(match, `${label} must contain the inherited PageProps diagnostic`);
  return match[0];
};
const currentDiagnostic = diagnosticFrom("full-webpack-build-current");
const baselineDiagnostic = diagnosticFrom("full-webpack-build-base");
assert.equal(currentDiagnostic, baselineDiagnostic, "current and exact-base full Webpack diagnostics must match exactly");
const currentBlockedBytes = readFileSync(blockedPath);
const baseBlockedFile = spawnSync("git", ["show", `${base}:${blockedPath}`], { cwd: process.cwd(), maxBuffer: 16 * 1024 * 1024 });
assert.equal(baseBlockedFile.status, 0, baseBlockedFile.stderr?.toString());
assert.deepEqual(currentBlockedBytes, baseBlockedFile.stdout, "the blocking unrelated source must be byte-identical to the exact base");
const blockedSourceSha256 = createHash("sha256").update(currentBlockedBytes).digest("hex");
rmSync(baselineCopy, { recursive: true, force: true });

const diffCheck = spawnSync("git", ["diff", "--check"], { cwd: process.cwd(), encoding: "utf8" });
writeFileSync(resolve(outputRoot, "diff-check.log"), `${diffCheck.stdout ?? ""}\n${diffCheck.stderr ?? ""}`);
assert.equal(diffCheck.status, 0, diffCheck.stderr);
const networkEntries = readFileSync(networkLedger, "utf8").split("\n").filter(Boolean).map(line => JSON.parse(line) as { result: string; primitive: string; target: string });
assert.deepEqual(networkEntries.filter(entry => entry.result === "denied"), [], "a build or verification command attempted non-loopback network access");

const proof = {
  schema: "spec0014-phase1-build-proof/v1",
  status: "BLOCKED_BY_VERIFIED_BASELINE",
  base,
  commands: results,
  fullLint: { status: "MEASURED_INHERITED_BASELINE", exitCode: fullLint.exitCode, errors: fullLint.errors ?? 0, warnings: fullLint.warnings ?? 0, baselineExitCode: baselineLint.exitCode, baselineErrors: baselineErrors.length, resultErrors: resultErrors.length, inheritedErrorDiagnosticsEqual: true, focusedImplementationErrors: 0 },
  defaultTurbopackBuild: { status: "OBSERVED_FAILURE", exitCode: defaultBuild.exitCode, signal: defaultBuild.signal, timedOut: defaultBuild.timedOut, timeoutMs: 120_000, log: defaultBuild.log, productionReadyClaim: false },
  fullWebpackProductionBuild: { status: "BLOCKED_BY_VERIFIED_BASELINE", currentExitCode: currentFullBuild.exitCode, baselineExitCode: baselineFullBuild.exitCode, diagnosticIdentical: true, blockedPath, blockedSourceSha256, blockedSourceByteIdenticalToBase: true, currentLog: currentFullBuild.log, baselineLog: baselineFullBuild.log, productionReadyClaim: false },
  diffCheck: "PASS",
  network: { entries: networkEntries.length, denied: 0, ledger: networkLedger.slice(process.cwd().length + 1) },
  providerKeyPresent: false,
  providerRequests: 0,
  fullProductionBuild: "BLOCKED_BY_VERIFIED_BASELINE",
};
writeFileSync(resolve(outputRoot, "result.json"), `${JSON.stringify(proof, null, 2)}\n`);
process.stdout.write("SPEC-0014 Phase 1 build checks complete: FULL BUILD BLOCKED_BY_VERIFIED_BASELINE\n");
