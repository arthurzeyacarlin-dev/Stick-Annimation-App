import assert from "node:assert/strict";
import { test } from "node:test";
import { buildScene, type Scene } from "../engine.ts";
import { ballLook } from "../objects.ts";
import { LIBRARY } from "./library.ts";
import { fitPlanToPage, type ScenePlan } from "./plan.ts";
import { heldContactProblems } from "./testkit.ts";
import { COMBO_TESTS, makeTestScene, SINGLE_MOVE_TESTS, type TestLook } from "./tests.ts";

// SPEC-0017 Phase 2b round 7 — A HELD THING TOUCHES THE HANDS (Arthur's review: in "Pass a basketball
// back and forth" / "Long pass", when the two were close — "he's giving me the ball, got his hands out,
// grabbed it" — "the ball just stayed in mid-air, and he thinks he's holding it"). On a narrow page the
// engine moves the two closer, a pass becomes a HAND-OFF, and the hand-off went wrong in three ways:
// the take was ignored when it happened at the same moment as the letting go (the ball then "flew" for
// over a second to the next catch), the giver let go before the taker's hands were there (arms down,
// ball floating), and the two could disagree about whether it was a hand-off or a throw. Now: the ball
// is always at the holder's hand(s), only leaves the hands in a throw, and in a hand-off goes straight
// from hands to hands while both hold it.

const NATURAL: TestLook = { style: "natural", speed: "normal", energy: 0.5, direction: 1 };
// The app's page shapes (1080 high: 9/16 .. 16/9 wide) and narrower ones (a tall, thin window).
const PAGES = [400, 480, ...[9 / 16, 3 / 4, 1, 4 / 3, 16 / 9].map((a) => 1080 * a)];

function assertTouching(scene: Scene, label: string) {
  for (const fps of [12, 24]) {
    const r = heldContactProblems(scene, buildScene(scene, fps));
    assert.equal(r.floating, 0, `${label}@${fps}: ${r.problems.join("; ")}`);
  }
}

test("Arthur's bug: passing back and forth and the long pass on narrow pages hand the ball over hand to hand (never floating)", () => {
  for (const id of ["passBack", "longPass"]) for (const width of [400, 480]) for (const style of ["natural", "robot", "angry", "tired"] as const) {
    const scene = makeTestScene(id, { ...NATURAL, style }, width);
    const label = `${id} page ${width} ${style}`;
    assertTouching(scene, label);
    const segments = scene.objects![0].segments!;
    // These are hand-offs: the ball goes from one holder straight to the other (no flight between them)...
    const handOffs = segments.filter((s, i) => s.mode === "held" && segments[i + 1]?.mode === "held" && segments[i + 1].mode === "held");
    assert.ok(handOffs.length >= 1, `${label}: no hand-off`);
    // ...and every hand-off giver lets go only after the taker's hands are on it.
    const marks = (scene as Scene & { marks: Record<string, number> }).marks;
    for (const [name, offer] of Object.entries(marks)) {
      const m = name.match(/^(\w+)\.throw(\d+)\.offer$/);
      if (!m) continue;
      const giver = m[1], k = m[2], taker = giver === "a" ? "b" : "a";
      const letGo = marks[`${giver}.throw${k}.release`], taken = marks[`${taker}.catch${k}.catch`];
      assert.ok(taken >= offer - 1e-6 && letGo >= taken - 1e-6, `${label}: pass ${k}: held out ${offer.toFixed(2)}, taken ${taken.toFixed(2)}, let go ${letGo.toFixed(2)}`);
    }
  }
});

test("every review test with a ball keeps it touching its holder's hands at every page width", () => {
  const withBall = [...SINGLE_MOVE_TESTS, ...COMBO_TESTS].filter((t) => (t.plan(NATURAL).objects ?? []).length > 0);
  assert.ok(withBall.length >= 4);
  for (const t of withBall) for (const width of PAGES) for (const style of ["natural", "robot", "happy"] as const) {
    assertTouching(makeTestScene(t.id, { ...NATURAL, style }, width), `${t.id} page ${width.toFixed(0)} ${style}`);
  }
});

test("passes nobody wrote (close, far, turned away, several in a row) keep the ball in the hands", () => {
  const pass = (gap: number, a: ScenePlan["characters"][number]["actions"], b: ScenePlan["characters"][number]["actions"], width: number): Scene => fitPlanToPage({
    id: "p", title: "p", height: 300, groundY: 900,
    characters: [
      { id: "a", x: 960 - gap / 2, facing: "right", style: "natural", speed: "normal", energy: 0.5, actions: a },
      { id: "b", x: 960 + gap / 2, facing: "left", style: "heavy", speed: "fast", energy: 0.7, actions: b },
    ],
    objects: [{ id: "ball", look: ballLook("basketball"), heldBy: "a" }],
  }, LIBRARY, width);
  const give = (to: string) => ({ move: "throw", params: { object: "ball", to } }), take = (from: string) => ({ move: "catch", params: { object: "ball", from } });
  for (const gap of [180, 260, 300, 420, 900]) for (const width of [480, 1080, 1920]) {
    assertTouching(pass(gap, [give("b"), take("b"), give("b")], [take("a"), give("a"), take("a")], width), `three passes, ${gap} apart, page ${width}`);
    // (B turns its back after catching: it turns to A again before passing back.)
    assertTouching(pass(gap, [give("b"), take("b")], [take("a"), { move: "turn" }, give("a")], width), `turned away, ${gap} apart, page ${width}`);
  }
});

test("the checker sees a ball left floating (it would have caught Arthur's bug)", () => {
  const scene = makeTestScene("passBack", NATURAL, 400);
  const segments = scene.objects![0].segments!;
  const i = segments.findIndex((s, n) => s.mode === "held" && segments[n + 1]?.mode === "held" && s.character !== (segments[n + 1] as { character: string }).character);
  assert.ok(i >= 0);
  // The old mistake: the giver lets go of the ball held out still, and it drifts by itself to where the
  // taker's hands are half a second later.
  const held = segments[i] as Extract<typeof segments[number], { mode: "held" }>;
  const next = segments[i + 1];
  const broken = { ...scene, objects: [{ ...scene.objects![0], segments: [...segments.slice(0, i + 1), { from: held.to, to: held.to + 0.5, mode: "flight" as const }, { ...next, from: held.to + 0.5 }, ...segments.slice(i + 2)] }] };
  const r = heldContactProblems(broken, buildScene(broken, 12));
  assert.ok(r.floating >= 3 && r.problems.some((p) => /without a throw/.test(p)), JSON.stringify(r));
});
