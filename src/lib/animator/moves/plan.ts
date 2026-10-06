import { buildScene, type CharacterKey, type ObjectHand, type ObjectKey, type ObjectLook, type ObjectSegment, type Scene, type SceneObject } from "../engine.ts";
import { bouncePassTime, carryWeight, defaultApex, heldCenter } from "../objects.ts";
import type { PoseAngles } from "../rig.ts";
import { flightTime } from "../objectMoves.ts";
import { animationBounds } from "../stageFit.ts";
import { DEFAULT_STYLE, jointRange, STAND, type CharacterStyle, type Facing } from "../rig.ts";
import { forwardKinematics } from "../pose.ts";
import { buildGait, naturalDistance, naturalWalkPace, type GaitKind } from "./gait.ts";
import { chainMoves } from "./sit.ts";
import { travel } from "./squat.ts";
import { footPlanter } from "./planted.ts";
import { beatsToKeys, forwardSign, lerpPose, type MoveOutput, type MoveSettings, type Stance } from "./motion.ts";
import { eyesOf, lookTarget } from "./gaze.ts";
import { ARM_TURN_MAX, armTurn, highFiveMaxDistance, turnsLess } from "./highFive.ts";
import type { MoveSpeed, MoveStyle } from "./styles.ts";
import { grabJoint, grabPoint, pickUpEnd, type PickUpParams } from "./pickUp.ts";
import { AWAY_ANGLE, AWAY_SPEED, ballCenter, catchPoint, HANDOFF_SHOWN, HOLD_BALL, isHandOff, releaseHeight, type ThrowParams } from "./throwCatch.ts";
import { catchBreath, feetMustMove, onTheGround, restPoseFor, shuffle, stanceDifference, stand, stepInto, turn, TURN_ABOUT } from "./turn.ts";
import { ARMS_AHEAD, HURT_STYLE_AT, asGetHit, BLOCKED, FIGHT_GAP, fightReadyPose, relaxedPose, RELAX_AFTER, HEAD_SPACE, IN_RANGE, slumpReach, guardUp, hurtSettings, isFighter, fightSteps, kickReach, PERSONAL_SPACE, strikePowerOf, takeDamage, walkIntoGuard, readyFeet, canSettle, standReadyPose } from "./hit.ts";
import { blendPose, choosePunch, feetOf, fightRest, REALLY_TIRED } from "./punch.ts";
import { GROUND_ATTACKS, GROUND_MOVES, groundApproach, groundStandAt, kipUpClear, type Other } from "./grapple.ts";
import { groundPunchStandAt } from "./groundPunch.ts";
import { dashSpan } from "./dash.ts";

// SPEC-0017 Phase 2: the scene plan — what the AI director will write in Phase 3. Each character gets a
// list of actions ("walk 400 px, turn around, run back"); every action starts exactly where the last one
// ended, so moves chain into one continuous performance. Actions can be timed to another character's
// moment ("catch when the ball arrives", "high-five together"). The engine still makes every frame.

export type MoveFn = (start: Stance, params: Record<string, unknown>, settings: MoveSettings) => MoveOutput;
export type MoveEntry = {
  title: string;
  run: MoveFn;
  // Moves that need a side view (left/right). If the figure faces the viewer, it turns first.
  side?: boolean;
  // A short description for the AI's lessons.
  about: string;
};

export type Action = {
  move: string; // a library move id, or "wait"
  params?: Record<string, unknown>;
  // Per-action overrides of the character's style / speed / energy ("a powerful punch").
  style?: MoveStyle;
  speed?: MoveSpeed;
  energy?: number;
  // Line this action up so its mark `mark` happens at another moment: `at` = "<characterId>.<mark>"
  // (+ offset seconds). The character waits (breathing) until then.
  sync?: { mark: string; at: string; offset?: number };
};

export type CharacterPlan = {
  id: string;
  name?: string;
  x: number; // hip x at the start
  facing: Facing;
  look?: Partial<CharacterStyle>;
  style?: MoveStyle;
  speed?: MoveSpeed;
  energy?: number;
  // FIGHT LOOK: "realistic" = a real boxing/MMA guard between strikes (only when the user asks for
  // realistic, educational fighting); "high" = loose, hands up at the chest (asked for higher hands);
  // otherwise fighters stand loose, hands low (punch.ts LOOSE).
  guard?: "loose" | "high" | "realistic";
  actions: Action[];
};

// An object in the scene (a ball, a box). It can start in someone's hands (`heldBy`) and be passed with
// "throw" / "catch" actions, or move on its own with keys (bounce, slide, spin, grow — see objectMoves.ts).
export type ObjectPlan = { id: string; name?: string; look: ObjectLook; heldBy?: string; joint?: ObjectHand; keys?: ObjectKey[] };

// `until` (seconds, optional): nobody starts a new action after this time (a director trying out a long
// plan to see where it gets to).
// `stageWidth` (optional): how wide the page is (stage px; fitPlanToPage fills it), so moves that need room
// (a knock-down) know how much there is.
// `lengthScale` (set by fitPlanToPage): how far the page fit has shrunk the ground the plan covers; ground
// the planner adds by itself (an accident's steps before a trip) shrinks with it.
export type ScenePlan = { id: string; title: string; height: number; groundY: number; characters: CharacterPlan[]; objects?: ObjectPlan[]; until?: number; stageWidth?: number; lengthScale?: number; fillIn?: boolean };
// (`fillIn`: the user only asked for something vague — "a fight" — so the engine fills in what comes next: followUp.ts.)

// A throw or catch of an object, for working out who holds it when.
// (A release can be a bounce pass, or a throw away: `away` = the launch velocity, px/s.)
// (`handOff`: a release or catch that is part of a hand-off: the ball goes straight from hands to hands.)
// (`drop`: let go of without a throw — to catch a fall — with the body's velocity: it drops, bounces and
// rolls to a stop.)
type ObjectEvent = { object: string; kind: "release" | "catch" | "oneHand" | "grab" | "twoHands"; t: number; character: string; joint?: ObjectHand; at?: { x: number; y: number }; bounce?: boolean; away?: { vx: number; vy: number }; handOff?: boolean; drop?: { vx: number; vy: number } };

const GAP = 1e-4;
// The shortest calm settle into the resting stand while waiting (seconds).
const MIN_REST_SETTLE = 0.2;
// How long hands holding something take to lift it into the carry when a walk, jog or run starts.
const CARRY_LIFT = 0.3;
// x height: how far a fight may drift off a fighter's spot before it goes back to it (FIGHT FROM WHERE YOU ARE).
const SPOT_DRIFT = 1.6;
// x height: how far back from the hips of the one lying there a ground attacker steps off (STEP OFF).
const STEP_OFF = 0.9;
// CARRY BY WEIGHT: a light thing in one hand down at the side, against the hip (shoulder, elbow degrees);
// how much of the gait's own arm swing that arm keeps; heavy: how much lower both arms hold it, and how far
// the body leans back (degrees).
const CARRY_SIDE = { shoulder: 4, elbow: 14 };
const CARRY_SWAY = 0.3;
const HEAVY_LOWER = 40;
const HEAVY_LEAN = 4;

// How tiring each move is (a long fight or sprint adds up; resting takes it away).
const EFFORT: Record<string, (p: Record<string, unknown>) => number> = {
  punch: () => 1, kick: () => 1.5, jump: () => 1.2, throw: () => 0.5, fall: () => 1, fallDown: () => 1, stompDown: () => 1.2,
  run: (p) => Number(p.distance ?? 300) / 600,
};
const TIRED_AFTER = 4.5;

// Walking and running, as chainable moves (they start and end standing, like every move).
function gaitMove(kind: GaitKind): MoveFn {
  return (start, params, settings) => {
    const distance = Math.max(0, Number(params.distance ?? 300));
    // GO FROM WHERE YOU ARE (Arthur, round 5: "he's still in the sneaky pose, but then he runs and
    // transitions into a running pose"): a body that isn't standing (crouched from a sneak, bent from a
    // look round) doesn't stand up first. It starts going at once, and its posture fades into the walk's or
    // run's own over the first step: the lean, head and arms all the way through it, the bent legs while
    // both feet are still down (it pushes off out of the crouch).
    // (CARRY BY WEIGHT, below: something heavy makes the steps slower and shorter.)
    const heavy = Boolean(params.carrying) && params.carryWeight === "heavy";
    const g = buildGait({ kind, startX: start.x, distance, direction: forwardSign(start.facing) as 1 | -1, height: settings.height, startT: start.t, style: settings.style, speed: heavy ? "slow" : settings.speed, energy: heavy ? Math.min(0.35, settings.energy ?? 0.5) : settings.energy, keepLean: Boolean(params.keepLean) });
    if (travel(start.pose, STAND) > 0.02) {
      const firstLift = g.keys.findIndex((k) => (k.contacts ?? []).length < 2);
      const window = Math.max(0.25, (firstLift > 0 ? g.keys[firstLift].t - start.t : 0.3) + 0.3);
      // (Round 7: the bent legs are all the way into the gait's own by the moment the first foot lifts, so
      // the push-off doesn't snap the hips back and up in one frame.)
      const legWindow = firstLift > 0 ? Math.max(1e-6, g.keys[firstLift].t - start.t) : window;
      const from = start.pose;
      g.keys = g.keys.map((k, i) => {
        const w = 1 - smoothstep01((k.t - start.t) / window);
        if (w <= 0) return k;
        const pose = { ...k.pose };
        for (const name of ["lean", "head", "lShoulder", "rShoulder", "lElbow", "rElbow"] as const) pose[name] = k.pose[name] + (from[name] - k.pose[name]) * w;
        const wLegs = 1 - smoothstep01((k.t - start.t) / legWindow);
        if (firstLift < 0 || i < firstLift) for (const name of ["lHip", "rHip", "lKnee", "rKnee"] as const) pose[name] = k.pose[name] + (from[name] - k.pose[name]) * wLegs;
        return { ...k, pose };
      });
    }
    // CARRYING (round 6): hands that hold something (a ball) keep holding it at the chest while the legs
    // walk or run; they don't swing it about. (The planner sets `carrying` while the figure holds something.)
    // (HOLDING SIZE: `carrying` = the held thing's size, px: the arms hold it one grip from its centre.)
    // CARRY BY WEIGHT (round 11, Arthur: "I was expecting him to walk away and the only difference is he's
    // holding a basketball... the arm should not be sticking out"): the planner says how heavy it is
    // (`carryWeight`, objects.ts carryWeight). LIGHT, in one hand (`carryHand`): that arm hangs down at the
    // side with the thing against the hip (a little of the gait's swing), the other arm swings exactly as
    // in the gait, legs and lean unchanged. MEDIUM: both hands close against the body, not swinging (the
    // hold above). HEAVY: both arms low against the body, slower shorter steps, leaning back a little.
    const oneHand = params.carryWeight === "light" && (params.carryHand === "l" || params.carryHand === "r") ? (params.carryHand as "l" | "r") : null;
    const hold = params.carrying ? holdArms(typeof params.carrying === "number" ? params.carrying : undefined, settings.height) : null;
    const carry = !hold ? null : oneHand ? { [`${oneHand}Shoulder`]: CARRY_SIDE.shoulder, [`${oneHand}Elbow`]: CARRY_SIDE.elbow } as Partial<PoseAngles>
      : heavy ? { lShoulder: hold.lShoulder - HEAVY_LOWER, rShoulder: hold.rShoulder - HEAVY_LOWER, lElbow: hold.lElbow, rElbow: hold.rElbow } : hold;
    // (...and hands holding it differently — after a catch, a turn — go into the carry over the first
    // steps: CARRY_LIFT seconds, never in one picture.)
    if (carry) {
      const from = start.pose;
      g.keys = g.keys.map((k) => {
        const w = 1 - smoothstep01((k.t - start.t) / CARRY_LIFT);
        const pose = { ...k.pose };
        for (const [name, angle] of Object.entries(carry) as [keyof PoseAngles, number][]) {
          // (The light carrying arm keeps a little of the gait's own swing: a relaxed arm, not a stiff one.)
          const target = oneHand && name === `${oneHand}Shoulder` ? angle + CARRY_SWAY * k.pose[name] : angle;
          pose[name] = target + (from[name] - target) * w;
        }
        // (Heavy: lean back a little; hips and arms turn with it so the feet and the hold stay put.)
        if (heavy) {
          const back = HEAVY_LEAN * (1 - w);
          pose.lean -= back; pose.lHip -= back; pose.rHip -= back;
        }
        return { ...k, pose };
      });
    }
    // The last key only eases into the plain stand: if something follows (grab, punch...), it can start
    // as soon as the feet have stopped.
    const stopped = g.keys[g.keys.length - 2];
    const flow = stopped ? { keys: g.keys.length - 1, stance: { t: stopped.t, x: stopped.x, facing: start.facing, pose: stopped.pose } } : undefined;
    return { keys: g.keys, end: { t: g.endT, x: g.endX, facing: start.facing, pose: carry ? g.keys[g.keys.length - 1].pose : STAND }, marks: { arrived: stopped?.t ?? g.endT }, flow };
  };
}

export const BASE_MOVES: Record<string, MoveEntry> = {
  walk: { title: "Walk", run: gaitMove("walk"), side: true, about: "Walk forward `distance` px: gentle start (arm swings small, growing each step), steady steps with the arms passing every step, gentle stop (swings shrinking into the stand). Followed by a fall = a trip at walking speed." },
  jog: { title: "Jog", run: gaitMove("jog"), side: true, about: "Jog forward `distance` px: the in-between speed, nearly twice walking speed, with a short low hop each step (well under half a second, feet just off the floor). Soft knees with a small bounce on each landing, a low knee lift and heel kick, arms bent near 90 degrees pumping small. For going somewhere a bit faster without hurrying; `run` is for a real hurry. Followed by a fall = a trip at jogging speed." },
  run: { title: "Run", run: gaitMove("run"), side: true, about: "Run forward `distance` px: a hard push-off (strides and arm swings grow over the first steps, full swing by the second), long strides with a clear moment in the air every step (AIRBORNE: both feet clearly off the ground, the back heel kicked up, the front knee driven up high; the legs and arms pass each other only while a foot is down), loose arms swinging as far forward as back (elbow bends in front, opens behind), quick slow-down (swings shrinking). Each step lasts at least 0.34 s so it can be seen. Followed by a fall = a trip at full speed (no stopping first)." },
  turn: { title: "Turn around", run: (s, p, set) => turn(s, p as { to?: Facing; slow?: boolean }, set), about: TURN_ABOUT },
  stand: { title: "Stand (breathe)", run: (s, p, set) => stand(s, { seconds: Number(p.seconds ?? 2) }, set), about: "Stand still for `seconds`, breathing." },
  catchBreath: { title: "Catch breath", run: (s, p, set) => catchBreath(s, p as { seconds?: number }, set), about: "Out of breath: bend over (hips back, knees bent, so the weight stays over the feet), hands on knees, breathe hard, then straighten into a tired stand. Added automatically after a lot of effort." },
};

// Build every character's keys from the plan. Characters whose actions are timed to others are built
// after the ones they depend on.
export function planToScene(plan: ScenePlan, moves: Record<string, MoveEntry>): Scene & { marks: Record<string, number>; hurt: Record<string, number>; power: Record<string, number> } {
  // ("block" and "almostFall" are getHit with that result: they count as hits taken.)
  plan = { ...plan, characters: plan.characters.map((c) => ({ ...c, actions: c.actions.map(asGetHit) })) };
  const marks: Record<string, number> = {};
  const events: ObjectEvent[] = [];
  const built = new Map<string, CharacterKey[]>();
  if (MOVE_CACHE.size > 4000) MOVE_CACHE.clear();
  const fight: FightState = { keys: new Map(), power: {}, hurt: {}, reactions: {}, done: new Set(), cache: MOVE_CACHE, handOffs: new Map(), closings: new Map(), earliest: {} };
  const pending = [...plan.characters];
  // BACK AND FORTH: when two figures wait on each other's moments in turn (a fight: A hits, B reacts, A
  // waits for B to be ready, ...), each round of building gets one exchange further; keep going while
  // anything new is learned.
  for (let pass = 0, known = -1; pending.length > 0 && pass < 400; pass += 1) {
    const before = pending.length;
    for (let i = 0; i < pending.length; i += 1) {
      const character = pending[i];
      const keys = buildCharacter(plan, character, moves, marks, events, false, fight);
      if (!keys) continue; // waiting on another character's moments
      built.set(character.id, keys);
      fight.done?.add(character.id);
      pending.splice(i, 1);
      i -= 1;
    }
    const now = Object.keys(marks).length;
    if (pass >= plan.characters.length + 1 && pending.length === before && now === known) break;
    known = now;
  }
  // Any leftover timing loop: build ignoring the syncs.
  for (const character of pending) built.set(character.id, buildCharacter(plan, character, moves, marks, events, true, fight)!);
  // SETTLE (fights): each figure was built from what it knew of the other at the time (where they stood,
  // when their punches landed). Build everyone again with the whole picture until nothing changes, so
  // every reaction happens exactly when its hit lands.
  // (Ground fighting too, grapple.ts: the one on top aims at where the other really lies.)
  const fighting = plan.characters.some((c) => c.actions.some((a) => a.move === "getHit" || a.move === "spunThrown" || GROUND_MOVES.has(a.move) || (STRIKES.has(a.move) && typeof a.params?.target === "string")));
  // (Passing a ball too: a giver holds it out until the taker's hands are on it, and the taker reaches
  // when it is held out — each needs the other's moment, so they settle the same way.)
  const passing = plan.characters.some((c) => c.actions.some((a) => a.move === "catch" && typeof a.params?.from === "string"));
  for (let round = 0; (fighting || passing) && round < 12; round += 1) {
    const before = { ...marks };
    // (...and where everyone stands: round 16, a punch aimed at where the other stood in the last round — the
    // other then moved, the moments didn't — landed from half the page away, "hit before the hit".)
    const posOf = () => JSON.stringify([...built.entries()].map(([id, ks]) => [id, ks.map((k) => Math.round(k.x / 3))]));
    const beforePos = posOf();
    for (const character of plan.characters) {
      const theirs = events.filter((e) => e.character !== character.id);
      const keys = buildCharacter(plan, character, moves, marks, theirs, false, fight);
      if (!keys) continue;
      events.splice(0, events.length, ...theirs);
      built.set(character.id, keys);
    }
    // (Settled: no moment moved by more than a microsecond — rounding noise doesn't count.)
    if (Object.keys(marks).length === Object.keys(before).length && Object.entries(marks).every(([k, v]) => Math.abs((before[k] ?? Infinity) - v) < 1e-6) && posOf() === beforePos) break;
  }
  const end = Math.max(...[...built.values()].map((keys) => keys[keys.length - 1].t), ...(plan.objects ?? []).flatMap((o) => (o.keys ?? []).map((k) => k.t)));
  // The scene lasts a little past the last move (rounded to a tenth of a second); everyone and everything
  // stays as it is until then (a held ball stays held to the very last frame).
  const duration = Math.ceil((end + 0.25) * 10) / 10;
  return {
    id: plan.id, title: plan.title, groundY: plan.groundY, durationSec: duration, marks,
    // How hurt each figure ends up (DAMAGE, 0 fine .. 1 beaten).
    hurt: fight.hurt ?? {},
    // How hard each strike was (STRIKE POWER, by "<id>.strike<k>").
    power: fight.power,
    characters: plan.characters.map((c) => ({
      id: c.id, name: c.name ?? c.id, facing: c.facing, height: plan.height, style: { ...DEFAULT_STYLE, ...c.look },
      // Everyone stays in their final pose until the scene ends.
      keys: holdTo(built.get(c.id)!, duration),
    })),
    objects: (plan.objects ?? []).map((o) => objectOf(o, events, duration)),
  };
}

// Who holds an object when: held by its first holder until they let go, then in flight until it is
// caught, then held by the catcher, and so on.
function objectOf(plan: ObjectPlan, events: ObjectEvent[], end: number): SceneObject {
  const segments: ObjectSegment[] = [];
  let joint: ObjectHand = plan.joint ?? "hands";
  let holder = plan.heldBy, since = 0, released: number | null = null, bounce = false;
  let keys = plan.keys ?? [];
  // (At the same moment, letting go comes before catching.)
  const order = (e: ObjectEvent) => (e.kind === "catch" ? 1 : 0);
  for (const e of events.filter((ev) => ev.object === plan.id).sort((a, b) => a.t - b.t || order(a) - order(b))) {
    if (e.kind === "release" && e.handOff) {
      // HAND-OFF (the contact rule): the giver keeps it in its hands until the taker's hands are on it.
    } else if (e.kind === "catch" && e.handOff && holder && holder !== e.character && released === null) {
      // ...then it goes straight from the giver's hands into the taker's: no flight, never floating.
      segments.push({ from: since, to: e.t, mode: "held", character: holder, joint });
      holder = e.character; since = e.t; joint = plan.joint ?? "hands";
    } else if (e.kind === "grab" && !holder && released === null) {
      // Lying on the ground exactly where the hand will reach it, until it's picked up.
      if (keys.length === 0 && e.at) keys = [{ t: 0, x: e.at.x, y: e.at.y }];
      holder = e.character; since = e.t; joint = e.joint ?? "hands";
    } else if (e.kind === "twoHands" && holder === e.character && released === null) {
      segments.push({ from: since, to: e.t, mode: "held", character: holder, joint });
      since = e.t; joint = "hands";
    } else if (e.kind === "oneHand" && holder === e.character && released === null) {
      // The thrower takes the ball in the throwing hand for the wind-up.
      segments.push({ from: since, to: e.t, mode: "held", character: holder, joint });
      since = e.t; joint = e.joint ?? "rHand";
    } else if (e.kind === "release" && holder && released === null) {
      segments.push({ from: since, to: e.t, mode: "held", character: holder, joint });
      holder = undefined; released = e.t; bounce = e.bounce === true;
      // DROPPED (LET GO TO CATCH THE FALL): nobody catches it; it falls, bounces and rolls to a stop, and
      // lies there to the end (objects.ts).
      if (e.drop) { segments.push({ from: e.t, to: Math.max(end, e.t), mode: "flight", drop: e.drop }); released = null; }
      // THROWN AWAY: nobody will catch it. It flies on under gravity until it is surely off the page, then
      // it is gone (it never comes back by itself; while leaving it doesn't count for the page fit).
      if (e.away) {
        segments.push({ from: e.t, to: e.t + Math.min(2.5, Math.max(0.6, AWAY_CLEAR / Math.max(1, Math.abs(e.away.vx)))), mode: "flight", away: e.away });
        released = null;
      }
    } else if (e.kind === "catch" && released !== null) {
      segments.push({ from: released, to: e.t, mode: "flight", ...(bounce ? { bounce } : {}) });
      holder = e.character; since = e.t; released = null; joint = plan.joint ?? "hands";
    }
  }
  if (holder) segments.push({ from: since, to: end, mode: "held", character: holder, joint });
  return { id: plan.id, name: plan.name ?? plan.id, look: plan.look, keys, segments };
}

// Where a ball held out in both hands is at time t, from the giver's keys (the engine's own holding rule,
// throwCatch.ts ballCenter).
function heldBall(keys: CharacterKey[] | undefined, t: number, facing: Facing, plan: ScenePlan, object: string) {
  if (!keys?.length) return undefined;
  const key = keys.reduce((best, k) => (Math.abs(k.t - t) < Math.abs(best.t - t) ? k : best), keys[0]);
  if (Math.abs(key.t - t) > 0.02) return undefined;
  const size = plan.objects?.find((o) => o.id === object)?.look.size;
  return ballCenter(key.pose, key.facing ?? facing, key.x, plan.height, plan.groundY, "hands", size, key.lift ?? 0);
}

// A ball thrown away flies until it is this far (px) along: off any page.
const AWAY_CLEAR = 2000;
// Thrown away: launched forward and up at an overhand's speed (throwCatch.ts AWAY_SPEED, AWAY_ANGLE).
const awayVelocity = (facing: Facing, height: number) => {
  const speed = AWAY_SPEED * height, a = (AWAY_ANGLE * Math.PI) / 180;
  return { vx: forwardSign(facing) * speed * Math.cos(a), vy: -speed * Math.sin(a) };
};

const holdTo = (keys: CharacterKey[], t: number) => {
  const last = keys[keys.length - 1];
  return last.t >= t - GAP ? keys : [...keys, { ...last, t, ease: undefined }];
};

// What the figures in a fight know about each other while the scene is built: where each one is (its
// keys so far) and how hard each strike was (STRIKE POWER, by "<id>.strike<k>").
// (`handOffs`: whether each pass "<id>.throw<k>" is a hand-off, as first worked out.)
// (`closings`: how far each fighter steps in or back before its strike "<id>.strike<k>", as last worked out;
// `earliest`: the soonest "<id>.strike<k>" can land and still be reacted to right on its hit.)
type FightState = { keys: Map<string, CharacterKey[]>; power: Record<string, number>; hurt?: Record<string, number>; reactions?: Record<string, { down: boolean; out: boolean; ready: number; open?: number }>; done?: Set<string>; cache?: Map<string, unknown>; handOffs?: Map<string, boolean>; closings?: Map<string, number>; earliest?: Record<string, number> };
const STRIKES = new Set(["punch", "kick"]);
// (IN REACH FIRST: hip to hip, x height, a barrage starts from — barrage.ts's own default distance.)
const BARRAGE_FROM = 0.67;
// Moves where the hands are needed to catch the body (a held thing is not clutched through them).
const FALLS = new Set(["fall", "fallDown", "getUp"]);
// HOLD ON TO IT (round 8, Arthur: "as long as you're holding it, visually it should be holding it"):
// moves whose arms only help the body — balance (a kick, squat, jump, stomp, a look round), a hand
// put down on the floor or a knee (sitting, catching its breath), a guard — don't need the hands: holding
// something, the figure keeps it in both hands at the chest through them. (A move that DOES something
// with one hand — a wave, a punch, a high-five — takes the thing in the other hand: HANDS BUSY.)
const HANDS_ONLY_HELP = new Set(["sit", "squat", "kick", "jump", "stomp", "catchBreath", "lookBack", "guard", "getHit", "block", "almostFall"]);
// HOLDING SIZE (round 8): the arms hold a thing at the chest one grip from its centre — a small ball with
// the hands close together, a big box with them wide apart (pickUp.ts pickUpEnd; a basketball = HOLD_BALL).
const holdPose = (size: number | undefined, height: number) => (size === undefined ? HOLD_BALL : pickUpEnd({ size }, height));
function holdArms(size: number | undefined, height: number) {
  const p = holdPose(size, height);
  return { lShoulder: p.lShoulder, rShoulder: p.rShoulder, lElbow: p.lElbow, rElbow: p.rElbow };
}
// OFF THE FLOOR (round 8): a thing held at the chest never goes through the floor — bending low (a deep
// squat, sitting) with something big, the arms lift it in front (both shoulders turn forward together,
// the hold itself unchanged) just enough to clear the floor.
function liftOffFloor(keys: CharacterKey[], facing: Facing, plan: ScenePlan, look: ObjectLook): CharacterKey[] {
  const half = look.size / 2, clear = plan.groundY - 0.01 * plan.height;
  return keys.map((k, i) => {
    if (i === 0) return k;
    let pose = k.pose;
    for (let turn = 0; turn < 120; turn += 3) {
      const c = ballCenter(pose, k.facing ?? facing, k.x, plan.height, plan.groundY, "hands", look.size, k.lift ?? 0);
      if (c.y + half <= clear) break;
      const lifted = { ...k.pose, lShoulder: k.pose.lShoulder + turn + 3, rShoulder: k.pose.rShoulder + turn + 3 };
      // (Shoulders turn freely; the elbows must stay within their range for the new arm angle.)
      if ((["lElbow", "rElbow"] as const).some((name) => { const [lo, hi] = jointRange(lifted, name); return lifted[name] < lo - 1e-6 || lifted[name] > hi + 1e-6; })) break;
      pose = lifted;
    }
    return pose === k.pose ? k : { ...k, pose };
  });
}
// Moves that go down from standing (a walk or run arrives straight into them).
const GOES_DOWN = new Set(["pickUp", "squat", "sit"]);
// Moves that do their own thing with a held object (or carry it: walking, running, waiting).
const HANDLES_OBJECTS = new Set(["throw", "catch", "pickUp", "walk", "jog", "run", "stand", "wait", "turn"]);
// Moves already worked out (the same move from the same spot with the same settings comes out the same),
// shared by every build: trying a plan out, cutting it, fitting it to the page.
const MOVE_CACHE = new Map<string, unknown>();
const MOVE_IDS = new WeakMap<MoveFn, number>();
const moveId = (run: MoveFn) => { if (!MOVE_IDS.has(run)) MOVE_IDS.set(run, MOVE_IDS_NEXT.n++); return MOVE_IDS.get(run)!; };
const MOVE_IDS_NEXT = { n: 1 };

function buildCharacter(plan: ScenePlan, character: CharacterPlan, moves: Record<string, MoveEntry>, marks: Record<string, number>, events: ObjectEvent[], ignoreSync = false, fight: FightState = { keys: new Map(), power: {} }): CharacterKey[] | null {
  const count: Record<string, number> = {};
  const myEvents: ObjectEvent[] = [];
  const all = { ...BASE_MOVES, ...moves };
  // Someone who starts out holding an object holds it at the chest.
  const holding = (plan.objects ?? []).some((o) => o.heldBy === character.id) && character.facing !== "front";
  // (HOLDING SIZE: what it holds and how big that is, for the hold at the chest.)
  const lookOf = (id: string | undefined) => plan.objects?.find((o) => o.id === id)?.look;
  const sizeOf = (id: string | undefined) => lookOf(id)?.size;
  let at: Stance = { t: 0, x: character.x, facing: character.facing, pose: holding ? holdPose(sizeOf((plan.objects ?? []).find((o) => o.heldBy === character.id)?.id), plan.height) : restPoseFor(character.facing) };
  const keys: CharacterKey[] = [];
  fight.keys.set(character.id, keys);
  // (Building again after a wait repeats the same moves from the same spots: each is worked out once.)
  const remember = <T,>(key: string, make: () => T): T => {
    const cache = fight.cache;
    if (!cache) return make();
    if (!cache.has(key)) cache.set(key, make());
    return cache.get(key) as T;
  };
  const run = (entry: MoveEntry, from: Stance, params: Record<string, unknown>, settings: MoveSettings): MoveOutput => {
    const out = remember(JSON.stringify([moveId(entry.run), from, params, settings]), () => entry.run(from, params, settings));
    return { ...out, keys: out.keys.slice(), marks: { ...out.marks } };
  };
  // AIM AT WHERE THEY ARE: where another figure is at time t (from its keys so far; before it has any,
  // where it starts; after its last key, where it stopped).
  const whereIs = (id: string, t: number) => {
    const theirs = fight.keys.get(id);
    if (!theirs || theirs.length === 0) return plan.characters.find((c) => c.id === id)?.x ?? at.x;
    const after = theirs.findIndex((k) => k.t > t);
    if (after < 0) return theirs[theirs.length - 1].x;
    if (after === 0) return theirs[0].x;
    const a = theirs[after - 1], b = theirs[after];
    return a.x + ((b.x - a.x) * (t - a.t)) / Math.max(1e-6, b.t - a.t);
  };
  // EYES (gaze.ts): where another figure's face is (stage px) at time t — from its keys so far, so it
  // counts whether they stand, sit, lie or are up in the air; before it has any, standing where it starts.
  const faceOf = (id: string, t: number) => {
    const them = plan.characters.find((c) => c.id === id);
    const theirs = fight.keys.get(id);
    if (!theirs || theirs.length === 0) return them ? eyesOf(restPoseFor(them.facing), them.facing, them.x, plan.height, plan.groundY) : undefined;
    const after = theirs.findIndex((k) => k.t > t);
    const a = theirs[Math.max(0, (after < 0 ? theirs.length : after) - 1)], b = after <= 0 ? a : theirs[after];
    const k = b === a ? 0 : Math.min(1, Math.max(0, (t - a.t) / Math.max(1e-6, b.t - a.t)));
    return eyesOf(lerpPose(a.pose, b.pose, k), a.facing ?? them?.facing ?? "right", a.x + (b.x - a.x) * k, plan.height, plan.groundY, (a.lift ?? 0) + ((b.lift ?? 0) - (a.lift ?? 0)) * k);
  };
  // The nearest other figure in front of this one (closer than `within` px), if any.
  const nearestInFront = (within = Infinity) => plan.characters
    .filter((c) => c.id !== character.id)
    .map((c) => ({ id: c.id, ahead: (whereIs(c.id, at.t) - at.x) * forwardSign(at.facing) }))
    .filter((c) => c.ahead > 0 && c.ahead < within)
    .sort((p, q) => p.ahead - q.ahead)[0]?.id;
  // Who a move is done to or with (EYES: the one it looks at): the one named in its params (`to`, `with`,
  // `from`, `target`); a wave or high-five with nobody named, the nearest figure in front; a punch or kick
  // with nobody named, the nearest one in front within reach of a step (as it aims).
  const lookedAt = (move: string, p: Record<string, unknown>) => {
    const named = move === "wave" || move === "throw" ? p.to : move === "highFive" ? p.with : move === "catch" ? p.from : move === "punch" || move === "kick" ? p.target : undefined;
    if (typeof named === "string" && named !== character.id && plan.characters.some((c) => c.id === named)) return named;
    if (move === "wave" || move === "highFive") return nearestInFront();
    if (move === "punch" || move === "kick") return nearestInFront(2 * plan.height);
    return undefined;
  };
  // DAMAGE (hit.ts): how hurt this figure is (0 fine .. 1 beaten), its strikes so far, the hits it has
  // taken from each attacker, and whether it is out (knocked down for good: it does nothing more).
  let hurt = 0, strikes = 0, knockedOut = false;
  // (Trying out a plan only `until` a time: waiting for a moment of someone who has already stopped
  // means this figure stops there too.)
  const neverComes = (id: string) => plan.until !== undefined && fight.done?.has(id) === true;
  // FIGHTING SPOTS (round 7, Arthur: "it ain't centered"; "going through each other"): in a fight each
  // fighter has its spot, half a FIGHTING DISTANCE from the fight's middle (the middle between where the
  // fighters start), and the fight stays there: knocked back, a fighter comes back to its spot while it
  // waits in its guard; stepped in (a big punch, a kick), it steps back. So the fight never wanders off to
  // one side of the page, and the two never end up on top of each other (hit.ts FIGHT_GAP, PERSONAL_SPACE).
  const fighters = plan.characters.filter((c) => isFighter(c.actions));
  const fightMiddle = fighters.length >= 2 && fighters.some((c) => c.id === character.id) ? fighters.reduce((sum, c) => sum + c.x, 0) / fighters.length : undefined;
  // (Fighters the plan starts within reach of each other keep the distance it gave them.)
  const startGap = fighters.length >= 2 ? Math.min(...fighters.slice(1).map((c, i) => Math.abs(c.x - fighters[i].x))) : Infinity;
  const spotGap = startGap <= IN_RANGE * plan.height ? Math.max(PERSONAL_SPACE * plan.height, startGap) : FIGHT_GAP * plan.height;
  // (A HURT FIGHTER KEEPS ITS DISTANCE: the more slumped it stands, the further forward its head hangs, so
  // its spot is that much further back — two slumped fighters' heads never meet.)
  // (THE SPOT FOLLOWS THE FIGHT, round 16, Arthur: "Red keeps walking backwards... dash, walks backward, dash... it
  // looks like random movements": after a dash or a knock-back the fight had moved, but each fighter's spot stayed
  // where the fight began, so it walked 2-3 body heights back to it between exchanges and ran in again. Now the
  // middle is where the two of them are NOW: a step back to fighting distance, never a walk across the page.)
  const spotX = () => {
    const other = fightMiddle === undefined ? undefined : fighters.find((c) => c.id !== character.id);
    const middle = other ? (at.x + whereIs(other.id, at.t)) / 2 : (fightMiddle ?? at.x);
    return middle - forwardSign(at.facing) * (spotGap / 2 + slumpReach(hurt) * plan.height);
  };
  // Fighting steps from here to stage x `x` (in or back, the guard up); null if it is already about there.
  const stepsTo = (x: number, settings: MoveSettings, from: Stance = at): MoveOutput | null => {
    // (Never into the other fighter if they are still forward of their spot: personal space first.)
    const other = fighters.find((c) => c.id !== character.id && (whereIs(c.id, from.t) - from.x) * forwardSign(from.facing) > 0);
    if (other) x = forwardSign(from.facing) > 0 ? Math.min(x, whereIs(other.id, from.t) - (PERSONAL_SPACE + 0.05) * plan.height) : Math.max(x, whereIs(other.id, from.t) + (PERSONAL_SPACE + 0.05) * plan.height);
    const off = (x - from.x) * forwardSign(from.facing);
    if (onTheGround(from.pose) || from.facing === "front") return null;
    // (NATURAL STAND, round 11: a default fighter about on its spot but still in a strike's wide stance
    // steps back into its natural stand — walking steps there otherwise, hit.ts fightSteps.)
    if (Math.abs(off) < 0.08 * plan.height) return settings.guard !== "realistic" && !readyFeet(from.pose, settings.guard) ? stepInto(from, standReadyPose(from.pose, hurt, settings.guard), settings) : null;
    return fightSteps(from, off, settings);
  };
  // Stage x where the page ends behind this figure (with the page fit's margin), when the page is known.
  // AIM AT WHERE THEY ARE — before they react to this very strike (their reaction to it is the result of
  // the aim, not something to aim at): where `id` is at t, or just before its reaction to this figure's
  // next strike starts, whichever is first.
  const beforeReacting = (id: string, t: number) => {
    let n = 0, mine = 0, reacts = Infinity;
    for (const a of plan.characters.find((c) => c.id === id)?.actions ?? []) {
      if (a.move !== "getHit") continue;
      n += 1;
      if (a.params?.from === character.id && (mine += 1) === strikes + 1) { reacts = marks[`${id}.getHit${n}.hit`] ?? Infinity; break; }
    }
    return Math.min(t, reacts - 1e-4);
  };
  const aimAt = (id: string, t: number) => whereIs(id, beforeReacting(id, t));
  // Does `id`'s strike k+1 follow its strike k straight on (a combo: nothing in between)?
  const comboGoesOn = (id: string, k: number) => {
    const theirs = plan.characters.find((c) => c.id === id)?.actions ?? [];
    let n = 0;
    for (let i = 0; i < theirs.length; i += 1) if (STRIKES.has(theirs[i].move) && (n += 1) === k) return STRIKES.has(theirs[i + 1]?.move ?? "") && theirs[i + 1].sync === undefined;
    return false;
  };
  // Does `id` block this figure's next strike (their getHit for it asks for a block, or a grab: the fist
  // stops in their hands, where a block meets it)?
  const blocks = (id: string) => ["block", "grab", "parry"].includes(String(plan.characters.find((c) => c.id === id)?.actions.filter((a) => a.move === "getHit" && a.params?.from === character.id)[strikes]?.params?.result));
  // Closing a long gap before a strike: a walk arrives in the guard (hit.ts walkIntoGuard); a run stops.
  // RIGHT GAIT FOR THE DISTANCE (W14, round 14, Arthur: "if you're trying to go from here to there, what is
  // the better way? Running, punch dash, or walking? Walking fast looks weird"): a fighter whose own walk
  // would be quicker than a natural walk (fast, angry, lively) never speed-walks into a fight — a short way
  // (up to FIGHT_JOG x height) is calm walking steps at a natural pace (hit.ts fightSteps), a longer one a
  // jog. Mark "arrived" when it is there, for anyone waiting on it.
  const brisk = (settings: MoveSettings) => settings.guard !== "realistic" && naturalWalkPace(settings.style, settings.speed, settings.energy).brisk;
  const calmlyTo = (d: number, settings: MoveSettings, params: Record<string, unknown> = {}): MoveOutput => {
    if (d > FIGHT_JOG * plan.height) return run(all.jog, at, { ...params, distance: d }, settings);
    const out = fightSteps(at, d, settings);
    return { ...out, marks: { ...out.marks, arrived: out.end.t } };
  };
  const close = (e: MoveEntry, d: number, settings: MoveSettings) => e.run === all.walk.run && brisk(settings) ? calmlyTo(d, settings)
    : e.run === all.walk.run
    ? remember(JSON.stringify(["intoGuard", at, d, settings]), () => walkIntoGuard((x) => e.run(at, { distance: x }, settings), at, d, settings))
    : run(e, at, { distance: d }, settings);
  const pageEdgeBehind =() => plan.stageWidth === undefined ? undefined : STAGE_MIDDLE - (forwardSign(at.facing) * plan.stageWidth * (1 - 2 * PAGE_MARGIN)) / 2;
  const hitsFrom: Record<string, number> = {};
  // GROUND FIGHTING (grapple.ts): this figure's ground attacks so far, and the ones it has answered from each attacker.
  let groundHits = 0;
  const groundFrom: Record<string, number> = {};
  // How another figure lies (or stands) at time t, seen from this one (x height): from its keys so far.
  const otherAt = (id: string, t: number): Other | undefined => {
    const them = plan.characters.find((c) => c.id === id);
    if (!them || at.facing === "front") return undefined;
    const theirs = fight.keys.get(id);
    const after = theirs?.length ? theirs.findIndex((k) => k.t > t) : -1;
    const a = theirs?.length ? theirs[Math.max(0, (after < 0 ? theirs.length : after) - 1)] : undefined;
    const b = a && theirs && after > 0 ? theirs[after] : a;
    const k = a && b && b !== a ? Math.min(1, Math.max(0, (t - a.t) / Math.max(1e-6, b.t - a.t))) : 0;
    const x = a && b ? a.x + (b.x - a.x) * k : them.x;
    const facing = a?.facing ?? them.facing;
    return {
      dx: ((x - at.x) * forwardSign(at.facing)) / plan.height, facing: facing === at.facing ? "same" : "opposite",
      pose: a && b ? lerpPose(a.pose, b.pose, k) : restPoseFor(them.facing), lift: a && b ? ((a.lift ?? 0) + ((b.lift ?? 0) - (a.lift ?? 0)) * k) / plan.height : 0,
    };
  };
  const local: Record<string, number> = {};
  const plant = footPlanter(plan.height);
  const add = (out: MoveOutput) => {
    // The first key of a move is the last key of the one before. That key is the truth about the body at
    // that moment (a foot may be in the air mid-stride); the new move only adds how it moves on from there.
    let moveKeys = out.keys;
    const last = keys[keys.length - 1];
    if (last && moveKeys.length && Math.abs(last.t - moveKeys[0].t) < GAP) {
      const first = moveKeys[0];
      moveKeys = [{ ...last, ease: first.ease ?? last.ease, xEase: first.xEase ?? last.xEase, liftEase: first.liftEase ?? last.liftEase }, ...moveKeys.slice(1)];
    }
    // Planted feet don't move: the hips go where the planted feet put them (see planted.ts).
    const placed = plant(moveKeys);
    for (const key of placed) {
      if (keys.length && Math.abs(keys[keys.length - 1].t - key.t) < GAP) keys[keys.length - 1] = key;
      else keys.push(key);
    }
    at = { ...out.end, x: placed.length ? placed[placed.length - 1].x : out.end.x };
  };
  // BACK TO ITS SPOT, ONE WAY, NO DITHERING (round 9): feet not yet in a fighting stance (after a stagger, a
  // hurt get-up), it first steps into its stance — the step going the way the spot is — then takes its
  // fighting steps there, in the guard. The hips only ever go toward the spot. (Stepping into the stance
  // after reaching the spot used to move the hips off it again, and the next guard stepped back in: back and
  // forth, standing about, like it didn't know where to go.) Whether it moved.
  // FIGHT FROM WHERE YOU ARE (round 12, Arthur: "breaks of three seconds, four tops"): after a hit, a
  // knock-down or getting back up, a fighter only goes back to its spot when the fight has drifted well off it
  // (more than SPOT_DRIFT); otherwise it fights on from where it is — no walk back and step in again.
  const toSpot = (settings: MoveSettings, slack = 0.08): boolean => {
    if (slack > 0.08 && Math.abs(spotX() - at.x) < slack * plan.height) return false;
    const spot = spotX(), far = Math.abs(spot - at.x) >= 0.08 * plan.height;
    // (NATURAL STAND, round 11: "its stance" is the natural stand unless `guard: "realistic"`.)
    const narrow = !onTheGround(at.pose) && at.facing !== "front" && !readyFeet(at.pose, settings.guard) && (settings.guard === "realistic" || !far);
    if (narrow) add(stepInto(at, standReadyPose(at.pose, hurt, settings.guard), settings, far ? spot : undefined));
    const steps = stepsTo(spot, settings);
    if (steps) add(steps);
    return narrow || !!steps;
  };
  // Is the figure holding something right now (it rests holding it at the chest)?
  let holdingNow = holding;
  // ...and which object it holds.
  let heldObject = (plan.objects ?? []).find((o) => o.heldBy === character.id)?.id;
  // ...and in which hand(s) it is.
  let heldIn: ObjectHand = (plan.objects ?? []).find((o) => o.heldBy === character.id)?.joint ?? "hands";
  // Speed (px/s) a walk or run hands over to a fall that follows it (a trip keeps its momentum).
  let momentum = 0;
  // RUN ON: a running jump that lands straight into a run hands that run over (worked out before the jump).
  let runOnNext: RunOnPlan | undefined;
  // Effort since the figure last rested (a long fight or sprint leaves it out of breath).
  let effort = 0;
  let lastPunchHand: string | null = null;
  const actions = [...character.actions];
  for (let index = 0; index < actions.length && !knockedOut && !(at.t > (plan.until ?? Infinity)); index += 1) {
    const action = actions[index];
    const next = actions[index + 1];
    // (A hurt figure moves like it: less energy, then the hurt style — hit.ts hurtSettings.)
    const settings: MoveSettings = hurtSettings({
      height: plan.height,
      style: action.style ?? character.style ?? "natural",
      speed: action.speed ?? character.speed ?? "normal",
      energy: action.energy ?? character.energy ?? 0.5,
      ...(((g) => (g === "realistic" || g === "high" ? { guard: g as "realistic" | "high" } : {}))(action.params?.guard ?? character.guard)),
    }, hurt, action.style !== undefined, fightMiddle !== undefined ? QUICK_UNTIL_HURT : HURT_STYLE_AT);
    if (action.move === "wait") {
      const seconds = Number(action.params?.seconds ?? 1);
      add(stand(at, { seconds }, settings));
      if (seconds >= 1.5) effort = Math.max(0, effort - seconds);
      continue;
    }
    // MEET IN THE MIDDLE (round 7): "walk (or run) to someone" (`to`: their id) goes to a fighting distance
    // from them, halfway: in a fight, to this fighter's spot; otherwise to where the middle between them
    // (now) less half a fighting distance is. (Already there: nothing to walk.)
    const toward = isGait(action.move) && typeof action.params?.to === "string" && action.params.distance === undefined
      ? Math.max(0, ((fightMiddle !== undefined ? spotX() : (at.x + whereIs(action.params.to, at.t)) / 2 - (forwardSign(at.facing) * FIGHT_GAP * plan.height) / 2) - at.x) * forwardSign(at.facing))
      : undefined;
    if (toward !== undefined && toward < 0.05 * plan.height) {
      // (Already there: no walk, but its moment "arrived" is now, for anyone waiting on it.)
      count[action.move] = (count[action.move] ?? 0) + 1;
      marks[`${character.id}.arrived`] = marks[`${character.id}.${action.move}${count[action.move]}.arrived`] = at.t;
      continue;
    }
    // FIGHTING STEP: a short walk between fight moves (a punch or kick before or after it) is a shuffle in
    // the guard: front foot in, back foot follows, the guard stays up.
    // (W11, round 11, Arthur: "I'm expecting a walk ... he's dragging his foot behind": a walk BEFORE a
    // strike, with nobody to fight (kicking the floor alone), is a real walk, not a shuffle in the guard.)
    const distanceAsked = toward ?? Number(action.params?.distance ?? 300);
    if (action.move === "walk" && distanceAsked <= 0.6 * plan.height && (FIGHT_MOVES.has(actions[index - 1]?.move ?? "") || (FIGHT_MOVES.has(next?.move ?? "") && fightMiddle !== undefined)) && !onTheGround(at.pose) && at.facing !== "front"
      && !(toward !== undefined && stanceDifference(at.pose, restPoseFor(at.facing), at.facing) <= FEET_SLACK)) {
      add(shuffleIn(at, distanceAsked, settings));
      // (EVERY MOMENT SOMEONE WAITS FOR HAPPENS, round 9: a walk done as a fighting step still "arrives" —
      // the other fighter may be waiting for it to start the fight.)
      count[action.move] = (count[action.move] ?? 0) + 1;
      marks[`${character.id}.arrived`] = marks[`${character.id}.${action.move}${count[action.move]}.arrived`] = at.t;
      continue;
    }
    const entry = all[action.move];
    if (!entry) throw new Error(`Unknown move "${action.move}"`);
    // FACE WHO YOU PASS TO: a figure throws to, hands to, catches from or takes from someone in front of
    // it — if they are behind it (or it faces the viewer), it turns to them first.
    const partner = action.move === "throw" ? action.params?.to : action.move === "catch" ? action.params?.from : undefined;
    if (typeof partner === "string" && partner !== character.id && plan.characters.some((c) => c.id === partner) && !onTheGround(at.pose)) {
      const there = whereIs(partner, at.t);
      if (Math.abs(there - at.x) > 1 && (at.facing === "front" || (there - at.x) * forwardSign(at.facing) < 0)) add(turn(at, { to: there > at.x ? "right" : "left" }, settings));
    }
    // EYES: a figure waves at (or high-fives) someone it is looking at. Told whom (`to` / `with`) and they
    // are behind it (or it faces the viewer), it turns to them first.
    const greeted = action.move === "wave" ? action.params?.to : action.move === "highFive" ? action.params?.with : undefined;
    if (typeof greeted === "string" && greeted !== character.id && plan.characters.some((c) => c.id === greeted) && !onTheGround(at.pose)) {
      const there = whereIs(greeted, at.t);
      if (Math.abs(there - at.x) > 1 && (at.facing === "front" || (there - at.x) * forwardSign(at.facing) < 0)) add(turn(at, { to: there > at.x ? "right" : "left" }, settings));
    }
    // Side-view moves turn away from the viewer first.
    if (entry.side && at.facing === "front") add(turn(at, { to: character.x > 960 ? "left" : "right" }, settings));
    count[action.move] = (count[action.move] ?? 0) + 1;
    let params = action.params ?? {};
    if (toward !== undefined) params = { ...params, distance: toward };
    // Punches in a row alternate hands (jab with the front hand, then cross with the back hand...).
    if (action.move === "punch" && params.hand === undefined) params = { ...params, hand: lastPunchHand === "front" ? "back" : "front" };
    // ROOM: a move that can go either way (falling forward or back), if the plan doesn't say, goes the way
    // with more room — toward the middle of the stage — so a scene with several falls stays on the page.
    // MOMENTUM: a fall right after a walk or run is a trip: it keeps the speed it had (and so falls forward).
    const falling = action.move === "fall" || action.move === "fallDown";
    if (TAKES_MOMENTUM.has(action.move) && momentum > 0 && params.speed === undefined) params = { ...params, speed: momentum };
    // RUN ON (round 7): a running jump straight into a run lands into the run at full speed (no stop, no
    // standing start): the run is worked out first, from its first push-off at full speed, and the jump
    // lands into exactly that pose and speed (jump.ts runOn); the run then goes on from there.
    const flying = action.move === "run" ? runOnNext : undefined;
    runOnNext = undefined;
    if (action.move === "jump" && Number(params.speed ?? 0) > 0 && next?.move === "run" && next.params?.to === undefined && params.runOn === undefined && at.facing !== "front") {
      const runSettings = hurtSettings({ height: plan.height, style: next.style ?? character.style ?? "natural", speed: next.speed ?? character.speed ?? "normal", energy: next.energy ?? character.energy ?? 0.5 }, hurt, next.style !== undefined, fightMiddle !== undefined ? QUICK_UNTIL_HURT : HURT_STYLE_AT);
      // (A run that hands over to another jump or a trip is built longer, so it is still at full speed there.)
      const goesOn = TAKES_MOMENTUM.has(actions[index + 2]?.move ?? "");
      const runParams = { ...(next.params ?? {}), ...(holdingNow ? { carrying: sizeOf(heldObject) ?? true } : {}), ...(goesOn ? { distance: Number(next.params?.distance ?? 300) + 2.5 * 1.05 * plan.height } : {}) };
      runOnNext = remember(JSON.stringify(["runOn", at.facing, runParams, runSettings]), () => runOnPlan(all.run, at.facing, runParams, runSettings));
      if (runOnNext) { const k = runOnNext.keys[runOnNext.cut]; params = { ...params, runOn: { pose: k.pose, speed: runOnNext.speed, foot: (k.contacts ?? ["lFoot"])[0] === "lFoot" ? "l" : "r" } }; }
    }
    // ACCIDENTS HAVE A CAUSE (Arthur, round 7: "If he accidentally fell down, he should at least start
    // walking a little — one or two steps with acceleration and deceleration — then fall (trip)"). Nobody
    // just topples over standing still. A fall the plan doesn't aim (no `direction`) with no cause right
    // before it — not straight after a walk or run (that is a trip already), a hit, a jump's landing, or a
    // strike or stomp that can overbalance — is an ACCIDENT: the figure sets off walking (the walk's own
    // gentle start, speeding up) and trips mid-step on its second step, keeping the walking speed
    // (MOMENTUM). A fall with a `direction` ("back" = a slip, "forward") happens where it stands, as asked.
    // With ROOM only behind it (near the edge, facing out) an unaimed fall is a slip back on the spot (the
    // feet shoot out: that is its cause), as before. The steps shrink with the page (`lengthScale`).
    const before = actions.slice(0, index).reverse().find((a) => a.move !== "wait")?.move;
    const unaimed = falling && !(Number(params.speed ?? 0) > 0) && params.direction === undefined && at.facing !== "front";
    if (unaimed && Math.abs(STAGE_MIDDLE - at.x) > 0.1 * plan.height && forwardSign(at.facing) * (STAGE_MIDDLE - at.x) < 0) params = { ...params, direction: "back" };
    if (unaimed && params.direction === undefined && !CAUSES_A_FALL.has(actions[index - 1]?.move ?? "") && !onTheGround(at.pose)) {
      const steps = untilTrip(all.walk, at, { distance: ACCIDENT_STEPS * plan.height * (plan.lengthScale ?? 1), ...(holdingNow ? { carrying: sizeOf(heldObject) ?? true } : {}) }, settings, "walk");
      add(steps);
      params = { ...params, speed: steps.marks.speed ?? 0 };
    }
    // DASH PUNCH (dash.ts, round 10): a dash needs a run. With no run right before it, it runs up first —
    // far enough that the dash itself (gather, push, under half a second in the air, the fist landing as the
    // front foot does) covers the rest — and takes over at the run's speed the moment a foot lands. Its
    // `distance` is to where the target really is when the fist lands (AIM AT WHERE THEY ARE).
    if (action.move === "dashPunch" && !onTheGround(at.pose) && at.facing !== "front") {
      const targetId = typeof params.target === "string" ? params.target : nearestInFront();
      if (!(Number(params.speed ?? 0) > 0) && targetId) {
        // (The run hands over on the first landing at or after its distance: up to a step later; the dash's
        // own range — a shorter or longer flight — covers what is left.)
        // (It tries a few run lengths, a third of a step apart, and keeps one that leaves a gap the dash can
        // cover at the speed that run hands over, the closest to its natural length.)
        const gap = Math.abs(aimAt(targetId, at.t) - at.x);
        const DASH_FAR_OUT = 1.6; // x height (the passed dash punch hands over 2.2 heights out and takes off 1.7 out; fight 2 handed over 1.2 out)
        const leftOver = (p: MoveOutput) => {
          const left = (gap - Math.abs(p.end.x - at.x)) / plan.height, span = dashSpan(settings, p.marks.speed ?? 0, left);
          // (A DASH TAKES OFF FAR OUT, round 16, Arthur on fight 2: "the airborne was a little too late... like three
          // times farther away": never a run that ends right in front of them — it hands over at least DASH_FAR_OUT
          // heights out, as the passed dash punch does, and the dash covers that ground in the air.)
          return 100 * span.miss + 10 * Math.max(0, DASH_FAR_OUT - left) + Math.abs(left - span.natural); // (one it can reach first, then far enough out, then the most natural)
        };
        // (Too close for any run-up — a narrow page — it dashes from where it stands: a short lunging dash.)
        const standing: MoveOutput = { keys: [], end: at, marks: { speed: 0 } };
        // (The shortest run, 0.6 heights, is always tried too: a fast runner's long strides can carry a longer
        // one a whole stride past where it was asked to stop — right up to the target.)
        const runs = [...[0, 1, 2, 3, 4, 5, 6, 7].map((k) => gap - (0.8 + 0.25 * k) * plan.height), 0.6 * plan.height];
        const steps = [standing, ...runs.map((d) => untilTrip(all.run, at, { distance: Math.max(0.6 * plan.height, d) }, settings, "run", true))]
          .sort((p, q) => leftOver(p) - leftOver(q))[0];
        if (steps !== standing) add(steps);
        params = { ...params, speed: steps.marks.speed ?? 0 };
      }
      if (targetId && params.distance === undefined) {
        const trial = run(entry, at, { ...params, distance: Math.abs(aimAt(targetId, at.t) - at.x) }, settings);
        params = { ...params, distance: Math.abs(aimAt(targetId, trial.marks.hit ?? at.t) - at.x) };
      }
    }
    // GET UP ONLY AS FAR AS NEEDED (Arthur, round 7: "You're hurt, you've got to sit down: get up a little
    // and sit, not stand up and then sit"): getting up with a move that goes straight back down next (sitting),
    // it stops part of the way up (fall.ts `low`) and that move goes on from there. No standing pose between.
    if ((action.move === "getUp" || action.move === "fall") && BACK_DOWN.has(next?.move ?? "") && params.low === undefined) params = { ...params, low: true };
    // EYES ON THE INJURY (round 7): sitting down after a fall, it is hurt — it holds and looks at its knee (sit.ts).
    if (action.move === "sit" && params.hurt === undefined && (before === "getUp" || before === "fall" || before === "fallDown")) params = { ...params, hurt: "knee" };
    // A punch at someone: how far away they are decides the punch (close: uppercut, far: overhand).
    if (action.move === "punch" && params.distance === undefined) {
      // At the named target, or else at the nearest figure in front within a couple of body lengths.
      const ahead = (c: CharacterPlan) => (c.x - at.x) * forwardSign(at.facing);
      const target = typeof params.target === "string"
        ? plan.characters.find((c) => c.id === params.target)
        : plan.characters.filter((c) => c.id !== character.id && ahead(c) > 0 && ahead(c) < 2 * plan.height).sort((a, b) => ahead(a) - ahead(b))[0];
      if (target) {
        // (Where they are when the fist lands, not where they started: they may have been knocked back.)
        // (BLOCKED: at someone who blocks it, the fist lands on their forearms, in front of their face.)
        const short = blocks(target.id) ? ARMS_AHEAD * plan.height : 0;
        const trial = run(entry, at, { ...params, distance: Math.abs(aimAt(target.id, at.t) - at.x) - short }, settings);
        params = { ...params, distance: Math.abs(aimAt(target.id, trial.marks.hit ?? at.t) - at.x) - short };
      }
    }
    // DON'T HIT A FIGHTER WHO'S DOWN: if this figure's last strike knocked its target down, it waits (in its
    // guard) until they are back up before it strikes again (and not at all once they are out).
    if (STRIKES.has(action.move) && typeof params.target === "string" && strikes > 0 && !ignoreSync) {
      const target = plan.characters.find((c) => c.id === params.target);
      const answers = target ? target.actions.filter((a) => a.move === "getHit" && a.params?.from === character.id).length : 0;
      const reaction = fight.reactions?.[`${character.id}.strike${strikes}`];
      if (answers >= strikes && reaction === undefined) { if (neverComes(String(params.target))) break; return null; }
      if (reaction?.out) continue; // (and never at someone who is out cold)
      if (reaction?.down && reaction.ready + 0.25 - at.t > 0.35) add(guardUp(at, { seconds: reaction.ready + 0.25 - at.t - 0.3, hurt, relax: true }, settings));
    }
    // (FACE THEM FIRST, round 15: a strike at someone behind turns round BEFORE it works out its range — measured
    // with its back to them, "too close, back off" walked it away from them for seconds, right off the page.)
    if (STRIKES.has(action.move) && typeof params.target === "string" && fightMiddle !== undefined && !onTheGround(at.pose) && at.facing !== "front") {
      const o = otherAt(params.target, at.t);
      if (o && o.dx < -0.05 && !onTheGround(o.pose)) add(turn(at, { to: at.facing === "right" ? "left" : "right" }, settings));
    }
    // STRIKE RANGE: a punch or kick at someone out of its reach first closes the gap — a fighting step for
    // a short gap, a walk (or, for a fast or lively fighter, a run in) for a long one — to the distance
    // that strike works from (a kick: where the foot meets their body; a straight punch: inside its reach;
    // an overhand: between the straight punch's reach and its own). PERSONAL SPACE (round 7): too close
    // (closer than a fighter's personal space when the strike lands), it first steps back to that distance.
    // The distance counted is the one WHEN IT LANDS: where both hips really are then (the strike's own step
    // in, the walk's real length, the other one moving).
    if (STRIKES.has(action.move) && typeof params.target === "string" && !onTheGround(at.pose) && at.facing !== "front") {
      const targetId = String(params.target), way = forwardSign(at.facing);
      const choice = action.move === "punch" ? remember(JSON.stringify(["choosePunch", at, params, settings]), () => choosePunch(at, params, settings)) : null;
      const kickAt = action.move === "kick" ? remember(JSON.stringify(["kickReach", at.pose, params, settings]), () => kickReach(at, params, settings)) + 0.03 * plan.height : 0;
      const reach = choice ? (params.technique === "straight" ? choice.straightUpTo : choice.overhandUpTo) : kickAt + 0.06 * plan.height;
      const near = PERSONAL_SPACE * plan.height;
      const want = Math.max(near + 0.02 * plan.height, choice ? (params.technique === "overhand" ? (choice.straightUpTo + choice.overhandUpTo) / 2 : 0.9 * choice.straightUpTo) : kickAt);
      const short = blocks(targetId) ? ARMS_AHEAD * plan.height : 0;
      // (After a stride in, the strike goes on straight out of it: `arriving`, STRIKE OUT OF THE STRIDE.)
      const aimed = (from: Stance, pre: MoveOutput | null = null) => {
        const p = pre?.marks.stride ? { ...params, arriving: true } : params;
        return action.move !== "punch" || action.params?.distance !== undefined ? p
          : { ...p, distance: Math.abs(aimAt(targetId, run(entry, from, { ...p, distance: Math.abs(aimAt(targetId, from.t) - from.x) - short }, settings).marks.hit ?? from.t) - from.x) - short };
      };
      // The gap (hip to hip) when the strike lands, thrown after `pre` (steps in or back) or from here.
      // (Where the hips really are then: planted feet put them there — the step and the strike planted on
      // from this figure's last key.) `least`: the smallest gap on the way there (PERSONAL SPACE).
      const hitGap = (pre: MoveOutput | null) => {
        const from = pre ? pre.end : at;
        const trial = run(entry, from, aimed(from, pre), settings);
        const t = trial.marks.hit ?? trial.end.t;
        const last = keys[keys.length - 1];
        const after = (list: CharacterKey[]) => (list.length && last && Math.abs(list[0].t - last.t) < GAP ? list.slice(1) : list);
        const placed = footPlanter(plan.height)([...(last ? [last] : []), ...after(pre ? pre.keys : []), ...(pre ? trial.keys.slice(1) : after(trial.keys))]);
        // (Heads count too: a wind-up that leans the chest forward brings the heads together before the hips.)
        const least = Math.min(...placed.filter((k) => k.t <= t + 1e-6).map((k) => {
          const hips = (aimAt(targetId, k.t) - k.x) * way;
          const face = faceOf(targetId, beforeReacting(targetId, k.t));
          const mine = eyesOf(k.pose, k.facing ?? at.facing, k.x, plan.height, plan.groundY, k.lift ?? 0);
          return face ? Math.min(hips, near + Math.hypot(face.x - mine.x, face.y - mine.y) - HEAD_SPACE * plan.height) : hips;
        }));
        // (`atHit`: from where the strike starts to where they are when it lands — the way a strike's reach
        // is measured.)
        return { atHit: (aimAt(targetId, t) - xAt(placed, from.t)) * way, least };
      };
      // WHICH GAIT (round 11, Arthur: "usually it wouldn't be a lot of walking, it would be running"): a jog
      // for a medium gap, a run for a long one (or a fast or lively fighter's medium one); a walk only for a
      // short one, or for a slow, sad, tired, sneaking or hurt fighter.
      const gaitFor = (d: number): "walk" | "jog" | "run" => {
        const H = plan.height, slow = settings.speed === "slow" || ["sad", "tired", "sneaky"].includes(settings.style) || (fightMiddle !== undefined ? hurt >= QUICK_UNTIL_HURT : settings.style === "hurt" || hurt >= 0.5);
        // (NO WALKING IN, round 16, Arthur: "no more walking" — in a fight, more than a step away it jogs in.)
        if (slow || d <= (fightMiddle !== undefined ? ONE_STEP : 1.2) * H) return "walk";
        return d > 3.5 * H || (d > 2 * H && (settings.speed === "fast" || settings.energy >= 0.7)) ? "run" : "jog";
      };
      const closing = (d: number): MoveOutput => d < 0 ? fightSteps(at, d, settings) : d <= (fightMiddle !== undefined && gaitFor(d) !== "walk" ? ONE_STEP : 0.6) * plan.height ? shuffleIn(at, d, settings)
        : close(all[gaitFor(d)], d, settings);
      const gap = hitGap(null);
      const far = gap.atHit > reach;
      let d = 0;
      if (far || gap.least < near - 0.02 * plan.height) {
        // (Out of reach: in to the strike's distance, but never so far in that they come closer than personal
        // space. In reach but too close: back just enough — close is still close: an uppercut stays one.)
        d = far ? gap.atHit - want : gap.least - near;
        for (let i = 0; i < 4; i += 1) {
          const g = hitGap(closing(d)), off = far ? Math.min(g.atHit - want, g.least - near) : g.least - near;
          if (Math.abs(off) < 0.01 * plan.height) break;
          d += off;
        }
      }
      // NO CHANGE OF MIND FOR A HAIR (round 9): whether to step, and how far, is only worked out to within
      // a hair (0.01-0.02 x height), so building again with the other one a hair elsewhere (its timing moved
      // by this very step) could step / not step, or step a few px more / less, every other time — back and
      // forth for ever, and the reactions would never land exactly on their hits. What it already worked out
      // for this strike stays unless the answer really changed: the step differs by more than its precision,
      // and the gap is not just a hair from the strike's reach. (Never at the cost of personal space.)
      const mine = `${character.id}.strike${strikes + 1}`, known = fight.closings?.get(mine);
      const hair = Math.abs(gap.atHit - reach) < 0.02 * plan.height && gap.least >= near - 0.02 * plan.height;
      // (A hair from its reach the choice is between no step and a small one: only that choice is kept.)
      // (Round 16, Arthur: "he got hit before the hit even happened" — a punch kept from an earlier, shorter guess
      // landed short and the other reacted to thin air. Out of reach is never "a hair": it steps in.)
      if (known !== undefined && (Math.abs(known - d) < 0.01 * plan.height || (hair && Math.abs(known - d) <= 0.1 * plan.height))) d = known;
      fight.closings?.set(mine, d);
      if (Math.abs(d) > 0.02 * plan.height) { const pre = closing(d); add(pre); params = aimed(at, pre); }
    }
    // GETTING HIT: the k-th "getHit" from someone is their k-th strike (punch or kick): it happens exactly
    // when that strike lands, as hard as that strike really was (STRIKE POWER), and adds its DAMAGE.
    if (action.move === "getHit") {
      if (typeof params.from === "string") {
        const k = (hitsFrom[params.from] = (hitsFrom[params.from] ?? 0) + 1);
        const power = fight.power[`${params.from}.strike${k}`];
        if (power === undefined && !ignoreSync) { if (neverComes(params.from)) break; return null; }
        if (params.power === undefined) params = { ...params, power: power ?? 0.5 };
      }
      const before = hurt;
      hurt = takeDamage(hurt, Number(params.power ?? 0.5) * (params.result === "parry" ? 0 : params.result === "block" || params.result === "grab" ? BLOCKED : 1));
      if (fight.hurt) fight.hurt[character.id] = hurt;
      params = { ...params, hurt: before, after: hurt };
    }
    if (action.move === "guard" && params.hurt === undefined) params = { ...params, hurt };
    // GO TO WHERE THEY LIE (grapple.ts): a ground attack at someone down (`target`, or else the nearest
    // figure lying in front within a few body heights) turns to them if they are behind, walks (or steps
    // back) to where it can reach them from, and is told how they lie (`other`) so it lands ON them.
    if (GROUND_ATTACKS.has(action.move) && at.facing !== "front" && params.other === undefined) {
      const down = (id: string) => { const o = otherAt(id, at.t); return o && onTheGround(o.pose) ? o : undefined; };
      const targetId = typeof params.target === "string" ? params.target
        : plan.characters.filter((c) => c.id !== character.id && down(c.id) && Math.abs(down(c.id)!.dx) < 3).sort((p, q) => Math.abs(down(p.id)!.dx) - Math.abs(down(q.id)!.dx))[0]?.id;
      let o = targetId ? otherAt(targetId, at.t) : undefined;
      if (o && targetId && o.dx < 0) { add(turn(at, { to: at.facing === "right" ? "left" : "right" }, settings)); o = otherAt(targetId, at.t); }
      const d = o ? groundApproach(action.move, at.pose, o) * plan.height : 0;
      if (targetId && d > 0.06 * plan.height) {
        // ARRIVE INTO IT (round 9): no slowing down and standing first. The walk is cut, still at walking
        // speed, on the landing whose front foot comes down nearest the spot to stand on; the back leg's
        // next swing forward IS the knee coming up (grapple.ts). (No landing near enough: the walk stops.)
        const way = forwardSign(at.facing), standX = at.x + way * groundStandAt(action.move, o!) * plan.height;
        // RUN IN ON THE ONE DOWN (round 14, Arthur: "it's a fight, you're not taking a break ... he should be
        // RUNNING, then he hops in the air, lifts up his hand and slams"; "walking fast looks weird"): a
        // fighter more than RUN_IN_FROM away jogs (a medium way) or runs (a long way) — a walk only for a
        // short way, or a slow, sad, tired or hurt one — and goes STRAIGHT into the attack: the jog / run is
        // cut on a landing (a foot coming down out of the air), the one whose foot comes down nearest the
        // spot to stand on — that foot is the one it stands / pushes off on. It is built a few lengths (from
        // stopping right there to well past it: braking into it or at full tilt) so one of its landings comes
        // down right there. (A lift needs both feet down: it stops, leaning in.)
        const H = plan.height, slow = settings.speed === "slow" || ["sad", "tired", "sneaky"].includes(settings.style) || (fightMiddle !== undefined ? hurt >= QUICK_UNTIL_HURT : settings.style === "hurt" || hurt >= 0.5);
        const gait: GaitKind = (fightMiddle === undefined && !isFighter(character.actions)) || slow || d <= RUN_IN_FROM * H ? "walk"
          : d > 2 * H || (d > 1.5 * H && (settings.speed === "fast" || settings.energy >= 0.7)) ? "run" : "jog";
        const flies = gait !== "walk";
        // RUNNING HAMMER STRIKE (round 15, groundPunch.ts): a hop-punch run into hops further (a running hop),
        // so it pushes off further back, and it takes the run's speed (`speed`) into the hop: no stop.
        const pushX = action.move === "groundPunch" && flies ? at.x + way * groundPunchStandAt(o!, true) * H : standX;
        let pick: { keys: CharacterKey[]; cut: number; off: number } | undefined;
        for (let n = 0; n < (!flies ? 1 : action.move === "liftSlam" ? 0 : 16) && !(pick && pick.off < 0.03 * H); n += 1) {
          const g = run(all[gait], at, { distance: d + (flies ? 0.1 * n : 0.6) * H }, settings);
          g.keys.forEach((k, i) => {
            const c = k.contacts ?? [], before = g.keys[i - 1]?.contacts ?? [];
            if (i === 0 || c.length !== (flies ? 1 : 2) || before.length !== (flies ? 0 : 1)) return;
            const f = feetOf(k.pose), off = Math.abs(k.x + way * (flies ? f[c[0] === "lFoot" ? "l" : "r"] : Math.max(f.l, f.r)) * H - pushX);
            if (off < 0.1 * H && (!pick || off < pick.off)) pick = { keys: g.keys, cut: i, off };
          });
        }
        if (pick) {
          const k = pick.keys[pick.cut];
          add({ keys: pick.keys.slice(0, pick.cut + 1), end: { t: k.t, x: k.x, facing: at.facing, pose: k.pose }, marks: { arrived: k.t } });
          if (action.move === "groundPunch" && flies && params.speed === undefined) {
            const was = [...pick.keys.slice(0, pick.cut)].reverse().find((q) => q.t <= k.t - 0.3) ?? pick.keys[0];
            if (k.t - was.t > 0.05) params = { ...params, speed: Math.abs(k.x - was.x) / (k.t - was.t) };
          }
        } else {
          const stop = run(all[gait], at, { distance: d, keepLean: true }, settings);
          add(stop.flow ? { ...stop, keys: stop.keys.slice(0, stop.flow.keys), end: stop.flow.stance } : stop);
        }
        o = otherAt(targetId, at.t);
      }
      else if (targetId && d < -0.06 * plan.height) { add(fightSteps(at, d, settings)); add(stepInto(at, restPoseFor(at.facing), settings)); o = otherAt(targetId, at.t); }
      if (o) params = { ...params, other: o };
    }
    // (Ground moves with nobody named — a kip-up — are told how the nearest other figure stands.)
    if (GROUND_MOVES.has(action.move) && !GROUND_ATTACKS.has(action.move) && params.from === undefined && params.other === undefined) {
      const nearId = plan.characters.filter((c) => c.id !== character.id && otherAt(c.id, at.t)).sort((p, q) => Math.abs(otherAt(p.id, at.t)!.dx) - Math.abs(otherAt(q.id, at.t)!.dx))[0]?.id;
      // (NO LIMB THROUGH ANOTHER BODY: someone still standing right over it, it lies still until they have
      // stepped off — up to two seconds — then kips up clear of them.)
      if (nearId && action.move === "kipUp" && onTheGround(at.pose)) {
        let t = at.t;
        while (t < at.t + 2 && !kipUpClear(at.pose, otherAt(nearId, t)!)) t += 0.05;
        if (t > at.t + 1e-6) add(stand(at, { seconds: t - at.t }, settings));
      }
      const near = nearId ? otherAt(nearId, at.t) : undefined;
      if (near) params = { ...params, other: near };
    }
    // (FIGHTING SPOTS: getting its guard up, a fighter off its spot steps back to it first.)
    // (...and steps into its fighting stance on the way if it isn't in one: toSpot.)
    // FACE YOUR OPPONENT (round 11, Arthur: "get up fast, turn around — same thing for orange, turn around —
    // then they're back facing each other"): a fighter about to get its guard up or strike, with the other
    // one (standing) behind it — it got up on their far side, they stepped over it — turns round quickly first.
    // (Round 15, Arthur: "Blue is behind Red and Red doesn't know it — Red has to turn around"; and the hit
    // then pushed him the wrong way: "whatever direction he gets hit, the engine should know where the energy
    // comes from". So ALSO before taking a hit: a fighter never takes a punch from someone behind it without
    // having turned to face them first — the planner tells the attacker to wait for the turn, and the
    // reaction then throws the body away from where the strike really came from.)
    if ((action.move === "guard" || action.move === "getHit" || action.move === "barraged" || action.move === "barrage" || STRIKES.has(action.move)) && fightMiddle !== undefined && !onTheGround(at.pose) && at.facing !== "front") {
      const foeId = typeof params.target === "string" ? params.target : typeof params.from === "string" ? params.from : undefined;
      const foe = fighters.find((c) => c.id !== character.id && (foeId === undefined || c.id === foeId));
      const o = foe ? otherAt(foe.id, at.t) : undefined;
      if (o && o.dx < -0.05 && !onTheGround(o.pose)) add(turn(at, { to: at.facing === "right" ? "left" : "right" }, settings));
    }
    // HANDS DOWN ON THE WAY BACK (round 10, Arthur: "hands drop when the opponent is down"): with a long wait
    // ahead (the other is down or getting up), the hands sink first and the steps back are taken with them
    // down, not two seconds of shuffling in the guard; the guard raises them again just in time.
    if (action.move === "guard" && fightMiddle !== undefined) {
      const until = action.sync && !ignoreSync ? marks[action.sync.at] : undefined;
      if (until !== undefined && until - at.t >= RELAX_AFTER + 1 && !onTheGround(at.pose) && at.facing !== "front" && canSettle(at.pose, settings.guard)) {
        const k = 0.75 + 0.25 * (((until - at.t) * 5.17) % 1);
        add(beatsToKeys(at, [{ kind: "settle", seconds: 0.4 + 0.15 * ((until * 3.7) % 1), pose: relaxedPose(fightReadyPose(at.pose, hurt, settings.guard), k) }], { ...settings, style: settings.style === "robot" ? "robot" : "natural", speed: "normal" }));
      }
      // (STEP OFF THE ONE ON THE FLOOR, round 12: after a ground attack it steps back a fighting distance from
      // the one lying there — not over the body, which made them scoot far away to get up and walk all the way
      // back in, and not all the way to its spot.)
      const foe = GROUND_ATTACKS.has(actions[index - 1]?.move ?? "") ? fighters.find((c) => c.id !== character.id) : undefined;
      const lying = foe ? otherAt(foe.id, at.t) : undefined;
      if (foe && lying && onTheGround(lying.pose)) {
        const back = stepsTo(whereIs(foe.id, at.t) - forwardSign(at.facing) * STEP_OFF * plan.height, settings);
        if (back) add(back);
      } else toSpot(settings, SPOT_DRIFT);
    }
    // Contact moves need the figure's line width (the hand is the end of the line, so hands just touch).
    if (action.move === "highFive" && params.thickness === undefined) params = { ...params, thickness: character.look?.thickness ?? DEFAULT_STYLE.thickness };
    if (isGait(action.move) && holdingNow && params.carrying === undefined) params = { ...params, carrying: sizeOf(heldObject) ?? true };
    // CARRY BY WEIGHT (round 11): how heavy the held thing is says how it is carried (gaitMove). A light one
    // goes in one hand — the hand already holding it, else the right — unless the run starts in the air
    // out of a running jump (that lands holding it at the chest).
    if (isGait(action.move) && holdingNow && params.carrying !== undefined && params.carryWeight === undefined) {
      const weight = carryWeight(lookOf(heldObject), plan.height);
      params = { ...params, carryWeight: weight, ...(weight === "light" && !flying ? { carryHand: heldIn === "lHand" ? "l" : "r" } : {}) };
    }
    // ARRIVE INTO IT (round 7: no unnecessary standing pose): a walk or run straight into a move that goes
    // down (picking up, squatting, sitting) stops still leaning in, and that move skips its own little
    // wind-up: the braking steps already were the anticipation.
    if (isGait(action.move) && GOES_DOWN.has(next?.move ?? "") && params.keepLean === undefined) params = { ...params, keepLean: true };
    const previous = actions[index - 1]?.move;
    if (GOES_DOWN.has(action.move) && isGait(previous) && params.arriving === undefined) params = { ...params, arriving: true };
    // NOT WHILE THEY STUMBLE (round 7: "the same time the stick figure punches, the other should react"): in
    // a combo, the next strike never lands before the other one can react to it — its stumbling steps from
    // the last hit are done. The attacker holds its guard that moment longer.
    // (Round 9: ...and its reaction has had its own lead — a block's forearms come up just BEFORE the fist
    // arrives: the soonest the other one can meet this strike, as it worked out last time, `earliest`.)
    if (STRIKES.has(action.move) && typeof params.target === "string" && !ignoreSync && !onTheGround(at.pose)) {
      const open = strikes > 0 ? fight.reactions?.[`${character.id}.strike${strikes}`]?.open : undefined;
      const need = Math.max(open === undefined ? -Infinity : open + 0.02, fight.earliest?.[`${character.id}.strike${strikes + 1}`] ?? -Infinity);
      const trial = need === -Infinity ? null : run(entry, at, params, settings);
      const late = !trial ? 0 : need - (trial.marks.hit ?? at.t);
      if (late > GAP) {
        const holdUntil = at.t + late;
        add(beatsToKeys(at, [{ kind: "settle", seconds: Math.min(0.3, late), pose: fightReadyPose(at.pose, hurt, settings.guard) }], { ...settings, style: settings.style === "robot" ? "robot" : "natural", speed: "normal" }));
        if (holdUntil - at.t > GAP) add(stand(at, { seconds: holdUntil - at.t }, settings));
      }
    }
    let sync = action.sync;
    // Throwing: aim at the catcher. Catching: be ready exactly when the ball arrives (the k-th catch from
    // someone matches their k-th throw), after a flight that obeys gravity.
    // (AIM AT WHERE THEY ARE: after a walk the partner is somewhere else than where it started.)
    if (action.move === "throw" && typeof params.to === "string") {
      const catcher = plan.characters.find((c) => c.id === params.to);
      if (catcher && params.distance === undefined) params = { ...params, distance: Math.abs(whereIs(catcher.id, at.t) - at.x) };
      // ONE KIND PER PASS: a pass stays the kind (hand-off or throw) it was first worked out to be — the
      // two figures' steps change the distance a little between tries, and it must not flip back and forth.
      const pass = `${character.id}.throw${count[action.move]}`;
      if (params.handOff === undefined && fight.handOffs) {
        if (!fight.handOffs.has(pass)) fight.handOffs.set(pass, isHandOff(params as ThrowParams, plan.height));
        params = { ...params, handOff: fight.handOffs.get(pass) };
      }
      // THE CONTACT RULE (round 7): handing it over, the giver holds it out until the taker's hands are on
      // it (their catch matching this throw), and only then lets go.
      const taken = marks[`${params.to}.catch${count[action.move]}.catch`];
      if (catcher && taken !== undefined && params.until === undefined && isHandOff(params as ThrowParams, plan.height)) params = { ...params, until: taken };
    }
    // (A hand-off taker reaches for the ball right where the giver holds it out.)
    let takeFrom: { x: number; y: number } | undefined, takeK = 0;
    if (action.move === "catch" && typeof params.from === "string" && !sync) {
      const thrower = plan.characters.find((c) => c.id === params.from);
      const k = myEvents.filter((e) => e.kind === "catch").length + 1;
      const release = marks[`${params.from}.throw${k}.release`];
      const apart = thrower ? Math.abs(whereIs(thrower.id, release ?? at.t) - at.x) : 300;
      const gap = Math.max(40, apart - 0.5 * plan.height);
      // What kind of pass is coming (the thrower's k-th throw): a hand-off (so close they just hand it
      // over: no flight), a bounce pass (down to the floor and up), or a throw through the air.
      const thrown = { distance: apart, ...(thrower?.actions.filter((a) => a.move === "throw")[k - 1]?.params ?? {}) } as ThrowParams;
      // (Hand-off or throw: what the thrower really does — its throw left the mark "offer" if it holds the
      // ball out — so the two always agree, even when a step changed the distance.)
      const handing = release !== undefined ? marks[`${params.from}.throw${k}.offer`] !== undefined : isHandOff(thrown, plan.height);
      if (handing && params.handOff === undefined) {
        takeK = k;
        takeFrom = thrower && release !== undefined ? heldBall(fight.keys.get(thrower.id), release, thrower.facing, plan, String(params.object ?? "")) : undefined;
        params = { ...params, handOff: takeFrom !== undefined ? 2 * Math.abs(takeFrom.x - at.x) : apart };
        // (Timed from when the ball is held out — the giver then lets go exactly when these hands are on
        // it, so neither waits on the other's waiting.)
        sync = { mark: "catch", at: `${params.from}.throw${k}.offer`, offset: HANDOFF_SHOWN };
      } else {
        const hands = plan.groundY - catchPoint(at.facing, at.x, plan.height, plan.groundY).y;
        const flight = thrown.bounce ? bouncePassTime(releaseHeight(thrown, settings), hands) : flightTime(0, 0, defaultApex({ x: 0, y: 0 }, { x: gap, y: 0 }));
        sync = { mark: "catch", at: `${params.from}.throw${k}.release`, offset: flight };
      }
    }
    // (GRAB, SPIN, THROW, spinThrow.ts: the thrower is told where the one it grabs stands; the one thrown is
    // grabbed when the thrower grabs and is handed the thrower's keys — its hips go where those hands are.)
    if (action.move === "spinThrow" && typeof params.target === "string" && params.other === undefined) { const o = otherAt(params.target, at.t); if (o) params = { ...params, other: o }; }
    if (action.move === "spunThrown" && typeof params.from === "string" && !sync) {
      const k = count[action.move] ?? 1, thrower = plan.characters.find((c) => c.id === params.from), theirs = fight.keys.get(String(params.from));
      const [grab, spin, release] = ["grab", "spin", "release"].map((m) => marks[`${params.from}.spinThrow${k}.${m}`]);
      sync = { mark: "grab", at: `${params.from}.spinThrow${k}.grab` };
      if (thrower && theirs && grab !== undefined && spin !== undefined && release !== undefined) params = { ...params, spinner: { keys: theirs.slice(), facing: thrower.facing, height: plan.height, grab, spin, release } };
    }
    // IN REACH FIRST (round 16, Arthur: "Red is punching, and Blue's far away and he's getting punched. It's
    // like a portal. He needs to actually get close enough to where he can visually hit him"): a barrage never
    // starts out of reach. It turns to face them first if they are behind, then closes in to the barrage's own
    // distance — a jog or a run for a long way (no walking in a fight), fighting steps for a short one. (The
    // barrage's own small step in only covers the last bit.)
    if (action.move === "barrage" && typeof params.target === "string" && params.other === undefined && fightMiddle !== undefined && !onTheGround(at.pose) && at.facing !== "front") {
      const targetId = params.target;
      let o = otherAt(targetId, at.t);
      if (o && o.dx < -0.05 && !onTheGround(o.pose)) { add(turn(at, { to: at.facing === "right" ? "left" : "right" }, settings)); o = otherAt(targetId, at.t); }
      const H = plan.height, d = o ? (o.dx - BARRAGE_FROM) * H : 0;
      if (o && d > 0.15 * H) {
        const slow = settings.speed === "slow" || ["sad", "tired", "sneaky"].includes(settings.style) || (fightMiddle !== undefined ? hurt >= QUICK_UNTIL_HURT : settings.style === "hurt" || hurt >= 0.5);
        add(d <= ONE_STEP * H ? fightSteps(at, d, settings) : close(slow ? all.walk : d > 2 * H || (d > 1.2 * H && (settings.speed === "fast" || settings.energy >= 0.7)) ? all.run : all.jog, d, settings));
      }
    }
    // (BARRAGE, barrage.ts: the attacker is told where the other stands; the one barraged takes the k-th
    // barrage from `from`, timed to its first punch and handed when every punch lands.)
    if (action.move === "barrage" && typeof params.target === "string" && params.other === undefined) { const o = otherAt(params.target, at.t); if (o) params = { ...params, other: o }; }
    if (action.move === "barraged" && typeof params.from === "string" && !sync) {
      const k = count[action.move] ?? 1, landed: number[] = [];
      for (let i = 1; marks[`${params.from}.barrage${k}.hit${i}`] !== undefined; i += 1) landed.push(marks[`${params.from}.barrage${k}.hit${i}`]);
      sync = { mark: "hit1", at: `${params.from}.barrage${k}.hit1` };
      if (landed.length) params = { ...params, hits: landed.map((t) => t - landed[0]) };
      // (...and which barrage it is — its seed and count — so a STRONG punch snaps it back further.)
      const theirs = plan.characters.find((c) => c.id === params.from)?.actions.filter((x) => x.move === "barrage")[k - 1];
      if (theirs && params.seed === undefined) params = { ...params, seed: Number(theirs.params?.seed ?? 0), ...(theirs.params?.count !== undefined ? { count: theirs.params.count } : {}) };
    }
    if (action.move === "getHit" && typeof params.from === "string" && !sync) sync = { mark: "hit", at: `${params.from}.strike${hitsFrom[params.from]}.hit` };
    // (Ground fighting: the k-th ground defence against someone answers their k-th ground attack, on its landing.)
    if (GROUND_MOVES.has(action.move) && !GROUND_ATTACKS.has(action.move) && typeof params.from === "string" && !sync) {
      const k = (groundFrom[params.from] = (groundFrom[params.from] ?? 0) + 1);
      sync = { mark: "hit", at: `${params.from}.groundHit${k}` };
      if (params.other === undefined) { const o = otherAt(params.from, at.t); if (o) params = { ...params, other: o }; }
      // (LIFT AND SLAM, liftSlam.ts: the one lifted is handed the lifter's keys — its hips go where those hands are.)
      const slamAt = marks[`${params.from}.groundHit${k}`], lifter = plan.characters.find((c) => c.id === params.from), carried = fight.keys.get(String(params.from));
      if (action.move === "slammed" && slamAt !== undefined && lifter && carried) {
        let n = 1;
        while (marks[`${params.from}.liftSlam${n}.slam`] !== undefined && Math.abs(marks[`${params.from}.liftSlam${n}.slam`] - slamAt) > 1e-6) n += 1;
        const grabAt = marks[`${params.from}.liftSlam${n}.grab`];
        if (grabAt !== undefined) params = { ...params, carrier: { keys: carried.slice(), facing: lifter.facing, height: plan.height, grab: grabAt, slam: slamAt, lift: marks[`${params.from}.liftSlam${n}.lift`] } };
      }
    }
    // FEET FIRST: planted feet never slide. If this move would need them somewhere else (closer together
    // after a fighting stance, before a squat), the figure first steps them into its standing stance.
    // (A sit always does: a hurt one lifts its feet to stretch the legs out, so they aren't planted all the
    // way through, but it sits down from — and stands back up into — its own stance.)
    if (!flying && !onTheGround(at.pose) && !(Number(params.speed ?? 0) > 0) && stanceDifference(at.pose, restPoseFor(at.facing), at.facing) > FEET_SLACK
      && (action.move === "sit" || feetMustMove(run(entry, at, params, settings).keys) > FEET_SLACK)) add(stepInto(at, restPoseFor(at.facing), settings));
    if (sync && !ignoreSync && !flying) {
      const target = marks[sync.at];
      if (target === undefined) { if (neverComes(sync.at.split(".")[0])) break; return null; }
      const trial = run(entry, at, params, settings);
      // (Mark "start": the move starts at that moment.)
      const lead = sync.mark === "start" ? 0 : (trial.marks[sync.mark] ?? trial.end.t) - at.t;
      const wait = target + (sync.offset ?? 0) - lead - at.t;
      // (A STRIKE NEVER LANDS BEFORE THE OTHER CAN REACT: the soonest this reaction can meet its hit — once
      // what it is doing now is over, plus the reaction's own lead — told to the attacker.)
      if (action.move === "getHit" && typeof params.from === "string" && fight.earliest) fight.earliest[`${params.from}.strike${hitsFrom[params.from]}`] = at.t + lead;
      if (wait > GAP) {
        // REST WHILE WAITING, READY JUST IN TIME (Arthur, round 4: "isn't he going to be tired? He has to
        // go to the standing pose. He has to be ready. And then when he's ready, his arms go out"): while
        // waiting for its moment, a figure doesn't freeze in the last move's leftover pose (an arm out
        // after a throw) or hold the next move's pose for ages; it settles into its resting stand (holding
        // the ball at the chest if it has it) and breathes. The next move then starts just in time, with
        // its own short get-ready (a catch raises the hands as the ball comes).
        if (!onTheGround(at.pose)) {
          // (IN A FIGHT, WAIT IN THE GUARD: before a fight move a fighter keeps its hands up, in its
          // fighting stance — slumped as it gets hurt — instead of dropping into a relaxed stand.)
          const fighting = (FIGHT_MOVES.has(action.move) || action.move === "guard") && at.facing !== "front";
          const waitUntil = at.t + wait;
          // (HANDS DOWN WHILE THE OTHER IS DOWN, hit.ts guardUp: an attacker with a long wait before its next
          // exchange — the other is down, getting up or staggering — lets its hands sink; its guard raises them again.)
          // (NATURAL STAND, round 11: a default fighter with time to spare waits in its natural stand, stepping
          // out of a strike's wide stance; a short wait inside a combo keeps the feet where they are.)
          const natural = fighting && settings.guard !== "realistic" && wait >= 0.6;
          const readyRest = natural ? standReadyPose(at.pose, hurt, settings.guard) : fightReadyPose(at.pose, hurt, settings.guard);
          const relax = fighting && action.move === "guard" && wait >= RELAX_AFTER + 0.3 && canSettle(at.pose, settings.guard);
          const rest = holdingNow ? holdPose(sizeOf(heldObject), plan.height) : relax ? relaxedPose(readyRest, 0.75 + 0.25 * ((wait * 5.17) % 1)) : fighting ? readyRest : restPoseFor(at.facing);
          // Feet wide apart (a throw's or punch's stance)? Step them back under the body (feet first).
          // (A fighter already in a fighting stance — it walked up into its guard — just settles: no stamp.)
          const inStance = fighting && (natural ? readyFeet(at.pose, settings.guard) : canSettle(at.pose, settings.guard));
          const step = !inStance && stanceDifference(at.pose, rest, at.facing) > FEET_SLACK ? stepInto(at, rest, settings) : null;
          if (step && step.end.t < waitUntil - GAP) add(step);
          else {
            const settle = Math.min(0.45, wait * 0.6);
            // (Too short a wait to settle calmly: it stays as it is — a snap into the rest pose would pop.
            // A fighter's guard is left to the fight rules.)
            // NO SNAP INTO THE GUARD (round 9): a fighter with too little time to settle all the way (the next
            // hit lands a moment after the last reaction) goes only as far toward its guard as a calm settle
            // gets in that time — the next reaction starts from there — never the whole body in one picture.
            const part = fighting && settle < MIN_REST_SETTLE ? settle / MIN_REST_SETTLE : 1;
            if (settle >= MIN_REST_SETTLE || fighting) add(beatsToKeys(at, [{ kind: "settle", seconds: settle, pose: part < 1 ? blendPose(at.pose, rest, part) : rest }], { ...settings, style: settings.style === "robot" ? "robot" : "natural", speed: "normal" }));
          }
          if (waitUntil - at.t > GAP) add(stand(at, { seconds: waitUntil - at.t }, settings));
        } else add(stand(at, { seconds: wait }, settings));
      }
    }
    // Picking something up: it's lying where the hand will reach it (the planner puts it there).
    let grab: { x: number; y: number } | undefined;
    if (action.move === "pickUp" && typeof params.object === "string") {
      const thing = plan.objects?.find((o) => o.id === params.object);
      if (thing && params.size === undefined) params = { ...params, size: thing.look.size };
      grab = grabPoint(at, params as PickUpParams, settings, plan.groundY);
    }
    // MOMENTUM: a walk or run followed by a move that takes momentum (a fall = a trip) doesn't slow down
    // and stop first: it covers its distance at speed and hands over mid-stride, with its speed.
    let trips = isGait(action.move) && next !== undefined && TAKES_MOMENTUM.has(next.move);
    const moveStart = at;
    // EYES (round 7, gaze.ts): a move done to or with someone — waving to them, a high-five, a throw to them
    // or a catch from them, a punch at them — gets a LOOK TARGET (`look`: where their face is from this
    // figure's eyes, in its own view), so it looks at them: up when they are higher, down when lower.
    // With nobody there, the move looks where the figure faces.
    // AIM AT WHERE THEY ARE (high-five, the contact rule): the hands meet half way between the two figures
    // as they really stand when the high-five starts (after a turn or a walk), not where the plan guessed —
    // when the partner is known and within reach.
    if (action.move === "highFive" && at.facing !== "front") {
      const who = lookedAt("highFive", params);
      const gap = who ? Math.abs(whereIs(who, at.t) - at.x) : 0;
      if (gap > 1 && gap <= highFiveMaxDistance(plan.height) && Math.abs(gap - Number(params.partnerDistance ?? 0)) > 0.5) params = { ...params, partnerDistance: gap };
    }
    // (They may be moving — jumping, walking up: it looks where they are at the move's main moment.)
    if (LOOKS_AT.has(action.move) && params.look === undefined && at.facing !== "front") {
      const who = lookedAt(action.move, params);
      const face = who ? faceOf(who, run(entry, at, params, settings).marks[LOOKS_AT.get(action.move)!] ?? at.t) : undefined;
      if (face) params = { ...params, look: lookTarget(eyesOf(at.pose, at.facing, at.x, plan.height, plan.groundY), face, at.facing) };
    }
    // ONE WAY ROUND (round 8, highFive.ts): an arm never turns more than about 300 degrees in a second, even
    // across two moves. How far the arm `side` turns over this move (to its hand-over) and the next one:
    const flowsOn = next && all[next.move] && !isGait(next.move);
    const nextSettings = () => hurtSettings({ height: plan.height, style: next!.style ?? character.style ?? "natural", speed: next!.speed ?? character.speed ?? "normal", energy: next!.energy ?? character.energy ?? 0.5 }, hurt, next!.style !== undefined, fightMiddle !== undefined ? QUICK_UNTIL_HURT : HURT_STYLE_AT);
    const turnAcross = (trial: Record<string, unknown>, side: "l" | "r") => {
      const mine = run(entry, at, trial, settings);
      if (!mine.flow) return { most: Infinity, total: Infinity };
      const then = run(all[next!.move], mine.flow.stance, next!.params ?? {}, nextSettings());
      return armTurn([...mine.keys.slice(0, mine.flow.keys), ...then.keys.slice(1)], side);
    };
    // A high-five with another move straight after hands its arm over either still up or back down at the
    // chest — whichever turns the arm least in any second, counting the next move too (never round a whole
    // circle, never an elbow spun back round).
    if (action.move === "highFive" && params.handOver === undefined && flowsOn) {
      const turnOf = (handOver: "up" | "down", handOverHold = 0) => turnAcross({ ...params, handOver, handOverHold }, "l");
      // (If one still turns it too far in a second — the next move swings that arm straight on round — the arm
      // waits at the hand-over a moment first, no longer than it must: the one that needs the shorter wait wins.)
      const options = (["up", "down"] as const).map((handOver) => {
        let handOverHold = 0, turn = turnOf(handOver);
        while (handOverHold < 1 && turn.most > ARM_TURN_MAX) { handOverHold = Math.round((handOverHold + 0.05) * 100) / 100; turn = turnOf(handOver, handOverHold); }
        return { handOver, handOverHold, turn };
      });
      const best = options.reduce((a, b) => (b.handOverHold < a.handOverHold - 1e-9 || (Math.abs(b.handOverHold - a.handOverHold) < 1e-9 && turnsLess(b.turn, a.turn)) ? b : a));
      params = { ...params, handOver: best.handOver, ...(best.handOverHold > 0 ? { handOverHold: best.handOverHold } : {}) };
    }
    // A wave the same (round 10): if the next move would swing the waving arm on round from up high (a jump
    // swinging its arms back and up), the arm first comes down, then the next move starts.
    if (action.move === "wave" && params.handOver === undefined && flowsOn) {
      const waving = (params.hand ?? (at.facing === "front" ? "right" : at.facing === "right" ? "left" : "right")) === "left" ? "l" : "r";
      const up = turnAcross(params, waving);
      if (up.most > ARM_TURN_MAX) {
        const down = turnAcross({ ...params, handOver: "down" }, waving);
        if (down.most < up.most) params = { ...params, handOver: "down" };
      }
    }
    // A throw (not a hand-off) the same: if the next move would swing the throwing arm straight on round
    // (out of the follow-through, down and back for a jump), the arm holds its follow-through a moment first.
    if (action.move === "throw" && params.handOverHold === undefined && flowsOn && !isHandOff(params as ThrowParams, plan.height)) {
      let handOverHold = 0, turn = turnAcross(params, "r");
      while (handOverHold < 1 && turn.most > ARM_TURN_MAX) { handOverHold = Math.round((handOverHold + 0.05) * 100) / 100; turn = turnAcross({ ...params, handOverHold }, "r"); }
      if (handOverHold > 0) params = { ...params, handOverHold };
    }
    // HANDS ON THE BALL (the contact rule): a hand-off taker's hands close on the ball exactly where the
    // giver holds it. Try the take, look at both figures as the engine draws them when the hands close
    // (planted feet put the hips where they go; a leg that can't reach lowers the hips), and reach that
    // much further, shorter, higher or lower.
    if (takeFrom !== undefined && typeof params.from === "string") {
      const giver = plan.characters.find((c) => c.id === params.from)!;
      const size = plan.objects?.find((o) => o.id === params.object)?.look.size ?? 48;
      params = { ...params, handOff: 2 * Math.abs(takeFrom.x - at.x) };
      for (let i = 0; i < 5; i += 1) {
        const trial = run(entry, at, params, settings);
        const catchT = trial.marks.catch;
        const giverKeys = fight.keys.get(giver.id);
        if (catchT === undefined || !giverKeys?.length) break;
        // (The feet are planted where they are now: everything so far, then the take, as `add` does it.)
        const last = keys[keys.length - 1], planter = footPlanter(plan.height);
        planter(keys);
        const joined = last && trial.keys.length && Math.abs(last.t - trial.keys[0].t) < GAP;
        const placed = planter(joined ? [last, ...trial.keys.slice(1)] : trial.keys);
        const mine = [...keys, ...(joined ? placed.slice(1) : placed)];
        // (The giver holds it out still from "offer" until it lets go: look at it there.)
        const offer = marks[`${giver.id}.throw${takeK}.offer`] ?? catchT, letGo = marks[`${giver.id}.throw${takeK}.release`] ?? catchT;
        const fps = 24, frame = Math.ceil(catchT * fps - 1e-6), giverFrame = Math.max(Math.ceil(offer * fps - 1e-6), Math.min(frame, Math.floor(letGo * fps + 1e-6) - 1));
        const look = (c: CharacterPlan, k: CharacterKey[]) => ({ id: c.id, name: c.id, facing: c.facing, height: plan.height, style: { ...DEFAULT_STYLE, ...c.look }, keys: k });
        const built = buildScene({ id: "take", title: "take", groundY: plan.groundY, durationSec: Math.max(frame, giverFrame) / fps + 0.01, characters: [look(giver, giverKeys), look(character, mine)] }, fps);
        const at24 = (f: number, n: number) => built.frames[Math.min(f, built.frames.length - 1)][n];
        const [them, me] = [at24(giverFrame, 0), at24(frame, 1)];
        const held = heldCenter(them, "hands", size / 2), reached = heldCenter(me, "hands", size / 2);
        const short = (held.x - reached.x) * forwardSign(at.facing), low = reached.y - held.y;
        if (Math.abs(short) < 0.25 && Math.abs(low) < 0.25) break;
        params = { ...params, handOff: Math.max(0, Number(params.handOff) + 2 * short), handOffRise: Number(params.handOffRise ?? 0) + low / plan.height };
      }
    }
    // ROOM TO FALL (hit.ts): a hit's reaction knows how much page there is behind the figure.
    const edge = pageEdgeBehind();
    if (action.move === "getHit" && edge !== undefined && params.room === undefined) params = { ...params, room: Math.max(0, (at.x - edge) * forwardSign(at.facing)) };
    // (K11 GET UP CLEAR, hit.ts getUpRoom: a knock-down knows where its attacker stands while it gets up.)
    if (action.move === "getHit" && typeof params.from === "string" && params.other === undefined) { const o = otherAt(params.from, at.t + 1.5); if (o) params = { ...params, other: o }; }
    // ARRIVE IN THE GUARD (hit.ts walkIntoGuard): a fighter's walk straight into a fight move lands its last
    // step in the fighting stance, the hands coming up — no stop, stand and stamp into the guard.
    const intoGuard = action.move === "walk" && fightMiddle !== undefined && (FIGHT_MOVES.has(next?.move ?? "") || next?.move === "guard") && !holdingNow && !onTheGround(at.pose) && at.facing !== "front";
    // (No run-up, no running jump: a walk or run shorter than RUN_UP, or that has hardly got going — slower
    // than JUMP_MOMENTUM — stops first, and the jump is a standing jump.)
    const cutShort = trips && !flying ? untilTrip(entry, at, params, settings, action.move as GaitKind, next!.move === "jump" || next!.move === "dashPunch") : undefined;
    if (cutShort && next!.move === "jump" && ((cutShort.marks.speed ?? 0) < JUMP_MOMENTUM * plan.height || Number(params.distance ?? 300) < RUN_UP * plan.height)) trips = false;
    const out = flying ? flyingRun(flying, at, Number(params.distance ?? 300), trips ? next!.move : undefined)
      : trips && cutShort ? cutShort
      : action.move === "walk" && fightMiddle !== undefined && !holdingNow && !onTheGround(at.pose) && at.facing !== "front" && brisk(settings) ? calmlyTo(Number(params.distance ?? 300), settings, params)
      : intoGuard ? remember(JSON.stringify(["intoGuard", at, params, settings, STRIKES.has(next?.move ?? "")]), () => walkIntoGuard((d) => entry.run(at, { ...params, distance: d }, settings), at, Number(params.distance ?? 300), settings, !STRIKES.has(next?.move ?? "")))
      : run(entry, at, params, settings);
    // HANDS BUSY (round 6): holding something, a move that needs one hand (a high-five, a wave, a punch)
    // first takes the thing in the other hand. The engine sees which arm the move really uses: the one
    // that moves far more than the other.
    let dropped = false;
    // TURNING WITH IT (round 8): a turn brings the arms down to step round (the view switches with an arm
    // hanging straight), so a held thing is carried in one hand through it — the hand that moves less —
    // and stays touching that hand all the way round.
    if (holdingNow && heldObject && action.move === "turn" && out.keys.length > 1) {
      const used = (side: "l" | "r") => out.keys.slice(1).reduce((sum, k, i) => sum + Math.abs(k.pose[`${side}Shoulder`] - out.keys[i].pose[`${side}Shoulder`]) + Math.abs(k.pose[`${side}Elbow`] - out.keys[i].pose[`${side}Elbow`]), 0);
      heldIn = used("l") > used("r") ? "rHand" : "lHand";
      myEvents.push({ object: heldObject, kind: "oneHand", t: out.keys[0].t, character: character.id, joint: heldIn });
    }
    // CARRY BY WEIGHT (round 11): a light thing carried in one hand while walking is in that hand from the
    // first step (the arm lowers it to the side over CARRY_LIFT).
    if (holdingNow && heldObject && isGait(action.move) && !flying && (params.carryHand === "l" || params.carryHand === "r") && heldIn !== `${params.carryHand}Hand` && out.keys.length > 1) {
      heldIn = params.carryHand === "l" ? "lHand" : "rHand";
      myEvents.push({ object: heldObject, kind: "oneHand", t: out.keys[0].t, character: character.id, joint: heldIn });
    }
    if (holdingNow && heldObject && !HANDLES_OBJECTS.has(action.move) && out.keys.length > 1) {
      const used = (side: "l" | "r") => out.keys.slice(1).reduce((sum, k, i) => sum + Math.abs(k.pose[`${side}Shoulder`] - out.keys[i].pose[`${side}Shoulder`]) + Math.abs(k.pose[`${side}Elbow`] - out.keys[i].pose[`${side}Elbow`]), 0);
      const l = used("l"), r = used("r");
      if (FALLS.has(action.move)) {
        // LET GO TO CATCH THE FALL (round 8): falling, the hands are needed to catch the body, so they let go
        // of what they hold the moment it trips or slips: it keeps the speed the hands had, drops under
        // gravity, bounces and rolls (a box slides) to a stop on the floor, and lies there (objects.ts drop).
        myEvents.push({ object: heldObject, kind: "release", t: out.keys[0].t, character: character.id, drop: { vx: forwardSign(at.facing) * Math.max(0, Number(params.speed ?? 0)), vy: 0 } });
        dropped = true;
      } else if (!HANDS_ONLY_HELP.has(action.move) && Math.max(l, r) > 30 && Math.max(l, r) > 2 * Math.min(l, r)) {
        heldIn = l > r ? "rHand" : "lHand";
        myEvents.push({ object: heldObject, kind: "oneHand", t: out.keys[0].t, character: character.id, joint: heldIn });
      }
      else {
        // HOLD ON TO IT (rounds 7-8): a move that doesn't need the hands (a kick, a squat, sitting, jumping,
        // turning, looking round) keeps them holding the thing at the chest (as big as it is) instead of
        // swinging it off the hands or putting a hand down — and lifts it off the floor if it would touch.
        const hold = holdArms(sizeOf(heldObject), plan.height);
        // (In one hand after a wave or a turn: both hands take it again as the arms come to the hold.)
        if (heldIn !== "hands") { myEvents.push({ object: heldObject, kind: "twoHands", t: out.keys[1].t, character: character.id }); heldIn = "hands"; }
        out.keys = out.keys.map((k, i) => (i === 0 ? k : { ...k, pose: { ...k.pose, ...hold } }));
        const look = lookOf(heldObject);
        if (look) out.keys = liftOffFloor(out.keys, at.facing, plan, look);
        // (The move's end and flow point are its keys at those moments, as held.)
        const keyAt = (t: number) => out.keys.find((k) => Math.abs(k.t - t) < GAP)?.pose;
        out.end = { ...out.end, pose: keyAt(out.end.t) ?? { ...out.end.pose, ...hold } };
        if (out.flow) out.flow = { ...out.flow, stance: { ...out.flow.stance, pose: keyAt(out.flow.stance.t) ?? { ...out.flow.stance.pose, ...hold } } };
      }
    }
    momentum = trips ? out.marks.speed ?? 0 : 0;
    if (trips) delete out.marks.speed;
    if (grab && typeof params.object === "string") {
      if (out.marks.grab !== undefined) myEvents.push({ object: params.object, kind: "grab", t: out.marks.grab, character: character.id, joint: grabJoint(params as PickUpParams), at: grab });
      if (out.marks.twoHands !== undefined) myEvents.push({ object: params.object, kind: "twoHands", t: out.marks.twoHands, character: character.id });
    }
    // RUN FROM THE LOOK (Arthur, round 7: "The second he looks back over there, he has to be running — not
    // turning to look forward first"): a move that marks `go` (lookBack: the look is over), followed by a
    // walk or run, hands over right there. Its turn back to the front is skipped (NO UNNECESSARY KEY
    // POSES): the walk or run starts at once from the looking-back pose and turns the head and shoulders
    // forward as it gets going (GO FROM WHERE YOU ARE).
    const goNow = isGait(next?.move) && out.marks.go !== undefined ? out.keys.findIndex((k) => Math.abs(k.t - out.marks.go) < 1e-9) : -1;
    if (goNow > 0) for (const name of Object.keys(out.marks)) if (out.marks[name] > out.marks.go + 1e-9) delete out.marks[name];
    // (A throw that was a hand-off in an earlier try may be a real throw now: no old "offer" mark.)
    if (action.move === "throw" && out.marks.offer === undefined) delete marks[`${character.id}.throw${count[action.move]}.offer`];
    // (The same for every move: built again, a move may come out differently — a flinch that is a stagger
    // now — and the marks of what it no longer does go, so they never mix: no "flinch" and "catch" both.)
    const ownMarks = `${character.id}.${action.move}${count[action.move]}.`;
    for (const name of Object.keys(marks)) if (name.startsWith(ownMarks) && out.marks[name.slice(ownMarks.length)] === undefined) delete marks[name];
    for (const [name, t] of Object.entries(out.marks)) {
      local[name] = t;
      marks[`${character.id}.${name}`] = t;
      marks[`${character.id}.${action.move}${count[action.move]}.${name}`] = t;
    }
    // (Ground fighting: every ground attack's landing is also "<id>.groundHit<k>".)
    if (GROUND_ATTACKS.has(action.move) && out.marks.stomp !== undefined) marks[`${character.id}.groundHit${(groundHits += 1)}`] = out.marks.stomp;
    // (FACE YOUR OPPONENT, round 11: up again in a fight with the other one standing behind it — it got up
    // on their far side — it turns round to face them straight away, not with its back to them.)
    if ((action.move === "getUp" || action.move === "kipUp") && fightMiddle !== undefined && !onTheGround(at.pose) && at.facing !== "front") {
      const foe = fighters.find((c) => c.id !== character.id);
      const o = foe ? otherAt(foe.id, at.t) : undefined;
      if (o && o.dx < -0.05 && !onTheGround(o.pose)) add(turn(at, { to: at.facing === "right" ? "left" : "right" }, settings));
    }
    // STRIKE POWER (hit.ts): every punch or kick is also "<id>.strike<k>", with how hard it really was.
    if ((STRIKES.has(action.move) || action.move === "dashPunch") && out.marks.hit !== undefined) {
      strikes += 1;
      marks[`${character.id}.strike${strikes}.hit`] = out.marks.hit;
      fight.power[`${character.id}.strike${strikes}`] = strikePowerOf(out, moveStart, settings);
    }
    if (out.marks.out !== undefined) knockedOut = true;
    if (action.move === "getHit" && typeof params.from === "string" && fight.reactions) {
      // (`open`: from when it can take the next hit — its stumbling steps are done: the reaction's flow point.)
      fight.reactions[`${params.from}.strike${hitsFrom[params.from]}`] = { down: out.marks.knockdown !== undefined, out: out.marks.out !== undefined, ready: out.marks.ready ?? out.marks.out ?? out.end.t, open: out.flow?.stance.t ?? out.marks.ready ?? out.end.t };
    }
    if (typeof params.object === "string") {
      if (action.move === "throw" && out.marks.oneHand !== undefined) myEvents.push({ object: params.object, kind: "oneHand", t: out.marks.oneHand, character: character.id });
      if (action.move === "throw" && out.marks.release !== undefined) {
        const away = params.to === "away" ? awayVelocity(at.facing, plan.height) : undefined;
        myEvents.push({ object: params.object, kind: "release", t: out.marks.release, character: character.id, ...(params.bounce === true ? { bounce: true } : {}), ...(away ? { away } : {}), ...(out.marks.offer !== undefined ? { handOff: true } : {}) });
      }
      if (action.move === "catch" && out.marks.catch !== undefined) myEvents.push({ object: params.object, kind: "catch", t: out.marks.catch, character: character.id, ...(params.handOff !== undefined ? { handOff: true } : {}) });
    }
    lastPunchHand = action.move === "punch" ? String(params.hand) : null;
    if (action.move === "catch" || (action.move === "pickUp" && typeof params.object === "string")) { holdingNow = true; heldObject = typeof params.object === "string" ? params.object : heldObject; heldIn = "hands"; }
    if (action.move === "throw" || dropped) { holdingNow = false; heldObject = undefined; }
    effort += EFFORT[action.move]?.(params) ?? 0;
    // (Catching its breath is resting: it doesn't end out of breath again straight after.)
    if (action.move === "catchBreath") effort = 0;
    // FLOW (Arthur, 2026-10-04): if another move follows straight away, skip this move's return to rest
    // and start the next one from where this one's action ended (punch -> punch, run -> grab). Rest only
    // when needed: before walking or running (they start from a stand), before a long pause, and at the end.
    // THE END OF A FIGHT (Arthur, round 6): a fight that ends with a punch or kick doesn't step back into
    // a tall stand (the kick's foot would land, lift and land again): it stays in its fighting stance,
    // as tired as the effort so far, breathing hard for a moment (punch.ts fightRest).
    const fightEnds = !next && STRIKES.has(action.move) && !!out.flow && !onTheGround(out.flow.stance.pose);
    // A lot of effort with no rest (and not a fight): end out of breath, bent over, then a tired stand.
    const outOfBreath = !next && !fightEnds && effort >= TIRED_AFTER && settings.style !== "robot";
    // (A short walk right after a punch or kick is a fighting step in the guard, so the guard flows into it.)
    const nextIsShuffle = next?.move === "walk" && Number(next.params?.distance ?? 300) <= 0.6 * plan.height && FIGHT_MOVES.has(action.move);
    // (A hit taken in a fight is seen all the way through — guard back, back to its spot — unless the
    // attacker's next strike follows straight on: in a combo the next hit lands while it recovers.)
    const wholeHit = action.move === "getHit" && fightMiddle !== undefined && !(next?.move === "getHit" && next.params?.from === params.from && comboGoesOn(String(params.from), hitsFrom[String(params.from)] ?? 0));
    const flows = out.flow && !wholeHit && (outOfBreath || fightEnds || (next && (nextIsShuffle || !isGait(next.move)) && !(next.move === "wait" && Number(next.params?.seconds ?? 1) >= 1)));
    // (FIGHTING SPOTS: an attack that stepped in, once the combo is over — the fighter waits to be hit, or
    // the fight is over — ends with fighting steps back to its spot, after the strike's own return to the
    // guard; only if they are done before the next hit lands: a reaction is never late. Mark
    // "<id>.strike<k>.done": back on guard, on its spot — always set, even when it can't step (bent far over,
    // hurt): the other one may be waiting for that moment, and a moment that never comes would leave it
    // waiting for ever.)
    // GUARD STAYS UP IN A FIGHT (Arthur, round 9: "at random times he steps back, puts his hands down, comes
    // back and gets his hands up... like he's confused"): the strike ends at its return to the guard (its
    // FLOW point), never its drop into a relaxed stand, and the steps back to its spot are taken in the guard.
    // (...and before taking a barrage too — round 16: a strike followed by "barraged" never set its "done", the other one
    // waited for it for ever and the fight was cut after 9 s.)
    const homeAfter = STRIKES.has(action.move) && fightMiddle !== undefined && (next?.move === "getHit" || next?.move === "barraged" || !next);
    if (homeAfter) {
      add(out.flow ? { ...out, keys: out.keys.slice(0, out.flow.keys), end: out.flow.stance } : out);
      const steps = stepsTo(spotX(), settings);
      const from = (next?.move === "getHit" || next?.move === "barraged") && typeof next.params?.from === "string" ? next.params.from : undefined;
      const nextHit = from === undefined ? undefined : next?.move === "barraged" ? marks[`${from}.barrage${(count.barraged ?? 0) + 1}.hit1`] : marks[`${from}.strike${(hitsFrom[from] ?? 0) + 1}.hit`];
      if (steps && (nextHit === undefined || steps.end.t < nextHit - 0.05)) add(steps);
      marks[`${character.id}.strike${strikes}.done`] = at.t;
    }
    else if (wholeHit && !out.marks.out) {
      // (FIGHTING SPOTS: knocked off its spot, once its guard is back it steps back to it — from where its
      // planted feet really put it — and only then is it `ready`.)
      add(out);
      if (toSpot(settings, SPOT_DRIFT)) {
        marks[`${character.id}.ready`] = marks[`${character.id}.getHit${count.getHit}.ready`] = at.t;
        const reaction = fight.reactions?.[`${params.from}.strike${hitsFrom[String(params.from)]}`];
        if (reaction) reaction.ready = at.t;
      }
    }
    else if (goNow > 0) {
      const here = out.keys[goNow];
      add({ ...out, keys: out.keys.slice(0, goNow + 1), end: { t: here.t, x: here.x, facing: here.facing ?? out.end.facing, pose: here.pose } });
    } else if (flows) add({ ...out, keys: out.keys.slice(0, out.flow!.keys), end: out.flow!.stance });
    else add(out);
    if (fightEnds) {
      // (How tired: the effort so far over what makes a body tired; a tired or hurt body tires twice as
      // fast. REALLY TIRED (punch.ts): bent over, straight arms propped on the knees, staying down.)
      const effortK = Math.max(0.25, effort / TIRED_AFTER);
      const tired = settings.style === "tired" || settings.style === "hurt" ? Math.max(1, 2 * effortK) : effortK;
      const rest = tired >= REALLY_TIRED && settings.style !== "robot" ? catchBreath(at, { stay: true }, settings) : fightRest(at, { tired }, settings);
      for (const [name, t] of Object.entries(rest.marks)) marks[`${character.id}.${name}`] = t;
      add(rest);
    }
    if (outOfBreath) {
      const tired = catchBreath(at, {}, settings);
      for (const [name, t] of Object.entries(tired.marks)) marks[`${character.id}.${name}`] = t;
      add(tired);
    }
  }
  events.push(...myEvents);
  if (keys.length === 0) keys.push({ t: 0, x: at.x, pose: at.pose, contacts: ["lFoot", "rFoot"], facing: at.facing, lift: 0 });
  return keys;
}

const STAGE_MIDDLE = 960;
// The page fit keeps this much (x the page width) free at each side.
const PAGE_MARGIN = 0.04;
// Where a move's hips are (x) at time t, from its keys.
const xAt = (keys: readonly CharacterKey[], t: number) => {
  const after = keys.findIndex((k) => k.t > t);
  if (after < 0) return keys[keys.length - 1].x;
  if (after === 0) return keys[0].x;
  const a = keys[after - 1], b = keys[after];
  return a.x + ((b.x - a.x) * (t - a.t)) / Math.max(1e-6, b.t - a.t);
};
// EYES: moves that are done to or with someone, and so get a look target (their `look` param), and the
// moment of each that matters most (where the other one is then is where it looks). (A kick at nobody looks
// at the spot its foot hits: kick.ts.)
const LOOKS_AT = new Map([["wave", "up"], ["highFive", "slap"], ["throw", "release"], ["catch", "catch"], ["punch", "hit"], ["kick", "hit"]]);
const FIGHT_MOVES = new Set(["punch", "kick", "getHit", "stomp"]);
// Moves that carry on the speed of a walk or run right before them (param `speed`, px/s).
// (A jump after a walk or run is a RUNNING JUMP: it takes off from the stride, jump.ts.)
// (A dash punch takes the run's speed too: dash.ts.)
const TAKES_MOMENTUM = new Set(["fall", "fallDown", "jump", "dashPunch"]);
// Moves that travel on foot: walk, jog (the in-between speed, never airborne) and run.
const GAITS = new Set(["walk", "jog", "run"]);
const isGait = (move?: string) => GAITS.has(move ?? "");
const JUMP_MOMENTUM = 0.5; // x height per second: slower than this (a tired shuffle) a jump stands first
const RUN_UP = 0.3; // x height: a shorter walk or run before a jump is no run-up (it stands first); about one stride
const RUN_IN_FROM = 0.35; // x height (round 16: was 0.8 — a 0.7 x height walk to the one down took 3 s): a fighter further than this from the one down jogs / runs in (RUN IN ON THE ONE DOWN)
// ACCIDENTS HAVE A CAUSE: moves right before a fall that already explain it (a trip after a walk or run, a
// hit, a landing, a strike or stomp that overbalances). Any other fall with no direction is an accident:
// ACCIDENT_STEPS x height of walking first (about two steps), then the trip.
const CAUSES_A_FALL = new Set(["walk", "jog", "run", "getHit", "jump", "punch", "kick", "stomp"]);
const ACCIDENT_STEPS = 0.6;
// RIGHT GAIT FOR THE DISTANCE (W14): further than this (x height), a lively fighter jogs into the fight.
const FIGHT_JOG = 0.6;
// NO WALKING IN (round 16, Arthur: "no more walking ... get there fast"; a 0.55 x height walk in took 2 s, the
// fight stood still): in a fight, a gap of more than ONE_STEP (x height) is jogged or run, not walked —
// unless the fighter is slow, sad, tired or badly hurt (QUICK_UNTIL_HURT of damage: a fighter's look turns
// "hurt" from HURT_STYLE_AT, long before it is too hurt to jog in).
const ONE_STEP = 0.3;
const QUICK_UNTIL_HURT = 0.8;
// Moves that go straight back down to the floor: a get-up before one stops part of the way up (it may end
// sitting: only moves that start well from sitting).
const BACK_DOWN = new Set(["sit"]);
// FEET STAY ON THE FLOOR (round 7): a fighting step keeps both feet within the legs' reach. From a wide
// stance (an angry punch) one long shuffle would leave a planted foot out of reach — drawn up off the
// floor while it counts as standing, so whatever comes next (a sit) starts from a foot in the air. A gap
// one shuffle can't close that way is closed in two (or more) shorter shuffles.
function shuffleIn(start: Stance, distance: number, settings: MoveSettings): MoveOutput {
  // (RIGHT GAIT FOR THE DISTANCE, W14 round 14: a default fighter walks the short way in at a natural pace,
  // hit.ts fightSteps — the quick boxer shuffle is only for `guard: "realistic"`.)
  if (settings.guard !== "realistic") return fightSteps(start, distance, settings);
  let out = shuffle(start, distance, settings);
  for (let n = 2; n <= 4 && !plantedFeetDown(out.keys, settings.height); n += 1) {
    out = chainMoves(start, Array.from({ length: n }, () => (from: Stance) => shuffle(from, distance / n, settings)));
  }
  return out;
}
// Every foot a key says is planted is on the floor in that key's pose (within a pixel).
function plantedFeetDown(keys: CharacterKey[], height: number) {
  return keys.every((key) => {
    const s = forwardKinematics(key.pose, key.facing ?? "right", { x: 0, y: 0 }, height, "normal", false);
    const lowest = Math.max(s.lFoot.y, s.rFoot.y, s.lKnee.y, s.rKnee.y, s.hip.y, s.neck.y, s.head.y + 0.07 * height);
    return (key.contacts ?? []).every((foot) => lowest - s[foot].y < 1);
  });
}
// A walk/run that is cut short by a trip: it is built a little longer (so it is still at full speed where
// it should end), then stopped at its distance, mid-stride. Mark `speed` = the hip speed there (px/s).
// (`landing`: a jump takes off from the next step, so it hands over the moment a foot comes down.)
function untilTrip(entry: MoveEntry, start: Stance, params: Record<string, unknown>, settings: MoveSettings, kind: GaitKind, landing = false): MoveOutput {
  const distance = Math.max(0, Number(params.distance ?? 300));
  const stride = (kind === "run" ? 1.1 : kind === "jog" ? 0.32 : 0.3) * settings.height;
  // (Built a little longer, with exactly its natural stride — not stretched or squeezed to fit a length —
  // so it hands over at its real cruise speed: a run before a jump and the run after it match.)
  const natural = naturalDistance({ kind, startX: start.x, direction: forwardSign(start.facing) as 1 | -1, height: settings.height, style: settings.style, speed: settings.speed, energy: settings.energy }, distance + 3 * stride);
  const full = entry.run(start, { ...params, distance: natural >= distance + 1.5 * stride ? natural : distance + 2.5 * stride }, settings);
  return cutAtDistance(full.keys, start, distance, landing);
}
function cutAtDistance(all: CharacterKey[], start: Stance, distance: number, landing: boolean): MoveOutput {
  const dir = forwardSign(start.facing), goal = start.x + dir * distance;
  let cut = all.findIndex((k) => (k.x - goal) * dir >= 0);
  if (cut < 0) cut = all.length - 2;
  cut = Math.max(1, cut);
  // Hand over on a moment with a foot on the ground (the next move starts from the ground, not mid-air).
  const down = (i: number) => (all[i].contacts ?? []).length > 0 && (all[i].lift ?? 0) <= 0.5;
  const lands = (i: number) => (all[i].contacts ?? []).some((foot) => !(all[i - 1].contacts ?? []).includes(foot));
  while (cut < all.length - 2 && !(down(cut) && (!landing || lands(cut)))) cut += 1;
  const keys = all.slice(0, cut + 1), end = keys[keys.length - 1], before = keys[keys.length - 2];
  const speed = Math.abs(end.x - before.x) / Math.max(1e-6, end.t - before.t);
  return { keys, end: { t: end.t, x: end.x, facing: start.facing, pose: end.pose }, marks: { arrived: end.t, speed } };
}
// RUN ON (round 7): a run straight out of a running jump's landing starts at full speed. It is built a
// little longer and its speed-up is cut off: it starts on a push-off at full speed (one foot down behind
// the hips, the other swinging through) — the moment the jump lands into (jump.ts runOn).
type RunOnPlan = { keys: CharacterKey[]; cut: number; speed: number };
function runOnPlan(entry: MoveEntry, facing: Facing, params: Record<string, unknown>, settings: MoveSettings): RunOnPlan | undefined {
  const distance = Math.max(0, Number(params.distance ?? 300));
  let lead = 4 * 1.05 * settings.height, best: RunOnPlan | undefined;
  for (let i = 0; i < 3; i += 1) {
    const keys = entry.run({ t: 0, x: 0, facing, pose: STAND }, { ...params, distance: lead + distance }, settings).keys;
    const speedAround = (k: number, w = 0.2) => Math.abs(xAt(keys, keys[k].t + w) - xAt(keys, keys[k].t - w)) / (2 * w);
    const pushOffs = keys.map((_, k) => k).filter((k) => k > 0 && k < keys.length - 1 && (keys[k].contacts ?? []).length === 1 && (keys[k + 1].contacts ?? []).length === 0);
    if (!pushOffs.length) return best;
    // (Full speed = the speed of most of its steps: it cruises for longer than it speeds up or stops.)
    const speeds = pushOffs.map((k) => speedAround(k)).sort((a, b) => a - b);
    const cruise = speeds[Math.floor(speeds.length / 2)];
    const cut = pushOffs.find((k) => speedAround(k) >= 0.97 * cruise) ?? pushOffs[0];
    best = { keys, cut, speed: Math.abs(xAt(keys, keys[cut].t + 0.05) - xAt(keys, keys[cut].t - 0.05)) / 0.1 };
    const got = Math.abs(keys[cut].x);
    if (Math.abs(got - lead) < 1) break;
    lead = got;
  }
  return best;
}
// The run from where the jump handed it over (its pose, at full speed) for `distance` px: to its stop, or
// cut at its distance when a move that takes momentum follows (`until`: that move).
function flyingRun(plan: RunOnPlan, at: Stance, distance: number, until: string | undefined): MoveOutput {
  const k0 = plan.keys[plan.cut], dt = at.t - k0.t, dx = at.x - k0.x;
  const keys = plan.keys.slice(plan.cut).map((k) => ({ ...k, t: k.t + dt, x: k.x + dx }));
  keys[0] = { ...keys[0], pose: at.pose };
  if (until) return cutAtDistance(keys, at, distance, until === "jump");
  const last = keys[keys.length - 1], stopped = keys[keys.length - 2];
  return { keys, end: { t: last.t, x: last.x, facing: at.facing, pose: last.pose }, marks: { arrived: stopped.t }, flow: { keys: keys.length - 1, stance: { t: stopped.t, x: stopped.x, facing: at.facing, pose: stopped.pose } } };
}

const smoothstep01 = (v: number) => { const u = Math.min(1, Math.max(0, v)); return u * u * (3 - 2 * u); };

// How far (x height) planted feet may be asked to move apart or together before the figure steps instead.
const FEET_SLACK = 0.04;

// The page rule for plans: if the whole animation is wider than the page, shrink the ground it covers
// (walk/run distances and how far apart people start, around the middle) until it fits. Figures keep
// their size and every move keeps its own shape.
// (The plan is told the page's width, so moves that need room — a knock-down — know how much there is.)
// Shrinking stops when it no longer makes the animation narrower, and it never brings two fighters closer
// than a fighting distance (PERSONAL SPACE).
export function fitPlanToPage(plan: ScenePlan, moves: Record<string, MoveEntry>, stageWidth: number, margin = PAGE_MARGIN) {
  const room = stageWidth * (1 - 2 * margin);
  plan = { ...plan, stageWidth };
  let factor = 1;
  let scene = planToScene(plan, moves);
  let best = { scene, width: Infinity };
  for (let i = 0; i < 16; i += 1) {
    // Everything that shows counts: the figures and the objects (a ball held behind the head, in flight).
    const built = buildScene(scene, 12);
    const b = animationBounds(built.frames, built.objects);
    const width = b.right - b.left;
    if (width < best.width) best = { scene, width };
    if (width <= room + 0.5) break;
    const next = Math.max(factor * Math.max(0.3, (room - 4) / width), fightersApart(plan));
    if (next >= factor - 1e-3) break;
    factor = next;
    scene = planToScene(scaledPlan(plan, factor), moves);
  }
  return best.scene;
}

// The smallest shrink factor that keeps every two fighters (who start further apart than a fighting
// distance) at least that far apart.
function fightersApart(plan: ScenePlan) {
  const xs = plan.characters.filter((c) => isFighter(c.actions)).map((c) => c.x).sort((a, b) => a - b);
  let k = 0;
  for (let i = 1; i < xs.length; i += 1) {
    const gap = xs[i] - xs[i - 1];
    if (gap > FIGHT_GAP * plan.height) k = Math.max(k, (FIGHT_GAP * plan.height) / gap);
  }
  return k;
}

// Every length in a move's params (how far to walk, how far away the partner is) shrinks with the page.
const LENGTH_PARAMS = ["distance", "partnerDistance"];
const scaledLengths = (params: Record<string, unknown>, k: number) =>
  Object.fromEntries(Object.entries(params).map(([name, v]) => [name, LENGTH_PARAMS.includes(name) && typeof v === "number" ? v * k : v]));

const scaledPlan = (plan: ScenePlan, k: number): ScenePlan => {
  const center = plan.characters.reduce((sum, c) => sum + c.x, 0) / Math.max(1, plan.characters.length);
  return {
    ...plan,
    lengthScale: (plan.lengthScale ?? 1) * k,
    characters: plan.characters.map((c) => ({
      ...c,
      x: center + (c.x - center) * k,
      actions: c.actions.map((a) => (a.params ? { ...a, params: scaledLengths(a.params, k) } : a)),
    })),
  };
};
