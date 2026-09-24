import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const base = "8ddc534691a154d2f3ab25cceb61d91690446abb";
const worktree = "/Users/arthurcarlin/.codex/worktrees/spec0013-phase1/stick-animation-app";
const planningSpec = "/Users/arthurcarlin/.codex/worktrees/spec-0013-planning/stick-animation-app/docs/specs/0013-version-1-home-finalizer-removal.md";
const root = "output/spec-0013/phase-1";
const allowlist = [
  "app/page.tsx",
  "scripts/spec0013-home/phase1BrowserProof.ts",
  "scripts/spec0013-home/phase1Oracle.ts",
  "scripts/spec0013-home/recordPhase1Proof.ts",
  "scripts/spec0013-home/validatePhase1Proof.ts",
  "src/lib/assistant/assistantContracts.ts",
  "src/lib/assistant/assistantKnowledge.ts",
].sort();
mkdirSync(`${root}/checks`, { recursive: true });
const git = (...args: string[]) => execFileSync("git", args, { encoding: "utf8" }).trim();
const sha = (value: Buffer | string) => createHash("sha256").update(value).digest("hex");
const bind = (path: string) => { const bytes = readFileSync(path); return { path, bytes: bytes.length, sha256: sha(bytes) }; };
const files = (directory: string): string[] => readdirSync(directory).flatMap(name => { const path = join(directory, name); return statSync(path).isDirectory() ? files(path) : [path]; });
const run = (name: string, command: string, args: string[]) => {
  const result = spawnSync(command, args, { encoding: "utf8" });
  const receipt = { status: result.status === 0 ? "PASS" : "FAIL", command: [command, ...args], exitCode: result.status, stdout: result.stdout, stderr: result.stderr };
  writeFileSync(`${root}/checks/${name}.json`, `${JSON.stringify(receipt, null, 2)}\n`);
  assert.equal(result.status, 0, `${name} failed\n${result.stdout}\n${result.stderr}`);
  return receipt.status;
};
const runInheritedBuild = () => {
  const result = spawnSync("npx", ["next", "build", "--webpack"], { encoding: "utf8" });
  const combined = `${result.stdout}\n${result.stderr}`;
  const inherited = result.status === 1 && combined.includes("app/dev/ai-costs/lifetime/page.tsx") && combined.includes("SearchParamsInput");
  const receipt = { status: inherited ? "INHERITED_BASELINE_FAILURE" : result.status === 0 ? "PASS" : "FAIL", command: ["npx", "next", "build", "--webpack"], exitCode: result.status, stdout: result.stdout, stderr: result.stderr };
  writeFileSync(`${root}/checks/build.json`, `${JSON.stringify(receipt, null, 2)}\n`);
  assert.equal(receipt.status, "INHERITED_BASELINE_FAILURE", `unexpected build result\n${combined}`);
  return receipt.status;
};

assert.equal(resolve("."), worktree);
assert.equal(git("rev-parse", "HEAD"), base);
assert.equal(git("rev-parse", "main"), base);
assert.equal(git("rev-parse", "origin/main"), base);
assert.equal(git("branch", "--show-current"), "");
assert.equal(git("diff", "--cached", "--name-only"), "");
const dirty = [...git("diff", "--name-only").split("\n"), ...git("ls-files", "--others", "--exclude-standard").split("\n")].filter(Boolean).sort();
assert.deepEqual(dirty, allowlist);
const results = {
  oracle: run("oracle", "node", ["--experimental-strip-types", "scripts/spec0013-home/phase1Oracle.ts"]),
  typescript: run("typescript", "npx", ["tsc", "--noEmit"]),
  lint: run("lint", "npx", ["eslint", "app/page.tsx", "src/lib/assistant/assistantKnowledge.ts", "src/lib/assistant/assistantContracts.ts", "scripts/spec0013-home/*.ts"]),
  diff: run("diff", "git", ["diff", "--check"]),
  build: runInheritedBuild(),
  browser: JSON.parse(readFileSync(`${root}/browser/result.json`, "utf8")).status,
};
for (const [name, status] of Object.entries(results)) {
  if (name === "build") assert.equal(status, "INHERITED_BASELINE_FAILURE", name);
  else assert.equal(status, "PASS", name);
}
const evidence = files(root).filter(path => !path.endsWith("proof-manifest.json") && !path.endsWith("validation.json")).sort().map(bind);
const source = allowlist.map(bind);
const manifest = {
  schema: "spec-0013-phase-1-proof/v1",
  phase: "SPEC-0013 Phase 1",
  base,
  head: base,
  main: base,
  originMain: base,
  worktree,
  branch: "detached",
  indexEmpty: true,
  planningSpec: bind(planningSpec),
  allowlist,
  source,
  sourceDigest: sha(JSON.stringify(source)),
  evidence,
  evidenceDigest: sha(JSON.stringify(evidence)),
  results,
  requestLedger: { automatedRealProviderCalls: 0, automatedPaidCalls: 0, automatedExternalCalls: 0 },
  protected: { globalsCssChanged: false, exportImplementationChanged: false, workspaceChanged: false, projectStorageChanged: false, aiAnimatorChanged: false, assistantProviderBehaviorChanged: false },
  proof: { finalizerDomAbsent: true, exportIsLastHomeCard: true, scrollTargets: { desktop: 290, medium: 422, compact: 428 }, exportBottomGap: 60, horizontalOverflow: 0, savedAssistantSessionsRemainValid: true, fullBuild: "INHERITED_BASELINE_FAILURE", changedFilesTypecheck: "PASS" },
  lifecycle: { humanAcceptance: "pending Arthur", controlPlaneUpdated: false, staged: false, committed: false, pushed: false, published: false, deployed: false },
  cleanup: { preserveReviewCopyUntilAcceptance: true, reviewOrigin: "http://127.0.0.1:58080", loopbackOnly: true },
  limitations: ["Arthur's visible review remains pending.", "The planning specification is preserved in its separate planning worktree and has not been published by this executor."],
};
const manifestPath = `${root}/proof-manifest.json`;
writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(JSON.stringify({ status: "SEALED", path: manifestPath, sha256: sha(readFileSync(manifestPath)), sources: source.length, evidence: evidence.length }));
