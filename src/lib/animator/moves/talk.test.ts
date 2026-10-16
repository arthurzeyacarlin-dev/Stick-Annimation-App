import assert from "node:assert/strict";
import { test } from "node:test";
import { buildScene } from "../engine.ts";
import { LIBRARY } from "./library.ts";
import { planToScene, type ScenePlan } from "./plan.ts";
import { TEST_GROUND, TEST_HEIGHT } from "./testkit.ts";

// TALKING = GESTURES (Arthur, Oct 15): a stick figure "says" things with its body — it faces the listener, points (twice), taps
// the listener's shoulder (a real touch: it walks in first), and the listener answers with its own gestures (a nod), synced.
const H = TEST_HEIGHT;
const scene = (speaker: Record<string, unknown>, listener?: Record<string, unknown>): ScenePlan => ({
  id: "t", title: "t", height: H, groundY: TEST_GROUND,
  characters: [
    { id: "s", x: 600, facing: "front", actions: [{ move: "talk", params: { to: "l", ...speaker } }] },
    { id: "l", x: 1000, facing: "left", actions: listener ? [listener as never] : [{ move: "stand", params: { seconds: 6 } }] },
  ],
});
const build = (plan: ScenePlan) => {
  const s = planToScene(plan, LIBRARY);
  const built = buildScene(s, 24);
  return { s, built, of: (id: string) => built.frames.map((f) => f.find((c) => c.id === id)?.skeleton) };
};

test("talk: faces the listener, points twice, walks in and taps the listener's shoulder (a real touch), natural", () => {
  const { s, built, of } = build(scene({ say: ["point", "tap"] }));
  const marks = (s as unknown as { marks: Record<string, number> }).marks;
  const tap = Object.entries(marks).find(([k]) => k.startsWith("s.") && k.endsWith(".tap"))?.[1];
  assert.ok(tap !== undefined, `a tap mark: ${Object.keys(marks).join(",")}`);
  const i = Math.round(tap! * 24) + 1, me = of("s")[i]!, them = of("l")[i]!;
  const hand = [me.lHand, me.rHand].sort((p, q) => Math.hypot(p.x - them.neck.x, p.y - them.neck.y) - Math.hypot(q.x - them.neck.x, q.y - them.neck.y))[0];
  const d = Math.hypot(hand.x - them.neck.x, hand.y - them.neck.y);
  assert.ok(d < 0.07 * H, `the hand lands on the listener's shoulder (${(d / H).toFixed(2)} H away)`);
  // the point: the arm straight out at shoulder height, toward the listener
  const p = Object.entries(marks).find(([k]) => k.startsWith("s.") && k.endsWith(".point"))?.[1]!;
  const sp = of("s")[Math.round(p * 24) + 6]!;
  assert.ok(sp.lHand.x - sp.neck.x > 0.22 * H && Math.abs(sp.lHand.y - sp.neck.y) < 0.12 * H, "points straight out toward the listener");
  for (const r of built.report.characters) {
    assert.ok(r.maxBoneErrorPx <= 0.5, "bones");
    assert.ok(r.maxFootDriftPx <= 1, `a planted foot slid ${r.maxFootDriftPx.toFixed(2)}`);
  }
});

test("talk: the listener answers with a nod synced to the tap; every say is a whole, settled gesture", () => {
  const { s } = build(scene({ say: ["point", "tap"] }, { move: "talk", params: { say: "yes", to: "s" }, sync: { mark: "nod", at: "s.talk1.tap", offset: 0.3 } }));
  const marks = (s as unknown as { marks: Record<string, number> }).marks;
  assert.ok(Math.abs(marks["l.talk1.nod"] - marks["s.talk1.tap"] - 0.3) < 0.05, `nod at ${marks["l.talk1.nod"]}, tap at ${marks["s.talk1.tap"]}`);
  for (const say of ["come here", "no", "yes", "explain", "shrug", "look"]) {
    const { built } = build(scene({ say }));
    for (const r of built.report.characters) assert.ok(r.maxFootDriftPx <= 1 && r.maxBoneErrorPx <= 0.5, `${say}: natural`);
  }
});

test("a walk-in inside a move (talk tap, hug) is kept when another move follows (the hand-over point counts the walk keys)", () => {
  const plan = scene({ say: ["tap"] });
  plan.characters[0].facing = "right";
  plan.characters[0].actions.push({ move: "stand", params: { seconds: 1 } });
  const { of } = build(plan);
  const xs = of("s").filter(Boolean).map((k) => k!.hip.x);
  for (let i = 1; i < xs.length; i += 1) assert.ok(Math.abs(xs[i] - xs[i - 1]) < 0.06 * H, `no jump at picture ${i}`);
  assert.ok(xs[xs.length - 1] - xs[0] > 0.6 * H, "it walked in to the listener and stays there");
});

test("URGENT GESTURES OPEN TO THE VIEWER: an urgent talk turns to face the screen, gestures, turns back; words make it urgent; calm stays side-on", async () => {
  const { urgentTalks } = await import("./talk.ts");
  const side = (urgent: boolean) => build({ ...scene({}), characters: [
    { id: "s", x: 600, facing: "right", actions: [{ move: "talk", params: { to: "l", say: ["come here", "point"], toward: "back", ...(urgent ? { urgent: true } : {}) } }, { move: "stand", params: { seconds: 0.5 } }] },
    { id: "l", x: 1000, facing: "left", actions: [{ move: "stand", params: { seconds: 8 } }] }] } as ScenePlan);
  const u0 = side(true), facings = u0.built.frames.map((f) => f.find((c) => c.id === "s")!.facing);
  assert.ok(facings.includes("front"), "faces the viewer while it gestures");
  assert.equal(facings[facings.length - 1], "right", "turns back to the side it faced");
  const marks = (u0.s as unknown as { marks: Record<string, number> }).marks;
  assert.ok(Object.keys(marks).some((k) => k.endsWith(".beckon")) && Object.keys(marks).some((k) => k.endsWith(".point")), "its marks are there to sync to");
  assert.ok(!side(false).built.frames.some((f) => f.find((c) => c.id === "s")!.facing === "front"), "a calm talk stays side-on");
  const plan = { title: "x", characters: [{ actions: [{ move: "talk", params: { say: "point" } }, { move: "talk", params: { say: "yes" } }] }] };
  const u = urgentTalks(plan, "Emergency! the lifeguard waves him back") as typeof plan;
  assert.equal((u.characters[0].actions[0].params as { urgent?: boolean }).urgent, true);
  assert.equal((u.characters[0].actions[1].params as { urgent?: boolean }).urgent, undefined, "a nod is never made urgent");
  assert.equal(urgentTalks(plan, "a ranger tells a lost hiker the way"), plan, "calm words: unchanged");
});
