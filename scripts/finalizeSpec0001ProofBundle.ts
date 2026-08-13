import assert from "node:assert/strict";
import {spawnSync} from "node:child_process";
import {createHash} from "node:crypto";
import {existsSync, lstatSync, readFileSync, readdirSync, writeFileSync} from "node:fs";
import {dirname, relative, resolve, sep} from "node:path";
import {buildTrackedStateInventory, validateLiveTuple, validatePhase7LiveProofManifest, validateProofManifest, type LiveTuple} from "./validateSpec0001ProofBundle.ts";

const ROOT = process.cwd();
const HASH_PATTERN = /^sha256:[0-9a-f]{64}$/;
const DECISION_PATTERN = /^[0-9a-f]{64}$/;

const sha256Bytes = (bytes: Uint8Array | string) => `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
const fileBinding = (path: string) => {
  const bytes = readFileSync(resolve(ROOT, path));
  return {path, sha256: sha256Bytes(bytes), byteLength: bytes.byteLength};
};

const git = (...argv: string[]) => {
  const result = spawnSync("git", argv, {cwd: ROOT, encoding: "utf8"});
  if (result.status !== 0) throw new Error(result.stderr || `git ${argv.join(" ")} failed`);
  return result.stdout;
};

const nulList = (value: string) => value.split("\0").filter(Boolean);

const repositoryPath = (path: string, label: string) => {
  const absolute = resolve(ROOT, path);
  const local = relative(ROOT, absolute);
  if (local === ".." || local.startsWith(`..${sep}`)) throw new Error(`${label} escapes the repository.`);
  return absolute;
};

const rejectSymlinkComponents = (path: string) => {
  const absolute = repositoryPath(path, "Path");
  let current = ROOT;
  for (const part of relative(ROOT, absolute).split(sep).filter(Boolean)) {
    current = resolve(current, part);
    if (existsSync(current) && lstatSync(current).isSymbolicLink()) throw new Error(`Symlink path component rejected: ${relative(ROOT, current)}`);
  }
};

const parseArgs = () => {
  const values = new Map<string, string>();
  for (const argument of process.argv.slice(2)) {
    const match = /^--([a-z-]+)=(.+)$/.exec(argument);
    if (!match) throw new Error(`Unsupported argument: ${argument}`);
    if (values.has(match[1])) throw new Error(`Duplicate --${match[1]} argument.`);
    values.set(match[1], match[2]);
  }
  for (const key of ["phase", "base", "proof", "output"]) if (!values.has(key)) throw new Error(`Missing --${key}=...`);
  return {
    phase: Number(values.get("phase")),
    base: values.get("base")!,
    proof: values.get("proof")!,
    output: values.get("output")!,
    liveProof: values.get("live-proof"),
    decision: values.get("authorization-decision-digest"),
  };
};

const phaseOneAllowed = new Set([
  "src/lib/stickfigure/stickProjectContract.ts",
  "src/lib/ai/stickFigureAiContract.ts",
  "scripts/validateStickFigureAiContracts.ts",
  "scripts/validateSpec0001ProofBundle.ts",
  "scripts/recordSpec0001ProofBundle.ts",
  "scripts/finalizeSpec0001ProofBundle.ts",
  ...[
    "fresh-stick-project.json", "manual-wave-actions.json", "manual-wave-applied-project.json",
    "manual-ai-content-equivalence.json", "wave-request.json", "wave-provider-plan.json", "wave-command-batch.json",
    "wave-command-results.json", "wave-applied-project.json", "non-wave-document-cases.json",
    "stick-manual-edit-capability-cases.json", "stick-line-head-vectors.json", "canonical-hash-vectors.json",
    "derived-id-vectors.json", "prompt-normalization-cases.json", "invalid-contract-cases.json",
    "proof-manifest.schema.json", "proof-closeout-manifest.schema.json", "proof-command-receipt.schema.json",
    "phase7-live-proof-manifest.schema.json", "phase-1-proof-commands.json",
  ].map((name) => `scripts/fixtures/stick-ai/v1/${name}`),
  "docs/specs/0001-first-reversible-ai-stick-animation.md",
  "docs/specs/README.md",
  "docs/CURRENT_STATE.md",
  "docs/TODO.md",
  "docs/SESSION_HANDOFF.md",
  "docs/changelog.md",
  "project/project_structure.txt",
]);

const listFilesRecursively = (directory: string): string[] => {
  const files: string[] = [];
  for (const entry of readdirSync(directory, {withFileTypes: true})) {
    const absolute = resolve(directory, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`Proof output may not contain symlinks: ${relative(ROOT, absolute)}`);
    if (entry.isDirectory()) files.push(...listFilesRecursively(absolute));
    else if (entry.isFile()) files.push(relative(ROOT, absolute));
    else throw new Error(`Unsupported proof artifact type: ${relative(ROOT, absolute)}`);
  }
  return files.sort();
};

const proofArtifactInventory = (proofPath: string, closeoutPath: string) => {
  const directory = dirname(resolve(ROOT, proofPath));
  return listFilesRecursively(directory)
    .filter((path) => path !== closeoutPath && !path.endsWith(".tmp"))
    .sort()
    .map(fileBinding);
};

const parseLiveManifest = (path: string, decision: string) => {
  const value = JSON.parse(readFileSync(resolve(ROOT, path), "utf8")) as Record<string, unknown>;
  return validatePhase7LiveProofManifest(value, decision);
};

const parseCatastrophicCleanupReceipt = (decision: string, sibling: boolean) => {
  const path = sibling
    ? `output/spec-0001/phase-7-live/${decision}/live/live-proof-cleanup-receipt.json`
    : `output/spec-0001/phase-7/live/${decision}/live-proof-cleanup-receipt.json`;
  rejectSymlinkComponents(path);
  if (!existsSync(resolve(ROOT, path))) throw new Error("Catastrophic live closeout requires the strict cleanup receipt.");
  const value = JSON.parse(readFileSync(resolve(ROOT, path), "utf8")) as Record<string, unknown>;
  assert.deepEqual(Object.keys(value).sort(), ["cleanupVersion", "kind", "authorizationDecisionDigest", "observedArtifactSha256", "observedArtifactAbsent", "cleanupSucceeded", "residualArtifactCount", "privacy"].sort(), "Cleanup receipt fields must be exact.");
  assert.equal(value.cleanupVersion, 1);
  assert.equal(value.kind, "stick-ai-live-proof-cleanup-receipt");
  assert.equal(value.authorizationDecisionDigest, decision);
  assert.ok((value.observedArtifactAbsent === true && value.observedArtifactSha256 === null) || (value.observedArtifactAbsent === false && typeof value.observedArtifactSha256 === "string" && HASH_PATTERN.test(value.observedArtifactSha256)), "Cleanup observed-artifact tuple is invalid.");
  assert.equal(value.cleanupSucceeded, true);
  assert.equal(value.residualArtifactCount, 0);
  assert.equal(value.privacy, "sanitized-no-content");
  return {
    cleanupReceipt: fileBinding(path),
    observedArtifactSha256: value.observedArtifactSha256 as string | null,
    observedArtifactAbsent: value.observedArtifactAbsent as boolean,
    cleanupSucceeded: true as const,
    residualArtifactCount: 0 as const,
  };
};

const buildLiveTuple = (phase: number, liveProof: string | undefined, decisionInput: string | undefined, proofPath?: string): LiveTuple => {
  if (phase !== 7) {
    if (liveProof !== undefined || decisionInput !== undefined) throw new Error("Live-proof arguments are Phase 7-only.");
    return {liveProofInput: "none", authorizationDecisionDigest: null, liveProofManifestSha256: null, liveProviderProof: "unperformed", liveProofEvidenceQuality: "not_attempted", liveCounts: null, possibleCharge: null, catastrophicEvidence: null};
  }
  if (liveProof === undefined || decisionInput === undefined) throw new Error("Phase 7 requires both live-proof and authorization-decision-digest arguments.");
  if (liveProof === "none" && decisionInput === "none") {
    return {liveProofInput: "none", authorizationDecisionDigest: null, liveProofManifestSha256: null, liveProviderProof: "unperformed", liveProofEvidenceQuality: "not_attempted", liveCounts: null, possibleCharge: null, catastrophicEvidence: null};
  }
  if (liveProof === "none" && DECISION_PATTERN.test(decisionInput)) {
    const sibling = proofPath?.startsWith(`output/spec-0001/phase-7-live/${decisionInput}/`) ?? false;
    return {liveProofInput: "none", authorizationDecisionDigest: decisionInput, liveProofManifestSha256: null, liveProviderProof: "failed", liveProofEvidenceQuality: "catastrophic_unproven", liveCounts: "unknown", possibleCharge: "unknown", catastrophicEvidence: parseCatastrophicCleanupReceipt(decisionInput, sibling)};
  }
  if (liveProof === "none" || decisionInput === "none" || !DECISION_PATTERN.test(decisionInput)) throw new Error("Live proof and decision arguments are inconsistent.");
  const implementationPath = `output/spec-0001/phase-7/live/${decisionInput}/live-proof-manifest.json`;
  const siblingPath = `output/spec-0001/phase-7-live/${decisionInput}/live/live-proof-manifest.json`;
  if (liveProof !== implementationPath && liveProof !== siblingPath) throw new Error("Live proof path is outside the two decision-bound roots.");
  rejectSymlinkComponents(liveProof);
  const manifest = parseLiveManifest(liveProof, decisionInput);
  const binding = fileBinding(liveProof);
  const tuple: LiveTuple = {
    liveProofInput: liveProof,
    authorizationDecisionDigest: decisionInput,
    liveProofManifestSha256: binding.sha256,
    liveProviderProof: manifest.liveProofStatus as "completed" | "failed",
    liveProofEvidenceQuality: "validated_manifest",
    liveCounts: manifest.counts as Exclude<LiveTuple["liveCounts"], null | "unknown">,
    possibleCharge: (manifest.result as Record<string, unknown>).possibleCharge as boolean,
    catastrophicEvidence: null,
  };
  validateLiveTuple(phase, tuple);
  return tuple;
};

export const runFinalizerSelfTest = () => {
  const noLive = buildLiveTuple(1, undefined, undefined);
  validateLiveTuple(1, noLive);
  assert.throws(() => buildLiveTuple(1, "none", "none"));
  assert.throws(() => buildLiveTuple(7, undefined, undefined));
  assert.throws(() => buildLiveTuple(7, "none", undefined));
  assert.throws(() => buildLiveTuple(7, undefined, "none"));
  assert.throws(() => buildLiveTuple(7, "outside/live-proof-manifest.json", "a".repeat(64)));
  assert.throws(() => buildLiveTuple(7, "none", "invalid"));
  assert.throws(() => buildLiveTuple(7, "none", "a".repeat(64)));
  assert.throws(() => repositoryPath("../../escape", "test"));
  console.log("SPEC-0001 proof finalizer self-test passed (live arguments/tuple/roots/path escapes rejected)." );
};

const main = () => {
  if (process.argv.length === 3 && process.argv[2] === "--self-test") return runFinalizerSelfTest();
  const args = parseArgs();
  if (!Number.isSafeInteger(args.phase) || args.phase < 1 || args.phase > 7) throw new Error("Phase must be 1..7.");
  if (!/^[0-9a-f]{40}$/.test(args.base)) throw new Error("Base must be a full lowercase Git SHA.");
  const ordinaryProof = `output/spec-0001/phase-${args.phase}/proof-manifest.json`;
  const ordinaryOutput = `output/spec-0001/phase-${args.phase}/proof-closeout-manifest.json`;
  const siblingMatch = args.phase === 7
    ? /^output\/spec-0001\/phase-7-live\/([0-9a-f]{64})\/offline-proof-manifest\.json$/.exec(args.proof)
    : null;
  const siblingOutput = siblingMatch
    ? `output/spec-0001/phase-7-live/${siblingMatch[1]}/proof-closeout-manifest.json`
    : null;
  const ordinaryRoot = args.proof === ordinaryProof && args.output === ordinaryOutput;
  const siblingRoot = siblingOutput !== null && args.output === siblingOutput;
  if (!ordinaryRoot && !siblingRoot) throw new Error("Proof/closeout paths must use an exact ordinary or Phase 7 live-only root.");
  if (siblingMatch && args.decision !== siblingMatch[1]) throw new Error("Live-only proof root decision does not match the required decision argument.");
  rejectSymlinkComponents(args.proof);
  rejectSymlinkComponents(dirname(args.output));
  if (existsSync(resolve(ROOT, args.output)) && lstatSync(resolve(ROOT, args.output)).isSymbolicLink()) throw new Error("Closeout output may not be a symlink.");
  const liveTuple = buildLiveTuple(args.phase, args.liveProof, args.decision, args.proof);
  validateLiveTuple(args.phase, liveTuple);
  const proof = validateProofManifest(args.proof, liveTuple.liveProofInput === "none" ? [] : [liveTuple.liveProofInput]);
  if (proof.phase !== args.phase || proof.baseCommit !== args.base) throw new Error("Proof phase/base mismatch.");
  const head = git("rev-parse", "HEAD").trim();
  if (head !== args.base) throw new Error("Finalization must occur before Git publication on the exact phase base.");
  if (git("diff", "--cached", "--name-only").trim() !== "") throw new Error("Git index must be empty.");
  const allowlistedPaths = [...new Set([
    ...nulList(git("diff", "--name-only", "-z", args.base)),
    ...nulList(git("ls-files", "--others", "--exclude-standard", "-z")),
  ])].sort();
  if (args.phase === 1) {
    const outside = allowlistedPaths.filter((path) => !phaseOneAllowed.has(path));
    if (outside.length > 0) throw new Error(`Phase 1 final diff contains unauthorized paths: ${outside.join(", ")}`);
  }
  const state = buildTrackedStateInventory(args.base);
  const closeout = {
    closeoutVersion: 1,
    specId: "SPEC-0001",
    phase: args.phase,
    baseCommit: args.base,
    headCommit: head,
    finalizedAt: new Date().toISOString(),
    proofManifest: fileBinding(args.proof),
    trackedStateDigest: state.digest,
    trackedStateInventory: state.entries,
    indexEmpty: true,
    allowlistedPaths,
    artifactInventory: proofArtifactInventory(args.proof, args.output),
    ...liveTuple,
  };
  writeFileSync(resolve(ROOT, args.output), `${JSON.stringify(closeout, null, 2)}\n`, {encoding: "utf8", mode: 0o600});
  console.log(`Finalized read-only tracked-state closeout at ${args.output}.`);
  console.log(`Tracked/non-ignored state digest: ${state.digest}; index empty; ${allowlistedPaths.length} allowlisted changed paths.`);
};

main();
