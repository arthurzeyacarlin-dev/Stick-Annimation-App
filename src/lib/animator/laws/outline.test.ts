import assert from "node:assert/strict";
import { test } from "node:test";
import { lawProblems } from "../claude/claudeAnimator.ts";
import { CONTACT_GAP_PX, bodyOutline, outlineGap, touchObject, touchVerb, worldOutline } from "./outline.ts";

// ONE TRUTH: every touch law measures the real gap to the DRAWN outline, 2 px flat.
test("the gap is measured to the drawn edge: inside = 0, outside = the real distance (no half-size slack)", () => {
  const ball = { circle: { x: 100, y: 100, r: 20 } };
  assert.equal(outlineGap(ball, { x: 110, y: 100 }), 0);
  assert.equal(outlineGap(ball, { x: 125, y: 100 }), 5);
  const box = { box: { left: 0, right: 10, top: 0, bottom: 10 } };
  assert.equal(outlineGap(box, { x: 5, y: 5 }), 0);
  assert.equal(outlineGap(box, { x: 13, y: 14 }), 5);
  const tri = { points: [{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 0, y: 20 }] };
  assert.equal(outlineGap(tri, { x: 2, y: 2 }), 0);
  assert.ok(Math.abs(outlineGap(tri, { x: 20, y: 20 }) - Math.SQRT2 * 10) < 1e-9);
  assert.equal(CONTACT_GAP_PX, 2);
});

test("a figure's drawn body: its bones are lines of its drawn thickness, its head a circle", () => {
  const sk = { head: { x: 0, y: -50 }, neck: { x: 0, y: -40 }, hip: { x: 0, y: 0 }, lElbow: { x: -10, y: -25 }, lHand: { x: -15, y: -10 }, rElbow: { x: 10, y: -25 }, rHand: { x: 15, y: -10 }, lKnee: { x: -5, y: 20 }, lFoot: { x: -5, y: 40 }, rKnee: { x: 5, y: 20 }, rFoot: { x: 5, y: 40 } };
  const body = bodyOutline(sk, 8, 4);
  assert.equal(outlineGap(body, { x: 2, y: -20 }), 0, "on the torso line (within half the line width)");
  assert.equal(outlineGap(body, { x: 7, y: -2 }), 5, "5 px off the torso line's drawn edge");
  assert.equal(outlineGap(body, { x: 0, y: -63 }), 3, "3 px above the drawn head");
});

test("the World is read when the build carries it (worldAt / world[i]); missing → null so the law falls back", () => {
  const built = { worldAt: (i: number) => ({ things: [{ id: "stove", box: { left: 100 + i, right: 200, top: 800, bottom: 900 } }] }) };
  assert.equal(outlineGap(worldOutline(built, 3, ["stove"])!, { x: 100, y: 850 }), 3);
  assert.equal(worldOutline(built, 0, ["kettle"]), null);
  assert.equal(worldOutline({}, 0, ["stove"]), null);
  assert.equal(outlineGap(worldOutline({ world: [[{ id: "rock", outline: [0, 0, 10, 0, 10, 10, 0, 10] }]] }, 0, ["rock"])!, { x: 14, y: 5 }), 4);
});

test("touch intent is read from a custom move's name — and gestures that only sound like touches are not", () => {
  for (const n of ["taps the top of the hat", "knocks on the door", "pats Bob on the back", "handshake", "presses the red button", "grabs the rope", "catches the ball", "pushes the cart"]) assert.ok(touchVerb(n), n);
  assert.equal(touchObject("knocks on the door twice"), "on the door twice");
  assert.equal(touchObject("handshake"), "hand");
  assert.equal(touchObject("pats his friend on the back"), "his friend on the back");
  for (const n of ["skateboarding: pushes twice, glides, ollies", "grabs at his head as the hat blows off", "shakes the snow off his head, annoyed", "pats her belly"]) assert.equal(touchObject(n), null, n);
  for (const n of ["shakes his fist at the kid", "shakes her head", "holds still", "holds his breath", "pushes off the wall and runs", "waves hello", "catches his breath", "holds her belly laughing", ""]) assert.equal(touchVerb(n), null, n);
});

// THE NEW LAW, end to end: a custom "pats the back" that stops short of the partner is broken; one that gets there passes.
const ground = { background: { pieces: [{ kind: "sky" }, { kind: "ground" }] } };
const pat = (bx: number) => ({ id: "t", title: "pat", height: 300, groundY: 900, ...ground,
  characters: [
    { id: "a", name: "Ann", x: 800, facing: "right", look: { color: "#00f" }, actions: [{ move: "custom", params: { name: "pats Bob on the back", keys: [{ pose: { rShoulder: 80, rElbow: 10 }, hold: 0.4 }, { pose: { rShoulder: 85, rElbow: 10 }, hold: 0.4 }, { pose: { rShoulder: 0, rElbow: 10 }, hold: 0.3 }] } }] },
    { id: "b", name: "Bob", x: bx, facing: "right", look: { color: "#f00" }, actions: [{ move: "stand", params: { seconds: 2.5 } }] }] });
test("touchIntent: a pat that never reaches the partner is broken; the same pat at arm's length passes", () => {
  const far = lawProblems(pat(1300), "Ann pats Bob on the back");
  assert.ok(far.some((p) => p.startsWith("LAW touchIntent")), far.join("\n"));
  // (the reach is found by sliding Bob in until the hand meets his drawn body — no fixed number)
  let passed = false;
  for (let bx = 1000; bx >= 820 && !passed; bx -= 4) passed = !lawProblems(pat(bx), "Ann pats Bob on the back").some((p) => p.startsWith("LAW touchIntent"));
  assert.ok(passed, "some arm's-length spot touches");
});
