import { readFileSync } from "node:fs";
import { readEditSize, type EditSize } from "./v1EditSize.ts";
import type { V1GroundRule } from "./v1PageFit.ts";
import { V1_PARTS, type V1Camera, type V1CanvasLimits, type V1CanvasPicture, type V1EditOp, type V1GlowStrength, type V1Pen, type V1Style, type V1Intent, type V1Look, type V1LunaTurn, type V1Part, type V1PartColours, type V1Plan, type V1StageCode, type V1StoryPlan, type V1KimodoStep } from "./v1AnimatorContract.ts";

// LUNA'S V1 BOOK + THE ENGINE'S WORD LISTS, read BY KEY at every turn (never typed in code) - SAME ENGINE (helper T1, Nov 1 night):
//   ltx-effects/v1k/luna-book.json            who Luna is, the capability sentence, refusal words, how to classify / create / edit, server words
//   ltx-effects/v1k/passed_engine_book.json   the engine's contract word, looks, stage words
// A missing REQUIRED key is a loud error (LunaBookError) - never a silent default. Pure: node --test runs it.

export class LunaBookError extends Error {}
type Json = Record<string, unknown>;
const isRecord = (v: unknown): v is Json => typeof v === "object" && v !== null && !Array.isArray(v);
const readJson = (path: string): unknown => JSON.parse(readFileSync(path, "utf8"));
const need = <T>(value: T | undefined | null, where: string): T => {
  if (value === undefined || value === null || (typeof value === "string" && !value.trim())) throw new LunaBookError(`book key missing: ${where}`);
  return value;
};
const at = (obj: unknown, path: string[]): unknown => path.reduce<unknown>((cur, key) => (isRecord(cur) ? cur[key] : undefined), obj);
const strings = (v: unknown): string[] | null => (Array.isArray(v) && v.length && v.every((s) => typeof s === "string" && s.trim()) ? (v as string[]) : null);

// ---- Luna's book
export type LunaBook = {
  who: string;
  capability: string;
  classify: Record<V1Intent, string>;
  refuse: { when: string[]; say: string; how: string };
  createRules: string[];
  createExamples: unknown[];
  createMaxBlocks: number;
  createMaxParts: number; // (Nov 2) book create.max_parts: the most separate actions one block sentence may be split into (parts)
  editIntro: string;
  editOps: string; // every op, in plain words (the honesty rule points here)
  editRules: string[];
  editSize: EditSize; // (Nov 2 app round) book edit.size_guard: EDITS KEEP SIZE, the server guard (v1EditSize.ts)
  lengthSentence: { units: string[]; words: string[] }; // (Nov 2 app round) book long_scenes.length_sentence: the AI's own length sentences (one honest line)
  editExamples: unknown[];
  honesty: string[];
  style: string;
  looksIntro: string;
  defaultColour: string;
  defaultLook: string;
  figureDefaultId: string;
  currentNone: string;
  backupNote: string; // (Nov 8 eve) what movesDrawnByBackupAnimator means, for Sonnet (book backup_note)
  checkerRetry: string;
  limits: { facingViewer: string; facingViewerHow: string };
  longScenes: { rule: string; nextPart: string; blockSeconds: number; minSeconds: number; toleranceSeconds: number; lengthHonest: string; impossibleUpFront: string; examples: unknown[];
    maxStorySeconds: number; guideBlockSeconds: number;
    oneTakeMaxS: number; stepsTakeMaxS: number; oneTakeMaxBeats: number; oneTakeAlways: boolean; makeSBase: number; makeSPerAskedS: number; maxMakeS: number }; // (Nov 2 night) one take + making-time guide // (Nov 2) plan first; (final round) the SERVER's longest make-at-once + its guided block length
  camera: { stillHeightShare: number }; // (Nov 2 final round) book camera: camera "still" = his first picture at this share of the page height; (Nov 3) stillWords = the user's words that ask for it
  addOnEnding?: string | null; // (Nov 19, Arthur: endings look cut off) book add_on_ending.text: sent only on a turn that already has an animation
  newAnimationGuide?: string[] | null; // (Nov 19, Arthur: Sonnet guides H3) book new_animation_guide: sent only on a turn with no animation yet; the system prompt and editing turns never get it
  h3Free?: { on: boolean; rules: string[] } | null; // (Nov 18, Arthur: H3 animates whatever he wants) book h3_free: the rules of a turn that makes a NEW animation; editing turns never get them
  kimodoSteps: { rules: string[]; minS: number; maxS: number; coverSay: string; stepsSay: string }; // (Nov 4 PM12) book kimodo_steps: the chat AI writes Kimodo's steps
  storyGuide: { rules: string[]; examples: unknown[] }; // (Nov 2) the AI is a story guide (book story_guide)
  speed: { min: number; max: number }; // (Nov 2) book playback_speed (op speed)
  capabilities: { check: string; can: string[]; cannot: string[]; knownWeak: string[]; weakHow: string; examples: unknown[] }; // (Nov 2) book capabilities
  serverWords: Record<string, string>;
  plainFailures?: { keys: string[]; rules: { match: string; say: string }[]; plainOk: string; generic: string } | null; // (Nov 2) book plain_failures
  canvas?: V1CanvasRule | null; // (Nov 2 final round) book "canvas": the AI sees the user's drawing (absent = off: no picture is ever sent)
  viewer?: V1ViewerRule | null; // (Nov 3 key 2) book "viewer": the same Sonnet looks at each made take before the canvas (absent / on false = off)
};
// (Nov 3 key 2) say = the ONE honest line after a judged take, by what happened ({missing} = the viewer's own words)
export type V1ViewerSay = "missing" | "retried_shown" | "retried_missing" | "retried_unjudged" | "first_kept";
export type V1ViewerRule = { active: boolean; maxRetries: number; timeoutMs: number; instruction: string; retryChange: string; stepsFix: string; say: Record<V1ViewerSay, string> };
export type V1CanvasRule = V1CanvasLimits & { note: string; rules: string[]; examples: unknown[]; groundSay: string | null;
  sheet?: { maxFrames: number; note: string; rules: string[] } | null }; // (Nov 2 night) book canvas.sheet: the timeline contact sheet (absent = off)
const INTENTS: Record<V1Intent, true> = { conversation: true, create: true, edit: true, clarify: true, refuse: true };
export const isV1Intent = (v: unknown): v is V1Intent => typeof v === "string" && Object.prototype.hasOwnProperty.call(INTENTS, v);

export function readLunaBook(path: string): LunaBook {
  const b = readJson(path);
  if (!isRecord(b)) throw new LunaBookError(`Luna's book is not a JSON object: ${path}`);
  const classify = {} as Record<V1Intent, string>;
  for (const intent of Object.keys(INTENTS) as V1Intent[]) classify[intent] = need(at(b, ["classify", intent]) as string, `classify.${intent}`);
  const serverWords = need(at(b, ["server_words"]), "server_words");
  if (!isRecord(serverWords)) throw new LunaBookError("book key server_words is not an object");
  const long = at(b, ["long_scenes"]);
  const maxBlocks = Number(need(at(b, ["create", "max_blocks"]) as number, "create.max_blocks"));
  if (!Number.isSafeInteger(maxBlocks) || maxBlocks < 1) throw new LunaBookError("book key create.max_blocks is not a whole number >= 1");
  return {
    who: need(b.who as string, "who"),
    capability: need(b.capability as string, "capability"),
    classify,
    refuse: {
      when: need(strings(at(b, ["refuse", "when"])), "refuse.when"),
      say: need(at(b, ["refuse", "say"]) as string, "refuse.say"),
      how: need(at(b, ["refuse", "how"]) as string, "refuse.how"),
    },
    // {block_seconds} (and any other {key} of long_scenes) is filled from the book itself
    createRules: need(strings(at(b, ["create", "rules"])), "create.rules").map((r) => fillFrom(r, long, "long_scenes")),
    createExamples: Array.isArray(at(b, ["create", "examples"])) ? (at(b, ["create", "examples"]) as unknown[]) : [],
    createMaxBlocks: maxBlocks,
    createMaxParts: (() => { const n = Number(need(at(b, ["create", "max_parts"]) as number, "create.max_parts")); if (!Number.isSafeInteger(n) || n < 2) throw new LunaBookError("book key create.max_parts is not a whole number >= 2"); return n; })(),
    editIntro: need(at(b, ["edit", "_"]) as string, "edit._"),
    editOps: need(at(b, ["edit", "ops_list"]) as string, "edit.ops_list"),
    // (Nov 2 app round) {max_beats} = edit.size_guard, {block_seconds} (any long_scenes key) = long_scenes
    editRules: need(strings(at(b, ["edit", "rules"])), "edit.rules").map((r) => r.replace(/\{max_beats\}/g, String(at(b, ["edit", "size_guard", "max_beats"]) ?? "{max_beats}"))).map((r) => (r.includes("{block_seconds}") ? r.replace(/\{block_seconds\}/g, String(at(long, ["block_seconds"]))) : r)),
    editSize: readEditSize(at(b, ["edit", "size_guard"]), need),
    lengthSentence: { units: need(strings(at(b, ["long_scenes", "length_sentence", "units"])), "long_scenes.length_sentence.units"), words: need(strings(at(b, ["long_scenes", "length_sentence", "words"])), "long_scenes.length_sentence.words") },
    editExamples: Array.isArray(at(b, ["edit", "examples"])) ? (at(b, ["edit", "examples"]) as unknown[]) : [],
    honesty: need(strings(b.honesty), "honesty"),
    style: need(b.style as string, "style"),
    looksIntro: need(b.looks_intro as string, "looks_intro"),
    defaultColour: need(b.default_colour as string, "default_colour"),
    defaultLook: need(b.default_look as string, "default_look"),
    figureDefaultId: need(b.figure_default_id as string, "figure_default_id"),
    currentNone: need(b.current_none as string, "current_none"),
    backupNote: typeof b.backup_note === "string" ? b.backup_note : "",
    checkerRetry: need(b.checker_retry as string, "checker_retry"),
    limits: {
      facingViewer: need(at(b, ["v1_limits", "facing_viewer"]) as string, "v1_limits.facing_viewer"),
      facingViewerHow: need(at(b, ["v1_limits", "facing_viewer_how"]) as string, "v1_limits.facing_viewer_how"),
    },
    longScenes: {
      rule: fillFrom(need(at(b, ["long_scenes", "rule"]) as string, "long_scenes.rule"), long, "long_scenes"),
      nextPart: fillFrom(need(at(b, ["long_scenes", "next_part"]) as string, "long_scenes.next_part"), long, "long_scenes"),
      blockSeconds: bookNumber(at(b, ["long_scenes", "block_seconds"]), "long_scenes.block_seconds"),
      minSeconds: bookNumber(at(b, ["long_scenes", "min_seconds"]), "long_scenes.min_seconds"),
      toleranceSeconds: bookNumber(at(b, ["long_scenes", "tolerance_seconds"]), "long_scenes.tolerance_seconds"),
      lengthHonest: fillFrom(need(at(b, ["long_scenes", "length_honest"]) as string, "long_scenes.length_honest"), long, "long_scenes"),
      impossibleUpFront: need(at(b, ["long_scenes", "impossible_up_front"]) as string, "long_scenes.impossible_up_front"),
      examples: Array.isArray(at(b, ["long_scenes", "examples"])) ? (at(b, ["long_scenes", "examples"]) as unknown[]) : [],
      maxStorySeconds: bookNumber(at(b, ["long_scenes", "max_story_s"]), "long_scenes.max_story_s"),
      guideBlockSeconds: bookNumber(at(b, ["long_scenes", "guide_block_s"]), "long_scenes.guide_block_s"),
      oneTakeMaxS: bookNumber(at(b, ["long_scenes", "one_take_max_s"]), "long_scenes.one_take_max_s"),
      stepsTakeMaxS: bookNumber(at(b, ["long_scenes", "steps_take_max_s"]), "long_scenes.steps_take_max_s"),
      oneTakeMaxBeats: bookNumber(at(b, ["long_scenes", "one_take_max_beats"]), "long_scenes.one_take_max_beats"),
      oneTakeAlways: at(b, ["long_scenes", "one_take_always"]) === true,
      makeSBase: bookNumber(at(b, ["long_scenes", "make_s_base"]), "long_scenes.make_s_base"),
      makeSPerAskedS: bookNumber(at(b, ["long_scenes", "make_s_per_asked_s"]), "long_scenes.make_s_per_asked_s"),
      maxMakeS: bookNumber(at(b, ["long_scenes", "max_make_s"]), "long_scenes.max_make_s"),
    },
    camera: { stillHeightShare: bookNumber(at(b, ["camera", "still_height_share"]), "camera.still_height_share") },
    addOnEnding: typeof at(b, ["add_on_ending", "text"]) === "string" && String(at(b, ["add_on_ending", "text"])).trim() ? String(at(b, ["add_on_ending", "text"])) : null,
    newAnimationGuide: at(b, ["new_animation_guide", "rules"]) === undefined ? null : need(strings(at(b, ["new_animation_guide", "rules"])), "new_animation_guide.rules"),
    h3Free: at(b, ["h3_free", "on"]) === true ? { on: true, rules: need(strings(at(b, ["h3_free", "rules"])), "h3_free.rules") } : null,
    kimodoSteps: { rules: need(strings(at(b, ["kimodo_steps", "rules"])), "kimodo_steps.rules"), minS: bookNumber(at(b, ["kimodo_steps", "min_s"]), "kimodo_steps.min_s"), maxS: bookNumber(at(b, ["kimodo_steps", "max_s"]), "kimodo_steps.max_s"), coverSay: need(at(b, ["kimodo_steps", "cover_say"]) as string, "kimodo_steps.cover_say"), stepsSay: need(at(b, ["kimodo_steps", "steps_say"]) as string, "kimodo_steps.steps_say") },
    storyGuide: {
      rules: need(strings(at(b, ["story_guide", "rules"])), "story_guide.rules").map((r) => fillFrom(r, long, "long_scenes")),
      examples: Array.isArray(at(b, ["story_guide", "examples"])) ? (at(b, ["story_guide", "examples"]) as unknown[]) : [],
    },
    capabilities: {
      check: need(at(b, ["capabilities", "check"]) as string, "capabilities.check"),
      can: need(strings(at(b, ["capabilities", "can"])), "capabilities.can").map((r) => fillFrom(r, long, "long_scenes")),
      cannot: need(strings(at(b, ["capabilities", "cannot"])), "capabilities.cannot"),
      knownWeak: strings(at(b, ["capabilities", "known_weak"])) ?? [],   // (Nov 13: no weak moves are listed any more - the only limit is the animator)
      weakHow: need(at(b, ["capabilities", "weak_how"]) as string, "capabilities.weak_how"),
      examples: Array.isArray(at(b, ["capabilities", "examples"])) ? (at(b, ["capabilities", "examples"]) as unknown[]) : [],
    },
    speed: { min: bookNumber(at(b, ["playback_speed", "min"]), "playback_speed.min"), max: bookNumber(at(b, ["playback_speed", "max"]), "playback_speed.max") },
    plainFailures: readPlainFailures(at(b, ["plain_failures"])),
    canvas: readCanvasRule(at(b, ["canvas"])),
    viewer: readViewerRule(at(b, ["viewer"])),
    serverWords: Object.fromEntries(Object.entries(serverWords).filter(([k, v]) => !k.startsWith("_") && typeof v === "string")) as Record<string, string>,
  };
}

// ---- Which brain writes the chat turn (book "brains"): env DIAMOND_V1_BRAIN=sonnet|luna, default luna (unchanged).
// The Sonnet settings are read from the SAME book (one place): its model is also the director's model when the brain is sonnet.
export type V1Brain = "luna" | "sonnet";
export const v1Brain = (env: Record<string, string | undefined> = process.env): V1Brain => (env.DIAMOND_V1_BRAIN?.trim().toLowerCase() === "sonnet" ? "sonnet" : "luna");
export type SonnetBrain = {
  model: string; maxTokens: number; ledger: string; ledgerWho: string;
  priceIn: number; priceOut: number; budgetDefaultUsd: number; budgetMarginUsd: number;
};
// ledger = relative to the engine root (or absolute). env DIAMOND_V1_SONNET_MODEL overrides the book's model.
export function readSonnetBrain(lunaBookPath: string, engineRoot: string, env: Record<string, string | undefined> = process.env): SonnetBrain {
  const b = readJson(lunaBookPath);
  const s = at(b, ["brains", "sonnet"]);
  if (!isRecord(s)) throw new LunaBookError("book key missing: brains.sonnet");
  const ledger = need(s.ledger as string, "brains.sonnet.ledger");
  return {
    model: env.DIAMOND_V1_SONNET_MODEL?.trim() || need(s.model as string, "brains.sonnet.model"),
    maxTokens: bookNumber(s.max_tokens, "brains.sonnet.max_tokens"),
    ledger: ledger.startsWith("/") ? ledger : `${engineRoot.replace(/\/+$/, "")}/${ledger}`,
    ledgerWho: need(s.ledger_who as string, "brains.sonnet.ledger_who"),
    priceIn: bookNumber(at(s, ["price_usd_per_million", "in"]), "brains.sonnet.price_usd_per_million.in"),
    priceOut: bookNumber(at(s, ["price_usd_per_million", "out"]), "brains.sonnet.price_usd_per_million.out"),
    budgetDefaultUsd: bookNumber(s.budget_default_usd, "brains.sonnet.budget_default_usd"),
    budgetMarginUsd: Number(need(s.budget_margin_usd as number, "brains.sonnet.budget_margin_usd")),
  };
}

// (Nov 2 final round, owner) EFFORT: the chat's Effort button (Auto / Low / Medium / High, the Help assistant's picker). Book "effort":
// absent = null (every turn is low = today's forced call); present but incomplete = a loud error. Numbers + patterns are the book's.
export type V1Effort = "auto" | "low" | "medium" | "high";
export type V1EffortLevel = Exclude<V1Effort, "auto">;
export const V1_EFFORTS: readonly V1Effort[] = ["auto", "low", "medium", "high"];
export const isV1Effort = (v: unknown): v is V1Effort => typeof v === "string" && (V1_EFFORTS as readonly string[]).includes(v);
export type SonnetEffortBook = {
  budgets: Record<V1EffortLevel, number>; answerTokens: number;
  auto: { story: RegExp; joiners: RegExp; severalMin: number; highLevel: V1EffortLevel; low: RegExp; lowMaxWords: number; lowMaxJoiners: number; fallback: V1EffortLevel; newQuestion?: RegExp | null };
};
const LEVELS: V1EffortLevel[] = ["low", "medium", "high"];
const bookLevel = (v: unknown, where: string): V1EffortLevel => {
  if (!LEVELS.includes(v as V1EffortLevel)) throw new LunaBookError(`book key ${where} must be one of ${LEVELS.join(", ")}`);
  return v as V1EffortLevel;
};
const bookRegex = (v: unknown, where: string, flags: string): RegExp => {
  const source = need(v as string, where);
  try { return new RegExp(source, flags); } catch (error) { throw new LunaBookError(`book key ${where} is not a valid pattern: ${String(error)}`); }
};
const wholeAtLeast = (v: unknown, where: string, min: number): number => {
  const n = Number(need(v as number, where));
  if (!Number.isSafeInteger(n) || n < min) throw new LunaBookError(`book key ${where} must be a whole number >= ${min}`);
  return n;
};
export function readSonnetEffort(lunaBookPath: string): SonnetEffortBook | null {
  const e = at(readJson(lunaBookPath), ["effort"]);
  if (e === undefined || e === null) return null;
  if (!isRecord(e)) throw new LunaBookError("book key effort is not an object");
  const budgets = Object.fromEntries(LEVELS.map((level) => [level, wholeAtLeast(at(e, ["levels", level, "thinking_budget"]), `effort.levels.${level}.thinking_budget`, 0)])) as Record<V1EffortLevel, number>;
  // (the Anthropic API's smallest thinking budget is 1024 tokens; 0 = no thinking)
  for (const level of LEVELS) if (budgets[level] !== 0 && budgets[level] < 1024) throw new LunaBookError(`book key effort.levels.${level}.thinking_budget must be 0 or >= 1024`);
  const a = at(e, ["auto"]);
  if (!isRecord(a)) throw new LunaBookError("book key missing: effort.auto");
  return {
    budgets, answerTokens: wholeAtLeast(e.answer_tokens, "effort.answer_tokens", 1),
    auto: {
      story: bookRegex(a.story_pattern, "effort.auto.story_pattern", "i"), joiners: bookRegex(a.action_joiners, "effort.auto.action_joiners", "gi"),
      severalMin: wholeAtLeast(a.several_actions_min, "effort.auto.several_actions_min", 1), highLevel: bookLevel(a.high_level, "effort.auto.high_level"),
      low: bookRegex(a.low_pattern, "effort.auto.low_pattern", "i"), lowMaxWords: wholeAtLeast(a.low_max_words, "effort.auto.low_max_words", 1),
      lowMaxJoiners: wholeAtLeast(a.low_max_joiners, "effort.auto.low_max_joiners", 0), fallback: bookLevel(a.default, "effort.auto.default"),
      newQuestion: a.new_question_pattern === undefined ? null : bookRegex(a.new_question_pattern, "effort.auto.new_question_pattern", "i"),
    },
  };
}
// The level a turn really uses. A chosen level is kept; AUTO = the server picks by the request with the book's rule (story / several
// actions -> high_level; a short question or $0 op -> low; else the book's default). No book section, or no level sent (an older
// panel) -> low = today's call exactly.
export function resolveV1Effort(effort: V1Effort | null | undefined, message: string, rule: SonnetEffortBook | null, isNew = false): V1EffortLevel {
  if (!rule || !effort) return "low";
  if (effort !== "auto") return effort;
  const text = message.trim();
  if (isNew && rule.auto.newQuestion) return rule.auto.newQuestion.test(text) ? "low" : rule.auto.highLevel;   // (Nov 19) no animation yet: anything but a plain question gets his full thinking
  const joiners = (text.match(rule.auto.joiners) ?? []).length;
  if (rule.auto.story.test(text) || joiners >= rule.auto.severalMin) return rule.auto.highLevel;
  const words = text ? text.split(/\s+/).length : 0;
  if (rule.auto.low.test(text) && words <= rule.auto.lowMaxWords && joiners <= rule.auto.lowMaxJoiners) return "low";
  return rule.auto.fallback;
}

// (Nov 2 final round) book "canvas": absent = the feature is off (null); present but incomplete = a loud error (never a guessed limit).
const CANVAS_TYPES: V1CanvasLimits["mediaType"][] = ["image/jpeg", "image/png"];
function readCanvasRule(v: unknown): V1CanvasRule | null {
  if (v === undefined || v === null) return null;
  if (!isRecord(v)) throw new LunaBookError("book key canvas is not an object");
  const mediaType = need(v.media_type as string, "canvas.media_type") as V1CanvasLimits["mediaType"];
  if (!CANVAS_TYPES.includes(mediaType)) throw new LunaBookError(`book key canvas.media_type must be one of ${CANVAS_TYPES.join(", ")}`);
  const maxPx = bookNumber(v.max_px, "canvas.max_px"), maxBytes = bookNumber(v.max_bytes, "canvas.max_bytes"), quality = bookNumber(v.quality, "canvas.quality");
  if (!Number.isSafeInteger(maxPx) || maxPx < 64 || quality > 1) throw new LunaBookError("book key canvas.max_px must be a whole number >= 64 and canvas.quality 0-1");
  const ground = readGroundRule(v.ground);
  return { maxPx, maxBytes, quality, mediaType, note: need(v.note as string, "canvas.note"), rules: need(strings(v.rules), "canvas.rules"), examples: Array.isArray(v.examples) ? v.examples : [],
    ...(ground ? { ground: ground.rule } : {}), groundSay: ground?.say ?? null, sheet: readSheetRule(v.sheet) };
}
// (Nov 3 key 2) book "viewer": absent / on not true = off (null); on = every key needed (a loud error, never a guessed word)
const VIEWER_SAYS: V1ViewerSay[] = ["missing", "retried_shown", "retried_missing", "retried_unjudged", "first_kept"];
function readViewerRule(v: unknown): V1ViewerRule | null {
  if (v === undefined || v === null) return null;
  if (!isRecord(v)) throw new LunaBookError("book key viewer is not an object");
  if (v.on !== true) return null;
  const say = isRecord(v.say) ? v.say : {};
  if (typeof v.active !== "boolean") throw new LunaBookError("book key viewer.active is not true / false");
  return { active: v.active, maxRetries: wholeAtLeast(v.max_retries, "viewer.max_retries", 0), timeoutMs: bookNumber(v.timeout_ms, "viewer.timeout_ms"), instruction: need(v.instruction as string, "viewer.instruction"),
    retryChange: need(v.retry_change as string, "viewer.retry_change"), stepsFix: need(v.steps_fix as string, "viewer.steps_fix"), say: Object.fromEntries(VIEWER_SAYS.map((k) => [k, need(say[k] as string, `viewer.say.${k}`)])) as Record<V1ViewerSay, string> };
}
// (Nov 2 night) book canvas.sheet: the timeline contact sheet (absent = off; present but incomplete = a loud error)
function readSheetRule(v: unknown): V1CanvasRule["sheet"] {
  if (v === undefined || v === null) return null;
  if (!isRecord(v)) throw new LunaBookError("book key canvas.sheet is not an object");
  const maxFrames = bookNumber(v.max_frames, "canvas.sheet.max_frames");
  if (!Number.isSafeInteger(maxFrames) || maxFrames < 2) throw new LunaBookError("book key canvas.sheet.max_frames must be a whole number >= 2");
  return { maxFrames, note: fillFrom(need(v.note as string, "canvas.sheet.note"), v, "canvas.sheet"), rules: need(strings(v.rules), "canvas.sheet.rules") };
}
// (Nov 2 final round) book canvas.ground: the ground-line ruler (v1PageFit.ts) + the line the server adds to a create's say. Absent = off.
function readGroundRule(v: unknown): { rule: V1GroundRule; say: string } | null {
  if (v === undefined || v === null) return null;
  if (!isRecord(v)) throw new LunaBookError("book key canvas.ground is not an object");
  const n = (k: string) => bookNumber(v[k], `canvas.ground.${k}`), f = isRecord(v.default_figure) ? v.default_figure : {};
  const fn = (k: string) => bookNumber(f[k], `canvas.ground.default_figure.${k}`);
  return {
    say: need(v.say as string, "canvas.ground.say"),
    rule: { minLenFigureWidths: n("min_len_figure_widths"), maxSlopeDeg: n("max_slope_deg"), upShareH: n("up_share_h"), openAbovePx: n("open_above_px"), openAboveShare: n("open_above_share"),
      maxThickPx: n("max_thick_px"), gapPx: n("gap_px"), minRunShare: n("min_run_share"), inkDiff: n("ink_diff"),
      defaultFigure: { heightShare: fn("height_share"), feetYShare: fn("feet_y_share"), widthPerHeight: fn("width_per_height") },
      // (Nov 2 night) optional: line him up with the user's drawn things (absent = off)
      align: isRecord(v.align) ? { minScale: bookNumber(v.align.min_scale, "canvas.ground.align.min_scale"), maxScale: bookNumber(v.align.max_scale, "canvas.ground.align.max_scale"),
        thingMinShare: bookNumber(v.align.thing_min_share, "canvas.ground.align.thing_min_share"), thingMaxWidthShare: bookNumber(v.align.thing_max_width_share, "canvas.ground.align.thing_max_width_share") } : null },
  };
}
export const v1CanvasLimits = (book: Pick<LunaBook, "canvas">): V1CanvasLimits | null =>
  book.canvas ? { maxPx: book.canvas.maxPx, mediaType: book.canvas.mediaType, quality: book.canvas.quality, maxBytes: book.canvas.maxBytes, ...(book.canvas.ground ? { ground: book.canvas.ground } : {}),
    ...(book.canvas.sheet ? { sheetFrames: book.canvas.sheet.maxFrames } : {}) } : null;
// The SERVER guard: a picture is used only when the book has the canvas section and the picture keeps to its limits (type, sides, bytes,
// plain base64). Anything else = null (no picture: the turn goes on without it, never an error for the user).
export function acceptV1Canvas(book: Pick<LunaBook, "canvas">, raw: unknown): V1CanvasPicture | null {
  const rule = book.canvas;
  if (!rule || !isRecord(raw)) return null;
  const { mediaType, data, width, height } = raw as Record<string, unknown>;
  if (mediaType !== rule.mediaType || typeof data !== "string" || !data) return null;
  const w = Number(width), h = Number(height);
  if (!Number.isSafeInteger(w) || !Number.isSafeInteger(h) || w < 1 || h < 1 || w > rule.maxPx || h > rule.maxPx) return null;
  if (Math.floor((data.length * 3) / 4) > rule.maxBytes || data.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(data)) return null;
  return { mediaType: rule.mediaType, data, width: w, height: h };
}

// (Nov 2 night) the contact sheet: the same guard as the canvas picture + its frame numbers (1-based, rising, at most max_frames); off = null
export function acceptV1Sheet(book: Pick<LunaBook, "canvas">, raw: unknown): V1CanvasPicture | null {
  const sheet = book.canvas?.sheet;
  const pic = sheet ? acceptV1Canvas(book, raw) : null;
  const frames = isRecord(raw) && Array.isArray(raw.frames) ? raw.frames.map(Number) : [];
  if (!pic || !sheet || frames.length < 2 || frames.length > sheet.maxFrames || !frames.every((f, i) => Number.isSafeInteger(f) && f >= 1 && (i === 0 || f > frames[i - 1]))) return null;
  return { ...pic, frames };
}

// {key} in a book sentence filled from the same book section; a {key} the section lacks is a loud error.
function fillFrom(words: string, section: unknown, where: string): string {
  return words.replace(/\{(\w+)\}/g, (_, key: string) => {
    const value = at(section, [key]);
    if (typeof value !== "string" && typeof value !== "number") throw new LunaBookError(`book key missing: ${where}.${key}`);
    return String(value);
  });
}

// A server line by key, with {words} / {n} / ... filled in. A missing key is said loudly (the key's name), never invented.
// (Nov 2, Fable audit) the ONE translator: a failure line's {words} is never raw engine / director / exception text. A book rule that
// matches gives its plain line; text that already reads plain (book plain_ok) stays; anything else = the generic line. Raw -> server log.
function readPlainFailures(v: unknown): LunaBook["plainFailures"] {
  if (!isRecord(v) || !Array.isArray(v.keys) || !Array.isArray(v.rules) || typeof v.generic !== "string") return null;
  return { keys: v.keys.filter((k): k is string => typeof k === "string"), generic: v.generic, plainOk: typeof v.plain_ok === "string" ? v.plain_ok : "^$",
    rules: v.rules.filter((r): r is { match: string; say: string } => isRecord(r) && typeof r.match === "string" && typeof r.say === "string") };
}
export function plainFailure(book: LunaBook, raw: string): string {
  const pf = book.plainFailures;
  const text = raw.trim();
  if (!pf || !text) return text;
  // (Nov 14, live: fal refused a call with $7 on the account and the user read "say that part a little differently") the animator's OWN reason,
  // word for word (kimodo/wan.py fal_said) - never a guess, and never blamed on the user's words
  const fal = /fal(?: answered (\d+))?: ([^()]*)/i.exec(text);
  // (Nov 18, Arthur: "Did H3 fail? Are we out of disk space? What the hell happened?") fal's own "Exhausted balance" said in plain words
  if (fal && /exhausted balance|user is locked/i.test(fal[2])) { console.warn(`[v1 plain words] ${text.slice(0, 600)}`); return "The animator's money account (fal) is empty, so it could not draw anything. Nothing was made and nothing was charged to you, and your words were fine. Once money is added on fal.ai, send your message again."; }
  if (fal) { console.warn(`[v1 plain words] ${text.slice(0, 600)}`); return `The animator did not make it${fal[1] ? ` (it answered ${fal[1]})` : ""}: "${fal[2].trim().replace(/[.\s]+$/, "")}". Nothing was made and nothing was charged. Your words were fine.`; }
  const rule = pf.rules.find((r) => new RegExp(r.match, "i").test(text));
  const out = rule ? rule.say : text.split(/(?<=[.!?])\s+/).every((t) => new RegExp(pf.plainOk).test(t)) ? text : pf.generic;
  if (out !== text) console.warn(`[v1 plain words] ${text.slice(0, 600)}`);
  return out;
}
export function serverWord(book: LunaBook, key: string, fill: Record<string, string | number> = {}): string {
  if (book.plainFailures?.keys.includes(key) && typeof fill.words === "string") fill = { ...fill, words: plainFailure(book, fill.words) };
  const raw = book.serverWords[key];
  if (!raw) return `[missing book words: server_words.${key}]`;
  return raw.replace(/\{(\w+)\}/g, (_, name: string) => (name in fill ? String(fill[name]) : "")).replace(/\s+$/, "").replace(/\s{2,}/g, " ");
}

// The server line for a chat turn that could not be asked/read: "budget" = the Claude test budget is used up (no call made).
export const askFailedWords = (book: LunaBook, failure: string) =>
  serverWord(book, failure === "unreachable" ? "luna_unreachable" : failure === "budget" ? "brain_budget_used" : "luna_bad_answer");

// ---- The engine's word lists (passed_engine_book.json)
export type EngineWords = {
  contract: string; // "v1-blocks"
  looks: V1Look[];
  stageWords: Partial<Record<V1StageCode, string>>;
  size: { normal: number; min: number; max: number }; // book "size" (op size)
  fpsMin: number; // book "playback_fps.min" (op fps; the most = the engine's own fps from its report)
  style: { pens: V1Pen[]; glowStrengths: V1GlowStrength[]; scale: Record<V1ScaleKey, [number, number]>; headShapes: string[] }; // (Nov 2) book app_engine_book.set["kimodo_scene.style"] pen / glow keys
};
export type V1ScaleKey = "headScale" | "penScale" | "outlineWidth" | "opacity" | "partThick" | "partOpacity";
const bookNumber = (v: unknown, where: string) => { const n = Number(need(v as number, where)); if (!Number.isFinite(n) || n <= 0) throw new LunaBookError(`book key ${where} is not a number > 0`); return n; };
export function readEngineWords(engineBookPath: string): EngineWords {
  const b = readJson(engineBookPath);
  if (!isRecord(b)) throw new LunaBookError(`the engine book is not a JSON object: ${engineBookPath}`);
  const looks = Object.keys(need(at(b, ["looks"]) as Json, "looks")).filter((k) => !k.startsWith("_")) as V1Look[];
  if (!looks.length) throw new LunaBookError("book key looks is empty");
  const raw = need(at(b, ["stage_words"]) as Json, "stage_words");
  const stageWords: Partial<Record<V1StageCode, string>> = {};
  for (const [k, v] of Object.entries(raw)) if (!k.startsWith("_") && typeof v === "string") stageWords[k as V1StageCode] = v;
  return {
    contract: need(b.contract as string, "contract"), looks, stageWords,
    size: { normal: bookNumber(at(b, ["size", "normal"]), "size.normal"), min: bookNumber(at(b, ["size", "min"]), "size.min"), max: bookNumber(at(b, ["size", "max"]), "size.max") },
    fpsMin: bookNumber(at(b, ["playback_fps", "min"]), "playback_fps.min"),
    style: (() => {
      const st = need(at(b, ["app_engine_book", "set", "kimodo_scene.style"]) as Json, "app_engine_book.set.kimodo_scene.style");
      const keys = (k: string) => Object.keys(need(at(st, [k]) as Json, `kimodo_scene.style.${k}`)).filter((q) => !q.startsWith("_"));
      const range = (q: string): [number, number] => { const r = at(st, ["scale", q]); return Array.isArray(r) && r.length === 2 ? [Number(r[0]), Number(r[1])] : [1, 1]; };
      return { pens: keys("pen") as V1Pen[], glowStrengths: keys("glow") as V1GlowStrength[], scale: { headScale: range("headScale"), penScale: range("penScale"), outlineWidth: range("outlineWidth"), opacity: range("opacity"), partThick: range("partThick"), partOpacity: range("partOpacity") }, headShapes: ((at(st, ["head_shapes"]) as string[] | undefined) ?? ["circle"]) };
    })(),
  };
}

// ---- Luna's instructions: the book's words, in order, plus the word lists read at call time.
export function lunaInstructions(book: LunaBook, w: EngineWords): string {
  return [
    book.who,
    `Capability sentence: "${book.capability}"`,
    "",
    "CAPABILITIES (check every request against these first):",
    book.capabilities.check,
    "CAN:",
    ...book.capabilities.can.map((line) => `- ${line}`),
    "CANNOT (say so up front, with the best alternative):",
    ...book.capabilities.cannot.map((line) => `- ${line}`),
    ...(book.capabilities.knownWeak.length ? ["KNOWN WEAK (warn honestly before making):", ...book.capabilities.knownWeak.map((line) => `- ${line}`), book.capabilities.weakHow] : []),
    ...(book.capabilities.examples.length ? ["Examples:", ...book.capabilities.examples.map((e) => `- ${JSON.stringify(e)}`)] : []),
    "",
    "INTENTS:",
    ...(Object.keys(book.classify) as V1Intent[]).map((intent) => `- ${intent}: ${book.classify[intent]}`),
    "",
    "REFUSE when the request needs any of these:",
    ...book.refuse.when.map((line) => `- ${line}`),
    book.refuse.say,
    book.refuse.how,
    "",
    "CREATE (the blocks):",
    ...book.createRules.map((line) => `- ${line}`),
    ...(book.createExamples.length ? ["Examples:", ...book.createExamples.map((e) => `- ${JSON.stringify(e)}`)] : []),
    "",
    "VERSION 1 LIMIT (facing_viewer):",
    `"${book.limits.facingViewer}"`,
    book.limits.facingViewerHow,
    "",
    "LONG SCENES:",
    book.longScenes.rule,
    book.longScenes.nextPart,
    book.longScenes.lengthHonest,
    book.longScenes.impossibleUpFront,
    ...(book.longScenes.examples.length ? ["Examples:", ...book.longScenes.examples.map((e) => `- ${JSON.stringify(e)}`)] : []),
    "",
    "KIMODO STEPS:",
    ...book.kimodoSteps.rules.map((line) => `- ${line}`),
    "",
    "STORY GUIDE:",
    ...book.storyGuide.rules.map((line) => `- ${line}`),
    ...(book.storyGuide.examples.length ? ["Examples:", ...book.storyGuide.examples.map((e) => `- ${JSON.stringify(e)}`)] : []),
    "",
    "EDIT:",
    book.editIntro,
    book.editOps,
    ...book.editRules.map((line) => `- ${line}`),
    ...(book.editExamples.length ? ["Examples:", ...book.editExamples.map((e) => `- ${JSON.stringify(e)}`)] : []),
    "",
    ...(book.canvas ? [
      "CANVAS (what the user drew):",
      ...book.canvas.rules.map((line) => `- ${line}`),
      ...(book.canvas.sheet ? book.canvas.sheet.rules.map((line) => `- ${line}`) : []),
      ...(book.canvas.examples.length ? ["Examples:", ...book.canvas.examples.map((e) => `- ${JSON.stringify(e)}`)] : []),
      "",
    ] : []),
    "HONESTY:",
    ...book.honesty.map((line) => `- ${line}`),
    book.style,
    "",
    `${book.looksIntro} ${w.looks.join(", ")}`,
  ].join("\n");
}

// ---- The input of one turn (Luna sees the current blocks: id + sentence, and the looks)
export type V1LunaInput = {
  message: string;
  recentConversation: { role: "user" | "assistant"; content: string }[];
  current: V1Plan | null;
  checkerSaid: string[] | null;
  lastAnswer?: unknown; // (a retry) the answer the app could not apply
  playback?: { fps: number; engineFps: number; speed?: number } | null; // the current animation's playback pictures per second + the most the engine draws (+ its speed, 1 = as made)
  backupMoves?: Record<string, number[]> | null; // (Nov 8 eve) each current part's moves (from 1) that the backup animator (H3) drew
  partSeconds?: Record<string, number> | null; // (Nov 2 app round) each current part's seconds as it was made (the report), so an edit can say its length
  nextPart?: boolean; // (Nov 20) the app's own "add the next part" turn of a long story: its steps follow the new-animation guide too
  canvas?: V1CanvasPicture | null; // (Nov 2 final round) ONE small picture of what the user drew (already passed acceptV1Canvas); Sonnet only
  sheet?: V1CanvasPicture | null; // (Nov 2 night) the timeline contact sheet (already passed acceptV1Sheet); Sonnet only
  lastMirrored?: boolean; // (Nov 15 night) the animation is shown mirrored: `last` is given as the animator sees it
  last?: V1CanvasPicture | null; // (Nov 15 night, MEMORY) the very LAST picture of the current animation, full size: an added part goes on from exactly this picture; Sonnet only
  animation?: V1CanvasPicture | null; // (Nov 13) the CURRENT animation as it was really drawn: the engine's own sheet, one picture per move in order; Sonnet only
  effort?: V1Effort | null; // (Nov 2 final round) the chat's Effort button; Sonnet only (absent = low = today's call)
};
export function lunaTurnInput(book: LunaBook, input: V1LunaInput): string {
  const cur = input.current;
  return JSON.stringify({
    userTurn: input.message,
    recentConversation: input.recentConversation,
    currentAnimation: cur ? {
      colour: cur.colour, ...(cur.partColours && Object.keys(cur.partColours).length ? { partColours: cur.partColours } : {}), ...(cur.style ? { style: cur.style } : {}), look: cur.look, mirror: cur.mirror, size: cur.size ?? 1,
      ...(input.playback ? { fps: input.playback.fps, engineFps: input.playback.engineFps, speed: input.playback.speed ?? 1 } : {}),
      // (Nov 15, Arthur: "No more rewrites") the SAVED steps, numbered: an edit names only the numbers it changes, adds after or takes out
      ...(cur.blocks.some((b) => b.steps?.length) ? { steps: cur.blocks.flatMap((b) => b.steps ?? []).map((s, i) => ({ step: i + 1, text: s.text, seconds: s.seconds, ...(s.look ? { look: s.look } : {}) })) } : {}),
      blocks: cur.blocks.map((b) => ({ id: b.id, sentence: b.sentence, ...(input.partSeconds?.[b.id] ? { seconds: Math.round(input.partSeconds[b.id]) } : {}),
        ...(b.beats?.length ? { moves: b.beats } : {}), ...(input.backupMoves?.[b.id]?.length ? { movesDrawnByBackupAnimator: input.backupMoves[b.id] } : {}) })), // (Nov 2 night) the take's frozen moves (EDIT ONE MOVE: rewrite beat = a move's number from 1)
      ...(input.backupMoves && book.backupNote ? { backupNote: book.backupNote } : {}), // (Nov 8 eve) said only when the backup animator drew a move
    } : book.currentNone,
    ...(!cur && book.newAnimationGuide?.length ? { newAnimationGuide: book.newAnimationGuide } : {}),
    // (Nov 20, Fable's final check) a long story's next part is the same story's steps: written by the same guide, not the edit rules' 30 words a second
    ...(cur && input.nextPart && book.newAnimationGuide?.length ? { newAnimationGuide: ["THIS TURN ADDS THE NEXT PART of the story on the card, going on from the last picture. Its steps follow these rules (they win over the edit rules about how fully a step is written)."].concat(book.newAnimationGuide.slice(1)) } : {}),
    ...(cur && book.addOnEnding ? { addOnEnding: book.addOnEnding } : {}),
    ...(!cur && book.h3Free?.on ? { newAnimationRules: book.h3Free.rules } : {}),
    ...(input.checkerSaid?.length ? { checker: { instruction: book.checkerRetry, said: input.checkerSaid, yourLastAnswer: input.lastAnswer ?? null } } : {}),
    ...(input.canvas && book.canvas ? { canvas: book.canvas.note } : {}),
    ...(input.sheet?.frames && book.canvas?.sheet ? { sheet: book.canvas.sheet.note, sheetFrames: input.sheet.frames } : {}),
    ...(input.animation ? { animationPictures: ANIMATION_NOTE + (input.animation.note ? " " + input.animation.note : "") } : {}),   // (Nov 19) note = one picture per STEP + the colours measured in them (ltx-effects/v1k/step_sheet.py)
    ...(input.last ? { lastPicture: LAST_PICTURE_NOTE + (input.lastMirrored ? MIRRORED_NOTE : "") } : {}),
  });
}
// (Nov 2 final round) the user message for SONNET (Anthropic Messages API): the turn's JSON text, and - when a canvas picture came with
// the turn - that picture FIRST as one base64 image block. No picture = the same plain text as before.
// (Nov 13, live: he asked "he sits on the stump" - no stump was in the last picture, so one grew out of nothing) the AI SEES the animation it edits
const ANIMATION_NOTE = "The LAST picture attached shows the current animation as it was really drawn: one picture per move, in order. THE PICTURES WIN over what you remember writing: read every thing, its colours and where he ends from them. An added part starts from the last picture: only what is in it exists then - a new thing comes in, or is made by what he does. A change is written so it fits the pictures around it.";
// (Nov 15 night, Arthur: 'handoffs need memory' - Sonnet wrote 'the T-Rex stands to the right of the box' while the picture had it on the left)
const LAST_PICTURE_NOTE = "The picture attached just BEFORE the last one is the animation's very LAST picture, big: a part that is added goes on from exactly this picture. Write the before of an added step from it: who and what is in it, where each one is and which way each one faces (the side its head or front is on; with its head already out of the picture, the edge it is going out through) - and whoever is in the story but NOT in this picture (hidden, or out of the picture), described as the other pictures show him.";
const MIRRORED_NOTE = " THIS ANIMATION IS SHOWN MIRRORED on the user's screen (left and right are swapped there). That last picture is given to you the way the ANIMATOR sees it, and the animator reads your sentences in that same view: take every left and right in before and in your step sentences from THAT picture only. The sheet of one picture per move shows the user's mirrored view - use it for how things look, never for which side something is on. When the user names a side himself ('to the right'), he means his screen: write the OPPOSITE side.";
export type SonnetUserContent = string | ({ type: "image"; source: { type: "base64"; media_type: V1CanvasPicture["mediaType"]; data: string } } | { type: "text"; text: string })[];
export function lunaTurnContent(book: LunaBook, input: V1LunaInput): SonnetUserContent {
  const text = lunaTurnInput(book, input);
  // (Nov 2 night) the contact sheet (when one came) is the second picture, after the current frame
  const pics = [input.canvas && book.canvas ? input.canvas : null, input.sheet && book.canvas?.sheet ? input.sheet : null, input.last ?? null, input.animation ?? null].filter((p): p is V1CanvasPicture => p !== null);
  if (!pics.length) return text;
  return [
    ...pics.map((p) => ({ type: "image" as const, source: { type: "base64" as const, media_type: p.mediaType, data: p.data } })),
    { type: "text", text },
  ];
}

// ---- The strict JSON schema of one turn (OpenAI structured output, strict: every property required, optional = null, enums).
const str = { type: "string", minLength: 1 } as const;
const en = (words: string[]) => ({ type: "string", enum: words });
const nul = (schema: Json) => ({ anyOf: [schema, { type: "null" }] });
const obj = (properties: Json) => ({ type: "object", additionalProperties: false, required: Object.keys(properties), properties });
export const V1_OPS: V1EditOp["op"][] = ["rewrite", "append", "delete", "redo", "colour", "partColours", "style", "mirror", "look", "size", "fps", "speed", "timing", "clear", "camera"];
export const V1_CAMERAS: V1Camera[] = ["follow", "still"];
const cameraOf = (v: unknown): V1Camera | null => (V1_CAMERAS as unknown[]).includes(v) ? v as V1Camera : null;
export const V1_CLEAR_SCOPES = ["ai", "all"] as const;
// (Nov 2) parts: the AI's split of ONE block sentence into its separate actions (null = one action / nothing to split)
const partsSchema = (book: Pick<LunaBook, "createMaxParts">) => nul({ type: "array", minItems: 2, maxItems: book.createMaxParts, items: str });
// one nullable CSS colour per part (strict schema: every part required, null = not named)
const partColoursSchema = () => obj(Object.fromEntries(V1_PARTS.map((p) => [p, nul(str)])));
// (Nov 2) style: every key required, null = not named (strict schema); glow null = no glow / not named (see normalizeStyle)
const styleSchema = (w: EngineWords) => obj({
  hollowHead: nul({ type: "boolean" }),
  glow: nul(obj({ colour: nul(str), strength: nul(en(w.style.glowStrengths)) })),
  pen: nul(en(w.style.pens)),
  headScale: nul({ type: "number", minimum: w.style.scale.headScale[0], maximum: w.style.scale.headScale[1] }),
  penScale: nul({ type: "number", minimum: w.style.scale.penScale[0], maximum: w.style.scale.penScale[1] }),
  // (Nov 5) any look with the parts he has
  outlines: nul({ type: "array", maxItems: 4, items: obj({ colour: nul(str), width: nul({ type: "number", minimum: w.style.scale.outlineWidth[0], maximum: w.style.scale.outlineWidth[1] }) }) }),
  opacity: nul({ type: "number", minimum: w.style.scale.opacity[0], maximum: w.style.scale.opacity[1] }),
  partThick: nul(obj(Object.fromEntries(V1_PARTS.map((p) => [p, nul({ type: "number", minimum: w.style.scale.partThick[0], maximum: w.style.scale.partThick[1] })])))),
  partOpacity: nul(obj(Object.fromEntries(V1_PARTS.map((p) => [p, nul({ type: "number", minimum: w.style.scale.partOpacity[0], maximum: w.style.scale.partOpacity[1] })])))),
  headShape: nul(en(w.style.headShapes)),
});

export function lunaTurnSchema(w: EngineWords, book: Pick<LunaBook, "createMaxBlocks" | "createMaxParts" | "speed">): Json {
  const variants: Record<V1EditOp["op"], Json> = {
    rewrite: obj({ op: en(["rewrite"]), block: str, sentence: str, parts: partsSchema(book), beat: nul({ type: "integer", minimum: 1 }) }), // (Nov 2 night) beat = edit one move
    append: obj({ op: en(["append"]), sentence: str }),
    delete: obj({ op: en(["delete"]), block: str }),
    redo: obj({ op: en(["redo"]), block: str }),
    colour: obj({ op: en(["colour"]), colour: str }),
    partColours: obj({ op: en(["partColours"]), partColours: partColoursSchema() }),
    style: obj({ op: en(["style"]), style: styleSchema(w), removeGlow: nul({ type: "boolean" }) }),
    mirror: obj({ op: en(["mirror"]) }),
    look: obj({ op: en(["look"]), look: en(w.looks) }),
    size: obj({ op: en(["size"]), size: { type: "number", minimum: w.size.min, maximum: w.size.max } }),
    fps: obj({ op: en(["fps"]), fps: { type: "number", minimum: w.fpsMin } }),
    speed: obj({ op: en(["speed"]), speed: { type: "number", minimum: book.speed.min, maximum: book.speed.max } }),
    timing: obj({ op: en(["timing"]), block: str, beat: { type: "integer", minimum: 1 }, factor: nul({ type: "number", exclusiveMinimum: 0, maximum: 1 }), hold: nul(en(["keys", "every", "still", "none"])), seconds: nul({ type: "number", exclusiveMinimum: 0, maximum: 10 }), from: nul({ type: "number", minimum: 0, maximum: 1 }), to: nul({ type: "number", minimum: 0, maximum: 1 }) }), // (Nov 3 FINAL V2)
    clear: obj({ op: en(["clear"]), scope: en([...V1_CLEAR_SCOPES]), confirmed: nul({ type: "boolean" }) }),
    camera: obj({ op: en(["camera"]), camera: en([...V1_CAMERAS]) }),
  };
  return obj({
    intent: en(Object.keys(INTENTS)),
    say: { type: "string", minLength: 1, maxLength: 2000 },
    blocks: nul({ type: "array", minItems: 1, maxItems: book.createMaxBlocks, items: obj({ sentence: str, parts: partsSchema(book) }) }),
    colour: nul(str),
    partColours: nul(partColoursSchema()),
    style: nul(styleSchema(w)),
    size: nul({ type: "number", minimum: w.size.min, maximum: w.size.max }),
    still: nul({ type: "boolean" }),
    // (Nov 13, live: the card said "no stick figure" but this was left empty, so he stood beside the ball) asked on EVERY answer, never null: the AI must say it
    noFigure: { type: "boolean", description: "true ONLY when what will be animated has NO stick figure in it at all (things moving on their own: a ball bouncing, a car driving past). false whenever the stick figure is in it, and for every answer that is not a new animation." },
    // (Nov 17, Arthur: "H3 is the camera") asked on EVERY answer: true only when the user asked for a camera move, a cut, a transition or a teleport
    cameraMoves: { type: "boolean", description: "true ONLY when the user asked for a camera move (follow, pan, zoom, close-up), a cut, a scene change, a transition or a teleport; the camera moves are then written in the steps' words. false for everything else: the camera stays still." },
    leftward: nul({ type: "boolean" }), // (Nov 2 final) true = he moves / faces toward the left of the screen, as the user said
    camera: nul(en([...V1_CAMERAS])), // (Nov 2 final round) only when the user asked how the camera behaves (null = the follow default)
    ops: nul({ type: "array", minItems: 1, items: { anyOf: V1_OPS.map((op) => variants[op]) } }),
    // (Nov 2) plan first: the length the user asked for (by meaning; null = none) + the story's parts
    requestedSeconds: nul({ type: "number", minimum: 0 }),
    kimodoSteps: nul({ type: "array", minItems: 1, items: obj({ text: str, before: { type: "string", description: "ONE sentence of where everyone and everything is at the moment this step begins (who is in the picture and where, who is hidden and where, what is open, closed or held); nothing that happens in the step. '' for step 1." }, brief: str, seconds: { type: "number", minimum: 0 }, travels: { type: "boolean" }, airborne: { type: "boolean" }, changed: { type: "boolean" }, step: { type: "integer", minimum: 0, description: "0 on a create. In an EDIT: the number of the saved step (currentAnimation.steps) that this step REPLACES; 0 when this step is new." }, after: { type: "integer", minimum: 0, description: "0 on a create. In an EDIT, for a NEW step (step = 0): the number of the saved step it comes right after; 0 = before the first step." }, wan: { type: "boolean" }, face: { type: "string" }, look: { type: "string", description: "'' (empty) for every normal step. ONLY in an edit, for a step whose change is how something that is ALREADY in its pictures LOOKS (a thing or him: colour, size, shape, more or fewer, something taken away) while every move stays: the change in a few plain words about the SAME thing, e.g. 'the axe is red', 'the tree has autumn colours: orange, red and yellow leaves', 'the tree is twice as big'. Its pictures are redrawn with that change; nothing is animated again and no new thing appears (book: A LOOK CHANGE)." } , part: { type: "integer", minimum: 1, description: "Which part this step is in (1 = first). A new animation of 15 seconds or less: every step is part 1. Longer: as FEW parts as possible, each at most 15 seconds, see PARTS. An edit: 1." }}) }), // (Nov 4 PM12; wan Nov 7 eve; face Nov 10; look Nov 14)
    removeSteps: nul({ type: "array", items: { type: "integer", minimum: 1 } }),   // (Nov 15) an edit: the saved steps the user asked to take out
    askedDetails: nul({ type: "array", minItems: 1, items: obj({ said: str, step: { type: "integer", minimum: 0 } }) }), // (Nov 4 PM12) every detail the user said -> the step holding it
    // (Nov 14, Arthur: a card always means "I can make exactly this") notDrawn is gone: a request that needs something that cannot be made gets no card
    room: en(["normal", "big"]), // (Nov 14, live: "a massive tree" did not fit) big = something in the story is taller than about twice his height, or he travels far: he is drawn smaller in the first picture so everything fits in the one still shot
    newThings: nul(str), // (Nov 22, Arthur: "whenever there's a new thing coming into the story, it's always got to show an image of it") an edit / added part: the NEW things only, standing still where they first appear (null = nothing new); the card shows their picture
    scene: nul(str), // (Nov 14, live: he ran before the door was there) the first picture in words, nothing moving: he at his start place + every thing of the story with its look, size and place; the animator draws it first (null = no things / not a new animation)
    start: en(["left", "middle", "right"]), // (Nov 14) where he stands in the first picture: middle unless the user said he comes in from / starts at a side
    lookBriefs: nul({ type: "array", items: str }), // (Nov 11) one detailed gate line per look change (colour by shade name, size...)
    questions: nul({ type: "array", minItems: 1, maxItems: 3, items: obj({ text: str, options: { type: "array", minItems: 2, maxItems: 4, items: str } }) }), // (Nov 11) the question card: up to 3 short questions a real animator would ask before starting; the FIRST option of each is the pre-picked answer
    heard: nul(str), // (Nov 11, Arthur: "Sonnet takes it too literally") the request as the user MEANS it (book heard_rule); null = his message as typed
    storyPlan: nul(obj({ parts: { type: "array", minItems: 1, items: obj({ seconds: { type: "number", minimum: 0 }, says: str }) } })),
  });
}

// ---- Normalisation: Luna's raw answer -> a V1LunaTurn, or null (a bad answer).
const text = (v: unknown, max: number) => (typeof v === "string" && v.trim() && v.trim().length <= max ? v.trim() : null);
const SENTENCE_MAX = Infinity;   // (Nov 13, Arthur: no limits, nothing dropped) his words and the AI's sentences are never refused or cut for their length (was 600)
// (Nov 4 PM12, live: "make him do a front flip instead" failed as a bad answer - the edit's block sentence held all 10 Kimodo steps, ~950 letters)
// a WHOLE block's sentence holds every step of up to a 30-s take: its own bigger room (one step / one part stays SENTENCE_MAX)
const BLOCK_SENTENCE_MAX = Infinity;   // (Nov 13: a long story's sentence is never refused for its length - was 4000)
// (Nov 2) the AI's parts of one sentence: 2+ good sentences (at most the book's max_parts) -> the list; anything else = no split (the
// sentence itself still holds every action, so nothing is lost)
function partsOf(raw: unknown, book: Pick<LunaBook, "createMaxParts">): string[] | null {
  if (!Array.isArray(raw) || raw.length < 2 || raw.length > book.createMaxParts) return null;
  const out = raw.map((p) => text(p, SENTENCE_MAX));
  return out.every((p): p is string => p !== null) ? out : null;
}
// {head, arms, body, legs} -> only the parts with a colour; nothing named = null; a part that is not a short string = bad (undefined)
function normalizePartColours(raw: unknown): V1PartColours | null | undefined {
  if (raw === null || raw === undefined) return null;
  if (!isRecord(raw)) return undefined;
  const out: V1PartColours = {};
  for (const part of V1_PARTS) {
    const v = raw[part];
    if (v === null || v === undefined) continue;
    const c = text(v, 64);
    if (!c) return undefined;
    out[part] = c;
  }
  return Object.keys(out).length ? out : null;
}
// {hollowHead, glow, pen} -> only the keys named (null = not named); nothing named = null; a bad value = undefined (a bad answer).
// removeGlow true (edit op only) = glow null in the op = the glow is taken away.
// (Nov 5, Arthur: "never a red error") ONE look setting the app can't use never throws the whole answer away: each setting is read on its own and
// only the one that doesn't fit is left out (the chat's own words already say what was made)
function lenientStyle(raw: unknown, w: EngineWords, removeGlow = false): V1Style | null {
  const all = normalizeStyle(raw, w, removeGlow);
  if (all !== undefined) return all;
  const out: V1Style = {};
  if (isRecord(raw)) for (const [k, v] of Object.entries(raw)) { const one = normalizeStyle({ [k]: v }, w); if (one) Object.assign(out, one); }
  if (removeGlow) out.glow = null;
  return Object.keys(out).length ? out : null;
}
function lenientPartColours(raw: unknown): V1PartColours | null {
  const all = normalizePartColours(raw);
  if (all !== undefined) return all;
  const out: V1PartColours = {};
  if (isRecord(raw)) for (const [k, v] of Object.entries(raw)) { const one = normalizePartColours({ [k]: v }); if (one) Object.assign(out, one); }
  return Object.keys(out).length ? out : null;
}
function normalizeStyle(raw: unknown, w: EngineWords, removeGlow = false): V1Style | null | undefined {
  if (raw === null || raw === undefined) return removeGlow ? { glow: null } : null;
  if (!isRecord(raw)) return undefined;
  const out: V1Style = {};
  if (raw.hollowHead !== null && raw.hollowHead !== undefined) { if (typeof raw.hollowHead !== "boolean") return undefined; out.hollowHead = raw.hollowHead; }
  if (raw.pen !== null && raw.pen !== undefined) { if (!(w.style.pens as string[]).includes(raw.pen as string)) return undefined; out.pen = raw.pen as V1Pen; }
  for (const q of ["headScale", "penScale"] as const) {   // (Nov 2) a number inside the book's range (an AI number just outside is clamped)
    const v = raw[q]; if (v === null || v === undefined) continue;
    if (typeof v !== "number" || !Number.isFinite(v)) return undefined;
    const [lo, hi] = w.style.scale[q]; out[q] = Math.min(hi, Math.max(lo, v));
  }
  const inRange = (v: unknown, q: V1ScaleKey): number | undefined => {   // (Nov 5) a number inside the book's range (just outside = clamped)
    if (typeof v !== "number" || !Number.isFinite(v)) return undefined;
    const [lo, hi] = w.style.scale[q]; return Math.min(hi, Math.max(lo, v));
  };
  if (raw.opacity !== null && raw.opacity !== undefined) { const v = inRange(raw.opacity, "opacity"); if (v === undefined) return undefined; out.opacity = v; }
  for (const q of ["partThick", "partOpacity"] as const) {
    const pd = raw[q]; if (pd === null || pd === undefined) continue;
    if (!isRecord(pd)) return undefined;
    const got: Partial<Record<V1Part, number>> = {};
    for (const p of V1_PARTS) { const v = pd[p]; if (v === null || v === undefined) continue; const n = inRange(v, q); if (n === undefined) return undefined; got[p] = n; }
    if (Object.keys(got).length) out[q] = got;
  }
  if (Array.isArray(raw.outlines)) {
    const rings = raw.outlines.slice(0, 4).filter(isRecord).map((o) => ({ ...(text(o.colour, 64) ? { colour: text(o.colour, 64)! } : {}), ...(typeof o.width === "number" && Number.isFinite(o.width) ? { width: inRange(o.width, "outlineWidth")! } : {}) }));
    if (rings.length) out.outlines = rings;
  }
  if (raw.headShape !== null && raw.headShape !== undefined) { if (!w.style.headShapes.includes(raw.headShape as string)) return undefined; out.headShape = raw.headShape as string; }
  if (removeGlow) out.glow = null;
  else if (raw.glow !== null && raw.glow !== undefined) {
    if (!isRecord(raw.glow)) return undefined;
    const g = raw.glow, colour = g.colour === null || g.colour === undefined ? null : text(g.colour, 64);
    if (g.colour !== null && g.colour !== undefined && !colour) return undefined;
    if (g.strength !== null && g.strength !== undefined && !(w.style.glowStrengths as string[]).includes(g.strength as string)) return undefined;
    out.glow = { ...(colour ? { colour } : {}), ...(g.strength ? { strength: g.strength as V1GlowStrength } : {}) };
  }
  return Object.keys(out).length ? out : null;
}
const sizeOf = (raw: unknown, w: EngineWords): number | null | undefined => {
  if (raw === null || raw === undefined) return null;
  const n = Number(raw);
  return typeof raw === "number" && n >= w.size.min && n <= w.size.max ? Math.round(n * 1000) / 1000 : undefined;
};

function normalizeOp(raw: unknown, w: EngineWords, book: Pick<LunaBook, "speed" | "createMaxParts">): V1EditOp | null {
  if (!isRecord(raw)) return null;
  switch (raw.op) {
    case "rewrite": {
      const block = text(raw.block, 40), sentence = text(raw.sentence, BLOCK_SENTENCE_MAX), parts = partsOf(raw.parts, book);
      const beat = Number.isSafeInteger(raw.beat) && Number(raw.beat) >= 1 ? Number(raw.beat) : null; // (Nov 2 night) edit one move
      return block && sentence ? { op: "rewrite", block, sentence, ...(parts ? { parts } : {}), ...(beat !== null ? { beat } : {}) } : null;
    }
    case "clear": return raw.scope === "ai" || raw.scope === "all" ? { op: "clear", scope: raw.scope, ...(raw.confirmed === true ? { confirmed: true } : {}) } : null;
    case "append": { const sentence = text(raw.sentence, BLOCK_SENTENCE_MAX); return sentence ? { op: "append", sentence } : null; }
    case "delete": { const block = text(raw.block, 40); return block ? { op: "delete", block } : null; }
    case "redo": { const block = text(raw.block, 40); return block ? { op: "redo", block } : null; }
    case "colour": { const colour = text(raw.colour, 64); return colour ? { op: "colour", colour } : null; }
    // (Nov 5) a look op is the COMPLETE new look: nothing left = back to plain (never a bad answer)
    case "partColours": return { op: "partColours", partColours: lenientPartColours(raw.partColours) ?? {} };
    case "style": return { op: "style", style: lenientStyle(raw.style, w, raw.removeGlow === true) ?? {} };
    case "mirror": return { op: "mirror" };
    case "camera": { const camera = cameraOf(raw.camera); return camera ? { op: "camera", camera } : null; }
    case "look": return typeof raw.look === "string" && (w.looks as string[]).includes(raw.look) ? { op: "look", look: raw.look as V1Look } : null;
    case "size": { const n = Number(raw.size); return typeof raw.size === "number" && n >= w.size.min && n <= w.size.max ? { op: "size", size: Math.round(n * 1000) / 1000 } : null; }
    case "fps": { const n = Number(raw.fps); return typeof raw.fps === "number" && n >= w.fpsMin ? { op: "fps", fps: Math.round(n) } : null; }
    case "speed": { const n = Number(raw.speed); return typeof raw.speed === "number" && n >= book.speed.min && n <= book.speed.max ? { op: "speed", speed: Math.round(n * 100) / 100 } : null; }
    case "timing": {   // (Nov 3 FINAL V2) slow motion / pose holds of ONE move ($0 re-draw)
      const block = text(raw.block, 40), beat = Number(raw.beat), num = (v: unknown) => (typeof v === "number" && v >= 0 && v <= 1 ? v : null);
      const hold = raw.hold === "keys" || raw.hold === "every" || raw.hold === "still" || raw.hold === "none" ? raw.hold : null, factor = typeof raw.factor === "number" && raw.factor > 0 && raw.factor <= 1 ? raw.factor : null;
      const seconds = typeof raw.seconds === "number" && raw.seconds > 0 && raw.seconds <= 10 ? Math.round(raw.seconds * 10) / 10 : null;   // (Nov 8 night) hold 'still' = how long the pose is held
      return block && Number.isSafeInteger(beat) && beat >= 1 && (hold || factor) && (hold !== "still" || seconds) ? { op: "timing", block, beat, factor, hold, seconds, from: num(raw.from), to: num(raw.to) } : null;
    }
    default: return null;
  }
}

// (Nov 2) plan first: requestedSeconds (a number > 0, else null) + storyPlan ({parts:[{seconds, says}]}, a bad one = null: the server
// then uses the book's words). Kept on every intent so the server guard can read them.
function planFields(raw: Record<string, unknown>, book: LunaBook): Pick<V1LunaTurn, "newThings" | "requestedSeconds" | "storyPlan" | "kimodoSteps" | "removeSteps" | "askedDetails" | "heard" | "stepBriefs" | "notDrawn" | "lookBriefs" | "questions"> | null {
  const heard = text(raw.heard, Infinity);
  const lines = (v: unknown, most = Infinity, long = Infinity) => Array.isArray(v) ? v.map((x) => text(x, long)).filter((x): x is string => Boolean(x)).slice(0, most) : [];   // (Nov 13: the card's lines - not drawn, look - are never cut off or dropped; only a question's options keep their room)
  const notDrawn = lines(raw.notDrawn), lookBriefs = lines(raw.lookBriefs);
  const questions = (Array.isArray(raw.questions) ? raw.questions : []).map((q) => isRecord(q) ? { text: text(q.text, 200), options: lines(q.options, 4, 200) } : null)
    .filter((q): q is { text: string; options: string[] } => Boolean(q && q.text && q.options.length >= 2)).slice(0, 3);   // (Nov 11) the question card
  const n = raw.requestedSeconds;
  const requestedSeconds = typeof n === "number" && Number.isFinite(n) && n > 0 ? Math.round(n * 10) / 10 : null;
  let storyPlan: V1StoryPlan | null = null;
  const sp = raw.storyPlan;
  if (isRecord(sp) && Array.isArray(sp.parts) && sp.parts.length) {
    const parts: V1StoryPlan["parts"] = [];
    for (const p of sp.parts) {
      const says = isRecord(p) ? text(p.says, SENTENCE_MAX) : null;
      const seconds = isRecord(p) && typeof p.seconds === "number" && Number.isFinite(p.seconds) && p.seconds > 0 ? Math.round(p.seconds * 10) / 10 : null;
      if (!says || seconds === null) { parts.length = 0; break; }
      parts.push({ seconds, says });
    }
    if (parts.length) storyPlan = { parts };
  }
  // (Nov 4 PM12) the chat AI's Kimodo steps, kept as written; only Kimodo's own limits (book kimodo_steps min_s / max_s) are applied; one bad step = none
  let kimodoSteps: V1KimodoStep[] | null = null, askedDetails: { said: string; step: number }[] | null = null, stepBriefs: string[] | null = null;
  if (Array.isArray(raw.kimodoSteps) && raw.kimodoSteps.length) {
    // (Nov 19 eve) a saved step listed ONLY with its number and a look (book edit rule 29: "never retype them") is a whole step: the app
    // keeps its saved words and seconds (applyStepEdits)
    const timed = (s: Json) => typeof s.seconds === "number" && Number.isFinite(s.seconds) && s.seconds > 0;
    const steps = raw.kimodoSteps.map((s) => (isRecord(s) && ((text(s.text, SENTENCE_MAX) && timed(s)) || (Number.isInteger(s.step) && (s.step as number) > 0 && typeof s.look === "string" && s.look.trim() !== ""))
      ? { text: text(s.text, SENTENCE_MAX) ?? "", ...(text(s.before, 600) ? { before: text(s.before, 600)! } : {}), seconds: timed(s) ? Math.round((s.seconds as number) * 100) / 100 : 0, travels: s.travels === true, airborne: s.airborne === true, changed: s.changed === true || (typeof s.look === "string" && s.look.trim() !== ""), ...(typeof s.look === "string" && s.look.trim() ? { look: s.look.trim().slice(0, 300) } : {}), ...(s.wan === true ? { wan: true } : {}), ...(s.face === "viewer" ? { face: "viewer" } : {}), ...(Number.isInteger(s.part) && (s.part as number) > 1 ? { part: s.part as number } : {}), ...(Number.isInteger(s.step) && (s.step as number) > 0 ? { step: s.step as number } : Number.isInteger(s.after) && (s.after as number) > 0 ? { after: s.after as number } : {}) } : null));
    if (!steps.every(Boolean)) return null;
    // (Nov 4 PM12, YOUR STORY STAYS YOUR STORY) every detail the user said must point at a real step: none missing = the steps are used, else a bad answer (asked again)
    const det = raw.askedDetails;
    // (Nov 5, live: "a red stick figure with a black outline and a pink one on that" - a look, no move - was thrown away as a bad answer) a message
    // that only describes a LOOK has no words that point at a move: that is fine
    if (!Array.isArray(det) || !det.length || !det.every((d) => isRecord(d) && text(d.said, SENTENCE_MAX) && Number.isInteger(d.step) && (d.step as number) >= 0 && (d.step as number) <= steps.length)) return null;
    kimodoSteps = steps as V1KimodoStep[];
    stepBriefs = raw.kimodoSteps.map((s) => (isRecord(s) && text(s.brief, Infinity)) || "");   // (Nov 11) the gate card's line for each step (never sent to the animator)
    askedDetails = det.map((d) => ({ said: text((d as Json).said, SENTENCE_MAX)!, step: (d as { step: number }).step }));
  }
  const removeSteps = Array.isArray(raw.removeSteps) ? [...new Set(raw.removeSteps.filter((k): k is number => Number.isInteger(k) && (k as number) > 0))] : [];   // (Nov 15)
  const newThings = typeof raw.newThings === "string" && raw.newThings.trim() ? raw.newThings.trim().slice(0, 600) : null;   // (Nov 22) the new things' picture
  return { ...(newThings ? { newThings } : {}), ...(requestedSeconds !== null ? { requestedSeconds } : {}), ...(storyPlan ? { storyPlan } : {}), ...(kimodoSteps ? { kimodoSteps, askedDetails, ...(stepBriefs ? { stepBriefs } : {}) } : {}), ...(removeSteps.length ? { removeSteps } : {}), ...(raw.cameraMoves === true ? { cameraMoves: true } : {}), ...(heard ? { heard } : {}), ...(notDrawn.length ? { notDrawn } : {}), ...(lookBriefs.length ? { lookBriefs } : {}), ...(questions.length ? { questions } : {}) };
}

export function normalizeV1LunaTurn(raw: unknown, w: EngineWords, book: LunaBook): V1LunaTurn | null {
  const turn = normalizeTurnBody(raw, w, book);
  return turn && isRecord(raw) && turn.intent !== "refuse" ? (() => { const f = planFields(raw, book); return f ? { ...turn, ...f } : null; })() : turn;
}
function normalizeTurnBody(raw: unknown, w: EngineWords, book: LunaBook): V1LunaTurn | null {
  if (!isRecord(raw) || !isV1Intent(raw.intent)) return null;
  const say = text(raw.say, 2000);
  if (!say) return null;
  if (raw.intent === "create") {
    if (!Array.isArray(raw.blocks) || !raw.blocks.length || raw.blocks.length > book.createMaxBlocks) return null;
    const blocks: { sentence: string; parts?: string[] }[] = [];
    for (const b of raw.blocks) {
      const sentence = isRecord(b) ? text(b.sentence, BLOCK_SENTENCE_MAX) : null; if (!sentence) return null;
      const parts = isRecord(b) ? partsOf(b.parts, book) : null;
      blocks.push({ sentence, ...(parts ? { parts } : {}) });
    }
    const colour = raw.colour === null || raw.colour === undefined ? null : text(raw.colour, 64);
    if (raw.colour !== null && raw.colour !== undefined && !colour) return null;
    const partColours = lenientPartColours(raw.partColours), size = sizeOf(raw.size, w) ?? null, style = lenientStyle(raw.style, w);   // (Nov 5) a bad look setting = left out, never a red error
    return { intent: "create", say, blocks, colour, ...(partColours ? { partColours } : {}), ...(style ? { style } : {}), ...(size !== null ? { size } : {}), ...(raw.still === true ? { still: true } : {}), ...(raw.noFigure === true ? { noFigure: true } : {}), ...(raw.room === "big" ? { room: "big" as const } : {}), ...(raw.start === "left" || raw.start === "right" ? { start: raw.start as "left" | "right" } : {}), ...(text(raw.scene, 1200) ? { scene: text(raw.scene, 1200)! } : {}), ...(raw.leftward === true ? { leftward: true } : {}), ...(cameraOf(raw.camera) === "still" ? { camera: "still" as const } : {}) };
  }
  if (raw.intent === "edit") {
    // (Nov 15, live: the edit that names its steps - step 0, after 13, the backflip - came with ops null and was thrown away as a bad
    // answer) an edit that names steps (kimodoSteps / removeSteps) needs no other order
    const named = (Array.isArray(raw.kimodoSteps) && raw.kimodoSteps.length > 0) || (Array.isArray(raw.removeSteps) && raw.removeSteps.length > 0);
    if ((!Array.isArray(raw.ops) || !raw.ops.length) && !named) return null;
    const ops: V1EditOp[] = [];
    for (const e of Array.isArray(raw.ops) ? raw.ops : []) { const op = normalizeOp(e, w, book); if (!op) return null; ops.push(op); }
    return { intent: "edit", say, ops, ...(typeof raw.still === "boolean" ? { still: raw.still } : {}) };
  }
  if (raw.intent === "refuse") return refuseTurn(say, book);
  return { intent: raw.intent, say };
}

// When refusing, Luna always says what she CAN do: the book's capability sentence is added if her words lack it.
const refuseTurn = (say: string, book: LunaBook): V1LunaTurn => ({
  intent: "refuse",
  say: say.includes(book.capability) ? say : `${say} ${book.capability}`,
});

// (Nov 4 PM12, YOUR STORY STAYS YOUR STORY) every word of the user's message must be in a piece of askedDetails, in order: the words the AI's
// pieces leave out (empty = all there). Only letters / digits are compared (case, punctuation and spacing aside). No word lists.
const wordsOf = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/).filter(Boolean);
export function uncoveredWords(message: string, details: { said: string }[]): string[] {
  const have = wordsOf(details.map((d) => d.said).join(" ")), missing: string[] = [];
  let at = 0;
  for (const w of wordsOf(message)) { const k = have.indexOf(w, at); if (k < 0) missing.push(w); else at = k + 1; }
  return missing;
}

// (Nov 4 PM12) the server's rule in one testable place: an answer whose steps leave words of the message out is asked ONCE more (told which words,
// with its last answer); still words left out = a bad answer (honest failure). No steps (talk, clarify) or no words missing = the answer as it is.
type TurnOutcome = { ok: true; turn: V1LunaTurn; usage?: unknown } | { ok: false; failure: string; detail: string; usage?: unknown };
// (Nov 8 night, live: "try again" came back as a rewrite of short sentences with NO steps - the move list, its detail and its H3 marks were lost
// and Kimodo's planner failed) an edit that changes his moves while the animation has steps must say them all again: else asked ONCE more
export const stepsLeftOut = (turn: V1LunaTurn, current: V1Plan | null | undefined): boolean =>
  turn.intent === "edit" && !turn.kimodoSteps?.length && !turn.removeSteps?.length && Boolean(current?.blocks.some((b) => b.steps?.length)) && (turn.ops ?? []).some((o) => o.op === "rewrite" || o.op === "append");
export async function withSteps<O extends TurnOutcome>(first: O, current: V1Plan | null | undefined, stepsSay: string, reask: (said: string, lastAnswer: string) => Promise<O>): Promise<O | TurnOutcome> {
  if (!first.ok || !stepsLeftOut(first.turn, current)) return first;
  const second = await reask(stepsSay, JSON.stringify(first.turn));
  return second.ok && !stepsLeftOut(second.turn, current) ? second : first;
}
export async function withEveryWord<O extends TurnOutcome>(first: O, message: string, coverSay: string, reask: (said: string, lastAnswer: string) => Promise<O>): Promise<O | TurnOutcome> {
  const missing = (o: TurnOutcome) => o.ok && o.turn.kimodoSteps?.length ? uncoveredWords(o.turn.heard || message, o.turn.askedDetails ?? []) : [];
  const m1 = missing(first);
  if (!first.ok || !m1.length) return first;
  const second = await reask(coverSay.replace("{missing}", m1.join(", ")), JSON.stringify(first.turn));
  const m2 = missing(second);
  // (Nov 5, Arthur: "never an error unless the Wi-Fi is off") a word still left out after asking again (often a typo or a filler word) never throws
  // the answer away: the answer that covers MORE of the message is used
  if (!second.ok) return first;
  return m2.length > m1.length ? first : second;
}
