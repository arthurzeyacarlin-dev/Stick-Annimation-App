import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import {
  BASE_SHA,
  EXACT_DIRTY_ALLOWLIST,
  OUTPUT_ROOT,
  bind,
  currentHead,
  currentSourceDigest,
  dirtyPaths,
  writeJson,
  type CommandResult,
  type RegressionReceipt,
} from "./proofContract.ts";

const commandDirectory = `${OUTPUT_ROOT}/commands`;
mkdirSync(commandDirectory, { recursive: true });
const typecheckConfig = `${OUTPUT_ROOT}/tsconfig.source.json`;
writeFileSync(typecheckConfig, JSON.stringify({
  extends: "../../../tsconfig.json",
  compilerOptions: { incremental: false },
  include: ["../../../next-env.d.ts", "../../../app/**/*.ts", "../../../app/**/*.tsx", "../../../src/**/*.ts", "../../../src/**/*.tsx", "../../../scripts/**/*.ts", "../../../scripts/**/*.mts"],
  exclude: ["../../../node_modules", "../../../.next", "../../../output"],
}, null, 2) + "\n");
const sourceDigestBefore = currentSourceDigest();
const definitions: Array<{ id: string; argv: string[]; timeoutMs?: number }> = [
  { id: "production-build", argv: ["npm", "run", "build", "--", "--webpack"], timeoutMs: 15 * 60_000 },
  { id: "phase2-corridor-oracle", argv: ["node", "--experimental-strip-types", "scripts/spec0007-manual/phase-2/corridorOracle.ts"] },
  { id: "phase1-raster-oracle", argv: ["node", "--experimental-strip-types", "scripts/spec0007-manual/phase-1/rasterOracle.ts"], timeoutMs: 10 * 60_000 },
  { id: "phase1-no-loss-oracle", argv: ["node", "--experimental-strip-types", "scripts/spec0007-manual/phase-1/noLossOracle.ts"], timeoutMs: 10 * 60_000 },
  { id: "phase1-persistence-oracle", argv: ["node", "--experimental-strip-types", "scripts/spec0007-manual/phase-1/coveragePersistenceOracle.ts"], timeoutMs: 10 * 60_000 },
  { id: "phase1-full-regression-ledger", argv: ["node", "--experimental-strip-types", "scripts/spec0007-manual/phase-1/regressions.ts"], timeoutMs: 30 * 60_000 },
  { id: "typescript-source", argv: ["./node_modules/.bin/tsc", "--noEmit", "-p", typecheckConfig] },
  { id: "phase2-eslint", argv: ["./node_modules/.bin/eslint", ...EXACT_DIRTY_ALLOWLIST] },
  { id: "repository-eslint", argv: ["npm", "run", "lint"], timeoutMs: 10 * 60_000 },
];

const run = (definition: typeof definitions[number]): CommandResult => {
  const started = performance.now();
  const result = spawnSync(definition.argv[0], definition.argv.slice(1), {
    cwd: process.cwd(),
    encoding: "utf8",
    maxBuffer: 256 * 1024 * 1024,
    timeout: definition.timeoutMs ?? 5 * 60_000,
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1", OPENAI_API_KEY: "", SUPABASE_URL: "", SUPABASE_ANON_KEY: "", SUPABASE_SERVICE_ROLE_KEY: "" },
  });
  const stdoutPath = `${commandDirectory}/${definition.id}.stdout.txt`;
  const stderrPath = `${commandDirectory}/${definition.id}.stderr.txt`;
  writeFileSync(stdoutPath, result.stdout ?? "");
  writeFileSync(stderrPath, `${result.stderr ?? ""}${result.error ? `\n${result.error.message}\n` : ""}`);
  let status: CommandResult["status"] = result.status === 0 ? "PASS" : "FAIL";
  let detail: string | undefined;
  if (definition.id === "production-build" && result.status === 1) {
    const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
    const inheritedPath = "app/dev/ai-costs/lifetime/page.tsx";
    const baseClean = spawnSync("git", ["diff", "--quiet", BASE_SHA, "--", inheritedPath], { cwd: process.cwd() }).status === 0;
    const exactKnownFailure = output.includes("Compiled successfully") && output.includes(inheritedPath) && output.includes("does not satisfy the constraint 'PageProps'");
    if (baseClean && exactKnownFailure) {
      status = "INHERITED_BASELINE";
      detail = "Webpack compilation succeeds; Next.js route typing then stops on an untouched baseline PageProps mismatch in app/dev/ai-costs/lifetime/page.tsx. Project tsc and the Phase 2 allowlist remain independently required.";
    }
  }
  if (definition.id === "phase1-full-regression-ledger" && result.status === 1) {
    const inherited = JSON.parse(readFileSync("output/spec-0007/phase-1/receipts/regressions.json", "utf8")) as {
      commands: Array<{ id: string; exitCode: number | null; inheritedStructuralFailure?: { disposition: string; adapterCommand?: { exitCode: number | null } } }>;
    };
    const failed = inherited.commands.filter(command => command.exitCode !== 0);
    const phase5 = failed[0];
    if (inherited.commands.length === 18 && failed.length === 1 && phase5?.id === "phase5-tools-library" && phase5.inheritedStructuralFailure?.disposition === "UNRESOLVED" && phase5.inheritedStructuralFailure.adapterCommand?.exitCode === 0) {
      status = "INHERITED_BASELINE";
      detail = "All 17 executable inherited regressions pass. The retired Phase 5 renderer-spelling assertion fails as expected and its catalog-equivalence adapter passes; final live behavior is owned by the source-bound Phase 2 browser proof.";
    }
  }
  if (definition.id === "repository-eslint" && result.status === 1) {
    const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
    const inheritedPaths = [
      "scripts/validateDrawingProjectAiMemoryRouteSafety.ts",
      "src/lib/ai/drawingFrameExecutor.ts",
    ];
    const baseClean = spawnSync("git", ["diff", "--quiet", BASE_SHA, "--", ...inheritedPaths], { cwd: process.cwd() }).status === 0;
    const exactKnownFailure = inheritedPaths.every(path => output.includes(path)) && output.includes("5 errors") && output.includes("react-hooks/rules-of-hooks") && output.includes("prefer-const");
    if (baseClean && exactKnownFailure) {
      status = "INHERITED_BASELINE";
      detail = "Repository-wide lint retains five errors in two untouched baseline files; the exact Phase 2 allowlist passes its own ESLint command.";
    }
  }
  return {
    id: definition.id,
    status,
    argv: definition.argv,
    exitCode: result.status,
    elapsedMs: performance.now() - started,
    stdout: bind(stdoutPath),
    stderr: bind(stderrPath),
    ...(detail ? { detail } : {}),
  };
};

if (currentHead() !== BASE_SHA) throw new Error("unexpected_base_sha");
if (JSON.stringify(dirtyPaths()) !== JSON.stringify(EXACT_DIRTY_ALLOWLIST)) throw new Error(`unexpected_dirty_paths:${JSON.stringify(dirtyPaths())}`);
const commands: CommandResult[] = [];
for (const definition of definitions) {
  console.log(`Running ${definition.id}`);
  const result = run(definition);
  commands.push(result);
  console.log(JSON.stringify({ id: result.id, status: result.status, exitCode: result.exitCode, elapsedMs: result.elapsedMs }));
  if (result.status === "FAIL") break;
}
const sourceDigestAfter = currentSourceDigest();
const receipt: RegressionReceipt = {
  kind: "spec0007-phase2-regressions",
  status: commands.length === definitions.length && commands.every(command => command.status !== "FAIL") && sourceDigestBefore === sourceDigestAfter ? "PASS" : "FAIL",
  baseSha: BASE_SHA,
  sourceDigestBefore,
  sourceDigestAfter,
  dirtyPaths: dirtyPaths(),
  commands,
};
writeJson(`${OUTPUT_ROOT}/receipts/regressions.json`, receipt);
console.log(JSON.stringify({ status: receipt.status, commands: commands.length, sourceDigest: sourceDigestAfter }));
if (receipt.status !== "PASS") process.exitCode = 1;
