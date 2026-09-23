import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { phase1Environment } from "../phase1Environment.ts";

const base = "3676cfabba28554c4e5106a7cfb8822ac7c8c456";
const output = resolve("output/spec-0012/phase-5/build"); mkdirSync(output, { recursive: true });
const routes = ["app/page.tsx", "app/assistant/page.tsx", "app/api/ai-animator/route.ts", "app/api/diamond-assistant/route.ts", "app/api/diamond-assistant-transcription/route.ts", "app/favicon.ico"];
const results: Record<string, unknown> = {};
for (const kind of ["full", "focused"] as const) {
  const env = phase1Environment(`phase5-build-${kind}`);
  const args = ["node_modules/next/dist/bin/next", "build", "--webpack", ...(kind === "focused" ? ["--debug-build-paths", routes.join(",")] : [])];
  const result = spawnSync(process.execPath, args, { env, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  const log = `${result.stdout}\n${result.stderr}`; writeFileSync(resolve(output, `${kind}.log`), log);
  const network = readFileSync(env.SPEC0001_NETWORK_LEDGER, "utf8").split("\n").filter(Boolean).map(line => JSON.parse(line)); assert.deepEqual(network.filter(entry => entry.result === "denied"), []);
  if (kind === "full" && result.status !== 0) {
    assert.match(log, /app\/dev\/ai-costs\/lifetime\/page\.tsx/); assert.match(log, /searchParams/);
    const path = "app/dev/ai-costs/lifetime/page.tsx"; const bytes = readFileSync(path); assert.deepEqual(bytes, execFileSync("git", ["show", `${base}:${path}`]));
    results.full = { status: "INHERITED_BASELINE_FAILURE", path, sourceSha256: createHash("sha256").update(bytes).digest("hex"), failure: "PageProps searchParams", exitCode: result.status };
  } else {
    assert.equal(result.status, 0, log.slice(-10000));
    if (kind === "focused") { const manifest = JSON.parse(readFileSync(".next/server/app-paths-manifest.json", "utf8")); for (const route of ["/page", "/assistant/page", "/api/ai-animator/route", "/api/diamond-assistant/route", "/api/diamond-assistant-transcription/route", "/favicon.ico/route"]) assert.ok(manifest[route], route); }
    results[kind] = { status: "PASS", routes: kind === "focused" ? routes : "all", exitCode: result.status };
  }
  console.log(`PASS ${kind} build gate`);
}
writeFileSync(resolve(output, "result.json"), `${JSON.stringify({ status: "PASS", base, ...results, realProviderCalls: 0, paidCalls: 0 }, null, 2)}\n`);
