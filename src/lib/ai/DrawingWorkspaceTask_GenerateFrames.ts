import type { DrawingAiConversationMessage, DrawingAiTaskIntentExample } from "./drawingAiContract";
import {
  analyzeGenerateFramesRequest,
  type GenerateFramesIntentFamily,
  type GenerateFramesRuntimeAnalysis,
} from "./generateFramesRuntime";

export type GenerateFramesExampleKind = "good" | "bad";
export type GenerateFramesExampleFamilyType =
  | "character"
  | "object"
  | "effect"
  | "background"
  | "mixed"
  | "continuation"
  | "setup-scene"
  | "background-scroll";
export type GenerateFramesExampleRequestMode = "still" | "animation" | "continuation" | "tweak";
export type GenerateFramesExampleSearchPolicy = "local-first" | "search-required" | "question-first";
export type GenerateFramesExampleAmbiguityPolicy = "proceed" | "ask-clarify" | "controlled-fail";
export type GenerateFramesExampleSequenceKind =
  | "single-frame"
  | "short-sequence"
  | "ordered-sequence"
  | "continuation"
  | "background-scroll";

export type GenerateFramesExample = {
  id: string;
  mode: "generate-frames";
  exampleKind: GenerateFramesExampleKind;
  category: string;
  userPrompt: string;
  requestSummary: string;
  familyType: GenerateFramesExampleFamilyType;
  thinkingIntent: {
    requestMode: GenerateFramesExampleRequestMode;
    interpretation: string[];
    humanExpectation: string[];
    searchPolicy: GenerateFramesExampleSearchPolicy;
    ambiguityPolicy: GenerateFramesExampleAmbiguityPolicy;
  };
  animationPlan: {
    sequenceKind: GenerateFramesExampleSequenceKind;
    beats: string[];
  };
  commandQualityTargets: string[];
  commandFailurePatterns: string[];
  constraints: string[];
  sequence?: string[];
  drawingIntent: string;
  motionStagingIntent?: string;
  subjectMovement?: string;
  sequenceKind?: string;
  toolLayerIntent?: string;
  generationAllowed?: string;
  commandQualityShouldDo?: string[];
  commandFailureShouldAvoid?: string[];
  knownFacts: string[];
  missingFacts: string[];
  strongestGap: string;
  bestQuestion: string | null;
  acceptableOptions: string[];
  badQuestions: string[];
  reasoning: string;
  shouldAskQuestion: boolean;
  shouldProceedWithoutQuestion: boolean;
  maxQuestionsBeforeProceeding: number;
  responseFocus: string[];
  consistencyRules: string[];
  frameQualityNotes: string[];
  badStyleNotes: string[];
  tags: string[];
  version: number;
  isActive: boolean;
};

type StructuredExampleInput = {
  id: string;
  category: string;
  userPrompt: string;
  requestSummary: string;
  familyType: GenerateFramesExampleFamilyType;
  thinkingIntent: GenerateFramesExample["thinkingIntent"];
  animationPlan: GenerateFramesExample["animationPlan"];
  commandQualityTargets: string[];
  commandFailurePatterns: string[];
  constraints: string[];
  sequence?: string[];
  tags: string[];
  drawingIntent?: string;
  motionStagingIntent?: string;
  subjectMovement?: string;
  toolLayerIntent?: string;
  generationAllowed?: string;
  knownFacts?: string[];
  missingFacts?: string[];
  strongestGap?: string;
  bestQuestion?: string | null;
  acceptableOptions?: string[];
  badQuestions?: string[];
  reasoning?: string;
  responseFocus?: string[];
  consistencyRules?: string[];
  frameQualityNotes?: string[];
  badStyleNotes?: string[];
  maxQuestionsBeforeProceeding?: number;
};

const TRAINING_VERSION = 2;
const DEFAULT_MAX_QUESTIONS = 2;

const COMMON_EXPECTATION_NOTES = [
  "Before preparing commands, interpret the request, map it to the closest motion or effect pattern, and define the execution contract.",
  "Before defining steps, map the request to expected motion stages and failure conditions.",
  "For common requests like explosion, ball bounce, punch, lightning, and fire, start from established motion defaults instead of asking about obvious basics.",
  "For punch commands, default to anticipation, contact, follow-through, and recovery unless the user explicitly narrows the insert.",
  "For jump commands, default to crouch, launch, peak, land, and settle unless the user explicitly narrows the insert.",
  "If the user says add, continue, or next, preserve the current scene and append to the current sequence instead of restarting it.",
  "If the request matches a familiar pattern, use the correct default version first and only deviate when the user explicitly changes it.",
  "Only ask a question when there is still a real execution gap after applying the expected default behavior.",
  "If the request is common and underspecified, use the normal motion contract instead of guessing random shapes.",
] as const;

const COMMON_FRAME_QUALITY_NOTES = [
  ...COMMON_EXPECTATION_NOTES,
  "Always produce engine-ready command steps, not just advice.",
  "Output should describe ordered action commands that can be executed by the engine.",
  "Do not stop at analysis when enough is known.",
  "Do not return only explanation when the frame action is already clear.",
  "Prefer action logic and parameter language over abstract wording.",
  "Frame drafts should feel like execution planning and editing, not synthetic image generation.",
  "Define silhouette, pose direction, and contact path explicitly.",
  "Keep the action contract explicit.",
  "Preserve character identity and proportions unless the request changes them.",
  "Set weight, line of action, and spacing with deterministic commands.",
  "Make each step connect into the previous and next pose without teleports.",
  "Use deterministic continuity across frames with no random spacing jumps.",
  "Every step should imply action, durationFrames, intensity, timing, spacing, and an explicit command.",
  "Choose expected default colors and materials when the user does not specify them.",
  "Explosions should execute as pressure build, release, peak, breakup, and residue.",
  "Lightning should execute as charge, strike, collapse, and vanish.",
  "Punches should execute as anticipation, contact, follow-through, and recovery.",
  "Jumps should execute as crouch, launch, peak, land, and settle.",
  "The white area is the playback camera area, but the darker surrounding space is still valid authoring space for staging and timing.",
  "Treat off-camera staging, camera entry, and partial visibility as normal valid choices, not errors.",
  "If the user is continuing the same project or current sequence, preserve the existing action path, framing, and character intent unless they clearly change it.",
  "If the user asks for a simple object like a ball, circle, square, block, rod, or prop, keep it as an object unless they explicitly ask for character features.",
] as const;

const COMMON_BAD_STYLE_NOTES = [
  "Do not ask generic filler like 'What happens next?'",
  "Do not lose the action intent while trying to improve the command plan.",
  "Do not change the character design when the request is only about pose or expression.",
  "Do not turn a ball, circle, square, block, rod, or prop into a character unless the user explicitly asks for character traits.",
  "Do not make frames feel like a random image-generation guess.",
  "Do not make the pose stiff, symmetrical, or ambiguous in action direction.",
  "Do not answer with vague animation advice that ignores the actual command request.",
  "Do not reset a continuation request into a brand-new pose idea when the user is clearly extending the current animation.",
  "Do not ask about obvious defaults like explosion color, lightning color, or basic motion behavior for common requests.",
  "Do not ask obvious filler like whether a ball should stay round or whether a normal punch needs force direction.",
  "Do not deform a simple ball into a blob, star, or unrelated shape.",
  "Do not make explosions weak, muddy, or shapeless when the user asked for a normal explosion.",
] as const;

const COMMON_CONSISTENCY_RULES = [
  "Preserve the same character identity unless the user explicitly asks for a redesign.",
  "Preserve pose intent while keeping action direction explicit.",
  "Preserve proportions, limb length, and overall build from frame to frame.",
  "Respect both the larger authoring area and the camera-visible area when staging a frame.",
  "If the request places action off-camera or entering the camera, preserve that framing instead of forcing the whole character into view.",
  "When the request is a continuation, preserve the current action chain, staging, and motion direction across surrounding frames.",
  "If the request is for an object, preserve the same shape, color, and motion identity across frames and short sequences.",
] as const;

const COMMON_OBJECT_QUALITY_NOTES = [
  ...COMMON_FRAME_QUALITY_NOTES,
  "Object requests should stay simple, explicit, and physically grounded.",
  "When the request is a very simple object animation, a short safe sequence is better than over-questioning.",
] as const;

const COMMON_OBJECT_BAD_STYLE_NOTES = [
  ...COMMON_BAD_STYLE_NOTES,
  "Do not add a face, arms, or legs to an object request unless the user explicitly asks for them.",
  "Do not overcomplicate a simple object with character acting when the request is only about object motion.",
] as const;

const COMMON_OBJECT_CONSISTENCY_RULES = [
  ...COMMON_CONSISTENCY_RULES,
  "Keep object requests as objects unless the user explicitly changes them into characters.",
  "Preserve object color, scale, and path of motion across continuation beats when the user says it is the same object.",
  "A ball must stay round across the sequence except for a small contact-frame squash.",
] as const;

type EngineCommandActionType = string;
type EngineCommandPoseStage = "setup" | "anticipation" | "action" | "impact" | "follow-through" | "recovery" | "transition";
type EngineCommandIntensity = "none" | "light" | "medium" | "heavy";
type EngineCommandTiming = "static" | "fast" | "normal" | "slow";
type EngineCommandSpacing = "none" | "tight" | "medium" | "wide";

const normalizeEngineCommandText = (value: string) =>
  value
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[.;,:]+$/g, "");

const toCommandRuleText = (value: string) =>
  normalizeEngineCommandText(value)
    .replace(/\bclear(?:er)?\b/gi, "explicit")
    .replace(/\breadable\b/gi, "explicit")
    .replace(/\bclean\b/gi, "tight")
    .replace(/\bsmooth\b/gi, "continuous")
    .replace(/\bstrong\b/gi, "high-force")
    .replace(/\bgood\b/gi, "target")
    .replace(/\bfeels?\b/gi, "stays")
    .replace(/\blooks?\b/gi, "stays")
    .replace(/\breads?\b/gi, "stays")
    .replace(/\s+/g, " ")
    .trim();

const normalizeCommandDirectiveText = (value: string) => toCommandRuleText(value).replace(/[.]+$/g, "").trim();

const normalizeCommandDirectiveList = (values: string[]) =>
  values.map((value) => normalizeCommandDirectiveText(value)).filter(Boolean);

const formatCommandRuleList = (values: string[]) => values.map((value) => toCommandRuleText(value)).filter(Boolean);

const inferEngineCommandActionType = ({
  beat,
  sequenceKind,
}: {
  beat: string;
  sequenceKind: GenerateFramesExampleSequenceKind;
}): EngineCommandActionType => {
  const normalizedBeat = normalizeEngineCommandText(beat).toLowerCase();

  if (sequenceKind === "single-frame" || normalizedBeat.length === 0) {
    return "pose";
  }
  if (/\b(punch|strike|hit|clash)\b/.test(normalizedBeat)) {
    return "punch";
  }
  if (/\b(kick|chamber)\b/.test(normalizedBeat)) {
    return "kick";
  }
  if (/\b(jump|launch|takeoff|airtime|airborne|peak|upward)\b/.test(normalizedBeat)) {
    return "jump";
  }
  if (/\b(explosion|blast|ignition|pressure|breakup|residue|smoke)\b/.test(normalizedBeat)) {
    return "explosion";
  }
  if (/\b(lightning|bolt|charge|vanish)\b/.test(normalizedBeat)) {
    return "lightning";
  }
  if (/\b(inhale|exhale|breath|breathing)\b/.test(normalizedBeat)) {
    return "breathe";
  }
  if (/\b(walk|contact|passing)\b/.test(normalizedBeat)) {
    return "walk";
  }
  if (/\b(run|stride|arrival|entry)\b/.test(normalizedBeat)) {
    return "run";
  }
  if (/\b(fireball|projectile|release)\b/.test(normalizedBeat)) {
    return "projectile";
  }
  if (/\b(scroll|background)\b/.test(normalizedBeat)) {
    return "scroll";
  }
  if (/\b(guard|stance)\b/.test(normalizedBeat)) {
    return "stance";
  }
  if (/\b(dodge|evade)\b/.test(normalizedBeat)) {
    return "dodge";
  }
  if (/\b(transition|in-between|inbetween|passing|carry|through|middle|mid|approach|drop|fall|descend|rise|build|collapse|turn|spin|drift|emerge)\b/.test(normalizedBeat)) {
    return "move";
  }
  return "move";
};

const inferEngineCommandPoseStage = ({
  beat,
  index,
  totalBeats,
  sequenceKind,
}: {
  beat: string;
  index: number;
  totalBeats: number;
  sequenceKind: GenerateFramesExampleSequenceKind;
}): EngineCommandPoseStage => {
  const normalizedBeat = normalizeEngineCommandText(beat).toLowerCase();
  if (sequenceKind === "single-frame" || totalBeats <= 1) {
    return "setup";
  }
  if (/\b(setup|opening|guard|stance|ready|source ready|start)\b/.test(normalizedBeat)) {
    return "setup";
  }
  if (/\b(anticipation|wind[- ]?up|load|crouch|chamber|charge|build|pressure)\b/.test(normalizedBeat)) {
    return "anticipation";
  }
  if (/\b(impact|contact|hit|strike|clash|blast|ignition|land|landing|squash|peak)\b/.test(normalizedBeat)) {
    return "impact";
  }
  if (/\b(follow[- ]through|recoil|breakup|spread|rebound|fallout)\b/.test(normalizedBeat)) {
    return "follow-through";
  }
  if (/\b(recover|recovery|resolve|settle|fade|vanish|aftermath|residue|reset)\b/.test(normalizedBeat)) {
    return "recovery";
  }
  if (/\b(transition|in-between|passing|carry|mid|drop|rise|turn|spin|scroll)\b/.test(normalizedBeat)) {
    return "transition";
  }
  if (index === 0) {
    return "anticipation";
  }
  if (index === totalBeats - 1) {
    return "recovery";
  }
  return "action";
};

const inferEngineCommandTiming = ({
  beat,
  sequenceKind,
  poseStage,
}: {
  beat: string;
  sequenceKind: GenerateFramesExampleSequenceKind;
  poseStage: EngineCommandPoseStage;
}): EngineCommandTiming => {
  if (sequenceKind === "single-frame") {
    return "static";
  }
  const normalizedBeat = normalizeEngineCommandText(beat).toLowerCase();
  if (/\b(fast|quick|snap|sharp|sudden|immediate|explosive|violent)\b/.test(normalizedBeat)) {
    return "fast";
  }
  if (/\b(slow|linger|hold|gentle|soft|subtle|settle|fade)\b/.test(normalizedBeat)) {
    return "slow";
  }
  if (poseStage === "impact") {
    return "fast";
  }
  return "normal";
};

const inferEngineCommandIntensity = ({
  beat,
  sequenceKind,
}: {
  beat: string;
  sequenceKind: GenerateFramesExampleSequenceKind;
}): EngineCommandIntensity => {
  if (sequenceKind === "single-frame") {
    return "none";
  }
  const normalizedBeat = normalizeEngineCommandText(beat).toLowerCase();
  if (/\b(heavy|hard|strong|violent|brutal|forceful|explosive|powerful|hot|bigger)\b/.test(normalizedBeat)) {
    return "heavy";
  }
  if (/\b(light|soft|weak|small|subtle|gentle|calm|restrained)\b/.test(normalizedBeat)) {
    return "light";
  }
  return "medium";
};

const inferEngineCommandSpacing = ({
  beat,
  actionType,
}: {
  beat: string;
  actionType: EngineCommandActionType;
}): EngineCommandSpacing => {
  const normalizedBeat = normalizeEngineCommandText(beat).toLowerCase();
  if (actionType === "pose") {
    return "none";
  }
  if (/\b(wide|spread|expand|outward|arc|far|higher|long|larger|offset|scroll)\b/.test(normalizedBeat)) {
    return "wide";
  }
  if (/\b(tight|compact|compressed|close|guard|hold|settle|centered|controlled)\b/.test(normalizedBeat)) {
    return "tight";
  }
  if (actionType === "jump" || actionType === "explosion" || actionType === "projectile" || actionType === "scroll") {
    return "wide";
  }
  if (actionType === "walk" || actionType === "run" || actionType === "move") {
    return "medium";
  }
  return "tight";
};

const inferEngineCommandDurationFrames = ({
  actionType,
  timing,
  sequenceKind,
}: {
  actionType: EngineCommandActionType;
  timing: EngineCommandTiming;
  sequenceKind: GenerateFramesExampleSequenceKind;
}) => {
  if (sequenceKind === "single-frame") {
    return 1;
  }

  const baseDuration =
    actionType === "jump" || actionType === "explosion" || actionType === "projectile"
      ? 4
      : actionType === "walk" || actionType === "run"
        ? 3
        : actionType === "breathe"
          ? 5
          : 3;

  if (timing === "fast") {
    return Math.max(1, baseDuration - 1);
  }
  if (timing === "slow") {
    return baseDuration + 2;
  }
  return baseDuration;
};

const buildExampleEngineCommand = ({
  actionType,
  poseStage,
}: {
  actionType: EngineCommandActionType;
  poseStage: EngineCommandPoseStage;
}) => {
  if (actionType === "pose" || poseStage === "setup") {
    return "set pose and hold without transition";
  }
  if (actionType === "punch") {
    if (poseStage === "anticipation") return "shift weight backward, retract striking arm, and hold release line";
    if (poseStage === "impact") return "drive striking arm to full extension, apply contact stop, and start recoil";
    if (poseStage === "follow-through") return "carry torso rotation past contact and begin arm retraction";
    if (poseStage === "recovery") return "retract striking arm, re-center stance, and restore guard";
    return "drive striking arm on target line and rotate torso through release";
  }
  if (actionType === "kick") {
    if (poseStage === "anticipation") return "compress support leg, chamber kicking leg, and lock torso for release";
    if (poseStage === "impact") return "extend kicking leg to contact line, apply impact stop, and start retraction";
    if (poseStage === "recovery") return "plant balance line, retract kicking leg, and restore guard";
    return "drive kicking leg through target line and rotate hips through release";
  }
  if (actionType === "jump") {
    if (poseStage === "anticipation") return "compress hips and knees, load arms for lift, and hold launch line";
    if (poseStage === "impact") return "plant feet on landing frame, compress knees and hips, and absorb force";
    if (poseStage === "recovery") return "re-center torso and restore neutral stance";
    return "drive body upward on arc path and preserve flight direction";
  }
  if (actionType === "explosion") {
    if (poseStage === "anticipation") return "compress blast core at source and hold pre-release frame";
    if (poseStage === "impact") return "ignite core, hit peak blast radius, and apply expansion stop";
    if (poseStage === "follow-through") return "tear blast shell into debris and smoke breakup";
    if (poseStage === "recovery") return "thin smoke, drop residue, and stop active expansion";
    return "expand blast shell outward from source and preserve source lock";
  }
  if (actionType === "lightning") {
    if (poseStage === "anticipation") return "charge strike origin and hold discharge frame";
    if (poseStage === "impact") return "drive bolt from source to target and clamp peak flash";
    if (poseStage === "follow-through") return "collapse main bolt into thinner after-strike branches";
    if (poseStage === "recovery") return "remove active bolt and end discharge";
    return "release bolt on direct path and preserve branch hierarchy";
  }
  if (actionType === "breathe") {
    if (poseStage === "anticipation") return "set torso baseline and prepare inhale";
    if (poseStage === "impact") return "hold peak inhale for one frame and stop upward lift";
    if (poseStage === "follow-through") return "drop shoulders into exhale and release torso compression";
    if (poseStage === "recovery") return "return to next breath baseline";
    return "lift ribcage for inhale and preserve cycle continuity";
  }
  if (actionType === "walk") {
    if (poseStage === "impact") return "plant contact foot, clamp slide on contact frame, and absorb step weight";
    if (poseStage === "transition") return "pass hips over support leg and switch support foot";
    if (poseStage === "recovery") return "settle into next cycle entry";
    return "drive body mass forward and preserve stride direction";
  }
  if (actionType === "run") {
    if (poseStage === "impact") return "plant next run contact, clamp foot slide, and absorb forward load";
    if (poseStage === "transition") return "pass center through flight phase and switch lead leg";
    if (poseStage === "recovery") return "reset push-off pattern and preserve run cadence";
    return "drive body forward, extend stride, and preserve travel direction";
  }
  if (actionType === "projectile") {
    if (poseStage === "anticipation") return "charge release source, align travel path, and hold discharge frame";
    if (poseStage === "impact") return "apply contact burst or exit frame and clamp projectile on peak frame";
    if (poseStage === "follow-through") return "carry trail and debris behind projectile path";
    if (poseStage === "recovery") return "stop source emission and end projectile event";
    return "release projectile from source and drive it along travel path";
  }
  if (actionType === "scroll") {
    if (poseStage === "recovery") return "stop background travel at final offset and hold subject position";
    return "move environment opposite travel direction while locking subject screen position";
  }
  return poseStage === "recovery"
    ? "settle to end pose and stop motion"
    : poseStage === "impact"
      ? "apply contact stop on peak frame and lock direction"
      : poseStage === "transition"
        ? "carry motion between beats and preserve path continuity"
        : "execute main motion on primary path";
};

const formatAnimationPlanAsEngineCommands = (animationPlan: GenerateFramesExample["animationPlan"]) => {
  const beats = animationPlan.beats.map((beat) => normalizeEngineCommandText(beat)).filter(Boolean);

  if (beats.length === 0) {
    return "step 1: pose=setup; description=action=pose; durationFrames=1; intensity=none; timing=static; spacing=none; command=set pose and hold without transition;";
  }

  return beats
    .map((beat, index) => {
      const actionType = inferEngineCommandActionType({
        beat,
        sequenceKind: animationPlan.sequenceKind,
      });
      const poseStage = inferEngineCommandPoseStage({
        beat,
        index,
        totalBeats: beats.length,
        sequenceKind: animationPlan.sequenceKind,
      });
      const timing = inferEngineCommandTiming({
        beat,
        sequenceKind: animationPlan.sequenceKind,
        poseStage,
      });
      const intensity = inferEngineCommandIntensity({
        beat,
        sequenceKind: animationPlan.sequenceKind,
      });
      const spacing = inferEngineCommandSpacing({
        beat,
        actionType,
      });
      const durationFrames = inferEngineCommandDurationFrames({
        actionType,
        timing,
        sequenceKind: animationPlan.sequenceKind,
      });
      const command = buildExampleEngineCommand({
        actionType,
        poseStage,
      });

      return `step ${index + 1}: pose=${poseStage}; description=action=${actionType}; durationFrames=${durationFrames}; intensity=${intensity}; timing=${timing}; spacing=${spacing}; command=${command};`;
    })
    .join(" || ");
};

const buildDefaultDrawingIntent = ({
  requestSummary,
  familyType,
  animationPlan,
  commandQualityTargets,
  constraints,
}: Pick<
  StructuredExampleInput,
  "requestSummary" | "familyType" | "animationPlan" | "commandQualityTargets" | "constraints"
>) => {
  const commandText = formatAnimationPlanAsEngineCommands(animationPlan);
  const qualityText = formatCommandRuleList(commandQualityTargets).slice(0, 2).join(", ");
  const constraintText = normalizeCommandDirectiveList(constraints).join(", ");
  const objectiveText = normalizeCommandDirectiveText(requestSummary);
  return `${objectiveText}. Prepare engine commands using ${familyType} family logic. ${commandText} Prioritize ${qualityText}.${constraintText.length > 0 ? ` Preserve ${constraintText}.` : ""}`.trim();
};

const buildDefaultMotionStagingIntent = ({
  animationPlan,
  commandQualityTargets,
}: Pick<StructuredExampleInput, "animationPlan" | "commandQualityTargets">) => {
  const commandText = formatAnimationPlanAsEngineCommands(animationPlan);
  const qualityText = formatCommandRuleList(commandQualityTargets).slice(0, 2).join(", ");
  return `Command chain: ${commandText} Prioritize ${qualityText}.`;
};

const buildDefaultReasoning = ({
  thinkingIntent,
  constraints,
}: Pick<StructuredExampleInput, "thinkingIntent" | "constraints">) =>
  [
    ...normalizeCommandDirectiveList(thinkingIntent.interpretation),
    ...normalizeCommandDirectiveList(thinkingIntent.humanExpectation),
    ...normalizeCommandDirectiveList(constraints),
  ]
    .filter((line) => line.trim().length > 0)
    .join(" ");

const createStructuredExample = (
  exampleKind: GenerateFramesExampleKind,
  input: StructuredExampleInput,
): GenerateFramesExample => {
  const shouldAskQuestion = input.thinkingIntent.ambiguityPolicy === "ask-clarify";
  const shouldProceedWithoutQuestion = input.thinkingIntent.ambiguityPolicy === "proceed";
  const interpretation = normalizeCommandDirectiveList(input.thinkingIntent.interpretation);
  const humanExpectation = normalizeCommandDirectiveList(input.thinkingIntent.humanExpectation);
  const commandQualityTargets = normalizeCommandDirectiveList(input.commandQualityTargets);
  const commandFailurePatterns = normalizeCommandDirectiveList(input.commandFailurePatterns);
  const constraints = normalizeCommandDirectiveList(input.constraints);
  const knownFacts = normalizeCommandDirectiveList(
    input.knownFacts ?? [...input.thinkingIntent.interpretation, ...input.thinkingIntent.humanExpectation].slice(0, 6),
  );
  const missingFacts = normalizeCommandDirectiveList(input.missingFacts ?? []);
  const strongestGap = normalizeCommandDirectiveText(input.strongestGap ?? missingFacts[0] ?? "");
  const isObjectLike = input.familyType === "object";
  const responseFocus = normalizeCommandDirectiveList(
    input.responseFocus ?? commandQualityTargets.slice(0, 3).map((line) => line.trim()).filter(Boolean),
  );
  const consistencyRules = normalizeCommandDirectiveList(
    input.consistencyRules ??
      [...(isObjectLike ? COMMON_OBJECT_CONSISTENCY_RULES : COMMON_CONSISTENCY_RULES), ...constraints].filter(Boolean),
  );
  const frameQualityNotes = normalizeCommandDirectiveList(
    input.frameQualityNotes ??
      [...(isObjectLike ? COMMON_OBJECT_QUALITY_NOTES : COMMON_FRAME_QUALITY_NOTES), ...commandQualityTargets].filter(Boolean),
  );
  const badStyleNotes = normalizeCommandDirectiveList(
    input.badStyleNotes ??
      [...(isObjectLike ? COMMON_OBJECT_BAD_STYLE_NOTES : COMMON_BAD_STYLE_NOTES), ...commandFailurePatterns].filter(Boolean),
  );
  const reasoning = normalizeCommandDirectiveText(input.reasoning ?? buildDefaultReasoning(input));

  return {
    id: input.id,
    mode: "generate-frames",
    exampleKind,
    category: input.category,
    userPrompt: input.userPrompt.trim(),
    requestSummary: normalizeCommandDirectiveText(input.requestSummary),
    familyType: input.familyType,
    thinkingIntent: {
      ...input.thinkingIntent,
      interpretation,
      humanExpectation,
    },
    animationPlan: {
      ...input.animationPlan,
      beats: input.animationPlan.beats.map((line) => line.trim()).filter(Boolean),
    },
    commandQualityTargets,
    commandFailurePatterns,
    constraints,
    sequence:
      input.sequence?.map((line) => line.trim()).filter(Boolean) ??
      input.animationPlan.beats.map((line) => line.trim()).filter(Boolean),
    drawingIntent: (input.drawingIntent ?? buildDefaultDrawingIntent(input)).trim(),
    motionStagingIntent: (input.motionStagingIntent ?? buildDefaultMotionStagingIntent(input)).trim(),
    subjectMovement: input.subjectMovement,
    sequenceKind: input.animationPlan.sequenceKind,
    toolLayerIntent: input.toolLayerIntent,
    generationAllowed: input.generationAllowed,
    commandQualityShouldDo: commandQualityTargets,
    commandFailureShouldAvoid: commandFailurePatterns,
    knownFacts,
    missingFacts,
    strongestGap,
    bestQuestion: shouldAskQuestion ? (input.bestQuestion ?? null) : null,
    acceptableOptions: input.acceptableOptions ?? [],
    badQuestions: input.badQuestions ?? [],
    reasoning,
    shouldAskQuestion,
    shouldProceedWithoutQuestion,
    maxQuestionsBeforeProceeding: Math.min(
      input.maxQuestionsBeforeProceeding ?? (shouldAskQuestion ? DEFAULT_MAX_QUESTIONS : 0),
      10,
    ),
    responseFocus,
    consistencyRules,
    frameQualityNotes,
    badStyleNotes,
    tags: input.tags,
    version: TRAINING_VERSION,
    isActive: true,
  };
};

const createGoodExample = (input: StructuredExampleInput) => createStructuredExample("good", input);
const createBadExample = (input: StructuredExampleInput) => createStructuredExample("bad", input);

const thinking = (
  requestMode: GenerateFramesExampleRequestMode,
  interpretation: string[],
  humanExpectation: string[],
  searchPolicy: GenerateFramesExampleSearchPolicy = "local-first",
  ambiguityPolicy: GenerateFramesExampleAmbiguityPolicy = "proceed",
): GenerateFramesExample["thinkingIntent"] => ({
  requestMode,
  interpretation,
  humanExpectation,
  searchPolicy,
  ambiguityPolicy,
});

const plan = (
  sequenceKind: GenerateFramesExampleSequenceKind,
  beats: string[],
): GenerateFramesExample["animationPlan"] => ({
  sequenceKind,
  beats,
});

export const GENERATE_FRAMES_INTENT_EXAMPLES: DrawingAiTaskIntentExample[] = [
  {
    id: "frames-intent-greeting",
    userPrompt: "hello",
    intent: "conversation",
    notes: "A greeting should stay conversational even if Generate Frames is selected.",
    tags: ["greeting", "casual", "non-task"],
  },
  {
    id: "frames-intent-frame-feedback",
    userPrompt: "Do you think this frame idea reads well?",
    intent: "feedback",
    notes: "Feedback on a frame idea should not automatically trigger a frame question card.",
    tags: ["feedback", "frame-idea", "non-task"],
  },
  {
    id: "frames-intent-pose-brainstorm",
    userPrompt: "I'm just thinking out loud about a running pose and whether it feels stiff.",
    intent: "feedback",
    notes: "Casual pose brainstorming should get natural feedback instead of task forcing.",
    tags: ["brainstorming", "pose", "feedback", "non-task"],
  },
  {
    id: "frames-intent-direct-frame",
    userPrompt: "Do the next frame where he turns and raises his arm.",
    intent: "task",
    notes: "This is an explicit Generate Frames request.",
    tags: ["task", "generate-frames", "next-frame"],
  },
  {
    id: "frames-intent-cleanup",
    userPrompt: "Clean up this rough pose without changing the pose idea.",
    intent: "task",
    notes: "This is a direct cleanup request for Generate Frames.",
    tags: ["task", "generate-frames", "cleanup"],
  },
  {
    id: "frames-intent-expression",
    userPrompt: "Keep the same character but make his face shocked.",
    intent: "task",
    notes: "A direct expression-change request should activate frame behavior.",
    tags: ["task", "generate-frames", "expression"],
  },
  {
    id: "frames-intent-continuation-next-beat",
    userPrompt: "Do the next frame after the dodge.",
    intent: "task",
    notes: "Continuing the current motion should stay in Generate Frames instead of acting like a new unrelated request.",
    tags: ["task", "generate-frames", "continuation", "next-frame"],
  },
  {
    id: "frames-intent-same-scene-staff-spin",
    userPrompt: "Same scene, do the next staff-spin frame.",
    intent: "task",
    notes: "A same-scene weapon-motion continuation belongs in Generate Frames.",
    tags: ["task", "generate-frames", "continuation", "weapon"],
  },
  {
    id: "frames-intent-continuation-camera-entry",
    userPrompt: "After that, have him start coming into camera from the left.",
    intent: "task",
    notes: "Continuation plus camera-entry phrasing is still a direct command-preparation request.",
    tags: ["task", "generate-frames", "continuation", "camera-entry"],
  },
  {
    id: "frames-intent-walk-in-place",
    userPrompt: "Make a stick figure walk in place.",
    intent: "task",
    notes: "A walk-cycle request is a direct Generate Frames task even when it is phrased with animate instead of explicit frame language.",
    tags: ["task", "generate-frames", "walk-cycle", "tool-behavior"],
  },
  {
    id: "frames-intent-lightning-effect",
    userPrompt: "Make lightning.",
    intent: "task",
    notes: "Effect-animation requests belong in Generate Frames and should route as engine-command work.",
    tags: ["task", "generate-frames", "effect-animation", "lightning"],
  },
  {
    id: "frames-intent-fire-effect",
    userPrompt: "Make fire.",
    intent: "task",
    notes: "Animated fire is still a Generate Frames request rather than casual discussion.",
    tags: ["task", "generate-frames", "effect-animation", "fire"],
  },
  {
    id: "frames-intent-background-layer",
    userPrompt: "Make a mountain background.",
    intent: "task",
    notes: "Background-generation requests still belong in Generate Frames, but they should stay layer-aware.",
    tags: ["task", "generate-frames", "background-generation", "layer-aware"],
  },
];

const GOOD_EXAMPLE_INPUTS: StructuredExampleInput[] = [
  {
    id: "good-explosion-canonical",
    category: "canonical-explosion",
    userPrompt: "Define explosion action sequence.",
    requestSummary: "Explosion short-sequence command.",
    familyType: "effect",
    thinkingIntent: thinking(
      "animation",
      ["Explosion is an effect event that needs a full readable arc."],
      ["Humans expect pressure, blast, breakup, and residue."],
    ),
    animationPlan: plan("short-sequence", ["pressure build", "ignition", "outward blast", "breakup", "residue"]),
    commandQualityTargets: ["hot bright core", "irregular outward blast", "clear breakup and finish"],
    commandFailurePatterns: ["weak puff", "circle spam", "no ending"],
    constraints: ["no extra characters"],
    tags: ["canonical-default", "expectation-first", "effect", "explosion", "short-sequence"],
  },
  {
    id: "good-explosion-stronger",
    category: "explosion-variant",
    userPrompt: "Define a stronger explosion action sequence.",
    requestSummary: "Higher-force explosion short-sequence command.",
    familyType: "effect",
    thinkingIntent: thinking(
      "animation",
      ["This is still the explosion family, just with more force."],
      ["Stronger means sharper release and heavier breakup, not a different family."],
    ),
    animationPlan: plan("short-sequence", ["tight build", "hard release", "wide peak blast", "heavier breakup", "residue"]),
    commandQualityTargets: ["stronger expansion", "harder impact read", "heavier debris or residue"],
    commandFailurePatterns: ["same weak explosion", "bigger puff only", "no force increase"],
    constraints: ["stay in the explosion family"],
    tags: ["effect", "explosion", "force-variant", "short-sequence"],
  },
  {
    id: "good-explosion-no-smoke",
    category: "explosion-constraint",
    userPrompt: "Define an explosion action sequence with no smoke.",
    requestSummary: "No-smoke explosion short-sequence command.",
    familyType: "effect",
    thinkingIntent: thinking(
      "animation",
      ["Explosion still needs blast, breakup, and finish."],
      ["The no-smoke constraint removes smoke, not the event completion."],
    ),
    animationPlan: plan("short-sequence", ["build", "blast", "breakup", "ember fade"]),
    commandQualityTargets: ["clear blast event", "readable breakup without smoke", "clean fade or ember finish"],
    commandFailurePatterns: ["smoke added anyway", "no aftermath at all", "weak burst"],
    constraints: ["no smoke"],
    tags: ["effect", "explosion", "constraint", "short-sequence"],
  },
  {
    id: "good-explosion-left-side",
    category: "explosion-staging",
    userPrompt: "Define an explosion action sequence on the left side.",
    requestSummary: "Left-side explosion short-sequence command.",
    familyType: "effect",
    thinkingIntent: thinking(
      "animation",
      ["Explosion event plus a staging constraint."],
      ["The blast should stay on the left and still complete properly."],
    ),
    animationPlan: plan("short-sequence", ["left-side pressure", "left-side burst", "breakup", "residue"]),
    commandQualityTargets: ["left-side placement holds", "blast direction reads clearly", "event finishes cleanly"],
    commandFailurePatterns: ["centered generic puff", "position ignored", "no aftermath"],
    constraints: ["keep the explosion on the left side"],
    tags: ["effect", "explosion", "staging", "left-side", "short-sequence"],
  },
  {
    id: "good-explosion-ground-impact",
    category: "explosion-grounded",
    userPrompt: "Define a ground-impact explosion action sequence.",
    requestSummary: "Ground-impact explosion short-sequence command.",
    familyType: "effect",
    thinkingIntent: thinking(
      "animation",
      ["The impact source matters and should anchor the event to the ground."],
      ["Grounded explosions need blast plus fallout that reads from the hit point."],
    ),
    animationPlan: plan("short-sequence", ["impact spark", "upward and outward blast", "ground ring", "breakup", "dust or residue"]),
    commandQualityTargets: ["grounded source point", "shockwave or ground ring", "fallout after the blast"],
    commandFailurePatterns: ["floating fire puff", "no ground interaction", "no fallout"],
    constraints: ["anchor the event to the ground"],
    tags: ["effect", "explosion", "ground-impact", "short-sequence"],
  },
  {
    id: "good-explosion-toxic-green",
    category: "explosion-style-variant",
    userPrompt: "Define a toxic green explosion action sequence.",
    requestSummary: "Palette-modified explosion short-sequence command.",
    familyType: "effect",
    thinkingIntent: thinking(
      "animation",
      ["This is still an explosion family event with a palette or material change."],
      ["Style variation should not erase blast logic."],
    ),
    animationPlan: plan("short-sequence", ["toxic charge", "green blast", "corrosive breakup", "toxic residue"]),
    commandQualityTargets: ["stylized but still explosive", "poisonous color identity", "proper event completion"],
    commandFailurePatterns: ["random green cloud", "no blast logic", "same weak puff tinted green"],
    constraints: ["preserve explosion behavior while changing palette"],
    tags: ["effect", "explosion", "variant", "color", "short-sequence"],
  },
  {
    id: "good-lightning-canonical",
    category: "canonical-lightning",
    userPrompt: "Define lightning strike action sequence.",
    requestSummary: "Lightning strike short-sequence command.",
    familyType: "effect",
    thinkingIntent: thinking(
      "animation",
      ["Lightning is a strike event, not a static frame."],
      ["Humans expect a fast charge, strike, collapse, and vanish."],
    ),
    animationPlan: plan("short-sequence", ["charge", "strike", "collapse", "vanish"]),
    commandQualityTargets: ["sharp strike path", "fast flash", "clean collapse and vanish"],
    commandFailurePatterns: ["blob glow", "lingering line", "no vanish"],
    constraints: ["keep it fast and readable"],
    tags: ["canonical-default", "expectation-first", "effect", "lightning", "short-sequence"],
  },
  {
    id: "good-lightning-left-side",
    category: "lightning-staging",
    userPrompt: "Define a left-side lightning strike action sequence.",
    requestSummary: "Left-side lightning short-sequence command.",
    familyType: "effect",
    thinkingIntent: thinking(
      "animation",
      ["Lightning strike plus side placement."],
      ["The strike should stay left while keeping the same strike-to-vanish arc."],
    ),
    animationPlan: plan("short-sequence", ["left-side charge", "left-side strike", "collapse", "vanish"]),
    commandQualityTargets: ["left-side strike placement", "sharp readable bolt", "clean vanish"],
    commandFailurePatterns: ["centered bolt", "soft glow cloud", "no finish"],
    constraints: ["keep the strike on the left side"],
    tags: ["effect", "lightning", "left-side", "short-sequence"],
  },
  {
    id: "good-lightning-sharp",
    category: "lightning-variant",
    userPrompt: "Define a sharp lightning strike action sequence.",
    requestSummary: "High-sharpness lightning short-sequence command.",
    familyType: "effect",
    thinkingIntent: thinking(
      "animation",
      ["Sharpness means crisper path and timing, not just more glow."],
      ["The family still ends by collapsing and vanishing."],
    ),
    animationPlan: plan("short-sequence", ["quick guide", "hard strike", "collapse", "vanish"]),
    commandQualityTargets: ["crisp angular bolt", "tight strike timing", "fast finish"],
    commandFailurePatterns: ["thick glowing blob", "slow beam feel", "muddy collapse"],
    constraints: ["no slow beam behavior"],
    tags: ["effect", "lightning", "sharp", "short-sequence"],
  },
  {
    id: "good-lightning-forked",
    category: "lightning-variant",
    userPrompt: "Define a forked lightning strike action sequence.",
    requestSummary: "Forked lightning short-sequence command.",
    familyType: "effect",
    thinkingIntent: thinking(
      "animation",
      ["Branches support the main strike instead of replacing it."],
      ["The main strike still needs to dominate the read."],
    ),
    animationPlan: plan("short-sequence", ["charge", "main strike with branches", "collapse", "vanish"]),
    commandQualityTargets: ["readable main bolt", "branches stay secondary", "clear collapse and vanish"],
    commandFailurePatterns: ["branch clutter", "no main strike", "electric blob"],
    constraints: ["keep branches secondary to the main strike"],
    tags: ["effect", "lightning", "forked", "short-sequence"],
  },
  {
    id: "good-lightning-fast-vanish",
    category: "lightning-timing",
    userPrompt: "Define a lightning strike action sequence with a fast vanish.",
    requestSummary: "Fast-vanish lightning short-sequence command.",
    familyType: "effect",
    thinkingIntent: thinking(
      "animation",
      ["The user is emphasizing a fast end."],
      ["Lightning should feel brief and sharp, not held on screen."],
    ),
    animationPlan: plan("short-sequence", ["charge", "strike", "collapse", "instant vanish"]),
    commandQualityTargets: ["brief readable strike", "quick decay", "no lingering residue"],
    commandFailurePatterns: ["held electric scribble", "slow fade", "lingering line"],
    constraints: ["vanish quickly"],
    tags: ["effect", "lightning", "timing", "short-sequence"],
  },
  {
    id: "good-fireball-right-hand",
    category: "fireball-launch",
    userPrompt: "Define a right-hand fireball action sequence.",
    requestSummary: "Right-hand projectile short-sequence command.",
    familyType: "mixed",
    thinkingIntent: thinking(
      "animation",
      ["The projectile source must read from the right hand."],
      ["Projectile family needs charge, launch, travel, and finish behavior."],
    ),
    animationPlan: plan("short-sequence", ["right-hand charge", "release", "travel", "impact or exit"]),
    commandQualityTargets: ["clear right-hand source", "readable projectile path", "impact or exit behavior"],
    commandFailurePatterns: ["random floating orb", "unclear source", "no travel path"],
    constraints: ["launch from the right hand"],
    tags: ["mixed", "character", "effect", "fireball", "projectile", "right-hand", "short-sequence"],
  },
  {
    id: "good-fireball-left-then-right",
    category: "fireball-order",
    userPrompt: "Define a fireball action sequence from the left hand, then the right hand.",
    requestSummary: "Ordered dual-projectile command sequence.",
    familyType: "mixed",
    thinkingIntent: thinking(
      "animation",
      ["The order matters exactly."],
      ["Hand ownership and sequence must stay readable."],
    ),
    animationPlan: plan("ordered-sequence", ["left-hand release", "right-hand release", "resolve"]),
    commandQualityTargets: ["exact left-then-right order", "clear hand ownership", "projectiles stay distinct"],
    commandFailurePatterns: ["generic projectile spam", "order collapse", "same-hand ambiguity"],
    constraints: ["preserve left then right order"],
    tags: ["mixed", "character", "effect", "fireball", "projectile", "ordered"],
  },
  {
    id: "good-fireball-airborne-attack",
    category: "fireball-airborne",
    userPrompt: "Define an airborne fireball attack sequence.",
    requestSummary: "Airborne projectile short-sequence command.",
    familyType: "mixed",
    thinkingIntent: thinking(
      "animation",
      ["Airborne pose readability matters as much as the projectile."],
      ["The fireball must stay tied to the character's action."],
    ),
    animationPlan: plan("short-sequence", ["airborne setup", "midair release", "travel", "impact or exit"]),
    commandQualityTargets: ["readable airborne silhouette", "clear projectile source", "coherent attack finish"],
    commandFailurePatterns: ["floating effect burst", "unclear body pose", "disconnected projectile"],
    constraints: ["keep the character airborne until the release reads"],
    tags: ["mixed", "character", "effect", "fireball", "airborne", "short-sequence"],
  },
  {
    id: "good-fireball-three-beat-order",
    category: "fireball-combo",
    userPrompt: "Three fireballs from right hand, left hand, then jump attack.",
    requestSummary: "Ordered projectile-combo command sequence.",
    familyType: "mixed",
    thinkingIntent: thinking(
      "animation",
      ["Preserve the exact requested order."],
      ["Do not add filler flourishes that blur the beats."],
    ),
    animationPlan: plan("ordered-sequence", ["right-hand release", "left-hand release", "jump attack", "resolve"]),
    commandQualityTargets: ["exact beat order", "readable transitions", "clear shift into the jump attack"],
    commandFailurePatterns: ["merged combo mush", "reordered beats", "random extra motion"],
    constraints: ["follow the exact ordered sequence"],
    tags: ["mixed", "character", "effect", "fireball", "combo", "ordered", "jump"],
  },
  {
    id: "good-breathing-hard",
    category: "breathing-exhausted",
    userPrompt: "Define a hard-breathing action sequence.",
    requestSummary: "Exhausted breathing short-sequence command.",
    familyType: "character",
    thinkingIntent: thinking(
      "animation",
      ["Breathing is a body rhythm, not idle bobbing."],
      ["Fatigue should read through posture and inhale or exhale timing."],
    ),
    animationPlan: plan("short-sequence", ["inhale", "peak tension", "exhale", "partial recovery"]),
    commandQualityTargets: ["chest or shoulder rhythm", "fatigue reads clearly", "partial recovery at the end"],
    commandFailurePatterns: ["idle bobbing", "random up-down float", "no fatigue read"],
    constraints: ["keep it subtle but readable"],
    tags: ["character", "breathing", "exhausted", "short-sequence"],
  },
  {
    id: "good-catching-breath",
    category: "breathing-exhausted",
    userPrompt: "Define a tired catching-their-breath sequence.",
    requestSummary: "Tired breathing short-sequence command.",
    familyType: "character",
    thinkingIntent: thinking(
      "animation",
      ["Posture and breathing must both read."],
      ["Tired pacing should be slower and heavier than neutral breathing."],
    ),
    animationPlan: plan("short-sequence", ["slouched inhale", "exhale drop", "slow recovery"]),
    commandQualityTargets: ["slouched posture", "heavy breath", "reduced pace"],
    commandFailurePatterns: ["normal idle cycle", "upright relaxed posture", "generic bob"],
    constraints: ["keep the tired mood"],
    tags: ["character", "breathing", "tired", "short-sequence"],
  },
  {
    id: "good-calm-breathing",
    category: "breathing-calm",
    userPrompt: "Define a calm breathing action sequence.",
    requestSummary: "Calm breathing short-sequence command.",
    familyType: "character",
    thinkingIntent: thinking(
      "animation",
      ["Calm breathing should stay restrained but readable."],
      ["Calm does not mean dead stillness."],
    ),
    animationPlan: plan("short-sequence", ["inhale", "exhale", "settle"]),
    commandQualityTargets: ["soft controlled cycle", "subtle readable motion", "clean settle"],
    commandFailurePatterns: ["dead stillness", "exaggerated panting", "jittery chest changes"],
    constraints: ["keep it calm and simple"],
    tags: ["character", "breathing", "calm", "short-sequence"],
  },
  {
    id: "good-combat-canonical-two-punching",
    category: "canonical-combat",
    userPrompt: "Define a two-stick-figure punch exchange sequence.",
    requestSummary: "Two-actor combat short-sequence command.",
    familyType: "character",
    thinkingIntent: thinking(
      "animation",
      ["This is simple combat, not huge choreography."],
      ["Use the cheapest path that still gives readable anticipation, clash, and recovery."],
    ),
    animationPlan: plan("short-sequence", ["faceoff or guard", "advance", "clash or contact", "recoil or reset"]),
    commandQualityTargets: ["readable two-person exchange", "clear contact or clash moment", "visible recoil or recovery"],
    commandFailurePatterns: ["random flailing", "mushy contact", "no recovery"],
    constraints: ["keep both subjects readable"],
    tags: ["canonical-default", "expectation-first", "character", "combat", "fight", "punch", "two-subject", "short-sequence"],
  },
  {
    id: "good-combat-left-punches-right",
    category: "combat-directed",
    userPrompt: "Define a punch sequence with the left figure hitting the right figure.",
    requestSummary: "Directed punch short-sequence command.",
    familyType: "character",
    thinkingIntent: thinking(
      "animation",
      ["Subject roles matter here."],
      ["Attacker and defender must be easy to distinguish."],
    ),
    animationPlan: plan("short-sequence", ["left-side anticipation", "strike", "right-side reaction", "recovery"]),
    commandQualityTargets: ["attacker and defender roles are clear", "hit direction reads left-to-right", "reaction supports the contact"],
    commandFailurePatterns: ["wrong figure attacks", "mirrored posing", "no readable reaction"],
    constraints: ["left figure attacks right figure"],
    tags: ["character", "combat", "punch", "directed", "left-right", "short-sequence"],
  },
  {
    id: "good-kick-with-recovery",
    category: "combat-kick",
    userPrompt: "Define a kick action sequence with recovery.",
    requestSummary: "Kick short-sequence command with recovery.",
    familyType: "character",
    thinkingIntent: thinking(
      "animation",
      ["Kick needs prep, extension, recoil, and recovery."],
      ["Stable support leg logic is part of the family contract."],
    ),
    animationPlan: plan("short-sequence", ["chamber", "contact", "recoil", "recovery"]),
    commandQualityTargets: ["support leg reads clearly", "kick arc is readable", "recovery resolves the move"],
    commandFailurePatterns: ["teleport leg", "broken limb feel", "no recovery"],
    constraints: ["keep limb logic stable"],
    tags: ["character", "combat", "kick", "recovery", "short-sequence"],
  },
  {
    id: "good-punch-then-recover",
    category: "combat-punch",
    userPrompt: "Define a punch action sequence, then recovery.",
    requestSummary: "Punch short-sequence command with recovery.",
    familyType: "character",
    thinkingIntent: thinking(
      "animation",
      ["One attack plus a finish is enough."],
      ["Punch family still needs anticipation, contact, and recovery."],
    ),
    animationPlan: plan("short-sequence", ["anticipation", "contact", "follow-through", "recovery"]),
    commandQualityTargets: ["clear force path", "readable hit beat", "recovery closes the move"],
    commandFailurePatterns: ["weak contact-only pose", "no follow-through", "unfinished action"],
    constraints: ["keep the hit direction clear"],
    tags: ["character", "combat", "punch", "recovery", "short-sequence"],
  },
  {
    id: "good-punch-and-reaction",
    category: "combat-reaction",
    userPrompt: "Define a punch action sequence with one reaction.",
    requestSummary: "Punch-and-reaction short-sequence command.",
    familyType: "character",
    thinkingIntent: thinking(
      "animation",
      ["With two subjects, reaction is part of the event."],
      ["Reaction should support the hit instead of replacing it."],
    ),
    animationPlan: plan("short-sequence", ["punch setup", "contact", "defender recoil", "reset"]),
    commandQualityTargets: ["defender reaction reads clearly", "attack and reaction stay distinct", "two-subject staging is clean"],
    commandFailurePatterns: ["no reaction", "both static", "mirrored unrelated poses"],
    constraints: ["preserve two-subject clarity"],
    tags: ["character", "combat", "punch", "reaction", "two-subject", "short-sequence"],
  },
  {
    id: "good-guard-stance",
    category: "combat-setup-scene",
    userPrompt: "Define a two-stick-figure guard stance setup.",
    requestSummary: "Still-frame combat setup command.",
    familyType: "character",
    thinkingIntent: thinking(
      "still",
      ["This is a still setup frame, not a full fight."],
      ["Even a simple setup frame should have strong silhouettes and clear facing."],
    ),
    animationPlan: plan("single-frame", []),
    commandQualityTargets: [
      "preserve facing assignment",
      "preserve balanced guard spacing",
      "preserve silhouette separation on hold",
    ],
    commandFailurePatterns: [
      "still-frame converted into attack sequence",
      "guard balance collapses",
      "facing assignment becomes ambiguous",
    ],
    constraints: ["still frame only"],
    tags: ["character", "combat", "setup-scene", "guard", "single-frame"],
  },
  {
    id: "good-violent-punch",
    category: "combat-force-variant",
    userPrompt: "Define a harder punch action sequence.",
    requestSummary: "Higher-force punch short-sequence command.",
    familyType: "character",
    thinkingIntent: thinking(
      "animation",
      ["This is still a punch family action with more force."],
      ["More violent should increase commitment and impact, not create random chaos."],
    ),
    animationPlan: plan("short-sequence", ["deeper anticipation", "harder contact", "stronger follow-through", "recovery"]),
    commandQualityTargets: ["increase impact intensity", "shorten strike timing", "preserve strong follow-through"],
    commandFailurePatterns: ["same weak pose", "random chaos", "lost punch readability"],
    constraints: ["preserve punch identity"],
    tags: ["character", "combat", "punch", "force-variant", "short-sequence"],
  },
  {
    id: "good-short-sparring",
    category: "combat-exchange",
    userPrompt: "Define a short sparring action sequence.",
    requestSummary: "Compact combat short-sequence command.",
    familyType: "character",
    thinkingIntent: thinking(
      "animation",
      ["Short sparring should stay concise."],
      ["Readable turns are better than overbuilt combo spam."],
    ),
    animationPlan: plan("short-sequence", ["guard", "probe strike", "response", "reset"]),
    commandQualityTargets: ["keep attack-response order clear", "use tight spacing between beats", "end on a compact reset"],
    commandFailurePatterns: ["combo spam", "crowded unreadable action", "no reset"],
    constraints: ["stay concise"],
    tags: ["character", "combat", "sparring", "short-sequence"],
  },
  {
    id: "good-walk-in-place",
    category: "movement-walk",
    userPrompt: "Define a walk-in-place action sequence for a stick figure.",
    requestSummary: "In-place walk short-sequence command.",
    familyType: "character",
    thinkingIntent: thinking(
      "animation",
      ["A walk-in-place request should stay centered."],
      ["The read comes from contact and passing beats, not from drifting across the frame."],
    ),
    animationPlan: plan("short-sequence", ["right contact", "passing", "left contact", "passing"]),
    commandQualityTargets: ["adjust timing and weight distribution", "alternate clear contact and passing commands", "keep the subject centered"],
    commandFailurePatterns: ["sliding feet", "teleporting legs", "unintended translation"],
    constraints: ["keep the subject centered"],
    tags: ["character", "walk", "walk-cycle", "treadmill", "short-sequence"],
  },
  {
    id: "good-run-off-camera-left",
    category: "movement-run-entry",
    userPrompt: "Define a run-in action sequence from off-camera left.",
    requestSummary: "Off-camera run-entry short-sequence command.",
    familyType: "character",
    thinkingIntent: thinking(
      "animation",
      ["Off-camera staging is intentional here."],
      ["The run should preserve direction and use entry staging clearly."],
    ),
    animationPlan: plan("short-sequence", ["off-camera lean", "entry stride", "on-camera travel", "arrival"]),
    commandQualityTargets: ["clear entry direction", "off-camera staging feels intentional", "arrival is readable"],
    commandFailurePatterns: ["forced recentering", "no motion direction", "stiff entrance"],
    constraints: ["preserve off-camera-left setup"],
    tags: ["character", "run", "camera-entry", "off-camera", "short-sequence"],
  },
  {
    id: "good-jump-and-landing",
    category: "movement-jump",
    userPrompt: "Define a jump action sequence with landing.",
    requestSummary: "Jump short-sequence command with landing.",
    familyType: "character",
    thinkingIntent: thinking(
      "animation",
      ["Jump should include takeoff and landing, not just a midair pose."],
      ["Landing needs a settle beat."],
    ),
    animationPlan: plan("short-sequence", ["crouch", "rise", "peak", "land", "settle"]),
    commandQualityTargets: ["deepen crouch anticipation", "hold a readable airtime peak", "compress impact then recover"],
    commandFailurePatterns: ["midair freeze only", "teleport to landing", "no recovery"],
    constraints: ["complete the full jump arc"],
    tags: ["character", "jump", "landing", "short-sequence"],
  },
  {
    id: "good-dodge-then-recover",
    category: "movement-dodge",
    userPrompt: "Define a dodge action sequence, then recovery.",
    requestSummary: "Dodge short-sequence command with recovery.",
    familyType: "character",
    thinkingIntent: thinking(
      "animation",
      ["The dodge and recovery should contrast clearly."],
      ["Recovery must resolve instead of repeating the dodge."],
    ),
    animationPlan: plan("short-sequence", ["evade move", "catch", "recovery"]),
    commandQualityTargets: ["directional dodge", "balance catch", "resolved recovery"],
    commandFailurePatterns: ["two identical poses", "no settle", "mushy direction"],
    constraints: ["recovery must resolve the dodge"],
    tags: ["character", "dodge", "recovery", "short-sequence"],
  },
  {
    id: "good-background-scroll-neighborhood",
    category: "background-scroll",
    userPrompt: "Define a neighborhood background-scroll sequence while the character walks.",
    requestSummary: "Anchored background-scroll short-sequence command.",
    familyType: "background-scroll",
    thinkingIntent: thinking(
      "animation",
      ["This is a background-scroll travel illusion."],
      ["Keep the subject anchored and move the environment coherently."],
    ),
    animationPlan: plan("background-scroll", ["anchored walk cycle", "coherent background scroll", "resolved offset"]),
    commandQualityTargets: [
      "preserve subject screen lock during background motion",
      "preserve background layer motion coherence",
      "preserve neighborhood cue set through offset change",
    ],
    commandFailurePatterns: [
      "subject slides instead of staying anchored",
      "background motion loses layer coherence",
      "scene cue set collapses during scroll",
    ],
    constraints: ["preserve scene identity while the background moves"],
    tags: ["background-scroll", "background", "character", "neighborhood", "walk"],
  },
  {
    id: "good-setup-forest-two-figures",
    category: "setup-scene",
    userPrompt: "Define a two-stick-figure forest setup. One red, one blue. Just a starting point.",
    requestSummary: "Single-frame forest setup command.",
    familyType: "setup-scene",
    thinkingIntent: thinking(
      "still",
      ["This is a familiar local still setup scene."],
      ["Starting point means preserve single-frame setup scope and establish scene continuity."],
    ),
    animationPlan: plan("single-frame", []),
    commandQualityTargets: [
      "preserve two-subject setup count and separation",
      "preserve forest environment cues",
      "preserve single-frame setup behavior",
    ],
    commandFailurePatterns: [
      "unnecessary search escalation",
      "still-frame converted into action sequence",
      "setup cue set omitted",
    ],
    constraints: ["still frame", "one red figure", "one blue figure"],
    tags: ["setup-scene", "character", "background", "forest", "stick-figure", "single-frame"],
  },
  {
    id: "good-setup-cave-opening",
    category: "setup-scene",
    userPrompt: "Define a cave opening setup with one stick figure.",
    requestSummary: "Single-frame cave setup command.",
    familyType: "setup-scene",
    thinkingIntent: thinking(
      "still",
      ["This is a familiar still setup scene."],
      ["Preserve single-frame setup scope and do not expand into action commands."],
    ),
    animationPlan: plan("single-frame", []),
    commandQualityTargets: [
      "preserve cave setup cues",
      "preserve single-subject setup scope",
      "preserve single-frame setup behavior",
    ],
    commandFailurePatterns: [
      "cave setup cues omitted",
      "still-frame converted into action sequence",
      "subject placement becomes ambiguous",
    ],
    constraints: ["still setup frame"],
    tags: ["setup-scene", "character", "background", "cave", "single-frame"],
  },
  {
    id: "good-setup-neighborhood-standing",
    category: "setup-scene",
    userPrompt: "Define a neighborhood setup with a character standing there.",
    requestSummary: "Single-frame neighborhood setup command.",
    familyType: "setup-scene",
    thinkingIntent: thinking(
      "still",
      ["This is a single-frame setup command."],
      ["Preserve neighborhood setup and standing-subject scope without triggering action expansion."],
    ),
    animationPlan: plan("single-frame", []),
    commandQualityTargets: [
      "preserve neighborhood setup cues",
      "preserve single-subject standing setup",
      "preserve single-frame setup behavior",
    ],
    commandFailurePatterns: [
      "non-requested environment clutter added",
      "setup environment cues omitted",
      "still-frame converted into action sequence",
    ],
    constraints: ["keep it simple and still"],
    tags: ["setup-scene", "character", "background", "neighborhood", "single-frame"],
  },
  {
    id: "good-background-mountain",
    category: "background-scene",
    userPrompt: "Define a mountain background setup.",
    requestSummary: "Background-only still-frame command.",
    familyType: "background",
    thinkingIntent: thinking(
      "still",
      ["This is a background-only request."],
      ["No character should be added unless asked."],
    ),
    animationPlan: plan("single-frame", []),
    commandQualityTargets: [
      "preserve mountain environment cues",
      "preserve background-only scope",
      "preserve single-frame hold behavior",
    ],
    commandFailurePatterns: [
      "background-only request polluted with characters",
      "non-requested props added",
      "mountain cue set omitted",
    ],
    constraints: ["background only"],
    tags: ["background", "mountain", "single-frame"],
  },
  {
    id: "good-setup-rooftop-fight",
    category: "setup-scene",
    userPrompt: "Define a rooftop fight setup.",
    requestSummary: "Still-frame rooftop combat setup command.",
    familyType: "setup-scene",
    thinkingIntent: thinking(
      "still",
      ["This is a setup frame for later combat."],
      ["Preserve rooftop combat setup scope without triggering action sequence expansion."],
    ),
    animationPlan: plan("single-frame", []),
    commandQualityTargets: [
      "preserve rooftop setup cues without triggering action generation",
      "preserve two-subject facing and separation",
      "preserve combat setup scope without triggering action generation",
    ],
    commandFailurePatterns: [
      "still-frame converted into action sequence",
      "rooftop cue set omitted",
      "subject staging becomes ambiguous",
    ],
    constraints: ["still setup frame"],
    tags: ["setup-scene", "character", "background", "rooftop", "combat", "single-frame"],
  },
  {
    id: "good-continuation-blue-bigger",
    category: "continuation-tweak",
    userPrompt: "Make the blue one bigger.",
    requestSummary: "Continuation command modifying only target scale.",
    familyType: "continuation",
    thinkingIntent: thinking(
      "tweak",
      ["This is a same-project targeted tweak."],
      ["Only the blue subject should change while everything else stays locked."],
    ),
    animationPlan: plan("continuation", ["preserve current scene", "scale only the blue subject"]),
    commandQualityTargets: [
      "modify only the blue subject scale",
      "preserve current scene and pose lock",
      "preserve subject targeting lock",
    ],
    commandFailurePatterns: ["wrong target modified", "current scene reset", "non-requested subjects changed"],
    constraints: ["preserve all non-target elements"],
    tags: ["continuation", "character", "targeting", "blue", "tweak"],
  },
  {
    id: "good-continuation-right-stick-blue",
    category: "continuation-tweak",
    userPrompt: "Change the right stick figure to blue.",
    requestSummary: "Continuation command recoloring only the right subject.",
    familyType: "continuation",
    thinkingIntent: thinking(
      "tweak",
      ["Right-side identity binding should win."],
      ["This is a same-scene recolor, not a restart."],
    ),
    animationPlan: plan("continuation", ["preserve scene and pose", "recolor the right figure only"]),
    commandQualityTargets: [
      "recolor only the right-side subject",
      "preserve left-side subject state",
      "preserve current scene continuity lock",
    ],
    commandFailurePatterns: ["wrong subject recolored", "non-requested subjects changed", "current scene reset"],
    constraints: ["preserve scene and pose"],
    tags: ["continuation", "character", "targeting", "right-side", "blue", "tweak"],
  },
  {
    id: "good-continuation-add-lightning",
    category: "continuation-effect-addition",
    userPrompt: "Actually keep the scene, just add lightning.",
    requestSummary: "Continuation command appending lightning to current scene.",
    familyType: "continuation",
    thinkingIntent: thinking(
      "continuation",
      ["Correction language locks the current scene."],
      ["Only the lightning effect should be added."],
    ),
    animationPlan: plan("continuation", ["preserve scene", "add lightning strike", "collapse", "vanish"]),
    commandQualityTargets: [
      "preserve current scene and subject layout",
      "append lightning command without replacing current chain",
      "preserve current scene anchor",
    ],
    commandFailurePatterns: [
      "current scene reset",
      "new scene appended instead of current-scene edit",
      "effect replaces existing subject layout",
    ],
    constraints: ["keep the existing scene and subjects"],
    tags: ["continuation", "effect", "lightning", "correction", "scene-lock"],
  },
  {
    id: "good-continuation-punch",
    category: "continuation-action",
    userPrompt: "Add a punch after this.",
    requestSummary: "Continuation command appending punch sequence to current scene.",
    familyType: "continuation",
    thinkingIntent: thinking(
      "continuation",
      ["Only valid when a real continuation anchor exists."],
      ["Preserve the current subject and scene, then append the punch command chain."],
    ),
    animationPlan: plan("continuation", ["preserve staging", "punch anticipation", "contact", "follow-through", "recovery"]),
    commandQualityTargets: [
      "preserve current subject, scene, and sequence anchor",
      "append punch anticipation-contact-follow-through-recovery chain without replacing prior chain",
      "preserve continuation anchor through recovery",
    ],
    commandFailurePatterns: ["continuation loses anchor", "wrong subject modified", "current sequence replaced"],
    constraints: ["only valid with a real current sequence anchor"],
    tags: ["continuation", "character", "combat", "punch", "anchored"],
  },
  {
    id: "good-continuation-kick",
    category: "continuation-action",
    userPrompt: "Continue with a kick.",
    requestSummary: "Continuation command appending kick sequence to current scene.",
    familyType: "continuation",
    thinkingIntent: thinking(
      "continuation",
      ["Only valid when a real continuation anchor exists."],
      ["Preserve the current subject and scene, then append the kick command chain."],
    ),
    animationPlan: plan("continuation", ["preserve staging", "kick anticipation", "contact", "follow-through", "recovery"]),
    commandQualityTargets: [
      "preserve current subject, scene, and sequence anchor",
      "append kick anticipation-contact-follow-through-recovery chain without replacing prior chain",
      "preserve continuation anchor through recovery",
    ],
    commandFailurePatterns: ["continuation loses anchor", "wrong subject modified", "current sequence replaced"],
    constraints: ["only valid with a real current sequence anchor"],
    tags: ["continuation", "character", "combat", "kick", "anchored"],
  },
  {
    id: "good-correction-blue-instead",
    category: "continuation-correction",
    userPrompt: "Not the red one, the blue one instead.",
    requestSummary: "Continuation correction command with retargeted subject.",
    familyType: "continuation",
    thinkingIntent: thinking(
      "tweak",
      ["Correction language overrides the earlier target."],
      ["Blue must win and the red target must be excluded."],
    ),
    animationPlan: plan("continuation", ["preserve scene", "retarget the existing change to the blue subject"]),
    commandQualityTargets: [
      "modify only the blue subject",
      "preserve explicit red exclusion",
      "preserve correction override over prior target",
    ],
    commandFailurePatterns: ["red target still modified", "non-requested subjects changed", "correction override ignored"],
    constraints: ["correction language must win"],
    tags: ["continuation", "character", "correction", "targeting", "blue"],
  },
  {
    id: "good-ask-clarify-make-him-bigger",
    category: "ambiguity-question",
    userPrompt: "Make him bigger.",
    requestSummary: "Clarification question for continuation target.",
    familyType: "continuation",
    thinkingIntent: thinking(
      "tweak",
      ["Two plausible male targets means the target is ambiguous."],
      ["Ask one narrow question instead of guessing."],
      "local-first",
      "ask-clarify",
    ),
    animationPlan: plan("continuation", ["preserve current scene", "apply the change only after target clarification"]),
    commandQualityTargets: [
      "ask which current subject 'him' refers to",
      "modify only the clarified target after answer",
      "preserve current scene until clarification",
    ],
    commandFailurePatterns: [
      "target modified without clarification",
      "non-requested subjects changed",
      "current scene reset",
    ],
    constraints: ["ask one narrow clarification question first"],
    bestQuestion: "Which current subject do you mean by 'him'?",
    acceptableOptions: ["The left subject", "The right subject", "The blue subject"],
    missingFacts: ["Which current subject 'him' refers to."],
    strongestGap: "Which current subject 'him' refers to.",
    tags: ["continuation", "ambiguity", "question-needed", "targeting"],
  },
  {
    id: "good-controlled-fail-no-anchor",
    category: "continuation-question",
    userPrompt: "Continue the current sequence.",
    requestSummary: "Clarification question for missing continuation anchor.",
    familyType: "continuation",
    thinkingIntent: thinking(
      "continuation",
      ["Continuation needs a real current sequence anchor."],
      ["Without an anchor, ask one continuation-routing question instead of guessing."],
      "local-first",
      "ask-clarify",
    ),
    animationPlan: plan("continuation", ["preserve no-anchor state", "route continuation after one anchor question"]),
    commandQualityTargets: [
      "ask exactly one continuation-routing question",
      "do not invent current scene or sequence",
      "preserve no-anchor state until routing answer arrives",
    ],
    commandFailurePatterns: [
      "continuation loses anchor and invents new chain",
      "invented current scene",
      "no-anchor request converted into failure response",
    ],
    constraints: ["ask exactly one continuation-routing question when no real anchor exists"],
    bestQuestion: "Continue from which frame or create new sequence?",
    acceptableOptions: ["Current frame", "Current sequence", "Create new sequence"],
    missingFacts: ["A real current sequence anchor."],
    strongestGap: "A real current sequence anchor.",
    maxQuestionsBeforeProceeding: 1,
    tags: ["continuation", "question-needed", "missing-anchor"],
  },
  {
    id: "good-style-combat-gods",
    category: "style-reference",
    userPrompt: "Define a two-stick-figure fight sequence using Combat Gods as style grounding.",
    requestSummary: "Style-grounded combat short-sequence command.",
    familyType: "mixed",
    thinkingIntent: thinking(
      "animation",
      ["This is combat plus a named style reference."],
      ["Style grounding is required, but the result should extract principles rather than copy."],
      "search-required",
    ),
    animationPlan: plan("short-sequence", ["guard", "strike", "contact", "recovery"]),
    commandQualityTargets: [
      "preserve combat force hierarchy",
      "preserve subject separation and attack lane",
      "apply style influence without literal copying",
    ],
    commandFailurePatterns: ["force hierarchy stays generic", "direct style copying", "style grounding omitted"],
    constraints: ["treat the style reference as grounding, not a template"],
    tags: ["mixed", "character", "combat", "style-reference", "search-required"],
  },
  {
    id: "good-bouncing-ball",
    category: "canonical-ball",
    userPrompt: "Define a bouncing-ball action sequence.",
    requestSummary: "Bouncing-ball short-sequence command.",
    familyType: "object",
    thinkingIntent: thinking(
      "animation",
      ["This is an object animation, not a character acting request."],
      ["Humans expect fall, contact, rebound, and controlled squash."],
    ),
    animationPlan: plan("short-sequence", ["fall", "contact", "rebound", "settle"]),
    commandQualityTargets: [
      "preserve round object identity except contact squash",
      "preserve vertical bounce path",
      "resolve rebound into settle command",
    ],
    commandFailurePatterns: ["object identity drifts from ball", "path drifts off bounce axis", "contact or settle command omitted"],
    constraints: ["keep the ball an object"],
    tags: ["canonical-default", "expectation-first", "object", "ball", "bounce", "short-sequence"],
  },
  {
    id: "good-ball-contact-frame",
    category: "ball-contact",
    userPrompt: "Define the ball contact step.",
    requestSummary: "Single-frame ball-contact command.",
    familyType: "object",
    thinkingIntent: thinking(
      "still",
      ["This asks for one specific beat in the bounce."],
      ["The ball should stay recognizable with only a small readable squash."],
    ),
    animationPlan: plan("single-frame", []),
    commandQualityTargets: [
      "apply limited contact squash only",
      "preserve ball identity on impact frame",
      "lock contact frame without extra sequence generation",
    ],
    commandFailurePatterns: [
      "contact squash exceeds ball identity",
      "object shape drifts off-model",
      "impact frame becomes ambiguous",
    ],
    constraints: ["contact frame only", "keep the ball recognizable"],
    tags: ["object", "ball", "contact-frame", "single-frame"],
  },
];

const BAD_EXAMPLE_INPUTS: StructuredExampleInput[] = [
  {
    id: "bad-explosion-circles",
    category: "bad-explosion",
    userPrompt: "Define explosion action sequence.",
    requestSummary: "Explosion treated like random circles.",
    familyType: "effect",
    thinkingIntent: thinking(
      "animation",
      ["Bad thinking: just repeat circles instead of constructing an event."],
      ["Bad expectation: a puff shape is enough."],
    ),
    animationPlan: plan("short-sequence", ["circle loop", "stop"]),
    commandQualityTargets: ["remove or rewrite this example"],
    commandFailurePatterns: ["puff", "circle spam", "no breakup or disintegration"],
    constraints: ["bad negative example"],
    tags: ["bad-example", "effect", "explosion"],
  },
  {
    id: "bad-explosion-smoke-first",
    category: "bad-explosion",
    userPrompt: "Define explosion action sequence.",
    requestSummary: "Explosion starts with smoke instead of blast.",
    familyType: "effect",
    thinkingIntent: thinking(
      "animation",
      ["Bad thinking: start with smoke because explosion means cloud."],
      ["Bad expectation: smoke can replace the hot blast."],
    ),
    animationPlan: plan("short-sequence", ["gray smoke cloud", "more smoke"]),
    commandQualityTargets: ["remove or rewrite this example"],
    commandFailurePatterns: ["smoke-first mush", "no hot blast", "weak event read"],
    constraints: ["bad negative example"],
    tags: ["bad-example", "effect", "explosion"],
  },
  {
    id: "bad-explosion-one-frame",
    category: "bad-explosion",
    userPrompt: "Define explosion action sequence.",
    requestSummary: "Explosion frozen on one bright frame.",
    familyType: "effect",
    thinkingIntent: thinking(
      "animation",
      ["Bad thinking: one bright frame is enough."],
      ["Bad expectation: explosions do not need an ending."],
    ),
    animationPlan: plan("short-sequence", ["bright burst only"]),
    commandQualityTargets: ["remove or rewrite this example"],
    commandFailurePatterns: ["frozen peak frame", "no ending", "no residue or disintegration"],
    constraints: ["bad negative example"],
    tags: ["bad-example", "effect", "explosion"],
  },
  {
    id: "bad-lightning-blob",
    category: "bad-lightning",
    userPrompt: "Define lightning strike action sequence.",
    requestSummary: "Lightning treated like a glow blob.",
    familyType: "effect",
    thinkingIntent: thinking(
      "animation",
      ["Bad thinking: make a glowing blob."],
      ["Bad expectation: glow alone is enough."],
    ),
    animationPlan: plan("short-sequence", ["glow blob", "linger"]),
    commandQualityTargets: ["remove or rewrite this example"],
    commandFailurePatterns: ["soft glow cloud", "no strike path", "no vanish"],
    constraints: ["bad negative example"],
    tags: ["bad-example", "effect", "lightning"],
  },
  {
    id: "bad-lightning-lingering-line",
    category: "bad-lightning",
    userPrompt: "Define lightning strike action sequence.",
    requestSummary: "Lightning left on screen like a static line.",
    familyType: "effect",
    thinkingIntent: thinking(
      "animation",
      ["Bad thinking: place a line and leave it on screen."],
      ["Bad expectation: no collapse is needed."],
    ),
    animationPlan: plan("short-sequence", ["line appears", "hold"]),
    commandQualityTargets: ["remove or rewrite this example"],
    commandFailurePatterns: ["lingering line", "no collapse", "no vanish"],
    constraints: ["bad negative example"],
    tags: ["bad-example", "effect", "lightning"],
  },
  {
    id: "bad-lightning-as-explosion",
    category: "bad-lightning",
    userPrompt: "Define lightning strike action sequence.",
    requestSummary: "Lightning treated like an explosion cloud.",
    familyType: "effect",
    thinkingIntent: thinking(
      "animation",
      ["Bad thinking: treat lightning like an explosion."],
      ["Bad expectation: a puff-like electric cloud is enough."],
    ),
    animationPlan: plan("short-sequence", ["electric puff", "bigger electric puff"]),
    commandQualityTargets: ["remove or rewrite this example"],
    commandFailurePatterns: ["puff-like electric cloud", "no strike identity", "family confusion"],
    constraints: ["bad negative example"],
    tags: ["bad-example", "effect", "lightning"],
  },
  {
    id: "bad-fireball-floating-orb",
    category: "bad-fireball",
    userPrompt: "Define a fireball action sequence.",
    requestSummary: "Fireball treated like a floating orb.",
    familyType: "mixed",
    thinkingIntent: thinking(
      "animation",
      ["Bad thinking: place a floating orb in space."],
      ["Bad expectation: no launch or path is needed."],
    ),
    animationPlan: plan("short-sequence", ["spawn orb", "hover orb"]),
    commandQualityTargets: ["remove or rewrite this example"],
    commandFailurePatterns: ["no launch", "no direction", "no impact"],
    constraints: ["bad negative example"],
    tags: ["bad-example", "mixed", "effect", "fireball", "projectile"],
  },
  {
    id: "bad-fireball-same-orb",
    category: "bad-fireball",
    userPrompt: "Define a fireball action sequence.",
    requestSummary: "Fireball reuses the same projectile every time.",
    familyType: "mixed",
    thinkingIntent: thinking(
      "animation",
      ["Bad thinking: reuse the same orb every time."],
      ["Bad expectation: tiny surface changes count as variation."],
    ),
    animationPlan: plan("short-sequence", ["same orb", "same orb again"]),
    commandQualityTargets: ["remove or rewrite this example"],
    commandFailurePatterns: ["hard-coded projectile family", "fake variation", "stale repeats"],
    constraints: ["bad negative example"],
    tags: ["bad-example", "mixed", "effect", "fireball", "projectile"],
  },
  {
    id: "bad-breathing-idle-bob",
    category: "bad-breathing",
    userPrompt: "Define a hard-breathing action sequence.",
    requestSummary: "Breathing treated like generic bobbing.",
    familyType: "character",
    thinkingIntent: thinking(
      "animation",
      ["Bad thinking: just bob the body up and down."],
      ["Bad expectation: fatigue does not need to read."],
    ),
    animationPlan: plan("short-sequence", ["up", "down", "up", "down"]),
    commandQualityTargets: ["remove or rewrite this example"],
    commandFailurePatterns: ["idle bobbing", "no inhale or exhale logic", "no fatigue read"],
    constraints: ["bad negative example"],
    tags: ["bad-example", "character", "breathing"],
  },
  {
    id: "bad-breathing-random-jitter",
    category: "bad-breathing",
    userPrompt: "Define a hard-breathing action sequence.",
    requestSummary: "Breathing uses random chest changes.",
    familyType: "character",
    thinkingIntent: thinking(
      "animation",
      ["Bad thinking: pick random chest sizes every frame."],
      ["Bad expectation: jitter can replace rhythm."],
    ),
    animationPlan: plan("short-sequence", ["random change", "random change", "random change"]),
    commandQualityTargets: ["remove or rewrite this example"],
    commandFailurePatterns: ["jittery breathing", "no rhythm", "no readable inhale or exhale"],
    constraints: ["bad negative example"],
    tags: ["bad-example", "character", "breathing"],
  },
  {
    id: "bad-combat-one-hit-pose",
    category: "bad-combat",
    userPrompt: "Define a two-stick-figure punch exchange sequence.",
    requestSummary: "Combat collapsed to one generic hit pose.",
    familyType: "character",
    thinkingIntent: thinking(
      "animation",
      ["Bad thinking: one generic hit pose is enough."],
      ["Bad expectation: anticipation and recovery are optional."],
    ),
    animationPlan: plan("short-sequence", ["generic contact pose"]),
    commandQualityTargets: ["remove or rewrite this example"],
    commandFailurePatterns: ["stiff contact-only pose", "no anticipation", "no recovery"],
    constraints: ["bad negative example"],
    tags: ["bad-example", "character", "combat", "punch"],
  },
  {
    id: "bad-combat-same-combo",
    category: "bad-combat",
    userPrompt: "Define a two-stick-figure punch exchange sequence.",
    requestSummary: "Combat repeats the same combo every time.",
    familyType: "character",
    thinkingIntent: thinking(
      "animation",
      ["Bad thinking: use the same combo every time."],
      ["Bad expectation: repetition is good enough."],
    ),
    animationPlan: plan("short-sequence", ["same combo", "same combo", "same combo"]),
    commandQualityTargets: ["remove or rewrite this example"],
    commandFailurePatterns: ["canned repeated combat", "no controlled variation", "stale family output"],
    constraints: ["bad negative example"],
    tags: ["bad-example", "character", "combat", "punch"],
  },
  {
    id: "bad-combat-random-flailing",
    category: "bad-combat",
    userPrompt: "Define a two-stick-figure punch exchange sequence.",
    requestSummary: "Combat treated like random flailing.",
    familyType: "character",
    thinkingIntent: thinking(
      "animation",
      ["Bad thinking: both figures can flail at once."],
      ["Bad expectation: contact readability does not matter."],
    ),
    animationPlan: plan("short-sequence", ["flail", "more flail"]),
    commandQualityTargets: ["remove or rewrite this example"],
    commandFailurePatterns: ["unreadable exchange", "no clean contact", "random motion"],
    constraints: ["bad negative example"],
    tags: ["bad-example", "character", "combat", "punch"],
  },
  {
    id: "bad-kick-teleport-leg",
    category: "bad-combat",
    userPrompt: "Define a kick action sequence.",
    requestSummary: "Kick teleports straight to full extension.",
    familyType: "character",
    thinkingIntent: thinking(
      "animation",
      ["Bad thinking: teleport the leg to full extension."],
      ["Bad expectation: support and recoil do not matter."],
    ),
    animationPlan: plan("short-sequence", ["neutral", "full extension"]),
    commandQualityTargets: ["remove or rewrite this example"],
    commandFailurePatterns: ["broken-limb feel", "no support-leg balance", "no recoil"],
    constraints: ["bad negative example"],
    tags: ["bad-example", "character", "combat", "kick"],
  },
  {
    id: "bad-setup-scene-search",
    category: "bad-setup-scene",
    userPrompt: "Define a two-stick-figure forest setup. One red, one blue. Just a starting point.",
    requestSummary: "Familiar setup scene incorrectly triggers search.",
    familyType: "setup-scene",
    thinkingIntent: thinking(
      "still",
      ["Bad thinking: mixed prompt means search is required."],
      ["Bad expectation: a familiar setup scene is too risky to plan locally."],
      "search-required",
    ),
    animationPlan: plan("single-frame", []),
    commandQualityTargets: ["remove or rewrite this example"],
    commandFailurePatterns: ["search-heavy failure", "no first scene", "continuity never starts"],
    constraints: ["bad negative example"],
    tags: ["bad-example", "setup-scene", "character", "background", "forest"],
  },
  {
    id: "bad-cave-overbuilt",
    category: "bad-setup-scene",
    userPrompt: "Define a cave opening setup with one stick figure.",
    requestSummary: "Simple cave setup gets overbuilt into animation.",
    familyType: "setup-scene",
    thinkingIntent: thinking(
      "still",
      ["Bad thinking: caves are dramatic so overbuild the scene."],
      ["Bad expectation: setup frames should become cinematic animation."],
    ),
    animationPlan: plan("short-sequence", ["extra move", "extra move", "extra move"]),
    commandQualityTargets: ["remove or rewrite this example"],
    commandFailurePatterns: ["overbuilt setup", "unnecessary animation", "lost opening-frame simplicity"],
    constraints: ["bad negative example"],
    tags: ["bad-example", "setup-scene", "character", "background", "cave"],
  },
  {
    id: "bad-ambiguity-guess-him",
    category: "bad-ambiguity",
    userPrompt: "Make him bigger.",
    requestSummary: "Ambiguous target guessed instead of clarified.",
    familyType: "continuation",
    thinkingIntent: thinking(
      "tweak",
      ["Bad thinking: guess the target."],
      ["Bad expectation: ambiguous pronouns do not need clarification."],
    ),
    animationPlan: plan("continuation", ["guess a target", "apply the change"]),
    commandQualityTargets: ["remove or rewrite this example"],
    commandFailurePatterns: ["wrong subject modified", "ambiguous guess", "lost trust"],
    constraints: ["bad negative example"],
    tags: ["bad-example", "continuation", "ambiguity", "targeting"],
  },
  {
    id: "bad-continue-invent-anchor",
    category: "bad-controlled-fail",
    userPrompt: "Continue the current sequence.",
    requestSummary: "Continuation invents an anchor instead of failing safely.",
    familyType: "continuation",
    thinkingIntent: thinking(
      "continuation",
      ["Bad thinking: invent an anchor."],
      ["Bad expectation: fake continuity is acceptable."],
    ),
    animationPlan: plan("continuation", ["invent scene", "pretend it is the same sequence"]),
    commandQualityTargets: ["remove or rewrite this example"],
    commandFailurePatterns: ["fake continuation", "wrong scene", "invented anchor"],
    constraints: ["bad negative example"],
    tags: ["bad-example", "continuation", "missing-anchor"],
  },
  {
    id: "bad-correction-reset-scene",
    category: "bad-correction",
    userPrompt: "Actually keep the scene, just add lightning.",
    requestSummary: "Correction language ignored and scene is reset.",
    familyType: "continuation",
    thinkingIntent: thinking(
      "continuation",
      ["Bad thinking: ignore the correction and restart."],
      ["Bad expectation: keep-scene instructions are optional."],
    ),
    animationPlan: plan("continuation", ["restart scene", "add unrelated lightning"]),
    commandQualityTargets: ["remove or rewrite this example"],
    commandFailurePatterns: ["scene reset", "ignored correction", "unrelated restart"],
    constraints: ["bad negative example"],
    tags: ["bad-example", "continuation", "correction", "lightning"],
  },
  {
    id: "bad-correction-blue-ignored",
    category: "bad-correction",
    userPrompt: "Not the red one, the blue one instead.",
    requestSummary: "Correction-aware retargeting is ignored.",
    familyType: "continuation",
    thinkingIntent: thinking(
      "tweak",
      ["Bad thinking: apply the change to both or keep the first target."],
      ["Bad expectation: correction language can be ignored."],
    ),
    animationPlan: plan("continuation", ["keep old target", "or change both"]),
    commandQualityTargets: ["remove or rewrite this example"],
    commandFailurePatterns: ["correction ignored", "red changes anyway", "both targets modified"],
    constraints: ["bad negative example"],
    tags: ["bad-example", "continuation", "correction", "targeting", "blue"],
  },
  {
    id: "bad-ball-blob",
    category: "bad-object",
    userPrompt: "Define a bouncing-ball action sequence.",
    requestSummary: "Ball turns into an unrelated blob.",
    familyType: "object",
    thinkingIntent: thinking(
      "animation",
      ["Bad thinking: deform the ball into any shape that looks active."],
      ["Bad expectation: object identity does not matter."],
    ),
    animationPlan: plan("short-sequence", ["fall", "blob", "weird blob rebound"]),
    commandQualityTargets: ["remove or rewrite this example"],
    commandFailurePatterns: ["blob deformation", "lost ball identity", "random shape drift"],
    constraints: ["bad negative example"],
    tags: ["bad-example", "object", "ball", "bounce"],
  },
];

const GOOD_TRAINING_EXAMPLES: GenerateFramesExample[] = GOOD_EXAMPLE_INPUTS.map((input) =>
  createGoodExample(input),
);
const BAD_TRAINING_EXAMPLES: GenerateFramesExample[] = BAD_EXAMPLE_INPUTS.map((input) =>
  createBadExample(input),
);

const normalizeTrainingText = (value: string) =>
  value
    .toLowerCase()
    .replace(/[“”]/g, "\"")
    .replace(/[’]/g, "'")
    .replace(/[\u2013\u2014]/g, " ")
    .replace(/[^\w\s'/-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const getTextTokens = (value: string) =>
  normalizeTrainingText(value)
    .split(/\s+/)
    .filter((token) => token.length > 2);

const scoreExample = ({
  example,
  userMessage,
  analysisInput,
}: {
  example: GenerateFramesExample;
  userMessage: string;
  analysisInput: string;
}) => {
  const combinedInput = `${userMessage}\n${analysisInput}`;
  const normalizedInput = normalizeTrainingText(combinedInput);
  const inputTokens = new Set(getTextTokens(combinedInput));
  const exampleText = [
    example.exampleKind,
    example.category,
    example.userPrompt,
    example.requestSummary,
    example.familyType,
    example.drawingIntent,
    example.motionStagingIntent ?? "",
    example.subjectMovement ?? "",
    example.sequenceKind ?? "",
    example.toolLayerIntent ?? "",
    example.generationAllowed ?? "",
    example.strongestGap,
    example.bestQuestion ?? "",
    example.thinkingIntent.requestMode,
    example.thinkingIntent.searchPolicy,
    example.thinkingIntent.ambiguityPolicy,
    ...example.thinkingIntent.interpretation,
    ...example.thinkingIntent.humanExpectation,
    ...example.animationPlan.beats,
    ...example.commandQualityTargets,
    ...example.commandFailurePatterns,
    ...example.constraints,
    ...(example.sequence ?? []),
    ...example.knownFacts,
    ...example.missingFacts,
    ...(example.commandQualityShouldDo ?? []),
    ...(example.commandFailureShouldAvoid ?? []),
    ...example.responseFocus,
    ...example.consistencyRules,
    ...example.frameQualityNotes,
    ...example.tags,
  ].join(" ");
  const exampleTokens = new Set(getTextTokens(exampleText));

  let score = 0;

  for (const token of inputTokens) {
    if (exampleTokens.has(token)) {
      score += 2;
    }
  }

  if (/\b(explosion|explode|blast)\b/.test(normalizedInput) && example.tags.includes("explosion")) {
    score += 16;
  }

  if (
    /\b(explosion|explode|blast)\b/.test(normalizedInput) &&
    example.tags.includes("canonical-default") &&
    example.tags.includes("explosion")
  ) {
    score += 20;
  }

  if (/\b(lightning|bolt)\b/.test(normalizedInput) && example.tags.includes("lightning")) {
    score += 16;
  }

  if (
    /\b(lightning|bolt)\b/.test(normalizedInput) &&
    example.tags.includes("canonical-default") &&
    example.tags.includes("lightning")
  ) {
    score += 20;
  }

  if (/\b(fireball|projectile)\b/.test(normalizedInput) && example.tags.includes("fireball")) {
    score += 14;
  }

  if (/\b(ball|bounce|bouncing|contact frame)\b/.test(normalizedInput) && example.tags.includes("ball")) {
    score += 16;
  }

  if (
    /\b(ball|bounce|bouncing)\b/.test(normalizedInput) &&
    example.tags.includes("canonical-default") &&
    example.tags.includes("ball")
  ) {
    score += 20;
  }

  if (/\b(punch|kick|fight|sparring|combat|guard)\b/.test(normalizedInput) && example.tags.includes("combat")) {
    score += 16;
  }

  if (
    /\b(punch|fight|combat)\b/.test(normalizedInput) &&
    example.tags.includes("canonical-default") &&
    example.tags.includes("combat")
  ) {
    score += 20;
  }

  if (/\b(breath|breathing|breathless|tired|exhausted)\b/.test(normalizedInput) && example.tags.includes("breathing")) {
    score += 14;
  }

  if (/\b(forest|cave|neighborhood|mountain|rooftop|background)\b/.test(normalizedInput) && example.tags.includes("background")) {
    score += 12;
  }

  if (/\b(starting point|opening frame|setup frame)\b/.test(normalizedInput) && example.tags.includes("setup-scene")) {
    score += 18;
  }

  if (/\b(continue|same scene|keep the scene|current frame|current sequence|after this|after that|blue one|right stick figure|instead)\b/.test(normalizedInput) && example.tags.includes("continuation")) {
    score += 16;
  }

  if (/\b(make him bigger|which current subject)\b/.test(normalizedInput) && example.tags.includes("ambiguity")) {
    score += 20;
  }

  if (/\b(style of|combat gods)\b/.test(normalizedInput) && example.tags.includes("style-reference")) {
    score += 20;
  }

  if (example.exampleKind === "bad") {
    score -= 2;
  }

  return score;
};

const CANONICAL_SELECTION_RULES = [
  {
    pattern: /\b(explosion|explode|blast)\b/,
    requiredTags: ["canonical-default", "explosion"],
  },
  {
    pattern: /\b(lightning|bolt)\b/,
    requiredTags: ["canonical-default", "lightning"],
  },
  {
    pattern: /\b(ball|dot|circle)\b.*\b(bounce|bouncing|contact|rebound|dribble|settle|roll|rolling|fall|falling|drop)\b|\b(bounce|bouncing|contact|rebound|dribble|settle|roll|rolling|fall|falling|drop)\b.*\b(ball|dot|circle)\b/,
    requiredTags: ["canonical-default", "ball"],
  },
  {
    pattern: /\b(punch|fight|combat)\b/,
    requiredTags: ["canonical-default", "combat"],
  },
] as const;

const resolveExampleFamilies = (example: GenerateFramesExample): GenerateFramesIntentFamily[] => {
  const families = new Set<GenerateFramesIntentFamily>();
  const tags = new Set(example.tags);

  switch (example.familyType) {
    case "effect":
      families.add("effect");
      break;
    case "object":
      families.add("object");
      break;
    case "character":
      families.add("character");
      break;
    case "background":
      families.add("background");
      break;
    case "continuation":
      families.add("continuation");
      break;
    case "background-scroll":
      families.add("background");
      families.add("character");
      break;
    case "setup-scene":
      if (
        tags.has("character") ||
        tags.has("stick-figure") ||
        tags.has("combat") ||
        tags.has("punch") ||
        tags.has("walk") ||
        tags.has("run")
      ) {
        families.add("character");
      }
      if (
        tags.has("background") ||
        tags.has("forest") ||
        tags.has("cave") ||
        tags.has("neighborhood") ||
        tags.has("mountain") ||
        tags.has("rooftop")
      ) {
        families.add("background");
      }
      break;
    case "mixed":
      if (tags.has("character") || tags.has("combat") || tags.has("punch") || tags.has("run")) {
        families.add("character");
      }
      if (tags.has("effect") || tags.has("explosion") || tags.has("lightning") || tags.has("fireball")) {
        families.add("effect");
      }
      if (tags.has("background")) {
        families.add("background");
      }
      if (tags.has("object") || tags.has("ball") || tags.has("tree")) {
        families.add("object");
      }
      break;
  }

  if (families.size === 0) {
    if (tags.has("continuation")) families.add("continuation");
    if (tags.has("background")) families.add("background");
    if (tags.has("character")) families.add("character");
    if (tags.has("effect")) families.add("effect");
    if (tags.has("object")) families.add("object");
  }

  return [...families];
};

const exampleMatchesRuntimeAnalysis = (
  example: GenerateFramesExample,
  analysis: GenerateFramesRuntimeAnalysis,
) => {
  const families = resolveExampleFamilies(example);
  const isNeutralExpectationExample =
    families.length === 0 && (example.tags.includes("expectation-first") || example.tags.includes("canonical-default"));
  const excludesCharacter =
    analysis.excludedFamilies.includes("character") &&
    (families.includes("character") || example.tags.includes("character"));
  const excludesEffect =
    analysis.excludedFamilies.includes("effect") &&
    (families.includes("effect") || example.tags.includes("effect"));
  const excludesObject =
    analysis.excludedFamilies.includes("object") &&
    (families.includes("object") || example.tags.includes("object"));
  const excludesBackground =
    analysis.excludedFamilies.includes("background") &&
    (families.includes("background") || example.tags.includes("background"));

  if (excludesCharacter || excludesEffect || excludesObject || excludesBackground) {
    return false;
  }

  if (analysis.noPlanReason != null || (analysis.familyConfidence === "low" && analysis.concepts.length === 0)) {
    return isNeutralExpectationExample;
  }

  if (analysis.primaryFamily === "mixed") {
    return families.some((family) => analysis.componentFamilies.includes(family)) || isNeutralExpectationExample;
  }

  if (analysis.primaryFamily === "continuation") {
    return (
      families.includes("continuation") ||
      analysis.componentFamilies.some((family) => family !== "continuation" && families.includes(family)) ||
      isNeutralExpectationExample
    );
  }

  return families.includes(analysis.primaryFamily) || isNeutralExpectationExample;
};

const scoreExampleFamilyMatch = (
  example: GenerateFramesExample,
  analysis: GenerateFramesRuntimeAnalysis,
) => {
  if (analysis.noPlanReason != null || (analysis.familyConfidence === "low" && analysis.concepts.length === 0)) {
    return example.tags.includes("canonical-default") ? 2 : 0;
  }

  const families = resolveExampleFamilies(example);
  const concepts = analysis.concepts;
  let score = 0;

  if (analysis.primaryFamily === "mixed") {
    for (const family of analysis.componentFamilies) {
      if (families.includes(family)) {
        score += family === "effect" || family === "character" ? 32 : 26;
      }
    }
  } else if (analysis.primaryFamily === "continuation") {
    if (families.includes("continuation")) {
      score += 28;
    }

    for (const family of analysis.componentFamilies) {
      if (family !== "continuation" && families.includes(family)) {
        score += 34;
      }
    }
  } else if (families.includes(analysis.primaryFamily)) {
    score += 40;
  }

  if (concepts.includes("explosion") && example.tags.includes("explosion")) score += 18;
  if (concepts.includes("lightning") && example.tags.includes("lightning")) score += 18;
  if ((concepts.includes("bouncing-ball") || concepts.includes("rolling-ball")) && example.tags.includes("ball")) score += 18;
  if (concepts.includes("punch") && (example.tags.includes("punch") || example.tags.includes("combat"))) score += 18;
  return score;
};

export const GENERATE_FRAMES_LLM_TRAINING_EXAMPLES = [
  ...GOOD_TRAINING_EXAMPLES,
  ...BAD_TRAINING_EXAMPLES,
];

const GENERATE_FRAMES_EXPECTATION_POLICY = [
  "Expectation-first rule: interpret the request through normal human motion expectations before deciding any command details.",
  "Before preparing output, map the request to a known motion or effect pattern and then define engine commands from that pattern.",
  "Do not work blindly. For common requests, start from the expected default version and then prepare commands.",
  "Explosion defaults: hot orange-red-yellow blast, impact first, fast expansion, glow or energy, smoke or debris after, never random blobs.",
  "Ball-bounce defaults: keep the ball round, centered bounce stays vertical, only a small squash on impact, never morph into other shapes.",
  "Punch defaults: clear anticipation, contact, and follow-through with visible force direction.",
  "Lightning defaults: bright, sharp, glowing, and fast.",
  "Every step should map to an action type with durationFrames, intensity, timing, and spacing.",
  "Do not ask dumb questions about obvious defaults like explosion color, whether the ball should stay round, or whether a normal punch needs force direction.",
  "Only ask a question when a real execution gap remains after applying these defaults.",
  "If still unclear, fall back to known real-world behavior instead of random or experimental shapes.",
] as const;

export const buildGenerateFramesTrainingAnalysisInput = ({
  userMessage,
  conversationHistory = [],
}: {
  userMessage: string;
  conversationHistory?: DrawingAiConversationMessage[];
}) => {
  const trimmedHistory = conversationHistory
    .map((message) => `${message.role}: ${message.content.trim()}`)
    .filter((line) => line.trim().length > 0)
    .slice(-6);

  return [userMessage.trim(), ...trimmedHistory].filter(Boolean).join("\n");
};

export const selectRelevantGenerateFramesExamples = ({
  examples = GENERATE_FRAMES_LLM_TRAINING_EXAMPLES,
  userMessage,
  analysisInput,
  limit = 6,
  runtimeAnalysis,
}: {
  examples?: GenerateFramesExample[];
  userMessage: string;
  analysisInput: string;
  limit?: number;
  runtimeAnalysis?: GenerateFramesRuntimeAnalysis;
}) => {
  const normalizedInput = normalizeTrainingText(`${userMessage}\n${analysisInput}`);
  const analysis =
    runtimeAnalysis ??
    analyzeGenerateFramesRequest({
      userMessage,
      conversationHistory: [{ role: "user", content: analysisInput }],
      workspaceContext: null,
    });

  const ranked = examples
    .filter((example) => exampleMatchesRuntimeAnalysis(example, analysis))
    .map((example) => ({
      example,
      score:
        scoreExample({
          example,
          userMessage,
          analysisInput,
        }) + scoreExampleFamilyMatch(example, analysis),
    }))
    .filter(({ score }) => score > 0)
    .sort((left, right) => right.score - left.score);

  const goodRanked = ranked
    .filter(({ example }) => example.exampleKind === "good")
    .filter(({ example }) => !(example.shouldAskQuestion && analysis.questionGate.shouldProceedWithoutQuestion));
  const badRanked = ranked.filter(({ example }) => example.exampleKind === "bad");

  const selected: GenerateFramesExample[] = [];
  const selectedIds = new Set<string>();
  const seenCategories = new Set<string>();

  const pushIfAvailable = (example: GenerateFramesExample | undefined) => {
    if (!example || selected.length >= limit || selectedIds.has(example.id)) {
      return;
    }
    selected.push(example);
    selectedIds.add(example.id);
    seenCategories.add(example.category);
  };

  for (const rule of CANONICAL_SELECTION_RULES) {
    if (!rule.pattern.test(normalizedInput) || selected.length >= limit) {
      continue;
    }

    const canonicalMatch = goodRanked.find(({ example }) =>
      rule.requiredTags.every((tag) => example.tags.includes(tag)),
    );
    pushIfAvailable(canonicalMatch?.example);
  }

  const familyMatchedGood = goodRanked.find(({ example }) => {
    const families = resolveExampleFamilies(example);
    if (analysis.primaryFamily === "mixed") {
      return analysis.componentFamilies.some((family) => families.includes(family));
    }
    if (analysis.primaryFamily === "continuation") {
      return families.includes("continuation");
    }
    return families.includes(analysis.primaryFamily);
  });
  pushIfAvailable(familyMatchedGood?.example);

  const contextExample = goodRanked.find(({ example }) => {
    if (analysis.primaryFamily === "continuation") {
      return example.familyType === "continuation";
    }
    if (/\b(starting point|opening frame|setup frame)\b/.test(normalizedInput)) {
      return example.familyType === "setup-scene";
    }
    if (/\b(background movement|background scroll|camera follow|camera-follow)\b/.test(normalizedInput)) {
      return example.familyType === "background-scroll";
    }
    return false;
  });
  pushIfAvailable(contextExample?.example);

  for (const { example } of goodRanked) {
    if (selected.length >= Math.max(0, limit - 1)) {
      break;
    }
    if (selectedIds.has(example.id)) {
      continue;
    }
    const allowRepeatedCategory = example.familyType === "mixed" || example.familyType === "object";
    if (!allowRepeatedCategory && seenCategories.has(example.category)) {
      continue;
    }
    pushIfAvailable(example);
  }

  pushIfAvailable(badRanked[0]?.example);

  for (const { example } of goodRanked) {
    if (selected.length >= limit) {
      break;
    }
    pushIfAvailable(example);
  }

  return selected.slice(0, limit);
};

const formatQuestionPolicy = (example: GenerateFramesExample) => {
  if (example.shouldProceedWithoutQuestion) {
    return "proceed without question";
  }
  if (example.shouldAskQuestion) {
    const options =
      example.acceptableOptions.length > 0 ? ` (options: ${example.acceptableOptions.join(" | ")})` : "";
    return `ask exactly one question: ${example.bestQuestion ?? "clarify the missing target"}${options}`;
  }
  if (example.thinkingIntent.ambiguityPolicy === "controlled-fail") {
    return "controlled-fail instead of guessing";
  }
  return "no extra question";
};

export const formatGenerateFramesExamplesForPrompt = (examples: GenerateFramesExample[]) =>
  [
    "Generate Frames Engine Command Director Policy:",
    ...GENERATE_FRAMES_EXPECTATION_POLICY.map((line) => `- ${line}`),
    "",
    examples
      .map((example, index) => {
        const commandPlan = formatAnimationPlanAsEngineCommands(example.animationPlan);
        const lines = [
          `Example ${index + 1} [${example.exampleKind === "good" ? "TARGET" : "FAILURE"}]: ${example.category}`,
          `User prompt: ${example.userPrompt}`,
          `Command objective: ${normalizeCommandDirectiveText(example.requestSummary) || "(none)"}`,
          `Command family: ${example.familyType}`,
          `Request mode: ${example.thinkingIntent.requestMode}`,
          `Interpretation locks: ${formatCommandRuleList(example.thinkingIntent.interpretation).join(" | ") || "(none)"}`,
          `Expectation locks: ${formatCommandRuleList(example.thinkingIntent.humanExpectation).join(" | ") || "(none)"}`,
          `Search policy: ${example.thinkingIntent.searchPolicy}`,
          `Ambiguity policy: ${example.thinkingIntent.ambiguityPolicy}`,
          `Command plan: ${commandPlan}`,
          `Command quality targets: ${formatCommandRuleList(example.commandQualityTargets).join(" | ") || "(none)"}`,
          `Command failure patterns: ${formatCommandRuleList(example.commandFailurePatterns).join(" | ") || "(none)"}`,
          `Constraints: ${formatCommandRuleList(example.constraints).join(" | ") || "(none)"}`,
          `Question policy: ${formatQuestionPolicy(example)}`,
        ];
        return lines.join("\n");
      })
      .join("\n\n"),
  ].join("\n");
