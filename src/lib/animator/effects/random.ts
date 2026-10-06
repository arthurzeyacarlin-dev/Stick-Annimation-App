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
