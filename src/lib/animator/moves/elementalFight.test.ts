import assert from "node:assert/strict";
import test from "node:test";
import { buildScene } from "../engine.ts";
import { buildEffectFrames, type EffectScene, type EffectTrack } from "../effects/index.ts";
import { animationBounds } from "../stageFit.ts";
import { CLASH_SWELL, elementalTracks, jumpAt, powerUses, streamTravel, WALL_SIZE } from "./elements.ts";
import { ELEMENTAL_TEST, elementalFightPlan, elementalFightTestPlan, type ElementalFightOptions } from "./elementalFight.ts";
import { LIBRARY } from "./library.ts";
import { fitPlanToPage, planToScene, type ScenePlan } from "./plan.ts";
import { assertNatural } from "./testkit.ts";
import { effectsTestScenes, makeEffectsTestScene } from "./tests2c.ts";

// SPEC-0017 Phase 2C extras: ELEMENTAL FIGHTS (Arthur, 2026-10-06: "this does this, he does that") — the rules of what
// powers do to each other (elements.ts) and the director that makes a new elemental fight from them for any seed
// (elementalFight.ts).

const H = 300, PAGE = 1920;
type Built = ReturnType<typeof planToScene> & EffectScene;
const scenes = new Map<string, { plan: ScenePlan; scene: Built }>();
// (each fight is made once and shared by the tests below)
function fight(o: ElementalFightOptions) {
  const key = JSON.stringify(o);
  if (!scenes.has(key)) {
    // (the director's plan as it makes it — centred, with whatever its try-out showed the engine needed — on the page)
    const plan = elementalFightPlan(o);
    scenes.set(key, { plan, scene: fitPlanToPage(plan, LIBRARY, PAGE) as Built });
  }
  return scenes.get(key)!;
}
const SEEDS = [9, 4, 13, 20, 2];
const FIGHTS: ElementalFightOptions[] = [...SEEDS.map((seed) => ({ seed, seconds: 10, red: "laserEyes", blue: "ice" })), { seed: 3, seconds: 10, red: "fire", blue: "water" }];
const label = (o: ElementalFightOptions) => `${o.red} vs ${o.blue} #${o.seed}`;

// ---- What answered each power attack ----------------------------------------------------------------------
type Answer = { attack: string; kind: "block" | "dodge" | "counter" | "hit" | "clash" | "none"; dt: number; arrive: number };
function answers(plan: ScenePlan, scene: Built): Answer[] {
  const marks = scene.marks, uses = powerUses(plan, marks), fx = scene.effects ?? [];
  const xAt = (id: string, t: number) => { const ks = scene.characters.find((c) => c.id === id)!.keys; let k = ks[0]; for (const q of ks) { if (q.t > t) break; k = q; } return k.x; };
  const hitsOn = (id: string) => Object.entries(marks).filter(([k]) => new RegExp(`^${id}\\.getHit\\d+\\.hit$`).test(k)).map(([, v]) => v);
  const out: Answer[] = [];
  // (a beam fired to zap crystals out of the air is itself the answer to them, not an attack)
  for (const u of uses.filter((x) => x.kind !== "wall" && x.target && x.params.counter !== true)) {
    const name = `${u.id}.${u.move}${u.k}`, them = u.target!;
    let arrive: number;
    if (u.kind === "beam") arrive = u.start + streamTravel(u.element, Math.abs(xAt(them, u.start) - xAt(u.id, u.start)), H);
    else if (u.kind === "volley") arrive = marks[`${name}.hit`];
    else arrive = marks[`${name}.reach`];
    const found: Answer[] = [];
    const clash = fx.find((e) => e.kind === "clash" && e.start <= arrive + 0.2 && arrive <= e.end);
    if (clash) found.push({ attack: name, kind: "clash", dt: Math.abs(clash.start - u.start), arrive });
    // (a wall raised for it: up by the time it gets there, and raised no earlier than just before it came out)
    const wall = uses.find((w) => w.kind === "wall" && w.id === them && w.start <= arrive + 0.05 && w.end >= arrive && w.start >= u.start - 0.6);
    if (wall) found.push({ attack: name, kind: "block", dt: Math.max(0, wall.start - arrive), arrive });
    // (a counter: the crystals shatter in the air on their way, where a beam meets them)
    if (u.kind === "volley" && fx.some((e) => e.kind === "iceShatter" && e.start >= u.start && e.start <= arrive + 0.05 && "y" in e.anchor && e.anchor.y < plan.groundY - 0.3 * H)) found.push({ attack: name, kind: "counter", dt: 0, arrive });
    for (let t = arrive - 0.15; t <= arrive + 0.15; t += 0.05) if (jumpAt(plan, marks, them, t)) { found.push({ attack: name, kind: "dodge", dt: 0, arrive }); break; }
    const hit = hitsOn(them).filter((t) => t >= arrive - 0.1 && t <= arrive + 0.5).sort((a, b) => a - b)[0];
    if (hit !== undefined) found.push({ attack: name, kind: "hit", dt: hit - arrive, arrive });
    out.push(found.sort((a, b) => a.dt - b.dt)[0] ?? { attack: name, kind: "none", dt: Infinity, arrive });
  }
  return out;
}
// When the fight is decided: the clash's burst (or the last knock-down).
const burstOf = (scene: Built) => {
  const clash = (scene.effects ?? []).find((e) => e.kind === "clash");
  if (clash) return clash.start + Number(clash.params?.burst ?? 0);
  return Math.max(...Object.entries(scene.marks).filter(([k]) => /\.getHit\d+\.knockdown$/.test(k)).map(([, v]) => v));
};

test("the test button: \"Elemental fight: laser eyes vs ice\" is in the Effects (2C) list, the same fight as the director's", () => {
  const entry = effectsTestScenes().find((e) => e.id === "elementalFight");
  assert.ok(entry && entry.plan, "the entry");
  assert.equal(entry.label, "Elemental fight: laser eyes vs ice");
  const again = elementalFightPlan({ ...ELEMENTAL_TEST, middle: undefined });
  // (its fixed middle is where the director would centre it)
  const mid = (p: ScenePlan) => (p.characters[0].x + p.characters[1].x) / 2;
  // (the fight Arthur gave 10/10 — 2026-10-06 — kept as it is: its middle was measured then; the director now centres
  // it a little differently, still well on the page)
  assert.ok(Math.abs(mid(entry.plan) - mid(again)) < 40, `middle ${mid(entry.plan)} vs centred ${mid(again)}`);
  assert.deepEqual(entry.plan.characters.map((c) => c.actions), again.characters.map((c) => c.actions));
  const scene = makeEffectsTestScene(entry.plan, PAGE) as Built;
  const kinds = new Set((scene.effects ?? []).map((e) => e.kind));
  for (const k of ["laserEyes", "iceSpikes", "iceCracks", "iceShards", "iceShatter", "clash", "smokeBurst"]) assert.ok(kinds.has(k), `it shows ${k}`);
  assert.equal(elementalFightTestPlan().title, "Elemental fight: laser eyes vs ice");
});

test("elemental fights: new every seed, both attack, every power attack answered within half a second", () => {
  const seen = new Set<string>();
  for (const o of FIGHTS) {
    const { plan, scene } = fight(o);
    seen.add(JSON.stringify(plan.characters.map((c) => c.actions.map((a) => a.move))));
    const list = answers(plan, scene);
    assert.ok(list.length >= 3, `${label(o)}: ${list.length} power attacks`);
    for (const a of list) assert.ok(a.kind !== "none" && a.dt <= 0.5 + 1e-6, `${label(o)}: ${a.attack} (arrives ${a.arrive.toFixed(2)} s) answered by ${a.kind} after ${a.dt.toFixed(2)} s`);
    // BOTH ATTACK: each fires a power at the other; and they fight close in too (a dash punch at least).
    const uses = powerUses(plan, scene.marks);
    for (const id of ["red", "blue"]) assert.ok(uses.some((u) => u.id === id && u.kind !== "wall" && u.params.counter !== true), `${label(o)}: ${id} attacks with a power`);
    assert.ok(Object.keys(scene.marks).some((k) => /^\w+\.strike\d+\.hit$/.test(k)), `${label(o)}: a strike lands`);
    // ...and each answers something.
    const answered = new Set(list.filter((a) => a.kind !== "clash").map((a) => (a.attack.startsWith("red") ? "blue" : "red")));
    assert.equal(answered.size, 2, `${label(o)}: both defend (${[...answered]})`);
  }
  assert.ok(seen.size >= FIGHTS.length - 1, `different fights (${seen.size} of ${FIGHTS.length})`);
});

test("elemental fights: decided in 6.5-14 s, something happens every 1.5 s, open strong, end clearly", () => {
  const EVENT = /^\w+\.[a-zA-Z]+\d+\.(charge|dip|windup|release|hit|takeoff|land|push|crouch|reach|shatter|raise|react|knockdown|guard)$/;
  for (const o of FIGHTS) {
    const { plan, scene } = fight(o);
    const burst = burstOf(scene);
    assert.ok(burst >= 6.5 && burst <= 14, `${label(o)}: decided at ${burst.toFixed(1)} s`);
    assert.ok(scene.durationSec >= 9 && scene.durationSec <= 19.5, `${label(o)}: ${scene.durationSec} s long`);
    // OPEN STRONG: a power is on its way in the first second and a half.
    const first = Math.min(...powerUses(plan, scene.marks).map((u) => u.start));
    assert.ok(first <= 1.5, `${label(o)}: first power at ${first.toFixed(2)} s`);
    // EVERY 1.5 s: never longer than that without something starting or landing (a power, a hit, a jump, a dash).
    // (a body really moving is something happening too — a run, a stagger, a crouch for a jump: a picture where a joint
    // of either one goes faster than a body height a second; breathing in the guard is far slower)
    const built = buildScene(scene, 12);
    const fast = (i: number, c: number) => { const a = built.frames[i - 1][c].skeleton, b = built.frames[i][c].skeleton; return Math.max(...(Object.keys(b) as (keyof typeof b)[]).map((j) => Math.hypot(b[j].x - a[j].x, b[j].y - a[j].y))) * 12 > H; };
    const running = built.frames.map((f, i) => i).filter((i) => i > 0 && (fast(i, 0) || fast(i, 1))).map((i) => i / 12);
    // (...and so is a power pouring out — a stream on its way, a clash pushing back and forth)
    const pouring = (e: EffectTrack) => (e.kind === "clash" ? Number(e.params?.burst) : ["fireStream", "iceStream", "waterStream"].includes(e.kind) ? e.end - e.start : 0);
    const clashing = (scene.effects ?? []).flatMap((e) => Array.from({ length: Math.ceil(pouring(e) / 0.5) }, (_, i) => e.start + 0.5 * i));
    const times = [0, ...Object.entries(scene.marks).filter(([k, t]) => EVENT.test(k) && t <= burst).map(([, t]) => t), ...running.filter((t) => t <= burst), ...clashing, burst].sort((a, b) => a - b);
    let worst = 0, at = 0;
    for (let i = 1; i < times.length; i += 1) if (times[i] - times[i - 1] > worst) { worst = times[i] - times[i - 1]; at = times[i - 1]; }
    assert.ok(worst <= 1.5, `${label(o)}: ${worst.toFixed(2)} s with nothing happening after ${at.toFixed(2)} s`);
    // ENDS CLEARLY: both are knocked down at the burst, on time, and one is up first.
    const downs = Object.entries(scene.marks).filter(([k, t]) => /\.getHit\d+\.knockdown$/.test(k) && Math.abs(t - burst) < 0.05);
    assert.ok(downs.length >= 1, `${label(o)}: knocked down by the burst`);
    if ((scene.effects ?? []).some((e) => e.kind === "clash")) {
      assert.equal(downs.length, 2, `${label(o)}: the burst knocks both down`);
      const ups = downs.map(([k]) => scene.marks[k.replace(/knockdown$/, "ready")]);
      assert.ok(Math.abs(ups[0] - ups[1]) > 0.2, `${label(o)}: one gets up first (${ups.map((u) => u.toFixed(2))})`);
      assert.ok(!Object.keys(scene.marks).some((k) => /\.out$/.test(k)), `${label(o)}: nobody knocked out`);
    }
  }
});

test("elements interact: laser on an ice wall cracks and shatters it with steam; crystals zapped mid-air; the clash point moves", () => {
  // (the test button's fight: Red's laser on Blue's ice wall, Blue's crystals zapped, the clash)
  const { plan, scene } = fight({ ...ELEMENTAL_TEST, middle: undefined });
  const fx = scene.effects ?? [], m = scene.marks;
  const laser = powerUses(plan, m).find((u) => u.move === "laserEyes" && u.k === 1)!, wall = powerUses(plan, m).find((u) => u.kind === "wall")!;
  assert.ok(wall && wall.id === "blue" && wall.start <= laser.start + 0.06, "Blue's wall is coming up as the laser comes");
  const cracks = fx.find((e) => e.kind === "iceCracks")!;
  assert.ok(cracks && cracks.start > laser.start && cracks.start < laser.start + 0.25, "it cracks where the laser hits");
  const spikes = fx.find((e) => e.kind === "iceSpikes" && e.start <= laser.start)!;
  const shatter = spikes.start + Number(spikes.params?.shatter);
  assert.ok(Math.abs(shatter - (cracks.end)) < 0.05 && shatter < laser.end + 0.05, `the laser shatters it (${shatter.toFixed(2)})`);
  assert.ok(Number(spikes.params?.size) >= WALL_SIZE, "a wall big enough to hide behind");
  assert.ok(fx.some((e) => e.kind === "smoke" && Math.abs(e.start - (cracks.start - 0.08)) < 0.1), "steam rises off the hot spot");
  assert.ok(fx.some((e) => e.kind === "smokeBurst" && Math.abs(e.start - shatter) < 0.05), "a puff of steam as it shatters");
  // the laser stops at the ice: its beams end on the wall's face, in front of Blue, not at Blue
  const beam = fx.find((e) => e.kind === "laserEyes" && e.start <= laser.start && e.end >= laser.start)!;
  assert.ok(beam.target && !("character" in beam.target), "aimed at the ice's face");
  const blueX = scene.characters[1].keys.find((k) => k.t >= laser.start)!.x;
  assert.ok(blueX - (beam.target as { x: number }).x > 0.4 * H, `the face is in front of Blue (${((blueX - (beam.target as { x: number }).x) / H).toFixed(2)} x height)`);
  // ZAPPED: the first crystals shatter in the air (with steam), and their own flight ends there
  const zaps = fx.filter((e) => e.kind === "iceShatter" && "y" in e.anchor && e.anchor.y < plan.groundY - 0.3 * H);
  assert.ok(zaps.length >= 2, `${zaps.length} crystals zapped mid-air`);
  for (const z of zaps) assert.ok(fx.some((e) => e.kind === "iceShards" && Math.abs(e.end - z.start) < 1e-6), "a zapped crystal stops where it shatters");
  // THE CLASH: the point moves back and forth and the winner pushes it to the loser; both knocked back at the burst
  const clash = fx.find((e) => e.kind === "clash")!;
  const push = clash.params!.push as number[], us = push.filter((_, i) => i % 2 === 1);
  assert.ok(Math.max(...us) - Math.min(...us) > 0.15, "the clash point moves");
  const burst = clash.start + Number(clash.params!.burst);
  for (const id of ["red", "blue"]) assert.ok(Object.entries(m).some(([k, t]) => k.startsWith(`${id}.getHit`) && k.endsWith(".hit") && Math.abs(t - burst) < 1e-3), `${id} knocked back at the burst`);
  const final = us[us.length - 1], loser = final > 0.5 ? "blue" : "red";
  const readyOf = (id: string) => Math.max(...Object.entries(m).filter(([k]) => new RegExp(`^${id}\\.getHit\\d+\\.ready$`).test(k)).map(([, v]) => v));
  assert.ok(readyOf(loser) > readyOf(loser === "red" ? "blue" : "red"), `the one pushed back (${loser}) gets up last`);
});

test("the rules on their own: a laser on a water shield steams at its edge; fire on ice melts; two beams at once clash", () => {
  const two = (red: ScenePlan["characters"][0]["actions"], blue: ScenePlan["characters"][0]["actions"]): ScenePlan => ({ id: "t", title: "t", height: H, groundY: 900, characters: [
    { id: "red", x: 600, facing: "right", actions: red }, { id: "blue", x: 1320, facing: "left", actions: blue }] });
  const shield = planToScene(two([{ move: "laserEyes", params: { target: "blue", seconds: 0.8 } }], [{ move: "waterShield", params: { seconds: 2 }, sync: { mark: "hold", at: "red.laserEyes1.release", offset: -0.3 } }]), LIBRARY) as Built;
  const beam = (shield.effects ?? []).find((e) => e.kind === "laserEyes")!;
  assert.ok(!("character" in beam.target!) && (beam.target as { x: number }).x < 1320 - 0.5 * H, "the laser stops at the shield's edge");
  assert.ok((shield.effects ?? []).some((e) => e.kind === "smokeBurst"), "steam where it hits the water");
  const melt = planToScene(two([{ move: "fireBlast", params: { target: "blue", seconds: 1.2 } }], [{ move: "iceMountain", params: { distance: 0.95 * H, shape: "mountain", seconds: 0.6 }, sync: { mark: "release", at: "red.fireBlast1.release", offset: -0.3 } }]), LIBRARY) as Built;
  const kinds = (melt.effects ?? []).map((e) => e.kind);
  for (const k of ["iceCracks", "splash", "smokeBurst"]) assert.ok(kinds.includes(k), `fire on ice: ${k}`);
  const clash = planToScene(two([{ move: "fireBlast", params: { target: "blue", seconds: 1.2 } }], [{ move: "waterBlast", params: { target: "red", seconds: 1.2, win: true }, sync: { mark: "release", at: "red.fireBlast1.release" } }]), LIBRARY) as Built;
  const c = (clash.effects ?? []).find((e) => e.kind === "clash")!;
  assert.ok(c && c.params?.left === "fire" && c.params?.right === "water", "fire and water clash");
  assert.ok(!(clash.effects ?? []).some((e) => e.kind === "fireBurst" || e.kind === "splash"), "neither reaches the other's body");
  const us = (c.params!.push as number[]).filter((_, i) => i % 2 === 1);
  assert.ok(us[us.length - 1] < 0.5, "the water's push wins: the point is driven back toward the fire");
  // (the rules leave a plan with no powers meeting alone)
  const alone: EffectTrack[] = [{ kind: "fire", start: 0, end: 1, anchor: { x: 1, y: 2 } }];
  assert.deepEqual(elementalTracks(two([{ move: "stand", params: { seconds: 1 } }], []), {}, alone), alone);
  assert.equal(CLASH_SWELL > 0.3, true);
});

test("elemental fights: on the page, hits on time and in reach, natural bodies at 8/12/24 fps, effects the same at every fps", () => {
  const segment = (p: { x: number; y: number }, a: { x: number; y: number }, b: { x: number; y: number }) => {
    const dx = b.x - a.x, dy = b.y - a.y, L = dx * dx + dy * dy, t = L ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / L)) : 0;
    return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
  };
  for (const o of FIGHTS) {
    const { plan, scene } = fight(o);
    const name = label(o);
    const b = animationBounds(buildScene(scene, 12).frames);
    assert.ok(b.right - b.left <= PAGE * 0.92 + 1, `${name}: fits the page (${b.left.toFixed(0)}..${b.right.toFixed(0)})`);
    // Strikes: every reaction exactly on its hit; every fist or foot really reaches the body.
    const built = buildScene(scene, 24), ids = scene.characters.map((c) => c.id);
    for (const [k, t] of Object.entries(scene.marks)) {
      const s = /^(\w+)\.strike(\d+)\.hit$/.exec(k);
      if (!s) continue;
      const them = s[1] === "red" ? "blue" : "red";
      // (their k-th getHit from this attacker answers its k-th strike)
      const theirs = plan.characters.find((c) => c.id === them)!.actions.filter((a) => a.move === "getHit").map((a, n) => ({ from: a.params?.from, n: n + 1 }));
      const mine = theirs.filter((x) => x.from === s[1])[Number(s[2]) - 1];
      const hitAt = mine ? scene.marks[`${them}.getHit${mine.n}.hit`] : undefined;
      assert.ok(hitAt !== undefined && Math.abs(hitAt - t) < 1e-3, `${name}: ${k} at ${t.toFixed(2)} — its reaction at ${hitAt?.toFixed(2)}`);
      const ai = ids.indexOf(s[1]), f = Math.min(built.frames.length - 1, Math.round(t * 24));
      const reach = Math.min(...[f - 1, f, f + 1].filter((g) => g >= 0 && g < built.frames.length).map((g) => {
        const A = built.frames[g][ai].skeleton, D = built.frames[g][1 - ai].skeleton, r = built.frames[g][1 - ai].headRadius;
        const body = (p: { x: number; y: number }) => Math.min(Math.hypot(p.x - D.head.x, p.y - D.head.y) - r, segment(p, D.neck, D.hip), segment(p, D.neck, D.lElbow), segment(p, D.neck, D.rElbow), segment(p, D.lElbow, D.lHand), segment(p, D.rElbow, D.rHand), segment(p, D.hip, D.lKnee), segment(p, D.hip, D.rKnee));
        return Math.min(body(A.lHand), body(A.rHand), body(A.lFoot), body(A.rFoot));
      }));
      assert.ok(reach < 0.18 * H, `${name}: ${k} lands ${(reach / H).toFixed(2)} x height from the other body`);
    }
    // Power hits: the reaction comes the moment the power reaches him (within a few pictures: a jet of water arcs).
    for (const a of answers(plan, scene).filter((x) => x.kind === "hit")) assert.ok(a.dt <= 0.2, `${name}: ${a.attack} reaction ${a.dt.toFixed(2)} s after it arrives`);
    // Bodies: the body rules at 12 and 24 fps, and at 8 fps (the joint step scaled like 12 vs 24).
    assertNatural(scene, name);
    for (const r of buildScene(scene, 8).report.characters) {
      assert.ok(r.maxBoneErrorPx <= 0.5 && r.maxFootDriftPx <= 1 && r.belowGroundFrames === 0, `${name}@8: body rules`);
      assert.ok(r.maxJointStepPx < 360, `${name}@8: a joint jumped ${r.maxJointStepPx.toFixed(0)} px`);
    }
    // Effects at 8, 12 and 24 pictures a second: every picture's shapes finite, and the clash drawn at each rate
    // (each recipe gives the same shapes for the same moment at any rate: effects/*.test.ts).
    const clash = (scene.effects ?? []).find((e) => e.kind === "clash");
    for (const fps of [8, 12, 24]) {
      const frames = buildEffectFrames(scene, buildScene(scene, fps));
      for (const [i, f] of frames.entries()) for (const sh of [...f.back, ...f.front]) {
        const ok = sh.kind === "circle" || sh.kind === "rect" || sh.kind === "symbol" ? Number.isFinite(sh.x) && Number.isFinite(sh.y) : sh.points.every(Number.isFinite);
        assert.ok(ok, `${name}@${fps}: a shape that isn't finite at picture ${i}`);
      }
      if (clash) {
        const mid = Math.round(((clash.start + clash.start + Number(clash.params?.cut)) / 2) * fps);
        assert.ok(frames[mid].front.some((sh) => sh.kind === "poly" && sh.fill === "#ffffff"), `${name}@${fps}: the clash point at ${(mid / fps).toFixed(2)} s`);
      }
    }
  }
});

