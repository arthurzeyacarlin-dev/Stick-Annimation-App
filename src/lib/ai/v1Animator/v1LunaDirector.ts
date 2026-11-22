import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, join } from "node:path";
import type { V1KimodoStep, V1Plan } from "./v1AnimatorContract.ts";
import { LunaBookError, serverWord, type LunaBook } from "./v1LunaBook.ts";

// LUNA = THE ANIMATION DIRECTOR (Nov 2). New block plans need no Claude budget: for every block the engine will make NEW (its
// sentence + seed_bump are not in the --prev report), the app:
//   1. asks ltx-effects/director/luna-director.mjs `question "<sentence>" --engine-director` (book director.script_flags) -> { system,
//      user, schema }: the passed engine's own director question (director.mjs buildQuestion: figures from the sentence)
//   2. asks Luna (the app's OpenAI connection, injected as `ask`) for one JSON object of that schema (made OpenAI-strict here)
//   3. runs `check "<sentence>" <answer.json> --engine-director` (director.mjs's own validatePlan); NOT ok -> re-asks ONCE with its errors
//   4. saves { sentence, plan, check } as <dir>/<n>.director.json; passed_engine.py --director-dir reads it (like --seed-director)
// An identical sentence reuses its saved plan from the cache folder ($0). With --cache-only (no new paid work) Luna is never asked:
// a cache miss is left to the engine's own director cache. Switch + numbers + words: luna-book.json key `director` (env
// DIAMOND_V1_DIRECTOR=luna|claude overrides its default). Pure: node --test runs it with a fake tool + a fake Luna ($0).

export type V1Director = "luna" | "claude";
export type DirectorBook = {
  default: V1Director; script: string; scriptFlags: string[]; scriptEnv: Record<string, string>; cacheFolder: string; maxOutputTokens: number; reasoningEffort: "low" | "medium" | "high";
  retries: number; deadlineMs: number; retryWords: string;
};
type Json = Record<string, unknown>;
type Env = Record<string, string | undefined>;
const isRecord = (v: unknown): v is Json => typeof v === "object" && v !== null && !Array.isArray(v);
const need = <T>(v: T | undefined | null, key: string): T => {
  if (v === undefined || v === null || (typeof v === "string" && !v.trim())) throw new LunaBookError(`book key missing: director.${key}`);
  return v;
};
const whole = (v: unknown, key: string) => {
  const n = Number(need(v, key));
  if (!Number.isSafeInteger(n) || n < 0) throw new LunaBookError(`book key director.${key} is not a whole number`);
  return n;
};
const asDirector = (v: unknown): V1Director | null => (v === "luna" || v === "claude" ? v : null);

export function readDirectorBook(lunaBookPath: string): DirectorBook {
  const d = (JSON.parse(readFileSync(lunaBookPath, "utf8")) as Json).director;
  if (!isRecord(d)) throw new LunaBookError("book key missing: director");
  const effort = need(d.reasoning_effort as string, "reasoning_effort");
  if (!["low", "medium", "high"].includes(effort)) throw new LunaBookError("book key director.reasoning_effort is not low / medium / high");
  return {
    default: need(asDirector(d.default), "default (luna or claude)"),
    script: need(d.script as string, "script"),
    scriptFlags: Array.isArray(d.script_flags) && d.script_flags.every((f) => typeof f === "string") ? (d.script_flags as string[]) : need<string[]>(null, "script_flags (a list of words)"),
    // (Nov 4 PM12) the planner's settings come from the book only (the clean environment below drops the server's)
    scriptEnv: isRecord(d.script_env) && Object.values(d.script_env).every((v) => typeof v === "string") ? (d.script_env as Record<string, string>) : need<Record<string, string>>(null, "script_env (names -> words)"),
    cacheFolder: need(d.cache_folder as string, "cache_folder"),
    maxOutputTokens: whole(d.max_output_tokens, "max_output_tokens"),
    reasoningEffort: effort as DirectorBook["reasoningEffort"],
    retries: whole(d.retries, "retries"),
    deadlineMs: whole(d.deadline_ms, "deadline_ms"),
    retryWords: need(d.retry_words as string, "retry_words"),
  };
}
// env DIAMOND_V1_DIRECTOR=luna|claude wins; anything else -> the book's default (luna)
export const v1Director = (book: DirectorBook, env: Env = process.env): V1Director =>
  asDirector(env.DIAMOND_V1_DIRECTOR?.trim().toLowerCase()) ?? book.default;

// ---- OpenAI strict structured output: every property required (optional ones become nullable), no minItems/maxItems.
// The nulls Luna writes for "not said" are removed again before the checker sees the answer (so the books' shapes are unchanged).
export function strictSchema(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(strictSchema);
  if (!isRecord(node)) return node;
  const out: Json = {};
  for (const [k, v] of Object.entries(node)) if (k !== "minItems" && k !== "maxItems") out[k] = k === "properties" ? v : strictSchema(v);
  if (isRecord(node.properties)) {
    const req = new Set(Array.isArray(node.required) ? (node.required as string[]) : []);
    out.properties = Object.fromEntries(Object.entries(node.properties).map(([k, v]) => [k, req.has(k) ? strictSchema(v) : nullable(strictSchema(v))]));
    out.required = Object.keys(node.properties);
    out.additionalProperties = false;
  }
  return out;
}
const nullable = (s: unknown): unknown => {
  if (!isRecord(s)) return s;
  const types = Array.isArray(s.type) ? (s.type as string[]) : typeof s.type === "string" ? [s.type] : null;
  if (!types) return { anyOf: [s, { type: "null" }] };
  if (types.includes("null")) return s;
  return { ...s, type: [...types, "null"], ...(Array.isArray(s.enum) ? { enum: [...s.enum, null] } : {}) };
};
export function dropNulls(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(dropNulls);
  if (!isRecord(v)) return v;
  return Object.fromEntries(Object.entries(v).filter(([, x]) => x !== null).map(([k, x]) => [k, dropNulls(x)]));
}

// ---- the two engine-side steps (luna-director.mjs) and the AI call: injected (the server binds the real ones; tests pass fakes)
export type DirectorQuestion = { system: string; user: string; schema: unknown };
export type DirectorCheck = { ok: boolean; errors: string[]; blocks?: unknown[]; soft?: boolean };   // soft = only style problems (Nov 4 PM12)
export type DirectorTool = { question(sentence: string): Promise<DirectorQuestion>; check(sentence: string, answer: unknown): Promise<DirectorCheck> };
export type DirectorAsk = (q: DirectorQuestion) => Promise<{ ok: true; answer: unknown; costUsd: number | null } | { ok: false; detail: string }>;

const runNode = (script: string, args: string[], cwd: string, timeoutMs: number, bookEnv: Record<string, string>) => new Promise<unknown>((resolve, reject) => {
  // a small clean environment + the book's own planner settings: the script reads the books only (no key, no AI call)
  execFile(process.execPath, [script, ...args], { cwd, timeout: timeoutMs, maxBuffer: 16 * 1024 * 1024, env: { PATH: process.env.PATH, HOME: process.env.HOME, ...bookEnv } as unknown as NodeJS.ProcessEnv, encoding: "utf8" },
    (error: Error | null, stdout: string, stderr: string) => {
      if (error) { reject(new Error(`${String(stderr || error.message).trim().split("\n").at(-1) ?? "the director script failed"}`.slice(0, 300))); return; }
      try { resolve(JSON.parse(stdout)); } catch { reject(new Error("the director script did not answer with JSON")); }
    });
});
export function nodeDirectorTool(engineRoot: string, book: DirectorBook): DirectorTool {
  const script = isAbsolute(book.script) ? book.script : join(engineRoot, book.script);
  const cwd = join(script, "..");
  return {
    question: async (sentence) => runNode(script, ["question", sentence, ...book.scriptFlags], cwd, 60_000, book.scriptEnv) as Promise<DirectorQuestion>,
    check: async (sentence, answer) => {
      const tmp = mkdtempSync(join(tmpdir(), "v1-director-"));
      try {
        const file = join(tmp, "answer.json");
        writeFileSync(file, JSON.stringify(answer));
        return (await runNode(script, ["check", sentence, file, ...book.scriptFlags], cwd, 60_000, book.scriptEnv)) as DirectorCheck;
      } finally { rmSync(tmp, { recursive: true, force: true }); }
    },
  };
}

// ---- which blocks the engine makes NEW: not (sentence, seed_bump) of a block in the --prev report (the engine's own rule)
export function newBlocks(plan: V1Plan, prevDir: string | null): V1Plan["blocks"] {
  let prev: { sentence: string; seedBump: number }[] = [];
  if (prevDir) try {
    const r = JSON.parse(readFileSync(join(prevDir, "report.json"), "utf8")) as Json;
    prev = (Array.isArray(r.blocks) ? r.blocks : []).filter(isRecord)
      .filter((b) => typeof b.id === "string" && existsSync(join(prevDir, "blocks", b.id, "block.json")))
      .map((b) => ({ sentence: String(b.sentence ?? ""), seedBump: Number(b.seedBump ?? 0) }));
  } catch { prev = []; }
  return plan.blocks.filter((b) => !prev.some((p) => p.sentence === b.sentence && p.seedBump === Number(b.seed_bump ?? 0)));
}

export const sentenceKey = (sentence: string) => createHash("sha256").update(sentence.trim()).digest("hex").slice(0, 32);

export type DirectorRun = {
  plan: V1Plan; prevDir: string | null; outDir: string; cacheDir: string; allowNew: boolean;
  book: LunaBook; director: DirectorBook; tool: DirectorTool; ask: DirectorAsk;
};
export type DirectorResult =
  | { ok: true; dir: string; planned: { sentence: string; from: "cache" | "luna" | "engine_cache"; asks: number; costUsd: number }[] }
  | { ok: false; words: string };

// Plans every NEW block (cache, else Luna + check + one retry) -> <outDir>/<i>.director.json. Never throws: failures are plain words.
export async function planWithLuna(run: DirectorRun): Promise<DirectorResult> {
  // (Nov 9, live: an edit of an earlier part failed - "no motion plan from Luna" - when a later, unchanged part had to be made again after it)
  // a part with the AI's own steps gets its plan written too ($0, no AI call: the steps ARE the plan), so any part can always be made
  const todo = [...new Map([...newBlocks(run.plan, run.prevDir), ...run.plan.blocks.filter((b) => b.steps?.length)].map((b) => [b.sentence, b])).values()];
  try { mkdirSync(run.outDir, { recursive: true }); mkdirSync(run.cacheDir, { recursive: true }); } catch { /* the writes below say it */ }
  const planned: Extract<DirectorResult, { ok: true }>["planned"] = [];
  for (const [i, b] of todo.entries()) {
    const target = join(run.outDir, `${String(i + 1).padStart(2, "0")}-${sentenceKey(b.sentence)}.director.json`);
    // (Nov 4 PM12, NO TELEPHONE) the chat AI wrote Kimodo's own steps: no planner, no AI call ($0) - its steps are the plan, exactly as written
    if (b.steps?.length) {
      try { writeFileSync(target, JSON.stringify({ sentence: b.sentence, plan: planFromSteps(b.steps), check: { ok: true, errors: [], not_built: [], notes: [] }, cached: false, via: "steps" }, null, 1)); }
      catch (error) { return { ok: false, words: serverWord(run.book, "director_failed", { words: String(error instanceof Error ? error.message : error).slice(0, 200) }) }; }
      planned.push({ sentence: b.sentence, from: "luna", asks: 0, costUsd: 0 });
      continue;
    }
    const cached = join(run.cacheDir, `${sentenceKey(b.sentence)}.director.json`);
    // (Nov 4) a cached plan is reused only when it was made by the SAME planner question (its system + answer shape): a changed planner (new
    // rules / fields) never gets an old plan back for the same sentence. No question (tool failed) = the cache by sentence, as before.
    let q: DirectorQuestion | null = null;
    try { q = await run.tool.question(b.sentence); } catch { q = null; }
    const qKey = q ? questionKey(q) : null;
    if (sameSentence(cached, b.sentence, qKey)) { copyFileSync(cached, target); planned.push({ sentence: b.sentence, from: "cache", asks: 0, costUsd: 0 }); continue; }
    if (!run.allowNew) { planned.push({ sentence: b.sentence, from: "engine_cache", asks: 0, costUsd: 0 }); continue; } // the engine's own cache ($0)
    const one = await planOne(run, b.sentence, q);
    if (!one.ok) return one;
    const saved = { sentence: b.sentence, plan: one.plan, check: { ok: true, errors: [], not_built: [], notes: [] }, cached: false, via: "luna", blocks: one.blocks, ...(qKey ? { question: qKey } : {}) };
    try { writeFileSync(target, JSON.stringify(saved, null, 1)); writeFileSync(cached, JSON.stringify(saved, null, 1)); }
    catch (error) { return { ok: false, words: serverWord(run.book, "director_failed", { words: String(error instanceof Error ? error.message : error).slice(0, 200) }) }; }
    planned.push({ sentence: b.sentence, from: "luna", asks: one.asks, costUsd: one.costUsd });
  }
  return { ok: true, dir: run.outDir, planned };
}
// (Nov 4 PM12) the AI's steps as the engine's plan: ONE figure (V1), one beat per step, in order; each beat's words + seconds as written,
// marked exact (kimodo_scene + moves.mts then send them unchanged: no squeeze, no added words, no added stand-up)
export function planFromSteps(steps: V1KimodoStep[]): Json {
  const who = "stick-figure";
  return {
    figures: [{ id: who, name: "stick figure", said_as: "" }], unknown: [],
    beats: steps.map((s, i) => ({
      id: `s${i + 1}`, when: i ? `after s${i}` : "start", who, does: "move", move: s.text, free_s: s.seconds, exact: true, airborne: s.airborne === true,
      motion: s.travels ? "travel" : "action", real_moves: 1,
      everyone: [{ who, body: s.text, goes: s.travels ? "forward" : "stays", of: "none", faces: "travel", touches: "none", effect: "none" }],
    })),
  };
}
const questionKey = (q: DirectorQuestion) => createHash("sha256").update(JSON.stringify([q.system, q.schema])).digest("hex").slice(0, 32);
const sameSentence = (file: string, sentence: string, qKey: string | null = null) => {
  try { const d = JSON.parse(readFileSync(file, "utf8")) as Json; return d.sentence === sentence && isRecord(d.plan) && (qKey === null || d.question === qKey); } catch { return false; }
};

async function planOne(run: DirectorRun, sentence: string, asked: DirectorQuestion | null = null):
  Promise<{ ok: true; plan: Json; blocks: unknown[]; asks: number; costUsd: number } | { ok: false; words: string }> {
  let q: DirectorQuestion;
  if (asked) q = asked;
  else {
    try { q = await run.tool.question(sentence); }
    catch (error) { return { ok: false, words: serverWord(run.book, "director_failed", { words: errText(error) }) }; }
  }
  const schema = strictSchema(q.schema);
  let user = q.user, asks = 0, costUsd = 0, errors: string[] = [];
  for (let attempt = 0; attempt <= run.director.retries; attempt++) {
    asks++;
    const got = await run.ask({ system: q.system, user, schema }).catch((error) => ({ ok: false as const, detail: errText(error) }));
    if (!got.ok) return { ok: false, words: serverWord(run.book, "director_unreachable") };
    costUsd += got.costUsd ?? 0;
    const answer = dropNulls(got.answer);
    let c: DirectorCheck;
    try { c = await run.tool.check(sentence, answer); }
    catch (error) { return { ok: false, words: serverWord(run.book, "director_failed", { words: errText(error) }) }; }
    // (Nov 4 PM12) a SOFT problem (only style, e.g. two moves in one beat) is re-asked, but the last answer is used: never a 'couldn't plan' dead end
    if ((c.ok || (c.soft === true && attempt === run.director.retries)) && isRecord(answer)) {
      const { blocks, ...plan } = answer;
      return { ok: true, plan: { ...plan, unknown: Array.isArray(plan.unknown) ? plan.unknown : [] }, blocks: Array.isArray(c.blocks) ? c.blocks : Array.isArray(blocks) ? blocks : [], asks, costUsd };
    }
    errors = (c.errors ?? []).map(String).filter(Boolean);
    user = `${q.user}\n\n${run.director.retryWords.replace("{answer}", JSON.stringify(answer)).replace("{errors}", errors.slice(0, 20).map((e) => `- ${e}`).join("\n"))}`;
  }
  console.error(`[v1 director] the plan for "${sentence.slice(0, 80)}" failed the check ${asks}x: ${errors.slice(0, 6).join(" | ")}`);   // (Nov 4) the server log says WHY
  return { ok: false, words: serverWord(run.book, "director_failed", { words: errors.slice(0, 4).join("; ") }) };
}
const errText = (error: unknown) => (error instanceof Error ? error.message : String(error)).slice(0, 200);
