import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const outputRoot = "output/spec-0010/phase-2";
mkdirSync(outputRoot, { recursive: true });
const exactAllowlist = [
  "scripts/spec0010-project-safety/phase2BrowserProof.ts",
  "scripts/spec0010-project-safety/phase2Contract.ts",
  "scripts/spec0010-project-safety/phase2GateProof.ts",
  "scripts/spec0010-project-safety/phase2Oracle.ts",
  "scripts/spec0010-project-safety/recordPhase2Proof.ts",
  "scripts/spec0010-project-safety/validatePhase2Proof.ts",
  "src/components/workspace/DrawingTopBar.tsx",
  "src/components/workspace/DrawingWorkspace.tsx",
  "src/lib/animation/projectRecoveryContractV1.ts",
  "src/lib/animation/projectRecoveryStorageV1.ts",
  "src/lib/animation/unifiedProjectStorageV2.ts",
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
assert.equal(typecheck.exitCode, 0, `TypeScript failed: ${typecheck.stderr || typecheck.stdout}`);

const focusedLint = run("./node_modules/.bin/eslint", focusedPaths);
assert.equal(focusedLint.exitCode, 0, `focused lint failed: ${focusedLint.stderr || focusedLint.stdout}`);

const fullLint = run("./node_modules/.bin/eslint", [".", "--format", "json"]);
const lintReport = JSON.parse(fullLint.stdout) as Array<{
  filePath: string;
  errorCount: number;
  warningCount: number;
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

const networkLedgerPath = resolve(`${outputRoot}/build-network.jsonl`);
writeFileSync(networkLedgerPath, "");
const build = run(process.execPath, [resolve("node_modules/next/dist/bin/next"), "build", "--webpack", "--debug-build-paths", "app/page.tsx"], {
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
});
assert.equal(build.exitCode, 0, `focused production build failed: ${build.stderr || build.stdout}`);
const buildNetwork = readFileSync(networkLedgerPath, "utf8").split("\n").filter(Boolean).map(line => JSON.parse(line) as { result: string; target: string });
assert.equal(buildNetwork.filter(entry => entry.result === "denied").length, 0, "focused build attempted no denied network request");

const diffCheck = run("git", ["diff", "--check"]);
assert.equal(diffCheck.exitCode, 0, "diff check passes");
assert.equal(git("diff", "--cached", "--name-only"), "", "index is empty");
const statusResult = run("git", ["status", "--porcelain=v1", "-z", "--untracked-files=all"]);
assert.equal(statusResult.exitCode, 0, "git status succeeds");
const dirtyPaths = statusResult.stdout.split("\0").filter(Boolean).map(record => record.slice(3)).sort();
assert.deepEqual(dirtyPaths, exactAllowlist, "dirty paths match exact Phase 2 allowlist");
const forbiddenDiff = git("diff", "--name-only", "HEAD", "--", "AGENTS.md", "docs", "project/project_structure.txt", "package.json", "package-lock.json", "src/lib/ai", "src/lib/export");
assert.equal(forbiddenDiff, "", "control plane, dependencies, AI, and export are unchanged");

const result = {
  kind: "spec0010-phase2-gate-proof",
  version: 1,
  status: "PASS",
  baseSha: git("rev-parse", "HEAD"),
  headSha: git("rev-parse", "HEAD"),
  exactDirtyPaths: exactAllowlist,
  checks: {
    typecheck: { status: "PASS", exitCode: typecheck.exitCode },
    focusedLint: { status: "PASS", exitCode: focusedLint.exitCode },
    fullLint: { status: "BASELINE_UNCHANGED", errors: lintErrors, warnings: lintWarnings, changedFindings },
    focusedProductionBuild: { status: "PASS", exitCode: build.exitCode, networkEntries: buildNetwork.length },
    diffCheck: { status: "PASS", exitCode: diffCheck.exitCode },
    emptyIndex: { status: "PASS" },
    exactScope: { status: "PASS" },
    forbiddenDiff: { status: "PASS" },
  },
  commands: {
    typecheck: { command: typecheck.command, elapsedMs: typecheck.elapsedMs },
    focusedLint: { command: focusedLint.command, elapsedMs: focusedLint.elapsedMs },
    fullLint: { command: fullLint.command, elapsedMs: fullLint.elapsedMs },
    focusedProductionBuild: { command: build.command, elapsedMs: build.elapsedMs },
  },
  dependencyRoot: realpathSync("node_modules"),
};
writeFileSync(`${outputRoot}/gates.json`, `${JSON.stringify(result, null, 2)}\n`);
writeFileSync(`${outputRoot}/build-network.json`, `${JSON.stringify(buildNetwork, null, 2)}\n`);
console.log(JSON.stringify(result));
