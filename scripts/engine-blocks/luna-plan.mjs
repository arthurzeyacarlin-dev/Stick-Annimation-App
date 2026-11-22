// (dev, PM/helper tool) THE LIVE DIRECTOR from the command line — the SAME steps as liveDirector in
// src/lib/ai/engineBlocks/engineBlocksServer.ts: question from the engine's books (luna-director.mjs question), ONE Luna call
// through the app's OWN connection (the app's env is loaded the way `next dev` loads it; the key is never printed or passed
// to the engine child processes), the answer checked by luna-director.mjs check (validate + OBEY + BLOCK LENGTH LAW),
// re-asked once with the checker's words, every call logged in ltx-effects/director/luna-ledger.json, no call past the cap.
//   node scripts/engine-blocks/luna-plan.mjs "<sentence>" [--out answer.json]   (DIAMOND_ENGINE_ROOT = engine folder)
// Prints { ok, tries, usd, errors, unknown, blocks, answer_file }.
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import nextEnv from "@next/env";
import OpenAI from "openai";

const APP = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const ROOT = process.env.DIAMOND_ENGINE_ROOT?.trim() || join(APP, "..");
const DIR = join(ROOT, "ltx-effects", "director"), LEDGER = join(DIR, "luna-ledger.json");
const MODEL = "gpt-5.6-luna"; // = AI_TEXT_MODEL (src/lib/openai/generateAiText.ts)
const PRICE = { input: 0.2, output: 1.2 }; // per million tokens (same as engineBlocksServer.ts)
const MAX_TRIES = 2;

const sentence = process.argv[2], oi = process.argv.indexOf("--out");
if (!sentence) { console.error('usage: node scripts/engine-blocks/luna-plan.mjs "<sentence>" [--out answer.json]'); process.exit(2); }
const engine = (args) => execFileSync(process.execPath, [join(DIR, "luna-director.mjs"), ...args], { cwd: DIR, encoding: "utf8", maxBuffer: 1 << 24,
  env: { PATH: process.env.PATH, HOME: process.env.HOME, LANG: process.env.LANG ?? "en_US.UTF-8", TMPDIR: process.env.TMPDIR } });
const ledger = () => { try { return JSON.parse(readFileSync(LEDGER, "utf8")); } catch { return { cap_usd: 0.25, total_usd: 0, calls: [] }; } };
const cap = Number(process.env.DIAMOND_ENGINE_LUNA_CAP_USD ?? 0.25);

nextEnv.loadEnvConfig(APP, true, { info: () => {}, error: () => {} });
if (!process.env.OPENAI_API_KEY?.trim()) { console.log(JSON.stringify({ ok: false, errors: ["the app copy has no AI connection set up (no call made)"] })); process.exit(1); }
const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY.trim() });

const q = JSON.parse(engine(["question", sentence]));
const jobs = join(tmpdir(), "diamond-engine-blocks"); mkdirSync(jobs, { recursive: true });
let errors = [], usdAll = 0, last = null;
for (let attempt = 1; attempt <= MAX_TRIES; attempt++) {
  const L = ledger();
  if (L.total_usd >= cap) { console.log(JSON.stringify({ ok: false, tries: attempt - 1, usd: usdAll, errors: [`spending cap $${cap} reached (no call made)`] })); process.exit(1); }
  const input = errors.length ? `${q.user}\n\nYour last plan broke these rules:\n- ${errors.join("\n- ")}\nWrite the plan again.` : q.user;
  const r = await client.responses.create({ model: MODEL, instructions: q.system, input, store: false, max_output_tokens: 4000, reasoning: { effort: "low" },
    text: { format: { type: "json_schema", name: "scene_plan", strict: false, schema: q.schema } } });
  const raw = typeof r.output_text === "string" ? r.output_text : "";
  let answer = null; try { answer = JSON.parse(raw); } catch { /* checked below */ }
  const file = oi > 0 ? process.argv[oi + 1].replace(/(\.json)?$/, `-try${attempt}.json`) : join(jobs, `director-${randomUUID().slice(0, 8)}.json`);
  writeFileSync(file, JSON.stringify(answer, null, 1));
  let checked; try { checked = JSON.parse(engine(["check", sentence, file])); } catch { checked = { ok: false, errors: ["the answer could not be checked"], unknown: [], blocks: [] }; }
  const usage = { input_tokens: r.usage?.input_tokens ?? 0, output_tokens: r.usage?.output_tokens ?? 0 };
  const usd = (usage.input_tokens * PRICE.input + usage.output_tokens * PRICE.output) / 1e6; usdAll += usd;
  const after = ledger(); after.cap_usd = cap; after.total_usd = Number((after.total_usd + usd).toFixed(6));
  after.calls.push({ at: new Date().toISOString(), model: r.model ?? MODEL, ...usage, usd: Number(usd.toFixed(6)), sentence: sentence.slice(0, 200), try: attempt, ok: checked.ok, via: "luna-plan.mjs (H3 R4)" });
  writeFileSync(LEDGER, JSON.stringify(after, null, 1));
  last = { ok: checked.ok, tries: attempt, usd: Number(usdAll.toFixed(6)), errors: checked.errors, unknown: checked.unknown, blocks: checked.blocks, answer_file: file };
  if (checked.ok) break;
  errors = checked.errors.slice(0, 12);
}
console.log(JSON.stringify(last));
