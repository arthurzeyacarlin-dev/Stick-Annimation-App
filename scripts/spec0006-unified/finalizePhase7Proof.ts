import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

const validation = spawnSync("node", ["--experimental-strip-types", "scripts/spec0006-unified/validatePhase7Proof.ts"], { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
assert.equal(validation.status, 0, validation.stderr || validation.stdout);
const line = validation.stdout.trim().split("\n").at(-1);
assert.ok(line);
const validated = JSON.parse(line);
assert.equal(validated.status, "PASS");
const manifestPath = "output/spec-0006/phase-7/proof-manifest.json";
const bytes = readFileSync(manifestPath);
const manifest = JSON.parse(bytes.toString());
const manifestSha256 = createHash("sha256").update(bytes).digest("hex");
assert.equal(manifestSha256, validated.manifestSha256);
const finalization = {
  kind: "spec0006-phase7-finalization", version: 1, status: "PASS", integrity: "VALID",
  manifest: { path: manifestPath, bytes: bytes.length, sha256: manifestSha256 },
  review: manifest.review,
  trackedIndexEmpty: true,
  publicationAuthorized: false,
  controlPlaneUpdated: false,
  limitation: manifest.evidence.limitation,
};
mkdirSync("output/spec-0006/phase-7", { recursive: true });
writeFileSync("output/spec-0006/phase-7/finalization.json", JSON.stringify(finalization, null, 2) + "\n");
console.log(JSON.stringify(finalization));
