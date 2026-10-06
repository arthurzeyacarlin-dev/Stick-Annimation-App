import assert from "node:assert/strict";
import { test } from "node:test";
import { buildScene } from "../engine.ts";
import { LIBRARY } from "../moves/library.ts";
import { fitBackgroundPlanToPage, planToScene, type ScenePlan } from "../moves/plan.ts";
import { parkourPlan } from "../moves/scenes2c.ts";
import { effectsTestScenes, makeEffectsTestScene } from "../moves/tests2c.ts";
import { JOINTS } from "../rig.ts";
import { rainyWindyDayPlan, waterfallPlan } from "../moves/scenesBackgrounds.ts";
import { PLACED_SYMBOLS, shapeBounds, spikeBody } from "../symbolMaker.ts";
import { centerAnimation } from "../stageFit.ts";
import { rasterizeShapeFrames, sceneEffectLayers, type RasterFrame } from "../toFrames.ts";
import { BACKGROUNDS, spikeRow } from "./backgrounds.ts";
import { BACKGROUND_PIECES, buildEffectFrames } from "./index.ts";
import { movingBackgroundLayers } from "./movingBackground.ts";
import type { Shape, SymbolShape } from "./types.ts";

// SPEC-0017 Phase 2C: BACKGROUNDS are recipes with knobs, on their own layer; the PARKOUR test hops over 3 spikes.
const STAGE = { width: 1920, groundY: 900, height: 150 };
const KINDS = ["sky", "sun", "clouds", "ground", "hills", "trees", "grass", "spikes", "pit", "water", "rain", "waterfall"];

test("every background piece kind is there and draws shapes", () => {
  assert.deepEqual(BACKGROUNDS.map((r) => r.id).sort(), [...KINDS].sort());
  for (const kind of KINDS) assert.ok(BACKGROUND_PIECES[kind].draw({ kind, params: { seed: 2 } }, 1.5, STAGE).length > 0, kind);
});

test("backgrounds are deterministic: the same t and knobs always give the same shapes", () => {
  for (const kind of KINDS) {
    const piece = { kind, params: { seed: 5, count: 4, time: "night" } };
    for (const t of [0, 0.37, 4.2]) assert.deepEqual(BACKGROUND_PIECES[kind].draw(piece, t, STAGE), BACKGROUND_PIECES[kind].draw(piece, t, STAGE), `${kind} @ ${t}`);
  }
});

test("clouds drift with t (and wrap round the page); hills and ground stand still", () => {
  const draw = (kind: string, t: number) => BACKGROUND_PIECES[kind].draw({ kind, params: { seed: 1, count: 3 } }, t, STAGE);
  const xs = (t: number) => draw("clouds", t).filter((s) => s.kind === "circle").map((s) => (s.kind === "circle" ? s.x : 0));
  assert.notDeepEqual(xs(0), xs(2));
  assert.ok(xs(2)[0] > xs(0)[0], "speed 1 drifts to the right");
  for (const t of [0, 30, 300]) for (const x of xs(t)) assert.ok(x > -400 && x < STAGE.width + 400, `cloud stays near the page at t=${t}`);
  const left = BACKGROUND_PIECES.clouds.draw({ kind: "clouds", params: { seed: 1, count: 3, speed: -1 } }, 2, STAGE).find((s) => s.kind === "circle");
  assert.ok(left && left.kind === "circle" && left.x < (xs(0)[0] ?? 0), "negative speed drifts left");
  assert.deepEqual(draw("hills", 0), draw("hills", 3));
  assert.deepEqual(draw("ground", 0), draw("ground", 3));
  assert.notDeepEqual(draw("trees", 0), draw("trees", 1.3), "trees sway");
  assert.notDeepEqual(draw("water", 0), draw("water", 1.3), "waves move");
});

test("knobs are obeyed: colors, count, position", () => {
  const sky = BACKGROUND_PIECES.sky.draw({ kind: "sky", params: { color: "#112233", color2: "#445566" } }, 0, STAGE)[0];
  assert.ok(sky.kind === "rect" && sky.fill === "#112233" && sky.fill2 === "#445566");
  const row = (count: number) => BACKGROUND_PIECES.spikes.draw({ kind: "spikes", params: { x: 700, count, size: 0.3 } }, 0, STAGE).filter((s) => s.kind === "symbol" && s.name === "Spike");
  assert.equal(row(1).length, 1);
  assert.equal(row(4).length, 4);
  const pit = BACKGROUND_PIECES.pit.draw({ kind: "pit", params: { x: 800, w: 200 } }, 0, STAGE)[0];
  assert.ok(pit.kind === "rect" && pit.x === 700 && pit.w === 200 && pit.y <= STAGE.groundY && pit.y + pit.h > STAGE.groundY + 100, "the pit is cut into the ground");
});

test("spikes stand ON the ground: their bases sit on the ground line, the tips point up", () => {
  // STILL THINGS ARE SYMBOLS: each spike is the "Spike" Library symbol, placed once per spike.
  const shapes = BACKGROUND_PIECES.spikes.draw({ kind: "spikes", params: { x: 600, count: 3, size: 0.3 } }, 0, STAGE);
  const spikes = shapes.filter((s) => s.kind === "symbol" && s.name === "Spike");
  assert.equal(spikes.length, 3);
  assert.equal(shapes.length, 3, "nothing else is drawn");
  const body = spikeBody(PLACED_SYMBOLS.Spike.size);
  for (const s of spikes) {
    if (s.kind !== "symbol") continue;
    const half = (body.height * (s.scale ?? 1)) / 2;
    assert.ok(Math.abs(s.y + half - STAGE.groundY) < 1e-9, "base on the ground");
    assert.ok(Math.abs(s.y - half - (STAGE.groundY - 0.3 * STAGE.height)) < 1e-9, "tip at its size above the ground");
    assert.ok(Math.abs(body.width * (s.scale ?? 1) - 0.8 * 0.3 * STAGE.height) < 1e-9, "0.8 as wide as tall");
  }
  for (const s of shapes) {
    const ys = s.kind === "rect" ? [s.y, s.y + s.h] : s.kind === "circle" ? [s.y + s.r] : s.kind === "symbol" ? [s.y] : s.points.filter((_, i) => i % 2 === 1);
    assert.ok(Math.max(...ys) <= STAGE.groundY + 1e-9, "nothing below the ground line");
  }
});

// THE PARKOUR TEST: run, jump, land ×3 over 3 rows of spikes, then tired (bent over, hands on knees).
const plan = parkourPlan();
const scene = planToScene(plan, LIBRARY);
const FPS = 120;
const frames = buildScene(scene, FPS).frames;
const spikeRows = (p: ScenePlan) => (p.background?.pieces ?? []).filter((x) => x.kind === "spikes").map((x) => spikeRow(x.params ?? {}, { ...STAGE, height: p.height }));
const rows = spikeRows(plan);
const THICK = 6; // the line's half-width plus a little: a drawn foot must not touch a spike either

test("the parkour scene has its background: sky, sun, clouds, hills, ground and 3 rows of spikes", () => {
  assert.deepEqual((plan.background?.pieces ?? []).map((p) => p.kind), ["sky", "sun", "clouds", "hills", "ground", "spikes", "spikes", "spikes"]);
  assert.equal(scene.durationSec > 8, true);
  assert.ok(["catchBreath1", "jump1", "jump2", "jump3"].every((m) => Object.keys(scene.marks).some((k) => k.startsWith(`a.${m}`))));
  const fx = buildEffectFrames({ ...scene, stageWidth: 1920 }, { fps: 12, frames: frames.filter((_, i) => i % 10 === 0), report: undefined as never, objects: [] });
  assert.ok(fx.every((f) => f.background.length > 20), "every picture draws the background");
  for (const r of rows) assert.ok(r.left > 40 && r.right < 1880, "spikes are on the page");
});

// The spike checks, for the scene as written (16:9) and zoomed out to fit a square and a tall (9:16) page: the
// figure and the spikes shrink together, so every jump still clears its spikes.
const PAGES = [{ name: "16:9", stageWidth: 1920 }, { name: "1:1", stageWidth: 1080 }, { name: "9:16", stageWidth: (1080 * 9) / 16 }];
const fittedParkour = PAGES.map((page) => {
  const fitted = fitBackgroundPlanToPage(plan, LIBRARY, page.stageWidth);
  const fittedScene = planToScene(fitted, LIBRARY);
  return { page, plan: fitted, scene: fittedScene, frames: buildScene(fittedScene, FPS).frames, rows: spikeRows(fitted) };
});

test("parkour fits each page by zooming out figure and background together (16:9 is unchanged)", () => {
  assert.deepEqual(fittedParkour[0].plan, plan, "16:9: built as written");
  for (const { page, plan: fitted } of fittedParkour.slice(1)) {
    const k = fitted.height / plan.height;
    assert.ok(k < 1, `${page.name}: zoomed out`);
    for (const [i, r] of spikeRows(fitted).entries()) assert.ok(Math.abs((r.left + r.right) / 2 - (960 + ((rows[i].left + rows[i].right) / 2 - 960) * k)) < 1e-6, `${page.name}: row ${i + 1} moved with the zoom`);
  }
});

for (const { page, scene: s, frames: f, rows: rs } of fittedParkour) {
  test(`parkour (${page.name} page): nothing lands on a spike (no foot is ever down over a row of spikes)`, () => {
    for (const [k, r] of rs.entries()) {
      f.forEach((fr, i) => {
        const S = fr[0].skeleton;
        for (const foot of [S.lFoot, S.rFoot]) {
          const over = foot.x > r.left - THICK && foot.x < r.right + THICK;
          assert.ok(!(over && foot.y > r.base - r.tall), `frame ${i} (${(i / FPS).toFixed(2)}s): a foot at x=${foot.x.toFixed(0)} y=${foot.y.toFixed(0)} is in spike row ${k + 1}`);
        }
      });
    }
  });

  test(`parkour (${page.name} page): the feet clear each spike's tip, passing over it in the air, one row per jump`, () => {
    for (const [k, r] of rs.entries()) {
      for (const tip of r.tips) {
        // Every moment a foot passes over the tip, it is above it (with room for the drawn line).
        let passes = 0;
        for (let i = 1; i < f.length; i += 1) {
          for (const j of ["lFoot", "rFoot"] as const) {
            const a = f[i - 1][0].skeleton[j], b = f[i][0].skeleton[j];
            if ((a.x - tip.x) * (b.x - tip.x) > 0) continue; // this foot didn't cross the tip's x in this step
            passes += 1;
            const u = b.x === a.x ? 0 : (tip.x - a.x) / (b.x - a.x), y = a.y + (b.y - a.y) * u;
            assert.ok(y < tip.y - THICK, `row ${k + 1}: a foot crosses the tip at x=${tip.x.toFixed(0)} at y=${y.toFixed(0)} (tip ${tip.y.toFixed(0)})`);
          }
        }
        assert.equal(passes, 2, `row ${k + 1}: both feet pass over the tip once`);
      }
      // ...and it is a jump that clears it: the row is between that jump's take-off and landing.
      const at = (m: string) => f[Math.round(s.marks[`a.jump${k + 1}.${m}`] * FPS)][0].skeleton;
      assert.ok(Math.max(at("takeoff").lFoot.x, at("takeoff").rFoot.x) < r.left + r.wide && Math.min(at("land").lFoot.x, at("land").rFoot.x) > r.right - r.wide, `row ${k + 1} lies under jump ${k + 1}`);
    }
  });
}

// THE PAGE RULE for every 2C test scene (Arthur: the parkour runner "went off the canvas... he just disappeared"):
// built for the page like the app does (makeEffectsTestScene, then centered), no joint of any figure ever leaves
// the page, on a wide, a square or a tall page.
test("no figure ever leaves the page in any 2C test scene, on 16:9, 1:1 and 9:16 pages", () => {
  for (const entry of effectsTestScenes()) {
    if (!entry.plan) continue;
    for (const page of PAGES) {
      const built = buildScene(makeEffectsTestScene(entry.plan, page.stageWidth), 60);
      const { frames: shown } = centerAnimation(built.frames, page.stageWidth, built.objects);
      const left = 960 - page.stageWidth / 2, right = 960 + page.stageWidth / 2;
      shown.forEach((characters, i) => {
        for (const c of characters) for (const name of JOINTS) {
          if (c.offPage) continue; // (THE CAMERA: running off the page, or in from its edge, on purpose around a film cut — moves/camera.test.ts)
          const p = c.skeleton[name];
          assert.ok(p.x >= left && p.x <= right && p.y >= 0 && p.y <= 1080, `${entry.id} (${page.name}) frame ${i}: ${c.id}.${name} at (${p.x.toFixed(0)}, ${p.y.toFixed(0)}) is off the page`);
        }
      });
    }
  }
});

test("parkour ends tired: bent over, hands on the knees", () => {
  const t = scene.marks["a.catchBreath1.bentOver"];
  assert.ok(t !== undefined);
  const S = frames[Math.round((t + 0.3) * FPS)][0].skeleton;
  assert.ok(S.neck.y > S.hip.y - 0.5 * plan.height, "bent over");
  for (const hand of [S.lHand, S.rHand]) assert.ok(Math.min(Math.hypot(hand.x - S.lKnee.x, hand.y - S.lKnee.y), Math.hypot(hand.x - S.rKnee.x, hand.y - S.rKnee.y)) < 0.15 * plan.height, "hand on a knee");
});

// ---- MOVING BACKGROUNDS (SPEC-0017 Phase 2C extras, 2026-10-06): rain, trees and grass in the wind, a waterfall ----
// Arthur: "teach the engine how to animate backgrounds — rain, trees moving in the wind, a waterfall".
const BIG = { width: 1920, groundY: 900, height: 300 };
const drawPiece = (kind: string, params: Record<string, unknown>, t: number) => BACKGROUND_PIECES[kind].draw({ kind, params: { seed: 3, ...params } }, t, BIG);
const symbolsNamed = (shapes: readonly Shape[], name: string) => shapes.filter((s): s is SymbolShape => s.kind === "symbol" && s.name === name);
const centreOf = (s: Shape) => { const b = shapeBounds([s]); return { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 }; };
const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
const nearest = <T extends { x: number; y: number }>(list: readonly T[], p: { x: number; y: number }) => list.reduce((best, e) => (Math.hypot(e.x - p.x, e.y - p.y) < Math.hypot(best.x - p.x, best.y - p.y) ? e : best));

test("rain falls, slants with the wind (each drop turned along its fall) and splashes on the ground", () => {
  for (const wind of [0.8, -0.8, 0]) {
    const moves: { dx: number; dy: number; rotation: number }[] = [];
    for (const t of [0.3, 1.1, 2.7]) {
      const a = symbolsNamed(drawPiece("rain", { wind, intensity: 0.7 }, t), "Raindrop"), b = symbolsNamed(drawPiece("rain", { wind, intensity: 0.7 }, t + 0.02), "Raindrop");
      assert.ok(a.length > 15, `plenty of drops (${a.length})`);
      for (const d of a) { // (the same drop a moment later: close by, turned exactly the same — its slant is set for its whole fall)
        const same = b.filter((e) => e.rotation === d.rotation && e.scale === d.scale);
        const e = same.length ? nearest(same, d) : undefined;
        if (e && Math.hypot(e.x - d.x, e.y - d.y) < 30) moves.push({ dx: e.x - d.x, dy: e.y - d.y, rotation: d.rotation ?? 0 });
      }
    }
    assert.ok(moves.length > 60);
    assert.ok(median(moves.map((m) => m.dy)) > 10, "they fall");
    const dx = median(moves.map((m) => m.dx));
    if (wind > 0) assert.ok(dx > 3 && moves.every((m) => m.rotation < 0), `blown to the right (${dx.toFixed(1)} px)`);
    if (wind < 0) assert.ok(dx < -3 && moves.every((m) => m.rotation > 0), `blown to the left (${dx.toFixed(1)} px)`);
    if (wind === 0) assert.ok(Math.abs(dx) < 1e-6 && moves.every((m) => Math.abs(m.rotation) < 1e-6), "no wind: straight down");
    // Each streak is turned along the way it falls (the head leads, the tail trails).
    if (wind !== 0) for (const m of moves) assert.ok(Math.abs(Math.atan2(m.dx, m.dy) + (m.rotation * Math.PI) / 180) < 0.02, "turned along its fall");
  }
  // Splashes: drawn where drops hit, on the ground, across the page; drops never go under the ground.
  let splashes = 0;
  for (let i = 0; i < 48; i += 1) {
    for (const s of drawPiece("rain", { wind: 0.5 }, i / 12)) {
      if (s.kind === "symbol") { assert.ok(s.y < BIG.groundY + 0.1 * BIG.height, "no drop under the ground"); continue; }
      splashes += 1;
      const c = centreOf(s);
      assert.ok(c.y > BIG.groundY - 0.08 * BIG.height && c.y < BIG.groundY + 0.12 * BIG.height, `a splash sits on the ground (y ${c.y.toFixed(0)})`);
      assert.ok(c.x > -400 && c.x < BIG.width + 400, "splashes land on the page (and just past its edges, for when the scene is slid)");
    }
  }
  assert.ok(splashes > 40, `drops splash where they hit (${splashes} splash shapes in 4 s)`);
  const count = (intensity: number) => symbolsNamed(drawPiece("rain", { intensity, wind: 0 }, 1), "Raindrop").length;
  assert.ok(count(0.2) < count(0.6) && count(0.6) < count(1), "drizzle → storm: more drops");
});

test("trees in the wind bend: the foot never moves, the top moves most, they lean downwind (more in gusts), smoothly", () => {
  const pics = Array.from({ length: 72 }, (_, i) => drawPiece("trees", { wind: 0.8, count: 3, shape: "round", leaves: 0 }, i / 12));
  for (let k = 0; k < 3; k += 1) {
    const trunk = (i: number) => pics[i][k * 6] as Extract<Shape, { kind: "poly" }>, top = (i: number) => pics[i][k * 6 + 4] as Extract<Shape, { kind: "circle" }>;
    const foot = trunk(0).points.slice(0, 2).concat(trunk(0).points.slice(-2));
    const footX = (foot[0] + foot[2]) / 2;
    const tops = pics.map((_, i) => top(i).x), trunkTops = pics.map((_, i) => trunk(i).points[8]);
    for (let i = 0; i < pics.length; i += 1) assert.deepEqual(trunk(i).points.slice(0, 2).concat(trunk(i).points.slice(-2)), foot, "the foot of the trunk never moves");
    const range = (xs: number[]) => Math.max(...xs) - Math.min(...xs);
    assert.ok(range(tops) > range(trunkTops) * 1.3 && range(trunkTops) > 2, `the crown sways more than the top of the trunk (${range(tops).toFixed(0)} vs ${range(trunkTops).toFixed(0)} px)`);
    const rest = (drawPiece("trees", { count: 3, shape: "round", sway: 0 }, 0)[k * 6 + 4] as Extract<Shape, { kind: "circle" }>).x; // no wind, no sway
    assert.ok(footX > 0 && tops.reduce((a, b) => a + b, 0) / tops.length > rest + 10, "it leans downwind");
    const steps = tops.slice(1).map((x, i) => Math.abs(x - tops[i]));
    assert.ok(Math.max(...steps) < 0.25 * range(tops), `smooth: no jumps between pictures (biggest step ${Math.max(...steps).toFixed(1)} px of ${range(tops).toFixed(0)})`);
  }
  // No wind: exactly the calm trees as before.
  for (const t of [0, 1.3]) assert.deepEqual(drawPiece("trees", { count: 3, wind: 0 }, t), drawPiece("trees", { count: 3 }, t));
  // A leaf blows off now and then, flies downwind and never goes under the ground.
  const leafPics = Array.from({ length: 120 }, (_, i) => symbolsNamed(drawPiece("trees", { wind: 0.8, count: 3 }, i / 12), "Leaf"));
  assert.ok(leafPics.some((l) => l.length > 0), "leaves blow off");
  let downwind = 0, upwind = 0;
  leafPics.forEach((list, i) => {
    for (const leaf of list) {
      assert.ok(leaf.y <= BIG.groundY, "a leaf is never under the ground");
      if (i > 0 && leafPics[i - 1].length) { const prev = nearest(leafPics[i - 1], leaf); if (Math.hypot(prev.x - leaf.x, prev.y - leaf.y) < 60) (leaf.x > prev.x ? (downwind += 1) : (upwind += 1)); }
    }
  });
  assert.ok(downwind > 3 * upwind, `leaves are carried downwind (${downwind} vs ${upwind})`);
});

test("grass is still without wind; in the wind its blades bend downwind, the tips most, the roots never", () => {
  assert.deepEqual(drawPiece("grass", {}, 0), drawPiece("grass", {}, 2.3));
  const pics = Array.from({ length: 48 }, (_, i) => drawPiece("grass", { wind: 0.7, count: 10 }, i / 12) as Extract<Shape, { kind: "poly" }>[]);
  for (let k = 0; k < 10; k += 1) {
    const roots = (i: number) => [...pics[i][k].points.slice(0, 2), ...pics[i][k].points.slice(-2)];
    const tipX = pics.map((p) => { const pts = p[k].points; let best = 1; for (let j = 3; j < pts.length; j += 2) if (pts[j] < pts[best]) best = j; return pts[best - 1]; });
    for (let i = 1; i < pics.length; i += 1) assert.deepEqual(roots(i), roots(0), "roots stay put");
    const calm = drawPiece("grass", { count: 10 }, 0)[k] as Extract<Shape, { kind: "poly" }>;
    let top = 1;
    for (let j = 3; j < calm.points.length; j += 2) if (calm.points[j] < calm.points[top]) top = j;
    assert.ok(Math.max(...tipX) - Math.min(...tipX) > 1, "the tips sway");
    assert.ok(median(tipX) > calm.points[top - 1] + 2, "bent downwind");
  }
});

test("a waterfall pours: bands move down, ripples spread, foam churns, mist rises; the cliff and the pool stay still", () => {
  const p = { x: 1300, w: 170 };
  const a = drawPiece("waterfall", p, 1), b = drawPiece("waterfall", p, 1.04), c = drawPiece("waterfall", p, 2.6);
  assert.deepEqual(a.slice(0, 6), c.slice(0, 6), "cliff (face, shadow, two ledges, grass on top) and pool are still");
  assert.notDeepEqual(a.slice(6), b.slice(6), "the water moves");
  const bands = (shapes: Shape[]) => shapes.filter((s) => s.kind === "poly" && s.alpha === 0.9).map(centreOf);
  let down = 0, up = 0;
  for (const band of bands(a)) { const next = nearest(bands(b), band); if (Math.abs(next.x - band.x) < 8) (next.y > band.y ? (down += 1) : (up += 1)); }
  assert.ok(down >= 3 && up === 0, `the bands move down (${down} down, ${up} up)`);
  const widths = (shapes: Shape[]) => shapes.filter((s) => s.kind === "line" && s.alpha !== undefined).map((s) => { const q = shapeBounds([s]); return q.maxX - q.minX; }).sort((x, y) => x - y);
  assert.equal(widths(a).length, 3, "three ripples");
  assert.ok(widths(b).filter((wb) => widths(a).some((wa) => wb > wa && wb - wa < 20)).length >= 2, "the ripples spread out");
  const mist = (shapes: Shape[]) => shapes.filter((s) => s.kind === "poly" && s.fill === "#ffffff" && (s.alpha ?? 1) < 0.5).map(centreOf);
  let rising = 0;
  for (const m of mist(a)) { const next = nearest(mist(b), m); if (Math.abs(next.x - m.x) < 15 && next.y < m.y) rising += 1; }
  assert.ok(rising >= 2, `the mist rises (${rising} of ${mist(a).length})`);
  const foam = (shapes: Shape[]) => shapes.filter((s) => s.kind === "poly" && s.alpha === undefined).slice(-8);
  assert.notDeepEqual(foam(a), foam(b), "the foam churns (its wavy outline changes every picture)");
  const H = BIG.height, lip = BIG.groundY - 1.7 * H;
  for (const t of [0, 0.5, 1, 1.5, 2, 2.5, 3]) for (const s of drawPiece("waterfall", p, t).slice(6)) {
    const box = shapeBounds([s]);
    assert.ok(box.minY > lip - 0.1 * H && box.maxY < BIG.groundY + 0.25 * H, "the water stays between the lip and the pool");
  }
});

test("moving test scenes: every picture moves at 12 fps, ≤ 120 shapes per picture, nothing off the page oddly", () => {
  for (const plan of [rainyWindyDayPlan(), waterfallPlan()]) {
    const s = makeEffectsTestScene(plan, 1920), fx = buildEffectFrames({ ...s, stageWidth: 1920 }, buildScene(s, 12));
    const H = s.characters[0].height ?? 300;
    fx.forEach((f, i) => {
      if (i > 0) assert.notDeepEqual(f.background, fx[i - 1].background, `${plan.id}: picture ${i} moves`);
      assert.ok(f.background.length <= 120, `${plan.id}: ${f.background.length} shapes in picture ${i}`);
      for (const shape of f.background) {
        if (shape.kind === "rect") continue; // the sky and ground run past the page on purpose
        const box = shapeBounds([shape]), mid = centreOf(shape);
        assert.ok(mid.x > -0.45 * 1920 && mid.x < 1.45 * 1920 && box.minY > -50 && box.maxY < s.groundY + 0.3 * H, `${plan.id} picture ${i}: a ${shape.kind} at (${mid.x.toFixed(0)}, ${mid.y.toFixed(0)})`);
        if (shape.kind === "symbol") assert.ok(shape.y <= s.groundY + 0.1 * H, `${plan.id}: no ${shape.name} under the ground`);
      }
    });
  }
});

// The app's layers (DrawingWorkspace applyAnimatorScene): built exactly like the app builds them.
const appLayers = (plan: ScenePlan, stageWidth = 1920) => {
  const s = makeEffectsTestScene(plan, stageWidth), built = buildScene(s, 12);
  const centered = centerAnimation(built.frames, stageWidth, built.objects);
  const layers = sceneEffectLayers(s, built, centered.shift);
  return { scene: s, built, layers, split: movingBackgroundLayers(s, built, centered.shift, layers.background ?? []) };
};

test("app layers: the still part is one picture; rain and wind get their own layers above it; drawing order is kept", () => {
  for (const [plan, names] of [[rainyWindyDayPlan(), ["rain", "wind"]], [waterfallPlan(), ["water"]]] as const) {
    const { layers, split } = appLayers(plan);
    assert.ok(split && layers.background, plan.id);
    assert.deepEqual(split.layers.map((l) => l.name), names, `${plan.id}: layers top to bottom`);
    split.still.forEach((still) => assert.deepEqual(still, split.still[0], "the still part is the same in every picture"));
    assert.ok(split.still[0].some((x) => x.kind === "rect" && x.w > 1920), "sky and ground stay in the background layer");
    layers.background.forEach((picture, i) => {
      // Every shape is in exactly one layer; a shape is never below one drawn before it that it overlaps.
      const lane = new Map<string, number>();
      split.still[i].forEach((x) => lane.set(JSON.stringify(x), 0));
      split.layers.forEach((l, k) => l.pictures[i].forEach((x) => lane.set(JSON.stringify(x), split.layers.length - k)));
      assert.equal(split.still[i].length + split.layers.reduce((n, l) => n + l.pictures[i].length, 0), picture.length);
      const lanes = picture.map((x) => lane.get(JSON.stringify(x))!), boxes = picture.map((x) => shapeBounds([x]));
      for (let j = 0; j < picture.length; j += 1) for (let q = 0; q < j; q += 1) {
        if (lanes[q] <= lanes[j]) continue;
        const A = boxes[q], B = boxes[j];
        assert.ok(!(A.minX < B.maxX && B.minX < A.maxX && A.minY < B.maxY && B.minY < A.maxY), `${plan.id} picture ${i}: shape ${j} would end up under shape ${q}`);
      }
    });
    for (const s of split.layers.find((l) => l.name === "rain")?.pictures.flat() ?? []) assert.ok(s.kind !== "symbol" || s.name === "Raindrop", "only rain on the rain layer");
  }
  // A scene without rain, a waterfall or wind is left exactly as before.
  assert.equal(appLayers(parkourPlan()).split, null);
  // (A scene with film cuts or a screen shake is split shot by shot by animator/cameraLayers.ts — camera.test.ts.)
});

test("memory: the moving layers are drawn every picture under the app's memory guard (one background layer was not)", () => {
  // Node has no canvas: a stand-in that makes real-sized pictures (as effectsFrames.test.ts does).
  const ctx = new Proxy({} as Record<string, unknown>, {
    get: (target, name: string) => name in target ? target[name] : (...args: number[]) => name === "createLinearGradient" ? { addColorStop: () => undefined } : name === "getImageData" ? { data: new Uint8ClampedArray(args[2] * args[3] * 4) } : undefined,
    set: (target, name: string, value) => { target[name] = value; return true; },
  });
  const g = globalThis as unknown as Record<string, unknown>;
  g.ImageData = class { width: number; height: number; data: Uint8ClampedArray; constructor(w: number, h: number) { this.width = w; this.height = h; this.data = new Uint8ClampedArray(w * h * 4); } };
  g.OffscreenCanvas = class { width: number; height: number; constructor(w: number, h: number) { this.width = w; this.height = h; } getContext() { return ctx; } };
  // A 1000 x 562 page on a 1x screen (the app's world canvas is 4.6 x the page); the guard is the app's 256 MB / 4
  // (the same as 256 MB on a 2x screen, where every picture is 4 x bigger).
  const W = 1000, Hp = 562, cw = Math.floor(W * 4.6), ch = Math.floor(Hp * 4.6), k = Hp / 1080, guard = (256 * 1024 * 1024) / 4;
  const map = { scale: k, offsetX: W / 2 - 960 * k + 1.8 * W, offsetY: 1.8 * Hp }, clip = { x0: 1.8 * W, y0: 1.8 * Hp, x1: 2.8 * W, y1: 2.8 * Hp };
  for (const plan of [rainyWindyDayPlan(), waterfallPlan()]) {
    const { layers, split } = appLayers(plan, (W * 1080) / Hp);
    const drawn = (pictures: RasterFrame[]) => pictures.filter((x) => !x.hold).length;
    const old = rasterizeShapeFrames(layers.background!, cw, ch, map, { maxBytes: guard, skipSymbolShapes: true });
    assert.ok(drawn(old) < old.length / 4, `${plan.id}: one big layer is redrawn only ${drawn(old)} of ${old.length} times (jumpy)`);
    assert.equal(drawn(rasterizeShapeFrames(split!.still, cw, ch, map, { maxBytes: guard, skipSymbolShapes: true })), 1, "the still part: one picture");
    for (const l of split!.layers) {
      const pictures = rasterizeShapeFrames(l.pictures, cw, ch, map, { maxBytes: guard, skipSymbolShapes: true, clip });
      assert.equal(drawn(pictures), pictures.length, `${plan.id} ${l.name}: drawn every picture`);
    }
  }
});

// BACKGROUNDS FILL THE PAGE (Arthur, 2026-10-06: in the camera test the hills stopped short of the page edge —
// "Backgrounds should always fill up the canvas, not cut off like that"). The page is 0..width, or width wide around
// the stage middle (960): both are checked, slid ±300 px (the app's centering, a camera) and zoomed out to 0.6.
test("backgrounds fill the page: every band piece reaches past both page edges on any page, slid or zoomed out", () => {
  const BANDS = ["sky", "hills", "ground", "water", "grass"];
  for (const width of [1920, 1080, 607.5]) for (const zoom of [1, 0.6]) for (const shift of [-300, 0, 300]) {
    const stage = { width, groundY: 900, height: 300 * zoom }, left = Math.min(0, 960 - width / 2) - shift, right = Math.max(width, 960 + width / 2) - shift;
    const where = `page ${width}, zoom ${zoom}, slid ${shift}`;
    for (const kind of BANDS) for (const t of [0, 1.7]) {
      const b = shapeBounds(BACKGROUND_PIECES[kind].draw({ kind, params: { seed: 4, wind: 0.6 } }, t, stage));
      assert.ok(b.minX <= left && b.maxX >= right, `${kind} (${where}) covers only ${b.minX.toFixed(0)}..${b.maxX.toFixed(0)}, not ${left}..${right}`);
    }
    // Rain: over a few seconds, drops fall in every stretch of the page, edge to edge (no strip without rain).
    for (const wind of [0.6, -0.6, 0]) {
      const xs = Array.from({ length: 48 }, (_, i) => symbolsNamed(BACKGROUND_PIECES.rain.draw({ kind: "rain", params: { seed: 4, wind } }, i / 12, stage), "Raindrop").map((d) => d.x)).flat();
      for (let x = left; x < right; x += 200) assert.ok(xs.some((d) => d >= x && d < x + 200), `rain (${where}, wind ${wind}): no drops at ${x.toFixed(0)}..${(x + 200).toFixed(0)}`);
    }
  }
  // The same shapes inside the page as before: hills given the page's own x/w are a stretch of the default hills.
  const own = BACKGROUND_PIECES.hills.draw({ kind: "hills", params: { seed: 4, x: 0, w: 1920 } }, 0, BIG), wide = BACKGROUND_PIECES.hills.draw({ kind: "hills", params: { seed: 4 } }, 0, BIG);
  own.forEach((layer, k) => {
    const a = (layer as Extract<Shape, { kind: "poly" }>).points.slice(2, -2), b = (wide[k] as Extract<Shape, { kind: "poly" }>).points;
    const at = b.findIndex((v, i) => i % 2 === 0 && v === a[0] && b[i + 1] === a[1]);
    assert.ok(at > 0 && a.every((v, i) => Math.abs(v - b[at + i]) < 1e-9), "the hills inside the page are unchanged");
  });
});
