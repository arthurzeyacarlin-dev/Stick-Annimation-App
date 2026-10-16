import assert from "node:assert/strict";
import { test } from "node:test";
import { buildScene, type Scene } from "./engine.ts";
import { CONTACT_LIMIT_PX, contactWeight } from "./contacts.ts";
import { DEFAULT_STYLE, STAND, JOINTS } from "./rig.ts";
import { TEST_GROUND, TEST_HEIGHT } from "./moves/testkit.ts";
import { declareContacts } from "./moves/declareContacts.ts";

// THE FINAL CONTACT PASS (Oct 15): a move declares a touch; the engine puts the hand exactly on its target on the FINAL
// pictures, with exact bone lengths, meeting a partner at the midpoint, blending in and out so nothing pops.

const figure = (id: string, x: number, facing: "left" | "right", keys: { t: number; x: number; pose?: typeof STAND }[]) => ({
  id, name: id, facing, height: TEST_HEIGHT, style: DEFAULT_STYLE,
  keys: keys.map((k) => ({ t: k.t, x: k.x, pose: k.pose ?? STAND, contacts: ["lFoot", "rFoot"] as ("lFoot" | "rFoot")[] })),
});

test("contact pass: two figures' declared hands meet at the midpoint within 2 px, bones exact, motion smooth", () => {
  // Two figures with their arms out toward each other, a little too far apart for their planned reach: without the pass the hands never meet.
  const reach = { ...STAND, lShoulder: 80, lElbow: 20 };
  const scene: Scene = {
    id: "t", title: "t", durationSec: 1.2, groundY: TEST_GROUND,
    characters: [figure("a", 800, "right", [{ t: 0, x: 800, pose: reach }, { t: 1.2, x: 800, pose: reach }]), figure("b", 1000, "left", [{ t: 0, x: 1000, pose: reach }, { t: 1.2, x: 1000, pose: reach }])],
    contacts: [
      { figure: "a", joint: "lHand", target: { figure: "b", joint: "lHand" }, from: 0.5, to: 0.8 },
      { figure: "b", joint: "lHand", target: { figure: "a", joint: "lHand" }, from: 0.5, to: 0.8 },
    ],
  };
  const built = buildScene(scene, 24);
  assert.ok(built.contacts && built.contacts.length === 2);
  for (const rep of built.contacts) assert.ok(rep.worstMissPx <= CONTACT_LIMIT_PX, `worst miss ${rep.worstMissPx.toFixed(2)} px`);
  // Exact bones on every picture (the engine's own report covers it).
  assert.ok(built.report.characters.every((c) => c.maxBoneErrorPx <= 0.5));
  // Inside the contact the two hands are on top of each other.
  const atT = (t: number) => built.frames[Math.round(t * 24)];
  const f = atT(0.65), a = f.find((c) => c.id === "a")!.skeleton, b = f.find((c) => c.id === "b")!.skeleton;
  assert.ok(Math.hypot(a.lHand.x - b.lHand.x, a.lHand.y - b.lHand.y) <= 2 * CONTACT_LIMIT_PX);
  // Smooth: no joint jumps more than a modest step between any two pictures (the blend eases the hand in and out).
  let worstStep = 0;
  for (let i = 1; i < built.frames.length; i += 1) for (const c of built.frames[i]) {
    const p = built.frames[i - 1].find((x) => x.id === c.id)!;
    for (const j of JOINTS) worstStep = Math.max(worstStep, Math.hypot(c.skeleton[j].x - p.skeleton[j].x, c.skeleton[j].y - p.skeleton[j].y));
  }
  assert.ok(worstStep <= 0.12 * TEST_HEIGHT, `biggest joint step ${worstStep.toFixed(1)} px`);
});

test("contact pass: a fixed spot and a rope line; out of reach shifts the figure at most 5% of its height and reports it", () => {
  const scene: Scene = {
    id: "t2", title: "t2", durationSec: 1, groundY: TEST_GROUND,
    characters: [figure("a", 600, "right", [{ t: 0, x: 600 }, { t: 1, x: 600 }])],
    contacts: [
      { figure: "a", joint: "rHand", target: { x: 600 + 0.3 * TEST_HEIGHT, y: TEST_GROUND - 0.6 * TEST_HEIGHT }, from: 0.3, to: 0.6 },
      { figure: "a", joint: "lHand", target: { line: [{ x: 500, y: TEST_GROUND - 0.5 * TEST_HEIGHT }, { x: 900, y: TEST_GROUND - 0.5 * TEST_HEIGHT }] }, from: 0.3, to: 0.6 },
    ],
  };
  const built = buildScene(scene, 24);
  for (const rep of built.contacts!) assert.ok(rep.reachable && rep.worstMissPx <= CONTACT_LIMIT_PX, `${rep.contact.joint} misses by ${rep.worstMissPx.toFixed(2)}`);
  const far: Scene = { ...scene, id: "t3", contacts: [{ figure: "a", joint: "rHand", target: { x: 600 + 2 * TEST_HEIGHT, y: TEST_GROUND - 0.6 * TEST_HEIGHT }, from: 0.3, to: 0.6 }] };
  const b2 = buildScene(far, 24);
  assert.equal(b2.contacts![0].reachable, false);
  const hip0 = b2.frames[0].find((c) => c.id === "a")!.skeleton.hip.x, hip1 = b2.frames[12].find((c) => c.id === "a")!.skeleton.hip.x;
  assert.ok(hip1 - hip0 <= 0.05 * TEST_HEIGHT + 0.01 && hip1 - hip0 > 0, `shift ${(hip1 - hip0).toFixed(1)}`);
});

test("clean let-go: after a high-five press the hands separate along their own planned swings — not glued at the meeting point", () => {
  // Both arms swing up to meet, then swing back down and apart (the planned paths pull apart after the press).
  const up = { ...STAND, lShoulder: 80, lElbow: 20 }, down = { ...STAND, lShoulder: 20, lElbow: 30 };
  const keys = (x: number) => [{ t: 0, x, pose: down }, { t: 0.5, x, pose: up }, { t: 0.6, x, pose: up }, { t: 1.2, x, pose: down }];
  const base: Scene = { id: "lg", title: "lg", durationSec: 1.2, groundY: TEST_GROUND, characters: [figure("a", 820, "right", keys(820)), figure("b", 980, "left", keys(980))] };
  const withContact: Scene = { ...base, contacts: [
    { figure: "a", joint: "lHand", target: { figure: "b", joint: "lHand" }, from: 0.5, to: 0.6 },
    { figure: "b", joint: "lHand", target: { figure: "a", joint: "lHand" }, from: 0.5, to: 0.6 },
  ] };
  const plain = buildScene(base, 24), solved = buildScene(withContact, 24);
  const hands = (b: typeof plain, i: number) => b.frames[i].map((c) => c.skeleton.lHand);
  const gap = (b: typeof plain, i: number) => { const [p, q] = hands(b, i); return Math.hypot(p.x - q.x, p.y - q.y); };
  // Pressed together inside the contact.
  assert.ok(gap(solved, Math.round(0.55 * 24)) <= 2 * CONTACT_LIMIT_PX, `press gap ${gap(solved, 13).toFixed(1)}`);
  // Right after the blend-out (3 pictures) each hand is back on its OWN planned path, and the gap is the planned gap again.
  const after = Math.round(0.6 * 24) + 4;
  for (let i = 0; i < 2; i += 1) { const s = hands(solved, after)[i], p = hands(plain, after)[i]; assert.ok(Math.hypot(s.x - p.x, s.y - p.y) <= 1, `hand ${i} still off its own path by ${Math.hypot(s.x - p.x, s.y - p.y).toFixed(1)} px`); }
  // During the blend-out the gap grows every picture (they separate — never held at the meeting point while the arms pull away).
  let last = gap(solved, Math.round(0.6 * 24));
  for (let i = Math.round(0.6 * 24) + 1; i <= Math.round(0.6 * 24) + 3; i += 1) { const g = gap(solved, i); assert.ok(g >= last - 0.5, `gap shrank at picture ${i}: ${last.toFixed(1)} -> ${g.toFixed(1)}`); last = g; }
  assert.ok(gap(solved, after) > 0.5 * gap(plain, after), "the hands did not come apart");
});

test("object and prop targets: a hand is solved onto a ball's rim and onto a prop's top; the ball then rides the solved hand", () => {
  const ballX = 600 + 0.18 * TEST_HEIGHT, ballY = TEST_GROUND - 0.72 * TEST_HEIGHT, size = 40;
  const scene: Scene & { effects?: unknown[] } = {
    id: "ob", title: "ob", durationSec: 1, groundY: TEST_GROUND,
    characters: [figure("a", 600, "right", [{ t: 0, x: 600 }, { t: 1, x: 600 }])],
    objects: [{ id: "ball", name: "ball", look: { kind: "ball", size, color: "#f00", filled: true }, keys: [{ t: 0, x: ballX, y: ballY }], segments: [{ from: 0.5, to: 1, mode: "held", character: "a", joint: "rHand" }] }],
    effects: [{ kind: "prop", start: 0, end: 1, anchor: { x: 600 - 0.15 * TEST_HEIGHT, y: TEST_GROUND }, params: { name: "crate", parts: [{ shape: "box", x: 0, y: -0.5, w: 1, h: 1 }], size: 0.5 } }],
    contacts: [
      { figure: "a", joint: "rHand", target: { object: "ball", grip: "rim" }, from: 0.3, to: 0.5 },
      { figure: "a", joint: "lHand", target: { prop: 0, point: "top" }, from: 0.3, to: 0.6 },
    ],
  };
  const built = buildScene(scene, 24);
  const [rim, top] = built.contacts!;
  assert.ok(rim.reachable && rim.worstMissPx <= CONTACT_LIMIT_PX, `rim miss ${rim.worstMissPx.toFixed(2)}`);
  assert.ok(top.reachable && top.worstMissPx <= CONTACT_LIMIT_PX, `prop-top miss ${top.worstMissPx.toFixed(2)}`);
  assert.ok(rim.firstTouch !== undefined && rim.firstTouch <= 0.3 + 1e-6 && (rim.gapPx ?? 99) <= CONTACT_LIMIT_PX);
  const i = Math.round(0.4 * 24), hand = built.frames[i][0].skeleton.rHand;
  assert.ok(Math.abs(Math.hypot(hand.x - ballX, hand.y - ballY) - size / 2) <= CONTACT_LIMIT_PX, "the hand is on the ball's surface");
  const lHand = built.frames[i][0].skeleton.lHand;
  // (on the crate's top line, somewhere on its top: the laws' box gives the middle, the World's exact outline the spot under the hand)
  assert.ok(Math.abs(lHand.y - (TEST_GROUND - 0.5 * TEST_HEIGHT)) <= CONTACT_LIMIT_PX && Math.abs(lHand.x - (600 - 0.15 * TEST_HEIGHT)) <= 0.25 * TEST_HEIGHT + CONTACT_LIMIT_PX, `the other hand is on the crate's top (${lHand.x.toFixed(0)}, ${lHand.y.toFixed(0)})`);
  // Once held, the ball follows the solved hand (objects are built after the pass).
  const j = Math.round(0.7 * 24), h2 = built.frames[j][0].skeleton.rHand, o = built.objects[j][0];
  assert.ok(Math.hypot(o.x - h2.x, o.y - h2.y) <= size, "the held ball is at the hand");
});

test("contact weight blends in and out over the blend window", () => {
  const c = { figure: "a", joint: "lHand" as const, target: { x: 0, y: 0 }, from: 1, to: 2 };
  assert.equal(contactWeight(c, 1.5, 24), 1);
  assert.equal(contactWeight(c, 1 - 3 / 24, 24), 0);
  assert.ok(contactWeight(c, 1 - 1.5 / 24, 24) > 0.4 && contactWeight(c, 1 - 1.5 / 24, 24) < 0.6);
  assert.equal(contactWeight(c, 2 + 3 / 24, 24), 0);
});

test("declareContacts: a high-five's slap marks declare both slapping hands on each other; a hug declares both hands on the partner's back", () => {
  const plan = { height: 300, characters: [{ id: "a", x: 800 }, { id: "b", x: 1000 }] } as unknown as Parameters<typeof declareContacts>[0];
  const five = declareContacts(plan, { "a.highFive1.slap": 1.0, "b.highFive1.slap": 1.02 });
  assert.equal(five.length, 2);
  assert.ok(five.every((c) => c.joint === "lHand" && "figure" in c.target && c.target.joint === "lHand"));
  const hug = declareContacts(plan, { "a.hug1.touch": 1, "a.hug1.release": 2, "b.hug1.touch": 1.1, "b.hug1.release": 2.1 });
  assert.equal(hug.length, 4);
  assert.ok(hug.every((c) => "figure" in c.target && (c.target.joint === "neck" || c.target.joint === "hip") && c.to === 2));
  assert.equal(declareContacts(plan, { "a.highFive1.slap": 1.0 }).length, 0); // nobody to meet: nothing declared
});
