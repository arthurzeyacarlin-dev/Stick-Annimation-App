import assert from "node:assert/strict";
import {spawnSync} from "node:child_process";
import {createHash} from "node:crypto";
import {existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, readlinkSync, realpathSync, rmSync, unlinkSync, writeFileSync} from "node:fs";
import {dirname, relative, resolve, sep} from "node:path";
import {pathToFileURL} from "node:url";
import {
  PHASE2_CLOSEOUT_PATHS,
  PHASE2_CLOSEOUT_RECORD_PATHS,
  PHASE2_PATHS,
  PHASE3_DIRTY_PATHS,
  PHASE3_CLOSEOUT_PATHS,
  PHASE3_CLOSEOUT_RECORD_PATHS,
  PHASE3_PATHS,
  PHASE4_DIRTY_PATHS,
  PHASE4_CLOSEOUT_PATHS,
  PHASE4_CLOSEOUT_RECORD_PATHS,
  PHASE4_PATHS,
  PHASE5_DIRTY_PATHS,
  PHASE5_CLOSEOUT_PATHS,
  PHASE5_CLOSEOUT_RECORD_PATHS,
  PHASE5_PATHS,
  PHASE6_CLOSEOUT_RECORD_PATHS,
  PHASE6_PLAN_PATH,
  PHASE6_PATHS,
  deriveGitState,
  derivePhase2CloseoutGraphGitState,
  derivePhase3CloseoutGraphGitState,
  derivePhase4CloseoutGraphGitState,
  derivePhase5CloseoutGraphGitState,
  derivePhase6CloseoutGraphGitState,
  loadPhase5RouteGraph,
  loadPhase6Graph,
  loadTesterExtensionGraph,
  phase6CloseoutPathsForTechnicalSubset,
  sortProofPaths,
  validateExtensionResult,
  validatePhase5RouteResult,
  validatePhase6Result,
} from "./spec0001-browser/browserTesterExtensionContract.ts";
import {BROWSER_EXECUTABLE} from "./spec0001-browser/browserTesterContract.ts";

export {
  PHASE2_CLOSEOUT_PATHS,
  PHASE2_CLOSEOUT_RECORD_PATHS,
  PHASE3_CLOSEOUT_PATHS,
  PHASE3_CLOSEOUT_RECORD_PATHS,
  PHASE3_DIRTY_PATHS,
  PHASE3_PATHS,
  PHASE4_CLOSEOUT_PATHS,
  PHASE4_CLOSEOUT_RECORD_PATHS,
  PHASE4_DIRTY_PATHS,
  PHASE4_PATHS,
  PHASE5_CLOSEOUT_PATHS,
  PHASE5_CLOSEOUT_RECORD_PATHS,
  PHASE5_DIRTY_PATHS,
  PHASE5_PATHS,
  PHASE6_CLOSEOUT_RECORD_PATHS,
  PHASE6_PLAN_PATH,
  PHASE6_PATHS,
  phase6CloseoutPathsForTechnicalSubset,
  sortProofPaths,
};

type JsonObject = Record<string, unknown>;
type FileBinding = {path: string; sha256: string; byteLength: number};
type ProofValidationMode = "technical" | "closeout" | "historical-recorded";

const ROOT = process.cwd();
const HASH_PATTERN = /^sha256:[0-9a-f]{64}$/;
const GIT_SHA_PATTERN = /^[0-9a-f]{40}$/;
const DECISION_PATTERN = /^[0-9a-f]{64}$/;
const PROOF_RELEVANT_GIT_ENV = /^GIT_(?:DIR|WORK_TREE|COMMON_DIR|INDEX_FILE|OBJECT_DIRECTORY|ALTERNATE_OBJECT_DIRECTORIES|CONFIG(?:$|_)|CEILING_DIRECTORIES|DISCOVERY_ACROSS_FILESYSTEM|NAMESPACE|GRAFT_FILE|NO_REPLACE_OBJECTS|REPLACE_REF_BASE|SHALLOW_FILE|QUARANTINE_PATH|PREFIX|SUPER_PREFIX)$/;
const SYSTEM_GIT = "/usr/bin/git";
const FIXED_PROOF_PATH = "/usr/bin:/bin:/opt/homebrew/bin";
const PROOF_ENVIRONMENT_KEYS = ["HOME", "USER", "LOGNAME", "SHELL", "TERM", "TMPDIR", "TEMP", "TMP", "LANG", "LC_ALL"] as const;

const sha256Bytes = (bytes: Uint8Array | string) => `sha256:${createHash("sha256").update(bytes).digest("hex")}`;

export const assertNoProofRelevantGitEnvironment = (environment: NodeJS.ProcessEnv) => {
  const redirected = Object.keys(environment).filter((key) => PROOF_RELEVANT_GIT_ENV.test(key)).sort();
  assert.deepEqual(redirected, [], `Proof-relevant Git environment variables are forbidden: ${redirected.join(", ")}`);
};

const stableJson = (value: unknown): string => {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  return `{${Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right)).map(([key, entry]) => `${JSON.stringify(key)}:${stableJson(entry)}`).join(",")}}`;
};

const v2Environment = (overrides: Record<string, string> = {}, gitMode = false) => {
  const environment = {} as unknown as NodeJS.ProcessEnv;
  for (const key of PROOF_ENVIRONMENT_KEYS) if (typeof process.env[key] === "string") environment[key] = process.env[key];
  environment.PATH = FIXED_PROOF_PATH;
  Object.assign(environment, overrides);
  if (gitMode) {
    environment.GIT_CONFIG_NOSYSTEM = "1";
    environment.GIT_CONFIG_GLOBAL = "/dev/null";
    environment.GIT_OPTIONAL_LOCKS = "0";
  }
  return Object.fromEntries(Object.entries(environment).sort(([left], [right]) => left.localeCompare(right))) as NodeJS.ProcessEnv;
};

const gitBytes = (...argv: string[]) => {
  const result = spawnSync(SYSTEM_GIT, argv, {cwd: ROOT, encoding: "buffer", env: v2Environment({}, true), shell: false, maxBuffer: 256 * 1024 * 1024});
  if (result.status !== 0) throw new Error(Buffer.from(result.stderr ?? "").toString("utf8") || `git ${argv.join(" ")} failed`);
  return Buffer.from(result.stdout ?? "");
};

const gitV2 = (...argv: string[]) => gitBytes(...argv).toString("utf8");

const hiddenIndexPathsFromEntries = (entries: readonly string[]) => entries
  .filter((entry) => entry.length > 2 && (entry[0] === "S" || entry[0] === entry[0].toLowerCase()))
  .map((entry) => entry.slice(2))
  .sort((left, right) => left.localeCompare(right));

export const assertNoHiddenIndexFlags = () => {
  const entries = gitBytes("ls-files", "-v", "-z").toString("utf8").split("\0").filter(Boolean);
  assert.deepEqual(hiddenIndexPathsFromEntries(entries), [], "Hidden Git index flags are forbidden.");
};

const assertNoStagedPaths = (paths: readonly string[]) => assert.deepEqual(paths, [], "Git index contains staged changes.");

export const assertEmptyProofIndex = () => {
  const paths = gitBytes("diff", "--cached", "--name-only", "-z").toString("utf8").split("\0").filter(Boolean);
  assertNoStagedPaths(paths);
};

export const assertPhaseCloseoutPaths = (phase: number, paths: readonly string[], phase6TechnicalPaths?: readonly string[]) => {
  if (phase === 2) assert.deepEqual(paths, PHASE2_CLOSEOUT_PATHS, "Phase 2 final diff must equal the exact technical/control-plane closeout ceiling.");
  if (phase === 3) assert.deepEqual(paths, PHASE3_CLOSEOUT_PATHS, "Phase 3 final diff must equal the exact technical/control-plane closeout ceiling.");
  if (phase === 4) assert.deepEqual(paths, PHASE4_CLOSEOUT_PATHS, "Phase 4 final diff must equal the exact technical/control-plane closeout ceiling.");
  if (phase === 5) assert.deepEqual(paths, PHASE5_CLOSEOUT_PATHS, "Phase 5 final diff must equal the exact recorded technical/control-plane closeout projection.");
  if (phase === 6) {
    assert.ok(phase6TechnicalPaths !== undefined, "Phase 6 closeout requires the manifest-bound observed technical subset.");
    assert.deepEqual(paths, phase6CloseoutPathsForTechnicalSubset(phase6TechnicalPaths), "Phase 6 final diff must equal the exact manifest-bound technical subset plus closeout records.");
  }
};

const strictObject = (value: unknown, keys: readonly string[], label: string): JsonObject => {
  assert.ok(value !== null && typeof value === "object" && !Array.isArray(value), `${label} must be an object.`);
  const object = value as JsonObject;
  assert.deepEqual(Object.keys(object).sort(), [...keys].sort(), `${label} fields must be exact.`);
  return object;
};

const phase6ManifestPathField = (value: unknown, label: string) => {
  assert.ok(Array.isArray(value) && value.every((entry) => typeof entry === "string"), `${label} must be a string array.`);
  const paths = value as string[];
  assert.deepEqual(paths, sortProofPaths([...new Set(paths)]), `${label} must be canonical and unique.`);
  for (const path of paths) assert.ok(PHASE6_PATHS.includes(path), `${label} is outside the Phase 6 technical ceiling: ${path}.`);
  return paths;
};

export const phase6TechnicalPathsFromProofManifest = (manifest: JsonObject) => {
  assert.equal(manifest.phase, 6, "Phase 6 technical projection requires a Phase 6 proof manifest.");
  assert.ok(manifest.evidence !== null && typeof manifest.evidence === "object" && !Array.isArray(manifest.evidence), "Phase 6 proof evidence must be an object.");
  const evidence = manifest.evidence as JsonObject;
  assert.equal(evidence.derivedGitState, "dirty-executor", "Phase 6 closeout requires dirty-executor proof evidence.");
  const observed = phase6ManifestPathField(evidence.observedDirtyPaths, "Phase 6 manifest observed technical paths");
  const expected = phase6ManifestPathField(evidence.dirtyExpectedPaths, "Phase 6 manifest expected technical paths");
  const selected = phase6ManifestPathField(evidence.selectedExpectedPaths, "Phase 6 manifest selected technical paths");
  assert.deepEqual(evidence.cleanExpectedPaths, [], "Phase 6 manifest clean technical paths must be empty.");
  assert.deepEqual(observed, expected, "Phase 6 manifest observed/expected technical paths differ.");
  assert.deepEqual(observed, selected, "Phase 6 manifest observed/selected technical paths differ.");
  return [...observed];
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

const validateRecordedBinding = (value: unknown, label: string): FileBinding => {
  const binding = strictObject(value, ["path", "sha256", "byteLength"], label);
  const {path} = safeV2RepositoryPath(binding.path, label, false);
  assert.match(binding.sha256 as string, HASH_PATTERN, `${label} SHA is invalid.`);
  assert.ok(Number.isSafeInteger(binding.byteLength) && (binding.byteLength as number) >= 0, `${label} byte length is invalid.`);
  return {path, sha256: binding.sha256 as string, byteLength: binding.byteLength as number};
};

const safeV2RepositoryPath = (path: unknown, label: string, requireLeaf = true) => {
  assert.equal(typeof path, "string", `${label} path must be a string.`);
  assert.ok((path as string).length > 0 && !(path as string).includes("\0") && !(path as string).includes("\\") && !(path as string).startsWith("/"), `${label} path is malformed.`);
  const absolute = resolve(ROOT, path as string);
  const local = relative(ROOT, absolute);
  assert.equal(local, path, `${label} path is non-canonical or escapes the repository.`);
  const rootReal = realpathSync(ROOT);
  let current = ROOT;
  const parts = local.split(sep).filter(Boolean);
  for (const [index, part] of parts.entries()) {
    current = resolve(current, part);
    if (!existsSync(current)) {
      assert.equal(requireLeaf, false, `${label} path is missing.`);
      break;
    }
    const stats = lstatSync(current);
    assert.equal(stats.isSymbolicLink(), false, `${label} symlink component rejected: ${relative(ROOT, current)}`);
    if (index < parts.length - 1) assert.equal(stats.isDirectory(), true, `${label} parent is not a directory.`);
    assert.equal(realpathSync(current), resolve(rootReal, relative(ROOT, current)), `${label} real path escaped the repository.`);
  }
  return {path: path as string, absolute};
};

const validateV2Binding = (value: unknown, label: string): FileBinding => {
  const binding = strictObject(value, ["path", "sha256", "byteLength"], label);
  const {path, absolute} = safeV2RepositoryPath(binding.path, label);
  assert.equal(lstatSync(absolute).isFile(), true, `${label} is not a regular file.`);
  assert.match(binding.sha256 as string, HASH_PATTERN, `${label} SHA is invalid.`);
  assert.ok(Number.isSafeInteger(binding.byteLength) && (binding.byteLength as number) >= 0, `${label} byte length is invalid.`);
  const bytes = readFileSync(absolute);
  assert.equal(bytes.byteLength, binding.byteLength, `${label} byte length mismatch.`);
  assert.equal(sha256Bytes(bytes), binding.sha256, `${label} SHA mismatch.`);
  return {path, sha256: binding.sha256 as string, byteLength: binding.byteLength as number};
};

const currentBrowserExecutableBinding = () => {
  const stats = lstatSync(BROWSER_EXECUTABLE);
  assert.equal(stats.isSymbolicLink(), false, "Version 2 browser executable must not be a symlink.");
  assert.equal(stats.isFile(), true, "Version 2 browser executable must be a regular file.");
  assert.ok(stats.size > 0, "Version 2 browser executable must not be empty.");
  assert.equal(realpathSync(BROWSER_EXECUTABLE), BROWSER_EXECUTABLE, "Version 2 browser executable real path drifted.");
  const bytes = readFileSync(BROWSER_EXECUTABLE);
  return {path: BROWSER_EXECUTABLE, sha256: sha256Bytes(bytes), byteLength: bytes.byteLength};
};

const validateV2BrowserExecutableBinding = (value: unknown, label: string) => {
  const binding = strictObject(value, ["path", "sha256", "byteLength"], label);
  assert.equal(binding.path, BROWSER_EXECUTABLE, `${label} path mismatch.`);
  assert.match(binding.sha256 as string, HASH_PATTERN, `${label} SHA is invalid.`);
  assert.ok(Number.isSafeInteger(binding.byteLength) && (binding.byteLength as number) > 0, `${label} byte length is invalid.`);
  const normalized = {path: BROWSER_EXECUTABLE, sha256: binding.sha256 as string, byteLength: binding.byteLength as number};
  assert.deepEqual(normalized, currentBrowserExecutableBinding(), `${label} bytes drifted.`);
  return normalized;
};

type ClosedExecutionReceipt = {
  policy: "closed-executable-v1";
  executable: {logicalId: "node:process.execPath" | "system:/usr/bin/git"; sha256: string; byteLength: number};
  argv: string[];
  environment: {policy: "proof-scrubbed-v2" | "proof-scrubbed-git-v2"; keys: string[]; sha256: string};
};

const executableBindings = new Map<string, ClosedExecutionReceipt["executable"]>();
const executableBinding = (path: string, logicalId: ClosedExecutionReceipt["executable"]["logicalId"]) => {
  const cached = executableBindings.get(path);
  if (cached) return cached;
  const bytes = readFileSync(path);
  const binding = {logicalId, sha256: sha256Bytes(bytes), byteLength: bytes.byteLength};
  executableBindings.set(path, binding);
  return binding;
};

const expectedV2Execution = (command: JsonObject, boundPaths: readonly string[]): ClosedExecutionReceipt => {
  const declared = command.argv as string[];
  const overrides = command.env as Record<string, string>;
  let executablePath: string;
  let logicalId: ClosedExecutionReceipt["executable"]["logicalId"];
  let normalizedArgv: string[];
  let gitMode = false;
  if (declared[0] === "node") {
    assert.equal(declared[1], "--experimental-strip-types", `Version 2 command ${String(command.name)} must use the exact Node strip-types prefix.`);
    assert.ok(declared.length >= 3 && !declared[2].startsWith("-"), `Version 2 command ${String(command.name)} must name a repository script.`);
    const scriptIndex = 2;
    const scriptPath = declared[scriptIndex];
    assert.ok(boundPaths.includes(scriptPath) && /^scripts\/.+\.(?:cjs|js|mjs|ts)$/.test(scriptPath), `Version 2 command ${String(command.name)} script is not an exact proof binding.`);
    const local = relative(ROOT, resolve(ROOT, scriptPath));
    assert.equal(local, scriptPath, `Version 2 command ${String(command.name)} script path is unsafe.`);
    executablePath = process.execPath;
    logicalId = "node:process.execPath";
    normalizedArgv = declared.slice(1);
  } else if (declared[0] === "./node_modules/.bin/tsc") {
    assert.deepEqual(declared.slice(1), ["--noEmit", "--incremental", "false"], "Version 2 TypeScript command must use the exact no-emit invocation.");
    executablePath = process.execPath;
    logicalId = "node:process.execPath";
    normalizedArgv = ["node_modules/typescript/bin/tsc", ...declared.slice(1)];
  } else if (declared[0] === "git") {
    const gitArgv = declared.slice(1);
    assert.ok(JSON.stringify(gitArgv) === JSON.stringify(["diff", "--check"]) || JSON.stringify(gitArgv) === JSON.stringify(["status", "--short", "--branch"]), `Version 2 command ${String(command.name)} uses an unauthorized Git operation.`);
    executablePath = SYSTEM_GIT;
    logicalId = "system:/usr/bin/git";
    normalizedArgv = gitArgv;
    gitMode = true;
  } else assert.fail(`Version 2 command ${String(command.name)} executable is outside the closed resolver.`);
  const environment = v2Environment(overrides, gitMode);
  const environmentRecord = Object.fromEntries(Object.entries(environment).sort(([left], [right]) => left.localeCompare(right)));
  return {
    policy: "closed-executable-v1",
    executable: executableBinding(executablePath, logicalId),
    argv: normalizedArgv,
    environment: {
      policy: gitMode ? "proof-scrubbed-git-v2" : "proof-scrubbed-v2",
      keys: Object.keys(environmentRecord),
      sha256: sha256Bytes(stableJson(environmentRecord)),
    },
  };
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

const phaseTwoExpectedCommandArgv = (base: string) => [
  ["node", "--experimental-strip-types", "scripts/validateStickPoseTimeline.ts"],
  ["node", "--experimental-strip-types", "scripts/validateStickFigureAiContracts.ts"],
  ["./node_modules/.bin/tsc", "--noEmit", "--incremental", "false"],
  ["node", "--experimental-strip-types", "scripts/spec0001-proof/measureSpec0001LintRegression.ts", `--base=${base}`],
  ["git", "diff", "--check"],
  ["node", "--experimental-strip-types", "scripts/runSpec0001BrowserProof.ts", "--plan=scripts/fixtures/stick-ai/v1/phase-2-browser-proof-plan.json"],
];

const phaseThreeExpectedCommandArgv = (base: string) => [
  ["node", "--experimental-strip-types", "scripts/validateStickHistoryPersistence.ts"],
  ["node", "--experimental-strip-types", "scripts/validateStickPoseTimeline.ts"],
  ["node", "--experimental-strip-types", "scripts/validateStickFigureAiContracts.ts"],
  ["node", "--experimental-strip-types", "scripts/validateDrawingProjectAiMemory.ts"],
  ["node", "--experimental-strip-types", "scripts/validateDrawingProjectAiMemoryRouteSafety.ts"],
  ["./node_modules/.bin/tsc", "--noEmit", "--incremental", "false"],
  ["node", "--experimental-strip-types", "scripts/spec0001-proof/measureSpec0001LintRegression.ts", `--base=${base}`],
  ["git", "diff", "--check"],
  ["node", "--experimental-strip-types", "scripts/runSpec0001BrowserProof.ts", "--self-test=phase-3-registration"],
  ["node", "--experimental-strip-types", "scripts/runSpec0001BrowserProof.ts"],
  ["node", "--experimental-strip-types", "scripts/runSpec0001BrowserProof.ts", "--plan=scripts/fixtures/stick-ai/v1/phase-3-browser-proof-plan.json"],
];

const phaseFourExpectedCommandArgv = (base: string) => [
  ["node", "--experimental-strip-types", "scripts/validateStickFigureCommandTransaction.ts"],
  ["node", "--experimental-strip-types", "scripts/validateStickHistoryPersistence.ts"],
  ["node", "--experimental-strip-types", "scripts/validateStickPoseTimeline.ts"],
  ["node", "--experimental-strip-types", "scripts/validateStickFigureAiContracts.ts"],
  ["node", "--experimental-strip-types", "scripts/validateDrawingAiControlPreferences.ts"],
  ["node", "--experimental-strip-types", "scripts/validateDrawingProjectAiMemory.ts"],
  ["node", "--experimental-strip-types", "scripts/validateDrawingProjectAiMemoryRouteSafety.ts"],
  ["node", "--experimental-strip-types", "scripts/validateTimelinePlaybackSmoothing.ts"],
  ["./node_modules/.bin/tsc", "--noEmit", "--incremental", "false"],
  ["node", "--experimental-strip-types", "scripts/spec0001-proof/measureSpec0001LintRegression.ts", `--base=${base}`],
  ["git", "diff", "--check"],
  ["node", "--experimental-strip-types", "scripts/runSpec0001BrowserProof.ts", "--plan=scripts/fixtures/stick-ai/v1/phase-4-browser-proof-plan.json"],
];

const PHASE5_SOURCE_DIRECT_ENVIRONMENT = {
  DIAMOND_STICK_AI_V1_MODE: "mock",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "",
  NEXT_PUBLIC_SUPABASE_URL: "",
  NEXT_TELEMETRY_DISABLED: "1",
  OPENAI_API_KEY: "",
  SUPABASE_SERVICE_ROLE_KEY: "",
} as const;

const phaseFiveExpectedCommandArgv = (base: string) => [
  ["node", "--experimental-strip-types", "scripts/validateStickFigureAiMockRoute.ts"],
  ["node", "--experimental-strip-types", "scripts/validateStickFigureCommandTransaction.ts"],
  ["node", "--experimental-strip-types", "scripts/validateStickHistoryPersistence.ts"],
  ["node", "--experimental-strip-types", "scripts/validateStickPoseTimeline.ts"],
  ["node", "--experimental-strip-types", "scripts/validateStickFigureAiContracts.ts"],
  ["node", "--experimental-strip-types", "scripts/validateDrawingAiControlPreferences.ts"],
  ["node", "--experimental-strip-types", "scripts/validateTimelinePlaybackSmoothing.ts"],
  ["./node_modules/.bin/tsc", "--noEmit", "--incremental", "false"],
  ["node", "--experimental-strip-types", "scripts/spec0001-proof/measureSpec0001LintRegression.ts", `--base=${base}`],
  ["git", "diff", "--check"],
  ["node", "--experimental-strip-types", "scripts/runSpec0001BrowserProof.ts", "--self-test=phase-5-registration"],
  ["node", "--experimental-strip-types", "scripts/runSpec0001BrowserProof.ts", "--plan=scripts/fixtures/stick-ai/v1/phase-5-browser-proof-plan.json"],
];

const phaseSixExpectedCommandArgv = (base: string) => [
  ["node", "--experimental-strip-types", "scripts/validateStickFigureAiUiAdapter.ts"],
  ["node", "--experimental-strip-types", "scripts/validateStickFigureAiMockRoute.ts"],
  ["node", "--experimental-strip-types", "scripts/validateStickFigureCommandTransaction.ts"],
  ["node", "--experimental-strip-types", "scripts/validateStickHistoryPersistence.ts"],
  ["node", "--experimental-strip-types", "scripts/validateStickPoseTimeline.ts"],
  ["node", "--experimental-strip-types", "scripts/validateStickFigureAiContracts.ts"],
  ["node", "--experimental-strip-types", "scripts/validateDrawingAiControlPreferences.ts"],
  ["node", "--experimental-strip-types", "scripts/validateDrawingProjectAiMemory.ts"],
  ["node", "--experimental-strip-types", "scripts/validateDrawingProjectAiMemoryRouteSafety.ts"],
  ["node", "--experimental-strip-types", "scripts/validateTimelinePlaybackSmoothing.ts"],
  ["./node_modules/.bin/tsc", "--noEmit", "--incremental", "false"],
  ["node", "--experimental-strip-types", "scripts/spec0001-proof/measureSpec0001LintRegression.ts", `--base=${base}`],
  ["git", "diff", "--check"],
  ["node", "--experimental-strip-types", "scripts/runSpec0001BrowserProof.ts", "--self-test=phase-6-registration"],
  ["node", "--experimental-strip-types", "scripts/runSpec0001BrowserProof.ts", "--plan=scripts/fixtures/stick-ai/v2/phase-6-browser-proof-plan.json"],
];

const validateV1CommandConfig = (value: unknown, phase: number, base: string) => {
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

const validateMeasuredLintRun = (value: unknown, label: string) => {
  const measured = strictObject(value, ["exitCode", "errors", "warnings", "rawOutput"], label);
  assert.ok(measured.exitCode === 0 || measured.exitCode === 1, `${label} exit must be 0 or 1.`);
  const errors = requireCount(measured.errors, `${label} errors`);
  const warnings = requireCount(measured.warnings, `${label} warnings`);
  const raw = strictObject(measured.rawOutput, ["stdoutSha256", "stdoutByteLength", "stderrSha256", "stderrByteLength"], `${label} raw output`);
  requireDigest(raw.stdoutSha256, `${label} stdout SHA`);
  requireCount(raw.stdoutByteLength, `${label} stdout length`);
  requireDigest(raw.stderrSha256, `${label} stderr SHA`);
  requireCount(raw.stderrByteLength, `${label} stderr length`);
  return {exitCode: measured.exitCode as 0 | 1, errors, warnings, rawOutput: raw};
};

const validateLintFinding = (value: unknown, label: string) => {
  const finding = strictObject(value, ["path", "line", "endLine", "column", "endColumn", "severity", "ruleId", "messageSha256"], label);
  const {path} = safeRepositoryPath(finding.path, label);
  assert.ok(/\.(?:cjs|cts|js|jsx|mjs|mts|ts|tsx)$/.test(path), `${label} path is not a JavaScript/TypeScript path.`);
  assert.ok(Number.isSafeInteger(finding.line) && (finding.line as number) > 0, `${label} line is invalid.`);
  assert.ok(Number.isSafeInteger(finding.endLine) && (finding.endLine as number) >= (finding.line as number), `${label} end line is invalid.`);
  assert.ok(Number.isSafeInteger(finding.column) && (finding.column as number) > 0, `${label} column is invalid.`);
  assert.ok(finding.endColumn === null || (Number.isSafeInteger(finding.endColumn) && (finding.endColumn as number) > 0), `${label} end column is invalid.`);
  assert.ok(finding.severity === 1 || finding.severity === 2, `${label} severity is invalid.`);
  assert.ok(finding.ruleId === null || (typeof finding.ruleId === "string" && finding.ruleId.length > 0), `${label} rule ID is invalid.`);
  requireDigest(finding.messageSha256, `${label} message SHA`);
  return finding;
};

const validateVersionedDependencyBinding = (value: unknown, label: string, verifyInstalledBytes = true) => {
  const binding = strictObject(value, ["path", "sha256", "byteLength", "version"], label);
  const recorded = {path: binding.path, sha256: binding.sha256, byteLength: binding.byteLength};
  const validated = verifyInstalledBytes
    ? validateV2Binding(recorded, `${label} file`)
    : validateRecordedBinding(recorded, `${label} file`);
  assert.ok(binding.version === null || (typeof binding.version === "string" && binding.version.length > 0), `${label} version is invalid.`);
  return {...validated, version: binding.version as string | null};
};

let cachedDependencyTreeBinding: {path: string; sha256: string; entryCount: number; byteLength: number} | null = null;
const currentDependencyTreeBinding = () => {
  if (cachedDependencyTreeBinding !== null) return cachedDependencyTreeBinding;
  const dependencyRoot = resolve(ROOT, "node_modules");
  const digest = createHash("sha256");
  let entryCount = 0;
  let byteLength = 0;
  const walk = (directory: string) => {
    for (const entry of readdirSync(directory, {withFileTypes: true}).sort((left, right) => left.name.localeCompare(right.name))) {
      const absolute = resolve(directory, entry.name);
      const path = relative(dependencyRoot, absolute);
      const stats = lstatSync(absolute);
      if (entry.isDirectory()) {
        digest.update(`D\0${path}\0${stats.mode & 0o777}\0`);
        entryCount += 1;
        walk(absolute);
      } else if (entry.isSymbolicLink()) {
        const target = readlinkSync(absolute);
        digest.update(`L\0${path}\0${stats.mode & 0o777}\0${target}\0`);
        entryCount += 1;
        byteLength += Buffer.byteLength(target);
      } else if (entry.isFile()) {
        const bytes = readFileSync(absolute);
        digest.update(`F\0${path}\0${stats.mode & 0o777}\0${bytes.byteLength}\0`);
        digest.update(bytes);
        digest.update("\0");
        entryCount += 1;
        byteLength += bytes.byteLength;
      } else throw new Error(`Unsupported dependency-tree entry: node_modules/${path}`);
    }
  };
  walk(dependencyRoot);
  cachedDependencyTreeBinding = {path: "node_modules", sha256: `sha256:${digest.digest("hex")}`, entryCount, byteLength};
  return cachedDependencyTreeBinding;
};

const repositoryStateDigestV2 = () => {
  const splitNul = (bytes: Buffer) => bytes.toString("utf8").split("\0").filter(Boolean);
  const index = gitBytes("ls-files", "--stage", "-z");
  const flags = gitBytes("ls-files", "-v", "-z");
  const tracked = splitNul(gitBytes("ls-files", "-z"));
  const trackedSet = new Set(tracked);
  const untracked = splitNul(gitBytes("ls-files", "--others", "--exclude-standard", "-z"));
  const paths = [...new Set([...tracked, ...untracked])].sort();
  const digest = createHash("sha256");
  digest.update("spec0001-git-visible-state-v2\0index\0");
  digest.update(index);
  digest.update("\0flags\0");
  digest.update(flags);
  digest.update("\0worktree\0");
  for (const path of paths) {
    const {absolute} = safeRepositoryPath(path, "version 2 Git-visible state");
    const kind = trackedSet.has(path) ? "tracked" : "untracked";
    let stats;
    try { stats = lstatSync(absolute); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        digest.update(`${kind}\0${path}\0missing\0`);
        continue;
      }
      throw error;
    }
    if (stats.isSymbolicLink()) {
      const target = readlinkSync(absolute);
      digest.update(`${kind}\0${path}\0symlink\0${stats.mode & 0o777}\0${Buffer.byteLength(target)}\0${target}\0`);
    } else if (stats.isFile()) {
      const bytes = readFileSync(absolute);
      digest.update(`${kind}\0${path}\0file\0${stats.mode & 0o777}\0${bytes.byteLength}\0`);
      digest.update(bytes);
      digest.update("\0");
    } else throw new Error(`Version 2 Git-visible state path must be a file or symlink: ${path}`);
  }
  return `sha256:${digest.digest("hex")}`;
};

const validateV2LintMeasurementInternal = (value: unknown, expectedBase: string | undefined, expectedHead: string | undefined, mode: ProofValidationMode) => {
  assertNoProofRelevantGitEnvironment(process.env);
  const measurement = strictObject(value, [
    "measurementVersion", "specId", "baseCommit", "headCommit", "baseTree", "measuredAt", "runtime", "bindings",
    "base", "result", "changedJavaScriptPaths", "newJavaScriptPaths", "changedLineFindings", "newFileFindings",
    "gitState", "network", "cleanup", "passed",
  ], "version 2 lint measurement");
  assert.equal(measurement.measurementVersion, 2, "Version 2 lint measurement version mismatch.");
  assert.equal(measurement.specId, "SPEC-0001", "Version 2 lint measurement spec mismatch.");
  assert.match(measurement.baseCommit as string, GIT_SHA_PATTERN, "Version 2 lint base SHA is invalid.");
  assert.match(measurement.headCommit as string, GIT_SHA_PATTERN, "Version 2 lint HEAD SHA is invalid.");
  assert.match(measurement.baseTree as string, GIT_SHA_PATTERN, "Version 2 lint base tree is invalid.");
  if (expectedBase !== undefined) assert.equal(measurement.baseCommit, expectedBase, "Version 2 lint base binding mismatch.");
  if (expectedHead !== undefined) assert.equal(measurement.headCommit, expectedHead, "Version 2 lint HEAD binding mismatch.");
  if (mode !== "historical-recorded") assert.equal(measurement.headCommit, gitV2("rev-parse", "HEAD").trim(), "Version 2 lint HEAD is not the current repository HEAD.");
  assert.equal(measurement.baseTree, gitV2("rev-parse", `${measurement.baseCommit}^{tree}`).trim(), "Version 2 lint base-tree binding mismatch.");
  assert.ok(typeof measurement.measuredAt === "string" && !Number.isNaN(Date.parse(measurement.measuredAt)), "Version 2 lint timestamp is invalid.");
  const runtime = strictObject(measurement.runtime, ["nodeVersion", "eslintVersion"], "version 2 lint runtime");
  requireString(runtime.nodeVersion, "Version 2 lint Node version");
  requireString(runtime.eslintVersion, "Version 2 lint ESLint version");
  const bindings = strictObject(measurement.bindings, [
    "package", "packageLock", "eslintConfig", "networkGuard", "installedPackageLock", "eslintPackage",
    "eslintConfigNextPackage", "typescriptPackage", "dependencyTree", "measurer",
  ], "version 2 lint bindings");
  for (const key of ["package", "packageLock", "eslintConfig", "networkGuard", "measurer"] as const) {
    const binding = validateV2Binding(bindings[key], `version 2 lint ${key} binding`);
    if (key !== "measurer") {
      const baseBytes = gitBytes("show", `${measurement.baseCommit}:${binding.path}`);
      assert.equal(baseBytes.byteLength, binding.byteLength, `Version 2 lint ${key} base byte length mismatch.`);
      assert.equal(sha256Bytes(baseBytes), binding.sha256, `Version 2 lint ${key} base SHA mismatch.`);
    }
  }
  const verifyInstalledDependencies = mode === "technical";
  const installedPackageLock = validateVersionedDependencyBinding(bindings.installedPackageLock, "version 2 lint installed lock binding", verifyInstalledDependencies);
  const eslintPackage = validateVersionedDependencyBinding(bindings.eslintPackage, "version 2 lint ESLint binding", verifyInstalledDependencies);
  const eslintConfigNextPackage = validateVersionedDependencyBinding(bindings.eslintConfigNextPackage, "version 2 lint ESLint-config-Next binding", verifyInstalledDependencies);
  const typescriptPackage = validateVersionedDependencyBinding(bindings.typescriptPackage, "version 2 lint TypeScript binding", verifyInstalledDependencies);
  assert.equal(installedPackageLock.path, "node_modules/.package-lock.json", "Installed lock binding path mismatch.");
  assert.equal(eslintPackage.path, "node_modules/eslint/package.json", "ESLint binding path mismatch.");
  assert.equal(eslintConfigNextPackage.path, "node_modules/eslint-config-next/package.json", "ESLint-config-Next binding path mismatch.");
  assert.equal(typescriptPackage.path, "node_modules/typescript/package.json", "TypeScript binding path mismatch.");
  const dependencyTree = strictObject(bindings.dependencyTree, ["path", "sha256", "entryCount", "byteLength"], "version 2 lint dependency-tree binding");
  assert.equal(dependencyTree.path, "node_modules", "Version 2 lint dependency-tree path mismatch.");
  requireDigest(dependencyTree.sha256, "Version 2 lint dependency-tree SHA");
  assert.ok(requireCount(dependencyTree.entryCount, "Version 2 lint dependency-tree entry count") > 0, "Version 2 lint dependency tree is empty.");
  assert.ok(requireCount(dependencyTree.byteLength, "Version 2 lint dependency-tree byte length") > 0, "Version 2 lint dependency tree has no bytes.");
  if (verifyInstalledDependencies) assert.deepEqual(dependencyTree, currentDependencyTreeBinding(), "Version 2 lint dependency-tree binding mismatch.");
  assert.equal(installedPackageLock.version, null, "Installed lock binding must not invent a package version.");
  assert.equal(eslintPackage.version, runtime.eslintVersion, "ESLint runtime/package versions differ.");
  const packageLock = readJson("package-lock.json") as JsonObject;
  const lockedPackages = packageLock.packages as JsonObject;
  assert.ok(lockedPackages !== null && typeof lockedPackages === "object" && !Array.isArray(lockedPackages), "Version 2 package lock packages are invalid.");
  for (const dependency of [eslintPackage, eslintConfigNextPackage, typescriptPackage]) {
    const packagePath = dependency.path.replace(/\/package\.json$/, "");
    assert.equal((lockedPackages[packagePath] as JsonObject | undefined)?.version, dependency.version, `Version 2 ${dependency.path} version differs from package-lock.json.`);
  }
  const base = validateMeasuredLintRun(measurement.base, "version 2 lint base");
  const result = validateMeasuredLintRun(measurement.result, "version 2 lint result");
  const validatePaths = (paths: unknown, label: string) => {
    assert.ok(Array.isArray(paths) && paths.every((path) => typeof path === "string" && path.length > 0), `${label} must contain paths.`);
    assert.equal(new Set(paths as string[]).size, (paths as string[]).length, `${label} contains duplicates.`);
    assert.deepEqual(paths, [...(paths as string[])].sort(), `${label} must be sorted.`);
    for (const path of paths as string[]) safeRepositoryPath(path, label);
    return paths as string[];
  };
  const changedPaths = validatePaths(measurement.changedJavaScriptPaths, "Version 2 lint changed paths");
  const newPaths = validatePaths(measurement.newJavaScriptPaths, "Version 2 lint new paths");
  assert.ok(newPaths.every((path) => changedPaths.includes(path)), "Version 2 lint new paths must be a subset of changed paths.");
  assert.ok(Array.isArray(measurement.changedLineFindings), "Version 2 changed-line findings must be an array.");
  assert.ok(Array.isArray(measurement.newFileFindings), "Version 2 new-file findings must be an array.");
  (measurement.changedLineFindings as unknown[]).forEach((finding, index) => validateLintFinding(finding, `version 2 changed-line finding ${index}`));
  (measurement.newFileFindings as unknown[]).forEach((finding, index) => validateLintFinding(finding, `version 2 new-file finding ${index}`));
  const gitState = strictObject(measurement.gitState, ["beforeSha256", "afterSha256", "unchanged"], "version 2 lint Git state");
  requireDigest(gitState.beforeSha256, "Version 2 lint pre-state SHA");
  requireDigest(gitState.afterSha256, "Version 2 lint post-state SHA");
  assert.equal(gitState.unchanged, true, "Version 2 lint changed Git state.");
  assert.equal(gitState.afterSha256, gitState.beforeSha256, "Version 2 lint pre/post Git state differs.");
  if (mode === "technical") assert.equal(gitState.afterSha256, repositoryStateDigestV2(), "Version 2 lint repository state drifted after measurement.");
  const network = strictObject(measurement.network, ["baseRecordCount", "resultRecordCount", "nonLoopbackAttemptCount"], "version 2 lint network");
  assert.equal(network.baseRecordCount, 0, "Base lint performed a network operation.");
  assert.equal(network.resultRecordCount, 0, "Result lint performed a network operation.");
  assert.equal(network.nonLoopbackAttemptCount, 0, "Lint attempted non-loopback access.");
  const cleanup = strictObject(measurement.cleanup, ["temporaryRootRemoved"], "version 2 lint cleanup");
  assert.equal(cleanup.temporaryRootRemoved, true, "Version 2 lint left temporary residue.");
  assert.ok(result.errors <= base.errors, "Version 2 lint error count worsened.");
  assert.ok(result.warnings <= base.warnings, "Version 2 lint warning count worsened.");
  assert.deepEqual(measurement.changedLineFindings, [], "Version 2 lint has changed-line findings.");
  assert.deepEqual(measurement.newFileFindings, [], "Version 2 lint has new-file findings.");
  assert.equal(measurement.passed, true, "Version 2 lint result is not passing.");
  return measurement;
};

export const validateV2LintMeasurement = (value: unknown, expectedBase?: string, expectedHead?: string, verifyCurrentState = true) =>
  validateV2LintMeasurementInternal(value, expectedBase, expectedHead, verifyCurrentState ? "technical" : "historical-recorded");

const validateEvidenceFileBinding = (value: unknown, label: string, artifactPaths: Set<string>) => {
  const binding = validateBinding(value, label);
  assert.ok(artifactPaths.has(binding.path), `${label} is not present in the proof artifact inventory.`);
  return binding;
};

const validateV2EvidenceFileBinding = (value: unknown, label: string, artifactPaths: Set<string>) => {
  const binding = validateV2Binding(value, label);
  assert.ok(artifactPaths.has(binding.path), `${label} is not present in the version 2 proof artifact inventory.`);
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

const validateProofManifestV1 = (manifestPath: string, allowedOutputArtifacts: string[] = []) => {
  const manifest = strictObject(
    readJson(manifestPath),
    ["manifestVersion", "specId", "phase", "baseCommit", "headCommit", "recordedAt", "runtime", "commandConfig", "receipts", "artifacts", "bindings", "evidence", "commandsPassed", "lintBaseline"],
    "proof manifest",
  );
  assert.equal(manifest.manifestVersion, 1, "Manifest version mismatch.");
  assert.equal(manifest.specId, "SPEC-0001", "Manifest spec mismatch.");
  assert.equal(manifest.phase, 1, "Version 1 shared proof is historical Phase 1 only.");
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
  const config = validateV1CommandConfig(readJson(configBinding.path), manifest.phase as number, manifest.baseCommit as string);
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

const validateV2CommandConfig = (value: unknown, phase: number, base: string) => {
  const config = strictObject(value, ["configVersion", "phase", "baseCommit", "bindings", "browserEvidenceInput", "commands"], "version 2 command config");
  assert.equal(config.configVersion, 2, "Version 2 command config version mismatch.");
  assert.equal(config.phase, phase, "Version 2 command config phase mismatch.");
  assert.equal(config.baseCommit, base, "Version 2 command config base mismatch.");
  assert.ok(phase >= 2 && phase <= 7, "Version 2 shared proof is only valid for Phase 2 through Phase 7.");
  const bindingConfig = strictObject(config.bindings, ["sources", "fixtures", "schemas", "harness", "plans"], "version 2 command bindings");
  const bindingPaths = Object.fromEntries(Object.entries(bindingConfig).map(([kind, paths]) => {
    assert.ok(Array.isArray(paths) && paths.every((path) => typeof path === "string" && path.length > 0), `${kind} version 2 bindings must be paths.`);
    assert.equal(new Set(paths as string[]).size, (paths as string[]).length, `${kind} version 2 bindings contain duplicates.`);
    (paths as string[]).forEach((path) => safeRepositoryPath(path, `${kind} version 2 binding`));
    return [kind, paths as string[]];
  })) as Record<"sources" | "fixtures" | "schemas" | "harness" | "plans", string[]>;
  const everyBindingPath = Object.values(bindingPaths).flat();
  assert.equal(new Set(everyBindingPath).size, everyBindingPath.length, "Version 2 binding paths must be unique across categories.");
  const acceptedBrowserRoots = phase === 2
    ? ["output/spec-0001/phase-2/", "output/spec-0001/phase-2-ui-restoration-correction/"]
    : [`output/spec-0001/phase-${phase}/`];
  assert.ok(typeof config.browserEvidenceInput === "string" && acceptedBrowserRoots.some((root) => (config.browserEvidenceInput as string).startsWith(root)) &&
    relative(ROOT, resolve(ROOT, config.browserEvidenceInput)) === config.browserEvidenceInput && !config.browserEvidenceInput.includes("\\"), "Version 2 browser evidence path is outside its exact phase root.");
  assert.ok(Array.isArray(config.commands) && config.commands.length > 0, "Version 2 command config must declare commands.");
  const commands = (config.commands as unknown[]).map((entry, index) => {
    const command = strictObject(entry, ["name", "argv", "cwd", "env", "expectedExitCode", "privacy"], `version 2 command ${index}`);
    requireString(command.name, `Version 2 command ${index} name`);
    assert.ok(Array.isArray(command.argv) && command.argv.length > 0 && command.argv.every((argument) => typeof argument === "string" && argument.length > 0), `Version 2 command ${index} argv is invalid.`);
    assert.equal(command.cwd, ".", `Version 2 command ${index} cwd mismatch.`);
    assert.ok(command.env !== null && typeof command.env === "object" && !Array.isArray(command.env) && Object.values(command.env as JsonObject).every((entry) => typeof entry === "string"), `Version 2 command ${index} env is invalid.`);
    assert.equal(command.privacy, "sanitized", `Version 2 command ${index} privacy mismatch.`);
    assert.ok(Number.isInteger(command.expectedExitCode), `Version 2 command ${index} expected exit is invalid.`);
    assert.ok(!["sh", "bash", "zsh"].includes((command.argv as string[])[0]) && !(command.argv as string[]).includes("-c"), `Version 2 command ${index} may not use a shell.`);
    assert.ok(!Object.keys(command.env as JsonObject).some((key) => /^GIT_/.test(key) || key === "NODE_OPTIONS" || key === "NODE_PATH"), `Version 2 command ${index} may not define Git/Node redirection environment variables.`);
    return command;
  });
  const lintCommands = commands.filter((command) => command.name === "lint-regression");
  assert.equal(lintCommands.length, 1, "Version 2 command config must contain exactly one lint-regression command.");
  assert.deepEqual(lintCommands[0].argv, ["node", "--experimental-strip-types", "scripts/spec0001-proof/measureSpec0001LintRegression.ts", `--base=${base}`], "Version 2 lint command argv mismatch.");
  assert.equal(lintCommands[0].expectedExitCode, 0, "Version 2 lint command must expect success.");
  assert.deepEqual(lintCommands[0].env, {}, "Version 2 lint command must not add environment values.");
  if (phase === 2) {
    const expected = phaseTwoExpectedCommandArgv(base);
    assert.equal(commands.length, expected.length, "Phase 2 proof requires exactly six commands.");
    commands.forEach((command, index) => {
      assert.deepEqual(command.argv, expected[index], `Phase 2 command ${index + 1} argv/order mismatch.`);
      assert.equal(command.expectedExitCode, 0, `Phase 2 command ${index + 1} must expect exit 0.`);
      assert.deepEqual(command.env, {}, `Phase 2 command ${index + 1} declared env must be empty.`);
    });
  }
  if (phase === 3) {
    const expected = phaseThreeExpectedCommandArgv(base);
    assert.equal(commands.length, expected.length, "Phase 3 proof requires exactly eleven commands.");
    commands.forEach((command, index) => {
      assert.deepEqual(command.argv, expected[index], `Phase 3 command ${index + 1} argv/order mismatch.`);
      assert.equal(command.expectedExitCode, index === 9 ? 1 : 0, `Phase 3 command ${index + 1} expected exit mismatch.`);
      assert.deepEqual(command.env, {}, `Phase 3 command ${index + 1} declared env must be empty.`);
    });
  }
  if (phase === 4) {
    const expected = phaseFourExpectedCommandArgv(base);
    assert.equal(commands.length, expected.length, "Phase 4 proof requires exactly twelve commands.");
    commands.forEach((command, index) => {
      assert.deepEqual(command.argv, expected[index], `Phase 4 command ${index + 1} argv/order mismatch.`);
      assert.equal(command.expectedExitCode, 0, `Phase 4 command ${index + 1} must expect exit 0.`);
      assert.deepEqual(command.env, {}, `Phase 4 command ${index + 1} declared env must be empty.`);
    });
  }
  if (phase === 5) {
    const expected = phaseFiveExpectedCommandArgv(base);
    assert.equal(commands.length, expected.length, "Phase 5 proof requires exactly twelve commands.");
    commands.forEach((command, index) => {
      assert.deepEqual(command.argv, expected[index], `Phase 5 command ${index + 1} argv/order mismatch.`);
      assert.equal(command.expectedExitCode, 0, `Phase 5 command ${index + 1} must expect exit 0.`);
      assert.deepEqual(command.env, index === 0 ? PHASE5_SOURCE_DIRECT_ENVIRONMENT : {}, `Phase 5 command ${index + 1} declared env mismatch.`);
    });
  }
  if (phase === 6) {
    const expected = phaseSixExpectedCommandArgv(base);
    assert.equal(commands.length, expected.length, "Phase 6 proof requires exactly fifteen commands.");
    commands.forEach((command, index) => {
      assert.deepEqual(command.argv, expected[index], `Phase 6 command ${index + 1} argv/order mismatch.`);
      assert.equal(command.expectedExitCode, 0, `Phase 6 command ${index + 1} must expect exit 0.`);
      assert.deepEqual(command.env, index < 2 ? PHASE5_SOURCE_DIRECT_ENVIRONMENT : {}, `Phase 6 command ${index + 1} declared env mismatch.`);
    });
  }
  const executions = commands.map((command) => expectedV2Execution(command, everyBindingPath));
  return {commands, executions, bindingPaths, browserEvidenceInput: config.browserEvidenceInput as string};
};

const validateV2Receipt = (value: unknown, command: JsonObject, expectedExecution: ClosedExecutionReceipt, order: number, base: string, head: string, mode: ProofValidationMode = "technical") => {
  const receipt = strictObject(value, [
    "receiptVersion", "name", "order", "argv", "cwd", "env", "privacy", "startedAt", "durationMs", "exitCode",
    "expectedExitCode", "passed", "stdout", "stderr", "execution", "lintRegression",
  ], `version 2 receipt ${order}`);
  assert.equal(receipt.receiptVersion, 2, `Version 2 receipt ${order} version mismatch.`);
  assert.equal(receipt.name, command.name, `Version 2 receipt ${order} name mismatch.`);
  assert.equal(receipt.order, order, `Version 2 receipt ${order} order mismatch.`);
  assert.deepEqual(receipt.argv, command.argv, `Version 2 receipt ${order} argv mismatch.`);
  assert.equal(receipt.cwd, command.cwd, `Version 2 receipt ${order} cwd mismatch.`);
  assert.deepEqual(receipt.env, command.env, `Version 2 receipt ${order} env mismatch.`);
  assert.equal(receipt.privacy, "sanitized", `Version 2 receipt ${order} privacy mismatch.`);
  assert.ok(typeof receipt.startedAt === "string" && !Number.isNaN(Date.parse(receipt.startedAt)), `Version 2 receipt ${order} timestamp invalid.`);
  requireCount(receipt.durationMs, `Version 2 receipt ${order} duration`);
  assert.equal(receipt.exitCode, command.expectedExitCode, `Version 2 receipt ${order} actual exit mismatch.`);
  assert.equal(receipt.expectedExitCode, command.expectedExitCode, `Version 2 receipt ${order} expected exit mismatch.`);
  assert.equal(receipt.passed, true, `Version 2 receipt ${order} did not pass.`);
  const stdout = validateCapturedBytes(receipt.stdout, `version 2 receipt ${order} stdout`);
  const stderr = validateCapturedBytes(receipt.stderr, `version 2 receipt ${order} stderr`);
  assert.ok(!secretPattern.test(Buffer.concat([stdout, stderr]).toString("utf8")), `Version 2 receipt ${order} contains privacy-invalid evidence.`);
  assert.deepEqual(receipt.execution, expectedExecution, `Version 2 receipt ${order} closed execution binding mismatch.`);
  if (command.name === "lint-regression") {
    const parsed = JSON.parse(stdout.toString("utf8")) as unknown;
    assert.deepEqual(receipt.lintRegression, parsed, "Version 2 lint receipt does not equal captured stdout.");
    validateV2LintMeasurementInternal(receipt.lintRegression, base, head, mode);
    return receipt.lintRegression as JsonObject;
  }
  assert.equal(receipt.lintRegression, null, `Version 2 receipt ${order} must not carry lint evidence.`);
  return null;
};

const validateV2Evidence = (value: unknown, manifest: JsonObject, browserEvidenceInput: string, artifactPaths: Set<string>, mode: ProofValidationMode = "technical") => {
  const evidence = strictObject(value, [
    "evidenceVersion", "browserStatus", "runnerResult", "derivedGitState", "baseCommit", "headCommit", "observedDirtyPaths",
    "dirtyExpectedPaths", "cleanExpectedPaths", "selectedExpectedPaths", "authorization", "bindings",
  ], "version 2 browser evidence");
  assert.equal(evidence.evidenceVersion, 2, "Version 2 browser evidence version mismatch.");
  assert.equal(evidence.browserStatus, "captured", "Version 2 browser evidence must be captured.");
  assert.equal(evidence.baseCommit, manifest.baseCommit, "Version 2 evidence base mismatch.");
  assert.equal(evidence.headCommit, manifest.headCommit, "Version 2 evidence HEAD mismatch.");
  const runnerBinding = validateV2EvidenceFileBinding(evidence.runnerResult, "version 2 runner result", artifactPaths);
  assert.equal(runnerBinding.path, browserEvidenceInput, "Version 2 runner result path mismatch.");
  const runner = readJson(runnerBinding.path) as JsonObject;
  const validatedRunner = manifest.phase === 6
    ? validatePhase6Result(runner, ROOT, true, mode === "closeout" ? "phase-6-closeout" : "technical")
    : manifest.phase === 5
    ? validatePhase5RouteResult(runner, ROOT, true, mode === "closeout" ? "phase-5-closeout" : "technical")
    : manifest.phase === 2 || manifest.phase === 3 || manifest.phase === 4
      ? validateExtensionResult(
      runner,
      ROOT,
      true,
      mode === "closeout" ? manifest.phase === 2 ? "phase-2-closeout" : manifest.phase === 3 ? "phase-3-closeout" : "phase-4-closeout" : "technical",
    )
      : null;
  const runnerRuntime = strictObject(runner.runtime, ["browserExecutable", "browserVersion", "nodeVersion", "playwrightCoreVersion"], "version 2 runner runtime");
  const manifestRuntime = manifest.runtime as JsonObject;
  assert.equal(runnerRuntime.playwrightCoreVersion, "1.62.1", "Version 2 runner Playwright Core version mismatch.");
  assert.equal(runnerRuntime.browserVersion, manifestRuntime.browserVersion, "Version 2 runner/manifest browser version mismatch.");
  assert.equal(runnerRuntime.nodeVersion, manifestRuntime.nodeVersion, "Version 2 runner/manifest Node version mismatch.");
  assert.deepEqual(validateV2BrowserExecutableBinding(runnerRuntime.browserExecutable, "Version 2 runner browser executable"), manifestRuntime.browserExecutable, "Version 2 runner/manifest browser executable mismatch.");
  for (const field of [
    "derivedGitState", "baseCommit", "headCommit", "observedDirtyPaths", "dirtyExpectedPaths", "cleanExpectedPaths",
    "selectedExpectedPaths", "authorization", "bindings",
  ] as const) assert.deepEqual(evidence[field], runner[field], `Version 2 runner/evidence ${field} mismatch.`);
  if (validatedRunner !== null) {
    for (const field of [
      "derivedGitState", "baseCommit", "headCommit", "observedDirtyPaths", "dirtyExpectedPaths", "cleanExpectedPaths",
      "selectedExpectedPaths", "authorization", "bindings",
    ] as const) assert.deepEqual(evidence[field], validatedRunner[field], `Version 2 normalized runner/evidence ${field} mismatch.`);
  }
  assert.ok(evidence.derivedGitState === "dirty-executor" || evidence.derivedGitState === "clean-committed", "Version 2 derived Git state invalid.");
  const stringArray = (field: "observedDirtyPaths" | "dirtyExpectedPaths" | "cleanExpectedPaths" | "selectedExpectedPaths") => {
    const values = evidence[field];
    assert.ok(Array.isArray(values) && values.every((entry) => typeof entry === "string" && entry.length > 0), `Version 2 ${field} is invalid.`);
    assert.equal(new Set(values as string[]).size, (values as string[]).length, `Version 2 ${field} contains duplicates.`);
    assert.deepEqual(values, [...(values as string[])].sort(), `Version 2 ${field} must be sorted.`);
    return values as string[];
  };
  const observed = stringArray("observedDirtyPaths");
  const dirtyExpected = stringArray("dirtyExpectedPaths");
  const cleanExpected = stringArray("cleanExpectedPaths");
  const selected = stringArray("selectedExpectedPaths");
  assert.deepEqual(cleanExpected, [], "Version 2 clean expectations must be empty.");
  if (evidence.derivedGitState === "dirty-executor") {
    assert.equal(manifest.headCommit, manifest.baseCommit, "Dirty version 2 proof must run at its base commit.");
    assert.deepEqual(observed, dirtyExpected, "Dirty version 2 observed paths differ from expectations.");
    assert.deepEqual(selected, dirtyExpected, "Dirty version 2 selected expectations mismatch.");
  } else {
    assert.deepEqual(observed, [], "Clean version 2 evidence must observe no dirty path.");
    assert.deepEqual(selected, cleanExpected, "Clean version 2 selected expectations mismatch.");
    assert.notEqual(manifest.headCommit, manifest.baseCommit, "Clean version 2 proof requires a strict descendant HEAD.");
    assert.equal(gitV2("merge-base", "--is-ancestor", manifest.baseCommit as string, manifest.headCommit as string).trim(), "", "Clean version 2 base is not an ancestor of HEAD.");
  }
  const authorization = strictObject(evidence.authorization, ["authorizationId", "materializationKind"], "version 2 evidence authorization");
  if (manifest.phase === 6) assert.equal(authorization.authorizationId, "phase-6/v1", "Phase 6 authorization ID invalid.");
  else if (manifest.phase === 5) assert.equal(authorization.authorizationId, "phase-5/v1", "Phase 5 authorization ID invalid.");
  else if (manifest.phase === 4) assert.equal(authorization.authorizationId, "phase-4/v1", "Phase 4 authorization ID invalid.");
  else if (manifest.phase === 3) assert.equal(authorization.authorizationId, "phase-3/v1", "Phase 3 authorization ID invalid.");
  else assert.ok(authorization.authorizationId === "phase-1.5-compatibility-synthetic/v1" || authorization.authorizationId === "phase-2/v1", "Legacy version 2 authorization ID invalid.");
  assert.ok(authorization.materializationKind === "materialized" || authorization.materializationKind === "deferred", "Version 2 materialization kind invalid.");
  const bindingFields = manifest.phase === 5 ? ["catalog", "plan", "registry"] as const : ["adapter", "catalog", "plan", "registry"] as const;
  const resultBindings = strictObject(evidence.bindings, bindingFields, "version 2 evidence bindings");
  for (const field of bindingFields) validateV2EvidenceFileBinding(resultBindings[field], `version 2 ${field}`, artifactPaths);
  return evidence;
};

const validateProofManifestV2 = (manifestPath: string, allowedOutputArtifacts: string[] = [], mode: ProofValidationMode = "technical") => {
  safeV2RepositoryPath(manifestPath, "version 2 proof manifest");
  const manifest = strictObject(readJson(manifestPath), [
    "manifestVersion", "specId", "phase", "baseCommit", "headCommit", "recordedAt", "runtime", "commandConfig", "receipts",
    "artifacts", "bindings", "evidence", "commandsPassed", "lintRegression",
  ], "version 2 proof manifest");
  assert.equal(manifest.manifestVersion, 2, "Version 2 manifest version mismatch.");
  assert.equal(manifest.specId, "SPEC-0001", "Version 2 manifest spec mismatch.");
  assert.ok(Number.isSafeInteger(manifest.phase) && (manifest.phase as number) >= 2 && (manifest.phase as number) <= 7, "Version 2 manifest phase invalid.");
  assert.match(manifest.baseCommit as string, GIT_SHA_PATTERN, "Version 2 manifest base invalid.");
  assert.match(manifest.headCommit as string, GIT_SHA_PATTERN, "Version 2 manifest HEAD invalid.");
  assert.ok(typeof manifest.recordedAt === "string" && !Number.isNaN(Date.parse(manifest.recordedAt)), "Version 2 manifest timestamp invalid.");
  const runtime = strictObject(manifest.runtime, ["nodeVersion", "npmVersion", "browserVersion", "browserExecutable", "textEncoderAvailable", "webCryptoAvailable"], "version 2 runtime");
  assert.equal(requireString(runtime.nodeVersion, "Version 2 Node version"), process.version, "Version 2 Node runtime mismatch.");
  const npmPackage = readJson(resolve(dirname(process.execPath), "../lib/node_modules/npm/package.json")) as JsonObject;
  assert.equal(requireString(runtime.npmVersion, "Version 2 npm version"), npmPackage.version, "Version 2 npm runtime mismatch.");
  assert.ok(runtime.browserVersion === null || (typeof runtime.browserVersion === "string" && runtime.browserVersion.length > 0), "Version 2 browser version invalid.");
  validateV2BrowserExecutableBinding(runtime.browserExecutable, "Version 2 manifest browser executable");
  assert.equal(runtime.textEncoderAvailable, true, "Version 2 TextEncoder availability not proven.");
  assert.equal(runtime.webCryptoAvailable, true, "Version 2 WebCrypto availability not proven.");
  const configBinding = validateV2Binding(manifest.commandConfig, "version 2 command config binding");
  const expectedConfigPath = manifest.phase === 6
    ? "scripts/fixtures/stick-ai/v2/phase-6-proof-commands.json"
    : `scripts/fixtures/stick-ai/v1/phase-${manifest.phase}-proof-commands.json`;
  assert.equal(configBinding.path, expectedConfigPath, "Unexpected version 2 command config path.");
  const config = validateV2CommandConfig(readJson(configBinding.path), manifest.phase as number, manifest.baseCommit as string);
  assert.ok(Array.isArray(manifest.receipts) && manifest.receipts.length === config.commands.length, "Version 2 receipt count mismatch.");
  const receiptPaths = new Set<string>();
  let lintRegression: JsonObject | null = null;
  (manifest.receipts as unknown[]).forEach((bindingValue, order) => {
    const binding = validateV2Binding(bindingValue, `version 2 receipt binding ${order}`);
    assert.ok(!receiptPaths.has(binding.path), `Duplicate version 2 receipt path ${binding.path}.`);
    receiptPaths.add(binding.path);
    const observed = validateV2Receipt(readJson(binding.path), config.commands[order], config.executions[order], order, manifest.baseCommit as string, manifest.headCommit as string, mode);
    if (observed !== null) lintRegression = observed;
  });
  assert.ok(lintRegression !== null, "Version 2 lint receipt is missing.");
  assert.deepEqual(manifest.lintRegression, lintRegression, "Version 2 manifest/receipt lint evidence differs.");
  validateV2LintMeasurementInternal(manifest.lintRegression, manifest.baseCommit as string, manifest.headCommit as string, mode);
  const receiptDirectory = dirname(resolve(ROOT, (manifest.receipts as FileBinding[])[0].path));
  assert.deepEqual(
    readdirSync(receiptDirectory).filter((name) => /^\d{3}-.*\.json$/.test(name)).sort(),
    [...receiptPaths].map((path) => path.split("/").at(-1)!).sort(),
    "Missing or extra version 2 receipt artifact detected.",
  );
  assert.ok(Array.isArray(manifest.artifacts) && manifest.artifacts.length > 0, "Version 2 artifact inventory is missing.");
  const artifactPaths = new Set<string>();
  for (const [index, bindingValue] of (manifest.artifacts as unknown[]).entries()) {
    const binding = validateV2Binding(bindingValue, `version 2 artifact binding ${index}`);
    assert.ok(!artifactPaths.has(binding.path), `Duplicate version 2 artifact path ${binding.path}.`);
    assert.notEqual(binding.path, manifestPath, "Version 2 manifest must not hash itself.");
    assert.notEqual(binding.path, relative(ROOT, resolve(dirname(resolve(ROOT, manifestPath)), "proof-closeout-manifest.json")), "Version 2 manifest must not include closeout output.");
    artifactPaths.add(binding.path);
  }
  const bindings = strictObject(manifest.bindings, ["sources", "fixtures", "schemas", "harness", "plans"], "version 2 proof bindings");
  const boundPaths = new Set<string>();
  for (const kind of ["sources", "fixtures", "schemas", "harness", "plans"] as const) {
    assert.ok(Array.isArray(bindings[kind]), `Version 2 ${kind} bindings must be an array.`);
    const declared = (bindings[kind] as unknown[]).map((binding, index) => validateV2Binding(binding, `version 2 ${kind} binding ${index}`));
    assert.deepEqual(declared.map((binding) => binding.path), config.bindingPaths[kind], `Version 2 ${kind} bindings differ from command config.`);
    for (const binding of declared) {
      assert.ok(!boundPaths.has(binding.path), `Duplicate cross-category version 2 binding: ${binding.path}`);
      assert.ok(artifactPaths.has(binding.path), `Version 2 ${kind} binding is absent from artifacts: ${binding.path}`);
      boundPaths.add(binding.path);
    }
  }
  validateV2Evidence(manifest.evidence, manifest, config.browserEvidenceInput, artifactPaths, mode);
  const proofDirectory = dirname(resolve(ROOT, manifestPath));
  const proofDirectoryPrefix = `${relative(ROOT, proofDirectory)}/`;
  const expectedOutputFiles = new Set([manifestPath, ...receiptPaths, ...[...artifactPaths].filter((path) => path.startsWith(proofDirectoryPrefix)), ...allowedOutputArtifacts]);
  const actualOutputFiles = listFilesRecursively(proofDirectory).filter((path) => path !== relative(ROOT, resolve(proofDirectory, "proof-closeout-manifest.json")));
  assert.deepEqual(actualOutputFiles, [...expectedOutputFiles].sort(), "Unexpected or missing version 2 proof artifact detected.");
  assert.equal(manifest.commandsPassed, true, "Version 2 commandsPassed must be true.");
  assert.ok(!secretPattern.test(JSON.stringify(manifest)), "Version 2 manifest contains privacy-invalid evidence.");
  return manifest;
};

const validateProofManifestInternal = (manifestPath: string, allowedOutputArtifacts: string[], mode: ProofValidationMode) => {
  const value = readJson(manifestPath);
  assert.ok(value !== null && typeof value === "object" && !Array.isArray(value), "Proof manifest must be an object.");
  const version = (value as JsonObject).manifestVersion;
  if (version === 1) return validateProofManifestV1(manifestPath, allowedOutputArtifacts);
  if (version === 2) {
    assertNoProofRelevantGitEnvironment(process.env);
    return validateProofManifestV2(manifestPath, allowedOutputArtifacts, mode);
  }
  throw new Error("Proof manifest must use exact version 1 or version 2 semantics.");
};

export const validateProofManifest = (manifestPath: string, allowedOutputArtifacts: string[] = []) =>
  validateProofManifestInternal(manifestPath, allowedOutputArtifacts, "technical");

export const validateProofManifestForCloseout = (manifestPath: string, allowedOutputArtifacts: string[] = []) =>
  validateProofManifestInternal(manifestPath, allowedOutputArtifacts, "closeout");

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
  assertNoProofRelevantGitEnvironment(process.env);
  assertNoHiddenIndexFlags();
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
  const proof = validateProofManifestForCloseout(proofBinding.path, liveTuple.liveProofInput === "none" ? [] : [liveTuple.liveProofInput]);
  assert.equal(proof.phase, closeout.phase, "Proof/closeout phase mismatch.");
  assert.equal(proof.baseCommit, closeout.baseCommit, "Proof/closeout base mismatch.");
  const phase6TechnicalPaths = closeout.phase === 6 ? phase6TechnicalPathsFromProofManifest(proof) : undefined;
  const state = buildTrackedStateInventory(closeout.baseCommit as string);
  assert.equal(closeout.trackedStateDigest, state.digest, "Post-finalization tracked/untracked state changed.");
  assert.deepEqual(closeout.trackedStateInventory, state.entries, "Post-finalization tracked/untracked byte/status inventory changed.");
  assert.equal(closeout.indexEmpty, true, "Git index must be empty.");
  assertEmptyProofIndex();
  const changed = sortProofPaths([...new Set([
    ...nulList(git("diff", "--name-only", "-z", closeout.baseCommit as string)),
    ...nulList(git("ls-files", "--others", "--exclude-standard", "-z")),
  ])]);
  assert.deepEqual(closeout.allowlistedPaths, changed, "Closeout allowlist does not equal final non-ignored diff.");
  assertPhaseCloseoutPaths(closeout.phase as number, changed, phase6TechnicalPaths);
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
  assertNoProofRelevantGitEnvironment(process.env);
  mustReject("redirected Git environment", () => assertNoProofRelevantGitEnvironment({...process.env, GIT_INDEX_FILE: "/tmp/forbidden-index"}));
  assert.deepEqual(hiddenIndexPathsFromEntries(["H ordinary.ts"]), [], "Ordinary index entries must remain accepted.");
  assert.deepEqual(hiddenIndexPathsFromEntries(["S skipped.ts", "h assumed.ts"]), ["assumed.ts", "skipped.ts"], "Hidden index entry detection mismatch.");
  assertNoStagedPaths([]);
  mustReject("staged Phase 2 path", () => assertNoStagedPaths(["scripts/validateSpec0001ProofBundle.ts"]));
  assert.deepEqual(
    sortProofPaths(["docs/architecture.md", "docs/CURRENT_STATE.md"]),
    ["docs/CURRENT_STATE.md", "docs/architecture.md"],
    "Proof paths must use canonical UTF-8 byte-wise ordering.",
  );
  assertPhaseCloseoutPaths(2, PHASE2_CLOSEOUT_PATHS);
  mustReject("missing Phase 2 closeout path", () => assertPhaseCloseoutPaths(2, PHASE2_CLOSEOUT_PATHS.slice(1)));
  mustReject("extra Phase 2 closeout path", () => assertPhaseCloseoutPaths(2, sortProofPaths([...PHASE2_CLOSEOUT_PATHS, "unauthorized/extra.txt"])));
  assertPhaseCloseoutPaths(3, PHASE3_CLOSEOUT_PATHS);
  mustReject("missing Phase 3 closeout path", () => assertPhaseCloseoutPaths(3, PHASE3_CLOSEOUT_PATHS.slice(1)));
  mustReject("extra Phase 3 closeout path", () => assertPhaseCloseoutPaths(3, sortProofPaths([...PHASE3_CLOSEOUT_PATHS, "docs/unauthorized-closeout.md"])));
  assertPhaseCloseoutPaths(4, PHASE4_CLOSEOUT_PATHS);
  mustReject("missing Phase 4 closeout path", () => assertPhaseCloseoutPaths(4, PHASE4_CLOSEOUT_PATHS.slice(1)));
  mustReject("extra Phase 4 closeout path", () => assertPhaseCloseoutPaths(4, sortProofPaths([...PHASE4_CLOSEOUT_PATHS, "docs/unauthorized-closeout.md"])));
  assertPhaseCloseoutPaths(5, PHASE5_CLOSEOUT_PATHS);
  mustReject("missing Phase 5 closeout path", () => assertPhaseCloseoutPaths(5, PHASE5_CLOSEOUT_PATHS.slice(1)));
  mustReject("extra Phase 5 closeout path", () => assertPhaseCloseoutPaths(5, sortProofPaths([...PHASE5_CLOSEOUT_PATHS, "docs/unauthorized-closeout.md"])));
  const phaseSixRecordedTechnicalPaths = (readJson(PHASE6_PLAN_PATH) as JsonObject).dirtyExpectedPaths as string[];
  assert.equal(PHASE6_PATHS.length, 26, "Phase 6 authorization ceiling must remain exactly 26 paths.");
  assert.equal(phaseSixRecordedTechnicalPaths.length, 25, "Phase 6 accepted manifest projection must remain exactly 25 paths.");
  const phaseSixCloseoutPaths = phase6CloseoutPathsForTechnicalSubset(phaseSixRecordedTechnicalPaths);
  assertPhaseCloseoutPaths(6, phaseSixCloseoutPaths, phaseSixRecordedTechnicalPaths);
  mustReject("Phase 6 closeout without manifest projection", () => assertPhaseCloseoutPaths(6, phaseSixCloseoutPaths));
  mustReject("Phase 6 fake permitted 26th path", () => assertPhaseCloseoutPaths(6, phase6CloseoutPathsForTechnicalSubset(PHASE6_PATHS), phaseSixRecordedTechnicalPaths));
  mustReject("Phase 6 missing observed technical path", () => assertPhaseCloseoutPaths(6, phaseSixCloseoutPaths.filter((path) => path !== phaseSixRecordedTechnicalPaths[0]), phaseSixRecordedTechnicalPaths));
  mustReject("Phase 6 extra technical path", () => assertPhaseCloseoutPaths(6, sortProofPaths([...phaseSixCloseoutPaths, "scripts/unauthorized-phase-6.ts"]), phaseSixRecordedTechnicalPaths));
  mustReject("Phase 6 missing closeout record", () => assertPhaseCloseoutPaths(6, phaseSixCloseoutPaths.filter((path) => path !== PHASE6_CLOSEOUT_RECORD_PATHS[0]), phaseSixRecordedTechnicalPaths));
  mustReject("Phase 6 extra closeout record", () => assertPhaseCloseoutPaths(6, sortProofPaths([...phaseSixCloseoutPaths, "docs/unauthorized-closeout.md"]), phaseSixRecordedTechnicalPaths));
  mustReject("Phase 6 manifest path outside ceiling", () => phase6CloseoutPathsForTechnicalSubset(sortProofPaths([...phaseSixRecordedTechnicalPaths, "scripts/unauthorized-phase-6.ts"])));
  const phaseSixProjectionManifest = {
    phase: 6,
    evidence: {
      derivedGitState: "dirty-executor",
      observedDirtyPaths: phaseSixRecordedTechnicalPaths,
      dirtyExpectedPaths: phaseSixRecordedTechnicalPaths,
      cleanExpectedPaths: [],
      selectedExpectedPaths: phaseSixRecordedTechnicalPaths,
    },
  };
  assert.deepEqual(phase6TechnicalPathsFromProofManifest(phaseSixProjectionManifest), phaseSixRecordedTechnicalPaths, "Phase 6 manifest technical projection mismatch.");
  mustReject("Phase 6 tampered manifest observed path", () => phase6TechnicalPathsFromProofManifest({
    ...phaseSixProjectionManifest,
    evidence: {...phaseSixProjectionManifest.evidence, observedDirtyPaths: phaseSixRecordedTechnicalPaths.slice(1)},
  }));
  mustReject("Phase 6 tampered manifest ceiling path", () => phase6TechnicalPathsFromProofManifest({
    ...phaseSixProjectionManifest,
    evidence: {
      ...phaseSixProjectionManifest.evidence,
      observedDirtyPaths: sortProofPaths([...phaseSixRecordedTechnicalPaths, "scripts/unauthorized-phase-6.ts"]),
      dirtyExpectedPaths: sortProofPaths([...phaseSixRecordedTechnicalPaths, "scripts/unauthorized-phase-6.ts"]),
      selectedExpectedPaths: sortProofPaths([...phaseSixRecordedTechnicalPaths, "scripts/unauthorized-phase-6.ts"]),
    },
  }));
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
  const bindExisting = (path: string) => {
    const bytes = readFileSync(resolve(ROOT, path));
    return {path, sha256: sha256Bytes(bytes), byteLength: bytes.byteLength};
  };
  const phaseSixPlanBinding = bindExisting(PHASE6_PLAN_PATH);
  mustReject("Phase 6 tampered manifest binding hash", () => validateBinding({...phaseSixPlanBinding, sha256: `sha256:${"0".repeat(64)}`}, "Phase 6 tampered plan binding"));
  const dependency = (path: string, version: string | null) => ({...bindExisting(path), version});
  const currentSha = git("rev-parse", "HEAD").trim();
  const v2Command: JsonObject = {name: "shared-proof-self-test", argv: ["node", "--experimental-strip-types", "scripts/validateSpec0001ProofBundle.ts", "--self-test"], cwd: ".", env: {}, expectedExitCode: 0, privacy: "sanitized"};
  const v2Execution = expectedV2Execution(v2Command, ["scripts/validateSpec0001ProofBundle.ts"]);
  const v2Receipt: JsonObject = {
    receiptVersion: 2, name: v2Command.name, order: 0, argv: v2Command.argv, cwd: ".", env: {}, privacy: "sanitized",
    startedAt: new Date(0).toISOString(), durationMs: 1, exitCode: 0, expectedExitCode: 0, passed: true,
    stdout: captured("ok"), stderr: captured(""), execution: v2Execution, lintRegression: null,
  };
  validateV2Receipt(v2Receipt, v2Command, v2Execution, 0, currentSha, currentSha);
  mustReject("missing version 2 execution binding", () => validateV2Receipt(Object.fromEntries(Object.entries(v2Receipt).filter(([key]) => key !== "execution")), v2Command, v2Execution, 0, currentSha, currentSha));
  mustReject("forged version 2 executable binding", () => validateV2Receipt({...v2Receipt, execution: {...v2Execution, executable: {...v2Execution.executable, sha256: `sha256:${"0".repeat(64)}`}}}, v2Command, v2Execution, 0, currentSha, currentSha));
  mustReject("version 2 Node eval authority", () => expectedV2Execution({...v2Command, argv: ["node", "--eval", "process.exit(0)"]}, ["scripts/validateSpec0001ProofBundle.ts"]));
  const phaseTwoBindings = [
    "scripts/validateStickPoseTimeline.ts", "scripts/validateStickFigureAiContracts.ts",
    "scripts/spec0001-proof/measureSpec0001LintRegression.ts", "scripts/runSpec0001BrowserProof.ts",
  ];
  const phaseTwoCommands = phaseTwoExpectedCommandArgv(currentSha).map((argv, index) => ({
    name: index === 3 ? "lint-regression" : `phase-two-${index + 1}`,
    argv, cwd: ".", env: {}, expectedExitCode: 0, privacy: "sanitized",
  }));
  const phaseTwoConfig = {
    configVersion: 2, phase: 2, baseCommit: currentSha,
    bindings: {sources: phaseTwoBindings, fixtures: [], schemas: [], harness: [], plans: ["scripts/fixtures/stick-ai/v1/phase-2-browser-proof-plan.json"]},
    browserEvidenceInput: "output/spec-0001/phase-2/browser/runner-result.json", commands: phaseTwoCommands,
  };
  validateV2CommandConfig(phaseTwoConfig, 2, currentSha);
  mustReject("reordered phase 2 commands", () => validateV2CommandConfig({...phaseTwoConfig, commands: [phaseTwoCommands[1], phaseTwoCommands[0], ...phaseTwoCommands.slice(2)]}, 2, currentSha));
  const phaseFourConfig = readJson("scripts/fixtures/stick-ai/v1/phase-4-proof-commands.json") as JsonObject;
  validateV2CommandConfig(phaseFourConfig, 4, phaseFourConfig.baseCommit as string);
  const phaseFourCommands = phaseFourConfig.commands as JsonObject[];
  mustReject("reordered Phase 4 commands", () => validateV2CommandConfig({...phaseFourConfig, commands: [phaseFourCommands[1], phaseFourCommands[0], ...phaseFourCommands.slice(2)]}, 4, phaseFourConfig.baseCommit as string));
  const phaseFiveConfig = readJson("scripts/fixtures/stick-ai/v1/phase-5-proof-commands.json") as JsonObject;
  validateV2CommandConfig(phaseFiveConfig, 5, phaseFiveConfig.baseCommit as string);
  const phaseFiveCommands = phaseFiveConfig.commands as JsonObject[];
  mustReject("reordered Phase 5 commands", () => validateV2CommandConfig({...phaseFiveConfig, commands: [phaseFiveCommands[1], phaseFiveCommands[0], ...phaseFiveCommands.slice(2)]}, 5, phaseFiveConfig.baseCommit as string));
  mustReject("missing Phase 5 source-direct environment", () => validateV2CommandConfig({...phaseFiveConfig, commands: [{...phaseFiveCommands[0], env: {}}, ...phaseFiveCommands.slice(1)]}, 5, phaseFiveConfig.baseCommit as string));
  const phaseTwoPlanPath = "scripts/fixtures/stick-ai/v1/phase-2-browser-proof-plan.json";
  const phaseTwoPlan = readJson(phaseTwoPlanPath) as JsonObject;
  const phaseTwoBase = phaseTwoPlan.baseCommit as string;
  const phaseTwoDirtyPaths = phaseTwoPlan.dirtyExpectedPaths as string[];
  const phaseTwoObservation = (paths: readonly string[]) => ({
    headCommit: phaseTwoBase,
    stagedPaths: [],
    hiddenIndexPaths: [],
    trackedDirtyPaths: [...paths].sort((left, right) => left.localeCompare(right)),
    untrackedPaths: [],
    baseIsStrictAncestor: false,
    committedChangedPaths: [],
  });
  const technicalGraph = loadTesterExtensionGraph(ROOT, phaseTwoPlanPath, "technical", phaseTwoObservation(phaseTwoDirtyPaths));
  mustReject("technical extension graph rejects closeout record", () => deriveGitState(
    ROOT,
    technicalGraph.plan,
    technicalGraph.pathCeiling,
    phaseTwoObservation([...PHASE2_PATHS, "docs/architecture.md"]),
  ));
  const phaseTwoCloseoutPlan = {...technicalGraph.plan, dirtyExpectedPaths: [...PHASE2_PATHS]};
  const closeoutGit = derivePhase2CloseoutGraphGitState(
    ROOT,
    phaseTwoCloseoutPlan,
    PHASE2_PATHS,
    phaseTwoObservation(PHASE2_CLOSEOUT_PATHS),
  );
  assert.deepEqual(closeoutGit.observedDirtyPaths, [...PHASE2_PATHS], "Closeout graph must retain the archived technical result state.");
  mustReject("live closeout extension graph rejects missing records", () => loadTesterExtensionGraph(ROOT, phaseTwoPlanPath, "phase-2-closeout"));
  mustReject("closeout extension graph missing record", () => derivePhase2CloseoutGraphGitState(
    ROOT,
    phaseTwoCloseoutPlan,
    PHASE2_PATHS,
    phaseTwoObservation(PHASE2_CLOSEOUT_PATHS.filter((path) => path !== "docs/architecture.md")),
  ));
  mustReject("closeout extension graph extra record", () => derivePhase2CloseoutGraphGitState(
    ROOT,
    phaseTwoCloseoutPlan,
    PHASE2_PATHS,
    phaseTwoObservation([...PHASE2_CLOSEOUT_PATHS, "docs/unauthorized-closeout.md"]),
  ));
  const phaseThreePlanPath = "scripts/fixtures/stick-ai/v1/phase-3-browser-proof-plan.json";
  const phaseThreePlan = readJson(phaseThreePlanPath) as JsonObject;
  const phaseThreeBase = phaseThreePlan.baseCommit as string;
  const phaseThreeObservation = (paths: readonly string[]) => ({
    headCommit: phaseThreeBase,
    stagedPaths: [],
    hiddenIndexPaths: [],
    trackedDirtyPaths: [...paths].sort((left, right) => left.localeCompare(right)),
    untrackedPaths: [],
    baseIsStrictAncestor: false,
    committedChangedPaths: [],
  });
  const phaseThreeTechnicalGraph = loadTesterExtensionGraph(ROOT, phaseThreePlanPath, "technical", phaseThreeObservation(PHASE3_DIRTY_PATHS));
  mustReject("Phase 3 technical extension graph rejects closeout records", () => deriveGitState(
    ROOT,
    phaseThreeTechnicalGraph.plan,
    phaseThreeTechnicalGraph.pathCeiling,
    phaseThreeObservation(PHASE3_CLOSEOUT_PATHS),
  ));
  const phaseThreeCloseoutGit = derivePhase3CloseoutGraphGitState(
    ROOT,
    phaseThreeTechnicalGraph.plan,
    phaseThreeTechnicalGraph.pathCeiling,
    phaseThreeObservation(PHASE3_CLOSEOUT_PATHS),
  );
  assert.deepEqual(phaseThreeCloseoutGit.observedDirtyPaths, PHASE3_DIRTY_PATHS, "Phase 3 closeout graph must retain the accepted technical result state.");
  mustReject("Phase 3 closeout extension graph missing record", () => derivePhase3CloseoutGraphGitState(
    ROOT,
    phaseThreeTechnicalGraph.plan,
    phaseThreeTechnicalGraph.pathCeiling,
    phaseThreeObservation(PHASE3_CLOSEOUT_PATHS.filter((path) => path !== "docs/CURRENT_STATE.md")),
  ));
  mustReject("Phase 3 closeout extension graph extra record", () => derivePhase3CloseoutGraphGitState(
    ROOT,
    phaseThreeTechnicalGraph.plan,
    phaseThreeTechnicalGraph.pathCeiling,
    phaseThreeObservation([...PHASE3_CLOSEOUT_PATHS, "docs/unauthorized-closeout.md"]),
  ));
  const phaseFourPlanPath = "scripts/fixtures/stick-ai/v1/phase-4-browser-proof-plan.json";
  const phaseFourPlan = readJson(phaseFourPlanPath) as JsonObject;
  const phaseFourBase = phaseFourPlan.baseCommit as string;
  const phaseFourObservation = (paths: readonly string[]) => ({
    headCommit: phaseFourBase,
    stagedPaths: [],
    hiddenIndexPaths: [],
    trackedDirtyPaths: [...paths].sort((left, right) => left.localeCompare(right)),
    untrackedPaths: [],
    baseIsStrictAncestor: false,
    committedChangedPaths: [],
  });
  const phaseFourTechnicalGraph = loadTesterExtensionGraph(ROOT, phaseFourPlanPath, "technical", phaseFourObservation(PHASE4_DIRTY_PATHS));
  mustReject("Phase 4 technical extension graph rejects closeout records", () => deriveGitState(
    ROOT,
    phaseFourTechnicalGraph.plan,
    phaseFourTechnicalGraph.pathCeiling,
    phaseFourObservation(PHASE4_CLOSEOUT_PATHS),
  ));
  const phaseFourCloseoutGit = derivePhase4CloseoutGraphGitState(
    ROOT,
    phaseFourTechnicalGraph.plan,
    phaseFourTechnicalGraph.pathCeiling,
    phaseFourObservation(PHASE4_CLOSEOUT_PATHS),
  );
  assert.deepEqual(phaseFourCloseoutGit.observedDirtyPaths, PHASE4_DIRTY_PATHS, "Phase 4 closeout graph must retain the accepted technical result state.");
  mustReject("Phase 4 closeout extension graph missing record", () => derivePhase4CloseoutGraphGitState(
    ROOT,
    phaseFourTechnicalGraph.plan,
    phaseFourTechnicalGraph.pathCeiling,
    phaseFourObservation(PHASE4_CLOSEOUT_PATHS.filter((path) => path !== "docs/CURRENT_STATE.md")),
  ));
  mustReject("Phase 4 closeout extension graph extra record", () => derivePhase4CloseoutGraphGitState(
    ROOT,
    phaseFourTechnicalGraph.plan,
    phaseFourTechnicalGraph.pathCeiling,
    phaseFourObservation([...PHASE4_CLOSEOUT_PATHS, "docs/unauthorized-closeout.md"]),
  ));
  const phaseFivePlanPath = "scripts/fixtures/stick-ai/v1/phase-5-browser-proof-plan.json";
  const phaseFivePlan = readJson(phaseFivePlanPath) as JsonObject;
  const phaseFiveBase = phaseFivePlan.baseCommit as string;
  const phaseFiveObservation = (paths: readonly string[]) => ({
    headCommit: phaseFiveBase,
    stagedPaths: [],
    hiddenIndexPaths: [],
    trackedDirtyPaths: [...paths].sort((left, right) => left.localeCompare(right)),
    untrackedPaths: [],
    baseIsStrictAncestor: false,
    committedChangedPaths: [],
  });
  const phaseFiveTechnicalGraph = loadPhase5RouteGraph(ROOT, phaseFivePlanPath, "technical", phaseFiveObservation(PHASE5_DIRTY_PATHS));
  assert.deepEqual(phaseFiveTechnicalGraph.pathCeiling, PHASE5_PATHS, "Phase 5 technical graph must preserve the exact 24-path ceiling.");
  mustReject("Phase 5 technical extension graph rejects closeout records", () => deriveGitState(
    ROOT,
    phaseFiveTechnicalGraph.plan,
    phaseFiveTechnicalGraph.pathCeiling,
    phaseFiveObservation(PHASE5_CLOSEOUT_PATHS),
  ));
  const phaseFiveCloseoutGit = derivePhase5CloseoutGraphGitState(
    ROOT,
    phaseFiveTechnicalGraph.plan,
    phaseFiveTechnicalGraph.pathCeiling,
    phaseFiveObservation(PHASE5_CLOSEOUT_PATHS),
  );
  assert.deepEqual(phaseFiveCloseoutGit.observedDirtyPaths, PHASE5_DIRTY_PATHS, "Phase 5 closeout graph must retain the exact recorded technical projection.");
  mustReject("Phase 5 closeout graph missing record", () => derivePhase5CloseoutGraphGitState(
    ROOT,
    phaseFiveTechnicalGraph.plan,
    phaseFiveTechnicalGraph.pathCeiling,
    phaseFiveObservation(PHASE5_CLOSEOUT_PATHS.filter((path) => path !== "docs/CURRENT_STATE.md")),
  ));
  mustReject("Phase 5 closeout graph extra record", () => derivePhase5CloseoutGraphGitState(
    ROOT,
    phaseFiveTechnicalGraph.plan,
    phaseFiveTechnicalGraph.pathCeiling,
    phaseFiveObservation([...PHASE5_CLOSEOUT_PATHS, "docs/unauthorized-closeout.md"]),
  ));
  const phaseSixPlan = readJson(PHASE6_PLAN_PATH) as JsonObject;
  const phaseSixBase = phaseSixPlan.baseCommit as string;
  const phaseSixObservation = (paths: readonly string[]) => ({
    headCommit: phaseSixBase,
    stagedPaths: [],
    hiddenIndexPaths: [],
    trackedDirtyPaths: [...paths].sort((left, right) => left.localeCompare(right)),
    untrackedPaths: [],
    baseIsStrictAncestor: false,
    committedChangedPaths: [],
  });
  const phaseSixTechnicalGraph = loadPhase6Graph(ROOT, PHASE6_PLAN_PATH, "technical", phaseSixObservation(phaseSixRecordedTechnicalPaths));
  assert.deepEqual(phaseSixTechnicalGraph.pathCeiling, PHASE6_PATHS, "Phase 6 technical graph must preserve the exact 26-path ceiling.");
  mustReject("Phase 6 technical graph rejects closeout records", () => deriveGitState(
    ROOT,
    phaseSixTechnicalGraph.plan,
    phaseSixTechnicalGraph.pathCeiling,
    phaseSixObservation(phaseSixCloseoutPaths),
  ));
  const phaseSixCloseoutGit = derivePhase6CloseoutGraphGitState(
    ROOT,
    phaseSixTechnicalGraph.plan,
    phaseSixTechnicalGraph.pathCeiling,
    phaseSixObservation(phaseSixCloseoutPaths),
  );
  assert.deepEqual(phaseSixCloseoutGit.observedDirtyPaths, phaseSixRecordedTechnicalPaths, "Phase 6 closeout graph must retain the manifest-bound 25-path technical projection.");
  mustReject("Phase 6 closeout graph fake permitted 26th path", () => derivePhase6CloseoutGraphGitState(
    ROOT,
    phaseSixTechnicalGraph.plan,
    phaseSixTechnicalGraph.pathCeiling,
    phaseSixObservation(phase6CloseoutPathsForTechnicalSubset(PHASE6_PATHS)),
  ));
  mustReject("Phase 6 closeout graph missing observed technical path", () => derivePhase6CloseoutGraphGitState(
    ROOT,
    phaseSixTechnicalGraph.plan,
    phaseSixTechnicalGraph.pathCeiling,
    phaseSixObservation(phaseSixCloseoutPaths.filter((path) => path !== phaseSixRecordedTechnicalPaths[0])),
  ));
  mustReject("Phase 6 closeout graph missing record", () => derivePhase6CloseoutGraphGitState(
    ROOT,
    phaseSixTechnicalGraph.plan,
    phaseSixTechnicalGraph.pathCeiling,
    phaseSixObservation(phaseSixCloseoutPaths.filter((path) => path !== PHASE6_CLOSEOUT_RECORD_PATHS[0])),
  ));
  mustReject("Phase 6 closeout graph extra record", () => derivePhase6CloseoutGraphGitState(
    ROOT,
    phaseSixTechnicalGraph.plan,
    phaseSixTechnicalGraph.pathCeiling,
    phaseSixObservation([...phaseSixCloseoutPaths, "docs/unauthorized-closeout.md"]),
  ));
  const relaxedCli = spawnSync(process.execPath, [
    "--experimental-strip-types",
    resolve(ROOT, "scripts/validateSpec0001ProofBundle.ts"),
    "--validation-mode=phase-2-closeout",
  ], {cwd: ROOT, encoding: "utf8", env: v2Environment()});
  assert.notEqual(relaxedCli.status, 0, "Public CLI must not expose the internal closeout validation mode.");
  assert.match(`${relaxedCli.stdout}${relaxedCli.stderr}`, /Use --self-test, <proof-manifest>, or --closeout=<manifest>\./, "Public CLI relaxed-mode rejection mismatch.");
  const dependencyTree = currentDependencyTreeBinding();
  const stateDigest = repositoryStateDigestV2();
  const emptyRaw = {stdoutSha256: sha256Bytes("[]"), stdoutByteLength: 2, stderrSha256: sha256Bytes(""), stderrByteLength: 0};
  const lintV2 = {
    measurementVersion: 2, specId: "SPEC-0001", baseCommit: currentSha, headCommit: currentSha,
    baseTree: git("rev-parse", `${currentSha}^{tree}`).trim(), measuredAt: new Date(0).toISOString(),
    runtime: {nodeVersion: process.version, eslintVersion: JSON.parse(readFileSync(resolve(ROOT, "node_modules/eslint/package.json"), "utf8")).version},
    bindings: {
      package: bindExisting("package.json"), packageLock: bindExisting("package-lock.json"), eslintConfig: bindExisting("eslint.config.mjs"),
      networkGuard: bindExisting("scripts/spec0001-browser/networkDeny.cjs"), installedPackageLock: dependency("node_modules/.package-lock.json", null),
      eslintPackage: dependency("node_modules/eslint/package.json", JSON.parse(readFileSync(resolve(ROOT, "node_modules/eslint/package.json"), "utf8")).version),
      eslintConfigNextPackage: dependency("node_modules/eslint-config-next/package.json", JSON.parse(readFileSync(resolve(ROOT, "node_modules/eslint-config-next/package.json"), "utf8")).version),
      typescriptPackage: dependency("node_modules/typescript/package.json", JSON.parse(readFileSync(resolve(ROOT, "node_modules/typescript/package.json"), "utf8")).version),
      dependencyTree,
      measurer: bindExisting("scripts/spec0001-proof/measureSpec0001LintRegression.ts"),
    },
    base: {exitCode: 1, errors: 5, warnings: 73, rawOutput: emptyRaw},
    result: {exitCode: 1, errors: 5, warnings: 73, rawOutput: emptyRaw},
    changedJavaScriptPaths: [], newJavaScriptPaths: [], changedLineFindings: [], newFileFindings: [],
    gitState: {beforeSha256: stateDigest, afterSha256: stateDigest, unchanged: true},
    network: {baseRecordCount: 0, resultRecordCount: 0, nonLoopbackAttemptCount: 0}, cleanup: {temporaryRootRemoved: true}, passed: true,
  };
  validateV2LintMeasurement(lintV2, currentSha, currentSha);
  mustReject("v1/v2 lint shape mixing", () => validateV2LintMeasurement({...lintV2, measurementVersion: 1}, currentSha, currentSha));
  mustReject("missing measured lint base", () => validateV2LintMeasurement(Object.fromEntries(Object.entries(lintV2).filter(([key]) => key !== "base")), currentSha, currentSha));
  mustReject("worse measured lint result", () => validateV2LintMeasurement({...lintV2, result: {...lintV2.result, errors: 6}}, currentSha, currentSha));
  mustReject("forged measured lint Git state", () => validateV2LintMeasurement({...lintV2, gitState: {...lintV2.gitState, afterSha256: sha256Bytes("changed")}}, currentSha, currentSha));
  mustReject("changed-line measured lint finding", () => validateV2LintMeasurement({...lintV2, changedJavaScriptPaths: ["scripts/example.ts"], changedLineFindings: [{path: "scripts/example.ts", line: 1, endLine: 1, column: 1, endColumn: null, severity: 2, ruleId: "example", messageSha256: sha256Bytes("finding")}]}, currentSha, currentSha));
  const stateProbePath = resolve(ROOT, `.spec0001-v2-state-probe-${process.pid}`);
  const stateBeforeProbe = repositoryStateDigestV2();
  try {
    writeFileSync(stateProbePath, "alpha\n");
    mustReject("strict technical mode repository drift", () => validateV2LintMeasurement(lintV2, currentSha, currentSha));
    validateV2LintMeasurementInternal(lintV2, currentSha, currentSha, "closeout");
    const firstProbeDigest = repositoryStateDigestV2();
    writeFileSync(stateProbePath, "bravo\n");
    const secondProbeDigest = repositoryStateDigestV2();
    assert.notEqual(firstProbeDigest, secondProbeDigest, "Version 2 Git-visible state digest missed a same-path/same-length byte mutation.");
  } finally {
    rmSync(stateProbePath, {force: true});
  }
  assert.equal(repositoryStateDigestV2(), stateBeforeProbe, "Version 2 Git-visible state probe did not restore exact state.");
  mustReject("closeout bound technical-byte tamper", () => validateV2Binding({
    ...bindExisting("scripts/recordSpec0001ProofBundle.ts"),
    sha256: `sha256:${"0".repeat(64)}`,
  }, "closeout bound technical-byte tamper"));
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
    const historicalProofBase = configValue.baseCommit as string;
    assert.match(historicalProofBase, GIT_SHA_PATTERN, "Historical Phase 1 command config base is invalid.");
    const validConfig = validateV1CommandConfig(configValue, 1, historicalProofBase);
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
      manifestVersion: 1, specId: "SPEC-0001", phase: 1, baseCommit: historicalProofBase, headCommit: historicalProofBase,
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
    const state = buildTrackedStateInventory(historicalProofBase);
    const changed = [...new Set([...nulList(git("diff", "--name-only", "-z", historicalProofBase)), ...nulList(git("ls-files", "--others", "--exclude-standard", "-z"))])].sort();
    const closeout: JsonObject = {
      closeoutVersion: 1, specId: "SPEC-0001", phase: 1, baseCommit: historicalProofBase, headCommit: baseSha,
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

    const runnerPath = relative(ROOT, resolve(sandbox, "runner-result-v2.json"));
    const resultBindings = {
      catalog: bindPath("package.json"),
      plan: bindPath("package-lock.json"),
      registry: bindPath("eslint.config.mjs"),
      adapter: bindPath("scripts/spec0001-browser/networkDeny.cjs"),
    };
    const runnerResult = {
      runtime: {browserExecutable: currentBrowserExecutableBinding(), browserVersion: "self-test-browser", nodeVersion: process.version, playwrightCoreVersion: "1.62.1"},
      derivedGitState: "dirty-executor", baseCommit: baseSha, headCommit: baseSha,
      observedDirtyPaths: ["scripts/example.ts"], dirtyExpectedPaths: ["scripts/example.ts"], cleanExpectedPaths: [],
      selectedExpectedPaths: ["scripts/example.ts"],
      authorization: {authorizationId: "phase-1.5-compatibility-synthetic/v1", materializationKind: "materialized"},
      bindings: resultBindings,
    };
    writeFileSync(resolve(ROOT, runnerPath), `${JSON.stringify(runnerResult, null, 2)}\n`);
    const evidence = {
      evidenceVersion: 2, browserStatus: "captured", runnerResult: bindPath(runnerPath),
      derivedGitState: runnerResult.derivedGitState, baseCommit: baseSha, headCommit: baseSha,
      observedDirtyPaths: runnerResult.observedDirtyPaths, dirtyExpectedPaths: runnerResult.dirtyExpectedPaths,
      cleanExpectedPaths: [], selectedExpectedPaths: runnerResult.selectedExpectedPaths,
      authorization: runnerResult.authorization, bindings: resultBindings,
    };
    const evidenceArtifacts = new Set([runnerPath, ...Object.values(resultBindings).map((binding) => binding.path)]);
    const evidenceManifest = {baseCommit: baseSha, headCommit: baseSha, runtime: {browserExecutable: currentBrowserExecutableBinding(), browserVersion: "self-test-browser", nodeVersion: process.version}};
    validateV2Evidence(evidence, evidenceManifest, runnerPath, evidenceArtifacts);
    mustReject("obsolete flattened version 2 evidence", () => validateV2Evidence({
      ...evidence,
      authorizationId: runnerResult.authorization.authorizationId,
      materialization: "fully-materialized",
      catalog: resultBindings.catalog,
      plan: resultBindings.plan,
      registry: resultBindings.registry,
      adapter: resultBindings.adapter,
    }, evidenceManifest, runnerPath, evidenceArtifacts));
    mustReject("obsolete version 2 materialization kind", () => validateV2Evidence({
      ...evidence,
      authorization: {authorizationId: runnerResult.authorization.authorizationId, materializationKind: "fully-materialized"},
    }, evidenceManifest, runnerPath, evidenceArtifacts));
    unlinkSync(resolve(ROOT, runnerPath));
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
