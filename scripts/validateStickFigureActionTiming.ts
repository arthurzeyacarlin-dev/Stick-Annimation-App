import assert from "node:assert/strict";
import {readFileSync, writeFileSync} from "node:fs";
import {resolve} from "node:path";
import {
  StickFigureCommandTransactionV1,
  createStickCommandWorkspaceRoot,
  materializeStickAnimationPlan,
} from "../src/lib/ai/stickFigureCommandExecutor.ts";
import {
  STICK_ACTION_TIMING_CONTRACT_VERSION,
  STICK_ACTION_TIMING_PROFILES,
  STICK_PHASE2_HEAD_EDGE_MARGIN_PX,
  STICK_PHASE2_INPUT_LENGTH_MAX_RATIO,
  STICK_PHASE2_INPUT_LENGTH_MIN_RATIO,
  STICK_PHASE2_MAX_HIP_TRAVEL_PX,
  STICK_PHASE2_MAX_SEGMENT_TURN_DEGREES,
  STICK_PHASE2_MOTION_MATERIALIZER,
  STICK_PHASE2_OUTPUT_LENGTH_TOLERANCE_PX,
  STICK_PHASE2_REBUILD_ORDER,
  STICK_PHASE25_TIMED_MOTION_MATERIALIZER,
  assertIndependentBakedStickMotion,
  canonicalStickAnimationPlanSha256,
  evaluateStickActionTimingProfile,
  materializeStickAnimationMotionPlan,
  materializeStickAnimationTimedMotionPlan,
  parseStickActionTimingSidecar,
  type StickActionTimingProfileV1,
  type StickActionTimingSidecarV1,
} from "../src/lib/ai/stickFigureMotionEngine.ts";
import {
  parseStickAnimationPlan,
  type StickAnimationCreateKeyPoseCommandV1,
  type StickAnimationPlanV1,
} from "../src/lib/ai/stickFigureAiContract.ts";
import {
  STICK_JOINT_ROLES,
  STICK_SEGMENT_ROLE_PAIRS,
  canonicalJson,
  cloneCanonical,
  deriveStickLineHead,
  digestCanonical,
  parseStickProjectDocument,
  type StickJointRoleV1,
  type StickProjectDocumentV1,
  type StickTimelineCellV1,
} from "../src/lib/stickfigure/stickProjectContract.ts";
import {
  editableStickTimelineFromCanonicalAnimation,
  redoCanonicalStickHistory,
  undoCanonicalStickHistory,
} from "../src/lib/stickfigure/stickProjectHistory.ts";
import {
  cloneEditableStickTimelineState,
  createFreshEditableStickTimelineState,
  replaceEditableStickResolvedContent,
  resolveEditableStickContent,
} from "../src/lib/stickfigure/stickTimeline.ts";
import {cloneStickFigureFrameContent} from "../src/components/workspace/stickfigure/types.ts";

const ROOT = process.cwd();
const FIXTURE_PATH = resolve(ROOT, "scripts/fixtures/spec0004-stick/v3/phase25-timing-cases.json");
const readJson = <T,>(path: string): T => JSON.parse(readFileSync(resolve(ROOT, path), "utf8")) as T;
const starter = readJson<StickProjectDocumentV1>("scripts/fixtures/stick-ai/v1/fresh-stick-project.json");
const sourcePlanPaths = {
  "timed-wave": "scripts/fixtures/stick-ai/v3/wave.json",
  "existing-jump": "scripts/fixtures/stick-ai/v3/jump.json",
  "timed-bow": "scripts/fixtures/stick-ai/v3/bow.json",
  "timed-dodge": "scripts/fixtures/stick-ai/v3/dodge.json",
} as const;
type SourceCaseName = keyof typeof sourcePlanPaths;

const PROFILE_FUNCTIONS = {
  ease_in: "u^2",
  ease_out: "1-(1-u)^2",
  ease_in_out: "3u^2-2u^3",
  constant: "u",
  impact: "u^3",
  recovery: "1-(1-u)^3",
} as const;
const TIMED_CASE_ORDER = ["timed-wave", "existing-jump", "timed-bow", "timed-dodge", "detailed-jump"] as const;
const INVALID_TIMING_CASES = [
  "not-an-object",
  "missing-root-field",
  "extra-root-field",
  "symbol-root-field",
  "accessor-root-field",
  "wrong-contract-version",
  "wrong-project-id",
  "wrong-transaction-id",
  "malformed-plan-sha",
  "wrong-plan-sha",
  "wrong-motion-intent",
  "transitions-not-array",
  "missing-transition",
  "extra-transition",
  "duplicate-transition",
  "reordered-transition",
  "wrong-from-pose-name",
  "wrong-to-pose-name",
  "wrong-from-frame-index",
  "wrong-to-frame-index",
  "non-finite-frame-index",
  "missing-transition-field",
  "extra-transition-field",
  "unknown-profile",
  "missing-profile",
  "natural-constant",
  "unpaired-impact",
  "unpaired-recovery",
  "arbitrary-curve-data",
  "tampered-plan-binding",
] as const;
const INHERITED_PHASE2_CASES = [
  "missing-joint",
  "duplicate-joint",
  "zero-segment",
  "below-min-length",
  "above-max-length",
  "ambiguous-turn",
  "turn-over-170",
  "pose-index-out-of-order",
  "pose-index-too-close",
  "identical-important-pose",
  "hip-over-480",
  "normalized-out-of-bounds",
  "interpolation-out-of-bounds",
  "hidden-motion-payload",
  "shared-cell-object",
  "shared-pose-object",
  "shared-points-array",
  "shared-point-object",
  "transaction-option-invalid",
  "fixture-tamper",
] as const;

type ScalarProbe = {
  kind: "hip_x" | "hip_y" | "segment_angle";
  segment: string | null;
  start: number;
  delta: number;
};
type TimingTransitionEvidence = StickActionTimingSidecarV1["transitions"][number] & {
  progress: number[];
  progressGaps: number[];
  probe: ScalarProbe;
  probeValues: number[];
  probeGaps: number[];
};
type GoldenTimingCase = {
  name: string;
  sourcePlan: string | null;
  plan: StickAnimationPlanV1 | null;
  sidecar: StickActionTimingSidecarV1;
  timedCandidateDigest: string;
  importantFrameIndexes: number[];
  transitions: TimingTransitionEvidence[];
  frames: Array<Array<[number, number]>>;
  readableBeats: string[];
};
type TimingFixture = {
  fixtureVersion: 3;
  contractVersion: typeof STICK_ACTION_TIMING_CONTRACT_VERSION;
  profileOrder: StickActionTimingProfileV1[];
  progressFunctions: typeof PROFILE_FUNCTIONS;
  naturalDefaultPolicy: "ease_in_out";
  jointRoleOrder: string[];
  validCases: GoldenTimingCase[];
  mechanicalConstantCase: GoldenTimingCase;
  naturalConstantRejection: StickActionTimingSidecarV1;
  invalidTimingCases: string[];
  inheritedPhase2Cases: string[];
};

let assertionCount = 0;
const check = (condition: unknown, message: string) => {
  assertionCount += 1;
  assert.ok(condition, message);
};
const equal = (actual: unknown, expected: unknown, message: string) => {
  assertionCount += 1;
  assert.deepEqual(actual, expected, message);
};
const notEqual = (actual: unknown, expected: unknown, message: string) => {
  assertionCount += 1;
  assert.notDeepEqual(actual, expected, message);
};

const keyPoseCommands = (plan: StickAnimationPlanV1) => plan.commands.filter(
  (command): command is StickAnimationCreateKeyPoseCommandV1 => command.type === "create_key_pose",
);
const clonePlan = (plan: StickAnimationPlanV1) => cloneCanonical(plan);
const parsedPlan = async (plan: StickAnimationPlanV1) => {
  const result = await parseStickAnimationPlan(plan, starter);
  assert.ok(result.ok, result.ok ? "" : `${result.error.path}: ${result.error.message}`);
  return result.value;
};
const angleDelta = (from: number, to: number) => {
  const tau = Math.PI * 2;
  let result = ((to - from + Math.PI) % tau + tau) % tau - Math.PI;
  if (result === -Math.PI) result = Math.PI;
  return result;
};
const commandPoints = (command: StickAnimationCreateKeyPoseCommandV1) => Object.fromEntries(
  command.joints.map((joint) => [joint.role, {x: joint.x, y: joint.y}]),
) as Record<StickJointRoleV1, {x: number; y: number}>;
const pointsByRole = (document: StickProjectDocumentV1, frameIndex: number) => {
  const cell = document.layers[0].cells[frameIndex];
  assert.equal(cell.cellType, "keyframe");
  return Object.fromEntries(document.rigs[0].joints.map((joint, index) => [
    joint.role,
    {x: cell.poses[0].points[index].x, y: cell.poses[0].points[index].y},
  ])) as Record<StickJointRoleV1, {x: number; y: number}>;
};
const canonicalLengths = (() => {
  const points = pointsByRole(starter, 0);
  return new Map(STICK_PHASE2_REBUILD_ORDER.map((segment) => [
    `${segment.parent}:${segment.child}`,
    Math.hypot(points[segment.child].x - points[segment.parent].x, points[segment.child].y - points[segment.parent].y),
  ]));
})();

const detailedJumpPlan = async () => {
  const wave = await parsedPlan(readJson<StickAnimationPlanV1>(sourcePlanPaths["timed-wave"]));
  const jump = await parsedPlan(readJson<StickAnimationPlanV1>(sourcePlanPaths["existing-jump"]));
  const wavePoses = keyPoseCommands(wave);
  const jumpPoses = keyPoseCommands(jump);
  const template = wavePoses[0];
  const createPose = (
    poseName: string,
    frameIndex: number,
    joints: StickAnimationCreateKeyPoseCommandV1["joints"],
  ): StickAnimationCreateKeyPoseCommandV1 => ({
    ...cloneCanonical(template),
    poseName,
    frameIndex,
    joints: cloneCanonical(joints),
  });
  const hold = (poseName: string, startFrameIndex: number, endFrameIndex: number) => ({
    type: "hold_pose" as const,
    commandVersion: 1 as const,
    poseName,
    startFrameIndex,
    endFrameIndex,
  });
  const launchJoints = cloneCanonical(jumpPoses[1].joints);
  for (const joint of launchJoints) joint.y += 90;
  const plan: StickAnimationPlanV1 = {
    ...cloneCanonical(wave),
    requestId: "00000000-0000-4000-8000-000000000741",
    transactionId: "00000000-0000-4000-8000-000000000742",
    commands: [
      {type: "set_timing", commandVersion: 1, fps: 12, totalFrameCount: 24},
      createPose("stand", 0, wavePoses[0].joints),
      hold("stand", 1, 2),
      createPose("crouch", 3, jumpPoses[0].joints),
      hold("crouch", 4, 5),
      createPose("launch", 6, launchJoints),
      hold("launch", 7, 9),
      createPose("peak", 10, jumpPoses[1].joints),
      hold("peak", 11, 14),
      createPose("landing", 15, jumpPoses[2].joints),
      hold("landing", 16, 16),
      createPose("knee_bend", 17, jumpPoses[0].joints),
      hold("knee_bend", 18, 22),
      createPose("recovered_stand", 23, wavePoses[0].joints),
      {type: "finish", commandVersion: 1},
    ],
  };
  return parsedPlan(plan);
};

const makeSidecar = async (
  plan: StickAnimationPlanV1,
  motionIntent: StickActionTimingSidecarV1["motionIntent"],
  profiles: StickActionTimingProfileV1[],
): Promise<StickActionTimingSidecarV1> => {
  const poses = keyPoseCommands(plan);
  assert.equal(profiles.length, poses.length - 1);
  return {
    contractVersion: STICK_ACTION_TIMING_CONTRACT_VERSION,
    projectId: plan.projectId,
    transactionId: plan.transactionId,
    planSha256: await canonicalStickAnimationPlanSha256(plan),
    motionIntent,
    transitions: profiles.map((profile, index) => ({
      fromPoseName: poses[index].poseName,
      fromFrameIndex: poses[index].frameIndex,
      toPoseName: poses[index + 1].poseName,
      toFrameIndex: poses[index + 1].frameIndex,
      profile,
    })),
  };
};

const scalarProbe = (
  from: StickAnimationCreateKeyPoseCommandV1,
  to: StickAnimationCreateKeyPoseCommandV1,
): ScalarProbe => {
  const first = commandPoints(from);
  const last = commandPoints(to);
  if (last.hip.x !== first.hip.x) return {kind: "hip_x", segment: null, start: first.hip.x, delta: last.hip.x - first.hip.x};
  if (last.hip.y !== first.hip.y) return {kind: "hip_y", segment: null, start: first.hip.y, delta: last.hip.y - first.hip.y};
  for (const segment of STICK_PHASE2_REBUILD_ORDER) {
    const fromAngle = Math.atan2(
      first[segment.child].y - first[segment.parent].y,
      first[segment.child].x - first[segment.parent].x,
    );
    const toAngle = Math.atan2(
      last[segment.child].y - last[segment.parent].y,
      last[segment.child].x - last[segment.parent].x,
    );
    const delta = angleDelta(fromAngle, toAngle);
    if (delta !== 0) return {kind: "segment_angle", segment: `${segment.parent}:${segment.child}`, start: fromAngle, delta};
  }
  throw new Error("A moving transition has no deterministic scalar probe.");
};

const timingEvidence = (
  plan: StickAnimationPlanV1,
  sidecar: StickActionTimingSidecarV1,
): TimingTransitionEvidence[] => {
  const poses = keyPoseCommands(plan);
  return sidecar.transitions.map((transition, index) => {
    const span = transition.toFrameIndex - transition.fromFrameIndex;
    const progress = Array.from({length: span + 1}, (_, offset) =>
      evaluateStickActionTimingProfile(transition.profile, offset / span));
    const progressGaps = progress.slice(1).map((value, gapIndex) => value - progress[gapIndex]);
    const probe = scalarProbe(poses[index], poses[index + 1]);
    const probeValues = progress.map((value) => probe.start + probe.delta * value);
    const probeGaps = probeValues.slice(1).map((value, gapIndex) => Math.abs(value - probeValues[gapIndex]));
    return {...transition, progress, progressGaps, probe, probeValues, probeGaps};
  });
};

const goldenCase = async (
  name: string,
  plan: StickAnimationPlanV1,
  sidecar: StickActionTimingSidecarV1,
  sourcePlan: string | null,
  readableBeats: string[],
): Promise<GoldenTimingCase> => {
  const candidate = await materializeStickAnimationTimedMotionPlan(plan, sidecar, starter);
  assert.ok(candidate.ok, candidate.ok ? "" : `${candidate.error.path}: ${candidate.error.message}`);
  return {
    name,
    sourcePlan,
    plan: sourcePlan === null ? plan : null,
    sidecar,
    timedCandidateDigest: await digestCanonical(candidate.value),
    importantFrameIndexes: keyPoseCommands(plan).map((command) => command.frameIndex),
    transitions: timingEvidence(plan, sidecar),
    frames: candidate.value.layers[0].cells.map((cell) => {
      assert.equal(cell.cellType, "keyframe");
      return cell.poses[0].points.map((point) => [point.x, point.y]);
    }),
    readableBeats,
  };
};

const buildFixture = async (): Promise<TimingFixture> => {
  const plans = Object.fromEntries(await Promise.all(Object.entries(sourcePlanPaths).map(async ([name, path]) => [
    name,
    await parsedPlan(readJson<StickAnimationPlanV1>(path)),
  ]))) as Record<SourceCaseName, StickAnimationPlanV1>;
  const detailed = await detailedJumpPlan();
  const sidecars = {
    "timed-wave": await makeSidecar(plans["timed-wave"], "natural", ["ease_in_out", "ease_in_out"]),
    "existing-jump": await makeSidecar(plans["existing-jump"], "natural", ["ease_out", "ease_in"]),
    "timed-bow": await makeSidecar(plans["timed-bow"], "natural", ["ease_out", "ease_in_out"]),
    "timed-dodge": await makeSidecar(plans["timed-dodge"], "natural", ["impact", "recovery"]),
    "detailed-jump": await makeSidecar(detailed, "natural", ["ease_in", "ease_out", "ease_out", "ease_in", "impact", "recovery"]),
  } as const;
  const validCases = [
    await goldenCase("timed-wave", plans["timed-wave"], sidecars["timed-wave"], sourcePlanPaths["timed-wave"], ["slows-near-first-arm-extreme", "slows-near-second-arm-extreme"]),
    await goldenCase("existing-jump", plans["existing-jump"], sidecars["existing-jump"], sourcePlanPaths["existing-jump"], ["launches-fast", "slows-near-peak", "accelerates-down", "independent-landing-frames"]),
    await goldenCase("timed-bow", plans["timed-bow"], sidecars["timed-bow"], sourcePlanPaths["timed-bow"], ["ease-out-into-bow", "ease-in-out-return", "deliberately-unequal-halves"]),
    await goldenCase("timed-dodge", plans["timed-dodge"], sidecars["timed-dodge"], sourcePlanPaths["timed-dodge"], ["sharp-impact", "settling-recovery"]),
    await goldenCase("detailed-jump", detailed, sidecars["detailed-jump"], null, [
      "stand-0", "crouch-3", "launch-6", "peak-10", "landing-15", "knee-bend-17", "recovered-stand-23",
    ]),
  ];
  const mechanicalSidecar = await makeSidecar(plans["timed-wave"], "mechanical_explicit", ["constant", "constant"]);
  return {
    fixtureVersion: 3,
    contractVersion: STICK_ACTION_TIMING_CONTRACT_VERSION,
    profileOrder: [...STICK_ACTION_TIMING_PROFILES],
    progressFunctions: PROFILE_FUNCTIONS,
    naturalDefaultPolicy: "ease_in_out",
    jointRoleOrder: [...STICK_JOINT_ROLES],
    validCases,
    mechanicalConstantCase: await goldenCase(
      "mechanical-constant",
      plans["timed-wave"],
      mechanicalSidecar,
      sourcePlanPaths["timed-wave"],
      ["explicit-mechanical-intent", "equal-progress-gaps"],
    ),
    naturalConstantRejection: {...cloneCanonical(mechanicalSidecar), motionIntent: "natural"},
    invalidTimingCases: [...INVALID_TIMING_CASES],
    inheritedPhase2Cases: [...INHERITED_PHASE2_CASES],
  };
};

if (process.argv.includes("--write-fixture")) {
  const fixture = await buildFixture();
  writeFileSync(FIXTURE_PATH, `${JSON.stringify(fixture, null, 2)}\n`);
  console.log(`Wrote ${FIXTURE_PATH}`);
  process.exit(0);
}

const cases = readJson<TimingFixture>("scripts/fixtures/spec0004-stick/v3/phase25-timing-cases.json");
const regenerated = await buildFixture();
equal(cases, regenerated, "frozen timing fixture exactly matches independent regeneration");
equal(cases.fixtureVersion, 3, "Phase 2.5 fixture version is exact");
equal(cases.contractVersion, STICK_ACTION_TIMING_CONTRACT_VERSION, "contract version is exact");
equal(cases.profileOrder, STICK_ACTION_TIMING_PROFILES, "profile ordering is exact");
equal(cases.progressFunctions, PROFILE_FUNCTIONS, "all six formula labels are exact");
equal(cases.naturalDefaultPolicy, "ease_in_out", "safe natural default policy is explicit");
equal(cases.jointRoleOrder, STICK_JOINT_ROLES, "exact 11-role order is preserved");
equal(STICK_PHASE2_REBUILD_ORDER.length, 10, "exact 10-segment rebuild order is preserved");
equal(STICK_SEGMENT_ROLE_PAIRS.length, 10, "canonical rig retains 10 segments");
equal(cases.validCases.map((entry) => entry.name), TIMED_CASE_ORDER, "exact timed fixture order");
equal(cases.validCases.find((entry) => entry.name === "detailed-jump")?.importantFrameIndexes, [0, 3, 6, 10, 15, 17, 23], "detailed jump uses exact seven important frames");
equal(cases.validCases.find((entry) => entry.name === "detailed-jump")?.sidecar.transitions.map((entry) => entry.profile), [
  "ease_in", "ease_out", "ease_out", "ease_in", "impact", "recovery",
], "detailed jump profile order is exact");
equal(cases.validCases.find((entry) => entry.name === "timed-bow")?.sidecar.transitions.map((entry) => entry.profile), ["ease_out", "ease_in_out"], "bow halves are deliberately unequal");

const tolerance = 1e-12;
for (const [profile, expectedAtQuarter] of [
  ["ease_in", 0.0625],
  ["ease_out", 0.4375],
  ["ease_in_out", 0.15625],
  ["constant", 0.25],
  ["impact", 0.015625],
  ["recovery", 0.578125],
] as const) {
  equal(evaluateStickActionTimingProfile(profile, 0), 0, `${profile} starts at zero`);
  equal(evaluateStickActionTimingProfile(profile, 1), 1, `${profile} ends at one`);
  equal(evaluateStickActionTimingProfile(profile, 0.25), expectedAtQuarter, `${profile} exact quarter formula`);
}
assertionCount += 2;
assert.throws(() => evaluateStickActionTimingProfile("constant", Number.NaN), RangeError);
assert.throws(() => evaluateStickActionTimingProfile("constant", 1.01), RangeError);

const planForCase = async (golden: GoldenTimingCase) => golden.plan
  ? parsedPlan(golden.plan)
  : parsedPlan(readJson<StickAnimationPlanV1>(golden.sourcePlan!));
const candidates = new Map<string, StickProjectDocumentV1>();
for (const golden of [...cases.validCases, cases.mechanicalConstantCase]) {
  const plan = await planForCase(golden);
  equal(golden.sidecar.planSha256, await canonicalStickAnimationPlanSha256(plan), `${golden.name} binds the canonical parsed plan SHA`);
  const parsedTiming = await parseStickActionTimingSidecar(golden.sidecar, plan);
  check(parsedTiming.ok, `${golden.name} strict timing sidecar validates`);
  const first = await materializeStickAnimationTimedMotionPlan(plan, golden.sidecar, starter);
  const second = await materializeStickAnimationTimedMotionPlan(plan, golden.sidecar, starter);
  check(first.ok && second.ok, `${golden.name} timed materializer succeeds twice`);
  if (!first.ok || !second.ok) continue;
  candidates.set(golden.name, first.value);
  equal(await digestCanonical(first.value), golden.timedCandidateDigest, `${golden.name} exact timed candidate digest`);
  equal(await digestCanonical(second.value), golden.timedCandidateDigest, `${golden.name} deterministic rerun digest`);
  check(assertIndependentBakedStickMotion(first.value), `${golden.name} uses independent ordinary keyframes`);
  equal(first.value.fps, 12, `${golden.name} retains exact 12 FPS fixture timing`);
  equal(first.value.layers[0].cells.length, golden.frames.length, `${golden.name} exact frame count`);
  equal(first.value.layers[0].cells.map((cell) => cell.cellType), Array(golden.frames.length).fill("keyframe"), `${golden.name} has zero holds/tweens`);
  const actualFrames = first.value.layers[0].cells.map((cell) => {
    assert.equal(cell.cellType, "keyframe");
    return cell.poses[0].points.map((point) => [point.x, point.y]);
  });
  equal(actualFrames, golden.frames, `${golden.name} exact golden baked coordinates`);
  const serialized = canonicalJson(first.value);
  check(!/(action-timing|timingSidecar|motionController|generatedOwner|aiOnly|regeneration|snapBack|lock|tween|ownerFrameId)/i.test(serialized), `${golden.name} discards timing/controller ownership data`);
  for (let frameIndex = 0; frameIndex < first.value.layers[0].cells.length; frameIndex += 1) {
    const points = pointsByRole(first.value, frameIndex);
    const lineHead = deriveStickLineHead(points.head);
    check(lineHead.from.x >= 0 && lineHead.to.x < first.value.coordinateSpace.width, `${golden.name} frame ${frameIndex} line head is in bounds`);
    check(points.head.x >= STICK_PHASE2_HEAD_EDGE_MARGIN_PX && points.head.x <= first.value.coordinateSpace.width - 1 - STICK_PHASE2_HEAD_EDGE_MARGIN_PX, `${golden.name} frame ${frameIndex} head margin`);
    for (const segment of STICK_PHASE2_REBUILD_ORDER) {
      const length = Math.hypot(
        points[segment.child].x - points[segment.parent].x,
        points[segment.child].y - points[segment.parent].y,
      );
      check(Math.abs(length - canonicalLengths.get(`${segment.parent}:${segment.child}`)!) <= STICK_PHASE2_OUTPUT_LENGTH_TOLERANCE_PX, `${golden.name} frame ${frameIndex} ${segment.child} canonical length`);
    }
  }
  for (const transition of golden.transitions) {
    equal(transition.progress[0], 0, `${golden.name} ${transition.profile} endpoint zero`);
    equal(transition.progress.at(-1), 1, `${golden.name} ${transition.profile} endpoint one`);
    for (let index = 1; index < transition.progress.length; index += 1) {
      check(transition.progress[index] >= transition.progress[index - 1], `${golden.name} ${transition.profile} monotonic progress`);
      check(transition.progress[index] >= 0 && transition.progress[index] <= 1, `${golden.name} ${transition.profile} no overshoot`);
    }
    const gaps = transition.progressGaps;
    if (transition.profile === "ease_in" || transition.profile === "impact") {
      check(gaps.every((gap, index) => index === 0 || gap > gaps[index - 1] - tolerance), `${golden.name} ${transition.profile} gaps increase`);
      check(gaps.at(-1)! > gaps[0] + tolerance, `${golden.name} ${transition.profile} finishes faster`);
    } else if (transition.profile === "ease_out" || transition.profile === "recovery") {
      check(gaps.every((gap, index) => index === 0 || gap < gaps[index - 1] + tolerance), `${golden.name} ${transition.profile} gaps decrease`);
      check(gaps[0] > gaps.at(-1)! + tolerance, `${golden.name} ${transition.profile} settles slower`);
    } else if (transition.profile === "constant") {
      check(gaps.every((gap) => Math.abs(gap - gaps[0]) <= tolerance), `${golden.name} constant gaps are equal`);
    } else {
      const maximum = Math.max(...gaps);
      check(gaps[0] < maximum && gaps.at(-1)! < maximum, `${golden.name} ease-in-out grows then shrinks`);
      equal(gaps, [...gaps].reverse(), `${golden.name} ease-in-out gaps are symmetric`);
    }
    equal(transition.probeGaps.length, transition.progressGaps.length, `${golden.name} probe covers every baked gap`);
    for (let index = 0; index < transition.probeGaps.length; index += 1) {
      check(Math.abs(transition.probeGaps[index] - Math.abs(transition.probe.delta) * transition.progressGaps[index]) <= tolerance, `${golden.name} probe gap follows exact unrounded timing progress`);
    }
  }

  const editable = editableStickTimelineFromCanonicalAnimation(first.value, createFreshEditableStickTimelineState());
  equal(new Set(editable.layers[0].frames.map((frame) => frame.id)).size, golden.frames.length, `${golden.name} unique editable frame IDs`);
  equal(new Set(editable.layers[0].frames.map((frame) => frame.stateId)).size, golden.frames.length, `${golden.name} unique editable state IDs`);
  equal(new Set(editable.layers[0].frames.map((frame) => frame.content)).size, golden.frames.length, `${golden.name} unique editable content objects`);
  const editIndex = Math.min(2, golden.frames.length - 1);
  const edited = cloneEditableStickTimelineState(editable);
  const resolved = resolveEditableStickContent(edited, edited.activeLayerId, editIndex);
  check(Boolean(resolved), `${golden.name} selected frame resolves for manual editing`);
  if (resolved) {
    const before = await Promise.all(edited.layers[0].frames.map(async (_, index) => digestCanonical(
      resolveEditableStickContent(edited, edited.activeLayerId, index)?.content ?? null,
    )));
    const changed = cloneStickFigureFrameContent(resolved.content);
    changed.structureGraph.joints[0].x += 17;
    const replaced = replaceEditableStickResolvedContent(edited, edited.activeLayerId, editIndex, changed);
    check(Boolean(replaced), `${golden.name} one-frame manual edit succeeds`);
    if (replaced) {
      const after = await Promise.all(replaced.layers[0].frames.map(async (_, index) => digestCanonical(
        resolveEditableStickContent(replaced, replaced.activeLayerId, index)?.content ?? null,
      )));
      notEqual(after[editIndex], before[editIndex], `${golden.name} selected frame digest changes`);
      equal(after.filter((digest, index) => index !== editIndex && digest !== before[index]), [], `${golden.name} every unrelated frame digest stays exact`);
    }
  }

  const root = await createStickCommandWorkspaceRoot(starter, `phase25-${golden.name}`);
  const rootDigest = await digestCanonical(root);
  const machine = new StickFigureCommandTransactionV1(root, {
    animationPlanMaterializer: STICK_PHASE25_TIMED_MOTION_MATERIALIZER,
    actionTimingSidecar: golden.sidecar,
  });
  const preview = await machine.preview(plan);
  equal(preview.outcomeCode, "preview_ready", `${golden.name} timed Preview succeeds`);
  equal(await digestCanonical(root), rootDigest, `${golden.name} Preview leaves caller root unchanged`);
  equal(await digestCanonical(machine.readPreviewCandidate()), golden.timedCandidateDigest, `${golden.name} transaction Preview exact candidate`);
  equal(await digestCanonical(machine.fork().readPreviewCandidate()), golden.timedCandidateDigest, `${golden.name} fork preserves timing and candidate`);
  const cancelMachine = new StickFigureCommandTransactionV1(root, {
    animationPlanMaterializer: STICK_PHASE25_TIMED_MOTION_MATERIALIZER,
    actionTimingSidecar: golden.sidecar,
  });
  await cancelMachine.preview(plan);
  const cancelled = await cancelMachine.cancelPreview(plan);
  equal(cancelled.outcomeCode, "cancelled", `${golden.name} Cancel terminal`);
  equal(cancelled.root.editorRoot.current.documentDigest, root.editorRoot.current.documentDigest, `${golden.name} Cancel document no-op`);
  equal(cancelled.root.editorRoot.undo.length, 0, `${golden.name} Cancel history no-op`);
  const applied = await machine.apply(plan);
  equal(applied.outcomeCode, "applied", `${golden.name} one atomic Apply succeeds`);
  equal(applied.root.editorRoot.undo.length, 1, `${golden.name} Apply creates exactly one Undo entry`);
  equal(applied.root.editorRoot.current.documentDigest, golden.timedCandidateDigest, `${golden.name} Apply publishes exact bytes`);
  const undone = await undoCanonicalStickHistory(applied.root.editorRoot);
  check(Boolean(undone), `${golden.name} Undo available`);
  if (undone) {
    equal(undone.current.documentDigest, root.editorRoot.current.documentDigest, `${golden.name} Undo restores exact pre-Apply bytes`);
    const redone = await redoCanonicalStickHistory(undone);
    check(Boolean(redone), `${golden.name} Redo available`);
    if (redone) equal(redone.current.documentDigest, golden.timedCandidateDigest, `${golden.name} Redo restores exact accepted bytes`);
  }
}

const wavePlan = await parsedPlan(readJson<StickAnimationPlanV1>(sourcePlanPaths["timed-wave"]));
const waveSidecar = cases.validCases[0].sidecar;
const expectTimingRejection = async (id: string, sidecar: unknown, plan: StickAnimationPlanV1 = wavePlan) => {
  const parsed = await parseStickActionTimingSidecar(sidecar, plan);
  check(!parsed.ok, `${id} strict timing parser rejects`);
  const materialized = await materializeStickAnimationTimedMotionPlan(plan, sidecar, starter);
  check(!materialized.ok, `${id} timed materializer fails closed`);
};
const mutateSidecar = (mutate: (sidecar: Record<string, unknown>) => void) => {
  const value = cloneCanonical(waveSidecar) as unknown as Record<string, unknown>;
  mutate(value);
  return value;
};

await expectTimingRejection("not-an-object", null);
await expectTimingRejection("missing-root-field", mutateSidecar((value) => { delete value.motionIntent; }));
await expectTimingRejection("extra-root-field", mutateSidecar((value) => { value.curve = "custom"; }));
{
  const value = cloneCanonical(waveSidecar) as object;
  Object.defineProperty(value, Symbol("hidden"), {value: true, enumerable: true});
  await expectTimingRejection("symbol-root-field", value);
}
{
  const value = cloneCanonical(waveSidecar) as unknown as Record<string, unknown>;
  Object.defineProperty(value, "motionIntent", {get: () => "natural", enumerable: true});
  await expectTimingRejection("accessor-root-field", value);
}
await expectTimingRejection("wrong-contract-version", mutateSidecar((value) => { value.contractVersion = "stick.action-timing/v2"; }));
await expectTimingRejection("wrong-project-id", mutateSidecar((value) => { value.projectId = "00000000-0000-4000-8000-000000000099"; }));
await expectTimingRejection("wrong-transaction-id", mutateSidecar((value) => { value.transactionId = "00000000-0000-4000-8000-000000000099"; }));
await expectTimingRejection("malformed-plan-sha", mutateSidecar((value) => { value.planSha256 = "A".repeat(64); }));
await expectTimingRejection("wrong-plan-sha", mutateSidecar((value) => { value.planSha256 = "0".repeat(64); }));
await expectTimingRejection("wrong-motion-intent", mutateSidecar((value) => { value.motionIntent = "robotic"; }));
await expectTimingRejection("transitions-not-array", mutateSidecar((value) => { value.transitions = {}; }));
await expectTimingRejection("missing-transition", mutateSidecar((value) => { (value.transitions as unknown[]).pop(); }));
await expectTimingRejection("extra-transition", mutateSidecar((value) => { (value.transitions as unknown[]).push(cloneCanonical((value.transitions as unknown[])[0])); }));
await expectTimingRejection("duplicate-transition", mutateSidecar((value) => { (value.transitions as unknown[])[1] = cloneCanonical((value.transitions as unknown[])[0]); }));
await expectTimingRejection("reordered-transition", mutateSidecar((value) => { (value.transitions as unknown[]).reverse(); }));
await expectTimingRejection("wrong-from-pose-name", mutateSidecar((value) => { ((value.transitions as Record<string, unknown>[])[0]).fromPoseName = "wrong"; }));
await expectTimingRejection("wrong-to-pose-name", mutateSidecar((value) => { ((value.transitions as Record<string, unknown>[])[0]).toPoseName = "wrong"; }));
await expectTimingRejection("wrong-from-frame-index", mutateSidecar((value) => { ((value.transitions as Record<string, unknown>[])[0]).fromFrameIndex = 1; }));
await expectTimingRejection("wrong-to-frame-index", mutateSidecar((value) => { ((value.transitions as Record<string, unknown>[])[0]).toFrameIndex = 7; }));
await expectTimingRejection("non-finite-frame-index", mutateSidecar((value) => { ((value.transitions as Record<string, unknown>[])[0]).toFrameIndex = Number.NaN; }));
await expectTimingRejection("missing-transition-field", mutateSidecar((value) => { delete ((value.transitions as Record<string, unknown>[])[0]).toPoseName; }));
await expectTimingRejection("extra-transition-field", mutateSidecar((value) => { ((value.transitions as Record<string, unknown>[])[0]).curve = [0, 1]; }));
await expectTimingRejection("unknown-profile", mutateSidecar((value) => { ((value.transitions as Record<string, unknown>[])[0]).profile = "bounce"; }));
await expectTimingRejection("missing-profile", mutateSidecar((value) => { delete ((value.transitions as Record<string, unknown>[])[0]).profile; }));
await expectTimingRejection("natural-constant", cases.naturalConstantRejection);
await expectTimingRejection("unpaired-impact", mutateSidecar((value) => { ((value.transitions as Record<string, unknown>[])[0]).profile = "impact"; }));
await expectTimingRejection("unpaired-recovery", mutateSidecar((value) => { ((value.transitions as Record<string, unknown>[])[1]).profile = "recovery"; }));
await expectTimingRejection("arbitrary-curve-data", mutateSidecar((value) => { ((value.transitions as Record<string, unknown>[])[0]).controlPoints = [0, 0.5, 1]; }));
{
  const tampered = clonePlan(wavePlan);
  keyPoseCommands(tampered)[1].joints[6].x += 1;
  await expectTimingRejection("tampered-plan-binding", waveSidecar, await parsedPlan(tampered));
}
equal(cases.invalidTimingCases, INVALID_TIMING_CASES, "complete timing rejection catalog is exact");

const matchingNaturalSidecar = async (plan: StickAnimationPlanV1, profiles = ["ease_in_out", "ease_in_out"] as StickActionTimingProfileV1[]) =>
  makeSidecar(await parsedPlan(plan), "natural", profiles);
const expectInheritedPlanRejection = async (id: string, plan: StickAnimationPlanV1) => {
  const parsed = await parseStickAnimationPlan(plan, starter);
  const sidecar = parsed.ok
    ? await makeSidecar(
      parsed.value,
      "natural",
      Array.from({length: keyPoseCommands(parsed.value).length - 1}, () => "ease_in_out"),
    )
    : waveSidecar;
  const result = await materializeStickAnimationTimedMotionPlan(plan, sidecar, starter);
  check(!result.ok, `${id} inherited Phase 2 validation fails closed through the timed path`);
};
{
  const plan = clonePlan(wavePlan); keyPoseCommands(plan)[1].joints.pop(); await expectInheritedPlanRejection("missing-joint", plan);
}
{
  const plan = clonePlan(wavePlan); keyPoseCommands(plan)[1].joints[0].role = "neck"; await expectInheritedPlanRejection("duplicate-joint", plan);
}
{
  const plan = clonePlan(wavePlan); const pose = keyPoseCommands(plan)[1]; pose.joints[0].x = pose.joints[1].x; pose.joints[0].y = pose.joints[1].y; await expectInheritedPlanRejection("zero-segment", plan);
}
{
  const plan = clonePlan(wavePlan); const pose = keyPoseCommands(plan)[1]; pose.joints[0].x = pose.joints[1].x; pose.joints[0].y = pose.joints[1].y - 1; await expectInheritedPlanRejection("below-min-length", plan);
}
{
  const plan = clonePlan(wavePlan); const pose = keyPoseCommands(plan)[1]; pose.joints[0].x = pose.joints[1].x; pose.joints[0].y = 0; await expectInheritedPlanRejection("above-max-length", plan);
}
{
  const plan = clonePlan(wavePlan); const pose = keyPoseCommands(plan)[1]; pose.joints[0].x = pose.joints[1].x; pose.joints[0].y = pose.joints[1].y + 100; await expectInheritedPlanRejection("ambiguous-turn", plan);
}
{
  const plan = clonePlan(wavePlan); const pose = keyPoseCommands(plan)[1]; pose.joints[0].x = pose.joints[1].x + 9; pose.joints[0].y = pose.joints[1].y + 100; await expectInheritedPlanRejection("turn-over-170", plan);
}
{
  const plan = clonePlan(wavePlan); const first = plan.commands.findIndex((command) => command.type === "create_key_pose"); const second = plan.commands.findIndex((command, index) => index > first && command.type === "create_key_pose"); [plan.commands[first], plan.commands[second]] = [plan.commands[second], plan.commands[first]]; await expectInheritedPlanRejection("pose-index-out-of-order", plan);
}
{
  const plan = clonePlan(wavePlan); keyPoseCommands(plan)[1].frameIndex = 1; await expectInheritedPlanRejection("pose-index-too-close", plan);
}
{
  const plan = clonePlan(wavePlan); keyPoseCommands(plan)[1].joints = cloneCanonical(keyPoseCommands(plan)[0].joints); await expectInheritedPlanRejection("identical-important-pose", plan);
}
{
  const plan = clonePlan(wavePlan); for (const joint of keyPoseCommands(plan)[1].joints) joint.x += 540; await expectInheritedPlanRejection("hip-over-480", plan);
}
{
  const plan = clonePlan(wavePlan); for (const joint of keyPoseCommands(plan)[0].joints) joint.x -= 760; const pose = keyPoseCommands(plan)[0]; const hand = pose.joints[STICK_JOINT_ROLES.indexOf("leftHand")]; hand.x = 0; hand.y = 500; await expectInheritedPlanRejection("normalized-out-of-bounds", plan);
}
{
  const plan = clonePlan(wavePlan); const poses = keyPoseCommands(plan); for (const pose of poses) for (const joint of pose.joints) joint.x -= 760; const configure = (pose: StickAnimationCreateKeyPoseCommandV1, handY: number) => { const elbow = pose.joints[STICK_JOINT_ROLES.indexOf("leftElbow")]; const hand = pose.joints[STICK_JOINT_ROLES.indexOf("leftHand")]; elbow.x = 140; elbow.y = 460; hand.x = 73; hand.y = handY; }; configure(poses[0], 576); configure(poses[1], 344); await expectInheritedPlanRejection("interpolation-out-of-bounds", plan);
}
{
  const plan = clonePlan(wavePlan) as StickAnimationPlanV1 & {motionController?: unknown}; plan.motionController = {kind: "persistent"}; await expectInheritedPlanRejection("hidden-motion-payload", plan);
}
const waveCandidate = candidates.get("timed-wave");
assert.ok(waveCandidate);
{
  const candidate = cloneCanonical(waveCandidate); candidate.layers[0].cells[1] = candidate.layers[0].cells[0]; check(!assertIndependentBakedStickMotion(candidate), "shared-cell-object fails closed");
}
for (const [id, mutate] of [
  ["shared-pose-object", (first: StickTimelineCellV1 & {cellType: "keyframe"}, second: StickTimelineCellV1 & {cellType: "keyframe"}) => { second.poses[0] = first.poses[0]; }],
  ["shared-points-array", (first: StickTimelineCellV1 & {cellType: "keyframe"}, second: StickTimelineCellV1 & {cellType: "keyframe"}) => { second.poses[0].points = first.poses[0].points; }],
  ["shared-point-object", (first: StickTimelineCellV1 & {cellType: "keyframe"}, second: StickTimelineCellV1 & {cellType: "keyframe"}) => { second.poses[0].points[0] = first.poses[0].points[0]; }],
] as const) {
  const candidate: StickProjectDocumentV1 = cloneCanonical(waveCandidate);
  const first: StickTimelineCellV1 = candidate.layers[0].cells[0];
  const second: StickTimelineCellV1 = candidate.layers[0].cells[1];
  assert.equal(first.cellType, "keyframe");
  assert.equal(second.cellType, "keyframe");
  mutate(first, second);
  check(!assertIndependentBakedStickMotion(candidate), `${id} fails closed`);
}
{
  const root = await createStickCommandWorkspaceRoot(starter, "invalid-option");
  assertionCount += 3;
  assert.throws(() => new StickFigureCommandTransactionV1(root, {animationPlanMaterializer: "unknown" as typeof STICK_PHASE25_TIMED_MOTION_MATERIALIZER}), /Unknown Stick animation-plan materializer/);
  assert.throws(() => new StickFigureCommandTransactionV1(root, {animationPlanMaterializer: STICK_PHASE25_TIMED_MOTION_MATERIALIZER}), /requires an action-timing sidecar/);
  assert.throws(() => new StickFigureCommandTransactionV1(root, {animationPlanMaterializer: STICK_PHASE2_MOTION_MATERIALIZER, actionTimingSidecar: waveSidecar}), /only by the Phase 2.5 materializer/);
}
{
  const tampered = clonePlan(wavePlan); keyPoseCommands(tampered)[1].joints[6].x += 1;
  const sidecar = await matchingNaturalSidecar(tampered);
  const result = await materializeStickAnimationTimedMotionPlan(tampered, sidecar, starter);
  check(result.ok, "safe fixture tamper can still form a bounded timed candidate");
  if (result.ok) notEqual(await digestCanonical(result.value), cases.validCases[0].timedCandidateDigest, "fixture tamper cannot satisfy frozen golden digest");
}
equal(cases.inheritedPhase2Cases, INHERITED_PHASE2_CASES, "complete inherited Phase 2 rejection catalog is exact");

const phase2Cases = readJson<{validCases: Array<{name: string; motionCandidateDigest: string}>}>("scripts/fixtures/spec0004-stick/v2/phase2-motion-cases.json");
for (const source of Object.values(sourcePlanPaths)) {
  const plan = await parsedPlan(readJson<StickAnimationPlanV1>(source));
  const defaultResult = await materializeStickAnimationPlan(plan, starter);
  const motionResult = await materializeStickAnimationMotionPlan(plan, starter);
  check(defaultResult.ok && motionResult.ok, `${source} Phase 1 and Phase 2 compatibility materializers still pass`);
  if (motionResult.ok) {
    const expected = phase2Cases.validCases.find((entry) => source.endsWith(`/${entry.name}.json`));
    equal(await digestCanonical(motionResult.value), expected?.motionCandidateDigest, `${source} published Phase 2 candidate digest remains exact`);
  }
}
equal(STICK_PHASE2_INPUT_LENGTH_MIN_RATIO, 0.4, "inherited minimum input length ratio");
equal(STICK_PHASE2_INPUT_LENGTH_MAX_RATIO, 1.6, "inherited maximum input length ratio");
equal(STICK_PHASE2_MAX_HIP_TRAVEL_PX, 480, "inherited hip travel bound");
equal(STICK_PHASE2_MAX_SEGMENT_TURN_DEGREES, 170, "inherited segment turn bound");
equal(STICK_PHASE2_OUTPUT_LENGTH_TOLERANCE_PX, 2, "inherited output length tolerance");
for (const candidate of candidates.values()) {
  const parsed = parseStickProjectDocument(candidate);
  check(parsed.ok, "timed candidate passes the normal canonical document validator");
}

const failureRoot = await createStickCommandWorkspaceRoot(starter, "phase25-injected-failure");
const failureMachine = new StickFigureCommandTransactionV1(failureRoot, {
  animationPlanMaterializer: STICK_PHASE25_TIMED_MOTION_MATERIALIZER,
  actionTimingSidecar: waveSidecar,
  failurePoint: "after_action_application",
});
const failed = await failureMachine.preview(wavePlan);
equal(failed.outcomeCode, "failed", "injected transaction failure is terminal");
equal(failed.root.editorRoot.current.documentDigest, failureRoot.editorRoot.current.documentDigest, "injected failure is a document no-op");
equal(failed.root.editorRoot.undo.length, 0, "injected failure is a history no-op");

const mutableSidecar = cloneCanonical(waveSidecar);
const immutableRoot = await createStickCommandWorkspaceRoot(starter, "phase25-immutable-sidecar");
const immutableMachine = new StickFigureCommandTransactionV1(immutableRoot, {
  animationPlanMaterializer: STICK_PHASE25_TIMED_MOTION_MATERIALIZER,
  actionTimingSidecar: mutableSidecar,
});
mutableSidecar.transitions[0].profile = "constant";
const immutablePreview = await immutableMachine.preview(wavePlan);
equal(immutablePreview.outcomeCode, "preview_ready", "transaction clones timing input before caller mutation");
equal(await digestCanonical(immutableMachine.readPreviewCandidate()), cases.validCases[0].timedCandidateDigest, "caller mutation cannot alter prepared timing");

const summary = {
  validatorVersion: 1,
  phase: "SPEC-0004 Phase 2.5 — Action Timing and Spacing Engine",
  assertionCount,
  contractVersion: STICK_ACTION_TIMING_CONTRACT_VERSION,
  profileOrder: [...STICK_ACTION_TIMING_PROFILES],
  formulas: PROFILE_FUNCTIONS,
  validTimedFixtures: cases.validCases.map((entry) => entry.name),
  mechanicalConstantPositive: cases.mechanicalConstantCase.name,
  naturalConstantRejected: true,
  invalidTimingCases: cases.invalidTimingCases,
  inheritedPhase2Cases: cases.inheritedPhase2Cases,
  topology: {jointCount: STICK_JOINT_ROLES.length, segmentCount: STICK_SEGMENT_ROLE_PAIRS.length},
  externalRequests: 0,
  apiRequests: 0,
  providerRequests: 0,
};

console.log(JSON.stringify(summary, null, 2));
