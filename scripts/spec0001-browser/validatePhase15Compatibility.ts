import assert from "node:assert/strict";
import {spawnSync} from "node:child_process";
import {createHash} from "node:crypto";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import {tmpdir} from "node:os";
import {dirname, relative, resolve, sep} from "node:path";
import {pathToFileURL} from "node:url";
import {BROWSER_EXECUTABLE} from "./browserTesterContract.ts";
import {
  CATALOG_PATH,
  COMPATIBILITY_ADAPTER_PATH,
  COMPATIBILITY_OUTPUT_ROOT,
  COMPATIBILITY_PLAN_PATH,
  COMPATIBILITY_REGISTRY_PATH,
  CORRECTION_BASE_COMMIT,
  CORRECTION_PATHS,
  PHASE2_PATHS,
  bindRepositoryFile,
  compareIndexToHeadEntries,
  deriveGitState,
  loadTesterExtensionGraph,
  parseAdapterDeclarationSource,
  parseBrowserProofCli,
  validateAuthorizationCatalogValue,
  validateExtensionPlanValue,
  validateExtensionRegistryValue,
  validateExtensionResult,
  type ExtensionResult,
  type GitObservationOverride,
  type ValidatedTesterExtension,
} from "./browserTesterExtensionContract.ts";

type JsonObject = Record<string, unknown>;
type NegativeCase = {name: string; category: string; expectedCode: string};
type FileBinding = {path: string; byteLength: number; sha256: string};

const ROOT = process.cwd();
const REAL_ROOT = realpathSync(ROOT);
const NEGATIVE_FIXTURE_PATH = "scripts/fixtures/spec0001-browser/v2/phase-1.5-compatibility-negative-cases.json";
const NEGATIVE_LEDGER_PATH = `${COMPATIBILITY_OUTPUT_ROOT}/synthetic/negative-ledger.json`;
const SHA256_PATTERN = /^sha256:[0-9a-f]{64}$/;
let activeExpectedCode: string | null = null;
const observedRejectionCodes = new Set<string>();

const clone = <T>(value: T): T => structuredClone(value);
const strictObject = (value: unknown, keys: readonly string[], label: string): JsonObject => {
  assert.ok(value !== null && typeof value === "object" && !Array.isArray(value), `${label} must be an object.`);
  assert.deepEqual(Object.keys(value as JsonObject).sort(), [...keys].sort(), `${label} fields mismatch.`);
  return value as JsonObject;
};
const absolute = (path: string) => {
  const result = resolve(REAL_ROOT, path);
  const local = relative(REAL_ROOT, result);
  assert.ok(local !== ".." && !local.startsWith(`..${sep}`), `Path escapes repository: ${path}`);
  let cursor = REAL_ROOT;
  for (const part of local.split(sep).filter(Boolean)) {
    cursor = resolve(cursor, part);
    if (existsSync(cursor)) {
      assert.equal(lstatSync(cursor).isSymbolicLink(), false, `Symlink path component rejected: ${relative(REAL_ROOT, cursor)}`);
      assert.equal(realpathSync(cursor), resolve(REAL_ROOT, relative(REAL_ROOT, cursor)), `Real path component escaped repository: ${relative(REAL_ROOT, cursor)}`);
    }
  }
  return result;
};
const ensureOutputDirectory = (path: string) => {
  const outputRoot = absolute(COMPATIBILITY_OUTPUT_ROOT);
  const target = absolute(path);
  const local = relative(outputRoot, target);
  assert.ok(local !== ".." && !local.startsWith(`..${sep}`), `Negative output escapes its owned root: ${path}`);
  let cursor = REAL_ROOT;
  for (const part of relative(REAL_ROOT, target).split(sep).filter(Boolean)) {
    cursor = resolve(cursor, part);
    if (!existsSync(cursor)) mkdirSync(cursor, {mode: 0o700});
    assert.equal(lstatSync(cursor).isSymbolicLink(), false, `Negative output directory symlink rejected: ${relative(REAL_ROOT, cursor)}`);
    assert.equal(lstatSync(cursor).isDirectory(), true, `Negative output component is not a directory: ${relative(REAL_ROOT, cursor)}`);
    assert.equal(realpathSync(cursor), resolve(REAL_ROOT, relative(REAL_ROOT, cursor)), `Negative output directory escaped repository: ${relative(REAL_ROOT, cursor)}`);
  }
};
const readJson = (path: string): unknown => JSON.parse(readFileSync(absolute(path), "utf8"));
const proofEnvironment = () => {
  const env = {} as NodeJS.ProcessEnv;
  for (const key of ["TMPDIR", "TEMP", "TMP", "LANG", "LC_ALL", "HOME", "USER", "LOGNAME", "SHELL", "TERM"]) if (process.env[key]) env[key] = process.env[key];
  env.PATH = "/usr/bin:/bin:/opt/homebrew/bin";
  env.GIT_CONFIG_NOSYSTEM = "1";
  env.GIT_CONFIG_GLOBAL = "/dev/null";
  env.GIT_OPTIONAL_LOCKS = "0";
  return env;
};
const git = (...argv: string[]) => {
  const result = spawnSync("/usr/bin/git", argv, {cwd: ROOT, encoding: "utf8", shell: false, env: proofEnvironment()});
  assert.equal(result.status, 0, result.stderr || `git ${argv.join(" ")} failed.`);
  return result.stdout.trim();
};
const expectRejected = (check: () => unknown, label: string) => {
  let observed: unknown = null;
  try { check(); } catch (error) { observed = error; }
  assert.ok(observed instanceof Error && observed.message.length > 0, `${label} mutation unexpectedly passed.`);
  assert.ok(activeExpectedCode !== null, "Negative rejection ran without an active stable code.");
  observedRejectionCodes.add(activeExpectedCode);
};
const rejectAll = (checks: Array<() => unknown>, label: string) => {
  assert.ok(checks.length > 0);
  for (const [index, check] of checks.entries()) expectRejected(check, `${label} #${index + 1}`);
};

const observation = (overrides: Partial<GitObservationOverride> = {}): GitObservationOverride => ({
  headCommit: CORRECTION_BASE_COMMIT,
  stagedPaths: [],
  hiddenIndexPaths: [],
  trackedDirtyPaths: [],
  untrackedPaths: [...CORRECTION_PATHS],
  baseIsStrictAncestor: false,
  committedChangedPaths: [],
  ...overrides,
});

const bindBrowserExecutable = () => {
  const status = lstatSync(BROWSER_EXECUTABLE);
  assert.equal(status.isSymbolicLink(), false, "Browser executable must not be a symbolic link.");
  assert.equal(status.isFile(), true, "Browser executable must be a regular file.");
  assert.equal(realpathSync(BROWSER_EXECUTABLE), BROWSER_EXECUTABLE, "Browser executable real path mismatch.");
  const bytes = readFileSync(BROWSER_EXECUTABLE);
  return {
    path: BROWSER_EXECUTABLE,
    byteLength: bytes.byteLength,
    sha256: `sha256:${createHash("sha256").update(bytes).digest("hex")}` as `sha256:${string}`,
  };
};

const positiveResult = (graph: ValidatedTesterExtension): ExtensionResult => ({
  resultVersion: 2,
  specId: "SPEC-0001",
  proofPurpose: "phase-1.5-compatibility-synthetic",
  status: "passed",
  recordedAt: new Date(0).toISOString(),
  productPhaseClaimed: false,
  runtime: {
    nodeVersion: process.version,
    playwrightCoreVersion: "1.62.1",
    browserVersion: "self-test",
    browserExecutable: bindBrowserExecutable(),
  },
  derivedGitState: graph.git.derivedGitState,
  baseCommit: graph.git.baseCommit,
  headCommit: graph.git.headCommit,
  observedDirtyPaths: graph.git.observedDirtyPaths,
  dirtyExpectedPaths: graph.git.dirtyExpectedPaths,
  cleanExpectedPaths: [],
  selectedExpectedPaths: graph.git.selectedExpectedPaths,
  authorization: {authorizationId: graph.authorizationId, materializationKind: graph.materializationKind},
  bindings: {catalog: graph.catalogBinding, plan: graph.planBinding, registry: graph.registryBinding, adapter: graph.adapterBinding},
  execution: {
    selectedActionIds: graph.plan.steps.map((step) => step.actionId),
    actionCount: graph.plan.steps.length,
    checkpointCount: 4,
    screenshotCount: graph.plan.evidence.screenshotIds.length,
    protectedRegressionGroups: graph.plan.evidence.protectedRegressionGroups,
  },
  evidence: {
    ledgerKinds: graph.plan.evidence.ledgerKinds,
    screenshotIds: graph.plan.evidence.screenshotIds,
    protectedRegressionGroups: graph.plan.evidence.protectedRegressionGroups,
  },
  network: {browserNonLoopbackAttempts: 0, serverNonLoopbackAttempts: 0, childNonLoopbackAttempts: 0},
  cleanup: {anchorRestored: true, sourceRestored: true, browserContextsOpen: 0, activeGates: 0, activeIntercepts: 0, openChildProcesses: 0, openPorts: 0, residualPaths: []},
});

const validateAcceptedGraphBinding = (accepted: ExtensionResult, graph: ValidatedTesterExtension) => {
  assert.deepEqual(accepted.authorization, {authorizationId: graph.authorizationId, materializationKind: graph.materializationKind});
  assert.deepEqual(accepted.bindings, {catalog: graph.catalogBinding, plan: graph.planBinding, registry: graph.registryBinding, adapter: graph.adapterBinding});
  assert.deepEqual({
    derivedGitState: accepted.derivedGitState,
    baseCommit: accepted.baseCommit,
    headCommit: accepted.headCommit,
    observedDirtyPaths: accepted.observedDirtyPaths,
    dirtyExpectedPaths: accepted.dirtyExpectedPaths,
    cleanExpectedPaths: accepted.cleanExpectedPaths,
    selectedExpectedPaths: accepted.selectedExpectedPaths,
  }, graph.git);
};

const validateOutputEntries = (root: string, expected: string[]) => {
  let cursor = resolve(root);
  while (cursor !== dirname(cursor)) {
    if (existsSync(cursor) && lstatSync(cursor).isSymbolicLink()) throw new Error(`Output parent is a symlink: ${cursor}`);
    cursor = dirname(cursor);
  }
  const visit = (directory: string): string[] => readdirSync(directory, {withFileTypes: true}).flatMap((entry) => {
    const child = resolve(directory, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`Output entry is a symlink: ${child}`);
    return entry.isDirectory() ? visit(child) : [relative(root, child)];
  });
  assert.deepEqual(visit(root).sort(), [...expected].sort());
};

const validateAnchorLifecycle = (preimage: string, replacement: string, restored: string) => {
  assert.match(preimage, SHA256_PATTERN);
  assert.match(replacement, SHA256_PATTERN);
  assert.match(restored, SHA256_PATTERN);
  assert.notEqual(replacement, preimage, "Anchor replacement must change the preimage.");
  assert.equal(restored, preimage, "Anchor restoration must be byte exact.");
};

const validateNetworkContract = (value: unknown) => {
  const record = strictObject(value, ["browserNonLoopbackAttempts", "serverNonLoopbackAttempts", "childNonLoopbackAttempts", "denialChecks"], "Network contract");
  assert.deepEqual({
    browserNonLoopbackAttempts: record.browserNonLoopbackAttempts,
    serverNonLoopbackAttempts: record.serverNonLoopbackAttempts,
    childNonLoopbackAttempts: record.childNonLoopbackAttempts,
  }, {browserNonLoopbackAttempts: 0, serverNonLoopbackAttempts: 0, childNonLoopbackAttempts: 0});
  assert.ok(Array.isArray(record.denialChecks) && record.denialChecks.length === 9 && record.denialChecks.every((entry) => entry === true));
};

const validateCleanupContract = (value: unknown) => {
  assert.deepEqual(value, {anchorRestored: true, sourceRestored: true, browserContextsOpen: 0, activeGates: 0, activeIntercepts: 0, openChildProcesses: 0, openPorts: 0, residualPaths: []});
};

const validateProofVersionTuple = (manifestVersion: unknown, receiptVersion: unknown, lintVersion: unknown) => {
  assert.ok((manifestVersion === 1 && receiptVersion === 1 && lintVersion === 1) || (manifestVersion === 2 && receiptVersion === 2 && lintVersion === 2), "Proof versions may not mix.");
};

const validateLintGate = (value: unknown) => {
  const record = strictObject(value, ["baseCommit", "headCommit", "base", "result", "changedLineFindings", "newFileFindings", "passed"], "Lint gate");
  assert.equal(record.baseCommit, CORRECTION_BASE_COMMIT);
  assert.equal(record.headCommit, CORRECTION_BASE_COMMIT);
  const base = strictObject(record.base, ["errors", "warnings"], "Lint base");
  const result = strictObject(record.result, ["errors", "warnings"], "Lint result");
  assert.ok(Number(result.errors) <= Number(base.errors) && Number(result.warnings) <= Number(base.warnings));
  assert.deepEqual(record.changedLineFindings, []);
  assert.deepEqual(record.newFileFindings, []);
  assert.equal(record.passed, true);
};

const validateReceiptContract = (value: unknown, expectedOrder: number, expectedArgv: string[]) => {
  const receipt = strictObject(value, ["order", "argv", "env", "exitCode", "expectedExitCode", "privacy", "passed"], "Receipt");
  assert.equal(receipt.order, expectedOrder);
  assert.deepEqual(receipt.argv, expectedArgv);
  assert.deepEqual(receipt.env, {});
  assert.equal(receipt.exitCode, 0);
  assert.equal(receipt.expectedExitCode, 0);
  assert.equal(receipt.privacy, "sanitized");
  assert.equal(receipt.passed, true);
};

const validateManifestContract = (value: unknown, expectedArtifact: FileBinding) => {
  const manifest = strictObject(value, ["commandsPassed", "artifacts"], "Manifest");
  assert.equal(manifest.commandsPassed, true);
  assert.ok(Array.isArray(manifest.artifacts) && manifest.artifacts.length === 1);
  assert.deepEqual(manifest.artifacts[0], expectedArtifact);
};

const runOutputCollisionMutation = () => {
  const sandbox = mkdtempSync(resolve(tmpdir(), "spec0001-compat-output-negative-"));
  try {
    const outside = resolve(sandbox, "outside");
    const output = resolve(sandbox, "output");
    mkdirSync(outside);
    symlinkSync(outside, output, "dir");
    validateOutputEntries(output, []);
  } finally {
    rmSync(sandbox, {recursive: true, force: true});
  }
};

const buildNegativeChecks = (
  graph: ValidatedTesterExtension,
  planValue: JsonObject,
  registryValue: JsonObject,
  catalogValue: JsonObject,
  adapterSource: string,
): Record<string, () => unknown> => {
  const result = positiveResult(graph);
  const cleanObservation = observation({
    headCommit: "1".repeat(40),
    untrackedPaths: [],
    baseIsStrictAncestor: true,
    committedChangedPaths: [...CORRECTION_PATHS],
  });
  const lintPositive = {baseCommit: CORRECTION_BASE_COMMIT, headCommit: CORRECTION_BASE_COMMIT, base: {errors: 5, warnings: 73}, result: {errors: 5, warnings: 73}, changedLineFindings: [], newFileFindings: [], passed: true};
  const receiptPositive = {order: 1, argv: ["node", "proof.ts"], env: {}, exitCode: 0, expectedExitCode: 0, privacy: "sanitized", passed: true};
  return {
    "legacy-no-plan-drift": () => {
      const invocation = parseBrowserProofCli([]);
      assert.deepEqual(invocation, {mode: "legacy", runBase: null});
      expectRejected(() => {
        assert.deepEqual({mode: "extension", planPath: COMPATIBILITY_PLAN_PATH}, invocation);
      }, "Forged no-plan extension dispatch");
    },
    "cli-closed-grammar": () => rejectAll([
      () => parseBrowserProofCli(["--unknown=x"]),
      () => parseBrowserProofCli([`--plan=${COMPATIBILITY_PLAN_PATH}`, `--plan=${COMPATIBILITY_PLAN_PATH}`]),
      () => parseBrowserProofCli(["--mode=dirty"]),
      () => parseBrowserProofCli([`--plan=${COMPATIBILITY_PLAN_PATH}`, `--run-base=${CORRECTION_BASE_COMMIT}`]),
    ], "CLI grammar"),
    "unsafe-unregistered-plan": () => rejectAll([
      () => parseBrowserProofCli(["--plan=../escape.json"]),
      () => loadTesterExtensionGraph(ROOT, "scripts/fixtures/spec0001-browser/v2/unregistered.json"),
    ], "Plan selection"),
    "plan-strict-schema": () => {
      const wrongVersion = clone(planValue); wrongVersion.planVersion = 1;
      const extra = clone(planValue); extra.unexpected = true;
      const missing = clone(planValue); delete missing.contexts;
      return rejectAll([
        () => validateExtensionPlanValue(wrongVersion),
        () => validateExtensionPlanValue(extra),
        () => validateExtensionPlanValue(missing),
      ], "Plan schema");
    },
    "expectation-pair": () => {
      const legacy = clone(planValue); legacy.expectedDirtyPaths = legacy.dirtyExpectedPaths; delete legacy.dirtyExpectedPaths; delete legacy.cleanExpectedPaths;
      const duplicate = clone(planValue); duplicate.dirtyExpectedPaths = [...(duplicate.dirtyExpectedPaths as string[]), (duplicate.dirtyExpectedPaths as string[])[0]];
      const missing = clone(planValue); delete missing.cleanExpectedPaths;
      const nonemptyClean = clone(planValue); nonemptyClean.cleanExpectedPaths = [CORRECTION_PATHS[0]];
      return rejectAll([
        () => validateExtensionPlanValue(legacy),
        () => validateExtensionPlanValue(duplicate),
        () => validateExtensionPlanValue(missing),
        () => validateExtensionPlanValue(nonemptyClean),
      ], "Expectation pair");
    },
    "correction-ceiling": () => {
      const badPlan = clone(planValue); badPlan.dirtyExpectedPaths = CORRECTION_PATHS.slice(1);
      const badCatalog = clone(catalogValue);
      ((badCatalog.authorizations as JsonObject[])[0].pathCeiling as string[]).pop();
      return rejectAll([() => validateExtensionPlanValue(badPlan), () => validateAuthorizationCatalogValue(badCatalog)], "Correction ceiling");
    },
    "dirty-set-exact": () => rejectAll([
      () => deriveGitState(ROOT, graph.plan, graph.pathCeiling, observation({untrackedPaths: CORRECTION_PATHS.slice(1)})),
      () => deriveGitState(ROOT, graph.plan, graph.pathCeiling, observation({untrackedPaths: [...CORRECTION_PATHS, PHASE2_PATHS[0]].sort()})),
    ], "Dirty set"),
    "dirty-head-base": () => expectRejected(() => deriveGitState(ROOT, graph.plan, graph.pathCeiling, observation({headCommit: "1".repeat(40)})), "Dirty HEAD/base"),
    "clean-ancestor": () => expectRejected(() => deriveGitState(ROOT, graph.plan, graph.pathCeiling, {...cleanObservation, baseIsStrictAncestor: false}), "Clean ancestor"),
    "clean-projection": () => expectRejected(() => deriveGitState(ROOT, graph.plan, graph.pathCeiling, {...cleanObservation, committedChangedPaths: CORRECTION_PATHS.slice(1)}), "Clean projection"),
    "staged-index": () => rejectAll([
      () => deriveGitState(ROOT, graph.plan, graph.pathCeiling, observation({stagedPaths: [CORRECTION_PATHS[0]]})),
      () => assert.deepEqual(
        compareIndexToHeadEntries(
          Buffer.from(`100644 e69de29bb2d1d6434b8b29ae775ad8c2e48c5391 0\t${CORRECTION_PATHS[3]}\0`),
          Buffer.alloc(0),
        ),
        [],
        "Intent-to-add index entry must differ from an empty HEAD tree projection.",
      ),
    ], "Staged index including intent-to-add"),
    "hidden-state": () => rejectAll([
      () => deriveGitState(ROOT, graph.plan, graph.pathCeiling, observation({hiddenIndexPaths: [CORRECTION_PATHS[0]]})),
      () => deriveGitState(ROOT, graph.plan, graph.pathCeiling, observation({untrackedPaths: CORRECTION_PATHS.slice(1)})),
    ], "Hidden/reverted state"),
    "missing-committed-extension": () => expectRejected(() => {
      const tracked = new Set(CORRECTION_PATHS.slice(1));
      for (const required of CORRECTION_PATHS) assert.ok(tracked.has(required), `Committed extension is missing: ${required}`);
    }, "Missing committed extension"),
    "accepted-binding-drift": () => expectRejected(() => {
      const forged = clone(result);
      forged.bindings.catalog.sha256 = `sha256:${"0".repeat(64)}`;
      validateAcceptedGraphBinding(forged, graph);
    }, "Accepted binding drift"),
    "deferred-binding-forbidden": () => expectRejected(() => {
      const mutated = clone(catalogValue);
      const deferred = (mutated.authorizations as JsonObject[])[1];
      (deferred.plan as JsonObject).byteLength = 1;
      (deferred.plan as JsonObject).sha256 = `sha256:${"0".repeat(64)}`;
      validateAuthorizationCatalogValue(mutated);
    }, "Deferred binding"),
    "phase2-path-substitution": () => expectRejected(() => {
      const mutated = clone(catalogValue);
      ((mutated.authorizations as JsonObject[])[1].adapter as JsonObject).path = COMPATIBILITY_ADAPTER_PATH;
      validateAuthorizationCatalogValue(mutated);
    }, "Phase 2 path substitution"),
    "registry-binding-tamper": () => expectRejected(() => {
      const mutated = clone(planValue);
      (mutated.registry as JsonObject).sha256 = `sha256:${"0".repeat(64)}`;
      assert.deepEqual(validateExtensionPlanValue(mutated).registry, graph.registryBinding);
    }, "Registry binding tamper"),
    "adapter-binding-tamper": () => expectRejected(() => {
      const mutated = clone(registryValue);
      (mutated.adapter as JsonObject).sha256 = `sha256:${"0".repeat(64)}`;
      assert.deepEqual(validateExtensionRegistryValue(mutated).adapter, graph.adapterBinding);
    }, "Adapter binding tamper"),
    "unknown-action-operation-scope": () => expectRejected(() => {
      const mutated = clone(registryValue);
      (mutated.actions as JsonObject[])[0].operation = "executeArbitraryCode";
      validateExtensionRegistryValue(mutated);
    }, "Unknown action operation"),
    "authority-escalation": () => {
      const output = clone(catalogValue); (output.authorizations as JsonObject[])[0].outputRoot = "output/escalated";
      const operations = clone(catalogValue); ((operations.authorizations as JsonObject[])[0].operationFamilies as string[]).push("filesystem");
      const ceiling = clone(catalogValue); ((ceiling.authorizations as JsonObject[])[0].pathCeiling as string[]).push("src/escalated.ts");
      return rejectAll([
        () => validateAuthorizationCatalogValue(output),
        () => validateAuthorizationCatalogValue(operations),
        () => validateAuthorizationCatalogValue(ceiling),
      ], "Authority escalation");
    },
    "adapter-arbitrary-code": () => expectRejected(() => parseAdapterDeclarationSource("export default (() => ({ arbitrary: true }))() as const;"), "Arbitrary adapter code"),
    "adapter-node-filesystem-process": () => expectRejected(() => parseAdapterDeclarationSource(`import fs from "node:fs";\n${adapterSource}\nvoid process.cwd();`), "Adapter Node authority"),
    "adapter-browser-network-storage-ui": () => expectRejected(() => parseAdapterDeclarationSource(`${adapterSource}\nvoid window.fetch("https://example.invalid");\nvoid localStorage.clear();`), "Adapter browser authority"),
    "unauthorized-dirty-path": () => expectRejected(() => deriveGitState(ROOT, graph.plan, graph.pathCeiling, observation({untrackedPaths: [...CORRECTION_PATHS, "src/unauthorized.ts"].sort()})), "Unauthorized dirty path"),
    "missing-required-file": () => expectRejected(() => bindRepositoryFile(ROOT, "scripts/fixtures/spec0001-browser/v2/required-but-missing.json"), "Missing required file"),
    "output-collision-symlink-extra": () => expectRejected(runOutputCollisionMutation, "Output symlink"),
    "anchor-preimage-restoration": () => expectRejected(() => validateAnchorLifecycle(`sha256:${"1".repeat(64)}`, `sha256:${"2".repeat(64)}`, `sha256:${"3".repeat(64)}`), "Anchor restoration"),
    "nonloopback-denial": () => expectRejected(() => validateNetworkContract({browserNonLoopbackAttempts: 0, serverNonLoopbackAttempts: 1, childNonLoopbackAttempts: 0, denialChecks: Array(9).fill(true)}), "Network denial"),
    "cleanup-residue": () => expectRejected(() => validateCleanupContract({anchorRestored: true, sourceRestored: true, browserContextsOpen: 0, activeGates: 0, activeIntercepts: 0, openChildProcesses: 0, openPorts: 0, residualPaths: [".next"]}), "Cleanup residue"),
    "v1-v2-mixing": () => expectRejected(() => validateProofVersionTuple(2, 1, 2), "Proof version mixing"),
    "lint-base-missing-forged": () => expectRejected(() => validateLintGate({...lintPositive, baseCommit: "0".repeat(40)}), "Lint base"),
    "lint-regression": () => expectRejected(() => validateLintGate({...lintPositive, result: {errors: 5, warnings: 74}}), "Lint regression"),
    "changed-line-finding": () => expectRejected(() => validateLintGate({...lintPositive, changedLineFindings: [{path: "x.ts", line: 1}]}), "Changed-line lint finding"),
    "result-derived-binding": () => expectRejected(() => {
      const forged = clone(result); forged.derivedGitState = "clean-committed"; forged.observedDirtyPaths = []; forged.selectedExpectedPaths = [];
      validateExtensionResult(forged, ROOT, true);
    }, "Derived result binding"),
    "receipt-metadata": () => rejectAll([
      () => validateReceiptContract({...receiptPositive, order: 2}, 1, ["node", "proof.ts"]),
      () => validateReceiptContract({...receiptPositive, argv: ["node", "other.ts"]}, 1, ["node", "proof.ts"]),
      () => validateReceiptContract({...receiptPositive, env: {TOKEN: "secret"}}, 1, ["node", "proof.ts"]),
      () => validateReceiptContract({...receiptPositive, exitCode: 1, passed: false}, 1, ["node", "proof.ts"]),
      () => validateReceiptContract({...receiptPositive, privacy: "raw"}, 1, ["node", "proof.ts"]),
    ], "Receipt metadata"),
    "manifest-artifact-hash": () => expectRejected(() => {
      const binding = graph.planBinding;
      validateManifestContract({commandsPassed: true, artifacts: [{...binding, sha256: `sha256:${"0".repeat(64)}`}]}, binding);
    }, "Manifest artifact hash"),
    "false-commands-passed": () => expectRejected(() => validateManifestContract({commandsPassed: false, artifacts: [graph.planBinding]}, graph.planBinding), "False commandsPassed"),
  };
};

const writeNegativeLedger = (cases: NegativeCase[], results: Array<{name: string; status: "passed"; expectedCode: string}>) => {
  const outputPath = absolute(NEGATIVE_LEDGER_PATH);
  ensureOutputDirectory(relative(REAL_ROOT, dirname(outputPath)));
  const existing = readdirSync(dirname(outputPath), {withFileTypes: true}).map((entry) => entry.name).sort();
  assert.deepEqual(existing, [], "Negative self-test requires an empty, exclusively owned synthetic output directory.");
  const ledger = {ledgerVersion: 1, fixture: bindRepositoryFile(ROOT, NEGATIVE_FIXTURE_PATH), results};
  writeFileSync(outputPath, `${JSON.stringify(ledger, null, 2)}\n`, {encoding: "utf8", mode: 0o600, flag: "wx"});
  assert.equal(lstatSync(outputPath).isFile(), true, "Negative ledger must be a regular file.");
  assert.equal(lstatSync(outputPath).isSymbolicLink(), false, "Negative ledger symlink rejected.");
  assert.equal(realpathSync(outputPath), outputPath, "Negative ledger real path mismatch.");
  const recorded = strictObject(readJson(NEGATIVE_LEDGER_PATH), ["ledgerVersion", "fixture", "results"], "Negative ledger");
  assert.equal(recorded.ledgerVersion, 1);
  assert.deepEqual(recorded.fixture, bindRepositoryFile(ROOT, NEGATIVE_FIXTURE_PATH));
  assert.deepEqual(recorded.results, results);
  assert.equal(cases.length, results.length);
};

const runSelfTest = () => {
  assert.equal(git("rev-parse", "HEAD"), CORRECTION_BASE_COMMIT);
  assert.equal(git("diff", "--cached", "--name-only"), "");
  assert.equal(CORRECTION_PATHS.length, 23);
  const graph = loadTesterExtensionGraph(ROOT, COMPATIBILITY_PLAN_PATH);
  assert.equal(graph.authorizationId, "phase-1.5-compatibility-synthetic/v1");
  assert.equal(graph.materializationKind, "materialized");
  assert.equal(graph.git.derivedGitState, "dirty-executor");
  assert.deepEqual(graph.git.observedDirtyPaths, CORRECTION_PATHS);
  assert.deepEqual(graph.git.dirtyExpectedPaths, CORRECTION_PATHS);
  assert.deepEqual(graph.git.cleanExpectedPaths, []);
  assert.deepEqual(graph.git.selectedExpectedPaths, CORRECTION_PATHS);
  validateExtensionResult(positiveResult(graph), ROOT, true);
  const clean = deriveGitState(ROOT, graph.plan, graph.pathCeiling, observation({
    headCommit: "1".repeat(40),
    untrackedPaths: [],
    baseIsStrictAncestor: true,
    committedChangedPaths: [...CORRECTION_PATHS],
  }));
  assert.equal(clean.derivedGitState, "clean-committed");
  assert.deepEqual(clean.observedDirtyPaths, []);
  assert.deepEqual(clean.selectedExpectedPaths, []);

  const fixtureRecord = strictObject(readJson(NEGATIVE_FIXTURE_PATH), ["fixtureVersion", "cases"], "Negative fixture");
  assert.equal(fixtureRecord.fixtureVersion, 2);
  assert.ok(Array.isArray(fixtureRecord.cases) && fixtureRecord.cases.length === 37);
  const cases = fixtureRecord.cases.map((entry, index) => {
    const value = strictObject(entry, ["name", "category", "expectedCode"], `Negative case ${index}`);
    assert.ok(typeof value.name === "string" && typeof value.category === "string" && typeof value.expectedCode === "string");
    return value as NegativeCase;
  });
  assert.equal(new Set(cases.map((entry) => entry.name)).size, 37);
  assert.equal(new Set(cases.map((entry) => entry.expectedCode)).size, 37);

  const planValue = strictObject(readJson(COMPATIBILITY_PLAN_PATH), Object.keys(readJson(COMPATIBILITY_PLAN_PATH) as JsonObject), "Plan source");
  const registryValue = strictObject(readJson(COMPATIBILITY_REGISTRY_PATH), Object.keys(readJson(COMPATIBILITY_REGISTRY_PATH) as JsonObject), "Registry source");
  const catalogValue = strictObject(readJson(CATALOG_PATH), Object.keys(readJson(CATALOG_PATH) as JsonObject), "Catalog source");
  const adapterSource = readFileSync(absolute(COMPATIBILITY_ADAPTER_PATH), "utf8");
  const checks = buildNegativeChecks(graph, planValue, registryValue, catalogValue, adapterSource);
  assert.deepEqual(Object.keys(checks).sort(), cases.map((entry) => entry.name).sort(), "Negative implementation/fixture case set mismatch.");
  const results = cases.map((entry) => {
    activeExpectedCode = entry.expectedCode;
    checks[entry.name]();
    assert.ok(observedRejectionCodes.has(entry.expectedCode), `Negative case did not produce its stable rejection code: ${entry.expectedCode}`);
    activeExpectedCode = null;
    return {name: entry.name, status: "passed" as const, expectedCode: entry.expectedCode};
  });
  writeNegativeLedger(cases, results);
  console.log(`SPEC-0001 Phase 1.5 compatibility self-test passed: one complete dirty graph, one clean-state derivation, and ${results.length} exact negative cases.`);
};

const main = () => {
  assert.deepEqual(process.argv.slice(2), ["--self-test"], "Use exactly --self-test.");
  runSelfTest();
};

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main();
