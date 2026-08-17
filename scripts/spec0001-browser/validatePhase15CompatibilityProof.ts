import assert from "node:assert/strict";
import {spawnSync} from "node:child_process";
import {createHash} from "node:crypto";
import {existsSync, lstatSync, readFileSync, readdirSync, realpathSync} from "node:fs";
import {relative, resolve, sep} from "node:path";
import {pathToFileURL} from "node:url";
import {validateV2LintMeasurement} from "../validateSpec0001ProofBundle.ts";

type JsonObject = Record<string, unknown>;
type FileBinding = {path: string; sha256: string; byteLength: number};

const ROOT = process.cwd();
const REAL_ROOT = realpathSync(ROOT);
const BASE_COMMIT = "8b663d2b80144e9aeba9ea0ecf0f78ccefa78926";
const COMPATIBILITY_OUTPUT_ROOT = "output/spec-0001/phase-1.5-compatibility";
const CATALOG_PATH = "scripts/fixtures/spec0001-browser/v2/tester-extension-authorizations.json";
const COMPATIBILITY_PLAN_PATH = "scripts/fixtures/spec0001-browser/v2/phase-1.5-compatibility-browser-plan.json";
const REGISTRY_PATH = "scripts/fixtures/spec0001-browser/v2/phase-1.5-compatibility-action-registry.json";
const ADAPTER_PATH = "scripts/spec0001-browser/actions/phase15CompatibilitySynthetic.ts";
const MANIFEST_SCHEMA_PATH = "scripts/fixtures/spec0001-browser/v2/phase-1.5-compatibility-proof-manifest.schema.json";
const RECEIPT_SCHEMA_PATH = "scripts/fixtures/stick-ai/v1/proof-command-receipt-v2.schema.json";
const RESULT_SCHEMA_PATH = "scripts/fixtures/spec0001-browser/v2/tester-extension-result.schema.json";
export const CLOSEOUT_SCHEMA_PATH = "scripts/fixtures/spec0001-browser/v2/phase-1.5-compatibility-closeout.schema.json";
const AUTHORIZATION_ID = "phase-1.5-compatibility-synthetic/v1";
const BROWSER_EXECUTABLE = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
export const CORRECTION_PATHS = [
  "scripts/fixtures/spec0001-browser/v2/phase-1.5-compatibility-action-registry.json",
  "scripts/fixtures/spec0001-browser/v2/phase-1.5-compatibility-browser-plan.json",
  "scripts/fixtures/spec0001-browser/v2/phase-1.5-compatibility-closeout.schema.json",
  "scripts/fixtures/spec0001-browser/v2/phase-1.5-compatibility-negative-cases.json",
  "scripts/fixtures/spec0001-browser/v2/phase-1.5-compatibility-proof-commands.json",
  "scripts/fixtures/spec0001-browser/v2/phase-1.5-compatibility-proof-manifest.schema.json",
  "scripts/fixtures/spec0001-browser/v2/tester-extension-authorization.schema.json",
  "scripts/fixtures/spec0001-browser/v2/tester-extension-authorizations.json",
  "scripts/fixtures/spec0001-browser/v2/tester-extension-plan.schema.json",
  "scripts/fixtures/spec0001-browser/v2/tester-extension-registry.schema.json",
  "scripts/fixtures/spec0001-browser/v2/tester-extension-result.schema.json",
  "scripts/fixtures/stick-ai/v1/proof-command-receipt-v2.schema.json",
  "scripts/fixtures/stick-ai/v1/proof-manifest-v2.schema.json",
  "scripts/recordSpec0001ProofBundle.ts",
  "scripts/runSpec0001BrowserProof.ts",
  "scripts/spec0001-browser/actions/phase15CompatibilitySynthetic.ts",
  "scripts/spec0001-browser/browserTesterExtensionContract.ts",
  "scripts/spec0001-browser/finalizePhase15CompatibilityCloseout.ts",
  "scripts/spec0001-browser/recordPhase15CompatibilityProof.ts",
  "scripts/spec0001-browser/validatePhase15Compatibility.ts",
  "scripts/spec0001-browser/validatePhase15CompatibilityProof.ts",
  "scripts/spec0001-proof/measureSpec0001LintRegression.ts",
  "scripts/validateSpec0001ProofBundle.ts",
] as const;
const PRE_EDIT_RESULT_SHA256 = "sha256:47e9e63508ce28f1acf4afcec53180420418182e7e43ab977bd2ec58cded7585";
const PRE_EDIT_RESULT_BYTE_LENGTH = 79799;
const COMMAND_CONFIG_PATH = "scripts/fixtures/spec0001-browser/v2/phase-1.5-compatibility-proof-commands.json";
const MANIFEST_PATH = `${COMPATIBILITY_OUTPUT_ROOT}/proof-manifest.json`;
const RESULT_PATH = `${COMPATIBILITY_OUTPUT_ROOT}/synthetic/runner-result.json`;
const RECEIPT_NAMES = [
  "compatibility-self-test", "shared-proof-self-test", "closeout-self-test", "phase-1-contract-regression",
  "typescript", "lint-regression", "diff-check", "synthetic-browser", "status",
] as const;
const EXPECTED_ARGV = [
  ["node", "--experimental-strip-types", "scripts/spec0001-browser/validatePhase15Compatibility.ts", "--self-test"],
  ["node", "--experimental-strip-types", "scripts/validateSpec0001ProofBundle.ts", "--self-test"],
  ["node", "--experimental-strip-types", "scripts/spec0001-browser/finalizePhase15CompatibilityCloseout.ts", "--self-test"],
  ["node", "--experimental-strip-types", "scripts/validateStickFigureAiContracts.ts"],
  ["./node_modules/.bin/tsc", "--noEmit", "--incremental", "false"],
  ["node", "--experimental-strip-types", "scripts/spec0001-proof/measureSpec0001LintRegression.ts", `--base=${BASE_COMMIT}`],
  ["git", "diff", "--check"],
  ["node", "--experimental-strip-types", "scripts/runSpec0001BrowserProof.ts", `--plan=${COMPATIBILITY_PLAN_PATH}`],
  ["git", "status", "--short", "--branch"],
] as const;
const SYNTHETIC_FILES = [
  "synthetic/runner-result.json", "synthetic/action-ledger.json", "synthetic/negative-ledger.json",
  "synthetic/checkpoint-ledger.json", "synthetic/storage-ledger.json", "synthetic/request-ledger.json",
  "synthetic/network-ledger.json", "synthetic/console-ledger.json", "synthetic/regression-ledger.json",
  "synthetic/cleanup.json", "synthetic/screenshots/phase-1.5-compatibility.png",
] as const;
const HASH_PATTERN = /^sha256:[0-9a-f]{64}$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}T/;
const SERVER_GUARD_NAMES = [
  "fetch", "http", "https", "net", "tls", "dns", "child",
  "deceptive-127-host", "node-next-marker", "next-child-env-stripping", "next-child-appended-preload",
  "next-child-shell", "next-fork-exec-path", "next-fork-exec-argv", "next-child-loader-env", "next-fork-inherited-exec-argv",
  "next-version-info-suppressed", "next-version-info-direct-fetch", "next-telemetry-flush-suppressed", "next-telemetry-detached-spawn",
] as const;
const SERVER_PRIMITIVES = [
  "fetch", "http.request", "https.request", "net.connect", "tls.connect", "dns.promises.lookup", "child_process.spawn",
  "v2.http.request", "v2.child_process.spawn", "v2.child_process.fork", "v2.child_process.spawn", "v2.child_process.spawn",
  "v2.child_process.fork", "v2.child_process.fork", "v2.child_process.spawn", "v2.child_process.fork",
  "v2.framework.next.getVersionInfo", "v2.fetch", "v2.framework.next.telemetry.flushDetached", "v2.child_process.spawn",
] as const;
const GUARD_V2_BINDING = {byteLength: 13106, sha256: "sha256:6d671a4af2f326cd691758d20ea2f99a25c301e1e5837ba2cf3bf063480c83a1"} as const;
const COLLISION_SENTINEL = {sentinelSha256: "sha256:7eb7997892805a9226e33de4aaa5a43348ce59981e80e82d7b98cc8785b1e342", sentinelByteLength: 36} as const;
const WARNING_PATTERNS = [
  "^Canvas2D: Multiple readback operations using getImageData are faster with the willReadFrequently attribute set to true\\. See: https://html\\.spec\\.whatwg\\.org/multipage/canvas\\.html#concept-canvas-will-read-frequently$",
] as const;
const PRODUCTION_MARKERS = [
  "SPEC0001_BROWSER_DRIVER_ANCHOR_V1", "spec0001-browser", "runSpec0001BrowserProof",
  "__SPEC0001_BROWSER_DRIVER_V1", "scripts/fixtures/spec0001-browser", "/__spec0001-browser",
  "/api/__spec0001-browser", "/_next/static/spec0001-browser", "Browser Tester", "playwright-core",
  "__SPEC0001_BROWSER_DRIVER_V2__", "__spec0001BrowserCommandV2", "compatibility.command-result/v2", "in-memory-phase2-shaped-synthetic/v1",
] as const;
const FORBIDDEN_URLS = ["/__spec0001-browser", "/api/__spec0001-browser", "/_next/static/spec0001-browser"] as const;
const REGRESSION_ASSERTIONS = {
  "home-new-drawing": ["Home New Project visible", "project chooser visible", "Drawing workspace opened"],
  "home-new-stick": ["Home New Project visible", "project chooser visible", "Stick workspace opened"],
  "stick-creator-back": ["Stick tools opened", "Creator opened", "Save remained disabled", "Back restored Stick workspace"],
  "drawing-generate-frames": ["Generate Frames selected", "one deterministic mocked response applied", "settled success visible", "input re-enabled", "generated pixels visible"],
  "drawing-undo-redo-play-pause": ["Undo removed generated pixels", "Redo restored exact red-pixel count", "Play exposed Pause", "Pause restored exact red-pixel count", "no second request"],
} as const;

const sha256Bytes = (value: Uint8Array | string) => `sha256:${createHash("sha256").update(value).digest("hex")}`;
export const stableJson = (value: unknown): string => {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  const object = value as JsonObject;
  return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${stableJson(object[key])}`).join(",")}}`;
};
const strictObject = (value: unknown, keys: readonly string[], label: string) => {
  assert.ok(value !== null && typeof value === "object" && !Array.isArray(value), `${label} must be an object.`);
  assert.deepEqual(Object.keys(value as JsonObject).sort(), [...keys].sort(), `${label} fields must be exact.`);
  return value as JsonObject;
};
const repositoryPath = (path: string) => {
  assert.ok(path.length > 0 && !path.includes("\0"));
  const absolute = resolve(REAL_ROOT, path);
  const local = relative(REAL_ROOT, absolute);
  assert.ok(local !== ".." && !local.startsWith(`..${sep}`), `Path escapes repository: ${path}`);
  let current = REAL_ROOT;
  for (const part of local.split(sep).filter(Boolean)) {
    current = resolve(current, part);
    if (existsSync(current)) {
      assert.ok(!lstatSync(current).isSymbolicLink(), `Symlink path rejected: ${relative(REAL_ROOT, current)}`);
      assert.equal(realpathSync(current), resolve(REAL_ROOT, relative(REAL_ROOT, current)), `Real path escaped repository: ${relative(REAL_ROOT, current)}`);
    }
  }
  return absolute;
};
const bindFile = (path: string): FileBinding => {
  const absolute = repositoryPath(path);
  const status = lstatSync(absolute);
  assert.ok(status.isFile() && !status.isSymbolicLink(), `Proof binding must be a regular file: ${path}`);
  const bytes = readFileSync(absolute);
  return {path, sha256: sha256Bytes(bytes), byteLength: bytes.byteLength};
};
const bindExternalFile = (path: string): FileBinding => {
  const resolved = realpathSync(path); assert.equal(resolved, path, `External dependency symlink rejected: ${path}`);
  const status = lstatSync(resolved); assert.ok(status.isFile() && !status.isSymbolicLink(), `External dependency must be a regular file: ${path}`);
  const bytes = readFileSync(resolved); return {path, sha256: sha256Bytes(bytes), byteLength: bytes.byteLength};
};
const validateExternalBinding = (value: unknown, label: string): FileBinding => {
  const binding = strictObject(value, ["byteLength", "path", "sha256"], label); assert.equal(binding.path, BROWSER_EXECUTABLE); validateDigest(binding.sha256, `${label} digest`); validateNonnegativeInteger(binding.byteLength, `${label} length`); return binding as unknown as FileBinding;
};
const validateBinding = (value: unknown, label: string): FileBinding => {
  const object = strictObject(value, ["byteLength", "path", "sha256"], label);
  assert.equal(typeof object.path, "string");
  assert.match(object.sha256 as string, /^sha256:[0-9a-f]{64}$/);
  assert.ok(Number.isSafeInteger(object.byteLength) && Number(object.byteLength) >= 0);
  const current = bindFile(object.path as string);
  assert.deepEqual(current, object, `${label} binding mismatch.`);
  return current;
};
const validateDate = (value: unknown, label: string) => {
  assert.ok(typeof value === "string" && DATE_PATTERN.test(value) && !Number.isNaN(Date.parse(value)), `${label} must be an ISO date-time.`);
  return value;
};
const validateDigest = (value: unknown, label: string) => {
  assert.match(value as string, HASH_PATTERN, `${label} must be a SHA-256 digest.`);
  return value as string;
};
const validateNonnegativeInteger = (value: unknown, label: string) => {
  assert.ok(Number.isSafeInteger(value) && Number(value) >= 0, `${label} must be a non-negative safe integer.`);
  return Number(value);
};
const isExactLoopbackHost = (value: string) => {
  const host = value.replace(/^\[|\]$/g, "").toLowerCase();
  if (host === "::1") return true;
  const octets = host.split(".");
  return octets.length === 4 && octets[0] === "127" && octets.every((octet) => /^\d{1,3}$/.test(octet) && Number(octet) <= 255);
};
const isExactLoopbackTarget = (value: string) => {
  if (isExactLoopbackHost(value)) return true;
  try { return isExactLoopbackHost(new URL(value).hostname); }
  catch {
    const bracketed = /^\[([^\]]+)\]:\d+$/.exec(value)?.[1];
    const ordinary = /^([^:]+):\d+$/.exec(value)?.[1];
    return isExactLoopbackHost(bracketed ?? ordinary ?? "");
  }
};

const schemaAtRef = (root: JsonObject, reference: string) => {
  assert.ok(reference.startsWith("#/"), `External JSON Schema reference is forbidden: ${reference}`);
  return reference.slice(2).split("/").reduce<unknown>((value, token) => {
    assert.ok(value !== null && typeof value === "object" && !Array.isArray(value), `Unresolved JSON Schema reference: ${reference}`);
    const decoded = token.replaceAll("~1", "/").replaceAll("~0", "~");
    assert.ok(Object.hasOwn(value as JsonObject, decoded), `Unresolved JSON Schema reference: ${reference}`);
    return (value as JsonObject)[decoded];
  }, root);
};
const validateSchemaNode = (value: unknown, schemaValue: unknown, root: JsonObject, label: string): void => {
  assert.ok(schemaValue !== null && typeof schemaValue === "object" && !Array.isArray(schemaValue), `${label} schema must be an object.`);
  const schema = schemaValue as JsonObject;
  const supported = new Set(["$schema", "$id", "$defs", "$ref", "type", "const", "enum", "required", "properties", "additionalProperties", "propertyNames", "items", "minItems", "maxItems", "uniqueItems", "minLength", "maxLength", "minimum", "maximum", "pattern", "format", "contentEncoding", "oneOf", "not"]);
  for (const key of Object.keys(schema)) assert.ok(supported.has(key), `${label} uses unsupported schema keyword: ${key}`);
  if (typeof schema.$ref === "string") return validateSchemaNode(value, schemaAtRef(root, schema.$ref), root, label);
  if (Array.isArray(schema.oneOf)) {
    let passes = 0;
    for (const candidate of schema.oneOf) {
      try { validateSchemaNode(value, candidate, root, label); passes += 1; } catch {}
    }
    assert.equal(passes, 1, `${label} must match exactly one schema branch.`);
  }
  if (schema.not !== undefined) {
    let matched = false;
    try { validateSchemaNode(value, schema.not, root, label); matched = true; } catch {}
    assert.equal(matched, false, `${label} matches a forbidden schema.`);
  }
  if (Object.hasOwn(schema, "const")) assert.deepEqual(value, schema.const, `${label} const mismatch.`);
  if (Array.isArray(schema.enum)) assert.ok(schema.enum.some((candidate) => stableJson(candidate) === stableJson(value)), `${label} enum mismatch.`);
  if (schema.type === "object") {
    assert.ok(value !== null && typeof value === "object" && !Array.isArray(value), `${label} must be an object.`);
    const object = value as JsonObject;
    const properties = (schema.properties ?? {}) as Record<string, unknown>;
    const required = (schema.required ?? []) as unknown[];
    assert.ok(Array.isArray(required) && required.every((key) => typeof key === "string"), `${label} required fields are invalid.`);
    for (const key of required as string[]) assert.ok(Object.hasOwn(object, key), `${label} is missing ${key}.`);
    const unknownKeys = Object.keys(object).filter((key) => !Object.hasOwn(properties, key));
    if (schema.additionalProperties === false) assert.deepEqual(unknownKeys, [], `${label} has unknown fields.`);
    else if (schema.additionalProperties !== undefined && schema.additionalProperties !== true) for (const key of unknownKeys) validateSchemaNode(object[key], schema.additionalProperties, root, `${label}.${key}`);
    if (schema.propertyNames !== undefined) for (const key of Object.keys(object)) validateSchemaNode(key, schema.propertyNames, root, `${label} property ${key}`);
    for (const [key, child] of Object.entries(properties)) if (Object.hasOwn(object, key)) validateSchemaNode(object[key], child, root, `${label}.${key}`);
  } else if (schema.type === "array") {
    assert.ok(Array.isArray(value), `${label} must be an array.`);
    if (schema.minItems !== undefined) assert.ok(value.length >= Number(schema.minItems), `${label} has too few items.`);
    if (schema.maxItems !== undefined) assert.ok(value.length <= Number(schema.maxItems), `${label} has too many items.`);
    if (schema.uniqueItems === true) assert.equal(new Set(value.map(stableJson)).size, value.length, `${label} has duplicate items.`);
    if (schema.items !== undefined) value.forEach((entry, index) => validateSchemaNode(entry, schema.items, root, `${label}[${index}]`));
  } else if (schema.type === "string") {
    assert.equal(typeof value, "string", `${label} must be a string.`);
    if (schema.minLength !== undefined) assert.ok((value as string).length >= Number(schema.minLength), `${label} is too short.`);
    if (schema.maxLength !== undefined) assert.ok((value as string).length <= Number(schema.maxLength), `${label} is too long.`);
  } else if (schema.type === "integer") assert.ok(Number.isSafeInteger(value), `${label} must be an integer.`);
  else if (schema.type === "boolean") assert.equal(typeof value, "boolean", `${label} must be a boolean.`);
  else if (schema.type === "null") assert.equal(value, null, `${label} must be null.`);
  if (schema.minimum !== undefined) assert.ok(Number(value) >= Number(schema.minimum), `${label} is below its minimum.`);
  if (schema.maximum !== undefined) assert.ok(Number(value) <= Number(schema.maximum), `${label} exceeds its maximum.`);
  if (schema.pattern !== undefined) assert.match(value as string, new RegExp(String(schema.pattern)), `${label} pattern mismatch.`);
  if (schema.format === "date-time") validateDate(value, label);
  if (schema.contentEncoding === "base64") { assert.equal(typeof value, "string", `${label} encoded content must be a string.`); assert.equal(Buffer.from(value as string, "base64").toString("base64"), value, `${label} is not canonical base64.`); }
};
export const validateAgainstSchemaFile = (value: unknown, schemaPath: string, label: string) => {
  const schema = JSON.parse(readFileSync(repositoryPath(schemaPath), "utf8")) as JsonObject;
  validateSchemaNode(value, schema, schema, label);
};
const validateCapturedBytes = (value: unknown, label: string) => {
  const object = strictObject(value, ["byteLength", "data", "encoding", "sha256"], label);
  assert.equal(object.encoding, "base64");
  assert.equal(typeof object.data, "string");
  const bytes = Buffer.from(object.data as string, "base64");
  assert.equal(bytes.toString("base64"), object.data, `${label} is not canonical base64.`);
  assert.equal(bytes.byteLength, object.byteLength);
  assert.equal(sha256Bytes(bytes), object.sha256);
  return bytes;
};
const listFiles = (directory: string): string[] => {
  return readdirSync(directory, {withFileTypes: true}).flatMap((entry) => {
    const absolute = resolve(directory, entry.name);
    assert.ok(!entry.isSymbolicLink(), `Proof output symlink rejected: ${relative(ROOT, absolute)}`);
    if (entry.isDirectory()) return listFiles(absolute);
    assert.ok(entry.isFile());
    return [relative(ROOT, absolute)];
  }).sort();
};
const proofEnvironment = () => {
  const env = {} as NodeJS.ProcessEnv;
  for (const key of ["TMPDIR", "TEMP", "TMP", "LANG", "LC_ALL", "HOME", "USER", "LOGNAME", "SHELL", "TERM"]) if (process.env[key]) env[key] = process.env[key];
  env.PATH = "/usr/bin:/bin:/opt/homebrew/bin";
  env.NODE_NO_WARNINGS = "1";
  return env;
};
const gitEnvironment = () => {
  const env = proofEnvironment();
  env.GIT_CONFIG_NOSYSTEM = "1";
  env.GIT_CONFIG_GLOBAL = "/dev/null";
  env.GIT_OPTIONAL_LOCKS = "0";
  return env;
};
const git = (...argv: string[]) => {
  const result = spawnSync("/usr/bin/git", argv, {cwd: ROOT, encoding: "utf8", shell: false, env: gitEnvironment()});
  assert.equal(result.status, 0, result.stderr || `git ${argv.join(" ")} failed`);
  return result.stdout.trim();
};
const executableBinding = (logicalId: string) => {
  const path = logicalId === "system:/usr/bin/git" ? "/usr/bin/git" : process.execPath;
  const resolved = realpathSync(path);
  const status = lstatSync(resolved);
  assert.ok(status.isFile() && !status.isSymbolicLink(), `Trusted executable is not a regular file: ${logicalId}`);
  const bytes = readFileSync(resolved);
  return {logicalId, sha256: sha256Bytes(bytes), byteLength: bytes.byteLength};
};
const environmentBinding = (gitMode: boolean) => {
  const environment = gitMode ? gitEnvironment() : proofEnvironment();
  const exact = Object.fromEntries(Object.entries(environment).filter((entry): entry is [string, string] => typeof entry[1] === "string").sort(([left], [right]) => left.localeCompare(right)));
  return {
    policy: gitMode ? "proof-scrubbed-git-v2" : "proof-scrubbed-v2",
    keys: Object.keys(exact),
    sha256: sha256Bytes(stableJson(exact)),
  };
};

const readJson = (path: string) => JSON.parse(readFileSync(repositoryPath(path), "utf8")) as unknown;
const exactArray = (value: unknown, expected: readonly unknown[], label: string) => assert.deepEqual(value, expected, `${label} mismatch.`);

const validateSourceState = (value: unknown, label: string) => {
  const state = strictObject(value, ["files", "headCommit", "indexEmpty", "observedDirtyPaths", "sha256"], label);
  assert.equal(state.headCommit, BASE_COMMIT);
  assert.equal(state.indexEmpty, true);
  exactArray(state.observedDirtyPaths, CORRECTION_PATHS, `${label} dirty paths`);
  assert.ok(Array.isArray(state.files) && state.files.length === 23);
  const files = state.files.map((entry, index) => validateBinding(entry, `${label} file ${index}`));
  exactArray(files.map((entry) => entry.path), CORRECTION_PATHS, `${label} file paths`);
  assert.equal(state.sha256, sha256Bytes(stableJson(files)), `${label} aggregate mismatch.`);
  return state;
};

const validateRunnerResultShape = (value: unknown, plan: JsonObject, registry: JsonObject) => {
  const result = strictObject(value, [
    "authorization", "baseCommit", "bindings", "cleanExpectedPaths", "cleanup", "derivedGitState", "dirtyExpectedPaths",
    "evidence", "execution", "headCommit", "network", "observedDirtyPaths", "productPhaseClaimed", "proofPurpose",
    "recordedAt", "resultVersion", "runtime", "selectedExpectedPaths", "specId", "status",
  ], "Runner result");
  assert.equal(result.resultVersion, 2);
  assert.equal(result.specId, "SPEC-0001");
  assert.equal(result.proofPurpose, "phase-1.5-compatibility-synthetic");
  assert.equal(result.status, "passed");
  validateDate(result.recordedAt, "Runner result recordedAt");
  assert.equal(result.productPhaseClaimed, false, "Synthetic proof may not claim product Phase 2.");
  const runtime = strictObject(result.runtime, ["browserExecutable", "browserVersion", "nodeVersion", "playwrightCoreVersion"], "Runner runtime");
  assert.equal(runtime.playwrightCoreVersion, "1.62.1");
  assert.ok(typeof runtime.nodeVersion === "string" && runtime.nodeVersion.length > 0);
  assert.ok(typeof runtime.browserVersion === "string" && runtime.browserVersion.length > 0);
  validateExternalBinding(runtime.browserExecutable, "Runner browser executable");
  assert.equal(result.derivedGitState, "dirty-executor");
  assert.equal(result.baseCommit, BASE_COMMIT);
  assert.equal(result.headCommit, BASE_COMMIT);
  exactArray(result.observedDirtyPaths, CORRECTION_PATHS, "Runner observed dirty paths");
  exactArray(result.dirtyExpectedPaths, CORRECTION_PATHS, "Runner dirty expectation");
  exactArray(result.cleanExpectedPaths, [], "Runner clean expectation");
  exactArray(result.selectedExpectedPaths, CORRECTION_PATHS, "Runner selected expectation");
  assert.deepEqual(result.authorization, {authorizationId: AUTHORIZATION_ID, materializationKind: "materialized"});
  const bindings = strictObject(result.bindings, ["adapter", "catalog", "plan", "registry"], "Runner bindings");
  const expectedBindings = {
    catalog: bindFile(CATALOG_PATH), plan: bindFile(COMPATIBILITY_PLAN_PATH), registry: bindFile(REGISTRY_PATH), adapter: bindFile(ADAPTER_PATH),
  };
  assert.deepEqual(bindings, expectedBindings, "Runner graph bindings drifted.");
  const steps = plan.steps as JsonObject[];
  const planEvidence = plan.evidence as JsonObject;
  const execution = strictObject(result.execution, ["actionCount", "checkpointCount", "protectedRegressionGroups", "screenshotCount", "selectedActionIds"], "Runner execution");
  exactArray(execution.selectedActionIds, steps.map((step) => step.actionId), "Runner selected actions");
  assert.equal(execution.actionCount, 27);
  assert.equal(execution.checkpointCount, 4);
  assert.equal(execution.screenshotCount, 1);
  assert.deepEqual(execution.protectedRegressionGroups, planEvidence.protectedRegressionGroups);
  const evidence = strictObject(result.evidence, ["ledgerKinds", "protectedRegressionGroups", "screenshotIds"], "Runner evidence");
  assert.deepEqual(evidence, {
    ledgerKinds: planEvidence.ledgerKinds,
    screenshotIds: planEvidence.screenshotIds,
    protectedRegressionGroups: planEvidence.protectedRegressionGroups,
  });
  assert.equal(result.productPhaseClaimed, planEvidence.productPhaseClaimed, "Runner/plan product claim mismatch.");
  assert.deepEqual(result.network, {browserNonLoopbackAttempts: 0, serverNonLoopbackAttempts: 0, childNonLoopbackAttempts: 0});
  assert.deepEqual(result.cleanup, {anchorRestored: true, sourceRestored: true, browserContextsOpen: 0, activeGates: 0, activeIntercepts: 0, openChildProcesses: 0, openPorts: 0, residualPaths: []});
  assert.ok(Array.isArray(registry.actions) && registry.actions.length === 27);
  return result;
};

const validateNegativeLedger = () => {
  const negative = strictObject(readJson(`${COMPATIBILITY_OUTPUT_ROOT}/synthetic/negative-ledger.json`), ["fixture", "ledgerVersion", "results"], "Negative ledger");
  assert.equal(negative.ledgerVersion, 1);
  const fixtureBinding = validateBinding(negative.fixture, "Negative fixture");
  assert.equal(fixtureBinding.path, "scripts/fixtures/spec0001-browser/v2/phase-1.5-compatibility-negative-cases.json");
  const fixture = strictObject(readJson(fixtureBinding.path), ["cases", "fixtureVersion"], "Negative fixture value");
  assert.equal(fixture.fixtureVersion, 2);
  assert.ok(Array.isArray(fixture.cases) && fixture.cases.length === 37 && Array.isArray(negative.results) && negative.results.length === 37);
  const expected = fixture.cases.map((entry, index) => {
    const item = strictObject(entry, ["category", "expectedCode", "name"], `Negative fixture case ${index}`);
    assert.ok(typeof item.category === "string" && typeof item.name === "string" && typeof item.expectedCode === "string");
    return {name: item.name, expectedCode: item.expectedCode};
  });
  assert.equal(new Set(expected.map((entry) => entry.name)).size, 37);
  assert.equal(new Set(expected.map((entry) => entry.expectedCode)).size, 37);
  const observed = negative.results.map((entry, index) => {
    const item = strictObject(entry, ["expectedCode", "name", "status"], `Negative result ${index}`);
    assert.equal(item.status, "passed");
    return {name: item.name, expectedCode: item.expectedCode};
  });
  assert.deepEqual(observed, expected);
};

const validateDeepLedgers = (result: JsonObject, plan: JsonObject, registry: JsonObject) => {
  const actionsById = new Map((registry.actions as JsonObject[]).map((entry) => [String(entry.actionId), entry]));
  const fixturesById = new Map((registry.fixtures as JsonObject[]).map((entry) => [String(entry.fixtureId), entry]));
  const steps = plan.steps as JsonObject[];

  const actionLedger = strictObject(readJson(`${COMPATIBILITY_OUTPUT_ROOT}/synthetic/action-ledger.json`), ["actions", "authorizationId", "ledgerVersion"], "Action ledger");
  assert.equal(actionLedger.ledgerVersion, 1); assert.equal(actionLedger.authorizationId, AUTHORIZATION_ID);
  assert.ok(Array.isArray(actionLedger.actions) && actionLedger.actions.length === 27);
  const actionEntries = actionLedger.actions.map((entry, index) => {
    const expectedStep = steps[index];
    const registryAction = actionsById.get(String(expectedStep.actionId));
    assert.ok(registryAction, `Action ledger references an unknown action at ${index}.`);
    const stateful = ["pointer", "workspace-driver", "runner-environment", "checkpoint"].includes(String(registryAction.family));
    const action = strictObject(entry, stateful
      ? ["actionId", "at", "contextId", "evidence", "expectedEvidenceDigest", "family", "observedEvidenceDigest", "status", "stepId"]
      : ["actionId", "at", "contextId", "evidence", "family", "status", "stepId"], `Action ledger entry ${index}`);
    assert.equal(action.stepId, expectedStep.stepId); assert.equal(action.actionId, expectedStep.actionId); assert.equal(action.contextId, expectedStep.contextId);
    assert.equal(action.family, registryAction.family); assert.equal(action.status, "passed"); validateDate(action.at, `Action ${index} timestamp`);
    let canonicalEvidence = action.evidence;
    if ((registryAction.family === "workspace-driver" || registryAction.family === "runner-environment") && registryAction.fixtureId !== null) {
      const wrapped = strictObject(action.evidence, ["fixture", "result"], `Action ${index} fixture evidence`);
      const fixture = strictObject(wrapped.fixture, ["binding", "expectedFixtureDigest", "fixtureId", "fixtureKind", "observedFixtureDigest", "sourceKind"], `Action ${index} fixture binding`);
      const expectedFixture = fixturesById.get(String(registryAction.fixtureId));
      assert.ok(expectedFixture); assert.equal(fixture.fixtureId, expectedFixture.fixtureId); assert.equal(fixture.fixtureKind, expectedFixture.fixtureKind);
      assert.equal(fixture.sourceKind, expectedFixture.sourceKind); assert.equal(fixture.expectedFixtureDigest, expectedFixture.expectedFixtureDigest);
      assert.equal(fixture.observedFixtureDigest, expectedFixture.expectedFixtureDigest); assert.equal(fixture.binding, null);
      canonicalEvidence = wrapped.result;
    }
    if (stateful) {
      assert.equal(action.expectedEvidenceDigest, registryAction.expectedEvidenceDigest, `Action ${index} expected evidence binding mismatch.`);
      assert.equal(action.observedEvidenceDigest, registryAction.expectedEvidenceDigest, `Action ${index} observed evidence binding mismatch.`);
      assert.equal(sha256Bytes(stableJson(canonicalEvidence)), registryAction.expectedEvidenceDigest, `Action ${index} evidence digest mismatch.`);
    } else assert.equal(registryAction.expectedEvidenceDigest, undefined);
    return action;
  });

  const checkpointLedger = strictObject(readJson(`${COMPATIBILITY_OUTPUT_ROOT}/synthetic/checkpoint-ledger.json`), ["authorizationId", "checkpoints", "ledgerVersion"], "Checkpoint ledger");
  assert.equal(checkpointLedger.ledgerVersion, 1); assert.equal(checkpointLedger.authorizationId, AUTHORIZATION_ID);
  assert.ok(Array.isArray(checkpointLedger.checkpoints) && checkpointLedger.checkpoints.length === 4);
  const checkpointIds = checkpointLedger.checkpoints.map((entry) => (entry as JsonObject).checkpointId);
  exactArray(checkpointIds, ["after-mount", "environment-checkpoint", "workspace-checkpoint", "final-environment"], "Checkpoint IDs");
  for (const [index, value] of checkpointLedger.checkpoints.entries()) {
    const entry = value as JsonObject;
    assert.ok(entry.channel === "workspace-driver" || entry.channel === "runner-environment");
    if (entry.channel === "workspace-driver") {
      strictObject(entry, ["channel", "checkpoint", "checkpointId", "operation", "response"], `Workspace checkpoint ${index}`);
      const actionId = index === 0 ? "checkpoint-after-mount" : "workspace-checkpoint";
      const evidence = actionEntries.find((action) => action.actionId === actionId)!.evidence as JsonObject;
      assert.deepEqual({operation: entry.operation, response: entry.response, checkpoint: entry.checkpoint}, evidence);
    } else {
      strictObject(entry, ["activeGates", "channel", "checkpointId", "fixtureId", "revision"], `Environment checkpoint ${index}`);
      assert.ok(Array.isArray(entry.activeGates)); validateNonnegativeInteger(entry.revision, `Environment checkpoint ${index} revision`);
      const actionId = entry.checkpointId === "environment-checkpoint" ? "environment-checkpoint" : "evidence-checkpoint";
      const evidence = actionEntries.find((action) => action.actionId === actionId)!.evidence as JsonObject;
      assert.deepEqual({fixtureId: evidence.fixtureId, activeGates: evidence.activeGates, revision: evidence.revision}, {fixtureId: entry.fixtureId, activeGates: entry.activeGates, revision: entry.revision});
    }
  }

  const storageLedger = strictObject(readJson(`${COMPATIBILITY_OUTPUT_ROOT}/synthetic/storage-ledger.json`), ["authorizationId", "ledgerVersion", "records", "residue"], "Storage ledger");
  assert.equal(storageLedger.ledgerVersion, 1); assert.equal(storageLedger.authorizationId, AUTHORIZATION_ID); assert.equal(storageLedger.residue, false);
  assert.ok(Array.isArray(storageLedger.records) && storageLedger.records.length === 16);
  const expectedStorage = [
    ["network-denial-self-test", "after-navigation"], ["network-denial-self-test", "before-close"],
    ["synthetic-1024x768", "after-navigation"], ["synthetic-1024x768", "before-actions"],
    ...["regression-home-new-drawing", "regression-home-new-stick", "regression-stick-creator-back", "regression-drawing-protected"].flatMap((context) => [[context, "after-navigation"], [context, "before-close"]]),
    ["synthetic-1024x768", "after-actions"], ["synthetic-1024x768", "before-close"],
    ["extension-production-smoke", "after-navigation"], ["extension-production-smoke", "before-close"],
  ];
  const observedStorage = storageLedger.records.map((value, index) => {
    const entry = strictObject(value, ["cacheCount", "checkpoint", "contextId", "indexedDatabaseCount", "localStorageKeys", "opfsAvailable", "opfsEntries", "serviceWorkerCount", "sessionStorageKeys"], `Storage record ${index}`);
    const productPreferenceCheckpoint =
      (entry.contextId === "synthetic-1024x768" && (entry.checkpoint === "after-actions" || entry.checkpoint === "before-close")) ||
      (typeof entry.contextId === "string" && entry.contextId.startsWith("regression-") && entry.checkpoint === "before-close");
    const expectedLocalStorageKeys = productPreferenceCheckpoint
      ? ["da_drawing_ai_control_preferences_v1", "da_welcome_seen"]
      : [];
    assert.deepEqual({localStorageKeys: entry.localStorageKeys, sessionStorageKeys: entry.sessionStorageKeys, indexedDatabaseCount: entry.indexedDatabaseCount, cacheCount: entry.cacheCount, serviceWorkerCount: entry.serviceWorkerCount, opfsEntries: entry.opfsEntries}, {localStorageKeys: expectedLocalStorageKeys, sessionStorageKeys: [], indexedDatabaseCount: 0, cacheCount: 0, serviceWorkerCount: 0, opfsEntries: []});
    assert.equal(typeof entry.opfsAvailable, "boolean");
    return [entry.contextId, entry.checkpoint];
  });
  assert.deepEqual(observedStorage, expectedStorage);

  const requestLedger = strictObject(readJson(`${COMPATIBILITY_OUTPUT_ROOT}/synthetic/request-ledger.json`), ["authorizationId", "interceptedRequests", "ledgerVersion", "realApiRouteRequests"], "Request ledger");
  assert.equal(requestLedger.ledgerVersion, 1); assert.equal(requestLedger.authorizationId, AUTHORIZATION_ID); assert.equal(requestLedger.realApiRouteRequests, 0);
  assert.ok(Array.isArray(requestLedger.interceptedRequests) && requestLedger.interceptedRequests.length === 1);
  const request = strictObject(requestLedger.interceptedRequests[0], ["method", "path", "requestBodySha256", "responseBodySha256"], "Intercepted request");
  assert.equal(request.method, "POST"); assert.equal(request.path, "/api/ai"); validateDigest(request.requestBodySha256, "Request body digest"); validateDigest(request.responseBodySha256, "Response body digest");

  const networkLedger = strictObject(readJson(`${COMPATIBILITY_OUTPUT_ROOT}/synthetic/network-ledger.json`), ["authorizationId", "browser", "browserPolicyViolations", "derived", "expectedBrowserDenials", "guardChecks", "guardV2", "ledgerVersion", "server"], "Network ledger");
  assert.equal(networkLedger.ledgerVersion, 1); assert.equal(networkLedger.authorizationId, AUTHORIZATION_ID); assert.deepEqual(networkLedger.browserPolicyViolations, []);
  assert.deepEqual(networkLedger.guardV2, GUARD_V2_BINDING, "Generated compatibility network guard binding drifted.");
  assert.ok(Array.isArray(networkLedger.guardChecks) && networkLedger.guardChecks.length === 20);
  assert.deepEqual(networkLedger.guardChecks.map((value, index) => {
    const suppressed = index === 16 || index === 18;
    const entry = strictObject(value, suppressed ? ["denied", "name", "suppressed"] : ["denied", "name"], `Guard check ${index}`);
    if (suppressed) { assert.equal(entry.denied, false); assert.equal(entry.suppressed, true); }
    else assert.equal(entry.denied, true);
    return entry.name;
  }), SERVER_GUARD_NAMES);
  assert.ok(Array.isArray(networkLedger.server) && networkLedger.server.length >= 20);
  const server = networkLedger.server.map((value, index) => {
    const entry = strictObject(value, ["at", "pid", "primitive", "result", "target"], `Server network record ${index}`);
    validateDate(entry.at, `Server network timestamp ${index}`); assert.ok(Number.isSafeInteger(entry.pid) && Number(entry.pid) > 1);
    assert.ok(entry.result === "allowed" || entry.result === "denied" || entry.result === "suppressed"); assert.equal(typeof entry.target, "string"); return entry;
  });
  assert.deepEqual(server.slice(0, 20).map((entry) => entry.primitive), SERVER_PRIMITIVES);
  assert.ok(server.slice(0, 20).every((entry, index) => index === 16 || index === 18 ? entry.result === "suppressed" : entry.result === "denied"));
  const runtimeServer = server.slice(20);
  assert.deepEqual(runtimeServer.filter((entry) => entry.result === "suppressed").map((entry) => ({primitive: entry.primitive, target: entry.target})), [
    {primitive: "v2.framework.next.getVersionInfo", target: "https://registry.npmjs.org/-/package/next/dist-tags"},
    {primitive: "v2.framework.next.telemetry.flushDetached", target: "dev:repository-root"},
    {primitive: "v2.framework.next.telemetry.flushDetached", target: "dev:repository-root"},
  ], "Exact Next development-only network suppressions changed.");
  assert.ok(runtimeServer.filter((entry) => entry.result !== "suppressed").every((entry) => entry.result === "allowed" && (isExactLoopbackTarget(String(entry.target)) || entry.target === "next-internal-node-child")), "Runtime server network evidence is not loopback-only.");
  assert.ok(Array.isArray(networkLedger.browser) && networkLedger.browser.length >= 2);
  const browser = networkLedger.browser.map((value, index) => {
    const entry = strictObject(value, ["allowed", "at", "channel", "expectedSelfTest", "host", "method", "path", "protocol"], `Browser network record ${index}`);
    validateDate(entry.at, `Browser network timestamp ${index}`); assert.equal(entry.channel, "browser"); assert.equal(typeof entry.allowed, "boolean"); assert.equal(typeof entry.expectedSelfTest, "boolean");
    if (entry.allowed) assert.ok(isExactLoopbackHost(String(entry.host).replace(/:\d+$/, "")), `Allowed browser target is not loopback: ${String(entry.host)}`);
    else { assert.equal(entry.expectedSelfTest, true); assert.equal(entry.host, "203.0.113.1"); }
    return entry;
  });
  const deniedBrowser = browser.filter((entry) => entry.allowed === false);
  assert.deepEqual(deniedBrowser.map((entry) => entry.method), ["GET", "WEBSOCKET"]);
  assert.ok(Array.isArray(networkLedger.expectedBrowserDenials) && networkLedger.expectedBrowserDenials.length === 2);
  networkLedger.expectedBrowserDenials.forEach((value, index) => {
    const denial = strictObject(value, ["allowed", "at", "channel", "code", "expectedSelfTest", "host", "method", "path", "protocol"], `Expected browser denial ${index}`);
    assert.equal(denial.code, "SPEC0001_BROWSER_NETWORK_DENIED");
    const withoutCode = Object.fromEntries(Object.entries(denial).filter(([key]) => key !== "code"));
    assert.deepEqual(withoutCode, deniedBrowser[index]);
  });
  const derived = strictObject(networkLedger.derived, ["counts", "runtimeEntryCounts", "selfTests"], "Derived network evidence");
  assert.deepEqual(derived.counts, result.network);
  const selfTests = strictObject(derived.selfTests, ["browserMethods", "serverLedgerPrefixSha256", "serverPrimitives", "serverSegments"], "Network self-tests");
  assert.deepEqual(selfTests.serverPrimitives, SERVER_PRIMITIVES); assert.deepEqual(selfTests.browserMethods, ["GET", "WEBSOCKET"]); validateDigest(selfTests.serverLedgerPrefixSha256, "Server ledger prefix");
  assert.ok(Array.isArray(selfTests.serverSegments) && selfTests.serverSegments.length === 2);
  const segments = selfTests.serverSegments.map((value, index) => { const segment = strictObject(value, ["entryCount", "pid"], `Server self-test segment ${index}`); assert.equal(segment.entryCount, index === 0 ? 7 : 13); assert.ok(Number.isSafeInteger(segment.pid) && Number(segment.pid) > 1); return segment; });
  assert.ok(server.slice(0, 7).every((entry) => entry.pid === segments[0].pid)); assert.ok(server.slice(7, 20).every((entry) => entry.pid === segments[1].pid));
  const runtimeCounts = strictObject(derived.runtimeEntryCounts, ["browser", "server"], "Network runtime counts");
  assert.equal(runtimeCounts.server, server.length - 20); assert.equal(runtimeCounts.browser, browser.length);

  const consoleLedger = strictObject(readJson(`${COMPATIBILITY_OUTPUT_ROOT}/synthetic/console-ledger.json`), ["application", "authorizationId", "complete", "derived", "ledgerVersion"], "Console ledger");
  assert.equal(consoleLedger.ledgerVersion, 1); assert.equal(consoleLedger.authorizationId, AUTHORIZATION_ID); assert.ok(Array.isArray(consoleLedger.application) && Array.isArray(consoleLedger.complete));
  const complete = consoleLedger.complete.map((value, index) => {
    const entry = strictObject(value, ["at", "contextId", "expectedSelfTest", "message", "type"], `Console record ${index}`);
    validateDate(entry.at, `Console timestamp ${index}`); assert.ok(entry.type === "warning" || entry.type === "error"); assert.equal(typeof entry.expectedSelfTest, "boolean"); assert.equal(typeof entry.message, "string"); return entry;
  });
  const application = complete.filter((entry) => entry.expectedSelfTest !== true);
  assert.deepEqual(consoleLedger.application, application);
  for (const entry of application) { assert.equal(entry.type, "warning"); assert.ok(WARNING_PATTERNS.some((pattern) => new RegExp(pattern).test(String(entry.message))), `Unallowlisted console warning: ${String(entry.message)}`); }
  for (const entry of complete.filter((entry) => entry.expectedSelfTest === true)) { assert.equal(entry.contextId, "network-denial-self-test"); assert.equal(entry.type, "error"); assert.ok(String(entry.message).includes("net::ERR_BLOCKED_BY_CLIENT") || String(entry.message).includes("wss://203.0.113.1/")); }
  assert.deepEqual(consoleLedger.derived, {applicationEntries: application.length, expectedSelfTestEntries: complete.length - application.length});

  const regressionLedger = strictObject(readJson(`${COMPATIBILITY_OUTPUT_ROOT}/synthetic/regression-ledger.json`), ["authorizationId", "groups", "ledgerVersion", "productPhaseClaimed", "production"], "Regression ledger");
  assert.equal(regressionLedger.ledgerVersion, 1); assert.equal(regressionLedger.authorizationId, AUTHORIZATION_ID); assert.equal(regressionLedger.productPhaseClaimed, false);
  assert.ok(Array.isArray(regressionLedger.groups) && regressionLedger.groups.length === 5);
  const groups = regressionLedger.groups.map((value, index) => {
    const entry = strictObject(value, ["assertions", "at", "group", "status"], `Regression group ${index}`); assert.equal(entry.status, "passed"); validateDate(entry.at, `Regression timestamp ${index}`);
    assert.ok(Object.hasOwn(REGRESSION_ASSERTIONS, String(entry.group))); assert.deepEqual(entry.assertions, REGRESSION_ASSERTIONS[entry.group as keyof typeof REGRESSION_ASSERTIONS]); return entry;
  });
  assert.deepEqual(groups.map((entry) => entry.group), Object.keys(REGRESSION_ASSERTIONS));
  for (const entry of actionEntries.filter((action) => action.family === "protected-regression")) assert.deepEqual(entry.evidence, groups.find((group) => group.group === (entry.evidence as JsonObject).group));
  const production = strictObject(regressionLedger.production, ["forbiddenUrlResults", "scan", "testerExcluded"], "Production regression evidence"); assert.equal(production.testerExcluded, true);
  assert.deepEqual(production.forbiddenUrlResults, FORBIDDEN_URLS.map((path) => ({path, status: 404})));
  const scan = strictObject(production.scan, ["excludedNonDeployableRoots", "fileCount", "inventory", "leaks", "scannedMarkers"], "Production scan");
  assert.deepEqual(scan.scannedMarkers, PRODUCTION_MARKERS); assert.deepEqual(scan.excludedNonDeployableRoots, [".next/cache"]); assert.deepEqual(scan.leaks, []);
  assert.ok(Array.isArray(scan.inventory) && scan.inventory.length > 0 && scan.fileCount === scan.inventory.length);
  const inventoryPaths = scan.inventory.map((value, index) => { const entry = strictObject(value, ["byteLength", "path", "sha256"], `Production inventory ${index}`); assert.ok(typeof entry.path === "string" && entry.path.startsWith(".next/")); validateNonnegativeInteger(entry.byteLength, `Production inventory ${index} length`); validateDigest(entry.sha256, `Production inventory ${index} digest`); return entry.path; });
  assert.equal(new Set(inventoryPaths).size, inventoryPaths.length);

  const screenshotAction = actionEntries.find((entry) => entry.actionId === "compatibility-screenshot")!;
  const screenshot = strictObject(screenshotAction.evidence, ["byteLength", "id", "path", "sha256", "viewport"], "Screenshot evidence");
  assert.equal(screenshot.id, "phase-1.5-compatibility"); assert.deepEqual(screenshot.viewport, {width: 1024, height: 768});
  const screenshotBinding = validateBinding({path: screenshot.path, byteLength: screenshot.byteLength, sha256: screenshot.sha256}, "Screenshot binding");
  assert.equal(screenshotBinding.path, `${COMPATIBILITY_OUTPUT_ROOT}/synthetic/screenshots/phase-1.5-compatibility.png`);
  assert.deepEqual([...readFileSync(repositoryPath(screenshotBinding.path)).subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10], "Screenshot is not a PNG.");

  const cleanupLedger = strictObject(readJson(`${COMPATIBILITY_OUTPUT_ROOT}/synthetic/cleanup.json`), ["activeGates", "activeIntercepts", "anchorRestored", "authorizationId", "browserContextsOpen", "collisionPreservation", "ledgerVersion", "lifecycleDrills", "openChildProcesses", "openPorts", "postRunSourceSnapshot", "preRunSourceSnapshot", "residualPaths", "snapshotsIdentical", "sourceRestored"], "Cleanup ledger");
  assert.equal(cleanupLedger.ledgerVersion, 1); assert.equal(cleanupLedger.authorizationId, AUTHORIZATION_ID); assert.deepEqual(cleanupLedger.postRunSourceSnapshot, cleanupLedger.preRunSourceSnapshot); assert.equal(cleanupLedger.snapshotsIdentical, true);
  const collision = strictObject(cleanupLedger.collisionPreservation, ["cases", "sentinelByteLength", "sentinelSha256"], "Cleanup collision preservation");
  assert.equal(collision.sentinelSha256, COLLISION_SENTINEL.sentinelSha256); assert.equal(collision.sentinelByteLength, COLLISION_SENTINEL.sentinelByteLength);
  assert.deepEqual(collision.cases, [
    {collision: ".next", exitCode: 1, sentinelsPreserved: true},
    {collision: "temporary", exitCode: 1, sentinelsPreserved: true},
  ]);
  assert.ok(Array.isArray(cleanupLedger.lifecycleDrills) && cleanupLedger.lifecycleDrills.length === 3);
  cleanupLedger.lifecycleDrills.forEach((value, index) => {
    const drill = strictObject(value, ["exitCode", "live", "mode", "outputRemoved", "signal", "sourceRestored"], `Lifecycle drill ${index}`);
    assert.equal(drill.sourceRestored, true); assert.equal(drill.outputRemoved, true);
    if (index === 0) {
      assert.equal(drill.mode, "failure"); assert.equal(drill.signal, null); assert.equal(drill.exitCode, 0);
      assert.deepEqual(drill.live, {mode: "failure", status: "passed", anchorRestored: true, sourceRestored: true, browserContextsOpen: 0, openChildProcesses: 0, openPorts: 0, profileRemoved: true, nextRemoved: true, temporaryRemoved: true});
    } else {
      const signal = index === 1 ? "SIGINT" : "SIGTERM"; assert.equal(drill.mode, "signal"); assert.equal(drill.signal, signal); assert.equal(drill.exitCode, signal === "SIGINT" ? 130 : 143);
      const live = strictObject(drill.live, ["anchorInstalled", "browserContextsOpen", "openChildProcesses", "openPorts", "port", "profile"], `Lifecycle drill ${index} live state`);
      assert.deepEqual({anchorInstalled: live.anchorInstalled, browserContextsOpen: live.browserContextsOpen, openChildProcesses: live.openChildProcesses, openPorts: live.openPorts}, {anchorInstalled: true, browserContextsOpen: 1, openChildProcesses: 1, openPorts: 1});
      assert.ok(Number.isSafeInteger(live.port) && Number(live.port) > 0); assert.ok(typeof live.profile === "string" && live.profile.startsWith(`${COMPATIBILITY_OUTPUT_ROOT}/synthetic/lifecycle-signal-drill/`));
    }
  });
  const snapshot = strictObject(cleanupLedger.preRunSourceSnapshot, ["entries", "gitStatus", "paths"], "Cleanup source snapshot");
  assert.ok(Array.isArray(snapshot.paths) && Array.isArray(snapshot.entries) && snapshot.paths.length === snapshot.entries.length);
  assert.deepEqual(snapshot.paths, [...snapshot.paths].sort());
  snapshot.entries.forEach((value, index) => { const entry = strictObject(value, ["byteLength", "mode", "path", "sha256"], `Cleanup snapshot entry ${index}`); assert.equal(entry.path, (snapshot.paths as unknown[])[index]); validateNonnegativeInteger(entry.byteLength, `Cleanup snapshot ${index} length`); validateDigest(entry.sha256, `Cleanup snapshot ${index} digest`); assert.ok(Number.isSafeInteger(entry.mode)); if (CORRECTION_PATHS.includes(entry.path as typeof CORRECTION_PATHS[number])) assert.deepEqual({path: entry.path, byteLength: entry.byteLength, sha256: entry.sha256}, bindFile(entry.path as string)); });
  const snapshotGit = strictObject(snapshot.gitStatus, ["byteLength", "sha256"], "Cleanup Git snapshot"); validateNonnegativeInteger(snapshotGit.byteLength, "Cleanup Git snapshot length"); validateDigest(snapshotGit.sha256, "Cleanup Git snapshot digest");
  const cleanupResult = Object.fromEntries(["anchorRestored", "sourceRestored", "browserContextsOpen", "activeGates", "activeIntercepts", "openChildProcesses", "openPorts", "residualPaths"].map((key) => [key, cleanupLedger[key]]));
  assert.deepEqual(cleanupResult, result.cleanup);
};

type ValidationOptions = {verifyLiveState?: boolean; allowCloseout?: boolean};
export const validateCompatibilityProof = async (manifestPath: string, options: boolean | ValidationOptions = true) => {
  const normalized = typeof options === "boolean" ? {verifyLiveState: options, allowCloseout: false} : {verifyLiveState: options.verifyLiveState ?? true, allowCloseout: options.allowCloseout ?? false};
  const verifyLiveState = normalized.verifyLiveState;
  assert.equal(manifestPath, MANIFEST_PATH, "Compatibility manifest path mismatch.");
  const manifestValue = readJson(manifestPath);
  validateAgainstSchemaFile(manifestValue, MANIFEST_SCHEMA_PATH, "Compatibility proof manifest schema");
  const manifest = strictObject(manifestValue, [
    "artifacts", "baseCommit", "cleanup", "commandConfig", "commandsPassed", "gitState", "headCommit", "lintRegression",
    "manifestVersion", "network", "phase", "preEditNoPlan", "receipts", "recordedAt", "runtime", "specId", "testerExtension",
  ], "Compatibility proof manifest");
  assert.equal(manifest.manifestVersion, 2); assert.equal(manifest.specId, "SPEC-0001"); assert.equal(manifest.phase, "1.5-compatibility");
  assert.equal(manifest.baseCommit, BASE_COMMIT); assert.equal(manifest.headCommit, BASE_COMMIT); validateDate(manifest.recordedAt, "Manifest recordedAt"); assert.equal(manifest.commandsPassed, true);
  if (verifyLiveState) assert.equal(manifest.headCommit, git("rev-parse", "HEAD"));
  const runtime = strictObject(manifest.runtime, ["browserExecutable", "browserVersion", "environmentPolicy", "nodeVersion", "npmVersion", "playwrightCoreVersion"], "Runtime");
  assert.equal(runtime.playwrightCoreVersion, "1.62.1"); assert.equal(runtime.environmentPolicy, "proof-scrubbed-v2");
  for (const key of ["browserVersion", "nodeVersion", "npmVersion"] as const) assert.ok(typeof runtime[key] === "string" && runtime[key].length > 0);
  const manifestBrowserExecutable = validateExternalBinding(runtime.browserExecutable, "Manifest browser executable"); if (verifyLiveState) assert.deepEqual(manifestBrowserExecutable, bindExternalFile(BROWSER_EXECUTABLE));
  const preflight = strictObject(manifest.preEditNoPlan, ["cleanupPassed", "driverMessageCount", "nonLoopbackAttemptCount", "operationCount", "realApiRouteRequestCount", "requestCount", "resultByteLength", "resultSha256", "screenshotCount"], "Pre-edit no-plan evidence");
  assert.deepEqual(preflight, {resultSha256: PRE_EDIT_RESULT_SHA256, resultByteLength: PRE_EDIT_RESULT_BYTE_LENGTH, operationCount: 40, screenshotCount: 13, driverMessageCount: 4, requestCount: 1, nonLoopbackAttemptCount: 0, realApiRouteRequestCount: 0, cleanupPassed: true});

  const configBinding = validateBinding(manifest.commandConfig, "Command config"); assert.equal(configBinding.path, COMMAND_CONFIG_PATH);
  const config = strictObject(readJson(configBinding.path), ["baseCommit", "commands", "configVersion", "outputRoot", "phase", "preEditNoPlan", "specId"], "Command config");
  assert.equal(config.configVersion, 2); assert.equal(config.specId, "SPEC-0001"); assert.equal(config.phase, "1.5-compatibility"); assert.equal(config.baseCommit, BASE_COMMIT); assert.equal(config.outputRoot, COMPATIBILITY_OUTPUT_ROOT); assert.deepEqual(config.preEditNoPlan, manifest.preEditNoPlan);
  assert.ok(Array.isArray(config.commands) && config.commands.length === 9);
  const configCommands = config.commands.map((entry, index) => { const command = strictObject(entry, index === 5 ? ["argv", "capturesLintMeasurement", "cwd", "env", "expectedExitCode", "name", "privacy"] : ["argv", "cwd", "env", "expectedExitCode", "name", "privacy"], `Command config ${index + 1}`); assert.equal(command.name, RECEIPT_NAMES[index]); assert.deepEqual(command.argv, EXPECTED_ARGV[index]); assert.equal(command.cwd, "."); assert.deepEqual(command.env, {}); assert.equal(command.expectedExitCode, 0); assert.equal(command.privacy, "sanitized"); if (index === 5) assert.equal(command.capturesLintMeasurement, true); return command; });

  assert.ok(Array.isArray(manifest.receipts) && manifest.receipts.length === 9);
  const executionBindings: JsonObject[] = [];
  const outputs: Buffer[] = [];
  const receiptStartTimes: number[] = [];
  const receiptBindings = manifest.receipts.map((value, index) => {
    const binding = validateBinding(value, `Receipt ${index + 1}`); assert.equal(binding.path, `${COMPATIBILITY_OUTPUT_ROOT}/receipts/${String(index + 1).padStart(2, "0")}-${RECEIPT_NAMES[index]}.json`);
    const receiptValue = readJson(binding.path); validateAgainstSchemaFile(receiptValue, RECEIPT_SCHEMA_PATH, `Receipt ${index + 1} schema`);
    const receipt = strictObject(receiptValue, ["argv", "cwd", "durationMs", "env", "execution", "exitCode", "expectedExitCode", "lintRegression", "name", "order", "passed", "privacy", "receiptVersion", "startedAt", "stderr", "stdout"], `Receipt ${index + 1}`);
    assert.equal(receipt.receiptVersion, 2); assert.equal(receipt.name, RECEIPT_NAMES[index]); assert.equal(receipt.order, index + 1); assert.deepEqual(receipt.argv, EXPECTED_ARGV[index]); assert.deepEqual(receipt.argv, configCommands[index].argv);
    assert.equal(receipt.cwd, "."); assert.deepEqual(receipt.env, {}); assert.equal(receipt.privacy, "sanitized"); validateDate(receipt.startedAt, `Receipt ${index + 1} startedAt`); receiptStartTimes.push(Date.parse(receipt.startedAt as string)); validateNonnegativeInteger(receipt.durationMs, `Receipt ${index + 1} duration`);
    assert.equal(receipt.exitCode, 0); assert.equal(receipt.expectedExitCode, 0); assert.equal(receipt.passed, true);
    const execution = strictObject(receipt.execution, ["argv", "environment", "executable", "policy"], `Receipt ${index + 1} execution`); assert.equal(execution.policy, "closed-executable-v1");
    const gitMode = EXPECTED_ARGV[index][0] === "git"; const logicalId = gitMode ? "system:/usr/bin/git" : "node:process.execPath";
    const executable = strictObject(execution.executable, ["byteLength", "logicalId", "sha256"], `Receipt ${index + 1} executable`); assert.equal(executable.logicalId, logicalId); validateDigest(executable.sha256, `Receipt ${index + 1} executable digest`); validateNonnegativeInteger(executable.byteLength, `Receipt ${index + 1} executable length`);
    const normalizedArgv = EXPECTED_ARGV[index][0] === "./node_modules/.bin/tsc" ? ["node_modules/typescript/bin/tsc", ...EXPECTED_ARGV[index].slice(1)] : EXPECTED_ARGV[index].slice(1); assert.deepEqual(execution.argv, normalizedArgv);
    const environment = strictObject(execution.environment, ["keys", "policy", "sha256"], `Receipt ${index + 1} environment`); assert.equal(environment.policy, gitMode ? "proof-scrubbed-git-v2" : "proof-scrubbed-v2"); assert.ok(Array.isArray(environment.keys) && environment.keys.every((key) => typeof key === "string") && new Set(environment.keys).size === environment.keys.length); assert.deepEqual(environment.keys, [...environment.keys].sort()); validateDigest(environment.sha256, `Receipt ${index + 1} environment digest`);
    if (verifyLiveState) { assert.deepEqual(executable, executableBinding(logicalId)); assert.deepEqual(environment, environmentBinding(gitMode)); }
    executionBindings.push(execution);
    const stdout = validateCapturedBytes(receipt.stdout, `Receipt ${index + 1} stdout`); const stderr = validateCapturedBytes(receipt.stderr, `Receipt ${index + 1} stderr`); const output = Buffer.concat([stdout, stderr]); outputs.push(stdout);
    assert.doesNotMatch(output.toString("utf8"), /(?:sk-[A-Za-z0-9_-]{16,}|Bearer\s+[A-Za-z0-9._-]{12,}|(?:api[_-]?key|authorization|secret)\s*[:=]\s*["']?[A-Za-z0-9._-]{12,})/i);
    for (const sensitive of [REAL_ROOT, process.env.HOME, process.env.TMPDIR].filter((value): value is string => typeof value === "string" && value.length > 4)) assert.equal(output.includes(Buffer.from(sensitive)), false, `Receipt ${index + 1} contains an absolute private path.`);
    if (index === 5) { validateV2LintMeasurement(receipt.lintRegression, BASE_COMMIT, BASE_COMMIT, verifyLiveState); assert.deepEqual(receipt.lintRegression, manifest.lintRegression); } else assert.equal(receipt.lintRegression, null);
    return binding;
  });
  assert.deepEqual(executionBindings.filter((_entry, index) => ![6, 8].includes(index)).map((entry) => entry.executable), Array(7).fill(executionBindings[0].executable), "Node executable bindings differ across receipts.");
  assert.deepEqual(executionBindings.filter((_entry, index) => ![6, 8].includes(index)).map((entry) => entry.environment), Array(7).fill(executionBindings[0].environment), "Proof environments differ across receipts.");
  assert.deepEqual(executionBindings[8].executable, executionBindings[6].executable, "Git executable bindings differ across receipts.");
  assert.deepEqual(executionBindings[8].environment, executionBindings[6].environment, "Git environments differ across receipts.");
  assert.ok(receiptStartTimes.every((time, index) => index === 0 || time >= receiptStartTimes[index - 1]), "Receipt start times are not monotonic in command order.");
  assert.ok(Date.parse(manifest.recordedAt as string) >= receiptStartTimes.at(-1)!, "Manifest predates its final receipt.");
  assert.match(outputs[0].toString("utf8"), /37 exact negative cases/); assert.match(outputs[7].toString("utf8"), /27 closed actions, 4 checkpoints, 1 screenshots, 5 protected regression groups, productPhaseClaimed=false/);
  const statusOutput = outputs[8].toString("utf8"); assert.ok(statusOutput.startsWith("## HEAD (no branch)\n"), "Status receipt is not detached at the exact base.");
  for (const line of statusOutput.trimEnd().split("\n").slice(1)) assert.ok(line.startsWith(" M ") || line.startsWith("?? "), `Status receipt contains staged/deleted/renamed state: ${line}`);
  if (verifyLiveState) { const current = spawnSync("/usr/bin/git", ["status", "--short", "--branch"], {cwd: ROOT, encoding: "utf8", shell: false, env: gitEnvironment()}); assert.equal(current.status, 0); assert.equal(statusOutput, current.stdout, "Status receipt does not match independently observed status."); }
  validateV2LintMeasurement(manifest.lintRegression, BASE_COMMIT, BASE_COMMIT, verifyLiveState);

  const gitState = strictObject(manifest.gitState, ["after", "before", "unchanged"], "Manifest Git state"); assert.equal(gitState.unchanged, true); const before = validateSourceState(gitState.before, "Pre-command source state"); const after = validateSourceState(gitState.after, "Post-command source state"); assert.deepEqual(after, before);

  const plan = strictObject(readJson(COMPATIBILITY_PLAN_PATH), ["authorizationId", "baseCommit", "cleanExpectedPaths", "contexts", "dirtyExpectedPaths", "evidence", "operationFamilies", "outputRoot", "planVersion", "proofPurpose", "registry", "specId", "steps"], "Compatibility plan");
  assert.equal(plan.planVersion, 2); assert.equal(plan.specId, "SPEC-0001"); assert.equal(plan.proofPurpose, "phase-1.5-compatibility-synthetic"); assert.equal(plan.authorizationId, AUTHORIZATION_ID); assert.equal(plan.baseCommit, BASE_COMMIT); assert.deepEqual(plan.dirtyExpectedPaths, CORRECTION_PATHS); assert.deepEqual(plan.cleanExpectedPaths, []); assert.equal(plan.outputRoot, COMPATIBILITY_OUTPUT_ROOT); assert.deepEqual(plan.registry, bindFile(REGISTRY_PATH)); assert.ok(Array.isArray(plan.steps) && plan.steps.length === 27);
  const registry = strictObject(readJson(REGISTRY_PATH), ["actions", "adapter", "authorizationId", "fixtures", "operationFamilies", "registryVersion", "specId"], "Compatibility registry"); assert.equal(registry.registryVersion, 2); assert.equal(registry.specId, "SPEC-0001"); assert.equal(registry.authorizationId, AUTHORIZATION_ID); assert.deepEqual(registry.adapter, bindFile(ADAPTER_PATH)); assert.deepEqual(registry.operationFamilies, plan.operationFamilies);
  const tester = strictObject(manifest.testerExtension, ["adapter", "authorizationId", "catalog", "cleanExpectedPaths", "derivedGitState", "dirtyExpectedPaths", "materializationKind", "observedDirtyPaths", "plan", "registry", "result", "selectedExpectedPaths"], "Tester extension summary");
  assert.equal(tester.authorizationId, AUTHORIZATION_ID); assert.equal(tester.materializationKind, "materialized"); assert.equal(tester.derivedGitState, "dirty-executor"); assert.deepEqual(tester.observedDirtyPaths, CORRECTION_PATHS); assert.deepEqual(tester.dirtyExpectedPaths, CORRECTION_PATHS); assert.deepEqual(tester.cleanExpectedPaths, []); assert.deepEqual(tester.selectedExpectedPaths, CORRECTION_PATHS);
  const resultBinding = validateBinding(tester.result, "Runner result"); assert.equal(resultBinding.path, RESULT_PATH); const resultValue = readJson(resultBinding.path); validateAgainstSchemaFile(resultValue, RESULT_SCHEMA_PATH, "Runner result schema"); const result = validateRunnerResultShape(resultValue, plan, registry);
  const resultBindings = result.bindings as JsonObject; assert.deepEqual({catalog: tester.catalog, plan: tester.plan, registry: tester.registry, adapter: tester.adapter}, resultBindings);
  assert.deepEqual((result.runtime as JsonObject).browserExecutable, manifestBrowserExecutable, "Manifest/runner browser executable binding mismatch.");
  if (verifyLiveState) { const contract = await import("./browserTesterExtensionContract.ts"); contract.validateExtensionResult(resultValue, ROOT, true); }
  validateDeepLedgers(result, plan, registry); validateNegativeLedger();
  assert.deepEqual(manifest.network, result.network); assert.deepEqual(manifest.cleanup, {passed: true, residualPaths: []}); assert.deepEqual((result.cleanup as JsonObject).residualPaths, []);

  assert.ok(Array.isArray(manifest.artifacts) && manifest.artifacts.length === 43);
  const expectedOutputPaths = [...receiptBindings.map((binding) => binding.path), ...SYNTHETIC_FILES.map((path) => `${COMPATIBILITY_OUTPUT_ROOT}/${path}`)].sort();
  const expectedArtifactPaths = [...expectedOutputPaths, ...CORRECTION_PATHS].sort();
  const artifactPaths = manifest.artifacts.map((entry, index) => validateBinding(entry, `Artifact ${index}`).path); assert.deepEqual(artifactPaths, expectedArtifactPaths); assert.equal(new Set(artifactPaths).size, 43);
  const expectedFinalTree = [...expectedOutputPaths, manifestPath, ...(normalized.allowCloseout ? [`${COMPATIBILITY_OUTPUT_ROOT}/proof-closeout-manifest.json`] : [])].sort();
  assert.deepEqual(listFiles(repositoryPath(COMPATIBILITY_OUTPUT_ROOT)), expectedFinalTree, "Compatibility output tree contains a missing or extra artifact.");
  if (verifyLiveState) assert.equal(git("diff", "--cached", "--name-only"), "");
  return manifest;
};

const main = async () => {
  assert.equal(process.argv.length, 3);
  assert.ok(process.argv[2].startsWith("--manifest="));
  const path = process.argv[2].slice("--manifest=".length);
  await validateCompatibilityProof(path);
  console.log(`Validated SPEC-0001 Phase 1.5 compatibility proof: ${path}`);
};

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) void main().catch((error) => { console.error(error); process.exitCode = 1; });
