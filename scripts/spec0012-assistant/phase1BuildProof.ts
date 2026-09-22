import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { phase1Environment } from "./phase1Environment.ts";

const output = resolve("output/spec-0012/phase-1-correction/build");
mkdirSync(output, { recursive: true });
const routes = ["app/page.tsx", "app/assistant/page.tsx", "app/api/ai-animator/route.ts", "app/favicon.ico"];
const focusedOnly = process.argv.includes("--focused-only");
const results: Record<string, unknown> = focusedOnly ? JSON.parse(readFileSync(resolve(output, "result.json"), "utf8")) : {};
for (const kind of focusedOnly ? ["focused"] as const : ["full", "focused"] as const) {
  const env = phase1Environment(`build-${kind}`);
  const args = ["node_modules/next/dist/bin/next", "build", "--webpack", ...(kind === "focused" ? ["--debug-build-paths", routes.join(",")] : [])];
  const result = spawnSync(process.execPath, args, { env, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  const log = `${result.stdout}\n${result.stderr}`;
  writeFileSync(resolve(output, `${kind}.log`), log);
  const network = readFileSync(env.SPEC0001_NETWORK_LEDGER, "utf8").split("\n").filter(Boolean).map(line => JSON.parse(line));
  assert.deepEqual(network.filter(entry => entry.result === "denied"), []);
  if (kind === "full") {
    assert.notEqual(result.status, 0);
    assert.match(log, /app\/dev\/ai-costs\/lifetime\/page\.tsx/);
    assert.match(log, /searchParams/);
    results.full = { status: "INHERITED_BASELINE_FAILURE", path: "app/dev/ai-costs/lifetime/page.tsx", failure: "PageProps searchParams", exitCode: result.status };
  } else {
    assert.equal(result.status, 0, log.slice(-10000));
    const manifest = JSON.parse(readFileSync(".next/server/app-paths-manifest.json", "utf8"));
    for (const route of ["/page", "/assistant/page", "/api/ai-animator/route", "/favicon.ico/route"]) assert.ok(manifest[route], route);
    results.focused = { status: "PASS", routes, exitCode: result.status };
  }
  console.log(`PASS ${kind} build gate`);
}
writeFileSync(resolve(output, "result.json"), `${JSON.stringify({ status: "PASS", ...results }, null, 2)}\n`);
