import { monotoneTangents, sampleChannel, type Ease } from "./easing.ts";
import { GRAVITY } from "./objectMoves.ts";
import type { FrameCharacter, FrameObject, ObjectKey, ObjectLook, ObjectSegment, Scene } from "./engine.ts";
import type { Facing, Point } from "./rig.ts";

// SPEC-0017 objects: a ball or a box that slides, bounces, spins, grows, or is held and thrown by the
// figures. Pure and deterministic like the rest of the engine. The engine calls buildObjectFrames after
// the figures are finished, so a held ball follows the real hands of that frame.
export type { FrameObject, ObjectHand, ObjectKey, ObjectLook, ObjectSegment, SceneObject } from "./engine.ts";

export const BASKETBALL_ORANGE = "#e8731a";
export const BASKETBALL_SEAM = "#2b1a10";

// Ready-made looks. A basketball is about a seventh of a 300 px figure's height, a touch bigger so it reads.
export function ballLook(kind: "basketball" | "ball" = "ball", changes: Partial<ObjectLook> = {}): ObjectLook {
  const base: ObjectLook = kind === "basketball"
    ? { kind: "ball", size: 48, color: BASKETBALL_ORANGE, filled: true, thickness: 3, detail: "basketball" }
    : { kind: "ball", size: 44, color: "#e02424", filled: true, detail: "plain" };
  return { ...base, ...changes };
}
export const boxLook = (changes: Partial<ObjectLook> = {}): ObjectLook => ({ kind: "box", size: 70, color: "#2563eb", filled: false, thickness: 6, detail: "plain", ...changes });

// CARRY BY WEIGHT (Arthur, round 11: "Anything he holds is a symbol... whether it's heavy or not. A
// basketball is definitely not heavy"): how a held thing is carried while walking, jogging or running.
// Light (a ball, anything small: up to a fifth of the figure's height): in ONE hand down at the side;
// medium (a box): both hands close against the body; heavy (asked for, or bigger than 0.4 of the height):
// both arms low, slower shorter steps, leaning back. `look.weight` says it outright.
export function carryWeight(look: ObjectLook | undefined, height: number): "light" | "medium" | "heavy" {
  if (look?.weight) return look.weight;
  const size = look?.size ?? 0.16 * height;
  return size <= 0.2 * height ? "light" : size <= 0.4 * height ? "medium" : "heavy";
}

export const lookThickness = (look: ObjectLook) => look.thickness ?? Math.max(2, Math.round(look.size * 0.08));

// Half width / half height of the drawn shape (outline not included), in stage px.
export function objectHalfExtents(look: ObjectLook, rotation: number, scaleX: number, scaleY: number) {
  const half = look.size / 2;
  if (look.kind === "ball") return { halfW: half * Math.abs(scaleX), halfH: half * Math.abs(scaleY) };
  const r = (rotation * Math.PI) / 180;
  const spread = half * (Math.abs(Math.cos(r)) + Math.abs(Math.sin(r)));
  return { halfW: spread * Math.abs(scaleX), halfH: spread * Math.abs(scaleY) };
}

// Two object lists draw the same picture (used for holds).
export const objectsIdentical = (a: readonly FrameObject[], b: readonly FrameObject[]) =>
  a.length === b.length && a.every((o, i) => {
    const p = b[i];
    return o.id === p.id && Math.abs(o.x - p.x) < 0.01 && Math.abs(o.y - p.y) < 0.01 && Math.abs(o.rotation - p.rotation) < 0.01
      && Math.abs(o.scaleX - p.scaleX) < 1e-4 && Math.abs(o.scaleY - p.scaleY) < 1e-4
      && (o.look === p.look || JSON.stringify(o.look) === JSON.stringify(p.look));
  });

const facingVector = (facing: Facing): Point => (facing === "right" ? { x: 1, y: 0 } : facing === "left" ? { x: -1, y: 0 } : { x: 0, y: 1 });
const unit = (p: Point, fallback: Point): Point => {
  const length = Math.hypot(p.x, p.y);
  return length > 1e-6 ? { x: p.x / length, y: p.y / length } : fallback;
};

// How deep the hand sits in the ball: the hand tip overlaps the ball a little so it reads as gripped.
export const GRIP = 0.9;

// Where a held object's center is, given the finished figure of that frame. `radius` = the object's half size.
// One hand: just past the hand along the forearm. Both hands: between them; when the hands are closer
// together than the ball, it is pushed out (toward where the forearms point) until both hands touch it.
export function heldCenter(character: FrameCharacter, joint: "lHand" | "rHand" | "hands", radius: number, offset?: Point): Point {
  const s = character.skeleton;
  const reach = radius * GRIP;
  const fallback = facingVector(character.facing);
  let center: Point;
  if (joint === "hands") {
    const mid = { x: (s.lHand.x + s.rHand.x) / 2, y: (s.lHand.y + s.rHand.y) / 2 };
    const gap = Math.hypot(s.lHand.x - s.rHand.x, s.lHand.y - s.rHand.y) / 2;
    const l = unit({ x: s.lHand.x - s.lElbow.x, y: s.lHand.y - s.lElbow.y }, fallback);
    const r = unit({ x: s.rHand.x - s.rElbow.x, y: s.rHand.y - s.rElbow.y }, fallback);
    const forward = unit({ x: l.x + r.x, y: l.y + r.y }, fallback);
    // Push straight out from the line between the hands (the side the forearms point to), so the
    // ball stays exactly between them.
    const across = { x: s.lHand.y - s.rHand.y, y: s.rHand.x - s.lHand.x };
    const side = across.x * forward.x + across.y * forward.y < 0 ? -1 : 1;
    const dir = unit({ x: across.x * side, y: across.y * side }, forward);
    const push = gap < reach ? Math.sqrt(reach * reach - gap * gap) : 0;
    center = { x: mid.x + dir.x * push, y: mid.y + dir.y * push };
  } else {
    const hand = s[joint], elbow = s[joint === "lHand" ? "lElbow" : "rElbow"];
    const dir = unit({ x: hand.x - elbow.x, y: hand.y - elbow.y }, fallback);
    center = { x: hand.x + dir.x * reach, y: hand.y + dir.y * reach };
  }
  return offset ? { x: center.x + offset.x, y: center.y + offset.y } : center;
}

export const defaultApex = (from: Point, to: Point) => 30 + Math.abs(to.x - from.x) / 4;

// A ballistic arc from `from` (u = 0) to `to` (u = 1), u = share of the flight time: x moves evenly and
// y is a parabola (constant downward acceleration) whose top is `apex` px above the higher end.
export function ballisticPoint(from: Point, to: Point, apex: number, u: number): Point {
  const top = Math.min(from.y, to.y) - Math.max(0, apex);
  const a = (Math.sqrt(from.y - top) + Math.sqrt(to.y - top)) ** 2; // px per (flight time)^2, half the acceleration
  return { x: from.x + (to.x - from.x) * u, y: from.y + (to.y - from.y - a) * u + a * u * u };
}

// A BOUNCE PASS (u = share of the flight time): the ball leaves the hand going level, falls to the floor
// (`floorY` = its centre resting on the ground) and bounces up into the catcher's hands, reaching them at
// the top of its bounce (the easiest catch). Real gravity on both parts and one even sideways speed, so
// where it hits the floor follows from the heights: the higher the release, the further along it lands.
export function bouncePassPoint(from: Point, to: Point, floorY: number, u: number): Point {
  const down = Math.sqrt(Math.max(0, floorY - from.y)), up = Math.sqrt(Math.max(0, floorY - to.y));
  const split = down + up > 0 ? down / (down + up) : 0.5; // share of the time (and of the way) before the bounce
  const x = from.x + (to.x - from.x) * u;
  if (u <= split) { const v = split > 0 ? u / split : 1; return { x, y: from.y + (floorY - from.y) * v * v }; }
  const v = split < 1 ? (u - split) / (1 - split) : 1;
  return { x, y: floorY - (floorY - to.y) * (1 - (1 - v) * (1 - v)) };
}
// Seconds a bounce pass takes from a hand `fromHeight` px above the floor to hands `toHeight` px above it.
export const bouncePassTime = (fromHeight: number, toHeight: number, gravity = GRAVITY) =>
  Math.sqrt((2 * Math.max(0, fromHeight)) / gravity) + Math.sqrt((2 * Math.max(0, toHeight)) / gravity);

type State = { x: number; y: number; rotation: number; scaleX: number; scaleY: number };

// DROPPED (let go of without a throw, to catch a fall): the thing leaves the hands with the body's speed
// (the planner's `drop` velocity), falls under gravity, bounces on the floor losing most of its
// height each time (a ball keeps half its upward speed, a box hardly bounces), and rolls along the floor
// slowing down (a ball turns as it rolls; a box slides and stops quickly) until it lies still. Worked out
// in real time (small fixed steps), so it is the same at any frame rate.
const DROP = { ball: { bounce: 0.5, grip: 0.6, roll: 1500 }, box: { bounce: 0.15, grip: 0.4, roll: 3000 } };
const DROP_STEP = 1 / 480;
export function dropPath(start: { x: number; y: number; rotation: number }, velocity: { vx: number; vy: number }, frames: number, fps: number, floorY: number, look: ObjectLook) {
  const kind = look.kind === "box" ? DROP.box : DROP.ball, r = Math.max(1, look.size / 2);
  let x = start.x, y = Math.min(start.y, floorY), rotation = start.rotation, time = 0;
  let { vx, vy } = velocity;
  const step = (dt: number) => {
    if (!(y >= floorY - 0.01 && vy === 0)) {
      vy += GRAVITY * dt; y += vy * dt;
      if (y >= floorY) { y = floorY; vy = -vy * kind.bounce; vx *= kind.grip; if (Math.abs(vy) < 60) vy = 0; }
    } else {
      const slow = kind.roll * dt;
      vx = Math.abs(vx) <= slow ? 0 : vx - Math.sign(vx) * slow;
    }
    x += vx * dt;
    if (look.kind !== "box") rotation += ((vx * dt) / r) * (180 / Math.PI);
  };
  const out = [{ x, y, rotation }];
  for (let i = 1; i <= frames; i += 1) {
    const until = i / fps;
    while (time < until - 1e-9) { const dt = Math.min(DROP_STEP, until - time); step(dt); time += dt; }
    out.push({ x, y, rotation });
  }
  return out;
}
type Channel = { values: number[]; tangents: number[]; eases: (Ease | undefined)[] };

// The picture showing time t: the one whose time is nearest (pictureTimes: the engine's time of each
// picture, momentTimes in engine.ts; without it, picture i is at i / fps).
export function pictureOf(t: number, fps: number, n: number, pictureTimes?: readonly number[]) {
  let best = Math.min(n - 1, Math.max(0, Math.round(t * fps)));
  if (!pictureTimes) return best;
  for (const j of [best - 1, best + 1, best - 2, best + 2]) if (j >= 0 && j < n && Math.abs(pictureTimes[j] - t) < Math.abs(pictureTimes[best] - t) - 1e-9) best = j;
  return best;
}

// Every frame's objects. `frames` are the finished figures (same frame index), `pictureTimes` the time
// each one shows (KEY MOMENTS SHOW: a catch or a release is on its own picture, at any frame rate).
export function buildObjectFrames(scene: Scene, fps: number, frames: FrameCharacter[][], pictureTimes?: readonly number[]): FrameObject[][] {
  const out: FrameObject[][] = frames.map(() => []);
  const n = frames.length;
  const timeOf = (i: number) => pictureTimes?.[i] ?? Math.min(scene.durationSec, i / fps);
  const frameOf = (t: number) => pictureOf(t, fps, n, pictureTimes);

  for (const object of scene.objects ?? []) {
    const keys: ObjectKey[] = [...object.keys].sort((a, b) => a.t - b.t);
    const times = keys.map((key) => key.t);
    const carry = (pick: (key: ObjectKey) => number | undefined, initial: number) => {
      let value = initial;
      return keys.map((key) => (value = pick(key) ?? value));
    };
    const channel = (values: number[], eases: (Ease | undefined)[]): Channel => ({ values, tangents: monotoneTangents(times, values), eases });
    const X = channel(keys.map((k) => k.x), keys.map((k) => k.xEase ?? k.ease));
    const Y = channel(keys.map((k) => k.y), keys.map((k) => k.yEase ?? k.ease));
    const angleEases = keys.map((k) => k.ease);
    const R = channel(carry((k) => k.rotation, 0), angleEases);
    const SX = channel(carry((k) => k.scaleX, 1), angleEases);
    const SY = channel(carry((k) => k.scaleY, 1), angleEases);
    const sample = (c: Channel, t: number, fallback: number) => (keys.length ? sampleChannel(times, c.values, c.tangents, c.eases, t) : fallback);

    // Segments snap to frames: a hand-off happens on a frame, so the ball is exactly in the hand there.
    const segments = (object.segments ?? [])
      .map((segment) => ({ segment, f0: frameOf(segment.from), f1: frameOf(segment.to) }))
      .filter(({ f0, f1 }) => f1 >= f0)
      .sort((a, b) => a.f0 - b.f0);

    // 1) Where it is without flights: in a hand, or on its keys.
    const states: (State | null)[] = [];
    for (let i = 0; i < n; i += 1) {
      const t = timeOf(i);
      const rotation = sample(R, t, 0), scaleX = sample(SX, t, 1), scaleY = sample(SY, t, 1);
      let held: Extract<ObjectSegment, { mode: "held" }> | null = null;
      for (const { segment, f0, f1 } of segments) if (segment.mode === "held" && f0 <= i && i <= f1) held = segment; // the newest holder wins
      let position: Point | null = null;
      if (held) {
        const { character, joint, offset } = held;
        const holder = frames[i].find((c) => c.id === character);
        if (holder) position = heldCenter(holder, joint, (object.look.size / 2) * (Math.abs(scaleX) + Math.abs(scaleY)) / 2, offset);
      }
      if (!position && keys.length) position = { x: sample(X, t, 0), y: sample(Y, t, 0) };
      states.push(position ? { ...position, rotation, scaleX, scaleY } : null);
    }
    // Frames with nothing to go on keep the nearest known place.
    for (let i = 1; i < n; i += 1) if (!states[i] && states[i - 1]) states[i] = { ...states[i - 1]! };
    for (let i = n - 2; i >= 0; i -= 1) if (!states[i] && states[i + 1]) states[i] = { ...states[i + 1]! };
    if (!states[0]) continue; // no keys and no holder: nothing to draw

    // 2) Flights: a ballistic arc between where it is when thrown and where it is when caught (a bounce
    // pass: down to the floor and up into the hands; thrown away: on under gravity, then gone).
    const base = states.map((state) => ({ ...state! }));
    const floorY = scene.groundY - objectHalfExtents(object.look, 0, 1, 1).halfH;
    const leaving = new Set<number>(), gone = new Set<number>();
    const drops = new Map<ObjectSegment, { x: number; y: number; rotation: number }[]>();
    const dropOf = (segment: ObjectSegment, velocity: { vx: number; vy: number }, f0: number, f1: number) => {
      if (!drops.has(segment)) drops.set(segment, dropPath(base[f0], velocity, f1 - f0, fps, floorY, object.look));
      return drops.get(segment)!;
    };
    for (const { segment, f0, f1 } of segments) {
      if (segment.mode !== "flight" || f1 <= f0) continue;
      const a = base[f0], b = base[f1];
      const t0 = timeOf(f0), t1 = timeOf(f1);
      const apex = segment.apex ?? defaultApex(a, b);
      const turn = (segment.spin ?? 0) * 360;
      for (let i = f0 + 1; i < f1; i += 1) {
        const u = t1 > t0 ? (timeOf(i) - t0) / (t1 - t0) : 1;
        if (segment.away) {
          const tau = timeOf(i) - t0, { vx, vy } = segment.away;
          states[i] = { ...states[i]!, x: a.x + vx * tau, y: a.y + vy * tau + 0.5 * GRAVITY * tau * tau, rotation: a.rotation + turn * u + Math.sign(vx) * 400 * tau };
          leaving.add(i);
          continue;
        }
        if (segment.drop) { states[i] = { ...states[i]!, ...dropOf(segment, segment.drop, f0, f1)[i - f0] }; continue; }
        const p = segment.bounce ? bouncePassPoint(a, b, floorY, u) : ballisticPoint(a, b, apex, u);
        states[i] = { ...states[i]!, x: p.x, y: p.y, rotation: a.rotation + (b.rotation - a.rotation) * u + turn * u };
      }
      // (Dropped: it lies where it stopped on the last frame too.)
      if (segment.drop) states[f1] = { ...states[f1]!, ...dropOf(segment, segment.drop, f0, f1)[f1 - f0] };
      // Thrown away: gone from the end of its flight on (until someone has it again).
      if (segment.away) {
        const back = segments.find((s) => s.segment.mode === "held" && s.f0 >= f1);
        for (let i = f1; i < (back ? back.f0 : n); i += 1) gone.add(i);
      }
    }
    // The spin it picked up in the air stays with it (no snap back when caught).
    for (const { segment, f0, f1 } of segments) {
      if (segment.mode !== "flight" || f1 <= f0 || !segment.spin) continue;
      for (let i = f1; i < n; i += 1) states[i]!.rotation += segment.spin * 360;
    }

    // 3) Never below the ground.
    for (let i = 0; i < n; i += 1) {
      if (gone.has(i)) continue;
      const s = states[i]!;
      const { halfH } = objectHalfExtents(object.look, s.rotation, s.scaleX, s.scaleY);
      out[i].push({ id: object.id, x: s.x, y: Math.min(s.y, scene.groundY - halfH), rotation: s.rotation, scaleX: s.scaleX, scaleY: s.scaleY, look: object.look, ...(leaving.has(i) ? { leaving: true } : {}) });
    }
  }
  return out;
}
