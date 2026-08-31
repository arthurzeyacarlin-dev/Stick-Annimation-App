import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {existsSync, readFileSync, statSync} from "node:fs";
import {resolve} from "node:path";
import {
  SPEC0003_BASE_COMMIT,
  SPEC0003_DIRTY_PATHS,
  SPEC0003_MANIFEST_PATH,
  assertBrowserPlan,
  readBrowserPlan,
} from "./spec0003-tutorials/browserProofContract.ts";

type ProofManifest = {
  version: 1;
  status: "passed";
  baseCommit: string;
  headCommit: string;
  dirtyPaths: string[];
  stagedPaths: string[];
  receipts: Array<{command: string; exitCode: number; outputSha256: string}>;
  artifacts: Array<{path: string; bytes: number; sha256: string}>;
  browser: {viewportCount: number; screenshotCount: number; externalRequestCount: number; apiRequestCount: number};
};

const sha256 = (bytes: Buffer | string) => createHash("sha256").update(bytes).digest("hex");

export const validateManifestShape = (manifest: ProofManifest) => {
  assert.equal(manifest.version, 1, "SPEC0003_MANIFEST_VERSION");
  assert.equal(manifest.status, "passed", "SPEC0003_MANIFEST_STATUS");
  assert.equal(manifest.baseCommit, SPEC0003_BASE_COMMIT, "SPEC0003_MANIFEST_BASE");
  assert.equal(manifest.headCommit, SPEC0003_BASE_COMMIT, "SPEC0003_MANIFEST_HEAD");
  assert.deepEqual(manifest.dirtyPaths, [...SPEC0003_DIRTY_PATHS], "SPEC0003_MANIFEST_DIRTY_PATHS");
  assert.deepEqual(manifest.stagedPaths, [], "SPEC0003_MANIFEST_STAGED_PATHS");
  assert.equal(manifest.receipts.length, 6, "SPEC0003_MANIFEST_RECEIPT_COUNT");
  assert.ok(manifest.receipts.every((receipt) => receipt.exitCode === 0 && /^[a-f0-9]{64}$/.test(receipt.outputSha256)), "SPEC0003_MANIFEST_RECEIPT_FAILURE");
  assert.ok(manifest.artifacts.length >= 4, "SPEC0003_MANIFEST_ARTIFACT_COUNT");
  assert.deepEqual(manifest.browser, {viewportCount: 3, screenshotCount: 3, externalRequestCount: 0, apiRequestCount: 0});
};

const validateFiles = (root: string, manifest: ProofManifest) => {
  for (const artifact of manifest.artifacts) {
    const path = resolve(root, artifact.path);
    assert.equal(existsSync(path), true, `SPEC0003_ARTIFACT_MISSING:${artifact.path}`);
    const bytes = readFileSync(path);
    assert.equal(statSync(path).size, artifact.bytes, `SPEC0003_ARTIFACT_SIZE:${artifact.path}`);
    assert.equal(sha256(bytes), artifact.sha256, `SPEC0003_ARTIFACT_HASH:${artifact.path}`);
  }
};

const selfTest = () => {
  const valid: ProofManifest = {
    version: 1,
    status: "passed",
    baseCommit: SPEC0003_BASE_COMMIT,
    headCommit: SPEC0003_BASE_COMMIT,
    dirtyPaths: [...SPEC0003_DIRTY_PATHS],
    stagedPaths: [],
    receipts: Array.from({length: 6}, (_, index) => ({command: `command-${index}`, exitCode: 0, outputSha256: "a".repeat(64)})),
    artifacts: Array.from({length: 4}, (_, index) => ({path: `artifact-${index}`, bytes: 1, sha256: "b".repeat(64)})),
    browser: {viewportCount: 3, screenshotCount: 3, externalRequestCount: 0, apiRequestCount: 0},
  };
  validateManifestShape(valid);
  const mutations: Array<(value: ProofManifest) => void> = [
    (value) => { value.baseCommit = "wrong"; },
    (value) => { value.dirtyPaths = value.dirtyPaths.slice(1); },
    (value) => { value.stagedPaths = ["app/page.tsx"]; },
    (value) => { value.receipts[0]!.exitCode = 1; },
    (value) => { value.browser.viewportCount = 2; },
    (value) => { value.browser.screenshotCount = 2; },
    (value) => { value.browser.externalRequestCount = 1; },
    (value) => { value.browser.apiRequestCount = 1; },
  ];
  for (const mutate of mutations) {
    const candidate = structuredClone(valid);
    mutate(candidate);
    assert.throws(() => validateManifestShape(candidate));
  }
  process.stdout.write(`SPEC-0003 proof validator self-test PASS: ${mutations.length} negative cases.\n`);
};

const main = () => {
  assertBrowserPlan(readBrowserPlan());
  if (process.argv.includes("--self-test")) {
    selfTest();
    return;
  }
  const path = resolve(process.cwd(), SPEC0003_MANIFEST_PATH);
  const manifest = JSON.parse(readFileSync(path, "utf8")) as ProofManifest;
  validateManifestShape(manifest);
  validateFiles(process.cwd(), manifest);
  process.stdout.write(`SPEC-0003 proof manifest PASS: ${manifest.receipts.length} receipts, ${manifest.artifacts.length} artifacts.\n`);
};

main();
