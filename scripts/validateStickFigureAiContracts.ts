import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import {
  STICK_JOINT_ROLES,
  STICK_SEGMENT_ROLE_PAIRS,
  applyStickManualActions,
  buildDerivedPoseIdPreimage,
  buildStickResolvedRenderInput,
  canonicalJson,
  canonicalUtf8,
  deepFreeze,
  deriveStickLineHead,
  deriveStickPoseId,
  digestCanonical,
  isStickJointManuallyEditable,
  isStickManualWaveApplied,
  isStickWaveStarter,
  parseStickManualAction,
  parseStickProjectDocument,
  projectStickAnimationContent,
  type StickProjectDocumentV1,
} from "../src/lib/stickfigure/stickProjectContract.ts";
import {
  STICK_AI_CANONICAL_PROMPT,
  STICK_AI_CAPABILITY_MANIFEST,
  STICK_GOLDEN_PROVIDER_PLAN,
  applyStickCommandBatch,
  assertNoAiOnlyStickRepresentation,
  assertStickTopologyIsFixed,
  buildStickAiProjectContext,
  materializeStickWaveCommandBatch,
  normalizeStickAiPrompt,
  parseStickAiRequest,
  parseStickCommandBatch,
  parseStickCommandResult,
  parseStickWaveProviderPlan,
} from "../src/lib/ai/stickFigureAiContract.ts";

const ROOT = process.cwd();
const FIXTURES = resolve(ROOT, "scripts/fixtures/stick-ai/v1");
const readJson = <T = unknown>(name: string): T => JSON.parse(readFileSync(resolve(FIXTURES, name), "utf8")) as T;
const sha256 = (bytes: Uint8Array | string) => `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
const hex = (bytes: Uint8Array) => Buffer.from(bytes).toString("hex");
let assertions = 0;

const check: (condition: unknown, message: string) => asserts condition = (condition, message) => {
  assert.ok(condition, message);
  assertions += 1;
};

const equal = (actual: unknown, expected: unknown, message: string) => {
  assert.deepEqual(actual, expected, message);
  assertions += 1;
};

const clone = <T>(value: T): T => structuredClone(value);

const expectOk = <T>(result: {ok: true; value: T} | {ok: false; error: unknown}, message: string): T => {
  if (!result.ok) assert.fail(`${message}: ${JSON.stringify(result.error)}`);
  assertions += 1;
  return result.value;
};

const expectError = (
  result: {ok: true; value: unknown} | {ok: false; error: {code: string; path: string}},
  code: string,
  path?: string,
) => {
  check(!result.ok, `Expected ${code} rejection.`);
  if (!result.ok) {
    equal(result.error.code, code, `Expected error code ${code}.`);
    if (path) equal(result.error.path, path, `Expected error path ${path}.`);
  }
};

const stableSnapshot = (value: unknown) => {
  const seen = new Set<object>();
  const walk = (entry: unknown): unknown => {
    if (typeof entry === "number" && !Number.isFinite(entry)) return String(entry);
    if (typeof entry === "symbol") return String(entry);
    if (entry === null || typeof entry !== "object") return entry;
    if (seen.has(entry)) return "<cycle>";
    seen.add(entry);
    if (Array.isArray(entry)) {
      const values = Array.from({length: entry.length}, (_, index) =>
        Object.prototype.hasOwnProperty.call(entry, index) ? walk(entry[index]) : "<hole>",
      );
      seen.delete(entry);
      return values;
    }
    const values: Record<string, unknown> = {};
    for (const key of Reflect.ownKeys(entry).sort((a, b) => String(a).localeCompare(String(b)))) {
      const descriptor = Object.getOwnPropertyDescriptor(entry, key);
      values[String(key)] = descriptor && "value" in descriptor ? walk(descriptor.value) : "<accessor>";
    }
    seen.delete(entry);
    return values;
  };
  return JSON.stringify(walk(value));
};

const starterFixture = readJson<StickProjectDocumentV1>("fresh-stick-project.json");
const manualActions = readJson("manual-wave-actions.json") as never[];
const manualGolden = readJson<StickProjectDocumentV1>("manual-wave-applied-project.json");
const aiGolden = readJson<StickProjectDocumentV1>("wave-applied-project.json");
const requestFixture = readJson("wave-request.json");
const planFixture = readJson("wave-provider-plan.json");
const envelopeFixture = readJson("wave-command-batch.json");
const resultFixtures = readJson("wave-command-results.json") as unknown[];
const equivalenceFixture = readJson("manual-ai-content-equivalence.json") as Record<string, unknown>;

const starter = expectOk(parseStickProjectDocument(starterFixture), "Fresh project must parse");
equal(parseStickProjectDocument(starter).ok, true, "Fresh project must round-trip.");
equal(canonicalJson(starter), canonicalJson(starterFixture), "Fresh canonical bytes must be stable.");
check(isStickWaveStarter(starter), "Fresh project must satisfy the exact starter predicate.");
check(assertStickTopologyIsFixed(starter), "Fresh project must contain the fixed humanoid topology.");
equal(starter.rigs[0].joints.map((joint) => joint.role), [...STICK_JOINT_ROLES], "Joint role order must be exact.");
equal(starter.rigs[0].segments.length, STICK_SEGMENT_ROLE_PAIRS.length, "The fixed rig must have 10 body segments.");
equal(starter.layers[0].cells.length, 12, "Fresh project must have 12 timeline cells.");
equal(starter.layers[0].cells.slice(1).every((cell) => cell.cellType === "empty"), true, "Fresh frames 2-12 must be empty.");
check(assertNoAiOnlyStickRepresentation(starter), "Fresh project must have no AI-only or highlight fields.");

manualActions.forEach((action, index) => expectOk(parseStickManualAction(action), `Manual action ${index} must parse`));
const manualApplied = expectOk(applyStickManualActions(starter, manualActions), "Manual actions must apply");
equal(manualApplied, manualGolden, "Manual actions must reproduce the checked-in manual golden exactly.");
equal(manualApplied.documentRevision, 13, "Thirteen human actions must create thirteen document revisions.");
check(isStickManualWaveApplied(manualApplied, starter), "Manual result must have the exact starter-bound three-pose held-frame profile.");

const context = expectOk(await buildStickAiProjectContext(starter), "Starter context must build");
equal(context, (requestFixture as {projectContext: unknown}).projectContext, "Request context must match the starter.");
equal((requestFixture as {prompt: string}).prompt, STICK_AI_CANONICAL_PROMPT, "Request must carry the canonical prompt.");
equal((requestFixture as {capabilityManifest: unknown}).capabilityManifest, STICK_AI_CAPABILITY_MANIFEST, "Request manifest must be exact.");
expectOk(parseStickAiRequest(requestFixture, starter), "Wave request must parse");
equal(planFixture, STICK_GOLDEN_PROVIDER_PLAN, "Provider fixture must equal the golden bounded plan.");
expectOk(parseStickWaveProviderPlan(planFixture), "Provider plan must parse");

const builtEnvelope = expectOk(
  await materializeStickWaveCommandBatch(starter, requestFixture as never, planFixture as never),
  "Command envelope must materialize",
);
equal(builtEnvelope, envelopeFixture, "Materialized envelope must reproduce the checked-in golden.");
const parsedEnvelope = expectOk(await parseStickCommandBatch(envelopeFixture, starter), "Command envelope must parse");
const aiApplied = expectOk(await applyStickCommandBatch(starter, parsedEnvelope), "AI command must apply");
equal(aiApplied, aiGolden, "AI command must reproduce the checked-in AI golden exactly.");
equal(aiApplied.documentRevision, 1, "One AI batch must create one document revision.");
check(isStickManualWaveApplied(aiApplied, starter), "AI result must have the same exact starter-bound three-pose held-frame profile.");
check(assertNoAiOnlyStickRepresentation(aiApplied), "Persisted AI output must have no beat, provenance, glow, or head-shape field.");

const firstIdentity = (document: StickProjectDocumentV1) => ({
  projectId: document.projectId,
  rig: document.rigs[0],
  figure: document.figures[0],
  layerId: document.layers[0].layerId,
  frameIds: document.layers[0].cells.map((cell) => cell.frameId),
  starterPoseId: document.layers[0].cells[0].cellType === "keyframe" ? document.layers[0].cells[0].poses[0].poseId : null,
});
equal(firstIdentity(aiApplied), firstIdentity(starter), "AI Apply must preserve every starter identity except its two new pose IDs.");
equal(firstIdentity(manualApplied), firstIdentity(starter), "Manual construction must preserve every starter identity except its two new pose IDs.");

const manualContent = expectOk(projectStickAnimationContent(manualApplied), "Manual content must project");
const aiContent = expectOk(projectStickAnimationContent(aiApplied), "AI content must project");
equal(manualContent, aiContent, "Manual and AI animation content must be byte-identical.");
const contentText = canonicalJson(aiContent);
const contentDigest = await digestCanonical(aiContent);
equal(canonicalJson(manualContent), contentText, "Manual and AI canonical content text must match.");
equal(equivalenceFixture.manualContent, manualContent, "Manual projection golden must match.");
equal(equivalenceFixture.aiContent, aiContent, "AI projection golden must match.");
equal(equivalenceFixture.manualCanonicalText, contentText, "Manual content text vector must match.");
equal(equivalenceFixture.aiCanonicalText, contentText, "AI content text vector must match.");
equal(equivalenceFixture.canonicalUtf8Hex, hex(canonicalUtf8(aiContent)), "Content UTF-8 hex must match.");
equal(equivalenceFixture.canonicalUtf8ByteLength, canonicalUtf8(aiContent).byteLength, "Content UTF-8 length must match.");
equal(equivalenceFixture.animationContentDigest, contentDigest, "Animation-content digest must match.");
equal(
  equivalenceFixture.excludedDocumentDifferences,
  ["documentRevision", "layers[0].cells[4].poses[0].poseId", "layers[0].cells[8].poses[0].poseId"],
  "Only the declared bookkeeping differences may be excluded.",
);
check(canonicalJson(manualApplied) !== canonicalJson(aiApplied), "Full documents must retain their declared revision/pose-ID differences.");

const keyIndexes = aiApplied.layers[0].cells.filter((cell) => cell.cellType === "keyframe").map((cell) => cell.index);
const holdIndexes = aiApplied.layers[0].cells.filter((cell) => cell.cellType === "hold").map((cell) => cell.index);
equal(keyIndexes, [0, 4, 8], "Only displayed Frames 1, 5, and 9 may own poses.");
equal(holdIndexes, [1, 2, 3, 5, 6, 7, 9, 10, 11], "Frames between poses must hold the previous owner.");
equal(aiApplied.layers[0].cells.filter((cell) => cell.cellType === "keyframe").length, 3, "The wave must not contain 12 independent poses.");

const expectedRenderDigests = equivalenceFixture.renderInputDigests as Array<{displayedFrame: number; digest: string}>;
for (const [index, displayedFrame] of [1, 5, 9].entries()) {
  const manualRender = expectOk(buildStickResolvedRenderInput(manualApplied, displayedFrame - 1), `Manual Frame ${displayedFrame} must render`);
  const aiRender = expectOk(buildStickResolvedRenderInput(aiApplied, displayedFrame - 1), `AI Frame ${displayedFrame} must render`);
  equal(manualRender, aiRender, `Manual/AI render input for Frame ${displayedFrame} must match.`);
  equal(await digestCanonical(aiRender), expectedRenderDigests[index].digest, `Frame ${displayedFrame} render digest must match.`);
  equal(aiRender.lineHead.length, 80, `Frame ${displayedFrame} head must be 80 units.`);
}

for (const result of resultFixtures) expectOk(parseStickCommandResult(result), "Every command-result status fixture must parse");
equal((resultFixtures[5] as {status: string; error: {code: string}}).status, "cancelled", "Last result must cover cancellation.");
equal((resultFixtures[5] as {error: {code: string}}).error.code, "preview_cancelled", "Cancellation must use preview_cancelled.");

const canonicalVectors = readJson("canonical-hash-vectors.json") as Array<{
  name: string;
  value: unknown;
  canonicalText: string;
  utf8ByteLength: number;
  utf8Hex: string;
  digest: string;
  nodeCryptoDigest: string;
}>;
for (const vector of canonicalVectors) {
  const input = vector.name === "negative-zero" ? {number: -0} : vector.value;
  const bytes = canonicalUtf8(input);
  equal(canonicalJson(input), vector.canonicalText, `${vector.name} canonical text must match.`);
  equal(bytes.byteLength, vector.utf8ByteLength, `${vector.name} byte length must match.`);
  equal(hex(bytes), vector.utf8Hex, `${vector.name} byte hex must match.`);
  equal(await digestCanonical(input), vector.digest, `${vector.name} WebCrypto digest must match.`);
  equal(sha256(bytes), vector.nodeCryptoDigest, `${vector.name} node:crypto digest must match.`);
  equal(vector.digest, vector.nodeCryptoDigest, `${vector.name} independent digests must agree.`);
}

const derivedVectors = readJson("derived-id-vectors.json") as Array<{
  slot: "pose:1" | "pose:2";
  projectId: string;
  transactionId: string;
  preimageHex: string;
  fullDigest: string;
  derivedId: string;
}>;
for (const vector of derivedVectors) {
  const preimage = buildDerivedPoseIdPreimage(vector.projectId, vector.transactionId, vector.slot);
  equal(hex(preimage), vector.preimageHex, `${vector.slot} preimage must match.`);
  equal(sha256(preimage), vector.fullDigest, `${vector.slot} full digest must match.`);
  equal(await deriveStickPoseId(vector.projectId, vector.transactionId, vector.slot), vector.derivedId, `${vector.slot} ID must match.`);
}
check(derivedVectors[0].derivedId !== derivedVectors[1].derivedId, "The two derived pose IDs must be unique.");

const promptCases = readJson("prompt-normalization-cases.json") as {
  normalizedIntent: string;
  accepted: Array<{name: string; input: string}>;
  rejected: Array<{name: string; input: string}>;
};
for (const testCase of promptCases.accepted) {
  equal(expectOk(normalizeStickAiPrompt(testCase.input), `${testCase.name} prompt must pass`), promptCases.normalizedIntent, `${testCase.name} must normalize exactly.`);
}
for (const testCase of promptCases.rejected) expectError(normalizeStickAiPrompt(testCase.input), "unsupported_prompt", "$prompt");

const lineVectors = readJson("stick-line-head-vectors.json") as {
  vectors: Array<{name: string; head: {x: number; y: number}; expected: unknown}>;
  connectivity: {from: string; to: string};
  storedHeadFields: unknown[];
};
for (const vector of lineVectors.vectors) equal(deriveStickLineHead(vector.head), vector.expected, `${vector.name} line head must match.`);
equal(lineVectors.connectivity, {from: "head", to: "neck"}, "The first body segment must connect head to neck.");
equal(lineVectors.storedHeadFields, [], "No head presentation field may be stored.");

const movedHead = clone(aiApplied);
const movedCell = movedHead.layers[0].cells[0];
if (movedCell.cellType !== "keyframe") assert.fail("Expected first keyframe.");
movedCell.poses[0].points[0].x += 20;
const beforeMove = expectOk(buildStickResolvedRenderInput(aiApplied, 0), "Pre-move render must resolve");
const afterMove = expectOk(buildStickResolvedRenderInput(movedHead, 0), "Post-move render must resolve");
equal(afterMove.lineHead.from.x - beforeMove.lineHead.from.x, 20, "Moving head must move the left endpoint.");
equal(afterMove.lineHead.to.x - beforeMove.lineHead.to.x, 20, "Moving head must move the right endpoint.");
equal(afterMove.segmentsByRole[0].fromPoint.x - beforeMove.segmentsByRole[0].fromPoint.x, 20, "Moving head must move the head-to-neck segment endpoint.");

const editCases = readJson("stick-manual-edit-capability-cases.json") as {
  roles: string[];
  editableScenarios: Array<{document: string; frameIndex: number}>;
  nonEditableScenarios: Array<{frameIndex: number}>;
};
equal(editCases.roles, [...STICK_JOINT_ROLES], "Manual capability table must enumerate all 11 roles exactly.");
for (const scenario of editCases.editableScenarios) {
  const document = readJson<StickProjectDocumentV1>(scenario.document);
  for (const role of STICK_JOINT_ROLES) check(isStickJointManuallyEditable(document, scenario.frameIndex, role), `${role} must be editable in ${scenario.document}.`);
}
const blankDocument = clone(starter);
blankDocument.layers[0].cells[4] = {...blankDocument.layers[0].cells[4], cellType: "keyframe", poses: []};
for (const role of STICK_JOINT_ROLES) check(!isStickJointManuallyEditable(blankDocument, editCases.nonEditableScenarios[0].frameIndex, role), `${role} must not be editable on a blank keyframe.`);

const nonWaveCases = readJson("non-wave-document-cases.json") as {cases: Array<{name: string; operation: string; value: unknown}>};
for (const testCase of nonWaveCases.cases) {
  const document = clone(starter);
  if (testCase.operation === "set-stage") Object.assign(document.coordinateSpace, testCase.value);
  if (testCase.operation === "set-fps") document.fps = testCase.value as number;
  if (testCase.operation === "slice-cells") document.layers[0].cells = document.layers[0].cells.slice(0, testCase.value as number);
  if (testCase.operation === "blank-keyframe") {
    const index = testCase.value as number;
    document.layers[0].cells[index] = {...document.layers[0].cells[index], cellType: "keyframe", poses: []};
  }
  if (testCase.operation === "set-head-x") {
    const cell = document.layers[0].cells[0];
    if (cell.cellType === "keyframe") cell.poses[0].points[0].x = testCase.value as number;
  }
  if (testCase.operation === "set-revision") document.documentRevision = testCase.value as number;
  const parsed = expectOk(parseStickProjectDocument(document), `${testCase.name} non-wave document must remain valid`);
  equal(parseStickProjectDocument(JSON.parse(canonicalJson(parsed))).ok, true, `${testCase.name} must round-trip.`);
  check(!isStickWaveStarter(parsed), `${testCase.name} must not masquerade as the wave starter.`);
}

const invalidCases = readJson("invalid-contract-cases.json") as {
  requiredCategories: string[];
  documentCases: Array<{name: string; category: string; operation: string; field?: string; expectedCode: string; expectedPath: string}>;
  providerCases: Array<{name: string; category: string; operation: string; expectedCode: string}>;
  requestCases: Array<{name: string; category: string; operation: string; expectedCode: string}>;
  manualProgressionCases: Array<{name: string; category: string; prefixActionCount: number; mutation?: string; action: unknown; expectedCode: string}>;
  appliedProfileCases: Array<{name: string; category: string; operation: string}>;
  commandCases: Array<{name: string; category: string; operation: string; recomputeDigest: boolean; expectedCode: string}>;
  inMemoryCases: Array<{name: string; category: string}>;
};
const exercisedInvalidCategories = new Set<string>();
const cover = (category: string) => exercisedInvalidCategories.add(category);
for (const testCase of invalidCases.documentCases) {
  cover(testCase.category);
  const document = clone(testCase.operation === "blank-hold-owner" ? manualApplied : starter) as StickProjectDocumentV1 & Record<string, unknown>;
  const first = document.layers[0].cells[0];
  if (first.cellType !== "keyframe") assert.fail("Expected keyframe.");
  if (testCase.operation === "add-root-field") document.extra = true;
  if (testCase.operation === "add-pose-field") (first.poses[0] as unknown as Record<string, unknown>)[testCase.field!] = true;
  if (testCase.operation === "remove-schema-version") delete (document as Partial<StickProjectDocumentV1>).schemaVersion;
  if (testCase.operation === "set-schema-version") (document as {schemaVersion: number}).schemaVersion = 2;
  if (testCase.operation === "exceed-cell-cap") {
    while (document.layers[0].cells.length <= 240) document.layers[0].cells.push(clone(document.layers[0].cells.at(-1)!));
  }
  if (testCase.operation === "duplicate-figure-rig-id") {
    document.figures[0].figureId = document.rigs[0].rigId;
    first.poses[0].figureId = document.rigs[0].rigId;
  }
  if (testCase.operation === "remove-pose-id") delete (first.poses[0] as Partial<typeof first.poses[0]>).poseId;
  if (testCase.operation === "foreign-figure-rig") document.figures[0].rigId = "00000000-0000-4000-8000-000000009999";
  if (testCase.operation === "derived-rig-id") document.rigs[0].rigId = "pose_00000000000000000000000000000000";
  if (testCase.operation === "fractional-head-x") first.poses[0].points[0].x = 1.5;
  if (testCase.operation === "out-of-bounds-head-x") first.poses[0].points[0].x = 1920;
  if (testCase.operation === "remove-last-point") first.poses[0].points.pop();
  if (testCase.operation === "duplicate-layer") document.layers.push(clone(document.layers[0]));
  if (testCase.operation === "duplicate-figure") document.figures.push(clone(document.figures[0]));
  if (testCase.operation === "add-cell-field") (first as unknown as Record<string, unknown>)[testCase.field!] = true;
  if (testCase.operation === "blank-hold-owner") {
    const owner = document.layers[0].cells[4];
    if (owner.cellType !== "keyframe") assert.fail("Expected Frame 5 keyframe.");
    owner.poses = [];
  }
  const frozen = deepFreeze(document);
  const before = stableSnapshot(frozen);
  expectError(parseStickProjectDocument(frozen), testCase.expectedCode, testCase.expectedPath);
  equal(stableSnapshot(frozen), before, `${testCase.operation} rejection must not mutate input.`);
}

for (const testCase of invalidCases.providerCases) {
  cover(testCase.category);
  const plan = clone(planFixture) as {poses: Array<Record<string, unknown>>} & Record<string, unknown>;
  if (testCase.operation === "swap-beats") [plan.poses[0].beat, plan.poses[1].beat] = [plan.poses[1].beat, plan.poses[0].beat];
  if (testCase.operation === "short-forearm") plan.poses[0].rightHand = {x: 1081, y: 360};
  if (testCase.operation === "duplicate-last-pose") plan.poses.push(clone(plan.poses[2]));
  if (testCase.operation === "wrong-fps") plan.fps = 13;
  if (testCase.operation === "oversized-output") plan.extra = "x".repeat(9_000);
  if (testCase.operation === "add-plan-field") plan.extra = true;
  const frozen = deepFreeze(plan);
  const before = stableSnapshot(frozen);
  expectError(parseStickWaveProviderPlan(frozen), testCase.expectedCode);
  equal(stableSnapshot(frozen), before, `${testCase.operation} provider rejection must not mutate input.`);
}

for (const testCase of invalidCases.requestCases) {
  cover(testCase.category);
  const request = clone(requestFixture) as Record<string, unknown> & {capabilityManifest: {capabilities: string[]}};
  let expectedStarter = starter;
  if (testCase.operation === "wrong-workspace") request.workspaceType = "drawing";
  if (testCase.operation === "wrong-capability") request.capabilityManifest.capabilities[0] = "drawing.generate/v1";
  if (testCase.operation === "wrong-prompt") request.prompt = "Make it dance.";
  if (testCase.operation === "request-version") request.requestVersion = 2;
  if (testCase.operation === "remove-request-version") delete request.requestVersion;
  if (testCase.operation === "non-wave-document") {
    expectedStarter = clone(starter);
    expectedStarter.fps = 13;
  }
  if (testCase.operation === "oversized-body") request.prompt = "x".repeat(17_000);
  const frozen = deepFreeze(request);
  const before = stableSnapshot(frozen);
  expectError(parseStickAiRequest(frozen, expectedStarter), testCase.expectedCode);
  equal(stableSnapshot(frozen), before, `${testCase.operation} request rejection must not mutate input.`);
}

for (const testCase of invalidCases.manualProgressionCases) {
  cover(testCase.category);
  const source = expectOk(
    applyStickManualActions(starter, manualActions.slice(0, testCase.prefixActionCount)),
    `${testCase.name} prefix must be a valid approved state`,
  );
  if (testCase.mutation === "hold-5-owned-by-0") {
    const target = source.layers[0].cells[5];
    if (target.cellType !== "hold") assert.fail("Expected Frame 6 hold.");
    target.ownerFrameId = source.layers[0].cells[0].frameId;
    expectOk(parseStickProjectDocument(source), "Wrong-owner progression source must remain a structurally valid document");
  }
  const frozenSource = deepFreeze(source);
  const frozenAction = deepFreeze(clone(testCase.action));
  const beforeSource = stableSnapshot(frozenSource);
  const beforeAction = stableSnapshot(frozenAction);
  expectError(applyStickManualActions(frozenSource, [frozenAction] as never[]), testCase.expectedCode);
  equal(stableSnapshot(frozenSource), beforeSource, `${testCase.name} progression rejection must not mutate the document.`);
  equal(stableSnapshot(frozenAction), beforeAction, `${testCase.name} progression rejection must not mutate the action.`);
}

for (const testCase of invalidCases.appliedProfileCases) {
  cover(testCase.category);
  const document = clone(manualApplied);
  if (testCase.operation === "replace-project-id") document.projectId = "00000000-0000-4000-8000-000000009901";
  if (testCase.operation === "replace-rig-id") {
    const nextId = "00000000-0000-4000-8000-000000009905";
    document.rigs[0].rigId = nextId;
    document.figures[0].rigId = nextId;
    for (const cell of document.layers[0].cells) if (cell.cellType === "keyframe") for (const pose of cell.poses) pose.rigId = nextId;
  }
  if (testCase.operation === "replace-figure-id") {
    const nextId = "00000000-0000-4000-8000-000000009906";
    document.figures[0].figureId = nextId;
    for (const cell of document.layers[0].cells) if (cell.cellType === "keyframe") for (const pose of cell.poses) pose.figureId = nextId;
  }
  if (testCase.operation === "replace-layer-id") document.layers[0].layerId = "00000000-0000-4000-8000-000000009907";
  if (testCase.operation === "replace-first-frame-id") {
    const oldFrameId = document.layers[0].cells[0].frameId;
    document.layers[0].cells[0].frameId = "00000000-0000-4000-8000-000000009902";
    for (const cell of document.layers[0].cells) {
      if (cell.cellType === "hold" && cell.ownerFrameId === oldFrameId) cell.ownerFrameId = document.layers[0].cells[0].frameId;
    }
  }
  if (testCase.operation === "replace-first-pose-id") {
    const cell = document.layers[0].cells[0];
    if (cell.cellType !== "keyframe") assert.fail("Expected Frame 1 keyframe.");
    cell.poses[0].poseId = "00000000-0000-4000-8000-000000009903";
  }
  if (testCase.operation === "change-ready-elbow") {
    const cell = document.layers[0].cells[0];
    if (cell.cellType !== "keyframe") assert.fail("Expected Frame 1 keyframe.");
    cell.poses[0].points[5].x += 1;
  }
  if (testCase.operation === "change-hold-owner") {
    const cell = document.layers[0].cells[5];
    if (cell.cellType !== "hold") assert.fail("Expected Frame 6 hold.");
    cell.ownerFrameId = document.layers[0].cells[0].frameId;
  }
  if (testCase.operation === "add-keyframe") {
    const source = document.layers[0].cells[8];
    const target = document.layers[0].cells[11];
    if (source.cellType !== "keyframe") assert.fail("Expected Frame 9 keyframe.");
    document.layers[0].cells[11] = {
      frameId: target.frameId,
      index: target.index,
      cellType: "keyframe",
      poses: [{...clone(source.poses[0]), poseId: "00000000-0000-4000-8000-000000009904"}],
    };
  }
  if (testCase.operation === "change-fps") document.fps = 13;
  const parsed = expectOk(parseStickProjectDocument(document), `${testCase.name} masquerade candidate must remain a valid V1 document`);
  check(!isStickManualWaveApplied(parsed, starter), `${testCase.name} must not satisfy the exact applied-wave predicate.`);
}

for (const testCase of invalidCases.commandCases) {
  cover(testCase.category);
  const commandEnvelope = clone(envelopeFixture) as Record<string, unknown> & {
    commands: Array<Record<string, unknown> & {
      frameIds: string[];
      poseEntries: Array<Record<string, unknown> & {pose: {poseId: string; points: Array<{x: number; y: number}>}}>
    }>;
    payloadDigest: string;
  };
  const command = commandEnvelope.commands[0];
  let commandStarter = starter;
  if (testCase.operation === "wrong-action") command.type = "stick.pose-sequence.delete";
  if (testCase.operation === "second-command") commandEnvelope.commands.push(clone(command));
  if (testCase.operation === "add-target-layers") command.targetLayerIds = [command.targetLayerId, "00000000-0000-4000-8000-000000009910"];
  if (testCase.operation === "extra-pose") command.poseEntries.push(clone(command.poseEntries[2]));
  if (testCase.operation === "add-rig-object") command.rig = clone(starter.rigs[0]);
  if (testCase.operation === "add-figure-object") command.figure = clone(starter.figures[0]);
  if (testCase.operation === "add-topology-object") command.topology = {joints: [], segments: []};
  if (testCase.operation === "replace-target-figure") command.targetFigureId = "00000000-0000-4000-8000-000000009911";
  if (testCase.operation === "replace-frame-identity") command.frameIds[0] = "00000000-0000-4000-8000-000000009912";
  if (testCase.operation === "replace-first-pose-identity") command.poseEntries[0].pose.poseId = "00000000-0000-4000-8000-000000009913";
  if (testCase.operation === "remove-command-version") delete commandEnvelope.commandVersion;
  if (testCase.operation === "unsupported-envelope-version") commandEnvelope.envelopeVersion = 2;
  if (testCase.operation === "remove-pose") command.poseEntries.pop();
  if (testCase.operation === "duplicate-beat") command.poseEntries[1].beat = "ready";
  if (testCase.operation === "swap-pose-entries") [command.poseEntries[0], command.poseEntries[1]] = [command.poseEntries[1], command.poseEntries[0]];
  if (testCase.operation === "duplicate-sequence") command.poseEntries[1].sequenceIndex = 0;
  if (testCase.operation === "wrong-hold-timing") command.holdFramesPerPose = 3;
  if (testCase.operation === "wrong-keyframe-index") command.keyframeIndexes = [0, 5, 8];
  if (testCase.operation === "wrong-starter-cardinality") {
    commandStarter = clone(starter);
    commandStarter.layers[0].cells.pop();
  }
  if (testCase.operation === "unsafe-arm-valid-digest") {
    command.poseEntries[1].pose.points[5] = {...command.poseEntries[1].pose.points[5], x: 0, y: 0};
    command.poseEntries[1].pose.points[6] = {...command.poseEntries[1].pose.points[6], x: 0, y: 0};
  }
  if (testCase.operation === "change-fixed-body") command.poseEntries[1].pose.points[0].x += 1;
  if (testCase.operation === "digest-mismatch") commandEnvelope.payloadDigest = `sha256:${"0".repeat(64)}`;
  if (testCase.recomputeDigest) commandEnvelope.payloadDigest = await digestCanonical(commandEnvelope.commands);
  const frozenEnvelope = deepFreeze(commandEnvelope);
  const frozenStarter = deepFreeze(commandStarter);
  const beforeEnvelope = stableSnapshot(frozenEnvelope);
  const beforeStarter = stableSnapshot(frozenStarter);
  expectError(await parseStickCommandBatch(frozenEnvelope, frozenStarter), testCase.expectedCode);
  equal(stableSnapshot(frozenEnvelope), beforeEnvelope, `${testCase.name} command rejection must not mutate the envelope.`);
  equal(stableSnapshot(frozenStarter), beforeStarter, `${testCase.name} command rejection must not mutate the starter.`);
}

for (const testCase of invalidCases.inMemoryCases) {
  cover(testCase.category);
  const document = clone(starter);
  const first = document.layers[0].cells[0];
  if (first.cellType !== "keyframe") assert.fail("Expected keyframe.");
  if (testCase.name === "nan-coordinate") first.poses[0].points[0].x = Number.NaN;
  if (testCase.name === "positive-infinity-coordinate") first.poses[0].points[0].x = Number.POSITIVE_INFINITY;
  if (testCase.name === "negative-infinity-coordinate") first.poses[0].points[0].x = Number.NEGATIVE_INFINITY;
  if (testCase.name === "sparse-points") delete first.poses[0].points[0];
  if (testCase.name === "accessor-field") Object.defineProperty(first.poses[0], "poseId", {get: () => starter.projectId, enumerable: true});
  if (testCase.name === "symbol-key") (first.poses[0] as unknown as Record<symbol, unknown>)[Symbol("secret")] = true;
  const frozen = deepFreeze(document);
  const before = stableSnapshot(frozen);
  const result = parseStickProjectDocument(frozen);
  check(!result.ok, `${testCase.name} must reject.`);
  equal(stableSnapshot(frozen), before, `${testCase.name} rejection must not mutate input.`);
}

equal(
  [...exercisedInvalidCategories].sort(),
  [...invalidCases.requiredCategories].sort(),
  "The validator must execute every required invalid-contract category exactly from the checked-in matrix.",
);

const contractSources = [
  readFileSync(resolve(ROOT, "src/lib/stickfigure/stickProjectContract.ts"), "utf8"),
  readFileSync(resolve(ROOT, "src/lib/ai/stickFigureAiContract.ts"), "utf8"),
].join("\n");
for (const forbidden of ["drawingAiContract", "drawingAiTaskExecution", "drawingProjectStorage", "node:crypto", "openai", "supabase", "app/api/ai"]) {
  check(!contractSources.toLowerCase().includes(forbidden.toLowerCase()), `Shared contracts must not import or reference ${forbidden}.`);
}

check(typeof TextEncoder === "function", "TextEncoder must be available.");
check(Boolean(globalThis.crypto?.subtle), "WebCrypto subtle must be available.");
console.log(`SPEC-0001 Phase 1 contract validation passed (${assertions} assertions, Node ${process.version}, TextEncoder yes, WebCrypto yes).`);
