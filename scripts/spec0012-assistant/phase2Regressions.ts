import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript";

const output = resolve("output/spec-0012/phase-2-correction/regressions"); mkdirSync(output, { recursive: true });
const paths = [
  "scripts/spec0008-ai-animator/validatePhase1Contract.ts",
  "scripts/spec0011-project-library/phase1Oracle.ts", "scripts/spec0011-project-library/phase2Oracle.ts", "scripts/spec0011-project-library/phase2AudioOracle.ts", "scripts/spec0011-project-library/phase3Oracle.ts",
  "scripts/spec0009-export/phase1Oracle.ts", "scripts/spec0009-export/phase2Oracle.ts", "scripts/spec0009-export/phase3Oracle.ts",
  "scripts/spec0010-project-safety/phase1Contract.ts", "scripts/spec0010-project-safety/phase2Contract.ts", "scripts/spec0010-project-safety/phase3Contract.ts", "scripts/spec0010-project-safety/phase3Oracle.ts",
  "scripts/spec0007-manual/phase-5/staticOracle.ts",
];
const receipts = [];
for (let index = 0; index < paths.length; index++) {
  const path = paths[index]; let runnable = path;
  if (path === "scripts/spec0009-export/phase3Oracle.ts") {
    const original = readFileSync(path, "utf8");
    const before = '["diff", "--name-only"]';
    assert.equal(original.split(before).length - 1, 1);
    // Rebind only the historical dirty-state projection. All 354 product assertions remain intact;
    // current-phase protected-family byte equality is checked independently below.
    const adapted = original.replace(before, '["diff", "--name-only", "HEAD", "--", "src/lib/export", "src/components/export/AnimationExportFlow.tsx", "scripts/spec0009-export"]').replaceAll('"../../src/', `"${resolve("src")}/`);
    runnable = resolve(output, "export-phase3-adapted.ts"); writeFileSync(runnable, adapted);
    writeFileSync(resolve(output, "export-adapter-binding.json"), JSON.stringify({ source: path, originalSha256: createHash("sha256").update(original).digest("hex"), adaptedSha256: createHash("sha256").update(adapted).digest("hex"), assertionsRemoved: 0, adaptation: "historical dirty-path projection only; imports resolved from original root" }, null, 2));
  }
  const result = spawnSync(process.execPath, ["--experimental-strip-types", runnable], { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
  const log = `${index.toString().padStart(2, "0")}.log`; writeFileSync(resolve(output, log), `${result.stdout}\n${result.stderr}`);
  assert.equal(result.status, 0, `${path}: ${result.stderr.slice(-3000)}`); receipts.push({ path, log, exitCode: result.status }); console.log(`PASS ${path}`);
}
const protectedFamilies = ["AGENTS.md", "docs", "project/project_structure.txt", "package.json", "package-lock.json", "app/page.tsx", "app/layout.tsx", "app/globals.css", "app/api/ai-animator", "src/lib/animation", "src/lib/ai", "src/lib/openai", "src/lib/export", "src/lib/project-library", "src/lib/project-player", "src/components/workspace", "src/components/export", "src/components/recovery", "src/components/project-library", "src/components/project-player", "src/components/open-project", "src/components/tutorials", "src/components/chrome"];
assert.equal(execFileSync("git", ["diff", "--name-only", "652431396e78370f3dfb7549294e66d154c3b7d4", "--", ...protectedFamilies], { encoding: "utf8" }).trim(), "");
if (process.argv.includes("--historical-browser")) {
  const original = readFileSync("scripts/spec0012-assistant/phase1AnimatorRegression.ts", "utf8");
  const adapted = original.replaceAll("output/spec-0012/phase-1-correction/animator", "output/spec-0012/phase-2-correction/animator").replaceAll("http://127.0.0.1:57950/", "http://127.0.0.1:57970/");
  const js = ts.transpileModule(adapted, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText;
  const generated = resolve(output, "animator-adapter.mjs"); writeFileSync(generated, js);
  const result = spawnSync(process.execPath, [generated], { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 }); writeFileSync(resolve(output, "animator.log"), `${result.stdout}\n${result.stderr}`);
  assert.equal(result.status, 0, result.stderr.slice(-5000)); receipts.push({ path: "scripts/spec0012-assistant/phase1AnimatorRegression.ts", log: "animator.log", exitCode: result.status });
  writeFileSync(resolve(output, "animator-adapter-binding.json"), JSON.stringify({ originalSha256: createHash("sha256").update(original).digest("hex"), adaptedSha256: createHash("sha256").update(js).digest("hex"), changes: ["output directory", "local port"], assertionsRemoved: 0 }, null, 2));
}
writeFileSync(resolve(output, "result.json"), JSON.stringify({ status: "PASS", scope: "13 protected technical oracles plus exact protected-family diff", receipts, protectedFamilies, protectedDiff: [], realProviderCalls: 0, historicalBrowserLimitation: "Full untouched Animator timing suite failed to observe the transient revealing state at 30s and 90s. Focused deterministic Animator real-browser smoke is recorded separately; full historical timing coverage is not claimed." }, null, 2));
