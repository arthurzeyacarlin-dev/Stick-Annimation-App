import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { relative, resolve, sep } from "node:path";

import { validateSpec0002ProofManifest } from "./validateSpec0002Proof.ts";

const ROOT = process.cwd();
const TECHNICAL_MANIFEST = "output/spec-0002/phase-1/proof-manifest.json";
const CLOSEOUT_MANIFEST = "output/spec-0002/phase-1/proof-closeout-manifest.json";
const BASE_COMMIT = "82663051b30cdcfd6766cf4714cdeb2306970045";
const CONTROL_PLANE_PATHS = [
  "docs/CURRENT_STATE.md",
  "docs/DECISIONS.md",
  "docs/SESSION_HANDOFF.md",
  "docs/TODO.md",
  "docs/changelog.md",
  "docs/specs/0002-lossless-local-drawing-save-and-reopen.md",
  "docs/specs/README.md",
  "docs/testing_workflow.md",
  "project/project_structure.txt",
].sort();

const sha256 = (bytes: Uint8Array) => `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
const git = (...argv: string[]) => {
  const result = spawnSync("git", argv, { cwd: ROOT, encoding: "utf8" });
  if (result.status !== 0) throw new Error(result.stderr || `git ${argv.join(" ")} failed.`);
  return result.stdout.trim();
};
const parseArgs = () => {
  const args = new Map<string, string>();
  for (const argument of process.argv.slice(2)) {
    const match = /^--([a-z-]+)=(.+)$/.exec(argument);
    if (!match) throw new Error(`Unsupported argument: ${argument}`);
    args.set(match[1], match[2]);
  }
  if (args.size !== 4 || args.get("technical-manifest") !== TECHNICAL_MANIFEST || args.get("output") !== CLOSEOUT_MANIFEST || args.get("base") !== BASE_COMMIT || !args.get("branch")) {
    throw new Error(`Control Plane Architect must supply --technical-manifest=${TECHNICAL_MANIFEST} --output=${CLOSEOUT_MANIFEST} --base=${BASE_COMMIT} --branch=<reviewed-branch>.`);
  }
  return { branch: args.get("branch")! };
};
const safePath = (path: string) => {
  const local = relative(ROOT, resolve(ROOT, path));
  if (local === ".." || local.startsWith(`..${sep}`)) throw new Error("Closeout output escapes the repository.");
};

const args = parseArgs();
safePath(CLOSEOUT_MANIFEST);
if (existsSync(resolve(ROOT, CLOSEOUT_MANIFEST))) throw new Error("Closeout manifest is collision-refusing.");
validateSpec0002ProofManifest(TECHNICAL_MANIFEST, { allowAdditionalDirtyPaths: CONTROL_PLANE_PATHS });
if (git("rev-parse", "HEAD") !== BASE_COMMIT) throw new Error("Closeout HEAD changed from the accepted implementation base.");
const branch = git("branch", "--show-current");
const reviewedBranch = branch || "detached";
if (reviewedBranch !== args.branch) throw new Error(`Reviewed branch mismatch: ${reviewedBranch}.`);
if (git("diff", "--cached", "--name-only") !== "") throw new Error("Closeout requires an empty index.");
const changedPaths = git("diff", "--name-only", "HEAD").split("\n").filter(Boolean).sort();
const untrackedPaths = git("ls-files", "--others", "--exclude-standard").split("\n").filter(Boolean).sort();
const technicalManifest = JSON.parse(readFileSync(resolve(ROOT, TECHNICAL_MANIFEST), "utf8")) as { artifacts: Array<{ path: string }> };
const implementationPaths = new Set(technicalManifest.artifacts.map((artifact) => artifact.path));
for (const path of [...changedPaths, ...untrackedPaths]) {
  if (!implementationPaths.has(path) && !CONTROL_PLANE_PATHS.includes(path)) throw new Error(`Unauthorized closeout dirty path: ${path}`);
}
const controlPlaneChanged = changedPaths.filter((path) => CONTROL_PLANE_PATHS.includes(path));
if (controlPlaneChanged.length === 0) throw new Error("Control-plane propagation has not been completed.");
for (const path of changedPaths.filter((candidate) => candidate.startsWith("docs/") || candidate === "project/project_structure.txt")) {
  if (!CONTROL_PLANE_PATHS.includes(path)) throw new Error(`Unauthorized closeout path: ${path}`);
}
const technicalBytes = readFileSync(resolve(ROOT, TECHNICAL_MANIFEST));
const trackedState = [...new Set([...changedPaths, ...untrackedPaths])]
  .filter((path) => existsSync(resolve(ROOT, path)) && path !== CLOSEOUT_MANIFEST)
  .sort()
  .map((path) => {
    const bytes = readFileSync(resolve(ROOT, path));
    return { path, byteLength: bytes.byteLength, sha256: sha256(bytes) };
  });
const closeout = {
  closeoutVersion: 1,
  specId: "SPEC-0002",
  phase: 1,
  technicalManifest: TECHNICAL_MANIFEST,
  technicalManifestSha256: sha256(technicalBytes),
  baseCommit: BASE_COMMIT,
  headCommit: git("rev-parse", "HEAD"),
  branch: reviewedBranch,
  trackedState,
  controlPlanePaths: controlPlaneChanged,
  createdAt: new Date().toISOString(),
};
writeFileSync(resolve(ROOT, CLOSEOUT_MANIFEST), `${JSON.stringify(closeout, null, 2)}\n`);
console.log(`SPEC-0002 Phase 1 closeout manifest created: ${CLOSEOUT_MANIFEST}`);
