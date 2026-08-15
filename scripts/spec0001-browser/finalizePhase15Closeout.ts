import assert from "node:assert/strict";
import {writeFileSync} from "node:fs";
import {OUTPUT_ROOT, repositoryPath} from "./browserTesterContract.ts";
import {buildPhase15Closeout} from "./validatePhase15Proof.ts";

const ROOT = process.cwd();
const args = new Map<string, string>();
for (const argument of process.argv.slice(2)) {
  const match = /^--(accepted-proof-sha256|base|proof|output)=(.+)$/.exec(argument);
  assert.ok(match && !args.has(match[1]), `Unsupported argument: ${argument}`);
  args.set(match[1], match[2]);
}
for (const key of ["accepted-proof-sha256", "base", "proof", "output"]) {
  assert.ok(args.has(key), `Missing --${key}.`);
}
assert.equal(args.get("proof"), `${OUTPUT_ROOT}/proof-manifest.json`);
assert.equal(args.get("output"), `${OUTPUT_ROOT}/proof-closeout-manifest.json`);

const closeout = buildPhase15Closeout({
  acceptedProofSha256: args.get("accepted-proof-sha256")!,
  allowExistingOutput: false,
  baseCommit: args.get("base")!,
  outputPath: args.get("output")!,
  proofPath: args.get("proof")!,
});
writeFileSync(
  repositoryPath(ROOT, args.get("output")!),
  `${JSON.stringify(closeout, null, 2)}\n`,
  {encoding: "utf8", flag: "wx", mode: 0o600},
);
console.log(`Phase 1.5 Control Plane Architect closeout written to ${args.get("output")}.`);
