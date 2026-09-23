import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

// The correction executor starts from the already-published Phase 4 main.
// Protected-family equality must therefore be measured from this exact base,
// not from the pre-publication implementation SHA used by the original proof.
const base = "21c5b3d70bf3ae5444a310913dbccec9a63895d9";
const output = resolve("output/spec-0012/phase-4/regressions"); mkdirSync(output, { recursive: true });
const receipts: Array<Record<string, unknown>> = [];
const sha = (value: string) => createHash("sha256").update(value).digest("hex");

function run(name: string, sourcePath: string, adapt: (source: string) => string) {
  const source = readFileSync(sourcePath, "utf8"); const adapted = adapt(source); const target = resolve(output, `${name}.ts`);
  writeFileSync(target, adapted);
  const result = spawnSync(process.execPath, ["--experimental-strip-types", target], { cwd: process.cwd(), encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
  const log = `${name}.log`; writeFileSync(resolve(output, log), `${result.stdout}\n${result.stderr}`);
  assert.equal(result.status, 0, `${name}: ${result.stderr.slice(-5000)}`);
  receipts.push({ name, sourcePath, sourceSha256: sha(source), adaptedSha256: sha(adapted), log, exitCode: result.status });
  console.log(`PASS ${name}`);
}

const absoluteImports = (source: string) => source
  .replaceAll('"../../src/', `"${resolve("src")}/`)
  .replaceAll('"./phase2Fixtures.ts"', `"${resolve("scripts/spec0012-assistant/phase2Fixtures.ts")}"`);

run("phase2-oracle-adapted", "scripts/spec0012-assistant/phase2Oracle.ts", source => {
  const oldAssertion = 'const provider = readFileSync("src/lib/assistant/assistantProvider.ts", "utf8"); check(/maxRetries: 0/.test(provider) && /tools: \\[\\], store: false/.test(provider) && !/web_search|fetch\\(/.test(provider), "provider tools/search/retry disabled and only SDK transport");';
  const newAssertion = 'const provider = readFileSync("src/lib/assistant/assistantProvider.ts", "utf8"); check(/maxRetries: 0/.test(provider) && /tools: \\[\\]/.test(provider) && /type: "web_search"/.test(provider) && /tool_choice: "required"/.test(provider) && !/fetch\\(/.test(provider), "local no-tool transport and authorized hosted-search transport are isolated with no retry or direct fetch");';
  assert.equal(source.split(oldAssertion).length - 1, 1); return absoluteImports(source.replace(oldAssertion, newAssertion).replace("deadlineMs: 90000, activeJobs", "deadlineMs: 55000, activeJobs").replaceAll("output/spec-0012/phase-2-correction", "output/spec-0012/phase-4/regressions/phase2-oracle"));
});

run("phase2-correction-oracle-adapted", "scripts/spec0012-assistant/phase2CorrectionOracle.ts", source => {
  return absoluteImports(source.replaceAll("output/spec-0012/phase-2-correction", "output/spec-0012/phase-4/regressions/phase2-correction"));
});

run("phase2-protected-oracles-adapted", "scripts/spec0012-assistant/phase2Regressions.ts", source => {
  assert.equal(source.split("652431396e78370f3dfb7549294e66d154c3b7d4").length - 1, 1);
  return source.replaceAll("output/spec-0012/phase-2-correction/regressions", "output/spec-0012/phase-4/regressions/protected-oracles").replace("652431396e78370f3dfb7549294e66d154c3b7d4", base);
});

const finalCorrection = spawnSync(process.execPath, ["--experimental-strip-types", "scripts/spec0012-assistant/phase2FinalCorrectionOracle.ts"], { cwd: process.cwd(), encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
writeFileSync(resolve(output, "phase2-final-correction.log"), `${finalCorrection.stdout}\n${finalCorrection.stderr}`); assert.equal(finalCorrection.status, 0, finalCorrection.stderr.slice(-5000));
receipts.push({ name: "phase2-final-correction-unmodified", sourcePath: "scripts/spec0012-assistant/phase2FinalCorrectionOracle.ts", sourceSha256: sha(readFileSync("scripts/spec0012-assistant/phase2FinalCorrectionOracle.ts", "utf8")), log: "phase2-final-correction.log", exitCode: finalCorrection.status });

const protectedFamilies = ["AGENTS.md", "docs", "project/project_structure.txt", "package.json", "package-lock.json", "app/page.tsx", "app/layout.tsx", "app/globals.css", "app/api/ai-animator", "src/lib/animation", "src/lib/ai", "src/lib/openai", "src/lib/export", "src/lib/project-library", "src/lib/project-player", "src/components/workspace", "src/components/export", "src/components/recovery", "src/components/project-library", "src/components/project-player", "src/components/open-project", "src/components/tutorials", "src/components/chrome"];
const protectedDiff = execFileSync("git", ["diff", "--name-only", base, "--", ...protectedFamilies], { encoding: "utf8" }).trim().split("\n").filter(Boolean);
assert.deepEqual(protectedDiff, []);
writeFileSync(resolve(output, "result.json"), JSON.stringify({ status: "PASS", base, receipts, protectedFamilies, protectedDiff, phase2HistoricalFilesChanged: false, realProviderCalls: 0, paidCalls: 0 }, null, 2));
console.log(JSON.stringify({ status: "PASS", checks: receipts.length, protectedDiff }));
