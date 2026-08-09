import type { DrawingAiSoundFamily, DrawingAiSoundOption } from "./drawingAiContract";
import { isSoundGenerationEnabled, SOUND_GENERATION_DISABLED_MESSAGE } from "./drawingSoundAvailability";

type ExplosionProfile = "tight-anime-pop" | "heavy-clean-blast" | "staged-preboom-detonation";

type SoundRecipeKind =
  | "voice-placeholder"
  | "bone-crack"
  | "twig-snap"
  | "wood-crack"
  | "cartoon-boing"
  | "rubber-bounce"
  | "springy-bounce"
  | "race-car-pass"
  | "heavy-engine-pass"
  | "engine-approach-pass"
  | "distant-track-pass"
  | "door-creak"
  | "hinge-creak"
  | "wood-strain"
  | "sci-fi-door"
  | "lightning-strike"
  | "electricity"
  | "volcano-eruption"
  | "pebble-water"
  | "water"
  | "fire"
  | "footstep"
  | "rain"
  | "wind"
  | "rustle"
  | "crash"
  | "creak"
  | "rumble"
  | "room-tone"
  | "ui-beep"
  | "button-click"
  | "zipper"
  | "impact"
  | "explosion"
  | "whoosh"
  | "magic"
  | "ambience"
  | "creature"
  | "robot"
  | "beam"
  | "alarm"
  | "engine"
  | "glass"
  | "generic";

type SoundRecipe = {
  kind: SoundRecipeKind;
  durationSeconds: number;
  intensity: number;
  reverb: number;
  cleanBias?: number;
  explosionProfile?: ExplosionProfile;
  variant?: string;
};

const SAMPLE_RATE = 22050;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const hashString = (value: string) => {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
};

const mulberry32 = (seed: number) => {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

export const isVoiceLikeSoundOption = (option: DrawingAiSoundOption) => {
  if (option.contentType === "voice-placeholder") {
    return true;
  }

  const combined = `${option.title} ${option.description} ${option.timingFeel ?? ""} ${option.intensityFeel ?? ""} ${option.speechText ?? ""}`.toLowerCase();
  return /\b(voice|speech|dialogue|spoken|voice line|say(?:ing)?|line reading)\b/.test(combined);
};

const NEGATED_SOUND_CUE_PATTERN =
  /\b(?:not|no|without|less|rather than|instead of)\b[^,.!?;]*\b(?:alien(?:\s+abduction)?|ufo|hum|drone|abduction|deep(?:er)?|rumble|distort(?:ed|ion)?|arcadey|crunchy|harsh|sci-fi|scifi|beam|whoosh|vehicle|car|engine|static|noise|robot(?:ic)?|creepy|scary|spooky|growl|monster)\b[^,.!?;]*/gi;

const stripNegatedSoundCues = (value: string) =>
  value
    .replace(NEGATED_SOUND_CUE_PATTERN, " ")
    .replace(/\s+/g, " ")
    .trim();

const getNegativeConstraintPromptText = (option: DrawingAiSoundOption) =>
  Array.isArray(option.negativeConstraints) && option.negativeConstraints.length > 0
    ? option.negativeConstraints.map((constraint) => `not ${constraint}`).join(" ")
    : "";

const DURATION_WORD_TO_SECONDS: Record<string, number> = {
  half: 0.5,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
};

const parseDurationToken = (token: string | undefined) => {
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

const inferRequestedDurationSecondsFromText = (value: string) => {
  const betweenMatch = value.match(
    /\bbetween\s+(\d+(?:\.\d+)?|half|one|two|three|four|five|six)\s+(?:and|to)\s+(\d+(?:\.\d+)?|half|one|two|three|four|five|six)\s+seconds?\b/i,
  );
  if (betweenMatch) {
    const low = parseDurationToken(betweenMatch[1]);
    const high = parseDurationToken(betweenMatch[2]);
    if (low != null && high != null) {
      return (low + high) / 2;
    }
  }

  const rangeMatch = value.match(
    /\b(\d+(?:\.\d+)?|half|one|two|three|four|five|six)\s*(?:to|-)\s*(\d+(?:\.\d+)?|half|one|two|three|four|five|six)\s+seconds?\b/i,
  );
  if (rangeMatch) {
    const low = parseDurationToken(rangeMatch[1]);
    const high = parseDurationToken(rangeMatch[2]);
    if (low != null && high != null) {
      return (low + high) / 2;
    }
  }

  const singleMatch = value.match(
    /\b(?:for|around|about|roughly)?\s*(\d+(?:\.\d+)?|half|one|two|three|four|five|six)\s+seconds?\b/i,
  );
  if (singleMatch) {
    return parseDurationToken(singleMatch[1]);
  }

  return null;
};

const resolveRecipeDurationSeconds = ({
  option,
  rawCombined,
  fallbackDurationSeconds,
  minDurationSeconds,
  maxDurationSeconds,
}: {
  option: DrawingAiSoundOption;
  rawCombined: string;
  fallbackDurationSeconds: number;
  minDurationSeconds: number;
  maxDurationSeconds: number;
}) => {
  const requestedDurationSeconds =
    typeof option.durationSeconds === "number" && Number.isFinite(option.durationSeconds) && option.durationSeconds > 0
      ? option.durationSeconds
      : inferRequestedDurationSecondsFromText(rawCombined);

  return clamp(requestedDurationSeconds ?? fallbackDurationSeconds, minDurationSeconds, maxDurationSeconds);
};

const NON_GENERIC_FAMILY_SET = new Set<DrawingAiSoundFamily>([
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
  "portal",
]);

const ALLOWS_SHARED_LOW_GROWL_PATTERN =
  /\b(?:alien|ufo|hum|drone|deep(?:[-\s]+growl)?|growl(?:ing)?\s+hum|low[-\s]+rumble)\b/i;

const explicitlyRejectsSharedLowGrowl = (rawCombined: string) =>
  /\b(?:not|no|without|less|rather than|instead of|avoid)\b[^,.!?;]*\b(?:alien(?:\s+abduction)?|ufo|hum|drone|abduction|deep(?:er)?|rumble|growl|monster)\b/i.test(
    rawCombined,
  );

const canUseSharedLowGrowlTone = (option: DrawingAiSoundOption, rawCombined: string) => {
  if (option.soundFamily === "background-rumble") {
    return true;
  }

  return ALLOWS_SHARED_LOW_GROWL_PATTERN.test(rawCombined) && !explicitlyRejectsSharedLowGrowl(rawCombined);
};

const getFamilySafeFallbackProfile = (family: DrawingAiSoundFamily, rawCombined: string) => {
  switch (family) {
    case "explosion":
      return /\b(pre[- ]?boom|pre boom|two[- ]stage|staged)\b/i.test(rawCombined)
        ? "staged-preboom-detonation"
        : "heavy-clean-blast";
    case "punch":
      return /\b(heavy|hard|brutal)\b/i.test(rawCombined) ? "heavy-thump-smack" : "tight-body-hit";
    case "kick":
      return /\b(heavy|hard|brutal)\b/i.test(rawCombined) ? "heavy-boot-slam" : "tight-shoe-thump";
    case "impact":
      return /\b(fall|falling|drop|landing)\b/i.test(rawCombined) ? "fall-then-impact" : "tight-impact-hit";
    case "rain":
      return /\b(fight|battle|combat|storm)\b/i.test(rawCombined)
        ? "storm-fight-rain"
        : /\b(window|glass|pane)\b/i.test(rawCombined)
          ? "window-rain-texture"
          : /\b(heavy|downpour|storm)\b/i.test(rawCombined)
            ? "storm-rain-sheet"
            : "light-rain-bed";
    case "wind":
      return /\b(gust|sharp|pass)\b/i.test(rawCombined) ? "sharper-gust-pass" : "soft-back-wind";
    case "footsteps":
      return /\b(giant|massive|huge|heavy|stomp)\b/i.test(rawCombined)
        ? "giant-ground-stomp"
        : "neutral-shoe-step";
    case "thunder":
      return /\b(rolling|tail|aftershock)\b/i.test(rawCombined) ? "rolling-storm-tail" : "flash-crack-strike";
    case "volcano":
      return /\b(ash|plume|rollout)\b/i.test(rawCombined) ? "ash-plume-rollout" : "pressure-vent-burst";
    case "water":
      return /\b(heavy|big|plunge|crash)\b/i.test(rawCombined) ? "heavy-plunge-splash" : "clean-water-splash";
    case "fire":
      return /\b(crackle|torch|smaller)\b/i.test(rawCombined) ? "crackling-fire-pop" : "flame-burst-whoomph";
    case "sword":
      return "swift-steel-slash";
    case "laser":
      return /\b(charged|charge|big|heavy)\b/i.test(rawCombined) ? "charged-beam-blast" : "tight-zap-burst";
    case "energy":
      return /\b(burst|shot|blast)\b/i.test(rawCombined) ? "charged-energy-burst" : "focused-energy-beam";
    case "magic":
      return /\b(charge|build|swell)\b/i.test(rawCombined) ? "rune-energy-bloom" : "arcane-burst-flare";
    case "door":
      return /\b(old|wood|heavy|groan)\b/i.test(rawCombined) ? "heavy-old-wood-groan" : "dry-hinge-creak";
    case "door-sci-fi":
      return /\b(mist|smoke|hiss)\b/i.test(rawCombined) ? "misty-airlock-open" : "clean-pressure-door-slide";
    case "debris":
      return /\b(collapse|roll)\b/i.test(rawCombined) ? "dusty-collapse-roll" : "hard-debris-crash";
    case "branch-snap":
      return "dry-twig-snap";
    case "vehicle-pass":
      return /\b(approach|recede|doppler)\b/i.test(rawCombined) ? "approach-then-recede-pass" : "clean-race-car-pass";
    case "pebble-water":
      return "pebble-water-plip";
    case "creature":
      return /\b(chasing|chase|running|run|pursuit|stomp)\b/i.test(rawCombined)
        ? "giant-chase-stomp"
        : "predator-roar-break";
    case "bone-break":
      return "compound-fracture-sequence";
    case "cartoon-bounce":
      return "clean-cartoon-boing";
    case "ui-beep":
      return "cleaner-muted-menu-pulse";
    case "zipper":
      return /\b(slow|careful|quiet)\b/i.test(rawCombined)
        ? "slow-jacket-unzip"
        : /\b(close|close-up|detail|clean)\b/i.test(rawCombined)
          ? "close-detail-zip-click"
          : "metal-tooth-zip";
    case "whoosh":
      return "fast-air-swipe";
    case "electricity":
      return "arc-crack-snap";
    case "rustle":
      return "soft-leaf-crunch";
    case "portal":
      return "soft-magic-portal";
    default:
      return null;
  }
};

const inferExplicitSoundRecipe = ({
  option,
  combined,
  rawCombined,
  shapedIntensity,
  shapedReverb,
  isDistant,
}: {
  option: DrawingAiSoundOption;
  combined: string;
  rawCombined: string;
  shapedIntensity: number;
  shapedReverb: number;
  isDistant: boolean;
}): SoundRecipe | null => {
  const family = option.soundFamily as DrawingAiSoundFamily | null | undefined;
  const profile = option.soundProfile ?? "";
  if (!family) {
    return null;
  }

  if (family === "bone-break") {
    const variant =
      profile === "compound-fracture-sequence"
        ? "compound-fracture-sequence"
        : profile === "twisting-fracture-runout"
          ? "twisting-fracture-runout"
          : profile === "brittle-snap-aftershock"
            ? "brittle-snap-aftershock"
            : profile === "nasty-fracture-crack"
              ? "nasty-fracture"
              : profile === "brittle-bone-break"
                ? "brittle-crack"
                : "dry-snap";
    const fallbackDurationSeconds =
      variant === "twisting-fracture-runout"
        ? 2.26
        : variant === "compound-fracture-sequence"
          ? 2.04
          : variant === "brittle-snap-aftershock"
            ? 1.82
            : variant === "nasty-fracture"
              ? 0.2
              : variant === "brittle-crack"
                ? 0.16
                : 0.15;
    return {
      kind: "bone-crack",
      durationSeconds: resolveRecipeDurationSeconds({
        option,
        rawCombined,
        fallbackDurationSeconds,
        minDurationSeconds: 0.14,
        maxDurationSeconds: 3.2,
      }),
      intensity: clamp(
        shapedIntensity *
          (variant === "twisting-fracture-runout"
            ? 0.74
            : variant === "compound-fracture-sequence"
              ? 0.7
              : variant === "brittle-snap-aftershock"
                ? 0.64
                : variant === "nasty-fracture"
                  ? 0.72
                  : variant === "brittle-crack"
                    ? 0.62
                    : 0.58),
        0.22,
        0.8,
      ),
      reverb:
        /\b(tail|reverb|echo)\b/.test(combined) || variant.includes("aftershock") || variant.includes("runout") || variant.includes("sequence")
          ? 0.04
          : 0.02,
      cleanBias:
        variant === "twisting-fracture-runout"
          ? 0.72
          : variant === "compound-fracture-sequence"
            ? 0.82
            : variant === "brittle-snap-aftershock"
              ? 0.9
              : variant === "nasty-fracture"
                ? 0.68
                : variant === "brittle-crack"
                  ? 0.92
                  : 0.86,
      variant,
    };
  }

  if (family === "cartoon-bounce") {
    const kind =
      profile === "rubbery-bounce" ? "rubber-bounce" : profile === "springy-toon-pop" ? "springy-bounce" : "cartoon-boing";
    return {
      kind,
      durationSeconds: kind === "cartoon-boing" ? 0.28 : kind === "rubber-bounce" ? 0.32 : 0.3,
      intensity: clamp(shapedIntensity * 0.6, 0.18, 0.62),
      reverb: 0.03,
      cleanBias: 0.94,
      variant: profile,
    };
  }

  if (family === "ui-beep") {
    return {
      kind: profile === "brighter-ui-click-beep" ? "button-click" : "ui-beep",
      durationSeconds:
        profile === "cleaner-muted-menu-pulse" ? 0.14 : profile === "soft-confirm-beep" ? 0.12 : 0.16,
      intensity: clamp(shapedIntensity * (profile === "soft-confirm-beep" ? 0.62 : 0.72), 0.2, 0.62),
      reverb: 0.02,
      cleanBias: 0.94,
      variant:
        profile === "cleaner-muted-menu-pulse"
          ? "menu-chirp"
          : profile === "brighter-ui-click-beep"
            ? "click-beep"
            : "confirm",
    };
  }

  if (family === "zipper") {
    return {
      kind: "zipper",
      durationSeconds: resolveRecipeDurationSeconds({
        option,
        rawCombined,
        fallbackDurationSeconds:
          profile === "slow-jacket-unzip" ? 0.74 : profile === "close-detail-zip-click" ? 0.34 : 0.42,
        minDurationSeconds: 0.18,
        maxDurationSeconds: 2.2,
      }),
      intensity: clamp(
        shapedIntensity *
          (profile === "slow-jacket-unzip" ? 0.48 : profile === "close-detail-zip-click" ? 0.42 : 0.52),
        0.16,
        0.62,
      ),
      reverb: clamp(shapedReverb + (profile === "close-detail-zip-click" ? 0.01 : 0.02), 0.04, 0.18),
      cleanBias: profile === "close-detail-zip-click" ? 0.94 : 0.9,
      variant: profile,
    };
  }

  if (family === "thunder") {
    const variant =
      profile === "rolling-storm-tail" ? "rolling-tail" : profile === "heavy-thunder-strike" ? "storm-body" : "flash-crack";
    return {
      kind: "lightning-strike",
      durationSeconds: resolveRecipeDurationSeconds({
        option,
        rawCombined,
        fallbackDurationSeconds: variant === "rolling-tail" ? 1.08 : variant === "storm-body" ? 0.94 : 0.62,
        minDurationSeconds: 0.42,
        maxDurationSeconds: 3.4,
      }),
      intensity: clamp(shapedIntensity * (variant === "flash-crack" ? 0.76 : 0.84), 0.28, 0.9),
      reverb: clamp(shapedReverb + 0.08, 0.14, 0.42),
      cleanBias: /\b(clean|cleaner|controlled|less distorted)\b/.test(combined) ? 0.9 : 0.78,
      variant,
    };
  }

  if (family === "electricity") {
    return {
      kind: "electricity",
      durationSeconds: profile === "clean-current-tail" ? 0.56 : profile === "power-surge-body" ? 0.54 : 0.34,
      intensity: clamp(shapedIntensity * (profile === "power-surge-body" ? 0.76 : 0.72), 0.24, 0.78),
      reverb: clamp(shapedReverb + 0.04, 0.08, 0.28),
      cleanBias: profile === "clean-current-tail" ? 0.88 : 0.72,
      variant: profile === "arc-crack-snap" ? "arc" : profile === "power-surge-body" ? "power" : "clean",
    };
  }

  if (family === "magic") {
    return {
      kind: "magic",
      durationSeconds:
        profile === "rune-energy-bloom" ? 0.86 : profile === "arcane-burst-flare" ? 0.62 : 0.46,
      intensity: clamp(shapedIntensity * (profile === "arcane-burst-flare" ? 0.78 : 0.68), 0.22, 0.84),
      reverb: clamp(shapedReverb + 0.08, 0.12, 0.34),
      cleanBias: 0.92,
      variant: profile,
    };
  }

  if (family === "energy") {
    return {
      kind: "beam",
      durationSeconds:
        profile === "pulse-wave-release" ? 0.72 : profile === "charged-energy-burst" ? 0.58 : 0.64,
      intensity: clamp(shapedIntensity * (profile === "charged-energy-burst" ? 0.8 : 0.7), 0.24, 0.86),
      reverb: clamp(shapedReverb + (profile === "pulse-wave-release" ? 0.08 : 0.04), 0.1, 0.28),
      cleanBias: 0.92,
      variant: profile,
    };
  }

  if (family === "volcano") {
    return {
      kind: "volcano-eruption",
      durationSeconds: resolveRecipeDurationSeconds({
        option,
        rawCombined,
        fallbackDurationSeconds:
          profile === "pressure-vent-burst" ? (isDistant ? 1.02 : 0.9) : profile === "ash-plume-rollout" ? (isDistant ? 1.5 : 1.28) : isDistant ? 1.42 : 1.16,
        minDurationSeconds: 0.84,
        maxDurationSeconds: 4.2,
      }),
      intensity: clamp(shapedIntensity * (profile === "pressure-vent-burst" ? 0.72 : profile === "ash-plume-rollout" ? 0.68 : 0.82), 0.28, 0.84),
      reverb: clamp(shapedReverb + (profile === "ash-plume-rollout" ? 0.12 : 0.08), 0.14, 0.42),
      cleanBias: profile === "ash-plume-rollout" ? 0.88 : 0.82,
      variant: profile,
    };
  }

  if (family === "pebble-water") {
    return {
      kind: "pebble-water",
      durationSeconds: profile === "quiet-ripple-drop" ? 0.3 : profile === "pebble-splash-accent" ? 0.28 : 0.24,
      intensity: clamp(shapedIntensity * 0.48, 0.16, 0.46),
      reverb: clamp(shapedReverb + 0.06, 0.1, 0.28),
      cleanBias: 0.92,
      variant: profile === "pebble-splash-accent" ? "splash" : profile === "quiet-ripple-drop" ? "quiet" : "plip",
    };
  }

  if (family === "water") {
    return {
      kind: "water",
      durationSeconds: resolveRecipeDurationSeconds({
        option,
        rawCombined,
        fallbackDurationSeconds: profile === "heavy-plunge-splash" ? 0.78 : profile === "spray-surface-slap" ? 0.42 : 0.56,
        minDurationSeconds: 0.24,
        maxDurationSeconds: 2.8,
      }),
      intensity: clamp(shapedIntensity * (profile === "heavy-plunge-splash" ? 0.76 : 0.62), 0.18, 0.82),
      reverb: clamp(shapedReverb + 0.08, 0.1, 0.28),
      cleanBias: 0.92,
      variant: profile,
    };
  }

  if (family === "fire") {
    return {
      kind: "fire",
      durationSeconds:
        profile === "hot-flare-roar" ? 0.92 : profile === "crackling-fire-pop" ? 0.38 : 0.62,
      intensity: clamp(shapedIntensity * (profile === "hot-flare-roar" ? 0.78 : 0.68), 0.2, 0.84),
      reverb: clamp(shapedReverb + 0.04, 0.08, 0.24),
      cleanBias: 0.9,
      variant: profile,
    };
  }

  if (family === "creature") {
    return {
      kind: "creature",
      durationSeconds: resolveRecipeDurationSeconds({
        option,
        rawCombined,
        fallbackDurationSeconds:
          profile === "giant-chase-stomp" ? 1.62 : profile === "ground-pound-pursuit" ? 1.4 : 1.08,
        minDurationSeconds: 0.52,
        maxDurationSeconds: 4.2,
      }),
      intensity: clamp(
        shapedIntensity * (profile === "giant-chase-stomp" ? 0.82 : profile === "ground-pound-pursuit" ? 0.78 : 0.72),
        0.24,
        0.9,
      ),
      reverb: clamp(shapedReverb + (profile === "predator-roar-break" ? 0.08 : 0.06), 0.12, 0.42),
      cleanBias: 0.86,
      variant: profile,
    };
  }

  if (family === "footsteps") {
    return {
      kind: "footstep",
      durationSeconds: resolveRecipeDurationSeconds({
        option,
        rawCombined,
        fallbackDurationSeconds:
          profile === "giant-ground-stomp"
            ? 0.48
            : profile === "heavy-chase-footfalls"
              ? 0.56
              : profile === "weighted-titan-step"
                ? 0.42
                : profile === "background-pursuit-step" || profile === "distant-creepy-step"
                  ? 0.28
                  : profile === "soft-quiet-step"
                    ? 0.2
                    : 0.22,
        minDurationSeconds: 0.14,
        maxDurationSeconds: 1.2,
      }),
      intensity: clamp(
        shapedIntensity *
          (profile === "giant-ground-stomp"
            ? 0.78
            : profile === "heavy-chase-footfalls"
              ? 0.74
              : profile === "weighted-titan-step"
                ? 0.68
                : profile === "distant-creepy-step"
                  ? 0.44
                  : profile === "soft-quiet-step"
                    ? 0.48
                    : 0.58),
        0.16,
        0.82,
      ),
      reverb: clamp(shapedReverb + (profile === "distant-creepy-step" ? 0.08 : 0.02), 0.06, 0.24),
      cleanBias: 0.88,
      variant:
        profile === "stone-brick-step"
          ? "stone"
          : profile === "concrete-floor-step"
            ? "concrete"
            : profile === "giant-ground-stomp"
              ? "giant-ground-stomp"
              : profile === "heavy-chase-footfalls"
                ? "heavy-chase-footfalls"
                : profile === "weighted-titan-step"
                  ? "weighted-titan-step"
              : profile === "soft-quiet-step"
                ? "soft-quiet"
                : profile === "sneak-crunch"
                ? "sneak"
                : profile === "distant-creepy-step" || profile === "background-pursuit-step"
                  ? "distant"
                  : "hard-floor",
    };
  }

  if (family === "rain") {
    const variant =
      profile === "storm-rain-sheet"
        ? "storm-sheet"
        : profile === "window-rain-texture"
          ? "window"
          : profile === "storm-fight-rain"
            ? "storm-fight-rain"
            : profile === "heavy-rain-brawl"
              ? "heavy-rain-brawl"
              : profile === "thunder-rain-clash"
                ? "thunder-rain-clash"
                : "light-bed";
    return {
      kind: "rain",
      durationSeconds: resolveRecipeDurationSeconds({
        option,
        rawCombined,
        fallbackDurationSeconds:
          variant === "storm-sheet"
            ? isDistant
              ? 1.54
              : 1.24
            : variant === "window"
              ? isDistant
                ? 1.42
                : 1.2
              : variant === "storm-fight-rain"
                ? 1.52
                : variant === "heavy-rain-brawl"
                  ? 1.64
                  : variant === "thunder-rain-clash"
                    ? 1.72
                    : isDistant
                      ? 1.38
                      : 1.14,
        minDurationSeconds: 0.8,
        maxDurationSeconds: 4.5,
      }),
      intensity: clamp(
        shapedIntensity *
          (variant === "storm-sheet"
            ? 0.58
            : variant === "window"
              ? 0.5
              : variant === "storm-fight-rain"
                ? 0.64
                : variant === "heavy-rain-brawl"
                  ? 0.68
                  : variant === "thunder-rain-clash"
                    ? 0.66
                    : 0.62),
        0.18,
        0.72,
      ),
      reverb: clamp(shapedReverb + 0.08, 0.14, 0.34),
      cleanBias: variant === "window" ? 0.92 : 0.9,
      variant,
    };
  }

  if (family === "wind") {
    return {
      kind: "wind",
      durationSeconds: resolveRecipeDurationSeconds({
        option,
        rawCombined,
        fallbackDurationSeconds: isDistant ? 1.5 : 1.05,
        minDurationSeconds: 0.8,
        maxDurationSeconds: 4.5,
      }),
      intensity: clamp(shapedIntensity * (profile === "moodier-low-wind" ? 0.68 : profile === "sharper-gust-pass" ? 0.62 : 0.58), 0.18, 0.56),
      reverb: clamp(shapedReverb + 0.06, 0.14, 0.38),
      cleanBias: 0.88,
      variant: profile === "sharper-gust-pass" ? "gust-pass" : profile === "moodier-low-wind" ? "full-pass" : "soft-bed",
    };
  }

  if (family === "rustle") {
    return {
      kind: "rustle",
      durationSeconds: isDistant ? 0.74 : 0.44,
      intensity: clamp(shapedIntensity * 0.72, 0.2, 0.62),
      reverb: clamp(shapedReverb + 0.02, 0.08, 0.34),
      cleanBias: 0.86,
      variant:
        profile === "background-debris-rustle" ? "debris" : /\bcloth|fabric|cape|coat\b/.test(rawCombined) ? "cloth" : "leaves",
    };
  }

  if (family === "debris") {
    return {
      kind: "crash",
      durationSeconds:
        profile === "dusty-collapse-roll" ? (isDistant ? 1.02 : 0.88) : profile === "rubble-scatter-drop" ? 0.62 : 0.74,
      intensity: clamp(shapedIntensity * (profile === "hard-debris-crash" ? 0.82 : 0.68), 0.22, 0.84),
      reverb: clamp(shapedReverb + (profile === "dusty-collapse-roll" ? 0.08 : 0.04), 0.08, 0.28),
      cleanBias: 0.84,
      variant: profile,
    };
  }

  if (family === "branch-snap") {
    return {
      kind: "twig-snap",
      durationSeconds: profile === "far-snap-behind" ? 0.26 : profile === "branch-crack-accent" ? 0.2 : 0.18,
      intensity: clamp(shapedIntensity * (profile === "far-snap-behind" ? 0.52 : 0.6), 0.18, 0.56),
      reverb: clamp(shapedReverb + (profile === "far-snap-behind" ? 0.06 : 0.02), 0.04, 0.18),
      cleanBias: 0.88,
      variant: profile === "far-snap-behind" ? "distant" : profile === "branch-crack-accent" ? "branch" : "dry",
    };
  }

  if (family === "door") {
    if (profile === "dry-hinge-creak") {
      return {
        kind: "hinge-creak",
        durationSeconds: 0.76,
        intensity: clamp(shapedIntensity * 0.58, 0.18, 0.54),
        reverb: clamp(shapedReverb + 0.04, 0.1, 0.34),
        cleanBias: 0.88,
        variant: "dry-hinge",
      };
    }

    if (profile === "heavy-old-wood-groan") {
      return {
        kind: "wood-strain",
        durationSeconds: 1.1,
        intensity: clamp(shapedIntensity * 0.68, 0.22, 0.64),
        reverb: clamp(shapedReverb + 0.06, 0.12, 0.36),
        cleanBias: 0.82,
        variant: "heavy-old-wood",
      };
    }

    return {
      kind: "door-creak",
      durationSeconds: 1.02,
      intensity: clamp(shapedIntensity * 0.56, 0.18, 0.56),
      reverb: clamp(shapedReverb + 0.08, 0.12, 0.38),
      cleanBias: 0.9,
      variant: "thin-hallway",
    };
  }

  if (family === "door-sci-fi") {
    return {
      kind: "sci-fi-door",
      durationSeconds: profile === "mechanical-sci-fi-door" ? 0.82 : 0.92,
      intensity: clamp(shapedIntensity * (profile === "mechanical-sci-fi-door" ? 0.58 : 0.52), 0.18, 0.58),
      reverb: clamp(shapedReverb + 0.08, 0.1, 0.34),
      cleanBias: 0.9,
      variant: profile === "misty-airlock-open" ? "misty" : "mechanical",
    };
  }

  if (family === "explosion") {
    const rejectsHumLikeTone =
      /\b(?:not|no|without|less|rather than|instead of)\b[^,.!?;]*\b(?:alien(?:\s+abduction)?|ufo|hum|drone|abduction|deep(?:er)?|rumble)\b/i.test(
        rawCombined,
      );
    const explosionProfile: ExplosionProfile =
      profile === "staged-preboom-detonation"
        ? "staged-preboom-detonation"
        : profile === "heavy-clean-blast"
          ? "heavy-clean-blast"
          : "tight-anime-pop";
    return {
      kind: "explosion",
      durationSeconds: resolveRecipeDurationSeconds({
        option,
        rawCombined,
        fallbackDurationSeconds:
          isDistant
            ? 1.05
            : explosionProfile === "staged-preboom-detonation"
              ? 1.28
              : explosionProfile === "heavy-clean-blast"
                ? 1.16
                : 0.86,
        minDurationSeconds: 0.46,
        maxDurationSeconds: 3.6,
      }),
      intensity: shapedIntensity,
      reverb: shapedReverb,
      cleanBias: rejectsHumLikeTone ? 0.94 : explosionProfile === "heavy-clean-blast" ? 0.74 : 0.88,
      explosionProfile,
    };
  }

  if (family === "sword") {
    return {
      kind: "whoosh",
      durationSeconds: resolveRecipeDurationSeconds({
        option,
        rawCombined,
        fallbackDurationSeconds: profile === "heavy-blade-shear" ? 0.44 : profile === "close-pass-slice" ? 0.28 : 0.34,
        minDurationSeconds: 0.18,
        maxDurationSeconds: 1.2,
      }),
      intensity: clamp(shapedIntensity * (profile === "heavy-blade-shear" ? 0.76 : 0.68), 0.18, 0.78),
      reverb: clamp(shapedReverb + (profile === "close-pass-slice" ? 0.02 : 0.04), 0.08, 0.24),
      cleanBias: 0.92,
      variant: profile,
    };
  }

  if (family === "whoosh") {
    return {
      kind: "whoosh",
      durationSeconds: profile === "broad-swish-pass" ? 0.52 : profile === "tight-motion-cut" ? 0.24 : 0.34,
      intensity: clamp(shapedIntensity * (profile === "broad-swish-pass" ? 0.74 : 0.62), 0.18, 0.78),
      reverb: clamp(shapedReverb + (profile === "broad-swish-pass" ? 0.06 : 0.02), 0.06, 0.22),
      cleanBias: 0.92,
      variant: profile,
    };
  }

  if (family === "punch") {
    return {
      kind: "impact",
      durationSeconds: resolveRecipeDurationSeconds({
        option,
        rawCombined,
        fallbackDurationSeconds: profile === "heavy-thump-smack" ? 0.48 : profile === "snap-contact-hit" ? 0.28 : 0.36,
        minDurationSeconds: 0.18,
        maxDurationSeconds: 0.9,
      }),
      intensity: clamp(shapedIntensity * (profile === "heavy-thump-smack" ? 0.82 : 0.7), 0.22, 0.88),
      reverb: clamp(shapedReverb + (profile === "heavy-thump-smack" ? 0.04 : 0.02), 0.06, 0.24),
      cleanBias: profile === "snap-contact-hit" ? 0.9 : 0.82,
      variant: `punch:${profile}`,
    };
  }

  if (family === "kick") {
    return {
      kind: "impact",
      durationSeconds: resolveRecipeDurationSeconds({
        option,
        rawCombined,
        fallbackDurationSeconds: profile === "heavy-boot-slam" ? 0.54 : profile === "snap-kick-crack" ? 0.3 : 0.4,
        minDurationSeconds: 0.2,
        maxDurationSeconds: 1,
      }),
      intensity: clamp(shapedIntensity * (profile === "heavy-boot-slam" ? 0.84 : 0.74), 0.22, 0.9),
      reverb: clamp(shapedReverb + (profile === "heavy-boot-slam" ? 0.05 : 0.02), 0.06, 0.24),
      cleanBias: profile === "snap-kick-crack" ? 0.9 : 0.8,
      variant: `kick:${profile}`,
    };
  }

  if (family === "impact") {
    return {
      kind: "impact",
      durationSeconds: resolveRecipeDurationSeconds({
        option,
        rawCombined,
        fallbackDurationSeconds:
          profile === "fall-then-impact"
            ? 0.62
            : profile === "hard-drop-body-slam"
              ? 0.76
              : profile === "skid-into-hit"
                ? 0.54
                : profile === "heavy-body-slam"
                  ? 0.56
                  : profile === "short-blunt-thud"
                    ? 0.3
                    : 0.38,
        minDurationSeconds: 0.18,
        maxDurationSeconds: 1.6,
      }),
      intensity: clamp(
        shapedIntensity *
          (profile === "hard-drop-body-slam"
            ? 0.86
            : profile === "fall-then-impact"
              ? 0.78
              : profile === "skid-into-hit"
                ? 0.7
                : profile === "heavy-body-slam"
                  ? 0.84
                  : 0.72),
        0.22,
        0.9,
      ),
      reverb: clamp(
        shapedReverb + (profile === "hard-drop-body-slam" || profile === "heavy-body-slam" ? 0.06 : 0.02),
        0.06,
        0.24,
      ),
      cleanBias:
        profile === "short-blunt-thud"
          ? 0.88
          : profile === "skid-into-hit"
            ? 0.84
            : 0.82,
      variant: profile,
    };
  }

  if (family === "laser") {
    return {
      kind: "beam",
      durationSeconds: resolveRecipeDurationSeconds({
        option,
        rawCombined,
        fallbackDurationSeconds: profile === "charged-beam-blast" ? 0.72 : profile === "pulse-shot-tail" ? 0.66 : 0.42,
        minDurationSeconds: 0.26,
        maxDurationSeconds: 1.8,
      }),
      intensity: clamp(shapedIntensity * (profile === "charged-beam-blast" ? 0.8 : 0.72), 0.24, 0.88),
      reverb: clamp(shapedReverb + (profile === "pulse-shot-tail" ? 0.06 : 0.02), 0.08, 0.24),
      cleanBias: 0.94,
      variant: profile,
    };
  }

  if (family === "vehicle-pass") {
    return {
      kind:
        profile === "approach-then-recede-pass"
          ? "engine-approach-pass"
          : profile === "heavy-engine-pass"
            ? "heavy-engine-pass"
            : "race-car-pass",
      durationSeconds:
        profile === "approach-then-recede-pass" ? 1.3 : profile === "heavy-engine-pass" ? 1.12 : 0.96,
      intensity: clamp(shapedIntensity * (profile === "heavy-engine-pass" ? 0.8 : 0.72), 0.24, 0.82),
      reverb: clamp(shapedReverb + 0.02, 0.08, 0.34),
      cleanBias: 0.88,
      variant: profile,
    };
  }

  if (family === "background-rumble") {
    return {
      kind: "rumble",
      durationSeconds: isDistant ? 1.2 : 0.95,
      intensity: clamp(shapedIntensity * 0.82, 0.24, 0.72),
      reverb: shapedReverb,
      cleanBias: 0.88,
      variant: profile,
    };
  }

  if (family === "room-tone") {
    return {
      kind: "room-tone",
      durationSeconds: 1.8,
      intensity: clamp(shapedIntensity * 0.42, 0.16, 0.4),
      reverb: clamp(shapedReverb + 0.1, 0.16, 0.42),
      cleanBias: 0.9,
      variant: profile === "thin-hallway-air" ? "hallway" : "room",
    };
  }

  if (family === "portal") {
    return {
      kind: "magic",
      durationSeconds: profile === "glitch-portal-tear" ? 0.74 : 0.92,
      intensity: shapedIntensity,
      reverb: shapedReverb,
      cleanBias: 0.9,
      variant: profile,
    };
  }

  if (family === "generic") {
    return {
      kind: "generic",
      durationSeconds: profile === "sharper-variant" ? 0.34 : profile === "softer-variant" ? 0.52 : 0.46,
      intensity: clamp(shapedIntensity * (profile === "softer-variant" ? 0.56 : 0.62), 0.2, 0.68),
      reverb: profile === "darker-variant" ? clamp(shapedReverb + 0.04, 0.12, 0.24) : shapedReverb,
      cleanBias: 0.9,
      variant: profile,
    };
  }

  return null;
};

const buildFamilySpecificFallbackRecipe = ({
  option,
  combined,
  rawCombined,
  shapedIntensity,
  shapedReverb,
  isDistant,
}: {
  option: DrawingAiSoundOption;
  combined: string;
  rawCombined: string;
  shapedIntensity: number;
  shapedReverb: number;
  isDistant: boolean;
}) => {
  const family = option.soundFamily as DrawingAiSoundFamily | null | undefined;
  if (!family || !NON_GENERIC_FAMILY_SET.has(family)) {
    return null;
  }

  const safeProfile = getFamilySafeFallbackProfile(family, rawCombined);
  if (!safeProfile) {
    return null;
  }

  return inferExplicitSoundRecipe({
    option: {
      ...option,
      soundFamily: family,
      soundProfile: safeProfile,
    },
    combined,
    rawCombined,
    shapedIntensity,
    shapedReverb,
    isDistant,
  });
};

const inferSoundRecipe = (option: DrawingAiSoundOption): SoundRecipe => {
  const negativeConstraintPromptText = getNegativeConstraintPromptText(option);
  const rawCombined = `${option.title} ${option.description} ${option.timingFeel ?? ""} ${option.intensityFeel ?? ""} ${negativeConstraintPromptText}`.toLowerCase();
  const rawLabeledDescription = `${option.title} ${option.description}`.toLowerCase();
  const combined = stripNegatedSoundCues(rawCombined);
  const labeledDescription = stripNegatedSoundCues(rawLabeledDescription);
  if (isVoiceLikeSoundOption(option)) {
    return {
      kind: "voice-placeholder",
      durationSeconds: 0,
      intensity: 0,
      reverb: 0,
    };
  }

  const intensity =
    /\b(huge|heavy|hard|brutal|massive|big|strong)\b/.test(combined)
      ? 0.95
      : /\b(soft|quiet|light|subtle|gentle)\b/.test(combined)
        ? 0.45
        : 0.72;
  const reverb = /\b(reverb|echo|arena|hall|tail)\b/.test(combined) ? 0.4 : 0.18;
  const isDistant = /\b(distant|distance|far away|farther away|background|behind (?:him|her|them)|in the distance|far down the hallway)\b/.test(combined);
  const rejectsSciFiHumLikeTone =
    /\b(?:not|no|without|less|rather than|instead of)\b[^,.!?;]*\b(?:alien(?:\s+abduction)?|ufo|hum|drone|abduction|sci-fi|scifi)\b/i.test(rawCombined);
  const rejectsDeepRumbleBias =
    /\b(?:not|no|without|less|rather than|instead of)\b[^,.!?;]*\b(?:deep(?:er)?|rumble)\b/i.test(rawCombined);
  const rejectsCrunchyBlast =
    /\b(?:not|no|without|less|rather than|instead of)\b[^,.!?;]*\b(?:distort(?:ed|ion)?|arcadey|crunchy|harsh|static|noise)\b/i.test(rawCombined);
  const shapedIntensity = isDistant ? clamp(intensity * 0.62, 0.22, 0.68) : intensity;
  const shapedReverb = isDistant ? clamp(reverb + 0.14, 0.2, 0.5) : reverb;
  const explicitRecipe = inferExplicitSoundRecipe({
    option,
    combined,
    rawCombined,
    shapedIntensity,
    shapedReverb,
    isDistant,
  });
  if (explicitRecipe) {
    return explicitRecipe;
  }
  const actionIsFight = /\b(fight|fighting|brawl|combat|battle|clash)\b/.test(combined);
  const actionIsChase = /\b(chasing|chase|running|run|pursuit)\b/.test(combined);
  const actionIsFall = /\b(fall|falling|drop|dropping|plummet|fell)\b/.test(combined);
  const objectIsCreature = /\b(t-?rex|dinosaur|creature|monster|beast|dragon)\b/.test(combined);
  const environmentIsStorm = /\b(rain|storm|stormy|thunder|lightning)\b/.test(combined);
  const isBoneBreak =
    /\b(bone|fracture|fractured|ligament|body fracture|bone snap|bone crack|cracked bone|dry break)\b/.test(labeledDescription) ||
    (/\b(crack|cracked|snap|snapping|break|breaking)\b/.test(labeledDescription) &&
      /\b(arm|leg|joint|rib|ribs|spine|skull|neck|shoulder|elbow|knee|ankle|wrist|bone|fracture|nasty|dry)\b/.test(labeledDescription));
  const isTwigSnap = /\b(branch|twig)\b/.test(combined) && /\b(snap|crack|break)\b/.test(combined);
  const isWoodBreak = /\b(wood|wooden|timber|crate|splinter|branch)\b/.test(combined) && /\b(crack|snap|break|splinter)\b/.test(combined);
  const isCartoonBounce =
    /\b(boing|cartoon bounce|cartoon boing|rubber(?:y)? bounce|spring(?:y)? bounce|playful bounce|bouncy landing|toon bounce)\b/.test(combined) ||
    (/\bbounce|bouncy\b/.test(combined) && /\b(cartoon|rubber|rubbery|spring|springy|playful|boing|toon)\b/.test(combined)) ||
    (/\bcartoon\b/.test(combined) && /\b(landing|bounce|boing|playful)\b/.test(combined));
  const isSlowOpen = /\b(slow|slowly|creaking open|opening slowly|slow open)\b/.test(combined);
  const isHingeCreak = /\b(hinge|hinges|hinge strain|thin eerie hinge)\b/.test(combined);
  const isSciFiDoor = /\b(door|airlock)\b/.test(combined) && /\b(sci-fi|science fiction|mist|smoke|airlock|sealed|mechanical hiss|pressure door)\b/.test(combined);
  const isDoorCreak =
    /\b(door|doorway|hallway door|library door)\b/.test(combined) &&
    /\b(creak|creaking|open|opening|groan|strain|old|slow)\b/.test(combined);
  const isWoodStrain = /\b(wood strain|wooden door|old door|heavy wooden door|door groan|wood groan)\b/.test(combined);
  const isLightning = /\b(lightning|lightning strike|thunderstrike|thunder strike|thunderclap|thunder clap|thunder crack|bolt strike)\b/.test(combined);
  const isElectricity =
    !isLightning && /\b(electric(?:ity|al)?|arc|arcing|zap|zapping|power surge|spark(?:ing)?|crackle|tesla)\b/.test(combined);
  const isVolcano = /\b(volcano|eruption|erupting|lava burst|magma burst|erupts?)\b/.test(combined);
  const isExplosionLike = /\b(explosion|blast|shockwave|detonation|kaboom)\b/.test(combined);
  const isPebbleWater =
    (/\b(pebble|small stone|tiny stone|rock)\b/.test(combined) && /\b(water|pond|puddle|pool|lake|river|splash|ripple)\b/.test(combined)) ||
    /\b(pebble into water|stone into water|rock into water)\b/.test(combined);
  const isWaterSplash = !isPebbleWater && /\b(water|splash|plunge|wet hit|wave crash|water burst)\b/.test(combined);
  const isFire = /\b(fire|flame|flames|fireball|ignite|ignition|flare|torch)\b/.test(combined);
  const isRain = /\b(rain(?:y)?|raindrops?|drizzle|downpour|storm rain|rainfall)\b/.test(combined);
  const isFootstep = /\b(footsteps?|walking|walks?|step|steps)\b/.test(combined);
  const isStoneSurface = /\b(stone bricks?|brick|cobblestone|stone floor|pavers?)\b/.test(combined);
  const isConcreteSurface = /\b(concrete|cement|sidewalk|hard floor)\b/.test(combined);
  const isClothMovement = /\b(clothes?|cloth|fabric|jacket|coat|cape|shirt)\b/.test(combined) && /\b(move|moving|rustle|swish|distance|wind)\b/.test(combined);
  const isGrassMovement = /\b(grass|weeds?|reeds?)\b/.test(combined) && /\b(move|moving|rustle|wind|distance|background)\b/.test(combined);
  const isWind = /\b(wind|gust|breeze|outside air|air pass|windy)\b/.test(combined);
  const isRustle = /\b(leaves?|leaf|rustle|crunch|debris|sneak|sneaking)\b/.test(combined);
  const isDebrisCrash =
    /\b(debris|rubble|collapse|crash|clatter|rock fall|rockfall|falling apart)\b/.test(combined) &&
    !isWaterSplash &&
    !isFire;
  const isCreak = /\b(door|hinge|creak|creaking|hallway door)\b/.test(combined);
  const isRumble = !isExplosionLike && /\b(volcano|rumble|far explosion|distant explosion|eruption)\b/.test(combined);
  const isRoomTone = /\b(room tone|hallway air|air bed|tone bed|ambient bed|soft ambience bed)\b/.test(combined);
  const isUiBeep = /\b(beep|ui|menu|confirm|interface|notification|chirp|blip|pulse)\b/.test(combined);
  const isButtonClick = /\b(button|click|press|tap)\b/.test(combined);
  const isZipper = /\b(zipper|zip|unzipping|zipping)\b/.test(combined);
  const isMagic = /\b(magic|magical|arcane|spell|mystic|rune|enchanted)\b/.test(combined);
  const isEnergy =
    !isMagic && !/\b(laser|blaster|plasma)\b/.test(combined) && /\b(energy|beam|energy burst|energy wave|pulse blast|discharge)\b/.test(combined);
  const isGenericWhoosh =
    /\b(whoosh|swish|swoosh|air swipe|motion pass|rush past|fast pass)\b/.test(combined) &&
    !/\b(sword|blade|katana|saber|door|airlock|car|vehicle|engine)\b/.test(combined);
  const isPunch = /\b(punch|fist|body hit|knuckle|smack)\b/.test(combined);
  const isKick = /\b(kick|roundhouse|boot hit|boot kick|dropkick|heel kick|soccer kick|knee strike)\b/.test(combined);
  const isGenericImpact =
    !isPunch && !isKick && /\b(impact|slam|body slam|collision|hard hit|blunt hit|thud)\b/.test(combined);
  const isVehicle = /\b(race car|car|vehicle|engine|motor|racecar)\b/.test(combined);
  const isVehiclePass = /\b(pass(?:-by)?|passes by|coming and going away|coming and going|toward camera then away|towards camera then away|zooms past|zooms by|approach|approaching|receding|going away|drives toward camera then away|past camera|doppler)\b/.test(combined);

  if (objectIsCreature && actionIsChase) {
    return {
      kind: "creature",
      durationSeconds: resolveRecipeDurationSeconds({
        option,
        rawCombined,
        fallbackDurationSeconds: 1.58,
        minDurationSeconds: 0.9,
        maxDurationSeconds: 4.2,
      }),
      intensity: clamp(shapedIntensity * 0.82, 0.24, 0.9),
      reverb: clamp(shapedReverb + 0.08, 0.14, 0.42),
      cleanBias: 0.84,
      variant: "giant-chase-stomp",
    };
  }

  if (environmentIsStorm && actionIsFight) {
    return {
      kind: "rain",
      durationSeconds: resolveRecipeDurationSeconds({
        option,
        rawCombined,
        fallbackDurationSeconds: 1.56,
        minDurationSeconds: 0.9,
        maxDurationSeconds: 4.5,
      }),
      intensity: clamp(shapedIntensity * 0.66, 0.22, 0.72),
      reverb: clamp(shapedReverb + 0.08, 0.14, 0.34),
      cleanBias: 0.9,
      variant: /\b(thunder|lightning)\b/.test(combined) ? "thunder-rain-clash" : "storm-fight-rain",
    };
  }

  if (actionIsFall && /\b(impact|hit|slam|ground|land|landing|crash)\b/.test(combined)) {
    return {
      kind: "impact",
      durationSeconds: resolveRecipeDurationSeconds({
        option,
        rawCombined,
        fallbackDurationSeconds: /\b(hard|heavy|brutal)\b/.test(combined) ? 0.74 : 0.6,
        minDurationSeconds: 0.22,
        maxDurationSeconds: 1.6,
      }),
      intensity: clamp(shapedIntensity * (/\b(hard|heavy|brutal)\b/.test(combined) ? 0.84 : 0.76), 0.22, 0.9),
      reverb: clamp(shapedReverb + 0.04, 0.06, 0.24),
      cleanBias: 0.84,
      variant: /\b(skid|slide|scrape)\b/.test(combined) ? "skid-into-hit" : /\b(hard|heavy|brutal)\b/.test(combined) ? "hard-drop-body-slam" : "fall-then-impact",
    };
  }

  if (isBoneBreak) {
    const variant =
      /\b(twisting|runout|ligament|two to three seconds|2 to 3 seconds|2-3 seconds|long(?:er)? fracture|long fracture)\b/.test(labeledDescription)
        ? "twisting-fracture-runout"
        : /\b(sequence|aftershock|follow-through|follow through|stretched fracture|extended fracture)\b/.test(labeledDescription)
          ? "compound-fracture-sequence"
          : /\b(nasty|fracture|fractured|ugly|brutal|gruesome|gnarly|splinter)\b/.test(labeledDescription)
            ? "nasty-fracture"
            : /\b(crack|cracked|brittle|sharp|clean|cleaner|controlled|tight)\b/.test(labeledDescription)
              ? "brittle-crack"
              : "dry-snap";
    const fallbackDurationSeconds =
      variant === "twisting-fracture-runout"
        ? 2.26
        : variant === "compound-fracture-sequence"
          ? 2.04
          : variant === "nasty-fracture"
            ? 0.2
            : variant === "brittle-crack"
              ? 0.16
              : 0.15;
    return {
      kind: "bone-crack",
      durationSeconds: resolveRecipeDurationSeconds({
        option,
        rawCombined,
        fallbackDurationSeconds,
        minDurationSeconds: 0.14,
        maxDurationSeconds: 3.2,
      }),
      intensity: clamp(
        shapedIntensity *
          (variant === "twisting-fracture-runout" || variant === "compound-fracture-sequence"
            ? 0.7
            : variant === "nasty-fracture"
              ? 0.72
              : variant === "brittle-crack"
                ? 0.62
                : 0.58),
        0.22,
        0.8,
      ),
      reverb:
        /\b(tail|reverb|echo)\b/.test(combined) || variant === "twisting-fracture-runout" || variant === "compound-fracture-sequence"
          ? 0.04
          : 0.02,
      cleanBias:
        variant === "twisting-fracture-runout"
          ? 0.72
          : variant === "compound-fracture-sequence"
            ? 0.82
            : variant === "nasty-fracture"
              ? 0.68
              : variant === "brittle-crack"
                ? 0.92
                : 0.86,
      variant,
    };
  }

  if (isTwigSnap) {
    return {
      kind: "twig-snap",
      durationSeconds: isDistant ? 0.26 : 0.18,
      intensity: clamp(shapedIntensity * (isDistant ? 0.52 : 0.6), 0.18, 0.56),
      reverb: clamp(shapedReverb + (isDistant ? 0.06 : 0.02), 0.04, 0.18),
      cleanBias: 0.88,
      variant: isDistant ? "distant" : /\b(fuller|branch|larger)\b/.test(combined) ? "branch" : "dry",
    };
  }

  if (isWoodBreak) {
    return {
      kind: "wood-crack",
      durationSeconds: 0.28,
      intensity: shapedIntensity,
      reverb: /\b(tail|reverb|echo)\b/.test(combined) ? 0.14 : 0.06,
    };
  }

  if (isCartoonBounce) {
    const isSoftBoing = /\b(soft|quiet|gentle|subtle|clean|cleaner|normal|less distorted|not weird|not disordered)\b/.test(combined);
    const isRubbery = /\b(rubber|rubbery)\b/.test(combined);
    const isSpringy = /\b(spring|springy)\b/.test(combined);
    return {
      kind: isRubbery ? "rubber-bounce" : isSpringy ? "springy-bounce" : "cartoon-boing",
      durationSeconds: isSoftBoing ? 0.28 : 0.36,
      intensity: clamp(shapedIntensity * (isSoftBoing ? 0.54 : 0.68), 0.18, 0.62),
      reverb: 0.03,
      cleanBias: 0.94,
    };
  }

  if (isLightning) {
    const variant = /\b(rolling|aftershock|thunder tail|rolls out)\b/.test(combined)
      ? "rolling-tail"
      : /\b(flash|sharp|quick clean|flash-crack|crack strike)\b/.test(combined) && !/\b(fuller|heavy|bigger|storm weight|longer tail)\b/.test(combined)
        ? "flash-crack"
        : /\b(heavy|fuller|bigger|thunder|body|storm)\b/.test(combined)
          ? "storm-body"
          : "flash-crack";
    return {
      kind: "lightning-strike",
      durationSeconds: variant === "rolling-tail" ? 1.08 : variant === "storm-body" ? 0.94 : 0.62,
      intensity: clamp(shapedIntensity * (variant === "flash-crack" ? 0.76 : 0.84), 0.28, 0.9),
      reverb: clamp(shapedReverb + 0.08, 0.14, 0.42),
      cleanBias: /\b(clean|cleaner|controlled|less distorted)\b/.test(combined) ? 0.9 : 0.78,
      variant,
    };
  }

  if (isElectricity) {
    return {
      kind: "electricity",
      durationSeconds: /\b(short|quick|tight)\b/.test(combined) ? 0.34 : 0.54,
      intensity: clamp(shapedIntensity * 0.72, 0.24, 0.76),
      reverb: clamp(shapedReverb + 0.04, 0.08, 0.28),
      cleanBias: /\b(clean|cleaner|controlled|less distorted)\b/.test(combined) ? 0.88 : 0.72,
      variant: /\b(arc|zap)\b/.test(combined) ? "arc" : "power",
    };
  }

  if (isVolcano) {
    return {
      kind: "volcano-eruption",
      durationSeconds: resolveRecipeDurationSeconds({
        option,
        rawCombined,
        fallbackDurationSeconds: isDistant ? 1.36 : 1.08,
        minDurationSeconds: 0.84,
        maxDurationSeconds: 4.2,
      }),
      intensity: clamp(shapedIntensity * 0.78, 0.3, 0.82),
      reverb: clamp(shapedReverb + 0.08, 0.14, 0.42),
      cleanBias: 0.82,
      variant: isDistant ? "distant" : "foreground",
    };
  }

  if (isPebbleWater) {
    return {
      kind: "pebble-water",
      durationSeconds: isDistant ? 0.34 : 0.26,
      intensity: clamp(shapedIntensity * 0.48, 0.16, 0.46),
      reverb: clamp(shapedReverb + 0.06, 0.1, 0.28),
      cleanBias: 0.92,
      variant: /\b(splash|bigger)\b/.test(combined) ? "splash" : "plip",
    };
  }

  if (isWaterSplash) {
    return {
      kind: "water",
      durationSeconds: /\b(heavy|big|huge|plunge|crash)\b/.test(combined) ? 0.78 : /\b(spray|surface|light|quick)\b/.test(combined) ? 0.42 : 0.56,
      intensity: clamp(shapedIntensity * (/\b(heavy|big|huge|plunge|crash)\b/.test(combined) ? 0.76 : 0.62), 0.18, 0.82),
      reverb: clamp(shapedReverb + 0.08, 0.1, 0.28),
      cleanBias: 0.92,
      variant: /\b(heavy|big|huge|plunge|crash)\b/.test(combined) ? "heavy-plunge-splash" : /\b(spray|surface|light|quick)\b/.test(combined) ? "spray-surface-slap" : "clean-water-splash",
    };
  }

  if (isFire) {
    return {
      kind: "fire",
      durationSeconds: /\b(roar|sustain|broad)\b/.test(combined) ? 0.92 : /\b(crackle|pop|small|torch)\b/.test(combined) ? 0.38 : 0.62,
      intensity: clamp(shapedIntensity * (/\b(roar|sustain|broad)\b/.test(combined) ? 0.78 : 0.68), 0.2, 0.84),
      reverb: clamp(shapedReverb + 0.04, 0.08, 0.24),
      cleanBias: 0.9,
      variant: /\b(roar|sustain|broad)\b/.test(combined) ? "hot-flare-roar" : /\b(crackle|pop|small|torch)\b/.test(combined) ? "crackling-fire-pop" : "flame-burst-whoomph",
    };
  }

  if (isRain) {
    const variant = /\b(window|glass|pane)\b/.test(combined) ? "window" : /\b(heavy|storm|downpour)\b/.test(combined) ? "storm-sheet" : "light-bed";
    return {
      kind: "rain",
      durationSeconds: resolveRecipeDurationSeconds({
        option,
        rawCombined,
        fallbackDurationSeconds: variant === "storm-sheet" ? (isDistant ? 1.54 : 1.24) : variant === "window" ? (isDistant ? 1.42 : 1.2) : isDistant ? 1.46 : 1.18,
        minDurationSeconds: 0.8,
        maxDurationSeconds: 4.5,
      }),
      intensity: clamp(shapedIntensity * (variant === "storm-sheet" ? 0.52 : 0.48), 0.18, 0.54),
      reverb: clamp(shapedReverb + 0.08, 0.14, 0.34),
      cleanBias: variant === "window" ? 0.92 : 0.9,
      variant,
    };
  }

  if (isFootstep) {
    return {
      kind: "footstep",
      durationSeconds: 0.22,
      intensity: clamp(shapedIntensity * (isDistant ? 0.48 : 0.58), 0.18, 0.58),
      reverb: clamp(shapedReverb + (isDistant ? 0.08 : 0.02), 0.06, 0.24),
      cleanBias: 0.88,
      variant: isStoneSurface ? "stone" : isConcreteSurface ? "concrete" : "hard-floor",
    };
  }

  if (isHingeCreak) {
    return {
      kind: "hinge-creak",
      durationSeconds: isSlowOpen ? 1.04 : 0.76,
      intensity: clamp(shapedIntensity * 0.58, 0.18, 0.54),
      reverb: clamp(shapedReverb + 0.04, 0.1, 0.34),
      cleanBias: 0.86,
    };
  }

  if (isWoodStrain) {
    return {
      kind: "wood-strain",
      durationSeconds: isSlowOpen ? 1.18 : 0.92,
      intensity: clamp(shapedIntensity * 0.64, 0.22, 0.62),
      reverb: clamp(shapedReverb + 0.05, 0.12, 0.36),
      cleanBias: 0.8,
    };
  }

  if (isSciFiDoor) {
    return {
      kind: "sci-fi-door",
      durationSeconds: isSlowOpen ? 0.98 : 0.72,
      intensity: clamp(shapedIntensity * 0.54, 0.18, 0.58),
      reverb: clamp(shapedReverb + 0.08, 0.1, 0.34),
      cleanBias: 0.9,
      variant: /\b(mist|smoke|hiss)\b/.test(combined) ? "misty" : "mechanical",
    };
  }

  if (isDoorCreak) {
    return {
      kind: "door-creak",
      durationSeconds: isSlowOpen ? 1.12 : 0.86,
      intensity: clamp(shapedIntensity * 0.6, 0.18, 0.58),
      reverb: clamp(shapedReverb + 0.06, 0.12, 0.38),
      cleanBias: 0.84,
    };
  }

  if (isWind) {
    const variant =
      /\b(gust|sharper|pass|movement reads|reads clearly)\b/.test(combined)
        ? "gust-pass"
        : /\b(fuller|lower|outdoor weight|body)\b/.test(combined)
          ? "full-pass"
          : "soft-bed";
    return {
      kind: "wind",
      durationSeconds: resolveRecipeDurationSeconds({
        option,
        rawCombined,
        fallbackDurationSeconds: isDistant ? 1.5 : 1.05,
        minDurationSeconds: 0.8,
        maxDurationSeconds: 4.5,
      }),
      intensity: clamp(shapedIntensity * (isDistant ? 0.58 : 0.68), 0.18, 0.56),
      reverb: clamp(shapedReverb + 0.06, 0.14, 0.38),
      cleanBias: 0.88,
      variant,
    };
  }

  if (isRustle || isClothMovement || isGrassMovement) {
    return {
      kind: "rustle",
      durationSeconds: isDistant ? 0.74 : 0.44,
      intensity: clamp(shapedIntensity * 0.72, 0.2, 0.62),
      reverb: clamp(shapedReverb + 0.02, 0.08, 0.34),
      cleanBias: 0.86,
      variant: isClothMovement ? "cloth" : isGrassMovement ? "grass" : /\b(debris)\b/.test(combined) ? "debris" : "leaves",
    };
  }

  if (isDebrisCrash) {
    return {
      kind: "crash",
      durationSeconds: /\b(collapse|roll|background)\b/.test(combined) ? (isDistant ? 1.02 : 0.88) : /\b(scatter|small|dusty)\b/.test(combined) ? 0.62 : 0.74,
      intensity: clamp(shapedIntensity * (/\b(heavy|hard|crash)\b/.test(combined) ? 0.82 : 0.68), 0.22, 0.84),
      reverb: clamp(shapedReverb + (/\b(collapse|roll|background)\b/.test(combined) ? 0.08 : 0.04), 0.08, 0.28),
      cleanBias: 0.84,
      variant: /\b(collapse|roll|background)\b/.test(combined) ? "dusty-collapse-roll" : /\b(scatter|small|dusty)\b/.test(combined) ? "rubble-scatter-drop" : "hard-debris-crash",
    };
  }

  if (isCreak) {
    return {
      kind: "creak",
      durationSeconds: isDistant ? 0.9 : 0.62,
      intensity: shapedIntensity,
      reverb: shapedReverb,
    };
  }

  if (isRumble) {
    const repairedRecipe =
      !canUseSharedLowGrowlTone(option, rawCombined)
        ? buildFamilySpecificFallbackRecipe({
            option,
            combined,
            rawCombined,
            shapedIntensity,
            shapedReverb,
            isDistant,
          })
        : null;
    if (repairedRecipe) {
      return repairedRecipe;
    }
    return {
      kind: "rumble",
      durationSeconds: isDistant ? 1.2 : 0.95,
      intensity: clamp(shapedIntensity * 0.82, 0.24, 0.72),
      reverb: shapedReverb,
    };
  }

  if (isRoomTone) {
    return {
      kind: "room-tone",
      durationSeconds: 1.8,
      intensity: clamp(shapedIntensity * 0.46, 0.18, 0.4),
      reverb: clamp(shapedReverb + 0.1, 0.16, 0.42),
      cleanBias: 0.9,
      variant: /\b(hallway)\b/.test(combined) ? "hallway" : "room",
    };
  }

  if (isUiBeep || isButtonClick) {
    const isSoftUi = /\b(soft|quiet|subtle|clean|cleaner|muted|modern|less distorted|not arcadey|smaller)\b/.test(combined);
    const isMenuChirp = /\b(menu|chirp)\b/.test(combined);
    return {
      kind: isButtonClick ? "button-click" : "ui-beep",
      durationSeconds: isMenuChirp ? 0.14 : isSoftUi ? 0.12 : 0.16,
      intensity: isSoftUi ? clamp(shapedIntensity * 0.62, 0.2, 0.5) : clamp(shapedIntensity * 0.72, 0.25, 0.62),
      reverb: 0.02,
      cleanBias: 0.94,
      variant: isButtonClick && isUiBeep ? "click-beep" : isMenuChirp ? "menu-chirp" : isButtonClick ? "button" : "confirm",
    };
  }

  if (isZipper) {
    const variant =
      /\b(slow|slowly|careful|carefully)\b/.test(combined)
        ? "slow-jacket-unzip"
        : /\b(close|close-up|close up|detailed|detail|clean|quiet room)\b/.test(combined)
          ? "close-detail-zip-click"
          : "metal-tooth-zip";
    return {
      kind: "zipper",
      durationSeconds: resolveRecipeDurationSeconds({
        option,
        rawCombined,
        fallbackDurationSeconds: variant === "slow-jacket-unzip" ? 0.74 : variant === "close-detail-zip-click" ? 0.34 : 0.42,
        minDurationSeconds: 0.18,
        maxDurationSeconds: 2.2,
      }),
      intensity: clamp(
        shapedIntensity * (variant === "slow-jacket-unzip" ? 0.48 : variant === "close-detail-zip-click" ? 0.42 : 0.52),
        0.16,
        0.62,
      ),
      reverb: clamp(shapedReverb + (variant === "close-detail-zip-click" ? 0.01 : 0.02), 0.04, 0.18),
      cleanBias: variant === "close-detail-zip-click" ? 0.94 : 0.9,
      variant,
    };
  }

  if (isMagic) {
    return {
      kind: "magic",
      durationSeconds: /\b(charge|build|swell)\b/.test(combined) ? 0.86 : /\b(pop|small|quick)\b/.test(combined) ? 0.46 : 0.62,
      intensity: clamp(shapedIntensity * (/\b(burst|release|blast)\b/.test(combined) ? 0.78 : 0.68), 0.22, 0.84),
      reverb: clamp(shapedReverb + 0.08, 0.12, 0.34),
      cleanBias: 0.92,
      variant: /\b(charge|build|swell)\b/.test(combined) ? "rune-energy-bloom" : /\b(pop|small|quick)\b/.test(combined) ? "shimmer-spell-pop" : "arcane-burst-flare",
    };
  }

  if (isEnergy) {
    return {
      kind: "beam",
      durationSeconds: /\b(wave|tail|release)\b/.test(combined) ? 0.72 : /\b(burst|shot|blast)\b/.test(combined) ? 0.58 : 0.64,
      intensity: clamp(shapedIntensity * (/\b(burst|shot|blast)\b/.test(combined) ? 0.8 : 0.7), 0.24, 0.86),
      reverb: clamp(shapedReverb + (/\b(wave|tail|release)\b/.test(combined) ? 0.08 : 0.04), 0.1, 0.28),
      cleanBias: 0.92,
      variant: /\b(wave|tail|release)\b/.test(combined) ? "pulse-wave-release" : /\b(burst|shot|blast)\b/.test(combined) ? "charged-energy-burst" : "focused-energy-beam",
    };
  }

  if (isGenericWhoosh) {
    return {
      kind: "whoosh",
      durationSeconds: /\b(broad|big|heavy)\b/.test(combined) ? 0.52 : /\b(tight|quick|clean)\b/.test(combined) ? 0.24 : 0.34,
      intensity: clamp(shapedIntensity * (/\b(broad|big|heavy)\b/.test(combined) ? 0.74 : 0.62), 0.18, 0.78),
      reverb: clamp(shapedReverb + (/\b(broad|big|heavy)\b/.test(combined) ? 0.06 : 0.02), 0.06, 0.22),
      cleanBias: 0.92,
      variant: /\b(broad|big|heavy)\b/.test(combined) ? "broad-swish-pass" : /\b(tight|quick|clean)\b/.test(combined) ? "tight-motion-cut" : "fast-air-swipe",
    };
  }

  if (isPunch) {
    return {
      kind: "impact",
      durationSeconds: /\b(heavy|hard|brutal|massive)\b/.test(combined) ? 0.48 : /\b(snap|sharp|quick|tight)\b/.test(combined) ? 0.28 : 0.36,
      intensity: clamp(shapedIntensity * (/\b(heavy|hard|brutal|massive)\b/.test(combined) ? 0.82 : 0.7), 0.22, 0.88),
      reverb: clamp(shapedReverb + (/\b(heavy|hard|brutal|massive)\b/.test(combined) ? 0.04 : 0.02), 0.06, 0.24),
      cleanBias: /\b(snap|sharp|quick|tight)\b/.test(combined) ? 0.9 : 0.82,
      variant: /\b(heavy|hard|brutal|massive)\b/.test(combined) ? "punch:heavy-thump-smack" : /\b(snap|sharp|quick|tight)\b/.test(combined) ? "punch:snap-contact-hit" : "punch:tight-body-hit",
    };
  }

  if (isKick) {
    return {
      kind: "impact",
      durationSeconds: /\b(heavy|hard|brutal|big)\b/.test(combined) ? 0.54 : /\b(sharp|snap|quick|tight)\b/.test(combined) ? 0.3 : 0.4,
      intensity: clamp(shapedIntensity * (/\b(heavy|hard|brutal|big)\b/.test(combined) ? 0.84 : 0.74), 0.22, 0.9),
      reverb: clamp(shapedReverb + (/\b(heavy|hard|brutal|big)\b/.test(combined) ? 0.05 : 0.02), 0.06, 0.24),
      cleanBias: /\b(sharp|snap|quick|tight)\b/.test(combined) ? 0.9 : 0.8,
      variant: /\b(heavy|hard|brutal|big)\b/.test(combined) ? "kick:heavy-boot-slam" : /\b(sharp|snap|quick|tight)\b/.test(combined) ? "kick:snap-kick-crack" : "kick:tight-shoe-thump",
    };
  }

  if (isGenericImpact) {
    return {
      kind: "impact",
      durationSeconds: /\b(heavy|hard|massive|slam)\b/.test(combined) ? 0.56 : /\b(tight|short|quick)\b/.test(combined) ? 0.3 : 0.38,
      intensity: clamp(shapedIntensity * (/\b(heavy|hard|massive|slam)\b/.test(combined) ? 0.84 : 0.72), 0.22, 0.88),
      reverb: clamp(shapedReverb + (/\b(heavy|hard|massive|slam)\b/.test(combined) ? 0.06 : 0.02), 0.06, 0.24),
      cleanBias: /\b(tight|short|quick)\b/.test(combined) ? 0.88 : 0.82,
      variant: /\b(heavy|hard|massive|slam)\b/.test(combined) ? "heavy-body-slam" : /\b(tight|short|quick)\b/.test(combined) ? "short-blunt-thud" : "tight-impact-hit",
    };
  }

  if (isVehicle && isVehiclePass) {
    const isApproachThenAway =
      /\b(coming and going away|toward camera then away|towards camera then away|approach then recede|approach-then-recede|coming then going away|drives toward camera then away)\b/.test(combined);
    const isHeavyVehicle = /\b(heavy|heavier|engine-rich|engine rich|muscle|deeper|fuller|more like a real car)\b/.test(combined);
    const isDistantVehicle = isDistant || /\b(distant|trackside|track-side|far away|background)\b/.test(combined);
    return {
      kind: isDistantVehicle
        ? "distant-track-pass"
        : isApproachThenAway
          ? "engine-approach-pass"
          : isHeavyVehicle
            ? "heavy-engine-pass"
            : "race-car-pass",
      durationSeconds: isDistantVehicle ? 1.34 : isApproachThenAway ? 1.3 : isHeavyVehicle ? 1.12 : 0.96,
      intensity: clamp(shapedIntensity * (isDistantVehicle ? 0.58 : isHeavyVehicle ? 0.8 : 0.72), 0.24, 0.82),
      reverb: clamp(shapedReverb + (isDistantVehicle ? 0.06 : 0.02), 0.08, 0.34),
      cleanBias: /\b(clean|cleaner|less distorted|more like a real car|not like an explosion|not crunchy)\b/.test(combined) ? 0.9 : 0.82,
    };
  }

  if (isExplosionLike || (/\b(crash|slam)\b/.test(combined) && !isBoneBreak && !isDoorCreak && !isVehiclePass)) {
    const cleanExplosionBias = rejectsSciFiHumLikeTone || rejectsDeepRumbleBias || rejectsCrunchyBlast
      ? 0.94
      : /\b(clean|cleaner|less distorted|not crunchy|not arcadey|less harsh|fuller boom|cinematic|professional)\b/.test(combined)
      ? 0.88
      : /\b(anime|clean big|big clean|powerful|stronger|fuller|controlled)\b/.test(combined)
        ? 0.72
        : 0.48;
    const explosionProfile: ExplosionProfile =
      /\b(pre[- ]?boom|pre boom|pressure hit|pressure boom|setup boom|before the blast|before the explosion|two[- ]stage|two stage|staged|detonation)\b/.test(combined)
        ? "staged-preboom-detonation"
        : !rejectsDeepRumbleBias && /\b(heavy|heavier|fuller|cinematic|deep|deeper|low-end|low end|bigger payoff|weightier|broad)\b/.test(combined)
          ? "heavy-clean-blast"
          : "tight-anime-pop";
    return {
      kind: /\b(explosion|blast)\b/.test(combined) ? "explosion" : "impact",
      durationSeconds:
        isDistant
          ? 1.05
          : explosionProfile === "staged-preboom-detonation"
            ? 1.28
            : explosionProfile === "heavy-clean-blast"
              ? 1.16
              : 0.86,
      intensity: shapedIntensity,
      reverb: shapedReverb,
      cleanBias: cleanExplosionBias,
      explosionProfile,
    };
  }
  if (/\b(punch|kick|impact|landing|fall|hit|bonk)\b/.test(combined)) {
    return {
      kind: "impact",
      durationSeconds: 0.42,
      intensity: shapedIntensity,
      reverb: shapedReverb,
      cleanBias: /\b(clean|cleaner|controlled|tight)\b/.test(combined) ? 0.88 : 0.72,
      variant: /\b(landing|fall)\b/.test(combined) ? "landing" : "hit",
    };
  }
  if (/\b(whoosh|slash|swing|spear|pass-by)\b/.test(combined)) {
    return { kind: "whoosh", durationSeconds: 0.36, intensity: shapedIntensity, reverb: shapedReverb, cleanBias: 0.86 };
  }
  if (/\b(magic|portal|time stop|time resume|reveal|sting)\b/.test(combined)) {
    return { kind: "magic", durationSeconds: 0.92, intensity: shapedIntensity, reverb: shapedReverb };
  }
  if (/\b(ambience|hallway|creepy|horror|eerie|memory)\b/.test(combined)) {
    return { kind: "ambience", durationSeconds: 1.6, intensity: clamp(shapedIntensity * 0.85, 0.3, 0.8), reverb: clamp(shapedReverb + 0.18, 0.18, 0.55) };
  }
  if (/\b(roar|growl|scream|monster|dinosaur|dragon)\b/.test(combined)) {
    return {
      kind: "creature",
      durationSeconds: resolveRecipeDurationSeconds({
        option,
        rawCombined,
        fallbackDurationSeconds: actionIsChase ? 1.44 : 1.08,
        minDurationSeconds: 0.52,
        maxDurationSeconds: 4.2,
      }),
      intensity: clamp(shapedIntensity * (actionIsChase ? 0.82 : 0.72), 0.24, 0.9),
      reverb: clamp(shapedReverb + 0.08, 0.12, 0.42),
      cleanBias: 0.84,
      variant: actionIsChase ? "giant-chase-stomp" : "predator-roar-break",
    };
  }
  if (/\b(robot|servo|mech|mechanical)\b/.test(combined)) {
    return { kind: "robot", durationSeconds: 0.68, intensity: shapedIntensity, reverb: shapedReverb };
  }
  if (/\b(laser|beam|sci-fi|energy)\b/.test(combined)) {
    return { kind: "beam", durationSeconds: 0.64, intensity: shapedIntensity, reverb: shapedReverb };
  }
  if (/\b(alarm|siren|countdown|beep|ui|button)\b/.test(combined)) {
    return { kind: "alarm", durationSeconds: 0.55, intensity: shapedIntensity, reverb: 0.08 };
  }
  if (/\b(engine|vehicle|rev)\b/.test(combined)) {
    return { kind: "engine", durationSeconds: 1.0, intensity: shapedIntensity, reverb: 0.12 };
  }
  if (/\b(glass|shatter|break)\b/.test(combined)) {
    return { kind: "glass", durationSeconds: 0.52, intensity: shapedIntensity, reverb: shapedReverb };
  }
  const repairedRecipe = buildFamilySpecificFallbackRecipe({
    option,
    combined,
    rawCombined,
    shapedIntensity,
    shapedReverb,
    isDistant,
  });
  if (repairedRecipe) {
    return repairedRecipe;
  }
  return { kind: "generic", durationSeconds: 0.46, intensity: shapedIntensity, reverb: shapedReverb, cleanBias: 0.88 };
};

const getSoundRecipeSignature = (recipe: SoundRecipe) =>
  [recipe.kind, recipe.variant ?? null, recipe.explosionProfile ?? null].filter((part): part is string => Boolean(part)).join(":");

const usesBannedSharedLowGrowlDefault = (option: DrawingAiSoundOption, recipe: SoundRecipe) => {
  if (recipe.kind === "creature") {
    return recipe.variant == null || /growl|hum|ufo|drone/i.test(recipe.variant);
  }

  if (recipe.kind !== "rumble") {
    return false;
  }

  return option.soundFamily !== "background-rumble";
};

export const inspectSoundOptionRecipe = (option: DrawingAiSoundOption) => {
  const recipe = inferSoundRecipe(option);
  return {
    soundFamily: option.soundFamily ?? null,
    soundProfile: option.soundProfile ?? null,
    negativeConstraints: option.negativeConstraints ?? null,
    kind: recipe.kind,
    durationSeconds: recipe.durationSeconds,
    intensity: recipe.intensity,
    reverb: recipe.reverb,
    cleanBias: recipe.cleanBias ?? null,
    explosionProfile: recipe.explosionProfile ?? null,
    variant: recipe.variant ?? null,
    signature: getSoundRecipeSignature(recipe),
    usesBannedSharedLowGrowlDefault: usesBannedSharedLowGrowlDefault(option, recipe),
  };
};

const addEnvelope = (samples: Float32Array, attackSeconds: number, releaseSeconds: number, peak = 1) => {
  const attackSamples = Math.max(1, Math.floor(attackSeconds * SAMPLE_RATE));
  const releaseSamples = Math.max(1, Math.floor(releaseSeconds * SAMPLE_RATE));
  const sustainSamples = Math.max(0, samples.length - attackSamples - releaseSamples);

  for (let index = 0; index < samples.length; index += 1) {
    let gain = peak;
    if (index < attackSamples) {
      gain = (index / attackSamples) * peak;
    } else if (index >= attackSamples + sustainSamples) {
      const releaseIndex = index - attackSamples - sustainSamples;
      gain = peak * (1 - releaseIndex / releaseSamples);
    }
    samples[index] *= clamp(gain, 0, peak);
  }
};

const applySoftClip = (samples: Float32Array, drive = 1.4) => {
  const normalizedDrive = Math.max(1, drive);
  const normalizer = Math.tanh(normalizedDrive);
  for (let index = 0; index < samples.length; index += 1) {
    samples[index] = Math.tanh(samples[index] * normalizedDrive) / normalizer;
  }
};

const mix = (target: Float32Array, source: Float32Array, gain = 1) => {
  const length = Math.min(target.length, source.length);
  for (let index = 0; index < length; index += 1) {
    target[index] += source[index] * gain;
  }
};

const mixAt = (target: Float32Array, source: Float32Array, startIndex: number, gain = 1) => {
  for (let index = 0; index < source.length; index += 1) {
    const targetIndex = startIndex + index;
    if (targetIndex < 0 || targetIndex >= target.length) {
      break;
    }
    target[targetIndex] += source[index] * gain;
  }
};

const createNoise = (length: number, random: () => number) => {
  const samples = new Float32Array(length);
  for (let index = 0; index < length; index += 1) {
    samples[index] = random() * 2 - 1;
  }
  return samples;
};

const lowPass = (samples: Float32Array, smoothing: number) => {
  let previous = 0;
  const factor = clamp(smoothing, 0.001, 0.999);
  for (let index = 0; index < samples.length; index += 1) {
    previous += (samples[index] - previous) * factor;
    samples[index] = previous;
  }
};

const highPass = (samples: Float32Array, smoothing: number) => {
  let previousInput = 0;
  let previousOutput = 0;
  const factor = clamp(smoothing, 0.001, 0.999);
  for (let index = 0; index < samples.length; index += 1) {
    const currentInput = samples[index];
    const currentOutput = factor * (previousOutput + currentInput - previousInput);
    samples[index] = currentOutput;
    previousInput = currentInput;
    previousOutput = currentOutput;
  }
};

const createSine = (length: number, startHz: number, endHz: number) => {
  const samples = new Float32Array(length);
  let phase = 0;
  for (let index = 0; index < length; index += 1) {
    const t = index / Math.max(1, length - 1);
    const hz = startHz + (endHz - startHz) * t;
    phase += (Math.PI * 2 * hz) / SAMPLE_RATE;
    samples[index] = Math.sin(phase);
  }
  return samples;
};

const createSquare = (length: number, startHz: number, endHz: number) => {
  const base = createSine(length, startHz, endHz);
  for (let index = 0; index < base.length; index += 1) {
    base[index] = base[index] >= 0 ? 1 : -1;
  }
  return base;
};

const createElasticSweep = (
  length: number,
  aHz: number,
  bHz: number,
  cHz: number,
  dHz: number,
) => {
  const samples = new Float32Array(length);
  let phase = 0;
  for (let index = 0; index < length; index += 1) {
    const progress = index / Math.max(1, length - 1);
    const hz =
      progress < 0.28
        ? aHz + (bHz - aHz) * (progress / 0.28)
        : progress < 0.64
          ? bHz + (cHz - bHz) * ((progress - 0.28) / 0.36)
          : cHz + (dHz - cHz) * ((progress - 0.64) / 0.36);
    phase += (Math.PI * 2 * hz) / SAMPLE_RATE;
    samples[index] = Math.sin(phase);
  }
  return samples;
};

const applySlowAmplitudeDrift = (samples: Float32Array, random: () => number, depth = 0.18, segmentCount = 8) => {
  if (samples.length === 0) {
    return;
  }

  const totalSegments = Math.max(2, segmentCount);
  const segmentLength = Math.max(1, Math.floor(samples.length / totalSegments));
  let segmentStart = 0;
  let fromGain = 1 + (random() * 2 - 1) * depth * 0.35;

  while (segmentStart < samples.length) {
    const segmentEnd = Math.min(samples.length, segmentStart + segmentLength);
    const toGain = 1 + (random() * 2 - 1) * depth;
    const divisor = Math.max(1, segmentEnd - segmentStart - 1);

    for (let index = segmentStart; index < segmentEnd; index += 1) {
      const progress = (index - segmentStart) / divisor;
      const gain = clamp(fromGain + (toGain - fromGain) * progress, 0.68, 1.28);
      samples[index] *= gain;
    }

    fromGain = toGain;
    segmentStart = segmentEnd;
  }
};

const createImpactSamples = (length: number, recipe: SoundRecipe, random: () => number) => {
  const output = new Float32Array(length);
  const cleanBias = clamp(recipe.cleanBias ?? 0.76, 0.18, 0.96);
  const variant = recipe.variant ?? "hit";
  const isLanding = variant === "landing";
  const isFallThenImpact = variant === "fall-then-impact";
  const isHardDrop = variant === "hard-drop-body-slam";
  const isSkidIntoHit = variant === "skid-into-hit";
  const isPunch = variant.startsWith("punch:");
  const isHeavyPunch = variant === "heavy-thump-smack" || variant === "punch:heavy-thump-smack";
  const isSnapContact = variant === "snap-contact-hit" || variant === "punch:snap-contact-hit";
  const isKick = variant.startsWith("kick:");
  const isHeavyKick = variant === "kick:heavy-boot-slam";
  const isSnapKick = variant === "kick:snap-kick-crack";
  const isHeavyImpact = variant === "heavy-body-slam";
  const isShortImpact = variant === "short-blunt-thud";

  const pressure = createSine(
    length,
    isLanding ? 118 : isHeavyKick ? 112 : isKick ? 126 : isHeavyImpact ? 118 : isShortImpact ? 150 : isHeavyPunch ? 128 : isSnapContact ? 168 : 142,
    isLanding ? 46 : isHeavyKick ? 42 : isKick ? 56 : isHeavyImpact ? 46 : isShortImpact ? 66 : isHeavyPunch ? 52 : isSnapContact ? 74 : 58,
  );
  addEnvelope(
    pressure,
    0.0018,
    isHardDrop
      ? 0.3
      : isFallThenImpact
        ? 0.24
        : isSkidIntoHit
          ? 0.14
          : isLanding
            ? 0.22
            : isHeavyKick
              ? 0.22
              : isKick
                ? 0.18
                : isHeavyImpact
                  ? 0.24
                  : isShortImpact
                    ? 0.12
                    : isHeavyPunch
                      ? 0.18
                      : isSnapContact
                        ? 0.11
                        : 0.16,
    recipe.intensity * (isHardDrop ? 0.38 : isFallThenImpact ? 0.34 : isHeavyKick ? 0.34 : isKick ? 0.28 : isHeavyImpact ? 0.34 : isHeavyPunch ? 0.3 : 0.26),
  );
  mix(output, pressure, 0.72);

  const body = createSine(
    length,
    isLanding ? 210 : isHeavyKick ? 196 : isKick ? 228 : isHeavyImpact ? 182 : isShortImpact ? 256 : isHeavyPunch ? 228 : isSnapContact ? 284 : 240,
    isLanding ? 88 : isHeavyKick ? 74 : isKick ? 92 : isHeavyImpact ? 72 : isShortImpact ? 122 : isHeavyPunch ? 92 : isSnapContact ? 148 : 106,
  );
  addEnvelope(
    body,
    0.0014,
    isSkidIntoHit || isSnapContact || isSnapKick || isShortImpact ? 0.07 : isHardDrop ? 0.18 : isFallThenImpact || isHeavyKick || isHeavyImpact ? 0.14 : 0.1,
    recipe.intensity * (isHardDrop ? 0.2 : isFallThenImpact ? 0.18 : isHeavyKick ? 0.18 : isHeavyImpact ? 0.18 : isHeavyPunch ? 0.16 : 0.12),
  );
  mix(output, body, isSnapContact || isSnapKick ? 0.18 : isHeavyKick || isHeavyImpact ? 0.28 : 0.24);

  const texture = createNoise(length, random);
  lowPass(texture, isSnapContact || isSnapKick ? 0.12 : isKick ? 0.09 : 0.08);
  highPass(texture, isSnapContact || isSnapKick ? 0.4 : isKick ? 0.32 : 0.24);
  addEnvelope(
    texture,
    0.0009,
    isSnapContact || isSnapKick ? 0.032 : isHeavyKick || isHeavyImpact ? 0.06 : 0.05,
    recipe.intensity * (0.08 + (1 - cleanBias) * 0.05),
  );
  mix(output, texture, isSnapContact || isSnapKick ? 0.12 : isKick ? 0.1 : 0.08);

  if (isFallThenImpact || isHardDrop || isSkidIntoHit) {
    const dropAirLength = Math.max(20, Math.floor(length * (isHardDrop ? 0.32 : 0.24)));
    const dropAir = createNoise(dropAirLength, random);
    lowPass(dropAir, 0.12);
    highPass(dropAir, isSkidIntoHit ? 0.48 : 0.34);
    addEnvelope(dropAir, 0.001, isHardDrop ? 0.08 : 0.06, recipe.intensity * (isHardDrop ? 0.1 : 0.08));
    mixAt(output, dropAir, 0, 0.16);

    const preDrop = createSine(dropAirLength, isHardDrop ? 420 : 560, isHardDrop ? 140 : 220);
    addEnvelope(preDrop, 0.001, 0.05, recipe.intensity * 0.06);
    mixAt(output, preDrop, 0, 0.1);

    if (isSkidIntoHit) {
      const scrapeLength = Math.max(28, Math.floor(length * 0.26));
      const scrape = createNoise(scrapeLength, random);
      lowPass(scrape, 0.08);
      highPass(scrape, 0.26);
      addEnvelope(scrape, 0.001, 0.06, recipe.intensity * 0.08);
      mixAt(output, scrape, Math.max(8, Math.floor(length * 0.16)), 0.18);
    }
  }

  if (isSnapContact || isSnapKick) {
    const click = createSine(length, isSnapKick ? 980 : 1120, isSnapKick ? 360 : 420);
    addEnvelope(click, 0.0005, 0.02, recipe.intensity * 0.08);
    mix(output, click, isSnapKick ? 0.08 : 0.1);
  }

  if (isKick) {
    const sole = createNoise(length, random);
    lowPass(sole, 0.06);
    highPass(sole, 0.18);
    addEnvelope(sole, 0.001, isHeavyKick ? 0.08 : 0.05, recipe.intensity * 0.08);
    mix(output, sole, isHeavyKick ? 0.12 : 0.08);
  }

  if (isPunch) {
    const smack = createNoise(length, random);
    lowPass(smack, isSnapContact ? 0.16 : 0.12);
    highPass(smack, isSnapContact ? 0.48 : 0.38);
    addEnvelope(smack, 0.0007, isHeavyPunch ? 0.04 : 0.028, recipe.intensity * 0.08);
    mix(output, smack, isHeavyPunch ? 0.14 : 0.11);

    const followThrough = createSine(length, isHeavyPunch ? 312 : 420, isHeavyPunch ? 182 : 236);
    addEnvelope(followThrough, 0.001, isHeavyPunch ? 0.06 : 0.034, recipe.intensity * (isHeavyPunch ? 0.08 : 0.05));
    mix(output, followThrough, isHeavyPunch ? 0.12 : 0.08);
  }
  return output;
};

const createBoneBurst = (
  length: number,
  random: () => number,
  config: {
    lowPassSmoothing: number;
    highPassSmoothing: number;
    attackSeconds: number;
    releaseSeconds: number;
    peak: number;
  },
) => {
  const burst = createNoise(length, random);
  lowPass(burst, config.lowPassSmoothing);
  highPass(burst, config.highPassSmoothing);
  addEnvelope(burst, config.attackSeconds, config.releaseSeconds, config.peak);
  return burst;
};

const createBoneCrackSamples = (length: number, recipe: SoundRecipe, random: () => number) => {
  const output = new Float32Array(length);

  const variant = recipe.variant ?? "dry-snap";
  const cleanBias = clamp(recipe.cleanBias ?? 0.84, 0.42, 0.96);
  const isLongForm =
    variant === "compound-fracture-sequence" ||
    variant === "twisting-fracture-runout" ||
    variant === "brittle-snap-aftershock" ||
    recipe.durationSeconds >= 1.2;
  const primaryLength = Math.max(
    40,
    Math.min(Math.floor(SAMPLE_RATE * (isLongForm ? 0.18 : variant === "nasty-fracture" ? 0.16 : 0.12)), Math.floor(length * (isLongForm ? 0.16 : variant === "nasty-fracture" ? 0.32 : 0.22))),
  );
  const detailLength = Math.max(
    28,
    Math.min(Math.floor(SAMPLE_RATE * (isLongForm ? 0.1 : 0.06)), Math.floor(length * (isLongForm ? 0.08 : variant === "nasty-fracture" ? 0.2 : 0.14))),
  );
  const bodyLength = Math.max(
    44,
    Math.min(
      Math.floor(SAMPLE_RATE * (isLongForm ? 0.18 : variant === "nasty-fracture" ? 0.17 : 0.11)),
      Math.floor(length * (isLongForm ? 0.14 : variant === "nasty-fracture" ? 0.34 : variant === "brittle-crack" ? 0.22 : 0.24)),
    ),
  );
  const secondOffset = Math.max(14, Math.floor(length * (isLongForm ? 0.12 : variant === "nasty-fracture" ? 0.11 : 0.08)));
  const thirdOffset = Math.max(secondOffset + 12, Math.floor(length * (isLongForm ? 0.24 : variant === "nasty-fracture" ? 0.2 : 0.15)));

  const primaryCrack = createBoneBurst(primaryLength, random, {
    lowPassSmoothing: variant === "brittle-crack" || variant === "brittle-snap-aftershock" ? 0.18 : variant === "dry-snap" ? 0.28 : 0.24,
    highPassSmoothing:
      variant === "twisting-fracture-runout" ? 0.72 : variant === "nasty-fracture" ? 0.84 : variant === "brittle-crack" || variant === "brittle-snap-aftershock" ? 0.9 : 0.82,
    attackSeconds: 0.0003,
    releaseSeconds: isLongForm ? 0.022 : variant === "nasty-fracture" ? 0.018 : 0.014,
    peak:
      recipe.intensity *
      (variant === "twisting-fracture-runout"
        ? 0.32
        : variant === "nasty-fracture"
          ? 0.34
          : variant === "brittle-crack" || variant === "brittle-snap-aftershock"
            ? 0.26
            : 0.3),
  });
  mixAt(output, primaryCrack, 0, 0.94);

  const brittleClick = createSine(
    detailLength,
    variant === "brittle-crack" ? 1980 : variant === "nasty-fracture" ? 1540 : 1720,
    variant === "brittle-crack" ? 920 : variant === "nasty-fracture" ? 760 : 840,
  );
  addEnvelope(brittleClick, 0.0003, variant === "brittle-crack" ? 0.01 : 0.014, recipe.intensity * (variant === "nasty-fracture" ? 0.12 : 0.1));
  mixAt(output, brittleClick, 0, variant === "brittle-crack" ? 0.2 : 0.14);

  const fractureDetail = createBoneBurst(detailLength, random, {
    lowPassSmoothing: variant === "nasty-fracture" ? 0.14 : 0.18,
    highPassSmoothing: variant === "nasty-fracture" ? 0.7 : 0.78,
    attackSeconds: 0.0004,
    releaseSeconds: variant === "nasty-fracture" ? 0.02 : 0.012,
    peak: recipe.intensity * (variant === "nasty-fracture" ? 0.2 : variant === "brittle-crack" ? 0.08 : 0.12),
  });
  mixAt(output, fractureDetail, secondOffset, variant === "nasty-fracture" ? 0.54 : variant === "brittle-crack" ? 0.24 : 0.34);

  if (variant === "nasty-fracture") {
    const splinter = createBoneBurst(detailLength, random, {
      lowPassSmoothing: 0.12,
      highPassSmoothing: 0.64,
      attackSeconds: 0.0004,
      releaseSeconds: 0.022,
      peak: recipe.intensity * 0.16,
    });
    mixAt(output, splinter, thirdOffset, 0.42);
  }

  if (variant === "brittle-crack") {
    const brittleTailTick = createSine(detailLength, 2120, 1020);
    addEnvelope(brittleTailTick, 0.0003, 0.009, recipe.intensity * 0.08);
    mixAt(output, brittleTailTick, thirdOffset, 0.18);
  }

  const bodyHit = createSine(
    bodyLength,
    variant === "nasty-fracture" ? 246 : variant === "brittle-crack" ? 332 : 238,
    variant === "nasty-fracture" ? 124 : variant === "brittle-crack" ? 228 : 134,
  );
  addEnvelope(bodyHit, 0.0008, variant === "nasty-fracture" ? 0.028 : variant === "brittle-crack" ? 0.018 : 0.024, recipe.intensity * (variant === "brittle-crack" ? 0.08 : 0.12));
  mixAt(output, bodyHit, Math.max(4, Math.floor(secondOffset * 0.45)), variant === "nasty-fracture" ? 0.28 : variant === "brittle-crack" ? 0.16 : 0.3);

  const dryImpact = createBoneBurst(Math.max(24, Math.floor(bodyLength * 0.8)), random, {
    lowPassSmoothing: 0.08,
    highPassSmoothing: 0.38,
    attackSeconds: 0.0006,
    releaseSeconds: 0.018,
    peak: recipe.intensity * (0.08 + (1 - cleanBias) * 0.04),
  });
  mixAt(output, dryImpact, Math.max(5, Math.floor(secondOffset * 0.55)), variant === "nasty-fracture" ? 0.18 : 0.08);

  if (isLongForm) {
    const stressBed = createNoise(length, random);
    lowPass(stressBed, 0.05);
    highPass(stressBed, 0.18);
    applySlowAmplitudeDrift(stressBed, random, variant === "twisting-fracture-runout" ? 0.28 : 0.18, 9);
    addEnvelope(
      stressBed,
      0.03,
      Math.min(0.9, Math.max(0.24, recipe.durationSeconds * 0.42)),
      recipe.intensity * (variant === "twisting-fracture-runout" ? 0.06 : 0.04),
    );
    mix(output, stressBed, 0.12);

    const runoutCount = variant === "twisting-fracture-runout" ? 4 : variant === "compound-fracture-sequence" ? 3 : 2;
    for (let index = 0; index < runoutCount; index += 1) {
      const startProgress =
        variant === "twisting-fracture-runout"
          ? 0.34 + index * 0.12
          : variant === "compound-fracture-sequence"
            ? 0.3 + index * 0.16
            : 0.28 + index * 0.22;
      const burstLength = Math.max(22, Math.min(Math.floor(SAMPLE_RATE * 0.08), Math.floor(length * 0.05)));
      const chatter = createBoneBurst(burstLength, random, {
        lowPassSmoothing: variant === "twisting-fracture-runout" ? 0.12 : 0.18,
        highPassSmoothing: variant === "brittle-snap-aftershock" ? 0.86 : 0.72,
        attackSeconds: 0.0004,
        releaseSeconds: variant === "twisting-fracture-runout" ? 0.03 : 0.018,
        peak: recipe.intensity * (variant === "twisting-fracture-runout" ? 0.12 : 0.08),
      });
      mixAt(output, chatter, Math.floor(length * Math.min(0.92, startProgress)), 0.34);

      const tick = createSine(
        burstLength,
        variant === "brittle-snap-aftershock" ? 1940 - index * 120 : 1280 - index * 90,
        variant === "twisting-fracture-runout" ? 420 - index * 36 : 620 - index * 48,
      );
      addEnvelope(tick, 0.0004, 0.016, recipe.intensity * (variant === "brittle-snap-aftershock" ? 0.05 : 0.04));
      mixAt(output, tick, Math.floor(length * Math.min(0.93, startProgress + 0.02)), 0.12);
    }

    const strain = createSine(
      length,
      variant === "twisting-fracture-runout" ? 248 : 286,
      variant === "twisting-fracture-runout" ? 132 : 178,
    );
    addEnvelope(
      strain,
      0.02,
      Math.min(0.8, Math.max(0.18, recipe.durationSeconds * 0.34)),
      recipe.intensity * (variant === "brittle-snap-aftershock" ? 0.04 : 0.06),
    );
    mix(output, strain, variant === "twisting-fracture-runout" ? 0.12 : 0.08);
  }

  return output;
};

const createWoodCrackSamples = (length: number, recipe: SoundRecipe, random: () => number) => {
  const output = new Float32Array(length);

  const splinter = createNoise(length, random);
  lowPass(splinter, 0.14);
  highPass(splinter, 0.82);
  addEnvelope(splinter, 0.001, 0.08, recipe.intensity * 0.72);
  mix(output, splinter, 0.68);

  const body = createSine(length, 220, 110);
  addEnvelope(body, 0.002, 0.1, recipe.intensity * 0.24);
  mix(output, body, 0.24);

  return output;
};

const createTwigSnapSamples = (length: number, recipe: SoundRecipe, random: () => number) => {
  const output = new Float32Array(length);

  const crack = createNoise(length, random);
  lowPass(crack, 0.18);
  highPass(crack, 0.72);
  addEnvelope(crack, 0.0007, 0.034, recipe.intensity * 0.54);
  mix(output, crack, 0.44);

  const snap = createSine(length, 1480, 520);
  addEnvelope(snap, 0.0006, 0.022, recipe.intensity * 0.18);
  mix(output, snap, 0.18);

  const body = createSine(length, recipe.variant === "branch" ? 182 : 206, recipe.variant === "branch" ? 94 : 122);
  addEnvelope(body, 0.0012, 0.064, recipe.intensity * (recipe.variant === "branch" ? 0.18 : 0.14));
  mix(output, body, 0.2);

  if (recipe.variant === "distant") {
    const air = createNoise(length, random);
    lowPass(air, 0.06);
    addEnvelope(air, 0.01, 0.08, recipe.intensity * 0.04);
    mix(output, air, 0.08);
  }

  return output;
};

const createRustleSamples = (length: number, recipe: SoundRecipe, random: () => number) => {
  const output = new Float32Array(length);
  const cleanBias = clamp(recipe.cleanBias ?? 0.86, 0.18, 0.96);
  const variant = recipe.variant ?? "leaves";

  const bed = createNoise(length, random);
  lowPass(bed, variant === "cloth" ? 0.055 : 0.07);
  highPass(bed, variant === "cloth" ? 0.18 : variant === "grass" ? 0.3 : 0.26);
  applySlowAmplitudeDrift(bed, random, variant === "cloth" ? 0.12 : 0.18, 9);
  addEnvelope(bed, 0.01, 0.24, recipe.intensity * (variant === "cloth" ? 0.14 : 0.18));
  mix(output, bed, 0.2);

  const movement = createNoise(length, random);
  lowPass(movement, variant === "cloth" ? 0.08 : 0.12);
  highPass(movement, variant === "debris" ? 0.4 : variant === "cloth" ? 0.24 : 0.34);
  applySlowAmplitudeDrift(movement, random, 0.22, 7);
  addEnvelope(movement, 0.006, 0.16, recipe.intensity * (variant === "debris" ? 0.14 : 0.1));
  mix(output, movement, variant === "cloth" ? 0.14 : 0.18);

  const body = createSine(
    length,
    variant === "cloth" ? 122 : variant === "grass" ? 164 : 152,
    variant === "cloth" ? 86 : variant === "grass" ? 118 : 104,
  );
  addEnvelope(body, 0.012, 0.18, recipe.intensity * (variant === "cloth" ? 0.08 : 0.06));
  mix(output, body, 0.08);

  if (variant === "debris" || cleanBias < 0.72) {
    const detail = createNoise(length, random);
    lowPass(detail, 0.16);
    highPass(detail, 0.56);
    addEnvelope(detail, 0.002, 0.04, recipe.intensity * 0.05);
    mix(output, detail, 0.06);
  }

  return output;
};

const createCreakSamples = (length: number, recipe: SoundRecipe, random: () => number) => {
  const output = createSine(length, 148, 112);
  addEnvelope(output, 0.03, 0.3, recipe.intensity * 0.12);

  const scrape = createNoise(length, random);
  lowPass(scrape, 0.12);
  highPass(scrape, 0.38);
  addEnvelope(scrape, 0.012, 0.22, recipe.intensity * 0.08);
  mix(output, scrape, 0.1);
  return output;
};

const createRumbleSamples = (length: number, recipe: SoundRecipe, random: () => number) => {
  const output = createSine(length, 52, 34);
  addEnvelope(output, 0.03, 0.38, recipe.intensity * 0.28);

  const lowNoise = createNoise(length, random);
  lowPass(lowNoise, 0.025);
  addEnvelope(lowNoise, 0.02, 0.4, recipe.intensity * 0.12);
  mix(output, lowNoise, 0.24);

  const body = createSine(length, 104, 58);
  addEnvelope(body, 0.03, 0.28, recipe.intensity * 0.12);
  mix(output, body, 0.18);
  return output;
};

const createWindSamples = (length: number, recipe: SoundRecipe, random: () => number) => {
  const output = new Float32Array(length);
  const variant = recipe.variant ?? "soft-bed";

  const bed = createNoise(length, random);
  lowPass(bed, variant === "full-pass" ? 0.08 : variant === "gust-pass" ? 0.06 : 0.07);
  highPass(bed, variant === "full-pass" ? 0.1 : 0.14);
  applySlowAmplitudeDrift(bed, random, 0.16, 12);
  addEnvelope(bed, 0.12, 0.44, recipe.intensity * (variant === "full-pass" ? 0.16 : variant === "soft-bed" ? 0.14 : 0.11));
  mix(output, bed, variant === "soft-bed" ? 0.28 : 0.22);

  const motion = createNoise(length, random);
  lowPass(motion, variant === "gust-pass" ? 0.12 : 0.1);
  highPass(motion, variant === "gust-pass" ? 0.34 : variant === "full-pass" ? 0.22 : 0.28);
  applySlowAmplitudeDrift(motion, random, variant === "gust-pass" ? 0.28 : 0.2, 9);
  addEnvelope(motion, 0.05, 0.34, recipe.intensity * (variant === "gust-pass" ? 0.13 : variant === "soft-bed" ? 0.1 : 0.11));
  mix(output, motion, variant === "gust-pass" ? 0.28 : variant === "soft-bed" ? 0.2 : 0.18);

  const body = createNoise(length, random);
  lowPass(body, variant === "full-pass" ? 0.16 : 0.12);
  highPass(body, variant === "full-pass" ? 0.18 : 0.24);
  applySlowAmplitudeDrift(body, random, variant === "full-pass" ? 0.18 : 0.14, 7);
  addEnvelope(body, 0.08, 0.38, recipe.intensity * (variant === "full-pass" ? 0.12 : variant === "soft-bed" ? 0.09 : 0.08));
  mix(output, body, variant === "full-pass" ? 0.22 : variant === "soft-bed" ? 0.16 : 0.14);

  const crossCurrent = createNoise(length, random);
  lowPass(crossCurrent, variant === "gust-pass" ? 0.14 : 0.12);
  highPass(crossCurrent, variant === "soft-bed" ? 0.28 : variant === "full-pass" ? 0.24 : 0.34);
  applySlowAmplitudeDrift(crossCurrent, random, variant === "gust-pass" ? 0.32 : 0.24, 8);
  addEnvelope(crossCurrent, 0.03, variant === "soft-bed" ? 0.44 : 0.34, recipe.intensity * (variant === "gust-pass" ? 0.11 : variant === "soft-bed" ? 0.09 : 0.1));
  mix(output, crossCurrent, variant === "soft-bed" ? 0.18 : 0.2);

  const airyLayer = createNoise(length, random);
  lowPass(airyLayer, 0.18);
  highPass(airyLayer, variant === "gust-pass" ? 0.62 : 0.54);
  applySlowAmplitudeDrift(airyLayer, random, variant === "gust-pass" ? 0.26 : 0.18, 11);
  addEnvelope(airyLayer, 0.04, variant === "gust-pass" ? 0.24 : 0.34, recipe.intensity * (variant === "gust-pass" ? 0.09 : 0.07));
  mix(output, airyLayer, variant === "gust-pass" ? 0.18 : 0.16);

  const shimmer = createNoise(length, random);
  lowPass(shimmer, 0.24);
  highPass(shimmer, variant === "gust-pass" ? 0.68 : 0.6);
  applySlowAmplitudeDrift(shimmer, random, variant === "gust-pass" ? 0.24 : 0.16, 13);
  addEnvelope(shimmer, 0.02, variant === "soft-bed" ? 0.4 : 0.26, recipe.intensity * (variant === "gust-pass" ? 0.06 : 0.045));
  mix(output, shimmer, variant === "soft-bed" ? 0.12 : 0.1);

  if (variant === "gust-pass") {
    const gustAccent = createNoise(length, random);
    lowPass(gustAccent, 0.16);
    highPass(gustAccent, 0.42);
    applyPassByGain(gustAccent, {
      startGain: 0.1,
      peakGain: 0.92,
      endGain: 0.18,
      peakPoint: 0.46,
      passPoint: 0.66,
    });
    addEnvelope(gustAccent, 0.04, 0.22, recipe.intensity * 0.08);
    mix(output, gustAccent, 0.14);
  }

  applySoftClip(output, variant === "gust-pass" ? 1.48 : 1.62);
  return output;
};

const createDoorCreakPulse = (length: number, startHz: number, endHz: number, recipe: SoundRecipe, random: () => number) => {
  const output = new Float32Array(length);

  const friction = createNoise(length, random);
  lowPass(friction, 0.12);
  highPass(friction, 0.42);
  addEnvelope(friction, 0.002, 0.07, recipe.intensity * 0.14);
  mix(output, friction, 0.42);

  const rasp = createNoise(length, random);
  lowPass(rasp, 0.22);
  highPass(rasp, 0.72);
  addEnvelope(rasp, 0.0012, 0.03, recipe.intensity * 0.05);
  mix(output, rasp, 0.16);

  const hingeBody = createSine(length, startHz, endHz);
  addEnvelope(hingeBody, 0.006, 0.05, recipe.intensity * 0.04);
  mix(output, hingeBody, 0.08);

  return output;
};

const createDoorCreakSamples = (length: number, recipe: SoundRecipe, random: () => number) => {
  const output = new Float32Array(length);
  const woodMass = createNoise(length, random);
  lowPass(woodMass, 0.026);
  highPass(woodMass, 0.08);
  applySlowAmplitudeDrift(woodMass, random, 0.08, 9);
  addEnvelope(woodMass, 0.08, 0.64, recipe.intensity * 0.05);
  mix(output, woodMass, 0.18);

  const pressure = createSine(length, 146, 84);
  addEnvelope(pressure, 0.03, 0.24, recipe.intensity * 0.04);
  mix(output, pressure, 0.08);

  const pulseConfigs = [
    { start: 0.06, lengthScale: 0.12, startHz: 228, endHz: 152, gain: 0.72 },
    { start: 0.24, lengthScale: 0.09, startHz: 206, endHz: 138, gain: 0.56 },
    { start: 0.47, lengthScale: 0.15, startHz: 188, endHz: 124, gain: 0.8 },
    { start: 0.76, lengthScale: 0.11, startHz: 172, endHz: 116, gain: 0.5 },
  ];

  pulseConfigs.forEach((config) => {
    const pulseLength = Math.max(80, Math.floor(length * config.lengthScale));
    const pulse = createDoorCreakPulse(pulseLength, config.startHz, config.endHz, recipe, random);
    mixAt(output, pulse, Math.floor(length * config.start), config.gain);
  });

  const frictionBed = createNoise(length, random);
  lowPass(frictionBed, 0.06);
  highPass(frictionBed, 0.22);
  addEnvelope(frictionBed, 0.04, 0.42, recipe.intensity * 0.04);
  mix(output, frictionBed, 0.12);

  const room = createNoise(length, random);
  lowPass(room, 0.016);
  addEnvelope(room, 0.08, 0.42, recipe.intensity * 0.018);
  mix(output, room, 0.04);
  return output;
};

const createHingeCreakSamples = (length: number, recipe: SoundRecipe, random: () => number) => {
  const output = new Float32Array(length);
  const pulseConfigs = [
    { start: 0.07, lengthScale: 0.08, startHz: 268, endHz: 192, gain: 0.78 },
    { start: 0.17, lengthScale: 0.06, startHz: 252, endHz: 182, gain: 0.58 },
    { start: 0.36, lengthScale: 0.09, startHz: 232, endHz: 168, gain: 0.74 },
    { start: 0.58, lengthScale: 0.07, startHz: 214, endHz: 156, gain: 0.62 },
    { start: 0.79, lengthScale: 0.08, startHz: 198, endHz: 146, gain: 0.56 },
  ];

  pulseConfigs.forEach((config) => {
    const pulseLength = Math.max(58, Math.floor(length * config.lengthScale));
    const pulse = createDoorCreakPulse(pulseLength, config.startHz, config.endHz, recipe, random);
    mixAt(output, pulse, Math.floor(length * config.start), config.gain);
  });

  const hingeBody = createSine(length, 176, 132);
  addEnvelope(hingeBody, 0.016, 0.18, recipe.intensity * 0.03);
  mix(output, hingeBody, 0.08);

  const dryAir = createNoise(length, random);
  lowPass(dryAir, 0.024);
  addEnvelope(dryAir, 0.03, 0.22, recipe.intensity * 0.01);
  mix(output, dryAir, 0.02);
  return output;
};

const createWoodStrainSamples = (length: number, recipe: SoundRecipe, random: () => number) => {
  const output = new Float32Array(length);
  const groan = createNoise(length, random);
  lowPass(groan, 0.032);
  highPass(groan, 0.08);
  applySlowAmplitudeDrift(groan, random, 0.1, 8);
  addEnvelope(groan, 0.07, 0.82, recipe.intensity * 0.08);
  mix(output, groan, 0.24);

  const strain = createSine(length, 116, 64);
  addEnvelope(strain, 0.05, 0.38, recipe.intensity * 0.08);
  mix(output, strain, 0.12);

  const pulseStarts = [0.16, 0.52, 0.78];
  pulseStarts.forEach((position, pulseIndex) => {
    const pulseLength = Math.max(90, Math.floor(length * (pulseIndex === 1 ? 0.16 : 0.11)));
    const pulse = createDoorCreakPulse(pulseLength, 178 - pulseIndex * 18, 118 - pulseIndex * 12, recipe, random);
    mixAt(output, pulse, Math.floor(length * position), pulseIndex === 1 ? 0.48 : 0.32);
  });

  const friction = createNoise(length, random);
  lowPass(friction, 0.045);
  highPass(friction, 0.3);
  addEnvelope(friction, 0.03, 0.46, recipe.intensity * 0.045);
  mix(output, friction, 0.12);

  const room = createNoise(length, random);
  lowPass(room, 0.014);
  addEnvelope(room, 0.08, 0.48, recipe.intensity * 0.018);
  mix(output, room, 0.04);
  return output;
};

const createRoomToneSamples = (length: number, recipe: SoundRecipe, random: () => number) => {
  const output = new Float32Array(length);

  const bed = createNoise(length, random);
  lowPass(bed, 0.014);
  applySlowAmplitudeDrift(bed, random, 0.08, 12);
  addEnvelope(bed, 0.14, 0.34, recipe.intensity * 0.05);
  mix(output, bed, 0.18);

  const air = createNoise(length, random);
  lowPass(air, 0.04);
  highPass(air, recipe.variant === "hallway" ? 0.12 : 0.08);
  applySlowAmplitudeDrift(air, random, 0.1, 10);
  addEnvelope(air, 0.08, 0.3, recipe.intensity * 0.03);
  mix(output, air, 0.12);

  if (recipe.variant === "hallway") {
    const corridorPresence = createNoise(length, random);
    lowPass(corridorPresence, 0.08);
    highPass(corridorPresence, 0.24);
    applySlowAmplitudeDrift(corridorPresence, random, 0.14, 9);
    addEnvelope(corridorPresence, 0.06, 0.22, recipe.intensity * 0.018);
    mix(output, corridorPresence, 0.08);
  }
  return output;
};

const createUiBeepSamples = (length: number, recipe: SoundRecipe) => {
  const isMenuChirp = recipe.variant === "menu-chirp";
  if (isMenuChirp) {
    const output = new Float32Array(length);
    const chirpLength = Math.max(1, Math.floor(length * 0.52));

    const first = createSine(chirpLength, 1960, 1320);
    addEnvelope(first, 0.0012, 0.03, recipe.intensity * 0.16);
    mixAt(output, first, 0, 0.34);

    const second = createSine(Math.max(1, Math.floor(length * 0.42)), 1680, 1080);
    addEnvelope(second, 0.001, 0.026, recipe.intensity * 0.12);
    mixAt(output, second, Math.floor(length * 0.24), 0.18);

    const body = createSine(length, 980, 760);
    addEnvelope(body, 0.002, 0.05, recipe.intensity * 0.06);
    mix(output, body, 0.08);
    return output;
  }

  const output = createSine(length, 1240, 920);
  addEnvelope(output, 0.0015, 0.055, recipe.intensity * 0.18);

  const pulse = createSine(length, 780, 640);
  addEnvelope(pulse, 0.0016, 0.06, recipe.intensity * 0.1);
  mix(output, pulse, 0.22);

  const harmonic = createSine(length, 1640, 1180);
  addEnvelope(harmonic, 0.0012, 0.04, recipe.intensity * 0.06);
  mix(output, harmonic, 0.1);
  return output;
};

const createZipperSamples = (length: number, recipe: SoundRecipe, random: () => number) => {
  const output = new Float32Array(length);
  const variant = recipe.variant ?? "metal-tooth-zip";
  const segmentCount =
    variant === "slow-jacket-unzip" ? 10 : variant === "close-detail-zip-click" ? 14 : 18;
  const segmentStride = Math.max(6, Math.floor(length / Math.max(1, segmentCount)));

  for (let index = 0; index < segmentCount; index += 1) {
    const tickLength = Math.max(10, Math.floor(segmentStride * (variant === "slow-jacket-unzip" ? 0.72 : 0.46)));
    const tick = createNoise(tickLength, random);
    lowPass(tick, variant === "close-detail-zip-click" ? 0.18 : 0.14);
    highPass(tick, variant === "slow-jacket-unzip" ? 0.38 : 0.44);
    addEnvelope(
      tick,
      0.0008,
      variant === "slow-jacket-unzip" ? 0.018 : 0.012,
      recipe.intensity * (variant === "close-detail-zip-click" ? 0.03 : 0.038),
    );
    const jitter = Math.floor((random() - 0.5) * segmentStride * 0.14);
    mixAt(output, tick, Math.max(0, index * segmentStride + jitter), variant === "slow-jacket-unzip" ? 0.22 : 0.28);
  }

  const scrape = createNoise(length, random);
  lowPass(scrape, variant === "close-detail-zip-click" ? 0.14 : 0.12);
  highPass(scrape, variant === "slow-jacket-unzip" ? 0.26 : 0.34);
  applySlowAmplitudeDrift(scrape, random, variant === "slow-jacket-unzip" ? 0.12 : 0.18, 10);
  addEnvelope(scrape, 0.01, 0.08, recipe.intensity * (variant === "close-detail-zip-click" ? 0.05 : 0.065));
  mix(output, scrape, variant === "slow-jacket-unzip" ? 0.18 : 0.24);

  const toothBody = createSine(length, variant === "slow-jacket-unzip" ? 880 : 1080, variant === "slow-jacket-unzip" ? 620 : 760);
  addEnvelope(toothBody, 0.002, variant === "slow-jacket-unzip" ? 0.06 : 0.04, recipe.intensity * 0.028);
  mix(output, toothBody, variant === "close-detail-zip-click" ? 0.12 : 0.08);

  const finishClickLength = Math.max(8, Math.floor(length * 0.14));
  const finishClick = createNoise(finishClickLength, random);
  lowPass(finishClick, 0.2);
  highPass(finishClick, 0.5);
  addEnvelope(finishClick, 0.0005, 0.012, recipe.intensity * 0.032);
  mixAt(output, finishClick, Math.max(0, length - finishClickLength - 1), 0.34);

  applySoftClip(output, variant === "close-detail-zip-click" ? 1.24 : 1.34);
  return output;
};

const createButtonClickSamples = (length: number, recipe: SoundRecipe, random: () => number) => {
  const output = new Float32Array(length);
  const tick = createNoise(length, random);
  highPass(tick, 0.52);
  lowPass(tick, 0.16);
  addEnvelope(tick, 0.0006, 0.008, recipe.intensity * 0.04);
  mix(output, tick, 0.08);

  const clickBody = createSquare(length, recipe.variant === "click-beep" ? 720 : 860, recipe.variant === "click-beep" ? 440 : 560);
  addEnvelope(clickBody, 0.0006, recipe.variant === "click-beep" ? 0.022 : 0.016, recipe.intensity * 0.08);
  mix(output, clickBody, 0.18);

  const clickResonance = createSine(length, recipe.variant === "click-beep" ? 580 : 720, recipe.variant === "click-beep" ? 340 : 460);
  addEnvelope(clickResonance, 0.0008, recipe.variant === "click-beep" ? 0.028 : 0.02, recipe.intensity * (recipe.variant === "click-beep" ? 0.12 : 0.08));
  mix(output, clickResonance, recipe.variant === "click-beep" ? 0.24 : 0.18);

  if (recipe.variant === "click-beep") {
    const beepLength = Math.max(1, Math.floor(length * 0.82));
    const beep = createSine(beepLength, 1080, 820);
    addEnvelope(beep, 0.0018, 0.065, recipe.intensity * 0.1);
    mixAt(output, beep, Math.floor(length * 0.06), 0.12);
  }
  return output;
};

const createLightningStrikeSamples = (length: number, recipe: SoundRecipe, random: () => number) => {
  const output = new Float32Array(length);
  const variant = recipe.variant ?? "flash-crack";

  const crack = createNoise(length, random);
  highPass(crack, 0.86);
  lowPass(crack, 0.22);
  addEnvelope(crack, 0.0004, 0.028, recipe.intensity * 0.26);
  mix(output, crack, 0.3);

  const flash = createSine(length, 2400, 920);
  addEnvelope(flash, 0.0004, 0.022, recipe.intensity * 0.12);
  mix(output, flash, 0.14);

  const body = createNoise(length, random);
  lowPass(body, 0.05);
  highPass(body, 0.08);
  addEnvelope(body, 0.003, variant === "rolling-tail" ? 0.38 : variant === "storm-body" ? 0.44 : 0.18, recipe.intensity * (variant === "flash-crack" ? 0.06 : 0.1));
  mix(output, body, 0.18);

  const thunder = createSine(length, variant === "flash-crack" ? 164 : 182, variant === "flash-crack" ? 84 : 54);
  addEnvelope(thunder, 0.004, variant === "rolling-tail" ? 0.36 : variant === "storm-body" ? 0.42 : 0.18, recipe.intensity * (variant === "flash-crack" ? 0.08 : 0.16));
  mix(output, thunder, 0.22);

  const tail = createNoise(length, random);
  lowPass(tail, 0.02);
  addEnvelope(tail, 0.02, variant === "rolling-tail" ? 0.62 : variant === "storm-body" ? 0.44 : 0.22, recipe.intensity * (variant === "flash-crack" ? 0.03 : 0.08));
  mix(output, tail, 0.08);

  return output;
};

const createElectricitySamples = (length: number, recipe: SoundRecipe, random: () => number) => {
  const output = new Float32Array(length);

  const crackle = createNoise(length, random);
  highPass(crackle, 0.78);
  lowPass(crackle, 0.24);
  applySlowAmplitudeDrift(crackle, random, 0.36, 10);
  addEnvelope(crackle, 0.001, 0.12, recipe.intensity * 0.14);
  mix(output, crackle, 0.2);

  const arc = createSquare(length, recipe.variant === "arc" ? 1240 : 760, recipe.variant === "arc" ? 520 : 380);
  addEnvelope(arc, 0.001, 0.08, recipe.intensity * 0.1);
  mix(output, arc, 0.16);

  const powerBody = createSine(length, recipe.variant === "arc" ? 220 : 180, recipe.variant === "arc" ? 120 : 110);
  addEnvelope(powerBody, 0.006, 0.1, recipe.intensity * 0.05);
  mix(output, powerBody, 0.08);

  return output;
};

const createVolcanoEruptionSamples = (length: number, recipe: SoundRecipe, random: () => number) => {
  const output = new Float32Array(length);
  const variant = recipe.variant ?? "lava-debris-eruption";

  const pressure = createSine(
    length,
    variant === "pressure-vent-burst" ? 96 : variant === "ash-plume-rollout" ? 76 : 82,
    variant === "pressure-vent-burst" ? 42 : variant === "ash-plume-rollout" ? 34 : 30,
  );
  addEnvelope(pressure, 0.05, variant === "pressure-vent-burst" ? 0.42 : variant === "ash-plume-rollout" ? 0.7 : 0.62, recipe.intensity * (variant === "pressure-vent-burst" ? 0.12 : 0.16));
  mix(output, pressure, variant === "ash-plume-rollout" ? 0.14 : 0.22);

  const body = createSine(
    length,
    variant === "pressure-vent-burst" ? 152 : variant === "ash-plume-rollout" ? 118 : 134,
    variant === "pressure-vent-burst" ? 74 : variant === "ash-plume-rollout" ? 62 : 52,
  );
  addEnvelope(body, 0.03, variant === "pressure-vent-burst" ? 0.3 : variant === "ash-plume-rollout" ? 0.52 : 0.44, recipe.intensity * (variant === "lava-debris-eruption" ? 0.18 : 0.12));
  mix(output, body, variant === "pressure-vent-burst" ? 0.16 : 0.2);

  const debris = createNoise(length, random);
  lowPass(debris, variant === "ash-plume-rollout" ? 0.08 : 0.1);
  highPass(debris, variant === "pressure-vent-burst" ? 0.32 : 0.22);
  applySlowAmplitudeDrift(debris, random, variant === "ash-plume-rollout" ? 0.24 : 0.18, 8);
  addEnvelope(debris, 0.03, variant === "ash-plume-rollout" ? 0.58 : 0.4, recipe.intensity * (variant === "pressure-vent-burst" ? 0.14 : 0.12));
  mix(output, debris, variant === "lava-debris-eruption" ? 0.24 : 0.18);

  const rockBurstCount = variant === "pressure-vent-burst" ? 3 : variant === "ash-plume-rollout" ? 4 : 5;
  for (let index = 0; index < rockBurstCount; index += 1) {
    const burstLength = Math.max(28, Math.min(Math.floor(SAMPLE_RATE * 0.08), Math.floor(length * 0.06)));
    const rockBurst = createNoise(burstLength, random);
    lowPass(rockBurst, 0.18);
    highPass(rockBurst, 0.52);
    addEnvelope(rockBurst, 0.0007, variant === "ash-plume-rollout" ? 0.05 : 0.036, recipe.intensity * (variant === "pressure-vent-burst" ? 0.08 : 0.1));
    const startIndex = Math.floor(length * (variant === "pressure-vent-burst" ? 0.08 + index * 0.11 : 0.12 + index * 0.12));
    mixAt(output, rockBurst, Math.min(length - burstLength, startIndex), 0.2);
  }

  if (variant === "ash-plume-rollout") {
    const ash = createNoise(length, random);
    lowPass(ash, 0.06);
    highPass(ash, 0.26);
    applySlowAmplitudeDrift(ash, random, 0.18, 10);
    addEnvelope(ash, 0.06, 0.68, recipe.intensity * 0.08);
    mix(output, ash, 0.16);
  }

  if (variant === "pressure-vent-burst") {
    const vent = createNoise(length, random);
    highPass(vent, 0.56);
    lowPass(vent, 0.18);
    addEnvelope(vent, 0.002, 0.08, recipe.intensity * 0.08);
    mix(output, vent, 0.12);
  }

  if (variant !== "pressure-vent-burst") {
    const hotGrit = createNoise(length, random);
    lowPass(hotGrit, 0.12);
    highPass(hotGrit, 0.4);
    applySlowAmplitudeDrift(hotGrit, random, 0.2, 9);
    addEnvelope(hotGrit, 0.02, variant === "ash-plume-rollout" ? 0.44 : 0.28, recipe.intensity * 0.07);
    mix(output, hotGrit, variant === "ash-plume-rollout" ? 0.14 : 0.12);
  }

  return output;
};

const createPebbleWaterSamples = (length: number, recipe: SoundRecipe, random: () => number) => {
  const output = new Float32Array(length);

  const pebble = createNoise(length, random);
  highPass(pebble, 0.72);
  lowPass(pebble, 0.2);
  addEnvelope(pebble, 0.0006, 0.018, recipe.intensity * 0.12);
  mix(output, pebble, 0.12);

  const plip = createSine(length, recipe.variant === "splash" ? 780 : 920, recipe.variant === "splash" ? 260 : 340);
  addEnvelope(plip, 0.0012, recipe.variant === "splash" ? 0.11 : 0.08, recipe.intensity * 0.16);
  mix(output, plip, 0.24);

  const ripple = createSine(length, 320, 140);
  addEnvelope(ripple, 0.01, 0.16, recipe.intensity * 0.05);
  mix(output, ripple, 0.08);

  return output;
};

const createFootstepSamples = (length: number, recipe: SoundRecipe, random: () => number) => {
  const output = new Float32Array(length);
  const variant = recipe.variant ?? "hard-floor";
  const isStone = variant === "stone";
  const isConcrete = variant === "concrete";
  const isSneak = variant === "sneak";
  const isDistant = variant === "distant";
  const isSoftQuiet = variant === "soft-quiet";
  const isGiantStep = variant === "giant-ground-stomp";
  const isChaseHeavy = variant === "heavy-chase-footfalls";
  const isTitanStep = variant === "weighted-titan-step";

  const thump = createSine(
    length,
    isGiantStep ? 122 : isChaseHeavy ? 134 : isTitanStep ? 116 : isConcrete ? 152 : isSoftQuiet ? 174 : isSneak ? 166 : isDistant ? 160 : 168,
    isGiantStep ? 48 : isChaseHeavy ? 54 : isTitanStep ? 44 : isConcrete ? 84 : isSoftQuiet ? 112 : isSneak ? 118 : isDistant ? 108 : 96,
  );
  addEnvelope(
    thump,
    0.0012,
    isGiantStep ? 0.16 : isChaseHeavy ? 0.14 : isTitanStep ? 0.18 : isSoftQuiet ? 0.05 : 0.06,
    recipe.intensity * (isGiantStep ? 0.16 : isChaseHeavy ? 0.14 : isTitanStep ? 0.18 : isDistant ? 0.07 : isSoftQuiet ? 0.06 : 0.1),
  );
  mix(output, thump, isGiantStep || isChaseHeavy || isTitanStep ? 0.28 : isSoftQuiet ? 0.12 : 0.18);

  const surface = createNoise(length, random);
  lowPass(surface, isStone ? 0.12 : isGiantStep || isChaseHeavy || isTitanStep ? 0.08 : isSneak ? 0.08 : 0.09);
  highPass(surface, isStone ? 0.42 : isConcrete ? 0.32 : isGiantStep || isChaseHeavy ? 0.22 : isTitanStep ? 0.18 : isSneak ? 0.36 : 0.28);
  addEnvelope(
    surface,
    0.001,
    isGiantStep || isChaseHeavy || isTitanStep ? 0.08 : isDistant ? 0.06 : 0.05,
    recipe.intensity * (isStone ? 0.16 : isGiantStep ? 0.18 : isChaseHeavy ? 0.16 : isTitanStep ? 0.14 : isSneak ? 0.14 : isSoftQuiet ? 0.09 : 0.12),
  );
  mix(output, surface, isStone ? 0.22 : isGiantStep || isChaseHeavy ? 0.22 : isTitanStep ? 0.18 : isSoftQuiet ? 0.12 : 0.16);

  const click = createSine(
    length,
    isStone ? 740 : isGiantStep ? 360 : isChaseHeavy ? 420 : isTitanStep ? 340 : isSneak ? 620 : 520,
    isStone ? 320 : isGiantStep ? 120 : isChaseHeavy ? 160 : isTitanStep ? 118 : isSneak ? 280 : 240,
  );
  addEnvelope(
    click,
    0.0008,
    isGiantStep || isTitanStep ? 0.03 : isSoftQuiet ? 0.016 : 0.022,
    recipe.intensity * (isStone ? 0.08 : isGiantStep ? 0.05 : isChaseHeavy ? 0.06 : isTitanStep ? 0.04 : isSneak ? 0.06 : 0.05),
  );
  mix(output, click, isDistant ? 0.05 : isGiantStep || isTitanStep ? 0.06 : 0.08);

  const toeOffset = Math.max(6, Math.floor(length * (isSneak ? 0.08 : 0.12)));
  const toeTapLength = Math.max(18, Math.floor(length * 0.18));
  const toeTap = createNoise(toeTapLength, random);
  lowPass(toeTap, isStone ? 0.14 : 0.1);
  highPass(toeTap, isStone ? 0.5 : 0.34);
  addEnvelope(toeTap, 0.0006, isSoftQuiet ? 0.02 : 0.028, recipe.intensity * (isSoftQuiet ? 0.04 : 0.06));
  mixAt(output, toeTap, toeOffset, isSoftQuiet ? 0.1 : 0.14);

  if (!isSoftQuiet && !isDistant) {
    const scuffLength = Math.max(22, Math.floor(length * 0.22));
    const scuff = createNoise(scuffLength, random);
    lowPass(scuff, 0.08);
    highPass(scuff, isStone ? 0.34 : 0.24);
    addEnvelope(scuff, 0.0014, 0.038, recipe.intensity * (isStone ? 0.08 : 0.06));
    mixAt(output, scuff, Math.max(4, toeOffset - Math.floor(scuffLength * 0.2)), 0.12);
  }

  if (isGiantStep || isChaseHeavy || isTitanStep) {
    const body = createSine(length, isTitanStep ? 88 : 96, isTitanStep ? 34 : 38);
    addEnvelope(body, 0.01, isTitanStep ? 0.28 : 0.22, recipe.intensity * (isTitanStep ? 0.18 : 0.14));
    mix(output, body, isTitanStep ? 0.22 : 0.18);

    const grit = createNoise(length, random);
    lowPass(grit, 0.05);
    highPass(grit, 0.16);
    addEnvelope(grit, 0.006, isChaseHeavy ? 0.14 : 0.1, recipe.intensity * 0.06);
    mix(output, grit, 0.1);

    if (isChaseHeavy) {
      const secondStepLength = Math.max(34, Math.floor(length * 0.34));
      const secondStep = createSine(secondStepLength, 132, 54);
      addEnvelope(secondStep, 0.001, 0.08, recipe.intensity * 0.1);
      mixAt(output, secondStep, Math.max(12, Math.floor(length * 0.42)), 0.24);
    }
  }

  if (isDistant || isSoftQuiet) {
    const air = createNoise(length, random);
    lowPass(air, 0.04);
    addEnvelope(air, 0.008, 0.08, recipe.intensity * 0.03);
    mix(output, air, 0.06);
  }

  return output;
};

const createRainSamples = (length: number, recipe: SoundRecipe, random: () => number) => {
  const output = new Float32Array(length);
  const variant = recipe.variant ?? "light-bed";
  const isStorm = variant === "storm-sheet" || variant === "storm";
  const isWindow = variant === "window";
  const isStormFight = variant === "storm-fight-rain";
  const isHeavyRainBrawl = variant === "heavy-rain-brawl";
  const isThunderRainClash = variant === "thunder-rain-clash";
  const isCombatRain = isStormFight || isHeavyRainBrawl || isThunderRainClash;

  const bed = createNoise(length, random);
  lowPass(bed, isStorm || isHeavyRainBrawl ? 0.12 : isWindow ? 0.09 : 0.08);
  highPass(bed, isWindow ? 0.28 : isCombatRain ? 0.18 : 0.22);
  applySlowAmplitudeDrift(bed, random, isStorm || isCombatRain ? 0.2 : 0.14, 14);
  addEnvelope(
    bed,
    0.03,
    0.42,
    recipe.intensity * (isHeavyRainBrawl ? 0.2 : isStorm || isCombatRain ? 0.18 : isWindow ? 0.12 : 0.11),
  );
  mix(output, bed, isStorm || isCombatRain ? 0.32 : isWindow ? 0.24 : 0.3);

  const surface = createNoise(length, random);
  lowPass(surface, isStorm || isHeavyRainBrawl ? 0.06 : isWindow ? 0.08 : 0.07);
  highPass(surface, isStorm ? 0.14 : isWindow ? 0.24 : isCombatRain ? 0.16 : 0.18);
  applySlowAmplitudeDrift(surface, random, isStorm || isCombatRain ? 0.22 : 0.16, 10);
  addEnvelope(surface, 0.02, 0.4, recipe.intensity * (isStorm || isCombatRain ? 0.18 : isWindow ? 0.11 : 0.1));
  mix(output, surface, isStorm || isCombatRain ? 0.24 : 0.2);

  const bodyWash = createNoise(length, random);
  lowPass(bodyWash, isStorm ? 0.09 : isWindow ? 0.08 : 0.07);
  highPass(bodyWash, isWindow ? 0.18 : 0.14);
  applySlowAmplitudeDrift(bodyWash, random, isStorm ? 0.2 : 0.15, 11);
  addEnvelope(bodyWash, 0.03, isStorm ? 0.46 : 0.42, recipe.intensity * (isStorm ? 0.12 : isWindow ? 0.08 : 0.08));
  mix(output, bodyWash, isStorm ? 0.2 : isWindow ? 0.12 : 0.18);

  const mist = createNoise(length, random);
  lowPass(mist, 0.18);
  highPass(mist, isWindow ? 0.42 : 0.34);
  applySlowAmplitudeDrift(mist, random, isStorm ? 0.22 : 0.18, 12);
  addEnvelope(mist, 0.02, isStorm ? 0.34 : 0.3, recipe.intensity * (isStorm ? 0.08 : isWindow ? 0.05 : 0.05));
  mix(output, mist, isStorm ? 0.14 : isWindow ? 0.1 : 0.14);

  const dropletCount = isHeavyRainBrawl ? 42 : isThunderRainClash ? 36 : isStorm ? 38 : isWindow ? 22 : 24;
  for (let dropletIndex = 0; dropletIndex < dropletCount; dropletIndex += 1) {
    const dropletLength = Math.max(18, Math.min(Math.floor(SAMPLE_RATE * (isStorm ? 0.06 : 0.04)), Math.floor(length * (isStorm ? 0.08 : 0.05))));
    const droplet = new Float32Array(dropletLength);
    const dropletNoise = createNoise(dropletLength, random);
    lowPass(dropletNoise, isWindow ? 0.14 : 0.18);
    highPass(dropletNoise, isWindow ? 0.48 : 0.36);
    addEnvelope(dropletNoise, 0.0006, isStorm || isCombatRain ? 0.036 : 0.026, recipe.intensity * (isStorm || isCombatRain ? 0.05 : 0.042));
    mix(droplet, dropletNoise, 0.22);

    const pitchStart = (isWindow ? 1620 : 1180) - dropletIndex * (isStorm ? 11 : 17) + Math.floor(random() * 80);
    const pitchEnd = (isWindow ? 420 : 280) + Math.floor(random() * 70);
    const ping = createSine(dropletLength, pitchStart, pitchEnd);
    addEnvelope(ping, 0.0005, isWindow ? 0.03 : 0.024, recipe.intensity * (isWindow ? 0.05 : isCombatRain ? 0.034 : 0.038));
    mix(droplet, ping, isWindow ? 0.16 : 0.11);

    const startIndex = Math.max(
      0,
      Math.min(
        length - dropletLength,
        Math.floor((length - dropletLength) * ((dropletIndex + 0.35 + random() * 0.22) / (dropletCount + 1))),
      ),
    );
    mixAt(output, droplet, startIndex, isStorm || isCombatRain ? 0.14 : isWindow ? 0.16 : 0.15);
  }

  if (isWindow) {
    const paneTicks = createNoise(length, random);
    lowPass(paneTicks, 0.16);
    highPass(paneTicks, 0.58);
    applySlowAmplitudeDrift(paneTicks, random, 0.24, 12);
    addEnvelope(paneTicks, 0.008, 0.24, recipe.intensity * 0.06);
    mix(output, paneTicks, 0.1);
  }

  if (!isStorm && !isWindow) {
    const drizzle = createNoise(length, random);
    lowPass(drizzle, 0.16);
    highPass(drizzle, 0.44);
    applySlowAmplitudeDrift(drizzle, random, 0.2, 13);
    addEnvelope(drizzle, 0.015, 0.36, recipe.intensity * 0.05);
    mix(output, drizzle, 0.12);
  }

  if (isCombatRain) {
    const impactCount = isHeavyRainBrawl ? 3 : 2;
    for (let impactIndex = 0; impactIndex < impactCount; impactIndex += 1) {
      const hitLength = Math.max(22, Math.floor(length * 0.12));
      const hit = new Float32Array(hitLength);
      const smack = createNoise(hitLength, random);
      lowPass(smack, 0.1);
      highPass(smack, 0.34);
      addEnvelope(smack, 0.0008, 0.026, recipe.intensity * (isHeavyRainBrawl ? 0.1 : 0.08));
      mix(hit, smack, 0.18);

      const body = createSine(hitLength, isHeavyRainBrawl ? 220 : 260, isHeavyRainBrawl ? 92 : 118);
      addEnvelope(body, 0.001, 0.04, recipe.intensity * (isHeavyRainBrawl ? 0.08 : 0.06));
      mix(hit, body, 0.16);

      const startIndex = Math.min(
        length - hitLength,
        Math.max(0, Math.floor(length * (0.22 + impactIndex * (isHeavyRainBrawl ? 0.26 : 0.34)))),
      );
      mixAt(output, hit, startIndex, 0.18);
    }

    if (isThunderRainClash) {
      const strikeLength = Math.max(30, Math.floor(length * 0.18));
      const strike = createSine(strikeLength, 1240, 220);
      addEnvelope(strike, 0.0008, 0.08, recipe.intensity * 0.08);
      mixAt(output, strike, Math.floor(length * 0.08), 0.12);
    }
  }

  applySoftClip(output, isStorm || isCombatRain ? 1.54 : isWindow ? 1.62 : 1.72);
  return output;
};

const createSciFiDoorSamples = (length: number, recipe: SoundRecipe, random: () => number) => {
  const output = new Float32Array(length);

  const air = createNoise(length, random);
  lowPass(air, recipe.variant === "misty" ? 0.05 : 0.04);
  highPass(air, 0.12);
  applySlowAmplitudeDrift(air, random, 0.14, 8);
  addEnvelope(air, 0.04, 0.28, recipe.intensity * 0.08);
  mix(output, air, 0.14);

  const mechanism = createSine(length, recipe.variant === "misty" ? 138 : 182, recipe.variant === "misty" ? 84 : 118);
  addEnvelope(mechanism, 0.03, 0.26, recipe.intensity * 0.12);
  mix(output, mechanism, 0.2);

  const body = createSine(length, 82, 48);
  addEnvelope(body, 0.05, 0.34, recipe.intensity * 0.08);
  mix(output, body, 0.16);

  return output;
};

const createCartoonBoingSamples = (length: number, recipe: SoundRecipe) => {
  const output = new Float32Array(length);

  const main = createElasticSweep(length, 520, 170, 320, 210);
  addEnvelope(main, 0.001, 0.16, recipe.intensity * 0.24);
  mix(output, main, 0.52);

  const harmonic = createElasticSweep(length, 880, 310, 560, 360);
  addEnvelope(harmonic, 0.0008, 0.12, recipe.intensity * 0.12);
  mix(output, harmonic, 0.22);

  const body = createSine(length, 190, 118);
  addEnvelope(body, 0.002, 0.1, recipe.intensity * 0.08);
  mix(output, body, 0.14);

  return output;
};

const createRubberBounceSamples = (length: number, recipe: SoundRecipe) => {
  const output = new Float32Array(length);

  const main = createElasticSweep(length, 430, 140, 250, 170);
  addEnvelope(main, 0.0012, 0.18, recipe.intensity * 0.22);
  mix(output, main, 0.5);

  const wobble = createElasticSweep(length, 620, 220, 360, 240);
  addEnvelope(wobble, 0.001, 0.15, recipe.intensity * 0.1);
  mix(output, wobble, 0.18);

  const thump = createSine(length, 160, 96);
  addEnvelope(thump, 0.0015, 0.07, recipe.intensity * 0.08);
  mix(output, thump, 0.14);

  return output;
};

const createSpringyBounceSamples = (length: number, recipe: SoundRecipe) => {
  const output = new Float32Array(length);

  const first = createElasticSweep(Math.max(1, Math.floor(length * 0.72)), 760, 240, 520, 280);
  addEnvelope(first, 0.0009, 0.14, recipe.intensity * 0.18);
  mixAt(output, first, 0, 0.5);

  const second = createElasticSweep(Math.max(1, Math.floor(length * 0.38)), 620, 260, 420, 300);
  addEnvelope(second, 0.0008, 0.08, recipe.intensity * 0.1);
  mixAt(output, second, Math.floor(length * 0.18), 0.34);

  const body = createSine(length, 220, 150);
  addEnvelope(body, 0.002, 0.08, recipe.intensity * 0.06);
  mix(output, body, 0.1);

  return output;
};

const createExplosionSectionSamples = (
  length: number,
  recipe: SoundRecipe,
  random: () => number,
  profile: {
    pressureGain: number;
    transientGain: number;
    crackGain: number;
    bodyGain: number;
    bodyBloomGain: number;
    subGain: number;
    tailGain: number;
    airGain: number;
    pressureStartHz: number;
    pressureEndHz: number;
    bodyStartHz: number;
    bodyEndHz: number;
    bodyBloomStartHz: number;
    bodyBloomEndHz: number;
    subStartHz: number;
    subEndHz: number;
    crackStartHz: number;
    crackEndHz: number;
    transientRelease: number;
    pressureRelease: number;
    bodyRelease: number;
    bodyBloomRelease: number;
    subRelease: number;
    tailRelease: number;
  },
) => {
  const output = new Float32Array(length);
  const cleanBias = clamp(recipe.cleanBias ?? 0.58, 0.18, 0.96);

  const pressure = createSine(length, profile.pressureStartHz, profile.pressureEndHz);
  addEnvelope(pressure, 0.0016, profile.pressureRelease, recipe.intensity * profile.pressureGain * (0.82 + cleanBias * 0.08));
  mix(output, pressure, 0.34);

  const transient = createNoise(length, random);
  lowPass(transient, 0.072);
  highPass(transient, 0.34);
  addEnvelope(transient, 0.0009, profile.transientRelease, recipe.intensity * profile.transientGain * (0.26 + (1 - cleanBias) * 0.1));
  mix(output, transient, 0.06);

  const crack = createNoise(length, random);
  lowPass(crack, 0.22);
  highPass(crack, 0.72);
  addEnvelope(crack, 0.001, 0.045, recipe.intensity * profile.crackGain * (0.5 + cleanBias * 0.06));
  mix(output, crack, 0.08);

  const body = createSine(length, profile.bodyStartHz, profile.bodyEndHz);
  addEnvelope(body, 0.003, profile.bodyRelease, recipe.intensity * profile.bodyGain * (0.94 + cleanBias * 0.06));
  mix(output, body, 0.72);

  const bodyNoise = createNoise(length, random);
  lowPass(bodyNoise, 0.06);
  highPass(bodyNoise, 0.1);
  addEnvelope(bodyNoise, 0.004, profile.bodyRelease * 0.86, recipe.intensity * profile.bodyGain * 0.12);
  mix(output, bodyNoise, 0.18);

  const bodyBloom = createSine(length, profile.bodyBloomStartHz, profile.bodyBloomEndHz);
  addEnvelope(bodyBloom, 0.006, profile.bodyBloomRelease, recipe.intensity * profile.bodyBloomGain * (0.94 + cleanBias * 0.04));
  mix(output, bodyBloom, 0.38);

  const sub = createSine(length, profile.subStartHz, profile.subEndHz);
  addEnvelope(sub, 0.01, profile.subRelease, recipe.intensity * profile.subGain * (0.9 + cleanBias * 0.1));
  mix(output, sub, 0.42);

  const tail = createNoise(length, random);
  lowPass(tail, 0.028);
  highPass(tail, 0.12);
  addEnvelope(tail, 0.02, profile.tailRelease, recipe.intensity * profile.tailGain * (0.58 + cleanBias * 0.06));
  mix(output, tail, 0.08);

  const air = createNoise(length, random);
  lowPass(air, 0.03);
  highPass(air, 0.2);
  addEnvelope(air, 0.012, 0.18, recipe.intensity * profile.airGain * (0.36 + (1 - cleanBias) * 0.08));
  mix(output, air, 0.02);

  if (cleanBias < 0.4) {
    const grit = createNoise(length, random);
    highPass(grit, 0.72);
    lowPass(grit, 0.12);
    addEnvelope(grit, 0.001, 0.03, recipe.intensity * (0.02 + (0.4 - cleanBias) * 0.08));
    mix(output, grit, 0.03);
  }

  return output;
};

const createExplosionSamples = (length: number, recipe: SoundRecipe, random: () => number) => {
  const profile = recipe.explosionProfile ?? "tight-anime-pop";

  if (profile === "staged-preboom-detonation") {
    const output = new Float32Array(length);

    const preLength = Math.max(1, Math.floor(length * 0.14));
    const preCue = new Float32Array(preLength);
    const prePressure = createSine(preLength, 104, 64);
    addEnvelope(prePressure, 0.004, 0.07, recipe.intensity * 0.05);
    mix(preCue, prePressure, 0.22);

    const preBody = createSine(preLength, 154, 96);
    addEnvelope(preBody, 0.003, 0.06, recipe.intensity * 0.04);
    mix(preCue, preBody, 0.1);

    const preAir = createNoise(preLength, random);
    lowPass(preAir, 0.02);
    highPass(preAir, 0.12);
    addEnvelope(preAir, 0.006, 0.04, recipe.intensity * 0.008);
    mix(preCue, preAir, 0.02);

    mixAt(output, preCue, 0, 0.56);

    const detonationStart = Math.floor(length * 0.24);
    const detonationLength = Math.max(1, length - detonationStart);
    const detonation = createExplosionSectionSamples(detonationLength, recipe, random, {
      pressureGain: 0.54,
      transientGain: 0.06,
      crackGain: 0.08,
      bodyGain: 1.12,
      bodyBloomGain: 0.54,
      subGain: 0.64,
      tailGain: 0.24,
      airGain: 0.03,
      pressureStartHz: 166,
      pressureEndHz: 78,
      bodyStartHz: 128,
      bodyEndHz: 42,
      bodyBloomStartHz: 184,
      bodyBloomEndHz: 68,
      subStartHz: 56,
      subEndHz: 22,
      crackStartHz: 280,
      crackEndHz: 112,
      transientRelease: 0.034,
      pressureRelease: 0.15,
      bodyRelease: 0.56,
      bodyBloomRelease: 0.38,
      subRelease: 1.08,
      tailRelease: 1.18,
    });
    mixAt(output, detonation, detonationStart, 1.22);
    return output;
  }

  if (profile === "heavy-clean-blast") {
    return createExplosionSectionSamples(length, recipe, random, {
      pressureGain: 0.5,
      transientGain: 0.05,
      crackGain: 0.05,
      bodyGain: 1.18,
      bodyBloomGain: 0.62,
      subGain: 0.7,
      tailGain: 0.24,
      airGain: 0.03,
      pressureStartHz: 150,
      pressureEndHz: 70,
      bodyStartHz: 114,
      bodyEndHz: 36,
      bodyBloomStartHz: 162,
      bodyBloomEndHz: 58,
      subStartHz: 50,
      subEndHz: 20,
      crackStartHz: 230,
      crackEndHz: 98,
      transientRelease: 0.032,
      pressureRelease: 0.16,
      bodyRelease: 0.62,
      bodyBloomRelease: 0.44,
      subRelease: 1.2,
      tailRelease: 1.3,
    });
  }

  return createExplosionSectionSamples(length, recipe, random, {
    pressureGain: 0.36,
    transientGain: 0.07,
    crackGain: 0.08,
    bodyGain: 0.86,
    bodyBloomGain: 0.34,
    subGain: 0.26,
    tailGain: 0.12,
    airGain: 0.02,
    pressureStartHz: 172,
    pressureEndHz: 88,
    bodyStartHz: 142,
    bodyEndHz: 54,
    bodyBloomStartHz: 198,
    bodyBloomEndHz: 82,
    subStartHz: 66,
    subEndHz: 30,
    crackStartHz: 320,
    crackEndHz: 136,
    transientRelease: 0.026,
    pressureRelease: 0.1,
    bodyRelease: 0.3,
    bodyBloomRelease: 0.2,
    subRelease: 0.52,
    tailRelease: 0.58,
  });
};

const createWhooshSamples = (length: number, recipe: SoundRecipe, random: () => number) => {
  const output = createNoise(length, random);
  const variant = recipe.variant ?? "whoosh";
  const isHeavyBlade = variant === "heavy-blade-shear";
  const isClosePass = variant === "close-pass-slice";
  const isBroadPass = variant === "broad-swish-pass";
  const isTightMotionCut = variant === "tight-motion-cut";
  highPass(output, isClosePass ? 0.5 : 0.42);
  lowPass(output, isHeavyBlade || isBroadPass ? 0.18 : isTightMotionCut ? 0.12 : 0.14);
  applySlowAmplitudeDrift(output, random, 0.16, 7);
  addEnvelope(output, 0.012, isHeavyBlade || isBroadPass ? 0.22 : isTightMotionCut ? 0.14 : 0.18, recipe.intensity * (isHeavyBlade || isBroadPass ? 0.14 : 0.1));
  const tone = createSine(
    length,
    isHeavyBlade ? 380 : isClosePass ? 620 : isBroadPass ? 320 : isTightMotionCut ? 540 : 460,
    isHeavyBlade ? 210 : isClosePass ? 340 : isBroadPass ? 180 : isTightMotionCut ? 280 : 260,
  );
  addEnvelope(tone, 0.008, isClosePass || isTightMotionCut ? 0.1 : 0.14, recipe.intensity * 0.06);
  mix(output, tone, 0.08);

  if (variant === "swift-steel-slash" || isHeavyBlade || isClosePass) {
    const bladeRing = createSine(length, isClosePass ? 1880 : 1560, isClosePass ? 720 : 540);
    addEnvelope(bladeRing, 0.0007, isClosePass ? 0.026 : 0.034, recipe.intensity * (isHeavyBlade ? 0.08 : 0.06));
    mix(output, bladeRing, isClosePass ? 0.12 : 0.08);
  }
  return output;
};

const createMagicSamples = (length: number, recipe: SoundRecipe, random: () => number) => {
  const variant = recipe.variant ?? "magic";
  const isArcaneBurst = variant === "arcane-burst-flare";
  const isShimmerPop = variant === "shimmer-spell-pop";
  const isRuneBloom = variant === "rune-energy-bloom";
  const output = createSine(length, isRuneBloom ? 260 : isShimmerPop ? 420 : 340, isRuneBloom ? 760 : isShimmerPop ? 940 : 820);
  addEnvelope(output, 0.02, isRuneBloom ? 0.5 : isShimmerPop ? 0.24 : 0.38, recipe.intensity * (isArcaneBurst ? 0.42 : 0.38));
  const shimmer = createNoise(length, random);
  highPass(shimmer, 0.88);
  addEnvelope(shimmer, 0.02, isRuneBloom ? 0.56 : 0.5, recipe.intensity * (isShimmerPop ? 0.34 : 0.42));
  mix(output, shimmer, isShimmerPop ? 0.28 : 0.34);

  if (isRuneBloom) {
    const swell = createSine(length, 180, 420);
    addEnvelope(swell, 0.04, 0.56, recipe.intensity * 0.16);
    mix(output, swell, 0.18);
  }

  if (recipe.variant === "glitch-portal-tear") {
    const rip = createNoise(length, random);
    highPass(rip, 0.62);
    lowPass(rip, 0.2);
    addEnvelope(rip, 0.004, 0.12, recipe.intensity * 0.12);
    mix(output, rip, 0.16);
  }
  return output;
};

const createAmbienceSamples = (length: number, recipe: SoundRecipe, random: () => number) => {
  const output = new Float32Array(length);
  const bed = createNoise(length, random);
  lowPass(bed, 0.02);
  applySlowAmplitudeDrift(bed, random, 0.14, 12);
  addEnvelope(bed, 0.1, 0.42, recipe.intensity * 0.06);
  mix(output, bed, 0.18);

  const movement = createNoise(length, random);
  lowPass(movement, 0.05);
  highPass(movement, 0.14);
  applySlowAmplitudeDrift(movement, random, 0.18, 9);
  addEnvelope(movement, 0.08, 0.32, recipe.intensity * 0.04);
  mix(output, movement, 0.12);

  const presence = createNoise(length, random);
  lowPass(presence, 0.12);
  highPass(presence, 0.28);
  addEnvelope(presence, 0.03, 0.18, recipe.intensity * 0.015);
  mix(output, presence, 0.05);
  return output;
};

const createCreatureSamples = (length: number, recipe: SoundRecipe, random: () => number) => {
  const output = new Float32Array(length);
  const variant = recipe.variant ?? "predator-roar-break";
  const isChase = variant === "giant-chase-stomp" || variant === "ground-pound-pursuit";
  const isGroundHeavy = variant === "ground-pound-pursuit";

  const chest = createSine(length, isGroundHeavy ? 128 : 164, isGroundHeavy ? 58 : 92);
  addEnvelope(chest, 0.02, isChase ? 0.52 : 0.44, recipe.intensity * (isGroundHeavy ? 0.28 : 0.24));
  mix(output, chest, 0.26);

  const throat = createSine(length, isChase ? 240 : 320, isChase ? 112 : 168);
  addEnvelope(throat, 0.006, isChase ? 0.34 : 0.28, recipe.intensity * 0.18);
  mix(output, throat, 0.18);

  const rasp = createNoise(length, random);
  lowPass(rasp, 0.1);
  highPass(rasp, 0.26);
  applySlowAmplitudeDrift(rasp, random, isChase ? 0.22 : 0.16, 9);
  addEnvelope(rasp, 0.008, isChase ? 0.42 : 0.3, recipe.intensity * 0.14);
  mix(output, rasp, 0.2);

  const breath = createNoise(length, random);
  lowPass(breath, 0.05);
  highPass(breath, 0.12);
  addEnvelope(breath, 0.02, isChase ? 0.48 : 0.36, recipe.intensity * 0.12);
  mix(output, breath, 0.14);

  const bite = createSine(length, isChase ? 980 : 1120, isChase ? 340 : 420);
  addEnvelope(bite, 0.001, 0.05, recipe.intensity * 0.08);
  mix(output, bite, 0.1);

  if (isChase) {
    const pulseCount = isGroundHeavy ? 3 : 2;
    for (let index = 0; index < pulseCount; index += 1) {
      const pulseLength = Math.max(28, Math.floor(length * 0.18));
      const stomp = createSine(pulseLength, isGroundHeavy ? 118 : 132, isGroundHeavy ? 40 : 54);
      addEnvelope(stomp, 0.001, 0.08, recipe.intensity * (isGroundHeavy ? 0.14 : 0.1));
      mixAt(output, stomp, Math.floor(length * (0.16 + index * 0.28)), 0.18);

      const dirt = createNoise(pulseLength, random);
      lowPass(dirt, 0.08);
      highPass(dirt, 0.2);
      addEnvelope(dirt, 0.001, 0.05, recipe.intensity * 0.07);
      mixAt(output, dirt, Math.floor(length * (0.16 + index * 0.28)), 0.12);
    }
  }

  applySoftClip(output, isChase ? 1.46 : 1.38);
  return output;
};

const createRobotSamples = (length: number, recipe: SoundRecipe) => {
  const output = createSquare(length, 210, 120);
  addEnvelope(output, 0.002, 0.16, recipe.intensity * 0.22);
  const servo = createSine(length, 480, 220);
  addEnvelope(servo, 0.01, 0.24, recipe.intensity * 0.2);
  mix(output, servo, 0.5);
  return output;
};

const createBeamSamples = (length: number, recipe: SoundRecipe, random: () => number) => {
  const variant = recipe.variant ?? "beam";
  const output = createSine(
    length,
    variant === "charged-beam-blast" || variant === "charged-energy-burst"
      ? 180
      : variant === "pulse-shot-tail" || variant === "pulse-wave-release"
        ? 260
        : variant === "focused-energy-beam"
          ? 240
          : 320,
    variant === "charged-beam-blast" || variant === "charged-energy-burst"
      ? 1240
      : variant === "pulse-shot-tail" || variant === "pulse-wave-release"
        ? 980
        : variant === "focused-energy-beam"
          ? 1080
          : 920,
  );
  addEnvelope(output, 0.006, variant === "charged-beam-blast" || variant === "charged-energy-burst" ? 0.3 : 0.24, recipe.intensity * 0.42);
  const fizz = createNoise(length, random);
  highPass(fizz, variant === "tight-zap-burst" ? 0.92 : 0.86);
  addEnvelope(fizz, 0.004, variant === "pulse-shot-tail" || variant === "pulse-wave-release" ? 0.22 : 0.18, recipe.intensity * 0.32);
  mix(output, fizz, 0.28);

  const pulse = createSine(
    length,
    variant === "charged-beam-blast" || variant === "charged-energy-burst" ? 540 : variant === "focused-energy-beam" ? 640 : 820,
    variant === "charged-beam-blast" || variant === "charged-energy-burst" ? 360 : variant === "focused-energy-beam" ? 420 : 560,
  );
  addEnvelope(
    pulse,
    0.003,
    variant === "tight-zap-burst" ? 0.12 : 0.18,
    recipe.intensity * (variant === "charged-beam-blast" || variant === "charged-energy-burst" ? 0.16 : 0.1),
  );
  mix(output, pulse, 0.18);
  return output;
};

const createWaterSamples = (length: number, recipe: SoundRecipe, random: () => number) => {
  const output = new Float32Array(length);
  const variant = recipe.variant ?? "clean-water-splash";
  const isHeavy = variant === "heavy-plunge-splash";
  const isSpray = variant === "spray-surface-slap";

  const slap = createNoise(length, random);
  lowPass(slap, isSpray ? 0.16 : 0.12);
  highPass(slap, isHeavy ? 0.28 : 0.34);
  addEnvelope(slap, 0.001, isHeavy ? 0.12 : 0.08, recipe.intensity * (isHeavy ? 0.22 : 0.18));
  mix(output, slap, 0.24);

  const body = createSine(length, isHeavy ? 180 : 240, isHeavy ? 74 : 96);
  addEnvelope(body, 0.002, isHeavy ? 0.22 : 0.14, recipe.intensity * (isHeavy ? 0.18 : 0.12));
  mix(output, body, 0.28);

  const spray = createNoise(length, random);
  highPass(spray, 0.72);
  addEnvelope(spray, 0.004, isSpray ? 0.18 : 0.12, recipe.intensity * (isSpray ? 0.16 : 0.12));
  mix(output, spray, isSpray ? 0.2 : 0.12);

  return output;
};

const createFireSamples = (length: number, recipe: SoundRecipe, random: () => number) => {
  const output = new Float32Array(length);
  const variant = recipe.variant ?? "flame-burst-whoomph";
  const isRoar = variant === "hot-flare-roar";
  const isCrackle = variant === "crackling-fire-pop";

  const flame = createNoise(length, random);
  lowPass(flame, isCrackle ? 0.08 : 0.05);
  highPass(flame, 0.18);
  applySlowAmplitudeDrift(flame, random, 0.14, 8);
  addEnvelope(flame, 0.006, isRoar ? 0.34 : isCrackle ? 0.12 : 0.22, recipe.intensity * (isRoar ? 0.18 : 0.14));
  mix(output, flame, 0.22);

  const heat = createSine(length, isRoar ? 128 : 156, isRoar ? 72 : 84);
  addEnvelope(heat, 0.003, isRoar ? 0.3 : 0.18, recipe.intensity * 0.12);
  mix(output, heat, 0.18);

  if (isCrackle || isRoar) {
    const crackle = createNoise(length, random);
    highPass(crackle, 0.88);
    addEnvelope(crackle, 0.002, isCrackle ? 0.16 : 0.22, recipe.intensity * 0.16);
    mix(output, crackle, 0.16);
  }

  return output;
};

const createCrashSamples = (length: number, recipe: SoundRecipe, random: () => number) => {
  const output = new Float32Array(length);
  const variant = recipe.variant ?? "hard-debris-crash";
  const isScatter = variant === "rubble-scatter-drop";
  const isCollapse = variant === "dusty-collapse-roll";

  const body = createNoise(length, random);
  lowPass(body, isCollapse ? 0.04 : 0.06);
  highPass(body, 0.12);
  addEnvelope(body, 0.003, isCollapse ? 0.34 : 0.18, recipe.intensity * (isCollapse ? 0.18 : 0.16));
  mix(output, body, 0.24);

  const thud = createSine(length, isCollapse ? 110 : 140, isCollapse ? 42 : 58);
  addEnvelope(thud, 0.002, isCollapse ? 0.28 : 0.16, recipe.intensity * (isScatter ? 0.1 : 0.16));
  mix(output, thud, 0.24);

  const burstCount = isScatter ? 4 : isCollapse ? 6 : 5;
  for (let index = 0; index < burstCount; index += 1) {
    const burstLength = Math.max(20, Math.floor(length * (isCollapse ? 0.08 : 0.05)));
    const burst = createNoise(burstLength, random);
    highPass(burst, 0.6);
    lowPass(burst, 0.14);
    addEnvelope(burst, 0.0006, isScatter ? 0.04 : 0.06, recipe.intensity * (isScatter ? 0.08 : 0.12));
    const startIndex = Math.min(length - burstLength, Math.floor((index / Math.max(1, burstCount - 1)) * length * (isCollapse ? 0.72 : 0.46)));
    mixAt(output, burst, startIndex, 0.22);
  }

  if (isCollapse) {
    const dust = createNoise(length, random);
    lowPass(dust, 0.03);
    addEnvelope(dust, 0.012, 0.44, recipe.intensity * 0.08);
    mix(output, dust, 0.12);
  }

  return output;
};

const createAlarmSamples = (length: number, recipe: SoundRecipe) => {
  const output = new Float32Array(length);
  const segmentLength = Math.max(1, Math.floor(length / 4));
  for (let segment = 0; segment < 4; segment += 1) {
    const start = segment * segmentLength;
    const end = Math.min(length, start + segmentLength);
    const tone = createSquare(end - start, segment % 2 === 0 ? 880 : 660, segment % 2 === 0 ? 880 : 660);
    addEnvelope(tone, 0.002, 0.02, recipe.intensity * 0.18);
    output.set(tone, start);
  }
  return output;
};

const createApproachPassSweep = (
  length: number,
  startHz: number,
  peakHz: number,
  passHz: number,
  endHz: number,
  peakPoint = 0.42,
  passPoint = 0.58,
) => {
  const samples = new Float32Array(length);
  let phase = 0;
  for (let index = 0; index < length; index += 1) {
    const progress = index / Math.max(1, length - 1);
    const hz =
      progress < peakPoint
        ? startHz + (peakHz - startHz) * (progress / peakPoint)
        : progress < passPoint
          ? peakHz + (passHz - peakHz) * ((progress - peakPoint) / Math.max(0.001, passPoint - peakPoint))
          : passHz + (endHz - passHz) * ((progress - passPoint) / Math.max(0.001, 1 - passPoint));
    phase += (Math.PI * 2 * hz) / SAMPLE_RATE;
    samples[index] = Math.sin(phase);
  }
  return samples;
};

const applyPassByGain = (
  samples: Float32Array,
  {
    startGain,
    peakGain,
    endGain,
    peakPoint = 0.42,
    passPoint = 0.58,
  }: {
    startGain: number;
    peakGain: number;
    endGain: number;
    peakPoint?: number;
    passPoint?: number;
  },
) => {
  for (let index = 0; index < samples.length; index += 1) {
    const progress = index / Math.max(1, samples.length - 1);
    const gain =
      progress < peakPoint
        ? startGain + (peakGain - startGain) * (progress / peakPoint)
        : progress < passPoint
          ? peakGain + (endGain - peakGain) * ((progress - peakPoint) / Math.max(0.001, passPoint - peakPoint))
          : endGain * (1 - (progress - passPoint) / Math.max(0.001, 1 - passPoint));
    samples[index] *= Math.max(0, gain);
  }
};

const applyEnginePulseContour = (
  samples: Float32Array,
  startRateHz: number,
  endRateHz: number,
  depth: number,
  phaseOffset = 0,
) => {
  let phase = phaseOffset;
  let subPhase = phaseOffset * 0.5;
  for (let index = 0; index < samples.length; index += 1) {
    const progress = index / Math.max(1, samples.length - 1);
    const rateHz = startRateHz + (endRateHz - startRateHz) * progress;
    phase += (Math.PI * 2 * rateHz) / SAMPLE_RATE;
    subPhase += (Math.PI * 2 * (rateHz * 0.52)) / SAMPLE_RATE;
    const contour = 0.9 + Math.sin(phase) * depth * 0.2 + Math.sin(subPhase) * depth * 0.1;
    samples[index] *= clamp(contour, 0.56, 1.18);
  }
};

const createVehiclePassSamples = (
  length: number,
  recipe: SoundRecipe,
  random: () => number,
  profile: {
    startHz: number;
    peakHz: number;
    passHz: number;
    endHz: number;
    lowStartHz: number;
    lowPeakHz: number;
    lowPassHz: number;
    lowEndHz: number;
    peakPoint: number;
    passPoint: number;
    engineGain: number;
    lowGain: number;
    gritGain: number;
    airGain: number;
    roadGain: number;
  },
) => {
  const output = new Float32Array(length);
  const cleanBias = clamp(recipe.cleanBias ?? 0.74, 0.18, 0.96);

  const engine = createApproachPassSweep(
    length,
    profile.startHz,
    profile.peakHz,
    profile.passHz,
    profile.endHz,
    profile.peakPoint,
    profile.passPoint,
  );
  applyPassByGain(engine, {
    startGain: 0.28,
    peakGain: 1,
    endGain: 0.46,
    peakPoint: profile.peakPoint,
    passPoint: profile.passPoint,
  });
  applyEnginePulseContour(engine, 18, 30, 0.76);
  addEnvelope(engine, 0.02, 0.16, recipe.intensity * profile.engineGain);
  mix(output, engine, 0.44);

  const harmonic = createApproachPassSweep(
    length,
    profile.startHz * 1.78,
    profile.peakHz * 1.92,
    profile.passHz * 1.8,
    profile.endHz * 1.72,
    profile.peakPoint,
    profile.passPoint,
  );
  applyPassByGain(harmonic, {
    startGain: 0.22,
    peakGain: 0.82,
    endGain: 0.28,
    peakPoint: profile.peakPoint,
    passPoint: profile.passPoint,
  });
  applyEnginePulseContour(harmonic, 22, 34, 0.54, Math.PI * 0.18);
  addEnvelope(harmonic, 0.02, 0.14, recipe.intensity * profile.engineGain * 0.6);
  mix(output, harmonic, 0.14);

  const lowBody = createApproachPassSweep(
    length,
    profile.lowStartHz,
    profile.lowPeakHz,
    profile.lowPassHz,
    profile.lowEndHz,
    profile.peakPoint,
    profile.passPoint,
  );
  applyPassByGain(lowBody, {
    startGain: 0.24,
    peakGain: 0.88,
    endGain: 0.5,
    peakPoint: profile.peakPoint,
    passPoint: profile.passPoint,
  });
  applyEnginePulseContour(lowBody, 12, 20, 0.42, Math.PI * 0.4);
  addEnvelope(lowBody, 0.03, 0.18, recipe.intensity * profile.lowGain);
  mix(output, lowBody, 0.36);

  const road = createNoise(length, random);
  lowPass(road, 0.03);
  highPass(road, 0.14);
  applyPassByGain(road, {
    startGain: 0.16,
    peakGain: 0.52,
    endGain: 0.18,
    peakPoint: profile.peakPoint,
    passPoint: profile.passPoint,
  });
  addEnvelope(road, 0.02, 0.16, recipe.intensity * profile.roadGain * (0.68 + (1 - cleanBias) * 0.1));
  mix(output, road, 0.08);

  const air = createNoise(length, random);
  highPass(air, 0.22);
  lowPass(air, 0.05);
  applyPassByGain(air, {
    startGain: 0.1,
    peakGain: 0.34,
    endGain: 0.12,
    peakPoint: profile.peakPoint,
    passPoint: profile.passPoint,
  });
  addEnvelope(air, 0.02, 0.12, recipe.intensity * profile.airGain);
  mix(output, air, 0.04);

  if (cleanBias < 0.7) {
    const grit = createNoise(length, random);
    lowPass(grit, 0.12);
    highPass(grit, 0.46);
    applyPassByGain(grit, {
      startGain: 0.18,
      peakGain: 0.5,
      endGain: 0.14,
      peakPoint: profile.peakPoint,
      passPoint: profile.passPoint,
    });
    addEnvelope(grit, 0.012, 0.1, recipe.intensity * profile.gritGain * (0.24 + (0.7 - cleanBias) * 0.14));
    mix(output, grit, 0.04);
  }

  return output;
};

const createEngineSamples = (length: number, recipe: SoundRecipe, random: () => number) => {
  return createVehiclePassSamples(length, recipe, random, {
    startHz: 104,
    peakHz: 156,
    passHz: 122,
    endHz: 82,
    lowStartHz: 54,
    lowPeakHz: 74,
    lowPassHz: 62,
    lowEndHz: 46,
    peakPoint: 0.4,
    passPoint: 0.56,
    engineGain: 0.24,
    lowGain: 0.16,
    gritGain: 0.1,
    airGain: 0.08,
    roadGain: 0.12,
  });
};

const createGlassSamples = (length: number, recipe: SoundRecipe, random: () => number) => {
  const output = createNoise(length, random);
  highPass(output, 0.96);
  addEnvelope(output, 0.001, 0.18, recipe.intensity * 0.4);
  const sparkle = createSine(length, 1400, 820);
  addEnvelope(sparkle, 0.001, 0.14, recipe.intensity * 0.2);
  mix(output, sparkle, 0.34);
  return output;
};

const createGenericSamples = (length: number, recipe: SoundRecipe, random: () => number) => {
  const output = createNoise(length, random);
  lowPass(output, recipe.variant === "softer-variant" ? 0.05 : 0.06);
  highPass(output, recipe.variant === "sharper-variant" ? 0.26 : 0.18);
  applySlowAmplitudeDrift(output, random, 0.1, 8);
  addEnvelope(output, 0.01, recipe.variant === "softer-variant" ? 0.2 : 0.14, recipe.intensity * 0.04);

  const tone = createSine(
    length,
    recipe.variant === "darker-variant" ? 280 : recipe.variant === "sharper-variant" ? 420 : 360,
    recipe.variant === "darker-variant" ? 180 : 220,
  );
  addEnvelope(tone, 0.002, recipe.variant === "softer-variant" ? 0.12 : 0.08, recipe.intensity * 0.04);
  mix(output, tone, 0.08);
  return output;
};

const applySimpleEcho = (samples: Float32Array, mixAmount: number) => {
  const delaySamples = Math.floor(SAMPLE_RATE * 0.16);
  for (let index = delaySamples; index < samples.length; index += 1) {
    samples[index] += samples[index - delaySamples] * mixAmount * 0.32;
  }
};

const normalizeSamples = (samples: Float32Array) => {
  let peak = 0;
  for (let index = 0; index < samples.length; index += 1) {
    peak = Math.max(peak, Math.abs(samples[index]));
  }

  if (peak < 0.001) {
    return samples;
  }

  const scale = 0.92 / peak;
  for (let index = 0; index < samples.length; index += 1) {
    samples[index] *= scale;
  }
  return samples;
};

const validateSamplesForPreview = (samples: Float32Array) => {
  if (samples.length === 0) {
    throw new Error("Sound preview synthesis produced an empty sample buffer.");
  }

  let peak = 0;
  let sumSquares = 0;

  for (let index = 0; index < samples.length; index += 1) {
    const sample = samples[index];
    if (!Number.isFinite(sample)) {
      throw new Error("Sound preview synthesis produced invalid numeric samples.");
    }

    const absoluteValue = Math.abs(sample);
    if (absoluteValue > peak) {
      peak = absoluteValue;
    }
    sumSquares += sample * sample;
  }

  const rms = Math.sqrt(sumSquares / samples.length);
  if (peak < 0.01 || rms < 0.003) {
    throw new Error("Sound preview synthesis produced audio that is too quiet to be usable.");
  }
};

const encodeWav = (samples: Float32Array) => {
  const bytesPerSample = 2;
  const blockAlign = bytesPerSample;
  const byteRate = SAMPLE_RATE * blockAlign;
  const dataSize = samples.length * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);
  let offset = 0;

  const writeString = (value: string) => {
    for (let index = 0; index < value.length; index += 1) {
      view.setUint8(offset, value.charCodeAt(index));
      offset += 1;
    }
  };

  writeString("RIFF");
  view.setUint32(offset, 36 + dataSize, true);
  offset += 4;
  writeString("WAVE");
  writeString("fmt ");
  view.setUint32(offset, 16, true);
  offset += 4;
  view.setUint16(offset, 1, true);
  offset += 2;
  view.setUint16(offset, 1, true);
  offset += 2;
  view.setUint32(offset, SAMPLE_RATE, true);
  offset += 4;
  view.setUint32(offset, byteRate, true);
  offset += 4;
  view.setUint16(offset, blockAlign, true);
  offset += 2;
  view.setUint16(offset, 16, true);
  offset += 2;
  writeString("data");
  view.setUint32(offset, dataSize, true);
  offset += 4;

  for (let index = 0; index < samples.length; index += 1) {
    const sample = clamp(samples[index], -1, 1);
    view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
    offset += 2;
  }

  return new Blob([buffer], { type: "audio/wav" });
};

const blobToDataUrl = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
        return;
      }
      reject(new Error("Audio preview encoding failed."));
    };
    reader.onerror = () => reject(reader.error ?? new Error("Audio preview encoding failed."));
    reader.readAsDataURL(blob);
  });

export const synthesizeSoundOptionToDataUrl = async (option: DrawingAiSoundOption): Promise<string> => {
  if (!isSoundGenerationEnabled()) {
    throw new Error(SOUND_GENERATION_DISABLED_MESSAGE);
  }

  const recipe = inferSoundRecipe(option);
  if (
    option.soundFamily != null &&
    NON_GENERIC_FAMILY_SET.has(option.soundFamily) &&
    (recipe.kind === "generic" || (recipe.kind === "rumble" && !canUseSharedLowGrowlTone(option, `${option.title} ${option.description}`.toLowerCase())))
  ) {
    throw new Error(`Known sound family "${option.soundFamily}" incorrectly resolved to a shared fallback recipe.`);
  }
  if (recipe.kind === "voice-placeholder") {
    throw new Error("Local speech preview is not supported yet.");
  }

  const length = Math.max(1, Math.floor(recipe.durationSeconds * SAMPLE_RATE));
  const random = mulberry32(hashString(`${option.id}:${option.title}:${option.description}`));

  let samples: Float32Array;
  if (recipe.kind === "bone-crack") {
    samples = createBoneCrackSamples(length, recipe, random);
  } else if (recipe.kind === "twig-snap") {
    samples = createTwigSnapSamples(length, recipe, random);
  } else if (recipe.kind === "wood-crack") {
    samples = createWoodCrackSamples(length, recipe, random);
  } else if (recipe.kind === "cartoon-boing") {
    samples = createCartoonBoingSamples(length, recipe);
  } else if (recipe.kind === "rubber-bounce") {
    samples = createRubberBounceSamples(length, recipe);
  } else if (recipe.kind === "springy-bounce") {
    samples = createSpringyBounceSamples(length, recipe);
  } else if (recipe.kind === "race-car-pass") {
    samples = createVehiclePassSamples(length, recipe, random, {
      startHz: 124,
      peakHz: 196,
      passHz: 138,
      endHz: 82,
      lowStartHz: 60,
      lowPeakHz: 82,
      lowPassHz: 66,
      lowEndHz: 46,
      peakPoint: 0.34,
      passPoint: 0.5,
      engineGain: 0.22,
      lowGain: 0.12,
      gritGain: 0.04,
      airGain: 0.06,
      roadGain: 0.08,
    });
  } else if (recipe.kind === "heavy-engine-pass") {
    samples = createVehiclePassSamples(length, recipe, random, {
      startHz: 94,
      peakHz: 144,
      passHz: 120,
      endHz: 72,
      lowStartHz: 46,
      lowPeakHz: 74,
      lowPassHz: 60,
      lowEndHz: 40,
      peakPoint: 0.43,
      passPoint: 0.62,
      engineGain: 0.28,
      lowGain: 0.24,
      gritGain: 0.04,
      airGain: 0.05,
      roadGain: 0.1,
    });
  } else if (recipe.kind === "engine-approach-pass") {
    samples = createVehiclePassSamples(length, recipe, random, {
      startHz: 80,
      peakHz: 154,
      passHz: 108,
      endHz: 64,
      lowStartHz: 40,
      lowPeakHz: 66,
      lowPassHz: 54,
      lowEndHz: 36,
      peakPoint: 0.54,
      passPoint: 0.72,
      engineGain: 0.24,
      lowGain: 0.18,
      gritGain: 0.03,
      airGain: 0.07,
      roadGain: 0.08,
    });
  } else if (recipe.kind === "distant-track-pass") {
    samples = createVehiclePassSamples(length, recipe, random, {
      startHz: 74,
      peakHz: 114,
      passHz: 92,
      endHz: 64,
      lowStartHz: 40,
      lowPeakHz: 56,
      lowPassHz: 48,
      lowEndHz: 34,
      peakPoint: 0.46,
      passPoint: 0.62,
      engineGain: 0.16,
      lowGain: 0.12,
      gritGain: 0.03,
      airGain: 0.05,
      roadGain: 0.06,
    });
  } else if (recipe.kind === "door-creak") {
    samples = createDoorCreakSamples(length, recipe, random);
  } else if (recipe.kind === "hinge-creak") {
    samples = createHingeCreakSamples(length, recipe, random);
  } else if (recipe.kind === "wood-strain") {
    samples = createWoodStrainSamples(length, recipe, random);
  } else if (recipe.kind === "sci-fi-door") {
    samples = createSciFiDoorSamples(length, recipe, random);
  } else if (recipe.kind === "lightning-strike") {
    samples = createLightningStrikeSamples(length, recipe, random);
  } else if (recipe.kind === "electricity") {
    samples = createElectricitySamples(length, recipe, random);
  } else if (recipe.kind === "volcano-eruption") {
    samples = createVolcanoEruptionSamples(length, recipe, random);
  } else if (recipe.kind === "pebble-water") {
    samples = createPebbleWaterSamples(length, recipe, random);
  } else if (recipe.kind === "water") {
    samples = createWaterSamples(length, recipe, random);
  } else if (recipe.kind === "fire") {
    samples = createFireSamples(length, recipe, random);
  } else if (recipe.kind === "footstep") {
    samples = createFootstepSamples(length, recipe, random);
  } else if (recipe.kind === "rain") {
    samples = createRainSamples(length, recipe, random);
  } else if (recipe.kind === "wind") {
    samples = createWindSamples(length, recipe, random);
  } else if (recipe.kind === "rustle") {
    samples = createRustleSamples(length, recipe, random);
  } else if (recipe.kind === "crash") {
    samples = createCrashSamples(length, recipe, random);
  } else if (recipe.kind === "creak") {
    samples = createCreakSamples(length, recipe, random);
  } else if (recipe.kind === "rumble") {
    samples = createRumbleSamples(length, recipe, random);
  } else if (recipe.kind === "room-tone") {
    samples = createRoomToneSamples(length, recipe, random);
  } else if (recipe.kind === "ui-beep") {
    samples = createUiBeepSamples(length, recipe);
  } else if (recipe.kind === "button-click") {
    samples = createButtonClickSamples(length, recipe, random);
  } else if (recipe.kind === "zipper") {
    samples = createZipperSamples(length, recipe, random);
  } else if (recipe.kind === "impact") {
    samples = createImpactSamples(length, recipe, random);
  } else if (recipe.kind === "explosion") {
    samples = createExplosionSamples(length, recipe, random);
  } else if (recipe.kind === "whoosh") {
    samples = createWhooshSamples(length, recipe, random);
  } else if (recipe.kind === "magic") {
    samples = createMagicSamples(length, recipe, random);
  } else if (recipe.kind === "ambience") {
    samples = createAmbienceSamples(length, recipe, random);
  } else if (recipe.kind === "creature") {
    samples = createCreatureSamples(length, recipe, random);
  } else if (recipe.kind === "robot") {
    samples = createRobotSamples(length, recipe);
  } else if (recipe.kind === "beam") {
    samples = createBeamSamples(length, recipe, random);
  } else if (recipe.kind === "alarm") {
    samples = createAlarmSamples(length, recipe);
  } else if (recipe.kind === "engine") {
    samples = createEngineSamples(length, recipe, random);
  } else if (recipe.kind === "glass") {
    samples = createGlassSamples(length, recipe, random);
  } else {
    samples = createGenericSamples(length, recipe, random);
  }

  if (recipe.reverb > 0) {
    applySimpleEcho(samples, recipe.reverb);
  }

  normalizeSamples(samples);
  validateSamplesForPreview(samples);
  return blobToDataUrl(encodeWav(samples));
};
