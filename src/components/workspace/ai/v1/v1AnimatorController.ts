import type { V1AnimationSnapshot, V1CanvasLimits, V1CanvasPicture, V1ClearScope, V1Intent, V1SavedLine, V1Version } from "../../../../lib/ai/v1Animator/v1AnimatorContract.ts";
import type { V1HandFix } from "../../../../lib/ai/v1Animator/v1HandFix.ts";
import { v1GroundForDefault, type V1GroundLine, type V1GroundRule, type V1Thing } from "../../../../lib/ai/v1Animator/v1PageFit.ts";

// AI ANIMATOR VERSION 1 — the panel's brain (Nov 1, PLAN_PARTB.md row B3). No React and no browser here, so the whole
// flow is tested with plain `node --test`: send -> "Thinking" -> Luna's words -> follow the version the engine makes
// (the Animating card: progress bar + time left from PROGRESS) -> "Putting it on the canvas" -> a result line; Undo / Redo swap
// the canvas to that version's pictures. Refused / failed = an honest line, nothing on the canvas, never a pretend card.
// The server (B2) owns /api/ai-animator/v1; the panel only reads the shared contract's types.

export const V1_API = "/api/ai-animator/v1";
export const V1_KEPT_PICTURE_TEXT = 200_000_000;
// (Nov 15 night) the server's layer note when HE took the AI layer off the canvas: the one thing that stops it being put back on opening
export const V1_LAYER_REMOVED = "removed-by-user";
export const V1_LOOK_AGAIN_MS = 1500; // (characters) the picture text of versions the panel keeps for an instant Undo / Redo
export const V1_POLL_MS = 1500;
// (Nov 23, Arthur's OK "if it's a priority, then do it", audited: only poll() reads it) a short Wi-Fi blip said "nothing
// was added, send it again" after 9 s while the server was still making (and charging) it, so a resend paid twice. The
// panel now waits like a story already does (~2 min) before it says anything. Making, editing and placing never read it.
const MAX_POLL_MISSES = 80; // ~2 min without an answer -> say so honestly
const MAX_STORY_MISSES = 80; // (Nov 20, Fable) a story in parts: ~2 min - a restarting server takes longer than 9 s, and it goes on with the story itself
const STORY_WAIT = -1; // (Nov 20) what the panel "watches" between two parts of a story: the next version the server adds
const RECENT_LINES = 12;

// The panel's OWN activity words (everything in between is the engine's stage words from the book).
export const V1_PANEL_WORDS = {
  thinking: "Thinking",
  placing: "Putting it on the canvas",
  animating: "Animating",
  drawing: "Drawing", // (Nov 2) a single still pose is drawn, not animated
  stopping: "Stopping",
  nextPart: "Making the next part of your story", // (Nov 20) a story in parts: between two parts
} as const;

// The word on the work card: "Drawing" when the version being made is ONE still pose (Luna said so), else "Animating".
export const v1WorkWord = (snapshot: V1AnimationSnapshot | null): string => {
  const running = snapshot?.versions.find((v) => v.status === "running") ?? latestVersion(snapshot);
  return running?.still === true ? V1_PANEL_WORDS.drawing : V1_PANEL_WORDS.animating;
};

// (Nov 2, Arthur) AI replies read like a pro chat: short paragraphs split on blank lines. Markdown marks the model may slip in
// (bold stars, # headings, - / * / 1. bullets) are taken out, never shown as junk; single line breaks inside a paragraph become spaces.
export function v1Paragraphs(text: string): string[] {
  return text.replace(/\r\n?/g, "\n").split(/\n[ \t]*\n+/)
    .map((p) => p.split("\n").map((line) => line.replace(/^\s*(#{1,6}\s+|[-*\u2022]\s+|\d+[.)]\s+|>\s*)/, "").trim()).filter(Boolean).join(" "))
    .map((p) => p.replace(/\*\*|__|`/g, "").replace(/(^|\s)\*(\S[^*]*?)\*(?=\s|[.,!?]|$)/g, "$1$2").replace(/\s{2,}/g, " ").trim())
    .filter(Boolean);
}
// (Nov 10, Arthur: "reply professionally, like a real app") the reply as blocks: "## x" = a headline, "- x" = a bullet, other lines =
// paragraphs; **x** = bold. Plain text pieces only: nothing the AI writes ever becomes HTML.
export type V1ReplySeg = { text: string; bold: boolean };
export type V1ReplyBlock = { kind: "h" | "li" | "p"; segs: V1ReplySeg[] };
export function v1ReplyBlocks(text: string): V1ReplyBlock[] {
  const segs = (t: string): V1ReplySeg[] => t.replace(/__|`/g, "").split(/\*\*(.+?)\*\*/g)
    .map((s, i) => ({ text: s.replace(/\*/g, ""), bold: i % 2 === 1 })).filter((s) => s.text);
  const out: V1ReplyBlock[] = [];
  for (const para of text.replace(/\r\n?/g, "\n").split(/\n[ \t]*\n+/)) {
    let words: string[] = [];
    const flush = () => { if (words.length) out.push({ kind: "p", segs: segs(words.join(" ")) }); words = []; };
    for (const raw of para.split("\n")) {
      const line = raw.trim(), h = /^#{1,6}\s+(.*)$/.exec(line), li = /^(?:[-*•]|\d+[.)])\s+(.*)$/.exec(line);
      if (!line) continue;
      if (h || li) { flush(); out.push({ kind: h ? "h" : "li", segs: segs((h ?? li)![1]) }); } else words.push(line);
    }
    flush();
  }
  return out.filter((b) => b.segs.length);
}

// The figure's pictures for one version (data: URLs, null = nothing drawn). The server (B2) sends them as the CURRENT
// version's `result` (the wired path's EngineBlockResult: figureLayers.layers[0].pictures) with `resultVersion`.
export type V1VersionPictures = { fps: number; stage: [number, number]; pictures: (string | null)[]; inkBox?: [number, number, number, number] | null; moments?: { x: number; y: number }[] | null;
  camera?: "still"; stillHeightShare?: number }; // (Nov 2 final round) camera "still" = fitted by his first picture (he can walk off the page)
// (Nov 2 final round) the user's ground lines (page pixels) + the book's ruler: the page fit puts his standing feet on the one under him
export type V1GroundFit = { lines: V1GroundLine[]; rule: V1GroundRule; pageW: number; pageH: number; things?: V1Thing[] };
export const V1_GROUND_PAGE = { width: 1920, height: 1080 } as const;

// One block of a made version (CONTRACT_SAME_ENGINE v1-blocks: report.blocks[]), shown by the user's own sentence.
// mark: "made" (first version: no mark shown) | "re-made" (an edit made it again) | "new" (an edit added it) | "unchanged".
export type V1ResultBlockMark = "made" | "re-made" | "new" | "unchanged";
export type V1ResultBlock = { n: number; id: string; sentence: string; mark: V1ResultBlockMark; labels: string[]; checks?: string[] }; // checks = the engine's action checks, in plain words
// (Nov 22) the gate card's first picture: drawing -> ready (an H3 picture, its cost if he changes it instead) | none (nothing to show) | failed
// kind: "first" = a new animation's first picture (everything in it); "new" = the new things an edit / added part brings in
export type V1GatePictureKind = "first" | "new";
// (dad + Arthur, Nov 26) "offer" = not drawn: the card shows a button with its price (credits; reused = the part Animate reuses)
export type V1GatePicture = ({ state: "offer"; credits: number; reused: number } | { state: "drawing" } | { state: "ready"; src: string; credits: number; animateCredits: number } | { state: "none" } | { state: "failed"; why: string }) & { kind: V1GatePictureKind };
export type V1ChatLine =
  | { id: number; kind: "user"; text: string }
  | { id: number; kind: "ai"; text: string; tone?: "error" }
  | { id: number; kind: "result"; version: number; summary: string; blocks: V1ResultBlock[]; labels: string[]; lengthS: number; edited: boolean; delta?: V1FrameDelta | null }
  | { id: number; kind: "note"; text: string }
  | { id: number; kind: "handfix"; fix: V1HandFix }   // (dad + Arthur, Nov 26) a look the AI can't change: how to fix it by hand, free
  | { id: number; kind: "gate"; credits: number; lines: string[]; exact?: string[]; notDrawn: string[]; colour: string | null; state: "waiting" | "started" | "replaced"; picture?: V1GatePicture; freeChangesLeft?: number; edit?: boolean; handFix?: V1HandFix }   // (Nov 22) exact = the animator's own words
  | { id: number; kind: "question"; questions: { text: string; options: string[] }[]; answered: boolean } // (Nov 11) the question card // (Nov 11) the card before a new animation is made
  | { id: number; kind: "work"; summary: string; steps: string[] }; // (Nov 17, Part 2) what he did, folded into ONE grey line ("Thought for 7 seconds, made the plan ›"); a click opens the steps

// (one line without its id — kept per kind, so each kind keeps its own fields)
type V1LineInput = { [K in V1ChatLine["kind"]]: Omit<Extract<V1ChatLine, { kind: K }>, "id"> }[V1ChatLine["kind"]];

// The frame change shown next to Undo / Redo: plus = frames made / edited / added (counted together), minus = deleted.
export type V1FrameDelta = { plus: number; minus: number };
export type V1Busy = null | "thinking" | "running" | "finishing" | "placing" | "switching" | "cancelling"; // finishing = the bar at 100%
// The Animating card (while a version is made): the engine's PROGRESS lines (pct 0-100, eta seconds). `at` = when this
// eta arrived (the card counts down between polls). Never a "move i of n" count.
export type V1Progress = { pct: number | null; etaS: number | null; at: number; onCanvas?: boolean; late?: boolean; part?: [number, number] };   // (Nov 22) late = past its expected time; part = [this part, of parts] // (Nov 17) onCanvas = it IS on the canvas: the only time the bar shows 100%
export type V1PanelState = {
  lines: V1ChatLine[];
  animationId: string | null;
  snapshot: V1AnimationSnapshot | null;
  busy: V1Busy;
  activity: string | null; // the ONE moving-gradient line (Thinking / Putting it on the canvas; null = nothing happening)
  progress: V1Progress | null; // the Animating card (busy "running" / "cancelling")
  placedVersion: number | null; // the version whose pictures are on the canvas
  pendingPlace: number | null; // made (or undone to) but the canvas was busy: "Put it on the canvas" button
  reveal: number[]; // AI line ids that still type themselves out
  // (Nov 17, Part 2) while he answers: when it started, the book's changing words, and his words so far (as he writes them)
  thinking: { since: number; words: string[]; say: string; phase?: "thinking" | "searching" | "finalizing" } | null;   // (Nov 22) phase = what he is really doing
  stage: string | null; // (Nov 17) the engine's REAL stage words while a version is made (STAGE lines), shown above the bar
};

// Puts one version's pictures on the canvas (the first version of an animation = a new layer; later = the same layer).
// fps = the playback pictures per second asked with the fps op (absent = the engine's own); layer = where it was put before
// (kept by the server, so a reload still replaces THAT layer). Answers false, true, or where it went ({ layerId, count }).
// replace = (Nov 2, one figure rule) the PREVIOUS animation's layer: a new animation takes its place (app Undo brings the old one back).
export type V1PlaceTarget = { animationId: string; version: number; fps?: number | null; speed?: number | null; layer?: { layerId: string; count: number } | null; replace?: { layerId: string; count: number } | null;
  ground?: V1GroundFit | null };
export type V1Placed = boolean | { layerId: string; count: number };
export type V1Placer = (target: V1PlaceTarget, pictures: V1VersionPictures) => Promise<V1Placed> | V1Placed;
// (Nov 2 final round, owner) EFFORT: the SAME Effort picker as the Help assistant (Auto / Low / Medium / High). The chosen level goes
// with each turn ("effort" in the turn body; the server turns it into Sonnet's thinking budget from the book) and is remembered per
// project in this browser (localStorage, every read / write wrapped: a blocked storage just means Auto).
export type V1ChatEffort = "auto" | "low" | "medium" | "high";
const V1_EFFORT_VALUES: readonly V1ChatEffort[] = ["auto", "low", "medium", "high"];
export const v1EffortKey = (projectId: string) => `diamond.v1Animator.effort.${projectId}`;
type V1EffortStorage = Pick<Storage, "getItem" | "setItem"> | null | undefined;
export function readV1Effort(storage: V1EffortStorage, projectId: string): V1ChatEffort {
  try { const v = storage?.getItem(v1EffortKey(projectId)); return V1_EFFORT_VALUES.includes(v as V1ChatEffort) ? (v as V1ChatEffort) : "auto"; } catch { return "auto"; }
}
export function saveV1Effort(storage: V1EffortStorage, projectId: string, effort: V1ChatEffort): void {
  try { storage?.setItem(v1EffortKey(projectId), effort); } catch { /* a blocked storage: the level still goes with this turn */ }
}

export type V1ControllerDeps = {
  projectId: string;
  copiedFrom?: string | null; // (Nov 11, Arthur: "the chat is not saved") the project this one is a copy of: the server brings its AI chat along once
  page?: () => [number, number] | null; // (Nov 14) the page's own shape [width, height]: a new animation is made in it
  keptPictureText?: number; // (characters; tests) how much picture text the panel keeps - V1_KEPT_PICTURE_TEXT when not given
  canvasFps?: () => number | null; // (Nov 11) the FPS the canvas really plays at, so the AI never says 24 when it shows 12
  fetch: (input: string, init?: RequestInit) => Promise<Response>;
  place: V1Placer;
  // (Nov 15, Arthur: "I click Undo or Redo and all the frames pop up - they are supposed to be there when I come in") THE PANEL LOOKS AT
  // THE CANVAS: does it hold this layer with pictures on it (true / false; null = the canvas cannot say right now). Reads only.
  holds?: (layerId: string) => boolean | null;
  // when the open project was last saved (ms; null = unknown): a project saved BEFORE the current version was finished cannot hold it
  savedAt?: () => number | null;
  // (this browser's own note) which version the SAVED project holds: written once a save that is newer than a placement is seen, with
  // that save's time; read on opening - it counts only for exactly that saved state
  kept?: { read: () => { n: number; at: number } | null; write: (note: { n: number; at: number }) => void };
  onChange: (state: V1PanelState) => void;
  setTimer?: (run: () => void, ms: number) => unknown;
  now?: () => number;
  clearTimer?: (handle: unknown) => void;
  wait?: (ms: number) => Promise<void>; // (the short 100% beat before a version is placed; tests pass an instant one)
  // (Nov 2) clear the canvas: scope "ai" = the AI animation's layer(s); "all" = every frame. layer = where this animation is. One app Undo.
  clear?: (scope: V1ClearScope, layer: { layerId: string; count: number } | null) => boolean | Promise<boolean>;
  // (Nov 2 final round) THE AI SEES THE CANVAS: ONE small picture of what the USER drew (the AI's own layer left out), at the book's limits;
  // null = nothing of theirs on the canvas (then nothing is sent). Asked only when a chat message is sent.
  picture?: (limits: V1CanvasLimits, aiLayerId: string | null) => V1CanvasPicture | null | Promise<V1CanvasPicture | null>;
  // (Nov 2 night) THE TIMELINE: ONE contact sheet of up to limits.sheetFrames frames of the user's layers where they change (null = none)
  sheet?: (limits: V1CanvasLimits, aiLayerId: string | null) => V1CanvasPicture | null | Promise<V1CanvasPicture | null>;
  // (Nov 2 final round) THE USER'S GROUND LINE ($0, browser): every long near-horizontal line they drew (page pixels), by the book's ruler
  ground?: (rule: V1GroundRule, maxPx: number, aiLayerId: string | null) => V1GroundLine[] | { lines: V1GroundLine[]; things: V1Thing[] } | null;
  // (Nov 3) the server refused a message for credits (HTTP 402): the panel reads the plan + credits again at once, so the
  // out-of-credits card shows now (the panel passes "announce the account plan changed"; no browser in this file)
  onCreditsRefused?: () => void;
  // (Nov 17, Part 2) watch the turn while he answers (GET ?live= this often, in real time): his words show as he writes them. Absent = off.
  live?: { everyMs: number };
};
// the book's ground ruler as the server sent it (every number > 0, else no ground line is looked for)
const GROUND_KEYS = ["minLenFigureWidths", "maxSlopeDeg", "upShareH", "openAbovePx", "openAboveShare", "maxThickPx", "gapPx", "minRunShare", "inkDiff"] as const;
const readGroundRule = (v: unknown): V1GroundRule | null => {
  if (!isObject(v) || !isObject(v.defaultFigure) || !GROUND_KEYS.every((k) => Number(v[k]) > 0)) return null;
  const f = v.defaultFigure;
  if (!(Number(f.heightShare) > 0 && Number(f.feetYShare) > 0 && Number(f.widthPerHeight) > 0)) return null;
  const al = isObject(v.align) && ["minScale", "maxScale", "thingMinShare", "thingMaxWidthShare"].every((k) => Number((v.align as Record<string, unknown>)[k]) > 0)
    ? { minScale: Number(v.align.minScale), maxScale: Number(v.align.maxScale), thingMinShare: Number(v.align.thingMinShare), thingMaxWidthShare: Number(v.align.thingMaxWidthShare) } : null;
  return { ...Object.fromEntries(GROUND_KEYS.map((k) => [k, Number(v[k])])) as unknown as Omit<V1GroundRule, "defaultFigure" | "align">,
    defaultFigure: { heightShare: Number(f.heightShare), feetYShare: Number(f.feetYShare), widthPerHeight: Number(f.widthPerHeight) }, align: al };
};
const readCanvasLimits = (v: unknown): V1CanvasLimits | null => {
  if (!isObject(v) || (v.mediaType !== "image/jpeg" && v.mediaType !== "image/png")) return null;
  const maxPx = Number(v.maxPx), quality = Number(v.quality), maxBytes = Number(v.maxBytes);
  const ground = readGroundRule(v.ground);
  const sheetFrames = Number(v.sheetFrames); // (Nov 2 night) book canvas.sheet.max_frames (absent = no contact sheet)
  return maxPx > 0 && quality > 0 && quality <= 1 && maxBytes > 0 ? { maxPx, quality, maxBytes, mediaType: v.mediaType, ...(ground ? { ground } : {}), ...(Number.isSafeInteger(sheetFrames) && sheetFrames >= 2 ? { sheetFrames } : {}) } : null;
};
// (Nov 2, Arthur) the bar shows 100% this long before the result appears; a canvas that is busy (a stroke being drawn) is
// tried again this often, silently, until it is placed — the user is never asked to stop anything.
export const V1_FULL_BAR_MS = 450;
export const V1_PLACE_RETRY_MS = 400;

export const emptyV1PanelState = (): V1PanelState => ({ lines: [], animationId: null, snapshot: null, busy: null, activity: null, progress: null, placedVersion: null, pendingPlace: null, reveal: [], thinking: null, stage: null });

// ---- Reading what the server says (defensive: anything unexpected = an honest error, never a guess)
const isObject = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
// Server answers: { animation, result?, resultVersion?, resultError? } (GET, undo, redo, cancel); { turn, animation, started } (turn).
export function readV1Snapshot(body: unknown): V1AnimationSnapshot | null {
  const candidate = isObject(body) && isObject(body.animation) ? body.animation : isObject(body) && isObject(body.snapshot) ? body.snapshot : body;
  if (!isObject(candidate) || typeof candidate.animationId !== "string" || !Array.isArray(candidate.versions) || typeof candidate.current !== "number") return null;
  const versions = candidate.versions.filter((v): v is V1Version => isObject(v) && typeof v.n === "number" && typeof v.status === "string");
  return { ...(candidate as V1AnimationSnapshot), versions };
}
/** (dad + Arthur, Nov 26) the hand-fix place the server worked out (v1HandFix.ts), checked. */
function readHandFix(value: unknown): V1HandFix | null {
  if (!isObject(value)) return null;
  const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
  const fromS = n(value.fromS), toS = n(value.toS), firstStep = n(value.firstStep), lastStep = n(value.lastStep);
  if (fromS === null || toS === null || firstStep === null || lastStep === null) return null;
  const remake = isObject(value.remake) && typeof value.remake.whole === "boolean" ? { whole: value.remake.whole, firstStep: n(value.remake.firstStep) ?? firstStep, lastStep: n(value.remake.lastStep) ?? lastStep, seconds: n(value.remake.seconds) ?? toS } : null;
  return { fromS, toS, fromFrame: n(value.fromFrame), toFrame: n(value.toFrame), firstStep, lastStep, recommend: value.recommend === "hand" ? "hand" : "remake", remake };
}

export function readV1Turn(body: unknown): { say: string; intent: V1Intent | null; snapshot: V1AnimationSnapshot | null; clear: V1ClearScope | null; gate: { credits: number; lines: string[]; exact?: string[]; notDrawn: string[]; colour: string | null; picture?: V1GatePictureKind; pictureOffer?: { credits: number; reused: number }; freeChangesLeft?: number; edit?: boolean; handFix?: V1HandFix } | null; questions: { text: string; options: string[] }[]; handFix: V1HandFix | null } | null {
  if (!isObject(body)) return null;
  const turn = isObject(body.turn) ? body.turn : body;
  if (typeof turn.say !== "string") return null;
  const clear = isObject(turn.clear) && (turn.clear.scope === "ai" || turn.clear.scope === "all") ? turn.clear.scope : null;
  // (Nov 13, live: every card of 9+ steps lost its last lines - "and finally takes a big bow" - to a cap of 8 here) the card shows EVERY line it is sent
  const strs = (v: unknown) => Array.isArray(v) ? v.filter((l): l is string => typeof l === "string" && l.trim() !== "") : [];
  const gate = isObject(body.gate) && Number(body.gate.credits) > 0 ? { credits: Number(body.gate.credits), lines: strs(body.gate.lines), ...(Array.isArray(body.gate.exact) ? { exact: strs(body.gate.exact) } : {}), notDrawn: strs(body.gate.notDrawn), colour: typeof body.gate.colour === "string" && /^#[0-9a-f]{3,8}$/i.test(body.gate.colour) ? body.gate.colour : null, ...(body.gate.picture === "first" || body.gate.picture === "new" ? { picture: body.gate.picture as V1GatePictureKind } : body.gate.picture === true ? { picture: "first" as const } : {}) , ...(isObject(body.gate.pictureOffer) && Number(body.gate.pictureOffer.credits) > 0 ? { pictureOffer: { credits: Number(body.gate.pictureOffer.credits), reused: Math.max(0, Number(body.gate.pictureOffer.reused) || 0) } } : {}), ...(Number.isFinite(Number(body.gate.freeChangesLeft)) ? { freeChangesLeft: Math.max(0, Number(body.gate.freeChangesLeft)) } : {}), ...(body.gate.edit === true ? { edit: true } : {}), ...(readHandFix(body.gate.handFix) ? { handFix: readHandFix(body.gate.handFix)! } : {}) } : null;
  const questions = (Array.isArray(turn.questions) ? turn.questions : []).filter(isObject).map((q) => ({ text: typeof q.text === "string" ? q.text : "", options: strs(q.options).slice(0, 4) })).filter((q) => q.text && q.options.length >= 2).slice(0, 3);
  return { say: turn.say, intent: typeof turn.intent === "string" ? turn.intent as V1Intent : null, snapshot: readV1Snapshot(body.animation ?? body.snapshot ?? null), clear, gate, questions, handFix: readHandFix(body.handFix) };
}
// Version n's pictures from a server answer: only when `resultVersion` is n (the server sends the CURRENT version's).
export function readV1Pictures(body: unknown, n: number): V1VersionPictures | null {
  if (!isObject(body) || !isObject(body.result) || body.resultVersion !== n) return null;
  const figures = isObject(body.result.figureLayers) ? body.result.figureLayers : null;
  const layer = figures && Array.isArray(figures.layers) && isObject(figures.layers[0]) ? figures.layers[0] : null;
  const fps = Number(figures?.fps ?? body.result.fps);
  if (!figures || !layer || !Array.isArray(layer.pictures) || !(fps > 0)) return null;
  const stage = Array.isArray(figures.stage) && figures.stage.length === 2 ? [Number(figures.stage[0]) || 1920, Number(figures.stage[1]) || 1080] as [number, number] : [1920, 1080] as [number, number];
  const pictures = layer.pictures.map((p) => typeof p === "string" && p ? p : null);
  const ink = Array.isArray(figures.inkBox) && figures.inkBox.length === 4 && figures.inkBox.every((v: unknown) => Number.isFinite(Number(v))) ? figures.inkBox.map(Number) as [number, number, number, number] : null;
  const still = figures.camera === "still" && Number(figures.stillHeightShare) > 0 ? { camera: "still" as const, stillHeightShare: Number(figures.stillHeightShare) } : {};
  // (Nov 2 night) his key moments (stage px, time order) for lining him up with the user's drawn things
  const moments = Array.isArray(figures.moments) ? (figures.moments as unknown[]).filter(isObject).map((m) => ({ x: Number(m.x), y: Number(m.y) })).filter((m) => Number.isFinite(m.x) && Number.isFinite(m.y)) : [];
  return pictures.some(Boolean) ? { fps, stage, pictures, inkBox: ink, ...still, ...(moments.length ? { moments } : {}) } : null;
}
// The server's words for the user (its book's plain words) are shown; anything that reads technical (a path, a file, an
// error name, a move id like "m1", engine words) is replaced by the panel's own friendly sentence.
const TECHNICAL = /[\/\\]|\.(py|ts|tsx|js|json|png)\b|\b[A-Za-z]*Error\b|\bE[A-Z]{3,}\b|\berrno\b|\bundefined\b|\bnull\b|\bm\d+\b|\bSTAGE\b|\bJSON\b|\bstatus \d{3}\b|\$\d/;
export const plainWords = (text: unknown, fallback: string) => typeof text === "string" && text.trim() && text.trim().length <= 400 && !TECHNICAL.test(text) ? text.trim() : fallback;
const errorWords = (body: unknown, fallback: string) => plainWords(isObject(body) ? body.error ?? body.message : null, fallback);

// ---- What the panel shows
// The progress of a running version (PROGRESS <pct> <eta_s>). Read defensively from wherever the server carries it
// (version.progress, version.stage.progress, or pct/etaS on the stage); anything unreadable = unknown (null), never a guess.
const num = (value: unknown): number | null => typeof value === "number" && Number.isFinite(value) ? value : typeof value === "string" && value.trim() && Number.isFinite(Number(value)) ? Number(value) : null;
export function readV1Progress(version: unknown): { pct: number | null; etaS: number | null; late?: boolean; part?: [number, number] } {
  if (!isObject(version)) return { pct: null, etaS: null };
  const stage = isObject(version.stage) ? version.stage : null;
  const source = isObject(version.progress) ? version.progress : stage && isObject(stage.progress) ? stage.progress : stage ?? {};
  const pct = num(source.pct ?? source.percent);
  const etaS = num(source.etaS ?? source.eta_s ?? source.eta);
  const part = Array.isArray(source.part) && source.part.length === 2 && source.part.every((x) => Number.isInteger(x) && Number(x) > 0) && Number(source.part[0]) <= Number(source.part[1]) ? [Number(source.part[0]), Number(source.part[1])] as [number, number] : null;
  return { pct: pct === null ? null : Math.min(100, Math.max(0, pct)), etaS: etaS === null || etaS < 0 ? null : etaS, ...(source.late === true ? { late: true } : {}), ...(part ? { part } : {}) };
}
// "About 1 min 40 s left" (rounded up to 5 s under a minute, 10 s above; never a false "0 s").
export function timeLeftWords(etaS: number | null): string {
  if (etaS === null || !Number.isFinite(etaS)) return "Working out the time left";
  const s = Math.max(0, Math.round(etaS));
  if (s <= 5) return "Almost done";
  const rounded = s < 60 ? Math.ceil(s / 5) * 5 : Math.ceil(s / 10) * 10;
  const min = Math.floor(rounded / 60), sec = rounded % 60;
  if (min === 0) return `About ${sec} s left`;
  return sec ? `About ${min} min ${sec} s left` : `About ${min} min left`;
}
// (Nov 2) Near the end: once the bar has sat at >= 99% for more than 5 s, say "Finishing up…" (never a stuck "Almost done").
// (Nov 17, Arthur: "never 'almost done' at 5%") the engine's time left is a guess from the book; when it has run out while the work is
// clearly NOT nearly done (under 90%), the words say so honestly instead of "Almost done".
export const FINISHING_AFTER_S = 5;
export const ALMOST_DONE_FROM_PCT = 90;
export function progressWords(pct: number | null, etaS: number | null, highForS: number): string {
  if (pct !== null && pct >= 99 && highForS > FINISHING_AFTER_S) return "Finishing up…";
  if (etaS !== null && Math.round(etaS) <= 5 && (pct ?? 0) < ALMOST_DONE_FROM_PCT) return "Taking a little longer than planned";
  return timeLeftWords(etaS);
}
// (Nov 17, Arthur: "100% means done") the bar's drawn width: the engine's real pct scaled into 0-95, so it never passes 95% before the
// animation is ON THE CANVAS; at the engine's >= 99% it keeps creeping gently toward (never past) 95. 100 = only when it is on the canvas.
export const BAR_MAX_BEFORE_CANVAS = 95;
export function gentleBarPct(pct: number | null, highForS: number, onCanvas = false): number {
  if (onCanvas) return 100;
  const base = Math.max(2, (pct ?? 0) * BAR_MAX_BEFORE_CANVAS / 100);
  if (pct === null || pct < 99) return Math.min(BAR_MAX_BEFORE_CANVAS, base);
  return Math.min(BAR_MAX_BEFORE_CANVAS, base + 0.9 * (1 - Math.exp(-Math.max(0, highForS) / 20)));
}
// (Nov 17) the engine's own stage words for a running version (its STAGE line, carried by the server as version.stage.words); null = none
export function readV1StageWords(version: unknown): string | null {
  const stage = isObject(version) && isObject(version.stage) ? version.stage : null;
  return stage && typeof stage.words === "string" ? plainWords(stage.words, "") || null : null;
}
// (Nov 17) "7 seconds", "1 min 40 s"
export function durationWords(ms: number): string {
  const s = Math.max(1, Math.round(ms / 1000));
  if (s < 60) return `${s} second${s === 1 ? "" : "s"}`;
  const min = Math.floor(s / 60), sec = s % 60;
  return sec ? `${min} min ${sec} s` : `${min} min`;
}
export const latestVersion = (snapshot: V1AnimationSnapshot | null): V1Version | null =>
  snapshot?.versions.reduce<V1Version | null>((best, v) => !best || v.n > best.n ? v : best, null) ?? null;
export const versionByN = (snapshot: V1AnimationSnapshot | null, n: number): V1Version | null => snapshot?.versions.find((v) => v.n === n) ?? null;
// Undo / Redo walk the versions that were really made (refused / failed ones never were on the canvas).
export function undoRedoState(snapshot: V1AnimationSnapshot | null): { canUndo: boolean; canRedo: boolean } {
  if (!snapshot) return { canUndo: false, canRedo: false };
  const made = snapshot.versions.filter((v) => v.status === "done").map((v) => v.n);
  return { canUndo: made.some((n) => n < snapshot.current), canRedo: made.some((n) => n > snapshot.current) };
}
// (honest labels in plain words only: a label that reads technical is left out, never shown raw)
// (Nov 2) An engine "not in V1, not drawn: X" label the server did not already turn friendly gets the same book line here.
const NOT_DRAWN = /^\s*(?:not in v1\s*[,;:-]?\s*)?not drawn\s*:\s*(.+?)\s*$/i;
export function friendlyLabel(label: string): string {
  const m = NOT_DRAWN.exec(label);
  if (!m) return label;
  const thing = m[1].replace(/\s*\([^)]*\)\s*$/, "").replace(/[.\s]+$/, "").trim();
  return thing ? `${thing.charAt(0).toUpperCase()}${thing.slice(1)} isn't drawn — you can draw it yourself on its own layer.` : "";
}
const plainLabels = (labels: unknown) => (Array.isArray(labels) ? labels : []).filter((label): label is string => typeof label === "string")
  .map(friendlyLabel).filter((label) => label !== "" && !/not in v1/i.test(label) && plainWords(label, "") !== "");
const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;
type ReportBlock = { id: string; sentence: string; made: "new" | "same"; frames: number | null; labels: string[]; checks: string[] };
// report.blocks[] (v1-blocks); an older report's moves[] are read the same way (words = the sentence).
function reportBlocks(report: unknown): ReportBlock[] {
  if (!isObject(report)) return [];
  const list = Array.isArray(report.blocks) ? report.blocks : Array.isArray(report.moves) ? report.moves : [];
  return list.filter(isObject).map((block, index) => ({
    id: typeof block.id === "string" ? block.id : `#${index + 1}`,
    sentence: typeof block.sentence === "string" ? block.sentence : typeof block.words === "string" ? block.words : "",
    made: block.made === "same" ? "same" : "new",
    frames: num(block.frames),
    labels: plainLabels(block.labels),
    checks: (Array.isArray(block.checkWords) ? block.checkWords : []).filter((w): w is string => typeof w === "string" && plainWords(w, "") !== ""),
  }));
}
// (Nov 2) the engine kept the version before for a try that came out worse: the server's book words (null = it did not)
export const keptPreviousWords = (version: V1Version): string | null => {
  const r: unknown = version.report;
  return isObject(r) && isObject(r.keptPrevious) && typeof r.keptPreviousSay === "string" ? plainWords(r.keptPreviousSay, "") || null : null;
};
// (Nov 3 key 2) the viewer's ONE honest line about this take (the server's book words; null = it showed what was asked / not judged)
export const viewerWords = (version: V1Version): string | null => {
  const r: unknown = version.report;
  return isObject(r) && typeof r.viewerSay === "string" ? plainWords(r.viewerSay, "") || null : null;
};
const isEdited = (version: V1Version) => {
  const loose = version as unknown as Record<string, unknown>;
  return version.n > 1 || (Array.isArray(loose.edits) && loose.edits.length > 0) || (Array.isArray(loose.ops) && loose.ops.length > 0);
};
// The one clean line under a version: "76 frames edited · 0 added · 0 deleted" (an edit, from report.frames, counted by
// the engine on the pictures) or "240 frames made" (the first version). Nothing known = no line (never a made-up count).
function editCounts(report: Record<string, unknown>): { e: number; a: number; d: number } | null {
  const frames = isObject(report.frames) ? report.frames : null;
  if (!frames) return null;
  const e = num(frames.edited), a = num(frames.added), d = num(frames.deleted);
  return e !== null && a !== null && d !== null ? { e, a, d } : null;
}
function madeTotal(report: Record<string, unknown>): number {
  const blocks = reportBlocks(report);
  const summed = blocks.reduce((sum, block) => sum + (block.frames ?? 0), 0);
  const fps = num(report.fps), lengthS = num(report.lengthS);
  return blocks.length > 0 && blocks.every((block) => block.frames !== null) ? summed : fps && lengthS ? Math.round(fps * lengthS) : 0;
}
export function framesSummary(report: unknown, edited: boolean): string {
  if (!isObject(report)) return "";
  const counts = edited ? editCounts(report) : null;
  if (counts) return `${plural(counts.e, "frame")} edited · ${counts.a} added · ${counts.d} deleted`;
  const total = madeTotal(report);
  return total > 0 ? `${plural(total, "frame")} made` : "";
}
// The same counts as coloured numbers ("+176  −0"): made / edited / added together are the plus, deleted the minus.
// Nothing known = null (never a made-up count).
export function framesDelta(report: unknown, edited: boolean): V1FrameDelta | null {
  if (!isObject(report)) return null;
  const counts = edited ? editCounts(report) : null;
  if (counts) return { plus: Math.max(0, counts.e + counts.a), minus: Math.max(0, counts.d) };
  const total = madeTotal(report);
  return total > 0 ? { plus: total, minus: 0 } : null;
}
export function resultLineFor(version: V1Version, earlier: readonly V1Version[] = []): Omit<Extract<V1ChatLine, { kind: "result" }>, "id"> {
  const report: unknown = version.report;
  const edited = isEdited(version);
  // (a block id that an earlier version already had = "re-made"; an id never seen before = "new", i.e. added by the edit)
  const known = new Set(earlier.filter((v) => v.n < version.n).flatMap((v) => reportBlocks(v.report).map((block) => block.id)));
  return {
    kind: "result",
    version: version.n,
    summary: framesSummary(report, edited),
    delta: framesDelta(report, edited),
    blocks: reportBlocks(report).map((block, index) => ({
      n: index + 1, id: block.id, sentence: block.sentence, labels: block.labels, ...(block.checks.length ? { checks: block.checks } : {}),
      mark: !edited ? "made" : block.made === "same" ? "unchanged" : known.has(block.id) ? "re-made" : "new",
    })),
    labels: plainLabels(isObject(report) ? report.labels : null),
    lengthS: (isObject(report) ? num(report.lengthS) : null) ?? 0,
    edited,
  };
}
const refusedWords = (version: V1Version) => plainWords(version.message || version.report?.refused, "I can't make that one, so nothing was added to the canvas.");
const failedWords = (version: V1Version) => plainWords(version.message, "I couldn't make this animation, so nothing was added to the canvas.");

// (Nov 17, Part 2) THE FOLDED LINES. One turn: "Thought for 7 seconds, made the plan" (open: each step). "Thought" = from his message
// until his first words appeared (or the answer, when nothing was watched).
export function turnWorkLine(sentAt: number, firstWordsAt: number | null, doneAt: number, searched: string[], did: string | null, plan: boolean): Omit<Extract<V1ChatLine, { kind: "work" }>, "id"> {
  const thought = `Thought for ${durationWords((firstWordsAt ?? doneAt) - sentAt)}`;
  const steps = [thought, ...[...new Set(searched)].map((q) => `Searched the internet: ${q}`),
    ...(firstWordsAt !== null ? [`Wrote ${plan ? "the plan" : "the answer"} in ${durationWords(doneAt - firstWordsAt)}`] : []),
    ...(did ? [`${did.charAt(0).toUpperCase()}${did.slice(1)}`] : [])];
  return { kind: "work", summary: did ? `${thought}, ${did}` : thought, steps };
}
// One made version: "Made the animation in 1 min 40 s" (open: the engine's real stages, each with its time).
export function makingWorkLine(making: { startedAt: number; stages: { words: string; at: number }[] }, doneAt: number): Omit<Extract<V1ChatLine, { kind: "work" }>, "id"> {
  const steps = making.stages.map((st, i) => `${st.words} (${durationWords((making.stages[i + 1]?.at ?? doneAt) - st.at)})`);
  return { kind: "work", summary: `Made the animation in ${durationWords(doneAt - making.startedAt)}`, steps };
}

// ---- The flow
export class V1AnimatorController {
  private state: V1PanelState = emptyV1PanelState();
  private nextId = 1;
  private settled = new Set<number>(); // versions this panel already handled (placed / said)
  private watching: number | null = null;
  private pollTimer: unknown = null;
  private misses = 0;
  private pictures = new Map<number, V1VersionPictures>(); // Undo / Redo are instant: pictures kept per version
  private disposed = false;
  private readonly setTimer: (run: () => void, ms: number) => unknown;
  private readonly clearTimer: (handle: unknown) => void;
  private readonly now: () => number;
  private readonly wait: (ms: number) => Promise<void>;

  private readonly deps: V1ControllerDeps;
  constructor(deps: V1ControllerDeps) {
    this.deps = deps;
    this.wait = deps.wait ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    this.setTimer = deps.setTimer ?? ((run, ms) => setTimeout(run, ms));
    this.clearTimer = deps.clearTimer ?? ((handle) => clearTimeout(handle as ReturnType<typeof setTimeout>));
    this.now = deps.now ?? (() => Date.now());
  }

  get current(): V1PanelState { return this.state; }

  dispose() {
    this.disposed = true;
    if (this.pollTimer) this.clearTimer(this.pollTimer);
    if (this.placeTimer) this.clearTimer(this.placeTimer);
    this.pollTimer = null; this.placeTimer = null;
  }

  // The panel opening again (a page reload, a server restart): the project's latest animation + the saved chat come back from
  // the server, so the chat goes on and edits / Undo / Redo work on the SAME animation and layer. The canvas already holds its
  // pictures (they are saved with the project), so nothing is placed again; a version still being made is followed; a finished one
  // that never reached the canvas is placed.
  async restore() {
    if (this.disposed || this.state.lines.length || this.state.busy) return;
    let body: unknown = null;
    try { const answer = await this.call("GET", undefined, { projectId: this.deps.projectId, ...(this.deps.copiedFrom ? { copiedFrom: this.deps.copiedFrom } : {}) }); if (!answer.ok) return; body = answer.body; } catch { return; }
    if (isObject(body)) this.canvasLimits = readCanvasLimits(body.canvas); // (Nov 2 final round) the book's picture limits (null = off)
    if (this.disposed || this.state.lines.length || this.state.busy || !isObject(body)) return;
    const snapshot = body.animation ? readV1Snapshot(body) : null;
    const saved = Array.isArray(body.lines) ? body.lines.filter((l): l is V1SavedLine => isObject(l) && (l.role === "user" || l.role === "assistant") && typeof l.text === "string") : [];
    if (snapshot) {
      this.adopt(snapshot);
      for (const v of snapshot.versions) if (v.status !== "running") this.settled.add(v.n);
      if (snapshot.current > 0) this.set({ placedVersion: snapshot.current });
      this.layer = snapshot.layerId && Number(snapshot.layerCount) > 0 ? { layerId: snapshot.layerId, count: Number(snapshot.layerCount) } : null;
      this.layerSeen = false; this.layerMisses = 0;
      this.placedFps = snapshot.fps ?? null;
      this.placedSpeed = snapshot.speed ?? null;
    }
    const done = snapshot?.versions.filter((v) => v.status === "done") ?? [];
    for (const l of saved) {
      if (l.kind === "result" && typeof l.version === "number") {
        const version = versionByN(snapshot, l.version);
        if (version?.status === "done") { this.push(resultLineFor(version, done)); continue; }
      }
      if (l.role === "user") this.push({ kind: "user", text: l.text });
      else if (l.kind === "note") continue; // (Nov 2: Undo / Redo are silent; an older saved "Undone ..." note is not shown again)
      else this.push({ kind: "ai", text: plainWords(l.text, l.text), ...(l.kind === "error" ? { tone: "error" as const } : {}) });
    }
    const running = snapshot?.versions.find((v) => v.status === "running");
    if (running) { this.watching = running.n; await this.follow(); }
    // (Nov 15, Arthur's 35-second story: made and paid, it could not be loaded - and after a reload nothing ever put it on the canvas) a
    // finished version that never reached the canvas (the server knows no layer of this animation) is put there now
    // (Nov 15 night, reproduced in the app: a basketball animation was made, the project was left 20 s later - before the save - and it
    // opened EMPTY while this panel said "on the canvas": the server's note said "layer-3" and nobody looked) THE PANEL LOOKS: the note
    // names a layer the canvas does not hold = the version is put there now, by the same call. Never when he took the layer away himself.
    else if (snapshot && snapshot.current > 0 && snapshot.layerId !== V1_LAYER_REMOVED && versionByN(snapshot, snapshot.current)?.status === "done"
      && (!this.layer || this.olderThan(versionByN(snapshot, snapshot.current)?.finishedAt) || this.holdsOther(snapshot.current) || await this.gone(this.layer.layerId))) await this.putOnCanvas(snapshot.current, "retry");
    // (Nov 20) opened between two parts of a story (or right after a restart, when the server goes on with it): the panel waits for the next part
    if (!running && Number(this.state.snapshot?.storyPartsLeft) > 0 && !this.disposed && !this.state.busy) await this.followNextPart();
  }
  // (Nov 15 night, seen in the door: his T-Rex project was saved with version 1 and left; the edit made after that was not on the canvas
  // when it opened again - the layer was there, with the OLD pictures) the open project was saved before this version was finished
  private olderThan(finishedAt: string | null | undefined): boolean {
    const saved = this.deps.savedAt?.() ?? null, made = Date.parse(finishedAt ?? "");
    return saved !== null && Number.isFinite(made) && made > saved;
  }
  // (Undo / Redo, then the project is left before the save) the saved project that is open holds ANOTHER version than the current one:
  // known only when this browser noted it for exactly this saved state
  private holdsOther(current: number): boolean {
    const note = this.deps.kept?.read() ?? null, saved = this.deps.savedAt?.() ?? null;
    return Boolean(note) && saved !== null && note!.at === saved && note!.n !== current;
  }
  private placedHere: { n: number; at: number } | null = null; // the version this panel last put on the canvas, and when
  // the canvas says twice, a moment apart, that it does not hold the layer (one "no" alone may be a project that is still opening)
  private async gone(layerId: string): Promise<boolean> {
    if (!this.deps.holds || this.deps.holds(layerId) !== false) return false;
    await new Promise<void>((done) => { this.setTimer(done, V1_LOOK_AGAIN_MS); });
    return !this.disposed && !this.state.busy && this.deps.holds(layerId) === false;
  }
  /** (Nov 15 night: the home picture at once) the first picture of the version on the canvas, when the panel still holds it (else null) */
  firstPicture(): string | null {
    const n = this.state.placedVersion;
    return (typeof n === "number" ? this.pictures.get(n)?.pictures.find((url) => Boolean(url)) : null) ?? null;
  }
  private clock(): number { return this.deps.now ? this.deps.now() : Date.now(); }
  private layerSeen = false; // the canvas held the layer at some moment since this panel knows it
  private layerMisses = 0;
  /** (called by the panel every few seconds; reads only) The layer was on the canvas and is gone while nothing of ours is running =
   *  HE took it away (deleted it, or undid it): the server's note says so, and it is never put back by itself. Any placement he asks
   *  for after that (an edit, Undo, Redo) writes a fresh note as before. */
  noticeLayer() {
    if (this.disposed || this.state.busy || this.placeTimer) return;
    // a save that is newer than our last placement: the saved project holds that version (noted for exactly that save)
    const saved = this.deps.savedAt?.() ?? null;
    if (this.placedHere && saved !== null && saved > this.placedHere.at + 1000) { this.deps.kept?.write({ n: this.placedHere.n, at: saved }); this.placedHere = null; }
    const layer = this.layer, animationId = this.state.animationId;
    if (!layer || !animationId || !this.deps.holds) return;
    const holds = this.deps.holds(layer.layerId);
    if (holds === true) { this.layerSeen = true; this.layerMisses = 0; return; }
    if (holds !== false || !this.layerSeen) return;
    if (++this.layerMisses < 2) return;
    this.layer = null; this.layerSeen = false; this.layerMisses = 0;
    void this.call("POST", { action: "layer", projectId: this.deps.projectId, animationId, layerId: V1_LAYER_REMOVED, count: 0 }).catch(() => undefined);
  }
  private layer: { layerId: string; count: number } | null = null; // where this animation is on the canvas
  private placedFps: number | null = null; // the fps op's value the canvas was last placed at (null = the engine's own)
  private placedSpeed: number | null = null; // the speed op's value the canvas was last placed at (null = 1)
  private placeTimer: unknown = null; // the silent "try again" while the canvas is busy
  private canvasLimits: V1CanvasLimits | null = null; // (Nov 2 final round) from the server's book; null = no canvas picture is ever sent
  private ground: V1GroundFit | null = null; // (Nov 2 final round) the user's ground lines found at the last chat message (null = none / off)
  // the user's ground lines for this turn: found = at least one is under where he will stand by default (then the server says so)
  private findGround(): boolean {
    const rule = this.canvasLimits?.ground;
    if (!rule || !this.deps.ground) { this.ground = null; return false; }
    try {
      const found = this.deps.ground(rule, this.canvasLimits!.maxPx, this.layer?.layerId ?? null) ?? [];
      const lines = Array.isArray(found) ? found : found.lines, things = Array.isArray(found) ? [] : found.things;
      this.ground = lines.length || things.length ? { lines, rule, pageW: V1_GROUND_PAGE.width, pageH: V1_GROUND_PAGE.height, ...(things.length ? { things } : {}) } : null;
      return Boolean(this.ground && v1GroundForDefault(lines, rule, V1_GROUND_PAGE.width, V1_GROUND_PAGE.height));
    } catch { this.ground = null; return false; }
  }
  // ONE small picture of the user's own drawing for this turn (null = off, nothing of theirs drawn, or it could not be made: never an error)
  private async canvasPicture(): Promise<V1CanvasPicture | null> {
    if (!this.canvasLimits || !this.deps.picture) return null;
    try {
      const pic = await this.deps.picture(this.canvasLimits, this.layer?.layerId ?? null);
      return pic && pic.data && pic.width <= this.canvasLimits.maxPx && pic.height <= this.canvasLimits.maxPx ? pic : null;
    } catch { return null; }
  }

  // (Nov 2 night) the timeline contact sheet for this turn (null = off, fewer than 2 changing frames, or it could not be made)
  private async sheetPicture(): Promise<V1CanvasPicture | null> {
    const limits = this.canvasLimits;
    if (!limits?.sheetFrames || !this.deps.sheet) return null;
    try {
      const pic = await this.deps.sheet(limits, this.layer?.layerId ?? null);
      return pic && pic.data && pic.frames && pic.frames.length >= 2 && pic.frames.length <= limits.sheetFrames && pic.width <= limits.maxPx && pic.height <= limits.maxPx ? pic : null;
    } catch { return null; }
  }

  private set(patch: Partial<V1PanelState>) {
    if (this.disposed) return;
    this.state = { ...this.state, ...patch };
    this.deps.onChange(this.state);
  }
  private push(line: V1LineInput, reveal = false) {
    const id = this.nextId++;
    this.set({ lines: [...this.state.lines, { ...line, id } as V1ChatLine], ...(reveal ? { reveal: [...this.state.reveal, id] } : {}) });
  }
  revealed(id: number) { if (this.state.reveal.includes(id)) this.set({ reveal: this.state.reveal.filter((x) => x !== id) }); }
  private idle() { this.set({ busy: null, activity: null, progress: null, thinking: null, stage: null }); }

  private async call(method: "GET" | "POST", body?: Record<string, unknown>, query?: Record<string, string>): Promise<{ ok: boolean; status: number; body: unknown }> {
    const url = query ? `${V1_API}?${new URLSearchParams(query).toString()}` : V1_API;
    const response = await this.deps.fetch(url, method === "POST" ? { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body ?? {}) } : { method });
    const parsed = await response.json().catch(() => null);
    return { ok: response.ok, status: response.status, body: parsed };
  }

  // (Nov 17, Part 2) while a turn is answered: ask the server what he has written so far (real time, deps.live.everyMs). A failed ask is
  // simply asked again; the turn itself never depends on it.
  private watchTurn(): { key: string; stop: () => void; firstWordsAt: () => number | null; searched: () => string[] } | null {
    const every = this.deps.live?.everyMs;
    if (!every || !(every > 0) || this.disposed) return null;
    const key = (globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`).replace(/[^A-Za-z0-9-]/g, "").slice(0, 64);
    let stopped = false, firstAt: number | null = null, searched: string[] = [], timer: ReturnType<typeof setTimeout> | null = null;
    const ask = async () => {
      if (stopped || this.disposed) return;
      try {
        const { ok, body } = await this.call("GET", undefined, { live: key });
        const t = this.state.thinking;
        if (!stopped && ok && isObject(body) && t) {
          const words = Array.isArray(body.words) ? body.words.filter((w): w is string => typeof w === "string" && w.trim() !== "").slice(0, 40) : [];
          const live = isObject(body.live) ? body.live : null;
          const say = live && typeof live.say === "string" ? live.say : t.say;
          if (live && Array.isArray(live.searching)) searched = live.searching.filter((q): q is string => typeof q === "string" && q.trim() !== "");
          if (say.trim() && firstAt === null) firstAt = this.clock();
          const phase = live && (live.phase === "thinking" || live.phase === "searching" || live.phase === "finalizing") ? live.phase : t.phase;
          this.set({ thinking: { ...t, ...(words.length ? { words } : {}), say, ...(phase ? { phase } : {}) } });
        }
      } catch { /* asked again below */ }
      if (!stopped) timer = setTimeout(() => { void ask(); }, every);
    };
    timer = setTimeout(() => { void ask(); }, every);
    return { key, firstWordsAt: () => firstAt, searched: () => searched, stop: () => { stopped = true; if (timer) clearTimeout(timer); } };
  }

  async send(message: string, effort?: V1ChatEffort) {
    const text = message.trim();
    if (!text || this.state.busy || this.disposed) return;
    const recentConversation = this.state.lines
      .filter((line): line is Extract<V1ChatLine, { kind: "user" | "ai" }> => line.kind === "user" || (line.kind === "ai" && line.tone !== "error"))
      .slice(-RECENT_LINES).map((line) => ({ role: line.kind === "user" ? "user" : "assistant", content: line.text }));
    this.set({ lines: this.state.lines.map((l) => l.kind === "gate" && l.state === "waiting" ? { ...l, state: "replaced" as const } : l.kind === "question" && !l.answered ? { ...l, answered: true } : l) });   // (Nov 11) a new message replaces a waiting plan
    this.push({ kind: "user", text });
    const sentAt = this.clock();
    this.set({ busy: "thinking", activity: V1_PANEL_WORDS.thinking, thinking: { since: sentAt, words: [], say: "" } });
    const watch = this.watchTurn();   // (Nov 17, Part 2) his words as he writes them (null = not watched)
    let reply: ReturnType<typeof readV1Turn> = null;
    try {
      const canvas = await this.canvasPicture();
      const sheet = await this.sheetPicture();
      const ground = this.findGround();
      const { ok, status, body } = await this.call("POST", { action: "turn", projectId: this.deps.projectId, ...(this.state.animationId ? { animationId: this.state.animationId } : {}), message: text, recentConversation, ...(canvas ? { canvas } : {}), ...(sheet ? { sheet } : {}), ...(ground ? { ground: true } : {}), ...(effort ? { effort } : {}), ...(watch ? { liveKey: watch.key } : {}), ...(this.deps.canvasFps?.() ? { projectFps: this.deps.canvasFps() } : {}), ...(this.deps.page?.() ? { page: this.deps.page() } : {}) });
      reply = ok ? readV1Turn(body) : null;
      if (status === 402) { try { this.deps.onCreditsRefused?.(); } catch { /* the card still shows on the next balance read */ } }
      if (!reply) { this.idle(); this.push({ kind: "ai", tone: "error", text: errorWords(body, "I couldn't answer just now. Nothing changed. Please try again in a moment.") }); return; }
    } catch {
      this.idle(); this.push({ kind: "ai", tone: "error", text: "I couldn't connect. Nothing changed. Check your internet and try again." });
      return;
    } finally { watch?.stop(); }
    // (Nov 17, Part 2) what he did folds into ONE grey line above his words; words already shown as he wrote them are not typed out again
    const shownLive = Boolean(this.state.thinking?.say.trim());
    const latestMade = latestVersion(reply.snapshot);
    const did = reply.gate ? "made the plan" : reply.questions.length ? "asked a question" : reply.clear ? "cleared the canvas" : latestMade && !this.settled.has(latestMade.n) ? "started animating" : null;
    this.push(turnWorkLine(sentAt, watch?.firstWordsAt() ?? null, this.clock(), watch?.searched() ?? [], did, Boolean(reply.gate)));
    this.set({ thinking: null });
    if (reply.say.trim()) this.push({ kind: "ai", text: reply.say }, !shownLive);
    if (reply.questions.length) this.push({ kind: "question", questions: reply.questions, answered: false });   // (Nov 11) the question card
    if (reply.handFix && !reply.gate) this.push({ kind: "handfix", fix: reply.handFix });   // (dad + Arthur, Nov 26) a look: fix it by hand, free
    if (reply.gate) {   // (Nov 11) nothing is made or charged until Animate
      const gateId = this.nextId;
      this.push({ kind: "gate", credits: reply.gate.credits, lines: reply.gate.lines, ...(reply.gate.exact?.length ? { exact: reply.gate.exact } : {}), notDrawn: reply.gate.notDrawn, colour: reply.gate.colour, state: "waiting", ...(reply.gate.picture ? { picture: { state: "offer" as const, kind: reply.gate.picture, credits: reply.gate.pictureOffer?.credits ?? 0, reused: reply.gate.pictureOffer?.reused ?? 0 } } : {}), ...(reply.gate.freeChangesLeft !== undefined ? { freeChangesLeft: reply.gate.freeChangesLeft } : {}), ...(reply.gate.edit ? { edit: true } : {}), ...(reply.gate.handFix ? { handFix: reply.gate.handFix } : {}) });
      this.idle();
      void gateId;   // (dad + Arthur, Nov 26) the first picture is drawn only when asked (showGatePicture), never by itself
      return;
    }
    if (reply.clear) { await this.clearCanvas(reply.clear); return; }
    if (reply.snapshot) this.adopt(reply.snapshot);
    const latest = latestVersion(reply.snapshot);
    if (latest && !this.settled.has(latest.n)) { this.watching = latest.n; this.set({ progress: null }); await this.follow(); }
    else if (reply.snapshot && reply.snapshot.current > 0 && ((reply.snapshot.fps ?? null) !== this.placedFps || (reply.snapshot.speed ?? null) !== this.placedSpeed)) await this.putOnCanvas(reply.snapshot.current, "fps");
    else if (Number(reply.snapshot?.storyPartsLeft) > 0) { this.idle(); await this.followNextPart(); }   // (Nov 20) his story is still being made (e.g. after a restart): the panel waits for it
    else this.idle();
  }

  private adopt(snapshot: V1AnimationSnapshot) {
    if (this.state.animationId && snapshot.animationId !== this.state.animationId) {
      // (Nov 2, one figure rule) a NEW animation takes the place of the one before on the canvas (its layer), never a 2nd figure
      if (this.layer) this.replaceLayer = this.layer;
      this.settled.clear(); this.pictures.clear(); this.layer = null; this.placedFps = null; this.placedSpeed = null; this.set({ placedVersion: null });
    }
    this.set({ snapshot, animationId: snapshot.animationId });
  }
  private replaceLayer: { layerId: string; count: number } | null = null; // the previous animation's layer (the next placement replaces it)
  private making: { n: number; startedAt: number; stages: { words: string; at: number }[] } | null = null; // (Nov 17) the version being made: its real stages, in order

  // (Nov 2) CLEAR CANVAS: the panel takes the AI animation (or every frame) off the canvas in ONE app Undo step, then starts fresh:
  // the next message makes a new animation. Nothing on the canvas changes when the canvas could not be cleared (said honestly).
  private async clearCanvas(scope: V1ClearScope) {
    let ok = false;
    try { ok = Boolean(await this.deps.clear?.(scope, this.layer ?? this.replaceLayer)); } catch { ok = false; }
    this.idle();
    if (!ok) { this.push({ kind: "ai", tone: "error", text: "I couldn't clear the canvas just now, so nothing changed. Please try again in a moment." }); return; }
    this.settled.clear(); this.pictures.clear(); this.layer = null; this.replaceLayer = null; this.placedFps = null; this.placedSpeed = null;
    this.set({ animationId: null, snapshot: null, placedVersion: null, pendingPlace: null });
  }

  // Look at the watched version: still running -> the stage words + poll again; finished -> settle it.
  private async follow() {
    // (Nov 20, Fable) between two parts: the next part is the first version the server added since the wait began (by place, never by a guessed number)
    if (this.watching === STORY_WAIT && this.storyWait !== null) {
      const fresh = this.state.snapshot?.versions.slice(this.storyWait).find((v) => !this.settled.has(v.n));
      if (fresh) { this.storyWait = null; this.watching = fresh.n; }
    }
    const n = this.watching;
    const version = n === null ? null : versionByN(this.state.snapshot, n);
    if (n === STORY_WAIT) {   // (Nov 20) between two parts of a story: the next version is not there yet
      if (Number(this.state.snapshot?.storyPartsLeft) > 0) { this.set({ busy: this.state.busy === "cancelling" ? "cancelling" : "running", stage: V1_PANEL_WORDS.nextPart }); this.schedulePoll(); return; }
      const stopped = this.state.busy === "cancelling";
      this.storyWait = null; this.watching = null; this.idle();
      this.push({ kind: "ai", ...(stopped ? {} : { tone: "error" as const }), text: stopped ? "Stopped. The rest of your story was not made - everything made so far stays on the canvas." : Number(this.state.snapshot?.storyPartsHeld) > 0 ? "The rest of your story was not made yet. Everything made so far is on the canvas, and the rest is kept: press \"Make the rest of my story\" when you are ready." : "The rest of your story was not made. Everything made so far is on the canvas." }, true);
      return;
    }
    if (!version || n === null) { this.idle(); return; }
    if (version.status === "running") {
      // (the Animating card, not the gradient line; the bar never goes backwards, a fresh eta restarts the countdown)
      const read = readV1Progress(version);
      const before = this.state.progress;
      const pct = read.pct === null ? before?.pct ?? null : Math.max(read.pct, before?.pct ?? 0);
      const etaChanged = read.etaS !== null && (read.etaS !== before?.etaS || before === null);
      const progress: V1Progress = { pct, etaS: read.etaS ?? before?.etaS ?? null, at: etaChanged || !before ? this.now() : before.at, ...(read.late ? { late: true } : {}), ...(read.part ? { part: read.part } : {}) };
      // (Nov 17, Part 2) the line above the bar follows the engine's REAL stage (Planning the moves -> Animating -> Drawing ...), kept in order
      if (this.making?.n !== n) this.making = { n, startedAt: this.clock(), stages: [] };
      const words = readV1StageWords(version);
      if (words && words !== this.making.stages.at(-1)?.words) this.making.stages.push({ words, at: this.clock() });
      this.set({ busy: this.state.busy === "cancelling" ? "cancelling" : "running", activity: null, progress, stage: words ?? this.state.stage });
      this.schedulePoll();
      return;
    }
    this.watching = null;
    this.settled.add(n);
    if (version.status === "done") {
      // (Nov 17, Arthur: "100% means done") made is not yet ON THE CANVAS: the bar stays under 95% with "Putting it on the canvas" while the
      // pictures load and are placed, and shows 100% only once they are there (putOnCanvas), then the result appears
      if (this.making?.n === n) this.making.stages.push({ words: V1_PANEL_WORDS.placing, at: this.clock() });
      this.set({ busy: "finishing", activity: null, stage: V1_PANEL_WORDS.placing, progress: { pct: 100, etaS: 0, at: this.now() } });
      await this.putOnCanvas(n, "made");
      await this.followNextPart();
      return;
    }
    this.idle();
    // (Nov 20, Fable) a part cut off by a restart while parts are still to come: the server makes it again from the saved parts - the panel says so and waits
    const storyGoesOn = version.status === "failed" && Number(this.state.snapshot?.storyPartsLeft) > 0;
    if (version.status === "refused") this.push({ kind: "ai", text: refusedWords(version) }, true);
    else if (version.status === "cancelled") this.push({ kind: "ai", text: plainWords(version.message, "Stopped. Nothing was added to the canvas.") }, true);
    else if (storyGoesOn) this.push({ kind: "ai", text: "The app restarted while this part of your story was being made - it is being made again now." }, true);
    else this.push({ kind: "ai", text: failedWords(version) }, true);
    if (storyGoesOn) await this.followNextPart();
  }

  // (Nov 17, PLAN_FINAL_NOV17) a story in parts: the server starts the next part in the same moment one is done, so the answer that said
  // "done" already lists it as running: after a version is on the canvas the panel follows the next part exactly like the first
  // (Nov 20, Fable: since Nov 19 the next part starts only after the AI has written it, ~20 s, so at this one look nothing runs yet and the
  // panel stopped watching - the rest of his story appeared only when he typed) while the server says parts are still to come, the panel
  // keeps watching for the next version, says so, and his box waits: one story, start to finish
  private storyWait: number | null = null; // (how many versions there were when the wait began: the next part is the first one added after them)
  private async followNextPart() {
    if (this.disposed) return;
    const next = this.state.snapshot?.versions.find((v) => v.status === "running" && !this.settled.has(v.n));
    if (next) { this.storyWait = null; this.watching = next.n; await this.follow(); return; }
    if (!(Number(this.state.snapshot?.storyPartsLeft) > 0)) return;
    this.storyWait = this.state.snapshot?.versions.length ?? 0;
    this.watching = STORY_WAIT;
    this.set({ busy: "running", activity: null, progress: null, stage: V1_PANEL_WORDS.nextPart });
    this.schedulePoll();
  }

  private schedulePoll() {
    if (this.pollTimer) this.clearTimer(this.pollTimer);
    this.pollTimer = this.setTimer(() => { this.pollTimer = null; void this.poll(); }, V1_POLL_MS);
  }

  async poll() {
    if (this.disposed || this.watching === null || !this.state.animationId) return;
    try {
      const { ok, body } = await this.call("GET", undefined, { projectId: this.deps.projectId, animationId: this.state.animationId, layers: "0" });
      const snapshot = ok ? readV1Snapshot(body) : null;
      if (!snapshot) throw new Error("unreadable");
      this.misses = 0;
      this.adopt(snapshot);
    } catch {
      this.misses += 1;
      const story = this.watching === STORY_WAIT || Number(this.state.snapshot?.storyPartsLeft) > 0;   // (Nov 20) a story waits longer: the server goes on with it after a restart
      if (this.misses >= (story ? MAX_STORY_MISSES : MAX_POLL_MISSES)) {
        this.watching = null; this.storyWait = null; this.misses = 0; this.idle();
        this.push({ kind: "ai", tone: "error", text: story ? "I lost the connection while your story was being made. Everything made so far stays - open the project again in a minute to see the rest." : "I lost the connection while it was being made. It may still finish: open the project again in a minute to see it." });
        return;
      }
    }
    await this.follow();
  }

  // Fetch (or reuse) a version's pictures and put them on the canvas.
  private async putOnCanvas(n: number, why: "made" | "undo" | "redo" | "retry" | "fps", answer: unknown = null) {
    if (this.placeTimer) { this.clearTimer(this.placeTimer); this.placeTimer = null; } // (a newer placement replaces a waiting one)
    const version = versionByN(this.state.snapshot, n);
    const animationId = this.state.animationId;
    if (!version || version.status !== "done" || !animationId) { this.idle(); return; }
    const onBar = why === "made" && this.state.busy === "finishing";   // (Nov 17) just made: the bar stays and says it is being put on the canvas
    if (!onBar) this.set({ busy: why === "undo" || why === "redo" ? "switching" : "placing", activity: V1_PANEL_WORDS.placing, progress: null });
    // (kept pictures first; else from the server) (Nov 15, Arthur's 35-second story could not be loaded) the pictures come in PIECES,
    // so an animation of any length loads: piece after piece until all `resultTotal` are here; the first may have come with an Undo / Redo answer
    let pictures = this.pictures.get(n) ?? null;
    let said: unknown = null;
    const have: (string | null)[] = [];   // (the pictures that came so far)
    for (let body = answer; !pictures; ) {
      const piece = readV1Pictures(body, n);
      if (isObject(body) && body.resultError) said = body.resultError;
      if (piece) have.push(...piece.pictures);
      else if (body !== answer) break;   // the server had no (next) piece: nothing is placed
      if (piece && !(isObject(body) && Number(body.resultTotal) > have.length)) { pictures = { ...piece, pictures: have }; break; }
      try {
        const got = await this.call("GET", undefined, { projectId: this.deps.projectId, animationId, ...(have.length ? { from: String(have.length) } : {}) });
        body = got.ok ? got.body : { resultError: isObject(got.body) ? got.body.resultError : null };
      } catch { body = {}; }
    }
    if (pictures) {
      // (Nov 15, Arthur: "if you edit it a million times ... laggy?") every version's pictures were kept here as text for an instant
      // Undo / Redo - half a gigabyte for one version of a 35-second story, and one more with every edit. The panel now holds at most
      // V1_KEPT_PICTURE_TEXT of it: the versions used longest ago are let go first (asked from the server again when Undo needs them),
      // and a version that is bigger than that by itself is not kept at all.
      this.pictures.delete(n); this.pictures.set(n, pictures);
      const size = (p: V1VersionPictures) => p.pictures.reduce((sum, url) => sum + (url ? url.length : 0), 0);
      let held = [...this.pictures.values()].reduce((sum, p) => sum + size(p), 0);
      for (const [k, p] of [...this.pictures]) { if (held <= (this.deps.keptPictureText ?? V1_KEPT_PICTURE_TEXT)) break; this.pictures.delete(k); held -= size(p); }
    }
    if (!pictures) {
      this.idle();
      this.push({ kind: "ai", tone: "error", text: plainWords(said, why === "made" ? "The animation is made, but I couldn't load it, so nothing was added to the canvas. Please try again." : "I couldn't load that version, so the canvas didn't change.") });
      return;
    }
    let ok = false;
    const fps = this.state.snapshot?.fps ?? null, speed = this.state.snapshot?.speed ?? null;
    try {
      const placed = await this.deps.place({ animationId, version: n, fps, speed, layer: this.layer, ...(!this.layer && this.replaceLayer ? { replace: this.replaceLayer } : {}), ...(this.ground ? { ground: this.ground } : {}) }, pictures);
      ok = Boolean(placed);
      if (ok) { this.placedFps = fps; this.placedSpeed = speed; this.replaceLayer = null; this.placedHere = { n, at: this.clock() }; }
      if (placed && typeof placed === "object" && (placed.layerId !== this.layer?.layerId || placed.count !== this.layer?.count)) {
        this.layer = placed;
        // (kept by the server: after a reload the next edit replaces THIS layer; best effort)
        void this.call("POST", { action: "layer", projectId: this.deps.projectId, animationId, layerId: placed.layerId, count: placed.count }).catch(() => undefined);
      }
    } catch { ok = false; }
    if (ok && onBar) { this.set({ progress: { pct: 100, etaS: 0, at: this.now(), onCanvas: true } }); await this.wait(V1_FULL_BAR_MS); }   // (100% = it IS on the canvas)
    this.idle();
    if (!ok) {
      // (Nov 2, Arthur: never interrupt the user) the placer already pauses playback by itself; a canvas that is still busy
      // (a stroke being drawn) is tried again silently until it is safe. No message, no button.
      this.set({ pendingPlace: n });
      if (!this.disposed) this.placeTimer = this.setTimer(() => { this.placeTimer = null; void this.retryPlace(why === "made" ? "made" : "retry"); }, V1_PLACE_RETRY_MS);
      return;
    }
    this.set({ placedVersion: n, pendingPlace: null });
    const earlier = this.state.snapshot?.versions.filter((v) => v.status === "done") ?? [];
    if (why === "made") {
      const work = this.making?.n === n ? makingWorkLine(this.making, this.clock()) : null;   // (Nov 17) "Made the animation in 1 min 40 s ›"
      this.making = null;
      if (work) this.push(work);
      this.push(resultLineFor(version, earlier));
      const kept = keptPreviousWords(version); // (Nov 2) honest: the try came out worse, his version was kept; offer once more
      if (kept) this.push({ kind: "ai", text: kept }, true);
      const seen = viewerWords(version);
      if (seen) this.push({ kind: "ai", text: seen }, true);
    }
    else if (why === "undo" || why === "redo" || why === "fps") return; // (Nov 2, Arthur: Undo / Redo are silent)
    else if (!this.state.lines.some((line) => line.kind === "result" && line.version === n)) this.push(resultLineFor(version, earlier));
  }

  // The silent retry (never a button): places the waiting version as soon as the canvas is free. Busy with something else
  // (a new message being answered) = wait a little more.
  async retryPlace(why: "made" | "retry" = "retry") {
    const n = this.state.pendingPlace;
    if (n === null || this.disposed) return;
    if (this.state.busy) { if (!this.placeTimer) this.placeTimer = this.setTimer(() => { this.placeTimer = null; void this.retryPlace(why); }, V1_PLACE_RETRY_MS); return; }
    await this.putOnCanvas(n, why);
  }

  // (Nov 11) the gate card's Animate: the server starts the plan that is waiting (no second AI call); then exactly like a started animation
  // (Nov 22, Arthur: "are you sure you want it to look like this?") the gate card's first picture: the server draws it with the engine's own
  // first step (the picture the animation starts from); Animate waits for it. Shown once, only for a new animation with things in it.
  /** (dad + Arthur, Nov 26) "Show the first picture (about N credits)": drawn only now, when asked. */
  showGatePicture(lineId: number) {
    const line = this.state.lines.find((l) => l.id === lineId && l.kind === "gate");
    if (!line || line.kind !== "gate" || line.state !== "waiting" || !line.picture || line.picture.state === "drawing" || line.picture.state === "ready") return;
    const kind = line.picture.kind;
    this.set({ lines: this.state.lines.map((l) => l.id === lineId && l.kind === "gate" ? { ...l, picture: { state: "drawing" as const, kind } } : l) });
    void this.drawGatePicture(lineId, kind);
  }
  private async drawGatePicture(lineId: number, kind: V1GatePictureKind) {
    const put = (picture: V1GatePicture) => { if (!this.disposed) this.set({ lines: this.state.lines.map((l) => l.id === lineId && l.kind === "gate" ? { ...l, picture } : l) }); };
    try {
      const { ok, body } = await this.call("POST", { action: "gatePicture", projectId: this.deps.projectId });
      const b = isObject(body) ? body : {};
      if (ok && typeof b.picture === "string" && b.picture.startsWith("data:image/")) put({ state: "ready", src: b.picture, credits: Number(b.credits) || 0, animateCredits: Number.isFinite(Number(b.animateCredits)) ? Number(b.animateCredits) : kind === "new" ? Number(b.credits) || 0 : 0, kind });   // (credits = if the plan is changed instead; animateCredits = paid with Animate)
      else if (ok && b.picture === null && !b.why) put({ state: "none", kind });
      else put({ state: "failed", why: typeof b.why === "string" && b.why ? b.why : errorWords(body, "it could not be drawn"), kind });
    } catch { put({ state: "failed", why: "I couldn't connect", kind }); }
  }

  async animate(lineId: number) {
    if (this.state.busy || this.disposed) return;
    if (this.state.lines.some((l) => l.id === lineId && l.kind === "gate" && l.picture?.state === "drawing")) return;   // (Nov 22) the picture first
    const mark = (state: "waiting" | "started") => this.set({ lines: this.state.lines.map((l) => l.id === lineId && l.kind === "gate" ? { ...l, state } : l) });
    mark("started");
    this.set({ busy: "thinking", activity: V1_PANEL_WORDS.thinking });
    let reply: ReturnType<typeof readV1Turn> = null;
    try {
      const { ok, status, body } = await this.call("POST", { action: "confirm", projectId: this.deps.projectId });
      reply = ok ? readV1Turn(body) : null;
      if (status === 402) { try { this.deps.onCreditsRefused?.(); } catch { /* the card still shows on the next balance read */ } }
      if (!reply) { this.idle(); if (status !== 402) mark("waiting"); this.push({ kind: "ai", tone: "error", text: errorWords(body, "I couldn't start it just now. Nothing was charged. Please try again.") }); return; }
    } catch {
      this.idle(); mark("waiting"); this.push({ kind: "ai", tone: "error", text: "I couldn't connect. Nothing was charged. Check your internet and try again." });
      return;
    }
    if (reply.snapshot) this.adopt(reply.snapshot);
    const latest = latestVersion(reply.snapshot);
    if (latest && !this.settled.has(latest.n)) { this.watching = latest.n; this.set({ progress: null }); await this.follow(); }
    else this.idle();
  }

  // (Nov 20) "Make the rest of my story": the server makes the kept parts; the panel follows them like any story
  async continueStory() {
    if (this.state.busy || this.disposed || !this.state.animationId || !(Number(this.state.snapshot?.storyPartsHeld) > 0)) return;
    this.set({ busy: "thinking", activity: V1_PANEL_WORDS.thinking });
    try {
      const { ok, body } = await this.call("POST", { action: "continueStory", projectId: this.deps.projectId, animationId: this.state.animationId });
      const snapshot = ok ? readV1Snapshot(body) : null;
      if (!snapshot) { this.idle(); this.push({ kind: "ai", tone: "error", text: errorWords(body, "I couldn't go on with your story just now. Nothing was charged. Please try again in a moment.") }); return; }
      this.adopt(snapshot); this.idle();
      this.push({ kind: "ai", text: `Making the rest of your story now, going on from the last picture.` }, true);
      await this.followNextPart();
    } catch {
      this.idle(); this.push({ kind: "ai", tone: "error", text: "I couldn't connect. Nothing was charged. Check your internet and try again." });
    }
  }

  // (Nov 20, Fable) "Leave it as it is": the kept story is let go
  async dropStory() {
    if (this.state.busy || this.disposed || !this.state.animationId) return;
    try {
      const { ok, body } = await this.call("POST", { action: "dropStory", projectId: this.deps.projectId, animationId: this.state.animationId });
      const snapshot = ok ? readV1Snapshot(body) : null;
      if (snapshot) this.adopt(snapshot);
    } catch { /* the card stays: nothing changed */ }
  }

  async cancel() {
    if (this.state.busy !== "running" || !this.state.animationId) return;
    this.set({ busy: "cancelling" });
    try {
      const { ok, body } = await this.call("POST", { action: "cancel", projectId: this.deps.projectId, animationId: this.state.animationId });
      const snapshot = ok ? readV1Snapshot(body) : null;
      if (!snapshot) throw new Error("unreadable");
      this.adopt(snapshot);
      await this.follow();
    } catch {
      this.set({ busy: "running" });
      this.push({ kind: "ai", tone: "error", text: "I couldn't stop it, so it's still being made. Try Cancel again in a moment." });
    }
  }

  async step(action: "undo" | "redo") {
    const { canUndo, canRedo } = undoRedoState(this.state.snapshot);
    if (this.state.busy || !this.state.animationId || (action === "undo" ? !canUndo : !canRedo)) return;
    this.set({ busy: "switching" });
    try {
      const { ok, body } = await this.call("POST", { action, projectId: this.deps.projectId, animationId: this.state.animationId });
      const snapshot = ok ? readV1Snapshot(body) : null;
      if (!snapshot) { this.idle(); this.push({ kind: "ai", tone: "error", text: errorWords(body, action === "undo" ? "Undo didn't work, so the canvas didn't change." : "Redo didn't work, so the canvas didn't change.") }); return; }
      this.adopt(snapshot);
      await this.putOnCanvas(snapshot.current, action, body);
    } catch {
      this.idle();
      this.push({ kind: "ai", tone: "error", text: "I couldn't connect, so the canvas didn't change." });
    }
  }
}
