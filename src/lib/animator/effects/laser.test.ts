import assert from "node:assert/strict";
import test from "node:test";
import type { FrameCharacter } from "../engine.ts";
import { DEFAULT_STYLE, type Skeleton } from "../rig.ts";
import { placedSymbol } from "../symbolMaker.ts";
import { anchorAt, EFFECTS } from "./index.ts";
import { beamSpan, EYE_FADE, LASER_CORE, LASER_EYE_SYMBOL, LASER_GROUND_LIGHT, LASER_RED, LASER_WIDTH, laserGeometry } from "./laser.ts";
import type { EffectContext, EffectParams, Point, Shape } from "./types.ts";

// LASER EYES (SPEC-0017 Phase 2C extras, effects/laser.ts): the eyes and beams, and where they hit.
const H = 300, GROUND = 900;
const EYES: Point = { x: 700, y: 640 }, HIT: Point = { x: 1150, y: GROUND };
const ctx = (t: number, duration: number, at: Point, target?: Point, fps = 12): EffectContext => ({ t, duration, fps, at, target, height: H, groundY: GROUND, stageWidth: 1920 });
const BEAM: EffectParams = { fireAt: 0.4, cutAt: 1.4, gap: 9 };
const beamAt = (t: number, p: EffectParams = BEAM, fps = 12) => EFFECTS.laserEyes.draw(ctx(t, 1.4 + EYE_FADE, EYES, HIT, fps), p);
const HITP: EffectParams = { cutAt: 1, back: -1 };
const hitAt = (t: number, p: EffectParams = HITP, fps = 12, at: Point = HIT) => EFFECTS.laserHit.draw(ctx(t, 20, at, undefined, fps), p);
const lines = (shapes: Shape[]) => shapes.filter((s): s is Extract<Shape, { kind: "line" }> => s.kind === "line");
const symbols = (shapes: Shape[]) => shapes.filter((s): s is Extract<Shape, { kind: "symbol" }> => s.kind === "symbol");
const polys = (shapes: Shape[]) => shapes.filter((s): s is Extract<Shape, { kind: "poly" }> => s.kind === "poly");
const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

test("laser eyes: the two recipes, by these ids, registered in the effects list", () => {
  for (const id of ["laserEyes", "laserHit"]) assert.ok(EFFECTS[id] && EFFECTS[id].about.length > 40, id);
});

test("TWO thin beams from the two eyes to the target: a white-hot core in a colored glow", () => {
  const shapes = beamAt(0.9);
  const L = lines(shapes);
  const cores = L.filter((s) => s.stroke === LASER_CORE), bodies = L.filter((s) => s.stroke === LASER_RED);
  assert.equal(cores.length, 2, "two beams (two white cores)");
  assert.equal(bodies.length, 4, "each in a colored beam and a wider soft glow");
  const g = laserGeometry(ctx(0.9, 1.7, EYES, HIT), BEAM);
  assert.ok(dist(g.eyes[0], g.eyes[1]) > 6 && dist(g.eyes[0], g.eyes[1]) < 10, "the eyes are a gap apart");
  // SIDE BY SIDE (Arthur): one dot on the left, one on the right, on one level line — never stacked.
  assert.ok(Math.abs(g.eyes[0].y - g.eyes[1].y) < 1 && Math.abs(g.eyes[0].x - g.eyes[1].x) > 6, "side by side at the same height");
  const eyeSymbols = symbols(shapes);
  assert.ok(eyeSymbols.length === 2 && Math.abs(eyeSymbols[0].y - eyeSymbols[1].y) < 1 && Math.abs(eyeSymbols[0].x - eyeSymbols[1].x) > 6, "the glowing eyes too");
  for (const [i, c] of cores.entries()) {
    const start = { x: c.points[0], y: c.points[1] }, end = { x: c.points[2], y: c.points[3] };
    assert.ok(dist(start, g.eyes[i]) < 0.5, `beam ${i} starts at its eye`);
    assert.ok(dist(start, EYES) < 6, `beam ${i} starts at the eyes`);
    assert.ok(dist(end, HIT) < 20 && end.y <= GROUND + 1e-9, `beam ${i} reaches the target (${end.x.toFixed(0)}, ${end.y.toFixed(0)})`);
  }
  // Two lines, not one: the beams are apart all the way until they meet the target.
  const mid = (s: (typeof cores)[0]) => ({ x: (s.points[0] + s.points[2]) / 2, y: (s.points[1] + s.points[3]) / 2 });
  assert.ok(dist(mid(cores[0]), mid(cores[1])) > 3, "two separate beams");
  // Thin: core < beam < glow, the colored beam well under a twentieth of the height.
  const w = (stroke: string, k: number) => L.filter((s) => s.stroke === stroke)[k].width;
  assert.ok(w(LASER_CORE, 0) < w(LASER_RED, 2) && w(LASER_RED, 2) < w(LASER_RED, 0), "core thinner than the beam, the glow wider");
  assert.ok(w(LASER_RED, 2) < 0.05 * H, "thin");
  assert.ok(L.every((s) => (s.glow ?? 0) > 0), "they glow");
});

test("the beams flicker a little in width, never a lot; any color by the knobs", () => {
  const widths = Array.from({ length: 24 }, (_, i) => lines(beamAt(0.7 + i * 0.03)).find((s) => s.stroke === LASER_CORE)!.width);
  const lo = Math.min(...widths), hi = Math.max(...widths);
  assert.ok(hi / lo > 1.05, `they flicker (${lo.toFixed(2)}–${hi.toFixed(2)})`);
  assert.ok(hi / lo < 1.6, "only a little");
  const green = lines(beamAt(0.9, { ...BEAM, color: "#22dd44" }));
  assert.ok(green.some((s) => s.stroke === "#22dd44") && !green.some((s) => s.stroke === LASER_RED), "green lasers are green");
  assert.ok(symbols(beamAt(0.9, { ...BEAM, color: "#22dd44" })).every((s) => s.color === "#22dd44"), "and so are the eyes");
});

test("the eyes glow first (the charge), the beams shoot at fireAt, cut off at cutAt, then the eyes fade", () => {
  const charge = [0.05, 0.2, 0.38].map((t) => beamAt(t));
  for (const shapes of charge) {
    assert.equal(lines(shapes).length, 0, "no beam while charging");
    assert.equal(symbols(shapes).length, 2, "two glowing eyes");
    assert.ok(symbols(shapes).every((s) => s.name === LASER_EYE_SYMBOL && (s.alpha ?? 1) >= 0.5), "Laser eye symbols, solid (a placement can't be see-through)");
  }
  assert.ok(symbols(charge[2])[0].scale! > symbols(charge[0])[0].scale!, "the glow grows as it charges");
  assert.ok(lines(beamAt(0.42)).length > 0, "the beams shoot");
  const shooting = lines(beamAt(0.415)).find((s) => s.stroke === LASER_CORE)!;
  assert.ok(dist({ x: shooting.points[2], y: shooting.points[3] }, HIT) > 50, "they shoot out (the front on its way)");
  // cut off: the back end leaves the eyes
  const cutting = lines(beamAt(1.43)).find((s) => s.stroke === LASER_CORE)!;
  assert.ok(dist({ x: cutting.points[0], y: cutting.points[1] }, EYES) > 50, "the back end runs out");
  assert.equal(lines(beamAt(1.5)).length, 0, "then they are gone");
  assert.ok(symbols(beamAt(1.5)).length === 2 && symbols(beamAt(1.5))[0].scale! < symbols(beamAt(1.0))[0].scale!, "the eyes fade (shrink)");
  assert.equal(beamAt(1.4 + EYE_FADE - 0.01).length, 0, "and are gone");
  const span = beamSpan(ctx(0, 1.7, EYES, HIT), BEAM);
  assert.equal(span.fireAt, 0.4);
  assert.equal(span.cutAt, 1.4);
});

test("the Laser eye is a Library symbol: a white-hot dot in a light ring and a soft colored glow", () => {
  const made = placedSymbol({ name: LASER_EYE_SYMBOL });
  assert.equal(made.shapes.length, 3);
  assert.ok(made.shapes.every((s) => s.kind === "circle"));
  const top = made.shapes[2] as Extract<Shape, { kind: "circle" }>;
  assert.equal(top.fill, LASER_CORE, "white-hot in the middle");
  assert.ok(made.width > 8 && made.width < 30, "small (an eye)");
});

test("the eyes are ON THE FACE: an onHead anchor is at the front of the head on the facing side, turning with the head", () => {
  const head = (facing: "left" | "right", tilt = 0): FrameCharacter => {
    const neck = { x: 960, y: 700 }, a = (tilt * Math.PI) / 180;
    const skeleton = { neck, head: { x: neck.x + Math.sin(a) * 21, y: neck.y - Math.cos(a) * 21 } } as unknown as Skeleton;
    return { id: "a", skeleton, style: DEFAULT_STYLE, headRadius: 21, facing };
  };
  const spot = (c: FrameCharacter) => anchorAt({ character: "a", joint: "head", onHead: { forward: 0.7, up: 0.15 } }, [c])!;
  const r = spot(head("right")), l = spot(head("left"));
  assert.ok(Math.abs(r.x - (960 + 0.7 * 21)) < 1e-9 && Math.abs(r.y - (679 - 0.15 * 21)) < 1e-9, "facing right: in front, a little above the middle");
  assert.ok(Math.abs(l.x - (960 - 0.7 * 21)) < 1e-9, "facing left: the other side");
  // A head tilted forward (chin down) turns the eyes down the face.
  const down = spot(head("right", 25));
  assert.ok(down.y > r.y + 4, "chin down: the eyes look down");
});

test("where they hit: sparks and a thin dim light on the ground at once; the scorch grows; nothing below the ground", () => {
  const first = hitAt(0.03);
  assert.ok(lines(first).some((s) => (s.glow ?? 0) > 0 && s.width < 0.02 * H), "sparks (short strokes)");
  const band = polys(first).filter((s) => s.fill === LASER_RED);
  assert.ok(band.length >= 1, "a light on the ground in the laser's color");
  for (const b of band) {
    const ys = b.points.filter((_, i) => i % 2 === 1);
    assert.ok(Math.max(...ys) <= GROUND + 1e-9 && Math.max(...ys) - Math.min(...ys) <= LASER_GROUND_LIGHT * H + 1e-6, "thin (about 0.02 x height), on the ground");
    assert.ok((b.alpha ?? 1) <= 0.3, "dim");
  }
  for (const t of [0.03, 0.3, 0.8, 1.2, 2, 3]) for (const s of hitAt(t)) {
    if (s.kind === "poly" || s.kind === "line") for (let j = 1; j < s.points.length; j += 2) assert.ok(s.points[j] <= GROUND + 1e-9, `t=${t}: below the ground`);
  }
});

test("the SCORCH: a dark streak on the ground with a glowing line that cools (white-hot, orange, deep red, dark) and stays", () => {
  const dark = (shapes: Shape[]) => polys(shapes).find((s) => s.fill === "#2a211d");
  const glowLines = (shapes: Shape[]) => lines(shapes).filter((s) => s.points.every((v, j) => j % 2 === 0 || v > GROUND - 0.02 * H));
  assert.ok(dark(hitAt(0.5)), "a dark mark while it burns");
  assert.ok(glowLines(hitAt(0.5)).some((s) => s.stroke === "#fff3bd"), "white-hot where the beams are");
  const cooling = glowLines(hitAt(1.35)).map((s) => s.stroke);
  assert.ok(!cooling.includes("#fff3bd") && cooling.length > 0, "cooling after the beams stop");
  assert.equal(glowLines(hitAt(2.4)).length, 0, "cooled");
  assert.ok(dark(hitAt(5)), "the dark mark stays");
  const ys = dark(hitAt(0.5))!.points.filter((_, i) => i % 2 === 1);
  assert.ok(GROUND - Math.min(...ys) < 0.03 * H, "lying flat on the ground");
});

test("a SWEEP slides the hit spot along the ground and the scorch follows it", () => {
  const sweep: EffectParams = { ...BEAM, sweep: 120, sweepFrom: 0.6, sweepTo: 1.2 };
  const end = (t: number) => { const c = lines(beamAt(t, sweep)).filter((s) => s.stroke === LASER_CORE); return (c[0].points[2] + c[1].points[2]) / 2; };
  assert.ok(Math.abs(end(0.5) - HIT.x) < 15 && Math.abs(end(1.3) - (HIT.x + 120)) < 15, "the beams slide 120 px");
  const hitSweep: EffectParams = { ...HITP, sweep: 120, sweepFrom: 0.2, sweepTo: 0.8 };
  const scorch = polys(hitAt(1.5, hitSweep)).find((s) => s.fill === "#2a211d")!;
  const xs = scorch.points.filter((_, i) => i % 2 === 0);
  assert.ok(Math.min(...xs) < HIT.x && Math.max(...xs) > HIT.x + 120, "the scorch runs the whole way");
});

test("A LITTLE SMOKE: gray and light gray wavy wisps (never dark gray) rising off the hot spot, fading by about half a body", () => {
  const grays = new Set(["#9c9c9c", "#d9d9d9", "#bbbbbb"]);
  for (const t of [0.4, 0.9, 1.4, 2]) {
    const wisps = polys(hitAt(t)).filter((s) => grays.has(s.fill ?? ""));
    assert.ok(wisps.length >= 2 && wisps.length <= 30, `t=${t}: a few wisps (${wisps.length})`);
    for (const w of wisps) {
      assert.ok(w.points.length >= 48, "wavy many-point outlines, not round puffs");
      assert.ok(Math.min(...w.points.filter((_, i) => i % 2 === 1)) > GROUND - 0.8 * H, "below about 0.8 x height");
    }
  }
  assert.equal(polys(hitAt(3.3)).filter((s) => grays.has(s.fill ?? "")).length, 0, "the smoke has faded");
  // (No dark gray smoke: every gray shape is one of the smoke grays, or the scorch on the ground.)
  const isGray = (c: string) => /^#([0-9a-f]{2})\1\1$/i.test(c);
  for (const t of [0.4, 0.9, 1.4]) for (const s of polys(hitAt(t))) if (s.fill && isGray(s.fill)) assert.ok(grays.has(s.fill), `t=${t}: ${s.fill} is not a smoke gray`);
});

test("the same moment gives the same shapes at 8, 12 and 24 fps", () => {
  for (const t of [0.25, 0.5, 0.9, 1.45]) {
    assert.deepEqual(beamAt(t, BEAM, 8), beamAt(t, BEAM, 24), `beams t=${t}`);
    assert.deepEqual(hitAt(t, HITP, 8), hitAt(t, HITP, 12), `hit t=${t}`);
  }
});

test("on a body (in the air): sparks and a little smoke, no scorch and no ground light", () => {
  const chest = { x: 1300, y: 690 };
  const shapes = EFFECTS.laserHit.draw(ctx(0.4, 3, chest), { cutAt: 1, back: -1 });
  assert.ok(!polys(shapes).some((s) => s.fill === "#2a211d" || s.fill === LASER_RED), "nothing on the ground");
  assert.ok(lines(shapes).length > 0, "sparks");
  const beams = EFFECTS.laserEyes.draw(ctx(0.9, 1.7, EYES, chest), BEAM);
  assert.ok(lines(beams).filter((s) => s.stroke === LASER_CORE).every((s) => dist({ x: s.points[2], y: s.points[3] }, chest) < 10), "the beams reach the chest");
});

test("DRAWABLE BY HAND, NOT TOO SIMPLE: clean bright lines with a glow, a few short strokes, a dark streak, a few wisps", () => {
  const counts = [0.5, 0.9, 1.3].map((t) => beamAt(t).length + hitAt(t).length);
  assert.ok(counts.every((n) => n >= 8 && n <= 60), `a few dozen pieces a picture (${counts.join(", ")})`);
});
