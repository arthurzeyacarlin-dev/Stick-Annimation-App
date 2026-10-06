// ELEMENT BLASTS (SPEC-0017 Phase 2C extras, ELEMENTAL FIGHTS): an ICE stream or a WATER jet from both palms — the
// same body as the fire blast (powers.ts fireBlast: anchoring wind-up with both hands pulled back to the hip, the
// step-in thrust, the recoil and brace while it pours, the arms coming down), only what comes out is ice or water.
// Their effects (the stream, its hit, and what happens when it meets another power — a clash with a laser beam in
// the middle) come from elements.ts. Marks `windup`, `release`, `recoil`, `end`, like the fire blast.
import type { MoveOutput, MoveSettings, Stance } from "./motion.ts";
import { fireBlast, type FireBlastParams } from "./powers.ts";

export type ElementBlastParams = FireBlastParams & { win?: boolean };
export const iceBlast = (start: Stance, params: ElementBlastParams, settings: MoveSettings): MoveOutput => fireBlast(start, params, settings);
export const waterBlast = (start: Stance, params: ElementBlastParams, settings: MoveSettings): MoveOutput => fireBlast(start, params, settings);
