import "server-only";
import { execFile, spawn, spawnSync, type ChildProcess } from "node:child_process";
import { getOpenAiClient } from "@/src/lib/openai/client";
import { AI_TEXT_MODEL } from "@/src/lib/openai/generateAiText";
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomInt, randomUUID } from "node:crypto";
import type { FrameCharacter } from "@/src/lib/animator/engine";
import type {
  EngineBlockResult,
  EngineJobSnapshot,
  EnginePlanResponse,
  EngineStoryBlock,
  EngineStoryPlan,
} from "./engineBlocksContract";

// Server side of the AI Animator engine blocks (see engineBlocksContract.ts). Default OFF.
//   DIAMOND_ENGINE_BLOCKS=1            server switch (the route answers 404 without it)
//   DIAMOND_ENGINE_ROOT=<folder>       the engine folder (holds ltx-effects/ and kimodo/)
//   DIAMOND_ENGINE_PLAN_FILE=<file>    dev director: a PM-written story plan (no AI is called)
//   DIAMOND_ENGINE_PATH=story          (dev) the OLD block runner director/story.mjs. Default = the PASSED engines through
//                                      director/engine-settings/plan_engine.mjs with the gate's ON switches
//                                      (engine-settings/switches-on.json, written from board/regression/SWITCHES.md)
//   DIAMOND_ENGINE_STORY=1             (Oct 30, wired V1) contact scenes go Kimodo walk-up -> Seedance -> physics (story_run.py /
//                                      solo_run.py, ltx-effects/seedance); no-contact scenes keep the Kimodo block path below
//   DIAMOND_ENGINE_ALLOW_SEEDANCE=1    allow PAID Seedance clips (never past the engine's own HARD_CAP). Without it: dry, stops at the pay step
//   DIAMOND_ENGINE_STORY_REUSE=<name>:<walk-up folder>  (dev proof, $0) run the story path on an ALREADY-PAID clip of that name
//   DIAMOND_ENGINE_ALLOW_KIMODO=1      allow NEW Kimodo takes (paid). Without it the engine runs dry: only cached
//                                      takes are used, and a block that would need a new take fails honestly ($0).

export const engineBlocksServerEnabled = () => process.env.DIAMOND_ENGINE_BLOCKS === "1";

const engineRoot = () => {
  const root = process.env.DIAMOND_ENGINE_ROOT?.trim();
  return root && existsSync(join(root, "ltx-effects", "director", "story.mjs")) ? root : null;
};
const lx = (root: string) => join(root, "ltx-effects");
const JOB_DIR = join(tmpdir(), "diamond-engine-blocks");
const JOB_TIMEOUT_MS = 20 * 60 * 1000;
const readJson = (path: string): unknown => JSON.parse(readFileSync(path, "utf8"));
const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

// ---------------------------------------------------------------------------------------------------------------
// DIRECTORS. A director turns the user's words into a story plan in blocks + one engine plan (plan-schema.json of
// ltx-effects/director) per block. Today only the PM-written plan file runs (no AI). The live director (Luna through
// the app's existing connection, or Sonnet) plugs in here next round with the SAME output, checked by the SAME
// validator + OBEY in story.mjs.
type DirectorOutput = { plan: Omit<EngineStoryPlan, "storyId">; enginePlans: Record<string, unknown>[]; reuseScenes?: (string | null)[] } | { message: string };
type EngineDirector = (input: { message: string }) => Promise<DirectorOutput>;

const normalizeWords = (text: string) => text.toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();

// PM-written plan file: { "label": "PM-written plan", "sentence": "...", "blocks": [{ "say", "sentence", "plan", "reuseScene"? }] }
// (dev, $0) "reuseScene": the name of a story scene the engine ALREADY made and checked (ltx-effects/out/story-<scene>.json):
// the block is read from it instead of running the engine again. Its own rulers still decide (a failed one is blocked).
const pmPlanFileDirector: EngineDirector = async ({ message }) => {
  const file = process.env.DIAMOND_ENGINE_PLAN_FILE?.trim();
  if (!file || !existsSync(file)) return { message: "No story plan is set up in this test copy yet (the live director is not connected yet)." };
  let file_: unknown;
  try { file_ = readJson(file); } catch { return { message: "The PM-written story plan file could not be read." }; }
  // One story, or { "stories": [ ... ] }. Each was written for ONE sentence; other words are never forced onto a plan
  // (OBEY): said honestly instead.
  const stories = (isRecord(file_) && Array.isArray(file_.stories) ? file_.stories : [file_]).filter(isRecord);
  if (!stories.length || stories.some((entry) => typeof entry.sentence !== "string" || !Array.isArray(entry.blocks) || entry.blocks.length === 0)) {
    return { message: "The PM-written story plan file is not in the right shape." };
  }
  const raw = stories.find((entry) => normalizeWords(message) === normalizeWords(String(entry.sentence)));
  if (!raw || !Array.isArray(raw.blocks) || typeof raw.sentence !== "string") {
    return { message: `The live director is not connected yet. This test copy only has PM-written plans for: ${stories.map((entry) => `"${String(entry.sentence)}"`).join(", ")}.` };
  }
  const blocks: EngineStoryBlock[] = [], enginePlans: Record<string, unknown>[] = [], reuseScenes: (string | null)[] = [];
  for (const [index, entry] of raw.blocks.entries()) {
    if (!isRecord(entry) || typeof entry.say !== "string" || typeof entry.sentence !== "string" || !isRecord(entry.plan)) {
      return { message: `Block ${index + 1} of the PM-written plan is not in the right shape.` };
    }
    blocks.push({ index, say: entry.say, sentence: entry.sentence });
    enginePlans.push({ ...entry.plan, label: typeof raw.label === "string" ? raw.label : "PM-written plan" });
    reuseScenes.push(typeof entry.reuseScene === "string" && /^[\w.-]+$/.test(entry.reuseScene) ? entry.reuseScene : null);
  }
  return { plan: { label: typeof raw.label === "string" ? raw.label : "PM-written plan", source: "pm-plan-file", sentence: raw.sentence, blocks }, enginePlans, reuseScenes };
};

// THE LIVE DIRECTOR (Luna, through the app's EXISTING AI connection — the same client and key the Luna chat uses; the
// key never leaves this server process, the engine child processes get none). The engine builds the question from its
// two books (ltx-effects/director/luna-director.mjs question: director-book.json lessons incl. OBEY + blocks, the
// physics book's vocabulary, plan-schema.json + blocks) and checks the answer (luna-director.mjs check: validate.mjs +
// OBEY plan-vs-words for the whole story AND every block). A failed answer is re-asked once with the checker's
// words; then it is said honestly. Things V1 does not have are said ("not in V1"), never swapped.
// SPEND: every call is logged (tokens x price) in ltx-effects/director/<who>-ledger.json; no call is made once TODAY's spend
// reaches the cap (Luna DIAMOND_ENGINE_LUNA_CAP_USD, default $0.25/day; Sonnet DIAMOND_ENGINE_SONNET_CAP_USD, default $1/day).
// SONNET (dev, director contest only): the SAME question and checks, through Anthropic's API with the app copy's env key
// ANTHROPIC_API_KEY (loaded by next dev). No key -> "not connected yet" and nothing is called. The key never leaves this process.
type LiveWho = "luna" | "sonnet";
const LIVE_DIRECTORS: Record<LiveWho, { model: string; price: { input: number; output: number }; cap: () => number; name: string }> = {
  luna: { model: AI_TEXT_MODEL, price: { input: 0.2, output: 1.2 }, cap: () => Number(process.env.DIAMOND_ENGINE_LUNA_CAP_USD ?? 0.25), name: "Luna" }, // (same prices as the Luna chat)
  sonnet: { model: "claude-sonnet-5-5", price: { input: 2, output: 10 }, cap: () => Number(process.env.DIAMOND_ENGINE_SONNET_CAP_USD ?? 1), name: "Sonnet" },
};
const LIVE_MAX_TRIES = 2;
const engineNode = (root: string, args: string[]) => new Promise<string>((resolve, reject) => {
  const env: Record<string, string | undefined> = { PATH: process.env.PATH, HOME: process.env.HOME, LANG: process.env.LANG ?? "en_US.UTF-8", TMPDIR: process.env.TMPDIR };
  execFile(process.execPath, [join(lx(root), "director", "luna-director.mjs"), ...args], { cwd: join(lx(root), "director"), env, maxBuffer: 1 << 24, timeout: 60_000 } as Parameters<typeof execFile>[2], (error, stdout) => error ? reject(error) : resolve(String(stdout)));
});
type LunaLedger = { cap_usd: number; total_usd: number; calls: { at: string; model: string; input_tokens: number; output_tokens: number; usd: number; sentence: string; try: number; ok: boolean; via?: string }[] };
const ledgerPath = (root: string, who: LiveWho) => join(lx(root), "director", `${who}-ledger.json`);
const readLedger = (root: string, who: LiveWho): LunaLedger => {
  const cap = LIVE_DIRECTORS[who].cap();
  try { const l = readJson(ledgerPath(root, who)) as LunaLedger; return { ...l, cap_usd: cap, calls: l.calls ?? [] }; } catch { return { cap_usd: cap, total_usd: 0, calls: [] }; }
};
const dayOf = (iso: string) => new Date(iso).toLocaleDateString("en-CA");
const spentToday = (ledger: LunaLedger) => ledger.calls.filter((call) => dayOf(call.at) === dayOf(new Date().toISOString())).reduce((sum, call) => sum + (call.usd ?? 0), 0);
type Checked = { ok: boolean; errors: string[]; unknown: string[]; blocks: ({ say: string; sentence: string; plan: Record<string, unknown> } & Record<string, unknown>)[] };
type Asked = { raw: string; usage: { input_tokens: number; output_tokens: number }; model: string } | { failure: string };
type Question = { system: string; user: string; schema: Record<string, unknown> };

const askLuna = async (q: Question, input: string): Promise<Asked> => {
  try {
    const response = await getOpenAiClient("terra-conversation").responses.create({
      model: AI_TEXT_MODEL, instructions: q.system, input, store: false, max_output_tokens: 4000, reasoning: { effort: "low" },
      text: { format: { type: "json_schema", name: "scene_plan", strict: false, schema: q.schema } },
    });
    return {
      raw: "output_text" in response && typeof response.output_text === "string" ? response.output_text : "",
      usage: { input_tokens: response.usage?.input_tokens ?? 0, output_tokens: response.usage?.output_tokens ?? 0 },
      model: response.model ?? AI_TEXT_MODEL,
    };
  } catch { return { failure: "unreachable" }; }
};
// Sonnet 5.5 refuses a forced tool_choice, so the plan shape is ONE tool with tool_choice auto (the system prompt already says to
// answer only with the plan); a plain-JSON text answer is accepted too. Same low effort as Luna.
const askSonnet = async (q: Question, input: string): Promise<Asked> => {
  const key = process.env.ANTHROPIC_API_KEY?.trim();
  if (!key) return { failure: "not-connected" };
  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST", headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model: LIVE_DIRECTORS.sonnet.model, max_tokens: 8000, output_config: { effort: "low" }, system: `${q.system}\nGive that JSON object by calling the tool scene_plan.`,
        messages: [{ role: "user", content: input }], tools: [{ name: "scene_plan", description: "The scene plan for this sentence, with its blocks.", input_schema: q.schema }], tool_choice: { type: "auto" } }),
    });
    const body = await response.json().catch(() => ({})) as { model?: string; stop_reason?: string; usage?: { input_tokens?: number; output_tokens?: number }; content?: { type: string; name?: string; input?: unknown; text?: string }[] };
    const usage = { input_tokens: body.usage?.input_tokens ?? 0, output_tokens: body.usage?.output_tokens ?? 0 };
    if (!response.ok || body.stop_reason === "refusal") return { raw: "", usage, model: body.model ?? LIVE_DIRECTORS.sonnet.model };
    const tool = (body.content ?? []).find((block) => block.type === "tool_use" && block.name === "scene_plan");
    const text = (body.content ?? []).filter((block) => block.type === "text").map((block) => block.text ?? "").join("");
    return { raw: tool ? JSON.stringify(tool.input) : text.replace(/^[^{]*/, "").replace(/[^}]*$/, ""), usage, model: body.model ?? LIVE_DIRECTORS.sonnet.model };
  } catch { return { failure: "unreachable" }; }
};
// Sonnet also counts against dad's shared Claude test budget (harness-phase4/review/claude-spend.json, CLAUDE_TEST_BUDGET_USD).
const sharedSpendPath = (root: string) => join(root, "harness-phase4", "review", "claude-spend.json");
const sharedBudgetLeft = (root: string) => {
  try { const shared = readJson(sharedSpendPath(root)) as { total?: number }; return Number(process.env.CLAUDE_TEST_BUDGET_USD ?? 25) - Number(shared.total ?? 0); } catch { return -1; }
};
const logSharedSpend = (root: string, entry: Record<string, unknown>, usd: number) => {
  try {
    const shared = readJson(sharedSpendPath(root)) as { total?: number; calls?: unknown[] };
    shared.total = Number((Number(shared.total ?? 0) + usd).toFixed(4)); (shared.calls ??= []).push(entry);
    writeFileSync(sharedSpendPath(root), JSON.stringify(shared, null, 1));
  } catch { /* the director's own ledger still has it */ }
};
const ASK: Record<LiveWho, (q: Question, input: string) => Promise<Asked>> = { luna: askLuna, sonnet: askSonnet };

// One checked live director. `shownAs` = the name the user sees ("Luna", or "Director A" in the blind contest).
const checkedDirector = (who: LiveWho, shownAs: string): EngineDirector => async ({ message }) => {
  const root = engineRoot();
  if (!root) return { message: "The animation engine is not set up on this computer." };
  if (who === "sonnet" && !process.env.ANTHROPIC_API_KEY?.trim()) return { message: `${shownAs} is not connected yet. Nothing was asked.` };
  let q: Question;
  try { q = JSON.parse(await engineNode(root, ["question", message])); } catch { return { message: "The director could not read the engine's books. Nothing was asked." }; }
  mkdirSync(JOB_DIR, { recursive: true });
  let errors: string[] = [];
  for (let attempt = 1; attempt <= LIVE_MAX_TRIES; attempt++) {
    const ledger = readLedger(root, who);
    if (spentToday(ledger) >= ledger.cap_usd) return { message: `${shownAs}'s spending cap for today ($${ledger.cap_usd.toFixed(2)}) is used up, so I didn't ask. Nothing changed.` };
    if (who === "sonnet" && sharedBudgetLeft(root) < 0.1) return { message: `${shownAs}'s test budget is used up, so I didn't ask. Nothing changed.` };
    const input = errors.length ? `${q.user}\n\nYour last plan broke these rules:\n- ${errors.join("\n- ")}\nWrite the plan again.` : q.user;
    const asked = await ASK[who](q, input);
    if ("failure" in asked) return { message: asked.failure === "not-connected" ? `${shownAs} is not connected yet. Nothing was asked.` : `I couldn't reach ${shownAs} right now. Nothing changed.` };
    let answer: unknown = null;
    try { answer = JSON.parse(asked.raw); } catch { /* checked below */ }
    const answerPath = join(JOB_DIR, `director-${randomUUID().slice(0, 8)}.json`);
    writeFileSync(answerPath, JSON.stringify(answer));
    let checked: Checked;
    try { checked = JSON.parse(await engineNode(root, ["check", message, answerPath])); } catch { checked = { ok: false, errors: ["the answer could not be checked"], unknown: [], blocks: [] }; }
    const price = LIVE_DIRECTORS[who].price;
    const usd = (asked.usage.input_tokens * price.input + asked.usage.output_tokens * price.output) / 1_000_000;
    const after = readLedger(root, who);
    after.total_usd = Number((Number(after.total_usd ?? 0) + usd).toFixed(6));
    after.calls.push({ at: new Date().toISOString(), model: asked.model, ...asked.usage, usd: Number(usd.toFixed(6)), sentence: message.slice(0, 200), try: attempt, ok: checked.ok, via: shownAs === LIVE_DIRECTORS[who].name ? "app" : "app contest" });
    writeFileSync(ledgerPath(root, who), JSON.stringify(after, null, 1));
    if (who === "sonnet") logSharedSpend(root, { at: new Date().toISOString(), model: asked.model, usage: asked.usage, usd: Number(usd.toFixed(5)), where: "app director contest", kind: "director plan", ok: checked.ok }, usd);
    if (!checked.ok) { errors = checked.errors.slice(0, 12); continue; }
    const missing = checked.unknown.length ? `Not in V1 yet: ${checked.unknown.join("; ")}. I won't swap it for something else.` : "";
    if (!checked.blocks.length) return { message: missing || "I couldn't find anything to animate in that. Nothing changed." };
    const label = `Plan by ${shownAs} (checked)`;
    return {
      plan: { label: missing ? `${label}. ${missing}` : label, source: shownAs === LIVE_DIRECTORS[who].name ? "live" : "contest", sentence: message, blocks: checked.blocks.map((block, index) => ({ index, say: block.say, sentence: block.sentence })) },
      // engineBlock = the whole checked block (engine / starts / ends / plan): plan_engine.mjs hands it to the engine that passed for its kind
      enginePlans: checked.blocks.map((block) => ({ ...block.plan, label, engineBlock: block })),
    };
  }
  return { message: `${shownAs}'s plan didn't match your words after ${LIVE_MAX_TRIES} tries, so nothing was made. What it got wrong: ${errors.slice(0, 4).join("; ")}` };
};
const liveDirector: EngineDirector = checkedDirector("luna", "Luna");

// (dev) BLIND DIRECTOR CONTEST: DIAMOND_ENGINE_DIRECTOR=contest. The panel picks "Director A" or "Director B"; which one is Luna
// and which is Sonnet is read from ltx-effects/director/contest/mapping.json (made once at random, by contest.mjs or here; only
// the PM reads it). The user only ever sees the letter.
export type ContestLetter = "A" | "B";
const contestDirector = (letter: ContestLetter): EngineDirector => async (input) => {
  const root = engineRoot();
  if (!root) return { message: "The animation engine is not set up on this computer." };
  const mapFile = join(lx(root), "director", "contest", "mapping.json");
  if (!existsSync(mapFile)) {
    const [a, b] = randomInt(2) ? ["luna", "sonnet"] : ["sonnet", "luna"];
    mkdirSync(join(lx(root), "director", "contest"), { recursive: true });
    writeFileSync(mapFile, JSON.stringify({ A: a, B: b, made_at: new Date().toISOString(), _note: "PM only. Never show this to the viewer." }, null, 1));
  }
  let who: unknown;
  try { who = (readJson(mapFile) as Record<string, unknown>)[letter]; } catch { who = null; }
  if (who !== "luna" && who !== "sonnet") return { message: "The director contest is not set up correctly in this test copy." };
  return checkedDirector(who, `Director ${letter}`)(input);
};
export const engineContestEnabled = () => process.env.DIAMOND_ENGINE_DIRECTOR === "contest";

// (dev) With DIAMOND_ENGINE_DIRECTOR=live AND a PM plan file set, a sentence the file has a PM-written plan for uses it
// (labelled "PM-written plan", $0); every other sentence goes to Luna. Without the file, every sentence goes to Luna.
const liveOrFileDirector: EngineDirector = async (input) => {
  const fromFile = process.env.DIAMOND_ENGINE_PLAN_FILE?.trim() ? await pmPlanFileDirector(input) : null;
  return fromFile && !("message" in fromFile) ? fromFile : liveDirector(input);
};
const DIRECTORS: Record<"pm-plan-file" | "live", EngineDirector> = { "pm-plan-file": pmPlanFileDirector, live: liveOrFileDirector };
const activeDirector = (): "pm-plan-file" | "live" => (process.env.DIAMOND_ENGINE_DIRECTOR === "live" ? "live" : "pm-plan-file");

// ---------------------------------------------------------------------------------------------------------------
// STORIES + JOBS (in memory, per server; one engine job at a time — the engine is heavy on this Mac).
type Story = {
  plan: EngineStoryPlan;
  enginePlans: Record<string, unknown>[];
  reuseScenes: (string | null)[];
  ownerId: string;
  projectId: string;
  endStates: (string | null)[]; // per made block: file with every figure's end state (the next block starts there)
};
type Job = EngineJobSnapshot & { ownerId: string; child: ChildProcess | null };
type Store = { stories: Map<string, Story>; jobs: Map<string, Job>; running: string | null };
const g = globalThis as typeof globalThis & { diamondEngineBlocks?: Store };
const store: Store = g.diamondEngineBlocks ?? { stories: new Map(), jobs: new Map(), running: null };
g.diamondEngineBlocks = store;

export async function planStory(message: string, ownerId: string, projectId: string, contestLetter: ContestLetter | null = null): Promise<EnginePlanResponse> {
  const out = engineContestEnabled()
    ? (contestLetter ? await contestDirector(contestLetter)({ message }) : { message: "Pick Director A or Director B first." })
    : await DIRECTORS[activeDirector()]({ message });
  if ("message" in out) return { ok: false, message: out.message };
  const storyId = randomUUID();
  const plan: EngineStoryPlan = { ...out.plan, storyId };
  store.stories.set(storyId, { plan, enginePlans: out.enginePlans, reuseScenes: out.reuseScenes ?? [], ownerId, projectId, endStates: [] });
  return { ok: true, plan };
}

const publicSnapshot = (job: Job): EngineJobSnapshot => {
  const { ownerId: _o, child: _c, ...snapshot } = job;
  void _o; void _c;
  return snapshot;
};

export function getJob(jobId: string, ownerId: string, projectId: string) {
  const job = store.jobs.get(jobId);
  return job && job.ownerId === ownerId && job.projectId === projectId ? publicSnapshot(job) : null;
}

// Capability probe: can story.mjs start a story from given figure states (its CLI reads "--start")?
const engineCanStartFromPose = (root: string, file = join(lx(root), "director", "story.mjs")) => {
  const src = readFileSync(file, "utf8");
  const cli = src.slice(src.indexOf("process.argv[1]"));
  return cli.includes("--start");
};

// ---------------------------------------------------------------------------------------------------------------
// THE PASSED ENGINES (Final round, Oct 28): each checked block goes to director/engine-settings/plan_engine.mjs, which hands it to
// the engine that PASSED for its kind (moves / hits / effects) through that engine's own entry point. The switches it runs with are
// the gate's final ON set (engine-settings/switches-on.json) - never typed here. Its drawn figures come from export_block.mjs (the
// same renderer + settings as the block's video), so the canvas gets exactly what the video shows.
const planEnginePath = (root: string) => join(lx(root), "director", "engine-settings", "plan_engine.mjs");
type PlanEngineFinish = (status: Exclude<EngineJobSnapshot["status"], "running">, message: string | null, why?: string[], result?: EngineBlockResult | null) => void;
function planEngineBlock(root: string, enginePlan: Record<string, unknown> | undefined): Record<string, unknown> | null {
  if (process.env.DIAMOND_ENGINE_PATH?.trim() === "story" || !existsSync(planEnginePath(root))) return null;
  const block = enginePlan?.engineBlock;
  return isRecord(block) && typeof block.engine === "string" && isRecord(block.plan) ? block : null;
}
function planEngineSwitches(root: string): Record<string, string> {
  const file = join(lx(root), "director", "engine-settings", "switches-on.json");
  if (!existsSync(file)) return {};
  const on = readJson(file) as { on?: Record<string, unknown> };
  return Object.fromEntries(Object.entries(on.on ?? {}).filter(([k, v]) => /^[A-Z_]+$/.test(k) && typeof v === "string").map(([k, v]) => [k, String(v)]));
}
function runPlanEngineBlock(root: string, story: Story, blockIndex: number, block: Record<string, unknown>, jobId: string, job: Job, finish: PlanEngineFinish) {
  mkdirSync(JOB_DIR, { recursive: true });
  const scene = `app-${jobId.slice(0, 8)}-b${blockIndex + 1}`;
  const planPath = join(JOB_DIR, `${scene}-plan.json`);
  const enginePlan = story.enginePlans[blockIndex] as { figures?: unknown[] };
  const figures = (isRecord(block.plan) && Array.isArray(block.plan.figures) ? block.plan.figures : enginePlan.figures) ?? [];
  writeFileSync(planPath, JSON.stringify({ figures, blocks: [block] }));
  // A small clean environment (none of the app's keys). Dry by default: no new paid Kimodo take.
  const allowKimodo = process.env.DIAMOND_ENGINE_ALLOW_KIMODO === "1";
  const env: Record<string, string | undefined> = {
    PATH: process.env.PATH, HOME: process.env.HOME, USER: process.env.USER, LANG: process.env.LANG ?? "en_US.UTF-8", TMPDIR: process.env.TMPDIR,
    ...planEngineSwitches(root),
    ...(allowKimodo ? { CALL_LEDGER: process.env.DIAMOND_ENGINE_CALL_LEDGER, CALL_CAP: process.env.DIAMOND_ENGINE_CALL_CAP } : { FIGHT_DRY: "1", CALL_CAP: "0" }),
  };
  const cwd = join(lx(root), "director", "engine-settings");
  const started = Date.now();
  store.running = jobId;
  let tail = "";
  const run = (args: string[], onClose: (code: number | null) => void) => {
    let child: ChildProcess;
    try { child = spawn(process.execPath, args, { cwd, env, stdio: ["ignore", "pipe", "pipe"] } as Parameters<typeof spawn>[2]); }
    catch (error) { finish("failed", "The engine could not start.", [String(error)]); return; }
    job.child = child;
    const onOutput = (chunk: Buffer) => {
      tail = (tail + chunk.toString("utf8")).slice(-6000);
      const line = tail.trim().split("\n").filter(Boolean).at(-1) ?? "";
      if (/teach\.ts|render|frec/.test(line)) job.progress = "drawing and checking the block";
      else if (/kimodo|cached|CALL/i.test(line)) job.progress = "making the moves";
    };
    child.stdout?.on("data", onOutput);
    child.stderr?.on("data", onOutput);
    const timer = setTimeout(() => { child.kill("SIGTERM"); finish("failed", "The engine took too long and was stopped. Nothing was added.", [tail.slice(-400)]); }, JOB_TIMEOUT_MS);
    child.on("error", (error) => { clearTimeout(timer); finish("failed", "The engine could not run.", [String(error)]); });
    child.on("close", (code) => { clearTimeout(timer); onClose(code); });
  };
  const report = join(lx(root), "out", `pe-${scene}.json`);
  run([planEnginePath(root), planPath, "--scene", scene], (code) => {
    if (job.status !== "running") return;
    if (!existsSync(report) || statSync(report).mtimeMs < started) { finish("failed", `The engine stopped without a result (exit ${code}). Nothing was added.`, [tail.slice(-600)]); return; }
    const made = ((readJson(report) as { blocks?: Record<string, unknown>[] }).blocks ?? [])[0];
    const said = Array.isArray(made?.said) ? made.said.map(String) : [];
    if (!made || made.ok !== true || made.held === true || typeof made.video !== "string") {
      finish("blocked", "The engine checked this block and it did not pass, so it was NOT added. Here is why:", said.length ? said : ["the engine made no passing video for this block"]);
      return;
    }
    job.progress = "putting the drawing on the canvas";
    const exportPath = join(JOB_DIR, `${scene}-export.json`);
    run([join(cwd, "export_block.mjs"), report, "1", exportPath], () => {
      if (job.status !== "running") return;
      if (!existsSync(exportPath) || statSync(exportPath).mtimeMs < started) { finish("failed", "The engine made no drawing for this block. Nothing was added.", [tail.slice(-400)]); return; }
      const exported = readJson(exportPath) as { fps?: number; frames?: { raw?: FrameCharacter[] }[]; names?: Record<string, string> };
      const frames = (exported.frames ?? []).map((frame) => (frame.raw ?? []).map(({ id, skeleton, style, headRadius, facing }) => ({ id, skeleton, style, headRadius, facing })));
      if (!frames.length || frames.some((frame) => frame.length === 0)) { finish("failed", "The engine's drawing was empty. Nothing was added.", said); return; }
      const fps = Number.isFinite(exported.fps) && Number(exported.fps) > 0 ? Number(exported.fps) : 24;
      const names = new Map((figures as { id?: string; name?: string }[]).map((f) => [String(f.id ?? "").toLowerCase(), String(f.name ?? f.id ?? "")]));
      const out = frames[0].map((c) => ({ id: c.id, name: exported.names?.[c.id] ?? names.get(String(c.id).toLowerCase()) ?? c.id }));
      // End pose of every figure (its last drawn picture): kept for the next block (used once the engine can start from a pose).
      const endStateFile = join(JOB_DIR, `${scene}-end.json`);
      writeFileSync(endStateFile, JSON.stringify(Object.fromEntries(frames[frames.length - 1].map((c) => [c.id, c]))));
      story.endStates[blockIndex] = endStateFile;
      const effectsBlock = block.engine === "effects";
      finish("done", null, said, {
        fps, figures: out, frames, effects: [], lengthS: frames.length / fps, video: String(made.video), continuedFromLastPose: false,
        // (the effects engine's own pictures are not captured into the canvas on this path yet: said, never hidden)
        ...(effectsBlock ? { effectLayersError: "This block's effects are in its video but could not be put on the canvas yet." } : {}),
      });
    });
  });
}

export type StartBlockOutcome = { ok: true; job: EngineJobSnapshot } | { ok: false; status: number; message: string };

export function startBlock(storyId: string, blockIndex: number, ownerId: string, projectId: string): StartBlockOutcome {
  const root = engineRoot();
  if (!root) return { ok: false, status: 503, message: "The animation engine is not set up on this computer." };
  const story = store.stories.get(storyId);
  if (!story || story.ownerId !== ownerId || story.projectId !== projectId) return { ok: false, status: 404, message: "This story plan is no longer available. Ask for the plan again." };
  const block = story.plan.blocks[blockIndex];
  if (!block) return { ok: false, status: 400, message: "That block is not in the plan." };
  if (blockIndex > 0 && !story.endStates[blockIndex - 1]) return { ok: false, status: 409, message: `Make block ${blockIndex} first: block ${blockIndex + 1} starts from its end pose.` };
  if (store.running) return { ok: false, status: 409, message: "The engine is already making a block. Wait for it to finish." };

  const jobId = randomUUID();
  const job: Job = {
    jobId, projectId, storyId, blockIndex, ownerId, child: null, status: "running", startedAt: new Date().toISOString(), finishedAt: null,
    progress: "starting the engine", message: null, why: [], result: null,
  };
  store.jobs.set(jobId, job);
  const finish = (status: Exclude<EngineJobSnapshot["status"], "running">, message: string | null, why: string[] = [], result: EngineBlockResult | null = null) => {
    if (job.status !== "running") return;
    Object.assign(job, { status, message, why, result, finishedAt: new Date().toISOString(), child: null });
    if (store.running === jobId) store.running = null;
  };

  // CONTINUE FROM THE LAST POSE: block k>0 must start from block k-1's end pose. If the engine can't take a start
  // pose yet, the block is NOT made (it would jump) — said honestly.
  const startFile = blockIndex > 0 ? story.endStates[blockIndex - 1] : null;
  // THE WIRED STORY PATH (contact scenes); no contact -> the Kimodo block path below, exactly as before
  const storyScene = `app-${jobId.slice(0, 8)}-b${blockIndex + 1}`;
  const routed = startFile ? null : routeStory(root, story, blockIndex, storyScene);
  if (routed?.route === "not_v1") { finish("blocked", "This part of the story is not in version 1 yet, so it was NOT made:", [routed.why]); return { ok: true, job: publicSnapshot(job) }; }
  if (routed && (routed.route === "walkup_contact" || routed.route === "contact")) { runStoryPath(root, routed, storyScene, jobId, job, finish); return { ok: true, job: publicSnapshot(job) }; }
  const peBlock = planEngineBlock(root, story.enginePlans[blockIndex]);
  if (peBlock) {
    if (startFile && !engineCanStartFromPose(root, planEnginePath(root))) {
      finish("blocked", "The engine can't start a block from the last block's end pose yet, so this block was not made (it would jump). Next engine update.", ["plan_engine.mjs has no --start option yet"]);
      return { ok: true, job: publicSnapshot(job) };
    }
    runPlanEngineBlock(root, story, blockIndex, peBlock, jobId, job, finish);
    return { ok: true, job: publicSnapshot(job) };
  }
  if (startFile && !engineCanStartFromPose(root)) {
    finish("blocked", "The engine can't start a block from the last block's end pose yet, so this block was not made (it would jump). Next engine update.", ["story.mjs has no --start option yet"]);
    return { ok: true, job: publicSnapshot(job) };
  }

  mkdirSync(JOB_DIR, { recursive: true });
  const reuse = story.reuseScenes[blockIndex];
  if (reuse) {
    try {
      const outcome = readBlockOutcome(root, { kind: "story", scene: reuse, freshAfter: null }, story, blockIndex, startFile !== null);
      if (outcome.status === "done") story.endStates[blockIndex] = outcome.endStateFile;
      if (outcome.status === "done" && outcome.result?.effects.length) {
        store.running = jobId; job.progress = "drawing the effects";
        withEffectLayers(root, `story-${reuse}`, outcome.result, (result) => finish(outcome.status, outcome.message, outcome.why, result));
        return { ok: true, job: publicSnapshot(job) };
      }
      finish(outcome.status, outcome.message, outcome.why, outcome.result);
    } catch (error) {
      finish("failed", "The engine's earlier result for this block could not be read. Nothing was added.", [String(error).slice(0, 300)]);
    }
    return { ok: true, job: publicSnapshot(job) };
  }
  const scene = `app-${jobId.slice(0, 8)}-b${blockIndex + 1}`;
  const planPath = join(JOB_DIR, `${scene}-plan.json`);
  writeFileSync(planPath, JSON.stringify(story.enginePlans[blockIndex]));
  const args = [join(lx(root), "director", "story.mjs"), planPath, scene, block.sentence, ...(startFile ? ["--start", startFile] : [])];
  // The engine gets a small clean environment (none of the app's keys). Dry by default: no new paid Kimodo take.
  const allowKimodo = process.env.DIAMOND_ENGINE_ALLOW_KIMODO === "1";
  const env: Record<string, string | undefined> = {
    PATH: process.env.PATH, HOME: process.env.HOME, USER: process.env.USER, LANG: process.env.LANG ?? "en_US.UTF-8", TMPDIR: process.env.TMPDIR,
    ...(allowKimodo ? {} : { FIGHT_DRY: "1", CALL_CAP: "0" }),
  };
  const started = Date.now();
  store.running = jobId;
  let child: ChildProcess;
  try {
    child = spawn(process.execPath, args, { cwd: join(lx(root), "director"), env, stdio: ["ignore", "pipe", "pipe"] } as Parameters<typeof spawn>[2]);
  } catch (error) {
    finish("failed", "The engine could not start.", [String(error)]);
    return { ok: true, job: publicSnapshot(job) };
  }
  job.child = child;
  let tail = "";
  const onOutput = (chunk: Buffer) => {
    tail = (tail + chunk.toString("utf8")).slice(-6000);
    // Plain words for the user (the raw engine log stays in `tail` for the failure report).
    const line = tail.trim().split("\n").filter(Boolean).at(-1) ?? "";
    if (/story_cast\.py render|teach\.ts|frec/.test(line)) job.progress = "drawing and checking the block";
    else if (/move_beat|exchange_beat|hold_state|cached|CALL/.test(line)) job.progress = "making the moves";
  };
  child.stdout?.on("data", onOutput);
  child.stderr?.on("data", onOutput);
  const timer = setTimeout(() => { child.kill("SIGTERM"); finish("failed", "The engine took too long and was stopped. Nothing was added.", [tail.slice(-400)]); }, JOB_TIMEOUT_MS);
  child.on("error", (error) => { clearTimeout(timer); finish("failed", "The engine could not run.", [String(error)]); });
  child.on("close", (code) => {
    clearTimeout(timer);
    try {
      const outcome = readBlockOutcome(root, { kind: "obey", scene, freshAfter: started }, story, blockIndex, startFile !== null);
      if (outcome.status === "done") story.endStates[blockIndex] = outcome.endStateFile;
      if (outcome.status === "done" && outcome.result?.effects.length) {
        job.progress = "drawing the effects";
        withEffectLayers(root, `story-${scene}`, outcome.result, (result) => finish(outcome.status, outcome.message, outcome.why, result));
        return;
      }
      finish(outcome.status, outcome.message, outcome.why, outcome.result);
    } catch (error) {
      finish("failed", `The engine stopped without a result (exit ${code}). Nothing was added.`, [String(error).slice(0, 300), tail.slice(-600)]);
    }
  });
  return { ok: true, job: publicSnapshot(job) };
}

export function cancelJob(jobId: string, ownerId: string, projectId: string) {
  const job = store.jobs.get(jobId);
  if (!job || job.ownerId !== ownerId || job.projectId !== projectId) return null;
  if (job.status === "running") {
    job.child?.kill("SIGTERM");
    Object.assign(job, { status: "failed", message: "Stopped. Nothing was added.", finishedAt: new Date().toISOString(), child: null });
    if (store.running === jobId) store.running = null;
  }
  return publicSnapshot(job);
}

// ---------------------------------------------------------------------------------------------------------------
// THE EFFECTS LAYER: the engine page's OWN effects (fire, water, lasers…) captured as transparent pictures, UNDER and OVER
// the figures (ltx-effects/director/fx-layer.mjs: the page runs exactly as in the engine's render, the figures are left
// out, white is keyed out; read-only, nothing of the page or its results is changed). If the capture fails, the block still
// goes on the canvas and the user is told the effects could not be drawn (never silently dropped).
const FX_TIMEOUT_MS = 6 * 60 * 1000;
function withEffectLayers(root: string, exportId: string, result: EngineBlockResult, done: (result: EngineBlockResult) => void) {
  const out = join(JOB_DIR, `${exportId}-fx-layer.json`), started = Date.now();
  const env: Record<string, string | undefined> = { PATH: process.env.PATH, HOME: process.env.HOME, USER: process.env.USER, LANG: process.env.LANG ?? "en_US.UTF-8", TMPDIR: process.env.TMPDIR };
  let finished = false;
  const end = (failure: string | null) => {
    if (finished) return; finished = true; clearTimeout(timer);
    if (!failure) {
      try {
        if (!existsSync(out) || statSync(out).mtimeMs < started) throw new Error("no fresh effects file");
        const layer = readJson(out) as { fps?: number; n?: number; stage?: number[]; under?: (string | null)[]; over?: (string | null)[] };
        if (!Array.isArray(layer.under) || !Array.isArray(layer.over) || layer.under.length === 0) throw new Error("effects file is empty");
        return done({ ...result, effectLayers: { fps: Number(layer.fps) || result.fps, stage: [Number(layer.stage?.[0]) || 1920, Number(layer.stage?.[1]) || 1080], under: layer.under, over: layer.over } });
      } catch (error) { failure = String(error).slice(0, 200); }
    }
    done({ ...result, effectLayersError: failure ?? "unknown" });
  };
  const child = spawn(process.execPath, [join(lx(root), "director", "fx-layer.mjs"), exportId, out], { cwd: join(lx(root), "director"), env, stdio: ["ignore", "pipe", "pipe"] } as Parameters<typeof spawn>[2]);
  let tail = "";
  child.stdout?.on("data", (c: Buffer) => { tail = (tail + c.toString("utf8")).slice(-800); });
  child.stderr?.on("data", (c: Buffer) => { tail = (tail + c.toString("utf8")).slice(-800); });
  const timer = setTimeout(() => { child.kill("SIGTERM"); end("the effects capture took too long"); }, FX_TIMEOUT_MS);
  child.on("error", (error) => end(String(error)));
  child.on("close", (code) => end(code === 0 ? null : `the effects capture stopped (exit ${code}): ${tail.slice(-200)}`));
}

// ---------------------------------------------------------------------------------------------------------------
// THE WIRED STORY PATH (Oct 30, PLAN_WIRED_V1_OCT30): the block's director plan -> plan_to_steps.py (route + engine steps) ->
// contact scenes: story_run.py (Kimodo walk-up, made automatically and cached -> Seedance -> one pen -> physics -> gate) or
// solo_run.py (contact without a walk-up). The result lands as ONE editable picture layer per figure + effects behind / in front.
const venvPython = (root: string) => join(lx(root), "video-ai-check", ".venv", "bin", "python");
type StoryRoute = { route: "kimodo_only" | "walkup_contact" | "contact" | "not_v1"; why: string; planFile: string };
function routeStory(root: string, story: Story, blockIndex: number, scene: string): StoryRoute | null {
  if (process.env.DIAMOND_ENGINE_STORY !== "1" || !existsSync(venvPython(root))) return null;
  mkdirSync(JOB_DIR, { recursive: true });
  const directorPlan = join(JOB_DIR, `${scene}-director.json`), planFile = join(JOB_DIR, `${scene}-steps.json`);
  writeFileSync(directorPlan, JSON.stringify(story.enginePlans[blockIndex]));
  const r = spawnSync(venvPython(root), [join(lx(root), "seedance", "plan_to_steps.py"), directorPlan, planFile, "--name", scene], { encoding: "utf8", timeout: 60_000 });
  try { const o = JSON.parse(String(r.stdout).trim().split("\n").at(-1) ?? ""); return { route: o.route, why: String(o.why ?? ""), planFile }; } catch { return null; }
}
const dataUrl = (file: string) => `data:image/png;base64,${readFileSync(file).toString("base64")}`;
function runStoryPath(root: string, routed: StoryRoute, scene: string, jobId: string, job: Job, finish: PlanEngineFinish) {
  const reuse = process.env.DIAMOND_ENGINE_STORY_REUSE?.trim();
  const [name, library] = reuse ? reuse.split(":") : [scene, null];
  const plan = readJson(routed.planFile) as { name: string; figures: { id: string }[]; steps: { kind: string; fx?: string }[] };
  plan.name = name; writeFileSync(routed.planFile, JSON.stringify(plan));
  const outDir = join(JOB_DIR, scene); mkdirSync(outDir, { recursive: true });
  const script = routed.route === "contact" ? "solo_run.py" : "story_run.py";
  const args = [join(lx(root), "seedance", script), routed.planFile, "--out-dir", outDir, ...(library ? ["--library", library] : []),
    ...(process.env.DIAMOND_ENGINE_ALLOW_SEEDANCE === "1" ? ["--pay"] : [])];
  // a small clean environment (none of the app's keys); Kimodo only from its cache unless new takes are allowed
  const env: Record<string, string | undefined> = { PATH: process.env.PATH, HOME: process.env.HOME, USER: process.env.USER, LANG: process.env.LANG ?? "en_US.UTF-8", TMPDIR: process.env.TMPDIR,
    ...(process.env.DIAMOND_ENGINE_ALLOW_KIMODO === "1" ? {} : { CACHE_ONLY: "1" }) };
  store.running = jobId; job.progress = routed.route === "contact" ? "making the moves (Seedance)" : "making the walk-up (Kimodo)";
  let tail = "", child: ChildProcess;
  try { child = spawn(venvPython(root), args, { cwd: lx(root), env, stdio: ["ignore", "pipe", "pipe"] } as Parameters<typeof spawn>[2]); }
  catch (error) { finish("failed", "The engine could not start.", [String(error)]); return; }
  job.child = child;
  const onOutput = (chunk: Buffer) => {
    tail = (tail + chunk.toString("utf8")).slice(-6000);
    const line = tail.trim().split("\n").filter(Boolean).at(-1) ?? "";
    if (/Seedance clip|i2v|ledger/.test(line)) job.progress = "making the contact moves (Seedance)";
    else if (/physics/.test(line)) job.progress = "adding the effects (physics engine)";
    else if (/gate/.test(line)) job.progress = "checking the animation";
  };
  child.stdout?.on("data", onOutput); child.stderr?.on("data", onOutput);
  const timer = setTimeout(() => { child.kill("SIGTERM"); finish("failed", "The engine took too long and was stopped. Nothing was added.", [tail.slice(-400)]); }, JOB_TIMEOUT_MS);
  child.on("error", (error) => { clearTimeout(timer); finish("failed", "The engine could not run.", [String(error)]); });
  child.on("close", (code) => {
    clearTimeout(timer);
    if (job.status !== "running") return;
    const said = tail.trim().split("\n").filter((l) => /^\[(story|solo)\]/.test(l)).slice(-6);
    if (code !== 0) {
      const last = tail.trim().split("\n").filter(Boolean).at(-1) ?? "";
      const budget = /paid step|HARD_CAP|cap/i.test(last);
      finish("blocked", budget ? "This animation needs a new paid Seedance clip and the money limit is used up, so it was NOT made." : "The engine checked this animation and it did not pass, so it was NOT added. Here is why:", [last.slice(0, 300), ...said].filter(Boolean));
      return;
    }
    try {
      const layersDir = join(outDir, `${name}-layers`);
      const man = readJson(join(layersDir, "manifest.json")) as { fps?: number; size?: number[]; layers?: { figure: string }[] };
      const ids = (man.layers ?? []).map((l) => l.figure);
      // picture order = Kimodo part (k...), Seedance part (0000...), Kimodo tail (t...) - the same order the engine plays them
      const order = (fid: string) => { const fs_ = readdirSync(join(layersDir, fid)).filter((f) => f.endsWith(".png")).sort(); return [...fs_.filter((f) => f.startsWith("k")), ...fs_.filter((f) => /^\d/.test(f)), ...fs_.filter((f) => f.startsWith("t"))]; };
      const soloGate = join(outDir, `${name}.result.json`);   // (solo_run keeps every video for tests: the app blocks a gate fail)
      const gate = existsSync(soloGate) ? (readJson(soloGate) as { gate?: { pass?: boolean; why?: string } }).gate : null;
      if (gate && gate.pass === false) { finish("blocked", "The engine checked this animation and it did not pass, so it was NOT added. Here is why:", [String(gate.why ?? "")]); return; }
      const pics = order(ids[0]);
      const fps = Number(man.fps) || 24, stage: [number, number] = [Number(man.size?.[0]) || 1920, Number(man.size?.[1]) || 1080];
      const fxResult = join(outDir, `${name}-fx`, "result.json");
      const fx = existsSync(fxResult) ? readJson(fxResult) as { under_dir?: string; over_dir?: string } : null;
      const side = (dir?: string) => pics.map((_, t) => { const f = dir ? join(dir, `${String(t).padStart(4, "0")}.png`) : ""; return dir && existsSync(f) ? dataUrl(f) : null; });
      const effects = plan.steps.filter((s) => s.kind === "effect").map((s) => ({ kind: s.fx ?? "effect" }));
      finish("done", null, said, {
        fps, figures: ids.map((id) => ({ id, name: id.charAt(0).toUpperCase() + id.slice(1) })), frames: pics.map(() => []), effects,
        ...(fx ? { effectLayers: { fps, stage, under: side(fx.under_dir), over: side(fx.over_dir) } } : effects.length ? { effectLayersError: "the physics engine did not add this effect (no touch was measured)" } : {}),
        figureLayers: { fps, stage, layers: ids.map((id) => ({ id, name: id.charAt(0).toUpperCase() + id.slice(1), pictures: order(id).map((f) => dataUrl(join(layersDir, id, f))) })) },
        lengthS: pics.length / fps, video: [join(outDir, `${name}-physics.mp4`), join(outDir, `${name}.mp4`)].find((f) => existsSync(f)) ?? null, continuedFromLastPose: false,
      });
    } catch (error) {
      finish("failed", "The engine's result could not be read. Nothing was added.", [String(error).slice(0, 300)]);
    }
  });
}

// ---------------------------------------------------------------------------------------------------------------
// READ THE ENGINE'S RESULT (fresh files only: a file older than this run never counts).
type Outcome = { status: "done" | "blocked" | "failed"; message: string | null; why: string[]; result: EngineBlockResult | null; endStateFile: string | null };

// verdict "obey": a story.mjs run (out/obey-<scene>.json: rulers + OBEY). verdict "story": an earlier story_cast render
// (out/story-<scene>.json: rulers), reused ($0, dev). freshAfter: files older than the run never count (null = reuse).
type Verdict = { kind: "obey" | "story"; scene: string; freshAfter: number | null };
type ObeyFile = { blocked?: boolean; why?: unknown[]; steps?: { file?: string }[]; story?: { video?: string; length_s?: number } | null; render_error?: string };
type StoryFile = { ok?: boolean; failed?: unknown[]; timeline?: string; video?: string; length_s?: number };

function beatFilesOf(root: string, timelinePath: string | undefined): string[] {
  if (!timelinePath) return [];
  const path = timelinePath.startsWith("/") ? timelinePath : join(root, timelinePath);
  if (!existsSync(path)) return [];
  const timeline = readJson(path) as { beats?: unknown[]; end_state?: unknown };
  if (timeline.end_state) return [path];
  return (timeline.beats ?? []).filter((beat): beat is string => typeof beat === "string").map((beat) => (beat.startsWith("/") ? beat : join(root, beat)));
}

function readBlockOutcome(root: string, verdict: Verdict, story: Story, blockIndex: number, continued: boolean): Outcome {
  const { scene, freshAfter } = verdict;
  const fresh = (path: string) => existsSync(path) && (freshAfter === null || statSync(path).mtimeMs >= freshAfter);
  const verdictPath = join(lx(root), "out", `${verdict.kind}-${scene}.json`);
  if (!fresh(verdictPath)) return { status: "failed", message: "The engine finished without a result. Nothing was added.", why: [], result: null, endStateFile: null };
  let obey: ObeyFile;
  if (verdict.kind === "obey") obey = readJson(verdictPath) as ObeyFile;
  else {
    const made = readJson(verdictPath) as StoryFile;
    obey = { blocked: made.ok !== true, why: made.failed ?? [], steps: beatFilesOf(root, made.timeline).map((file) => ({ file })), story: { video: made.video, length_s: made.length_s } };
  }
  const why = (obey.why ?? []).map(String);
  if (obey.render_error) why.push(obey.render_error);
  if (obey.blocked) {
    return { status: "blocked", message: "The engine checked this block and it did not pass, so it was NOT added. Here is why:", why, result: null, endStateFile: null };
  }
  const exportPath = join(lx(root), "takes", "fights", `story-${scene}.json`);
  if (!fresh(exportPath)) return { status: "failed", message: "The engine made no drawing for this block. Nothing was added.", why, result: null, endStateFile: null };
  const exported = readJson(exportPath) as { fps?: number; frames?: { raw?: FrameCharacter[] }[] };
  const frames = (exported.frames ?? []).map((frame) => (frame.raw ?? []).map(({ id, skeleton, style, headRadius, facing }) => ({ id, skeleton, style, headRadius, facing })));
  if (!frames.length || frames.some((frame) => frame.length === 0)) return { status: "failed", message: "The engine's drawing was empty. Nothing was added.", why, result: null, endStateFile: null };
  const fxPath = join(lx(root), "takes", "fights", `story-${scene}.fx.json`);
  const fx = fresh(fxPath) ? readJson(fxPath) as { effects?: Record<string, unknown>[] } : { effects: [] };

  // Figure names: the plan's figures -> the engine's figure ids through the physics book's cast.names (as story.mjs).
  const plan = story.enginePlans[blockIndex] as { figures?: { id?: string; name?: string }[] };
  const bookPath = join(lx(root), "physics", "book-p10.json");
  const names = existsSync(bookPath) ? ((readJson(bookPath) as { cast?: { names?: Record<string, string> } }).cast?.names ?? {}) : {};
  const nameOf = new Map<string, string>();
  for (const figure of plan.figures ?? []) {
    const engineId = names[String(figure.name ?? "").toLocaleLowerCase()] ?? names[String(figure.id ?? "")];
    if (engineId && figure.name) nameOf.set(engineId, figure.name);
  }
  const figures = frames[0].map((character) => ({ id: character.id, name: nameOf.get(character.id) ?? character.id }));

  // End pose of every figure (later beats win): the next block starts here.
  const endStates: Record<string, unknown> = {};
  for (const step of obey.steps ?? []) {
    if (!step.file || !existsSync(step.file)) continue;
    const beat = readJson(step.file) as { end_state?: Record<string, unknown> };
    Object.assign(endStates, beat.end_state ?? {});
  }
  let endStateFile: string | null = null;
  if (Object.keys(endStates).length) {
    endStateFile = join(JOB_DIR, `${scene}-end.json`);
    writeFileSync(endStateFile, JSON.stringify(endStates));
  }
  return {
    status: "done", message: null, why, endStateFile,
    result: {
      fps: Number.isFinite(exported.fps) && Number(exported.fps) > 0 ? Number(exported.fps) : 24,
      figures, frames, effects: fx.effects ?? [],
      lengthS: obey.story?.length_s ?? frames.length / (exported.fps ?? 24),
      video: obey.story?.video ?? null,
      continuedFromLastPose: continued,
    },
  };
}
