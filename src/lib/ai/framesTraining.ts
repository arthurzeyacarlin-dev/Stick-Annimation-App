import type { DrawingAiConversationMessage } from "./drawingAiContract";

export type GenerateFramesExample = {
  id: string;
  mode: "generate-frames";
  category: string;
  userPrompt: string;
  requestSummary: string;
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

type ExampleInput = Omit<
  GenerateFramesExample,
  | "mode"
  | "version"
  | "isActive"
  | "maxQuestionsBeforeProceeding"
  | "responseFocus"
  | "consistencyRules"
  | "frameQualityNotes"
  | "badStyleNotes"
> &
  Partial<
    Pick<
      GenerateFramesExample,
      "maxQuestionsBeforeProceeding" | "responseFocus" | "consistencyRules" | "frameQualityNotes" | "badStyleNotes"
    >
  >;

const TRAINING_VERSION = 1;
const DEFAULT_MAX_QUESTIONS = 2;

const COMMON_FRAME_QUALITY_NOTES = [
  "Define a high-contrast silhouette and explicit pose direction.",
  "When motion is present, think in ordered beats: starting pose, anticipation if needed, main action, follow-through, and recovery.",
  "For punch steps, default to anticipation, contact, follow-through, and recovery unless the user narrows the insert.",
  "For jump steps, default to crouch, launch, peak, land, and settle unless the user narrows the insert.",
  "Express motion beats as engine-ready action steps with action type, durationFrames, intensity, timing, and spacing.",
  "Keep the action command explicit at a glance.",
  "Preserve character identity and proportions unless the request changes them.",
  "Set weight, spacing, and timing so the executed step stays deterministic.",
  "Make the step easy for the engine to transition into and out of the surrounding poses.",
] as const;

const COMMON_BAD_STYLE_NOTES = [
  "Do not ask generic filler like 'What happens next?'",
  "Do not lose the action intent while trying to improve the frame.",
  "Do not change the character design when the request is only about pose or expression.",
  "Do not make the pose stiff, symmetrical, or ambiguous in action direction.",
  "Do not answer with vague art advice, story prose, or physics-simulation language that ignores the actual command request.",
] as const;

const COMMON_CONSISTENCY_RULES = [
  "Preserve the same character identity unless the user explicitly asks for a redesign.",
  "Preserve pose intent while keeping action direction explicit.",
  "Preserve proportions, limb length, and overall build from frame to frame.",
  "Preserve timing, spacing, and beat order from frame to frame.",
  "If the user says add, continue, or next, preserve the current scene and extend the current sequence instead of restarting it.",
] as const;

const toCommandRuleText = (value: string) =>
  value
    .trim()
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

const createExample = (input: ExampleInput): GenerateFramesExample => ({
  ...input,
  requestSummary: normalizeCommandDirectiveText(input.requestSummary),
  knownFacts: normalizeCommandDirectiveList(input.knownFacts),
  missingFacts: normalizeCommandDirectiveList(input.missingFacts),
  strongestGap: normalizeCommandDirectiveText(input.strongestGap),
  reasoning: normalizeCommandDirectiveText(input.reasoning),
  responseFocus: normalizeCommandDirectiveList(input.responseFocus ?? []),
  consistencyRules: normalizeCommandDirectiveList(input.consistencyRules ?? [...COMMON_CONSISTENCY_RULES]),
  frameQualityNotes: normalizeCommandDirectiveList(input.frameQualityNotes ?? [...COMMON_FRAME_QUALITY_NOTES]),
  badStyleNotes: normalizeCommandDirectiveList(input.badStyleNotes ?? [...COMMON_BAD_STYLE_NOTES]),
  mode: "generate-frames",
  maxQuestionsBeforeProceeding: Math.min(
    input.maxQuestionsBeforeProceeding ?? (input.shouldAskQuestion ? DEFAULT_MAX_QUESTIONS : 0),
    10,
  ),
  version: TRAINING_VERSION,
  isActive: true,
});

const createProceedExample = (
  input: Omit<ExampleInput, "shouldAskQuestion" | "shouldProceedWithoutQuestion" | "bestQuestion" | "acceptableOptions"> & {
    bestQuestion?: string | null;
    acceptableOptions?: string[];
  },
) =>
  createExample({
    ...input,
    shouldAskQuestion: false,
    shouldProceedWithoutQuestion: true,
    bestQuestion: input.bestQuestion ?? null,
    acceptableOptions: input.acceptableOptions ?? [],
    maxQuestionsBeforeProceeding: 0,
  });

const createQuestionExample = (
  input: Omit<ExampleInput, "shouldAskQuestion" | "shouldProceedWithoutQuestion"> & {
    bestQuestion: string;
  },
) =>
  createExample({
    ...input,
    shouldAskQuestion: true,
    shouldProceedWithoutQuestion: false,
    maxQuestionsBeforeProceeding: input.maxQuestionsBeforeProceeding ?? 1,
  });

const FRAME_EXAMPLES: GenerateFramesExample[] = [
  createProceedExample({
    id: "sprint-start-lean-forward",
    category: "pose-adjustment",
    userPrompt: "Set up a black stick figure in a sprint-start pose with a forward lean and one arm back.",
    requestSummary: "Sprint-start pose adjustment command.",
    knownFacts: [
      "The character is a black stick figure.",
      "The pose should lean forward.",
      "One arm is pulled back like a sprint start.",
    ],
    missingFacts: [],
    strongestGap: "",
    badQuestions: ["What happens next?", "Who is the character?"],
    reasoning: "The pose intent is already clear enough to proceed without slowing the user down.",
    responseFocus: [
      "Keep the starting pose loaded and forward-pitched instead of neutral.",
      "Use the back arm and leg as the anticipation beat before launch.",
      "Make the body read as ready to explode into motion without restarting the sequence.",
    ],
    tags: ["pose-adjustment", "sprint", "lean", "anticipation", "clear-request"],
  }),
  createProceedExample({
    id: "next-frame-jump-higher",
    category: "next-frame",
    userPrompt: "Make the next jump beat higher.",
    requestSummary: "Next-frame jump-height adjustment command.",
    knownFacts: [
      "The user wants the next frame in a jump.",
      "The character should be higher than the current frame.",
    ],
    missingFacts: [],
    strongestGap: "",
    badQuestions: ["What happens next?", "Do you want a different character?"],
    reasoning: "The user already defined the action change: the next frame should rise higher.",
    responseFocus: [
      "Keep the jump path intact and move the pose higher in the same arc.",
      "Let the airtime beat feel lighter and farther from the takeoff pose.",
      "Leave the landing and recovery for the following frames instead of folding them in here.",
    ],
    tags: ["next-frame", "jump", "arc", "motion-clarity", "clear-request"],
  }),
  createProceedExample({
    id: "expression-shocked-same-character",
    category: "expression-change",
    userPrompt: "Keep the same character but make his face read shocked.",
    requestSummary: "Expression-only reaction adjustment command.",
    knownFacts: [
      "The character should stay the same.",
      "The requested change is only the facial expression.",
      "The new emotion is shock.",
    ],
    missingFacts: [],
    strongestGap: "",
    badQuestions: ["What does he find?", "Should I change the pose too?"],
    reasoning: "The identity lock and emotion target are both already explicit.",
    responseFocus: [
      "Keep the body pose mostly stable so the shock read stays focused.",
      "Let the face deliver the reaction with a sharp anticipation-to-hit shift.",
      "Hold the character identity steady so the emotional beat lands cleanly.",
    ],
    tags: ["expression-change", "shocked", "character-consistency", "clear-request"],
  }),
  createProceedExample({
    id: "inbetween-punch-windup-hit",
    category: "inbetween-frame",
    userPrompt: "Define the in-between command step between the punch wind-up and the hit.",
    requestSummary: "In-between punch transition command.",
    knownFacts: [
      "This is an in-between frame.",
      "The action is a punch moving from wind-up toward impact.",
    ],
    missingFacts: [],
    strongestGap: "",
    badQuestions: ["What happens next?", "Which character wins?"],
    reasoning: "The two surrounding poses and the intent of the in-between are already defined.",
    responseFocus: [
      "Keep the loaded wind-up readable while the torso starts to turn into the strike.",
      "Let the fist travel forward halfway so the hit still feels coming next.",
      "Hold back the full contact and recoil so this frame stays a true transition beat.",
    ],
    tags: ["inbetween-frame", "punch", "transition-pose", "fight", "clear-request"],
  }),
  createQuestionExample({
    id: "cleanup-rough-pose-missing-pose-description",
    category: "pose-cleanup",
    userPrompt: "Refine this rough pose without changing the pose idea.",
    requestSummary: "Clarification question for missing pose beat.",
    knownFacts: [
      "The user wants cleanup, not a redesign.",
      "The pose idea should stay the same.",
    ],
    missingFacts: ["What the current pose is actually doing."],
    strongestGap: "What the current pose is actually doing.",
    bestQuestion: "What beat is the rough pose meant to communicate?",
    acceptableOptions: ["Running", "Punching", "Landing", "Recoiling"],
    badQuestions: ["What happens next?", "Do you want a different style?"],
    reasoning: "In text-only mode the assistant cannot see the rough pose, so one beat-description question is the real missing detail.",
    responseFocus: ["Once the beat is described, preserve the action while cleaning lines and improving readability."],
    tags: ["pose-cleanup", "rough-pose", "question-needed", "text-only-visibility"],
  }),
  createProceedExample({
    id: "raise-left-arm-turn-head-door",
    category: "hand-arm-adjustment",
    userPrompt: "Raise the left arm and turn the head toward the door.",
    requestSummary: "Upper-body reaction adjustment command.",
    knownFacts: [
      "The left arm needs to raise.",
      "The head should turn toward the door.",
    ],
    missingFacts: [],
    strongestGap: "",
    badQuestions: ["What happens next?", "What does he find?"],
    reasoning: "The requested pose change is direct and specific enough to act on immediately.",
    responseFocus: [
      "Keep the starting pose balanced while the head turns toward the door.",
      "Use the left arm as the main reaction beat instead of changing the whole body plan.",
      "Leave the recovery shape stable so the pose still feels grounded.",
    ],
    tags: ["hand-arm-adjustment", "head-turn", "reaction", "clear-request"],
  }),
  createProceedExample({
    id: "tired-expression-same-pose",
    category: "expression-change",
    userPrompt: "Make him look more tired without changing the pose too much.",
    requestSummary: "Tiredness expression adjustment command.",
    knownFacts: [
      "The user wants the same general pose.",
      "The emotional change is tiredness.",
    ],
    missingFacts: [],
    strongestGap: "",
    badQuestions: ["What happens next?", "Should he start running?"],
    reasoning: "The request is a contained performance change, not a new staging problem.",
    responseFocus: [
      "Keep the starting pose mostly intact and let the fatigue show through smaller drops.",
      "Use the face and shoulders as the tiredness beat instead of rebuilding the action.",
      "Hold the recovery calm and subdued so the pose still reads as the same character.",
    ],
    tags: ["expression-change", "tired", "same-pose", "subtle-adjustment"],
  }),
  createProceedExample({
    id: "anticipation-before-kick",
    category: "anticipation-frame",
    userPrompt: "Add anticipation before the kick.",
    requestSummary: "Pre-kick anticipation command.",
    knownFacts: [
      "The action is a kick.",
      "The user wants the anticipation frame before it.",
    ],
    missingFacts: [],
    strongestGap: "",
    badQuestions: ["What happens next?", "Who wins the fight?"],
    reasoning: "The requested beat is clear: the motion needs a setup frame before the kick.",
    responseFocus: [
      "Hold the starting pose in a loaded stance before the strike.",
      "Shift weight onto the support leg and pull the kicking leg back for the anticipation beat.",
      "Wind the torso and arms so the main kick feels earned and the later recovery has room to breathe.",
    ],
    tags: ["anticipation-frame", "kick", "action-clarity", "fight", "clear-request"],
  }),
  createQuestionExample({
    id: "action-read-unclear-missing-action",
    category: "action-clarity",
    userPrompt: "Make the action read more clearly.",
    requestSummary: "Clarification question for missing action beat.",
    knownFacts: ["The current action is not reading clearly enough."],
    missingFacts: ["What action or emotion the frame is supposed to communicate."],
    strongestGap: "What action or emotion the frame is supposed to communicate.",
    bestQuestion: "What beat should this frame read as?",
    acceptableOptions: ["Starting pose", "Anticipation", "Main action", "Recovery"],
    badQuestions: ["What happens next?", "Should I make it cooler?"],
    reasoning: "Without knowing the intended action, readability advice would drift or become generic.",
    responseFocus: ["After the user names the beat, strengthen the silhouette and weight shifts around that exact intent."],
    tags: ["action-clarity", "question-needed", "text-only-visibility", "too-vague"],
  }),
  createQuestionExample({
    id: "stiff-frame-fix-missing-intent",
    category: "pose-adjustment",
    userPrompt: "This frame feels stiff. Fix it.",
    requestSummary: "Clarification question for missing pose intent.",
    knownFacts: ["The current frame feels stiff to the user."],
    missingFacts: ["What the frame is trying to communicate."],
    strongestGap: "What the frame is trying to communicate.",
    bestQuestion: "What beat is this frame supposed to be?",
    acceptableOptions: ["Starting pose", "Anticipation", "Main action", "Recovery"],
    badQuestions: ["What happens next?", "What do you find?"],
    reasoning: "Stiffness can only be fixed well once the intended action or emotion is known.",
    responseFocus: ["Once the intent is clear, improve the line of action, asymmetry, and weight placement instead of changing the idea."],
    tags: ["pose-adjustment", "stiff", "question-needed", "too-vague"],
  }),
  createProceedExample({
    id: "silhouette-stronger",
    category: "silhouette-fix",
    userPrompt: "Make the silhouette stronger.",
    requestSummary: "Silhouette separation adjustment command.",
    knownFacts: ["The user wants better silhouette readability."],
    missingFacts: [],
    strongestGap: "",
    badQuestions: ["What happens next?", "Should I change the whole character?"],
    reasoning: "Silhouette strengthening is a direct readability task that can move forward without another question.",
    responseFocus: [
      "Separate overlapping limbs so the starting pose or action beat reads from a distance.",
      "Push the main line of action and keep the pose asymmetrical.",
      "Remove noisy overlaps that flatten the body shape or hide the motion direction.",
    ],
    tags: ["silhouette-fix", "readability", "cleanup", "clear-request"],
  }),
  createProceedExample({
    id: "landing-frame-after-jump",
    category: "landing-pose",
    userPrompt: "Define the landing step after this jump.",
    requestSummary: "Landing impact-and-recovery command.",
    knownFacts: [
      "The current action is a jump.",
      "The requested new frame is the landing after it.",
    ],
    missingFacts: [],
    strongestGap: "",
    badQuestions: ["What happens next?", "Should the character become angry?"],
    reasoning: "The action relationship is clear enough: airborne jump into landing.",
    responseFocus: [
      "Keep the airborne setup implied in the previous beat and land into a compressed impact pose.",
      "Let the torso and arms absorb the drop so the landing feels earned, not frozen.",
      "Leave a clean recovery shape so the jump reads as complete instead of stopping at contact.",
    ],
    tags: ["landing-pose", "jump", "next-frame", "impact", "clear-request"],
  }),
  createProceedExample({
    id: "pose-more-dramatic",
    category: "pose-adjustment",
    userPrompt: "Make the pose more dramatic.",
    requestSummary: "Dramatic pose adjustment command.",
    knownFacts: ["The user wants a more dramatic version of the pose."],
    missingFacts: [],
    strongestGap: "",
    badQuestions: ["What happens next?", "Should I restart the whole scene?"],
    reasoning: "The request is broad but still actionable as a pose-push note rather than a clarification loop.",
    responseFocus: [
      "Exaggerate the line of action and the contrast between the active side and the trailing side.",
      "Use stronger tilt, reach, or compression so the main action lands faster.",
      "Keep the original pose idea but raise impact intensity and timing contrast.",
    ],
    tags: ["pose-adjustment", "dramatic", "dynamic", "cinematic", "clear-request"],
  }),
  createProceedExample({
    id: "follow-through-next-frame",
    category: "next-frame",
    userPrompt: "Create the next frame where the body follows through.",
    requestSummary: "Follow-through next-frame command.",
    knownFacts: ["The user wants the follow-through frame next."],
    missingFacts: [],
    strongestGap: "",
    badQuestions: ["What happens next?", "Which character is this?"],
    reasoning: "The frame role is already clear: the next beat is follow-through.",
    responseFocus: [
      "Let the leading action overshoot while the rest of the body catches up.",
      "Use drag in the limbs and torso so the motion does not stop abruptly.",
      "Keep it later than the main action but before the recovery beat.",
    ],
    tags: ["next-frame", "follow-through", "motion-clarity", "clear-request"],
  }),
  createProceedExample({
    id: "open-hand-adjustment",
    category: "hand-adjustment",
    userPrompt: "Make the hand open.",
    requestSummary: "Hand-state adjustment command.",
    knownFacts: ["The requested change is the hand shape opening."],
    missingFacts: [],
    strongestGap: "",
    badQuestions: ["What happens next?", "Should the whole pose change?"],
    reasoning: "This is a simple local pose adjustment with enough information already present.",
    responseFocus: [
      "Keep the arm action consistent while the hand changes state.",
      "Spread the fingers or implied stick-hand shape so the open hand reads instantly.",
      "Avoid changing the body unless the hand needs a tiny supporting adjustment.",
    ],
    tags: ["hand-adjustment", "pose-adjustment", "clear-request"],
  }),
  createProceedExample({
    id: "body-twist-punch-more",
    category: "body-twist",
    userPrompt: "Make the body twist more.",
    requestSummary: "Torso-rotation force adjustment command.",
    knownFacts: ["The user wants more body twist in the pose."],
    missingFacts: [],
    strongestGap: "",
    badQuestions: ["What happens next?", "Do you want a different character?"],
    reasoning: "This is a direct power-and-clarity adjustment, not a missing-story problem.",
    responseFocus: [
      "Rotate the shoulders and hips against each other to add torque.",
      "Keep the twist readable in silhouette instead of tangling the limbs.",
      "Use the twist to support the action beat, not as decoration.",
    ],
    tags: ["body-twist", "pose-adjustment", "action-clarity", "clear-request"],
  }),
  createProceedExample({
    id: "run-cycle-clearer",
    category: "run-cycle style request",
    userPrompt: "Make this a clearer running pose.",
    requestSummary: "Running-pose conversion command.",
    knownFacts: ["The desired action is running."],
    missingFacts: [],
    strongestGap: "",
    badQuestions: ["What happens next?", "What object does he find?"],
    reasoning: "The requested action is simple and direct enough to proceed right away.",
    responseFocus: [
      "Use opposing arm-leg motion and a stronger forward lean.",
      "Place the contact or passing beat so the run reads instantly instead of like walking.",
      "Add stride asymmetry and body angle so the frame feels fast, not posed.",
    ],
    tags: ["run-cycle", "pose-adjustment", "motion-clarity", "clear-request"],
  }),
  createQuestionExample({
    id: "character-cleanup-missing-traits",
    category: "character-cleanup",
    userPrompt: "Refine this character while keeping the same traits.",
    requestSummary: "Clarification question for missing character-trait lock.",
    knownFacts: ["The user wants a cleaner version of the same character."],
    missingFacts: ["What traits must stay the same."],
    strongestGap: "What traits must stay the same.",
    bestQuestion: "What key traits need to stay exactly the same?",
    acceptableOptions: ["Hair shape", "Body proportions", "Face marks", "Clothing silhouette"],
    badQuestions: ["What happens next?", "Do you want to restart the whole scene?"],
    reasoning: "Character consistency needs one specific lock before cleanup guidance can stay on-model.",
    responseFocus: ["Once those traits are named, clean the pose and silhouette without drifting into a redesign."],
    tags: ["character-cleanup", "question-needed", "text-only-visibility"],
  }),
  createProceedExample({
    id: "same-character-new-pose",
    category: "character-consistency",
    userPrompt: "Keep the same character but change the pose so he looks ready to fight.",
    requestSummary: "Fight-ready stance adjustment command.",
    knownFacts: [
      "The character should stay the same.",
      "The new pose should look ready to fight.",
    ],
    missingFacts: [],
    strongestGap: "",
    badQuestions: ["What happens next?", "Who wins?"],
    reasoning: "The identity lock and new pose goal are already supplied.",
    responseFocus: [
      "Preserve the same proportions and recognizable traits.",
      "Move into a ready stance with clear balance, guard placement, and direction.",
      "Keep the pose tense and readable so the next fight beat can build cleanly.",
    ],
    tags: ["character-consistency", "pose-adjustment", "fight", "clear-request"],
  }),
  createProceedExample({
    id: "emotional-pose-sad-determined",
    category: "emotional pose",
    userPrompt: "Make him look sad but determined.",
    requestSummary: "Mixed-emotion performance adjustment command.",
    knownFacts: ["The pose needs a mixed emotion: sad but determined."],
    missingFacts: [],
    strongestGap: "",
    badQuestions: ["What happens next?", "Should he start smiling?"],
    reasoning: "The emotional target is clear enough to shape the frame without needing more story details.",
    responseFocus: [
      "Let the starting pose lean into sadness through the head and shoulders.",
      "Keep a stable stance underneath so the determination reads as the recovery beat.",
      "Make the emotional contrast feel specific and human, not neutral or melodramatic.",
    ],
    tags: ["emotional-pose", "sad", "determined", "performance", "clear-request"],
  }),
  createQuestionExample({
    id: "impact-frame-missing-direction",
    category: "impact-frame",
    userPrompt: "Make an impact beat here.",
    requestSummary: "Clarification question for missing impact direction.",
    knownFacts: ["The requested frame is an impact beat."],
    missingFacts: ["What direction the impact is coming from."],
    strongestGap: "What direction the impact is coming from.",
    bestQuestion: "Which direction is the impact coming from?",
    acceptableOptions: ["Left", "Right", "Front", "Above"],
    badQuestions: ["What happens next?", "Who wins the story?"],
    reasoning: "Impact posing depends on direction; one sharp question is enough to prevent a generic result.",
    responseFocus: ["After direction is known, push the recoil, line of force, and recovery around that vector."],
    tags: ["impact-frame", "question-needed", "fight", "motion-direction"],
  }),
  createProceedExample({
    id: "head-turn-toward-door",
    category: "head turn",
    userPrompt: "Turn the head toward the door.",
    requestSummary: "Head-turn direction adjustment command.",
    knownFacts: ["The head should turn toward the door."],
    missingFacts: [],
    strongestGap: "",
    badQuestions: ["What happens next?", "What does he find?"],
    reasoning: "This is a specific directional adjustment with enough detail to proceed.",
    responseFocus: [
      "Keep the body mostly stable while the head and gaze turn toward the door.",
      "Add only a tiny shoulder support if it helps the look direction read faster.",
      "Hold the rest of the pose steady so the reaction stays clear.",
    ],
    tags: ["head-turn", "pose-adjustment", "reaction", "clear-request"],
  }),
  createQuestionExample({
    id: "make-better-vague-choice",
    category: "too-vague request needing one smart question",
    userPrompt: "Make this better.",
    requestSummary: "Clarification question for missing improvement target.",
    knownFacts: ["The user wants improvement."],
    missingFacts: ["What kind of improvement matters most."],
    strongestGap: "What kind of improvement matters most.",
    bestQuestion: "What should improve most: the pose, the timing, or the cleanup?",
    acceptableOptions: ["Pose", "Timing", "Cleanup"],
    badQuestions: ["What happens next?", "Can you explain more?"],
    reasoning: "One constrained question is better than generic guessing because the request has no concrete frame target yet.",
    responseFocus: ["Once the user chooses a focus, stay locked on that one area and do not drift."],
    tags: ["too-vague", "question-needed", "single-smart-question"],
  }),
  createProceedExample({
    id: "fully-clear-between-poses",
    category: "fully clear request that should not ask questions",
    userPrompt: "Define a new command step between these two poses so the character is halfway through turning and the arm is already starting to rise.",
    requestSummary: "Precise in-between transition command.",
    knownFacts: [
      "This is a new frame between two existing poses.",
      "The body is halfway through a turn.",
      "The arm should already be starting to rise.",
    ],
    missingFacts: [],
    strongestGap: "",
    badQuestions: ["What happens next?", "Which character wins?"],
    reasoning: "The user already described the transition target clearly enough, so asking would just slow the workflow down.",
    responseFocus: [
      "Blend the rotation and the arm lift into a clean halfway pose.",
      "Keep the frame transitional, not static or fully finished in either direction.",
      "Make the body mechanics readable so the next pose feels inevitable.",
    ],
    tags: ["fully-clear", "inbetween-frame", "transition-pose", "clear-request"],
  }),
];

const VAGUE_PATTERN = /\bthis\b.*\b(frame|pose|drawing)\b|\bmake this better\b|\bfix it\b|\bclean it up\b/i;
const NEXT_FRAME_PATTERN = /\bnext frame\b|\bfollow through\b|\bafter this\b/i;
const CONTINUATION_PATTERN = /\b(continue|continuing|after that|next beat|extend)\b/i;
const INBETWEEN_PATTERN = /\bin[- ]between\b|\bbetween these two poses\b|\btransition pose\b/i;
const EXPRESSION_PATTERN = /\bangry\b|\bshocked\b|\bsad\b|\bdetermined\b|\bscared\b|\btired\b|\bface\b|\bexpression\b/i;
const CLEANUP_PATTERN = /\bclean(?:er|up)?\b|\bredraw\b|\brough pose\b|\bstiff\b/i;
const POSE_PATTERN = /\bpose\b|\blean\b|\barm\b|\bhead\b|\bhand\b|\btwist\b|\bcrouch\b|\bjump\b|\brun\b|\bland\b/i;
const ACTION_PATTERN = /\baction\b|\bkick\b|\bpunch\b|\bimpact\b|\banticipation\b|\bfollow[- ]through\b|\bsilhouette\b/i;
const CHARACTER_PATTERN = /\bsame character\b|\bcharacter\b|\bproportions\b|\btraits\b/i;

const tokenize = (value: string) =>
  value
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 3);

const buildLookupInput = ({
  userMessage,
  analysisInput,
}: {
  userMessage: string;
  analysisInput: string;
}) => {
  const normalized = `${userMessage}\n${analysisInput}`.trim().toLowerCase();
  return {
    normalized,
    tokens: new Set(tokenize(normalized)),
  };
};

const scoreTagOverlap = (example: GenerateFramesExample, tokens: Set<string>) => {
  const searchableTokens = new Set(
    tokenize(
      [
        example.category,
        example.userPrompt,
        example.requestSummary,
        example.tags.join(" "),
        example.responseFocus.join(" "),
        example.consistencyRules.join(" "),
      ].join(" "),
    ),
  );

  let overlap = 0;
  for (const token of tokens) {
    if (searchableTokens.has(token)) {
      overlap += 1;
    }
  }

  return overlap;
};

const scoreExample = ({
  example,
  userMessage,
  analysisInput,
}: {
  example: GenerateFramesExample;
  userMessage: string;
  analysisInput: string;
}) => {
  const signals = buildLookupInput({ userMessage, analysisInput });
  let score = scoreTagOverlap(example, signals.tokens);

  if (NEXT_FRAME_PATTERN.test(signals.normalized) && example.tags.includes("next-frame")) {
    score += 10;
  }

  if (
    CONTINUATION_PATTERN.test(signals.normalized) &&
    (example.tags.includes("next-frame") ||
      example.tags.includes("inbetween-frame") ||
      example.tags.includes("anticipation-frame") ||
      example.tags.includes("landing-pose") ||
      example.tags.includes("transition-pose"))
  ) {
    score += 8;
  }

  if (INBETWEEN_PATTERN.test(signals.normalized) && example.tags.includes("inbetween-frame")) {
    score += 12;
  }

  if (EXPRESSION_PATTERN.test(signals.normalized) && example.tags.includes("expression-change")) {
    score += 10;
  }

  if (
    CLEANUP_PATTERN.test(signals.normalized) &&
    (example.tags.includes("pose-cleanup") || example.tags.includes("character-cleanup") || example.tags.includes("stiff"))
  ) {
    score += 10;
  }

  if (POSE_PATTERN.test(signals.normalized) && example.tags.includes("pose-adjustment")) {
    score += 8;
  }

  if (ACTION_PATTERN.test(signals.normalized) && (example.tags.includes("action-clarity") || example.tags.includes("fight"))) {
    score += 8;
  }

  if (CHARACTER_PATTERN.test(signals.normalized) && example.tags.includes("character-consistency")) {
    score += 10;
  }

  if (VAGUE_PATTERN.test(signals.normalized) && example.shouldAskQuestion) {
    score += 12;
  }

  if (/\bsilhouette\b/.test(signals.normalized) && example.category === "silhouette-fix") {
    score += 10;
  }

  if (/\banticipation\b/.test(signals.normalized) && example.category === "anticipation-frame") {
    score += 10;
  }

  if (/\bimpact\b|\bhit\b/.test(signals.normalized) && example.category === "impact-frame") {
    score += 10;
  }

  if (/\blanding\b/.test(signals.normalized) && example.category === "landing-pose") {
    score += 10;
  }

  if (/\brun(?:ning)?\b/.test(signals.normalized) && example.tags.includes("run-cycle")) {
    score += 10;
  }

  if (/\bshock(?:ed)?\b/.test(signals.normalized) && example.tags.includes("shocked")) {
    score += 8;
  }

  if (/\btired\b/.test(signals.normalized) && example.tags.includes("tired")) {
    score += 8;
  }

  return score;
};

export const GENERATE_FRAMES_LLM_TRAINING_EXAMPLES = FRAME_EXAMPLES;

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
}: {
  examples?: GenerateFramesExample[];
  userMessage: string;
  analysisInput: string;
  limit?: number;
}) => {
  const rankedExamples = examples
    .map((example) => ({
      example,
      score: scoreExample({
        example,
        userMessage,
        analysisInput,
      }),
    }))
    .filter(({ score }) => score > 0)
    .sort((left, right) => right.score - left.score);

  const selected: GenerateFramesExample[] = [];
  const seenCategories = new Set<string>();

  for (const { example } of rankedExamples) {
    if (selected.length >= limit) {
      break;
    }

    if (seenCategories.has(example.category) && selected.length < Math.max(2, limit - 1)) {
      continue;
    }

    selected.push(example);
    seenCategories.add(example.category);
  }

  if (selected.length >= limit || rankedExamples.length === 0) {
    return selected.slice(0, limit);
  }

  for (const { example } of rankedExamples) {
    if (selected.length >= limit) {
      break;
    }

    if (!selected.some((selectedExample) => selectedExample.id === example.id)) {
      selected.push(example);
    }
  }

  return selected.slice(0, limit);
};

export const formatGenerateFramesExamplesForPrompt = (examples: GenerateFramesExample[]) =>
  examples
    .map((example, index) => {
      const lines = [
        `Example ${index + 1}: ${example.category}`,
        `Command objective: ${example.requestSummary}`,
        `Known locks: ${example.knownFacts.join(" | ") || "(none)"}`,
        `Missing locks: ${example.missingFacts.join(" | ") || "(none)"}`,
        `Execution gap: ${example.strongestGap || "(none)"}`,
        `Decision: ask=${example.shouldAskQuestion ? "yes" : "no"} | proceed=${example.shouldProceedWithoutQuestion ? "yes" : "no"} | max-questions=${example.maxQuestionsBeforeProceeding}`,
        `Best question: ${example.bestQuestion ?? "(proceed without asking)"}`,
        `Command focus: ${formatCommandRuleList(example.responseFocus).join(" | ") || "(none)"}`,
        `Consistency rules: ${formatCommandRuleList(example.consistencyRules).join(" | ") || "(none)"}`,
        `Bad questions: ${example.badQuestions.join(" | ") || "(none)"}`,
        `Failure guards: ${formatCommandRuleList(example.badStyleNotes).join(" | ") || "(none)"}`,
        `Execution notes: ${formatCommandRuleList(example.frameQualityNotes).join(" | ") || "(none)"}`,
        "Command contract: pose=<setup|anticipation|action|impact|follow-through|recovery|transition>; description=action=<type>; durationFrames=<number>; intensity=<none|light|medium|heavy>; timing=<static|fast|normal|slow>; spacing=<none|tight|medium|wide>; command=<explicit execution instruction>;",
      ];

      return lines.join("\n");
    })
    .join("\n\n");
