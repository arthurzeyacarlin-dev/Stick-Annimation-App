// (dev, PM/helper tool) ONE director call for the blind DIRECTOR CONTEST and the hard test (H3 Round 5, Oct 27).
// The SAME question for both directors: ltx-effects/director/luna-director.mjs question (director-book.json lessons incl. OBEY +
// blocks + block law, the physics book's vocabulary, plan-schema.json + 'blocks'). The answer is checked by luna-director.mjs
// check (validate + OBEY + BLOCK LENGTH LAW). The caller decides on the re-ask (it passes the checker's words with --errors).
//   node scripts/engine-blocks/director-ask.mjs --who luna|sonnet --sentence "<words>" --out answer.json [--errors errors.json] [--try N]
// Prints ONE JSON line: { ok, called, usd, errors, unknown, blocks, answer_file, model, reason? }.
// Keys: loaded from the app copy's env the way `next dev` loads it (@next/env). The key stays in this process: it is never printed,
// logged, written, or passed to the engine child processes. No key -> 'not connected yet' and nothing is called.
// Spend: every call is logged (tokens x price) in ltx-effects/director/<who>-ledger.json; no call once TODAY's spend reaches the cap
// (Luna $0.25/day = DIAMOND_ENGINE_LUNA_CAP_USD, Sonnet $1/day = DIAMOND_ENGINE_SONNET_CAP_USD). Ledger writes are locked (parallel-safe).
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync, rmdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import nextEnv from "@next/env";

const APP = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const ROOT = process.env.DIAMOND_ENGINE_ROOT?.trim() || join(APP, "..");
const DIR = join(ROOT, "ltx-effects", "director");
const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
const who = arg("--who"), sentence = arg("--sentence"), out = arg("--out"), errFile = arg("--errors"), tryN = Number(arg("--try") ?? 1);
const say = (o) => { console.log(JSON.stringify(o)); process.exit(0); };
if (!["luna", "sonnet"].includes(who) || !sentence || !out) { console.error("usage: director-ask.mjs --who luna|sonnet --sentence <words> --out <file> [--errors <file>] [--try N]"); process.exit(2); }

// one provider table: model, price per million tokens (input, output), daily cap, env key name
const DIRECTORS = {
  luna: { model: "gpt-5.6-luna", price: { input: 0.2, output: 1.2 }, cap: Number(process.env.DIAMOND_ENGINE_LUNA_CAP_USD ?? 0.25), key: "OPENAI_API_KEY" },   // = AI_TEXT_MODEL + engineBlocksServer.ts prices
  sonnet: { model: "claude-sonnet-5-5", price: { input: 2, output: 10 }, cap: Number(process.env.DIAMOND_ENGINE_SONNET_CAP_USD ?? 1), key: "ANTHROPIC_API_KEY" },
};
const D = DIRECTORS[who], LEDGER = join(DIR, `${who}-ledger.json`), LOCK = `${LEDGER}.lock`;
const today = () => new Date().toLocaleDateString("en-CA");   // local date, YYYY-MM-DD
const readLedger = () => { try { return JSON.parse(readFileSync(LEDGER, "utf8")); } catch { return { cap_usd: D.cap, total_usd: 0, calls: [] }; } };
const spentToday = (L) => (L.calls ?? []).filter((c) => new Date(c.at).toLocaleDateString("en-CA") === today()).reduce((s, c) => s + (c.usd ?? 0), 0);
const withLock = async (fn, lock = LOCK) => {
  for (let i = 0; ; i++) { try { mkdirSync(lock); break; } catch { if (i > 200) { try { rmdirSync(lock); } catch { /* stale */ } } await new Promise((r) => setTimeout(r, 50)); } }
  try { return fn(); } finally { try { rmdirSync(lock); } catch { /* gone */ } }
};
const engine = (args) => execFileSync(process.execPath, [join(DIR, "luna-director.mjs"), ...args], { cwd: DIR, encoding: "utf8", maxBuffer: 1 << 24,
  env: { PATH: process.env.PATH, HOME: process.env.HOME, LANG: process.env.LANG ?? "en_US.UTF-8", TMPDIR: process.env.TMPDIR } });

nextEnv.loadEnvConfig(APP, true, { info: () => {}, error: () => {} });
const KEY = process.env[D.key]?.trim();
if (!KEY) say({ ok: false, called: false, usd: 0, model: D.model, reason: "not connected yet", errors: [`${who === "sonnet" ? "Sonnet" : "Luna"} is not connected yet (no key in the app copy) — nothing was called`] });
// Sonnet ALSO counts against dad's shared Claude test budget (harness-phase4/review/claude-spend.json, CLAUDE_TEST_BUDGET_USD):
// no call once that ledger's total reaches the budget minus one call's worst case; every Sonnet call is logged there too.
const SHARED = join(ROOT, "harness-phase4", "review", "claude-spend.json"), SHARED_LOCK = `${SHARED}.lock`, DAD = Number(process.env.CLAUDE_TEST_BUDGET_USD ?? 25), WORST = 0.1;
const readShared = () => { try { return JSON.parse(readFileSync(SHARED, "utf8")); } catch { return null; } };
if (who === "sonnet") { const S = readShared(); if (!S) say({ ok: false, called: false, usd: 0, model: D.model, reason: "cap", errors: ["the shared Claude spend ledger could not be read (no call made)"] });
  if (Number(S.total ?? 0) + WORST >= DAD) say({ ok: false, called: false, usd: 0, model: D.model, reason: "cap", errors: [`dad's Claude test budget ($${DAD}) is nearly used ($${S.total}) — no call made`] }); }
if (spentToday(readLedger()) >= D.cap) say({ ok: false, called: false, usd: 0, model: D.model, reason: "cap", errors: [`today's spending cap $${D.cap} is used (no call made)`] });

const q = JSON.parse(engine(["question", sentence]));
const prev = errFile && existsSync(errFile) ? JSON.parse(readFileSync(errFile, "utf8")) : [];
const input = prev.length ? `${q.user}\n\nYour last plan broke these rules:\n- ${prev.slice(0, 12).join("\n- ")}\nWrite the plan again.` : q.user;

let raw = null, usage = { input_tokens: 0, output_tokens: 0 }, model = D.model, failure = null;
try {
  if (who === "luna") {
    const { default: OpenAI } = await import("openai");
    const r = await new OpenAI({ apiKey: KEY }).responses.create({ model: D.model, instructions: q.system, input, store: false, max_output_tokens: 4000, reasoning: { effort: "low" },
      text: { format: { type: "json_schema", name: "scene_plan", strict: false, schema: q.schema } } });
    raw = typeof r.output_text === "string" ? r.output_text : "";
    usage = { input_tokens: r.usage?.input_tokens ?? 0, output_tokens: r.usage?.output_tokens ?? 0 }; model = r.model ?? model;
  } else {
    // Sonnet 5.5: forced tool_choice is refused by this model, so the answer shape is given as ONE tool with tool_choice auto
    // (the system prompt already says to answer only with the plan); a plain-JSON text answer is accepted too. Same low effort as Luna.
    const res = await fetch("https://api.anthropic.com/v1/messages", { method: "POST",
      headers: { "x-api-key": KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model: D.model, max_tokens: 8000, output_config: { effort: "low" }, system: `${q.system}\nGive that JSON object by calling the tool scene_plan.`,
        messages: [{ role: "user", content: input }], tools: [{ name: "scene_plan", description: "The scene plan for this sentence, with its blocks.", input_schema: q.schema }], tool_choice: { type: "auto" } }) });
    const j = await res.json().catch(() => ({}));
    usage = { input_tokens: j.usage?.input_tokens ?? 0, output_tokens: j.usage?.output_tokens ?? 0 }; model = j.model ?? model;
    if (!res.ok) failure = `API ${res.status}: ${String(j?.error?.message ?? "").slice(0, 200)}`;
    else if (j.stop_reason === "refusal") failure = "the model declined to answer";
    else {
      const tool = (j.content ?? []).find((c) => c.type === "tool_use" && c.name === "scene_plan");
      raw = tool ? JSON.stringify(tool.input) : (j.content ?? []).filter((c) => c.type === "text").map((c) => c.text).join("").replace(/^[^{]*/, "").replace(/[^}]*$/, "");
    }
  }
} catch (e) { failure = `the call failed: ${String(e?.message ?? e).slice(0, 200)}`; }

let answer = null; try { answer = raw ? JSON.parse(raw) : null; } catch { /* checked below */ }
mkdirSync(dirname(out), { recursive: true }); writeFileSync(out, JSON.stringify(answer, null, 1));
let checked = { ok: false, errors: [failure ?? "the answer is not a JSON object"], unknown: [], blocks: [] };
if (!failure) { try { checked = JSON.parse(engine(["check", sentence, out])); } catch { checked = { ok: false, errors: ["the answer could not be checked"], unknown: [], blocks: [] }; } }
const usd = (usage.input_tokens * D.price.input + usage.output_tokens * D.price.output) / 1e6;
if (who === "sonnet") await withLock(() => {
  const S = readShared() ?? { total: 0, calls: [] };
  S.total = Number((Number(S.total ?? 0) + usd).toFixed(4)); (S.calls ??= []).push({ at: new Date().toISOString(), model, usage, usd: Number(usd.toFixed(5)), where: "director contest (H3 R5)", kind: "director plan", ok: checked.ok });
  writeFileSync(SHARED, JSON.stringify(S, null, 1));
}, SHARED_LOCK);
await withLock(() => {
  const L = readLedger(); L.cap_usd = D.cap; L.total_usd = Number((Number(L.total_usd ?? 0) + usd).toFixed(6));
  (L.calls ??= []).push({ at: new Date().toISOString(), model, ...usage, usd: Number(usd.toFixed(6)), sentence: sentence.slice(0, 200), try: tryN, ok: checked.ok, via: "director-ask.mjs (H3 R5)" });
  writeFileSync(LEDGER, JSON.stringify(L, null, 1));
});
say({ ok: checked.ok, called: true, usd: Number(usd.toFixed(6)), model, errors: checked.errors, unknown: checked.unknown, blocks: checked.blocks, answer_file: out });
