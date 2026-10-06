import type { CharacterKey, Scene } from "../engine.ts";
import type { EffectTrack } from "../effects/types.ts";
import type { Action, CharacterPlan, ScenePlan } from "./plan.ts";
import { MOVE_SPEEDS, type MoveSpeed } from "./styles.ts";
import { figureColor } from "../colors.ts";
import { mixColor } from "../effects/random.ts";

// SPEC-0017 Phase 2C: EDITING A MADE ANIMATION. The user says "make the punch stronger", "slower", "make
// Red blue"; the AI turns that into small EDITS of the scene plan (never a new plan), and the engine makes
// the scene again from the edited plan. Only what was asked changes: everything before the edited moment
// comes out identical (unchangedUntil checks it), and after it things move only as much as they must (the
// other fighter's reaction moves with the punch).

// WHO: a character, by id ("a") or name ("Red"), any case.
export type CharacterRef = string;
// WHICH ACTION: by move and which one ("the 2nd punch of Red" = { character: "Red", move: "punch", nth: 2 };
// "the last punch" = { move: "punch", nth: "last" }). `move` "strike" = any punch, kick or dash punch;
// "reaction" = any getHit, block or almost-fall; no `move` = any action ("Red's last action").
// `index` (0-based, in that character's action list) picks it exactly. With no `nth` there must be just one.
export type ActionRef = { character?: CharacterRef; move?: string; nth?: number | "last"; index?: number };
// WHICH EFFECT: by kind ("fire") and which one (in the plan's effect list).
export type EffectRef = { kind?: string; nth?: number | "last" };

export type PlanEdit =
  // Energy of one action (0..1). A strike's power comes from it (hit.ts strikePowerOf), so the reaction
  // follows by itself. Picking a reaction ("make the hit stronger") changes the strike it answers.
  | { kind: "stronger" | "weaker"; action: ActionRef; amount?: number }
  // One speed step (slow / normal / fast) for one action, one character (all its moves), or — with
  // neither — the whole scene's tempo (every character, plus waits, free-moving objects and effects).
  | { kind: "faster" | "slower"; action?: ActionRef; character?: CharacterRef; steps?: number }
  // A character's look.color, or an effect's params.color (`second`: params.color2).
  | { kind: "color"; character?: CharacterRef; effect?: EffectRef; color: string; second?: boolean }
  // An effect's size (x `factor`, default 1.3).
  | { kind: "bigger" | "smaller"; effect: EffectRef; factor?: number }
  // Another move in its place (punch -> kick). Who/what params (target, from, to, object, with) stay;
  // `params` adds to them. Style / speed / energy overrides stay.
  | { kind: "replace"; action: ActionRef; move: string; params?: Record<string, unknown> }
  // A new action straight after one. A new strike at someone who reacts to this attacker's strikes gets a
  // reaction of its own (`reaction: false` = not), so every later reaction still answers its own strike.
  | { kind: "add"; after: ActionRef; action: Action; reaction?: boolean }
  // Take an action out (a strike takes its reaction with it).
  | { kind: "remove"; action: ActionRef }
  | { kind: "rename"; character: CharacterRef; name: string }
  // Build at another frame rate (only the pictures change; every key stays the same).
  | { kind: "fps"; fps: number }
  // "Make the background gray": the PAGE's background color (the project's Background Color in the Select
  // tool's Properties; plan.canvasColor). A color word or a #rgb / #rrggbb code.
  | { kind: "backgroundColor"; color: string }
  // "A thunderstorm: dark blue sky": recolors only the background's SKY piece(s) (`color` at the top, `horizon`
  // lower down; default a lighter mix of `color`). Hills, ground, sun... keep their colors.
  | { kind: "skyColor"; color: string; horizon?: string };

// An edited plan can carry the frame rate to build it at (withFps / fpsOf). planToScene ignores it.
export type EditedPlan = ScenePlan & { fps?: number };

export class EditError extends Error {}

const STRIKE_MOVES = new Set(["punch", "kick", "dashPunch"]);
const REACTION_MOVES = new Set(["getHit", "block", "almostFall"]);
// Params that say who or what an action is about; they survive a replace.
const KEEP_ON_REPLACE = ["target", "from", "to", "object", "with"];
// How much an energy edit changes by (energy is 0..1, 0.5 = normal).
const ENERGY_STEP = 0.25;
// Whole-scene tempo: waits and free-moving objects stretch like a speed step does (styles.ts SPEED_CHANGES).
const TEMPO = { slower: 1.3, faster: 0.8 };
const SIZE_STEP = 1.3;
// An effect with no size of its own: the size we scale from (x the figure's height).
export const EFFECT_SIZE_FALLBACK = 1;

// Color words for a page or a sky (on top of the figure colors, figureColor). Always given back as #rrggbb, the
// way the Background Color picker keeps it.
const PAGE_COLORS: Record<string, string> = { white: "#ffffff", "light gray": "#d1d5db", "dark gray": "#374151", "light blue": "#bfe3ff", "sky blue": "#5fb4f0", "dark blue": "#1e2a5a", navy: "#1e2a5a" };
function colorCode(word: string): string {
  const w = word.trim().toLowerCase().replace(/grey/g, "gray");
  const code = PAGE_COLORS[w] ?? figureColor(w);
  if (!code) throw new EditError(`I don't know the color "${word}" (try a color word like gray or dark blue, or a code like #3366ff).`);
  return code.length === 4 ? `#${code[1]}${code[1]}${code[2]}${code[2]}${code[3]}${code[3]}` : code;
}

const isStrike = (a: Action) => STRIKE_MOVES.has(a.move);
const isReactionTo = (a: Action, attacker: string) => REACTION_MOVES.has(a.move) && a.params?.from === attacker;
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

// ---- finding things ----

function findCharacter(plan: ScenePlan, ref: CharacterRef): CharacterPlan {
  const want = ref.trim().toLowerCase();
  const found = plan.characters.find((c) => c.id.toLowerCase() === want) ?? plan.characters.find((c) => (c.name ?? "").toLowerCase() === want);
  if (!found) throw new EditError(`There is nobody called "${ref}" in this scene.`);
  return found;
}

const matchesMove = (a: Action, move?: string) => move === undefined || a.move === move || (move === "strike" && isStrike(a)) || (move === "reaction" && REACTION_MOVES.has(a.move));

// The character and the index of the action an ActionRef means.
export function findAction(plan: ScenePlan, ref: ActionRef): { character: CharacterPlan; index: number } {
  const owners = ref.character !== undefined ? [findCharacter(plan, ref.character)] : plan.characters;
  if (ref.index !== undefined) {
    if (owners.length !== 1) throw new EditError("Say whose action it is.");
    if (!owners[0].actions[ref.index]) throw new EditError(`${nameOf(owners[0])} has no action number ${ref.index + 1}.`);
    return { character: owners[0], index: ref.index };
  }
  const matches = owners.flatMap((c) => c.actions.map((a, index) => ({ character: c, index, a })).filter((m) => matchesMove(m.a, ref.move)));
  const what = ref.move ?? "action";
  if (matches.length === 0) throw new EditError(`There is no ${words(what)}${ref.character ? ` by ${ref.character}` : ""} in this scene.`);
  const who = new Set(matches.map((m) => m.character.id));
  if (who.size > 1) throw new EditError(`${[...who].map((id) => nameOf(plan.characters.find((c) => c.id === id)!)).join(" and ")} both have a ${words(what)}: whose is it?`);
  if (ref.nth === undefined && matches.length > 1) throw new EditError(`There are ${matches.length} ${plural(what)}: which one?`);
  const pick = ref.nth === "last" ? matches[matches.length - 1] : matches[(ref.nth ?? 1) - 1];
  if (!pick) throw new EditError(`There are only ${matches.length} ${plural(what)}.`);
  return { character: pick.character, index: pick.index };
}

function findEffect(plan: ScenePlan, ref: EffectRef): number {
  const list = (plan.effects ?? []).map((e, i) => ({ e, i })).filter(({ e }) => ref.kind === undefined || e.kind === ref.kind);
  if (list.length === 0) throw new EditError(`There is no ${ref.kind ?? "effect"} in this scene.`);
  if (ref.nth === undefined && list.length > 1) throw new EditError(`There are ${list.length} ${ref.kind ?? "effect"}s: which one?`);
  const pick = ref.nth === "last" ? list[list.length - 1] : list[(ref.nth ?? 1) - 1];
  if (!pick) throw new EditError(`There are only ${list.length} ${ref.kind ?? "effect"}s.`);
  return pick.i;
}

// Strike k (1-based) of a character = its k-th punch / kick / dash punch: the planner pairs it with the
// k-th reaction from that character (plan.ts hitsFrom).
const strikeNumber = (c: CharacterPlan, index: number) => c.actions.slice(0, index + 1).filter(isStrike).length;
function reactionTo(plan: ScenePlan, attacker: string, k: number): { character: CharacterPlan; index: number } | undefined {
  for (const c of plan.characters) {
    let n = 0;
    for (let i = 0; i < c.actions.length; i += 1) if (isReactionTo(c.actions[i], attacker) && (n += 1) === k) return { character: c, index: i };
  }
  return undefined;
}
function strikeFor(plan: ScenePlan, reaction: Action, character: CharacterPlan, index: number): { character: CharacterPlan; index: number } | undefined {
  const from = String(reaction.params?.from);
  const k = character.actions.slice(0, index + 1).filter((a) => isReactionTo(a, from)).length;
  const attacker = plan.characters.find((c) => c.id === from);
  if (!attacker) return undefined;
  let n = 0;
  const i = attacker.actions.findIndex((a) => isStrike(a) && (n += 1) === k);
  return i < 0 ? undefined : { character: attacker, index: i };
}

// ---- the edits ----

const stepSpeed = (speed: MoveSpeed | undefined, by: number): MoveSpeed => MOVE_SPEEDS[Math.min(MOVE_SPEEDS.length - 1, Math.max(0, MOVE_SPEEDS.indexOf(speed ?? "normal") + by))];

function scaleSeconds(action: Action, factor: number): Action {
  const params = action.params && typeof action.params.seconds === "number" ? { ...action.params, seconds: action.params.seconds * factor } : action.params;
  const sync = action.sync?.offset !== undefined ? { ...action.sync, offset: action.sync.offset * factor } : action.sync;
  return { ...action, ...(params ? { params } : {}), ...(sync ? { sync } : {}) };
}
const scaleEffect = (e: EffectTrack, factor: number): EffectTrack => ({ ...e, start: e.start * factor, end: e.end * factor });

// Removing strike k of `attacker`: its reaction goes too (later reactions then still answer their own strike).
function dropReaction(plan: ScenePlan, attacker: string, k: number) {
  const r = reactionTo(plan, attacker, k);
  if (r) r.character.actions.splice(r.index, 1);
}
// A new strike k of `attacker` (aimed at `target`): whoever reacts to this attacker gets a reaction for it.
function addReaction(plan: ScenePlan, attacker: string, k: number, target?: string) {
  const defenders = plan.characters.filter((c) => c.id !== attacker && c.actions.some((a) => isReactionTo(a, attacker)));
  const defender = defenders.find((c) => c.id === target) ?? (defenders.length === 1 && target === undefined ? defenders[0] : undefined);
  if (!defender) return;
  const mine = defender.actions.map((a, i) => (isReactionTo(a, attacker) ? i : -1)).filter((i) => i >= 0);
  // (Before the reaction that answered strike k so far; after the last one if it is the newest strike.)
  const at = k - 1 < mine.length ? mine[k - 1] : mine[mine.length - 1] + 1;
  defender.actions.splice(at, 0, { move: "getHit", params: { from: attacker } });
}

function applyOne(plan: EditedPlan, edit: PlanEdit): void {
  switch (edit.kind) {
    case "stronger":
    case "weaker": {
      let { character, index } = findAction(plan, edit.action);
      const picked = character.actions[index];
      if (REACTION_MOVES.has(picked.move)) {
        const strike = strikeFor(plan, picked, character, index);
        if (!strike) throw new EditError("That hit has no strike to make stronger or weaker.");
        ({ character, index } = strike);
      }
      const action = character.actions[index];
      const energy = action.energy ?? character.energy ?? 0.5;
      const amount = (edit.amount ?? ENERGY_STEP) * (edit.kind === "stronger" ? 1 : -1);
      character.actions[index] = { ...action, energy: clamp01(energy + amount) };
      // (A reaction told its power outright doesn't measure the strike: it gets the same change.)
      if (isStrike(action)) {
        const r = reactionTo(plan, character.id, strikeNumber(character, index));
        const reaction = r && r.character.actions[r.index];
        if (r && reaction && typeof reaction.params?.power === "number") {
          r.character.actions[r.index] = { ...reaction, params: { ...reaction.params, power: Math.max(0, reaction.params.power * (0.6 + 0.8 * clamp01(energy + amount)) / (0.6 + 0.8 * energy)) } };
        }
      }
      return;
    }
    case "faster":
    case "slower": {
      const by = (edit.steps ?? 1) * (edit.kind === "faster" ? 1 : -1);
      if (edit.action) {
        const { character, index } = findAction(plan, edit.action);
        const action = character.actions[index];
        character.actions[index] = { ...action, speed: stepSpeed(action.speed ?? character.speed, by) };
        return;
      }
      const everyone = edit.character !== undefined ? [findCharacter(plan, edit.character)] : plan.characters;
      for (const c of everyone) {
        c.speed = stepSpeed(c.speed, by);
        c.actions = c.actions.map((a) => (a.speed ? { ...a, speed: stepSpeed(a.speed, by) } : a));
      }
      if (edit.character === undefined) {
        // THE WHOLE SCENE'S TEMPO: waits, free-moving objects and effects stretch (or shrink) with it.
        const factor = Math.pow(TEMPO[edit.kind], edit.steps ?? 1);
        for (const c of plan.characters) c.actions = c.actions.map((a) => scaleSeconds(a, factor));
        plan.objects = plan.objects?.map((o) => (o.keys ? { ...o, keys: o.keys.map((k) => ({ ...k, t: k.t * factor })) } : o));
        if (plan.effects) plan.effects = plan.effects.map((e) => scaleEffect(e, factor));
        if (plan.until !== undefined) plan.until *= factor;
      }
      return;
    }
    case "color": {
      if ((edit.character === undefined) === (edit.effect === undefined)) throw new EditError("Say whether the color is for a character or an effect.");
      if (edit.character !== undefined) {
        const c = findCharacter(plan, edit.character);
        c.look = { ...c.look, color: edit.color };
        return;
      }
      const i = findEffect(plan, edit.effect!);
      const e = plan.effects![i];
      plan.effects![i] = { ...e, params: { ...e.params, [edit.second ? "color2" : "color"]: edit.color } };
      return;
    }
    case "bigger":
    case "smaller": {
      const i = findEffect(plan, edit.effect);
      const e = plan.effects![i];
      const factor = edit.factor ?? SIZE_STEP;
      const size = (e.params?.size ?? EFFECT_SIZE_FALLBACK) * (edit.kind === "bigger" ? factor : 1 / factor);
      plan.effects![i] = { ...e, params: { ...e.params, size } };
      return;
    }
    case "replace": {
      const { character, index } = findAction(plan, edit.action);
      const old = character.actions[index];
      const kept = Object.fromEntries(Object.entries(old.params ?? {}).filter(([name]) => KEEP_ON_REPLACE.includes(name)));
      const params = { ...kept, ...edit.params };
      const action: Action = { move: edit.move, ...(Object.keys(params).length ? { params } : {}) };
      if (old.style) action.style = old.style;
      if (old.speed) action.speed = old.speed;
      if (old.energy !== undefined) action.energy = old.energy;
      // (A timing tied to the old move's own mark only makes sense for the same move.)
      if (old.sync && old.move === edit.move) action.sync = old.sync;
      const k = strikeNumber(character, index);
      character.actions[index] = action;
      if (isStrike(old) && !isStrike(action)) dropReaction(plan, character.id, k);
      if (!isStrike(old) && isStrike(action)) addReaction(plan, character.id, k + 1, typeof params.target === "string" ? params.target : undefined);
      return;
    }
    case "add": {
      const { character, index } = findAction(plan, edit.after);
      character.actions.splice(index + 1, 0, structuredClone(edit.action));
      if (isStrike(edit.action) && edit.reaction !== false) addReaction(plan, character.id, strikeNumber(character, index + 1), typeof edit.action.params?.target === "string" ? edit.action.params.target : undefined);
      return;
    }
    case "remove": {
      const { character, index } = findAction(plan, edit.action);
      const action = character.actions[index];
      if (REACTION_MOVES.has(action.move)) {
        const from = String(action.params?.from);
        const later = character.actions.slice(index + 1).some((a) => isReactionTo(a, from));
        if (later) throw new EditError(`That reaction answers a strike, and the ones after it answer the next strikes: take out the strike instead, or change the reaction (a block).`);
      }
      const k = strikeNumber(character, index);
      character.actions.splice(index, 1);
      if (isStrike(action)) dropReaction(plan, character.id, k);
      return;
    }
    case "rename": {
      findCharacter(plan, edit.character).name = edit.name;
      return;
    }
    case "fps": {
      if (!(edit.fps > 0)) throw new EditError("Pictures a second must be more than 0.");
      plan.fps = edit.fps;
      return;
    }
    case "backgroundColor": {
      plan.canvasColor = colorCode(edit.color);
      return;
    }
    case "skyColor": {
      const color = colorCode(edit.color), horizon = edit.horizon !== undefined ? colorCode(edit.horizon) : mixColor(color, "#ffffff", 0.3);
      const pieces = plan.background?.pieces ?? [];
      if (!pieces.some((p) => p.kind === "sky")) throw new EditError("There is no sky in this scene (to change the whole page's color, change the background color).");
      plan.background = { ...plan.background!, pieces: pieces.map((p) => (p.kind === "sky" ? { ...p, params: { ...p.params, color, color2: horizon } } : p)) };
      return;
    }
  }
}

// Apply the edits in order to a COPY of the plan (the plan passed in is never changed).
export function applyEdits(plan: ScenePlan | EditedPlan, edits: readonly PlanEdit[]): EditedPlan {
  const out = structuredClone(plan) as EditedPlan;
  for (const edit of edits) applyOne(out, edit);
  return out;
}

// "Make it 8 FPS": the same plan, built at another frame rate.
export const withFps = (plan: ScenePlan | EditedPlan, fps: number): EditedPlan => applyEdits(plan, [{ kind: "fps", fps }]);
// The frame rate to build an edited plan at (the project's own when the plan doesn't say).
export const fpsOf = (plan: ScenePlan | EditedPlan, projectFps: number): number => ("fps" in plan && plan.fps ? plan.fps : projectFps);

// ---- REMAKE ONLY THAT ----

const sameKey = (a: CharacterKey, b: CharacterKey) => JSON.stringify(a) === JSON.stringify(b);

// Per character (by id): the time up to which it moves exactly the same in both scenes. Its keys are
// compared in time order; the in-betweens up to the last shared key are the same, after it they lead to a
// different key. Not changed at all = the scene's length; missing from either scene = 0.
export function unchangedByCharacter(oldScene: Scene, newScene: Scene): Record<string, number> {
  const length = Math.min(oldScene.durationSec, newScene.durationSec);
  const out: Record<string, number> = {};
  for (const id of new Set([...oldScene.characters, ...newScene.characters].map((c) => c.id))) {
    const before = oldScene.characters.find((c) => c.id === id), after = newScene.characters.find((c) => c.id === id);
    if (!before || !after || after.facing !== before.facing || after.height !== before.height) { out[id] = 0; continue; }
    const a = [...before.keys].sort((x, y) => x.t - y.t), b = [...after.keys].sort((x, y) => x.t - y.t);
    let i = 0;
    while (i < a.length && i < b.length && sameKey(a[i], b[i])) i += 1;
    out[id] = i === a.length && i === b.length ? length : i === 0 ? 0 : Math.min(length, a[i - 1].t);
  }
  return out;
}

// REMAKE ONLY THAT: the time up to which both scenes' characters are exactly the same (every key of every
// character), so every picture up to then comes out identical. Nothing different = the scene's length.
export function unchangedUntil(oldScene: Scene, newScene: Scene): number {
  return Math.min(Math.min(oldScene.durationSec, newScene.durationSec), ...Object.values(unchangedByCharacter(oldScene, newScene)));
}

// ---- for the chat ----

const words = (move: string) => ({ getHit: "reaction", dashPunch: "dash punch", almostFall: "almost-fall", strike: "strike" } as Record<string, string>)[move] ?? move.replace(/([A-Z])/g, " $1").toLowerCase();
const plural = (move: string) => { const w = words(move); return /(ch|sh|s|x)$/.test(w) ? `${w}es` : `${w}s`; };
const nameOf = (c: CharacterPlan) => c.name ?? c.id;
const ordinal = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] ?? "th"}`;
function actionText(ref: ActionRef): string {
  const which = ref.index !== undefined ? `action number ${ref.index + 1}` : `${ref.nth === "last" ? "last " : ref.nth !== undefined ? `${ordinal(ref.nth)} ` : ""}${words(ref.move ?? "action")}`;
  return ref.character !== undefined ? `${ref.character}'s ${which}` : `the ${which}`;
}
const effectText = (ref: EffectRef) => `the ${ref.nth === "last" ? "last " : ref.nth !== undefined ? `${ordinal(ref.nth)} ` : ""}${ref.kind ?? "effect"}`;

// One plain sentence for the chat: what this edit does.
export function describeEdit(edit: PlanEdit): string {
  switch (edit.kind) {
    case "stronger": return `Make ${actionText(edit.action)} stronger.`;
    case "weaker": return `Make ${actionText(edit.action)} weaker.`;
    case "faster":
    case "slower": {
      const what = edit.action ? actionText(edit.action) : edit.character !== undefined ? `${edit.character}'s moves` : "the whole scene";
      return `Make ${what} ${edit.kind === "faster" ? "faster" : "slower"}${(edit.steps ?? 1) > 1 ? ` (${edit.steps} steps)` : ""}.`;
    }
    case "color": return edit.character !== undefined ? `Make ${edit.character} ${edit.color}.` : `Make ${effectText(edit.effect ?? {})}${edit.second ? "'s second color" : ""} ${edit.color}.`;
    case "bigger":
    case "smaller": return `Make ${effectText(edit.effect)} ${edit.kind}.`;
    case "replace": return `Change ${actionText(edit.action)} into a ${words(edit.move)}.`;
    case "add": return `Add a ${words(edit.action.move)} after ${actionText(edit.after)}.`;
    case "remove": return `Take out ${actionText(edit.action)}.`;
    case "rename": return `Call ${edit.character} "${edit.name}" from now on.`;
    case "fps": return `Make it ${edit.fps} pictures a second (same timing, ${edit.fps < 12 ? "fewer" : "more"} pictures).`;
    case "backgroundColor": return `Make the page's background ${edit.color}.`;
    case "skyColor": return `Make the sky ${edit.color} (everything else keeps its colors).`;
  }
}
