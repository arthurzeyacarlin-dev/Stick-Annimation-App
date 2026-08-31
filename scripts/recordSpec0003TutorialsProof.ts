import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {existsSync, mkdirSync, readFileSync, statSync, writeFileSync} from "node:fs";
import {resolve} from "node:path";
import {spawnSync} from "node:child_process";
import {
  SPEC0003_BASE_COMMIT,
  SPEC0003_DIRTY_PATHS,
  SPEC0003_MANIFEST_PATH,
  SPEC0003_OUTPUT_DIR,
  assertBrowserPlan,
  readBrowserPlan,
} from "./spec0003-tutorials/browserProofContract.ts";

const ROOT = process.cwd();
const sha256 = (bytes: Buffer | string) => createHash("sha256").update(bytes).digest("hex");
const run = (command: string) => {
  const result = spawnSync("/bin/zsh", ["-lc", command], {cwd: ROOT, encoding: "utf8", env: {...process.env, NEXT_TELEMETRY_DISABLED: "1"}});
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
  if ((result.status ?? 1) !== 0) process.stderr.write(output);
  assert.equal(result.status, 0, `SPEC0003_COMMAND_FAILED:${command}`);
  process.stdout.write(output);
  return {command, exitCode: 0, outputSha256: sha256(output)};
};
const gitLines = (command: string) => {
  const result = spawnSync("/bin/zsh", ["-lc", command], {cwd: ROOT, encoding: "utf8"});
  assert.equal(result.status, 0, `SPEC0003_GIT_FAILED:${command}`);
  return String(result.stdout).split("\n").map((line) => line.trim()).filter(Boolean).sort();
};

const main = () => {
  assertBrowserPlan(readBrowserPlan());
  assert.equal(existsSync(resolve(ROOT, SPEC0003_OUTPUT_DIR)), false, "SPEC0003_OUTPUT_COLLISION");
  const head = gitLines("git rev-parse HEAD")[0];
  assert.equal(head, SPEC0003_BASE_COMMIT, "SPEC0003_WRONG_HEAD");
  assert.deepEqual(gitLines("git diff --cached --name-only"), [], "SPEC0003_INDEX_NOT_EMPTY");
  const hidden = gitLines("git ls-files -v | awk '$1 ~ /^[a-z]/ {print $2}'");
  assert.deepEqual(hidden, [], "SPEC0003_HIDDEN_GIT_FLAGS");

  const commands = JSON.parse(readFileSync(resolve(ROOT, "scripts/fixtures/spec0003-tutorials/v1/proof-commands.json"), "utf8")) as {commands: string[]};
  assert.equal(commands.commands.length, 6);
  const receipts = commands.commands.map(run);

  const dirtyPaths = [...new Set([
    ...gitLines("git diff --name-only"),
    ...gitLines("git ls-files --others --exclude-standard"),
  ])].sort();
  assert.deepEqual(dirtyPaths, [...SPEC0003_DIRTY_PATHS], "SPEC0003_DIRTY_SCOPE");

  const browserResultPath = resolve(ROOT, SPEC0003_OUTPUT_DIR, "browser-result.json");
  const browserResult = JSON.parse(readFileSync(browserResultPath, "utf8")) as {
    viewports: unknown[];
    screenshotCount: number;
    externalRequestCount: number;
    apiRequestCount: number;
  };
  const artifactPaths = [
    `${SPEC0003_OUTPUT_DIR}/browser-result.json`,
    `${SPEC0003_OUTPUT_DIR}/screenshots/desktop.png`,
    `${SPEC0003_OUTPUT_DIR}/screenshots/tablet.png`,
    `${SPEC0003_OUTPUT_DIR}/screenshots/phone.png`,
  ];
  const artifacts = artifactPaths.map((path) => {
    const absolute = resolve(ROOT, path);
    const bytes = readFileSync(absolute);
    return {path, bytes: statSync(absolute).size, sha256: sha256(bytes)};
  });
  const manifest = {
    version: 1,
    status: "passed",
    baseCommit: SPEC0003_BASE_COMMIT,
    headCommit: head,
    dirtyPaths,
    stagedPaths: [],
    receipts,
    artifacts,
    browser: {
      viewportCount: browserResult.viewports.length,
      screenshotCount: browserResult.screenshotCount,
      externalRequestCount: browserResult.externalRequestCount,
      apiRequestCount: browserResult.apiRequestCount,
    },
  };
  const manifestPath = resolve(ROOT, SPEC0003_MANIFEST_PATH);
  mkdirSync(resolve(ROOT, SPEC0003_OUTPUT_DIR), {recursive: true});
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  process.stdout.write(`SPEC-0003 proof recorded: ${receipts.length} receipts, ${artifacts.length} artifacts.\n`);
};

main();
