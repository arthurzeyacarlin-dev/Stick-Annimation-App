// GRENADE review scenes (SPEC-0017 Phase 2C, 2026-10-06): "Grenade: throw far (overhand)" and "Grenade: drop close
// (underhand)" — the throw, the grenade's flight and bounces, the blast, the crate, the cap, the page, any fps.
import assert from "node:assert/strict";
import { test } from "node:test";
import { buildScene, type SceneFrames } from "../engine.ts";
import { buildEffectFrames, type EffectScene, type Shape } from "../effects/index.ts";
import { blastPushAt, capCoverOf, grenadeAt, grenadeHalfExtent, THROWN_AT } from "../effects/explosion.ts";
import { headSymbolNameV1 } from "../../animation/animatorSceneSymbolsV1.ts";
import { centerAnimation, effectFitBounds, STAGE_HEIGHT } from "../stageFit.ts";
import { placedSymbol, shapeBounds } from "../symbolMaker.ts";
import { lessonPack } from "./lessons.ts";
import { LIBRARY } from "./library.ts";
import { planToScene } from "./plan.ts";
import { grenadeCloseScene, grenadeFarScene, handVelocityAt, SOLDIER } from "./scenesGrenade.ts";
import { effectsTestScenes, makeEffectsTestScene } from "./tests2c.ts";
import { armPathProblems, assertNatural } from "./testkit.ts";

const far = grenadeFarScene(), close = grenadeCloseScene();
const H = far.plan.height, G = far.plan.groundY;
const symbols = (shapes: Shape[] | undefined, name: string) => (shapes ?? []).filter((s): s is Extract<Shape, { kind: "symbol" }> => s.kind === "symbol" && s.name === name);
const hipAt = (built: SceneFrames, i: number) => built.frames[i][0].skeleton.hip;
// (a shape's lowest point; a placed symbol's is its box turned)
const lowestOf = (sh: Shape) => { if (sh.kind !== "symbol") return shapeBounds([sh]).maxY; const m = placedSymbol(sh), k = sh.scale ?? 1, a = ((sh.rotation ?? 0) * Math.PI) / 180; return sh.y + (k * (Math.abs(Math.sin(a)) * m.width + Math.abs(Math.cos(a)) * m.height)) / 2; };

test("grenade scenes: the two Effects (2C) buttons", () => {
  const list = effectsTestScenes();
  assert.ok(list.some((e) => e.id === "grenadeFar" && e.label === "Grenade: throw far (overhand)" && e.plan));
  assert.ok(list.some((e) => e.id === "grenadeClose" && e.label === "Grenade: drop close (underhand)" && e.plan));
});

test("grenade scenes: overhand lands far, underhand lands near; the bodies obey the body rules", () => {
  const sf = planToScene(far.plan, LIBRARY), sc = planToScene(close.plan, LIBRARY);
  assert.ok(sf.marks[`${SOLDIER}.throw1.cocked`] !== undefined, "far = overhand (the cocked wind-up behind the head)");
  assert.equal(sc.marks[`${SOLDIER}.throw1.cocked`], undefined, "close = underhand");
  const x0 = (p: typeof far) => p.plan.characters[0].x;
  // (how far it flies, from where it left the hand)
  const out = (g: typeof far) => (g.land.x - g.from.x) / H;
  assert.ok(out(far) >= 3.1 && out(far) <= 3.3, `overhand: far (${out(far).toFixed(2)} heights)`);
  // (the close toss is exactly the passed underhand pass, so it flies as far as that pass's hand speed sends it)
  assert.ok(out(close) > 0.5, `underhand: a real toss (${out(close).toFixed(2)} heights)`);
  for (const [s, label] of [[sf, "far"], [sc, "close"]] as const) {
    const built = assertNatural(s, label, { maxJointStepPx24: 400 });
    assert.deepEqual(armPathProblems(built.frames, 24), [], label);
  }
});

test("grenade scenes: EVEN A SHORT TOSS IS A REAL THROW WITH AN ARC — forward and up, never straight up and down", () => {
  for (const g of [far, close]) {
    const arc = g.path.segments[0];
    assert.equal(arc.kind, "arc");
    if (arc.kind !== "arc") continue;
    const angle = (Math.atan2(-arc.vy, Math.abs(arc.vx)) * 180) / Math.PI, [lo, hi] = g === far ? [38, 42.5] : [45, 60];
    assert.ok(angle >= lo && angle <= hi, `${g.plan.id}: thrown forward and up at ${angle.toFixed(1)} degrees`);
    // a clear arc: overhand peaks at least half a figure above where it left the hand, the underhand toss a quarter
    const peak = (arc.vy * arc.vy) / (2 * ((2000 / 300) * H)) / H;
    assert.ok(peak >= (g === far ? 0.5 : 0.2), `${g.plan.id}: the arc peaks ${peak.toFixed(2)} heights above the release`);
    const across = Math.abs(g.land.x - g.from.x), top = Math.min(...Array.from({ length: 50 }, (_, k) => grenadeAt(g.path, (k / 49) * g.path.land, G, H).y));
    assert.ok(across >= 0.4 * H, `${g.plan.id}: travels forward ${(across / H).toFixed(2)} heights`);
    assert.ok(g.from.y - top >= 0.2 * H, `${g.plan.id}: rises above the hand first`);
  }
});

test("grenade scenes: THE EFFORT MATCHES THE FLIGHT — it leaves at the hand's own speed and direction; a gentle underhand toss, a strong overhand throw", () => {
  for (const g of [far, close]) {
    const s = planToScene(g.plan, LIBRARY), hand = handVelocityAt(s, g.release);
    const arc = g.path.segments[0] as { vx: number; vy: number; x0: number; y0: number };
    const err = Math.hypot(arc.vx - hand.v.x, arc.vy - hand.v.y) / Math.hypot(hand.v.x, hand.v.y);
    assert.ok(err < 0.03, `${g.plan.id}: the grenade's velocity is the hand's (off by ${(err * 100).toFixed(1)}%)`);
    assert.ok(Math.hypot(arc.x0 - hand.at.x, arc.y0 - hand.at.y) < 1, `${g.plan.id}: from the hand`);
    // (the hand itself, independently: where it went over the last 1/80 s into the release)
    const b = buildScene(s, 240), k = Math.round(g.release * 240), h0 = b.frames[k - 3][0].skeleton.rHand, h1 = b.frames[k][0].skeleton.rHand;
    const dir = (Math.atan2(h0.y - h1.y, h1.x - h0.x) * 180) / Math.PI, flight = (Math.atan2(-arc.vy, arc.vx) * 180) / Math.PI;
    assert.ok(Math.abs(dir - flight) < 30 && h1.x > h0.x, `${g.plan.id}: the way the hand was going (${dir.toFixed(0)} vs ${flight.toFixed(0)} degrees)`);
  }
  // the underhand arc rises clearly above the release before it comes down
  const c = close.path.segments[0] as { vy: number }, gpx = (2000 / 300) * H;
  assert.ok(c.vy < 0 && (c.vy * c.vy) / (2 * gpx) >= 0.2 * H, "the toss rises a fifth of a figure above the hand");
  // a gentle toss: the hand moves slower than in the strong overhand throw (at its fastest)
  // NO SLOW MOTION: the toss keeps the PASSED underhand pass's rhythm — every beat (gather, back-swing, forward
  // swing and release, follow-through, arms down) the same length, within a picture at 12 fps — with a smaller swing
  const throwParams = close.plan.characters[0].actions.find((a) => a.move === "throw")!.params as Record<string, unknown>;
  const start = { t: 0, x: 0, facing: "right" as const, pose: planToScene(close.plan, LIBRARY).characters[0].keys[0].pose };
  const settings = { height: H, style: "natural" as const, speed: "normal" as const, energy: 0.5 };
  const passKeys = LIBRARY.throw.run(start, { ...throwParams, swing: undefined }, settings).keys, tossKeys = LIBRARY.throw.run(start, throwParams, settings).keys;
  assert.equal(tossKeys.length, passKeys.length, "the same beats");
  for (const [i, k] of tossKeys.entries()) assert.ok(Math.abs(k.t - passKeys[i].t) <= 1 / 12, `beat ${i}: ${k.t.toFixed(3)} vs ${passKeys[i].t.toFixed(3)} s`);
  // a smaller swing: the hand lets go slower than in the full pass
  const passScene = planToScene({ ...close.plan, characters: [{ ...close.plan.characters[0], actions: close.plan.characters[0].actions.map((a) => (a.move === "throw" ? { ...a, params: { ...a.params, swing: undefined } } : a)) }] }, LIBRARY);
  const passV = handVelocityAt(passScene, passScene.marks[`${SOLDIER}.throw1.release`]).v;
  assert.ok(Math.hypot(close.velocity.x, close.velocity.y) < 0.7 * Math.hypot(passV.x, passV.y), "it lets go slower than the full pass");
  // it lands about 1.2–1.6 figure heights out, and settles 1.6–2.2 from his hips
  const hips = close.plan.characters[0].x;
  assert.ok((close.land.x - hips) / H >= 1.2 && (close.land.x - hips) / H <= 1.6, `lands ${((close.land.x - hips) / H).toFixed(2)} heights out`);
  assert.ok((close.rest.x - hips) / H >= 1.6 && (close.rest.x - hips) / H <= 2.2, `settles ${((close.rest.x - hips) / H).toFixed(2)} heights from his hips`);
  assert.equal(throwParams.effort, undefined, "no effort setting ever slows it");
});

test("grenade scenes: it arcs from his hand, bounces lower each time, settles, and explodes only after settling", () => {
  for (const g of [far, close]) {
    assert.ok(g.path.bounces.length >= 2, `${g.plan.id}: bounces`);
    for (let k = 1; k < g.path.bounces.length; k += 1) assert.ok(g.path.bounces[k].height < g.path.bounces[k - 1].height, "lower each time");
    assert.ok(g.boom >= g.release + g.path.settle + 0.5, `${g.plan.id}: a pause (the fuse) after it settles`);
    const s = planToScene(g.plan, LIBRARY) as EffectScene;
    // (it leaves from exactly where the hand had it)
    const built = buildScene(s, 120), fx = buildEffectFrames(s, built), i = Math.round(g.release * 120);
    const held = symbols(fx[i - 1].front, "Grenade")[0], flying = symbols(fx[i + 1].front, "Grenade")[0];
    assert.ok(held && flying && Math.hypot(held.x - flying.x, held.y - flying.y) < 0.12 * H, `${g.plan.id}: no jump at the release`);
    const rest = grenadeAt(g.path, g.path.settle, G, H);
    assert.ok(Math.abs(rest.y + grenadeHalfExtent(H, rest.rotation) - G) < 0.5, "settled on the ground");
    const ex = s.effects!.find((e) => e.kind === "explosion")!;
    assert.ok(Math.abs(ex.start - g.boom) < 1e-9 && Math.abs((ex.anchor as { x: number }).x - rest.x) < 1, "the blast is where it settled");
  }
});

test("grenade scenes: every picture has the Military cap covering the top of his head (it follows the head), and one Grenade until the blast — at 8, 12 and 24 fps", () => {
  for (const g of [far, close]) {
    const s = makeEffectsTestScene(g.plan, 1920) as EffectScene;
    for (const fps of [8, 12, 24]) {
      const built = buildScene(s, fps), fx = buildEffectFrames(s, built);
      fx.forEach((f, i) => {
        const t = i / fps, c = built.frames[i][0], caps = symbols(f.top, "Military cap");
        assert.equal(caps.length, 1, `${g.plan.id}@${fps} #${i}: one cap`);
        const shakeFree = Math.hypot(caps[0].x - c.skeleton.head.x, caps[0].y - c.skeleton.head.y);
        assert.ok(shakeFree < 1.5 * c.headRadius, `${g.plan.id}@${fps} #${i}: cap on the head (${(shakeFree / c.headRadius).toFixed(2)} r)`);
        const tilt = (Math.atan2(c.skeleton.head.x - c.skeleton.neck.x, c.skeleton.neck.y - c.skeleton.head.y) * 180) / Math.PI;
        assert.ok(Math.abs((caps[0].rotation ?? 0) - tilt) < 1e-6, "turns with the head");
        // ACCESSORIES COVER THE BODY PART: down over the top of the head, as wide as the head and its outline
        const cover = capCoverOf(caps[0], c.skeleton.head, c.headRadius, c.style.thickness);
        assert.ok(cover.left >= 0 && cover.right >= 0 && cover.over >= 0 && cover.down >= 0.5, `${g.plan.id}@${fps} #${i}: the cap covers the top of the head ${JSON.stringify(cover)}`);
        const grenades = symbols([...f.back, ...f.front], "Grenade").length;
        assert.equal(grenades, t < g.boom - 0.011 ? 1 : 0, `${g.plan.id}@${fps} #${i} (${t.toFixed(2)}s): grenades`);
      });
    }
  }
});

test("grenade scenes: the cap STAYS ON — one Military cap placement on his head in every picture the app makes, start to end (lying and getting up too)", async () => {
  const { prepareEffectSymbolsV1 } = await import("../../animation/animatorSceneSymbolsV1.ts");
  const { sceneEffectLayers } = await import("../toFrames.ts");
  const fakeCanvas = () => {
    const ctx2 = new Proxy({} as Record<string, unknown>, { get: () => () => undefined, set: () => true });
    const canvas = { width: 0, height: 0, getContext: () => ctx2 as unknown as CanvasRenderingContext2D, toDataURL: () => `data:image/png;base64,${Buffer.from(`${canvas.width}x${canvas.height}`).toString("base64")}` };
    return canvas;
  };
  for (const g of [far, close]) {
    const page = { width: 1280, height: 720 }, width = (page.width * STAGE_HEIGHT) / page.height;
    const s = makeEffectsTestScene(g.plan, width) as EffectScene, built = buildScene(s, 12);
    const centered = centerAnimation(built.frames, width, built.objects, effectFitBounds(s));
    const layers = sceneEffectLayers(s, built, centered.shift);
    const planned = prepareEffectSymbolsV1(layers, page, { symbols: [], assets: [] } as never, fakeCanvas)!;
    assert.ok(planned.top && planned.top.length === built.frames.length, `${g.plan.id}: the over-the-heads layer has every picture`);
    const names = new Map([...planned.definitions.entries()].map(([key]) => [key, JSON.parse(key)[1] as string]));
    planned.top.forEach((list: { pictureKey: string }[], i: number) => assert.equal(list.filter((p) => names.get(p.pictureKey) === "Military cap").length, 1, `${g.plan.id} picture ${i}/${built.frames.length}: the cap`));
    assert.ok(s.durationSec > g.boom + 3, `${g.plan.id}: to the end`);
  }
});

test("grenade scenes: the crate breaks — its pieces fly away from the blast and land, never below the ground", () => {
  const s = planToScene(far.plan, LIBRARY) as EffectScene, built = buildScene(s, 24), fx = buildEffectFrames(s, built);
  const crate = s.effects!.find((e) => e.kind === "crateBreak")!, cx = (crate.anchor as { x: number }).x;
  assert.ok(cx > far.rest.x && cx - far.rest.x < 1.2 * H, "just past where the grenade settles");
  for (const [i, f] of fx.entries()) {
    const t = i / 24;
    if (t < far.boom - 1e-6) assert.equal(symbols(f.front, "Wooden crate").length, 1, `${t.toFixed(2)}: the crate symbol`);
    else assert.equal(symbols(f.front, "Wooden crate").length, 0, `${t.toFixed(2)}: broken`);
    // (the Grenade's own oval is checked with grenadeHalfExtent above; its box corners may dip while it tumbles)
    for (const sh of [...f.back, ...f.front]) if (!(sh.kind === "symbol" && sh.name === "Grenade")) assert.ok(lowestOf(sh) <= G + 0.5, `${t.toFixed(2)}: ${sh.kind === "symbol" ? sh.name : sh.kind} above the ground`);
  }
  // the grenade never flies through the crate
  const box = { left: cx - 0.15 * H, right: cx + 0.15 * H, top: G - 0.3 * H };
  for (let t = 0; t <= far.path.settle; t += 1 / 120) {
    const p = grenadeAt(far.path, t, G, H);
    assert.ok(!(p.x > box.left && p.x < box.right && p.y > box.top), `t ${t.toFixed(2)}: not through the crate`);
  }
  // THROWN LIKE A PERSON: the pieces fly UP into the air (a clear height), away from the blast, then land and stop
  // (DEBRIS ARE SYMBOLS: the flying pieces are Wood plank and Wood chip symbols)
  const wood = (f: (typeof fx)[number]) => [...symbols(f.front, "Wood plank"), ...symbols(f.front, "Wood chip")];
  const boomAt = Math.ceil(far.boom * 24), top = Math.min(...fx.slice(boomAt).map((f) => Math.min(...wood(f).map((w) => w.y))));
  assert.ok(G - top > 0.5 * H, `pieces fly up ${((G - top) / H).toFixed(2)} heights`);
  const last = wood(fx[fx.length - 1]), before = wood(fx[fx.length - 2]);
  assert.equal(last.length, 15, "all the pieces are still there");
  assert.ok(last.reduce((sum, w) => sum + w.x, 0) / last.length > cx + 0.3 * H, "thrown away from the blast");
  assert.ok(last.every((w) => w.y > G - 0.1 * H && lowestOf(w) <= G + 0.5), "lying on the ground at the end");
  assert.deepEqual(last, before, "stopped");
});

test("grenade scenes: close and strong = BLOWN AWAY (away from the blast); far = only a flinch; a small screen shake on the blast", () => {
  // (the close grenade is just strong enough, by the blast rule, to throw him from where it settled)
  assert.ok(blastPushAt(close.strength, Math.abs(close.rest.x - close.plan.characters[0].x), H) >= THROWN_AT, "strong enough to throw him from there");
  const sc = planToScene(close.plan, LIBRARY), sf = planToScene(far.plan, LIBRARY);
  assert.ok(Math.abs(sc.marks[`${SOLDIER}.blownAway1.blast`] - close.boom) < 1e-3, "close: hit by the blast as it goes off");
  assert.ok(sc.marks[`${SOLDIER}.blownAway1.peak`] !== undefined && sc.marks[`${SOLDIER}.blownAway1.land`] !== undefined, "close: thrown");
  // BLASTS ARE SUDDEN: no turning round before it — he is standing there, facing it, when it goes off
  assert.ok(!Object.keys(sc.marks).some((k) => k.includes(".turn")), "close: no turn before the blast");
  assert.ok(sc.characters[0].keys.filter((k) => k.t < close.boom).every((k) => (k.facing ?? "right") === "right"), "close: still facing it at the blast");
  const b = buildScene(sc, 24), land = Math.round(sc.marks[`${SOLDIER}.blownAway1.land`] * 24), boom = Math.round(close.boom * 24);
  assert.ok(hipAt(b, land).x < hipAt(b, boom).x - 0.8 * H, "close: thrown away from the blast (it was in front of him)");
  assert.ok(Math.abs(sf.marks[`${SOLDIER}.blownAway1.blast`] - far.boom) < 1e-3 && sf.marks[`${SOLDIER}.blownAway1.react`] !== undefined && sf.marks[`${SOLDIER}.blownAway1.peak`] === undefined, "far: only a flinch");
  for (const g of [far, close]) {
    assert.equal(g.plan.shake.length, 1);
    assert.ok(Math.abs((g.plan.shake[0].at as number) - g.boom) < 1e-9 && (g.plan.shake[0].strength ?? 0) <= 0.015, "a small shake on the blast");
  }
});

test("grenade scenes: everything shows on the page — the far explosion too — on wide and narrow pages", () => {
  for (const g of [far, close]) for (const ratio of [16 / 9, 4 / 3]) {
    const width = STAGE_HEIGHT * ratio, s = makeEffectsTestScene(g.plan, width) as EffectScene;
    const built = buildScene(s, 12), centered = centerAnimation(built.frames, width, built.objects, effectFitBounds(s));
    assert.ok(centered.fits, `${g.plan.id} @ ${width.toFixed(0)}: figures and effects fit`);
    const fx = buildEffectFrames(s, built), left = 960 - width / 2 - 1, right = 960 + width / 2 + 1;
    for (const [i, f] of fx.entries()) for (const sh of [...f.back, ...f.front, ...(f.top ?? [])]) {
      if ((sh.alpha ?? 1) < 0.05) continue;
      const bb = shapeBounds([sh]), x0 = bb.minX + centered.shift.x, x1 = bb.maxX + centered.shift.x, y0 = bb.minY + centered.shift.y;
      assert.ok(x0 >= left - 0.05 * H && x1 <= right + 0.05 * H && y0 >= -1, `${g.plan.id} @ ${width.toFixed(0)} #${i}: ${sh.kind} ${sh.kind === "symbol" ? sh.name : ""} on the page (${x0.toFixed(0)}..${x1.toFixed(0)})`);
    }
  }
});

test("grenade scenes: the head is named by its color; the lessons teach explosions, throwing and bouncing", () => {
  const s = planToScene(far.plan, LIBRARY);
  assert.equal(headSymbolNameV1(s.characters[0]), "Black stick figure head");
  const text = lessonPack(LIBRARY).principles.join("\n");
  for (const word of ["EXPLOSIONS", "THROWING: overhand to throw far", "underhand for a short toss", "BOUNCING", "bounce lower", "a stronger blast knocks people back from farther away"]) assert.ok(text.includes(word) || text.toLowerCase().includes(word.toLowerCase()), word);
});
