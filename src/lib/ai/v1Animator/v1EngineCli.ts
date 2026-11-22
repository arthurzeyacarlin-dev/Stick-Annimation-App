import { existsSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import type { V1Progress, V1Stage, V1StageCode } from "./v1AnimatorContract.ts";
import { readSonnetBrain, v1Brain, type V1Brain } from "./v1LunaBook.ts";

// THE PASSED ENGINE CLI (board/v1-single/CONTRACT_SAME_ENGINE.md "Engine CLI"; ltx-effects/v1k/passed_engine.py, helper T1):
//   <python> <passed_engine.py> <plan.json> --out-dir <D> [--prev <D_prev>] [--cache-only]
//     stdout: `STAGE <code> <words>` + `PROGRESS <pct> <eta_s>` ... last line `RESULT <D>/report.json`;
//     `ERROR <plain words>` exit 2 (the director could not plan / budget used up / not cached in cache-only / not V1).
// Edits are applied to the plan in TypeScript (v1AnimatorCore.ts applyV1Ops): no edit script.
// Every path is env-overridable (dev / tests); nothing here reads a key file. Pure: no "server-only", so node --test runs it.
//   DIAMOND_ENGINE_ROOT          the engine folder (holds ltx-effects/)
//   DIAMOND_V1_PYTHON            default <root>/ltx-effects/video-ai-check/.venv/bin/python
//   DIAMOND_V1_ENGINE_SCRIPT     default <root>/ltx-effects/v1k/passed_engine.py
//   DIAMOND_V1_OUT_DIR           default <root>/ltx-effects/out/app-v1   (<projectId>/<animationId>/v<n>/ under it)
//   DIAMOND_V1_LUNA_BOOK         default <root>/ltx-effects/v1k/luna-book.json
//   DIAMOND_V1_ENGINE_BOOK       default <root>/ltx-effects/v1k/passed_engine_book.json (stage words, looks)
//   DIAMOND_V1_JOB_TIMEOUT_MS    default 20 minutes
//   DIAMOND_ENGINE_ALLOW_KIMODO=1  new (paid) director plans + Kimodo takes allowed; without it every run gets --cache-only ($0)
//   DIAMOND_V1_BRAIN=sonnet      the chat brain is Sonnet (default luna); the director then uses the SAME model (book brains.sonnet.model)

export type V1EngineConfig = {
  root: string;
  python: string;
  engineScript: string;
  outDir: string;
  lunaBook: string;
  engineBook: string;
  cacheOnly: boolean;
  timeoutMs: number;
  brain: V1Brain;
  directorModel: string | null; // set only when the brain is sonnet (book brains.sonnet.model / env DIAMOND_V1_SONNET_MODEL)
};

type Env = Record<string, string | undefined>;
const pick = (env: Env, key: string, fallback: string) => {
  const value = env[key]?.trim();
  return value ? value : fallback;
};

// null = no engine root on this computer (the server says so honestly; nothing is spawned)
export function v1EngineConfig(env: Env = process.env): V1EngineConfig | null {
  const root = env.DIAMOND_ENGINE_ROOT?.trim();
  if (!root || !existsSync(join(root, "ltx-effects"))) return null;
  const lx = join(root, "ltx-effects");
  const timeout = Number(env.DIAMOND_V1_JOB_TIMEOUT_MS);
  const lunaBook = pick(env, "DIAMOND_V1_LUNA_BOOK", join(lx, "v1k", "luna-book.json"));
  const brain = v1Brain(env);
  return {
    root,
    python: pick(env, "DIAMOND_V1_PYTHON", join(lx, "video-ai-check", ".venv", "bin", "python")),
    engineScript: pick(env, "DIAMOND_V1_ENGINE_SCRIPT", join(lx, "v1k", "passed_engine.py")),
    outDir: pick(env, "DIAMOND_V1_OUT_DIR", join(lx, "out", "app-v1")),
    lunaBook,
    engineBook: pick(env, "DIAMOND_V1_ENGINE_BOOK", join(lx, "v1k", "passed_engine_book.json")),
    cacheOnly: env.DIAMOND_ENGINE_ALLOW_KIMODO !== "1",
    timeoutMs: Number.isFinite(timeout) && timeout > 0 ? timeout : 20 * 60 * 1000,
    brain, directorModel: brain === "sonnet" ? readSonnetBrain(lunaBook, root, env).model : null,
  };
}

// directorDir = the app's Luna director plans (v1LunaDirector.ts) -> passed_engine.py --director-dir
export const engineArgs = (config: V1EngineConfig, planPath: string, outDir: string, prevDir: string | null, directorDir: string | null = null) => [
  config.engineScript, planPath, "--out-dir", outDir, ...(prevDir ? ["--prev", prevDir] : []), ...(config.cacheOnly ? ["--cache-only"] : []),
  ...(directorDir ? ["--director-dir", directorDir] : []),
];

// The engine gets a small clean environment. Only when new (paid) work is allowed does it get the names the PASSED pipeline itself
// reads from the environment (the director's key + its money caps + Modal's token): never a key file, never the app's other keys.
export const ENGINE_PAID_ENV = ["ANTHROPIC_API_KEY", "DIRECTOR_CAP_USD", "CLAUDE_TEST_BUDGET_USD", "DIRECTOR_MODEL", "DIRECTOR_LISTEN", "MODAL_TOKEN_ID", "MODAL_TOKEN_SECRET"] as const;
export const engineEnv = (config: V1EngineConfig, env: Env = process.env): Env => ({
  PATH: env.PATH, HOME: env.HOME, USER: env.USER, LANG: env.LANG ?? "en_US.UTF-8", TMPDIR: env.TMPDIR,
  ...(config.cacheOnly ? { CACHE_ONLY: "1" } : {
    ...Object.fromEntries(ENGINE_PAID_ENV.filter((k) => env[k]).map((k) => [k, env[k]])),
    // the Sonnet brain: the director plans with the same model (only for new paid plans; cache-only keeps the cached plans' model)
    ...(config.directorModel ? { DIRECTOR_MODEL: config.directorModel } : {}),
  }),
});

// ---- stdout lines. The stage codes are the contract's V1StageCode (a compile-checked mirror, not a word list).
const STAGE_CODES: Record<V1StageCode, true> = { thinking: true, planning: true, animating: true, checking: true, joining: true, drawing: true, placing: true };
export const isV1StageCode = (code: string): code is V1StageCode => Object.prototype.hasOwnProperty.call(STAGE_CODES, code);

export type V1EngineLine =
  | { type: "stage"; stage: V1Stage }
  | { type: "progress"; progress: V1Progress }
  | { type: "result"; path: string }
  | { type: "error"; words: string } // exit 2: plain words for the user (nothing new made)
  | { type: "failed"; words: string }; // (an older engine's exit 1 line; kept so its words still reach the user)

export function parseEngineLine(raw: string): V1EngineLine | null {
  const line = raw.replace(/\r$/, "").trim();
  const stage = /^STAGE\s+([a-z_]+)(?:\s+(\d+)\/(\d+))?(?:\s+(.*))?$/.exec(line);
  if (stage) {
    if (!isV1StageCode(stage[1])) return null;
    const out: V1Stage = { code: stage[1], words: (stage[4] ?? "").trim() };
    if (stage[2] !== undefined && stage[3] !== undefined) { out.i = Number(stage[2]); out.n = Number(stage[3]); }
    return { type: "stage", stage: out };
  }
  const progress = /^PROGRESS\s+(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)$/.exec(line);
  if (progress) return { type: "progress", progress: { pct: Math.min(100, Math.max(0, Number(progress[1]))), etaS: Math.max(0, Number(progress[2])) } };
  const result = /^RESULT\s+(.+)$/.exec(line);
  if (result) return { type: "result", path: result[1].trim() };
  const error = /^ERROR\s+(.+)$/.exec(line);
  if (error) return { type: "error", words: error[1].trim() };
  const failed = /^FAILED\s+(.+)$/.exec(line);
  if (failed) return { type: "failed", words: failed[1].trim() };
  return null;
}

// Chunks -> whole lines (a line may arrive split over two chunks).
export function lineSplitter(onLine: (line: string) => void) {
  let rest = "";
  return {
    push(chunk: string) {
      rest += chunk;
      const lines = rest.split("\n");
      rest = lines.pop() ?? "";
      for (const line of lines) onLine(line);
    },
    end() { if (rest) { onLine(rest); rest = ""; } },
  };
}

// A path the engine printed: absolute, or relative to the version folder, the engine folder or the root.
export function resolveEnginePath(config: V1EngineConfig, versionDir: string, path: string): string {
  if (isAbsolute(path)) return path;
  return [join(versionDir, path), join(config.root, "ltx-effects", path), join(config.root, path)].find((candidate) => existsSync(candidate)) ?? join(versionDir, path);
}
