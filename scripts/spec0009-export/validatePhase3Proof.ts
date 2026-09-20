import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

const MANIFEST_PATH = "output/spec-0009/phase-3/proof-manifest.json";
const EXPECTED_BASE = "53d825490c08bce620784f0213b4574792732f22";
const EXPECTED_DESTINATIONS = [
  "Original", "YouTube", "YouTube Shorts", "TikTok", "Instagram Reels", "Instagram Stories", "Instagram Feed",
  "Facebook Reels", "Facebook Feed", "Discord", "Snapchat", "X", "Reddit", "Custom / Other",
];
const FIRST_PARTY_HOSTS = new Set([
  "support.google.com", "ads.tiktok.com", "www.facebook.com", "support.discord.com", "help.snapchat.com",
  "help.x.com", "support.reddithelp.com",
]);
const browserEvidence = JSON.parse(readFileSync("output/spec-0009/phase-3/browser.json", "utf8"));
const performanceEvidence = JSON.parse(readFileSync("output/spec-0009/phase-3/performance.json", "utf8"));
const provenanceEvidence = JSON.parse(readFileSync("output/spec-0009/phase-3/provenance.json", "utf8"));
const geometryEvidence = JSON.parse(readFileSync("output/spec-0009/phase-3/geometry.json", "utf8"));
const expectedPerformanceOutputs = (performanceEvidence.exports as Array<Record<string, unknown>>).map((output, index) => ({
  ...output,
  width: index === 0 ? 1280 : 1920,
  height: index === 0 ? 720 : 1080,
  fps: 24,
  frameCount: index === 0 ? 7_200 : 1_440,
  durationSeconds: index === 0 ? 300 : 60,
  audio: true,
  audioStartFrame: 0,
  audioDurationSeconds: 0.1,
}));
const EXPECTED_BROWSER_OUTPUTS: Record<string, [number, number]> = {
  "original-720": [1280, 720],
  "wide-1080": [1920, 1080],
  "vertical-720": [720, 1280],
  "portrait-720": [720, 900],
  "square-720": [720, 720],
  "custom-1024x768": [1024, 768],
};
const manifest = JSON.parse(readFileSync(MANIFEST_PATH, "utf8"));
let assertions = 0;
const equal = (actual: unknown, expected: unknown, label: string) => { assertions += 1; assert.deepEqual(actual, expected, label); };
const check = (actual: unknown, label: string) => { assertions += 1; assert.ok(actual, label); };
const digest = (bytes: Uint8Array | string) => createHash("sha256").update(bytes).digest("hex");
const bind = (filePath: string) => { const bytes = readFileSync(filePath); return { path: filePath, bytes: bytes.length, sha256: digest(bytes) }; };
const dirtyPaths = () => execFileSync("git", ["status", "--porcelain=v1", "-z", "--untracked-files=all"])
  .toString("utf8").split("\0").filter(Boolean).map(record => record.slice(3)).sort();
const hasExactBinding = (binding: { path: string; bytes: number; sha256: string }) => JSON.stringify(binding) === JSON.stringify(bind(binding.path));
const validSha = (value: unknown) => typeof value === "string" && /^[0-9a-f]{64}$/.test(value);
const validOutput = (output: Record<string, unknown>) => output.status === "PASS" && Number(output.bytes) > 0 && validSha(output.sha256)
  && Number(output.width ?? 1) > 0 && Number(output.height ?? 1) > 0;

const errors = (candidate: typeof manifest) => {
  const found: string[] = [];
  if (candidate.kind !== "spec0009-phase3-proof-manifest" || candidate.version !== 1 || candidate.phase !== 3 || candidate.status !== "PASS") found.push("identity");
  if (candidate.evidenceDate !== "2026-09-20") found.push("evidence_date");
  if (candidate.baseSha !== EXPECTED_BASE || candidate.headSha !== candidate.baseSha || candidate.branch !== "DETACHED") found.push("base");
  if (JSON.stringify(candidate.dirtyAllowlist) !== JSON.stringify(dirtyPaths())) found.push("dirty");
  if (candidate.sources.length !== candidate.dirtyAllowlist.length || candidate.sources.some((source: { path: string; bytes: number; sha256: string }) => !hasExactBinding(source))) found.push("source_binding");
  if (new Set(candidate.sources.map((source: { path: string }) => source.path)).size !== candidate.sources.length) found.push("source_uniqueness");
  if (candidate.sourceDigest !== digest(JSON.stringify(candidate.sources.map((source: { path: string; sha256: string }) => [source.path, source.sha256])))) found.push("source_digest");
  if (!hasExactBinding(candidate.spec)) found.push("spec_binding");
  if (!hasExactBinding(candidate.dependency)) found.push("dependency_binding");
  if (candidate.artifacts.length < 18 || candidate.artifacts.some((artifact: { path: string; bytes: number; sha256: string }) => !hasExactBinding(artifact))) found.push("artifact_binding");
  if (new Set(candidate.artifacts.map((artifact: { path: string }) => artifact.path)).size !== candidate.artifacts.length) found.push("artifact_uniqueness");
  if (candidate.checks.length < 24 || candidate.checks.some((entry: { status: string }) => !["PASS", "INHERITED_BASELINE"].includes(entry.status))) found.push("check");
  if (candidate.catalog.version !== "2026-09-20" || JSON.stringify(candidate.catalog.destinationNames) !== JSON.stringify(EXPECTED_DESTINATIONS)) found.push("catalog");
  if (candidate.catalog.version !== provenanceEvidence.catalogVersion || JSON.stringify(candidate.catalog.officialSources) !== JSON.stringify(provenanceEvidence.sources) || JSON.stringify(candidate.catalog.destinationNames) !== JSON.stringify(browserEvidence.facts.destinations.names)) found.push("catalog_evidence_mismatch");
  if (candidate.catalog.runtimeRequests !== 0 || candidate.catalog.brandPolicy !== "neutral local text fallbacks only; no third-party logo assets") found.push("brand_provenance");
  if (candidate.catalog.officialSources.length !== 11 || candidate.catalog.officialSources.some((source: { url: string; title: string; accessedAt: string; exactValues: unknown[] }) => {
    const url = new URL(source.url);
    return url.protocol !== "https:" || !FIRST_PARTY_HOSTS.has(url.hostname) || source.title.length < 8 || source.accessedAt !== "2026-09-20" || source.exactValues.length === 0;
  })) found.push("provenance");
  if (candidate.geometry.receiptCount !== 26 || candidate.geometry.framingMode !== "contain-complete-animation" || candidate.geometry.decodedNoCropOutputs.length !== 6) found.push("geometry");
  const expectedDecodedOutputs = browserEvidence.facts.exports.map((output: Record<string, unknown>) => ({ id: output.id, geometry: output.geometry, darkPixels: output.darkPixels, darkBounds: output.darkBounds }));
  if (candidate.geometry.receiptCount !== geometryEvidence.length || JSON.stringify(candidate.geometry.decodedNoCropOutputs) !== JSON.stringify(expectedDecodedOutputs)) found.push("geometry_evidence_mismatch");
  if (candidate.geometry.decodedNoCropOutputs.some((output: { darkPixels: number; geometry: { content: { x: number; y: number; width: number; height: number }; canvas: { width: number; height: number } }; darkBounds: { minX: number; minY: number; maxX: number; maxY: number } }) => {
    const { content, canvas } = output.geometry;
    const bounds = output.darkBounds;
    return output.darkPixels <= 0 || content.x < 0 || content.y < 0 || content.x + content.width > canvas.width + 0.01 || content.y + content.height > canvas.height + 0.01
      || bounds.minX < Math.floor(content.x) - 1 || bounds.minY < Math.floor(content.y) - 1 || bounds.maxX > Math.ceil(content.x + content.width) + 1 || bounds.maxY > Math.ceil(content.y + content.height) + 1;
  })) found.push("crop");
  if (candidate.fixtures.browserProject.sha256 !== "c03bd89d9b3846dd1495f3e0bc618b05b1d47b1304d4d5f645cd018ae5fffafa"
    || candidate.fixtures.long.projectId !== "900772a7-94fc-4ac4-a4f4-0ac5f80083c0" || candidate.fixtures.long.projectDigest !== "ab048ea965fe524083aa8affca51d51c65aba65566560d2c37222b28f786048d"
    || candidate.fixtures.short.projectId !== "900772a7-94fc-4ac4-a4f4-0ac5f80083c0" || candidate.fixtures.short.projectDigest !== "c74d7588265b6c58cc9b423d6d4108ce4c9e67a3c058294895aea13c55d181d4") found.push("fixture_digest");
  if (JSON.stringify(candidate.fixtures.browserProject) !== JSON.stringify(browserEvidence.facts.storage.before)
    || JSON.stringify(candidate.fixtures.long) !== JSON.stringify({ ...performanceEvidence.fixtures.long, revision: 2, audioStartFrame: 0, audioDurationSeconds: 0.1, audioFrequencyHz: 440 })
    || JSON.stringify(candidate.fixtures.short) !== JSON.stringify({ ...performanceEvidence.fixtures.short, revision: 3, audioStartFrame: 0, audioDurationSeconds: 0.1, audioFrequencyHz: 440 })) found.push("fixture_evidence_mismatch");
  if (candidate.fixtures.long.revision !== 2 || candidate.fixtures.long.frameCount !== 7_200 || candidate.fixtures.long.fps !== 24 || candidate.fixtures.long.durationSeconds !== 300 || !candidate.fixtures.long.audio
    || candidate.fixtures.long.audioStartFrame !== 0 || candidate.fixtures.long.audioDurationSeconds !== 0.1 || candidate.fixtures.long.audioFrequencyHz !== 440) found.push("long_fixture");
  if (candidate.fixtures.short.revision !== 3 || candidate.fixtures.short.frameCount !== 1_440 || candidate.fixtures.short.fps !== 24 || candidate.fixtures.short.durationSeconds !== 60 || !candidate.fixtures.short.audio
    || candidate.fixtures.short.audioStartFrame !== 0 || candidate.fixtures.short.audioDurationSeconds !== 0.1 || candidate.fixtures.short.audioFrequencyHz !== 440) found.push("short_fixture");
  if (candidate.outputs.browser.length !== 6 || candidate.outputs.browser.some((output: Record<string, unknown>) => !validOutput(output))) found.push("browser_output");
  if (JSON.stringify(candidate.outputs.browser) !== JSON.stringify(browserEvidence.facts.exports)) found.push("browser_output_evidence_mismatch");
  if (candidate.outputs.browser.some((output: Record<string, unknown>) => {
    const dimensions = EXPECTED_BROWSER_OUTPUTS[String(output.id)];
    return !dimensions || output.width !== dimensions[0] || output.height !== dimensions[1] || Math.abs(Number(output.durationSeconds) - 0.083333) > 0.000001;
  })) found.push("browser_output_exactness");
  if (candidate.outputs.performance.length !== 2 || candidate.outputs.performance.some((output: Record<string, unknown>) => !validOutput(output))) found.push("performance_output");
  if (JSON.stringify(candidate.outputs.performance) !== JSON.stringify(expectedPerformanceOutputs)) found.push("performance_output_evidence_mismatch");
  if (candidate.outputs.performance[0].width !== 1280 || candidate.outputs.performance[0].height !== 720 || candidate.outputs.performance[0].fps !== 24 || candidate.outputs.performance[0].frameCount !== 7_200 || candidate.outputs.performance[0].durationSeconds !== 300 || !candidate.outputs.performance[0].audio || candidate.outputs.performance[0].audioStartFrame !== 0 || candidate.outputs.performance[0].audioDurationSeconds !== 0.1) found.push("long_output_exactness");
  if (candidate.outputs.performance[1].width !== 1920 || candidate.outputs.performance[1].height !== 1080 || candidate.outputs.performance[1].fps !== 24 || candidate.outputs.performance[1].frameCount !== 1_440 || candidate.outputs.performance[1].durationSeconds !== 60 || !candidate.outputs.performance[1].audio || candidate.outputs.performance[1].audioStartFrame !== 0 || candidate.outputs.performance[1].audioDurationSeconds !== 0.1) found.push("short_output_exactness");
  if (candidate.outputs.performance[0].elapsedMs >= 600_000 || candidate.outputs.performance[0].peakHeapBytes >= 536_870_912 || candidate.outputs.performance[0].maximumLongTaskMs >= 250) found.push("long_performance");
  if (candidate.outputs.performance[1].elapsedMs >= 240_000 || candidate.outputs.performance[1].peakHeapBytes >= 536_870_912 || candidate.performance.firstFrame.sixtySecondMs >= 2_000) found.push("short_performance");
  if (candidate.performance.cancel.status !== "PASS" || candidate.performance.cancel.cancelAcknowledgedMs >= 250 || candidate.performance.cancel.cancelTerminalMs >= 2_000 || candidate.performance.cancel.remainingBytes !== 0) found.push("cancel");
  if (JSON.stringify(candidate.performance) !== JSON.stringify({ firstFrame: performanceEvidence.firstFrame, cancel: performanceEvidence.cancel })) found.push("performance_evidence_mismatch");
  if (!candidate.progress.basedOnEncodedFrames || !candidate.progress.visibleTerminalReceiptOnlyAfterValidation) found.push("progress_truth");
  if (candidate.failures.finderCancel !== "PASS" || candidate.failures.permissionDenied !== "PASS") found.push("failure_truth");
  if (JSON.stringify(candidate.failures) !== JSON.stringify(browserEvidence.facts.failures)) found.push("failure_evidence_mismatch");
  if (JSON.stringify(candidate.isolation) !== JSON.stringify({ externalRequests: 0, aiProviderCalls: 0, paidCalls: 0, creditChanges: 0, projectChanges: 0, historyChanges: 0, repositoryWrites: 0, controlPlaneChanges: 0, accountChanges: 0, uploads: 0, deployments: 0 })) found.push("isolation");
  if (!validSha(candidate.inheritedEvidence.phase2AcceptedManifestSha256) || !validSha(candidate.inheritedEvidence.phase2AcceptedSourceDigest)) found.push("inherited_evidence");
  if (candidate.mutationInventory.length < 45) found.push("mutation_inventory");
  if (!candidate.limitations.some((entry: string) => entry.includes("native macOS Finder dialog"))) found.push("finder_disclosure");
  if (!candidate.limitations.some((entry: string) => entry.includes("Direct upload/posting"))) found.push("scope_disclosure");
  return found;
};

equal(errors(manifest), [], "manifest validates against live source, artifacts, catalog, geometry, outputs, performance and isolation");
equal(execFileSync("git", ["diff", "--cached", "--name-only"], { encoding: "utf8" }).trim(), "", "empty index");
equal(execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(), manifest.baseSha, "exact base");
equal(execFileSync("git", ["branch", "--show-current"], { encoding: "utf8" }).trim() || "DETACHED", manifest.branch, "exact branch identity");
check(manifest.sources.some((source: { path: string }) => source.path.endsWith("validatePhase3Proof.ts")), "validator source is bound");
check(manifest.artifacts.some((artifact: { path: string }) => artifact.path.endsWith("performance.json")), "performance receipt is bound");

const rejectedMutations: string[] = [];
const reject = (name: string, mutate: (candidate: typeof manifest) => void) => {
  const candidate = structuredClone(manifest);
  mutate(candidate);
  assertions += 1;
  assert.ok(errors(candidate).length > 0, `${name} mutation rejected`);
  rejectedMutations.push(name);
};
reject("identity", candidate => { candidate.status = "FAIL"; });
reject("base", candidate => { candidate.baseSha = "0".repeat(40); });
reject("dirty-allowlist", candidate => { candidate.dirtyAllowlist.pop(); });
reject("source-binding", candidate => { candidate.sources[0].sha256 = "0".repeat(64); });
reject("source-digest", candidate => { candidate.sourceDigest = "0".repeat(64); });
reject("omitted-source", candidate => { candidate.sources.pop(); });
reject("spec-binding", candidate => { candidate.spec.sha256 = "0".repeat(64); });
reject("dependency-binding", candidate => { candidate.dependency.bytes = 0; });
reject("artifact-binding", candidate => { candidate.artifacts[0].sha256 = "0".repeat(64); });
reject("omitted-artifact", candidate => { candidate.artifacts.pop(); });
reject("check-status", candidate => { candidate.checks[0].status = "FAIL"; });
reject("catalog-version", candidate => { candidate.catalog.version = "stale"; });
reject("destination-name", candidate => { candidate.catalog.destinationNames[0] = "Changed"; });
reject("source-access-date", candidate => { candidate.catalog.officialSources[0].accessedAt = "2025-01-01"; });
reject("source-url", candidate => { candidate.catalog.officialSources[0].url = "https://example.com"; });
reject("platform-value", candidate => { candidate.catalog.officialSources[0].exactValues = []; });
reject("brand-provenance", candidate => { candidate.catalog.brandPolicy = "unknown logos"; });
reject("geometry-count", candidate => { candidate.geometry.receiptCount = 25; });
reject("framing-mode", candidate => { candidate.geometry.framingMode = "crop"; });
reject("cropped-content", candidate => { candidate.geometry.decodedNoCropOutputs[0].geometry.content.x = -10; });
reject("missing-content-class", candidate => { candidate.geometry.decodedNoCropOutputs[0].darkPixels = 0; });
reject("project-digest", candidate => { candidate.fixtures.browserProject.sha256 = "0".repeat(64); });
reject("revision-digest", candidate => { candidate.fixtures.long.projectDigest = "0".repeat(64); });
reject("wrong-project", candidate => { candidate.fixtures.long.projectId = "changed"; });
reject("wrong-revision", candidate => { candidate.fixtures.short.revision = 4; });
reject("wrong-frame-count", candidate => { candidate.fixtures.long.frameCount = 7_199; });
reject("wrong-fps", candidate => { candidate.fixtures.short.fps = 25; });
reject("wrong-duration", candidate => { candidate.fixtures.short.durationSeconds = 61; });
reject("missing-audio", candidate => { candidate.fixtures.long.audio = false; });
reject("shifted-audio", candidate => { candidate.fixtures.long.audioStartFrame = 1; });
reject("output-hash", candidate => { candidate.outputs.browser[0].sha256 = "0"; });
reject("output-size", candidate => { candidate.outputs.performance[0].bytes = 0; });
reject("output-dimensions", candidate => { candidate.outputs.browser[0].width = 0; });
reject("output-duration", candidate => { candidate.outputs.browser[0].durationSeconds = 1; });
reject("false-success", candidate => { candidate.outputs.performance[0].status = "FAIL"; });
reject("export-time-gate", candidate => { candidate.outputs.performance[0].elapsedMs = 600_000; });
reject("heap-gate", candidate => { candidate.outputs.performance[0].peakHeapBytes = 536_870_912; });
reject("long-task-gate", candidate => { candidate.outputs.performance[0].maximumLongTaskMs = 250; });
reject("first-frame-gate", candidate => { candidate.performance.firstFrame.sixtySecondMs = 2_000; });
reject("false-progress", candidate => { candidate.progress.basedOnEncodedFrames = false; });
reject("false-cancel", candidate => { candidate.performance.cancel.status = "FAIL"; });
reject("cancel-latency", candidate => { candidate.performance.cancel.cancelAcknowledgedMs = 250; });
reject("cancel-terminal", candidate => { candidate.performance.cancel.cancelTerminalMs = 2_000; });
reject("cancel-cleanup", candidate => { candidate.performance.cancel.remainingBytes = 1; });
reject("network", candidate => { candidate.isolation.externalRequests = 1; });
reject("provider", candidate => { candidate.isolation.aiProviderCalls = 1; });
reject("credits", candidate => { candidate.isolation.creditChanges = 1; });
reject("project-mutation", candidate => { candidate.isolation.projectChanges = 1; });
reject("history-mutation", candidate => { candidate.isolation.historyChanges = 1; });
reject("repository-mutation", candidate => { candidate.isolation.repositoryWrites = 1; });
reject("upload", candidate => { candidate.isolation.uploads = 1; });
reject("deployment", candidate => { candidate.isolation.deployments = 1; });
reject("finder-disclosure", candidate => { candidate.limitations = []; });

const response = await fetch(manifest.review.url);
equal(response.status, 200, "review server responds");
check((await response.text()).length > 1_000, "review server serves the application");
const result = {
  status: "VALID",
  validatorVersion: 1,
  assertions,
  rejectedMutations,
  manifest: bind(MANIFEST_PATH),
  manifestSha256: digest(readFileSync(MANIFEST_PATH)),
  sourceDigest: manifest.sourceDigest,
  reviewUrl: manifest.review.url,
};
mkdirSync("output/spec-0009/phase-3", { recursive: true });
writeFileSync("output/spec-0009/phase-3/validation.json", `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify(result));
