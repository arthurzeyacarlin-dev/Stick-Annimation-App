import { buildScene } from "../engine.ts";
import type { EffectTrack } from "../effects/types.ts";
import { LIBRARY } from "../moves/library.ts";
import { planToScene, type MoveEntry, type ScenePlan } from "../moves/plan.ts";
import type { DirectedPlan } from "./repair.ts";

// SPEC-0017 Phase 3 (H51, Arthur rated Luna's "a stick figure turns into a car and drives to the moon" BAD): what the
// user's WORDS mean for the plan, for any AI and any scene. Run after repairPlan (the plan builds); every change is
// written down in plain words.
// 1. A CHANGE OF FORM STAYS: a transform stays in its new form until the words say it changes back ("turns back",
//    "changes back", "back into", "back to normal"); an un-asked `back` is dropped (like the un-asked guard).
// 2. GOING TO A THING ENDS AT IT: "drives / flies / goes to the moon" = the moving thing's path ENDS at that thing
//    (a still prop in the scene). A thing on the ground goes along the ground first, then rises to a thing up high.
// 3. A SLOW WAY OF MOVING COVERS LESS GROUND: one walking-type action lasts at most MAX_TRAVEL_SECONDS at its own
//    speed (tiptoe is slow, so it goes less far) unless the words ask for a long / slow one or give a time.

export const MAX_TRAVEL_SECONDS = 8;
const TRAVEL_MOVES = new Set(["walk", "tiptoe", "jog", "run"]);
const ASKS_BACK = /\b(turn|turns|turned|turning|change|changes|changed|changing|morph\w*|transform\w*|switch\w*)\s+(\w+\s+){0,2}back\b|\bback\s+into\b|\bback to (normal|(a |the |his |her )?(stick ?figure|figure|human|person|man|woman|boy|girl|self|himself|herself|themselves))\b|\brevert\w*|\bun-?transform/i;
const ASKS_LONG = /\b(long|longer|slow|slowly|slower|forever|ages|all day|marathon|minutes?|\d+(\.\d+)?\s*(s|sec|secs|seconds?))\b/i;
const GOES_TO = /\b(?:to|toward|towards|into|onto|at|reach(?:es|ing)?)\s+(?:the\s+|a\s+|an\s+|its\s+|his\s+|her\s+)?([a-z]+)/gi;

const travelSeconds = (plan: DirectedPlan, characterIndex: number, actionIndex: number, moves: Record<string, MoveEntry>) => {
  const c = plan.characters[characterIndex];
  const one: DirectedPlan = { ...plan, characters: [{ ...c, actions: [c.actions[actionIndex]] }], objects: undefined, effects: undefined, background: undefined };
  return planToScene(one, moves).durationSec - 0.25;
};

// (`previous`: a follow-up's previous plan — a `back` it already had is kept: "make it red" must not drop it.)
export function followStoryWords(plan: DirectedPlan, prompt: string, previous?: ScenePlan, moves: Record<string, MoveEntry> = LIBRARY): string[] {
  const repairs: string[] = [];
  const name = (id: string) => plan.characters.find((c) => c.id === id)?.name ?? id;
  const transforms = (plan.effects ?? []).filter((e) => e.kind === "transform" && "character" in e.anchor);
  // 1. A CHANGE OF FORM STAYS.
  if (!ASKS_BACK.test(prompt)) {
    const had = (e: EffectTrack) => (previous?.effects ?? []).some((p) => p.kind === "transform" && p.params?.back === true && "character" in p.anchor && p.anchor.character === (e.anchor as { character: string }).character);
    for (const e of transforms) if (e.params?.back === true && !had(e)) {
      delete e.params.back;
      repairs.push(`${name((e.anchor as { character: string }).character)} turns into the ${String(e.params.into ?? "symbol")} and stays that way (nobody asked them to change back).`);
    }
  }
  // 2. GOING TO A THING ENDS AT IT.
  const props = (plan.effects ?? []).filter((e) => e.kind === "prop" && "x" in e.anchor && typeof (e.anchor as { x: unknown }).x === "number");
  const named = [...prompt.matchAll(GOES_TO)].map((m) => m[1].toLowerCase());
  const target = props.find((p) => named.some((w) => w === String(p.params?.symbol ?? "").toLowerCase() || `${w}s` === String(p.params?.symbol ?? "").toLowerCase()));
  const movers = transforms.filter((e) => e.params?.back !== true);
  if (target && movers.length) {
    let built: ReturnType<typeof buildScene> | undefined;
    try { built = buildScene(planToScene(plan, moves), 12); } catch { built = undefined; }
    for (const e of movers) if (built && endAt(e, target, plan, built)) repairs.push(`The ${String(e.params?.into ?? "symbol")} now goes all the way to the ${String(target.params?.symbol)} (going TO a thing ends AT it).`);
  }
  // 3. A SLOW WAY OF MOVING COVERS LESS GROUND.
  if (!ASKS_LONG.test(prompt)) {
    plan.characters.forEach((c, ci) => c.actions.forEach((a, ai) => {
      if (!TRAVEL_MOVES.has(a.move) || typeof a.params?.distance !== "number" || a.params.distance <= 0) return;
      let seconds: number;
      try { seconds = travelSeconds(plan, ci, ai, moves); } catch { return; }
      if (seconds <= MAX_TRAVEL_SECONDS + 0.05) return;
      const was = a.params.distance;
      let d = was * (MAX_TRAVEL_SECONDS / seconds);
      for (let tries = 0; tries < 4; tries += 1) { // (the speed-up and slow-down make time not quite match distance)
        a.params.distance = Math.round(d);
        try { seconds = travelSeconds(plan, ci, ai, moves); } catch { break; }
        if (seconds <= MAX_TRAVEL_SECONDS + 0.05) break;
        d *= 0.95 * (MAX_TRAVEL_SECONDS / seconds);
      }
      repairs.push(`${c.name ?? c.id}'s ${a.move} of ${Math.round(was)} px would take too long at its own speed, so it goes ${a.params.distance} px (about ${MAX_TRAVEL_SECONDS} s or less).`);
    }));
  }
  return repairs;
}

// The transform's path made to end at the target prop (true = changed). Its points are px from where the symbol
// formed: the figure's hip x at the effect's start, on the floor (its middle half its height up).
function endAt(e: EffectTrack, target: EffectTrack, plan: DirectedPlan, built: ReturnType<typeof buildScene>): boolean {
  const id = (e.anchor as { character: string }).character;
  const frame = built.frames[Math.min(built.frames.length - 1, Math.max(0, Math.round(e.start * built.fps)))];
  const hip = frame?.find((c) => c.id === id)?.skeleton.hip;
  if (!hip) return false;
  const params = e.params ?? (e.params = {});
  const h = Number(params.size ?? 0.45) * plan.height;
  const at = target.anchor as { x: number; y: number };
  const tx = Math.round(at.x - hip.x), ty = Math.round(at.y - (plan.groundY - h / 2));
  const path = (Array.isArray(params.path) ? params.path : []) as { t: number; dx: number; dy: number }[];
  const last = path[path.length - 1];
  if (last && Math.hypot(last.dx - tx, last.dy - ty) < 0.5 * plan.height) return false;
  const morph = Math.min(Number(params.morph ?? 0.8), e.end - e.start);
  const T = Math.max(0.5, Number(last?.t) > 0.5 ? Number(last.t) : e.end - e.start - morph);
  // (The route the AI wrote is kept up to the last ~40% of the time; then it heads for the target.)
  const kept = path.filter((p) => Number(p.t) <= 0.6 * T).map((p) => ({ t: Number(p.t), dx: Math.sign(tx) * Math.min(Math.abs(Number(p.dx)), Math.abs(tx)) || 0, dy: Number(p.dy) || 0 }));
  // (Up high and still on the ground: it drives along the floor first, then rises to it.)
  if (ty < -0.5 * plan.height && !kept.some((p) => p.t > 0 && Math.abs(p.dx) > 0.3 * Math.abs(tx))) kept.push({ t: Math.round(0.55 * T * 100) / 100, dx: Math.round(0.6 * tx), dy: 0 });
  params.path = [...kept, { t: T, dx: tx, dy: ty }];
  // (The trip is seen to its end: the effect, the target and the scene last until it arrives — the scene's length
  // comes from the figures' actions, so the hidden figure's last stand is made longer when it ends too soon.)
  const arrive = e.start + morph + T;
  e.end = Math.max(e.end, arrive);
  target.end = Math.max(target.end, arrive);
  const sceneEnd = (() => { try { return planToScene(plan, LIBRARY).durationSec - 0.25; } catch { return Infinity; } })();
  const c = plan.characters.find((p) => p.id === id);
  if (c && sceneEnd < arrive) {
    const more = Math.round((arrive - sceneEnd + 0.3) * 10) / 10, lastAction = c.actions[c.actions.length - 1];
    if (lastAction?.move === "stand" && typeof lastAction.params?.seconds === "number") lastAction.params.seconds = Math.round((lastAction.params.seconds + more) * 10) / 10;
    else c.actions.push({ move: "stand", params: { seconds: more } });
  }
  // (Arrived, it stays there with the target to the last picture.)
  // (+0.25 s: the last picture can fall a little after the scene's length.)
  const lastPicture = 0.25 + (() => { try { return planToScene(plan, LIBRARY).durationSec; } catch { return arrive; } })();
  e.end = Math.max(e.end, lastPicture);
  target.end = Math.max(target.end, lastPicture);
  return true;
}
