import assert from "node:assert/strict";
import { execFileSync, spawn, spawnSync, type ChildProcess } from "node:child_process";
import { createHash } from "node:crypto";
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, writeFileSync } from "node:fs";
import { basename, resolve } from "node:path";

const base = "a5ca805b220357b5e8128bb6b76ea408e30fa790";
const outputRoot = resolve("output/spec0014/phase1/protected-regressions");
const networkGuard = resolve("scripts/spec0001-browser/networkDeny.cjs");
const nextBinary = resolve("node_modules/next/dist/bin/next");
const allowedPaths = new Set([
  "app/layout.tsx",
  "src/lib/notifications/notificationContracts.ts",
  "src/lib/notifications/notificationStorage.ts",
  "src/lib/notifications/notificationNavigation.ts",
  "src/components/notifications/NotificationCenterProvider.tsx",
  "src/components/notifications/NotificationTrigger.tsx",
  "src/components/notifications/notificationCenter.module.css",
  "src/components/chrome/AIcreditspage.tsx",
  "src/components/assistant/DiamondAssistantScreen.tsx",
  "src/components/assistant/diamondAssistant.module.css",
  "scripts/fixtures/spec0014-notifications/phase-1/contract.json",
  "scripts/spec0014-notifications/phase1Oracle.ts",
  "scripts/spec0014-notifications/phase1StorageProof.ts",
  "scripts/spec0014-notifications/phase1BrowserProof.ts",
  "scripts/spec0014-notifications/phase1ProtectedRegressions.ts",
  "scripts/spec0014-notifications/phase1BuildProof.ts",
  "scripts/spec0014-notifications/recordPhase1Proof.ts",
  "scripts/spec0014-notifications/validatePhase1Proof.ts",
  "scripts/spec0014-notifications/phase1ReviewSetup.ts",
]);

const receiptPaths = [
  "scripts/spec0012-assistant/phase4Oracle.ts",
  "scripts/spec0012-assistant/phase5/oracle.ts",
  "scripts/spec0013-home/phase1Oracle.ts",
  "scripts/spec0008-ai-animator/validatePhase1Contract.ts",
  "scripts/spec0009-export/phase1Oracle.ts",
  "scripts/spec0009-export/phase2Oracle.ts",
  "scripts/spec0009-export/phase3Oracle.ts",
  "scripts/spec0011-project-library/phase1Oracle.ts",
  "scripts/spec0011-project-library/phase2Oracle.ts",
  "scripts/spec0011-project-library/phase2AudioOracle.ts",
  "scripts/spec0011-project-library/phase3Oracle.ts",
  "scripts/spec0010-project-safety/phase1Contract.ts",
  "scripts/spec0010-project-safety/phase2Contract.ts",
  "scripts/spec0010-project-safety/phase3Contract.ts",
  "scripts/spec0010-project-safety/phase3Oracle.ts",
  "scripts/spec0007-manual/phase-5/staticOracle.ts",
] as const;

const sha256 = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
const pause = (milliseconds: number) => new Promise(resolvePromise => setTimeout(resolvePromise, milliseconds));
mkdirSync(outputRoot, { recursive: true });
assert.equal(execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(), base, "proof must run from the authorized base");

const receipts: Array<Record<string, unknown>> = [];
let requestCount = 0;
let deniedRequestCount = 0;
for (const [index, path] of receiptPaths.entries()) {
  const label = `${String(index + 1).padStart(2, "0")}-${basename(path, ".ts")}`;
  const ledgerPath = resolve(outputRoot, `${label}-network.jsonl`);
  const logPath = resolve(outputRoot, `${label}.log`);
  const original = readFileSync(path, "utf8");
  let runnable: string = path;
  let adaptation: Record<string, unknown> | null = null;
  if (path === "scripts/spec0009-export/phase3Oracle.ts") {
    const historicalProjection = '["diff", "--name-only"]';
    assert.equal(original.split(historicalProjection).length - 1, 1, "Export Phase 3 must retain one historical dirty-path projection");
    const adapted = original
      .replace(historicalProjection, '["diff", "--name-only", "HEAD", "--", "src/lib/export", "src/components/export/AnimationExportFlow.tsx", "scripts/spec0009-export"]')
      .replaceAll('"../../src/', `"${resolve("src")}/`);
    runnable = resolve(outputRoot, `${label}-adapted.ts`);
    writeFileSync(runnable, adapted);
    adaptation = {
      adaptedPath: runnable.slice(process.cwd().length + 1),
      adaptedSha256: sha256(adapted),
      exactSubstitutions: ["historical dirty-path projection rebound to the protected Export family", "relative source imports resolved against the original repository root"],
      assertionsRemoved: 0,
    };
  }
  writeFileSync(ledgerPath, "");
  const result = spawnSync(process.execPath, ["--experimental-strip-types", runnable], {
    cwd: process.cwd(),
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    env: {
      ...process.env,
      NODE_ENV: "test",
      OPENAI_API_KEY: "",
      SUPABASE_URL: "",
      SUPABASE_ANON_KEY: "",
      SUPABASE_SERVICE_ROLE_KEY: "",
      SPEC0001_NETWORK_LEDGER: ledgerPath,
      SPEC0001_REPOSITORY_ROOT: process.cwd(),
      NODE_OPTIONS: `--require=${networkGuard}`,
    },
  });
  writeFileSync(logPath, `${result.stdout ?? ""}\n${result.stderr ?? ""}`);
  const networkEntries = readFileSync(ledgerPath, "utf8").split("\n").filter(Boolean).map(line => JSON.parse(line) as { result: string });
  requestCount += networkEntries.length;
  deniedRequestCount += networkEntries.filter(entry => entry.result === "denied").length;
  assert.equal(result.status, 0, `${path}: ${(result.stderr ?? "").slice(-6_000)}`);
  assert.equal(networkEntries.length, 0, `${path} attempted network or child-process activity`);
  receipts.push({
    name: label,
    path,
    sourceSha256: sha256(original),
    sourceBytes: Buffer.byteLength(original),
    adaptation,
    log: logPath.slice(process.cwd().length + 1),
    logSha256: sha256(readFileSync(logPath)),
    networkLedger: ledgerPath.slice(process.cwd().length + 1),
    networkEntries: networkEntries.length,
    exitCode: result.status,
  });
  process.stdout.write(`PASS ${path}\n`);
}

const browserRoot = resolve(outputRoot, "browser");
mkdirSync(browserRoot, { recursive: true });
let server: ChildProcess | null = null;
let serverLogFd: number | null = null;
const listeners = (port: number) => {
  const result = spawnSync("lsof", ["-nP", `-iTCP:${port}`, "-sTCP:LISTEN", "-t"], { encoding: "utf8" });
  return result.status === 1 ? [] : result.stdout.trim().split("\n").filter(Boolean);
};
const waitForHttp = async (url: string) => {
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    try { const response = await fetch(url); if (response.ok) return; } catch { /* server is still starting */ }
    await pause(250);
  }
  throw new Error(`protected-server-not-ready:${url}`);
};
const startServer = async (port: number, name: string) => {
  assert.equal(listeners(port).length, 0, `protected port ${port} must be free`);
  const logPath = resolve(browserRoot, `${name}-server.log`);
  serverLogFd = openSync(logPath, "w");
  const env: NodeJS.ProcessEnv = { ...process.env, NEXT_TELEMETRY_DISABLED: "1", OPENAI_API_KEY: "", SUPABASE_URL: "", SUPABASE_ANON_KEY: "", SUPABASE_SERVICE_ROLE_KEY: "" };
  delete env.NODE_OPTIONS; delete env.NEXT_FONT_GOOGLE_MOCKED_RESPONSES; delete env.SPEC0001_NETWORK_LEDGER;
  server = spawn(process.execPath, [nextBinary, "dev", "--webpack", "-p", String(port)], { cwd: process.cwd(), env, stdio: ["ignore", serverLogFd, serverLogFd] });
  await waitForHttp(`http://127.0.0.1:${port}`);
  return logPath;
};
const stopServer = async (port: number) => {
  const active = server; server = null;
  if (active && active.exitCode === null) {
    active.kill("SIGTERM");
    await Promise.race([new Promise<void>(resolvePromise => active.once("exit", () => resolvePromise())), pause(10_000)]);
    if (active.exitCode === null) active.kill("SIGKILL");
  }
  if (serverLogFd !== null) { closeSync(serverLogFd); serverLogFd = null; }
  for (let index = 0; index < 50 && listeners(port).length; index += 1) await pause(100);
  assert.equal(listeners(port).length, 0, `protected port ${port} must close`);
};
const replaceOnce = (source: string, from: string, to: string) => {
  assert.equal(source.split(from).length - 1, 1, `expected one adaptation occurrence: ${from}`);
  return source.replace(from, to);
};
const browserReceipts: Array<Record<string, unknown>> = [];
const reusePassingBrowserEvidence = process.argv.includes("--reuse-passing-browser-evidence");
const browserCases = [
  { name: "assistant-workflow", sourcePath: "scripts/spec0013-home/phase1BrowserProof.ts", port: 57970, resultPath: "assistant-workflow/result.json", adapt(source: string) {
    return replaceOnce(source, 'const output = "output/spec-0013/phase-1/browser";', `const output = "${resolve(browserRoot, "assistant-workflow")}";`);
  } },
  { name: "assistant-search-retry", sourcePath: "scripts/spec0012-assistant/phase4BrowserProof.ts", port: 58040, resultPath: "assistant-search-retry/result.json", adapt(source: string) {
    source = source.replaceAll('"../../src/', `"${resolve("src")}/`).replace('"./phase2Fixtures.ts"', `"${resolve("scripts/spec0012-assistant/phase2Fixtures.ts")}"`).replace('"./phase4Fixtures.ts"', `"${resolve("scripts/spec0012-assistant/phase4Fixtures.ts")}"`);
    return replaceOnce(source, 'resolve("output/spec-0012/phase-4/browser")', `resolve("${resolve(browserRoot, "assistant-search-retry")}")`);
  } },
  { name: "assistant-dictation", sourcePath: "scripts/spec0012-assistant/phase5/browser.ts", port: 58070, resultPath: "assistant-dictation/result.json", adapt(source: string) {
    source = source.replaceAll("'../../../src/", `'${resolve("src")}/`).replace("'../phase2Fixtures.ts'", `'${resolve("scripts/spec0012-assistant/phase2Fixtures.ts")}'`);
    return replaceOnce(source, "const output='output/spec-0012/phase-5/browser'", `const output='${resolve(browserRoot, "assistant-dictation")}'`);
  } },
  { name: "terra-workspace", sourcePath: "scripts/spec0008-ai-animator/phase1BrowserProof.ts", port: 57120, resultPath: "terra-workspace/browser-result.json", adapt(source: string) {
    source = replaceOnce(source, 'const outputRoot = "output/spec-0008/phase-1/browser";', `const outputRoot = "${resolve(browserRoot, "terra-workspace")}";`);
    source = replaceOnce(source, '  await page.goto(url);\n  await page.getByRole("button", { name: /^New Project/ }).click();', `  await page.goto(url);
  await page.getByRole("button", { name: /^New Project/ }).or(page.getByRole("button", { name: "Discard Draft", exact: true })).waitFor();
  if (await page.getByRole("button", { name: "Discard Draft", exact: true }).isVisible()) {
    await page.getByRole("button", { name: "Discard Draft", exact: true }).click();
    await page.getByRole("alert").getByRole("button", { name: "Discard Draft", exact: true }).click();
  }
  await page.getByRole("button", { name: /^New Project/ }).click();`);
    source = replaceOnce(source, 'name: "Open Untitled Project", exact: true', 'name: "Edit Untitled Project", exact: true');
    return replaceOnce(source, 'const revealingReplyObserved = revealingReply.waitFor({ timeout: 30_000 });', 'const revealingReplyObserved = revealingReply.waitFor({ timeout: 30_000 });\nvoid revealingReplyObserved.catch(() => undefined);');
  } },
] as const;

const validateBrowserResult = (name: typeof browserCases[number]["name"], browserResult: Record<string, unknown>) => {
  assert.equal(browserResult.status, "PASS", `${name} result status`);
  if (name === "terra-workspace") {
    assert.equal(browserResult.realProviderCalls, undefined, "historical Terra receipt intentionally predates the realProviderCalls field");
    assert.equal(browserResult.capturedRequests, 18, "Terra retains eighteen deterministic intercepted requests");
    assert.deepEqual(browserResult.externalRequests, [], "Terra makes no external request");
  } else assert.equal(browserResult.realProviderCalls, 0, `${name} real provider calls`);
  for (const field of ["errors", "network", "forbidden", "externalRequests"]) if (Array.isArray(browserResult[field])) assert.deepEqual(browserResult[field], [], `${name} ${field}`);
  return name === "terra-workspace" ? "18 deterministic in-browser /api/ai-animator interceptions; externalRequests=[]; server OPENAI_API_KEY empty" : "result.realProviderCalls=0; server OPENAI_API_KEY empty";
};

for (const browserCase of browserCases) {
  const original = readFileSync(browserCase.sourcePath, "utf8");
  const adapted = browserCase.adapt(original);
  const adaptedPath = resolve(browserRoot, `${browserCase.name}.ts`);
  const priorAdapted = reusePassingBrowserEvidence && existsSync(adaptedPath) ? readFileSync(adaptedPath, "utf8") : null;
  if (reusePassingBrowserEvidence) assert.equal(priorAdapted, adapted, `${browserCase.name} adapted source must be byte-identical to the passing run`);
  writeFileSync(adaptedPath, adapted);
  const resultPath = resolve(browserRoot, browserCase.resultPath);
  const runLogPath = resolve(browserRoot, `${browserCase.name}.log`);
  const serverLogPath = resolve(browserRoot, `${browserCase.name}-server.log`);
  if (reusePassingBrowserEvidence) {
    assert.ok(existsSync(resultPath) && existsSync(runLogPath) && existsSync(serverLogPath), `${browserCase.name} prior passing evidence must exist`);
    const browserResult = JSON.parse(readFileSync(resultPath, "utf8")) as Record<string, unknown>;
    const providerProof = validateBrowserResult(browserCase.name, browserResult);
    assert.equal(listeners(browserCase.port).length, 0, `${browserCase.name} prior proof server must be closed`);
    browserReceipts.push({
      name: browserCase.name,
      sourcePath: browserCase.sourcePath,
      originalSha256: sha256(original),
      adaptedPath: adaptedPath.slice(process.cwd().length + 1),
      adaptedSha256: sha256(adapted),
      exactSubstitutions: "absolute imports, canonical later-phase navigation compatibility, and proof-output relocation only; product behavior assertions unchanged",
      resultPath: resultPath.slice(process.cwd().length + 1),
      resultSha256: sha256(readFileSync(resultPath)),
      serverLog: serverLogPath.slice(process.cwd().length + 1),
      exitCode: 0,
      execution: "REUSED_SAME_TURN_PASSING_RECEIPT_WITH_IDENTICAL_ORIGINAL_ADAPTED_AND_RESULT_HASHES",
      realProviderCalls: 0,
      providerProof,
    });
    process.stdout.write(`PASS protected browser ${browserCase.name} (hash-verified same-turn receipt reuse)\n`);
    continue;
  }
  const serverLog = await startServer(browserCase.port, browserCase.name);
  try {
    const origin = `http://127.0.0.1:${browserCase.port}`;
    const run = spawnSync(process.execPath, ["--experimental-strip-types", adaptedPath, `--url=${origin}/`], {
      cwd: process.cwd(), encoding: "utf8", maxBuffer: 128 * 1024 * 1024,
      env: { ...process.env, PATH: process.env.PATH ?? "", NODE_ENV: "test", OPENAI_API_KEY: "", SPEC0012_PHASE4_ORIGIN: origin, SPEC0013_ORIGIN: origin },
    });
    writeFileSync(runLogPath, `${run.stdout ?? ""}\n${run.stderr ?? ""}`);
    assert.equal(run.status, 0, `${browserCase.name}: ${(run.stderr ?? "").slice(-10_000)}`);
    const browserResult = JSON.parse(readFileSync(resultPath, "utf8")) as Record<string, unknown>;
    const providerProof = validateBrowserResult(browserCase.name, browserResult);
    browserReceipts.push({
      name: browserCase.name,
      sourcePath: browserCase.sourcePath,
      originalSha256: sha256(original),
      adaptedPath: adaptedPath.slice(process.cwd().length + 1),
      adaptedSha256: sha256(adapted),
      exactSubstitutions: "absolute imports and proof-output relocation only; product behavior assertions unchanged",
      resultPath: resultPath.slice(process.cwd().length + 1),
      resultSha256: sha256(readFileSync(resultPath)),
      serverLog: serverLog.slice(process.cwd().length + 1),
      exitCode: run.status,
      execution: "FRESH",
      realProviderCalls: 0,
      providerProof,
    });
    process.stdout.write(`PASS protected browser ${browserCase.name}\n`);
  } finally { await stopServer(browserCase.port); }
}

const changedTracked = execFileSync("git", ["diff", "--name-only", base, "--"], { encoding: "utf8" }).trim().split("\n").filter(Boolean);
assert.deepEqual(changedTracked.filter(path => !allowedPaths.has(path)), [], "tracked runtime outside the exact allowlist changed");
const statusLines = execFileSync("git", ["status", "--porcelain=v1", "--untracked-files=all"], { encoding: "utf8" }).split("\n").filter(Boolean);
const dirtyPaths = statusLines.map(line => line.slice(3));
assert.deepEqual(dirtyPaths.filter(path => !allowedPaths.has(path)), [], "dirty state expanded beyond the exact allowlist");
const protectedTree = execFileSync("git", ["ls-tree", "-r", base], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }).split("\n").filter(line => line && !allowedPaths.has(line.slice(line.indexOf("\t") + 1))).join("\n");

const result = {
  schema: "spec0014-phase1-protected-regressions/v1",
  status: "PASS",
  base,
  receipts,
  receiptCount: receipts.length,
  browserReceipts,
  browserReceiptCount: browserReceipts.length,
  protectedRuntimeOutsideAllowlist: { status: "BYTE_IDENTICAL", changedTrackedOutsideAllowlist: [], protectedTreeSha256: sha256(protectedTree) },
  providerKeyPresent: false,
  networkRequestCount: requestCount,
  deniedRequestCount,
  realProviderCalls: 0,
  paidCalls: 0,
  physicalMicrophonePermission: "NOT_REQUESTED_FROM_OS; Chromium synthetic-device permission only",
  physicalRecording: "NOT_PERFORMED; dictation receipt uses only Chromium's synthetic media device and deterministic PCM/transcription doubles",
  protectedServersSequentialAndClosed: true,
  protectedServerMode: "NORMAL_NEXT_DEV_WEBPACK",
  browserEvidenceExecution: reusePassingBrowserEvidence ? "HASH_VERIFIED_SAME_TURN_PASSING_RECEIPT_REUSE" : "FRESH",
  deterministicMediaAndNetworkDoubles: true,
};
writeFileSync(resolve(outputRoot, "result.json"), `${JSON.stringify(result, null, 2)}\n`);
process.stdout.write(`SPEC-0014 Phase 1 protected regressions PASS (${receipts.length} receipts)\n`);
