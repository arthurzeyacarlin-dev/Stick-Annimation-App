// DEPTH — WHO IS IN FRONT (Arthur, Oct 14: "blue never visually goes behind red, so it doesn't look like he's spinning";
// walking past each other, a hug, hiding behind a bush). The figures of a picture are drawn in the order of the frame's
// list: first = farthest back. This step puts that list in DEPTH order, picture by picture:
// 1. SAID DEPTH: a figure whose keys carry `z` (the plan's `depth` on an action or on the figure: "behind" = -1, "front"
//    = +1, "around" = +1 with its far arm behind everyone — a hug's arm round the other's back) is ordered by it.
// 2. GOING AROUND / PASSING THROUGH (no depth said by either figure): two figures whose hips come close AND swap sides
//    (one walks past the other, one is swung round the other) cannot both be in front. While they overlap, the one moving
//    toward the RIGHT of the other is drawn BEHIND it, the one moving left in front — so a body swung round someone is behind
//    for one half of the circle and in front for the other half (the order switches at the sides, where it turns back),
//    and two walkers passing each other keep one clear order. Figures that only come close (a fight, a hug) and never
//    swap sides keep the plan's order.
import type { FrameObject } from "./engine.ts";
import type { FrameCharacter } from "./engine.ts";

// Close enough to count as overlapping (hip to hip, x the taller one's height).
const CLOSE = 0.6;
// Slower than this (x height a second, relative) the order is kept as it was.
const MOVING = 0.35;

const heightOf = (c: FrameCharacter) => Math.max(1, Math.hypot(c.skeleton.head.x - c.skeleton.hip.x, c.skeleton.head.y - c.skeleton.hip.y) / 0.55);

// `frames[i]` lists every figure (in the plan's order). The lists are NOT reordered (moves and laws read figures by their
// position); a picture whose drawing order differs from the list gets `draw` (0 = drawn first) on each of its figures —
// render.ts drawFrame draws in that order.
export function markDrawOrder(frames: FrameCharacter[][], fps: number): void {
  const ordered = orderByDepth(frames, fps);
  ordered.forEach((list, i) => {
    if (list.every((c, n) => c === frames[i][n])) return;
    list.forEach((c, n) => { c.draw = n; });
  });
}

// The pictures' figures in drawing order (new lists, the same objects).
export function orderByDepth(frames: FrameCharacter[][], fps: number): FrameCharacter[][] {
  if (!frames.length || frames[0].length < 2) return frames;
  const ids = frames[0].map((c) => c.id);
  const at = (i: number, id: string) => frames[i].find((c) => c.id === id);
  // behind[i] = pairs [back, front] decided by GOING AROUND for picture i.
  const behind: [string, string][][] = frames.map(() => []);
  for (let a = 0; a < ids.length; a += 1) for (let b = a + 1; b < ids.length; b += 1) {
    const A = ids[a], B = ids[b];
    const dx = frames.map((_, i) => { const p = at(i, A), q = at(i, B); return p && q && !p.offPage && !q.offPage ? p.skeleton.hip.x - q.skeleton.hip.x : NaN; });
    const said = frames.map((_, i) => (at(i, A)?.z ?? 0) !== 0 || (at(i, B)?.z ?? 0) !== 0);
    const size = (i: number) => Math.max(heightOf(at(i, A)!), heightOf(at(i, B)!));
    let i = 0;
    while (i < frames.length) {
      if (!(Math.abs(dx[i]) < CLOSE * size(i))) { i += 1; continue; }
      let j = i;
      while (j + 1 < frames.length && Math.abs(dx[j + 1]) < CLOSE * size(j + 1)) j += 1;
      // (A close run where they swap sides: the run reaches one frame past each end so a swap right at its edge counts.)
      const lo = Math.max(0, i - 1), hi = Math.min(frames.length - 1, j + 1);
      const signs = new Set(dx.slice(lo, hi + 1).filter((v) => Number.isFinite(v) && Math.abs(v) > 1).map(Math.sign));
      if (signs.size > 1) {
        let order = 0; // +1: A behind B, -1: B behind A, 0: plan order
        for (let k = i; k <= j; k += 1) {
          if (said[k]) continue;
          const k0 = Math.max(lo, k - 1), k1 = Math.min(hi, k + 1);
          const v = ((dx[k1] - dx[k0]) / Math.max(1, k1 - k0)) * fps;
          if (Number.isFinite(v) && Math.abs(v) > MOVING * size(k)) order = v > 0 ? 1 : -1;
          if (order !== 0) behind[k].push(order > 0 ? [A, B] : [B, A]);
        }
      }
      i = j + 1;
    }
  }
  return frames.map((list, i) => {
    // Said depth first (stable: equal z keeps the plan's order)…
    const out = list.map((c, n) => ({ c, n })).sort((p, q) => (p.c.z ?? 0) - (q.c.z ?? 0) || p.n - q.n).map((x) => x.c);
    // …then each going-around pair: the one behind moves to just before the other.
    for (const [back, front] of behind[i]) {
      const bi = out.findIndex((c) => c.id === back), fi = out.findIndex((c) => c.id === front);
      if (bi > fi && fi >= 0) { const [moved] = out.splice(bi, 1); out.splice(fi, 0, moved); }
    }
    return out;
  });
}

// The plan's depth words as a number (+ = nearer the camera).
export function depthValue(depth: unknown): number | undefined {
  if (typeof depth === "number" && Number.isFinite(depth)) return depth;
  if (depth === "behind" || depth === "back") return -1;
  if (depth === "front" || depth === "around") return 1;
  return undefined;
}

// A THROWN THING PASSES BEHIND, NEVER THROUGH (Arthur, Oct 14: "if he was trying to throw it somewhere else, it goes right behind
// him or right in front of him… the user sees it almost as three dimensions"). A loose thing (not near anyone's hands, so not
// being held, thrown or caught) that crosses a figure's body is drawn BEHIND that figure for those pictures — it goes past at
// another depth. (A shot thrown AT a figure hits it and bounces off instead: shotsHit in claude/claudeAnimator.ts.)
export function markObjectsBehind(frames: FrameCharacter[][], objects: FrameObject[][]): void {
  objects.forEach((list, i) => {
    const figs = frames[i] ?? [];
    list.forEach((o, k) => {
      const r = Math.max(4, (o.look.size ?? 30) / 2);
      const nearHands = figs.some((f) => { const H = f.headRadius * 8.5; return Math.min(Math.hypot(f.skeleton.lHand.x - o.x, f.skeleton.lHand.y - o.y), Math.hypot(f.skeleton.rHand.x - o.x, f.skeleton.rHand.y - o.y)) <= r + 0.1 * H; });
      if (nearHands) return;
      const crosses = figs.some((f) => {
        const s = f.skeleton, H = f.headRadius * 8.5;
        // (NEAR-SIDE LIMBS IN FRONT, Arthur Oct 15: a foot ON a thing — a ball under the foot, a ball being trapped or kicked —
        // is seen in front of it: a loose thing the feet touch is drawn behind the figure, never over the foot)
        const pts = [s.neck, s.hip, s.lKnee, s.rKnee, s.lFoot, s.rFoot, ...[0.33, 0.66].map((u) => ({ x: s.neck.x + (s.hip.x - s.neck.x) * u, y: s.neck.y + (s.hip.y - s.neck.y) * u }))];
        return pts.some((q) => Math.hypot(q.x - o.x, q.y - o.y) <= r + 0.03 * H) || Math.hypot(s.head.x - o.x, s.head.y - o.y) <= r + f.headRadius;
      });
      if (crosses) list[k] = { ...o, behind: true };
    });
  });
  // (NO FLICKER: a thing is behind or in front for at least 3 pictures — a 1–2 picture switch is smoothed away)
  const ids = new Set(objects.flatMap((l) => l.map((o) => o.id)));
  for (const id of ids) {
    const flag = objects.map((l) => l.find((o) => o.id === id)?.behind === true);
    const set = (i: number, v: boolean) => { const k = objects[i].findIndex((o) => o.id === id); if (k >= 0) objects[i][k] = { ...objects[i][k], behind: v }; };
    for (let i = 1; i < flag.length; i += 1) {
      if (flag[i] === flag[i - 1]) continue;
      let j = i; while (j < flag.length && flag[j] === flag[i]) j += 1;
      if (j - i < 3 && j < flag.length) { for (let k = i; k < j; k += 1) { flag[k] = flag[i - 1]; set(k, flag[i - 1]); } }
    }
  }
}
