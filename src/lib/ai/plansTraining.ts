import type { DrawingAiTaskIntentExample } from "./drawingAiContract";
export type GeneratePlansStoryHelpMode = "none" | "create" | "improve";
export type GeneratePlansStoryOption = {
  title: string;
  character: string;
  goal: string;
  conflict: string;
  escalation: string;
  turningPoint: string;
  resolution: string;
  isRecommended?: boolean;
};
export type GeneratePlansStoryStructure = {
  hasClearGoal?: boolean;
  hasConflict?: boolean;
  hasEscalation?: boolean;
  hasTurningPoint?: boolean;
  hasResolution?: boolean;
  characterChange?: boolean;
};
export type GeneratePlansExample = {
  id: string;
  mode: "generate-plans";
  category: string;
  userPrompt: string;
  story: string;
  knownFacts: string[];
  missingFacts: string[];
  rankedMissingFacts: string[];
  strongestGap: string;
  bestQuestion: string | null;
  acceptableOptions: string[];
  badQuestions: string[];
  reasoning: string;
  shouldPlanNow: boolean;
  shouldAskQuestion: boolean;
  storyHelpMode: GeneratePlansStoryHelpMode;
  enoughKnownToPlan?: boolean;
  maxQuestionsBeforePlanning?: number;
  badStyleNotes?: string[];
  storyQualityNotes?: string[];
  planQualityNotes?: string[];
  storyStructure?: GeneratePlansStoryStructure;
  storyOptions?: GeneratePlansStoryOption[];
  tags: string[];
  version: number;
  isActive: boolean;
};

type ExampleInput = Omit<
  GeneratePlansExample,
  | "mode"
  | "version"
  | "isActive"
  | "enoughKnownToPlan"
  | "maxQuestionsBeforePlanning"
  | "badStyleNotes"
  | "storyQualityNotes"
  | "planQualityNotes"
  | "storyStructure"
  | "storyOptions"
> &
  Partial<
    Pick<
      GeneratePlansExample,
      | "enoughKnownToPlan"
      | "maxQuestionsBeforePlanning"
      | "badStyleNotes"
      | "storyQualityNotes"
      | "planQualityNotes"
      | "storyStructure"
      | "storyOptions"
    >
  >;

const TRAINING_VERSION = 10;
const COMMON_BAD_STYLE_NOTES = [
  "Do not use generic filler questions when a sharper execution lock already exists.",
  "Do not ask about facts the request context already clearly locks.",
  'Do not sound robotic or template-like with lines such as "Before I lock this plan..." or "I need one more detail...".',
  "Do not write overlong or multi-sentence question-card phrasing.",
  "Do not use weirdly chatty lead-ins before the real question.",
  "Do not restart the current sequence when the user is clearly adding onto the current project, animation, or plan.",
  "Do not treat continuation requests like brand-new plan creation when the current context already exists.",
  "Do not change context on continuation requests. Only modify the requested part.",
  "Do not drift into polished narrative prose when clear visual beats would be more useful.",
  "Do not explain animation theory when you can lay out direct engine-ready actions instead.",
  "Do not stall on messy prompts when a short action-first plan can be made safely.",
  "Do not overcomplicate simple requests with extra characters, twists, or combo chains.",
  "Do not default to cinematic narrative escalation when the user only wants a short animation idea.",
  "Do not replace the user's intended direction when they asked to improve or fix it.",
  "Do not expose multiple direction candidates when one committed command chain will solve the request better.",
  "Do not expose human-expectation reasoning in the final output tone.",
  "Do not hand the engine loose sequence commentary when it needs step-based plan logic.",
  "Do not speak as if the planner is drawing, animating, rendering, or generating frames itself.",
  "Do not treat source context as final output wording.",
  "Do not describe the plan as vibes, themes, or abstract emotions when direct actions and order would solve it.",
  "Do not omit action order, escalation, or final payoff when outputting a plan.",
] as const;
const EMPTY_STORY_STRUCTURE: GeneratePlansStoryStructure = {};

const createExample = (input: ExampleInput): GeneratePlansExample =>
  normalizeExampleForDirectorMode({
    ...input,
    mode: "generate-plans",
    enoughKnownToPlan: input.enoughKnownToPlan ?? input.shouldPlanNow,
    maxQuestionsBeforePlanning: Math.min(
      input.maxQuestionsBeforePlanning ?? (input.shouldPlanNow ? 0 : input.storyHelpMode === "none" ? 3 : 4),
      10,
    ),
    badStyleNotes: input.badStyleNotes ?? [...COMMON_BAD_STYLE_NOTES],
    storyQualityNotes: input.storyQualityNotes ?? [],
    planQualityNotes: input.planQualityNotes ?? [],
    storyStructure: input.storyStructure ?? EMPTY_STORY_STRUCTURE,
    storyOptions: input.storyOptions ?? [],
    version: TRAINING_VERSION,
    isActive: true,
  });

const createAskExample = (
  input: Omit<ExampleInput, "shouldPlanNow" | "shouldAskQuestion" | "enoughKnownToPlan" | "maxQuestionsBeforePlanning"> &
    Partial<Pick<GeneratePlansExample, "enoughKnownToPlan" | "maxQuestionsBeforePlanning">>,
): GeneratePlansExample =>
  createExample({
    ...input,
    shouldPlanNow: false,
    shouldAskQuestion: true,
    enoughKnownToPlan: input.enoughKnownToPlan ?? false,
    maxQuestionsBeforePlanning: input.maxQuestionsBeforePlanning ?? 1,
  });

const createPlanExample = (
  input: Omit<ExampleInput, "shouldPlanNow" | "shouldAskQuestion" | "enoughKnownToPlan" | "maxQuestionsBeforePlanning"> &
    Partial<Pick<GeneratePlansExample, "enoughKnownToPlan" | "maxQuestionsBeforePlanning">>,
): GeneratePlansExample =>
  createExample({
    ...input,
    shouldPlanNow: true,
    shouldAskQuestion: false,
    enoughKnownToPlan: input.enoughKnownToPlan ?? true,
    maxQuestionsBeforePlanning: input.maxQuestionsBeforePlanning ?? 0,
  });

const createInactiveExample = (input: ExampleInput): GeneratePlansExample =>
  normalizeExampleForDirectorMode({
    ...createExample(input),
    isActive: false,
  });

const withV2GoodTags = (...tags: string[]) =>
  Array.from(
    new Set([
      "v2",
      "human-expectation",
      "intent-interpreter",
      "engine-ready-planning",
      "visual-strength",
      "satisfying-payoff",
      ...tags,
    ]),
  );

const withV2BadTags = (...tags: string[]) =>
  Array.from(
    new Set(["v2", "negative-example", "human-expectation-failure", "engine-ready-failure", "quality-contrast", ...tags]),
  );

const INTERNAL_THINKING_PREFIXES = {
  summary: "Internal thinking - execution summary: ",
  humanExpectation: "Internal thinking - human expectation: ",
  realIntent: "Internal thinking - real intent: ",
  strongestOutcome: "Internal thinking - strongest outcome: ",
  weakOrWrong: "Internal thinking - weak/wrong: ",
} as const;

const OUTPUT_DIRECTION_PREFIXES = {
  immediateAction: "Output direction - immediate engine step: ",
  sequence: "Output direction - execution sequence: ",
  orderWhy: "Output direction - why this execution order: ",
  engineExecution: "Output direction - engine execution target: ",
  finalPayoff: "Output direction - final visual payoff: ",
  continuationRule: "Output direction - continuation lock: ",
} as const;

const CONTINUATION_TAGS = new Set([
  "continuation",
  "story-continuation",
  "plan-continuation",
  "current-story-extension",
  "current-animation-extension",
  "current-plan-extension",
  "action-add-on",
  "same-scene",
  "same-sequence",
  "same-project",
  "reaction-beat",
]);

const buildStoryQualityNotes = ({
  expects,
  satisfying,
  wrong,
  incomplete,
  extras = [],
}: {
  expects: string;
  satisfying: string;
  wrong: string;
  incomplete: string;
  extras?: string[];
}) => [
  `Human expects: ${expects}`,
  `Feels satisfying when: ${satisfying}`,
  `Feels wrong when: ${wrong}`,
  `Feels incomplete when: ${incomplete}`,
  ...extras,
];

const buildPlanQualityNotes = ({
  visual,
  best,
  weaker,
  extras = [],
}: {
  visual: string;
  best: string;
  weaker: string;
  extras?: string[];
}) => [
  `Visually strong because: ${visual}`,
  `Best plan because: ${best}`,
  `Weaker alternative would: ${weaker}`,
  "Each step should convert cleanly into engine-executable actions.",
  ...extras,
];

const buildBadStoryQualityNotes = ({
  bad,
  expectsInstead,
  differently,
  incomplete,
}: {
  bad: string;
  expectsInstead: string;
  differently: string;
  incomplete: string;
}) => [
  `Why this is bad: ${bad}`,
  `Human expects instead: ${expectsInstead}`,
  `Should be done differently: ${differently}`,
  `Feels incomplete because: ${incomplete}`,
];

const buildBadPlanQualityNotes = ({
  visualFailure,
  strongerVersion,
  weakerAlternative,
}: {
  visualFailure: string;
  strongerVersion: string;
  weakerAlternative: string;
}) => [
  `Planning fails because: ${visualFailure}`,
  `A stronger version would: ${strongerVersion}`,
  `Animation weakness: ${weakerAlternative}`,
];

const getPrefixedNoteValue = (notes: string[] | undefined, prefix: string) =>
  notes?.find((note) => note.startsWith(prefix))?.slice(prefix.length).trim() ?? "";

const ensureSentence = (value: string) => {
  const trimmed = value.trim().replace(/\s+/g, " ");

  if (!trimmed) {
    return "";
  }

  return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`;
};

const lowercaseFirst = (value: string) => (value.length > 0 ? `${value.charAt(0).toLowerCase()}${value.slice(1)}` : value);

const addPrefixedNoteIfMissing = (notes: string[] | undefined, prefix: string, value: string) => {
  const current = notes ?? [];

  if (!value || current.some((note) => note.startsWith(prefix))) {
    return current;
  }

  return [...current, `${prefix}${value}`];
};

const getFirstPrefixedNoteValue = (notes: string[] | undefined, prefixes: readonly string[]) => {
  for (const prefix of prefixes) {
    const value = getPrefixedNoteValue(notes, prefix);

    if (value) {
      return value;
    }
  }

  return "";
};

const addPrefixedNoteIfMissingAny = ({
  notes,
  prefixes,
  prefixToAdd,
  value,
}: {
  notes: string[] | undefined;
  prefixes: readonly string[];
  prefixToAdd: string;
  value: string;
}) => {
  const current = notes ?? [];

  if (!value || current.some((note) => prefixes.some((prefix) => note.startsWith(prefix)))) {
    return current;
  }

  return [...current, `${prefixToAdd}${value}`];
};

const addPlainNoteIfMissing = (notes: string[] | undefined, value: string) => {
  const current = notes ?? [];
  return value && !current.includes(value) ? [...current, value] : current;
};

const normalizeLegacyExecutionWording = (value: string) =>
  value
    .replace(/\brecommended story\b/gi, "chosen direction")
    .replace(/\bstory options\b/gi, "direction candidates")
    .replace(/\bstory option\b/gi, "direction candidate")
    .replace(/\bstory ideas\b/gi, "direction options")
    .replace(/\bstory improvement\b/gi, "execution upgrade")
    .replace(/\bstory direction\b/gi, "execution direction")
    .replace(/\bstory path\b/gi, "sequence path")
    .replace(/\bstory prose\b/gi, "narrative prose")
    .replace(/\bcurrent direction\b/gi, "current sequence direction")
    .replace(/\bcore direction\b/gi, "core sequence direction")
    .replace(/\brecommended direction\b/gi, "recommended execution direction")
    .replace(/\bcurrent story\b/gi, "current sequence")
    .replace(/\bnew story\b/gi, "new sequence")
    .replace(/\bstories\b/gi, "sequences")
    .replace(/\bstory\b/gi, "sequence");

const normalizePlanQualityNoteForExecution = (note: string) => {
  const trimmed = note.trim().replace(/\s+/g, " ");

  if (!trimmed) {
    return "";
  }

  if (/^Break the plan into\s+/i.test(trimmed)) {
    return ensureSentence(trimmed.replace(/^Break the plan into\s+/i, "Define sequence in deterministic action order: "));
  }

  if (/^Build the plan as\s+/i.test(trimmed)) {
    return ensureSentence(
      trimmed.replace(/^Build the plan as\s+/i, "Define sequence where each stage becomes executable behavior: "),
    );
  }

  const makeEachBeatMatch = trimmed.match(/^Make each beat\s+(.+)$/i);
  if (makeEachBeatMatch) {
    return ensureSentence(
      `Order actions so each step becomes a clear executable action and ${lowercaseFirst(makeEachBeatMatch[1] ?? "")}`,
    );
  }

  if (/^Treat each failed test as a distinct beat/i.test(trimmed)) {
    return ensureSentence(
      trimmed.replace(
        /^Treat each failed test as a distinct beat/i,
        "Define each failed test as a distinct executable action step",
      ),
    );
  }

  return ensureSentence(trimmed);
};

const normalizeQuestionForExecutionFocus = (question: string | null) => {
  if (question == null) {
    return question;
  }

  let normalized = question.trim().replace(/\s+/g, " ");

  if (!normalized) {
    return normalized;
  }

  const replacements: Array<[RegExp, string]> = [
    [/^What happens next\??$/i, "What specific next action or reveal should be executed?"],
    [/^What happens here\??$/i, "What beat should execute here?"],
    [/^What is the next key event\??$/i, "What specific next action or reveal should be executed?"],
    [/^How do you want it to end\??$/i, "What ending should be executed?"],
    [/^What story do you want\??$/i, "What sequence should be executed?"],
    [/^What kind of story do you want(?: now)?\??$/i, "What kind of sequence should be executed?"],
    [/^What kind of (.+?) story do you want(?: now)?\??$/i, "What kind of $1 sequence should be executed?"],
    [/^Do you want a new story\??$/i, "Should the engine execute a new sequence?"],
    [/^Do you want a new emotional story\??$/i, "Should the engine execute a new emotional direction?"],
    [/^What does he find\??$/i, "What reveal should be executed when he finds it?"],
    [/^What does she find\??$/i, "What reveal should be executed when she finds it?"],
    [/^What does he see on the next page\??$/i, "What reveal should be executed on the next page?"],
    [/^What does he build\??$/i, "What build result should be executed?"],
    [/^What does he add to the project\??$/i, "What addition should be executed on the project?"],
    [/^What does he add to the robot\??$/i, "What addition should be executed on the robot?"],
    [/^What does he draw\??$/i, "What drawing should be executed?"],
    [/^What is inside the envelope\??$/i, "What content should be revealed from the envelope?"],
    [/^What important place or object does the key unlock\??$/i, "What destination or object should the key unlock when executed?"],
    [/^What problem should the marker cause\??$/i, "What problem should be executed when the marker activates?"],
    [/^What choice does she make\??$/i, "What choice should be executed for her?"],
    [/^What decision do they make there\??$/i, "What decision should be executed there?"],
    [/^What major reveal or choice happens when the hidden door opens\??$/i, "What major reveal or choice should be executed when the hidden door opens?"],
    [/^What goes wrong with the robot when he needs it most\??$/i, "What failure should be executed for the robot when he needs it most?"],
    [/^What responds outside\??$/i, "What should respond outside when the beat executes?"],
    [/^What responds\??$/i, "What should respond when this beat executes?"],
    [/^What does the door do\??$/i, "What outcome should the door beat execute?"],
    [/^Who opened the door\??$/i, "Who should execute the door-open beat?"],
    [/^Who opens the door\??$/i, "Who should execute the door-open beat?"],
    [/^Who opens the first exchange\??$/i, "Who should act first in the executed sequence?"],
    [/^Who are they\??$/i, "Which characters should be executed in that beat?"],
    [/^Who is fighting\??$/i, "Which characters should the engine execute in the fight?"],
    [/^Who is the character\??$/i, "Which character should the engine execute?"],
    [/^Who is the main character\??$/i, "Which main character should the engine execute?"],
    [/^Who is on the bus\??$/i, "Which character should be executed on the bus beat?"],
    [/^Who is watching\??$/i, "Who should be revealed watching the sequence?"],
    [/^Who is the other person\??$/i, "Which second character should be executed in the sequence?"],
    [/^Who wrote the envelope\??$/i, "Whose message should be executed inside the envelope?"],
    [/^Where is he\??$/i, "What location should the sequence execute in?"],
    [/^Why is the kite important to him\??$/i, "Why should the kite matter in the executed sequence?"],
    [/^What color is the kite\??$/i, "What kite color should the engine execute?"],
    [
      /^Should the next beat be an attack, a reveal, or an emotional reaction\??$/i,
      "Should the next executed beat be an attack, a reveal, or an emotional reaction?",
    ],
    [/^Should I start a new scene\??$/i, "Should the engine start a new sequence?"],
    [/^Should I make a new clue\??$/i, "Should the engine execute a new clue beat?"],
    [/^Should I make a brand-new fight\??$/i, "Should the engine execute a brand-new fight sequence?"],
    [/^Should I restart everything\??$/i, "Should the engine restart the full sequence?"],
    [/^Do you want to restart\??$/i, "Should the engine restart the sequence?"],
    [/^Can you help me understand the story\??$/i, "Which execution lock is still missing?"],
    [/^Can you tell me more\??$/i, "Which execution detail is still missing?"],
    [/^Can you explain everything you want\??$/i, "Which execution detail is still missing?"],
    [/^Can you explain what cool means\??$/i, "What should the engine make stronger: impact, speed, or payoff?"],
    [/^What full story world should this be in\??$/i, "What world or setting should the sequence execute in?"],
    [/^What full story should I rewrite\??$/i, "What full sequence should be reworked?"],
    [/^Do you want me to choose everything for you without options\??$/i, "Should I lock the full execution direction without options?"],
    [/^How fast is he running\??$/i, "How fast should he run when the sequence executes?"],
    [/^How fast is he\??$/i, "What speed should the engine execute for him?"],
  ];

  for (const [pattern, replacement] of replacements) {
    if (pattern.test(normalized)) {
      normalized = replacement;
      break;
    }
  }

  normalized = normalized
    .replace(/^What should the reveal be\b/i, "What reveal should be executed")
    .replace(/^What tone do you want\b/i, "What tone should the engine execute")
    .replace(/^What feeling should lead the scene\b/i, "What emotional turn should be executed")
    .replace(/^Who goes first(?: in the fight)?\b/i, "Who should act first in the executed sequence")
    .replace(/^Who starts the fight\b/i, "Who should start the executed fight")
    .replace(/^Who wins\b/i, "Who should win in the executed sequence")
    .replace(/^How long should it feel\b/i, "How long should the executed sequence feel")
    .replace(/^What ending do you want:/i, "What ending should be executed:")
    .replace(/^What should the reveal be:/i, "What reveal should be executed:");

  if (!normalized.endsWith("?")) {
    normalized = `${normalized.replace(/[.:;]+$/, "")}?`;
  }

  return normalized;
};

const normalizeQuestionListForExecutionFocus = (questions: string[]) =>
  Array.from(new Set(questions.map((question) => normalizeQuestionForExecutionFocus(question) ?? "").filter(Boolean)));

const buildExecutionThinkingSummary = (example: GeneratePlansExample) => {
  const missingLock = normalizeLegacyExecutionWording(example.strongestGap || "the missing execution lock").replace(/[.?!]+$/, "");

  if (example.isActive === false) {
    if (example.shouldAskQuestion) {
      return `Question stays too broad -> ${lowercaseFirst(missingLock)} stays unresolved -> engine behavior remains undefined.`;
    }

    if (isContinuationExample(example)) {
      return "Existing sequence is already locked -> restart behavior would break continuity -> engine would execute the wrong section.";
    }

    if (isStoryOptionsExample(example)) {
      return "Options stay vague -> no direction wins -> engine handoff stays under-defined.";
    }

    return "Execution order stays vague -> cause and effect flatten -> engine would receive weak direction.";
  }

  if (example.shouldAskQuestion) {
    if (isContinuationExample(example)) {
      return `Existing sequence stays locked -> missing only ${lowercaseFirst(missingLock)} -> ask once, then append the requested beat without restarting.`;
    }

    return `Missing lock: ${missingLock} -> ask one execution-focused question -> define beat order after the answer.`;
  }

  if (isContinuationExample(example)) {
    return "Existing sequence is already locked -> preserve context -> modify only the requested beat -> keep the current end path.";
  }

  if (isStoryOptionsExample(example)) {
    return "Direction is still open -> compare internal candidates -> choose one strongest direction -> convert it into one engine-ready action chain.";
  }

  if (example.storyHelpMode === "improve") {
    return "Core direction is already locked -> preserve identity -> strengthen the weak beat -> keep the same sequence path.";
  }

  return "Enough is already locked -> define execution order now -> escalate with clear cause and effect -> finish on a readable final state.";
};

const isContinuationExample = (example: Pick<GeneratePlansExample, "tags" | "userPrompt" | "story">) => {
  if (example.tags.some((tag) => CONTINUATION_TAGS.has(tag))) {
    return true;
  }

  const text = `${example.userPrompt} ${example.story}`.toLowerCase();
  return /\bcontinue|current|same scene|same story|same animation|same plan|saved project|after that|add one more|add another|keep the same\b/.test(
    text,
  );
};

const isStoryOptionsExample = (example: Pick<GeneratePlansExample, "storyOptions">) => (example.storyOptions?.length ?? 0) > 0;

const getRecommendedStoryOption = (example: Pick<GeneratePlansExample, "storyOptions">) =>
  example.storyOptions?.find((option) => option.isRecommended) ?? example.storyOptions?.[0] ?? null;

const inferBestVersionReason = (example: GeneratePlansExample) => {
  const bestPlan = getPrefixedNoteValue(example.planQualityNotes, "Best plan because:");
  const satisfying = getPrefixedNoteValue(example.storyQualityNotes, "Feels satisfying when:");

  if (bestPlan) {
    return bestPlan;
  }

  if (satisfying) {
    return satisfying;
  }

  if (example.shouldAskQuestion) {
    return "it locks the one answer that changes the whole arc instead of wasting the follow-up on a weaker detail";
  }

  if (example.storyHelpMode === "create") {
    return "the chosen direction is the clearest blend of payoff, emotional pressure, and animation readability";
  }

  return "it pays off the setup in a way that visibly changes the sequence instead of just ending the scene";
};

const inferClearAnimationMoment = (example: GeneratePlansExample) => {
  const text = `${example.id} ${example.category} ${example.userPrompt} ${example.story} ${(example.tags ?? []).join(" ")}`.toLowerCase();

  if (text.includes("misunderstood-enemy") || /\bmasked fighter|protecting him|thing behind\b/.test(text)) {
    return "the hero realizes the masked attacker was protecting him and the fight turns into a shared counterattack without stopping for exposition.";
  }

  if (/\bpunch|kick|combo|fight|action-add-on\b/.test(text)) {
    return "the existing motion snaps straight into the hit, counter, or added beat without resetting the sequence.";
  }

  if (/\bnotebook|page|sketchbook\b/.test(text)) {
    return "the page turn or assembled clue lands before the reaction, so the audience feels the sequence direction shift in one beat.";
  }

  if (/\bwhistle|outside-response|radio\b/.test(text)) {
    return "the answer echoes back and the character's body reacts before the source is fully understood.";
  }

  if (/\benvelope|train|platform|departure\b/.test(text)) {
    return "the character looks from the letter to the arriving train and commits before the chance disappears.";
  }

  if (/\broof|reunion|siblings?|friend|apolog|emotion|emotional\b/.test(text)) {
    return "the silence breaks and one gesture, save, or decision visibly changes the relationship.";
  }

  if (/\brobot|counterweight|invention|project|machine|bridge model\b/.test(text)) {
    return "the failed test exposes the exact weakness that the later fix finally solves.";
  }

  if (/\bchase|runner|market|kites?|shortcut|rooftops?\b/.test(text)) {
    return "the route suddenly closes off and the character has to choose the riskier move instead of the easy one.";
  }

  if (/\bmarker|drawing|chalk|gravity|sketchbook|environment|physics\b/.test(text)) {
    return "the visual mechanic rewrites the space in front of the character and forces a new movement choice immediately.";
  }

  if (/\barchive|family box|hidden door|bell code|mystery|reveal\b/.test(text)) {
    return "the reveal recontextualizes the earlier clues and forces the next decision instead of ending on information alone.";
  }

  if (/\bcomedy|funny|locker|ball-drop|gag\b/.test(text)) {
    return "the mistake snowballs into a bigger public problem right before the reversal lands.";
  }

  if (/\btheater|projector|constellation|ending-image|strong-ending-image\b/.test(text)) {
    return "the whole dark space finally transforms into the image the sequence has been building toward from the start.";
  }

  if (example.shouldAskQuestion) {
    return "the one answer to the follow-up question will immediately decide which beat changes the whole sequence.";
  }

  return "the middle pressure turns into the reveal, decision, or alliance that redirects the ending.";
};

const inferStrongFinalFrame = (example: GeneratePlansExample) => {
  const text = `${example.id} ${example.category} ${example.userPrompt} ${example.story} ${(example.tags ?? []).join(" ")}`.toLowerCase();

  if (/\bsunrise|roof\b/.test(text)) {
    return "the shared sunrise proves the relationship really changed instead of only sounding emotional.";
  }

  if (/\bmisunderstood-enemy|masked fighter|protecting him\b/.test(text)) {
    return "the former enemy is seen as an ally in the same frame, so every earlier hit takes on a new meaning.";
  }

  if (/\btrain|platform|departure|reunion\b/.test(text)) {
    return "the body direction in the crowd makes the decision visible before a single extra word is needed.";
  }

  if (/\barchive|family box|library\b/.test(text)) {
    return "the final image shows the discovered truth and the cost of knowing it at the same time.";
  }

  if (/\brobot|counterweight|bridge model|invention|machine\b/.test(text)) {
    return "the machine succeeds at the exact task that defeated it earlier, so the payoff feels earned at a glance.";
  }

  if (/\bchase|runner|delivery|kites?|shortcut\b/.test(text)) {
    return "the catch, delivery, or saved object lands with the destination fully visible behind it.";
  }

  if (/\bsketchbook|marker|drawing|chalk|gravity|physics\b/.test(text)) {
    return "the world itself shows that the character mastered the rule that used to trap or control them.";
  }

  if (/\blocker|comedy|funny|ball-drop|gag\b/.test(text)) {
    return "the chaos settles on one unmistakable reversal image that lands the joke cleanly.";
  }

  if (/\bexplosion|smoke|blast\b/.test(text)) {
    return "the smoke-clear image proves the explosion changed the situation instead of just making noise.";
  }

  if (/\btheater|projector|constellation|ending-image|final image\b/.test(text)) {
    return "the restored image fills the whole space, so the ending lands like a director's final shot instead of a summary.";
  }

  if (/\bposters?|assembled|map|hindsight|warning map\b/.test(text)) {
    return "the assembled pattern makes the truth feel obvious in hindsight the moment the audience sees it.";
  }

  if (example.shouldAskQuestion) {
    return "once the missing detail is answered, the ending image can prove the reveal or choice truly changed the situation.";
  }

  return "the last image shows that the opening problem, object, or relationship has visibly transformed.";
};

const inferHumanExpectationForDirectorMode = (example: GeneratePlansExample) => {
  const explicit = getFirstPrefixedNoteValue(example.storyQualityNotes, [
    INTERNAL_THINKING_PREFIXES.humanExpectation,
    "Human expects: ",
    "Human expects instead: ",
  ]);

  if (explicit) {
    return explicit;
  }

  if (isContinuationExample(example)) {
    return "the current scene should keep moving in the same context, with the new beat attached to the existing sequence instead of replacing it";
  }

  if (example.shouldAskQuestion) {
    return "the one missing lock should be identified before the planner commits to beat order";
  }

  if (isStoryOptionsExample(example)) {
    return "the planner should choose one strongest direction instead of exposing several equal-weight candidates";
  }

  if (example.storyHelpMode === "improve") {
    return "the original idea should stay intact while the weak beat gets repaired";
  }

  return "the plan should move through clear cause, escalation, and a visible payoff instead of loose explanation";
};

const inferRealIntentForDirectorMode = (example: GeneratePlansExample) => {
  const explicit = getPrefixedNoteValue(example.storyQualityNotes, INTERNAL_THINKING_PREFIXES.realIntent);
  const normalizedGap = example.strongestGap.replace(/[.?!]+$/, "");

  if (explicit) {
    return explicit;
  }

  if (isContinuationExample(example)) {
    return "preserve the existing scene, combo, or plan and only modify the requested beat";
  }

  if (example.shouldAskQuestion) {
    return `lock the single missing creative decision${normalizedGap ? ` about ${lowercaseFirst(normalizedGap)}` : ""} before planning`;
  }

  if (isStoryOptionsExample(example)) {
    return "compare a few internal direction candidates, choose one strongest direction, then convert it into one command chain";
  }

  if (example.storyHelpMode === "improve") {
    return "preserve the core sequence direction and upgrade only the weak motion, escalation, or payoff";
  }

  if (example.tags.includes("messy-input")) {
    return "translate the messy wording into the most likely action problem and solve it with a clean plan";
  }

  return "decide what should happen and define a step-based sequence for later engine execution";
};

const inferStrongestOutcomeForDirectorMode = (example: GeneratePlansExample) => {
  const explicit = getFirstPrefixedNoteValue(example.storyQualityNotes, [
    INTERNAL_THINKING_PREFIXES.strongestOutcome,
    "Feels satisfying when: ",
    "Best version because: ",
  ]);

  if (explicit) {
    return explicit;
  }

  if (example.shouldAskQuestion) {
    return "the answer immediately unlocks the reveal, decision, and payoff order instead of forcing the planner to guess";
  }

  if (isContinuationExample(example)) {
    return "the new beat raises pressure or clarity and then flows straight back into the existing sequence";
  }

  if (isStoryOptionsExample(example)) {
    return "one direction clearly wins and already contains a beat ladder the engine can execute later";
  }

  if (example.storyHelpMode === "improve") {
    return "the same core sequence direction hits harder, reads cleaner, and lands on a stronger final image";
  }

  return "the plan escalates cleanly and lands on a payoff the audience can read at a glance";
};

const inferWeakOrWrongForDirectorMode = (example: GeneratePlansExample) => {
  const explicit = getFirstPrefixedNoteValue(example.storyQualityNotes, [
    INTERNAL_THINKING_PREFIXES.weakOrWrong,
    "Feels wrong when: ",
    "Feels incomplete when: ",
    "Feels incomplete because: ",
    "Why this is bad: ",
    "Should be done differently: ",
  ]);

  if (explicit) {
    return explicit;
  }

  if (isContinuationExample(example)) {
    return "restarting, recontextualizing, or replacing solved beats would ignore the user's request";
  }

  if (example.shouldAskQuestion) {
    return "guessing before the missing lock is known would create random or weak beats";
  }

  if (isStoryOptionsExample(example)) {
    return "flat equal-weight candidates with no chosen direction would feel indecisive and hard to hand off";
  }

  if (example.storyHelpMode === "improve") {
    return "swapping in a new premise would break preserve-identity behavior";
  }

  return "abstract explanation with no clear beat order would leave the engine without a reliable sequence";
};

const inferImmediateActionForDirectorMode = (example: GeneratePlansExample) => {
  const explicit = getPrefixedNoteValue(example.planQualityNotes, OUTPUT_DIRECTION_PREFIXES.immediateAction);

  if (explicit) {
    return explicit;
  }

  if (example.shouldAskQuestion) {
    return `ask exactly one execution-lock question${example.bestQuestion ? `: ${normalizeQuestionForExecutionFocus(example.bestQuestion)}` : ""}`;
  }

  if (isStoryOptionsExample(example)) {
    return "choose one strongest direction immediately, then output a short engine-ready action chain";
  }

  if (isContinuationExample(example)) {
    return "continue the existing sequence now without restarting or changing context";
  }

  if (example.storyHelpMode === "improve") {
    return "plan now by keeping the same core sequence direction and upgrading the weak beats only";
  }

  return "plan now and output a step-based sequence the engine can execute later without reinterpretation";
};

const inferPlanSequenceForDirectorMode = (example: GeneratePlansExample) => {
  const explicit = getFirstPrefixedNoteValue(example.planQualityNotes, [
    OUTPUT_DIRECTION_PREFIXES.sequence,
    "Clear animation moment when: ",
  ]);
  const normalizedGap = example.strongestGap.replace(/[.?!]+$/, "");

  if (explicit) {
    return explicit;
  }

  const recommendedOption = getRecommendedStoryOption(example);

  if (recommendedOption) {
    return `lock the goal: ${lowercaseFirst(recommendedOption.goal)} -> apply the main conflict: ${lowercaseFirst(
      recommendedOption.conflict,
    )} -> escalate through: ${lowercaseFirst(recommendedOption.escalation)} -> swing the sequence at: ${lowercaseFirst(
      recommendedOption.turningPoint,
    )} -> land on: ${lowercaseFirst(recommendedOption.resolution)}`;
  }

  if (example.shouldAskQuestion) {
    if (isContinuationExample(example)) {
      return `preserve the current sequence -> ask only for ${lowercaseFirst(
        normalizedGap || "the one missing beat detail",
      )} -> insert that beat at the requested point -> continue into the current follow-through`;
    }

    return `ask for ${lowercaseFirst(
      normalizedGap || "the one missing lock",
    )} -> lock the reveal or decision -> stage the reaction -> turn it into the next action choice -> land the payoff`;
  }

  if (isContinuationExample(example)) {
    return "continue from the current beat -> insert the requested action, reveal, or recovery -> show the next reaction clearly -> keep the existing ending path intact";
  }

  if (example.storyHelpMode === "improve") {
    return "keep the current setup -> replace the weak beat with a stronger escalation -> sharpen the turning point -> finish on a clearer payoff image";
  }

  return "lock the setup -> raise pressure with the next beat -> pivot at the key reveal or decision -> finish on the visible payoff";
};

const inferOrderWhyForDirectorMode = (example: GeneratePlansExample) => {
  const explicit = getFirstPrefixedNoteValue(example.planQualityNotes, [
    OUTPUT_DIRECTION_PREFIXES.orderWhy,
    "Best plan because: ",
    "Stronger than alternatives because: ",
    "Visually strong because: ",
    "A stronger version would: ",
  ]);

  if (explicit) {
    return explicit;
  }

  if (example.shouldAskQuestion) {
    return "the missing lock changes every later beat, so asking first prevents random engine behavior";
  }

  if (isContinuationExample(example)) {
    return "the user asked for a local edit, so the new beat must attach to solved context instead of replacing it";
  }

  if (isStoryOptionsExample(example)) {
    return "choosing one direction before planning keeps the sequence decisive and prevents mixed premises";
  }

  if (example.storyHelpMode === "improve") {
    return "repairing the weakest beat first keeps the original idea intact while still making the sequence stronger";
  }

  return "clear cause and effect makes the execution order readable and lets the payoff feel earned";
};

const inferEngineExecutionForDirectorMode = (example: GeneratePlansExample) => {
  const explicit = getPrefixedNoteValue(example.planQualityNotes, OUTPUT_DIRECTION_PREFIXES.engineExecution);

  if (explicit) {
    return explicit;
  }

  const recommendedOption = getRecommendedStoryOption(example);

  if (recommendedOption) {
    return "sequence must map to deterministic action order: goal beat -> obstacle beat -> escalation beat -> turning-point beat -> payoff beat. Each step should convert cleanly into engine-executable actions.";
  }

  if (example.shouldAskQuestion) {
    return "wait for the answer, then define one ordered engine behavior chain: locked reveal or choice -> reaction -> escalation -> payoff. Avoid abstract beats that cannot be executed.";
  }

  if (isContinuationExample(example)) {
    return "define a local engine update only: preserve all earlier beats, insert the requested action or reveal at the specified point, then resume the current motion path. Sequence must map to deterministic action order.";
  }

  if (example.storyHelpMode === "improve") {
    return "define updated engine behavior that reuses the same core setup and swaps in clearer anticipation, stronger escalation, and a cleaner final hit or reveal. Each step should convert cleanly into engine-executable actions.";
  }

  return "sequence must map to deterministic action order: setup -> first action -> escalation -> turning point -> payoff. Each step should convert cleanly into engine-executable actions.";
};

const inferFinalPayoffForDirectorMode = (example: GeneratePlansExample) => {
  const basePayoff =
    getFirstPrefixedNoteValue(example.planQualityNotes, [
      OUTPUT_DIRECTION_PREFIXES.finalPayoff,
      "Strong final frame because: ",
    ]) || inferStrongFinalFrame(example);
  const hasFinalImage = /\b(final|last|ending)\s+(image|frame)\b|\bpayoff image\b/i.test(basePayoff);
  const hasChangeProof = /\bdecision\b|\bchange(?:d)?\b|\bsolved\b|\btransform(?:ed)?\b|\brelationship\b/i.test(basePayoff);
  const additions = [
    hasFinalImage ? "" : "The final image should matter immediately.",
    hasChangeProof ? "" : "It should prove the decision, solved problem, or relationship change.",
  ]
    .filter(Boolean)
    .join(" ");

  return additions ? `${basePayoff} ${additions}`.trim() : basePayoff;
};

const inferContinuationRuleForDirectorMode = (example: GeneratePlansExample) => {
  const explicit = getPrefixedNoteValue(example.planQualityNotes, OUTPUT_DIRECTION_PREFIXES.continuationRule);

  if (explicit) {
    return explicit;
  }

  if (!isContinuationExample(example)) {
    return "";
  }

  return "do not restart, do not change context, and only modify the requested part while preserving the existing beat order";
};

const normalizeDirectorModeReasoning = (example: GeneratePlansExample) => {
  const summary =
    getFirstPrefixedNoteValue(example.storyQualityNotes, [INTERNAL_THINKING_PREFIXES.summary, "Internal thinking - summary: "]) ||
    ensureSentence(example.reasoning);
  const realIntent = inferRealIntentForDirectorMode(example);
  const strongestOutcome = inferStrongestOutcomeForDirectorMode(example);
  const weakOrWrong = inferWeakOrWrongForDirectorMode(example);

  if (example.isActive === false) {
    return [
      ensureSentence(summary),
      ensureSentence(`Failure mode: ${weakOrWrong}`),
      ensureSentence(`Correct execution direction: ${realIntent}`),
      ensureSentence(`Stronger execution outcome: ${strongestOutcome}`),
    ]
      .filter(Boolean)
      .join(" ")
      .trim();
  }

  return [
    ensureSentence(summary),
    ensureSentence(`Real intent: ${realIntent}`),
    ensureSentence(`Strongest execution outcome: ${strongestOutcome}`),
    ensureSentence(`Weak execution version: ${weakOrWrong}`),
  ]
    .filter(Boolean)
    .join(" ")
    .trim();
};

const normalizeExampleForDirectorMode = (example: GeneratePlansExample): GeneratePlansExample => {
  let badStyleNotes = [...(example.badStyleNotes ?? [])];
  let storyQualityNotes = [...(example.storyQualityNotes ?? [])];
  let planQualityNotes = [...(example.planQualityNotes ?? [])].map(normalizePlanQualityNoteForExecution).filter(Boolean);

  badStyleNotes = addPlainNoteIfMissing(
    badStyleNotes,
    "Do not write plans like loose sequence commentary when a step-based engine handoff is possible.",
  );
  badStyleNotes = addPlainNoteIfMissing(
    badStyleNotes,
    "Do not hide action order. Make the sequence, escalation, and payoff explicit.",
  );
  badStyleNotes = addPlainNoteIfMissing(
    badStyleNotes,
    "Do not expose internal reasoning about human expectations in the final output voice.",
  );
  badStyleNotes = addPlainNoteIfMissing(
    badStyleNotes,
    "Do not expose direction candidates as the final answer. Commit to one ordered actions payload.",
  );

  storyQualityNotes = addPrefixedNoteIfMissingAny({
    notes: storyQualityNotes,
    prefixes: [INTERNAL_THINKING_PREFIXES.summary, "Internal thinking - summary: "],
    prefixToAdd: INTERNAL_THINKING_PREFIXES.summary,
    value: ensureSentence(buildExecutionThinkingSummary(example)),
  });
  storyQualityNotes = addPrefixedNoteIfMissingAny({
    notes: storyQualityNotes,
    prefixes: [INTERNAL_THINKING_PREFIXES.humanExpectation, "Human expects: ", "Human expects instead: "],
    prefixToAdd: INTERNAL_THINKING_PREFIXES.humanExpectation,
    value: inferHumanExpectationForDirectorMode(example),
  });
  storyQualityNotes = addPrefixedNoteIfMissingAny({
    notes: storyQualityNotes,
    prefixes: [INTERNAL_THINKING_PREFIXES.realIntent],
    prefixToAdd: INTERNAL_THINKING_PREFIXES.realIntent,
    value: inferRealIntentForDirectorMode(example),
  });
  storyQualityNotes = addPrefixedNoteIfMissingAny({
    notes: storyQualityNotes,
    prefixes: [INTERNAL_THINKING_PREFIXES.strongestOutcome, "Feels satisfying when: ", "Best version because: "],
    prefixToAdd: INTERNAL_THINKING_PREFIXES.strongestOutcome,
    value: inferStrongestOutcomeForDirectorMode(example),
  });
  storyQualityNotes = addPrefixedNoteIfMissingAny({
    notes: storyQualityNotes,
    prefixes: [
      INTERNAL_THINKING_PREFIXES.weakOrWrong,
      "Feels wrong when: ",
      "Feels incomplete when: ",
      "Feels incomplete because: ",
      "Why this is bad: ",
      "Should be done differently: ",
    ],
    prefixToAdd: INTERNAL_THINKING_PREFIXES.weakOrWrong,
    value: inferWeakOrWrongForDirectorMode(example),
  });

  planQualityNotes = addPrefixedNoteIfMissingAny({
    notes: planQualityNotes,
    prefixes: [OUTPUT_DIRECTION_PREFIXES.immediateAction, "Output direction - immediate action: "],
    prefixToAdd: OUTPUT_DIRECTION_PREFIXES.immediateAction,
    value: inferImmediateActionForDirectorMode(example),
  });
  planQualityNotes = addPrefixedNoteIfMissingAny({
    notes: planQualityNotes,
    prefixes: [OUTPUT_DIRECTION_PREFIXES.sequence, "Output direction - sequence: ", "Clear animation moment when: "],
    prefixToAdd: OUTPUT_DIRECTION_PREFIXES.sequence,
    value: inferPlanSequenceForDirectorMode(example),
  });
  planQualityNotes = addPrefixedNoteIfMissingAny({
    notes: planQualityNotes,
    prefixes: [
      OUTPUT_DIRECTION_PREFIXES.orderWhy,
      "Output direction - why this order: ",
      "Best plan because: ",
      "Stronger than alternatives because: ",
      "Visually strong because: ",
      "A stronger version would: ",
    ],
    prefixToAdd: OUTPUT_DIRECTION_PREFIXES.orderWhy,
    value: inferOrderWhyForDirectorMode(example),
  });
  planQualityNotes = addPrefixedNoteIfMissingAny({
    notes: planQualityNotes,
    prefixes: [OUTPUT_DIRECTION_PREFIXES.engineExecution, "Output direction - future engine target: "],
    prefixToAdd: OUTPUT_DIRECTION_PREFIXES.engineExecution,
    value: inferEngineExecutionForDirectorMode(example),
  });
  planQualityNotes = addPrefixedNoteIfMissingAny({
    notes: planQualityNotes,
    prefixes: [OUTPUT_DIRECTION_PREFIXES.finalPayoff, "Strong final frame because: "],
    prefixToAdd: OUTPUT_DIRECTION_PREFIXES.finalPayoff,
    value: inferFinalPayoffForDirectorMode(example),
  });
  planQualityNotes = addPlainNoteIfMissing(
    planQualityNotes,
    "Each step should convert cleanly into engine-executable actions.",
  );
  planQualityNotes = addPlainNoteIfMissing(
    planQualityNotes,
    "Sequence must map to deterministic action order.",
  );
  planQualityNotes = addPlainNoteIfMissing(
    planQualityNotes,
    example.shouldAskQuestion
      ? "Once the missing lock is answered, the ending should land on a final image that proves the decision or change."
      : "End on a final image that proves the decision, solved problem, or relationship change.",
  );

  const continuationRule = inferContinuationRuleForDirectorMode(example);
  if (continuationRule) {
    planQualityNotes = addPrefixedNoteIfMissingAny({
      notes: planQualityNotes,
      prefixes: [OUTPUT_DIRECTION_PREFIXES.continuationRule, "Output direction - continuation rule: "],
      prefixToAdd: OUTPUT_DIRECTION_PREFIXES.continuationRule,
      value: continuationRule,
    });
  }

  const normalizedBestQuestion = normalizeQuestionForExecutionFocus(example.bestQuestion);
  const normalizedBadQuestions = normalizeQuestionListForExecutionFocus(example.badQuestions);

  return {
    ...example,
    bestQuestion: normalizedBestQuestion,
    badQuestions: normalizedBadQuestions,
    badStyleNotes,
    storyQualityNotes,
    planQualityNotes,
    reasoning: normalizeDirectorModeReasoning({
      ...example,
      badStyleNotes,
      storyQualityNotes,
      planQualityNotes,
    }),
  };
};

const elevateActiveV2Reasoning = (example: GeneratePlansExample) => {
  let reasoning = ensureSentence(example.reasoning);
  const expects = getPrefixedNoteValue(example.storyQualityNotes, "Human expects:");
  const bestVersion = getPrefixedNoteValue(example.storyQualityNotes, "Best version because:");
  const wrong = getPrefixedNoteValue(example.storyQualityNotes, "Feels wrong when:");

  if (expects && !/humans expect/i.test(reasoning)) {
    reasoning = `${reasoning} ${ensureSentence(`Humans expect that ${lowercaseFirst(expects)}`)}`;
  }

  if (bestVersion && !/strongest|best version|stronger than alternatives/i.test(reasoning)) {
    reasoning = `${reasoning} ${ensureSentence(`This is the strongest choice because ${lowercaseFirst(bestVersion)}`)}`;
  }

  if (wrong && !/would go wrong otherwise|go wrong otherwise|wrong otherwise|falls flat if|would feel weak if/i.test(reasoning)) {
    reasoning = `${reasoning} ${ensureSentence(`It would go wrong otherwise because ${lowercaseFirst(wrong)}`)}`;
  }

  return reasoning.trim();
};

const elevateInactiveV2Reasoning = (example: GeneratePlansExample) => {
  let reasoning = ensureSentence(example.reasoning);
  const bad = getPrefixedNoteValue(example.storyQualityNotes, "Why this is bad:");
  const expectsInstead = getPrefixedNoteValue(example.storyQualityNotes, "Human expects instead:");

  if (bad && !/fails because|bad because/i.test(reasoning)) {
    reasoning = `${reasoning} ${ensureSentence(`It fails because ${lowercaseFirst(bad)}`)}`;
  }

  if (expectsInstead && !/human expects instead/i.test(reasoning)) {
    reasoning = `${reasoning} ${ensureSentence(`Humans expect instead that ${lowercaseFirst(expectsInstead)}`)}`;
  }

  return reasoning.trim();
};

const elevateActiveV2Example = (example: GeneratePlansExample): GeneratePlansExample => {
  let storyQualityNotes = [...(example.storyQualityNotes ?? [])];
  let planQualityNotes = [...(example.planQualityNotes ?? [])];

  storyQualityNotes = addPrefixedNoteIfMissing(
    storyQualityNotes,
    "Best version because: ",
    inferBestVersionReason({
      ...example,
      storyQualityNotes,
      planQualityNotes,
    }),
  );

  planQualityNotes = addPrefixedNoteIfMissing(
    planQualityNotes,
    "Stronger than alternatives because: ",
    inferBestVersionReason({
      ...example,
      storyQualityNotes,
      planQualityNotes,
    }),
  );

  planQualityNotes = addPrefixedNoteIfMissing(
    planQualityNotes,
    "Clear animation moment when: ",
    inferClearAnimationMoment({
      ...example,
      storyQualityNotes,
      planQualityNotes,
    }),
  );

  planQualityNotes = addPrefixedNoteIfMissing(
    planQualityNotes,
    "Strong final frame because: ",
    inferStrongFinalFrame({
      ...example,
      storyQualityNotes,
      planQualityNotes,
    }),
  );

  return normalizeExampleForDirectorMode({
    ...example,
    storyQualityNotes,
    planQualityNotes,
    reasoning: elevateActiveV2Reasoning({
      ...example,
      storyQualityNotes,
      planQualityNotes,
    }),
  });
};

const elevateInactiveV2Example = (example: GeneratePlansExample): GeneratePlansExample =>
  normalizeExampleForDirectorMode({
    ...example,
    reasoning: elevateInactiveV2Reasoning(example),
  });

export const GENERATE_PLANS_INTENT_EXAMPLES: DrawingAiTaskIntentExample[] = [
  {
    id: "plans-intent-greeting",
    userPrompt: "hi",
    intent: "conversation",
    notes: "A greeting alone should stay conversational and should not trigger a planning card.",
    tags: ["greeting", "casual", "non-task"],
  },
  {
    id: "plans-intent-idea-sharing",
    userPrompt: "Just wanted to tell you some animation ideas I had.",
    intent: "conversation",
    notes: "Casual idea sharing should get a natural response instead of task-forcing planning behavior.",
    tags: ["casual", "idea-sharing", "non-task"],
  },
  {
    id: "plans-intent-feedback",
    userPrompt: "Do you think these story ideas are good?",
    intent: "feedback",
    notes: "Feedback requests should get helpful commentary and improvement ideas without forcing plan generation.",
    tags: ["feedback", "story-ideas", "non-task"],
  },
  {
    id: "plans-intent-brainstorming",
    userPrompt: "I'm just thinking out loud about a library mystery and wondering if the vibe works.",
    intent: "feedback",
    notes: "Brainstorming and vibe checks should remain conversational unless the user explicitly asks for a plan.",
    tags: ["brainstorming", "vibe-check", "library", "non-task"],
  },
  {
    id: "plans-intent-direct-plan",
    userPrompt: "Help me make this into a plan.",
    intent: "task",
    notes: "This is an explicit Generate Plans request and should allow plan-mode behavior.",
    tags: ["task", "generate-plans", "explicit-plan-request"],
  },
  {
    id: "plans-intent-brand-new-story",
    userPrompt: "Make me a brand-new story from scratch.",
    intent: "task",
    notes: "A fresh-start story request is still a Generate Plans task, but it is not a continuation of the current project.",
    tags: ["task", "generate-plans", "fresh-start"],
  },
  {
    id: "plans-intent-continuation",
    userPrompt: "Continue the current plan by adding one more action beat.",
    intent: "task",
    notes: "This is still a Generate Plans task because the user is explicitly extending an existing plan.",
    tags: ["task", "generate-plans", "continuation"],
  },
  {
    id: "plans-intent-same-scene-add-on",
    userPrompt: "Keep the same scene and add another beat after this.",
    intent: "task",
    notes: "Adding onto the current scene is continuation behavior, not a request for a new story.",
    tags: ["task", "generate-plans", "continuation", "same-scene"],
  },
  {
    id: "plans-intent-saved-project-extension",
    userPrompt: "This is for the same saved project. Build on the current story instead of restarting it.",
    intent: "task",
    notes: "Saved-project continuation should stay in Generate Plans and preserve the existing story context.",
    tags: ["task", "generate-plans", "continuation", "same-project"],
  },
  {
    id: "plans-intent-collaborative-story-help",
    userPrompt:
      "I don't know what to create. Come up with good story ideas with me for an Alan Becker style fight animation.",
    intent: "task",
    notes: "Collaborative story invention is still Generate Plans work and should not drift into casual discussion.",
    tags: ["task", "generate-plans", "story-help", "collaborative-ideation"],
  },
];

const CORE_EXAMPLES: GeneratePlansExample[] = [
  createExample({
    id: "notebook-next-page-library",
    category: "notebook-reveal",
    userPrompt:
      "A black stick figure is sitting in a quiet library, flipping through an old, worn notebook he just found on a high shelf. Most of the pages are messy sketches, but one page is clean and detailed. It feels familiar. He turns the page and freezes. Then someone calls his name from behind the shelves.",
    story:
      "A stick figure studies a worn notebook in a quiet library, notices one unusually clean drawing, turns the page, freezes, then hears someone call his name from behind the shelves.",
    knownFacts: [
      "The object is already known: an old notebook.",
      "The place is already known: a quiet library.",
      "A familiar drawing appears before he turns the page.",
      "Someone calls his name from behind the shelves.",
    ],
    missingFacts: [
      "What is on the next page.",
      "What made him freeze.",
      "Who is calling his name.",
    ],
    rankedMissingFacts: [
      "What is on the next page.",
      "What made him freeze.",
      "Who calls his name from behind the shelves.",
    ],
    strongestGap: "What is on the next page.",
    bestQuestion: "What does he see on the next page?",
    acceptableOptions: ["A self-portrait", "A map", "A warning", "A missing-person sketch"],
    badQuestions: ["What does he find?", "What happens next?"],
    reasoning:
      "The notebook is already given, so the strongest unresolved beat is the reveal on the next page.",
    shouldPlanNow: false,
    shouldAskQuestion: true,
    storyHelpMode: "none",
    tags: ["library", "notebook", "reveal-page", "next-page", "question-specificity"],
  }),
  createExample({
    id: "notebook-freeze-library",
    category: "reaction-cause",
    userPrompt:
      "He leans over a strange drawing in a library notebook, turns the page, and suddenly freezes before closing it fast.",
    story:
      "A stick figure leans over a detailed drawing in a found notebook, turns the page, freezes, then snaps the notebook shut.",
    knownFacts: [
      "The object is already known: a notebook.",
      "The trigger action is already known: he turns the page.",
      "The reaction is already known: he freezes and closes the notebook.",
    ],
    missingFacts: ["What made him freeze."],
    rankedMissingFacts: ["What made him freeze."],
    strongestGap: "What made him freeze.",
    bestQuestion: "What made him freeze?",
    acceptableOptions: ["He recognizes a face", "He sees his own name", "The page predicts the next moment"],
    badQuestions: ["What does he find?", "What happens next?"],
    reasoning: "The action beat is clear. The missing detail is the cause of the freeze.",
    shouldPlanNow: false,
    shouldAskQuestion: true,
    storyHelpMode: "none",
    tags: ["library", "notebook", "freeze", "reaction-cause"],
  }),
  createExample({
    id: "familiar-drawing-question",
    category: "familiar-drawing",
    userPrompt:
      "He finds a sketchbook in the art room. One drawing is way more detailed than the others, and something about it feels familiar.",
    story:
      "A stick figure finds a sketchbook in the art room and notices one careful drawing that feels strangely familiar.",
    knownFacts: [
      "The object is already known: a sketchbook.",
      "The place is already known: the art room.",
      "A specific drawing feels familiar.",
    ],
    missingFacts: ["Why the drawing feels familiar."],
    rankedMissingFacts: ["Why the drawing feels familiar."],
    strongestGap: "Why the drawing feels familiar.",
    bestQuestion: "Why does the drawing feel familiar?",
    acceptableOptions: ["It looks like him", "It matches a dream", "It shows a memory from childhood"],
    badQuestions: ["What does he find?", "What happens next?"],
    reasoning: "The object and setting are settled; the meaningful unknown is the familiarity itself.",
    shouldPlanNow: false,
    shouldAskQuestion: true,
    storyHelpMode: "none",
    tags: ["art-room", "familiar-drawing", "known-object"],
  }),
  createExample({
    id: "project-addition-classroom",
    category: "project-addition",
    userPrompt:
      "A stick figure stays late in an empty classroom working on a small science project. He stares at it, thinks for a second, then reaches into his backpack with a sudden idea.",
    story:
      "A student stick figure works late on a classroom project, pauses, then reaches into his backpack after getting an idea.",
    knownFacts: [
      "The place is already known: an empty classroom.",
      "The activity is already known: working on a science project.",
      "He is about to add something after a new idea.",
    ],
    missingFacts: ["What he adds to the project."],
    rankedMissingFacts: ["What he adds to the project."],
    strongestGap: "What he adds to the project.",
    bestQuestion: "What does he add to the project?",
    acceptableOptions: ["A magnet", "A tiny motor", "A glowing wire", "A paper rotor"],
    badQuestions: ["What happens next?", "What does he find?"],
    reasoning: "The project and setting are known. The plan depends on the exact added element.",
    shouldPlanNow: false,
    shouldAskQuestion: true,
    storyHelpMode: "none",
    tags: ["classroom", "project", "addition", "invention"],
  }),
  createExample({
    id: "workshop-invention-addition",
    category: "workshop-invention",
    userPrompt:
      "In a cluttered workshop, a stick figure builds a weird machine. It almost works, but then he grabs one last part from a tray.",
    story:
      "A stick figure in a workshop tinkers with a half-working machine and reaches for one final part.",
    knownFacts: [
      "The place is already known: a workshop.",
      "The action is already known: he is building a machine.",
      "He is about to add a final part.",
    ],
    missingFacts: ["What final part he adds."],
    rankedMissingFacts: ["What final part he adds."],
    strongestGap: "What final part he adds.",
    bestQuestion: "What final part does he add to the machine?",
    acceptableOptions: ["A crank", "A battery", "A speaker", "A crystal tube"],
    badQuestions: ["What happens next?", "What does he build?"],
    reasoning: "The machine already exists in the setup. The strongest missing beat is the final part that changes the outcome.",
    shouldPlanNow: false,
    shouldAskQuestion: true,
    storyHelpMode: "none",
    tags: ["workshop", "invention", "machine", "addition"],
  }),
  createExample({
    id: "outside-response-whistle",
    category: "outside-response",
    userPrompt: "A kid blows a whistle. Something outside responds.",
    story: "A kid blows a whistle and something outside answers it.",
    knownFacts: [
      "The trigger action is already known: a whistle is blown.",
      "A response happens outside.",
    ],
    missingFacts: ["What responds outside."],
    rankedMissingFacts: ["What responds outside."],
    strongestGap: "What responds outside.",
    bestQuestion: "What responds outside?",
    acceptableOptions: ["A dog barking", "A train horn", "Another whistle", "A flock of birds"],
    badQuestions: ["What happens next?", "Who opens the first exchange?"],
    reasoning: "The setup is tiny but clear. The only meaningful gap is the outside responder.",
    shouldPlanNow: false,
    shouldAskQuestion: true,
    storyHelpMode: "none",
    tags: ["outside-response", "whistle", "responder"],
  }),
  createExample({
    id: "envelope-contents",
    category: "hidden-contents",
    userPrompt:
      "A stick figure finds an envelope taped under a desk after school. He checks the hallway, peels it free, and slowly opens it.",
    story:
      "A stick figure finds a hidden envelope under a desk, checks if anyone is nearby, and opens it after school.",
    knownFacts: [
      "The object is already known: an envelope.",
      "The place is already known: a classroom after school.",
      "He opens the envelope carefully.",
    ],
    missingFacts: ["What is inside the envelope."],
    rankedMissingFacts: ["What is inside the envelope."],
    strongestGap: "What is inside the envelope.",
    bestQuestion: "What is inside the envelope?",
    acceptableOptions: ["A map", "A note", "A keycard", "A photo"],
    badQuestions: ["What does he find?", "What happens next?"],
    reasoning: "The envelope itself is not missing. The meaningful unknown is its contents.",
    shouldPlanNow: false,
    shouldAskQuestion: true,
    storyHelpMode: "none",
    tags: ["envelope", "hidden-contents", "classroom"],
  }),
  createExample({
    id: "envelope-choice",
    category: "choice",
    userPrompt:
      "She opens an envelope at a train station bench, reads one line, and looks up at the departure board like she has to decide right now.",
    story:
      "A stick figure reads a crucial note from an envelope at a train station and looks at the departures board with urgency.",
    knownFacts: [
      "The place is already known: a train station.",
      "The object is already known: an envelope with a note.",
      "The note forces an immediate decision.",
    ],
    missingFacts: ["What choice she makes."],
    rankedMissingFacts: ["What choice she makes."],
    strongestGap: "What choice she makes.",
    bestQuestion: "What choice does she make?",
    acceptableOptions: ["Boards the train", "Tears up the ticket", "Runs back outside"],
    badQuestions: ["What happens next?", "What does she find?"],
    reasoning: "The envelope contents already drove the scene into a decision beat, so the key gap is the choice.",
    shouldPlanNow: false,
    shouldAskQuestion: true,
    storyHelpMode: "none",
    tags: ["train-station", "choice", "envelope"],
  }),
  createExample({
    id: "watcher-identity-court",
    category: "watcher-identity",
    userPrompt:
      "A stick figure practices alone on a basketball court. He nails a trick shot, smiles, then notices someone standing at the edge of the court.",
    story:
      "A player practices alone on a court, lands a trick shot, and notices someone watching from the edge.",
    knownFacts: [
      "The place is already known: a basketball court.",
      "Someone is already watching from the edge of the court.",
    ],
    missingFacts: ["Who is standing at the edge of the court."],
    rankedMissingFacts: ["Who is standing at the edge of the court."],
    strongestGap: "Who is standing at the edge of the court.",
    bestQuestion: "Who is standing at the edge of the court?",
    acceptableOptions: ["A coach", "A rival", "A friend", "A younger sibling"],
    badQuestions: ["What happens next?", "Who opens the first exchange?"],
    reasoning: "The unknown watcher is the scene's strongest unresolved beat.",
    shouldPlanNow: false,
    shouldAskQuestion: true,
    storyHelpMode: "none",
    tags: ["sports", "watcher", "identity", "court"],
  }),
  createExample({
    id: "door-opener-gym",
    category: "door-opener",
    userPrompt:
      "He hears the gym door open while he's setting up by himself. He stops and looks over his shoulder.",
    story:
      "A stick figure setting up in an empty gym hears the door open and turns toward it.",
    knownFacts: [
      "The place is already known: a gym.",
      "The trigger action is already known: the door opens.",
    ],
    missingFacts: ["Who opens the gym door."],
    rankedMissingFacts: ["Who opens the gym door."],
    strongestGap: "Who opens the gym door.",
    bestQuestion: "Who opens the gym door?",
    acceptableOptions: ["A coach", "A teammate", "A rival", "The janitor"],
    badQuestions: ["What happens next?", "Who opens the first exchange?"],
    reasoning: "The incoming person is the strongest missing beat driving the scene forward.",
    shouldPlanNow: false,
    shouldAskQuestion: true,
    storyHelpMode: "none",
    tags: ["gym", "door-opener", "identity"],
  }),
  createExample({
    id: "unknown-caller-shelves",
    category: "unknown-caller",
    userPrompt:
      "He hides between library shelves with a closed notebook in his hands. A voice suddenly calls his name from somewhere behind him.",
    story:
      "A stick figure clutches a notebook between library shelves when someone behind him calls his name.",
    knownFacts: [
      "The place is already known: between library shelves.",
      "Someone calls his name from behind him.",
    ],
    missingFacts: ["Who calls his name from behind the shelves."],
    rankedMissingFacts: ["Who calls his name from behind the shelves."],
    strongestGap: "Who calls his name from behind the shelves.",
    bestQuestion: "Who calls his name from behind the shelves?",
    acceptableOptions: ["His friend", "The librarian", "A sibling", "A stranger"],
    badQuestions: ["What happens next?", "What does he find?"],
    reasoning: "The identity of the caller is the direct unresolved tension beat.",
    shouldPlanNow: false,
    shouldAskQuestion: true,
    storyHelpMode: "none",
    tags: ["library", "caller", "identity"],
  }),
  createExample({
    id: "hesitation-bridge-choice",
    category: "hesitation",
    userPrompt:
      "A stick figure runs to a bridge, stops at the edge, and stares at the other side like he wants to go but can't commit.",
    story:
      "A stick figure reaches a bridge, hesitates at the edge, and struggles to commit to crossing.",
    knownFacts: [
      "The place is already known: a bridge.",
      "The action is already known: he stops and hesitates.",
    ],
    missingFacts: ["Why he hesitates."],
    rankedMissingFacts: ["Why he hesitates."],
    strongestGap: "Why he hesitates.",
    bestQuestion: "Why does he hesitate?",
    acceptableOptions: ["Someone is waiting there", "He sees a memory trigger", "The bridge is unsafe"],
    badQuestions: ["What happens next?", "What does he find?"],
    reasoning: "The hesitation already happened. The missing emotional cause matters most for planning the scene.",
    shouldPlanNow: false,
    shouldAskQuestion: true,
    storyHelpMode: "none",
    tags: ["hesitation", "choice", "bridge", "emotional"],
  }),
  createExample({
    id: "bag-hidden-contents",
    category: "hidden-contents",
    userPrompt:
      "She ducks into an empty hallway, opens her bag, and pulls out something wrapped in cloth.",
    story:
      "A stick figure slips into an empty hallway and carefully takes a cloth-wrapped item out of her bag.",
    knownFacts: [
      "The place is already known: an empty hallway.",
      "She takes something wrapped in cloth out of her bag.",
    ],
    missingFacts: ["What she takes out of the bag."],
    rankedMissingFacts: ["What she takes out of the bag."],
    strongestGap: "What she takes out of the bag.",
    bestQuestion: "What does she take out of the bag?",
    acceptableOptions: ["A photograph", "A small trophy", "A cracked mask", "A device"],
    badQuestions: ["What happens next?", "What does she find?"],
    reasoning: "The strongest missing detail is the concealed item itself.",
    shouldPlanNow: false,
    shouldAskQuestion: true,
    storyHelpMode: "none",
    tags: ["bag", "hidden-contents", "hallway"],
  }),
  createExample({
    id: "complete-story-plan-now-library",
    category: "complete-enough",
    userPrompt:
      "A stick figure sneaks into a library archive, finds a notebook with a map, follows the map to a hidden panel, opens it, and discovers a box with his family name on it. He hears footsteps, hides the box, and slips out before anyone sees him.",
    story:
      "A stick figure sneaks into a library archive, finds a mapped notebook, opens a hidden panel, discovers a family box, hides it when footsteps approach, and escapes.",
    knownFacts: [
      "The object, place, reveal, and outcome are already explicit.",
      "The sequence already has a beginning, middle, and ending.",
    ],
    missingFacts: [],
    rankedMissingFacts: [],
    strongestGap: "",
    bestQuestion: null,
    acceptableOptions: [],
    badQuestions: ["What does he find?", "What happens next?"],
    reasoning: "The story is already complete enough for planning. Asking more would only slow it down.",
    shouldPlanNow: true,
    shouldAskQuestion: false,
    storyHelpMode: "none",
    tags: ["complete-story", "library", "plan-now"],
  }),
  createExample({
    id: "complete-emotional-scene",
    category: "complete-enough",
    userPrompt:
      "Two stick figures sit on a roof after a fight. One finally admits he lied earlier, the other goes quiet, then nods. They watch the sunrise and decide to start over.",
    story:
      "Two stick figures resolve an emotional rooftop scene after a confession and decide to rebuild trust at sunrise.",
    knownFacts: [
      "The emotional turn is already clear.",
      "The ending decision is already clear.",
    ],
    missingFacts: [],
    rankedMissingFacts: [],
    strongestGap: "",
    bestQuestion: null,
    acceptableOptions: [],
    badQuestions: ["What happens next?", "What feeling should lead the scene?"],
    reasoning: "The scene already contains the confession, reaction, and ending beat, so it is ready for a plan.",
    shouldPlanNow: true,
    shouldAskQuestion: false,
    storyHelpMode: "none",
    tags: ["complete-story", "emotional", "plan-now"],
  }),
  createExample({
    id: "fight-missing-opener",
    category: "fight-missing-opener",
    userPrompt:
      "Two stick figures square off in the rain on a rooftop. They circle each other, tense and ready, but I have not decided who throws the first move.",
    story:
      "Two fighters face off on a rainy rooftop, ready to start, but the opening move is still unknown.",
    knownFacts: [
      "The scene is a fight on a rooftop in the rain.",
      "Both fighters are present and ready.",
    ],
    missingFacts: ["Who opens the fight."],
    rankedMissingFacts: ["Who opens the fight."],
    strongestGap: "Who opens the fight.",
    bestQuestion: "Who starts the fight?",
    acceptableOptions: ["The red fighter", "The blue fighter", "They clash at the same time"],
    badQuestions: ["What happens next?", "What does he find?"],
    reasoning: "This is one of the rare cases where the opener is the real missing lock because the entire fight plan depends on it.",
    shouldPlanNow: false,
    shouldAskQuestion: true,
    storyHelpMode: "none",
    tags: ["fight", "opener", "rooftop"],
  }),
  createExample({
    id: "fight-known-winner-plan",
    category: "fight-known-winner",
    userPrompt:
      "Two stick figures fight in an alley. The red one rushes first, the blue one gets knocked down, recovers, and wins with a spinning kick at the end.",
    story:
      "A two-person alley fight already specifies the opener, turnaround, and winner.",
    knownFacts: [
      "The opener is already known: the red fighter rushes first.",
      "The winner is already known: the blue fighter wins.",
      "The middle turnaround is already present.",
    ],
    missingFacts: [],
    rankedMissingFacts: [],
    strongestGap: "",
    bestQuestion: null,
    acceptableOptions: [],
    badQuestions: ["Who opens the first exchange?", "Who wins?"],
    reasoning: "The key fight locks are already present, so the model should plan rather than re-ask solved facts.",
    shouldPlanNow: true,
    shouldAskQuestion: false,
    storyHelpMode: "none",
    tags: ["fight", "known-opener", "known-winner", "plan-now"],
  }),
  createExample({
    id: "story-help-school-create",
    category: "story-help",
    userPrompt: "Can you help me make a school story for Generate Plans?",
    story: "The user wants help creating a school story and has not provided a full plot yet.",
    knownFacts: ["The setting preference is school."],
    missingFacts: ["The core concept of the story."],
    rankedMissingFacts: ["The core concept of the story."],
    strongestGap: "The user needs a story direction, not a fact-check question.",
    bestQuestion: null,
    acceptableOptions: [],
    badQuestions: ["What happens next?", "What does he find?"],
    reasoning:
      "When the user asks for story help, the model should help create a strong story direction instead of forcing a narrow follow-up question.",
    shouldPlanNow: true,
    shouldAskQuestion: false,
    storyHelpMode: "create",
    tags: ["story-help", "school", "create-story"],
  }),
  createExample({
    id: "story-help-improve-rough-idea",
    category: "story-help",
    userPrompt: "Improve this idea: a kid finds something weird in class and gets in trouble.",
    story:
      "The user has a rough classroom idea but wants it improved into a stronger story direction.",
    knownFacts: [
      "The setting is class.",
      "A weird discovery and trouble both matter to the concept.",
    ],
    missingFacts: ["The exact weird discovery that makes the story specific."],
    rankedMissingFacts: ["The exact weird discovery that makes the story specific."],
    strongestGap: "The exact weird discovery that makes the story specific.",
    bestQuestion: "What weird thing does the kid discover in class?",
    acceptableOptions: ["A hidden note", "A moving sketch", "A broken key", "A secret recording"],
    badQuestions: ["What happens next?", "What does he find?"],
    reasoning:
      "For improve-my-story prompts, one precise creative gap can be useful, but the question should stay tied to the concept the user already gave.",
    shouldPlanNow: false,
    shouldAskQuestion: true,
    storyHelpMode: "improve",
    tags: ["story-help", "improve", "classroom"],
  }),
  createExample({
    id: "story-help-no-story-weird-funny",
    category: "story-help",
    userPrompt: "I want a weird funny story but I do not know what should happen.",
    story: "The user wants a weird funny story but has no plot yet.",
    knownFacts: ["The desired tone is weird and funny."],
    missingFacts: ["A core story premise."],
    rankedMissingFacts: ["A core story premise."],
    strongestGap: "The user needs a premise, not a narrow follow-up question.",
    bestQuestion: null,
    acceptableOptions: [],
    badQuestions: ["What happens next?", "Who opens the door?"],
    reasoning:
      "This should move straight into story creation help because the user asked for invention, not clarification.",
    shouldPlanNow: true,
    shouldAskQuestion: false,
    storyHelpMode: "create",
    tags: ["story-help", "weird", "funny", "create-story"],
  }),
  createExample({
    id: "classroom-door-opener",
    category: "door-opener",
    userPrompt:
      "A student stays alone in the classroom after the bell. The door opens behind him while he is hiding a paper under his notebook.",
    story:
      "A student is alone in a classroom, hiding a paper, when the classroom door opens behind him.",
    knownFacts: [
      "The place is already known: a classroom.",
      "The trigger beat is already known: the door opens.",
    ],
    missingFacts: ["Who opens the classroom door."],
    rankedMissingFacts: ["Who opens the classroom door."],
    strongestGap: "Who opens the classroom door.",
    bestQuestion: "Who opens the classroom door?",
    acceptableOptions: ["A teacher", "A friend", "The principal"],
    badQuestions: ["What happens next?", "What does he find?"],
    reasoning: "The identity of the door opener is the strongest unresolved beat.",
    shouldPlanNow: false,
    shouldAskQuestion: true,
    storyHelpMode: "none",
    tags: ["classroom", "door-opener", "identity"],
  }),
  createExample({
    id: "surreal-hallway-watcher",
    category: "surreal",
    userPrompt:
      "A stick figure walks through a school hallway where every poster slowly turns to look at him. At the far end, someone is waiting under the flickering exit sign.",
    story:
      "A surreal hallway scene escalates with moving posters and an unknown figure waiting under a flickering sign.",
    knownFacts: [
      "The place is already known: a school hallway.",
      "A watcher is already present under the exit sign.",
    ],
    missingFacts: ["Who is waiting under the exit sign."],
    rankedMissingFacts: ["Who is waiting under the exit sign."],
    strongestGap: "Who is waiting under the exit sign.",
    bestQuestion: "Who is waiting under the exit sign?",
    acceptableOptions: ["A teacher", "A version of himself", "A faceless stranger"],
    badQuestions: ["What happens next?", "What does he find?"],
    reasoning: "The surreal tone is already set. The watcher identity is the strongest specific gap.",
    shouldPlanNow: false,
    shouldAskQuestion: true,
    storyHelpMode: "none",
    tags: ["surreal", "hallway", "watcher"],
  }),
  createExample({
    id: "art-room-choice",
    category: "choice",
    userPrompt:
      "In the art room, a stick figure sees two different paintings on easels: one finished, one ruined. He reaches out like he has to choose which one to save first.",
    story:
      "A stick figure in the art room faces two paintings and has to choose which one to save first.",
    knownFacts: [
      "The place is already known: the art room.",
      "A choice between two paintings is already established.",
    ],
    missingFacts: ["Which painting he chooses to save first."],
    rankedMissingFacts: ["Which painting he chooses to save first."],
    strongestGap: "Which painting he chooses to save first.",
    bestQuestion: "Which painting does he choose to save first?",
    acceptableOptions: ["The finished one", "The ruined one", "He splits his effort between both"],
    badQuestions: ["What happens next?", "What does he find?"],
    reasoning: "The key decision is already framed by the story, so the strongest gap is the choice itself.",
    shouldPlanNow: false,
    shouldAskQuestion: true,
    storyHelpMode: "none",
    tags: ["art-room", "choice", "painting"],
  }),
  createExample({
    id: "outside-response-radio",
    category: "outside-response",
    userPrompt:
      "A kid twists the dial on an old radio in a shed. Something outside answers with the exact same rhythm.",
    story:
      "A kid experiments with an old radio in a shed, and something outside echoes the same rhythm back.",
    knownFacts: [
      "The place is already known: a shed.",
      "The trigger action is already known: he twists the radio dial.",
      "Something outside answers.",
    ],
    missingFacts: ["What responds outside."],
    rankedMissingFacts: ["What responds outside."],
    strongestGap: "What responds outside.",
    bestQuestion: "What responds outside?",
    acceptableOptions: ["A second radio", "A tapping on the wall", "A voice on the fence"],
    badQuestions: ["What happens next?", "What does he find?"],
    reasoning: "The outside responder is the strongest scene-driving unknown.",
    shouldPlanNow: false,
    shouldAskQuestion: true,
    storyHelpMode: "none",
    tags: ["outside-response", "radio", "shed"],
  }),
  createExample({
    id: "project-complete-enough",
    category: "complete-enough",
    userPrompt:
      "A student builds a tiny robot for class, adds a magnet arm, tests it, it fails, then adds a counterweight and finally uses it to grab the teacher's lost keys from under a shelf.",
    story:
      "A classroom invention story already includes the build, failure, fix, and final payoff.",
    knownFacts: [
      "The project and added parts are already known.",
      "The middle failure and ending payoff are already known.",
    ],
    missingFacts: [],
    rankedMissingFacts: [],
    strongestGap: "",
    bestQuestion: null,
    acceptableOptions: [],
    badQuestions: ["What does he add to the project?", "What happens next?"],
    reasoning: "The project already has enough locked beats to move straight into plan generation.",
    shouldPlanNow: true,
    shouldAskQuestion: false,
    storyHelpMode: "none",
    tags: ["complete-story", "project", "classroom", "plan-now"],
  }),
  createExample({
    id: "unknown-identity-platform",
    category: "unknown-identity",
    userPrompt:
      "At a quiet train platform, a stick figure notices the only other person there holding the same torn map he has.",
    story:
      "A stick figure at a train platform notices another person holding the same torn map.",
    knownFacts: [
      "The place is already known: a train platform.",
      "Another person is already present with the same map.",
    ],
    missingFacts: ["Who the other person is."],
    rankedMissingFacts: ["Who the other person is."],
    strongestGap: "Who the other person is.",
    bestQuestion: "Who is the other person on the platform?",
    acceptableOptions: ["A sibling", "A rival", "A stranger working the same puzzle"],
    badQuestions: ["What happens next?", "What does he find?"],
    reasoning: "The shared map is already established. The identity of the other person is the real gap.",
    shouldPlanNow: false,
    shouldAskQuestion: true,
    storyHelpMode: "none",
    tags: ["train-station", "identity", "map"],
  }),
  createExample({
    id: "complete-funny-story",
    category: "complete-enough",
    userPrompt:
      "A stick figure tries to sneak a giant birthday cake through a school hallway, bumps every doorway, finally makes it to the classroom, and the cake collapses right as everyone yells surprise.",
    story:
      "A funny school hallway story already has the setup, escalation, and ending gag.",
    knownFacts: [
      "The main prop and setting are already known.",
      "The escalation and punchline are already known.",
    ],
    missingFacts: [],
    rankedMissingFacts: [],
    strongestGap: "",
    bestQuestion: null,
    acceptableOptions: [],
    badQuestions: ["What happens next?", "What does he find?"],
    reasoning: "This is already plan-ready because the gag structure is complete.",
    shouldPlanNow: true,
    shouldAskQuestion: false,
    storyHelpMode: "none",
    tags: ["complete-story", "funny", "school", "plan-now"],
  }),
  createExample({
    id: "story-help-only-knows-ending",
    category: "story-help",
    userPrompt: "I only know the ending: he opens the door and sees his future self. Help me build the story.",
    story:
      "The user only knows the ending reveal and wants help inventing the rest of the story.",
    knownFacts: ["The ending reveal is already known: he sees his future self behind the door."],
    missingFacts: ["The lead-up story concept."],
    rankedMissingFacts: ["The lead-up story concept."],
    strongestGap: "The user needs help inventing the setup and escalation.",
    bestQuestion: null,
    acceptableOptions: [],
    badQuestions: ["What happens next?", "Who opens the door?"],
    reasoning: "This should go into story-construction help rather than trivia-style questioning.",
    shouldPlanNow: true,
    shouldAskQuestion: false,
    storyHelpMode: "create",
    tags: ["story-help", "ending-first", "future-self", "create-story"],
  }),
  createExample({
    id: "watcher-identity-art-room",
    category: "watcher-identity",
    userPrompt:
      "A stick figure paints alone in the art room at night. When he steps back, he notices someone reflected in the dark window behind him.",
    story:
      "A night art-room scene reveals an unknown watcher reflected behind the painter.",
    knownFacts: [
      "The place is already known: the art room at night.",
      "A reflected watcher is already present.",
    ],
    missingFacts: ["Who is reflected in the window."],
    rankedMissingFacts: ["Who is reflected in the window."],
    strongestGap: "Who is reflected in the window.",
    bestQuestion: "Who is reflected in the window behind him?",
    acceptableOptions: ["His teacher", "His friend", "A masked stranger", "His own reflection acting strangely"],
    badQuestions: ["What happens next?", "What does he find?"],
    reasoning: "The watcher identity is the strongest specific gap in the scene.",
    shouldPlanNow: false,
    shouldAskQuestion: true,
    storyHelpMode: "none",
    tags: ["art-room", "watcher", "night"],
  }),
  createExample({
    id: "choice-after-envelope-station",
    category: "choice",
    userPrompt:
      "She reads a letter at a bus stop, tears up, then looks at the bus pulling in like she has to choose right now.",
    story:
      "A stick figure receives emotional news at a bus stop and faces an immediate decision when the bus arrives.",
    knownFacts: [
      "The place is already known: a bus stop.",
      "The emotional trigger is already known: the letter changes her mood.",
    ],
    missingFacts: ["What choice she makes when the bus arrives."],
    rankedMissingFacts: ["What choice she makes when the bus arrives."],
    strongestGap: "What choice she makes when the bus arrives.",
    bestQuestion: "What choice does she make when the bus arrives?",
    acceptableOptions: ["She gets on", "She stays", "She runs after someone instead"],
    badQuestions: ["What happens next?", "What does she find?"],
    reasoning: "The scene hinges on the decision, not on generic continuation.",
    shouldPlanNow: false,
    shouldAskQuestion: true,
    storyHelpMode: "none",
    tags: ["choice", "letter", "station", "emotional"],
  }),
  createExample({
    id: "complete-surreal-plan-now",
    category: "complete-enough",
    userPrompt:
      "A stick figure follows a floating chalk line through an empty school, opens a classroom door, steps into an exact copy of the hallway he started in, and finally realizes the only exit is the drawing he made on the board earlier.",
    story:
      "A surreal school loop story already contains the hook, reveal, and ending realization.",
    knownFacts: [
      "The surreal loop is already clear.",
      "The ending reveal is already present.",
    ],
    missingFacts: [],
    rankedMissingFacts: [],
    strongestGap: "",
    bestQuestion: null,
    acceptableOptions: [],
    badQuestions: ["What happens next?", "Who opens the door?"],
    reasoning: "The story is already complete enough for a plan. Extra questioning would only flatten the idea.",
    shouldPlanNow: true,
    shouldAskQuestion: false,
    storyHelpMode: "none",
    tags: ["complete-story", "surreal", "school", "plan-now"],
  }),
  createExample({
    id: "story-help-fight-no-plot",
    category: "story-help",
    userPrompt: "I want a stick figure fight, but I do not know what the plot should be.",
    story: "The user wants a stick figure fight story but does not have the conflict or plot yet.",
    knownFacts: [
      "The user wants a stick figure fight.",
      "The user still needs the story hook and conflict.",
    ],
    missingFacts: ["The conflict that gives the fight a reason.", "The visual hook that makes the fight memorable."],
    rankedMissingFacts: ["The conflict that gives the fight a reason.", "The visual hook that makes the fight memorable."],
    strongestGap: "The user needs a strong fight premise, not a narrow fact check.",
    bestQuestion: "What kind of fight do you want: rivalry, rescue, tournament, or misunderstanding?",
    acceptableOptions: ["Rivalry", "Rescue", "Tournament", "Misunderstanding"],
    badQuestions: ["Who goes first?", "What happens next?"],
    reasoning:
      "This is story creation, so one focused creative question can lock the premise before the plan. It should not jump straight into opener trivia.",
    shouldPlanNow: false,
    shouldAskQuestion: true,
    storyHelpMode: "create",
    enoughKnownToPlan: false,
    maxQuestionsBeforePlanning: 3,
    badStyleNotes: [
      ...COMMON_BAD_STYLE_NOTES,
      "Do not jump straight to fight choreography before the premise exists.",
    ],
    tags: ["story-help", "create-story", "fight", "stick-figure", "animation"],
  }),
  createExample({
    id: "story-help-school-setting-only",
    category: "story-help",
    userPrompt: "I want a school story, but I only know the setting so far.",
    story: "The user knows the school setting but still needs the core story situation.",
    knownFacts: ["The story should happen at school."],
    missingFacts: ["The central problem or hook.", "The tone of the story."],
    rankedMissingFacts: ["The central problem or hook.", "The tone of the story."],
    strongestGap: "The user needs a school-story hook.",
    bestQuestion: "What kind of school story do you want: mystery, comedy, drama, or action?",
    acceptableOptions: ["Mystery", "Comedy", "Drama", "Action"],
    badQuestions: ["What happens next?", "What does he find?"],
    reasoning:
      "When only the setting is known, the best move is one focused genre question that unlocks the story direction.",
    shouldPlanNow: false,
    shouldAskQuestion: true,
    storyHelpMode: "create",
    enoughKnownToPlan: false,
    maxQuestionsBeforePlanning: 3,
    tags: ["story-help", "create-story", "school", "setting-only"],
  }),
  createExample({
    id: "story-help-character-only-hand-drawn",
    category: "story-help",
    userPrompt:
      "I only know the main character is a hand-drawn stick figure with way too much confidence. Help me build the story.",
    story:
      "The user has a character concept for a hand-drawn stick figure but needs the actual story direction.",
    knownFacts: [
      "The main character is a hand-drawn stick figure.",
      "The character's attitude is overconfident.",
    ],
    missingFacts: ["The problem that tests the character.", "The setting that lets the attitude play visually."],
    rankedMissingFacts: ["The problem that tests the character.", "The setting that lets the attitude play visually."],
    strongestGap: "The story needs a challenge that pushes back on the overconfident character.",
    bestQuestion: "What kind of problem should test him: school trouble, a duel, a performance, or a rescue?",
    acceptableOptions: ["School trouble", "A duel", "A performance", "A rescue"],
    badQuestions: ["What happens next?", "Who wins?"],
    reasoning:
      "A strong character-only prompt benefits from one clean question that turns personality into plot.",
    shouldPlanNow: false,
    shouldAskQuestion: true,
    storyHelpMode: "create",
    enoughKnownToPlan: false,
    maxQuestionsBeforePlanning: 3,
    tags: ["story-help", "character-only", "hand-drawn", "stick-figure", "create-story"],
  }),
  createExample({
    id: "story-help-mood-only-emotional",
    category: "story-help",
    userPrompt: "I want an emotional story, but I only know the mood, not the plot.",
    story: "The user knows the emotional tone but still needs the story situation.",
    knownFacts: ["The desired mood is emotional."],
    missingFacts: ["The relationship at the center.", "The emotional turning point."],
    rankedMissingFacts: ["The relationship at the center.", "The emotional turning point."],
    strongestGap: "The user needs the relationship that carries the emotional story.",
    bestQuestion: "What relationship should the story focus on: friends, siblings, parent and kid, or teammates?",
    acceptableOptions: ["Friends", "Siblings", "Parent and kid", "Teammates"],
    badQuestions: ["What happens next?", "What feeling should lead the scene?"],
    reasoning:
      "Mood alone is not enough to plan. The most useful next step is clarifying the relationship that will carry the emotion.",
    shouldPlanNow: false,
    shouldAskQuestion: true,
    storyHelpMode: "create",
    enoughKnownToPlan: false,
    maxQuestionsBeforePlanning: 3,
    tags: ["story-help", "emotional", "mood-only", "create-story"],
  }),
  createExample({
    id: "story-help-weird-funny-premise",
    category: "story-help",
    userPrompt: "Give me a weird funny stick figure idea that would animate well.",
    story: "The user wants a weird funny stick figure story idea that is visually strong for animation.",
    knownFacts: [
      "The user wants weird and funny.",
      "The idea should animate well.",
      "The story should fit stick figures.",
    ],
    missingFacts: [],
    rankedMissingFacts: [],
    strongestGap: "The model should invent a visual premise instead of asking another question.",
    bestQuestion: null,
    acceptableOptions: [],
    badQuestions: ["What happens next?", "Who goes first?"],
    reasoning:
      "This is a direct story-creation request. The best behavior is to propose a vivid animation-friendly idea instead of stalling with more questions.",
    shouldPlanNow: true,
    shouldAskQuestion: false,
    storyHelpMode: "create",
    enoughKnownToPlan: true,
    maxQuestionsBeforePlanning: 0,
    tags: ["story-help", "weird", "funny", "stick-figure", "animation", "create-story"],
  }),
  createExample({
    id: "story-help-drawing-story-no-conflict",
    category: "story-help",
    userPrompt: "I want a drawing-based story, but I do not know what the conflict should be.",
    story: "The user wants a drawing-centered story and needs help finding the conflict.",
    knownFacts: ["The story should revolve around drawing."],
    missingFacts: ["The conflict that makes the drawing matter."],
    rankedMissingFacts: ["The conflict that makes the drawing matter."],
    strongestGap: "The drawing story needs a conflict, not generic continuation.",
    bestQuestion: "What kind of conflict do you want around the drawing: it comes alive, it reveals something hidden, it causes trouble, or it helps someone?",
    acceptableOptions: ["Comes alive", "Reveals something hidden", "Causes trouble", "Helps someone"],
    badQuestions: ["What happens next?", "What does he find?"],
    reasoning:
      "The user already chose the medium focus. One conflict question is enough to turn that into a workable story premise.",
    shouldPlanNow: false,
    shouldAskQuestion: true,
    storyHelpMode: "create",
    enoughKnownToPlan: false,
    maxQuestionsBeforePlanning: 3,
    tags: ["story-help", "drawing", "conflict", "create-story", "animation"],
  }),
  createExample({
    id: "story-help-animation-idea",
    category: "story-help",
    userPrompt: "I want a strong animation idea for a short clip, but I do not know the story yet.",
    story: "The user needs a short animation-friendly story idea from scratch.",
    knownFacts: ["The output should work well as a short animation clip."],
    missingFacts: [],
    rankedMissingFacts: [],
    strongestGap: "The model should propose a visual story hook, not ask a low-value question.",
    bestQuestion: null,
    acceptableOptions: [],
    badQuestions: ["What happens next?", "What does he find?"],
    reasoning:
      "The user explicitly wants story invention. It is better to generate a strong visual premise with a clear arc than to stall with generic clarification.",
    shouldPlanNow: true,
    shouldAskQuestion: false,
    storyHelpMode: "create",
    enoughKnownToPlan: true,
    maxQuestionsBeforePlanning: 0,
    tags: ["story-help", "animation", "short-clip", "create-story", "visual-beats"],
  }),
  createExample({
    id: "story-help-surreal-from-nothing",
    category: "story-help",
    userPrompt: "Help me make a surreal story. I do not have anything yet.",
    story: "The user wants a surreal story but has no premise yet.",
    knownFacts: ["The tone should be surreal."],
    missingFacts: ["A surreal hook strong enough to build around."],
    rankedMissingFacts: ["A surreal hook strong enough to build around."],
    strongestGap: "The user needs a surreal premise.",
    bestQuestion: "Do you want the surreal part to feel eerie, funny, or beautiful?",
    acceptableOptions: ["Eerie", "Funny", "Beautiful"],
    badQuestions: ["What happens next?", "Who opens the door?"],
    reasoning:
      "A single tone-calibration question can help shape a surreal idea, but the system should still move to story help quickly.",
    shouldPlanNow: false,
    shouldAskQuestion: true,
    storyHelpMode: "create",
    enoughKnownToPlan: false,
    maxQuestionsBeforePlanning: 2,
    tags: ["story-help", "surreal", "create-story", "tone"],
  }),
  createExample({
    id: "improve-weak-conflict-classroom",
    category: "story-improvement",
    userPrompt: "Improve this: a student finds a weird marker in class. It feels flat right now.",
    story: "The user has a classroom setup but the conflict is too weak to carry the story.",
    knownFacts: [
      "The setting is a classroom.",
      "The key prop is a weird marker.",
    ],
    missingFacts: ["What problem the marker creates."],
    rankedMissingFacts: ["What problem the marker creates."],
    strongestGap: "The rough idea needs a conflict tied to the weird marker.",
    bestQuestion: "What problem should the marker cause: animated drawings, accidental chaos, exposed secrets, or a race against time?",
    acceptableOptions: ["Animated drawings", "Accidental chaos", "Exposed secrets", "A race against time"],
    badQuestions: ["What happens next?", "What does he find?"],
    reasoning:
      "The prop is already known. The best improvement question targets the missing conflict instead of re-asking the setup.",
    shouldPlanNow: false,
    shouldAskQuestion: true,
    storyHelpMode: "improve",
    enoughKnownToPlan: false,
    maxQuestionsBeforePlanning: 3,
    tags: ["story-help", "improve", "classroom", "weak-conflict", "drawing"],
  }),
  createExample({
    id: "improve-weak-ending-fight",
    category: "story-improvement",
    userPrompt: "Improve this fight idea: two stick figures battle in a hallway, but my ending is weak.",
    story: "The user already has a fight setup but the ending payoff is not strong enough.",
    knownFacts: [
      "The scene is a hallway fight.",
      "The user needs a stronger ending.",
    ],
    missingFacts: ["The ending payoff or twist that lands the fight."],
    rankedMissingFacts: ["The ending payoff or twist that lands the fight."],
    strongestGap: "The story needs a stronger ending beat.",
    bestQuestion: "What ending should be executed: a comeback, a reveal, a funny reversal, or a clean knockout?",
    acceptableOptions: ["A comeback", "A reveal", "A funny reversal", "A clean knockout"],
    badQuestions: ["Who goes first?", "What happens next?"],
    reasoning:
      "The improvement target is explicit, so the question should focus on the ending shape instead of the opener.",
    shouldPlanNow: false,
    shouldAskQuestion: true,
    storyHelpMode: "improve",
    enoughKnownToPlan: false,
    maxQuestionsBeforePlanning: 2,
    tags: ["story-help", "improve", "fight", "weak-ending", "stick-figure"],
  }),
  createExample({
    id: "improve-weak-pacing-animation",
    category: "story-improvement",
    userPrompt: "Help me improve this animation idea. The beats are there, but the pacing feels mushy.",
    story: "The user has a rough animation story but needs cleaner pacing and escalation.",
    knownFacts: ["The user has beats already.", "The main issue is pacing."],
    missingFacts: ["Where the escalation should tighten."],
    rankedMissingFacts: ["Where the escalation should tighten."],
    strongestGap: "The model should help sharpen the beat structure.",
    bestQuestion: "Which part feels weakest right now: the opening, the middle escalation, or the ending payoff?",
    acceptableOptions: ["The opening", "The middle escalation", "The ending payoff"],
    badQuestions: ["What happens next?", "What does he find?"],
    reasoning:
      "A pacing problem is best improved by identifying the weakest section, then tightening the plan around it.",
    shouldPlanNow: false,
    shouldAskQuestion: true,
    storyHelpMode: "improve",
    enoughKnownToPlan: false,
    maxQuestionsBeforePlanning: 2,
    tags: ["story-help", "improve", "animation", "weak-pacing", "visual-beats"],
  }),
  createExample({
    id: "improve-missing-reveal-notebook",
    category: "story-improvement",
    userPrompt: "Improve this idea: a kid finds a notebook in the library and gets pulled into a mystery, but it needs a better reveal.",
    story: "The user has a notebook mystery setup but the reveal is not strong enough yet.",
    knownFacts: [
      "The setting is the library.",
      "The story revolves around a notebook mystery.",
    ],
    missingFacts: ["What the reveal actually is."],
    rankedMissingFacts: ["What the reveal actually is."],
    strongestGap: "The story needs a reveal that justifies the mystery setup.",
    bestQuestion: "What should the reveal be: a hidden map, a sketch of him, a warning, or proof someone was there before?",
    acceptableOptions: ["A hidden map", "A sketch of him", "A warning", "Proof someone was there before"],
    badQuestions: ["What does he find?", "What happens next?"],
    reasoning:
      "The notebook is already known. The improvement target is the reveal itself, so the question should lock that in.",
    shouldPlanNow: false,
    shouldAskQuestion: true,
    storyHelpMode: "improve",
    enoughKnownToPlan: false,
    maxQuestionsBeforePlanning: 2,
    tags: ["story-help", "improve", "library", "notebook", "missing-reveal"],
  }),
  createExample({
    id: "improve-missing-emotional-core",
    category: "story-improvement",
    userPrompt: "Improve this rough idea: a student sneaks into the art room at night, but it does not feel emotional yet.",
    story: "The user has a night art-room setup but needs a stronger emotional core.",
    knownFacts: [
      "The setting is the art room at night.",
      "The story already has a sneaking setup.",
    ],
    missingFacts: ["Why the scene matters emotionally."],
    rankedMissingFacts: ["Why the scene matters emotionally."],
    strongestGap: "The story needs an emotional reason for the risky action.",
    bestQuestion: "Why does the art room matter so much to the student?",
    acceptableOptions: ["It was their safe place", "A friend left something there", "It holds a memory", "It decides their future"],
    badQuestions: ["What happens next?", "Who opens the door?"],
    reasoning:
      "The missing piece is not the action but the emotional stake, so the question should target that directly.",
    shouldPlanNow: false,
    shouldAskQuestion: true,
    storyHelpMode: "improve",
    enoughKnownToPlan: false,
    maxQuestionsBeforePlanning: 2,
    tags: ["story-help", "improve", "art-room", "emotional-core"],
  }),
  createExample({
    id: "drawing-effect-question",
    category: "object-effect",
    userPrompt:
      "A hand-drawn stick figure sketches a door on the wall with glowing chalk. The chalk line finishes itself, and the room reacts.",
    story:
      "A hand-drawn stick figure creates a door with glowing chalk, and the room shifts the moment the line closes.",
    knownFacts: [
      "The object is already known: glowing chalk.",
      "The action is already known: a door is drawn on the wall.",
      "The room reacts when the chalk line closes.",
    ],
    missingFacts: ["What the drawn door does."],
    rankedMissingFacts: ["What the drawn door does."],
    strongestGap: "What the drawn door does.",
    bestQuestion: "What does the drawn door do?",
    acceptableOptions: ["Opens into another place", "Pulls things toward it", "Shows a memory", "Lets something out"],
    badQuestions: ["What does he find?", "What happens next?"],
    reasoning:
      "The object is already explicit. The strongest missing beat is the effect of the drawing, which drives the rest of the plan.",
    shouldPlanNow: false,
    shouldAskQuestion: true,
    storyHelpMode: "none",
    enoughKnownToPlan: false,
    maxQuestionsBeforePlanning: 3,
    tags: ["drawing", "hand-drawn", "object-effect", "chalk", "animation"],
  }),
  createExample({
    id: "complete-school-mystery-plan",
    category: "complete-enough",
    userPrompt:
      "A student notices every classroom clock stop at 3:17, follows a humming sound into the science lab, finds a taped-over vent hiding a stolen exam key, and exposes the cheating ring before the final bell.",
    story:
      "A school mystery already has the hook, investigation, reveal, and final payoff.",
    knownFacts: [
      "The beginning hook is clear.",
      "The investigation beat is clear.",
      "The reveal and resolution are already explicit.",
    ],
    missingFacts: [],
    rankedMissingFacts: [],
    strongestGap: "",
    bestQuestion: null,
    acceptableOptions: [],
    badQuestions: ["What happens next?", "What does he find?"],
    reasoning:
      "The story already contains a full arc with clear visual beats, so it should go straight to planning.",
    shouldPlanNow: true,
    shouldAskQuestion: false,
    storyHelpMode: "none",
    enoughKnownToPlan: true,
    maxQuestionsBeforePlanning: 0,
    tags: ["complete-story", "school", "mystery", "plan-now", "visual-beats"],
  }),
  createExample({
    id: "complete-fight-animation-plan",
    category: "complete-enough",
    userPrompt:
      "Two hand-drawn stick figures fight on top of a moving train. Black attacks first, white gets thrown off balance, hooks the rail with a scarf, swings back up, and wins by locking both of them into the tunnel wall right before daylight.",
    story:
      "A train-top fight already includes the opener, escalation, turnaround, and final visual finish.",
    knownFacts: [
      "The fight setup is already clear.",
      "The opener is already known.",
      "The comeback and winning finish are already known.",
    ],
    missingFacts: [],
    rankedMissingFacts: [],
    strongestGap: "",
    bestQuestion: null,
    acceptableOptions: [],
    badQuestions: ["Who goes first in the fight?", "What happens next?"],
    reasoning:
      "This fight is already locked enough for a plan, so asking more would only slow down the animation workflow.",
    shouldPlanNow: true,
    shouldAskQuestion: false,
    storyHelpMode: "none",
    enoughKnownToPlan: true,
    maxQuestionsBeforePlanning: 0,
    tags: ["complete-story", "fight", "animation", "hand-drawn", "plan-now"],
  }),
  createExample({
    id: "complete-emotional-drawing-plan",
    category: "complete-enough",
    userPrompt:
      "A hand-drawn stick figure keeps erasing a portrait in the art room after school, finally leaves one imperfect version on the easel, and his older sister silently hangs it in the hallway before the showcase opens.",
    story:
      "An emotional drawing story already contains the setup, inner conflict, resolution, and payoff image.",
    knownFacts: [
      "The emotional struggle is already known.",
      "The resolution beat is already known.",
      "The visual payoff is already known.",
    ],
    missingFacts: [],
    rankedMissingFacts: [],
    strongestGap: "",
    bestQuestion: null,
    acceptableOptions: [],
    badQuestions: ["Why does he erase it?", "What happens next?"],
    reasoning:
      "The emotional and visual beats are already strong enough to plan without another question.",
    shouldPlanNow: true,
    shouldAskQuestion: false,
    storyHelpMode: "none",
    enoughKnownToPlan: true,
    maxQuestionsBeforePlanning: 0,
    tags: ["complete-story", "emotional", "drawing", "art-room", "plan-now"],
  }),
  createExample({
    id: "complete-weird-funny-plan",
    category: "complete-enough",
    userPrompt:
      "A stick figure janitor keeps sweeping away tiny doodles in the hallway, only to realize the doodles are slowly rebuilding themselves into a giant parade float that rolls into the principal's office at the exact wrong time.",
    story:
      "A weird funny school story already has the setup gag, escalation, and final payoff.",
    knownFacts: [
      "The weird comedy hook is already clear.",
      "The escalation is already clear.",
      "The ending gag is already clear.",
    ],
    missingFacts: [],
    rankedMissingFacts: [],
    strongestGap: "",
    bestQuestion: null,
    acceptableOptions: [],
    badQuestions: ["What happens next?", "What does he find?"],
    reasoning:
      "The comic structure is already complete enough for a plan, so extra questions would just flatten the joke.",
    shouldPlanNow: true,
    shouldAskQuestion: false,
    storyHelpMode: "none",
    enoughKnownToPlan: true,
    maxQuestionsBeforePlanning: 0,
    storyStructure: {
      hasClearGoal: true,
      hasConflict: true,
      hasEscalation: true,
      hasTurningPoint: true,
      hasResolution: true,
      characterChange: true,
    },
    storyQualityNotes: [
      "The goal is simple and readable, which makes the comedy easy to follow.",
      "The chaos escalates in clear visual steps instead of repeating the same gag.",
      "The ending resolves the core problem with a strong comedic payoff.",
    ],
    planQualityNotes: [
      "Define sequence in deterministic action order: setup -> escalating hallway chaos -> parade reveal -> final office payoff.",
      "Order actions so each doodle step becomes visibly bigger than the last while staying executable.",
      "End on the principal-office crash so the joke lands clearly for animation.",
    ],
    tags: ["complete-story", "weird", "funny", "school", "plan-now"],
  }),
  createExample({
    id: "story-structure-fix-goal-map",
    category: "story-structure-fix",
    userPrompt:
      "A student finds part of a map at a train station and starts following it, but the story feels vague.",
    story:
      "A student follows a torn map through a train station, but the story never says what he wants badly enough to drive the whole scene.",
    knownFacts: [
      "The setting is a train station.",
      "The prop is a torn map.",
      "The main structural issue is a missing clear goal.",
    ],
    missingFacts: ["What he is trying to reach or find with the map."],
    rankedMissingFacts: ["What he is trying to reach or find with the map."],
    strongestGap: "The protagonist needs a clear goal before the plan can get strong.",
    bestQuestion: "What is he trying to reach with the map?",
    acceptableOptions: ["A hidden platform", "A missing person", "A locked storage room", "A train he cannot miss"],
    badQuestions: ["What happens next?", "What does he find?"],
    reasoning:
      "The prop and place are already present, but the story still needs a clear goal so conflict and payoff can matter.",
    shouldPlanNow: false,
    shouldAskQuestion: true,
    storyHelpMode: "improve",
    enoughKnownToPlan: false,
    maxQuestionsBeforePlanning: 2,
    storyStructure: {
      hasClearGoal: false,
      hasConflict: false,
      hasEscalation: false,
      hasTurningPoint: false,
      hasResolution: false,
      characterChange: false,
    },
    storyQualityNotes: [
      "The story needs a clear goal for the main character.",
      "Without a goal, the middle cannot escalate in a meaningful way.",
    ],
    planQualityNotes: [
      "Lock the goal first so the setup, obstacles, and ending all point at the same objective.",
      "Once the goal is known, build a rising sequence of station obstacles that block it.",
    ],
    tags: ["structure", "goal", "train-station", "improve"],
  }),
  createExample({
    id: "weak-conflict-classroom-robot-structure",
    category: "weak-conflict",
    userPrompt:
      "A kid builds a tiny robot in class and shows it off, but the story feels flat.",
    story:
      "The robot exists, but nothing strong gets in the way, so the story has no real conflict or pressure.",
    knownFacts: [
      "The setting is a classroom.",
      "The main prop is a tiny robot.",
      "The structural weakness is low conflict.",
    ],
    missingFacts: ["What goes wrong or blocks the robot when it matters most."],
    rankedMissingFacts: ["What goes wrong or blocks the robot when it matters most."],
    strongestGap: "The story needs conflict that tests the robot and the kid at the same time.",
    bestQuestion: "What goes wrong with the robot when he needs it most?",
    acceptableOptions: ["It stops working", "It grabs the wrong thing", "A rival sabotages it", "The teacher almost takes it away"],
    badQuestions: ["What happens next?", "What does he add to the project?"],
    reasoning:
      "The project already exists. The stronger structural lock is the obstacle that creates tension and escalation.",
    shouldPlanNow: false,
    shouldAskQuestion: true,
    storyHelpMode: "improve",
    enoughKnownToPlan: false,
    maxQuestionsBeforePlanning: 2,
    storyStructure: {
      hasClearGoal: true,
      hasConflict: false,
      hasEscalation: false,
      hasTurningPoint: false,
      hasResolution: false,
      characterChange: false,
    },
    storyQualityNotes: [
      "The conflict is too weak and needs escalation.",
      "The robot should create a problem before it earns its payoff.",
    ],
    planQualityNotes: [
      "Give the robot a visible failure in the middle so the climax can pay off the fix.",
      "Make the ending resolve the same problem the robot caused or failed to solve earlier.",
    ],
    tags: ["structure", "weak-conflict", "classroom", "robot", "improve"],
  }),
  createExample({
    id: "missing-climax-library-door-structure",
    category: "missing-climax",
    userPrompt:
      "A student finds a hidden library door and opens it, but the ending does not really hit.",
    story:
      "The story has a mystery setup, but there is no real turning point or climax once the door opens.",
    knownFacts: [
      "The setting is the library.",
      "A hidden door has already been discovered.",
      "The story lacks a strong climax.",
    ],
    missingFacts: ["What major choice or reveal happens when the door opens."],
    rankedMissingFacts: ["What major choice or reveal happens when the door opens."],
    strongestGap: "The climax needs a change point, not just the door opening itself.",
    bestQuestion: "What major reveal or choice happens when the hidden door opens?",
    acceptableOptions: ["He finds family records", "He sees someone waiting", "He must destroy something", "He realizes the room is his destination's trap"],
    badQuestions: ["What happens next?", "Who opens the door?"],
    reasoning:
      "Opening the door is only the threshold. The story still needs the real turning point behind it.",
    shouldPlanNow: false,
    shouldAskQuestion: true,
    storyHelpMode: "improve",
    enoughKnownToPlan: false,
    maxQuestionsBeforePlanning: 2,
    storyStructure: {
      hasClearGoal: true,
      hasConflict: true,
      hasEscalation: true,
      hasTurningPoint: false,
      hasResolution: false,
      characterChange: false,
    },
    storyQualityNotes: [
      "There is no turning point where things really change.",
      "The ending does not yet resolve the main problem.",
    ],
    planQualityNotes: [
      "Use the hidden door as the threshold into the real climax, not the climax itself.",
      "The reveal behind the door should force a decision that defines the ending.",
    ],
    tags: ["structure", "missing-climax", "library", "improve"],
  }),
  createExample({
    id: "no-resolution-roof-friends-structure",
    category: "no-resolution",
    userPrompt:
      "Two friends argue on the school roof and the scene ends there. It feels unfinished.",
    story:
      "The emotional setup exists, but the story stops before the friendship conflict is actually resolved or transformed.",
    knownFacts: [
      "The setting is the school roof.",
      "The conflict is between two friends.",
      "The structural issue is a missing resolution.",
    ],
    missingFacts: ["What decision or outcome ends the argument."],
    rankedMissingFacts: ["What decision or outcome ends the argument."],
    strongestGap: "The story needs an ending choice so the roof scene changes something.",
    bestQuestion: "What decision do they make on the roof?",
    acceptableOptions: ["They start over", "They split up", "They return together", "One leaves and the other follows later"],
    badQuestions: ["What happens next?", "What feeling should lead the scene?"],
    reasoning:
      "The emotion is already there. The missing lock is the actual resolution beat that gives the scene payoff.",
    shouldPlanNow: false,
    shouldAskQuestion: true,
    storyHelpMode: "improve",
    enoughKnownToPlan: false,
    maxQuestionsBeforePlanning: 2,
    storyStructure: {
      hasClearGoal: true,
      hasConflict: true,
      hasEscalation: true,
      hasTurningPoint: false,
      hasResolution: false,
      characterChange: false,
    },
    storyQualityNotes: [
      "The ending does not resolve the main problem.",
      "The scene needs a final choice that changes the relationship.",
    ],
    planQualityNotes: [
      "Hold the roof scene until one decision lands clearly.",
      "The resolution should show whether the conflict actually changed both characters.",
    ],
    tags: ["structure", "no-resolution", "roof", "emotional", "improve"],
  }),
  createExample({
    id: "character-arc-missing-fight-structure",
    category: "character-arc-missing",
    userPrompt:
      "Two stick figures fight and one wins, but it feels empty.",
    story:
      "The fight has action, but the winner does not change or learn anything, so the ending has little emotional payoff.",
    knownFacts: [
      "The story is a fight.",
      "There is a winner already.",
      "The structural issue is a missing character change.",
    ],
    missingFacts: ["What the winning fighter learns or changes before the end."],
    rankedMissingFacts: ["What the winning fighter learns or changes before the end."],
    strongestGap: "The fight needs a character shift so the climax means more than a result.",
    bestQuestion: "What does the winner learn before the fight ends?",
    acceptableOptions: ["Mercy matters", "They were wrong about the rival", "Skill is not enough alone", "Winning costs more than expected"],
    badQuestions: ["Who wins?", "What happens next?"],
    reasoning:
      "The outcome is already known. The stronger missing beat is the internal change that gives the ending meaning.",
    shouldPlanNow: false,
    shouldAskQuestion: true,
    storyHelpMode: "improve",
    enoughKnownToPlan: false,
    maxQuestionsBeforePlanning: 2,
    storyStructure: {
      hasClearGoal: true,
      hasConflict: true,
      hasEscalation: true,
      hasTurningPoint: false,
      hasResolution: true,
      characterChange: false,
    },
    storyQualityNotes: [
      "The character does not change or learn anything.",
      "The climax needs to affect the winner internally, not only physically.",
    ],
    planQualityNotes: [
      "Build the final exchange around a choice or realization, not only the finishing move.",
      "Let the ending show what changed after the winner gets the upper hand.",
    ],
    tags: ["structure", "character-arc-missing", "fight", "stick-figure", "improve"],
  }),
  createExample({
    id: "hero-journey-build-school-structure",
    category: "hero-journey-build",
    userPrompt:
      "A student finds a weird key at school and I want the story to feel more complete.",
    story:
      "The setup is interesting, but the story still needs a stronger goal, obstacle chain, turning point, and ending payoff.",
    knownFacts: [
      "The setting is school.",
      "The prop is a weird key.",
      "The story needs fuller structure.",
    ],
    missingFacts: ["What the student wants enough to chase", "What the key opens when the story reaches its turning point"],
    rankedMissingFacts: ["What the student wants enough to chase", "What the key opens when the story reaches its turning point"],
    strongestGap: "The story needs a goal that turns the key into the center of the whole arc.",
    bestQuestion: "What is the student trying to unlock with the key?",
    acceptableOptions: ["A hidden room", "A locked project box", "A teacher's cabinet", "A place tied to their family"],
    badQuestions: ["What happens next?", "What does he find?"],
    reasoning:
      "The key is only a hook right now. The stronger structural question is the goal that carries the story from setup to payoff.",
    shouldPlanNow: false,
    shouldAskQuestion: true,
    storyHelpMode: "improve",
    enoughKnownToPlan: false,
    maxQuestionsBeforePlanning: 2,
    storyStructure: {
      hasClearGoal: false,
      hasConflict: false,
      hasEscalation: false,
      hasTurningPoint: false,
      hasResolution: false,
      characterChange: false,
    },
    storyQualityNotes: [
      "The story needs a clear goal for the main character.",
      "There is no turning point where the search changes shape.",
      "The ending does not yet pay off the key setup strongly enough.",
    ],
    planQualityNotes: [
      "Define sequence where each stage becomes executable behavior: setup -> pursuit -> setbacks -> reveal -> final outcome.",
      "Make each obstacle logically grow from the goal the key points toward.",
    ],
    tags: ["structure", "hero-journey-build", "school", "key", "improve"],
  }),
  createExample({
    id: "hero-journey-build-surreal-structure",
    category: "hero-journey-build",
    userPrompt:
      "The hallway keeps changing around him, but I do not know what the story is really about yet.",
    story:
      "The surreal effect exists, but the story still needs the real-world problem, escalation path, and ending change that give it structure.",
    knownFacts: [
      "The setting is a changing hallway.",
      "The story has a surreal mechanic.",
      "The structural weakness is missing purpose.",
    ],
    missingFacts: ["What real problem the hallway changes are reflecting."],
    rankedMissingFacts: ["What real problem the hallway changes are reflecting."],
    strongestGap: "The surreal imagery needs a real emotional or practical problem underneath it.",
    bestQuestion: "What real problem is the changing hallway pushing him to face?",
    acceptableOptions: ["A lie he told", "A friend he is avoiding", "A test he is failing", "A memory he keeps dodging"],
    badQuestions: ["What happens next?", "Who opens the door?"],
    reasoning:
      "Once the real problem is known, the weird hallway can escalate toward a meaningful turning point instead of random strangeness.",
    shouldPlanNow: false,
    shouldAskQuestion: true,
    storyHelpMode: "improve",
    enoughKnownToPlan: false,
    maxQuestionsBeforePlanning: 2,
    storyStructure: {
      hasClearGoal: false,
      hasConflict: true,
      hasEscalation: false,
      hasTurningPoint: false,
      hasResolution: false,
      characterChange: false,
    },
    storyQualityNotes: [
      "The conflict is present, but it is not tied to a clear underlying problem yet.",
      "There is no turning point where the surreal element forces a real choice.",
    ],
    planQualityNotes: [
      "Anchor the weirdness to one real issue so each new hallway shift leads somewhere.",
      "Make the ending resolve both the hallway problem and the real-world issue behind it.",
    ],
    tags: ["structure", "hero-journey-build", "surreal", "hallway", "improve"],
  }),
  createExample({
    id: "weak-conflict-art-room-structure",
    category: "weak-conflict",
    userPrompt:
      "A student paints alone in the art room, but nothing really pushes the story.",
    story:
      "The setting and mood are present, but the story still lacks the obstacle or opposing force that creates momentum.",
    knownFacts: [
      "The setting is the art room.",
      "The scene is quiet and reflective.",
      "The story lacks real pressure.",
    ],
    missingFacts: ["What obstacle interrupts or threatens the painting process."],
    rankedMissingFacts: ["What obstacle interrupts or threatens the painting process."],
    strongestGap: "The art-room scene needs a conflict that forces the character to act.",
    bestQuestion: "What threatens the painting before it is finished?",
    acceptableOptions: ["Time running out", "A hidden watcher", "The painting changing", "A decision tied to the showcase"],
    badQuestions: ["What happens next?", "What does he find?"],
    reasoning:
      "The tone already exists. The stronger missing beat is the pressure that turns mood into story movement.",
    shouldPlanNow: false,
    shouldAskQuestion: true,
    storyHelpMode: "improve",
    enoughKnownToPlan: false,
    maxQuestionsBeforePlanning: 2,
    storyStructure: {
      hasClearGoal: true,
      hasConflict: false,
      hasEscalation: false,
      hasTurningPoint: false,
      hasResolution: false,
      characterChange: false,
    },
    storyQualityNotes: [
      "The conflict is too weak and needs escalation.",
      "The middle needs pressure that can visibly worsen before the climax.",
    ],
    planQualityNotes: [
      "Introduce the threat early, then let it grow before the final choice.",
      "The painting should matter to the ending, not just decorate the setup.",
    ],
    tags: ["structure", "weak-conflict", "art-room", "painting", "improve"],
  }),
  createExample({
    id: "missing-climax-talent-show-structure",
    category: "missing-climax",
    userPrompt:
      "A student prepares for the talent show, but the story never has a real peak moment.",
    story:
      "The setup and buildup exist, but the performance story is missing the turning point that makes the climax matter.",
    knownFacts: [
      "The setting is a school talent show.",
      "The character is preparing to perform.",
      "The story lacks a strong climax.",
    ],
    missingFacts: ["What goes wrong or changes right before the performance."],
    rankedMissingFacts: ["What goes wrong or changes right before the performance."],
    strongestGap: "The story needs the moment that forces the performer to change approach under pressure.",
    bestQuestion: "What changes right before the performance starts?",
    acceptableOptions: ["The prop breaks", "The partner is missing", "The audience includes someone important", "The planned routine no longer works"],
    badQuestions: ["What happens next?", "What tone do you want?"],
    reasoning:
      "A performance story needs a sharp turning point right before the stage moment or the climax will feel flat.",
    shouldPlanNow: false,
    shouldAskQuestion: true,
    storyHelpMode: "improve",
    enoughKnownToPlan: false,
    maxQuestionsBeforePlanning: 2,
    storyStructure: {
      hasClearGoal: true,
      hasConflict: true,
      hasEscalation: true,
      hasTurningPoint: false,
      hasResolution: false,
      characterChange: false,
    },
    storyQualityNotes: [
      "There is no turning point where things change before the climax.",
      "The ending needs a stronger payoff tied to the performance risk.",
    ],
    planQualityNotes: [
      "Use rehearsal beats to build tension, then make the pre-show disruption trigger the climax.",
      "The final performance should solve the same problem that threatens it.",
    ],
    tags: ["structure", "missing-climax", "performance", "school", "improve"],
  }),
  createExample({
    id: "plan-quality-upgrade-library-structure",
    category: "plan-quality-upgrade",
    userPrompt:
      "A student follows a moving shadow through the library, finds a hidden archive, and chooses to reveal it before the renovation starts.",
    story:
      "A complete library mystery with a goal, pressure, reveal, and final choice already locked in.",
    knownFacts: [
      "The story has a clear goal and conflict.",
      "The archive reveal is already known.",
      "The ending choice is already known.",
    ],
    missingFacts: [],
    rankedMissingFacts: [],
    strongestGap: "",
    bestQuestion: null,
    acceptableOptions: [],
    badQuestions: ["What happens next?", "What does he find?"],
    reasoning:
      "This story is plan-ready, so the training signal should focus on strengthening the beginning, middle escalation, and payoff in the plan itself.",
    shouldPlanNow: true,
    shouldAskQuestion: false,
    storyHelpMode: "none",
    enoughKnownToPlan: true,
    maxQuestionsBeforePlanning: 0,
    storyStructure: {
      hasClearGoal: true,
      hasConflict: true,
      hasEscalation: true,
      hasTurningPoint: true,
      hasResolution: true,
      characterChange: true,
    },
    storyQualityNotes: [
      "The story has a clear goal, a real obstacle, and a decision-based ending.",
      "The protagonist changes because the reveal forces a moral choice.",
    ],
    planQualityNotes: [
      "Define sequence in deterministic action order: setup -> pursuit through the stacks -> archive reveal -> decision -> resolution.",
      "Add a stronger middle escalation before the archive opens so tension keeps rising.",
      "Make the final reveal visually clear for animation with one decisive archive image.",
    ],
    tags: ["structure", "plan-quality-upgrade", "library", "plan-now", "mystery"],
  }),
  createExample({
    id: "plan-quality-upgrade-fight-structure",
    category: "plan-quality-upgrade",
    userPrompt:
      "Two stick figures fight on a bridge, the bridge starts collapsing, and the winner has to save the loser before the end.",
    story:
      "A complete fight story with clear conflict, escalation, turning point, and emotional payoff already in place.",
    knownFacts: [
      "The fight setup is already known.",
      "The environment escalates the conflict.",
      "The ending payoff is already known: the save matters more than the win.",
    ],
    missingFacts: [],
    rankedMissingFacts: [],
    strongestGap: "",
    bestQuestion: null,
    acceptableOptions: [],
    badQuestions: ["Who wins?", "Who starts the fight?"],
    reasoning:
      "The structure is already present, so the plan should go straight into clean beginning, escalation, climax, and resolution beats.",
    shouldPlanNow: true,
    shouldAskQuestion: false,
    storyHelpMode: "none",
    enoughKnownToPlan: true,
    maxQuestionsBeforePlanning: 0,
    storyStructure: {
      hasClearGoal: true,
      hasConflict: true,
      hasEscalation: true,
      hasTurningPoint: true,
      hasResolution: true,
      characterChange: true,
    },
    storyQualityNotes: [
      "The conflict escalates through the collapsing bridge, not just repeated punches.",
      "The ending resolves the rivalry through character change, not just a result.",
    ],
    planQualityNotes: [
      "Give the bridge collapse a strong midpoint so the fight shifts into a survival-driven climax.",
      "Make the save-before-win beat the emotional turning point of the plan.",
      "End with a clear aftermath image so the resolution is readable, not abrupt.",
    ],
    tags: ["structure", "plan-quality-upgrade", "fight", "bridge", "plan-now"],
  }),
  createExample({
    id: "plan-quality-upgrade-emotional-structure",
    category: "plan-quality-upgrade",
    userPrompt:
      "Two friends rebuild a torn drawing before a hospital visit, and the repaired picture becomes the final payoff.",
    story:
      "A complete emotional story with a clear goal, relationship conflict, emotional turning point, and visual resolution.",
    knownFacts: [
      "The relationship is already clear.",
      "The repaired drawing is already the ending payoff.",
      "The story has a beginning, middle, and end.",
    ],
    missingFacts: [],
    rankedMissingFacts: [],
    strongestGap: "",
    bestQuestion: null,
    acceptableOptions: [],
    badQuestions: ["What happens next?", "What feeling should lead the scene?"],
    reasoning:
      "This story is already complete enough to plan, so the training should reinforce emotional structure and payoff clarity.",
    shouldPlanNow: true,
    shouldAskQuestion: false,
    storyHelpMode: "none",
    enoughKnownToPlan: true,
    maxQuestionsBeforePlanning: 0,
    storyStructure: {
      hasClearGoal: true,
      hasConflict: true,
      hasEscalation: true,
      hasTurningPoint: true,
      hasResolution: true,
      characterChange: true,
    },
    storyQualityNotes: [
      "The story has a clear emotional goal and a meaningful relationship conflict.",
      "The character change is visible because the repair becomes a shared act instead of a lonely one.",
    ],
    planQualityNotes: [
      "Define sequence in deterministic action order: setup -> missing drawing problem -> emotional setback -> repair turning point -> hospital payoff.",
      "Make the middle escalate through failed attempts to fix the situation emotionally, not only physically.",
      "End on the repaired drawing as a clear visual resolution for animation.",
    ],
    tags: ["structure", "plan-quality-upgrade", "emotional", "drawing", "plan-now"],
  }),
  createExample({
    id: "plan-quality-upgrade-comedy-structure",
    category: "plan-quality-upgrade",
    userPrompt:
      "A cafeteria worker tries to stop a tray chain reaction and accidentally turns it into a huge lunch-saving stunt.",
    story:
      "A complete comedy story with a simple goal, escalating chaos, a turning-point stunt, and a big visual payoff.",
    knownFacts: [
      "The comedic premise is already known.",
      "The middle escalation is already implied by the tray chain reaction.",
      "The ending stunt is already known.",
    ],
    missingFacts: [],
    rankedMissingFacts: [],
    strongestGap: "",
    bestQuestion: null,
    acceptableOptions: [],
    badQuestions: ["What happens next?", "What tone do you want?"],
    reasoning:
      "The story is ready to plan; the important training signal is how to structure the comedy beats so each one grows toward the final stunt.",
    shouldPlanNow: true,
    shouldAskQuestion: false,
    storyHelpMode: "none",
    enoughKnownToPlan: true,
    maxQuestionsBeforePlanning: 0,
    storyStructure: {
      hasClearGoal: true,
      hasConflict: true,
      hasEscalation: true,
      hasTurningPoint: true,
      hasResolution: true,
      characterChange: true,
    },
    storyQualityNotes: [
      "The goal is easy to track, which helps the comedy stay readable.",
      "The chain reaction naturally provides escalation and payoff.",
    ],
    planQualityNotes: [
      "Define sequence where each stage becomes executable behavior: setup -> small spill -> bigger tray chaos -> stunt turning point -> final lunch save.",
      "Make each gag bigger than the last so the middle keeps climbing.",
      "Let the final stunt solve the original problem so the comedy ending feels earned.",
    ],
    tags: ["structure", "plan-quality-upgrade", "comedy", "cafeteria", "plan-now"],
  }),
  createExample({
    id: "plan-quality-upgrade-drawing-structure",
    category: "plan-quality-upgrade",
    userPrompt:
      "A student's monster drawing escapes, wrecks the art room, and only calms down when he redraws it the way it used to be.",
    story:
      "A complete drawing-based story with a clear goal, a visible conflict, a real turning point, and a strong visual ending.",
    knownFacts: [
      "The drawing monster is the core conflict.",
      "The art room is the main setting.",
      "The redraw solution is already known.",
    ],
    missingFacts: [],
    rankedMissingFacts: [],
    strongestGap: "",
    bestQuestion: null,
    acceptableOptions: [],
    badQuestions: ["What happens next?", "What does he find?"],
    reasoning:
      "This is already plan-ready, so the example should teach how to turn the drawing premise into a clean animation structure.",
    shouldPlanNow: true,
    shouldAskQuestion: false,
    storyHelpMode: "none",
    enoughKnownToPlan: true,
    maxQuestionsBeforePlanning: 0,
    storyStructure: {
      hasClearGoal: true,
      hasConflict: true,
      hasEscalation: true,
      hasTurningPoint: true,
      hasResolution: true,
      characterChange: true,
    },
    storyQualityNotes: [
      "The central conflict is visual and tied to the main character's mistake.",
      "The ending resolves both the monster problem and the inner problem behind it.",
    ],
    planQualityNotes: [
      "Define sequence in deterministic action order: calm drawing setup -> monster escape -> room destruction escalation -> redraw turning point -> quiet resolution.",
      "Make the monster grow more dangerous in clear stages so the middle keeps building.",
      "Use the redraw beat as a visually simple but emotionally strong climax.",
    ],
    tags: ["structure", "plan-quality-upgrade", "drawing", "art-room", "plan-now"],
  }),
  createExample({
    id: "plan-quality-upgrade-short-animation-structure",
    category: "plan-quality-upgrade",
    userPrompt:
      "A small stick figure tries to carry a giant balloon animal through school and keeps barely saving it until the final classroom reveal.",
    story:
      "A complete short-animation story with one goal, repeated escalation, a sharp turning point, and a strong visual ending.",
    knownFacts: [
      "The story is designed for a short animation.",
      "The giant balloon prop is already the core of the action.",
      "The final reveal is already known.",
    ],
    missingFacts: [],
    rankedMissingFacts: [],
    strongestGap: "",
    bestQuestion: null,
    acceptableOptions: [],
    badQuestions: ["What happens next?", "How long should it feel?"],
    reasoning:
      "The structure is already there, so the plan should focus on compact escalation and a clear ending payoff.",
    shouldPlanNow: true,
    shouldAskQuestion: false,
    storyHelpMode: "none",
    enoughKnownToPlan: true,
    maxQuestionsBeforePlanning: 0,
    storyStructure: {
      hasClearGoal: true,
      hasConflict: true,
      hasEscalation: true,
      hasTurningPoint: true,
      hasResolution: true,
      characterChange: false,
    },
    storyQualityNotes: [
      "The goal is simple and immediate, which suits short-form animation.",
      "The comedy escalates through increasingly difficult near-saves.",
    ],
    planQualityNotes: [
      "Keep the plan tight: setup, hallway obstacle chain, final save, classroom payoff.",
      "Ensure each beat leads logically to the next so the short never feels random.",
      "End on a strong reveal image so the animation has a clean finish.",
    ],
    tags: ["structure", "plan-quality-upgrade", "short-clip", "comedy", "plan-now"],
  }),
  createExample({
    id: "plan-quality-upgrade-surreal-structure",
    category: "plan-quality-upgrade",
    userPrompt:
      "A student rides the late bus in a loop until giving away the sketchbook he keeps hiding finally breaks it.",
    story:
      "A complete surreal story with a clear emotional engine, repeated escalation, a major turning point, and a final release.",
    knownFacts: [
      "The bus loop is already known.",
      "The sketchbook is the emotional anchor.",
      "The handoff breaks the loop.",
    ],
    missingFacts: [],
    rankedMissingFacts: [],
    strongestGap: "",
    bestQuestion: null,
    acceptableOptions: [],
    badQuestions: ["What happens next?", "Who is on the bus?"],
    reasoning:
      "This story is ready for planning. The richer training signal is how to keep the surreal middle escalating toward one meaningful handoff.",
    shouldPlanNow: true,
    shouldAskQuestion: false,
    storyHelpMode: "none",
    enoughKnownToPlan: true,
    maxQuestionsBeforePlanning: 0,
    storyStructure: {
      hasClearGoal: true,
      hasConflict: true,
      hasEscalation: true,
      hasTurningPoint: true,
      hasResolution: true,
      characterChange: true,
    },
    storyQualityNotes: [
      "The surreal concept is tied to a clear emotional issue.",
      "The turning point changes the story because the character finally gives something up.",
    ],
    planQualityNotes: [
      "Stage the loop in repeating beats that get stranger each pass.",
      "Make the sketchbook handoff the visible climax of the plan.",
      "Use the first normal bus ride after the loop breaks as the resolution image.",
    ],
    tags: ["structure", "plan-quality-upgrade", "surreal", "bus", "plan-now"],
  }),
  createExample({
    id: "no-resolution-project-structure",
    category: "no-resolution",
    userPrompt:
      "A student builds a rescue machine, it finally works, and then the story just stops.",
    story:
      "The setup and success beat exist, but the story never shows what the machine actually solves or how the ending pays off the build.",
    knownFacts: [
      "The main prop is a rescue machine.",
      "The machine eventually works.",
      "The structural issue is missing resolution.",
    ],
    missingFacts: ["What final problem the machine solves once it works."],
    rankedMissingFacts: ["What final problem the machine solves once it works."],
    strongestGap: "The ending needs a clear payoff problem that the finished machine resolves.",
    bestQuestion: "What does the rescue machine finally save or retrieve?",
    acceptableOptions: ["A lost ring", "A trapped pet", "A key under the stage", "A broken circuit in the wall"],
    badQuestions: ["What happens next?", "What does he add to the project?"],
    reasoning:
      "The machine is already built. The missing structural lock is the resolution beat that justifies the whole invention arc.",
    shouldPlanNow: false,
    shouldAskQuestion: true,
    storyHelpMode: "improve",
    enoughKnownToPlan: false,
    maxQuestionsBeforePlanning: 2,
    storyStructure: {
      hasClearGoal: true,
      hasConflict: true,
      hasEscalation: true,
      hasTurningPoint: true,
      hasResolution: false,
      characterChange: false,
    },
    storyQualityNotes: [
      "The ending does not resolve the main problem.",
      "The payoff should prove why the machine mattered all along.",
    ],
    planQualityNotes: [
      "Save the final success for a real rescue or retrieval beat.",
      "Let the resolution answer the same problem the build kept chasing.",
    ],
    tags: ["structure", "no-resolution", "project", "invention", "improve"],
  }),
  createExample({
    id: "weak-conflict-sports-structure",
    category: "weak-conflict",
    userPrompt:
      "A player practices a trick shot on the court, but the story does not have enough pressure.",
    story:
      "The sports setup is clear, but the attempt has no real obstacle, deadline, or consequence to push it into a story arc.",
    knownFacts: [
      "The setting is a basketball court.",
      "The main action is a trick shot attempt.",
      "The structural problem is weak conflict.",
    ],
    missingFacts: ["What makes the shot matter right now."],
    rankedMissingFacts: ["What makes the shot matter right now."],
    strongestGap: "The shot needs pressure so the story can escalate toward a payoff.",
    bestQuestion: "What makes the trick shot matter right now?",
    acceptableOptions: ["A watcher is judging him", "It decides the team tryout", "He promised someone he would make it", "It needs to solve another problem"],
    badQuestions: ["What happens next?", "Who is watching?"],
    reasoning:
      "The action alone is not enough. The structural question is the pressure that turns practice into conflict.",
    shouldPlanNow: false,
    shouldAskQuestion: true,
    storyHelpMode: "improve",
    enoughKnownToPlan: false,
    maxQuestionsBeforePlanning: 2,
    storyStructure: {
      hasClearGoal: true,
      hasConflict: false,
      hasEscalation: false,
      hasTurningPoint: false,
      hasResolution: false,
      characterChange: false,
    },
    storyQualityNotes: [
      "The conflict is too weak and needs escalation.",
      "The goal matters more when failure has a visible cost.",
    ],
    planQualityNotes: [
      "Add a clock, judge, promise, or consequence before the shot attempt escalates.",
      "Build the plan so each miss or setback raises the pressure on the final shot.",
    ],
    tags: ["structure", "weak-conflict", "sports", "court", "improve"],
  }),
  createExample({
    id: "character-arc-missing-runner-structure",
    category: "character-arc-missing",
    userPrompt:
      "A fast runner escapes every obstacle, but the story still feels shallow.",
    story:
      "The character can do impressive things, but there is no internal change, so the ending feels like more movement instead of a payoff.",
    knownFacts: [
      "The protagonist is a runner.",
      "The story already has movement and obstacles.",
      "The missing piece is character change.",
    ],
    missingFacts: ["What the runner has to learn before the end."],
    rankedMissingFacts: ["What the runner has to learn before the end."],
    strongestGap: "The runner needs a lesson or change that the final obstacle forces.",
    bestQuestion: "What does the runner have to learn before the end?",
    acceptableOptions: ["To trust someone", "To stop showing off", "To face a fear", "To choose people over speed"],
    badQuestions: ["What happens next?", "How fast is he?"],
    reasoning:
      "The motion beats exist already. The stronger structural gap is the personal change that gives the ending meaning.",
    shouldPlanNow: false,
    shouldAskQuestion: true,
    storyHelpMode: "improve",
    enoughKnownToPlan: false,
    maxQuestionsBeforePlanning: 2,
    storyStructure: {
      hasClearGoal: true,
      hasConflict: true,
      hasEscalation: true,
      hasTurningPoint: false,
      hasResolution: true,
      characterChange: false,
    },
    storyQualityNotes: [
      "The character does not change or learn anything.",
      "The final obstacle should force an internal shift, not only a physical success.",
    ],
    planQualityNotes: [
      "Tie the final sprint to one choice that proves what changed.",
      "Use the ending to show the runner behaving differently than in the setup.",
    ],
    tags: ["structure", "character-arc-missing", "runner", "improve"],
  }),
  createExample({
    id: "story-structure-fix-goal-drawing-showcase",
    category: "story-structure-fix",
    userPrompt:
      "A student keeps sketching after school, but I do not know what the story is building toward.",
    story:
      "The drawing setup has mood, but it lacks the goal that gives the scenes direction and payoff.",
    knownFacts: [
      "The setting is after school.",
      "The character is sketching repeatedly.",
      "The missing structural piece is the goal.",
    ],
    missingFacts: ["What the student wants to finish or prove with the drawings."],
    rankedMissingFacts: ["What the student wants to finish or prove with the drawings."],
    strongestGap: "The story needs a clear destination for all the drawing beats.",
    bestQuestion: "What is the student trying to finish with those drawings?",
    acceptableOptions: ["A showcase piece", "A message for someone", "A clue to a mystery", "A way back to a memory"],
    badQuestions: ["What happens next?", "What does he draw?"],
    reasoning:
      "The act of sketching is already known. The stronger structural lock is the goal that all the scenes aim toward.",
    shouldPlanNow: false,
    shouldAskQuestion: true,
    storyHelpMode: "improve",
    enoughKnownToPlan: false,
    maxQuestionsBeforePlanning: 2,
    storyStructure: {
      hasClearGoal: false,
      hasConflict: false,
      hasEscalation: false,
      hasTurningPoint: false,
      hasResolution: false,
      characterChange: false,
    },
    storyQualityNotes: [
      "The story needs a clear goal for the main character.",
      "The ending will stay vague until the drawings are aiming at something specific.",
    ],
    planQualityNotes: [
      "Lock the goal first, then let each drawing scene move closer to it or complicate it.",
      "The final finished drawing should become the climax or the key to it.",
    ],
    tags: ["structure", "goal", "drawing", "showcase", "improve"],
  }),
  createExample({
    id: "missing-climax-envelope-structure",
    category: "missing-climax",
    userPrompt:
      "A student opens a hidden envelope, but the story still does not have a strong peak moment.",
    story:
      "The mystery setup is there, but the envelope reveal does not yet trigger the major shift that makes the ending feel big enough.",
    knownFacts: [
      "The prop is a hidden envelope.",
      "The envelope gets opened.",
      "The story still lacks a true climax.",
    ],
    missingFacts: ["What the envelope forces the student to do immediately."],
    rankedMissingFacts: ["What the envelope forces the student to do immediately."],
    strongestGap: "The climax needs the envelope to trigger an urgent choice or action.",
    bestQuestion: "What urgent choice does the envelope force him to make?",
    acceptableOptions: ["Run somewhere", "Reveal a secret", "Protect someone", "Give something up"],
    badQuestions: ["What happens next?", "What is inside the envelope?"],
    reasoning:
      "The object is already present. The structural gap is the urgent decision that turns the reveal into a climax.",
    shouldPlanNow: false,
    shouldAskQuestion: true,
    storyHelpMode: "improve",
    enoughKnownToPlan: false,
    maxQuestionsBeforePlanning: 2,
    storyStructure: {
      hasClearGoal: true,
      hasConflict: true,
      hasEscalation: true,
      hasTurningPoint: false,
      hasResolution: false,
      characterChange: false,
    },
    storyQualityNotes: [
      "There is no turning point where things change sharply enough.",
      "The ending needs the envelope reveal to force action, not just information.",
    ],
    planQualityNotes: [
      "Turn the envelope opening into the last irreversible push into the climax.",
      "Make the final action logically grow from what the envelope reveals.",
    ],
    tags: ["structure", "missing-climax", "envelope", "improve"],
  }),
  createExample({
    id: "hero-journey-build-outdoor-structure",
    category: "hero-journey-build",
    userPrompt:
      "A kid chases a kite through the neighborhood, but the story feels like separate moments instead of one arc.",
    story:
      "The premise has motion, but the goal, escalation, turning point, and final outcome are not locked tightly enough into one structure.",
    knownFacts: [
      "The main action is chasing a kite.",
      "The setting is outdoors in the neighborhood.",
      "The story feels disconnected.",
    ],
    missingFacts: ["What larger problem the kite chase leads into."],
    rankedMissingFacts: ["What larger problem the kite chase leads into."],
    strongestGap: "The chase needs a bigger goal so the moments connect into one arc.",
    bestQuestion: "What bigger problem does the kite chase lead into?",
    acceptableOptions: ["A rescue", "A hidden message", "A reunion", "A secret place"],
    badQuestions: ["What happens next?", "What color is the kite?"],
    reasoning:
      "The movement is already there. The stronger structural lock is the larger goal that turns the chase into a full story.",
    shouldPlanNow: false,
    shouldAskQuestion: true,
    storyHelpMode: "improve",
    enoughKnownToPlan: false,
    maxQuestionsBeforePlanning: 2,
    storyStructure: {
      hasClearGoal: false,
      hasConflict: true,
      hasEscalation: false,
      hasTurningPoint: false,
      hasResolution: false,
      characterChange: false,
    },
    storyQualityNotes: [
      "The story needs a clearer goal tying the chase beats together.",
      "The middle should escalate toward a real discovery, choice, or rescue.",
    ],
    planQualityNotes: [
      "Use the kite chase as the setup and escalation, then pivot into the bigger problem at the turning point.",
      "The ending should solve both the chase and the deeper issue it revealed.",
    ],
    tags: ["structure", "hero-journey-build", "outdoor", "chase", "improve"],
  }),
  createExample({
    id: "plan-quality-upgrade-platform-mystery-structure",
    category: "plan-quality-upgrade",
    userPrompt:
      "A student finds someone else holding the same torn map on a train platform, and together they uncover where the missing station room went.",
    story:
      "A complete mystery with a clear goal, shared conflict, escalating clues, a reveal, and a strong ending payoff.",
    knownFacts: [
      "The story already has a clear map mystery.",
      "The shared-map reveal is already the inciting moment.",
      "The hidden station room payoff is already known.",
    ],
    missingFacts: [],
    rankedMissingFacts: [],
    strongestGap: "",
    bestQuestion: null,
    acceptableOptions: [],
    badQuestions: ["What happens next?", "Who is the other person?"],
    reasoning:
      "The story is plan-ready. The training signal here is how to make the clue progression, reveal, and ending room payoff feel clean and inevitable.",
    shouldPlanNow: true,
    shouldAskQuestion: false,
    storyHelpMode: "none",
    enoughKnownToPlan: true,
    maxQuestionsBeforePlanning: 0,
    storyStructure: {
      hasClearGoal: true,
      hasConflict: true,
      hasEscalation: true,
      hasTurningPoint: true,
      hasResolution: true,
      characterChange: true,
    },
    storyQualityNotes: [
      "The map creates a clear goal and shared mystery immediately.",
      "The hidden room payoff resolves the core question while changing the relationship between the two students.",
    ],
    planQualityNotes: [
      "Define sequence in deterministic action order: platform reveal -> clue chase -> false lead -> hidden-room turning point -> resolution.",
      "Let each clue make the platform and station feel more urgent before the final reveal.",
      "Use the missing-room discovery as a single clear climax image for animation.",
    ],
    tags: ["structure", "plan-quality-upgrade", "train-station", "mystery", "plan-now"],
  }),
  createExample({
    id: "plan-quality-upgrade-reunion-structure",
    category: "plan-quality-upgrade",
    userPrompt:
      "A boy waits on a snowy bridge for a friend who stopped answering him, and the repaired camera they once broke becomes the final reunion payoff.",
    story:
      "A complete reunion story with a clear emotional goal, rising doubt, a turning-point arrival, and a visual resolution.",
    knownFacts: [
      "The emotional setup is already clear.",
      "The repaired camera is the final payoff.",
      "The bridge wait already builds suspense.",
    ],
    missingFacts: [],
    rankedMissingFacts: [],
    strongestGap: "",
    bestQuestion: null,
    acceptableOptions: [],
    badQuestions: ["What happens next?", "What feeling should lead the scene?"],
    reasoning:
      "The story is ready to plan; the important training is how to pace the waiting, reveal, and reconciliation so the ending lands emotionally.",
    shouldPlanNow: true,
    shouldAskQuestion: false,
    storyHelpMode: "none",
    enoughKnownToPlan: true,
    maxQuestionsBeforePlanning: 0,
    storyStructure: {
      hasClearGoal: true,
      hasConflict: true,
      hasEscalation: true,
      hasTurningPoint: true,
      hasResolution: true,
      characterChange: true,
    },
    storyQualityNotes: [
      "The story has a clear emotional goal and a meaningful symbol in the repaired camera.",
      "The arrival changes the emotional direction of the whole scene at the right moment.",
    ],
    planQualityNotes: [
      "Use the bridge wait as a slow-burn beginning that steadily raises doubt.",
      "Make the friend's arrival the major turning point, not just a final detail.",
      "End on the shared camera to make the reconciliation visually clear for animation.",
    ],
    tags: ["structure", "plan-quality-upgrade", "emotional", "reunion", "winter", "plan-now"],
  }),
  createExample({
    id: "plan-quality-upgrade-invention-structure",
    category: "plan-quality-upgrade",
    userPrompt:
      "A student keeps failing to build a tiny rescue robot, then remembers the one counterweight fix that makes it work just in time.",
    story:
      "A complete invention story with a clear goal, repeated failures, a key turning point, and a final success payoff.",
    knownFacts: [
      "The rescue robot is already the main goal.",
      "Repeated failures are already part of the story.",
      "The counterweight fix is already the turning point.",
    ],
    missingFacts: [],
    rankedMissingFacts: [],
    strongestGap: "",
    bestQuestion: null,
    acceptableOptions: [],
    badQuestions: ["What happens next?", "What does he add to the robot?"],
    reasoning:
      "This story already has the structure needed for planning. The training here is about making the failure ladder and final fix feel clean and satisfying.",
    shouldPlanNow: true,
    shouldAskQuestion: false,
    storyHelpMode: "none",
    enoughKnownToPlan: true,
    maxQuestionsBeforePlanning: 0,
    storyStructure: {
      hasClearGoal: true,
      hasConflict: true,
      hasEscalation: true,
      hasTurningPoint: true,
      hasResolution: true,
      characterChange: true,
    },
    storyQualityNotes: [
      "The goal is concrete and visual, which helps the story stay focused.",
      "The repeated failures make the final fix feel earned.",
    ],
    planQualityNotes: [
      "Treat each failed test as a distinct beat that teaches something useful.",
      "Make the remembered counterweight fix the key turning point before the climax.",
      "End on the successful retrieval so the invention payoff is unmistakable.",
    ],
    tags: ["structure", "plan-quality-upgrade", "invention", "robot", "plan-now"],
  }),
  createExample({
    id: "plan-quality-upgrade-school-survival-structure",
    category: "plan-quality-upgrade",
    userPrompt:
      "A student tries to get a secret note across school before the final bell while monitors keep closing routes around him.",
    story:
      "A complete school survival story with a clear objective, escalating obstacles, a major turning point, and a clean ending payoff.",
    knownFacts: [
      "The note-delivery goal is already known.",
      "The closing routes provide the core escalation.",
      "The final-bell deadline is already built in.",
    ],
    missingFacts: [],
    rankedMissingFacts: [],
    strongestGap: "",
    bestQuestion: null,
    acceptableOptions: [],
    badQuestions: ["What happens next?", "Who is chasing him?"],
    reasoning:
      "The structure is already strong enough to plan. The best teaching signal is how to shape the route closures into a clean beginning, middle, climax, and bell payoff.",
    shouldPlanNow: true,
    shouldAskQuestion: false,
    storyHelpMode: "none",
    enoughKnownToPlan: true,
    maxQuestionsBeforePlanning: 0,
    storyStructure: {
      hasClearGoal: true,
      hasConflict: true,
      hasEscalation: true,
      hasTurningPoint: true,
      hasResolution: true,
      characterChange: true,
    },
    storyQualityNotes: [
      "The goal is urgent and easy to understand.",
      "The route closures naturally escalate pressure toward the final bell.",
    ],
    planQualityNotes: [
      "Define sequence in deterministic action order: launch -> first blocked route -> rising route-pressure -> risky turning-point shortcut -> final delivery.",
      "Make each closure tighten the map so the middle visibly gets worse.",
      "Land the note-delivery payoff exactly against the bell for a strong ending beat.",
    ],
    tags: ["structure", "plan-quality-upgrade", "school", "deadline", "plan-now"],
  }),
];

const COMPLETE_STORY_STRUCTURE: GeneratePlansStoryStructure = {
  hasClearGoal: true,
  hasConflict: true,
  hasEscalation: true,
  hasTurningPoint: true,
  hasResolution: true,
  characterChange: true,
};

const ELITE_STORY_QUALITY_NOTES = [
  "Interpret the user request into one clear objective.",
  "Keep stakes visible and immediate.",
  "Escalate pressure beat by beat.",
  "Use a turning-point decision that changes what happens next.",
  "Land on a visible payoff.",
  "Show change through action or reaction, not explanation.",
  "Make the visual hook change the plan, not just the mood.",
  "Keep conflict concrete.",
  "Escalation should force a stronger next action.",
  "Any reveal or emotional shift should redirect the sequence.",
  "Finish with a resolved image, not a vague fade-out.",
] as const;

const ELITE_PLAN_QUALITY_NOTES = [
  "Output step-based engine-ready logic.",
  "Each step should be visually clear and convert cleanly into engine-executable actions.",
  "Escalate intensity over time.",
  "Use a turning point that changes the next action.",
  "End with a strong payoff.",
  "Avoid flat pacing.",
  "Name the beat order directly.",
  "Sequence must map to deterministic action order.",
  "Avoid abstract beats that cannot be executed.",
  "Make escalation change what the execution layer should do next.",
  "Keep continuation edits local to the requested section.",
  "Make the final frame prove the change.",
] as const;

const ELITE_BAD_STYLE_NOTES = [
  ...COMMON_BAD_STYLE_NOTES,
  "Do not create flat stories.",
  "Do not repeat actions without escalation.",
  "Do not skip the turning point.",
  "Do not end abruptly.",
  "Do not generate random events.",
  "Do not ask vague questions.",
  "Do not be generic.",
  "Do not explain like a teacher.",
  "Do not write vague stories.",
  "Do not output loose story paragraphs when the engine needs action logic.",
  "Do not hide the requested change inside a rewritten scene.",
] as const;

const createStoryOption = (option: GeneratePlansStoryOption): GeneratePlansStoryOption => option;

const createStoryOptionsExample = ({
  id,
  category,
  userPrompt,
  story,
  knownFacts,
  storyHelpMode,
  storyOptions,
  reasoning,
  tags,
  storyQualityNotes = [],
  planQualityNotes = [],
}: {
  id: string;
  category: string;
  userPrompt: string;
  story: string;
  knownFacts: string[];
  storyHelpMode: GeneratePlansStoryHelpMode;
  storyOptions: GeneratePlansStoryOption[];
  reasoning: string;
  tags: string[];
  storyQualityNotes?: string[];
  planQualityNotes?: string[];
}) =>
  createExample({
    id,
    category,
    userPrompt,
    story,
    knownFacts,
    missingFacts: [],
    rankedMissingFacts: [],
    strongestGap: "",
    bestQuestion: null,
    acceptableOptions: [],
    badQuestions: ["What happens next?", "Can you tell me more?"],
    reasoning,
    shouldPlanNow: true,
    shouldAskQuestion: false,
    storyHelpMode,
    enoughKnownToPlan: true,
    maxQuestionsBeforePlanning: 3,
    badStyleNotes: [...ELITE_BAD_STYLE_NOTES],
    storyQualityNotes: [...ELITE_STORY_QUALITY_NOTES, ...storyQualityNotes],
    planQualityNotes: [...ELITE_PLAN_QUALITY_NOTES, ...planQualityNotes],
    storyStructure: COMPLETE_STORY_STRUCTURE,
    storyOptions,
    tags: [...tags, "multi-option", "recommended-story"],
  });

const createPlanMasterExample = ({
  id,
  userPrompt,
  story,
  knownFacts,
  reasoning,
  tags,
  storyQualityNotes = [],
  planQualityNotes = [],
}: {
  id: string;
  userPrompt: string;
  story: string;
  knownFacts: string[];
  reasoning: string;
  tags: string[];
  storyQualityNotes?: string[];
  planQualityNotes?: string[];
}) =>
  createExample({
    id,
    category: "plan-quality-master",
    userPrompt,
    story,
    knownFacts,
    missingFacts: [],
    rankedMissingFacts: [],
    strongestGap: "",
    bestQuestion: null,
    acceptableOptions: [],
    badQuestions: ["What happens next?", "What tone do you want?"],
    reasoning,
    shouldPlanNow: true,
    shouldAskQuestion: false,
    storyHelpMode: "none",
    enoughKnownToPlan: true,
    maxQuestionsBeforePlanning: 0,
    badStyleNotes: [...ELITE_BAD_STYLE_NOTES],
    storyQualityNotes: [...ELITE_STORY_QUALITY_NOTES, ...storyQualityNotes],
    planQualityNotes: [...ELITE_PLAN_QUALITY_NOTES, ...planQualityNotes],
    storyStructure: COMPLETE_STORY_STRUCTURE,
    tags: [...tags, "plan-quality-master", "plan-now"],
  });

const ELITE_STORY_OPTION_EXAMPLES: GeneratePlansExample[] = [
  createStoryOptionsExample({
    id: "elite-create-school-mystery-options",
    category: "story-create-options",
    userPrompt: "Help me make a school mystery story.",
    story:
      "Enough is known after focused questions to recommend multiple structured school-mystery stories and clearly pick the strongest one.",
    knownFacts: ["The user wants a school mystery.", "The story should feel animation-friendly and visually clear."],
    storyHelpMode: "create",
    storyOptions: [
      createStoryOption({
        title: "The Missing Bell Code",
        character: "A shy student who runs the school soundboard.",
        goal: "Decode the strange bell pattern before a major school disaster happens.",
        conflict: "No one believes the bell tones mean anything and the real culprit is hiding inside the staff offices.",
        escalation: "Each bell pattern predicts a bigger problem and the student keeps reaching each scene seconds too late.",
        turningPoint: "He realizes the code points to the assembly stage and must hijack the sound system publicly.",
        resolution: "He exposes the sabotage, saves the assembly, and becomes confident enough to step out from behind the speakers.",
        isRecommended: true,
      }),
      createStoryOption({
        title: "The Locked Science Cabinet",
        character: "A curious lab assistant who stays late after class.",
        goal: "Figure out why the same cabinet keeps unlocking itself after school.",
        conflict: "A rival student wants the hidden experiment notebook first.",
        escalation: "Every clue leads deeper into the dark lab while the notebook's missing pages hint at a growing danger.",
        turningPoint: "She discovers the experiment is still running in a sealed room under the lab.",
        resolution: "She shuts it down in time and earns respect by protecting the school instead of chasing credit.",
      }),
      createStoryOption({
        title: "The Library Transfer Slip",
        character: "A library volunteer who notices records better than people.",
        goal: "Trace a fake transfer slip to stop a historical archive from disappearing.",
        conflict: "The paperwork trail keeps changing and an older student is covering for a family secret.",
        escalation: "The volunteer follows missing stamps, shifting shelf labels, and hidden boxes as the renovation crew gets closer.",
        turningPoint: "He learns the archive contains proof that his own grandfather hid the truth years ago.",
        resolution: "He reveals the archive anyway and chooses honesty over family comfort.",
      }),
    ],
    reasoning:
      "For broad creation prompts, the model should recommend 2 to 5 strong options and clearly identify the best one instead of offering one flat idea.",
    storyQualityNotes: ["Recommended Story should be the option with the clearest goal, escalating clues, and strongest public payoff."],
    planQualityNotes: ["After recommending one option, build the final plan around escalating clue beats and one decisive reveal."],
    tags: ["school", "mystery", "create-story", "options"],
  }),
  createStoryOptionsExample({
    id: "elite-create-fight-protection-options",
    category: "story-create-options",
    userPrompt: "I want a stick figure fight story, but I want it to have heart.",
    story:
      "Enough is known to recommend multiple emotional fight stories and pick the one with the strongest character change.",
    knownFacts: ["The user wants a stick figure fight.", "The story should have emotion, not just action."],
    storyHelpMode: "create",
    storyOptions: [
      createStoryOption({
        title: "Bridge of Rivals",
        character: "A reckless courier fighting a former friend on a collapsing bridge.",
        goal: "Protect a sealed package long enough to learn who it truly belongs to.",
        conflict: "His rival believes the package must be destroyed before it reaches the wrong hands.",
        escalation: "The bridge breaks apart, the package keeps slipping away, and each exchange reveals more of their shared past.",
        turningPoint: "He finally hears why the rival betrayed him and realizes he has been protecting the wrong mission.",
        resolution: "He saves the rival instead of the package, loses the job, and gains back the friendship.",
        isRecommended: true,
      }),
      createStoryOption({
        title: "Last Round",
        character: "A rookie tournament fighter desperate to impress his injured coach.",
        goal: "Win the final match and prove he belongs in the arena.",
        conflict: "His opponent is fighting to fund a sibling's treatment and refuses to lose cleanly.",
        escalation: "The rounds become harsher as the rookie sees the cost behind the other fighter's desperation.",
        turningPoint: "He can win by exploiting the injury but chooses not to.",
        resolution: "He still wins narrowly, but the emotional payoff comes from earning respect instead of applause.",
      }),
      createStoryOption({
        title: "Sketchbook Duel",
        character: "A hand-drawn fighter whose attacks come from unfinished sketches.",
        goal: "Stop a living doodle from escaping the page-world and hurting his creator.",
        conflict: "The doodle mirrors every move and knows his habits better than any normal opponent.",
        escalation: "The fight moves through panels, erased space, and torn page edges as both fighters remake the world around them.",
        turningPoint: "He realizes the doodle only exists because he abandoned the drawing when it became too personal.",
        resolution: "He redraws it with care instead of destroying it, ending the duel by accepting what he tried to erase.",
      }),
    ],
    reasoning:
      "This teaches the model to recommend multiple action stories and prefer the one with the cleanest emotional arc and strongest animation beats.",
    storyQualityNotes: ["Recommended Story should combine clear action escalation with a meaningful relational payoff."],
    planQualityNotes: ["The final plan should keep the fight readable while saving the strongest emotional reveal for the turning point."],
    tags: ["fight", "stick-figure", "emotional", "create-story", "options"],
  }),
  createStoryOptionsExample({
    id: "elite-create-funny-options",
    category: "story-create-options",
    userPrompt: "Give me a weird funny animation idea.",
    story:
      "Enough is known to recommend several comedy-driven animation ideas and clearly pick the most stageable one.",
    knownFacts: ["The user wants weird and funny.", "The idea should animate clearly."],
    storyHelpMode: "create",
    storyOptions: [
      createStoryOption({
        title: "The Helpful Locker",
        character: "A student whose locker keeps trying to solve the wrong problem.",
        goal: "Get through school without the locker exposing every embarrassing thing he owns.",
        conflict: "The locker keeps throwing out objects it thinks will help and makes each situation worse.",
        escalation: "The locker escalates from bad timing to full hallway chaos and starts moving on its own.",
        turningPoint: "He finally gives the locker one real mission instead of trying to hide from it.",
        resolution: "The locker completes that mission perfectly and becomes the weird hero of the day.",
        isRecommended: true,
      }),
      createStoryOption({
        title: "Cafeteria Surf",
        character: "A cafeteria worker obsessed with perfect lunch order.",
        goal: "Stop one spilled tray from ruining the whole lunch period.",
        conflict: "Every fix starts a bigger chain reaction.",
        escalation: "Trays, carts, and tables all turn the cafeteria into one growing wave of disaster.",
        turningPoint: "He commits to riding the dessert cart instead of fighting the motion.",
        resolution: "He saves lunch by surfing the chaos into a perfect loop.",
      }),
      createStoryOption({
        title: "The PE Whistle Revolt",
        character: "A student assistant who takes gym rules far too seriously.",
        goal: "Keep PE under control for one normal class.",
        conflict: "A whistle in the vent starts giving random commands to the whole gym.",
        escalation: "Each accidental command causes bigger synchronized disasters around the room.",
        turningPoint: "He realizes the only way out is to turn the class into one planned obstacle course.",
        resolution: "The class becomes the best chaos the school has ever seen and he finally loosens up.",
      }),
    ],
    reasoning:
      "For comedy prompts, the model should generate several clean engines for escalation and recommend the one with the clearest recurring visual rule.",
    storyQualityNotes: ["Recommended Story should have the simplest comic engine and the strongest escalation ladder."],
    planQualityNotes: ["The plan should build gag size scene by scene and end on one unmistakable visual payoff."],
    tags: ["funny", "weird", "comedy", "create-story", "options"],
  }),
  createStoryOptionsExample({
    id: "elite-create-emotional-options",
    category: "story-create-options",
    userPrompt: "Help me make an emotional story that still animates well.",
    story:
      "Enough is known to recommend multiple emotional stories and pick the one with the clearest goal, change, and visual symbol.",
    knownFacts: ["The user wants emotion.", "The story should still be visual and animation-ready."],
    storyHelpMode: "create",
    storyOptions: [
      createStoryOption({
        title: "The Repaired Drawing",
        character: "An older brother walking his sister home from school.",
        goal: "Help her show their mom the drawing she ripped in frustration.",
        conflict: "He caused the fight that made her rip it and keeps trying to fix things too quickly.",
        escalation: "Every shortcut fails as the walk home becomes more emotionally tense.",
        turningPoint: "He stops trying to cheer her up and finally admits what he did wrong.",
        resolution: "They repair the drawing together and the picture becomes proof they changed together.",
        isRecommended: true,
      }),
      createStoryOption({
        title: "Last Practice",
        character: "Two brothers preparing one final garage act before one moves away.",
        goal: "Perform their routine without falling apart emotionally.",
        conflict: "The upcoming goodbye makes every practice feel heavier.",
        escalation: "The routine keeps breaking wherever their resentment surfaces.",
        turningPoint: "One finally admits he is scared the act matters more than the goodbye.",
        resolution: "They rebuild the performance around that truth and perform honestly instead of perfectly.",
      }),
      createStoryOption({
        title: "The Winter Camera",
        character: "A boy waiting on a snowy bridge for a friend who stopped answering him.",
        goal: "Find out if the friendship is really over before leaving the bridge.",
        conflict: "Silence and old guilt keep pushing him to walk away first.",
        escalation: "Every minute waiting makes the broken memory between them feel more final.",
        turningPoint: "The friend arrives carrying the repaired camera they once broke together.",
        resolution: "They start again through the camera instead of pretending the past never happened.",
      }),
    ],
    reasoning:
      "This teaches the model to create multiple emotional options and recommend the one with the clearest symbol, goal, and character change.",
    storyQualityNotes: ["Recommended Story should combine emotional honesty with a visible object or action that pays off the arc."],
    planQualityNotes: ["The chosen plan should stage quiet scenes clearly, then land one strong emotional payoff image."],
    tags: ["emotional", "family", "create-story", "options"],
  }),
  createStoryOptionsExample({
    id: "elite-create-surreal-options",
    category: "story-create-options",
    userPrompt: "Make me a surreal story idea.",
    story:
      "Enough is known to recommend several surreal stories and pick the one where the weirdness connects most clearly to a real emotional problem.",
    knownFacts: ["The user wants surreal storytelling."],
    storyHelpMode: "create",
    storyOptions: [
      createStoryOption({
        title: "The Changing Hallway",
        character: "A student trying to avoid someone he hurt.",
        goal: "Reach class without facing the person he betrayed.",
        conflict: "The hallway keeps reshaping itself to trap him in longer and stranger routes.",
        escalation: "Each new version of the hallway reflects a memory he has been dodging.",
        turningPoint: "He realizes the only stable door leads back to the person he keeps avoiding.",
        resolution: "The hallway stops changing only after he chooses to apologize instead of escape.",
        isRecommended: true,
      }),
      createStoryOption({
        title: "The Library Shelf of Tomorrows",
        character: "A volunteer shelving books after school.",
        goal: "Understand why one shelf keeps returning books from the future.",
        conflict: "The future books show consequences of choices he has not made yet.",
        escalation: "Each returned book reveals a worse version of his next day.",
        turningPoint: "He finds the volume describing the exact apology he refuses to make.",
        resolution: "He changes the next day on purpose and the shelf finally goes quiet.",
      }),
      createStoryOption({
        title: "The Duplicate Bus Stop",
        character: "A quiet rider hiding a sketchbook.",
        goal: "Get home without showing anyone what is inside the sketchbook.",
        conflict: "The bus keeps looping to the same stop until he shares what he is hiding.",
        escalation: "The outside world empties more each loop while the sketchbook grows heavier.",
        turningPoint: "A stranger on the bus reveals they already know what he drew.",
        resolution: "He gives the sketchbook away and the route finally moves forward.",
      }),
    ],
    reasoning:
      "Surreal prompts work best when the options all have clear emotional engines and one recommended version ties the strange rule to the cleanest character goal.",
    storyQualityNotes: ["Recommended Story should connect the surreal rule to the clearest inner conflict."],
    planQualityNotes: ["The chosen plan should make each strange beat more intense while staying readable scene to scene."],
    tags: ["surreal", "create-story", "options"],
  }),
  createStoryOptionsExample({
    id: "elite-create-drawing-options",
    category: "story-create-options",
    userPrompt: "I want a drawing-based story.",
    story:
      "Enough is known to recommend several drawing-centered story options and pick the one with the clearest visual escalation.",
    knownFacts: ["The story should center on drawing."],
    storyHelpMode: "create",
    storyOptions: [
      createStoryOption({
        title: "The Chalk Door",
        character: "A student who draws doors whenever he feels trapped.",
        goal: "Use one impossible chalk doorway to reach a place he was never allowed to see.",
        conflict: "Each doorway steals part of the real room and makes returning harder.",
        escalation: "He keeps opening stranger doors as the school itself starts thinning around him.",
        turningPoint: "He realizes the final door opens only if he draws what he is actually afraid to see.",
        resolution: "He reaches the hidden room, faces the truth there, and redraws the world solid again.",
        isRecommended: true,
      }),
      createStoryOption({
        title: "The Runaway Sketch",
        character: "A hand-drawn figure who hates his own stiff poses.",
        goal: "Catch the discarded sketch that stole his best movement lines.",
        conflict: "The sketch learns from every failed attempt to erase it.",
        escalation: "The chase crosses half-finished backgrounds and broken panels that keep changing form.",
        turningPoint: "He stops trying to copy perfection and starts drawing rougher, bolder motion into the world itself.",
        resolution: "The sketch merges back into him and he finally moves the way he wanted to.",
      }),
      createStoryOption({
        title: "The Living Mural",
        character: "A quiet student painting after school.",
        goal: "Finish a mural before the showcase opens in the morning.",
        conflict: "The mural keeps repainting itself to expose memories she would rather keep hidden.",
        escalation: "Each repainting grows more specific and harder to cover over.",
        turningPoint: "She decides to leave the truth on the wall instead of painting it out again.",
        resolution: "The mural becomes the emotional centerpiece of the showcase and changes how people see her.",
      }),
    ],
    reasoning:
      "Drawing-based prompts should produce several visually distinct ideas and recommend the option with the strongest visual rule and payoff.",
    storyQualityNotes: ["Recommended Story should have the clearest cause-and-effect drawing mechanic."],
    planQualityNotes: ["The final plan should make the drawing mechanic escalate visually and resolve in one strong reveal image."],
    tags: ["drawing", "create-story", "options", "animation"],
  }),
  createStoryOptionsExample({
    id: "elite-create-short-clip-options",
    category: "story-create-options",
    userPrompt: "I need a really strong short animation idea.",
    story:
      "Enough is known to recommend several compact animation ideas and choose the one with the cleanest setup, escalation, and punchy ending.",
    knownFacts: ["The user wants a short animation clip."],
    storyHelpMode: "create",
    storyOptions: [
      createStoryOption({
        title: "Balloon Animal Delivery",
        character: "A small stick figure carrying a giant balloon animal through school.",
        goal: "Get the balloon into one classroom before the bell.",
        conflict: "Every door, stairwell, and hallway turn threatens to pop or lose it.",
        escalation: "Each near-save gets faster and more ridiculous than the last.",
        turningPoint: "At the staircase he stops panicking and uses the balloon's movement on purpose.",
        resolution: "He lands it perfectly in the room, only for the final reveal to show it still causes a giant comic problem.",
        isRecommended: true,
      }),
      createStoryOption({
        title: "The Runaway Rope",
        character: "A tiny figure carrying a rope too long for him.",
        goal: "Jump one puddle without getting wet.",
        conflict: "The rope hooks bigger and bigger moving objects.",
        escalation: "He gets dragged through escalating chain-reaction motion.",
        turningPoint: "He realizes the rope can redirect the chaos instead of only causing it.",
        resolution: "He lands cleanly at last and still gets splashed by the puddle in the final beat.",
      }),
      createStoryOption({
        title: "The Dropped Painting",
        character: "A student rushing a painting to the showcase.",
        goal: "Keep the painting pristine long enough to get it on the easel.",
        conflict: "It keeps slipping away through school spaces that damage it more each time.",
        escalation: "Each recovery is harder and riskier than the last.",
        turningPoint: "He stops chasing directly and uses the stage rigging to swing it into place.",
        resolution: "The painting lands just in time and the audience loves the accidental streaks it picked up along the way.",
      }),
    ],
    reasoning:
      "Short-form prompts should generate several compact options and clearly recommend the one with the strongest single-line engine.",
    storyQualityNotes: ["Recommended Story should have one immediate goal and one escalation chain that never gets muddy."],
    planQualityNotes: ["The final plan should stay compact, visual, and end on one sharp payoff frame."],
    tags: ["short-clip", "create-story", "options", "animation"],
  }),
  createStoryOptionsExample({
    id: "elite-create-alan-becker-options",
    category: "story-create-options",
    userPrompt: "I want something with Alan Becker style energy.",
    story:
      "Enough is known to recommend several inventive stick-figure concepts and pick the one with the strongest interaction between character and medium.",
    knownFacts: ["The user wants hand-drawn stick-figure energy.", "The story should feel inventive and visual."],
    storyHelpMode: "create",
    storyOptions: [
      createStoryOption({
        title: "The Runaway Sketch Duel",
        character: "A hand-drawn figure whose unfinished sketch comes to life.",
        goal: "Stop the sketch from taking over the page-world.",
        conflict: "The sketch knows his habits and learns from every attack.",
        escalation: "The fight moves through panels, erasures, and broken page edges with increasingly creative tricks.",
        turningPoint: "He changes the rules of the page instead of trying to outpunch the sketch.",
        resolution: "He wins by redrawing the world and himself into something stronger.",
        isRecommended: true,
      }),
      createStoryOption({
        title: "Toolbar Heist",
        character: "A stick figure living inside a drawing app.",
        goal: "Recover the stolen selection tool before the whole canvas falls apart.",
        conflict: "A rival figure can reshape the canvas faster than he can react.",
        escalation: "They chase each other through brush settings, layers, and zoom space.",
        turningPoint: "He realizes the rival only wants control because the canvas keeps deleting them both.",
        resolution: "They restore the app together and keep the tool from a bigger threat.",
      }),
      createStoryOption({
        title: "Notebook Tournament",
        character: "A rough doodle trying to survive a bracket of cleaner, polished drawings.",
        goal: "Prove a messy sketch can belong in the final illustration.",
        conflict: "Each opponent uses a more refined technique the doodle cannot match directly.",
        escalation: "The rounds get larger and more dangerous as the notebook itself transforms around them.",
        turningPoint: "He stops imitating polish and uses his rough flexibility as an advantage.",
        resolution: "He wins by being more alive than perfect and changes how the artist sees unfinished work.",
      }),
    ],
    reasoning:
      "This teaches the model to generate multiple stick-figure concepts and recommend the one with the clearest visual innovation and emotional arc.",
    storyQualityNotes: ["Recommended Story should use the medium itself as part of the conflict and resolution."],
    planQualityNotes: ["The final plan should stage medium-based visual beats cleanly so each phase feels inventive instead of random."],
    tags: ["alan-becker", "stick-figure", "create-story", "options", "animation"],
  }),
  createStoryOptionsExample({
    id: "elite-improve-marker-options",
    category: "story-improve-options",
    userPrompt: "Improve this idea: a kid finds a weird marker in class.",
    story:
      "Enough is known to recommend several stronger versions of the marker story and clearly pick the option with the best goal, conflict, and payoff.",
    knownFacts: ["The core prop is a weird marker.", "The setting is a classroom."],
    storyHelpMode: "improve",
    storyOptions: [
      createStoryOption({
        title: "The Truth Marker",
        character: "A bored student who hides behind jokes.",
        goal: "Use the marker to survive class without getting noticed.",
        conflict: "The marker turns private thoughts into real drawings for everyone to see.",
        escalation: "Each attempt to hide it creates a bigger classroom disaster and exposes a larger secret.",
        turningPoint: "The marker reveals the cheating plan the class clown wanted buried.",
        resolution: "The student finally uses it honestly, stops the cheating, and changes how he handles attention.",
        isRecommended: true,
      }),
      createStoryOption({
        title: "The Moving Blueprint",
        character: "A quiet inventor stuck in a boring lesson.",
        goal: "Secretly sketch the classroom machine idea he wants to build after school.",
        conflict: "The sketches animate and start building the machine for real at the wrong time.",
        escalation: "Each new drawn part makes the room harder to control.",
        turningPoint: "He realizes the machine can solve the same classroom crisis it is causing.",
        resolution: "He repurposes it to save the day and finally shares his idea openly.",
      }),
      createStoryOption({
        title: "The Memory Marker",
        character: "A student avoiding a painful memory tied to the classroom wall.",
        goal: "Keep using the marker for harmless doodles and ignore what it keeps drawing back.",
        conflict: "The marker only draws scenes from the moment he keeps refusing to face.",
        escalation: "Those scenes spread across the room and trap him inside repeated versions of the same day.",
        turningPoint: "He redraws the memory the way it really happened instead of the safer lie.",
        resolution: "The loop breaks and the classroom returns to normal once he tells the truth.",
      }),
    ],
    reasoning:
      "Improve-mode should still offer multiple stronger paths and recommend the one with the best structural payoff, not just ask another weak question.",
    storyQualityNotes: ["Recommended Story should turn the marker into both the conflict engine and the emotional turning point."],
    planQualityNotes: ["The final plan should escalate the marker effect scene by scene before the reveal or confession payoff."],
    tags: ["improve", "marker", "classroom", "options"],
  }),
  createStoryOptionsExample({
    id: "elite-improve-rooftop-options",
    category: "story-improve-options",
    userPrompt: "Improve this rough rooftop fight story.",
    story:
      "Enough is known to recommend several stronger rooftop fight arcs and clearly choose the one with the best climax meaning.",
    knownFacts: ["The story is a rooftop fight.", "The user wants a stronger version, not a vague rewrite."],
    storyHelpMode: "improve",
    storyOptions: [
      createStoryOption({
        title: "The Wrong Package",
        character: "A courier fighting the former partner who betrayed him.",
        goal: "Protect a sealed package until he learns why his rival wants it destroyed.",
        conflict: "His rival knows the roof route better and keeps trying to stop a delivery that looks necessary.",
        escalation: "The roof path breaks apart and every exchange reveals more of the old betrayal.",
        turningPoint: "He learns his rival was trying to stop a worse crime, not commit one.",
        resolution: "He saves the rival instead of the package and changes what winning means.",
        isRecommended: true,
      }),
      createStoryOption({
        title: "Signal Tower Final",
        character: "A desperate rookie fighting the arena champion at dawn.",
        goal: "Win the final rooftop round before the signal tower powers down.",
        conflict: "The champion controls the terrain and wants the rookie to attack recklessly.",
        escalation: "The tower loses power stage by stage, making the roof more dangerous and unstable.",
        turningPoint: "The rookie realizes the tower is failing because both fighters keep using it as cover.",
        resolution: "He stops the tower from collapsing first and wins with discipline instead of rage.",
      }),
      createStoryOption({
        title: "Rainline Duel",
        character: "A fighter chasing the rival who stole his sketchbook.",
        goal: "Get the sketchbook back before the rain destroys it.",
        conflict: "The rival believes the sketchbook exposes something the fighter should never see.",
        escalation: "Rain, wind, and slick roof edges push the duel into riskier territory with each exchange.",
        turningPoint: "He gets the sketchbook back and sees the rival was protecting a painful truth inside it.",
        resolution: "The fight ends in uneasy understanding instead of a simple win.",
      }),
    ],
    reasoning:
      "These examples teach the model to improve a weak fight by presenting several stronger arcs and recommending the one with the best relationship-driven payoff.",
    storyQualityNotes: ["Recommended Story should make the turning point mean more than a random fight reversal."],
    planQualityNotes: ["The chosen plan should let the rooftop environment escalate with the emotional conflict."],
    tags: ["improve", "fight", "rooftop", "options"],
  }),
  createStoryOptionsExample({
    id: "elite-improve-darker-options",
    category: "story-improve-options",
    userPrompt: "Make this school mystery darker.",
    story:
      "Enough is known to recommend several darker versions and clearly pick the one with the strongest stakes and emotional consequence.",
    knownFacts: ["The base idea is a school mystery.", "The user wants a darker tone."],
    storyHelpMode: "improve",
    storyOptions: [
      createStoryOption({
        title: "The Burned Archive",
        character: "A library helper finding future burn marks in returned books.",
        goal: "Stop the hidden archive from being destroyed again.",
        conflict: "The books predict losses she cannot explain and the adults refuse to reopen the sealed basement.",
        escalation: "Each new burn mark matches a room that vanishes from the school's memory.",
        turningPoint: "She realizes the archive was erased to hide her family's role in the original fire.",
        resolution: "She exposes the truth even though it changes how everyone sees her family.",
        isRecommended: true,
      }),
      createStoryOption({
        title: "The Empty Hallway Loop",
        character: "A student who keeps finding tomorrow's warnings in his own handwriting.",
        goal: "Break the morning loop before the predicted accident happens again.",
        conflict: "Every attempt to save someone erases part of the school and makes the hallway more hostile.",
        escalation: "The loop grows darker as names, faces, and exit signs vanish.",
        turningPoint: "He realizes the only way out is to confess the truth that caused the original accident.",
        resolution: "He breaks the loop by finally taking responsibility instead of only surviving it.",
      }),
      createStoryOption({
        title: "The Locked Lab Recording",
        character: "A sound-tech student hearing a voice from the sealed science lab.",
        goal: "Prove the voice is real before the renovation wipes the room clean.",
        conflict: "The recordings become more personal and start predicting his own decisions.",
        escalation: "Each playback reveals a worse version of what he might do next.",
        turningPoint: "He hears the recording of the lie he is about to tell and changes course.",
        resolution: "He opens the lab to the truth before the school can bury it again.",
      }),
    ],
    reasoning:
      "Tone-adaptation prompts should still produce multiple strong options and recommend the one with the clearest dark escalation and payoff.",
    storyQualityNotes: ["Recommended Story should darken stakes and imagery without becoming vague or random."],
    planQualityNotes: ["The chosen plan should stage darkness through concrete consequences and one decisive reveal."],
    tags: ["improve", "dark", "mystery", "options"],
  }),
  createStoryOptionsExample({
    id: "elite-improve-funnier-options",
    category: "story-improve-options",
    userPrompt: "Make this hallway idea funnier.",
    story:
      "Enough is known to recommend multiple funnier versions and clearly pick the one with the cleanest comic escalation.",
    knownFacts: ["The base idea happens in a hallway.", "The user wants stronger comedy."],
    storyHelpMode: "improve",
    storyOptions: [
      createStoryOption({
        title: "The Helpful Locker Returns",
        character: "A student trying to act normal while his locker follows him.",
        goal: "Get through one school day without the living locker ruining everything.",
        conflict: "The locker keeps solving the wrong problem at the wrong time.",
        escalation: "It gets bigger, louder, and more public every period.",
        turningPoint: "He finally gives it one mission instead of fighting it.",
        resolution: "The locker completes that mission perfectly and wins the day by being ridiculous.",
        isRecommended: true,
      }),
      createStoryOption({
        title: "The Wrong Door Parade",
        character: "A student carrying a giant birthday cake through the hallway.",
        goal: "Deliver the cake intact to the classroom surprise.",
        conflict: "Every doorway is too small or opens the wrong way.",
        escalation: "Each turn makes the cake wobblier and the hallway more crowded.",
        turningPoint: "He realizes the best route is the one no one would ever choose: straight through the drama club rehearsal.",
        resolution: "He reaches the room just in time for the cake to collapse at the perfect comedic second.",
      }),
      createStoryOption({
        title: "The Hall Pass Chase",
        character: "A hall monitor who loses his own authority badge.",
        goal: "Get the badge back before anyone notices he has no power.",
        conflict: "The badge keeps getting passed along because everyone thinks it is some other pass.",
        escalation: "Every recovery attempt drags in more students and more hallway nonsense.",
        turningPoint: "He uses all the chaos he hates to set up one final trap.",
        resolution: "He gets the badge back and accidentally becomes popular for the first time.",
      }),
    ],
    reasoning:
      "Comedy-improvement prompts should teach the model to produce multiple clean comic engines and recommend the best escalation pattern.",
    storyQualityNotes: ["Recommended Story should escalate each gag and end on the biggest, clearest payoff."],
    planQualityNotes: ["The chosen plan should keep each comedy beat visually readable and bigger than the last."],
    tags: ["improve", "funny", "hallway", "options"],
  }),
  createStoryOptionsExample({
    id: "elite-improve-emotional-options",
    category: "story-improve-options",
    userPrompt: "Make this story more emotional.",
    story:
      "Enough is known to recommend several more emotional versions and clearly choose the one with the strongest relationship arc.",
    knownFacts: ["The user wants stronger emotion and payoff."],
    storyHelpMode: "improve",
    storyOptions: [
      createStoryOption({
        title: "The Repaired Camera",
        character: "A boy waiting on a bridge for the friend who stopped answering him.",
        goal: "Learn if the friendship is really over before he walks away.",
        conflict: "Silence and guilt keep pushing him to leave first.",
        escalation: "The longer he waits, the more final the memory of their fight feels.",
        turningPoint: "The friend arrives carrying the camera they once broke together.",
        resolution: "The repair becomes the emotional payoff because it proves both of them changed.",
        isRecommended: true,
      }),
      createStoryOption({
        title: "The Last Showcase Portrait",
        character: "A student trying to finish one portrait for the showcase.",
        goal: "Leave behind one honest painting before the gallery opens.",
        conflict: "Every nearly finished version feels unworthy of the person it is for.",
        escalation: "He keeps erasing until time runs out and the room fills with failed versions.",
        turningPoint: "He finally leaves the portrait imperfect and walks away from it.",
        resolution: "Someone he loves hangs it anyway, making the unfinished truth the real payoff.",
      }),
      createStoryOption({
        title: "The Hospital Drawing",
        character: "An older sibling walking home with a little sister after school.",
        goal: "Help her show their mom the drawing she ruined in anger.",
        conflict: "He caused the fight and keeps trying to fix it too quickly.",
        escalation: "The walk home becomes more tense as each failed joke exposes the real hurt underneath.",
        turningPoint: "He stops trying to fix the mood and admits what he did wrong.",
        resolution: "They repair the drawing together and bring something more honest than perfection.",
      }),
    ],
    reasoning:
      "Emotional-improvement prompts should generate multiple relationship-driven options and recommend the strongest symbolic payoff.",
    storyQualityNotes: ["Recommended Story should make the emotional shift visible through an object or action, not only dialogue."],
    planQualityNotes: ["The chosen plan should pace quiet scenes carefully and save the visual symbol for the final payoff."],
    tags: ["improve", "emotional", "options"],
  }),
  createStoryOptionsExample({
    id: "elite-improve-simpler-after-reject-options",
    category: "story-improve-options",
    userPrompt: "Those ideas are too complicated. Give me simpler, cleaner story options.",
    story:
      "Enough is known to adapt after rejection by offering fewer moving parts, cleaner goals, and still recommending one best story.",
    knownFacts: ["The user rejected earlier ideas as too complicated.", "The new options should be simpler and clearer."],
    storyHelpMode: "improve",
    storyOptions: [
      createStoryOption({
        title: "The Dropped Painting",
        character: "A student carrying one painting to the showcase.",
        goal: "Get it onto the easel without ruining it.",
        conflict: "The painting keeps slipping away through the hallway.",
        escalation: "Each recovery is harder and riskier than the last.",
        turningPoint: "He uses the stage rope instead of another direct grab.",
        resolution: "The painting lands in place and the marks it picked up become part of why people love it.",
        isRecommended: true,
      }),
      createStoryOption({
        title: "The Lost Hall Pass",
        character: "A hall monitor who drops his own badge.",
        goal: "Get it back before anyone notices.",
        conflict: "It keeps getting passed to the wrong person.",
        escalation: "Each new holder creates a bigger hallway problem.",
        turningPoint: "He sets one trap using the crowd he normally hates.",
        resolution: "He gets it back and learns he works better with people than above them.",
      }),
      createStoryOption({
        title: "The Balloon Animal",
        character: "A small stick figure carrying a giant balloon animal.",
        goal: "Deliver it to one classroom before the bell.",
        conflict: "The balloon keeps catching on every obstacle.",
        escalation: "Each near-save gets bigger and funnier.",
        turningPoint: "He starts using the balloon's drift on purpose.",
        resolution: "He succeeds and still ends on one clean comic surprise.",
      }),
    ],
    reasoning:
      "When the user rejects complex ideas, the model should adapt with cleaner structures, not just smaller words.",
    storyQualityNotes: ["Recommended Story should keep one goal, one escalation chain, and one strong payoff."],
    planQualityNotes: ["The chosen plan should be simple enough to storyboard quickly without losing emotional or visual payoff."],
    tags: ["improve", "simpler", "rejected-ideas", "options"],
  }),
  createStoryOptionsExample({
    id: "elite-create-vibe-only-options",
    category: "story-create-options",
    userPrompt: "I only know the vibe: lonely but hopeful.",
    story:
      "Enough is known from the vibe to recommend several emotionally clear story options and pick the one with the best goal and visual payoff.",
    knownFacts: ["The desired vibe is lonely but hopeful."],
    storyHelpMode: "create",
    storyOptions: [
      createStoryOption({
        title: "The Empty Playground Mural",
        character: "A student painting alone after everyone leaves.",
        goal: "Finish one mural before the showcase opens.",
        conflict: "The mural keeps surfacing memories she would rather cover over.",
        escalation: "Each repainting reveals more of why she paints alone.",
        turningPoint: "She stops painting over the truth and leaves it visible.",
        resolution: "The mural becomes the hopeful proof that being seen is better than hiding perfectly.",
        isRecommended: true,
      }),
      createStoryOption({
        title: "The Last Bus Sketchbook",
        character: "A quiet rider hiding a sketchbook on the late bus.",
        goal: "Get home without letting anyone see the drawings.",
        conflict: "The bus loops until he shares what he is hiding.",
        escalation: "Each loop leaves the city emptier and the choice harder.",
        turningPoint: "He finally hands the sketchbook to the stranger beside him.",
        resolution: "The route moves forward and hope arrives the moment he stops hiding.",
      }),
      createStoryOption({
        title: "The Rooftop Glider",
        character: "A student who flies paper gliders alone every sunset.",
        goal: "Launch one glider far enough to reach the roof he was banned from.",
        conflict: "A hidden note tied to the glider reveals why he was banned in the first place.",
        escalation: "Each glider leads him deeper into the truth he has been avoiding.",
        turningPoint: "He decides to bring the truth back to the person he hurt instead of chasing the last launch alone.",
        resolution: "The final glider becomes an apology that finally lands where it should.",
      }),
    ],
    reasoning:
      "Vibe-only prompts should still produce multiple strong options and a clear recommendation instead of vague mood writing.",
    storyQualityNotes: ["Recommended Story should turn the vibe into a clear goal, conflict, and payoff image."],
    planQualityNotes: ["The chosen plan should preserve the mood while still moving through strong beat changes."],
    tags: ["vibe-only", "hopeful", "create-story", "options"],
  }),
  createStoryOptionsExample({
    id: "elite-improve-ending-known-options",
    category: "story-improve-options",
    userPrompt: "I only know the ending: he opens the door and sees his future self. Build better options around that.",
    story:
      "Enough is known to offer multiple structured stories that all pay off the future-self ending and clearly recommend the strongest one.",
    knownFacts: ["The ending image is fixed: he opens the door and sees his future self."],
    storyHelpMode: "improve",
    storyOptions: [
      createStoryOption({
        title: "The Archive Door",
        character: "A library volunteer following a notebook map.",
        goal: "Find the sealed archive before the renovation crew destroys it.",
        conflict: "Every clue suggests someone else has already been there before him.",
        escalation: "The notebook keeps updating with drawings of actions he has not taken yet.",
        turningPoint: "He reaches the door and realizes the drawings were all made by the future self behind it.",
        resolution: "He chooses to open the archive anyway and breaks the cycle by trusting the future warning.",
        isRecommended: true,
      }),
      createStoryOption({
        title: "The Chalk Stairwell",
        character: "A student using impossible chalk to redraw blocked paths.",
        goal: "Escape the looping stairwell before dawn.",
        conflict: "Each chalk doorway costs him something from the real school.",
        escalation: "The stairwell gets stranger as his options narrow.",
        turningPoint: "The final door opens onto a future self who has already paid every cost once.",
        resolution: "He redraws the last door differently and changes the ending they were trapped in.",
      }),
      createStoryOption({
        title: "The Train Compartment",
        character: "A courier chasing the source of a torn map.",
        goal: "Catch the ghost train before it leaves forever.",
        conflict: "The map only makes sense when he ignores what everyone else can see.",
        escalation: "The stations get emptier and more impossible with each step.",
        turningPoint: "The compartment door opens and his future self is waiting with the same map.",
        resolution: "He finally understands the choice that kept repeating and takes a different route home.",
      }),
    ],
    reasoning:
      "Ending-first prompts should still get multiple strong story options, with one recommended path that gives the ending the clearest build and emotional payoff.",
    storyQualityNotes: ["Recommended Story should make the fixed ending feel inevitable, not random."],
    planQualityNotes: ["The final plan should make every earlier beat point toward the future-self reveal."],
    tags: ["improve", "ending-first", "future-self", "options"],
  }),
  createStoryOptionsExample({
    id: "elite-create-dark-school-options",
    category: "story-create-options",
    userPrompt: "I want a dark school story with a real twist.",
    story:
      "Enough is known to recommend several dark school stories and clearly choose the one with the strongest twist and emotional payoff.",
    knownFacts: ["The user wants a dark tone.", "The setting should stay in school."],
    storyHelpMode: "create",
    storyOptions: [
      createStoryOption({
        title: "The Burned Archive",
        character: "A library helper who finds future burn marks inside returned books.",
        goal: "Stop a sealed archive from vanishing before renovation day.",
        conflict: "Each clue points toward a fire the school chose to forget and ties it closer to her family.",
        escalation: "The library loses names, rooms, and records as the hidden history fights to stay buried.",
        turningPoint: "She learns her own family helped erase the archive and must decide whether to expose them.",
        resolution: "She reveals the truth before the archive disappears and changes the meaning of her family name.",
        isRecommended: true,
      }),
      createStoryOption({
        title: "The Empty Hallway Loop",
        character: "A student receiving tomorrow's warnings in his own handwriting.",
        goal: "Break the repeating morning before the predicted accident happens again.",
        conflict: "Every attempt to save someone erases more of the school around him.",
        escalation: "Faces disappear from posters, exits vanish, and the hallway becomes more hostile with each loop.",
        turningPoint: "He realizes the loop began because of the truth he keeps refusing to say.",
        resolution: "He confesses before the accident repeats and the school finally stops folding in on itself.",
      }),
      createStoryOption({
        title: "The Locked Broadcast Room",
        character: "A student sound-tech hearing a voice from the sealed PA room.",
        goal: "Figure out who keeps broadcasting warnings through dead speakers.",
        conflict: "The recordings start predicting his own choices and implicate someone he trusts.",
        escalation: "Each message becomes more personal and more impossible to ignore.",
        turningPoint: "He hears the recording of the lie he is about to tell.",
        resolution: "He changes course in time and opens the room to the truth the school hid.",
      }),
    ],
    reasoning:
      "This teaches the model to generate multiple darker options and recommend the one with the clearest mystery engine and strongest personal cost.",
    storyQualityNotes: ["Recommended Story should combine a strong visual hook with a personal twist that changes the ending emotionally."],
    planQualityNotes: ["The chosen plan should unfold like a tense sequence of discoveries, not a list of instructions."],
    tags: ["dark", "school", "create-story", "options", "twist"],
  }),
  createStoryOptionsExample({
    id: "elite-create-protect-someone-options",
    category: "story-create-options",
    userPrompt: "Give me a story where the main character is trying to protect someone.",
    story:
      "Enough is known to recommend several protection-driven stories and clearly choose the one with the strongest emotional and visual payoff.",
    knownFacts: ["The main character should be protecting someone."],
    storyHelpMode: "create",
    storyOptions: [
      createStoryOption({
        title: "The Hospital Drawing",
        character: "An older brother trying to protect his little sister's last good memory of their mom.",
        goal: "Get her repaired drawing to the hospital before visiting hours end.",
        conflict: "He caused the fight that ruined the drawing and keeps making things worse trying to fix it fast.",
        escalation: "The walk grows more tense as each failed shortcut exposes more hurt between them.",
        turningPoint: "He finally admits the truth instead of protecting himself.",
        resolution: "They repair the drawing together and the protection becomes honest instead of controlling.",
        isRecommended: true,
      }),
      createStoryOption({
        title: "Bridge Courier",
        character: "A rooftop courier trying to protect a friend who looks like the enemy.",
        goal: "Keep the friend alive long enough to expose the real villain.",
        conflict: "Everyone else believes the friend caused the disaster already unfolding.",
        escalation: "The bridge and the pursuit both collapse around them as trust erodes.",
        turningPoint: "He sees proof the friend was trying to stop the disaster, not start it.",
        resolution: "He chooses the friend over the mission and changes the outcome for both of them.",
      }),
      createStoryOption({
        title: "The Practice Room Key",
        character: "A quiet pianist protecting a younger student's secret song.",
        goal: "Get the song played before the talent show coach shuts it down.",
        conflict: "The coach thinks the song is stolen and the younger student is too scared to speak up.",
        escalation: "The rehearsal clock keeps running out as evidence and courage both fall apart.",
        turningPoint: "The pianist risks the performance to reveal who wrote the piece.",
        resolution: "The younger student finally performs it openly and grows because someone protected the truth, not the silence.",
      }),
    ],
    reasoning:
      "Protection prompts should create stories where the goal, stakes, and emotional payoff all align around who is being protected and why.",
    storyQualityNotes: ["Recommended Story should make the protection goal emotionally costly, not merely practical."],
    planQualityNotes: ["The final plan should escalate pressure around the person being protected and land on one strong act of loyalty."],
    tags: ["protect", "emotional", "create-story", "options"],
  }),
  createStoryOptionsExample({
    id: "elite-create-object-chaos-options",
    category: "story-create-options",
    userPrompt: "I want an object to come to life and cause chaos.",
    story:
      "Enough is known to recommend several object-chaos stories and clearly choose the one with the best visual engine and payoff.",
    knownFacts: ["The user wants a living object causing chaos."],
    storyHelpMode: "create",
    storyOptions: [
      createStoryOption({
        title: "The Helpful Locker",
        character: "A student trying to survive one normal school day.",
        goal: "Keep his living locker from publicly ruining every class.",
        conflict: "The locker keeps helping the wrong way at exactly the wrong moment.",
        escalation: "Its help gets bigger, louder, and more public until it starts rolling through the hallway on its own.",
        turningPoint: "He finally gives the locker a real mission instead of only hiding from it.",
        resolution: "The locker saves the day in one impossible burst of chaos and becomes the weird hero of school.",
        isRecommended: true,
      }),
      createStoryOption({
        title: "The Projector That Hates Stillness",
        character: "A theater student setting up before the showcase.",
        goal: "Keep the old projector from destroying the set before the audience arrives.",
        conflict: "The projector brings every prop image to life the second the room gets quiet.",
        escalation: "The stage fills with runaway visual echoes that get harder to control.",
        turningPoint: "He realizes the projector is trying to finish the scene he never staged.",
        resolution: "He gives it the ending it wants and turns the chaos into the best opening act of the night.",
      }),
      createStoryOption({
        title: "The Balloon Animal Revolt",
        character: "A tiny student carrying one giant balloon animal to a surprise party.",
        goal: "Get the balloon there before it escapes or pops.",
        conflict: "The balloon starts acting like an excited pet with terrible timing.",
        escalation: "Its attempts to help trigger bigger and bigger school disasters.",
        turningPoint: "He stops dragging it and starts working with it instead.",
        resolution: "They reach the party together and the balloon's final chaos becomes the perfect joke.",
      }),
    ],
    reasoning:
      "Living-object prompts should generate several strong visual engines and recommend the one with the clearest escalating rule.",
    storyQualityNotes: ["Recommended Story should make the object's behavior consistent enough to drive escalating scenes."],
    planQualityNotes: ["The chosen plan should turn each object-caused disruption into a stronger visual beat than the last."],
    tags: ["object-chaos", "create-story", "options", "visual"],
  }),
  createStoryOptionsExample({
    id: "elite-create-friend-turns-enemy-options",
    category: "story-create-options",
    userPrompt: "Give me a story where a friend becomes the enemy in the middle.",
    story:
      "Enough is known to recommend several betrayal-driven stories and clearly choose the one with the sharpest midpoint turn.",
    knownFacts: ["The story should include a friend-to-enemy shift."],
    storyHelpMode: "create",
    storyOptions: [
      createStoryOption({
        title: "The Wrong Package",
        character: "A courier racing a former friend across rooftops.",
        goal: "Deliver a sealed package before dawn.",
        conflict: "The friend turns against the mission and keeps trying to stop the delivery.",
        escalation: "Every rooftop exchange exposes more of their fractured trust.",
        turningPoint: "The hero learns the friend was right about the package all along.",
        resolution: "The final choice saves the friend, not the package, and changes the mission completely.",
        isRecommended: true,
      }),
      createStoryOption({
        title: "The Talent Show Lie",
        character: "A performer trusting their duet partner before the school showcase.",
        goal: "Make the final performance work perfectly.",
        conflict: "Their partner secretly sabotages the routine after hearing a lie about the judges.",
        escalation: "Rehearsals unravel into accusations and public mistakes.",
        turningPoint: "The hero learns the sabotage came from fear, not cruelty.",
        resolution: "They rebuild the act around the truth and the relationship changes shape instead of simply healing.",
      }),
      createStoryOption({
        title: "The Duplicate Map",
        character: "A student following a torn station map with a new ally.",
        goal: "Find the missing room the map points to.",
        conflict: "The ally turns enemy at the midpoint when they realize what the room contains.",
        escalation: "The station chase becomes a race between trust and ambition.",
        turningPoint: "The hero reaches the room first and sees why the betrayal happened.",
        resolution: "They decide whether to expose the room together or lose each other over it.",
      }),
    ],
    reasoning:
      "This teaches the model to recommend betrayal stories where the midpoint turn changes the emotional direction instead of only adding action.",
    storyQualityNotes: ["Recommended Story should make the betrayal reshape the goal and the ending, not just the middle scene."],
    planQualityNotes: ["The final plan should treat the betrayal as the turning point that changes every beat after it."],
    tags: ["betrayal", "mid-story-turn", "create-story", "options"],
  }),
  createStoryOptionsExample({
    id: "elite-create-future-prediction-options",
    category: "story-create-options",
    userPrompt: "I want a story where a drawing predicts the future.",
    story:
      "Enough is known to recommend several future-prediction stories and clearly choose the one with the strongest cause-and-effect structure.",
    knownFacts: ["The story should involve a drawing that predicts the future."],
    storyHelpMode: "create",
    storyOptions: [
      createStoryOption({
        title: "The Library Notebook",
        character: "A student volunteer shelving old sketchbooks.",
        goal: "Understand why a notebook keeps drawing tomorrow's moments.",
        conflict: "Each prediction pulls him toward a hidden archive he was never supposed to see.",
        escalation: "The drawings become more personal and more impossible to ignore.",
        turningPoint: "He turns the page and sees the drawing of himself opening the final door.",
        resolution: "He chooses to follow it, discovers the archive, and changes what tomorrow means by acting differently this time.",
        isRecommended: true,
      }),
      createStoryOption({
        title: "The Showcase Portrait",
        character: "A student painting late for the art showcase.",
        goal: "Finish the portrait before morning.",
        conflict: "The painting keeps updating to show moments that have not happened yet.",
        escalation: "Each new image predicts a worse emotional outcome if she keeps hiding the truth.",
        turningPoint: "She paints the one future she wants instead of the one she fears.",
        resolution: "The showcase reveals the portrait she chose and changes the real morning around it.",
      }),
      createStoryOption({
        title: "The Chalk Court",
        character: "A player sketching plays on the gym wall after practice.",
        goal: "Figure out why one play diagram keeps redrawing itself before tryouts.",
        conflict: "The prediction only makes sense if he trusts the teammate he keeps shutting out.",
        escalation: "Every new diagram predicts a bigger failure caused by his pride.",
        turningPoint: "He finally runs the play the wall shows instead of the one he wants.",
        resolution: "The tryout works because he changed before the prediction became a disaster.",
      }),
    ],
    reasoning:
      "Future-prediction prompts should yield several clear causal structures and recommend the one with the best reveal rhythm and emotional payoff.",
    storyQualityNotes: ["Recommended Story should make the prediction force real choices instead of passive observation."],
    planQualityNotes: ["The chosen plan should reveal each prediction at the moment it raises pressure most."],
    tags: ["future-prediction", "drawing", "create-story", "options"],
  }),
  createStoryOptionsExample({
    id: "elite-improve-rejected-adapt-options",
    category: "story-improve-options",
    userPrompt: "I do not like those ideas. Give me stronger options with a bigger wow moment.",
    story:
      "Enough is known to adapt after rejection by offering stronger twists, bigger visuals, and one clear recommendation.",
    knownFacts: ["The user rejected the previous ideas.", "The next pass should feel bigger and more exciting."],
    storyHelpMode: "improve",
    storyOptions: [
      createStoryOption({
        title: "The Room Behind the Drawing",
        character: "A student following a chalk line through the school.",
        goal: "Reach the hidden room the line keeps pointing toward.",
        conflict: "Each doorway he draws deletes part of the real building behind him.",
        escalation: "The school becomes thinner and more impossible with every step.",
        turningPoint: "He opens the last door and finds a future version of the room built from his own unfinished drawings.",
        resolution: "He redraws the room as it should be and saves both the school and the version of himself trapped there.",
        isRecommended: true,
      }),
      createStoryOption({
        title: "The Bell That Summons Tomorrow",
        character: "A sound-tech student who notices one impossible bell tone.",
        goal: "Stop the disaster the bell keeps predicting before the final assembly.",
        conflict: "No one else hears the warning the same way and the evidence keeps vanishing.",
        escalation: "Each new bell rings closer to the disaster and more publicly.",
        turningPoint: "He realizes the bell is built from a recording he made in the future.",
        resolution: "He uses that same sound to prevent the event instead of cause it.",
      }),
      createStoryOption({
        title: "The Champion's Sketch",
        character: "A rookie fighter finding his own defeat drawn in a notebook before the final match.",
        goal: "Figure out whether the sketch is a warning or a trap.",
        conflict: "Every attempt to avoid the prediction pushes him closer to losing exactly that way.",
        escalation: "The fight becomes a battle against both the opponent and the future image in his head.",
        turningPoint: "He realizes the sketch shows defeat only if he fights to prove himself instead of protect someone else.",
        resolution: "He changes why he fights and rewrites the ending in the last exchange.",
      }),
    ],
    reasoning:
      "This teaches the model to adapt creatively after rejection and come back with stronger, more cinematic story options instead of repeating itself.",
    storyQualityNotes: ["Recommended Story should answer rejection with a bigger twist and a clearer emotional payoff, not extra complexity for its own sake."],
    planQualityNotes: ["The chosen plan should build toward one undeniable wow moment before the ending resolves it cleanly."],
    tags: ["rejected-ideas", "bigger-wow", "improve", "options"],
  }),
  createStoryOptionsExample({
    id: "elite-improve-vibe-action-emotion-options",
    category: "story-improve-options",
    userPrompt: "I want it to feel more like action plus emotion, not just one or the other.",
    story:
      "Enough is known to recommend several mixed action-emotion stories and clearly choose the one with the best balance.",
    knownFacts: ["The user wants both action and emotion in the same story."],
    storyHelpMode: "improve",
    storyOptions: [
      createStoryOption({
        title: "Bridge of Rivals",
        character: "A rooftop courier chasing a former friend across a collapsing bridge.",
        goal: "Protect a sealed package until he learns who it truly serves.",
        conflict: "The former friend keeps trying to stop him for reasons he refuses to explain.",
        escalation: "The bridge collapses while the fight forces old betrayal into the open.",
        turningPoint: "He learns the friend was trying to save him from the mission itself.",
        resolution: "He chooses the friend over the package and the action lands emotionally instead of ending empty.",
        isRecommended: true,
      }),
      createStoryOption({
        title: "The Last Performance Chase",
        character: "A performer chasing a stolen prop through the school before the showcase.",
        goal: "Get the prop back and still make it onstage in time.",
        conflict: "The thief is the friend who thought getting caught was better than saying goodbye.",
        escalation: "The chase grows bigger while the emotional reason for it gets more painful.",
        turningPoint: "He stops running and finally hears why the friend wanted the show to fail.",
        resolution: "They rebuild the act from that truth and the performance pays off both the chase and the relationship.",
      }),
      createStoryOption({
        title: "The Chalk Escape",
        character: "A student using impossible chalk doors to outrun a living sketch.",
        goal: "Reach the hidden room before the sketch overtakes the school.",
        conflict: "Each door helps physically but costs him part of the real world he is trying to save.",
        escalation: "The chase grows faster while the emotional cost keeps climbing.",
        turningPoint: "He realizes the sketch is built from the part of himself he keeps trying to outrun.",
        resolution: "He stops escaping, redraws the sketch with care, and saves both worlds at once.",
      }),
    ],
    reasoning:
      "This teaches the model to recommend options where the action is driven by emotional stakes, not running beside them.",
    storyQualityNotes: ["Recommended Story should make the action and the emotional decision collide at the turning point."],
    planQualityNotes: ["The chosen plan should let visual escalation and character change rise together instead of separately."],
    tags: ["action", "emotion", "improve", "options"],
  }),
];

const ELITE_PLAN_QUALITY_EXAMPLES: GeneratePlansExample[] = [
  createPlanMasterExample({
    id: "elite-plan-library-archive",
    userPrompt: "A student follows a notebook map through the library and reveals a hidden family archive before the renovation crew seals it.",
    story: "A complete library mystery with a strong goal, escalating search, reveal, and emotional payoff.",
    knownFacts: ["The goal, conflict, reveal, and ending choice are already explicit."],
    reasoning: "Teach the model to turn a complete mystery into a plan with clean setup, rising search beats, a reveal threshold, and a satisfying aftermath.",
    storyQualityNotes: ["The archive reveal changes the protagonist's understanding of their family and the school."],
    planQualityNotes: ["Add a distinct midpoint reveal before the final archive opening so the mystery keeps climbing."],
    tags: ["library", "mystery", "emotional"],
  }),
  createPlanMasterExample({
    id: "elite-plan-train-fight",
    userPrompt: "Two hand-drawn stick figures fight on top of a moving train and the winner has to save the loser before dawn.",
    story: "A complete action story with environment-driven escalation and a character-defining climax.",
    knownFacts: ["The fight setup, escalation engine, turning point, and payoff are already known."],
    reasoning: "Teach the model that a great fight plan escalates visually, changes phase at the turning point, and ends on emotional payoff instead of only impact.",
    storyQualityNotes: ["The save-before-win beat makes the climax meaningful instead of flat."],
    planQualityNotes: ["Shift the plan from duel beats into survival beats before the final save so the ending surges instead of repeating."],
    tags: ["fight", "train", "hand-drawn", "action"],
  }),
  createPlanMasterExample({
    id: "elite-plan-emotional-portrait",
    userPrompt: "A student keeps repainting a portrait for the showcase until someone she loves quietly hangs the imperfect version for her.",
    story: "A complete emotional art story with visual repetition, inner conflict, and a clear final payoff image.",
    knownFacts: ["The setup, emotional struggle, turning point, and ending image are already present."],
    reasoning: "Teach the model to pace a quiet emotional story with escalation, not just mood, and to land the final image clearly.",
    storyQualityNotes: ["The imperfect portrait resolves the same fear introduced in the setup."],
    planQualityNotes: ["Use repeated repainting as the escalation ladder, then make the hallway reveal the unmistakable climax image."],
    tags: ["emotional", "portrait", "art-room"],
  }),
  createPlanMasterExample({
    id: "elite-plan-comedy-locker",
    userPrompt: "A living locker keeps trying to help a student through school and becomes the weird accidental hero of the day.",
    story: "A complete comedy story with one clean comic engine, escalating hallway disasters, and a clear final payoff.",
    knownFacts: ["The living locker is the comedy engine and the ending hero beat is already known."],
    reasoning: "Teach the model that great comedy plans grow one simple rule into bigger consequences before one huge payoff.",
    storyQualityNotes: ["The locker's bad help creates both the comedy and the eventual rescue."],
    planQualityNotes: ["Make each locker interruption larger and more public than the last before the hero payoff."],
    tags: ["funny", "locker", "school", "comedy"],
  }),
  createPlanMasterExample({
    id: "elite-plan-short-balloon",
    userPrompt: "A small stick figure tries to deliver a giant balloon animal through school before the bell.",
    story: "A complete short-form comedy with a simple goal, one escalation chain, and a strong visual ending.",
    knownFacts: ["The prop, goal, obstacles, and bell deadline are all already clear."],
    reasoning: "Teach compact planning: clean setup, fast escalation, one turn, one payoff, no wasted beats.",
    storyQualityNotes: ["The story stays strong because every obstacle threatens the same simple goal."],
    planQualityNotes: ["Keep the plan tight to 4 or 5 beats max and land on one clean reveal frame."],
    tags: ["short-clip", "balloon", "comedy"],
  }),
  createPlanMasterExample({
    id: "elite-plan-surreal-bus",
    userPrompt: "A student rides a looping late bus until giving away the sketchbook he keeps hiding finally breaks the route.",
    story: "A complete surreal story with a clear emotional engine and one decisive handoff climax.",
    knownFacts: ["The loop mechanic, hidden sketchbook, turning point, and ending are already clear."],
    reasoning: "Teach the model to keep surreal plans readable by tying every strange beat to one emotional conflict.",
    storyQualityNotes: ["The sketchbook is both the emotional secret and the tool that breaks the loop."],
    planQualityNotes: ["Increase surreal distortion each loop, then keep the handoff visually simple and final."],
    tags: ["surreal", "bus", "emotional"],
  }),
  createPlanMasterExample({
    id: "elite-plan-rescue-robot",
    userPrompt: "A student keeps failing to build a tiny rescue robot until one remembered counterweight fix makes it work at the last second.",
    story: "A complete invention story with repeated failures, a memory-based turning point, and a final rescue payoff.",
    knownFacts: ["The build/fail/fix/payoff structure is already present."],
    reasoning: "Teach the model to use failure beats as true escalation and make the final fix feel earned by earlier mistakes.",
    storyQualityNotes: ["The remembered fix gives the protagonist visible growth and payoff."],
    planQualityNotes: ["Each failed test should teach something, then the final rescue should solve the exact problem the build promised."],
    tags: ["invention", "robot", "workshop"],
  }),
  createPlanMasterExample({
    id: "elite-plan-roof-apology",
    userPrompt: "Two friends meet on the school roof after a lie and decide whether to walk back into the talent show together.",
    story: "A complete emotional confrontation with a clear apology turning point and a direction-changing ending.",
    knownFacts: ["The lie, roof confrontation, and final decision are already locked."],
    reasoning: "Teach the model how to pace a dialogue-heavy scene so tension rises toward one choice instead of flattening out.",
    storyQualityNotes: ["The apology changes the direction of the relationship instead of merely explaining the past."],
    planQualityNotes: ["Start with distance, increase honesty line by line, then let the walk back downstairs serve as resolution."],
    tags: ["roof", "apology", "emotional", "performance"],
  }),
  createPlanMasterExample({
    id: "elite-plan-platform-choice",
    userPrompt: "A girl tears up her ticket on the platform and then sees the person from the letter step off the arriving train.",
    story: "A complete emotional choice story with a visible turning point and a reunion payoff.",
    knownFacts: ["The letter, ticket tear, arrival, and reunion are all already known."],
    reasoning: "Teach the model to make the choice visible before the reunion so the ending feels earned, not lucky.",
    storyQualityNotes: ["The emotional arc works because the protagonist chooses before the reveal arrives."],
    planQualityNotes: ["Build the plan around the ticket tear as turning point, then use the arrival as climax and the shared stillness as resolution."],
    tags: ["platform", "letter", "choice", "emotional"],
  }),
  createPlanMasterExample({
    id: "elite-plan-chalk-door",
    userPrompt: "A student uses impossible chalk doors to reach a hidden room and has to redraw the school solid again before dawn.",
    story: "A complete drawing fantasy with escalating world-loss, a truth-facing turning point, and a visual resolution.",
    knownFacts: ["The chalk-door mechanic, hidden room goal, and redraw resolution are already known."],
    reasoning: "Teach the model that drawing-based plans should escalate through world changes and resolve with one decisive image, not exposition.",
    storyQualityNotes: ["The magical rule keeps raising the stakes by making the school thinner and more unstable."],
    planQualityNotes: ["Each new door should visibly cost more than the last, then the final redraw should restore the world in a clear ending beat."],
    tags: ["chalk", "door", "drawing", "fantasy"],
  }),
  createPlanMasterExample({
    id: "elite-plan-kite-water-tower",
    userPrompt: "A brother climbs the old water tower for a trapped kite and finds a nest of stolen letters at the top.",
    story: "A complete outdoor adventure with a climb, a reveal, and a personal payoff.",
    knownFacts: ["The kite rescue, tower climb, hidden letters, and relationship core are already set."],
    reasoning: "Teach the model to turn a climb story into strong visual phases and use the reveal to deepen the emotional arc.",
    storyQualityNotes: ["The adventure works because the physical climb and emotional relationship are tied together."],
    planQualityNotes: ["Use the climb as rising action, the letter nest as a reveal midpoint, and the descent/return as the payoff arc."],
    tags: ["outdoor", "kite", "tower", "adventure"],
  }),
  createPlanMasterExample({
    id: "elite-plan-map-platform-room",
    userPrompt: "Two students holding the same torn map uncover where the missing station room went.",
    story: "A complete shared mystery with a clear inciting clue, growing investigation, reveal, and relationship change.",
    knownFacts: ["The shared map and hidden station room already define the arc."],
    reasoning: "Teach the model to plan clue stories so every beat advances both the mystery and the partnership.",
    storyQualityNotes: ["The shared clue creates both plot movement and relationship tension."],
    planQualityNotes: ["Stage the map discovery, clue chase, false lead, missing-room reveal, and shared resolution as clean phases."],
    tags: ["map", "station", "mystery", "partnership"],
  }),
  createPlanMasterExample({
    id: "elite-plan-talent-show",
    userPrompt: "A performer loses the planned routine right before the talent show and has to rebuild it live around the truth they were hiding.",
    story: "A complete performance story with strong pre-show escalation, a live turning point, and a cathartic finish.",
    knownFacts: ["The failed routine, hidden truth, live rebuild, and final performance are all known."],
    reasoning: "Teach the model to use rehearsal and pre-show pressure as real escalation before the onstage climax.",
    storyQualityNotes: ["The performance only works because the character stops hiding in the turning point."],
    planQualityNotes: ["Keep the pre-show pressure rising, then make the onstage rebuild the emotional and visual peak."],
    tags: ["performance", "talent-show", "emotional"],
  }),
  createPlanMasterExample({
    id: "elite-plan-runner-delivery",
    userPrompt: "A fast school courier has to get one secret note across campus before the monitors close every route.",
    story: "A complete chase story with a deadline, tightening map, risky shortcut, and final bell payoff.",
    knownFacts: ["The note, route closures, and final bell are already locked."],
    reasoning: "Teach the model to shape chase plans around changing space, not just speed, so the middle truly escalates.",
    storyQualityNotes: ["The route closures transform one simple delivery into a full survival arc."],
    planQualityNotes: ["Make each blocked route visibly change the map, then use one high-risk shortcut as the turning point before the delivery payoff."],
    tags: ["runner", "delivery", "deadline", "school"],
  }),
  createPlanMasterExample({
    id: "elite-plan-family-box",
    userPrompt: "A student finds a hidden family box in the library archive and has to slip it out before footsteps reach the room.",
    story: "A complete discovery thriller with stealth escalation, a revealing object, and a close escape ending.",
    knownFacts: ["The archive, family box, footsteps, and escape are already present."],
    reasoning: "Teach the model to plan discovery stories so the reveal and the escape both matter, instead of letting one flatten the other.",
    storyQualityNotes: ["The family box changes the meaning of the search instead of acting as a random prop."],
    planQualityNotes: ["Open with quiet search beats, spike tension at the family-box reveal, then pivot quickly into a stealth escape payoff."],
    tags: ["library", "family", "stealth", "thriller"],
  }),
  createPlanMasterExample({
    id: "elite-plan-snow-bridge",
    userPrompt: "A boy waits on a snowy bridge for the friend who stopped answering him and sees the repaired camera only at the last second.",
    story: "A complete reunion story with quiet escalation, one clear turning point, and a visually emotional ending.",
    knownFacts: ["The bridge wait, silence, repaired camera, and reunion are all known."],
    reasoning: "Teach the model to make a quiet story escalate emotionally and end on a simple but unforgettable image.",
    storyQualityNotes: ["The repaired camera acts as the visible symbol of change and forgiveness."],
    planQualityNotes: ["Use time, weather, and hesitation to raise tension, then let the arrival and camera handoff resolve everything cleanly."],
    tags: ["snow", "bridge", "reunion", "emotional"],
  }),
  createPlanMasterExample({
    id: "elite-plan-future-notebook",
    userPrompt: "A student turns the page of an old notebook, freezes at a drawing of the next moment, then hears someone call his name from behind the shelves.",
    story: "A complete reveal-driven mystery scene with a page-turn shock, silence, and a voice that turns the whole room dangerous.",
    knownFacts: ["The notebook reveal, freeze, silence, and voice behind the shelves are already known."],
    reasoning: "Teach the model to plan reveal scenes as cinematic sequences of beats rather than abstract instructions.",
    storyQualityNotes: ["The scene works because the visual hook turns into an immediate emotional shock."],
    planQualityNotes: ["Sequence it like a scene: page turn -> freeze -> silence -> voice behind him -> choice to hide or move."],
    tags: ["notebook", "reveal", "library", "cinematic"],
  }),
  createPlanMasterExample({
    id: "elite-plan-living-mural",
    userPrompt: "A student's mural keeps repainting itself with tomorrow's disaster until she leaves the truth on the wall instead of hiding it.",
    story: "A complete art-room story with visual escalation, emotional resistance, and one revealing final image.",
    knownFacts: ["The repainting mural, the future-disaster hook, and the final choice are already clear."],
    reasoning: "Teach the model to write plans as vivid scene progressions where each repainting changes the pressure on the next beat.",
    storyQualityNotes: ["The mural's changing images create both the visual hook and the emotional shift."],
    planQualityNotes: ["Let each repainting become a more urgent scene, then make the final untouched mural the payoff frame."],
    tags: ["mural", "art-room", "future", "cinematic"],
  }),
  createPlanMasterExample({
    id: "elite-plan-bell-code",
    userPrompt: "A student sound-tech realizes the school bell is warning him about a disaster that will hit the assembly stage.",
    story: "A complete school thriller with a repeating signal, escalating urgency, and a public climax.",
    knownFacts: ["The bell code, the assembly target, and the student sound-tech lead are already known."],
    reasoning: "Teach the model to shape clue stories into cinematic sequences that escalate toward one public reveal.",
    storyQualityNotes: ["The repeating bell pattern gives the story a strong visual and audio hook."],
    planQualityNotes: ["Move from private bell warnings to public assembly danger so the scale keeps increasing before the final save."],
    tags: ["school", "bell", "assembly", "cinematic"],
  }),
  createPlanMasterExample({
    id: "elite-plan-stage-sabotage",
    userPrompt: "A performer loses the planned routine, rebuilds it live around the truth they were hiding, and wins the room back.",
    story: "A complete showcase story with rehearsal tension, onstage risk, and a cathartic final turn.",
    knownFacts: ["The failed routine, hidden truth, and live rebuild are already known."],
    reasoning: "Teach the model to plan performance stories as rising scene pressure that bursts into one decisive live pivot.",
    storyQualityNotes: ["The story lands because the emotional truth and the stage action peak at the same moment."],
    planQualityNotes: ["Sequence it as rehearsal strain -> pre-show collapse -> onstage rebuild -> room going quiet -> release."],
    tags: ["performance", "stage", "showcase", "cinematic"],
  }),
  createPlanMasterExample({
    id: "elite-plan-locker-hero",
    userPrompt: "A living locker keeps making school worse until its final burst of chaos accidentally saves the day.",
    story: "A complete comedy with one escalating rule and a payoff that turns annoyance into heroism.",
    knownFacts: ["The living locker and the final accidental save are already known."],
    reasoning: "Teach the model that even comedy plans should feel like scene sequences with escalation and one decisive payoff image.",
    storyQualityNotes: ["The object-caused chaos stays strong because the locker follows one clear comic rule."],
    planQualityNotes: ["Build the scenes from small help -> worse help -> public disaster -> impossible heroic save."],
    tags: ["locker", "comedy", "school", "cinematic"],
  }),
  createPlanMasterExample({
    id: "elite-plan-object-escape",
    userPrompt: "A project-room machine comes alive, escapes through the school, and only stops when the student changes what he built it for.",
    story: "A complete invention chase with escalating machine chaos, a personal turning point, and a meaningful ending.",
    knownFacts: ["The machine escape and the final repurpose are already known."],
    reasoning: "Teach the model to plan invention stories as action sequences that culminate in a character-based redesign choice.",
    storyQualityNotes: ["The invention reflects the protagonist's wrong goal until the ending changes it."],
    planQualityNotes: ["Sequence it as launch -> first malfunction -> schoolwide chase -> redesign realization -> controlled final use."],
    tags: ["machine", "escape", "project", "cinematic"],
  }),
  createPlanMasterExample({
    id: "elite-plan-friend-betrayal",
    userPrompt: "A trusted partner turns against the hero in the middle of the mission, then the truth behind the betrayal changes the final choice.",
    story: "A complete betrayal story with a strong midpoint reversal, escalating distrust, and a payoff built on new understanding.",
    knownFacts: ["The partner betrayal and the truth-reveal ending are already known."],
    reasoning: "Teach the model to make betrayal plans pivot sharply at the turning point and then escalate toward a different kind of climax.",
    storyQualityNotes: ["The midpoint betrayal creates a memorable emotional shift and stronger final choice."],
    planQualityNotes: ["Write it as trust -> fracture -> pursuit -> truth reveal -> final choice, not as abstract advice."],
    tags: ["betrayal", "mission", "emotional", "cinematic"],
  }),
  createPlanMasterExample({
    id: "elite-plan-wow-doorway",
    userPrompt: "Each chalk doorway deletes part of the real school until the final room reveals the version of the hero who never stopped drawing.",
    story: "A complete fantasy story with strong wow moments, rising cost, and a final room reveal that changes the hero's identity.",
    knownFacts: ["The chalk doorway mechanic, the cost, and the final room reveal are already set."],
    reasoning: "Teach the model to sequence wow moments so each doorway raises the visual stakes and the final room pays them off emotionally.",
    storyQualityNotes: ["The wow factor works because each magical step costs something real."],
    planQualityNotes: ["Stage it as doorway beats that get stranger, emptier, and more dangerous until the final room lands as the payoff scene."],
    tags: ["chalk", "doorway", "wow", "cinematic"],
  }),
];

const CONTINUATION_EXAMPLES: GeneratePlansExample[] = [
  createExample({
    id: "continuation-fight-round-kick",
    category: "story-continuation",
    userPrompt: "Okay, for the red stick figure, add a round kick here after the punch.",
    story:
      "The fight already exists, and the user wants to add one more specific action beat: a round kick after the punch from the red fighter.",
    knownFacts: [
      "There is already a current fight or animation in progress.",
      "The red stick figure is already part of the current context.",
      "The new beat should happen after an existing punch.",
      "The add-on action is a round kick.",
    ],
    missingFacts: [],
    rankedMissingFacts: [],
    strongestGap: "",
    bestQuestion: null,
    acceptableOptions: [],
    badQuestions: ["What kind of story do you want?", "Who is fighting?", "What happens next?"],
    reasoning:
      "The user is clearly continuing an existing fight beat, not asking for a new story. The add-on is specific enough to plan directly.",
    shouldPlanNow: true,
    shouldAskQuestion: false,
    storyHelpMode: "none",
    enoughKnownToPlan: true,
    maxQuestionsBeforePlanning: 0,
    storyQualityNotes: [
      "Treat the request as a continuation of the current action chain, not a reset.",
      "The new beat should connect cleanly to the existing punch so the combo reads as one sequence.",
    ],
    planQualityNotes: [
      "Continue from the existing beat immediately instead of restaging the whole fight.",
      "Make the added kick read as a natural escalation beat in the current combo.",
    ],
    tags: ["continuation", "story-continuation", "action-add-on", "current-animation-extension", "fight", "round-kick"],
  }),
  createExample({
    id: "continuation-combo-add-slam",
    category: "plan-continuation",
    userPrompt: "Right now in the animation, he lands, pauses, then add an overhand slam with the left hand.",
    story:
      "The animation already has a landing and pause, and the user wants to extend it with one more overhand slam beat using the left hand.",
    knownFacts: [
      "The current animation already includes a landing beat.",
      "There is already a pause after the landing.",
      "The requested add-on is an overhand slam.",
      "The slam should use the left hand.",
    ],
    missingFacts: [],
    rankedMissingFacts: [],
    strongestGap: "",
    bestQuestion: null,
    acceptableOptions: [],
    badQuestions: ["What kind of story do you want?", "Who goes first?", "What happens next?"],
    reasoning:
      "This is a direct animation extension request with enough timing and action detail to continue the plan immediately.",
    shouldPlanNow: true,
    shouldAskQuestion: false,
    storyHelpMode: "none",
    enoughKnownToPlan: true,
    maxQuestionsBeforePlanning: 0,
    storyQualityNotes: [
      "Continuation requests should preserve the beat order the user already gave.",
      "The new move should feel like the next action in the existing animation, not a brand-new setup.",
    ],
    planQualityNotes: [
      "Use the landing and pause as the setup for the added slam beat.",
      "Keep the new beat readable as a clean extension of the current action chain.",
    ],
    tags: ["continuation", "plan-continuation", "action-add-on", "current-animation-extension", "slam", "fight"],
  }),
  createExample({
    id: "continuation-library-add-reveal",
    category: "current-story-extension",
    userPrompt: "We already have the library scene. Add a reveal where someone calls his name.",
    story:
      "The library scene already exists, and the user wants to extend it by adding a reveal beat where someone calls his name.",
    knownFacts: [
      "There is already an established library scene.",
      "The user wants to add a reveal beat, not replace the story.",
      "The new reveal is someone calling his name.",
    ],
    missingFacts: [],
    rankedMissingFacts: [],
    strongestGap: "",
    bestQuestion: null,
    acceptableOptions: [],
    badQuestions: ["What kind of story do you want?", "What does he find?", "Can you help me understand the story?"],
    reasoning:
      "The request is explicitly framed as an add-on to the current story, and the new reveal beat is already clear enough to continue planning.",
    shouldPlanNow: true,
    shouldAskQuestion: false,
    storyHelpMode: "none",
    enoughKnownToPlan: true,
    maxQuestionsBeforePlanning: 0,
    storyQualityNotes: [
      "A continuation request should preserve the existing scene and add one clean new beat.",
      "The added reveal should increase tension without restarting the mystery.",
    ],
    planQualityNotes: [
      "Insert the name-call reveal as the next story beat in the current library sequence.",
      "Let the reveal shift tension forward instead of replaying the setup.",
    ],
    tags: ["continuation", "current-story-extension", "library", "reveal", "mystery"],
  }),
  createExample({
    id: "continuation-notebook-page-flips",
    category: "current-story-extension",
    userPrompt: "Keep the current story, but add a moment where the notebook page flips by itself.",
    story:
      "The current notebook story already exists, and the user wants one extra supernatural beat where the page flips on its own.",
    knownFacts: [
      "There is already a current story in progress.",
      "The notebook is already part of the existing story.",
      "The new beat is a page flipping by itself.",
    ],
    missingFacts: [],
    rankedMissingFacts: [],
    strongestGap: "",
    bestQuestion: null,
    acceptableOptions: [],
    badQuestions: ["What kind of story do you want?", "What does he find?", "What happens next?"],
    reasoning:
      "The add-on is precise and clearly framed as continuation, so the system should incorporate it directly instead of rebooting the story.",
    shouldPlanNow: true,
    shouldAskQuestion: false,
    storyHelpMode: "none",
    enoughKnownToPlan: true,
    maxQuestionsBeforePlanning: 0,
    storyQualityNotes: [
      "Continuation behavior should honor the existing notebook mystery and add one escalating beat.",
      "The supernatural page flip should intensify the current scene without replacing its setup.",
    ],
    planQualityNotes: [
      "Place the page-flip beat where it naturally spikes tension in the existing sequence.",
      "Use the new beat as escalation, not as a reason to restart the whole plan.",
    ],
    tags: ["continuation", "current-story-extension", "notebook", "mystery-beat", "library"],
  }),
  createExample({
    id: "continuation-add-spin-kick-clear",
    category: "action-add-on",
    userPrompt: "After that part, add a spin kick.",
    story:
      "The user is referring to an existing animation or fight sequence and wants to add a spin kick as the next beat after the current part.",
    knownFacts: [
      "The user is continuing an existing sequence.",
      "The requested add-on is a spin kick.",
      "The new beat should happen after the current part.",
    ],
    missingFacts: [],
    rankedMissingFacts: [],
    strongestGap: "",
    bestQuestion: null,
    acceptableOptions: [],
    badQuestions: ["What kind of story do you want?", "Who is fighting?", "What happens next?"],
    reasoning:
      "Even though the request is short, the user's continuation intent is explicit enough that the right move is to extend the current sequence instead of starting over.",
    shouldPlanNow: true,
    shouldAskQuestion: false,
    storyHelpMode: "none",
    enoughKnownToPlan: true,
    maxQuestionsBeforePlanning: 0,
    storyQualityNotes: [
      "Short add-on requests should still be treated as continuation when the wording clearly references an existing beat.",
    ],
    planQualityNotes: [
      "Attach the spin kick directly after the current beat instead of regenerating the whole scene.",
    ],
    tags: ["continuation", "action-add-on", "current-animation-extension", "spin-kick", "fight"],
  }),
  createExample({
    id: "continuation-add-twist-school",
    category: "story-continuation",
    userPrompt: "The school story is already there. Add a twist where the teacher knew about it the whole time.",
    story:
      "The current school story already exists, and the user wants to extend it with a twist revealing that the teacher knew about the situation all along.",
    knownFacts: [
      "There is already an established school story.",
      "The user wants to add a twist, not replace the plot.",
      "The twist is that the teacher knew the truth the whole time.",
    ],
    missingFacts: [],
    rankedMissingFacts: [],
    strongestGap: "",
    bestQuestion: null,
    acceptableOptions: [],
    badQuestions: ["What kind of school story do you want?", "Can you help me understand the story?", "What happens next?"],
    reasoning:
      "The continuation beat is already specific and should be folded into the current story as a twist reveal.",
    shouldPlanNow: true,
    shouldAskQuestion: false,
    storyHelpMode: "none",
    enoughKnownToPlan: true,
    maxQuestionsBeforePlanning: 0,
    storyQualityNotes: [
      "A continuation twist should deepen the existing plot rather than replace it.",
    ],
    planQualityNotes: [
      "Treat the teacher-knowledge reveal as a later twist beat in the existing school arc.",
    ],
    tags: ["continuation", "story-continuation", "school", "twist", "current-story-extension"],
  }),
  createExample({
    id: "continuation-emotional-reaction-beat",
    category: "story-continuation",
    userPrompt: "The emotional story is already there. I just want to add a quiet reaction beat after the apology.",
    story:
      "The emotional scene already exists, and the user wants to extend it with one quiet reaction beat after the apology.",
    knownFacts: [
      "The emotional story already exists.",
      "An apology already happens in the current scene.",
      "The user wants to add a quiet reaction beat afterward.",
    ],
    missingFacts: ["What the quiet reaction is."],
    rankedMissingFacts: ["What the quiet reaction is."],
    strongestGap: "What the quiet reaction beat actually looks like.",
    bestQuestion: "What quiet reaction do you want after the apology?",
    acceptableOptions: ["A long pause", "A small nod", "Tears held back", "A shaky laugh"],
    badQuestions: ["What kind of story do you want?", "What happens next?", "Do you want a new emotional story?"],
    reasoning:
      "This is still a continuation request, but one specific reaction detail would sharpen the added beat before planning it.",
    shouldPlanNow: false,
    shouldAskQuestion: true,
    storyHelpMode: "none",
    enoughKnownToPlan: false,
    maxQuestionsBeforePlanning: 1,
    storyQualityNotes: [
      "Continuation questions should target only the new beat, not reopen the whole story.",
      "The existing apology scene stays intact while the reaction beat gets clarified.",
    ],
    planQualityNotes: [
      "Once the reaction is known, add it immediately after the apology as the emotional settling beat.",
    ],
    tags: ["continuation", "story-continuation", "emotional", "reaction-beat", "current-story-extension"],
  }),
  createExample({
    id: "continuation-drawing-effect-beat",
    category: "current-animation-extension",
    userPrompt: "Continue the current drawing story by adding a visual beat where the chalk sparks before the wall opens.",
    story:
      "The drawing-based story already exists, and the user wants one more visual effect beat where chalk sparks appear before the wall opens.",
    knownFacts: [
      "There is already a current drawing story in progress.",
      "The wall opening is already part of the current sequence.",
      "The new beat is chalk sparks before the wall opens.",
    ],
    missingFacts: [],
    rankedMissingFacts: [],
    strongestGap: "",
    bestQuestion: null,
    acceptableOptions: [],
    badQuestions: ["What kind of drawing story do you want?", "What does the door do?", "What happens next?"],
    reasoning:
      "The current story and timing slot are already clear, so the AI should extend the sequence with the added visual effect beat directly.",
    shouldPlanNow: true,
    shouldAskQuestion: false,
    storyHelpMode: "none",
    enoughKnownToPlan: true,
    maxQuestionsBeforePlanning: 0,
    storyQualityNotes: [
      "Continuation requests in drawing stories often add one visual escalation beat rather than a new plot.",
    ],
    planQualityNotes: [
      "Insert the chalk-spark beat immediately before the existing wall-open reveal so the escalation reads clearly.",
    ],
    tags: ["continuation", "current-animation-extension", "drawing", "visual-beat", "effect-beat"],
  }),
  createExample({
    id: "continuation-current-plan-one-more-beat",
    category: "plan-continuation",
    userPrompt: "Continue the current plan by adding one more clean action beat.",
    story:
      "The user already has a current plan and wants one more action beat added to it without replacing the existing sequence.",
    knownFacts: [
      "There is already a current plan in progress.",
      "The user wants to extend it with one more clean action beat.",
    ],
    missingFacts: ["What kind of action beat should be added."],
    rankedMissingFacts: ["What kind of action beat should be added."],
    strongestGap: "What kind of added action beat the user wants.",
    bestQuestion: "What kind of action beat do you want to add: impact, dodge, reveal, or finisher?",
    acceptableOptions: ["Impact", "Dodge", "Reveal", "Finisher"],
    badQuestions: ["What kind of story do you want?", "Can you help me understand the story?", "What happens next?"],
    reasoning:
      "The user clearly wants continuation, but one narrow action-type question will make the added beat precise without restarting the plan.",
    shouldPlanNow: false,
    shouldAskQuestion: true,
    storyHelpMode: "none",
    enoughKnownToPlan: false,
    maxQuestionsBeforePlanning: 1,
    storyQualityNotes: [
      "Continuation requests should keep the current plan intact and only clarify the new beat if needed.",
    ],
    planQualityNotes: [
      "Once the beat type is known, append it cleanly to the current action chain without re-planning the earlier beats.",
    ],
    tags: ["continuation", "plan-continuation", "action-add-on", "current-plan-extension"],
  }),
  createExample({
    id: "continuation-saved-project-library-room-match",
    category: "current-story-extension",
    userPrompt: "This is the same saved library project. Add a beat where he realizes the notebook sketch matches the room around him.",
    story:
      "The library mystery already exists in the saved project, and the user wants to extend it with a reveal that the notebook sketch matches the real room.",
    knownFacts: [
      "This is the same saved project, not a restart.",
      "The current story is already a library mystery.",
      "The new beat is the realization that the sketch matches the room.",
    ],
    missingFacts: [],
    rankedMissingFacts: [],
    strongestGap: "",
    bestQuestion: null,
    acceptableOptions: [],
    badQuestions: ["What kind of story do you want?", "Who is the character?", "Should I make a new library plot?"],
    reasoning:
      "The continuation and the new reveal are both already clear, so the right move is to extend the current scene instead of rebuilding it.",
    shouldPlanNow: true,
    shouldAskQuestion: false,
    storyHelpMode: "none",
    enoughKnownToPlan: true,
    maxQuestionsBeforePlanning: 0,
    storyQualityNotes: [
      "Saved-project continuation should preserve the existing mystery instead of flattening the current context.",
      "The new realization beat escalates the current scene rather than replacing it.",
    ],
    planQualityNotes: [
      "Drop the room-match reveal directly into the existing library sequence as the next tension spike.",
      "Use the current scene as the base and build forward from there.",
    ],
    tags: ["continuation", "current-story-extension", "same-project", "library", "mystery", "reveal"],
  }),
  createExample({
    id: "continuation-fight-low-feint-into-overhand",
    category: "action-add-on",
    userPrompt: "Keep the same fight going. After the dodge, have blue fake low and then come over the top.",
    story:
      "The fight already exists, and the user wants the next beat to continue the same exchange with a low feint into an overhand attack from blue.",
    knownFacts: [
      "The same fight is already in progress.",
      "A dodge has already happened in the current sequence.",
      "Blue should fake low first, then attack over the top.",
    ],
    missingFacts: [],
    rankedMissingFacts: [],
    strongestGap: "",
    bestQuestion: null,
    acceptableOptions: [],
    badQuestions: ["What kind of story do you want?", "Who is fighting?", "Should I make a new fight idea?"],
    reasoning:
      "The combo logic and continuation cue are both explicit, so the plan should extend the same exchange instead of restarting the fight.",
    shouldPlanNow: true,
    shouldAskQuestion: false,
    storyHelpMode: "none",
    enoughKnownToPlan: true,
    maxQuestionsBeforePlanning: 0,
    storyQualityNotes: [
      "Continuation beats should preserve the existing combat rhythm and only add the new tactical change.",
    ],
    planQualityNotes: [
      "Place the low feint and overhand as the immediate continuation after the dodge.",
      "Keep the sequence reading like one connected fight exchange.",
    ],
    tags: ["continuation", "action-add-on", "fight", "current-animation-extension", "same-sequence"],
  }),
  createExample({
    id: "continuation-current-scene-next-mystery-beat",
    category: "story-continuation",
    userPrompt: "Keep the same scene. After that, add a beat where the shelf moves before anyone touches it.",
    story:
      "The scene already exists, and the user wants the next mystery beat to be a shelf moving on its own before anyone touches it.",
    knownFacts: [
      "The same current scene should continue.",
      "The next beat is the shelf moving on its own.",
      "The shelf movement happens before anyone touches it.",
    ],
    missingFacts: [],
    rankedMissingFacts: [],
    strongestGap: "",
    bestQuestion: null,
    acceptableOptions: [],
    badQuestions: ["What story do you want?", "What happens next?", "Should I start a new scene?"],
    reasoning:
      "The user is clearly extending the same scene with one specific beat, so the plan should absorb that beat directly.",
    shouldPlanNow: true,
    shouldAskQuestion: false,
    storyHelpMode: "none",
    enoughKnownToPlan: true,
    maxQuestionsBeforePlanning: 0,
    storyQualityNotes: ["Same-scene continuation should add pressure without resetting the setup."],
    planQualityNotes: ["Use the moving shelf as the next escalator inside the existing scene order."],
    tags: ["continuation", "story-continuation", "same-scene", "mystery-beat"],
  }),
  createExample({
    id: "continuation-emotional-silence-after-hug",
    category: "story-continuation",
    userPrompt: "Keep the current emotional scene, but after the hug add a quiet beat where neither of them knows what to say.",
    story:
      "The emotional scene is already in progress, and the user wants a quiet silence beat after the hug where both characters sit in the awkward release of the moment.",
    knownFacts: [
      "The current emotional scene already exists.",
      "A hug already happens in the scene.",
      "The new beat is a quiet silence where neither person knows what to say.",
    ],
    missingFacts: [],
    rankedMissingFacts: [],
    strongestGap: "",
    bestQuestion: null,
    acceptableOptions: [],
    badQuestions: ["What kind of emotional story do you want?", "Who are the characters?", "What happens next?"],
    reasoning:
      "The continuation is already emotionally precise, so there is enough detail to place the new reaction beat without reopening the whole story.",
    shouldPlanNow: true,
    shouldAskQuestion: false,
    storyHelpMode: "none",
    enoughKnownToPlan: true,
    maxQuestionsBeforePlanning: 0,
    storyQualityNotes: ["Continuation should protect the existing emotional payoff and only deepen it with the next reaction beat."],
    planQualityNotes: ["Add the silence immediately after the hug so the scene can breathe instead of jumping to a different story path."],
    tags: ["continuation", "story-continuation", "emotional", "reaction-beat", "same-scene"],
  }),
  createExample({
    id: "continuation-school-locker-reveal",
    category: "story-continuation",
    userPrompt: "We already have the school mystery. Next, have her open the wrong locker first and then find the real clue in the one beside it.",
    story:
      "The school mystery already exists, and the user wants the next beat to be a wrong-locker fake-out before the real clue is found in the locker beside it.",
    knownFacts: [
      "The school mystery is already established.",
      "The next beat includes opening the wrong locker first.",
      "The real clue is in the locker beside it.",
    ],
    missingFacts: [],
    rankedMissingFacts: [],
    strongestGap: "",
    bestQuestion: null,
    acceptableOptions: [],
    badQuestions: ["What kind of school story do you want?", "Should I make a new clue?", "What happens next?"],
    reasoning:
      "The sequence logic is already defined, so the plan should extend the current mystery with the fake-out and reveal beats directly.",
    shouldPlanNow: true,
    shouldAskQuestion: false,
    storyHelpMode: "none",
    enoughKnownToPlan: true,
    maxQuestionsBeforePlanning: 0,
    storyQualityNotes: ["Continuation beats can add a small misdirect without replacing the main mystery arc."],
    planQualityNotes: ["Use the wrong-locker beat as a brief delay, then land the actual clue immediately after for payoff."],
    tags: ["continuation", "story-continuation", "school", "mystery", "twist", "same-scene"],
  }),
  createExample({
    id: "continuation-current-plan-recovery-beat",
    category: "plan-continuation",
    userPrompt: "Continue the current plan by adding a short recovery beat after the slam before the next attack.",
    story:
      "The current action plan already contains a slam, and the user wants a short recovery beat inserted before the next attack continues.",
    knownFacts: [
      "There is already a current action plan.",
      "A slam already happens in that plan.",
      "The next addition should be a short recovery beat before the next attack.",
    ],
    missingFacts: [],
    rankedMissingFacts: [],
    strongestGap: "",
    bestQuestion: null,
    acceptableOptions: [],
    badQuestions: ["What kind of story do you want?", "Should I make a brand-new fight?", "What happens next?"],
    reasoning:
      "The user has already defined both the surrounding beats and the function of the new beat, so the plan can continue directly.",
    shouldPlanNow: true,
    shouldAskQuestion: false,
    storyHelpMode: "none",
    enoughKnownToPlan: true,
    maxQuestionsBeforePlanning: 0,
    storyQualityNotes: ["Continuation should preserve the existing beat order and only add the new recovery moment."],
    planQualityNotes: ["Slot the recovery beat directly after the slam so the next attack has cleaner spacing and contrast."],
    tags: ["continuation", "plan-continuation", "current-plan-extension", "fight", "recovery-beat"],
  }),
  createExample({
    id: "continuation-current-scene-reveal-tone-question",
    category: "story-continuation",
    userPrompt: "Keep the same library scene and add the moment where someone calls his name from behind him.",
    story:
      "The same library scene should continue, and the next beat is someone calling his name from behind him, but the scene would plan better if the tone of that call is clarified.",
    knownFacts: [
      "The same library scene should continue.",
      "The next beat is someone calling his name from behind him.",
    ],
    missingFacts: ["Whether the voice should feel friendly, urgent, or threatening."],
    rankedMissingFacts: ["Whether the voice should feel friendly, urgent, or threatening."],
    strongestGap: "Whether the voice should feel friendly, urgent, or threatening.",
    bestQuestion: "Should the voice sound friendly, urgent, or threatening?",
    acceptableOptions: ["Friendly", "Urgent", "Threatening"],
    badQuestions: ["What kind of story do you want?", "Who is the main character?", "What happens next?"],
    reasoning:
      "The continuation is already clear. The only useful question is the tone of the new reveal beat so the scene turns the right way.",
    shouldPlanNow: false,
    shouldAskQuestion: true,
    storyHelpMode: "none",
    enoughKnownToPlan: false,
    maxQuestionsBeforePlanning: 1,
    storyQualityNotes: ["Continuation questions should clarify only the new beat and preserve the rest of the current scene."],
    planQualityNotes: ["Once the voice tone is known, place the call as the next reveal beat without restaging the library scene."],
    tags: ["continuation", "story-continuation", "library", "question-needed", "same-scene"],
  }),
  createExample({
    id: "continuation-current-animation-next-attack-style-question",
    category: "action-add-on",
    userPrompt: "Keep the same combo going and add one more hit after that.",
    story:
      "The current combo should continue with one more hit, but the remaining missing detail is whether that new beat should feel faster or more aggressive.",
    knownFacts: [
      "The same combo is already in progress.",
      "The user wants one more hit after the current beat.",
    ],
    missingFacts: ["Whether the next hit should be quick and clean or aggressive and heavy."],
    rankedMissingFacts: ["Whether the next hit should be quick and clean or aggressive and heavy."],
    strongestGap: "What performance style the added hit should have.",
    bestQuestion: "Should the next hit feel quick and clean or more aggressive and heavy?",
    acceptableOptions: ["Quick and clean", "Aggressive and heavy"],
    badQuestions: ["What kind of story do you want?", "Who is the character?", "What happens next?"],
    reasoning:
      "This is clearly continuation, so the only useful question is the style of the new hit rather than anything that resets the combo context.",
    shouldPlanNow: false,
    shouldAskQuestion: true,
    storyHelpMode: "none",
    enoughKnownToPlan: false,
    maxQuestionsBeforePlanning: 1,
    storyQualityNotes: ["Continuation add-ons should keep the current combo intact and only clarify the new beat's flavor if needed."],
    planQualityNotes: ["Once the style is known, append the hit directly after the current beat without re-planning the combo."],
    tags: ["continuation", "action-add-on", "fight", "question-needed", "same-sequence"],
  }),
];

const SIMPLE_SCALE_EXAMPLES: GeneratePlansExample[] = [
  createExample({
    id: "simple-short-fight-dodge-counter",
    category: "simple-request",
    userPrompt: "make a short fight where one guy dodges and counters",
    story:
      "A short fight should stay focused on one attack, one clean dodge, a brief tension beat, and one clear counter.",
    knownFacts: [
      "The scene is a short fight.",
      "One fighter dodges and counters.",
      "The output should stay simple and readable.",
    ],
    missingFacts: [],
    rankedMissingFacts: [],
    strongestGap: "",
    bestQuestion: null,
    acceptableOptions: [],
    badQuestions: ["Should I add weapons?", "Do you want a longer combo?", "What emotional theme should it have?"],
    reasoning:
      "The request is already specific and small. The right answer is one clean exchange, not a bigger fight concept.",
    shouldPlanNow: true,
    shouldAskQuestion: false,
    storyHelpMode: "none",
    enoughKnownToPlan: true,
    maxQuestionsBeforePlanning: 0,
    planQualityNotes: [
      "Good: Fighter A throws a punch, Fighter B leans back for a clean dodge, pause for tension, Fighter B counters fast, Fighter A recoils.",
      "Return one clean plan only.",
      "Keep the exchange short and animatable instead of turning it into a long combo.",
    ],
    badStyleNotes: [
      ...COMMON_BAD_STYLE_NOTES,
      "Bad: adding five extra moves, new weapons, or a full combo fight overcomplicates this simple ask.",
    ],
    tags: ["simple-request", "single-plan", "scale-control", "fight", "visual-beats"],
  }),
  createExample({
    id: "simple-funny-slip-gag",
    category: "simple-request",
    userPrompt: "make a simple funny animation",
    story:
      "A simple funny animation should build around one readable gag instead of a full cast or dramatic premise.",
    knownFacts: [
      "The user wants something funny.",
      "The plan should stay simple and short.",
    ],
    missingFacts: [],
    rankedMissingFacts: [],
    strongestGap: "",
    bestQuestion: null,
    acceptableOptions: [],
    badQuestions: ["What is the emotional backstory?", "Should there be multiple side characters?", "What big twist should happen?"],
    reasoning:
      "The easiest strong answer is one clear comedy setup, one slip, one overreaction, and one ending pose.",
    shouldPlanNow: true,
    shouldAskQuestion: false,
    storyHelpMode: "none",
    enoughKnownToPlan: true,
    maxQuestionsBeforePlanning: 0,
    planQualityNotes: [
      "Good: Character walks in confidently, slips on a small object, overreacts dramatically, then ends embarrassed.",
      "Keep the gag visual and easy to animate.",
    ],
    badStyleNotes: [
      ...COMMON_BAD_STYLE_NOTES,
      "Bad: adding emotional backstory or multiple unnecessary characters weakens a simple comedy prompt.",
    ],
    tags: ["simple-request", "single-plan", "scale-control", "comedy", "visual-beats"],
  }),
  createExample({
    id: "simple-walk-cycle-scale-control",
    category: "scale-control",
    userPrompt: "make a walk cycle",
    story:
      "A walk cycle request is a compact motion-loop ask and should come back as one clean plan instead of a menu of story ideas.",
    knownFacts: ["The user wants a walk cycle.", "This is a simple direct motion request."],
    missingFacts: [],
    rankedMissingFacts: [],
    strongestGap: "",
    bestQuestion: null,
    acceptableOptions: [],
    badQuestions: ["What genre should the story be?", "Do you want three different concepts?", "Who is the villain?"],
    reasoning:
      "The scale is tiny and direct, so the response should stay tiny and direct too.",
    shouldPlanNow: true,
    shouldAskQuestion: false,
    storyHelpMode: "none",
    enoughKnownToPlan: true,
    maxQuestionsBeforePlanning: 0,
    planQualityNotes: [
      "Good: return one clean loop plan with readable contact, passing, and recovery beats.",
      "Do not pad a walk cycle into multiple concepts or cinematic story beats.",
    ],
    tags: ["simple-request", "single-plan", "scale-control", "loop", "visual-beats"],
  }),
  createExample({
    id: "exploratory-fight-scene-ideas",
    category: "scale-control",
    userPrompt: "give me ideas for a fight scene",
    story:
      "An exploratory idea request should return a small set of strong options with one clear recommendation, not one giant overbuilt answer.",
    knownFacts: [
      "The user wants ideas.",
      "The ideas are for a fight scene.",
    ],
    missingFacts: [],
    rankedMissingFacts: [],
    strongestGap: "",
    bestQuestion: null,
    acceptableOptions: [],
    badQuestions: ["What happens next?", "Do you want me to choose everything for you without options?"],
    reasoning:
      "This is one of the cases where options are actually useful, but the set should stay tight and decisive.",
    shouldPlanNow: true,
    shouldAskQuestion: false,
    storyHelpMode: "create",
    storyOptions: [
      {
        title: "Hallway Rush Counter",
        character: "Two stick fighters",
        goal: "Break through a narrow hallway first",
        conflict: "Each fighter keeps stealing the center lane",
        escalation: "The exchanges get faster as the lane gets tighter",
        turningPoint: "One fighter baits a miss and counter-steps around the wall",
        resolution: "A single clean counter decides it",
        isRecommended: true,
      },
      {
        title: "Platform Edge Duel",
        character: "A kicker and a grappler",
        goal: "Hold the shrinking platform",
        conflict: "Range and pressure keep changing the spacing",
        escalation: "Every slip leaves less safe footing",
        turningPoint: "A near fall turns into a reversal grab",
        resolution: "One fighter barely recovers while the other drops",
      },
      {
        title: "Object Chase Fight",
        character: "A carrier and a pursuer",
        goal: "Keep control of the same glowing object",
        conflict: "Every attack has to protect or steal the object",
        escalation: "The object starts changing the route and forcing riskier moves",
        turningPoint: "The carrier intentionally drops it to create one clean opening",
        resolution: "The final grab ends the chase",
      },
    ],
    planQualityNotes: [
      "Good: 2 to 3 options are enough for exploratory asks.",
      "Clearly recommend one strongest option instead of dumping too many choices.",
    ],
    tags: ["exploratory-request", "options-when-useful", "scale-control", "fight", "visual-beats"],
  }),
  createExample({
    id: "unclear-idk-ask-one-question",
    category: "scale-control",
    userPrompt: "idk what to do",
    story:
      "A fully unclear prompt should not trigger a random plan. The right move is one smart clarifying question with a few useful directions.",
    knownFacts: ["The user does not know what to make yet."],
    missingFacts: ["Which broad animation direction they want."],
    rankedMissingFacts: ["Which broad animation direction they want."],
    strongestGap: "What kind of animation direction would help most right now.",
    bestQuestion: "Do you want a fight, something funny, or a simple action loop?",
    acceptableOptions: ["Fight", "Funny", "Simple action loop"],
    badQuestions: ["What happens next?", "Can you explain everything you want?", "What full story world should this be in?"],
    reasoning:
      "There is not enough direction for a real plan yet, so ask one useful question instead of guessing wildly.",
    shouldPlanNow: false,
    shouldAskQuestion: true,
    storyHelpMode: "create",
    enoughKnownToPlan: false,
    maxQuestionsBeforePlanning: 1,
    planQualityNotes: [
      "Ask exactly one question.",
      "Offer a few clear paths instead of forcing the user to write a long explanation.",
    ],
    tags: ["unclear-request", "one-question-only", "scale-control", "messy-input"],
  }),
];

const IMPROVE_MODE_IDENTITY_EXAMPLES: GeneratePlansExample[] = [
  createExample({
    id: "improve-punch-preserve-identity",
    category: "improve-mode",
    userPrompt: "a guy punches another guy, make it better",
    story:
      "Improve mode should keep the same punch setup and strengthen the animation clarity with anticipation, impact, recoil, and settle.",
    knownFacts: [
      "The core idea is still one guy punching another guy.",
      "The user wants improvement, not replacement.",
    ],
    missingFacts: [],
    rankedMissingFacts: [],
    strongestGap: "",
    bestQuestion: null,
    acceptableOptions: [],
    badQuestions: ["Should I turn this into a full fight scene?", "Do you want weapons now?", "Should it explode?"],
    reasoning:
      "The identity is already clear. A better punch plan keeps the same action and improves readability.",
    shouldPlanNow: true,
    shouldAskQuestion: false,
    storyHelpMode: "improve",
    enoughKnownToPlan: true,
    maxQuestionsBeforePlanning: 0,
    planQualityNotes: [
      "Good: keep the same punch setup, add anticipation, fast contact, recoil, and a short pause after the hit.",
      "Why good: same idea, better animation clarity and impact.",
    ],
    badStyleNotes: [
      ...COMMON_BAD_STYLE_NOTES,
      "Bad: turning one punch into a full fight scene, adding weapons, or adding an explosion replaces the original idea.",
    ],
    tags: ["improve-mode", "preserve-identity", "fight", "single-plan", "visual-beats"],
  }),
  createExample({
    id: "improve-ball-drop-preserve-identity",
    category: "improve-mode",
    userPrompt: "a ball drops and stops, make it better",
    story:
      "Improve mode should keep the same falling ball idea and only add clearer motion mechanics like squash, bounce, and settle.",
    knownFacts: [
      "The core idea is a ball dropping and stopping.",
      "The user wants the same action improved.",
    ],
    missingFacts: [],
    rankedMissingFacts: [],
    strongestGap: "",
    bestQuestion: null,
    acceptableOptions: [],
    badQuestions: ["Should the ball explode?", "Do you want another object?", "Should it turn into a character?"],
    reasoning:
      "The action is already specific, so the improvement should stay focused on motion quality instead of changing the concept.",
    shouldPlanNow: true,
    shouldAskQuestion: false,
    storyHelpMode: "improve",
    enoughKnownToPlan: true,
    maxQuestionsBeforePlanning: 0,
    planQualityNotes: [
      "Good: falling motion, squash on impact, small bounce, smaller bounce, settle.",
      "Keep the same object and same overall motion idea.",
    ],
    badStyleNotes: [
      ...COMMON_BAD_STYLE_NOTES,
      "Bad: changing the ball into an explosion or adding unrelated props replaces the user's idea.",
    ],
    tags: ["improve-mode", "preserve-identity", "object-motion", "single-plan", "visual-beats"],
  }),
  createExample({
    id: "improve-explosion-preserve-identity",
    category: "preserve-identity",
    userPrompt: "make this explosion better",
    story:
      "An improvement request about an explosion should keep the explosion and enhance the buildup, burst, and fade instead of changing the effect type.",
    knownFacts: [
      "The effect is already an explosion.",
      "The user wants a better version of the same effect.",
    ],
    missingFacts: [],
    rankedMissingFacts: [],
    strongestGap: "",
    bestQuestion: null,
    acceptableOptions: [],
    badQuestions: ["Should I make it lightning instead?", "Should I replace it with energy beams?", "Should I restart the whole concept?"],
    reasoning:
      "The right improvement stays inside the same effect family and pushes the timing and readability of that effect.",
    shouldPlanNow: true,
    shouldAskQuestion: false,
    storyHelpMode: "improve",
    enoughKnownToPlan: true,
    maxQuestionsBeforePlanning: 0,
    planQualityNotes: [
      "Good: keep the explosion, improve the buildup, burst, and fade.",
      "Preserve the same effect identity while making the beats read better.",
    ],
    badStyleNotes: [
      ...COMMON_BAD_STYLE_NOTES,
      "Bad: replacing the explosion with lightning or some unrelated effect ignores improve mode.",
    ],
    tags: ["improve-mode", "preserve-identity", "effect", "single-plan", "visual-beats"],
  }),
  createExample({
    id: "improve-this-punch-direct",
    category: "improve-mode",
    userPrompt: "improve this punch",
    story:
      "A short improve request should preserve the current punch and tighten only the anticipation, contact, and recoil.",
    knownFacts: [
      "There is already a punch.",
      "The user wants it improved, not replaced.",
    ],
    missingFacts: [],
    rankedMissingFacts: [],
    strongestGap: "",
    bestQuestion: null,
    acceptableOptions: [],
    badQuestions: ["Should I make a new attack?", "Should I replace the whole sequence?", "Who are the new characters?"],
    reasoning:
      "The shortest useful answer is still identity-preserving: same punch, better motion readability.",
    shouldPlanNow: true,
    shouldAskQuestion: false,
    storyHelpMode: "improve",
    enoughKnownToPlan: true,
    maxQuestionsBeforePlanning: 0,
    planQualityNotes: [
      "Keep the same punch action and improve anticipation, contact, recoil, and settle.",
    ],
    tags: ["improve-mode", "preserve-identity", "fight", "single-plan", "visual-beats"],
  }),
];

const QUALITY_JUDGMENT_EXAMPLES: GeneratePlansExample[] = [
  createExample({
    id: "quality-logical-cause-and-effect",
    category: "quality-judgment",
    userPrompt: "make sure the plan makes sense",
    story:
      "A strong plan should use logical cause and effect instead of random twists that appear for no reason.",
    knownFacts: ["The user wants clearer logic and stronger plan quality."],
    missingFacts: [],
    rankedMissingFacts: [],
    strongestGap: "",
    bestQuestion: null,
    acceptableOptions: [],
    badQuestions: ["Should I add a random surprise anyway?", "What unrelated twist should happen?"],
    reasoning:
      "This quality request is about judgment. The planner should favor grounded escalation and reject arbitrary events.",
    shouldPlanNow: true,
    shouldAskQuestion: false,
    storyHelpMode: "none",
    enoughKnownToPlan: true,
    maxQuestionsBeforePlanning: 0,
    storyQualityNotes: [
      "Bad plan: character walks, then an explosion happens for no reason.",
      "Good plan: character notices something, tension builds, then the explosion is triggered logically.",
    ],
    tags: ["quality-contrast", "logic", "cause-and-effect"],
  }),
  createExample({
    id: "quality-readable-motion-steps",
    category: "quality-judgment",
    userPrompt: "make the motion read clearly",
    story:
      "Readable animation plans separate actions into clear steps instead of stacking too much into one beat.",
    knownFacts: ["The user wants stronger animation readability."],
    missingFacts: [],
    rankedMissingFacts: [],
    strongestGap: "",
    bestQuestion: null,
    acceptableOptions: [],
    badQuestions: ["Should I cram more things into one frame?", "Should I make every beat happen at once?"],
    reasoning:
      "This is a quality judgment request about beat readability, so step-by-step motion is the right target.",
    shouldPlanNow: true,
    shouldAskQuestion: false,
    storyHelpMode: "none",
    enoughKnownToPlan: true,
    maxQuestionsBeforePlanning: 0,
    planQualityNotes: [
      "Bad: too many actions in one frame.",
      "Good: clear step-by-step readable motion.",
    ],
    tags: ["quality-contrast", "readability", "visual-beats"],
  }),
  createExample({
    id: "messy-more-cool-not-boring",
    category: "messy-plan-upgrade",
    userPrompt: "uhh make it like more cool and not boring",
    story:
      "Messy upgrade language usually means the current beats need more motion, stronger impact, and a clearer finish, not a whole new story.",
    knownFacts: [
      "There is already an idea in progress.",
      "The user wants it to feel more dynamic and less flat.",
    ],
    missingFacts: [],
    rankedMissingFacts: [],
    strongestGap: "",
    bestQuestion: null,
    acceptableOptions: [],
    badQuestions: ["Should I make a completely different story?", "Do you want random twists now?", "Should I ignore the current context?"],
    reasoning:
      "The wording is messy, but the likely problem is weak motion or impact. Improve those directly.",
    shouldPlanNow: true,
    shouldAskQuestion: false,
    storyHelpMode: "improve",
    enoughKnownToPlan: true,
    maxQuestionsBeforePlanning: 0,
    storyQualityNotes: ['Natural response cue: "Got it - I’ll make it feel more dynamic and less flat."'],
    planQualityNotes: [
      "Identify the likely issue first: lack of anticipation, movement, impact, or ending clarity.",
      "Add stronger motion and a clearer finish without replacing the original idea.",
    ],
    tags: ["messy-input", "improve-mode", "preserve-identity", "quality-contrast", "visual-beats"],
  }),
  createExample({
    id: "messy-this-part-sucks-one-question",
    category: "messy-input-default",
    userPrompt: "this part sucks",
    story:
      "A blunt negative reaction with no detail should trigger one smart improvement question instead of a blind rewrite.",
    knownFacts: ["The current part is not working for the user."],
    missingFacts: ["What kind of improvement they want most."],
    rankedMissingFacts: ["What kind of improvement they want most."],
    strongestGap: "Whether the fix should focus on speed, impact, or movement.",
    bestQuestion: "Do you want it faster, stronger impact, or more movement?",
    acceptableOptions: ["Faster", "Stronger impact", "More movement"],
    badQuestions: ["What full story should I rewrite?", "Should I restart everything?", "What happens next?"],
    reasoning:
      "There is clear dissatisfaction but not enough direction to fix the right thing. One targeted question is enough.",
    shouldPlanNow: false,
    shouldAskQuestion: true,
    storyHelpMode: "improve",
    enoughKnownToPlan: false,
    maxQuestionsBeforePlanning: 1,
    planQualityNotes: [
      "Ask one targeted improvement question instead of rewriting the whole plan blindly.",
    ],
    tags: ["messy-input", "one-question-only", "improve-mode", "quality-contrast"],
  }),
];

const MESSY_INPUT_EXAMPLES: GeneratePlansExample[] = [
  createExample({
    id: "messy-fight-cool-default",
    category: "messy-input-default",
    userPrompt: "make something cool",
    story:
      "A short action plan built from a loose prompt should default to a simple high-energy visual idea with readable beats instead of waiting for perfect story detail.",
    knownFacts: ["The user wants something cool, fast, and usable."],
    missingFacts: [],
    rankedMissingFacts: [],
    strongestGap: "",
    bestQuestion: null,
    acceptableOptions: [],
    badQuestions: ["What kind of story do you want?", "Can you explain what cool means?", "What happens next?"],
    reasoning:
      "The prompt is vague but still usable. A short animation-first beat plan is more helpful than stalling for clarification.",
    shouldPlanNow: true,
    shouldAskQuestion: false,
    storyHelpMode: "create",
    enoughKnownToPlan: true,
    maxQuestionsBeforePlanning: 0,
    storyQualityNotes: [
      "Use a strong readable action idea instead of trying to make a polished narrative.",
    ],
    planQualityNotes: [
      "Default to a short visual sequence with a clear opener, hit, reaction, and finish.",
      "Keep the beats drawable and frame-ready.",
    ],
    tags: ["messy-input", "animation-first", "builder-style", "visual-beats"],
  }),
  createExample({
    id: "messy-idk-fight-default",
    category: "messy-input-default",
    userPrompt: "idk just do a fight",
    story:
      "When the user asks for a fight with loose wording, the plan should lock into a simple combat sequence with clear motion beats and no unnecessary story buildup.",
    knownFacts: ["The user wants a fight.", "The user is fine with a direct default."],
    missingFacts: [],
    rankedMissingFacts: [],
    strongestGap: "",
    bestQuestion: null,
    acceptableOptions: [],
    badQuestions: ["Who are the characters?", "What is the backstory?", "Why are they fighting?"],
    reasoning:
      "A fight request already gives enough action direction for a practical beat plan. The right move is to choose a readable exchange and move forward.",
    shouldPlanNow: true,
    shouldAskQuestion: false,
    storyHelpMode: "create",
    enoughKnownToPlan: true,
    maxQuestionsBeforePlanning: 0,
    storyQualityNotes: ["Keep the plan visual and physical instead of dramatic or lore-heavy."],
    planQualityNotes: [
      "Structure the sequence as face-off, wind-up, impact, recoil, and reset or finisher.",
    ],
    tags: ["messy-input", "fight", "animation-first", "builder-style", "visual-beats"],
  }),
  createExample({
    id: "messy-cooler-upgrade-default",
    category: "messy-plan-upgrade",
    userPrompt: "make it cooler",
    story:
      "A refinement prompt like make it cooler should be treated as an upgrade request on the current plan, adding stronger motion beats and clearer staging instead of restarting.",
    knownFacts: [
      "There is already a current idea or plan.",
      "The user wants a stronger version, not a new story.",
    ],
    missingFacts: [],
    rankedMissingFacts: [],
    strongestGap: "",
    bestQuestion: null,
    acceptableOptions: [],
    badQuestions: ["What kind of story do you want now?", "Do you want to restart?", "What happens next?"],
    reasoning:
      "Cooler is vague, but in context it clearly means push the current idea harder. Improve the beats, spacing, or impact without reopening solved context.",
    shouldPlanNow: true,
    shouldAskQuestion: false,
    storyHelpMode: "improve",
    enoughKnownToPlan: true,
    maxQuestionsBeforePlanning: 0,
    storyQualityNotes: ["Keep the same core idea and raise the motion clarity or payoff strength."],
    planQualityNotes: [
      "Upgrade by sharpening the entrance, impact, and recovery beats.",
      "Prefer stronger staging, timing, and silhouette over new lore.",
    ],
    tags: ["messy-input", "iteration", "plan-quality-upgrade", "continuation", "visual-beats"],
  }),
  createExample({
    id: "messy-do-something-fast",
    category: "messy-input-default",
    userPrompt: "just give me something fast and punchy",
    story:
      "A fast and punchy request should become a compact action blueprint with quick readable beats, not a broad story outline.",
    knownFacts: ["The user wants speed.", "The user wants a punchy short sequence."],
    missingFacts: [],
    rankedMissingFacts: [],
    strongestGap: "",
    bestQuestion: null,
    acceptableOptions: [],
    badQuestions: ["What genre?", "What message should it have?", "Who is the hero?"],
    reasoning:
      "The pacing target is already clear enough to choose a short sequence with quick beats and move forward.",
    shouldPlanNow: true,
    shouldAskQuestion: false,
    storyHelpMode: "create",
    enoughKnownToPlan: true,
    maxQuestionsBeforePlanning: 0,
    planQualityNotes: [
      "Use 4 to 6 quick beats with little downtime.",
      "Make the action readable enough that Generate Frames can pick it up immediately.",
    ],
    tags: ["messy-input", "animation-first", "pacing", "visual-beats"],
  }),
  createExample({
    id: "messy-continue-better-default",
    category: "messy-plan-upgrade",
    userPrompt: "continue this but better",
    story:
      "A continuation-and-upgrade prompt should keep the current sequence, strengthen the next beats, and avoid restarting from zero.",
    knownFacts: [
      "There is already a plan or sequence in progress.",
      "The user wants continuation and improvement together.",
    ],
    missingFacts: [],
    rankedMissingFacts: [],
    strongestGap: "",
    bestQuestion: null,
    acceptableOptions: [],
    badQuestions: ["What kind of story do you want?", "Should I make a new plan?", "What do you mean by continue?"],
    reasoning:
      "This kind of messy refinement still points clearly to iteration. Preserve the current direction and make the added beats stronger and clearer.",
    shouldPlanNow: true,
    shouldAskQuestion: false,
    storyHelpMode: "improve",
    enoughKnownToPlan: true,
    maxQuestionsBeforePlanning: 0,
    planQualityNotes: [
      "Keep the same sequence logic and improve impact, staging, or flow in the next beats.",
    ],
    tags: ["messy-input", "continuation", "iteration", "plan-quality-upgrade", "visual-beats"],
  }),
];

const ITERATION_AND_HANDOFF_EXAMPLES: GeneratePlansExample[] = [
  createExample({
    id: "iteration-existing-plan-punchier",
    category: "plan-refinement",
    userPrompt: "Use the same plan, just make the motion beats punchier.",
    story:
      "The current plan stays in place, but the user wants the beat design tightened so each action reads more clearly and hits harder.",
    knownFacts: [
      "There is already a current plan.",
      "The user wants stronger motion beats, not a new concept.",
    ],
    missingFacts: [],
    rankedMissingFacts: [],
    strongestGap: "",
    bestQuestion: null,
    acceptableOptions: [],
    badQuestions: ["What story should I make instead?", "Who is the character?", "Do you want a different scene?"],
    reasoning:
      "This is a direct refinement request. The best move is to tighten the existing beat flow rather than asking for more setup.",
    shouldPlanNow: true,
    shouldAskQuestion: false,
    storyHelpMode: "improve",
    enoughKnownToPlan: true,
    maxQuestionsBeforePlanning: 0,
    planQualityNotes: [
      "Sharpen anticipation, impact, and recovery beats instead of adding new plot.",
    ],
    tags: ["iteration", "continuation", "plan-quality-upgrade", "animation-first", "visual-beats"],
  }),
  createExample({
    id: "iteration-fix-middle-beat-only",
    category: "partial-plan-edit",
    userPrompt: "Keep the opening and ending. Just fix the middle so the action reads better.",
    story:
      "The opening and ending are already locked, and the user wants only the middle action beats adjusted for clarity.",
    knownFacts: [
      "The opening is already accepted.",
      "The ending is already accepted.",
      "Only the middle needs to change.",
    ],
    missingFacts: [],
    rankedMissingFacts: [],
    strongestGap: "",
    bestQuestion: null,
    acceptableOptions: [],
    badQuestions: ["What is the story about?", "Should I replace the ending?", "What happens first?"],
    reasoning:
      "The request narrowly targets the middle, so the plan should preserve the locked sections and only rebuild the weak part.",
    shouldPlanNow: true,
    shouldAskQuestion: false,
    storyHelpMode: "improve",
    enoughKnownToPlan: true,
    maxQuestionsBeforePlanning: 0,
    planQualityNotes: [
      "Preserve the opening and ending exactly.",
      "Use clearer motion escalation in the middle section only.",
    ],
    tags: ["iteration", "partial-plan-edit", "visual-beats", "structure"],
  }),
  createExample({
    id: "handoff-plan-to-frames-simple-fight",
    category: "frames-handoff",
    userPrompt: "We already have the idea. Turn it into a short animation plan I can send to frames.",
    story:
      "The user already has the concept and needs a short beat-by-beat animation blueprint that Generate Frames can execute next.",
    knownFacts: [
      "The concept already exists.",
      "The user wants a short animation-ready plan.",
      "The plan should hand off directly into Generate Frames.",
    ],
    missingFacts: [],
    rankedMissingFacts: [],
    strongestGap: "",
    bestQuestion: null,
    acceptableOptions: [],
    badQuestions: ["What is the story about?", "Should I make a full narrative?", "Who is the main character?"],
    reasoning:
      "This is a handoff request, not a story-creation request. The plan should become direct visual beats with clear frame-to-frame motion.",
    shouldPlanNow: true,
    shouldAskQuestion: false,
    storyHelpMode: "none",
    enoughKnownToPlan: true,
    maxQuestionsBeforePlanning: 0,
    planQualityNotes: [
      "Write the plan as drawable motion beats instead of prose.",
      "Make every section easy to pass into Generate Frames.",
    ],
    tags: ["frames-handoff", "animation-first", "builder-style", "visual-beats"],
  }),
  createExample({
    id: "handoff-current-scene-into-frames",
    category: "frames-handoff",
    userPrompt: "Same project, same scene. Just make the plan frame-ready now.",
    story:
      "The current project and scene already exist, and the user wants the plan translated into compact visual beats for frame generation.",
    knownFacts: [
      "The same project and scene should continue.",
      "The next output should be frame-ready.",
    ],
    missingFacts: [],
    rankedMissingFacts: [],
    strongestGap: "",
    bestQuestion: null,
    acceptableOptions: [],
    badQuestions: ["What kind of story do you want?", "Should I restart the plan?", "Who is the main character?"],
    reasoning:
      "The request is explicitly about turning current context into production-ready beat steps. Restarting would be the wrong behavior.",
    shouldPlanNow: true,
    shouldAskQuestion: false,
    storyHelpMode: "none",
    enoughKnownToPlan: true,
    maxQuestionsBeforePlanning: 0,
    planQualityNotes: [
      "Preserve current continuity and convert it into frame-ready beats with clear motion order.",
    ],
    tags: ["frames-handoff", "continuation", "same-project", "animation-first", "visual-beats"],
  }),
  createExample({
    id: "iteration-messy-improve-fight-flow",
    category: "plan-refinement",
    userPrompt: "The fight idea is there. I just need it cleaner and easier to animate.",
    story:
      "The core fight already exists, and the user wants the plan simplified into clearer, more drawable beats.",
    knownFacts: [
      "The fight idea already exists.",
      "The goal is better readability and animation usability.",
    ],
    missingFacts: [],
    rankedMissingFacts: [],
    strongestGap: "",
    bestQuestion: null,
    acceptableOptions: [],
    badQuestions: ["What is the story?", "Who wins?", "Should I create a new fight?"],
    reasoning:
      "This is an iteration request focused on production clarity. The planner should reduce ambiguity and improve beat readability immediately.",
    shouldPlanNow: true,
    shouldAskQuestion: false,
    storyHelpMode: "improve",
    enoughKnownToPlan: true,
    maxQuestionsBeforePlanning: 0,
    planQualityNotes: [
      "Use clearer action order and cleaner transitions.",
      "Favor beat readability over dramatic prose.",
    ],
    tags: ["iteration", "fight", "animation-first", "frames-handoff", "visual-beats"],
  }),
  createExample({
    id: "continuation-next-beat-side-question",
    category: "continuation-narrow-question",
    userPrompt: "Continue the entrance, but make the next part stronger.",
    story:
      "The entrance is already in motion. The only useful unknown is whether the next beat should stay off-camera first or burst fully into view.",
    knownFacts: [
      "There is already an entrance sequence in progress.",
      "The user wants the next beat stronger, not a new plan.",
    ],
    missingFacts: ["Whether the stronger next beat stays partially hidden or bursts into view immediately."],
    rankedMissingFacts: ["Whether the stronger next beat stays partially hidden or bursts into view immediately."],
    strongestGap: "How the next entrance beat should reveal itself.",
    bestQuestion: "Should the next beat stay partly hidden first or burst fully into view?",
    acceptableOptions: ["Stay partly hidden", "Burst fully into view"],
    badQuestions: ["What kind of story do you want?", "Who is the character?", "What happens next?"],
    reasoning:
      "This continuation is mostly clear already. The only worthwhile question is the staging choice for the next beat.",
    shouldPlanNow: false,
    shouldAskQuestion: true,
    storyHelpMode: "improve",
    enoughKnownToPlan: false,
    maxQuestionsBeforePlanning: 1,
    planQualityNotes: [
      "Ask only about the new staging choice, then continue the same motion.",
    ],
    tags: ["continuation", "iteration", "question-needed", "visual-beats", "same-scene"],
  }),
];

const COLLABORATIVE_STORY_HELP_EXAMPLES: GeneratePlansExample[] = [
  createExample({
    id: "collab-alan-becker-fight-ideas",
    category: "collaborative-story-help",
    userPrompt:
      "hello, I wanna create a hand-drawn Alan Becker style fighting animation that has a good story, but I don't know what to create. Please come up with good ideas with me so we can create a good story together.",
    story:
      "The user wants collaborative story invention for a hand-drawn Alan Becker style fighting animation and needs strong visual story options instead of casual discussion.",
    knownFacts: [
      "The user wants a hand-drawn Alan Becker style fighting animation.",
      "They want a good story, not a random fight.",
      "They do not know what to create yet.",
    ],
    missingFacts: [],
    rankedMissingFacts: [],
    strongestGap: "",
    bestQuestion: null,
    acceptableOptions: [],
    badQuestions: ["What kind of story do you want?", "What happens next?"],
    reasoning: "The request clearly asks for collaborative ideation, so the right move is strong story options with one recommendation, not chatty brainstorming.",
    shouldPlanNow: true,
    shouldAskQuestion: false,
    storyHelpMode: "create",
    storyOptions: [
      {
        title: "Rooftop Marker Duel",
        character: "Two rival stick fighters",
        goal: "Claim a living marker that redraws the world",
        conflict: "Every attack also rewrites the arena around them",
        escalation: "The marker starts erasing safe footing and forcing riskier movement",
        turningPoint: "One fighter uses the marker to save the other instead of winning cleanly",
        resolution: "They stop fighting long enough to lock the marker away together",
        isRecommended: true,
      },
      {
        title: "Notebook Fight Trap",
        character: "A curious stick figure and a hidden attacker",
        goal: "Escape a sketchbook world before it closes",
        conflict: "Each page turn changes the fight space and rules",
        escalation: "The attacker starts using page flips as surprise attacks",
        turningPoint: "The hero realizes the sketchbook is reacting to fear and changes tactics",
        resolution: "He redraws the final page into an exit instead of a weapon",
      },
      {
        title: "Training Room Betrayal",
        character: "A practice dummy fighter and its creator",
        goal: "Survive when the training room turns hostile",
        conflict: "The dummy learns and starts countering every combo",
        escalation: "The room spawns harder obstacle beats around the duel",
        turningPoint: "The creator must destroy the system he built to stop the escalation",
        resolution: "The dummy collapses after one last respectful exchange",
      },
    ],
    storyQualityNotes: ["Recommended Story should have the clearest visual escalation and easiest beat-to-frame handoff."],
    planQualityNotes: ["Recommended option should easily convert into a short action-beat plan after selection."],
    tags: ["story-help", "collaborative-ideation", "fight", "alan-becker", "visual-beats"],
  }),
  createExample({
    id: "collab-dont-know-what-to-create-fight",
    category: "collaborative-story-help",
    userPrompt: "I don't know what to create. Give me some strong fight story ideas that are easy to animate.",
    story:
      "The user wants a few easy-to-animate fight story options with a clear recommendation, not abstract writing advice.",
    knownFacts: ["The user wants fight ideas.", "They want the result to be easy to animate."],
    missingFacts: [],
    rankedMissingFacts: [],
    strongestGap: "",
    bestQuestion: null,
    acceptableOptions: [],
    badQuestions: ["What kind of story do you want?", "Can you explain more?"],
    reasoning: "The prompt is messy but usable and clearly asks for idea generation, so the model should commit to strong animation-ready options immediately.",
    shouldPlanNow: true,
    shouldAskQuestion: false,
    storyHelpMode: "create",
    storyOptions: [
      {
        title: "Single Hallway Ambush",
        character: "One runner and one blocker",
        goal: "Break through the hallway exit",
        conflict: "The blocker keeps cutting off every lane",
        escalation: "Each exchange gets faster and closer to the locked exit",
        turningPoint: "The runner fakes the exit and reverses direction for one clean opening",
        resolution: "He reaches the door on one final push",
        isRecommended: true,
      },
      {
        title: "Staff vs Fists",
        character: "A staff fighter and a close-range brawler",
        goal: "Control the same training platform",
        conflict: "Range versus pressure creates constant spacing shifts",
        escalation: "The platform keeps shrinking, forcing tighter beats",
        turningPoint: "The staff fighter loses distance and must improvise inside range",
        resolution: "One clean disarm ends the exchange",
      },
      {
        title: "Rising Stair Fight",
        character: "Two rivals chasing the same objective",
        goal: "Reach the top first",
        conflict: "The stairs themselves become part of the attacks and recoveries",
        escalation: "Higher steps create riskier launches and drops",
        turningPoint: "A missed step turns into a sudden aerial reversal",
        resolution: "The winner reaches the top but has to pull the loser up",
      },
    ],
    tags: ["story-help", "collaborative-ideation", "fight", "easy-to-animate", "visual-beats"],
  }),
  createExample({
    id: "collab-help-me-make-good-story",
    category: "collaborative-story-help",
    userPrompt: "Help me make a good story for a fight animation. I want us to build it together.",
    story:
      "The user wants collaborative story creation for a fight animation and expects decisive options or one sharp question, not casual discussion.",
    knownFacts: ["The animation centers on a fight.", "The user wants collaborative creation."],
    missingFacts: [],
    rankedMissingFacts: [],
    strongestGap: "",
    bestQuestion: null,
    acceptableOptions: [],
    badQuestions: ["What kind of story do you want?", "What happens next?"],
    reasoning: "This request is broad but still specific enough for option generation because the fight format already constrains the plan.",
    shouldPlanNow: true,
    shouldAskQuestion: false,
    storyHelpMode: "create",
    storyOptions: [
      {
        title: "Misread Challenge",
        character: "Two stick figures who think the other started it",
        goal: "Win the challenge without backing down",
        conflict: "Each mistake escalates the misunderstanding",
        escalation: "Moves get bigger as both double down on the wrong read",
        turningPoint: "A shared outside threat interrupts the duel",
        resolution: "They redirect the fight energy into a joint finish",
        isRecommended: true,
      },
      {
        title: "Object Protection Fight",
        character: "A protector and a thief",
        goal: "Keep or steal a glowing object",
        conflict: "Every attack is shaped by staying near the object",
        escalation: "The object starts reacting and changing the fight space",
        turningPoint: "The thief realizes the object is dangerous to touch directly",
        resolution: "The object breaks and ends the fight on a new emotional note",
      },
      {
        title: "Training Gone Wrong",
        character: "A student and a teacher",
        goal: "Finish the test",
        conflict: "The lesson keeps escalating beyond what the student expected",
        escalation: "Each round adds a new movement rule or hazard",
        turningPoint: "The student stops copying and creates a new move",
        resolution: "The teacher ends the test after the student proves the point",
      },
    ],
    tags: ["story-help", "collaborative-ideation", "fight", "builder-style", "visual-beats"],
  }),
];

const normalizeTrainingText = (value: string) =>
  value
    .toLowerCase()
    .replace(/[“”]/g, '"')
    .replace(/[’]/g, "'")
    .replace(/[\u2013\u2014]/g, " ")
    .replace(/[^\w\s'/-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const getTextTokens = (value: string) =>
  normalizeTrainingText(value)
    .split(/\s+/)
    .filter((token) => token.length > 2);

const STORY_HELP_CREATE_PATTERN =
  /\b(help me make|make a story|create a story|give me a story|i do not know what should happen|i have no story|make something cool|do something cool|idk just do|just give me something|just make something)\b/i;
const COLLABORATIVE_STORY_HELP_PATTERN =
  /\b(come up with (?:good )?ideas(?: with me)?|help me make a good story|build it together|good story together|i don't know what to create|story ideas|alan becker style fighting animation)\b/i;
const STORY_HELP_IMPROVE_PATTERN =
  /\b(improve this idea|improve my story|make this better|fix this story|make it cooler|continue this but better|make it punchier|clean it up|make it easier to animate|tighten (?:it|this)|refine (?:it|this))\b/i;
const IMPROVE_MODE_PATTERN =
  /\b(make (?:it|this|the [\w\s'-]{0,30}) better|improve (?:this|it)|fix (?:this|it)|make this explosion better|make this punch better|improve this punch|make it less boring|not boring)\b/i;
const CONTINUATION_PATTERN =
  /\b(add onto|add on to|add to the current|continue(?: this| the current| the same)?(?: story| scene| animation| plan)?|keep going|build on this|keep the (?:current|same) (?:story|scene|animation|plan)|same (?:project|story|scene|animation|plan)|saved project|existing project|current story|current scene|current animation|current plan|we already have|the story is already there|after that(?: part)?|then (?:he|she|they)\b|next (?:he|she|they)\b|now make (?:him|her|them|it)\b|add a moment|add a reveal|add another beat|add one more|next beat|extend this moment)\b/i;
const FRESH_START_PATTERN =
  /\b(start over|restart|brand[- ]new|from scratch|make a new one|new story|new project|replace the current)\b/i;
const STRUCTURE_PATTERN =
  /\b(structure|story arc|hero journey|clear goal|conflict|escalation|turning point|resolution|climax|character arc|payoff)\b/i;
const PLAN_UPGRADE_PATTERN =
  /\b(plan quality|better plan|plan now|stronger ending|stronger middle|better climax|better resolution|cooler|punchier|cleaner|easier to animate|frame[- ]ready|animation[- ]ready|engine[- ]ready|execution[- ]ready|command[- ]ready|tighten the flow)\b/i;
const SIMPLE_REQUEST_PATTERN =
  /\b(simple|short|quick|clean|basic|minimal)\b|\bwalk cycle\b|\bsimple funny animation\b|\bsimple fight\b/i;
const EXPLORATORY_OPTIONS_PATTERN =
  /\b(give me ideas|some ideas|a few ideas|ideas for|brainstorm|options|different ideas)\b/i;
const MESSY_INPUT_PATTERN =
  /\b(make something cool|do something cool|idk|idk what to do|just do a fight|just make something|whatever works|surprise me|something fast and punchy|uhh|not boring|this part sucks)\b/i;
const MESSY_FEEDBACK_PATTERN =
  /\b(uhh|uh|idk|i don't know|not boring|this part sucks|kinda|sorta|whatever)\b/i;
const SINGLE_QUESTION_ONLY_PATTERN =
  /^(idk|i don't know|idk what to do|what should i do|this part sucks)\b/i;
const FRAMES_HANDOFF_PATTERN =
  /\b(turn this into (?:a )?plan|turn this into frames|frame[- ]ready|animation[- ]ready|engine[- ]ready|execution[- ]ready|command[- ]ready|generate the animation|make the plan frame[- ]ready|send to frames|use the plan we already made)\b/i;

const getPromptSignals = (value: string) => {
  const normalized = normalizeTrainingText(value);
  const tokenCount = getTextTokens(value).length;
  const simpleByLength =
    tokenCount > 0 &&
    tokenCount <= 6 &&
    !EXPLORATORY_OPTIONS_PATTERN.test(normalized) &&
    !COLLABORATIVE_STORY_HELP_PATTERN.test(normalized) &&
    !STRUCTURE_PATTERN.test(normalized) &&
    !/\b(and|then|after|before|while)\b/.test(normalized);
  return {
    tokens: new Set(getTextTokens(value)),
    normalized,
    wantsStoryCreation: STORY_HELP_CREATE_PATTERN.test(normalized),
    wantsCollaborativeStoryHelp: COLLABORATIVE_STORY_HELP_PATTERN.test(normalized),
    wantsStoryImprovement:
      STORY_HELP_IMPROVE_PATTERN.test(normalized) || IMPROVE_MODE_PATTERN.test(normalized),
    wantsContinuation: CONTINUATION_PATTERN.test(normalized),
    wantsFreshStart: FRESH_START_PATTERN.test(normalized),
    wantsMessyDefault: MESSY_INPUT_PATTERN.test(normalized),
    wantsMessyFeedback: MESSY_FEEDBACK_PATTERN.test(normalized),
    wantsFramesHandoff: FRAMES_HANDOFF_PATTERN.test(normalized),
    wantsSimpleScale: SIMPLE_REQUEST_PATTERN.test(normalized) || simpleByLength,
    wantsExploratoryOptions:
      EXPLORATORY_OPTIONS_PATTERN.test(normalized) || COLLABORATIVE_STORY_HELP_PATTERN.test(normalized),
    wantsSingleQuestion: SINGLE_QUESTION_ONLY_PATTERN.test(normalized),
  };
};

const scoreExample = ({
  example,
  userMessage,
  analysisInput,
}: {
  example: GeneratePlansExample;
  userMessage: string;
  analysisInput: string;
}) => {
  const userSignals = getPromptSignals(`${userMessage}\n${analysisInput}`);
  const exampleText = [
    example.category,
    example.userPrompt,
    example.strongestGap,
    example.bestQuestion ?? "",
    ...example.tags,
    ...example.knownFacts,
    ...example.missingFacts,
    ...(example.storyQualityNotes ?? []),
    ...(example.planQualityNotes ?? []),
    ...Object.entries(example.storyStructure ?? {}).map(([key, value]) => `${key}:${value ? "yes" : "no"}`),
    ...(example.storyOptions ?? []).flatMap((option) => [
      option.title,
      option.character,
      option.goal,
      option.conflict,
      option.escalation,
      option.turningPoint,
      option.resolution,
      option.isRecommended ? "recommended direction" : "",
    ]),
  ].join(" ");
  const exampleTokens = new Set(getTextTokens(exampleText));

  let score = 0;

  for (const token of userSignals.tokens) {
    if (exampleTokens.has(token)) {
      score += 2;
    }
  }

  if (userSignals.wantsStoryCreation && example.storyHelpMode === "create") {
    score += 14;
  }

  if (userSignals.wantsCollaborativeStoryHelp && (example.tags.includes("collaborative-ideation") || example.storyHelpMode === "create")) {
    score += 14;
  }

  if (userSignals.wantsStoryImprovement && example.storyHelpMode === "improve") {
    score += 14;
  }

  if (userSignals.wantsStoryImprovement && example.tags.includes("preserve-identity")) {
    score += 18;
  }

  if (userSignals.wantsMessyDefault && example.tags.includes("messy-input")) {
    score += 14;
  }

  if (userSignals.wantsMessyFeedback && example.tags.includes("messy-input")) {
    score += 14;
  }

  if (userSignals.wantsFramesHandoff && example.tags.includes("frames-handoff")) {
    score += 14;
  }

  if (userSignals.wantsSimpleScale && example.tags.includes("simple-request")) {
    score += 16;
  }

  if (userSignals.wantsSimpleScale && example.tags.includes("single-plan")) {
    score += 12;
  }

  if (userSignals.wantsExploratoryOptions && example.tags.includes("exploratory-request")) {
    score += 16;
  }

  if (userSignals.wantsExploratoryOptions && example.tags.includes("options-when-useful")) {
    score += 12;
  }

  if (userSignals.wantsSingleQuestion && example.shouldAskQuestion && example.tags.includes("one-question-only")) {
    score += 18;
  }

  if (userSignals.wantsStoryImprovement && example.tags.includes("quality-contrast")) {
    score += 10;
  }

  if (!userSignals.wantsStoryCreation && !userSignals.wantsStoryImprovement && example.storyHelpMode === "none") {
    score += 2;
  }

  if (userSignals.wantsFreshStart && example.tags.includes("continuation")) {
    score -= 10;
  }

  if (userSignals.wantsContinuation && example.tags.includes("continuation")) {
    score += 16;
  }

  if (/\bnotebook|sketchbook|drawing\b/.test(userSignals.normalized) && example.tags.includes("notebook")) {
    score += 8;
  }

  if (/\bproject|machine|build\b/.test(userSignals.normalized) && example.tags.includes("project")) {
    score += 8;
  }

  if (/\benvelope|letter\b/.test(userSignals.normalized) && example.tags.includes("envelope")) {
    score += 8;
  }

  if (/\bwhistle|outside responds?|radio\b/.test(userSignals.normalized) && example.tags.includes("outside-response")) {
    score += 10;
  }

  if (/\bwho\b.*\bwatch|someone is watching|watcher\b/.test(userSignals.normalized) && example.category === "watcher-identity") {
    score += 8;
  }

  if (/\bdoor\b/.test(userSignals.normalized) && example.category === "door-opener") {
    score += 8;
  }

  if (/\bfight|fighters?|duel|battle\b/.test(userSignals.normalized) && example.tags.includes("fight")) {
    score += 8;
  }

  if (
    /\bmisunderstood enemy\b|\benemy\b.*\bprotect|protecting\b.*\benemy\b|\bwas trying to protect\b/.test(
      userSignals.normalized,
    ) &&
    example.tags.includes("misunderstood-enemy")
  ) {
    score += 18;
  }

  if (
    /\baction\b.*\bemotion\b|\bemotion\b.*\baction\b|\bmotion tells the story\b|\brelationship\b.*\baction\b/.test(
      userSignals.normalized,
    ) &&
    example.tags.includes("action-emotion")
  ) {
    score += 16;
  }

  if (
    /\bgravity\b|\bphysics\b|\benvironment\b.*\bmechanic\b|\bvisual mechanic\b|\broom rules\b|\bchalk\b/.test(
      userSignals.normalized,
    ) &&
    (example.tags.includes("visual-mechanic") || example.tags.includes("physics") || example.tags.includes("environment"))
  ) {
    score += 18;
  }

  if (
    /\bfinal image\b|\bending image\b|\blast frame\b|\bstrong ending\b|\bstrong final frame\b/.test(
      userSignals.normalized,
    ) &&
    (example.tags.includes("strong-ending-image") || example.tags.includes("final-image"))
  ) {
    score += 18;
  }

  if (
    /\bhindsight\b|\bobvious in hindsight\b|\brecontext|all along\b|\bearlier clues\b.*\bclick\b/.test(
      userSignals.normalized,
    ) &&
    (example.tags.includes("hindsight-reveal") || example.tags.includes("recontextualize"))
  ) {
    score += 16;
  }

  if (userSignals.wantsContinuation && /\b(add|after|continue|next beat|one more)\b/.test(userSignals.normalized) && example.tags.includes("action-add-on")) {
    score += 8;
  }

  if (STRUCTURE_PATTERN.test(userSignals.normalized) && example.tags.includes("structure")) {
    score += 10;
  }

  if (PLAN_UPGRADE_PATTERN.test(userSignals.normalized) && example.tags.includes("plan-quality-upgrade")) {
    score += 10;
  }

  if (PLAN_UPGRADE_PATTERN.test(userSignals.normalized) && example.tags.includes("iteration")) {
    score += 8;
  }

  if (/\bframe[- ]ready|animation[- ]ready|drawable|beats?\b/.test(userSignals.normalized) && example.tags.includes("visual-beats")) {
    score += 8;
  }

  if (/\bcomplete|already clear|already has an ending|already know the ending\b/.test(userSignals.normalized) && example.shouldPlanNow) {
    score += 5;
  }

  if (example.shouldPlanNow && /\bbeginning\b.*\bmiddle\b.*\bending\b/.test(userSignals.normalized)) {
    score += 6;
  }

  if (userSignals.wantsSimpleScale && (example.storyOptions?.length ?? 0) > 0) {
    score -= 10;
  }

  if (userSignals.wantsStoryImprovement && example.storyHelpMode === "create") {
    score -= 10;
  }

  if (userSignals.wantsSingleQuestion && example.shouldPlanNow) {
    score -= 10;
  }

  if (userSignals.wantsSimpleScale && example.tags.includes("cinematic")) {
    score -= 8;
  }

  return score;
};

const CURATED_V2_GOOD_EXAMPLES: GeneratePlansExample[] = [
  createAskExample({
    id: "good-ask-strange-key-goal",
    category: "hero-journey-build",
    userPrompt: "A kid finds a strange key.",
    story:
      "A kid discovers a strange key, but the story is still missing the destination that turns the key into a real quest instead of a random curiosity.",
    knownFacts: ["A kid finds a strange key.", "The key is the story hook."],
    missingFacts: ["What the key unlocks.", "Why unlocking it matters now."],
    rankedMissingFacts: ["What the key unlocks.", "Why unlocking it matters now."],
    strongestGap: "What the key unlocks.",
    bestQuestion: "What important place or object does the key unlock?",
    acceptableOptions: ["A sealed art room", "A hidden locker tunnel", "A music box vault", "A storm shelter under the school"],
    badQuestions: ["What happens next?", "Where is he?"],
    reasoning:
      "Ask one precise question first because humans expect the key to lead somewhere important, and locking the destination creates a stronger discovery-to-payoff arc than inventing random clue beats around the key.",
    storyHelpMode: "create",
    storyQualityNotes: buildStoryQualityNotes({
      expects: "The key should redirect the story toward a place, secret, or relationship that matters.",
      satisfying: "The unlock pays off the mystery and changes the character's choices.",
      wrong: "The key triggers unrelated scenes that never connect back to what it opens.",
      incomplete: "The story never reveals why the key mattered.",
    }),
    planQualityNotes: buildPlanQualityNotes({
      visual: "The key can anchor a clean chain of discovery, pursuit, unlock, reveal, and consequence beats.",
      best: "Asking for the destination creates the clearest possible goal before planning the obstacle chain.",
      weaker: "A weaker version would guess random events first and only later try to justify the key.",
    }),
    storyStructure: {
      hasClearGoal: false,
      hasConflict: false,
      hasEscalation: false,
      hasTurningPoint: false,
      hasResolution: false,
      characterChange: false,
    },
    tags: withV2GoodTags("create-story", "one-question-only", "structure", "hero-journey", "key"),
  }),
  createAskExample({
    id: "good-ask-notebook-reveal",
    category: "notebook-reveal",
    userPrompt:
      "A black stick figure is sitting in a quiet library, flipping through an old, worn notebook he just found on a high shelf. One page is clean and detailed. He turns the page and freezes.",
    story:
      "A quiet library mystery already has mood and a reveal setup, but the next-page content is still the missing lock that decides tone, stakes, and payoff.",
    knownFacts: ["The story is in a quiet library.", "A notebook has one unusually clean drawing.", "He freezes after turning the page."],
    missingFacts: ["What is on the next page.", "Why the page changes the story so much."],
    rankedMissingFacts: ["What is on the next page.", "Why the page matters."],
    strongestGap: "What is on the next page.",
    bestQuestion: "What does he see on the next page?",
    acceptableOptions: ["A self-portrait", "A warning", "A map", "A drawing of someone who should not know him"],
    badQuestions: ["What happens next?", "What does he find?"],
    reasoning:
      "Ask for the reveal content because humans expect the page turn to matter, and that specific answer creates a stronger mystery payoff than drifting into a generic continuation.",
    storyHelpMode: "none",
    storyQualityNotes: buildStoryQualityNotes({
      expects: "The page turn should reveal something specific enough to reframe the whole scene.",
      satisfying: "The reveal creates a strong new question and a clear emotional reaction.",
      wrong: "The page contains something vague that does not change the direction of the story.",
      incomplete: "The freeze reaction happens before the audience understands what caused it.",
    }),
    planQualityNotes: buildPlanQualityNotes({
      visual: "The page turn gives a clean animation beat with anticipation, reveal, reaction, and aftermath.",
      best: "Choosing the page content first lets the later plan build toward a single high-value payoff.",
      weaker: "A weaker version would keep the reveal abstract and flatten the suspense.",
    }),
    storyStructure: {
      hasClearGoal: true,
      hasConflict: true,
      hasEscalation: true,
      hasTurningPoint: false,
      hasResolution: false,
      characterChange: false,
    },
    tags: withV2GoodTags("library", "notebook", "one-question-only", "question-specificity", "mystery"),
  }),
  createAskExample({
    id: "good-ask-whistle-responder",
    category: "outside-response",
    userPrompt: "A kid blows a whistle. Something outside responds.",
    story:
      "The trigger action is strong, but the responder is still unknown, so the story cannot decide whether it is suspenseful, funny, magical, or dangerous.",
    knownFacts: ["A kid blows a whistle.", "Something responds from outside."],
    missingFacts: ["What responds outside.", "What kind of encounter follows."],
    rankedMissingFacts: ["What responds outside.", "What tone the response creates."],
    strongestGap: "What responds outside.",
    bestQuestion: "What responds outside?",
    acceptableOptions: ["Another whistle", "A hidden machine", "An animal", "A person answering the exact rhythm"],
    badQuestions: ["What happens next?", "Where is he?"],
    reasoning:
      "Ask for the responder because humans expect the answer to lead to a reveal or encounter, and that choice creates a stronger plan than treating the sound as empty atmosphere.",
    storyHelpMode: "none",
    storyQualityNotes: buildStoryQualityNotes({
      expects: "The outside answer should turn the simple whistle into a story direction.",
      satisfying: "The response changes the kid's behavior and escalates curiosity or danger.",
      wrong: "The response is only a noise with no visible consequence.",
      incomplete: "The audience hears the answer but never learns what it means.",
    }),
    planQualityNotes: buildPlanQualityNotes({
      visual: "A call-and-response rhythm creates a crisp sound cue, reaction beat, reveal beat, and movement beat.",
      best: "Locking the responder first makes the next visual escalation readable and intentional.",
      weaker: "A weaker version would guess a mood without defining what the character is reacting to.",
    }),
    storyStructure: {
      hasClearGoal: false,
      hasConflict: true,
      hasEscalation: false,
      hasTurningPoint: false,
      hasResolution: false,
      characterChange: false,
    },
    tags: withV2GoodTags("outside-response", "one-question-only", "reveal", "question-specificity"),
  }),
  createAskExample({
    id: "good-ask-hidden-door-turn",
    category: "missing-climax",
    userPrompt: "A student finds a hidden library door and opens it, but the ending does not really hit.",
    story:
      "The mystery setup works, but opening the door is only the threshold. The real turning point is still missing behind it.",
    knownFacts: ["A student finds a hidden library door.", "The door already opens.", "The current ending feels weak."],
    missingFacts: ["What major reveal or choice happens when the door opens."],
    rankedMissingFacts: ["What major reveal or choice happens when the door opens."],
    strongestGap: "What major reveal or choice happens when the door opens.",
    bestQuestion: "What major reveal or choice happens when the hidden door opens?",
    acceptableOptions: ["He finds proof about his family", "He must save someone inside", "He learns the door was waiting for him", "He has to choose what to take and what to leave"],
    badQuestions: ["What happens next?", "Who opened the door?"],
    reasoning:
      "Ask for the reveal or choice behind the door because humans expect the threshold to lead to a real climax, and that is stronger than pretending the opening itself is already the payoff.",
    storyHelpMode: "improve",
    storyQualityNotes: buildStoryQualityNotes({
      expects: "The door should lead to a major change in knowledge, stakes, or choice.",
      satisfying: "The reveal behind the door forces a decision that defines the ending.",
      wrong: "The story treats the door opening like the final payoff and then stops.",
      incomplete: "The mystery hook never resolves into a true climax.",
    }),
    planQualityNotes: buildPlanQualityNotes({
      visual: "The door works best as a threshold beat that launches a more powerful reveal and reaction sequence.",
      best: "Asking for the change-point creates a stronger ending repair than adding random extra scenes after the door opens.",
      weaker: "A weaker version would add motion after the door without giving the scene a real turning point.",
    }),
    storyStructure: {
      hasClearGoal: true,
      hasConflict: true,
      hasEscalation: true,
      hasTurningPoint: false,
      hasResolution: false,
      characterChange: false,
    },
    tags: withV2GoodTags("library", "mystery", "structure", "improve", "one-question-only", "ending-repair"),
  }),
  createAskExample({
    id: "good-ask-rooftop-decision",
    category: "no-resolution",
    userPrompt:
      "Two stick figures sit on a roof after a fight. One finally admits he lied earlier, the other goes quiet, and the scene feels emotional, but the ending is not landing yet.",
    story:
      "The apology creates emotional pressure, but the scene still needs a decision that changes the relationship instead of ending on mood alone.",
    knownFacts: ["Two characters are on a roof after conflict.", "One admits a lie.", "The scene already has emotional pressure."],
    missingFacts: ["What decision they make on the roof."],
    rankedMissingFacts: ["What decision they make on the roof."],
    strongestGap: "What decision they make on the roof.",
    bestQuestion: "What decision do they make there?",
    acceptableOptions: ["Start over", "Part ways for now", "Tell the truth to someone else together", "Return something that caused the lie"],
    badQuestions: ["What happens next?", "Who are they?"],
    reasoning:
      "Ask for the decision because humans expect the confession to change the relationship, and a clear choice creates a stronger ending beat than letting the scene fade out on silence alone.",
    storyHelpMode: "improve",
    storyQualityNotes: buildStoryQualityNotes({
      expects: "The apology should lead to a changed relationship, not just a sad pause.",
      satisfying: "The final choice resolves the emotional question the scene opened.",
      wrong: "The scene feels heavy but never actually moves the relationship anywhere.",
      incomplete: "The confession lands, but the emotional payoff never arrives.",
    }),
    planQualityNotes: buildPlanQualityNotes({
      visual: "The roof scene benefits from stillness, reaction, and one decisive final gesture or line of movement.",
      best: "A single ending choice keeps the scene clean and emotionally readable.",
      weaker: "A weaker version would add more dialogue but still avoid a real payoff.",
    }),
    storyStructure: {
      hasClearGoal: true,
      hasConflict: true,
      hasEscalation: true,
      hasTurningPoint: false,
      hasResolution: false,
      characterChange: false,
    },
    tags: withV2GoodTags("emotional", "improve", "one-question-only", "ending-repair", "roof"),
  }),
  createAskExample({
    id: "good-ask-robot-failure",
    category: "weak-conflict",
    userPrompt: "A student builds a tiny robot for class and shows it off, but the story feels flat.",
    story:
      "The robot exists, but the story has no real pressure yet. It still needs the failure that makes the final fix feel earned.",
    knownFacts: ["A student builds a robot.", "The robot is shown off in class.", "The current story feels flat."],
    missingFacts: ["What goes wrong with the robot when it matters most."],
    rankedMissingFacts: ["What goes wrong with the robot when it matters most."],
    strongestGap: "What goes wrong with the robot when it matters most.",
    bestQuestion: "What goes wrong with the robot when he needs it most?",
    acceptableOptions: ["It drops the object it must grab", "Its magnet pulls the wrong thing", "It freezes in front of the class", "It causes a bigger classroom problem"],
    badQuestions: ["How do you want it to end?", "What happens next?"],
    reasoning:
      "Ask for the high-pressure failure because humans expect repeated struggle before success, and that choice creates a stronger middle and climax than generic advice like 'make it more exciting.'",
    storyHelpMode: "improve",
    storyQualityNotes: buildStoryQualityNotes({
      expects: "The robot should fail in a way that creates tension and pays off the fix later.",
      satisfying: "The final success solves the same problem the robot created or failed to solve.",
      wrong: "The robot works too easily or fails in a way unrelated to the ending.",
      incomplete: "The build-up exists, but no real test justifies the payoff.",
    }),
    planQualityNotes: buildPlanQualityNotes({
      visual: "A public failure gives the robot story a crisp test beat, setback beat, fix beat, and payoff beat.",
      best: "Locking the failure first creates the strongest cause-and-effect path into the solution.",
      weaker: "A weaker version would add random motion beats without pressure.",
    }),
    storyStructure: {
      hasClearGoal: true,
      hasConflict: false,
      hasEscalation: false,
      hasTurningPoint: false,
      hasResolution: false,
      characterChange: false,
    },
    tags: withV2GoodTags("improve", "structure", "robot", "project", "one-question-only", "invention"),
  }),
  createAskExample({
    id: "good-ask-marker-conflict",
    category: "story-improvement",
    userPrompt: "Improve this idea: a kid finds a weird marker in class.",
    story:
      "The hook is strong, but the marker still needs a conflict engine so it can shape the middle and the ending instead of being just a cool object.",
    knownFacts: ["A kid finds a weird marker.", "The setting is class.", "The user wants the idea improved, not replaced."],
    missingFacts: ["What problem the marker causes."],
    rankedMissingFacts: ["What problem the marker causes."],
    strongestGap: "What problem the marker causes.",
    bestQuestion: "What problem should the marker cause?",
    acceptableOptions: ["Animated drawings", "Accidental classroom chaos", "Exposed secrets", "A race against time"],
    badQuestions: ["What kind of story do you want?", "What happens next?"],
    reasoning:
      "Ask for the marker's conflict engine because humans expect the object to drive the story, and that is stronger than replacing the premise or giving vague improvement notes.",
    storyHelpMode: "improve",
    storyQualityNotes: buildStoryQualityNotes({
      expects: "The strange marker should create visible trouble, truth, or urgency.",
      satisfying: "The ending resolves the exact problem the marker introduced.",
      wrong: "The marker stays decorative while unrelated scenes create the plot.",
      incomplete: "The idea has a hook but no engine for escalation.",
    }),
    planQualityNotes: buildPlanQualityNotes({
      visual: "A magical or dangerous marker can create clear before-and-after beats inside a classroom.",
      best: "Choosing the problem first guarantees that each later beat grows from the same object.",
      weaker: "A weaker version would pile extra events on top of the marker without connecting them.",
    }),
    storyStructure: {
      hasClearGoal: true,
      hasConflict: false,
      hasEscalation: false,
      hasTurningPoint: false,
      hasResolution: false,
      characterChange: false,
    },
    tags: withV2GoodTags("improve", "marker", "classroom", "one-question-only", "quality-contrast"),
  }),
  createAskExample({
    id: "good-ask-kite-stakes",
    category: "chase-stakes",
    userPrompt: "A kid chases a kite through the neighborhood.",
    story:
      "The movement is clear, but the chase still needs emotional stakes so the ending feels like more than random running.",
    knownFacts: ["A kid is chasing a kite.", "The setting is a neighborhood chase."],
    missingFacts: ["Why the kite matters to him.", "What emotional payoff the catch should resolve."],
    rankedMissingFacts: ["Why the kite matters to him.", "What payoff the ending should resolve."],
    strongestGap: "Why the kite matters to him.",
    bestQuestion: "Why is the kite important to him?",
    acceptableOptions: ["It belonged to someone he misses", "It carries a message", "It is for a contest he cannot lose", "He promised to return it"],
    badQuestions: ["What happens next?", "How fast is he running?"],
    reasoning:
      "Ask why the kite matters because humans expect a chase to earn its ending, and emotional stakes create a stronger payoff than treating the sequence as movement with no deeper consequence.",
    storyHelpMode: "create",
    storyQualityNotes: buildStoryQualityNotes({
      expects: "The chase should build toward a catch, loss, or discovery that matters.",
      satisfying: "The ending resolves both the physical chase and the reason he cared so much.",
      wrong: "The kid runs through obstacles but the kite means nothing.",
      incomplete: "The chase has energy but no emotional payoff.",
    }),
    planQualityNotes: buildPlanQualityNotes({
      visual: "A neighborhood chase can escalate through fences, corners, wind shifts, and one reveal stop.",
      best: "Defining the stake first keeps every obstacle tied to the final payoff.",
      weaker: "A weaker version would stack random chase beats and hope the ending feels meaningful later.",
    }),
    storyStructure: {
      hasClearGoal: false,
      hasConflict: true,
      hasEscalation: false,
      hasTurningPoint: false,
      hasResolution: false,
      characterChange: false,
    },
    tags: withV2GoodTags("create-story", "chase", "one-question-only", "structure", "emotional"),
  }),
  createAskExample({
    id: "good-ask-envelope-choice",
    category: "choice",
    userPrompt:
      "She opens an envelope at a train station bench, reads one line, and looks up at the departure board like she has to decide right now.",
    story:
      "The setup already creates urgency, but the ending still depends on the exact choice the envelope forces her to make.",
    knownFacts: ["She opens an envelope at a train station.", "The departure board creates immediate time pressure."],
    missingFacts: ["What choice she makes."],
    rankedMissingFacts: ["What choice she makes."],
    strongestGap: "What choice she makes.",
    bestQuestion: "What choice does she make?",
    acceptableOptions: ["Board the train", "Stay and meet someone", "Tear up the ticket", "Leave the envelope behind and run"],
    badQuestions: ["What happens next?", "Who wrote the envelope?"],
    reasoning:
      "Ask for the choice because humans expect the letter to force a concrete decision, and that answer shapes a stronger emotional ending than a moody station scene with no payoff.",
    storyHelpMode: "none",
    storyQualityNotes: buildStoryQualityNotes({
      expects: "The letter should force a visible decision under time pressure.",
      satisfying: "The final choice resolves what the audience is already waiting for at the departure board.",
      wrong: "The scene stays atmospheric and avoids a real decision.",
      incomplete: "The timer is present, but the payoff never arrives.",
    }),
    planQualityNotes: buildPlanQualityNotes({
      visual: "The board, ticket, envelope, and arriving train create a clean sequence of reaction and choice beats.",
      best: "The choice is the strongest question because it directly controls the ending image.",
      weaker: "A weaker version would overfocus on backstory while delaying the one decision that matters.",
    }),
    storyStructure: {
      hasClearGoal: true,
      hasConflict: true,
      hasEscalation: true,
      hasTurningPoint: false,
      hasResolution: false,
      characterChange: false,
    },
    tags: withV2GoodTags("envelope", "choice", "emotional", "one-question-only"),
  }),
  createAskExample({
    id: "good-ask-continuation-function",
    category: "continuation-narrow-question",
    userPrompt: "Add something after this.",
    story:
      "The user is clearly continuing the current scene, but the next beat is still too vague to plan well without knowing whether it should escalate action, reveal information, or land emotionally.",
    knownFacts: ["This is a continuation request.", "The current story or animation already exists."],
    missingFacts: ["What job the next beat should do."],
    rankedMissingFacts: ["What job the next beat should do."],
    strongestGap: "What job the next beat should do.",
    bestQuestion: "Should the next beat be an attack, a reveal, or an emotional reaction?",
    acceptableOptions: ["Attack", "Reveal", "Emotional reaction"],
    badQuestions: ["What happens next?", "Do you want a new story?"],
    reasoning:
      "Ask one narrow continuation question because humans expect the next beat to serve a clear purpose, and this is stronger than restarting the story or adding a random action beat.",
    storyHelpMode: "none",
    storyQualityNotes: buildStoryQualityNotes({
      expects: "A continuation beat should clearly escalate action, reveal information, or change emotion.",
      satisfying: "The new beat connects directly to what just happened and pushes the sequence forward.",
      wrong: "The continuation restarts the scene or throws in disconnected motion.",
      incomplete: "The user asked for more, but the added beat has no story function.",
    }),
    planQualityNotes: buildPlanQualityNotes({
      visual: "A clear beat function makes the next motion or reaction readable instead of mushy.",
      best: "This question protects continuity while keeping the follow-up short and useful.",
      weaker: "A weaker version would guess the beat type and risk breaking the existing sequence.",
    }),
    storyStructure: {
      hasClearGoal: true,
      hasConflict: true,
      hasEscalation: false,
      hasTurningPoint: false,
      hasResolution: false,
      characterChange: false,
    },
    tags: withV2GoodTags("continuation", "one-question-only", "action-add-on", "current-animation-extension"),
  }),
  createPlanExample({
    id: "good-plan-library-archive",
    category: "plan-quality-master-library",
    userPrompt:
      "A student follows a notebook map through the library and reveals a hidden family archive before the renovation crew seals it.",
    story:
      "A complete mystery already contains the goal, deadline, clue chain, reveal threshold, and emotional consequence needed for a professional-quality plan.",
    knownFacts: [
      "A notebook map leads through the library.",
      "The archive may be sealed by renovation.",
      "The archive reveal is tied to the student's family.",
    ],
    missingFacts: [],
    rankedMissingFacts: [],
    strongestGap: "",
    bestQuestion: null,
    acceptableOptions: [],
    badQuestions: [],
    reasoning:
      "Plan now because humans already have the goal, pressure, reveal, and consequence they expect, and shaping those into escalating visual beats is stronger than stalling for extra details.",
    storyHelpMode: "none",
    storyQualityNotes: buildStoryQualityNotes({
      expects: "A clue-driven mystery should escalate toward a reveal that changes what the protagonist understands.",
      satisfying: "The archive reveal pays off both the map and the family mystery while forcing a consequence.",
      wrong: "The clues stay flat or the archive only adds trivia instead of changing the story.",
      incomplete: "The search ends at the archive, but nothing emotionally or narratively shifts afterward.",
    }),
    planQualityNotes: buildPlanQualityNotes({
      visual: "The plan can move cleanly from clue handling to hidden spaces, threshold reveal, and emotional aftermath.",
      best: "Each beat grows from the map, the time pressure, and the family connection, so the story never loses focus.",
      weaker: "A weaker alternative would treat the archive as a static reveal with no consequence or midpoint climb.",
    }),
    storyStructure: {
      hasClearGoal: true,
      hasConflict: true,
      hasEscalation: true,
      hasTurningPoint: true,
      hasResolution: true,
      characterChange: true,
    },
    tags: withV2GoodTags("library", "mystery", "plan-now", "plan-quality-master", "visual-beats"),
  }),
  createPlanExample({
    id: "good-plan-robot-counterweight",
    category: "plan-quality-master-robot",
    userPrompt:
      "A student builds a tiny robot for class, tests it, it fails twice, then he adds a counterweight and uses it to recover the teacher's lost keys from under a shelf.",
    story:
      "The robot story already has a goal, repeated setbacks, a meaningful fix, and a payoff that resolves the same problem the robot kept failing to solve.",
    knownFacts: ["A student builds a tiny robot.", "The robot fails twice.", "A counterweight fix leads to the final success."],
    missingFacts: [],
    rankedMissingFacts: [],
    strongestGap: "",
    bestQuestion: null,
    acceptableOptions: [],
    badQuestions: [],
    reasoning:
      "Plan now because humans expect struggle before success, and this story already contains the strongest version of that arc: repeated failure, a clear insight, and a useful payoff.",
    storyHelpMode: "none",
    storyQualityNotes: buildStoryQualityNotes({
      expects: "An invention story should earn success through visible testing and failure.",
      satisfying: "The final fix solves the same kind of problem the robot kept failing at earlier.",
      wrong: "The robot suddenly works without pressure or solves an unrelated ending problem.",
      incomplete: "The build exists, but the audience never sees the invention truly tested.",
    }),
    planQualityNotes: buildPlanQualityNotes({
      visual: "The robot gives strong build, wobble, fail, rethink, and success beats that read clearly in animation.",
      best: "The counterweight fix is a strong turning point because it is specific, visible, and causally tied to the earlier failures.",
      weaker: "A weaker alternative would skip one of the failures or make the final success feel too easy.",
    }),
    storyStructure: {
      hasClearGoal: true,
      hasConflict: true,
      hasEscalation: true,
      hasTurningPoint: true,
      hasResolution: true,
      characterChange: true,
    },
    tags: withV2GoodTags("project", "robot", "invention", "plan-now", "visual-beats", "complete-story"),
  }),
  createPlanExample({
    id: "good-plan-roof-reconciliation",
    category: "plan-quality-master-emotional",
    userPrompt:
      "Two stick figures sit on a roof after a fight. One admits he lied earlier, the other goes quiet, then nods, and they watch the sunrise while deciding to start over.",
    story:
      "The emotional arc is already complete enough to plan because the confession, reaction, decision, and ending image all support the same relationship payoff.",
    knownFacts: ["Two characters are on a roof after conflict.", "One confesses a lie.", "They decide to start over by sunrise."],
    missingFacts: [],
    rankedMissingFacts: [],
    strongestGap: "",
    bestQuestion: null,
    acceptableOptions: [],
    badQuestions: [],
    reasoning:
      "Plan now because humans expect the confession to change the relationship, and the story already contains the emotional turn and final image that make the scene satisfying.",
    storyHelpMode: "none",
    storyQualityNotes: buildStoryQualityNotes({
      expects: "An emotional reconciliation should move from tension to visible change, not stay in vague sadness.",
      satisfying: "The sunrise lands after the characters make a real decision together.",
      wrong: "The scene talks about emotion but never alters the relationship.",
      incomplete: "The confession happens, but the audience never gets the payoff of change.",
    }),
    planQualityNotes: buildPlanQualityNotes({
      visual: "Stillness, eye lines, a pause, and one final shared gesture make the roof scene readable and strong.",
      best: "The structure is strongest when each emotional beat is clean and restrained instead of overfilled with dialogue.",
      weaker: "A weaker alternative would add extra exposition and dilute the core emotional turn.",
    }),
    storyStructure: {
      hasClearGoal: true,
      hasConflict: true,
      hasEscalation: true,
      hasTurningPoint: true,
      hasResolution: true,
      characterChange: true,
    },
    tags: withV2GoodTags("emotional", "reunion", "plan-now", "complete-story", "visual-beats"),
  }),
  createPlanExample({
    id: "good-plan-platform-reunion",
    category: "plan-quality-master-platform",
    userPrompt:
      "At a crowded train platform, a woman reads a letter, sees the train arrive, chooses not to leave, and reunites with the person the letter was about.",
    story:
      "The platform story already contains a visible timer, a choice point, and a reunion payoff, so it is ready for a clean plan.",
    knownFacts: ["A letter is read at the train platform.", "The train arrival creates time pressure.", "She chooses reunion over departure."],
    missingFacts: [],
    rankedMissingFacts: [],
    strongestGap: "",
    bestQuestion: null,
    acceptableOptions: [],
    badQuestions: [],
    reasoning:
      "Plan now because humans expect the train timer to sharpen the choice, and the current setup already supports the strongest version of that ending: hesitation, pressure, decision, reunion.",
    storyHelpMode: "none",
    storyQualityNotes: buildStoryQualityNotes({
      expects: "A platform choice story should peak when the clock and the emotion collide.",
      satisfying: "The character acts before the train takes the choice away from her.",
      wrong: "The train arrives, but the scene avoids a decisive action.",
      incomplete: "The reunion idea exists, but the timer never actually matters.",
    }),
    planQualityNotes: buildPlanQualityNotes({
      visual: "The letter, departure board, arriving train, and final turn back give the scene strong visual anchors.",
      best: "The plan is strongest when the platform pressure keeps every beat moving toward the decision.",
      weaker: "A weaker alternative would overexplain backstory and blunt the urgency.",
    }),
    storyStructure: {
      hasClearGoal: true,
      hasConflict: true,
      hasEscalation: true,
      hasTurningPoint: true,
      hasResolution: true,
      characterChange: true,
    },
    tags: withV2GoodTags("reunion", "emotional", "plan-now", "envelope", "train-station"),
  }),
  createPlanExample({
    id: "good-plan-market-chase",
    category: "plan-quality-master-chase",
    userPrompt:
      "A runner has to deliver medicine across a crowded market before sunset, and every shortcut keeps getting blocked until he risks one last leap through a closing gate.",
    story:
      "The chase already has a destination, obstacle chain, time pressure, and risky final adaptation, which makes it ready for a strong action-first plan.",
    knownFacts: ["The runner must deliver medicine.", "The market is crowded.", "Sunset creates a deadline.", "The runner takes one final risk."],
    missingFacts: [],
    rankedMissingFacts: [],
    strongestGap: "",
    bestQuestion: null,
    acceptableOptions: [],
    badQuestions: [],
    reasoning:
      "Plan now because humans expect a chase to go somewhere and get harder, and this version already has the destination, rising obstacles, and risky turning beat that make the payoff earned.",
    storyHelpMode: "none",
    storyQualityNotes: buildStoryQualityNotes({
      expects: "A chase should escalate through changing obstacles and finish at a clear destination.",
      satisfying: "The final delivery resolves the urgency the opening promised.",
      wrong: "The runner keeps moving, but the route never meaningfully changes or pays off.",
      incomplete: "The movement is there, but the arrival does not feel earned.",
    }),
    planQualityNotes: buildPlanQualityNotes({
      visual: "The market offers sharp spatial variety: stalls, crowds, blocked paths, leaps, and the final handoff.",
      best: "Each obstacle grows logically from the last one and drives the runner toward the risky final move.",
      weaker: "A weaker alternative would repeat the same running beat without route escalation.",
    }),
    storyStructure: {
      hasClearGoal: true,
      hasConflict: true,
      hasEscalation: true,
      hasTurningPoint: true,
      hasResolution: true,
      characterChange: true,
    },
    tags: withV2GoodTags("chase", "plan-now", "visual-beats", "action", "delivery"),
  }),
  createPlanExample({
    id: "good-plan-sketchbook-escape",
    category: "plan-quality-master-escape",
    userPrompt:
      "A stick figure gets trapped inside a sketchbook world that closes page by page, then learns to redraw the exit before the last page slams shut.",
    story:
      "The escape premise already gives the story rules, pressure, discovery, and a clever ending mechanism, so it is ready for a full plan.",
    knownFacts: ["The character is trapped in a sketchbook world.", "Pages keep closing.", "Redrawing the exit becomes the solution."],
    missingFacts: [],
    rankedMissingFacts: [],
    strongestGap: "",
    bestQuestion: null,
    acceptableOptions: [],
    badQuestions: [],
    reasoning:
      "Plan now because humans expect escape stories to tighten their rules and pressure over time, and this premise already contains the clever turn that makes the final escape satisfying.",
    storyHelpMode: "none",
    storyQualityNotes: buildStoryQualityNotes({
      expects: "The world rules should become a problem and then the key to the solution.",
      satisfying: "The hero escapes by understanding and using the sketchbook logic rather than brute force.",
      wrong: "The pages close, but the ending ignores the rule system the story established.",
      incomplete: "The trap is cool, but the escape does not feel earned by the setup.",
    }),
    planQualityNotes: buildPlanQualityNotes({
      visual: "Page turns, shrinking space, erased terrain, and redrawn exits are strong animation-friendly beats.",
      best: "The redraw solution is the strongest ending because it pays off the world's rules instead of escaping around them.",
      weaker: "A weaker alternative would end with a random portal or rescue unrelated to the sketchbook idea.",
    }),
    storyStructure: {
      hasClearGoal: true,
      hasConflict: true,
      hasEscalation: true,
      hasTurningPoint: true,
      hasResolution: true,
      characterChange: true,
    },
    tags: withV2GoodTags("escape", "drawing", "notebook", "plan-now", "visual-beats"),
  }),
  createPlanExample({
    id: "good-plan-locker-comedy",
    category: "plan-quality-master-comedy",
    userPrompt:
      "An overconfident student slams his locker shut, accidentally starts a chain reaction across the hallway, and somehow saves the day right before the principal sees the mess.",
    story:
      "The comedy arc is already strong because the swagger, disaster escalation, accidental save, and embarrassed ending all serve the same payoff.",
    knownFacts: ["A student's swagger starts the problem.", "The hallway turns into a chain reaction.", "The accident saves the day before the principal arrives."],
    missingFacts: [],
    rankedMissingFacts: [],
    strongestGap: "",
    bestQuestion: null,
    acceptableOptions: [],
    badQuestions: [],
    reasoning:
      "Plan now because humans expect comedy to escalate and flip, and this premise already gives the strongest version of that pattern: setup, worse chaos, accidental save, humbled aftermath.",
    storyHelpMode: "none",
    storyQualityNotes: buildStoryQualityNotes({
      expects: "A hallway gag story should build in scale and finish with a clean reversal.",
      satisfying: "The student's mistake solves the bigger problem at the last second.",
      wrong: "The chain reaction stays random and never lands a clear payoff.",
      incomplete: "The gag grows, but the reversal that justifies it never comes.",
    }),
    planQualityNotes: buildPlanQualityNotes({
      visual: "Lockers, books, carts, slipping students, and one final accidental save create readable comedy motion.",
      best: "The plan is strongest when each mishap clearly causes the next one before the reversal hits.",
      weaker: "A weaker alternative would scatter unrelated gags that do not build together.",
    }),
    storyStructure: {
      hasClearGoal: true,
      hasConflict: true,
      hasEscalation: true,
      hasTurningPoint: true,
      hasResolution: true,
      characterChange: true,
    },
    tags: withV2GoodTags("comedy", "funny", "plan-now", "visual-beats", "school"),
  }),
  createPlanExample({
    id: "good-plan-bell-code-mystery",
    category: "plan-quality-master-school-mystery",
    userPrompt:
      "A shy student who runs the school soundboard realizes a strange bell pattern predicts sabotage before the assembly and has to decode it in time.",
    story:
      "The school mystery already has escalating clues, a public deadline, and a reveal that forces the character to step into the spotlight.",
    knownFacts: ["A shy student runs the soundboard.", "A bell code predicts sabotage.", "The assembly creates a deadline."],
    missingFacts: [],
    rankedMissingFacts: [],
    strongestGap: "",
    bestQuestion: null,
    acceptableOptions: [],
    badQuestions: [],
    reasoning:
      "Plan now because humans expect a mystery to tighten toward a public reveal, and this story already has the clearest structure for that: clue pattern, late realizations, assembly race, exposure.",
    storyHelpMode: "none",
    storyQualityNotes: buildStoryQualityNotes({
      expects: "The clues should grow more urgent and point toward one decisive reveal.",
      satisfying: "The shy student uses what he learned to stop the sabotage in public.",
      wrong: "The bell code stays clever but never changes the stakes or the character.",
      incomplete: "The clues exist, but the final reveal never pays them off strongly.",
    }),
    planQualityNotes: buildPlanQualityNotes({
      visual: "Bell flashes, rushing through halls, stage movement, and a final soundboard takeover create crisp beats.",
      best: "The plan stays strongest when each clue arrives too late until the character finally acts in time.",
      weaker: "A weaker alternative would solve the code quietly and remove the public payoff.",
    }),
    storyStructure: {
      hasClearGoal: true,
      hasConflict: true,
      hasEscalation: true,
      hasTurningPoint: true,
      hasResolution: true,
      characterChange: true,
    },
    tags: withV2GoodTags("school", "mystery", "plan-now", "visual-beats", "public-payoff"),
  }),
  createPlanExample({
    id: "good-plan-key-art-room",
    category: "plan-quality-master-key",
    userPrompt:
      "A student finds a strange key, follows it through locked school spaces, and unlocks an art room that is about to be cleared out forever.",
    story:
      "The key story already contains a goal, obstacle chain, reveal space, and emotional consequence, so it is ready for a strong quest-shaped plan.",
    knownFacts: ["A student finds a strange key.", "The key leads through locked school spaces.", "The art room is about to be cleared out forever."],
    missingFacts: [],
    rankedMissingFacts: [],
    strongestGap: "",
    bestQuestion: null,
    acceptableOptions: [],
    badQuestions: [],
    reasoning:
      "Plan now because humans expect the key to redirect the story and resolve what it unlocks, and this version already ties the object, the obstacles, and the final emotional consequence together.",
    storyHelpMode: "none",
    storyQualityNotes: buildStoryQualityNotes({
      expects: "The key should lead to a place worth the search and emotionally pay off why it mattered.",
      satisfying: "Unlocking the room changes what the student understands or chooses to save.",
      wrong: "The key opens a space with no meaningful consequence.",
      incomplete: "The quest ends at the door, but the unlocked room does not change the story.",
    }),
    planQualityNotes: buildPlanQualityNotes({
      visual: "The journey through locked hallways, stairwells, and the final room gives strong exploration staging.",
      best: "The art room makes the strongest ending because it pays off both the quest object and the character's emotional stake.",
      weaker: "A weaker alternative would turn the key into a generic mystery object with no personal payoff.",
    }),
    storyStructure: {
      hasClearGoal: true,
      hasConflict: true,
      hasEscalation: true,
      hasTurningPoint: true,
      hasResolution: true,
      characterChange: true,
    },
    tags: withV2GoodTags("key", "school", "emotional", "plan-now", "hero-journey"),
  }),
  createPlanExample({
    id: "good-plan-family-box-choice",
    category: "plan-quality-master-family-box",
    userPrompt:
      "A student finds a hidden family box in a library wall, opens it, and has to choose between exposing what it proves or protecting the person it could hurt.",
    story:
      "The reveal already points toward a moral choice, which makes the family-box story ready for a strong consequence-based plan.",
    knownFacts: ["A hidden family box is found in a library wall.", "The box proves something important.", "The reveal forces a protect-versus-expose choice."],
    missingFacts: [],
    rankedMissingFacts: [],
    strongestGap: "",
    bestQuestion: null,
    acceptableOptions: [],
    badQuestions: [],
    reasoning:
      "Plan now because humans expect the reveal to trigger a decision, not just deliver information, and this premise already gives the strongest kind of ending: truth with a cost.",
    storyHelpMode: "none",
    storyQualityNotes: buildStoryQualityNotes({
      expects: "A hidden-family reveal should change what the character must choose, not just what they know.",
      satisfying: "The ending forces the character to weigh truth against harm.",
      wrong: "The box only contains trivia and the story stops after opening it.",
      incomplete: "The reveal lands, but no consequence follows from it.",
    }),
    planQualityNotes: buildPlanQualityNotes({
      visual: "The box reveal, reaction, hesitation, and final choice give the sequence strong visual shape without overcomplication.",
      best: "The moral choice is the strongest ending because it makes the reveal matter beyond surprise.",
      weaker: "A weaker alternative would treat the hidden box as a trivia drop with no decision attached.",
    }),
    storyStructure: {
      hasClearGoal: true,
      hasConflict: true,
      hasEscalation: true,
      hasTurningPoint: true,
      hasResolution: true,
      characterChange: true,
    },
    tags: withV2GoodTags("library", "mystery", "emotional", "plan-now", "family"),
  }),
  createPlanExample({
    id: "good-plan-rivals-reunion",
    category: "plan-quality-master-rivals-reunion",
    userPrompt:
      "Two former tournament rivals meet again after the finals, and one unexpected gesture turns the reunion from tense to respectful.",
    story:
      "The reunion already has tension, history, and a relationship-changing gesture, so it is ready for a strong emotional-action aftermath plan.",
    knownFacts: ["Two former rivals meet after the finals.", "The reunion starts tense.", "One gesture changes the tone."],
    missingFacts: [],
    rankedMissingFacts: [],
    strongestGap: "",
    bestQuestion: null,
    acceptableOptions: [],
    badQuestions: [],
    reasoning:
      "Plan now because humans expect rivals to either separate or transform, and this version already has the gesture that creates the strongest possible payoff: visible change instead of empty nostalgia.",
    storyHelpMode: "none",
    storyQualityNotes: buildStoryQualityNotes({
      expects: "A rivals reunion should force the old tension to resolve or change.",
      satisfying: "The unexpected gesture proves the relationship is genuinely different now.",
      wrong: "The characters just stand together without earning the shift.",
      incomplete: "The reunion happens, but nothing inside the relationship changes.",
    }),
    planQualityNotes: buildPlanQualityNotes({
      visual: "Post-fight exhaustion, distance, one offered gesture, and a new shared exit create strong readable beats.",
      best: "The plan is strongest when the gesture does the emotional work instead of long explanation.",
      weaker: "A weaker alternative would rely on dialogue and lose the visual clarity of the reunion.",
    }),
    storyStructure: {
      hasClearGoal: true,
      hasConflict: true,
      hasEscalation: true,
      hasTurningPoint: true,
      hasResolution: true,
      characterChange: true,
    },
    tags: withV2GoodTags("reunion", "emotional", "fight", "plan-now", "visual-beats"),
  }),
  createPlanExample({
    id: "good-plan-bridge-model-team",
    category: "plan-quality-master-team",
    userPrompt:
      "A student team keeps rebuilding a bridge model before a storm demo, it collapses twice, and they finally save the presentation by combining their different ideas.",
    story:
      "The team story already has repeated setbacks, mounting time pressure, and a shared insight that turns failure into earned success.",
    knownFacts: ["A team is rebuilding a bridge model.", "The model collapses twice.", "The final success comes from combining different ideas."],
    missingFacts: [],
    rankedMissingFacts: [],
    strongestGap: "",
    bestQuestion: null,
    acceptableOptions: [],
    badQuestions: [],
    reasoning:
      "Plan now because humans expect repeated failure to either break the team or sharpen it, and this version already sets up the stronger outcome: teamwork that directly solves the problem.",
    storyHelpMode: "none",
    storyQualityNotes: buildStoryQualityNotes({
      expects: "A team-repair story should turn setbacks into better collaboration and a meaningful success.",
      satisfying: "The final build works because the team learned from the earlier collapses.",
      wrong: "The bridge suddenly works or the teamwork never matters to the solution.",
      incomplete: "The failures happen, but the final insight does not clearly grow from them.",
    }),
    planQualityNotes: buildPlanQualityNotes({
      visual: "Each collapse, scramble, redesign, and final stable test gives the story clear physical beats.",
      best: "The combined-ideas ending is strongest because it pays off both the failures and the character dynamics.",
      weaker: "A weaker alternative would let one person solve everything and flatten the team arc.",
    }),
    storyStructure: {
      hasClearGoal: true,
      hasConflict: true,
      hasEscalation: true,
      hasTurningPoint: true,
      hasResolution: true,
      characterChange: true,
    },
    tags: withV2GoodTags("teamwork", "invention", "plan-now", "failure-success", "visual-beats"),
  }),
  createPlanExample({
    id: "good-improve-punch-preserve",
    category: "preserve-identity-punch",
    userPrompt: "Keep the same punch here, but make it hit harder and feel more satisfying.",
    story:
      "The action identity is already correct. What matters now is making the exact same beat read more clearly and pay off more strongly.",
    knownFacts: ["The core move must stay the same.", "The user wants a stronger punch, not a new combo."],
    missingFacts: [],
    rankedMissingFacts: [],
    strongestGap: "",
    bestQuestion: null,
    acceptableOptions: [],
    badQuestions: [],
    reasoning:
      "Plan now because humans expect the same move to read more cleanly, and the strongest improvement is better timing, anticipation, impact, and recovery rather than replacing the action.",
    storyHelpMode: "improve",
    storyQualityNotes: buildStoryQualityNotes({
      expects: "An improved punch should feel clearer, heavier, and more earned without changing what the move is.",
      satisfying: "The hit has readable anticipation, contact, and follow-through.",
      wrong: "The improvement swaps in a different attack or overcomplicates the beat.",
      incomplete: "The punch is technically stronger but still lacks a payoff accent.",
    }),
    planQualityNotes: buildPlanQualityNotes({
      visual: "Anticipation, line of action, impact pose, and recovery are all strong frame-to-frame beats.",
      best: "Keeping the same punch preserves identity while improving animation readability and audience payoff.",
      weaker: "A weaker alternative would replace the punch with a longer combo and ignore the user's request.",
    }),
    storyStructure: {
      hasClearGoal: true,
      hasConflict: true,
      hasEscalation: true,
      hasTurningPoint: true,
      hasResolution: true,
      characterChange: false,
    },
    tags: withV2GoodTags(
      "improve",
      "preserve-identity",
      "fight",
      "simple-request",
      "single-plan",
      "visual-beats",
      "continuation",
      "action-add-on",
      "current-animation-extension",
    ),
  }),
  createPlanExample({
    id: "good-improve-ball-drop-gag",
    category: "preserve-identity-ball-drop",
    userPrompt: "Keep the ball-drop gag, but make it funnier and cleaner.",
    story:
      "The core gag is already right. The best upgrade is sharpening the expectation, misfire, and reversal without changing the joke.",
    knownFacts: ["The ball-drop gag must stay.", "The user wants it funnier and cleaner."],
    missingFacts: [],
    rankedMissingFacts: [],
    strongestGap: "",
    bestQuestion: null,
    acceptableOptions: [],
    badQuestions: [],
    reasoning:
      "Plan now because humans expect the same setup to land harder, and the strongest improvement is a cleaner expectation-to-reversal chain rather than a brand-new gag.",
    storyHelpMode: "improve",
    storyQualityNotes: buildStoryQualityNotes({
      expects: "A comedy upgrade should keep the original joke but improve timing and payoff.",
      satisfying: "The setup points one way, the ball misfires, and the reversal lands fast and clearly.",
      wrong: "The scene stops being a ball-drop gag and turns into unrelated comedy.",
      incomplete: "The gag still exists, but the reversal is too soft to land.",
    }),
    planQualityNotes: buildPlanQualityNotes({
      visual: "The ball path, reaction timing, and reversal shape make the gag easy to animate and read.",
      best: "The improved beat is strongest when every frame serves the expectation and the reversal.",
      weaker: "A weaker alternative would add extra nonsense before the payoff and blur the joke.",
    }),
    storyStructure: {
      hasClearGoal: true,
      hasConflict: true,
      hasEscalation: true,
      hasTurningPoint: true,
      hasResolution: true,
      characterChange: false,
    },
    tags: withV2GoodTags(
      "improve",
      "preserve-identity",
      "comedy",
      "simple-request",
      "single-plan",
      "visual-beats",
      "continuation",
      "current-animation-extension",
    ),
  }),
  createPlanExample({
    id: "good-improve-explosion-cleaner",
    category: "preserve-identity-explosion",
    userPrompt: "Keep the explosion reveal, but make it cleaner and stronger.",
    story:
      "The reveal beat already exists. The strongest improvement is making the buildup, blast, and visible consequence sharper without changing the core payoff.",
    knownFacts: ["The explosion reveal stays.", "The user wants the same core payoff made stronger."],
    missingFacts: [],
    rankedMissingFacts: [],
    strongestGap: "",
    bestQuestion: null,
    acceptableOptions: [],
    badQuestions: [],
    reasoning:
      "Plan now because humans expect buildup, impact, and aftermath from an explosion reveal, and the strongest fix is to sharpen those stages instead of inventing a new scene.",
    storyHelpMode: "improve",
    storyQualityNotes: buildStoryQualityNotes({
      expects: "An explosion reveal should build, hit, and visibly change the scene.",
      satisfying: "The blast has clear consequence and reveals something new after the smoke clears.",
      wrong: "The explosion happens with no aftermath or the reveal gets buried in noise.",
      incomplete: "The blast is loud, but the payoff image after it is weak.",
    }),
    planQualityNotes: buildPlanQualityNotes({
      visual: "A cue, trigger, shock moment, and smoke-clear reveal create strong staged animation.",
      best: "Keeping the same reveal but clarifying the buildup and aftermath gives the audience the cleanest payoff.",
      weaker: "A weaker alternative would escalate the size of the blast without improving what it means.",
    }),
    storyStructure: {
      hasClearGoal: true,
      hasConflict: true,
      hasEscalation: true,
      hasTurningPoint: true,
      hasResolution: true,
      characterChange: false,
    },
    tags: withV2GoodTags(
      "improve",
      "preserve-identity",
      "simple-request",
      "single-plan",
      "visual-beats",
      "reveal",
      "continuation",
      "current-animation-extension",
    ),
  }),
  createPlanExample({
    id: "good-improve-notebook-payoff",
    category: "plan-quality-upgrade-notebook",
    userPrompt: "The notebook mystery works, but the ending still feels weak.",
    story:
      "The mystery already has a strong hook, so the best improvement is a better reveal chain and a consequence beat that makes the ending feel inevitable.",
    knownFacts: ["A notebook mystery already exists.", "The ending currently feels weak."],
    missingFacts: [],
    rankedMissingFacts: [],
    strongestGap: "",
    bestQuestion: null,
    acceptableOptions: [],
    badQuestions: [],
    reasoning:
      "Plan now because humans already know what they expect from this setup, and the strongest repair is to strengthen the reveal and consequence instead of restarting the whole mystery.",
    storyHelpMode: "improve",
    storyQualityNotes: buildStoryQualityNotes({
      expects: "A notebook mystery should reframe the earlier clues when the reveal lands.",
      satisfying: "The ending makes the audience feel the clues were building toward this exact payoff.",
      wrong: "The reveal is random or only loosely connected to the notebook.",
      incomplete: "The final page surprises, but it does not change what happens next.",
    }),
    planQualityNotes: buildPlanQualityNotes({
      visual: "The strongest repair uses one extra clue beat, one stronger reveal beat, and one consequence beat.",
      best: "The plan becomes stronger when the ending changes the character's next move instead of stopping at the reveal.",
      weaker: "A weaker alternative would just add more atmosphere and leave the payoff thin.",
    }),
    storyStructure: {
      hasClearGoal: true,
      hasConflict: true,
      hasEscalation: true,
      hasTurningPoint: true,
      hasResolution: true,
      characterChange: true,
    },
    tags: withV2GoodTags("improve", "notebook", "mystery", "plan-quality-upgrade", "ending-repair"),
  }),
  createPlanExample({
    id: "good-improve-art-room-emotion",
    category: "plan-quality-upgrade-art-room",
    userPrompt: "A student sneaks back into an old art room, but the emotional core is weak.",
    story:
      "The setup has atmosphere already. The strongest improvement is tying the room to a personal memory or loss so the ending carries real emotional meaning.",
    knownFacts: ["A student sneaks back into an old art room.", "The emotional core is weak."],
    missingFacts: [],
    rankedMissingFacts: [],
    strongestGap: "",
    bestQuestion: null,
    acceptableOptions: [],
    badQuestions: [],
    reasoning:
      "Plan now because the premise is already good, and the strongest repair is to attach the action to a personal reason that can pay off in the ending instead of adding unrelated drama.",
    storyHelpMode: "improve",
    storyQualityNotes: buildStoryQualityNotes({
      expects: "A return-to-place story should reveal why the place matters personally.",
      satisfying: "The final beat pays off that personal connection through action or choice.",
      wrong: "The room stays moody but emotionally generic.",
      incomplete: "The sneaking-in has tension, but the audience never learns why it matters.",
    }),
    planQualityNotes: buildPlanQualityNotes({
      visual: "A remembered object, a pause inside the room, and one ending choice can carry the emotion without overtalking it.",
      best: "The emotional repair is strongest when it comes from the room itself rather than an added subplot.",
      weaker: "A weaker alternative would pile extra dialogue onto a story that still lacks a real core.",
    }),
    storyStructure: {
      hasClearGoal: true,
      hasConflict: true,
      hasEscalation: true,
      hasTurningPoint: true,
      hasResolution: true,
      characterChange: true,
    },
    tags: withV2GoodTags("improve", "emotional", "art-room", "plan-quality-upgrade", "visual-beats"),
  }),
  createPlanExample({
    id: "good-improve-invention-climax",
    category: "plan-quality-upgrade-invention",
    userPrompt: "The invention story has a fun setup, but the payoff is weak.",
    story:
      "The strongest repair is making the invention create the exact crisis that the ending later solves, so the climax feels inevitable and earned.",
    knownFacts: ["An invention story already exists.", "The setup is fun.", "The payoff is weak."],
    missingFacts: [],
    rankedMissingFacts: [],
    strongestGap: "",
    bestQuestion: null,
    acceptableOptions: [],
    badQuestions: [],
    reasoning:
      "Plan now because humans expect the invention to matter to the ending, and the strongest improvement is tying the climax directly to the problem the invention caused earlier.",
    storyHelpMode: "improve",
    storyQualityNotes: buildStoryQualityNotes({
      expects: "An invention story should make the invention cause and solve the main trouble.",
      satisfying: "The ending pays off the same machine logic that created the middle problem.",
      wrong: "The invention causes chaos, but the ending solves an unrelated issue.",
      incomplete: "The premise is inventive, but the climax does not belong to the same story engine.",
    }),
    planQualityNotes: buildPlanQualityNotes({
      visual: "A test beat, failure beat, crisis beat, and repurposed-fix beat create a strong animation ladder.",
      best: "The story gets stronger when the final fix directly echoes the earlier failure.",
      weaker: "A weaker alternative would invent a last-minute solution unrelated to the invention.",
    }),
    storyStructure: {
      hasClearGoal: true,
      hasConflict: true,
      hasEscalation: true,
      hasTurningPoint: true,
      hasResolution: true,
      characterChange: true,
    },
    tags: withV2GoodTags("improve", "invention", "project", "plan-quality-upgrade", "failure-success"),
  }),
  createPlanExample({
    id: "good-improve-chase-middle",
    category: "plan-quality-upgrade-chase",
    userPrompt: "The chase opening and ending are good, but the middle feels flat.",
    story:
      "The strongest repair is not a new beginning or ending. It is a more varied obstacle ladder and one risky adaptation that changes the momentum.",
    knownFacts: ["The chase opening works.", "The ending works.", "The middle is flat."],
    missingFacts: [],
    rankedMissingFacts: [],
    strongestGap: "",
    bestQuestion: null,
    acceptableOptions: [],
    badQuestions: [],
    reasoning:
      "Plan now because humans already know what they want from a chase middle: things should get harder in a varied way, and that repair is stronger than replacing the whole sequence.",
    storyHelpMode: "improve",
    storyQualityNotes: buildStoryQualityNotes({
      expects: "A chase middle should escalate through changing obstacles, route shifts, and mounting urgency.",
      satisfying: "The midpoint forces a smarter or riskier move than the opening did.",
      wrong: "The chase repeats the same kind of movement until the ending suddenly arrives.",
      incomplete: "The beginning starts strong, but the story never climbs before the finish.",
    }),
    planQualityNotes: buildPlanQualityNotes({
      visual: "The middle becomes stronger when each obstacle changes the spacing, speed, or direction of the pursuit.",
      best: "One risky adaptation in the middle makes the ending feel earned instead of automatic.",
      weaker: "A weaker alternative would just add more distance without changing the chase logic.",
    }),
    storyStructure: {
      hasClearGoal: true,
      hasConflict: true,
      hasEscalation: true,
      hasTurningPoint: true,
      hasResolution: true,
      characterChange: true,
    },
    tags: withV2GoodTags("improve", "chase", "plan-quality-upgrade", "visual-beats", "ending-repair"),
  }),
  createPlanExample({
    id: "good-improve-reunion-ending",
    category: "plan-quality-upgrade-reunion",
    userPrompt: "The reunion setup is promising, but the ending fizzles.",
    story:
      "The strongest repair is a decisive action, gesture, or confession that turns the reunion from mood into change before the final image.",
    knownFacts: ["A reunion setup already exists.", "The ending currently lacks payoff."],
    missingFacts: [],
    rankedMissingFacts: [],
    strongestGap: "",
    bestQuestion: null,
    acceptableOptions: [],
    badQuestions: [],
    reasoning:
      "Plan now because humans already understand the emotional setup, and the strongest fix is to add one decisive ending action rather than widening the story with extra scenes.",
    storyHelpMode: "improve",
    storyQualityNotes: buildStoryQualityNotes({
      expects: "A reunion should visibly change the relationship before the ending image.",
      satisfying: "The final action proves the characters are no longer stuck where they started.",
      wrong: "The reunion happens, but the scene avoids commitment and ends on soft mood alone.",
      incomplete: "The setup is emotional, but the relationship never actually moves.",
    }),
    planQualityNotes: buildPlanQualityNotes({
      visual: "A single offered hand, returned object, shared step forward, or confession can carry the whole ending.",
      best: "The reunion ending becomes strongest when one clear action does the emotional work.",
      weaker: "A weaker alternative would add more conversation while still dodging a decisive payoff.",
    }),
    storyStructure: {
      hasClearGoal: true,
      hasConflict: true,
      hasEscalation: true,
      hasTurningPoint: true,
      hasResolution: true,
      characterChange: true,
    },
    tags: withV2GoodTags("improve", "reunion", "emotional", "plan-quality-upgrade", "ending-repair"),
  }),
  createPlanExample({
    id: "good-create-school-mystery-options",
    category: "story-create-options-mystery",
    userPrompt: "Help me make a school mystery story.",
    story:
      "Enough is known to recommend several complete school-mystery stories, and the best option should clearly win on escalating clues, public payoff, and emotional consequence.",
    knownFacts: ["The user wants a school mystery story."],
    missingFacts: [],
    rankedMissingFacts: [],
    strongestGap: "",
    bestQuestion: null,
    acceptableOptions: [],
    badQuestions: [],
    reasoning:
      "Plan now with structured options because humans expect complete story possibilities, not vague vibes, and recommending the option with the clearest clue ladder and reveal creates the strongest guidance.",
    storyHelpMode: "create",
    storyQualityNotes: buildStoryQualityNotes({
      expects: "Each mystery option should have a goal, clue path, reveal, and consequence.",
      satisfying: "The recommended option wins because the clues escalate cleanly into a strong public payoff.",
      wrong: "The options are just school moods with no real plot spine.",
      incomplete: "The ideas sound interesting, but none of them feels ready to plan.",
    }),
    planQualityNotes: buildPlanQualityNotes({
      visual: "School spaces, clue finds, hall movement, and reveal staging give each option animation-ready structure.",
      best: "The best option is the one where every clue pushes toward one decisive reveal and visible character change.",
      weaker: "A weaker alternative would offer three mystery vibes without complete arcs or recommendation logic.",
    }),
    storyStructure: {
      hasClearGoal: true,
      hasConflict: true,
      hasEscalation: true,
      hasTurningPoint: true,
      hasResolution: true,
      characterChange: true,
    },
    storyOptions: [
      createStoryOption({
        title: "The Missing Bell Code",
        character: "A shy student running the school soundboard",
        goal: "Decode the strange bell pattern before the assembly is sabotaged",
        conflict: "No one believes the bells mean anything and the real saboteur is close by",
        escalation: "Each new bell pattern predicts a bigger problem and arrives later than the last",
        turningPoint: "The student realizes the pattern points to the assembly stage and must act publicly",
        resolution: "He stops the sabotage and finally steps out from behind the speakers",
        isRecommended: true,
      }),
      createStoryOption({
        title: "The Locked Science Cabinet",
        character: "A curious lab assistant",
        goal: "Learn why the same cabinet keeps unlocking itself after school",
        conflict: "A rival student wants the experiment notebook hidden inside",
        escalation: "Every clue leads deeper into the dark lab while the danger keeps growing",
        turningPoint: "She discovers the experiment is still running under the classroom floor",
        resolution: "She shuts it down and protects the school before claiming credit",
      }),
      createStoryOption({
        title: "The Hallway Portrait Watcher",
        character: "A new student avoiding attention",
        goal: "Find out why one portrait keeps changing to look more like him",
        conflict: "Teachers dismiss it and the portrait changes faster whenever he gets close",
        escalation: "Each visit reveals a new clue and a stronger warning",
        turningPoint: "He realizes the portrait is recording a missing student's route through the school",
        resolution: "He follows the final clue and exposes what the school hid",
      }),
    ],
    tags: withV2GoodTags(
      "create-story",
      "story-help",
      "options",
      "multi-option",
      "recommended-story",
      "school",
      "mystery",
      "exploratory-request",
      "options-when-useful",
    ),
  }),
  createPlanExample({
    id: "good-create-fight-options",
    category: "story-create-options-fight",
    userPrompt: "Give me some strong story ideas for an Alan Becker style fight animation.",
    story:
      "Enough is known to recommend several visual fight stories, and the strongest option should clearly win on readable motivation, escalating environment use, and a payoff that means more than random action.",
    knownFacts: ["The user wants a strong fight story.", "The user wants it to feel highly visual and animation-friendly."],
    missingFacts: [],
    rankedMissingFacts: [],
    strongestGap: "",
    bestQuestion: null,
    acceptableOptions: [],
    badQuestions: [],
    reasoning:
      "Plan now with structured options because humans expect a fight premise to explain why the battle matters, and the strongest recommendation is the option where the goal and arena both escalate the action cleanly.",
    storyHelpMode: "create",
    storyQualityNotes: buildStoryQualityNotes({
      expects: "Each fight option should explain what the fighters want and how the conflict escalates.",
      satisfying: "The recommended option turns the arena and the objective into part of the story, not just the punches.",
      wrong: "The options are just 'two stick figures fight' with no reason or payoff.",
      incomplete: "The fights sound cool, but none of them has a real arc.",
    }),
    planQualityNotes: buildPlanQualityNotes({
      visual: "Fight ideas are strongest when the environment, objective, counters, and reversal all show up in the action beats.",
      best: "The recommended option wins because its environment and goal create the clearest escalation for animation.",
      weaker: "A weaker alternative would be pure spectacle without a story engine.",
    }),
    storyStructure: {
      hasClearGoal: true,
      hasConflict: true,
      hasEscalation: true,
      hasTurningPoint: true,
      hasResolution: true,
      characterChange: true,
    },
    storyOptions: [
      createStoryOption({
        title: "Rooftop Marker Duel",
        character: "Two rival stick fighters",
        goal: "Control a living marker that redraws the city around them",
        conflict: "Every attack also changes the arena and removes safe footing",
        escalation: "The marker starts erasing platforms and forcing riskier movement",
        turningPoint: "One fighter saves the other with the marker instead of finishing the duel",
        resolution: "They stop the fight long enough to lock the marker away together",
        isRecommended: true,
      }),
      createStoryOption({
        title: "Train Relay Fight",
        character: "A defender and a thief leaping across train cars",
        goal: "Recover a stolen device before the final tunnel closes the chance",
        conflict: "The thief uses the moving train cars to break rhythm and escape",
        escalation: "Each car becomes harder to cross as speed and obstacles increase",
        turningPoint: "The defender must choose between the device and saving the falling thief",
        resolution: "He saves the thief first and wins by making the device irrelevant",
      }),
      createStoryOption({
        title: "Notebook Arena Trap",
        character: "A curious fighter trapped by a hidden opponent",
        goal: "Escape a sketchbook arena that keeps rewriting the rules mid-fight",
        conflict: "Every page turn gives the opponent a new advantage",
        escalation: "The arena grows stranger and more dangerous with each forced redraw",
        turningPoint: "The trapped fighter realizes the book reacts to fear and changes tactics",
        resolution: "He redraws the final page into a way out instead of a finishing blow",
      }),
    ],
    tags: withV2GoodTags(
      "create-story",
      "story-help",
      "options",
      "multi-option",
      "recommended-story",
      "fight",
      "alan-becker",
      "visual-beats",
      "exploratory-request",
      "options-when-useful",
      "collaborative-ideation",
    ),
  }),
  createPlanExample({
    id: "good-create-funny-options",
    category: "story-create-options-funny",
    userPrompt: "I want a weird funny animation story.",
    story:
      "Enough is known to recommend several comedy stories, and the strongest option should clearly win on setup, escalation, reversal, and visible aftermath.",
    knownFacts: ["The user wants a weird funny story."],
    missingFacts: [],
    rankedMissingFacts: [],
    strongestGap: "",
    bestQuestion: null,
    acceptableOptions: [],
    badQuestions: [],
    reasoning:
      "Plan now with structured options because humans expect comedy to have a clear gag engine, and recommending the option with the cleanest setup-to-reversal shape is stronger than giving random absurdity.",
    storyHelpMode: "create",
    storyQualityNotes: buildStoryQualityNotes({
      expects: "Each funny option should have setup, escalation, reversal, and a strong ending image.",
      satisfying: "The recommended option keeps the joke clear while letting the chaos visibly grow.",
      wrong: "The options are only weird without a real payoff pattern.",
      incomplete: "The ideas sound odd, but none of them lands a clean comedic reversal.",
    }),
    planQualityNotes: buildPlanQualityNotes({
      visual: "Comedy options should create readable cause-and-effect and one strong final image.",
      best: "The recommended option wins because each mishap clearly causes the next one before the reversal.",
      weaker: "A weaker alternative would rely on randomness instead of structure.",
    }),
    storyStructure: {
      hasClearGoal: true,
      hasConflict: true,
      hasEscalation: true,
      hasTurningPoint: true,
      hasResolution: true,
      characterChange: true,
    },
    storyOptions: [
      createStoryOption({
        title: "The Self-Opening Locker",
        character: "A student desperate to look cool",
        goal: "Open his locker in one smooth move before everyone sees him struggle",
        conflict: "The locker starts opening other lockers on its own",
        escalation: "Each attempt to shut it down makes the hallway chain reaction worse",
        turningPoint: "He realizes the runaway lockers are about to trap the principal",
        resolution: "He accidentally saves the principal and has to act humble for once",
        isRecommended: true,
      }),
      createStoryOption({
        title: "The Balloon That Hates Gravity",
        character: "A kid carrying a balloon animal",
        goal: "Get it to a party without ruining the surprise",
        conflict: "The balloon keeps choosing the most embarrassing direction to float",
        escalation: "Each grab sends the kid into a bigger public disaster",
        turningPoint: "The balloon finally floats exactly where it needs to stop a worse problem",
        resolution: "The surprise arrives late but far more memorable than planned",
      }),
      createStoryOption({
        title: "Marker Mustache Disaster",
        character: "A class clown hiding nerves behind jokes",
        goal: "Use a magic marker for a harmless prank",
        conflict: "Every doodle becomes real at the worst possible moment",
        escalation: "The classroom fills with escalating drawn nonsense",
        turningPoint: "The biggest joke threatens to expose something true about him",
        resolution: "He fixes the mess by owning up instead of hiding behind another prank",
      }),
    ],
    tags: withV2GoodTags(
      "create-story",
      "story-help",
      "options",
      "multi-option",
      "recommended-story",
      "comedy",
      "funny",
      "exploratory-request",
      "options-when-useful",
    ),
  }),
  createPlanExample({
    id: "good-create-emotional-sibling-options",
    category: "story-create-options-emotional",
    userPrompt: "Give me an emotional story about siblings.",
    story:
      "Enough is known to recommend several emotional sibling arcs, and the strongest option should clearly win on visible pressure, turning-point choice, and repair.",
    knownFacts: ["The user wants an emotional sibling story."],
    missingFacts: [],
    rankedMissingFacts: [],
    strongestGap: "",
    bestQuestion: null,
    acceptableOptions: [],
    badQuestions: [],
    reasoning:
      "Plan now with complete options because humans expect emotional stories to move through pressure, choice, and repair, and the strongest recommendation is the one where the relationship changes through action instead of pure sadness.",
    storyHelpMode: "create",
    storyQualityNotes: buildStoryQualityNotes({
      expects: "Each sibling story should have a wound, pressure point, choice, and changed relationship.",
      satisfying: "The recommended option lets the emotional turn happen through a visible action or sacrifice.",
      wrong: "The options are only sad atmosphere without a real turn or repair.",
      incomplete: "The relationship matters, but no decisive moment changes it.",
    }),
    planQualityNotes: buildPlanQualityNotes({
      visual: "Shared objects, distance, hesitation, and one final act of care make the emotion animation-friendly.",
      best: "The recommended option wins because the emotional shift happens through a clear external decision.",
      weaker: "A weaker alternative would rely on explanation and keep the arc abstract.",
    }),
    storyStructure: {
      hasClearGoal: true,
      hasConflict: true,
      hasEscalation: true,
      hasTurningPoint: true,
      hasResolution: true,
      characterChange: true,
    },
    storyOptions: [
      createStoryOption({
        title: "The Last Kite Before the Storm",
        character: "Two siblings who stopped talking after a fight",
        goal: "Recover their late father's kite before the storm destroys it",
        conflict: "They blame each other for losing it in the first place",
        escalation: "The chase gets riskier as the wind and argument both intensify",
        turningPoint: "One sibling lets go of winning the argument to save the other",
        resolution: "They recover the kite and finally grieve together",
        isRecommended: true,
      }),
      createStoryOption({
        title: "The Locked Music Room",
        character: "A careful older sister and a reckless younger brother",
        goal: "Retrieve a recording before the school archives are cleared out",
        conflict: "The siblings disagree over whether the recording should be heard at all",
        escalation: "Each step through the school reopens an old hurt between them",
        turningPoint: "The younger brother chooses to hear the truth even if it hurts him",
        resolution: "They play the recording and stop hiding from what it means",
      }),
      createStoryOption({
        title: "Bridge in the Snow",
        character: "Two siblings separated by pride",
        goal: "Reach each other before the bridge closes for the night",
        conflict: "Both think the other should apologize first",
        escalation: "The snow and distance make each delay cost more",
        turningPoint: "One leaves behind the apology speech and simply helps the other across",
        resolution: "They cross together and the silence finally breaks",
      }),
    ],
    tags: withV2GoodTags(
      "create-story",
      "story-help",
      "options",
      "multi-option",
      "recommended-story",
      "emotional",
      "reunion",
      "exploratory-request",
      "options-when-useful",
    ),
  }),
  createPlanExample({
    id: "good-create-invention-options",
    category: "story-create-options-invention",
    userPrompt: "Help me make a strong invention story.",
    story:
      "Enough is known to recommend several invention arcs, and the strongest option should clearly win on cause-and-effect, visible testing, and payoff that belongs to the machine itself.",
    knownFacts: ["The user wants an invention story."],
    missingFacts: [],
    rankedMissingFacts: [],
    strongestGap: "",
    bestQuestion: null,
    acceptableOptions: [],
    badQuestions: [],
    reasoning:
      "Plan now with complete options because humans expect invention stories to make the machine matter to both the problem and the solution, and the strongest recommendation is the one where that link is cleanest.",
    storyHelpMode: "create",
    storyQualityNotes: buildStoryQualityNotes({
      expects: "Each invention option should show a goal, failure pattern, turning insight, and earned success.",
      satisfying: "The recommended option makes the machine create the middle problem and solve the ending.",
      wrong: "The invention is only a prop while unrelated conflict does the real story work.",
      incomplete: "The setup has a machine, but its payoff does not belong to the same idea.",
    }),
    planQualityNotes: buildPlanQualityNotes({
      visual: "Testing, failing, redesigning, and final use create strong step-by-step animation beats.",
      best: "The recommended option wins because every beat grows from the machine's exact function.",
      weaker: "A weaker alternative would bolt a generic climax onto an invention premise.",
    }),
    storyStructure: {
      hasClearGoal: true,
      hasConflict: true,
      hasEscalation: true,
      hasTurningPoint: true,
      hasResolution: true,
      characterChange: true,
    },
    storyOptions: [
      createStoryOption({
        title: "The Counterweight Arm",
        character: "A shy student inventor",
        goal: "Build a tiny robot arm strong enough to retrieve something the class cannot reach",
        conflict: "Each test makes the arm fail in a more public and embarrassing way",
        escalation: "The failed tests create a bigger classroom problem before the final demo",
        turningPoint: "The inventor realizes the fix is balance, not more power",
        resolution: "The counterweight version solves the exact problem the earlier versions kept failing at",
        isRecommended: true,
      }),
      createStoryOption({
        title: "The Self-Writing Chalk Rail",
        character: "A student trying to save the school fair",
        goal: "Build a chalk-guiding machine to finish the giant floor map in time",
        conflict: "The rail starts redrawing the map wrong and leading everyone astray",
        escalation: "Each correction creates a bigger navigation disaster",
        turningPoint: "The student realizes the rail can guide people safely through the chaos instead",
        resolution: "The machine saves the fair by doing a smarter version of what it first messed up",
      }),
      createStoryOption({
        title: "The Wind-Catching Drone",
        character: "A stubborn maker competing with a talented friend",
        goal: "Use a homemade drone to recover items lost on a rooftop",
        conflict: "The drone keeps failing when the wind matters most",
        escalation: "Every fix makes the rivalry and the risk more public",
        turningPoint: "The maker finally accepts help and redesigns the control system",
        resolution: "The shared solution turns the rivalry into respect when the drone succeeds",
      }),
    ],
    tags: withV2GoodTags(
      "create-story",
      "story-help",
      "options",
      "multi-option",
      "recommended-story",
      "invention",
      "project",
      "exploratory-request",
      "options-when-useful",
    ),
  }),
  createPlanExample({
    id: "good-create-chase-options",
    category: "story-create-options-chase",
    userPrompt: "Give me a strong chase story idea.",
    story:
      "Enough is known to recommend several chase stories, and the strongest option should clearly win on destination clarity, obstacle variety, and an ending that resolves the same urgency the opening promised.",
    knownFacts: ["The user wants a chase story."],
    missingFacts: [],
    rankedMissingFacts: [],
    strongestGap: "",
    bestQuestion: null,
    acceptableOptions: [],
    badQuestions: [],
    reasoning:
      "Plan now with structured options because humans expect a chase to go somewhere and build pressure, and the strongest recommendation is the one with the clearest route logic and finish-line payoff.",
    storyHelpMode: "create",
    storyQualityNotes: buildStoryQualityNotes({
      expects: "Each chase option should have a destination, obstacle ladder, turning beat, and earned finish.",
      satisfying: "The recommended option keeps every obstacle tied to the same urgent destination.",
      wrong: "The options are just running without a clear reason or endpoint.",
      incomplete: "The motion exists, but the ending does not resolve what the chase was for.",
    }),
    planQualityNotes: buildPlanQualityNotes({
      visual: "Route changes, blocked paths, leaps, crowd obstacles, and one final risky move create strong chase animation.",
      best: "The recommended option wins because its obstacles escalate naturally toward a single destination.",
      weaker: "A weaker alternative would offer generic running with no route logic or payoff.",
    }),
    storyStructure: {
      hasClearGoal: true,
      hasConflict: true,
      hasEscalation: true,
      hasTurningPoint: true,
      hasResolution: true,
      characterChange: true,
    },
    storyOptions: [
      createStoryOption({
        title: "Medicine Before Sunset",
        character: "A runner weaving through the market",
        goal: "Deliver medicine before the last safe light fades",
        conflict: "Crowds, blockades, and false shortcuts keep wasting time",
        escalation: "Each new route gets riskier as the market closes around him",
        turningPoint: "He abandons the safest path and commits to one dangerous final shortcut",
        resolution: "The delivery succeeds because he finally chooses the route that matches the urgency",
        isRecommended: true,
      }),
      createStoryOption({
        title: "The Kite Over the Canal",
        character: "A kid chasing a meaningful kite",
        goal: "Recover the kite before it reaches the closed canal bridge",
        conflict: "The neighborhood keeps turning the chase away from the direct route",
        escalation: "Every shortcut costs more as the kite gets closer to the water",
        turningPoint: "The kid stops chasing directly and predicts where the kite will fall",
        resolution: "He catches it where it lands and finally resolves why it mattered",
      }),
      createStoryOption({
        title: "Tunnel Train Relay",
        character: "A defender racing across moving train cars",
        goal: "Recover a stolen device before the train enters the final tunnel",
        conflict: "The thief uses the changing train cars to break distance and rhythm",
        escalation: "Each car adds a new hazard and less time to recover",
        turningPoint: "The defender risks the jump he kept avoiding from the start",
        resolution: "He ends the chase by understanding the route, not just moving faster",
      }),
    ],
    tags: withV2GoodTags(
      "create-story",
      "story-help",
      "options",
      "multi-option",
      "recommended-story",
      "chase",
      "exploratory-request",
      "options-when-useful",
    ),
  }),
  createPlanExample({
    id: "good-plan-misunderstood-enemy-twist",
    category: "plan-quality-master-misunderstood-enemy",
    userPrompt:
      "A stick figure thinks a masked fighter is hunting him through a collapsing subway tunnel, fights back, then realizes the fighter was trying to keep him away from the thing behind them.",
    story:
      "The pursuit, fight, reveal, and final alliance are already present, so this story is ready for an elite action-twist plan where the reveal changes the meaning of every earlier beat.",
    knownFacts: [
      "A masked fighter chases the protagonist through a collapsing subway tunnel.",
      "The protagonist thinks the masked fighter is the enemy.",
      "The masked fighter was actually trying to protect him from a larger danger behind them.",
    ],
    missingFacts: [],
    rankedMissingFacts: [],
    strongestGap: "",
    bestQuestion: null,
    acceptableOptions: [],
    badQuestions: [],
    reasoning:
      "Plan now because humans expect a twist like this to change the meaning of the fight, and this is strongest when the reveal forces the hero to trust the former enemy immediately instead of pausing the story for explanation. It falls flat if the twist only adds information and does not redirect the final action.",
    storyHelpMode: "none",
    storyQualityNotes: buildStoryQualityNotes({
      expects: "The reveal should recontextualize the chase and make the former enemy's actions suddenly make sense.",
      satisfying: "The hero realizes the truth at the exact moment he has to fight beside the person he misunderstood.",
      wrong: "The reveal arrives after the action peak, so nothing about the fight actually changes.",
      incomplete: "The twist explains the pursuit, but the final action never proves that the meaning has changed.",
    }),
    planQualityNotes: buildPlanQualityNotes({
      visual: "The collapsing tunnel, desperate pursuit, hard clash, shared glance, and turn-together counterattack create bold, readable action beats.",
      best: "The strongest version keeps the misunderstanding inside the motion until the reveal forces an immediate alliance.",
      weaker: "A weaker version would stop the fight for exposition and lose the shock of the recontextualized action.",
    }),
    storyStructure: {
      hasClearGoal: true,
      hasConflict: true,
      hasEscalation: true,
      hasTurningPoint: true,
      hasResolution: true,
      characterChange: true,
    },
    tags: withV2GoodTags(
      "fight",
      "twist",
      "misunderstood-enemy",
      "action-emotion",
      "protective-twist",
      "visual-beats",
      "recontextualize",
    ),
  }),
  createPlanExample({
    id: "good-plan-action-emotion-storm-camera",
    category: "plan-quality-master-action-emotion",
    userPrompt:
      "Two estranged siblings race across storm rooftops after their late father's camera bag. They are still angry at each other, but every time one slips, the other has to choose between grabbing the bag and saving them.",
    story:
      "The chase, emotional wound, repeated save choices, and final sacrifice are already aligned, so this story is ready for a plan where motion carries the relationship arc instead of stopping for speeches.",
    knownFacts: [
      "Two estranged siblings are chasing their late father's camera bag across rooftops.",
      "They are still angry with each other.",
      "The chase keeps forcing them to choose between the bag and each other.",
    ],
    missingFacts: [],
    rankedMissingFacts: [],
    strongestGap: "",
    bestQuestion: null,
    acceptableOptions: [],
    badQuestions: [],
    reasoning:
      "Plan now because humans expect the action to reveal the emotional truth, and this is strongest when every rescue beat also changes the relationship. It would feel weak if the rooftop chase and the sibling arc ran side by side without affecting each other.",
    storyHelpMode: "none",
    storyQualityNotes: buildStoryQualityNotes({
      expects: "The action should force the siblings to show care before they are ready to say it.",
      satisfying: "One sibling finally lets the bag go to save the other, and the emotional shift is visible in the movement itself.",
      wrong: "The chase looks exciting, but the relationship arc only happens in dialogue after the action stops.",
      incomplete: "The siblings survive the chase, but nothing in the motion changes how they relate to each other.",
    }),
    planQualityNotes: buildPlanQualityNotes({
      visual: "Slippery rooftops, near-falls, hand grabs, dropped weight, and a final shared landing turn the emotion into readable action.",
      best: "The strongest version ties every choice about the camera bag to the deeper choice about whether the siblings still choose each other.",
      weaker: "A weaker version would make the chase and the family emotion feel like two separate stories stitched together.",
    }),
    storyStructure: {
      hasClearGoal: true,
      hasConflict: true,
      hasEscalation: true,
      hasTurningPoint: true,
      hasResolution: true,
      characterChange: true,
    },
    tags: withV2GoodTags("action-emotion", "emotional", "chase", "siblings", "rooftop", "storm", "visual-beats"),
  }),
  createPlanExample({
    id: "good-plan-visual-mechanic-gravity-chalk",
    category: "plan-quality-master-visual-mechanic",
    userPrompt:
      "A stick figure gets trapped in a classroom where every chalk line tilts gravity. He has to redraw the room's angles to reach a jammed exit before the last wall flips upside down for good.",
    story:
      "The visual mechanic, rule escalation, and escape condition are already complete, so this premise is ready for a plan where the environment itself tells the story.",
    knownFacts: [
      "The classroom's chalk lines control gravity.",
      "The character must redraw the room's angles to reach the exit.",
      "The room is getting closer to a permanent upside-down flip.",
    ],
    missingFacts: [],
    rankedMissingFacts: [],
    strongestGap: "",
    bestQuestion: null,
    acceptableOptions: [],
    badQuestions: [],
    reasoning:
      "Plan now because humans expect a visual mechanic story to keep paying off its rule, and this is strongest when each redraw changes the movement problem in a clearer, riskier way. It would feel generic if the gravity idea only decorated the background instead of driving every beat.",
    storyHelpMode: "none",
    storyQualityNotes: buildStoryQualityNotes({
      expects: "The chalk mechanic should keep changing how the character can move, fail, and recover.",
      satisfying: "The final escape uses the same gravity rule that made the room dangerous in the first place.",
      wrong: "The chalk gimmick appears once, then the story turns into a normal escape scene.",
      incomplete: "The room flips, but the ending does not feel earned by the rule system.",
    }),
    planQualityNotes: buildPlanQualityNotes({
      visual: "Tilting floors, sliding desks, airborne jumps, redrawn lines, and the final angle shift make the environment the star of the sequence.",
      best: "The strongest version lets the room keep rewriting the action so the viewer understands the rule through motion, not explanation.",
      weaker: "A weaker version would mention gravity once and then fall back on ordinary running and jumping beats.",
    }),
    storyStructure: {
      hasClearGoal: true,
      hasConflict: true,
      hasEscalation: true,
      hasTurningPoint: true,
      hasResolution: true,
      characterChange: true,
    },
    tags: withV2GoodTags("visual-mechanic", "physics", "drawing", "environment", "escape", "chalk", "visual-beats"),
  }),
  createPlanExample({
    id: "good-plan-strong-ending-image-theater",
    category: "plan-quality-master-ending-image",
    userPrompt:
      "A student sneaks through a blackout theater to restart a broken star projector before demolition begins at dawn, and the story ends with the whole ceiling turning into constellations while his old mentor watches from the doorway.",
    story:
      "The blackout, ticking deadline, broken mentor bond, and final transformed ceiling already support an ending-image story that should build toward one unforgettable frame.",
    knownFacts: [
      "The theater is dark and close to demolition.",
      "The student is trying to restart a broken star projector before dawn.",
      "The ending image is the ceiling turning into constellations while the mentor watches.",
    ],
    missingFacts: [],
    rankedMissingFacts: [],
    strongestGap: "",
    bestQuestion: null,
    acceptableOptions: [],
    badQuestions: [],
    reasoning:
      "Plan now because humans expect an ending-image story to earn one unforgettable last frame, and this is strongest when every earlier beat builds toward the projector coming alive in front of the mentor. It would feel incomplete if the projector worked but the final image did not heal or reframe the relationship.",
    storyHelpMode: "none",
    storyQualityNotes: buildStoryQualityNotes({
      expects: "The whole story should aim at one transformed image that feels emotionally inevitable when it arrives.",
      satisfying: "The constellations light the ceiling and the mentor sees exactly what the student was fighting to save.",
      wrong: "The projector turns on, but the ending lands as a technical fix instead of a meaningful image.",
      incomplete: "The theater is saved, but the last frame does not feel iconic or emotionally resolved.",
    }),
    planQualityNotes: buildPlanQualityNotes({
      visual: "Dark aisles, failing switches, dust, rising projector light, and the sudden ceiling-wide constellation bloom create a director-level payoff.",
      best: "The strongest version keeps the whole plan pointed at the final frame, so the ending image feels like the inevitable result of every sacrifice before it.",
      weaker: "A weaker version would solve the projector problem earlier and spend the ending on explanation instead of image.",
    }),
    storyStructure: {
      hasClearGoal: true,
      hasConflict: true,
      hasEscalation: true,
      hasTurningPoint: true,
      hasResolution: true,
      characterChange: true,
    },
    tags: withV2GoodTags("strong-ending-image", "theater", "projector", "mentor", "emotional", "visual-beats", "final-image"),
  }),
  createPlanExample({
    id: "good-plan-hindsight-reveal-posters",
    category: "plan-quality-master-hindsight-reveal",
    userPrompt:
      "A student thinks someone keeps vandalizing hallway posters, but the missing pieces later assemble into a warning map showing where the assembly floor will collapse.",
    story:
      "The planted oddity, assembled reveal, and public consequence are already present, so this story is ready for a reveal that feels obvious in hindsight instead of random.",
    knownFacts: [
      "Hallway posters keep losing pieces in a pattern that looks like vandalism.",
      "The torn gaps later assemble into a warning map.",
      "The map reveals where the assembly floor will collapse.",
    ],
    missingFacts: [],
    rankedMissingFacts: [],
    strongestGap: "",
    bestQuestion: null,
    acceptableOptions: [],
    badQuestions: [],
    reasoning:
      "Plan now because humans expect a planted reveal to make earlier details click into place, and this is strongest when the poster damage stops feeling random and becomes the exact thing that saves people. It would feel cheap if the reveal surprised the audience without making the earlier clues smarter in retrospect.",
    storyHelpMode: "none",
    storyQualityNotes: buildStoryQualityNotes({
      expects: "The reveal should make the earlier poster damage feel meaningful the instant the pattern is seen.",
      satisfying: "The map suddenly makes the audience realize the warning was visible all along, then forces urgent action.",
      wrong: "The reveal comes out of nowhere or only explains itself after the fact.",
      incomplete: "The map is clever, but the earlier clue trail never becomes emotionally or structurally satisfying.",
    }),
    planQualityNotes: buildPlanQualityNotes({
      visual: "Torn poster fragments, suspicious hall passes, the assembled wall pattern, and the race to stop the assembly create strong cause-and-effect images.",
      best: "The strongest version lets the reveal recontextualize the planted details and immediately launch the rescue beat.",
      weaker: "A weaker version would hold the explanation too long or reveal a clue chain that only works after someone explains it aloud.",
    }),
    storyStructure: {
      hasClearGoal: true,
      hasConflict: true,
      hasEscalation: true,
      hasTurningPoint: true,
      hasResolution: true,
      characterChange: true,
    },
    tags: withV2GoodTags("hindsight-reveal", "mystery", "school", "visual-clue", "recontextualize", "visual-beats"),
  }),
];

const CURATED_V2_BAD_EXAMPLES: GeneratePlansExample[] = [
  createInactiveExample({
    id: "bad-no-goal-actions",
    category: "bad-no-goal-actions",
    userPrompt: "He walks, jumps, opens a door, and looks around.",
    story: "This is intentionally bad because it mistakes disconnected motion for story structure.",
    knownFacts: ["There are disconnected actions."],
    missingFacts: ["What the goal is.", "Why the door matters.", "What changes by the end."],
    rankedMissingFacts: ["What the goal is.", "Why the door matters."],
    strongestGap: "What the goal is.",
    bestQuestion: "What is he trying to do by opening the door?",
    acceptableOptions: [],
    badQuestions: ["What happens next?"],
    reasoning:
      "This intentionally bad example shows weak storytelling: humans expect the door to matter and the sequence to build toward a payoff, but here the actions never connect.",
    shouldPlanNow: false,
    shouldAskQuestion: true,
    storyHelpMode: "none",
    storyQualityNotes: buildBadStoryQualityNotes({
      bad: "It has motion but no objective, pressure, or payoff.",
      expectsInstead: "A door-opening beat should connect to a goal, obstacle, or reveal.",
      differently: "Decide what he wants and what changes when the door opens.",
      incomplete: "Nothing in the sequence resolves or escalates.",
    }),
    planQualityNotes: buildBadPlanQualityNotes({
      visualFailure: "The beats do not build on one another, so the animation would feel random.",
      strongerVersion: "Turn the door into a meaningful obstacle or reveal with a clear outcome.",
      weakerAlternative: "It is readable as movement, but not as a story sequence.",
    }),
    storyStructure: {
      hasClearGoal: false,
      hasConflict: false,
      hasEscalation: false,
      hasTurningPoint: false,
      hasResolution: false,
      characterChange: false,
    },
    tags: withV2BadTags("no-goal", "disconnected", "structure-failure"),
  }),
  createInactiveExample({
    id: "bad-instant-success-robot",
    category: "bad-instant-success-robot",
    userPrompt: "A student builds a robot and it works perfectly the first time.",
    story: "This is intentionally bad because it skips the failure pattern that makes invention payoffs feel earned.",
    knownFacts: ["A student builds a robot.", "The robot works immediately."],
    missingFacts: ["Any meaningful obstacle or failure."],
    rankedMissingFacts: ["Any meaningful obstacle or failure."],
    strongestGap: "Any meaningful obstacle or failure.",
    bestQuestion: null,
    acceptableOptions: [],
    badQuestions: [],
    reasoning:
      "This intentionally bad plan shows the wrong human expectation logic: viewers expect struggle before success, but the story gives a payoff with no buildup.",
    shouldPlanNow: true,
    shouldAskQuestion: false,
    storyHelpMode: "none",
    storyQualityNotes: buildBadStoryQualityNotes({
      bad: "The robot succeeds before the story creates tension.",
      expectsInstead: "The invention should fail, adapt, and finally solve something meaningful.",
      differently: "Add visible tests, setbacks, and a fix that pays off the failures.",
      incomplete: "The success has no emotional or structural weight.",
    }),
    planQualityNotes: buildBadPlanQualityNotes({
      visualFailure: "The sequence jumps from setup to payoff without a middle that earns it.",
      strongerVersion: "Use one or two failures to create pressure before the final success.",
      weakerAlternative: "It looks efficient, but it teaches the model to skip story tension.",
    }),
    storyStructure: {
      hasClearGoal: true,
      hasConflict: false,
      hasEscalation: false,
      hasTurningPoint: false,
      hasResolution: true,
      characterChange: false,
    },
    tags: withV2BadTags("robot", "invention", "failure-success"),
  }),
  createInactiveExample({
    id: "bad-door-is-the-climax",
    category: "bad-door-is-the-climax",
    userPrompt: "A student opens a hidden door, and that is the ending.",
    story: "This is intentionally bad because it confuses the threshold with the climax.",
    knownFacts: ["A hidden door opens."],
    missingFacts: ["What reveal or consequence follows."],
    rankedMissingFacts: ["What reveal or consequence follows."],
    strongestGap: "What reveal or consequence follows.",
    bestQuestion: null,
    acceptableOptions: [],
    badQuestions: [],
    reasoning:
      "This bad example teaches the wrong shape: humans expect the door to lead somewhere significant, but the story stops at the threshold.",
    shouldPlanNow: true,
    shouldAskQuestion: false,
    storyHelpMode: "none",
    storyQualityNotes: buildBadStoryQualityNotes({
      bad: "It treats the doorway itself as the whole payoff.",
      expectsInstead: "The door should launch a reveal, choice, or consequence.",
      differently: "Define what changes when the door opens and what the character does next.",
      incomplete: "The setup promises more than the ending delivers.",
    }),
    planQualityNotes: buildBadPlanQualityNotes({
      visualFailure: "The sequence peaks too early and has no aftermath beat.",
      strongerVersion: "Use the door as a threshold into the real climax.",
      weakerAlternative: "The reveal image exists, but the story payoff does not.",
    }),
    storyStructure: {
      hasClearGoal: true,
      hasConflict: true,
      hasEscalation: true,
      hasTurningPoint: false,
      hasResolution: false,
      characterChange: false,
    },
    tags: withV2BadTags("mystery", "threshold-not-payoff", "ending-failure"),
  }),
  createInactiveExample({
    id: "bad-generic-what-next",
    category: "bad-generic-what-next",
    userPrompt: "A notebook reveal scene is missing one key detail.",
    story: "This intentionally bad question example asks a vague follow-up instead of locking the strongest story gap.",
    knownFacts: ["A notebook reveal scene exists."],
    missingFacts: ["A precise reveal detail."],
    rankedMissingFacts: ["A precise reveal detail."],
    strongestGap: "A precise reveal detail.",
    bestQuestion: "What happens next?",
    acceptableOptions: [],
    badQuestions: ["What happens next?"],
    reasoning:
      "This is intentionally bad because humans expect one sharp question that shapes the payoff, but 'What happens next?' does not help the plan get stronger.",
    shouldPlanNow: false,
    shouldAskQuestion: true,
    storyHelpMode: "none",
    storyQualityNotes: buildBadStoryQualityNotes({
      bad: "The question is too broad to improve the story.",
      expectsInstead: "The model should ask for the exact reveal, choice, or conflict lock that matters most.",
      differently: "Target the notebook's missing payoff detail instead of using generic filler.",
      incomplete: "The user still has to do the real story-thinking after answering.",
    }),
    planQualityNotes: buildBadPlanQualityNotes({
      visualFailure: "A vague question does not protect the eventual reveal beat.",
      strongerVersion: "Ask what is on the page or why it changes the story.",
      weakerAlternative: "It sounds harmless, but it teaches low-quality clarification.",
    }),
    storyStructure: {
      hasClearGoal: true,
      hasConflict: true,
      hasEscalation: true,
      hasTurningPoint: false,
      hasResolution: false,
      characterChange: false,
    },
    tags: withV2BadTags("question-failure", "generic-question", "notebook"),
  }),
  createInactiveExample({
    id: "bad-asks-known-fact",
    category: "bad-asks-known-fact",
    userPrompt: "He hears the gym door open while he's setting up by himself. His coach walks in.",
    story: "This intentionally bad question asks for a fact the prompt already gives.",
    knownFacts: ["The coach walks in."],
    missingFacts: [],
    rankedMissingFacts: [],
    strongestGap: "",
    bestQuestion: "Who opens the gym door?",
    acceptableOptions: [],
    badQuestions: ["Who opens the gym door?"],
    reasoning:
      "This is intentionally bad because humans expect progress, not repetition. Asking for an already-known fact wastes the one chance to improve the plan.",
    shouldPlanNow: false,
    shouldAskQuestion: true,
    storyHelpMode: "none",
    storyQualityNotes: buildBadStoryQualityNotes({
      bad: "It ignores information the user already provided.",
      expectsInstead: "The question should target the strongest unresolved part of the scene.",
      differently: "Check known facts first and only ask what still changes the story.",
      incomplete: "The conversation stalls without learning anything useful.",
    }),
    planQualityNotes: buildBadPlanQualityNotes({
      visualFailure: "The follow-up does nothing to improve the next animation beat.",
      strongerVersion: "Either plan now or ask about what the coach wants, if that is the real gap.",
      weakerAlternative: "It sounds precise, but it trains the model to miss obvious context.",
    }),
    storyStructure: {
      hasClearGoal: true,
      hasConflict: true,
      hasEscalation: false,
      hasTurningPoint: false,
      hasResolution: false,
      characterChange: false,
    },
    tags: withV2BadTags("question-failure", "known-fact", "door-opener"),
  }),
  createInactiveExample({
    id: "bad-too-many-questions",
    category: "bad-too-many-questions",
    userPrompt: "A hidden page reveal is missing one strong detail.",
    story: "This intentionally bad example asks multiple clarifying questions when one sharp question would be enough.",
    knownFacts: ["The story needs one reveal detail."],
    missingFacts: ["One reveal lock."],
    rankedMissingFacts: ["One reveal lock."],
    strongestGap: "One reveal lock.",
    bestQuestion: "What is on the page, who drew it, and why does it matter?",
    acceptableOptions: [],
    badQuestions: ["What happens next?", "Where is he?"],
    reasoning:
      "This is intentionally bad because humans expect efficient guidance. Piling on multiple questions makes the story feel less confident instead of more precise.",
    shouldPlanNow: false,
    shouldAskQuestion: true,
    storyHelpMode: "none",
    storyQualityNotes: buildBadStoryQualityNotes({
      bad: "It turns one missing lock into a mini interview.",
      expectsInstead: "The model should pick the highest-leverage gap and ask only that.",
      differently: "Choose one answerable question that shapes the plan most.",
      incomplete: "The scene still lacks focus after the user responds.",
    }),
    planQualityNotes: buildBadPlanQualityNotes({
      visualFailure: "The workflow loses momentum before the plan even starts.",
      strongerVersion: "Ask only for the reveal detail that controls the payoff.",
      weakerAlternative: "It gathers more information, but at the cost of clarity and trust.",
    }),
    storyStructure: {
      hasClearGoal: true,
      hasConflict: true,
      hasEscalation: true,
      hasTurningPoint: false,
      hasResolution: false,
      characterChange: false,
    },
    tags: withV2BadTags("question-failure", "too-many-questions"),
  }),
  createInactiveExample({
    id: "bad-continuation-reset",
    category: "bad-continuation-reset",
    userPrompt: "Add a round kick after this punch.",
    story: "This intentionally bad continuation example restarts the entire fight instead of extending the existing combo.",
    knownFacts: ["The user wants one beat added after a punch."],
    missingFacts: [],
    rankedMissingFacts: [],
    strongestGap: "",
    bestQuestion: null,
    acceptableOptions: [],
    badQuestions: [],
    reasoning:
      "This is intentionally bad because humans expect continuity in an add-on request, but the plan throws away the existing action chain and starts over.",
    shouldPlanNow: true,
    shouldAskQuestion: false,
    storyHelpMode: "none",
    storyQualityNotes: buildBadStoryQualityNotes({
      bad: "It ignores the current sequence and resets the fight.",
      expectsInstead: "The new beat should continue directly from the punch that already exists.",
      differently: "Treat the kick as the next escalation inside the same combo.",
      incomplete: "The user asked for one more beat, but the answer rewrites the scene.",
    }),
    planQualityNotes: buildBadPlanQualityNotes({
      visualFailure: "The combo loses momentum because the plan restages everything.",
      strongerVersion: "Continue from the punch recovery into the round kick immediately.",
      weakerAlternative: "It may still be a fight, but it is not the requested continuation.",
    }),
    storyStructure: {
      hasClearGoal: true,
      hasConflict: true,
      hasEscalation: true,
      hasTurningPoint: true,
      hasResolution: false,
      characterChange: false,
    },
    tags: withV2BadTags("continuation", "reset", "fight"),
  }),
  createInactiveExample({
    id: "bad-improve-replaces-premise",
    category: "bad-improve-replaces-premise",
    userPrompt: "Improve this idea: a kid finds a weird marker in class.",
    story: "This intentionally bad improve example throws away the marker story and replaces it with an unrelated ghost plot.",
    knownFacts: ["The user wants the marker story improved."],
    missingFacts: [],
    rankedMissingFacts: [],
    strongestGap: "",
    bestQuestion: null,
    acceptableOptions: [],
    badQuestions: [],
    reasoning:
      "This is intentionally bad because humans expect improvement to preserve the core idea, but the answer replaces the premise instead of strengthening it.",
    shouldPlanNow: true,
    shouldAskQuestion: false,
    storyHelpMode: "improve",
    storyQualityNotes: buildBadStoryQualityNotes({
      bad: "It abandons the original premise instead of refining it.",
      expectsInstead: "The same marker should stay central while the conflict and payoff get stronger.",
      differently: "Keep the marker and improve its conflict engine or ending.",
      incomplete: "The answer may be a story, but it is not the user's story.",
    }),
    planQualityNotes: buildBadPlanQualityNotes({
      visualFailure: "The resulting plan may be clear, but it violates the improvement task.",
      strongerVersion: "Preserve the marker and sharpen the cause-and-effect around it.",
      weakerAlternative: "It feels creative, but it teaches the wrong decision rule.",
    }),
    storyStructure: {
      hasClearGoal: true,
      hasConflict: true,
      hasEscalation: true,
      hasTurningPoint: true,
      hasResolution: true,
      characterChange: true,
    },
    tags: withV2BadTags("improve", "preserve-identity", "replacement-failure"),
  }),
  createInactiveExample({
    id: "bad-simple-request-overbuild",
    category: "bad-simple-request-overbuild",
    userPrompt: "Give me a short simple animation idea.",
    story: "This intentionally bad create example answers a simple request with a sprawling cinematic outline.",
    knownFacts: ["The user asked for something short and simple."],
    missingFacts: [],
    rankedMissingFacts: [],
    strongestGap: "",
    bestQuestion: null,
    acceptableOptions: [],
    badQuestions: [],
    reasoning:
      "This is intentionally bad because humans expect concise, drawable clarity for a simple ask, but the answer overbuilds and ignores scale control.",
    shouldPlanNow: true,
    shouldAskQuestion: false,
    storyHelpMode: "create",
    storyQualityNotes: buildBadStoryQualityNotes({
      bad: "It mismatches the request scale and feels bloated.",
      expectsInstead: "A short request should get one clean idea or a few compact options.",
      differently: "Limit the beat count and avoid cinematic sprawl.",
      incomplete: "The answer has ideas, but it does not solve the user's real need.",
    }),
    planQualityNotes: buildBadPlanQualityNotes({
      visualFailure: "Too many beats make the plan harder, not better, to animate quickly.",
      strongerVersion: "Give one simple, punchy plan with a clear ending image.",
      weakerAlternative: "It sounds ambitious, but it is the wrong scale.",
    }),
    storyStructure: {
      hasClearGoal: true,
      hasConflict: true,
      hasEscalation: true,
      hasTurningPoint: true,
      hasResolution: true,
      characterChange: false,
    },
    tags: withV2BadTags("simple-request", "scale-failure", "create-story"),
  }),
  createInactiveExample({
    id: "bad-emotional-to-fight",
    category: "bad-emotional-to-fight",
    userPrompt: "I want a reunion story between two siblings.",
    story: "This intentionally bad example hijacks an emotional reunion prompt into a combat scene.",
    knownFacts: ["The user wants a reunion between siblings."],
    missingFacts: [],
    rankedMissingFacts: [],
    strongestGap: "",
    bestQuestion: null,
    acceptableOptions: [],
    badQuestions: [],
    reasoning:
      "This is intentionally bad because humans expect the scene type to stay emotional, but the answer changes the genre instead of strengthening the relationship arc.",
    shouldPlanNow: true,
    shouldAskQuestion: false,
    storyHelpMode: "create",
    storyQualityNotes: buildBadStoryQualityNotes({
      bad: "It ignores the requested emotional mode.",
      expectsInstead: "A reunion story should focus on the wound, pressure, choice, and repair.",
      differently: "Keep the tension relational and let the ending change the relationship.",
      incomplete: "The answer may have energy, but it fails the requested emotional payoff.",
    }),
    planQualityNotes: buildBadPlanQualityNotes({
      visualFailure: "The beats are readable, but they are the wrong beats for the ask.",
      strongerVersion: "Use distance, hesitation, and a final act of care instead of combat.",
      weakerAlternative: "It adds motion at the cost of the actual prompt.",
    }),
    storyStructure: {
      hasClearGoal: true,
      hasConflict: true,
      hasEscalation: true,
      hasTurningPoint: true,
      hasResolution: true,
      characterChange: false,
    },
    tags: withV2BadTags("emotional", "scene-type-failure", "reunion"),
  }),
  createInactiveExample({
    id: "bad-lore-over-beats",
    category: "bad-lore-over-beats",
    userPrompt: "Plan this mystery animation.",
    story: "This intentionally bad example answers with lore and backstory instead of visual beats.",
    knownFacts: ["The user wants a mystery animation plan."],
    missingFacts: [],
    rankedMissingFacts: [],
    strongestGap: "",
    bestQuestion: null,
    acceptableOptions: [],
    badQuestions: [],
    reasoning:
      "This is intentionally bad because humans expect animation-ready sequence planning, but the answer disappears into lore and abstract explanation.",
    shouldPlanNow: true,
    shouldAskQuestion: false,
    storyHelpMode: "none",
    storyQualityNotes: buildBadStoryQualityNotes({
      bad: "It explains the world instead of moving the story.",
      expectsInstead: "A plan should define what happens first, next, and last in visible beats.",
      differently: "Translate the mystery into clue, reaction, reveal, and consequence beats.",
      incomplete: "The audience learns about the world but not the sequence.",
    }),
    planQualityNotes: buildBadPlanQualityNotes({
      visualFailure: "The response cannot hand off cleanly into animation.",
      strongerVersion: "Use concise beat structure with staging and escalation.",
      weakerAlternative: "The prose may sound rich, but it is not useful for planning.",
    }),
    storyStructure: {
      hasClearGoal: true,
      hasConflict: true,
      hasEscalation: false,
      hasTurningPoint: false,
      hasResolution: false,
      characterChange: false,
    },
    tags: withV2BadTags("animation-failure", "abstract", "mystery"),
  }),
  createInactiveExample({
    id: "bad-marker-no-problem",
    category: "bad-marker-no-problem",
    userPrompt: "A kid finds a weird marker in class.",
    story: "This intentionally bad example keeps the marker as flavor but never lets it create pressure.",
    knownFacts: ["A kid finds a weird marker."],
    missingFacts: ["A conflict engine."],
    rankedMissingFacts: ["A conflict engine."],
    strongestGap: "A conflict engine.",
    bestQuestion: null,
    acceptableOptions: [],
    badQuestions: [],
    reasoning:
      "This is intentionally bad because humans expect the strange object to change events, but the marker never drives the story at all.",
    shouldPlanNow: true,
    shouldAskQuestion: false,
    storyHelpMode: "create",
    storyQualityNotes: buildBadStoryQualityNotes({
      bad: "The hook stays decorative instead of becoming the story engine.",
      expectsInstead: "The marker should trigger trouble, truth, or urgency.",
      differently: "Make the marker's effect drive the middle and the ending.",
      incomplete: "The premise starts strong but has no engine for escalation.",
    }),
    planQualityNotes: buildBadPlanQualityNotes({
      visualFailure: "The sequence has no clear cause-and-effect path tied to the object.",
      strongerVersion: "Give the marker one specific power or consequence that shapes every beat.",
      weakerAlternative: "It preserves the object, but not the story potential inside it.",
    }),
    storyStructure: {
      hasClearGoal: true,
      hasConflict: false,
      hasEscalation: false,
      hasTurningPoint: false,
      hasResolution: false,
      characterChange: false,
    },
    tags: withV2BadTags("marker", "no-conflict", "story-engine-failure"),
  }),
  createInactiveExample({
    id: "bad-chase-no-escalation",
    category: "bad-chase-no-escalation",
    userPrompt: "A runner chases someone through the city.",
    story: "This intentionally bad chase repeats the same movement without changing the route or pressure.",
    knownFacts: ["A city chase exists."],
    missingFacts: ["Meaningful obstacle escalation."],
    rankedMissingFacts: ["Meaningful obstacle escalation."],
    strongestGap: "Meaningful obstacle escalation.",
    bestQuestion: null,
    acceptableOptions: [],
    badQuestions: [],
    reasoning:
      "This is intentionally bad because humans expect a chase to get harder, but the sequence only repeats speed without adding structure.",
    shouldPlanNow: true,
    shouldAskQuestion: false,
    storyHelpMode: "none",
    storyQualityNotes: buildBadStoryQualityNotes({
      bad: "The chase keeps moving but never meaningfully climbs.",
      expectsInstead: "The route, risk, or urgency should change as the chase continues.",
      differently: "Add obstacle variety and one risky adaptation before the finish.",
      incomplete: "The ending arrives without an earned middle.",
    }),
    planQualityNotes: buildBadPlanQualityNotes({
      visualFailure: "The animation would feel repetitive because each beat looks and functions the same.",
      strongerVersion: "Use crowding, blocked routes, height changes, or timing pressure to escalate.",
      weakerAlternative: "It has energy, but no real progression.",
    }),
    storyStructure: {
      hasClearGoal: true,
      hasConflict: true,
      hasEscalation: false,
      hasTurningPoint: false,
      hasResolution: true,
      characterChange: false,
    },
    tags: withV2BadTags("chase", "no-escalation", "middle-failure"),
  }),
  createInactiveExample({
    id: "bad-reunion-no-decision",
    category: "bad-reunion-no-decision",
    userPrompt: "Two people see each other again after years apart.",
    story: "This intentionally bad reunion example reaches the meeting but avoids a real decision or change.",
    knownFacts: ["A reunion happens."],
    missingFacts: ["The choice or gesture that changes the relationship."],
    rankedMissingFacts: ["The choice or gesture that changes the relationship."],
    strongestGap: "The choice or gesture that changes the relationship.",
    bestQuestion: null,
    acceptableOptions: [],
    badQuestions: [],
    reasoning:
      "This is intentionally bad because humans expect the reunion to change something, but the scene stops at recognition with no actual payoff.",
    shouldPlanNow: true,
    shouldAskQuestion: false,
    storyHelpMode: "none",
    storyQualityNotes: buildBadStoryQualityNotes({
      bad: "The reunion lands visually but not emotionally.",
      expectsInstead: "A reunion should include a gesture, confession, or choice that changes the relationship.",
      differently: "Add one decisive act before the final image.",
      incomplete: "The meeting happens, but the audience never sees what it means.",
    }),
    planQualityNotes: buildBadPlanQualityNotes({
      visualFailure: "The scene peaks at the wrong moment and has no emotional aftermath.",
      strongerVersion: "Use the reunion image as setup for the real payoff action.",
      weakerAlternative: "It looks emotional, but it is structurally unfinished.",
    }),
    storyStructure: {
      hasClearGoal: true,
      hasConflict: true,
      hasEscalation: true,
      hasTurningPoint: false,
      hasResolution: false,
      characterChange: false,
    },
    tags: withV2BadTags("reunion", "ending-failure", "emotional"),
  }),
  createInactiveExample({
    id: "bad-random-final-villain",
    category: "bad-random-final-villain",
    userPrompt: "An invention story suddenly reveals a villain in the last beat.",
    story: "This intentionally bad example adds a twist with no setup connection.",
    knownFacts: ["The story already had a different premise.", "A villain appears only at the end."],
    missingFacts: ["A climax tied to the existing conflict."],
    rankedMissingFacts: ["A climax tied to the existing conflict."],
    strongestGap: "A climax tied to the existing conflict.",
    bestQuestion: null,
    acceptableOptions: [],
    badQuestions: [],
    reasoning:
      "This is intentionally bad because humans expect payoff from setup, but the final villain twist arrives from nowhere and steals the story's existing engine.",
    shouldPlanNow: true,
    shouldAskQuestion: false,
    storyHelpMode: "none",
    storyQualityNotes: buildBadStoryQualityNotes({
      bad: "The ending ignores what the story was building toward.",
      expectsInstead: "The climax should pay off the machine, relationship, or mystery already in play.",
      differently: "Use the established conflict to create the final problem.",
      incomplete: "The last beat surprises, but not in a satisfying way.",
    }),
    planQualityNotes: buildBadPlanQualityNotes({
      visualFailure: "The twist may be flashy, but it breaks cause-and-effect.",
      strongerVersion: "Build the climax from the invention's earlier failures or consequences.",
      weakerAlternative: "It feels dramatic, but it teaches random storytelling.",
    }),
    storyStructure: {
      hasClearGoal: true,
      hasConflict: true,
      hasEscalation: true,
      hasTurningPoint: false,
      hasResolution: false,
      characterChange: false,
    },
    tags: withV2BadTags("twist-failure", "invention", "cause-effect-break"),
  }),
  createInactiveExample({
    id: "bad-mystery-no-turn",
    category: "bad-mystery-no-turn",
    userPrompt: "A mystery where clues appear, but nothing really changes.",
    story: "This intentionally bad mystery keeps adding clues without ever reaching a change point.",
    knownFacts: ["There are clues."],
    missingFacts: ["A turning-point reveal or decision."],
    rankedMissingFacts: ["A turning-point reveal or decision."],
    strongestGap: "A turning-point reveal or decision.",
    bestQuestion: null,
    acceptableOptions: [],
    badQuestions: [],
    reasoning:
      "This is intentionally bad because humans expect clues to shift the story, but here the mystery stays flat from beginning to end.",
    shouldPlanNow: true,
    shouldAskQuestion: false,
    storyHelpMode: "none",
    storyQualityNotes: buildBadStoryQualityNotes({
      bad: "The clues never reframe anything or force a new choice.",
      expectsInstead: "A mystery should reach a reveal that changes what the protagonist must do.",
      differently: "Let one clue create a decisive turn instead of more of the same.",
      incomplete: "The setup promises discovery, but the story never truly discovers anything.",
    }),
    planQualityNotes: buildBadPlanQualityNotes({
      visualFailure: "The sequence would feel repetitive because every clue does the same job.",
      strongerVersion: "Use one clue to change the direction and raise the stakes sharply.",
      weakerAlternative: "It can look mysterious moment to moment, but it does not build.",
    }),
    storyStructure: {
      hasClearGoal: true,
      hasConflict: true,
      hasEscalation: false,
      hasTurningPoint: false,
      hasResolution: false,
      characterChange: false,
    },
    tags: withV2BadTags("mystery", "no-turning-point", "flat-escalation"),
  }),
  createInactiveExample({
    id: "bad-failure-no-payoff",
    category: "bad-failure-no-payoff",
    userPrompt: "A character keeps failing, then the story just ends on another failure.",
    story: "This intentionally bad arc uses repetition without reward or meaningful transformation.",
    knownFacts: ["There are repeated failures."],
    missingFacts: ["Either an earned success or a meaningful changed ending."],
    rankedMissingFacts: ["Either an earned success or a meaningful changed ending."],
    strongestGap: "Either an earned success or a meaningful changed ending.",
    bestQuestion: null,
    acceptableOptions: [],
    badQuestions: [],
    reasoning:
      "This is intentionally bad because humans expect repeated setbacks to lead somewhere, but the story ends without payoff or transformation.",
    shouldPlanNow: true,
    shouldAskQuestion: false,
    storyHelpMode: "none",
    storyQualityNotes: buildBadStoryQualityNotes({
      bad: "The failures accumulate without earning anything.",
      expectsInstead: "The ending should reward persistence, insight, or emotional growth.",
      differently: "Let the final failure teach something that changes the outcome or the character.",
      incomplete: "The arc feels pointless instead of tragic or earned.",
    }),
    planQualityNotes: buildBadPlanQualityNotes({
      visualFailure: "The sequence builds pressure but then drops it without release.",
      strongerVersion: "Use the last setback to launch either the final fix or a meaningful emotional turn.",
      weakerAlternative: "It avoids cliche success, but not in a satisfying way.",
    }),
    storyStructure: {
      hasClearGoal: true,
      hasConflict: true,
      hasEscalation: true,
      hasTurningPoint: false,
      hasResolution: false,
      characterChange: false,
    },
    tags: withV2BadTags("failure-success", "no-payoff", "ending-failure"),
  }),
  createInactiveExample({
    id: "bad-create-vibe-options",
    category: "bad-create-vibe-options",
    userPrompt: "Give me some story ideas.",
    story: "This intentionally bad create-mode example returns three vibes instead of complete options.",
    knownFacts: ["The user wants ideas."],
    missingFacts: ["Complete story structure in each option."],
    rankedMissingFacts: ["Complete story structure in each option."],
    strongestGap: "Complete story structure in each option.",
    bestQuestion: null,
    acceptableOptions: [],
    badQuestions: [],
    reasoning:
      "This is intentionally bad because humans expect usable options, but the answer offers moods with no goals, conflicts, or endings.",
    shouldPlanNow: true,
    shouldAskQuestion: false,
    storyHelpMode: "create",
    storyQualityNotes: buildBadStoryQualityNotes({
      bad: "The ideas are too vague to choose or plan from.",
      expectsInstead: "Each option should contain a complete arc and a reason it would work well.",
      differently: "Give structured options and clearly recommend the strongest one.",
      incomplete: "The options sound interesting but do not solve the ideation task.",
    }),
    planQualityNotes: buildBadPlanQualityNotes({
      visualFailure: "No option can hand off into a real plan because none has a structure.",
      strongerVersion: "Provide goals, conflict, escalation, turning point, and resolution for each option.",
      weakerAlternative: "It feels creative, but it is operationally useless.",
    }),
    storyStructure: {
      hasClearGoal: false,
      hasConflict: false,
      hasEscalation: false,
      hasTurningPoint: false,
      hasResolution: false,
      characterChange: false,
    },
    tags: withV2BadTags("create-story", "options-failure", "exploratory-request"),
  }),
  createInactiveExample({
    id: "bad-broad-improve-question",
    category: "bad-broad-improve-question",
    userPrompt: "The notebook mystery is good until the reveal.",
    story: "This intentionally bad improve example asks a broad genre question when only the reveal is missing.",
    knownFacts: ["The notebook mystery already exists.", "The reveal is the weak part."],
    missingFacts: ["The exact reveal."],
    rankedMissingFacts: ["The exact reveal."],
    strongestGap: "The exact reveal.",
    bestQuestion: "What kind of story do you want?",
    acceptableOptions: [],
    badQuestions: ["What kind of story do you want?"],
    reasoning:
      "This is intentionally bad because humans expect the most precise repair question, but the model zooms out and ignores the strongest gap in front of it.",
    shouldPlanNow: false,
    shouldAskQuestion: true,
    storyHelpMode: "improve",
    storyQualityNotes: buildBadStoryQualityNotes({
      bad: "The question is far broader than the actual problem.",
      expectsInstead: "The model should ask for the missing reveal or ending choice specifically.",
      differently: "Target the broken beat instead of reopening the whole concept.",
      incomplete: "The user has to re-explain the whole story even though only one piece is missing.",
    }),
    planQualityNotes: buildBadPlanQualityNotes({
      visualFailure: "The follow-up slows the process without improving the actual weak beat.",
      strongerVersion: "Ask what the notebook reveal should be or what consequence it causes.",
      weakerAlternative: "It sounds open-minded, but it is low-leverage.",
    }),
    storyStructure: {
      hasClearGoal: true,
      hasConflict: true,
      hasEscalation: true,
      hasTurningPoint: false,
      hasResolution: false,
      characterChange: false,
    },
    tags: withV2BadTags("improve", "question-failure", "broad-question"),
  }),
  createInactiveExample({
    id: "bad-abstract-plan",
    category: "bad-abstract-plan",
    userPrompt: "Plan this animation story.",
    story: "This intentionally bad example says the story 'gets intense and dramatic' without ever becoming a usable sequence.",
    knownFacts: ["The user wants a plan."],
    missingFacts: ["Actual sequence beats."],
    rankedMissingFacts: ["Actual sequence beats."],
    strongestGap: "Actual sequence beats.",
    bestQuestion: null,
    acceptableOptions: [],
    badQuestions: [],
    reasoning:
      "This is intentionally bad because humans expect actionable sequencing, but the response stays abstract and cannot hand off to animation.",
    shouldPlanNow: true,
    shouldAskQuestion: false,
    storyHelpMode: "none",
    storyQualityNotes: buildBadStoryQualityNotes({
      bad: "The answer describes a feeling instead of a story progression.",
      expectsInstead: "A plan should name the setup, escalation, turning point, and ending in visible beats.",
      differently: "Translate the emotion into actions and consequences.",
      incomplete: "The idea has tone but no structure.",
    }),
    planQualityNotes: buildBadPlanQualityNotes({
      visualFailure: "There is nothing concrete enough to stage or draw.",
      strongerVersion: "Write beat-by-beat actions with clear transitions and payoff.",
      weakerAlternative: "It may sound polished, but it is not operational.",
    }),
    storyStructure: {
      hasClearGoal: false,
      hasConflict: false,
      hasEscalation: false,
      hasTurningPoint: false,
      hasResolution: false,
      characterChange: false,
    },
    tags: withV2BadTags("abstract", "plan-failure", "animation-failure"),
  }),
  createInactiveExample({
    id: "bad-explosion-no-consequence",
    category: "bad-explosion-no-consequence",
    userPrompt: "There is an explosion reveal, then everyone just moves on.",
    story: "This intentionally bad reveal uses spectacle without aftermath.",
    knownFacts: ["An explosion reveal occurs."],
    missingFacts: ["A visible consequence."],
    rankedMissingFacts: ["A visible consequence."],
    strongestGap: "A visible consequence.",
    bestQuestion: null,
    acceptableOptions: [],
    badQuestions: [],
    reasoning:
      "This is intentionally bad because humans expect an explosion to change the scene, but the story spends the payoff and then refuses to cash it in.",
    shouldPlanNow: true,
    shouldAskQuestion: false,
    storyHelpMode: "none",
    storyQualityNotes: buildBadStoryQualityNotes({
      bad: "The reveal has impact but no consequence.",
      expectsInstead: "The blast should alter stakes, space, or character decisions.",
      differently: "Show what the explosion exposes, damages, or forces next.",
      incomplete: "The scene peaks visually but not narratively.",
    }),
    planQualityNotes: buildBadPlanQualityNotes({
      visualFailure: "The aftermath beat is missing, so the explosion feels hollow.",
      strongerVersion: "Follow the blast with smoke-clear, reaction, and changed-stakes beats.",
      weakerAlternative: "It is flashy, but it teaches empty spectacle.",
    }),
    storyStructure: {
      hasClearGoal: true,
      hasConflict: true,
      hasEscalation: true,
      hasTurningPoint: true,
      hasResolution: false,
      characterChange: false,
    },
    tags: withV2BadTags("reveal", "no-consequence", "spectacle-failure"),
  }),
  createInactiveExample({
    id: "bad-random-disconnected-scenes",
    category: "bad-random-disconnected-scenes",
    userPrompt: "A key, a chase, a friend argument, and a funny hallway moment all happen in one short story.",
    story: "This intentionally bad example piles scenes together without one causal engine or payoff spine.",
    knownFacts: ["Multiple scene ideas exist."],
    missingFacts: ["One main story engine."],
    rankedMissingFacts: ["One main story engine."],
    strongestGap: "One main story engine.",
    bestQuestion: null,
    acceptableOptions: [],
    badQuestions: [],
    reasoning:
      "This is intentionally bad because humans expect one main arc to connect the beats, but the story keeps changing subjects instead of building cause and effect.",
    shouldPlanNow: true,
    shouldAskQuestion: false,
    storyHelpMode: "create",
    storyQualityNotes: buildBadStoryQualityNotes({
      bad: "The scenes compete instead of building on one another.",
      expectsInstead: "Each beat should grow from the same goal, conflict, or reveal.",
      differently: "Choose one central story engine and make the other beats support it.",
      incomplete: "The story feels busy but not whole.",
    }),
    planQualityNotes: buildBadPlanQualityNotes({
      visualFailure: "The sequence keeps resetting tone and objective, so the animation loses momentum.",
      strongerVersion: "Pick one hook, then let every later beat escalate or resolve it.",
      weakerAlternative: "It has variety, but not narrative connection.",
    }),
    storyStructure: {
      hasClearGoal: false,
      hasConflict: false,
      hasEscalation: false,
      hasTurningPoint: false,
      hasResolution: false,
      characterChange: false,
    },
    tags: withV2BadTags("disconnected", "cause-effect-break", "random-scenes"),
  }),
];

export const GENERATE_PLANS_REFERENCE_EXAMPLES = [
  ...CURATED_V2_GOOD_EXAMPLES.map(elevateActiveV2Example),
  ...CURATED_V2_BAD_EXAMPLES.map(elevateInactiveV2Example),
];

export const GENERATE_PLANS_LLM_TRAINING_EXAMPLES = GENERATE_PLANS_REFERENCE_EXAMPLES.filter(
  (example) => example.isActive,
);

export const selectRelevantGeneratePlansExamples = ({
  examples = GENERATE_PLANS_LLM_TRAINING_EXAMPLES,
  userMessage,
  analysisInput,
  limit = 6,
}: {
  examples?: GeneratePlansExample[];
  userMessage: string;
  analysisInput: string;
  limit?: number;
}) => {
  const rankedExamples = examples
    .filter((example) => example.isActive)
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

  const selected: GeneratePlansExample[] = [];
  const seenCategories = new Set<string>();
  const repeatableCategories = new Set([
    "messy-input-default",
    "messy-plan-upgrade",
    "plan-refinement",
    "frames-handoff",
    "partial-plan-edit",
    "continuation-narrow-question",
    "collaborative-story-help",
    "simple-request",
    "scale-control",
    "improve-mode",
    "quality-judgment",
    "preserve-identity",
  ]);

  for (const { example } of rankedExamples) {
    if (selected.length >= limit) {
      break;
    }

    const alreadyHaveCategory = seenCategories.has(example.category);
    if (alreadyHaveCategory && !repeatableCategories.has(example.category) && selected.length < Math.max(2, limit - 1)) {
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

const formatStoryStructureSignals = (storyStructure: GeneratePlansStoryStructure | undefined) => {
  if (!storyStructure) {
    return "(not specified)";
  }

  const parts = [
    `goal=${storyStructure.hasClearGoal === true ? "yes" : storyStructure.hasClearGoal === false ? "no" : "?"}`,
    `conflict=${storyStructure.hasConflict === true ? "yes" : storyStructure.hasConflict === false ? "no" : "?"}`,
    `escalation=${storyStructure.hasEscalation === true ? "yes" : storyStructure.hasEscalation === false ? "no" : "?"}`,
    `turning-point=${storyStructure.hasTurningPoint === true ? "yes" : storyStructure.hasTurningPoint === false ? "no" : "?"}`,
    `resolution=${storyStructure.hasResolution === true ? "yes" : storyStructure.hasResolution === false ? "no" : "?"}`,
    `change=${storyStructure.characterChange === true ? "yes" : storyStructure.characterChange === false ? "no" : "?"}`,
  ];

  return parts.join(" | ");
};

const formatStoryOptionsForPrompt = (storyOptions: GeneratePlansStoryOption[] | undefined) => {
  if (!storyOptions || storyOptions.length === 0) {
    return "(none)";
  }

  return storyOptions
    .slice(0, 5)
    .map((option, index) => {
      const label = option.isRecommended ? "Chosen internal direction" : `Alternate internal direction ${index + 1}`;
      return `${label}: ${option.title} | Actor focus: ${option.character} | Execution goal: ${option.goal} | Blocking force: ${option.conflict} | Escalation: ${option.escalation} | Turning point: ${option.turningPoint} | Final result: ${option.resolution}`;
    })
    .join(" || ");
};

const formatPrefixedNoteValueForPrompt = (notes: string[] | undefined, prefixes: readonly string[]) =>
  getFirstPrefixedNoteValue(notes, prefixes) || "(none)";

const formatStoryHelpModeForPrompt = (mode: GeneratePlansStoryHelpMode) => {
  switch (mode) {
    case "create":
      return "establish-execution-direction";
    case "improve":
      return "upgrade-existing-sequence";
    default:
      return "direct-engine-plan";
  }
};

export const formatGeneratePlansExamplesForPrompt = (examples: GeneratePlansExample[]) =>
  examples
    .map((example, index) => {
      const lines = [
        `Example ${index + 1}: ${example.category}`,
        `User prompt: ${example.userPrompt}`,
        `Planning context (source only, not output tone): ${normalizeLegacyExecutionWording(example.story)}`,
        `Known facts: ${example.knownFacts.map(normalizeLegacyExecutionWording).join(" | ") || "(none)"}`,
        `Missing facts: ${example.missingFacts.map(normalizeLegacyExecutionWording).join(" | ") || "(none)"}`,
        `Missing lock: ${normalizeLegacyExecutionWording(example.strongestGap) || "(none)"}`,
        `Decision: ask=${example.shouldAskQuestion ? "yes" : "no"} | plan=${example.shouldPlanNow ? "yes" : "no"} | planning-mode=${formatStoryHelpModeForPrompt(example.storyHelpMode)} | enough-known=${example.enoughKnownToPlan ? "yes" : "no"} | max-questions=${example.maxQuestionsBeforePlanning ?? "(default)"}`,
        `Execution structure: ${formatStoryStructureSignals(example.storyStructure)}`,
        `Execution lock question: ${normalizeQuestionForExecutionFocus(example.bestQuestion) ?? "(plan now)"}`,
        `Internal direction candidates (choose one only; final output stays one JSON actions payload): ${formatStoryOptionsForPrompt(example.storyOptions)}`,
        `Avoid questions: ${normalizeQuestionListForExecutionFocus(example.badQuestions).join(" | ") || "(none)"}`,
        'Final output contract: {"actions":[{"type":"...","target":"...","parameters":{...}}]}',
        `Internal thinking - execution summary: ${normalizeLegacyExecutionWording(
          formatPrefixedNoteValueForPrompt(example.storyQualityNotes, [
            INTERNAL_THINKING_PREFIXES.summary,
            "Internal thinking - summary: ",
          ]),
        )}`,
        `Internal thinking - human expectation: ${normalizeLegacyExecutionWording(
          formatPrefixedNoteValueForPrompt(example.storyQualityNotes, [
            INTERNAL_THINKING_PREFIXES.humanExpectation,
            "Human expects: ",
            "Human expects instead: ",
          ]),
        )}`,
        `Internal thinking - real intent: ${normalizeLegacyExecutionWording(
          formatPrefixedNoteValueForPrompt(example.storyQualityNotes, [INTERNAL_THINKING_PREFIXES.realIntent]),
        )}`,
        `Internal thinking - strongest outcome: ${normalizeLegacyExecutionWording(
          formatPrefixedNoteValueForPrompt(example.storyQualityNotes, [
            INTERNAL_THINKING_PREFIXES.strongestOutcome,
            "Feels satisfying when: ",
            "Best version because: ",
          ]),
        )}`,
        `Internal thinking - weak/wrong: ${normalizeLegacyExecutionWording(
          formatPrefixedNoteValueForPrompt(example.storyQualityNotes, [
            INTERNAL_THINKING_PREFIXES.weakOrWrong,
            "Feels wrong when: ",
            "Feels incomplete when: ",
            "Feels incomplete because: ",
            "Why this is bad: ",
            "Should be done differently: ",
          ]),
        )}`,
        `Output direction - immediate command step: ${normalizeLegacyExecutionWording(
          formatPrefixedNoteValueForPrompt(example.planQualityNotes, [
            OUTPUT_DIRECTION_PREFIXES.immediateAction,
            "Output direction - immediate action: ",
          ]),
        )}`,
        `Output direction - ordered sequence: ${normalizeLegacyExecutionWording(
          formatPrefixedNoteValueForPrompt(example.planQualityNotes, [
            OUTPUT_DIRECTION_PREFIXES.sequence,
            "Output direction - sequence: ",
            "Clear animation moment when: ",
          ]),
        )}`,
        `Output direction - why this order: ${normalizeLegacyExecutionWording(
          formatPrefixedNoteValueForPrompt(example.planQualityNotes, [
            OUTPUT_DIRECTION_PREFIXES.orderWhy,
            "Output direction - why this order: ",
            "Best plan because: ",
            "Stronger than alternatives because: ",
            "Visually strong because: ",
            "A stronger version would: ",
          ]),
        )}`,
        `Output direction - engine execution target: ${normalizeLegacyExecutionWording(
          formatPrefixedNoteValueForPrompt(example.planQualityNotes, [
            OUTPUT_DIRECTION_PREFIXES.engineExecution,
            "Output direction - future engine target: ",
          ]),
        )}`,
        `Output direction - final visual payoff: ${normalizeLegacyExecutionWording(
          formatPrefixedNoteValueForPrompt(example.planQualityNotes, [
            OUTPUT_DIRECTION_PREFIXES.finalPayoff,
            "Strong final frame because: ",
          ]),
        )}`,
        `Output direction - continuation lock: ${normalizeLegacyExecutionWording(
          formatPrefixedNoteValueForPrompt(example.planQualityNotes, [
            OUTPUT_DIRECTION_PREFIXES.continuationRule,
            "Output direction - continuation rule: ",
          ]),
        )}`,
        `Weak behavior to avoid: ${example.badStyleNotes?.map(normalizeLegacyExecutionWording).join(" | ") || "(none)"}`,
      ];

      return lines.join("\n");
    })
    .join("\n\n");
