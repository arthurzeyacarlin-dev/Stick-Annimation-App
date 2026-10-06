// THE LASER EYE (SPEC-0017 Phase 2C extras, 2026-10-06): one glowing eye of the laser eyes power (effects/laser.ts).
// STILL THINGS ARE SYMBOLS: it keeps its look and only moves and grows or shrinks, so it is ONE Library symbol
// ("Laser eye", symbolMaker.ts PLACED_SYMBOLS) placed once per picture on each eye. It also has to be: in the app the
// heads are Library symbols placed ON TOP of each picture, and a placed effect symbol in front sits above them, so
// the eyes glow on the face whether the head is filled or hollow.
// DRAWABLE BY HAND: a soft colored glow, a light ring of the color, a white-hot dot — three circles (the light ring
// keeps it glowing even on a head of the same color as the laser).
import { mixColor } from "./random.ts";
import type { Shape } from "./types.ts";

export const LASER_RED = "#ff2626";
export const LASER_CORE = "#ffffff";
export const LASER_EYE_SYMBOL = "Laser eye";
// Its made size (stage units) for a figure 300 tall (a placement's scale is x this).
export const LASER_EYE_SIZE = 13;

// The eye in its own box (w x h): `color` = the glow, `color2` = the white-hot middle.
export function laserEyeShapes(size: number, w: number, h: number, color = LASER_RED, color2 = LASER_CORE): Shape[] {
  const x = w / 2, y = h / 2;
  return [
    { kind: "circle", x, y, r: size * 0.5, fill: color, alpha: 0.5 },
    { kind: "circle", x, y, r: size * 0.35, fill: mixColor(color, color2, 0.5) },
    { kind: "circle", x, y, r: size * 0.21, fill: color2 },
  ];
}
