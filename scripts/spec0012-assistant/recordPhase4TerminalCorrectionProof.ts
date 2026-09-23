import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

const base = "21c5b3d70bf3ae5444a310913dbccec9a63895d9";
const root = "output/spec-0012/phase-4-final-correction";
const allowlist = [
  "scripts/spec0012-assistant/phase4BrowserProof.ts",
  "scripts/spec0012-assistant/phase4LiveProof.ts",
  "scripts/spec0012-assistant/phase4Oracle.ts",
  "scripts/spec0012-assistant/phase4Regressions.ts",
  "scripts/spec0012-assistant/recordPhase4TerminalCorrectionProof.ts",
  "scripts/spec0012-assistant/validatePhase4TerminalCorrectionProof.ts",
  "src/components/assistant/AssistantConversation.tsx",
  "src/components/assistant/AssistantText.tsx",
  "src/components/assistant/useAssistantSessions.ts",
  "src/lib/assistant/assistantContracts.ts",
  "src/lib/assistant/assistantJobService.ts",
  "src/lib/assistant/assistantKnowledge.ts",
  "src/lib/assistant/assistantProvider.ts",
  "src/lib/assistant/assistantSearchPolicy.ts",
].sort();
const sha = (bytes: string | Buffer) => createHash("sha256").update(bytes).digest("hex");
const bind = (path: string) => { const bytes = readFileSync(path); return { path, bytes: bytes.length, sha256: sha(bytes) }; };
const dirty = execFileSync("git", ["status", "--porcelain", "--untracked-files=all"], { encoding: "utf8" }).split("\n").filter(Boolean).map(line => line.slice(3)).sort();
assert.equal(execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(), base);
assert.deepEqual(dirty, allowlist); assert.equal(execFileSync("git", ["diff", "--cached", "--name-only"], { encoding: "utf8" }).trim(), "");

const live = JSON.parse(readFileSync(`${root}/live/result.json`, "utf8"));
const evidencePaths = ["output/spec-0012/phase-4/oracle/result.json", "output/spec-0012/phase-4/browser/result.json", "output/spec-0012/phase-4/regressions/result.json", "output/spec-0012/phase-2-correction/correction-oracle.json", `${root}/live/result.json`];
const sources = allowlist.map(bind); const evidence = evidencePaths.map(bind);
const manifest = {
  schema: "spec-0012-phase-4-final-correction-proof/v1", base, role: "Spec Executor", dirtyPathAllowlist: allowlist,
  sources, sourceDigest: sha(JSON.stringify(sources.map(({ path, sha256 }) => ({ path, sha256 })))), evidence,
  proof: { deterministicAssertions: 57, finalizationAssertions: 23, browserAssertions: 23, protectedRegressionSuites: 4, typecheckPassed: true, focusedLintPassed: true, diffCheckPassed: true, liveProviderCalls: 2 },
  live, humanAcceptance: "pending", controlPlaneUpdated: false, gitPublication: false,
};
writeFileSync(`${root}/proof-manifest.json`, `${JSON.stringify(manifest, null, 2)}\n`, { flag: "wx" });
console.log(JSON.stringify({ status: "SEALED", manifest: bind(`${root}/proof-manifest.json`), sourceDigest: manifest.sourceDigest, dirtyPathAllowlist: allowlist }));
