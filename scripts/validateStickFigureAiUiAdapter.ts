import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import {
  STICK_AI_CAPABILITY_MANIFEST,
  STICK_AI_CAPABILITY_MANIFEST_V2,
  applyStickCommandBatch,
  buildStickAiProjectContext,
  parseStickAiRequest,
  parseStickCommandBatch,
  type StickAiRequestV2,
  type StickCommandBatchV1,
  type StickCommandBatchV2,
} from "../src/lib/ai/stickFigureAiContract.ts";
import {
  STICK_AI_CANONICAL_INTENT_V2,
  STICK_AI_TYPO_MAP_V2,
  interpretStickAiPromptV2,
  validateStickAiTypoMapV2,
} from "../src/lib/ai/stickFigureAiIntentMatcher.ts";
import {
  STICK_FIGURE_AI_MOCK_STARTER,
  buildDeterministicStickFigureAiMockEnvelope,
} from "../src/lib/ai/stickFigureAiMockServer.ts";
import {
  STICK_AI_EDITOR_RENDER_SPACE_V2,
  StickFigureAiWorkspaceAdapterV2,
  isStickAiCanonicalStructureGraphV2,
  type StickAiWorkspaceSnapshotV2,
} from "../src/lib/ai/stickFigureAiWorkspaceAdapter.ts";
import {
  canonicalJson,
  projectStickAnimationContent,
  type StickProjectDocumentV1,
} from "../src/lib/stickfigure/stickProjectContract.ts";

const ROOT = process.cwd();
const V1 = resolve(ROOT, "scripts/fixtures/stick-ai/v1");
const V2 = resolve(ROOT, "scripts/fixtures/stick-ai/v2");
const readJson = <T,>(path: string): T => JSON.parse(readFileSync(path, "utf8")) as T;
const clone = <T,>(value: T): T => structuredClone(value);
let assertions = 0;
const equal = (actual: unknown, expected: unknown, message: string) => {
  assert.deepEqual(actual, expected, message);
  assertions += 1;
};
const check: (condition: unknown, message: string) => asserts condition = (condition, message) => {
  assert.ok(condition, message);
  assertions += 1;
};

type AcceptedCase = {
  id: string;
  prompt: string;
  defaults: string[];
  corrections: Array<[string, string, number]>;
  numericCorrection: "122-fps-to-12" | null;
};
type RejectedCase = {
  id: string;
  prompt?: string;
  promptConstruction?: {baseAcceptedId: string; trailingAsciiSpaces: number; expectedUtf8Bytes: number};
  reason: string;
};
type IntentFixture = {
  fixtureVersion: number;
  canonicalIntent: unknown;
  accepted: AcceptedCase[];
  rejected: RejectedCase[];
};

const intentFixture = readJson<IntentFixture>(resolve(V2, "stick-ai-intent-cases.json"));
equal(intentFixture.fixtureVersion, 2, "V2 intent fixture version");
equal(intentFixture.canonicalIntent, STICK_AI_CANONICAL_INTENT_V2, "canonical V2 intent object");
equal(intentFixture.accepted.map((entry) => entry.id), Array.from({length: 15}, (_, index) => `A${String(index + 1).padStart(2, "0")}`), "exact accepted case set");
equal(intentFixture.rejected.map((entry) => entry.id), Array.from({length: 36}, (_, index) => `R${String(index + 1).padStart(2, "0")}`), "exact rejected case set");
equal(validateStickAiTypoMapV2(), {ok: true}, "audited typo map validity");
equal(Object.keys(STICK_AI_TYPO_MAP_V2), ["plese","craete","creat","maek","animte","simlpe","pses","stik","stcik","figuer","fgiure","onne","singel","wwave","waev","waevs","wavig","animaton","animtion","fpps"], "exact typo-map source set");

const promptById = new Map(intentFixture.accepted.map((entry) => [entry.id, entry.prompt]));
for (const testCase of intentFixture.accepted) {
  const result = interpretStickAiPromptV2(testCase.prompt);
  check(result.ok, `${testCase.id} must accept`);
  if (!result.ok) continue;
  equal(result.value.intent, STICK_AI_CANONICAL_INTENT_V2, `${testCase.id} canonical intent`);
  equal(result.value.defaults, testCase.defaults, `${testCase.id} defaults`);
  equal(result.value.corrections.map((entry) => [entry.source, entry.target, entry.distance]), testCase.corrections, `${testCase.id} corrections`);
  equal(result.value.numericCorrection, testCase.numericCorrection, `${testCase.id} numeric correction`);
}
for (const testCase of intentFixture.rejected) {
  let prompt = testCase.prompt;
  if (testCase.promptConstruction) {
    const base = promptById.get(testCase.promptConstruction.baseAcceptedId);
    check(base, `${testCase.id} construction base exists`);
    prompt = `${base}${" ".repeat(testCase.promptConstruction.trailingAsciiSpaces)}`;
    equal(new TextEncoder().encode(prompt).byteLength, testCase.promptConstruction.expectedUtf8Bytes, `${testCase.id} raw byte construction`);
  }
  check(typeof prompt === "string", `${testCase.id} prompt materialized`);
  const result = interpretStickAiPromptV2(prompt);
  check(!result.ok, `${testCase.id} must reject`);
  if (!result.ok) equal(result.error.reason, testCase.reason, `${testCase.id} exact rejection reason`);
}

const projectContext = await buildStickAiProjectContext(STICK_FIGURE_AI_MOCK_STARTER);
if (!projectContext.ok) assert.fail(projectContext.error.message);
assertions += 1;
const fixedIds = {
  requestId: "10000000-0000-4000-8000-000000000001",
  transactionId: "10000000-0000-4000-8000-000000000002",
};
let firstEnvelope: StickCommandBatchV2 | null = null;
const originalFetch = globalThis.fetch;
let deniedFetches = 0;
globalThis.fetch = (() => {
  deniedFetches += 1;
  throw new Error("Phase 6 deterministic mock attempted network access.");
}) as typeof fetch;
try {
  for (const testCase of intentFixture.accepted) {
    const request: StickAiRequestV2 = {
      kind: "stick-ai-request",
      requestVersion: 2,
      ...fixedIds,
      workspaceType: "stick-figure",
      prompt: testCase.prompt,
      capabilityManifest: STICK_AI_CAPABILITY_MANIFEST_V2,
      projectContext: projectContext.value,
    };
    const parsedRequest = parseStickAiRequest(request, STICK_FIGURE_AI_MOCK_STARTER);
    check(parsedRequest.ok, `${testCase.id} server request parse`);
    const mock = await buildDeterministicStickFigureAiMockEnvelope(request);
    check(mock.ok, `${testCase.id} deterministic server response`);
    if (!mock.ok) continue;
    const parsedEnvelope = await parseStickCommandBatch(mock.value, STICK_FIGURE_AI_MOCK_STARTER);
    check(parsedEnvelope.ok, `${testCase.id} V2 envelope parse`);
    if (!parsedEnvelope.ok) continue;
    const envelope = parsedEnvelope.value as unknown as StickCommandBatchV2;
    equal(envelope.interpretedIntent, STICK_AI_CANONICAL_INTENT_V2, `${testCase.id} server-authoritative intent`);
    equal(envelope.requestId, request.requestId, `${testCase.id} request binding`);
    equal(envelope.transactionId, request.transactionId, `${testCase.id} transaction binding`);
    if (firstEnvelope === null) firstEnvelope = envelope;
    else equal(canonicalJson(envelope), canonicalJson(firstEnvelope), `${testCase.id} one canonical server result`);
  }
} finally {
  globalThis.fetch = originalFetch;
}
equal(deniedFetches, 0, "pretend AI performs no fetch/provider call");
check(firstEnvelope, "one V2 envelope captured");

const v1Request = readJson<Record<string, unknown>>(resolve(V1, "wave-request.json"));
const v1Envelope = readJson<Record<string, unknown>>(resolve(V1, "wave-command-batch.json"));
const v1Mock = await buildDeterministicStickFigureAiMockEnvelope(v1Request);
check(v1Mock.ok, "published V1 request still succeeds");
if (v1Mock.ok) equal(v1Mock.value, v1Envelope, "published V1 envelope remains byte-semantic exact");

const v2Request: StickAiRequestV2 = {
  kind: "stick-ai-request",
  requestVersion: 2,
  ...fixedIds,
  workspaceType: "stick-figure",
  prompt: intentFixture.accepted[0].prompt,
  capabilityManifest: STICK_AI_CAPABILITY_MANIFEST_V2,
  projectContext: projectContext.value,
};
const mixedV2Request = clone(v2Request) as unknown as Record<string, unknown>;
mixedV2Request.capabilityManifest = STICK_AI_CAPABILITY_MANIFEST;
equal(parseStickAiRequest(mixedV2Request, STICK_FIGURE_AI_MOCK_STARTER).ok, false, "V2 request rejects V1 manifest");
const mixedV1Request = clone(v1Request);
mixedV1Request.capabilityManifest = STICK_AI_CAPABILITY_MANIFEST_V2;
equal(parseStickAiRequest(mixedV1Request, STICK_FIGURE_AI_MOCK_STARTER).ok, false, "V1 request rejects V2 manifest");
const absentIntent = clone(firstEnvelope) as unknown as Record<string, unknown>;
delete absentIntent.interpretedIntent;
equal((await parseStickCommandBatch(absentIntent, STICK_FIGURE_AI_MOCK_STARTER)).ok, false, "V2 envelope rejects absent intent");
const changedIntent = clone(firstEnvelope) as unknown as {interpretedIntent: {fps: number}};
changedIntent.interpretedIntent.fps = 13;
equal((await parseStickCommandBatch(changedIntent, STICK_FIGURE_AI_MOCK_STARTER)).ok, false, "V2 envelope rejects non-canonical intent");

const applied = await applyStickCommandBatch(STICK_FIGURE_AI_MOCK_STARTER, firstEnvelope as unknown as StickCommandBatchV1);
check(applied.ok, "V2 envelope applies through the published command authority");
const manual = readJson<StickProjectDocumentV1>(resolve(V1, "manual-wave-applied-project.json"));
if (applied.ok) equal(projectStickAnimationContent(applied.value), projectStickAnimationContent(manual), "mocked AI and manual animation content are equivalent");

const baseSnapshot: StickAiWorkspaceSnapshotV2 = {
  workspaceInstanceId: "workspace-a",
  workspaceGeneration: 3,
  projectId: STICK_FIGURE_AI_MOCK_STARTER.projectId,
  documentRevision: 0,
  documentDigest: projectContext.value.baseDocumentDigest,
  ready: true,
  eligible: true,
  aiCreationConsumed: false,
  playing: false,
};
let liveSnapshot = clone(baseSnapshot);
let previewCalls = 0;
let applyCalls = 0;
let cancelCalls = 0;
const adapter = new StickFigureAiWorkspaceAdapterV2({
  getSnapshot: () => liveSnapshot,
  preview: async () => (previewCalls += 1, {accepted: true, outcomeCode: "previewed", errorCode: null}),
  cancel: async () => (cancelCalls += 1, {accepted: true, outcomeCode: "preview_cancelled", errorCode: null}),
  apply: async () => (applyCalls += 1, {accepted: true, outcomeCode: "applied", errorCode: null}),
});
const binding = adapter.captureBinding();
check(binding, "eligible ready snapshot captures an adapter binding");
equal(await adapter.preview(binding!, firstEnvelope as unknown as StickCommandBatchV1), {accepted: true, outcomeCode: "previewed", errorCode: null}, "matching preview reaches Phase 4 port");
equal(previewCalls, 1, "preview port called exactly once");
for (const [field, value] of [
  ["workspaceInstanceId", "workspace-b"], ["workspaceGeneration", 4], ["projectId", "20000000-0000-4000-8000-000000000001"],
  ["documentRevision", 1], ["documentDigest", "sha256:ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff"],
  ["ready", false], ["playing", true], ["aiCreationConsumed", true],
] as const) {
  liveSnapshot = {...baseSnapshot, [field]: value};
  equal(await adapter.apply(binding!, firstEnvelope as unknown as StickCommandBatchV1), {accepted: false, outcomeCode: "rejected", errorCode: "stale_document"}, `adapter rejects changed ${field}`);
}
equal(applyCalls, 0, "stale/project-switch/playing states never reach Apply port");
liveSnapshot = clone(baseSnapshot);
equal(await adapter.apply(binding!, firstEnvelope as unknown as StickCommandBatchV1), {accepted: true, outcomeCode: "applied", errorCode: null}, "matching Apply reaches Phase 4 port");
equal(applyCalls, 1, "Apply port called exactly once");
await adapter.cancel(firstEnvelope as unknown as StickCommandBatchV1);
equal(cancelCalls, 1, "Cancel is delegated to the transaction authority exactly once");
liveSnapshot.eligible = false;
equal(adapter.captureBinding(), null, "ineligible project cannot capture an AI binding");

const canonicalRig = STICK_FIGURE_AI_MOCK_STARTER.rigs[0];
const canonicalGraph = {
  joints: canonicalRig.joints.map((joint) => ({id: joint.jointId})),
  limbs: canonicalRig.segments.map((segment) => ({id: segment.segmentId, startJointId: segment.fromJointId, endJointId: segment.toJointId})),
};
equal(STICK_AI_EDITOR_RENDER_SPACE_V2, {width: 960, height: 594}, "canonical editable render space");
equal(isStickAiCanonicalStructureGraphV2(canonicalGraph), true, "canonical built-in graph selects responsive projection");
equal(isStickAiCanonicalStructureGraphV2({...canonicalGraph, joints: canonicalGraph.joints.slice(1)}), false, "incomplete graph cannot select responsive projection");

const uiFixture = readJson<{fixtureVersion: number; previewCopy: string; cases: Array<{id: string}>}>(resolve(V2, "stick-ai-ui-cases.json"));
equal(uiFixture.fixtureVersion, 2, "UI fixture version");
equal(uiFixture.previewCopy, "Understood: one stick figure, a three-pose wave, 12 frames at 12 FPS. No changes have been made.", "exact preview copy fixture");
equal(new Set(uiFixture.cases.map((entry) => entry.id)).size, uiFixture.cases.length, "UI case IDs unique");
const creatorFixture = readJson<{fixtureVersion: number; cases: Array<{id: string}>}>(resolve(V2, "stick-ai-creator-preservation-cases.json"));
equal(creatorFixture.fixtureVersion, 2, "Creator fixture version");
equal(creatorFixture.cases.map((entry) => entry.id), ["fresh-starter", "after-ai-apply", "after-save-open", "drawing-isolation"], "Creator preservation case set");
const panelSource = readFileSync(resolve(ROOT, "src/components/workspace/stickfigure/StickFigureAiPanel.tsx"), "utf8");
check(panelSource.includes(uiFixture.previewCopy), "panel derives the exact preview copy from validated response flow");
check(panelSource.includes('const IDLE_COPY = "Ask the assistant for help with your stick figure."'), "panel restores exact transparent idle copy");
check(panelSource.includes('placeholder="Chat here"'), "panel restores exact composer placeholder");
check(panelSource.includes('aria-label="Send Stick Figure AI request"'), "panel exposes the checkmark submit accessibly");
check(panelSource.includes("width: 28, height: 28") && panelSource.includes('background: "rgba(255,255,255,0.96)"'), "panel restores the original white 28px circular submit styling");
check(!panelSource.includes(">Preview<") && !panelSource.includes("Create a three-pose wave") && !panelSource.includes("Pretend AI"), "panel has no rejected Preview label, suggestion, or shortcut disclosure");
check(!/openai|supabase/i.test(panelSource), "panel contains no provider or Supabase integration");
const sharedShellSource = readFileSync(resolve(ROOT, "src/components/workspace/ai/WorkspaceAiPanelShell.tsx"), "utf8");
check(sharedShellSource.includes("Generate frames • Clean drawings • Animate faster"), "shared shell retains exact protected helper copy");
check(sharedShellSource.includes("AI\n            <br />\n            ANIMATOR"), "shared shell retains exact protected AI ANIMATOR title");

console.log(`Stick Figure AI V2 UI/adapter validation PASS: ${assertions} assertions, 15 accepted prompts, 36 rejected prompts, V1 preserved, protected initial presentation, deterministic server parity, responsive canonical-graph selection, stale binding protection, and manual-content equivalence.`);
