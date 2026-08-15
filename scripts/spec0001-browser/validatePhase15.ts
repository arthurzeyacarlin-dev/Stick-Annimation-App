import assert from "node:assert/strict";
import {spawnSync} from "node:child_process";
import {existsSync, readFileSync} from "node:fs";
import {resolve} from "node:path";
import {normalizeDrawingAiResponse} from "../../src/lib/ai/drawingAiContract.ts";
import {
  ANCHOR_MARKER,
  ANCHOR_PATH,
  BASE_COMMIT,
  PHASE15_AUTHORIZED_PATHS,
  DRIVER_OPERATIONS,
  FIXED_DRAWING_PROMPT,
  FIXTURE_ROOT,
  bindFile,
  readJson,
  strictObject,
  validateBrowserPlan,
  validateDriverEnvelope,
  validateJsonSchema,
  validateRunBaselinePolicy,
} from "./browserTesterContract.ts";

const ROOT = process.cwd();
const authorizedExisting = new Set([
  "package.json",
  "package-lock.json",
  "src/components/workspace/DrawingCanvas.tsx",
  ANCHOR_PATH,
]);
const authorizedNew = new Set([
  "scripts/runSpec0001BrowserProof.ts",
  "scripts/spec0001-browser/browserTesterContract.ts",
  "scripts/spec0001-browser/networkDeny.cjs",
  "scripts/spec0001-browser/validatePhase15.ts",
  "scripts/spec0001-browser/recordPhase15Proof.ts",
  "scripts/spec0001-browser/validatePhase15Proof.ts",
  "scripts/spec0001-browser/finalizePhase15Closeout.ts",
  ...[
    "tester-core.schema.json",
    "tester-action-registry.schema.json",
    "tester-result.schema.json",
    "phase-1.5-browser-plan.json",
    "phase-1.5-proof-commands.json",
    "drawing-generate-frames-response.json",
    "next-font-google-response.json",
    "phase-1.5-negative-cases.json",
    "phase-1.5-proof-manifest.schema.json",
    "phase-1.5-closeout.schema.json",
  ].map((name) => `${FIXTURE_ROOT}/${name}`),
  ...[
    "geist-cyrillic.woff2",
    "geist-latin-ext.woff2",
    "geist-latin.woff2",
    "geist-mono-cyrillic.woff2",
    "geist-mono-latin-ext.woff2",
    "geist-mono-latin.woff2",
  ].map((name) => `${FIXTURE_ROOT}/fonts/${name}`),
]);
const authorized = new Set([...authorizedExisting, ...authorizedNew]);
assert.deepEqual([...authorized].sort(), PHASE15_AUTHORIZED_PATHS);

const git = (...argv: string[]) => {
  const result = spawnSync("git", argv, {cwd: ROOT, encoding: "utf8", shell: false});
  assert.equal(result.status, 0, result.stderr || `git ${argv.join(" ")} failed`);
  return result.stdout;
};
const nulList = (value: string) => value.split("\0").filter(Boolean);

const validateAllowlist = () => {
  assert.equal(git("rev-parse", "HEAD").trim(), BASE_COMMIT);
  assert.equal(git("diff", "--cached", "--name-only").trim(), "", "Phase 1.5 index must remain empty.");
  const changed = [...new Set([
    ...nulList(git("diff", "--name-only", "-z", BASE_COMMIT)),
    ...nulList(git("ls-files", "--others", "--exclude-standard", "-z")),
  ])].sort();
  const outside = changed.filter((path) => !authorized.has(path));
  assert.deepEqual(outside, [], `Unauthorized Phase 1.5 paths: ${outside.join(", ")}`);
  for (const path of authorizedNew) assert.ok(existsSync(resolve(ROOT, path)), `Missing authorized Phase 1.5 file: ${path}`);
  return changed;
};

const validatePackage = () => {
  const packageJson = readJson(ROOT, "package.json") as {scripts: Record<string, string>; devDependencies: Record<string, string>};
  assert.equal(packageJson.scripts["test:spec0001-browser"], "node --experimental-strip-types scripts/runSpec0001BrowserProof.ts");
  assert.equal(packageJson.devDependencies["playwright-core"], "1.62.1");
  const lock = readJson(ROOT, "package-lock.json") as {packages: Record<string, Record<string, unknown>>};
  const entry = lock.packages["node_modules/playwright-core"];
  assert.equal(entry.version, "1.62.1");
  assert.equal(entry.resolved, "https://registry.npmjs.org/playwright-core/-/playwright-core-1.62.1.tgz");
  assert.equal(entry.integrity, "sha512-wPYSwEBJY9GHraISXqyqtx0na0LpO3XEX7jNDhntbex7tzUS7kLnZsOlFruFJB4Hi/rhDMjXGqHewDZ68nYZVw==");
  assert.equal((entry as {hasInstallScript?: unknown}).hasInstallScript, undefined);
};

const validateAnchor = () => {
  const current = readFileSync(resolve(ROOT, ANCHOR_PATH), "utf8");
  assert.equal(current.split(ANCHOR_MARKER).length - 1, 1);
  const base = git("show", `${BASE_COMMIT}:${ANCHOR_PATH}`);
  assert.equal(current.replace(`  ${ANCHOR_MARKER}\n\n`, ""), base, "Stick source may differ from base only by the inert anchor comment.");
};

const validateDrawingCorrection = () => {
  const path = "src/components/workspace/DrawingCanvas.tsx";
  const current = readFileSync(resolve(ROOT, path), "utf8");
  const base = git("show", `${BASE_COMMIT}:${path}`);
  assert.notEqual(current, base, "The authorized Drawing correction is missing.");
  assert.ok(current.includes("const preservedEditableCanvas = editableSizeChanged ? document.createElement(\"canvas\") : null;"));
  assert.ok(current.includes("Math.round((canvas.width - preservedEditableCanvas.width) / 2)"));
  assert.ok(current.includes("if (targetCanvas.width !== width) targetCanvas.width = width;"));
  for (const marker of [["SPEC0001", "PHASE15", "TEMP", "DIAGNOSTIC"], ["__SPEC0001", "DRAWING", "DIAGNOSTIC"]].map((parts) => parts.join("_"))) {
    assert.ok(!current.includes(marker), `Temporary Drawing diagnostic marker remains: ${marker}`);
  }
  assert.equal(git("diff", "--name-only", BASE_COMMIT, "--", "src/components/workspace/DrawingWorkspace.tsx").trim(), "", "DrawingWorkspace diagnostics must be fully removed.");
};

const validateFixtures = () => {
  for (const name of [
    "tester-core.schema.json", "tester-action-registry.schema.json", "tester-result.schema.json",
    "phase-1.5-proof-manifest.schema.json", "phase-1.5-closeout.schema.json",
  ]) {
    const schema = readJson(ROOT, `${FIXTURE_ROOT}/${name}`) as Record<string, unknown>;
    const exactSchema = strictObject(schema, ["$id", "$schema", "additionalProperties", "properties", "required", "type"], `${name} schema`);
    assert.equal(exactSchema.$schema, "https://json-schema.org/draft/2020-12/schema");
    assert.equal(exactSchema.type, "object");
    assert.equal(exactSchema.additionalProperties, false);
    assert.ok(Array.isArray(exactSchema.required));
    assert.deepEqual([...(exactSchema.required as string[])].sort(), Object.keys(exactSchema.properties as Record<string, unknown>).sort(), `${name} must require every declared top-level property.`);
    assert.throws(() => strictObject({unexpected: true}, exactSchema.required as string[], `${name} seeded extra/missing`));
  }
  const plan = validateBrowserPlan(readJson(ROOT, `${FIXTURE_ROOT}/phase-1.5-browser-plan.json`));
  validateJsonSchema(
    {registryVersion: 1, actions: plan.actions},
    readJson(ROOT, `${FIXTURE_ROOT}/tester-action-registry.schema.json`),
    "Action registry",
  );
  validateJsonSchema(
    {contractVersion: 1, operation: "tester.connection.ping/v1", payload: {}},
    readJson(ROOT, `${FIXTURE_ROOT}/tester-core.schema.json`),
    "Tester core",
  );
  validateJsonSchema(
    {closeoutVersion: 1, specId: "SPEC-0001", phase: "1.5", baseCommit: BASE_COMMIT, proof: {}, trackedState: [], indexEmpty: true, status: "validated"},
    readJson(ROOT, `${FIXTURE_ROOT}/phase-1.5-closeout.schema.json`),
    "Closeout schema exemplar",
  );
  assert.equal(plan.fixedPrompt, FIXED_DRAWING_PROMPT);
  assert.deepEqual(plan.driverOperations, DRIVER_OPERATIONS);
  const response = normalizeDrawingAiResponse(readJson(ROOT, `${FIXTURE_ROOT}/drawing-generate-frames-response.json`), {fallbackTaskType: "generate-frames"});
  assert.equal(response.taskType, "generate-frames");
  assert.equal(response.searchUsed, false);
  assert.equal(response.execution?.taskType, "generate-frames");
  assert.equal(response.execution?.applyMode, "single-frame");
  assert.equal(response.generatedFramePlan?.requestKind, "single-frame");
  assert.equal(response.generatedFramePlan?.frames.length, 1);
  const fonts = strictObject(readJson(ROOT, `${FIXTURE_ROOT}/next-font-google-response.json`), ["fixtureVersion", "responses"], "Font metadata");
  assert.ok(Array.isArray(fonts.responses) && fonts.responses.length === 2);
  for (const responseValue of fonts.responses) {
    const fontResponse = strictObject(responseValue, ["faces", "family", "url"], "Font response");
    assert.ok(Array.isArray(fontResponse.faces) && fontResponse.faces.length === 3);
    for (const faceValue of fontResponse.faces) {
      const face = strictObject(faceValue, ["file", "sha256", "subset", "unicodeRange"], "Font face");
      assert.equal(bindFile(ROOT, face.file as string).sha256, face.sha256);
    }
  }
  const negatives = strictObject(readJson(ROOT, `${FIXTURE_ROOT}/phase-1.5-negative-cases.json`), ["cases", "fixtureVersion"], "Negative cases");
  assert.ok(Array.isArray(negatives.cases) && negatives.cases.length === 37);
  const names = negatives.cases.map((value, index) => strictObject(value, ["category", "expectedCode", "name"], `Negative case ${index}`).name as string);
  assert.equal(new Set(names).size, names.length, "Negative case names must be unique.");
};

const validateReusableBaselinePolicy = () => {
  assert.equal(validateRunBaselinePolicy({head: "b".repeat(40), changedPaths: []}).mode, "integrated-current-head");
  assert.equal(validateRunBaselinePolicy({head: BASE_COMMIT, requestedBase: BASE_COMMIT, changedPaths: PHASE15_AUTHORIZED_PATHS}).mode, "phase-1.5-bootstrap");
  assert.throws(() => validateRunBaselinePolicy({head: "b".repeat(40), requestedBase: "c".repeat(40), changedPaths: []}));
  assert.throws(() => validateRunBaselinePolicy({head: "b".repeat(40), changedPaths: ["app/page.tsx"]}));
};

const validateDriverNegativeCases = () => {
  const ping = validateDriverEnvelope({contractVersion: 1, operation: "tester.connection.ping/v1", payload: {connected: true, transport: "playwright-binding"}});
  assert.equal(ping.operation, "tester.connection.ping/v1");
  assert.throws(() => validateDriverEnvelope({contractVersion: 1, operation: "arbitrary.evaluate/v1", payload: {}}));
  assert.throws(() => validateDriverEnvelope({contractVersion: 1, operation: "tester.connection.ping/v1", payload: {connected: true, transport: "http"}}));
  assert.throws(() => validateDriverEnvelope({contractVersion: 1, operation: "stick.phase2.checkpoint/v1", payload: {activeLayerId: "x", authoredFrameCount: -1, currentFrameIndex: 0, jointCount: 0, limbCount: 0, selectedTimelineIndex: 0}}));
};

const validateNoProductLeak = () => {
  const productFiles = nulList(git("ls-files", "-z", "app", "src"));
  const leaks: string[] = [];
  for (const path of productFiles) {
    const text = readFileSync(resolve(ROOT, path), "utf8");
    if (path === ANCHOR_PATH) {
      const withoutAnchor = text.replace(ANCHOR_MARKER, "");
      if (/spec0001-browser|runSpec0001BrowserProof|__SPEC0001_BROWSER_DRIVER/.test(withoutAnchor)) leaks.push(path);
    } else if (/SPEC0001_BROWSER_DRIVER|spec0001-browser|runSpec0001BrowserProof/.test(text)) leaks.push(path);
  }
  assert.deepEqual(leaks, []);
};

const changed = validateAllowlist();
validatePackage();
validateAnchor();
validateDrawingCorrection();
validateFixtures();
validateDriverNegativeCases();
validateReusableBaselinePolicy();
validateNoProductLeak();
assert.ok(changed.length >= authorizedNew.size, "Phase 1.5 allowlist inventory is unexpectedly incomplete.");
console.log(`SPEC-0001 Phase 1.5 validator PASS: ${changed.length} authorized dirty paths; pinned dependency, fixtures, anchor, privacy, and product-exclusion boundaries valid.`);
