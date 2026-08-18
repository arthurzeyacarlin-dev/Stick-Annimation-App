import {createHash} from "node:crypto";
import {lstatSync, readFileSync, realpathSync} from "node:fs";
import {createRequire} from "node:module";
import {resolve, sep} from "node:path";
import {spawnSync} from "node:child_process";
import type tsTypes from "typescript";
import {BROWSER_EXECUTABLE} from "./browserTesterContract.ts";

type TypeScriptRuntime = typeof import("typescript");
const localRequire = createRequire(import.meta.url);
let typescriptRuntime: TypeScriptRuntime | null = null;
const loadTypeScriptRuntime = () => typescriptRuntime ??= localRequire("typescript") as TypeScriptRuntime;

export const CORRECTION_BASE_COMMIT = "8b663d2b80144e9aeba9ea0ecf0f78ccefa78926" as const;
export const COMPATIBILITY_OUTPUT_ROOT = "output/spec-0001/phase-1.5-compatibility" as const;
export const CATALOG_PATH = "scripts/fixtures/spec0001-browser/v2/tester-extension-authorizations.json" as const;
export const COMPATIBILITY_PLAN_PATH = "scripts/fixtures/spec0001-browser/v2/phase-1.5-compatibility-browser-plan.json" as const;
export const COMPATIBILITY_REGISTRY_PATH = "scripts/fixtures/spec0001-browser/v2/phase-1.5-compatibility-action-registry.json" as const;
export const COMPATIBILITY_ADAPTER_PATH = "scripts/spec0001-browser/actions/phase15CompatibilitySynthetic.ts" as const;

export const sortProofPaths = (paths: readonly string[]) => [...paths]
  .sort((left, right) => Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8")));

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

export const PHASE2_PATHS = [
  "scripts/finalizeSpec0001ProofBundle.ts",
  "scripts/fixtures/spec0001-browser/v1/phase-2-action-registry.json",
  "scripts/fixtures/spec0001-browser/v2/tester-extension-authorizations.json",
  "scripts/fixtures/stick-ai/v1/phase-2-browser-proof-plan.json",
  "scripts/fixtures/stick-ai/v1/phase-2-proof-commands.json",
  "scripts/fixtures/stick-ai/v1/stick-control-disposition-cases.json",
  "scripts/fixtures/stick-ai/v1/stick-correction-affordance-cases.json",
  "scripts/fixtures/stick-ai/v1/stick-document-publication-race-cases.json",
  "scripts/fixtures/stick-ai/v1/stick-editable-timeline-alias-cases.json",
  "scripts/fixtures/stick-ai/v1/stick-editable-timeline-cases.json",
  "scripts/fixtures/stick-ai/v1/stick-gesture-cases.json",
  "scripts/fixtures/stick-ai/v1/stick-manual-wave-build-cases.json",
  "scripts/fixtures/stick-ai/v1/stick-pose-aliasing-cases.json",
  "scripts/fixtures/stick-ai/v1/stick-ui-restoration-reference.json",
  "scripts/fixtures/stick-ai/v1/wave-any-joint-corrections.json",
  "scripts/fixtures/stick-ai/v1/wave-cell-resolution.json",
  "scripts/recordSpec0001ProofBundle.ts",
  "scripts/spec0001-browser/actions/phase2.ts",
  "scripts/spec0001-browser/browserTesterExtensionContract.ts",
  "scripts/validateSpec0001ProofBundle.ts",
  "scripts/validateStickPoseTimeline.ts",
  "src/components/workspace/stickfigure/StickFigureCanvas.tsx",
  "src/components/workspace/stickfigure/StickFigureRightPanel.tsx",
  "src/components/workspace/stickfigure/StickFigureTimelineRow.tsx",
  "src/components/workspace/stickfigure/StickFigureToolBar.tsx",
  "src/components/workspace/stickfigure/StickFigureTopBar.tsx",
  "src/components/workspace/stickfigure/StickFigureWorkspace.tsx",
  "src/components/workspace/stickfigure/types.ts",
  "src/lib/stickfigure/stickProjectContract.ts",
  "src/lib/stickfigure/stickTimeline.ts",
] as const;

export const PHASE2_CLOSEOUT_RECORD_PATHS = [
  "docs/CURRENT_STATE.md",
  "docs/SESSION_HANDOFF.md",
  "docs/TODO.md",
  "docs/architecture.md",
  "docs/changelog.md",
  "docs/specs/0001-first-reversible-ai-stick-animation.md",
  "docs/specs/README.md",
  "docs/testing_workflow.md",
  "project/project_structure.txt",
] as const;

export const PHASE2_CLOSEOUT_PATHS = sortProofPaths([...PHASE2_PATHS, ...PHASE2_CLOSEOUT_RECORD_PATHS]);

export const OPERATION_FAMILIES = [
  "checkpoint", "fixture", "pointer", "protected-regression", "runner-environment",
  "screenshot", "visible-role", "visible-testid", "workspace-driver",
] as const;
export type OperationFamily = typeof OPERATION_FAMILIES[number];
export type AuthorizationId = "phase-1.5-compatibility-synthetic/v1" | "phase-2/v1";
export type DerivedGitStateName = "dirty-executor" | "clean-committed";
export type Digest = `sha256:${string}`;

export type FileBinding = {path: string; byteLength: number; sha256: Digest};
export type ExternalFileBinding = {path: typeof BROWSER_EXECUTABLE; byteLength: number; sha256: Digest};
export type BrowserProofCli =
  | {mode: "legacy"; runBase: string | null}
  | {mode: "extension"; planPath: string};

export type ProtectedRegressionGroup =
  | "home-new-drawing"
  | "home-new-stick"
  | "stick-creator-back"
  | "drawing-generate-frames"
  | "drawing-undo-redo-play-pause";

export type NormalizedAction =
  | {actionId: string; family: "visible-role"; operation: "click" | "fill" | "press" | "assert-visible" | "assert-hidden" | "assert-enabled" | "assert-disabled"; role: string; accessibleName: string; input: null | {text: string} | {key: "Enter" | "Escape" | "Space"}}
  | {actionId: string; family: "visible-testid"; operation: "click" | "assert-visible" | "assert-enabled" | "assert-disabled"; testId: string}
  | {actionId: string; family: "pointer"; operation: "down" | "move" | "up" | "cancel"; targetId: string; pointerId: number; button: 0; point: {x: number; y: number}; expectedEvidenceDigest: Digest}
  | {actionId: string; family: "workspace-driver"; operation: "mountDocument" | "dispatchCompletedJointEdit" | "beginDocumentPublication" | "completeDocumentPublication" | "readCheckpoint"; fixtureId: string | null; operationId: string; expectedEvidenceDigest: Digest}
  | {actionId: string; family: "runner-environment"; operation: "installEnvironmentPlan" | "releaseEnvironmentGate" | "readEnvironmentCheckpoint" | "clearEnvironmentPlan"; fixtureId: string | null; operationId: string; expectedEvidenceDigest: Digest}
  | {actionId: string; family: "checkpoint"; channel: "workspace-driver" | "runner-environment"; checkpointId: string; expectedEvidenceDigest: Digest}
  | {actionId: string; family: "screenshot"; screenshotId: string}
  | {actionId: string; family: "protected-regression"; group: ProtectedRegressionGroup};

export type ExtensionPlan = {
  planVersion: 2;
  specId: "SPEC-0001";
  proofPurpose: "phase-1.5-compatibility-synthetic" | "phase-2";
  authorizationId: AuthorizationId;
  baseCommit: string;
  dirtyExpectedPaths: string[];
  cleanExpectedPaths: [];
  outputRoot: string;
  operationFamilies: OperationFamily[];
  registry: FileBinding;
  contexts: {contextId: string; viewport: {width: 1024 | 1440; height: 768 | 900}}[];
  steps: {stepId: string; actionId: string; contextId: string}[];
  evidence: {
    ledgerKinds: ("action" | "negative" | "checkpoint" | "storage" | "request" | "network" | "console" | "regression" | "cleanup")[];
    screenshotIds: string[];
    protectedRegressionGroups: ProtectedRegressionGroup[];
    productPhaseClaimed: boolean;
  };
};

export type ExtensionRegistry = {
  registryVersion: 2;
  specId: "SPEC-0001";
  authorizationId: AuthorizationId;
  operationFamilies: OperationFamily[];
  adapter: FileBinding;
  fixtures: (
    | {fixtureId: string; fixtureKind: string; sourceKind: "adapter-built-in"; expectedFixtureDigest: Digest}
    | {fixtureId: string; fixtureKind: string; sourceKind: "repository-json"; binding: FileBinding; expectedFixtureDigest: Digest}
  )[];
  actions: NormalizedAction[];
};

export type AdapterDeclaration = {
  declarationVersion: 1;
  adapterId: string;
  authorizationId: AuthorizationId;
  adapterKind: "in-memory-phase2-shaped-synthetic/v1" | "phase-2-product-ports/v1";
  executionProfile: "synthetic-state-machine/v1" | "phase2-workspace-ports/v1";
  workspacePortBinding: null | "spec0001Phase2BrowserPortsV1";
  productPhaseClaimed: boolean;
  driverOperations: {operation: string; fixtureKinds: string[]}[];
  environmentOperations: {operation: string; fixtureKinds: string[]}[];
  pointerTargets: {targetId: string; targetKind: "authorized-canvas"}[];
  checkpointKinds: ("workspace" | "environment")[];
};

export type DerivedGitState = {
  derivedGitState: DerivedGitStateName;
  baseCommit: string;
  headCommit: string;
  observedDirtyPaths: string[];
  dirtyExpectedPaths: string[];
  cleanExpectedPaths: [];
  selectedExpectedPaths: string[];
};

export type ExtensionResult = {
  resultVersion: 2;
  specId: "SPEC-0001";
  proofPurpose: "phase-1.5-compatibility-synthetic" | "phase-2";
  status: "passed";
  recordedAt: string;
  productPhaseClaimed: boolean;
  runtime: {nodeVersion: string; playwrightCoreVersion: "1.62.1"; browserVersion: string; browserExecutable: ExternalFileBinding};
  derivedGitState: DerivedGitStateName;
  baseCommit: string;
  headCommit: string;
  observedDirtyPaths: string[];
  dirtyExpectedPaths: string[];
  cleanExpectedPaths: [];
  selectedExpectedPaths: string[];
  authorization: {authorizationId: AuthorizationId; materializationKind: "materialized" | "deferred"};
  bindings: {catalog: FileBinding; plan: FileBinding; registry: FileBinding; adapter: FileBinding};
  execution: {selectedActionIds: string[]; actionCount: number; checkpointCount: number; screenshotCount: number; protectedRegressionGroups: ProtectedRegressionGroup[]};
  evidence: {ledgerKinds: string[]; screenshotIds: string[]; protectedRegressionGroups: ProtectedRegressionGroup[]};
  network: {browserNonLoopbackAttempts: 0; serverNonLoopbackAttempts: 0; childNonLoopbackAttempts: 0};
  cleanup: {anchorRestored: true; sourceRestored: true; browserContextsOpen: 0; activeGates: 0; activeIntercepts: 0; openChildProcesses: 0; openPorts: 0; residualPaths: []};
};

type MaterializationKind = "materialized" | "deferred";
export type ValidatedAuthorization = {
  authorizationId: AuthorizationId;
  proofPurpose: "phase-1.5-compatibility-synthetic" | "phase-2";
  materializationKind: MaterializationKind;
  plan: {path: string; schemaPath: string; planVersion: 2; byteLength?: number; sha256?: Digest};
  registry: {path: string; schemaPath: string; registryVersion: 2; byteLength?: number; sha256?: Digest};
  adapter: {path: string; grammarId: "spec0001-browser-adapter-declaration/v1"; declarationVersion: 1; byteLength?: number; sha256?: Digest};
  resultSchema: {path: string; resultVersion: 2};
  operationFamilies: OperationFamily[];
  outputRoot: string;
  pathCeiling: string[];
};
export type ValidatedAuthorizationCatalog = {catalogVersion: 1; specId: "SPEC-0001"; authorizations: [ValidatedAuthorization, ValidatedAuthorization]};

export type ValidatedTesterExtension = {
  authorizationId: AuthorizationId;
  materializationKind: MaterializationKind;
  outputRoot: string;
  pathCeiling: readonly string[];
  operationFamilies: readonly OperationFamily[];
  catalogBinding: FileBinding;
  planBinding: FileBinding;
  registryBinding: FileBinding;
  adapterBinding: FileBinding;
  plan: ExtensionPlan;
  registry: ExtensionRegistry;
  adapter: AdapterDeclaration;
  git: DerivedGitState;
};

type JsonRecord = Record<string, unknown>;
const SHA_PATTERN = /^[0-9a-f]{40}$/;
const DIGEST_PATTERN = /^sha256:[0-9a-f]{64}$/;
const HANDLE_PATTERN = /^[A-Za-z0-9](?:[A-Za-z0-9._:-]{0,126}[A-Za-z0-9])?$/;

const fail = (message: string): never => { throw new Error(message); };
const isRecord = (value: unknown): value is JsonRecord => typeof value === "object" && value !== null && !Array.isArray(value);
const object = (value: unknown, keys: readonly string[], label: string): JsonRecord => {
  if (!isRecord(value)) throw new Error(`${label} must be an object.`);
  const record: JsonRecord = value;
  const observed = Object.keys(record).sort();
  const expected = [...keys].sort();
  if (JSON.stringify(observed) !== JSON.stringify(expected)) fail(`${label} fields mismatch: ${observed.join(", ")}.`);
  return record;
};
const string = (value: unknown, label: string): string => typeof value === "string" && value.length > 0 ? value : fail(`${label} must be a nonempty string.`);
const integer = (value: unknown, label: string): number => Number.isSafeInteger(value) && (value as number) >= 0 ? value as number : fail(`${label} must be a safe nonnegative integer.`);
const array = (value: unknown, label: string): unknown[] => Array.isArray(value) ? value : fail(`${label} must be an array.`);
const enumeration = <T extends string>(value: unknown, values: readonly T[], label: string): T => typeof value === "string" && values.includes(value as T) ? value as T : fail(`${label} is invalid.`);
const exact = (actual: unknown, expected: unknown, label: string) => {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) fail(`${label} mismatch.`);
};
const unique = <T>(values: T[], label: string): T[] => {
  if (new Set(values).size !== values.length) fail(`${label} contains duplicates.`);
  return values;
};
const canonicalStrings = (value: unknown, label: string): string[] => {
  const values = unique(array(value, label).map((entry, index) => string(entry, `${label}[${index}]`)), label);
  const sorted = [...values].sort((left, right) => left.localeCompare(right));
  exact(values, sorted, `${label} canonical order`);
  return values;
};

export const assertSafeRepositoryPath = (value: unknown, label = "repository path"): string => {
  const path = string(value, label);
  if (path.includes("\\") || path.includes("\0") || path.startsWith("/") || path.endsWith("/") || path.split("/").some((part) => part === "" || part === "." || part === "..")) {
    fail(`${label} is not a safe repository-relative path.`);
  }
  return path;
};

const digest = (value: unknown, label: string): Digest => {
  const result = string(value, label);
  if (!DIGEST_PATTERN.test(result)) fail(`${label} must be a lowercase SHA-256 digest.`);
  return result as Digest;
};
const gitSha = (value: unknown, label: string): string => {
  const result = string(value, label);
  if (!SHA_PATTERN.test(result)) fail(`${label} must be a lowercase Git SHA.`);
  return result;
};
const handle = (value: unknown, label: string): string => {
  const result = string(value, label);
  if (result.normalize("NFC") !== result || !HANDLE_PATTERN.test(result)) fail(`${label} must be a bounded NFC ASCII handle.`);
  return result;
};

const parseBinding = (value: unknown, label: string): FileBinding => {
  const record = object(value, ["path", "byteLength", "sha256"], label);
  return {path: assertSafeRepositoryPath(record.path, `${label}.path`), byteLength: integer(record.byteLength, `${label}.byteLength`), sha256: digest(record.sha256, `${label}.sha256`)};
};

const parseBrowserExecutableBinding = (value: unknown, label: string): ExternalFileBinding => {
  const record = object(value, ["path", "byteLength", "sha256"], label);
  exact(record.path, BROWSER_EXECUTABLE, `${label}.path`);
  const byteLength = integer(record.byteLength, `${label}.byteLength`);
  if (byteLength === 0) fail(`${label}.byteLength must be positive.`);
  return {path: BROWSER_EXECUTABLE, byteLength, sha256: digest(record.sha256, `${label}.sha256`)};
};

const sha256 = (bytes: Uint8Array): Digest => `sha256:${createHash("sha256").update(bytes).digest("hex")}`;

const safeAbsolutePath = (root: string, repositoryPath: string): string => {
  const safe = assertSafeRepositoryPath(repositoryPath);
  const realRoot = realpathSync(root);
  const absolute = resolve(realRoot, safe);
  if (absolute !== realRoot && !absolute.startsWith(`${realRoot}${sep}`)) fail(`Path escapes repository root: ${safe}.`);
  let cursor = realRoot;
  for (const part of safe.split("/")) {
    cursor = resolve(cursor, part);
    const stat = lstatSync(cursor);
    if (stat.isSymbolicLink()) fail(`Symlink path is forbidden: ${safe}.`);
  }
  return absolute;
};

export const bindRepositoryFile = (root: string, path: string): FileBinding => {
  const safe = assertSafeRepositoryPath(path);
  const bytes = readFileSync(safeAbsolutePath(root, safe));
  return {path: safe, byteLength: bytes.byteLength, sha256: sha256(bytes)};
};

const verifyBinding = (root: string, binding: FileBinding, label: string) => exact(bindRepositoryFile(root, binding.path), binding, label);

const bindBrowserExecutable = (): ExternalFileBinding => {
  const stat = lstatSync(BROWSER_EXECUTABLE);
  if (stat.isSymbolicLink() || !stat.isFile()) fail("Browser executable must be a regular non-symlink file.");
  exact(realpathSync(BROWSER_EXECUTABLE), BROWSER_EXECUTABLE, "browser executable real path");
  const bytes = readFileSync(BROWSER_EXECUTABLE);
  return {path: BROWSER_EXECUTABLE, byteLength: bytes.byteLength, sha256: sha256(bytes)};
};

const duplicateJsonKeys = (fileName: string, source: string) => {
  const ts = loadTypeScriptRuntime();
  const parsed = ts.parseJsonText(fileName, source);
  const diagnostics = (parsed as tsTypes.JsonSourceFile & {parseDiagnostics?: readonly tsTypes.Diagnostic[]}).parseDiagnostics ?? [];
  if (diagnostics.length > 0) fail(`${fileName} is not valid strict JSON.`);
  const visit = (node: tsTypes.Node) => {
    if (ts.isObjectLiteralExpression(node)) {
      const names = new Set<string>();
      for (const property of node.properties) {
        if (!ts.isPropertyAssignment(property)) throw new Error(`${fileName} contains unsupported JSON syntax.`);
        const assignment: tsTypes.PropertyAssignment = property;
        const name = assignment.name;
        const key = ts.isStringLiteral(name) || ts.isNumericLiteral(name) || ts.isIdentifier(name) ? name.text : fail(`${fileName} contains a computed JSON key.`);
        if (names.has(key)) fail(`${fileName} contains duplicate JSON key ${key}.`);
        names.add(key);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(parsed);
};

export const parseStrictJson = (source: string, label = "JSON document"): unknown => {
  let value: unknown;
  try { value = JSON.parse(source) as unknown; } catch { return fail(`${label} is not strict JSON.`); }
  duplicateJsonKeys(label, source);
  return value;
};

const readStrictJson = (root: string, path: string): unknown => {
  const source = readFileSync(safeAbsolutePath(root, path), "utf8");
  return parseStrictJson(source, path);
};

export const parseBrowserProofCli = (argv: string[]): BrowserProofCli => {
  let runBase: string | null = null;
  let planPath: string | null = null;
  const seen = new Set<string>();
  for (const argument of argv) {
    const match = /^--([a-z-]+)=(.+)$/.exec(argument);
    if (match === null) throw new Error(`Unsupported browser-proof argument: ${argument}`);
    const key = match[1] ?? fail(`Missing browser-proof argument key: ${argument}`);
    const argumentValue = match[2] ?? fail(`Missing browser-proof argument value: ${argument}`);
    if (seen.has(key)) fail(`Duplicate browser-proof argument: ${argument}`);
    seen.add(key);
    if (key === "run-base") runBase = gitSha(argumentValue, "--run-base");
    else if (key === "plan") planPath = assertSafeRepositoryPath(argumentValue, "--plan");
    else fail(`Unsupported browser-proof argument: ${argument}`);
  }
  if (runBase !== null && planPath !== null) fail("--run-base cannot be combined with --plan.");
  return planPath === null ? {mode: "legacy", runBase} : {mode: "extension", planPath};
};

const PLAN_SCHEMA_PATH = "scripts/fixtures/spec0001-browser/v2/tester-extension-plan.schema.json";
const REGISTRY_SCHEMA_PATH = "scripts/fixtures/spec0001-browser/v2/tester-extension-registry.schema.json";
const RESULT_SCHEMA_PATH = "scripts/fixtures/spec0001-browser/v2/tester-extension-result.schema.json";
const PHASE2_PLAN_PATH = "scripts/fixtures/stick-ai/v1/phase-2-browser-proof-plan.json";
const PHASE2_REGISTRY_PATH = "scripts/fixtures/spec0001-browser/v1/phase-2-action-registry.json";
const PHASE2_ADAPTER_PATH = "scripts/spec0001-browser/actions/phase2.ts";

const parseCatalogFile = (value: unknown, label: string, expected: {path: string; schemaPath: string; versionKey: "planVersion" | "registryVersion"; version: 2}, materialized: boolean) => {
  const keys = materialized ? ["path", "schemaPath", expected.versionKey, "byteLength", "sha256"] : ["path", "schemaPath", expected.versionKey];
  const record = object(value, keys, label);
  exact(assertSafeRepositoryPath(record.path, `${label}.path`), expected.path, `${label}.path`);
  exact(assertSafeRepositoryPath(record.schemaPath, `${label}.schemaPath`), expected.schemaPath, `${label}.schemaPath`);
  exact(record[expected.versionKey], expected.version, `${label}.${expected.versionKey}`);
  return {
    path: expected.path,
    schemaPath: expected.schemaPath,
    [expected.versionKey]: expected.version,
    ...(materialized ? {byteLength: integer(record.byteLength, `${label}.byteLength`), sha256: digest(record.sha256, `${label}.sha256`)} : {}),
  } as ValidatedAuthorization["plan"] | ValidatedAuthorization["registry"];
};

const parseCatalogAdapter = (value: unknown, expectedPath: string, materialized: boolean) => {
  const keys = materialized ? ["path", "grammarId", "declarationVersion", "byteLength", "sha256"] : ["path", "grammarId", "declarationVersion"];
  const record = object(value, keys, "authorization.adapter");
  exact(assertSafeRepositoryPath(record.path), expectedPath, "authorization.adapter.path");
  exact(record.grammarId, "spec0001-browser-adapter-declaration/v1", "authorization.adapter.grammarId");
  exact(record.declarationVersion, 1, "authorization.adapter.declarationVersion");
  return {
    path: expectedPath,
    grammarId: "spec0001-browser-adapter-declaration/v1" as const,
    declarationVersion: 1 as const,
    ...(materialized ? {byteLength: integer(record.byteLength, "authorization.adapter.byteLength"), sha256: digest(record.sha256, "authorization.adapter.sha256")} : {}),
  };
};

const parseAuthorization = (value: unknown, expectedId: AuthorizationId): ValidatedAuthorization => {
  const record = object(value, ["authorizationId", "proofPurpose", "materializationKind", "plan", "registry", "adapter", "resultSchema", "operationFamilies", "outputRoot", "pathCeiling"], `authorization ${expectedId}`);
  exact(record.authorizationId, expectedId, "authorizationId");
  const synthetic = expectedId === "phase-1.5-compatibility-synthetic/v1";
  const materialized = synthetic;
  exact(record.proofPurpose, synthetic ? "phase-1.5-compatibility-synthetic" : "phase-2", "authorization.proofPurpose");
  exact(record.materializationKind, materialized ? "materialized" : "deferred", "authorization.materializationKind");
  const planPath = synthetic ? COMPATIBILITY_PLAN_PATH : PHASE2_PLAN_PATH;
  const registryPath = synthetic ? COMPATIBILITY_REGISTRY_PATH : PHASE2_REGISTRY_PATH;
  const adapterPath = synthetic ? COMPATIBILITY_ADAPTER_PATH : PHASE2_ADAPTER_PATH;
  const plan = parseCatalogFile(record.plan, "authorization.plan", {path: planPath, schemaPath: PLAN_SCHEMA_PATH, versionKey: "planVersion", version: 2}, materialized) as ValidatedAuthorization["plan"];
  const registry = parseCatalogFile(record.registry, "authorization.registry", {path: registryPath, schemaPath: REGISTRY_SCHEMA_PATH, versionKey: "registryVersion", version: 2}, materialized) as ValidatedAuthorization["registry"];
  const adapter = parseCatalogAdapter(record.adapter, adapterPath, materialized);
  const resultSchemaRecord = object(record.resultSchema, ["path", "resultVersion"], "authorization.resultSchema");
  exact(resultSchemaRecord.path, RESULT_SCHEMA_PATH, "authorization.resultSchema.path");
  exact(resultSchemaRecord.resultVersion, 2, "authorization.resultSchema.resultVersion");
  const operationFamilies = canonicalStrings(record.operationFamilies, "authorization.operationFamilies").map((entry) => enumeration(entry, OPERATION_FAMILIES, "authorization operation family"));
  exact(operationFamilies, [...OPERATION_FAMILIES], "authorization operation families");
  const outputRoot = assertSafeRepositoryPath(record.outputRoot, "authorization.outputRoot");
  exact(outputRoot, synthetic ? COMPATIBILITY_OUTPUT_ROOT : "output/spec-0001/phase-2-ui-restoration-correction", "authorization.outputRoot");
  const pathCeiling = canonicalStrings(record.pathCeiling, "authorization.pathCeiling").map((path) => assertSafeRepositoryPath(path));
  exact(pathCeiling, synthetic ? [...CORRECTION_PATHS] : [...PHASE2_PATHS], "authorization.pathCeiling");
  return {
    authorizationId: expectedId,
    proofPurpose: synthetic ? "phase-1.5-compatibility-synthetic" : "phase-2",
    materializationKind: materialized ? "materialized" : "deferred",
    plan,
    registry,
    adapter,
    resultSchema: {path: RESULT_SCHEMA_PATH, resultVersion: 2},
    operationFamilies,
    outputRoot,
    pathCeiling,
  };
};

export const validateAuthorizationCatalogValue = (value: unknown): ValidatedAuthorizationCatalog => {
  const record = object(value, ["catalogVersion", "specId", "authorizations"], "tester extension authorization catalog");
  exact(record.catalogVersion, 1, "catalogVersion");
  exact(record.specId, "SPEC-0001", "catalog specId");
  const authorizations = array(record.authorizations, "catalog authorizations");
  exact(authorizations.length, 2, "catalog authorization count");
  return {
    catalogVersion: 1,
    specId: "SPEC-0001",
    authorizations: [
      parseAuthorization(authorizations[0], "phase-1.5-compatibility-synthetic/v1"),
      parseAuthorization(authorizations[1], "phase-2/v1"),
    ],
  };
};

const parseOperationFamilies = (value: unknown, label: string): OperationFamily[] => {
  const values = canonicalStrings(value, label).map((entry) => enumeration(entry, OPERATION_FAMILIES, `${label} entry`));
  exact(values, [...OPERATION_FAMILIES], label);
  return values;
};

const parseRegressionGroups = (value: unknown, label: string): ProtectedRegressionGroup[] => {
  const accepted = ["drawing-generate-frames", "drawing-undo-redo-play-pause", "home-new-drawing", "home-new-stick", "stick-creator-back"] as const;
  return canonicalStrings(value, label).map((entry) => enumeration(entry, accepted, `${label} entry`));
};

export const validateExtensionPlanValue = (value: unknown): ExtensionPlan => {
  const record = object(value, ["planVersion", "specId", "proofPurpose", "authorizationId", "baseCommit", "dirtyExpectedPaths", "cleanExpectedPaths", "outputRoot", "operationFamilies", "registry", "contexts", "steps", "evidence"], "extension plan");
  exact(record.planVersion, 2, "planVersion");
  exact(record.specId, "SPEC-0001", "plan specId");
  const authorizationId = enumeration(record.authorizationId, ["phase-1.5-compatibility-synthetic/v1", "phase-2/v1"] as const, "plan authorizationId");
  const synthetic = authorizationId === "phase-1.5-compatibility-synthetic/v1";
  const proofPurpose = synthetic ? "phase-1.5-compatibility-synthetic" : "phase-2";
  exact(record.proofPurpose, proofPurpose, "plan proofPurpose");
  const baseCommit = gitSha(record.baseCommit, "plan baseCommit");
  if (synthetic) exact(baseCommit, CORRECTION_BASE_COMMIT, "correction baseCommit");
  const dirtyExpectedPaths = canonicalStrings(record.dirtyExpectedPaths, "plan dirtyExpectedPaths").map((path) => assertSafeRepositoryPath(path));
  if (synthetic) exact(dirtyExpectedPaths, [...CORRECTION_PATHS], "correction dirtyExpectedPaths");
  else {
    if (dirtyExpectedPaths.length === 0) fail("Phase 2 dirtyExpectedPaths must be nonempty.");
    if (!dirtyExpectedPaths.includes(PHASE2_PLAN_PATH) || !dirtyExpectedPaths.includes(PHASE2_REGISTRY_PATH) || !dirtyExpectedPaths.includes(PHASE2_ADAPTER_PATH)) fail("Phase 2 dirtyExpectedPaths must include its plan, registry, and adapter.");
    for (const path of dirtyExpectedPaths) if (!(PHASE2_PATHS as readonly string[]).includes(path)) fail(`Unauthorized Phase 2 dirty path: ${path}.`);
  }
  exact(record.cleanExpectedPaths, [], "plan cleanExpectedPaths");
  const outputRoot = assertSafeRepositoryPath(record.outputRoot, "plan outputRoot");
  exact(outputRoot, synthetic ? COMPATIBILITY_OUTPUT_ROOT : "output/spec-0001/phase-2-ui-restoration-correction", "plan outputRoot");
  const operationFamilies = parseOperationFamilies(record.operationFamilies, "plan operationFamilies");
  const registry = parseBinding(record.registry, "plan registry binding");
  exact(registry.path, synthetic ? COMPATIBILITY_REGISTRY_PATH : PHASE2_REGISTRY_PATH, "plan registry path");
  const contexts = array(record.contexts, "plan contexts").map((entry, index) => {
    const context = object(entry, ["contextId", "viewport"], `plan contexts[${index}]`);
    const viewport = object(context.viewport, ["width", "height"], `plan contexts[${index}].viewport`);
    const width: 1024 | 1440 = viewport.width === 1024 || viewport.width === 1440 ? viewport.width : fail("viewport width is invalid.");
    const height: 768 | 900 = viewport.height === 768 || viewport.height === 900 ? viewport.height : fail("viewport height is invalid.");
    if ((width === 1024 && height !== 768) || (width === 1440 && height !== 900)) fail("Unsupported viewport pair.");
    return {contextId: handle(context.contextId, "contextId"), viewport: {width, height}};
  });
  unique(contexts.map((entry) => entry.contextId), "plan context IDs");
  if (contexts.length === 0) fail("Plan must contain at least one context.");
  const steps = array(record.steps, "plan steps").map((entry, index) => {
    const step = object(entry, ["stepId", "actionId", "contextId"], `plan steps[${index}]`);
    const result = {stepId: handle(step.stepId, "stepId"), actionId: handle(step.actionId, "actionId"), contextId: handle(step.contextId, "step contextId")};
    if (!contexts.some((context) => context.contextId === result.contextId)) fail(`Unknown step context ${result.contextId}.`);
    return result;
  });
  unique(steps.map((entry) => entry.stepId), "plan step IDs");
  if (steps.length === 0) fail("Plan must contain at least one step.");
  const evidenceRecord = object(record.evidence, ["ledgerKinds", "screenshotIds", "protectedRegressionGroups", "productPhaseClaimed"], "plan evidence");
  const ledgerKinds = canonicalStrings(evidenceRecord.ledgerKinds, "plan ledgerKinds").map((entry) => enumeration(entry, ["action", "negative", "checkpoint", "storage", "request", "network", "console", "regression", "cleanup"] as const, "ledger kind"));
  const screenshotIds = canonicalStrings(evidenceRecord.screenshotIds, "plan screenshotIds").map((entry) => handle(entry, "screenshotId"));
  const protectedRegressionGroups = parseRegressionGroups(evidenceRecord.protectedRegressionGroups, "plan protectedRegressionGroups");
  const productPhaseClaimed = typeof evidenceRecord.productPhaseClaimed === "boolean" ? evidenceRecord.productPhaseClaimed : fail("plan productPhaseClaimed must be boolean.");
  if (productPhaseClaimed !== !synthetic) fail("plan productPhaseClaimed mismatch.");
  return {planVersion: 2, specId: "SPEC-0001", proofPurpose, authorizationId, baseCommit, dirtyExpectedPaths, cleanExpectedPaths: [], outputRoot, operationFamilies, registry, contexts, steps, evidence: {ledgerKinds, screenshotIds, protectedRegressionGroups, productPhaseClaimed}};
};

const DRIVER_OPERATIONS = ["mountDocument", "dispatchCompletedJointEdit", "beginDocumentPublication", "completeDocumentPublication", "readCheckpoint"] as const;
const ENVIRONMENT_OPERATIONS = ["installEnvironmentPlan", "releaseEnvironmentGate", "readEnvironmentCheckpoint", "clearEnvironmentPlan"] as const;
const FIXTURE_KINDS = [
  "stick-browser-environment-gate-release-v1", "stick-browser-environment-plan-v1", "stick-completed-joint-edit-v1",
  "stick-document-publication-completion-v1", "stick-document-publication-plan-v1", "stick-workspace-document-mount-v1",
] as const;
const DRIVER_FIXTURE_KINDS: Record<typeof DRIVER_OPERATIONS[number], readonly string[]> = {
  mountDocument: ["stick-workspace-document-mount-v1"],
  dispatchCompletedJointEdit: ["stick-completed-joint-edit-v1"],
  beginDocumentPublication: ["stick-document-publication-plan-v1"],
  completeDocumentPublication: ["stick-document-publication-completion-v1"],
  readCheckpoint: [],
};
const ENVIRONMENT_FIXTURE_KINDS: Record<typeof ENVIRONMENT_OPERATIONS[number], readonly string[]> = {
  installEnvironmentPlan: ["stick-browser-environment-plan-v1"],
  releaseEnvironmentGate: ["stick-browser-environment-gate-release-v1"],
  readEnvironmentCheckpoint: [],
  clearEnvironmentPlan: [],
};
const PHASE2_READABLE_FIXTURE_PATHS = [
  "scripts/fixtures/stick-ai/v1/fresh-stick-project.json",
  "scripts/fixtures/stick-ai/v1/manual-wave-actions.json",
  "scripts/fixtures/stick-ai/v1/manual-wave-applied-project.json",
  "scripts/fixtures/stick-ai/v1/stick-control-disposition-cases.json",
  "scripts/fixtures/stick-ai/v1/stick-correction-affordance-cases.json",
  "scripts/fixtures/stick-ai/v1/stick-document-publication-race-cases.json",
  "scripts/fixtures/stick-ai/v1/stick-gesture-cases.json",
  "scripts/fixtures/stick-ai/v1/stick-manual-wave-build-cases.json",
  "scripts/fixtures/stick-ai/v1/stick-pose-aliasing-cases.json",
  "scripts/fixtures/stick-ai/v1/wave-any-joint-corrections.json",
  "scripts/fixtures/stick-ai/v1/wave-applied-project.json",
  "scripts/fixtures/stick-ai/v1/wave-cell-resolution.json",
] as const;

const parseInput = (value: unknown): null | {text: string} | {key: "Enter" | "Escape" | "Space"} => {
  if (value === null) return null;
  if (!isRecord(value)) throw new Error("visible-role input must be null or an object.");
  const record: JsonRecord = value;
  if (Object.keys(record).length !== 1) fail("visible-role input must have exactly one field.");
  if ("text" in record) return {text: string(record.text, "visible-role input text")};
  if ("key" in record) return {key: enumeration(record.key, ["Enter", "Escape", "Space"] as const, "visible-role input key")};
  return fail("visible-role input field is invalid.");
};

const parseAction = (value: unknown, index: number): NormalizedAction => {
  if (!isRecord(value)) throw new Error(`registry actions[${index}] must be an object.`);
  const actionValue: JsonRecord = value;
  const family = enumeration(actionValue.family, OPERATION_FAMILIES, `registry actions[${index}].family`);
  const actionId = handle(actionValue.actionId, `registry actions[${index}].actionId`);
  if (family === "visible-role") {
    const record = object(actionValue, ["actionId", "family", "operation", "role", "accessibleName", "input"], `visible-role action ${actionId}`);
    return {actionId, family, operation: enumeration(record.operation, ["click", "fill", "press", "assert-visible", "assert-hidden", "assert-enabled", "assert-disabled"] as const, "visible-role operation"), role: handle(record.role, "visible-role role"), accessibleName: string(record.accessibleName, "visible-role accessibleName"), input: parseInput(record.input)};
  }
  if (family === "visible-testid") {
    const record = object(actionValue, ["actionId", "family", "operation", "testId"], `visible-testid action ${actionId}`);
    return {actionId, family, operation: enumeration(record.operation, ["click", "assert-visible", "assert-enabled", "assert-disabled"] as const, "visible-testid operation"), testId: handle(record.testId, "visible-testid testId")};
  }
  if (family === "pointer") {
    const record = object(actionValue, ["actionId", "family", "operation", "targetId", "pointerId", "button", "point", "expectedEvidenceDigest"], `pointer action ${actionId}`);
    const point = object(record.point, ["x", "y"], "pointer point");
    exact(record.button, 0, "pointer button");
    return {actionId, family, operation: enumeration(record.operation, ["down", "move", "up", "cancel"] as const, "pointer operation"), targetId: handle(record.targetId, "pointer targetId"), pointerId: integer(record.pointerId, "pointer pointerId"), button: 0, point: {x: integer(point.x, "pointer x"), y: integer(point.y, "pointer y")}, expectedEvidenceDigest: digest(record.expectedEvidenceDigest, "pointer expectedEvidenceDigest")};
  }
  if (family === "workspace-driver") {
    const record = object(actionValue, ["actionId", "family", "operation", "fixtureId", "operationId", "expectedEvidenceDigest"], `workspace-driver action ${actionId}`);
    return {actionId, family, operation: enumeration(record.operation, DRIVER_OPERATIONS, "workspace-driver operation"), fixtureId: record.fixtureId === null ? null : handle(record.fixtureId, "workspace-driver fixtureId"), operationId: handle(record.operationId, "workspace-driver operationId"), expectedEvidenceDigest: digest(record.expectedEvidenceDigest, "workspace-driver expectedEvidenceDigest")};
  }
  if (family === "runner-environment") {
    const record = object(actionValue, ["actionId", "family", "operation", "fixtureId", "operationId", "expectedEvidenceDigest"], `runner-environment action ${actionId}`);
    return {actionId, family, operation: enumeration(record.operation, ENVIRONMENT_OPERATIONS, "runner-environment operation"), fixtureId: record.fixtureId === null ? null : handle(record.fixtureId, "runner-environment fixtureId"), operationId: handle(record.operationId, "runner-environment operationId"), expectedEvidenceDigest: digest(record.expectedEvidenceDigest, "runner-environment expectedEvidenceDigest")};
  }
  if (family === "checkpoint") {
    const record = object(actionValue, ["actionId", "family", "channel", "checkpointId", "expectedEvidenceDigest"], `checkpoint action ${actionId}`);
    return {actionId, family, channel: enumeration(record.channel, ["workspace-driver", "runner-environment"] as const, "checkpoint channel"), checkpointId: handle(record.checkpointId, "checkpointId"), expectedEvidenceDigest: digest(record.expectedEvidenceDigest, "checkpoint expectedEvidenceDigest")};
  }
  if (family === "screenshot") {
    const record = object(actionValue, ["actionId", "family", "screenshotId"], `screenshot action ${actionId}`);
    return {actionId, family, screenshotId: handle(record.screenshotId, "screenshotId")};
  }
  if (family === "protected-regression") {
    const record = object(actionValue, ["actionId", "family", "group"], `protected-regression action ${actionId}`);
    return {actionId, family, group: parseRegressionGroups([record.group], "protected regression group")[0]};
  }
  return fail(`Operation family ${family} is not directly actionable.`);
};

export const validateExtensionRegistryValue = (value: unknown): ExtensionRegistry => {
  const record = object(value, ["registryVersion", "specId", "authorizationId", "operationFamilies", "adapter", "fixtures", "actions"], "extension registry");
  exact(record.registryVersion, 2, "registryVersion");
  exact(record.specId, "SPEC-0001", "registry specId");
  const authorizationId = enumeration(record.authorizationId, ["phase-1.5-compatibility-synthetic/v1", "phase-2/v1"] as const, "registry authorizationId");
  const operationFamilies = parseOperationFamilies(record.operationFamilies, "registry operationFamilies");
  const adapter = parseBinding(record.adapter, "registry adapter binding");
  exact(adapter.path, authorizationId === "phase-1.5-compatibility-synthetic/v1" ? COMPATIBILITY_ADAPTER_PATH : PHASE2_ADAPTER_PATH, "registry adapter path");
  const fixtures = array(record.fixtures, "registry fixtures").map((entry, index): ExtensionRegistry["fixtures"][number] => {
    if (!isRecord(entry)) throw new Error(`registry fixtures[${index}] must be an object.`);
    const fixtureValue: JsonRecord = entry;
    const sourceKind = enumeration(fixtureValue.sourceKind, ["adapter-built-in", "repository-json"] as const, "fixture sourceKind");
    const fixture = object(fixtureValue, sourceKind === "adapter-built-in" ? ["fixtureId", "fixtureKind", "sourceKind", "expectedFixtureDigest"] : ["fixtureId", "fixtureKind", "sourceKind", "binding", "expectedFixtureDigest"], `registry fixtures[${index}]`);
    const fixtureId = handle(fixture.fixtureId, "fixtureId");
    const fixtureKind = enumeration(fixture.fixtureKind, FIXTURE_KINDS, "fixtureKind");
    const expectedFixtureDigest = digest(fixture.expectedFixtureDigest, "expectedFixtureDigest");
    if (sourceKind === "adapter-built-in") {
      const syntheticFixtureDigests: Readonly<Record<string, Digest>> = {
        "synthetic-environment-plan": "sha256:9736d7bc6612adf2474772037c4ff02352fce6b2f0cd708f9f47ef9449d8fba3",
        "synthetic-gate-release": "sha256:49080f0adeaf24ae4e32cab32b7173e6ad29f0066530a894fda237529b35b595",
        "synthetic-joint-edit": "sha256:62946809dfb4bd8f7e4fead629e994ef4870d78d70087409954a3d59d5e9bbd1",
        "synthetic-publication-completion": "sha256:8a679641bb30e17a4fbc7ec2937fbf4f58d0ec1862c4b9304947a6fa2c1dee3d",
        "synthetic-publication-plan": "sha256:ca2c0458c54ef6fd88ffa34bd203dc721e0f6f2594420381b5a4b2c91693c36f",
        "synthetic-wave-document": "sha256:b412a05aca94327c04b0cfd4945469b4d8f8c5b5b3385139b680ac3491795475",
      };
      const trustedDigest = syntheticFixtureDigests[fixtureId] ?? fail(`Unknown built-in synthetic fixture: ${fixtureId}`);
      exact(expectedFixtureDigest, trustedDigest, `built-in fixture digest ${fixtureId}`);
      return {fixtureId, fixtureKind, sourceKind, expectedFixtureDigest};
    }
    const binding = parseBinding(fixture.binding, `fixture ${fixtureId} binding`);
    exact(expectedFixtureDigest, binding.sha256, `repository fixture digest ${fixtureId}`);
    return {fixtureId, fixtureKind, sourceKind, binding, expectedFixtureDigest};
  });
  unique(fixtures.map((entry) => entry.fixtureId), "registry fixture IDs");
  const actions = array(record.actions, "registry actions").map(parseAction);
  unique(actions.map((entry) => entry.actionId), "registry action IDs");
  if (actions.length === 0) fail("Registry must contain at least one action.");
  const fixtureIds = new Set(fixtures.map((fixture) => fixture.fixtureId));
  for (const action of actions) if ((action.family === "workspace-driver" || action.family === "runner-environment") && action.fixtureId !== null && !fixtureIds.has(action.fixtureId)) fail(`Action ${action.actionId} references unknown fixture ${action.fixtureId}.`);
  return {registryVersion: 2, specId: "SPEC-0001", authorizationId, operationFamilies, adapter, fixtures, actions};
};

const adapterLiteral = (expression: tsTypes.Expression, label: string): unknown => {
  const ts = loadTypeScriptRuntime();
  if (ts.isStringLiteral(expression) || ts.isNoSubstitutionTemplateLiteral(expression)) return expression.text;
  if (ts.isNumericLiteral(expression)) return Number(expression.text);
  if (expression.kind === ts.SyntaxKind.TrueKeyword) return true;
  if (expression.kind === ts.SyntaxKind.FalseKeyword) return false;
  if (expression.kind === ts.SyntaxKind.NullKeyword) return null;
  if (ts.isArrayLiteralExpression(expression)) return expression.elements.map((entry, index) => adapterLiteral(entry, `${label}[${index}]`));
  if (ts.isObjectLiteralExpression(expression)) {
    const result: JsonRecord = {};
    for (const property of expression.properties) {
      if (!ts.isPropertyAssignment(property)) throw new Error(`${label} permits property assignments only.`);
      const assignment: tsTypes.PropertyAssignment = property;
      const name = assignment.name;
      const key = ts.isIdentifier(name) || ts.isStringLiteral(name) ? name.text : fail(`${label} contains a computed or unsupported property name.`);
      if (key === "__proto__" || key === "prototype" || key === "constructor") fail(`${label} contains forbidden prototype key ${key}.`);
      if (Object.hasOwn(result, key)) fail(`${label} contains duplicate property ${key}.`);
      result[key] = adapterLiteral(assignment.initializer, `${label}.${key}`);
    }
    return result;
  }
  return fail(`${label} contains forbidden executable or unknown syntax (${ts.SyntaxKind[expression.kind]}).`);
};

const validateAdapterValue = (value: unknown): AdapterDeclaration => {
  const record = object(value, ["declarationVersion", "adapterId", "authorizationId", "adapterKind", "executionProfile", "workspacePortBinding", "productPhaseClaimed", "driverOperations", "environmentOperations", "pointerTargets", "checkpointKinds"], "adapter declaration");
  exact(record.declarationVersion, 1, "adapter declarationVersion");
  const authorizationId = enumeration(record.authorizationId, ["phase-1.5-compatibility-synthetic/v1", "phase-2/v1"] as const, "adapter authorizationId");
  const synthetic = authorizationId === "phase-1.5-compatibility-synthetic/v1";
  const adapterKind = enumeration(record.adapterKind, ["in-memory-phase2-shaped-synthetic/v1", "phase-2-product-ports/v1"] as const, "adapterKind");
  exact(adapterKind, synthetic ? "in-memory-phase2-shaped-synthetic/v1" : "phase-2-product-ports/v1", "adapterKind/authorization binding");
  const executionProfile = enumeration(record.executionProfile, ["synthetic-state-machine/v1", "phase2-workspace-ports/v1"] as const, "adapter executionProfile");
  exact(executionProfile, synthetic ? "synthetic-state-machine/v1" : "phase2-workspace-ports/v1", "adapter execution profile");
  const workspacePortBinding = record.workspacePortBinding === null ? null : enumeration(record.workspacePortBinding, ["spec0001Phase2BrowserPortsV1"] as const, "adapter workspacePortBinding");
  exact(workspacePortBinding, synthetic ? null : "spec0001Phase2BrowserPortsV1", "adapter workspace port binding");
  const productPhaseClaimed = typeof record.productPhaseClaimed === "boolean" ? record.productPhaseClaimed : fail("adapter productPhaseClaimed must be boolean.");
  if (productPhaseClaimed !== !synthetic) fail("adapter productPhaseClaimed mismatch.");
  const parsePorts = (portsValue: unknown, operations: readonly string[], label: string) => array(portsValue, label).map((entry, index) => {
    const port = object(entry, ["operation", "fixtureKinds"], `${label}[${index}]`);
    const operation = enumeration(port.operation, operations, `${label} operation`);
    const fixtureKinds = canonicalStrings(port.fixtureKinds, `${label} fixtureKinds`).map((kind) => enumeration(kind, FIXTURE_KINDS, `${label} fixture kind`));
    return {operation, fixtureKinds};
  });
  const driverOperations = parsePorts(record.driverOperations, DRIVER_OPERATIONS, "adapter driverOperations");
  const environmentOperations = parsePorts(record.environmentOperations, ENVIRONMENT_OPERATIONS, "adapter environmentOperations");
  unique(driverOperations.map((entry) => entry.operation), "adapter driver operations");
  unique(environmentOperations.map((entry) => entry.operation), "adapter environment operations");
  exact([...driverOperations.map((entry) => entry.operation)].sort(), [...DRIVER_OPERATIONS].sort(), "adapter driver operation set");
  exact([...environmentOperations.map((entry) => entry.operation)].sort(), [...ENVIRONMENT_OPERATIONS].sort(), "adapter environment operation set");
  for (const entry of driverOperations) exact(entry.fixtureKinds, DRIVER_FIXTURE_KINDS[entry.operation as typeof DRIVER_OPERATIONS[number]], `adapter fixture kinds for ${entry.operation}`);
  for (const entry of environmentOperations) exact(entry.fixtureKinds, ENVIRONMENT_FIXTURE_KINDS[entry.operation as typeof ENVIRONMENT_OPERATIONS[number]], `adapter fixture kinds for ${entry.operation}`);
  const pointerTargets = array(record.pointerTargets, "adapter pointerTargets").map((entry, index) => {
    const target = object(entry, ["targetId", "targetKind"], `adapter pointerTargets[${index}]`);
    exact(target.targetKind, "authorized-canvas", "pointer target kind");
    return {targetId: handle(target.targetId, "pointer targetId"), targetKind: "authorized-canvas" as const};
  });
  unique(pointerTargets.map((entry) => entry.targetId), "adapter pointer targets");
  const checkpointKinds = canonicalStrings(record.checkpointKinds, "adapter checkpointKinds").map((entry) => enumeration(entry, ["workspace", "environment"] as const, "checkpoint kind"));
  return {declarationVersion: 1, adapterId: handle(record.adapterId, "adapterId"), authorizationId, adapterKind, executionProfile, workspacePortBinding, productPhaseClaimed, driverOperations, environmentOperations, pointerTargets, checkpointKinds};
};

export const parseAdapterDeclarationSource = (source: string, fileName = "browser adapter declaration"): AdapterDeclaration => {
  const ts = loadTypeScriptRuntime();
  const scanner = ts.createScanner(ts.ScriptTarget.Latest, false, ts.LanguageVariant.Standard, source);
  for (let token = scanner.scan(); token !== ts.SyntaxKind.EndOfFileToken; token = scanner.scan()) {
    if (token === ts.SyntaxKind.SingleLineCommentTrivia || token === ts.SyntaxKind.MultiLineCommentTrivia || token === ts.SyntaxKind.ShebangTrivia) fail(`${fileName} comments and shebangs are forbidden.`);
  }
  const parsed = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const diagnostics = (parsed as tsTypes.SourceFile & {parseDiagnostics?: readonly tsTypes.Diagnostic[]}).parseDiagnostics ?? [];
  if (diagnostics.length > 0) fail(`${fileName} contains TypeScript parse diagnostics.`);
  const statement = parsed.statements[0];
  if (parsed.statements.length !== 1 || statement === undefined || !ts.isExportAssignment(statement) || statement.isExportEquals) throw new Error(`${fileName} must contain exactly one default export declaration.`);
  const exported = statement.expression;
  if (!ts.isAsExpression(exported) || exported.type.getText(parsed) !== "const") throw new Error(`${fileName} must default-export one object literal using 'as const'.`);
  const literal = exported.expression;
  if (!ts.isObjectLiteralExpression(literal)) throw new Error(`${fileName} must export a literal object.`);
  return validateAdapterValue(adapterLiteral(literal, "adapter"));
};

const gitBuffer = (root: string, argv: string[], acceptedStatuses: readonly number[] = [0]): Buffer => {
  const env = {} as NodeJS.ProcessEnv;
  for (const key of ["PATH", "TMPDIR", "TEMP", "TMP", "LANG", "LC_ALL", "HOME", "USER", "LOGNAME"]) if (process.env[key]) env[key] = process.env[key];
  env.GIT_CONFIG_NOSYSTEM = "1";
  env.GIT_CONFIG_GLOBAL = "/dev/null";
  env.GIT_OPTIONAL_LOCKS = "0";
  const result = spawnSync("/usr/bin/git", argv, {cwd: root, encoding: "buffer", shell: false, maxBuffer: 16 * 1024 * 1024, env});
  const status = result.status ?? 255;
  if (!acceptedStatuses.includes(status)) fail(Buffer.from(result.stderr ?? []).toString("utf8") || `git ${argv.join(" ")} failed.`);
  return Buffer.from(result.stdout ?? []);
};
const gitText = (root: string, argv: string[], acceptedStatuses: readonly number[] = [0]) => gitBuffer(root, argv, acceptedStatuses).toString("utf8").trim();
const nulList = (bytes: Buffer): string[] => bytes.toString("utf8").split("\0").filter(Boolean);

export const compareIndexToHeadEntries = (indexBytes: Buffer, headBytes: Buffer): string[] => {
  const grouped = (records: string[], label: "index" | "HEAD") => {
    const entries = new Map<string, string[]>();
    for (const record of records) {
      const separator = record.indexOf("\t");
      if (separator < 1) fail(`${label} entry is malformed.`);
      const metadata = record.slice(0, separator).split(" ");
      const path = assertSafeRepositoryPath(record.slice(separator + 1), `${label} entry path`);
      if (label === "index") {
        if (metadata.length !== 3 || !/^[0-7]{6}$/.test(metadata[0]) || !/^[0-9a-f]{40,64}$/.test(metadata[1]) || !/^[0-3]$/.test(metadata[2])) fail("Index entry metadata is malformed.");
        const values = entries.get(path) ?? [];
        values.push(`${metadata[0]} ${metadata[1]} ${metadata[2]}`);
        entries.set(path, values);
      } else {
        if (metadata.length !== 3 || !/^[0-7]{6}$/.test(metadata[0]) || !/^(?:blob|commit)$/.test(metadata[1]) || !/^[0-9a-f]{40,64}$/.test(metadata[2])) fail("HEAD tree entry metadata is malformed.");
        if (entries.has(path)) fail(`HEAD tree contains a duplicate path: ${path}`);
        entries.set(path, [`${metadata[0]} ${metadata[2]} 0`]);
      }
    }
    for (const values of entries.values()) values.sort((left, right) => left.localeCompare(right));
    return entries;
  };
  const index = grouped(nulList(indexBytes), "index");
  const head = grouped(nulList(headBytes), "HEAD");
  return [...new Set([...index.keys(), ...head.keys()])]
    .filter((path) => JSON.stringify(index.get(path) ?? []) !== JSON.stringify(head.get(path) ?? []))
    .sort((left, right) => left.localeCompare(right));
};

export type GitObservationOverride = {
  headCommit: string;
  stagedPaths: string[];
  hiddenIndexPaths: string[];
  trackedDirtyPaths: string[];
  untrackedPaths: string[];
  baseIsStrictAncestor: boolean;
  committedChangedPaths: string[];
};

export type ExtensionValidationMode = "technical" | "phase-2-closeout";

const validateObservationOverride = (value: GitObservationOverride): GitObservationOverride => ({
  headCommit: gitSha(value.headCommit, "observation headCommit"),
  stagedPaths: canonicalStrings(value.stagedPaths, "observation stagedPaths").map((entry) => assertSafeRepositoryPath(entry)),
  hiddenIndexPaths: canonicalStrings(value.hiddenIndexPaths, "observation hiddenIndexPaths").map((entry) => assertSafeRepositoryPath(entry)),
  trackedDirtyPaths: canonicalStrings(value.trackedDirtyPaths, "observation trackedDirtyPaths").map((entry) => assertSafeRepositoryPath(entry)),
  untrackedPaths: canonicalStrings(value.untrackedPaths, "observation untrackedPaths").map((entry) => assertSafeRepositoryPath(entry)),
  baseIsStrictAncestor: typeof value.baseIsStrictAncestor === "boolean" ? value.baseIsStrictAncestor : fail("observation baseIsStrictAncestor must be boolean."),
  committedChangedPaths: canonicalStrings(value.committedChangedPaths, "observation committedChangedPaths").map((entry) => assertSafeRepositoryPath(entry)),
});

const observeGit = (root: string, baseCommit: string): GitObservationOverride => {
  const headCommit = gitSha(gitText(root, ["rev-parse", "HEAD"]), "HEAD");
  const indexMismatchPaths = compareIndexToHeadEntries(
    gitBuffer(root, ["ls-files", "--stage", "-z"]),
    gitBuffer(root, ["ls-tree", "-r", "--full-tree", "-z", "HEAD"]),
  );
  const stagedPaths = [...new Set([...nulList(gitBuffer(root, ["diff", "--cached", "--name-only", "-z"])), ...indexMismatchPaths])].sort((left, right) => left.localeCompare(right));
  const trackedDirtyPaths = [...new Set(nulList(gitBuffer(root, ["diff", "--name-only", "-z"])))].sort((left, right) => left.localeCompare(right));
  const untrackedPaths = [...new Set(nulList(gitBuffer(root, ["ls-files", "--others", "--exclude-standard", "-z"])))].sort((left, right) => left.localeCompare(right));
  const hiddenIndexPaths = nulList(gitBuffer(root, ["ls-files", "-v", "-z"]))
    .filter((entry) => entry.length > 2 && (entry[0] === "S" || entry[0] === entry[0].toLowerCase()))
    .map((entry) => entry.slice(2))
    .sort((left, right) => left.localeCompare(right));
  const ancestorResult = spawnSync("/usr/bin/git", ["merge-base", "--is-ancestor", baseCommit, headCommit], {
    cwd: root,
    encoding: "buffer",
    shell: false,
    env: {PATH: process.env.PATH, HOME: process.env.HOME, GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: "/dev/null", GIT_OPTIONAL_LOCKS: "0"} as unknown as NodeJS.ProcessEnv,
  });
  if (ancestorResult.status !== 0 && ancestorResult.status !== 1) fail(Buffer.from(ancestorResult.stderr ?? []).toString("utf8") || "Unable to establish base ancestry.");
  const committedChangedPaths = headCommit === baseCommit ? [] : [...new Set(nulList(gitBuffer(root, ["diff", "--name-only", "-z", `${baseCommit}..${headCommit}`])))].sort((left, right) => left.localeCompare(right));
  return {headCommit, stagedPaths, hiddenIndexPaths, trackedDirtyPaths, untrackedPaths, baseIsStrictAncestor: ancestorResult.status === 0 && baseCommit !== headCommit, committedChangedPaths};
};

export const deriveGitState = (root: string, plan: ExtensionPlan, ceiling: readonly string[], observationOverride?: GitObservationOverride): DerivedGitState => {
  const observation = observationOverride === undefined ? observeGit(root, plan.baseCommit) : validateObservationOverride(observationOverride);
  if (observation.stagedPaths.length > 0) fail(`Staged paths are forbidden: ${observation.stagedPaths.join(", ")}.`);
  if (observation.hiddenIndexPaths.length > 0) fail(`Hidden index flags are forbidden: ${observation.hiddenIndexPaths.join(", ")}.`);
  const observedDirtyPaths = [...new Set([...observation.trackedDirtyPaths, ...observation.untrackedPaths])].sort((left, right) => left.localeCompare(right));
  for (const path of observedDirtyPaths) if (!ceiling.includes(path)) fail(`Observed dirty path is outside the authorization ceiling: ${path}.`);
  if (observedDirtyPaths.length > 0) {
    exact(observation.headCommit, plan.baseCommit, "dirty executor HEAD/base");
    exact(observedDirtyPaths, plan.dirtyExpectedPaths, "dirty executor observed paths");
    return {derivedGitState: "dirty-executor", baseCommit: plan.baseCommit, headCommit: observation.headCommit, observedDirtyPaths, dirtyExpectedPaths: [...plan.dirtyExpectedPaths], cleanExpectedPaths: [], selectedExpectedPaths: [...plan.dirtyExpectedPaths]};
  }
  if (!observation.baseIsStrictAncestor) fail("Clean committed state requires baseCommit to be a strict ancestor of HEAD.");
  const projection = observation.committedChangedPaths.filter((path) => ceiling.includes(path)).sort((left, right) => left.localeCompare(right));
  exact(projection, plan.dirtyExpectedPaths, "clean committed ceiling projection");
  return {derivedGitState: "clean-committed", baseCommit: plan.baseCommit, headCommit: observation.headCommit, observedDirtyPaths: [], dirtyExpectedPaths: [...plan.dirtyExpectedPaths], cleanExpectedPaths: [], selectedExpectedPaths: []};
};

export const derivePhase2CloseoutGraphGitState = (root: string, plan: ExtensionPlan, ceiling: readonly string[], observationOverride?: GitObservationOverride): DerivedGitState => {
  exact(plan.authorizationId, "phase-2/v1", "closeout plan authorizationId");
  exact(ceiling, [...PHASE2_PATHS], "closeout technical path ceiling");
  exact(plan.dirtyExpectedPaths, [...PHASE2_PATHS], "closeout recorded technical paths");
  const observation = observationOverride === undefined ? observeGit(root, plan.baseCommit) : validateObservationOverride(observationOverride);
  exact(observation.stagedPaths, [], "closeout staged paths");
  exact(observation.hiddenIndexPaths, [], "closeout hidden index paths");
  exact(observation.headCommit, plan.baseCommit, "closeout HEAD/base");
  exact(observation.baseIsStrictAncestor, false, "closeout base ancestry");
  exact(observation.committedChangedPaths, [], "closeout committed paths");
  const observedCloseoutPaths = sortProofPaths([...new Set([...observation.trackedDirtyPaths, ...observation.untrackedPaths])]);
  exact(observedCloseoutPaths, PHASE2_CLOSEOUT_PATHS, "closeout observed paths");
  return {
    derivedGitState: "dirty-executor",
    baseCommit: plan.baseCommit,
    headCommit: plan.baseCommit,
    observedDirtyPaths: [...plan.dirtyExpectedPaths],
    dirtyExpectedPaths: [...plan.dirtyExpectedPaths],
    cleanExpectedPaths: [],
    selectedExpectedPaths: [...plan.dirtyExpectedPaths],
  };
};

const validateResultBindingGroup = (value: unknown) => {
  const record = object(value, ["catalog", "plan", "registry", "adapter"], "result bindings");
  return {catalog: parseBinding(record.catalog, "result catalog binding"), plan: parseBinding(record.plan, "result plan binding"), registry: parseBinding(record.registry, "result registry binding"), adapter: parseBinding(record.adapter, "result adapter binding")};
};

export const validateExtensionResult = (value: unknown, root: string, verifyBindings = true, validationMode: ExtensionValidationMode = "technical"): ExtensionResult => {
  const record = object(value, ["resultVersion", "specId", "proofPurpose", "status", "recordedAt", "productPhaseClaimed", "runtime", "derivedGitState", "baseCommit", "headCommit", "observedDirtyPaths", "dirtyExpectedPaths", "cleanExpectedPaths", "selectedExpectedPaths", "authorization", "bindings", "execution", "evidence", "network", "cleanup"], "extension result");
  exact(record.resultVersion, 2, "resultVersion");
  exact(record.specId, "SPEC-0001", "result specId");
  exact(record.status, "passed", "result status");
  const authorizationRecord = object(record.authorization, ["authorizationId", "materializationKind"], "result authorization");
  const authorizationId = enumeration(authorizationRecord.authorizationId, ["phase-1.5-compatibility-synthetic/v1", "phase-2/v1"] as const, "result authorizationId");
  const synthetic = authorizationId === "phase-1.5-compatibility-synthetic/v1";
  const proofPurpose = synthetic ? "phase-1.5-compatibility-synthetic" : "phase-2";
  exact(record.proofPurpose, proofPurpose, "result proofPurpose");
  exact(authorizationRecord.materializationKind, synthetic ? "materialized" : "deferred", "result materializationKind");
  const recordedAt = typeof record.recordedAt === "string" ? record.recordedAt : fail("result recordedAt must be a string.");
  if (Number.isNaN(Date.parse(recordedAt))) fail("result recordedAt must be an ISO-compatible timestamp.");
  const productPhaseClaimed = typeof record.productPhaseClaimed === "boolean" ? record.productPhaseClaimed : fail("result productPhaseClaimed must be boolean.");
  if (productPhaseClaimed !== !synthetic) fail("result productPhaseClaimed mismatch.");
  const runtimeRecord = object(record.runtime, ["nodeVersion", "playwrightCoreVersion", "browserVersion", "browserExecutable"], "result runtime");
  const runtime = {nodeVersion: string(runtimeRecord.nodeVersion, "result nodeVersion"), playwrightCoreVersion: enumeration(runtimeRecord.playwrightCoreVersion, ["1.62.1"] as const, "result playwrightCoreVersion"), browserVersion: string(runtimeRecord.browserVersion, "result browserVersion"), browserExecutable: parseBrowserExecutableBinding(runtimeRecord.browserExecutable, "result browserExecutable")};
  if (verifyBindings) exact(runtime.browserExecutable, bindBrowserExecutable(), "result browser executable binding");
  const derivedGitState = enumeration(record.derivedGitState, ["dirty-executor", "clean-committed"] as const, "result derivedGitState");
  const baseCommit = gitSha(record.baseCommit, "result baseCommit");
  const headCommit = gitSha(record.headCommit, "result headCommit");
  const observedDirtyPaths = canonicalStrings(record.observedDirtyPaths, "result observedDirtyPaths").map((entry) => assertSafeRepositoryPath(entry));
  const dirtyExpectedPaths = canonicalStrings(record.dirtyExpectedPaths, "result dirtyExpectedPaths").map((entry) => assertSafeRepositoryPath(entry));
  exact(record.cleanExpectedPaths, [], "result cleanExpectedPaths");
  const selectedExpectedPaths = canonicalStrings(record.selectedExpectedPaths, "result selectedExpectedPaths").map((entry) => assertSafeRepositoryPath(entry));
  exact(selectedExpectedPaths, derivedGitState === "dirty-executor" ? dirtyExpectedPaths : [], "result selectedExpectedPaths");
  exact(observedDirtyPaths, selectedExpectedPaths, "result observed/selected paths");
  if (derivedGitState === "dirty-executor") exact(headCommit, baseCommit, "result dirty HEAD/base");
  const bindings = validateResultBindingGroup(record.bindings);
  exact(bindings.catalog.path, CATALOG_PATH, "result catalog path");
  exact(bindings.plan.path, synthetic ? COMPATIBILITY_PLAN_PATH : PHASE2_PLAN_PATH, "result plan path");
  exact(bindings.registry.path, synthetic ? COMPATIBILITY_REGISTRY_PATH : PHASE2_REGISTRY_PATH, "result registry path");
  exact(bindings.adapter.path, synthetic ? COMPATIBILITY_ADAPTER_PATH : PHASE2_ADAPTER_PATH, "result adapter path");
  if (verifyBindings) for (const [name, binding] of Object.entries(bindings)) verifyBinding(root, binding, `result ${name} binding`);
  const executionRecord = object(record.execution, ["selectedActionIds", "actionCount", "checkpointCount", "screenshotCount", "protectedRegressionGroups"], "result execution");
  const selectedActionIds = array(executionRecord.selectedActionIds, "result selectedActionIds").map((entry, index) => handle(entry, `selectedActionIds[${index}]`));
  unique(selectedActionIds, "selectedActionIds");
  const actionCount = integer(executionRecord.actionCount, "result actionCount");
  exact(actionCount, selectedActionIds.length, "result actionCount");
  const protectedRegressionGroups = parseRegressionGroups(executionRecord.protectedRegressionGroups, "result protectedRegressionGroups");
  const execution = {selectedActionIds, actionCount, checkpointCount: integer(executionRecord.checkpointCount, "result checkpointCount"), screenshotCount: integer(executionRecord.screenshotCount, "result screenshotCount"), protectedRegressionGroups};
  const evidenceRecord = object(record.evidence, ["ledgerKinds", "screenshotIds", "protectedRegressionGroups"], "result evidence");
  const evidence = {ledgerKinds: canonicalStrings(evidenceRecord.ledgerKinds, "result ledgerKinds"), screenshotIds: canonicalStrings(evidenceRecord.screenshotIds, "result screenshotIds").map((entry) => handle(entry, "result screenshotId")), protectedRegressionGroups: parseRegressionGroups(evidenceRecord.protectedRegressionGroups, "result evidence protectedRegressionGroups")};
  exact(evidence.protectedRegressionGroups, execution.protectedRegressionGroups, "result regression evidence");
  exact(execution.screenshotCount, evidence.screenshotIds.length, "result screenshot evidence count");
  const networkRecord = object(record.network, ["browserNonLoopbackAttempts", "serverNonLoopbackAttempts", "childNonLoopbackAttempts"], "result network");
  exact(networkRecord, {browserNonLoopbackAttempts: 0, serverNonLoopbackAttempts: 0, childNonLoopbackAttempts: 0}, "result network denial");
  const cleanupRecord = object(record.cleanup, ["anchorRestored", "sourceRestored", "browserContextsOpen", "activeGates", "activeIntercepts", "openChildProcesses", "openPorts", "residualPaths"], "result cleanup");
  exact(cleanupRecord, {anchorRestored: true, sourceRestored: true, browserContextsOpen: 0, activeGates: 0, activeIntercepts: 0, openChildProcesses: 0, openPorts: 0, residualPaths: []}, "result cleanup");
  const validated: ExtensionResult = {resultVersion: 2, specId: "SPEC-0001", proofPurpose, status: "passed", recordedAt, productPhaseClaimed, runtime, derivedGitState, baseCommit, headCommit, observedDirtyPaths, dirtyExpectedPaths, cleanExpectedPaths: [], selectedExpectedPaths, authorization: {authorizationId, materializationKind: synthetic ? "materialized" : "deferred"}, bindings, execution, evidence, network: {browserNonLoopbackAttempts: 0, serverNonLoopbackAttempts: 0, childNonLoopbackAttempts: 0}, cleanup: {anchorRestored: true, sourceRestored: true, browserContextsOpen: 0, activeGates: 0, activeIntercepts: 0, openChildProcesses: 0, openPorts: 0, residualPaths: []}};
  if (verifyBindings) {
    const graph = loadTesterExtensionGraph(root, bindings.plan.path, validationMode);
    exact(validated.authorization, {authorizationId: graph.authorizationId, materializationKind: graph.materializationKind}, "result/graph authorization");
    exact(validated.bindings, {catalog: graph.catalogBinding, plan: graph.planBinding, registry: graph.registryBinding, adapter: graph.adapterBinding}, "result/graph bindings");
    exact({derivedGitState: validated.derivedGitState, baseCommit: validated.baseCommit, headCommit: validated.headCommit, observedDirtyPaths: validated.observedDirtyPaths, dirtyExpectedPaths: validated.dirtyExpectedPaths, cleanExpectedPaths: validated.cleanExpectedPaths, selectedExpectedPaths: validated.selectedExpectedPaths}, graph.git, "result/graph Git state");
    exact(validated.execution.selectedActionIds, graph.plan.steps.map((step) => step.actionId), "result/plan selected actions");
    exact(validated.execution.protectedRegressionGroups, graph.plan.evidence.protectedRegressionGroups, "result/plan regression groups");
    exact(validated.evidence, {ledgerKinds: graph.plan.evidence.ledgerKinds, screenshotIds: graph.plan.evidence.screenshotIds, protectedRegressionGroups: graph.plan.evidence.protectedRegressionGroups}, "result/plan evidence");
    exact(validated.productPhaseClaimed, graph.plan.evidence.productPhaseClaimed, "result/plan product claim");
  }
  return validated;
};

const trackedAtHead = (root: string, path: string) => {
  const result = spawnSync("/usr/bin/git", ["ls-files", "--error-unmatch", "--", path], {
    cwd: root,
    encoding: "buffer",
    shell: false,
    env: {PATH: process.env.PATH, HOME: process.env.HOME, GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: "/dev/null", GIT_OPTIONAL_LOCKS: "0"} as unknown as NodeJS.ProcessEnv,
  });
  if (result.status !== 0) fail(`Clean committed extension byte is not tracked at HEAD: ${path}.`);
};

export const loadTesterExtensionGraph = (root: string, planPath: string, validationMode: ExtensionValidationMode = "technical"): ValidatedTesterExtension => {
  const safePlanPath = assertSafeRepositoryPath(planPath, "selected plan path");
  const catalog = validateAuthorizationCatalogValue(readStrictJson(root, CATALOG_PATH));
  const authorization = catalog.authorizations.find((entry) => entry.plan.path === safePlanPath) ?? fail(`Plan path is not registered: ${safePlanPath}.`);
  const plan = validateExtensionPlanValue(readStrictJson(root, safePlanPath));
  exact(plan.authorizationId, authorization.authorizationId, "plan/catalog authorizationId");
  exact(plan.outputRoot, authorization.outputRoot, "plan/catalog outputRoot");
  exact(plan.operationFamilies, authorization.operationFamilies, "plan/catalog operation families");
  exact(plan.dirtyExpectedPaths.every((path) => authorization.pathCeiling.includes(path)), true, "plan/catalog dirty ceiling");
  const catalogBinding = bindRepositoryFile(root, CATALOG_PATH);
  const planBinding = bindRepositoryFile(root, safePlanPath);
  const registryBinding = bindRepositoryFile(root, authorization.registry.path);
  const adapterBinding = bindRepositoryFile(root, authorization.adapter.path);
  if (authorization.materializationKind === "materialized") {
    exact(planBinding, {path: authorization.plan.path, byteLength: authorization.plan.byteLength, sha256: authorization.plan.sha256}, "materialized plan binding");
    exact(registryBinding, {path: authorization.registry.path, byteLength: authorization.registry.byteLength, sha256: authorization.registry.sha256}, "materialized registry binding");
    exact(adapterBinding, {path: authorization.adapter.path, byteLength: authorization.adapter.byteLength, sha256: authorization.adapter.sha256}, "materialized adapter binding");
  }
  exact(plan.registry, registryBinding, "plan/registry binding");
  const registry = validateExtensionRegistryValue(readStrictJson(root, registryBinding.path));
  exact(registry.authorizationId, authorization.authorizationId, "registry/catalog authorizationId");
  exact(registry.operationFamilies, authorization.operationFamilies, "registry/catalog operation families");
  exact(registry.adapter, adapterBinding, "registry/adapter binding");
  const adapterSource = readFileSync(safeAbsolutePath(root, adapterBinding.path), "utf8");
  const adapter = parseAdapterDeclarationSource(adapterSource, adapterBinding.path);
  exact(adapter.authorizationId, authorization.authorizationId, "adapter/catalog authorizationId");
  for (const fixture of registry.fixtures) {
    if (fixture.sourceKind === "repository-json") {
      if (authorization.authorizationId !== "phase-2/v1") fail("Repository-backed fixtures are reserved for Phase 2 authorization.");
      if (!(PHASE2_READABLE_FIXTURE_PATHS as readonly string[]).includes(fixture.binding.path)) fail(`Fixture binding path is not Phase-2-authorized: ${fixture.binding.path}.`);
      verifyBinding(root, fixture.binding, `fixture ${fixture.fixtureId}`);
      readStrictJson(root, fixture.binding.path);
    }
  }
  const actionsById = new Map(registry.actions.map((action) => [action.actionId, action]));
  for (const step of plan.steps) if (!actionsById.has(step.actionId)) fail(`Plan references unknown action ${step.actionId}.`);
  const selectedActionIds = plan.steps.map((step) => step.actionId);
  if (new Set(selectedActionIds).size !== selectedActionIds.length) fail("Plan may invoke each registered action at most once.");
  const driverOperations = new Set(adapter.driverOperations.map((entry) => entry.operation));
  const environmentOperations = new Set(adapter.environmentOperations.map((entry) => entry.operation));
  const pointerTargets = new Set(adapter.pointerTargets.map((entry) => entry.targetId));
  const fixturesById = new Map(registry.fixtures.map((fixture) => [fixture.fixtureId, fixture]));
  for (const action of registry.actions) {
    if (action.family === "workspace-driver") {
      if (!driverOperations.has(action.operation)) fail(`Driver operation ${action.operation} is not declared by the adapter.`);
      const expectedKinds = DRIVER_FIXTURE_KINDS[action.operation];
      if (expectedKinds.length === 0) {
        if (action.fixtureId !== null) fail(`Driver operation ${action.operation} forbids a fixture.`);
      } else {
        const fixtureId = action.fixtureId ?? fail(`Driver operation ${action.operation} requires a fixture.`);
        const fixture = fixturesById.get(fixtureId) ?? fail(`Driver operation ${action.operation} references unknown fixture ${fixtureId}.`);
        if (!expectedKinds.includes(fixture.fixtureKind)) fail(`Driver operation ${action.operation} fixture kind mismatch.`);
        const declaredPort = adapter.driverOperations.find((entry) => entry.operation === action.operation);
        if (!declaredPort?.fixtureKinds.includes(fixture.fixtureKind)) fail(`Adapter does not authorize fixture kind ${fixture.fixtureKind} for ${action.operation}.`);
      }
    }
    if (action.family === "runner-environment") {
      if (!environmentOperations.has(action.operation)) fail(`Environment operation ${action.operation} is not declared by the adapter.`);
      const expectedKinds = ENVIRONMENT_FIXTURE_KINDS[action.operation];
      if (expectedKinds.length === 0) {
        if (action.fixtureId !== null) fail(`Environment operation ${action.operation} forbids a fixture.`);
      } else {
        const fixtureId = action.fixtureId ?? fail(`Environment operation ${action.operation} requires a fixture.`);
        const fixture = fixturesById.get(fixtureId) ?? fail(`Environment operation ${action.operation} references unknown fixture ${fixtureId}.`);
        if (!expectedKinds.includes(fixture.fixtureKind)) fail(`Environment operation ${action.operation} fixture kind mismatch.`);
        const declaredPort = adapter.environmentOperations.find((entry) => entry.operation === action.operation);
        if (!declaredPort?.fixtureKinds.includes(fixture.fixtureKind)) fail(`Adapter does not authorize fixture kind ${fixture.fixtureKind} for ${action.operation}.`);
      }
    }
    if (action.family === "pointer" && !pointerTargets.has(action.targetId)) fail(`Pointer target ${action.targetId} is not declared by the adapter.`);
  }
  const git = validationMode === "phase-2-closeout"
    ? derivePhase2CloseoutGraphGitState(root, plan, authorization.pathCeiling)
    : deriveGitState(root, plan, authorization.pathCeiling);
  if (git.derivedGitState === "clean-committed") for (const path of [CATALOG_PATH, planBinding.path, registryBinding.path, adapterBinding.path]) trackedAtHead(root, path);
  return {authorizationId: authorization.authorizationId, materializationKind: authorization.materializationKind, outputRoot: authorization.outputRoot, pathCeiling: authorization.pathCeiling, operationFamilies: authorization.operationFamilies, catalogBinding, planBinding, registryBinding, adapterBinding, plan, registry, adapter, git};
};
