import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

const MANIFEST_PATH = "output/spec-0007/phase-4/proof-manifest.json";
const manifest = JSON.parse(readFileSync(MANIFEST_PATH, "utf8"));
let assertions = 0;
const equal = (actual: unknown, expected: unknown, label: string) => { assertions += 1; assert.deepEqual(actual, expected, label); };
const check = (value: unknown, label: string) => { assertions += 1; assert.ok(value, label); };
const digest = (bytes: Uint8Array | string) => createHash("sha256").update(bytes).digest("hex");
const bind = (path: string) => { const bytes = readFileSync(path); return { path, bytes: bytes.length, sha256: digest(bytes) }; };
const dirtyPaths = () => execFileSync("git", ["status", "--porcelain=v1", "-z", "--untracked-files=all"])
  .toString("utf8").split("\0").filter(Boolean).map(record => record.slice(3)).sort();

equal(manifest.kind, "spec0007-phase4-proof-manifest", "manifest kind");
equal(manifest.version, 1, "manifest version");
equal(manifest.status, "PASS", "manifest status");
equal(manifest.baseSha, "f16d36b454728b3e216ec738013366f0230ddbdb", "base SHA");
equal(execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(), manifest.baseSha, "live base SHA");
equal(execFileSync("git", ["diff", "--cached", "--name-only"], { encoding: "utf8" }).trim(), "", "empty index");
equal(dirtyPaths(), manifest.dirtyAllowlist, "exact dirty allowlist");
equal(manifest.sources.map((source: { path: string }) => bind(source.path)), manifest.sources, "live source bindings");
check(manifest.checks.length >= 14 && manifest.checks.every((entry: { status: string }) => entry.status !== "FAIL"), "all checks pass or record inherited baseline");
equal(manifest.checks.filter((entry: { status: string }) => entry.status === "INHERITED_BASELINE").map((entry: { id: string }) => entry.id), ["production-build"], "only the untouched production-build baseline is inherited");
equal(manifest.artifacts.map((artifact: { path: string }) => bind(artifact.path)), manifest.artifacts, "artifact bindings");
equal(new Set(manifest.artifacts.map((artifact: { path: string }) => artifact.path)).size, manifest.artifacts.length, "unique artifact paths");

const browser = JSON.parse(readFileSync("output/spec-0007/phase-4/browser/phase4-browser.json", "utf8"));
equal(browser.status, "PASS", "browser status");
check(browser.assertions >= 30, "browser assertion floor");
check(browser.representativeImportMs <= 1_000, "desktop import budget");
check(browser.compactImportMs <= 2_000, "compact import budget");
check(browser.cycleP95Ms <= 1_000, "cycle p95 budget");
equal(browser.urlLedger.created, browser.urlLedger.revoked, "temporary URL revocation ledger");
equal(browser.externalRequests, [], "zero external requests");
equal(browser.errors, [], "zero browser errors");

const response = await fetch(manifest.review.url);
equal(response.status, 200, "review server response");
check((await response.text()).length > 1000, "review server serves app");
const result = { status: "PASS", assertions, manifest: bind(MANIFEST_PATH), manifestSha256: digest(readFileSync(MANIFEST_PATH)), reviewUrl: manifest.review.url };
mkdirSync("output/spec-0007/phase-4", { recursive: true });
writeFileSync("output/spec-0007/phase-4/validation.json", JSON.stringify(result, null, 2) + "\n");
console.log(JSON.stringify(result));
