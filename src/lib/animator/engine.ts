import { monotoneTangents, sampleChannel, unwrapAngles, type Ease } from "./easing.ts";
import { solveTwoBone } from "./ik.ts";
import { forwardKinematics, translateSkeleton } from "./pose.ts";
import { boneLengths, clampPose, headRadius, JOINTS, POSE_KEYS, type CharacterStyle, type Facing, type PoseAngles, type PoseKey, type Point, type Skeleton } from "./rig.ts";

// SPEC-0017 engine: key poses -> every frame, with the body rules applied.
// Pure TypeScript (no React/DOM) and deterministic: the same scene always gives the same frames.

export type FootContact = "lFoot" | "rFoot";

export type CharacterKey = {
  t: number; // seconds
  pose: PoseAngles;
  x: number; // hip x on the 1920x1080 stage
  lift?: number; // lowest foot/knee height above the ground (0 = standing on it)
  contacts?: FootContact[]; // feet planted on the ground from this key until the next key that also lists them
  ease?: Ease; // angles, segment starting at this key
  xEase?: Ease;
  liftEase?: Ease;
  facing?: Facing; // which way the figure faces from this key on (turning); defaults to the character's facing
};

export type SceneCharacter = { id: string; name: string; facing: Facing; height: number; style: CharacterStyle; keys: CharacterKey[] };
export type Scene = { id: string; title: string; durationSec: number; groundY: number; characters: SceneCharacter[] };

export type FrameCharacter = { id: string; skeleton: Skeleton; style: CharacterStyle; headRadius: number; facing: Facing };

export type CharacterReport = {
  id: string;
  maxBoneErrorPx: number;
  maxFootDriftPx: number;
  clampedAngles: number;
  belowGroundFrames: number;
  maxJointStepPx: number;
};
export type EngineReport = { frameCount: number; fps: number; characters: CharacterReport[]; ok: boolean };
export type SceneFrames = { fps: number; frames: FrameCharacter[][]; report: EngineReport };

const GROUND_TOLERANCE_PX = 0.5;

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

// The facing in effect at time t: set by the latest key at or before t (a turn is a switch at a key).
const facingAt = (keys: CharacterKey[], fallback: Facing, t: number): Facing => {
  let facing = fallback;
  for (const key of keys) {
    if (key.t > t) break;
    facing = key.facing ?? facing;
  }
  return facing;
};

const lowestBodyY = (skeleton: Skeleton) => Math.max(skeleton.lFoot.y, skeleton.rFoot.y, skeleton.lKnee.y, skeleton.rKnee.y);

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

export function buildScene(scene: Scene, fps: number): SceneFrames {
  const frameCount = frameCountFor(scene.durationSec, fps);
  const frames: FrameCharacter[][] = Array.from({ length: frameCount }, () => []);
  const reports: CharacterReport[] = [];

  for (const character of scene.characters) {
    const keys = [...character.keys].sort((a, b) => a.t - b.t);
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
    const report: CharacterReport = { id: character.id, maxBoneErrorPx: 0, maxFootDriftPx: 0, clampedAngles: 0, belowGroundFrames: 0, maxJointStepPx: 0 };
    let previous: Skeleton | null = null;
    let previousFacing: Facing | null = null;

    for (let index = 0; index < frameCount; index += 1) {
      const t = Math.min(scene.durationSec, index / fps);
      const sampled = {} as PoseAngles;
      for (const name of POSE_KEYS) {
        const ch = channels[name];
        sampled[name] = sampleChannel(ch.times, ch.values, ch.tangents, ch.eases, t);
      }
      const { pose, clamped } = clampPose(sampled);
      report.clampedAngles += clamped;
      const x = sampleChannel(xChannel.times, xChannel.values, xChannel.tangents, xChannel.eases, t);
      const lift = Math.max(0, sampleChannel(liftChannel.times, liftChannel.values, liftChannel.tangents, liftChannel.eases, t));

      // A turn changes how the body is drawn, so planted feet are re-planted after it.
      const facing = facingAt(keys, character.facing, t);
      if (facing !== previousFacing) { delete locks.lFoot; delete locks.rFoot; }
      previousFacing = facing;

      // Stand the body on the ground: the lowest foot/knee sits `lift` above groundY.
      const atOrigin = forwardKinematics(pose, facing, { x, y: 0 }, character.height, character.style.headSize, character.style.neck === true);
      let skeleton = translateSkeleton(atOrigin, 0, scene.groundY - lift - lowestBodyY(atOrigin));

      // Planted feet stay exactly where they landed; the knee re-bends to reach them.
      const planted = (["lFoot", "rFoot"] as const).filter((contact) => {
        if (!contactActive(keys, contact, t)) { delete locks[contact]; return false; }
        if (!locks[contact]) { locks[contact] = { x: skeleton[contact].x, y: Math.min(skeleton[contact].y, scene.groundY) }; return false; }
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
        report.maxJointStepPx = Math.max(report.maxJointStepPx, ...JOINTS.map((name) => dist(skeleton[name], prev[name])));
      }
      previous = skeleton;
      frames[index].push({ id: character.id, skeleton, style: character.style, headRadius: radius, facing });
    }
    reports.push(report);
  }

  const ok = reports.every((r) => r.maxBoneErrorPx <= 0.5 && r.maxFootDriftPx <= 1 && r.belowGroundFrames === 0);
  return { fps, frames, report: { frameCount, fps, characters: reports, ok } };
}

// Two frames are the same picture when every joint of every character is within a hair.
export const framesIdentical = (a: FrameCharacter[], b: FrameCharacter[]) =>
  a.length === b.length && a.every((character, i) => JOINTS.every((name) => dist(character.skeleton[name], b[i].skeleton[name]) < 0.01));
