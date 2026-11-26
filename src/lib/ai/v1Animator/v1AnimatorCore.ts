import { createHash, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { appendFileSync, cpSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync, statfsSync } from "node:fs";
import { join } from "node:path";
import { AI_ACTION_CREDITS, FREE_PLAN_CHANGES } from "../../account/plans.ts";
import { priceOf, storyLeftAfter, type V1Price } from "./v1Price.ts";
import type { EngineBlockResult } from "../engineBlocks/engineBlocksContract.ts";
import type {
  V1ActionCheck, V1AnimationSnapshot, V1BlockReport, V1EditOp, V1Fit, V1KeptPrevious, V1JobStatus, V1Look, V1LunaTurn, V1Plan, V1Report, V1SavedLine, V1Stage, V1StageCode, V1Style, V1Timing, V1Version, V1CanvasPicture, V1Block, V1KimodoStep, V1Progress,
} from "./v1AnimatorContract.ts";
import { engineArgs, engineEnv, lineSplitter, parseEngineLine, resolveEnginePath, type V1EngineConfig } from "./v1EngineCli.ts";
import { acceptV1Canvas, acceptV1Sheet, askFailedWords, serverWord, v1CanvasLimits, type EngineWords, type LunaBook, type V1Effort, type V1ViewerSay } from "./v1LunaBook.ts";
import { actionCount, actionPieces, askedForMore, retryWords, sizeVerdict, splitBySize } from "./v1EditSize.ts";

// THE V1 ANIMATOR'S JOB RUNNER (helper B2; SAME ENGINE rework helper T1, board/v1-single/CONTRACT_SAME_ENGINE.md). Pure of Next.js:
// everything outside (the engine process, Luna, the books) comes in as deps, so node --test drives it with fakes at $0.
//   animations per project, in memory + every version on disk: <outDir>/<projectId>/<animationId>/v<n>/
//   create -> Luna's blocks -> v<n>/input.plan.json (contract v1-blocks) -> passed_engine.py --out-dir v<n>
//             (STAGE lines -> version.stage, PROGRESS -> version.progress, RESULT -> report.json)
//   edit   -> Luna's ops applied HERE (applyV1Ops) to the base plan -> input.plan.json -> passed_engine.py --prev v<base>
//             (a block whose sentence + seed_bump are unchanged is the same folder: identical pictures, 0 Kimodo calls)
//   ops that cannot apply (no such block, ...) -> ONE Luna retry with the words, then an honest failure ($0, nothing spawned)
//   ERROR (exit 2) = the engine's plain words (director could not plan, budget, not V1) -> failed with those words; refused -> "refused"
//   (Nov 25) SEVERAL engine jobs side by side, up to deps.atOnce() (the machine's size); more wait in line and start by themselves.
//   Nobody is told "another animation is being made" any more: only HIS OWN animation that is being made says so.
//   Undo / Redo = move `current` between DONE versions (instant, $0, every output kept). Cancel kills the child.
// `current` = the version on the canvas; 0 = nothing made yet. A failed / refused / cancelled version never becomes current.

export type ChildLike = {
  stdout: { on(event: "data", listener: (chunk: Buffer | string) => void): unknown } | null;
  stderr: { on(event: "data", listener: (chunk: Buffer | string) => void): unknown } | null;
  on(event: "close", listener: (code: number | null, signal?: string | null) => void): unknown;
  on(event: "error", listener: (error: Error) => void): unknown;
  kill(signal?: NodeJS.Signals | number): boolean;
};
export type Spawner = (command: string, args: string[], options: { cwd: string; env: Record<string, string | undefined> }) => ChildLike;
export type Conversation = { role: "user" | "assistant"; content: string }[];
export type V1LunaCallInput = {
  ownerId: string;
  projectId: string;
  message: string;
  recentConversation: Conversation;
  current: V1Plan | null;
  checkerSaid: string[] | null;
  lastAnswer: unknown;
  playback?: { fps: number; engineFps: number; speed?: number } | null;
  partSeconds?: Record<string, number> | null; // (Nov 2 app round) each current part's seconds as made (report), for the edit length line
  backupMoves?: Record<string, number[]> | null; // (Nov 8 eve) each current part's moves (from 1) the backup animator (H3) drew
  canvas?: V1CanvasPicture | null; // (Nov 2 final round) the user's drawing, already checked against the book (acceptV1Canvas)
  sheet?: V1CanvasPicture | null; // (Nov 2 night) the contact sheet of the user's layers across the timeline (acceptV1Sheet)
  animation?: V1CanvasPicture | null; // (Nov 13) the current animation as it was really drawn (the engine's own sheet of its current version)
  last?: V1CanvasPicture | null; // (Nov 15 night, MEMORY) the very last picture of its current version
  lastMirrored?: boolean; // the animation is shown mirrored: that picture is given as the animator sees it
  effort?: V1Effort | null; // (Nov 2 final round) the chat's Effort button (auto / low / medium / high); absent = low (today's call)
};
export type V1LunaCall = (input: V1LunaCallInput) => Promise<{ ok: true; turn: V1LunaTurn; costUsd?: number | null; realCostUsd?: number | null } | { ok: false; failure: string; detail: string }>;   // (Nov 22) costUsd = what the answer really cost
export type V1Books = { book: LunaBook; words: EngineWords };
export type V1ViewerCall = (input: { ownerId: string; projectId: string; runId: string; sheetPath: string; words: string; moves: string[]; book: LunaBook; steps?: V1KimodoStep[] })
  => Promise<{ ok: true; showsRequest: boolean; missing: string; fixedSteps?: V1KimodoStep[] | null } | { ok: false; detail: string }>;
export type V1DirectorStep = (input: { ownerId: string; projectId: string; config: V1EngineConfig; books: V1Books; plan: V1Plan; prevDir: string | null; versionDir: string })
  => Promise<{ ok: true; dir: string | null } | { ok: false; words: string }>;
export type V1CoreDeps = {
  config: () => V1EngineConfig | null;
  books: (config: V1EngineConfig) => V1Books; // read fresh at every turn (throws when a book key is missing)
  luna: V1LunaCall;
  // (Nov 2) the animation director before the engine runs: Luna plans every NEW block (v1LunaDirector.ts). Absent / dir null =
  // the engine's own director (claude) as before. ok false = plain words, nothing made.
  director?: V1DirectorStep;
  spawn: Spawner;
  // (Nov 3 key 2) THE VIEWER: the same Sonnet looks at a made take's viewer sheet (report viewerSheet) + the user's own words + the planned moves.
  // Absent (or the book's viewer off) = exactly as before. Any failure = no verdict: the take is kept as it is (never blocked).
  viewer?: V1ViewerCall;
  // (Nov 11, Arthur: "cut off by this invisible thing") THE CLIP CHECK after each engine run (ltx-effects/v1k/whole_clips.py): true = a clip this run
  // bought ended with him leaving the animator's own picture and was kept up to his last whole picture -> the version is made once more
  // from the saved clips, before it is looked at or shown. Absent = exactly as before. Any failure = false: the version is kept as it is.
  wholeClips?: (input: { config: V1EngineConfig; versionDir: string; sinceMs: number }) => Promise<boolean>;
  now?: () => string;
  newId?: () => string;
  // (Nov 2, usage) the AI Dashboard's meter: the SAME credits + usage records as the Help Assistant (v1UsageMeter.ts). Absent = not metered.
  usage?: V1UsageHooks;
  gate?: boolean; // (Nov 11) true = a new animation waits at the gate card until confirm() (the app); absent = made at once (as before)
  // (Nov 25, many people at once) how many engine jobs may run at the same time on this machine (read at every start, so a server
  // setting can change it). Absent / below 1 = 1. Jobs over it wait in line (first come, first served) and start by themselves.
  atOnce?: () => number;
  ownerAlert?: (key: string, text: string) => void; // (Nov 22) tells Arthur (his in-app inbox, once a day per key): the animator's provider refused
};
// creditsShort: the account's plain words when it cannot pay `credits` now, with `held` credits already held by its running and
// waiting runs (null = it can); checked BEFORE the paid call. turnAnswered: one chat turn really answered (after the AI call).
// engineRun: one engine job ended (any status); `price` = the price its card showed, the only thing ever charged for it (v1Price.ts).
export type V1EngineRunEnd = { ownerId: string; projectId: string; runId: string; kind: "create" | "edit"; status: Exclude<V1JobStatus, "running">;
  report: V1Report | null; startedAtMs: number; finishedAtMs: number; price?: V1Price | null };
export type V1UsageHooks = {
  creditsShort?(ownerId: string, credits: number, held?: number, exceptPicture?: string | null, exceptProject?: string | null): string | null;   // (Nov 26) exceptPicture = the gate picture being animated
  turnAnswered?(input: { ownerId: string; projectId: string; turnId: string; costUsd?: number | null; realCostUsd?: number | null; free?: boolean }): void;   // (Nov 22) costUsd = what this answer costs the user (Nov 26: warm); realCostUsd = what we paid; free = planning included in the card's price
  engineRun?(run: V1EngineRunEnd): void;
  pictureCharge?(ownerId: string, runId: string, credits: number): void; // (Nov 22) a paid gate picture that was not animated
  pictureWaiting?(ownerId: string, pictureId: string, credits: number): void;
  planningSettled?(ownerId: string, projectId: string): void; // (dad, Nov 26) Animate: the project's free planning is covered by the card's price // (dad, Nov 26, money only) a paid gate picture waiting at its card; 0 = no longer waiting; "free" = replaced by a change: never charged, counted toward the limits
};

export type V1TurnRequest = { ownerId: string; projectId: string; animationId: string | null; message: string; recentConversation: Conversation; canvas?: unknown; projectFps?: number; page?: [number, number];
  sheet?: unknown; // (Nov 2 night) the contact sheet of the user's layers across the timeline (checked by acceptV1Sheet)
  ground?: boolean; // (Nov 2 final round) the panel found the user's ground line under where he will stand (v1PageFit.ts, $0 in the browser)
  queued?: boolean; // (Nov 20) the app's own "add the next part" turn of a long story: never saved as his chat line
  effort?: V1Effort | null }; // (Nov 2 final round) the chat's Effort button, as sent (the Sonnet brain resolves auto by the book's rule)
export type V1TurnOutcome =
  | { ok: true; turn: V1LunaTurn; animation: V1AnimationSnapshot | null; started: boolean; gate?: { credits: number; lines: string[]; exact?: string[]; notDrawn: string[]; colour: string | null; picture?: "first" | "new"; freeChangesLeft?: number; edit?: boolean } }   // (Nov 22) exact = the animator's own words, when the lines are the briefs
  | { ok: false; status: number; error: string };
export type V1ActionOutcome =
  | { ok: true; animation: V1AnimationSnapshot }
  | { ok: false; status: number; error: string };

const WHOLE_PASSES = 3; // (Nov 11) the most re-makes the clip check may ask for in one job (each one cuts at least one clip back)
// (the only words not in a book: said when the engine folder - which holds the books - is not on this computer at all)
const NO_ENGINE = "The animation engine is not set up on this computer, so nothing can be made here.";

type Animation = {
  animationId: string; projectId: string; ownerId: string; dir: string; versions: V1Version[]; current: number;
  fps: number | null; layerId: string | null; layerCount: number | null;
  speed?: number | null; // (Nov 2) op speed: how fast it plays (null = 1, as made)
  fit?: V1Fit | null; // (Nov 2) FIXED GROUND LINE: the first done version's page fit (V1AnimationSnapshot.fit)
};
// (Nov 2) the inkBox a version is fitted to the page with: the animation's FIRST fit (mirrored with the take when this version is the
// other way round), so every version keeps his feet on the same line and spot. No fit yet = the version's own box.
// (Nov 2 night, attack 1) exact = a version whose MOTION differs from the fit version (an edit / add): the first fit EXACTLY (no union
// widening), so the kept start of an edited take never moves or shrinks on his canvas.
export function fitInkBox(fit: V1Fit | null | undefined, report: Pick<V1Report, "inkBox" | "stage">, mirror: boolean, exact = false): [number, number, number, number] | null {
  if (!fit) return report.inkBox ?? null;
  const [x0, y0, x1, y1] = fit.inkBox, w = report.stage[0];
  const base: [number, number, number, number] = fit.mirror === mirror || !(w > 0) ? [x0, y0, x1, y1] : [w - x1, y0, w - x0, y1];
  // (Nov 2, PM test: "twice as big" went off the top of the page) a version that moves OUTSIDE the first box is fitted with both boxes
  // together, so all of its motion stays on the page; inside the first box = the first fit, unchanged
  const own = report.inkBox;
  if (exact || !own || (own[0] >= base[0] && own[1] >= base[1] && own[2] <= base[2] && own[3] <= base[3])) return base;
  return [Math.min(base[0], own[0]), Math.min(base[1], own[1]), Math.max(base[2], own[2]), Math.max(base[3], own[3])];
}
type Job = {
  anim: Animation;
  version: V1Version;
  kind: "create" | "edit";
  config: V1EngineConfig;
  books: V1Books;
  message: string;
  recentConversation: Conversation;
  basePlan: V1Plan | null; // edit: the plan the ops apply to
  prevDir: string | null; // edit: the base version's folder when it was made (--prev)
  remakeAll?: boolean; // (Nov 22, Arthur: small tweaks came out jittery) a short animation's motion edit: the WHOLE animation made again from the same first picture (no --prev)
  retried: boolean;
  steps?: V1KimodoStep[] | null; // (Nov 4 PM12) an edit's new Kimodo steps (the WHOLE animation, as the AI wrote them)
  askedS?: number | null; // (Nov 2 night) the asked seconds (create), for the engine's time limit (book make_s_*)
  parts?: V1KimodoStep[][]; // (Nov 17, PLAN_FINAL_NOV17) a story over 15 s: the steps of each part still to make, in order - each is made, when this job is done, as "add the next part" (an edit that adds steps at the end: kimodo/wan.py longer)
  runId?: string; // (usage) this engine job's own id (credits + usage records)
  whole?: { passes: number; sinceMs: number }; // (Nov 11) the clip check's own re-makes of this job, and when the last one started
  startedAtMs?: number; // (usage) when the job started (the director's Claude calls are counted from here)
  expect?: { guess: number; seconds: number }; // (Nov 22) how long this job is expected to take (the progress bar)
  part?: [number, number]; // (Nov 22) a long story: this part, of how many
  // (Nov 3 key 2) the viewer's re-try under way: the take kept if the new one cannot be made, what the viewer said was missing,
  // the re-tries made, and the Kimodo calls of the takes before (metered with the run; the user is charged ONCE, for the job)
  viewer?: { kept: { report: V1Report; plan: V1Plan; dir: string | undefined }; missing: string; tries: number; calls: number };
  price?: V1Price; // (Nov 20, money) what this job is charged when it is done: its card's price (a long story: this part's share)
  storyLeft?: number; // (Nov 20, money) a long story's later parts share what is left of the ONE price its first card showed
  storyPart?: V1KimodoStep[]; // (Nov 20) a story's next-part job: the steps of THIS part (kept with the rest when it fails, so one press makes them)
};
type Running = { job: Job; child: ChildLike | null; timer: ReturnType<typeof setTimeout> | null };

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const readJson = (path: string): unknown => JSON.parse(readFileSync(path, "utf8"));
const writeJson = (path: string, value: unknown) => writeFileSync(path, JSON.stringify(value, null, 1));
const safeSegment = (value: string) => value.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 128) || "_";
const lastLines = (tail: string, n = 3) => tail.trim().split("\n").map((l) => l.trim()).filter(Boolean).slice(-n).join(" ").slice(0, 600);
const V1_PIECE_BYTES = 16 * 1024 * 1024; // one piece of a version's pictures on its way to the canvas (currentResult)
const dataUrl = (file: string) => `data:image/png;base64,${readFileSync(file).toString("base64")}`;
const nameOf = (id: string) => id.charAt(0).toUpperCase() + id.slice(1);
const VIEWER_DIR = /^v\d+-viewer\d+$/; // (Nov 3 key 2) the only folder names a version may be made in besides v<n>

// ---- request body (the route's input), bounded like /api/ai-animator
export const V1_MAX_MESSAGE = 12000;   // (Nov 14, any length: a long story told in one message)
export function normalizeV1Conversation(value: unknown): Conversation | null {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.length > 12) return null;
  const out: Conversation = [];
  let characters = 0;
  for (const item of value) {
    if (!isRecord(item) || (item.role !== "user" && item.role !== "assistant") || typeof item.content !== "string") return null;
    const content = item.content.trim();
    if (!content || content.length > 24_000) return null;
    characters += content.length;
    if (characters > 72_000) return null;
    out.push({ role: item.role, content });
  }
  return out;
}

// (Nov 2, Arthur) An engine label "not in V1, not drawn: X (no objects in V1)" / "not drawn: X" becomes the book's friendly
// line (server_words.not_drawn_label, {words} = X): the user can draw X on its own layer. "not in V1" is never shown.
const NOT_DRAWN = /^\s*(?:not in v1\s*[,;:-]?\s*)?not drawn\s*:\s*(.+?)\s*$/i;
export function friendlyV1Label(label: string, sentence: string): string {
  const m = NOT_DRAWN.exec(label);
  if (!m) return label;
  const thing = m[1].replace(/\s*\([^)]*\)\s*$/, "").replace(/[.\s]+$/, "").trim();
  if (!thing) return label;
  const words = thing.charAt(0).toUpperCase() + thing.slice(1);
  return sentence.replace(/\{words\}/g, words);
}
// (Nov 2, PM) A part Kimodo did not make: the engine's inner words ("[kimodo_scene] ...") are never shown - the book's plain line
// (server_words.part_limit when the test call limit refused it, else part_not_made). A book without those keys = the label as before.
const PART_NOT_MADE = /could not make this part/i, CALL_LIMIT = /CALL CAP/;
export function friendlyPartLabel(label: string, book: LunaBook): string {
  if (!PART_NOT_MADE.test(label)) return label;
  return book.serverWords[CALL_LIMIT.test(label) ? "part_limit" : "part_not_made"] ?? label;
}
export function friendlyV1Report(report: V1Report, book: LunaBook): V1Report {
  const line = book.serverWords.not_drawn_label;
  // (Nov 2 night) "X isn't drawn" is said once in the AI's reply, never repeated under the part (the user may have drawn it already)
  const fix = (labels: string[]) => labels.filter((l) => !NOT_DRAWN.test(l)).map((l) => friendlyPartLabel(line ? friendlyV1Label(l, line) : l, book));
  // (Nov 2) the engine's own action checks in plain words; a try that came out worse (kept_previous) = the book's honest offer
  // (Nov 2 night, Arthur's review: the card listed "whole part - the check saw it" x3) only what went WRONG is said; passed checks stay quiet
  const checkWords = (checks: V1ActionCheck[] | undefined) => (checks ?? []).filter((c) => c.pass === false).map((c) => serverWord(book, "check_not_seen", { action: c.action }));
  return {
    ...report, labels: fix(report.labels),
    blocks: report.blocks.map((b) => ({ ...b, labels: fix(b.labels), ...(b.checks?.length ? { checkWords: checkWords(b.checks) } : {}) })),
    ...(report.keptPrevious ? { keptPreviousSay: serverWord(book, "kept_previous") } : {}),
  };
}

// ---- report.json -> V1Report (the engine's camelCase report; an unreadable one is an honest failure, never a guess)
export function normalizeV1Report(raw: unknown): V1Report | null {
  if (!isRecord(raw) || typeof raw.ok !== "boolean") return null;
  const strings = (v: unknown) => (Array.isArray(v) ? v.filter((s): s is string => typeof s === "string") : []);
  const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);
  const blocks: V1BlockReport[] = (Array.isArray(raw.blocks) ? raw.blocks : []).filter(isRecord).map((b) => ({
    id: String(b.id ?? ""), sentence: String(b.sentence ?? ""), made: b.made === "same" || b.made === "edited" ? b.made : "new", frames: num(b.frames), labels: strings(b.labels),
    firstFrame: num(b.firstFrame), lengthS: num(b.lengthS), moves: strings(b.moves), seedBump: num(b.seedBump), redrawn: b.redrawn === true, kimodoCalls: num(b.kimodoCalls),
    ...(Array.isArray(b.checks) ? { checks: readChecks(b.checks) } : {}),
    // (Nov 2 night) EDIT BY MOVE: the engine honoured edit_from_beat + where each beat starts (block pictures); absent = whole block re-made
    ...(Number.isSafeInteger(Number(b.editFromBeat ?? b.edit_from_beat)) && (b.editFromBeat ?? b.edit_from_beat) !== null ? { editFromBeat: Number(b.editFromBeat ?? b.edit_from_beat) } : {}),
    ...(Array.isArray(b.beatStarts ?? b.beat_starts) ? { beatStarts: ((b.beatStarts ?? b.beat_starts) as unknown[]).map(Number).filter((n) => Number.isSafeInteger(n) && n >= 0) } : {}),
    ...(Array.isArray(b.backup) ? { backup: (b.backup as unknown[]).filter((r): r is unknown[] => Array.isArray(r) && r.length === 2).map((r) => [num(r[0]), num(r[1])] as [number, number]) } : {}),
  }));
  const kept = isRecord(raw.kept_previous) ? raw.kept_previous : isRecord(raw.keptPrevious) ? raw.keptPrevious : null;
  const keptPrevious: V1KeptPrevious | null = kept && typeof kept.block === "string" && kept.block ? { block: kept.block, why: typeof kept.why === "string" ? kept.why : "" } : null;
  const fr = isRecord(raw.frames) ? raw.frames : {};
  const fps = Number(raw.fps), stage = Array.isArray(raw.stage) ? raw.stage.map(Number) : [];
  const refused = typeof raw.refused === "string" && raw.refused.trim() ? raw.refused.trim() : null;
  if (raw.ok && (!(fps > 0) || stage.length !== 2 || !stage.every((s) => s > 0) || typeof raw.layersDir !== "string" || !raw.layersDir)) return null;
  return {
    ok: raw.ok, refused, blocks, ...(typeof raw.mirror === "boolean" ? { mirror: raw.mirror } : {}), labels: strings(raw.labels), frames: { edited: num(fr.edited), added: num(fr.added), deleted: num(fr.deleted) },
    lengthS: num(raw.lengthS), kimodoCalls: num(raw.kimodoCalls),
    fps: fps > 0 ? fps : 0, stage: stage.length === 2 ? [stage[0], stage[1]] : [0, 0],
    layersDir: typeof raw.layersDir === "string" ? raw.layersDir : "", video: typeof raw.video === "string" && raw.video ? raw.video : null,
    ...(typeof raw.viewerSheet === "string" && raw.viewerSheet ? { viewerSheet: raw.viewerSheet } : {}), // (Nov 3 key 2) the moves' peak pictures
    ...(Number(raw.size) > 0 ? { size: Number(raw.size) } : {}),
    ...(keptPrevious ? { keptPrevious } : {}),
    inkBox: Array.isArray(raw.inkBox) && raw.inkBox.length === 4 && raw.inkBox.every((v) => Number.isFinite(Number(v))) ? (raw.inkBox.map(Number) as [number, number, number, number]) : null,
    ...(Array.isArray(raw.moments) ? { moments: (raw.moments as unknown[]).filter(isRecord).map((m) => ({ frame: Number(m.frame), x: Number(m.x), y: Number(m.y) })).filter((m) => [m.frame, m.x, m.y].every(Number.isFinite)) } : {}),
  };
}

// (Nov 2) report blocks[].checks [{action, sign, value, pass}] (passed_engine.py); an unreadable row is left out, never guessed
function readChecks(raw: unknown[]): V1ActionCheck[] {
  return raw.filter(isRecord).filter((c) => typeof c.action === "string" && c.action.trim() && typeof c.pass === "boolean").map((c) => ({
    action: String(c.action).trim(), sign: typeof c.sign === "string" ? c.sign : "", value: Number.isFinite(Number(c.value)) && c.value !== null ? Number(c.value) : null, pass: c.pass === true,
  }));
}

// (Nov 2) SEPARATE ACTIONS -> SEPARATE PARTS (server guard): a block sentence the AI split into 2+ separate actions (its structured
// `parts`) becomes one block per action, in order. Meaning is the AI's (no word lists here); no parts = the sentence as it is.
export const splitSentences = (b: { sentence: string; parts?: string[] }): string[] => (b.parts && b.parts.length >= 2 ? b.parts.map((p) => p.trim()).filter(Boolean) : [b.sentence.trim()]);

export function stepBlocks(steps: V1KimodoStep[], _book?: LunaBook): V1Block[] {
  // (Nov 13, Arthur: ONE operation, any length, never a cut) an animation is ONE part however long it is: the engine carries on clip after
  // clip from its own last pictures inside the part (kimodo/wan.py chain / edit). Parts were the Kimodo-era takes; two parts would each
  // start from the standing start picture.
  return steps.length ? [{ id: "b1", sentence: steps.map((x) => x.text).join(" "), seed_bump: 0, steps }] : [];
}
// (Nov 4 PM12, YOUR STORY STAYS YOUR STORY) an edit's steps: a step the AI did NOT mark changed is the OLD step exactly (words + seconds): the
// old step with the same words, else the old step at the same place. Only the asked steps can differ; nothing else drifts.
export function keepUnchanged(next: V1KimodoStep[], old: V1KimodoStep[]): V1KimodoStep[] {
  if (!old.length) return next;
  // (Nov 4 PM12, stress test: 3 identical "runs forward" steps got the FIRST one's seconds) the same words at the SAME place first
  // (Nov 15, the chain-of-edits test in the app: "before he throws it he bounces the ball" - the AI wrote bounce (marked) + pass (NOT marked,
  // new words) + the three old steps; the pass got "the old step at the same place" = the catch, so the plan read catch, catch and the next
  // edit replaced the real catch) "the same place" is counted BETWEEN THE KEPT STEPS AROUND IT (the steps whose words are an old step's
  // words, in order): as many steps there as before = the old step at its place, as always; a step added or taken away there = the
  // step is the AI's own (a new move). With no step added or removed this is exactly the rule as it was.
  const n = next.length, m = old.length, L = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0)), of = new Array<number>(n).fill(-1);
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) L[i][j] = next[i].text === old[j].text ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  for (let i = 0, j = 0; i < n && j < m;) { if (next[i].text === old[j].text) of[i++] = j++; else if (L[i + 1][j] >= L[i][j + 1]) i++; else j++; }
  const place = (i: number) => {   // the old step at the same place between the kept steps around step i, or null
    let a = i, b = i; while (a > 0 && of[a - 1] < 0) a--; while (b < n - 1 && of[b + 1] < 0) b++;
    const o0 = a > 0 ? of[a - 1] + 1 : 0, o1 = b < n - 1 ? of[b + 1] : m;
    return o1 - o0 === b - a + 1 ? old[o0 + i - a] : null;
  };
  return next.map((s, i) => s.changed === true ? s : of[i] >= 0 ? old[of[i]] : old.find((o) => o.text === s.text) ?? place(i) ?? s);
}
// (Nov 15, Arthur's own test: "I want TV Man Titan to do a backflip" = 593 of his 623 pictures deleted - the AI's re-typed copy of the animation
// held only the new step and the new animation was built from that copy. "No more rewrites ... we build on top of it, then we change it")
// AN EDIT NAMES ONLY THE CHANGE: the AI lists only the steps it changes (step = the saved step's number) or adds (after = the saved step it
// follows, 0 = the start) and the numbers it takes out. The new list is THE SAVED STEPS with exactly that put in: a step it did not name is
// the saved step itself - its words, its seconds - so the engine sees the same step and keeps its pictures. Nothing is checked or asked
// again: a number that is no saved step (or nothing left) cannot be applied, and that is said plainly.
export function applyStepEdits(saved: V1KimodoStep[], named: V1KimodoStep[], remove: number[] = []): V1KimodoStep[] | { error: string } {
  const n = saved.length, bad = (k: number, lo: number) => !Number.isInteger(k) || k < lo || k > n;
  if (named.some((s) => bad(s.step ?? 0, 0) || bad(s.after ?? 0, 0)) || remove.some((k) => bad(k, 1))) return { error: "step_number" };
  const clean = ({ step: _step, after: _after, ...s }: V1KimodoStep): V1KimodoStep => ({ ...s, changed: true });
  const added = (k: number) => named.filter((s) => !(s.step ?? 0) && (s.after ?? 0) === k).map(clean);
  const out: V1KimodoStep[] = added(0);
  saved.forEach((old, i) => {
    const mine = named.filter((s) => s.step === i + 1);
    // (Nov 19 eve, Arthur: "whatever I want changed gets changed, nothing else" - measured on all 25 saved edits: every step re-made that
    // nobody asked for came from a colour turn, where the AI re-typed the words of the steps it listed) THE SAVED ANIMATION IS THE TRUTH:
    // a step listed only for a COLOUR is the saved step, every field as saved, plus that colour - whatever the AI typed for it, so the
    // engine sees the same move and keeps its pictures. The same step listed again without a look = its MOVE changes (the AI's words),
    // and the colour stays on it. A step listed with no look whose words and seconds are the saved ones is the saved step. Any other
    // look (a hat, a design, a size, more than one colour) is drawn by H3: that step is made again with the look in its words, never
    // redrawn by a second AI.
    const looksAsked = [...new Set(mine.map((s) => s.look).filter((l) => isColourLook(l)).flatMap(lookParts))];   // (Nov 20) every look asked for this step, none dropped
    const colourLook = looksAsked.length ? looksAsked.join(" / ") : undefined;
    // (a step whose MOVE changes carries only the named-thing colour form: the app puts it on its new pictures afterwards. The swap form
    // on a moved step would make the engine read the step as a look only and skip the move - its new words already say the colour.)
    const moveLook = looksAsked.filter((p) => isNamedThingLook(p)).join(" / ") || undefined;
    const moves = mine.filter((s) => !s.look || !isColourLook(s.look));
    const secondsOf = (s: V1KimodoStep) => (Number(s.seconds) > 0 ? s.seconds : old.seconds);
    if (mine.length && !moves.length) out.push({ ...old, look: colourLook, changed: true });
    else if (moves.length) out.push(...moves.map((s) => {
      if (s.look) {   // a look that is not a colour: H3 makes this step again with it in the words
        const { look: other, ...rest } = clean(s); const typed = String(rest.text ?? "").trim();
        const words = typed && typed !== old.text.trim() ? typed : `${old.text.trim()} ${String(other).trim()}`;
        return { ...rest, text: words, seconds: secondsOf(s), ...(moveLook ? { look: moveLook } : {}) };
      }
      if (String(s.text ?? "").trim() === old.text.trim() && Number(secondsOf(s)) === Number(old.seconds)) return colourLook ? { ...old, look: colourLook, changed: true } : { ...old, changed: false };
      return { ...clean(s), seconds: secondsOf(s), ...(moveLook ? { look: moveLook } : {}) };
    }));
    else if (!remove.includes(i + 1)) out.push({ ...old, changed: false });
    out.push(...added(i + 1));
  });
  return out.length ? out : { error: "nothing_left" };
}
// (Nov 19 eve) a look the app puts on pixels: "colour #old to #new" (his own or a thing's colour, the free swap) or "the <thing> is <colour>
// (#hex)" (one named thing, the selection tool's marks). Everything else is drawn by H3.
// (Nov 20, Arthur: "it only does an appearance rewrite of that one thing, never the motion") the other looks the app puts on the pictures
// without animating: "from the <thing> remove <what>", "remove the <thing>", "redraw / reshape the <thing>: <new look>" (after_engine.py)
const NAMED_THING_COLOUR = /^\s*(?:the\s+)?(.+?)\s+(?:is|are)\s+[^()#]*\(\s*#[0-9a-f]{6}\s*\)(?:\s*,?\s*instead\s+of\s+[^()#]*\(\s*#[0-9a-f]{6}\s*\))?\s*\.?\s*$/i;   // (Nov 20) "... instead of <its colour now> (#hex)" (after_engine EXACT)
const PICTURE_LOOKS = [NAMED_THING_COLOUR, /^\s*from\s+(?:the\s+)?(.+?)\s+remove\s+(.+?)\s*\.?\s*$/i, /^\s*remove\s+(?:the\s+)?(.+?)\s*\.?\s*$/i,
  /^\s*(redraw|reshape)\s+(?:the\s+)?(.+?)\s*:\s*(.+?)\s*\.?\s*$/i];
// (Nov 20, Fable: "remove his face and make the shovel rusty" puts two looks on the same steps) a step may carry several looks, joined " / "
const lookParts = (look: unknown): string[] => (typeof look === "string" ? look.split(" / ").map((p) => p.trim()).filter(Boolean) : []);
const isNamedThingLook = (look: unknown): boolean => lookParts(look).length > 0 && lookParts(look).every((p) => PICTURE_LOOKS.some((form) => form.test(p)));
// (Nov 20, money) which AI puts a picture look on: a colour swap is free; a named thing's colour or a removal is the selector only ("fill");
// a redraw / reshape is H3's edit mode + the selector ("redraw"). The price follows it (v1Price.ts).
export const lookKindOf = (part: string): "swap" | "fill" | "redraw" =>
  /^\s*(redraw|reshape)\s/i.test(part) ? "redraw" : /^\s*colou?r\s+#[0-9a-f]{6}\s+to\s+#[0-9a-f]{6}\s*\.?\s*$/i.test(part) ? "swap" : "fill";
export const isColourLook = (look: unknown): boolean => lookParts(look).length > 0
  && lookParts(look).every((p) => /^\s*colou?r\s+#[0-9a-f]{6}\s+to\s+#[0-9a-f]{6}\s*\.?\s*$/i.test(p) || PICTURE_LOOKS.some((form) => form.test(p)));
// What the card says about an edit, COUNTED BY THE APP from the saved steps (never the AI's words): what each changed step was, what is
// taken out, and how many steps are not touched. A look-only edit has its own line (gateLines).
export function editTruthLines(saved: V1KimodoStep[], named: V1KimodoStep[], remove: number[] = []): string[] {
  const changed = [...new Set(named.filter((s) => (s.step ?? 0) > 0 && !s.look).map((s) => s.step!))].filter((k) => saved[k - 1]), out = remove.filter((k) => saved[k - 1] && !changed.includes(k));
  if (!changed.length && !out.length && !named.some((s) => !(s.step ?? 0))) return [];
  const kept = saved.length - changed.length - out.length;
  return [...changed.map((k) => `Step ${k} changes. It was: ${saved[k - 1].text.trim()}`), ...out.map((k) => `Step ${k} is taken out: ${saved[k - 1].text.trim()}`),
    kept === saved.length ? `All ${kept} steps you have stay exactly as they are.` : `The other ${kept} of your ${saved.length} steps stay exactly as they are.`];
}
// (Nov 9, Arthur: "he does whatever I say" - and only that) an edit's step that none of the user's words point at (askedDetails, 1 = first) is
// the old step exactly: words, seconds, animator (live: the AI re-timed 2 s moves nobody named to 2.5 s). A new total length asked
// (requestedSeconds) keeps the AI's seconds. The old step of a new step: the same place (no move added or removed), else the same words at the
// same place counted from the start or from the end (a move added or removed between); none = the AI's step (a new move).
export function namedOnly(next: V1KimodoStep[], old: V1KimodoStep[], asked: { step: number }[] | null | undefined, newLength = false): V1KimodoStep[] {
  if (!old.length) return next;
  const named = new Set((asked ?? []).map((d) => d.step - 1)), d = old.length - next.length;
  const oldOf = (s: V1KimodoStep, i: number) => !d ? old[i] : old[i]?.text === s.text ? old[i] : old[i + d]?.text === s.text ? old[i + d] : null;
  return next.map((s, i) => {
    const o = named.has(i) ? null : oldOf(s, i);
    return !o ? s : newLength ? { ...o, seconds: s.seconds, changed: s.seconds !== o.seconds } : { ...o, changed: false };
  });
}
// (Nov 4 PM12, Arthur: "make it again" gave back the same old video) motion asked again with EXACTLY the same steps as the version it edits =
// a fresh try: every such block gets the next seed (a new Kimodo take), never the saved one
export function againIsFresh(blocks: V1Block[], base: V1Plan): V1Block[] {
  const key = (b: V1Block) => JSON.stringify((b.steps ?? []).map((s) => [s.text, s.seconds, s.travels]));
  return blocks.map((b) => { const old = base.blocks.find((o) => o.steps?.length && key(o) === key(b)); return old ? { ...b, seed_bump: old.seed_bump + 1 } : b; });
}
// (Nov 8, Arthur: "an edit re-makes only what changed") EDIT KEEPS PARTS: every part of the edited version BEFORE the first changed step is
// kept exactly as it was (same id, words, seed, steps), so the engine keeps its pictures ($0) and joins the new parts on with its continuation
// pin (the same join long new animations use); the steps from the first changed part on become new parts. The very same steps again =
// "make it again" (againIsFresh, as before). Nothing before the change to keep = every part new (as before).
export function editBlocks(steps: V1KimodoStep[], base: V1Plan, book: LunaBook, h3End?: Record<string, number>): V1Block[] {
  const key = (s: V1KimodoStep) => JSON.stringify({ ...s, changed: undefined });
  const old = base.blocks.flatMap((b) => b.steps ?? []);
  if (steps.length === old.length && steps.every((s, i) => key(s) === key(old[i]))) return againIsFresh(stepBlocks(steps, book), base);
  const kept: V1Block[] = [];
  let at = 0;
  for (const b of base.blocks) {
    const bs = b.steps ?? [], next = steps.slice(at, at + bs.length);
    // (a step is the same when its CONTENT is: the `changed` mark is not used - every step of a new animation carries changed: true, live)
    if (!bs.length || next.length < bs.length || next.some((s, i) => key(s) !== key(bs[i]))) break;
    const { edit_from_beat: _drop, ...same } = b; kept.push(same); at += bs.length;
  }
  // (Nov 8, live) a part that ENDS on the backup animator's drawing (H3 drew to its end) cannot have new moves joined to it (the join is to
  // Kimodo's unseen end: he jumped). h3End = such parts -> the move its last H3 stretch starts at (read from the made pictures; absent = any
  // part with an H3 step from that move). It is kept up to that move and made again from it, so it ends on Kimodo's picture; from move 1 =
  // the whole part is made again with the new moves (as before)
  const last = kept[kept.length - 1], lastSteps = last?.steps ?? [];
  const w = !last || at >= steps.length ? -1 : h3End ? (h3End[last.id] ?? -1) : lastSteps.findIndex((s) => s.wan);
  if (last && w >= 1) kept[kept.length - 1] = { ...last, edit_from_beat: w, seed_bump: last.seed_bump + 1 };
  else if (last && w === 0) at -= kept.pop()!.steps!.length;
  // (Nov 8 eve, Arthur: "an edit changes only what I asked, even inside one part") EDIT FROM A MOVE: the first part that changes keeps its
  // id + seed and is marked edit_from_beat k (its first changed step), so the engine keeps its pictures before move k ($0, byte-identical) and
  // makes only move k on, pinned to them. Its own steps change by the edit's step count; anything after it becomes new parts (as before).
  const part = base.blocks[kept.length], ps = part?.steps ?? [];
  const k = ps.findIndex((s, i) => !steps[at + i] || key(s) !== key(steps[at + i]));
  const mine = steps.slice(at, at + ps.length + steps.length - old.length);
  // (Nov 9 Fable) the FIRST move changed (k 0) is an edit from a move too when the part still ENDS with the same move (there are kept moves after
  // it to join to: the engine keeps his first picture and the moves after the change); the first AND last move changed = the whole part new (as before)
  const sameEnd = ps.length > 1 && mine.length > 1 && key(ps[ps.length - 1]) === key(mine[mine.length - 1]);
  const fromMove = part && (k >= 1 || (k === 0 && sameEnd)) && mine.length >= k && mine.reduce((t, s) => t + s.seconds, 0) <= book.longScenes.stepsTakeMaxS
    ? { ...part, sentence: mine.map((s) => s.text).join(" "), steps: mine, edit_from_beat: k } : null;
  if (fromMove) {   // (asked timing stays only on the kept moves, as a rewrite does)
    const timing = (part.timing ?? []).filter((t) => t.move < k);
    if (timing.length) fromMove.timing = timing; else delete fromMove.timing;
    kept.push(fromMove); at += mine.length;
  }
  const top = Math.max(0, ...base.blocks.map((b) => Number(/^b(\d+)$/.exec(b.id)?.[1] ?? 0)));
  const made = kept.length ? [...kept, ...stepBlocks(steps.slice(at), book).map((b, i) => ({ ...b, id: `b${top + 1 + i}` }))] : stepBlocks(steps, book);
  // (Nov 8 eve) the engine knows an old part by its words + seed: a part whose steps changed but whose words did not (only a length / travels
  // change, "make the backflip slower") would be kept as the old pictures and the edit lost -> it gets the next seed, so it is made
  // (Nov 15, live on his 27-second fight: "make the blue stick figure red" with every step's words kept = the same words, another look ->
  // the next seed -> the engine was told "redo it all" and bought the whole fight again, $1.55 before it was stopped) A LOOK is never a new
  // take: steps that differ ONLY in their look keep the seed, and the engine redraws their pictures (kimodo/wan.py relook)
  // (Nov 19, Arthur: "make the potion blue" re-animated a step and "make the excavator green" bought the whole animation again - the AI had
  // typed `before` / `travels` again on the steps it gave the look) A STEP THAT GETS A LOOK WITH THE SAME WORDS AND SECONDS IS THE SAME MOVE,
  // whatever else was typed again on it: it never makes the part "the next take"
  const stepKey = (b: V1Block, look = true) => JSON.stringify((b.steps ?? []).map((s) => key(look ? s : { ...s, look: undefined })));
  const sameMoves = (o: V1Block, b: V1Block) => { const os = o.steps ?? [], bs = b.steps ?? []; return os.length === bs.length && bs.every((s, i) => (s.look && s.text === os[i].text && s.seconds === os[i].seconds) || key({ ...s, look: undefined }) === key({ ...os[i], look: undefined })); };
  return made.map((b) => { const twin = base.blocks.find((o) => o.sentence === b.sentence && o.seed_bump === b.seed_bump && stepKey(o) !== stepKey(b) && !sameMoves(o, b)); return twin ? { ...b, seed_bump: twin.seed_bump + 1 } : b; });
}
// (Nov 8 night) the parts of a made version that END on the backup animator's drawing: part id -> the move its last H3 stretch starts at
// (its manifest's kept H3 stretch with no hand-back, placed by the report's move starts). Read from the pictures that were really made.
export function h3EndOf(prevDir: string | null, report: V1Report | null | undefined): Record<string, number> {
  const out: Record<string, number> = {};
  if (!prevDir || !report) return out;
  for (const b of report.blocks) {
    try {
      const d = join(prevDir, "blocks", b.id), sub = existsSync(join(d, "suf")) ? join(d, "suf") : d;
      const lay = readdirSync(sub).find((f) => f.endsWith("-layers") && existsSync(join(sub, f, "manifest.json")));
      if (!lay) continue;
      // (Nov 11, Arthur: "next part" cut to a standing figure) an animation that is ONE part made by H3 alone ends on H3's drawing, from its first
      // move. Every H3-only clip carries joined_at, so the test below never saw it (0 of 63 saved edits) and added moves became a new part.
      if (report.blocks.length === 1 && (readJson(join(sub, lay, "manifest.json")) as { h3_only?: boolean }).h3_only === true) { out[b.id] = 0; continue; }
      const segs = ((readJson(join(sub, lay, "manifest.json")) as { wan?: { kept?: boolean; joined_at?: number | null; pictures?: number[] }[] }).wan ?? [])
        .filter((w) => w.kept && Array.isArray(w.pictures) && w.joined_at == null);
      if (!segs.length) continue;
      const st = b.beatStarts ?? [], off = sub === d ? b.firstFrame : st[b.editFromBeat ?? 0] ?? b.firstFrame, n = off + Number(segs[segs.length - 1].pictures![0]);
      out[b.id] = st.reduce((k, s, i) => (s <= n ? i : k), 0);
    } catch { /* a part without readable pictures: as before */ }
  }
  return out;
}
// (Nov 8 eve, live: "slow the punch + redo only the 2nd backflip" came back with the SAME steps, so the whole take was made again and the slow
// motion lost) the same steps: a move named again with its old words (rewrite + beat k) = redo ONLY that move (its part kept before move k,
// made again from k with the next seed); "redo" / a part rewritten without a move = that part made again (the next seed, as before);
// nothing named again = a look / timing edit: the plan with its ops as they are ($0 re-draw). Changed steps = editBlocks (the parts decide).
export function stepsEdit(steps: V1KimodoStep[], applied: V1Plan, base: V1Plan, ops: V1EditOp[], book: LunaBook, h3End?: Record<string, number>): V1Plan {
  const key = (s: V1KimodoStep) => JSON.stringify({ ...s, changed: undefined }), old = base.blocks.flatMap((b) => b.steps ?? []);
  if (steps.length !== old.length || steps.some((s, i) => key(s) !== key(old[i]))) return { ...applied, blocks: editBlocks(steps, base, book, h3End) };
  const again = new Map<string, number>();
  for (const o of ops) if ((o.op === "rewrite" || o.op === "redo") && "block" in o) again.set(o.block, o.op === "rewrite" && typeof o.beat === "number" && o.beat > 1 ? o.beat : 1);
  return { ...applied, blocks: applied.blocks.map((b) => {
    const k = again.get(b.id), o = base.blocks.find((x) => x.id === b.id);
    if (!k || !o || b.sentence !== o.sentence) return b;
    return k > 1 && (o.steps?.length ?? 0) >= k ? { ...b, edit_from_beat: k - 1, seed_bump: o.seed_bump + 1 } : { ...b, seed_bump: o.seed_bump + 1 };
  }) };
}
// a part's asked slow motion / holds (the edit's timing ops) stay on that part when the steps re-pack the parts (moves past its end dropped)
// (Nov 10 editing, Arthur: an edit changes ONLY what he asked) a kept move keeps its asked hold / slow motion, found by its words (a move added
// or changed before it shifts its number); a move he changed, or one he asked new timing for, is never given the old timing
export function keepTiming(plan: V1Plan, base: V1Plan): V1Plan {
  return { ...plan, blocks: plan.blocks.map((b) => {
    const o = base.blocks.find((x) => x.id === b.id), steps = b.steps ?? [], os = o?.steps ?? [];
    if (!o?.timing?.length || !steps.length) return b;
    const t = [...(b.timing ?? [])];
    for (const x of o.timing) {
      const text = os[x.move]?.text, i = text === undefined ? -1 : steps.findIndex((s) => s.text === text);
      if (i >= 0 && !t.some((y) => y.move === i)) t.push({ ...x, move: i });
    }
    return t.length ? { ...b, timing: t } : b;
  }) };
}
export function withAskedTiming(plan: V1Plan, applied: V1Plan, base: V1Plan): V1Plan {
  return { ...plan, blocks: plan.blocks.map((b) => {
    const a = applied.blocks.find((x) => x.id === b.id), o = base.blocks.find((x) => x.id === b.id);
    if (!a || JSON.stringify(a.timing ?? null) === JSON.stringify(o?.timing ?? null)) return b;
    const t = (a.timing ?? []).filter((x) => x.move < (b.steps?.length ?? Infinity));
    const { timing: _old, ...rest } = b; return t.length ? { ...rest, timing: t } : rest;
  }) };
}
export function oneTakeSentences(turn: Pick<V1LunaTurn, "blocks" | "requestedSeconds">, book: LunaBook): string[] {
  const ls = book.longScenes, blocks = turn.blocks ?? [];
  const actions = blocks.flatMap(splitSentences).filter(Boolean);
  if (!actions.length) return [];
  // (Nov 4 KIMODO V1) every move now gets its real time (about 3.5 s), so the number of moves can need another take too: at most
  // one_take_max_beats moves / one_take_max_s seconds per take = the longest takes measured smooth (15.8 s dance, 17.5 s jacks)
  const byMoves = Math.ceil(actions.length / ls.oneTakeMaxBeats);
  const takes = Math.min(actions.length, Math.max(1, byMoves, Math.ceil((turn.requestedSeconds ?? 0) / ls.oneTakeMaxS)));
  if (takes <= 1) return [blocks.map((b) => b.sentence.trim()).filter(Boolean).join(" ")];
  return Array.from({ length: takes }, (_, t) => actions.slice(Math.round((t * actions.length) / takes), Math.round(((t + 1) * actions.length) / takes)).join(" "));
}
// (Nov 2 night) LONG / EXPENSIVE GUIDE: the making time the server expects (book long_scenes make_s_base + make_s_per_asked_s x asked seconds;
// no length said = the takes x block_seconds). Measured from the app's own call log (see the book's _make_s).
export const askedSecondsOf = (turn: Pick<V1LunaTurn, "blocks" | "requestedSeconds">, book: LunaBook) => turn.requestedSeconds ?? oneTakeSentences(turn, book).length * book.longScenes.blockSeconds;
export const planSeconds = (plan: V1Plan) => plan.blocks.reduce((t, b) => t + (b.steps ?? []).reduce((u, s) => u + s.seconds, 0), 0);   // the animation's own length: its steps' seconds
export const makeSecondsOf = (askedS: number, book: LunaBook) => book.longScenes.makeSBase + book.longScenes.makeSPerAskedS * askedS;

// ---- Luna's create -> the first plan (book default colour + look; ids b1, b2, ...)
// (Nov 3 final part A, Arthur: "I tell Sonnet, Sonnet tells Kimodo; an edit = the same animation again, more detailed on what I wanted
// different") the planner sees the user's OWN words (the chat's user lines, newest last) and, on an edit, the previous version's own Kimodo
// instructions (its director plans' beat bodies, in order) + the change
const userWords = (message: string, recent: Conversation) => [...recent.filter((l) => l.role === "user").map((l) => l.content), message].slice(-4).join(" / ");   // (Nov 13: never cut by letters - a cut at 1,200 took the END, his newest words)
// (Nov 11, Arthur's parkour story -> H3 juggled: the 1200-character cut above kept the OLDEST words and dropped his newest request, so the
// animator read only "I like your animation,") a NEW animation keeps the newest message (what he means) whole; only older words are trimmed
const makeWords = (message: string, recent: Conversation) => {
  const older = recent.filter((l) => l.role === "user").map((l) => l.content).slice(-3).join(" / ");
  const room = Math.max(0, 1200 - message.length - 3);
  return room > 0 && older ? `${older.slice(-room)} / ${message}` : message;
};
function prevInstructions(prevDir: string | null): string {
  if (!prevDir) return "";
  try {
    const lines: string[] = [];
    for (const b of readdirSync(join(prevDir, "blocks")).sort()) {
      const walk = (d: string): string[] => readdirSync(d, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? walk(join(d, e.name)) : e.name.endsWith(".director.json") && !e.name.endsWith(".from.director.json") ? [join(d, e.name)] : []);
      for (const f of walk(join(prevDir, "blocks", b)).sort()) {
        const plan = (JSON.parse(readFileSync(f, "utf8")) as { plan?: { beats?: { move?: string; everyone?: { body?: string }[] }[] } }).plan;
        for (const beat of plan?.beats ?? []) lines.push(`- ${beat.everyone?.[0]?.body || beat.move || ""}`);
      }
    }
    return lines.filter((l) => l.length > 2).join("\n").slice(0, 2000);
  } catch { return ""; }
}

// (Nov 14, live in the app: "make the soccer ball blue" asked again after a try that failed came back as a whole NEW animation - a
// different run, a different goal - and the look editor's finished work was thrown away.) A try that failed used to move the part's
// seed_bump on (Nov 3, for the animator of that time, whose failed take stayed in its cache). To the one animator of today a higher
// seed_bump means "REDO THIS PART: animate all of it again", so asking again after a failure re-made the whole part instead of making
// the edit. A failed try leaves nothing behind that could be shown again (a clip that did not come is never kept), so the same request
// is simply made again, as asked: only the user's own "redo" moves seed_bump.

// (Nov 3 PART A) camera "still" only when the user's own message asks for it (book camera.still_words); no message known = as the AI said
export function planFromCreate(turn: V1LunaTurn, book: LunaBook, words: EngineWords, message?: string): V1Plan | null {
  if (!turn.blocks?.length) return null;
  const look = (words.looks as string[]).includes(book.defaultLook) ? (book.defaultLook as V1Look) : null;
  if (!look) return null;
  // (Nov 2) the size words of the request ("a really tiny stick figure") and part colours ride on the FIRST plan, so they are never lost
  const z = words.size;
  const size = typeof turn.size === "number" && turn.size >= z.min && turn.size <= z.max && Math.abs(turn.size - z.normal) > 1e-6 ? turn.size : null;
  const parts = turn.partColours && Object.keys(turn.partColours).length ? { ...turn.partColours } : null;
  const style = turn.style ? cleanStyle(turn.style) : null;
  const free = book.h3Free?.on === true;   // (Nov 18, Arthur: nobody guides H3) no mirror, no first-picture orders; its camera and cuts are its own, so a later edit is told the camera does what the words say
  return {
    contract: "v1-blocks", colour: turn.colour?.trim() || book.defaultColour, look, mirror: !free && turn.leftward === true, // (Nov 2 final) direction asked at create = the $0 mirror
    ...(size !== null ? { size } : {}), ...(parts ? { partColours: parts } : {}), ...(style ? { style } : {}),
    ...(typeof turn.requestedSeconds === "number" && turn.requestedSeconds > 0 ? { asked_s: Math.min(turn.requestedSeconds, book.longScenes.oneTakeMaxS) } : {}), // (Nov 3) the user's length is the law
    ...(turn.noFigure === true ? { noFigure: true as const } : {}),
    ...(free || turn.cameraMoves === true ? { cameraMoves: true as const } : {}),   // (Nov 17, Arthur: "H3 is the camera")
    ...(!free && turn.scene ? { scene: turn.scene } : {}), ...(!free && turn.room === "big" ? { room: "big" as const } : {}), ...(!free && (turn.start === "left" || turn.start === "right") ? { start: turn.start } : {}),   // (Nov 14) the first picture: room for a tall thing, and where he starts   // (Nov 13) things alone: the page is fitted by everything that moves, never by a first picture that is empty
    ...(turn.camera === "follow" || turn.noFigure === true || (turn.camera !== "still" && (turn.kimodoSteps ?? []).some((st) => st.travels)) ? {} : { camera: "still" as const }),   // (Nov 11 big test: parkour ran out of a still picture) he travels and nobody asked for a still camera -> it follows // (Nov 11, Arthur: the camera follows ONLY when needed) a new animation's camera is still unless Sonnet, by meaning, says it must follow
    blocks: turn.kimodoSteps?.length ? stepBlocks(turn.kimodoSteps, book) : oneTakeSentences(turn, book).map((sentence, i) => ({ id: `b${i + 1}`, sentence, seed_bump: 0 })), // (Nov 4 PM12) the AI's own steps, else (Nov 2 night) ONE take
  };
}

// (Nov 2) a style with only the keys that differ from the plain drawing (hollowHead true, a glow, a pen that is not "normal"); nothing left = null
export function cleanStyle(s: V1Style): V1Style | null {
  const out: V1Style = {};
  if (s.hollowHead === true) out.hollowHead = true;
  if (s.glow) out.glow = { ...(s.glow.colour?.trim() ? { colour: s.glow.colour.trim() } : {}), ...(s.glow.strength ? { strength: s.glow.strength } : {}) };
  if (s.pen && s.pen !== "normal") out.pen = s.pen;
  for (const q of ["headScale", "penScale", "opacity"] as const) { const v = s[q]; if (typeof v === "number" && Math.round(v * 100) !== 100) out[q] = Math.round(v * 100) / 100; }
  // (Nov 5) any look: outline rings (width 0 = none), a thickness / see-through per part (1 = plain, dropped), a head shape (circle = plain)
  const rings = (s.outlines ?? []).filter((o) => o.width !== 0); if (rings.length) out.outlines = rings;
  for (const q of ["partThick", "partOpacity"] as const) {
    const pd = Object.fromEntries(Object.entries(s[q] ?? {}).filter(([, v]) => typeof v === "number" && Math.round(v * 100) !== 100).map(([p, v]) => [p, Math.round((v as number) * 100) / 100]));
    if (Object.keys(pd).length) out[q] = pd;
  }
  if (s.headShape && s.headShape !== "circle") out.headShape = s.headShape;
  return Object.keys(out).length ? out : null;
}

// ---- Luna's edit ops -> the new plan, in order (pure). Every block the ops do not name stays EXACTLY as it was (same id, words, seed).
// A new block's id is b<k> with k one past the highest number ever used in the plan (never reused). -> { plan } or { error: plain words }.
// (Nov 2 app round) guard = EDITS KEEP SIZE (book edit.size_guard, server side): given = the user's message + whether the AI was re-asked already.
// A rewrite piece with more than max_beats actions AND more than the block had: asked for more (or the AI insisted after its one re-ask) -> the extra
// actions become new parts right after it; else -> { error: the book's retry words } (the caller re-asks the AI ONCE). Absent = no guard (as before).
export function applyV1Ops(base: V1Plan, ops: V1EditOp[], book: LunaBook, words: EngineWords, guard?: { message: string; retried: boolean }): { plan: V1Plan } | { error: string } {
  const plan: V1Plan = structuredClone(base);
  for (const b of plan.blocks) delete b.edit_from_beat; // (Nov 2 night) a move edit belongs only to the version that made it
  const find = (id: string) => plan.blocks.findIndex((b) => b.id === id);
  const nextId = () => `b${1 + Math.max(0, ...plan.blocks.map((b) => Number(/^b(\d+)$/.exec(b.id)?.[1] ?? 0)))}`;
  for (const op of ops) {
    if ("block" in op && find(op.block) < 0) return { error: serverWord(book, "op_no_block", { block: op.block }) };
    switch (op.op) {
      case "rewrite": {
        const s = op.sentence.trim(); if (!s) return { error: serverWord(book, "op_bad_sentence") };
        // (Nov 2) the AI split the new words into separate actions: the block takes the first, new blocks right after it take the rest
        let pieces = splitSentences({ sentence: s, parts: op.parts });
        const at = find(op.block), b = plan.blocks[at];
        if (guard) {
          const g = book.editSize, before = actionCount(b.sentence, g), out: string[] = [];
          for (const piece of pieces) {
            const v = sizeVerdict(piece, before, g);
            if (!v) { out.push(piece); continue; }
            if (!askedForMore(guard.message, g) && !guard.retried) return { error: retryWords(book, { block: op.block, before, after: v.after }) };
            out.push(...splitBySize(piece, v.keep, g));
          }
          pieces = out;
        }
        const [first, ...rest] = pieces;
        // (Nov 2 night) EDIT BY MOVE: beat k (1-based) of the block's frozen beats changes -> the take is re-made from that beat on, every
        // beat before it is kept (edit_from_beat, 0-based). Beat 1 / no frozen beats = the whole block re-made (as before).
        const beat = op.beat;
        if (beat !== undefined && b.beats?.length && !(Number.isSafeInteger(beat) && beat >= 1 && beat <= b.beats.length)) return { error: serverWord(book, "op_no_beat", { block: op.block, beat: String(beat) }) };
        // (Nov 7, edit test: "make the hook bigger" came back with EVERY move reworded, so the jab, cross and duck were made again) one move
        // named (beat) = only that move takes the new words; every other move keeps its old words exactly, so the kept moves stay picture for picture
        const moves = (t: string) => t.split(/(?<=[.!?])\s+(?=[A-Z])/).map((m) => m.trim()).filter(Boolean);
        const olds = moves(b.sentence), news = moves(first);
        const named = beat !== undefined && olds.length === news.length && beat >= 1 && beat <= news.length ? olds.map((m, i) => (i === beat - 1 ? news[i] : m)).join(" ") : first;
        if (b.sentence !== named) {
          b.sentence = named; b.seed_bump = 0;
          if (beat !== undefined && beat > 1 && b.beats?.length) b.edit_from_beat = beat - 1; else delete b.beats;
          // (Nov 3 FINAL V2) asked timing stays only on the moves kept as they were (before the changed move); the rest is made new
          const keepBelow = b.edit_from_beat ?? 0, kept = (b.timing ?? []).filter((t) => t.move < keepBelow);
          if (kept.length) b.timing = kept; else delete b.timing;
        }
        plan.blocks.splice(at + 1, 0, ...rest.map((sentence) => ({ id: "", sentence, seed_bump: 0 })));
        for (const nb of plan.blocks) if (!nb.id) nb.id = nextId();
        break;
      }
      case "append": { const s = op.sentence.trim(); if (!s) return { error: serverWord(book, "op_bad_sentence") }; plan.blocks.push({ id: nextId(), sentence: s, seed_bump: 0 }); break; }
      case "delete": if (plan.blocks.length <= 1) return { error: serverWord(book, "op_last_block") }; plan.blocks.splice(find(op.block), 1); break;
      case "redo": plan.blocks[find(op.block)].seed_bump += 1; break;
      case "colour": { const c = op.colour.trim(); if (!c) return { error: serverWord(book, "op_bad_colour") }; plan.colour = c; delete plan.partColours; break; }
      case "partColours": {
        const named = Object.entries(op.partColours ?? {}).filter(([, c]) => typeof c === "string" && c.trim());
        if (!named.length) { delete plan.partColours; break; }   // (Nov 5) no part colours left = one colour again
        plan.partColours = Object.fromEntries(named.map(([p, c]) => [p, (c as string).trim()]));   // (Nov 5) the COMPLETE set of part colours
        break;
      }
      case "style": {   // (Nov 5, live: "remove the red outline" failed again and again - an add-on edit could not take things away) the op is
        // the COMPLETE new look: whatever it leaves out is gone
        const c = cleanStyle(op.style ?? {}); if (c) plan.style = c; else delete plan.style;
        break;
      }
      case "mirror": plan.mirror = !plan.mirror; break;
      case "look": if (!(words.looks as string[]).includes(op.look)) return { error: serverWord(book, "op_bad_look", { look: op.look }) }; plan.look = op.look; break;
      case "size": {
        const z = words.size;
        if (!(op.size >= z.min && op.size <= z.max)) return { error: serverWord(book, "op_bad_size", { lo: z.min, hi: z.max }) };
        if (Math.abs(op.size - z.normal) < 1e-6) delete plan.size; else plan.size = op.size;
        break;
      }
      case "fps": break; // (playback only: the turn handles it, $0, no engine run)
      case "speed": break; // (playback only, the same way: the panel re-times the placed pictures)
      case "timing": {   // (Nov 3 FINAL V2) slow motion / pose holds of ONE move, $0: the engine re-draws the same take on its timemap
        const b = plan.blocks[find(op.block)], move = op.beat - 1;
        if (!Number.isSafeInteger(op.beat) || op.beat < 1 || (b.beats?.length && op.beat > b.beats.length)) return { error: serverWord(book, "op_no_beat", { block: op.block, beat: String(op.beat) }) };
        // (Nov 10 editing, Arthur: an edit changes ONLY what he asked) a new speed keeps the move's hold, a new hold keeps its speed
        const old = (b.timing ?? []).find((x) => x.move === move);
        const reset = op.hold === "none" && (op.factor == null || op.factor === 1);   // ("back to normal": both go)
        const t: V1Timing = { move, ...(old?.factor && op.factor !== 1 && !reset ? { factor: old.factor } : {}), ...(old?.hold && op.hold !== "none" ? { hold: old.hold, ...(old.seconds ? { seconds: old.seconds } : {}) } : {}) };
        if (op.from != null && op.from > 0 && op.from < 1) t.from = op.from;
        if (op.to != null && op.to > 0 && op.to < 1) t.to = op.to;
        if (op.hold === "keys" || op.hold === "every") t.hold = op.hold;
        else if (op.hold === "still" && op.seconds) { t.hold = "still"; t.seconds = op.seconds; }   // (Nov 8 night) "hold the flex longer": the peak pose held
        else if (op.factor != null && op.factor > 0 && op.factor !== 1 && op.factor <= 4) t.factor = Math.round(op.factor * 100) / 100;   // (Nov 10) under 1 = slower, over 1 = faster
        const rest = (b.timing ?? []).filter((x) => x.move !== move), next = t.hold || t.factor ? [...rest, t].sort((x, y) => x.move - y.move) : rest;
        if (next.length) b.timing = next; else delete b.timing;
        break;
      }
      case "clear": break; // (the panel clears the canvas: the turn handles it, $0, no engine run)
      case "camera": if (op.camera === "still") plan.camera = "still"; else delete plan.camera; break; // (Nov 2 final round; follow = the default)
    }
  }
  if (base.size !== undefined && Math.abs(base.size - words.size.normal) < 1e-6 && plan.size === base.size) delete plan.size;
  // (Nov 3 one-take round, Arthur: "an edit = delete the whole animation and make it again") the edited plan is ONE block holding every move in
  // order: a changed motion is one fresh whole take (no part kept, no splice, no seam); an edit that changes no words keeps the same take (re-draw)
  if (book.longScenes.oneTakeAlways) {
    for (const b of plan.blocks) delete b.edit_from_beat;
    // (Nov 4 KIMODO V1) one whole take only while it fits one take (one_take_max_beats moves); longer = its parts, each made again from its words
    const moves = plan.blocks.reduce((n, b) => n + Math.max(1, b.beats?.length ?? 0), 0);   // (each block's frozen beats = its moves)
    if (plan.blocks.length > 1 && moves <= book.longScenes.oneTakeMaxBeats) plan.blocks = [{ id: plan.blocks[0].id, sentence: plan.blocks.map((b) => b.sentence.trim()).filter(Boolean).join(" "), seed_bump: Math.max(...plan.blocks.map((b) => b.seed_bump)) }];
  }
  const bare = structuredClone(base); for (const b of bare.blocks) delete b.edit_from_beat;
  if (JSON.stringify(plan) === JSON.stringify(bare)) return { error: serverWord(book, "op_same") };
  return { plan };
}
const readFit = (v: unknown): V1Fit | null => (isRecord(v) && Array.isArray(v.inkBox) && v.inkBox.length === 4 && v.inkBox.every((n) => Number.isFinite(Number(n)))
  ? { inkBox: v.inkBox.map(Number) as V1Fit["inkBox"], mirror: v.mirror === true } : null);
const isV1Plan = (v: unknown): v is V1Plan => isRecord(v) && v.contract === "v1-blocks" && Array.isArray(v.blocks) && typeof v.colour === "string";

// ---- (Nov 2) PLAN FIRST + honest length (book long_scenes + server_words plan_* / length_*)
export function isStory(turn: V1LunaTurn, book: LunaBook): boolean {
  const ls = book.longScenes;
  return (turn.requestedSeconds ?? 0) > ls.blockSeconds + ls.toleranceSeconds || (turn.storyPlan?.parts.length ?? 0) > 1;
}

// (Nov 2 app round) ONE honest length line: every sentence of say that gives the animation's length (a number + a book unit + a book length word,
// book long_scenes.length_sentence) is taken out first, so the server's line is the only length said (no "about 10 seconds in all" + "2 parts of
// about 10 seconds each"). A sentence about how long a MOVE lasts ("he holds the point for 2 seconds") has no length word and stays.
export function stripLengths(say: string, book: LunaBook): string {
  const { units, words } = book.lengthSentence;
  const esc = (w: string) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const unit = new RegExp(`\\d\\s*(?:-\\s*)?(?:${units.map(esc).join("|")})(?![A-Za-z])|(?<![A-Za-z])(?:${units.filter((u) => u.length > 2 && u.endsWith("s")).map(esc).join("|")})(?![A-Za-z])`, "i");
  const word = new RegExp(`(?<![A-Za-z])(?:${words.map(esc).join("|")})(?![A-Za-z])`, "i");
  // (Nov 10) line by line, so a headline and bullets keep their own lines (a plain paragraph is one line: the same as before)
  return say.split(/\n\s*\n/).map((para) => para.split("\n").map((ln) => ln.split(/(?<=[.!?])[ \t]+/).filter((t) => !(unit.test(t) && word.test(t))).join(" ").trim())
    .filter((ln) => ln && !/^(?:[-*•]|#{1,6})$/.test(ln)).join("\n")).filter(Boolean).join("\n\n");
}
// (Nov 10) a reply with bullets gets the server's length line as one more bullet; a plain reply as before (the same paragraph)
const withLine = (say: string, line: string) => (!say ? line : /(^|\n)\s*[-*•]\s/.test(say) ? `${say}\n- ${line}` : `${say} ${line}`);
// every create say tells the part's length; asked below the shortest block = said plainly (the number is the book's)
export function honestLength(turn: V1LunaTurn, book: LunaBook): string {
  const ls = book.longScenes, asked = turn.requestedSeconds ?? null, say = stripLengths(turn.say, book);
  if (asked !== null && asked < ls.minSeconds) return withLine(say, serverWord(book, "length_floor", { asked, seconds: ls.minSeconds }));
  // (Nov 2) separate actions = separate parts: said as that many parts (+ the total only when the user / the plan gave one)
  // (Nov 2 night) the takes really made (one take holds several actions); (Nov 4 PM12, live: "made in 2 parts" for ONE piece) the chat AI's
  // Kimodo steps are made by stepBlocks, so its pieces are counted the same way
  const parts = turn.kimodoSteps?.length ? stepBlocks(turn.kimodoSteps, book).length : oneTakeSentences(turn, book).length;
  if (parts > 1) {
    const total = Math.round(asked ?? turn.storyPlan?.parts.reduce((t, p) => t + p.seconds, 0) ?? 0);
    return withLine(say, total > 0 ? serverWord(book, "length_parts_total", { n: parts, total }) : serverWord(book, "length_parts", { n: parts, seconds: ls.blockSeconds }));
  }
  const seconds = Math.round(asked !== null && asked <= ls.blockSeconds + ls.toleranceSeconds ? asked : (turn.storyPlan?.parts[0]?.seconds ?? ls.blockSeconds));
  return withLine(say, serverWord(book, "length_said", { seconds }));
}
// (Nov 2 app round) the edit's ONE length line: a rewritten part keeps its length as made (the report), a part that grows past the guard says
// its extra actions go in a new part, an appended part is about one block. No rewrite / append = the say as it is.
export function editLength(say: string, ops: V1EditOp[], base: V1Plan, partSeconds: Record<string, number>, message: string, book: LunaBook): string {
  const lines: string[] = [], g = book.editSize;
  for (const op of ops) {
    if (op.op === "rewrite") {
      const i = base.blocks.findIndex((b) => b.id === op.block), sec = partSeconds[op.block];
      if (i < 0 || !(sec > 0)) continue;
      const grows = splitSentences({ sentence: op.sentence, parts: op.parts }).some((p) => sizeVerdict(p, actionCount(base.blocks[i].sentence, g), g)) && askedForMore(message, g);
      // (Nov 2 night, PM) never a guessed length: a re-made part's real length is only known when it is made (a 'stays about 11 s' came out
      // 14.3 s); the split note (extra actions -> a new part) is not a length guess and stays
      lines.push(serverWord(book, grows ? "edit_length_split" : "edit_length_kept", { i: i + 1, seconds: Math.round(sec) }));
    } else if (op.op === "append") lines.push(serverWord(book, "edit_length_new", { seconds: book.longScenes.blockSeconds }));
  }
  return lines.length ? withLine(stripLengths(say, book), lines.join(" ")) : say;
}

// (Nov 22, Arthur) a short animation = at most this long and this many steps: a change to its moves makes it again whole (editPlanFor)
const REMAKE_ALL_MAX_S = 15, REMAKE_ALL_MAX_STEPS = 10;
const REMAKE_ALL_LINE = "The whole animation is animated again from the same first picture, so it flows as one.";
// (Nov 22, Arthur: "you can change the animation, but not how it looks") said when a look change of an animated thing is asked for
const LOOKS_STAY = "How things look stays the same once they're animated: their colours, sizes and shapes can't be changed. I can change what they do, the timing, or add more to the story. For a different look, start a new animation.";
export function createV1Animator(deps: V1CoreDeps) {
  const now = deps.now ?? (() => new Date().toISOString());
  const newId = deps.newId ?? (() => randomUUID());
  const animations = new Map<string, Animation>();
  // (Nov 25, Arthur: "never ever say again another animation is being made" - many people at once) the engine jobs running now,
  // up to atOnce(); a job over that waits in `waiting` (below) and starts the moment one ends. Each job keeps its own child + timer.
  const runningJobs = new Map<Job, Running>();
  const atOnce = () => { let n = 1; try { n = Math.floor(Number(deps.atOnce?.() ?? 1)); } catch { n = 1; } return Number.isFinite(n) && n >= 1 ? n : 1; };
  const runOf = (job: Job) => runningJobs.get(job);
  // the job of THIS animation that is running or waiting (one animation is only ever made by one job at a time)
  const busyWith = (anim: Animation): Job | null => [...runningJobs.keys(), ...waiting].find((j) => j.anim === anim) ?? null;
  const startNext = () => { while (runningJobs.size < atOnce() && waiting.length) { const next = waiting.shift()!; if (next.version.status === "running") beginJob(next); } };
  // (Nov 20, Arthur: "it cuts off halfway" - measured on his boulder and jackhammer stories: part 1 of a long story landed as "Version 1",
  // he answered what he saw before part 2 came, and the app re-made a part that was right) A STORY IS ONE STORY: while its next part is
  // being made, the animation is busy - his new message is answered at once (no minute of Sonnet), and part 1 says the rest is coming
  const storyBusy = new Map<string, number>();   // (Nov 20) animationId -> parts of its story still to come (the panel keeps watching while > 0)
  // (Nov 20, Fable) the story's saved parts are cleared whenever the story stops, so a later restart never resumes a story that was stopped
  const clearPending = (anim: Animation) => { try { const sp = join(anim.dir, "story-pending.json"); if (storyHeld.has(anim.animationId)) writeFileSync(sp, JSON.stringify({ held: true, ...storyHeld.get(anim.animationId) })); else if (existsSync(sp)) writeFileSync(sp, "{}"); } catch { /* best effort */ } };
  // (Nov 20) A STORY THAT STOPPED HALF WAY for a reason he did not choose (no money, no video, a refused part): what is left is KEPT, exactly as
  // the card said, and made by one press ("Make the rest of my story") - never re-written from the chat. Stop = he chose it: nothing is kept.
  type Held = { parts: V1KimodoStep[][]; storyLeft: number | null; recentConversation: Conversation };
  const storyHeld = new Map<string, Held>();
  const holdStory = (anim: Animation, parts: V1KimodoStep[][], job: Pick<Job, "storyLeft" | "recentConversation">) => {
    if (!parts.length) return;
    storyHeld.set(anim.animationId, { parts, storyLeft: job.storyLeft ?? null, recentConversation: job.recentConversation ?? [] });
    clearPending(anim);
  };
  // (Nov 4 PM12, Arthur: "I'm still making the last animation" blocked him while ANOTHER account's animation ran) one engine at a time, but a
  // new request never bounces: it waits here (its card shows it is being made) and starts by itself the moment the running one ends
  const waiting: Job[] = [];
  // (Nov 20, money) what this account's running and waiting runs already hold, so two runs can never spend more than it has
  const heldBy = (ownerId: string) => [...runningJobs.keys(), ...waiting].reduce((t, j) => t + (j && j.anim.ownerId === ownerId ? j.price?.credits ?? 0 : 0), 0);
  // (dad, Nov 26) PLANNING IS IN THE CARD'S PRICE: the plan answers before Animate - the first plan plus FREE_PLAN_CHANGES changes - are
  // not charged one by one (they still count toward the limits); a further change is charged at its warm cost, never above
  // PAID_CHANGE_MAX_CREDITS (the card says so first). Counted per project, from one Animate to the next.
  const planTurns = new Map<string, number>();
  const freeTurnsLeft = (ownerId: string, projectId: string) => Math.max(0, 1 + FREE_PLAN_CHANGES - (planTurns.get(`${ownerId}|${projectId}`) ?? 0));
  const creditsShortFor = (ownerId: string, credits: number, exceptPicture: string | null = null, exceptProject: string | null = null) => deps.usage?.creditsShort?.(ownerId, credits, heldBy(ownerId), exceptPicture, exceptProject) ?? null;
  // (Nov 20, money) a long story's next part: its own seconds, from what is left of the story's one price (never more than the first card)
  const nextPartCredits = (job: Job) => {
    const own = priceOf({ remadeSeconds: (job.parts?.[0] ?? []).reduce((t, s) => t + (Number(s.seconds) || 0), 0), added: true, chat: false }).credits;
    return Math.min(own, job.storyLeft ?? own);
  };

  const snapshot = (anim: Animation): V1AnimationSnapshot => structuredClone({
    animationId: anim.animationId, projectId: anim.projectId, versions: anim.versions, current: anim.current, fps: anim.fps, layerId: anim.layerId,
    ...(anim.speed ? { speed: anim.speed } : {}),
    ...(anim.layerCount ? { layerCount: anim.layerCount } : {}),
    ...(anim.fit ? { fit: anim.fit } : {}),
    ...(storyBusy.get(anim.animationId) ? { storyPartsLeft: storyBusy.get(anim.animationId) } : {}),
    ...(storyHeld.get(anim.animationId)?.parts.length ? { storyPartsHeld: storyHeld.get(anim.animationId)!.parts.length } : {}),
  });
  const versionDir = (anim: Animation, n: number) => join(anim.dir, anim.versions[n - 1]?.dir ?? `v${n}`); // (Nov 3 key 2) a viewer re-try's own folder
  // animation.json = the snapshot + its owner (read back on the first access to the project after a restart: nothing is lost)
  const persist = (anim: Animation) => { try { writeJson(join(anim.dir, "animation.json"), { ...snapshot(anim), ownerId: anim.ownerId }); } catch { /* best effort; memory is the truth while the server runs */ } };

  // ---- the project's animations + chat from disk (once per project per server process)
  const loaded = new Set<string>();
  const projectDir = (config: V1EngineConfig, projectId: string) => join(config.outDir, safeSegment(projectId));
  function loadProject(ownerId: string, projectId: string) {
    const config = deps.config();
    if (!config || loaded.has(projectId)) return;
    loaded.add(projectId);
    const root = projectDir(config, projectId);
    let entries: string[] = [];
    try { entries = readdirSync(root); } catch { return; }
    let interrupted: string | null = null;
    for (const name of entries) {
      const file = join(root, name, "animation.json");
      if (!existsSync(file)) continue;
      try {
        const raw = readJson(file);
        if (!isRecord(raw) || typeof raw.animationId !== "string" || !Array.isArray(raw.versions) || animations.has(raw.animationId)) continue;
        if (raw.projectId !== projectId) continue;
        // (an older animation.json has no owner: the route already checked this project belongs to this account)
        const owner = typeof raw.ownerId === "string" && raw.ownerId ? raw.ownerId : ownerId;
        const versions = (raw.versions as V1Version[]).filter((v) => isRecord(v) && typeof v.n === "number" && isV1Plan(v.plan));
        for (const v of versions) if (v.dir !== undefined && !(typeof v.dir === "string" && VIEWER_DIR.test(v.dir))) delete v.dir; // (only the viewer's own folder names)
        for (const v of versions) if (v.status === "running") {
          // the server stopped while it was being made: an honest failure (its folder is kept)
          interrupted ??= (() => { try { return serverWord(deps.books(config).book, "interrupted"); } catch { return NO_ENGINE; } })();
          Object.assign(v, { status: "failed", message: interrupted, stage: null, progress: null, finishedAt: v.finishedAt ?? now() });
        }
        const current = Number(raw.current);
        animations.set(raw.animationId, {
          animationId: raw.animationId, projectId, ownerId: owner, dir: join(root, name), versions,
          current: Number.isSafeInteger(current) && current >= 0 && current <= versions.length && (current === 0 || versions[current - 1]?.status === "done") ? current : 0,
          fps: Number(raw.fps) > 0 ? Number(raw.fps) : null, layerId: typeof raw.layerId === "string" && raw.layerId ? raw.layerId : null,
          layerCount: Number(raw.layerCount) > 0 ? Number(raw.layerCount) : null,
          speed: Number(raw.speed) > 0 ? Number(raw.speed) : null,
          fit: readFit(raw.fit),
        });
        // (Nov 20) a story whose next part was still to come when the app stopped: THE STORY GOES ON BY ITSELF from the saved parts (he approved
        // and paid the whole story on its first card) - never a silent half story. Only when they cannot be read: said plainly, with the way on.
        try {
          const sp = join(root, name, "story-pending.json"), pend = existsSync(sp) ? (readJson(sp) as { left?: unknown; version?: unknown; parts?: unknown; storyLeft?: unknown; recentConversation?: unknown }) : null;
          const heldRaw = pend as { held?: unknown; parts?: unknown; storyLeft?: unknown; recentConversation?: unknown } | null;
          if (heldRaw?.held === true && Array.isArray(heldRaw.parts) && heldRaw.parts.length && heldRaw.parts.every((p) => Array.isArray(p) && p.length)) {   // (a story kept for one press: kept, never made by itself)
            storyHeld.set(raw.animationId, { parts: heldRaw.parts as V1KimodoStep[][], storyLeft: Number.isFinite(Number(heldRaw.storyLeft)) && heldRaw.storyLeft !== null ? Number(heldRaw.storyLeft) : null, recentConversation: Array.isArray(heldRaw.recentConversation) ? heldRaw.recentConversation as Conversation : [] });
          } else if (pend && Number(pend.left) > 0) {
            writeFileSync(sp, "{}");
            const anim = animations.get(raw.animationId)!, n = Number(pend.version);
            const parts = Array.isArray(pend.parts) && pend.parts.length && pend.parts.every((p) => Array.isArray(p) && p.length) ? pend.parts as V1KimodoStep[][] : null;
            if (parts && n === anim.current && anim.versions.find((v) => v.n === n)?.status === "done") {
              storyBusy.set(anim.animationId, parts.length);
              saveLine(owner, projectId, raw.animationId, { role: "assistant", text: `The app restarted while your story was being made - the rest (${parts.length} more part${parts.length > 1 ? "s" : ""}) is being made now, going on from the last picture.` });
              const job = { parts, storyLeft: Number.isFinite(Number(pend.storyLeft)) && pend.storyLeft !== null ? Number(pend.storyLeft) : undefined, recentConversation: Array.isArray(pend.recentConversation) ? pend.recentConversation : [] } as unknown as Job;
              setTimeout(() => { void nextPart(anim, job, n); }, 0);
            } else saveLine(owner, projectId, raw.animationId, { role: "assistant", kind: "error", text: `The app restarted before the rest of your story was made (${Number(pend.left)} more part${Number(pend.left) > 1 ? "s" : ""}). Everything made so far is on the canvas. Say "continue" and I make the rest.` });
          }
        } catch { /* best effort */ }
      } catch { /* an unreadable record is skipped (its pictures stay on disk) */ }
    }
  }
  // (Nov 11, Arthur: "the chat session is not saved when I made an animation") THE CHAT FOLLOWS A COPY: after a crash the app can open the work as a
  // "Recovered copy" with a NEW project id, while this folder is filed under the old one. The first time a copy with no AI folder of its own
  // opens, its parent's folder (same owner: the route checked) is copied to it, each animation record re-addressed to the copy. Once only.
  function adopt(projectId: string, fromProjectId: string) {
    const config = deps.config();
    if (!config || loaded.has(projectId)) return;
    const from = projectDir(config, fromProjectId), to = projectDir(config, projectId);
    if (existsSync(to) || !existsSync(from)) return;
    try {
      cpSync(from, to, { recursive: true });
      const swap = (file: string, pairs: [string, string][]) => writeFileSync(file, pairs.reduce((text, [was, is]) => text.split(was).join(is), readFileSync(file, "utf8")));
      for (const name of readdirSync(to)) {   // (each animation gets its own id in the copy, so the parent and the copy never share one)
        if (!existsSync(join(to, name, "animation.json"))) continue;
        const fresh = newId();
        renameSync(join(to, name), join(to, fresh));
        swap(join(to, fresh, "animation.json"), [[join(from, name), join(to, fresh)], [JSON.stringify(name), JSON.stringify(fresh)], [JSON.stringify(fromProjectId), JSON.stringify(projectId)]]);
        if (existsSync(join(to, "chat.jsonl"))) swap(join(to, "chat.jsonl"), [[JSON.stringify(name), JSON.stringify(fresh)]]);
        if (existsSync(join(to, fresh, "story-pending.json"))) writeFileSync(join(to, fresh, "story-pending.json"), "{}");   // (Nov 20, Fable) only the original goes on with a story, never the copy too
      }
    } catch { /* best effort: the copy then starts an empty chat, as before */ }
  }
  // ---- the chat lines, per project (<outDir>/<projectId>/chat.jsonl: one JSON line per said line, appended on every turn)
  type StoredLine = V1SavedLine & { ownerId: string; animationId: string | null };
  function saveLine(ownerId: string, projectId: string, animationId: string | null, line: Omit<V1SavedLine, "at">) {
    const config = deps.config();
    if (!config || !line.text.trim()) return;
    try {
      const root = projectDir(config, projectId); mkdirSync(root, { recursive: true });
      const stored: StoredLine = { ...line, at: now(), ownerId, animationId };
      appendFileSync(join(root, "chat.jsonl"), JSON.stringify(stored) + "\n");
    } catch { /* best effort: the animation itself is kept either way */ }
  }
  function savedLines(ownerId: string, projectId: string, max = 200): (V1SavedLine & { animationId: string | null })[] {
    const config = deps.config();
    if (!config) return [];
    try {
      const out: (V1SavedLine & { animationId: string | null })[] = [];
      for (const row of readFileSync(join(projectDir(config, projectId), "chat.jsonl"), "utf8").split("\n")) {
        if (!row.trim()) continue;
        try {
          const l = JSON.parse(row) as StoredLine;
          if (l.ownerId !== ownerId || (l.role !== "user" && l.role !== "assistant") || typeof l.text !== "string") continue;
          out.push({ role: l.role, text: l.text, at: l.at, animationId: l.animationId ?? null, ...(l.kind ? { kind: l.kind } : {}), ...(typeof l.version === "number" ? { version: l.version } : {}) });
        } catch { /* a broken line is skipped */ }
      }
      return out.slice(-max);
    } catch { return []; }
  }

  const own = (ownerId: string, projectId: string, animationId: string | null) => {
    loadProject(ownerId, projectId);
    const anim = animationId ? animations.get(animationId) : undefined;
    return anim && anim.ownerId === ownerId && anim.projectId === projectId ? anim : null;
  };
  // the engine's own pictures per second for the version on the canvas (the most the fps op may ask)
  const engineFpsOf = (anim: Animation) => (anim.current > 0 ? anim.versions[anim.current - 1]?.report?.fps ?? 0 : 0);
  const stageOf = (books: V1Books, code: V1StageCode, i?: number, n?: number): V1Stage => {
    const words = (books.words.stageWords[code] ?? code).replace(/\{i\}/g, String(i ?? "")).replace(/\{n\}/g, String(n ?? ""));
    return { code, words, ...(i !== undefined && n !== undefined ? { i, n } : {}) };
  };

  function finish(job: Job, status: Exclude<V1JobStatus, "running">, message: string | null) {
    const { version, anim } = job;
    if (version.status !== "running") return;
    // (Nov 3 key 2) the viewer's re-try could not be made (failed / refused / timed out): the take before it is kept, said honestly. A stop stays a stop.
    if (job.viewer && status !== "done" && status !== "cancelled") {
      const { kept, missing } = job.viewer;
      Object.assign(version, { dir: kept.dir, plan: kept.plan, report: { ...kept.report, viewerSay: viewerWords(job, "first_kept", missing) } });
      if (!kept.dir) delete version.dir;
      status = "done"; message = null;
    }
    Object.assign(version, { status, message, stage: null, progress: null, finishedAt: now() });
    if (status === "done" && job.expect && job.startedAtMs) {   // (Nov 22) the bar learns from every real job
      try { appendFileSync(jobSecondsLedger(job.config), JSON.stringify({ at: now(), kind: job.kind, guess: Math.round(job.expect.guess * 10) / 10, real: Math.round((Date.now() - job.startedAtMs) / 100) / 10 }) + "\n"); } catch { /* the bar keeps its guess */ }
    }
    if (status === "done") {
      anim.current = version.n;
      // the engine's validated plan (D/plan.json) is the truth for later edits
      try { const p = join(versionDir(anim, version.n), "plan.json"); if (existsSync(p)) { const v = readJson(p); if (isV1Plan(v)) version.plan = version.plan.cameraMoves === true ? { ...v, cameraMoves: true } : v; } } catch { /* keep the input plan */ }
      // (Nov 2 night, EDIT BY MOVE) every block keeps its FROZEN beats: the director's beats of this take (report moves), else the
      // sentence cut by the book's splitter (edit.size_guard). A move edit's edit_from_beat belongs to the making only.
      for (const b of version.plan.blocks) {
        const moves = (version.report?.blocks.find((r) => r.id === b.id)?.moves ?? []).map((m) => m.trim()).filter(Boolean);
        b.beats = moves.length ? moves : actionPieces(b.sentence, job.books.book.editSize);
        delete b.edit_from_beat;
      }
      // (Nov 2) the FIRST done version's page fit is the animation's fit for good (later versions never move his feet)
      if (!anim.fit && version.report?.inkBox) anim.fit = { inkBox: [...version.report.inkBox] as V1Fit["inkBox"], mirror: version.plan.mirror === true };
    }
    { const r = runOf(job); if (r) { if (r.timer) clearTimeout(r.timer); runningJobs.delete(job); } }
    const wi = waiting.indexOf(job); if (wi >= 0) waiting.splice(wi, 1);   // (a waiting request that was stopped never starts)
    persist(anim);
    // (Nov 17, PLAN_FINAL_NOV17) a story over 15 s: the next part is made the moment this one is done, exactly as "add the next part" -
    // an edit of this version whose steps are all of its steps + the next part's steps (the passed add-on path: kimodo/wan.py longer)
    const partShort = status === "done" && job.parts?.length ? creditsShortFor(anim.ownerId, nextPartCredits(job)) : null;   // (each part is paid from the story's one price: never one the account cannot pay for)
    const moreParts = status === "done" && Boolean(job.parts?.length) && !partShort;
    if (moreParts) storyBusy.set(anim.animationId, job.parts!.length); else storyBusy.delete(anim.animationId);
    // (Nov 20) the story's unfinished parts are written down, so a restart between two parts is said plainly instead of the story silently stopping half way
    try { const sp = join(anim.dir, "story-pending.json"); if (moreParts) writeFileSync(sp, JSON.stringify({ version: version.n, left: job.parts!.length, parts: job.parts, storyLeft: job.storyLeft ?? null, recentConversation: job.recentConversation })); else clearPending(anim); } catch { /* best effort */ }
    // (Nov 20) a part that could not be paid, or a next part that failed (not one he stopped): the rest of the story is kept for one press
    const heldParts = partShort ? job.parts! : status !== "done" && status !== "cancelled" && job.storyPart ? [job.storyPart, ...(job.parts ?? [])] : null;
    if (heldParts?.length) holdStory(anim, heldParts, partShort ? job : { ...job, storyLeft: job.storyLeft !== undefined ? job.storyLeft + (job.price?.credits ?? 0) : undefined });   // (Fable: the failed part was not charged - its share goes back to the story)
    if (partShort) saveLine(anim.ownerId, anim.projectId, anim.animationId, { role: "assistant", kind: "error", version: version.n, text: partShort });
    else if (moreParts) void nextPart(anim, job, version.n);
    startNext();   // the next one in line starts by itself (as many as fit)
    // (usage) the run is metered once it ends, whatever the status: what it really spent (a failed / refused run costs no credits)
    try {
      // (Nov 3 key 2) a viewer re-try: the same run (one charge); the Kimodo calls of every take it made are recorded
      const report = version.report && job.viewer && version.dir !== job.viewer.kept.dir ? { ...version.report, kimodoCalls: version.report.kimodoCalls + job.viewer.calls } : version.report;
      deps.usage?.engineRun?.({ ownerId: anim.ownerId, projectId: anim.projectId, runId: job.runId ?? `${anim.animationId}:v${version.n}`, kind: job.kind, status,
        report, startedAtMs: job.startedAtMs ?? Date.now(), finishedAtMs: Date.now(), price: job.price ?? null });
    } catch { /* metering never breaks an animation */ }
    saveLine(anim.ownerId, anim.projectId, anim.animationId, status === "done"
      ? { role: "assistant", kind: "result", version: version.n, text: moreParts
          ? `Your story so far is on the canvas - the rest is being made now (${job.parts!.length} more part${job.parts!.length > 1 ? "s" : ""}, about a minute each). Watch it when it is all there before you ask for changes.`
          : serverWord(job.books.book, "made_version", { n: version.n }) }
      : { role: "assistant", kind: "error", version: version.n, text: message || serverWord(job.books.book, "failed_report") });
    // (Nov 2) a try that came out worse kept the version before: said honestly, with the offer to try once more
    if (status === "done" && version.report?.keptPreviousSay) saveLine(anim.ownerId, anim.projectId, anim.animationId, { role: "assistant", text: version.report.keptPreviousSay });
    if (status === "done" && version.report?.viewerSay) saveLine(anim.ownerId, anim.projectId, anim.animationId, { role: "assistant", text: version.report.viewerSay });
  }

  const spawnSafe = (job: Job, args: string[]): ChildLike | null => {
    try { return deps.spawn(job.config.python, args, { cwd: join(job.config.root, "ltx-effects"), env: { ...engineEnv(job.config), ...(job.version.plan.cameraMoves === true ? { H3_CAMERA: "moves" } : {}), ...(job.parts?.length ? { H3_MORE_PARTS: "1" } : {}) } }); }   // (Nov 19) a long story's middle parts keep today's ending   // (Nov 17) kimodo/wan.py SAID
    catch { return null; }
  };
  const watch = (job: Job, child: ChildLike) => {
    const r = runOf(job);
    if (!r) return;
    r.child = child;
    if (r.timer) clearTimeout(r.timer);
    // (Nov 2 night, attack 8) a long one take gets the time it needs: at least 2 x the book's making-time estimate for the asked seconds
    const needMs = job.askedS ? 2 * 1000 * makeSecondsOf(job.askedS, job.books.book) : 0;
    r.timer = setTimeout(() => { child.kill("SIGTERM"); finish(job, "failed", serverWord(job.books.book, "timeout")); }, Math.max(job.config.timeoutMs, needMs));
  };

  // the director step first (Luna plans the NEW blocks), then the engine; a stop meanwhile wins (nothing spawned)
  function runEngine(job: Job, inputPath: string, prevDir: string | null) {
    const vDir = versionDir(job.anim, job.version.n);
    job.version.stage = stageOf(job.books, "planning");
    if (!deps.director) { spawnEngine(job, inputPath, prevDir, null); return; }
    const plan = job.version.plan;
    void deps.director({ ownerId: job.anim.ownerId, projectId: job.anim.projectId, config: job.config, books: job.books, plan, prevDir, versionDir: vDir })
      .catch((error: unknown) => ({ ok: false as const, words: serverWord(job.books.book, "director_failed", { words: String(error instanceof Error ? error.message : error).slice(0, 200) }) }))
      .then((d) => {
        if (job.version.status !== "running") return;
        if (!d.ok) { finish(job, "failed", d.words); return; }
        spawnEngine(job, inputPath, prevDir, d.dir);
      });
  }

  function spawnEngine(job: Job, inputPath: string, prevDir: string | null, directorDir: string | null) {
    const vDir = versionDir(job.anim, job.version.n);
    const child = spawnSafe(job, engineArgs(job.config, inputPath, vDir, prevDir, directorDir));
    if (!child) { finish(job, "failed", serverWord(job.books.book, "failed_engine", { words: "" })); return; }
    watch(job, child);
    let resultPath: string | null = null, tail = "";
    const errors: string[] = [], failed: string[] = [];
    const onLine = (line: string) => {
      tail = (tail + line + "\n").slice(-6000);
      const parsed = parseEngineLine(line);
      if (!parsed || job.version.status !== "running") return;
      if (parsed.type === "stage") job.version.stage = { ...(parsed.stage.words ? parsed.stage : stageOf(job.books, parsed.stage.code, parsed.stage.i, parsed.stage.n)), ...(job.version.progress ? { progress: job.version.progress } : {}) };
      else if (parsed.type === "progress") { const p = parsed.progress.pct >= 100 ? { ...parsed.progress, ...(job.part ? { part: job.part } : {}) } : timedProgress(job); job.version.progress = p; if (job.version.stage) job.version.stage = { ...job.version.stage, progress: p }; }   // (Nov 22) the bar runs on real times
      else if (parsed.type === "result") resultPath = parsed.path;
      else if (parsed.type === "failed") failed.push(parsed.words);
      else errors.push(parsed.words);
    };
    const out = lineSplitter(onLine), err = lineSplitter(onLine);
    child.stdout?.on("data", (chunk) => out.push(String(chunk)));
    child.stderr?.on("data", (chunk) => err.push(String(chunk)));
    child.on("error", () => finish(job, "failed", serverWord(job.books.book, "failed_engine", { words: "" })));
    child.on("close", (code, signal) => {
      out.end(); err.end();
      if (job.version.status !== "running") return;
      { const r = runOf(job); if (r) { r.child = null; if (r.timer) { clearTimeout(r.timer); r.timer = null; } } }
      if (resultPath) { void wholeThenSettle(job, inputPath, prevDir, directorDir, resolveEnginePath(job.config, vDir, resultPath)); return; }
      // ERROR = the engine's own plain words (the director could not plan, budget used up, not cached, not V1): said as they are, no retry
      // (Nov 20, Arthur: a stopped job said "PROGRESS 5 60") a stop, or a last line that is only the engine's own progress talk, is said plainly
      const last = lastLines(tail, 1);
      const stopped = Boolean(signal) || /^\s*(STAGE|PROGRESS|RESULT)\b/.test(last);
      finish(job, "failed", serverWord(job.books.book, "failed_engine", { words: [...errors, ...failed].join(" ") || (stopped ? "It was stopped before it finished, and your animation is exactly as it was." : last) }));
    });
  }

  // (Nov 11, Arthur: "cut off by this invisible thing") before a made version is looked at or shown, the clips this run bought are checked. When
  // one was kept up to his last whole picture, the engine makes the version once more from the saved clips, in its own folder (as a viewer
  // re-try does), and that one is checked again; each pass cuts at least one clip back, WHOLE_PASSES is the stop. No check = as before.
  async function wholeThenSettle(job: Job, inputPath: string, prevDir: string | null, directorDir: string | null, reportPath: string) {
    const passes = job.whole?.passes ?? 0;
    const again = Boolean(deps.wholeClips) && !job.config.cacheOnly && passes < WHOLE_PASSES
      && await deps.wholeClips!({ config: job.config, versionDir: versionDir(job.anim, job.version.n), sinceMs: job.whole?.sinceMs ?? job.startedAtMs ?? 0 }).catch(() => false);
    if (job.version.status !== "running") return; // stopped meanwhile
    if (!again) { settleReport(job, reportPath); return; }
    const dir = `v${job.version.n}-whole${passes + 1}`, input = join(job.anim.dir, dir, "input.plan.json");
    try { mkdirSync(join(job.anim.dir, dir), { recursive: true }); writeJson(input, readJson(inputPath)); } catch { settleReport(job, reportPath); return; }
    job.whole = { passes: passes + 1, sinceMs: Date.now() }; job.version.dir = dir;
    spawnEngine(job, input, prevDir, directorDir);
  }

  // (Nov 20) why an edit made nothing, in one plain sentence: the engine's own notes of this version (every part's block.json) say it
  // the engine's own notes of every part of the version (its raw words, before they were made plain)
  function rawNotes(job: Job): string {
    let raw = "";
    try {
      const bd = join(versionDir(job.anim, job.version.n), "blocks");
      for (const b of existsSync(bd) ? readdirSync(bd) : []) { const f = join(bd, b, "block.json"); if (existsSync(f)) raw += " " + JSON.stringify((readJson(f) as { raw_labels?: unknown }).raw_labels ?? ""); }
    } catch { raw = ""; }
    return raw;
  }
  // (Nov 20, Fable) NO_VIDEO = the engine's own words for every "no video came back" (kimodo/wan.py: "H3 Turbo could not make ...")
  const NO_MONEY = /exhausted balance|top up your balance|user is locked/i, NO_CAP = /spending cap|spending limit/i, NO_SPACE = /no space left|ENOSPC|out of storage/i, NO_VIDEO = /H3 Turbo could not make/i;
  function nothingMadeWords(job: Job, report?: V1Report): string {
    const raw = rawNotes(job);
    // (a change the engine refused on purpose and said why, e.g. "That colour was not found ...": its own honest sentence)
    const own = !NO_VIDEO.test(raw) ? [...(report?.labels ?? []), ...(report?.blocks ?? []).flatMap((b) => b.labels ?? [])].map((x) => String(x).trim().replace(/[.\s]+$/, "")).find((x) => x.length > 0) : undefined;
    // (Nov 22, plan hour 5: "if fal says no: a plain message, the credits given back, and an alert to you") the user is never told about
    // our provider's money: a plain sentence (nothing is charged for a run that made nothing); Arthur is told in his inbox what to do
    if (NO_MONEY.test(raw) || NO_CAP.test(raw)) {
      try { deps.ownerAlert?.(NO_MONEY.test(raw) ? "ai-animator-fal-balance" : "ai-animator-fal-cap", NO_MONEY.test(raw)
        ? "The AI Animator could not make an animation: fal says its balance is used up. Top up fal (dad's fal login) - users were told nothing was made and no credits were taken."
        : "The AI Animator could not make an animation: the app's own fal spending cap is reached (ltx-effects/seedance/spend.json cap). Raise the cap - users were told nothing was made and no credits were taken."); } catch { /* the user's words below still go out */ }
      return `The animator can't make animations right now. Nothing was made and no credits were taken - we've been told and are fixing it. Your animation is exactly as it was; please try again a little later.`
        + (job.storyPart ? ` The rest of your story is kept: press "Make the rest of my story" when you are ready.` : "");
    }
    const why = NO_SPACE.test(raw) ? "the computer that makes the animations is out of storage space"
      : NO_VIDEO.test(raw) ? "the animator (H3) gave no video back for part of it, so nothing was kept"
      : own ?? "the animator could not make this change - nothing in the animation changed";   // (also a look change the engine refused on purpose: nothing changed)
    return `Nothing new was made - ${why}. Your animation is exactly as it was, and your next change starts from it.`
      + (job.storyPart ? ` The rest of your story is kept: press "Make the rest of my story" when you are ready.` : "");   // (only a story's next part carries parts: the way on is said)
  }

  function settleReport(job: Job, path: string) {
    let report: V1Report | null = null;
    try { report = normalizeV1Report(readJson(path)); } catch { report = null; }
    if (!report) { finish(job, "failed", serverWord(job.books.book, "failed_report")); return; }
    report = friendlyV1Report(report, job.books.book);
    job.version.report = report;
    // (Nov 4 PM12) the engine turned him around to match the user's words: the version (placement, later edits) keeps that direction
    if (typeof report.mirror === "boolean" && report.mirror !== (job.version.plan.mirror === true)) job.version.plan = { ...job.version.plan, mirror: report.mirror };
    if (report.refused) finish(job, "refused", report.refused);
    // (Nov 2 night) IDENTITY CHECK: a move edit keeps every picture before the edited move byte-identical + the same placement, else the old version stays
    // (Nov 8 night, live: every move edit failed here - the edit was fitted EXACT, the version it edits by BOTH boxes) a move edit is placed
    // exactly where the version it edits is placed, so its kept pictures land on the very same spot of the canvas
    else if (!report.ok) finish(job, "failed", serverWord(job.books.book, "failed_not_ok", { words: report.labels.join(" ") }));
    // (Nov 20, Fable B1/B2, measured on his boulder story: fal had no money, no video came back, and it was saved as "Version 4"; the next edit
    // built on it and skipped his hug) AN EDIT THAT CHANGED NO PICTURE MADE NOTHING: an honest failure with the real reason, never a version -
    // every edit that worked changed 51 to 360 pictures; the next edit starts from the last good version
    // (Nov 20, Fable gap B) all or nothing: a part that got no video because money, the cap or storage ran out fails the WHOLE edit, even when another part changed
    else if (job.kind === "edit" && (report.frames.edited + report.frames.added + report.frames.deleted === 0 || [NO_MONEY, NO_CAP, NO_SPACE, NO_VIDEO].some((r) => r.test(rawNotes(job))))) finish(job, "failed", nothingMadeWords(job, report));
    else { keepPlacement(job, report); if (viewerOn(job, report)) void look(job, report); else finish(job, "done", null); }   // (Nov 14, no checkers: nothing judges an edit's result)
  }

  // ---- (Nov 3 final part A, KEY 2) THE VIEWER, before the canvas: the same Sonnet looks at each move's PEAK picture (the engine's viewer sheet)
  // with the user's own words + the planned moves: "does it show what was asked?". Not shown -> ONE re-try of the same animation (book
  // viewer.max_retries): a fresh take whose planner is told what was missing (plan context change), in its own folder, never charged again (the
  // same job = the same run). The newer take is kept (the take before only when the new one could not be made); the ONE line says the truth.
  // Judged: takes with NEW motion (a colour / look re-draw is the same motion) when new takes may be made (never in cache-only).
  const viewerOn = (job: Job, report: V1Report) => Boolean(deps.viewer && job.books.book.viewer?.active && !job.config.cacheOnly && report.viewerSheet
    && report.blocks.some((b) => b.made !== "same" && !b.redrawn));
  const viewerWords = (job: Job, key: V1ViewerSay, missing: string) => job.books.book.viewer!.say[key].replace(/\{missing\}/g, missing.trim().replace(/[.\s]+$/, ""));
  async function look(job: Job, report: V1Report) {
    const rule = job.books.book.viewer!, { anim, version } = job;
    const words = version.plan.context?.words || userWords(job.message, job.recentConversation);
    let timer: ReturnType<typeof setTimeout> | null = null;
    const verdict = await Promise.race([
      deps.viewer!({ ownerId: anim.ownerId, projectId: anim.projectId, runId: job.runId ?? `${anim.animationId}:v${version.n}`, book: job.books.book, words,
        sheetPath: resolveEnginePath(job.config, versionDir(anim, version.n), report.viewerSheet!), moves: report.blocks.flatMap((b) => b.moves).filter(Boolean),
        ...(version.plan.blocks.some((b) => b.steps?.length) ? { steps: version.plan.blocks.flatMap((b) => b.steps ?? []) } : {}) }),   // (Nov 4 PM12) the Kimodo steps as sent
      new Promise<{ ok: false; detail: string }>((done) => { timer = setTimeout(() => done({ ok: false, detail: "timeout" }), rule.timeoutMs); }),
    ]).catch((error: unknown) => ({ ok: false as const, detail: String(error) })).finally(() => { if (timer) clearTimeout(timer); });
    if (version.status !== "running") return; // stopped meanwhile
    const shows = verdict.ok ? verdict.showsRequest : null, missing = verdict.ok ? verdict.missing.trim() : "";
    const tries = job.viewer?.tries ?? 0;
    report.viewer = { showsRequest: shows, missing, tries: tries + 1 };
    const fixed = verdict.ok ? verdict.fixedSteps ?? null : null;
    if (shows === false && missing && tries < rule.maxRetries) { retake(job, report, missing, fixed); return; }
    // the ONE honest line: shown at the first look = nothing more said; else what was measured
    const first = job.viewer?.missing ?? "";
    if (tries > 0) report.viewerSay = viewerWords(job, shows === true ? "retried_shown" : shows === false ? "retried_missing" : "retried_unjudged", shows === false ? missing || first : first);
    else if (shows === false && missing) report.viewerSay = viewerWords(job, "missing", missing);
    finish(job, "done", null);
  }
  // the viewer's re-try: the same plan, every newly made block on a seed no take of this animation used yet (freshTries), the planner told what was missing
  function retake(job: Job, report: V1Report, missing: string, fixed: V1KimodoStep[] | null = null) {
    const { anim, version } = job, rule = job.books.book.viewer!;
    const madeIn = versionDir(anim, version.n), tries = (job.viewer?.tries ?? 0) + 1;
    job.viewer = { kept: { report, plan: version.plan, dir: version.dir }, missing, tries, calls: (job.viewer?.calls ?? 0) + report.kimodoCalls };
    const base = job.basePlan ?? { ...version.plan, blocks: [] };
    // (Nov 4 PM12, NO TELEPHONE) the SAME Sonnet fixed only the missing step of its own Kimodo steps: those steps are the re-try (Kimodo's limits kept)
    const lim = job.books.book.kimodoSteps, steps = fixed?.map((s) => ({ ...s, seconds: Math.round(Math.min(lim.maxS, Math.max(lim.minS, s.seconds)) * 100) / 100 }));
    const retried = steps?.length ? { ...version.plan, blocks: stepBlocks(steps, job.books.book) } : version.plan;
    const plan = retried;
    const ctx = version.plan.context, previous = prevInstructions(madeIn) || ctx?.previous || "";
    const change = rule.retryChange.replace(/\{change\}/g, ctx?.change ?? "").replace(/\{missing\}/g, missing.replace(/[.\s]+$/, "")).trim();
    version.plan = { ...plan, context: { words: ctx?.words || userWords(job.message, job.recentConversation), ...(previous ? { previous } : {}), change } };
    version.dir = `v${version.n}-viewer${tries}`;
    version.report = null;
    const vDir = versionDir(anim, version.n);
    try { mkdirSync(vDir, { recursive: true }); } catch { finish(job, "failed", serverWord(job.books.book, "failed_engine", { words: "" })); return; }
    const inputPath = join(vDir, "input.plan.json");
    writeJson(inputPath, engineInput(version));
    runEngine(job, inputPath, job.prevDir);
  }

  // (Nov 5, Arthur: "drawing means ONE picture") a version with no movement asked (still) is a DRAWING: the engine keeps only his final pose
  const engineInput = (v: V1Version) => {   // (the mark is never carried over from an earlier version's plan: only THIS version's still decides)
    const { drawing: _was, ...plan } = v.plan as V1Plan & { drawing?: boolean };
    return v.still ? { ...plan, drawing: true } : plan;
  };
  // (Nov 2 night, attack 1 + 7) the placement a version is put on the page with (fitInkBox; exact when its motion differs from the fit version)
  const motionKey = (p: V1Plan) => JSON.stringify(p.blocks.map((b) => [b.id, b.sentence, b.seed_bump]));
  function placementOf(anim: Animation, version: V1Version, report: V1Report) {
    if (version.inkBox) return version.inkBox;
    const fitVersion = anim.versions.find((v) => v.status === "done") ?? null; // the first done version = where the fit came from
    // (Nov 3 LAST round, live: an appended cartwheel ran off the page) EXACT only for a move edit (its kept start must not move); any other new
    // motion that goes past the first box is fitted with both boxes, so the whole animation stays on the page
    const moveEdit = report.blocks.some((b) => typeof b.editFromBeat === "number");
    return fitInkBox(anim.fit, report, version.plan.mirror === true, moveEdit && !!fitVersion && fitVersion !== version && motionKey(fitVersion.plan) !== motionKey(version.plan));
  }
  function keepPlacement(job: Job, report: V1Report) {
    const base = job.prevDir ? job.anim.versions.find((v) => versionDir(job.anim, v.n) === job.prevDir) : undefined;
    if (!base?.report || !report.blocks.some((b) => typeof b.editFromBeat === "number")) return;
    const box = placementOf(job.anim, base, base.report);
    if (box) job.version.inkBox = [...box] as [number, number, number, number];
  }
  // true = a block re-made from a move (edit_from_beat) changed something BEFORE that move: a kept picture differs (sha1) or the placement moved.
  // The kept pictures end where the engine says the edited beat starts (report editFromBeat + beatStarts); an engine that re-made the whole
  // block (no editFromBeat) = today's whole-block rewrite: only the pictures before that block are checked.
  function keptBroken(job: Job, report: V1Report): boolean {
    // (Nov 10 editing) only a part the ENGINE re-made from a move (its report has editFromBeat) is checked here; an H3 part is edited by the
    // engine itself (cut + fill: every picture outside the cut is the same file) and is never thrown away by this older check
    const moved = job.version.plan.blocks.filter((b) => typeof b.edit_from_beat === "number" && typeof report.blocks.find((r) => r.id === b.id)?.editFromBeat === "number");
    if (!moved.length || !job.prevDir) return false;
    const base = job.anim.versions.find((v) => versionDir(job.anim, v.n) === job.prevDir), baseReport = base?.report;
    if (!base || !baseReport) return true;
    const a = placementOf(job.anim, job.version, report), b = placementOf(job.anim, base, baseReport);
    if (JSON.stringify(a) !== JSON.stringify(b) || (report.size ?? 1) !== (baseReport.size ?? 1) || report.stage.join() !== baseReport.stage.join()) return true;
    const sha = (f: string) => createHash("sha1").update(readFileSync(f)).digest("hex");
    try {
      const newDir = resolveEnginePath(job.config, versionDir(job.anim, job.version.n), report.layersDir), oldDir = resolveEnginePath(job.config, job.prevDir, baseReport.layersDir);
      const pngs = (d: string) => readdirSync(d).filter((f) => f.toLowerCase().endsWith(".png")).sort();
      const now = pngs(newDir), before = pngs(oldDir);
      for (const blk of moved) {
        const nb = report.blocks.find((r) => r.id === blk.id);
        if (!nb) return true;
        // (Nov 8 eve) the engine may cut EARLIER than asked (the edited move sat inside the backup animator's pictures): it says where it cut
        const start = typeof nb.editFromBeat === "number" && nb.editFromBeat <= blk.edit_from_beat! ? nb.beatStarts?.[nb.editFromBeat] : undefined;
        // (Nov 2 night) beatStarts are already in the joined numbering (engine contract): the kept pictures end AT the edited beat's start
        // (Nov 8 night, live: "slow the punch + redo the 2nd backflip" - the slowed punch is a change he ASKED for) a kept move whose slow motion /
        // hold changed is re-drawn on purpose: only the pictures before the first such move must stay byte-identical
        const was = base.plan.blocks.find((x) => x.id === blk.id)?.timing ?? [], now_ = blk.timing ?? [];
        const timed = [...new Set([...was, ...now_].map((t) => t.move))].filter((m) => JSON.stringify(was.find((t) => t.move === m) ?? null) !== JSON.stringify(now_.find((t) => t.move === m) ?? null));
        const keep = Math.min(start ?? nb.firstFrame, ...timed.map((m) => nb.beatStarts?.[m] ?? nb.firstFrame));
        if (now.length < keep || before.length < keep) return true;
        for (let i = 0; i < keep; i++) if (sha(join(newDir, now[i])) !== sha(join(oldDir, before[i]))) return true;
      }
      return false;
    } catch { return true; }
  }

  // edit: Luna's ops -> the new plan (here, in TypeScript) -> the engine with --prev (unchanged blocks = the same folders)
  // (Nov 22) the plan an edit sends the engine - runEdit's own lines, shared with the gate picture's run so both send the very same input
  function editPlanFor(job: Pick<Job, "steps" | "basePlan" | "books" | "prevDir" | "anim" | "remakeAll" | "message" | "recentConversation">, edits: V1EditOp[]): { plan: V1Plan } | { error: string } {
    // (Nov 14, Arthur: "I don't want any guards ... checkers are dumb") Sonnet's edit is applied exactly as he wrote it: no size guard, and
    // nothing asks him again behind the user's back - an edit that cannot be applied is said plainly
    // (Nov 15, live: the edit that names its steps and brings no other order was answered "couldn't be applied" - applyV1Ops calls a plan
    // with no order "the same") an edit of steps only: the plan the steps are put into is the saved plan itself
    const applied = edits.length || !job.steps?.length ? applyV1Ops(job.basePlan!, edits, job.books.book, job.books.words)
      : { plan: { ...job.basePlan!, blocks: job.basePlan!.blocks.map(({ edit_from_beat: _was, ...b }) => b) } as V1Plan };
    if ("error" in applied) return { error: applied.error };
    // (Nov 22, Arthur: "if they just started making an animation, they have to do a full rewrite because it's like 5 seconds long") a short
    // animation's motion edit is the WHOLE animation made again, as a new animation is made (no --prev: the scene sentence is the saved one,
    // so its first picture comes back from the animator's cache for $0 and everything flows from it as one take - no kept puzzle pieces)
    if (job.remakeAll && job.steps?.length) return { plan: { ...applied.plan, blocks: stepBlocks(job.steps, job.books.book), context: { words: userWords(job.message, job.recentConversation) } } };
    // (Nov 4 PM12) the AI's new steps; (Nov 8) the parts before the first change are kept as they were (editBlocks); seeds as the failed tries need
    const edited = job.steps?.length ? withAskedTiming(stepsEdit(keepUnchanged(job.steps, job.basePlan!.blocks.flatMap((b) => b.steps ?? [])), applied.plan, job.basePlan!, edits, job.books.book, h3EndOf(job.prevDir, job.anim.versions.find((v) => versionDir(job.anim, v.n) === job.prevDir)?.report)), applied.plan, job.basePlan!) : applied.plan;
    const plan = keepTiming(edited, job.basePlan!);
    const previous = prevInstructions(job.prevDir);
    return { plan: { ...plan, context: { words: userWords(job.message, job.recentConversation), ...(previous ? { previous, change: job.message } : {}) } } };
  }
  function runEdit(job: Job) {
    const vDir = versionDir(job.anim, job.version.n);
    writeJson(join(vDir, job.retried ? "ops-retry.json" : "ops.json"), job.version.edits);
    const built = editPlanFor(job, job.version.edits ?? []);
    if ("error" in built) { finish(job, "failed", serverWord(job.books.book, "edit_failed", { words: built.error })); return; }
    job.version.plan = built.plan;
    const inputPath = join(vDir, "input.plan.json");
    writeJson(inputPath, engineInput(job.version));
    runEngine(job, inputPath, job.prevDir);
  }

  // ONE Luna retry per job with the checker's own words; then an honest failure.
  async function retryOrFail(job: Job, words: string[], where: "engine" | "edit") {
    const { book } = job.books;
    const said = words.filter(Boolean).slice(0, 12);
    if (job.retried) {
      finish(job, "failed", serverWord(book, job.kind === "edit" && where === "edit" ? "edit_failed" : "failed_checker", { words: said.join("; ") }));
      return;
    }
    job.retried = true;
    job.version.stage = stageOf(job.books, "planning");
    const lastAnswer = job.version.edits;
    let asked: Awaited<ReturnType<V1LunaCall>>;
    try {
      asked = await deps.luna({
        ownerId: job.anim.ownerId, projectId: job.anim.projectId, message: job.message, recentConversation: job.recentConversation,
        current: job.kind === "edit" ? job.basePlan : null, checkerSaid: said, lastAnswer,
        ...(job.kind === "edit" && partSecondsOf(basePlanOf(job.anim)) ? { partSeconds: partSecondsOf(basePlanOf(job.anim))! } : {}),
        ...(job.kind === "edit" && backupMovesOf(basePlanOf(job.anim)) ? { backupMoves: backupMovesOf(basePlanOf(job.anim))! } : {}),
      });
    } catch (error) { asked = { ok: false, failure: "unreachable", detail: String(error) }; }
    if (job.version.status !== "running") return; // stopped meanwhile
    if (!asked.ok) { finish(job, "failed", serverWord(book, "failed_retry_turn", { words: askFailedWords(book, asked.failure) })); return; }
    const turn = asked.turn;
    if (job.kind === "edit" && turn.intent === "edit" && turn.ops) {
      job.version.edits = turn.ops;
      runEdit(job);
      return;
    }
    if (turn.intent === "refuse") { finish(job, "refused", turn.say); return; }
    finish(job, "failed", serverWord(book, "failed_retry_turn", { words: turn.say }));
  }

  function startJob(anim: Animation, kind: Job["kind"], plan: V1Plan, edits: V1EditOp[] | null, ctx: Pick<Job, "config" | "books" | "message" | "recentConversation" | "basePlan" | "prevDir" | "askedS" | "steps" | "parts" | "price" | "storyLeft" | "storyPart" | "remakeAll">, still = false) {
    if (!ctx.storyPart && storyHeld.delete(anim.animationId)) clearPending(anim);   // (Nov 20, Fable) he changed it himself (or wrote the rest in his own words): the kept story is let go, never added on top later
    const n = anim.versions.length + 1;
    const version: V1Version = { n, plan, edits, ...(still ? { still: true } : {}), status: "running", stage: stageOf(ctx.books, "planning"), progress: null, report: null, message: null, createdAt: now(), finishedAt: null };
    anim.versions.push(version);
    const job: Job = { anim, version, kind, retried: false, ...ctx, runId: newId(), startedAtMs: Date.now() };
    if (runningJobs.size >= atOnce()) { waiting.push(job); return; }
    beginJob(job);
  }
  // (Nov 22, hour 2, Arthur: "the progress bar has to be genuinely accurate") THE BAR RUNS ON REAL TIMES. The engine's PROGRESS guess
  // still uses the old animator's book seconds (it raced ahead, then sat). Measured on 84 real jobs since Nov 19: a job takes about
  // 42 s + 1.6 s per second it animates (median error 17 %); a new animation, whose first picture the card already drew, about 13 s +
  // 3.35 s per second (measured Nov 22). The bar follows the clock against that time, scaled by how the last 12 real jobs of the same
  // kind here compared with their guess (the median): 90 % at the expected time; past
  // it, it keeps creeping (never past 94 %) and says it is taking a little longer. 100 only from the engine's own end. Nothing in the
  // engine or in how anything is made changes: only the numbers the panel shows.
  const storyTotal = new Map<string, number>();
  const jobSecondsLedger = (config: V1EngineConfig) => join(config.root, "ltx-effects", "out", "app-v1-job-seconds.jsonl")   // (beside the animations folder: every entry in it is a project folder);
  function expectJob(job: Job): { guess: number; seconds: number } {
    const made = job.kind === "edit" ? (job.steps ?? []).filter((s) => s.changed !== false) : (job.version.plan.blocks ?? []).flatMap((b) => b.steps ?? []);
    const secs = made.reduce((t, s) => t + (Number(s.seconds) || 0), 0);
    const guess = job.kind === "edit" ? 42 + 1.6 * secs : 13 + 3.35 * secs;
    let k = 1;
    try {
      const rows = readFileSync(jobSecondsLedger(job.config), "utf8").trim().split("\n").map((l) => JSON.parse(l) as { kind?: string; guess?: number; real?: number })
        .filter((r) => r.kind === job.kind && Number(r.guess) > 0 && Number(r.real) > 0).slice(-12);
      if (rows.length >= 3) { const r = rows.map((x) => Number(x.real) / Number(x.guess)).sort((a, b) => a - b); k = r[Math.floor(r.length / 2)]; }
    } catch { /* no ledger yet: the measured guess */ }
    return { guess, seconds: guess * Math.min(3, Math.max(0.7, k)) };
  }
  function timedProgress(job: Job): V1Progress {
    const T = job.expect?.seconds ?? 60, el = Math.max(0, (Date.now() - (job.startedAtMs ?? Date.now())) / 1000), late = el > T;
    const pct = late ? 90 + 4 * (1 - Math.exp(-(el - T) / T)) : 90 * el / T;
    return { pct: Math.round(pct * 10) / 10, etaS: Math.max(0, Math.round(T - el)), ...(late ? { late: true } : {}), ...(job.part ? { part: job.part } : {}) };
  }
  function beginJob(job: Job) {
    const { anim, version, kind, books: jb } = job, n = version.n, plan = version.plan, ctx = { books: jb };
    job.startedAtMs = Date.now();
    try { job.expect = expectJob(job); } catch { /* the bar then uses one minute */ }
    // (Nov 22) a long story's part says which part it is ("1 of 2")
    if (job.parts?.length && !job.storyPart) storyTotal.set(anim.animationId, 1 + job.parts.length);
    else if (!job.storyPart) storyTotal.delete(anim.animationId);
    const total = storyTotal.get(anim.animationId);
    if (total && total > 1) job.part = [Math.max(1, total - (job.parts?.length ?? 0)), total];
    runningJobs.set(job, { job, child: null, timer: null });
    const vDir = versionDir(anim, n);
    try { mkdirSync(vDir, { recursive: true }); } catch { finish(job, "failed", serverWord(ctx.books.book, "failed_engine", { words: "" })); return; }
    if (kind === "edit") { runEdit(job); return; }
    const inputPath = join(vDir, "input.plan.json");
    version.plan = { ...plan, context: { words: makeWords(job.message, job.recentConversation) } };   // (Nov 3 final part A) the planner sees the user's own words; (Nov 11) the newest always whole
    writeJson(inputPath, engineInput(version));
    runEngine(job, inputPath, null);
  }

  // The plan an edit applies to: the version on the canvas, else the newest version (e.g. the first one failed).
  const basePlanOf = (anim: Animation): V1Version | null => (anim.current > 0 ? anim.versions[anim.current - 1] : anim.versions.at(-1)) ?? null;
  // (Nov 2 app round) each part's seconds as made (the version's report), null = not made yet
  // (Nov 8 eve) each part's moves (from 1) that the backup animator (H3) drew: at least half of the move's pictures are its pictures
  const backupMovesOf = (v: V1Version | null): Record<string, number[]> | null => {
    const out: Record<string, number[]> = {};
    for (const b of v?.status === "done" ? v.report?.blocks ?? [] : []) {
      const st = b.beatStarts ?? [], end = b.firstFrame + b.frames, rs = b.backup ?? [];
      const moves = st.map((s, i) => [s, (st[i + 1] ?? end) - 1]).flatMap(([a, z], i) => (rs.reduce((n, [p, q]) => n + Math.max(0, Math.min(z, q) - Math.max(a, p) + 1), 0) * 2 >= z - a + 1 ? [i + 1] : []));
      if (moves.length) out[b.id] = moves;
    }
    return Object.keys(out).length ? out : null;
  };
  const partSecondsOf = (v: V1Version | null): Record<string, number> | null => {
    const bl = v?.status === "done" ? v.report?.blocks ?? [] : [];
    return bl.length ? Object.fromEntries(bl.filter((b) => b.lengthS > 0).map((b) => [b.id, b.lengthS])) : null;
  };

  // (Nov 11, Arthur's dad: "a gate before they make animations, so they don't waste money") a new animation waits here, planned but not
  // made or charged, until the user presses Animate on the card; any new message replaces it. Animate starts EXACTLY this plan (no second AI call).
  // (Nov 11, Arthur: "whatever the gate says, if I okay it, is what is made") EVERY make or edit waits here exactly as it will run; the card lists
  // the lines of only the steps that will really be made (the animator reads those steps' own words), and Animate starts that run unchanged.
  // (Nov 20, money) `price` = what the card shows and the account must be able to pay; the job is charged ctx.price when it has one
  // (a long story: its first part's share), else `price`.
  type Gated = { anim: Animation; isNew: boolean; kind: Job["kind"]; plan: V1Plan; edits: V1EditOp[] | null; ctx: Parameters<typeof startJob>[4]; still: boolean; price: V1Price; newThings?: string };
  const gated = new Map<string, Gated>();
  // (Nov 13, Arthur: "the gate should TALK to me about what will be animated" - and whatever it says is what is made) ONE rule for a new
  // animation and for an edit: a card line = the step's own sentence, as Sonnet wrote it, with its seconds - exactly what the animator is
  // sent for that step (kimodo/wan.py card; an edit's clip: wan.py edit). A new animation lists every step; an edit only the steps made again.
  // (Nov 14, Arthur: "I said make the axe red. It says we'll add another axe that's red. Hell no. We change pictures.") a LOOK change (a step
  // with `look` words) is ONE line - what changes, and that everything else stays - never the step's sentence: nothing is animated.
  const gateLines = (steps: V1KimodoStep[] | null | undefined, isNew = false) => {
    const made = (steps ?? []).filter((s) => isNew || s.changed !== false);
    const looks = isNew ? [] : [...new Set(made.filter((s) => s.look).map((s) => s.look!.trim().replace(/\.$/, "")))];
    return [...new Set([...made.filter((s) => isNew || !s.look).map((s) => `${s.text.trim()} (${s.seconds} s)`),   // (Nov 20, live: one colour written as five near codes printed its line five times) each line once
      // (Nov 15) a colour-only look ("colour #7c3aed to #2563eb", swapped in the saved pictures for $0) reads as what it is, without colour codes
      ...looks.map((l) => /^colou?r\s+#[0-9a-f]{6}\s+to\s+#[0-9a-f]{6}$/i.test(l) ? "Only the colour changes, in every picture that shows it. Nothing is animated again: his moves and everything else stay exactly as they are."
        : `${l.charAt(0).toUpperCase()}${l.slice(1)}: in every picture that shows it. His moves and everything else stay exactly as they are.`)])];
  };
  const hold = (key: string, g: Gated, turn: V1LunaTurn, lines: string[]) => {
    gated.set(key, g);
    const colourOp = g.edits?.find((op): op is Extract<V1EditOp, { op: "colour" }> => op.op === "colour");
    const colour = colourOp ? colourOp.colour : g.isNew && g.plan.noFigure !== true ? g.plan.colour : null;   // (Nov 14, live: a bare red square on a ball's card) his colour only when he is in it   // (Nov 11) the card shows the exact colour as a swatch (Nov 11 night: a new animation's always - it is never asked, so it is always shown)
    const picture = gatePictureKind(g);
    if (picture) ensureGatePicture(g);   // (Nov 22, Arthur: "the image needs to come faster") drawn from the moment the card exists
    // (Nov 22, Arthur: "I don't want to read a book ... a quick summary, easy to understand, with all the details needed") each step's
    // line on the card is Sonnet's own short brief of it (written with the step, never sent to the animator), with its seconds; the exact
    // words the animator gets stay one tap away (exact). A line without a brief stays as it was.
    const briefOf = new Map((turn.kimodoSteps ?? []).map((s, i) => [String(s.text ?? "").trim(), String(turn.stepBriefs?.[i] ?? "").trim()] as const));
    let briefed = false;
    const short = lines.map((l) => { const m = /^([\s\S]*) \((\d+(?:\.\d+)?) s\)$/.exec(l); const b = m ? briefOf.get(m[1].trim()) : ""; if (!m || !b) return l; briefed = true; return `${b} (${m[2]} s)`; });
    return { ok: true as const, turn, animation: g.isNew ? null : snapshot(g.anim), started: false, gate: { credits: g.price.credits, lines: [...short, ...(turn.lookBriefs ?? [])], ...(briefed ? { exact: lines } : {}), notDrawn: [], colour, ...(picture ? { picture } : {}), freeChangesLeft: freeTurnsLeft(g.anim.ownerId, g.anim.projectId), ...(g.isNew ? {} : { edit: true }) } };   // (Nov 14, Arthur: a card always means "I can make exactly this" - nothing on it is "not drawn")
  };
  // (Nov 19 eve, Arthur: "one flowing system ... for any length" - measured: a part written before the part before it existed began with three
  // logs already stacked, then they vanished) THE NEXT PART OF A LONG STORY IS WRITTEN FROM THE REAL LAST PICTURE: the moment a part is done,
  // the chat AI gets his own "add the next part" turn - it sees the saved steps, the step sheet, the colours and the last picture, names only
  // the new steps, and the passed add-on road makes them. He approved the whole story on its first card. Any part that cannot be written or
  // paid stops the story plainly; everything made stays; "continue" goes on from there. A message of his own wins (it replaces the card).
  async function nextPart(anim: Animation, job: Job, n: number) {
    const left = job.parts ?? []; if (!left.length) return;
    const vd = versionDir(anim, n);
    for (let i = 0; i < 40 && !existsSync(join(vd, "colours.json")); i++) await new Promise((r) => setTimeout(r, 250));   // (the step sheet, written right after the job)
    // (Fable review, Nov 19 eve) only THIS part's steps, each with its seconds (a part without seconds came back 60 % longer); the later
    // parts' words are not given, so they are never made twice
    const words = (s: V1KimodoStep[]) => s.map((x) => `${x.text.trim()} (${x.seconds} s)`).join(" ");
    const message = `Add the next part of this story now, going on exactly from the last picture, with these steps and seconds: ${words(left[0])}`
      // (Nov 20, Fable's final check: rewritten "in full detail" under the edit rules, part 2 of his car story got six beats in 2 s, "stomps once",
      // "throws him down" and its looks twice in every `before` - not what the card said) the card's own steps, as given; only where things are changes
      + " Keep each step's beats and seconds exactly as given; change only where someone or something is, to match the last picture; add no beat, pose or look of your own."
      + (left.length > 1 ? " This is NOT the end of the story: nobody comes to rest at the end of this part, and the note about endings does not apply to this turn." : "");
    const fail = (why: string) => { if (!storyBusy.has(anim.animationId)) return; storyBusy.delete(anim.animationId); holdStory(anim, left, job); saveLine(anim.ownerId, anim.projectId, anim.animationId, { role: "assistant", kind: "error", version: n,
      text: `The next part was not made (${why}). Everything made so far is on the canvas, and the rest of your story is kept: press "Make the rest of my story" when you are ready.` }); };
    try {
      const out = await turn({ ownerId: anim.ownerId, projectId: anim.projectId, animationId: anim.animationId, message, recentConversation: job.recentConversation, queued: true });
      const g = gated.get(`${anim.ownerId}|${anim.projectId}`);
      if (!storyBusy.has(anim.animationId)) { if (g && g.ctx.message === message) gated.delete(`${anim.ownerId}|${anim.projectId}`); return; }   // (Nov 20) he pressed Stop between two parts: the story ends here
      if (!out.ok) return fail(out.error);
      if (g && g.ctx.message !== message) { storyBusy.delete(anim.animationId); clearPending(anim); return; }   // (Fable review) a card of HIS OWN is waiting: his message wins, it is never confirmed for him
      if (!g || g.kind !== "edit") return fail("no new steps came back");
      // (Nov 20, money) this part is paid from what is left of the story's one price, so the story never costs more than its first card
      const cap = job.storyLeft ?? g.price.credits, charge = Math.min(g.price.credits, cap);
      g.price = { ...g.price, credits: charge };
      g.ctx = { ...g.ctx, parts: left.slice(1), price: g.price, storyLeft: Math.max(0, cap - charge), storyPart: left[0] };
      const started = confirm(anim.ownerId, anim.projectId);
      if (!started.ok) fail(started.error);
    } catch (error) { fail(error instanceof Error ? error.message : String(error)); }
  }
  function confirm(ownerId: string, projectId: string): V1TurnOutcome {
    const key = `${ownerId}|${projectId}`, g = gated.get(key);
    if (!g) return { ok: false, status: 409, error: "That plan is no longer waiting. Please send your message again - nothing was charged." };
    if (!g.isNew && busyWith(g.anim)) return { ok: false, status: 409, error: plain("edit_while_running") };   // (Nov 25) only HIS animation being made can wait; anyone else's never blocks
    const pic = gatePics.get(g);
    if (pic && !pic.state.done) return { ok: false, status: 409, error: "The first picture is still being drawn. Press Animate when it shows - nothing was charged." };
    const runShort = creditsShortFor(ownerId, g.price.credits, pic ? pic.state.id : null, projectId);   // (Nov 26) its own picture and planning are in this price
    if (runShort) return { ok: false, status: 402, error: runShort };
    gated.delete(key);
    planTurns.delete(key);   // (Nov 26) Animate: the next plan starts with its free changes again
    try { deps.usage?.planningSettled?.(ownerId, projectId); } catch { /* best effort */ }   // ...and this plan's free planning is covered by its price
    if (pic) { pic.state.confirmed = true; chargeGatePicture(g, pic.state); }   // (Nov 22) a new animation's picture is included; a new thing's picture is paid once
    if (g.isNew) animations.set(g.anim.animationId, g.anim);
    startJob(g.anim, g.kind, g.plan, g.edits, { price: g.price, ...g.ctx }, g.still);
    return { ok: true, turn: { intent: g.kind === "create" ? "create" : "edit", say: "" }, animation: snapshot(g.anim), started: true };
  }

  // (Nov 22, Arthur: "one image for that one thing at the beginning ... inside that image is all the stuff that's going to be in the
  // animation"; later: "whenever there's a new thing coming into the story, it's always got to show an image of it") THE GATE PICTURE.
  //   "first": a NEW animation with a scene sentence (the things in it) shows the scene's own LAST picture - exactly the picture the story
  //            starts from. H3's scene clip is cached by its own words, so Animate finds it for $0: the picture is included.
  //   "new":   an edit / added part that brings NEW things (Sonnet's newThings) shows ONE still of them, drawn by H3 into the very picture
  //            they come into (the edit's own start picture), nothing moving. While animating, H3 draws them with the same words. Paid once.
  // Both are made by the SAME engine run Animate starts (same input, director, arguments, env and spawner), stopped at its first clip
  // (ltx-effects/gate-picture/sitecustomize.py: no other paid call; then the whole run is stopped here). Nothing new = no picture.
  // A picture that cost something: the part Animate reuses (the scene: `kept`) is charged only when it is replaced by a new message; the
  // rest (a still of new things) when animated or replaced.
  // (Nov 22, Arthur: "it needs to show everything that's about to show") a NEW animation whose story brings things in LATER (Sonnet's
  // newThings - never in the scene, so never in the first picture) shows the first picture WITH those things put in, standing still: the
  // same still as an edit's new things, drawn from the scene's last picture. The animation still starts from the scene, unchanged.
  // (dad, Nov 26, money only - nothing about how the picture is made changes) a picture that cost something is written down as WAITING
  // (its real cost holds credits and counts toward the daily and trial limits) until it is animated or charged.
  type GatePic = { id: string; done: boolean; picture: string | null; credits: number; kept: number; why: string; confirmed: boolean; rejected: boolean; charged: boolean };
  const gatePics = new WeakMap<Gated, { state: GatePic; promise: Promise<GatePic> }>();
  const gatePictureKind = (g: Gated): "first" | "new" | null =>
    g.isNew && g.kind === "create" && Boolean(String(g.plan.scene ?? "").trim()) ? "first" : g.kind === "edit" && Boolean(g.newThings?.trim()) ? "new" : null;
  const chargeGatePicture = (g: Gated, s: GatePic) => {
    if (s.charged || !s.done || s.credits <= 0) return;
    if (s.confirmed || s.rejected) { try { deps.usage?.pictureWaiting?.(g.anim.ownerId, s.id, 0); } catch { /* best effort */ } }   // (Nov 26) no longer waiting
    // (dad, Nov 26, option d: "no leaks where we're losing money secretly") the plan TEXT changes are free, but a first picture replaced
    // by a change is charged its real cost, once - the card says so (with the number) before the change is sent
    const due = s.confirmed ? s.credits - s.kept : s.rejected ? s.credits : 0;
    if (due <= 0) return;
    s.charged = true;
    try { deps.usage?.pictureCharge?.(g.anim.ownerId, `gate-picture-${newId()}`, due); } catch { /* best effort */ }
  };
  function rejectGatePicture(g: Gated) { const p = gatePics.get(g); if (p) { p.state.rejected = true; chargeGatePicture(g, p.state); } }
  // the run's whole process tree: the engine's spawner kills its group; a part started in a session of its own is found by its parent
  const killTree = (rootPid: number | undefined, extra: number[]) => {
    const pids = new Set<number>(extra.filter((p) => p > 0));
    if (rootPid && rootPid > 0) {
      pids.add(rootPid);
      try {
        const rows = execFileSync("ps", ["-A", "-o", "pid=,ppid="], { encoding: "utf8" }).split("\n").map((l) => l.trim().split(/\s+/).map(Number)).filter((r) => r.length === 2 && r[0] > 0);
        let grew = true;
        while (grew) { grew = false; for (const [pid, ppid] of rows) if (pids.has(ppid) && !pids.has(pid)) { pids.add(pid); grew = true; } }
      } catch { /* the group kill still ran */ }
    }
    for (const pid of pids) { try { process.kill(pid, "SIGKILL"); } catch { /* already gone */ } }
  };
  async function drawGatePicture(g: Gated, state: GatePic, kind: "first" | "new"): Promise<GatePic> {
    const credit = (usd: number) => usd > 0 ? Math.max(1, Math.ceil(usd * 100 - 1e-9)) : 0;
    const end = (picture: string | null, why: string, usd = 0, keptUsd = 0) => {
      state.done = true; state.picture = picture; state.why = why; state.credits = credit(usd); state.kept = Math.min(state.credits, credit(keptUsd));
      if (state.credits > 0) { try { deps.usage?.pictureWaiting?.(g.anim.ownerId, state.id, state.credits); } catch { /* best effort */ } }   // (Nov 26)
      chargeGatePicture(g, state); return state;
    };
    const config = g.ctx.config, books = g.ctx.books;
    const dir = join(g.anim.dir, `gate-picture-${newId()}`);
    try {
      mkdirSync(dir, { recursive: true });
      // exactly the input the job writes: beginJob's for a new animation, runEdit's (editPlanFor) for an edit
      const prevDir = g.kind === "edit" ? g.ctx.prevDir ?? null : null;
      let plan: V1Plan;
      if (g.kind === "edit") {
        const built = editPlanFor({ steps: g.ctx.steps, basePlan: g.ctx.basePlan, books, prevDir, anim: g.anim, remakeAll: g.ctx.remakeAll, message: g.ctx.message, recentConversation: g.ctx.recentConversation }, g.edits ?? []);
        if ("error" in built) return end(null, built.error);
        plan = built.plan;
      } else plan = { ...g.plan, context: { words: makeWords(g.ctx.message, g.ctx.recentConversation) } };
      const version: V1Version = { n: g.anim.versions.length + 1, plan, edits: g.edits, ...(g.still ? { still: true } : {}),
        status: "running", stage: stageOf(books, "planning"), progress: null, report: null, message: null, createdAt: now(), finishedAt: null };
      const inputPath = join(dir, "input.plan.json");
      writeJson(inputPath, engineInput(version));
      let directorDir: string | null = null;
      if (deps.director) {
        const d = await deps.director({ ownerId: g.anim.ownerId, projectId: g.anim.projectId, config, books, plan: version.plan, prevDir, versionDir: dir })
          .catch((error: unknown) => ({ ok: false as const, words: String(error instanceof Error ? error.message : error).slice(0, 200) }));
        if (!d.ok) return end(null, d.words);
        directorDir = d.dir;
      }
      const out = join(dir, "gate-picture.json");
      const base = engineEnv(config);
      const env = { ...base, ...(version.plan.cameraMoves === true ? { H3_CAMERA: "moves" } : {}), ...(g.ctx.parts?.length ? { H3_MORE_PARTS: "1" } : {}),
        H3_GATE_PICTURE: out, ...(g.newThings?.trim() ? { H3_GATE_STILL: g.newThings.trim() } : {}),   // (Nov 22, Arthur: "it needs to show everything") the things that come later too
        // (Nov 22, live: the cat and balloon picture lost the red helicopter) what is already in the edit's start picture, in Sonnet's own words
        // (the first new step's `before`), so the still keeps it; a new animation's still names its scene instead (sitecustomize)
        ...(g.kind === "edit" && g.newThings?.trim() ? (() => { const keep = (g.ctx.steps ?? []).find((st) => st.changed !== false && st.before?.trim())?.before?.trim(); return keep ? { H3_GATE_KEEP: keep } : {}; })() : {}),
        PYTHONPATH: [join(config.root, "ltx-effects", "gate-picture"), base.PYTHONPATH].filter(Boolean).join(":") };
      const child = deps.spawn(config.python, engineArgs(config, inputPath, dir, prevDir, directorDir), { cwd: join(config.root, "ltx-effects"), env });
      child.stdout?.on("data", () => undefined); child.stderr?.on("data", () => undefined);
      const limitMs = Math.min(Math.max(60_000, config.timeoutMs || 0), 360_000), t0 = Date.now();
      let closed = false;
      child.on("close", () => { closed = true; }); child.on("error", () => { closed = true; });
      const got = await new Promise<{ png?: string | null; usd?: number; kept_usd?: number; why?: string; pid?: number } | null>((resolve) => {
        const tick = () => {
          if (existsSync(out)) { try { resolve(JSON.parse(readFileSync(out, "utf8"))); } catch { resolve(null); } return; }
          if (closed || Date.now() - t0 > limitMs) { resolve(null); return; }
          setTimeout(tick, 250);
        };
        tick();
      });
      try { child.kill("SIGKILL"); } catch { /* gone */ }
      killTree((child as { pid?: number }).pid, [Number(got?.pid) || 0]);
      const usd = Math.max(0, Number(got?.usd) || 0);
      const keptUsd = got && Number.isFinite(Number(got.kept_usd)) ? Math.max(0, Number(got.kept_usd)) : kind === "first" && !g.newThings?.trim() ? usd : 0;   // (the scene: Animate reuses it)
      if (!got) return end(null, closed ? "the animator stopped before the picture" : "the picture took too long");
      if (!got.png || !existsSync(got.png)) return end(null, String(got.why || "no picture came back"), usd, keptUsd);
      return end(`data:image/png;base64,${readFileSync(got.png).toString("base64")}`, "", usd, keptUsd);
    } catch (error) {
      return end(null, String(error instanceof Error ? error.message : error).slice(0, 200));
    } finally {
      try { rmSync(dir, { recursive: true, force: true }); } catch { /* a leftover folder is harmless */ }
    }
  }
  function ensureGatePicture(g: Gated) {
    const kind = gatePictureKind(g);
    if (!kind) return null;
    let p = gatePics.get(g);
    if (!p) {
      const state: GatePic = { id: `gate-picture-${newId()}`, done: false, picture: null, credits: 0, kept: 0, why: "", confirmed: false, rejected: false, charged: false };
      p = { state, promise: drawGatePicture(g, state, kind) };
      gatePics.set(g, p);
    }
    return p;
  }
  function gatePicture(ownerId: string, projectId: string): Promise<{ ok: true; picture: string | null; credits: number; animateCredits: number; why: string; kind: "first" | "new" | null } | { ok: false; status: number; error: string }> {
    const g = gated.get(`${ownerId}|${projectId}`);
    if (!g) return Promise.resolve({ ok: false as const, status: 409, error: "That plan is no longer waiting." });
    const p = ensureGatePicture(g), kind = gatePictureKind(g);
    if (!p) return Promise.resolve({ ok: true as const, picture: null, credits: 0, animateCredits: 0, why: "", kind: null });
    return p.promise.then((s) => ({ ok: true as const, picture: s.picture, credits: s.credits, animateCredits: s.credits - s.kept, why: s.why, kind }));   // (credits = if the plan is changed instead)
  }

  async function turn(request: V1TurnRequest): Promise<V1TurnOutcome> {
    const config = deps.config();
    if (!config) return { ok: false, status: 503, error: NO_ENGINE };
    let books: V1Books;
    try { books = deps.books(config); } catch (error) { return { ok: false, status: 503, error: `Luna's book could not be read: ${error instanceof Error ? error.message : String(error)}` }; }
    const { book } = books;
    const anim = request.animationId ? own(request.ownerId, request.projectId, request.animationId) : null;
    if (request.animationId && !anim) { gated.delete(`${request.ownerId}|${request.projectId}`); return { ok: false, status: 404, error: serverWord(book, "animation_missing") }; }
    // (Nov 20) A STORY IS ONE STORY: while its next part is being made, a message of his is answered at once - no minute of Sonnet, no
    // change built on half a story (his boulder and jackhammer stories) - and his words stay in the chat. It touches nothing of the story's own
    // turn (its card is never removed by it).
    if (!request.queued && anim && storyBusy.has(anim.animationId)) {
      const say = "Your story is still being made - its next part comes in about a minute. Watch it when it is all there, then send your message again. Nothing changed yet.";
      saveLine(request.ownerId, request.projectId, anim.animationId, { role: "user", text: request.message });
      saveLine(request.ownerId, request.projectId, anim.animationId, { role: "assistant", text: say });
      return { ok: true, turn: { intent: "conversation", say } as V1LunaTurn, animation: snapshot(anim), started: false };
    }
    { const was = gated.get(`${request.ownerId}|${request.projectId}`); if (was) rejectGatePicture(was); }   // (Nov 22) a paid gate picture he did not animate is charged once
    gated.delete(`${request.ownerId}|${request.projectId}`);   // (Nov 11) a new message replaces a plan still waiting at its card
    // (Nov 20, live test: the version on the canvas had no folder any more - cleared to free space - and "only step 1" re-made ALL 303 pictures)
    // a change of an animation whose pictures are gone is never made silently from nothing: said at once, nothing sent, nothing charged
    if (!request.queued && anim && anim.current > 0 && anim.versions.find((v) => v.n === anim.current)?.status === "done" && !existsSync(versionDir(anim, anim.current))) {
      const say = "The pictures of this animation are no longer on this computer (they were cleared to free space), so I can't change only one part of it. Nothing was sent to the AI and nothing was charged. Tell me the whole animation again as a new one, and I'll make it.";
      saveLine(request.ownerId, request.projectId, anim.animationId, { role: "user", text: request.message });
      saveLine(request.ownerId, request.projectId, anim.animationId, { role: "assistant", kind: "error", text: say });
      return { ok: false, status: 409, error: say };
    }
    // (Nov 20, 9 of his 17 errors were a full disk, each found only after a minute of the AI and his card) THE ROOM IS LOOKED AT FIRST: less room
    // than one 15-second animation takes (the engine book's own disk.mb_per_s, his biggest stories) = said at once, nothing sent, nothing charged
    if (!request.queued) {
      try {
        const st = statfsSync(config.outDir), freeMb = (Number(st.bavail) * Number(st.bsize)) / 1e6, needMb = 15 * 35;
        if (Number.isFinite(freeMb) && freeMb < needMb) {
          const say = `The computer that makes the animations is out of storage space (${Math.round(freeMb)} MB free; a 15-second animation needs about ${needMb} MB). Nothing was sent to the AI and nothing was charged - free some space and send it again.`;
          saveLine(request.ownerId, request.projectId, anim?.animationId ?? null, { role: "user", text: request.message });
          saveLine(request.ownerId, request.projectId, anim?.animationId ?? null, { role: "assistant", kind: "error", text: say });
          return { ok: false, status: 507, error: say };
        }
      } catch { /* the engine still looks before it makes anything */ }
    }
    const base = anim ? basePlanOf(anim) : null;
    const engineFps = anim ? engineFpsOf(anim) : 0;
    const partSeconds = partSecondsOf(base), backupMoves = backupMovesOf(base);
    // (Nov 2 final round) the user's drawing: used only when the book has the canvas section and the picture keeps to its limits
    const canvas = acceptV1Canvas(book, request.canvas);
    const sheet = acceptV1Sheet(book, request.sheet); // (Nov 2 night) the timeline contact sheet (book canvas.sheet; same guard)
    // (Nov 13) the AI sees the animation it edits: the engine's own sheet of the current version (one picture per move), when there is one
    // (Nov 19, Arthur: "make the purple thing blue ... it struggled" - that sheet is ONE picture for a whole animation made by the one animator,
    // and the potion was not in it) when the version has them: one picture per STEP + the colours measured in its pictures
    // (ltx-effects/v1k/step_sheet.py writes both after every job). A version without them = the engine's own sheet, as before.
    const stepsFile = anim ? join(versionDir(anim, anim.current), "steps_sheet.png") : "", coloursFile = anim ? join(versionDir(anim, anim.current), "colours.json") : "";
    let seenNote = "";
    try { if (stepsFile && existsSync(stepsFile) && existsSync(coloursFile)) seenNote = String((JSON.parse(readFileSync(coloursFile, "utf8")) as { note?: unknown }).note ?? ""); } catch { seenNote = ""; }
    const sheetFile = seenNote ? stepsFile : anim ? join(versionDir(anim, anim.current), "viewer_sheet.png") : "";
    const animation: V1CanvasPicture | null = sheetFile && existsSync(sheetFile) ? { mediaType: "image/png", data: readFileSync(sheetFile).toString("base64"), width: 0, height: 0, ...(seenNote ? { note: seenNote } : {}) } : null;
    // (Nov 15 night, Arthur: "handoffs need memory") the AI sees the picture an added part goes on from: the current version's LAST picture
    let last: V1CanvasPicture | null = null;
    const mirrored = base?.plan.mirror === true;
    try {
      const layersDir = anim ? join(versionDir(anim, anim.current), "layers") : "";
      const lastFile = layersDir && existsSync(layersDir) ? readdirSync(layersDir).filter((f) => /^\d+\.png$/.test(f)).sort().pop() : undefined;
      if (lastFile && statSync(join(layersDir, lastFile)).size <= 3_000_000) {
        // (seen in the door: the pictures have see-through paper, and from the bare file he read the T-Rex facing the wrong way) on WHITE paper, smaller
        try {
          const sharp = (await import("sharp")).default;
          // (Nov 15 night, THE CAUSE of "the T-Rex went the wrong way": his story is shown MIRRORED (plan.mirror, set when he asked for
          // leftward), so left and right on screen are the opposite of the animator's own pictures - and the added part's sides were
          // written from the screen) a mirrored animation's last picture is turned back: the AI sees it as the ANIMATOR sees it
          const turned = sharp(join(layersDir, lastFile)).flatten({ background: "#ffffff" });
          const onWhite = await (mirrored ? turned.flop() : turned).resize({ width: 1024, withoutEnlargement: true }).jpeg({ quality: 82 }).toBuffer();
          last = { mediaType: "image/jpeg", data: onWhite.toString("base64"), width: 0, height: 0 };
        } catch { last = mirrored ? null : { mediaType: "image/png", data: readFileSync(join(layersDir, lastFile)).toString("base64"), width: 0, height: 0 }; }   // (never a wrong-way picture)
      }
    } catch { last = null; }
    // (usage) the same credits rule as the Help Assistant: checked before the paid call, spent once it is answered
    const short = request.queued ? null : creditsShortFor(request.ownerId, AI_ACTION_CREDITS.chat);   // (Nov 20) a story's own next-part turn is in its one price
    if (short) return { ok: false, status: 402, error: short };
    let asked: Awaited<ReturnType<V1LunaCall>>;
    try {
      asked = await deps.luna({
        ownerId: request.ownerId, projectId: request.projectId, message: request.message, recentConversation: request.recentConversation,
        current: anim?.versions.some((v) => v.status === "done") ? base?.plan ?? null : null /* (Nov 18) a try that made nothing is no animation: the next turn is still a NEW animation */, checkerSaid: null, lastAnswer: null, ...(request.queued ? { nextPart: true } : {}), ...(partSeconds ? { partSeconds } : {}), ...(backupMoves ? { backupMoves } : {}), ...(canvas ? { canvas } : {}), ...(sheet ? { sheet } : {}), ...(animation ? { animation } : {}), ...(last ? { last, ...(mirrored ? { lastMirrored: true } : {}) } : {}),
        ...(request.effort ? { effort: request.effort } : {}),
        playback: anim && engineFps > 0 ? { fps: anim.fps ?? request.projectFps ?? engineFps, engineFps, speed: anim.speed ?? 1 } : null,   // (Nov 11) the FPS the canvas really plays
      });
    } catch (error) { asked = { ok: false, failure: "unreachable", detail: String(error) }; }
    if (!asked.ok) {   // (Nov 14, live: after a reload the message that got no answer was gone) a turn that fails is kept in the chat too
      const error = askFailedWords(book, asked.failure);
      saveLine(request.ownerId, request.projectId, request.animationId, { role: "user", text: request.message }); saveLine(request.ownerId, request.projectId, request.animationId, { role: "assistant", text: error });
      return { ok: false, status: 502, error };
    }
    if (!request.queued) {
      const planKey = `${request.ownerId}|${request.projectId}`, n = (planTurns.get(planKey) ?? 0) + 1;
      planTurns.set(planKey, n);
      try { deps.usage?.turnAnswered?.({ ownerId: request.ownerId, projectId: request.projectId, turnId: newId(), costUsd: asked.costUsd ?? null, realCostUsd: asked.realCostUsd ?? asked.costUsd ?? null, free: n <= 1 + FREE_PLAN_CHANGES }); } catch { /* metering never breaks a reply */ }
    }
    let said = asked.turn;
    // every turn is kept on disk (the user's words + what was said back), so a reload / restart shows the same chat
    // (kind "plan" = a story plan was proposed: a later long create is the agreed plan's part 1)
    const keep = (out: V1TurnOutcome, kind?: "plan"): V1TurnOutcome => {
      const id = out.ok ? out.animation?.animationId ?? request.animationId : request.animationId;
      if (!request.queued) saveLine(request.ownerId, request.projectId, id, { role: "user", text: request.message });   // (Nov 20) the app's own next-part words are not his
      if (out.ok) saveLine(request.ownerId, request.projectId, id, { role: "assistant", text: out.turn.say, ...(kind ? { kind } : {}) });
      return out;
    };
    // (Nov 2, Arthur) PLAN FIRST - a SERVER guard, not only the book: a create that is a story (asked longer than one block + the
    // book's tolerance, or a plan of 2+ parts) with no plan proposed since the last animation was made becomes the clarify plan. Never
    // silently shrunk. Meaning comes from the AI's structured fields (requestedSeconds, storyPlan); the numbers + words are the book's.
    // (Nov 2 eve, Arthur: "when I say in detail what I want, he needs to do it") a create that NAMES the actions is made now, whole; only the
    // AI's own clarify (a request with no actions named) is a plan turn. planProposed stays for the next-part wording.
    // (Nov 13, Arthur: "zero roadblocks - the only limit is H3") the long-request guard is gone: a create is made whole, at once, however long.
    if (isStory(said, book) && said.intent === "clarify") {
      const planTurn: V1LunaTurn = { ...said, say: stripLengths(said.say, book) };   // (Nov 13, Arthur: any length is fine - no talk of parts, runs or cost)
      return keep({ ok: true, turn: planTurn, animation: anim ? snapshot(anim) : null, started: false }, "plan");
    }
    const gateSay = said.say;   // (Nov 11, Arthur: the brief says only what will happen - no length or how-to-change lines at the gate)
    if (said.intent === "create" && !deps.gate) said = { ...said, say: honestLength(said, book) }; // every create says how long the part is
    // (Nov 2 final round) the panel found the user's ground line under him: the reply says his feet go on it (the book's line, $0)
    if (said.intent === "create" && request.ground === true && book.canvas?.groundSay) said = { ...said, say: withLine(said.say, book.canvas.groundSay) };
    const told = (key: string, fill: Record<string, string | number> = {}): V1TurnOutcome => keep({ ok: true, turn: { intent: said.intent, say: serverWord(book, key, fill) }, animation: anim ? snapshot(anim) : null, started: false });
    const ctx = { config, books, message: request.message, recentConversation: request.recentConversation };

    // (Nov 17, PLAN_FINAL_NOV17) Sonnet's parts: part 1 is made now, the rest one after another (job.parts); a story of one part = as before
    const allSteps = said.intent === "create" ? said.kimodoSteps ?? null : null;
    const partsOf = (allSteps ?? []).reduce<V1KimodoStep[][]>((out, { part, ...s }) => { const k = Math.max(0, (part ?? 1) - 1); if (k > out.length - 1 && out.at(-1)?.length) out.push([]); (out.at(-1) ?? (out[0] = [])).push(s); return out; }, [[]]).filter((g) => g.length);
    if (allSteps && partsOf.length) said = { ...said, kimodoSteps: partsOf[0] };
    const madePlan = said.intent === "create" ? planFromCreate(said, book, books.words, [request.message, ...(request.recentConversation ?? []).filter((l) => l.role === "user").map((l) => l.content)].join("\n")) : null;
    // (Nov 14, "trees getting cut off") a new animation is made in the page's own shape (between a tall phone page and a very wide one), so the animator's frame lies on the page edge to edge
    const shape = request.page ? Math.min(2.4, Math.max(0.5, request.page[0] / request.page[1])) : null;
    const firstPlan = madePlan && shape ? { ...madePlan, page: Math.round(shape * 1000) / 1000 } : madePlan;
    if (firstPlan) {
      // (Nov 20, money) ONE price for the whole animation, every part of a long story included: 4 × (seconds + 3-second scene) + the chat
      // turn (v1Price.ts). The first part is charged its own share; the later parts share what is left, never more.
      const stepSeconds = (steps: V1KimodoStep[] | null | undefined) => (steps ?? []).reduce((t, s) => t + (Number(s.seconds) || 0), 0);
      // (Nov 22, Arthur: "the credits always gotta pay for Sonnet and fal, but not ridiculous amounts" - measured: his turn was paid twice,
      // once when answered and once inside the card) the card is the animator's price only; his answer was already paid, at its real cost
      // (dad, Nov 26) ...and its PLANNING is in that one price (chat: the flat planning amount, plans.ts PLANNING_CREDITS), charged with part 1
      const wholePrice = priceOf({ newSeconds: stepSeconds(allSteps ?? said.kimodoSteps) || planSeconds(firstPlan), chat: true });
      const firstPrice = partsOf.length > 1 ? priceOf({ newSeconds: stepSeconds(partsOf[0]), chat: true }) : wholePrice;
      const runShort = creditsShortFor(request.ownerId, wholePrice.credits);
      if (runShort) return { ok: false, status: 402, error: runShort };
      const animationId = newId();
      const created: Animation = {
        animationId, projectId: request.projectId, ownerId: request.ownerId, dir: join(projectDir(config, request.projectId), safeSegment(animationId)),
        versions: [], current: 0, fps: null, layerId: null, layerCount: null,
      };
      const createCtx = { ...ctx, message: said.heard || ctx.message, basePlan: null, prevDir: null, askedS: Math.max(askedSecondsOf(said, book), planSeconds(firstPlan)), ...(partsOf.length > 1 ? { parts: partsOf.slice(1), storyLeft: storyLeftAfter(wholePrice, firstPrice) } : {}), price: firstPrice };   // (Nov 11) H3 reads what he MEANS   // (Nov 13) the time limit follows the animation's own length: a long make is never stopped
      if (deps.gate) {   // (Nov 11) the gate: planned, not made or charged until the user presses Animate (confirm)
        return keep(hold(`${request.ownerId}|${request.projectId}`, { anim: created, isNew: true, kind: "create", plan: firstPlan, edits: null, ctx: createCtx, still: said.still === true, price: wholePrice, ...(said.newThings ? { newThings: said.newThings } : {}) }, { ...said, say: gateSay }, [...gateLines(allSteps ?? said.kimodoSteps, true), ...(request.projectFps ? [`${request.projectFps} fps`] : [])]));   // (Nov 11 night: the frame rate is the project's, never asked, always shown)
      }
      animations.set(animationId, created);
      startJob(created, "create", firstPlan, null, createCtx, said.still === true);
      return keep({ ok: true, turn: said, animation: snapshot(created), started: true });
    }
    // (Nov 2) CLEAR CANVAS ($0, no engine run): the panel removes the AI animation's layer(s) (scope "all": every frame on the canvas,
    // only after the user said yes - else the book's one-sentence question first). The next animation starts fresh.
    const clearOp = said.intent === "edit" ? said.ops?.find((op): op is Extract<V1EditOp, { op: "clear" }> => op.op === "clear") : undefined;
    if (clearOp) {
      if (clearOp.scope === "all" && !clearOp.confirmed) return keep({ ok: true, turn: { intent: "clarify", say: serverWord(book, "clear_all_confirm") }, animation: anim ? snapshot(anim) : null, started: false });
      if (anim && busyWith(anim)) return told("edit_while_running");   // (Nov 25) only this animation being made blocks a clear
      if (anim) { anim.layerId = null; anim.layerCount = null; persist(anim); }
      return keep({ ok: true, turn: { intent: "edit", say: said.say, ops: [clearOp], clear: { scope: clearOp.scope } }, animation: null, started: false });
    }
    if (said.intent === "edit" && said.ops) {
      if (!anim || !base) return told("nothing_to_edit");
      // fps = playback only ($0, no engine run, no new version): at most the engine's own pictures per second (more is not smoother)
      const fpsOp = [...said.ops].reverse().find((op): op is Extract<V1EditOp, { op: "fps" }> => op.op === "fps");
      const engineOps = said.ops.filter((op) => op.op !== "fps" && op.op !== "speed");
      // (Nov 2) speed = playback only too ($0, no engine run, no new version): the panel re-times the placed pictures
      const speedOp = [...said.ops].reverse().find((op): op is Extract<V1EditOp, { op: "speed" }> => op.op === "speed");
      if (speedOp) {
        if (!(engineFps > 0)) return told("nothing_to_edit");
        const speed = Math.max(book.speed.min, Math.min(book.speed.max, speedOp.speed));
        anim.speed = Math.abs(speed - 1) < 1e-6 ? null : speed;
        persist(anim);
      }
      let fpsSay: string | null = null;
      if (fpsOp) {
        if (!(engineFps > 0)) return told("nothing_to_edit");
        const fps = Math.max(books.words.fpsMin, Math.min(engineFps, fpsOp.fps));
        fpsSay = fpsOp.fps > engineFps ? serverWord(book, "fps_capped", { fps: engineFps }) : null;
        anim.fps = fps === engineFps ? null : fps;
        persist(anim);
      }
      const stepEdit = Boolean(said.kimodoSteps?.length || said.removeSteps?.length);   // (Nov 15) an edit that names steps is an edit, whatever ops came with it
      if (!engineOps.length && !stepEdit) return keep({ ok: true, turn: { ...said, say: fpsSay ?? said.say }, animation: snapshot(anim), started: false });
      // (Nov 22, Arthur: "it's going to be like this permanently ... you can change the animation, but not how it looks") once a thing is
      // animated its look never changes: a colour / look / style order, or a look put on a saved step, is never run - he is told plainly
      const lookOrder = engineOps.some((op) => op.op === "colour" || op.op === "style" || op.op === "look")
        || (said.kimodoSteps ?? []).some((s) => (s.step ?? 0) > 0 && typeof s.look === "string" && s.look.trim() !== "");
      if (lookOrder) return keep({ ok: true, turn: { intent: "clarify", say: LOOKS_STAY }, animation: snapshot(anim), started: false });
      if (busyWith(anim)) return told("edit_while_running");   // (Nov 25) another person's animation never blocks an edit: it waits in line if the machine is full
      const editShort = request.queued ? null : creditsShortFor(request.ownerId, AI_ACTION_CREDITS.chat);   // (the exact price is checked below, once it is known)
      if (editShort) return { ok: false, status: 402, error: editShort };
      const prevDir = base.status === "done" ? versionDir(anim, base.n) : null;
      // (still: what Luna said for this edit; not said = the version it changes)
      // (Nov 15, Arthur: "No more rewrites") the edit's steps = the SAVED steps with only the named change put in (applyStepEdits)
      const savedSteps = base.plan.blocks.flatMap((b) => b.steps ?? []);
      const built = savedSteps.length && stepEdit ? applyStepEdits(savedSteps, said.kimodoSteps ?? [], said.removeSteps ?? []) : null;
      if (built && "error" in built) return keep({ ok: true, turn: { intent: said.intent, say: serverWord(book, "edit_failed", { words: "I pointed at a step that is not in your animation, so nothing was changed. Please say it once more." }) }, animation: snapshot(anim), started: false });
      const truth = built ? editTruthLines(savedSteps, said.kimodoSteps ?? [], said.removeSteps ?? []) : [];
      const namedSteps = built ?? said.kimodoSteps ?? null;   // (Nov 14, no guards: live, "make the tree bigger" changed nothing - the steps Sonnet changed were put back) his steps as he wrote them
      // (Nov 22, Arthur: "whenever I do a tiny narrow tweak ... it'll start coming out jittery, bad timing ... it's trying to keep all these
      // parts") A SHORT ANIMATION IS MADE AGAIN WHOLE: 15 s or less with 10 steps or fewer, any change to its moves (a step changed, taken out
      // or put in between) = every step made again from the same first picture (editPlanFor, no --prev). Steps only added at the end, or the
      // very same steps, keep everything before (as always); a longer animation keeps its parts (as always).
      const sameStep = (a: V1KimodoStep, b: V1KimodoStep) => a.text.trim() === b.text.trim() && Number(a.seconds) === Number(b.seconds);
      const keepsAll = !!namedSteps && namedSteps.length >= savedSteps.length && savedSteps.every((st, i) => sameStep(st, namedSteps[i]));
      // (an animation whose saved steps carry a look - a colour put on its pictures before Nov 22 - keeps its parts: a whole make starts
      // from the first picture as the animator drew it, so that look would be lost)
      const remakeAll = !!namedSteps?.length && savedSteps.length > 0 && !keepsAll && savedSteps.length <= REMAKE_ALL_MAX_STEPS
        && savedSteps.reduce((t, st) => t + (Number(st.seconds) || 0), 0) <= REMAKE_ALL_MAX_S && !savedSteps.some((st) => typeof st.look === "string" && st.look.trim() !== "");
      const editSteps = remakeAll ? namedSteps!.map((st) => ({ ...st, changed: true })) : namedSteps;
      const jobPrev = remakeAll ? null : prevDir;
      const editStill = typeof said.still === "boolean" ? said.still : said.kimodoSteps?.length ? false : base.still === true;
      const editS = (editSteps ?? []).reduce((t, s) => t + s.seconds, 0) || planSeconds(base.plan);   // (Nov 13) the job's time limit follows the animation's own length
      // (Nov 13 night, Arthur: the animator is the one and only animator) his LINES and his HEAD (thickness, hollow, size) are drawn by the
      // animator itself: a different one = the animator makes the animation again as a new take - the card says so, at a new animation's price
      const styleOp = engineOps.find((op): op is Extract<V1EditOp, { op: "style" }> => op.op === "style"), lookNow = styleOp ? cleanStyle(styleOp.style ?? {}) ?? {} : null, lookWas = base.plan.style ?? {};
      const newLook = !!lookNow && ((lookNow.hollowHead === true) !== (lookWas.hollowHead === true) || (lookNow.pen ?? "normal") !== (lookWas.pen ?? "normal")
        || Math.abs((lookNow.headScale ?? 1) - (lookWas.headScale ?? 1)) > 1e-6 || Math.abs((lookNow.penScale ?? 1) - (lookWas.penScale ?? 1)) > 1e-6);
      // (Nov 17, Arthur: "H3 is the camera") an edit that asks for a camera move, cut or transition turns the moving camera on for this animation
      const camPlan = said.cameraMoves === true && base.plan.cameraMoves !== true ? { ...base.plan, cameraMoves: true as const } : base.plan;
      // (Nov 20, money) the edit's exact price from what will really be made (v1Price.ts): the steps H3 makes again at 4 a second, looks put
      // on the saved pictures by their kind, a new line/head style = the whole animation again, removing steps = the 1-second join; + the chat turn
      const added = Math.max(engineOps.filter((op) => op.op === "append").length, built && (said.kimodoSteps ?? []).some((s) => !(s.step ?? 0)) ? 1 : 0);   // (Nov 15) new steps named by the edit are an add-on, as an append is
      const madeAgain = (editSteps ?? []).filter((s) => s.changed !== false);
      const pictureLooks = [...new Set(madeAgain.filter((s) => s.look && isColourLook(s.look)).flatMap((s) => lookParts(s.look)))];
      const motionOps = engineOps.some((op) => op.op === "rewrite" || op.op === "append" || op.op === "redo");
      const remade = madeAgain.filter((s) => !s.look || !isColourLook(s.look)).reduce((t, s) => t + (Number(s.seconds) || 0), 0);
      const editPrice = priceOf({
        remadeSeconds: remade || (motionOps && !editSteps ? planSeconds(base.plan) : 0), added: added > 0, newTake: newLook,
        fillLooks: pictureLooks.filter((p) => lookKindOf(p) === "fill").length, redrawLooks: pictureLooks.filter((p) => lookKindOf(p) === "redraw").length,
        animationSeconds: planSeconds(base.plan), removeOnly: !madeAgain.length && (said.removeSteps?.length ?? 0) > 0, chat: true,   // (dad, Nov 26) the edit's planning is in its price (its answers are not charged one by one)
        ending: (added > 0 && !request.queued) || remakeAll,   // (Nov 22) its last clip ends the animation: the settle second fal is paid for
      });
      const payShort = creditsShortFor(request.ownerId, editPrice.credits);   // (Nov 11) never a card the account cannot pay for
      if (payShort) return { ok: false, status: 402, error: payShort };
      if (deps.gate) {   // (Nov 11) an edit waits at the gate too; the card lists only the steps that will really be made again
        return keep(hold(`${request.ownerId}|${request.projectId}`, { anim, isNew: false, kind: "edit", plan: camPlan, edits: engineOps, ctx: { ...ctx, basePlan: camPlan, prevDir: jobPrev, steps: editSteps, askedS: editS, ...(remakeAll ? { remakeAll: true } : {}) }, still: editStill, price: editPrice, ...(said.newThings ? { newThings: said.newThings } : {}) }, said, [...gateLines(editSteps), ...(remakeAll ? [REMAKE_ALL_LINE] : truth), ...(newLook ? [serverWord(book, "new_take_look")] : [])]));
      }
      startJob(anim, "edit", camPlan, engineOps, { ...ctx, basePlan: camPlan, prevDir: jobPrev, steps: editSteps, askedS: editS, price: editPrice, ...(remakeAll ? { remakeAll: true } : {}) }, editStill);   // (Nov 5, live: "now make him run and do a backflip" on a drawing stayed ONE picture) new moves = an animation
      said = { ...said, say: editLength(said.say, engineOps, base.plan, partSeconds ?? {}, request.message, book) };   // (Nov 2 app round) ONE length line
      return keep({ ok: true, turn: fpsSay ? { ...said, say: `${said.say} ${fpsSay}` } : said, animation: snapshot(anim), started: true });
    }
    return keep({ ok: true, turn: said, animation: anim ? snapshot(anim) : null, started: false });
  }

  // a plan was proposed (saved line kind "plan") after the last animation result = the user's create now is that plan's part 1
  function planProposed(ownerId: string, projectId: string): boolean {
    const lines = savedLines(ownerId, projectId);
    for (let i = lines.length - 1; i >= 0; i--) { if (lines[i].kind === "result") return false; if (lines[i].kind === "plan") return true; }
    return false;
  }

  const wordsFor = (): LunaBook | null => { const config = deps.config(); if (!config) return null; try { return deps.books(config).book; } catch { return null; } };
  const plain = (key: string, fill: Record<string, string | number> = {}) => { const book = wordsFor(); return book ? serverWord(book, key, fill) : NO_ENGINE; };

  function get(ownerId: string, projectId: string, animationId: string): V1AnimationSnapshot | null {
    const anim = own(ownerId, projectId, animationId);
    return anim ? snapshot(anim) : null;
  }

  // The project's latest animation (the one made or changed last) + the saved chat: what the panel restores when it opens again.
  function latest(ownerId: string, projectId: string): { animation: V1AnimationSnapshot | null; lines: (V1SavedLine & { animationId: string | null })[] } {
    loadProject(ownerId, projectId);
    const stamp = (a: Animation) => a.versions.reduce((t, v) => (v.finishedAt ?? v.createdAt) > t ? (v.finishedAt ?? v.createdAt) : t, "");
    const mine = [...animations.values()].filter((a) => a.ownerId === ownerId && a.projectId === projectId);
    const newest = mine.reduce<Animation | null>((best, a) => !best || stamp(a) >= stamp(best) ? a : best, null);
    return { animation: newest ? snapshot(newest) : null, lines: savedLines(ownerId, projectId) };
  }

  // The canvas layer the panel put the animation on (+ how many frames it fills): kept so a reload still replaces THAT layer.
  function setLayer(ownerId: string, projectId: string, animationId: string, layerId: string, count: number): V1ActionOutcome {
    const anim = own(ownerId, projectId, animationId);
    if (!anim) return { ok: false, status: 404, error: plain("animation_missing") };
    anim.layerId = layerId; anim.layerCount = Number.isSafeInteger(count) && count > 0 ? count : null;
    persist(anim);
    return { ok: true, animation: snapshot(anim) };
  }

  function step(ownerId: string, projectId: string, animationId: string, direction: "undo" | "redo"): V1ActionOutcome {
    const anim = own(ownerId, projectId, animationId);
    if (!anim) return { ok: false, status: 404, error: plain("animation_missing") };
    if (storyBusy.has(anim.animationId)) return { ok: false, status: 409, error: "Your story is still being made. Undo and Redo work again when it is all there." };   // (Nov 20, Fable) never a next part built on an undone version
    const done = anim.versions.filter((v) => v.status === "done").map((v) => v.n);
    const target = direction === "undo" ? Math.max(...done.filter((n) => n < anim.current)) : Math.min(...done.filter((n) => n > anim.current));
    if (!Number.isFinite(target)) return { ok: false, status: 409, error: plain(direction === "undo" ? "nothing_to_undo" : "nothing_to_redo") };
    anim.current = target;
    persist(anim);
    // (Nov 2, Arthur) Undo / Redo are silent: no chat line is said or saved
    return { ok: true, animation: snapshot(anim) };
  }

  // (Nov 20, Fable) "Leave it as it is": the kept story is let go; nothing is made, nothing charged
  function dropStory(ownerId: string, projectId: string, animationId: string): V1ActionOutcome {
    const anim = own(ownerId, projectId, animationId);
    if (!anim) return { ok: false, status: 404, error: plain("animation_missing") };
    if (storyHeld.delete(anim.animationId)) clearPending(anim);
    return { ok: true, animation: snapshot(anim) };
  }
  // (Nov 20) "Make the rest of my story": the kept parts, exactly as the card said, from the picture on the canvas now - the passed next-part road
  function continueStory(ownerId: string, projectId: string, animationId: string): V1ActionOutcome {
    const anim = own(ownerId, projectId, animationId);
    if (!anim) return { ok: false, status: 404, error: plain("animation_missing") };
    const held = storyHeld.get(anim.animationId);
    if (!held || storyBusy.has(anim.animationId)) return { ok: false, status: 409, error: "There is no unfinished story to make right now." };
    if (busyWith(anim)) return { ok: false, status: 409, error: plain("edit_while_running") };
    if (!(anim.current > 0 && anim.versions.find((v) => v.n === anim.current)?.status === "done")) return { ok: false, status: 409, error: "There is no finished animation on the canvas to go on from." };
    storyHeld.delete(anim.animationId);
    storyBusy.set(anim.animationId, held.parts.length);
    try { writeFileSync(join(anim.dir, "story-pending.json"), JSON.stringify({ version: anim.current, left: held.parts.length, parts: held.parts, storyLeft: held.storyLeft, recentConversation: held.recentConversation })); } catch { /* best effort */ }
    saveLine(ownerId, projectId, anim.animationId, { role: "assistant", text: `Making the rest of your story now (${held.parts.length} part${held.parts.length > 1 ? "s" : ""}), going on from the last picture.` });
    void nextPart(anim, { parts: held.parts, storyLeft: held.storyLeft ?? undefined, recentConversation: held.recentConversation } as unknown as Job, anim.current);
    return { ok: true, animation: snapshot(anim) };
  }
  function cancel(ownerId: string, projectId: string, animationId: string): V1ActionOutcome {
    const anim = own(ownerId, projectId, animationId);
    if (!anim) return { ok: false, status: 404, error: plain("animation_missing") };
    const mine = busyWith(anim);   // (Nov 25) running or waiting in line
    if (!mine && storyBusy.has(anim.animationId)) {   // (Nov 20, Fable) Stop between two parts of a story: the rest is not made
      storyBusy.delete(anim.animationId); clearPending(anim);
      saveLine(ownerId, projectId, anim.animationId, { role: "assistant", text: "Stopped. The rest of your story was not made - everything made so far stays on the canvas." });
      return { ok: true, animation: snapshot(anim) };
    }
    if (!mine) return { ok: false, status: 409, error: plain("not_running") };
    const job = mine, child = runOf(job)?.child ?? null;   // a job still waiting in line has no child: it just never starts
    child?.kill("SIGTERM");
    finish(job, "cancelled", serverWord(job.books.book, "cancelled"));
    return { ok: true, animation: snapshot(anim) };
  }

  // The current version's pictures in the SAME shape the wired path gives the canvas importer (EngineBlockResult.figureLayers:
  // one editable picture layer for the one figure; frames are empty placeholders, one per picture, exactly as runStoryPath).
  // (Nov 15, Arthur's 35-second story: "made, but I couldn't load it" - 844 pictures were more than ONE answer can hold) the pictures
  // travel in PIECES: from picture `from` on, as many as fit one piece (always at least one); `total` says how many there are
  function currentResult(ownerId: string, projectId: string, animationId: string, from = 0): { version: number; result: EngineBlockResult; total: number } | { version: number; error: string } | null {
    const anim = own(ownerId, projectId, animationId);
    const config = deps.config();
    if (!anim || !config || anim.current < 1) return null;
    const version = anim.versions[anim.current - 1];
    const report = version?.report;
    if (!version || version.status !== "done" || !report) return null;
    try {
      const dir = resolveEnginePath(config, versionDir(anim, version.n), report.layersDir);
      const all = readdirSync(dir).filter((f) => f.toLowerCase().endsWith(".png")).sort();
      if (!all.length) throw new Error("no pictures");
      let to = from, room = V1_PIECE_BYTES;
      while (to < all.length && (to === from || (room -= statSync(join(dir, all[to])).size) >= 0)) to += 1;
      const pictures = all.slice(from, to);
      const id = deps.books(config).book.figureDefaultId, name = nameOf(id), fps = report.fps;
      // the engine's ground cue (D/ground/<NNNN>.png, when it drew one) rides along as a SECOND layer, after the figure's
      const groundDir = join(versionDir(anim, version.n), "ground");
      const ground = existsSync(groundDir) ? readdirSync(groundDir).filter((f) => f.toLowerCase().endsWith(".png")).sort() : [];
      const layers: { id: string; name: string; pictures: (string | null)[] }[] = [{ id, name, pictures: pictures.map((f) => dataUrl(join(dir, f))) }];
      if (ground.length) layers.push({ id: "ground", name: nameOf("ground"), pictures: pictures.map((_, k) => (ground[from + k] ? dataUrl(join(groundDir, ground[from + k])) : null)) });
      return {
        version: version.n, total: all.length,
        result: {
          fps, figures: [{ id, name }], frames: pictures.map(() => []), effects: [],
          figureLayers: { fps, stage: report.stage, inkBox: placementOf(anim, version, report), layers,
            ...(report.moments?.length ? { moments: report.moments } : {}), // (Nov 2 night) lined up with the user's drawn things by the panel
            // (Nov 2 final round) camera "still": the panel fits by his first picture (book camera.still_height_share), so he can walk off the page
            ...(version.plan.camera === "still" ? { camera: "still", stillHeightShare: deps.books(config).book.camera.stillHeightShare } : {}) },
          lengthS: report.lengthS || all.length / fps, video: report.video, continuedFromLastPose: false,
        },
      };
    } catch {
      return { version: version.n, error: plain("layers_missing", { n: version.n }) };
    }
  }

  return {
    idle: () => runningJobs.size === 0 && waiting.length === 0 && gated.size === 0 && storyBusy.size === 0,   // (Nov 20: and no story is between two parts - a new runner would read its saved parts and make the next part a second time)   // (Nov 14) nothing is being made and no card is waiting: a dev server may load a code change now (v1AnimatorServer.ts)
    turn,
    confirm,
    gatePicture,
    get,
    latest,
    adopt,
    setLayer,
    undo: (ownerId: string, projectId: string, animationId: string) => step(ownerId, projectId, animationId, "undo"),
    redo: (ownerId: string, projectId: string, animationId: string) => step(ownerId, projectId, animationId, "redo"),
    cancel,
    continueStory,
    dropStory,
    currentResult,
    busy: () => runningJobs.size > 0,
    // (Nov 26, SPEC-0027, dad: tell the owner when anyone waits more than ~3 min) READ ONLY: how many wait in line and the longest wait.
    // A waiting job's startedAtMs is when it joined the line (beginJob sets it again when it really starts).
    lineWait: () => { const t = Date.now(); return { waiting: waiting.length, longestMs: waiting.reduce((m, j) => Math.max(m, t - (j.startedAtMs ?? t)), 0) }; },
    // (Nov 2 final round) the book's canvas picture limits for the panel (null = off, or no engine / book here)
    canvasLimits: () => { const config = deps.config(); if (!config) return null; try { return v1CanvasLimits(deps.books(config).book); } catch { return null; } },
    say: plain, // a server line from Luna's book by key (for the route's own answers)
  };
}
export type V1Animator = ReturnType<typeof createV1Animator>;
