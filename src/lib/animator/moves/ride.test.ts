import assert from "node:assert/strict";
import test from "node:test";
import { forwardKinematics } from "../pose.ts";
import { STAND } from "../rig.ts";
import { ride, rideGeometry, RIDE_DECK } from "./ride.ts";

// Arthur, Oct 15 (X01 skate ollie, X02 scooter): the brake was "telekinesis", the ollie "bends and stays bent", the scooter "broken".
const H = 260, settings = { height: H, style: "natural", speed: "normal", energy: 0.6 } as never;
const skel = (p: Parameters<typeof forwardKinematics>[0]) => forwardKinematics(p, "right", { x: 0, y: 0 }, 1, "normal", false);
const go = (params: Record<string, unknown>) => ride({ t: 0, x: 200, facing: "right", pose: STAND }, params as never, settings);

test("a ride stops by DRAGGING the back foot on the ground (friction you can see), and slows faster than it glides", () => {
  for (const on of ["skateboard", "scooter"]) {
    const o = go({ on, distance: 900, pushes: 2 });
    assert.ok(o.marks.drag !== undefined && o.marks.stopped > o.marks.drag, `${on}: a drag mark before the stop`);
    const dragging = o.keys.filter((k) => k.t >= o.marks.drag + 0.3 && k.t <= o.marks.stopped);
    assert.ok(dragging.length > 3, `${on}: the drag lasts`);
    for (const k of dragging) { const s = skel(k.pose); assert.ok(Math.abs(s.rFoot.y - s.lFoot.y - RIDE_DECK) < 0.004, `${on}: the back foot is down on the ground at ${k.t.toFixed(2)}`); }
    const a = o.keys.find((k) => k.t >= o.marks.drag)!, b = o.keys.find((k) => k.t >= o.marks.drag + 0.25)!;
    const span = (o.marks.stopped - o.marks.drag);
    assert.ok(span < 2.2, `${on}: the drag stops it in ${span.toFixed(2)} s (not a long telekinetic coast)`);
    assert.ok(b.x > a.x, `${on}: still rolling while the foot comes down (no dead stop)`);
  }
});

test("an ollie is a real jump: the legs SNAP straight at the pop, then tuck, then reach for the deck", () => {
  const o = go({ on: "skateboard", trick: "ollie", over: 900, overWidth: 110, distance: 1300 });
  const air = o.keys.filter((k) => k.t >= o.marks.pop && k.t <= o.marks.land);
  const straightest = Math.min(...air.map((k) => k.pose.lKnee));
  const tuck = Math.max(...air.map((k) => k.pose.lKnee));
  assert.ok(straightest <= 22, `the front leg extends at the pop (knee ${straightest.toFixed(0)}°)`);
  assert.ok(tuck >= 80, `the knees tuck over the obstacle (${tuck.toFixed(0)}°)`);
});

test("scooter: both hands are EXACTLY on the bar (fixed to the deck) in every picture of the ride", () => {
  const o = go({ on: "scooter", distance: 900, pushes: 3 });
  const g = rideGeometry(true);
  let worst = 0;
  for (const k of o.keys.filter((k) => k.t <= o.marks.off)) {
    const s = skel(k.pose);
    for (const h of [s.lHand, s.rHand]) worst = Math.max(worst, Math.hypot(h.x - s.lFoot.x - g.gripX, h.y - s.lFoot.y - g.gripY) * H);
  }
  assert.ok(worst <= 1, `hands within 1 px of the bar (worst ${worst.toFixed(2)} px)`);
});

test("both feet are EXACTLY on the deck while gliding (no back foot floating a few pixels above it)", () => {
  for (const on of ["skateboard", "scooter"]) {
    const o = go({ on, distance: 1200, pushes: 2 });
    const glide = o.keys.filter((k) => k.t > o.marks.push2 + 1.0 && k.t < o.marks.drag);
    assert.ok(glide.length > 2, `${on}: a glide`);
    for (const k of glide) { const s = skel(k.pose); assert.ok(Math.abs(s.rFoot.y - s.lFoot.y) * H < 1, `${on}: back foot ${((s.rFoot.y - s.lFoot.y) * H).toFixed(1)} px off the deck at ${k.t.toFixed(2)}`); }
  }
});
