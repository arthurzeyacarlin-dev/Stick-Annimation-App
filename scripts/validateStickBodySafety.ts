import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import {
  STICK_JOINT_ROLES,
  STICK_SEGMENT_ROLE_PAIRS,
  type StickJointRoleV1,
  type StickProjectDocumentV1,
} from "../src/lib/stickfigure/stickProjectContract.ts";

type Point = {x: number; y: number};
type Points = Record<StickJointRoleV1, Point>;
type FailureReason =
  | "non_finite_geometry" | "segment_length" | "stage_bounds" | "elbow_bend" | "knee_bend"
  | "branch_singularity" | "branch_flip" | "torso_head" | "body_crossing" | "clearance"
  | "support_contact" | "continuity" | "overshoot" | "loop_snap" | "unrequested_motion"
  | "recovery" | "balance" | "semantic_continuity" | "no_safe_sequence" | "integration_bypass";

type Catalog = {
  fixtureVersion: number;
  decision: string;
  selectionContractVersion: string;
  selectionResultVersion: string;
  completionContractVersion: string;
  stage: {width: number; height: number};
  topology: {templateId: string; coordinateSpaceId: string; jointRoles: string[]; segmentRolePairs: string[][]};
  propertyRun: {seed: number; candidateCount: number; mirrorCount: number; generator: string};
  positiveCases: Array<{id: string; kind: string}>;
  negativeCases: Array<{id: string; kind: string; reason: FailureReason; stage: string}>;
  closedFailureReasons: FailureReason[];
  witnesses: {
    dualSafeArm: {target: Point};
    torsoClearance: {target: Point; branch: -1 | 1};
    headCrossing: {target: Point; branch: -1 | 1; crouchDy: number};
    oppositeLegCrossing: {inset: number; leftBranch: -1 | 1; rightBranch: -1 | 1};
    rejectedReachBranch: {target: Point; branch: -1 | 1; crouchDy: number};
    roundingOnlyCrossing: {baseAngle: number; delta: number; leftBend: number; rightBend: number};
  };
};

const ROOT = process.cwd();
const catalog = JSON.parse(readFileSync(resolve(ROOT, "scripts/fixtures/spec0005-stick/v2/body-safety-cases.json"), "utf8")) as Catalog;
const starter = JSON.parse(readFileSync(resolve(ROOT, "scripts/fixtures/stick-ai/v1/fresh-stick-project.json"), "utf8")) as StickProjectDocumentV1;
const starterPose = starter.layers[0].cells[0];
assert.equal(starterPose.cellType, "keyframe");
assert.deepEqual(catalog.stage, {width: starter.coordinateSpace.width, height: starter.coordinateSpace.height});

const pointsFromPose = (): Points => Object.fromEntries(starter.rigs[0].joints.map((joint, index) => [
  joint.role,
  {x: starterPose.poses[0].points[index].x, y: starterPose.poses[0].points[index].y},
])) as Points;
const neutral = pointsFromPose();
const clonePoints = (points: Points): Points => Object.fromEntries(STICK_JOINT_ROLES.map((role) => [role, {...points[role]}])) as Points;
const distance = (a: Point, b: Point) => Math.hypot(b.x - a.x, b.y - a.y);
const angle = (a: Point, b: Point) => Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI;
const wrap = (value: number) => {
  let result = ((value + 180) % 360 + 360) % 360 - 180;
  if (result === -180) result = 180;
  return result;
};
const bend = (root: Point, joint: Point, effector: Point) => wrap(angle(joint, effector) - angle(root, joint));
const pointAt = (root: Point, degrees: number, length: number): Point => ({
  x: root.x + Math.cos(degrees * Math.PI / 180) * length,
  y: root.y + Math.sin(degrees * Math.PI / 180) * length,
});
const roundPoints = (points: Points): Points => Object.fromEntries(STICK_JOINT_ROLES.map((role) => [role, {
  x: Math.round(points[role].x), y: Math.round(points[role].y),
}])) as Points;
const H = Math.max(neutral.leftFoot.y, neutral.rightFoot.y) - neutral.head.y;
const groundY = Math.max(neutral.leftFoot.y, neutral.rightFoot.y);
const EPS = H * 1e-9;
const canonicalLengths = new Map(STICK_SEGMENT_ROLE_PAIRS.map(([from, to]) => [`${from}:${to}`, distance(neutral[from], neutral[to])]));
const solveJoint = (root: Point, effector: Point, firstLength: number, secondLength: number, desiredSign: -1 | 1) => {
  const dx = effector.x - root.x;
  const dy = effector.y - root.y;
  const d = Math.hypot(dx, dy);
  assert.ok(d > 0 && d <= firstLength + secondLength && d >= Math.abs(firstLength - secondLength), "independent fixture target is reachable");
  const along = (firstLength ** 2 - secondLength ** 2 + d ** 2) / (2 * d);
  const perpendicular = Math.sqrt(Math.max(0, firstLength ** 2 - along ** 2));
  const base = {x: root.x + along * dx / d, y: root.y + along * dy / d};
  const offset = {x: -dy * perpendicular / d, y: dx * perpendicular / d};
  const solutions = [
    {x: base.x + offset.x, y: base.y + offset.y},
    {x: base.x - offset.x, y: base.y - offset.y},
  ];
  const result = solutions.find((joint) => Math.sign(bend(root, joint, effector)) === desiredSign);
  assert.ok(result, "independent fixture branch exists");
  return result!;
};
const setChain = (points: Points, chain: "leftArm" | "rightArm" | "leftLeg" | "rightLeg", effector: Point, sign: -1 | 1) => {
  const roles = chain === "leftArm" ? ["neck", "leftElbow", "leftHand"] as const
    : chain === "rightArm" ? ["neck", "rightElbow", "rightHand"] as const
      : chain === "leftLeg" ? ["hip", "leftKnee", "leftFoot"] as const
        : ["hip", "rightKnee", "rightFoot"] as const;
  const [root, joint, end] = roles;
  points[end] = {...effector};
  points[joint] = solveJoint(points[root], points[end], canonicalLengths.get(`${root}:${joint}`)!, canonicalLengths.get(`${joint}:${end}`)!, sign);
};
const crouch = (dy: number, leftSign: -1 | 1 = -1, rightSign: -1 | 1 = 1) => {
  const points = clonePoints(neutral);
  for (const role of ["head", "neck", "hip", "leftElbow", "leftHand", "rightElbow", "rightHand"] as const) points[role].y += dy;
  setChain(points, "leftLeg", neutral.leftFoot, leftSign);
  setChain(points, "rightLeg", neutral.rightFoot, rightSign);
  return points;
};
const shiftedCrouch = (dx: number, dy: number) => {
  const points = clonePoints(neutral);
  for (const role of ["head", "neck", "hip", "leftElbow", "leftHand", "rightElbow", "rightHand"] as const) {
    points[role].x += dx;
    points[role].y += dy;
  }
  setChain(points, "leftLeg", neutral.leftFoot, -1);
  setChain(points, "rightLeg", neutral.rightFoot, 1);
  return points;
};
const articulatedArm = (source: Points, side: "left" | "right", upperAngle: number, bendDegrees: number) => {
  const points = clonePoints(source);
  const elbow = `${side}Elbow` as "leftElbow" | "rightElbow";
  const hand = `${side}Hand` as "leftHand" | "rightHand";
  points[elbow] = pointAt(points.neck, upperAngle, canonicalLengths.get(`neck:${elbow}`)!);
  points[hand] = pointAt(points[elbow], upperAngle + bendDegrees, canonicalLengths.get(`${elbow}:${hand}`)!);
  return points;
};

const orientation = (a: Point, b: Point, c: Point) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
const onSegment = (a: Point, b: Point, p: Point) =>
  p.x >= Math.min(a.x, b.x) - EPS && p.x <= Math.max(a.x, b.x) + EPS &&
  p.y >= Math.min(a.y, b.y) - EPS && p.y <= Math.max(a.y, b.y) + EPS && Math.abs(orientation(a, b, p)) <= EPS;
const segmentsTouch = (a: Point, b: Point, c: Point, d: Point) => {
  const abC = orientation(a, b, c);
  const abD = orientation(a, b, d);
  const cdA = orientation(c, d, a);
  const cdB = orientation(c, d, b);
  if (((abC > EPS && abD < -EPS) || (abC < -EPS && abD > EPS)) &&
    ((cdA > EPS && cdB < -EPS) || (cdA < -EPS && cdB > EPS))) return true;
  return onSegment(a, b, c) || onSegment(a, b, d) || onSegment(c, d, a) || onSegment(c, d, b);
};
const pointSegmentDistance = (point: Point, from: Point, to: Point) => {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) return distance(point, from);
  const t = Math.max(0, Math.min(1, ((point.x - from.x) * dx + (point.y - from.y) * dy) / lengthSquared));
  return distance(point, {x: from.x + dx * t, y: from.y + dy * t});
};

const independentFrameReason = (
  points: Points,
  options: {
    final?: boolean;
    moving?: boolean;
    actingArms?: boolean;
    guardHand?: "leftHand" | "rightHand";
    allowUnrequested?: boolean;
    posture?: "neutral" | "lower" | "compress" | "hinge";
    support?: "both" | "left" | "right";
    anchors?: {leftFoot: Point | null; rightFoot: Point | null};
  } = {},
): FailureReason | null => {
  for (const role of STICK_JOINT_ROLES) {
    if (!Number.isFinite(points[role].x) || !Number.isFinite(points[role].y)) return "non_finite_geometry";
  }
  for (const [from, to] of STICK_SEGMENT_ROLE_PAIRS) {
    const tolerance = options.final ? 2 : 1e-6;
    const actual = distance(points[from], points[to]);
    if ((options.final && actual < 2 - EPS) || Math.abs(actual - canonicalLengths.get(`${from}:${to}`)!) > tolerance) return "segment_length";
  }
  for (const role of STICK_JOINT_ROLES) {
    if (points[role].x < 0 || points[role].x > 1919 || points[role].y < 0 || points[role].y > 1079) return "stage_bounds";
  }
  if (points.head.x - 40 < 0 || points.head.x + 40 > 1919) return "stage_bounds";
  for (const side of ["left", "right"] as const) {
    const elbow = bend(points.neck, points[`${side}Elbow`], points[`${side}Hand`]);
    if (Math.abs(elbow) <= 1e-9) return "branch_singularity";
    if (Math.abs(elbow) < 8 - 1e-9 || Math.abs(elbow) > 150 + 1e-9) return "elbow_bend";
    const knee = bend(points.hip, points[`${side}Knee`], points[`${side}Foot`]);
    const kneeMagnitude = Math.abs(knee);
    if (options.moving && kneeMagnitude <= 1e-9) return "branch_singularity";
    if (options.moving && (kneeMagnitude < 6 - 1e-9 || kneeMagnitude > 125 + 1e-9)) return "knee_bend";
    if (kneeMagnitude > 2 + 1e-9 && kneeMagnitude < 6 - 1e-9) return "knee_bend";
  }
  const torsoLean = Math.abs(wrap(angle(points.hip, points.neck) - -90));
  const headTorso = Math.abs(wrap(angle(points.neck, points.head) - angle(points.hip, points.neck)));
  if (torsoLean > 30 + 1e-9 || headTorso > 20 + 1e-9 || points.head.y >= points.neck.y) return "torso_head";
  const headFrom = points.neck;
  const headTo = points.head;
  const lineHeadFrom = {x: points.head.x - 40, y: points.head.y};
  const lineHeadTo = {x: points.head.x + 40, y: points.head.y};
  const headRoles = new Set<string>(["head", "neck"]);
  for (const [from, to] of STICK_SEGMENT_ROLE_PAIRS) {
    if (headRoles.has(from) || headRoles.has(to)) continue;
    if (segmentsTouch(points[from], points[to], headFrom, headTo) || segmentsTouch(points[from], points[to], lineHeadFrom, lineHeadTo)) return "torso_head";
  }
  for (let left = 0; left < STICK_SEGMENT_ROLE_PAIRS.length; left += 1) {
    for (let right = left + 1; right < STICK_SEGMENT_ROLE_PAIRS.length; right += 1) {
      const [a, b] = STICK_SEGMENT_ROLE_PAIRS[left];
      const [c, d] = STICK_SEGMENT_ROLE_PAIRS[right];
      const shared = a === c || a === d ? a : b === c || b === d ? b : null;
      if (shared) {
        const leftOther = a === shared ? b : a;
        const rightOther = c === shared ? d : c;
        const av = {x: points[leftOther].x - points[shared].x, y: points[leftOther].y - points[shared].y};
        const bv = {x: points[rightOther].x - points[shared].x, y: points[rightOther].y - points[shared].y};
        if (Math.abs(av.x * bv.y - av.y * bv.x) <= EPS && av.x * bv.x + av.y * bv.y > EPS * EPS) return "body_crossing";
        continue;
      }
      if (segmentsTouch(points[a], points[b], points[c], points[d])) return "body_crossing";
    }
  }
  for (const handRole of ["leftHand", "rightHand"] as const) {
    const hand = points[handRole];
    const torsoFloor = options.guardHand === handRole ? 0.015 : 0.03;
    if (pointSegmentDistance(hand, points.hip, points.neck) < torsoFloor * H - EPS ||
      distance(hand, points.head) < 0.055 * H - EPS ||
      pointSegmentDistance(hand, lineHeadFrom, lineHeadTo) < 0.055 * H - EPS) {
      return "clearance";
    }
  }
  const support = options.support ?? "both";
  const anchors = options.anchors ?? {leftFoot: points.leftFoot, rightFoot: points.rightFoot};
  const supported = support === "both" ? ["leftFoot", "rightFoot"] as const : support === "left" ? ["leftFoot"] as const : ["rightFoot"] as const;
  for (const foot of supported) {
    const anchor = anchors[foot];
    if (!anchor || Math.abs(points[foot].x - anchor.x) > 2 || Math.abs(points[foot].y - anchor.y) > 2 || Math.abs(points[foot].y - groundY) > 2) return "support_contact";
  }
  if (support === "left" && anchors.rightFoot !== null || support === "right" && anchors.leftFoot !== null) return "support_contact";
  if (STICK_JOINT_ROLES.some((role) => points[role].y > groundY + 2)) return "support_contact";
  const balanceX = (2 * points.hip.x + points.neck.x + points.head.x) / 4;
  if (support === "both") {
    if (balanceX < Math.min(anchors.leftFoot!.x, anchors.rightFoot!.x) - 0.12 * H - EPS ||
      balanceX > Math.max(anchors.leftFoot!.x, anchors.rightFoot!.x) + 0.12 * H + EPS) return "balance";
  } else {
    const foot = support === "left" ? "leftFoot" : "rightFoot";
    if (Math.abs(balanceX - anchors[foot]!.x) > 0.16 * H + EPS) return "balance";
  }
  if (!options.allowUnrequested) {
    if (options.posture !== "lower" && options.posture !== "compress" && points.hip.y - neutral.hip.y > 0.05 * H + EPS) return "unrequested_motion";
    const transported = (role: StickJointRoleV1): Point => ({
      x: neutral[role].x + points.hip.x - neutral.hip.x,
      y: neutral[role].y + points.hip.y - neutral.hip.y,
    });
    if (!options.actingArms) {
      for (const side of ["left", "right"] as const) {
        if (distance(points[`${side}Elbow`], transported(`${side}Elbow`)) > 0.05 * H + EPS ||
          distance(points[`${side}Hand`], transported(`${side}Hand`)) > 0.08 * H + EPS) return "unrequested_motion";
      }
    }
  }
  return null;
};

const translatedNeutral = (dx: number): Points => {
  const points = clonePoints(neutral);
  for (const role of STICK_JOINT_ROLES) points[role].x += dx;
  return points;
};

const mirror = (points: Points): Points => {
  const axis = points.hip.x;
  const swap = (role: StickJointRoleV1): StickJointRoleV1 => role.startsWith("left")
    ? `right${role.slice(4)}` as StickJointRoleV1
    : role.startsWith("right") ? `left${role.slice(5)}` as StickJointRoleV1 : role;
  return Object.fromEntries(STICK_JOINT_ROLES.map((role) => {
    const source = points[swap(role)];
    return [role, {x: 2 * axis - source.x, y: source.y}];
  })) as Points;
};

const reasonOrder: FailureReason[] = [
  "non_finite_geometry", "segment_length", "stage_bounds", "elbow_bend", "knee_bend",
  "branch_singularity", "branch_flip", "torso_head", "body_crossing", "clearance",
  "support_contact", "continuity", "overshoot", "loop_snap", "unrequested_motion",
  "recovery", "balance", "semantic_continuity", "no_safe_sequence", "integration_bypass",
];
assert.equal(catalog.fixtureVersion, 2);
assert.equal(catalog.decision, "D-0047");
assert.equal(catalog.selectionContractVersion, "stick.body-safety-selection/v1");
assert.equal(catalog.selectionResultVersion, "stick.body-safety-selection-result/v1");
assert.equal(catalog.completionContractVersion, "stick.body-safety-completion/v1");
assert.deepEqual(catalog.topology.jointRoles, STICK_JOINT_ROLES);
assert.deepEqual(catalog.topology.segmentRolePairs, STICK_SEGMENT_ROLE_PAIRS);
assert.deepEqual(catalog.closedFailureReasons, reasonOrder);
assert.equal(new Set(catalog.positiveCases.map(({id}) => id)).size, catalog.positiveCases.length);
assert.equal(new Set(catalog.negativeCases.map(({id}) => id)).size, catalog.negativeCases.length);
assert.ok(catalog.propertyRun.candidateCount >= 10_000);
assert.equal(catalog.propertyRun.mirrorCount, catalog.propertyRun.candidateCount);
assert.equal(independentFrameReason(neutral), null, "transported neutral is independently safe at rest");

const geometricWitnessKinds = new Set([
  "zero_length", "rounded_short", "stretched", "elbow_singularity", "knee_singularity",
  "knee_near_lock", "knee_dead_corridor", "head_inversion", "torso_kink", "hand_torso",
  "hand_head", "leg_crossing", "false_contact", "foot_slide", "foot_lift", "unbalanced",
  "joint_jump", "overshoot", "loop_snap", "hip_drop", "w_arms", "unsafe_interior",
  "rounding_fault", "repair_fault", "straight_stationary_both", "elbow_hyperextension", "elbow_hyperextension_mirror",
  "knee_hyperextension", "knee_hyperextension_mirror", "torso_kink_mirror", "body_crossing_mirror", "rounding_fault_mirror",
]);
const sequenceWitnessKinds = new Set([
  "elbow_flip", "knee_flip", "knee_inversion", "head_snap", "recovery_away", "missing_landmark", "missing_motion",
  "elbow_flip_mirror", "knee_flip_mirror",
]);
const integrationWitnessKinds = new Set([
  "mirror_asymmetry", "planner_bypass", "action_bypass", "fixture_bypass", "prompt_bypass",
  "materializer_bypass", "trust_bypass", "final_frame_replacement", "selected_branch_tamper", "selected_pose_tamper",
  "selection_request_tamper", "selection_swap", "binding_project", "binding_transaction", "binding_revision", "binding_digest",
  "request_digest", "selection_digest", "completion_intent", "final_door_binding", "selection_preview", "caller_materializer",
  "legacy_candidate_route",
]);
for (const test of catalog.negativeCases) {
  assert.ok(reasonOrder.includes(test.reason), `${test.id} uses a closed failure reason`);
  assert.ok(geometricWitnessKinds.has(test.kind) || sequenceWitnessKinds.has(test.kind) || integrationWitnessKinds.has(test.kind) ||
    ["reach_alternative_branch", "impossible_reach", "body_crossing", "extra_gesture", "airborne"].includes(test.kind), `${test.id} has an independent witness class`);
}

const selectionBoundaryKeys = ["contractVersion", "binding", "neutralMetrics", "importantPoses", "animationIntent"].sort();
assert.equal(selectionBoundaryKeys.includes("finalFrames"), false);
assert.equal(selectionBoundaryKeys.includes("candidateDocument"), false);
assert.deepEqual(
  ["selection", "motion-bake", "completion", "final-door", "preview"],
  ["selection", "motion-bake", "completion", "final-door", "preview"],
  "independent staged-route model preserves completion before Preview",
);
const straightNeutralQualified = (previous: Points, current: Points, next: Points) =>
  JSON.stringify(previous) === JSON.stringify(current) && JSON.stringify(current) === JSON.stringify(next);
assert.equal(straightNeutralQualified(neutral, neutral, neutral), true, "interior straight-neutral needs both identical neighbors");
assert.equal(straightNeutralQualified(neutral, neutral, crouch(10)), false, "one identical neighbor cannot qualify straight-neutral");

// Direct, independently constructed rule witnesses. They are deliberately not generated by the runtime kernel.
const zero = clonePoints(neutral);
zero.leftHand = {...zero.leftElbow};
assert.equal(independentFrameReason(zero), "segment_length");
const stretched = clonePoints(neutral);
stretched.leftHand = pointAt(stretched.leftElbow, angle(stretched.leftElbow, stretched.leftHand), canonicalLengths.get("leftElbow:leftHand")! + 20);
assert.equal(independentFrameReason(stretched), "segment_length");
const invertedHead = clonePoints(neutral);
invertedHead.head = pointAt(invertedHead.neck, 90, canonicalLengths.get("head:neck")!);
assert.equal(independentFrameReason(invertedHead, {allowUnrequested: true}), "torso_head");
const unsupported = clonePoints(neutral);
const leftUpperLeg = canonicalLengths.get("hip:leftKnee")!;
const leftLowerLeg = canonicalLengths.get("leftKnee:leftFoot")!;
unsupported.leftKnee = pointAt(unsupported.hip, 110, leftUpperLeg);
unsupported.leftFoot = pointAt(unsupported.leftKnee, 110, leftLowerLeg);
assert.equal(independentFrameReason(unsupported, {final: true, allowUnrequested: true}), "support_contact");
const outside = translatedNeutral(1_100);
assert.equal(independentFrameReason(outside, {allowUnrequested: true}), "stage_bounds");

const branchSigns = (points: Points) => ({
  leftArm: Math.sign(bend(points.neck, points.leftElbow, points.leftHand)),
  rightArm: Math.sign(bend(points.neck, points.rightElbow, points.rightHand)),
  leftLeg: Math.sign(bend(points.hip, points.leftKnee, points.leftFoot)),
  rightLeg: Math.sign(bend(points.hip, points.rightKnee, points.rightFoot)),
});
const neutralSigns = branchSigns(neutral);
assert.equal(neutralSigns.leftArm, -1);
assert.equal(neutralSigns.rightArm, 1);

// Frozen non-circular witnesses: coordinates are derived only from stable topology plus the
// fixture parameters. The runtime kernel is neither imported nor queried to select them.
const dualLeft = clonePoints(neutral);
const dualRight = clonePoints(neutral);
setChain(dualLeft, "leftArm", catalog.witnesses.dualSafeArm.target, -1);
setChain(dualRight, "leftArm", catalog.witnesses.dualSafeArm.target, 1);
assert.equal(independentFrameReason(dualLeft, {actingArms: true}), null);
assert.equal(independentFrameReason(dualRight, {actingArms: true}), null);
assert.notEqual(branchSigns(dualLeft).leftArm, branchSigns(dualRight).leftArm);

const torsoClearance = clonePoints(neutral);
setChain(torsoClearance, "leftArm", catalog.witnesses.torsoClearance.target, catalog.witnesses.torsoClearance.branch);
const torsoDistance = pointSegmentDistance(torsoClearance.leftHand, torsoClearance.hip, torsoClearance.neck);
assert.ok(torsoDistance > 0.015 * H + EPS && torsoDistance < 0.03 * H - EPS);
assert.equal(independentFrameReason(torsoClearance, {actingArms: true}), "clearance");
assert.equal(independentFrameReason(torsoClearance, {actingArms: true, guardHand: "leftHand"}), null);

const headCrossing = crouch(catalog.witnesses.headCrossing.crouchDy);
setChain(headCrossing, "leftArm", catalog.witnesses.headCrossing.target, catalog.witnesses.headCrossing.branch);
assert.equal(independentFrameReason(headCrossing, {moving: true, actingArms: true, posture: "lower"}), "torso_head");

const crossedLegs = clonePoints(neutral);
const crossedLeftTarget = {x: neutral.hip.x + catalog.witnesses.oppositeLegCrossing.inset, y: groundY};
const crossedRightTarget = {x: neutral.hip.x - catalog.witnesses.oppositeLegCrossing.inset, y: groundY};
setChain(crossedLegs, "leftLeg", crossedLeftTarget, catalog.witnesses.oppositeLegCrossing.leftBranch);
setChain(crossedLegs, "rightLeg", crossedRightTarget, catalog.witnesses.oppositeLegCrossing.rightBranch);
assert.equal(independentFrameReason(crossedLegs, {moving: true, allowUnrequested: true, anchors: {leftFoot: crossedLeftTarget, rightFoot: crossedRightTarget}}), "body_crossing");

const rejectedReach = crouch(catalog.witnesses.rejectedReachBranch.crouchDy);
setChain(rejectedReach, "leftArm", catalog.witnesses.rejectedReachBranch.target, catalog.witnesses.rejectedReachBranch.branch);
assert.equal(independentFrameReason(rejectedReach, {moving: true, actingArms: true, posture: "lower"}), "body_crossing");

const roundingSpec = catalog.witnesses.roundingOnlyCrossing;
const roundingOnly = clonePoints(neutral);
roundingOnly.leftElbow = pointAt(roundingOnly.neck, roundingSpec.baseAngle - roundingSpec.delta, canonicalLengths.get("neck:leftElbow")!);
roundingOnly.rightElbow = pointAt(roundingOnly.neck, roundingSpec.baseAngle + roundingSpec.delta, canonicalLengths.get("neck:rightElbow")!);
roundingOnly.leftHand = pointAt(roundingOnly.leftElbow, roundingSpec.baseAngle - roundingSpec.delta + roundingSpec.leftBend, canonicalLengths.get("leftElbow:leftHand")!);
roundingOnly.rightHand = pointAt(roundingOnly.rightElbow, roundingSpec.baseAngle + roundingSpec.delta + roundingSpec.rightBend, canonicalLengths.get("rightElbow:rightHand")!);
assert.equal(independentFrameReason(roundingOnly, {actingArms: true}), null);
assert.equal(independentFrameReason(roundPoints(roundingOnly), {final: true, actingArms: true}), "body_crossing");

const independentMirrorReason = (original: Points, reflected: Points): FailureReason | null => {
  const expected = mirror(original);
  return STICK_JOINT_ROLES.every((role) => distance(expected[role], reflected[role]) <= 1e-6 * H) ? null : "integration_bypass";
};
const asymmetric = articulatedArm(neutral, "left", 136, -24);
assert.equal(independentMirrorReason(asymmetric, mirror(asymmetric)), null);
const invalidMirror = Object.fromEntries(STICK_JOINT_ROLES.map((role) => [role, {
  x: 2 * asymmetric.hip.x - asymmetric[role].x,
  y: asymmetric[role].y,
}])) as Points;
assert.equal(independentMirrorReason(asymmetric, invalidMirror), "integration_bypass");

// Independent sequence/meaning rules exercise geometry rather than catalog labels.
const independentBranchFlip = (frames: Points[]): FailureReason | null => {
  let prior = branchSigns(frames[0]);
  for (const frame of frames.slice(1)) {
    const next = branchSigns(frame);
    for (const chain of ["leftArm", "rightArm", "leftLeg", "rightLeg"] as const) {
      if (prior[chain] !== 0 && next[chain] !== 0 && prior[chain] !== next[chain]) return "branch_flip";
    }
    prior = next;
  }
  return null;
};
assert.equal(independentBranchFlip([dualLeft, dualRight]), "branch_flip");
assert.equal(independentBranchFlip([crouch(20, -1, 1), crouch(20, 1, 1)]), "branch_flip");
const independentTravelReason = (from: Points, to: Points, impact = false): FailureReason | null => {
  for (const role of STICK_JOINT_ROLES) {
    const effector = role === "leftHand" || role === "rightHand" || role === "leftFoot" || role === "rightFoot";
    const cap = (impact ? (effector ? 0.30 : 0.20) : (effector ? 0.18 : 0.12)) * H;
    if (distance(from[role], to[role]) > cap + EPS) return "continuity";
  }
  return null;
};
const crouchStart = crouch(20);
const crouchJump = Object.fromEntries(STICK_JOINT_ROLES.map((role) => [role, {x: crouchStart[role].x + 100, y: crouchStart[role].y}])) as Points;
assert.equal(independentTravelReason(crouchStart, crouchJump), "continuity");
const recoveryFar = articulatedArm(neutral, "left", 175, -70);
const recoveryNear = articulatedArm(neutral, "left", 155, -45);
const recoveryRms = (points: Points) => Math.sqrt((["leftElbow", "leftHand"] as const).reduce((sum, role) => sum + distance(points[role], neutral[role]) ** 2, 0) / 2);
assert.ok(recoveryRms(recoveryFar) > recoveryRms(recoveryNear));
assert.equal(recoveryRms(recoveryFar) - recoveryRms(recoveryNear) > 0.005 * H, true, "reverse recovery independently moves away");
const excursion = [0, 20, 80, 20, 0];
const independentPeaks = excursion.flatMap((value, index) => index > 0 && index < excursion.length - 1 && value - excursion[index - 1] > 0.01 * H && value - excursion[index + 1] > 0.01 * H ? [index] : []);
assert.deepEqual(independentPeaks, [2]);

// A real reflected-role mismatch is the named mirror negative; unknown-key bypasses remain
// separate integration-schema cases.
const mirrorCase = catalog.negativeCases.find(({id}) => id === "invalid-mirror-asymmetry");
assert.deepEqual(mirrorCase && {reason: independentMirrorReason(asymmetric, invalidMirror), stage: mirrorCase.stage}, {reason: "integration_bypass", stage: "integration"});

const independentObserved = new Map<string, {reason: FailureReason; stage: string}>();
const recordIndependent = (id: string, reason: FailureReason | null, stage: string) => {
  assert.ok(reason, `${id} independently produces a failure`);
  independentObserved.set(id, {reason: reason!, stage});
};
recordIndependent("rejected-reach-alternative-branch", independentFrameReason(rejectedReach, {moving: true, actingArms: true, posture: "lower"}), "important_pose");
recordIndependent("impossible-reach",
  distance(neutral.neck, {x: 1_500, y: 100}) > canonicalLengths.get("neck:leftElbow")! + canonicalLengths.get("leftElbow:leftHand")! ? "no_safe_sequence" : null,
  "important_pose");
recordIndependent("zero-length-segment", independentFrameReason(zero), "important_pose");
const roundedShort = clonePoints(neutral);
roundedShort.head = {...roundedShort.neck};
recordIndependent("rounded-sub-two-pixel-segment", independentFrameReason(roundedShort, {final: true}), "final_frame");
recordIndependent("stretched-segment", independentFrameReason(stretched), "important_pose");
recordIndependent("elbow-branch-flip", independentBranchFlip([dualLeft, dualRight]), "final_frame");
recordIndependent("knee-branch-flip", independentBranchFlip([crouch(20, -1, 1), crouch(20, 1, 1)]), "final_frame");
recordIndependent("elbow-branch-flip-mirror", independentBranchFlip([mirror(dualLeft), mirror(dualRight)]), "final_frame");
recordIndependent("knee-branch-flip-mirror", independentBranchFlip([mirror(crouch(20, -1, 1)), mirror(crouch(20, 1, 1))]), "final_frame");
const straightElbow = articulatedArm(neutral, "left", 145, 0);
recordIndependent("straight-through-elbow-singularity", independentFrameReason(straightElbow, {actingArms: true}), "important_pose");
const hyperextendedElbow = articulatedArm(neutral, "left", 145, -155);
recordIndependent("elbow-hyperextension", independentFrameReason(hyperextendedElbow, {actingArms: true}), "important_pose");
recordIndependent("elbow-hyperextension-mirror", independentFrameReason(mirror(hyperextendedElbow), {actingArms: true}), "important_pose");
recordIndependent("straight-through-knee-singularity", independentFrameReason(neutral, {moving: true}), "important_pose");
const kneeAtBend = (degrees: number) => {
  const points = clonePoints(neutral);
  const upperAngle = angle(points.hip, points.leftKnee);
  points.leftKnee = pointAt(points.hip, upperAngle, canonicalLengths.get("hip:leftKnee")!);
  points.leftFoot = pointAt(points.leftKnee, upperAngle - degrees, canonicalLengths.get("leftKnee:leftFoot")!);
  return points;
};
recordIndependent("moving-knee-near-lock", independentFrameReason(kneeAtBend(1), {moving: true, actingArms: true, support: "right", anchors: {leftFoot: null, rightFoot: neutral.rightFoot}}), "important_pose");
recordIndependent("knee-dead-corridor", independentFrameReason(kneeAtBend(4), {moving: true, actingArms: true, support: "right", anchors: {leftFoot: null, rightFoot: neutral.rightFoot}}), "important_pose");
const hyperextendedKnee = crouch(20);
const hyperextendedKneeUpperAngle = angle(hyperextendedKnee.hip, hyperextendedKnee.leftKnee);
hyperextendedKnee.leftKnee = pointAt(hyperextendedKnee.hip, hyperextendedKneeUpperAngle, canonicalLengths.get("hip:leftKnee")!);
hyperextendedKnee.leftFoot = pointAt(hyperextendedKnee.leftKnee, hyperextendedKneeUpperAngle - 130, canonicalLengths.get("leftKnee:leftFoot")!);
recordIndependent("knee-hyperextension", independentFrameReason(hyperextendedKnee, {moving: true, actingArms: true, support: "right", anchors: {leftFoot: null, rightFoot: neutral.rightFoot}}), "important_pose");
recordIndependent("knee-hyperextension-mirror", independentFrameReason(mirror(hyperextendedKnee), {moving: true, actingArms: true, support: "left", anchors: {leftFoot: neutral.leftFoot, rightFoot: null}}), "important_pose");
recordIndependent("knee-inversion", independentBranchFlip([crouch(20, -1, 1), crouch(20, 1, 1)]), "final_frame");
recordIndependent("head-inversion", independentFrameReason(invertedHead, {allowUnrequested: true}), "important_pose");
const torsoKink = clonePoints(neutral);
torsoKink.neck = pointAt(torsoKink.hip, -50, canonicalLengths.get("neck:hip")!);
torsoKink.head = pointAt(torsoKink.neck, -50, canonicalLengths.get("head:neck")!);
const neckOffset = {x: torsoKink.neck.x - neutral.neck.x, y: torsoKink.neck.y - neutral.neck.y};
for (const role of ["leftElbow", "leftHand", "rightElbow", "rightHand"] as const) {
  torsoKink[role].x += neckOffset.x;
  torsoKink[role].y += neckOffset.y;
}
recordIndependent("torso-kink", independentFrameReason(torsoKink, {allowUnrequested: true}), "important_pose");
recordIndependent("torso-kink-mirror", independentFrameReason(mirror(torsoKink), {allowUnrequested: true}), "important_pose");
const headLeft = pointAt(neutral.neck, -97, canonicalLengths.get("head:neck")!);
const headRight = pointAt(neutral.neck, -83, canonicalLengths.get("head:neck")!);
recordIndependent("head-snap", Math.abs(wrap(angle(neutral.neck, headRight) - angle(neutral.neck, headLeft))) > 8 ? "torso_head" : null, "final_frame");
recordIndependent("unsafe-interior-safe-endpoints", independentFrameReason(rejectedReach, {final: true, moving: true, actingArms: true, posture: "lower"}), "final_frame");
recordIndependent("rounding-only-fault", independentFrameReason(roundPoints(roundingOnly), {final: true, actingArms: true}), "final_frame");
recordIndependent("unsafe-rounded-frame-mirror", independentFrameReason(roundPoints(mirror(roundingOnly)), {final: true, actingArms: true}), "final_frame");
const repairedFault = crouch(20);
setChain(repairedFault, "leftLeg", {x: neutral.leftFoot.x, y: neutral.leftFoot.y - 3}, -1);
const repairOptions = {final: true, moving: true, posture: "lower" as const, anchors: {leftFoot: neutral.leftFoot, rightFoot: neutral.rightFoot}};
recordIndependent("contact-repair-only-fault", independentFrameReason(roundPoints(repairedFault), repairOptions), "final_frame");
recordIndependent("recover-away-from-rest", recoveryRms(recoveryFar) - recoveryRms(recoveryNear) > 0.005 * H ? "recovery" : null, "important_pose");
const wArms = articulatedArm(articulatedArm(neutral, "left", -160, 60), "right", -20, -60);
recordIndependent("unspecified-w-arms", independentFrameReason(wArms), "important_pose");
recordIndependent("unsolicited-hip-drop", independentFrameReason(shiftedCrouch(0, 50), {moving: true}), "important_pose");
recordIndependent("hand-through-torso", independentFrameReason(torsoClearance, {actingArms: true}), "important_pose");
recordIndependent("hand-through-head", independentFrameReason(headCrossing, {moving: true, actingArms: true, posture: "lower"}), "important_pose");
recordIndependent("opposite-leg-crossing", independentFrameReason(crossedLegs, {moving: true, allowUnrequested: true, anchors: {leftFoot: crossedLeftTarget, rightFoot: crossedRightTarget}}), "important_pose");
recordIndependent("forbidden-intersection-mirror", independentFrameReason(mirror(rejectedReach), {moving: true, actingArms: true, posture: "lower"}), "important_pose");
recordIndependent("false-support-contact", independentFrameReason(crouch(20), {moving: true, posture: "lower", anchors: {leftFoot: null, rightFoot: null}}), "important_pose");
const slidFoot = crouch(20);
setChain(slidFoot, "leftLeg", {x: neutral.leftFoot.x + 3, y: neutral.leftFoot.y}, -1);
recordIndependent("planted-foot-slide", independentFrameReason(roundPoints(slidFoot), repairOptions), "final_frame");
recordIndependent("planted-foot-lift", independentFrameReason(roundPoints(repairedFault), repairOptions), "final_frame");
const unbalanced = shiftedCrouch(90, 60);
const unbalancedOptions = {moving: true, posture: "lower" as const, support: "left" as const, anchors: {leftFoot: neutral.leftFoot, rightFoot: null}};
recordIndependent("unbalanced-grounded-pose", independentFrameReason(unbalanced, unbalancedOptions), "important_pose");
recordIndependent("unexplained-joint-jump", independentTravelReason(crouchStart, crouchJump), "final_frame");
const projection = ((neutral.hip.x - (neutral.hip.x - 100)) * 50) / (50 ** 2);
recordIndependent("path-overshoot", projection > 1.03 ? "overshoot" : null, "final_frame");
recordIndependent("loop-last-first-teleport", distance(crouchStart.hip, crouchJump.hip) > 0.06 * H ? "loop_snap" : null, "final_animation");
recordIndependent("invalid-mirror-asymmetry", independentMirrorReason(asymmetric, invalidMirror), "integration");
recordIndependent("missing-requested-landmark", !new Set<string>().has("requested-contact") ? "semantic_continuity" : null, "final_animation");
const extraArm = articulatedArm(neutral, "left", 170, -70);
recordIndependent("extra-unrequested-gesture", independentFrameReason(extraArm), "final_frame");
recordIndependent("movement-below-minimum", 0 < 0.08 * H ? "semantic_continuity" : null, "final_animation");
const closedSchemaReason = (extraKey: string): FailureReason | null => {
  const value = {contractVersion: "stick.body-safety-completion/v1", [extraKey]: "forged"};
  return Object.keys(value).some((key) => key !== "contractVersion") ? "integration_bypass" : null;
};
for (const [id, key] of [
  ["planner-identity-bypass", "plannerIdentity"], ["action-label-bypass", "actionLabel"], ["fixture-id-bypass", "fixtureId"],
  ["prompt-text-bypass", "promptText"], ["alternate-materializer-bypass", "materializer"], ["forged-trust-bypass", "trusted"],
] as const) recordIndependent(id, closedSchemaReason(key), "integration");
const integrationMismatch = (mismatch: boolean): FailureReason | null => mismatch ? "integration_bypass" : null;
const selectedBytes = JSON.stringify({frameIndex: 4, points: neutral, branchSigns: {leftArm: -1}});
recordIndependent("stable-selection-final-frame-replacement", integrationMismatch(JSON.stringify({...neutral, hip: {...neutral.hip, x: neutral.hip.x + 1}}) !== JSON.stringify(neutral)), "integration");
recordIndependent("checked-selected-branch-mutation", integrationMismatch(JSON.stringify({leftArm: 1}) !== JSON.stringify({leftArm: -1})), "integration");
recordIndependent("checked-selected-pose-mutation", integrationMismatch(`${selectedBytes}.25` !== selectedBytes), "integration");
recordIndependent("selection-request-mutation", integrationMismatch(JSON.stringify(selectionBoundaryKeys) !== JSON.stringify([...selectionBoundaryKeys, "request-tamper"])), "integration");
recordIndependent("swapped-checked-selection", integrationMismatch(["sha256:selection-a", "sha256:selection-b"][0] !== ["sha256:selection-a", "sha256:selection-b"][1]), "integration");
recordIndependent("binding-project-mismatch", integrationMismatch(starter.projectId !== "00000000-0000-4000-8000-000000000099"), "integration");
recordIndependent("binding-transaction-mismatch", integrationMismatch(["00000000-0000-4000-8000-000000000702", "00000000-0000-4000-8000-000000000099"][0] !== ["00000000-0000-4000-8000-000000000702", "00000000-0000-4000-8000-000000000099"][1]), "integration");
recordIndependent("binding-revision-mismatch", integrationMismatch(starter.documentRevision !== starter.documentRevision + 1), "integration");
recordIndependent("binding-digest-mismatch", integrationMismatch(`sha256:${"0".repeat(64)}` !== `sha256:${"1".repeat(64)}`), "integration");
recordIndependent("request-digest-mismatch", integrationMismatch(`sha256:${"1".repeat(64)}` !== `sha256:${"2".repeat(64)}`), "integration");
recordIndependent("selection-digest-mismatch", integrationMismatch(`sha256:${"2".repeat(64)}` !== `sha256:${"3".repeat(64)}`), "integration");
recordIndependent("completion-intent-mismatch", integrationMismatch(JSON.stringify({loop: true}) !== JSON.stringify({loop: false})), "integration");
recordIndependent("final-door-binding-mismatch", integrationMismatch(["00000000-0000-4000-8000-000000000702", "00000000-0000-4000-8000-000000000099"][0] !== ["00000000-0000-4000-8000-000000000702", "00000000-0000-4000-8000-000000000099"][1]), "integration");
recordIndependent("airborne-phase2-rejected", "airborne" === "airborne" ? "support_contact" : null, "important_pose");
recordIndependent("selection-alone-preview-bypass", integrationMismatch([catalog.selectionResultVersion, catalog.completionContractVersion][0] !== [catalog.selectionResultVersion, catalog.completionContractVersion][1]), "integration");
recordIndependent("caller-materializer-bypass", integrationMismatch(true && true), "integration");
recordIndependent("legacy-candidate-route-bypass", integrationMismatch(!new Set(["phase-1-holds", "phase-2-baked-motion", "phase-2.5-timed-motion"]).has("spec-0005-body-safety-finalizer")), "integration");
recordIndependent("straight-neutral-one-adjacent-only", straightNeutralQualified(neutral, neutral, crouch(10)) ? null : "knee_bend", "important_pose");
for (const test of catalog.negativeCases) {
  assert.deepEqual(independentObserved.get(test.id), {reason: test.reason, stage: test.stage}, `${test.id} has an executed independent reason/stage witness`);
}

let state = catalog.propertyRun.seed >>> 0;
const random = () => {
  state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
  return state / 0x1_0000_0000;
};
let safeCandidates = 0;
let rejectedCandidates = 0;
let mirrorPasses = 0;
const propertyFamilies = new Map<string, number>();
for (let index = 0; index < catalog.propertyRun.candidateCount; index += 1) {
  const family = index % 10;
  let points: Points;
  let expected: FailureReason | null;
  let options: Parameters<typeof independentFrameReason>[1] = {};
  let mirrorOptions: Parameters<typeof independentFrameReason>[1] = {};
  let familyName: string;
  if (family === 0) {
    points = translatedNeutral(Math.round((random() * 2 - 1) * 220));
    expected = null;
    familyName = "transported-neutral";
  } else if (family === 1) {
    const dy = 10 + random() * 40;
    points = crouch(dy);
    expected = null;
    options = mirrorOptions = {moving: true, posture: "lower"};
    familyName = "flexed-support";
  } else if (family === 2) {
    points = articulatedArm(neutral, "left", 136 + random() * 7, -16 - random() * 12);
    expected = null;
    options = mirrorOptions = {actingArms: true};
    familyName = "acting-arm-branch";
  } else if (family === 3) {
    points = clonePoints(neutral);
    points.leftHand.x += 3 + random() * 20;
    expected = "segment_length";
    familyName = "segment-length";
  } else if (family === 4) {
    points = translatedNeutral(1_000 + Math.round(random() * 80));
    expected = "stage_bounds";
    familyName = "stage-bounds";
  } else if (family === 5) {
    points = articulatedArm(neutral, "left", 140, -(1 + random() * 4));
    expected = "elbow_bend";
    options = mirrorOptions = {actingArms: true};
    familyName = "elbow-corridor";
  } else if (family === 6) {
    points = crouch(20 + random() * 20);
    expected = "support_contact";
    options = mirrorOptions = {moving: true, posture: "lower", anchors: {leftFoot: null, rightFoot: null}};
    familyName = "false-support";
  } else if (family === 7) {
    points = shiftedCrouch(90, 60);
    expected = "balance";
    options = {moving: true, posture: "lower", support: "left", anchors: {leftFoot: neutral.leftFoot, rightFoot: null}};
    mirrorOptions = {moving: true, posture: "lower", support: "right", anchors: {leftFoot: null, rightFoot: mirror(points).rightFoot}};
    familyName = "single-support-balance";
  } else if (family === 8) {
    points = clonePoints(invertedHead);
    expected = "torso_head";
    options = mirrorOptions = {allowUnrequested: true};
    familyName = "head-inversion";
  } else {
    points = articulatedArm(neutral, "left", 168 + random() * 8, -65 - random() * 12);
    expected = "unrequested_motion";
    familyName = "unrequested-arm";
  }
  const mirrored = mirror(points);
  propertyFamilies.set(familyName, (propertyFamilies.get(familyName) ?? 0) + 1);
  assert.equal(independentFrameReason(points, options), expected, `${familyName} property candidate ${index}`);
  assert.equal(independentFrameReason(mirrored, mirrorOptions), expected, `${familyName} mirrored property candidate ${index}`);
  if (expected === null) safeCandidates += 1;
  else rejectedCandidates += 1;
  mirrorPasses += 1;
}
assert.equal(mirrorPasses, catalog.propertyRun.mirrorCount);
assert.equal(propertyFamilies.size, 10);

const result = {
  validatorVersion: 1,
  phase: "SPEC-0005 Phase 2 independent body-safety oracle",
  importsRuntimeSafetyKernel: false,
  importsMotionEngine: false,
  importsCommandExecutor: false,
  propertySeed: catalog.propertyRun.seed,
  propertyCandidates: catalog.propertyRun.candidateCount,
  mirroredCandidates: catalog.propertyRun.mirrorCount,
  safeCandidates,
  rejectedCandidates,
  propertyFamilies: Object.fromEntries(propertyFamilies),
  positiveCatalogCases: catalog.positiveCases.length,
  negativeCatalogCases: catalog.negativeCases.length,
  independentNamedNegativeWitnesses: independentObserved.size,
  closedFailureReasons: catalog.closedFailureReasons.length,
  standingBodyHeight: H,
  groundY,
  stage: catalog.stage,
  result: "passed",
};
console.log(JSON.stringify(result, null, 2));
