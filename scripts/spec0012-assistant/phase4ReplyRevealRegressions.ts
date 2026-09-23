import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const base = "741ee803f9e0bd72f7c64174a77e52a6ac3a7b17";
const origin = process.env.SPEC0012_REVEAL_ORIGIN ?? "http://127.0.0.1:58060";
const output = resolve("output/spec-0012/phase-4-reply-reveal/regressions");
const adapters = resolve(output, "adapters"); mkdirSync(adapters, { recursive: true });
const sha = (value: string) => createHash("sha256").update(value).digest("hex");
const receipts: Array<Record<string, unknown>> = [];
const tasks = [
  ["animator-smoke", "scripts/spec0012-assistant/phase2AnimatorSmoke.ts"],
  ["assistant-browser", "scripts/spec0012-assistant/phase2BrowserProof.ts"],
  ["presentation-browser", "scripts/spec0012-assistant/phase2CorrectionBrowser.ts"],
  ["repeated-browser", "scripts/spec0012-assistant/phase2FinalCorrectionBrowser.ts"],
  ["restart-browser", "scripts/spec0012-assistant/phase2RestartProof.ts"],
  ["protected-browser", "scripts/spec0012-assistant/phase2ProtectedBrowser.ts"],
] as const;

for (const [name, sourcePath] of tasks) {
  const source = readFileSync(sourcePath, "utf8");
  const adapted = source
    .replaceAll('"../../src/', `"${resolve("src")}/`)
    .replaceAll('"./phase2Fixtures.ts"', `"${resolve("scripts/spec0012-assistant/phase2Fixtures.ts")}"`)
    .replaceAll('"../spec0011-project-library/', `"${resolve("scripts/spec0011-project-library")}/`)
    .replaceAll("http://127.0.0.1:57970", origin)
    .replaceAll("output/spec-0012/phase-2-correction", "output/spec-0012/phase-4-reply-reveal/regressions")
    .replaceAll("output/spec-0012/phase-2-final-correction", "output/spec-0012/phase-4-reply-reveal/regressions/final-correction")
    .replaceAll('{ issues: 1, blocked: true }, "corrupt digest visible and unsafe writes blocked"', '{ issues: 1, blocked: false }, "corrupt digest is reported while a distinct healthy chat remains writable"')
    .replaceAll('equal(await rawRead(storePage), corruptBefore, "corrupt raw bytes preserved")', 'equal((await rawRead(storePage)).find(value => (value as { id?: unknown }).id === (corruptBefore[0] as { id?: unknown }).id), corruptBefore[0], "corrupt raw bytes preserved while the distinct healthy row is created")');
  if (name === "assistant-browser") {
    assert.doesNotMatch(adapted, /corrupt digest visible and unsafe writes blocked/);
    assert.match(adapted, /distinct healthy chat remains writable/);
  }
  const target = resolve(adapters, `${name}.ts`); writeFileSync(target, adapted);
  const result = spawnSync(process.execPath, ["--experimental-strip-types", target], { cwd: process.cwd(), encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  const log = `${name}.log`; writeFileSync(resolve(output, log), `${result.stdout}\n${result.stderr}`);
  assert.equal(result.status, 0, `${name}: ${result.stderr.slice(-8000)}`);
  receipts.push({ name, sourcePath, sourceSha256: sha(source), adaptedSha256: sha(adapted), changes: [`local origin → ${origin}`, "proof output root", "absolute fixture imports", ...(name === "assistant-browser" ? ["accepted corrupt-row preservation with distinct healthy-chat write"] : [])], assertionsRemoved: 0, assertionsReplaced: name === "assistant-browser" ? 2 : 0, log, exitCode: result.status });
  console.log(`PASS ${name}`);
}

const protectedFamilies = ["AGENTS.md", "docs", "project/project_structure.txt", "package.json", "package-lock.json", "app", "src/lib/animation", "src/lib/ai", "src/lib/openai", "src/lib/export", "src/lib/project-library", "src/lib/project-player", "src/components/workspace", "src/components/export", "src/components/recovery", "src/components/project-library", "src/components/project-player", "src/components/open-project", "src/components/tutorials", "src/components/chrome"];
const protectedDiff = execFileSync("git", ["diff", "--name-only", base, "--", ...protectedFamilies], { encoding: "utf8" }).trim().split("\n").filter(Boolean);
assert.deepEqual(protectedDiff, []);
writeFileSync(resolve(output, "result.json"), `${JSON.stringify({ status: "PASS", origin, receipts, protectedFamilies, protectedDiff, realProviderCalls: 0, paidCalls: 0, historicalSourcesChanged: false }, null, 2)}\n`);
console.log(JSON.stringify({ status: "PASS", browserSuites: receipts.length, protectedDiff }));
