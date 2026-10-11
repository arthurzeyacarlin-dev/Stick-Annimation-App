// SPEC-0021 NEW COPY — THINGS THE WORLD DOES BY ITSELF (Arthur's review of Claude's scenes, Sun 2026-10-11): what a person
// would always see, so nobody has to ask for it:
// - SWORDS SPARK: every sword block's "hit" (the blades meet) makes a clash spark ON THE BLADE near the tip (never at the hand).
// - A THING BY AN EXPLOSION BREAKS APART: a prop standing within reach of an explosion is gone at the blast and its pieces
//   fly (effects/explosion.ts thingBreak: panels in its own colour, wheels for a vehicle), thrown like a person is.
import type { EffectTrack } from "../effects/types.ts";
import type { ScenePlan } from "./plan.ts";

const VEHICLE = /\b(car|truck|van|bus|jeep|taxi|tractor)\b/i;
export function autoEffects(plan: ScenePlan, marks: Record<string, number>, duration: number): EffectTrack[] | null {
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
  return add.length ? [...effects, ...add] : null;
}
