import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const manifestPath = path.join(root, "output/spec0015/phase3/proof-manifest.json");
const manifestBytes = fs.readFileSync(manifestPath);
const manifest = JSON.parse(manifestBytes);
const hashFile = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const fail = (message) => { throw new Error(message); };

if (manifest.schema !== "spec0015-phase3-proof-manifest-v1") fail("Unknown manifest schema.");
if (manifest.baseAndHeadSha !== manifest.expectedBaseSha || manifest.expectedBaseSha !== "c53ed494d55f8314ed9d07783fbb1765615c01e6") fail("Base/HEAD mismatch.");
if (!manifest.indexEmpty || execFileSync("git", ["diff", "--cached", "--name-only"], { cwd: root, encoding: "utf8" }).trim()) fail("Index is not empty.");

for (const group of [manifest.implementation, manifest.proofArtifacts]) {
  for (const entry of group) {
    const absolutePath = path.join(root, entry.path);
    if (!fs.existsSync(absolutePath)) fail(`Manifest file is missing: ${entry.path}`);
    if (fs.statSync(absolutePath).size !== entry.bytes || hashFile(absolutePath) !== entry.sha256) fail(`Manifest hash mismatch: ${entry.path}`);
  }
}

const statusPaths = execFileSync("git", ["status", "--porcelain=v1", "--untracked-files=all"], { cwd: root, encoding: "utf8" })
  .trimEnd().split("\n").filter(Boolean).map((line) => line.slice(3)).sort();
const recordedPaths = manifest.implementation.map((entry) => entry.path).sort();
if (JSON.stringify(statusPaths) !== JSON.stringify(recordedPaths)) fail("Dirty-path inventory changed after manifest creation.");

for (const sentinel of manifest.protectedSentinels) {
  const current = hashFile(path.join(root, sentinel.path));
  const base = crypto.createHash("sha256").update(execFileSync("git", ["show", `HEAD:${sentinel.path}`], { cwd: root })).digest("hex");
  if (current !== sentinel.sha256 || base !== sentinel.sha256) fail(`Protected sentinel mismatch: ${sentinel.path}`);
}

if (manifest.accountDatabases.automatedFixture.users !== 2 ||
  !Number.isInteger(manifest.accountDatabases.ordinaryReview.users) || manifest.accountDatabases.ordinaryReview.users < 1 ||
  !Number.isInteger(manifest.accountDatabases.ordinaryReview.sessions) || manifest.accountDatabases.ordinaryReview.sessions < 0) {
  fail("Automated fixture and user-maintained review database counts are invalid.");
}
if (manifest.reviewServer.providerDoubles !== false || manifest.reviewServer.paidProviderCallsDuringProof !== 0) fail("Review provider boundary is invalid.");

for (const entry of manifest.proofArtifacts.filter((item) => /\.(?:json|ya?ml|txt)$/i.test(item.path))) {
  const text = fs.readFileSync(path.join(root, entry.path), "utf8");
  if (/CorrectHorse|better-auth\.session_token|OPENAI_API_KEY|auth-secret/i.test(text)) fail(`Sensitive proof text detected: ${entry.path}`);
}

const response = await fetch("http://127.0.0.1:58580/");
const html = await response.text();
if (response.status !== 200 || !html.includes("Sign in") || !html.includes("Log in") || html.includes("Continue privately")) fail("Ordinary review entry is not ready.");

const manifestSha256 = crypto.createHash("sha256").update(manifestBytes).digest("hex");
process.stdout.write(`Phase 3 proof manifest validated: ${manifestSha256}\n`);
