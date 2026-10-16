import { JOINTS, type Skeleton } from "../rig.ts";

// NOBODY MOVES IN PERFECT SYNC (Arthur, Oct 14: "anyone that's in perfect sync is unnatural, period — walking, running, waving,
// pulling"). The law "inSync" looks at every two figures: over each quarter second, how every joint moved (relative to the hips,
// plus the hips themselves). When the two figures' joints move the SAME way (or the exact mirror of it — two figures facing each
// other), at the same moment and by the same amount, for longer than IN_SYNC_SEC, they are copies, not people.
// (A slap, a catch or a hit lined up to one moment is far shorter than a second, so it never counts.)
export const IN_SYNC_SEC = 1.0; // s: copying each other longer than this = in perfect sync
export const IN_SYNC_COS = 0.97; // how alike the two motions must be (1 = identical directions)
export const IN_SYNC_SIZE = 0.88; // ...and the same size (the smaller over the bigger)
const WINDOW_SEC = 0.25; // s: the motion is compared over this much time
const SHIFT_SEC = 0.15; // s: an in-place copy this much earlier or later still counts (same shape, nearly the same time)
const IN_PLACE = 0.03; // x height: hips moving less than this sideways over the window = a move done in place
const MOVING = 0.03; // x height: less motion than this over the window is standing still (two still figures are not "in sync")

type Frames = readonly (Skeleton | undefined)[];

// The motion of one figure from picture i-1 to i: every joint relative to the hips (x flipped when `mirror`), then the hips.
function step(f: Frames, i: number, mirror: boolean): number[] | null {
  const a = f[i - 1], b = f[i];
  if (!a || !b) return null;
  const sx = mirror ? -1 : 1, v: number[] = [];
  for (const j of JOINTS) {
    if (j === "hip") continue;
    v.push(sx * ((b[j].x - b.hip.x) - (a[j].x - a.hip.x)), (b[j].y - b.hip.y) - (a[j].y - a.hip.y));
  }
  v.push(sx * (b.hip.x - a.hip.x), b.hip.y - a.hip.y);
  return v;
}

// The longest time (s) the two figures move as copies, and when it starts.
export function inSyncSpan(a: Frames, b: Frames, fps: number, height: number): { seconds: number; at: number } {
  const n = Math.min(a.length, b.length), W = Math.max(2, Math.round(WINDOW_SEC * fps));
  const S = Math.round(SHIFT_SEC * fps);
  const sum = (f: Frames, i: number, mirror: boolean) => {
    let acc: number[] | null = null;
    for (let k = i - W + 1; k <= i; k += 1) {
      const v = k >= 1 ? step(f, k, mirror) : null;
      if (!v) return null;
      acc = acc ? acc.map((x, m) => x + v[m]) : v;
    }
    return acc;
  };
  const norm = (v: number[]) => Math.hypot(...v);
  let best = 0, bestAt = 0, run = 0, runAt = 0;
  for (let i = W; i < n; i += 1) {
    const va = sum(a, i, false);
    // (a moment where BOTH are still — the pause between two heaves, two steps — neither breaks nor starts a copy: two pullers
    // heaving as mirror copies with a still strain between the heaves are copying all along)
    let alike = false, bothStill = false;
    // (SAME SHAPE, NEARLY THE SAME TIME, Oct 15: a copy started a hair later — 0.1 s — is still a copy. Doing a move IN PLACE (a
    // cheer, a wave, a celebration: the hips stay), the other figure's motion is also compared a few pictures earlier and later;
    // travelling (a walk side by side) is compared at the same moment only — strides of the same walk always look alike.)
    const inPlace = (v: number[] | null) => !!v && Math.abs(v[v.length - 2]) < IN_PLACE * height;
    const shifts = inPlace(va) ? Array.from({ length: 2 * S + 1 }, (_, k) => k - S) : [0];
    if (va) for (const d of shifts) for (const mirror of [false, true]) {
      if (alike) break;
      if (i + d < W || i + d >= b.length) continue;
      const vb = sum(b, i + d, mirror);
      if (d !== 0 && !inPlace(vb)) continue;
      if (!vb) continue;
      const na = norm(va), nb = norm(vb);
      if (na < MOVING * height && nb < MOVING * height) { if (d === 0) bothStill = true; continue; }
      if (na < MOVING * height || nb < MOVING * height) continue;
      const cos = va.reduce((s, x, m) => s + x * vb[m], 0) / (na * nb);
      if (cos >= IN_SYNC_COS && Math.min(na, nb) / Math.max(na, nb) >= IN_SYNC_SIZE) { alike = true; break; }
    }
    if (alike || (bothStill && run > 0)) {
      if (run === 0) runAt = (i - W) / fps;
      run += 1;
      if (alike && run > best) { best = run; bestAt = runAt; }
    } else run = 0;
  }
  return { seconds: best / fps, at: bestAt };
}
