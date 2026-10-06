import assert from "node:assert/strict";
import { buildScene, momentTimes, type CharacterKey, type Scene, type SceneFrames } from "../engine.ts";
import { pictureOf } from "../objects.ts";
import { DEFAULT_STYLE, JOINT_LIMITS, jointRange, STAND, type Facing } from "../rig.ts";
import type { MoveSettings, Stance } from "./motion.ts";
import { MOVE_SPEEDS, MOVE_STYLES } from "./styles.ts";

// Test helpers shared by the moves' tests (not used by the app).

export const TEST_HEIGHT = 300;
export const TEST_GROUND = 900;

export const startStance = (facing: Facing = "right", x = 960, t = 0): Stance => ({ t, x, facing, pose: STAND });

// One character doing the given keys, as a scene.
export function sceneOfKeys(keys: CharacterKey[], facing: Facing = "right", extraSeconds = 0.2): Scene {
  const end = Math.max(...keys.map((k) => k.t));
  return {
    id: "test", title: "test", durationSec: Math.ceil((end + extraSeconds) * 10) / 10, groundY: TEST_GROUND,
    characters: [{ id: "a", name: "A", facing, height: TEST_HEIGHT, style: DEFAULT_STYLE, keys }],
  };
}

// Every combination of style, speed and energy.
export function* allSettings(): Generator<MoveSettings> {
  for (const style of MOVE_STYLES) for (const speed of MOVE_SPEEDS) for (const energy of [0.2, 0.5, 0.85]) yield { height: TEST_HEIGHT, style, speed, energy };
}

// The body rules every move must keep, at 12 and 24 fps: no stretched bones, no sliding planted feet,
// nothing through the floor, no joint past its limit, no pops, and it ends standing still.
export function assertNatural(scene: Scene, label: string, options: { maxJointStepPx24?: number } = {}): SceneFrames {
  for (const character of scene.characters) for (const key of character.keys) {
    for (const name of Object.keys(JOINT_LIMITS) as (keyof typeof JOINT_LIMITS)[]) {
      const [lo, hi] = jointRange(key.pose, name);
      const value = key.pose[name];
      assert.ok(value >= lo - 1e-6 && value <= hi + 1e-6, `${label}: ${name} ${value.toFixed(1)} outside ${lo}..${hi} at ${key.t.toFixed(2)}s`);
    }
  }
  let result: SceneFrames | null = null;
  for (const fps of [12, 24]) {
    const built = buildScene(scene, fps);
    for (const r of built.report.characters) {
      assert.ok(r.maxBoneErrorPx <= 0.5, `${label}@${fps}: bones stretched ${r.maxBoneErrorPx.toFixed(2)}`);
      assert.ok(r.maxFootDriftPx <= 1, `${label}@${fps}: planted foot slid ${r.maxFootDriftPx.toFixed(2)}`);
      assert.equal(r.belowGroundFrames, 0, `${label}@${fps}: went through the floor`);
      const limit = fps === 12 ? 2 * (options.maxJointStepPx24 ?? 120) : options.maxJointStepPx24 ?? 120;
      assert.ok(r.maxJointStepPx < limit, `${label}@${fps}: a joint jumped ${r.maxJointStepPx.toFixed(0)}px in one frame (limit ${limit})`);
    }
    if (fps === 24) result = built;
  }
  return result!;
}

// ARM PATHS (Arthur, round 6: "the engine always tries to go around the head ... the elbow can go behind
// his head ... the engine has to get in love with behind the stick figure"; "sometimes I see your elbow
// spin like a windmill, 360 degrees once. That's unacceptable"). Problems in built frames:
// - WINDMILL: an upper arm or forearm turning more than 300 degrees within 1 s;
// - SPINS: an upper arm or forearm turning more than 100 degrees in one frame (`spinLimit`; fps.test.ts
//   scales it with the frame rate like the joint-step rule: the same 2400 degrees a second);
// - AROUND THE HEAD: a hand past the shoulders (along the body) and outside the head sweeping more than
//   150 degrees round it (an arm may pass the elbow by or through the head, never loop round its outside).
type Pt = { x: number; y: number };
const angleDown = (a: Pt, b: Pt) => (Math.atan2(b.x - a.x, b.y - a.y) * 180) / Math.PI;
const wrap180 = (d: number) => ((d + 540) % 360) - 180;
export function armPathProblems(frames: SceneFrames["frames"], fps: number, spinLimit = 100): string[] {
  const out: string[] = [];
  if (!frames.length) return out;
  for (let ci = 0; ci < frames[0].length; ci += 1) for (const side of ["l", "r"] as const) {
    const elbow = `${side}Elbow` as const, hand = `${side}Hand` as const;
    for (const [segment, from, to] of [["upper arm", "neck", elbow], ["forearm", elbow, hand]] as const) {
      const turned: number[] = [];
      let previous = 0;
      frames.forEach((frame, i) => {
        const s = frame[ci].skeleton, a = angleDown(s[from], s[to]);
        turned.push(i === 0 ? a : turned[i - 1] + wrap180(a - previous));
        previous = a;
      });
      const window = Math.round(fps);
      for (let i = 0; i < turned.length; i += 1) {
        if (i > 0 && Math.abs(turned[i] - turned[i - 1]) > spinLimit) { out.push(`character ${ci} ${side} ${segment} spins ${Math.abs(turned[i] - turned[i - 1]).toFixed(0)} degrees in one frame at ${(i / fps).toFixed(2)}s`); break; }
        const most = Math.max(...turned.slice(i, i + window + 1).map((v) => Math.abs(v - turned[i])));
        if (most > 300) { out.push(`character ${ci} ${side} ${segment} windmills ${most.toFixed(0)} degrees within 1 s at ${(i / fps).toFixed(2)}s`); break; }
      }
    }
    let sweep = 0, last: number | null = null;
    for (let i = 0; i < frames.length; i += 1) {
      const s = frames[i][ci].skeleton, h = s[hand];
      const ux = s.neck.x - s.hip.x, uy = s.neck.y - s.hip.y, length = Math.hypot(ux, uy) || 1;
      const r = Math.hypot(s.head.x - s.neck.x, s.head.y - s.neck.y);
      const along = ((h.x - s.neck.x) * ux + (h.y - s.neck.y) * uy) / length;
      if (along > 0.3 * r && Math.hypot(h.x - s.head.x, h.y - s.head.y) > 1.3 * r) {
        const a = (Math.atan2((h.x - s.head.x) * uy - (h.y - s.head.y) * ux, (h.x - s.head.x) * ux + (h.y - s.head.y) * uy) * 180) / Math.PI;
        if (last !== null) sweep += wrap180(a - last);
        last = a;
        if (Math.abs(sweep) > 150) { out.push(`character ${ci} ${side} hand goes around the head (${Math.abs(sweep).toFixed(0)} degrees) at ${(i / fps).toFixed(2)}s`); break; }
      } else { sweep = 0; last = null; }
    }
  }
  return out;
}

// HELD THINGS TOUCH THE HANDS (Arthur, round 7: in a hand-off "the ball just stayed in mid-air, and he
// thinks he's holding it"). Problems in built frames, for every object:
// - FLOATING: on a frame where someone holds it, the ball's edge is off a holding hand point (both hands
//   for "hands") by more than that figure's line thickness;
// - NOT THROWN: it goes into the air from hands that don't throw it (they are nearly still as it leaves:
//   under a quarter of the ball's speed) — every frame of that flight floats;
// - LET GO TOO SOON: when it goes straight from one figure's hands to another's (a hand-off, no flight),
//   the giver's hands are still on it on the frame the taker takes it.
// In a real flight (a throw) nobody needs to touch it. `floating` counts the frames with a problem.
export function heldContactProblems(scene: Scene, built: SceneFrames): { problems: string[]; floating: number } {
  const problems: string[] = [];
  let floating = 0;
  const fps = built.fps, n = built.frames.length;
  const times = momentTimes(scene, fps, n);
  const frameOf = (t: number) => pictureOf(t, fps, n, times);
  for (const object of scene.objects ?? []) {
    const segments = (object.segments ?? []).map((segment) => ({ segment, f0: frameOf(segment.from), f1: frameOf(segment.to) }))
      .filter(({ f0, f1 }) => f1 >= f0).sort((a, b) => a.f0 - b.f0);
    const ball = (i: number) => built.objects[i]?.find((o) => o.id === object.id);
    const handsOf = (i: number, character: string, joint: string): Pt[] => {
      const c = built.frames[i]?.find((f) => f.id === character);
      if (!c) return [];
      return joint === "hands" ? [c.skeleton.lHand, c.skeleton.rHand] : [c.skeleton[joint as "lHand" | "rHand"]];
    };
    // How far the ball's edge is from the furthest holding hand point, and the holder's line thickness.
    const offBy = (i: number, character: string, joint: string) => {
      const o = ball(i), c = built.frames[i]?.find((f) => f.id === character);
      if (!o || !c) return { off: 0, thickness: 1 };
      const r = ((o.look.size / 2) * (Math.abs(o.scaleX) + Math.abs(o.scaleY))) / 2;
      return { off: Math.max(0, ...handsOf(i, character, joint).map((h) => Math.abs(Math.hypot(h.x - o.x, h.y - o.y) - r))), thickness: c.style.thickness };
    };
    const bad = new Set<number>();
    const note = (i: number, text: string) => { if (!bad.has(i) && bad.size === 0) problems.push(`${object.id}: ${text} at ${(i / fps).toFixed(2)}s`); bad.add(i); };
    for (let i = 0; i < n; i += 1) {
      let held: (typeof segments)[number]["segment"] | null = null;
      for (const { segment, f0, f1 } of segments) if (segment.mode === "held" && f0 <= i && i <= f1) held = segment;
      const flying = segments.some(({ segment, f0, f1 }) => segment.mode === "flight" && f0 < i && i < f1);
      if (!held || held.mode !== "held" || flying || !ball(i)) continue;
      const { off, thickness } = offBy(i, held.character, held.joint);
      if (off > thickness) note(i, `held by ${held.character} (${held.joint}) but ${off.toFixed(0)}px off the hand`);
    }
    for (const { segment, f0 } of segments) {
      if (segment.mode !== "held" || f0 < 1) continue;
      // Who had it just before: a holder whose time ends here (straight from hand to hand), or one whose
      // time ended where a flight into these hands began.
      const flight = segments.find((s) => s.segment.mode === "flight" && s.f1 === f0 && !s.segment.away);
      const from = segments.find((s) => s.segment.mode === "held" && s.segment !== segment && s.f1 === (flight ? flight.f0 : f0) && s.f0 < s.f1);
      if (!from || from.segment.mode !== "held") continue;
      if (!flight || flight.f1 - flight.f0 <= 1) {
        const { off, thickness } = offBy(f0, from.segment.character, from.segment.joint);
        if (from.segment.character !== segment.character && off > thickness) note(f0, `${from.segment.character} let go before ${segment.character} had it (${off.toFixed(0)}px off)`);
        continue;
      }
      // Thrown, or just let go of? The hands letting go move at least a quarter of the ball's speed.
      const mid = (ps: Pt[]) => ({ x: ps.reduce((s, p) => s + p.x, 0) / Math.max(1, ps.length), y: ps.reduce((s, p) => s + p.y, 0) / Math.max(1, ps.length) });
      const start = flight.f0, a = mid(handsOf(start - 1, from.segment.character, from.segment.joint)), b = mid(handsOf(start, from.segment.character, from.segment.joint));
      const o0 = ball(start), o1 = ball(start + 1);
      const hand = Math.hypot(b.x - a.x, b.y - a.y), speed = o0 && o1 ? Math.hypot(o1.x - o0.x, o1.y - o0.y) : 0;
      if (hand < 0.25 * speed) for (let i = start + 1; i < flight.f1; i += 1) note(i, `left ${from.segment.character}'s hands without a throw (hands ${(hand * fps).toFixed(0)} px/s, ball ${(speed * fps).toFixed(0)} px/s)`);
    }
    floating += bad.size;
  }
  return { problems, floating };
}
