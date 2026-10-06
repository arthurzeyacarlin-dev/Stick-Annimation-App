import assert from "node:assert/strict";
import test from "node:test";
import { buildScene, type FrameCharacter } from "../engine.ts";
import { buildEffectFrames, type EffectScene } from "../effects/index.ts";
import { LASER_CORE, LASER_EYE_SIZE, LASER_EYE_SYMBOL, LASER_GROUND_LIGHT, LASER_REACH, LASER_RED } from "../effects/laser.ts";
import type { Point, Shape } from "../effects/types.ts";
import { PRINCIPLES } from "./lessons.ts";
import { LIBRARY } from "./library.ts";
import { planToScene, type ScenePlan } from "./plan.ts";
import { POWER_MOVES, powerParams } from "./powers.ts";
import { IN_FRONT_OF } from "./powerLaser.ts";
import { laserEyesPlan } from "./scenesLaser.ts";
import { effectsTestScenes } from "./tests2c.ts";
import { allSettings, armPathProblems, assertNatural, sceneOfKeys, startStance } from "./testkit.ts";

// LASER EYES (SPEC-0017 Phase 2C extras, powerLaser.ts): body move + effects (effects/laser.ts).
const H = 300, GROUND = 900;
const sceneOf = (plan: ScenePlan) => planToScene(plan, LIBRARY) as ReturnType<typeof planToScene> & EffectScene;
const SETTINGS = { height: H, style: "natural" as const, speed: "normal" as const, energy: 0.5 };
const lines = (shapes: Shape[]) => shapes.filter((s): s is Extract<Shape, { kind: "line" }> => s.kind === "line");
const cores = (shapes: Shape[]) => lines(shapes).filter((s) => s.stroke === LASER_CORE);
const eyes = (shapes: Shape[]) => shapes.filter((s) => s.kind === "symbol" && s.name === LASER_EYE_SYMBOL);
const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
const pointsOf = (s: Shape): Point[] => s.kind === "circle" || s.kind === "symbol" || s.kind === "rect" ? [{ x: s.x, y: s.y }] : Array.from({ length: s.points.length / 2 }, (_, i) => ({ x: s.points[2 * i], y: s.points[2 * i + 1] }));
// Distance from p to the segment a-b.
const toSegment = (p: Point, a: Point, b: Point) => {
  const dx = b.x - a.x, dy = b.y - a.y, u = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / Math.max(1e-9, dx * dx + dy * dy)));
  return Math.hypot(p.x - a.x - u * dx, p.y - a.y - u * dy);
};

test("laser eyes is a power move in the library, with its lesson", () => {
  assert.ok(POWER_MOVES.has("laserEyes") && LIBRARY.laserEyes, "in the library");
  assert.match(LIBRARY.laserEyes.about, /ANTICIPATION/);
  assert.match(LIBRARY.laserEyes.about, /RECOIL/);
  assert.ok(PRINCIPLES.some((p) => p.startsWith("LASER EYES:") && /front of the head/.test(p)), "the LASER EYES principle");
  assert.ok(effectsTestScenes().some((e) => e.id === "laserEyes" && e.label === "Laser eyes" && e.plan), "the Effects (2C) test button");
});

test("laser eyes keeps the body rules at 8/12/24 fps in every style, speed and energy, both ways", () => {
  for (const params of [{}, { distance: 500, sweep: 150 }, { seconds: 2 }]) for (const settings of allSettings()) for (const facing of ["right", "left"] as const) {
    const out = LIBRARY.laserEyes.run(startStance(facing, 960), params, settings);
    const label = `laserEyes ${JSON.stringify(params)} ${settings.style}/${settings.speed}/${settings.energy} ${facing}`;
    const scene = { ...sceneOfKeys(out.keys, facing), marks: Object.fromEntries(Object.entries(out.marks).map(([k, v]) => [`a.laserEyes1.${k}`, v])) };
    assertNatural(scene, label);
    const b8 = buildScene(scene, 8);
    for (const r of b8.report.characters) assert.ok(r.maxBoneErrorPx <= 0.5 && r.maxFootDriftPx <= 1 && r.belowGroundFrames === 0, `${label}@8: body rules`);
    assert.deepEqual(armPathProblems(buildScene(scene, 24).frames, 24), [], label);
    // The feet stay planted (WEIGHT: the knees take the push) and he ends where he started.
    assert.ok(out.keys.every((k) => (k.contacts ?? ["lFoot", "rFoot"]).length === 2), `${label}: feet planted`);
    assert.ok(Math.abs(out.end.x - 960) < 1, `${label}: ends on his spot`);
  }
});

test("ANTICIPATION before the beam (the head dips, chin down), the head snaps up as they shoot, then a small RECOIL", () => {
  const out = LIBRARY.laserEyes.run(startStance(), {}, SETTINGS);
  const m = out.marks;
  const order = ["charge", "dip", "release", "hit", "recoil", "brace", "end"];
  for (let i = 1; i < order.length; i += 1) assert.ok(m[order[i]] > m[order[i - 1]], `${order[i - 1]} before ${order[i]}`);
  assert.ok(m.release - out.keys[0].t >= 0.4, `a real charge before the beams (${(m.release - out.keys[0].t).toFixed(2)} s)`);
  assert.ok(m.release - m.charge >= 0.3, "the eyes glow a moment first");
  assert.ok(Math.abs(m.hit - m.release - LASER_REACH) < 1e-9);
  const at = (name: string) => out.keys.find((k) => Math.abs(k.t - m[name]) < 1e-9)!.pose;
  // (Where the face points: + = down. The lean and the head tilt add up.)
  const face = (name: string) => at(name).lean + at(name).head;
  assert.ok(face("dip") > face("release") + 10, `the head dips (${face("dip").toFixed(0)}°) then snaps up (${face("release").toFixed(0)}°)`);
  assert.ok(face("recoil") < face("release") - 4, "the beams push the head back");
  assert.ok(at("recoil").lean < at("release").lean - 2, "a slight lean back");
  const knees = (name: string) => at(name).lKnee + at(name).rKnee;
  assert.ok(knees("recoil") > knees("release"), "the knees soften");
  assert.ok(knees("dip") > knees("release") - 1, "the knees soften in the charge too");
  // NO UNNEEDED POSES: start, dip, charge, fire, recoil, brace, hold, stand.
  assert.ok(out.keys.length <= 9, `${out.keys.length} keys`);
});

test("a sweep: the head follows the hit spot along the ground", () => {
  const out = LIBRARY.laserEyes.run(startStance(), { distance: 400, sweep: 200 }, SETTINGS);
  const at = (name: string) => out.keys.find((k) => Math.abs(k.t - out.marks[name]) < 1e-9)!.pose;
  assert.ok(at("end").lean + at("end").head < at("brace").lean + at("brace").head - 3, "further away = the face lifts");
});

// ---- The Effects (2C) test scene: Red zaps the ground in front of Blue -------------------------------
const scene = sceneOf(laserEyesPlan());
const M = (name: string) => scene.marks[`red.laserEyes1.${name}`];
const spotX = 1300 - IN_FRONT_OF * H; // the ground in front of Blue (Blue stands at 1300 until the hit)

test("the scene: the planner aims the head at the spot, Blue hops back after the hit", () => {
  const params = powerParams(laserEyesPlan(), "red", "laserEyes", { target: "blue", at: "ground" }, {});
  const aim = params.aim as { ahead: number; up: number };
  assert.ok(aim && aim.ahead > 400 && aim.up < -200, `aimed at the ground in front of Blue (${JSON.stringify(aim)})`);
  assert.ok(scene.marks["blue.jump1.takeoff"] > M("hit") + 0.2, "Blue reacts to the hit");
  const blue = scene.characters.find((c) => c.id === "blue")!.keys;
  assert.ok(blue[blue.length - 1].x > 1300 + 60, "and ends further back");
});

for (const fps of [8, 12, 24]) test(`the scene at ${fps} fps: beams from the eyes to the target, the hit only after it lands, nothing in a head, all on the page`, () => {
  const built = buildScene(scene, fps);
  const fx = buildEffectFrames(scene, built);
  let charged = 0, beamed = 0;
  built.frames.forEach((characters, i) => {
    const t = i / fps, f = fx[i];
    const red = characters.find((c) => c.id === "red")!, blue = characters.find((c) => c.id === "blue")!;
    const dir = red.facing === "left" ? -1 : 1, r = red.headRadius, head = red.skeleton.head;
    const top = f.top ?? [], beams = cores(top);
    // (The head's own frame: "up the head" from the neck, the face a quarter turn from it.)
    const ux = head.x - red.skeleton.neck.x, uy = head.y - red.skeleton.neck.y, L = Math.hypot(ux, uy);
    const up = { x: ux / L, y: uy / L }, faceDir = { x: (-dir * uy) / L, y: (dir * ux) / L };
    // the eyes glow while charging, before any beam
    if (t > M("charge") + 1e-6 && t < M("release") - 1e-6) { assert.equal(beams.length, 0, `${t}: no beam yet`); assert.equal(eyes(top).length, 2, `${t}: two glowing eyes`); charged += 1; }
    // the two eyes: SIDE BY SIDE at eye height (the same y, one left and one right, about half a head radius apart),
    // a little toward the facing side of the head
    const two = eyes(top) as Extract<Shape, { kind: "symbol" }>[];
    if (two.length === 2) {
      assert.ok(Math.abs(two[0].y - two[1].y) < 1, `${t}: the eyes are level`);
      const apart = Math.abs(two[0].x - two[1].x);
      assert.ok(apart > 0.45 * r && apart < 0.65 * r, `${t}: side by side (${(apart / r).toFixed(2)} x head radius apart)`);
      assert.ok(((two[0].x + two[1].x) / 2 - head.x) * dir > 0.15 * r, `${t}: toward the facing side`);
      for (const e of two) assert.ok(dist(e, head) < r, `${t}: on the head`);
    }
    if (t < M("charge") - 1e-6) assert.equal(f.front.length + f.back.length + top.length, 0, `${t}: nothing before the charge`);
    // TWO beams while they are on, from the eyes at the front of the head, to the target
    if (t > M("hit") + 1e-6 && t < M("end") - 1e-6) {
      beamed += 1;
      assert.equal(beams.length, 2, `${t}: two beams`);
      for (const c of beams) {
        const a = { x: c.points[0], y: c.points[1] }, b = { x: c.points[2], y: c.points[3] };
        const fwd = (a.x - head.x) * faceDir.x + (a.y - head.y) * faceDir.y, high = (a.x - head.x) * up.x + (a.y - head.y) * up.y;
        assert.ok(dist(a, head) < r && fwd > 0 && (a.x - head.x) * dir > 0, `${t}: a beam starts at the eyes, on the front half of the head (${fwd.toFixed(1)} forward)`);
        assert.ok(high > -0.2 * r && high < 0.6 * r, `${t}: at eye height (${high.toFixed(1)} up the head)`);
        assert.ok((b.x - a.x) * (a.x - head.x) + (b.y - a.y) * (a.y - head.y) > 0, `${t}: going away from the head, not through it`);
        assert.ok(Math.abs(b.y - GROUND) < 1 && b.x > spotX - 30 && b.x < spotX + 110 + 30, `${t}: it reaches the ground in front of Blue (${b.x.toFixed(0)}, ${b.y.toFixed(0)})`);
        assert.ok(toSegment(blue.skeleton.head, a, b) > blue.headRadius + 4, `${t}: not through Blue's head`);
      }
      // the head looks along the beams (the head turns most of the way, the eyes do the rest) — pushed back a little
      // in the recoil, then braced on the target
      const c = beams[0], bl = Math.hypot(c.points[2] - c.points[0], c.points[3] - c.points[1]);
      const cos = (faceDir.x * (c.points[2] - c.points[0]) + faceDir.y * (c.points[3] - c.points[1])) / bl;
      const off = (Math.acos(Math.min(1, cos)) * 180) / Math.PI;
      assert.ok(off < (t >= M("brace") ? 8 : 22), `${t}: the face points along the beams (${off.toFixed(1)}°)`);
    }
    // where it hits: only after the beams land (sparks, scorch, smoke, ground light are the "back" layer here)
    if (t < M("hit") - 1e-6) assert.equal(f.back.length, 0, `${t}: no sparks or scorch before the hit`);
    else assert.ok(f.back.length > 0, `${t}: the hit`);
    // the ground light is a THIN line of light (about 0.02 x height)
    for (const s of f.back) if (s.kind === "poly" && s.fill === LASER_RED) {
      const ys = s.points.filter((_, j) => j % 2 === 1);
      assert.ok(Math.max(...ys) - Math.min(...ys) <= LASER_GROUND_LIGHT * H + 1e-6, `${t}: thin ground light`);
    }
    // nothing of the hit in or near anyone's head; everything on the page, nothing below the ground
    for (const s of f.back) for (const p of pointsOf(s)) for (const who of [red, blue] as FrameCharacter[]) assert.ok(dist(p, who.skeleton.head) > who.headRadius + 5, `${t}: the hit reaches ${who.id}'s head`);
    for (const s of [...f.back, ...f.front, ...top]) for (const p of pointsOf(s)) assert.ok(p.x >= 0 && p.x <= 1920 && p.y <= GROUND + 1e-6, `${t}: (${p.x.toFixed(0)}, ${p.y.toFixed(0)}) off the page or below the ground`);
  });
  assert.ok(charged >= 2, `the charge is seen (${charged} pictures)`);
  assert.ok(beamed >= Math.floor(fps * 1), `the beams are seen (${beamed} pictures)`);
  assertNatural(scene, `laser eyes scene @${fps}`);
});

test("the same at 8, 12 and 24 fps: the same moments, the beams in the same place", () => {
  const endAt = (fps: number, t: number) => {
    const built = buildScene(scene, fps), fx = buildEffectFrames(scene, built);
    return cores(fx[Math.round(t * fps)].top ?? []).map((c) => [c.points[2], c.points[3]]);
  };
  for (const t of [1.5, 2]) {
    const [a, b, c] = [8, 12, 24].map((fps) => endAt(fps, t));
    assert.equal(a.length, 2);
    for (const other of [b, c]) other.forEach((p, k) => assert.ok(Math.abs(p[0] - a[k][0]) < 0.5 && Math.abs(p[1] - a[k][1]) < 0.5, `t=${t}: the same spot`));
  }
});

test("laser eyes at a figure's body: the beams reach its chest; no scorch, no ground light", () => {
  const plan: ScenePlan = {
    id: "laser-body", title: "Laser at the body", height: H, groundY: GROUND, stageWidth: 1920,
    characters: [
      { id: "a", name: "A", x: 600, facing: "right", actions: [{ move: "laserEyes", params: { target: "b", color: "#22dd44" } }] },
      { id: "b", name: "B", x: 1300, facing: "left", actions: [{ move: "stand", params: { seconds: 3 } }] },
    ],
  };
  const s = sceneOf(plan), built = buildScene(s, 12), fx = buildEffectFrames(s, built);
  const t = s.marks["a.laserEyes1.hit"] + 0.3, f = fx[Math.round(t * 12)];
  const b = built.frames[Math.round(t * 12)].find((c) => c.id === "b")!;
  const chest = { x: b.skeleton.neck.x, y: b.skeleton.neck.y + 0.1 * H };
  assert.ok(cores(f.top ?? []).length === 2 && cores(f.top ?? []).every((c) => dist({ x: c.points[2], y: c.points[3] }, chest) < 12), "at the chest");
  assert.ok(lines(f.top ?? []).some((l) => l.stroke === "#22dd44"), "green lasers");
  assert.ok(!f.front.concat(f.back, f.top ?? []).some((x) => x.kind === "poly" && (x.fill === "#2a211d" || x.fill === "#22dd44")), "no scorch and no light on the ground");
});

// THE APP (DrawingWorkspace applyAnimatorScene): heads are Library symbols placed ON TOP of the AI layer's picture, so
// anything painted in that picture is under the heads. The laser eyes are a "top" track: their beams get their own
// layer ABOVE the AI layer ("AI: <title> lasers") and the glowing eyes are "Laser eye" placements on that layer, over
// the beams — so the beams visibly come OUT OF THE EYES, over the head (Arthur: "the laser needs to be coming out of
// his eyes").
test("in the app: the beams are on their own layer over the heads, the eyes placed over the beams", async () => {
  const { prepareAnimatorSceneSymbolsV1, prepareEffectSymbolsV1 } = await import("../../animation/animatorSceneSymbolsV1.ts");
  const { centerAnimation, visibleStageWidth } = await import("../stageFit.ts");
  const { rasterizeFrames, rasterizeShapeFrames, sceneEffectLayers } = await import("../toFrames.ts");
  const record = () => {
    const calls: string[] = [];
    const ctx = new Proxy({} as Record<string, unknown>, {
      get: (_t, key) => (...args: unknown[]) => { calls.push(`${String(key)}(${args.map((a) => (typeof a === "number" ? +a.toFixed(3) : JSON.stringify(a))).join(",")})`); },
      set: (_t, key, value) => { calls.push(`${String(key)}=${value}`); return true; },
    });
    return { ctx, calls };
  };
  const fakeCanvas = () => { const { ctx, calls } = record(); const canvas = { width: 0, height: 0, getContext: () => ctx as unknown as CanvasRenderingContext2D, toDataURL: () => `data:image/png;base64,${Buffer.from(`${canvas.width}x${canvas.height}|${calls.join(";")}`).toString("base64")}` }; return canvas; };
  const page = { width: 1280, height: 720 };
  const built = buildScene(scene, 12);
  const centered = centerAnimation(built.frames, visibleStageWidth(page.width, page.height), built.objects);
  const layers = sceneEffectLayers(scene, built, centered.shift);
  assert.ok(layers.top && layers.top.length === built.frames.length, "a layer over the heads");
  assert.ok(!(layers.effects ?? []).some((fx) => cores([...fx.back, ...fx.front]).length > 0), "no beam in the AI layer's picture");
  const empty = { symbols: [], assets: [] };
  const heads = prepareAnimatorSceneSymbolsV1(scene, centered.frames, centered.objects, page, empty, fakeCanvas)!;
  const plan = prepareEffectSymbolsV1(layers, page, heads.catalogs, fakeCanvas)!;
  assert.ok(plan.catalogs.symbols.some((s) => s.name === LASER_EYE_SYMBOL), "a Laser eye Library symbol");
  let onHead = 0;
  centered.frames.forEach((_, i) => {
    const t = i / 12;
    assert.equal((plan.effects?.[i]?.front ?? []).length + (plan.effects?.[i]?.back ?? []).length, 0, "no eyes on the AI layer");
    const top = plan.top![i];
    if (t > M("charge") + 0.05 && t < M("end")) {
      assert.equal(top.length, 2, `${t}: two eyes placed on the layer over the heads`);
      const head = heads.placements[i].find((p) => p.pictureKey.includes("#e2461c"))!;
      for (const eye of top) { assert.ok(Math.hypot(eye.centerX - head.centerX, eye.centerY - head.centerY) < head.width / 2, `${t}: the eye sits on Red's head`); onHead += 1; }
    }
  });
  assert.ok(onHead > 20);
  // The pictures of that layer: the beams are painted, the eyes are placed (not painted).
  const drawn: string[][] = [];
  (globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas = class {
    width: number; height: number; calls: string[];
    constructor(width: number, height: number) { this.width = width; this.height = height; this.calls = []; drawn.push(this.calls); }
    getContext() {
      const { ctx, calls } = record(); const mine = this.calls, size = this.width * this.height * 4;
      return new Proxy(ctx, { get: (target, key) => (key === "getImageData" ? () => { mine.push(...calls); return { data: new Uint8ClampedArray(size) }; } : (target as Record<string | symbol, unknown>)[key]) });
    }
  };
  const g = globalThis as unknown as Record<string, unknown>, hadImageData = "ImageData" in g;
  if (!hadImageData) g.ImageData = class { width: number; height: number; data: Uint8ClampedArray; constructor(w: number, h: number) { this.width = w; this.height = h; this.data = new Uint8ClampedArray(w * h * 4); } };
  try {
    const i = Math.round((M("hit") + 0.3) * 12);
    const one = (options: object) => { drawn.length = 0; rasterizeShapeFrames([layers.top![i]], 1280, 720, { scale: 2 / 3, offsetX: 0, offsetY: 0 }, options as never); return drawn.join(";"); };
    const placed = one({ skipSymbolShapes: true }), painted = one({});
    const eyeRing = "#ff9393"; // (the eye's light ring: the laser red mixed half way to white)
    assert.ok(painted.includes(eyeRing) && !placed.includes(eyeRing), "the eyes are placed, not painted");
    assert.ok(placed.includes(`strokeStyle=${LASER_CORE}`) && placed.includes(`strokeStyle=${LASER_RED}`), "the beams are painted on that layer");
    drawn.length = 0;
    rasterizeFrames([centered.frames[i]], 1280, 720, { scale: 2 / 3, offsetX: 0, offsetY: 0 }, [centered.objects?.[i] ?? []], { skipHeads: true, effects: [layers.effects![i]], skipSymbolShapes: true } as never);
    assert.ok(!drawn.join(";").includes(`strokeStyle=${LASER_CORE}`), "and not in the AI layer's picture (under the heads)");
  } finally {
    delete (globalThis as unknown as { OffscreenCanvas?: unknown }).OffscreenCanvas;
    if (!hadImageData) delete g.ImageData;
  }
});

// THE APP'S OWN ORDER, pixel by pixel: the AI layer's picture (back effects, body lines, front effects), its head
// symbols, its effect symbols, then the layer over the heads (its picture, then its symbols). Every point on the line
// from each glowing eye to the edge of the head shows the BEAM, not the head.
test("in the app's order, the beams show from the eye dots to the edge of the head (over the head)", () => {
  const built = buildScene(scene, 12), fx = buildEffectFrames(scene, built);
  type Painter = { covers: (p: Point) => boolean; what: string };
  const onSegment = (p: Point, pts: number[], half: number) => { for (let j = 0; j + 3 < pts.length; j += 2) if (toSegment(p, { x: pts[j], y: pts[j + 1] }, { x: pts[j + 2], y: pts[j + 3] }) <= half) return true; return false; };
  const inPoly = (p: Point, pts: number[]) => { let inside = false; for (let a = 0, b = pts.length - 2; a < pts.length; b = a, a += 2) { const [xa, ya, xb, yb] = [pts[a], pts[a + 1], pts[b], pts[b + 1]]; if ((ya > p.y) !== (yb > p.y) && p.x < ((xb - xa) * (p.y - ya)) / (yb - ya) + xa) inside = !inside; } return inside; };
  const painterOf = (s: Shape, what: string): Painter | null => {
    if ((s.alpha ?? 1) < 0.5) return null; // (a faint glow doesn't hide what is under it)
    if (s.kind === "line") return { covers: (p) => onSegment(p, s.points, s.width / 2), what: s.stroke === LASER_CORE || s.stroke === LASER_RED ? "beam" : what };
    if (s.kind === "circle") return { covers: (p) => dist(p, s) <= s.r, what };
    if (s.kind === "poly") return { covers: (p) => inPoly(p, s.points), what };
    if (s.kind === "symbol") return { covers: (p) => dist(p, s) <= (LASER_EYE_SIZE / 2) * (s.scale ?? 1), what: "eye" };
    return null;
  };
  let checked = 0, beamSeen = 0;
  for (let i = 0; i < built.frames.length; i += 1) {
    const t = i / 12;
    if (!(t > M("hit") + 0.02 && t < M("end") - 0.02)) continue;
    const f = fx[i], red = built.frames[i].find((c) => c.id === "red")!;
    const r = red.headRadius + red.style.thickness / 2;
    const order: Painter[] = [];
    const add = (list: Shape[], what: string, symbols: boolean) => { for (const s of list) if ((s.kind === "symbol") === symbols) { const q = painterOf(s, what); if (q) order.push(q); } };
    add(f.back, "effect", false); add(f.front, "effect", false); // the AI layer's picture (body lines don't matter here)
    for (const c of built.frames[i]) order.push({ covers: (p) => dist(p, c.skeleton.head) <= c.headRadius + c.style.thickness / 2, what: `head ${c.id}` }); // head symbols
    add(f.back, "effect symbol", true); add(f.front, "effect symbol", true);
    add(f.top ?? [], "top", false); add(f.top ?? [], "eye", true); // the layer over the heads
    const shown = (p: Point) => { let top = "nothing"; for (const q of order) if (q.covers(p)) top = q.what; return top; };
    for (const e of eyes(f.top ?? []) as Extract<Shape, { kind: "symbol" }>[]) {
      const beam = cores(f.top ?? []).sort((a, b) => dist({ x: a.points[0], y: a.points[1] }, e) - dist({ x: b.points[0], y: b.points[1] }, e))[0];
      const ux = beam.points[2] - beam.points[0], uy = beam.points[3] - beam.points[1], L = Math.hypot(ux, uy);
      for (let d = (LASER_EYE_SIZE / 2) * (e.scale ?? 1) + 0.5; ; d += 1) {
        const p = { x: e.x + (ux / L) * d, y: e.y + (uy / L) * d };
        if (dist(p, red.skeleton.head) > r) break;
        const see = shown(p);
        assert.ok(see === "beam" || see === "eye", `${t.toFixed(2)}: ${d.toFixed(0)} px from the eye, over the head, you see the ${see}, not the beam`);
        checked += 1; if (see === "beam") beamSeen += 1;
      }
    }
  }
  assert.ok(checked > 100 && beamSeen > 0.4 * checked, `${checked} points checked, the beam seen at ${beamSeen} (the rest: the other glowing eye, which the far beam passes behind)`);
});

// FROM ANY START POSE (lead, round 2C): laser eyes straight after any solo move — an arm up high after a wave, a
// guard, a crouch — keeps every body rule and the arms never whip round, at 8, 12 and 24 fps.
test("laser eyes after any move: clean arm and head paths at 8/12/24 fps", () => {
  const partnerMoves = new Set(["highFive", "throw", "catch", "pickUp", "getUp", "catchBreath", "block", "almostFall", "stompDown", "groundPunch", "coverUp", "kipUp", "dashPunch", "fireBlast", "waterShield", "escort", "tug", "getHit", "barraged", "slammed", "spunThrown", "liftSlam", "spinThrow", "barrage", "fallDown", "laserEyes"]);
  for (const id of Object.keys(LIBRARY)) {
    if (partnerMoves.has(id)) continue;
    for (const style of ["natural", "robot"] as const) {
      const params = id === "walk" || id === "jog" || id === "run" ? { distance: 300 } : {};
      const s = sceneOf({ id: "after", title: "after", height: H, groundY: GROUND, stageWidth: 1920, characters: [{ id: "a", name: "A", x: 700, facing: "right", style, actions: [{ move: id, params }, { move: "laserEyes" }] }] });
      const label = `${id} → laser eyes (${style})`;
      assertNatural(s, label);
      const from = (s.marks["a.laserEyes1.charge"] - 0.35 * s.marks["a.laserEyes1.dip"]) / 0.65 + 0.01; // (where laser eyes starts)
      for (const fps of [8, 12, 24]) {
        const problems = armPathProblems(buildScene(s, fps).frames, fps).filter((p) => { const m = /at ([0-9.]+)s/.exec(p); return !m || +m[1] >= from; });
        assert.deepEqual(problems, [], `${label} @${fps}`);
      }
    }
  }
});
