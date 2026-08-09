import type { DrawingAiSoundFamily, DrawingAiSoundOption, DrawingAiWorkspaceContext } from "./drawingAiContract";
import {
  buildCanonicalSoundOptionSet,
  inferCanonicalSoundTimingFeel,
  stripLeadingSoundGreetingFiller,
  type CanonicalSoundOptionSet,
} from "./drawingSoundPlanner";
import { inspectSoundOptionRecipe } from "./drawingSoundSynthesis";
import type { GenerateSoundExample } from "./DrawingWorkspaceTask_GenerateSound";

export type SoundIntentAnalysis = {
  sourcePrompt: string;
  normalizedPrompt: string;
  primaryFamily: DrawingAiSoundFamily | null;
  lockedFamily: DrawingAiSoundFamily | null;
  secondaryFamilies: DrawingAiSoundFamily[];
  action: string | null;
  materials: string[];
  environment: string[];
  motion: string[];
  intensity: "soft" | "medium" | "heavy";
  durationSeconds: number | null;
  styleWords: string[];
  negativeConstraints: string[];
  timingFeel: string;
  isHybrid: boolean;
  isRevision: boolean;
  isContinuation: boolean;
  unknownEntityPhrase: string | null;
  inheritedFamily: DrawingAiSoundFamily | null;
};

export type ExampleGuidanceSummary = {
  matchedExampleIds: string[];
  goodBehaviors: string[];
  badBehaviors: string[];
  expectationTemplate: string;
  physicalTemplate: string;
  eventShapeTemplate: string;
  timingTemplate: string;
  textureTemplate: string;
  familyLockRule: string;
  modifierRule: string;
  variantHints: string[];
  antiDriftRules: string[];
  exampleCoverageScore: number;
};

export type PlanningConfidenceCheck = {
  familyConfidence: number;
  styleConfidence: number;
  materialConfidence: number;
  exampleCoverageScore: number;
  mismatchScore: number;
  requiresReferenceLookup: boolean;
  lookupReason: string | null;
};

export type SoundReferenceNote = {
  lookupUsed: boolean;
  lookupReason: string;
  sourceSummary: string;
  behaviorClues: string[];
  textureHints: string[];
  timingHints: string[];
  negativeWarnings: string[];
  styleHints: string[];
  expiresAfterPlan: true;
};

export type SoundLayerPlan = {
  role: "attack" | "body" | "tail" | "cadence" | "ambience" | "detail";
  sourceType: string;
  material: string | null;
  motion: string;
  spectralRole: string;
  bannedCues: string[];
};

export type SoundPlan = {
  planId: string;
  soundFamily: DrawingAiSoundFamily;
  soundProfile: string | null;
  intentSummary: string;
  timingStructure: string;
  textureProfile: string;
  layers: SoundLayerPlan[];
  negativeConstraints: string[];
  styleModifiers: string[];
  validationTargets: string[];
  previewSignature: string;
  referenceUsed: boolean;
  referenceSummary: string | null;
  fallbackUsed: boolean;
  fallbackReason: string | null;
  recommendedReason: string;
};

export type SoundValidationReport = {
  requestMatchScore: number;
  exampleAlignmentScore: number;
  constraintViolations: string[];
  tooGeneric: boolean;
  tooDistorted: boolean;
  familyDrift: boolean;
  adjustedOnce: boolean;
};

export type OrchestratedGenerateSoundResult = {
  decision: "question" | "result";
  response: string;
  question: string | null;
  questionOptions: string[] | null;
  soundOptions: DrawingAiSoundOption[] | null;
  warnings: string[];
  analysis: SoundIntentAnalysis;
  exampleGuidance: ExampleGuidanceSummary;
  confidence: PlanningConfidenceCheck;
  referenceNote: SoundReferenceNote | null;
  soundPlan: SoundPlan | null;
  validation: SoundValidationReport | null;
  referenceLookupQuery: string | null;
  fallbackUsed: boolean;
};

export type SoundReferenceSearchResult = {
  title: string;
  summary: string;
  url: string;
};

const STRONG_FAMILY_PATTERNS: Array<{ family: DrawingAiSoundFamily; pattern: RegExp }> = [
  { family: "explosion", pattern: /\b(explosion|detonation|blast|shockwave)\b/i },
  { family: "zipper", pattern: /\b(zipper|zip|unzipping|zipping)\b/i },
  { family: "wind", pattern: /\b(wind|gust|breeze|windy)\b/i },
  { family: "rain", pattern: /\b(rain(?:y)?|raindrops?|drizzle|downpour|rainfall)\b/i },
  { family: "thunder", pattern: /\b(lightning|thunderstrike|thunder strike|thunderclap|thunder crack)\b/i },
  { family: "punch", pattern: /\b(punch|fist|knuckle|body hit|smack)\b/i },
  { family: "kick", pattern: /\b(kick|roundhouse|dropkick|boot hit|heel kick|knee strike)\b/i },
  { family: "footsteps", pattern: /\b(footsteps?|walking|walks?|step|steps|stomp|stomping)\b/i },
  { family: "bone-break", pattern: /\b(bone|fracture|fractured|bone crack|bone snap|dry break)\b/i },
  { family: "door", pattern: /\b(door|hinge|hallway door|wooden door)\b/i },
  { family: "water", pattern: /\b(water|splash|plunge|wet hit|wave crash)\b/i },
  { family: "debris", pattern: /\b(debris|rubble|collapse|rockfall|crash|clatter)\b/i },
  { family: "volcano", pattern: /\b(volcano|eruption|lava burst|magma burst)\b/i },
  { family: "laser", pattern: /\b(laser|blaster|plasma)\b/i },
  { family: "energy", pattern: /\b(energy burst|energy wave|energy beam|discharge)\b/i },
  { family: "magic", pattern: /\b(magic|arcane|spell|mystic|rune|enchanted)\b/i },
  { family: "fire", pattern: /\b(fire|flame|ignite|ignition|flare|fireball)\b/i },
  {
    family: "vehicle-pass",
    pattern:
      /\b(?:race car|racecar|car|vehicle|engine|motor)\b[\s\S]*\b(?:pass(?:-by)?|passes by|past camera|zooms past|zooms by|approach|approaching|receding|going away|doppler)\b/i,
  },
  { family: "sword", pattern: /\b(sword|blade|katana|saber)\b[\s\S]*\b(slash|slice|swing|cut)\b/i },
  { family: "whoosh", pattern: /\b(whoosh|swish|swoosh|air swipe|motion pass)\b/i },
  { family: "creature", pattern: /\b(t-?rex|dinosaur|creature|monster|beast|dragon|roar|growl)\b/i },
];

const FAMILY_TAG_HINTS: Record<DrawingAiSoundFamily, string[]> = {
  "bone-break": ["bone-break", "fracture", "material-distinction"],
  "cartoon-bounce": ["cartoon-bounce", "boing-spring"],
  "ui-beep": ["ui-beep", "button-press", "soft-tech"],
  zipper: ["zipper", "mechanical", "friction"],
  creature: ["creature", "t-rex", "monster"],
  thunder: ["thunder", "storm"],
  electricity: ["electricity", "zap"],
  volcano: ["volcano", "debris", "environmental"],
  "pebble-water": ["water", "pebble"],
  water: ["water", "splash"],
  fire: ["fire", "flame"],
  footsteps: ["footsteps", "giant footsteps", "movement"],
  rain: ["rain", "storm", "weather"],
  wind: ["wind", "environmental"],
  rustle: ["rustle", "leaves"],
  debris: ["debris", "crash", "rubble"],
  "branch-snap": ["branch", "twig"],
  door: ["door", "hinge", "slow-open"],
  "door-sci-fi": ["door", "mechanical", "airlock"],
  explosion: ["explosion", "blast"],
  punch: ["punch", "impact"],
  kick: ["kick", "impact"],
  sword: ["sword", "slash"],
  whoosh: ["whoosh", "motion"],
  impact: ["impact", "fall then impact"],
  laser: ["laser", "beam"],
  energy: ["energy", "beam"],
  magic: ["magic", "spell"],
  "vehicle-pass": ["vehicle", "race-car"],
  "background-rumble": ["background"],
  "room-tone": ["room", "hallway"],
  portal: ["portal", "magic"],
  generic: [],
};

const STYLE_WORD_PATTERN =
  /\b(cinematic|anime|realistic|stylized|stylised|eerie|cartoony|cartoon|ancient|divine|monstrous|epic|mythic|godlike|creepy|horror|professional)\b/gi;
const INTENSITY_PATTERN = /\b(soft|quiet|gentle|subtle|light|heavy|hard|huge|massive|big|brutal|strong)\b/gi;
const REVISION_PATTERN =
  /\b(harder|heavier|sharper|softer|shorter|longer|bigger|smaller|darker|brighter|cleaner|less tail|more tail|more bass|less bass|redo|try again|fix it|make it|same hit|same explosion|same sound but|same(?:\s+[a-z-]+){0,3}\s+but)\b/i;
const CONTINUATION_PATTERN =
  /\b(continue|same project|same sound family|same vibe|same one|same hit|same explosion|same ambience|next beat|second hit|third hit|follow-up|same(?:\s+[a-z-]+){0,3}\s+but)\b/i;
const HYBRID_PATTERN =
  /\b(with|plus|and|layered with|mixed with|under|during|fight in|chase in|scene with)\b/i;
const NEGATIVE_CONSTRAINT_PATTERNS = [
  "alien",
  "ufo",
  "robotic",
  "robot",
  "distorted",
  "harsh",
  "deep",
  "rumble",
  "scary",
  "creepy",
  "spooky",
  "growl",
  "hum",
  "drone",
] as const;
const MATERIAL_PATTERNS: Array<{ material: string; pattern: RegExp }> = [
  { material: "metal", pattern: /\b(metal|metallic|steel|iron)\b/i },
  { material: "wood", pattern: /\b(wood|wooden|timber)\b/i },
  { material: "bone", pattern: /\b(bone|fracture|skeletal)\b/i },
  { material: "stone", pattern: /\b(stone|rock|rocky|concrete|cement|brick|cobblestone)\b/i },
  { material: "water", pattern: /\b(water|wet|splash|spray)\b/i },
  { material: "cloth", pattern: /\b(cloth|fabric|cape|coat|jacket)\b/i },
  { material: "glass", pattern: /\b(glass|window|pane)\b/i },
  { material: "dirt", pattern: /\b(dirt|dust|grit|soil|mud)\b/i },
];
const ENVIRONMENT_PATTERNS: Array<{ value: string; pattern: RegExp }> = [
  { value: "indoor", pattern: /\b(indoor|inside|room|hallway|corridor)\b/i },
  { value: "outdoor", pattern: /\b(outdoor|outside|forest|field|street|open air)\b/i },
  { value: "storm", pattern: /\b(storm|stormy|thunder|lightning)\b/i },
  { value: "battlefield", pattern: /\b(battlefield|combat gods|war zone|arena|fight scene)\b/i },
  { value: "underwater", pattern: /\b(underwater|under water)\b/i },
  { value: "cave", pattern: /\b(cave|cavern)\b/i },
];
const MOTION_PATTERNS: Array<{ value: string; pattern: RegExp }> = [
  { value: "impact", pattern: /\b(impact|hit|slam|punch|kick|blast|burst)\b/i },
  { value: "continuous", pattern: /\b(continuous|looping|ongoing|under the whole shot|throughout)\b/i },
  { value: "pass-by", pattern: /\b(pass|pass-by|passes by|approach|recede|coming and going)\b/i },
  { value: "scrape", pattern: /\b(scrape|slide|zip|creak|drag)\b/i },
  { value: "repeated", pattern: /\b(repeated|footsteps|running|rain|dripping)\b/i },
  { value: "release", pattern: /\b(release|swell|build|aftershock|tail)\b/i },
];
const ACTION_PATTERNS: Array<{ value: string; pattern: RegExp }> = [
  { value: "explode", pattern: /\b(explode|explosion|detonation|blast)\b/i },
  { value: "zip", pattern: /\b(zipper|zip|unzipping|zipping)\b/i },
  { value: "snap", pattern: /\b(snap|crack|fracture|break)\b/i },
  { value: "creak", pattern: /\b(creak|open|groan)\b/i },
  { value: "roar", pattern: /\b(roar|growl|scream)\b/i },
  { value: "stomp", pattern: /\b(stomp|footsteps|run|running|walk)\b/i },
  { value: "splash", pattern: /\b(splash|plunge|spray)\b/i },
  { value: "slam", pattern: /\b(slam|impact|hit|land)\b/i },
];

const REFERENCE_CLUE_LIBRARY: Record<
  DrawingAiSoundFamily,
  { behaviorClues: string[]; textureHints: string[]; timingHints: string[]; negativeWarnings: string[] }
> = {
  explosion: {
    behaviorClues: ["pressure front", "blast body", "debris and dust tail"],
    textureHints: ["broad explosive body", "sharp transient", "controlled low-end weight"],
    timingHints: ["fast front hit", "readable decay"],
    negativeWarnings: ["avoid muddy rumble", "avoid alien hover hum"],
  },
  zipper: {
    behaviorClues: ["tooth-by-tooth friction", "close-detail slide", "small terminal click"],
    textureHints: ["metal-plastic chatter", "tight mechanical texture"],
    timingHints: ["rapid repeated ticks", "short finish stop"],
    negativeWarnings: ["avoid hiss burst", "avoid explosion-like weight"],
  },
  wind: {
    behaviorClues: ["moving air bed", "gust modulation", "turbulence motion"],
    textureHints: ["airy broadband texture", "edge turbulence"],
    timingHints: ["entry swell", "sustain motion", "soft exit"],
    negativeWarnings: ["avoid tonal drone", "avoid engine-like sweep"],
  },
  rain: {
    behaviorClues: ["weather bed", "drop variation", "surface interaction"],
    textureHints: ["mixed droplet sizes", "light high-end patter"],
    timingHints: ["continuous bed with shifting density"],
    negativeWarnings: ["avoid same-pitch ticking", "avoid static hiss wash"],
  },
  thunder: {
    behaviorClues: ["lightning crack", "body hit", "rolling tail"],
    textureHints: ["sharp top transient", "storm body resonance"],
    timingHints: ["instant crack then tail"],
    negativeWarnings: ["avoid flat drone", "avoid laser-like zap"],
  },
  punch: {
    behaviorClues: ["contact transient", "body thump"],
    textureHints: ["tight dry impact", "short smack follow-through"],
    timingHints: ["single impact beat"],
    negativeWarnings: ["avoid hollow thud", "avoid sword-like whoosh"],
  },
  footsteps: {
    behaviorClues: ["cadence", "surface contact", "weight transfer"],
    textureHints: ["heel-toe contact", "surface grit"],
    timingHints: ["repeated impacts with spacing variation"],
    negativeWarnings: ["avoid identical thuds", "avoid explosion tail"],
  },
  "bone-break": {
    behaviorClues: ["initial snap", "secondary fracture chatter", "body-adjacent runout"],
    textureHints: ["brittle crack texture", "controlled grit"],
    timingHints: ["short impact or longer fracture sequence"],
    negativeWarnings: ["avoid woody crack", "avoid boomy blast"],
  },
  door: {
    behaviorClues: ["hinge friction", "wood strain", "uneven opening pulses"],
    textureHints: ["dry creak texture", "old wood groan"],
    timingHints: ["gradual movement across the open beat"],
    negativeWarnings: ["avoid metallic chirp", "avoid random squeak tone"],
  },
  water: {
    behaviorClues: ["slap", "body", "spray tail"],
    textureHints: ["wet surface impact", "spray detail"],
    timingHints: ["sharp splash front then spray decay"],
    negativeWarnings: ["avoid one-note plop", "avoid explosion bloom"],
  },
  creature: {
    behaviorClues: ["breath and chest body", "organic attack", "scale contour"],
    textureHints: ["rough organic rasp", "living-animal body"],
    timingHints: ["attack-body-tail arc"],
    negativeWarnings: ["avoid UFO hum", "avoid robotic beam tone"],
  },
  debris: {
    behaviorClues: ["fragment scatter", "uneven impacts", "dust rollout"],
    textureHints: ["hard fragments", "grit and dust"],
    timingHints: ["staggered impacts then tail"],
    negativeWarnings: ["avoid single boom", "avoid creature growl bed"],
  },
  volcano: {
    behaviorClues: ["pressure release", "rock throw", "ash rollout"],
    textureHints: ["grit and rock texture", "environmental scale"],
    timingHints: ["pressure front then environmental tail"],
    negativeWarnings: ["avoid plain explosion clone", "avoid monster rumble"],
  },
  sword: {
    behaviorClues: ["air pass", "blade edge", "clean slice"],
    textureHints: ["thin metallic air texture", "sharp pass detail"],
    timingHints: ["pre-contact slice arc"],
    negativeWarnings: ["avoid punch thump", "avoid generic whoosh mush"],
  },
  generic: {
    behaviorClues: ["simple neutral source cue"],
    textureHints: ["restrained clean texture"],
    timingHints: ["clear short envelope"],
    negativeWarnings: ["avoid tonal hum", "avoid family-confusing cues"],
  },
  "cartoon-bounce": {
    behaviorClues: ["springy bounce"],
    textureHints: ["elastic tone"],
    timingHints: ["quick bounce curve"],
    negativeWarnings: ["avoid harsh blast"],
  },
  "ui-beep": {
    behaviorClues: ["clean click pulse"],
    textureHints: ["controlled electronic chirp"],
    timingHints: ["very short confirmation cue"],
    negativeWarnings: ["avoid impact weight"],
  },
  electricity: {
    behaviorClues: ["arc snap"],
    textureHints: ["sharp electrical crackle"],
    timingHints: ["fast snap then decay"],
    negativeWarnings: ["avoid heavy explosion body"],
  },
  "pebble-water": {
    behaviorClues: ["small drop", "tiny splash"],
    textureHints: ["light plip"],
    timingHints: ["quick drop beat"],
    negativeWarnings: ["avoid huge splash"],
  },
  fire: {
    behaviorClues: ["flare front", "hot body"],
    textureHints: ["crackle or whoomph texture"],
    timingHints: ["burst then flame tail"],
    negativeWarnings: ["avoid explosion clone"],
  },
  rustle: {
    behaviorClues: ["light movement detail"],
    textureHints: ["leaf or cloth texture"],
    timingHints: ["short shifting motion"],
    negativeWarnings: ["avoid heavy low-end"],
  },
  "branch-snap": {
    behaviorClues: ["dry crack"],
    textureHints: ["wood fiber snap"],
    timingHints: ["fast break beat"],
    negativeWarnings: ["avoid bone texture"],
  },
  "door-sci-fi": {
    behaviorClues: ["pressure slide", "mechanical door movement"],
    textureHints: ["clean mechanical air release"],
    timingHints: ["slide open beat"],
    negativeWarnings: ["avoid organic creak"],
  },
  kick: {
    behaviorClues: ["contact front", "leg-driven body hit"],
    textureHints: ["sharper impact than punch"],
    timingHints: ["single attack beat"],
    negativeWarnings: ["avoid footstep cadence"],
  },
  whoosh: {
    behaviorClues: ["air motion"],
    textureHints: ["clean pass texture"],
    timingHints: ["motion arc"],
    negativeWarnings: ["avoid impact thump"],
  },
  impact: {
    behaviorClues: ["single collision front", "body follow-through"],
    textureHints: ["blunt impact texture"],
    timingHints: ["hit then short tail"],
    negativeWarnings: ["avoid explosion blast"],
  },
  laser: {
    behaviorClues: ["energy shot", "tail release"],
    textureHints: ["tight zap beam texture"],
    timingHints: ["fire beat then tail"],
    negativeWarnings: ["avoid creature hum"],
  },
  energy: {
    behaviorClues: ["charged release"],
    textureHints: ["focused energy texture"],
    timingHints: ["build then release"],
    negativeWarnings: ["avoid explosion mud"],
  },
  magic: {
    behaviorClues: ["arcane release", "sparkle tail"],
    textureHints: ["clean mystical shimmer"],
    timingHints: ["release arc"],
    negativeWarnings: ["avoid robotic tone"],
  },
  "vehicle-pass": {
    behaviorClues: ["approach", "pass peak", "receding tail"],
    textureHints: ["engine body", "road air"],
    timingHints: ["approach-to-recede motion"],
    negativeWarnings: ["avoid explosion blast"],
  },
  "background-rumble": {
    behaviorClues: ["background bed"],
    textureHints: ["soft distant texture"],
    timingHints: ["slow sustained presence"],
    negativeWarnings: ["avoid shared default use"],
  },
  "room-tone": {
    behaviorClues: ["space air bed"],
    textureHints: ["subtle room texture"],
    timingHints: ["steady low-key bed"],
    negativeWarnings: ["avoid tonal drone"],
  },
  portal: {
    behaviorClues: ["magical opening"],
    textureHints: ["soft energy swirl"],
    timingHints: ["open-release tail"],
    negativeWarnings: ["avoid explosion weight"],
  },
};

const formatFamilyLabel = (family: DrawingAiSoundFamily | null) => (family ?? "generic").replace(/-/g, " ");

const getExpectationTemplateForFamily = (family: DrawingAiSoundFamily | null) => {
  switch (family) {
    case "explosion":
      return "expect pressure build -> blast payoff -> debris aftermath";
    case "bone-break":
      return "expect tension -> fracture crack -> short settle";
    case "punch":
      return "expect drive-in -> body-led contact -> short release";
    case "kick":
      return "expect leg-led swing -> contact -> body transfer";
    case "footsteps":
      return "expect cadence -> surface contact -> release into next step";
    case "wind":
      return "expect environmental air movement -> gust body -> air fade";
    case "whoosh":
      return "expect motion onset -> air pass -> clean release";
    case "vehicle-pass":
      return "expect approach rise -> pass peak -> recede";
    case "door":
    case "door-sci-fi":
      return "expect mechanism onset -> movement body -> settle";
    case "ui-beep":
      return "expect input cue -> confirm pulse -> clean stop";
    case "magic":
    case "portal":
    case "energy":
      return "expect charge -> release -> controlled resolve";
    case "room-tone":
      return "expect place identity bed -> detail -> open space";
    default:
      return `expect full ${formatFamilyLabel(family)} event -> not peak only`;
  }
};

const getPhysicalTemplateForFamily = (family: DrawingAiSoundFamily | null) => {
  switch (family) {
    case "explosion":
      return "pressure front -> blast body -> debris tail";
    case "bone-break":
      return "tension cue -> fracture crack -> body-adjacent settle";
    case "punch":
      return "micro drive-in -> contact smack -> short follow-through";
    case "kick":
      return "leg swing -> shoe-led contact -> heavier transfer";
    case "footsteps":
      return "weight transfer -> surface contact -> release into the next step";
    case "wind":
      return "air entry -> gust motion -> open-air fade";
    case "whoosh":
      return "motion onset -> air shear peak -> clean release";
    case "vehicle-pass":
      return "approach rise -> pass-by peak -> receding engine tail";
    case "door":
      return "hinge or latch onset -> movement body -> settle";
    case "door-sci-fi":
      return "pressure release -> slide body -> clean stop";
    case "ui-beep":
      return "input click -> confirmation peak -> clean stop";
    case "magic":
    case "portal":
      return "charge or warp onset -> magical bloom -> controlled resolve";
    case "energy":
      return "charge -> release -> controlled discharge";
    case "room-tone":
      return "scene bed -> place detail -> open space";
    default:
      return "start setup -> main body -> aftermath resolve";
  }
};

const getEventShapeTemplateForFamily = (family: DrawingAiSoundFamily | null) => {
  switch (family) {
    case "explosion":
      return "start: pressure front | peak: blast body | aftermath: debris tail";
    case "bone-break":
      return "start: tension | peak: fracture crack | aftermath: short settle";
    case "punch":
      return "start: drive-in | peak: contact | aftermath: follow-through";
    case "kick":
      return "start: swing | peak: contact | aftermath: body transfer";
    case "footsteps":
      return "start: weight transfer | peak: contact | aftermath: release";
    case "wind":
      return "start: air entry | peak: gust motion | aftermath: fade";
    case "whoosh":
      return "start: motion onset | peak: swing pass | aftermath: release";
    case "vehicle-pass":
      return "start: approach | peak: pass-by | aftermath: recede";
    case "door":
    case "door-sci-fi":
      return "start: onset | peak: movement body | aftermath: settle";
    case "ui-beep":
      return "start: input cue | peak: confirm | aftermath: stop";
    case "magic":
    case "portal":
    case "energy":
      return "start: charge | peak: release | aftermath: resolve";
    case "room-tone":
      return "start: bed | peak: scene detail | aftermath: open space";
    default:
      return "start: setup | peak: main event | aftermath: resolve";
  }
};

const getFamilyLockRuleForFamily = (family: DrawingAiSoundFamily | null) => {
  switch (family) {
    case "explosion":
      return "preserve explosion | reject bone break | punch | magical bloom";
    case "bone-break":
      return "preserve bone break | reject wood snap | explosion | generic impact";
    case "punch":
      return "preserve punch | reject kick | explosion | sword";
    case "kick":
      return "preserve kick | reject punch | explosion | sword";
    case "wind":
      return "preserve wind | reject whoosh | vehicle pass | tonal drone";
    case "whoosh":
      return "preserve whoosh | reject wind bed | impact | vehicle pass";
    case "vehicle-pass":
      return "preserve vehicle pass | reject whoosh | explosion | static loop";
    case "ui-beep":
      return "preserve ui beep | reject impact | ambience | explosion";
    default:
      return `preserve ${formatFamilyLabel(family)} | reject neighboring family drift`;
  }
};

const DEFAULT_MODIFIER_RULE =
  "modify attack | weight | intensity | texture | timing | decay | layering only | preserve family identity";

const DEFAULT_SOUND_QUESTION = "What action or exact moment should this sound match?";
const DEFAULT_SOUND_QUESTION_OPTIONS: string[] | null = null;
const UNKNOWN_ENTITY_STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "big",
  "cinematic",
  "effect",
  "for",
  "generate",
  "godlike",
  "heavy",
  "me",
  "please",
  "realistic",
  "sound",
  "style",
  "the",
]);

const slugify = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);

const unique = <T>(values: T[]) => Array.from(new Set(values));

const parseDurationNumberToken = (token: string | undefined) => {
  if (!token) {
    return null;
  }

  const normalized = token.trim().toLowerCase();
  if (normalized === "half") return 0.5;
  if (normalized === "one") return 1;
  if (normalized === "two") return 2;
  if (normalized === "three") return 3;
  if (normalized === "four") return 4;
  if (normalized === "five") return 5;
  if (normalized === "six") return 6;

  const numericValue = Number.parseFloat(normalized);
  return Number.isFinite(numericValue) ? numericValue : null;
};

const inferRequestedDurationSeconds = (normalizedPrompt: string) => {
  const betweenMatch = normalizedPrompt.match(
    /\bbetween\s+(\d+(?:\.\d+)?|half|one|two|three|four|five|six)\s+(?:and|to)\s+(\d+(?:\.\d+)?|half|one|two|three|four|five|six)\s+seconds?\b/i,
  );
  if (betweenMatch) {
    const low = parseDurationNumberToken(betweenMatch[1]);
    const high = parseDurationNumberToken(betweenMatch[2]);
    if (low != null && high != null) {
      return (low + high) / 2;
    }
  }

  const rangeMatch = normalizedPrompt.match(
    /\b(\d+(?:\.\d+)?|half|one|two|three|four|five|six)\s*(?:to|-)\s*(\d+(?:\.\d+)?|half|one|two|three|four|five|six)\s+seconds?\b/i,
  );
  if (rangeMatch) {
    const low = parseDurationNumberToken(rangeMatch[1]);
    const high = parseDurationNumberToken(rangeMatch[2]);
    if (low != null && high != null) {
      return (low + high) / 2;
    }
  }

  const singleMatch = normalizedPrompt.match(
    /\b(?:for|around|about|roughly)?\s*(\d+(?:\.\d+)?|half|one|two|three|four|five|six)\s+seconds?\b/i,
  );
  if (singleMatch) {
    return parseDurationNumberToken(singleMatch[1]);
  }

  return null;
};

const extractNegativeConstraints = (normalizedPrompt: string) =>
  unique(
    NEGATIVE_CONSTRAINT_PATTERNS.flatMap((constraint) =>
      new RegExp(`\\b(?:not|no|without|less|avoid)\\b[^,.!?;]*\\b${constraint}\\b`, "i").test(normalizedPrompt)
        ? [constraint]
        : [],
    ),
  );

const inferPrimaryFamily = (normalizedPrompt: string) =>
  STRONG_FAMILY_PATTERNS.find(({ pattern }) => pattern.test(normalizedPrompt))?.family ?? null;

const inferSecondaryFamilies = (normalizedPrompt: string, primaryFamily: DrawingAiSoundFamily | null) =>
  unique(
    STRONG_FAMILY_PATTERNS.flatMap(({ family, pattern }) =>
      family !== primaryFamily && pattern.test(normalizedPrompt) ? [family] : [],
    ),
  ).slice(0, 3);

const extractUnknownEntityPhrase = (normalizedPrompt: string, primaryFamily: DrawingAiSoundFamily | null) => {
  if (!primaryFamily) {
    return null;
  }

  const familyPattern = STRONG_FAMILY_PATTERNS.find((entry) => entry.family === primaryFamily)?.pattern;
  const familyMatch = familyPattern ? normalizedPrompt.match(familyPattern) : null;
  const familyToken = familyMatch?.[1] ?? familyMatch?.[0] ?? null;
  if (!familyToken) {
    return null;
  }

  const leading = normalizedPrompt.slice(0, normalizedPrompt.indexOf(familyToken)).trim();
  const entityTokens = leading
    .split(/\s+/)
    .map((token) => token.replace(/[^a-z0-9-]/gi, "").toLowerCase())
    .filter((token) => token.length > 2 && !UNKNOWN_ENTITY_STOP_WORDS.has(token))
    .slice(-3);

  return entityTokens.length >= 2 ? entityTokens.join(" ") : null;
};

const inferAction = (normalizedPrompt: string) =>
  ACTION_PATTERNS.find(({ pattern }) => pattern.test(normalizedPrompt))?.value ?? null;

const extractValues = <T extends string>(
  normalizedPrompt: string,
  patterns: Array<{ value: T; pattern: RegExp }>,
) => unique(patterns.flatMap(({ value, pattern }) => (pattern.test(normalizedPrompt) ? [value] : [])));

const extractMaterialValues = (normalizedPrompt: string) =>
  unique(MATERIAL_PATTERNS.flatMap(({ material, pattern }) => (pattern.test(normalizedPrompt) ? [material] : [])));

const inferIntensity = (normalizedPrompt: string): SoundIntentAnalysis["intensity"] => {
  const tokens = normalizedPrompt.match(INTENSITY_PATTERN) ?? [];
  if (tokens.some((token) => /\b(heavy|hard|huge|massive|big|brutal|strong)\b/i.test(token))) {
    return "heavy";
  }
  if (tokens.some((token) => /\b(soft|quiet|gentle|subtle|light)\b/i.test(token))) {
    return "soft";
  }
  return "medium";
};

const extractStyleWords = (normalizedPrompt: string) => unique(normalizedPrompt.match(STYLE_WORD_PATTERN) ?? []);

export const resolveRequestedSoundOptionCountV2 = (userPrompt: string) => {
  const normalizedPrompt = userPrompt.toLowerCase();
  if (/\b([2-4])\s+(?:sound\s+)?(?:options?|variants?|choices?)\b/.test(normalizedPrompt)) {
    const match = normalizedPrompt.match(/\b([2-4])\s+(?:sound\s+)?(?:options?|variants?|choices?)\b/);
    return Number.parseInt(match?.[1] ?? "1", 10);
  }
  if (/\b(a )?couple\b.*\b(?:options?|variants?|choices?)\b/.test(normalizedPrompt)) {
    return 2;
  }
  if (/\ba few\b.*\b(?:options?|variants?|choices?)\b/.test(normalizedPrompt)) {
    return 3;
  }
  if (/\b(?:options?|variants?|choices?)\b/.test(normalizedPrompt) && /\b(two|three|four)\b/.test(normalizedPrompt)) {
    return /\bfour\b/.test(normalizedPrompt) ? 4 : /\bthree\b/.test(normalizedPrompt) ? 3 : 2;
  }
  return 1;
};

export const analyzeSoundIntent = ({
  userPrompt,
  recentSoundOptions = null,
  workspaceContext = null,
}: {
  userPrompt: string;
  recentSoundOptions?: DrawingAiSoundOption[] | null;
  workspaceContext?: DrawingAiWorkspaceContext | null;
}): SoundIntentAnalysis => {
  const normalizedPrompt = stripLeadingSoundGreetingFiller(userPrompt).toLowerCase();
  const revisionBaseOption =
    REVISION_PATTERN.test(normalizedPrompt) && (recentSoundOptions?.length ?? 0) >= 1 ? recentSoundOptions?.[0] ?? null : null;
  const lockedFamily = inferPrimaryFamily(normalizedPrompt);
  const inheritedFamily = lockedFamily == null ? revisionBaseOption?.soundFamily ?? null : null;
  const primaryFamily = lockedFamily ?? inheritedFamily;
  const secondaryFamilies = inferSecondaryFamilies(normalizedPrompt, primaryFamily);

  return {
    sourcePrompt: userPrompt,
    normalizedPrompt,
    primaryFamily,
    lockedFamily,
    secondaryFamilies,
    action: inferAction(normalizedPrompt),
    materials: extractMaterialValues(normalizedPrompt),
    environment: extractValues(normalizedPrompt, ENVIRONMENT_PATTERNS),
    motion: extractValues(normalizedPrompt, MOTION_PATTERNS),
    intensity: inferIntensity(normalizedPrompt),
    durationSeconds: inferRequestedDurationSeconds(normalizedPrompt),
    styleWords: extractStyleWords(normalizedPrompt),
    negativeConstraints: extractNegativeConstraints(normalizedPrompt),
    timingFeel: inferCanonicalSoundTimingFeel(normalizedPrompt, workspaceContext),
    isHybrid: HYBRID_PATTERN.test(normalizedPrompt) && secondaryFamilies.length > 0,
    isRevision: REVISION_PATTERN.test(normalizedPrompt),
    isContinuation: CONTINUATION_PATTERN.test(normalizedPrompt),
    unknownEntityPhrase: extractUnknownEntityPhrase(normalizedPrompt, primaryFamily),
    inheritedFamily,
  };
};

export const buildExampleGuidanceSummary = ({
  analysis,
  examples,
}: {
  analysis: SoundIntentAnalysis;
  examples: GenerateSoundExample[];
}): ExampleGuidanceSummary => {
  const familyHints = analysis.primaryFamily ? FAMILY_TAG_HINTS[analysis.primaryFamily] ?? [] : [];
  const familyMatchCount = examples.filter((example) =>
    example.tags.some((tag) => familyHints.includes(tag)) || (analysis.primaryFamily != null && example.category.includes(analysis.primaryFamily))
  ).length;
  const goodBehaviors = unique(
    examples
      .flatMap((example) => example.soundQualityNotes)
      .filter((note) => /^good:/i.test(note) || /keep|preserve|favor|vary|avoid generic/i.test(note))
      .slice(0, 8),
  );
  const badBehaviors = unique(
    [
      ...examples.flatMap((example) => example.soundQualityNotes.filter((note) => /^bad:/i.test(note))),
      ...examples.flatMap((example) => example.badStyleNotes),
    ].slice(0, 8),
  );
  const expectationTemplate = getExpectationTemplateForFamily(analysis.primaryFamily);
  const physicalTemplate = getPhysicalTemplateForFamily(analysis.primaryFamily);
  const eventShapeTemplate = getEventShapeTemplateForFamily(analysis.primaryFamily);
  const timingTemplate =
    analysis.primaryFamily === "zipper"
      ? "start: zip start | peak: tooth chatter | aftermath: finish click"
      : analysis.primaryFamily === "rain"
        ? "start: weather entry | peak: shifting sustain | aftermath: soft release"
        : analysis.primaryFamily === "thunder"
          ? "start: crack | peak: storm body | aftermath: roll"
          : analysis.primaryFamily === "creature"
            ? "start: attack | peak: body | aftermath: breath release"
            : eventShapeTemplate;
  const textureTemplate =
    analysis.primaryFamily === "zipper"
      ? "tight mechanical friction with close-detail chatter"
      : analysis.primaryFamily === "explosion"
        ? "clean explosive body with controlled debris detail"
        : analysis.primaryFamily === "creature"
          ? "organic breath-led body with textured aggression"
          : analysis.primaryFamily === "rain"
            ? "varied droplets over a readable weather bed"
            : analysis.primaryFamily === "wind"
              ? "airy moving turbulence without tonal drone"
              : analysis.primaryFamily === "bone-break"
                ? "brittle anatomical crack texture with controlled grit"
                : analysis.primaryFamily === "footsteps"
                  ? "surface-led contact texture with cadence variation"
                  : "clear family-specific texture with restrained processing";

  return {
    matchedExampleIds: examples.map((example) => example.id),
    goodBehaviors,
    badBehaviors,
    expectationTemplate,
    physicalTemplate,
    eventShapeTemplate,
    timingTemplate,
    textureTemplate,
    familyLockRule: getFamilyLockRuleForFamily(analysis.primaryFamily),
    modifierRule: DEFAULT_MODIFIER_RULE,
    variantHints: unique(examples.flatMap((example) => example.responseFocus)).slice(0, 6),
    antiDriftRules: unique(
      examples.flatMap((example) => example.badStyleNotes.concat(example.consistencyRules)).filter((line) =>
        /avoid|do not|preserve|keep/i.test(line),
      ),
    ).slice(0, 6),
    exampleCoverageScore: Math.max(0.1, Math.min(1, familyMatchCount * 0.22 + Math.min(4, examples.length) * 0.08)),
  };
};

export const buildPlanningConfidenceCheck = ({
  analysis,
  exampleGuidance,
}: {
  analysis: SoundIntentAnalysis;
  exampleGuidance: ExampleGuidanceSummary;
}): PlanningConfidenceCheck => {
  const familyConfidence =
    analysis.lockedFamily != null ? 0.96 : analysis.primaryFamily != null ? 0.78 : analysis.inheritedFamily != null ? 0.72 : 0.28;
  const materialConfidence =
    analysis.materials.length > 0
      ? 0.9
      : analysis.primaryFamily != null && ["door", "bone-break", "zipper", "water", "debris"].includes(analysis.primaryFamily)
        ? 0.68
        : 0.52;
  const styleConfidence =
    analysis.styleWords.length === 0 && analysis.unknownEntityPhrase == null
      ? 0.92
      : analysis.unknownEntityPhrase != null
        ? 0.34
        : exampleGuidance.exampleCoverageScore >= 0.66
          ? 0.7
          : 0.48;
  const mismatchScore =
    (analysis.unknownEntityPhrase != null ? 0.38 : 0) +
    (analysis.primaryFamily == null ? 0.42 : 0) +
    (analysis.styleWords.length > 0 && exampleGuidance.exampleCoverageScore < 0.55 ? 0.24 : 0) +
    (analysis.primaryFamily === "creature" && analysis.styleWords.length > 0 && exampleGuidance.exampleCoverageScore < 0.7 ? 0.18 : 0);
  const requiresReferenceLookup =
    analysis.primaryFamily != null &&
    !analysis.isRevision &&
    !analysis.isContinuation &&
    (analysis.unknownEntityPhrase != null ||
      (analysis.primaryFamily === "creature" && styleConfidence < 0.62) ||
      (analysis.styleWords.length > 0 && exampleGuidance.exampleCoverageScore < 0.56) ||
      mismatchScore >= 0.45);
  const lookupReason =
    analysis.unknownEntityPhrase != null
      ? `Style/entity phrase "${analysis.unknownEntityPhrase}" is not covered confidently by local examples alone.`
      : analysis.primaryFamily === "creature" && styleConfidence < 0.62
        ? "Creature/style specificity is still weak after example matching."
        : analysis.styleWords.length > 0 && exampleGuidance.exampleCoverageScore < 0.56
          ? "The request expects a specific style, but the matched examples only partially cover it."
          : mismatchScore >= 0.45
            ? "Prompt style cues and example coverage are mismatched enough to justify one reference lookup."
            : null;

  return {
    familyConfidence,
    styleConfidence,
    materialConfidence,
    exampleCoverageScore: exampleGuidance.exampleCoverageScore,
    mismatchScore,
    requiresReferenceLookup,
    lookupReason,
  };
};

export const buildSoundReferenceLookupQuery = (analysis: SoundIntentAnalysis) => {
  if (!analysis.primaryFamily) {
    return null;
  }

  const styleTerms = analysis.unknownEntityPhrase ?? analysis.styleWords.slice(0, 2).join(" ");
  const materialTerms = analysis.materials.slice(0, 2).join(" ");
  return [styleTerms, analysis.primaryFamily, materialTerms, "sound behavior reference"]
    .filter((value) => value != null && value.trim().length > 0)
    .join(" ")
    .trim();
};

const extractMatchedReferenceHints = (text: string, family: DrawingAiSoundFamily) => {
  const library = REFERENCE_CLUE_LIBRARY[family] ?? REFERENCE_CLUE_LIBRARY.generic;
  const matchHints = (values: string[]) =>
    unique(
      values.flatMap((value) => {
        const matchToken = value
          .split(/[\s/-]+/)
          .find((token) => token.length > 3 && text.includes(token.toLowerCase()));
        return matchToken ? [value] : [];
      }),
    );

  return {
    behaviorClues: matchHints(library.behaviorClues),
    textureHints: matchHints(library.textureHints),
    timingHints: matchHints(library.timingHints),
    negativeWarnings: matchHints(library.negativeWarnings),
  };
};

export const buildSoundReferenceNoteFromSearchResults = ({
  analysis,
  searchResults,
  lookupReason,
}: {
  analysis: SoundIntentAnalysis;
  searchResults: SoundReferenceSearchResult[];
  lookupReason: string;
}): SoundReferenceNote | null => {
  if (!analysis.primaryFamily || searchResults.length === 0) {
    return null;
  }

  const aggregateText = searchResults
    .slice(0, 3)
    .map((result) => `${result.title} ${result.summary}`.toLowerCase())
    .join(" ");
  const library = REFERENCE_CLUE_LIBRARY[analysis.primaryFamily] ?? REFERENCE_CLUE_LIBRARY.generic;
  const matchedHints = extractMatchedReferenceHints(aggregateText, analysis.primaryFamily);

  return {
    lookupUsed: true,
    lookupReason,
    sourceSummary: searchResults
      .slice(0, 2)
      .map((result) => result.title.trim())
      .filter(Boolean)
      .join(" | "),
    behaviorClues: matchedHints.behaviorClues.length > 0 ? matchedHints.behaviorClues : library.behaviorClues,
    textureHints: matchedHints.textureHints.length > 0 ? matchedHints.textureHints : library.textureHints,
    timingHints: matchedHints.timingHints.length > 0 ? matchedHints.timingHints : library.timingHints,
    negativeWarnings: matchedHints.negativeWarnings.length > 0 ? matchedHints.negativeWarnings : library.negativeWarnings,
    styleHints: unique([
      ...(analysis.styleWords.length > 0 ? analysis.styleWords : []),
      ...(analysis.unknownEntityPhrase ? [analysis.unknownEntityPhrase] : []),
    ]).slice(0, 4),
    expiresAfterPlan: true,
  };
};

const buildLayerPlan = (family: DrawingAiSoundFamily, analysis: SoundIntentAnalysis): SoundLayerPlan[] => {
  switch (family) {
    case "explosion":
      return [
        { role: "attack", sourceType: "pressure-front", material: null, motion: "impact", spectralRole: "mid-high transient", bannedCues: ["ufo", "hum"] },
        { role: "body", sourceType: "blast-body", material: analysis.materials[0] ?? "air", motion: "expansion", spectralRole: "broadband body", bannedCues: ["muddy rumble"] },
        { role: "tail", sourceType: "debris-tail", material: "dust", motion: "decay", spectralRole: "high-mid decay", bannedCues: ["hover drone"] },
      ];
    case "zipper":
      return [
        { role: "attack", sourceType: "zip-start", material: "metal", motion: "slide", spectralRole: "tight click front", bannedCues: ["noise burst"] },
        { role: "body", sourceType: "tooth-chatter", material: "metal", motion: "rapid friction", spectralRole: "mid-high chatter", bannedCues: ["explosion body"] },
        { role: "tail", sourceType: "finish-click", material: "metal", motion: "stop", spectralRole: "short high click", bannedCues: ["hiss wash"] },
      ];
    case "rain":
      return [
        { role: "ambience", sourceType: "weather-bed", material: "water", motion: "continuous", spectralRole: "broadband bed", bannedCues: ["static hiss"] },
        { role: "detail", sourceType: "drop-variation", material: "water", motion: "repeated", spectralRole: "high droplet detail", bannedCues: ["same-pitch ticks"] },
      ];
    case "wind":
      return [
        { role: "ambience", sourceType: "moving-air-bed", material: null, motion: "continuous", spectralRole: "airy broadband", bannedCues: ["tonal drone"] },
        { role: "detail", sourceType: "gust-motion", material: null, motion: "swell", spectralRole: "edge turbulence", bannedCues: ["engine sweep"] },
      ];
    case "footsteps":
      return [
        { role: "cadence", sourceType: "footfall-series", material: analysis.materials[0] ?? "ground", motion: "repeated", spectralRole: "contact transients", bannedCues: ["identical thuds"] },
        { role: "detail", sourceType: "surface-texture", material: analysis.materials[0] ?? "ground", motion: "contact", spectralRole: "surface grit", bannedCues: ["explosion tail"] },
      ];
    case "door":
      return [
        { role: "attack", sourceType: "hinge-friction", material: "metal", motion: "creak", spectralRole: "mid squeal", bannedCues: ["random chirp"] },
        { role: "body", sourceType: "wood-strain", material: "wood", motion: "open", spectralRole: "low-mid groan", bannedCues: ["metallic beep"] },
      ];
    case "bone-break":
      return [
        { role: "attack", sourceType: "snap-front", material: "bone", motion: "impact", spectralRole: "high brittle transient", bannedCues: ["wood crack"] },
        { role: "body", sourceType: "fracture-chatter", material: "bone", motion: "break", spectralRole: "mid fracture detail", bannedCues: ["boomy blast"] },
        { role: "tail", sourceType: "body-runout", material: "bone", motion: "release", spectralRole: "short controlled tail", bannedCues: ["muddy rumble"] },
      ];
    case "creature":
      return [
        { role: "attack", sourceType: "roar-attack", material: null, motion: "roar", spectralRole: "mid-high rasp", bannedCues: ["ufo hum"] },
        { role: "body", sourceType: "chest-body", material: null, motion: "sustain", spectralRole: "low-mid body", bannedCues: ["robot beam"] },
        { role: "tail", sourceType: "breath-tail", material: null, motion: "release", spectralRole: "air release", bannedCues: ["drone"] },
      ];
    default:
      return [
        { role: "attack", sourceType: `${family}-front`, material: analysis.materials[0] ?? null, motion: analysis.action ?? "impact", spectralRole: "clear transient", bannedCues: ["ufo", "deep growl", "generic rumble"] },
        { role: "body", sourceType: `${family}-body`, material: analysis.materials[0] ?? null, motion: analysis.motion[0] ?? "body", spectralRole: "family body", bannedCues: ["ufo", "deep growl", "generic rumble"] },
      ];
  }
};

const composePlanningPrompt = ({
  analysis,
  exampleGuidance,
  referenceNote,
}: {
  analysis: SoundIntentAnalysis;
  exampleGuidance: ExampleGuidanceSummary;
  referenceNote: SoundReferenceNote | null;
}) => {
  const sections = [analysis.sourcePrompt.trim()];

  sections.push("planner mode: intent planning only; engine handles sound generation");
  sections.push("hard rules: do NOT generate sound | define behavior for engine execution | all output must be executable");
  if (analysis.primaryFamily) {
    sections.push(`family lock: ${analysis.primaryFamily}`);
  }
  sections.push(`human expectation: ${exampleGuidance.expectationTemplate}`);
  sections.push(`physical event: ${exampleGuidance.physicalTemplate}`);
  sections.push(`required event shape: ${exampleGuidance.eventShapeTemplate}`);
  sections.push(`family lock rule: ${exampleGuidance.familyLockRule}`);
  sections.push(`modifier rule: ${exampleGuidance.modifierRule}`);
  sections.push("engine handoff: make sound type, timing, structure, intensity, texture, decay, and layering explicit enough for execution");
  sections.push("continuation rule: preserve family identity and modify only the requested dimension");
  sections.push("failure prevention: avoid soft-pop drift, explosion drift, generic fallback, missing aftermath, and vague modifier language");
  if (analysis.materials.length > 0) {
    sections.push(`materials: ${analysis.materials.join(", ")}`);
  }
  if (analysis.environment.length > 0) {
    sections.push(`environment: ${analysis.environment.join(", ")}`);
  }
  if (analysis.motion.length > 0) {
    sections.push(`motion: ${analysis.motion.join(", ")}`);
  }
  if (analysis.styleWords.length > 0) {
    sections.push(`style: ${analysis.styleWords.join(", ")}`);
  }
  if (analysis.negativeConstraints.length > 0) {
    sections.push(`avoid: ${analysis.negativeConstraints.join(", ")}`);
  }
  sections.push(`timing template: ${exampleGuidance.timingTemplate}`);
  sections.push(`texture template: ${exampleGuidance.textureTemplate}`);
  if (referenceNote) {
    sections.push(`reference style: ${referenceNote.styleHints.join(", ") || referenceNote.sourceSummary}`);
    sections.push(`reference clues: ${referenceNote.behaviorClues.concat(referenceNote.textureHints).slice(0, 4).join(" | ")}`);
    if (referenceNote.negativeWarnings.length > 0) {
      sections.push(`reference avoid: ${referenceNote.negativeWarnings.slice(0, 3).join(" | ")}`);
    }
  }

  return sections.join(". ");
};

const composeEngineBehaviorPrompt = ({
  soundType,
  eventFamily,
  familyLock,
  triggerTiming,
  start,
  peak,
  aftermath,
  intensity,
  texture,
  layering,
  styleHint,
  referenceHint,
  durationHint,
  negatives,
}: {
  soundType: string;
  eventFamily: string;
  familyLock: string;
  triggerTiming: string;
  start: string;
  peak: string;
  aftermath: string;
  intensity: string;
  texture: string;
  layering: string;
  styleHint: string;
  referenceHint: string;
  durationHint: string;
  negatives: string;
}) =>
  [
    "engine behavior input",
    `event type ${soundType}`,
    `event family ${eventFamily}`,
    `trigger timing ${triggerTiming}`,
    `family lock ${familyLock}`,
    `event shape start ${start}`,
    `event shape peak ${peak}`,
    `event shape aftermath ${aftermath}`,
    `intensity ${intensity}`,
    `texture ${texture}`,
    `decay ${aftermath}`,
    `layering ${layering}`,
    "modifiers weight texture timing decay only",
    "modify existing behavior do not replace",
    "preserve identity",
    "no pop only no peak only no generic fallback",
    styleHint,
    referenceHint,
    durationHint,
    negatives,
  ]
    .filter((value) => value != null && value.trim().length > 0)
    .join(" ");

const composeCanonicalRoutingPrompt = ({
  analysis,
  referenceNote,
}: {
  analysis: SoundIntentAnalysis;
  referenceNote: SoundReferenceNote | null;
}) => {
  const negatives = analysis.negativeConstraints.length > 0 ? `avoid ${analysis.negativeConstraints.join(" ")}` : "";
  const durationHint = analysis.durationSeconds != null ? `${analysis.durationSeconds} seconds` : "";
  const styleHint = analysis.styleWords.slice(0, 2).join(" ");
  const referenceHint = referenceNote?.styleHints.slice(0, 2).join(" ") ?? "";

  switch (analysis.primaryFamily) {
    case "explosion":
      return composeEngineBehaviorPrompt({
        soundType: "explosion",
        eventFamily: "explosion",
        familyLock: "explosion only not bone break or punch",
        triggerTiming: analysis.timingFeel,
        start: "pressure front",
        peak: "blast body",
        aftermath: "debris tail and air collapse",
        intensity: analysis.intensity,
        texture: "dense pressure-led blast with debris decay",
        layering: "pressure-front / blast-body / debris-tail",
        styleHint,
        referenceHint,
        durationHint,
        negatives,
      });
    case "zipper":
      return composeEngineBehaviorPrompt({
        soundType: "zipper",
        eventFamily: "zipper",
        familyLock: "zipper only not ui chirp",
        triggerTiming: analysis.timingFeel,
        start: "slide start",
        peak: "tooth chatter",
        aftermath: "finish click",
        intensity: analysis.intensity,
        texture: "tight mechanical friction and stop detail",
        layering: "zip-start / tooth-chatter / finish-click",
        styleHint,
        referenceHint,
        durationHint,
        negatives,
      });
    case "punch":
      return composeEngineBehaviorPrompt({
        soundType: "punch impact",
        eventFamily: "punch",
        familyLock: "punch only not kick or explosion",
        triggerTiming: analysis.timingFeel,
        start: "drive in",
        peak: "contact smack",
        aftermath: "short body follow through",
        intensity: analysis.intensity,
        texture: "tight body-led contact with compact release",
        layering: "drive-in / contact / follow-through",
        styleHint,
        referenceHint,
        durationHint,
        negatives,
      });
    case "kick":
      return composeEngineBehaviorPrompt({
        soundType: "kick impact",
        eventFamily: "kick",
        familyLock: "kick only not punch or explosion",
        triggerTiming: analysis.timingFeel,
        start: "leg swing",
        peak: "shoe contact",
        aftermath: "body transfer settle",
        intensity: analysis.intensity,
        texture: "leg-led contact with shoe presence and short settle",
        layering: "leg-swing / shoe-contact / body-transfer",
        styleHint,
        referenceHint,
        durationHint,
        negatives,
      });
    case "sword":
      return composeEngineBehaviorPrompt({
        soundType: "sword slash",
        eventFamily: "sword",
        familyLock: "sword motion only not punch or vehicle sweep",
        triggerTiming: analysis.timingFeel,
        start: "blade pass onset",
        peak: "steel edge slice",
        aftermath: "clean release",
        intensity: analysis.intensity,
        texture: "blade-led air cut with steel edge detail",
        layering: "blade-pass / steel-edge / release",
        styleHint,
        referenceHint,
        durationHint,
        negatives,
      });
    case "thunder":
      return composeEngineBehaviorPrompt({
        soundType: "thunder strike",
        eventFamily: "thunder",
        familyLock: "thunder only not explosion or laser",
        triggerTiming: analysis.timingFeel,
        start: "flash crack",
        peak: "storm body",
        aftermath: "rolling tail",
        intensity: analysis.intensity,
        texture: "sharp electric crack into broad storm rollout",
        layering: "flash-crack / storm-body / rolling-tail",
        styleHint,
        referenceHint,
        durationHint,
        negatives,
      });
    case "rain":
      return composeEngineBehaviorPrompt({
        soundType: "rain",
        eventFamily: "rain",
        familyLock: "rain only not hiss bed or impact hit",
        triggerTiming: analysis.timingFeel,
        start: "weather bed onset",
        peak: "varied drop activity",
        aftermath: "soft release",
        intensity: analysis.intensity,
        texture: "broad weather bed with drop detail",
        layering: "weather-bed / drop-variation",
        styleHint,
        referenceHint,
        durationHint,
        negatives,
      });
    case "wind":
      return composeEngineBehaviorPrompt({
        soundType: "wind",
        eventFamily: "wind",
        familyLock: "wind only not whoosh motion or vehicle sweep",
        triggerTiming: analysis.timingFeel,
        start: "moving air onset",
        peak: "gust motion",
        aftermath: "airy turbulence fade",
        intensity: analysis.intensity,
        texture: "environmental air bed with gust edge detail",
        layering: "moving-air-bed / gust-motion",
        styleHint,
        referenceHint,
        durationHint,
        negatives,
      });
    case "footsteps":
      return composeEngineBehaviorPrompt({
        soundType: "footsteps",
        eventFamily: "footsteps",
        familyLock: "footsteps only not generic thump or explosion",
        triggerTiming: analysis.timingFeel,
        start: "weight transfer",
        peak: "surface contact",
        aftermath: "cadence release",
        intensity: analysis.intensity,
        texture: "surface-led contacts with readable cadence",
        layering: "footfall-series / surface-texture",
        styleHint,
        referenceHint,
        durationHint,
        negatives,
      });
    case "bone-break":
      return composeEngineBehaviorPrompt({
        soundType: "bone break",
        eventFamily: "bone break",
        familyLock: "bone break only not explosion or wood crack",
        triggerTiming: analysis.timingFeel,
        start: "brittle tension and snap front",
        peak: "fracture chatter",
        aftermath: "body runout",
        intensity: analysis.intensity,
        texture: "dry anatomical fracture detail with controlled settle",
        layering: "snap-front / fracture-chatter / body-runout",
        styleHint,
        referenceHint,
        durationHint,
        negatives,
      });
    case "door":
      return composeEngineBehaviorPrompt({
        soundType: "door creak",
        eventFamily: "door",
        familyLock: "door only not whoosh or ui chirp",
        triggerTiming: analysis.timingFeel,
        start: "hinge strain",
        peak: "movement body",
        aftermath: "settle",
        intensity: analysis.intensity,
        texture: "mechanical hinge friction and wood movement",
        layering: "hinge-friction / wood-strain",
        styleHint,
        referenceHint,
        durationHint,
        negatives,
      });
    case "water":
      return composeEngineBehaviorPrompt({
        soundType: "water splash",
        eventFamily: "water",
        familyLock: "water only not debris impact",
        triggerTiming: analysis.timingFeel,
        start: "wet slap onset",
        peak: "splash body",
        aftermath: "spray tail",
        intensity: analysis.intensity,
        texture: "wet body with splash spread and short spray decay",
        layering: "wet-slap / splash-body / spray-tail",
        styleHint,
        referenceHint,
        durationHint,
        negatives,
      });
    case "creature":
      return composeEngineBehaviorPrompt({
        soundType: "creature roar",
        eventFamily: "creature",
        familyLock: "creature only not robot beam or explosion",
        triggerTiming: analysis.timingFeel,
        start: "organic attack",
        peak: "chest body",
        aftermath: "breath tail",
        intensity: analysis.intensity,
        texture: "organic chest-led body with breath release",
        layering: "roar-attack / chest-body / breath-tail",
        styleHint,
        referenceHint,
        durationHint,
        negatives,
      });
    case "volcano":
      return composeEngineBehaviorPrompt({
        soundType: "volcano eruption",
        eventFamily: "volcano",
        familyLock: "volcano only not explosion shortcut",
        triggerTiming: analysis.timingFeel,
        start: "pressure vent",
        peak: "hot rock burst",
        aftermath: "ash rollout",
        intensity: analysis.intensity,
        texture: "pressure-led eruption with heavy rock and ash decay",
        layering: "pressure-vent / rock-burst / ash-rollout",
        styleHint,
        referenceHint,
        durationHint,
        negatives,
      });
    default:
      return composePlanningPrompt({
        analysis,
        exampleGuidance: {
          matchedExampleIds: [],
          goodBehaviors: [],
          badBehaviors: [],
          expectationTemplate: getExpectationTemplateForFamily(analysis.primaryFamily),
          physicalTemplate: getPhysicalTemplateForFamily(analysis.primaryFamily),
          eventShapeTemplate: getEventShapeTemplateForFamily(analysis.primaryFamily),
          timingTemplate: "attack / body / tail",
          textureTemplate: "clear family-specific texture",
          familyLockRule: getFamilyLockRuleForFamily(analysis.primaryFamily),
          modifierRule: DEFAULT_MODIFIER_RULE,
          variantHints: [],
          antiDriftRules: [],
          exampleCoverageScore: 0,
        },
        referenceNote,
      });
  }
};

const buildSoundResponse = ({
  optionSet,
  targetFrameNumber = null,
}: {
  optionSet: CanonicalSoundOptionSet;
  targetFrameNumber?: number | null;
}) => {
  const bestFitOption =
    optionSet.soundOptions[Math.max(0, Math.min(optionSet.soundOptions.length - 1, optionSet.recommendedIndex - 1))] ??
    optionSet.soundOptions[0] ??
    null;
  const baseCommand = bestFitOption?.description ?? "";
  if (targetFrameNumber == null) {
    return baseCommand;
  }
  return `${baseCommand} attach=frame ${targetFrameNumber};`.trim();
};

const withPlanMetadata = ({
  optionSet,
  soundPlan,
  validationStatus,
}: {
  optionSet: CanonicalSoundOptionSet;
  soundPlan: SoundPlan;
  validationStatus: SoundValidationReport["adjustedOnce"] extends true ? never : DrawingAiSoundOption["validationStatus"];
}) => ({
  ...optionSet,
  soundOptions: optionSet.soundOptions.map((option) => ({
    ...option,
    planId: soundPlan.planId,
    planSummary: soundPlan.intentSummary,
    previewSignature: soundPlan.previewSignature,
    validationStatus,
    referenceUsed: soundPlan.referenceUsed,
    referenceSummary: soundPlan.referenceSummary,
  })),
});

const summarizeIntent = (analysis: SoundIntentAnalysis, exampleGuidance: ExampleGuidanceSummary, referenceNote: SoundReferenceNote | null) =>
  [
    analysis.primaryFamily ? `${analysis.primaryFamily} family` : "generic family",
    `expectation: ${exampleGuidance.expectationTemplate}`,
    `physics: ${exampleGuidance.physicalTemplate}`,
    `shape: ${exampleGuidance.eventShapeTemplate}`,
    `modifiers: ${exampleGuidance.modifierRule}`,
    `family lock: ${exampleGuidance.familyLockRule}`,
    analysis.materials.length > 0 ? `materials: ${analysis.materials.join(", ")}` : null,
    analysis.motion.length > 0 ? `motion: ${analysis.motion.join(", ")}` : null,
    exampleGuidance.textureTemplate,
    referenceNote?.sourceSummary ? `reference: ${referenceNote.sourceSummary}` : null,
  ]
    .filter((value): value is string => Boolean(value))
    .join(" | ");

const buildSoundPlan = ({
  optionSet,
  analysis,
  exampleGuidance,
  referenceNote,
}: {
  optionSet: CanonicalSoundOptionSet;
  analysis: SoundIntentAnalysis;
  exampleGuidance: ExampleGuidanceSummary;
  referenceNote: SoundReferenceNote | null;
}): SoundPlan => {
  const recommendedOption =
    optionSet.soundOptions[Math.max(0, Math.min(optionSet.soundOptions.length - 1, optionSet.recommendedIndex - 1))] ??
    optionSet.soundOptions[0] ??
    null;
  const soundProfile = recommendedOption?.soundProfile ?? null;
  const previewSignature = [
    optionSet.family,
    soundProfile ?? "unknown",
    analysis.negativeConstraints.join("|"),
    referenceNote?.sourceSummary ?? "",
  ].join("::");

  return {
    planId: `sound-plan-${slugify(`${analysis.sourcePrompt}-${optionSet.family}-${soundProfile ?? "base"}`) || "generated"}`,
    soundFamily: optionSet.family,
    soundProfile,
    intentSummary: summarizeIntent(analysis, exampleGuidance, referenceNote),
    timingStructure: exampleGuidance.timingTemplate,
    textureProfile: referenceNote?.textureHints[0] ?? exampleGuidance.textureTemplate,
    layers: buildLayerPlan(optionSet.family, analysis),
    negativeConstraints: analysis.negativeConstraints,
    styleModifiers: unique([...(analysis.styleWords ?? []), ...(referenceNote?.styleHints ?? [])]).slice(0, 4),
    validationTargets: unique([
      `family:${analysis.primaryFamily ?? "generic"}`,
      ...analysis.materials.map((material) => `material:${material}`),
      ...analysis.negativeConstraints.map((constraint) => `avoid:${constraint}`),
    ]).slice(0, 8),
    previewSignature,
    referenceUsed: referenceNote?.lookupUsed === true,
    referenceSummary: referenceNote?.sourceSummary ?? null,
    fallbackUsed: optionSet.fallbackUsed,
    fallbackReason: optionSet.fallbackReason,
    recommendedReason: optionSet.recommendedReason,
  };
};

const buildValidationReport = ({
  analysis,
  exampleGuidance,
  optionSet,
  adjustedOnce,
}: {
  analysis: SoundIntentAnalysis;
  exampleGuidance: ExampleGuidanceSummary;
  optionSet: CanonicalSoundOptionSet;
  adjustedOnce: boolean;
}): SoundValidationReport => {
  const recommendedOption =
    optionSet.soundOptions[Math.max(0, Math.min(optionSet.soundOptions.length - 1, optionSet.recommendedIndex - 1))] ??
    optionSet.soundOptions[0] ??
    null;
  const recipeSummary = recommendedOption ? inspectSoundOptionRecipe(recommendedOption) : null;
  const familyDrift =
    analysis.primaryFamily != null &&
    recommendedOption?.soundFamily != null &&
    analysis.primaryFamily !== recommendedOption.soundFamily &&
    !analysis.secondaryFamilies.includes(recommendedOption.soundFamily);
  const constraintViolations = analysis.negativeConstraints.filter((constraint) =>
    `${recommendedOption?.title ?? ""} ${recommendedOption?.description ?? ""} ${recommendedOption?.soundProfile ?? ""} ${
      recipeSummary?.signature ?? ""
    }`
      .toLowerCase()
      .includes(constraint.toLowerCase()),
  );
  const tooGeneric =
    recommendedOption == null ||
    recommendedOption.soundFamily == null ||
    recommendedOption.soundProfile == null ||
    recipeSummary?.kind === "generic" ||
    recipeSummary?.usesBannedSharedLowGrowlDefault === true;
  const tooDistorted =
    analysis.negativeConstraints.includes("distorted") &&
    /distort|crunch|harsh|noise/i.test(`${recommendedOption?.description ?? ""} ${recipeSummary?.signature ?? ""}`);
  const exampleAlignmentScore = Math.max(
    0,
    Math.min(
      1,
      exampleGuidance.exampleCoverageScore +
        (recommendedOption?.description?.toLowerCase().includes("layer") ? 0.06 : 0) +
        (recommendedOption?.timingFeel === analysis.timingFeel ? 0.08 : 0),
    ),
  );
  const requestMatchScore = Math.max(
    0,
    Math.min(
      1,
      (familyDrift ? 0.16 : 0.56) +
        (tooGeneric ? 0 : 0.16) +
        (constraintViolations.length === 0 ? 0.14 : 0) +
        (analysis.materials.length === 0 || analysis.materials.some((material) => (recommendedOption?.description ?? "").toLowerCase().includes(material)) ? 0.08 : 0),
    ),
  );

  return {
    requestMatchScore,
    exampleAlignmentScore,
    constraintViolations,
    tooGeneric,
    tooDistorted,
    familyDrift,
    adjustedOnce,
  };
};

const needsClarification = (analysis: SoundIntentAnalysis, confidence: PlanningConfidenceCheck) =>
  analysis.primaryFamily == null && confidence.familyConfidence < 0.5 && confidence.exampleCoverageScore < 0.35;

const buildClarificationResponse = (
  analysis: SoundIntentAnalysis,
  exampleGuidance: ExampleGuidanceSummary,
  confidence: PlanningConfidenceCheck,
): OrchestratedGenerateSoundResult => ({
  decision: "question",
  response: "",
  question: DEFAULT_SOUND_QUESTION,
  questionOptions: DEFAULT_SOUND_QUESTION_OPTIONS,
  soundOptions: null,
  warnings: [
    `Generate Sounds v2 held the result for clarification because family confidence was ${confidence.familyConfidence.toFixed(2)} and no safe category lock was available.`,
  ],
  analysis,
  exampleGuidance,
  confidence,
  referenceNote: null,
  soundPlan: null,
  validation: null,
  referenceLookupQuery: null,
  fallbackUsed: false,
});

const buildAdjustedPlanningPrompt = ({
  analysis,
  exampleGuidance,
  referenceNote,
}: {
  analysis: SoundIntentAnalysis;
  exampleGuidance: ExampleGuidanceSummary;
  referenceNote: SoundReferenceNote | null;
}) =>
  [
    analysis.primaryFamily ? `${analysis.primaryFamily} behavior plan` : "behavior plan",
    analysis.sourcePrompt.trim(),
    analysis.primaryFamily ? `must stay in the ${analysis.primaryFamily} family` : null,
    `viewer expectation: ${exampleGuidance.expectationTemplate}`,
    `physical build: ${exampleGuidance.physicalTemplate}`,
    `required event shape: ${exampleGuidance.eventShapeTemplate}`,
    `family lock: ${exampleGuidance.familyLockRule}`,
    `modifier rule: ${exampleGuidance.modifierRule}`,
    `timing template: ${exampleGuidance.timingTemplate}`,
    `texture template: ${exampleGuidance.textureTemplate}`,
    "engine handoff: define sound type, timing, structure, intensity, texture, decay, and layering clearly",
    analysis.negativeConstraints.length > 0 ? `avoid ${analysis.negativeConstraints.join(", ")}` : null,
    referenceNote?.negativeWarnings.length ? `avoid ${referenceNote.negativeWarnings.slice(0, 2).join(", ")}` : null,
    "avoid cross-family drift, soft-pop drift, missing aftermath, and vague modifier language.",
  ]
    .filter((value): value is string => Boolean(value && value.trim().length > 0))
    .join(". ");

export const orchestrateGenerateSound = ({
  userPrompt,
  examples,
  workspaceContext = null,
  recentSoundOptions = null,
  requestedOptionCount,
  referenceSearchResults = [],
  targetFrameNumber = null,
}: {
  userPrompt: string;
  examples: GenerateSoundExample[];
  workspaceContext?: DrawingAiWorkspaceContext | null;
  recentSoundOptions?: DrawingAiSoundOption[] | null;
  requestedOptionCount: number;
  referenceSearchResults?: SoundReferenceSearchResult[];
  targetFrameNumber?: number | null;
}): OrchestratedGenerateSoundResult => {
  const analysis = analyzeSoundIntent({
    userPrompt,
    recentSoundOptions,
    workspaceContext,
  });
  const exampleGuidance = buildExampleGuidanceSummary({
    analysis,
    examples,
  });
  const confidence = buildPlanningConfidenceCheck({
    analysis,
    exampleGuidance,
  });

  if (needsClarification(analysis, confidence)) {
    return buildClarificationResponse(analysis, exampleGuidance, confidence);
  }

  const referenceLookupQuery = confidence.requiresReferenceLookup ? buildSoundReferenceLookupQuery(analysis) : null;
  const referenceNote =
    confidence.requiresReferenceLookup && confidence.lookupReason && referenceSearchResults.length > 0
      ? buildSoundReferenceNoteFromSearchResults({
          analysis,
          searchResults: referenceSearchResults,
          lookupReason: confidence.lookupReason,
        })
      : null;
  const initialPlanningPrompt = composeCanonicalRoutingPrompt({
    analysis,
    referenceNote,
  });
  let optionSet = buildCanonicalSoundOptionSet(initialPlanningPrompt, requestedOptionCount, workspaceContext);
  if (analysis.primaryFamily && optionSet.family !== analysis.primaryFamily) {
    optionSet = buildCanonicalSoundOptionSet(
      `${analysis.primaryFamily} behavior plan. ${initialPlanningPrompt}`,
      requestedOptionCount,
      workspaceContext,
    );
  }

  let validation = buildValidationReport({
    analysis,
    exampleGuidance,
    optionSet,
    adjustedOnce: false,
  });
  if (validation.familyDrift || validation.tooGeneric || validation.tooDistorted || validation.constraintViolations.length > 0) {
    optionSet = buildCanonicalSoundOptionSet(
      buildAdjustedPlanningPrompt({
        analysis,
        exampleGuidance,
        referenceNote,
      }),
      requestedOptionCount,
      workspaceContext,
    );
    if (analysis.primaryFamily && optionSet.family !== analysis.primaryFamily) {
      optionSet = buildCanonicalSoundOptionSet(
        `${analysis.primaryFamily} ${analysis.action ?? "sound"} effect. ${buildAdjustedPlanningPrompt({
          analysis,
          exampleGuidance,
          referenceNote,
        })}`,
        requestedOptionCount,
        workspaceContext,
      );
    }
    validation = buildValidationReport({
      analysis,
      exampleGuidance,
      optionSet,
      adjustedOnce: true,
    });
  }

  const soundPlan = buildSoundPlan({
    optionSet,
    analysis,
    exampleGuidance,
    referenceNote,
  });
  const validationStatus: DrawingAiSoundOption["validationStatus"] =
    validation.adjustedOnce ? "adjusted-once" : "valid";
  const optionSetWithMetadata = withPlanMetadata({
    optionSet,
    soundPlan,
    validationStatus,
  });

  return {
    decision: "result",
    response: buildSoundResponse({
      optionSet: optionSetWithMetadata,
      targetFrameNumber,
    }),
    question: null,
    questionOptions: null,
    soundOptions: optionSetWithMetadata.soundOptions,
    warnings: [
      `Generate Sounds v2 used deterministic ${optionSetWithMetadata.family} planning with ${examples.length} matched example${examples.length === 1 ? "" : "s"}.`,
      ...(referenceNote ? [`Generate Sounds v2 used one controlled reference lookup: ${referenceNote.lookupReason}`] : []),
      ...(validation.adjustedOnce ? ["Generate Sounds v2 performed one in-family validation adjustment before returning the result."] : []),
    ],
    analysis,
    exampleGuidance,
    confidence,
    referenceNote,
    soundPlan,
    validation,
    referenceLookupQuery,
    fallbackUsed: optionSetWithMetadata.fallbackUsed,
  };
};
