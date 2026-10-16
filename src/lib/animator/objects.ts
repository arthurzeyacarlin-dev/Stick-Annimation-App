import { monotoneTangents, sampleChannel, type Ease } from "./easing.ts";
import { GRAVITY } from "./objectMoves.ts";
import type { FrameCharacter, FrameObject, ObjectKey, ObjectLook, ObjectSegment, Scene } from "./engine.ts";
import type { Facing, Point } from "./rig.ts";
import type { EffectTrack } from "./effects/types.ts";
import { bounceOffWalls, solidWalls, type SolidWall } from "./moves/hitThings.ts";
import { FLAT_SCALE, flightPoint, flightStyleOf } from "./objectFlight.ts";

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
// `ellipse` (half width / half height as DRAWN): a squashed thing (a frisbee seen edge-on, scaleY 0.38) is gripped at its drawn
// edge along the forearm, not at the round radius (Oct 15: the frisbee floated 9 px off the palm).
export function heldCenter(character: FrameCharacter, joint: "lHand" | "rHand" | "hands", radius: number, offset?: Point, ellipse?: { rx: number; ry: number }): Point {
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
    const edge = ellipse && ellipse.rx > 0 && ellipse.ry > 0 ? GRIP / Math.hypot(dir.x / ellipse.rx, dir.y / ellipse.ry) : reach;
    center = { x: hand.x + dir.x * edge, y: hand.y + dir.y * edge };
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
// (BALLS HIT THINGS, Oct 14: `walls` — solid things standing on the ground, hitThings.ts solidWalls — bounce it back off their side.)
export function dropPath(start: { x: number; y: number; rotation: number }, velocity: { vx: number; vy: number }, frames: number, fps: number, floorY: number, look: ObjectLook, walls: readonly SolidWall[] = [], t0 = 0) {
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
    const x0 = x; x += vx * dt;
    if (walls.length) ({ x, vx } = bounceOffWalls(walls, t0 + time, x0, x, y, vx, r, kind.bounce + 0.1));
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

const HIT_SNAP_REACH = 0.12; // (x height: a thing this close to a body's lines on its hit picture is put right on its skin)
const nearestOnSegment = (p: Point, a: Point, b: Point): Point => {
  const dx = b.x - a.x, dy = b.y - a.y, len2 = dx * dx + dy * dy;
  const u = len2 < 1e-9 ? 0 : Math.min(1, Math.max(0, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
  return { x: a.x + dx * u, y: a.y + dy * u };
};
// The point `r` out from the nearest BODY line (spine, legs, head — not the arms: a ball brushing a waving hand is no hit) of any
// figure on this picture, for a thing at p (coming from `prev`); undefined when no body is within reach.
export function snapToBody(p: Point, prev: Point | undefined, frame: readonly FrameCharacter[], r: number, height: number): Point | undefined {
  let best: { d: number; q: Point; r: number } | undefined;
  for (const c of frame) {
    const s = c.skeleton;
    const lines: [Point, Point][] = [[s.neck, s.hip], [s.hip, s.lKnee], [s.lKnee, s.lFoot], [s.hip, s.rKnee], [s.rKnee, s.rFoot]];
    for (const [a, b] of lines) { const q = nearestOnSegment(p, a, b), d = Math.hypot(p.x - q.x, p.y - q.y); if (!best || d < best.d) best = { d, q, r }; }
    const dh = Math.hypot(p.x - s.head.x, p.y - s.head.y) - c.headRadius;
    if (!best || dh < best.d) best = { d: dh, q: s.head, r: r + c.headRadius };
  }
  if (!best || best.d > r + HIT_SNAP_REACH * height) return undefined;
  let ux = p.x - best.q.x, uy = p.y - best.q.y, len = Math.hypot(ux, uy);
  if (len < 1e-6 && prev) { ux = prev.x - p.x; uy = prev.y - p.y; len = Math.hypot(ux, uy); }
  if (len < 1e-6) return undefined;
  return { x: best.q.x + (ux / len) * best.r, y: best.q.y + (uy / len) * best.r };
}
// How far p is from the nearest BODY line of this figure (0 = on the line; the head counts from its rim).
export function bodyLineGap(p: Point, c: FrameCharacter): number {
  const s = c.skeleton;
  const lines: [Point, Point][] = [[s.neck, s.hip], [s.hip, s.lKnee], [s.lKnee, s.lFoot], [s.hip, s.rKnee], [s.rKnee, s.rFoot]];
  let d = Math.hypot(p.x - s.head.x, p.y - s.head.y) - c.headRadius;
  for (const [a, b] of lines) { const q = nearestOnSegment(p, a, b); d = Math.min(d, Math.hypot(p.x - q.x, p.y - q.y)); }
  return d;
}
// A THING FLYING INTO A BODY TOUCHES ITS SKIN (Arthur, Oct 15: "the snowball never truly hits him" — the splat went off a
// body-width short of the man's back): the moment, between the picture before (`prev`) and this one (`p`), a thing of radius r
// first reaches a body line of this figure, and the skin point it touches there. Undefined when it never reaches the body.
export function bodyTouch(p: Point, prev: Point, c: FrameCharacter, r: number, height: number): { u: number; at: Point } | undefined {
  for (let k = 0; k <= 8; k += 1) {
    const u = k / 8, q = { x: prev.x + (p.x - prev.x) * u, y: prev.y + (p.y - prev.y) * u };
    if (bodyLineGap(q, c) <= r + 1) { const at = snapToBody(q, prev, [c], r, height) ?? q; return { u, at }; }
  }
  return undefined;
}

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
        if (holder) { const he = objectHalfExtents(object.look, rotation, scaleX, scaleY * FLAT_SCALE[flightStyleOf(object.id, object.name, object.look.kind)]); position = heldCenter(holder, joint, (object.look.size / 2) * (Math.abs(scaleX) + Math.abs(scaleY)) / 2, offset, { rx: he.halfW, ry: he.halfH }); }
      }
      if (!position && keys.length) position = { x: sample(X, t, 0), y: sample(Y, t, 0) };
      states.push(position ? { ...position, rotation, scaleX, scaleY } : null);
    }
    // Frames with nothing to go on keep the nearest known place.
    for (let i = 1; i < n; i += 1) if (!states[i] && states[i - 1]) states[i] = { ...states[i - 1]! };
    for (let i = n - 2; i >= 0; i -= 1) if (!states[i] && states[i + 1]) states[i] = { ...states[i + 1]! };
    if (!states[0]) continue; // no keys and no holder: nothing to draw
    // NOTHING EVER JUMPS (Arthur, Oct 14: "no teleporting allowed, freaking enforce that law"): where the thing changes who has it —
    // picked up, handed over, put down — and no flight carries it there, it slides from where it was into its new place over
    // ~0.25 s (a pebble a short reach away comes up INTO the hand, never pops into it). Flights already arrive where they land.
    {
      const holderAt = (i: number) => { let h: ObjectSegment | null = null; for (const { segment, f0, f1 } of segments) if (segment.mode === "held" && f0 <= i && i <= f1) h = segment; return h; };
      const ease = Math.max(2, Math.round(0.25 * fps));
      for (let i = 1; i < n; i += 1) {
        // (only a real change of WHO has it — the same figure moving it from one hand to both is no change of owner)
        const who = (k: number) => { const h = holderAt(k) as { character?: string } | null; return h ? h.character ?? "?" : null; };
        // (hand to hand — a hand-off — already meets at one spot, built by the pass itself: only rest ↔ hand slides)
        if (who(i) === who(i - 1) || (who(i) !== null && who(i - 1) !== null) || segments.some((s) => s.segment.mode === "flight" && (Math.abs(s.f1 - i) <= 1 || Math.abs(s.f0 - i) <= 1))) continue;
        const from = states[i - 1]!, dx = from.x - states[i]!.x, dy = from.y - states[i]!.y;
        if (Math.hypot(dx, dy) < 4) continue;
        for (let k = 0; k < ease && i + k < n; k += 1) { const u = (k + 1) / (ease + 1), s = u * u * (3 - 2 * u); states[i + k] = { ...states[i + k]!, x: states[i + k]!.x + dx * (1 - s), y: states[i + k]!.y + dy * (1 - s) }; }
      }
    }

    // 2) Flights: a ballistic arc between where it is when thrown and where it is when caught (a bounce
    // pass: down to the floor and up into the hands; thrown away: on under gravity, then gone).
    const base = states.map((state) => ({ ...state! }));
    const floorY = scene.groundY - objectHalfExtents(object.look, 0, 1, 1).halfH;
    const leaving = new Set<number>(), gone = new Set<number>();
    // (the solid things a dropped or tossed ball bounces back off: plan px, the tallest figure's height as the plan's height)
    const sceneHeight = Number((scene as { height?: number }).height ?? Math.max(0, ...scene.characters.map((c) => Number((c as { height?: number }).height ?? 0)))) || 300;
    const walls = solidWalls((scene as { effects?: EffectTrack[] }).effects, sceneHeight, scene.groundY);
    const drops = new Map<ObjectSegment, { x: number; y: number; rotation: number }[]>();
    const dropOf = (segment: ObjectSegment, velocity: { vx: number; vy: number }, f0: number, f1: number) => {
      // (HIT: a shot that hits a body bounces back off it at that moment — `hit.after` seconds into the flight — and drops)
      const hit = (segment as { hit?: { after: number; rebound: { vx: number; vy: number } } }).hit;
      if (!drops.has(segment) && hit) {
        const first = dropPath(base[f0], velocity, f1 - f0, fps, floorY, object.look, walls, timeOf(f0)), k = Math.max(1, Math.min(first.length - 1, Math.round(hit.after * fps)));
        // A THROWN THING THAT HITS A BODY REALLY TOUCHES IT (Arthur, Oct 15: "the snowball never truly hits him"): the hit picture is
        // the nearest whole picture to the touching moment, so the thing there was up to a picture's travel short of the body (or
        // inside it). Its flight end SNAPS to the body's surface point on that final picture: the bounce / splat starts right on the skin.
        const at = snapToBody(first[k], first[k - 1], frames[f0 + k] ?? [], object.look.size / 2, sceneHeight) ?? first[k];
        drops.set(segment, [...first.slice(0, k), ...dropPath({ ...base[f0], ...first[k], ...at }, hit.rebound, f1 - f0 - k, fps, floorY, object.look, walls, timeOf(f0) + k / fps)]);
      }
      if (!drops.has(segment)) drops.set(segment, dropPath(base[f0], velocity, f1 - f0, fps, floorY, object.look, walls, timeOf(f0)));
      return drops.get(segment)!;
    };
    const style = flightStyleOf(object.id, object.name, object.look.kind);
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
        // (a shot thrown AT someone that misses flies on and may roll off the page: the page fit ignores it — `leaves`)
        if (segment.drop) { states[i] = { ...states[i]!, ...dropOf(segment, segment.drop, f0, f1)[i - f0] }; if ((segment as { leaves?: boolean }).leaves) leaving.add(i); continue; }
        // (EACH THING FLIES ITS OWN WAY — objectFlight.ts: a frisbee glides and hangs, a paper plane swoops, a balloon floats)
        if (!segment.bounce && style !== "ballistic") {
          const q = flightPoint(style, a, b, u);
          states[i] = { ...states[i]!, x: q.x, y: q.y, rotation: a.rotation + (b.rotation - a.rotation) * u + turn * u + q.rotation, scaleX: states[i]!.scaleX * q.scale, scaleY: states[i]!.scaleY * q.scale };
          continue;
        }
        const p = segment.bounce ? bouncePassPoint(a, b, floorY, u) : ballisticPoint(a, b, apex, u);
        states[i] = { ...states[i]!, x: p.x, y: p.y, rotation: a.rotation + (b.rotation - a.rotation) * u + turn * u };
      }
      // (Dropped: it lies where it stopped on the last frame too.)
      if (segment.drop) states[f1] = { ...states[f1]!, ...dropOf(segment, segment.drop, f0, f1)[f1 - f0] };
      if (segment.drop && (segment as { leaves?: boolean }).leaves) { const back = segments.find((s) => s.segment.mode === "held" && s.f0 >= f1); for (let i = f1; i < (back ? back.f0 : n); i += 1) leaving.add(i); }
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
      // (a flat thing — a disc — is seen nearly edge-on from the side: objectFlight.ts FLAT_SCALE)
      out[i].push({ id: object.id, x: s.x, y: Math.min(s.y, scene.groundY - halfH), rotation: s.rotation, scaleX: s.scaleX, scaleY: s.scaleY * FLAT_SCALE[style], look: object.look, ...(leaving.has(i) ? { leaving: true } : {}) });
    }
  }
  return out;
}
