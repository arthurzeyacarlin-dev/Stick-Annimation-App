import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFileSync, mkdirSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const base = "02a80577f562e9524d2e177c222d19f99f517278";
const root = process.cwd();
const output = resolve("output/spec0015/phase2/build");
const scratch = "/private/tmp/spec0015-phase2-build-ca0f";
const baseDir = resolve(scratch, "base");
const resultDir = resolve(scratch, "result");
const node = process.execPath;
const tsc = resolve("node_modules/typescript/bin/tsc");
const eslint = resolve("node_modules/eslint/bin/eslint.js");
const next = resolve("node_modules/next/dist/bin/next");
const networkLedger = resolve(output, "network.jsonl");
const guarded = resolve("scripts/spec0001-browser/networkDeny.cjs");
const runtime = [
  "app/api/ai-animator/route.ts",
  "app/api/diamond-assistant-transcription/route.ts",
  "app/api/diamond-assistant/route.ts",
  "app/api/usage-journal/route.ts",
  "src/lib/ai/aiAnimatorJobService.ts",
  "src/lib/assistant/assistantJobService.ts",
  "src/lib/assistant/assistantProvider.ts",
  "src/lib/assistant/assistantTranscriptionService.ts",
  "src/lib/openai/generateAiAnimatorReply.ts",
  "src/lib/usage-journal/usageJournalContract.ts",
  "src/lib/usage-journal/usageJournalEvents.ts",
  "src/lib/usage-journal/usageJournalProjection.ts",
  "src/lib/usage-journal/usageJournalRuntime.ts",
  "src/lib/usage-journal/usageJournalStore.ts",
];
const focusedPaths = [...runtime, "scripts/spec0015-dashboard/phase2BuildProof.ts", "scripts/spec0015-dashboard/phase2BrowserProof.ts",
  "scripts/spec0015-dashboard/phase2Oracle.ts", "scripts/spec0015-dashboard/phase2ProtectedRegressions.ts",
  "scripts/spec0015-dashboard/phase2RuntimeProof.ts", "scripts/spec0015-dashboard/recordPhase2Proof.ts",
  "scripts/spec0015-dashboard/validatePhase2Proof.ts"];
const buildPaths = [
  "app/page.tsx", "app/assistant/page.tsx", "app/credits/page.tsx", "app/layout.tsx",
  "app/api/ai-animator/route.ts", "app/api/diamond-assistant/route.ts",
  "app/api/diamond-assistant-transcription/route.ts", "app/api/usage-journal/route.ts",
];
const sha = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");
mkdirSync(output, { recursive: true });
rmSync(scratch, { recursive: true, force: true });
mkdirSync(baseDir, { recursive: true });
mkdirSync(resultDir, { recursive: true });
writeFileSync(networkLedger, "");

const fontFixture = JSON.parse(readFileSync("scripts/fixtures/spec0001-browser/v1/next-font-google-response.json", "utf8")) as {
  responses: Array<{ url: string; family: string; faces: Array<{ file: string; sha256: string; subset: string; unicodeRange: string }> }>;
};
const fontResponses: Record<string, string> = {};
for (const response of fontFixture.responses) {
  fontResponses[response.url] = response.faces.map((face) => {
    const bytes = readFileSync(face.file);
    assert.equal(`sha256:${sha(bytes)}`, face.sha256);
    return `/* ${face.subset} */\n@font-face { font-family: '${response.family}'; font-style: normal; font-weight: 100 900; font-display: swap; src: url(${resolve(face.file)}) format('woff2'); unicode-range: ${face.unicodeRange}; }`;
  }).join("\n");
}
const fontPath = resolve(output, "font-responses.cjs");
writeFileSync(fontPath, `module.exports = ${JSON.stringify(fontResponses)};\n`);
const environment = {
  ...process.env,
  NEXT_TELEMETRY_DISABLED: "1",
  NEXT_FONT_GOOGLE_MOCKED_RESPONSES: fontPath,
  OPENAI_API_KEY: "",
  SUPABASE_URL: "",
  SUPABASE_ANON_KEY: "",
  SUPABASE_SERVICE_ROLE_KEY: "",
  SPEC0001_NETWORK_LEDGER: networkLedger,
  SPEC0001_REPOSITORY_ROOT: dirname(realpathSync("node_modules")),
  NODE_OPTIONS: `--require=${guarded}`,
};
type Run = { label: string; exitCode: number; signal: string | null; log: string; timedOut: boolean };
const commands: Run[] = [];
function run(label: string, executable: string, args: string[], cwd = root, timeout = 180_000): Run {
  const result = spawnSync(executable, args, {
    cwd,
    env: environment,
    encoding: "utf8",
    maxBuffer: 128 * 1024 * 1024,
    timeout,
    killSignal: "SIGTERM",
  });
  const log = resolve(output, `${label}.log`);
  writeFileSync(log, `${result.stdout ?? ""}\n${result.stderr ?? ""}`);
  const item = {
    label,
    exitCode: result.status ?? -1,
    signal: result.signal,
    log: log.slice(root.length + 1),
    timedOut: Boolean(result.error && "code" in result.error && result.error.code === "ETIMEDOUT"),
  };
  commands.push(item);
  console.log(`${label}: ${item.exitCode === 0 ? "PASS" : "MEASURED FAILURE"}`);
  return item;
}

assert.equal(run("typescript", node, [tsc, "--noEmit"]).exitCode, 0, "TypeScript compile");
assert.equal(run("focused-lint", node, [eslint, ...focusedPaths]).exitCode, 0, "focused lint");

const archive = spawnSync("git", ["archive", base], { cwd: root, maxBuffer: 128 * 1024 * 1024 });
assert.equal(archive.status, 0, archive.stderr?.toString());
for (const directory of [baseDir, resultDir]) {
  const extract = spawnSync("tar", ["-x", "-C", directory], { input: archive.stdout, maxBuffer: 128 * 1024 * 1024 });
  assert.equal(extract.status, 0, extract.stderr?.toString());
  symlinkSync(resolve("node_modules"), resolve(directory, "node_modules"), "dir");
}
for (const path of runtime) {
  mkdirSync(dirname(resolve(resultDir, path)), { recursive: true });
  copyFileSync(resolve(path), resolve(resultDir, path));
}
type LintMessage = { path: string; line: number; column: number; ruleId: string | null; message: string };
function lintJson(label: string, cwd: string): LintMessage[] {
  const result = spawnSync(node, [eslint, ".", "--format", "json"], {
    cwd,
    env: environment,
    encoding: "utf8",
    maxBuffer: 128 * 1024 * 1024,
    timeout: 180_000,
  });
  const raw = result.stdout ?? "[]";
  writeFileSync(resolve(output, `${label}.json`), raw);
  const entries = JSON.parse(raw) as Array<{ filePath: string; messages: Array<{ severity: number; line: number; column: number; ruleId: string | null; message: string }> }>;
  return entries.flatMap((entry) => entry.messages.filter((message) => message.severity === 2).map((message) => ({
    path: entry.filePath.slice(cwd.length + 1),
    line: message.line,
    column: message.column,
    ruleId: message.ruleId,
    message: message.message,
  }))).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
}
const baselineErrors = lintJson("full-lint-base", baseDir);
const currentErrors = lintJson("full-lint-result", root);
const changedPathErrors = currentErrors.filter((item) => focusedPaths.some((path) => item.path === path || item.path.startsWith(`${path}/`)));
assert.deepEqual(changedPathErrors, [], "new implementation lint diagnostics");

const focused = run("focused-build", node, [next, "build", "--webpack", "--debug-build-paths", buildPaths.join(",")], resultDir, 240_000);
assert.equal(focused.exitCode, 0, `focused build: ${readFileSync(resolve(output, "focused-build.log"), "utf8").slice(-8000)}`);
const baselineFull = run("full-build-base", node, [next, "build", "--webpack"], baseDir, 240_000);
const resultFull = run("full-build-result", node, [next, "build", "--webpack"], resultDir, 240_000);
assert.equal(baselineFull.timedOut || resultFull.timedOut, false, "full build must finish or fail diagnostically");
const baselineLog = readFileSync(resolve(output, "full-build-base.log"), "utf8");
const resultLog = readFileSync(resolve(output, "full-build-result.log"), "utf8");
const blocker = "app/dev/ai-costs/lifetime/page.tsx";
const diagnostic = (log: string) => log.match(/app\/dev\/ai-costs\/lifetime\/page\.tsx\nType error:[\s\S]*?\n\nNext\.js build worker exited with code: 1 and signal: null/)?.[0] ?? null;
if (baselineFull.exitCode !== 0 || resultFull.exitCode !== 0) {
  assert.notEqual(baselineFull.exitCode, 0, "baseline/result full-build parity");
  assert.notEqual(resultFull.exitCode, 0, "baseline/result full-build parity");
  assert.ok(diagnostic(baselineLog) && diagnostic(resultLog), "expected inherited dev-cost PageProps blocker");
  assert.equal(diagnostic(baselineLog), diagnostic(resultLog), "full-build diagnostic parity");
}
const baseBlocker = spawnSync("git", ["show", `${base}:${blocker}`], { cwd: root });
assert.equal(baseBlocker.status, 0);
assert.deepEqual(readFileSync(blocker), baseBlocker.stdout, "inherited blocker source byte identity");
const networkEntries = readFileSync(networkLedger, "utf8").split("\n").filter(Boolean).map((line) => JSON.parse(line) as { result: string });
assert.deepEqual(networkEntries.filter((entry) => entry.result === "denied"), [], "build/lint attempted external network");
const proof = {
  schema: "spec0015-phase2-build-proof/v1",
  status: "PASS",
  base,
  commands,
  focusedReachability: buildPaths,
  focusedBuild: "PASS",
  fullLint: { baselineErrors: baselineErrors.length, resultErrors: currentErrors.length, changedPathErrors: changedPathErrors.length },
  fullBuild: {
    status: resultFull.exitCode === 0 ? "PASS" : "BLOCKED_BY_VERIFIED_BASELINE",
    baselineExitCode: baselineFull.exitCode,
    resultExitCode: resultFull.exitCode,
    diagnosticIdentical: diagnostic(baselineLog) === diagnostic(resultLog),
    blocker,
    blockerByteIdentical: true,
    productionReady: resultFull.exitCode === 0,
  },
  network: { entries: networkEntries.length, denied: 0, providerCalls: 0, paidCalls: 0 },
};
writeFileSync(resolve(output, "build.json"), `${JSON.stringify(proof, null, 2)}\n`);
rmSync(scratch, { recursive: true, force: true });
console.log(`SPEC-0015 Phase 2 build proof PASS; full build ${proof.fullBuild.status}`);
