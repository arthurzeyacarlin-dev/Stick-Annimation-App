import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

const MANIFEST_PATH = "output/spec-0009/phase-2/proof-manifest.json";
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
  if (candidate.kind !== "spec0009-phase2-proof-manifest" || candidate.version !== 1 || candidate.phase !== 2 || candidate.status !== "PASS") found.push("identity");
  if (candidate.baseSha !== "b45921262b57902ddbaea9519a03f7aa7289621c" || candidate.headSha !== candidate.baseSha) found.push("base");
  if (JSON.stringify(candidate.dirtyAllowlist) !== JSON.stringify(dirtyPaths())) found.push("dirty");
  if (candidate.sources.some((source: { path: string; bytes: number; sha256: string }) => JSON.stringify(source) !== JSON.stringify(bind(source.path)))) found.push("source_binding");
  if (candidate.sourceDigest !== digest(JSON.stringify(candidate.sources.map((source: { path: string; sha256: string }) => [source.path, source.sha256])))) found.push("source_digest");
  if (JSON.stringify(candidate.spec) !== JSON.stringify(bind(candidate.spec.path))) found.push("spec_binding");
  if (JSON.stringify(candidate.dependency) !== JSON.stringify(bind(candidate.dependency.path))) found.push("dependency_binding");
  if (candidate.artifacts.some((artifact: { path: string; bytes: number; sha256: string }) => JSON.stringify(artifact) !== JSON.stringify(bind(artifact.path)))) found.push("artifact_binding");
  if (candidate.checks.some((entry: { status: string }) => entry.status !== "PASS")) found.push("check");
  if (candidate.outputs.length !== 2 || candidate.outputs.some((output: { status: string; sha256: string; bytes: number }) => output.status !== "PASS" || !/^[0-9a-f]{64}$/.test(output.sha256) || output.bytes <= 0)) found.push("output");
  if (JSON.stringify(candidate.isolation) !== JSON.stringify({ externalRequests: 0, aiProviderCalls: 0, paidCalls: 0, creditChanges: 0, repositoryWrites: 0, controlPlaneChanges: 0 })) found.push("isolation");
  if (!candidate.limitations.some((entry: string) => entry.includes("native Finder dialog"))) found.push("finder_disclosure");
  return found;
};

equal(errors(manifest), [], "manifest validates against live source, artifacts, outputs and disclosures");
equal(execFileSync("git", ["diff", "--cached", "--name-only"], { encoding: "utf8" }).trim(), "", "empty index");
equal(execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(), manifest.baseSha, "exact base");
equal(new Set(manifest.sources.map((source: { path: string }) => source.path)).size, manifest.sources.length, "unique source paths");
check(manifest.checks.length >= 16, "complete check inventory");

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
reject("spec", candidate => { candidate.spec.sha256 = "0".repeat(64); });
reject("dependency", candidate => { candidate.dependency.sha256 = "0".repeat(64); });
reject("artifact", candidate => { candidate.artifacts[0].sha256 = "0".repeat(64); });
reject("check", candidate => { candidate.checks[0].status = "FAIL"; });
reject("output-hash", candidate => { candidate.outputs[0].sha256 = "0"; });
reject("output-size", candidate => { candidate.outputs[1].bytes = 0; });
reject("network", candidate => { candidate.isolation.externalRequests = 1; });
reject("credits", candidate => { candidate.isolation.creditChanges = 1; });
reject("finder-disclosure", candidate => { candidate.limitations = []; });

const response = await fetch(manifest.review.url);
equal(response.status, 200, "review server responds");
check((await response.text()).length > 1_000, "review server serves the application");
const result = {
  status: "VALID",
  assertions,
  rejectedMutations,
  manifest: bind(MANIFEST_PATH),
  manifestSha256: digest(readFileSync(MANIFEST_PATH)),
  reviewUrl: manifest.review.url,
};
mkdirSync("output/spec-0009/phase-2", { recursive: true });
writeFileSync("output/spec-0009/phase-2/validation.json", `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify(result));
