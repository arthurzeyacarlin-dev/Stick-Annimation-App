import type { DrawingAiSoundOption, DrawingAiWorkspaceContext } from "./drawingAiContract";
import {
  isSoundGenerationEnabled,
  SOUND_GENERATION_DISABLED_MESSAGE,
} from "./drawingSoundAvailability";

export const DRAWING_AI_SOUND_FAMILIES = [
  "bone-break",
  "cartoon-bounce",
  "ui-beep",
  "zipper",
  "creature",
  "thunder",
  "electricity",
  "volcano",
  "pebble-water",
  "water",
  "fire",
  "footsteps",
  "rain",
  "wind",
  "rustle",
  "debris",
  "branch-snap",
  "door",
  "door-sci-fi",
  "explosion",
  "punch",
  "kick",
  "sword",
  "whoosh",
  "impact",
  "laser",
  "energy",
  "magic",
  "vehicle-pass",
  "background-rumble",
  "room-tone",
  "portal",
  "generic",
] as const;

export type DrawingAiSoundFamily = (typeof DRAWING_AI_SOUND_FAMILIES)[number];
export type DrawingAiSoundProfile = string;

export type CanonicalSoundOptionSet = {
  family: DrawingAiSoundFamily;
  familyLabel: string;
  recommendedIndex: number;
  recommendedReason: string;
  fallbackUsed: boolean;
  fallbackReason: string | null;
  soundOptions: DrawingAiSoundOption[];
};

type CanonicalSoundOptionTemplate = {
  title: string;
  description: string;
  intensityFeel: string | null;
  soundProfile: DrawingAiSoundProfile;
  durationSeconds?: number | null;
};

const LEADING_GREETING_FILLER_PATTERN = /^\s*(?:hi|hello|hey|yo|sup)(?:\s+there)?(?:[!.,\s-]+|$)/i;
const NEGATIVE_SOUND_CONSTRAINT_PATTERNS = [
  { constraint: "alien", pattern: /\b(?:not|no|without|less|avoid)\b[^,.!?;]*\balien(?:\s+sounding)?\b/i },
  { constraint: "ufo", pattern: /\b(?:not|no|without|less|avoid)\b[^,.!?;]*\bufo\b/i },
  { constraint: "deep", pattern: /\b(?:not|no|without|less|avoid)\b[^,.!?;]*\bdeep(?:er)?\b/i },
  { constraint: "rumble", pattern: /\b(?:not|no|without|less|avoid)\b[^,.!?;]*\brumble\b/i },
  { constraint: "robotic", pattern: /\b(?:not|no|without|less|avoid)\b[^,.!?;]*\brobot(?:ic)?\b/i },
  { constraint: "robot", pattern: /\b(?:not|no|without|less|avoid)\b[^,.!?;]*\brobot\b/i },
  { constraint: "crunchy", pattern: /\b(?:not|no|without|less|avoid)\b[^,.!?;]*\bcrunchy\b/i },
  { constraint: "distorted", pattern: /\b(?:not|no|without|less|avoid)\b[^,.!?;]*\bdistort(?:ed|ion)?\b/i },
  { constraint: "harsh", pattern: /\b(?:not|no|without|less|avoid)\b[^,.!?;]*\bharsh\b/i },
  { constraint: "scary", pattern: /\b(?:not|no|without|less|avoid)\b[^,.!?;]*\b(?:scary|creepy|spooky)\b/i },
  { constraint: "whoosh", pattern: /\b(?:not|no|without|less|avoid)\b[^,.!?;]*\bwhoosh(?:y)?\b/i },
  { constraint: "beam", pattern: /\b(?:not|no|without|less|avoid)\b[^,.!?;]*\bbeam\b/i },
] as const;

const LOCKED_SOUND_FAMILY_PATTERNS: Array<{ family: DrawingAiSoundFamily; pattern: RegExp }> = [
  { family: "explosion", pattern: /\b(explosion|detonation|blast|shockwave)\b/i },
  { family: "zipper", pattern: /\b(zipper|zip|unzipping|zipping)\b/i },
  { family: "punch", pattern: /\b(punch|fist|knuckle|body hit|smack)\b/i },
  { family: "kick", pattern: /\b(kick|roundhouse|dropkick|boot hit|heel kick|knee strike)\b/i },
  { family: "rain", pattern: /\b(rain(?:y)?|raindrops?|drizzle|downpour|rainfall)\b/i },
  { family: "wind", pattern: /\b(wind|gust|breeze|windy)\b/i },
  { family: "footsteps", pattern: /\b(footsteps?|walking|walks?|step|steps|stomp|stomping)\b/i },
  { family: "thunder", pattern: /\b(lightning|thunderstrike|thunder strike|thunderclap|thunder crack)\b/i },
  { family: "volcano", pattern: /\b(volcano|eruption|lava burst|magma burst)\b/i },
  { family: "door", pattern: /\b(door|hallway)\b[\s\S]*\b(creak|open|opening|groan)\b/i },
  { family: "sword", pattern: /\b(sword|blade|katana|saber)\b[\s\S]*\b(slash|slice|swing|cut)\b/i },
  { family: "water", pattern: /\b(water|splash|plunge|wet hit|wave crash)\b/i },
  { family: "laser", pattern: /\b(laser|blaster|plasma|energy shot|energy blast)\b/i },
  { family: "fire", pattern: /\b(fire|flame|ignite|ignition|flare|fireball)\b/i },
  { family: "creature", pattern: /\b(t-?rex|dinosaur|creature|monster|beast|dragon|roar|growl)\b/i },
];

const NON_GENERIC_CANONICAL_FAMILIES = new Set<DrawingAiSoundFamily>(
  DRAWING_AI_SOUND_FAMILIES.filter((family) => family !== "generic" && family !== "background-rumble"),
);

const BANNED_SHARED_FALLBACK_PATTERN =
  /\b(?:ufo|alien(?:\s+hum)?|deep(?:[-\s]+growl)?|growl(?:ing)?\s+hum|shared low(?:-| )frequency|generic hum|hover(?:ing)? drone)\b/i;

const DURATION_WORD_TO_SECONDS: Record<string, number> = {
  half: 0.5,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
};

const parseDurationNumberToken = (token: string | undefined) => {
  if (!token) {
    return null;
  }

  const normalized = token.trim().toLowerCase();
  if (normalized.length === 0) {
    return null;
  }

  if (normalized in DURATION_WORD_TO_SECONDS) {
    return DURATION_WORD_TO_SECONDS[normalized];
  }

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

export const stripLeadingSoundGreetingFiller = (prompt: string) => {
  const stripped = prompt.replace(LEADING_GREETING_FILLER_PATTERN, "").trim();
  return stripped.length > 0 ? stripped : prompt.trim();
};

const extractCanonicalNegativeConstraints = (normalizedPrompt: string) => {
  const constraints = NEGATIVE_SOUND_CONSTRAINT_PATTERNS.flatMap(({ constraint, pattern }) =>
    pattern.test(normalizedPrompt) ? [constraint] : [],
  );

  return constraints.length > 0 ? Array.from(new Set(constraints)) : null;
};

const hasNegativeConstraint = (negativeConstraints: string[] | null, constraint: string) =>
  negativeConstraints?.includes(constraint) ?? false;

const inferLockedSoundFamily = (normalizedPrompt: string) =>
  LOCKED_SOUND_FAMILY_PATTERNS.find(({ pattern }) => pattern.test(normalizedPrompt))?.family ?? null;

const LOCKED_FAMILY_RESCUE_TEMPLATES: Partial<Record<DrawingAiSoundFamily, CanonicalSoundOptionTemplate[]>> = {
  explosion: [
    {
      title: "Locked Heavy Blast",
      description: "Explosion-first fallback with a clear blast body, controlled pressure front, and a grounded tail instead of any hovering hum.",
      intensityFeel: "Best when the prompt clearly asked for an explosion and the planner should not drift.",
      soundProfile: "heavy-clean-blast",
    },
    {
      title: "Locked Staged Detonation",
      description: "Two-stage explosion fallback with a short pre-boom and a bigger detonation payoff.",
      intensityFeel: "Use when the explosion should feel more staged over time.",
      soundProfile: "staged-preboom-detonation",
    },
    {
      title: "Locked Tight Blast",
      description: "Compact explosion fallback with a faster pop, readable body, and short tail.",
      intensityFeel: "Best when the detonation should stay quick and readable.",
      soundProfile: "tight-anime-pop",
    },
  ],
  zipper: [
    {
      title: "Locked Metal Tooth Zip",
      description: "Zipper-first fallback with clear tooth chatter, a tight mechanical scrape body, and a crisp finish click instead of a generic UI chirp.",
      intensityFeel: "Best when the prompt clearly asked for a zipper slide and the planner should not drift.",
      soundProfile: "metal-tooth-zip",
    },
    {
      title: "Locked Slow Jacket Unzip",
      description: "Controlled zipper fallback with uneven tooth friction, a slower slide, and a softer mechanical stop.",
      intensityFeel: "Use when the zipper motion should feel slower or more careful.",
      soundProfile: "slow-jacket-unzip",
    },
    {
      title: "Locked Close Detail Zip",
      description: "Close-detail zipper fallback with restrained scrape noise and a small finish click instead of a hissy burst.",
      intensityFeel: "Best when the zipper should stay clean and near-camera.",
      soundProfile: "close-detail-zip-click",
    },
  ],
  punch: [
    {
      title: "Locked Punch Hit",
      description: "Punch-first fallback with a clear contact snap, body thump, and readable smack.",
      intensityFeel: "Best when the request clearly wants a punch hit.",
      soundProfile: "tight-body-hit",
    },
    {
      title: "Locked Heavy Punch",
      description: "Heavier punch fallback with a denser chest hit and stronger follow-through.",
      intensityFeel: "Use when the punch should feel harder and more physical.",
      soundProfile: "heavy-thump-smack",
    },
    {
      title: "Locked Snap Punch",
      description: "Sharper punch fallback with tighter contact and quicker cutoff.",
      intensityFeel: "Best when the punch should stay fast and precise.",
      soundProfile: "snap-contact-hit",
    },
  ],
  rain: [
    {
      title: "Locked Rain Bed",
      description: "Rain-first fallback with varied drops and a readable weather bed instead of flat hiss.",
      intensityFeel: "Best when the prompt clearly wants rain.",
      soundProfile: "light-rain-bed",
    },
    {
      title: "Locked Storm Rain",
      description: "Heavier rain fallback with a denser storm sheet and weather motion.",
      intensityFeel: "Use when the rain should feel fuller and stormier.",
      soundProfile: "storm-rain-sheet",
    },
    {
      title: "Locked Window Rain",
      description: "Controlled rain fallback with tighter pane-like ticks and less broad wash.",
      intensityFeel: "Best when the rain should stay tighter and more patterned.",
      soundProfile: "window-rain-texture",
    },
  ],
  wind: [
    {
      title: "Locked Air Bed",
      description: "Wind-first fallback with layered moving air and no shared low hum bed.",
      intensityFeel: "Best when the prompt clearly wants wind.",
      soundProfile: "soft-back-wind",
    },
    {
      title: "Locked Gust Pass",
      description: "Shaped gust fallback with a readable front edge and mid-air motion.",
      intensityFeel: "Use when the wind should move more clearly.",
      soundProfile: "sharper-gust-pass",
    },
    {
      title: "Locked Mood Wind",
      description: "Broader wind fallback with outdoor body and controlled weather weight.",
      intensityFeel: "Best when the scene needs more atmospheric air.",
      soundProfile: "moodier-low-wind",
    },
  ],
  footsteps: [
    {
      title: "Locked Footstep",
      description: "Footstep-first fallback with heel or sole contact and a short readable follow-through.",
      intensityFeel: "Best when the prompt clearly wants steps instead of a vague thump.",
      soundProfile: "neutral-shoe-step",
    },
    {
      title: "Locked Hard Step",
      description: "Firmer footstep fallback with clearer heel contact and a denser body.",
      intensityFeel: "Use when the step should feel more assertive.",
      soundProfile: "hard-sole-step",
    },
    {
      title: "Locked Quiet Step",
      description: "Softer footstep fallback with gentler contact and a tucked-in release.",
      intensityFeel: "Best when the steps should stay subtle.",
      soundProfile: "soft-quiet-step",
    },
  ],
  creature: [
    {
      title: "Locked Creature Chase",
      description: "Creature-first fallback with roar texture, breath, and ground-hit pursuit layers instead of a deep humming bed.",
      intensityFeel: "Best when the prompt clearly points to a creature action sound.",
      soundProfile: "giant-chase-stomp",
    },
    {
      title: "Locked Predator Roar",
      description: "Predator-focused fallback with textured roar, rasp, and controlled body weight.",
      intensityFeel: "Use when the roar should read more than the footsteps.",
      soundProfile: "predator-roar-break",
    },
    {
      title: "Locked Ground Pursuit",
      description: "Ground-led creature fallback with heavier stomps and shorter aggression bursts.",
      intensityFeel: "Best when the creature should feel massive and in motion.",
      soundProfile: "ground-pound-pursuit",
    },
  ],
};

const createLockedFamilyRescueOptionSet = ({
  lockedFamily,
  optionCount,
  timingFeel,
  requestedDurationSeconds,
  negativeConstraints,
}: {
  lockedFamily: DrawingAiSoundFamily;
  optionCount: number;
  timingFeel: string;
  requestedDurationSeconds: number | null;
  negativeConstraints: string[] | null;
}): CanonicalSoundOptionSet | null => {
  const rescueOptions = LOCKED_FAMILY_RESCUE_TEMPLATES[lockedFamily];
  if (!rescueOptions || rescueOptions.length === 0) {
    return null;
  }

  return createOptionSet({
    family: lockedFamily,
    familyLabel: `${lockedFamily.replace(/-/g, " ")} (locked)`,
    prefix: `safe-locked-${lockedFamily}`,
    optionCount,
    recommendedIndex: 1,
    recommendedReason: `the prompt strongly locks this request to the ${lockedFamily.replace(/-/g, " ")} family, so the planner should not downgrade it to a generic fallback.`,
    fallbackUsed: false,
    fallbackReason: null,
    timingFeel,
    durationSeconds: requestedDurationSeconds,
    negativeConstraints,
    options: rescueOptions,
  });
};

const sanitizeCanonicalTemplates = ({
  family,
  optionCount,
  options,
}: {
  family: DrawingAiSoundFamily;
  optionCount: number;
  options: CanonicalSoundOptionTemplate[];
}) => {
  const seenProfiles = new Set<string>();
  const safeOptions = options.filter((option) => {
    if (seenProfiles.has(option.soundProfile)) {
      return false;
    }
    seenProfiles.add(option.soundProfile);

    if (!NON_GENERIC_CANONICAL_FAMILIES.has(family)) {
      return true;
    }

    return !BANNED_SHARED_FALLBACK_PATTERN.test(
      `${option.title} ${option.description} ${option.soundProfile}`,
    );
  });

  return (safeOptions.length > 0 ? safeOptions : options).slice(0, optionCount);
};

export const inferCanonicalSoundTimingFeel = (
  userPrompt: string,
  workspaceContextValue?: DrawingAiWorkspaceContext | null,
) => {
  if (/\bdoor\b/i.test(userPrompt) && /\b(slow|slowly|creaking open|opening slowly)\b/i.test(userPrompt)) {
    return "across the slow door-open motion";
  }

  if (/\bon frame one\b|\bframe 1\b/i.test(userPrompt)) {
    return "on frame 1";
  }

  if (/\bon this frame\b|\bright here\b/i.test(userPrompt)) {
    return workspaceContextValue?.currentFrameIndex != null
      ? `on frame ${workspaceContextValue.currentFrameIndex + 1}`
      : "on this frame";
  }

  if (/\bwhen (?:he|she|it|they) lands\b|\bfoot lands\b|\blands\b/i.test(userPrompt)) {
    return "right on the landing beat";
  }

  if (/\block clicks?\b/i.test(userPrompt)) {
    return "right on the lock click";
  }

  if (/\bdoor opens?\b/i.test(userPrompt)) {
    return "right on the door-open beat";
  }

  if (/\bpunch|kick|hit|impact|bone|break(?:ing)?\b/i.test(userPrompt)) {
    return "on impact";
  }

  if (/\b(footsteps?|walking|walks?|step|steps)\b/i.test(userPrompt)) {
    return "on each footfall";
  }

  if (/\b(water|splash|plunge|wet hit|wave)\b/i.test(userPrompt)) {
    return "right on the splash beat";
  }

  if (/\b(laser|beam|blast|shot)\b/i.test(userPrompt)) {
    return "right on the firing beat";
  }

  if (/\b(magic|spell|arcane|rune)\b/i.test(userPrompt)) {
    return "right on the release beat";
  }

  if (/\b(sword|blade|slash|slice)\b/i.test(userPrompt)) {
    return "just before the blade passes through";
  }

  if (/\b(whoosh|swish|swoosh|air swipe)\b/i.test(userPrompt)) {
    return "through the motion arc";
  }

  return "on the key animation beat";
};

const normalizeBehaviorVocabulary = (value: string) =>
  value
    .replace(/\bpowerful\b/gi, "high-force")
    .replace(/\bstronger\b/gi, "higher-force")
    .replace(/\bstrong\b/gi, "high-force")
    .replace(/\bheavy\b/gi, "high-weight")
    .replace(/\bheavier\b/gi, "higher-weight")
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
    .replace(/\bwashed-out\b/gi, "diffuse");

const cleanEngineDirectiveText = (value: string) =>
  normalizeBehaviorVocabulary(value)
    .trim()
    .replace(/\.$/, "")
    .replace(/\s+/g, " ");

const lowercaseLeadingCharacter = (value: string) => value.replace(/^[A-Z]/, (match) => match.toLowerCase());

const convertBehaviorTextToEngineDirective = (value: string) =>
  lowercaseLeadingCharacter(cleanEngineDirectiveText(value))
    .replace(/^(?:a|an|the)\s+/i, "")
    .replace(/\b(sound|audio)\b/gi, "event")
    .replace(/\bwith\b/gi, " -> ")
    .replace(/,\s*(?:and\s+)?/g, " -> ")
    .replace(/\s+and\s+/g, " -> ")
    .replace(/\s+into\s+/gi, " -> ")
    .replace(/\s+then\s+/gi, " -> ")
    .replace(/\s+followed by\s+/gi, " -> ")
    .replace(/\s+instead of\s+/gi, " | avoid ")
    .replace(/\s+without\s+/gi, " | avoid ")
    .replace(/\s+while\s+/gi, " | keep ")
    .replace(/\s+that stays\s+/gi, " | keep ")
    .replace(/\s+that still\s+/gi, " | keep ")
    .replace(/\s+so the\b/gi, " | result ")
    .replace(/\s+so it\b/gi, " | result ")
    .replace(/\s{2,}/g, " ");

type EngineFamilyBlueprint = {
  eventType: string;
  start: string;
  peak: string;
  aftermath: string;
  texture: string;
  layering: string;
  familyLock: string;
  defaultIntensity: "soft" | "medium" | "heavy";
  defaultDecay: "short" | "medium" | "long";
};

const getEngineFamilyBlueprint = (family: DrawingAiSoundFamily, familyLabel: string): EngineFamilyBlueprint => {
  switch (family) {
    case "bone-break":
      return { eventType: "bone break", start: "tension cue", peak: "fracture crack", aftermath: "body settle", texture: "dry anatomical fracture detail", layering: "tension-cue -> fracture-crack -> body-settle", familyLock: "preserve bone break | reject explosion | wood snap | generic impact", defaultIntensity: "medium", defaultDecay: "short" };
    case "cartoon-bounce":
      return { eventType: "cartoon bounce", start: "squash setup", peak: "bounce contact", aftermath: "spring release", texture: "rounded elastic body", layering: "squash-setup -> bounce-contact -> spring-release", familyLock: "preserve cartoon bounce | reject explosion | punch | realistic thud", defaultIntensity: "medium", defaultDecay: "short" };
    case "ui-beep":
      return { eventType: "ui beep", start: "input cue", peak: "confirm pulse", aftermath: "clean stop", texture: "clean electronic pulse", layering: "input-cue -> confirm-pulse -> clean-stop", familyLock: "preserve ui beep | reject impact | ambience | explosion", defaultIntensity: "soft", defaultDecay: "short" };
    case "zipper":
      return { eventType: "zipper", start: "slide start", peak: "tooth chatter", aftermath: "finish click", texture: "tight mechanical friction", layering: "slide-start -> tooth-chatter -> finish-click", familyLock: "preserve zipper | reject ui chirp | hiss burst", defaultIntensity: "medium", defaultDecay: "short" };
    case "creature":
      return { eventType: "creature event", start: "organic attack", peak: "chest body", aftermath: "breath release", texture: "organic chest-led texture", layering: "organic-attack -> chest-body -> breath-release", familyLock: "preserve creature family | reject robot beam | explosion", defaultIntensity: "heavy", defaultDecay: "medium" };
    case "thunder":
      return { eventType: "thunder strike", start: "flash crack", peak: "storm body", aftermath: "rolling tail", texture: "electric crack into storm body", layering: "flash-crack -> storm-body -> rolling-tail", familyLock: "preserve thunder | reject explosion | laser", defaultIntensity: "heavy", defaultDecay: "long" };
    case "electricity":
      return { eventType: "electric event", start: "charge onset", peak: "zap body", aftermath: "dissipate", texture: "bright electric texture", layering: "charge-onset -> zap-body -> dissipate", familyLock: "preserve electricity | reject laser | explosion", defaultIntensity: "medium", defaultDecay: "short" };
    case "volcano":
      return { eventType: "volcano eruption", start: "pressure vent", peak: "eruption body", aftermath: "ash rollout", texture: "pressure-led hot-rock texture", layering: "pressure-vent -> eruption-body -> ash-rollout", familyLock: "preserve volcano | reject shortcut explosion", defaultIntensity: "heavy", defaultDecay: "long" };
    case "pebble-water":
      return { eventType: "pebble water impact", start: "pebble contact", peak: "small splash", aftermath: "ripple decay", texture: "small wet contact", layering: "pebble-contact -> small-splash -> ripple-decay", familyLock: "preserve pebble-water | reject large splash | debris impact", defaultIntensity: "soft", defaultDecay: "short" };
    case "water":
      return { eventType: "water splash", start: "wet onset", peak: "splash body", aftermath: "spray tail", texture: "wet surface spread", layering: "wet-onset -> splash-body -> spray-tail", familyLock: "preserve water | reject debris impact", defaultIntensity: "medium", defaultDecay: "medium" };
    case "fire":
      return { eventType: "fire event", start: "ignition onset", peak: "flame bloom", aftermath: "burn decay", texture: "flame-led texture", layering: "ignition-onset -> flame-bloom -> burn-decay", familyLock: "preserve fire | reject explosion | laser", defaultIntensity: "medium", defaultDecay: "medium" };
    case "footsteps":
      return { eventType: "footsteps", start: "weight transfer", peak: "surface contact", aftermath: "release", texture: "surface-led contact texture", layering: "weight-transfer -> surface-contact -> release", familyLock: "preserve footsteps | reject generic thump | explosion", defaultIntensity: "medium", defaultDecay: "short" };
    case "rain":
      return { eventType: "rain", start: "weather entry", peak: "drop field", aftermath: "soft release", texture: "weather bed with drop detail", layering: "weather-entry -> drop-field -> soft-release", familyLock: "preserve rain | reject hiss bed | impact hit", defaultIntensity: "soft", defaultDecay: "long" };
    case "wind":
      return { eventType: "wind", start: "air onset", peak: "gust body", aftermath: "air fade", texture: "environmental air movement", layering: "air-onset -> gust-body -> air-fade", familyLock: "preserve wind | reject whoosh | vehicle pass", defaultIntensity: "soft", defaultDecay: "medium" };
    case "rustle":
      return { eventType: "rustle", start: "material onset", peak: "movement body", aftermath: "settle", texture: "light material texture", layering: "material-onset -> movement-body -> settle", familyLock: "preserve rustle | reject explosion | punch", defaultIntensity: "soft", defaultDecay: "short" };
    case "debris":
      return { eventType: "debris event", start: "scatter onset", peak: "impact cluster", aftermath: "settle", texture: "scattered material detail", layering: "scatter-onset -> impact-cluster -> settle", familyLock: "preserve debris | reject explosion shortcut", defaultIntensity: "medium", defaultDecay: "medium" };
    case "branch-snap":
      return { eventType: "branch snap", start: "bend tension", peak: "snap", aftermath: "fiber settle", texture: "woody fiber texture", layering: "bend-tension -> snap -> fiber-settle", familyLock: "preserve branch snap | reject bone break | explosion", defaultIntensity: "medium", defaultDecay: "short" };
    case "door":
      return { eventType: "door", start: "hinge or latch onset", peak: "movement body", aftermath: "settle", texture: "mechanical hinge and panel movement", layering: "hinge-onset -> movement-body -> settle", familyLock: "preserve door | reject whoosh | ui chirp", defaultIntensity: "medium", defaultDecay: "medium" };
    case "door-sci-fi":
      return { eventType: "sci-fi door", start: "unlock onset", peak: "panel slide", aftermath: "clean stop", texture: "controlled synthetic mechanical texture", layering: "unlock-onset -> panel-slide -> clean-stop", familyLock: "preserve sci-fi door | reject vehicle sweep | explosion", defaultIntensity: "medium", defaultDecay: "short" };
    case "explosion":
      return { eventType: "explosion", start: "pressure build", peak: "blast body", aftermath: "debris tail", texture: "pressure-led blast texture", layering: "pressure-build -> blast-body -> debris-tail", familyLock: "preserve explosion | reject bone break | punch | magical bloom", defaultIntensity: "heavy", defaultDecay: "medium" };
    case "punch":
      return { eventType: "punch impact", start: "drive-in", peak: "contact", aftermath: "short release", texture: "tight body-led contact", layering: "drive-in -> contact -> short-release", familyLock: "preserve punch | reject kick | explosion | sword", defaultIntensity: "medium", defaultDecay: "short" };
    case "kick":
      return { eventType: "kick impact", start: "swing", peak: "shoe contact", aftermath: "body transfer", texture: "leg-led contact texture", layering: "swing -> shoe-contact -> body-transfer", familyLock: "preserve kick | reject punch | explosion | sword", defaultIntensity: "heavy", defaultDecay: "short" };
    case "sword":
      return { eventType: "sword slash", start: "blade onset", peak: "slice", aftermath: "release", texture: "blade-led air cut", layering: "blade-onset -> slice -> release", familyLock: "preserve sword | reject punch | vehicle sweep", defaultIntensity: "medium", defaultDecay: "short" };
    case "whoosh":
      return { eventType: "whoosh", start: "motion onset", peak: "air pass", aftermath: "release", texture: "air-motion texture", layering: "motion-onset -> air-pass -> release", familyLock: "preserve whoosh | reject wind bed | impact", defaultIntensity: "medium", defaultDecay: "short" };
    case "impact":
      return { eventType: "impact", start: "approach", peak: "contact", aftermath: "settle", texture: "contact-led impact texture", layering: "approach -> contact -> settle", familyLock: "preserve impact | reject explosion | whoosh-only", defaultIntensity: "medium", defaultDecay: "short" };
    case "laser":
      return { eventType: "laser", start: "charge", peak: "fire pulse", aftermath: "dissipate", texture: "focused energy texture", layering: "charge -> fire-pulse -> dissipate", familyLock: "preserve laser | reject explosion | creature", defaultIntensity: "medium", defaultDecay: "short" };
    case "energy":
      return { eventType: "energy event", start: "charge", peak: "release", aftermath: "discharge", texture: "controlled energy texture", layering: "charge -> release -> discharge", familyLock: "preserve energy | reject explosion | creature", defaultIntensity: "medium", defaultDecay: "medium" };
    case "magic":
      return { eventType: "magic event", start: "charge", peak: "bloom", aftermath: "resolve", texture: "magical release texture", layering: "charge -> bloom -> resolve", familyLock: "preserve magic | reject explosion | ui pulse", defaultIntensity: "medium", defaultDecay: "medium" };
    case "vehicle-pass":
      return { eventType: "vehicle pass", start: "approach rise", peak: "pass peak", aftermath: "recede", texture: "engine-led pass-by texture", layering: "approach-rise -> pass-peak -> recede", familyLock: "preserve vehicle pass | reject whoosh | explosion", defaultIntensity: "medium", defaultDecay: "medium" };
    case "background-rumble":
      return { eventType: "background rumble", start: "bed onset", peak: "support body", aftermath: "fade", texture: "restrained support-bed texture", layering: "bed-onset -> support-body -> fade", familyLock: "preserve background rumble | reject foreground impact", defaultIntensity: "soft", defaultDecay: "long" };
    case "room-tone":
      return { eventType: "room tone", start: "bed onset", peak: "place detail", aftermath: "open space", texture: "place identity bed", layering: "bed-onset -> place-detail -> open-space", familyLock: "preserve room tone | reject impact | whoosh", defaultIntensity: "soft", defaultDecay: "long" };
    case "portal":
      return { eventType: "portal event", start: "warp onset", peak: "opening body", aftermath: "resolve", texture: "warp-led energy texture", layering: "warp-onset -> opening-body -> resolve", familyLock: "preserve portal | reject explosion | ui pulse", defaultIntensity: "medium", defaultDecay: "medium" };
    default:
      return { eventType: familyLabel, start: "setup", peak: "main event", aftermath: "resolve", texture: `${familyLabel} texture`, layering: "setup -> main-event -> resolve", familyLock: `preserve ${familyLabel} | reject generic family drift`, defaultIntensity: "medium", defaultDecay: "medium" };
  }
};

const extractPrimaryExecutionChain = (value: string) => convertBehaviorTextToEngineDirective(value).split("|")[0].trim();
const inferParamIntensity = (value: string, fallback: EngineFamilyBlueprint["defaultIntensity"]) => {
  const normalized = value.toLowerCase();
  if (/\b(heavy|heavier|hard|harder|big|bigger|strong|stronger|massive|brutal|bass)\b/.test(normalized)) {
    return "heavy";
  }
  if (/\b(soft|softer|lighter|light|subtle|quiet|gentle|small|airy)\b/.test(normalized)) {
    return "soft";
  }
  return fallback;
};
const inferParamAttack = (value: string) => {
  const normalized = value.toLowerCase();
  if (/\b(sharp|sharper|snap|snappy|crack|crackle|edge|attack|brittle)\b/.test(normalized)) {
    return "high";
  }
  if (/\b(soft|softer|rounded|muted|smooth)\b/.test(normalized)) {
    return "low";
  }
  return "medium";
};
const inferParamDecay = (value: string, fallback: EngineFamilyBlueprint["defaultDecay"]) => {
  const normalized = value.toLowerCase();
  if (/\b(short|shorter|quick|tight|compact|fast|snappy|restrained)\b/.test(normalized)) {
    return "short";
  }
  if (/\b(long|longer|linger|tail|roll|runout|extended|recede|release)\b/.test(normalized)) {
    return "long";
  }
  return fallback;
};
const inferParamTexture = (value: string, fallback: string) => {
  const normalized = value.toLowerCase();
  if (/\b(brittle|fracture|snap|splinter|crack|crackle)\b/.test(normalized)) {
    return "brittle-fracture";
  }
  if (/\b(mechanical|hinge|zip|tooth|click|latch)\b/.test(normalized)) {
    return "mechanical";
  }
  if (/\b(wet|water|splash|spray)\b/.test(normalized)) {
    return "wet-surface";
  }
  if (/\b(electric|zap|energy|laser|plasma)\b/.test(normalized)) {
    return "electric";
  }
  if (/\b(organic|creature|breath|roar)\b/.test(normalized)) {
    return "organic";
  }
  if (/\b(air|wind|gust|whoosh|swish)\b/.test(normalized)) {
    return "air-motion";
  }
  if (/\b(clean|controlled|restrained)\b/.test(normalized)) {
    return `controlled ${fallback}`;
  }
  return fallback;
};

const inferEnginePlanTitlePrefix = (value: string) => {
  const normalized = value.toLowerCase();

  if (/\b(clean|clear|controlled|restrained|tight|focused|pure)\b/.test(normalized)) {
    return "Controlled";
  }

  if (/\b(distant|far|background|receded|remote)\b/.test(normalized)) {
    return "Distant";
  }

  if (/\b(long|linger|decay|tail|rollout|runout|extended|sustain)\b/.test(normalized)) {
    return "Extended";
  }

  if (/\b(short|quick|compact|fast|snappy)\b/.test(normalized)) {
    return "Short";
  }

  if (/\b(heavy|heavier|strong|stronger|hard|harder|big|bigger|bass|low-end|weight|brutal)\b/.test(normalized)) {
    return "Heavy";
  }

  if (/\b(sharp|brittle|crack|crackle|snap|attack|edge)\b/.test(normalized)) {
    return "Sharp";
  }

  if (/\b(textur|grit|gritty|crunch|splinter|fracture|chatter|dirty)\b/.test(normalized)) {
    return "Textured";
  }

  if (/\b(light|soft|airy|subtle|thin)\b/.test(normalized)) {
    return "Light";
  }

  return "Base";
};

const formatEnginePlanTitle = ({
  familyLabel,
  title,
  description,
}: {
  familyLabel: string;
  title: string;
  description: string;
}) => `type=${familyLabel}; profile=${inferEnginePlanTitlePrefix(`${title} ${description}`).toLowerCase()};`;

const formatEngineTimingDirective = (value: string) => {
  const normalized = cleanEngineDirectiveText(value);
  return `trigger=${normalized.replace(/^trigger\s+/i, "").trim()};`;
};

const buildStrictEngineCommand = ({
  family,
  familyLabel,
  description,
  triggerTiming,
  intensityValue,
}: {
  family: DrawingAiSoundFamily;
  familyLabel: string;
  description: string;
  triggerTiming: string;
  intensityValue: string | null;
}) => {
  const blueprint = getEngineFamilyBlueprint(family, familyLabel);
  const source = cleanEngineDirectiveText([description, intensityValue ?? ""].filter(Boolean).join(" | "));
  const executionChain = extractPrimaryExecutionChain(description) || blueprint.layering;
  const trigger = cleanEngineDirectiveText(triggerTiming).replace(/^trigger\s+/i, "").trim();
  return [
    "define sound event ->",
    `type=${familyLabel};`,
    `trigger=${trigger};`,
    `timing=${blueprint.start} -> ${blueprint.peak} -> ${blueprint.aftermath};`,
    `attack=${inferParamAttack(source)};`,
    `intensity=${inferParamIntensity(source, blueprint.defaultIntensity)};`,
    `texture=${inferParamTexture(source, blueprint.texture)};`,
    `decay=${inferParamDecay(source, blueprint.defaultDecay)};`,
    `layers=${executionChain};`,
    `preserve=${familyLabel};`,
  ].join(" ");
};

const formatEngineDescriptionDirective = ({
  family,
  familyLabel,
  description,
  timingFeel,
}: {
  family: DrawingAiSoundFamily;
  familyLabel: string;
  description: string;
  timingFeel: string;
}) => {
  return buildStrictEngineCommand({
    family,
    familyLabel,
    description,
    triggerTiming: timingFeel,
    intensityValue: null,
  });
};

const formatEngineParameterDirective = ({
  familyLabel,
  description,
  value,
}: {
  familyLabel: string;
  description: string;
  value: string | null;
}) => {
  const source = cleanEngineDirectiveText([description, value ?? ""].filter(Boolean).join(" | "));
  const normalizedValue = (value ?? "")
    .replace(/^(?:Best|Use|Good)\s+(?:when|if|for)\s+/i, "apply when ")
    .replace(/^Best\b/i, "apply when")
    .replace(/^Use\b/i, "apply when")
    .replace(/^Good\b/i, "apply when")
    .replace(/\bshould feel\b/gi, "target")
    .replace(/\bshould stay\b/gi, "keep")
    .replace(/\bshould\b/gi, "")
    .replace(/\binstead of\b/gi, " | avoid ")
    .replace(/\bwithout\b/gi, " | avoid ")
    .replace(/,\s*(?:and\s+)?/g, " -> ")
    .replace(/\s+and\s+/g, " -> ")
    .replace(/\s{2,}/g, " ")
    .trim();

  const parts = [
    `attack=${inferParamAttack(source)};`,
    `preserve=${familyLabel};`,
    normalizedValue.length > 0 ? `modify=${normalizedValue};` : null,
  ].filter((part): part is string => Boolean(part));

  return parts.join(" ");
};

const formatEngineRecommendedReason = (family: DrawingAiSoundFamily, familyLabel: string, value: string) => {
  const blueprint = getEngineFamilyBlueprint(family, familyLabel);
  const normalized = cleanEngineDirectiveText(value)
    .replace(/^it keeps\b/i, "keep")
    .replace(/^it gives\b/i, "increase")
    .replace(/^it is\b/i, "keep")
    .replace(/^it preserves\b/i, "preserve")
    .replace(/^it\b/i, "apply")
    .replace(/\binstead of\b/gi, " | avoid ")
    .replace(/\bwithout\b/gi, " | avoid ")
    .replace(/,\s*(?:and\s+)?/g, " -> ")
    .replace(/\s+and\s+/g, " -> ")
    .replace(/\s{2,}/g, " ");

  return [
    `preserve=${familyLabel};`,
    `timing=${blueprint.start} -> ${blueprint.peak} -> ${blueprint.aftermath};`,
    `fit=${normalized};`,
  ].join(" ");
};

const createOptionSet = ({
  family,
  familyLabel,
  prefix,
  optionCount,
  recommendedIndex,
  recommendedReason,
  fallbackUsed = false,
  fallbackReason = null,
  timingFeel,
  durationSeconds = null,
  negativeConstraints = null,
  options,
}: {
  family: DrawingAiSoundFamily;
  familyLabel: string;
  prefix: string;
  optionCount: number;
  recommendedIndex: number;
  recommendedReason: string;
  fallbackUsed?: boolean;
  fallbackReason?: string | null;
  timingFeel: string;
  durationSeconds?: number | null;
  negativeConstraints?: string[] | null;
  options: CanonicalSoundOptionTemplate[];
}): CanonicalSoundOptionSet => {
  const safeOptions = sanitizeCanonicalTemplates({
    family,
    optionCount,
    options,
  });
  const safeRecommendedIndex = Math.min(Math.max(1, recommendedIndex), Math.max(1, safeOptions.length));
  const usedTitles = new Set<string>();

  return {
    family,
    familyLabel,
    recommendedIndex: safeRecommendedIndex,
    recommendedReason: formatEngineRecommendedReason(family, familyLabel, recommendedReason),
    fallbackUsed,
    fallbackReason,
    soundOptions: safeOptions.map((option, index) => {
      let title = formatEnginePlanTitle({
        familyLabel,
        title: option.title,
        description: option.description,
      });
      if (usedTitles.has(title)) {
        title = `${title} ${index + 1}`;
      }
      usedTitles.add(title);

      return {
        id: `${prefix}-${index + 1}`,
        title,
        description: formatEngineDescriptionDirective({
          family,
          familyLabel,
          description: option.description,
          timingFeel,
        }),
        timingFeel: formatEngineTimingDirective(timingFeel),
        intensityFeel: formatEngineParameterDirective({
          familyLabel,
          description: option.description,
          value: option.intensityFeel,
        }),
        durationSeconds: option.durationSeconds ?? durationSeconds,
        negativeConstraints,
        contentType: "sfx",
        speechText: null,
        soundFamily: family,
        soundProfile: option.soundProfile,
      };
    }),
  };
};

export const buildCanonicalSoundOptionSet = (
  userPrompt: string,
  optionCount: number,
  workspaceContextValue?: DrawingAiWorkspaceContext | null,
): CanonicalSoundOptionSet => {
  if (!isSoundGenerationEnabled()) {
    return {
      family: "generic",
      familyLabel: "sound generation disabled",
      recommendedIndex: 0,
      recommendedReason: SOUND_GENERATION_DISABLED_MESSAGE,
      fallbackUsed: true,
      fallbackReason: SOUND_GENERATION_DISABLED_MESSAGE,
      soundOptions: [],
    };
  }

  const normalizedPrompt = stripLeadingSoundGreetingFiller(userPrompt).toLowerCase();
  const lockedFamily = inferLockedSoundFamily(normalizedPrompt);
  const timingFeel = inferCanonicalSoundTimingFeel(normalizedPrompt, workspaceContextValue);
  const negativeConstraints = extractCanonicalNegativeConstraints(normalizedPrompt);
  const requestedDurationSeconds = inferRequestedDurationSeconds(normalizedPrompt);
  const isDistant =
    /\b(distant|distance|far away|farther away|background|behind (?:him|her|them)|in the distance|far down the hallway|behind the character)\b/i.test(normalizedPrompt);
  const isSubtle =
    /\b(soft|quiet|subtle|cleaner|less boom|less disordered|not arcadey|not glitchy|more subtle)\b/i.test(
      normalizedPrompt,
    );
  const rejectsScaryTone = hasNegativeConstraint(negativeConstraints, "scary");
  const rejectsWhooshTone = hasNegativeConstraint(negativeConstraints, "whoosh");
  const rejectsBeamTone = hasNegativeConstraint(negativeConstraints, "beam");
  const rejectsRobotTone = hasNegativeConstraint(negativeConstraints, "robotic") || hasNegativeConstraint(negativeConstraints, "robot");
  const rejectsDistortedTone =
    hasNegativeConstraint(negativeConstraints, "distorted") ||
    hasNegativeConstraint(negativeConstraints, "crunchy") ||
    hasNegativeConstraint(negativeConstraints, "harsh");

  if (lockedFamily === "zipper" || lockedFamily === "explosion") {
    const lockedOptionSet = createLockedFamilyRescueOptionSet({
      lockedFamily,
      optionCount,
      timingFeel,
      requestedDurationSeconds,
      negativeConstraints,
    });
    if (lockedOptionSet) {
      return lockedOptionSet;
    }
  }

  if (
    /\b(bone|fracture|fractured|ligament|cracked bone|bone crack|bone snap|dry break)\b/i.test(normalizedPrompt) ||
    (/\b(crack|cracked|snap|snapping|break|breaking)\b/i.test(normalizedPrompt) &&
      /\b(arm|leg|joint|rib|ribs|spine|skull|neck|shoulder|elbow|knee|ankle|wrist|bone|fracture)\b/i.test(
        normalizedPrompt,
      ))
  ) {
    const longBoneDuration =
      requestedDurationSeconds != null && requestedDurationSeconds >= 1.1
        ? Math.min(3.2, Math.max(1.25, requestedDurationSeconds))
        : /\b(long|longer|linger(?:ing)?|two[- ]stage|sequence|runout|twist(?:ing)?|grind(?:ing)?)\b/i.test(normalizedPrompt)
          ? 2.1
          : null;
    if (longBoneDuration != null) {
      return createOptionSet({
        family: "bone-break",
        familyLabel: "bone break",
        prefix: "safe-bone-break",
        optionCount,
        recommendedIndex: /\b(nasty|fracture|ugly|brutal)\b/i.test(normalizedPrompt) && !rejectsDistortedTone ? 2 : rejectsDistortedTone ? 3 : 1,
        recommendedReason: rejectsDistortedTone
          ? "it keeps the fracture in the bone family, with a readable snap, break, and settle instead of crunchy distortion or a flat pop."
          : "it gives the fracture a real tension-to-crack-to-settle sequence instead of ending as one tiny generic pop.",
        timingFeel,
        durationSeconds: longBoneDuration,
        negativeConstraints,
        options: [
          {
            title: "Compound Fracture Sequence",
            description: "Tense pre-load into a sharp bone snap, a second offset fracture split, and a controlled anatomical runout so the break reads as a full event.",
            intensityFeel: "Best when the bone crack needs a clear start, brutal peak, and readable settle without leaving the bone family.",
            soundProfile: "compound-fracture-sequence",
            durationSeconds: Math.min(3, Math.max(1.35, longBoneDuration * 0.94)),
          },
          {
            title: "Twisting Fracture Runout",
            description: "Ugly fracture snap with nastier secondary crackle, a slight pitch drop, and a stretched body-adjacent settle that stays anatomical instead of boomy.",
            intensityFeel: "Use when the fracture should feel harsher and more brutal without becoming a crunchy explosion substitute.",
            soundProfile: "twisting-fracture-runout",
            durationSeconds: Math.min(3.2, Math.max(1.5, longBoneDuration)),
          },
          {
            title: "Brittle Snap Aftershock",
            description: "Cleaner brittle crack with a fast snap front, lighter splinter chatter, and a restrained fracture tail that stays anatomical instead of woody or explosive.",
            intensityFeel: "Best when the break should stay cleaner and controlled while still feeling like a full fracture event.",
            soundProfile: "brittle-snap-aftershock",
            durationSeconds: Math.min(2.9, Math.max(1.3, longBoneDuration * 0.88)),
          },
        ],
      });
    }

    return createOptionSet({
      family: "bone-break",
      familyLabel: "bone break",
      prefix: "safe-bone-break",
      optionCount,
      recommendedIndex: 1,
      recommendedReason: "it keeps the break dry, sharp, and controlled, with a real crack-and-settle shape instead of drifting boomy or sci-fi.",
      timingFeel,
      negativeConstraints,
      options: [
        {
          title: "Dry Bone Snap",
          description: "Tense setup into a dry sharp bone snap, a quick follow-up fracture tick, and a tiny body settle.",
          intensityFeel: "Best when the break should read fast, dry, controlled, and clearly anatomical.",
          soundProfile: "dry-bone-snap",
        },
        {
          title: "Nasty Fracture Crack",
          description: "Ugly short bone fracture with splinter detail, a second nasty crackle, and a tight follow-through that stays inside the bone family.",
          intensityFeel: "Use when the frame should feel more brutal without turning boomy or explosive.",
          soundProfile: "nasty-fracture-crack",
        },
        {
          title: "Brittle Bone Break",
          description: "Cleaner brittle bone break with a sharper top crack, light fracture chatter, and a slightly heavier body settle.",
          intensityFeel: "Good when you want a crisp readable break with a short controlled aftermath.",
          soundProfile: "brittle-bone-break",
        },
      ],
    });
  }

  if (
    /\b(boing|cartoon bounce|cartoon boing|rubber(?:y)? bounce|spring(?:y)? bounce|playful bounce|bouncy landing|toon bounce)\b/i.test(
      normalizedPrompt,
    ) ||
    (/\bcartoon\b/i.test(normalizedPrompt) && /\b(landing|bounce|boing|playful)\b/i.test(normalizedPrompt))
  ) {
    const wantsCleanerBoing =
      /\b(clean|cleaner|soft|normal|less distorted|not weird|not disordered|not like an explosion)\b/i.test(
        normalizedPrompt,
      );
    return createOptionSet({
      family: "cartoon-bounce",
      familyLabel: "cartoon bounce",
      prefix: "safe-cartoon-boing",
      optionCount,
      recommendedIndex: wantsCleanerBoing ? 1 : /\b(rubber|rubbery)\b/i.test(normalizedPrompt) ? 2 : /\b(spring|springy)\b/i.test(normalizedPrompt) ? 3 : 1,
      recommendedReason: wantsCleanerBoing
        ? "it gives the cleanest readable cartoon bounce without drifting into harsh blast texture."
        : "it keeps the bounce playful and readable instead of turning it into a noisy hit.",
      timingFeel,
      options: [
        {
          title: "Clean Cartoon Boing",
          description: "Rounded toon-style boing with a playful pitch bend and a clean soft landing body.",
          intensityFeel: "Best for a normal readable cartoon bounce without weird distortion.",
          soundProfile: "clean-cartoon-boing",
        },
        {
          title: "Rubbery Bounce",
          description: "Lower rubbery bounce with a squishier body and a softer elastic rebound.",
          intensityFeel: "Use when the bounce should feel stretchier and more rubber-driven.",
          soundProfile: "rubbery-bounce",
        },
        {
          title: "Springy Toon Pop",
          description: "Brighter spring bounce with a clearer up-down pitch motion and a quick playful finish.",
          intensityFeel: "Good when the bounce should feel snappier without sounding explosive.",
          soundProfile: "springy-toon-pop",
        },
      ],
    });
  }

  if (/\b(button|beep|ui|menu|confirm|interface|click|tap|press|notification)\b/i.test(normalizedPrompt)) {
    const wantsCleanUi =
      /\b(clean|cleaner|soft|subtle|quiet|muted|modern|not arcadey|less distorted)\b/i.test(normalizedPrompt);
    return createOptionSet({
      family: "ui-beep",
      familyLabel: "ui beep",
      prefix: "safe-ui-beep",
      optionCount,
      recommendedIndex: wantsCleanUi ? 3 : 2,
      recommendedReason: wantsCleanUi
        ? "it is the cleanest and least distracting option for a UI beat."
        : "it keeps the button press readable while still feeling modern and controlled.",
      timingFeel,
      options: [
        {
          title: "Soft Confirm Beep",
          description: "Short clean confirmation tone with a tiny click and soft electronic pulse.",
          intensityFeel: "Best for subtle UI confirmation without drawing too much attention.",
          soundProfile: "soft-confirm-beep",
        },
        {
          title: "Brighter UI Click-Beep",
          description: "Small tech click followed by a brighter menu beep with quick cutoff.",
          intensityFeel: "Use when the button press should read a little clearer.",
          soundProfile: "brighter-ui-click-beep",
        },
        {
          title: "Cleaner Muted Menu Pulse",
          description: "Muted interface pulse with a clean chirp and very controlled release.",
          intensityFeel: "Best if you want the least distorted and least arcadey result.",
          soundProfile: "cleaner-muted-menu-pulse",
        },
      ],
    });
  }

  if (/\b(zipper|zip|unzipping|zipping)\b/i.test(normalizedPrompt)) {
    const wantsSlowZipper = /\b(slow|slowly|careful|carefully)\b/i.test(normalizedPrompt);
    const wantsCloseDetail = /\b(close|close-up|close up|quiet room|detailed|detail)\b/i.test(normalizedPrompt);
    const wantsMetallic = /\b(metal|metallic|jacket|teeth)\b/i.test(normalizedPrompt);
    return createOptionSet({
      family: "zipper",
      familyLabel: "zipper",
      prefix: "safe-zipper",
      optionCount,
      recommendedIndex: wantsSlowZipper ? 2 : wantsCloseDetail ? 3 : wantsMetallic ? 1 : 1,
      recommendedReason: wantsSlowZipper
        ? "it keeps the zipper as a controlled tooth-by-tooth slide instead of a noisy burst."
        : wantsCloseDetail
          ? "it keeps the zipper close, clean, and detailed instead of turning it into generic hiss."
          : "it preserves the mechanical slide-and-click identity instead of collapsing into a noise burst.",
      timingFeel,
      durationSeconds:
        requestedDurationSeconds != null
          ? Math.min(1.8, Math.max(0.22, requestedDurationSeconds))
          : wantsSlowZipper
            ? 0.7
            : 0.42,
      negativeConstraints,
      options: [
        {
          title: "Metal Tooth Zip",
          description: "Fast zipper slide with clear metal-tooth chatter, a tight mechanical scrape body, and a crisp finish click.",
          intensityFeel: "Best when the zip should read clearly and feel practical instead of noisy.",
          soundProfile: "metal-tooth-zip",
        },
        {
          title: "Slow Jacket Unzip",
          description: "Slower zipper pull with uneven tooth friction, short pauses in the slide, and a softer stop at the end.",
          intensityFeel: "Use when the zipper motion should feel slower, more careful, or more suspenseful.",
          soundProfile: "slow-jacket-unzip",
          durationSeconds: requestedDurationSeconds != null ? Math.min(2, Math.max(0.5, requestedDurationSeconds)) : 0.74,
        },
        {
          title: "Close Detail Zip Click",
          description: "Cleaner close-detail zipper texture with tight tooth chatter, restrained scrape noise, and a small terminal click.",
          intensityFeel: "Best when the zipper is close to camera and should stay clean instead of harsh.",
          soundProfile: "close-detail-zip-click",
        },
      ],
    });
  }

  if (
    /\b(t-?rex|dinosaur|creature|monster|beast|dragon)\b/i.test(normalizedPrompt) &&
    /\b(chasing|chase|running|run|stomp|stomping|pursuit|roar|roaring|footsteps?)\b/i.test(normalizedPrompt)
  ) {
    const chaseForward = /\b(chasing|chase|running|run|pursuit)\b/i.test(normalizedPrompt);
    const giantFootsteps = /\b(giant|huge|massive|heavy|ground shaking|ground-shaking|stomp|stomping)\b/i.test(normalizedPrompt);
    return createOptionSet({
      family: "creature",
      familyLabel: "creature action",
      prefix: "safe-creature-action",
      optionCount,
      recommendedIndex: chaseForward || giantFootsteps ? 1 : 2,
      recommendedReason:
        chaseForward || giantFootsteps
          ? "it keeps the creature read aggressive and layered with stride, weight, and roar texture instead of slipping into a shared low hum."
          : "it keeps the roar textured and animal-led instead of flattening into a sci-fi drone or generic rumble.",
      timingFeel,
      negativeConstraints,
      durationSeconds:
        requestedDurationSeconds != null ? Math.min(4.2, Math.max(0.9, requestedDurationSeconds)) : chaseForward ? 1.6 : 1.2,
      options: [
        {
          title: "Giant Chase Stomp",
          description: "Layered creature pursuit with spaced heavy footfalls, chesty roar bursts, and ground-hit follow-through so the motion reads like a dangerous chase instead of one low growl.",
          intensityFeel: "Best when the creature should feel huge, fast, and physically present across the whole beat.",
          soundProfile: "giant-chase-stomp",
        },
        {
          title: "Predator Roar Break",
          description: "Textured predator roar with breath, rasp, and a short weighty body under it, built to sound feral and aggressive rather than like an alien hover tone.",
          intensityFeel: "Use when the roar itself needs to read first but you still want a grounded creature body.",
          soundProfile: "predator-roar-break",
        },
        {
          title: "Ground Pound Pursuit",
          description: "Heavy pursuit with stomp-led ground impacts, shorter roar accents, and a rough moving-air edge so the creature feels like it is bearing down on the scene.",
          intensityFeel: "Best when the chase should feel more footfall- and impact-driven than roar-driven.",
          soundProfile: "ground-pound-pursuit",
        },
      ],
    });
  }

  if (
    /\b(fight|fighting|brawl|combat|battle scene|battle)\b/i.test(normalizedPrompt) &&
    /\b(rain|storm|stormy|thunder|lightning)\b/i.test(normalizedPrompt)
  ) {
    return createOptionSet({
      family: "rain",
      familyLabel: "storm fight",
      prefix: "safe-storm-fight",
      optionCount,
      recommendedIndex: /\b(thunder|lightning)\b/i.test(normalizedPrompt) ? 3 : /\b(heavy|hard|big)\b/i.test(normalizedPrompt) ? 2 : 1,
      recommendedReason:
        /\b(thunder|lightning)\b/i.test(normalizedPrompt)
          ? "it layers weather, strike energy, and hit punctuation without collapsing everything into one storm wash."
          : "it keeps the rain environmental while still leaving room for readable fight punctuation instead of generic hiss.",
      timingFeel,
      negativeConstraints,
      durationSeconds:
        requestedDurationSeconds != null ? Math.min(4.5, Math.max(1, requestedDurationSeconds)) : 1.6,
      options: [
        {
          title: "Storm Fight Rain",
          description: "Layered rain bed with changing drop density, moving storm air, and restrained hit punctuation tucked into the weather so the fight stays readable.",
          intensityFeel: "Best when the scene should feel wet, active, and clearly fight-driven without turning into noise soup.",
          soundProfile: "storm-fight-rain",
        },
        {
          title: "Heavy Rain Brawl",
          description: "Denser rain sheet with heavier weather weight, sharper contact accents, and a rougher body that still keeps the punches separate from the rain bed.",
          intensityFeel: "Use when the storm should feel harder and the fight more physical.",
          soundProfile: "heavy-rain-brawl",
        },
        {
          title: "Thunder Rain Clash",
          description: "Storm rain with a brighter strike edge, rolling weather tail, and short impact punctuation so the scene feels like combat inside a thunderstorm rather than a flat rain loop.",
          intensityFeel: "Best when the storm itself should feel dramatic while the fight beats still read through it.",
          soundProfile: "thunder-rain-clash",
        },
      ],
    });
  }

  if (
    /\b(giant footsteps?|huge footsteps?|massive footsteps?|heavy footsteps?|stomp|stomping)\b/i.test(normalizedPrompt) &&
    !/\b(t-?rex|dinosaur|creature|monster|beast|dragon)\b/i.test(normalizedPrompt)
  ) {
    return createOptionSet({
      family: "footsteps",
      familyLabel: "giant footsteps",
      prefix: "safe-giant-footsteps",
      optionCount,
      recommendedIndex: /\b(chasing|run|running|rush)\b/i.test(normalizedPrompt) ? 2 : 1,
      recommendedReason:
        /\b(chasing|run|running|rush)\b/i.test(normalizedPrompt)
          ? "it gives the steps a heavier chase cadence instead of a single repetitive stomp."
          : "it keeps the footsteps giant and ground-led without becoming a low drone.",
      timingFeel,
      negativeConstraints,
      options: [
        {
          title: "Giant Ground Stomp",
          description: "Heavy spaced footsteps with big ground contact, a secondary sole scrape, and enough body movement to feel giant rather than just bassy.",
          intensityFeel: "Best when the steps should feel huge and singular.",
          soundProfile: "giant-ground-stomp",
        },
        {
          title: "Heavy Chase Footfalls",
          description: "Bigger repeated footfalls with a chasing cadence, heel-to-toe impact layering, and rolling ground pressure between steps.",
          intensityFeel: "Use when the giant movement should feel like pursuit instead of isolated stomps.",
          soundProfile: "heavy-chase-footfalls",
        },
        {
          title: "Weighted Titan Step",
          description: "Large step with slower body drop, broader sole weight, and a controlled ground payoff that stays physical instead of boomy.",
          intensityFeel: "Best when the giant should feel massive, deliberate, and grounded.",
          soundProfile: "weighted-titan-step",
        },
      ],
    });
  }

  if (
    /\b(fall|falling|drop|dropping|plummet|fell)\b/i.test(normalizedPrompt) &&
    /\b(impact|hit|slam|ground|land|landing|crash)\b/i.test(normalizedPrompt)
  ) {
    return createOptionSet({
      family: "impact",
      familyLabel: "fall impact",
      prefix: "safe-fall-impact",
      optionCount,
      recommendedIndex: /\b(skid|slide|scrape)\b/i.test(normalizedPrompt) ? 3 : /\b(hard|heavy|brutal)\b/i.test(normalizedPrompt) ? 2 : 1,
      recommendedReason:
        /\b(hard|heavy|brutal)\b/i.test(normalizedPrompt)
          ? "it gives the fall a readable drop-into-hit shape and a heavier body payoff instead of one flat slam."
          : "it keeps the motion and the landing connected so the impact feels staged over time instead of abrupt and generic.",
      timingFeel,
      negativeConstraints,
      options: [
        {
          title: "Fall Then Impact",
          description: "Short drop motion into a firm body hit, with a little pre-impact air and a grounded landing body so the event reads in sequence.",
          intensityFeel: "Best when the fall and the hit both need to read clearly.",
          soundProfile: "fall-then-impact",
        },
        {
          title: "Hard Drop Body Slam",
          description: "Heavier falling body with a stronger ground payoff, denser slam body, and a brief follow-through after the contact.",
          intensityFeel: "Use when the landing should feel harsher and more physical.",
          soundProfile: "hard-drop-body-slam",
        },
        {
          title: "Skid Into Hit",
          description: "Quick drop with a narrow air pass, scrape-into-impact sequence, and tighter body cutoff for sharper action timing.",
          intensityFeel: "Best when the fall should feel faster and more abrupt before the hit lands.",
          soundProfile: "skid-into-hit",
        },
      ],
    });
  }

  if (/\b(lightning|lightning strike|thunderstrike|thunder strike|thunderclap|thunder crack|bolt strike)\b/i.test(normalizedPrompt)) {
    const recommendedIndex =
      /\b(rolling|storm|tail|aftershock)\b/i.test(normalizedPrompt) ? 3 : /\b(heavy|big|thunder|body)\b/i.test(normalizedPrompt) ? 2 : 1;
    const recommendedReason =
      recommendedIndex === 3
        ? "it gives the clearest flash-then-roll shape instead of collapsing into a generic deep drone."
        : recommendedIndex === 2
          ? "it gives the strike a clearer body and thunder weight after the flash."
          : "it keeps the strike sharp and readable without turning into static or a generic blast.";
    return createOptionSet({
      family: "thunder",
      familyLabel: "thunder strike",
      prefix: "safe-thunder",
      optionCount,
      recommendedIndex,
      recommendedReason,
      timingFeel,
      options: [
        {
          title: "Flash Crack Strike",
          description: "Sharp lightning flash-crack with a tight strike body and quick clean thunder follow-through.",
          intensityFeel: "Best when the lightning should read sharply right on the flash.",
          soundProfile: "flash-crack-strike",
        },
        {
          title: "Heavy Thunder Strike",
          description: "Stronger lightning hit with a fuller thunder body and more storm weight after the crack.",
          intensityFeel: "Use when the strike should feel bigger and more physical after the flash.",
          soundProfile: "heavy-thunder-strike",
        },
        {
          title: "Rolling Storm Tail",
          description: "Crisp lightning start that opens into a longer rolling thunder tail instead of a flat deep drone.",
          intensityFeel: "Best when the strike needs a clearer aftershock and storm-space finish.",
          soundProfile: "rolling-storm-tail",
        },
      ],
    });
  }

  if (/\b(electric(?:ity|al)?|arc|arcing|zap|zapping|power surge|spark(?:ing)?|crackle)\b/i.test(normalizedPrompt)) {
    const recommendedIndex =
      /\b(power|surge|heavy|bigger)\b/i.test(normalizedPrompt) ? 2 : /\b(arc|zap)\b/i.test(normalizedPrompt) ? 1 : 3;
    const recommendedReason =
      recommendedIndex === 2
        ? "it gives the electrical beat a stronger power-body instead of turning it into a thin buzz."
        : recommendedIndex === 1
          ? "it keeps the electricity sharp and readable without turning into generic sci-fi noise."
          : "it gives the cleanest controlled electrical tail for testing.";
    return createOptionSet({
      family: "electricity",
      familyLabel: "electricity",
      prefix: "safe-electricity",
      optionCount,
      recommendedIndex,
      recommendedReason,
      timingFeel,
      options: [
        {
          title: "Arc Crack Snap",
          description: "Sharp electrical arc crack with a quick readable zap and controlled bite.",
          intensityFeel: "Best when the electricity should feel quick and dangerous.",
          soundProfile: "arc-crack-snap",
        },
        {
          title: "Power Surge Body",
          description: "Heavier electrical surge with clearer power body and a stronger energized tail.",
          intensityFeel: "Use when the electricity should feel bigger and more forceful.",
          soundProfile: "power-surge-body",
        },
        {
          title: "Clean Current Tail",
          description: "Controlled electric crackle with a smoother current tail and less harsh top-end spit.",
          intensityFeel: "Best when the electricity should stay cleaner and more controlled.",
          soundProfile: "clean-current-tail",
        },
      ],
    });
  }

  if (/\b(magic|magical|arcane|spell|mystic|rune|enchanted)\b/i.test(normalizedPrompt)) {
    const recommendedIndex =
      /\b(charge|build|swell|before)\b/i.test(normalizedPrompt)
        ? 3
        : /\b(burst|blast|release|impact)\b/i.test(normalizedPrompt)
          ? 1
          : 2;
    const recommendedReason =
      recommendedIndex === 3
        ? "it keeps the magic clearly arcane and rising instead of slipping toward robotic beam language."
        : recommendedIndex === 1
          ? "it gives the release a magical burst shape without collapsing into a laser shot."
          : "it keeps the cue mystical, readable, and broad enough for general spell energy.";
    return createOptionSet({
      family: "magic",
      familyLabel: "magic",
      prefix: "safe-magic",
      optionCount,
      recommendedIndex,
      recommendedReason,
      timingFeel,
      negativeConstraints,
      options: [
        {
          title: "Arcane Burst Flare",
          description: "Magical release burst with a bright arcane flare, unstable sparkle, and a short enchanted bloom.",
          intensityFeel: "Best when the magic should feel like a clear spell release, not a laser weapon.",
          soundProfile: "arcane-burst-flare",
        },
        {
          title: "Shimmer Spell Pop",
          description: "Lighter magical pop with shimmering top detail and a quick clean spell finish.",
          intensityFeel: "Use when the magic should feel nimble, bright, and less heavy.",
          soundProfile: "shimmer-spell-pop",
        },
        {
          title: "Rune Energy Bloom",
          description: "Layered rune-like swell with airy glow, controlled magical body, and a clean release bloom.",
          intensityFeel: "Best when the magic needs a little build and wonder before it opens up.",
          soundProfile: "rune-energy-bloom",
        },
      ],
    });
  }

  if (
    /\b(energy|beam|energy burst|energy wave|pulse blast|pulse shot|discharge|power beam)\b/i.test(normalizedPrompt) &&
    !/\b(laser|blaster|plasma|magic|magical|spell|arcane)\b/i.test(normalizedPrompt)
  ) {
    const recommendedIndex =
      rejectsBeamTone || /\b(burst|release|shot)\b/i.test(normalizedPrompt)
        ? 2
        : rejectsRobotTone || /\b(clean|focused|beam)\b/i.test(normalizedPrompt)
          ? 1
          : 3;
    const recommendedReason =
      recommendedIndex === 2
        ? "it gives the energy release a burst-first shape instead of a continuous hum."
        : recommendedIndex === 1
          ? "it keeps the beam focused and controlled without drifting into robotic chatter."
          : "it keeps the energy broader and wave-like while staying out of the laser family.";
    return createOptionSet({
      family: "energy",
      familyLabel: "energy",
      prefix: "safe-energy",
      optionCount,
      recommendedIndex,
      recommendedReason,
      timingFeel,
      negativeConstraints,
      options: [
        {
          title: "Focused Energy Beam",
          description: "Clean energy beam with a bright core, controlled discharge edge, and quick focused finish.",
          intensityFeel: "Best when the effect should feel directed and controlled instead of noisy.",
          soundProfile: "focused-energy-beam",
        },
        {
          title: "Charged Energy Burst",
          description: "Short charged release with a denser energy body and a stronger pressure-like payoff.",
          intensityFeel: "Use when the energy should fire outward in one clear burst.",
          soundProfile: "charged-energy-burst",
        },
        {
          title: "Pulse Wave Release",
          description: "Wider energy pulse with a softer wave front and a smoother release tail.",
          intensityFeel: "Best when the cue should feel broader than a laser but still clearly energized.",
          soundProfile: "pulse-wave-release",
        },
      ],
    });
  }

  if (/\b(volcano|eruption|erupting|lava burst|magma burst|lava flow)\b/i.test(normalizedPrompt)) {
    const recommendedIndex =
      /\b(ash|plume|roll|fallout|after)\b/i.test(normalizedPrompt) ? 3 : /\b(lava|magma|debris|rocks?|foreground|huge|massive)\b/i.test(normalizedPrompt) ? 2 : 1;
    const recommendedReason =
      recommendedIndex === 3
        ? "it keeps the eruption environmental and debris-led instead of collapsing into a generic monster rumble."
        : recommendedIndex === 2
          ? "it gives the event rock, pressure, and eruption body without slipping into a UFO-like low drone."
          : "it gives the clearest pressure-and-release shape for a volcanic burst.";
    return createOptionSet({
      family: "volcano",
      familyLabel: "volcano eruption",
      prefix: "safe-volcano",
      optionCount,
      recommendedIndex,
      recommendedReason,
      timingFeel,
      durationSeconds:
        requestedDurationSeconds != null ? Math.min(4.2, Math.max(0.9, requestedDurationSeconds)) : null,
      negativeConstraints,
      options: [
        {
          title: "Pressure Vent Burst",
          description: "Volcanic pressure release with a hot vent punch, ash spray, and a quick debris spit before the event falls away.",
          intensityFeel: "Best when the eruption should read as a sharp geothermal release first.",
          soundProfile: "pressure-vent-burst",
        },
        {
          title: "Lava Debris Eruption",
          description: "Thicker eruption body with rock throw, magma pressure, and a heavier collapsing debris finish that stays material-led instead of just becoming a generic explosion.",
          intensityFeel: "Use when the blast should feel bigger and more material-driven.",
          soundProfile: "lava-debris-eruption",
        },
        {
          title: "Ash Plume Rollout",
          description: "Initial eruption crack followed by airy ash plume movement, falling grit, and a wider environmental rollout.",
          intensityFeel: "Best when the eruption should keep environmental scale after the first break.",
          soundProfile: "ash-plume-rollout",
        },
      ],
    });
  }

  if (
    /\b(pebble|small stone|tiny stone|rock)\b/i.test(normalizedPrompt) &&
    /\b(water|pond|puddle|pool|lake|river|splash|ripple)\b/i.test(normalizedPrompt)
  ) {
    const splashy = /\b(splash|bigger)\b/i.test(normalizedPrompt);
    return createOptionSet({
      family: "pebble-water",
      familyLabel: "pebble water",
      prefix: "safe-pebble-water",
      optionCount,
      recommendedIndex: splashy ? 2 : 1,
      recommendedReason: splashy
        ? "it gives the drop a clearer splash body without losing the tiny pebble identity."
        : "it keeps the water beat small, clean, and readable instead of turning it into a random plop.",
      timingFeel,
      options: [
        {
          title: "Pebble Water Plip",
          description: "Tiny pebble drop with a clean plip, light water touch, and a small ripple finish.",
          intensityFeel: "Best for a small readable drop that should stay delicate.",
          soundProfile: "pebble-water-plip",
        },
        {
          title: "Pebble Splash Accent",
          description: "Slightly fuller pebble hit with a clearer water splash body and a wider little ripple.",
          intensityFeel: "Use when the water contact should read a bit more clearly.",
          soundProfile: "pebble-splash-accent",
        },
        {
          title: "Quiet Ripple Drop",
          description: "Soft water-entry plip with a restrained ripple tail and less top-end click.",
          intensityFeel: "Best when the water beat should stay subtle and tucked in.",
          soundProfile: "quiet-ripple-drop",
        },
      ],
    });
  }

  if (/\b(water|splash|splashing|plunge|wet hit|wave crash|water burst)\b/i.test(normalizedPrompt)) {
    const recommendedIndex =
      /\b(big|heavy|huge|plunge|crash)\b/i.test(normalizedPrompt) ? 2 : /\b(spray|surface|light|quick)\b/i.test(normalizedPrompt) ? 3 : 1;
    const recommendedReason =
      recommendedIndex === 2
        ? "it gives the water a fuller splash body without turning into a debris crash."
        : recommendedIndex === 3
          ? "it keeps the splash light and readable without drifting into generic plops."
          : "it gives the cleanest all-purpose water contact for animation timing.";
    return createOptionSet({
      family: "water",
      familyLabel: "water splash",
      prefix: "safe-water",
      optionCount,
      recommendedIndex,
      recommendedReason,
      timingFeel,
      negativeConstraints,
      options: [
        {
          title: "Clean Water Splash",
          description: "Clear water slap with a rounded splash body, brief spray, and a tidy wet finish.",
          intensityFeel: "Best for a readable splash that should feel clean and neutral.",
          soundProfile: "clean-water-splash",
        },
        {
          title: "Heavy Plunge Splash",
          description: "Bigger water impact with a denser plunge body, wider splash spread, and a heavier wet payoff.",
          intensityFeel: "Use when the water hit should feel larger and more forceful.",
          soundProfile: "heavy-plunge-splash",
        },
        {
          title: "Spray Surface Slap",
          description: "Sharper surface splash with lighter spray texture and a quicker watery cutoff.",
          intensityFeel: "Best when the splash should feel faster and more top-led.",
          soundProfile: "spray-surface-slap",
        },
      ],
    });
  }

  if (/\b(fire|flame|flames|fireball|ignite|ignition|flare|flame burst|torch)\b/i.test(normalizedPrompt)) {
    const recommendedIndex =
      /\b(burst|blast|flare|fireball)\b/i.test(normalizedPrompt) ? 1 : /\b(crackle|torch|smaller)\b/i.test(normalizedPrompt) ? 2 : 3;
    const recommendedReason =
      recommendedIndex === 1
        ? "it keeps the fire aggressive and hot without collapsing into an explosion body."
        : recommendedIndex === 2
          ? "it gives the flame more crackle and source texture instead of a generic whoomph."
          : "it keeps the fire broader and more sustained when the flame needs to hang for a moment.";
    return createOptionSet({
      family: "fire",
      familyLabel: "fire",
      prefix: "safe-fire",
      optionCount,
      recommendedIndex,
      recommendedReason,
      timingFeel,
      negativeConstraints,
      options: [
        {
          title: "Flame Burst Whoomph",
          description: "Hot fire burst with a fast whoomph front, bright flame spread, and a short crackling tail.",
          intensityFeel: "Best when the flame should ignite outward in one clean burst.",
          soundProfile: "flame-burst-whoomph",
        },
        {
          title: "Crackling Fire Pop",
          description: "Smaller fire pop with crisp crackle detail, a quick ignition body, and less broad air push.",
          intensityFeel: "Use when the fire should feel more source-based and less explosive.",
          soundProfile: "crackling-fire-pop",
        },
        {
          title: "Hot Flare Roar",
          description: "Broader flame flare with a warmer roar body and a slightly longer heated finish.",
          intensityFeel: "Best when the fire needs more sustained heat after the first burst.",
          soundProfile: "hot-flare-roar",
        },
      ],
    });
  }

  if (/\b(room tone|hallway air|air bed|ambient bed|room air|hallway tone)\b/i.test(normalizedPrompt)) {
    return createOptionSet({
      family: "room-tone",
      familyLabel: "room tone",
      prefix: "safe-room-tone",
      optionCount,
      recommendedIndex: 1,
      recommendedReason: "it gives you the cleanest usable background bed without crowding the shot.",
      timingFeel,
      options: [
        {
          title: "Thin Hallway Air",
          description: "Quiet hallway air bed with light room tone and restrained space around it.",
          intensityFeel: "Best when you want a subtle environment bed instead of a featured effect.",
          soundProfile: "thin-hallway-air",
        },
        {
          title: "Soft Room Tone",
          description: "Gentle indoor air tone with barely-there hum and clean background texture.",
          intensityFeel: "Use when the scene just needs a little life in the space.",
          soundProfile: "soft-room-tone",
        },
        {
          title: "Moodier Air Bed",
          description: "Slightly darker air bed with more empty-space presence and very soft movement.",
          intensityFeel: "Good if the room should feel a touch more tense without sounding like a reveal sting.",
          soundProfile: "moodier-air-bed",
        },
      ],
    });
  }

  if (/\b(rain(?:y)?|raindrops?|drizzle|downpour|storm rain|rainfall)\b/i.test(normalizedPrompt)) {
    const stormy = /\b(storm|downpour|heavy)\b/i.test(normalizedPrompt);
    return createOptionSet({
      family: "rain",
      familyLabel: "rain",
      prefix: "safe-rain",
      optionCount,
      recommendedIndex: stormy ? 2 : 1,
      recommendedReason: stormy
        ? "it gives the rain more storm weight without turning it into static wash."
        : "it keeps the rain bed light and readable instead of collapsing into generic hiss.",
      timingFeel,
      durationSeconds:
        requestedDurationSeconds != null ? Math.min(4.5, Math.max(1, requestedDurationSeconds)) : null,
      negativeConstraints,
      options: [
        {
          title: "Light Rain Bed",
          description: "Soft rain texture with scattered drop detail, a gentle surface bed, and enough motion over time to avoid a flat same-pitch wash.",
          intensityFeel: "Best when the rain should stay light and environmental.",
          soundProfile: "light-rain-bed",
        },
        {
          title: "Storm Rain Sheet",
          description: "Heavier rain body with storm density, layered drop motion, and a fuller weather sheet instead of generic broadband hiss.",
          intensityFeel: "Use when the rain should feel fuller and more serious.",
          soundProfile: "storm-rain-sheet",
        },
        {
          title: "Window Rain Texture",
          description: "Tighter rain pattern with irregular window-like ticks, clearer drop placement, and less broad hiss than a generic rain wash.",
          intensityFeel: "Best when the rain should stay readable and controlled.",
          soundProfile: "window-rain-texture",
        },
      ],
    });
  }

  if (/\b(wind|gust|breeze|outside air|windy)\b/i.test(normalizedPrompt)) {
    return createOptionSet({
      family: "wind",
      familyLabel: "wind",
      prefix: "safe-wind",
      optionCount,
      recommendedIndex: isDistant || isSubtle ? 1 : 2,
      recommendedReason:
        isDistant || isSubtle
          ? "it keeps the wind environmental, with entry, motion, and fade, without turning it into a noisy blast or a whoosh."
          : "it gives you the clearest environmental motion without getting harsh or drifting into whoosh language.",
      timingFeel,
      durationSeconds:
        requestedDurationSeconds != null ? Math.min(4.5, Math.max(1, requestedDurationSeconds)) : null,
      negativeConstraints,
      options: [
        {
          title: "Soft Back Wind",
          description: "Soft air entry into layered cross-breeze motion and a restrained background fade instead of a flat low hum.",
          intensityFeel: "Best for subtle outside air that stays environmental and leaves room for the action.",
          soundProfile: "soft-back-wind",
        },
        {
          title: "Moodier Low Wind",
          description: "Broader outdoor wind with a calmer body, shifting cross-air pressure, and a cleaner weather fade without drifting into a drone.",
          intensityFeel: "Use when the scene needs more atmosphere without sounding stormy or motion-led.",
          soundProfile: "moodier-low-wind",
        },
        {
          title: "Sharper Gust Pass",
          description: "Cleaner gust with a readable front edge, a shaped mid-air peak, and a quicker drift-off so it still reads as wind, not whoosh.",
          intensityFeel: "Good when the wind movement needs to read more clearly while staying in the wind family.",
          soundProfile: "sharper-gust-pass",
        },
      ],
    });
  }

  if (
    /\b(debris|rubble|collapse|crash|crashing|rock fall|rockfall|clatter|falling apart|fall apart)\b/i.test(normalizedPrompt) &&
    !/\b(water|splash|fire|flame|door|vehicle|car)\b/i.test(normalizedPrompt)
  ) {
    const recommendedIndex =
      /\b(collapse|crash|heavy|hard)\b/i.test(normalizedPrompt) ? 1 : /\b(scatter|small|dusty|background)\b/i.test(normalizedPrompt) ? 2 : 3;
    const recommendedReason =
      recommendedIndex === 1
        ? "it gives the debris event a real crash body instead of a soft foliage rustle."
        : recommendedIndex === 2
          ? "it keeps the debris lighter and more scattered without faking an impact slam."
          : "it keeps the collapse rolling and material-driven without falling into explosion drift.";
    return createOptionSet({
      family: "debris",
      familyLabel: "debris crash",
      prefix: "safe-debris",
      optionCount,
      recommendedIndex,
      recommendedReason,
      timingFeel,
      negativeConstraints,
      options: [
        {
          title: "Hard Debris Crash",
          description: "Dense debris hit with rock-and-fragment crash, short body drop, and a rough collapsing tail.",
          intensityFeel: "Best when the debris should land like a real crash event.",
          soundProfile: "hard-debris-crash",
        },
        {
          title: "Rubble Scatter Drop",
          description: "Lighter debris scatter with smaller fragment clatter and a quicker dusty finish.",
          intensityFeel: "Use when the debris should feel more like pieces falling than one big hit.",
          soundProfile: "rubble-scatter-drop",
        },
        {
          title: "Dusty Collapse Roll",
          description: "Rolling debris fall with dusty movement, uneven clatter, and a softer collapsing finish.",
          intensityFeel: "Best when the event should feel broader and more environmental.",
          soundProfile: "dusty-collapse-roll",
        },
      ],
    });
  }

  if (
    /\b(leaves?|leaf|twig|branch|debris)\b/i.test(normalizedPrompt) &&
    /\b(crunch|crackle|rustle|snap|break|fall)\b/i.test(normalizedPrompt)
  ) {
    return createOptionSet({
      family: "rustle",
      familyLabel: "rustle",
      prefix: "safe-environment",
      optionCount,
      recommendedIndex: isDistant || isSubtle ? 1 : 2,
      recommendedReason:
        isDistant || isSubtle
          ? "it reads as background texture without crowding the beat."
          : "it keeps the material detail clear while still feeling present.",
      timingFeel,
      options: [
        {
          title: isDistant ? "Distant Leaf Crunch" : "Soft Leaf Crunch",
          description: isDistant
            ? "Soft leafy crunch with light rustle and distant air around it."
            : "Soft leafy crunch with a clean brittle rustle and tight material detail.",
          intensityFeel: isDistant
            ? "Farther back and quieter for background movement."
            : "Sharper or quieter depending on how close it should feel.",
          soundProfile: "soft-leaf-crunch",
        },
        {
          title: "Branchy Rustle Accent",
          description: "Drier leaf-and-twig movement with a clearer branch texture and quick decay.",
          intensityFeel: "Best when the foliage needs more exposed material detail without becoming harsh.",
          soundProfile: "branchy-rustle-accent",
        },
        {
          title: "Background Debris Rustle",
          description: "Loose rustle with light crunch texture and a softer distant bed.",
          intensityFeel: "Use when the movement should feel more environmental than direct.",
          soundProfile: "background-debris-rustle",
        },
      ],
    });
  }

  if (/\b(branch|twig)\b/i.test(normalizedPrompt) && /\b(snap|crack|break)\b/i.test(normalizedPrompt)) {
    return createOptionSet({
      family: "branch-snap",
      familyLabel: "branch snap",
      prefix: "safe-branch-snap",
      optionCount,
      recommendedIndex: isDistant ? 1 : 2,
      recommendedReason: isDistant
        ? "it keeps the branch snap tucked into the background instead of sounding like a foreground hit."
        : "it gives you a clear material break without turning into a bone crack or explosion.",
      timingFeel,
      options: [
        {
          title: "Dry Twig Snap",
          description: "Short dry twig crack with a quick natural cutoff and restrained body.",
          intensityFeel: "Best for a small branch break that should read cleanly.",
          soundProfile: "dry-twig-snap",
        },
        {
          title: "Branch Crack Accent",
          description: "Slightly fuller wooden crack with a little more branch body and less brittle top.",
          intensityFeel: "Use when the branch break should feel a bit larger without sounding explosive.",
          soundProfile: "branch-crack-accent",
        },
        {
          title: "Far Snap Behind Him",
          description: "Quieter branch snap with softer air around it for a behind-the-character read.",
          intensityFeel: "Best for sneaking or danger-in-the-background moments.",
          soundProfile: "far-snap-behind",
        },
      ],
    });
  }

  if (
    /\b(door|airlock)\b/i.test(normalizedPrompt) &&
    /\b(sci-fi|science fiction|mist|smoke|sealed|pressure)\b/i.test(normalizedPrompt) &&
    /\b(open|opening|door)\b/i.test(normalizedPrompt)
  ) {
    const misty = /\b(mist|smoke|hiss)\b/i.test(normalizedPrompt);
    return createOptionSet({
      family: "door-sci-fi",
      familyLabel: "sci-fi door",
      prefix: "safe-scifi-door",
      optionCount,
      recommendedIndex: misty ? 1 : 2,
      recommendedReason: misty
        ? "it keeps the door read airy and controlled instead of turning it into a UFO sweep."
        : "it gives the door a clearer mechanism body without drifting into a vehicle or beam sound.",
      timingFeel,
      negativeConstraints,
      options: [
        {
          title: "Misty Airlock Open",
          description: "Soft sealed-door release with light pressure hiss, restrained air movement, and a clean sci-fi open feel.",
          intensityFeel: "Best when the door should feel airy and controlled instead of aggressive.",
          soundProfile: "misty-airlock-open",
        },
        {
          title: "Mechanical Sci-Fi Door",
          description: "Heavier futuristic door open with low mechanism body and a controlled pressure release tail.",
          intensityFeel: "Use when the door should feel more like machinery than mist.",
          soundProfile: "mechanical-sci-fi-door",
        },
        {
          title: "Clean Pressure Door Slide",
          description: "Balanced sci-fi door slide with clean air release and a restrained system-body underneath.",
          intensityFeel: "Best when you want a readable futuristic door without weird sweep drift.",
          soundProfile: "clean-pressure-door-slide",
        },
      ],
    });
  }

  if (/\b(door|hallway)\b/i.test(normalizedPrompt) && /\b(creak|open|opening)\b/i.test(normalizedPrompt)) {
    const recommendedIndex =
      /\b(hallway|eerie|thin)\b/i.test(normalizedPrompt) ? 3 : /\b(old|wood|wooden|heavy|groan)\b/i.test(normalizedPrompt) ? 2 : 1;
    const recommendedReason =
      recommendedIndex === 3
        ? "it keeps the door cue thin, eerie, and material-led instead of turning it into a whoosh or low drone."
        : recommendedIndex === 2
          ? "it gives the opening more old-wood weight without getting distorted or car-like."
          : "it gives the cleanest hinge-first read for a slow door open.";
    return createOptionSet({
      family: "door",
      familyLabel: "door creak",
      prefix: "safe-door-creak",
      optionCount,
      recommendedIndex,
      recommendedReason,
      timingFeel,
      negativeConstraints,
      options: [
        {
          title: "Dry Hinge Creak",
          description: "Tight hinge strain with clean creak pulses and a restrained open-motion groan.",
          intensityFeel: "Best when the hinge detail should read first without sounding windy or fast.",
          soundProfile: "dry-hinge-creak",
        },
        {
          title: "Heavy Old Wood Groan",
          description: "Slower wooden door strain with fuller old-wood body and a darker open creak.",
          intensityFeel: "Use when the door should feel older, heavier, and more material-driven.",
          soundProfile: "heavy-old-wood-groan",
        },
        {
          title: "Thin Eerie Hallway Creak",
          description: "Narrow hallway door creak with lighter hinge scrape, long corridor air, and restrained suspense.",
          intensityFeel: "Good for a thin creepy hallway-open read that stays environmental.",
          soundProfile: "thin-eerie-hallway-creak",
        },
      ],
    });
  }

  if (
    /\b(footsteps?|walking|walks?|step|steps)\b/i.test(normalizedPrompt) &&
    /\b(stone bricks?|brick|cobblestone|stone floor|pavers?|concrete|cement|sidewalk|hard floor)\b/i.test(normalizedPrompt)
  ) {
    const recommendedIndex =
      /\b(stone bricks?|brick|cobblestone|stone floor|pavers?)\b/i.test(normalizedPrompt) ? 1 : /\b(concrete|cement|sidewalk)\b/i.test(normalizedPrompt) ? 2 : 3;
    const recommendedReason =
      recommendedIndex === 1
        ? "it keeps the step crisp and surface-specific for stone instead of collapsing into a generic thud."
        : recommendedIndex === 2
          ? "it gives the step a harder concrete floor read without turning it into a click or whoosh."
          : "it keeps the hard-floor step controlled and neutral if the surface should stay less specific.";
    return createOptionSet({
      family: "footsteps",
      familyLabel: "footsteps",
      prefix: "safe-hard-surface-footstep",
      optionCount,
      recommendedIndex,
      recommendedReason,
      timingFeel,
      negativeConstraints,
      options: [
        {
          title: "Stone Brick Step",
          description: "Hard step with a crisp stone-brick click, a little grit, and a compact body under it.",
          intensityFeel: "Best when the surface texture should read as stone first.",
          soundProfile: "stone-brick-step",
        },
        {
          title: "Concrete Floor Step",
          description: "Flatter harder step with a denser concrete contact and a duller body than brick.",
          intensityFeel: "Use when the step should feel more like concrete than stone.",
          soundProfile: "concrete-floor-step",
        },
        {
          title: "Neutral Hardfloor Step",
          description: "Controlled hard-surface step with clean contact and less obvious surface color.",
          intensityFeel: "Best when the step should stay readable without overcommitting to one texture.",
          soundProfile: "neutral-hardfloor-step",
        },
      ],
    });
  }

  if (/\b(footsteps?|walking|walks?|step|steps)\b/i.test(normalizedPrompt) && /\b(sneak(?:ing)?|behind him|behind her|behind them|distant|background)\b/i.test(normalizedPrompt)) {
    return createOptionSet({
      family: "footsteps",
      familyLabel: "footsteps",
      prefix: "safe-footstep-stealth",
      optionCount,
      recommendedIndex: rejectsScaryTone ? 2 : 1,
      recommendedReason: rejectsScaryTone
        ? "it keeps the footsteps restrained and behind the scene without leaning spooky or creepy."
        : "it keeps the footsteps behind the character and out of the foreground instead of turning them into a low event bed.",
      timingFeel,
      negativeConstraints,
      options: [
        {
          title: "Distant Creepy Step",
          description: "Soft step with airy room tone, light sole contact, and a restrained eerie tail.",
          intensityFeel: "Best for footsteps that should feel behind the scene.",
          soundProfile: "distant-creepy-step",
        },
        {
          title: "Sneak Crunch",
          description: "Small quiet step with brittle floor texture and a tight cutoff.",
          intensityFeel: "Use when the floor material should read more than the room.",
          soundProfile: "sneak-crunch",
        },
        {
          title: "Background Pursuit Step",
          description: "Softer repeated step feel with a little ominous weight behind it.",
          intensityFeel: "Good if the danger needs to feel present but not close.",
          soundProfile: "background-pursuit-step",
        },
      ],
    });
  }

  if (/\b(footsteps?|walking|walks?|step|steps)\b/i.test(normalizedPrompt)) {
    const recommendedIndex =
      rejectsScaryTone
        ? 1
        : /\b(soft|quiet|barely|subtle)\b/i.test(normalizedPrompt)
          ? 3
          : /\b(hard|firm|boots?|stomp)\b/i.test(normalizedPrompt)
            ? 2
            : 1;
    const recommendedReason =
      recommendedIndex === 3
        ? "it keeps the footsteps soft and readable without collapsing into a spooky low bed."
        : recommendedIndex === 2
          ? "it gives the footfall a firmer shoe-contact read instead of a generic thump."
          : "it keeps the steps neutral, usable, and surface-agnostic.";
    return createOptionSet({
      family: "footsteps",
      familyLabel: "footsteps",
      prefix: "safe-footstep-general",
      optionCount,
      recommendedIndex,
      recommendedReason,
      timingFeel,
      negativeConstraints,
      options: [
        {
          title: "Neutral Shoe Step",
          description: "Balanced shoe contact with a compact sole hit and a short readable finish.",
          intensityFeel: "Best for general footsteps when the surface is not specified.",
          soundProfile: "neutral-shoe-step",
        },
        {
          title: "Hard Sole Step",
          description: "Firmer footfall with clearer heel contact and a slightly denser body.",
          intensityFeel: "Use when the steps should feel more assertive without getting boomy.",
          soundProfile: "hard-sole-step",
        },
        {
          title: "Soft Quiet Step",
          description: "Lighter footfall with gentler contact and a more tucked-in release.",
          intensityFeel: "Best when the walk should stay subtle and out of the foreground.",
          soundProfile: "soft-quiet-step",
        },
      ],
    });
  }

  if (
    (/\b(sword|blade|katana|saber)\b/i.test(normalizedPrompt) && /\b(slash|slice|swing|cut)\b/i.test(normalizedPrompt)) ||
    /\bsword slash\b/i.test(normalizedPrompt)
  ) {
    const recommendedIndex =
      /\b(heavy|broad|big|strong)\b/i.test(normalizedPrompt) ? 2 : /\b(close|near|pass|camera)\b/i.test(normalizedPrompt) ? 3 : 1;
    const recommendedReason =
      recommendedIndex === 2
        ? "it gives the blade more air shear and mass without drifting into impact or explosion texture."
        : recommendedIndex === 3
          ? "it keeps the slash close and sharp without leaking in a sci-fi beam bed."
          : "it gives the cleanest steel-through-air read for a sword slash.";
    return createOptionSet({
      family: "sword",
      familyLabel: "sword slash",
      prefix: "safe-sword-slash",
      optionCount,
      recommendedIndex,
      recommendedReason,
      timingFeel,
      negativeConstraints,
      options: [
        {
          title: "Swift Steel Slash",
          description: "Sharp blade whoosh with a clean steel edge tick and a fast air-slice finish.",
          intensityFeel: "Best when the slash should feel quick, clean, and weapon-led.",
          soundProfile: "swift-steel-slash",
        },
        {
          title: "Heavy Blade Shear",
          description: "Broader sword pass with thicker air shear, a stronger steel edge, and more weapon mass.",
          intensityFeel: "Use when the swing should feel heavier without turning into a hit sound.",
          soundProfile: "heavy-blade-shear",
        },
        {
          title: "Close Pass Slice",
          description: "Tighter near-camera slash with brighter air cut and a shorter sharp finish.",
          intensityFeel: "Best when the blade should feel closer and more immediate.",
          soundProfile: "close-pass-slice",
        },
      ],
    });
  }

  if (
    /\b(whoosh|swish|swoosh|air swipe|motion pass|rush past|fast pass)\b/i.test(normalizedPrompt) &&
    !/\b(sword|blade|katana|saber|door|airlock|car|vehicle|engine)\b/i.test(normalizedPrompt)
  ) {
    const recommendedIndex =
      rejectsWhooshTone || /\b(tight|quick|clean)\b/i.test(normalizedPrompt)
        ? 3
        : /\b(broad|big|heavy)\b/i.test(normalizedPrompt)
          ? 2
          : 1;
    const recommendedReason =
      recommendedIndex === 2
        ? "it gives the motion more air mass without turning it into a vehicle sweep or an ambient wind bed."
        : recommendedIndex === 3
          ? "it keeps the motion cut tight and clean instead of overhanging into windy smear."
          : "it gives the clearest movement whoosh with a start, pass peak, and clean release.";
    return createOptionSet({
      family: "whoosh",
      familyLabel: "whoosh",
      prefix: "safe-whoosh",
      optionCount,
      recommendedIndex,
      recommendedReason,
      timingFeel,
      negativeConstraints,
      options: [
        {
          title: "Fast Air Swipe",
          description: "Quick motion onset into a clean air peak and a short directional release.",
          intensityFeel: "Best when the motion should feel fast, readable, and clearly not an ambient wind bed.",
          soundProfile: "fast-air-swipe",
        },
        {
          title: "Broad Swish Pass",
          description: "Wider air sweep with a fuller motion body and a smoother trailing release.",
          intensityFeel: "Use when the move should feel broader and more forceful without becoming a vehicle pass.",
          soundProfile: "broad-swish-pass",
        },
        {
          title: "Tight Motion Cut",
          description: "Lean quick whoosh with a tighter peak and less airy overhang on the release.",
          intensityFeel: "Best when the motion should get in and out fast and leave no fake aftermath smear.",
          soundProfile: "tight-motion-cut",
        },
      ],
    });
  }

  if (/\b(kick|roundhouse|boot hit|boot kick|dropkick|heel kick|soccer kick|knee strike)\b/i.test(normalizedPrompt)) {
    const recommendedIndex =
      /\b(heavy|hard|brutal|big)\b/i.test(normalizedPrompt) ? 2 : /\b(sharp|snap|quick|tight)\b/i.test(normalizedPrompt) ? 3 : 1;
    const recommendedReason =
      recommendedIndex === 2
        ? "it gives the kick more leg-driven weight without collapsing into an explosion-like bloom or a punch clone."
        : recommendedIndex === 3
          ? "it keeps the kick contact sharp and shoe-led instead of a generic body thud."
          : "it gives the cleanest readable kick impact with swing, contact, and follow-through.";
    return createOptionSet({
      family: "kick",
      familyLabel: "kick impact",
      prefix: "safe-kick-impact",
      optionCount,
      recommendedIndex,
      recommendedReason,
      timingFeel,
      negativeConstraints,
      options: [
        {
          title: "Tight Shoe Thump",
          description: "Short leg swing into clear shoe contact, a compact body thump, and a tight readable finish.",
          intensityFeel: "Best for a clean kick that lands fast, clearly, and distinctly from a punch.",
          soundProfile: "tight-shoe-thump",
        },
        {
          title: "Heavy Boot Slam",
          description: "Heavier kick setup into denser boot contact, thicker impact weight, and a firmer follow-through payoff.",
          intensityFeel: "Use when the kick should feel harder and more forceful without turning explosive.",
          soundProfile: "heavy-boot-slam",
        },
        {
          title: "Snap Kick Crack",
          description: "Sharper kick contact with a brisk top snap and a quicker body cutoff after the hit.",
          intensityFeel: "Best when the kick should feel faster, more precise, and still leg-led.",
          soundProfile: "snap-kick-crack",
        },
      ],
    });
  }

  if (
    /\b(punch|fist|body hit|knuckle|smack)\b/i.test(normalizedPrompt) ||
    (/\bimpact\b/i.test(normalizedPrompt) && /\b(punch|body|hit)\b/i.test(normalizedPrompt))
  ) {
    const recommendedIndex =
      /\b(heavy|hard|brutal|massive)\b/i.test(normalizedPrompt) ? 2 : /\b(snap|sharp|quick|tight)\b/i.test(normalizedPrompt) ? 3 : 1;
    const recommendedReason =
      recommendedIndex === 2
        ? "it gives the hit more body and smack without collapsing into an explosion-like low bloom or a kick family."
        : recommendedIndex === 3
          ? "it keeps the contact short and punch-specific instead of a generic thud."
          : "it gives the cleanest punch read with a tiny drive-in, exact contact, and short follow-through.";
    return createOptionSet({
      family: "punch",
      familyLabel: "punch impact",
      prefix: "safe-punch-impact",
      optionCount,
      recommendedIndex,
      recommendedReason,
      timingFeel,
      negativeConstraints,
      options: [
        {
          title: "Tight Body Hit",
          description: "Tiny drive-in into compact punch contact, a short body thump, and a quick readable smack.",
          intensityFeel: "Best for a clear punch impact that lands fast and stays distinct from a kick or explosion.",
          soundProfile: "tight-body-hit",
        },
        {
          title: "Heavy Thump Smack",
          description: "Heavier punch setup into a denser chest hit, thicker smack, and a short weighted follow-through.",
          intensityFeel: "Use when the punch should feel harder and more physical without turning boomy.",
          soundProfile: "heavy-thump-smack",
        },
        {
          title: "Snap Contact Hit",
          description: "Sharper contact snap with a lighter body and a tighter cutoff after the hit.",
          intensityFeel: "Best when the punch should feel quicker, more precise, and tightly frame-locked.",
          soundProfile: "snap-contact-hit",
        },
      ],
    });
  }

  if (/\b(impact|slam|body slam|collision|hard hit|blunt hit|thud)\b/i.test(normalizedPrompt)) {
    const recommendedIndex =
      /\b(heavy|hard|massive|slam)\b/i.test(normalizedPrompt) ? 2 : /\b(tight|short|quick)\b/i.test(normalizedPrompt) ? 3 : 1;
    const recommendedReason =
      recommendedIndex === 2
        ? "it gives the impact more body and weight without turning it into an explosion or creature growl."
        : recommendedIndex === 3
          ? "it keeps the impact compact and readable instead of a broad muddy thump."
          : "it gives the cleanest general-purpose impact profile for animation beats.";
    return createOptionSet({
      family: "impact",
      familyLabel: "impact",
      prefix: "safe-impact",
      optionCount,
      recommendedIndex,
      recommendedReason,
      timingFeel,
      negativeConstraints,
      options: [
        {
          title: "Tight Impact Hit",
          description: "Short blunt hit with a focused body knock and a clean controlled cutoff.",
          intensityFeel: "Best for a neutral impact that should land clearly.",
          soundProfile: "tight-impact-hit",
        },
        {
          title: "Heavy Body Slam",
          description: "Heavier impact with a fuller body drop, thicker weight, and a more forceful contact finish.",
          intensityFeel: "Use when the hit should feel denser and more physical.",
          soundProfile: "heavy-body-slam",
        },
        {
          title: "Short Blunt Thud",
          description: "Compact low-mid hit with less top snap and a quicker heavy thud release.",
          intensityFeel: "Best when the impact should feel tighter and more restrained.",
          soundProfile: "short-blunt-thud",
        },
      ],
    });
  }

  if (/\b(laser|beam|blaster|energy shot|energy blast|plasma)\b/i.test(normalizedPrompt)) {
    const recommendedIndex =
      rejectsBeamTone || /\b(pulse|burst|quick|tight|zap)\b/i.test(normalizedPrompt)
        ? 1
        : /\b(charged|charge|big|heavy)\b/i.test(normalizedPrompt)
          ? 2
          : 3;
    const recommendedReason =
      recommendedIndex === 2
        ? "it gives the shot a stronger energy release without falling back to a low UFO hum."
        : recommendedIndex === 1
          ? "it keeps the laser crisp and shot-focused instead of a vague sci-fi drone."
          : "it gives the blast a cleaner beam tail while staying in the energy family.";
    return createOptionSet({
      family: "laser",
      familyLabel: "laser blast",
      prefix: "safe-laser-blast",
      optionCount,
      recommendedIndex,
      recommendedReason,
      timingFeel,
      negativeConstraints,
      options: [
        {
          title: "Tight Zap Burst",
          description: "Short energy zap with a bright pulse front, clean shot body, and a quick sci-fi cutoff.",
          intensityFeel: "Best for a sharp laser shot that should read instantly.",
          soundProfile: "tight-zap-burst",
        },
        {
          title: "Charged Beam Blast",
          description: "Heavier energy discharge with a brighter charged front and a fuller beam release.",
          intensityFeel: "Use when the laser should feel bigger and more powered-up.",
          soundProfile: "charged-beam-blast",
        },
        {
          title: "Pulse Shot Tail",
          description: "Balanced blast with a controlled pulse core and a cleaner trailing energy finish.",
          intensityFeel: "Best when the laser should keep a little beam tail without drifting into a hum.",
          soundProfile: "pulse-shot-tail",
        },
      ],
    });
  }

  if (
    /\b(race car|racecar|car|vehicle|engine|motor)\b/i.test(normalizedPrompt) &&
    /\b(pass(?:-by)?|passes by|coming and going away|coming and going|toward camera then away|towards camera then away|zooms past|zooms by|approach|approaching|receding|going away|drives toward camera then away|past camera|doppler)\b/i.test(
      normalizedPrompt,
    )
  ) {
    const recommendedIndex =
      /\b(coming and going away|toward camera then away|towards camera then away|approach|approaching|receding|going away|doppler|past camera)\b/i.test(
        normalizedPrompt,
      )
        ? 3
        : /\b(heavy|heavier|engine-rich|engine rich|deeper|more like a real car)\b/i.test(normalizedPrompt)
          ? 2
          : 1;
    const recommendedReason =
      recommendedIndex === 3
        ? "it gives the clearest approach-peak-recede motion, so the pass-by reads like a real vehicle move instead of a distorted sweep."
        : recommendedIndex === 2
          ? "it keeps the pass grounded in engine body and weight instead of sounding thin or arcadey."
          : "it gives the cleanest fast pass without leaking explosion or sci-fi sweep texture.";
    return createOptionSet({
      family: "vehicle-pass",
      familyLabel: "vehicle pass",
      prefix: "safe-race-car-pass",
      optionCount,
      recommendedIndex,
      recommendedReason,
      timingFeel,
      options: [
        {
          title: "Clean Race-Car Pass",
          description: "Fast clean race-car pass with engine rise, a readable pass-by peak, light road-air texture, and a quick receding tail.",
          intensityFeel: "Best when the car should feel fast and sharp without turning harsh or distorted.",
          soundProfile: "clean-race-car-pass",
        },
        {
          title: "Heavy Engine Pass",
          description: "Lower engine-rich vehicle pass with more body, fuller motor weight, and a thicker receding fade after the peak.",
          intensityFeel: "Use when the pass should feel heavier and more like a real car than a thin arcade sweep.",
          soundProfile: "heavy-engine-pass",
        },
        {
          title: "Approach-Then-Recede Pass",
          description: "Longer vehicle approach with a clearer doppler bend, a pass-by peak near camera, and a more obvious receding engine tail.",
          intensityFeel: "Best when the car needs to come in, pass the shot, and keep moving away instead of reading as one short sweep.",
          soundProfile: "approach-then-recede-pass",
        },
      ],
    });
  }

  if (
    /\b(explosion|blast|shockwave|detonation)\b/i.test(normalizedPrompt) &&
    !/\b(distant|distance|far away|background|looks back|behind)\b/i.test(normalizedPrompt)
  ) {
    const rejectsAlienHumExplosion =
      /\b(?:not|no|without|less)\b[^,.!?;]*\b(?:alien(?:\s+abduction)?|ufo|hum|drone|abduction)\b/i.test(
        normalizedPrompt,
      );
    const rejectsDeepRumbleExplosion =
      /\b(?:not|no|without|less)\b[^,.!?;]*\b(?:deep(?:er)?|rumble)\b/i.test(normalizedPrompt);
    const rejectsCrunchyExplosion =
      /\b(?:not|no|without|less)\b[^,.!?;]*\b(?:distort(?:ed|ion)?|arcadey|crunchy|harsh)\b/i.test(
        normalizedPrompt,
      );
    const wantsCleanerExplosion =
      rejectsAlienHumExplosion ||
      rejectsDeepRumbleExplosion ||
      rejectsCrunchyExplosion ||
      /\b(clean|cleaner|less distorted|not crunchy|not arcadey|less harsh|fuller boom|cinematic|professional)\b/i.test(
        normalizedPrompt,
      );
    const heavyExplosionDescription =
      rejectsAlienHumExplosion || rejectsDeepRumbleExplosion
        ? "Heavier one-event blast with a fuller blast body, stronger explosion weight, and a cleaner aftermath tail."
        : "Heavier one-event blast with a deeper body, fuller low-end bloom, and a cleaner rumble tail.";
    const heavyExplosionIntensityFeel =
      rejectsAlienHumExplosion || rejectsDeepRumbleExplosion
        ? "Best if you want the strongest one-event explosion without crunchy arcade fuzz or any hovering tonal drift."
        : "Best if you want a deeper heavier explosion without crunchy arcade fuzz.";
    const stagedExplosionDescription =
      rejectsAlienHumExplosion || rejectsDeepRumbleExplosion
        ? "Short pressure-boom setup that breathes for a moment, then lands a bigger real explosion body with a cleaner grounded aftermath."
        : "Short pressure-boom setup that breathes for a moment, then lands a bigger real explosion body with a satisfying tail.";
    const recommendedIndex = rejectsAlienHumExplosion || rejectsDeepRumbleExplosion ? 2 : wantsCleanerExplosion ? 3 : 2;
    return createOptionSet({
      family: "explosion",
      familyLabel: "explosion",
      prefix: "safe-clean-explosion",
      optionCount,
      recommendedIndex,
      recommendedReason:
        rejectsAlienHumExplosion || rejectsDeepRumbleExplosion
          ? "it keeps the explosion in a real pressure-blast-aftermath shape instead of drifting toward hum, UFO, or deep-rumble nonsense."
          : wantsCleanerExplosion
            ? "it keeps the pre-boom setup, then pays off with the cleanest full detonation and controlled aftermath."
            : "it gives the strongest balance of pressure, blast body, and readable aftermath without turning messy.",
      timingFeel,
      negativeConstraints,
      options: [
        {
          title: "Tighter Anime Pop",
          description: "Fast pressure front into a compact anime blast, a small real boom body, and a short clean aftermath tail.",
          intensityFeel: "Good when the explosion should feel punchy and quick but still land as a full event.",
          soundProfile: "tight-anime-pop",
        },
        {
          title: "Heavy Clean Blast",
          description: heavyExplosionDescription,
          intensityFeel: heavyExplosionIntensityFeel,
          soundProfile: "heavy-clean-blast",
        },
        {
          title: "Staged Pre-Boom Detonation",
          description: stagedExplosionDescription,
          intensityFeel: "Best for a staged detonation where the setup, blast peak, and aftermath all read clearly.",
          soundProfile: "staged-preboom-detonation",
        },
      ],
    });
  }

  if (/\b(rumble|background event|far away)\b/i.test(normalizedPrompt) && !/\b(explosion|blast|bone|fracture)\b/i.test(normalizedPrompt)) {
    return createOptionSet({
      family: "background-rumble",
      familyLabel: "background rumble",
      prefix: "safe-background-rumble",
      optionCount,
      recommendedIndex: isDistant ? 1 : 2,
      recommendedReason: isDistant
        ? "it keeps the background event broad and restrained instead of sounding like a direct impact."
        : "it gives the background event clear size without becoming harsh.",
      timingFeel,
      options: [
        {
          title: "Restrained Background Rumble",
          description: "Low soft rumble with roomy background scale and no aggressive front edge.",
          intensityFeel: "Best for distant danger or off-screen activity.",
          soundProfile: "restrained-background-rumble",
        },
        {
          title: "Broader Low Event",
          description: "Wider low event with a little more movement and a fuller distant body.",
          intensityFeel: "Use when the background event should feel larger but still behind the shot.",
          soundProfile: "broader-low-event",
        },
        {
          title: "Subtle Rear-Field Swell",
          description: "Gentle low swell with restrained texture and a quieter distant finish.",
          intensityFeel: "Good when the event should feel present without pulling focus.",
          soundProfile: "subtle-rear-field-swell",
        },
      ],
    });
  }

  if (/\bportal\b/i.test(normalizedPrompt)) {
    return createOptionSet({
      family: "portal",
      familyLabel: "portal",
      prefix: "safe-portal",
      optionCount,
      recommendedIndex: 1,
      recommendedReason: "it stays readable and controlled for quick portal comparison.",
      timingFeel,
      options: [
        {
          title: "Cold Portal Open",
          description: "Cold swell with a tight shimmer and a clean open accent.",
          intensityFeel: "Darker or brighter depending on the portal mood.",
          soundProfile: "cold-portal-open",
        },
        {
          title: "Glitch Portal Tear",
          description: "Short digital rip with unstable crackle and a warped bloom.",
          intensityFeel: "Best for a broken or hostile portal read.",
          soundProfile: "glitch-portal-tear",
        },
        {
          title: "Soft Magic Portal",
          description: "Soft magical bloom with a light shimmer and airy tail.",
          intensityFeel: "Use when the portal should feel gentler and more wonder-driven.",
          soundProfile: "soft-magic-portal",
        },
      ],
    });
  }

  if (lockedFamily != null && lockedFamily !== "generic" && lockedFamily !== "background-rumble") {
    const lockedOptionSet = createLockedFamilyRescueOptionSet({
      lockedFamily,
      optionCount,
      timingFeel,
      requestedDurationSeconds,
      negativeConstraints,
    });
    if (lockedOptionSet) {
      return lockedOptionSet;
    }
  }

  return createOptionSet({
    family: "generic",
    familyLabel: "generic cue",
    prefix: "safe-sound",
    optionCount,
    recommendedIndex: 1,
    recommendedReason: "it stays neutral and readable instead of forcing an unrelated rumble, UFO hum, or creature-like growl.",
    fallbackUsed: true,
    fallbackReason: "No strong canonical sound family matched, so a neutral non-rumble fallback set was used.",
    timingFeel,
    negativeConstraints,
    options: [
      {
        title: "Primary Cue",
        description: "Focused effect with a controlled start, readable core texture, and quick finish.",
        intensityFeel: "Tighten or brighten it depending on the beat weight.",
        soundProfile: "primary-cue",
      },
      {
        title: "Sharper Variant",
        description: "Same cue family with a cleaner front edge and a slightly quicker release.",
        intensityFeel: "Use if the cue needs to stay crisp and get out fast.",
        soundProfile: "sharper-variant",
      },
      {
        title: "Softer Variant",
        description: "Same cue family with a gentler attack and more restrained finish.",
        intensityFeel: "Use if the moment should stay subtle and tucked in.",
        soundProfile: "softer-variant",
      },
      {
        title: "Darker Variant",
        description: "Same cue family with a darker tonal center and less bright edge.",
        intensityFeel: "Use if the moment should feel moodier without turning into a low drone.",
        soundProfile: "darker-variant",
      },
    ],
  });
};
