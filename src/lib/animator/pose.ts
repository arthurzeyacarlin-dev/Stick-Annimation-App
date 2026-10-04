import { boneLengths, headRadius, type Facing, type HeadSize, type PoseAngles, type Point, type Skeleton } from "./rig.ts";

const rad = (degrees: number) => (degrees * Math.PI) / 180;
// "Down" convention: angle 0 points straight down (+y), +90 points to +x.
const down = (degrees: number): Point => ({ x: Math.sin(rad(degrees)), y: Math.cos(rad(degrees)) });
const add = (a: Point, b: Point, length: number): Point => ({ x: a.x + b.x * length, y: a.y + b.y * length });

// Angles -> joint positions. The hip is placed at `hip`; bone lengths always come from the rig.
// Without a neck the head sits right on top of the body (the classic stick figure).
export function forwardKinematics(pose: PoseAngles, facing: Facing, hip: Point, height: number, headSize: HeadSize = "normal", withNeck = true): Skeleton {
  const bones = boneLengths(height);
  const radius = headRadius(height, headSize);
  const neckLength = withNeck ? bones.neck : 0;

  if (facing === "front") {
    const neck = add(hip, { x: Math.sin(rad(pose.lean)), y: -Math.cos(rad(pose.lean)) }, bones.torso);
    const headDir = { x: Math.sin(rad(pose.lean + pose.head)), y: -Math.cos(rad(pose.lean + pose.head)) };
    const head = add(neck, headDir, neckLength + radius);
    // side = -1 for the figure's left (screen left), +1 for its right.
    const limb = (side: -1 | 1, upper: number, bend: number, upperLength: number, lowerLength: number, root: Point, bendSign: 1 | -1) => {
      const a = upper;
      const mid = add(root, { x: side * Math.sin(rad(a)), y: Math.cos(rad(a)) }, upperLength);
      const b = a + bendSign * bend;
      const end = add(mid, { x: side * Math.sin(rad(b)), y: Math.cos(rad(b)) }, lowerLength);
      return { mid, end };
    };
    const lArm = limb(-1, pose.lShoulder, pose.lElbow, bones.upperArm, bones.forearm, neck, 1);
    const rArm = limb(1, pose.rShoulder, pose.rElbow, bones.upperArm, bones.forearm, neck, 1);
    const lLeg = limb(-1, pose.lHip, pose.lKnee, bones.thigh, bones.shin, hip, -1);
    const rLeg = limb(1, pose.rHip, pose.rKnee, bones.thigh, bones.shin, hip, -1);
    return { hip: { ...hip }, neck, head, lElbow: lArm.mid, lHand: lArm.end, rElbow: rArm.mid, rHand: rArm.end, lKnee: lLeg.mid, lFoot: lLeg.end, rKnee: rLeg.mid, rFoot: rLeg.end };
  }

  // Side view, solved facing right, then mirrored for facing left.
  const neck = add(hip, { x: Math.sin(rad(pose.lean)), y: -Math.cos(rad(pose.lean)) }, bones.torso);
  const head = add(neck, { x: Math.sin(rad(pose.lean + pose.head)), y: -Math.cos(rad(pose.lean + pose.head)) }, neckLength + radius);
  const torsoDown = -pose.lean;
  const arm = (shoulder: number, elbow: number) => {
    const upper = torsoDown + shoulder;
    const mid = add(neck, down(upper), bones.upperArm);
    return { mid, end: add(mid, down(upper + elbow), bones.forearm) };
  };
  const leg = (hipAngle: number, knee: number) => {
    const upper = torsoDown + hipAngle;
    const mid = add(hip, down(upper), bones.thigh);
    return { mid, end: add(mid, down(upper - knee), bones.shin) };
  };
  const lArm = arm(pose.lShoulder, pose.lElbow);
  const rArm = arm(pose.rShoulder, pose.rElbow);
  const lLeg = leg(pose.lHip, pose.lKnee);
  const rLeg = leg(pose.rHip, pose.rKnee);
  const skeleton: Skeleton = { hip: { ...hip }, neck, head, lElbow: lArm.mid, lHand: lArm.end, rElbow: rArm.mid, rHand: rArm.end, lKnee: lLeg.mid, lFoot: lLeg.end, rKnee: rLeg.mid, rFoot: rLeg.end };
  if (facing === "left") {
    for (const point of Object.values(skeleton)) point.x = hip.x - (point.x - hip.x);
  }
  return skeleton;
}

export const translateSkeleton = (skeleton: Skeleton, dx: number, dy: number): Skeleton => {
  const next = {} as Skeleton;
  for (const [name, point] of Object.entries(skeleton) as [keyof Skeleton, Point][]) next[name] = { x: point.x + dx, y: point.y + dy };
  return next;
};
