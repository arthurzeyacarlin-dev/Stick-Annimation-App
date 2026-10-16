import { test } from "node:test";
import assert from "node:assert/strict";
import { travelLimit, travelSpeedLaw } from "./travel.ts";
import { ride } from "../moves/ride.ts";
import { STAND } from "../rig.ts";
import { buildScene } from "../engine.ts";
import { planToScene } from "../moves/plan.ts";
import { LIBRARY } from "../moves/library.ts";

// LAW travelSpeed (Oct 14, the skater "going the speed of sound"): the whole body's travel speed per activity, and no instant start.
const H = 260, fps = 24;
const law = (xs: number[], move: string, words = "") => travelSpeedLaw([{ id: "a", x: xs[0]!, facing: "right", actions: [] } as never], () => xs, () => H,
  () => [{ name: move, end: xs.length / fps }], fps, [], words, () => "A");

test("each activity has its own top travel speed; forces (falls, hits, jumps) are not judged", () => {
  assert.equal(travelLimit("walk"), 1.6); assert.equal(travelLimit("run"), 5); assert.equal(travelLimit("ride"), 4); assert.equal(travelLimit("jog"), 3);
  assert.equal(travelLimit("getHit"), null); assert.equal(travelLimit("jump"), null);
  assert.equal(travelLimit("skateboarding: pushes twice"), 4); // an original move is read by its name
});

test("a body that travels faster than its activity allows breaks the law; a time lapse steps aside", () => {
  const eased = (v: number) => Array.from({ length: 4 * fps }, (_, i) => { const t = i / fps; return 300 + v * H * (t < 1 ? (t * t) / 2 : t - 0.5); });
  assert.ok(law(eased(1.3), "walk").ok, "a walk at 1.3 H/s is fine");
  assert.ok(!law(eased(3), "walk").ok, "a 'walk' at 3 H/s is too fast");
  assert.ok(law(eased(3), "walk", "a time lapse of a walk").ok);
  // an instant start: still, then 4 H/s in one picture
  const jolt = Array.from({ length: 3 * fps }, (_, i) => 300 + (i < fps ? 0 : (i - fps) * 4 * H / fps));
  assert.ok(!law(jolt, "run").ok, "a run may not start instantly");
});

test("the ride move stays under the ride limit and speeds up / slows down smoothly", () => {
  const o = ride({ t: 0, x: 300, facing: "right", pose: STAND }, { trick: "ollie", over: 1150, overWidth: 110, distance: 1400 }, { height: H, style: "natural", speed: "normal", energy: 0.5 } as never);
  const xs: number[] = []; for (let t = 0; t <= o.end.t; t += 1 / fps) { const k = o.keys.findIndex((q) => q.t >= t); const a = o.keys[Math.max(0, k - 1)]!, b = o.keys[Math.max(0, k)] ?? a; const u = b.t > a.t ? (t - a.t) / (b.t - a.t) : 0; xs.push(a.x + (b.x - a.x) * u); }
  const r = law(xs, "ride");
  assert.ok(r.ok, r.say);
  assert.ok(o.marks.pop! < o.marks.land! && o.marks.off! > o.marks.land!, "pop, land, then step off");
});

test("the library's own walks, jogs and runs pass the travel-speed law (every style)", () => {
  for (const move of ["walk", "jog", "run", "tiptoe"]) for (const style of ["natural", "angry", "happy", "tired", "robot"]) for (const speed of ["normal", "fast"]) {
    const scene = planToScene({ id: "t", title: "t", height: H, groundY: 900, characters: [{ id: "a", x: 200, facing: "right", style, speed, actions: [{ move, params: { distance: 1200 } }] }] } as never, LIBRARY);
    const built = buildScene(scene, fps);
    const xs = built.frames.map((f) => f.find((c) => c.id === "a")?.skeleton.hip.x);
    const r = travelSpeedLaw([{ id: "a", speed, actions: [] } as never], () => xs, () => H, () => [{ name: move, end: 99 }], fps, [], "", () => "A");
    assert.ok(r.ok, `${move} / ${style} / ${speed}: ${r.say}`);
  }
});
