import assert from "node:assert/strict";
import test from "node:test";
import { buildScene, type FrameCharacter } from "../engine.ts";
import { buildEffectFrames, type EffectScene } from "../effects/index.ts";
import { handcuffsAt, HANDCUFFS_ACROSS, HANDCUFFS_ASPECT, HANDCUFFS_PARTS, HANDCUFFS_SIZE, WRIST_IN } from "../effects/handcuffs.ts";
import { centerAnimation, STAGE_HEIGHT } from "../stageFit.ts";
import { makeSymbol, PLACED_SYMBOLS, shapeBounds } from "../symbolMaker.ts";
import type { Point } from "../rig.ts";
import { CUFFED_ARMS, cuffsPlan, ESCAPE, ESCORT_GAP, POLICE_REACTS } from "./cuffs.ts";
import { LIBRARY } from "./library.ts";
import { lessonPack } from "./lessons.ts";
import { planToScene, type Action, type CharacterPlan, type ScenePlan } from "./plan.ts";
import { policeEscortPlan } from "./scenesCuffs.ts";
import { COMBO_TESTS, SINGLE_MOVE_TESTS, surprisePlan } from "./tests.ts";
import { effectsTestScenes, makeEffectsTestScene } from "./tests2c.ts";
import { armPathProblems, assertNatural, startStance } from "./testkit.ts";

// HANDCUFFS AND A POLICE ESCORT (cuffs.ts, SPEC-0017 Phase 2C extras).
const H = 300, GROUND = 900;
const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
const scene = (characters: CharacterPlan[]) => planToScene({ id: "t", title: "t", height: H, groundY: GROUND, characters }, LIBRARY);
const cuffedSolo = (actions: Action[], facing: "left" | "right" = "right", x = 960): CharacterPlan => ({ id: "a", name: "A", x, facing, cuffed: true, actions });
// How far the hands are BEHIND the back line (stage px, + = behind), at the hands' height, for a side view.
function behindBack(c: FrameCharacter) {
  const s = c.skeleton, dir = c.facing === "left" ? -1 : 1;
  const hand = { x: (s.lHand.x + s.rHand.x) / 2, y: (s.lHand.y + s.rHand.y) / 2 };
  const u = (hand.y - s.neck.y) / (s.hip.y - s.neck.y), lineX = s.neck.x + (s.hip.x - s.neck.x) * u;
  return (lineX - hand.x) * dir;
}
// The hands from the neck in the body's own frame (along the back, and out behind it), x height.
function handsInBody(c: FrameCharacter) {
  const s = c.skeleton, dir = c.facing === "left" ? -1 : 1;
  const down = { x: (s.hip.x - s.neck.x) / (0.3 * H), y: (s.hip.y - s.neck.y) / (0.3 * H) };
  const back = { x: -down.y * dir, y: down.x * dir }; // square to the back, pointing behind
  const h = { x: (s.lHand.x - s.neck.x) / H, y: (s.lHand.y - s.neck.y) / H };
  return { along: h.x * down.x + h.y * down.y, behind: -(h.x * back.x + h.y * back.y) };
}

test("handcuffs: the Handcuffs symbol, the escort and tug moves, the lessons", () => {
  assert.ok(LIBRARY.escort && LIBRARY.tug, "moves in the library");
  assert.deepEqual(PLACED_SYMBOLS.Handcuffs, { kind: "handcuffs", size: HANDCUFFS_SIZE });
  const made = makeSymbol({ name: "Handcuffs", kind: "handcuffs", size: HANDCUFFS_SIZE });
  const b = shapeBounds(made.shapes);
  assert.ok(Math.abs(made.width / made.height - HANDCUFFS_ASPECT) < 1e-9 && b.minX >= 0 && b.maxX <= made.width && b.minY >= 0 && b.maxY <= made.height, "drawn inside its box");
  // WORN, NOT HELD: two narrow bands standing across the forearm line (y = 0.5), side by side along it, and a chain
  // of two links under them, much shorter than the cuffs are wide.
  const [a, b2] = HANDCUFFS_PARTS.bands, { from, to } = HANDCUFFS_PARTS.chain;
  assert.ok(a.y === 0.5 && b2.y === 0.5 && a.ry > 2.5 * a.rx && b2.ry > 2.5 * b2.rx, "bands across the forearm");
  assert.ok(b2.x - a.x < 0.6 && Math.hypot(to.x - from.x, to.y - from.y) < 0.6, "side by side, a very short chain");
  const pack = lessonPack(LIBRARY);
  assert.ok(pack.principles.some((p) => p.startsWith("HANDCUFFS")) && pack.principles.some((p) => p.startsWith("POLICE ESCORT")));
  // On its own (no partner, as in the lessons) the escort just stands ready; the tug works from a stand.
  const settings = { height: H, style: "natural" as const, speed: "normal" as const, energy: 0.5 };
  for (const id of ["escort", "tug"]) {
    const out = LIBRARY[id].run(startStance(), {}, settings);
    assert.ok(out.keys.length >= 2 && out.end.t > 0, `${id} has keys`);
  }
  const marks = LIBRARY.tug.run(startStance(), {}, settings).marks;
  assert.ok(marks.escape < marks.pull && marks.pull < marks.yanked && marks.yanked < marks.settled, "tug marks in order");
  // NO WIND-UP: the very first thing the escape does is go forward.
  const tugKeys = LIBRARY.tug.run(startStance(), {}, settings).keys;
  assert.ok(tugKeys[1].x > tugKeys[0].x + 0.05 * H, "it bursts forward at once");
});

test("cuffed: the hands stay together behind the back while walking and standing — the arms never swing", () => {
  for (const facing of ["right", "left"] as const) {
    const s = scene([cuffedSolo([{ move: "walk", params: { distance: 400 } }, { move: "stand", params: { seconds: 1 } }, { move: "walk", params: { distance: 200 }, speed: "fast" }], facing)]);
    for (const fps of [12, 24]) {
      const frames = buildScene(s, fps).frames;
      const along: number[] = [], out: number[] = [];
      for (const [i, f] of frames.entries()) {
        const c = f[0];
        assert.ok(dist(c.skeleton.lHand, c.skeleton.rHand) <= 1, `${facing}@${fps} ${i}: hands together`);
        const behind = behindBack(c);
        assert.ok(behind >= 0.035 * H && behind <= 0.09 * H, `${facing}@${fps} ${i}: hands behind the back (${behind.toFixed(1)} px)`);
        const p = handsInBody(c);
        along.push(p.along); out.push(p.behind);
        // (At the lower back: below the chest, above the hips.)
        assert.ok(c.skeleton.lHand.y < c.skeleton.hip.y && c.skeleton.lHand.y > c.skeleton.neck.y + 0.18 * H, `${facing}@${fps} ${i}: hands at the lower back`);
      }
      // NO ARM SWING: the hands keep their place on the back (within a few px), where a free walk swings them far.
      const spread = (v: number[]) => (Math.max(...v) - Math.min(...v)) * H;
      assert.ok(spread(along) < 2 && spread(out) < 2, `${facing}@${fps}: arm swing ${spread(along).toFixed(1)} / ${spread(out).toFixed(1)} px`);
    }
  }
  // (The same measure on a free walk: the arms really swing there.)
  const free = buildScene(scene([{ ...cuffedSolo([{ move: "walk", params: { distance: 400 } }]), cuffed: undefined }]), 24).frames.map((f) => handsInBody(f[0]).behind);
  assert.ok((Math.max(...free) - Math.min(...free)) * H > 40, "a free walk swings its arms");
});

test("cuffed: shorter, slower steps and a little more lean; uncuffed figures are untouched", () => {
  const walk: Action[] = [{ move: "walk", params: { distance: 600 } }];
  const cuffed = scene([cuffedSolo(walk)]), free = scene([{ ...cuffedSolo(walk), cuffed: undefined }]);
  const landings = (keys: { contacts?: string[] }[]) => keys.filter((k, i) => i > 0 && (k.contacts ?? []).some((f) => !(keys[i - 1].contacts ?? []).includes(f))).length;
  assert.ok(landings(cuffed.characters[0].keys) > landings(free.characters[0].keys), "more (shorter) steps for the same way");
  const mid = (sc: typeof cuffed) => sc.characters[0].keys[Math.floor(sc.characters[0].keys.length / 2)].pose;
  assert.ok(mid(cuffed).lean > mid(free).lean, "leans in a little more");
  assert.equal(mid(cuffed).lShoulder, CUFFED_ARMS.shoulder);
  // A plan with nobody cuffed and no escort goes through untouched (the published moves look exactly as before).
  const plans: ScenePlan[] = [
    ...[...SINGLE_MOVE_TESTS, ...COMBO_TESTS].map((t) => t.plan({ style: "natural", speed: "normal", energy: 0.5, direction: 1 })),
    ...[1, 2, 3, 4, 5].map((seed) => surprisePlan(seed * 7919, { style: "angry", speed: "fast", energy: 0.85, direction: -1 })),
  ];
  for (const p of plans) assert.equal(cuffsPlan(p), p, p.id);
});

test("cuffed in other moves: turning, sitting, a tug — hands together, never in the floor, body rules kept", () => {
  for (const facing of ["right", "left"] as const) {
    const s = scene([cuffedSolo([{ move: "walk", params: { distance: 250 } }, { move: "turn" }, { move: "walk", params: { distance: 150 } }, { move: "tug" }, { move: "sit", params: { seconds: 1 } }, { move: "stand", params: { seconds: 0.5 } }], facing)]);
    const built = assertNatural(s, `cuffed combo ${facing}`);
    assert.deepEqual(armPathProblems(built.frames, 24), [], facing);
    for (const [i, f] of built.frames.entries()) {
      const c = f[0];
      assert.ok(dist(c.skeleton.lHand, c.skeleton.rHand) <= 0.035 * H, `${facing} ${i}: hands together`);
      assert.ok(Math.max(c.skeleton.lHand.y, c.skeleton.rHand.y) <= GROUND, `${facing} ${i}: hands above the floor`);
      if (c.facing !== "front") assert.ok(behindBack(c) > 0, `${facing} ${i}: hands behind the back`);
    }
  }
  // Cuffed from a moment on: free arms before, behind the back after (eased in, no jump).
  const later = scene([{ ...cuffedSolo([{ move: "walk", params: { distance: 500 } }]), cuffed: { from: 1.5 } }]);
  const frames = assertNatural(later, "cuffed from 1.5 s").frames;
  assert.ok(dist(frames[Math.round(1.2 * 24)][0].skeleton.lHand, frames[Math.round(1.2 * 24)][0].skeleton.rHand) > 0.05 * H, "free before");
  assert.ok(dist(frames[Math.round(2.2 * 24)][0].skeleton.lHand, frames[Math.round(2.2 * 24)][0].skeleton.rHand) <= 1, "cuffed after");
  assert.ok(((later as EffectScene).effects ?? []).some((e) => e.kind === "handcuffs" && e.start === 1.5), "the cuffs appear when it is cuffed");
});

test("police escort: right behind in step, one hand on the cuffs and one on the shoulder in every picture", () => {
  const s = planToScene(policeEscortPlan(), LIBRARY);
  const m = s.marks;
  const tug = [m["robber.tug1.escape"], m["robber.tug1.settled"]];
  assert.ok(tug.every(Number.isFinite), "the robber tries to escape");
  for (const fps of [8, 10, 12, 15, 24, 30]) {
    const frames = buildScene(s, fps).frames;
    for (const [i, f] of frames.entries()) {
      const [police, robber] = f, p = police.skeleton, q = robber.skeleton, t = i / fps;
      // The cuffs' chain, under the wrists (where the Handcuffs symbol puts it).
      const cuffs = handcuffsAt(q.lHand, q.lElbow, H).chain;
      assert.ok(dist(p.lHand, cuffs) <= 3, `@${fps} ${t.toFixed(2)}s: holding hand ${dist(p.lHand, cuffs).toFixed(1)} px off the cuffs`);
      // The other hand on the robber's upper arm (by the shoulder; it slides down the arm when he lunges away).
      assert.ok(segmentDistance(p.rHand, q.neck, q.lElbow) <= 3 && dist(p.rHand, q.neck) <= 0.17 * H, `@${fps} ${t.toFixed(2)}s: shoulder hand ${segmentDistance(p.rHand, q.neck, q.lElbow).toFixed(1)} px off the upper arm`);
      // The holding arm reaches forward with its elbow bent (never locked straight).
      assert.ok(dist(p.neck, p.lHand) <= 0.97 * 0.31 * H + 0.5, `@${fps} ${t.toFixed(2)}s: holding elbow bent`);
      assert.ok(dist(q.lHand, q.rHand) <= 1 && behindBack(robber) > 0.02 * H, `@${fps} ${t.toFixed(2)}s: cuffed hands together behind the back`);
      // Right behind, at a steady gap (the escape pulls them apart, then the police pulls him back).
      const gap = q.hip.x - p.hip.x;
      if (t < tug[0] - 0.01 || t > tug[1] + 0.01) assert.ok(Math.abs(gap - ESCORT_GAP * H) <= 3, `@${fps} ${t.toFixed(2)}s: gap ${gap.toFixed(1)}`);
      else assert.ok(gap >= 0.26 * H && gap <= 0.45 * H, `@${fps} ${t.toFixed(2)}s: gap in the escape ${gap.toFixed(1)}`);
      // In step: the same feet, the same rhythm.
      assert.ok(Math.abs((p.lFoot.x - p.hip.x) - (q.lFoot.x - q.hip.x)) <= 0.05 * H || (t >= tug[0] && t <= tug[1]), `@${fps} ${t.toFixed(2)}s: in step`);
      // No body through another: heads apart, nobody's hand or elbow through the other's back or chest.
      assert.ok(dist(p.head, q.head) >= 2 * police.headRadius + 8, `@${fps} ${t.toFixed(2)}s: heads apart`);
      // A CLEAR GAP: the police's chest stays well behind the robber's cuffed arms (about half a body width).
      const clear = Math.min(...[q.lHand, q.lElbow].map((joint) => segmentDistance(joint, p.hip, p.neck)));
      assert.ok(clear >= (t < tug[0] - 0.01 || t > tug[1] + 0.01 ? 0.12 : 0.09) * H, `@${fps} ${t.toFixed(2)}s: gap between the police's chest and the robber's arms ${clear.toFixed(1)} px`);
      for (const joint of [p.lHand, p.lElbow, p.rElbow]) assert.ok(segmentDistance(joint, q.hip, q.neck) > 8, `@${fps} ${t.toFixed(2)}s: police's arms clear of the robber's body`);
    }
  }
});

test("the escape attempt: sudden, mid-walk; the police reacts AFTER it starts, pulls him back; then they walk on", () => {
  const s = planToScene(policeEscortPlan(), LIBRARY), m = s.marks;
  const fps = 48, frames = buildScene(s, fps).frames, at = (t: number) => frames[Math.min(frames.length - 1, Math.round(t * fps))];
  const t0 = m["robber.tug1.escape"], react = m["police.escort1.react"];
  const speed = (who: 0 | 1, t: number) => (at(t + 0.05)[who].skeleton.hip.x - at(t - 0.05)[who].skeleton.hip.x) / 0.1 / H; // x height per second
  const lean = (who: 0 | 1, t: number) => { const k = at(t)[who].skeleton; return (Math.atan2(k.neck.x - k.hip.x, k.hip.y - k.neck.y) * 180) / Math.PI; };
  // IN THE MIDDLE OF WALKING: both are walking right up to it, and nothing stopped before it (no stop, no wind-up).
  for (let t = 1.2; t <= t0 - 0.05; t += 0.05) for (const who of [0, 1] as const) assert.ok(speed(who, t) > 0.2, `${who ? "robber" : "police"} walking at ${t.toFixed(2)}s (${speed(who, t).toFixed(2)})`);
  assert.ok(at(t0)[1].skeleton.lFoot.y < GROUND - 1 || at(t0)[1].skeleton.rFoot.y < GROUND - 1 || speed(1, t0 - 0.05) > 0.25, "it starts mid-stride");
  // SUDDEN: within a fifth of a second the robber is going much faster than he walked.
  const burst = Math.max(...[0.02, 0.05, 0.08, 0.11, 0.14].map((d) => speed(1, t0 + d)));
  assert.ok(burst > 1.5 * speed(1, t0 - 0.15), `a burst forward (${burst.toFixed(2)} vs ${speed(1, t0 - 0.15).toFixed(2)} x height a second)`);
  // A REACTION COMES AFTER ITS CAUSE: the police reacts 0.15-0.25 s after the escape starts.
  assert.ok(react - t0 >= 0.15 - 1e-9 && react - t0 <= 0.25 + 1e-9, `the police reacts ${(react - t0).toFixed(2)} s after`);
  assert.ok(Math.abs(POLICE_REACTS - (react - t0)) < 1e-6, "the reaction time the police is taught");
  // Until then it just walks on (still going forward, not leaning back)...
  for (let t = t0; t <= t0 + 0.12; t += 0.02) assert.ok(speed(0, t) > 0.15 && lean(0, t) >= lean(0, t0) - 1, `police unaware at ${t.toFixed(2)}s`);
  // ...then it digs its heels in (stops), leans back and pulls him back.
  assert.ok(Math.abs(speed(0, m["robber.tug1.yanked"] - 0.05)) < 0.6, "the police has stopped");
  assert.ok(lean(0, m["robber.tug1.yanked"]) < lean(0, t0) - 4, "and leans back, pulling");
  assert.ok(at(m["robber.tug1.pull"])[1].skeleton.hip.x - at(t0)[1].skeleton.hip.x > 0.08 * H, "the robber lunged forward");
  assert.ok(at(m["robber.tug1.yanked"])[1].skeleton.hip.x < at(m["robber.tug1.pull"])[1].skeleton.hip.x - 0.1 * H, "and is pulled back");
  // THEN THEY WALK ON: within a second of settling, both are walking again, and they don't stand about.
  const settled = m["robber.tug1.settled"];
  for (const who of [0, 1] as const) {
    let walking = Infinity;
    for (let t = settled; t < settled + 1.2; t += 0.02) if (speed(who, t) > 0.2) { walking = t; break; }
    assert.ok(walking - settled < 1, `${who ? "robber" : "police"} walks on ${(walking - settled).toFixed(2)} s after settling`);
  }
  assert.ok(settled - t0 <= ESCAPE.settled + 1e-6, "the escape is over quickly");
});

test("police escort: the Handcuffs symbol follows the wrists, turned with the forearm, in every picture", () => {
  const s = planToScene(policeEscortPlan(), LIBRARY) as EffectScene & ReturnType<typeof planToScene>;
  for (const fps of [12, 24]) {
    const built = buildScene(s, fps), fx = buildEffectFrames(s, built);
    for (const [i, f] of built.frames.entries()) {
      const cuffs = fx[i].front.filter((sh) => sh.kind === "symbol" && sh.name === "Handcuffs");
      assert.equal(cuffs.length, 1, `@${fps} ${i}: one Handcuffs symbol`);
      const c = cuffs[0] as Extract<typeof cuffs[number], { kind: "symbol" }>, q = f[1].skeleton;
      assert.ok(dist(c, q.lHand) <= WRIST_IN * H + 0.5, `@${fps} ${i}: on the wrists`);
      // WORN: the box lies along the forearm, so each band stands square across it...
      const fore = Math.atan2(q.lHand.y - q.lElbow.y, q.lHand.x - q.lElbow.x), along = ((c.rotation ?? 0) * Math.PI) / 180;
      assert.ok(Math.abs(Math.sin(along - fore)) < 0.02, `@${fps} ${i}: the cuffs lie along the forearm`);
      // ...and the forearm runs through both bands, right at the wrist (just above the hand), the band snug round it.
      const place = handcuffsAt(q.lHand, q.lElbow, H);
      for (const band of HANDCUFFS_PARTS.bands) {
        const mid = place.at(band);
        assert.ok(segmentDistance(mid, q.lElbow, q.lHand) < 1, `@${fps} ${i}: the forearm passes through the band`);
        assert.ok(dist(mid, q.lHand) < 0.06 * H, `@${fps} ${i}: at the wrist`);
      }
      const bandLength = 2 * HANDCUFFS_PARTS.bands[0].ry * HANDCUFFS_ACROSS * H, line = f[1].style.thickness;
      assert.ok(bandLength > line + 3 && bandLength < 3 * line, `@${fps} ${i}: snug (${bandLength.toFixed(1)} px round a ${line} px arm)`);
      // A very short chain, hanging under the wrists.
      const chain = [place.at(HANDCUFFS_PARTS.chain.from), place.at(HANDCUFFS_PARTS.chain.to)];
      assert.ok(dist(chain[0], chain[1]) < 0.04 * H && Math.abs(c.scale! * HANDCUFFS_SIZE - HANDCUFFS_ACROSS * H) < 1e-9, `@${fps} ${i}: short chain`);
      assert.ok(place.chain.y > place.y, `@${fps} ${i}: the chain hangs below`);
    }
  }
});

test("police escort: body rules, no jumps, whole on every page shape, and in the Effects (2C) list", () => {
  const entry = effectsTestScenes().find((e) => e.id === "policeEscort");
  assert.ok(entry?.plan, "the Police escort button");
  const s = planToScene(entry!.plan!, LIBRARY);
  const built = assertNatural(s, "police escort");
  assert.deepEqual(armPathProblems(built.frames, 24), []);
  const b8 = buildScene(s, 8);
  for (const r of b8.report.characters) assert.ok(r.maxBoneErrorPx <= 0.5 && r.maxFootDriftPx <= 1 && r.belowGroundFrames === 0 && r.maxJointStepPx < 360, `@8 ${r.id}`);
  for (const ratio of [16 / 9, 4 / 3, 1, 9 / 16]) {
    const width = STAGE_HEIGHT * ratio, fitted = makeEffectsTestScene(entry!.plan!, width);
    const frames = assertNatural(fitted, `page ${width.toFixed(0)}`).frames;
    assert.ok(centerAnimation(frames, width).fits, `page ${width.toFixed(0)}: on the page`);
    // (Still right behind with a hand on the cuffs on a narrow page.)
    const last = frames[frames.length - 1];
    assert.ok(Math.abs(last[1].skeleton.hip.x - last[0].skeleton.hip.x - ESCORT_GAP * H) < 3, `page ${width.toFixed(0)}: right behind`);
  }
  // A blue officer and a red robber.
  assert.deepEqual(s.characters.map((c) => c.style.color), ["#2563eb", "#e02424"]);
});

function segmentDistance(p: Point, a: Point, b: Point) {
  const dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy || 1;
  const u = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2));
  return Math.hypot(p.x - a.x - u * dx, p.y - a.y - u * dy);
}

test("police escort: the app's Library path makes ONE 'Handcuffs' symbol, placed on the wrists in every picture", async () => {
  const { prepareEffectSymbolsV1, engineToSymbolStageV1 } = await import("../../animation/animatorSceneSymbolsV1.ts");
  const { sceneEffectLayers } = await import("../toFrames.ts");
  const fakeCanvas = () => {
    const ctx = new Proxy({} as Record<string, unknown>, { get: () => () => undefined, set: () => true });
    const canvas = { width: 0, height: 0, getContext: () => ctx as unknown as CanvasRenderingContext2D, toDataURL: () => `data:image/png;base64,${Buffer.from(`${canvas.width}x${canvas.height}`).toString("base64")}` };
    return canvas;
  };
  const page = { width: 1280, height: 720 }, width = (page.width * STAGE_HEIGHT) / page.height;
  const s = makeEffectsTestScene(policeEscortPlan(), width);
  const built = buildScene(s, 12), centered = centerAnimation(built.frames, width, built.objects);
  const layers = sceneEffectLayers(s, built, centered.shift);
  const planned = prepareEffectSymbolsV1(layers, page, { symbols: [], assets: [] } as never, fakeCanvas)!;
  assert.deepEqual(planned.catalogs.symbols.map((symbol: { name: string }) => symbol.name), ["Handcuffs"]);
  const toSymbol = engineToSymbolStageV1(page.width, page.height)!;
  for (const [i, fx] of planned.effects!.entries()) {
    assert.equal(fx.front.length, 1, `picture ${i}: one Handcuffs placement`);
    const hand = centered.frames[i][1].skeleton.lHand, at = toSymbol.point(hand.x, hand.y);
    assert.ok(Math.hypot(fx.front[0].centerX - at.x, fx.front[0].centerY - at.y) <= (WRIST_IN * H + 1) * toSymbol.scale, `picture ${i}: on the robber's wrists`);
  }
});
