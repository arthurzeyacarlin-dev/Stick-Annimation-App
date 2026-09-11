import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
const manifest = JSON.parse(readFileSync("output/spec-0006/phase-4-neutral/proof-manifest.json", "utf8"));
assert.equal(manifest.kind, "spec0006-phase4-neutral-proof"); assert.equal(manifest.status, "PASS"); assert.equal(manifest.baseSha, manifest.headSha); assert.equal(manifest.indexEmpty, true); assert.ok(manifest.exactDirtyPaths.length <= manifest.pathCeiling);
for (const binding of manifest.sourceBindings) { const bytes = readFileSync(binding.path); assert.equal(bytes.length, binding.bytes); assert.equal(createHash("sha256").update(bytes).digest("hex"), binding.sha256); }
assert.deepEqual(manifest.evidence, { ordinaryNewEmpty: true, mixedSameFrame: true, undoRedo: true, playback: true, neutralLayer: true, nativeV2SaveReopen: true, externalRequests: 0, realApiRequests: 0, aiChanges: 0 });
console.log(JSON.stringify({ status: "PASS", bindings: manifest.sourceBindings.length }));
