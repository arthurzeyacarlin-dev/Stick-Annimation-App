import "server-only";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { getOpenAiClient } from "@/src/lib/openai/client";
import { createV1LunaTurnGenerator } from "@/src/lib/openai/generateV1LunaTurn";
import { createV1SonnetTurnGenerator } from "@/src/lib/anthropic/generateV1SonnetTurn";
import { recordUsageEvent } from "@/src/lib/usage-journal/usageJournalRuntime";
import { projectTerminalEvent } from "@/src/lib/usage-journal/usageJournalEvents";
import { withAccountUsageOwner } from "@/src/lib/account-usage/accountUsageStore";
import { createV1Animator, type ChildLike, type V1Animator, type V1Books, type V1LunaCall } from "./v1AnimatorCore";
import { v1EngineConfig, type V1EngineConfig } from "./v1EngineCli";
import { readEngineWords, readLunaBook, readSonnetBrain, readSonnetEffort, withSteps } from "./v1LunaBook";
import { createV1LunaDirectorAsk } from "@/src/lib/openai/generateV1LunaDirector";
import { nodeDirectorTool, planWithLuna, readDirectorBook, v1Director, type DirectorQuestion } from "./v1LunaDirector";
import type { V1DirectorStep } from "./v1AnimatorCore";
import { join, basename, dirname } from "node:path";
import { existsSync, readFileSync } from "node:fs";
import { accountAiCreditGate } from "@/src/lib/account/aiCredits";
import type { UsageEventRecorder } from "@/src/lib/usage-journal/usageJournalEvents";
import { createV1UsageMeter } from "./v1UsageMeter";
import { ownerAlert } from "@/src/lib/account/ownerAlerts";
import { startLineWaitWatch } from "@/src/lib/support/supportService";

// (Nov 25, many people at once) how many animations this machine makes at the same time: the server setting DIAMOND_ANIMATIONS_AT_ONCE
// (read at every start; 1 when unset). The Mac (8 GB) stays at 1; a bigger server raises it once one real job has been measured there.
const animationsAtOnce = () => { const n = Math.floor(Number(process.env.DIAMOND_ANIMATIONS_AT_ONCE)); return Number.isFinite(n) && n >= 1 ? n : 1; };
import { v1LiveReporter } from "./v1TurnLive";

// SERVER SIDE OF THE AI ANIMATOR VERSION 1 (helper B2, board/v1-single/PLAN_PARTB.md). Default OFF:
//   DIAMOND_V1_ANIMATOR=1   server switch (app/api/ai-animator/v1 answers 404 without it; the app is unchanged)
//   DIAMOND_ENGINE_ROOT     the engine folder; paths + Kimodo switch: see v1EngineCli.ts (dry / --cache-only unless DIAMOND_ENGINE_ALLOW_KIMODO=1)
// Luna = the app's EXISTING connection (getOpenAiClient, AI_ANIMATOR_MODEL) and the SAME usage journal calls as the AI Animator chat
// (dispatched + provider-observed in the generator, terminal here), under the account's usage owner. The engine children get none
// of the app's keys. The job runner itself is v1AnimatorCore.ts.
//   DIAMOND_V1_BRAIN=sonnet  the chat turn is written by Sonnet (generateV1SonnetTurn.ts, the same book + schema; booked in the shared
//                            Claude ledger; when the test budget is used up, Luna answers that turn instead); default luna = unchanged.

export const v1AnimatorServerEnabled = () => process.env.DIAMOND_V1_ANIMATOR === "1";

const books = (config: V1EngineConfig): V1Books => ({
  book: readLunaBook(config.lunaBook),
  words: readEngineWords(config.engineBook),
});

// (Nov 2, usage) a turn's "terminal" record is written only when its AI call was really dispatched: a budget-stopped / no-key turn
// (no call made) records nothing. The recorder notes each dispatched turn id; the terminal line takes it out again.
const dispatched = new Set<string>();
const recordAndNote: UsageEventRecorder = (event) => { if (event.stage === "dispatched") dispatched.add(event.operationRef); return recordUsageEvent(event); };
const recordTerminal = (event: Parameters<UsageEventRecorder>[0]) => { if (dispatched.delete(event.operationRef)) recordUsageEvent(event); };
const generateLuna = createV1LunaTurnGenerator(getOpenAiClient, recordAndNote);
const generateSonnet = createV1SonnetTurnGenerator({ recorder: recordAndNote });
const LUNA_DEADLINE_MS = 600_000;   // (Nov 14, Arthur: any length, any complexity - a long story's answer was cut off at 90 s) ten minutes: it only ends a call that hangs

const luna: V1LunaCall = (input) => withAccountUsageOwner(input.ownerId, async (): ReturnType<V1LunaCall> => {
  const config = v1EngineConfig();
  if (!config) return { ok: false, failure: "unreachable", detail: "no engine root" };
  const request = {
    jobId: randomUUID(), turnId: randomUUID(), projectId: input.projectId, message: input.message,
    recentConversation: input.recentConversation, current: input.current, checkerSaid: input.checkerSaid, lastAnswer: input.lastAnswer, playback: input.playback ?? null,
    canvas: input.canvas ?? null, // (Nov 2 final round) the user's drawing: Sonnet only
    sheet: input.sheet ?? null, // (Nov 2 night) the timeline contact sheet: Sonnet only
    animation: input.animation ?? null, // (Nov 13) the current animation as it was drawn: Sonnet only
    last: input.last ?? null, // (Nov 15 night, MEMORY) the animation's very last picture: Sonnet only
    lastMirrored: input.lastMirrored === true,
    effort: input.effort ?? null, // (Nov 2 final round) the chat's Effort button: Sonnet only (thinking budget from the book's "effort")
    ...(input.partSeconds ? { partSeconds: input.partSeconds } : {}), ...(input.backupMoves ? { backupMoves: input.backupMoves } : {}), // (Nov 9) handed on to Sonnet (edits)
  };
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), LUNA_DEADLINE_MS);
  try {
    const askLuna = () => generateLuna({ ...request, canvas: null, sheet: null, effort: null }, books(config), { signal: abort.signal }); // (Luna never gets the picture)
    // (Arthur, Nov 2: Sonnet ONLY, never Luna/OpenAI when the brain is sonnet - no silent fallback)
    // (Nov 2, PM test: a 1-minute story once came back in the wrong shape, the same words worked next time) a wrong-shape answer is asked
    // ONCE more on its own, so the user never sees "didn't come back in the right shape" for a one-off slip
    // (usage) each AI call is its own usage record: the one re-ask gets fresh ids, and the first ask is closed as failed
    let ids = { jobId: request.jobId, turnId: request.turnId };
    const live = v1LiveReporter();   // (Nov 17, Part 2) the panel watching this turn sees his words as he writes them (null = nobody watches: as before)
    const askSonnet = () => { live?.({ say: "" }); return generateSonnet({ ...request, ...ids }, { ...books(config), brain: readSonnetBrain(config.lunaBook, config.root), effort: readSonnetEffort(config.lunaBook) }, { signal: abort.signal, live }); };
    let out = config.brain === "sonnet" ? await askSonnet() : await askLuna();
    // (Nov 5, Arthur: "never an error unless the Wi-Fi is off") up to TWO more asks for a wrong-shape answer
    for (let again = 0; again < 2 && config.brain === "sonnet" && !out.ok && out.failure === "bad_answer" && !abort.signal.aborted; again += 1) {
      console.warn(`[v1 brain] bad_answer, asking once more: ${out.detail}`);
      try { recordTerminal(projectTerminalEvent({ ...ids, reasoningLevel: "low" as const, workspace: { projectId: input.projectId } }, "failed", Date.now())); } catch { /* best effort */ }
      ids = { jobId: randomUUID(), turnId: randomUUID() };
      out = await askSonnet();
    }
    // (Nov 4 PM12, YOUR STORY STAYS YOUR STORY) every word of the user's message must be in the AI's pieces (askedDetails): words left out =
    // asked ONCE more, told exactly which words; still left out = an honest failure, never a changed story sent to Kimodo
    if (config.brain === "sonnet" && !abort.signal.aborted) {
      out = await withSteps(out, request.current, books(config).book.kimodoSteps.stepsSay, async (said, lastAnswer) => {
        console.warn(`[v1 brain] motion edit without steps, asking once more`);
        ids = { jobId: randomUUID(), turnId: randomUUID() };
        live?.({ say: "" });
        return generateSonnet({ ...request, ...ids, checkerSaid: [said], lastAnswer }, { ...books(config), brain: readSonnetBrain(config.lunaBook, config.root), effort: readSonnetEffort(config.lunaBook) }, { signal: abort.signal, live });
      }) as typeof out;
      // (Nov 14, Arthur: "I don't want any guards ... checkers are dumb") the word-by-word check of Sonnet's answer and its hidden second ask are gone:
      // one ask per message. (The ask above stays: an edit of his moves that comes back without any steps cannot be made at all.)
    }
    const identity = { ...ids, reasoningLevel: "low" as const, workspace: { projectId: input.projectId } };
    try { recordTerminal(projectTerminalEvent(identity, out.ok ? "succeeded" : abort.signal.aborted ? "timeout" : "failed", Date.now())); } catch { /* best effort */ }
    if (!out.ok) console.warn(`[v1 brain] ${out.failure}: ${out.detail}`); // (Nov 2: a failed answer is never silent in the server log)
    // (Nov 13, live: "no stick figure" was on the card but never reached the engine) what a new animation's answer says about him is in the log
    else if (out.turn.intent === "create") console.info(`[v1 brain] new animation: noFigure=${out.turn.noFigure === true}, ${out.turn.kimodoSteps?.length ?? 0} step(s)`);
    return out.ok ? { ok: true, turn: out.turn, costUsd: out.usage?.estimatedCostUsd ?? null } : { ok: false, failure: out.failure, detail: out.detail };
  } finally {
    clearTimeout(timer);
  }
});

// THE ANIMATION DIRECTOR (Nov 2): DIAMOND_V1_DIRECTOR=luna|claude (default = luna-book.json director.default = luna).
// luna: every NEW block is planned by Luna through the app's own OpenAI connection (usage recorded like the chat turn, under the
// account's usage owner), checked by luna-director.mjs, cached by sentence; the engine reads the plans (--director-dir).
// claude: nothing here; the engine's own director.mjs plans as before.
const askDirector = createV1LunaDirectorAsk(getOpenAiClient, recordAndNote);
const director: V1DirectorStep = async (input) => {
  const dbook = readDirectorBook(input.config.lunaBook);
  if (v1Director(dbook) === "claude") return { ok: true, dir: null };
  const jobId = randomUUID();
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), dbook.deadlineMs);
  // one usage record per Luna ask (its own turn id: dispatched + provider-observed in the asker, terminal here)
  const ask = async (q: DirectorQuestion) => {
    const turnId = randomUUID();
    const out = await askDirector({ jobId, turnId, projectId: input.projectId, sentence: q.user.slice(0, 400) }, dbook, { signal: abort.signal })(q);
    try { recordTerminal(projectTerminalEvent({ jobId, turnId, reasoningLevel: "low" as const, workspace: { projectId: input.projectId } }, out.ok ? "succeeded" : abort.signal.aborted ? "timeout" : "failed", Date.now())); } catch { /* best effort */ }
    return out;
  };
  try {
    return await withAccountUsageOwner(input.ownerId, async () => {
      const out = await planWithLuna({
        plan: input.plan, prevDir: input.prevDir, outDir: join(input.versionDir, "director"), cacheDir: join(input.config.outDir, dbook.cacheFolder),
        allowNew: !input.config.cacheOnly, book: input.books.book, director: dbook, tool: nodeDirectorTool(input.config.root, dbook), ask,
      });
      return out.ok ? { ok: true as const, dir: out.dir } : out;
    });
  } finally { clearTimeout(timer); }
};

// (Nov 7, live: a stopped job kept running and held Kimodo) the engine runs in its own process group, so Stop / time-out stops ALL of it
const spawnEngine = (command: string, args: string[], options: { cwd: string; env: Record<string, string | undefined> }): ChildLike => {
  // (Nov 16, Arthur: "it only changes what is needed to be changed") a check AFTER the engine: the engine is started through
  // after_engine.py, which runs it exactly as before and, after a look change, keeps every original pixel except the recoloured thing.
  const after = args[0] && basename(args[0]) === "passed_engine.py" ? join(dirname(args[0]), "after_engine.py") : null;
  const child = spawn(command, after && existsSync(after) ? [after, ...args] : args, { cwd: options.cwd, env: options.env as NodeJS.ProcessEnv, stdio: ["ignore", "pipe", "pipe"], detached: true });
  const killOne = child.kill.bind(child);
  child.kill = (signal) => { try { return process.kill(-(child.pid ?? 0), signal), true; } catch { return killOne(signal); } };
  return child;
};

// (Nov 2, usage) the AI Dashboard meter: the Help Assistant's own credit gate + usage recorder, under the account's owner (v1UsageMeter.ts).
// The Claude director's spend = the shared Claude ledger named in the book (brains.sonnet.ledger) during the run, minus the chat brain's lines.
const usage = createV1UsageMeter({
  credits: accountAiCreditGate, recorder: recordUsageEvent, withOwner: withAccountUsageOwner, pricingVersion: "v1-engine-claude-ledger",
  readLedger: () => {
    const config = v1EngineConfig();
    if (!config) return { ledger: null, exceptWho: null };
    const brain = readSonnetBrain(config.lunaBook, config.root);
    return { ledger: existsSync(brain.ledger) ? JSON.parse(readFileSync(brain.ledger, "utf8")) : null, exceptWho: brain.ledgerWho };
  },
});

// one runner per server process (it survives hot reloads like the other AI job stores)
// (Nov 13, live: a no-figure animation failed twice - the runner had been created BEFORE the code change, and a runner that survives hot
// reloads keeps the code it was created with: the old plan builder, the old answer fields) a dev server that still runs the old AI Animator
// code SAYS SO in its log, once per code change. The runner itself is left alone (its running jobs and waiting cards live in it).
const LOADED = Date.now();   // (this file is evaluated again after every change to the AI Animator's code)
const g = globalThis as typeof globalThis & { diamondV1Animator?: V1Animator; diamondV1AnimatorCode?: number; diamondV1LineWatch?: boolean };
export const v1Animator = (): V1Animator => {
  // (Nov 14) a DEV server loads a change to the AI Animator's code by itself: as soon as nothing is being made and no card is waiting, the
  // runner is made again from the new code (everything it knows is on disk). While something runs it is left alone, and the log says so.
  if (g.diamondV1Animator && g.diamondV1AnimatorCode !== LOADED) {
    const old = g.diamondV1Animator as V1Animator & { idle?: () => boolean };
    if (old.idle ? old.idle() : true) { g.diamondV1Animator = undefined; console.info("[v1] the AI Animator's code changed: its runner is made again from the new code."); }
    else console.warn("[v1] the AI Animator's code changed while something is being made or a card is waiting: this server still runs the OLD code until that is done.");
  }
  if (!g.diamondV1Animator) { g.diamondV1Animator = createV1Animator({ config: () => v1EngineConfig(), books, luna, director, spawn: spawnEngine, usage, gate: true, ownerAlert, atOnce: animationsAtOnce }); g.diamondV1AnimatorCode = LOADED; }
  // (Nov 26, SPEC-0027) the owner hears when anyone waits more than 3 minutes in line (it only reads the line; see supportService.ts)
  if (!g.diamondV1LineWatch) { g.diamondV1LineWatch = true; startLineWaitWatch(() => g.diamondV1Animator?.lineWait?.()); }
  return g.diamondV1Animator;
};

// (Nov 17, Part 2) the panel's changing words while he thinks: the book's list (luna-book.json "thinking_words".words, so Arthur can add his
// own); no list in the book = these. A word that says he is ALMOST done is never shown while he thinks (nothing knows when that is).
const THINKING_WORDS = ["Thinking", "Noodling", "Cooking", "Stirring", "Sketching the shots"];
export function v1ThinkingWords(): string[] {
  try {
    const config = v1EngineConfig();
    const list = config ? (JSON.parse(readFileSync(config.lunaBook, "utf8")) as { thinking_words?: { words?: unknown } }).thinking_words?.words : null;
    const words = Array.isArray(list) ? list.filter((w): w is string => typeof w === "string" && w.trim() !== "" && w.length <= 40).map((w) => w.trim()) : [];
    return words.length ? words : THINKING_WORDS;
  } catch { return THINKING_WORDS; }
}
