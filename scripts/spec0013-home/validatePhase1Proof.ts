import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const root = "output/spec-0013/phase-1";
const manifestPath = `${root}/proof-manifest.json`;
const base = "8ddc534691a154d2f3ab25cceb61d91690446abb";
const worktree = "/Users/arthurcarlin/.codex/worktrees/spec0013-phase1/stick-animation-app";
const expectedPaths = [
  "app/page.tsx",
  "scripts/spec0013-home/phase1BrowserProof.ts",
  "scripts/spec0013-home/phase1Oracle.ts",
  "scripts/spec0013-home/recordPhase1Proof.ts",
  "scripts/spec0013-home/validatePhase1Proof.ts",
  "src/lib/assistant/assistantContracts.ts",
  "src/lib/assistant/assistantKnowledge.ts",
].sort();
type Binding = { path: string; bytes: number; sha256: string };
type Manifest = { schema: string; phase: string; base: string; head: string; main: string; originMain: string; worktree: string; branch: string; indexEmpty: boolean; planningSpec: Binding; allowlist: string[]; source: Binding[]; sourceDigest: string; evidence: Binding[]; evidenceDigest: string; results: Record<string, string>; requestLedger: Record<string, number>; protected: Record<string, boolean>; proof: Record<string, unknown>; lifecycle: Record<string, unknown>; cleanup: Record<string, unknown> };
const sha = (value: Buffer | string) => createHash("sha256").update(value).digest("hex");
const bind = (path: string): Binding => { const bytes = readFileSync(path); return { path, bytes: bytes.length, sha256: sha(bytes) }; };
const files = (directory: string): string[] => readdirSync(directory).flatMap(name => { const path = join(directory, name); return statSync(path).isDirectory() ? files(path) : [path]; });
const git = (...args: string[]) => execFileSync("git", args, { encoding: "utf8" }).trim();
const same = (actual: unknown, expected: unknown, label: string) => assert.deepEqual(actual, expected, label);

function audit(manifest: Manifest) {
  same(manifest.schema, "spec-0013-phase-1-proof/v1", "schema");
  same(manifest.phase, "SPEC-0013 Phase 1", "phase");
  for (const key of ["base", "head", "main", "originMain"] as const) same(manifest[key], base, key);
  same(manifest.worktree, worktree, "worktree"); same(manifest.branch, "detached", "branch"); same(manifest.indexEmpty, true, "index");
  same(manifest.allowlist, expectedPaths, "allowlist"); same(manifest.source, expectedPaths.map(bind), "source bindings"); same(manifest.sourceDigest, sha(JSON.stringify(manifest.source)), "source digest");
  const evidencePaths = files(root).filter(path => !path.endsWith("proof-manifest.json") && !path.endsWith("validation.json")).sort();
  same(manifest.evidence, evidencePaths.map(bind), "evidence bindings"); same(manifest.evidenceDigest, sha(JSON.stringify(manifest.evidence)), "evidence digest");
  for (const [name, status] of Object.entries(manifest.results)) {
    same(status, name === "build" ? "INHERITED_BASELINE_FAILURE" : "PASS", `${name} result`);
  }
  same(manifest.requestLedger, { automatedRealProviderCalls: 0, automatedPaidCalls: 0, automatedExternalCalls: 0 }, "request ledger");
  same(manifest.protected, { globalsCssChanged: false, exportImplementationChanged: false, workspaceChanged: false, projectStorageChanged: false, aiAnimatorChanged: false, assistantProviderBehaviorChanged: false }, "protected systems");
  same(manifest.proof, { finalizerDomAbsent: true, exportIsLastHomeCard: true, scrollTargets: { desktop: 290, medium: 422, compact: 428 }, exportBottomGap: 60, horizontalOverflow: 0, savedAssistantSessionsRemainValid: true, fullBuild: "INHERITED_BASELINE_FAILURE", changedFilesTypecheck: "PASS" }, "phase proof");
  same(manifest.lifecycle, { humanAcceptance: "pending Arthur", controlPlaneUpdated: false, staged: false, committed: false, pushed: false, published: false, deployed: false }, "lifecycle");
  same(manifest.cleanup, { preserveReviewCopyUntilAcceptance: true, reviewOrigin: "http://127.0.0.1:58080", loopbackOnly: true }, "cleanup");
  same(resolve("."), worktree, "cwd"); same(git("rev-parse", "HEAD"), base, "HEAD"); same(git("branch", "--show-current"), "", "detached"); same(git("diff", "--cached", "--name-only"), "", "empty index");
  const dirty = [...git("diff", "--name-only").split("\n"), ...git("ls-files", "--others", "--exclude-standard").split("\n")].filter(Boolean).sort(); same(dirty, expectedPaths, "dirty set");
}

const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as Manifest;
audit(manifest);
const rejected: string[] = [];
for (const [name, mutate] of [
  ["base", (m: Manifest) => { m.base = "wrong"; }],
  ["path", (m: Manifest) => { m.allowlist.pop(); }],
  ["source", (m: Manifest) => { m.source[0].sha256 = "0".repeat(64); }],
  ["evidence", (m: Manifest) => { m.evidence[0].sha256 = "0".repeat(64); }],
  ["provider", (m: Manifest) => { m.requestLedger.automatedRealProviderCalls = 1; }],
  ["css", (m: Manifest) => { m.protected.globalsCssChanged = true; }],
  ["scroll", (m: Manifest) => { (m.proof.scrollTargets as Record<string, number>).desktop = 408; }],
  ["acceptance", (m: Manifest) => { m.lifecycle.humanAcceptance = "accepted"; }],
  ["publication", (m: Manifest) => { m.lifecycle.published = true; }],
] as const) {
  const altered = structuredClone(manifest); mutate(altered); assert.throws(() => audit(altered), name); rejected.push(name);
}
const receipt = { status: "VALID", manifestSha256: sha(readFileSync(manifestPath)), sourceCount: manifest.source.length, evidenceCount: manifest.evidence.length, negativeMutationsRejected: rejected, exactBase: base, exactWorktree: worktree, indexEmpty: true };
writeFileSync(`${root}/validation.json`, `${JSON.stringify(receipt, null, 2)}\n`);
console.log(JSON.stringify(receipt));
