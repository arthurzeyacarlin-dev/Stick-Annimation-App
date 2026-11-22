// (Nov 2 final round, PLAN_NEVER_AGAIN_NOV2 s3 + s5 + Fable attack 9-10) WHERE THE FIGURE GOES ON THE PAGE. Pure maths, $0, no AI:
//  - the page fit (the follow-camera default: the whole motion centred on the page; camera "still": fitted by the FIRST picture's figure
//    height + start spot, so he can walk off the page),
//  - the user's GROUND LINE: a long, near-horizontal, open-on-top run of the user's own ink (their layers, the current frame) under his
//    fitted feet; his standing feet go on it. Unsure / none = today's default. Every number is the book's (luna-book.json canvas.ground).
// Tested with node --test (v1PageFit.test.ts); the browser feeds it real pixels (v1CanvasPicture.ts, engineBlockScene.ts).

export type V1Box = [number, number, number, number]; // x0, y0, x1, y1
// book canvas.ground (see luna-book.json): the ruler for "is this the user's ground line?"
export type V1GroundRule = {
  minLenFigureWidths: number; // a ground line is at least this many of his widths long (Fable 9: never a short box edge)
  maxSlopeDeg: number; // near-horizontal: steeper = a hill / a ramp, never the ground
  upShareH: number; // a line higher than this share of his height ABOVE his fitted feet is a thing at body height (a table edge), never the ground
  openAbovePx: number; // (picture pixels) the run's top must have this much empty space right above it (a filled area is not a line)
  openAboveShare: number; // ... along at least this share of the run
  maxThickPx: number; // (picture pixels) thicker ink than this is a filled shape, never a line
  gapPx: number; // (picture pixels) a break in the line this long or shorter still counts as one line
  minRunShare: number; // the shortest run kept at all, as a share of the picture width
  inkDiff: number; // a picture pixel is ink when one colour channel is this far from the white page (0-255)
  defaultFigure: { heightShare: number; feetYShare: number; widthPerHeight: number }; // where he stands before the result is known (the chat reply)
  // (Nov 2 night) LINE HIM UP WITH THE DRAWING (book canvas.ground.align; absent = off): the user's drawn THINGS (ink blobs that are not a long
  // ground line) are matched in order with his key moments (a foot raised high = a step-over / jump); he is slid (and sized within the book's
  // range) so each moment lands on its thing. Pure maths on what is measured; Kimodo's motion is never changed.
  align?: { minScale: number; maxScale: number; thingMinShare: number; thingMaxWidthShare: number } | null;
};
// a drawn thing in PAGE pixels (the 1920 x 1080 page)
export type V1Thing = { x0: number; y0: number; x1: number; y1: number };
// ---- every separate blob of the user's ink that is not a long line (page pixels): bigger than thingMinShare of the picture's pixels,
// narrower than thingMaxWidthShare of its width (a long ground line is the ground, never a thing)
export function v1FindThings(mask: Uint8Array, w: number, h: number, rule: V1GroundRule, pageW: number, pageH: number): V1Thing[] {
  const A = rule.align; if (!A) return [];
  const seen = new Uint8Array(w * h), out: V1Thing[] = [], minPx = Math.max(2, Math.round(A.thingMinShare * w * h));
  for (let p0 = 0; p0 < w * h; p0 += 1) {
    if (!mask[p0] || seen[p0]) continue;
    let x0 = w, y0 = h, x1 = -1, y1 = -1, n = 0; const stack = [p0]; seen[p0] = 1;
    while (stack.length) {
      const p = stack.pop()!, x = p % w, y = (p - x) / w; n += 1;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      for (let dy = -1; dy <= 1; dy += 1) for (let dx = -1; dx <= 1; dx += 1) {
        const xx = x + dx, yy = y + dy, q = yy * w + xx;
        if (xx >= 0 && xx < w && yy >= 0 && yy < h && mask[q] && !seen[q]) { seen[q] = 1; stack.push(q); }
      }
    }
    if (n >= minPx && x1 - x0 + 1 <= A.thingMaxWidthShare * w) out.push({ x0: (x0 * pageW) / w, y0: (y0 * pageH) / h, x1: ((x1 + 1) * pageW) / w, y1: ((y1 + 1) * pageH) / h });
  }
  return out.sort((a, b) => a.x0 - b.x0);
}
// ---- slide (and size within the book's range) so the moments (canvas x, in time order) land on the things (canvas x): -> {a, b} with
// x' = a * x + b, or null when there is nothing to match. One moment = the nearest thing; several = in order along his travel.
export function v1AlignMoments(moments: readonly number[], things: readonly number[], minScale: number, maxScale: number): { a: number; b: number; pairs: number } | null {
  if (!moments.length || !things.length) return null;
  if (moments.length === 1) { const m = moments[0]; const t = things.reduce((best, x) => (Math.abs(x - m) < Math.abs(best - m) ? x : best), things[0]); return { a: 1, b: t - m, pairs: 1 }; }
  const dir = moments[moments.length - 1] >= moments[0] ? 1 : -1, ts = [...things].sort((p, q) => dir * (p - q));
  const n = Math.min(moments.length, ts.length), M = moments.slice(0, n), T = ts.slice(0, n);
  const mm = M.reduce((s, x) => s + x, 0) / n, tm = T.reduce((s, x) => s + x, 0) / n;
  const vm = M.reduce((s, x) => s + (x - mm) ** 2, 0), cv = M.reduce((s, x, i) => s + (x - mm) * (T[i] - tm), 0);
  const a = Math.min(maxScale, Math.max(minScale, vm > 1e-6 ? cv / vm : 1));
  return { a, b: tm - a * mm, pairs: n };
}
// a ground line in PAGE pixels (the 1920 x 1080 page): its left end (x0, y0) and right end (x1, y1)
export type V1GroundLine = { x0: number; y0: number; x1: number; y1: number };

// ---- the ink: a picture of the user's layers on a white page -> 1 = ink
export function v1InkMask(rgba: ArrayLike<number>, width: number, height: number, inkDiff: number): Uint8Array {
  const mask = new Uint8Array(width * height);
  for (let i = 0, p = 0; p < width * height; p += 1, i += 4) {
    if (rgba[i + 3] > 8 && (255 - rgba[i] > inkDiff || 255 - rgba[i + 1] > inkDiff || 255 - rgba[i + 2] > inkDiff)) mask[p] = 1;
  }
  return mask;
}

// ---- every long near-horizontal open-on-top ink run, in PAGE pixels (pageW x pageH = the page the picture shows)
export function v1FindGroundLines(mask: Uint8Array, w: number, h: number, rule: V1GroundRule, pageW: number, pageH: number): V1GroundLine[] {
  const maxM = Math.tan((rule.maxSlopeDeg * Math.PI) / 180), steps = Math.max(1, Math.ceil(rule.maxSlopeDeg / 2));
  const minRun = Math.max(2, Math.round(rule.minRunShare * w));
  const ink = (x: number, y: number) => x >= 0 && x < w && y >= 0 && y < h && mask[y * w + x] === 1;
  // the top of the ink at (x, y) (walking up through the line), or null when it is thicker than a line (a filled shape)
  const topAt = (x: number, y: number): number | null => {
    let t = y;
    while (t - 1 >= 0 && ink(x, t - 1)) { t -= 1; if (y - t > rule.maxThickPx) return null; }
    return t;
  };
  const open = (x: number, top: number) => { for (let k = 1; k <= rule.openAbovePx; k += 1) if (ink(x, top - k)) return false; return true; };
  type Run = { x0: number; x1: number; m: number; tops: { x: number; t: number }[]; open: number; hits: number };
  const runs: Run[] = [];
  for (let s = -steps; s <= steps; s += 1) {
    const m = (maxM * s) / steps;
    for (let c = 0; c < h; c += 1) {
      let run: Run | null = null, gap = 0;
      const close = () => { if (run && run.x1 - run.x0 + 1 >= minRun) runs.push(run); run = null; gap = 0; };
      for (let x = 0; x < w; x += 1) {
        const yy = Math.round(c + m * (x - w / 2));
        const hitY = ink(x, yy) ? yy : ink(x, yy + 1) ? yy + 1 : null; // (only the line's top side is searched: the top edge is the ground)
        if (hitY === null) { if (run) { gap += 1; if (gap > rule.gapPx) close(); } continue; }
        const top = topAt(x, hitY);
        if (top === null) { close(); continue; } // a filled shape ends the line
        if (!run) run = { x0: x, x1: x, m, tops: [], open: 0, hits: 0 };
        run.x1 = x; gap = 0; run.hits += 1; run.tops.push({ x, t: top }); if (open(x, top)) run.open += 1;
      }
      close();
    }
  }
  // each run -> its top line (mean top, the run's slope); open on top along the book's share; near-duplicates merged (longest kept)
  const lines = runs.filter((r) => r.open / r.hits >= rule.openAboveShare).map((r) => {
    const mx = r.tops.reduce((t, p) => t + p.x, 0) / r.tops.length, my = r.tops.reduce((t, p) => t + p.t, 0) / r.tops.length;
    return { x0: r.x0, x1: r.x1, y0: my + r.m * (r.x0 - mx), y1: my + r.m * (r.x1 - mx) };
  }).sort((a, b) => (b.x1 - b.x0) - (a.x1 - a.x0));
  const kept: typeof lines = [];
  for (const l of lines) {
    const same = kept.some((k) => Math.abs((k.y0 + k.y1) / 2 - (l.y0 + l.y1) / 2) <= rule.maxThickPx && Math.min(k.x1, l.x1) - Math.max(k.x0, l.x0) > 0.5 * (l.x1 - l.x0));
    if (!same) kept.push(l);
  }
  const kx = pageW / w, ky = pageH / h;
  return kept.map((l) => ({ x0: l.x0 * kx, y0: l.y0 * ky, x1: (l.x1 + 1) * kx, y1: l.y1 * ky }));
}

const yAt = (l: V1GroundLine, x: number) => (l.x1 === l.x0 ? l.y0 : l.y0 + ((l.y1 - l.y0) * (x - l.x0)) / (l.x1 - l.x0));
// ---- the ground under his feet (all in the same pixels): feet = his feet's x range + the y they stand on; figure = his width + height.
// A line counts when it is long enough (book x his width), runs under his feet's middle, and is not higher than the book's share of his
// height above his feet. Several -> the LOWEST (the ground is under everything: a table edge or a box top sits on it). None = null (default).
export function v1PickGround(lines: readonly V1GroundLine[], feet: { x0: number; x1: number; y: number }, figure: { width: number; height: number }, rule: V1GroundRule): { line: V1GroundLine; y: number } | null {
  const cx = (feet.x0 + feet.x1) / 2, minLen = rule.minLenFigureWidths * Math.max(1, figure.width);
  let best: { line: V1GroundLine; y: number } | null = null;
  for (const l of lines) {
    if (Math.hypot(l.x1 - l.x0, l.y1 - l.y0) < minLen || cx < l.x0 || cx > l.x1) continue;
    const y = yAt(l, cx);
    if (y < feet.y - rule.upShareH * figure.height) continue;
    if (!best || y > best.y) best = { line: l, y };
  }
  return best;
}
// before the result is known (the chat reply): he stands where the book's default figure stands, in the middle of the page
export function v1GroundForDefault(lines: readonly V1GroundLine[], rule: V1GroundRule, pageW: number, pageH: number) {
  const f = rule.defaultFigure, height = f.heightShare * pageH, width = f.widthPerHeight * height;
  return v1PickGround(lines, { x0: pageW / 2 - width / 2, x1: pageW / 2 + width / 2, y: f.feetYShare * pageH }, { width, height }, rule);
}

// ---- the box around every painted pixel of one picture (alpha > a tiny threshold); null = an empty picture
export function v1AlphaBox(rgba: ArrayLike<number>, width: number, height: number): V1Box | null {
  let x0 = width, y0 = height, x1 = -1, y1 = -1;
  for (let y = 0; y < height; y += 1) for (let x = 0, i = y * width * 4 + 3; x < width; x += 1, i += 4) {
    if (rgba[i] > 8) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  }
  return x1 < 0 ? null : [x0, y0, x1 + 1, y1 + 1];
}

// ---- the page fit: where the engine's stage picture is drawn on the canvas (canvas pixels). No fit = exactly the old map.
export type V1PageFitInput = {
  inkBox: V1Box; // where the figure moves (stage pixels, the whole take)
  pageLeftPx: number; pageWidthPx: number; pageTopPx?: number; pageHeightPx?: number;
  margin: number; // the share of the page the fitted motion may fill (the book's / the old 0.94)
  camera?: "follow" | "still"; // absent = follow (the default)
  firstBox?: V1Box | null; // the FIRST picture's figure box (stage pixels): still = fitted by it; also his feet for the ground line
  stillHeightShare?: number; // still: his first-picture height as a share of the page height (the book's)
  ground?: { lines: V1GroundLine[]; rule: V1GroundRule; pageW: number; pageH: number; things?: V1Thing[] } | null; // the user's ground lines + things (page pixels)
  moments?: { x: number; y: number }[] | null; // (Nov 2 night) his key moments (stage pixels, time order): a foot raised high (step-over / jump)
};
export type V1PageRect = { x0: number; y0: number; w: number; h: number; ground: number | null }; // ground = the line's y (canvas px) used, or null
export function v1PageRect(stage: [number, number], base: { x0: number; y0: number; scale: number }, fit: V1PageFitInput): V1PageRect {
  let x0 = base.x0, y0 = base.y0;
  const h0 = stage[1] * base.scale;
  let s: number;
  const first = fit.firstBox && fit.firstBox[3] > fit.firstBox[1] ? fit.firstBox : null;
  if (fit.camera === "still" && first && fit.pageHeightPx && fit.stillHeightShare) {
    // STILL: his first picture is drawn at the book's height share; his start spot keeps its place across the stage (so he walks off)
    s = (fit.stillHeightShare * fit.pageHeightPx) / (first[3] - first[1]);
    const cx = (first[0] + first[2]) / 2;
    x0 = fit.pageLeftPx + (cx / stage[0]) * fit.pageWidthPx - cx * s;
    y0 = y0 + h0 - stage[1] * s; // (the stage floor stays where the old map has it)
  } else {
    const [ix0, iy0, ix1] = fit.inkBox;
    let k = (ix1 - ix0) * base.scale > fit.margin * fit.pageWidthPx ? (fit.margin * fit.pageWidthPx) / ((ix1 - ix0) * base.scale) : 1;
    if (fit.pageTopPx !== undefined && fit.pageHeightPx) {
      const room = y0 + h0 - (fit.pageTopPx + (1 - fit.margin) * fit.pageHeightPx), need = (stage[1] - iy0) * base.scale;
      if (room > 0 && need * k > room) k = room / need;
    }
    s = base.scale * k;
    y0 += h0 - stage[1] * s;
    x0 = fit.pageLeftPx + fit.pageWidthPx / 2 - ((ix0 + ix1) / 2) * s;
  }
  // GROUND: his standing feet (the first picture's lowest ink; the whole take's when the first is unknown) go on the user's line
  let ground: number | null = null;
  if (fit.ground && fit.pageHeightPx && fit.pageTopPx !== undefined && fit.ground.lines.length) {
    const fb = first ?? fit.inkBox, kx = fit.pageWidthPx / fit.ground.pageW, ky = fit.pageHeightPx / fit.ground.pageH;
    const lines = fit.ground.lines.map((l) => ({ x0: fit.pageLeftPx + l.x0 * kx, y0: fit.pageTopPx! + l.y0 * ky, x1: fit.pageLeftPx + l.x1 * kx, y1: fit.pageTopPx! + l.y1 * ky }));
    const feetY = y0 + fb[3] * s;
    const got = v1PickGround(lines, { x0: x0 + fb[0] * s, x1: x0 + fb[2] * s, y: feetY }, { width: (fb[2] - fb[0]) * s, height: (fb[3] - fb[1]) * s }, fit.ground.rule);
    if (got) { y0 += got.y - feetY; ground = got.y; }
  }
  // (Nov 2 night) LINE HIM UP WITH THE DRAWING: his step-over / jump moments land on the user's things, in order (book align range); his
  // feet stay on the ground line, or on the things' base when no ground line was drawn
  const A = fit.ground?.rule.align, things = fit.ground?.things ?? [];
  if (A && fit.moments?.length && things.length && fit.pageHeightPx && fit.pageTopPx !== undefined) {
    const kx = fit.pageWidthPx / fit.ground!.pageW, ky = fit.pageHeightPx / fit.ground!.pageH;
    const tx = things.map((t) => fit.pageLeftPx + ((t.x0 + t.x1) / 2) * kx);
    const got = v1AlignMoments(fit.moments.map((m) => x0 + m.x * s), tx, A.minScale, A.maxScale);
    if (got) {
      const gy = fit.moments[0].y, feetY = ground ?? (things.reduce((t, x) => t + x.y1, 0) / things.length) * ky + fit.pageTopPx;
      x0 = got.a * x0 + got.b; s *= got.a; y0 = feetY - gy * s;
      if (ground === null) ground = feetY;
    }
  }
  return { x0, y0, w: stage[0] * s, h: stage[1] * s, ground };
}
