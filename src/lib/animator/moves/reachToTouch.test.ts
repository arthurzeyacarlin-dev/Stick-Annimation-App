// THE BODY GETS CLOSE ENOUGH TO TOUCH WHAT IT TOUCHES (Oct 15 T1): arm's reach from the shoulder, the planned hand measured
// honestly (not the solver-fixed one), a named figure's body part is that figure, and the partner who arrives first waits.
import assert from "node:assert/strict";
import { test } from "node:test";
import { readTouches } from "./declareContacts.ts";
import { comfortableReach } from "../claude/claudeAnimator.ts";
import { partnersTouchInTime } from "../claude/touchIntent.ts";
import { PROPORTIONS } from "../rig.ts";

const ARM = PROPORTIONS.upperArm + PROPORTIONS.forearm;

test("ARM'S REACH FROM THE SHOULDER: a standing touch never asks the hand further than the arm is long, at any height", () => {
  for (let up = 0.62; up <= 1.05; up += 0.05) { // (standing upright: shoulder to spot within the arm)
    const r = comfortableReach(up), dy = Math.abs(0.76 - up);
    assert.ok(Math.hypot(r, dy) <= ARM + 1e-9 || r === 0.12, `at ${up.toFixed(2)} H the reach ${r.toFixed(3)} is longer than the arm`);
  }
  for (let up = 0.3; up <= 1.05; up += 0.01) { // (lower spots: the body bends in; never further than 0.32, never a jump)
    assert.ok(comfortableReach(up) <= 0.32 && Math.abs(comfortableReach(up) - comfortableReach(up + 0.01)) < 0.02, `jump at ${up.toFixed(2)}`);
  }
  assert.ok(comfortableReach(0.76) < 0.35 && comfortableReach(0.76) > 0.25); // (shoulder height: a bent arm, about 0.28)
  assert.ok(comfortableReach(0.58) < comfortableReach(0.76)); // (a handshake at waist height: closer than at shoulder height)
});

test("A NAMED FIGURE'S BODY PART: 'pats the student's shoulder' → the Student's neck, not the 'student desk'", () => {
  const plan = { height: 300, characters: [
    { id: "t", name: "Teacher", x: 500, actions: [{ move: "custom", params: { name: "pats the student's shoulder twice", keys: [{ pose: { rShoulder: 80, rElbow: 20 } }, { pose: { rShoulder: 70, rElbow: 20 } }] } }] },
    { id: "s", name: "Student", x: 700, actions: [] },
  ], effects: [{ kind: "prop", anchor: { x: 760, y: 860 }, params: { name: "student desk", size: 0.4 } }] };
  const [t] = readTouches(plan as never);
  assert.deepEqual(t.target, { figure: "s", joint: "neck" });
  // (…but a thing still wins when no figure's body part is named)
  const plan2 = { ...plan, characters: [{ ...plan.characters[0], actions: [{ move: "custom", params: { name: "puts the book on the student desk", keys: [{ pose: { rShoulder: 60 } }] } }] }, plan.characters[1]] };
  assert.deepEqual(readTouches(plan2 as never)[0].target, { prop: 0, point: "top" });
});

test("PARTNERS TOUCH IN TIME: the one whose handshake key comes first holds it (hand out) until the other's", () => {
  const shake = { move: "custom", params: { name: "shakes hands", keys: [{ pose: { rShoulder: 50, rElbow: 30 }, hold: 0.1 }, { pose: { rShoulder: 46, rElbow: 30 } }, { pose: { rShoulder: -6 } }] } };
  const plan = { height: 300, characters: [{ id: "a", x: 500, actions: [shake] }, { id: "b", x: 700, actions: [{ move: "wait", params: { seconds: 0.6 } }, shake] }] };
  const fake = (marks: Record<string, number>) => () => ({ scene: { marks } as never, built: {} as never });
  const out = partnersTouchInTime(plan, fake({ "a.custom1.k1": 0.4, "b.custom1.k1": 1.0 })) as typeof plan;
  assert.equal((out.characters[0].actions[0].params as { keys: { hold?: number }[] }).keys[0].hold, 0.7); // 0.1 + the 0.6 s wait
  assert.equal((out.characters[1].actions[1].params as { keys: { hold?: number }[] }).keys[0].hold, 0.1); // (the later one is untouched)
  assert.equal(partnersTouchInTime(plan, fake({ "a.custom1.k1": 1.0, "b.custom1.k1": 1.0 })), plan); // (already in time: no change)
});

test("A TALL THING IS TOUCHED ON ITS NEAR FACE: 'leans a hand on the wall' → the wall's near face; 'puts the cup on the table' → the table's top", () => {
  const wall = { kind: "prop", anchor: { x: 900, y: 750 }, params: { name: "brick wall", size: 1, parts: [{ shape: "rect", x: 0, y: 0, w: 0.4, h: 1, color: "#b45309" }] } };
  const table = { kind: "prop", anchor: { x: 900, y: 860 }, params: { name: "table", size: 0.4, parts: [{ shape: "rect", x: 0, y: 0, w: 1, h: 0.5, color: "#7c4a1e" }] } };
  const lean = { move: "custom", params: { name: "leans a hand on the wall", keys: [{ pose: { rShoulder: 80 } }] } };
  const put = { move: "custom", params: { name: "puts the cup on the table", keys: [{ pose: { rShoulder: 50 } }] } };
  const p = (e: unknown, a: unknown) => ({ height: 300, groundY: 900, characters: [{ id: "r", x: 600, actions: [a] }], effects: [e] });
  assert.deepEqual(readTouches(p(wall, lean) as never)[0].target, { prop: 0, point: "near" });
  assert.deepEqual(readTouches(p(table, put) as never)[0].target, { prop: 0, point: "top" });
});
