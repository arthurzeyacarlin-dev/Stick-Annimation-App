import assert from "node:assert/strict";
import { test } from "node:test";
import { FLAT_SCALE, FLIGHT_TIME_FACTOR, flightPoint, flightStyleOf } from "./objectFlight.ts";

// EACH THING FLIES ITS OWN WAY (Arthur, Oct 15, the beach frisbee: "that's a frisbee; right now it looks like a ball").

test("the thing's own words pick how it flies — never one ball arc for everything", () => {
  assert.equal(flightStyleOf("frisbee"), "glide");
  assert.equal(flightStyleOf("flying-disc"), "glide");
  assert.equal(flightStyleOf("x", "paper plate"), "glide");
  assert.equal(flightStyleOf("paperPlane", "paper plane"), "swoop");
  assert.equal(flightStyleOf("b1", "red balloon"), "float");
  assert.equal(flightStyleOf("feather"), "float");
  assert.equal(flightStyleOf("ball", undefined, "ball"), "ballistic");
  assert.equal(flightStyleOf("rock"), "ballistic");
  assert.ok(FLIGHT_TIME_FACTOR.glide >= 1.8 && FLIGHT_TIME_FACTOR.float > FLIGHT_TIME_FACTOR.glide && FLIGHT_TIME_FACTOR.ballistic === 1);
  assert.ok(FLAT_SCALE.glide < 0.5 && FLAT_SCALE.ballistic === 1, "a disc is seen nearly edge-on");
});

for (const style of ["glide", "swoop", "float"] as const) test(`${style}: starts in the throwing hand, ends in the catching hands, flows with no pop`, () => {
  const a = { x: 600, y: 760 }, b = { x: 1300, y: 770 };
  const s = flightPoint(style, a, b, 0), e = flightPoint(style, a, b, 1);
  assert.ok(Math.hypot(s.x - a.x, s.y - a.y) < 1 && Math.hypot(e.x - b.x, e.y - b.y) < 1);
  assert.ok(Math.abs(s.rotation) < 1 && Math.abs(e.rotation) < 1 && Math.abs(s.scale - 1) < 1e-6 && Math.abs(e.scale - 1) < 1e-6, "no snap at the hands");
  const steps: number[] = [];
  let prev = s;
  for (let i = 1; i <= 96; i += 1) { const q = flightPoint(style, a, b, i / 96); steps.push(Math.hypot(q.x - prev.x, q.y - prev.y)); prev = q; }
  for (let i = 1; i < steps.length; i += 1) assert.ok(Math.abs(steps[i] - steps[i - 1]) < 0.5 * Math.max(steps[i], steps[i - 1]) + 1.5, `${style} jumps at ${i}`);
});

test("a frisbee HANGS: a wide flat top, out fast and slower and slower, then drifts down", () => {
  const a = { x: 600, y: 760 }, b = { x: 1300, y: 760 };
  const ys = Array.from({ length: 21 }, (_, i) => flightPoint("glide", a, b, i / 20).y), top = Math.min(...ys);
  assert.ok(760 - top > 60, "it climbs on its lift");
  const high = ys.filter((y) => 760 - y > 0.75 * (760 - top)).length;
  assert.ok(high >= 10, `stays up most of the flight (${high}/21 pictures near the top)`);
  const dx = (u0: number, u1: number) => flightPoint("glide", a, b, u1).x - flightPoint("glide", a, b, u0).x;
  assert.ok(dx(0, 0.1) > 1.8 * dx(0.9, 1), "it slows down in the air");
});
