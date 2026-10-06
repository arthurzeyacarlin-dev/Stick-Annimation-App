import { monotoneTangents, sampleChannel, unwrapAngles, type Ease } from "./easing.ts";
import { solveTwoBone } from "./ik.ts";
import { buildObjectFrames } from "./objects.ts";
import { forwardKinematics, translateSkeleton } from "./pose.ts";
import { boneLengths, clampPose, headRadius, JOINTS, POSE_KEYS, type CharacterStyle, type Facing, type PoseAngles, type PoseKey, type Point, type Skeleton } from "./rig.ts";
import { buildCameraFrames, hasCamera, type CameraFrames } from "./camera.ts";

// SPEC-0017 engine: key poses -> every frame, with the body rules applied.
// Pure TypeScript (no React/DOM) and deterministic: the same scene always gives the same frames.

export type FootContact = "lFoot" | "rFoot";

export type CharacterKey = {
  t: number; // seconds
  pose: PoseAngles;
  x: number; // hip x on the 1920x1080 stage
  lift?: number; // height of the body's lowest point above the ground (0 = resting on it; see lowestBodyY)
  contacts?: FootContact[]; // feet planted on the ground from this key until the next key that also lists them
  ease?: Ease; // angles, segment starting at this key
  xEase?: Ease;
  liftEase?: Ease;
  facing?: Facing; // which way the figure faces from this key on (turning); defaults to the character's facing
  // SQUASH & STRETCH AT HIGH FPS (Arthur, round 9: "only at high frame rates; at 12 fps it looks weird with
  // stick figures"): a key with `minFps` only exists when the scene is drawn at that many pictures a second
  // or more (keysAt). It adds an extra squashed or stretched pose for a picture or two; the move must look
  // right without it (at 12 fps and below it is never there).
  minFps?: number;
};
// The keys a figure has at `fps` (a key with minFps above it is left out), in time order.
export const keysAt = (keys: CharacterKey[], fps: number) => keys.filter((key) => (key.minFps ?? 0) <= fps).sort((a, b) => a.t - b.t);

// `namedByUser`: the USER gave this name (plan.ts CharacterPlan; it names the head symbol "<name>'s head").
export type SceneCharacter = { id: string; name: string; namedByUser?: boolean; facing: Facing; height: number; style: CharacterStyle; keys: CharacterKey[] };
// Objects (a ball, a box): drawn into the same frame pictures as the figures.
export type ObjectLook = {
  kind: "ball" | "box";
  size: number; // ball diameter / box side, stage px at scale 1
  color: string;
  filled: boolean;
  thickness?: number; // outline width (default: about 8% of the size, at least 2)
  detail?: "plain" | "basketball"; // basketball = orange ball with dark seam lines
  weight?: "light" | "medium" | "heavy"; // how heavy it is to carry (default: from its size, objects.ts carryWeight)
};
// Missing rotation/scaleX/scaleY carry over from the previous key (first key: 0 / 1 / 1).
// xEase / yEase default to `ease`; `ease` also times rotation and scale. Segment starts at this key.
export type ObjectKey = { t: number; x: number; y: number; rotation?: number; scaleX?: number; scaleY?: number; ease?: Ease; xEase?: Ease; yEase?: Ease };
export type ObjectHand = "lHand" | "rHand" | "hands";
export type ObjectSegment =
  // In a figure's hand(s): the object's center follows the hand every frame (offset in stage px).
  | { from: number; to: number; mode: "held"; character: string; joint: ObjectHand; offset?: Point }
  // Thrown: a true ballistic arc from where it is at `from` to where it is at `to`. apex = px the arc
  // rises above the higher end (default 30 + a quarter of the distance); spin = extra turns in the air.
  // bounce = a bounce pass: down to the floor and up into the catcher's hands (objects.ts flightPoint).
  // away = thrown away, nobody catches it: it flies on under gravity from where it left the hand, at
  // this launch velocity (stage px/s, +y down), and is gone after `to` (objects.ts).
  // drop = let go of without a throw (to catch a fall): it leaves with this velocity (the body's, stage
  // px/s, +y down), falls under gravity, bounces and rolls (a box slides) to a stop on the floor, and lies
  // there until `to` (objects.ts).
  | { from: number; to: number; mode: "flight"; apex?: number; spin?: number; bounce?: boolean; away?: { vx: number; vy: number }; drop?: { vx: number; vy: number } };
export type SceneObject = { id: string; name: string; look: ObjectLook; keys: ObjectKey[]; segments?: ObjectSegment[] };

// marks: the plan's named moments ("<character>.<move><n>.<moment>" = seconds, e.g. "a.punch1.hit"); each
// one gets a picture of its own at any frame rate (momentTimes).
export type Scene = { id: string; title: string; durationSec: number; groundY: number; characters: SceneCharacter[]; objects?: SceneObject[]; marks?: Record<string, number> };

// offPage (THE CAMERA, camera.ts): running off the page or in from its edge on purpose, in a scene with film
// cuts: drawn, but the page fit ignores it (like a ball thrown away). Never set otherwise.
export type FrameCharacter = { id: string; skeleton: Skeleton; style: CharacterStyle; headRadius: number; facing: Facing; offPage?: boolean };

export type CharacterReport = {
  id: string;
  maxBoneErrorPx: number;
  maxFootDriftPx: number;
  clampedAngles: number;
  belowGroundFrames: number;
  maxJointStepPx: number;
  // FAST SPANS: the biggest joint step between two pictures that are both inside one of this figure's
  // marked fast spans (not counted in maxJointStepPx; see fastSpans).
  maxFastStepPx: number;
};
export type EngineReport = { frameCount: number; fps: number; characters: CharacterReport[]; ok: boolean };
// x, y = center (stage px); rotation in degrees; scale is applied along the stage axes (a squash is always up/down).
// leaving = flying off the page for good (a ball thrown away): drawn, but the page fit ignores it.
export type FrameObject = { id: string; x: number; y: number; rotation: number; scaleX: number; scaleY: number; look: ObjectLook; leaving?: boolean };
// camera: only for a scene with film cuts or a screen shake (camera.ts): where the cuts are, how far each picture shakes.
export type SceneFrames = { fps: number; frames: FrameCharacter[][]; report: EngineReport; objects: FrameObject[][]; camera?: CameraFrames };

const GROUND_TOLERANCE_PX = 0.5;

// FAST THINGS MOVE FAR BETWEEN PICTURES (Arthur, round 16: a slam at the joint-step speed limit looked like
// "defying gravity ... like on the moon"): a move may mark a fast span for its own figure with the marks
// "<figure>.<move><n>.fastFrom" and "<...>.fastTo" (a slam from the top of the swing to the impact). Joint
// steps between two pictures that are BOTH inside one of that figure's spans are reported apart, as
// maxFastStepPx, instead of in maxJointStepPx; everything outside a span keeps the joint-step rule.
export function fastSpans(scene: Scene, id: string): [number, number][] {
  const marks = scene.marks ?? {};
  const spans: [number, number][] = [];
  for (const [name, from] of Object.entries(marks)) {
    if (!name.startsWith(`${id}.`) || !name.endsWith(".fastFrom")) continue;
    const to = marks[`${name.slice(0, -".fastFrom".length)}.fastTo`];
    if (Number.isFinite(from) && Number.isFinite(to) && to > from) spans.push([from, to]);
  }
  return spans;
}
const inFastSpan = (spans: [number, number][], a: number, b: number) => spans.some(([from, to]) => a >= from - 1e-6 && b <= to + 1e-6);

type Channel = { times: number[]; values: number[]; tangents: number[]; eases: (Ease | undefined)[] };
const makeChannel = (times: number[], values: number[], eases: (Ease | undefined)[]): Channel => ({ times, values, tangents: monotoneTangents(times, values), eases });

const contactActive = (keys: CharacterKey[], contact: FootContact, t: number) => {
  if (keys.length === 0) return false;
  const has = (key: CharacterKey | undefined) => Boolean(key?.contacts?.includes(contact));
  if (t <= keys[0].t) return has(keys[0]);
  const last = keys.length - 1;
  if (t >= keys[last].t) return has(keys[last]);
  let i = 0;
  while (i < last - 1 && t >= keys[i + 1].t) i += 1;
  return has(keys[i]) && has(keys[i + 1]);
};

// A VIEW SWITCH IS INSTANT: the time to sample a picture at — the start of a very short key gap (≤ 0.03 s) that ends in
// a switch of the view, else t itself.
const VIEW_SWITCH_GAP = 0.03;
const viewSwitchHoldTime = (keys: CharacterKey[], fallback: Facing, t: number) => {
  for (let i = 0; i + 1 < keys.length; i += 1) {
    const a = keys[i], b = keys[i + 1];
    if (t <= a.t) break;
    if (t < b.t && b.t - a.t <= VIEW_SWITCH_GAP && b.facing !== undefined && b.facing !== facingAt(keys, fallback, a.t)) return a.t;
  }
  return t;
};

// NO FOOT SLIDING AT TOUCH-DOWN: how far (x figure height) a foot that touched the floor a picture early may be from where
// its plant puts it and still be planted where it touched (a few px; further is a real step).
const TOUCH_DOWN_SNAP = 0.012;

// The facing in effect at time t: set by the latest key at or before t (a turn is a switch at a key).
const facingAt = (keys: CharacterKey[], fallback: Facing, t: number): Facing => {
  let facing = fallback;
  for (const key of keys) {
    if (key.t > t) break;
    facing = key.facing ?? facing;
  }
  return facing;
};

// The body's lowest point: the feet, knees, hips, neck and the bottom of the head circle all count, so a body
// lying down rests on its hips, chest or head. Hands and elbows don't: a hand put on the floor (picking
// something up, catching a fall) is kept just above it by the move itself.
const lowestBodyY = (skeleton: Skeleton, headRadius: number) =>
  Math.max(skeleton.lFoot.y, skeleton.rFoot.y, skeleton.lKnee.y, skeleton.rKnee.y, skeleton.hip.y, skeleton.neck.y, skeleton.head.y + headRadius);

const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

export const measureBoneError = (skeleton: Skeleton, height: number, radius: number, neck = true) => {
  const bones = boneLengths(height);
  const pairs: [Point, Point, number][] = [
    [skeleton.hip, skeleton.neck, bones.torso],
    [skeleton.neck, skeleton.head, (neck ? bones.neck : 0) + radius],
    [skeleton.neck, skeleton.lElbow, bones.upperArm], [skeleton.lElbow, skeleton.lHand, bones.forearm],
    [skeleton.neck, skeleton.rElbow, bones.upperArm], [skeleton.rElbow, skeleton.rHand, bones.forearm],
    [skeleton.hip, skeleton.lKnee, bones.thigh], [skeleton.lKnee, skeleton.lFoot, bones.shin],
    [skeleton.hip, skeleton.rKnee, bones.thigh], [skeleton.rKnee, skeleton.rFoot, bones.shin],
  ];
  return Math.max(...pairs.map(([a, b, length]) => Math.abs(dist(a, b) - length)));
};

// Knees must point the way the figure faces (side view) or outward (front view).
const kneeDirection = (facing: Facing, side: "l" | "r"): Point =>
  facing === "right" ? { x: 1, y: 0 } : facing === "left" ? { x: -1, y: 0 } : { x: side === "l" ? -1 : 1, y: 0 };

export function frameCountFor(durationSec: number, fps: number) {
  return Math.max(1, Math.round(durationSec * fps) + 1);
}

// KEY MOMENTS SHOW (Arthur, round 9: "every animation follows the project's frames per second, same timing
// in seconds, just fewer or more pictures"). At 8 pictures a second a punch's hit, a jump's take-off or
// landing, a catch can fall between two pictures and never be seen. So when no picture is within 1/48 s
// of one of the figures' named moments (only below 12 fps), the picture nearest it shows that exact
// moment (at most half a picture early or late; a second moment wanting the same picture takes the next or
// the one before if it is within a picture), and the pictures on either side ease part of the way. No step between two
// pictures grows or shrinks by more than half a picture (a longer gap could hide a fast arm's direction),
// the first and last pictures never move, pictures stay in time order, and no picture moves across a turn's
// view switch (the feet are re-planted there). Times per picture, the same for every figure (so a hand-off,
// a high-five or a hit shows both figures at the same instant).
// (Lead, round 9: from 12 pictures a second up the pictures stay evenly spaced. Arthur rated the 12 fps
// scenes 9-10 as they are, and evenly spaced pictures keep steady motion (a run, a pass in flight) from
// stuttering; at 12 fps and up moments are close enough to a picture to read.)
const MOMENT_SHOWN_SEC = 1 / 48;
const MOMENTS_BELOW_FPS = 12;
// (Lead, round 9: a picture moved to show a moment must never leave an arm turning half a turn or more
// between two pictures: drawn the short way round, it would flip over the head. A move is kept only if
// the biggest arm turn between neighbouring pictures stays under this, or no worse than without it.)
const MAX_ARM_TURN_PER_PICTURE = 150;
export function momentTimes(scene: Scene, fps: number, frameCount = frameCountFor(scene.durationSec, fps)): number[] {
  const times = Array.from({ length: frameCount }, (_, index) => Math.min(scene.durationSec, index / fps));
  if (fps >= MOMENTS_BELOW_FPS) return times;
  const ids = new Set(scene.characters.map((character) => character.id));
  // (Lead, round 10: IMPACTS FIRST. When two moments are too close for both to get a picture, the one the eye
  // must see wins: a hit, stomp, slap, catch, release, take-off or landing before a minor one like "covered".)
  const impact = (name: string) => /\.(hit|stomp|slap|touch|catch|release|takeoff|land|impact|groundHit\d*)$/.test(name) ? 0 : 1;
  const named = Object.entries(scene.marks ?? {})
    .filter(([name, t]) => /^[^.]+\.[A-Za-z]+\d+\.\w+$/.test(name) && ids.has(name.split(".")[0]) && Number.isFinite(t) && t > 0 && t < scene.durationSec)
    .map(([name, t]) => ({ t, rank: impact(name) }));
  const moments = [...new Set(named.sort((a, b) => a.rank - b.rank || a.t - b.t).map((m) => m.t))];
  const sorted = scene.characters.map((character) => ({ character, keys: keysAt(character.keys, fps) }));
  const sameView = (a: number, b: number) => sorted.every(({ character, keys }) => facingAt(keys, character.facing, a) === facingAt(keys, character.facing, b));
  const fixed = new Set<number>([0, frameCount - 1]);
  // Each figure's arm directions (upper arms and forearms, from straight down) at a time.
  const armsAt = scene.characters.map((character) => {
    const keys = keysAt(character.keys, fps);
    const keyTimes = keys.map((key) => key.t), eases = keys.map((key) => key.ease);
    const channel = (name: PoseKey) => {
      const raw = keys.map((key) => key.pose[name]);
      return makeChannel(keyTimes, name === "lShoulder" || name === "rShoulder" ? unwrapAngles(raw) : raw, eases);
    };
    const [lean, lS, rS, lE, rE] = (["lean", "lShoulder", "rShoulder", "lElbow", "rElbow"] as const).map(channel);
    const at = (ch: Channel, t: number) => sampleChannel(ch.times, ch.values, ch.tangents, ch.eases, t);
    return (t: number) => { const l = at(lS, t) - at(lean, t), r = at(rS, t) - at(lean, t); return [l, r, l + at(lE, t), r + at(rE, t)]; };
  });
  const biggestTurn = (list: number[], from: number, to: number) => {
    let most = 0;
    for (let i = Math.max(1, from); i <= Math.min(list.length - 1, to); i += 1) {
      for (const arms of armsAt) { const a = arms(list[i - 1]), b = arms(list[i]); a.forEach((v, k) => { most = Math.max(most, Math.abs(b[k] - v)); }); }
    }
    return most;
  };
  const armsOk = (list: number[], from: number, to: number) => {
    const after = biggestTurn(list, from, to);
    return after < MAX_ARM_TURN_PER_PICTURE || after <= biggestTurn(times, from, to) + 1e-6;
  };
  const inOrder = (list: number[], from: number, to: number) => {
    for (let i = Math.max(1, from); i <= Math.min(list.length - 1, to); i += 1) {
      const step = (list[i] - list[i - 1]) * fps, usual = (Math.min(scene.durationSec * fps, i) - (i - 1));
      if (step <= 0 || Math.abs(step - usual) > 0.5 + 1e-9) return false;
    }
    for (let i = Math.max(0, from); i <= Math.min(list.length - 1, to); i += 1) if (list[i] !== times[i] && !sameView(list[i], Math.min(scene.durationSec, i / fps))) return false;
    return true;
  };
  for (const m of moments) {
    const nearest = Math.round(m * fps);
    // (Already on a picture: that picture is kept there — a later, lesser moment's neighbours easing toward
    // it must not pull it off this one. Lead, round 11: a stomp at 8 fps was eased 0.04 s off its landing.)
    if (Math.abs(times[Math.min(frameCount - 1, nearest)] - m) <= MOMENT_SHOWN_SEC) { fixed.add(Math.min(frameCount - 1, nearest)); continue; }
    for (const index of [nearest, nearest + 1, nearest - 1]) {
      if (fixed.has(index) || index <= 0 || index >= frameCount - 1 || Math.abs(m - index / fps) >= 1 / fps) continue;
      const shift = m - times[index];
      // The neighbours ease toward it (two on each side, then one, then none), skipping fixed pictures.
      const chosen = [[2 / 3, 1 / 3], [1 / 2], []].map((weights) => {
        const list = times.slice();
        list[index] = m;
        for (const dir of [-1, 1]) weights.forEach((w, k) => { const j = index + dir * (k + 1); if (j > 0 && j < frameCount - 1 && !fixed.has(j)) list[j] = times[j] + shift * w; });
        return list;
      }).find((list) => inOrder(list, index - 3, index + 3) && armsOk(list, index - 3, index + 4));
      if (!chosen) continue;
      times.splice(0, times.length, ...chosen);
      fixed.add(index);
      break;
    }
  }
  return times;
}

export function buildScene(scene: Scene, fps: number): SceneFrames {
  // THE CAMERA (camera.ts): only a scene that asks for film cuts or a screen shake; each shot is built right here.
  if (hasCamera(scene)) return buildCameraFrames(scene, fps, buildScene, momentTimes);
  const frameCount = frameCountFor(scene.durationSec, fps);
  const frames: FrameCharacter[][] = Array.from({ length: frameCount }, () => []);
  const reports: CharacterReport[] = [];
  const pictureTimes = momentTimes(scene, fps, frameCount);

  for (const character of scene.characters) {
    const keys = keysAt(character.keys, fps);
    const times = keys.map((key) => key.t);
    const angleEases = keys.map((key) => key.ease);
    const channels = {} as Record<PoseKey, Channel>;
    for (const name of POSE_KEYS) {
      const raw = keys.map((key) => key.pose[name]);
      channels[name] = makeChannel(times, name === "lShoulder" || name === "rShoulder" ? unwrapAngles(raw) : raw, angleEases);
    }
    const xChannel = makeChannel(times, keys.map((key) => key.x), keys.map((key) => key.xEase));
    const liftChannel = makeChannel(times, keys.map((key) => key.lift ?? 0), keys.map((key) => key.liftEase));
    const radius = headRadius(character.height, character.style.headSize);
    const bones = boneLengths(character.height);
    const locks: Partial<Record<FootContact, Point>> = {};
    const report: CharacterReport = { id: character.id, maxBoneErrorPx: 0, maxFootDriftPx: 0, clampedAngles: 0, belowGroundFrames: 0, maxJointStepPx: 0, maxFastStepPx: 0 };
    const spans = fastSpans(scene, character.id);
    let previous: Skeleton | null = null;
    let previousFacing: Facing | null = null;

    for (let index = 0; index < frameCount; index += 1) {
      const t = pictureTimes[index];
      // A VIEW SWITCH IS INSTANT: a picture inside a very short key gap that ends in a switch of the view (side ->
      // front, a spin's turn) shows the old view's pose whole — the angles of two views never mix (the hands would
      // fly apart for one picture).
      const st = viewSwitchHoldTime(keys, character.facing, t);
      const sampled = {} as PoseAngles;
      for (const name of POSE_KEYS) {
        const ch = channels[name];
        sampled[name] = sampleChannel(ch.times, ch.values, ch.tangents, ch.eases, st);
      }
      const { pose, clamped } = clampPose(sampled);
      report.clampedAngles += clamped;
      const x = sampleChannel(xChannel.times, xChannel.values, xChannel.tangents, xChannel.eases, st);
      const lift = Math.max(0, sampleChannel(liftChannel.times, liftChannel.values, liftChannel.tangents, liftChannel.eases, st));

      // A turn changes how the body is drawn, so planted feet are re-planted after it.
      const facing = facingAt(keys, character.facing, t);
      // A view switch re-plants the feet, except a foot that stays planted through it (the pivot foot of
      // a turn): it keeps its spot, so it can't pop.
      if (facing !== previousFacing) {
        for (const contact of ["lFoot", "rFoot"] as const) {
          if (previousFacing === null || !(contactActive(keys, contact, t) && contactActive(keys, contact, index > 0 ? pictureTimes[index - 1] : 0))) delete locks[contact];
        }
      }
      const previousFacingAtStart = previousFacing;
      previousFacing = facing;

      // Stand the body on the ground: its lowest point sits `lift` above groundY.
      const atOrigin = forwardKinematics(pose, facing, { x, y: 0 }, character.height, character.style.headSize, character.style.neck === true);
      let skeleton = translateSkeleton(atOrigin, 0, scene.groundY - lift - lowestBodyY(atOrigin, radius));

      // Planted feet stay exactly where they landed; the knee re-bends to reach them.
      const planted = (["lFoot", "rFoot"] as const).filter((contact) => {
        if (!contactActive(keys, contact, t)) { delete locks[contact]; return false; }
        // A foot lifted and put down again between two pictures (a quick step at a low frame rate) is
        // planted where it lands now, not where it stood before.
        if (index > 0 && keys.some((key) => key.t > pictureTimes[index - 1] && key.t < t && !key.contacts?.includes(contact))) delete locks[contact];
        if (!locks[contact]) {
          // NO FOOT SLIDING AT TOUCH-DOWN: a foot that already touched the floor in the picture before (a step landing a
          // moment before its plant key) is planted right where it touched — it never slides the last few px into place.
          const before = previous && facing === previousFacingAtStart ? previous[contact] : undefined;
          const touched = before !== undefined && scene.groundY - before.y <= 2 && Math.abs(before.x - skeleton[contact].x) <= TOUCH_DOWN_SNAP * character.height;
          locks[contact] = { x: touched ? before.x : skeleton[contact].x, y: Math.min(skeleton[contact].y, scene.groundY) };
          return touched;
        }
        return true;
      });
      // A leg can't stretch: if a planted foot is out of reach, lower the hips (soften the knees) until it fits.
      const reach = (bones.thigh + bones.shin) * 0.998;
      let sink = 0;
      for (const contact of planted) {
        const lock = locks[contact]!;
        const dx = lock.x - skeleton.hip.x;
        if (Math.abs(dx) < reach) sink = Math.max(sink, lock.y - Math.sqrt(reach * reach - dx * dx) - skeleton.hip.y);
      }
      if (sink > 0) skeleton = translateSkeleton(skeleton, 0, sink);
      for (const contact of planted) {
        const lock = locks[contact]!;
        const side = contact === "lFoot" ? "l" : "r";
        const solved = solveTwoBone(skeleton.hip, lock, bones.thigh, bones.shin, kneeDirection(facing, side));
        skeleton = { ...skeleton, [`${side}Knee`]: solved.mid, [contact]: solved.end } as Skeleton;
        report.maxFootDriftPx = Math.max(report.maxFootDriftPx, solved.drift);
      }
      // A swinging foot never goes through the floor: it slides along the ground instead.
      for (const contact of ["lFoot", "rFoot"] as const) {
        if (planted.includes(contact) || skeleton[contact].y <= scene.groundY) continue;
        const side = contact === "lFoot" ? "l" : "r";
        const solved = solveTwoBone(skeleton.hip, { x: skeleton[contact].x, y: scene.groundY }, bones.thigh, bones.shin, kneeDirection(facing, side));
        skeleton = { ...skeleton, [`${side}Knee`]: solved.mid, [contact]: solved.end } as Skeleton;
      }

      report.maxBoneErrorPx = Math.max(report.maxBoneErrorPx, measureBoneError(skeleton, character.height, radius, character.style.neck === true));
      const lowest = Math.max(...JOINTS.filter((name) => name !== "head").map((name) => skeleton[name].y));
      if (lowest > scene.groundY + GROUND_TOLERANCE_PX) report.belowGroundFrames += 1;
      if (previous) {
        const prev = previous;
        const step = Math.max(...JOINTS.map((name) => dist(skeleton[name], prev[name])));
        if (inFastSpan(spans, pictureTimes[index - 1], t)) report.maxFastStepPx = Math.max(report.maxFastStepPx, step);
        else report.maxJointStepPx = Math.max(report.maxJointStepPx, step);
      }
      previous = skeleton;
      frames[index].push({ id: character.id, skeleton, style: character.style, headRadius: radius, facing });
    }
    reports.push(report);
  }

  const ok = reports.every((r) => r.maxBoneErrorPx <= 0.5 && r.maxFootDriftPx <= 1 && r.belowGroundFrames === 0);
  // Objects come after the figures (a held ball follows the finished hands). Characters are unchanged.
  return { fps, frames, report: { frameCount, fps, characters: reports, ok }, objects: buildObjectFrames(scene, fps, frames, pictureTimes) };
}

// Two frames are the same picture when every joint of every character is within a hair.
export const framesIdentical = (a: FrameCharacter[], b: FrameCharacter[]) =>
  a.length === b.length && a.every((character, i) => JOINTS.every((name) => dist(character.skeleton[name], b[i].skeleton[name]) < 0.01));
