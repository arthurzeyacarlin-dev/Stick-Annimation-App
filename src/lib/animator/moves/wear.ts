// WORN ACCESSORIES (SPEC-0017 Phase 2C, 2026-10-06): a cap, hat or helmet a figure WEARS (character `wears`).
// ACCESSORIES COVER THE BODY PART and STAY ON (Arthur: "after the figure gets up from the explosion, his Military cap
// suddenly DISAPPEARS"): a worn accessory is a symbol on its body part in EVERY picture of the scene — lying down,
// getting up, any move — following that part; it only leaves if the story knocks it off (then it is animated
// falling, never just gone). So it is not a timed effect the planner must remember to stretch: the plan says what a
// figure wears and this adds one track for the whole scene (like the Handcuffs on a cuffed figure, cuffs.ts).
import type { EffectTrack } from "../effects/types.ts";
import { DEFAULT_STYLE, HEAD_RADIUS, type HeadSize } from "../rig.ts";
import type { ScenePlan } from "./plan.ts";

// What each accessory is drawn by and where it is worn: the effect recipe, the body part (joint) and the joint it
// turns with, its layer ("top" = over the head).
export const ACCESSORIES: Record<string, { kind: string; joint: "head"; toward: "neck"; layer: "top"; about: string }> = {
  militaryCap: { kind: "militaryCap", joint: "head", toward: "neck", layer: "top", about: "an olive military cap, down over the top of the head, its peak forward" },
};
export type Accessory = keyof typeof ACCESSORIES;
// "For the whole scene" (the track never ends before the scene does; the Handcuffs use the same).
export const WHOLE_SCENE = 1e6;

// Every worn accessory as an effect track from the start to the end of the scene. A plan where nobody wears
// anything comes back unchanged.
export function wearPlan(plan: ScenePlan): ScenePlan {
  const tracks: EffectTrack[] = [];
  for (const c of plan.characters) for (const id of (c as { wears?: string[] }).wears ?? []) {
    const a = ACCESSORIES[id];
    if (!a) continue;
    const headSize = HEAD_RADIUS[(c.look?.headSize ?? "normal") as HeadSize] ?? HEAD_RADIUS.normal;
    // (its size from the head radius and the head's line width, so it covers the head and its outline)
    const outline = c.look?.thickness ?? DEFAULT_STYLE.thickness;
    tracks.push({ kind: a.kind, start: 0, end: WHOLE_SCENE, anchor: { character: c.id, joint: a.joint }, target: { character: c.id, joint: a.toward }, params: { headSize, outline }, layer: a.layer });
  }
  return tracks.length ? { ...plan, effects: [...(plan.effects ?? []), ...tracks] } : plan;
}
