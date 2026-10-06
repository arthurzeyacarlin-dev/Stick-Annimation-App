import type { Scene } from "../engine.ts";
import { ballLook } from "../objects.ts";
import { bounce, concatKeys, growShrink, slide, spin } from "../objectMoves.ts";
import { DEFAULT_STYLE, type CharacterStyle } from "../rig.ts";
import { blockBlockHitPlan } from "./fightScene.ts";
import { fillInFight } from "./followUp.ts";
import { LIBRARY } from "./library.ts";
import { fitPlanToPage, planToScene, type Action, type CharacterPlan, type ScenePlan } from "./plan.ts";
import { MOVE_SPEEDS, MOVE_STYLES, type MoveSpeed, type MoveStyle } from "./styles.ts";

// SPEC-0017 Phase 2: review-only test scenes for the Moves panel (removed in Phase 5). Each one is a
// small SCENE PLAN — the same thing the AI director will write in Phase 3 — so these show exactly what
// the engine makes from a plan. No frames are written here.

export type TestLook = { style: MoveStyle; speed: MoveSpeed; energy: number; direction: 1 | -1; color?: string; hollowHead?: boolean; neck?: boolean };

const MOVE_STYLES_LIST: readonly MoveStyle[] = MOVE_STYLES;
const MOVE_SPEEDS_LIST: readonly MoveSpeed[] = MOVE_SPEEDS;
const GROUND = 900;
const HEIGHT = 300;
const PARTNER = "#2563eb";

const lookOf = (o: TestLook): Partial<CharacterStyle> => ({ color: o.color ?? DEFAULT_STYLE.color, headFilled: !o.hollowHead, neck: o.neck === true });
const partnerLook = (o: TestLook): Partial<CharacterStyle> => ({ ...lookOf(o), color: o.color === PARTNER ? "#e02424" : PARTNER });
const facingOf = (o: TestLook) => (o.direction > 0 ? "right" as const : "left" as const);
const plan = (id: string, title: string, characters: CharacterPlan[], extra: Partial<ScenePlan> = {}): ScenePlan => ({ id, title, height: HEIGHT, groundY: GROUND, characters, ...extra });
const solo = (o: TestLook, actions: Action[], x = 960): CharacterPlan => ({ id: "a", name: "Mover", x, facing: facingOf(o), look: lookOf(o), style: o.style, speed: o.speed, energy: o.energy, actions });
// Two figures facing each other, `gap` px apart (the panel's figure on the left).
const pair = (o: TestLook, gap: number, a: Action[], b: Action[]): CharacterPlan[] => [
  { id: "a", name: "Left", x: 960 - gap / 2, facing: "right", look: lookOf(o), style: o.style, speed: o.speed, energy: o.energy, actions: a },
  { id: "b", name: "Right", x: 960 + gap / 2, facing: "left", look: partnerLook(o), style: o.style, speed: o.speed, energy: o.energy, actions: b },
];

type TestEntry = { id: string; title: string; plan: (o: TestLook) => ScenePlan };

// One move at a time (walk and run have their own test track, see index.ts).
export const SINGLE_MOVE_TESTS: TestEntry[] = [
  { id: "turn", title: "Turn around", plan: (o) => plan("turn", "Turn around", [solo(o, [{ move: "stand", params: { seconds: 0.5 } }, { move: "turn" }, { move: "stand", params: { seconds: 0.6 } }])]) },
  { id: "lookBack", title: "Look back", plan: (o) => plan("look-back", "Look back", [solo(o, [{ move: "stand", params: { seconds: 0.5 } }, { move: "lookBack" }, { move: "stand", params: { seconds: 0.6 } }])]) },
  { id: "stand", title: "Stand (breathe)", plan: (o) => plan("stand", "Stand and breathe", [solo(o, [{ move: "stand", params: { seconds: 4 } }])]) },
  { id: "jump", title: "Jump", plan: (o) => plan("jump", "Jump", [solo(o, [{ move: "jump" }])]) },
  { id: "jumpForward", title: "Jump forward", plan: (o) => plan("jump-forward", "Jump forward", [solo(o, [{ move: "jump", params: { distance: 220 } }])]) },
  { id: "squat", title: "Squat", plan: (o) => plan("squat", "Squat", [solo(o, [{ move: "squat" }])]) },
  { id: "sit", title: "Sit down, stand up", plan: (o) => plan("sit", "Sit down and stand up", [solo(o, [{ move: "sit" }])]) },
  { id: "fall", title: "Fall and get up", plan: (o) => plan("fall", "Fall and get up", [solo(o, [{ move: "fall" }])]) },
  { id: "fallBack", title: "Fall backward and get up", plan: (o) => plan("fall-back", "Fall backward and get up", [solo(o, [{ move: "fall", params: { direction: "back" } }])]) },
  { id: "punch", title: "Punch", plan: (o) => plan("punch", "Punch", [solo(o, [{ move: "punch" }])]) },
  { id: "kick", title: "Kick", plan: (o) => plan("kick", "Kick", [solo(o, [{ move: "kick" }])]) },
  { id: "wave", title: "Wave", plan: (o) => plan("wave", "Wave", [solo(o, [{ move: "wave" }])]) },
  { id: "highFive", title: "High-five (2 figures)", plan: (o) => plan("high-five", "High-five", pair(o, 240,
    [{ move: "highFive", params: { partnerDistance: 240 } }],
    [{ move: "highFive", params: { partnerDistance: 240 }, sync: { mark: "slap", at: "a.highFive1.slap" } }])) },
  { id: "pass", title: "Throw and catch (2 figures)", plan: (o) => plan("pass", "Throw and catch", pair(o, 560,
    [{ move: "throw", params: { object: "ball", to: "b" } }],
    [{ move: "catch", params: { object: "ball", from: "a" } }]), { objects: [{ id: "ball", look: ballLook("basketball"), heldBy: "a" }] }) },
  { id: "bounce", title: "Ball: bounce", plan: () => plan("bounce", "Bouncing ball", [], { objects: [{ id: "ball", look: ballLook("basketball"), keys: bounce({ x: 760 }, { height: 260, bounces: 4, groundY: GROUND, size: 48, dx: 400, fps: 24 }).keys }] }) },
  { id: "ballTricks", title: "Ball: slide, spin, grow", plan: () => {
    // Rolls along the ground, spins in place, grows big, shrinks back (the ground keeps it on the floor).
    const y = GROUND - 24;
    const a = slide({ x: 700, y }, { x: 1100, y }, 1.4, { rollSize: 48 });
    const b = spin({ x: 1100, y }, 2, 1.2, { t0: a.end + 0.3, startRotation: a.keys[a.keys.length - 1].rotation ?? 0 });
    const c = growShrink({ x: 1100, y }, 1, 1.8, 0.7, { t0: b.end + 0.2, rotation: b.keys[b.keys.length - 1].rotation ?? 0 });
    const d = growShrink({ x: 1100, y }, 1.8, 1, 0.6, { t0: c.end + 0.4, rotation: b.keys[b.keys.length - 1].rotation ?? 0 });
    return plan("ball-tricks", "Ball tricks", [], { objects: [{ id: "ball", look: ballLook("basketball"), keys: concatKeys(a.keys, b.keys, c.keys, d.keys) }] });
  } },
];

// Several moves chained, and figures timed to each other.
export const COMBO_TESTS: TestEntry[] = [
  { id: "walkTurnWalk", title: "Walk, turn around, walk back", plan: (o) => plan("walk-turn", "Walk, turn, walk back", [solo(o, [{ move: "walk", params: { distance: 420 } }, { move: "turn" }, { move: "walk", params: { distance: 420 } }])]) },
  // (Round 9: a run needs room to reach full speed and show its moment in the air for a few steps, so this
  // review uses a smaller figure, like parkour: about 6 body heights of running each way.)
  { id: "runStopTurnRun", title: "Run, stop, slowly turn, run back (best on a wide page)", plan: (o) => plan("run-turn", "Run, stop, turn, run back", [solo(o, [{ move: "run", params: { distance: 900 } }, { move: "stand", params: { seconds: 0.4 } }, { move: "turn", params: { slow: true } }, { move: "run", params: { distance: 900 } }])], { height: 150 }) },
  { id: "jogTurnJog", title: "Jog, turn around, jog back", plan: (o) => plan("jog-turn", "Jog, turn, jog back", [solo(o, [{ move: "jog", params: { distance: 600 } }, { move: "turn" }, { move: "jog", params: { distance: 600 } }])], { height: 200 }) },
  { id: "fight", title: "Jab, punch, kick", plan: (o) => plan("fight", "Jab, punch, kick", [solo(o, [{ move: "punch", params: { hand: "front" } }, { move: "punch" }, { move: "kick", params: { height: "high" } }])]) },
  { id: "longFight", title: "Long fight (ends out of breath)", plan: (o) => plan("long-fight", "Long fight", [solo(o, [
    { move: "punch" }, { move: "punch" }, { move: "kick" }, { move: "punch" }, { move: "punch" }, { move: "kick", params: { height: "high" } }, { move: "punch" },
  ])]) },
  { id: "meetHighFive", title: "Walk up and high-five (2 figures)", plan: (o) => plan("meet", "Walk up and high-five", pair(o, 240 + 2 * 300,
    [{ move: "walk", params: { distance: 300 } }, { move: "highFive", params: { partnerDistance: 240 } }],
    [{ move: "walk", params: { distance: 300 } }, { move: "highFive", params: { partnerDistance: 240 }, sync: { mark: "slap", at: "a.highFive1.slap" } }])) },
  { id: "passBack", title: "Pass a basketball back and forth (2 figures)", plan: (o) => plan("passing", "Passing a basketball", pair(o, 560,
    [{ move: "throw", params: { object: "ball", to: "b" } }, { move: "catch", params: { object: "ball", from: "b" } }, { move: "throw", params: { object: "ball", to: "b" } }],
    [{ move: "catch", params: { object: "ball", from: "a" } }, { move: "throw", params: { object: "ball", to: "a" } }, { move: "catch", params: { object: "ball", from: "a" } }]),
    { objects: [{ id: "ball", look: ballLook("basketball"), heldBy: "a" }] }) },
  { id: "longPass", title: "Long pass across the court and back (2 figures)", plan: (o) => plan("long-pass", "Long pass and back", pair(o, 1160,
    [{ move: "throw", params: { object: "ball", to: "b" } }, { move: "catch", params: { object: "ball", from: "b" } }],
    [{ move: "catch", params: { object: "ball", from: "a" } }, { move: "throw", params: { object: "ball", to: "a" } }]),
    { objects: [{ id: "ball", look: ballLook("basketball"), heldBy: "a" }] }) },
  { id: "rangeThenClose", title: "Overhand from range, step in, uppercut (2 figures)", plan: (o) => plan("range-close", "Punch from range, step in, uppercut", pair(o, 230,
    [{ move: "punch", params: { target: "b" } }, { move: "walk", params: { distance: 75 } }, { move: "punch", params: { target: "b" } }],
    [{ move: "stand", params: { seconds: 3.5 } }])) },
  // DAD'S TEST (round 7): the plan exactly as an AI director would write it (fightScene.ts).
  { id: "blockBlockHit", title: "Blue punches 3 times: Red blocks 2, the 3rd almost knocks him over (2 figures)", plan: (o) => blockBlockHitPlan({ hollowHead: o.hollowHead, neck: o.neck }) },
  // DASH PUNCH (round 10, dash.ts, Arthur's pictures 69-70): Red runs at Blue from far away, bends low,
  // dashes (under half a second in the air) and the fist lands as his front foot touches down; Blue takes it.
  { id: "dashPunch", title: "Dash punch (2 figures)", plan: (o) => plan("dash-punch", "Dash punch", pair(o, 1150,
    [{ move: "dashPunch", params: { target: "b" } }],
    [{ move: "getHit", params: { from: "a" } }])) },
  { id: "runGrabThrow", title: "Run, grab the ball, throw it (2 figures)", plan: (o) => plan("grab-throw", "Run, grab the ball, throw it", [
    { id: "a", name: "Runner", x: 560, facing: "right", look: lookOf(o), style: o.style, speed: o.speed, energy: o.energy, actions: [{ move: "run", params: { distance: 420 } }, { move: "pickUp", params: { object: "ball" } }, { move: "throw", params: { object: "ball", to: "b" } }] },
    { id: "b", name: "Catcher", x: 1500, facing: "left", look: partnerLook(o), style: o.style, speed: o.speed, energy: o.energy, actions: [{ move: "catch", params: { object: "ball", from: "a" } }] },
  ], { objects: [{ id: "ball", look: ballLook("basketball") }] }) },
  { id: "sneakRun", title: "Sneak, look back, run away", plan: (o) => plan("sneak", "Sneak, look back, run away", [solo(o, [
    { move: "walk", params: { distance: 260 }, style: "sneaky" }, { move: "lookBack", params: { seconds: 0.5 } }, { move: "run", params: { distance: 600 }, style: "natural", energy: 0.85 },
  ])]) },
  { id: "tripFall", title: "Run, trip and fall, get up", plan: (o) => plan("trip", "Run, trip and fall, get up", [solo(o, [{ move: "run", params: { distance: 450 } }, { move: "fallDown" }, { move: "wait", params: { seconds: 0.8 } }, { move: "getUp" }])]) },
  { id: "warmUp", title: "Squat, jump, sit down", plan: (o) => plan("warm-up", "Squat, jump, sit down", [solo(o, [{ move: "squat" }, { move: "jump" }, { move: "sit" }])]) },
  // GROUND FIGHTING (round 9, grapple.ts): Red slips and lands on his back; Blue walks round to where he
  // lies and stomps on him; Red sees it coming, covers up and is driven flat; then (round 11, FAST GET-UP IN
  // A FIGHT) he pushes back on his back, pushes up hard with his arms and is up facing Blue, hands out a little.
  { id: "groundFight", title: "Ground fight (2 figures)", plan: (o) => plan("ground-fight", "Ground fight: a stomp on the one who's down", pair(o, 380,
    [{ move: "wait", params: { seconds: 1.3 } }, { move: "stompDown", params: { target: "b" } }, { move: "guard" }],
    [{ move: "fallDown", params: { direction: "back" } }, { move: "coverUp", params: { from: "a" } }, { move: "kipUp" }])) },
  // GROUND FIGHT COUNTER (round 9): the same stomp, but Red is not beaten: he kips up fast straight into
  // his guard (coming up a fighting step from Blue) and punches back; Blue takes it.
  { id: "groundCounter", title: "Ground fight counter (2 figures)", plan: (o) => plan("ground-counter", "Ground fight: stomped, kip-up, punch back", pair(o, 380,
    [{ move: "wait", params: { seconds: 1.3 } }, { move: "stompDown", params: { target: "b" } }, { move: "guard" }, { move: "getHit", params: { from: "b" } }],
    [{ move: "fallDown", params: { direction: "back" } }, { move: "coverUp", params: { from: "a" } }, { move: "kipUp" }, { move: "punch", params: { target: "a", technique: "straight" } }])) },
  // Arthur's parkour test (round 7): "he runs, jumps in the air, lands, runs, jumps, lands, runs, jumps,
  // lands... then he's tired, breathing hard, maybe a hand on his knee". A wide shot (smaller figures), as
  // a director would frame a long action scene; on a narrow page the runs get too short and he hops instead.
  { id: "parkour", title: "Parkour: run, jump x3, tired (best on a wide page)", plan: (o) => plan("parkour", "Parkour: run, jump, run, jump, run, jump, tired", [solo(o, [
    { move: "run", params: { distance: 150 } }, { move: "jump" },
    { move: "run", params: { distance: 100 } }, { move: "jump" },
    { move: "run", params: { distance: 100 } }, { move: "jump" },
    { move: "run", params: { distance: 80 }, style: "tired" }, { move: "catchBreath" },
  ], 760)], { height: 135 }) },
  // NEW STORIES (round 10, Arthur: "give me two or three random combos I can visually understand, ones the engine
  // has never seen"). Each is a plan exactly as an AI director would write it; nothing says how it looks.
  { id: "storyJogHighFive", title: "New story 1: a happy jog over to a friend, high-five, both run off (2 figures)", plan: (o) => plan("story-1", "New story 1: jog over, high-five, both run off", pair({ ...o, style: "happy", energy: 0.7 }, 240 + 760,
    [{ move: "jog", params: { distance: 760 } }, { move: "highFive", params: { partnerDistance: 240 } }, { move: "turn" }, { move: "run", params: { distance: 420 } }],
    [{ move: "wave" }, { move: "highFive", params: { partnerDistance: 240 }, sync: { mark: "slap", at: "a.highFive1.slap" } }, { move: "turn" }, { move: "run", params: { distance: 420 } }])) },
  { id: "storyPassJog", title: "New story 2: pick up the ball, pass it, the friend jogs away with it (2 figures)", plan: (o) => plan("story-2", "New story 2: pick up, pass, jog away", [
    { id: "a", name: "Passer", x: 560, facing: "right", look: lookOf(o), style: o.style, speed: o.speed, energy: o.energy, actions: [{ move: "walk", params: { distance: 160 } }, { move: "pickUp", params: { object: "ball" } }, { move: "throw", params: { object: "ball", to: "b" } }, { move: "wave" }] },
    { id: "b", name: "Friend", x: 1400, facing: "left", look: partnerLook(o), style: o.style, speed: o.speed, energy: o.energy, actions: [{ move: "catch", params: { object: "ball", from: "a" } }, { move: "turn" }, { move: "jog", params: { distance: 400 } }] },
  ], { objects: [{ id: "ball", look: ballLook("basketball") }] }) },
  { id: "storyBadDay", title: "New story 3: a bad day: kick the floor, stomp, jog off, trip, get up angry", plan: (o) => plan("story-3", "New story 3: a bad day", [solo(o, [
    { move: "walk", params: { distance: 180 }, style: "sad" }, { move: "kick", params: { height: "low" }, style: "angry" }, { move: "stomp", style: "angry" },
    { move: "jog", params: { distance: 260 }, style: "irritated" }, { move: "fallDown" }, { move: "getUp" }, { move: "stomp", style: "angry" },
  ], 700)]) },
];

// SURPRISE (review only): a random combo nobody wrote — a few moves picked from the library in a random
// order with random distances, sometimes a different style or speed for one move. Nothing here says how
// any of it looks: the engine works it all out from its rules (Arthur, 2026-10-04: "create animations
// that I've never told the engine before").
// (Moves that need a partner or an object, or only make sense after something else, aren't picked.)
// (Blocking or almost falling with nobody hitting makes no sense alone: they are partner moves.)
// (D10, round 10: a dash punch is aimed at another figure: not a solo move.)
const NOT_SOLO = new Set(["highFive", "throw", "catch", "pickUp", "getUp", "stand", "catchBreath", "block", "almostFall", "stompDown", "groundPunch", "coverUp", "kipUp", "dashPunch"]);
export function surprisePlan(seed: number, o: TestLook): ScenePlan {
  let state = Math.floor(Math.abs(seed)) % 2147483647 || 1;
  const random = () => (state = (state * 48271) % 2147483647) / 2147483647;
  const pick = <T,>(list: readonly T[]) => list[Math.floor(random() * list.length)];
  const ids = Object.keys(LIBRARY).filter((id) => !NOT_SOLO.has(id));
  const actions: Action[] = [];
  const names: string[] = [];
  for (let i = 0, n = 3 + Math.floor(random() * 3); i < n; i += 1) {
    const id = pick(ids);
    const params: Record<string, unknown> = {};
    if (id === "walk" || id === "jog" || id === "run") params.distance = 150 + Math.round(random() * 450);
    if (id === "punch") params.power = Math.round(random() * 100) / 100;
    if (id === "jump" && random() < 0.5) params.distance = Math.round(random() * 220);
    const knobs = random() < 0.25 ? { style: pick(MOVE_STYLES_LIST), speed: pick(MOVE_SPEEDS_LIST) } : {};
    actions.push({ move: id, params, ...knobs });
    if (id === "fallDown") actions.push({ move: "getUp" });
    names.push(LIBRARY[id].title.toLowerCase() + ("style" in knobs ? ` (${knobs.style})` : ""));
  }
  // About half the presses are two figures doing something together (Arthur, round 7: harder random
  // tests), with a random move of their own afterwards.
  if (random() < 0.5) return surprisePair(seed, o, random, pick);
  const title = `Random combo: ${names.join(" → ")}`;
  return plan(`surprise-${seed}`, title, [solo(o, actions)]);
}

// Two figures: a high-five (maybe walking up first) or passing a ball (throws, bounce passes, hand-offs,
// whatever the distance makes it), then one more move each. The engine decides every how.
const AFTER_MOVES = ["wave", "jump", "squat", "sit", "lookBack", "punch", "kick", "turn"] as const;
function surprisePair(seed: number, o: TestLook, random: () => number, pick: <T>(list: readonly T[]) => T): ScenePlan {
  // (Round 11: some of them are a FIGHT — on dice of their own, so the other combos stay what they were.)
  if (((Math.floor(Math.abs(seed)) * 16807 + 7) % 2147483647) / 2147483647 < 0.35) return surpriseFight(seed, o, random, pick);
  const names: string[] = [];
  const knobs = () => (random() < 0.4 ? { style: pick(MOVE_STYLES_LIST), speed: pick(MOVE_SPEEDS_LIST) } : {});
  const after = (who: string): Action[] => {
    if (random() < 0.3) return [];
    const id = pick(AFTER_MOVES);
    names.push(`${who} ${LIBRARY[id].title.toLowerCase()}`);
    return [{ move: id, ...knobs() }];
  };
  let a: Action[], b: Action[], gap: number, objects: ScenePlan["objects"];
  if (random() < 0.5) {
    const walk = random() < 0.5 ? 100 + Math.round(random() * 200) : 0;
    gap = 200 + Math.round(random() * 100);
    const pre: Action[] = walk ? [{ move: "walk", params: { distance: walk }, ...knobs() }] : [];
    names.push(walk ? "walk up and high-five" : "high-five");
    a = [...pre, { move: "highFive", params: { partnerDistance: gap } }];
    b = [...pre, { move: "highFive", params: { partnerDistance: gap }, sync: { mark: "slap", at: "a.highFive1.slap" } }];
    gap += 2 * walk;
  } else {
    gap = 240 + Math.round(random() * 700);
    const passes = 1 + Math.floor(random() * 3);
    a = []; b = [];
    for (let k = 0; k < passes; k += 1) {
      const bounce = random() < 0.25;
      const [thrower, catcher, from, to] = k % 2 === 0 ? [a, b, "a", "b"] : [b, a, "b", "a"];
      thrower.push({ move: "throw", params: { object: "ball", to, ...(bounce ? { bounce: true } : {}) } });
      catcher.push({ move: "catch", params: { object: "ball", from } });
    }
    names.push(`pass the ball ${passes === 1 ? "once" : `${passes} times`}`);
    objects = [{ id: "ball", look: ballLook("basketball"), heldBy: "a" }];
  }
  a.push(...after("left:"));
  b.push(...after("right:"));
  return plan(`surprise-${seed}`, `Random combo (2 figures): ${names.join(" → ")}`, pair(o, gap, a, b), objects ? { objects } : {});
}
// A FIGHT nobody described (round 11): one walks in on the other and strikes once or twice (a big last
// shot, sometimes meant to put the other down) — and that is all the "user" said, so the plan is VAGUE
// (`fillIn`): the engine fills in what comes next (followUp.ts: press the advantage, the other answers).
function surpriseFight(seed: number, o: TestLook, random: () => number, pick: <T>(list: readonly T[]) => T): ScenePlan {
  const gap = 300 + Math.round(random() * 300);
  const [att, def] = random() < 0.5 ? ["a", "b"] : ["b", "a"];
  const strikes: Action[] = random() < 0.5 ? [{ move: "punch", params: { target: def, technique: "straight" } }] : [];
  const big = random() < 0.55;
  strikes.push(big ? { move: "kick", params: { target: def, height: pick(["mid", "high"]) } } : { move: "punch", params: { target: def, technique: pick(["power", "overhand"]) } });
  const down = random() < 0.6;
  const hits: Action[] = strikes.map((_, i) => ({ move: "getHit", params: { from: att, ...(i === strikes.length - 1 && down ? { result: "knockdown" } : {}) } }));
  const [a, b] = att === "a" ? [strikes, hits] : [hits, strikes];
  const who = att === "a" ? "Left" : "Right";
  const title = `Random combo (2 figures): a fight — ${who} ${strikes.map((s) => (s.move === "kick" ? "kicks" : "punches")).join(", ")}`;
  return plan(`surprise-${seed}`, title, pair(o, gap, a, b), { fillIn: true });
}
export function makeSurpriseScene(seed: number, look: TestLook, stageWidth?: number): Scene {
  // (A vague fight is filled in on the page it will be shown on: FILL IN A VAGUE FIGHT, followUp.ts.)
  const p = fillInFight(surprisePlan(seed, look), seed, stageWidth);
  return stageWidth === undefined ? planToScene(p, LIBRARY) : fitPlanToPage(p, LIBRARY, stageWidth);
}

export const findTest = (id: string) => [...SINGLE_MOVE_TESTS, ...COMBO_TESTS].find((t) => t.id === id);

// Build a test scene, fitted to the page (it covers less ground on a narrow page; figures keep their size).
export function makeTestScene(id: string, look: TestLook, stageWidth?: number): Scene {
  const entry = findTest(id);
  if (!entry) throw new Error(`Unknown test "${id}"`);
  const p = entry.plan(look);
  return stageWidth === undefined ? planToScene(p, LIBRARY) : fitPlanToPage(p, LIBRARY, stageWidth);
}
