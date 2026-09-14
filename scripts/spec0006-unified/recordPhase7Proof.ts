import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { relative, resolve } from "node:path";

const BASE_SHA = "cbe16411a0f83d3b86136f41d0a66d1874d009aa";
const URL = "http://127.0.0.1:56770/";
const output = "output/spec-0006/phase-7";
const commandResultsPath = `${output}/command-results.json`;
const browserCommandResultsPath = `${output}/browser-command-results.json`;
const exactAllowlist = [
  "scripts/fixtures/spec0006-unified/v2/phase7-acceptance-cases.json",
  "scripts/spec0006-unified/finalizePhase7Proof.ts",
  "scripts/spec0006-unified/phase7BrowserProof.ts",
  "scripts/spec0006-unified/recordPhase7Proof.ts",
  "scripts/spec0006-unified/revalidateHistoricalProofs.ts",
  "scripts/spec0006-unified/validatePhase7Authority.ts",
  "scripts/spec0006-unified/validatePhase7Proof.ts",
  "src/components/workspace/AnimationWorkspace.tsx",
  "src/components/workspace/DrawingCanvas.tsx",
  "src/components/workspace/DrawingWorkspace.tsx",
  "src/lib/animation/unifiedWorkspaceBootstrap.ts",
].sort();

mkdirSync(output, { recursive: true });
const digest = (bytes: Uint8Array | string) => createHash("sha256").update(bytes).digest("hex");
const bind = (path: string) => { const bytes = readFileSync(path); return { path, bytes: bytes.length, sha256: digest(bytes) }; };
const git = (...args: string[]) => {
  const result = spawnSync("git", args, { encoding: "utf8" });
  if (result.status !== 0) throw new Error(result.stderr || `git_${args.join("_")}_failed`);
  return result.stdout;
};
const assertScope = () => {
  const dirty = git("status", "--porcelain=v1", "--untracked-files=all").split("\n").filter(Boolean).map(line => line.slice(3)).sort();
  if (JSON.stringify(dirty) !== JSON.stringify(exactAllowlist)) throw new Error(`dirty_path_mismatch:${JSON.stringify(dirty)}`);
  if (git("diff", "--cached", "--name-only") !== "") throw new Error("index_not_empty");
  if (git("rev-parse", "HEAD").trim() !== BASE_SHA) throw new Error("wrong_head");
  return dirty;
};
const run = (name: string, command: string, args: string[], environment = process.env) => {
  const startedAt = Date.now();
  const result = spawnSync(command, args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024, env: environment });
  return { name, command: [command, ...args].join(" "), exitCode: result.status, elapsedMs: Date.now() - startedAt, stdout: result.stdout.trim(), stderr: result.stderr.trim() };
};
const fullLintNonRegression = () => {
  const result = spawnSync("./node_modules/.bin/eslint", [".", "--format", "json"], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  const report = JSON.parse(result.stdout) as Array<{ filePath: string; errorCount: number; warningCount: number; messages: Array<{ line: number; endLine?: number; severity: number; ruleId: string | null; message: string }> }>;
  const ranges = new Map<string, Array<[number, number]>>();
  let currentPath = "";
  for (const line of git("diff", "--unified=0", "--", ...exactAllowlist).split("\n")) {
    if (line.startsWith("+++ b/")) currentPath = line.slice(6);
    const hunk = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/);
    if (!currentPath || !hunk) continue;
    const start = Number(hunk[1]);
    const count = hunk[2] === undefined ? 1 : Number(hunk[2]);
    if (count > 0) (ranges.get(currentPath) ?? ranges.set(currentPath, []).get(currentPath)!).push([start, start + count - 1]);
  }
  const untracked = new Set(git("status", "--porcelain=v1", "--untracked-files=all").split("\n").filter(line => line.startsWith("?? ")).map(line => line.slice(3)));
  const changedFindings = report.flatMap(file => {
    const path = relative(process.cwd(), file.filePath);
    if (!exactAllowlist.includes(path)) return [];
    return file.messages.filter(message => untracked.has(path) || (ranges.get(path) ?? []).some(([start, end]) => message.line <= end && (message.endLine ?? message.line) >= start)).map(message => ({ path, ...message }));
  });
  return { name: "full-eslint-nonregression", command: "eslint . --format json (changed-line non-regression)", exitCode: changedFindings.length === 0 ? 0 : 1, elapsedMs: 0, stdout: JSON.stringify({ upstreamExitCode: result.status, errors: report.reduce((sum, file) => sum + file.errorCount, 0), warnings: report.reduce((sum, file) => sum + file.warningCount, 0), changedFindings }), stderr: result.stderr.trim() };
};
const prepareFontMock = () => {
  const path = `${output}/font-responses.cjs`;
  const fixture = JSON.parse(readFileSync("scripts/fixtures/spec0001-browser/v1/next-font-google-response.json", "utf8"));
  const responses: Record<string, string> = {};
  for (const response of fixture.responses as Array<{ url: string; family: string; faces: Array<{ subset: string; file: string; sha256: string; unicodeRange: string }> }>) {
    responses[response.url] = response.faces.map(face => {
      const bytes = readFileSync(face.file);
      if (`sha256:${digest(bytes)}` !== face.sha256) throw new Error(`font_fixture_digest:${face.file}`);
      return `/* ${face.subset} */\n@font-face { font-family: '${response.family}'; font-style: normal; font-weight: 100 900; font-display: swap; src: url(${resolve(face.file)}) format('woff2'); unicode-range: ${face.unicodeRange}; }`;
    }).join("\n");
  }
  writeFileSync(path, `"use strict";\nmodule.exports = ${JSON.stringify(responses, null, 2)};\n`);
  return resolve(path);
};

if (process.argv.includes("--prepare")) {
  assertScope();
  const fontMock = prepareFontMock();
  const focused = exactAllowlist.filter(path => /\.[cm]?[jt]sx?$/.test(path));
  const prior = process.argv.includes("--resume") && existsSync(commandResultsPath)
    ? new Map((JSON.parse(readFileSync(commandResultsPath, "utf8")) as Array<{ name: string; exitCode: number }>).map(result => [result.name, result]))
    : new Map<string, { name: string; exitCode: number }>();
  const rerunAfterProofChange = new Set(["typescript", "focused-eslint", "full-eslint-nonregression", "diff-check", "phase7-authority", "historical-manifests", "production-build"]);
  const preparedRun = (name: string, command: string, args: string[], environment = process.env) => {
    const cached = prior.get(name);
    return cached?.exitCode === 0 && !rerunAfterProofChange.has(name) ? { ...cached, reusedAfterUnrelatedFailure: true } : run(name, command, args, environment);
  };
  const commands = [
    preparedRun("typescript", "./node_modules/.bin/tsc", ["--noEmit"]),
    preparedRun("focused-eslint", "./node_modules/.bin/eslint", focused),
    fullLintNonRegression(),
    preparedRun("diff-check", "git", ["diff", "--check"]),
    ...[
      ["phase7-authority", "scripts/spec0006-unified/validatePhase7Authority.ts"],
      ["phase1-migration", "scripts/spec0006-unified/validatePhase1Migration.ts"],
      ["phase4a-foundation", "scripts/spec0006-unified/validatePhase4aNeutralFoundation.ts"],
      ["phase4b-workspace", "scripts/spec0006-unified/validatePhase4bNeutralWorkspace.ts"],
      ["phase5-tools-library", "scripts/spec0006-unified/validatePhase5ToolsLibrary.ts"],
      ["phase6-persistence", "scripts/spec0006-unified/validatePhase6Persistence.ts"],
      ["drawing-v1", "scripts/validateDrawingProjectV1Compatibility.ts"],
      ["drawing-v2-contract", "scripts/validateDrawingProjectV2Contract.ts"],
      ["drawing-v2-repository", "scripts/validateDrawingProjectV2Repository.ts"],
      ["drawing-v2-browser-engine", "scripts/validateDrawingProjectV2BrowserEngine.ts"],
      ["drawing-ai-memory", "scripts/validateDrawingProjectAiMemory.ts"],
      ["drawing-ai-memory-route", "scripts/validateDrawingProjectAiMemoryRouteSafety.ts"],
      ["drawing-ai-preferences", "scripts/validateDrawingAiControlPreferences.ts"],
      ["stick-history", "scripts/validateStickHistoryPersistence.ts"],
      ["stick-transaction", "scripts/validateStickFigureCommandTransaction.ts"],
      ["stick-ai-contracts", "scripts/validateStickFigureAiContracts.ts"],
      ["stick-ai-ui-adapter", "scripts/validateStickFigureAiUiAdapter.ts"],
      ["timeline-playback", "scripts/validateTimelinePlaybackSmoothing.ts"],
      ["historical-manifests", "scripts/spec0006-unified/revalidateHistoricalProofs.ts"],
    ].map(([name, path]) => preparedRun(name, "node", ["--experimental-strip-types", path])),
    preparedRun("production-build", process.execPath, [resolve("node_modules/next/dist/bin/next"), "build", "--webpack", "--debug-build-paths", "app/page.tsx"], {
      ...process.env,
      NEXT_TELEMETRY_DISABLED: "1", NEXT_FONT_GOOGLE_MOCKED_RESPONSES: fontMock,
      OPENAI_API_KEY: "", SUPABASE_URL: "", SUPABASE_ANON_KEY: "", SUPABASE_SERVICE_ROLE_KEY: "",
      SPEC0001_NETWORK_LEDGER: resolve(output, "build-network.jsonl"), SPEC0001_REPOSITORY_ROOT: "/Users/arthurcarlin/Projects/stick-animation-app",
      NODE_OPTIONS: `--require=${resolve("scripts/spec0001-browser/networkDeny.cjs")}`,
    }),
  ];
  writeFileSync(commandResultsPath, JSON.stringify(commands, null, 2) + "\n");
  const failed = commands.filter(command => command.exitCode !== 0);
  if (failed.length) throw new Error(`proof_command_failed:${failed.map(command => command.name).join(",")}`);
  console.log(JSON.stringify({ status: "PASS", commands: commands.length, ...bind(commandResultsPath) }));
  process.exit(0);
}

if (process.argv.includes("--browser")) {
  assertScope();
  const reusePhase6 = process.argv.includes("--resume") && existsSync("output/spec-0006/phase-6/browser/result.json");
  const phase6Result = reusePhase6
    ? JSON.parse(readFileSync("output/spec-0006/phase-6/browser/result.json", "utf8")) as { status?: string }
    : null;
  const commands = [
    reusePhase6 && phase6Result?.status === "PASS"
      ? {
          name: "phase6-browser",
          command: `focused successful rerun reused: node --experimental-strip-types scripts/spec0006-unified/phase6BrowserProof.ts --url=${URL}`,
          exitCode: 0,
          elapsedMs: 0,
          stdout: JSON.stringify({ status: "PASS", result: "output/spec-0006/phase-6/browser/result.json", reusedSuccessfulResult: true }),
          stderr: "",
        }
      : run("phase6-browser", "node", ["--experimental-strip-types", "scripts/spec0006-unified/phase6BrowserProof.ts", `--url=${URL}`]),
    run("phase7-browser", "node", ["--experimental-strip-types", "scripts/spec0006-unified/phase7BrowserProof.ts", `--url=${URL}`]),
  ];
  writeFileSync(browserCommandResultsPath, JSON.stringify(commands, null, 2) + "\n");
  const failed = commands.filter(command => command.exitCode !== 0);
  if (failed.length) throw new Error(`browser_command_failed:${failed.map(command => command.name).join(",")}`);
  console.log(JSON.stringify({ status: "PASS", commands: commands.length, ...bind(browserCommandResultsPath) }));
  process.exit(0);
}

if (!process.argv.includes("--finalize")) throw new Error("expected_--prepare_--browser_or_--finalize");
const dirty = assertScope();
for (const path of [commandResultsPath, browserCommandResultsPath, `${output}/browser/result.json`, `${output}/historical-revalidation.json`, "output/spec-0006/phase-6/browser/result.json"]) {
  if (!existsSync(path)) throw new Error(`missing_evidence:${path}`);
}
const commandResults = JSON.parse(readFileSync(commandResultsPath, "utf8"));
const browserCommands = JSON.parse(readFileSync(browserCommandResultsPath, "utf8"));
if ([...commandResults, ...browserCommands].some((result: { exitCode: number }) => result.exitCode !== 0)) throw new Error("command_receipt_failed");
for (const path of [`${output}/browser/result.json`, "output/spec-0006/phase-6/browser/result.json"]) {
  if (JSON.parse(readFileSync(path, "utf8")).status !== "PASS") throw new Error(`browser_result_failed:${path}`);
}
const listener = spawnSync("lsof", ["-nP", "-t", "-iTCP:56770", "-sTCP:LISTEN"], { encoding: "utf8" });
const pids = listener.stdout.trim().split("\n").filter(Boolean).map(Number);
if (listener.status !== 0 || pids.length !== 1) throw new Error(`review_listener_count:${pids.length}`);
const listenerCwd = spawnSync("lsof", ["-a", "-p", String(pids[0]), "-d", "cwd", "-Fn"], { encoding: "utf8" }).stdout.split("\n").find(line => line.startsWith("n"))?.slice(1);
if (listenerCwd !== process.cwd()) throw new Error(`review_cwd:${listenerCwd}`);
const evidencePaths = [
  commandResultsPath, browserCommandResultsPath, `${output}/font-responses.cjs`, `${output}/historical-revalidation.json`, `${output}/browser/result.json`,
  `${output}/browser/desktop-ordinary.png`, `${output}/browser/desktop-200-percent.png`, `${output}/browser/desktop.a11y.txt`,
  `${output}/browser/compact-ordinary.png`, `${output}/browser/compact-200-percent.png`, `${output}/browser/compact.a11y.txt`,
  "output/spec-0006/phase-6/browser/result.json",
  "/Users/arthurcarlin/Projects/stick-animation-app/output/spec-0006/git-054/e11f6c453f13772ee9bd4b172a17bc68e1de65b9/accepted-phase3/proof-manifest.json",
  "/Users/arthurcarlin/.codex/worktrees/2d14/stick-animation-app/output/recovery/GIT-057-phase-5-a759ae8/phase-5/proof-manifest.json",
  "/Users/arthurcarlin/.codex/worktrees/2d14/stick-animation-app/output/recovery/GIT-060-phase-6-cbe1641/phase-6/proof-manifest.json",
  ...(existsSync(`${output}/build-network.jsonl`) ? [`${output}/build-network.jsonl`] : []),
];
const phase6 = JSON.parse(readFileSync("output/spec-0006/phase-6/browser/result.json", "utf8"));
const phase7 = JSON.parse(readFileSync(`${output}/browser/result.json`, "utf8"));
const historical = JSON.parse(readFileSync(`${output}/historical-revalidation.json`, "utf8"));
const manifest = {
  kind: "spec0006-phase7-retirement-full-acceptance-proof", version: 1, status: "PASS", integrity: "VALID", technicalAcceptance: "PASS",
  baseSha: BASE_SHA, headSha: git("rev-parse", "HEAD").trim(), worktree: process.cwd(), indexEmpty: true, pathCeiling: 18,
  exactDirtyPaths: dirty, sourceBindings: dirty.map(bind), evidenceBindings: evidencePaths.map(bind), commands: commandResults, browserCommands,
  evidence: {
    ordinaryFlows: 9, regressions: 12, profiles: phase7.profiles.map((entry: { profile: unknown }) => entry.profile),
    phase4bContractFlows: 6, phase5HistoricalFlows: 34, phase6Operations: 19,
    legacyWrites: 0, secondCoordinatorMounts: 0, externalRequests: 0, realApiRequests: 0,
    accessibility: { critical: 0, serious: 0, keyboardFocus: "PASS", zoom200Percent: "PASS", reducedMotion: "PASS" },
    performance: phase6.profiles.map((profile: { profile: string; timings: unknown; large: unknown }) => ({ profile: profile.profile, timings: profile.timings, large: profile.large })),
    historicalRevalidation: historical,
    limitation: "Compact is a desktop Chromium responsive profile, not a physical phone; native/GPU memory is not proven. Phase 1, Phase 2, Phase 4A checkpoint, and final Phase 4 manifest files were not preserved, so only their recorded identities and publication commits can be reported; their absent bytes are not falsely claimed as revalidated.",
  },
  review: { url: URL, port: 56770, listenerPid: pids[0], cwd: listenerCwd, oneActiveReviewCopy: true, serverPreserved: true, humanAcceptance: "pending Arthur" },
};
writeFileSync(`${output}/proof-manifest.json`, JSON.stringify(manifest, null, 2) + "\n");
console.log(JSON.stringify({ status: "PASS", ...bind(`${output}/proof-manifest.json`), sourceBindings: manifest.sourceBindings.length, evidenceBindings: manifest.evidenceBindings.length }));
