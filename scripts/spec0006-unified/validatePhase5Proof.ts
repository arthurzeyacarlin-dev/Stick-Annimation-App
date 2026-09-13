import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const manifestPath = "output/spec-0006/phase-5/proof-manifest.json";
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const digest = (path: string) => createHash("sha256").update(readFileSync(path)).digest("hex");
const git = (...args: string[]) => spawnSync("git", args, { encoding: "utf8" }).stdout;
const dirty = git("status", "--porcelain=v1", "--untracked-files=all")
  .split("\n").filter(Boolean).map(line => line.slice(3)).sort();

assert.equal(manifest.kind, "spec0006-phase5-tools-library-proof");
assert.ok(["PASS", "INCOMPLETE"].includes(manifest.status));
const incomplete = manifest.status === "INCOMPLETE";
assert.equal(manifest.technicalAcceptance, incomplete ? "BLOCKED" : "PASS");
if (incomplete) assert.ok(manifest.blocker?.requiredAuthority);
assert.equal(manifest.baseSha, "740eb70d2c713bf6bf8bd08123a0ed5eef3bc34d");
assert.equal(manifest.headSha, manifest.baseSha);
assert.equal(git("rev-parse", "HEAD").trim(), manifest.headSha);
assert.equal(manifest.indexEmpty, true);
assert.equal(git("diff", "--cached", "--name-only"), "");
assert.ok(manifest.exactDirtyPaths.length <= manifest.pathCeiling);
assert.deepEqual(dirty, manifest.exactDirtyPaths);
assert.equal(manifest.sourceBindings.length, manifest.exactDirtyPaths.length);
for (const binding of [...manifest.sourceBindings, ...manifest.evidenceBindings]) {
  const bytes = readFileSync(binding.path);
  assert.equal(bytes.length, binding.bytes, binding.path);
  assert.equal(digest(binding.path), binding.sha256, binding.path);
}
assert.equal(manifest.commands.every((result: { exitCode: number; name: string }) => result.exitCode === 0 || (incomplete && result.name === "phase5-browser")), true);
assert.equal(manifest.version, 3);
const acceptedPath = "output/spec-0006/phase-5/accepted-before-gesture-manifest.json";
assert.equal(digest(acceptedPath), "4d67fc4350929624c04474d3d4475595fd01ff1b29e8e07755d73aeab9430f6c");
assert.equal(manifest.acceptedBaseline.manifestSha256, digest(acceptedPath));
const accepted = JSON.parse(readFileSync(acceptedPath, "utf8"));
for(const binding of accepted.evidenceBindings){
  const path=`${manifest.acceptedBaseline.evidenceArchive}/${binding.path.split("/").at(-1)}`;
  assert.equal(readFileSync(path).length,binding.bytes,path);
  assert.equal(digest(path),binding.sha256,path);
}
assert.deepEqual(manifest.acceptedBaseline.changedSinceAcceptance, manifest.sourceBindings.filter((binding:{path:string;sha256:string})=>binding.sha256!==accepted.sourceBindings.find((old:{path:string})=>old.path===binding.path)?.sha256).map((binding:{path:string})=>binding.path));
assert.deepEqual(manifest.evidence.browserProfiles, ["1440x900 DPR1", "390x844 DPR2"]);
assert.equal(manifest.evidence.externalRequests, 0);
assert.equal(manifest.evidence.realApiRequests, 0);
assert.equal(manifest.evidence.aiChanges, 0);
assert.match(manifest.evidence.historicalEvidence, /superseded/);
for (const profile of ["desktop", "compact"]) {
  const ledger = JSON.parse(readFileSync(`output/spec-0006/phase-5/correction3-${profile}.json`, "utf8"));
  if (!incomplete || profile === "desktop") {
    assert.equal(ledger.status, "PASS");
    for (const name of manifest.evidence.freshBrowserSteps) assert.ok(ledger.steps.some((step: {name: string}) => step.name === name));
  }
  for (const step of ledger.steps) assert.deepEqual(step.result.profileMetrics, profile === "desktop" ? {width:1440,height:900,dpr:1} : {width:390,height:844,dpr:2});
  if (!incomplete) {
    const gestures = JSON.parse(readFileSync(`output/spec-0006/phase-5/gesture-${profile}.json`, "utf8"));
    assert.equal(gestures.status, "PASS");
    assert.deepEqual(gestures.steps.map((step: {name:string})=>step.name), manifest.evidence.gestureBrowserSteps);
    for (const path of [`output/spec-0006/phase-5/gesture-${profile}.json`, ...gestures.steps.map((step: {name:string})=>`output/spec-0006/phase-5/gesture-${profile}-${step.name}.log`)]) {
      assert.ok(manifest.evidenceBindings.some((binding: {path:string})=>binding.path===path), `unbound gesture evidence: ${path}`);
    }
  }
}
assert.equal(manifest.review.url, "http://127.0.0.1:56555/");
assert.equal(manifest.review.serverPreserved, true);
if (!incomplete) {
  const browserValidation = spawnSync(process.execPath, ["--experimental-strip-types", "scripts/spec0006-unified/phase5BrowserProof.ts"], {encoding:"utf8"});
  assert.equal(browserValidation.status, 0, browserValidation.stderr || browserValidation.stdout);
}
console.log(JSON.stringify({ status: manifest.status, integrity: "VALID", technicalAcceptance: manifest.technicalAcceptance, humanAcceptance: "pending Arthur", bindings: manifest.sourceBindings.length, manifestSha256: digest(manifestPath) }));
