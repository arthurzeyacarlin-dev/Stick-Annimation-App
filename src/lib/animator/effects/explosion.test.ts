// EXPLOSIONS AND A GRENADE (SPEC-0017 Phase 2C, 2026-10-06): the recipes on their own.
import assert from "node:assert/strict";
import { test } from "node:test";
import { blastPush } from "../moves/blownAway.ts";
import { PLACED_SYMBOLS, placedSymbol, shapeBounds } from "../symbolMaker.ts";
import { BREAK_AT, blastPushAt, blastReach, capAt, capBlobs, capCoverOf, cratePieces, crateBreakPiece, DISINTEGRATE, DUST_SPIKE, dustSpikes, EXPLOSION_SECONDS, EXPLOSION_SIZE, grenadeAt, grenadeHalfExtent, grenadePath, hasBigSpikes, HOT_ORANGE, HOT_YELLOW, RECIPES, SMOKE_DARK, SMOKE_LIGHT, SMOKE_MID, spikeOutline, STEM_WIDE, stemWidth, THROWN_AT, capCloud, GROWN_AT, grayLeft, smokeLeft, TEAR, CLOUD_SHOWS, spotAlpha, stemCuts, stemPieces } from "./explosion.ts";
import { EFFECTS } from "./index.ts";
import type { EffectContext, Shape } from "./types.ts";

const H = 280, G = 900;
const ctx = (t: number, at = { x: 1000, y: G }, extra: Partial<EffectContext> = {}): EffectContext => ({ t, duration: EXPLOSION_SECONDS, fps: 12, at, height: H, groundY: G, stageWidth: 1920, ...extra });
// (a placed symbol's lowest point: its box turned)
const symbolLowest = (s: Extract<Shape, { kind: "symbol" }>) => { const m = placedSymbol(s), k = s.scale ?? 1, a = ((s.rotation ?? 0) * Math.PI) / 180; return s.y + (k * (Math.abs(Math.sin(a)) * m.width + Math.abs(Math.cos(a)) * m.height)) / 2; };
const lowest = (shapes: Shape[]) => Math.max(...shapes.map((s) => (s.kind === "symbol" ? symbolLowest(s) : shapeBounds([s]).maxY)));
// #rrggbb → hue in degrees, saturation 0..1
const hueOf = (c: string) => { const [r, g, b] = [1, 3, 5].map((j) => parseInt(c.slice(j, j + 2), 16) / 255), mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn; if (!d) return { hue: 0, sat: 0 }; const hue = mx === r ? 60 * (((g - b) / d + 6) % 6) : mx === g ? 60 * ((b - r) / d + 2) : 60 * ((r - g) / d + 4); return { hue, sat: d / (1 - Math.abs(mx + mn - 1)) }; };
const area = (pts: number[]) => { let a = 0; for (let i = 0; i < pts.length; i += 2) { const j = (i + 2) % pts.length; a += pts[i] * pts[j + 1] - pts[j] * pts[i + 1]; } return Math.abs(a) / 2; };

test("explosions: the recipes and the symbols are registered", () => {
  for (const id of ["explosion", "grenade", "militaryCap", "crateBreak"]) assert.ok(EFFECTS[id], id);
  assert.equal(RECIPES.length, 4);
  for (const name of ["Grenade", "Military cap", "Wooden crate", "Wood plank", "Wood chip", "Pebble"]) assert.ok(PLACED_SYMBOLS[name], name);
  // (debris symbols: inside their boxes, a plank long and thin, a chip small, a pebble round-ish)
  for (const name of ["Wood plank", "Wood chip", "Pebble"]) { const m = placedSymbol({ name }), b = shapeBounds(m.shapes); assert.ok(b.minX >= -0.01 && b.minY >= -0.01 && b.maxX <= m.width + 0.01 && b.maxY <= m.height + 0.01, `${name} inside its box`); }
  assert.ok(placedSymbol({ name: "Wood plank" }).width >= 5 * placedSymbol({ name: "Wood plank" }).height);
});

test("explosions: the Grenade looks like a grenade (olive oval, segment grid, spoon lever, pin ring), inside its box", () => {
  const g = placedSymbol({ name: "Grenade" }), b = shapeBounds(g.shapes);
  assert.ok(b.minX >= -0.5 && b.minY >= -0.5 && b.maxX <= g.width + 0.5 && b.maxY <= g.height + 0.5, "inside its box");
  assert.ok(g.height > g.width, "taller than wide (an oval)");
  const fills = g.shapes.map((s) => ("fill" in s ? s.fill : undefined));
  assert.ok(fills.includes("#5f6f2f"), "olive body");
  assert.ok(g.shapes.filter((s) => s.kind === "line").length >= 7, "the grid of grooves and the spoon lever");
  assert.ok(g.shapes.some((s) => s.kind === "circle" && !s.fill && s.stroke), "the pin ring");
  const cap = placedSymbol({ name: "Military cap" }), cb = shapeBounds(cap.shapes);
  assert.ok(cb.minX >= -0.5 && cb.minY >= -0.5 && cb.maxX <= cap.width + 0.5 && cb.maxY <= cap.height + 0.5, "cap inside its box");
  assert.ok(cap.width > 2 * cap.height, "a cap with a peak: wide, low");
});

test("explosions: how far it pushes = the body's own rule (blownAway); a stronger blast reaches farther", () => {
  for (const s of [0.5, 1, 2]) for (const d of [0, 0.5, 1, 2, 4]) assert.ok(Math.abs(blastPushAt(s, d * H, H) - blastPush(s, d * H, 0, H)) < 1e-9, `${s} @ ${d}`);
  assert.ok(blastReach(2, H) > blastReach(1, H) && blastReach(1, H) > blastReach(0.5, H), "stronger reaches farther");
  assert.ok(Math.abs(blastPushAt(1, blastReach(1, H), H) - THROWN_AT) < 1e-6, "at its reach the push just throws a person");
});

test("explosions: a thrown grenade arcs, bounces LOWER each time, rolls, settles lying on its side — never below the ground", () => {
  for (const [landX, apex] of [[1900, 0.38 * H], [1200, 0.16 * H]] as const) {
    const from = { x: landX > 1500 ? 1100 : 1000, y: G - (landX > 1500 ? 1.2 : 0.5) * H };
    const path = grenadePath({ from, landX, groundY: G, height: H, apex });
    assert.ok(path.bounces.length >= 2, `bounces: ${path.bounces.length}`);
    for (let k = 1; k < path.bounces.length; k += 1) assert.ok(path.bounces[k].height < path.bounces[k - 1].height * 0.5, "each bounce lower");
    assert.ok(path.settle > path.bounces[path.bounces.length - 1].t, "settles after the last bounce");
    let lastX = -Infinity;
    for (let t = 0; t <= path.settle + 0.5; t += 1 / 60) {
      const p = grenadeAt(path, t, G, H);
      assert.ok(p.y + grenadeHalfExtent(H, p.rotation) <= G + 0.01, `t ${t.toFixed(2)}: above the ground`);
      assert.ok(p.x >= lastX - 1e-6, "keeps going the way it was thrown"); lastX = p.x;
    }
    const rest = grenadeAt(path, path.settle, G, H), later = grenadeAt(path, path.settle + 2, G, H);
    assert.ok(Math.abs(rest.x - later.x) < 1e-6 && Math.abs(rest.y - later.y) < 1e-6, "lies still once settled");
    assert.ok(Math.abs(((rest.rotation % 180) + 180) % 180 - 90) < 1e-6, "lying on its side");
    assert.ok(Math.abs(rest.y - (G - grenadeHalfExtent(H, 90))) < 0.01, "on the ground");
    assert.ok(Math.abs(path.restX - rest.x) < 1, "restX is where it lies");
  }
});

test("explosions: a ground explosion — flash and fireball at the ground, then a thin stem with a big cap cloud above it, fading out", () => {
  const e = EFFECTS.explosion, O = { x: 1000, y: G }, p = { seed: 5 };
  // the flash: a bright pale burst and a white middle in the first moment
  const flash = e.draw(ctx(0.03, O), p);
  assert.ok(flash.some((s) => s.kind === "circle" && s.fill === "#ffffff" && (s.alpha ?? 1) > 0.5), "white flash");
  assert.ok(flash.some((s) => s.kind === "poly" && s.fill === "#ffd23f"), "fireball's yellow middle");
  // a moment later: the stem from the ground up into the cap, the cap well above the ground, wider than the stem
  const R = EXPLOSION_SIZE * H, cap = capAt(0.5, R);
  assert.ok(cap.y > 1.6 * R && capAt(2, R).y > cap.y, "the cap rises");
  const mid = e.draw(ctx(0.5, O), p);
  const smoke = mid.filter((s) => s.kind === "poly" && ["#4d4640", "#7b736b", "#b9b2aa"].includes(s.fill ?? ""));
  const capShapes = smoke.filter((s) => shapeBounds([s]).maxY < G - cap.y + cap.r);
  const stem = smoke.filter((s) => { const b = shapeBounds([s]); return b.maxY > G - 0.3 * R && b.minY < G - cap.y; });
  assert.ok(capShapes.length >= 4, "a cloud of blobs up top");
  const cb = shapeBounds(capShapes), sb = shapeBounds(stem.length ? stem : smoke);
  assert.ok(cb.maxX - cb.minX > 2.5 * 0.22 * R, "the cap is wide");
  assert.ok(Math.abs((cb.minX + cb.maxX) / 2 - O.x) < 0.4 * R, "the cap is over the ground point");
  assert.ok(smoke.some((s) => { const b = shapeBounds([s]); return b.maxY >= G - 0.05 * R && b.minY < G - 1.5 * R && b.maxX - b.minX < 0.4 * R; }) || sb.maxY >= G - 0.05 * R, "a thin stem up from the ground");
  // debris lands and lies on the ground; nothing goes below the ground at any moment
  for (let t = 0; t <= EXPLOSION_SECONDS; t += 1 / 24) assert.ok(lowest(e.draw(ctx(t, O), p)) <= G + 0.5, `t ${t.toFixed(2)}: nothing below the ground`);
  // the cloud breaks up and fades: by the end the smoke is (nearly) gone
  const late = e.draw(ctx(EXPLOSION_SECONDS - 0.02, O), p).filter((s) => s.kind === "poly" && ["#4d4640", "#7b736b", "#b9b2aa"].includes(s.fill ?? ""));
  assert.ok(late.every((s) => (s.alpha ?? 1) < 0.05), "faded out");
  // an outline changes every picture (drawn by hand), but the same moment is always the same picture
  assert.notDeepEqual(e.draw(ctx(2, O), p), e.draw(ctx(2 + 1 / 12, O), p));
  assert.deepEqual(e.draw(ctx(1, O, { fps: 8 }), p), e.draw(ctx(1, O, { fps: 24 }), p));
});

test("explosions: an AIR explosion is a round burst", () => {
  const air = { x: 1000, y: G - 1.5 * H };
  const shapes = EFFECTS.explosion.draw(ctx(0.25, air, { duration: EXPLOSION_SECONDS }), { air: true, seed: 3 });
  const pts = shapes.flatMap((s) => (s.kind === "circle" ? [[s.x, s.y]] : s.kind === "poly" ? [[shapeBounds([s]).minX, shapeBounds([s]).minY]] : []));
  assert.ok(pts.length > 3);
  const b = shapeBounds(shapes);
  assert.ok(b.maxY > air.y + 0.05 * H && b.minY < air.y - 0.05 * H && b.minX < air.x - 0.05 * H && b.maxX > air.x + 0.05 * H, "spreads all round, below it too");
  // EQUALLY in all directions (no stem, no up or down), and it rips open with orange-yellow hot smoke too
  for (const u of [0.1, 0.4, 1.5, 3]) {
    const bb = shapeBounds(EFFECTS.explosion.draw(ctx(u, air, { duration: EXPLOSION_SECONDS }), { air: true, seed: 3 }));
    const l = air.x - bb.minX, r = bb.maxX - air.x, up = air.y - bb.minY, down = bb.maxY - air.y, m = Math.max(l, r, up, down);
    assert.ok(Math.max(l, r, up, down) - Math.min(l, r, up, down) < 0.25 * m, `u ${u}: about the same each way (${[l, r, up, down].map((v) => (v / m).toFixed(2))})`);
  }
  const airHot = hotOf(EFFECTS.explosion.draw(ctx(BREAK_AT + 0.5, air, { duration: EXPLOSION_SECONDS }), { air: true, seed: 3 }));
  assert.ok(airHot.length >= 2 && airHot.length <= 3, "2–3 hot spots torn in it too");
});

test("explosions: a crate is a symbol until the blast, then BREAKS APART — pieces fly away, spin, land and lie flat, never below the ground", () => {
  const e = EFFECTS.crateBreak, at = { x: 900, y: G }, blast = { x: 1150, y: G };
  const before = e.draw(ctx(0.5, at, { target: blast, duration: 6 }), { breakAt: 1, size: 0.3 });
  assert.deepEqual(before.map((s) => s.kind === "symbol" && s.name), ["Wooden crate"]);
  const after = e.draw(ctx(1.4, at, { target: blast, duration: 6 }), { breakAt: 1, size: 0.3 });
  assert.ok(!after.some((s) => s.kind === "symbol" && s.name === "Wooden crate"), "the crate is gone once it breaks");
  // DEBRIS ARE SYMBOLS: every flying piece is a Wood plank or a Wood chip (they keep their shape)
  const debris = after.filter((sh): sh is Extract<Shape, { kind: "symbol" }> => sh.kind === "symbol");
  assert.equal(debris.filter((d) => d.name === "Wood plank").length, 9);
  assert.equal(debris.filter((d) => d.name === "Wood chip").length, 6);
  assert.ok(!after.some((sh) => sh.kind === "poly"), "no drawn planks");
  const s = 0.3 * H, pieces = cratePieces(at, s);
  const flown = (strength: number) => pieces.map((p, i) => crateBreakPiece(p, i, 3, blast, strength, G, H, 3));
  for (const [i, q] of flown(1).entries()) {
    assert.ok(q.x < pieces[i].x, `piece ${i} pushed away from the blast`);
    assert.ok(q.landed, `piece ${i} landed`);
    assert.ok(Math.abs(((q.rot % 180) + 180) % 180) < 1e-6 || Math.abs(((q.rot % 180) + 180) % 180 - 180) < 1e-6, `piece ${i} lies flat`);
  }
  const far = (strength: number) => flown(strength).reduce((sum, q, i) => sum + (pieces[i].x - q.x), 0);
  assert.ok(far(2) > far(1) * 1.3, "a stronger blast throws them farther");
  // THROWN LIKE A PERSON: up into the air in an arc, higher the closer it was (the same push as blownAway); smaller bits farther
  const peak = (blastX: number, i: number) => G - crateBreakPiece(pieces[i], i, 0.01, { x: blastX, y: G }, 1, G, H, 3).peakY;
  for (const i of [0, 4, 9]) assert.ok(peak(1050, i) > peak(1300, i) * 1.5, `piece ${i}: closer = higher`);
  assert.ok(Math.max(...pieces.map((_, i) => peak(1050, i))) > 0.5 * H, "a clear height above the ground");
  const bits = pieces.map((p, i) => ({ p, q: crateBreakPiece(p, i, 4, blast, 1, G, H, 3) })), small = bits.filter((b) => b.p.len < 0.25 * s), big = bits.filter((b) => b.p.len >= 0.7 * s);
  const avg = (list: typeof bits) => list.reduce((sum, b) => sum + (b.p.x - b.q.x), 0) / list.length;
  assert.ok(small.length >= 4 && avg(small) > avg(big), "smaller bits fly farther");
  for (const [i, p] of pieces.entries()) assert.ok(crateBreakPiece(p, i, 5, blast, 1, G, H, 3).settled, `piece ${i} settles`);
  for (let t = 1; t <= 4; t += 1 / 24) assert.ok(lowest(e.draw(ctx(t, at, { target: blast, duration: 6 }), { breakAt: 1, size: 0.3 })) <= G + 0.5, `t ${t.toFixed(2)}: above the ground`);
});

test("explosions: the Military cap sits on top of the head, follows its tilt and faces the way the figure faces", () => {
  const r = 0.07 * H, head = { x: 500, y: 500 };
  const at = (neck: { x: number; y: number }, facing: "left" | "right") => EFFECTS.militaryCap.draw(ctx(0, head, { target: neck, facing }), {})[0] as Extract<Shape, { kind: "symbol" }>;
  const up = at({ x: 500, y: 500 + r }, "right");
  assert.equal(up.name, "Military cap");
  assert.ok(up.y < head.y && up.x > head.x && Math.abs(up.rotation ?? 0) < 1e-6 && !up.flipX, "on top, peak forward (right)");
  const left = at({ x: 500, y: 500 + r }, "left");
  assert.ok(left.flipX && left.x < head.x, "facing left: peak to the left");
  const tilted = at({ x: 500 - r * Math.sin(0.5), y: 500 + r * Math.cos(0.5) }, "right");
  assert.ok(Math.abs((tilted.rotation ?? 0) - (0.5 * 180) / Math.PI) < 1e-6, "turns with the head");
});

const SMOKE = [SMOKE_DARK, SMOKE_MID, SMOKE_LIGHT];
test("explosions: FAST THEN SLOW — it grows abnormally fast from the impact, snaps to a stop, then breaks up slowly; twice the size", () => {
  const e = EFFECTS.explosion, O = { x: 1000, y: G };
  const tall = (u: number) => { const smoke = e.draw(ctx(u, O), { seed: 5 }).filter((s) => s.kind === "poly" && SMOKE.includes(s.fill ?? "")); return smoke.length ? G - shapeBounds(smoke).minY : 0; };
  const full = tall(BREAK_AT);
  assert.ok(full > 2.2 * H, `twice as big: the cloud ${(full / H).toFixed(2)} figure heights up`);
  assert.ok(tall(0.2) >= 0.9 * full, `90% of its size by 0.2 s (${(tall(0.2) / full).toFixed(2)})`);
  assert.ok(tall(0.1) >= 0.6 * full, "already most of the way at 0.1 s (abnormally fast)");
  const early = (tall(0.15) - tall(0.05)) / 0.1, settled = Math.abs(tall(BREAK_AT) - tall(0.4)) / (BREAK_AT - 0.4);
  assert.ok(settled < 0.06 * early, `then it snaps to almost still (${settled.toFixed(0)} vs ${early.toFixed(0)} px/s)`);
  assert.ok(EXPLOSION_SECONDS - BREAK_AT > 8 * 0.25, "the slow break-up lasts much longer than the growth");
  // the impact picture is still there: the bright fireball (red, orange, yellow) with dirt streaks, right after the flash
  for (const u of [1 / 24, 1 / 12, 1 / 8]) {
    const shapes = e.draw(ctx(u, O), { seed: 5 }), fills = shapes.map((s) => ("fill" in s ? s.fill : undefined));
    assert.ok(["#e53b1c", "#ff8a1f", "#ffd23f"].every((c) => fills.includes(c)), `u ${u.toFixed(3)}: the fireball`);
    assert.ok(shapes.some((s) => s.kind === "line" && (s.stroke === "#5c4330" || s.stroke === "#8a6a4b")), `u ${u.toFixed(3)}: dirt streaks`);
  }
});

const isSmoke = (sh: Shape) => sh.kind === "poly" && SMOKE.includes(sh.fill ?? "");
const hotOf = (shapes: Shape[]) => shapes.filter((sh) => sh.kind === "poly" && (sh.fill === HOT_ORANGE || sh.fill === HOT_YELLOW));
test("explosions: debris are Pebble symbols, never below the ground", () => {
  const e = EFFECTS.explosion, O = { x: 1000, y: G };
  const mid = e.draw(ctx(0.4, O), { seed: 5 });
  assert.ok(mid.filter((sh) => sh.kind === "symbol" && sh.name === "Pebble").length >= 10, "pebbles");
  for (let t = 0; t <= EXPLOSION_SECONDS; t += 1 / 12) for (const sh of e.draw(ctx(t, O), { seed: 5 })) if (sh.kind === "symbol") assert.ok(symbolLowest(sh) <= G + 0.5, `t ${t.toFixed(2)}: ${sh.name} above the ground`);
});

test("explosions: the STEM is twice as thick, the same at the bottom and very slightly wider going up", () => {
  const R = EXPLOSION_SIZE * H;
  assert.ok(Math.abs(stemWidth(0, R) - 2 * 0.27 * R) < 1e-9 && STEM_WIDE === 0.54, "twice the old 0.27 R");
  assert.ok(stemWidth(1, R) > stemWidth(0, R) && stemWidth(1, R) < stemWidth(0, R) * 1.12, "wider by a hair at the top");
  // drawn: the bottom piece of the stem is about that wide at its foot
  const foot = EFFECTS.explosion.draw(ctx(0.5), { seed: 5 }).filter((sh) => sh.kind === "poly" && sh.fill === SMOKE_MID && shapeBounds([sh]).maxY >= G - 1);
  assert.ok(foot.length >= 1);
  const pts = (foot[0] as { points: number[] }).points, xs = pts.filter((_, i) => i % 2 === 0 && pts[i + 1] > G - 2);
  const w = Math.max(...xs) - Math.min(...xs);
  assert.ok(w > 0.8 * stemWidth(0, R) && w < 1.6 * stemWidth(0, R), `foot ${(w / R).toFixed(2)} R`);
});

test("explosions: DUST SPIKES — 2–4, out at the ground cloud's edge with a clear gap from the stem, pointing AWAY from the blast, thick, rough, see-through; most half a figure tall, a big one in about a quarter", () => {
  const O = { x: 1000, y: G }, R = EXPLOSION_SIZE * H;
  let big = 0, wide = 0, count = 0;
  const counts: Record<number, number> = {};
  const u = 0.5, cap = capAt(u, R), stemH = O.y - (O.y - cap.y + cap.r * 0.35);
  for (let seed = 1; seed <= 80; seed += 1) {
    const sp = dustSpikes(O, R, H, seed), tall = sp.map((x) => x.tall / H).sort((a, b) => a - b);
    assert.ok(sp.length >= 2 && sp.length <= 4, `seed ${seed}: 2–4 spikes`);
    counts[sp.length] = (counts[sp.length] ?? 0) + 1;
    assert.ok(tall[0] >= 0.3 && tall[0] <= 0.75, `seed ${seed}: most about half a figure tall`);
    if (tall[tall.length - 1] >= 1) big += 1;
    assert.equal(tall[tall.length - 1] >= 1, hasBigSpikes(seed));
    // NEVER IN THE STEM: every point of every spike keeps a clear gap (≥ 0.15 figure heights) from the stem's outline
    const stem = stemPieces(u, O, R, stemH, seed).map((p) => p.points);
    for (const [i, x] of sp.entries()) {
      const out = spikeOutline(x, i, x.tall, x.wide, seed, u);
      for (let k = 0; k < out.length; k += 2) for (const poly of stem) {
        assert.ok(!inside(out[k], out[k + 1], poly), `seed ${seed} spike ${i}: not inside the stem`);
        assert.ok(distToPoly(out[k], out[k + 1], poly) >= 0.15 * H, `seed ${seed} spike ${i}: a clear gap from the stem (${(distToPoly(out[k], out[k + 1], poly) / H).toFixed(2)} heights)`);
      }
      // pointing AWAY from the blast: base → tip within 60 degrees of straight out from the blast
      const n = out.length / 2, tip = [out[n - 2], out[n - 1]];
      const dir = Math.atan2(tip[1] - x.y, tip[0] - x.x), away = Math.atan2(x.y - O.y, x.x - O.x);
      const diff = Math.abs((((dir - away) * 180) / Math.PI + 540) % 360 - 180);
      assert.ok(diff < 60, `seed ${seed} spike ${i}: points away from the blast (off by ${diff.toFixed(0)} degrees)`);
      if (x.tall < H) { wide += x.wide / H; count += 1; }
    }
  }
  assert.ok(big >= 0.12 * 80 && big <= 0.4 * 80, `a big one in ${big} of 80`);
  // HOW MANY: 2 most of the time (about 60%), 3 now and then (about 30%), 4 rarely (about 10%)
  for (let seed = 81; seed <= 400; seed += 1) { const n = dustSpikes(O, R, H, seed).length; counts[n] = (counts[n] ?? 0) + 1; }
  const total = 400, share = (n: number) => (counts[n] ?? 0) / total;
  assert.ok(share(2) > 0.5 && share(2) < 0.7 && share(3) > 0.2 && share(3) < 0.4 && share(4) > 0.04 && share(4) < 0.16, `2: ${share(2).toFixed(2)}, 3: ${share(3).toFixed(2)}, 4: ${share(4).toFixed(2)}`);
  assert.ok(wide / count > 1.7 * 0.074 && wide / count < 2.3 * 0.074, `thick (${(wide / count).toFixed(3)} x height)`);
  // drawn: gray, see-through, and NOT perfect spikes (bent, bumpy, each side its own bumps)
  const shapes = EFFECTS.explosion.draw(ctx(0.3, O), { seed: 5 }).filter((sh) => sh.kind === "poly" && sh.fill === DUST_SPIKE);
  assert.ok(shapes.length >= 2 && shapes.length <= 4 && shapes.every((sh) => (sh.alpha ?? 1) < 0.7), "2–4 gray see-through jets");
  const sp = dustSpikes(O, R, H, 5)[0], out = spikeOutline(sp, 0, sp.tall, sp.wide, 5, 0.3), n = out.length / 2;
  const left = Array.from({ length: (n / 2) }, (_, m) => [out[2 * m], out[2 * m + 1]]);
  const [x0, y0] = left[0], [x1, y1] = left[left.length - 1], L = Math.hypot(x1 - x0, y1 - y0);
  const dev = Math.max(...left.map(([x, y]) => Math.abs((x - x0) * (y1 - y0) - (y - y0) * (x1 - x0)) / L));
  assert.ok(dev > 0.05 * sp.wide, `not a straight-sided triangle (bumps ${(dev / sp.wide).toFixed(2)} x its width)`);
});

test("explosions: the STEM BREAKS INTO IRREGULAR CHUNKS — uneven, tilted, jagged cuts; varied shapes (a block, a triangle, a lump), never even horizontal slices", () => {
  const O = { x: 1000, y: G }, R = EXPLOSION_SIZE * H;
  const kinds = new Set<number>(), fills: number[] = [], vertexCounts = new Set<number>();
  let tilted = 0, cutsSeen = 0;
  for (let seed = 1; seed <= 12; seed += 1) {
    const u = BREAK_AT + 0.8 + DISINTEGRATE * 0.55, cap = capAt(u, R), stemH = O.y - (O.y - cap.y + cap.r * 0.35);
    // the cut lines: at uneven heights, tilted (not horizontal), jagged
    const cuts = stemCuts(stemH, R, seed), heights = [...cuts.map((c) => c[5]), 1];
    for (const c of cuts) { cutsSeen += 1; if (Math.abs(c[9] - c[1]) * stemH > 0.04 * R) tilted += 1; }
    const gaps = heights.map((h, i) => h - (i ? heights[i - 1] : 0));
    assert.ok(Math.max(...gaps) - Math.min(...gaps) > 0.03, `seed ${seed}: the cuts are not evenly spaced`);
    for (const p of stemPieces(u, O, R, stemH, seed)) {
      kinds.add(p.kind);
      const b = shapeBounds([{ kind: "poly", points: p.points }]);
      fills.push(area(p.points) / ((b.maxX - b.minX) * (b.maxY - b.minY)));
      vertexCounts.add(p.points.length);
    }
  }
  assert.ok(tilted >= 0.8 * cutsSeen, `the cuts are tilted, not horizontal (${tilted} of ${cutsSeen})`);
  assert.equal(kinds.size, 3, "blocks, triangles and lumps");
  assert.ok(Math.max(...fills) - Math.min(...fills) > 0.2, `varied shapes (how full each chunk's box is: ${Math.min(...fills).toFixed(2)}–${Math.max(...fills).toFixed(2)})`);
  // before it breaks it is one column: the pieces fit together (no gaps, no slices showing)
  const u0 = 0.6, cap0 = capAt(u0, R), h0 = O.y - (O.y - cap0.y + cap0.r * 0.35), whole = stemPieces(u0, O, R, h0, 5);
  for (let j = 1; j < whole.length; j += 1) assert.equal(whole[j].gap, 0);
});

test("explosions: NO TWO EXPLOSIONS ALIKE — another seed gives a clearly different cloud, stem and spikes", () => {
  const O = { x: 1000, y: G };
  const look = (seed: number) => { const sh = EFFECTS.explosion.draw(ctx(0.6, O), { seed }); const cloud = shapeBounds(sh.filter(isSmoke)); return { cloud, spikes: sh.filter((x) => x.kind === "poly" && x.fill === DUST_SPIKE).map((x) => shapeBounds([x])) }; };
  const a = look(5), b = look(6), R = EXPLOSION_SIZE * H;
  const diff = Math.max(Math.abs(a.cloud.minX - b.cloud.minX), Math.abs(a.cloud.maxX - b.cloud.maxX), Math.abs(a.cloud.minY - b.cloud.minY));
  assert.ok(diff > 0.08 * R, `the clouds differ (${(diff / R).toFixed(2)} R)`);
  assert.notDeepEqual(capBlobs(5), capBlobs(6));
  assert.ok(a.spikes.length !== b.spikes.length || a.spikes.some((s, i) => Math.abs(s.minY - b.spikes[i].minY) > 0.05 * H), "the spikes differ");
});

// (distance from a point to a polygon's outline)
const distToPoly = (x: number, y: number, pts: number[]) => { let m = Infinity; for (let i = 0; i < pts.length; i += 2) { const j = (i + 2) % pts.length, ax = pts[i], ay = pts[i + 1], bx = pts[j], by = pts[j + 1], dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy || 1, t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / l2)); m = Math.min(m, Math.hypot(x - ax - t * dx, y - ay - t * dy)); } return m; };
// (point in a polygon)
const inside = (x: number, y: number, pts: number[]) => { let c = false; for (let i = 0, j = pts.length - 2; i < pts.length; j = i, i += 2) { const xi = pts[i], yi = pts[i + 1], xj = pts[j], yj = pts[j + 1]; if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c; } return c; };
test("explosions: SMOOTH, NOT ROBOTIC — through the hold the cloud and stem never freeze: they change every picture and keep rising very slowly", () => {
  const O = { x: 1000, y: G }, R = EXPLOSION_SIZE * H, fps = 12;
  const look = (u: number) => EFFECTS.explosion.draw(ctx(u, O), { seed: 5 }).filter((sh) => sh.kind === "poly" && [SMOKE_DARK, SMOKE_MID, SMOKE_LIGHT].includes(sh.fill ?? ""));
  const top = (u: number) => shapeBounds(look(u)).minY;
  const burst = (top(0.05) - top(0.15)) / 0.1;
  for (let k = Math.ceil(GROWN_AT * fps); k < Math.floor(BREAK_AT * fps); k += 1) {
    const a = look(k / fps), b = look((k + 1) / fps);
    let moved = 0;
    for (let i = 0; i < Math.min(a.length, b.length); i += 1) { const p = (a[i] as { points: number[] }).points, q = (b[i] as { points: number[] }).points; for (let j = 0; j < Math.min(p.length, q.length); j += 1) moved = Math.max(moved, Math.abs(p[j] - q[j])); }
    assert.ok(moved > 1, `picture ${k} → ${k + 1}: the smoke moves (${moved.toFixed(1)} px)`);
    const speed = (top(k / fps) - top((k + 1) / fps)) * fps;
    assert.ok(Math.abs(speed) < 0.1 * burst, `picture ${k}: still only drifting (${(speed / H).toFixed(2)} vs the burst's ${(burst / H).toFixed(1)} heights a second)`);
  }
  // it keeps rising over the hold (slowly: about 0.03–0.06 figure heights a second)
  // KEEPS GROWING SLOWLY, the whole time until it is gone: a slow-walk pace (cap about 0.15 heights a second taller,
  // about 0.1 wider)
  for (const [a, b] of [[GROWN_AT + 0.2, BREAK_AT], [BREAK_AT, EXPLOSION_SECONDS]]) {
    const rise = (capAt(b, R).y - capAt(a, R).y) / (b - a) / H, wider = (2 * 1.3 * (capAt(b, R).r - capAt(a, R).r)) / (b - a) / H;
    assert.ok(rise >= 0.12 && rise <= 0.18, `the cap rises ${rise.toFixed(3)} heights a second`);
    assert.ok(wider >= 0.08 && wider <= 0.13, `the cloud widens ${wider.toFixed(3)} heights a second`);
  }
});

test("explosions: HOT SPOTS — 2–3 tears, each ONE flat color (orange or yellow), torn open from the moment the cloud shows, inside its own cloud piece (wobbling a little from the heat), sharing its piece's fade exactly", () => {
  const O = { x: 1000, y: G }, R = EXPLOSION_SIZE * H, fps = 12;
  for (let seed = 1; seed <= 30; seed += 1) {
    const cloud = capCloud(TEAR.at + 1, O, R, seed, 0.6, 1);
    assert.ok(cloud.spots.length >= 2 && cloud.spots.length <= 3, `seed ${seed}: 2–3 hot spots`);
    for (const sp of cloud.spots) assert.ok(sp.shape.kind === "poly" && (sp.shape.fill === HOT_ORANGE || sp.shape.fill === HOT_YELLOW), "one flat orange or yellow");
  }
  assert.ok([1, 2, 3, 4, 5, 6].some((seed) => new Set(capCloud(TEAR.at + 1, O, R, seed, 0.6, 1).spots.map((x) => (x.shape as { fill: string }).fill)).size === 2), "orange or yellow picked per spot");
  // from the FIRST picture the cloud shows in, the blobs are there, tearing open
  const first = Math.ceil(CLOUD_SHOWS * fps + 1e-9) + 1, cloud0 = capCloud(first / fps, O, R, 5, 0.6, 1);
  assert.ok(cloud0.blobs.some((b) => (b.shape.alpha ?? 0) > 0.05) && cloud0.spots.length >= 2 && cloud0.spots.every((x) => (x.shape.alpha ?? 0) > 0), `picture ${first}: the cloud shows and its blobs are tearing open`);
  // every picture: inside its piece, never more opaque than it (its alpha = its own x its piece's), gone together
  const centres: number[][] = [];
  for (let u = TEAR.at; u <= EXPLOSION_SECONDS + 0.01; u += 1 / fps) {
    const cloud = capCloud(u, O, R, 5, 0.6, smokeLeft(u, EXPLOSION_SECONDS));
    for (const sp of cloud.spots) {
      const parent = cloud.blobs[sp.parent].shape as { points: number[]; alpha?: number }, pts = (sp.shape as { points: number[] }).points;
      for (let i = 0; i < pts.length; i += 2) assert.ok(inside(pts[i], pts[i + 1], parent.points), `u ${u.toFixed(2)}: the spot is inside its cloud piece`);
      assert.ok((sp.shape.alpha ?? 1) <= (parent.alpha ?? 1) + 0.05, `u ${u.toFixed(2)}: no more opaque than its piece`);
      assert.ok(Math.abs((sp.shape.alpha ?? 1) - spotAlpha(u) * (parent.alpha ?? 1)) < 1e-9, `u ${u.toFixed(2)}: its alpha = its own x its piece's`);
    }
    if ((cloud.blobs[0].shape.alpha ?? 0) < 0.005) assert.equal(cloud.spots.length, 0, "gone together");
    const sp0 = cloud.spots[0];
    if (sp0) { const b = shapeBounds([sp0.shape]), pb = shapeBounds([cloud.blobs[sp0.parent].shape]); centres.push([(b.minX + b.maxX) / 2 - (pb.minX + pb.maxX) / 2, (b.minY + b.maxY) / 2 - (pb.minY + pb.maxY) / 2]); }
  }
  const xs = centres.map((c) => c[0]), ys = centres.map((c) => c[1]);
  assert.ok(Math.max(...xs) - Math.min(...xs) > 2 || Math.max(...ys) - Math.min(...ys) > 2, "it wobbles a few px inside its piece");
  // opening: from a thin crack, growing over many pictures, then shrinking back a little
  const hot = (u: number) => capCloud(u, O, R, 5, 0.6, 1).spots.reduce((sum, x) => sum + area((x.shape as { points: number[] }).points), 0);
  const areas = Array.from({ length: Math.round((TEAR.open + TEAR.shrink) * fps) }, (_, k) => hot(TEAR.at + 0.01 + k / fps)), most = Math.max(...areas), peakAt = areas.indexOf(most);
  assert.ok(areas[0] < 0.05 * most, `starts as thin cracks (${(areas[0] / most).toFixed(3)})`);
  for (let k = 1; k <= peakAt; k += 1) assert.ok(areas[k] > areas[k - 1], `opens little by little, picture by picture (${k})`);
  assert.ok(peakAt >= 4 && areas[areas.length - 1] < 0.95 * most, `opens over ${peakAt} pictures, then shrinks back a little`);
  // BIG AND BRIGHT while the explosion holds: at the start of the hold each blob is at least 1/50 of its piece and
  // nearly as solid as it (the gray is still dense)
  const hold = capCloud(GROWN_AT, O, R, 5, 0.6, 1);
  for (const sp of hold.spots) {
    const parent = hold.blobs[sp.parent].shape as { points: number[]; alpha?: number };
    assert.ok(area((sp.shape as { points: number[] }).points) >= area(parent.points) / 50, `a blob is ${(area((sp.shape as { points: number[] }).points) / area(parent.points)).toFixed(3)} of its piece`);
    assert.ok((sp.shape.alpha ?? 1) >= 0.8 * (parent.alpha ?? 1) && (parent.alpha ?? 1) > 0.8, "bright: as solid as its dense gray piece");
  }
  // hot parts while it breaks up: orange and yellow only (no red hue below 20 degrees)
  for (let u = BREAK_AT; u <= EXPLOSION_SECONDS; u += 1 / 6) for (const sh of EFFECTS.explosion.draw(ctx(u, O), { seed: 5 })) {
    const fill = sh.kind === "poly" || sh.kind === "circle" ? sh.fill : undefined;
    if (!fill || !fill.startsWith("#") || fill.length !== 7) continue;
    const { hue, sat } = hueOf(fill);
    if (sat > 0.6 && (sh.alpha ?? 1) > 0.05) assert.ok(hue >= 20 && hue <= 65, `u ${u.toFixed(2)}: ${fill} (hue ${hue.toFixed(0)}) is orange or yellow`);
  }
});

test("explosions: it is gone about 3 seconds after the stop (cloud, stem and ground dust), and the stem is one solid gray (no light line down it)", () => {
  const O = { x: 1000, y: G };
  const smokeAlpha = (u: number) => Math.max(0, ...EFFECTS.explosion.draw(ctx(u, O), { seed: 5 }).filter((sh) => isSmoke(sh) || (sh.kind === "poly" && (sh.fill === "#ab9478" || sh.fill === DUST_SPIKE))).map((sh) => sh.alpha ?? 1));
  assert.ok(Math.abs(EXPLOSION_SECONDS - GROWN_AT - 3) < 0.05, "about 3 s after the stop");
  assert.ok(smokeAlpha(GROWN_AT + 2) > 0.15, "still there 2 s after the stop");
  assert.ok(smokeAlpha(GROWN_AT + 2.95) < 0.05, "gone about 3 s after the stop");
  for (let u = 0; u <= EXPLOSION_SECONDS; u += 1 / 6) assert.ok(!EFFECTS.explosion.draw(ctx(u, O), { seed: 5 }).some((sh) => sh.kind === "line" && sh.stroke === SMOKE_LIGHT), `u ${u.toFixed(2)}: no line down the stem`);
});

test("explosions: ACCESSORIES COVER THE BODY PART — the cap sits down over the top of the head, as wide as it", () => {
  const r = 0.07 * H, stroke = 7;
  for (const tilt of [-0.6, 0, 0.4, 1.2]) for (const facing of ["left", "right"] as const) {
    const head = { x: 500, y: 500 }, neck = { x: 500 - r * Math.sin(tilt), y: 500 + r * Math.cos(tilt) };
    const cap = EFFECTS.militaryCap.draw(ctx(0, head, { target: neck, facing }), {})[0] as Extract<Shape, { kind: "symbol" }>;
    const c = capCoverOf(cap, head, r, stroke);
    assert.ok(c.left >= 0 && c.right >= 0, `${facing} ${tilt}: as wide as the head and its outline (${c.left.toFixed(2)}, ${c.right.toFixed(2)})`);
    assert.ok(c.over >= 0, `${facing} ${tilt}: no head above it`);
    assert.ok(c.down >= 0.5, `${facing} ${tilt}: comes down over the head (${c.down.toFixed(2)} r ≥ a quarter of the head)`);
    assert.ok(c.down <= 1.1, `${facing} ${tilt}: the face still shows`);
  }
});
