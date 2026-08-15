import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  DRAWING_PROJECT_V1_STORAGE_KEY,
  attemptDrawingProjectLegacyCleanup,
  buildDrawingProjectLegacyCleanupCandidate,
  classifyDrawingProjectV1RawRoot,
  normalizeDrawingProjectV1Sound,
  readDrawingProjectV1Storage,
  validateDrawingProjectV1,
  type LegacyMaintenanceLockAdapter,
  type LegacyStorageAdapter,
} from "../src/lib/drawingProjectV1Compatibility.ts";
import { createLegacyProject } from "./fixtures/drawing-persistence/v2/fixtureFactory.ts";

let assertions = 0;
const equal = (actual: unknown, expected: unknown, message?: string) => { assertions += 1; assert.equal(actual, expected, message); };
const deepEqual = (actual: unknown, expected: unknown, message?: string) => { assertions += 1; assert.deepEqual(actual, expected, message); };
const ok = (actual: unknown, message?: string) => { assertions += 1; assert.ok(actual, message); };

for (const file of ["v1-compatibility-cases.json", "legacy-cleanup-cases.json"]) {
  const value = JSON.parse(readFileSync(new URL(`./fixtures/drawing-persistence/v2/${file}`, import.meta.url), "utf8"));
  equal(value.fixtureVersion, 1);
  ok(value.cases.length >= 9);
}

const absent = await readDrawingProjectV1Storage({ getItem: () => null });
deepEqual(absent, { status: "absent", rawRoot: null, rootDigest: null, entries: [] });
const readFailure = await readDrawingProjectV1Storage({ getItem: () => { throw new Error("denied"); } });
deepEqual(readFailure, { status: "read-failed", rawRoot: null, rootDigest: null, entries: [] });
for (const raw of ["{\"not\":\"array\"}", "[", "[{}] trailing", "[,]"]) {
  const result = await classifyDrawingProjectV1RawRoot(raw);
  equal(result.status, "corrupt-root", raw);
  equal(result.rawRoot, raw);
  ok(result.rootDigest);
}

const target = createLegacyProject("target");
const neighbor = createLegacyProject("neighbor");
const targetSlice = `  ${JSON.stringify(target)} `;
const neighborSlice = `\n ${JSON.stringify(neighbor)}  `;
const rawRoot = `[${targetSlice},${neighborSlice}]`;
const emptyArray = await classifyDrawingProjectV1RawRoot("[ \n\t ]");
deepEqual(emptyArray.status === "valid-array" ? emptyArray.entries : null, []);
const whitespaceRoot = await classifyDrawingProjectV1RawRoot(` \n[${targetSlice},${neighborSlice}]\t `);
equal(whitespaceRoot.status, "valid-array");
const trailingCommaRoots = [`[${JSON.stringify(target)},]`, `[${JSON.stringify(target)}, \n\t]`];
for (const raw of trailingCommaRoots) {
  const classified = await classifyDrawingProjectV1RawRoot(raw);
  equal(classified.status, "corrupt-root", "strict JSON trailing comma is corrupt-root");
  equal(classified.rawRoot, raw);
  const refused = await buildDrawingProjectLegacyCleanupCandidate(raw, "target", null);
  deepEqual(refused, { status: "pending", code: "legacy_corrupt" });
}
let storageWrites = 0;
const valid = await readDrawingProjectV1Storage({
  getItem: (key) => {
    equal(key, DRAWING_PROJECT_V1_STORAGE_KEY);
    return rawRoot;
  },
});
equal(storageWrites, 0, "classification never writes");
equal(valid.status, "valid-array");
if (valid.status !== "valid-array") assert.fail("Expected valid legacy root.");
equal(valid.entries.length, 2);
deepEqual(valid.entries.map((entry) => entry.classification), ["valid-v1", "valid-v1"]);
deepEqual(valid.entries.map((entry) => entry.projectId), ["target", "neighbor"]);
equal(valid.entries[0].rawSlice, targetSlice);
equal(valid.entries[1].rawSlice, neighborSlice);
ok(valid.entries[0].rawSliceDigest !== valid.entries[1].rawSliceDigest);
ok(valid.entries[0].canonicalRecordDigest);

const normalized = normalizeDrawingProjectV1Sound(target.data.layers[0].timelineFrames[0].soundAttachment);
deepEqual(normalized, {
  id: "legacy-sound",
  title: "Legacy",
  description: "Defaults fixture",
  timingFeel: null,
  intensityFeel: null,
  audioDataUrl: null,
  contentType: "sfx",
  speechText: null,
  sourceTask: "generate-sounds",
  attachedAt: "2026-08-15T00:00:00.000Z",
});

const unsupported = structuredClone(target);
unsupported.data.version = 2 as 1;
const unsupportedResult = await classifyDrawingProjectV1RawRoot(JSON.stringify([unsupported]));
equal(unsupportedResult.status, "valid-array");
if (unsupportedResult.status === "valid-array") {
  equal(unsupportedResult.entries[0].classification, "unsupported");
  equal(unsupportedResult.entries[0].code, "unsupported_version");
}
const futureSound = structuredClone(target);
(futureSound.data.layers[0].timelineFrames[0].soundAttachment as Record<string, unknown>).future = true;
const futureResult = await classifyDrawingProjectV1RawRoot(JSON.stringify([futureSound]));
if (futureResult.status !== "valid-array") assert.fail("Future entry should classify inside a valid root.");
equal(futureResult.entries[0].classification, "unsupported");
const corruptNested = structuredClone(target);
corruptNested.data.layers[0].timelineFrames[0].stateId = -1;
const corruptResult = await classifyDrawingProjectV1RawRoot(JSON.stringify([corruptNested]));
if (corruptResult.status !== "valid-array") assert.fail("Corrupt entry should not corrupt root.");
equal(corruptResult.entries[0].classification, "corrupt-entry");
const duplicates = await classifyDrawingProjectV1RawRoot(JSON.stringify([target, target]));
if (duplicates.status !== "valid-array") assert.fail("Duplicate entries should classify inside a valid root.");
deepEqual(duplicates.entries.map((entry) => entry.code), ["invalid_record", "invalid_record"]);
deepEqual(duplicates.entries.map((entry) => entry.classification), ["corrupt-entry", "corrupt-entry"]);

equal(validateDrawingProjectV1(Object.freeze(target)), target);
const built = await buildDrawingProjectLegacyCleanupCandidate(rawRoot, "target", valid.entries[0].canonicalRecordDigest);
equal(built.status, "candidate");
if (built.status !== "candidate") assert.fail("Expected cleanup candidate.");
equal(built.candidate.candidateRoot, `[${neighborSlice}]`);
deepEqual(built.candidate.preservedEntryDigests, [valid.entries[1].rawSliceDigest]);
equal(built.candidate.targetRecordDigest, valid.entries[0].canonicalRecordDigest);
const missing = await buildDrawingProjectLegacyCleanupCandidate(rawRoot, "absent", null);
deepEqual(missing, { status: "not-needed" });
const mismatch = await buildDrawingProjectLegacyCleanupCandidate(rawRoot, "target", "0".repeat(64));
deepEqual(mismatch, { status: "pending", code: "maintenance_required" });
const corruptCandidate = await buildDrawingProjectLegacyCleanupCandidate("{bad", "target", null);
deepEqual(corruptCandidate, { status: "pending", code: "legacy_corrupt" });

class MemoryStorage implements LegacyStorageAdapter {
  raw: string | null;
  reads = 0;
  writes = 0;
  throwReadAt = -1;
  throwWrite = false;
  mutateOnReadAt = -1;
  constructor(raw: string | null) { this.raw = raw; }
  getItem(key: string) {
    assert.equal(key, DRAWING_PROJECT_V1_STORAGE_KEY);
    this.reads += 1;
    if (this.reads === this.throwReadAt) throw new Error("read failed");
    if (this.reads === this.mutateOnReadAt) this.raw = JSON.stringify([target, createLegacyProject("racer")]);
    return this.raw;
  }
  setItem(key: string, value: string) {
    assert.equal(key, DRAWING_PROJECT_V1_STORAGE_KEY);
    this.writes += 1;
    if (this.throwWrite) throw new Error("write failed");
    this.raw = value;
  }
}

const availableLock: LegacyMaintenanceLockAdapter = { request: async (_name, callback) => callback() };
const unavailableLock: LegacyMaintenanceLockAdapter = { request: async () => null };
const cleanStorage = new MemoryStorage(rawRoot);
const cleaned = await attemptDrawingProjectLegacyCleanup(cleanStorage, availableLock, "target", valid.entries[0].canonicalRecordDigest);
deepEqual(cleaned, { status: "cleaned", legacyPresence: "absent" });
equal(cleanStorage.writes, 1);
equal(cleanStorage.raw, `[${neighborSlice}]`);
const neighborAfter = await classifyDrawingProjectV1RawRoot(cleanStorage.raw!);
if (neighborAfter.status !== "valid-array") assert.fail("Cleaned root should remain valid.");
equal(neighborAfter.entries[0].rawSlice, neighborSlice);
equal(neighborAfter.entries[0].rawSliceDigest, valid.entries[1].rawSliceDigest);

const noTargetStorage = new MemoryStorage(JSON.stringify([neighbor]));
deepEqual(await attemptDrawingProjectLegacyCleanup(noTargetStorage, availableLock, "target", null), { status: "not-needed", legacyPresence: "absent" });
equal(noTargetStorage.writes, 0);
const lockedStorage = new MemoryStorage(rawRoot);
deepEqual(await attemptDrawingProjectLegacyCleanup(lockedStorage, unavailableLock, "target", valid.entries[0].canonicalRecordDigest), {
  status: "pending",
  legacyPresence: "present",
  code: "maintenance_required",
});
equal(lockedStorage.writes, 0);
equal(lockedStorage.raw, rawRoot);

const raceStorage = new MemoryStorage(rawRoot);
raceStorage.mutateOnReadAt = 2;
deepEqual(await attemptDrawingProjectLegacyCleanup(raceStorage, availableLock, "target", valid.entries[0].canonicalRecordDigest), {
  status: "pending",
  legacyPresence: "present",
  code: "maintenance_required",
});
equal(raceStorage.writes, 0);

const writeFailureStorage = new MemoryStorage(rawRoot);
writeFailureStorage.throwWrite = true;
deepEqual(await attemptDrawingProjectLegacyCleanup(writeFailureStorage, availableLock, "target", valid.entries[0].canonicalRecordDigest), {
  status: "pending",
  legacyPresence: "present",
  code: "storage_write_failed",
});
equal(writeFailureStorage.writes, 1);
equal(writeFailureStorage.raw, rawRoot);

const readBackFailureStorage = new MemoryStorage(rawRoot);
readBackFailureStorage.throwReadAt = 3;
deepEqual(await attemptDrawingProjectLegacyCleanup(readBackFailureStorage, availableLock, "target", valid.entries[0].canonicalRecordDigest), {
  status: "pending",
  legacyPresence: "unknown",
  code: "storage_write_failed",
});
equal(readBackFailureStorage.writes, 1);
equal(readBackFailureStorage.raw, `[${neighborSlice}]`);

const malformedStorage = new MemoryStorage("{broken");
deepEqual(await attemptDrawingProjectLegacyCleanup(malformedStorage, availableLock, "target", null), {
  status: "pending",
  legacyPresence: "present",
  code: "legacy_corrupt",
});
equal(malformedStorage.writes, 0);
equal(malformedStorage.raw, "{broken");
for (const raw of trailingCommaRoots) {
  const trailingCommaStorage = new MemoryStorage(raw);
  deepEqual(await attemptDrawingProjectLegacyCleanup(trailingCommaStorage, availableLock, "target", null), {
    status: "pending",
    legacyPresence: "present",
    code: "legacy_corrupt",
  });
  equal(trailingCommaStorage.writes, 0, "trailing-comma cleanup performs no write");
  equal(trailingCommaStorage.raw, raw, "trailing-comma root stays byte-identical");
}
storageWrites += malformedStorage.writes;
equal(storageWrites, 0);

console.log(`SPEC-0002 V1 compatibility validator passed. ASSERTIONS: ${assertions}`);
