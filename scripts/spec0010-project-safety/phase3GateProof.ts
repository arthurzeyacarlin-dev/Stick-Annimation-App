import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const outputRoot = "output/spec-0010/phase-3";
mkdirSync(outputRoot, { recursive: true });
const exactAllowlist = [
  "app/page.tsx",
  "scripts/spec0010-project-safety/phase3BrowserProof.ts",
  "scripts/spec0010-project-safety/phase3Contract.ts",
  "scripts/spec0010-project-safety/phase3GateProof.ts",
  "scripts/spec0010-project-safety/phase3Oracle.ts",
  "scripts/spec0010-project-safety/recordPhase3Proof.ts",
  "scripts/spec0010-project-safety/validatePhase3Proof.ts",
  "src/components/recovery/ProjectRecoveryPrompt.tsx",
  "src/components/workspace/AnimationWorkspace.tsx",
  "src/components/workspace/DrawingWorkspace.tsx",
  "src/lib/animation/projectRecoveryStorageV1.ts",
  "src/lib/animation/unifiedWorkspaceBootstrap.ts",
].sort();

const run = (command: string, args: string[], environment = process.env) => {
  const startedAt = performance.now();
  const result = spawnSync(command, args, { encoding: "utf8", env: environment, maxBuffer: 64 * 1024 * 1024 });
  return { command: [command, ...args].join(" "), exitCode: result.status, elapsedMs: Math.round((performance.now() - startedAt) * 10) / 10, stdout: result.stdout, stderr: result.stderr };
};
const git = (...args: string[]) => {
  const result = run("git", args);
  if (result.exitCode !== 0) throw new Error(`git_failed:${args.join(":")}:${result.stderr}`);
  return result.stdout.trim();
};
const digest = (value: Uint8Array | string) => createHash("sha256").update(value).digest("hex");

const fontFixture = JSON.parse(readFileSync("scripts/fixtures/spec0001-browser/v1/next-font-google-response.json", "utf8")) as {
  responses: Array<{ url: string; family: string; faces: Array<{ subset: string; file: string; sha256: string; unicodeRange: string }> }>;
};
const fontResponses: Record<string, string> = {};
for (const response of fontFixture.responses) {
  fontResponses[response.url] = response.faces.map(face => {
    const bytes = readFileSync(face.file);
    assert.equal(`sha256:${digest(bytes)}`, face.sha256);
    return `/* ${face.subset} */\n@font-face { font-family: '${response.family}'; font-style: normal; font-weight: 100 900; font-display: swap; src: url(${resolve(face.file)}) format('woff2'); unicode-range: ${face.unicodeRange}; }`;
  }).join("\n");
}
const fontMockPath = resolve(`${outputRoot}/font-responses.cjs`);
writeFileSync(fontMockPath, `"use strict";\nmodule.exports = ${JSON.stringify(fontResponses, null, 2)};\n`);

const focusedPaths = exactAllowlist.filter(path => existsSync(path) && /\.[cm]?[jt]sx?$/.test(path));
const typecheck = run("./node_modules/.bin/tsc", ["--noEmit", "--incremental", "false"]);
const typeErrors = `${typecheck.stdout}\n${typecheck.stderr}`.split("\n").filter(line => /error TS\d+:/.test(line));
assert.ok(typecheck.exitCode === 0 || typecheck.exitCode === 2, "TypeScript either passes or retains the inherited generated-type baseline");
if (typecheck.exitCode === 0) {
  assert.deepEqual(typeErrors, [], "passing TypeScript has no errors");
} else {
  assert.equal(typeErrors.length, 2, "TypeScript has exactly the two inherited AI-cost dashboard errors");
  assert.ok(typeErrors.every(line => line.includes(".next/types/app/dev/ai-costs/")), "TypeScript errors remain outside Phase 3 paths");
}

const focusedLint = run("./node_modules/.bin/eslint", focusedPaths);
assert.equal(focusedLint.exitCode, 0, `focused lint failed: ${focusedLint.stderr || focusedLint.stdout}`);

const fullLint = run("./node_modules/.bin/eslint", [".", "--format", "json"]);
const lintReport = JSON.parse(fullLint.stdout) as Array<{
  filePath: string; errorCount: number; warningCount: number;
  messages: Array<{ line: number; endLine?: number; severity: number; ruleId: string | null; message: string }>;
}>;
const lintErrors = lintReport.reduce((total, file) => total + file.errorCount, 0);
const lintWarnings = lintReport.reduce((total, file) => total + file.warningCount, 0);
assert.equal(lintErrors, 5, "repository lint retains exact five-error baseline");
assert.equal(lintWarnings, 81, "repository lint retains exact 81-warning baseline");

const changedRanges = new Map<string, Array<[number, number]>>();
let currentPath = "";
for (const line of git("diff", "--unified=0", "--", ...exactAllowlist).split("\n")) {
  if (line.startsWith("+++ b/")) currentPath = line.slice(6);
  const hunk = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/);
  if (!currentPath || !hunk) continue;
  const first = Number(hunk[1]);
  const count = hunk[2] === undefined ? 1 : Number(hunk[2]);
  if (count > 0) (changedRanges.get(currentPath) ?? (changedRanges.set(currentPath, []), changedRanges.get(currentPath)!)).push([first, first + count - 1]);
}
const untracked = new Set(git("ls-files", "--others", "--exclude-standard").split("\n").filter(Boolean));
const changedFindings = lintReport.flatMap(file => {
  const path = relative(process.cwd(), file.filePath);
  if (!exactAllowlist.includes(path)) return [];
  return file.messages.filter(message => untracked.has(path) || (changedRanges.get(path) ?? []).some(([first, last]) => message.line <= last && (message.endLine ?? message.line) >= first)).map(message => ({ path, ...message }));
});
assert.deepEqual(changedFindings, [], "no changed-line or new-file lint findings");

const phase1Contract = run(process.execPath, ["--experimental-strip-types", "scripts/spec0010-project-safety/phase1Contract.ts"]);
assert.equal(phase1Contract.exitCode, 0, `Phase 1 contract regression failed: ${phase1Contract.stderr || phase1Contract.stdout}`);
const phase2Contract = run(process.execPath, ["--experimental-strip-types", "scripts/spec0010-project-safety/phase2Contract.ts"]);
assert.equal(phase2Contract.exitCode, 0, `Phase 2 contract regression failed: ${phase2Contract.stderr || phase2Contract.stdout}`);
const phase2Oracle = run(process.execPath, ["--experimental-strip-types", "scripts/spec0010-project-safety/phase2Oracle.ts"]);
assert.equal(phase2Oracle.exitCode, 0, `Phase 2 oracle regression failed: ${phase2Oracle.stderr || phase2Oracle.stdout}`);

const networkLedgerPath = resolve(`${outputRoot}/build-network.jsonl`);
writeFileSync(networkLedgerPath, "");
const buildEnvironment = {
  ...process.env,
  NEXT_TELEMETRY_DISABLED: "1",
  NEXT_FONT_GOOGLE_MOCKED_RESPONSES: fontMockPath,
  OPENAI_API_KEY: "",
  SUPABASE_URL: "",
  SUPABASE_ANON_KEY: "",
  SUPABASE_SERVICE_ROLE_KEY: "",
  SPEC0001_NETWORK_LEDGER: networkLedgerPath,
  SPEC0001_REPOSITORY_ROOT: dirname(realpathSync("node_modules")),
  NODE_OPTIONS: `--require=${resolve("scripts/spec0001-browser/networkDeny.cjs")}`,
};
const fullBuild = run(process.execPath, [resolve("node_modules/next/dist/bin/next"), "build", "--webpack"], buildEnvironment);
const fullBuildOutput = `${fullBuild.stdout}\n${fullBuild.stderr}`;
assert.equal(fullBuild.exitCode, 1, "full production build retains the exact inherited failure exit code");
assert.match(fullBuildOutput, /app\/dev\/ai-costs\/lifetime\/page\.tsx[\s\S]*searchParams[\s\S]*PageProps/, "full production build failure remains confined to the inherited dev AI-cost page type");
const focusedBuild = run(process.execPath, [resolve("node_modules/next/dist/bin/next"), "build", "--webpack", "--debug-build-paths", "app/page.tsx"], buildEnvironment);
assert.equal(focusedBuild.exitCode, 0, `focused Home/workspace production build failed: ${focusedBuild.stderr || focusedBuild.stdout}`);
const buildNetwork = readFileSync(networkLedgerPath, "utf8").split("\n").filter(Boolean).map(line => JSON.parse(line) as { result: string; target: string });
assert.equal(buildNetwork.filter(entry => entry.result === "denied").length, 0, "production build gates attempted no denied network request");

const diffCheck = run("git", ["diff", "--check"]);
assert.equal(diffCheck.exitCode, 0, "diff check passes");
assert.equal(git("diff", "--cached", "--name-only"), "", "index is empty");
const statusResult = run("git", ["status", "--porcelain=v1", "-z", "--untracked-files=all"]);
assert.equal(statusResult.exitCode, 0, "git status succeeds");
const dirtyPaths = statusResult.stdout.split("\0").filter(Boolean).map(record => record.slice(3)).sort();
assert.deepEqual(dirtyPaths, exactAllowlist, "dirty paths match exact Phase 3 allowlist");
const forbiddenDiff = git("diff", "--name-only", "HEAD", "--", "AGENTS.md", "docs", "project/project_structure.txt", "package.json", "package-lock.json", "src/lib/ai", "app/api/ai", "src/components/export", "src/lib/export", "src/lib/animation/projectRecoveryContractV1.ts", "src/lib/animation/unifiedProjectStorageV2.ts");
assert.equal(forbiddenDiff, "", "control plane, dependencies, AI, export, Phase 2 contract, and official storage are unchanged");

const result = {
  kind: "spec0010-phase3-gate-proof",
  version: 1,
  status: "PASS",
  baseSha: git("rev-parse", "HEAD"),
  headSha: git("rev-parse", "HEAD"),
  exactDirtyPaths: exactAllowlist,
  checks: {
    typecheck: { status: typecheck.exitCode === 0 ? "PASS" : "BASELINE_UNCHANGED", exitCode: typecheck.exitCode, inheritedErrors: typeErrors },
    focusedLint: { status: "PASS", exitCode: focusedLint.exitCode },
    fullLint: { status: "BASELINE_UNCHANGED", errors: lintErrors, warnings: lintWarnings, changedFindings },
    phase1Contract: { status: "PASS", exitCode: phase1Contract.exitCode },
    phase2Contract: { status: "PASS", exitCode: phase2Contract.exitCode },
    phase2Oracle: { status: "PASS", exitCode: phase2Oracle.exitCode },
    fullProductionBuild: { status: "BASELINE_UNCHANGED", exitCode: fullBuild.exitCode, inheritedPath: "app/dev/ai-costs/lifetime/page.tsx" },
    focusedProductionBuild: { status: "PASS", exitCode: focusedBuild.exitCode, networkEntries: buildNetwork.length },
    diffCheck: { status: "PASS", exitCode: diffCheck.exitCode },
    emptyIndex: { status: "PASS" },
    exactScope: { status: "PASS" },
    forbiddenDiff: { status: "PASS" },
  },
  commands: {
    typecheck: { command: typecheck.command, elapsedMs: typecheck.elapsedMs },
    focusedLint: { command: focusedLint.command, elapsedMs: focusedLint.elapsedMs },
    fullLint: { command: fullLint.command, elapsedMs: fullLint.elapsedMs },
    phase1Contract: { command: phase1Contract.command, elapsedMs: phase1Contract.elapsedMs },
    phase2Contract: { command: phase2Contract.command, elapsedMs: phase2Contract.elapsedMs },
    phase2Oracle: { command: phase2Oracle.command, elapsedMs: phase2Oracle.elapsedMs },
    fullProductionBuild: { command: fullBuild.command, elapsedMs: fullBuild.elapsedMs },
    focusedProductionBuild: { command: focusedBuild.command, elapsedMs: focusedBuild.elapsedMs },
  },
  dependencyRoot: realpathSync("node_modules"),
};
writeFileSync(`${outputRoot}/gates.json`, `${JSON.stringify(result, null, 2)}\n`);
writeFileSync(`${outputRoot}/build-network.json`, `${JSON.stringify(buildNetwork, null, 2)}\n`);
console.log(JSON.stringify(result));
