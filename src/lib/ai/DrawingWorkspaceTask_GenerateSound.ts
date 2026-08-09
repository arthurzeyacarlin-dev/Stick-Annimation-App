import type { DrawingAiConversationMessage, DrawingAiTaskIntentExample } from "./drawingAiContract";

const TRAINING_VERSION = 4;

export type GenerateSoundExampleKind = "good" | "bad";

export type GenerateSoundFamily =
  | "explosion"
  | "lightning"
  | "fireball-projectile"
  | "punch-impact"
  | "kick-impact"
  | "body-impact"
  | "footsteps"
  | "breathing"
  | "environment-ambience"
  | "whoosh-swing"
  | "background-action-support"
  | "magical-energy"
  | "scene-addition"
  | "continuation"
  | "ui-tech"
  | "door-mechanical"
  | "vehicle-pass"
  | "voice-placeholder";

export type GenerateSoundRequestMode = "single-sound" | "options" | "revision" | "continuation" | "timing-lock";
export type GenerateSoundAmbiguityPolicy = "proceed" | "ask-clarify";
export type GenerateSoundStructureKind =
  | "single-hit"
  | "short-effect"
  | "layered-bed"
  | "multi-beat-sequence"
  | "continuation";

export type GenerateSoundThinkingIntent = {
  requestMode: GenerateSoundRequestMode;
  interpretation: string[];
  animationExpectation: string[];
  ambiguityPolicy: GenerateSoundAmbiguityPolicy;
};

export type GenerateSoundPlan = {
  structureKind: GenerateSoundStructureKind;
  beats: string[];
};

export type GenerateSoundExample = {
  id: string;
  mode: "generate-sounds";
  exampleKind: GenerateSoundExampleKind;
  category: string;
  userPrompt: string;
  requestSummary: string;
  soundFamily: GenerateSoundFamily;
  thinkingIntent: GenerateSoundThinkingIntent;
  soundPlan: GenerateSoundPlan;
  goodOutputDescription: string[];
  badOutputDescription: string[];
  constraints: string[];
  sequenceTimingNotes: string[];
  soundIntent: string;
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
  soundQualityNotes: string[];
  badStyleNotes: string[];
  tags: string[];
  version: number;
  isActive: boolean;
};

type StructuredSoundExampleInput = {
  id: string;
  category: string;
  userPrompt: string;
  requestSummary: string;
  soundFamily: GenerateSoundFamily;
  thinkingIntent: GenerateSoundThinkingIntent;
  soundPlan: GenerateSoundPlan;
  goodOutputDescription: string[];
  badOutputDescription: string[];
  constraints?: string[];
  sequenceTimingNotes?: string[];
  tags?: string[];
  knownFacts?: string[];
  missingFacts?: string[];
  strongestGap?: string;
  bestQuestion?: string | null;
  acceptableOptions?: string[];
  badQuestions?: string[];
  reasoning?: string;
  shouldAskQuestion?: boolean;
  shouldProceedWithoutQuestion?: boolean;
  maxQuestionsBeforeProceeding?: number;
  responseFocus?: string[];
  consistencyRules?: string[];
  soundQualityNotes?: string[];
  badStyleNotes?: string[];
};

const SOUND_FAMILY_TAGS: Record<GenerateSoundFamily, string[]> = {
  explosion: ["explosion", "blast"],
  lightning: ["thunder", "electricity", "storm", "lightning", "zap"],
  "fireball-projectile": ["fire", "magic", "energy", "projectile"],
  "punch-impact": ["punch", "impact"],
  "kick-impact": ["kick", "impact"],
  "body-impact": ["impact", "fall then impact", "body-hit"],
  footsteps: ["footsteps", "movement"],
  breathing: ["breathing", "breath", "character"],
  "environment-ambience": ["background", "environmental", "room", "hallway"],
  "whoosh-swing": ["whoosh", "motion", "sword"],
  "background-action-support": ["background", "debris", "environmental"],
  "magical-energy": ["magic", "spell", "energy", "portal"],
  "scene-addition": ["continuation", "layered", "scene"],
  continuation: ["continuation", "same-family", "follow-up"],
  "ui-tech": ["ui", "button", "ui-beep"],
  "door-mechanical": ["door", "hinge", "mechanical", "slow-open"],
  "vehicle-pass": ["vehicle", "race-car", "engine-pass"],
  "voice-placeholder": ["voice", "placeholder", "dialogue"],
};

const FAMILY_GUIDANCE: Record<
  GenerateSoundFamily,
  {
    humanExpectation: string;
    physicalBuild: string;
    satisfyingQualities: string[];
    weakFailureModes: string[];
    fullEventArc: string[];
    familyLock: string[];
    defaultIntensity: "light" | "medium" | "heavy" | "extreme";
  }
> = {
  explosion: {
    humanExpectation: "a real explosion should build pressure, hit with a heavy blast, and finish with debris or fade instead of collapsing into one soft pop",
    physicalBuild: "pressure front, explosive blast body, then debris and collapsing air",
    satisfyingQualities: ["strong blast body", "clear attack-to-decay shape", "aftermath that resolves instead of disappearing abruptly"],
    weakFailureModes: ["single pop shortcut", "muddy rumble with no blast front", "same generic blast every time", "missing debris or fade"],
    fullEventArc: ["pressure build", "blast impact", "debris and fade"],
    familyLock: ["bone break", "punch impact", "magical bloom"],
    defaultIntensity: "heavy",
  },
  lightning: {
    humanExpectation: "lightning should charge, strike sharply, collapse quickly, and vanish instead of turning into a hum or pad",
    physicalBuild: "charge cue, sharp electrical strike, then a collapsing arc tail",
    satisfyingQualities: ["sharp electric attack", "bright strike identity", "fast collapse and vanish"],
    weakFailureModes: ["alien hum", "deep vibration wobble", "slow synth sustain", "blob-like electric mush"],
    fullEventArc: ["charge", "strike", "collapse", "vanish"],
    familyLock: ["explosion blast", "alien hum", "energy beam"],
    defaultIntensity: "medium",
  },
  "fireball-projectile": {
    humanExpectation: "a fireball should read as a cast or launch event with motion and a resolved impact or fade, not a floating orb loop",
    physicalBuild: "cast or launch cue, moving projectile body, then impact heat or fading travel residue",
    satisfyingQualities: ["clear launch or cast cue", "directional travel", "impact or fade that finishes the event"],
    weakFailureModes: ["floating orb hum", "generic laser drift", "no travel read", "impact missing or disconnected from the projectile"],
    fullEventArc: ["charge or cast", "launch and travel", "impact or fade"],
    familyLock: ["laser beam", "generic explosion", "floating orb loop"],
    defaultIntensity: "medium",
  },
  "punch-impact": {
    humanExpectation: "a punch should feel like anticipation into exact contact with a short body-led follow-through, not a weak tap or explosion boom",
    physicalBuild: "micro drive-in, tight contact transient, then short body follow-through",
    satisfyingQualities: ["precise contact timing", "forceful body weight", "tight follow-through instead of mushy sustain"],
    weakFailureModes: ["weak soft hit", "explosion-like boom", "late or early contact", "contact with no follow-through"],
    fullEventArc: ["anticipation", "contact", "follow-through"],
    familyLock: ["kick impact", "explosion", "weapon whoosh"],
    defaultIntensity: "medium",
  },
  "kick-impact": {
    humanExpectation: "a kick should feel leg-led with clearer motion-to-contact force than a punch and a readable follow-through",
    physicalBuild: "leg swing cue, shoe-led contact, then heavier body transfer",
    satisfyingQualities: ["leg-driven contact", "heavier body transfer", "motion cue that supports the hit"],
    weakFailureModes: ["copied punch family", "whoosh with no contact", "no follow-through", "generic boom instead of body impact"],
    fullEventArc: ["wind-up", "contact", "follow-through"],
    familyLock: ["punch impact", "explosion", "weapon slash"],
    defaultIntensity: "heavy",
  },
  "body-impact": {
    humanExpectation: "a body impact should carry momentum into a broad grounded hit and a short settle, not a tiny punch tick",
    physicalBuild: "drop or momentum cue, broad grounded impact, then floor settle",
    satisfyingQualities: ["grounded weight", "broad impact front", "short settle that completes the landing or slam"],
    weakFailureModes: ["tiny contact tick", "cartoon bounce drift", "endless rumble", "no grounded settle"],
    fullEventArc: ["momentum or drop", "impact", "ground settle"],
    familyLock: ["punch tick", "explosion", "cartoon bounce"],
    defaultIntensity: "heavy",
  },
  footsteps: {
    humanExpectation: "footsteps should match pace, surface, and body intent instead of repeating the same contact every time",
    physicalBuild: "weight transfer, surface contact, then release into the next step",
    satisfyingQualities: ["rhythm that matches the movement", "surface-specific contact texture", "clear weight transfer between steps"],
    weakFailureModes: ["same foot sound every step", "wrong pace for the movement", "surface identity missing", "stomp-heavy sneaking"],
    fullEventArc: ["weight transfer", "contact rhythm", "release into the next step"],
    familyLock: ["explosion", "whoosh-only motion", "static loop"],
    defaultIntensity: "medium",
  },
  breathing: {
    humanExpectation: "breathing should sound like a full inhale-exhale-recovery cycle that matches exertion level instead of an idle loop or random hiss",
    physicalBuild: "inhale intake, exhale release, then recovery breath space",
    satisfyingQualities: ["clear inhale and exhale shape", "effort level that matches the animation", "recovery or settle that completes the breath cycle"],
    weakFailureModes: ["calm idle breathing during exertion", "random hiss noise", "no recovery shape", "flat repeated loop with no body logic"],
    fullEventArc: ["inhale", "exhale", "recovery"],
    familyLock: ["ambient hiss", "machine loop", "weapon burst"],
    defaultIntensity: "medium",
  },
  "environment-ambience": {
    humanExpectation: "ambience should establish the place, support the scene, and leave room for the main action instead of crowding it",
    physicalBuild: "scene bed, location detail focus, then open space that leaves room for action",
    satisfyingQualities: ["clear scene identity", "restrained support bed", "space left for foreground action"],
    weakFailureModes: ["busy clutter", "foreground-dominating noise", "generic drone with no place identity", "same ambience texture for every scene"],
    fullEventArc: ["scene bed", "supporting detail", "open space for action"],
    familyLock: ["whoosh accent", "impact hit", "ui cue"],
    defaultIntensity: "light",
  },
  "whoosh-swing": {
    humanExpectation: "a whoosh should trace motion onset, peak through the swing, and release cleanly without pretending to be the impact",
    physicalBuild: "motion onset, air shear through the swing, then a clean release before contact",
    satisfyingQualities: ["directional movement read", "clean swing peak", "short release that clears out before contact"],
    weakFailureModes: ["impact with no motion", "wind blob", "draggy sustain", "same generic swing on every action"],
    fullEventArc: ["motion onset", "swing peak", "clean release"],
    familyLock: ["wind bed", "impact hit", "vehicle pass"],
    defaultIntensity: "medium",
  },
  "background-action-support": {
    humanExpectation: "background support should enter after or around the main event, add context, and settle without stealing focus",
    physicalBuild: "support entry, contextual texture, then restrained settle behind the main event",
    satisfyingQualities: ["secondary layering", "scene-scale support", "restrained settle that keeps focus on the main event"],
    weakFailureModes: ["secondary layer becoming the main event", "muddy clutter", "no relation to the foreground action", "constant wall of noise"],
    fullEventArc: ["support entry", "context texture", "restrained settle"],
    familyLock: ["new main event", "unrelated family reset", "foreground clutter"],
    defaultIntensity: "light",
  },
  "magical-energy": {
    humanExpectation: "magical energy should charge or bloom with readable identity, release clearly, and resolve cleanly instead of drifting into random synth mush",
    physicalBuild: "magical charge or bloom, defined release, then a controlled magical resolve",
    satisfyingQualities: ["clear magical identity", "intentional release or bloom", "resolved tail that fits the event"],
    weakFailureModes: ["random bass drone", "UFO wobble", "generic synth pad", "no event-specific ending"],
    fullEventArc: ["charge or bloom", "release", "magical decay"],
    familyLock: ["explosion blast", "UFO drone", "laser beam"],
    defaultIntensity: "medium",
  },
  "scene-addition": {
    humanExpectation: "scene additions should preserve the current sound world, hit the requested cue, and resolve without resetting the scene",
    physicalBuild: "hold the current bed, place the added cue, then return cleanly to the scene",
    satisfyingQualities: ["preserved base identity", "exact cue addition", "clean resolve back into the scene"],
    weakFailureModes: ["scene reset", "cue overwhelms the bed", "wrong-family addition", "no return to the scene"],
    fullEventArc: ["preserve scene bed", "add cue on action", "resolve back into the scene"],
    familyLock: ["scene reset", "new family", "foreground takeover"],
    defaultIntensity: "medium",
  },
  continuation: {
    humanExpectation: "continuation should keep the same family identity, adjust only the requested beat, and complete the event without style reset",
    physicalBuild: "preserve the existing family, change only the named beat, then resolve without resetting the sound world",
    satisfyingQualities: ["family continuity", "targeted change only", "full event completion still intact"],
    weakFailureModes: ["family reset", "copy-paste repetition", "change spills into unrelated beats", "new version loses the ending"],
    fullEventArc: ["preserve family identity", "change requested beat", "resolve without reset"],
    familyLock: ["family reset", "copied placeholder", "unrelated redesign"],
    defaultIntensity: "medium",
  },
  "ui-tech": {
    humanExpectation: "ui sounds should confirm the action immediately and stop cleanly instead of feeling violent or muddy",
    physicalBuild: "input click or cue, compact confirmation peak, then a clean stop",
    satisfyingQualities: ["immediate confirmation", "clean compact identity", "fast stop"],
    weakFailureModes: ["violent impact", "long pad tail", "muddy tone", "unreadable confirmation moment"],
    fullEventArc: ["input cue", "confirm peak", "clean stop"],
    familyLock: ["impact hit", "explosion thump", "ambience bed"],
    defaultIntensity: "light",
  },
  "door-mechanical": {
    humanExpectation: "door sounds should track the mechanical motion from onset through release or latch settle instead of smearing into one long texture",
    physicalBuild: "mechanical onset, movement body, then release or latch settle",
    satisfyingQualities: ["mechanical precision", "material identity", "movement-to-settle completion"],
    weakFailureModes: ["long metallic smear", "wrong material family", "missing mechanical release", "same door texture for every action"],
    fullEventArc: ["mechanical onset", "movement body", "release or latch settle"],
    familyLock: ["whoosh sweep", "impact thump", "vehicle pass"],
    defaultIntensity: "medium",
  },
  "vehicle-pass": {
    humanExpectation: "a vehicle pass should approach, peak as it passes, and recede with motion perspective instead of staying static",
    physicalBuild: "approach rise, pass-by peak, then receding engine and air tail",
    satisfyingQualities: ["clear pass-by motion", "vehicle identity", "approach-to-recede arc"],
    weakFailureModes: ["static engine loop", "sci-fi hover sweep", "explosion drift", "no receding motion"],
    fullEventArc: ["approach", "pass peak", "recede"],
    familyLock: ["whoosh swing", "explosion blast", "static engine loop"],
    defaultIntensity: "heavy",
  },
  "voice-placeholder": {
    humanExpectation: "a placeholder voice cue should speak clearly, stay brief, and end cleanly instead of drifting into performance or non-speech event behavior",
    physicalBuild: "spoken onset, clear word body, then a clean stop",
    satisfyingQualities: ["clear speech onset", "legible word body", "clean short ending"],
    weakFailureModes: ["non-speech event drift", "overacted long phrase", "unclear word shape", "music-like cue instead of voice"],
    fullEventArc: ["spoken onset", "legible body", "clean stop"],
    familyLock: ["impact effect", "music sting", "long performance monologue"],
    defaultIntensity: "medium",
  },
};

const WORKFLOW_TAGS = new Set(["workflow", "options", "choice-followup", "attach-import", "question-needed", "timing-lock"]);
const COMPATIBILITY_TAGS = new Set(["compatibility", "ui", "door", "vehicle", "voice"]);

const unique = (values: Array<string | null | undefined>): string[] => {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const normalized = value?.trim();
    if (!normalized) {
      continue;
    }
    if (seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    result.push(normalized);
  }
  return result;
};

const normalizeText = (value: string): string => value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const tokenize = (value: string): string[] => unique(normalizeText(value).split(/\s+/).filter(Boolean));

const thinking = (
  requestMode: GenerateSoundRequestMode,
  interpretation: string[],
  animationExpectation: string[],
  ambiguityPolicy: GenerateSoundAmbiguityPolicy = "proceed",
): GenerateSoundThinkingIntent => ({
  requestMode,
  interpretation,
  animationExpectation,
  ambiguityPolicy,
});

const soundPlan = (structureKind: GenerateSoundStructureKind, beats: string[]): GenerateSoundPlan => ({
  structureKind,
  beats,
});

const getFamilyGuidance = (soundFamily: GenerateSoundFamily) => FAMILY_GUIDANCE[soundFamily];
const getExpectedArc = (soundFamily: GenerateSoundFamily): string[] => getFamilyGuidance(soundFamily).fullEventArc;
const formatExpectedArc = (soundFamily: GenerateSoundFamily): string => getExpectedArc(soundFamily).join(" -> ");
const formatFamilyName = (soundFamily: GenerateSoundFamily): string => soundFamily.replace(/-/g, " ");
const getEventShape = (soundFamily: GenerateSoundFamily) => {
  const arc = getExpectedArc(soundFamily);
  return {
    start: arc[0] ?? "setup",
    peak: arc[1] ?? arc[0] ?? "main event",
    aftermath: arc.length > 2 ? arc.slice(2).join(" -> ") : arc[1] ?? "clean resolve",
  };
};
const formatEventShape = (soundFamily: GenerateSoundFamily): string => {
  const eventShape = getEventShape(soundFamily);
  return `start: ${eventShape.start} | peak: ${eventShape.peak} | aftermath: ${eventShape.aftermath}`;
};
const normalizeEngineVocabulary = (value: string): string =>
  value
    .replace(/\bpowerful\b/gi, "high-force")
    .replace(/\bstronger\b/gi, "higher-force")
    .replace(/\bstrong\b/gi, "high-force")
    .replace(/\bheavier\b/gi, "higher-weight")
    .replace(/\bheavier but still controlled\b/gi, "higher-weight with controlled release")
    .replace(/\blighter\b/gi, "lower-weight")
    .replace(/\bcleaner\b/gi, "more controlled")
    .replace(/\bclean\b/gi, "controlled")
    .replace(/\breadable\b/gi, "clear")
    .replace(/\bsatisfying\b/gi, "full-event")
    .replace(/\bairy\b/gi, "broadband-air")
    .replace(/\beerie\b/gi, "thin-resonant")
    .replace(/\bugly\b/gi, "irregular")
    .replace(/\bbrutal\b/gi, "high-force")
    .replace(/\bnasty\b/gi, "high-sharpness")
    .replace(/\bsoft\b/gi, "low-force")
    .replace(/\bmuddy\b/gi, "low-end-heavy")
    .replace(/\bboomy\b/gi, "explosion-like")
    .replace(/\bcrunchy\b/gi, "brittle-texture")
    .replace(/\bdistorted\b/gi, "noise-heavy")
    .replace(/\bfuzzy\b/gi, "noise-heavy")
    .replace(/\bwashed-out\b/gi, "diffuse")
    .replace(/\bbelievable\b/gi, "perspective-accurate")
    .replace(/\bcontrolled settle\b/gi, "controlled aftermath")
    .replace(/\bbody settle\b/gi, "body aftermath");
const lowercaseLeadingDirective = (value: string): string => value.replace(/^[A-Z]/, (match) => match.toLowerCase());
const toEngineDirective = (value: string): string =>
  lowercaseLeadingDirective(
    normalizeEngineVocabulary(value)
      .replace(/\bcanonical\b/gi, "base")
      .replace(/\bvariant\b/gi, "behavior variant")
      .replace(/\bsound\b/gi, "event")
      .replace(/\bresult\b/gi, "handoff")
      .replace(/\bviewer\b/gi, "human")
      .trim()
  )
    .trim()
    .replace(/\.$/, "")
    .replace(/\btreat (?:the )?request as\s+/gi, "")
    .replace(/\bthe sound should\s+/gi, "")
    .replace(/\bevent target\s+/gi, "")
    .replace(/\bthe tail should\s+/gi, "tail ")
    .replace(/\bnot a musical drone\b/gi, "reject musical drone")
    .replace(/\bnot a single pop\b/gi, "reject single pop")
    .replace(/^(?:a|an|the)\s+/i, "")
    .replace(/\bshould\b/gi, "")
    .replace(/\bfeels?\b/gi, "target")
    .replace(/\binstead of\b/gi, "| avoid")
    .replace(/\bwithout\b/gi, "| avoid")
    .replace(/,\s*then\s+/gi, " -> ")
    .replace(/,\s*(?:and\s+)?/g, " -> ")
    .replace(/\s+and\s+/g, " -> ")
    .replace(/\s+into\s+/gi, " -> ")
    .replace(/\s+then\s+/gi, " -> ")
    .replace(/\s+\|\s+avoid\s+collapsing\s+->\s+/gi, " | avoid ")
    .replace(/\bdo not turn (?:it|this)\s+->\s+/gi, "reject ")
    .replace(/\bdo not make (?:it|this)\s+->\s+/gi, "reject ")
    .replace(/\bkeep the ([^|]+?) -> controlled\b/gi, "preserve $1 | keep controlled")
    .replace(/\bpreserve ([^|]+?) -> controlled\b/gi, "preserve $1 | keep controlled")
    .replace(/\bballoon-burst target\b/gi, "balloon-burst fallback")
    .replace(/\bstill land\b/gi, "lands")
    .replace(/\bsettle\s+resolve\b/gi, "settle resolves")
    .replace(/\bcue\s+lead\b/gi, "cue leads")
    .replace(/\bblast\s+land\b/gi, "blast lands")
    .replace(/\btexture\s+remain\b/gi, "texture remains")
    .replace(/\bfinish quickly enough\b/gi, "finishes quickly enough")
    .replace(/\bturn it\s+->\s+a boom\b/gi, "become boom-family")
    .replace(/\s+->\s+reject\b/gi, " | reject")
    .replace(/\s+->\s+->\s+/g, " -> ")
    .replace(/\s{2,}/g, " ");
const formatTimingDirective = (value?: string | null): string => {
  const directive = value ? toEngineDirective(value) : "";
  if (!directive) {
    return "align peak to key visual cue";
  }
  if (/^(?:trigger|align)\s+clarify\b/i.test(directive)) {
    return `ask for ${directive.replace(/^(?:trigger|align)\s+clarify\s+/i, "").trim()}`;
  }
  if (/^(?:trigger|align)\s+this fails because\b/i.test(directive)) {
    return `timing failure -> ${directive.replace(/^(?:trigger|align)\s+this fails because\b/i, "").trim()}`;
  }
  if (/^(?:trigger|align)\s+fails because\b/i.test(directive)) {
    return `timing failure -> ${directive.replace(/^(?:trigger|align)\s+fails because\b/i, "").trim()}`;
  }
  if (/^this fails because\b/i.test(directive)) {
    return `timing failure -> ${directive.replace(/^this fails because\b/i, "").trim()}`;
  }
  if (/^fails because\b/i.test(directive)) {
    return `timing failure -> ${directive.replace(/^fails because\b/i, "").trim()}`;
  }
  return /^(trigger|align|lock|wait|ask)\b/i.test(directive) ? directive : `trigger ${directive}`;
};
const formatRequestIntent = (example: GenerateSoundExample): string => {
  const modifierGuidance = getModifierGuidance({
    userPrompt: example.userPrompt,
    requestSummary: example.requestSummary,
  });
  const looksLikeContinuation =
    example.soundFamily === "continuation" ||
    example.soundFamily === "scene-addition" ||
    /\b(keep the same|same\b|continue|second hit|follow-up|next beat|modify|change|but heavier|but sharper|shorter|darker|cleaner|less distorted|more bass)\b/i.test(
      `${example.userPrompt} ${example.requestSummary}`,
    );
  const preservedFamilyLabel = resolvePreservedFamilyLabel(example);
  const requestAction = isPendingExecutionLockExample(example)
    ? "ask for missing event lock"
    : looksLikeContinuation
      ? `modify existing ${preservedFamilyLabel} behavior`
      : `define ${preservedFamilyLabel} event`;
  const requestParts = [
    requestAction,
    isPendingExecutionLockExample(example) ? "preserve current scene continuity" : `preserve ${preservedFamilyLabel} family`,
    modifierGuidance ? `modify ${modifierGuidance.dimension} only: ${toEngineDirective(modifierGuidance.change)}` : null,
    formatTimingDirective(example.sequenceTimingNotes[0]),
  ];

  return requestParts.filter((value): value is string => Boolean(value && value.trim().length > 0)).join(" | ");
};
const formatEngineHandoff = (example: GenerateSoundExample): string => {
  const timing =
    example.sequenceTimingNotes[0] ??
    (example.soundFamily === "continuation" || example.soundFamily === "scene-addition"
      ? "preserve prior timing logic and only shift the requested beat"
      : "align the peak to the key visible animation cue");
  return [
    `event type: ${resolveEventTypeLabel(example)}`,
    `event family: ${resolvePreservedFamilyLabel(example)}`,
    `trigger timing: ${formatTimingDirective(timing)}`,
    `event shape: ${formatEventShape(example.soundFamily)}`,
    isPendingExecutionLockExample(example) ? `execute later in engine after missing lock resolves` : `execute later in engine`,
  ].join(" | ");
};
const formatFamilyLock = (soundFamily: GenerateSoundFamily): string => {
  const locks = getFamilyGuidance(soundFamily).familyLock;
  return locks.length > 0
    ? `${formatFamilyName(soundFamily)} is not ${locks.join(", ")}`
    : `preserve the ${formatFamilyName(soundFamily)} family identity`;
};
const inferReferencedFamilyLabel = (value: string): string | null => {
  const normalized = normalizeText(value);
  if (/\b(punch|fist|jab|hook|uppercut)\b/.test(normalized)) {
    return "punch impact";
  }
  if (/\b(kick|roundhouse|knee|boot|heel)\b/.test(normalized)) {
    return "kick impact";
  }
  if (/\b(explosion|blast|detonation|shockwave)\b/.test(normalized)) {
    return "explosion";
  }
  if (/\b(bone|fracture|break|snap|crack)\b/.test(normalized)) {
    return "bone break";
  }
  if (/\b(door|hinge|lock|latch)\b/.test(normalized)) {
    return "door mechanical";
  }
  if (/\b(wind|gust|breeze)\b/.test(normalized)) {
    return "wind";
  }
  if (/\b(whoosh|swing|swish|swoosh)\b/.test(normalized)) {
    return "whoosh swing";
  }
  if (/\b(thunder|lightning|zap|electric)\b/.test(normalized)) {
    return "lightning";
  }
  if (/\b(footstep|walk|step|stomp|run)\b/.test(normalized)) {
    return "footsteps";
  }
  if (/\b(voice|say|spoken|dialogue)\b/.test(normalized)) {
    return "voice placeholder";
  }
  if (/\b(button|ui|beep|chirp|confirm|menu)\b/.test(normalized)) {
    return "ui tech";
  }
  if (/\b(vehicle|car|engine|pass-by|pass by)\b/.test(normalized)) {
    return "vehicle pass";
  }
  if (/\b(portal|magic|magical|energy|spell)\b/.test(normalized)) {
    return "magical energy";
  }
  return null;
};
const resolvePreservedFamilyLabel = (example: GenerateSoundExample): string =>
  example.soundFamily === "continuation" || example.soundFamily === "scene-addition"
    ? inferReferencedFamilyLabel(`${example.userPrompt} ${example.requestSummary}`) ??
      (example.shouldAskQuestion ? "pending family lock" : "existing family")
    : formatFamilyName(example.soundFamily);
const isPendingExecutionLockExample = (example: GenerateSoundExample): boolean =>
  resolvePreservedFamilyLabel(example) === "pending family lock";
const resolveEventTypeLabel = (example: GenerateSoundExample): string =>
  isPendingExecutionLockExample(example)
    ? "pending event lock"
    : example.soundFamily === "continuation" || example.soundFamily === "scene-addition"
    ? `${resolvePreservedFamilyLabel(example)} continuation`
    : formatFamilyName(example.soundFamily);
const formatExpectationCommand = (example: GenerateSoundExample): string =>
  isPendingExecutionLockExample(example)
    ? "expect identify missing action -> lock family and cue -> preserve scene continuity"
    : example.soundFamily === "continuation" || example.soundFamily === "scene-addition"
    ? `expect preserve ${resolvePreservedFamilyLabel(example)} -> modify requested beat -> resolve without reset`
    : `expect ${formatExpectedArc(example.soundFamily)}`;
const formatPhysicalEventCommand = (example: GenerateSoundExample): string =>
  isPendingExecutionLockExample(example)
    ? "hold family choice -> wait for cue lock -> execute full event after the action is known"
    : example.soundFamily === "continuation" || example.soundFamily === "scene-addition"
    ? `preserve ${resolvePreservedFamilyLabel(example)} -> modify requested beat -> resolve without reset`
    : toEngineDirective(getFamilyGuidance(example.soundFamily).physicalBuild);
const formatFamilyLockCommand = (example: GenerateSoundExample): string =>
  isPendingExecutionLockExample(example)
    ? "preserve current scene continuity | reject random family guess | reject premature execution"
    : example.soundFamily === "continuation" || example.soundFamily === "scene-addition"
    ? `preserve ${resolvePreservedFamilyLabel(example)} | reject family reset | copied placeholder | unrelated redesign`
    : `preserve ${formatFamilyName(example.soundFamily)} | reject ${getFamilyGuidance(example.soundFamily).familyLock.join(" | ")}`;
const formatParameterBundle = (example: GenerateSoundExample): string => {
  const guidance = getFamilyGuidance(example.soundFamily);
  const modifierGuidance = getModifierGuidance({
    userPrompt: example.userPrompt,
    requestSummary: example.requestSummary,
  });
  const attack =
    modifierGuidance?.dimension === "attack"
      ? "high"
      : modifierGuidance?.dimension === "intensity" && /\b(soft|softer)\b/i.test(example.userPrompt)
        ? "low"
        : "medium";
  return [
    `attack: ${attack}`,
    `intensity: ${guidance.defaultIntensity}`,
    `texture: ${formatPhysicalEventCommand(example)}`,
    `decay: ${getEventShape(example.soundFamily).aftermath}`,
    `layering: ${
      example.soundPlan.beats.length > 0 ? example.soundPlan.beats.map((beat) => toEngineDirective(beat)).join(" -> ") : "hold until the missing cue is clarified"
    }`,
  ].join(" | ");
};

const formatStrictExampleCommand = (example: GenerateSoundExample): string => {
  const eventShape = getEventShape(example.soundFamily);
  const guidance = getFamilyGuidance(example.soundFamily);
  const modifierGuidance = getModifierGuidance({
    userPrompt: example.userPrompt,
    requestSummary: example.requestSummary,
  });
  const attack =
    modifierGuidance?.dimension === "attack"
      ? "high"
      : modifierGuidance?.dimension === "intensity" && /\b(soft|softer)\b/i.test(example.userPrompt)
        ? "low"
        : "medium";
  const trigger = formatTimingDirective(example.sequenceTimingNotes[0] ?? "key animation cue")
    .replace(/^trigger\s+/i, "")
    .replace(/^ask for\s+/i, "")
    .replace(/^timing failure ->\s+/i, "")
    .trim();
  const layers =
    example.soundPlan.beats.length > 0
      ? example.soundPlan.beats.map((beat) => toEngineDirective(beat)).join(" -> ")
      : formatPhysicalEventCommand(example);
  return [
    "define sound event ->",
    `type=${resolveEventTypeLabel(example)};`,
    `trigger=${trigger};`,
    `timing=${eventShape.start} -> ${eventShape.peak} -> ${eventShape.aftermath};`,
    `attack=${attack};`,
    `intensity=${guidance.defaultIntensity};`,
    `texture=${formatPhysicalEventCommand(example)};`,
    `decay=${eventShape.aftermath};`,
    `layers=${layers};`,
    `preserve=${resolvePreservedFamilyLabel(example)};`,
  ].join(" ");
};
const formatModifierInstruction = (modifierGuidance: ModifierGuidance | null): string =>
  modifierGuidance
    ? [
        `modify ${modifierGuidance.dimension} only`,
        `apply ${toEngineDirective(modifierGuidance.change)}`,
        `preserve ${toEngineDirective(modifierGuidance.preserve)}`,
        `reject ${toEngineDirective(modifierGuidance.wrong)
          .replace(/\bmake it only louder\b/gi, "louder-only")
          .replace(/\bbecome boom-family\b/gi, "boom-family drift")
          .replace(/\bor stretch the tail until the hit target low-end-heavy\b/gi, "tail-smear into low-end-heavy mud")
          .replace(/\bor stretch the tail until the hit feels muddy\b/gi, "tail-smear into mud")
          .replace(/\breplace the sound with distortion spam\b/gi, "distortion spam")
          .replace(/\brandom grit\b/gi, "random grit")
          .replace(/\ba different family\b/gi, "different family")}`,
	      ].join(" | ")
    : "modify attack | weight | intensity | texture | timing | decay | layering only | preserve family identity | reject family replacement";
const formatExamplePlanningCommands = (example: GenerateSoundExample): string => {
  const modifierGuidance = getModifierGuidance({
    userPrompt: example.userPrompt,
    requestSummary: example.requestSummary,
  });
  const preservedFamilyLabel = resolvePreservedFamilyLabel(example);
  return [
    isPendingExecutionLockExample(example)
      ? "ask for missing event lock"
      : example.soundFamily === "continuation" || example.soundFamily === "scene-addition"
      ? `preserve ${preservedFamilyLabel} chain`
      : `define ${preservedFamilyLabel} event scope`,
    formatTimingDirective(example.sequenceTimingNotes[0] ?? "trigger key animation cue"),
    `shape ${formatEventShape(example.soundFamily)}`,
    modifierGuidance ? `modify ${modifierGuidance.dimension} only` : null,
    isPendingExecutionLockExample(example) ? "preserve current scene continuity" : `preserve ${preservedFamilyLabel} family`,
    `apply default intensity ${getFamilyGuidance(example.soundFamily).defaultIntensity}`,
    `execute ${example.soundPlan.beats.length > 0 ? example.soundPlan.beats.map((beat) => toEngineDirective(beat)).join(" -> ") : formatPhysicalEventCommand(example)}`,
    formatFamilyLockCommand(example).replace(/^preserve [^|]+\s+\|\s+/, ""),
    example.thinkingIntent.ambiguityPolicy === "proceed" ? "execute without another question" : "ask one missing execution-lock question",
  ]
    .filter((value): value is string => Boolean(value && value.trim().length > 0))
    .join(" | ");
};

type ModifierGuidance = {
  dimension: "attack" | "weight" | "intensity" | "texture" | "timing" | "decay" | "layering";
  change: string;
  preserve: string;
  wrong: string;
};

const getMotionLogic = ({
  soundFamily,
  plan,
}: {
  soundFamily: GenerateSoundFamily;
  plan: GenerateSoundPlan;
}): string => {
  if (soundFamily === "punch-impact") {
    return "the hit should land exactly on contact, follow the body weight through the arm stop, and end as the recoil finishes";
  }

  if (soundFamily === "kick-impact") {
    return "the swing should lead the foot contact, the body transfer should follow the strike, and the sound should end as the kick settles";
  }

  if (soundFamily === "body-impact") {
    return "the sound should track the drop or momentum into the floor hit and settle as the body stops compressing";
  }

  if (soundFamily === "whoosh-swing") {
    return "the whoosh should lead the visible motion, track movement direction, and end when the swing stops instead of lagging behind it";
  }

  if (soundFamily === "footsteps") {
    return "each contact should follow weight transfer, track the step rhythm, and release into the next footfall instead of flattening every step";
  }

  if (soundFamily === "breathing") {
    return "the sound should follow body effort through inhale, exhale, and recovery, not float independently of the character's breathing rhythm";
  }

  if (soundFamily === "explosion") {
    return "the pressure should lead into the blast, the blast should peak on the event, and the aftermath should end as the energy release settles";
  }

  if (soundFamily === "lightning") {
    return "the charge should set up the strike, the crack should land instantly on the hit, and the collapse should end when the arc vanishes";
  }

  if (soundFamily === "fireball-projectile") {
    return "the cast or launch should lead motion, the projectile body should track travel direction, and the event should end on impact or fade";
  }

  if (soundFamily === "environment-ambience" || soundFamily === "background-action-support") {
    return "the sound should support the scene's movement and pacing while leaving silence and space where the action needs room";
  }

  if (soundFamily === "scene-addition" || soundFamily === "continuation") {
    return "continuation must feel like the same sound evolving, track the same cue timing, and end without resetting the established sound world";
  }

  if (soundFamily === "door-mechanical") {
    return "the cue should track the mechanical onset, follow the door movement, and stop when the latch or motion settles";
  }

  if (soundFamily === "vehicle-pass") {
    return "the sound should track approach, peak at the closest pass, and fall away as the vehicle exits the frame";
  }

  if (soundFamily === "voice-placeholder") {
    return "the word should begin with the mouth movement, stay legible through the spoken body, and end when the speaking motion ends";
  }

  if (soundFamily === "ui-tech") {
    return "the cue should fire exactly on input, confirm the action immediately, and stop before it feels like a lingering tone";
  }

  if (soundFamily === "magical-energy") {
    return "the sound should track the visible charge or release, follow the energy motion, and resolve as the effect settles";
  }

  return `the sound should track ${plan.beats.join(" -> ")} and end when the visible motion or event ends`;
};

const getFeelsIncomplete = (soundFamily: GenerateSoundFamily): string => {
  const arc = getExpectedArc(soundFamily);
  if (arc.length <= 1) {
    return "there is no release or settle after the main sound";
  }

  if (soundFamily === "environment-ambience" || soundFamily === "background-action-support") {
    return "the scene has no support bed or no space left for the action to breathe";
  }

  return `there is no ${arc.slice(1).join(" -> ")} after the opening beat`;
};

const getModifierGuidance = ({
  userPrompt,
}: {
  userPrompt: string;
  requestSummary: string;
}): ModifierGuidance | null => {
  const text = normalizeText(userPrompt);

  if (/\b(hit harder|harder|same but heavier|make it heavier|heavier|stronger)\b/.test(text)) {
    return {
      dimension: "weight",
      change: "increase weight, body force, and transient definition",
      preserve: "the core family, cue timing role, and full event arc",
      wrong: "make it only louder, turn it into a boom, or stretch the tail until the hit feels muddy",
    };
  }

  if (/\b(sharper|sharper attack|make it sharper|sharpen)\b/.test(text)) {
    return {
      dimension: "attack",
      change: "increase attack sharpness and transient edge",
      preserve: "the same family identity, body weight, cue timing role, and full event arc",
      wrong: "replace the family, stretch the tail, or turn sharper into a louder-only change",
    };
  }

  if (/\b(softer|make it softer|too hard|too intense|less intense|lower intensity)\b/.test(text)) {
    return {
      dimension: "intensity",
      change: "reduce force level while preserving the same family and timing role",
      preserve: "the same family identity, event structure, and trigger timing",
      wrong: "delete the event body, change families, or turn softer into a vague muffled rewrite",
    };
  }

  if (/\b(crunchier|more crunchy|crunchy)\b/.test(text)) {
    return {
      dimension: "texture",
      change: "add sharper texture detail inside the existing event",
      preserve: "the same family identity, event length, and timing role",
      wrong: "replace the sound with distortion spam, random grit, or a different family",
    };
  }

  if (/\b(exactly when|sync|synced|line it up|lock it|earlier|later|delay|delayed|impact frame|contact frame|timing)\b/.test(text)) {
    return {
      dimension: "timing",
      change: "move the onset or strongest beat timing",
      preserve: "the same family, weight, texture, and complete event shape",
      wrong: "rewrite the sound family, hide bad sync with a longer tail, or change the cue into a different event",
    };
  }

  if (/\b(shorter|shorten|shorter tail|less tail)\b/.test(text)) {
    return {
      dimension: "decay",
      change: "reduce the decay or aftermath length",
      preserve: "the start and impact so the event still lands clearly",
      wrong: "delete the impact body, turn the sound into a tiny click, or remove the family identity",
    };
  }

  if (/\b(longer tail|more tail|longer decay|more decay|linger|lingering|hold longer)\b/.test(text)) {
    return {
      dimension: "decay",
      change: "extend the aftermath or release",
      preserve: "the same start, peak, and family identity",
      wrong: "smear the peak into a drone, replace the family, or lose the original cue timing",
    };
  }

  if (/\b(cleaner|clean|less distorted|reduce distortion)\b/.test(text)) {
    return {
      dimension: "texture",
      change: "remove noise, fuzz, or excess distortion",
      preserve: "the same energy, event force, and aftermath",
      wrong: "shrink the sound into a safe pop, remove the body, or cut the ending",
    };
  }

  if (/\b(more bass|more low end|more low-end|bassier)\b/.test(text)) {
    return {
      dimension: "weight",
      change: "increase low-end body underneath the main hit",
      preserve: "attack clarity, family identity, and the short settle or decay",
      wrong: "turn the sound into an explosion, bury the attack in rumble, or make the whole event muddy",
    };
  }

  return null;
};

const formatThinkingIntent = (intent: GenerateSoundThinkingIntent, soundFamily: GenerateSoundFamily): string => {
  const guidance = getFamilyGuidance(soundFamily);
  return [
    `plan mode ${intent.requestMode}`,
    ...intent.interpretation.map((value) => `define ${toEngineDirective(value)}`),
    ...intent.animationExpectation.map((value) => `align ${toEngineDirective(value)}`),
    `preserve ${formatFamilyName(soundFamily)} family`,
    `apply default intensity ${guidance.defaultIntensity}`,
    `reject ${getFamilyGuidance(soundFamily).familyLock.join(" | ")}`,
    intent.ambiguityPolicy === "proceed" ? "execute without another question" : "ask one missing execution-lock question",
  ].join(" | ");
};

const formatSoundPlan = (plan: GenerateSoundPlan, soundFamily: GenerateSoundFamily): string =>
  `engine plan ${plan.structureKind}: ${
    plan.beats.length > 0 ? plan.beats.join(" -> ") : "wait for missing detail before issuing engine behavior"
  } | required event shape: ${formatEventShape(soundFamily)}`;

const DIRECTIVE_PREFIX_PATTERN = /^(define|modify|change|preserve|keep|trigger|attach|combine|continue|ask|wait|lock|align|reject|execute|honor)\b/i;

const ensureDirectivePrefix = (value: string, prefix: string): string => {
  const directive = toEngineDirective(value);
  if (!directive) {
    return prefix;
  }
  return DIRECTIVE_PREFIX_PATTERN.test(directive) ? directive : `${prefix} ${directive}`.trim();
};

const normalizeExampleRequestSummary = ({
  requestSummary,
  soundFamily,
  exampleKind,
}: {
  requestSummary: string;
  soundFamily: GenerateSoundFamily;
  exampleKind: GenerateSoundExampleKind;
}): string => {
  const familyLabel = soundFamily === "continuation" ? "existing family continuation" : formatFamilyName(soundFamily);
  return ensureDirectivePrefix(
    requestSummary,
    exampleKind === "bad" ? `reject ${familyLabel} failure mode |` : `define ${familyLabel} event |`,
  );
};

const normalizeSequenceTimingNote = (note: string): string => ensureDirectivePrefix(note, "trigger");
const normalizeConstraintDirective = (constraint: string): string => {
  const directive = toEngineDirective(constraint);
  if (!directive) {
    return "preserve family lock";
  }
  if (/^rewrite or remove this example\b/i.test(directive)) {
    return "reject this failure mode";
  }
  if (/^stay\s+/i.test(directive)) {
    return `preserve ${directive.replace(/^stay\s+/i, "")}`.trim();
  }
  if (/^avoid\s+/i.test(directive)) {
    return `reject ${directive.replace(/^avoid\s+/i, "")}`.trim();
  }
  return DIRECTIVE_PREFIX_PATTERN.test(directive) ? directive : `preserve ${directive}`;
};

const buildSoundIntent = ({
  userPrompt,
  requestSummary,
  soundFamily,
  thinkingIntent,
  soundPlan: plan,
  goodOutputDescription,
  badOutputDescription,
  constraints,
}: {
  userPrompt: string;
  requestSummary: string;
  soundFamily: GenerateSoundFamily;
  thinkingIntent: GenerateSoundThinkingIntent;
  soundPlan: GenerateSoundPlan;
  goodOutputDescription: string[];
  badOutputDescription: string[];
  constraints: string[];
}): string => {
  const guidance = getFamilyGuidance(soundFamily);
  const modifierGuidance = getModifierGuidance({
    userPrompt,
    requestSummary,
  });

  return [
    requestSummary,
    `family: ${soundFamily}`,
    `planner role: map user intent to structured sound logic for the engine`,
    `user expectation: ${guidance.humanExpectation}`,
    `physical build: ${guidance.physicalBuild}`,
    `required event shape: ${formatEventShape(soundFamily)}`,
    `family lock: ${formatFamilyLock(soundFamily)}`,
    `engine handoff: type ${formatFamilyName(soundFamily)} | timing match the key animation cue | structure ${formatEventShape(soundFamily)} | intensity ${guidance.defaultIntensity} by default | texture ${guidance.physicalBuild} | decay ${getEventShape(soundFamily).aftermath} | layering ${plan.beats.join(" -> ")}`,
    `human expectation requires a complete physical event, not just the peak moment`,
    `good handoff when ${unique([...guidance.satisfyingQualities, ...goodOutputDescription]).slice(0, 3).join("; ")}`,
    `reject when ${unique([...guidance.weakFailureModes, ...badOutputDescription]).slice(0, 3).join("; ")}`,
    `incomplete when ${getFeelsIncomplete(soundFamily)}`,
    `default intensity when unspecified: ${guidance.defaultIntensity}`,
    `full event arc: ${formatExpectedArc(soundFamily)}`,
    `thinking: ${thinkingIntent.interpretation.join("; ")}`,
    `plan: ${plan.beats.join(" -> ")}`,
    `good execution result: ${unique([...guidance.satisfyingQualities, ...goodOutputDescription]).slice(0, 4).join("; ")}`,
    `reject weak output: ${unique([...guidance.weakFailureModes, ...badOutputDescription]).slice(0, 4).join("; ")}`,
    modifierGuidance ? `modifier dimension: ${modifierGuidance.dimension}` : "modifier system: change only attack, weight, intensity, texture, timing, decay, or layering",
    modifierGuidance ? `modify only requested dimension: ${modifierGuidance.change}` : "modifiers must not change the family",
    modifierGuidance ? `correct behavior preserves: ${modifierGuidance.preserve}` : null,
    modifierGuidance ? `wrong behavior would: ${modifierGuidance.wrong}` : null,
    `execute: ${goodOutputDescription.slice(0, 3).join("; ")}`,
    constraints.length > 0 ? `constraints: ${constraints.join("; ")}` : null,
  ]
    .filter((value): value is string => Boolean(value && value.trim().length > 0))
    .join(". ");
};

const buildReasoning = ({
  exampleKind,
  userPrompt,
  requestSummary,
  soundFamily,
  thinkingIntent,
  soundPlan: plan,
  goodOutputDescription,
  badOutputDescription,
}: {
  exampleKind: GenerateSoundExampleKind;
  userPrompt: string;
  requestSummary: string;
  soundFamily: GenerateSoundFamily;
  thinkingIntent: GenerateSoundThinkingIntent;
  soundPlan: GenerateSoundPlan;
  goodOutputDescription: string[];
  badOutputDescription: string[];
}): string => {
  const guidance = getFamilyGuidance(soundFamily);
  const expectedArc = formatExpectedArc(soundFamily);
  const weakFailures = unique([...guidance.weakFailureModes, ...badOutputDescription]).slice(0, 4).join("; ");
  const satisfying = unique([...guidance.satisfyingQualities, ...goodOutputDescription]).slice(0, 4).join("; ");
  const modifierGuidance = getModifierGuidance({
    userPrompt,
    requestSummary,
  });
  const motionLogic = getMotionLogic({
    soundFamily,
    plan,
  });

  if (exampleKind === "bad") {
    return [
      `Reject this example because it violates: ${requestSummary}.`,
      `Human expectation: ${guidance.humanExpectation}.`,
      `Physical event should be ${guidance.physicalBuild}.`,
      `Required event shape is ${formatEventShape(soundFamily)}.`,
      `Family lock: ${formatFamilyLock(soundFamily)}.`,
      `Reject when ${weakFailures}.`,
      `Incomplete when ${getFeelsIncomplete(soundFamily)}.`,
      `A professional version should complete ${expectedArc} at roughly ${guidance.defaultIntensity} intensity unless the user asks otherwise.`,
      `This example misreads the family by treating it as ${thinkingIntent.interpretation.join("; ")} and by using ${plan.beats.join(" -> ")}.`,
      `That creates ${badOutputDescription.join("; ")}.`,
      `Matches motion badly because ${motionLogic}.`,
      modifierGuidance ? `Wrong modifier behavior would ${modifierGuidance.wrong}.` : `Wrong modifier behavior would replace the family instead of changing attack, weight, intensity, texture, timing, decay, or layering.`,
      `Single transient, pop-only, or peak-only shortcuts are weak because humans expect a complete physical event, not just the peak moment.`,
      `It fails because weaker versions like ${weakFailures} miss the full event and never produce a usable engine handoff.`,
    ]
      .filter((value): value is string => Boolean(value && value.trim().length > 0))
      .join(" ");
  }

  return [
    `Request intent: ${requestSummary}.`,
    `Human expectation: ${guidance.humanExpectation}.`,
    `Physical event: ${guidance.physicalBuild}.`,
    `Required event shape: ${formatEventShape(soundFamily)}.`,
    `Family lock: ${formatFamilyLock(soundFamily)}.`,
    `Good handoff when ${satisfying}.`,
    `Reject when ${weakFailures}.`,
    `Incomplete when ${getFeelsIncomplete(soundFamily)}.`,
    `Interpret it as ${thinkingIntent.interpretation.join("; ")} and complete the full event arc ${expectedArc}.`,
    `Matches motion because ${motionLogic}.`,
    `Choose this because the event lands in sync with the animation, preserves the ${formatFamilyName(soundFamily)} family, and finishes the whole action instead of stopping at the peak moment.`,
    `Reject weaker versions because they become delayed, disconnected, generic, or incomplete.`,
    `Match the animation with ${plan.beats.join(" -> ")} and default to ${guidance.defaultIntensity} force when the prompt does not specify a lighter or heavier level.`,
    modifierGuidance ? `Modifier dimension: ${modifierGuidance.dimension}. Change, do not replace: ${modifierGuidance.change}.` : "Modifier system: only change attack, weight, intensity, texture, timing, decay, or layering. Never replace the family.",
    modifierGuidance ? `Correct behavior preserves ${modifierGuidance.preserve}.` : null,
    modifierGuidance ? `Wrong behavior would ${modifierGuidance.wrong}.` : null,
    `Human expectation requires a complete physical event, not just the peak moment.`,
  ]
    .filter((value): value is string => Boolean(value && value.trim().length > 0))
    .join(" ");
};

const buildConsistencyRules = ({
  userPrompt,
  requestSummary,
  soundFamily,
  constraints,
  goodOutputDescription,
}: {
  userPrompt: string;
  requestSummary: string;
  soundFamily: GenerateSoundFamily;
  constraints: string[];
  goodOutputDescription: string[];
}): string[] => {
  const modifierGuidance = getModifierGuidance({
    userPrompt,
    requestSummary,
  });
  return unique([
    `Preserve the ${formatFamilyName(soundFamily)} family identity.`,
    `Translate expectation into physics: ${getFamilyGuidance(soundFamily).physicalBuild}.`,
    "Match the requested animation timing, force, and scene context.",
    `Complete the required event shape: ${formatEventShape(soundFamily)}.`,
    `If intensity is unspecified, default to a ${getFamilyGuidance(soundFamily).defaultIntensity} human-expected level.`,
    "Do not stop at the peak moment; include the release, aftermath, or settle when the family needs it.",
    "Reject pop-only, peak-only, or aftermath-free results.",
    "Do not fall back to a soft pop, low hum, or generic safe version.",
    `Family lock: ${formatFamilyLock(soundFamily)}.`,
    "Modifiers may only change attack, weight, intensity, texture, timing, decay, or layering.",
    soundFamily === "continuation" || soundFamily === "scene-addition"
      ? "Continuation must feel like the same sound evolving. Changing family breaks immersion."
      : null,
    modifierGuidance ? `Modifier dimension: ${modifierGuidance.dimension}. Modify only the requested dimension: ${modifierGuidance.change}.` : null,
    modifierGuidance ? `Do not replace the family or timing role. Preserve ${modifierGuidance.preserve}.` : null,
    ...constraints.map((constraint) => `Honor constraint: ${constraint}.`),
    ...goodOutputDescription.slice(0, 2).map((note) => `Keep ${note}.`),
  ]);
};

const buildSoundQualityNotes = ({
  userPrompt,
  requestSummary,
  soundFamily,
  goodOutputDescription,
  badOutputDescription,
}: {
  userPrompt: string;
  requestSummary: string;
  soundFamily: GenerateSoundFamily;
  goodOutputDescription: string[];
  badOutputDescription: string[];
}): string[] => {
  const guidance = getFamilyGuidance(soundFamily);
  const modifierGuidance = getModifierGuidance({
    userPrompt,
    requestSummary,
  });
  const motionLogic = getMotionLogic({
    soundFamily,
    plan: {
      structureKind: "short-effect",
      beats: getExpectedArc(soundFamily),
    },
  });
  return unique([
    `good: Viewer expectation is ${guidance.humanExpectation}`,
    `good: Physical build is ${guidance.physicalBuild}`,
    `good: Engine handoff succeeds when ${unique([...guidance.satisfyingQualities, ...goodOutputDescription]).slice(0, 3).join("; ")}`,
    `good: Best because the event preserves family identity, matches the cue timing, and completes ${formatEventShape(soundFamily)}`,
    `good: Matches motion because ${motionLogic}`,
    `good: complete the full event shape ${formatEventShape(soundFamily)}`,
    `good: default to ${guidance.defaultIntensity} intensity unless the user asks for a different level`,
    `good: humans expect a complete physical event, not just the peak moment`,
    `good: family lock means ${formatFamilyLock(soundFamily)}`,
    `good: engine handoff stays explicit about type, timing, structure, intensity, texture, decay, and layering`,
    `good: match the strongest beat to the visible animation cue`,
    `good: modifiers only change attack, weight, intensity, texture, timing, decay, or layering`,
    `good: "hit harder" means more weight and sharper transient, not louder only`,
    `good: "sharper" means higher attack, not family drift`,
    `good: "softer" means lower intensity, not a different family`,
    `good: "crunchier" means more texture detail, not distortion spam`,
    `good: "shorter" means reduce decay, not remove impact`,
    `good: "cleaner" or "less distorted" means remove noise, not energy`,
    `good: "more bass" means more low-end body without turning into an explosion or burying the attack`,
    ...goodOutputDescription.slice(0, 4).map((note) => `good: ${note}`),
    modifierGuidance ? `good: modifier dimension is ${modifierGuidance.dimension}` : null,
    modifierGuidance ? `good: correct modifier behavior preserves ${modifierGuidance.preserve}` : null,
    modifierGuidance ? `good: change only ${modifierGuidance.change}` : null,
    `bad: reject when ${unique([...guidance.weakFailureModes, ...badOutputDescription]).slice(0, 3).join("; ")}`,
    `bad: incomplete when ${getFeelsIncomplete(soundFamily)}`,
    `bad: single-pop, pop-only, or peak-only shortcut`,
    `bad: missing release, settle, or aftermath`,
    `bad: repetitive generic ${soundFamily} output`,
    `bad: modifier switches to a different family`,
    `bad: "hit harder" becoming only louder`,
    `bad: "sharper" becoming a different family`,
    `bad: "softer" deleting the event body`,
    `bad: "crunchier" becoming distortion spam`,
    `bad: "shorter" deleting the impact body`,
    `bad: "cleaner" removing the energy`,
    `bad: "more bass" turning the sound into a muddy boom`,
    modifierGuidance ? `bad: wrong behavior would ${modifierGuidance.wrong}` : null,
    ...badOutputDescription.slice(0, 4).map((note) => `bad: ${note}`),
  ]);
};

const buildBadStyleNotes = ({
  userPrompt,
  requestSummary,
  soundFamily,
  badOutputDescription,
}: {
  userPrompt: string;
  requestSummary: string;
  soundFamily: GenerateSoundFamily;
  badOutputDescription: string[];
}): string[] => {
  const guidance = getFamilyGuidance(soundFamily);
  const modifierGuidance = getModifierGuidance({
    userPrompt,
    requestSummary,
  });
  return unique([
    `Do not drift out of the ${soundFamily} family.`,
    `Avoid weak ${soundFamily} outputs that skip ${formatEventShape(soundFamily)}.`,
    `Avoid repetitive default versions that sound the same on every request.`,
    "Avoid soft-pop defaults, low hum fallbacks, generic safe sounds, and single-transient shortcuts.",
    "Avoid pop-only or peak-only event shapes.",
    "Avoid modifier responses that replace the family instead of changing one requested dimension.",
    "Avoid vague planner language that does not tell the engine what behavior to execute.",
    `Family lock: ${formatFamilyLock(soundFamily)}.`,
    soundFamily === "continuation" || soundFamily === "scene-addition"
      ? "Changing family breaks immersion and makes continuation feel like a reset."
      : null,
    modifierGuidance ? `Wrong modifier behavior would ${modifierGuidance.wrong}.` : null,
    ...guidance.weakFailureModes.slice(0, 4).map((note) => `Avoid ${note}.`),
    ...badOutputDescription.slice(0, 4).map((note) => `Avoid ${note}.`),
  ]);
};

const buildResponseFocus = ({
  userPrompt,
  requestSummary,
  soundFamily,
  soundPlan: plan,
  goodOutputDescription,
  sequenceTimingNotes,
}: {
  userPrompt: string;
  requestSummary: string;
  soundFamily: GenerateSoundFamily;
  soundPlan: GenerateSoundPlan;
  goodOutputDescription: string[];
  sequenceTimingNotes: string[];
}): string[] => {
  const guidance = getFamilyGuidance(soundFamily);
  const modifierGuidance = getModifierGuidance({
    userPrompt,
    requestSummary,
  });
  return unique([
    `Human expectation: ${guidance.humanExpectation}.`,
    `Plan the physical build as ${guidance.physicalBuild}.`,
    `Complete the required event shape: ${formatEventShape(soundFamily)}.`,
    `Family lock: ${formatFamilyLock(soundFamily)}.`,
    `Good handoff when ${unique([...guidance.satisfyingQualities, ...goodOutputDescription]).slice(0, 2).join("; ")}.`,
    `Reject when ${guidance.weakFailureModes.slice(0, 2).join("; ")}.`,
    `Use ${guidance.defaultIntensity} force by default unless the user clearly asks for lighter or heavier energy.`,
    "Make the impact or strongest beat line up with the visible action timing.",
    "Finish the event cleanly instead of stopping at the peak moment.",
    "Prepare the response like engine instructions, not like generated-audio narration.",
    soundFamily === "continuation" || soundFamily === "scene-addition"
      ? "Continuation must feel like the same sound evolving, not a reset. Keep family identity and modify only the requested dimension."
      : null,
    modifierGuidance ? `Modifier dimension: ${modifierGuidance.dimension}. Change only ${modifierGuidance.change}.` : null,
    modifierGuidance ? `Preserve ${modifierGuidance.preserve}.` : null,
    ...sequenceTimingNotes.slice(0, 1),
    ...plan.beats.slice(0, 3).map((beat) => `Make ${beat} read clearly.`),
  ]);
};

const createStructuredSoundExample = (input: StructuredSoundExampleInput, exampleKind: GenerateSoundExampleKind): GenerateSoundExample => {
  const requestSummary = normalizeExampleRequestSummary({
    requestSummary: input.requestSummary,
    soundFamily: input.soundFamily,
    exampleKind,
  });
  const constraints = unique((input.constraints ?? []).map((constraint) => normalizeConstraintDirective(constraint)));
  const goodOutputDescription = input.goodOutputDescription;
  const badOutputDescription = input.badOutputDescription;
  const sequenceTimingNotes = unique((input.sequenceTimingNotes ?? []).map((note) => normalizeSequenceTimingNote(note)));
  const shouldAskQuestion = input.shouldAskQuestion ?? input.thinkingIntent.ambiguityPolicy === "ask-clarify";
  const shouldProceedWithoutQuestion = input.shouldProceedWithoutQuestion ?? !shouldAskQuestion;
  const maxQuestionsBeforeProceeding = input.maxQuestionsBeforeProceeding ?? (shouldAskQuestion ? 1 : 0);
  const tags = unique([...(SOUND_FAMILY_TAGS[input.soundFamily] ?? []), ...(input.tags ?? [])]);
  const knownFacts = unique([
    requestSummary,
    ...input.thinkingIntent.interpretation,
    ...input.thinkingIntent.animationExpectation,
    ...(input.knownFacts ?? []),
  ]);
  const missingFacts = unique(input.missingFacts ?? []);
  const strongestGap = input.strongestGap ?? missingFacts[0] ?? "";
  const bestQuestion = input.bestQuestion ?? null;
  const reasoning =
    input.reasoning ??
    buildReasoning({
      exampleKind,
      userPrompt: input.userPrompt,
      requestSummary,
      soundFamily: input.soundFamily,
      thinkingIntent: input.thinkingIntent,
      soundPlan: input.soundPlan,
      goodOutputDescription,
      badOutputDescription,
    });
  const responseFocus =
    input.responseFocus ??
    buildResponseFocus({
      userPrompt: input.userPrompt,
      requestSummary,
      soundFamily: input.soundFamily,
      soundPlan: input.soundPlan,
      goodOutputDescription,
      sequenceTimingNotes,
    });
  const consistencyRules =
    input.consistencyRules ??
    buildConsistencyRules({
      userPrompt: input.userPrompt,
      requestSummary,
      soundFamily: input.soundFamily,
      constraints,
      goodOutputDescription,
    });
  const soundQualityNotes =
    input.soundQualityNotes ??
    buildSoundQualityNotes({
      userPrompt: input.userPrompt,
      requestSummary,
      soundFamily: input.soundFamily,
      goodOutputDescription,
      badOutputDescription,
    });
  const badStyleNotes =
    input.badStyleNotes ??
    buildBadStyleNotes({
      userPrompt: input.userPrompt,
      requestSummary,
      soundFamily: input.soundFamily,
      badOutputDescription,
    });

  return {
    id: input.id,
    mode: "generate-sounds",
    exampleKind,
    category: input.category,
    userPrompt: input.userPrompt,
    requestSummary,
    soundFamily: input.soundFamily,
    thinkingIntent: input.thinkingIntent,
    soundPlan: input.soundPlan,
    goodOutputDescription,
    badOutputDescription,
    constraints,
    sequenceTimingNotes,
    soundIntent:
      buildSoundIntent({
        userPrompt: input.userPrompt,
        requestSummary,
        soundFamily: input.soundFamily,
        thinkingIntent: input.thinkingIntent,
        soundPlan: input.soundPlan,
        goodOutputDescription,
        badOutputDescription,
        constraints,
      }) + (sequenceTimingNotes.length ? `. timing: ${sequenceTimingNotes.join("; ")}` : ""),
    knownFacts,
    missingFacts,
    strongestGap,
    bestQuestion,
    acceptableOptions: unique(input.acceptableOptions ?? []),
    badQuestions:
      input.badQuestions ??
      (shouldAskQuestion
        ? ["What kind of sound do you want?", "Should I just make something cool?", "Do you want me to guess the timing?"]
        : []),
    reasoning,
    shouldAskQuestion,
    shouldProceedWithoutQuestion,
    maxQuestionsBeforeProceeding,
    responseFocus,
    consistencyRules,
    soundQualityNotes,
    badStyleNotes,
    tags,
    version: TRAINING_VERSION,
    isActive: true,
  };
};

const createGoodSoundExample = (input: StructuredSoundExampleInput): GenerateSoundExample =>
  createStructuredSoundExample(input, "good");

const createBadSoundExample = (input: StructuredSoundExampleInput): GenerateSoundExample =>
  createStructuredSoundExample(input, "bad");

const GOOD_CORE_SOUND_TRAINING_EXAMPLES: GenerateSoundExample[] = [
  createGoodSoundExample({
    id: "good-explosion-canonical",
    category: "core/explosion",
    userPrompt: "Generate an explosion sound",
    requestSummary: "Canonical explosion event with a powerful blast and readable decay.",
    soundFamily: "explosion",
    thinkingIntent: thinking(
      "single-sound",
      ["treat the request as a full explosive event, not a single pop", "explosion needs force, body, and decay"],
      ["the blast should land on the explosion moment", "the tail should read as debris and residue, not a musical drone"],
    ),
    soundPlan: soundPlan("short-effect", ["pressure hit", "heavy blast body", "debris decay"]),
    goodOutputDescription: ["powerful boom", "satisfying blast body", "readable decay that resolves cleanly"],
    badOutputDescription: ["tiny pop", "balloon-burst feel", "no decay"],
    constraints: ["keep the explosion strong and clean", "do not turn it into a sci-fi drone"],
    sequenceTimingNotes: ["the attack lands on the blast frame", "the debris tail should finish quickly enough to leave room for follow-up action"],
    tags: ["canonical"],
  }),
  createGoodSoundExample({
    id: "good-explosion-stronger",
    category: "core/explosion",
    userPrompt: "Generate a stronger explosion sound",
    requestSummary: "Stronger explosion variant with more weight and tail without leaving the family.",
    soundFamily: "explosion",
    thinkingIntent: thinking(
      "single-sound",
      ["keep the explosion family but increase force and scale", "stronger means harder attack and heavier body, not muddy low end"],
      ["the peak should feel heavier than the canonical blast", "the tail should still resolve cleanly"],
    ),
    soundPlan: soundPlan("short-effect", ["tight pressure swell", "harder blast peak", "heavier debris tail"]),
    goodOutputDescription: ["bigger body", "harder impact front", "heavier but still controlled decay"],
    badOutputDescription: ["same weak blast made louder", "muddy bass blob", "indistinct tail"],
    constraints: ["stay explosive", "avoid distortion masking the attack"],
    sequenceTimingNotes: ["the stronger peak should still hit immediately, not lag behind the animation"],
  }),
  createGoodSoundExample({
    id: "good-explosion-clean",
    category: "core/explosion",
    userPrompt: "Generate a clean explosion sound",
    requestSummary: "Clean explosion that stays forceful while reducing mud and clutter.",
    soundFamily: "explosion",
    thinkingIntent: thinking(
      "single-sound",
      ["clean means clearer attack and controlled low end, not weaker scale", "the family identity is still explosion"],
      ["the blast should stay readable under animation", "the tail should not smear into the next beat"],
    ),
    soundPlan: soundPlan("short-effect", ["tight transient", "full blast body", "controlled residue"]),
    goodOutputDescription: ["clear front edge", "powerful but uncluttered body", "controlled debris tail"],
    badOutputDescription: ["soft balloon pop", "fuzzy distortion cloud", "washed-out decay"],
    constraints: ["keep the attack readable", "avoid muddy low-end bloom"],
    sequenceTimingNotes: ["this version should leave more room under dialogue or layered action"],
  }),
  createGoodSoundExample({
    id: "good-explosion-distant",
    category: "core/explosion",
    userPrompt: "Generate a distant explosion sound",
    requestSummary: "Distant explosion whose perspective changes but family identity stays clear.",
    soundFamily: "explosion",
    thinkingIntent: thinking(
      "single-sound",
      ["distance should change perspective and tail shape, not erase the explosion family", "the sound should feel farther away without becoming a tiny pop"],
      ["the attack can be softer than a close blast", "the tail should suggest outdoor space"],
    ),
    soundPlan: soundPlan("short-effect", ["muted distant attack", "receded blast body", "longer far-off decay"]),
    goodOutputDescription: ["believable distant perspective", "clear explosion identity", "far-space tail"],
    badOutputDescription: ["close-up punch hit", "tiny toy pop", "generic low drone"],
    constraints: ["keep the event readable as an explosion", "do not make it feel close to camera"],
    sequenceTimingNotes: ["the onset still aligns with the blast frame even though it feels distant"],
  }),
  createGoodSoundExample({
    id: "good-lightning-canonical",
    category: "core/lightning-thunder-electricity",
    userPrompt: "Generate lightning",
    requestSummary: "Canonical lightning strike with a sharp crack and quick electric finish.",
    soundFamily: "lightning",
    thinkingIntent: thinking(
      "single-sound",
      ["treat lightning as a strike event, not a hum or pad", "the family should feel sharp, electric, and fast"],
      ["the crack should land on the strike", "the tail should collapse quickly instead of lingering"],
    ),
    soundPlan: soundPlan("short-effect", ["sharp crack attack", "bright electrical body", "fast sizzle decay"]),
    goodOutputDescription: ["sharp electric crack", "bright energy", "quick finish"],
    badOutputDescription: ["alien hum", "bass wobble", "slow mushy pad"],
    constraints: ["no UFO tone", "no lingering synth sustain"],
    sequenceTimingNotes: ["the crack lands exactly on the lightning strike frame"],
    tags: ["canonical", "timing-lock"],
  }),
  createGoodSoundExample({
    id: "good-lightning-sharp",
    category: "core/lightning-thunder-electricity",
    userPrompt: "Generate a sharp lightning strike",
    requestSummary: "Sharper lightning variant that emphasizes edge and speed instead of bass weight.",
    soundFamily: "lightning",
    thinkingIntent: thinking(
      "single-sound",
      ["sharp lightning means more snap and edge, not deeper low-end rumble", "the family still needs a clean electric arc texture"],
      ["the onset should feel almost instantaneous", "the tail should stay short"],
    ),
    soundPlan: soundPlan("short-effect", ["needle-sharp crack", "focused electric arc", "hard stop"]),
    goodOutputDescription: ["hard electric cut", "focused brightness", "very fast exit"],
    badOutputDescription: ["thick glowing mush", "boomy rumble", "soft lingering buzz"],
    constraints: ["keep it brief", "do not soften the attack"],
    sequenceTimingNotes: ["this version should feel even faster than the canonical strike"],
  }),
  createGoodSoundExample({
    id: "good-lightning-forked",
    category: "core/lightning-thunder-electricity",
    userPrompt: "Generate forked lightning",
    requestSummary: "Forked lightning with one dominant strike and secondary branch detail.",
    soundFamily: "lightning",
    thinkingIntent: thinking(
      "single-sound",
      ["the main strike must stay dominant while branch detail stays supportive", "forked detail should add texture without clutter"],
      ["the first crack should read as the main branch", "the finish should still vanish quickly"],
    ),
    soundPlan: soundPlan("short-effect", ["dominant crack", "branching electrical detail", "quick fade"]),
    goodOutputDescription: ["clear lead strike", "supporting branch texture", "brief electric tail"],
    badOutputDescription: ["spark clutter with no main hit", "blob-like shimmer", "slow synthetic swell"],
    constraints: ["branches stay secondary", "keep the family readable"],
    sequenceTimingNotes: ["the main strike leads and the branch texture follows immediately after"],
  }),
  createGoodSoundExample({
    id: "good-lightning-fast-vanish",
    category: "core/lightning-thunder-electricity",
    userPrompt: "Generate lightning that vanishes fast",
    requestSummary: "Lightning strike with a deliberately brief finish.",
    soundFamily: "lightning",
    thinkingIntent: thinking(
      "single-sound",
      ["the brief ending is part of the family behavior", "the finish should collapse instead of sustaining"],
      ["the sound should disappear quickly after the strike", "the decay should never feel like a beam loop"],
    ),
    soundPlan: soundPlan("short-effect", ["flash crack", "tiny electrical tail", "hard stop"]),
    goodOutputDescription: ["fast vanish", "tight strike timing", "clean cutoff"],
    badOutputDescription: ["lingering line", "long electric drone", "slow synth wash"],
    constraints: ["keep the tail extremely short"],
    sequenceTimingNotes: ["the finish should be over almost immediately after the strike frame"],
  }),
  createGoodSoundExample({
    id: "good-fireball-launch",
    category: "core/fireball-projectile",
    userPrompt: "Generate a fireball launch sound from the right hand",
    requestSummary: "Hand-launched fireball with a clear cast-and-release profile.",
    soundFamily: "fireball-projectile",
    thinkingIntent: thinking(
      "single-sound",
      ["the sound should read from the hand source into the projectile launch", "it needs motion and energy identity, not a static flame loop"],
      ["the launch should line up with the release pose", "the travel tail should imply movement away from the hand"],
    ),
    soundPlan: soundPlan("short-effect", ["charge cue", "launch burst", "short travel tail"]),
    goodOutputDescription: ["clear cast release", "directional projectile motion", "energy identity that stays readable"],
    badOutputDescription: ["floating orb hum", "generic laser zap", "idle fire loop"],
    constraints: ["keep the source feeling hand-cast", "do not turn it into a gunshot"],
    sequenceTimingNotes: ["the launch burst lands on the hand release frame"],
    tags: ["canonical"],
  }),
  createGoodSoundExample({
    id: "good-fireball-travel",
    category: "core/fireball-projectile",
    userPrompt: "Generate a fireball traveling past camera",
    requestSummary: "Projectile travel sound that clearly reads motion and direction.",
    soundFamily: "fireball-projectile",
    thinkingIntent: thinking(
      "single-sound",
      ["focus on the passing projectile motion, not only the launch", "keep the sound in the fireball family instead of generic sci-fi sweep"],
      ["the motion should feel directional", "the pass should move cleanly through frame"],
    ),
    soundPlan: soundPlan("short-effect", ["launch presence", "passing energy body", "receding tail"]),
    goodOutputDescription: ["strong directional travel", "passing motion read", "projectile energy without clutter"],
    badOutputDescription: ["static flame bed", "flat laser tone", "no sense of motion"],
    constraints: ["keep the fireball identity during the pass"],
    sequenceTimingNotes: ["the loudest point should line up with the closest pass moment"],
  }),
  createGoodSoundExample({
    id: "good-fireball-impact",
    category: "core/fireball-projectile",
    userPrompt: "Generate a fireball impact sound",
    requestSummary: "Projectile impact that resolves a fireball into a clear hit event.",
    soundFamily: "fireball-projectile",
    thinkingIntent: thinking(
      "single-sound",
      ["the impact should keep the projectile's fiery identity while adding hit force", "this is not just a punch or generic explosion"],
      ["the impact attack should land on contact", "the tail should imply heat and breakup, not endless sustain"],
    ),
    soundPlan: soundPlan("short-effect", ["impact crack", "fiery body", "short ember tail"]),
    goodOutputDescription: ["impact plus fire identity", "clear contact front", "brief ember finish"],
    badOutputDescription: ["plain punch hit", "random laser", "explosion boom that erases the projectile identity"],
    constraints: ["keep it tied to the incoming projectile family"],
    sequenceTimingNotes: ["the attack lands on the impact frame and the ember tail follows immediately after"],
  }),
  createGoodSoundExample({
    id: "good-fireball-airborne-attack",
    category: "core/fireball-projectile",
    userPrompt: "Generate an airborne fireball attack sound",
    requestSummary: "Airborne projectile attack with clear release and motion aggression.",
    soundFamily: "fireball-projectile",
    thinkingIntent: thinking(
      "single-sound",
      ["include the feeling of an attacking cast, not just a neutral projectile", "the sound should still stay readable as a fireball release"],
      ["the cast onset should align with the airborne attack moment", "the projectile motion should immediately follow"],
    ),
    soundPlan: soundPlan("short-effect", ["airborne cast cue", "launch release", "aggressive travel tail"]),
    goodOutputDescription: ["attack energy", "readable cast-to-launch motion", "controlled aggressive finish"],
    badOutputDescription: ["idle flame loop", "detached explosion blast", "laser beam sustain"],
    constraints: ["feel offensive, not ambient"],
    sequenceTimingNotes: ["the cast cue should not delay the actual release beat"],
  }),
  createGoodSoundExample({
    id: "good-punch-impact-canonical",
    category: "core/punch-impact",
    userPrompt: "Generate a punch impact sound",
    requestSummary: "Canonical punch hit with contact snap and body weight.",
    soundFamily: "punch-impact",
    thinkingIntent: thinking(
      "single-sound",
      ["punch is a short body-force event with a tiny drive-in before contact", "it should not be mistaken for an explosion or weapon swing"],
      ["a micro lead-in can support the contact without turning into a whoosh", "the attack lands exactly on contact and resolves in a short follow-through"],
    ),
    soundPlan: soundPlan("single-hit", ["micro drive-in cue", "contact snap", "short body follow-through"]),
    goodOutputDescription: ["clear hit", "forceful contact", "tight readable follow-through instead of a pop"],
    badOutputDescription: ["weak tap", "explosion boom", "random whoosh with no hit"],
    constraints: ["keep it concise", "do not smear the impact timing"],
    sequenceTimingNotes: ["the drive-in stays tiny and the impact front must hit the exact contact frame before resolving quickly"],
    tags: ["canonical", "timing-lock"],
  }),
  createGoodSoundExample({
    id: "good-punch-impact-heavier",
    category: "core/punch-impact",
    userPrompt: "Generate a heavier punch impact",
    requestSummary: "Heavier punch that keeps punch-family timing while increasing mass.",
    soundFamily: "punch-impact",
    thinkingIntent: thinking(
      "single-sound",
      ["heavier means denser body weight and slightly firmer drive-in, not longer mush", "the punch family still needs a quick front edge and short resolution"],
      ["the hit should feel stronger than the canonical punch", "timing precision and follow-through clarity should remain intact"],
    ),
    soundPlan: soundPlan("single-hit", ["firmer drive-in cue", "hard transient", "tight heavier follow-through"]),
    goodOutputDescription: ["more mass", "strong contact front", "short controlled heavier finish"],
    badOutputDescription: ["same weak slap", "muddy impact blob", "slow late hit"],
    constraints: ["keep it readable under action"],
    sequenceTimingNotes: ["the extra weight should not delay the contact cue or stretch the aftermath too long"],
  }),
  createGoodSoundExample({
    id: "good-punch-impact-timing-lock",
    category: "core/punch-impact",
    userPrompt: "Make the punch hit exactly when the fist connects",
    requestSummary: "Punch impact with explicit timing lock to the contact frame.",
    soundFamily: "punch-impact",
    thinkingIntent: thinking(
      "timing-lock",
      ["preserve the punch family but lock the contact to the exact frame", "do not guess a looser timing window or erase the tiny lead-in and finish"],
      ["the impact should land on fist contact with no pre-hit smear", "the follow-through should stay short so the timing reads clearly"],
    ),
    soundPlan: soundPlan("single-hit", ["micro pre-hit cue", "zero-lag contact snap", "short release"]),
    goodOutputDescription: ["frame-accurate contact hit", "clean force read", "no pre-hit smear and no missing finish"],
    badOutputDescription: ["early hit", "late thud", "dragging tail that hides the contact moment"],
    constraints: ["timing lock is more important than extra texture"],
    sequenceTimingNotes: ["the contact snap must sync to the exact contact frame while the tiny lead-in and short finish stay intact"],
    tags: ["timing-lock"],
  }),
  createGoodSoundExample({
    id: "good-punch-impact-two-beat",
    category: "core/punch-impact",
    userPrompt: "Generate one punch sound and a follow-up reaction hit",
    requestSummary: "Two-beat punch sequence with a primary hit and a readable reaction follow-up.",
    soundFamily: "punch-impact",
    thinkingIntent: thinking(
      "single-sound",
      ["treat this as a short two-beat sequence, not one merged blob", "the first hit should stay dominant and the follow-up should read as secondary"],
      ["the beats should be clearly separated", "the reaction hit should not replace the main contact"],
    ),
    soundPlan: soundPlan("multi-beat-sequence", ["lead punch impact", "small spacing gap", "reaction hit"]),
    goodOutputDescription: ["clear two-beat shape", "dominant first hit", "readable reaction follow-up"],
    badOutputDescription: ["noise pile", "both hits merged together", "reaction louder than the main punch"],
    constraints: ["maintain beat separation"],
    sequenceTimingNotes: ["the first impact lands on contact and the second beat follows the reaction frame"],
  }),
  createGoodSoundExample({
    id: "good-kick-impact-canonical",
    category: "core/kick-impact",
    userPrompt: "Generate a kick impact sound",
    requestSummary: "Canonical kick hit with leg-led contact and heavier body transfer than a punch.",
    soundFamily: "kick-impact",
    thinkingIntent: thinking(
      "single-sound",
      ["kick should not collapse into punch timing or texture", "the sound should feel leg-driven or shoe-led before the body weight arrives"],
      ["the hit lands on the kick contact", "the body transfer should follow immediately after"],
    ),
    soundPlan: soundPlan("single-hit", ["leg swing cue", "shoe-led contact", "body transfer settle"]),
    goodOutputDescription: ["leg-driven contact", "heavier body transfer", "clear distinction from a punch and a readable finish"],
    badOutputDescription: ["copied punch sound", "whoosh with no hit", "explosion-like boom"],
    constraints: ["keep the kick family distinct from punch"],
    sequenceTimingNotes: ["the swing cue should lead the foot strike and the settle should resolve right after the contact"],
    tags: ["canonical"],
  }),
  createGoodSoundExample({
    id: "good-kick-impact-spinning",
    category: "core/kick-impact",
    userPrompt: "Generate a spinning kick whoosh into impact",
    requestSummary: "Spinning kick that includes motion support before the impact.",
    soundFamily: "kick-impact",
    thinkingIntent: thinking(
      "single-sound",
      ["the kick needs both swing motion and contact", "the whoosh supports the impact instead of replacing it"],
      ["the spin should lead into the hit", "the impact must still be the payoff"],
    ),
    soundPlan: soundPlan("multi-beat-sequence", ["swing whoosh", "kick contact", "tiny settle"]),
    goodOutputDescription: ["clear motion-to-contact arc", "readable spin setup", "impact still dominates"],
    badOutputDescription: ["impact only with no swing read", "whoosh only and no hit", "weapon-like slash instead of body kick"],
    constraints: ["keep the motion cue supportive, not louder than the impact"],
    sequenceTimingNotes: ["the whoosh leads the contact by a fraction and the hit lands on kick contact"],
  }),
  createGoodSoundExample({
    id: "good-kick-impact-wall",
    category: "core/kick-impact",
    userPrompt: "Generate a kick that knocks someone into a wall",
    requestSummary: "Kick impact followed by a secondary wall collision.",
    soundFamily: "kick-impact",
    thinkingIntent: thinking(
      "single-sound",
      ["this is a linked two-hit event with a kick first and a wall hit second", "keep the primary kick family clear before the wall slam arrives"],
      ["the kick lands first", "the wall collision follows with distinct spacing"],
    ),
    soundPlan: soundPlan("multi-beat-sequence", ["kick contact", "body travel gap", "wall collision"]),
    goodOutputDescription: ["readable first and second hit", "clear wall-material follow-up", "kick remains the initiating event"],
    badOutputDescription: ["one mushy boom", "wall hit comes first", "generic explosion blast"],
    constraints: ["preserve the order of events"],
    sequenceTimingNotes: ["the kick lands first and the wall hit waits until the body collision frame"],
  }),
  createGoodSoundExample({
    id: "good-body-impact-hard-landing",
    category: "core/body-impact",
    userPrompt: "Generate a hard landing impact",
    requestSummary: "Body-impact landing sound for a heavy character or forceful drop.",
    soundFamily: "body-impact",
    thinkingIntent: thinking(
      "single-sound",
      ["treat this as a landing or body drop, not a punch or kick", "the impact should feel broad and grounded"],
      ["the attack lands on the landing frame", "the low body weight follows immediately after"],
    ),
    soundPlan: soundPlan("single-hit", ["broad impact transient", "grounded body weight", "short floor release"]),
    goodOutputDescription: ["broad heavy landing", "grounded weight", "clear floor contact"],
    badOutputDescription: ["tiny fist hit", "weapon whoosh", "springy cartoon bounce"],
    constraints: ["keep it grounded"],
    sequenceTimingNotes: ["the impact onset lands on the exact landing frame"],
  }),
  createGoodSoundExample({
    id: "good-body-impact-slam",
    category: "core/body-impact",
    userPrompt: "Generate a body slam impact",
    requestSummary: "Body slam with bigger mass and floor weight than a punch or kick.",
    soundFamily: "body-impact",
    thinkingIntent: thinking(
      "single-sound",
      ["body slam should read as full-body mass hitting a surface", "it should not be confused with punch or explosion families"],
      ["the broad hit lands on impact", "the floor weight should bloom briefly and stop"],
    ),
    soundPlan: soundPlan("single-hit", ["wide impact front", "heavy body drop", "short surface resonance"]),
    goodOutputDescription: ["weighty slam", "full-body mass", "brief grounded resonance"],
    badOutputDescription: ["tiny punch tick", "explosion boom", "long muddy rumble"],
    constraints: ["keep the resonance short"],
    sequenceTimingNotes: ["the main impact aligns with the body-slam contact frame"],
  }),
  createGoodSoundExample({
    id: "good-footsteps-sneaking",
    category: "core/footsteps",
    userPrompt: "Generate sneaking footsteps",
    requestSummary: "Quiet footsteps that read cautious intent and restrained rhythm.",
    soundFamily: "footsteps",
    thinkingIntent: thinking(
      "single-sound",
      ["sneaking footsteps should be light and deliberate, not heavy or evenly marched", "footstep rhythm must match careful movement"],
      ["the spacing should imply caution", "the contacts should stay quiet"],
    ),
    soundPlan: soundPlan("multi-beat-sequence", ["soft step", "brief silence", "soft step"]),
    goodOutputDescription: ["quiet deliberate rhythm", "light surface contact", "tension through spacing"],
    badOutputDescription: ["heavy stomps", "same loud step each time", "flat march cadence"],
    constraints: ["keep it quiet"],
    sequenceTimingNotes: ["leave meaningful gaps between steps so the sneaking intent reads"],
    tags: ["canonical"],
  }),
  createGoodSoundExample({
    id: "good-footsteps-running-concrete",
    category: "core/footsteps",
    userPrompt: "Generate running footsteps on concrete",
    requestSummary: "Fast concrete footstep cadence with clear surface identity.",
    soundFamily: "footsteps",
    thinkingIntent: thinking(
      "single-sound",
      ["running needs faster cadence and harder surface texture than walking", "the concrete material should be audible"],
      ["the rhythm should feel fast", "the texture should feel hard and dry"],
    ),
    soundPlan: soundPlan("multi-beat-sequence", ["fast cadence", "concrete contacts", "stop or recede finish"]),
    goodOutputDescription: ["speed read", "hard-surface texture", "consistent running rhythm"],
    badOutputDescription: ["same slow step repeated", "muddy soft ground texture", "no cadence change from walking"],
    constraints: ["keep the surface readable"],
    sequenceTimingNotes: ["the step spacing should tighten to match the run animation"],
    tags: ["canonical"],
  }),
  createGoodSoundExample({
    id: "good-footsteps-large-character",
    category: "core/footsteps",
    userPrompt: "Generate heavy footsteps for a large character",
    requestSummary: "Large-character footsteps with extra mass and slower step weight.",
    soundFamily: "footsteps",
    thinkingIntent: thinking(
      "single-sound",
      ["scale should change weight and cadence", "the sound should feel heavier than ordinary footsteps without becoming an explosion"],
      ["each step should feel massive", "the rhythm should reflect a larger stride"],
    ),
    soundPlan: soundPlan("multi-beat-sequence", ["heavy step", "subtle body follow", "next heavy step"]),
    goodOutputDescription: ["massive stride feel", "clear heavy contacts", "larger-scale cadence"],
    badOutputDescription: ["light sneaker taps", "identical normal-sized steps", "explosion booms instead of footsteps"],
    constraints: ["keep it in the footsteps family"],
    sequenceTimingNotes: ["give each footfall room to feel heavy before the next step arrives"],
  }),
  createGoodSoundExample({
    id: "good-footsteps-stop-turn",
    category: "core/footsteps",
    userPrompt: "Generate footsteps that stop and turn",
    requestSummary: "Footstep sequence where motion ends in a planted stop and pivot.",
    soundFamily: "footsteps",
    thinkingIntent: thinking(
      "single-sound",
      ["the stop and turn are part of the event, not just repeated steps", "the pivot should sound distinct from the approach"],
      ["approach steps should lead into a firm plant", "the pivot scuff should read clearly after the stop"],
    ),
    soundPlan: soundPlan("multi-beat-sequence", ["approach steps", "plant stop", "pivot scuff"]),
    goodOutputDescription: ["readable movement change", "clear stopping plant", "distinct turn scuff"],
    badOutputDescription: ["flat repeated loop", "no stop emphasis", "pivot missing completely"],
    constraints: ["preserve the stop-then-turn order"],
    sequenceTimingNotes: ["the plant should hit on the stop frame and the scuff follows on the turn"],
  }),
  createGoodSoundExample({
    id: "good-footsteps-dry-leaves",
    category: "core/footsteps",
    userPrompt: "Generate running footsteps on dry leaves",
    requestSummary: "Footsteps whose rhythm and material both read through dry leaf texture.",
    soundFamily: "footsteps",
    thinkingIntent: thinking(
      "single-sound",
      ["surface texture matters as much as cadence", "dry leaves should add crisp rustle around each foot contact"],
      ["the pace should still read as running", "the material should clearly feel leafy rather than concrete"],
    ),
    soundPlan: soundPlan("multi-beat-sequence", ["fast foot rhythm", "leaf crunch-rustle contacts", "light runout"]),
    goodOutputDescription: ["running cadence plus leaf texture", "surface-specific crunch", "clear motion"],
    badOutputDescription: ["plain concrete steps", "looped rustle with no rhythm", "same identical crunch every step"],
    constraints: ["do not lose the surface identity"],
    sequenceTimingNotes: ["each contact should pair the step timing with a leaf-specific crunch"],
  }),
  createGoodSoundExample({
    id: "good-breathing-hard",
    category: "core/breathing",
    userPrompt: "Generate breathing hard",
    requestSummary: "Labored breathing that reads exertion instead of calm idle motion.",
    soundFamily: "breathing",
    thinkingIntent: thinking(
      "single-sound",
      ["hard breathing means fatigue rhythm and effort", "it should not sound calm or neutral"],
      ["inhale and exhale should both read", "the cycle should feel strained"],
    ),
    soundPlan: soundPlan("multi-beat-sequence", ["labored inhale", "heavier exhale", "partial reset"]),
    goodOutputDescription: ["effort read", "clear fatigue rhythm", "body-led inhale and exhale"],
    badOutputDescription: ["calm idle breathing", "flat hiss noise", "no human rhythm"],
    constraints: ["keep it human and exerted"],
    sequenceTimingNotes: ["the inhale and exhale spacing should feel tired rather than relaxed"],
    tags: ["canonical"],
  }),
  createGoodSoundExample({
    id: "good-breathing-catching-breath",
    category: "core/breathing",
    userPrompt: "Generate a tired character catching their breath",
    requestSummary: "Fatigue breathing with a small recovery arc after exertion.",
    soundFamily: "breathing",
    thinkingIntent: thinking(
      "single-sound",
      ["the sound should show recovery from exertion, not a steady loop", "the breaths should feel ragged before settling slightly"],
      ["the early breaths should feel heavier", "later breaths can ease a little without becoming calm"],
    ),
    soundPlan: soundPlan("multi-beat-sequence", ["ragged inhale", "dragged exhale", "slower recovery breath"]),
    goodOutputDescription: ["exhaustion and recovery both read", "clear fatigue arc", "breathing stays human"],
    badOutputDescription: ["neutral idle loop", "constant hiss", "sudden full calmness"],
    constraints: ["show recovery without losing fatigue"],
    sequenceTimingNotes: ["the first breath should feel heaviest and the later one should ease slightly"],
  }),
  createGoodSoundExample({
    id: "good-breathing-calm",
    category: "core/breathing",
    userPrompt: "Generate calm breathing in a quiet scene",
    requestSummary: "Soft breathing loop that stays subtle but still readable.",
    soundFamily: "breathing",
    thinkingIntent: thinking(
      "single-sound",
      ["calm breathing should stay restrained and clean", "quiet does not mean completely inaudible or dead"],
      ["the inhale and exhale should feel even", "the sound should leave room for the scene"],
    ),
    soundPlan: soundPlan("multi-beat-sequence", ["soft inhale", "soft exhale"]),
    goodOutputDescription: ["clean restrained loop", "subtle human breath", "quiet but readable motion"],
    badOutputDescription: ["panting", "dead silence", "noisy air hiss"],
    constraints: ["stay soft and unobtrusive"],
    sequenceTimingNotes: ["the breath cycle should be slower and calmer than the hard-breathing variants"],
  }),
  createGoodSoundExample({
    id: "good-ambience-creepy-hallway",
    category: "core/room-tone-hallway",
    userPrompt: "Generate creepy hallway ambience",
    requestSummary: "Sparse hallway ambience that supports tension without cluttering the scene.",
    soundFamily: "environment-ambience",
    thinkingIntent: thinking(
      "single-sound",
      ["ambience should support the space and mood without becoming foreground action", "a hallway should feel empty and tense rather than musically busy"],
      ["the sound bed should leave room for movement or dialogue", "small details should stay sparse"],
    ),
    soundPlan: soundPlan("layered-bed", ["thin room tone", "distant hum", "sparse creak detail"]),
    goodOutputDescription: ["empty tense space", "restrained detail", "room identity without clutter"],
    badOutputDescription: ["busy horror soup", "constant musical pad", "foreground noise pile"],
    constraints: ["leave room for main action", "do not crowd the scene"],
    sequenceTimingNotes: ["treat this as a support bed, not a loud event"],
    tags: ["canonical"],
  }),
  createGoodSoundExample({
    id: "good-ambience-forest-night",
    category: "core/environment-forest-night",
    userPrompt: "Generate forest night ambience",
    requestSummary: "Outdoor night ambience with readable forest identity and restrained detail.",
    soundFamily: "environment-ambience",
    thinkingIntent: thinking(
      "single-sound",
      ["the environment bed should read as an outdoor forest at night", "it should support the scene without drawing focus"],
      ["the atmosphere should stay sparse", "the identity should come from subtle environmental cues"],
    ),
    soundPlan: soundPlan("layered-bed", ["night insects", "light wind", "occasional distant texture"]),
    goodOutputDescription: ["clear outdoor night read", "restrained forest detail", "supportive ambience bed"],
    badOutputDescription: ["indoor electrical hum", "random synth pad", "too many busy creature layers"],
    constraints: ["stay restrained"],
    sequenceTimingNotes: ["keep the ambience steady and non-distracting under animation"],
  }),
  createGoodSoundExample({
    id: "good-ambience-cave",
    category: "core/environment-cave",
    userPrompt: "Generate cave ambience",
    requestSummary: "Cave ambience with stone space, air, and small environmental detail.",
    soundFamily: "environment-ambience",
    thinkingIntent: thinking(
      "single-sound",
      ["the cave should feel like enclosed stone space, not a generic hallway", "small damp or stone details should support the main air bed"],
      ["the ambience should stay spacious", "the detail should remain subtle"],
    ),
    soundPlan: soundPlan("layered-bed", ["cave air bed", "tiny drips", "soft stone resonance"]),
    goodOutputDescription: ["cave identity", "air and space read", "subtle stone detail"],
    badOutputDescription: ["generic indoor hum", "musical drone", "loud water splash loop"],
    constraints: ["keep it environmental, not musical"],
    sequenceTimingNotes: ["the ambience should sustain evenly as a scene bed"],
  }),
  createGoodSoundExample({
    id: "good-ambience-neighborhood",
    category: "core/environment-neighborhood",
    userPrompt: "Generate neighborhood ambience with distant background motion",
    requestSummary: "Neighborhood scene bed with soft life in the distance and no foreground clutter.",
    soundFamily: "environment-ambience",
    thinkingIntent: thinking(
      "single-sound",
      ["the place should read as a neighborhood, not a busy city center or empty void", "background life should stay distant"],
      ["the ambience should support a setup scene", "distant motion should never overpower the foreground"],
    ),
    soundPlan: soundPlan("layered-bed", ["base outdoor air", "distant neighborhood texture", "calm sustain"]),
    goodOutputDescription: ["place identity", "distant life without distraction", "supportive outdoor bed"],
    badOutputDescription: ["foreground chaos", "loud traffic wall", "random musical wash"],
    constraints: ["background support only"],
    sequenceTimingNotes: ["this should behave like a stable setup-scene bed"],
  }),
  createGoodSoundExample({
    id: "good-whoosh-sword-swing",
    category: "core/whoosh-swing",
    userPrompt: "Generate a sword swing whoosh",
    requestSummary: "Directional weapon swing whoosh that supports motion but does not fake an impact.",
    soundFamily: "whoosh-swing",
    thinkingIntent: thinking(
      "single-sound",
      ["whoosh is a movement support sound, not a hit", "a sword swing should feel directional and clean"],
      ["the whoosh should lead the visible swing", "it should stop before any contact unless impact is requested"],
    ),
    soundPlan: soundPlan("short-effect", ["air slice onset", "directional sweep", "quick taper"]),
    goodOutputDescription: ["speed and direction read", "clean weapon motion", "no fake contact"],
    badOutputDescription: ["impact thud", "windy blob", "slow sweeping pad"],
    constraints: ["do not add an impact unless asked"],
    sequenceTimingNotes: ["the whoosh should ride the swing arc and finish before contact"],
    tags: ["canonical"],
  }),
  createGoodSoundExample({
    id: "good-whoosh-heavy-staff",
    category: "core/whoosh-swing",
    userPrompt: "Generate a heavy staff swing sound",
    requestSummary: "Heavier swing sound that implies larger mass moving through air.",
    soundFamily: "whoosh-swing",
    thinkingIntent: thinking(
      "single-sound",
      ["heavier swing means thicker air movement and more inertia than a thin sword whistle", "it is still a motion sound, not a hit"],
      ["the onset should imply the weapon committing to motion", "the finish should taper cleanly"],
    ),
    soundPlan: soundPlan("short-effect", ["weighty sweep onset", "thicker whoosh body", "controlled cutoff"]),
    goodOutputDescription: ["weapon weight read", "clear motion arc", "heavier air movement"],
    badOutputDescription: ["thin sword whistle", "impact thump", "muddy wind bed"],
    constraints: ["keep it movement-led"],
    sequenceTimingNotes: ["the heavier whoosh should still sync to the swing arc, not lag behind it"],
  }),
  createGoodSoundExample({
    id: "good-whoosh-dodge",
    category: "core/whoosh-swing",
    userPrompt: "Generate a dodge whoosh",
    requestSummary: "Short body-movement whoosh for an evasive action.",
    soundFamily: "whoosh-swing",
    thinkingIntent: thinking(
      "single-sound",
      ["this is body movement through air, not a weapon swing or impact", "the sound should stay short and evasive"],
      ["the movement cue should line up with the dodge", "the finish should be quick"],
    ),
    soundPlan: soundPlan("short-effect", ["quick body rush", "short airy tail"]),
    goodOutputDescription: ["evasion read", "brief body movement cue", "clean short finish"],
    badOutputDescription: ["punch hit", "sword slash", "slow windy swell"],
    constraints: ["keep it short and light"],
    sequenceTimingNotes: ["the whoosh should land with the body shift and clear out immediately"],
  }),
  createGoodSoundExample({
    id: "good-magic-charge-up",
    category: "core/magical-energy",
    userPrompt: "Generate a magic charge-up sound",
    requestSummary: "Magical buildup that clearly prepares for a later release.",
    soundFamily: "magical-energy",
    thinkingIntent: thinking(
      "single-sound",
      ["this is a charge-up, so the energy should grow instead of firing immediately", "the sound should feel magical, not like random synth mush"],
      ["the buildup should leave room for a later release", "the texture should stay readable and intentional"],
    ),
    soundPlan: soundPlan("short-effect", ["soft magical onset", "growing energy body", "tension swell"]),
    goodOutputDescription: ["clear buildup", "magical identity", "intentional energy rise"],
    badOutputDescription: ["flat drone", "random bass swell", "instant gunshot-like release"],
    constraints: ["leave room for a later release event"],
    sequenceTimingNotes: ["the rise should track the visible charge-up rather than peaking too early"],
    tags: ["canonical"],
  }),
  createGoodSoundExample({
    id: "good-magic-portal-opening",
    category: "core/portal-magic",
    userPrompt: "Generate a portal opening sound",
    requestSummary: "Portal-opening event with spatial magical identity instead of explosion drift.",
    soundFamily: "magical-energy",
    thinkingIntent: thinking(
      "single-sound",
      ["portal opening should feel like space unfolding, not a blast or UFO hover", "the magical identity should stay spatial and clean"],
      ["the opening moment should be distinct", "the tail can hold briefly without turning into a drone"],
    ),
    soundPlan: soundPlan("short-effect", ["warp onset", "spatial bloom", "stable magical tail"]),
    goodOutputDescription: ["portal identity", "spatial magical bloom", "controlled stable tail"],
    badOutputDescription: ["explosion boom", "UFO wobble", "random deep drone"],
    constraints: ["keep it magical and spatial"],
    sequenceTimingNotes: ["the warp onset lands on the portal opening frame and the tail holds only long enough to sell the open state"],
    tags: ["portal"],
  }),
  createGoodSoundExample({
    id: "good-magic-energy-burst",
    category: "core/magical-energy",
    userPrompt: "Generate an energy burst release",
    requestSummary: "Charged magical release with a bright payoff and short discharge tail.",
    soundFamily: "magical-energy",
    thinkingIntent: thinking(
      "single-sound",
      ["the burst is a release event with energy identity, not a laser beam or explosion", "the attack should feel bright and deliberate"],
      ["the release lands on the burst frame", "the discharge tail should be short and readable"],
    ),
    soundPlan: soundPlan("short-effect", ["release crack", "energy bloom", "short discharge tail"]),
    goodOutputDescription: ["bright release read", "clear magical energy body", "short controlled discharge"],
    badOutputDescription: ["random bass drone", "laser beam sustain", "flat explosion boom"],
    constraints: ["keep the release clean and intentional"],
    sequenceTimingNotes: ["the burst crack should coincide with the release frame"],
  }),
  createGoodSoundExample({
    id: "good-magic-healing-pulse",
    category: "core/magical-energy",
    userPrompt: "Generate a healing pulse sound",
    requestSummary: "Healing or support magic pulse that reads gentle energy instead of attack force.",
    soundFamily: "magical-energy",
    thinkingIntent: thinking(
      "single-sound",
      ["healing should feel supportive and luminous rather than violent", "the sound still needs a readable magical identity"],
      ["the onset should feel like a pulse", "the tail should soften cleanly"],
    ),
    soundPlan: soundPlan("short-effect", ["gentle magical onset", "supportive pulse body", "soft resolving tail"]),
    goodOutputDescription: ["supportive magical pulse", "clear but gentle energy", "clean soft finish"],
    badOutputDescription: ["attack-like blast", "random deep drone", "medical beep with no magic identity"],
    constraints: ["keep it non-violent"],
    sequenceTimingNotes: ["the pulse should line up with the visible healing flare"],
  }),
  createGoodSoundExample({
    id: "good-background-support-explosion-debris",
    category: "core/background-support",
    userPrompt: "Generate background debris and dust support after the explosion",
    requestSummary: "Secondary explosion-support layer that follows the main blast without replacing it.",
    soundFamily: "background-action-support",
    thinkingIntent: thinking(
      "single-sound",
      ["this is support after the main event, not the new main event", "the layer should feel like debris and dust aftermath"],
      ["the support should trail the main blast", "it should stay quieter than the primary explosion"],
    ),
    soundPlan: soundPlan("short-effect", ["debris patter", "dust tail", "scene settle"]),
    goodOutputDescription: ["secondary debris support", "after-blast residue", "restrained level relative to the main event"],
    badOutputDescription: ["bigger than the explosion", "new main boom", "muddy scene-filling clutter"],
    constraints: ["remain secondary to the main explosion"],
    sequenceTimingNotes: ["this layer should start immediately after the main blast peak, not before it"],
    tags: ["layered"],
  }),
  createGoodSoundExample({
    id: "good-background-support-distant-battle",
    category: "core/background-support",
    userPrompt: "Generate distant battle support behind the main action",
    requestSummary: "Background battle texture that adds scale without stealing focus.",
    soundFamily: "background-action-support",
    thinkingIntent: thinking(
      "single-sound",
      ["the support should imply distant conflict, not become the foreground scene", "the bed should add scale while staying restrained"],
      ["the background texture should stay distant", "the foreground action must remain clear"],
    ),
    soundPlan: soundPlan("layered-bed", ["muted distant impacts", "restrained battle hints", "stable low-focus bed"]),
    goodOutputDescription: ["scene scale increase", "distant readable battle texture", "background-only presence"],
    badOutputDescription: ["foreground chaos", "loud clutter", "close-up impacts that steal focus"],
    constraints: ["background support only"],
    sequenceTimingNotes: ["keep the support bed behind the main action at all times"],
  }),
  createGoodSoundExample({
    id: "good-scene-addition-ambience-pulse",
    category: "continuation/scene-addition",
    userPrompt: "Keep the same creepy hallway ambience, but add a low pulse when the door unlocks",
    requestSummary: "Preserve the existing ambience bed and add one timed event without resetting the scene.",
    soundFamily: "scene-addition",
    thinkingIntent: thinking(
      "continuation",
      ["preserve the current hallway ambience identity", "add only the requested low pulse at the unlock moment"],
      ["the ambience bed should remain intact", "the added pulse should hit the unlock cue and then get out of the way"],
    ),
    soundPlan: soundPlan("continuation", ["keep current ambience", "add unlock pulse on cue"]),
    goodOutputDescription: ["same world preserved", "single new cue event", "pulse stays subordinate to the ambience bed"],
    badOutputDescription: ["replace the whole ambience", "add a huge sci-fi hit", "change the scene identity"],
    constraints: ["preserve the existing ambience family", "keep the pulse subtle"],
    sequenceTimingNotes: ["the added pulse should land exactly at the unlock moment"],
    tags: ["continuation", "layered"],
  }),
  createGoodSoundExample({
    id: "good-continuation-portal-close",
    category: "continuation/magical-energy",
    userPrompt: "We already have the portal open sound. Now give me the closing sound in the same style",
    requestSummary: "Same-family portal close sound that matches the established portal identity.",
    soundFamily: "continuation",
    thinkingIntent: thinking(
      "continuation",
      ["preserve the existing portal family and style", "make the event feel like a close rather than an open"],
      ["the texture should stay recognizably related to the opening sound", "the motion should resolve inward or collapse cleanly"],
    ),
    soundPlan: soundPlan("continuation", ["matched portal texture", "inward collapse", "clean shutoff"]),
    goodOutputDescription: ["clearly related portal family", "close-event identity", "clean ending"],
    badOutputDescription: ["unrelated new family", "same exact open sound reused", "explosion drift"],
    constraints: ["preserve the established portal identity"],
    sequenceTimingNotes: ["the collapse lands on the visible closing moment"],
    tags: ["continuation", "portal"],
  }),
  createGoodSoundExample({
    id: "good-continuation-punch-second-hit",
    category: "continuation/punch-impact",
    userPrompt: "Keep the same sound family as the first punch, but make the second hit heavier",
    requestSummary: "Punch continuation where the second beat gets heavier without resetting the family.",
    soundFamily: "continuation",
    thinkingIntent: thinking(
      "continuation",
      ["preserve the existing punch family identity", "change only the weight of the second hit"],
      ["the second hit should feel heavier than the first", "the family texture should remain coherent"],
    ),
    soundPlan: soundPlan("continuation", ["preserve first-hit family", "heavier second-hit body", "tight contact timing"]),
    goodOutputDescription: ["coherent fight continuity", "clear second-hit escalation", "same family identity"],
    badOutputDescription: ["totally new hit family", "same identical second hit", "muddy oversized boom"],
    constraints: ["change only the second beat", "preserve punch identity"],
    sequenceTimingNotes: ["the heavier second hit should still land exactly on the second contact frame"],
    tags: ["continuation"],
  }),
  createGoodSoundExample({
    id: "good-continuation-footsteps-speed-up",
    category: "continuation/footsteps",
    userPrompt: "Keep the same footsteps family, but now speed it up into a run on the same surface",
    requestSummary: "Footstep continuation that preserves the material but changes pace from slower steps into a run.",
    soundFamily: "continuation",
    thinkingIntent: thinking(
      "continuation",
      ["preserve the existing surface identity", "change the cadence into a run without resetting the sound family"],
      ["the texture should stay the same surface", "the rhythm should tighten into faster motion"],
    ),
    soundPlan: soundPlan("continuation", ["preserve surface texture", "tighten cadence", "run-paced finish"]),
    goodOutputDescription: ["same surface identity", "clear speed increase", "coherent continuation"],
    badOutputDescription: ["new unrelated surface", "same slow cadence", "generic motion blur with no steps"],
    constraints: ["preserve the established surface material"],
    sequenceTimingNotes: ["the cadence should accelerate to match the new run animation"],
    tags: ["continuation"],
  }),
  createGoodSoundExample({
    id: "good-continuation-fireball-heavier-impact",
    category: "continuation/fireball-projectile",
    userPrompt: "Keep the same fireball family, but make the impact hit heavier",
    requestSummary: "Fireball continuation where the impact becomes heavier without turning into a generic explosion.",
    soundFamily: "continuation",
    thinkingIntent: thinking(
      "continuation",
      ["preserve the established projectile family", "increase the impact weight without erasing the fireball identity"],
      ["the contact should feel heavier than before", "the impact should still sound like the same fireball family"],
    ),
    soundPlan: soundPlan("continuation", ["preserve launch family texture", "heavier impact front", "brief ember finish"]),
    goodOutputDescription: ["same projectile family", "heavier contact weight", "fireball identity preserved"],
    badOutputDescription: ["plain explosion replacement", "laser beam drift", "same unchanged impact"],
    constraints: ["do not replace the family with generic explosion logic"],
    sequenceTimingNotes: ["the heavier impact still lands on the exact impact frame"],
    tags: ["continuation"],
  }),
];

const GOOD_WORKFLOW_SOUND_EXAMPLES: GenerateSoundExample[] = [
  createGoodSoundExample({
    id: "good-workflow-explosion-options",
    category: "workflow/options",
    userPrompt: "Give me 3 explosion sound options",
    requestSummary: "Options request should stay inside the same family while varying controlled engine parameters.",
    soundFamily: "explosion",
    thinkingIntent: thinking(
      "options",
      ["provide multiple explosion-family options instead of unrelated sound families", "variation should come from weight, cleanliness, or distance, not total family drift"],
      ["the options should all still read as explosions", "each option should have a distinct usable angle"],
    ),
    soundPlan: soundPlan("short-effect", ["base pressure -> blast -> debris", "same-family heavier blast body", "same-family cleaner or more distant aftermath"]),
    goodOutputDescription: ["controlled family variation", "all options remain usable explosions", "clear differences without drift"],
    badOutputDescription: ["one explosion and two unrelated sounds", "identical duplicate options", "random style drift"],
    constraints: ["keep all options in the explosion family"],
    sequenceTimingNotes: ["variation should affect texture and intensity, not the core timing shape"],
    tags: ["workflow", "options"],
    acceptableOptions: ["Provide 3 family-safe explosion directions for the engine.", "Vary force, cleanliness, or distance while keeping the blast readable."],
  }),
  createGoodSoundExample({
    id: "good-workflow-pick-option",
    category: "workflow/choice-followup",
    userPrompt: "I pick option 2",
    requestSummary: "Choice follow-up should preserve the selected family and not restart the ideation process.",
    soundFamily: "continuation",
    thinkingIntent: thinking(
      "revision",
      ["the user is selecting an existing option, not asking for a new unrelated sound", "the response should preserve the chosen family and traits"],
      ["the chosen option should remain intact", "the system should avoid inventing a new direction"],
    ),
    soundPlan: soundPlan("continuation", ["use the selected option", "preserve the chosen family and timing"]),
    goodOutputDescription: ["selected option is preserved", "no unnecessary family reset", "clean continuation behavior"],
    badOutputDescription: ["start over with new options", "switch families", "ignore the user's selection"],
    constraints: ["preserve the chosen option"],
    sequenceTimingNotes: ["do not alter the timing unless the user asks for timing changes"],
    tags: ["workflow", "choice-followup", "continuation"],
  }),
  createGoodSoundExample({
    id: "good-workflow-combine-options",
    category: "workflow/choice-followup",
    userPrompt: "Combine option 1 and option 3 for the portal",
    requestSummary: "Option-combine request should preserve the portal family while merging only the requested traits.",
    soundFamily: "magical-energy",
    thinkingIntent: thinking(
      "revision",
      ["combining options means blend selected traits within the same portal family", "do not merge incompatible unrelated families"],
      ["the result should still sound like the established portal family", "the blend should be intentional rather than muddy"],
    ),
    soundPlan: soundPlan("continuation", ["keep portal identity", "merge the chosen traits", "preserve clean portal timing"]),
    goodOutputDescription: ["same portal family", "intentional blended traits", "clean family-safe hybrid"],
    badOutputDescription: ["muddy compromise", "new unrelated sound family", "loss of portal identity"],
    constraints: ["preserve the portal family"],
    sequenceTimingNotes: ["do not disturb the original portal timing shape while blending the traits"],
    tags: ["workflow", "choice-followup", "continuation"],
  }),
  createGoodSoundExample({
    id: "good-workflow-attach-impact-frame",
    category: "workflow/timing-lock",
    userPrompt: "Put option 2 on the impact frame",
    requestSummary: "Attach the chosen sound to the exact impact frame without changing its family.",
    soundFamily: "continuation",
    thinkingIntent: thinking(
      "timing-lock",
      ["keep the chosen option intact and change only placement timing", "the system should not reinterpret the family"],
      ["the transient must land on the impact frame", "the option's texture should stay the same"],
    ),
    soundPlan: soundPlan("continuation", ["preserve chosen option", "lock onset to the impact frame"]),
    goodOutputDescription: ["frame-accurate placement", "family preserved", "no unnecessary redesign"],
    badOutputDescription: ["timing drift", "family reset", "new option invented instead of using option 2"],
    constraints: ["change timing only"],
    sequenceTimingNotes: ["the onset must land exactly on the specified impact frame"],
    tags: ["workflow", "attach-import", "timing-lock", "continuation"],
  }),
  createGoodSoundExample({
    id: "good-workflow-ask-clarify-sound-here",
    category: "workflow/question-needed",
    userPrompt: "I need a sound here",
    requestSummary: "When the action and cue moment are missing, ask one narrow clarification instead of guessing.",
    soundFamily: "scene-addition",
    thinkingIntent: thinking(
      "single-sound",
      ["the prompt is missing the actual action or sound family", "the system should not guess explosion, whoosh, or ambience without context"],
      ["ask for the missing action or moment", "do not define engine behavior until the cue is anchored"],
      "ask-clarify",
    ),
    soundPlan: soundPlan("continuation", ["wait for the missing action or cue information"]),
    goodOutputDescription: ["one narrow clarification question", "no guesswork", "cue remains anchored to the animation once clarified"],
    badOutputDescription: ["guess a random family", "ask a broad multi-part questionnaire", "define engine behavior with no cue context"],
    constraints: ["ask only one narrow question"],
    sequenceTimingNotes: ["clarify the exact action or cue moment before defining engine behavior"],
    tags: ["workflow", "question-needed"],
    missingFacts: ["the action or event that needs sound", "the cue moment or target frame"],
    strongestGap: "The prompt never says what action or moment needs sound.",
    bestQuestion: "What action or exact moment should this sound match?",
    acceptableOptions: ["Ask for the missing action or cue moment in one question."],
    shouldAskQuestion: true,
    shouldProceedWithoutQuestion: false,
    maxQuestionsBeforeProceeding: 1,
  }),
  createGoodSoundExample({
    id: "good-workflow-ask-clarify-reveal",
    category: "workflow/question-needed",
    userPrompt: "Give me a reveal sound for this",
    requestSummary: "Ask a narrow clarification when the reveal family is missing and guessing would drift the sound.",
    soundFamily: "scene-addition",
    thinkingIntent: thinking(
      "single-sound",
      ["reveal sound is too vague without knowing what is revealing", "the system should narrow the family instead of guessing magical, mechanical, or ominous"],
      ["ask for the reveal type or target moment", "avoid producing the wrong-family cue"],
      "ask-clarify",
    ),
    soundPlan: soundPlan("continuation", ["wait for reveal identity clarification"]),
    goodOutputDescription: ["one narrow clarification", "family is grounded before generation", "no wrong-family reveal sound"],
    badOutputDescription: ["guess magical sparkle", "guess ominous drone", "ask multiple unrelated questions"],
    constraints: ["ask only one narrow question"],
    sequenceTimingNotes: ["clarify what is being revealed before designing the cue"],
    tags: ["workflow", "question-needed"],
    missingFacts: ["what is being revealed", "whether the cue should feel magical, mechanical, or environmental"],
    strongestGap: "The reveal family is unresolved.",
    bestQuestion: "What exactly is being revealed so the sound can match the right family?",
    acceptableOptions: ["Ask only for the missing reveal identity."],
    shouldAskQuestion: true,
    shouldProceedWithoutQuestion: false,
    maxQuestionsBeforeProceeding: 1,
  }),
];

const GOOD_COMPATIBILITY_SOUND_EXAMPLES: GenerateSoundExample[] = [
  createGoodSoundExample({
    id: "good-compat-ui-confirm",
    category: "compatibility/ui-tech",
    userPrompt: "Generate a clean UI confirm chirp",
    requestSummary: "Compact UI confirmation cue with clean tech identity and no fight-like violence.",
    soundFamily: "ui-tech",
    thinkingIntent: thinking(
      "single-sound",
      ["this is a short interface confirmation, not an impact or ambience bed", "the cue should feel clean and responsive"],
      ["the onset should feel immediate", "the cue should end quickly and politely"],
    ),
    soundPlan: soundPlan("single-hit", ["short tech onset", "tiny electronic bloom", "clean stop"]),
    goodOutputDescription: ["clear confirmation tone", "clean interface identity", "quick finish"],
    badOutputDescription: ["violent impact", "explosion thud", "long synth wash"],
    constraints: ["keep it short and non-violent"],
    sequenceTimingNotes: ["the chirp should land exactly on the confirm action"],
    tags: ["workflow", "compatibility"],
  }),
  createGoodSoundExample({
    id: "good-compat-door-creak",
    category: "compatibility/door-mechanical",
    userPrompt: "Generate an old wooden door creak",
    requestSummary: "Mechanical door movement with wood and hinge identity.",
    soundFamily: "door-mechanical",
    thinkingIntent: thinking(
      "single-sound",
      ["door movement should feel mechanical and material-specific", "wood and hinge detail should stay central"],
      ["the sound should track the door motion", "the release should feel like a door settling, not an impact"],
    ),
    soundPlan: soundPlan("short-effect", ["hinge strain onset", "wood movement body", "settle release"]),
    goodOutputDescription: ["wood-and-hinge identity", "motion-synced creak", "mechanical settle"],
    badOutputDescription: ["sci-fi airlock", "generic monster growl", "ambient drone with no movement read"],
    constraints: ["keep the door material readable"],
    sequenceTimingNotes: ["the creak should follow the pace of the opening motion"],
    tags: ["compatibility"],
  }),
  createGoodSoundExample({
    id: "good-compat-unlock-click",
    category: "compatibility/door-mechanical",
    userPrompt: "Add the unlock click exactly when the lock turns",
    requestSummary: "Precise mechanical unlock cue tied to the lock-turn frame.",
    soundFamily: "door-mechanical",
    thinkingIntent: thinking(
      "timing-lock",
      ["this is a timing-locked mechanical cue, not a broad door movement wash", "the sound should be compact and precise"],
      ["the click must land on the lock-turn frame", "the cue should not smear across the whole motion"],
    ),
    soundPlan: soundPlan("single-hit", ["tight lock click", "tiny mechanical settle"]),
    goodOutputDescription: ["frame-accurate unlock click", "mechanical precision", "tight short finish"],
    badOutputDescription: ["smeared unlock noise", "long metallic rattle", "magical sparkle instead of mechanics"],
    constraints: ["timing precision is critical"],
    sequenceTimingNotes: ["the click lands exactly when the lock turns"],
    tags: ["compatibility", "timing-lock"],
  }),
  createGoodSoundExample({
    id: "good-compat-race-car-pass",
    category: "compatibility/vehicle-pass",
    userPrompt: "Generate a race car pass sound",
    requestSummary: "Vehicle pass-by that clearly reads speed, approach, and receding motion.",
    soundFamily: "vehicle-pass",
    thinkingIntent: thinking(
      "single-sound",
      ["the sound should read as a fast vehicle passing through space", "motion perspective is central to the family"],
      ["the approach, pass peak, and recede should all read", "the engine identity should stay clear"],
    ),
    soundPlan: soundPlan("short-effect", ["engine rise", "pass-by peak", "doppler recede"]),
    goodOutputDescription: ["travel read and speed", "engine identity", "clear pass-by perspective"],
    badOutputDescription: ["sci-fi hover sweep", "explosion boom", "flat engine loop with no motion"],
    constraints: ["keep the pass-by motion readable"],
    sequenceTimingNotes: ["the loudest peak should line up with the closest pass moment"],
    tags: ["compatibility"],
  }),
  createGoodSoundExample({
    id: "good-compat-voice-placeholder",
    category: "compatibility/voice-placeholder",
    userPrompt: "Generate a placeholder voice cue that says 'Go'",
    requestSummary: "Simple placeholder voice guidance without turning into a full character-performance dataset.",
    soundFamily: "voice-placeholder",
    thinkingIntent: thinking(
      "single-sound",
      ["treat this as a compact placeholder voice cue", "keep it simple and legible rather than highly acted"],
      ["the word should be understandable", "the cue should stay brief and usable in animation blocking"],
    ),
    soundPlan: soundPlan("single-hit", ["clear spoken onset", "brief vocal body", "clean stop"]),
    goodOutputDescription: ["legible placeholder speech", "brief usable cue", "no heavy acting clutter"],
    badOutputDescription: ["impact sound instead of speech", "musical chirp", "long dramatic monologue"],
    constraints: ["keep it short and literal"],
    sequenceTimingNotes: ["the cue should line up with the intended spoken animation beat"],
    tags: ["compatibility"],
  }),
];

const BAD_SOUND_TRAINING_EXAMPLES: GenerateSoundExample[] = [
  createBadSoundExample({
    id: "bad-explosion-tiny-pop",
    category: "bad/explosion",
    userPrompt: "Generate explosion sound",
    requestSummary: "Bad explosion example that collapses the family into a tiny pop.",
    soundFamily: "explosion",
    thinkingIntent: thinking(
      "single-sound",
      ["wrong: treat the explosion as a tiny toy pop", "wrong: ignore blast body and decay"],
      ["wrong: a huge visual blast can be answered by a tiny click"],
    ),
    soundPlan: soundPlan("single-hit", ["small pop only"]),
    goodOutputDescription: ["powerful blast body", "readable debris decay", "clear explosion identity"],
    badOutputDescription: ["tiny pop", "toy burst", "no decay"],
    constraints: ["rewrite or remove this example"],
    sequenceTimingNotes: ["this fails because it ends before the explosion event has any body"],
  }),
  createBadSoundExample({
    id: "bad-explosion-muddy-rumble",
    category: "bad/explosion",
    userPrompt: "Generate explosion sound",
    requestSummary: "Bad explosion example that turns the family into a muddy low-end blob.",
    soundFamily: "explosion",
    thinkingIntent: thinking(
      "single-sound",
      ["wrong: a bass-heavy rumble alone is enough", "wrong: explosions do not need a clear attack"],
      ["wrong: the front edge can be ignored"],
    ),
    soundPlan: soundPlan("short-effect", ["muddy low rumble", "indistinct sustain"]),
    goodOutputDescription: ["clear attack", "blast body with definition", "controlled decay"],
    badOutputDescription: ["muddy rumble blob", "no impact front", "indistinct sustain"],
    constraints: ["rewrite or remove this example"],
    sequenceTimingNotes: ["this is wrong because the viewer never gets a readable explosion attack"],
  }),
  createBadSoundExample({
    id: "bad-explosion-sci-fi-drone",
    category: "bad/explosion",
    userPrompt: "Generate explosion sound",
    requestSummary: "Bad explosion example that drifts into a sci-fi drone.",
    soundFamily: "explosion",
    thinkingIntent: thinking(
      "single-sound",
      ["wrong: explosion should sound like a hovering tonal sci-fi effect", "wrong: the family can ignore physical blast behavior"],
      ["wrong: a long tone is enough to imply impact"],
    ),
    soundPlan: soundPlan("short-effect", ["hovering sci-fi tone", "slow tonal decay"]),
    goodOutputDescription: ["blast body", "physical impact front", "debris tail"],
    badOutputDescription: ["sci-fi hover drone", "UFO-like tone", "no explosive body"],
    constraints: ["rewrite or remove this example"],
    sequenceTimingNotes: ["this drifts into the wrong family and does not track the blast frame correctly"],
  }),
  createBadSoundExample({
    id: "bad-lightning-alien-hum",
    category: "bad/lightning-thunder-electricity",
    userPrompt: "Generate lightning",
    requestSummary: "Bad lightning example that replaces the strike with an alien hum.",
    soundFamily: "lightning",
    thinkingIntent: thinking(
      "single-sound",
      ["wrong: lightning should be a sustained alien hum", "wrong: there is no need for a crack or fast finish"],
      ["wrong: the cue can ignore the exact strike moment"],
    ),
    soundPlan: soundPlan("short-effect", ["alien hum only"]),
    goodOutputDescription: ["sharp crack", "electric body", "quick finish"],
    badOutputDescription: ["alien hum", "no crack", "no fast ending"],
    constraints: ["rewrite or remove this example"],
    sequenceTimingNotes: ["the lack of an attack means it cannot line up with a strike frame"],
  }),
  createBadSoundExample({
    id: "bad-lightning-bass-wobble",
    category: "bad/lightning-thunder-electricity",
    userPrompt: "Generate lightning",
    requestSummary: "Bad lightning example that confuses power with deep bass wobble.",
    soundFamily: "lightning",
    thinkingIntent: thinking(
      "single-sound",
      ["wrong: lightning should be deep and wobbly instead of sharp", "wrong: bass pressure is more important than electric edge"],
      ["wrong: the family can feel slow and heavy"],
    ),
    soundPlan: soundPlan("short-effect", ["deep bass wobble", "slow sustain"]),
    goodOutputDescription: ["electric edge", "fast strike", "brief tail"],
    badOutputDescription: ["deep vibration", "UFO-style wobble", "slow electric mush"],
    constraints: ["rewrite or remove this example"],
    sequenceTimingNotes: ["the wobble is too slow to match a lightning strike"],
  }),
  createBadSoundExample({
    id: "bad-lightning-synth-pad",
    category: "bad/lightning-thunder-electricity",
    userPrompt: "Generate lightning",
    requestSummary: "Bad lightning example that holds a synth pad instead of a strike.",
    soundFamily: "lightning",
    thinkingIntent: thinking(
      "single-sound",
      ["wrong: a long synth pad can stand in for lightning", "wrong: the sound does not need to collapse or vanish"],
      ["wrong: the body can linger long after the visual strike"],
    ),
    soundPlan: soundPlan("short-effect", ["bright pad onset", "long synth sustain"]),
    goodOutputDescription: ["crack on contact", "brief electric body", "fast vanish"],
    badOutputDescription: ["lingering pad", "slow mushy sustain", "no strike punctuation"],
    constraints: ["rewrite or remove this example"],
    sequenceTimingNotes: ["the overlong sustain destroys strike timing clarity"],
  }),
  createBadSoundExample({
    id: "bad-fireball-laser-loop",
    category: "bad/fireball-projectile",
    userPrompt: "Generate a fireball",
    requestSummary: "Bad fireball example that uses a generic laser loop.",
    soundFamily: "fireball-projectile",
    thinkingIntent: thinking(
      "single-sound",
      ["wrong: any laser-like zap can represent a fireball", "wrong: launch and travel do not need to read"],
      ["wrong: the source and projectile direction are unimportant"],
    ),
    soundPlan: soundPlan("short-effect", ["generic laser zap"]),
    goodOutputDescription: ["cast or launch read", "directional projectile motion", "fireball energy identity"],
    badOutputDescription: ["generic laser loop", "no cast cue", "no travel read"],
    constraints: ["rewrite or remove this example"],
    sequenceTimingNotes: ["the sound cannot match a fireball release because it has no launch structure"],
  }),
  createBadSoundExample({
    id: "bad-fireball-same-orb",
    category: "bad/fireball-projectile",
    userPrompt: "Generate a fireball",
    requestSummary: "Bad fireball example that reuses the same orb sound every time.",
    soundFamily: "fireball-projectile",
    thinkingIntent: thinking(
      "single-sound",
      ["wrong: every fireball should use the exact same floating orb sound", "wrong: family variation and context do not matter"],
      ["wrong: launch, travel, and impact can all sound identical"],
    ),
    soundPlan: soundPlan("short-effect", ["same orb loop every time"]),
    goodOutputDescription: ["controlled family variation", "event-specific launch or impact shape", "consistent fireball identity"],
    badOutputDescription: ["hard-coded repetition", "floating orb hum", "no event-specific change"],
    constraints: ["rewrite or remove this example"],
    sequenceTimingNotes: ["this ignores whether the fireball is launching, traveling, or impacting"],
  }),
  createBadSoundExample({
    id: "bad-punch-weak-tap",
    category: "bad/punch-impact",
    userPrompt: "Generate a punch impact sound",
    requestSummary: "Bad punch example that turns forceful contact into a weak tap.",
    soundFamily: "punch-impact",
    thinkingIntent: thinking(
      "single-sound",
      ["wrong: the punch only needs a tiny tap", "wrong: there is no need for body weight or force"],
      ["wrong: the impact can be almost weightless"],
    ),
    soundPlan: soundPlan("single-hit", ["tiny tap"]),
    goodOutputDescription: ["clear contact", "body weight", "tight forceful hit"],
    badOutputDescription: ["weak tap", "toy click", "no body force"],
    constraints: ["rewrite or remove this example"],
    sequenceTimingNotes: ["the timing can align, but the sound still fails because the hit has no force"],
  }),
  createBadSoundExample({
    id: "bad-punch-explosion-boom",
    category: "bad/punch-impact",
    userPrompt: "Generate a punch impact sound",
    requestSummary: "Bad punch example that over-scales the hit into an explosion boom.",
    soundFamily: "punch-impact",
    thinkingIntent: thinking(
      "single-sound",
      ["wrong: a punch should sound like an explosion", "wrong: bigger always means broader and boomy"],
      ["wrong: the family difference between punch and explosion does not matter"],
    ),
    soundPlan: soundPlan("single-hit", ["blast boom"]),
    goodOutputDescription: ["tight impact timing", "body-led hit weight", "punch-family identity"],
    badOutputDescription: ["explosion boom", "too large for body contact", "family confusion"],
    constraints: ["rewrite or remove this example"],
    sequenceTimingNotes: ["the oversized blast muddies the precise hit timing"],
  }),
  createBadSoundExample({
    id: "bad-punch-mistimed-contact",
    category: "bad/punch-impact",
    userPrompt: "Generate a punch impact sound",
    requestSummary: "Bad punch example whose onset misses the contact frame.",
    soundFamily: "punch-impact",
    thinkingIntent: thinking(
      "single-sound",
      ["wrong: the hit can land noticeably before or after contact", "wrong: timing precision is optional"],
      ["wrong: a long tail can hide bad sync"],
    ),
    soundPlan: soundPlan("single-hit", ["late thud", "dragging tail"]),
    goodOutputDescription: ["frame-accurate hit", "tight short tail", "clear contact read"],
    badOutputDescription: ["early hit", "late thud", "dragging tail hiding the contact"],
    constraints: ["rewrite or remove this example"],
    sequenceTimingNotes: ["the onset misses the punch contact instead of landing on it"],
  }),
  createBadSoundExample({
    id: "bad-kick-copy-punch",
    category: "bad/kick-impact",
    userPrompt: "Generate a kick impact sound",
    requestSummary: "Bad kick example that simply copies the punch family.",
    soundFamily: "kick-impact",
    thinkingIntent: thinking(
      "single-sound",
      ["wrong: kick can sound identical to a punch", "wrong: the leg-led contact distinction does not matter"],
      ["wrong: there is no material or weight difference"],
    ),
    soundPlan: soundPlan("single-hit", ["generic punch hit"]),
    goodOutputDescription: ["leg-led contact", "heavier body transfer", "distinct kick identity"],
    badOutputDescription: ["copied punch sound", "no leg-led read", "collapsed family distinction"],
    constraints: ["rewrite or remove this example"],
    sequenceTimingNotes: ["the timing may align, but the family still reads wrong"],
  }),
  createBadSoundExample({
    id: "bad-kick-whoosh-only",
    category: "bad/kick-impact",
    userPrompt: "Generate a kick impact sound",
    requestSummary: "Bad kick example that gives motion but never delivers contact.",
    soundFamily: "kick-impact",
    thinkingIntent: thinking(
      "single-sound",
      ["wrong: the whoosh alone sells the kick", "wrong: the impact is optional"],
      ["wrong: motion support can replace contact"],
    ),
    soundPlan: soundPlan("short-effect", ["swing whoosh only"]),
    goodOutputDescription: ["contact hit", "kick-family body transfer", "clear payoff"],
    badOutputDescription: ["whoosh only", "missing contact", "unfinished event"],
    constraints: ["rewrite or remove this example"],
    sequenceTimingNotes: ["the sound ends before the kick ever pays off on contact"],
  }),
  createBadSoundExample({
    id: "bad-footsteps-identical-loop",
    category: "bad/footsteps",
    userPrompt: "Generate sneaking footsteps",
    requestSummary: "Bad footsteps example that repeats the exact same step sound every time.",
    soundFamily: "footsteps",
    thinkingIntent: thinking(
      "single-sound",
      ["wrong: each footstep can be identical regardless of pace and intent", "wrong: rhythm nuance is unnecessary"],
      ["wrong: sneaking does not need spacing or variation"],
    ),
    soundPlan: soundPlan("multi-beat-sequence", ["same step", "same step", "same step"]),
    goodOutputDescription: ["intentional rhythm", "surface-aware step variation", "movement cues that match the animation"],
    badOutputDescription: ["same exact foot sound every step", "flat loop", "no rhythm intelligence"],
    constraints: ["rewrite or remove this example"],
    sequenceTimingNotes: ["identical steps erase the sense of careful movement"],
  }),
  createBadSoundExample({
    id: "bad-footsteps-heavy-sneak",
    category: "bad/footsteps",
    userPrompt: "Generate sneaking footsteps",
    requestSummary: "Bad footsteps example that contradicts sneaking intent with heavy stomps.",
    soundFamily: "footsteps",
    thinkingIntent: thinking(
      "single-sound",
      ["wrong: sneaking can sound like heavy stomps", "wrong: the emotional or physical intent of the walk is irrelevant"],
      ["wrong: quiet movement does not need quiet sound"],
    ),
    soundPlan: soundPlan("multi-beat-sequence", ["loud stomp", "loud stomp"]),
    goodOutputDescription: ["quiet cautious steps", "restrained cadence", "light contact"],
    badOutputDescription: ["heavy stomps", "scene contradiction", "too-loud step body"],
    constraints: ["rewrite or remove this example"],
    sequenceTimingNotes: ["the oversized steps contradict the sneaking animation on every beat"],
  }),
  createBadSoundExample({
    id: "bad-breathing-idle",
    category: "bad/breathing",
    userPrompt: "Generate breathing hard",
    requestSummary: "Bad breathing example that sounds calm and idle instead of tired.",
    soundFamily: "breathing",
    thinkingIntent: thinking(
      "single-sound",
      ["wrong: tired breathing can sound like normal idle breathing", "wrong: exertion is optional"],
      ["wrong: fatigue rhythm does not matter"],
    ),
    soundPlan: soundPlan("multi-beat-sequence", ["soft neutral inhale", "soft neutral exhale"]),
    goodOutputDescription: ["fatigue rhythm", "labored inhale and exhale", "clear exertion"],
    badOutputDescription: ["calm idle breathing", "no fatigue", "neutral loop"],
    constraints: ["rewrite or remove this example"],
    sequenceTimingNotes: ["the calm timing never matches the exerted animation"],
  }),
  createBadSoundExample({
    id: "bad-breathing-random-hiss",
    category: "bad/breathing",
    userPrompt: "Generate breathing hard",
    requestSummary: "Bad breathing example that replaces human breath rhythm with random noise.",
    soundFamily: "breathing",
    thinkingIntent: thinking(
      "single-sound",
      ["wrong: intensity can be represented by random hiss bursts", "wrong: inhale and exhale shape is unnecessary"],
      ["wrong: the sound can ignore human breathing behavior"],
    ),
    soundPlan: soundPlan("multi-beat-sequence", ["noise burst", "noise burst"]),
    goodOutputDescription: ["human inhale-exhale pattern", "effort read", "coherent breathing rhythm"],
    badOutputDescription: ["random hiss noise", "no inhale-exhale logic", "non-human breathing"],
    constraints: ["rewrite or remove this example"],
    sequenceTimingNotes: ["the bursty noise does not track any believable breath cycle"],
  }),
  createBadSoundExample({
    id: "bad-ambience-clutter",
    category: "bad/environment-ambience",
    userPrompt: "Generate creepy hallway ambience",
    requestSummary: "Bad ambience example that fills the scene with clutter.",
    soundFamily: "environment-ambience",
    thinkingIntent: thinking(
      "single-sound",
      ["wrong: ambience should fill every gap with loud spooky detail", "wrong: support layers should compete with the foreground"],
      ["wrong: the scene bed should attract as much attention as the main action"],
    ),
    soundPlan: soundPlan("layered-bed", ["dense scary layers everywhere", "constant foreground noise"]),
    goodOutputDescription: ["sparse room tone", "restrained tension", "space for foreground action"],
    badOutputDescription: ["busy clutter soup", "masking foreground action", "no room for dialogue"],
    constraints: ["rewrite or remove this example"],
    sequenceTimingNotes: ["the overstuffed bed makes every moment feel equally loud and busy"],
  }),
  createBadSoundExample({
    id: "bad-magic-random-bass-drone",
    category: "bad/magical-energy",
    userPrompt: "Generate magical energy",
    requestSummary: "Bad magical example that defaults to a random bass drone.",
    soundFamily: "magical-energy",
    thinkingIntent: thinking(
      "single-sound",
      ["wrong: magic always means a deep abstract drone", "wrong: the event type and timing can be ignored"],
      ["wrong: a single ominous note is enough"],
    ),
    soundPlan: soundPlan("short-effect", ["deep bass drone"]),
    goodOutputDescription: ["clear magical identity", "event-appropriate timing", "readable onset and finish"],
    badOutputDescription: ["random bass drone", "generic synth mush", "no event identity"],
    constraints: ["rewrite or remove this example"],
    sequenceTimingNotes: ["the drone has no way to sync to charge, release, or magical cue timing"],
  }),
  createBadSoundExample({
    id: "bad-continuation-reset-ambience",
    category: "bad/continuation",
    userPrompt: "Keep the same creepy hallway ambience, but add a low pulse",
    requestSummary: "Bad continuation example that resets the scene instead of preserving it.",
    soundFamily: "continuation",
    thinkingIntent: thinking(
      "continuation",
      ["wrong: continuation can discard the original ambience", "wrong: the added cue can replace the base family instead of layering onto it"],
      ["wrong: scene identity does not need to be preserved"],
    ),
    soundPlan: soundPlan("continuation", ["replace the ambience with a new bed"]),
    goodOutputDescription: ["preserve the original ambience", "add only the requested pulse", "maintain scene identity"],
    badOutputDescription: ["reset the ambience family", "scene identity breaks", "requested pulse turns into a replacement bed"],
    constraints: ["rewrite or remove this example"],
    sequenceTimingNotes: ["the wrong behavior resets the whole scene instead of adding one timed cue"],
  }),
  createBadSoundExample({
    id: "bad-continuation-reset-hit-family",
    category: "bad/continuation",
    userPrompt: "Keep the same sound family as the first punch, but make the second hit heavier",
    requestSummary: "Bad continuation example that replaces the second hit with an unrelated family.",
    soundFamily: "continuation",
    thinkingIntent: thinking(
      "continuation",
      ["wrong: follow-up beats can ignore the established family", "wrong: a heavier second hit should become a whole new sound type"],
      ["wrong: continuity is optional"],
    ),
    soundPlan: soundPlan("continuation", ["swap in an unrelated hit family"]),
    goodOutputDescription: ["same fight family", "heavier second hit only", "coherent continuity"],
    badOutputDescription: ["new unrelated hit style", "continuity break", "family reset"],
    constraints: ["rewrite or remove this example"],
    sequenceTimingNotes: ["the second beat should stay inside the established family instead of resetting it"],
  }),
  createBadSoundExample({
    id: "bad-ui-violent-impact",
    category: "bad/ui-tech",
    userPrompt: "Generate a clean UI confirm chirp",
    requestSummary: "Bad UI example that responds with a violent impact-like cue.",
    soundFamily: "ui-tech",
    thinkingIntent: thinking(
      "single-sound",
      ["wrong: interface confirmation can sound like a punch or explosion", "wrong: compact UI sounds do not need their own family rules"],
      ["wrong: the cue can be loud and aggressive"],
    ),
    soundPlan: soundPlan("single-hit", ["impact transient", "thump"]),
    goodOutputDescription: ["clean short confirmation", "non-violent tech identity", "quick readable finish"],
    badOutputDescription: ["violent impact", "explosion thud", "aggressive oversized cue"],
    constraints: ["rewrite or remove this example"],
    sequenceTimingNotes: ["the cue may hit on time, but it still sounds like the wrong family"],
  }),
  createBadSoundExample({
    id: "bad-vehicle-sci-fi-sweep",
    category: "bad/vehicle-pass",
    userPrompt: "Generate a race car pass sound",
    requestSummary: "Bad vehicle example that loses the pass-by motion and car identity.",
    soundFamily: "vehicle-pass",
    thinkingIntent: thinking(
      "single-sound",
      ["wrong: a race car pass can be a sci-fi hover sweep or explosion", "wrong: motion perspective is optional"],
      ["wrong: the engine identity does not matter"],
    ),
    soundPlan: soundPlan("short-effect", ["hover sweep", "blast tail"]),
    goodOutputDescription: ["engine pass identity", "approach-to-recede motion", "speed read"],
    badOutputDescription: ["sci-fi sweep", "explosion drift", "no vehicle motion read"],
    constraints: ["rewrite or remove this example"],
    sequenceTimingNotes: ["the pass-by perspective disappears completely in this version"],
  }),
  createBadSoundExample({
    id: "bad-door-unlock-smeared",
    category: "bad/door-mechanical",
    userPrompt: "Add the unlock click exactly when the lock turns",
    requestSummary: "Bad door example that smears a precise mechanical click across the motion.",
    soundFamily: "door-mechanical",
    thinkingIntent: thinking(
      "timing-lock",
      ["wrong: a timing-locked click can smear across the whole motion", "wrong: precision is optional for mechanical cues"],
      ["wrong: the cue can become a long rattle instead of a click"],
    ),
    soundPlan: soundPlan("short-effect", ["long metallic smear"]),
    goodOutputDescription: ["precise click", "mechanical focus", "tight timing"],
    badOutputDescription: ["smeared unlock noise", "long metallic rattle", "no click moment"],
    constraints: ["rewrite or remove this example"],
    sequenceTimingNotes: ["the click should land on the lock turn, not drift across the whole shot"],
  }),
];

export const GENERATE_SOUND_INTENT_EXAMPLES: DrawingAiTaskIntentExample[] = [
  {
    id: "sound-intent-greeting",
    userPrompt: "hello",
    intent: "conversation",
    notes: "A greeting should stay conversational even if Generate Sounds is selected.",
    tags: ["greeting", "casual", "non-task"],
  },
  {
    id: "sound-intent-sound-feedback",
    userPrompt: "Does this explosion sound idea feel too soft?",
    intent: "feedback",
    notes: "Sound feedback or brainstorming should not automatically trigger fresh engine planning.",
    tags: ["feedback", "sound-idea", "non-task"],
  },
  {
    id: "sound-intent-direct-sound",
    userPrompt: "Generate an explosion sound",
    intent: "task",
    notes: "A direct sound request belongs in Generate Sounds, where the reply should be reframed as engine-ready behavior planning.",
    tags: ["task", "generate-sounds", "explosion"],
  },
  {
    id: "sound-intent-options",
    userPrompt: "Give me 3 lightning sound options",
    intent: "task",
    notes: "Asking for multiple engine behavior plans is still a Generate Sounds task, even when the user says options.",
    tags: ["task", "generate-sounds", "options", "lightning"],
  },
  {
    id: "sound-intent-follow-up",
    userPrompt: "Keep the same sound family as the first punch, but make the second hit heavier",
    intent: "task",
    notes: "Same-family follow-ups and revisions stay in Generate Sounds.",
    tags: ["task", "generate-sounds", "continuation", "revision"],
  },
  {
    id: "sound-intent-timing-lock",
    userPrompt: "Make the punch hit exactly when the fist connects",
    intent: "task",
    notes: "Timing-lock sound requests are still direct Generate Sounds work.",
    tags: ["task", "generate-sounds", "timing-lock", "impact"],
  },
];

export const GENERATE_SOUND_LLM_TRAINING_EXAMPLES: GenerateSoundExample[] = [
  ...GOOD_CORE_SOUND_TRAINING_EXAMPLES,
  ...GOOD_WORKFLOW_SOUND_EXAMPLES,
  ...GOOD_COMPATIBILITY_SOUND_EXAMPLES,
  ...BAD_SOUND_TRAINING_EXAMPLES,
];

export const buildGenerateSoundTrainingAnalysisInput = ({
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

const FAMILY_ALIAS_BY_TAG: Record<string, GenerateSoundFamily[]> = {
  explosion: ["explosion"],
  blast: ["explosion"],
  thunder: ["lightning"],
  electricity: ["lightning"],
  storm: ["lightning"],
  lightning: ["lightning"],
  zap: ["lightning"],
  fire: ["fireball-projectile"],
  projectile: ["fireball-projectile"],
  punch: ["punch-impact"],
  kick: ["kick-impact"],
  impact: ["punch-impact", "kick-impact", "body-impact"],
  footsteps: ["footsteps"],
  movement: ["footsteps", "whoosh-swing"],
  breathing: ["breathing"],
  breath: ["breathing"],
  background: ["background-action-support", "environment-ambience"],
  environmental: ["environment-ambience"],
  room: ["environment-ambience"],
  hallway: ["environment-ambience"],
  whoosh: ["whoosh-swing"],
  motion: ["whoosh-swing"],
  sword: ["whoosh-swing"],
  magic: ["magical-energy"],
  spell: ["magical-energy"],
  portal: ["magical-energy"],
  continuation: ["continuation", "scene-addition"],
  scene: ["scene-addition"],
  ui: ["ui-tech"],
  door: ["door-mechanical"],
  vehicle: ["vehicle-pass"],
  voice: ["voice-placeholder"],
};

const QUERY_FAMILY_HINTS: Array<{ family: GenerateSoundFamily; pattern: RegExp }> = [
  { family: "explosion", pattern: /\b(explosion|blast|detonation)\b/i },
  { family: "lightning", pattern: /\b(lightning|thunder|electric|electricity|zap)\b/i },
  { family: "fireball-projectile", pattern: /\b(fireball|projectile|cast|launch|orb|spell shot)\b/i },
  { family: "kick-impact", pattern: /\b(kick|knee|roundhouse)\b/i },
  { family: "punch-impact", pattern: /\b(punch|fist|jab|hook|uppercut)\b/i },
  { family: "body-impact", pattern: /\b(body slam|slam|landing|fall|falling|wall hit|body impact)\b/i },
  { family: "footsteps", pattern: /\b(footstep|footsteps|step|steps|walking|walk|running|run|sneaking|sneak|stomp)\b/i },
  { family: "breathing", pattern: /\b(breath|breathing|pant|gasp|catching (?:their )?breath)\b/i },
  { family: "environment-ambience", pattern: /\b(ambience|ambient|hallway|forest|cave|neighborhood|room tone|room-tone)\b/i },
  { family: "whoosh-swing", pattern: /\b(whoosh|swing|slash|dodge)\b/i },
  { family: "background-action-support", pattern: /\b(background|debris|support|behind the main action)\b/i },
  { family: "magical-energy", pattern: /\b(magic|magical|portal|energy|spell|healing|shield)\b/i },
  { family: "scene-addition", pattern: /\b(keep the scene|same scene|add .* pulse|add .* cue)\b/i },
  { family: "continuation", pattern: /\b(continue|same family|same style|same ambience|same hit|follow-up|second hit|next beat|keep the same)\b/i },
  { family: "ui-tech", pattern: /\b(ui|button|chirp|beep|confirm)\b/i },
  { family: "door-mechanical", pattern: /\b(door|unlock|lock turn|hinge|creak)\b/i },
  { family: "vehicle-pass", pattern: /\b(race car|car pass|vehicle|engine)\b/i },
  { family: "voice-placeholder", pattern: /\b(voice|say|spoken|placeholder)\b/i },
];

const WORKFLOW_PATTERN = /\b(options?|pick|choose|combine|option\s*\d|attach|import|put .* frame|exactly when|sound here|reveal sound)\b/i;
const TIMING_LOCK_PATTERN = /\b(exactly when|impact frame|strike frame|lock turns?|contact frame|sync)\b/i;
const CONTINUATION_PATTERN = /\b(continue|same family|same style|same ambience|same hit|follow-up|second hit|next beat|keep the same)\b/i;
const COMPATIBILITY_PATTERN = /\b(ui|button|door|unlock|hinge|race car|vehicle|voice|say\b)\b/i;

const inferPromptFamilies = (query: string): Set<GenerateSoundFamily> => {
  const families = new Set<GenerateSoundFamily>();
  for (const hint of QUERY_FAMILY_HINTS) {
    if (hint.pattern.test(query)) {
      families.add(hint.family);
    }
  }
  return families;
};

const resolveExampleFamilies = (example: GenerateSoundExample): GenerateSoundFamily[] => {
  const families = new Set<GenerateSoundFamily>([example.soundFamily]);
  for (const tag of example.tags) {
    for (const family of FAMILY_ALIAS_BY_TAG[tag] ?? []) {
      families.add(family);
    }
  }
  return Array.from(families);
};

const getExampleSearchText = (example: GenerateSoundExample): string =>
  [
    example.userPrompt,
    example.requestSummary,
    example.soundFamily,
    example.category,
    example.soundIntent,
    formatThinkingIntent(example.thinkingIntent, example.soundFamily),
    formatSoundPlan(example.soundPlan, example.soundFamily),
    example.goodOutputDescription.join(" "),
    example.badOutputDescription.join(" "),
    example.constraints.join(" "),
    example.sequenceTimingNotes.join(" "),
    example.reasoning,
    example.responseFocus.join(" "),
    example.consistencyRules.join(" "),
    example.soundQualityNotes.join(" "),
    example.badStyleNotes.join(" "),
    example.tags.join(" "),
  ].join(" ");

const countTokenHits = (queryTokens: string[], targetTokens: string[]): number => {
  if (queryTokens.length === 0 || targetTokens.length === 0) {
    return 0;
  }
  const targetSet = new Set(targetTokens);
  let hits = 0;
  for (const token of queryTokens) {
    if (targetSet.has(token)) {
      hits += 1;
    }
  }
  return hits;
};

const isWorkflowExample = (example: GenerateSoundExample): boolean => example.tags.some((tag) => WORKFLOW_TAGS.has(tag));
const isCompatibilityExample = (example: GenerateSoundExample): boolean => example.tags.some((tag) => COMPATIBILITY_TAGS.has(tag));

const scoreExample = ({
  example,
  query,
  queryTokens,
  promptFamilies,
  needsWorkflow,
  needsTimingLock,
  needsContinuation,
  needsCompatibility,
}: {
  example: GenerateSoundExample;
  query: string;
  queryTokens: string[];
  promptFamilies: Set<GenerateSoundFamily>;
  needsWorkflow: boolean;
  needsTimingLock: boolean;
  needsContinuation: boolean;
  needsCompatibility: boolean;
}): number => {
  const searchTokens = tokenize(getExampleSearchText(example));
  const resolvedFamilies = resolveExampleFamilies(example);
  const tokenHits = countTokenHits(queryTokens, searchTokens);
  let score = tokenHits * 1.15;

  if (promptFamilies.has(example.soundFamily)) {
    score += 6;
  }

  for (const family of resolvedFamilies) {
    if (promptFamilies.has(family)) {
      score += 3;
    }
  }

  if (example.tags.includes("canonical") && promptFamilies.has(example.soundFamily)) {
    score += 1.2;
  }

  if (needsWorkflow) {
    score += isWorkflowExample(example) ? 4 : 0;
  } else if (isWorkflowExample(example)) {
    score -= 2.2;
  }

  if (needsTimingLock) {
    score += example.tags.includes("timing-lock") ? 3.2 : 0;
  } else if (example.tags.includes("timing-lock")) {
    score -= 0.7;
  }

  if (needsContinuation) {
    score += example.tags.includes("continuation") || example.soundFamily === "continuation" || example.soundFamily === "scene-addition" ? 3 : 0;
  } else if (example.tags.includes("continuation") || example.soundFamily === "continuation" || example.soundFamily === "scene-addition") {
    score -= 0.8;
  }

  if (needsCompatibility) {
    score += isCompatibilityExample(example) ? 3.5 : 0;
  } else if (isCompatibilityExample(example)) {
    score -= 2;
  }

  if (example.exampleKind === "bad") {
    score += promptFamilies.size > 0 && resolvedFamilies.some((family) => promptFamilies.has(family)) ? 1.1 : -2.6;
  } else {
    score += 0.2;
  }

  if (query.includes("same") && example.soundFamily === "continuation") {
    score += 1.5;
  }

  return score;
};

const selectTopMatching = ({
  pool,
  selected,
  predicate = () => true,
}: {
  pool: Array<{ example: GenerateSoundExample; score: number }>;
  selected: GenerateSoundExample[];
  predicate?: (example: GenerateSoundExample) => boolean;
}): GenerateSoundExample | null => {
  const selectedIds = new Set(selected.map((example) => example.id));
  for (const entry of pool) {
    if (selectedIds.has(entry.example.id)) {
      continue;
    }
    if (!predicate(entry.example)) {
      continue;
    }
    return entry.example;
  }
  return null;
};

export const selectRelevantGenerateSoundExamples = ({
  examples,
  userMessage,
  analysisInput,
  limit = 6,
}: {
  examples: GenerateSoundExample[];
  userMessage: string;
  analysisInput: string;
  limit?: number;
}): GenerateSoundExample[] => {
  if (limit <= 0) {
    return [];
  }

  const query = `${userMessage}\n${analysisInput}`.trim();
  const queryTokens = tokenize(query);
  const promptFamilies = inferPromptFamilies(query);
  const needsWorkflow = WORKFLOW_PATTERN.test(query);
  const needsTimingLock = TIMING_LOCK_PATTERN.test(query);
  const needsContinuation = CONTINUATION_PATTERN.test(query);
  const needsCompatibility = COMPATIBILITY_PATTERN.test(query);

  const ranked = examples
    .filter((example) => example.isActive)
    .map((example) => ({
      example,
      score: scoreExample({
        example,
        query,
        queryTokens,
        promptFamilies,
        needsWorkflow,
        needsTimingLock,
        needsContinuation,
        needsCompatibility,
      }),
    }))
    .sort((left, right) => right.score - left.score);

  const goodRanked = ranked.filter((entry) => entry.example.exampleKind === "good");
  const badRanked = ranked.filter((entry) => entry.example.exampleKind === "bad");
  const workflowRanked = goodRanked.filter((entry) => isWorkflowExample(entry.example));
  const compatibilityRanked = goodRanked.filter((entry) => isCompatibilityExample(entry.example));
  const coreRanked = goodRanked.filter((entry) => !isWorkflowExample(entry.example) && !isCompatibilityExample(entry.example));

  const selected: GenerateSoundExample[] = [];
  const add = (example: GenerateSoundExample | null) => {
    if (!example) {
      return;
    }
    if (selected.some((entry) => entry.id === example.id)) {
      return;
    }
    if (selected.length >= limit) {
      return;
    }
    selected.push(example);
  };

  if (needsContinuation || needsTimingLock) {
    add(
      selectTopMatching({
        pool: goodRanked,
        selected,
        predicate: (example) =>
          (needsContinuation &&
            (example.soundFamily === "continuation" || example.soundFamily === "scene-addition" || example.tags.includes("continuation"))) ||
          (needsTimingLock && example.tags.includes("timing-lock")),
      }),
    );
  }

  add(
    selectTopMatching({
      pool: coreRanked,
      selected,
      predicate: (example) =>
        example.tags.includes("canonical") &&
        (promptFamilies.size === 0 || resolveExampleFamilies(example).some((family) => promptFamilies.has(family))),
    }) ??
      selectTopMatching({
        pool: coreRanked,
        selected,
        predicate: (example) => example.tags.includes("canonical"),
      }),
  );

  add(
    selectTopMatching({
      pool: coreRanked,
      selected,
      predicate: (example) => promptFamilies.size === 0 || resolveExampleFamilies(example).some((family) => promptFamilies.has(family)),
    }),
  );

  if (needsWorkflow) {
    add(selectTopMatching({ pool: workflowRanked, selected }));
  }

  if (needsCompatibility) {
    add(selectTopMatching({ pool: compatibilityRanked, selected }));
  }

  add(
    selectTopMatching({
      pool: badRanked,
      selected,
      predicate: (example) => promptFamilies.size === 0 || resolveExampleFamilies(example).some((family) => promptFamilies.has(family)),
    }),
  );

  for (const entry of coreRanked) {
    if (selected.length >= limit) {
      break;
    }
    if (selected.some((example) => example.id === entry.example.id)) {
      continue;
    }
    const categoryRoot = entry.example.category.split("/")[0];
    const alreadyHasCategoryRoot = selected.some((example) => example.category.split("/")[0] === categoryRoot);
    if (alreadyHasCategoryRoot && selected.length + 1 < limit) {
      continue;
    }
    selected.push(entry.example);
  }

  for (const entry of goodRanked) {
    if (selected.length >= limit) {
      break;
    }
    if (selected.some((example) => example.id === entry.example.id)) {
      continue;
    }
    selected.push(entry.example);
  }

  return selected.slice(0, limit);
};

const formatQuestionPolicy = (example: GenerateSoundExample): string =>
  example.shouldAskQuestion
    ? `Ask only to lock one missing execution detail: ${example.bestQuestion ?? "ask for the missing event family or cue moment."}`
    : "No question. Execution lock is sufficient.";

const formatExampleBlock = (example: GenerateSoundExample): string =>
  (() => {
    const modifierGuidance = getModifierGuidance({
      userPrompt: example.userPrompt,
      requestSummary: example.requestSummary,
    });
    const executeRules = unique([
      ...example.soundPlan.beats.map((beat) => toEngineDirective(beat)),
      ...example.constraints.map((constraint) => toEngineDirective(constraint)),
    ]);
    const rejectRules = unique([
      "peak only",
      "family reset",
      ...example.badOutputDescription.map((note) => toEngineDirective(note)),
    ]);

    return [
      `User prompt: ${example.userPrompt}`,
      `Request intent: ${formatRequestIntent(example)}`,
      `Hard rules: do NOT generate sound | define behavior for engine execution | all output must be executable | modify existing behavior, do not replace`,
      `Event type: ${resolveEventTypeLabel(example)}`,
      `Event family: ${resolvePreservedFamilyLabel(example)}`,
      `Human expectation: ${formatExpectationCommand(example)}`,
      `Physical event: ${formatPhysicalEventCommand(example)}`,
      `Trigger timing: ${
        example.sequenceTimingNotes.length > 0
          ? example.sequenceTimingNotes.map((note) => formatTimingDirective(note)).join(" | ")
          : "align peak to key visual cue"
      }`,
      `Event shape: ${formatEventShape(example.soundFamily)}`,
      `Parameters: ${formatParameterBundle(example)}`,
      `Family lock: ${formatFamilyLockCommand(example)}`,
      `Engine handoff: ${formatEngineHandoff(example)}`,
      `Strict command: ${formatStrictExampleCommand(example)}`,
      `Allowed modifications: ${formatModifierInstruction(modifierGuidance)}`,
      `Planning commands: ${formatExamplePlanningCommands(example)}`,
      `Engine plan: ${formatSoundPlan(example.soundPlan, example.soundFamily)}`,
      `Execute: ${executeRules.length > 0 ? executeRules.join(" | ") : "preserve family lock | complete full event shape"}`,
      `Reject: ${rejectRules.join(" | ")}`,
      `Constraints: ${example.constraints.length > 0 ? example.constraints.map((constraint) => toEngineDirective(constraint)).join(" | ") : "None."}`,
      `Question policy: ${formatQuestionPolicy(example)}`,
    ].join("\n");
  })();

export const formatGenerateSoundExamplesForPrompt = (examples: GenerateSoundExample[]): string => {
  if (examples.length === 0) {
    return "No relevant Generate Sound training examples selected.";
  }

  return examples
    .map((example, index) => [`Example ${index + 1} (${example.exampleKind})`, formatExampleBlock(example)].join("\n"))
    .join("\n\n---\n\n");
};
