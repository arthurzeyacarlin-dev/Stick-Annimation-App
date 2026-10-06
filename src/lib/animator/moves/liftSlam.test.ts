import assert from "node:assert/strict";
import { test } from "node:test";
import { buildScene, momentTimes } from "../engine.ts";
import { LIBRARY } from "./library.ts";
import { planToScene, type ScenePlan } from "./plan.ts";
import { armPathProblems, TEST_HEIGHT } from "./testkit.ts";
import type { MoveStyle } from "./styles.ts";

// LIFT AND SLAM (liftSlam.ts): B knocked down on its back, A walks over, grabs its ankle, swings it up
// overhead (turning round) and slams it down flat on its back on the other side.
const slamPlan = (style: MoveStyle, aFacing: "right" | "left" = "right", gap = 380): ScenePlan => ({
  id: "ls", title: "ls", height: TEST_HEIGHT, groundY: 900,
  characters: [
    { id: "a", x: 960 + (aFacing === "right" ? -1 : 1) * gap / 2, facing: aFacing, style, energy: 0.6, actions: [{ move: "wait", params: { seconds: 1.3 } }, { move: "liftSlam", params: { target: "b" } }] },
    { id: "b", x: 960 + (aFacing === "right" ? 1 : -1) * gap / 2, facing: aFacing === "right" ? "left" : "right", style, energy: 0.5, actions: [{ move: "fallDown", params: { direction: "back" } }, { move: "slammed", params: { from: "a" } }, { move: "getUp" }] },
  ],
});

test("lift and slam: registered, the held foot stays in the hand from grab to slam, swung fully off the floor, lands flat, body rules at 8/12/24 fps, both directions", () => {
  assert.ok(LIBRARY.liftSlam && LIBRARY.slammed);
  for (const style of ["natural", "angry"] as MoveStyle[]) for (const facing of ["right", "left"] as const) {
    const scene = planToScene(slamPlan(style, facing), LIBRARY);
    const grab = scene.marks["a.liftSlam1.grab"], slam = scene.marks["a.liftSlam1.slam"];
    assert.ok(grab !== undefined && slam !== undefined && slam > grab, `${style} ${facing}: marks`);
    assert.ok(Math.abs(scene.marks["b.slammed1.hit"] - slam) < 1e-6, `${style} ${facing}: B is slammed when A slams`);
    for (const fps of [8, 12, 24]) {
      const built = buildScene(scene, fps);
      let worst = 0, airborne = 0, flat = Infinity;
      built.frames.forEach((frame, i) => {
        const t = i / fps;
        const A = frame.find((c) => c.id === "a")!.skeleton, B = frame.find((c) => c.id === "b")!.skeleton;
        // (The picture nearest the slam, just before or just after it.)
        if (Math.abs(t - slam) < 0.5 / fps + 1e-9) flat = Math.min(flat, Math.max(900 - B.hip.y, 900 - B.neck.y));
        if (t < grab - 1e-6 || t > slam + 1e-6) return;
        const foot = Math.hypot(A.rHand.x - B.lFoot.x, A.rHand.y - B.lFoot.y) < Math.hypot(A.rHand.x - B.rFoot.x, A.rHand.y - B.rFoot.y) ? B.lFoot : B.rFoot;
        worst = Math.max(worst, Math.hypot(A.rHand.x - foot.x, A.rHand.y - foot.y));
        // (Fully off the floor: its lowest joint above it.)
        airborne = Math.max(airborne, 900 - Math.max(B.lFoot.y, B.rFoot.y, B.lKnee.y, B.rKnee.y, B.hip.y, B.neck.y, B.head.y));
      });
      assert.ok(worst <= 3, `${style} ${facing} ${fps} fps: hand ${worst.toFixed(1)} px off the foot`);
      assert.ok(airborne > 0.5 * TEST_HEIGHT, `${style} ${facing} ${fps} fps: swung up off the floor (${airborne.toFixed(0)} px)`);
      assert.ok(flat < 0.15 * TEST_HEIGHT, `${style} ${facing} ${fps} fps: lands flat on its back (${flat.toFixed(0)} px up)`);
      for (const r of built.report.characters) {
        assert.ok(r.maxBoneErrorPx <= 0.5 && r.maxFootDriftPx <= 1 && r.belowGroundFrames === 0, `${style} ${facing} ${fps} fps ${r.id}: body rules ${JSON.stringify(r)}`);
        assert.ok(r.maxJointStepPx < 2880 / fps, `${style} ${facing} ${fps} fps ${r.id}: joint jump ${r.maxJointStepPx.toFixed(0)}`);
      }
      assert.deepEqual(armPathProblems(built.frames, fps, 2400 / fps), [], `${style} ${facing} ${fps} fps: arm paths`);
    }
  }
});

// FAST SPAN (Arthur, round 16: the slam looked "like on the moon"; engine.ts fastSpans): from the top of the
// swing to the impact both figures may move far between pictures, but never more than 4x the joint-step
// rule, along a smooth path (the head and hips never turn back inside the span), and a picture lands
// exactly on the impact at 8, 12 and 24 fps. The slam is far faster than the lift.
// HEAVY THINGS SPEED UP FAST (Arthur, round 16: "We're not on moon gravity"; "acceleration needs to go fast
// ... when he's getting closer and closer to the ground, that's when he needs to be at top speed"): no stop
// at the top (the slam's first step is at least the up-swing's last), the slam lasts about a quarter of a
// second, the slammed body's steps grow for the first ~1/12 s, then stay about the same (top speed) into
// the impact. THE WEIGHT CARRIES THROUGH ("a little left, right, stop" —
// never a squat bounce): the slammer is never frozen after the impact; the jolt pops him up a little for a
// picture or two, then his hips sway forward toward the body, then back about 3x less, the feet planted and
// the hips at the same height. THE IMPACT MOVES BOTH ("it looks stiff ... his spine needs to bend"), but
// only a little ("if you do it too much ... he's doing the dolphin"): the one slammed bends, bounces a little
// and skids back a little.
test("lift and slam: the slam is a fast span — no stop at the top, speeds up for ~1/12 s then holds top speed into the impact, a picture on it; the slammer sways with the weight after it", () => {
  for (const style of ["natural", "angry", "robot", "tired"] as MoveStyle[]) for (const facing of ["right", "left"] as const) {
    const scene = planToScene(slamPlan(style, facing), LIBRARY);
    const m = scene.marks!;
    const grab = m["a.liftSlam1.grab"], top = m["a.liftSlam1.windup"], slam = m["a.liftSlam1.slam"];
    assert.ok(slam - top >= 0.24 && slam - top <= 0.34, `${style} ${facing}: slam lasts ${(slam - top).toFixed(3)} s`);
    assert.ok(top - grab <= (style === "tired" ? 1.4 : 1.1) && (top - grab) / (slam - top) >= 2, `${style} ${facing}: lift ${(top - grab).toFixed(2)} s vs slam ${(slam - top).toFixed(2)} s`);
    // (A big crash, then lying hurt only briefly: about 1.1 s from the impact to lying still, in any mood.)
    const lying = m["b.slammed1.down"] - m["b.slammed1.hit"];
    assert.ok(lying >= 1.0 && lying <= 1.2, `${style} ${facing}: ${lying.toFixed(2)} s from the impact to lying still`);
    for (const id of ["a.liftSlam1", "b.slammed1"]) {
      assert.ok(Math.abs(m[`${id}.fastFrom`] - top) < 1e-6 && Math.abs(m[`${id}.fastTo`] - slam) < 1e-6, `${style} ${facing} ${id}: fast span is top to impact`);
    }
    for (const fps of [8, 12, 24]) {
      const times = momentTimes(scene, fps);
      assert.ok(times.some((t) => Math.abs(t - slam) < 1e-6), `${style} ${facing} ${fps} fps: a picture on the impact`);
      const built = buildScene(scene, fps);
      for (const r of built.report.characters) assert.ok(r.maxFastStepPx < (4 * 2880) / fps, `${style} ${facing} ${fps} fps ${r.id}: fast step ${r.maxFastStepPx.toFixed(0)}`);
      assert.ok(built.report.characters.find((r) => r.id === "b")!.maxFastStepPx > 0, `${style} ${facing} ${fps} fps: the span is used`);
      const inside = times.map((t, i) => ({ t, i })).filter(({ t }) => t >= top - 1e-6 && t <= slam + 1e-6);
      for (const id of ["a", "b"]) for (const joint of ["head", "hip"] as const) {
        let last: { x: number; y: number } | undefined;
        const steps: { from: number; len: number }[] = [];
        for (let k = 1; k < inside.length; k += 1) {
          const p = built.frames[inside[k - 1].i].find((c) => c.id === id)!.skeleton[joint], q = built.frames[inside[k].i].find((c) => c.id === id)!.skeleton[joint];
          const step = { x: q.x - p.x, y: q.y - p.y };
          if (last && Math.hypot(step.x, step.y) > 2 && Math.hypot(last.x, last.y) > 2) assert.ok(step.x * last.x + step.y * last.y > 0, `${style} ${facing} ${fps} fps ${id} ${joint}: turns back inside the fast span`);
          steps.push({ from: inside[k - 1].t - top, len: Math.hypot(step.x, step.y) });
          last = step;
        }
        if (id !== "b") continue;
        // (Speeding up for the first ~1/12 s — each step bigger than the one before — then TOP SPEED: the
        // steps from 1/12 s on all within 15% of each other; the first step smaller at 12 and 24 fps.)
        const speeding = steps.filter((s) => s.from < 1 / 12 - 1e-6), cruising = steps.filter((s) => s.from >= 1 / 12 - 1e-6);
        const tag = `${style} ${facing} ${fps} fps b ${joint} steps ${steps.map((s) => s.len.toFixed(0)).join("/")}`;
        for (let k = 1; k < speeding.length; k += 1) assert.ok(speeding[k].len > speeding[k - 1].len, `${tag}: not speeding up at the start`);
        assert.ok(cruising.length >= (fps >= 12 ? 2 : 1), `${tag}: no top speed`);
        const mean = cruising.reduce((sum, s) => sum + s.len, 0) / cruising.length;
        for (const s of cruising) assert.ok(Math.abs(s.len - mean) <= 0.15 * mean, `${tag}: top speed not held`);
        if (fps >= 12) assert.ok(steps[0].len < 0.9 * mean, `${tag}: the first step is not smaller (no speeding up)`);
        // (No stop at the top: going over it, the body moves at least as far as on the way up to it.)
        const before = times.map((t, i) => ({ t, i })).filter(({ t }) => t < top - 1e-6).at(-1)!;
        const up = Math.hypot(built.frames[inside[0].i].find((c) => c.id === "b")!.skeleton[joint].x - built.frames[before.i].find((c) => c.id === "b")!.skeleton[joint].x, built.frames[inside[0].i].find((c) => c.id === "b")!.skeleton[joint].y - built.frames[before.i].find((c) => c.id === "b")!.skeleton[joint].y);
        if (fps >= 12) assert.ok(steps[0].len >= up, `${tag}: slows at the top (${up.toFixed(0)} px up to it)`);
      }
      assert.ok(inside.length >= 3, `${style} ${facing} ${fps} fps: ${inside.length} pictures in the slam`);
      // (Never frozen after the impact: no two pictures of the slammer the same in the next 0.4 s; he sways
      // forward toward the body, then back about 3x less, feet planted, hips at the same height.)
      const after = times.map((t, i) => ({ t, i })).filter(({ t }) => t >= slam - 1e-6 && t <= slam + 0.4 + 1e-6);
      for (let k = 1; k < after.length; k += 1) {
        const p = built.frames[after[k - 1].i].find((c) => c.id === "a")!.skeleton, q = built.frames[after[k].i].find((c) => c.id === "a")!.skeleton;
        const moved = Math.max(...(Object.keys(q) as (keyof typeof q)[]).map((j) => Math.hypot(q[j].x - p[j].x, q[j].y - p[j].y)));
        assert.ok(moved > 1, `${style} ${facing} ${fps} fps: the slammer is frozen at ${after[k].t.toFixed(3)} s after the impact (${moved.toFixed(1)} px)`);
      }
      if (fps === 24) {
        const hipAt = (i: number) => built.frames[i].find((c) => c.id === "a")!.skeleton.hip;
        const toward = Math.sign(built.frames[after[0].i].find((c) => c.id === "b")!.skeleton.hip.x - hipAt(after[0].i).x);
        const all = times.map((t, i) => ({ t, i })).filter(({ t }) => t >= slam - 1e-6 && t <= slam + 0.46 + 1e-6).map(({ t, i }) => ({ t: t - slam, fwd: (hipAt(i).x - hipAt(after[0].i).x) * toward, up: hipAt(after[0].i).y - hipAt(i).y }));
        // (THE JOLT: the hips pop up a little, 0.02-0.035 x height, in the first moment, then drop back.)
        const popUp = Math.max(...all.filter((p) => p.t <= 0.17).map((p) => p.up));
        assert.ok(popUp >= 0.02 * TEST_HEIGHT && popUp <= 0.035 * TEST_HEIGHT, `${style} ${facing}: the slammer pops up ${popUp.toFixed(1)} px with the jolt`);
        const sway = all.filter((p) => p.t >= 0.12);
        const peak = Math.max(...sway.map((p) => p.fwd)), at = sway.findIndex((p) => p.fwd === peak);
        const rest = sway[sway.length - 1].fwd, back = rest - Math.min(...sway.slice(at).map((p) => p.fwd));
        const swayTag = `${style} ${facing}: sway ${sway.map((p) => p.fwd.toFixed(1)).join("/")}`;
        assert.ok(peak - rest >= 0.02 * TEST_HEIGHT && peak - rest <= 0.06 * TEST_HEIGHT, `${swayTag}: forward sway`);
        assert.ok(back >= (peak - rest) / 6 && back <= (peak - rest) / 2, `${swayTag}: back about 3x less`);
        assert.ok(Math.max(...sway.filter((p) => p.t >= 0.2).map((p) => Math.abs(p.up))) <= 0.015 * TEST_HEIGHT, `${swayTag}: the hips bob up and down (a squat bounce)`);
      }
      if (fps === 12) {
        // (THE IMPACT MOVES BOTH, at 12 fps: the slammer's pop lasts at most 2 pictures; the one slammed
        // bends (torso and thighs never in a straight line), bounces a little for 1-2 pictures and skids
        // back away from the slammer a little.)
        const sk = (i: number, id: string) => built.frames[i].find((c) => c.id === id)!.skeleton;
        const near = times.map((t, i) => ({ t: t - slam, i })).filter(({ t }) => t >= -1e-6 && t <= 0.3 + 1e-6);
        const A0 = sk(near[0].i, "a"), B0 = sk(near[0].i, "b");
        assert.ok(near.filter(({ i }) => A0.hip.y - sk(i, "a").hip.y > 0.02 * TEST_HEIGHT).length <= 2, `${style} ${facing}: the slammer's pop lasts more than 2 pictures`);
        // (The bounce: how high the hips get above where they come to lie — small, no "dolphin".)
        // (From the first ~0.1 s on: before that the hips are still coming down from where the slam left them.)
        // (Blue's bounce and its arch easing out are watched for 0.7 s.)
        const nearB = times.map((t, i) => ({ t: t - slam, i })).filter(({ t }) => t >= -1e-6 && t <= 0.7 + 1e-6);
        const hipY = nearB.map(({ i }) => sk(i, "b").hip.y), low = Math.max(...hipY);
        const up = nearB.map(({ t }, k) => ({ t, h: low - hipY[k] })).filter(({ t }) => t > 0.1), bounce = Math.max(...up.map((u) => u.h));
        assert.ok(bounce >= 0.04 * TEST_HEIGHT && bounce <= 0.15 * TEST_HEIGHT, `${style} ${facing}: bounce ${bounce.toFixed(0)} px`);
        // (Arthur's drawing: at the top of the bounce the body is a gentle arch — the hips the highest point
        // of the torso, the head tipped down below the neck, the feet down near the floor, both hands down
        // near the floor: no arm sticking up like a pole.)
        const topAt = nearB[hipY.indexOf(Math.min(...hipY.filter((_, k) => nearB[k].t > 0.1)))].i, T = sk(topAt, "b");
        assert.ok(T.hip.y <= T.neck.y - 3 && T.head.y > T.neck.y + 2 && Math.max(T.lFoot.y, T.rFoot.y) >= 900 - 0.04 * TEST_HEIGHT && Math.min(T.lHand.y, T.rHand.y) >= 900 - 0.15 * TEST_HEIGHT, `${style} ${facing}: the bounce is not an arch (head ${(900 - T.head.y).toFixed(0)} neck ${(900 - T.neck.y).toFixed(0)} hips ${(900 - T.hip.y).toFixed(0)} feet ${(900 - T.lFoot.y).toFixed(0)},${(900 - T.rFoot.y).toFixed(0)} px up)`);
        // (THE ARCH EASES OUT, round 16: "not for one singular frame — slowly, frame by frame, until the fourth or
        // fifth frame": after its top the hips come down over at least 3 pictures, never back up, and are down
        // within about half a second.)
        const fall = up.filter((u) => u.t >= nearB.find((n) => n.i === topAt)!.t);
        assert.ok(fall.filter((u) => u.h > 0.015 * TEST_HEIGHT).length >= 2 && fall.filter((u) => u.h > 0.015 * TEST_HEIGHT).length <= 4 && fall.every((u, k) => k === 0 || u.h <= fall[k - 1].h + 2.5), `${style} ${facing}: the arch doesn't ease out (${fall.map((u) => u.h.toFixed(0)).join("/")} px)`);
        assert.ok(fall.filter((u) => u.t > 0.6).every((u) => u.h <= 0.02 * TEST_HEIGHT), `${style} ${facing}: still arched after 0.6 s`);
        const away = Math.sign(B0.hip.x - A0.hip.x), skid = (sk(near.at(-1)!.i, "b").hip.x - B0.hip.x) * away;
        assert.ok(skid >= 0.03 * TEST_HEIGHT && skid <= 0.08 * TEST_HEIGHT, `${style} ${facing}: skids back ${skid.toFixed(0)} px`);
        const bend = near.map(({ i }) => { const B = sk(i, "b"); const kx = (B.lKnee.x + B.rKnee.x) / 2 - B.hip.x, ky = (B.lKnee.y + B.rKnee.y) / 2 - B.hip.y, nx = B.neck.x - B.hip.x, ny = B.neck.y - B.hip.y; return (Math.acos((kx * nx + ky * ny) / Math.hypot(kx, ky) / Math.hypot(nx, ny)) * 180) / Math.PI; });
        // (The hit whips the legs up at the hips; the bounce is the arch checked above; then it lies bent.)
        assert.ok(Math.min(...bend) < 120 && bend.every((b, k) => b < 160 || near[k].t > 0.1 && near[k].t < 0.55), `${style} ${facing}: the spine doesn't bend (torso to thighs ${bend.map((b) => b.toFixed(0)).join("/")} degrees)`);
      }
    }
  }
});
