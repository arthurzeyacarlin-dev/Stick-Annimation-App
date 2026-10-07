// WHAT IS THIS DRAWING? (SPEC-0017 "50-50", 2026-10-07 — Arthur: "It's called make my drawing come TRUE, not make
// my STICK FIGURE come true. If there's an explosion, it should be able to create an explosion.")
// The engine reads a drawing by SHAPE and COLOUR with general rules (never tuned to one picture), the way a person
// would: a big lumpy cloud on a narrow stem standing on ground lines is a ground EXPLOSION; a lumpy burst floating
// with no stem or base is an AIR explosion; tongues pointing up in warm colours are FIRE; blue is WATER; a thin
// zig-zag (yellow/white/purple) is LIGHTNING; light blue / cyan spikes are ICE; grey puffs are SMOKE. Black-only
// drawings still work by shape alone. (The stick-figure finder is H1's vision/stickFigure.ts; drawingKind.ts joins
// both.) Pure TS, no canvas: the picture is RGBA pixels (vision/types.ts InkImage).
import { inkToPage, type Box, type DrawingKind, type FoundFigure, type InkImage, type ReadDrawing } from "./types.ts";

type Family = "dark" | "grey" | "white" | "red" | "orange" | "yellow" | "green" | "cyan" | "blue" | "purple";
const FAMILIES: Family[] = ["dark", "grey", "white", "red", "orange", "yellow", "green", "cyan", "blue", "purple"];

// One pixel's colour family (HSV rules).
function familyOf(r: number, g: number, b: number): Family {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), v = mx / 255, s = mx ? (mx - mn) / mx : 0;
  if (mx < 70) return "dark";
  if (s < 0.2) return mx > 225 ? "white" : mx < 110 ? "dark" : "grey";
  let h = 0;
  const d = mx - mn;
  if (mx === r) h = (((g - b) / d) % 6) * 60;
  else if (mx === g) h = ((b - r) / d + 2) * 60;
  else h = ((r - g) / d + 4) * 60;
  if (h < 0) h += 360;
  if (h < 14 || h >= 335) return v < 0.35 ? "dark" : "red";
  if (h < 42) return "orange";
  if (h < 70) return "yellow";
  if (h < 160) return "green";
  if (h < 200) return "cyan";
  if (h < 250) return s < 0.5 && v > 0.7 ? "cyan" : "blue"; // light blue reads as ice, strong blue as water
  return "purple";
}

const hex = (r: number, g: number, b: number) => "#" + [r, g, b].map((c) => Math.round(c).toString(16).padStart(2, "0")).join("");

export type DrawingFeatures = {
  ink: number; // ink pixels
  share: Record<Family, number>; // colour family shares of the ink (0..1)
  colors: string[]; // main colours (most ink first)
  pxBox: { x0: number; y0: number; x1: number; y1: number }; // ink box in picture pixels
  holes: number; // closed loops (enclosed empty areas)
  holeArea: number; // their area / the box area
  density: number; // ink cells / box cells (low = thin lines)
  bands: number[]; // ink span (width share) of 10 horizontal bands, top to bottom
  cloudBand: number; // the widest band in the top 60%
  waist: boolean; // a narrow STEM below a wide cloud
  base: boolean; // long flat GROUND lines at the bottom
  tipsUp: number; // sharp tips pointing up on the top outline
  lumps: number; // bumps round the outline (seen from the middle)
  zigzag: number; // left-right reversals of a thin stroke going down
};

// Is pixel i ink? (A transparent layer: any visible pixel. An opaque white page: anything not near-white.)
function inkTest(img: InkImage): (i: number) => boolean {
  const d = img.data, n = img.width * img.height;
  let clear = 0;
  for (let i = 0; i < n; i += 7) if (d[i * 4 + 3] < 10) clear++;
  const transparent = clear * 7 > n * 0.2;
  return transparent ? (i) => d[i * 4 + 3] > 60 : (i) => d[i * 4 + 3] > 60 && !(d[i * 4] > 225 && d[i * 4 + 1] > 225 && d[i * 4 + 2] > 225);
}

export function drawingFeatures(img: InkImage): DrawingFeatures | null {
  const { width: W, height: H, data: d } = img;
  const isInk = inkTest(img);
  const count: Record<Family, number> = Object.fromEntries(FAMILIES.map((f) => [f, 0])) as Record<Family, number>;
  const sum: Record<Family, [number, number, number]> = Object.fromEntries(FAMILIES.map((f) => [f, [0, 0, 0]])) as Record<Family, [number, number, number]>;
  let ink = 0, x0 = W, y0 = H, x1 = -1, y1 = -1;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    if (!isInk(i)) continue;
    ink++;
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
    const r = d[i * 4], g = d[i * 4 + 1], b = d[i * 4 + 2], f = familyOf(r, g, b);
    count[f]++; sum[f][0] += r; sum[f][1] += g; sum[f][2] += b;
  }
  if (ink < 12) return null;
  const share = Object.fromEntries(FAMILIES.map((f) => [f, count[f] / ink])) as Record<Family, number>;
  const colors = FAMILIES.filter((f) => share[f] >= 0.06).sort((a, b) => count[b] - count[a]).map((f) => hex(sum[f][0] / count[f], sum[f][1] / count[f], sum[f][2] / count[f]));

  // A coarse ink mask of the box (about 120 cells across its long side), thickened one cell so a scribbly outline
  // with small gaps still closes.
  const bw = x1 - x0 + 1, bh = y1 - y0 + 1, cell = Math.max(1, Math.max(bw, bh) / 120);
  const mw = Math.max(1, Math.ceil(bw / cell)), mh = Math.max(1, Math.ceil(bh / cell));
  const raw = new Uint8Array(mw * mh);
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (isInk(y * W + x)) raw[Math.min(mh - 1, Math.floor((y - y0) / cell)) * mw + Math.min(mw - 1, Math.floor((x - x0) / cell))] = 1;
  const mask = new Uint8Array(mw * mh);
  for (let y = 0; y < mh; y++) for (let x = 0; x < mw; x++) {
    let on = 0;
    for (let dy = -1; dy <= 1 && !on; dy++) for (let dx = -1; dx <= 1 && !on; dx++) { const yy = y + dy, xx = x + dx; if (yy >= 0 && yy < mh && xx >= 0 && xx < mw && raw[yy * mw + xx]) on = 1; }
    mask[y * mw + x] = on;
  }
  let inkCells = 0;
  for (let i = 0; i < raw.length; i++) inkCells += raw[i];
  const density = inkCells / (mw * mh);

  // Closed loops: empty cells not reachable from outside the box.
  const PW = mw + 2, PH = mh + 2, seen = new Uint8Array(PW * PH);
  const at = (x: number, y: number) => (x < 1 || y < 1 || x > mw || y > mh ? 0 : mask[(y - 1) * mw + (x - 1)]);
  const flood = (sx: number, sy: number) => {
    const stack = [sy * PW + sx]; seen[sy * PW + sx] = 1; let n = 0;
    while (stack.length) {
      const p = stack.pop()!, x = p % PW, y = (p - x) / PW; n++;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const xx = x + dx, yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= PW || yy >= PH) continue;
        const q = yy * PW + xx;
        if (!seen[q] && !at(xx, yy)) { seen[q] = 1; stack.push(q); }
      }
    }
    return n;
  };
  flood(0, 0);
  let holes = 0, holeCells = 0;
  const minHole = Math.max(3, mw * mh * 0.004);
  for (let y = 1; y <= mh; y++) for (let x = 1; x <= mw; x++) if (!seen[y * PW + x] && !at(x, y)) { const n = flood(x, y); if (n >= minHole) { holes++; holeCells += n; } }
  const holeArea = holeCells / (mw * mh);

  // Width of 10 bands, top to bottom.
  const bands: number[] = [];
  for (let b = 0; b < 10; b++) {
    let lo = mw, hi = -1;
    for (let y = Math.floor((b * mh) / 10); y < Math.max(Math.floor((b * mh) / 10) + 1, Math.floor(((b + 1) * mh) / 10)); y++) for (let x = 0; x < mw; x++) if (raw[Math.min(mh - 1, y) * mw + x]) { if (x < lo) lo = x; if (x > hi) hi = x; }
    bands.push(hi < 0 ? 0 : (hi - lo + 1) / mw);
  }
  let cloudBand = 0;
  for (let b = 0; b < 6; b++) if (bands[b] > bands[cloudBand]) cloudBand = b;
  // A STEM: below the cloud, a band (not the last) clearly narrower than the cloud, with ink.
  let waist = false;
  for (let b = cloudBand + 1; b <= 8; b++) if (bands[b] > 0 && bands[b] < bands[cloudBand] * 0.55 && bands[cloudBand] >= 0.45) waist = true;
  // GROUND: in the bottom 15% of the box, one long flat run of ink (a ground line) at least 35% of the box wide.
  let base = false;
  for (let y = Math.floor(mh * 0.85); y < mh && !base; y++) {
    let run = 0;
    for (let x = 0; x < mw; x++) { run = raw[y * mw + x] || (y + 1 < mh && raw[(y + 1) * mw + x]) ? run + 1 : 0; if (run >= mw * 0.35) base = true; }
  }

  // Tips pointing up: local highest points of the top outline, standing out on both sides.
  const top: number[] = [];
  for (let x = 0; x < mw; x++) { let t = mh; for (let y = 0; y < mh; y++) if (raw[y * mw + x]) { t = y; break; } top.push(t); }
  let tipsUp = 0;
  const prom = mh * 0.12, reach = Math.max(2, Math.round(mw * 0.18));
  for (let x = 0; x < mw; x++) {
    if (top[x] >= mh) continue;
    let isTip = true, leftDrop = 0, rightDrop = 0;
    for (let k = 1; k <= reach; k++) {
      if (x - k >= 0) { if (top[x - k] < top[x]) isTip = false; leftDrop = Math.max(leftDrop, Math.min(mh, top[x - k]) - top[x]); } else leftDrop = Math.max(leftDrop, mh - top[x]);
      if (x + k < mw) { if (top[x + k] < top[x] || (top[x + k] === top[x] && k === 1)) isTip = false; rightDrop = Math.max(rightDrop, Math.min(mh, top[x + k]) - top[x]); } else rightDrop = Math.max(rightDrop, mh - top[x]);
    }
    if (isTip && leftDrop >= prom && rightDrop >= prom) tipsUp++;
  }

  // Bumps round the outline: from the ink's middle, the farthest ink in 72 directions; count clear local peaks.
  let cx = 0, cy = 0;
  for (let y = 0; y < mh; y++) for (let x = 0; x < mw; x++) if (raw[y * mw + x]) { cx += x; cy += y; }
  cx /= inkCells || 1; cy /= inkCells || 1;
  const N = 72, far = new Array<number>(N).fill(0);
  for (let y = 0; y < mh; y++) for (let x = 0; x < mw; x++) if (raw[y * mw + x]) {
    const a = Math.atan2(y - cy, x - cx), k = ((Math.round((a / (Math.PI * 2)) * N) % N) + N) % N;
    far[k] = Math.max(far[k], Math.hypot(x - cx, y - cy));
  }
  const mean = far.reduce((s, v) => s + v, 0) / N;
  let lumps = 0;
  for (let k = 0; k < N; k++) {
    let peak = far[k] > 0;
    let dipL = 0, dipR = 0;
    for (let j = 1; j <= 5; j++) {
      const l = far[(k - j + N) % N], r = far[(k + j) % N];
      if (l > far[k] || r >= far[k]) peak = false;
      dipL = Math.max(dipL, far[k] - l); dipR = Math.max(dipR, far[k] - r);
    }
    if (peak && dipL > mean * 0.05 && dipR > mean * 0.05) lumps++;
  }

  // Zig-zag: going down, the stroke's middle swings left and right (a thin drawing, no loops).
  let zigzag = 0, lastMid = NaN, dir = 0;
  const step = Math.max(1, Math.round(mh / 24));
  for (let y = 0; y < mh; y += step) {
    let lo = -1, hi = -1;
    for (let x = 0; x < mw; x++) if (raw[y * mw + x]) { if (lo < 0) lo = x; hi = x; }
    if (lo < 0) continue;
    const mid = (lo + hi) / 2;
    if (!Number.isNaN(lastMid) && Math.abs(mid - lastMid) > mw * 0.04) {
      const nd = Math.sign(mid - lastMid);
      if (dir && nd !== dir) zigzag++;
      dir = nd;
    }
    lastMid = mid;
  }

  return { ink, share, colors, pxBox: { x0, y0, x1, y1 }, holes, holeArea, density, bands, cloudBand, waist, base, tipsUp, lumps, zigzag };
}

// Decide the kind from the features (general rules; colour first when the drawing is clearly coloured, shape always).
export function kindFromFeatures(f: DrawingFeatures, boxAspect: number): { kind: DrawingKind; reason: string } {
  const s = f.share;
  const warm = s.red + s.orange + s.yellow, colored = 1 - s.dark - s.grey - s.white;
  const cloud = f.bands[f.cloudBand] >= 0.45 && (f.holes >= 1 || f.lumps >= 3 || f.density > 0.25);
  const mushroom = cloud && f.waist && f.cloudBand <= 5;
  const round = boxAspect > 0.55 && boxAspect < 1.8;
  // Standing on its bottom (a fire): the lowest bands are the widest; a floating burst is round, a mushroom top-heavy.
  const bottomHeavy = (f.bands[7] + f.bands[8] + f.bands[9]) / 3 >= Math.max(0.5, (f.bands[0] + f.bands[1] + f.bands[2]) / 3 + 0.15);
  const thinZig = f.holes === 0 && f.density < 0.16 && f.zigzag >= 2 && f.tipsUp <= 2;
  if (s.blue >= 0.35) return { kind: "water", reason: "mostly blue → water" };
  if (s.cyan >= 0.35) return { kind: "ice", reason: "light blue / cyan" + (f.tipsUp >= 2 ? " spikes" : "") + " → ice" };
  if (thinZig && (s.yellow + s.white + s.purple >= 0.35 || colored < 0.2)) return { kind: "lightning", reason: "a thin zig-zag line" + (s.yellow >= 0.35 ? " in yellow" : "") + " → lightning" };
  if (mushroom && (f.base || f.waist)) return { kind: "explosion", reason: `a big lumpy cloud on a stem${f.base ? ", standing on ground lines" : ""} → explosion on the ground` };
  if (s.grey >= 0.4) return { kind: "smoke", reason: "grey puffs → smoke" };
  if (f.tipsUp >= 2 && (warm >= 0.3 || (colored < 0.2 && bottomHeavy))) return { kind: "fire", reason: `${f.tipsUp} tongues pointing up${warm >= 0.3 ? " in warm colours" : ""} → fire` };
  if (cloud && round && f.lumps >= 3) return { kind: "airExplosion", reason: "a lumpy burst floating, no stem or ground → explosion in the air" };
  if (s.yellow + s.purple >= 0.4 && f.holes === 0) return { kind: "lightning", reason: "a thin bright line → lightning" };
  if (warm >= 0.35) return { kind: "fire", reason: "mostly warm colours → fire" };
  if (cloud && f.base) return { kind: "explosion", reason: "a big cloud on ground lines → explosion on the ground" };
  return { kind: "unknown", reason: "not sure what this is" };
}

// The whole read, given a stick-figure finder (drawingKind.ts passes H1's findStickFigure).
export function readDrawingWith(img: InkImage, findFigure: (img: InkImage) => FoundFigure | null): ReadDrawing {
  const f = drawingFeatures(img);
  if (!f) return { kind: "unknown", box: { x: img.x0, y: img.y0, w: 0, h: 0 }, groundY: img.y0, colors: [], figure: null, reason: "the drawing is empty" };
  const a = inkToPage(img, f.pxBox.x0, f.pxBox.y0), b = inkToPage(img, f.pxBox.x1 + 1, f.pxBox.y1 + 1);
  const box: Box = { x: a.x, y: a.y, w: b.x - a.x, h: b.y - a.y };
  const groundY = b.y;
  let figure: FoundFigure | null = null;
  try { figure = findFigure(img); } catch { figure = null; }
  // A STICK FIGURE only when it explains most of the ink and has a figure's proportions (its head a small part of it:
  // a big round cloud on a stem is not a head on a neck).
  if (figure && figure.confidence >= 0.55 && figure.explained >= 0.7) {
    const j = figure.joints, tall = Math.max(1, Math.max(j.lFoot.y, j.rFoot.y) - j.head.y);
    const headR = figure.look.headRadius ?? Math.hypot(j.head.x - j.neck.x, j.head.y - j.neck.y) * 0.8;
    if (headR / tall < 0.22) return { kind: "stickFigure", box, groundY, colors: f.colors, figure, reason: "a stick figure (head, body, arms and legs)" };
  }
  const { kind, reason } = kindFromFeatures(f, box.w / Math.max(1e-6, box.h));
  return { kind, box, groundY, colors: f.colors, figure, reason };
}
