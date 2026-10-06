// LIGHT ON THE GROUND (Arthur): light from lightning, a bulb, fire or a flash lies ON the ground line as a THIN, DIM
// band — flat on top with rounded ends, like a reflection — with a fainter, lighter streak inside. Never a thick dome
// or a bright white disc (that reads as a second light). Nothing goes below the ground. Any color (purple lightning →
// purple light, a warm bulb → warm light).
import { mixColor } from "./random.ts";
import type { Shape } from "./types.ts";

// The top half of a rounded band sitting on the ground: flat on top, rounded ends (a super-ellipse, power 4).
export function groundBand(cx: number, groundY: number, halfWidth: number, thick: number, steps = 24): number[] {
  const pts: number[] = [];
  for (let i = 0; i <= steps; i += 1) {
    const a = (Math.PI * i) / steps, c = Math.cos(a), s = Math.sin(a);
    pts.push(cx + halfWidth * Math.sign(c) * Math.sqrt(Math.abs(c)), groundY - thick * Math.sqrt(Math.abs(s)));
  }
  return pts;
}

// `halfWidth` = how far it spreads each way, `thick` = how tall the band is, `alpha` = how bright (0..1, already
// dim: a reflection), `core` = the color of the lighter streak (default: the light's color mixed toward white).
export function groundLight(cx: number, groundY: number, halfWidth: number, thick: number, color: string, alpha: number, core?: string): Shape[] {
  if (!(alpha > 0.005) || !(halfWidth > 0) || !(thick > 0)) return [];
  const streak = core ? mixColor(color, core, 0.6) : mixColor(color, "#ffffff", 0.6);
  return [
    { kind: "poly", points: groundBand(cx, groundY, halfWidth, thick), fill: color, alpha, glow: 10 },
    { kind: "poly", points: groundBand(cx, groundY - thick * 0.3, halfWidth * 0.7, thick * 0.3), fill: streak, alpha: alpha * 0.9 },
  ];
}
