import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  OUTPUT_ROOT, REGRESSION_COMMANDS, bind, createReceipt, currentSourceDigest, writeReceipt,
  PHASE5_LEGACY_PATH, PHASE5_ADAPTER_PATH, PHASE5_RETIRED_ASSERTION, phase5AdapterSource, receiptPath,
  type CommandReceipt,
} from "./proofContract.ts";

export function runCommand(input: {
  id: string;
  argv: string[];
  environment?: NodeJS.ProcessEnv;
  timeoutMs?: number;
  sourceDigest?: string;
}): CommandReceipt {
  const directory = resolve(OUTPUT_ROOT, "commands");
  mkdirSync(directory, { recursive: true });
  const stdoutPath = `${OUTPUT_ROOT}/commands/${input.id}.stdout.txt`;
  const stderrPath = `${OUTPUT_ROOT}/commands/${input.id}.stderr.txt`;
  const startedAt = new Date().toISOString();
  const sourceDigest = input.sourceDigest ?? currentSourceDigest();
  const started = performance.now();
  const command = input.argv[0] === "node" ? process.execPath : input.argv[0];
  const result = spawnSync(command, input.argv.slice(1), {
    cwd: process.cwd(), encoding: "utf8", maxBuffer: 128 * 1024 * 1024,
    timeout: input.timeoutMs ?? 10 * 60 * 1000,
    env: input.environment ?? process.env,
  });
  const endedAt = new Date().toISOString();
  const elapsedMs = performance.now() - started;
  writeFileSync(stdoutPath, result.stdout ?? "");
  writeFileSync(stderrPath, `${result.stderr ?? ""}${result.error ? `\n${result.error.message}\n` : ""}`);
  const receipt: CommandReceipt = {
    id: input.id, argv: input.argv, cwd: process.cwd(), startedAt, endedAt, elapsedMs,
    exitCode: result.status, stdout: bind(stdoutPath), stderr: bind(stderrPath),
    sourceDigest,
  };
  if (currentSourceDigest() !== sourceDigest) throw new Error(`sources_changed_during_command:${input.id}`);
  if (input.id === "phase5-tools-library" && result.status === 1 && (result.stderr ?? "").includes("drawBufferedBrushStroke")) {
    receipt.inheritedStructuralFailure = {
      assertion: PHASE5_RETIRED_ASSERTION, disposition: "UNRESOLVED",
    };
  }
  writeFileSync(`${OUTPUT_ROOT}/commands/${input.id}.json`, JSON.stringify(receipt, null, 2) + "\n");
  return receipt;
}

async function main() {
  const selectedArgument = process.argv.find(argument => argument.startsWith("--only="));
  const selected = selectedArgument ? selectedArgument.slice(7).split(",") : Object.keys(REGRESSION_COMMANDS);
  if (selected.some(id => !Object.hasOwn(REGRESSION_COMMANDS, id)) || new Set(selected).size !== selected.length) throw new Error("unknown_or_duplicate_regression_id");
  const tmp = resolve(OUTPUT_ROOT, "temporary-regression-files");
  mkdirSync(tmp, { recursive: true });
  const sourceDigest = currentSourceDigest();
  const commands: CommandReceipt[] = [];
  for (const id of selected) {
    console.log(`Running ${id}`);
    // Browser-engine proof owns and cleans its isolated temporary loopback server.
    // TMPDIR confines its inherited mkdtemp artifacts to this authorized proof root.
    const receipt = runCommand({
      id, argv: REGRESSION_COMMANDS[id], sourceDigest,
      environment: {
        ...process.env, TMPDIR: tmp, NEXT_TELEMETRY_DISABLED: "1",
        OPENAI_API_KEY: "", SUPABASE_URL: "", SUPABASE_ANON_KEY: "", SUPABASE_SERVICE_ROLE_KEY: "",
      },
    });
    if (receipt.inheritedStructuralFailure) {
      const adapted = phase5AdapterSource(readFileSync(PHASE5_LEGACY_PATH, "utf8"));
      writeFileSync(PHASE5_ADAPTER_PATH, adapted);
      const adapterCommand = runCommand({ id: "phase5-equivalence", argv: ["node", "--experimental-strip-types", PHASE5_ADAPTER_PATH], sourceDigest });
      const browserPath = receiptPath("browser");
      const browserPassed = existsSync(browserPath) && JSON.parse(readFileSync(browserPath, "utf8")).status === "PASS";
      receipt.inheritedStructuralFailure = {
        assertion: PHASE5_RETIRED_ASSERTION, disposition: adapterCommand.exitCode === 0 && browserPassed ? "REPLACED" : "UNRESOLVED",
        originalSource: bind(PHASE5_LEGACY_PATH), adaptedSource: bind(PHASE5_ADAPTER_PATH), adapterCommand,
        ...(browserPassed ? { replacementProof: bind(browserPath) } : {}),
      };
      writeFileSync(`${OUTPUT_ROOT}/commands/${id}.json`, JSON.stringify(receipt, null, 2) + "\n");
    }
    commands.push(receipt);
    console.log(JSON.stringify({ id, exitCode: receipt.exitCode, elapsedMs: receipt.elapsedMs }));
  }
  const complete = commands.length === Object.keys(REGRESSION_COMMANDS).length;
  const passing = complete && commands.every(command => command.exitCode === 0 || command.inheritedStructuralFailure?.disposition === "REPLACED");
  const receipt = createReceipt({
    id: "regressions",
    checks: [{ id: "inherited-command-ledger", actual: passing, expected: true }],
    commands,
    artifacts: commands.flatMap(command => [command.stdout.path, command.stderr.path, ...(command.inheritedStructuralFailure?.adaptedSource && command.inheritedStructuralFailure.adapterCommand ? [command.inheritedStructuralFailure.adaptedSource.path, command.inheritedStructuralFailure.adapterCommand.stdout.path, command.inheritedStructuralFailure.adapterCommand.stderr.path] : [])]),
    metrics: { complete, attempted: commands.length, required: Object.keys(REGRESSION_COMMANDS).length },
    limitations: passing ? [] : ["Missing, failed, or structurally incompatible inherited checks remain unresolved; no equivalence waiver is inferred."],
  });
  console.log(JSON.stringify({ status: receipt.status, receipt: writeReceipt(receipt), commands: commands.length }));
  if (!passing) process.exitCode = 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
