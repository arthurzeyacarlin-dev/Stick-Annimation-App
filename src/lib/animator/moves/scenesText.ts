// EXPLOSION WITH TEXT (SPEC-0017 Phase 2C, 2026-10-07 — Arthur: "an explosion ... and then text is going to come out,
// whatever it is"; then: "I want a white background and stick figures ... I don't want it on the ground, I want it in the
// air. An explosion in the air explodes evenly on all sides. On the ground it goes up — you can't explode downward").
// Proof the engine can animate WORDS: on a plain white page, two stick figures stand either side; high above the middle
// an AIR explosion (explosion.ts `air`: it bursts EQUALLY in all directions — nothing below it to push it up) goes off,
// and a beat after it starts the words burst straight out of its middle (text.ts, TEXT POPS OUT): small, shooting out,
// overshooting and settling, holding still to read, then swelling, shrinking and fading. Far from the blast, the two
// only startle (blownAway's rule: far = a flinch — STARTLE). The same plan works for any words (`explosionTextPlan("POW!")`).
import { EXPLOSION_SECONDS, EXPLOSION_SIZE } from "../effects/explosion.ts";
import type { EffectTrack } from "../effects/types.ts";
import { DEFAULT_STYLE } from "../rig.ts";
import type { ShakePlan } from "./camera.ts";
import type { ScenePlan } from "./plan.ts";
import { measureFit } from "./scenesGrenade.ts";

const GROUND = 900, HEIGHT = 280, STAGE = 1920, MIDDLE = STAGE / 2;
// (High in the air above the middle — well above the figures' heads.)
const BURST_HEIGHT = 1.85;
// The blast on a quarter second (a picture right on it at 8, 12 and 24 a second); the words a beat after it starts
// (out of the fireball, as it is at its biggest), on screen until a little before the smoke is gone.
export const TEXT_BOOM = 0.5, TEXT_AFTER = 0.15, TEXT_SECONDS = 3.1;
// THE IMPACT (Arthur, Oct 7: "I want the camera to shake ... only two impact frames ... I don't really feel the strength"):
// a hard jolt of the whole picture on the blast that is over in 2 pictures (the impact frames) — strong, never a wobble.
const SHAKE = { strength: 0.022, seconds: 0.15, impact: true };

export function explosionTextPlan(words = "BOOM!"): ScenePlan & { shake: ShakePlan[] } {
  const at = { x: MIDDLE, y: GROUND - BURST_HEIGHT * HEIGHT }, end = TEXT_BOOM + EXPLOSION_SECONDS;
  const effects: EffectTrack[] = [
    { kind: "explosion", start: TEXT_BOOM, end, anchor: at, params: { size: 1.25 * EXPLOSION_SIZE, strength: 1.5, seed: 19, air: true }, layer: "back" },
    // (Out of an air burst the words come straight out of its middle — only a little way up, so they stay on the blast.)
    { kind: "text", start: TEXT_BOOM + TEXT_AFTER, end: TEXT_BOOM + TEXT_AFTER + TEXT_SECONDS, anchor: at, params: { text: words, style: "pop", size: 0.62, rise: 0.45, seed: 2 } },
  ];
  for (const e of effects) e.fit = measureFit(e, HEIGHT, GROUND, STAGE);
  const watcher = (id: string, name: string, x: number, facing: "left" | "right", color: string) => ({
    id, name, x, facing, look: { color },
    actions: [
      { move: "stand", params: { seconds: TEXT_BOOM } },
      { move: "blownAway", params: { from: { x: at.x }, strength: 1 } },
      { move: "stand", params: { seconds: 1.7 } },
    ],
  });
  return {
    id: "fx-explosion-text", title: "Explosion with text", height: HEIGHT, groundY: GROUND, stageWidth: STAGE,
    characters: [watcher("left", "Left", MIDDLE - 1.7 * HEIGHT, "right", DEFAULT_STYLE.color), watcher("right", "Right", MIDDLE + 1.7 * HEIGHT, "left", "#2563eb")],
    effects, shake: [{ at: TEXT_BOOM, ...SHAKE }],
  };
}
