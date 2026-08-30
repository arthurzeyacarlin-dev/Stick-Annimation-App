import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {existsSync, lstatSync, readFileSync, realpathSync} from "node:fs";
import {relative, resolve, sep} from "node:path";

export type JsonObject = Record<string, unknown>;
export type FileBinding = {path: string; sha256: string; byteLength: number};
export type Spec0003StickAvailabilityRecord = {
  order: number;
  context: string;
  method: "GET";
  origin: string;
  path: "/api/ai";
  search: "";
  hash: "";
  workspaceHeader: "stick-figure";
  acceptHeader: "application/json";
  body: null;
  response: typeof SPEC0003_STICK_AVAILABILITY_RESPONSE;
};

export const SPEC0003_BASE_COMMIT = "57ef6ff5ff9d2da7ca3ab1e154aac9f506cc6b81";
export const SPEC0003_PRODUCT_RUNTIME_REFERENCE = "4cd1a98b2f0b53c89d50ede453d1ab14bccbc9c7";
export const SPEC0003_PROOF_ROOT = "output/spec-0003/permanent-tester-prerequisite";
export const SPEC0003_MANIFEST_PATH = `${SPEC0003_PROOF_ROOT}/proof-manifest.json`;
export const SPEC0003_COMMANDS_PATH = "scripts/fixtures/spec0001-browser/spec0003-prerequisite/v1/proof-commands.json";
export const SPEC0003_CONTRACT_PATH = "scripts/fixtures/spec0001-browser/spec0003-prerequisite/v1/stick-availability-contract.json";
export const SPEC0003_SCHEMA_PATH = "scripts/fixtures/spec0001-browser/spec0003-prerequisite/v1/proof-manifest.schema.json";
export const SPEC0003_AUTHORIZED_PATHS = [
  "scripts/fixtures/spec0001-browser/spec0003-prerequisite/v1/proof-commands.json",
  "scripts/fixtures/spec0001-browser/spec0003-prerequisite/v1/proof-manifest.schema.json",
  "scripts/fixtures/spec0001-browser/spec0003-prerequisite/v1/stick-availability-contract.json",
  "scripts/runSpec0001BrowserProof.ts",
  "scripts/spec0001-browser/recordSpec0003TesterCompatibilityProof.ts",
  "scripts/spec0001-browser/spec0003TesterCompatibilityContract.ts",
  "scripts/spec0001-browser/validateSpec0003TesterCompatibilityProof.ts",
] as const;
export const SPEC0003_EXPECTED_CONTEXTS = [
  "stick-1440x900",
  "stick-1440x900",
  "stick-1024x768",
  "stick-1024x768",
] as const;
export const SPEC0003_STICK_AVAILABILITY_RESPONSE = Object.freeze({
  status: 200 as const,
  headers: Object.freeze({
    "cache-control": "no-store",
    "content-type": "application/json",
  }),
  body: "{\"available\":false,\"reason\":\"server_not_configured\"}",
});

export const stableJson = (value: unknown): string => {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  const object = value as JsonObject;
  return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${stableJson(object[key])}`).join(",")}}`;
};
export const sha256Bytes = (value: Uint8Array | string) => `sha256:${createHash("sha256").update(value).digest("hex")}`;
export const sortPaths = (paths: readonly string[]) => [...paths].sort((left, right) => Buffer.from(left).compare(Buffer.from(right)));
export const strictObject = (value: unknown, keys: readonly string[], label: string) => {
  assert.ok(value !== null && typeof value === "object" && !Array.isArray(value), `${label} must be an object.`);
  assert.deepEqual(Object.keys(value as JsonObject).sort(), [...keys].sort(), `${label} fields must be exact.`);
  return value as JsonObject;
};

export const repositoryPath = (root: string, path: string) => {
  const realRoot = realpathSync(root);
  const absolute = resolve(realRoot, path);
  const local = relative(realRoot, absolute);
  assert.ok(local !== ".." && !local.startsWith(`..${sep}`), `Path escapes repository: ${path}`);
  let cursor = realRoot;
  for (const part of local.split(sep).filter(Boolean)) {
    cursor = resolve(cursor, part);
    if (!existsSync(cursor)) continue;
    assert.equal(lstatSync(cursor).isSymbolicLink(), false, `Symlink path rejected: ${relative(realRoot, cursor)}`);
    assert.equal(realpathSync(cursor), resolve(realRoot, relative(realRoot, cursor)), `Real path escaped repository: ${path}`);
  }
  return absolute;
};

export const bindFile = (root: string, path: string): FileBinding => {
  const absolute = repositoryPath(root, path);
  assert.equal(lstatSync(absolute).isFile(), true, `Proof binding must be a regular file: ${path}`);
  const bytes = readFileSync(absolute);
  return {path, sha256: sha256Bytes(bytes), byteLength: bytes.byteLength};
};

export const validateFileBinding = (root: string, value: unknown, expectedPath?: string) => {
  const binding = strictObject(value, ["byteLength", "path", "sha256"], "File binding") as FileBinding;
  if (expectedPath !== undefined) assert.equal(binding.path, expectedPath);
  assert.deepEqual(binding, bindFile(root, binding.path), `File binding changed: ${binding.path}`);
  return binding;
};

export const validateSpec0003StickAvailabilityRequest = (input: {
  order: number;
  context: string;
  expectedOrigin: string;
  url: string;
  method: string;
  workspaceHeader: string | null;
  acceptHeader: string | null;
  body: string | null;
}): Spec0003StickAvailabilityRecord => {
  assert.ok(Number.isInteger(input.order) && input.order >= 1 && input.order <= SPEC0003_EXPECTED_CONTEXTS.length, "Unexpected Stick availability request count.");
  assert.equal(input.context, SPEC0003_EXPECTED_CONTEXTS[input.order - 1], "Stick availability context/order mismatch.");
  const url = new URL(input.url);
  assert.equal(url.origin, input.expectedOrigin, "Stick availability request must use the exact local app origin.");
  assert.match(url.origin, /^http:\/\/127\.0\.0\.1:\d+$/);
  assert.equal(url.pathname, "/api/ai");
  assert.equal(url.search, "");
  assert.equal(url.hash, "");
  assert.equal(input.method, "GET");
  assert.equal(input.workspaceHeader, "stick-figure");
  assert.equal(input.acceptHeader, "application/json");
  assert.equal(input.body, null);
  return {
    order: input.order,
    context: input.context,
    method: "GET",
    origin: url.origin,
    path: "/api/ai",
    search: "",
    hash: "",
    workspaceHeader: "stick-figure",
    acceptHeader: "application/json",
    body: null,
    response: SPEC0003_STICK_AVAILABILITY_RESPONSE,
  };
};

export const assertExactSpec0003StickAvailabilityRecords = (records: readonly Spec0003StickAvailabilityRecord[]) => {
  assert.equal(records.length, SPEC0003_EXPECTED_CONTEXTS.length, "No-plan proof must fulfill exactly four Stick availability requests.");
  assert.deepEqual(records.map((record) => record.order), [1, 2, 3, 4]);
  assert.deepEqual(records.map((record) => record.context), [...SPEC0003_EXPECTED_CONTEXTS]);
  assert.equal(new Set(records.map((record) => record.origin)).size, 1, "All availability checks must target the one guarded local app origin.");
  for (const record of records) {
    assert.deepEqual({...record, origin: "http://127.0.0.1:1"}, {
      order: record.order,
      context: SPEC0003_EXPECTED_CONTEXTS[record.order - 1],
      method: "GET",
      origin: "http://127.0.0.1:1",
      path: "/api/ai",
      search: "",
      hash: "",
      workspaceHeader: "stick-figure",
      acceptHeader: "application/json",
      body: null,
      response: SPEC0003_STICK_AVAILABILITY_RESPONSE,
    });
    assert.match(record.origin, /^http:\/\/127\.0\.0\.1:\d+$/);
  }
};

export const expectedContractFixture = () => ({
  contractVersion: 1,
  contractId: "spec0003-stick-availability/v1",
  requests: SPEC0003_EXPECTED_CONTEXTS.map((context, index) => ({
    order: index + 1,
    context,
    method: "GET",
    path: "/api/ai",
    sameOriginLoopback: true,
    query: "",
    hash: "",
    body: null,
    headers: {"X-Diamond-AI-Workspace": "stick-figure", Accept: "application/json"},
    response: SPEC0003_STICK_AVAILABILITY_RESPONSE,
  })),
});
