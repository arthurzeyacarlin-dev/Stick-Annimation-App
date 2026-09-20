import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

const MANIFEST_PATH = "output/spec-0009/phase-1/proof-manifest.json";
const manifest = JSON.parse(readFileSync(MANIFEST_PATH, "utf8"));
let assertions = 0;
const equal = (actual: unknown, expected: unknown, label: string) => { assertions += 1; assert.deepEqual(actual, expected, label); };
const check = (actual: unknown, label: string) => { assertions += 1; assert.ok(actual, label); };
const digest = (bytes: Uint8Array | string) => createHash("sha256").update(bytes).digest("hex");
const bind = (path: string) => { const bytes = readFileSync(path); return { path, bytes: bytes.length, sha256: digest(bytes) }; };
const dirtyPaths = () => execFileSync("git", ["status", "--porcelain=v1", "-z", "--untracked-files=all"])
  .toString("utf8").split("\0").filter(Boolean).map(record => record.slice(3)).sort();

const errors = (candidate: typeof manifest) => {
  const found: string[] = [];
  if (candidate.kind !== "spec0009-phase1-proof-manifest" || candidate.version !== 1 || candidate.status !== "PASS") found.push("identity");
  if (candidate.baseSha !== "37cdb7203286c2ea333a3766ba2e81bc06830200" || candidate.headSha !== candidate.baseSha) found.push("base");
  if (JSON.stringify(candidate.dirtyAllowlist) !== JSON.stringify(dirtyPaths())) found.push("dirty");
  if (candidate.sources.some((source: { path: string; bytes: number; sha256: string }) => JSON.stringify(source) !== JSON.stringify(bind(source.path)))) found.push("source_binding");
  if (candidate.sourceDigest !== digest(JSON.stringify(candidate.sources.map((source: { path: string; sha256: string }) => [source.path, source.sha256])))) found.push("source_digest");
  if (candidate.screenshots.some((artifact: { path: string; bytes: number; sha256: string }) => JSON.stringify(artifact) !== JSON.stringify(bind(artifact.path)))) found.push("screenshot_binding");
  if (JSON.stringify(candidate.oracle) !== JSON.stringify(bind(candidate.oracle.path))) found.push("oracle_binding");
  if (JSON.stringify(candidate.correctionBrowser) !== JSON.stringify(bind(candidate.correctionBrowser.path))) found.push("correction_browser_binding");
  if (candidate.checks.some((entry: { status: string }) => entry.status !== "PASS")) found.push("check");
  return found;
};

equal(errors(manifest), [], "manifest validates against live source and artifacts");
equal(execFileSync("git", ["diff", "--cached", "--name-only"], { encoding: "utf8" }).trim(), "", "empty index");
equal(execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(), manifest.baseSha, "exact base");
equal(new Set(manifest.sources.map((source: { path: string }) => source.path)).size, manifest.sources.length, "unique source paths");
equal(manifest.isolation, { externalRequests: 0, aiCalls: 0, paidCalls: 0, repositoryWrites: 0, controlPlaneChanges: 0 }, "isolation receipt");
check(manifest.checks.length >= 14, "complete check inventory");

const rejectedMutations: string[] = [];
const reject = (name: string, mutate: (candidate: typeof manifest) => void) => {
  const candidate = structuredClone(manifest);
  mutate(candidate);
  assertions += 1;
  assert.ok(errors(candidate).length > 0, `${name} mutation rejected`);
  rejectedMutations.push(name);
};
reject("status", candidate => { candidate.status = "FAIL"; });
reject("base", candidate => { candidate.baseSha = "0".repeat(40); });
reject("dirty", candidate => { candidate.dirtyAllowlist.pop(); });
reject("source", candidate => { candidate.sources[0].sha256 = "0".repeat(64); });
reject("screenshot", candidate => { candidate.screenshots[0].sha256 = "0".repeat(64); });
reject("oracle", candidate => { candidate.oracle.sha256 = "0".repeat(64); });
reject("correction_browser", candidate => { candidate.correctionBrowser.sha256 = "0".repeat(64); });
reject("check", candidate => { candidate.checks[0].status = "FAIL"; });

const response = await fetch(manifest.review.url);
equal(response.status, 200, "review server responds");
check((await response.text()).length > 1_000, "review server serves the application");
const result = { status: "VALID", assertions, rejectedMutations, manifest: bind(MANIFEST_PATH), manifestSha256: digest(readFileSync(MANIFEST_PATH)), reviewUrl: manifest.review.url };
mkdirSync("output/spec-0009/phase-1", { recursive: true });
writeFileSync("output/spec-0009/phase-1/validation.json", `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify(result));
