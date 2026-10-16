// SPEC-0021 NEW COPY — THINGS THE WORLD DOES BY ITSELF (Arthur's review of Claude's scenes, Sun 2026-10-11): what a person
// would always see, so nobody has to ask for it:
// - SWORDS SPARK: every sword block's "hit" (the blades meet) makes a clash spark ON THE BLADE near the tip (never at the hand).
// - A THING BY AN EXPLOSION BREAKS APART: a prop standing within reach of an explosion is gone at the blast and its pieces
//   fly (effects/explosion.ts thingBreak: panels in its own colour, wheels for a vehicle), thrown like a person is.
import type { EffectTrack } from "../effects/types.ts";
import type { ScenePlan } from "./plan.ts";
import { boardSpot, RIDE_DECK, rideGeometry } from "./ride.ts";
import type { CharacterKey } from "../engine.ts";

const VEHICLE = /\b(car|truck|van|bus|jeep|taxi|tractor)\b/i;
export function autoEffects(plan: ScenePlan, marks: Record<string, number>, duration: number, keysOf?: Map<string, CharacterKey[]>): EffectTrack[] | null {
  const effects = (plan.effects ?? []).map((e) => ({ ...e }));
  const add: EffectTrack[] = [];
  const H = plan.height;
  for (const c of plan.characters) {
    const held = effects.find((e) => e.kind === "heldWeapon" && (e.anchor as { character?: string }).character === c.id);
    const hand = (held?.anchor as { joint?: string } | undefined)?.joint ?? "rHand", weapon = String(held?.params?.weapon ?? "sword");
    const blocks = c.actions.filter((a) => a.move === "swordBlock").length;
    for (let n = 1; n <= blocks; n += 1) {
      const t = marks[`${c.id}.swordBlock${n}.hit`];
      if (t !== undefined) add.push({ kind: "clashSpark", start: t, end: t + 0.35, anchor: { character: c.id, joint: hand } as EffectTrack["anchor"], target: { character: c.id, joint: hand === "lHand" ? "lElbow" : "rElbow" } as EffectTrack["target"], params: { size: 1.2, blade: weapon, along: 0.8 }, layer: "front" }); // (ON THE BLADE near the tip, where the swords meet — never at the hand)
    }
  }
  for (const ex of effects.filter((e) => e.kind === "explosion" || e.kind === "grenade")) {
    const at = ex.anchor as { x?: number; y?: number };
    if (typeof at.x !== "number") continue;
    for (const p of effects) {
      const pa = p.anchor as { x?: number; y?: number };
      if (p.kind !== "prop" || typeof pa.x !== "number" || Math.abs(pa.x - at.x) > 1.2 * H || !(p.start <= ex.start && p.end > ex.start - 0.05)) continue;
      const name = String(p.params?.symbol ?? p.params?.name ?? "");
      p.end = ex.start;
      add.push({ kind: "thingBreak", start: ex.start, end: duration, anchor: { x: pa.x, y: plan.groundY }, target: { x: at.x, y: typeof at.y === "number" ? at.y : plan.groundY }, params: { size: typeof p.params?.size === "number" ? p.params.size : 0.4, color: typeof p.params?.color === "string" ? p.params.color : VEHICLE.test(name) ? "#d32f2f" : "#8d6e63", wheels: VEHICLE.test(name) } });
    }
  }
  // THE RIDE BRINGS ITS BOARD (ride.ts, Oct 14): a figure that rides a skateboard or scooter stands on one the whole scene — drawn
  // under its FRONT foot (the foot that never leaves the deck), the deck top at the sole, wheels on the ground; a scooter's bar
  // comes up to where the hands hold it. Claude's own board for that figure (a prop named board/scooter on its foot) is replaced.
  for (const c of plan.characters) {
    const r = c.actions.find((a) => a.move === "ride");
    if (!r) continue;
    const scooter = (r.params as { on?: string } | undefined)?.on === "scooter";
    const S = 0.1, g = rideGeometry(scooter), sign = c.facing === "left" ? -1 : 1, deck = RIDE_DECK / S;
    for (let i = effects.length - 1; i >= 0; i -= 1) { const e = effects[i]!; if (e.kind === "prop" && (e.params?.rideOf === c.id || ((e.anchor as { character?: string }).character === c.id && /board|skate|scooter/i.test(String(e.params?.name ?? e.params?.symbol ?? ""))))) effects.splice(i, 1); }
    const parts: Record<string, unknown>[] = [
      { shape: "round", x: 0, y: 0.12, w: 4.6, h: 0.24, color: scooter ? "#2563eb" : "#1f2937" },
      { shape: "circle", x: -1.6, y: deck - 0.16, w: 0.32, h: 0.32, color: "#facc15" },
      { shape: "circle", x: scooter ? 2.05 : 1.6, y: deck - 0.16, w: 0.32, h: 0.32, color: "#facc15" },
    ];
    if (scooter) {
      // ONE CONNECTED SCOOTER (Arthur, Oct 15: "broken scooter"): the stem is a straight bar from the deck's FRONT END (joined into
      // the deck) up to the grip, the handlebar crosses the stem's top exactly where the hands hold it (ride.ts solves the arms onto
      // that point), and the front wheel sits under the stem's foot. Every piece touches the next: nothing floats.
      const gx = (g.gripX - g.mid) / S, gy = g.gripY / S, fx = 2.05, fy = 0.12;
      parts.push(
        { shape: "line", x: fx, y: fy, w: gx - fx, h: gy - fy, color: "#4b5563" },
        { shape: "line", x: fx, y: fy, w: 0, h: deck - 0.16 - fy, color: "#4b5563" },
        { shape: "line", x: gx - 0.3, y: gy, w: 0.6, h: 0, color: "#111827" },
      );
    }
    // (after the rider steps off — the ride's mark `off` — the board stays where it stopped)
    const n = c.actions.filter((a) => a.move === "ride").length, off = n === 1 ? marks[`${c.id}.ride1.off`] : undefined;
    const key = off === undefined ? undefined : keysOf?.get(c.id)?.find((k) => Math.abs(k.t - off) < 1e-6);
    const params = { name: scooter ? "scooter" : "skateboard", size: S, parts, rideOf: c.id }; // (rideOf: made here — replaced, never doubled, when the plan is built again)
    add.push({ kind: "prop", start: -1, end: key ? off! : duration + 1, anchor: { character: c.id, joint: "lFoot", dx: sign * g.mid * H, dy: 0 } as EffectTrack["anchor"], layer: "back", params: key ? { ...params, letGo: true } : params } as EffectTrack); // (letGo: the foot leaves it at `off`)
    // (NEAR-SIDE LIMBS IN FRONT, Arthur Oct 15: "when he puts his foot on the ground to brake, I could barely see it because it was
    // behind the skateboard": the thing a figure rides or stands on is drawn BEHIND the rider — every foot on the deck, the pushing
    // foot and the braking foot read in front of it. Same for a scooter's deck and bar: the hands hold it in front.)
    if (key) { const at = boardSpot(key, H, plan.groundY, scooter); add.push({ kind: "prop", start: off!, end: duration + 1, anchor: { x: at.x, y: at.y }, layer: "back", params } as EffectTrack); }
  }
  return add.length ? [...effects, ...add] : null;
}
