import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

export const BASE_SHA = "88721481a345d6dda3f17b5620111a9cda2ab799";
export const REVIEW_URL = "http://127.0.0.1:56877/";
export const OUTPUT_ROOT = "output/spec-0007/phase-2";
export const MANIFEST_PATH = `${OUTPUT_ROOT}/proof-manifest.json`;
export const PROTECTED_V1_SOURCE_HASHES = {
  "src/components/workspace/DrawingCanvas.tsx": "1df392cafe43447126899fcf1f3626fc6d356cb69798be12e5fcc81af17344da",
  "src/lib/animation/editorCommands/rasterGesture.ts": "9515ab93b9079e094ecf538864985a79692a351c09a6161b94f67464cacf5281",
} as const;
export const EXACT_DIRTY_ALLOWLIST = [
  "scripts/fixtures/spec0007-manual/phase-2/contract.json",
  "scripts/spec0007-manual/phase-2/browserProof.ts",
  "scripts/spec0007-manual/phase-2/corridorOracle.ts",
  "scripts/spec0007-manual/phase-2/proofContract.ts",
  "scripts/spec0007-manual/phase-2/recordProof.ts",
  "scripts/spec0007-manual/phase-2/regressions.ts",
  "scripts/spec0007-manual/phase-2/validateProof.ts",
  "src/components/workspace/DrawingCanvas.tsx",
  "src/lib/animation/editorCommands/drawRigCorridor.ts",
  "src/lib/animation/editorCommands/rasterGesture.ts",
].sort();

export type Binding = { path: string; bytes: number; sha256: string };
export type CommandResult = {
  id: string;
  status: "PASS" | "INHERITED_BASELINE" | "FAIL";
  argv: string[];
  exitCode: number | null;
  elapsedMs: number;
  stdout: Binding;
  stderr: Binding;
  detail?: string;
};
export type RegressionReceipt = {
  kind: "spec0007-phase2-regressions";
  status: "PASS" | "FAIL";
  baseSha: string;
  sourceDigestBefore: string;
  sourceDigestAfter: string;
  dirtyPaths: string[];
  commands: CommandResult[];
};
export type ProofManifest = {
  kind: "spec0007-phase2-proof-manifest";
  version: 1;
  status: "PASS" | "FAIL";
  baseSha: string;
  review: { url: string; server: "single-loopback-development" };
  sourceDigest: string;
  sources: Binding[];
  dirtyAllowlist: string[];
  checks: Array<{ id: string; status: "PASS" | "INHERITED_BASELINE" | "FAIL"; detail?: string }>;
  artifacts: Binding[];
};

export const digest = (value: Uint8Array | string) => createHash("sha256").update(value).digest("hex");
export const bind = (path: string): Binding => {
  const bytes = readFileSync(path);
  return { path, bytes: bytes.length, sha256: digest(bytes) };
};
export const sourceBindings = () => EXACT_DIRTY_ALLOWLIST.map(bind);
export const protectedV1SourcesMatch = () => Object.entries(PROTECTED_V1_SOURCE_HASHES).every(([path, sha256]) => bind(path).sha256 === sha256);
export const currentSourceDigest = () => digest(JSON.stringify(sourceBindings().map(value => [value.path, value.sha256])));
export const currentHead = () => execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
export const stagedPaths = () => execFileSync("git", ["diff", "--cached", "--name-only"], { encoding: "utf8" }).trim().split("\n").filter(Boolean).sort();
export const dirtyPaths = () => {
  const bytes = execFileSync("git", ["status", "--porcelain=v1", "-z", "--untracked-files=all"]);
  return bytes.toString("utf8").split("\0").filter(Boolean).map(record => record.slice(3)).sort();
};
export const writeJson = (path: string, value: unknown) => {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(value, null, 2) + "\n");
  return bind(path);
};
