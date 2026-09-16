import assert from "node:assert/strict";
import { mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import {
  BASE_SHA, BUILD_STAMP_PATH, EXACT_ALLOWLIST, MANIFEST_PATH, OUTPUT_ROOT, RECEIPT_IDS, SCOPE_PATH, SPEC_PATH, currentBuildStamp,
  bind, changedLineRanges, createReceipt, currentSourceDigest, digest, git, liveReview,
  receiptPath, validationErrors, writeReceipt, type CommandReceipt, type Manifest, type Receipt,
  producerCommands, aggregateBrowserResults, browserMetricErrors, readContract, VISUAL_INSPECTION_PATH,
  type ProducerResult, type BrowserRunMetrics, type ReceiptId,
} from "./proofContract.ts";
import { runCommand } from "./regressions.ts";

mkdirSync(OUTPUT_ROOT, { recursive: true });

function prepareFontMock(): string {
  const fixture = JSON.parse(readFileSync("scripts/fixtures/spec0001-browser/v1/next-font-google-response.json", "utf8")) as {
    responses: Array<{ url: string; family: string; faces: Array<{ subset: string; file: string; sha256: string; unicodeRange: string }> }>;
  };
  const responses: Record<string, string> = {};
  for (const response of fixture.responses) {
    responses[response.url] = response.faces.map(face => {
      assert.equal(`sha256:${digest(readFileSync(face.file))}`, face.sha256, `font_fixture:${face.file}`);
      return `/* ${face.subset} */\n@font-face { font-family: '${response.family}'; font-style: normal; font-weight: 100 900; font-display: swap; src: url(${resolve(face.file)}) format('woff2'); unicode-range: ${face.unicodeRange}; }`;
    }).join("\n");
  }
  const path = `${OUTPUT_ROOT}/font-responses.cjs`;
  writeFileSync(path, `"use strict";\nmodule.exports = ${JSON.stringify(responses, null, 2)};\n`);
  return resolve(path);
}

function lintFindings(stdoutPath: string): unknown[] {
  const report = JSON.parse(readFileSync(stdoutPath, "utf8")) as Array<{
    filePath: string; messages: Array<{ line: number; endLine?: number; severity: number; ruleId: string | null; message: string }>;
  }>;
  if (!Array.isArray(report)) throw new Error("invalid_full_lint_report");
  const ranges = changedLineRanges();
  const newPaths = new Set(git("ls-files", "--others", "--exclude-standard").split("\n").filter(Boolean));
  return report.flatMap(file => {
    const path = relative(process.cwd(), file.filePath);
    if (!EXACT_ALLOWLIST.includes(path)) return [];
    return file.messages.filter(message => newPaths.has(path) || (ranges.get(path) ?? []).some(([first, last]) => message.line <= last && (message.endLine ?? message.line) >= first)).map(message => ({ path, ...message }));
  });
}

function recordQuality() {
  const sourceDigest = currentSourceDigest();
  const commands: CommandReceipt[] = [];
  const run = (id: string, argv: string[], environment = process.env) => {
    console.log(`Running ${id}`);
    const receipt = runCommand({ id, argv, environment, sourceDigest });
    commands.push(receipt);
    console.log(JSON.stringify({ id, exitCode: receipt.exitCode, elapsedMs: receipt.elapsedMs }));
    return receipt;
  };
  const typecheck = run("typescript", ["./node_modules/.bin/tsc", "--noEmit", "--incremental", "false"]);
  const focused = run("focused-eslint", ["./node_modules/.bin/eslint", ...EXACT_ALLOWLIST.filter(path => /\.[cm]?[jt]sx?$/.test(path))]);
  const full = run("full-eslint", ["./node_modules/.bin/eslint", ".", "--format", "json"]);
  let changedLineFindings: unknown[];
  try { changedLineFindings = lintFindings(full.stdout.path); }
  catch (error) { changedLineFindings = [error instanceof Error ? error.message : String(error)]; }
  const fontMock = prepareFontMock();
  const rawNetworkPath = `${OUTPUT_ROOT}/build-network.jsonl`;
  writeFileSync(rawNetworkPath, "");
  const build = run("production-build", ["node", resolve("node_modules/next/dist/bin/next"), "build", "--webpack", "--debug-build-paths", "app/page.tsx"], {
    ...process.env, NEXT_TELEMETRY_DISABLED: "1", NEXT_FONT_GOOGLE_MOCKED_RESPONSES: fontMock,
    OPENAI_API_KEY: "", SUPABASE_URL: "", SUPABASE_ANON_KEY: "", SUPABASE_SERVICE_ROLE_KEY: "",
    SPEC0001_NETWORK_LEDGER: resolve(rawNetworkPath),
    SPEC0001_REPOSITORY_ROOT: dirname(realpathSync("node_modules")),
    NODE_OPTIONS: `--require=${resolve("scripts/spec0001-browser/networkDeny.cjs")}`,
  });
  const network = readFileSync(rawNetworkPath, "utf8").split("\n").filter(Boolean).map(line => JSON.parse(line) as { result: string; primitive: string; target: string });
  const buildNetworkLedger = `${OUTPUT_ROOT}/build-network.json`;
  writeFileSync(buildNetworkLedger, JSON.stringify(network, null, 2) + "\n");
  const buildNetworkDenied = network.filter(entry => entry.result === "denied").length;
  if (build.exitCode === 0) writeFileSync(BUILD_STAMP_PATH, JSON.stringify(currentBuildStamp(), null, 2) + "\n");
  const diff = run("diff-check", ["git", "diff", "--check"]);
  const index = run("empty-index", ["git", "diff", "--cached", "--exit-code"]);
  const receipt = createReceipt({
    id: "quality",
    checks: [
      { id: "typescript", actual: typecheck.exitCode, expected: 0 },
      { id: "focused-eslint", actual: focused.exitCode, expected: 0 },
      { id: "changed-line-eslint", actual: changedLineFindings, expected: [] },
      { id: "production-build", actual: { exitCode: build.exitCode, networkDenied: buildNetworkDenied }, expected: { exitCode: 0, networkDenied: 0 } },
      { id: "diff-check", actual: diff.exitCode, expected: 0 },
      { id: "empty-index", actual: index.exitCode, expected: 0 },
    ],
    artifacts: [buildNetworkLedger, rawNetworkPath, relative(process.cwd(), fontMock), ...(build.exitCode === 0 ? [BUILD_STAMP_PATH] : [])],
    commands,
    metrics: { changedLineFindings, fullLintExitCode: full.exitCode, buildNetworkLedger, rawNetworkLedger: rawNetworkPath, buildNetworkDenied, typecheckIncremental: false },
    limitations: ["Full lint may retain inherited findings; every changed/new line is independently required to have zero findings."],
  });
  const binding = writeReceipt(receipt);
  console.log(JSON.stringify({ status: receipt.status, receipt: binding }));
  if (receipt.status !== "PASS") process.exitCode = 1;
}

function recordManifest() {
  const url = process.argv.find(argument => argument.startsWith("--url="))?.slice(6);
  if (!url) throw new Error("--url=http://127.0.0.1:<review-port>/ is required");
  const manifest: Manifest = {
    kind: "spec0007-phase1-technical-proof", version: 1,
    status: "PASS", integrity: "VALID", humanAcceptance: "pending Arthur", controlPlaneUpdated: false, published: false,
    baseSha: BASE_SHA, headSha: git("rev-parse", "HEAD").trim(), worktree: process.cwd(),
    indexEmpty: git("diff", "--cached", "--name-only") === "",
    exactDirtyPaths: git("status", "--porcelain=v1", "--untracked-files=all").split("\n").filter(Boolean).map(line => line.slice(3)).sort(),
    allowedPaths: EXACT_ALLOWLIST,
    spec: bind(SPEC_PATH), scope: bind(SCOPE_PATH), sourceBindings: EXACT_ALLOWLIST.map(bind),
    receiptBindings: RECEIPT_IDS.map(id => bind(receiptPath(id))),
    receipts: RECEIPT_IDS.map(id => JSON.parse(readFileSync(receiptPath(id), "utf8")) as Receipt),
    review: liveReview(url),
    limitations: [
      "Human acceptance pending Arthur.",
      "Compact is desktop Chromium emulation; physical phone and native/GPU memory are unproven.",
      "No real provider, paid API, external-service, publication, or later-phase behavior is claimed.",
    ],
  };
  const errors = validationErrors(manifest);
  if (errors.length) {
    manifest.status = "INCOMPLETE";
    manifest.integrity = "UNVALIDATED";
    writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + "\n");
    writeFileSync(`${OUTPUT_ROOT}/incomplete-validation.json`, JSON.stringify({ status: "FAIL", errors }, null, 2) + "\n");
    console.error(JSON.stringify({ status: "INCOMPLETE", errors }));
    process.exitCode = 1;
    return;
  }
  writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + "\n");
  console.log(JSON.stringify({ status: "PASS", integrity: "VALID", manifest: bind(MANIFEST_PATH), next: "Run validateProof.ts --self-test for independent actual-validator mutation replay." }));
}

function runProducers(id: "browser" | "oracles") {
  const url = process.argv.find(value => value.startsWith("--url="))?.slice(6) ?? "http://127.0.0.1:56875/";
  const entries = id === "browser" ? producerCommands("browser", url) : Object.assign({}, ...["raster", "coverage-persistence", "no-loss"].map(value => producerCommands(value as ReceiptId, url))) as ReturnType<typeof producerCommands>;
  const only = process.argv.find(value => value.startsWith("--only="))?.slice(7).split(",");
  const selected = only ?? Object.keys(entries); assert.ok(selected.length && new Set(selected).size === selected.length && selected.every(value => Object.hasOwn(entries, value)));
  const sourceDigest = currentSourceDigest();
  for (const commandId of selected) {
    console.log(`Running ${commandId}`);
    const expected = entries[commandId];
    const command = runCommand({ id: commandId, argv: expected.argv, sourceDigest, timeoutMs: 45 * 60 * 1000 });
    const result = JSON.parse(readFileSync(expected.resultPath, "utf8")) as ProducerResult;
    console.log(JSON.stringify({ commandId, exitCode: command.exitCode, execution: result.execution, elapsedMs: command.elapsedMs }));
    if (command.exitCode !== 0 || result.execution !== "COMPLETE") { process.exitCode = 1; return; }
  }
}

function assembleBrowser() {
  const url = process.argv.find(value => value.startsWith("--url="))?.slice(6); assert.ok(url, "review URL required");
  const expected = producerCommands("browser", url);
  const results = Object.values(expected).map(value => JSON.parse(readFileSync(value.resultPath, "utf8")) as ProducerResult);
  const commands = Object.keys(expected).map(id => JSON.parse(readFileSync(`${OUTPUT_ROOT}/commands/${id}.json`, "utf8")) as CommandReceipt);
  const metrics = aggregateBrowserResults(results, url);
  const artifacts = [...new Set([BUILD_STAMP_PATH, VISUAL_INSPECTION_PATH, ...Object.values(expected).map(value => value.resultPath), ...results.flatMap(result => (result.metrics as BrowserRunMetrics).screenshots.map(value => value.path))])];
  const errors = browserMetricErrors(metrics, artifacts.map(bind));
  const receipt = createReceipt({ id: "browser", commands, artifacts, metrics,
    checks: readContract().receiptChecks.browser.map(id => ({ id, actual: errors.length === 0, expected: true, ...(errors.length ? { note: errors.join(", ") } : {}) })),
    limitations: ["Compact is desktop Chromium emulation; physical phone and native/GPU memory are unproven.", "Human acceptance pending Arthur.", "200% scaling uses CSS zoom, following the inherited browser methodology."],
  });
  console.log(JSON.stringify({ status: receipt.status, errors, receipt: writeReceipt(receipt) })); if (receipt.status !== "PASS") process.exitCode = 1;
}

function assembleOracles() {
  const browser = JSON.parse(readFileSync(receiptPath("browser"), "utf8")) as Receipt; assert.equal(browser.status, "PASS");
  for (const id of ["raster", "coverage-persistence", "no-loss"] as const) {
    const path = producerCommands(id, "")[id].resultPath, result = JSON.parse(readFileSync(path, "utf8")) as ProducerResult;
    const command = JSON.parse(readFileSync(`${OUTPUT_ROOT}/commands/${id}.json`, "utf8")) as CommandReceipt;
    assert.equal(result.execution, "COMPLETE"); assert.equal(result.sourceDigestBefore, currentSourceDigest()); assert.equal(result.sourceDigestAfter, currentSourceDigest());
    const metrics = result.metrics as { status: string }; assert.equal(metrics.status, "PASS");
    const receipt = createReceipt({ id, commands: [command], artifacts: [path, receiptPath("browser")], metrics,
      checks: readContract().receiptChecks[id].map(checkId => ({ id: checkId, actual: true, expected: true })),
      limitations: ["Pure/source-extracted oracle checks are combined with the complete source-bound browser receipt for UI-dependent requirements."],
    }); console.log(JSON.stringify({ status: receipt.status, receipt: writeReceipt(receipt) })); if (receipt.status !== "PASS") process.exitCode = 1;
  }
}

if (process.argv.includes("--quality")) recordQuality();
else if (process.argv.includes("--record")) recordManifest();
else if (process.argv.includes("--browser")) runProducers("browser");
else if (process.argv.includes("--oracles")) runProducers("oracles");
else if (process.argv.includes("--assemble-browser")) assembleBrowser();
else if (process.argv.includes("--assemble-oracles")) assembleOracles();
else throw new Error("Use --quality, --browser, --oracles, --assemble-browser, --assemble-oracles, or --record; browser/record commands require --url=http://127.0.0.1:<review-port>/");
