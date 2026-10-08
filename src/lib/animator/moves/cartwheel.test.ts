import { test } from "node:test";
import assert from "node:assert/strict";
import { buildScene, type Scene } from "../engine.ts";
import { DEFAULT_STYLE, HEAD_RADIUS, STAND_FRONT } from "../rig.ts";
import { cartwheel } from "./cartwheel.ts";

const H = 300, GROUND = 900;
export function cartwheelScene(direction: "left" | "right" = "right"): Scene {
  const out = cartwheel({ t: 0, x: 960, facing: "front", pose: STAND_FRONT }, { direction }, { height: H, style: "natural", speed: "normal", energy: 0.5 });
  const marks = Object.fromEntries(Object.entries(out.marks).map(([k, v]) => [`a.cartwheel1.${k}`, v]));
  return { id: "cw", title: "cartwheel", durationSec: out.end.t, groundY: GROUND, characters: [{ id: "a", name: "A", facing: "front", height: H, style: DEFAULT_STYLE, keys: out.keys }], marks };
}

for (const fps of [8, 12, 24]) for (const direction of ["right", "left"] as const) {
  test(`cartwheel ${direction} at ${fps} fps: a full turn over the hands, legs in an X, lands and stands`, () => {
    const scene = cartwheelScene(direction);
    const built = buildScene(scene, fps);
    const r = built.report.characters[0];
    assert.ok(r.maxBoneErrorPx <= 0.5, `bones ${r.maxBoneErrorPx}`);
    assert.equal(r.belowGroundFrames, 0);
    const sk = built.frames.map((f) => f[0].skeleton);
    // The body turns a full turn: some picture is upside down (head below hip), first and last upright.
    assert.ok(sk.some((s) => s.head.y > s.hip.y + 0.3 * H), "upside down at the top");
    assert.ok(sk[0].head.y < sk[0].hip.y && sk.at(-1)!.head.y < sk.at(-1)!.hip.y, "starts and ends upright");
    // Hands touch the floor in the middle; while upside down, legs spread in an X (feet far apart, both above the hip).
    const inverted = sk.filter((s) => s.head.y > s.hip.y + 0.3 * H);
    assert.ok(inverted.some((s) => Math.max(s.lHand.y, s.rHand.y) >= GROUND - 2), "a hand on the floor");
    for (const s of inverted) {
      assert.ok(Math.abs(s.lFoot.x - s.rFoot.x) > 0.4 * H, "legs spread wide");
      assert.ok(s.lFoot.y < s.hip.y && s.rFoot.y < s.hip.y, "both legs up from the hips (an X, not the splits)");
    }
    // Ends standing on both feet on the floor.
    const end = sk.at(-1)!;
    assert.ok(Math.abs(end.lFoot.y - GROUND) < 1 && Math.abs(end.rFoot.y - GROUND) < 1);
    // Travels the way it was asked.
    assert.ok((end.hip.x - sk[0].hip.x) * (direction === "right" ? 1 : -1) > 0.8 * H, `travel ${end.hip.x - sk[0].hip.x}`);
    // No hand or foot slides while it is on the floor: a point on the floor in two pictures in a row stays put.
    for (let i = 1; i < sk.length; i += 1) for (const p of ["lHand", "rHand", "lFoot", "rFoot"] as const) {
      if (sk[i - 1][p].y >= GROUND - 0.5 && sk[i][p].y >= GROUND - 0.5) assert.ok(Math.abs(sk[i][p].x - sk[i - 1][p].x) < 1.5, `${p} slid ${sk[i][p].x - sk[i - 1][p].x} at picture ${i}`);
    }
  });
}

// Round 2 (Arthur: "a standing pose has the legs together, arms by his sides"; "ELBOWS should bend a little").
test("cartwheel starts and ends in the normal stand (feet together, arms down); elbows give upside down", () => {
  for (const fps of [8, 12, 24]) for (const direction of ["right", "left"] as const) {
    const sk = buildScene(cartwheelScene(direction), fps).frames.map((f) => f[0].skeleton);
    for (const s of [sk[0], sk.at(-1)!]) {
      assert.ok(Math.abs(s.lFoot.x - s.rFoot.x) < 0.2 * H, `${direction}@${fps}: feet together (${Math.abs(s.lFoot.x - s.rFoot.x).toFixed(0)})`);
      assert.ok(s.lHand.y > s.hip.y - 0.1 * H && s.rHand.y > s.hip.y - 0.1 * H, `${direction}@${fps}: arms down by the sides`);
    }
  }
  const out = cartwheelScene("right").characters[0].keys;
  assert.ok(out.some((k) => (k.spin ?? 0) >= 90 && (k.spin ?? 0) <= 270 && Math.max(k.pose.lElbow, k.pose.rElbow) >= 15), "an elbow bends while the hands take the weight");
});

// A LIMB THAT TAKES THE BODY'S WEIGHT BENDS (Arthur, cartwheel rated OK: "when he lands on his legs, the weight from his
// arms needs to transfer to his legs"): the planted hand's elbow is bent more than a free one, the knees give as the
// feet land and straighten as it stands, and the landed feet never slide while they do.
test("cartwheel: weight moves hand -> hand -> foot -> foot; elbows and knees give under it, then straighten (feet stay put)", () => {
  const keys = cartwheelScene("right").characters[0].keys;
  const before = keys.filter((k) => (k.spin ?? 0) === 0);
  const over = keys.filter((k) => (k.spin ?? 0) >= 90 && (k.spin ?? 0) <= 270);
  assert.ok(Math.max(...over.map((k) => Math.max(k.pose.lElbow, k.pose.rElbow))) > Math.max(...before.map((k) => Math.max(k.pose.lElbow, k.pose.rElbow))) + 10, "the elbow carrying the weight bends more than the free arms");
  const landed = keys.filter((k) => (k.spin ?? 0) >= 360 && (k.contacts ?? []).length === 2);
  assert.ok(Math.min(landed[0].pose.lKnee, landed[0].pose.rKnee) >= 12, "both knees give as the weight arrives on the feet");
  assert.ok(Math.max(landed.at(-1)!.pose.lKnee, landed.at(-1)!.pose.rKnee) <= 3, "...and straighten as it stands");
  for (const fps of [12, 24]) {
    const scene = cartwheelScene("right");
    const from = Math.ceil(landed[0].t * fps);
    const sk = buildScene(scene, fps).frames.map((f) => f[0].skeleton).slice(from);
    for (const s of sk) for (const f of ["lFoot", "rFoot"] as const) assert.ok(Math.abs(s[f].x - sk[0][f].x) < 3 && Math.abs(s[f].y - sk[0][f].y) < 3, `@${fps}: ${f} stays where it landed`);
  }
});

// BIG WHOLE-BODY MOVES TAKE TIME (Arthur, cartwheel rated OK on both AIs: "it must be slower" — taught as a general
// rule in motion.ts, not a cartwheel number): the whole body turning over has weight, so at normal speed a full turn
// takes well over a second (it was 0.92 s; now ~1.58 s), a fast one is still quicker than a normal one, a slow one slower.
test("a whole-body turn-over takes time: normal cartwheel turns over in 1.2-1.6 s; fast quicker, slow slower", async () => {
  const { wholeBodyTurnSeconds } = await import("./motion.ts");
  const turnOver = (speed: "slow" | "normal" | "fast") => {
    const k = cartwheel({ t: 0, x: 960, facing: "front", pose: STAND_FRONT }, { direction: "right" }, { height: H, style: "natural", speed, energy: 0.5 }).keys;
    return k.find((x) => (x.spin ?? 0) >= 360)!.t - k.filter((x) => (x.spin ?? 0) === 0).at(-1)!.t;
  };
  const normal = turnOver("normal"), fast = turnOver("fast"), slow = turnOver("slow");
  // (<= 1.7: since 2026-10-08 the turn slows for a short beat over the top — THE SINK IS SLOW, motion.ts.)
  assert.ok(normal >= 1.2 && normal <= 1.7, `normal turn-over ${normal.toFixed(2)} s`);
  assert.ok(fast < normal && fast >= 1.0, `fast ${fast.toFixed(2)} s is quicker than normal but never snaps by`);
  assert.ok(slow > normal, `slow ${slow.toFixed(2)} s`);
  // The rule itself is general: any whole-body turn, any move.
  const set = { height: H, style: "natural" as const, speed: "normal" as const, energy: 0.5 };
  assert.ok(wholeBodyTurnSeconds(360, set, "linear") >= 1.2, "a full turn at normal speed takes at least 1.2 s");
  assert.ok(wholeBodyTurnSeconds(360, { ...set, energy: 1 }) < wholeBodyTurnSeconds(360, set), "more energy turns a little quicker");
  assert.ok(wholeBodyTurnSeconds(90, set, "out") > wholeBodyTurnSeconds(90, set, "linear"), "a slowing-down piece gets more time");
});

// A BODY IS HEAVY (Arthur, cartwheel rated OK: "I can't genuinely see his arms bend ... the legs should bend a little more
// when the weight transfers from the arms to the legs"): taught as motion.ts `weightBend`, not a cartwheel number.
test("cartwheel: the elbow carrying the weight bends >= 30 deg (most stacked over both hands), the landing knees >= 25 deg", () => {
  const keys = cartwheelScene("right").characters[0].keys;
  const at = (spin: number) => keys.find((k) => k.spin === spin)!;
  const both = at(174), second = at(265), first = at(100);
  assert.ok(Math.min(both.pose.lElbow, both.pose.rElbow) >= 30, `both hands share the weight: both elbows bend (${both.pose.lElbow}, ${both.pose.rElbow})`);
  assert.ok(second.pose.lElbow >= 30 && second.pose.lElbow < both.pose.lElbow, `the last hand, leaning off it, bends less (${second.pose.lElbow})`);
  assert.ok(first.pose.rElbow >= 30, `the first hand bends as the weight arrives (${first.pose.rElbow})`);
  assert.ok(first.pose.rElbow <= 52 && second.pose.lElbow <= 52 && Math.min(both.pose.lElbow, both.pose.rElbow) >= 62, `leaning off the hands ~45-52°, stacked over both ~62-66° (${first.pose.rElbow}, ${second.pose.lElbow}, ${both.pose.lElbow})`);
  const landed = keys.find((k) => (k.spin ?? 0) >= 360 && (k.contacts ?? []).length === 2)!;
  assert.ok(Math.min(landed.pose.lKnee, landed.pose.rKnee) >= 25, `the knees take the landing (${landed.pose.lKnee})`);
});

// A BEND THAT CARRIES WEIGHT MUST BE SEEN (Arthur, cartwheel: "I should genuinely see a bend in the arms"; motion.ts
// `seenWeightArm`): upside down, each elbow whose hand is on the floor bends >= 30 deg and sits out to the side, at least
// 0.12 figure heights from the head's centre (not hidden by the head circle); hands land wider than the shoulders;
// no elbow goes through the floor.
test("cartwheel: the weight-bearing elbows bend where they can be SEEN — clear of the head, >= 30 deg, at 8/12/24 fps", async () => {
  const { seenWeightArm, ELBOW_SEEN } = await import("./motion.ts");
  const bendOf = (a: { x: number; y: number }, b: { x: number; y: number }, c: { x: number; y: number }) => {
    const u = { x: a.x - b.x, y: a.y - b.y }, v = { x: c.x - b.x, y: c.y - b.y };
    return 180 - (Math.acos(Math.max(-1, Math.min(1, (u.x * v.x + u.y * v.y) / Math.hypot(u.x, u.y) / Math.hypot(v.x, v.y)))) * 180) / Math.PI;
  };
  for (const fps of [8, 12, 24]) for (const direction of ["right", "left"] as const) {
    const sk = buildScene(cartwheelScene(direction), fps).frames.map((f) => f[0].skeleton);
    let checked = 0;
    for (const s of sk) {
      for (const e of [s.lElbow, s.rElbow]) assert.ok(e.y <= GROUND + 0.5, `${direction}@${fps}: an elbow went through the floor`);
      if (s.head.y <= s.hip.y) continue;
      for (const side of ["l", "r"] as const) {
        if (s[`${side}Hand`].y < GROUND - 0.5) continue;
        checked += 1;
        const el = s[`${side}Elbow`];
        const d = Math.hypot(el.x - s.head.x, el.y - s.head.y) / H;
        assert.ok(d >= 0.12, `${direction}@${fps}: the ${side} elbow is hidden by the head (${d.toFixed(3)} H from its centre)`);
        const bend = bendOf(s.neck, el, s[`${side}Hand`]);
        assert.ok(bend >= 30, `${direction}@${fps}: the ${side} elbow carrying the weight bends ${bend.toFixed(0)} deg`);
      }
    }
    assert.ok(checked >= 3, `${direction}@${fps}: hands carry the weight upside down in several pictures (${checked})`);
  }
  // The rule itself (any front-view pose, e.g. a handstand): the bent elbow is turned out clear of the head, the hand
  // lands wider than the shoulders and still reaches past the head; the elbow bends only the natural way.
  const hand = seenWeightArm({ ...STAND_FRONT, rShoulder: 175, lShoulder: 175 }, "r", 40, "front");
  assert.equal(hand.rElbow, 40);
  const { forwardKinematics } = await import("../pose.ts");
  const b = forwardKinematics(hand, "front", { x: 0, y: 0 }, 1, "normal", false);
  assert.ok(Math.hypot(b.rElbow.x - b.head.x, b.rElbow.y - b.head.y) >= ELBOW_SEEN - 1e-9, "elbow clear of the head");
  assert.ok(b.rHand.x - b.neck.x > 0.08, `hand planted wider than the shoulders (${(b.rHand.x - b.neck.x).toFixed(3)})`);
  assert.ok(b.rHand.y < b.head.y - HEAD_RADIUS.normal - 0.004, "the hand still reaches past the head");
});

// THE BEND UNDER WEIGHT IS BALANCED (Arthur, 2026-10-08: "his arms shouldn't bend too much, otherwise his head would
// touch the ground; but not too little"; "I want him as weak as a stick figure, because he's skin and bone"; "his arm
// should bend MOST when he's upside down — right when both of his arms are on the ground"; "his arms need to slowly go
// down until they hit a limit, and then he continues, falling faster again"): every hand holding him gives clearly
// (44–68°), the first and last single hand less (<= 58°; 45–52° at their keys), the deepest bend (>= 60°) comes while BOTH hands are down,
// the head never comes within 0.05 of his height of the floor, and the turn is slower near the top than before/after it.
for (const fps of [8, 12, 24]) {
  test(`cartwheel: the weight bend is deepest over both hands, slow into the top, head never to the floor (${fps} fps)`, async () => {
    const { planToScene } = await import("./plan.ts");
    const { LIBRARY } = await import("./library.ts");
    const { buildScene } = await import("../engine.ts");
    const plan = { id: "c", title: "c", height: 300, groundY: 900, characters: [{ id: "a", x: 600, facing: "front", actions: [{ move: "cartwheel", params: { direction: "right" } }] }] };
    const built = buildScene(planToScene(plan as never, LIBRARY), fps);
    const bend = (a: { x: number; y: number }, b: { x: number; y: number }, c: { x: number; y: number }) => {
      const u = [a.x - b.x, a.y - b.y], v = [c.x - b.x, c.y - b.y];
      return 180 - (Math.acos((u[0] * v[0] + u[1] * v[1]) / Math.hypot(u[0], u[1]) / Math.hypot(v[0], v[1])) * 180) / Math.PI;
    };
    const single: number[] = [], both: number[] = []; // (both = the body stacked over the hands: within 30° of upside down)
    for (const f of built.frames) {
      const c = f[0], s = c.skeleton;
      assert.ok((900 - (s.head.y + c.headRadius)) / 300 >= 0.05, "the head never comes to the floor");
      if (s.head.y < s.hip.y) continue; // (only hands on the floor while upside down)
      const down = (["l", "r"] as const).filter((side) => 900 - s[`${side}Hand`].y <= 3);
      for (const side of down) {
        const b = bend(s.neck, s[`${side}Elbow`], s[`${side}Hand`]);
        assert.ok(b >= 44 && b <= 68, `a hand holding him bends ${b.toFixed(0)}° (44–68°)`);
        const up = Math.abs((Math.atan2(s.neck.x - s.hip.x, s.hip.y - s.neck.y) * 180) / Math.PI);
        (up >= 150 ? both : single).push(b);
      }
    }
    assert.ok(single.length >= 2 && both.length >= 1, "the hands do carry him, leaning off them and stacked over them");
    assert.ok(single[0] <= 58 && single.at(-1)! <= 58, `the first and last single hand give less (${single[0].toFixed(0)}°, ${single.at(-1)!.toFixed(0)}°)`);
    assert.ok(Math.max(...both) >= 60 && Math.max(...both) >= Math.max(...single), `the deepest bend is over both hands (${Math.max(...both).toFixed(0)}° vs ${Math.max(...single).toFixed(0)}°)`);
    // THE SINK IS SLOW: the body turns slower near the top (within 25° of upside down) than on the way in/out of it.
    let prev = 0, last: number | null = null;
    const near: number[] = [], away: number[] = [];
    for (const f of built.frames) {
      const s = f[0].skeleton;
      let a = (Math.atan2(s.neck.x - s.hip.x, s.hip.y - s.neck.y) * 180) / Math.PI; // 0 = upright, 180 = upside down
      if (last !== null) { while (a - prev > 180) a -= 360; while (a - prev < -180) a += 360; }
      if (last !== null) { const mid = Math.abs((a + prev) / 2), speed = Math.abs(a - prev); if (Math.abs(mid - 180) <= 25) near.push(speed); else if (Math.abs(mid - 180) >= 50 && Math.abs(mid - 180) <= 110) away.push(speed); }
      prev = a; last = a;
    }
    const avg = (v: number[]) => v.reduce((x, y) => x + y, 0) / v.length;
    assert.ok(near.length >= 1 && away.length >= 2 && avg(near) < avg(away), `slower near the top (${avg(near).toFixed(1)} vs ${avg(away).toFixed(1)} °/picture)`);
  });
}

// A BODY TIPPING OVER LEADS WITH ITS WEIGHT and WEIGHT HANDS OVER (Arthur, cartwheel rated OK: "his legs need to start
// going in that direction — leaning over there because he's falling that way"; "the arms should slowly bend until they
// stop. Then when the weight is transferred from the arms to the legs, the legs start bending"; motion.ts): past the top
// the legs swing toward the landing side (>= 8° ahead of the body line) before the first foot lands; the arm bend grows
// while the hands hold him and peaks (>= 60°) stacked over them, before any foot takes weight; then the landing knees
// bend while the elbows straighten.
for (const fps of [8, 12, 24]) for (const direction of ["right", "left"] as const) {
  test(`cartwheel ${direction} @${fps}: the legs lead the fall; arms bend then hand the weight to bending legs`, () => {
    const d = direction === "right" ? 1 : -1;
    const sk = buildScene(cartwheelScene(direction), fps).frames.map((f) => f[0].skeleton);
    type P = { x: number; y: number };
    const bendAt = (a: P, b: P, c: P) => {
      const u = [a.x - b.x, a.y - b.y], v = [c.x - b.x, c.y - b.y];
      return 180 - (Math.acos(Math.max(-1, Math.min(1, (u[0] * v[0] + u[1] * v[1]) / Math.hypot(u[0], u[1]) / Math.hypot(v[0], v[1])))) * 180) / Math.PI;
    };
    const up = sk.map((s) => Math.abs((Math.atan2(s.neck.x - s.hip.x, s.hip.y - s.neck.y) * 180) / Math.PI));
    const elbow = sk.map((s) => Math.max(bendAt(s.neck, s.lElbow, s.lHand), bendAt(s.neck, s.rElbow, s.rHand)));
    const knee = sk.map((s) => Math.max(bendAt(s.hip, s.lKnee, s.lFoot), bendAt(s.hip, s.rKnee, s.rFoot)));
    const top = up.indexOf(Math.max(...up));
    const footDown = sk.findIndex((s, i) => i > top && Math.max(s.lFoot.y, s.rFoot.y) >= GROUND - 3);
    const bothFeet = sk.findIndex((s, i) => i > footDown && s.lFoot.y >= GROUND - 3 && s.rFoot.y >= GROUND - 3);
    assert.ok(top > 0 && footDown > top && bothFeet > footDown, "upside down, then a foot, then both feet");
    // The legs lead the fall: the feet's middle swings ahead of the body line, toward the landing side.
    const lead = sk.slice(top + 1, footDown + 1).map((s) => {
      const a = { x: s.hip.x - s.neck.x, y: s.hip.y - s.neck.y }, m = { x: (s.lFoot.x + s.rFoot.x) / 2 - s.hip.x, y: (s.lFoot.y + s.rFoot.y) / 2 - s.hip.y };
      return (d * Math.atan2(a.x * m.y - a.y * m.x, a.x * m.x + a.y * m.y) * 180) / Math.PI;
    });
    assert.ok(Math.max(...lead) >= 8, `the legs swing toward the fall before the foot lands (${Math.max(...lead).toFixed(0)}°)`);
    // The arms bend more and more while the hands hold him, the most stacked over them, before a foot takes weight.
    const held = sk.map((s, i) => (i < footDown && s.head.y > s.hip.y && Math.max(s.lHand.y, s.rHand.y) >= GROUND - 3 ? elbow[i] : -1));
    const first = held.findIndex((b) => b >= 0), most = held.indexOf(Math.max(...held));
    assert.ok(held[most] >= 60 && up[most] >= 150 && held[first] < held[most] - 5, `the arms sink into the bend (${held[first].toFixed(0)}° -> ${held[most].toFixed(0)}° at ${up[most].toFixed(0)}° over)`);
    // Then the weight hands over: the elbows straighten while the landing knees bend.
    assert.ok(elbow[bothFeet] < elbow[most] - 40 && knee[bothFeet] > knee[footDown] + 20, `arms straighten (${elbow[most].toFixed(0)} -> ${elbow[bothFeet].toFixed(0)}), knees bend (${knee[footDown].toFixed(0)} -> ${knee[bothFeet].toFixed(0)})`);
    assert.ok(sk.some((_, i) => i > most && i <= bothFeet && elbow[i] < elbow[i - 1] - 1 && knee[i] > knee[i - 1] + 1), "at the same time, not one after the other");
  });
}
