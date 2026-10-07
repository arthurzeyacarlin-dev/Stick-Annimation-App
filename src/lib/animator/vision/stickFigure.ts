// SPEC-0017 "50-50" — the engine FINDS a drawn stick figure by itself (Arthur, 2026-10-07: "no more asking
// questions"). How a person reads one: "the biggest body part is the head, which is a circle; the arms come out under
// the head; the spine goes down the middle, and then it splits into two because of the legs."
// 1. Ink (downscaled, small gaps closed). 2. HEAD = the best roundish hole (a hollow head) or a thick round blob (a
// filled head). 3. Body = the ink without the head, thinned to centre lines. 4. From where the body touches the head,
// the far ends of the lines are the hands and feet: the two ends whose paths split LATEST are the legs (they split at
// the hip); the others are arms (they leave the spine near the top = the neck). Elbow/knee = the limb's bend (its
// point furthest from the straight line), else its middle. 5. The look comes from the pixels (lookFromPixels).
import { lookFromPixels, type DrawnLook, type JointPick } from "../moves/fromDrawing.ts";
import { PROPORTIONS, type Point } from "../rig.ts";
import { components, dilate, distanceInside, geodesic, inkMask, thin, type Mask } from "./ink.ts";
import type { FoundFigure, InkImage } from "./types.ts";

type P = { x: number; y: number };
type Head = { c: P; r: number; rRemove: number; filled: boolean; round: number; otherRings: number };
const hyp = (a: P, b: P) => Math.hypot(a.x - b.x, a.y - b.y);
const median = (v: number[]) => { const s = v.filter(Number.isFinite).sort((a, b) => a - b); if (!s.length) return NaN; const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

export function findStickFigure(img: InkImage): FoundFigure | null {
  const base = inkMask(img);
  if (!base) return null;
  // (Small gaps first closed by 1 px; a gappier drawing gets a second look with 2 px.)
  const first = readAt(img, base, 1);
  if (first && first.confidence >= 0.5) return first;
  const second = readAt(img, base, 2);
  let best = !first ? second : second && second.confidence > first.confidence ? second : first;
  // (A heavy or scribbled pen can fill a small head's hole once the ink is grown: also look at the ink as drawn.)
  if (!best || best.confidence < 0.5) { const raw = readAt(img, base, 0); if (raw && (!best || raw.confidence > best.confidence)) best = raw; }
  // HOLLOW OR FILLED from the head's inside: lines crossing a hollow head (an arm straight up through it + a diagonal)
  // can fill its inside once the ink is grown — if the ink as drawn shows an empty inside, the head is hollow.
  if (best && best.look.headFilled) { const raw = readAt(img, base, 0); if (raw && !raw.look.headFilled && raw.confidence >= 0.3) best = { ...best, look: { ...best.look, headFilled: false, headRadius: raw.look.headRadius } }; }
  return best;
}

function findHead(m: Uint8Array, w: number, h: number, inkDT: Float32Array, hw: number): Head | null {
  // Hollow: roundish enclosed holes (area close to a disc of the hole's inner radius, not long and thin).
  const bgDT = distanceInside(m, w, h, 0);
  const holes = components(m, w, h, 0, false).comps.filter((c) => !c.border && c.pixels.length >= 8).map((c) => {
    let sx = 0, sy = 0, inner = 0, minX = w, maxX = 0, minY = h, maxY = 0;
    for (const i of c.pixels) { const x = i % w, y = (i - x) / w; sx += x; sy += y; inner = Math.max(inner, bgDT[i]); if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; }
    const n = c.pixels.length, re = Math.sqrt(n / Math.PI);
    const bw = maxX - minX + 1, bh = maxY - minY + 1;
    return { c: { x: sx / n, y: sy / n }, re, circ: n / (Math.PI * inner * inner), aspect: Math.max(bw, bh) / Math.min(bw, bh), pixels: c.pixels, inner };
  });
  // A HEAD CUT BY A LINE (an arm drawn across a square or round head, a spine poking through): its holes are split
  // by single lines. Holes only one line apart are also read as ONE hole (closing the gap between them) — any closed
  // loop is a head candidate (round, square, triangle, lopsided), measured as a whole.
  const hm = new Uint8Array(w * h);
  for (const o of holes) for (const i of o.pixels) hm[i] = 1;
  if (holes.length >= 2) {
    const r = hw + 1.5, out = distanceInside(hm, w, h, 0), dil = new Uint8Array(w * h);
    for (let i = 0; i < w * h; i += 1) dil[i] = hm[i] || (out[i] > 0 && out[i] <= r) ? 1 : 0;
    const back = distanceInside(dil, w, h, 1), closed = new Uint8Array(w * h);
    for (let i = 0; i < w * h; i += 1) closed[i] = hm[i] || back[i] > r ? 1 : 0;
    const cDT = distanceInside(closed, w, h, 1);
    const cl = components(closed, w, h, 1, false), single = holes.length;
    cl.comps.forEach((c, id) => {
      const members = holes.slice(0, single).filter((o) => cl.lab[o.pixels[0]] === id);
      if (members.length < 2 || c.border) return;
      let sx = 0, sy = 0, inner = 0, minX = w, maxX = 0, minY = h, maxY = 0;
      for (const i of c.pixels) { const x = i % w, y = (i - x) / w; sx += x; sy += y; inner = Math.max(inner, cDT[i]); if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; }
      const n = c.pixels.length, bw = maxX - minX + 1, bh = maxY - minY + 1;
      holes.push({ c: { x: sx / n, y: sy / n }, re: Math.sqrt(n / Math.PI), circ: n / (Math.PI * inner * inner), aspect: Math.max(bw, bh) / Math.min(bw, bh), pixels: c.pixels, inner });
    });
  }
  const round = holes.filter((o) => o.inner >= 1.5 && o.circ <= 1.9 && o.aspect <= 1.8);
  let hollow: Head | null = null;
  if (round.length) {
    const biggest = Math.max(...round.map((o) => o.re));
    const best = round.filter((o) => o.re >= 0.6 * biggest).sort((a, b) => a.c.y - b.c.y)[0];
    // (A head drawn two or three times makes extra little holes around the main one: they are head too.)
    // (Only holes lying wholly inside a slightly bigger circle: a gap between a raised arm and the head is not head.)
    const reach = (o: { pixels: number[] }) => Math.max(...o.pixels.map((i) => { const x = i % w, y = (i - x) / w; return Math.hypot(x - best.c.x, y - best.c.y); }));
    let far = reach(best);
    for (const o of holes) if (o !== best && hyp(o.c, best.c) < best.re * 1.3 + 2 * hw) { const r = reach(o); if (r <= best.re * 1.35 + 2 * hw) far = Math.max(far, r); }
    hollow = { c: best.c, r: best.re + hw, rRemove: far + 2 * hw + 0.5, filled: false, round: clamp01(1.6 - 0.5 * best.circ), otherRings: 0 };
  }
  // Filled: the thickest ink, well beyond the line's half-width.
  let bi = 0;
  for (let i = 0; i < inkDT.length; i += 1) if (inkDT[i] > inkDT[bi]) bi = i;
  const R = inkDT[bi];
  // (Many big round loops away from the head = a cloud or a scribble, not a body.)
  const headAt = hollow?.c;
  const others = round.filter((o) => o.re >= 2.5 && (!headAt || hyp(o.c, headAt) > o.re + (hollow?.r ?? 0) + 2 * hw)).length;
  if (hollow) hollow.otherRings = others;
  // HOLLOW OR FILLED is decided by the head's INSIDE, never by one thick spot: a loop whose inside is mostly empty is a
  // hollow head even when a line or two cross it (the thick spot where lines cross is not a filled head).
  const bxy = { x: bi % w, y: (bi - (bi % w)) / w };
  const empty = holes.filter((o) => o.inner >= 1.5 && o.re >= 0.35 * R && hyp(o.c, bxy) <= 1.6 * o.re + R + 2 * hw).sort((a, b) => b.re - a.re)[0];
  if (!hollow && empty && R >= Math.max(2.5, 1.9 * hw)) hollow = { c: empty.c, r: empty.re + hw, rRemove: Math.max(...empty.pixels.map((i) => hyp({ x: i % w, y: (i - (i % w)) / w }, empty.c))) + 2 * hw + 0.5, filled: false, round: clamp01(1.6 - 0.5 * Math.min(empty.circ, 2.4)), otherRings: others };
  const onLoop = !!hollow && hyp(bxy, hollow.c) <= hollow.rRemove + R;
  if (R >= Math.max(2.5, 1.9 * hw) && (!hollow || R >= 0.7 * hollow.r) && !empty && !onLoop) {
    const bx = bi % w, by = (bi - bx) / w;
    // Its middle: the centre of its thick core (a scribbled blob is not a perfect disc).
    let sx = 0, sy = 0, n = 0, far = 0;
    const core = 0.6 * R;
    for (let y = Math.max(0, Math.floor(by - 2 * R)); y <= Math.min(h - 1, by + 2 * R); y += 1) for (let x = Math.max(0, Math.floor(bx - 2 * R)); x <= Math.min(w - 1, bx + 2 * R); x += 1) {
      if (inkDT[y * w + x] >= core && Math.hypot(x - bx, y - by) < 1.5 * R) { sx += x; sy += y; n += 1; far = Math.max(far, Math.hypot(x - bx, y - by)); }
    }
    const c = n ? { x: sx / n, y: sy / n } : { x: bx, y: by };
    return { c, r: R, rRemove: far + core + 1, filled: true, round: 1, otherRings: others };
  }
  return hollow;
}

type Limb = { root: P; path: P[] }; // path from the root's end to the hand/foot (work px)

function readAt(img: InkImage, base: Mask, grow: number): FoundFigure | null {
  const { w, h, k } = base;
  const m = dilate(base.m, w, h, grow);
  const inkDT = distanceInside(m, w, h, 1);
  const inkVals: number[] = [];
  for (let i = 0; i < m.length; i += 1) if (m[i]) inkVals.push(inkDT[i]);
  if (inkVals.length < 20) return null;
  const hw = Math.max(1, 2 * median(inkVals) - 0.5); // the line's half-width
  const head = findHead(m, w, h, inkDT, hw);
  if (!head) return null;

  // The body: the ink without the head, its main piece (the biggest piece touching the head), small holes filled.
  const body = new Uint8Array(m);
  for (let i = 0; i < m.length; i += 1) if (m[i]) { const x = i % w, y = (i - x) / w; if (Math.hypot(x - head.c.x, y - head.c.y) <= head.rRemove) body[i] = 0; }
  const pieces = components(body, w, h, 1, true).comps;
  const near = (c: { pixels: number[] }) => Math.min(...c.pixels.map((i) => { const x = i % w, y = (i - x) / w; return Math.hypot(x - head.c.x, y - head.c.y); }));
  const touching = pieces.filter((c) => c.pixels.length >= 10 && near(c) <= head.rRemove * 1.6 + 2 * hw + 3);
  const main = (touching.length ? touching : pieces).sort((a, b) => b.pixels.length - a.pixels.length)[0];
  if (!main || main.pixels.length < 20) return null;
  const sk = new Uint8Array(m.length);
  for (const i of main.pixels) sk[i] = 1;
  // THE TOP OF THE SPINE: the body point nearest the head on the BODY's side of it (toward the body's middle), so an
  // arm raised beside the head is never taken for the neck.
  let cx = 0, cy = 0;
  for (const i of main.pixels) { cx += i % w; cy += Math.floor(i / w); }
  const uL = Math.hypot(cx / main.pixels.length - head.c.x, cy / main.pixels.length - head.c.y) || 1;
  const u = { x: (cx / main.pixels.length - head.c.x) / uL, y: (cy / main.pixels.length - head.c.y) / uL };
  const topCost = (i: number) => { const x = i % w, y = (i - x) / w, dx = x - head.c.x, dy = y - head.c.y; return Math.hypot(dx, dy) - 0.6 * (dx * u.x + dy * u.y); };
  let top = main.pixels[0];
  for (const i of main.pixels) if (topCost(i) < topCost(top)) top = i;
  // ARMS DRAWN ACROSS THE HEAD: taking the head away cuts them; a cut piece beside the head is an arm, and arms come
  // out at the neck — it is joined back to the top of the spine.
  for (const piece of pieces) {
    if (piece === main || piece.pixels.length < 10 || near(piece) > head.rRemove + 2 * hw + 3) continue;
    let a = piece.pixels[0], bd = Infinity;
    for (const i of piece.pixels) { const d = Math.hypot((i % w) - (top % w), Math.floor(i / w) - Math.floor(top / w)); if (d < bd) { bd = d; a = i; } }
    if (bd > 2 * head.rRemove + 2 * hw) continue;
    for (const i of piece.pixels) sk[i] = 1;
    const ax = a % w, ay = Math.floor(a / w), bx = top % w, by = Math.floor(top / w), steps = Math.ceil(bd * 2) + 1, rr = Math.max(1, Math.floor(hw));
    for (let n = 0; n <= steps; n += 1) { const x = Math.round(ax + (bx - ax) * n / steps), y = Math.round(ay + (by - ay) * n / steps); for (let dy = -rr; dy <= rr; dy += 1) for (let dx = -rr; dx <= rr; dx += 1) sk[(y + dy) * w + x + dx] = 1; }
  }
  for (const hole of components(sk, w, h, 0, false).comps) if (!hole.border && hole.pixels.length <= Math.max(12, 6 * hw * hw)) for (const i of hole.pixels) sk[i] = 1;
  thin(sk, w, h);
  let minX = w, maxX = 0, minY = h, maxY = 0;
  for (const i of main.pixels) { const x = i % w, y = (i - x) / w; if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; }
  const size = Math.max(maxX - minX, maxY - minY, 1);

  // Where the body touches the head: the line pixel nearest the head's middle.
  let t = -1, tBest = Infinity;
  for (let i = 0; i < sk.length; i += 1) if (sk[i]) { const d = Math.hypot((i % w) - (top % w), Math.floor(i / w) - Math.floor(top / w)); if (d < tBest) { tBest = d; t = i; } }
  if (t < 0) return null;
  const { dist, parent, order } = geodesic(sk, w, t);
  const at = (i: number): P => { const x = i % w; return { x, y: (i - x) / w }; };

  // The far ends: each time, the line pixel furthest from everything found so far (a branch), until branches are short.
  const inTree = new Uint8Array(sk.length); inTree[t] = 1;
  const anc = new Int32Array(sk.length);
  const ends: { e: number; len: number }[] = [];
  const minLen = Math.max(3 * hw, 0.1 * size) * 5;
  for (let n = 0; n < 8; n += 1) {
    let best = -1, bestLen = 0;
    for (const i of order) { anc[i] = inTree[i] ? i : anc[parent[i]]; const len = dist[i] - dist[anc[i]]; if (len > bestLen) { bestLen = len; best = i; } }
    if (best < 0 || bestLen < minLen) break;
    for (let i = best; !inTree[i]; i = parent[i]) inTree[i] = 1;
    ends.push({ e: best, len: bestLen });
  }
  if (ends.length < 2) return null;
  const pathUp = (i: number) => { const out: number[] = []; for (let j = i; j >= 0; j = parent[j]) out.push(j); return out; }; // end -> t
  const lca = (a: number, b: number) => { const seen = new Set(pathUp(a)); for (let j = b; j >= 0; j = parent[j]) if (seen.has(j)) return j; return t; };

  // LEGS: the two ends whose paths split latest (at the hip), both long enough.
  let legs: [number, number] | null = null, hipPix = t, hipDepth = -1, legScore = -1;
  const farthest = [...ends].sort((p, q) => dist[q.e] - dist[p.e])[0].e;
  for (let a = 0; a < ends.length; a += 1) for (let b = a + 1; b < ends.length; b += 1) {
    const l = lca(ends[a].e, ends[b].e), la = dist[ends[a].e] - dist[l], lb = dist[ends[b].e] - dist[l];
    if (Math.min(la, lb) < 0.45 * Math.max(la, lb) || Math.min(la, lb) < 0.15 * size * 5) continue;
    // (The legs are the pair whose ends are BOTH furthest from the head: torso + leg beats any arm. The end furthest
    // of all is always a foot: two arms close together never count as the legs.)
    if (ends[a].e !== farthest && ends[b].e !== farthest) continue;
    const score = Math.min(dist[ends[a].e], dist[ends[b].e]);
    if (score > legScore) { legScore = score; hipDepth = dist[l]; hipPix = l; legs = [ends[a].e, ends[b].e]; }
  }
  let legsOverlap = false;
  // (Paths that part right at the top are arms, not legs: then both legs were drawn over each other.)
  if (legs && hipDepth < 0.12 * size * 5) legs = null;
  if (!legs) {
    // (Both legs drawn over each other: one long line down = both legs; the hip goes by proportions below.)
    const far = [...ends].sort((a, b) => dist[b.e] - dist[a.e])[0];
    legs = [far.e, far.e]; hipPix = far.e; hipDepth = dist[far.e]; legsOverlap = true;
  }
  // ARMS: the longest other branches that leave the spine above the hip.
  const spine = new Set(pathUp(hipPix));
  const arms = ends.filter((o) => !legs!.includes(o.e)).map((o) => { let j = o.e; while (!spine.has(j)) j = parent[j]; return { e: o.e, junction: j, len: dist[o.e] - dist[j] }; })
    .filter((o) => dist[o.junction] < hipDepth && o.len >= 0.12 * size * 5).sort((a, b) => b.len - a.len).slice(0, 2);
  // NECK: where the arms leave the spine (the highest such point); arms merged with the body far down = no neck line.
  let neckPix = t;
  if (arms.length) {
    const j = arms.map((o) => o.junction).sort((a, b) => dist[a] - dist[b])[0];
    // (A neck line is short: arms that leave the spine further down are arms drawn along the body; the neck is then
    // where the body meets the head, never far below it.)
    // (A real neck line is ONE line: if the ink between the head and the arms is wider than a single line, the arms
    // run along it from the head down — no neck line.)
    const stretch = pathUp(j).filter((i) => dist[i] > 0.25 * dist[j] && dist[i] < 0.75 * dist[j]).map((i) => inkDT[i]);
    const single: number[] = [];
    for (let i = 0; i < sk.length; i += 1) if (sk[i]) single.push(inkDT[i]);
    const oneLine = !stretch.length || median(stretch) < median(single) + 0.75;
    if (oneLine && dist[j] <= Math.min(0.35 * hipDepth, 0.135 * Math.max(dist[legs[0]], dist[legs[1]]))) neckPix = j;
  }
  // LEGS DRAWN OVER EACH OTHER (a side view standing): the lines only part near the feet, so the split is far too low.
  // Then the hip goes where a body's proportions put it (legs ~1.5x the torso, measured along the lines).
  const legLen = (dist[legs[0]] + dist[legs[1]]) / 2 - dist[hipPix], torsoLen = dist[hipPix] - dist[neckPix];
  const legShare = (PROPORTIONS.thigh + PROPORTIONS.shin) / PROPORTIONS.torso;
  let hipMoved = false;
  if (legsOverlap || legLen < 0.9 * torsoLen) {
    const goal = dist[neckPix] + (torsoLen + legLen) / (1 + legShare);
    for (let j = hipPix; j >= 0 && dist[j] >= goal; j = parent[j]) hipPix = j;
    hipMoved = true;
  }
  // ARMS IN A NARROW V with the body: the neck is where the upper arms' lines meet the spine's line (only up the spine).
  let neckAt: P = at(neckPix);
  const lineOf = (pts: P[], from: number, to: number) => { const a = pts[Math.floor(pts.length * from)], b = pts[Math.min(pts.length - 1, Math.ceil(pts.length * to))]; return a && b && hyp(a, b) > 2 ? [a, b] as const : null; };
  const cross = (a: readonly [P, P], b: readonly [P, P]) => {
    const d1 = { x: a[1].x - a[0].x, y: a[1].y - a[0].y }, d2 = { x: b[1].x - b[0].x, y: b[1].y - b[0].y };
    const den = d1.x * d2.y - d1.y * d2.x, sin = Math.abs(den) / (Math.hypot(d1.x, d1.y) * Math.hypot(d2.x, d2.y));
    if (sin < 0.06) return null;
    const u = ((b[0].x - a[0].x) * d2.y - (b[0].y - a[0].y) * d2.x) / den;
    return { x: a[0].x + d1.x * u, y: a[0].y + d1.y * u };
  };
  if (neckPix !== t && arms.length) {
    const spinePts = pathUp(hipPix).reverse().filter((i) => dist[i] >= dist[neckPix]).map(at);
    const sl = lineOf(spinePts, 0.1, 0.9);
    const tops = sl ? arms.map((o) => { const p = pathUp(o.e).reverse(); const own = p.slice(p.indexOf(o.junction)).map(at); return lineOf(own, 0.1, 0.4); }).filter((v): v is readonly [P, P] => !!v).map((l) => cross(sl, l)).filter((q): q is P => !!q && hyp(q, at(t)) <= hyp(at(t), neckAt) + 2 && hyp(q, neckAt) <= hyp(at(t), neckAt) + 2) : [];
    if (tops.length) neckAt = { x: tops.reduce((v, q) => v + q.x, 0) / tops.length, y: tops.reduce((v, q) => v + q.y, 0) / tops.length };
    if (hyp(neckAt, at(t)) < 0.5 * hw + 0.02 * size) neckPix = t;
  }
  // With no neck line, the neck is where the body meets the head's edge.
  const neck = neckPix === t ? (() => { const q = at(t), L = hyp(q, head.c) || 1, r = Math.min(L, head.filled ? head.r : head.r + hw); return { x: head.c.x + (q.x - head.c.x) * r / L, y: head.c.y + (q.y - head.c.y) * r / L }; })() : neckAt;
  let hip = at(hipPix);
  // SIZE IS KEPT (Arthur, round 3: "twice as big stays twice as big; tiny stays tiny"): thinning a line eats its
  // ends, so a foot is read short. A FOOT goes on along its leg's line to where the ink really ends, less the line's
  // half-width (the pen's round cap). (Not a hand: an arm hanging along the body would run on into the body's ink.)
  const reach = (l: Limb): Limb => {
    const path = l.path, tip = path[path.length - 1], back = path[Math.max(0, path.length - 1 - Math.max(3, Math.round(2 * hw)))];
    const L = hyp(tip, back);
    if (!(L > 0.5)) return l;
    const d = { x: (tip.x - back.x) / L, y: (tip.y - back.y) / L };
    let out = 0;
    for (let s = 0.5; s <= 3 * hw + 3; s += 0.5) {
      const x = Math.round(tip.x + d.x * s), y = Math.round(tip.y + d.y * s);
      if (x < 0 || y < 0 || x >= w || y >= h || !m[y * w + x]) break;
      out = s;
    }
    const go = out + 0.5 - hw;
    return go > 0.5 ? { ...l, path: [...path, { x: tip.x + d.x * go, y: tip.y + d.y * go }] } : l;
  };
  const limb = (e: number, root: P, stop: number): Limb => { const p = pathUp(e); const cut = p.indexOf(stop); return { root, path: (cut >= 0 ? p.slice(0, cut + 1) : p).reverse().map(at) }; };
  const bend = (l: Limb, share: number): P => {
    const end = l.path[l.path.length - 1], L = hyp(l.root, end) || 1;
    let best = l.path[0], dev = 0;
    for (const q of l.path) { const d = Math.abs((end.x - l.root.x) * (l.root.y - q.y) - (l.root.x - q.x) * (end.y - l.root.y)) / L; if (d > dev) { dev = d; best = q; } }
    if (dev >= 0.04 * size) return best;
    // (A straight limb: its point the right share of the way along.)
    const lens = [0]; const pts = [l.root, ...l.path];
    for (let i = 1; i < pts.length; i += 1) lens.push(lens[i - 1] + hyp(pts[i - 1], pts[i]));
    const goal = lens[lens.length - 1] * share;
    const i = lens.findIndex((v) => v >= goal);
    return pts[Math.max(0, i)];
  };
  const armShare = PROPORTIONS.upperArm / (PROPORTIONS.upperArm + PROPORTIONS.forearm);
  let legL = reach(limb(legs[0], hip, hipPix)), legR = reach(limb(legs[1], hip, hipPix));
  // LEGS IN A NARROW V: thick lines merge below the real hip; the hip is where the two thighs' lines meet.
  if (!hipMoved) {
    const fit = (l: Limb) => { const k0 = l.path.indexOf(bend(l, 0.5)); const seg = l.path.slice(Math.floor(k0 * 0.15), Math.max(2, Math.ceil(k0 * 0.85))); return seg.length >= 2 ? [seg[0], seg[seg.length - 1]] as const : null; };
    const a = fit(legL), b = fit(legR);
    if (a && b) {
      const d1 = { x: a[1].x - a[0].x, y: a[1].y - a[0].y }, d2 = { x: b[1].x - b[0].x, y: b[1].y - b[0].y };
      const den = d1.x * d2.y - d1.y * d2.x;
      if (Math.abs(den) > 1e-6) {
        const u = ((b[0].x - a[0].x) * d2.y - (b[0].y - a[0].y) * d2.x) / den;
        const x = { x: a[0].x + d1.x * u, y: a[0].y + d1.y * u };
        // (Only up the spine toward the neck, and not far.)
        if (hyp(x, hip) < 0.25 * size && hyp(x, neck) < hyp(hip, neck)) { hip = x; legL = { ...legL, root: x }; legR = { ...legR, root: x }; }
      }
    }
  }
  const armLimbs = arms.map((o) => limb(o.e, neck, o.junction));
  let confidence = 1;
  const armJoints = armLimbs.map((l) => ({ elbow: bend(l, armShare), hand: l.path[l.path.length - 1] }));
  if (legsOverlap) confidence *= 0.85;
  // One arm seen: the other is hidden along the body — it hangs next to the spine.
  if (armJoints.length === 1) { const d = { x: hip.x - neck.x, y: hip.y - neck.y }; armJoints.push({ elbow: { x: neck.x + d.x * 0.53, y: neck.y + d.y * 0.53 }, hand: { x: neck.x + d.x * 1.03, y: neck.y + d.y * 1.03 } }); confidence *= 0.85; }
  if (armJoints.length === 0) { confidence *= 0.6; const d = { x: hip.x - neck.x, y: hip.y - neck.y }; armJoints.push(...[0, 1].map(() => ({ elbow: { x: neck.x + d.x * 0.53, y: neck.y + d.y * 0.53 }, hand: { x: neck.x + d.x * 1.03, y: neck.y + d.y * 1.03 } }))); }
  const work: Record<JointPick, P> = {
    head: head.c, neck, hip,
    lElbow: armJoints[0].elbow, lHand: armJoints[0].hand, rElbow: armJoints[1].elbow, rHand: armJoints[1].hand,
    lKnee: bend(legL, 0.5), lFoot: legL.path[legL.path.length - 1], rKnee: bend(legR, 0.5), rFoot: legR.path[legR.path.length - 1],
  };

  // How stick-figure-like it is.
  confidence *= head.round;
  if (head.otherRings >= 2) confidence *= 0.5;
  // (A stick figure has 4-5 line ends; a tangle of many long ends is a scribble, not a body.)
  if (ends.length >= 7) confidence *= 0.6;
  const shares: [JointPick, JointPick, number][] = [["hip", "neck", PROPORTIONS.torso], ["neck", "lElbow", PROPORTIONS.upperArm], ["lElbow", "lHand", PROPORTIONS.forearm], ["neck", "rElbow", PROPORTIONS.upperArm], ["rElbow", "rHand", PROPORTIONS.forearm], ["hip", "lKnee", PROPORTIONS.thigh], ["lKnee", "lFoot", PROPORTIONS.shin], ["hip", "rKnee", PROPORTIONS.thigh], ["rKnee", "rFoot", PROPORTIONS.shin]];
  const heights = shares.map(([a, b, s]) => hyp(work[a], work[b]) / s).filter((v) => v > 1);
  const H = median(heights);
  const spread = median(heights.map((v) => Math.abs(v - H) / H));
  confidence *= clamp01(1.25 - spread * 1.5);
  const legSpread = median([hyp(hip, work.lFoot), hyp(hip, work.rFoot)]) / (H * (PROPORTIONS.thigh + PROPORTIONS.shin));
  if (legSpread < 0.5 || legSpread > 1.8) confidence *= 0.5;
  if (!(work.lFoot.y > hip.y - 0.1 * H && work.rFoot.y > hip.y - 0.1 * H)) confidence *= 0.7;
  if (!(head.c.y < neck.y)) confidence *= 0.7;
  const headShare = head.r / H;
  if (headShare < 0.03 || headShare > 0.16) confidence *= 0.5;
  // What share of the ink the figure explains (bones and head, within a few px).
  const tol = 2 * hw + 2;
  const bones: [P, P][] = shares.map(([a, b]) => [work[a], work[b]]);
  let inkN = 0, okN = 0;
  for (let i = 0; i < m.length; i += 1) {
    if (!base.m[i]) continue;
    inkN += 1;
    const q = at(i);
    const dh = hyp(q, head.c);
    if (head.filled ? dh <= head.rRemove + tol : Math.abs(dh - head.r) <= tol + hw || dh <= head.rRemove) { okN += 1; continue; }
    for (const [a, b] of bones) {
      const vx = b.x - a.x, vy = b.y - a.y, L2 = vx * vx + vy * vy || 1;
      const u = Math.max(0, Math.min(1, ((q.x - a.x) * vx + (q.y - a.y) * vy) / L2));
      if (Math.hypot(a.x + vx * u - q.x, a.y + vy * u - q.y) <= tol) { okN += 1; break; }
    }
  }
  const explained = inkN ? okN / inkN : 0;
  confidence *= 0.6 + 0.4 * explained;

  // To page space, then the look from the picture's own pixels.
  const toPage = (q: P): Point => ({ x: img.x0 + (base.ox + q.x * k + (k - 1) / 2) / img.scale, y: img.y0 + (base.oy + q.y * k + (k - 1) / 2) / img.scale });
  const joints = Object.fromEntries(Object.entries(work).map(([j, q]) => [j, toPage(q)])) as Record<JointPick, Point>;
  const sample = (x: number, y: number) => {
    const px = Math.round((x - img.x0) * img.scale), py = Math.round((y - img.y0) * img.scale);
    if (px < 0 || py < 0 || px >= img.width || py >= img.height) return null;
    const o = (py * img.width + px) * 4, d = img.data;
    return [d[o], d[o + 1], d[o + 2], d[o + 3]] as const;
  };
  const read = lookFromPixels(sample, joints);
  // (A square, triangle or cut head can fool the pixel probe into a tiny radius: never smaller than the loop found.)
  const ownR = (head.filled ? head.r : Math.max(1, head.r - 0.5 * hw)) * k / img.scale;
  const look: DrawnLook = { ...read, headFilled: head.filled, headRadius: read.headRadius == null || read.headRadius < 0.6 * ownR ? ownR : read.headRadius };
  return { joints, look, confidence: clamp01(confidence), explained };
}
