// SPEC-0017 "50-50" — the engine's EYES: small bitmap helpers (pure TS, no canvas) for reading a user's drawing.
// A Mask is a downscaled 0/1 ink picture; work pixel (x, y) is the picture pixel (ox + x*k + (k-1)/2, oy + ...).
import type { InkImage } from "./types.ts";

export type Mask = { w: number; h: number; m: Uint8Array; k: number; ox: number; oy: number };

// INK = a pixel the user drew: mostly opaque and not the white page (same rule as fromDrawing.lookFromPixels).
export const isInkAt = (d: ArrayLike<number>, i: number) => d[i + 3] > 100 && !(d[i] > 235 && d[i + 1] > 235 && d[i + 2] > 235);

// The ink of a picture, cut to its ink box and downscaled (any ink in a block = ink) so its longest side is <= maxSide.
export function inkMask(img: InkImage, maxSide = 200): Mask | null {
  const { width: W, height: H, data } = img;
  let x0 = W, y0 = H, x1 = -1, y1 = -1;
  for (let y = 0; y < H; y += 1) for (let x = 0; x < W; x += 1) if (isInkAt(data, (y * W + x) * 4)) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  if (x1 < 0) return null;
  const k = Math.max(1, Math.ceil(Math.max(x1 - x0 + 1, y1 - y0 + 1) / maxSide));
  const pad = 4;
  const w = Math.ceil((x1 - x0 + 1) / k) + 2 * pad, h = Math.ceil((y1 - y0 + 1) / k) + 2 * pad;
  const m = new Uint8Array(w * h);
  for (let y = y0; y <= y1; y += 1) for (let x = x0; x <= x1; x += 1) if (isInkAt(data, (y * W + x) * 4)) m[(pad + Math.floor((y - y0) / k)) * w + pad + Math.floor((x - x0) / k)] = 1;
  return { w, h, m, k, ox: x0 - pad * k, oy: y0 - pad * k };
}

// Grow the ink by r pixels (3x3 steps): closes small gaps in a scribbly line.
export function dilate(m: Uint8Array, w: number, h: number, r: number): Uint8Array {
  let cur = m;
  for (let s = 0; s < r; s += 1) {
    const out = new Uint8Array(cur);
    for (let y = 1; y < h - 1; y += 1) for (let x = 1; x < w - 1; x += 1) {
      const i = y * w + x;
      if (!cur[i] && (cur[i - 1] || cur[i + 1] || cur[i - w] || cur[i + w] || cur[i - w - 1] || cur[i - w + 1] || cur[i + w - 1] || cur[i + w + 1])) out[i] = 1;
    }
    cur = out;
  }
  return cur;
}

// Distance (px, chamfer 3-4) from each pixel whose value is `inside` to the nearest pixel that is not; others 0.
export function distanceInside(m: Uint8Array, w: number, h: number, inside: 0 | 1): Float32Array {
  const d = new Float32Array(w * h);
  const BIG = 1e9;
  for (let i = 0; i < w * h; i += 1) d[i] = m[i] === inside ? BIG : 0;
  for (let y = 0; y < h; y += 1) for (let x = 0; x < w; x += 1) {
    const i = y * w + x;
    if (!d[i]) continue;
    let v = d[i];
    if (x > 0) v = Math.min(v, d[i - 1] + 3);
    if (y > 0) { v = Math.min(v, d[i - w] + 3); if (x > 0) v = Math.min(v, d[i - w - 1] + 4); if (x < w - 1) v = Math.min(v, d[i - w + 1] + 4); }
    d[i] = v;
  }
  for (let y = h - 1; y >= 0; y -= 1) for (let x = w - 1; x >= 0; x -= 1) {
    const i = y * w + x;
    if (!d[i]) continue;
    let v = d[i];
    if (x < w - 1) v = Math.min(v, d[i + 1] + 3);
    if (y < h - 1) { v = Math.min(v, d[i + w] + 3); if (x < w - 1) v = Math.min(v, d[i + w + 1] + 4); if (x > 0) v = Math.min(v, d[i + w - 1] + 4); }
    d[i] = v;
  }
  for (let i = 0; i < w * h; i += 1) d[i] = d[i] >= BIG ? 0 : d[i] / 3;
  return d;
}

export type Component = { pixels: number[]; border: boolean };
// Connected pieces of the pixels equal to `value` (4- or 8-neighbours).
export function components(m: Uint8Array, w: number, h: number, value: 0 | 1, eight: boolean): { lab: Int32Array; comps: Component[] } {
  const lab = new Int32Array(w * h).fill(-1);
  const comps: Component[] = [];
  const stack: number[] = [];
  for (let s = 0; s < w * h; s += 1) {
    if (m[s] !== value || lab[s] >= 0) continue;
    const id = comps.length, c: Component = { pixels: [], border: false };
    comps.push(c);
    lab[s] = id; stack.push(s);
    while (stack.length) {
      const i = stack.pop()!, x = i % w, y = (i - x) / w;
      c.pixels.push(i);
      if (x === 0 || y === 0 || x === w - 1 || y === h - 1) { c.border = true; continue; }
      const nb = eight ? [i - 1, i + 1, i - w, i + w, i - w - 1, i - w + 1, i + w - 1, i + w + 1] : [i - 1, i + 1, i - w, i + w];
      for (const j of nb) if (m[j] === value && lab[j] < 0) { lab[j] = id; stack.push(j); }
    }
  }
  return { lab, comps };
}

// Zhang-Suen thinning (in place): every stroke becomes a 1-px centre line, keeping its shape and connections.
export function thin(m: Uint8Array, w: number, h: number) {
  const del: number[] = [];
  for (let changed = true; changed;) {
    changed = false;
    for (let step = 0; step < 2; step += 1) {
      del.length = 0;
      for (let y = 1; y < h - 1; y += 1) for (let x = 1; x < w - 1; x += 1) {
        const i = y * w + x;
        if (!m[i]) continue;
        const p2 = m[i - w], p3 = m[i - w + 1], p4 = m[i + 1], p5 = m[i + w + 1], p6 = m[i + w], p7 = m[i + w - 1], p8 = m[i - 1], p9 = m[i - w - 1];
        const b = p2 + p3 + p4 + p5 + p6 + p7 + p8 + p9;
        if (b < 2 || b > 6) continue;
        const a = (+(!p2 && !!p3)) + (+(!p3 && !!p4)) + (+(!p4 && !!p5)) + (+(!p5 && !!p6)) + (+(!p6 && !!p7)) + (+(!p7 && !!p8)) + (+(!p8 && !!p9)) + (+(!p9 && !!p2));
        if (a !== 1) continue;
        if (step === 0 ? (p2 && p4 && p6) || (p4 && p6 && p8) : (p2 && p4 && p8) || (p2 && p6 && p8)) continue;
        del.push(i);
      }
      for (const i of del) m[i] = 0;
      if (del.length) changed = true;
    }
  }
}

// Shortest paths through the ink from one pixel (8-neighbours; a step costs 5, a diagonal 7 -> px = cost / 5).
export function geodesic(m: Uint8Array, w: number, src: number): { dist: Int32Array; parent: Int32Array; order: number[] } {
  const dist = new Int32Array(m.length).fill(-1), parent = new Int32Array(m.length).fill(-1), done = new Uint8Array(m.length);
  const buckets: number[][] = [[src]];
  dist[src] = 0;
  const order: number[] = [];
  for (let c = 0; c < buckets.length; c += 1) {
    const b = buckets[c];
    if (!b) continue;
    for (const i of b) {
      if (done[i] || dist[i] !== c) continue;
      done[i] = 1; order.push(i);
      for (const [j, cost] of [[i - 1, 5], [i + 1, 5], [i - w, 5], [i + w, 5], [i - w - 1, 7], [i - w + 1, 7], [i + w - 1, 7], [i + w + 1, 7]] as const) {
        if (j < 0 || j >= m.length || !m[j] || done[j]) continue;
        const nd = c + cost;
        if (dist[j] < 0 || nd < dist[j]) { dist[j] = nd; parent[j] = i; (buckets[nd] ??= []).push(j); }
      }
    }
  }
  return { dist, parent, order };
}
