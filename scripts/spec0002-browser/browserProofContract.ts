import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import {
  ACTIONS as PHASE15_ACTIONS,
  FIXED_DRAWING_PROMPT,
  PHASE15_AUTHORIZED_PATHS,
  VIEWPORTS as FROZEN_VIEWPORTS,
  bindFile,
  stableJson,
  strictObject,
} from "../spec0001-browser/browserTesterContract.ts";

export const SPEC0002_ID = "SPEC-0002" as const;
export const SPEC0002_PHASE = "2" as const;
export const SPEC0002_BASE = "92e6143641c5dd2542277052fe21c6bad742139f" as const;
export const SPEC0002_OUTPUT_ROOT = "output/spec-0002/phase-2" as const;
export const SPEC0002_FIXTURE_ROOT = "scripts/fixtures/spec0002-browser/v1" as const;
export const SPEC0002_MODES = ["phase-2-real-browser-proof", "phase-1.5-regression-extension"] as const;
export type Spec0002BrowserMode = (typeof SPEC0002_MODES)[number];
export const VIEWPORTS = FROZEN_VIEWPORTS;
export const FROZEN_ACTIONS = PHASE15_ACTIONS;
export const FROZEN_DRAWING_PROMPT = FIXED_DRAWING_PROMPT;
export const FROZEN_PHASE15_PATHS = PHASE15_AUTHORIZED_PATHS;

export const CLEAN_PRE_EDIT_GATE = Object.freeze({
  command: "npm run test:spec0001-browser",
  exitCode: 0,
  baseCommit: "e85003089e793791f9a191a56b29c1c377ef5d26",
  runBaselineMode: "integrated-current-head",
  resultSha256: "0f80ca47bb182f551bc352bc04a0d705d87522c90452fae7aeb6fc0c49ce427d",
  mockedAiPosts: 1,
  externalRequests: 0,
  cleanBefore: true,
  cleanAfter: true,
});

export const PHASE1_PUBLICATION = "0416fc3828a863a797ee9f1c3daa8508792ac64a" as const;
export const PHASE1_PATHS = [
  "src/lib/drawingProjectV2Contract.ts",
  "src/lib/drawingProjectV2Canonical.ts",
  "src/lib/drawingProjectV2Repository.ts",
  "src/lib/drawingProjectIndexedDb.ts",
  "src/lib/drawingProjectV1Compatibility.ts",
  "src/lib/drawingProjectRasterCodec.ts",
  "src/lib/drawingProjectAudioCodec.ts",
  "scripts/validateDrawingProjectV2Contract.ts",
  "scripts/validateDrawingProjectV2Repository.ts",
  "scripts/validateDrawingProjectV1Compatibility.ts",
  "scripts/validateDrawingProjectV2BrowserEngine.ts",
  "scripts/recordSpec0002Phase1Proof.ts",
  "scripts/validateSpec0002Proof.ts",
  "scripts/finalizeSpec0002Closeout.ts",
] as const;
export const PHASE1_PREFIX = "scripts/fixtures/drawing-persistence/v2/" as const;

export const FROZEN_BINDINGS = Object.freeze({
  runner: { path: "scripts/runSpec0001BrowserProof.ts", sha256: "b15c9024146fa3155d319f67864e618afa72d6567ec62091aa34bd12ea42560d" },
  contract: { path: "scripts/spec0001-browser/browserTesterContract.ts", sha256: "e055e80b5e64c90eed4cdf02241504c5752d91a7e67401b82523538d121b9028" },
  plan: { path: "scripts/fixtures/spec0001-browser/v1/phase-1.5-browser-plan.json", sha256: "6eaca77480f1d5dabd16264ecb8b11fadc366689712bc8e4b9ada0cbabde7143" },
  phase1Validator: { path: "scripts/validateSpec0002Proof.ts", sha256: "1b12cdc360f14b3cfb16ff0d8718ec222bcfcd35b9449a87c59506ae371fd1d9" },
});

export const PREDECESSOR_MANIFESTS = Object.freeze({
  phase1: "2d20a4a63103618505b60cf590835191841d1c1968bc2bc14ef2c953253243a1",
  phase15: "da2dd8cff32367a548a2e7d2e4e789fcf1a4dd129e9dc6200e25650f586f9fc9",
});

export const REGRESSION_IDS = ["REG-01", "REG-02", "REG-03", "REG-04", "REG-05", "REG-06", "REG-07", "REG-08", "REG-09", "REG-10"] as const;
export const FLOW_STEP_IDS = Array.from({ length: 22 }, (_, index) => `STEP-${String(index + 1).padStart(2, "0")}`);
export const PHASE2_BROWSER_ASSERTIONS = 12 as const;
export const REALISTIC_AUTHORING_BITMAP = Object.freeze({
  viewport: "1440x900",
  width: 4563,
  height: 3302,
  rgbaByteLength: 60_268_104,
});

export const NEGATIVE_VALIDATOR_CLASSES = [
  "missing-top-level-field",
  "extra-top-level-field",
  "wrong-spec-phase-base-head",
  "command-config-binding-tamper",
  "receipt-missing-extra-reorder",
  "receipt-argv-env-exit-privacy-tamper",
  "artifact-missing-extra-hash-tamper",
  "dirty-path-mismatch",
  "unauthorized-dirty-path",
  "phase1-predecessor-tamper",
  "phase15-predecessor-tamper",
  "app-mounted-viewport-tamper",
  "browser-action-accessibility-screenshot-tamper",
  "idb-count-stage-partial-mount-tamper",
  "legacy-tombstone-catalog-neighbor-tamper",
  "network-request-ledger-tamper",
  "cleanup-collision-instrumentation-tamper",
  "missing-failed-regression",
  "false-commands-passed",
  "worsened-lint",
] as const;

export const MANIFEST_KEYS = [
  "manifestVersion", "specId", "phase", "baseCommit", "headCommit", "recordedAt", "commandsPassed",
  "commandConfig", "receipts", "artifacts", "predecessors", "browserEvidence", "assertions", "lintBaseline",
  "runtime", "git", "network", "cleanup",
] as const;

export const AUTHORIZED_EXACT_PATHS = [
  "app/page.tsx",
  "src/lib/drawingProjectStorage.ts",
  "src/components/workspace/DrawingWorkspace.tsx",
  "src/components/workspace/DrawingTopBar.tsx",
  "src/components/open-project/OpenProjectBrowser.tsx",
  "scripts/spec0002-browser/browserProofContract.ts",
  "scripts/spec0002-browser/validatePhase2.ts",
  "scripts/runSpec0002BrowserProof.ts",
  "scripts/recordSpec0002Phase2Proof.ts",
] as const;
export const AUTHORIZED_PREFIX = "scripts/fixtures/spec0002-browser/v1/" as const;

export const RECEIPT_DEFINITIONS = [
  ["phase-1-v2-contract", ["node", "--experimental-strip-types", "scripts/validateDrawingProjectV2Contract.ts"], 0],
  ["phase-1-v2-repository", ["node", "--experimental-strip-types", "scripts/validateDrawingProjectV2Repository.ts"], 0],
  ["phase-1-v1-compatibility", ["node", "--experimental-strip-types", "scripts/validateDrawingProjectV1Compatibility.ts"], 0],
  ["phase-1-browser-engine", ["node", "--experimental-strip-types", "scripts/validateDrawingProjectV2BrowserEngine.ts"], 0],
  ["phase-2-validator-self-test", ["node", "--experimental-strip-types", "scripts/spec0002-browser/validatePhase2.ts", "--self-test"], 0],
  ["phase-2-real-browser-proof", ["node", "--experimental-strip-types", "scripts/runSpec0002BrowserProof.ts", "--mode=phase-2-real-browser-proof"], 0],
  ["phase-1.5-regression-extension", ["node", "--experimental-strip-types", "scripts/runSpec0002BrowserProof.ts", "--mode=phase-1.5-regression-extension"], 0],
  ["typescript", ["./node_modules/.bin/tsc", "--noEmit", "--incremental", "false"], 0],
  ["lint-regression", ["npm", "run", "lint"], 1],
  ["diff-check", ["git", "diff", "--check"], 0],
  ["cached-diff-check", ["git", "diff", "--cached", "--check"], 0],
  ["status", ["git", "status", "--short", "--branch"], 0],
] as const;

export const SANITIZED_ENV = Object.freeze({
  NEXT_TELEMETRY_DISABLED: "1",
  OPENAI_API_KEY: "",
  SUPABASE_URL: "",
  SUPABASE_ANON_KEY: "",
  SUPABASE_SERVICE_ROLE_KEY: "",
});

export const sha256 = (value: Uint8Array | string) => createHash("sha256").update(value).digest("hex");

export const bindLocalFile = (root: string, path: string) => {
  const absolute = resolve(root, path);
  const bytes = readFileSync(absolute);
  return { path, sha256: sha256(bytes), byteLength: statSync(absolute).size };
};

export const assertFrozenBindings = (root: string) => {
  for (const binding of Object.values(FROZEN_BINDINGS)) {
    const actual = bindFile(root, binding.path);
    assert.equal(actual.sha256, `sha256:${binding.sha256}`, `Frozen predecessor changed: ${binding.path}`);
  }
  return Object.values(FROZEN_BINDINGS).map((binding) => bindLocalFile(root, binding.path));
};

export const parseMode = (argv: string[]): Spec0002BrowserMode => {
  const argument = argv.find((value) => value.startsWith("--mode="));
  const mode = argument?.slice("--mode=".length);
  assert.ok(SPEC0002_MODES.includes(mode as Spec0002BrowserMode), "An exact SPEC-0002 browser mode is required.");
  return mode as Spec0002BrowserMode;
};

export { stableJson, strictObject };
