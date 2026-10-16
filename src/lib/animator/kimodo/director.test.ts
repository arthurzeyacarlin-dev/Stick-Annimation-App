// THE DIRECTOR'S BEATS (Oct 16, Arthur: "they aren't touching, not blocking, no reactions"): two people Kimodo made alone meet on
// their REAL moments — the punch is fully out on the picture the head starts to snap back, the fist is ON the head then, and the
// two bodies never stand inside each other.
import assert from "node:assert/strict";
import { test } from "node:test";
import { buildScene } from "../engine.ts";
import { makeEffectsTestScene } from "../moves/tests2c.ts";
import { directBeats, moments } from "./director.ts";

const H = 280;
const duo = (ma: string, mb: string, result: string) => ({ id: "t", title: "t", height: H, groundY: 900, pace: "natural", effects: [],
  characters: [{ id: "a", name: "A", x: 820, facing: "right", look: { color: "#111111" }, actions: [{ move: "realMotion", params: { motion: ma } }] },
    { id: "b", name: "B", x: 1100, facing: "left", look: { color: "#c0392b" }, actions: [{ move: "realMotion", params: { motion: mb } }] }],
  beats: [{ by: "a", on: "b", result }] });

test("a punch lands: the head snaps back on the hit picture, the fist is on the head, the bodies stay apart", () => {
  const plan = directBeats(duo("d-punch", "d-gethit", "hit")) as Record<string, unknown> & { directorReport: { contacts: { t: number }[] } };
  const hitT = plan.directorReport.contacts[0].t;
  const scene = makeEffectsTestScene(plan as never, 1920) as never as { marks?: Record<string, number> };
  const b = buildScene({ ...(scene as object), contacts: undefined } as never, 24), frames = b.frames as never as Parameters<typeof moments>[0];
  const m = moments(frames, "b", "a", 24, scene.marks?.["b.realMotion1.start"] ?? 0, scene.marks?.["b.realMotion1.done"] ?? frames.length / 24, H, 0);
  assert.ok(m.snaps.some((s) => Math.abs(s - hitT) <= 1.5 / 24), `the head snaps back on the hit (hit ${hitT.toFixed(2)} s, snaps ${m.snaps.map((s) => s.toFixed(2))})`);
  const k = Math.round(hitT * 24), A = frames[k].find((x) => x.id === "a")!.skeleton, B = frames[k].find((x) => x.id === "b")!;
  const fist = ["lHand", "rHand"].map((h) => Math.hypot(A[h].x - B.skeleton.head.x, A[h].y - B.skeleton.head.y)).sort((x, y) => x - y)[0];
  assert.ok(fist < B.headRadius + 0.06 * H, `the fist reaches the head (${fist.toFixed(0)} px from its middle)`);
  for (const f of frames) assert.ok(f.find((x) => x.id === "b")!.skeleton.hip.x - f.find((x) => x.id === "a")!.skeleton.hip.x >= 0.3 * H - 1, "bodies never inside each other");
});

test("a high five meets in the middle and nobody walks into the other", () => {
  const plan = directBeats(duo("d-highfive", "d-highfive2", "touch")) as Record<string, unknown> & { directorContacts: { figure: string }[] };
  assert.deepEqual(plan.directorContacts.map((c) => c.figure).sort(), ["a", "b"], "both hands reach halfway");
  const b = buildScene({ ...(makeEffectsTestScene(plan as never, 1920) as object), contacts: undefined } as never, 24);
  for (const f of b.frames as never as { id: string; skeleton: Record<string, { x: number }> }[][]) assert.ok(f.find((x) => x.id === "b")!.skeleton.hip.x - f.find((x) => x.id === "a")!.skeleton.hip.x >= 0.3 * H - 1);
});

test("a reaction made for its hit is timed by its own known hits, and a kick lands on the BODY, not the head", () => {
  const plan = directBeats(duo("d-kick", "r-kick", "hit")) as Record<string, unknown> & { directorReport: { pairs: number[][]; contacts: { t: number }[] }; directorContacts: { target: { joint: string } }[] };
  assert.equal(plan.directorReport.pairs[0][0], 1, "the reaction's known hit (1.0 s in its clip) is the one lined up");
  assert.ok(Math.abs(plan.directorReport.pairs[0][1] - plan.directorReport.contacts[0].t - 1 / 24) < 1e-6, "…one picture after the foot arrives");
  assert.equal(plan.directorContacts[0].target.joint, "neck", "the kick lands on the body line (neck→hips), not the head");
});
