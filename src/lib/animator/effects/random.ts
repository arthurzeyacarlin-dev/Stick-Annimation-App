// Seeded, stateless randomness: the same (seed, i, k) always gives the same number in 0..1, so an effect is the
// same at every frame rate and every time it is built.
export function rand(seed: number, i: number, k = 0): number {
  const v = Math.sin(seed * 12.9898 + i * 78.233 + k * 37.719) * 43758.5453;
  return v - Math.floor(v);
}

// A smooth wobble in -1..1 over time (for flicker and turbulence): a few sine waves with seeded phases.
export function wobble(seed: number, i: number, t: number, speed = 1): number {
  let s = 0;
  for (let k = 0; k < 3; k += 1) s += Math.sin(t * speed * (2.1 + 1.7 * k) * (0.8 + 0.4 * rand(seed, i, k)) + 6.283 * rand(seed, i, k + 5)) / (k + 1);
  return s / 1.83;
}

export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
export const lerp = (a: number, b: number, u: number) => a + (b - a) * u;
export const smooth = (u: number) => { const v = clamp(u, 0, 1); return v * v * (3 - 2 * v); };

// Mix two #rrggbb colors (u = 0 → a, 1 → b).
export function mixColor(a: string, b: string, u: number): string {
  const p = (c: string) => { const h = c.replace("#", ""); const n = h.length === 3 ? h.split("").map((x) => x + x).join("") : h; return [0, 2, 4].map((j) => parseInt(n.slice(j, j + 2), 16)); };
  const [x, y] = [p(a), p(b)];
  if (x.some(Number.isNaN) || y.some(Number.isNaN)) return u < 0.5 ? a : b;
  return "#" + x.map((v, j) => Math.round(lerp(v, y[j], clamp(u, 0, 1))).toString(16).padStart(2, "0")).join("");
}

// The life of a particle i that is born again and again: which life it is in at time t, and how far through
// it (0..1). `every` = seconds between births of this particle, `life` = how long each lives.
export function lifeOf(t: number, i: number, count: number, life: number, seed: number) {
  const every = life; // one particle per slot, staggered over its life
  const offset = rand(seed, i, 99) * every;
  const age = t + offset;
  const n = Math.floor(age / every);
  return { n, u: (age - n * every) / life, bornAt: t - (age - n * every) };
}

// THINGS COME FROM THEIR SOURCE (Arthur, Oct 14: "the smoke needs to be forming from the fire, not from thin air — same problem
// as bubbles: from the little bubble stick"). Every EMITTED thing (smoke, steam, bubbles, sparks, spray, dust, breath fog) is
// BORN at its source as a small piece and grows / spreads out from there over its first moments — never appearing already big
// or already away from the source. `age` = seconds since this piece came out, `grow` = seconds it takes to reach full size.
// emerge → 0..1: its size share (starts at `small`) and how far it has spread from the source (starts at 0).
export function emerge(age: number, grow = 0.35, small = 0.2): { size: number; out: number } {
  const u = smooth(age / Math.max(0.01, grow));
  return { size: small + (1 - small) * u, out: u };
}
// …and the place it is at: from the source toward where it would be fully spread, by `out`.
export const fromSource = (src: { x: number; y: number }, at: { x: number; y: number }, out: number) => ({ x: lerp(src.x, at.x, out), y: lerp(src.y, at.y, out) });

// EMITTED THINGS LIVE IN THE WORLD (Arthur, Oct 14, the bubble wand: "when he moves his arm, the bubbles move with his arm. That's
// not possible. The bubbles just float away until they pop."): every emitted piece — a bubble, a bit of smoke, a spark, a drop of
// spray, a puff of dust or breath — is BORN where its source was AT ITS BIRTH (`born`, seconds since the effect started) and from
// then on moves on its own in the world (drift, rise, wind, gravity). Moving the source later never drags pieces already out.
// Recipes place a piece at sourceAt(ctx, born) + its own motion, never at ctx.at (the source NOW) + its motion.
export function sourceAt(ctx: { t: number; at: { x: number; y: number }; anchorAt?: (t: number) => { x: number; y: number } | undefined }, born: number): { x: number; y: number } {
  if (!ctx.anchorAt || !(born < ctx.t - 1e-6)) return ctx.at;
  return ctx.anchorAt(Math.max(0, born)) ?? ctx.at;
}

// …and SMOKE LEFT BEHIND A MOVING SOURCE IS STRETCHED THIN: a torch carried on a run lays its smoke out along its path, so the same
// smoke covers more length — thinner and paler, never a thick gray hose. Stretch (≥ 1) of what came out at `born`, for a plume
// whose own speed out of the source is `ownSpeed` px/s: √(1 + (source speed / own speed)²). A still source → 1.
export function stretchAt(ctx: Parameters<typeof sourceAt>[0], born: number, ownSpeed: number): number {
  if (!ctx.anchorAt) return 1;
  const dt = 0.06, a = sourceAt(ctx, born - dt), b = sourceAt(ctx, born);
  const v = Math.hypot(b.x - a.x, b.y - a.y) / dt;
  return Math.sqrt(1 + (v / Math.max(1, ownSpeed)) ** 2);
}
