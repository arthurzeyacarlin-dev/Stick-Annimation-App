import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const outputRoot = resolve("output/spec-0011/phase-2/build");
mkdirSync(outputRoot, { recursive: true });
const digest = (value: Uint8Array | string) => createHash("sha256").update(value).digest("hex");
const fontFixture = JSON.parse(readFileSync("scripts/fixtures/spec0001-browser/v1/next-font-google-response.json", "utf8")) as {
  responses: Array<{ url: string; family: string; faces: Array<{ subset: string; file: string; sha256: string; unicodeRange: string }> }>;
};
const fontResponses: Record<string, string> = {};
for (const response of fontFixture.responses) {
  fontResponses[response.url] = response.faces.map(face => {
    const bytes = readFileSync(face.file);
    assert.equal(`sha256:${digest(bytes)}`, face.sha256);
    return `/* ${face.subset} */\n@font-face { font-family: '${response.family}'; font-style: normal; font-weight: 100 900; font-display: swap; src: url(${resolve(face.file)}) format('woff2'); unicode-range: ${face.unicodeRange}; }`;
  }).join("\n");
}
const fontMockPath = resolve(outputRoot, "font-responses.cjs");
const fullNetworkLedgerPath = resolve(outputRoot, "full-network.jsonl");
const focusedNetworkLedgerPath = resolve(outputRoot, "focused-network.jsonl");
writeFileSync(fontMockPath, `"use strict";\nmodule.exports = ${JSON.stringify(fontResponses, null, 2)};\n`);
writeFileSync(fullNetworkLedgerPath, "");
writeFileSync(focusedNetworkLedgerPath, "");
const buildEnvironment = (networkLedgerPath: string) => ({
  ...process.env,
  NEXT_TELEMETRY_DISABLED: "1",
  NEXT_FONT_GOOGLE_MOCKED_RESPONSES: fontMockPath,
  OPENAI_API_KEY: "",
  SUPABASE_URL: "",
  SUPABASE_ANON_KEY: "",
  SUPABASE_SERVICE_ROLE_KEY: "",
  SPEC0001_NETWORK_LEDGER: networkLedgerPath,
  SPEC0001_REPOSITORY_ROOT: dirname(realpathSync("node_modules")),
  NODE_OPTIONS: `--require=${resolve("scripts/spec0001-browser/networkDeny.cjs")}`,
});
const startedAt = performance.now();
const fullBuild = spawnSync(process.execPath, [resolve("node_modules/next/dist/bin/next"), "build", "--webpack"], {
  encoding: "utf8",
  maxBuffer: 64 * 1024 * 1024,
  env: buildEnvironment(fullNetworkLedgerPath),
});
const fullBuildOutput = `${fullBuild.stdout}\n${fullBuild.stderr}`;
assert.notEqual(fullBuild.status, 0, "full production build unexpectedly passed; update the inherited-baseline receipt");
assert.match(fullBuildOutput, /app\/dev\/ai-costs\/lifetime\/page\.tsx/);
assert.match(fullBuildOutput, /searchParams/);
const fullNetwork = readFileSync(fullNetworkLedgerPath, "utf8").split("\n").filter(Boolean).map(line => JSON.parse(line) as { result: string; target: string });
assert.equal(fullNetwork.filter(entry => entry.result === "denied").length, 0, "full production build attempted no denied network request");

const focusedRoutes = ["app/page.tsx", "app/api/ai-animator/route.ts"];
const build = spawnSync(process.execPath, [resolve("node_modules/next/dist/bin/next"), "build", "--webpack", "--debug-build-paths", focusedRoutes.join(",")], {
  encoding: "utf8",
  maxBuffer: 64 * 1024 * 1024,
  env: buildEnvironment(focusedNetworkLedgerPath),
});
assert.equal(build.status, 0, `focused production build failed: ${build.stderr || build.stdout}`);
const network = readFileSync(focusedNetworkLedgerPath, "utf8").split("\n").filter(Boolean).map(line => JSON.parse(line) as { result: string; target: string });
assert.equal(network.filter(entry => entry.result === "denied").length, 0, "focused production build attempted no denied network request");
const result = {
  kind: "spec0011-phase2-production-build-gate",
  version: 1,
  status: "PASS",
  elapsedMs: Math.round((performance.now() - startedAt) * 10) / 10,
  fullBuild: {
    status: "INHERITED_BASELINE_FAILURE",
    exitCode: fullBuild.status,
    exactUntouchedPath: "app/dev/ai-costs/lifetime/page.tsx",
    failureClass: "PageProps searchParams route typing",
    networkRequests: fullNetwork.length,
    deniedNetworkRequests: 0,
    stdoutSha256: digest(fullBuild.stdout),
    stderrSha256: digest(fullBuild.stderr),
  },
  focusedBuild: {
    status: "PASS",
    routes: focusedRoutes,
    networkRequests: network.length,
    deniedNetworkRequests: 0,
    stdoutSha256: digest(build.stdout),
    stderrSha256: digest(build.stderr),
  },
};
writeFileSync(resolve(outputRoot, "result.json"), `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify(result));
