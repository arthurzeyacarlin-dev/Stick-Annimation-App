// SPEC-0017 Phase 3 bench API (dev only, signed in). POST runs ONE bench prompt through the director and streams
// newline-delimited JSON: progress lines (thinking → searching → animating % → ready), then the result.
// MONEY GUARD: real (Terra) runs are refused once this bench run has spent $3 or everything together $5; every run's
// cost and time is written to output/spec-0017/spend.json (git-ignored). Ratings go to output/spec-0017/ratings.json.
// `provider: "stub"` never calls any AI: the real director code runs on a FAKE provider that answers with a ready-made
// engine plan (helpers only, ?stub=1). `provider: "terra"` / `"luna"` are the real, paid calls (the page runs both).
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { requireAccountRequest } from "@/src/lib/account/access";
import { findBenchPrompt } from "@/src/lib/animator/director/benchPrompts";
import { effectsTestButtons } from "@/src/lib/animator/moves/tests2c";
import { findTest, type TestLook } from "@/src/lib/animator/moves/tests";
import type { ScenePlan } from "@/src/lib/animator/moves/plan";
import { direct, type Provider } from "@/src/lib/animator/director/direct";
import { LUNA_PRICES, lunaProvider, PRICES as TERRA_PRICES, terraProvider } from "@/src/lib/animator/director/terraProvider";
import { planTo } from "@/src/lib/animator/director/schema";
import {
  BENCH_CALL_MAX_USD, BENCH_PROMPT_WORST_USD, BENCH_RUN_BUDGET_USD, BENCH_TOTAL_CAP_USD, benchBudgetBlock,
  type BenchLine, type BenchProgress, type BenchProvider, type BenchRating, type BenchResult, type RatingsFile, type SpendLedger,
} from "@/app/dev/animator-bench/benchTypes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const OUT_DIR = path.join(process.cwd(), "output", "spec-0017");
const SPEND_FILE = path.join(OUT_DIR, "spend.json");
const RATINGS_FILE = path.join(OUT_DIR, "ratings.json");
const PER_REQUEST_MAX_USD = BENCH_CALL_MAX_USD;

const isDev = () => process.env.NODE_ENV === "development";
const notFound = () => new NextResponse("Not found", { status: 404 });

// A missing file = the fallback. A file that's there but BROKEN is never read as empty: the spending record would
// restart at $0 and the $5 cap would be lost — paid runs stop until it is repaired.
async function readJson<T>(file: string, fallback: T): Promise<T> {
  let text: string;
  try {
    text = await readFile(file, "utf8");
  } catch {
    return fallback;
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`${path.basename(file)} is damaged, so the bench stopped (nothing was charged). It must be repaired first.`);
  }
}

// ONE WRITER AT A TIME (2026-10-07: two models answering at once wrote the spending record together — one answer
// was lost with "ENOENT … rename" and the file was left broken). Every read-change-write of a file waits for the one
// before it, and every write uses its own temporary file.
const globalLocks = globalThis as typeof globalThis & { diamondAnimatorBenchLocks?: Map<string, Promise<unknown>> };
function locked<T>(file: string, work: () => Promise<T>): Promise<T> {
  const locks = (globalLocks.diamondAnimatorBenchLocks ??= new Map<string, Promise<unknown>>());
  const next = (locks.get(file) ?? Promise.resolve()).catch(() => undefined).then(work);
  locks.set(file, next.catch(() => undefined));
  return next;
}
async function writeJson(file: string, value: unknown) {
  await mkdir(OUT_DIR, { recursive: true });
  const tmp = `${file}.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2, 8)}.tmp`;
  await writeFile(tmp, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(tmp, file);
}
const readLedger = () => readJson<SpendLedger>(SPEND_FILE, { totalUsd: 0, runs: [] });
const readRatings = () => readJson<RatingsFile>(RATINGS_FILE, { ratings: [] });
const runSpent = (ledger: SpendLedger, runId: string) => ledger.runs.filter((r) => r.runId === runId && r.provider !== "stub").reduce((sum, r) => sum + r.costUsd, 0);

// ── The stub (no AI): a ready-made engine plan per prompt, so the page's stages and preview can be checked for free.
const STUB_LOOK: TestLook = { style: "natural", speed: "normal", energy: 0.5, direction: 1 };
const STUB_SCENES: Record<string, string> = {
  "wave": "wave", "high-jump": "jump", "walk-turn-sit": "walkTurnWalk", "two-high-five": "meetHighFive", "three-pass": "passBack",
  "robot-then-tired": "walkTurnWalk", "powerful-punch": "fight", "fire-vs-water": "fx:sisterTest", "dad-block-block-hit": "blockBlockHit",
  "arthur-parkour": "fx:parkour", "slow-then-sudden": "runStopTurnRun", "after-punch-ball": "fight", "tricky-vague": "jumpForward",
  "tricky-impossible": "tripFall", "tricky-unclear": "stand", "nt-cartwheel": "fall", "nt-robot-dance": "fight", "nt-tiptoe": "sneakRun",
  "nt-victory": "jump", "nt-new-power": "fx:purpleLightning", "orig-thunderstorm": "fx:rainyWindyDay", "orig-spike": "fx:parkour",
  "orig-effect": "fx:smoke", "orig-symbol": "walkTurnWalk", "orig-key-pose": "squat", "orig-background-color": "wave", "orig-8fps": "walkTurnWalk",
};
const STUB_SEARCHES: Record<string, string> = { "orig-thunderstorm": "what a thunderstorm with rain looks like", "nt-cartwheel": "how a cartwheel is done step by step" };

function stubPlan(promptId: string): ScenePlan {
  const key = STUB_SCENES[promptId] ?? "walkTurnWalk";
  if (key.startsWith("fx:")) {
    const made = effectsTestButtons().find((b) => b.id === key.slice(3))?.make();
    if (made) return made;
  }
  const style = promptId === "robot-then-tired" ? "robot" : promptId === "nt-tiptoe" ? "sneaky" : "natural";
  return (findTest(key) ?? findTest("walkTurnWalk")!).plan({ ...STUB_LOOK, style });
}

const pause = (ms: number, signal: AbortSignal) => new Promise<void>((resolve) => {
  const timer = setTimeout(resolve, ms);
  signal.addEventListener("abort", () => { clearTimeout(timer); resolve(); }, { once: true });
});

// The FAKE provider (no AI, no money): answers like Terra would, in Terra's JSON (planTo), with the ready-made plan,
// after a short wait so the page's stages can be seen. The real director code (direct.ts) runs on it: parse,
// check and repair, build, the engine's automatic checks.
function stubProvider(promptId: string, fps: number, signal: AbortSignal): Provider {
  return async () => {
    await pause(900, signal);
    const plan = { ...stubPlan(promptId), ...(promptId === "orig-8fps" ? { fps: 8 } : { fps }), ...(promptId === "orig-background-color" || promptId === "orig-spike" ? { canvasColor: "#9ca3af" } : {}) };
    const searched = STUB_SEARCHES[promptId];
    return {
      json: {
        reply: "Stub reply (no AI was called).",
        says: "First I'll set up the stick figure, then I'll make the moves, and finally I'll add the finishing touches — then your animation is ready. (STUB: no AI was called.)",
        plan: planTo(plan),
        edits: [],
      },
      usage: { inputTokens: 0, outputTokens: 0, cachedTokens: 0 },
      searches: searched ? [searched] : [],
    };
  };
}

// One prompt through the director. `stub` = the fake provider above; `terra` = the real Terra; `luna` = the real Luna
// (both paid). Terra and Luna get the SAME instructions, engine, checks and review — only the model differs.
async function runDirector(run: RunBody, onProgress: (p: BenchProgress) => void, signal: AbortSignal, maxUsd: number): Promise<BenchResult> {
  const request = { prompt: run.prompt, fps: run.fps, stageWidth: run.stageWidth, allowSearch: run.allowSearch, ...(run.previousPlan ? { previousPlan: run.previousPlan } : {}) };
  const model = run.provider === "stub" ? { provider: stubProvider(run.promptId, run.fps, signal) }
    : run.provider === "luna" ? { provider: lunaProvider, prices: LUNA_PRICES }
    : { provider: terraProvider, prices: TERRA_PRICES }; // (the director's default is Luna now; "terra" stays really Terra)
  return direct(request, { onProgress, signal, maxUsd, ...model });
}
// (Claude lost the blind test and is no longer run here; its old ratings stay in ratings.json.)
const providerOf = (value: unknown): BenchProvider => (value === "terra" || value === "luna" ? value : "stub");

type RunBody = { promptId: string; prompt: string; fps: number; stageWidth: number; previousPlan?: ScenePlan; allowSearch: boolean; provider: BenchProvider; runId: string };

function parseRun(body: Record<string, unknown>): RunBody | null {
  const promptId = typeof body.promptId === "string" ? body.promptId : "";
  const entry = findBenchPrompt(promptId);
  const prompt = typeof body.prompt === "string" && body.prompt.trim() ? body.prompt.trim().slice(0, 2000) : entry?.text ?? "";
  if (!prompt) return null;
  const fps = Number(body.fps), stageWidth = Number(body.stageWidth);
  const runId = typeof body.runId === "string" && body.runId ? body.runId.slice(0, 80) : "default";
  const previousPlan = body.previousPlan && typeof body.previousPlan === "object" ? (body.previousPlan as ScenePlan) : undefined;
  return {
    promptId: promptId || "custom", prompt,
    fps: Number.isFinite(fps) && fps >= 1 && fps <= 60 ? Math.round(fps) : 24,
    stageWidth: Number.isFinite(stageWidth) && stageWidth >= 400 && stageWidth <= 6000 ? stageWidth : 1920,
    ...(previousPlan ? { previousPlan } : {}),
    allowSearch: body.allowSearch === true,
    provider: providerOf(body.provider),
    runId,
  };
}

// One run at a time PER MODEL (Terra and Luna run side by side). `reserved` = the worst case of the paid prompts still
// running, counted as already spent so two at once can never pass the cap together.
const globalBench = globalThis as typeof globalThis & { diamondAnimatorBenchBusyBy?: Set<BenchProvider>; diamondAnimatorBenchReserved?: number };
const busyBy = () => (globalBench.diamondAnimatorBenchBusyBy ??= new Set<BenchProvider>());

export async function GET(request: Request) {
  if (!isDev()) return notFound();
  const access = await requireAccountRequest(request);
  if ("response" in access) return access.response;
  try {
    const [ledger, ratings] = await Promise.all([readLedger(), readRatings()]);
    return NextResponse.json({ ledger, ratings, budget: { runUsd: BENCH_RUN_BUDGET_USD, totalCapUsd: BENCH_TOTAL_CAP_USD } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "The bench records can't be read." }, { status: 503 });
  }
}

export async function POST(request: Request) {
  if (!isDev()) return notFound();
  const access = await requireAccountRequest(request);
  if ("response" in access) return access.response;
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Bench request JSON is invalid." }, { status: 400 });
  }

  // (Reviewers only: the page's picture sheet saved as a PNG under output/spec-0017/snapshots/, git-ignored, so the
  // results can be looked at even when the browser pane isn't on screen.)
  if (body.action === "snapshot") {
    const name = typeof body.name === "string" && /^[a-z0-9-]{1,60}$/.test(body.name) ? body.name : "";
    const png = typeof body.png === "string" && body.png.startsWith("data:image/png;base64,") && body.png.length < 8_000_000 ? body.png : "";
    if (!name || !png) return NextResponse.json({ error: "Bad snapshot." }, { status: 400 });
    const dir = path.join(OUT_DIR, "snapshots");
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, `${name}.png`), Buffer.from(png.slice("data:image/png;base64,".length), "base64"));
    return NextResponse.json({ ok: true });
  }

  if (body.action === "rate") {
    const promptId = typeof body.promptId === "string" ? body.promptId : "";
    const rating = body.rating;
    if (!findBenchPrompt(promptId) || (rating !== "good" && rating !== "ok" && rating !== "bad")) {
      return NextResponse.json({ error: "Unknown prompt or rating." }, { status: 400 });
    }
    await locked(RATINGS_FILE, async () => {
      const file = await readRatings();
      file.ratings.push({ promptId, rating: rating as BenchRating, at: new Date().toISOString(), provider: providerOf(body.provider), ...(typeof body.note === "string" && body.note ? { note: body.note.slice(0, 500) } : {}) });
      await writeJson(RATINGS_FILE, file);
    });
    return NextResponse.json({ ok: true });
  }

  const run = parseRun(body);
  if (!run) return NextResponse.json({ error: "Bench prompt is missing." }, { status: 400 });

  let ledger: SpendLedger;
  try {
    ledger = await readLedger();
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "The spending record can't be read." }, { status: 503 });
  }
  const paid = run.provider !== "stub";
  const reserved = globalBench.diamondAnimatorBenchReserved ?? 0;
  const spentThisRun = runSpent(ledger, run.runId);
  if (paid) {
    // (Refused BEFORE the cap: the prompt's worst case — the plan + one review, each at most $0.04 — must still fit,
    // on top of what the other model's running prompt could still spend.)
    const blocked = benchBudgetBlock(spentThisRun + reserved, ledger.totalUsd + reserved);
    if (blocked) return NextResponse.json({ error: blocked }, { status: 402 });
  }
  if (busyBy().has(run.provider)) return NextResponse.json({ error: "Another bench prompt is still running for this model. One at a time." }, { status: 409 });
  busyBy().add(run.provider);
  const reserve = paid ? BENCH_PROMPT_WORST_USD : 0;
  globalBench.diamondAnimatorBenchReserved = reserved + reserve;

  const encoder = new TextEncoder();
  const maxUsd = Math.max(0, Math.min(PER_REQUEST_MAX_USD, BENCH_RUN_BUDGET_USD - spentThisRun - reserved, BENCH_TOTAL_CAP_USD - ledger.totalUsd - reserved));
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (line: BenchLine) => {
        try { controller.enqueue(encoder.encode(`${JSON.stringify(line)}\n`)); } catch { /* the page went away */ }
      };
      try {
        const onProgress = (p: BenchProgress) => send({ type: "progress", ...p });
        const result: BenchResult = await runDirector(run, onProgress, request.signal, paid ? maxUsd : PER_REQUEST_MAX_USD);
        // Record every run (cost and time); the ledger total only grows by real money spent.
        // (A stub run spends nothing: its estimated cost — e.g. a fake search fee — is never added to the ledger.)
        const charged = paid ? result.costUsd : 0;
        const fresh = await locked(SPEND_FILE, async () => {
          const ledgerNow = await readLedger();
          ledgerNow.runs.push({
            at: new Date().toISOString(), runId: run.runId, promptId: run.promptId, provider: run.provider, ok: result.ok,
            costUsd: charged, ms: result.ms, repairs: result.ok ? result.repairs.length : 0, reviewed: result.ok ? result.reviewed : false,
          });
          ledgerNow.totalUsd = Math.round((ledgerNow.totalUsd + charged) * 1e6) / 1e6;
          await writeJson(SPEND_FILE, ledgerNow);
          return ledgerNow;
        });
        send({ type: "result", result, spend: { runUsd: runSpent(fresh, run.runId), totalUsd: fresh.totalUsd } });
      } catch (error) {
        send({ type: "error", message: error instanceof Error ? error.message : "The bench run failed." });
      } finally {
        busyBy().delete(run.provider);
        globalBench.diamondAnimatorBenchReserved = Math.max(0, (globalBench.diamondAnimatorBenchReserved ?? 0) - reserve);
        try { controller.close(); } catch { /* already closed */ }
      }
    },
  });
  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" } });
}
