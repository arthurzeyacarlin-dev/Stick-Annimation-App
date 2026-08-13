import assert from "node:assert/strict";
import {spawnSync} from "node:child_process";
import {createHash} from "node:crypto";
import {lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, readlinkSync, rmSync, unlinkSync, writeFileSync} from "node:fs";
import {dirname, relative, resolve, sep} from "node:path";
import {pathToFileURL} from "node:url";

type JsonObject = Record<string, unknown>;
type FileBinding = {path: string; sha256: string; byteLength: number};

const ROOT = process.cwd();
const HASH_PATTERN = /^sha256:[0-9a-f]{64}$/;
const GIT_SHA_PATTERN = /^[0-9a-f]{40}$/;
const DECISION_PATTERN = /^[0-9a-f]{64}$/;

const sha256Bytes = (bytes: Uint8Array | string) => `sha256:${createHash("sha256").update(bytes).digest("hex")}`;

const strictObject = (value: unknown, keys: readonly string[], label: string): JsonObject => {
  assert.ok(value !== null && typeof value === "object" && !Array.isArray(value), `${label} must be an object.`);
  const object = value as JsonObject;
  assert.deepEqual(Object.keys(object).sort(), [...keys].sort(), `${label} fields must be exact.`);
  return object;
};

const readJson = (path: string) => JSON.parse(readFileSync(resolve(ROOT, path), "utf8")) as unknown;

const safeRepositoryPath = (path: unknown, label: string) => {
  assert.equal(typeof path, "string", `${label} path must be a string.`);
  const absolute = resolve(ROOT, path as string);
  const local = relative(ROOT, absolute);
  assert.ok(local !== ".." && !local.startsWith(`..${sep}`), `${label} path escapes the repository.`);
  return {path: path as string, absolute};
};

const validateBinding = (value: unknown, label: string): FileBinding => {
  const binding = strictObject(value, ["path", "sha256", "byteLength"], label);
  const {path, absolute} = safeRepositoryPath(binding.path, label);
  assert.match(binding.sha256 as string, HASH_PATTERN, `${label} SHA is invalid.`);
  assert.ok(Number.isSafeInteger(binding.byteLength) && (binding.byteLength as number) >= 0, `${label} byte length is invalid.`);
  const bytes = readFileSync(absolute);
  assert.equal(bytes.byteLength, binding.byteLength, `${label} byte length mismatch.`);
  assert.equal(sha256Bytes(bytes), binding.sha256, `${label} SHA mismatch.`);
  return {path, sha256: binding.sha256 as string, byteLength: binding.byteLength as number};
};

const validateCapturedBytes = (value: unknown, label: string) => {
  const captured = strictObject(value, ["encoding", "byteLength", "sha256", "data"], label);
  assert.equal(captured.encoding, "base64", `${label} encoding must be base64.`);
  assert.equal(typeof captured.data, "string", `${label} data must be a string.`);
  const bytes = Buffer.from(captured.data as string, "base64");
  assert.equal(bytes.toString("base64"), captured.data, `${label} base64 is not canonical.`);
  assert.equal(bytes.byteLength, captured.byteLength, `${label} byte length mismatch.`);
  assert.equal(sha256Bytes(bytes), captured.sha256, `${label} SHA mismatch.`);
  return bytes;
};

const secretPattern = /(?:sk-[A-Za-z0-9_-]{16,}|Bearer\s+[A-Za-z0-9._-]{12,}|(?:api[_-]?key|authorization|secret)\s*[:=]\s*["']?[A-Za-z0-9._-]{12,})/i;

const phaseOneExpectedCommandArgv = [
  ["node", "--experimental-strip-types", "scripts/validateStickFigureAiContracts.ts"],
  ["node", "--experimental-strip-types", "scripts/validateSpec0001ProofBundle.ts", "--self-test"],
  ["node", "--experimental-strip-types", "scripts/finalizeSpec0001ProofBundle.ts", "--self-test"],
  ["./node_modules/.bin/tsc", "--noEmit", "--incremental", "false"],
  ["npm", "run", "lint"],
  ["git", "diff", "--check"],
  ["git", "status", "--short", "--branch"],
];

const validateCommandConfig = (value: unknown, phase: number, base: string) => {
  const config = strictObject(value, ["configVersion", "phase", "baseCommit", "bindings", "browserEvidenceInput", "commands"], "command config");
  assert.equal(config.configVersion, 1, "Command config version mismatch.");
  assert.equal(config.phase, phase, "Command config phase mismatch.");
  assert.equal(config.baseCommit, base, "Command config base mismatch.");
  const bindingConfig = strictObject(config.bindings, ["sources", "fixtures", "schemas", "harness", "plans"], "command binding config");
  const bindingPaths = Object.fromEntries(Object.entries(bindingConfig).map(([kind, paths]) => {
    assert.ok(Array.isArray(paths) && paths.every((path) => typeof path === "string" && path.length > 0), `${kind} bindings must be path strings.`);
    assert.equal(new Set(paths as string[]).size, (paths as string[]).length, `${kind} bindings contain duplicates.`);
    return [kind, paths as string[]];
  })) as Record<"sources" | "fixtures" | "schemas" | "harness" | "plans", string[]>;
  const everyBindingPath = Object.values(bindingPaths).flat();
  assert.equal(new Set(everyBindingPath).size, everyBindingPath.length, "Binding paths must be unique across categories.");
  assert.ok(config.browserEvidenceInput === null || (typeof config.browserEvidenceInput === "string" && config.browserEvidenceInput.startsWith("output/spec-0001/")), "Browser evidence input path is invalid.");
  assert.ok(Array.isArray(config.commands), "Command config commands must be an array.");
  assert.ok(config.commands.length > 0, "Command config must declare at least one command.");
  const commands = config.commands.map((entry, index) => {
    assert.ok(entry !== null && typeof entry === "object" && !Array.isArray(entry), `Command ${index} must be an object.`);
    const hasLintBaseline = Object.prototype.hasOwnProperty.call(entry, "lintBaseline");
    const expectedKeys = hasLintBaseline
      ? ["name", "argv", "cwd", "env", "expectedExitCode", "privacy", "lintBaseline"]
      : ["name", "argv", "cwd", "env", "expectedExitCode", "privacy"];
    const command = strictObject(entry, expectedKeys, `command ${index}`);
    assert.equal(typeof command.name, "string", `Command ${index} name must be a string.`);
    assert.ok(Array.isArray(command.argv) && command.argv.length > 0 && command.argv.every((argument) => typeof argument === "string" && argument.length > 0), `Command ${index} argv must be a non-empty string array.`);
    assert.equal(command.cwd, ".", `Command ${index} cwd mismatch.`);
    assert.ok(command.env !== null && typeof command.env === "object" && !Array.isArray(command.env) && Object.values(command.env as JsonObject).every((value) => typeof value === "string"), `Command ${index} env overrides must be strings.`);
    assert.equal(command.privacy, "sanitized", `Command ${index} privacy marker mismatch.`);
    assert.ok(Number.isInteger(command.expectedExitCode), `Command ${index} expected exit must be an integer.`);
    assert.ok(!["sh", "bash", "zsh"].includes((command.argv as string[])[0]) && !(command.argv as string[]).includes("-c"), `Command ${index} may not use a shell interpreter.`);
    if (hasLintBaseline) {
      assert.equal(command.name, "lint-regression", `Only lint-regression may carry lint metadata.`);
      assert.equal(command.expectedExitCode, 1, "Lint expected exit must preserve the known failing baseline.");
      assert.deepEqual(command.lintBaseline, {errors: 6, warnings: 73, phasePathFindings: 0}, "Lint baseline metadata mismatch.");
    }
    return command;
  });
  if (phase === 1) {
    assert.equal(config.browserEvidenceInput, null, "Phase 1 browser evidence must be not applicable.");
    assert.equal(commands.length, phaseOneExpectedCommandArgv.length, "Phase 1 command count mismatch.");
    commands.forEach((command, index) => {
      assert.deepEqual(command.argv, phaseOneExpectedCommandArgv[index], `Phase 1 command ${index} argv/order mismatch.`);
      assert.equal(command.expectedExitCode, index === 4 ? 1 : 0, `Phase 1 command ${index} expected exit mismatch.`);
      assert.deepEqual(command.env, {}, `Phase 1 command ${index} env additions must be empty.`);
    });
  }
  return {commands, bindingPaths, browserEvidenceInput: config.browserEvidenceInput as string | null};
};

const validateReceipt = (value: unknown, command: JsonObject, order: number) => {
  const receipt = strictObject(
    value,
    ["receiptVersion", "name", "order", "argv", "cwd", "env", "privacy", "startedAt", "durationMs", "exitCode", "expectedExitCode", "passed", "stdout", "stderr", "lintBaseline"],
    `receipt ${order}`,
  );
  assert.equal(receipt.receiptVersion, 1, `Receipt ${order} version mismatch.`);
  assert.equal(receipt.name, command.name, `Receipt ${order} name mismatch.`);
  assert.equal(receipt.order, order, `Receipt ${order} order mismatch.`);
  assert.deepEqual(receipt.argv, command.argv, `Receipt ${order} argv mismatch.`);
  assert.equal(receipt.cwd, command.cwd, `Receipt ${order} cwd mismatch.`);
  assert.deepEqual(receipt.env, command.env, `Receipt ${order} env mismatch.`);
  assert.equal(receipt.privacy, "sanitized", `Receipt ${order} privacy mismatch.`);
  assert.ok(typeof receipt.startedAt === "string" && !Number.isNaN(Date.parse(receipt.startedAt)), `Receipt ${order} timestamp invalid.`);
  assert.ok(Number.isSafeInteger(receipt.durationMs) && (receipt.durationMs as number) >= 0, `Receipt ${order} duration invalid.`);
  assert.equal(receipt.exitCode, command.expectedExitCode, `Receipt ${order} actual exit mismatch.`);
  assert.equal(receipt.expectedExitCode, command.expectedExitCode, `Receipt ${order} expected exit mismatch.`);
  assert.equal(receipt.passed, true, `Receipt ${order} did not pass.`);
  const stdout = validateCapturedBytes(receipt.stdout, `receipt ${order} stdout`);
  const stderr = validateCapturedBytes(receipt.stderr, `receipt ${order} stderr`);
  assert.ok(!secretPattern.test(Buffer.concat([stdout, stderr]).toString("utf8")), `Receipt ${order} contains privacy-invalid evidence.`);
  if (command.lintBaseline !== undefined) assert.deepEqual(receipt.lintBaseline, command.lintBaseline, "Lint receipt baseline mismatch.");
  else assert.equal(receipt.lintBaseline, null, `Receipt ${order} must not carry lint metadata.`);
};

const requireString = (value: unknown, label: string) => {
  assert.ok(typeof value === "string" && value.length > 0, `${label} must be a non-empty string.`);
  return value;
};

const requireCount = (value: unknown, label: string) => {
  assert.ok(Number.isSafeInteger(value) && (value as number) >= 0, `${label} must be a non-negative safe integer.`);
  return value as number;
};

const requireDigest = (value: unknown, label: string) => {
  assert.match(value as string, HASH_PATTERN, `${label} must be a SHA-256 digest.`);
  return value as string;
};

const validateEvidenceFileBinding = (value: unknown, label: string, artifactPaths: Set<string>) => {
  const binding = validateBinding(value, label);
  assert.ok(artifactPaths.has(binding.path), `${label} is not present in the proof artifact inventory.`);
  return binding;
};

const assertUniqueStrings = (values: string[], label: string) => {
  assert.equal(new Set(values).size, values.length, `${label} must be unique.`);
};

const validateBrowserEvidence = (
  value: unknown,
  phase: number,
  browserEvidenceInput: string | null,
  artifactPaths: Set<string>,
) => {
  const evidence = strictObject(value, [
    "evidenceVersion", "browserStatus", "notApplicableReason", "browserVersion", "browserPlan", "operations",
    "stateCheckpoints", "storageCheckpoints", "requestRecords", "networkRecords", "consoleRecords", "screenshots", "cleanup",
  ], "browser evidence");
  assert.equal(evidence.evidenceVersion, 1, "Browser evidence version mismatch.");
  const arrayFields = ["operations", "stateCheckpoints", "storageCheckpoints", "requestRecords", "networkRecords", "consoleRecords", "screenshots"] as const;
  for (const field of arrayFields) assert.ok(Array.isArray(evidence[field]), `${field} must be an array.`);
  const cleanup = strictObject(evidence.cleanup, [
    "status", "reason", "proofAnchor", "isolatedContextCount", "closedContextCount", "activeGateCount",
    "activeInterceptCount", "childProcessCount", "openChildProcessCount", "residualArtifactPaths",
  ], "browser cleanup");
  const anchor = strictObject(cleanup.proofAnchor, [
    "status", "targetPath", "preimageSha256", "replacementSha256", "restoredSha256", "instrumentationAttributableDiff",
  ], "proof-anchor cleanup");
  for (const field of ["isolatedContextCount", "closedContextCount", "activeGateCount", "activeInterceptCount", "childProcessCount", "openChildProcessCount"] as const) {
    requireCount(cleanup[field], `cleanup.${field}`);
  }
  assert.ok(Array.isArray(cleanup.residualArtifactPaths) && cleanup.residualArtifactPaths.every((path) => typeof path === "string" && path.length > 0), "Cleanup residual paths must be strings.");

  if (evidence.browserStatus === "not-applicable") {
    assert.equal(phase, 1, "Only Phase 1 may mark browser evidence not applicable.");
    assert.equal(browserEvidenceInput, null, "Not-applicable evidence cannot have an input artifact.");
    requireString(evidence.notApplicableReason, "Not-applicable reason");
    assert.equal(evidence.browserVersion, null, "Not-applicable evidence cannot name a browser version.");
    assert.equal(evidence.browserPlan, null, "Not-applicable evidence cannot bind a browser plan.");
    for (const field of arrayFields) assert.deepEqual(evidence[field], [], `Not-applicable ${field} must be empty.`);
    assert.equal(cleanup.status, "not-applicable", "Phase 1 cleanup status mismatch.");
    requireString(cleanup.reason, "Not-applicable cleanup reason");
    assert.deepEqual(anchor, {
      status: "not-applicable", targetPath: null, preimageSha256: null, replacementSha256: null,
      restoredSha256: null, instrumentationAttributableDiff: null,
    }, "Not-applicable proof-anchor tuple mismatch.");
    assert.equal(cleanup.isolatedContextCount, 0);
    assert.equal(cleanup.closedContextCount, 0);
    assert.equal(cleanup.activeGateCount, 0);
    assert.equal(cleanup.activeInterceptCount, 0);
    assert.equal(cleanup.childProcessCount, 0);
    assert.equal(cleanup.openChildProcessCount, 0);
    assert.deepEqual(cleanup.residualArtifactPaths, []);
    return evidence;
  }

  assert.equal(evidence.browserStatus, "captured", "Unknown browser evidence status.");
  assert.ok(phase >= 2, "Captured browser evidence is not a Phase 1 claim.");
  assert.equal(evidence.notApplicableReason, null, "Captured evidence cannot carry a not-applicable reason.");
  requireString(evidence.browserVersion, "Browser version");
  assert.ok(browserEvidenceInput !== null, "Captured browser evidence requires an input artifact.");
  const inputBinding = validateEvidenceFileBinding({
    path: browserEvidenceInput,
    sha256: sha256Bytes(readFileSync(resolve(ROOT, browserEvidenceInput))),
    byteLength: readFileSync(resolve(ROOT, browserEvidenceInput)).byteLength,
  }, "browser evidence input", artifactPaths);
  assert.deepEqual(JSON.parse(readFileSync(resolve(ROOT, inputBinding.path), "utf8")), evidence, "Browser evidence input and manifest evidence differ.");
  validateEvidenceFileBinding(evidence.browserPlan, "browser plan", artifactPaths);

  const operations = (evidence.operations as unknown[]).map((entry, index) => {
    const operation = strictObject(entry, ["stepId", "channel", "operationId", "fixtureKind", "fixtureDigest", "outcomeCode", "assertion", "artifact"], `operation ${index}`);
    requireString(operation.stepId, `operation ${index} stepId`);
    assert.ok(["workspace_driver", "runner_environment", "visible_ui", "guarded_http", "node_only"].includes(operation.channel as string), `operation ${index} channel invalid.`);
    requireString(operation.operationId, `operation ${index} operationId`);
    assert.ok((operation.fixtureKind === null && operation.fixtureDigest === null) || (typeof operation.fixtureKind === "string" && operation.fixtureKind.length > 0 && HASH_PATTERN.test(operation.fixtureDigest as string)), `operation ${index} fixture binding is inconsistent.`);
    requireString(operation.outcomeCode, `operation ${index} outcomeCode`);
    assert.equal(typeof operation.assertion, "boolean", `operation ${index} assertion marker invalid.`);
    if (operation.artifact !== null) validateEvidenceFileBinding(operation.artifact, `operation ${index} artifact`, artifactPaths);
    return operation;
  });
  assert.ok(operations.length > 0 && operations.some((operation) => operation.assertion === true), "Captured evidence needs at least one operation assertion.");
  assertUniqueStrings(operations.map((entry) => entry.stepId as string), "Operation step IDs");

  const states = (evidence.stateCheckpoints as unknown[]).map((entry, index) => {
    const state = strictObject(entry, ["checkpointId", "sourceChannel", "operationId", "checkpointKind", "checkpointDigest", "assertionPassed", "artifact"], `state checkpoint ${index}`);
    requireString(state.checkpointId, `state checkpoint ${index} ID`);
    assert.ok(state.sourceChannel === "workspace_driver" || state.sourceChannel === "runner_environment", `state checkpoint ${index} source invalid.`);
    requireString(state.operationId, `state checkpoint ${index} operation ID`);
    assert.ok(state.checkpointKind === "workspace" || state.checkpointKind === "environment", `state checkpoint ${index} kind invalid.`);
    requireDigest(state.checkpointDigest, `state checkpoint ${index} digest`);
    assert.equal(state.assertionPassed, true, `state checkpoint ${index} did not pass.`);
    validateEvidenceFileBinding(state.artifact, `state checkpoint ${index} artifact`, artifactPaths);
    return state;
  });
  assert.ok(states.length > 0, "Captured evidence needs state checkpoints.");
  assertUniqueStrings(states.map((entry) => entry.checkpointId as string), "State checkpoint IDs");

  const storage = (evidence.storageCheckpoints as unknown[]).map((entry, index) => {
    const record = strictObject(entry, ["checkpointId", "operationId", "storageDigest", "keyCount", "getAttemptCount", "getFailureCount", "setAttemptCount", "setSuccessCount", "setFailureCount", "artifact"], `storage checkpoint ${index}`);
    requireString(record.checkpointId, `storage checkpoint ${index} ID`);
    requireString(record.operationId, `storage checkpoint ${index} operation ID`);
    requireDigest(record.storageDigest, `storage checkpoint ${index} digest`);
    for (const field of ["keyCount", "getAttemptCount", "getFailureCount", "setAttemptCount", "setSuccessCount", "setFailureCount"] as const) requireCount(record[field], `storage checkpoint ${index} ${field}`);
    assert.equal(record.setAttemptCount, (record.setSuccessCount as number) + (record.setFailureCount as number), `storage checkpoint ${index} set counts mismatch.`);
    assert.ok((record.getFailureCount as number) <= (record.getAttemptCount as number), `storage checkpoint ${index} get counts mismatch.`);
    validateEvidenceFileBinding(record.artifact, `storage checkpoint ${index} artifact`, artifactPaths);
    return record;
  });
  assert.ok(storage.length > 0, "Captured evidence needs storage checkpoints, including zero-count sentinel proof when no storage action occurs.");
  assertUniqueStrings(storage.map((entry) => entry.checkpointId as string), "Storage checkpoint IDs");

  const requests = (evidence.requestRecords as unknown[]).map((entry, index) => {
    const record = strictObject(entry, ["recordId", "operationId", "requestCount", "method", "path", "requestBodyDigest", "responseStatus", "responseBodyDigest", "artifact"], `request record ${index}`);
    requireString(record.recordId, `request record ${index} ID`);
    requireString(record.operationId, `request record ${index} operation ID`);
    const count = requireCount(record.requestCount, `request record ${index} count`);
    if (count === 0) assert.deepEqual([record.method, record.path, record.requestBodyDigest, record.responseStatus, record.responseBodyDigest], [null, null, null, null, null], `zero-count request record ${index} must carry null details.`);
    else {
      assert.match(record.method as string, /^[A-Z]+$/, `request record ${index} method invalid.`);
      requireString(record.path, `request record ${index} path`);
      requireDigest(record.requestBodyDigest, `request record ${index} body digest`);
      if (record.responseStatus !== null) assert.ok(Number.isInteger(record.responseStatus) && (record.responseStatus as number) >= 100 && (record.responseStatus as number) <= 599, `request record ${index} response status invalid.`);
      if (record.responseBodyDigest !== null) requireDigest(record.responseBodyDigest, `request record ${index} response digest`);
    }
    validateEvidenceFileBinding(record.artifact, `request record ${index} artifact`, artifactPaths);
    return record;
  });
  assert.ok(requests.length > 0, "Captured evidence needs request records, including an exact zero-count record when no request is expected.");
  assertUniqueStrings(requests.map((entry) => entry.recordId as string), "Request record IDs");

  const networks = (evidence.networkRecords as unknown[]).map((entry, index) => {
    const record = strictObject(entry, ["recordId", "boundary", "requestCount", "loopbackRequestCount", "nonLoopbackAttemptCount", "ledgerDigest", "artifact"], `network record ${index}`);
    requireString(record.recordId, `network record ${index} ID`);
    assert.ok(record.boundary === "browser" || record.boundary === "server" || record.boundary === "child", `network record ${index} boundary invalid.`);
    const requestCount = requireCount(record.requestCount, `network record ${index} request count`);
    const loopback = requireCount(record.loopbackRequestCount, `network record ${index} loopback count`);
    const nonLoopback = requireCount(record.nonLoopbackAttemptCount, `network record ${index} non-loopback count`);
    assert.equal(requestCount, loopback + nonLoopback, `network record ${index} counts mismatch.`);
    requireDigest(record.ledgerDigest, `network record ${index} ledger digest`);
    validateEvidenceFileBinding(record.artifact, `network record ${index} artifact`, artifactPaths);
    return record;
  });
  assert.ok(networks.length > 0, "Captured evidence needs network-guard records.");
  assertUniqueStrings(networks.map((entry) => entry.recordId as string), "Network record IDs");

  const consoles = (evidence.consoleRecords as unknown[]).map((entry, index) => {
    const record = strictObject(entry, ["recordId", "contextId", "warningCount", "errorCount", "ledgerDigest", "artifact"], `console record ${index}`);
    requireString(record.recordId, `console record ${index} ID`);
    requireString(record.contextId, `console record ${index} context`);
    requireCount(record.warningCount, `console record ${index} warning count`);
    requireCount(record.errorCount, `console record ${index} error count`);
    requireDigest(record.ledgerDigest, `console record ${index} ledger digest`);
    validateEvidenceFileBinding(record.artifact, `console record ${index} artifact`, artifactPaths);
    return record;
  });
  assert.ok(consoles.length > 0, "Captured evidence needs sanitized console records.");
  assertUniqueStrings(consoles.map((entry) => entry.recordId as string), "Console record IDs");

  const screenshots = (evidence.screenshots as unknown[]).map((entry, index) => {
    const shot = strictObject(entry, ["screenshotId", "stepId", "viewport", "stateCheckpointDigest", "image"], `screenshot ${index}`);
    requireString(shot.screenshotId, `screenshot ${index} ID`);
    requireString(shot.stepId, `screenshot ${index} step ID`);
    const viewport = strictObject(shot.viewport, ["width", "height"], `screenshot ${index} viewport`);
    assert.ok((viewport.width === 1440 && viewport.height === 900) || (viewport.width === 1024 && viewport.height === 768), `screenshot ${index} viewport is outside the frozen pairs.`);
    requireDigest(shot.stateCheckpointDigest, `screenshot ${index} state digest`);
    validateEvidenceFileBinding(shot.image, `screenshot ${index} image`, artifactPaths);
    return shot;
  });
  assert.ok(screenshots.length > 0, "Captured browser evidence needs screenshots bound to state checkpoints.");
  assertUniqueStrings(screenshots.map((entry) => entry.screenshotId as string), "Screenshot IDs");

  assert.equal(cleanup.status, "passed", "Captured browser cleanup must pass.");
  assert.equal(cleanup.reason, null, "Passed cleanup cannot carry a not-applicable reason.");
  assert.equal(anchor.status, "restored", "Proof anchor must be restored.");
  requireString(anchor.targetPath, "Proof-anchor target path");
  const preimage = requireDigest(anchor.preimageSha256, "Proof-anchor preimage");
  const replacement = requireDigest(anchor.replacementSha256, "Proof-anchor replacement");
  const restored = requireDigest(anchor.restoredSha256, "Proof-anchor restored digest");
  assert.notEqual(replacement, preimage, "Proof-anchor replacement must differ from its preimage.");
  assert.equal(restored, preimage, "Proof-anchor restoration is not byte-identical.");
  assert.equal(anchor.instrumentationAttributableDiff, 0, "Proof-anchor instrumentation left a diff.");
  assert.ok((cleanup.isolatedContextCount as number) > 0 && cleanup.closedContextCount === cleanup.isolatedContextCount, "All isolated browser contexts must close.");
  assert.equal(cleanup.activeGateCount, 0, "Browser cleanup left active gates.");
  assert.equal(cleanup.activeInterceptCount, 0, "Browser cleanup left active intercepts.");
  assert.equal(cleanup.openChildProcessCount, 0, "Browser cleanup left child processes open.");
  assert.deepEqual(cleanup.residualArtifactPaths, [], "Browser cleanup left residual artifacts.");
  return evidence;
};

const listFilesRecursively = (directory: string): string[] => {
  const files: string[] = [];
  for (const entry of readdirSync(directory, {withFileTypes: true})) {
    const absolute = resolve(directory, entry.name);
    assert.ok(!entry.isSymbolicLink(), `Proof output may not contain symlinks: ${relative(ROOT, absolute)}`);
    if (entry.isDirectory()) files.push(...listFilesRecursively(absolute));
    else {
      assert.ok(entry.isFile(), `Unsupported proof artifact type: ${relative(ROOT, absolute)}`);
      files.push(relative(ROOT, absolute));
    }
  }
  return files.sort();
};

export const validateProofManifest = (manifestPath: string, allowedOutputArtifacts: string[] = []) => {
  const manifest = strictObject(
    readJson(manifestPath),
    ["manifestVersion", "specId", "phase", "baseCommit", "headCommit", "recordedAt", "runtime", "commandConfig", "receipts", "artifacts", "bindings", "evidence", "commandsPassed", "lintBaseline"],
    "proof manifest",
  );
  assert.equal(manifest.manifestVersion, 1, "Manifest version mismatch.");
  assert.equal(manifest.specId, "SPEC-0001", "Manifest spec mismatch.");
  assert.ok(Number.isSafeInteger(manifest.phase) && (manifest.phase as number) >= 1 && (manifest.phase as number) <= 7, "Manifest phase invalid.");
  assert.match(manifest.baseCommit as string, GIT_SHA_PATTERN, "Manifest base SHA invalid.");
  assert.match(manifest.headCommit as string, GIT_SHA_PATTERN, "Manifest head SHA invalid.");
  assert.equal(manifest.headCommit, manifest.baseCommit, "Phase proof must execute before publication on the exact base commit.");
  assert.ok(typeof manifest.recordedAt === "string" && !Number.isNaN(Date.parse(manifest.recordedAt)), "Manifest timestamp invalid.");
  const runtime = strictObject(manifest.runtime, ["nodeVersion", "npmVersion", "browserVersion", "textEncoderAvailable", "webCryptoAvailable"], "runtime");
  assert.equal(typeof runtime.nodeVersion, "string", "Node version missing.");
  requireString(runtime.npmVersion, "npm version");
  assert.equal(runtime.textEncoderAvailable, true, "TextEncoder availability not proven.");
  assert.equal(runtime.webCryptoAvailable, true, "WebCrypto availability not proven.");
  const configBinding = validateBinding(manifest.commandConfig, "command config binding");
  assert.equal(configBinding.path, `scripts/fixtures/stick-ai/v1/phase-${manifest.phase}-proof-commands.json`, "Unexpected command config path.");
  const config = validateCommandConfig(readJson(configBinding.path), manifest.phase as number, manifest.baseCommit as string);
  const commands = config.commands;
  assert.ok(Array.isArray(manifest.receipts), "Manifest receipts must be an array.");
  assert.equal(manifest.receipts.length, commands.length, "Receipt count mismatch.");
  const receiptPaths = new Set<string>();
  manifest.receipts.forEach((bindingValue, order) => {
    const binding = validateBinding(bindingValue, `receipt binding ${order}`);
    assert.ok(!receiptPaths.has(binding.path), `Duplicate receipt path ${binding.path}.`);
    receiptPaths.add(binding.path);
    validateReceipt(readJson(binding.path), commands[order], order);
  });
  const receiptDirectory = dirname(resolve(ROOT, (manifest.receipts[0] as FileBinding).path));
  const actualReceiptFiles = readdirSync(receiptDirectory).filter((name) => /^\d{3}-.*\.json$/.test(name)).sort();
  const declaredReceiptFiles = [...receiptPaths].map((path) => path.split("/").at(-1)!).sort();
  assert.deepEqual(actualReceiptFiles, declaredReceiptFiles, "Missing or extra receipt artifact detected.");
  assert.ok(Array.isArray(manifest.artifacts) && manifest.artifacts.length > 0, "Manifest artifact inventory is missing.");
  const artifactPaths = new Set<string>();
  for (const [index, bindingValue] of manifest.artifacts.entries()) {
    const binding = validateBinding(bindingValue, `artifact binding ${index}`);
    assert.ok(!artifactPaths.has(binding.path), `Duplicate artifact path ${binding.path}.`);
    assert.notEqual(binding.path, manifestPath, "Manifest must not hash itself.");
    assert.notEqual(binding.path, relative(ROOT, resolve(dirname(resolve(ROOT, manifestPath)), "proof-closeout-manifest.json")), "Manifest must not include closeout output.");
    artifactPaths.add(binding.path);
  }
  const bindings = strictObject(manifest.bindings, ["sources", "fixtures", "schemas", "harness", "plans"], "proof bindings");
  const boundPathSet = new Set<string>();
  for (const kind of ["sources", "fixtures", "schemas", "harness", "plans"] as const) {
    assert.ok(Array.isArray(bindings[kind]), `${kind} proof bindings must be an array.`);
    const declared = (bindings[kind] as unknown[]).map((binding, index) => validateBinding(binding, `${kind} binding ${index}`));
    assert.deepEqual(declared.map((binding) => binding.path), config.bindingPaths[kind], `${kind} proof bindings differ from the command configuration.`);
    for (const binding of declared) {
      assert.ok(!boundPathSet.has(binding.path), `Duplicate cross-category proof binding: ${binding.path}`);
      assert.ok(artifactPaths.has(binding.path), `${kind} binding is absent from the complete artifact inventory: ${binding.path}`);
      boundPathSet.add(binding.path);
    }
  }
  const evidence = validateBrowserEvidence(manifest.evidence, manifest.phase as number, config.browserEvidenceInput, artifactPaths);
  assert.equal(runtime.browserVersion, evidence.browserVersion, "Runtime/evidence browser version mismatch.");
  const proofDirectory = dirname(resolve(ROOT, manifestPath));
  const proofDirectoryPrefix = `${relative(ROOT, proofDirectory)}/`;
  const expectedOutputFiles = new Set([
    manifestPath,
    ...receiptPaths,
    ...[...artifactPaths].filter((path) => path.startsWith(proofDirectoryPrefix)),
    ...allowedOutputArtifacts,
  ]);
  const actualOutputFiles = listFilesRecursively(proofDirectory)
    .filter((path) => path !== relative(ROOT, resolve(proofDirectory, "proof-closeout-manifest.json")));
  assert.deepEqual(actualOutputFiles, [...expectedOutputFiles].sort(), "Unexpected, missing, or self-included ignored proof artifact detected.");
  assert.equal(manifest.commandsPassed, true, "Manifest commandsPassed must be true.");
  assert.deepEqual(manifest.lintBaseline, {errors: 6, warnings: 73, phasePathFindings: 0}, "Manifest lint regression proof mismatch.");
  assert.ok(!secretPattern.test(JSON.stringify(manifest)), "Manifest contains privacy-invalid evidence.");
  return manifest;
};

const git = (...argv: string[]) => {
  const result = spawnSync("git", argv, {cwd: ROOT, encoding: "utf8"});
  if (result.status !== 0) throw new Error(result.stderr || `git ${argv.join(" ")} failed`);
  return result.stdout;
};

const nulList = (value: string) => value.split("\0").filter(Boolean);

const bytesForPath = (path: string) => {
  const stats = lstatSync(resolve(ROOT, path));
  if (stats.isSymbolicLink()) return Buffer.from(readlinkSync(resolve(ROOT, path)), "utf8");
  assert.ok(stats.isFile(), `Inventory path ${path} must be a regular file or symlink.`);
  return readFileSync(resolve(ROOT, path));
};

export const buildTrackedStateInventory = (baseCommit: string) => {
  const tracked = nulList(git("ls-files", "-z"));
  const untracked = nulList(git("ls-files", "--others", "--exclude-standard", "-z"));
  const changed = new Set(nulList(git("diff", "--name-only", "-z", baseCommit)));
  const entries = [
    ...tracked.map((path) => ({path, kind: "tracked", status: changed.has(path) ? "modified" : "unchanged"})),
    ...untracked.map((path) => ({path, kind: "untracked", status: "added"})),
  ].sort((left, right) => left.path.localeCompare(right.path)).map((entry) => {
    const bytes = bytesForPath(entry.path);
    return {...entry, byteLength: bytes.byteLength, sha256: sha256Bytes(bytes)};
  });
  return {entries, digest: sha256Bytes(JSON.stringify(entries))};
};

const proofArtifactInventory = (proofPath: string, closeoutPath?: string) => {
  const directory = dirname(resolve(ROOT, proofPath));
  return listFilesRecursively(directory)
    .filter((path) => path !== closeoutPath && !path.endsWith(".tmp"))
    .sort()
    .map((path) => {
      const bytes = readFileSync(resolve(ROOT, path));
      return {path, sha256: sha256Bytes(bytes), byteLength: bytes.byteLength};
    });
};

export type LiveTuple = {
  liveProofInput: string;
  authorizationDecisionDigest: string | null;
  liveProofManifestSha256: string | null;
  liveProviderProof: "unperformed" | "completed" | "failed";
  liveProofEvidenceQuality: "not_attempted" | "validated_manifest" | "catastrophic_unproven";
  liveCounts: {
    authorizationDeliveryCount: 0 | 1;
    grantIssueCount: 0 | 1;
    grantClaimCount: 0 | 1;
    plannerInvocationCount: 0 | 1;
    httpTransportAttemptCount: 0 | 1;
    eligibleProviderPidCount: 0 | 1;
  } | null | "unknown";
  possibleCharge: boolean | null | "unknown";
  catastrophicEvidence: {
    cleanupReceipt: FileBinding;
    observedArtifactSha256: string | null;
    observedArtifactAbsent: boolean;
    cleanupSucceeded: true;
    residualArtifactCount: 0;
  } | null;
};

export const validateLiveTuple = (phase: number, tuple: LiveTuple) => {
  if (phase !== 7) {
    assert.deepEqual(tuple, {
      liveProofInput: "none",
      authorizationDecisionDigest: null,
      liveProofManifestSha256: null,
      liveProviderProof: "unperformed",
      liveProofEvidenceQuality: "not_attempted",
      liveCounts: null,
      possibleCharge: null,
      catastrophicEvidence: null,
    }, "Non-Phase-7 closeout must use the exact no-live-proof tuple.");
    return;
  }
  const validCounts = (value: LiveTuple["liveCounts"]) => value !== null && value !== "unknown" && Object.values(value).every((count) => count === 0 || count === 1);
  const unperformed = tuple.liveProofInput === "none" && tuple.authorizationDecisionDigest === null && tuple.liveProofManifestSha256 === null && tuple.liveProviderProof === "unperformed" && tuple.liveProofEvidenceQuality === "not_attempted" && tuple.liveCounts === null && tuple.possibleCharge === null && tuple.catastrophicEvidence === null;
  const validatedBase = tuple.liveProofInput !== "none" && typeof tuple.authorizationDecisionDigest === "string" && DECISION_PATTERN.test(tuple.authorizationDecisionDigest) && HASH_PATTERN.test(tuple.liveProofManifestSha256 ?? "") && tuple.liveProofEvidenceQuality === "validated_manifest" && validCounts(tuple.liveCounts) && typeof tuple.possibleCharge === "boolean" && tuple.catastrophicEvidence === null;
  const validatedCompleted = validatedBase && tuple.liveProviderProof === "completed" && tuple.liveCounts !== null && tuple.liveCounts !== "unknown" && Object.values(tuple.liveCounts).every((count) => count === 1) && tuple.possibleCharge === true;
  const validatedFailed = validatedBase && tuple.liveProviderProof === "failed";
  const catastrophicEvidenceValid = tuple.catastrophicEvidence !== null &&
    ((tuple.catastrophicEvidence.observedArtifactAbsent === true && tuple.catastrophicEvidence.observedArtifactSha256 === null) ||
      (tuple.catastrophicEvidence.observedArtifactAbsent === false && HASH_PATTERN.test(tuple.catastrophicEvidence.observedArtifactSha256 ?? ""))) &&
    tuple.catastrophicEvidence.cleanupSucceeded === true && tuple.catastrophicEvidence.residualArtifactCount === 0;
  const catastrophic = tuple.liveProofInput === "none" && typeof tuple.authorizationDecisionDigest === "string" && DECISION_PATTERN.test(tuple.authorizationDecisionDigest) && tuple.liveProofManifestSha256 === null && tuple.liveProviderProof === "failed" && tuple.liveProofEvidenceQuality === "catastrophic_unproven" && tuple.liveCounts === "unknown" && tuple.possibleCharge === "unknown" && catastrophicEvidenceValid;
  assert.ok(unperformed || validatedCompleted || validatedFailed || catastrophic, "Phase 7 live evidence tuple is inconsistent.");
};

const stableCodeForLiveTerminal = (manifest: JsonObject) => {
  const invoker = manifest.invokerTerminal as JsonObject;
  const issuer = manifest.issuerTerminal as JsonObject;
  const server = manifest.serverTerminal as JsonObject;
  if (invoker.status === "invalidated") return invoker.outcome;
  if (issuer.status === "invalidated") return issuer.outcome;
  if (server.status === "consumed") {
    const mapping: Record<string, string> = {success: "success", refusal: "provider_refusal", abort: "aborted"};
    return mapping[server.outcome as string] ?? server.outcome;
  }
  return "process_exit";
};

export const validatePhase7LiveProofManifest = (value: unknown, decision?: string, base?: string) => {
  const manifest = strictObject(value, [
    "kind", "manifestVersion", "specId", "phase", "baseSha", "headSha", "transport", "liveProofStatus",
    "authorizationDecisionDigest", "policySha256", "expectedProviderPayloadSha256", "authorizationRecordDigest",
    "grantDigest", "eligibleProcessTreeDigest", "invokerTerminal", "issuerTerminal", "serverTerminal", "counts", "closure", "result",
  ], "live proof manifest");
  assert.equal(manifest.kind, "stick-ai-live-proof-manifest", "Live manifest kind mismatch.");
  assert.equal(manifest.manifestVersion, 1, "Live manifest version mismatch.");
  assert.equal(manifest.specId, "SPEC-0001", "Live manifest spec mismatch.");
  assert.equal(manifest.phase, 7, "Live manifest phase mismatch.");
  assert.match(manifest.baseSha as string, GIT_SHA_PATTERN, "Live manifest base SHA invalid.");
  assert.match(manifest.headSha as string, GIT_SHA_PATTERN, "Live manifest HEAD SHA invalid.");
  assert.equal(manifest.headSha, manifest.baseSha, "Live manifest must run before publication at its base SHA.");
  if (base !== undefined) assert.equal(manifest.baseSha, base, "Live manifest base differs from offline evidence.");
  assert.ok(manifest.transport === "script" || manifest.transport === "browser", "Live manifest transport invalid.");
  assert.ok(manifest.liveProofStatus === "completed" || manifest.liveProofStatus === "failed", "Live manifest status invalid.");
  assert.match(manifest.authorizationDecisionDigest as string, DECISION_PATTERN, "Live manifest decision invalid.");
  if (decision !== undefined) assert.equal(manifest.authorizationDecisionDigest, decision, "Live manifest decision mismatch.");
  for (const field of ["policySha256", "expectedProviderPayloadSha256"] as const) requireDigest(manifest[field], `live manifest ${field}`);
  for (const field of ["authorizationRecordDigest", "grantDigest", "eligibleProcessTreeDigest"] as const) {
    assert.ok(manifest[field] === null || HASH_PATTERN.test(manifest[field] as string), `Live manifest ${field} invalid.`);
  }
  const invoker = manifest.invokerTerminal as unknown;
  const invokerObject = invoker !== null && typeof invoker === "object" && !Array.isArray(invoker) ? invoker as JsonObject : {};
  if (invokerObject.status === "delivered") strictObject(invoker, ["status"], "live invoker terminal");
  else {
    const terminal = strictObject(invoker, ["status", "outcome"], "live invoker terminal");
    assert.equal(terminal.status, "invalidated");
    assert.ok(["record_construction_failed", "launcher_spawn_failed", "authorization_pipe_write_failed", "process_exit"].includes(terminal.outcome as string), "Live invoker outcome invalid.");
  }
  const issuerObject = manifest.issuerTerminal as JsonObject;
  if (issuerObject.status === "absent" || issuerObject.status === "issued") strictObject(issuerObject, ["status"], "live issuer terminal");
  else {
    const terminal = strictObject(issuerObject, ["status", "outcome"], "live issuer terminal");
    assert.equal(terminal.status, "invalidated");
    assert.ok(["grant_construction_failed", "child_spawn_failed", "grant_pipe_write_failed", "child_exit_before_issue", "process_exit"].includes(terminal.outcome as string), "Live issuer outcome invalid.");
  }
  const serverObject = manifest.serverTerminal as JsonObject;
  if (serverObject.status === "absent") strictObject(serverObject, ["status"], "live server terminal");
  else {
    const terminal = strictObject(serverObject, ["status", "outcome"], "live server terminal");
    assert.equal(terminal.status, "consumed");
    assert.ok(["preflight_rejected", "success", "refusal", "timeout", "abort", "network_failure", "invalid_response", "audit_overage", "client_construction_failure", "process_identity_mismatch", "process_exit"].includes(terminal.outcome as string), "Live server outcome invalid.");
  }
  const counts = strictObject(manifest.counts, ["authorizationDeliveryCount", "grantIssueCount", "grantClaimCount", "plannerInvocationCount", "httpTransportAttemptCount", "eligibleProviderPidCount"], "live counts");
  for (const [field, count] of Object.entries(counts)) assert.ok(count === 0 || count === 1, `Live ${field} must be zero or one.`);
  assert.ok((counts.grantIssueCount as number) <= (counts.authorizationDeliveryCount as number), "Grant issue cannot exceed authorization delivery.");
  assert.ok((counts.grantClaimCount as number) <= (counts.grantIssueCount as number), "Grant claim cannot exceed grant issue.");
  assert.ok((counts.plannerInvocationCount as number) <= (counts.grantClaimCount as number), "Planner invocation cannot exceed grant claim.");
  assert.ok((counts.httpTransportAttemptCount as number) <= (counts.plannerInvocationCount as number), "Transport attempt cannot exceed planner invocation.");
  assert.ok((counts.eligibleProviderPidCount as number) <= (counts.grantIssueCount as number), "Eligible provider PID cannot exceed grant issue.");
  const closure = strictObject(manifest.closure, ["authorizationPipeClosed", "grantPipeClosed", "invokerClosed", "launcherClosed", "childClosed", "serverClosed"], "live closure");
  for (const [field, closed] of Object.entries(closure)) assert.equal(closed, true, `Live closure ${field} must be true.`);
  const result = strictObject(manifest.result, ["stableCode", "possibleCharge", "providerModel", "reportedInputTokens", "reportedOutputTokens", "auditedUsdMicros", "durationMs", "retentionEvidenceDigest"], "live result");
  const stableCodes = ["success", "record_construction_failed", "launcher_spawn_failed", "authorization_pipe_write_failed", "grant_construction_failed", "child_spawn_failed", "grant_pipe_write_failed", "child_exit_before_issue", "preflight_rejected", "provider_refusal", "timeout", "aborted", "network_failure", "invalid_response", "audit_overage", "client_construction_failure", "process_identity_mismatch", "process_exit"];
  assert.ok(stableCodes.includes(result.stableCode as string), "Live result stable code invalid.");
  assert.equal(typeof result.possibleCharge, "boolean", "Live possibleCharge invalid.");
  assert.equal(result.possibleCharge, counts.httpTransportAttemptCount === 1, "Live possibleCharge must equal the transport-attempt predicate.");
  assert.ok(result.providerModel === null || (typeof result.providerModel === "string" && result.providerModel.length > 0), "Live provider model invalid.");
  for (const field of ["reportedInputTokens", "reportedOutputTokens", "auditedUsdMicros"] as const) {
    assert.ok(result[field] === null || (Number.isSafeInteger(result[field]) && (result[field] as number) >= 0), `Live result ${field} invalid.`);
  }
  requireCount(result.durationMs, "Live result duration");
  assert.ok(result.retentionEvidenceDigest === null || HASH_PATTERN.test(result.retentionEvidenceDigest as string), "Live retention evidence digest invalid.");
  if (counts.httpTransportAttemptCount === 0) {
    assert.deepEqual([result.providerModel, result.reportedInputTokens, result.reportedOutputTokens, result.auditedUsdMicros, result.retentionEvidenceDigest], [null, null, null, null, null], "No-transport live result must carry no provider/usage/cost/retention evidence.");
  }
  assert.equal(result.stableCode, stableCodeForLiveTerminal(manifest), "Live stable code does not match terminal state.");
  const completed = manifest.liveProofStatus === "completed";
  if (completed) {
    assert.deepEqual(invoker, {status: "delivered"}, "Completed live proof requires delivered invoker.");
    assert.deepEqual(manifest.issuerTerminal, {status: "issued"}, "Completed live proof requires issued grant.");
    assert.deepEqual(manifest.serverTerminal, {status: "consumed", outcome: "success"}, "Completed live proof requires successful consumed server state.");
    assert.equal(result.stableCode, "success");
    assert.ok(Object.values(counts).every((count) => count === 1), "Completed live proof requires every count to equal one.");
    for (const field of ["authorizationRecordDigest", "grantDigest", "eligibleProcessTreeDigest"] as const) requireDigest(manifest[field], `completed live manifest ${field}`);
  } else {
    assert.notEqual(result.stableCode, "success", "Failed live proof cannot carry success.");
  }
  const forbidden = /(?:sk-[A-Za-z0-9_-]{16,}|authorization\s*[:=]|nonce\s*[:=]|\"(?:prompt|coordinates|rawPid|rawGrant|rawAuthorization)\")/i;
  assert.ok(!forbidden.test(JSON.stringify(manifest)), "Live manifest contains forbidden raw/private content.");
  return manifest;
};

const validateLiveManifestBinding = (tuple: LiveTuple, baseCommit: string) => {
  if (tuple.liveProofInput === "none") return;
  assert.ok(tuple.authorizationDecisionDigest !== null, "Validated live proof requires a decision digest.");
  const decision = tuple.authorizationDecisionDigest;
  const ordinaryPath = `output/spec-0001/phase-7/live/${decision}/live-proof-manifest.json`;
  const siblingPath = `output/spec-0001/phase-7-live/${decision}/live/live-proof-manifest.json`;
  assert.ok(tuple.liveProofInput === ordinaryPath || tuple.liveProofInput === siblingPath, "Live proof path is outside the two decision-bound roots.");
  const {absolute} = safeRepositoryPath(tuple.liveProofInput, "live proof");
  let current = ROOT;
  for (const part of relative(ROOT, absolute).split(sep).filter(Boolean)) {
    current = resolve(current, part);
    assert.ok(!lstatSync(current).isSymbolicLink(), `Live proof path may not contain a symlink: ${relative(ROOT, current)}`);
  }
  const bytes = readFileSync(absolute);
  assert.equal(sha256Bytes(bytes), tuple.liveProofManifestSha256, "Live proof SHA mismatch.");
  const manifest = validatePhase7LiveProofManifest(JSON.parse(bytes.toString("utf8")), decision, baseCommit);
  assert.equal(manifest.liveProofStatus, tuple.liveProviderProof, "Live manifest status mismatch.");
  assert.deepEqual(manifest.counts, tuple.liveCounts, "Live manifest counts mismatch.");
  assert.equal((manifest.result as JsonObject).possibleCharge, tuple.possibleCharge, "Live manifest possible-charge flag mismatch.");
  assert.ok(!secretPattern.test(bytes.toString("utf8")), "Live manifest contains privacy-invalid evidence.");
};

export const validateCloseoutManifest = (closeoutPath: string) => {
  const closeout = strictObject(
    readJson(closeoutPath),
    ["closeoutVersion", "specId", "phase", "baseCommit", "headCommit", "finalizedAt", "proofManifest", "trackedStateDigest", "trackedStateInventory", "indexEmpty", "allowlistedPaths", "artifactInventory", "liveProofInput", "authorizationDecisionDigest", "liveProofManifestSha256", "liveProviderProof", "liveProofEvidenceQuality", "liveCounts", "possibleCharge", "catastrophicEvidence"],
    "closeout manifest",
  );
  assert.equal(closeout.closeoutVersion, 1, "Closeout version mismatch.");
  assert.equal(closeout.specId, "SPEC-0001", "Closeout spec mismatch.");
  assert.ok(Number.isSafeInteger(closeout.phase) && (closeout.phase as number) >= 1 && (closeout.phase as number) <= 7, "Closeout phase invalid.");
  assert.match(closeout.baseCommit as string, GIT_SHA_PATTERN, "Closeout base invalid.");
  assert.equal(closeout.headCommit, git("rev-parse", "HEAD").trim(), "Closeout HEAD mismatch.");
  assert.ok(typeof closeout.finalizedAt === "string" && !Number.isNaN(Date.parse(closeout.finalizedAt)), "Closeout timestamp invalid.");
  const proofBinding = validateBinding(closeout.proofManifest, "closeout proof binding");
  const liveTuple: LiveTuple = {
    liveProofInput: closeout.liveProofInput as string,
    authorizationDecisionDigest: closeout.authorizationDecisionDigest as string | null,
    liveProofManifestSha256: closeout.liveProofManifestSha256 as string | null,
    liveProviderProof: closeout.liveProviderProof as LiveTuple["liveProviderProof"],
    liveProofEvidenceQuality: closeout.liveProofEvidenceQuality as LiveTuple["liveProofEvidenceQuality"],
    liveCounts: closeout.liveCounts as LiveTuple["liveCounts"],
    possibleCharge: closeout.possibleCharge as LiveTuple["possibleCharge"],
    catastrophicEvidence: closeout.catastrophicEvidence as LiveTuple["catastrophicEvidence"],
  };
  validateLiveTuple(closeout.phase as number, liveTuple);
  if (liveTuple.catastrophicEvidence !== null) {
    const receipt = validateBinding(liveTuple.catastrophicEvidence.cleanupReceipt, "catastrophic cleanup receipt");
    assert.deepEqual(receipt, liveTuple.catastrophicEvidence.cleanupReceipt, "Catastrophic cleanup receipt binding mismatch.");
  }
  validateLiveManifestBinding(liveTuple, closeout.baseCommit as string);
  const proof = validateProofManifest(proofBinding.path, liveTuple.liveProofInput === "none" ? [] : [liveTuple.liveProofInput]);
  assert.equal(proof.phase, closeout.phase, "Proof/closeout phase mismatch.");
  assert.equal(proof.baseCommit, closeout.baseCommit, "Proof/closeout base mismatch.");
  const state = buildTrackedStateInventory(closeout.baseCommit as string);
  assert.equal(closeout.trackedStateDigest, state.digest, "Post-finalization tracked/untracked state changed.");
  assert.deepEqual(closeout.trackedStateInventory, state.entries, "Post-finalization tracked/untracked byte/status inventory changed.");
  assert.equal(closeout.indexEmpty, true, "Git index must be empty.");
  assert.equal(git("diff", "--cached", "--name-only").trim(), "", "Git index contains staged changes.");
  const changed = [...new Set([
    ...nulList(git("diff", "--name-only", "-z", closeout.baseCommit as string)),
    ...nulList(git("ls-files", "--others", "--exclude-standard", "-z")),
  ])].sort();
  assert.deepEqual(closeout.allowlistedPaths, changed, "Closeout allowlist does not equal final non-ignored diff.");
  assert.ok(Array.isArray(closeout.artifactInventory), "Closeout artifact inventory must be an array.");
  const declaredArtifacts = closeout.artifactInventory.map((binding, index) => {
    const object = strictObject(binding, ["path", "sha256", "byteLength"], `closeout artifact ${index}`);
    assert.notEqual(object.path, closeoutPath, "Closeout must exclude its own output.");
    return validateBinding(binding, `closeout artifact ${index}`);
  });
  assert.deepEqual(declaredArtifacts, proofArtifactInventory(proofBinding.path, closeoutPath), "Closeout proof artifact inventory mismatch.");
  assert.ok(!secretPattern.test(JSON.stringify(closeout)), "Closeout contains privacy-invalid evidence.");
  return closeout;
};

const mustReject = (name: string, operation: () => void) => {
  assert.throws(operation, `Self-test ${name} should reject.`);
};

const runSelfTest = () => {
  const baseCommand: JsonObject = {name: "test", argv: ["node", "test.ts"], cwd: ".", env: {}, expectedExitCode: 0, privacy: "sanitized"};
  const captured = (text: string) => {
    const bytes = Buffer.from(text);
    return {encoding: "base64", byteLength: bytes.byteLength, sha256: sha256Bytes(bytes), data: bytes.toString("base64")};
  };
  const receipt: JsonObject = {receiptVersion: 1, name: "test", order: 0, argv: ["node", "test.ts"], cwd: ".", env: {}, privacy: "sanitized", startedAt: new Date(0).toISOString(), durationMs: 1, exitCode: 0, expectedExitCode: 0, passed: true, stdout: captured("ok"), stderr: captured(""), lintBaseline: null};
  validateReceipt(receipt, baseCommand, 0);
  mustReject("missing field", () => validateReceipt(Object.fromEntries(Object.entries(receipt).filter(([key]) => key !== "stdout")), baseCommand, 0));
  mustReject("extra field", () => validateReceipt({...receipt, extra: true}, baseCommand, 0));
  mustReject("reordered receipt", () => validateReceipt({...receipt, order: 1}, baseCommand, 0));
  mustReject("hash mismatch", () => validateReceipt({...receipt, stdout: {...(receipt.stdout as JsonObject), sha256: `sha256:${"0".repeat(64)}`}}, baseCommand, 0));
  mustReject("forged exit", () => validateReceipt({...receipt, exitCode: 1}, baseCommand, 0));
  mustReject("argv mismatch", () => validateReceipt({...receipt, argv: ["node", "other.ts"]}, baseCommand, 0));
  mustReject("privacy-invalid output", () => validateReceipt({...receipt, stdout: captured(`authorization=sk-${"a".repeat(24)}`)}, baseCommand, 0));
  const noLive: LiveTuple = {liveProofInput: "none", authorizationDecisionDigest: null, liveProofManifestSha256: null, liveProviderProof: "unperformed", liveProofEvidenceQuality: "not_attempted", liveCounts: null, possibleCharge: null, catastrophicEvidence: null};
  validateLiveTuple(1, noLive);
  validateLiveTuple(7, noLive);
  const decision = "a".repeat(64);
  const digest = `sha256:${"b".repeat(64)}`;
  const allOneCounts = {authorizationDeliveryCount: 1, grantIssueCount: 1, grantClaimCount: 1, plannerInvocationCount: 1, httpTransportAttemptCount: 1, eligibleProviderPidCount: 1} as const;
  validateLiveTuple(7, {liveProofInput: `output/spec-0001/phase-7/live/${decision}/live-proof-manifest.json`, authorizationDecisionDigest: decision, liveProofManifestSha256: digest, liveProviderProof: "completed", liveProofEvidenceQuality: "validated_manifest", liveCounts: allOneCounts, possibleCharge: true, catastrophicEvidence: null});
  validateLiveTuple(7, {liveProofInput: "none", authorizationDecisionDigest: decision, liveProofManifestSha256: null, liveProviderProof: "failed", liveProofEvidenceQuality: "catastrophic_unproven", liveCounts: "unknown", possibleCharge: "unknown", catastrophicEvidence: {cleanupReceipt: {path: "receipt.json", sha256: digest, byteLength: 1}, observedArtifactSha256: null, observedArtifactAbsent: true, cleanupSucceeded: true, residualArtifactCount: 0}});
  mustReject("inconsistent live status", () => validateLiveTuple(7, {...noLive, liveProviderProof: "completed"}));
  mustReject("invalid live decision", () => validateLiveTuple(7, {...noLive, authorizationDecisionDigest: decision}));
  const baseSha = git("rev-parse", "HEAD").trim();
  const validLive = {
    kind: "stick-ai-live-proof-manifest", manifestVersion: 1, specId: "SPEC-0001", phase: 7,
    baseSha, headSha: baseSha, transport: "script", liveProofStatus: "completed", authorizationDecisionDigest: decision,
    policySha256: digest, expectedProviderPayloadSha256: digest, authorizationRecordDigest: digest, grantDigest: digest,
    eligibleProcessTreeDigest: digest, invokerTerminal: {status: "delivered"}, issuerTerminal: {status: "issued"},
    serverTerminal: {status: "consumed", outcome: "success"}, counts: allOneCounts,
    closure: {authorizationPipeClosed: true, grantPipeClosed: true, invokerClosed: true, launcherClosed: true, childClosed: true, serverClosed: true},
    result: {stableCode: "success", possibleCharge: true, providerModel: "approved-model", reportedInputTokens: 1, reportedOutputTokens: 1, auditedUsdMicros: 1, durationMs: 1, retentionEvidenceDigest: digest},
  };
  validatePhase7LiveProofManifest(validLive, decision, baseSha);
  mustReject("live count/charge mismatch", () => validatePhase7LiveProofManifest({...validLive, result: {...validLive.result, possibleCharge: false}}, decision, baseSha));
  mustReject("live terminal/status mismatch", () => validatePhase7LiveProofManifest({...validLive, liveProofStatus: "failed"}, decision, baseSha));
  mustReject("live unknown content field", () => validatePhase7LiveProofManifest({...validLive, prompt: "forbidden"}, decision, baseSha));

  const outputParent = resolve(ROOT, "output/spec-0001");
  mkdirSync(outputParent, {recursive: true});
  const sandbox = mkdtempSync(resolve(outputParent, "proof-validator-self-test-"));
  const markerPath = `.spec0001-proof-self-test-${process.pid}`;
  const manifestPath = relative(ROOT, resolve(sandbox, "proof-manifest.json"));
  const closeoutPath = relative(ROOT, resolve(sandbox, "proof-closeout-manifest.json"));
  const actualConfigPath = "scripts/fixtures/stick-ai/v1/phase-1-proof-commands.json";
  try {
    const configBytes = readFileSync(resolve(ROOT, actualConfigPath));
    const configValue = JSON.parse(configBytes.toString("utf8")) as JsonObject;
    const validConfig = validateCommandConfig(configValue, 1, baseSha);
    const bindPath = (path: string) => {
      const bytes = readFileSync(resolve(ROOT, path));
      return {path, sha256: sha256Bytes(bytes), byteLength: bytes.byteLength};
    };
    const receipts = validConfig.commands.map((command, order) => {
      const syntheticReceipt = {
        receiptVersion: 1, name: command.name, order, argv: command.argv, cwd: command.cwd, env: command.env,
        privacy: "sanitized", startedAt: new Date(0).toISOString(), durationMs: 0, exitCode: command.expectedExitCode,
        expectedExitCode: command.expectedExitCode, passed: true, stdout: captured(""), stderr: captured(""),
        lintBaseline: command.lintBaseline ?? null,
      };
      const path = relative(ROOT, resolve(sandbox, `${String(order).padStart(3, "0")}-synthetic.json`));
      writeFileSync(resolve(ROOT, path), `${JSON.stringify(syntheticReceipt, null, 2)}\n`);
      return bindPath(path);
    });
    const bindings = Object.fromEntries(Object.entries(validConfig.bindingPaths).map(([kind, paths]) => [kind, paths.map(bindPath)]));
    const artifactBindings = Object.values(validConfig.bindingPaths).flat().map(bindPath).sort((left, right) => left.path.localeCompare(right.path));
    const phaseOneEvidence = {
      evidenceVersion: 1, browserStatus: "not-applicable", notApplicableReason: "Phase 1 synthetic self-test has no browser flow.",
      browserVersion: null, browserPlan: null, operations: [], stateCheckpoints: [], storageCheckpoints: [], requestRecords: [], networkRecords: [], consoleRecords: [], screenshots: [],
      cleanup: {status: "not-applicable", reason: "No browser resources were created by this synthetic validator self-test.", proofAnchor: {status: "not-applicable", targetPath: null, preimageSha256: null, replacementSha256: null, restoredSha256: null, instrumentationAttributableDiff: null}, isolatedContextCount: 0, closedContextCount: 0, activeGateCount: 0, activeInterceptCount: 0, childProcessCount: 0, openChildProcessCount: 0, residualArtifactPaths: []},
    };
    const proof = {
      manifestVersion: 1, specId: "SPEC-0001", phase: 1, baseCommit: baseSha, headCommit: baseSha,
      recordedAt: new Date(0).toISOString(), runtime: {nodeVersion: process.version, npmVersion: "self-test", browserVersion: null, textEncoderAvailable: true, webCryptoAvailable: true},
      commandConfig: bindPath(actualConfigPath), receipts, artifacts: artifactBindings, bindings, evidence: phaseOneEvidence,
      commandsPassed: true, lintBaseline: {errors: 6, warnings: 73, phasePathFindings: 0},
    };
    writeFileSync(resolve(ROOT, manifestPath), `${JSON.stringify(proof, null, 2)}\n`);
    validateProofManifest(manifestPath);
    const extraPath = resolve(sandbox, "unexpected.json");
    writeFileSync(extraPath, "{}\n");
    mustReject("unexpected ignored artifact through real manifest validator", () => validateProofManifest(manifestPath));
    unlinkSync(extraPath);
    validateProofManifest(manifestPath);

    writeFileSync(resolve(ROOT, markerPath), "before\n");
    const state = buildTrackedStateInventory(baseSha);
    const changed = [...new Set([...nulList(git("diff", "--name-only", "-z", baseSha)), ...nulList(git("ls-files", "--others", "--exclude-standard", "-z"))])].sort();
    const closeout: JsonObject = {
      closeoutVersion: 1, specId: "SPEC-0001", phase: 1, baseCommit: baseSha, headCommit: baseSha,
      finalizedAt: new Date(0).toISOString(), proofManifest: bindPath(manifestPath), trackedStateDigest: state.digest,
      trackedStateInventory: state.entries, indexEmpty: true, allowlistedPaths: changed,
      artifactInventory: proofArtifactInventory(manifestPath, closeoutPath), ...noLive,
    };
    writeFileSync(resolve(ROOT, closeoutPath), `${JSON.stringify(closeout, null, 2)}\n`);
    validateCloseoutManifest(closeoutPath);
    writeFileSync(resolve(ROOT, markerPath), "after\n");
    mustReject("post-finalization state change through real closeout validator", () => validateCloseoutManifest(closeoutPath));
    writeFileSync(resolve(ROOT, markerPath), "before\n");
    validateCloseoutManifest(closeoutPath);
    closeout.artifactInventory = [...(closeout.artifactInventory as unknown[]), {path: closeoutPath, sha256: digest, byteLength: 0}];
    writeFileSync(resolve(ROOT, closeoutPath), `${JSON.stringify(closeout, null, 2)}\n`);
    mustReject("self inclusion through real closeout validator", () => validateCloseoutManifest(closeoutPath));
    closeout.artifactInventory = proofArtifactInventory(manifestPath, closeoutPath);
    writeFileSync(resolve(ROOT, closeoutPath), `${JSON.stringify(closeout, null, 2)}\n`);
    const closeoutExtra = resolve(sandbox, "unexpected-after-finalization.json");
    writeFileSync(closeoutExtra, "{}\n");
    mustReject("unexpected post-finalization artifact through real closeout validator", () => validateCloseoutManifest(closeoutPath));
    unlinkSync(closeoutExtra);
    validateCloseoutManifest(closeoutPath);
  } finally {
    rmSync(resolve(ROOT, markerPath), {force: true});
    rmSync(sandbox, {recursive: true, force: true});
  }
  console.log("SPEC-0001 proof validator self-test passed (real receipt/manifest/closeout/live rejection paths exercised).");
};

const main = () => {
  if (process.argv.length === 3 && process.argv[2] === "--self-test") return runSelfTest();
  if (process.argv.length === 3 && process.argv[2].startsWith("--closeout=")) {
    const path = process.argv[2].slice("--closeout=".length);
    validateCloseoutManifest(path);
    console.log(`Validated SPEC-0001 closeout manifest: ${path}`);
    return;
  }
  if (process.argv.length === 3 && !process.argv[2].startsWith("--")) {
    validateProofManifest(process.argv[2]);
    console.log(`Validated SPEC-0001 proof manifest: ${process.argv[2]}`);
    return;
  }
  throw new Error("Use --self-test, <proof-manifest>, or --closeout=<manifest>.");
};

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main();
