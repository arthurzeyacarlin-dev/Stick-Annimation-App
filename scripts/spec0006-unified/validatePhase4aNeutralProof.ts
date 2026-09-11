import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
const manifest = JSON.parse(readFileSync("output/spec-0006/phase-4-neutral/4a/checkpoint.json", "utf8"));
assert.equal(manifest.kind, "spec0006-phase4a-checkpoint"); assert.equal(manifest.status, "PASS"); assert.equal(manifest.paths.length, 12);
for (const binding of manifest.paths) { const bytes = readFileSync(binding.path); assert.equal(bytes.length, binding.bytes); assert.equal(createHash("sha256").update(bytes).digest("hex"), binding.sha256); }
console.log(JSON.stringify({ status: "PASS", bindings: manifest.paths.length }));
