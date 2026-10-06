import assert from "node:assert/strict";
import { test } from "node:test";
import { buildScene, type CharacterKey } from "../engine.ts";
import { HEAD_RADIUS, STAND, type Facing, type JointName, type Skeleton } from "../rig.ts";
import type { MoveOutput, MoveSettings, Stance } from "./motion.ts";
import { kick } from "./kick.ts";
import { choosePunch, feetOf, inGuard, LEVEL_UP, MIN_WINDUP_SECONDS, punch, PUNCH_HEIGHTS, RAISED_ABOVE_LEVEL, type PunchParams, type PunchTechnique } from "./punch.ts";
import { allSettings, assertNatural, sceneOfKeys, startStance, TEST_GROUND, TEST_HEIGHT } from "./testkit.ts";

// SPEC-0017 Phase 2, punch after Arthur's round-4 review (2026-10-04): the strong punch winds up the way he
// described (the elbow lifts and goes behind the head into his screenshot's cocked pose), the FIST LEADS
// the strike and the elbow follows, the body leans FORWARD at the hit and the arms switch; and the engine
// picks the punch from the distance (close: uppercut, medium: straight, far: overhand), by rules in body
// heights, so it works for any figure size.

const SIDES: Facing[] = ["right", "left"];
const NATURAL: MoveSettings = { height: TEST_HEIGHT, style: "natural", speed: "normal", energy: 0.5 };
const fwd = (facing: Facing) => (facing === "left" ? -1 : 1);
const label = (name: string, s: MoveSettings, facing: Facing) => `${name}/${s.style}/${s.speed}/${s.energy}/${facing}`;
// Start mid-scene and off-center, so chaining (start time and place) is really tested.
const stanceAt = (facing: Facing, x = 700): Stance => ({ ...startStance(facing, x, 1.25), pose: STAND });

// Frames at a fine rate, and where a joint is on them.
const FINE_FPS = 120;
function fine(keys: CharacterKey[], facing: Facing, height = TEST_HEIGHT) {
  const scene = sceneOfKeys(keys, facing);
  scene.characters[0].height = height;
  return buildScene(scene, FINE_FPS).frames.map((f) => f[0].skeleton);
}
const at = (frames: Skeleton[], t: number) => frames[Math.min(frames.length - 1, Math.round(t * FINE_FPS))];
// Forward / upward from the hips (x height), and the torso's forward lean (degrees).
const ahead = (s: Skeleton, joint: JointName, facing: Facing, h = TEST_HEIGHT) => ((s[joint].x - s.hip.x) * fwd(facing)) / h;
const leanOf = (s: Skeleton, facing: Facing) => (Math.atan2((s.neck.x - s.hip.x) * fwd(facing), s.hip.y - s.neck.y) * 180) / Math.PI;
// An arm as the world sees it (facing right): upper arm and forearm directions (0 = down, +90 = forward,
// ±180 = up) and how the elbow is bent (+ the natural way, - the backward-looking way).
const turnTo = (d: number) => { let a = d % 360; if (a > 180) a -= 360; if (a <= -180) a += 360; return a; };
const dir = (a: { x: number; y: number }, b: { x: number; y: number }, facing: Facing) => (Math.atan2((b.x - a.x) * fwd(facing), b.y - a.y) * 180) / Math.PI;
function armOn(s: Skeleton, side: "l" | "r", facing: Facing) {
  const upper = dir(s.neck, s[`${side}Elbow`], facing), fore = dir(s[`${side}Elbow`], s[`${side}Hand`], facing);
  return { upper: turnTo(upper), bend: turnTo(fore - upper) };
}

const sides = (hand: "front" | "back") => (hand === "back" ? { p: "r", g: "l" } as const : { p: "l", g: "r" } as const);
// Distances (x height, hip to hip) that are clearly close, medium and far for a figure standing still, and
// the punch "auto" picks there (round 6: far = the wound-up POWER punch, straight at the target; an overhand
// — the same wind-up, arcing down onto the target — only when asked or at a low target).
type AutoTechnique = "uppercut" | "straight" | "power";
const AUTO: Record<AutoTechnique, number> = { uppercut: 0.45, straight: 0.6, power: 0.72 };
const DISTANCES: Record<PunchTechnique, number> = { ...AUTO, overhand: 0.72 };

test("punch: auto picks uppercut (close), straight (medium) or the wound-up power punch (far) by body-height reach rules, the same for heights 200, 300 and 400", () => {
  for (const height of [200, 300, 400]) {
    const settings = { ...NATURAL, height };
    for (const facing of SIDES) for (const hand of ["front", "back"] as const) {
      for (const [technique, d] of Object.entries(AUTO) as [AutoTechnique, number][]) {
        const choice = choosePunch(stanceAt(facing), { hand, distance: d * height }, settings);
        assert.equal(choice.technique, technique, `${height}/${facing}/${hand}: ${d} x height away -> ${technique}`);
      }
      const c = choosePunch(stanceAt(facing), { hand, distance: height }, settings);
      assert.ok(c.closeUpTo < c.straightUpTo && c.straightUpTo < c.overhandUpTo, `${height}/${hand}: close < straight < overhand reach`);
      // Right at the edges.
      assert.equal(choosePunch(stanceAt(facing), { hand, distance: c.closeUpTo - 1e-6 * height }, settings).technique, "uppercut");
      assert.equal(choosePunch(stanceAt(facing), { hand, distance: c.closeUpTo + 1e-3 * height }, settings).technique, "straight");
      assert.equal(choosePunch(stanceAt(facing), { hand, distance: c.straightUpTo + 1e-3 * height }, settings).technique, "power");
    }
  }
  // The thresholds are reach facts in body heights: the same for every height.
  for (const facing of SIDES) for (const hand of ["front", "back"] as const) {
    const per = [200, 300, 400].map((height) => {
      const c = choosePunch(stanceAt(facing), { hand, distance: height }, { ...NATURAL, height });
      return [c.closeUpTo / height, c.straightUpTo / height, c.overhandUpTo / height];
    });
    for (const r of per) r.forEach((value, i) => assert.ok(Math.abs(value - per[0][i]) < 1e-9, `${facing}/${hand}: threshold ${i} is ${value} x height at every height`));
  }
  // Without a distance: by power — a strong rear-hand shot is the wound-up power punch, a jab or a weak punch straight.
  assert.equal(choosePunch(stanceAt("right"), { hand: "back" }, NATURAL).technique, "power");
  // A low target (more than a forearm under the shoulder: someone bent over) gets the overhand, coming down onto it.
  assert.equal(choosePunch(stanceAt("right"), { hand: "back", targetHeight: 0.5 }, NATURAL).technique, "overhand");
  assert.equal(choosePunch(stanceAt("right"), { hand: "back", distance: AUTO.power * TEST_HEIGHT, targetHeight: 0.5 }, NATURAL).technique, "overhand");
  assert.equal(choosePunch(stanceAt("right"), { hand: "front" }, NATURAL).technique, "straight");
  assert.equal(choosePunch(stanceAt("right"), { hand: "back" }, { ...NATURAL, style: "tired", energy: 0.2 }).technique, "straight");
  // Asked for by name: always that one.
  for (const technique of ["straight", "uppercut", "power", "overhand"] as const) assert.equal(choosePunch(stanceAt("right"), { technique, distance: 0.6 * TEST_HEIGHT }, NATURAL).technique, technique);
});

test("punch: every technique keeps the body rules for every style, speed and energy, facing right and left (12 and 24 fps), and flows guard to guard", () => {
  for (const settings of allSettings()) for (const facing of SIDES) for (const hand of ["front", "back"] as const) {
    for (const [technique, d] of Object.entries(DISTANCES) as [PunchTechnique, number][]) {
      const name = label(`${technique}-${hand}`, settings, facing);
      const start = stanceAt(facing);
      const out = punch(start, { hand, technique, distance: d * TEST_HEIGHT }, settings);
      const built = assertNatural(sceneOfKeys(out.keys, facing), name);
      assert.equal(built.report.characters[0].clampedAngles, 0, `${name}: no joint is ever held at its limit`);
      assertMarks(out, start, name);
    }
  }
});

// Starts where it was told, marks in order, a flow point in the guard, ends standing on both feet.
function assertMarks(out: MoveOutput, start: Stance, name: string) {
  const first = out.keys[0], last = out.keys[out.keys.length - 1];
  assert.equal(first.t, start.t, `${name}: starts on time`);
  assert.equal(first.x, start.x, `${name}: starts in place`);
  let previous = start.t;
  for (const mark of ["guard", "windup", "hit", "back"]) {
    assert.ok(out.marks[mark] > previous, `${name}: mark "${mark}" in order`);
    previous = out.marks[mark];
  }
  assert.ok(out.flow && out.flow.keys < out.keys.length && out.keys[out.flow.keys - 1].t >= out.marks.back - 1e-9, `${name}: flow point after the punch`);
  assert.ok(inGuard(out.flow!.stance.pose, feetOf(out.flow!.stance.pose)), `${name}: flows from the guard`);
  assert.deepEqual(last.pose, STAND, `${name}: ends standing`);
  assert.deepEqual([...(last.contacts ?? [])].sort(), ["lFoot", "rFoot"], `${name}: ends on both feet`);
}

test("punch (overhand): the cocked pose is Arthur's screenshot — elbow straight back at shoulder height, fist up by the head and at or behind it, other arm pointing at the target, leaning back, weight on the back leg", () => {
  for (const facing of SIDES) for (const hand of ["back", "front"] as const) for (const params of [{}, { distance: DISTANCES.overhand * TEST_HEIGHT }] as PunchParams[]) {
    const name = `${facing}/${hand}/${params.distance ?? "-"}`;
    const { p, g } = sides(hand);
    for (const technique of ["power", "overhand"] as const) {
    const out = punch(stanceAt(facing), { ...params, hand, technique }, NATURAL);
    const c = at(fine(out.keys, facing), out.marks.windup);
    const H = TEST_HEIGHT, r = (c.head.y - c.neck.y) / -H; // head radius (x height)
    // Elbow behind the shoulder, at about shoulder height.
    assert.ok(ahead(c, `${p}Elbow`, facing) < ahead(c, "neck", facing) - 0.12, `${name}: elbow well behind the shoulder`);
    assert.ok(Math.abs(c[`${p}Elbow`].y - c.neck.y) / H < 0.06, `${name}: elbow at about shoulder height`);
    // Fist up at about head height, at or behind the head; the forearm slants up and forward (not straight up).
    assert.ok(Math.abs(c[`${p}Hand`].y - c.head.y) / H <= r + 0.03, `${name}: fist at about head height`);
    assert.ok(ahead(c, `${p}Hand`, facing) <= ahead(c, "head", facing), `${name}: fist at or behind the head`);
    assert.ok(ahead(c, `${p}Hand`, facing) > ahead(c, `${p}Elbow`, facing) + 0.05, `${name}: forearm slants forward toward the head`);
    // The other arm points straight out at the target, at about shoulder height.
    assert.ok(ahead(c, `${g}Hand`, facing) > ahead(c, "neck", facing) + 0.27, `${name}: other arm stretched out forward`);
    assert.ok(Math.abs(c[`${g}Hand`].y - c.neck.y) / H < 0.1, `${name}: ...at about shoulder height`);
    assert.ok(Math.abs(armOn(c, g, facing).bend) < 20, `${name}: ...nearly straight`);
    // Upright to leaning back a little; the weight on the back leg (hips nearer the back foot, back knee bent).
    assert.ok(leanOf(c, facing) <= 0 && leanOf(c, facing) > -15, `${name}: upright to leaning back a little (${leanOf(c, facing).toFixed(1)})`);
    assert.ok(Math.abs(c.hip.x - c.rFoot.x) < Math.abs(c.hip.x - c.lFoot.x), `${name}: hips nearer the back foot`);
    assert.ok(dir(c.rKnee, c.rFoot, facing) < dir(c.hip, c.rKnee, facing) - 5, `${name}: back knee bent`);
    }
  }
});

test("punch (power): the fist leads and the elbow follows; the body leans forward at the hit, the pointing arm goes back (the arms switch) and the front foot steps in", () => {
  for (const facing of SIDES) for (const settings of [NATURAL, { ...NATURAL, style: "angry" as const, energy: 0.85 }, { ...NATURAL, style: "robot" as const }]) {
    const name = label("overhand", settings, facing);
    const out = punch(stanceAt(facing), {}, settings);
    const frames = fine(out.keys, facing);
    const w = out.marks.windup, h = out.marks.hit;
    // (The hit: the first frame at or after the hit, when the arm has just straightened.)
    const c = at(frames, w), hit = frames[Math.ceil(h * FINE_FPS)];
    // THE FIST LEADS: early in the strike the fist moves forward more than the elbow (which mostly rises).
    // (Round 5 checked 0.2 and 0.3 of the strike. Since round 6 the elbow swings under the fist right after
    // the fist reaches the shoulder, and then the fist goes straight to the target, so only the start is checked.)
    for (const share of [0.2]) {
      const s = at(frames, w + share * (h - w));
      const fistGo = (s.rHand.x - c.rHand.x) * fwd(facing), elbowGo = (s.rElbow.x - c.rElbow.x) * fwd(facing);
      assert.ok(fistGo > elbowGo + 0.01 * TEST_HEIGHT, `${name}: at ${share} of the strike the fist (${fistGo.toFixed(1)}px) leads the elbow (${elbowGo.toFixed(1)}px)`);
    }
    // (Round 5 also asked that the fist get past the head while the elbow was still behind the shoulder.
    // Round 6 replaced that: from the shoulder the fist goes straight to the target — see the round-6 test.)
    // The body leans FORWARD at the hit, clearly more than at the cocked pose.
    assert.ok(leanOf(hit, facing) > 12 && leanOf(hit, facing) > leanOf(c, facing) + 20, `${name}: leans forward at the hit (${leanOf(c, facing).toFixed(1)} -> ${leanOf(hit, facing).toFixed(1)})`);
    // The punching arm is straight out in front, the pointing arm has gone back behind the body.
    assert.ok(Math.abs(armOn(hit, "r", facing).bend) < 6 && ahead(hit, "rHand", facing) > ahead(hit, "neck", facing) + 0.2, `${name}: punching arm straight out`);
    assert.ok(ahead(c, "lHand", facing) > ahead(c, "neck", facing) + 0.25, `${name}: other arm pointing forward when cocked`);
    assert.ok(ahead(hit, "lHand", facing) < ahead(hit, "neck", facing) - 0.05, `${name}: ...and back behind the body at the hit`);
    // The weight goes onto the front foot, which has stepped in.
    assert.ok(Math.abs(hit.hip.x - hit.lFoot.x) < Math.abs(hit.hip.x - hit.rFoot.x), `${name}: hips nearer the front foot at the hit`);
    assert.ok((hit.lFoot.x - c.lFoot.x) * fwd(facing) > 0.02 * TEST_HEIGHT, `${name}: the front foot stepped in`);
  }
});

test("punch: an arm whose hand hangs low never bends the backward way, on any frame of any punch (a raised arm or a hand held up may: HAND UP, ELBOW FREE)", () => {
  for (const settings of allSettings()) for (const facing of SIDES) for (const hand of ["front", "back"] as const) {
    for (const params of [{}, ...Object.values(DISTANCES).map((d) => ({ distance: d * TEST_HEIGHT }))] as PunchParams[]) {
      const out = punch(stanceAt(facing), { ...params, hand }, settings);
      const frames = buildScene(sceneOfKeys(out.keys, facing), 24).frames.map((f) => f[0].skeleton);
      frames.forEach((s, i) => {
        for (const side of ["l", "r"] as const) {
          const a = armOn(s, side, facing);
          if (a.bend >= -2) continue;
          // The hand held up: less than half an upper arm below the shoulder (rig.ts handUp).
          const handUp = s[`${side}Hand`].y - s.neck.y < 0.5 * 0.16 * TEST_HEIGHT;
          const raised = a.upper >= 90 + RAISED_ABOVE_LEVEL - 1 || a.upper <= -80 || handUp;
          assert.ok(raised, `${label(`punch-${hand}-${params.distance ?? "-"}`, settings, facing)}@${(i / 24).toFixed(2)}: ${side} arm bent backward ${a.bend.toFixed(0)} while pointing ${a.upper.toFixed(0)}`);
        }
      });
    }
  }
});

test("punch (uppercut): a small dip with the fist below the chest, then the fist drives up to about chin height (elbow bent) while the body rises and leans in", () => {
  for (const height of [200, 300, 400]) for (const facing of SIDES) for (const hand of ["back", "front"] as const) {
    const name = `${height}/${facing}/${hand}`;
    const { p } = sides(hand);
    const settings = { ...NATURAL, height };
    const out = punch(stanceAt(facing), { hand, distance: DISTANCES.uppercut * height }, settings);
    const frames = fine(out.keys, facing, height);
    const g = at(frames, out.marks.guard), w = at(frames, out.marks.windup), h = at(frames, out.marks.hit);
    const up = (s: Skeleton, joint: JointName) => (TEST_GROUND - s[joint].y) / height;
    // Wind-up: the fist drops below the chest (more than 0.1 x height under the shoulder), the knees dip.
    assert.ok(w[`${p}Hand`].y > w.neck.y + 0.1 * height, `${name}: fist below the chest in the wind-up`);
    assert.ok(up(w, "hip") < up(g, "hip") - 0.02, `${name}: dips`);
    // Hit: the fist up at a same-size opponent's chin, in front, the elbow clearly bent; the body risen and leaning in.
    assert.ok(Math.abs(up(h, `${p}Hand`) - PUNCH_HEIGHTS.chin) < 0.02, `${name}: fist at chin height (${up(h, `${p}Hand`).toFixed(3)} vs ${PUNCH_HEIGHTS.chin.toFixed(3)})`);
    assert.ok(ahead(h, `${p}Hand`, facing, height) > ahead(h, "neck", facing, height) + 0.08, `${name}: fist in front`);
    assert.ok(armOn(h, p, facing).bend > 60, `${name}: elbow bent (${armOn(h, p, facing).bend.toFixed(0)})`);
    assert.ok(h[`${p}Hand`].y < h[`${p}Elbow`].y - 0.08 * height, `${name}: forearm driving up`);
    assert.ok(up(h, "hip") > up(w, "hip") + 0.03, `${name}: the body rises`);
    assert.ok(leanOf(h, facing) > leanOf(w, facing) + 5, `${name}: leans in`);
  }
});

test("punch: with a distance the fist lands on the target (the face of a same-size opponent; the chin for an uppercut)", () => {
  const FACE = 0.07; // a normal head's radius: the face is that far in front of the opponent's hips
  for (const facing of SIDES) for (const hand of ["back", "front"] as const) for (const [technique, d] of Object.entries(DISTANCES) as [PunchTechnique, number][]) {
    const { p } = sides(hand);
    const start = stanceAt(facing);
    const out = punch(start, { hand, distance: d * TEST_HEIGHT }, NATURAL);
    const s = at(fine(out.keys, facing), out.marks.hit);
    const fist = ((s[`${p}Hand`].x - start.x) * fwd(facing)) / TEST_HEIGHT;
    const target = d - (technique === "uppercut" ? FACE * Math.SQRT1_2 : FACE);
    assert.ok(Math.abs(fist - target) < 0.01, `${facing}/${hand}/${technique}: fist lands at ${fist.toFixed(3)} (target ${target.toFixed(3)})`);
  }
});

test("punch: the wind-up goes the opposite way and grows with power; the strike is fast next to it", () => {
  const weak = { ...NATURAL, energy: 0.3 }, strong = { ...NATURAL, style: "angry" as const, energy: 0.85 };
  for (const facing of SIDES) for (const [technique, d] of Object.entries(DISTANCES) as [PunchTechnique, number][]) {
    const windOf = (settings: MoveSettings) => {
      const out = punch(stanceAt(facing), { distance: d * TEST_HEIGHT }, settings);
      const frames = fine(out.keys, facing);
      const g = at(frames, out.marks.guard), w = at(frames, out.marks.windup), h = at(frames, out.marks.hit);
      // Opposite way: the body leans back and the fist goes back (and down, for the uppercut) before the hit.
      assert.ok(leanOf(w, facing) < leanOf(g, facing) - 1 && leanOf(h, facing) > leanOf(g, facing) + 2, `${technique}/${settings.style}/${facing}: leans back, then forward`);
      assert.ok(ahead(w, "rHand", facing) < ahead(g, "rHand", facing) - 0.02, `${technique}/${settings.style}/${facing}: fist back first`);
      // Fast strike: the fist's top speed into the hit is at least 3x its top speed in the wind-up.
      const speed = (from: number, to: number) => {
        let top = 0;
        for (let i = Math.ceil(from * FINE_FPS) + 1; i <= Math.floor(to * FINE_FPS); i += 1) top = Math.max(top, Math.hypot(frames[i].rHand.x - frames[i - 1].rHand.x, frames[i].rHand.y - frames[i - 1].rHand.y) * FINE_FPS);
        return top;
      };
      assert.ok(speed(out.marks.windup, out.marks.hit) >= 3 * speed(out.marks.guard, out.marks.windup), `${technique}/${settings.style}/${facing}: fast strike`);
      return { lean: leanOf(g, facing) - leanOf(w, facing), drop: (w.hip.y - g.hip.y) / TEST_HEIGHT, back: ahead(g, "rHand", facing) - ahead(w, "rHand", facing) };
    };
    const a = windOf(weak), b = windOf(strong);
    assert.ok(b.lean > a.lean, `${technique}/${facing}: a stronger punch leans back further (${a.lean.toFixed(1)} vs ${b.lean.toFixed(1)})`);
    assert.ok(b.drop > a.drop - 1e-3 || b.back > a.back, `${technique}/${facing}: a stronger punch winds up bigger`);
  }
});

test("punch: techniques flow into each other from the guard (uppercut -> overhand -> straight -> power...), natural body every style", () => {
  const order: PunchTechnique[] = ["uppercut", "overhand", "straight", "power", "uppercut", "straight", "power"];
  for (const settings of [NATURAL, { ...NATURAL, style: "robot" as const }, { ...NATURAL, style: "angry" as const, energy: 0.85 }, { ...NATURAL, style: "tired" as const, energy: 0.2 }]) for (const facing of SIDES) {
    let here = stanceAt(facing);
    const keys: CharacterKey[] = [];
    order.forEach((technique, i) => {
      const out = punch(here, { hand: i % 2 ? "front" : "back", technique }, settings);
      const last = i === order.length - 1;
      for (const key of last ? out.keys : out.keys.slice(0, out.flow!.keys)) {
        if (keys.length && Math.abs(keys[keys.length - 1].t - key.t) < 1e-4) keys[keys.length - 1] = { ...key, ease: key.ease ?? keys[keys.length - 1].ease };
        else keys.push(key);
      }
      if (i > 0) assert.equal(out.marks.guard, undefined, `${technique}: starts straight from the guard`);
      here = last ? out.end : out.flow!.stance;
    });
    const built = assertNatural(sceneOfKeys(keys, facing), label("punch-chain", settings, facing));
    assert.equal(built.report.characters[0].clampedAngles, 0, `${label("punch-chain", settings, facing)}: no joint held at its limit`);
  }
});

// Arthur's round-6 review (his drawing: the elbow lifted behind the head, the other arm straight out, three
// arrows): "your fist has to go STRAIGHT to where the arrows are. That's all your arm has to do" — and "the
// most common punch ... is a straight punch, not a punch up there or down there". The cocked forearm is
// folded across the upper arm, so the fist first comes forward past the head to the shoulder (the elbow
// bend passes 180 there); from then on it travels a straight line to the target and the arm ends level.
test("punch (round 6): from the shoulder the fist goes in a straight line to the target and the arm ends level, not punching up; an overhand comes down onto its target", () => {
  const fistPath = (out: MoveOutput, facing: Facing, p: "l" | "r") => {
    const frames = fine(out.keys, facing);
    const from = Math.round(out.marks.windup * FINE_FPS), to = Math.round(out.marks.hit * FINE_FPS);
    return frames.slice(from, to + 1).map((s) => ({ s, fist: s[`${p}Hand`], neck: s.neck }));
  };
  for (const facing of SIDES) for (const settings of [NATURAL, { ...NATURAL, style: "angry" as const, energy: 0.85 }, { ...NATURAL, style: "tired" as const, energy: 0.2 }]) {
    for (const [hand, params] of [["back", {}], ["back", { distance: AUTO.power * TEST_HEIGHT }], ["front", {}], ["back", { distance: AUTO.straight * TEST_HEIGHT }]] as ["front" | "back", PunchParams][]) {
      const name = `${label(`punch-${hand}-${params.distance ?? "-"}`, settings, facing)}`;
      const { p } = sides(hand);
      const out = punch(stanceAt(facing), { ...params, hand }, settings);
      const path = fistPath(out, facing, p);
      const hit = path[path.length - 1];
      // The arm at the hit: straight out and level (at most LEVEL_UP degrees up, and not pointing down).
      const up = (Math.atan2(hit.neck.y - hit.fist.y, Math.abs(hit.fist.x - hit.neck.x)) * 180) / Math.PI;
      assert.ok(up <= LEVEL_UP + 1 && up > -6, `${name}: arm level at the hit (${up.toFixed(1)} degrees up)`);
      // From where the fist is closest to the shoulder (for a wound-up punch: where it comes past it) to the hit,
      // the fist stays on the straight line between them.
      let start = 0;
      path.forEach((q, i) => { if (Math.hypot(q.fist.x - q.neck.x, q.fist.y - q.neck.y) < Math.hypot(path[start].fist.x - path[start].neck.x, path[start].fist.y - path[start].neck.y)) start = i; });
      const a = path[start].fist, b = hit.fist, length = Math.hypot(b.x - a.x, b.y - a.y);
      assert.ok(length > 0.12 * TEST_HEIGHT, `${name}: the line is long (${(length / TEST_HEIGHT).toFixed(2)} x height)`);
      const off = Math.max(...path.slice(start).map((q) => Math.abs(((b.x - a.x) * (q.fist.y - a.y) - (b.y - a.y) * (q.fist.x - a.x)) / length)));
      // (Within 0.03 x height: right at the shoulder the elbow swings down under the fist, which costs up to
      // about 0.025.)
      assert.ok(off < 0.03 * TEST_HEIGHT, `${name}: fist stays on its line (${(off / TEST_HEIGHT).toFixed(3)} x height off)`);
      // ...and the line goes forward, not up: at most LEVEL_UP + a little above level. (Round 8: a light,
      // straight punch starts from its miniature wind-up — the fist tucked in by the chest, below the
      // shoulder — and goes straight to the target from there, so its line climbs from the chest to the
      // face: up to 30 degrees, starting below the shoulder.)
      const rise = (Math.atan2(a.y - b.y, Math.abs(b.x - a.x)) * 180) / Math.PI;
      const light = choosePunch(stanceAt(facing), { ...params, hand }, settings).technique === "straight";
      if (light) assert.ok(rise < 30 && a.y > path[start].neck.y, `${name}: the fist's line goes from the chest to the target (${rise.toFixed(1)} degrees)`);
      else assert.ok(rise < LEVEL_UP + 4, `${name}: the fist's line does not climb (${rise.toFixed(1)} degrees)`);
    }
    // The overhand: the same wind-up, but the fist's path bows up and comes DOWN onto the target at the end.
    const out = punch(stanceAt(facing), { hand: "back", technique: "overhand" }, settings);
    const path = fistPath(out, facing, "r");
    const end = path[path.length - 1].fist, before = path[Math.round(path.length * 0.85)].fist;
    assert.ok(end.y > before.y + 0.005 * TEST_HEIGHT, `${label("overhand", settings, facing)}: comes down onto the target at the end`);
  }
});

// Round 7 (Arthur: "Anticipation is always the opposite direction of where the output is going. Input is
// always BEHIND the stick figure; output in front." "The jab ... should go back a little — it should almost
// touch his head — then punch." "When one arm punches, the other one pulls back.")
const STYLES7: MoveSettings[] = [NATURAL, { ...NATURAL, style: "angry", energy: 0.9 }, { ...NATURAL, style: "tired", energy: 0.3 }, { ...NATURAL, style: "robot" }, { ...NATURAL, speed: "fast", energy: 1 }];
// The angle (degrees) between two moves on the stage (facing-corrected; 180 = exactly opposite).
const between7 = (a: { x: number; y: number }, b: { x: number; y: number }) =>
  (Math.acos(Math.max(-1, Math.min(1, (a.x * b.x + a.y * b.y) / (Math.hypot(a.x, a.y) * Math.hypot(b.x, b.y) || 1)))) * 180) / Math.PI;
const move7 = (from: Skeleton, to: Skeleton, joint: JointName, facing: Facing) => ({ x: (to[joint].x - from[joint].x) * fwd(facing), y: to[joint].y - from[joint].y });

test("punch (round 7): INPUT BEHIND, OUTPUT IN FRONT — every punch winds up the opposite way from its strike, for at least 2.5 pictures at 12 fps", () => {
  for (const settings of STYLES7) for (const facing of SIDES) for (const hand of ["front", "back"] as const) for (const technique of ["straight", "power", "overhand", "uppercut"] as PunchTechnique[]) {
    const name = label(`${technique}-${hand}`, settings, facing);
    const { p } = sides(hand);
    const fist = `${p}Hand` as const;
    const out = punch(stanceAt(facing), { hand, technique }, settings);
    const frames = fine(out.keys, facing);
    const g = at(frames, out.marks.guard), w = at(frames, out.marks.windup), h = at(frames, out.marks.hit);
    // Seen: the wind-up lasts at least 2.5 pictures at 12 fps (Arthur watches at 12).
    assert.ok(out.marks.windup - out.marks.guard >= MIN_WINDUP_SECONDS - 1e-6, `${name}: wind-up ${((out.marks.windup - out.marks.guard) * 12).toFixed(1)} pictures at 12 fps`);
    // Opposite: the fist's wind-up and its strike point (nearly) opposite ways.
    const angle = between7(move7(g, w, fist, facing), move7(w, h, fist, facing));
    assert.ok(angle >= 150, `${name}: wind-up ${angle.toFixed(0)} degrees from the strike (want about 180)`);
    // Behind: at the end of the wind-up a straight punch's ELBOW is a little behind the spine with the fist
    // tucked in by the chest (round 8: a light punch is a strong one in miniature — this replaces round 7's
    // "the fist almost touches the head", which Arthur saw as "you can't really see it"); a power punch's or
    // an overhand's fist is up behind the head; an uppercut's down and back beside the hip — never still
    // out in front.
    const ahead = ((w[fist].x - w.neck.x) * fwd(facing)) / TEST_HEIGHT;
    if (technique === "straight") {
      const spine = { x: w.neck.x - w.hip.x, y: w.neck.y - w.hip.y }, length = Math.hypot(spine.x, spine.y);
      const elbow = { x: w[`${p}Elbow`].x - w.hip.x, y: w[`${p}Elbow`].y - w.hip.y };
      const front = ((elbow.x * spine.y - elbow.y * spine.x) / length) * -fwd(facing) / TEST_HEIGHT; // + = in front of the spine
      assert.ok(front < -0.03 && front > -0.15, `${name}: the elbow a little behind the spine (${front.toFixed(3)} x height)`);
      const tucked = Math.hypot(w[fist].x - w.neck.x, w[fist].y - w.neck.y) / TEST_HEIGHT;
      assert.ok(ahead > 0.02 && tucked < 0.12, `${name}: the fist tucked in, in front of the chest (${ahead.toFixed(3)} ahead, ${tucked.toFixed(3)} from the shoulder)`);
      const freeHand = w[`${p === "l" ? "r" : "l"}Hand`];
      assert.ok(freeHand.y < w.neck.y + 0.03 * TEST_HEIGHT, `${name}: the other hand up by the face`);
    } else if (technique === "uppercut") {
      assert.ok(w[fist].y > w.neck.y + 0.2 * TEST_HEIGHT, `${name}: the fist drops low (beside the hip)`);
      assert.ok(ahead <= 0.01, `${name}: ...and back, not in front of the shoulder (${ahead.toFixed(3)})`);
    } else assert.ok(ahead < 0 && w[fist].y < w.neck.y, `${name}: the fist up behind the head (${ahead.toFixed(3)})`);
  }
});

test("punch (round 7): the arms counter-move — while the fist goes out, the other hand pulls back to the face", () => {
  for (const settings of [NATURAL, { ...NATURAL, style: "angry" as const, energy: 0.9 }]) for (const facing of SIDES) for (const hand of ["front", "back"] as const) for (const technique of ["straight", "uppercut"] as PunchTechnique[]) {
    const name = label(`${technique}-${hand}`, settings, facing);
    const { p, g: free } = sides(hand);
    const out = punch(stanceAt(facing), { hand, technique }, settings);
    const frames = fine(out.keys, facing);
    const w = at(frames, out.marks.windup), h = at(frames, out.marks.hit);
    const ahead = (s: Skeleton, joint: JointName) => ((s[joint].x - s.neck.x) * fwd(facing)) / TEST_HEIGHT;
    assert.ok(ahead(h, `${p}Hand`) > ahead(w, `${p}Hand`) + 0.1, `${name}: the fist goes out`);
    assert.ok(ahead(h, `${free}Hand`) < ahead(w, `${free}Hand`) - 0.02, `${name}: the other hand pulls back (${(ahead(w, `${free}Hand`) - ahead(h, `${free}Hand`)).toFixed(3)})`);
    const r = HEAD_RADIUS.normal * TEST_HEIGHT;
    const toHead = Math.hypot(h[`${free}Hand`].x - h.head.x, h[`${free}Hand`].y - h.head.y);
    assert.ok(toHead < 1.5 * r, `${name}: ...to the face (${(toHead / r).toFixed(2)} x the head's radius)`);
  }
});

test("kick (round 7): INPUT BEHIND — the leg swings back behind the body first, for at least 2.5 pictures at 12 fps, then forward", () => {
  for (const settings of STYLES7) for (const facing of SIDES) for (const height of ["low", "mid", "high"] as const) {
    const name = label(`kick-${height}`, settings, facing);
    const out = kick(stanceAt(facing), { height }, settings);
    const frames = fine(out.keys, facing);
    const s = at(frames, out.marks.shift), w = at(frames, out.marks.windup), h = at(frames, out.marks.hit);
    assert.ok(out.marks.windup - out.marks.shift >= MIN_WINDUP_SECONDS - 1e-6, `${name}: wind-up long enough`);
    const back = ((w.lFoot.x - w.hip.x) * fwd(facing)) / TEST_HEIGHT;
    assert.ok(back < -0.1, `${name}: the foot behind the hips (${back.toFixed(3)})`);
    const wind = move7(s, w, "lFoot", facing), strike = move7(w, h, "lFoot", facing);
    assert.ok(wind.x < -0.1 * TEST_HEIGHT && strike.x > 0.2 * TEST_HEIGHT, `${name}: back, then forward`);
  }
});

// Round 8 (EYES): "when the figure kicks, its eyes go where the kick goes" — a kick at nothing looks at the
// spot its foot hits, a kick at someone (the planner's `look`) looks at them. The eyes aren't drawn, so the
// head shows it (gaze.ts: it turns most of the way, as far as the neck goes).
test("kick (round 8): EYES — the head turns to where the kick goes: the spot the foot hits, or the one it kicks", () => {
  // Where the face points (degrees above level), from the head's tilt on the neck.
  const faceUp = (s: Skeleton, facing: Facing) => (Math.atan2(-(s.head.x - s.neck.x) * fwd(facing), -(s.head.y - s.neck.y)) * 180) / Math.PI;
  for (const facing of SIDES) {
    const face = (params: Parameters<typeof kick>[1], mark: "windup" | "hit") => {
      const out = kick(stanceAt(facing), params, NATURAL);
      return faceUp(at(fine(out.keys, facing), out.marks[mark]), facing);
    };
    // At nothing: down at a low or middle kick's spot (it was looking up, with the body leaning back), about
    // level for a high one — in the wind-up and at the hit.
    for (const mark of ["windup", "hit"] as const) {
      assert.ok(face({ height: "low" }, mark) < -15, `${facing}/low/${mark}: looks down at the spot (${face({ height: "low" }, mark).toFixed(0)})`);
      assert.ok(face({ height: "mid" }, mark) < -8, `${facing}/mid/${mark}: looks down at the spot (${face({ height: "mid" }, mark).toFixed(0)})`);
      assert.ok(Math.abs(face({ height: "high" }, mark)) < 8, `${facing}/high/${mark}: looks about level (${face({ height: "high" }, mark).toFixed(0)})`);
      // At someone: up at someone higher, down at someone lower, whatever the kick's height.
      assert.ok(face({ height: "low", look: { ahead: 250, up: 120 } }, mark) > 12, `${facing}/${mark}: looks up at someone higher`);
      // (A high kick leans the body far back, so the neck can only tip the head down a little there: a mid kick.)
      assert.ok(face({ height: "mid", look: { ahead: 250, up: -150 } }, mark) < -12, `${facing}/${mark}: looks down at someone lower`);
    }
  }
});
