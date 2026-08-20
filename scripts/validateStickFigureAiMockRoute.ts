import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {readFileSync} from "node:fs";
import {spawnSync} from "node:child_process";
import {resolve} from "node:path";
import {
  buildDeterministicStickFigureAiMockEnvelope,
} from "../src/lib/ai/stickFigureAiMockServer.ts";
import {
  resolveStickFigureAiAvailability,
} from "../src/lib/ai/stickFigureAiAvailability.ts";
import {
  STICK_FIGURE_AI_WORKSPACE_HEADER,
  dispatchStickFigureAiPost,
  handleStickFigureAiAvailabilityGet,
} from "../src/lib/ai/stickFigureAiServerDispatch.ts";
import {
  STICK_AI_REQUEST_BYTE_LIMIT,
  parseStrictStickJsonBytes,
} from "../src/lib/ai/strictStickJson.ts";

type JsonRecord = Record<string, unknown>;
type ByteBinding = {encoding: "base64"; byteLength: number; sha256: string; data: string};

const ROOT = process.cwd();
const FIXTURE_ROOT = "scripts/fixtures/stick-ai/v1";
const BASE = "a2b4f3e0fc492df9cd63bda32554e382a344cdb6";
const readJson = <T,>(path: string) => JSON.parse(readFileSync(resolve(ROOT, path), "utf8")) as T;
const sha256 = (bytes: Uint8Array) => `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
const decodeBinding = (binding: ByteBinding) => {
  assert.equal(binding.encoding, "base64");
  const bytes = Buffer.from(binding.data, "base64");
  assert.equal(bytes.byteLength, binding.byteLength);
  assert.equal(sha256(bytes), binding.sha256);
  return bytes;
};
const clone = <T,>(value: T): T => structuredClone(value);
const setPath = (root: JsonRecord, path: string, value: unknown) => {
  const parts = path.split(".");
  let target = root;
  for (const part of parts.slice(0, -1)) {
    const next = target[part];
    assert.ok(next !== null && typeof next === "object" && !Array.isArray(next));
    target = next as JsonRecord;
  }
  target[parts.at(-1)!] = value;
};
const gitShow = (path: string) => {
  const result = spawnSync("/usr/bin/git", ["show", `${BASE}:${path}`], {cwd: ROOT, encoding: "utf8", shell: false});
  assert.equal(result.status, 0, result.stderr || `Unable to read base ${path}.`);
  return result.stdout;
};

let assertions = 0;
const ok = (value: unknown, message: string) => {
  assert.ok(value, message);
  assertions += 1;
};
const equal = (actual: unknown, expected: unknown, message: string) => {
  assert.deepEqual(actual, expected, message);
  assertions += 1;
};

const availabilityFixture = readJson<{
  fixtureVersion: number;
  reasonCodes: string[];
  cases: Array<{caseId: string; environment: {nodeEnv: string; configuredMode: string | undefined}; expected: {available: boolean; reason: string}}>;
  contradictoryPairs: Array<[string, string]>;
}>(`${FIXTURE_ROOT}/stick-ai-availability-cases.json`);
equal(availabilityFixture.fixtureVersion, 1, "availability fixture version");
equal(availabilityFixture.reasonCodes, ["available", "capability_disabled", "server_not_configured", "production_forbidden", "temporarily_unavailable"], "availability reason set");
for (const testCase of availabilityFixture.cases) {
  const observed = resolveStickFigureAiAvailability(testCase.environment);
  equal(observed, testCase.expected, `${testCase.caseId} availability`);
  equal(Object.keys(observed).sort(), ["available", "reason"], `${testCase.caseId} coarse response fields`);
  ok(!JSON.stringify(observed).includes(String(testCase.environment.configuredMode ?? "__absent_mode__")), `${testCase.caseId} does not reveal configured mode`);
}
for (const [left, right] of availabilityFixture.contradictoryPairs) {
  ok(left !== right && left === "available", `contradictory pair ${left}/${right} is explicit`);
}

const mockFixture = readJson<{
  fixtureVersion: number;
  requestFixture: string;
  envelopeFixture: string;
  providerPlanFixture: string;
  cases: Array<{caseId: string; mutation: null | {path: string; value: unknown}; expected: {ok: boolean; errorCode: string | null}}>;
  repeatabilityRuns: number;
}>(`${FIXTURE_ROOT}/stick-ai-mock-server-cases.json`);
equal(mockFixture.fixtureVersion, 1, "mock fixture version");
const goldenRequest = readJson<JsonRecord>(mockFixture.requestFixture);
const goldenEnvelope = readJson<JsonRecord>(mockFixture.envelopeFixture);
readJson<JsonRecord>(mockFixture.providerPlanFixture);
for (const testCase of mockFixture.cases) {
  const input = clone(goldenRequest);
  if (testCase.mutation) setPath(input, testCase.mutation.path, testCase.mutation.value);
  const result = await buildDeterministicStickFigureAiMockEnvelope(input);
  equal(result.ok, testCase.expected.ok, `${testCase.caseId} mock disposition`);
  if (result.ok) equal(result.value, goldenEnvelope, `${testCase.caseId} exact checked-in envelope`);
  else equal(result.error.code, testCase.expected.errorCode, `${testCase.caseId} mock error code`);
}
for (let run = 0; run < mockFixture.repeatabilityRuns; run += 1) {
  const result = await buildDeterministicStickFigureAiMockEnvelope(clone(goldenRequest));
  ok(result.ok, `repeatability run ${run + 1} succeeds`);
  if (result.ok) equal(result.value, goldenEnvelope, `repeatability run ${run + 1} is byte-semantic exact`);
}

const registry = readJson<{
  registryVersion: number;
  specId: string;
  authorizationId: string;
  operationFamilies: string[];
  cases: Array<{
    caseId: string;
    operationKind: "marked-availability-get" | "marked-raw-stick-post" | "marker-free-drawing-fallthrough-post";
    request: {method: "GET" | "POST"; path: string; headers: Array<[string, string]>; body: ByteBinding};
    expected: {
      outcome: "exact-response" | "legacy-fallthrough";
      status: number;
      headers: Array<[string, string]>;
      body: null | {byteLength: number; sha256: string};
      legacyCheckpoint: null | {checkpointKind: string; expectedJsonFields: JsonRecord};
      logAssertions: {forbiddenSubstrings: string[]; rawBodyMustNotAppear: boolean};
      nonLoopbackAttempts: number;
    };
  }>;
}>(`${FIXTURE_ROOT}/stick-ai-raw-route-cases.json`);
equal(registry.registryVersion, 5, "raw route registry version");
equal(registry.specId, "SPEC-0001", "raw route registry spec");
equal(registry.authorizationId, "phase-5/v1", "raw route authorization");
equal(registry.operationFamilies, ["guarded-http", "runner-environment"], "raw route operation families");
equal(new Set(registry.cases.map((entry) => entry.caseId)).size, registry.cases.length, "raw route case IDs are unique");
equal(new Set(registry.cases.map((entry) => entry.operationKind)).size, 3, "all three route operation kinds are present");

let deniedFetches = 0;
const originalFetch = globalThis.fetch;
globalThis.fetch = (() => {
  deniedFetches += 1;
  throw new Error("Phase 5 source validator denied fetch.");
}) as typeof fetch;
try {
  for (const testCase of registry.cases) {
    const rawBytes = decodeBinding(testCase.request.body);
    const headerRecord = Object.fromEntries(
      testCase.request.headers.filter(([name]) => name === "content-type" || name === STICK_FIGURE_AI_WORKSPACE_HEADER),
    );
    const request = new Request(`http://phase5.invalid${testCase.request.path}`, {
      method: testCase.request.method,
      headers: headerRecord,
      ...(testCase.request.method === "POST" ? {body: rawBytes} : {}),
    });
    if (testCase.operationKind === "marked-availability-get") {
      const response = handleStickFigureAiAvailabilityGet(request, {nodeEnv: "development", configuredMode: "mock"});
      equal(response.status, testCase.expected.status, `${testCase.caseId} direct status`);
      const responseBytes = new Uint8Array(await response.arrayBuffer());
      ok(testCase.expected.body !== null, `${testCase.caseId} has exact response binding`);
      if (testCase.expected.body) {
        equal({byteLength: responseBytes.byteLength, sha256: sha256(responseBytes)}, testCase.expected.body, `${testCase.caseId} exact response bytes`);
      }
      continue;
    }

    const bodyUsedBefore = request.bodyUsed;
    const response = await dispatchStickFigureAiPost(request, {nodeEnv: "development", configuredMode: "mock"});
    equal(bodyUsedBefore, false, `${testCase.caseId} original starts unread`);
    equal(request.bodyUsed, false, `${testCase.caseId} dispatcher leaves original unread`);
    if (testCase.expected.outcome === "legacy-fallthrough") {
      equal(response, null, `${testCase.caseId} falls through`);
      const originalBytes = new Uint8Array(await request.arrayBuffer());
      equal(Buffer.from(originalBytes), rawBytes, `${testCase.caseId} original raw bytes survive exactly`);
      continue;
    }
    ok(response !== null, `${testCase.caseId} captured response exists`);
    if (!response) continue;
    equal(response.status, testCase.expected.status, `${testCase.caseId} direct status`);
    const responseBytes = new Uint8Array(await response.arrayBuffer());
    ok(testCase.expected.body !== null, `${testCase.caseId} exact response body is bound`);
    if (testCase.expected.body) {
      equal({byteLength: responseBytes.byteLength, sha256: sha256(responseBytes)}, testCase.expected.body, `${testCase.caseId} exact response bytes`);
    }
    for (const forbidden of testCase.expected.logAssertions.forbiddenSubstrings) {
      ok(!new TextDecoder().decode(responseBytes).includes(forbidden), `${testCase.caseId} response excludes protected text`);
    }
  }
} finally {
  globalThis.fetch = originalFetch;
}
equal(deniedFetches, 0, "mock/parser/availability performs zero fetches");

const caseById = new Map(registry.cases.map((entry) => [entry.caseId, entry]));
const strictCase = (caseId: string) => parseStrictStickJsonBytes(decodeBinding(caseById.get(caseId)!.request.body));
equal(strictCase("exact-16384-byte-request").rawUtf8ByteLength, STICK_AI_REQUEST_BYTE_LIMIT, "exact raw limit");
equal(strictCase("plus-one-16385-byte-request").rawUtf8ByteLength, STICK_AI_REQUEST_BYTE_LIMIT + 1, "plus-one raw limit");
equal(strictCase("captured-invalid-utf8").ok, false, "invalid UTF-8 rejects");
equal(strictCase("captured-utf8-bom").ok, false, "BOM rejects");
for (const caseId of ["root-duplicate-marker-first", "root-duplicate-marker-last", "escape-equivalent-duplicate", "nested-duplicate-marker", "unrelated-duplicate-before-marker"]) {
  const result = strictCase(caseId);
  ok(!result.ok && result.error.code === "duplicate_key" && result.markers.length > 0, `${caseId} rejects duplicate and preserves marker evidence`);
}
equal(strictCase("marker-before-later-syntax").markers, [{path: "$.kind"}], "marker before later syntax is retained");
equal(strictCase("syntax-before-marker").markers, [], "syntax before marker has no invented evidence");
equal(strictCase("marker-like-prompt-string").markers, [], "marker-like prompt text is ignored");

const routePath = "app/api/ai/route.ts";
const currentRoute = readFileSync(resolve(ROOT, routePath), "utf8");
const baseRoute = gitShow(routePath);
const drawingAnchor = '  let prompt = "";';
const currentDrawingIndex = currentRoute.indexOf(drawingAnchor);
const baseDrawingIndex = baseRoute.indexOf(drawingAnchor);
ok(currentDrawingIndex > 0 && baseDrawingIndex > 0, "Drawing initialization anchors exist");
equal(currentRoute.slice(currentDrawingIndex), baseRoute.slice(baseDrawingIndex), "entire Drawing POST body remains byte-identical after the dispatch branch");
const postPrefix = currentRoute.slice(currentRoute.indexOf("export async function POST"), currentDrawingIndex);
equal(
  postPrefix,
  'export async function POST(req: Request) {\n  const stickFigureAiResponse = await dispatchStickFigureAiPost(req);\n  if (stickFigureAiResponse !== null) return stickFigureAiResponse;\n\n',
  "Stick dispatch is the literal first POST operation",
);
ok(currentRoute.includes("export async function GET(req: Request)"), "marked availability GET is wired");
ok(currentRoute.includes("const requestBody: unknown = await req.json();"), "original Drawing req.json remains present");

for (const path of [
  "src/lib/ai/stickFigureAiServerDispatch.ts",
  "src/lib/ai/stickFigureAiMockServer.ts",
  "src/lib/ai/stickFigureAiAvailability.ts",
  "src/lib/ai/strictStickJson.ts",
]) {
  const source = readFileSync(resolve(ROOT, path), "utf8");
  for (const forbidden of ["generateAiText", "searchInternet", "@supabase", "localStorage", "sessionStorage", "indexedDB", "appendDevAiCostLogEntry"]) {
    ok(!source.includes(forbidden), `${path} excludes ${forbidden}`);
  }
}
const envExample = readFileSync(resolve(ROOT, ".env.example"), "utf8");
ok(envExample.includes("DIAMOND_STICK_AI_V1_MODE="), "blank Stick mode example exists");
ok(!/DIAMOND_STICK_AI_V1_MODE=(?:off|mock|live)\b/.test(envExample), "Stick mode example stores no value");

console.log(`SPEC-0001 Phase 5 source-direct mock/raw-route validation PASS: ${assertions} assertions, ${registry.cases.length} exact raw cases, zero fetch/editor/history/storage calls, Drawing body byte-identical.`);
