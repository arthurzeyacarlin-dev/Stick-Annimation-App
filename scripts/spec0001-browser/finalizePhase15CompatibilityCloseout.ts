import assert from "node:assert/strict";
import {spawnSync} from "node:child_process";
import {createHash} from "node:crypto";
import {existsSync, lstatSync, readFileSync, realpathSync, writeFileSync} from "node:fs";
import {relative, resolve, sep} from "node:path";
import {pathToFileURL} from "node:url";
import {
  CLOSEOUT_SCHEMA_PATH,
  CORRECTION_PATHS,
  validateAgainstSchemaFile,
  validateCompatibilityProof,
} from "./validatePhase15CompatibilityProof.ts";

type JsonObject = Record<string, unknown>;
type FileBinding = {path: string; sha256: string; byteLength: number};

const ROOT = process.cwd();
const REAL_ROOT = realpathSync(ROOT);
const BASE_COMMIT = "8b663d2b80144e9aeba9ea0ecf0f78ccefa78926";
const COMPATIBILITY_OUTPUT_ROOT = "output/spec-0001/phase-1.5-compatibility";
const PROOF_PATH = `${COMPATIBILITY_OUTPUT_ROOT}/proof-manifest.json`;
const CLOSEOUT_PATH = `${COMPATIBILITY_OUTPUT_ROOT}/proof-closeout-manifest.json`;
const RESULT_PATH = `${COMPATIBILITY_OUTPUT_ROOT}/synthetic/runner-result.json`;
const CONTROL_PLANE_PATHS = [
  "docs/CURRENT_STATE.md",
  "docs/SESSION_HANDOFF.md",
  "docs/TODO.md",
  "docs/changelog.md",
  "docs/specs/0001-first-reversible-ai-stick-animation.md",
  "docs/specs/README.md",
  "docs/testing_workflow.md",
  "project/project_structure.txt",
] as const;
const FINAL_DIRTY_PATHS = [...CORRECTION_PATHS, ...CONTROL_PLANE_PATHS].sort((left, right) => left.localeCompare(right));

const sha256Bytes = (value: Uint8Array | string) => `sha256:${createHash("sha256").update(value).digest("hex")}`;
const stableJson = (value: unknown): string => {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  const object = value as JsonObject;
  return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${stableJson(object[key])}`).join(",")}}`;
};
const repositoryPath = (path: string) => {
  const absolute = resolve(REAL_ROOT, path);
  const local = relative(REAL_ROOT, absolute);
  assert.ok(local !== ".." && !local.startsWith(`..${sep}`), `Path escapes repository: ${path}`);
  let cursor = REAL_ROOT;
  for (const part of local.split(sep).filter(Boolean)) {
    cursor = resolve(cursor, part);
    if (existsSync(cursor)) assert.equal(lstatSync(cursor).isSymbolicLink(), false, `Symlink path rejected: ${relative(REAL_ROOT, cursor)}`);
  }
  return absolute;
};
const bindFile = (path: string): FileBinding => {
  const absolute = repositoryPath(path);
  assert.equal(lstatSync(absolute).isFile(), true, `Closeout binding must be a regular file: ${path}`);
  const bytes = readFileSync(absolute);
  return {path, sha256: sha256Bytes(bytes), byteLength: bytes.byteLength};
};
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
  assert.equal(result.status, 0, result.stderr || `git ${argv.join(" ")} failed`);
  return result.stdout;
};
const strictObject = (value: unknown, keys: readonly string[], label: string) => {
  assert.ok(value !== null && typeof value === "object" && !Array.isArray(value), `${label} must be an object.`);
  assert.deepEqual(Object.keys(value as JsonObject).sort(), [...keys].sort(), `${label} fields must be exact.`);
  return value as JsonObject;
};
const validateFrozenPathSet = (value: unknown, label: string) => {
  assert.ok(Array.isArray(value) && value.every((path) => typeof path === "string"));
  assert.deepEqual(value, CORRECTION_PATHS, `${label} must be the frozen exact 23 paths.`);
  assert.equal(new Set(value).size, 23);
  return value as string[];
};
const validateFileBindingShape = (value: unknown, label: string) => {
  const binding = strictObject(value, ["byteLength", "path", "sha256"], label);
  assert.equal(typeof binding.path, "string");
  assert.match(binding.sha256 as string, /^sha256:[0-9a-f]{64}$/);
  assert.ok(Number.isSafeInteger(binding.byteLength) && Number(binding.byteLength) >= 0);
  return binding as unknown as FileBinding;
};
const validateAcceptedSummary = (value: unknown) => {
  const accepted = strictObject(value, [
    "adapter", "authorizationId", "catalog", "cleanExpectedPaths", "derivedGitState", "dirtyExpectedPaths",
    "materializationKind", "observedDirtyPaths", "plan", "registry", "result", "selectedExpectedPaths",
  ], "Accepted dirty summary");
  assert.equal(accepted.authorizationId, "phase-1.5-compatibility-synthetic/v1");
  assert.equal(accepted.materializationKind, "materialized");
  assert.equal(accepted.derivedGitState, "dirty-executor");
  validateFrozenPathSet(accepted.observedDirtyPaths, "Observed dirty paths");
  validateFrozenPathSet(accepted.dirtyExpectedPaths, "Dirty expectation");
  validateFrozenPathSet(accepted.selectedExpectedPaths, "Selected expectation");
  assert.deepEqual(accepted.cleanExpectedPaths, []);
  for (const key of ["catalog", "plan", "registry", "adapter", "result"] as const) validateFileBindingShape(accepted[key], `Accepted ${key}`);
  return accepted;
};
const closeoutAcceptedDirty = (accepted: ReturnType<typeof validateAcceptedSummary>) => ({
  derivedGitState: accepted.derivedGitState,
  observedDirtyPaths: accepted.observedDirtyPaths,
  dirtyExpectedPaths: accepted.dirtyExpectedPaths,
  cleanExpectedPaths: accepted.cleanExpectedPaths,
  catalog: accepted.catalog,
  plan: accepted.plan,
  registry: accepted.registry,
  adapter: accepted.adapter,
});
const validateCloseoutAcceptedDirty = (value: unknown) => {
  const accepted = strictObject(value, [
    "adapter", "catalog", "cleanExpectedPaths", "derivedGitState", "dirtyExpectedPaths", "observedDirtyPaths", "plan", "registry",
  ], "Closeout accepted dirty summary");
  assert.equal(accepted.derivedGitState, "dirty-executor");
  validateFrozenPathSet(accepted.observedDirtyPaths, "Closeout observed dirty paths");
  validateFrozenPathSet(accepted.dirtyExpectedPaths, "Closeout dirty expectation");
  assert.deepEqual(accepted.cleanExpectedPaths, []);
  for (const key of ["catalog", "plan", "registry", "adapter"] as const) validateFileBindingShape(accepted[key], `Closeout accepted ${key}`);
  return accepted;
};

const trackedState = () => {
  const porcelain = git("status", "--porcelain=v1", "-z", "--untracked-files=all");
  const records = porcelain.split("\0").filter(Boolean).map((record) => {
    assert.ok(record.length >= 4 && record[2] === " ", `Unsupported Git status record: ${JSON.stringify(record)}`);
    const status = record.slice(0, 2);
    const path = record.slice(3);
    assert.ok(!status.includes("R") && !status.includes("C") && !status.includes("D"), `Closeout rejects rename/copy/delete state: ${record}`);
    return {...bindFile(path), status};
  }).sort((left, right) => left.path.localeCompare(right.path));
  return {
    headCommit: git("rev-parse", "HEAD").trim(),
    mainCommit: git("rev-parse", "main").trim(),
    originMainCommit: git("rev-parse", "origin/main").trim(),
    indexEmpty: git("diff", "--cached", "--name-only").trim() === "",
    porcelainSha256: sha256Bytes(porcelain),
    records,
  };
};

const validateTrackedSnapshot = (value: unknown, expectedPaths: readonly string[], label: string) => {
  const snapshot = strictObject(value, ["headCommit", "indexEmpty", "mainCommit", "originMainCommit", "porcelainSha256", "records"], label);
  for (const key of ["headCommit", "mainCommit", "originMainCommit"] as const) assert.match(snapshot[key] as string, /^[0-9a-f]{40}$/);
  assert.equal(snapshot.indexEmpty, true); assert.match(snapshot.porcelainSha256 as string, /^sha256:[0-9a-f]{64}$/);
  assert.ok(Array.isArray(snapshot.records));
  const records = snapshot.records.map((value, index) => {
    const record = strictObject(value, ["byteLength", "path", "sha256", "status"], `${label} record ${index}`);
    assert.ok(record.status === " M" || record.status === "??", `${label} contains staged/deleted/renamed state: ${String(record.status)}`);
    validateFileBindingShape({path: record.path, sha256: record.sha256, byteLength: record.byteLength}, `${label} binding ${index}`);
    return record;
  });
  assert.deepEqual(records.map((record) => record.path), expectedPaths);
  return snapshot;
};

const assertSnapshotStable = (left: unknown, right: unknown, label: string) => assert.equal(stableJson(left), stableJson(right), `${label}: Git-visible state changed during closeout.`);

const parseArgs = (argumentsToParse = process.argv.slice(2)) => {
  const values = new Map<string, string>();
  for (const argument of argumentsToParse) {
    const match = /^--(accepted-proof-sha256|base|output|proof)=(.+)$/.exec(argument);
    assert.ok(match && !values.has(match[1]), `Unsupported or duplicate argument: ${argument}`);
    values.set(match[1], match[2]);
  }
  assert.deepEqual([...values.keys()].sort(), ["accepted-proof-sha256", "base", "output", "proof"]);
  assert.equal(values.get("base"), BASE_COMMIT);
  assert.equal(values.get("proof"), PROOF_PATH);
  assert.equal(values.get("output"), CLOSEOUT_PATH);
  const supplied = values.get("accepted-proof-sha256")!;
  const acceptedProofSha256 = supplied.startsWith("sha256:") ? supplied : `sha256:${supplied}`;
  assert.match(acceptedProofSha256, /^sha256:[0-9a-f]{64}$/);
  return {acceptedProofSha256};
};

const runSelfTest = () => {
  const acceptedProofDigest = "a".repeat(64);
  const requiredArguments = [
    `--base=${BASE_COMMIT}`,
    `--proof=${PROOF_PATH}`,
    `--accepted-proof-sha256=${acceptedProofDigest}`,
    `--output=${CLOSEOUT_PATH}`,
  ];
  assert.deepEqual(parseArgs(requiredArguments), {acceptedProofSha256: `sha256:${acceptedProofDigest}`});
  assert.deepEqual(parseArgs(requiredArguments.map((argument) => argument.startsWith("--accepted-proof-sha256=") ? `--accepted-proof-sha256=sha256:${acceptedProofDigest}` : argument)), {acceptedProofSha256: `sha256:${acceptedProofDigest}`});
  assert.throws(() => parseArgs([...requiredArguments, "--mode=dirty"]));
  assert.throws(() => parseArgs([...requiredArguments, requiredArguments[0]]));
  assert.throws(() => parseArgs(requiredArguments.map((argument) => argument.startsWith("--accepted-proof-sha256=") ? "--accepted-proof-sha256" : argument)));
  assert.throws(() => parseArgs([...requiredArguments, "--self-test"]));
  assert.throws(() => parseArgs(requiredArguments.map((argument) => argument.startsWith("--accepted-proof-sha256=") ? `--sha256=${acceptedProofDigest}` : argument)));
  assert.equal(CORRECTION_PATHS.length, 23);
  validateFrozenPathSet([...CORRECTION_PATHS], "Positive ceiling");
  assert.throws(() => validateFrozenPathSet(CORRECTION_PATHS.slice(1), "Missing path"));
  assert.throws(() => validateFrozenPathSet([...CORRECTION_PATHS, "unexpected.ts"], "Extra path"));
  const duplicate = [...CORRECTION_PATHS]; duplicate[1] = duplicate[0];
  assert.throws(() => validateFrozenPathSet(duplicate, "Duplicate path"));
  const binding = {path: "x", sha256: `sha256:${"a".repeat(64)}`, byteLength: 1};
  const summary = {
    result: binding,
    authorizationId: "phase-1.5-compatibility-synthetic/v1",
    materializationKind: "materialized",
    derivedGitState: "dirty-executor",
    observedDirtyPaths: [...CORRECTION_PATHS],
    dirtyExpectedPaths: [...CORRECTION_PATHS],
    cleanExpectedPaths: [],
    selectedExpectedPaths: [...CORRECTION_PATHS],
    catalog: binding, plan: binding, registry: binding, adapter: binding,
  };
  const acceptedSummary = validateAcceptedSummary(summary);
  assert.deepEqual(validateCloseoutAcceptedDirty(closeoutAcceptedDirty(acceptedSummary)), closeoutAcceptedDirty(acceptedSummary));
  assert.throws(() => validateCloseoutAcceptedDirty({...closeoutAcceptedDirty(acceptedSummary), result: binding}));
  assert.throws(() => validateAcceptedSummary({...summary, derivedGitState: "clean-committed"}));
  assert.throws(() => validateAcceptedSummary({...summary, cleanExpectedPaths: [CORRECTION_PATHS[0]]}));
  assert.throws(() => validateAcceptedSummary({...summary, catalog: {...binding, sha256: "forged"}}));
  assert.notEqual(sha256Bytes(stableJson([binding])), sha256Bytes(stableJson([{...binding, byteLength: 2}])));
  console.log("SPEC-0001 Phase 1.5 compatibility closeout self-test passed (frozen ceiling/binding/state tamper paths exercised).");
};

const validateCloseoutValue = (value: unknown, acceptedProofSha256: string, verifyCurrentDirtyState: boolean) => {
  validateAgainstSchemaFile(value, CLOSEOUT_SCHEMA_PATH, "Compatibility closeout schema");
  const closeout = strictObject(value, [
    "acceptedDirty", "acceptedProofSha256", "baseCommit", "closeoutVersion", "controlPlanePaths", "finalizedAt",
    "git", "headCommit", "implementation", "lifecycle", "phase", "proofManifest", "specId", "status",
  ], "Compatibility closeout");
  assert.equal(closeout.closeoutVersion, 2); assert.equal(closeout.specId, "SPEC-0001"); assert.equal(closeout.phase, "1.5-compatibility");
  assert.equal(closeout.baseCommit, BASE_COMMIT); assert.equal(closeout.headCommit, BASE_COMMIT); assert.equal(closeout.acceptedProofSha256, acceptedProofSha256);
  assert.ok(typeof closeout.finalizedAt === "string" && !Number.isNaN(Date.parse(closeout.finalizedAt)));
  assert.deepEqual(closeout.controlPlanePaths, CONTROL_PLANE_PATHS);
  const proofBinding = validateFileBindingShape(closeout.proofManifest, "Closeout proof binding"); assert.equal(proofBinding.path, PROOF_PATH); assert.equal(proofBinding.sha256, acceptedProofSha256);
  const implementation = strictObject(closeout.implementation, ["aggregateSha256", "files", "paths"], "Closeout implementation"); validateFrozenPathSet(implementation.paths, "Closeout implementation paths"); assert.ok(Array.isArray(implementation.files) && implementation.files.length === 23);
  const files = implementation.files.map((entry, index) => validateFileBindingShape(entry, `Closeout implementation ${index}`)); assert.deepEqual(files.map((entry) => entry.path), CORRECTION_PATHS); assert.equal(implementation.aggregateSha256, sha256Bytes(stableJson(files)));
  const accepted = validateCloseoutAcceptedDirty(closeout.acceptedDirty);
  const gitRecord = strictObject(closeout.git, ["afterWrite", "beforeValidation", "beforeWrite"], "Closeout Git snapshots");
  const beforeValidation = validateTrackedSnapshot(gitRecord.beforeValidation, FINAL_DIRTY_PATHS, "Before-validation snapshot");
  const beforeWrite = validateTrackedSnapshot(gitRecord.beforeWrite, FINAL_DIRTY_PATHS, "Before-write snapshot");
  const afterWrite = validateTrackedSnapshot(gitRecord.afterWrite, FINAL_DIRTY_PATHS, "After-write snapshot");
  assertSnapshotStable(beforeValidation, beforeWrite, "Pre-write snapshot comparison"); assertSnapshotStable(beforeWrite, afterWrite, "Post-write snapshot comparison");
  assert.equal(beforeValidation.headCommit, BASE_COMMIT); assert.equal(beforeValidation.mainCommit, BASE_COMMIT); assert.equal(beforeValidation.originMainCommit, BASE_COMMIT);
  assert.deepEqual(closeout.lifecycle, {dirtyCloseoutValidated: true, postCloseoutRevalidation: "required", cleanPublicationValidation: "required"});
  assert.equal(closeout.status, "validated-control-plane-dirty");
  if (verifyCurrentDirtyState) assertSnapshotStable(afterWrite, trackedState(), "Current/post-closeout snapshot comparison");
  return {closeout, accepted, files};
};

const validateCleanPublication = async (closeoutValue: unknown, acceptedProofSha256: string) => {
  const first = trackedState();
  assert.equal(first.indexEmpty, true); assert.deepEqual(first.records, [], "Clean publication validation requires no dirty or untracked paths.");
  assert.notEqual(first.headCommit, BASE_COMMIT, "Clean publication HEAD must advance beyond the correction base.");
  const ancestor = spawnSync("/usr/bin/git", ["merge-base", "--is-ancestor", BASE_COMMIT, first.headCommit], {cwd: ROOT, env: proofEnvironment(), shell: false});
  assert.equal(ancestor.status, 0, "Correction base must be an ancestor of clean publication HEAD.");
  const projection = git("diff", "--name-only", `${BASE_COMMIT}..${first.headCommit}`).trim().split("\n").filter(Boolean).sort();
  assert.deepEqual(projection, FINAL_DIRTY_PATHS, "Clean publication commit projection must be the exact implementation plus control-plane paths.");
  const {accepted, files} = validateCloseoutValue(closeoutValue, acceptedProofSha256, false);
  files.forEach((binding) => assert.deepEqual(bindFile(binding.path), binding, `Clean publication implementation changed: ${binding.path}`));
  for (const key of ["catalog", "plan", "registry", "adapter"] as const) assert.deepEqual(bindFile((accepted[key] as FileBinding).path), accepted[key], `Clean publication ${key} binding drifted.`);
  const result = JSON.parse(readFileSync(repositoryPath(RESULT_PATH), "utf8")) as JsonObject;
  const contract = await import("./browserTesterExtensionContract.ts");
  contract.validateExtensionResult(result, ROOT, true);
  assert.equal(result.derivedGitState, "clean-committed"); assert.equal(result.baseCommit, BASE_COMMIT); assert.equal(result.headCommit, first.headCommit);
  assert.deepEqual(result.observedDirtyPaths, []); assert.deepEqual(result.dirtyExpectedPaths, CORRECTION_PATHS); assert.deepEqual(result.cleanExpectedPaths, []); assert.deepEqual(result.selectedExpectedPaths, []);
  const bindings = strictObject(result.bindings, ["adapter", "catalog", "plan", "registry"], "Clean runner bindings");
  for (const key of ["catalog", "plan", "registry", "adapter"] as const) assert.deepEqual(bindings[key], accepted[key], `Clean runner ${key} differs from accepted dirty proof.`);
  const second = trackedState(); assertSnapshotStable(first, second, "Clean publication validation snapshot comparison");
  console.log(`Validated clean-committed SPEC-0001 Phase 1.5 compatibility publication against ${CLOSEOUT_PATH}.`);
};

const finalize = async () => {
  const args = parseArgs();
  if (existsSync(repositoryPath(CLOSEOUT_PATH))) {
    const closeoutValue = JSON.parse(readFileSync(repositoryPath(CLOSEOUT_PATH), "utf8"));
    const current = trackedState();
    if (current.records.length === 0) return validateCleanPublication(closeoutValue, args.acceptedProofSha256);
    await validateCompatibilityProof(PROOF_PATH, {verifyLiveState: false, allowCloseout: true});
    validateCloseoutValue(closeoutValue, args.acceptedProofSha256, true);
    console.log(`Revalidated post-closeout SPEC-0001 Phase 1.5 compatibility state: ${CLOSEOUT_PATH}`);
    return;
  }

  const beforeValidation = trackedState(); validateTrackedSnapshot(beforeValidation, FINAL_DIRTY_PATHS, "Initial closeout snapshot");
  assert.equal(beforeValidation.headCommit, BASE_COMMIT); assert.equal(beforeValidation.mainCommit, BASE_COMMIT); assert.equal(beforeValidation.originMainCommit, BASE_COMMIT);
  const proof = await validateCompatibilityProof(PROOF_PATH, {verifyLiveState: false, allowCloseout: false});
  const proofBinding = bindFile(PROOF_PATH); assert.equal(proofBinding.sha256, args.acceptedProofSha256, "Accepted proof SHA mismatch.");
  const tester = validateAcceptedSummary(proof.testerExtension);
  const artifactMap = new Map((proof.artifacts as FileBinding[]).map((binding) => [binding.path, binding]));
  const implementationFiles = CORRECTION_PATHS.map((path) => { const accepted = artifactMap.get(path); assert.ok(accepted, `Accepted manifest is missing implementation path ${path}.`); assert.deepEqual(bindFile(path), accepted, `Accepted implementation path changed: ${path}`); return accepted; });
  const beforeWrite = trackedState(); assertSnapshotStable(beforeValidation, beforeWrite, "Validation/write snapshot comparison");
  const closeout = {
    closeoutVersion: 2, specId: "SPEC-0001", phase: "1.5-compatibility", baseCommit: BASE_COMMIT, headCommit: beforeWrite.headCommit,
    finalizedAt: new Date().toISOString(), acceptedProofSha256: args.acceptedProofSha256, proofManifest: proofBinding,
    implementation: {paths: [...CORRECTION_PATHS], files: implementationFiles, aggregateSha256: sha256Bytes(stableJson(implementationFiles))},
    acceptedDirty: closeoutAcceptedDirty(tester),
    controlPlanePaths: [...CONTROL_PLANE_PATHS],
    git: {beforeValidation, beforeWrite, afterWrite: beforeWrite},
    lifecycle: {dirtyCloseoutValidated: true, postCloseoutRevalidation: "required", cleanPublicationValidation: "required"},
    status: "validated-control-plane-dirty",
  };
  validateAgainstSchemaFile(closeout, CLOSEOUT_SCHEMA_PATH, "Pre-write compatibility closeout schema");
  const finalPrewrite = trackedState(); assertSnapshotStable(beforeWrite, finalPrewrite, "Immediate pre-write snapshot comparison");
  writeFileSync(repositoryPath(CLOSEOUT_PATH), `${JSON.stringify(closeout, null, 2)}\n`, {encoding: "utf8", mode: 0o600, flag: "wx"});
  assert.deepEqual(bindFile(CLOSEOUT_PATH), bindFile(CLOSEOUT_PATH), "Written closeout binding is unstable.");
  const afterWrite = trackedState(); assertSnapshotStable(finalPrewrite, afterWrite, "Immediate post-write snapshot comparison");
  const written = JSON.parse(readFileSync(repositoryPath(CLOSEOUT_PATH), "utf8")); validateCloseoutValue(written, args.acceptedProofSha256, true);
  await validateCompatibilityProof(PROOF_PATH, {verifyLiveState: false, allowCloseout: true});
  console.log(`Finalized SPEC-0001 Phase 1.5 compatibility closeout: ${CLOSEOUT_PATH}`);
};

const main = async () => {
  if (process.argv.length === 3 && process.argv[2] === "--self-test") return runSelfTest();
  await finalize();
};

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) void main().catch((error) => { console.error(error); process.exitCode = 1; });
