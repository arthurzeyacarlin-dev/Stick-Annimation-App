import { drawPose, makeDefaultPose, type Pose, type Vec2 } from "../../../app/engine/stickRig";
import type {
  DrawingAiFamilyQualityContract,
  DrawingAiGeneratedFramePlan,
  DrawingAiRenderAcceptanceContract,
  DrawingAiRenderingQualityProfile,
  DrawingAiGeneratedFrameWorkspaceIntent,
  DrawingAiWorkspaceBitmapBounds,
  DrawingAiWorkspaceContext,
} from "./drawingAiContract";
import {
  MAX_FRAMES_PER_REQUEST,
  clampFrameDraftsToRequest,
  clampRequestedFrameCount,
} from "./frameGenerationSafety";

type FrameSubjectType = "stick-figure" | "round-character" | "simple-object" | "effect";
type ObjectShape =
  | "ball"
  | "circle"
  | "square"
  | "rectangle"
  | "rod"
  | "pillar"
  | "crystal"
  | "mushroom"
  | "portal"
  | "torch"
  | "fence"
  | "sign"
  | "rubble-pile"
  | "tree"
  | "plant"
  | "fan"
  | "door"
  | "desk"
  | "crate"
  | "cloud"
  | "mountain"
  | "plain-landscape"
  | "city-background"
  | "rock"
  | "lightning"
  | "smoke-cloud"
  | "flame"
  | "rain"
  | "slash-arc"
  | "hallway-background"
  | "room-background"
  | "concrete-cracks";
type FrameSceneSetting =
  | "forest"
  | "canyon"
  | "cave"
  | "underground"
  | "arena"
  | "rooftop"
  | "bedroom"
  | "city"
  | "neighborhood"
  | "alley"
  | "plains"
  | "mountains"
  | "room"
  | "temple"
  | "generic"
  | null;
type FrameExpression = "neutral" | "smile" | "shocked" | "angry" | "sad" | "determined" | "scared";
type FrameAction =
  | "stand"
  | "run"
  | "jump"
  | "land"
  | "bounce"
  | "fall"
  | "rebound"
  | "roll"
  | "slide"
  | "sway"
  | "bob"
  | "stumble"
  | "breathe"
  | "punch"
  | "kick"
  | "slam"
  | "guard"
  | "spin"
  | "staff-spin"
  | "step"
  | "explode";
type FramePlacementX = "off-left" | "left-entry" | "left" | "center" | "right" | "right-entry" | "off-right";
type FramePlacementY = "off-top" | "top-entry" | "upper" | "center" | "lower" | "bottom-entry" | "off-bottom";
type FrameFacing = "left" | "right" | "front";
type LimbState = "neutral" | "up" | "forward" | "back" | "down" | "guard";
type VisibilityMode = "full" | "partial";
type FrameMotionProfile =
  | "generic"
  | "walk-cycle"
  | "run-cycle"
  | "punch-sequence"
  | "kick-sequence"
  | "jump-sequence"
  | "breathing-cycle"
  | "spin-sequence"
  | "bounce-sequence"
  | "fall-explosion";
type FrameMotionBeat =
  | "generic"
  | "walk-right-contact"
  | "walk-passing"
  | "walk-left-contact"
  | "run-right-contact"
  | "run-passing"
  | "run-left-contact"
  | "punch-windup"
  | "punch-impact"
  | "punch-follow-through"
  | "punch-recovery"
  | "kick-windup"
  | "kick-chamber"
  | "kick-contact"
  | "kick-recovery"
  | "jump-crouch"
  | "jump-rise"
  | "jump-peak"
  | "jump-land"
  | "jump-recovery"
  | "breath-in"
  | "breath-peak"
  | "breath-out"
  | "breath-recover"
  | "spin-start"
  | "spin-fast"
  | "spin-loop"
  | "spin-settle"
  | "bounce-fall"
  | "bounce-rise"
  | "bounce-contact"
  | "bounce-rebound"
  | "bounce-settle"
  | "fall-high"
  | "fall-fast"
  | "impact-contact"
  | "explosion-build"
  | "explosion-bloom"
  | "explosion-fade";
type FrameEffectType = "none" | "explosion" | "lightning" | "smoke" | "shockwave";
type FrameEffectPhase = "none" | "build" | "ignite" | "blast" | "peak" | "breakup" | "smoke" | "fade";

export type GeneratedFrameRenderInput = {
  userPrompt: string;
  generatedFramePlan: DrawingAiGeneratedFramePlan;
  workspaceContext?: DrawingAiWorkspaceContext | null;
  width: number;
  height: number;
};

export type GeneratedFrameRenderResult =
  | {
      ok: true;
      bitmap: ImageData;
      previewUrl: string | null;
      summary: string;
      supportLevel: "full" | "partial";
      diagnostics: GeneratedFramePlanDiagnostics;
      workspaceIntent: DrawingAiGeneratedFrameWorkspaceIntent | null;
      frames: Array<{
        bitmap: ImageData;
        previewUrl: string | null;
        summary: string;
      }>;
    }
  | {
      ok: false;
      reason: string;
    };

export type GeneratedFrameDiagnosticsFrame = {
  frameIndex: number;
  summary: string;
  motionBeat: FrameMotionBeat;
  bounds: DrawingAiWorkspaceBitmapBounds;
  estimatedStrokeCount: number;
  estimatedObjectCount: number;
  centerLockApplied: boolean;
  geometryClamped: boolean;
  absurdlyOversized: boolean;
  performanceProtectionTriggered: boolean;
  renderScaleDownApplied: boolean;
  strokeColor: string;
  fillColor: string | null;
};

export type GeneratedFramePlanDiagnostics = {
  frameCount: number;
  renderWidth: number;
  renderHeight: number;
  renderScaleDownApplied: boolean;
  performanceProtectionTriggered: boolean;
  geometryClamped: boolean;
  frames: GeneratedFrameDiagnosticsFrame[];
};

type FramePlan = {
  subjectType: FrameSubjectType;
  objectShape: ObjectShape;
  effectType: FrameEffectType;
  effectPhase: FrameEffectPhase;
  expression: FrameExpression;
  facialFeaturesEnabled: boolean;
  action: FrameAction;
  motionProfile: FrameMotionProfile;
  motionBeat: FrameMotionBeat;
  facing: FrameFacing;
  leftArm: LimbState;
  rightArm: LimbState;
  leftLeg: LimbState;
  rightLeg: LimbState;
  armLengthScale: number;
  placementX: FramePlacementX;
  placementY: FramePlacementY;
  visibility: VisibilityMode;
  strokeColor: string;
  scale: number;
  lean: number;
  hasStaff: boolean;
  robotStyle: boolean;
  zombieStyle: boolean;
  alienStyle: boolean;
  groundhogStyle: boolean;
  hornedStyle: boolean;
  wingedStyle: boolean;
  capeStyle: boolean;
  backgroundMode: boolean;
  filledHeadColor: string | null;
  objectFillColor: string | null;
  stageBackgroundColor: string | null;
  eyeColor: string | null;
  eyeScale: number;
  hasSunglasses: boolean;
  headTurnOffset: number;
  centerLock: boolean;
  preservePlacement: boolean;
  preserveScale: boolean;
  hasExplicitColor: boolean;
  motionBeatExplicit: boolean;
  effectPhaseExplicit: boolean;
  denseInbetweens: boolean;
  pixelStyle: boolean;
  arcadeStyle: boolean;
  hasExplosionOverlay: boolean;
  hasSmokeOverlay: boolean;
  hasShockwaveOverlay: boolean;
  backgroundOverlayShape: Extract<ObjectShape, "plain-landscape" | "city-background" | "room-background" | "hallway-background" | "mountain"> | null;
  backgroundScroll: boolean;
  secondaryFigureEnabled: boolean;
  secondaryFigureColor: string | null;
  sceneSetting: FrameSceneSetting;
  sceneDescriptors: string[];
  sceneProps: string[];
  coreIntensity: number;
  expansionStrength: number;
  spikeSharpness: number;
  breakupAmount: number;
  smokeDensity: number;
  debrisLevel: number;
  glowStrength: number;
  impactStrength: number;
  weightBias: number;
  speedBias: number;
  cartoonBias: number;
  smoothnessBias: number;
  airborneAction: boolean;
  roundKickStyle: boolean;
  supportLevel: "full" | "partial";
  frameCount: number;
  variationSeed: number;
};

const DEFAULT_STROKE_COLOR = "#000000";
const MAX_MULTI_FRAME_RENDER_DIMENSION = 720;
const MAX_SINGLE_FRAME_RENDER_DIMENSION = 960;
const PREVIEW_MAX_DIMENSION = 320;
const MAX_NON_BACKGROUND_WIDTH_RATIO = 0.58;
const MAX_NON_BACKGROUND_HEIGHT_RATIO = 0.76;
const MAX_NON_BACKGROUND_AREA_RATIO = 0.28;
const MAX_EFFECT_WIDTH_RATIO = 0.82;
const MAX_EFFECT_HEIGHT_RATIO = 0.78;
const MAX_EFFECT_AREA_RATIO = 0.42;
const STICK_FIGURE_COLORS: Record<string, string> = {
  black: "#0f1114",
  white: "#ffffff",
  red: "#f24d4d",
  blue: "#3d82f6",
  green: "#25a85b",
  yellow: "#f5c542",
  orange: "#f28d2f",
  purple: "#8a56f5",
  pink: "#f67ecb",
  gray: "#8d95a3",
  grey: "#8d95a3",
  brown: "#7a5a36",
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const hashTextToPositiveInt = (value: string) => {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
};
const lerp = (start: number, end: number, amount: number) => start + (end - start) * clamp(amount, 0, 1);
const easeInQuad = (value: number) => {
  const t = clamp(value, 0, 1);
  return t * t;
};
const easeOutQuad = (value: number) => {
  const t = clamp(value, 0, 1);
  return 1 - (1 - t) * (1 - t);
};

const hasExplicitColorMention = (value: string) =>
  Object.keys(STICK_FIGURE_COLORS).some((name) => new RegExp(`\\b${name}\\b`, "i").test(value.toLowerCase()));

const inferImplicitColor = (value: string) => {
  const lowerValue = value.toLowerCase();

  if (/\b(shrek|ogre)\b/i.test(lowerValue)) return STICK_FIGURE_COLORS.green;
  if (/\b(t-?rex|trex|dinosaur|rex)\b/i.test(lowerValue)) return STICK_FIGURE_COLORS.green;
  if (/\balien\b/i.test(lowerValue)) return "#67d88f";
  if (/\b(explosion|explode|blast|detonation|fireball|debris)\b/i.test(lowerValue)) return "#ff7a18";
  if (/\b(lightning|lightning strike|bolt|electric|energy slash|energy trail|magic slash|slash arc)\b/i.test(lowerValue)) return "#9ad8ff";
  if (/\b(fire|flame|burn|burning)\b/i.test(lowerValue)) return "#ff8d2a";
  if (/\b(rain|rainfall|storm|water)\b/i.test(lowerValue)) return "#6d88b8";
  if (/\b(tree|plant|leaf|foliage)\b/i.test(lowerValue)) return STICK_FIGURE_COLORS.green;
  if (/\b(mountain|rock|stone)\b/i.test(lowerValue)) return "#707b88";
  if (/\b(cloud|sky)\b/i.test(lowerValue)) return "#c7d8ef";
  if (/\b(rod|staff|wood|door|desk|crate|bamboo)\b/i.test(lowerValue)) return STICK_FIGURE_COLORS.brown;

  return DEFAULT_STROKE_COLOR;
};

const parseColor = (value: string) => {
  const lowerValue = value.toLowerCase();
  for (const [name, hex] of Object.entries(STICK_FIGURE_COLORS)) {
    if (new RegExp(`\\b${name}\\b`, "i").test(lowerValue)) {
      return hex;
    }
  }

  return inferImplicitColor(lowerValue);
};

const inferStageBackgroundColor = (value: string) => {
  const lowerValue = value.toLowerCase();
  for (const [name, hex] of Object.entries(STICK_FIGURE_COLORS)) {
    const beforePattern = new RegExp(`\\b${name}\\b(?:\\s+\\w+){0,2}\\s+background\\b`, "i");
    const afterPattern = new RegExp(`\\bbackground\\b(?:\\s+\\w+){0,2}\\b${name}\\b`, "i");
    if (beforePattern.test(lowerValue) || afterPattern.test(lowerValue)) {
      return hex;
    }
  }

  return null;
};

const detectMentionedColors = (value: string) =>
  Array.from(
    new Set(
      [...value.toLowerCase().matchAll(/\b(black|white|red|blue|green|yellow|orange|purple|pink|brown|gray|grey)\b/g)].map(
        (match) => match[1] ?? "",
      ),
    ),
  ).filter((entry) => entry.length > 0);

const inferSceneSetting = (value: string): FrameSceneSetting => {
  if (/\b(forest|woods?|grove|jungle)\b/i.test(value)) return "forest";
  if (/\b(canyon|ravine|gorge|cliffside)\b/i.test(value)) return "canyon";
  if (/\b(cave|cavern|grotto)\b/i.test(value)) return "cave";
  if (/\b(underground|subterranean|tunnel|catacomb|sewer)\b/i.test(value)) return "underground";
  if (/\b(arena|colosseum|stadium|pit fight|fighting pit|ring)\b/i.test(value)) return "arena";
  if (/\b(rooftop|roof top|roof edge|roof)\b/i.test(value)) return "rooftop";
  if (/\b(bedroom|bed room|bedside)\b/i.test(value)) return "bedroom";
  if (/\b(neighborhood|suburb(?:an)?|residential(?: street| area)?|subdivision)\b/i.test(value)) return "neighborhood";
  if (/\b(city|cityscape|street|skyline|urban)\b/i.test(value)) return "city";
  if (/\b(alley|back alley|backstreet)\b/i.test(value)) return "alley";
  if (/\b(plains?|field|grassland|meadow)\b/i.test(value)) return "plains";
  if (/\b(mountain(?: range)?s?|hills?)\b/i.test(value)) return "mountains";
  if (/\b(room|interior|corridor|hallway|chamber)\b/i.test(value)) return "room";
  if (/\b(temple|shrine|sanctum|ruins?|altar chamber)\b/i.test(value)) return "temple";
  if (/\b(background|backdrop|environment|scene|setting)\b/i.test(value)) return "generic";
  return null;
};

const inferSceneProps = (value: string) => {
  const props: string[] = [];
  if (/\b(tree|trees|trunks?|foliage|branches?)\b/i.test(value)) props.push("trees");
  if (/\b(boulder|boulders|rock|rocks|stones?)\b/i.test(value)) props.push("boulders");
  if (/\b(stalactites?|stalagmites?|cave teeth|rock spires)\b/i.test(value)) props.push("stalactites");
  if (/\b(buildings?|skyline|windows?)\b/i.test(value)) props.push("buildings");
  if (/\b(bed|pillow|blanket)\b/i.test(value)) props.push("bed");
  if (/\b(ledge|railing|roof edge)\b/i.test(value)) props.push("ledge");
  if (/\b(pillars?|columns?)\b/i.test(value)) props.push("pillars");
  if (/\b(crystals?|crystalline shards?)\b/i.test(value)) props.push("crystals");
  if (/\b(mushrooms?|fungi|fungus)\b/i.test(value)) props.push("mushrooms");
  if (/\b(banners?|flags?|pennants?)\b/i.test(value)) props.push("banners");
  if (/\b(torches?|braziers?|lanterns?)\b/i.test(value)) props.push("torches");
  if (/\b(rubble|debris piles?|ruined stone|collapsed masonry)\b/i.test(value)) props.push("rubble");
  if (/\b(vines?|ivy|overgrowth|roots?)\b/i.test(value)) props.push("vines");
  if (/\b(crowd|spectators?|audience)\b/i.test(value)) props.push("crowd");
  if (/\b(neon signs?|signage|hologram ads?)\b/i.test(value)) props.push("neon-signs");
  if (/\b(fence|barrier|gate)\b/i.test(value)) props.push("fence");
  if (/\b(lava|magma|molten pool)\b/i.test(value)) props.push("lava-pools");
  if (/\b(cables?|wires?|power lines?)\b/i.test(value)) props.push("cables");
  return props;
};

const inferSceneDescriptors = (value: string) => {
  const descriptors: string[] = [];
  const descriptorPattern =
    /\b(alien|bioluminescent|ruined|overgrown|ancient|crystalline|volcanic|neon|cyberpunk|floating|storm[- ]?battered|gloomy|ceremonial|industrial|abandoned)\b/gi;
  for (const match of value.matchAll(descriptorPattern)) {
    const descriptor = (match[1] ?? "").trim().toLowerCase();
    if (descriptor.length > 0 && !descriptors.includes(descriptor)) {
      descriptors.push(descriptor);
    }
  }
  return descriptors;
};

const inferSecondaryFigureEnabled = (value: string) =>
  /\b(two|2|pair|both)\b(?:[\s-]+\w+){0,5}[\s-]+(stick(?:\s|-)?figures?|characters?|figures?|fighters?|people)\b/i.test(value) ||
  /\b(face each other|facing each other|opponent|target|attacker|defender|other figure|another stick(?:\s|-)?figure|another figure)\b/i.test(value) ||
  /\b(left|right)\b(?:[\s-]+\w+){0,3}\b(red|blue|green|yellow|orange|purple|pink|black|white|gray|grey)\b/i.test(value);

const hexToRgb = (value: string) => {
  const normalized = value.replace("#", "");
  const safeHex = normalized.length === 3
    ? normalized
        .split("")
        .map((part) => `${part}${part}`)
        .join("")
    : normalized;

  if (!/^[0-9a-f]{6}$/i.test(safeHex)) {
    return null;
  }

  return {
    r: Number.parseInt(safeHex.slice(0, 2), 16),
    g: Number.parseInt(safeHex.slice(2, 4), 16),
    b: Number.parseInt(safeHex.slice(4, 6), 16),
  };
};

const rgba = (value: string, alpha: number) => {
  const rgb = hexToRgb(value);
  if (!rgb) {
    return value;
  }

  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${clamp(alpha, 0, 1)})`;
};

const mixColors = (base: string, target: string, amount: number) => {
  const baseRgb = hexToRgb(base);
  const targetRgb = hexToRgb(target);
  if (!baseRgb || !targetRgb) {
    return base;
  }

  const t = clamp(amount, 0, 1);
  const mixChannel = (from: number, to: number) => Math.round(from + (to - from) * t);
  const toHex = (channel: number) => channel.toString(16).padStart(2, "0");

  return `#${toHex(mixChannel(baseRgb.r, targetRgb.r))}${toHex(mixChannel(baseRgb.g, targetRgb.g))}${toHex(mixChannel(baseRgb.b, targetRgb.b))}`;
};

const inferExpression = (value: string): FrameExpression => {
  if (/\b(smil(?:e|ing)|happy|joyful|cheerful|playful)\b/i.test(value)) return "smile";
  if (/\b(shock(?:ed)?|surprised?|wide eyes?|gasp|pant(?:ing)?|breathing hard|hard breathing)\b/i.test(value)) return "shocked";
  if (/\b(angry|mad|furious)\b/i.test(value)) return "angry";
  if (/\b(sad|down|upset|frown(?:ing)?)\b/i.test(value)) return "sad";
  if (/\b(determined|focused|ready to fight)\b/i.test(value)) return "determined";
  if (/\b(scared|afraid|terrified)\b/i.test(value)) return "scared";
  return "neutral";
};

const OBJECT_ONLY_PATTERN =
  /\b(dot|ball|circle|orb|sphere|square|rectangle|block|box|rod|staff|prop|object|tree|plant|fan|propeller|door|desk|crate|cloud|mountain|rock|plains?|field|grassland|meadow|city|cityscape|skyline|buildings?|hallway|room|background|backdrop|scene element|environment|scene|lightning|bolt|fire|flame|rain|rainfall|energy trail|energy slash|slash arc|slash effect|explosion|explode|blast|detonation|smoke|dust|debris|shockwave|crack|cracks|fracture|fractures|concrete)\b/i;
const ROUND_CHARACTER_PATTERN =
  /\b(round character|character|person|creature|ball with|circle with|ogre|shrek(?:-like)?|t-?rex|trex|dinosaur|alien)\b/i;
const CHARACTER_FEATURE_PATTERN =
  /\b(eyes?|mouth|smil(?:e|ing)|face|arms?|legs?|feet|hands?)\b/i;
const ANTI_HUMANOID_PATTERN =
  /\b(just a ball|just a circle|keep it as a ball|keep it as a circle|not a character|no face|no eyes|no mouth|no arms|no legs)\b/i;
const CREATURE_PATTERN = /\b(simple creature|creature|monster|blob|ogre|shrek(?:-like)?|t-?rex|trex|dinosaur|alien)\b/i;
const CURRENT_FRAME_EDIT_PATTERN =
  /\b(make it|make him|make her|make them|keep the same|same drawing|same character|same figure|current drawing|current frame|raise|lower|turn|fill(?:ed| in)?|change|bigger|larger|smaller|shrink|white eyes|sunglasses|shades|smile|shocked|angry|tired|sad|guard|punch|kick|jump|land|run in|off-camera|enter from|disintegrat(?:e|ing)|dissipat(?:e|ing)|fade(?: away| out)?|dust|smoke|smoother|faster|heavier|cartoony)\b/i;
const SIZE_CHANGE_PATTERN =
  /\b(bigger|larger|grow|smaller|shrink|giant|huge|big|small|tiny|far away)\b/i;
const INBETWEEN_REFINEMENT_PATTERN =
  /\b(add (?:the )?in[- ]betweens?|make (?:the )?in[- ]betweens?|in[- ]betweens? between all frames|between all the frames|smooth this out|smooth it out|smooth results|smooth the animation|make it smoother)\b/i;
const PIXEL_STYLE_PATTERN = /\b(pixely|pixelly|pixel-y|pixel art)\b/i;
const ARCADE_STYLE_PATTERN = /\b(arcadey|arcade-y|retro arcade|retro)\b/i;
const CURRENT_SEQUENCE_EDIT_PATTERN =
  /\b(same animation but|same bounce but|keep the same bounce but|same sequence but|same move but|same motion but|same animation|current animation|current sequence|same explosion but|keep the same explosion but)\b/i;
const BACKGROUND_PATTERN =
  /\b(background|backdrop|cloud layer|mountain background|hallway background|dark room|room|hallway|corridor|environment|scene|walls?|floor|ceiling|in the background|landscape|plains?|field|grassland|meadow|mountain(?: range)?s?|city|cityscape|skyline|buildings?|forest|woods?|grove|jungle|canyon|ravine|gorge|cliffside|rooftop|roof|bedroom|bed room|street|alley)\b/i;
const EFFECT_ONLY_PATTERN =
  /\b(explosion|explode|blast|detonation|fireball|smoke|dust|debris|shockwave|lightning|bolt|fire|flame|glow|energy trail|energy slash|slash arc|slash effect|rain|rainfall|crack|cracks|fracture|fractures)\b/i;

const inferEffectType = (value: string): FrameEffectType => {
  if (/\b(explosion|explode|blast|detonation|fireball)\b/i.test(value)) return "explosion";
  if (/\b(lightning|lightning strike|bolt)\b/i.test(value)) return "lightning";
  if (/\b(shockwave|dusty shockwave|dust ring|blast ring)\b/i.test(value)) return "shockwave";
  if (/\b(smoke|dust|debris|mist|vapor)\b/i.test(value)) return "smoke";
  return "none";
};

const inferEffectPhase = (value: string, effectType: FrameEffectType): FrameEffectPhase => {
  if (effectType === "none") {
    return "none";
  }

  if (/\b(build|compress(?:ion)?|pressure|pre[- ]blast|pre[- ]burst|charge(?:d|ing)?|preflash)\b/i.test(value)) {
    return "build";
  }
  if (/\b(ignite|ignition|flash point|initial flash|first flash)\b/i.test(value)) {
    return "ignite";
  }
  if (/\b(blast|release|strike|snap|detonation|rupture|outward)\b/i.test(value)) {
    return effectType === "shockwave" ? "blast" : "blast";
  }
  if (/\b(peak|peak spread|widest|full spread|maximum)\b/i.test(value)) {
    return "peak";
  }
  if (/\b(breakup|break apart|breaks apart|fragments?|debris|shatter|fragmentation)\b/i.test(value)) {
    return "breakup";
  }
  if (/\b(smoke|dust|vapor|aftermath|afterglow cloud|lingering cloud)\b/i.test(value)) {
    return "smoke";
  }
  if (/\b(fade|fading|thin out|dissipate|dissolving|disintegrat(?:e|ing)|settle|settling)\b/i.test(value)) {
    return "fade";
  }

  if (effectType === "lightning") {
    return "blast";
  }

  return effectType === "smoke" ? "smoke" : "peak";
};

const hasExplicitEffectPhase = (value: string, effectType: FrameEffectType) =>
  effectType !== "none" &&
  /\b(build|compress(?:ion)?|pressure|pre[- ]blast|pre[- ]burst|charge(?:d|ing)?|preflash|ignite|ignition|flash point|initial flash|blast|release|strike|snap|detonation|rupture|peak|widest|breakup|fragments?|debris|smoke|dust|aftermath|fade|fading|dissipate|disintegrat(?:e|ing)|settle)\b/i.test(
    value,
  );

const inferImpactStrength = (value: string) => {
  let amount = 1;
  if (/\b(brutal|violent|savage)\b/i.test(value)) amount += 0.34;
  if (/\b(hit harder|harder|heavier|weightier|more powerful|stronger|powerful|ultimate)\b/i.test(value)) amount += 0.26;
  if (/\bimpact|shockwave|slam|forceful|violent\b/i.test(value)) amount += 0.14;
  if (/\b(weak|scared|hesitant|timid|tentative)\b/i.test(value)) amount -= 0.24;
  return clamp(amount, 0.62, 1.7);
};

const inferWeightBias = (value: string) => {
  let amount = 1;
  if (/\b(heavier|more weight|weightier|grounded|harder steps?|impact|powerful|serious)\b/i.test(value)) amount += 0.24;
  if (/\b(angry|mad|furious|grumpy|irritated)\b/i.test(value)) amount += 0.14;
  if (/\b(sad|downcast|depressed|gloomy)\b/i.test(value)) amount += 0.08;
  if (/\b(joyful|happy|cheerful|playful|bouncy)\b/i.test(value)) amount -= 0.06;
  if (/\b(light|lighter|floaty)\b/i.test(value)) amount -= 0.16;
  if (/\b(weak|scared|hesitant|timid|tentative)\b/i.test(value)) amount -= 0.18;
  return clamp(amount, 0.62, 1.6);
};

const inferSpeedBias = (value: string) => {
  let amount = 1;
  if (/\b(faster|quicker|snappier|more energetic|faster walk|faster run|brutal|powerful|flash[- ]fast|motion blur|ghost trail|afterimage)\b/i.test(value)) amount += 0.18;
  if (/\b(angry|mad|furious|joyful|happy|cheerful|playful)\b/i.test(value)) amount += 0.1;
  if (/\b(sad|downcast|depressed|gloomy)\b/i.test(value)) amount -= 0.12;
  if (/\b(slower|slower fade|linger|lingering|hang time)\b/i.test(value)) amount -= 0.12;
  if (/\b(weak|scared|hesitant|timid|tentative)\b/i.test(value)) amount -= 0.14;
  return clamp(amount, 0.65, 1.5);
};

const inferCartoonBias = (value: string) => {
  let amount = 1;
  if (/\b(cartoony|toon|more cartoon|playful|elastic)\b/i.test(value)) amount += 0.34;
  if (/\b(joyful|happy|cheerful|bouncy)\b/i.test(value)) amount += 0.1;
  if (/\b(realistic|serious)\b/i.test(value)) amount -= 0.1;
  return clamp(amount, 0.8, 1.5);
};

const inferSmoothnessBias = (value: string) => {
  let amount = 1;
  if (/\b(smooth(?:er)?|cleaner|polish|better in[- ]betweens?|flow more naturally|motion blur|ghost trail|afterimage|clearer silhouette|clean limbs|readable)\b/i.test(value)) amount += 0.18;
  if (/\b(choppy|rough|stiff)\b/i.test(value)) amount -= 0.16;
  return clamp(amount, 0.74, 1.4);
};

const inferSubjectType = (value: string): FrameSubjectType => {
  if (/\bstick(?:\s|-)?(?:figure|man|person)?\b/i.test(value)) {
    return "stick-figure";
  }

  if (CREATURE_PATTERN.test(value) && !ANTI_HUMANOID_PATTERN.test(value)) {
    return "round-character";
  }

  if (ROUND_CHARACTER_PATTERN.test(value) || (/\b(circle|round)\b/i.test(value) && CHARACTER_FEATURE_PATTERN.test(value) && !ANTI_HUMANOID_PATTERN.test(value))) {
    return "round-character";
  }

  if (inferEffectType(value) !== "none" && !CHARACTER_FEATURE_PATTERN.test(value)) {
    return "effect";
  }

  if (BACKGROUND_PATTERN.test(value)) {
    return "simple-object";
  }

  if (ANTI_HUMANOID_PATTERN.test(value) || OBJECT_ONLY_PATTERN.test(value)) {
    return "simple-object";
  }

  return "stick-figure";
};

const inferObjectShape = (value: string): ObjectShape => {
  if (/\bhallway background\b|\bschool hallway background\b/i.test(value)) return "hallway-background";
  if (/\b(night(?:time)? city|night city|cityscape|skyline|buildings?)\b/i.test(value)) return "city-background";
  if (/\b(plains?|plain|field|grassland|meadow|landscape)\b/i.test(value)) return "plain-landscape";
  if (/\bdark room\b|\broom\b|\bcorridor\b/i.test(value)) return "room-background";
  if (/\b(crack|cracks|fracture|fractures)\b.*\bconcrete\b|\bconcrete\b.*\b(crack|cracks|fracture|fractures)\b/i.test(value)) return "concrete-cracks";
  if (/\b(lightning|lightning strike|bolt)\b/i.test(value)) return "lightning";
  if (/\b(smoke|dust|debris|mist)\b/i.test(value)) return "smoke-cloud";
  if (/\b(fire|flame)\b/i.test(value)) return "flame";
  if (/\b(rain|rainfall)\b/i.test(value)) return "rain";
  if (/\b(energy slash|energy trail|slash arc|slash effect|sword swing|sword slash)\b/i.test(value)) return "slash-arc";
  if (/\b(portal|gateway|rift)\b/i.test(value)) return "portal";
  if (/\b(crystal|crystalline shard)\b/i.test(value)) return "crystal";
  if (/\b(pillar|column)\b/i.test(value)) return "pillar";
  if (/\b(mushroom|fungus|fungi)\b/i.test(value)) return "mushroom";
  if (/\b(torch|lantern|brazier)\b/i.test(value)) return "torch";
  if (/\b(fence|gate|barrier)\b/i.test(value)) return "fence";
  if (/\b(sign|signage|billboard)\b/i.test(value)) return "sign";
  if (/\b(rubble|debris pile|collapsed masonry)\b/i.test(value)) return "rubble-pile";
  if (/\bdesk\b/i.test(value)) return "desk";
  if (/\bdoor\b/i.test(value)) return "door";
  if (/\bcrate\b/i.test(value)) return "crate";
  if (/\bcloud\b/i.test(value)) return "cloud";
  if (/\bmountain\b/i.test(value)) return "mountain";
  if (/\brock\b/i.test(value)) return "rock";
  if (/\btree\b/i.test(value)) return "tree";
  if (/\bplant\b/i.test(value)) return "plant";
  if (/\b(fan|propeller)\b/i.test(value)) return "fan";
  if (/\b(square|block|box)\b/i.test(value)) return "square";
  if (/\brectangle|rectangular\b/i.test(value)) return "rectangle";
  if (/\b(rod|staff)\b/i.test(value)) return "rod";
  if (/\b(dot|ball|orb|sphere)\b/i.test(value)) return "ball";
  return "circle";
};

const inferBackgroundOverlayShape = (
  value: string,
): Extract<ObjectShape, "plain-landscape" | "city-background" | "room-background" | "hallway-background" | "mountain"> | null => {
  if (/\b(night(?:time)? city|night city|cityscape|skyline|buildings?)\b/i.test(value)) return "city-background";
  if (/\b(plains?|plain|field|grassland|meadow|landscape)\b/i.test(value)) return "plain-landscape";
  if (/\bmountain(?: range)?s?\b/i.test(value)) return "mountain";
  if (/\bhallway background\b|\bschool hallway background\b/i.test(value)) return "hallway-background";
  if (/\bdark room\b|\broom\b|\bcorridor\b/i.test(value)) return "room-background";
  if (/\b(scroll|scrolling|move the background|moving background|background move|camera moving|camera move|parallax)\b/i.test(value)) return "plain-landscape";
  return null;
};

const inferCharacterPreferredAction = (value: string): FrameAction | null => {
  if (/\bpunch|hit connects\b/i.test(value)) return "punch";
  if (/\bkick|round kick|spin kick\b/i.test(value)) return "kick";
  if (/\bguard|block|fighting stance|fight stance|ready stance|guard stance\b/i.test(value)) return "guard";
  if (/\brun(?:ning)?|sprint\b/i.test(value)) return "run";
  if (/\bwalk(?:ing)?|step(?:ping)?\b/i.test(value)) return "step";
  if (/\bjump(?:ing)?|mid[- ]air\b/i.test(value)) return "jump";
  if (/\b(breath(?:e|es|ing)|pant(?:ing)?|breathing hard|hard breathing|inhale|exhale)\b/i.test(value)) return "breathe";
  if (/\bland(?:ing)?|landing frame\b/i.test(value)) return "land";
  if (/\bstumble|stumbling\b/i.test(value)) return "stumble";
  return null;
};

const inferFacing = (value: string): FrameFacing => {
  if (
    /\b(face(?:s|ing)? left|turn(?:s|ing)? left|moving left|move left|walking left|walk left|running left|run left|to the left|toward the left(?:-side)?|towards the left(?:-side)?|from the right|enter(?:ing)? from the right)\b/i.test(
      value,
    )
  ) {
    return "left";
  }
  if (
    /\b(face(?:s|ing)? right|turn(?:s|ing)? right|moving right|move right|walking right|walk right|running right|run right|to the right|toward the right(?:-side)?|towards the right(?:-side)?|from the left|enter(?:ing)? from the left)\b/i.test(
      value,
    )
  ) {
    return "right";
  }
  return "front";
};

const inferPlacementX = (value: string): FramePlacementX => {
  if (/\b(off[- ]camera|offscreen|outside camera|outside frame|outside the white area|dark area)\b.*\bleft\b/i.test(value) || /\bjust off the left\b/i.test(value)) {
    return "off-left";
  }
  if (/\b(off[- ]camera|offscreen|outside camera|outside frame|outside the white area|dark area)\b.*\bright\b/i.test(value) || /\bjust off the right\b/i.test(value)) {
    return "off-right";
  }
  if (/\b(partially|half|only show|coming in|enter(?:ing)?|peek(?:ing)?)\b.*\bleft\b/i.test(value)) {
    return "left-entry";
  }
  if (/\b(partially|half|only show|coming in|enter(?:ing)?|peek(?:ing)?)\b.*\bright\b/i.test(value)) {
    return "right-entry";
  }
  if (/\bexit(?:ing)?|leave(?:s|ing)?|run out\b.*\bleft\b/i.test(value)) {
    return "left-entry";
  }
  if (/\bexit(?:ing)?|leave(?:s|ing)?|run out\b.*\bright\b/i.test(value)) {
    return "right-entry";
  }
  if (/\bleft side\b|\bon the left\b/i.test(value)) return "left";
  if (/\bright side\b|\bon the right\b/i.test(value)) return "right";
  return "center";
};

const inferPlacementY = (value: string): FramePlacementY => {
  if (/\b(off[- ]camera|offscreen|outside camera|outside frame)\b.*\btop\b|\babove frame\b/i.test(value)) {
    return "off-top";
  }
  if (/\b(off[- ]camera|offscreen|outside camera|outside frame)\b.*\bbottom\b|\bbelow frame\b/i.test(value)) {
    return "off-bottom";
  }
  if (/\b(partially|half|only show|coming in|enter(?:ing)?|peek(?:ing)?)\b.*\btop\b/i.test(value)) {
    return "top-entry";
  }
  if (/\b(partially|half|only show|coming in|enter(?:ing)?|peek(?:ing)?)\b.*\bbottom\b/i.test(value)) {
    return "bottom-entry";
  }
  if (/\bupper\b|\bhigh in frame\b/i.test(value)) return "upper";
  if (/\blower\b|\blow in frame\b/i.test(value)) return "lower";
  return "center";
};

const inferVisibility = (value: string): VisibilityMode =>
  /\b(partial|partially|half|only show|only part|only his|only her|only the)\b/i.test(value) ? "partial" : "full";

const inferScale = (value: string, workspaceContext?: DrawingAiWorkspaceContext | null) => {
  let scale = 1;

  if (/\b(a bit|slightly|little)\s+bigger\b/i.test(value)) {
    scale *= 1.18;
  } else if (/\b(much|way)\s+bigger\b/i.test(value)) {
    scale *= 1.42;
  } else if (/\b(bigger|larger|grow)\b/i.test(value)) {
    scale *= 1.28;
  }

  if (/\b(a bit|slightly|little)\s+smaller\b/i.test(value)) {
    scale *= 0.84;
  } else if (/\b(much|way)\s+smaller\b/i.test(value)) {
    scale *= 0.64;
  } else if (/\b(smaller|shrink)\b/i.test(value)) {
    scale *= 0.74;
  }

  if (/\b(giant|huge|big)\b/i.test(value)) scale *= 1.34;
  if (/\b(small|tiny|far away)\b/i.test(value)) scale *= 0.72;
  if (BACKGROUND_PATTERN.test(value) && !SIZE_CHANGE_PATTERN.test(value)) scale *= 0.88;
  if (workspaceContext?.currentFrameBounds?.height) {
    const normalizedHeight = workspaceContext.currentFrameBounds.height / Math.max(1, workspaceContext.canvasHeight);
    return clamp((normalizedHeight / 0.36) * scale, 0.54, 1.55);
  }
  return clamp(scale, 0.54, 1.55);
};

const inferFilledHeadColor = (value: string, strokeColor: string) => {
  for (const [colorName, colorValue] of Object.entries(STICK_FIGURE_COLORS)) {
    if (
      new RegExp(`\\b(fill(?:ed| in)?|make|solid)\\b.*\\b(face|head)\\b.*\\b${colorName}\\b`, "i").test(value) ||
      new RegExp(`\\b${colorName}\\b.*\\b(face|head)\\b.*\\b(fill(?:ed| in)?|solid)\\b`, "i").test(value) ||
      new RegExp(`\\bsolid\\s+${colorName}\\s+(?:face|head)\\b`, "i").test(value) ||
      new RegExp(`\\b${colorName}\\s+face\\b`, "i").test(value)
    ) {
      return colorValue;
    }
  }

  if (/\bfilled face\b|\bfilled head\b/i.test(value)) {
    return strokeColor;
  }

  return null;
};

const hasExplicitFacialFeaturesRequest = (value: string) =>
  !/\b(no face|no visible face|without a face|no facial features|no eyes|no mouth)\b/i.test(value) &&
  /\b(face|eyes?|mouth|eyebrows?|teeth|nose|facial|smil(?:e|ing)|grin(?:ning)?|expression|sunglasses|shades)\b/i.test(
    value,
  );

const inferObjectFillColor = (value: string, strokeColor: string) => {
  if (!/\b(ball|dot|circle|orb|sphere|square|rectangle|block|box|object|prop)\b/i.test(value)) {
    return null;
  }

  if (/\b(center black|black center|filled black|solid black)\b/i.test(value)) {
    return STICK_FIGURE_COLORS.black;
  }

  if (/\b(fill(?:ed| in)?|solid|use)\b/i.test(value) && hasExplicitColorMention(value)) {
    return parseColor(value);
  }

  if (/\b(fill(?:ed| in)?|solid)\b/i.test(value)) {
    return strokeColor;
  }

  return null;
};

const inferEyeColor = (value: string, filledHeadColor: string | null) => {
  if (/\bwhite eyes?\b/i.test(value)) {
    return STICK_FIGURE_COLORS.white;
  }

  if (filledHeadColor === STICK_FIGURE_COLORS.black) {
    return STICK_FIGURE_COLORS.white;
  }

  return null;
};

const inferEyeScale = (value: string) => {
  if (/\b(much|way)\s+bigger eyes?\b|\bhuge eyes?\b/i.test(value)) {
    return 1.5;
  }

  if (/\b(bigger|larger|wide)\s+eyes?\b/i.test(value)) {
    return 1.28;
  }

  if (/\b(smaller|tiny)\s+eyes?\b/i.test(value)) {
    return 0.78;
  }

  return 1;
};

const inferArmLengthScale = (value: string) => {
  if (/\b(much|way)\s+longer arm\b|\bmuch longer arms\b/i.test(value)) {
    return 1.4;
  }

  if (/\b(longer arm|longer arms|arm longer)\b/i.test(value)) {
    return 1.22;
  }

  if (/\b(shorter arm|shorter arms)\b/i.test(value)) {
    return 0.82;
  }

  return 1;
};

const inferHeadTurnOffset = (value: string, facing: FrameFacing) => {
  if (/\bturn (?:his|her|the)? head\b/i.test(value) && !/\bleft\b|\bright\b/i.test(value)) {
    return facing === "left" ? -10 : 10;
  }

  if (/\bturn (?:his|her|the)? head\b.*\bleft\b|\bhead toward the left\b/i.test(value)) {
    return -12;
  }

  if (/\bturn (?:his|her|the)? head\b.*\bright\b|\bhead toward the right\b/i.test(value)) {
    return 12;
  }

  return 0;
};

const inferAction = (value: string): FrameAction => {
  if (/\b(explosion buildup|pre[- ]burst|preflash|charge(?:d|ing)? up)\b/i.test(value)) return "explode";
  if (/\b(explosion bloom|explosion fade|explodes?|blast|detonation)\b/i.test(value)) return "explode";
  if (/\b(breath(?:e|es|ing)|pant(?:ing)?|breathing hard|hard breathing|inhale|exhale)\b/i.test(value)) return "breathe";
  if (/\b(impact contact|ground contact|landing contact|hits the ground|hit the ground)\b/i.test(value)) return "land";
  if (/\b(falling dot|accelerating downward|speeding up with gravity)\b/i.test(value)) return "fall";
  if (/\b(explosion|explode|explodes|blast|burst|detonation)\b/i.test(value)) return "explode";
  if (/\b(fan|propeller|blades?)\b.*\b(spin|spinning|rotate|rotating|whirl(?:ing)?)\b|\b(spin|spinning|rotate|rotating|whirl(?:ing)?)\b.*\b(fan|propeller|blades?)\b/i.test(value)) {
    return "spin";
  }
  if (/\b(bamboo|staff|rod)\b.*\b(spin|spinning|twirl|flourish)\b/i.test(value)) return "staff-spin";
  if (/\bsway|swaying\b/i.test(value)) return "sway";
  if (/\bbob|bobbing\b/i.test(value)) return "bob";
  if (/\bstumble|stumbling\b/i.test(value)) return "stumble";
  if (/\b(rebound|bounce back|bounce up)\b/i.test(value)) return "rebound";
  if (/\b(settle|settling|comes to rest|nearly stopping|stopping)\b/i.test(value) && /\b(ball|dot|bounce|rebound|dribble)\b/i.test(value)) return "rebound";
  if (/\b(bounce|bouncing)\b/i.test(value)) return "bounce";
  if (/\broll(?:ing)?\b/i.test(value)) return "roll";
  if (/\b(fall(?:ing)?|drop(?:ping)?|drops in)\b/i.test(value)) return "fall";
  if (/\bslide(?:s|ing)?\b/i.test(value)) return "slide";
  if (/\brun(?:ning)?|sprint\b/i.test(value)) return "run";
  if (/\bjump(?:ing)?|mid[- ]air\b/i.test(value)) return "jump";
  if (/\bland(?:ing)?|landing frame\b/i.test(value)) return "land";
  if (/\bpunch|hit connects\b/i.test(value)) return "punch";
  if (/\bkick|round kick|spin kick\b/i.test(value)) return "kick";
  if (/\bslam|overhand\b/i.test(value)) return "slam";
  if (/\bguard|block\b/i.test(value)) return "guard";
  if (/\bstep\b|\bwalk\b/i.test(value)) return "step";
  return "stand";
};

const inferCenterLock = (value: string) =>
  /\b(center|centered|stay in one place|stays in one place|in place|not moving|treadmill|camera(?:'s| is)? following|camera follow|camera-follow|same spot|anchored|no horizontal drift|no horizontal travel)\b/i.test(
    value,
  );

const inferMotionProfile = (value: string, action: FrameAction): FrameMotionProfile => {
  if (/\b(walk(?:ing)?|treadmill)\b/i.test(value)) {
    return "walk-cycle";
  }
  if (/\b(run(?:ning)?|sprint)\b/i.test(value)) {
    return "run-cycle";
  }
  if (action === "breathe") {
    return "breathing-cycle";
  }
  if (action === "spin") {
    return "spin-sequence";
  }
  if (action === "punch") {
    return "punch-sequence";
  }
  if (action === "kick") {
    return "kick-sequence";
  }
  if (action === "jump" || action === "land") {
    return "jump-sequence";
  }
  if (/\b(bounce|rebound|boing)\b/i.test(value)) {
    return "bounce-sequence";
  }
  if (/\b(fall|falling|drop|gravity|explosion|explode|blast)\b/i.test(value)) {
    return "fall-explosion";
  }
  return "generic";
};

const inferMotionBeat = (value: string, motionProfile: FrameMotionProfile): FrameMotionBeat => {
  if (motionProfile === "walk-cycle" || motionProfile === "run-cycle") {
    if (/\bright contact\b/i.test(value)) {
      return motionProfile === "run-cycle" ? "run-right-contact" : "walk-right-contact";
    }
    if (/\bleft contact\b/i.test(value)) {
      return motionProfile === "run-cycle" ? "run-left-contact" : "walk-left-contact";
    }
    if (/\bpassing\b/i.test(value)) {
      return motionProfile === "run-cycle" ? "run-passing" : "walk-passing";
    }
    return motionProfile === "run-cycle" ? "run-right-contact" : "walk-right-contact";
  }

  if (motionProfile === "punch-sequence") {
    if (/\b(wind[- ]?up|anticipation|chamber(?:ed)?)\b/i.test(value)) return "punch-windup";
    if (/\b(impact|contact|hit)\b/i.test(value)) return "punch-impact";
    if (/\b(follow[- ]through|overshoot|carry through)\b/i.test(value)) return "punch-follow-through";
    if (/\b(recovery|recover|recoil|reset|settle)\b/i.test(value)) return "punch-recovery";
    return "punch-impact";
  }

  if (motionProfile === "kick-sequence") {
    if (/\b(wind[- ]?up|anticipation|prep|prepare|takeoff)\b/i.test(value)) return "kick-windup";
    if (/\b(chamber|airborne|swing|extension|release)\b/i.test(value)) return "kick-chamber";
    if (/\b(impact|contact|hit)\b/i.test(value)) return "kick-contact";
    if (/\b(recovery|recover|recoil|settle|reset)\b/i.test(value)) return "kick-recovery";
    return "kick-contact";
  }

  if (motionProfile === "jump-sequence") {
    if (/\b(crouch|anticipation|bend|compress)\b/i.test(value)) return "jump-crouch";
    if (/\b(rise|higher|lift|launch|takeoff|next jump beat)\b/i.test(value)) return "jump-rise";
    if (/\b(peak|apex|hang)\b/i.test(value)) return "jump-peak";
    if (/\b(land|landing|contact)\b/i.test(value)) return "jump-land";
    if (/\b(recovery|recover|settle)\b/i.test(value)) return "jump-recovery";
    return "jump-rise";
  }

  if (motionProfile === "breathing-cycle") {
    if (/\b(inhale|breath(?:ing)? in|chest rise|draw(?:ing)? breath|lungs fill)\b/i.test(value)) return "breath-in";
    if (/\b(peak inhale|breath peak|held inhale|top of the breath)\b/i.test(value)) return "breath-peak";
    if (/\b(exhale|breath(?:ing)? out|release breath|drop the chest|pant out)\b/i.test(value)) return "breath-out";
    if (/\b(recover|recovery|return|reset|next breath|rhythm)\b/i.test(value)) return "breath-recover";
    return "breath-in";
  }

  if (motionProfile === "spin-sequence") {
    if (/\b(setup|still|idle|before the spin)\b/i.test(value)) return "spin-start";
    if (/\b(spool|spool-up|starting to spin|accelerat(?:e|ing)|spin start)\b/i.test(value)) return "spin-start";
    if (/\b(fast spin|full spin|high speed|rapid spin)\b/i.test(value)) return "spin-fast";
    if (/\b(loop|continuous|steady spin|loop close)\b/i.test(value)) return "spin-loop";
    if (/\b(settle|slow down|spin down|stop)\b/i.test(value)) return "spin-settle";
    return "spin-fast";
  }

  if (motionProfile === "bounce-sequence") {
    if (/\b(fall|falling|drop|descending)\b/i.test(value)) return "bounce-fall";
    if (/\b(contact|ground|squash|impact)\b/i.test(value)) return "bounce-contact";
    if (/\b(settle|settling|stop|stopping|dribble|small rebound|tiny rebound|rest)\b/i.test(value)) return "bounce-settle";
    if (/\b(rebound|recover|upward|up)\b/i.test(value)) return "bounce-rebound";
    return "bounce-rise";
  }

  if (motionProfile === "fall-explosion") {
    if (/\b(buildup|build up|pre[- ]burst|preflash|charge(?:d|ing)?)\b/i.test(value)) return "explosion-build";
    if (/\b(explosion|explode|blast|bloom)\b/i.test(value)) {
      return /\b(fade|fading|fade[- ]out|fades out)\b/i.test(value) ? "explosion-fade" : "explosion-bloom";
    }
    if (/\b(impact|ground|hit|contact)\b/i.test(value)) return "impact-contact";
    if (/\b(fast|faster|gravity|speeding)\b/i.test(value)) return "fall-fast";
    return "fall-high";
  }

  return "generic";
};

const hasExplicitMotionBeat = (value: string, motionProfile: FrameMotionProfile) => {
  if (!value.trim()) {
    return false;
  }

  if (motionProfile === "walk-cycle" || motionProfile === "run-cycle") {
    return /\b(right contact|left contact|passing)\b/i.test(value);
  }

  if (motionProfile === "punch-sequence") {
    return /\b(wind[- ]?up|anticipation|chamber(?:ed)?|impact|contact|hit|recovery|recover|follow[- ]through|overshoot|recoil|settle)\b/i.test(
      value,
    );
  }

  if (motionProfile === "kick-sequence") {
    return /\b(wind[- ]?up|anticipation|prep|prepare|takeoff|chamber|airborne|swing|extension|release|impact|contact|hit|recovery|recover|recoil|settle|reset)\b/i.test(
      value,
    );
  }

  if (motionProfile === "jump-sequence") {
    return /\b(crouch|anticipation|bend|compress|rise|higher|lift|launch|takeoff|peak|apex|hang|land|landing|contact|recovery|recover|settle)\b/i.test(
      value,
    );
  }

  if (motionProfile === "breathing-cycle") {
    return /\b(inhale|breath(?:ing)? in|peak inhale|exhale|breath(?:ing)? out|recover|recovery|next breath|rhythm|pant)\b/i.test(value);
  }

  if (motionProfile === "spin-sequence") {
    return /\b(setup|idle|spool|accelerat(?:e|ing)|fast spin|full spin|rapid spin|loop|steady spin|settle|slow down|stop)\b/i.test(value);
  }

  if (motionProfile === "bounce-sequence") {
    return /\b(fall|falling|drop|descending|rise|contact|ground|squash|impact|rebound|recover|upward|settle|stopping|dribble|small rebound)\b/i.test(value);
  }

  if (motionProfile === "fall-explosion") {
    return /\b(fall|falling|gravity|impact|ground|hit|contact|explosion|explode|blast|bloom|fade|buildup|build up|preflash|charge)\b/i.test(value);
  }

  return false;
};

const resolveMotionBeatForFrame = (plan: FramePlan, frameIndex: number): FrameMotionBeat => {
  if (plan.motionBeatExplicit || plan.frameCount <= 1) {
    return plan.motionBeat;
  }

  if (plan.motionProfile === "walk-cycle") {
    return plan.frameCount === 2
      ? (frameIndex === 0 ? "walk-right-contact" : "walk-left-contact")
      : frameIndex === 0
        ? "walk-right-contact"
        : frameIndex === plan.frameCount - 1
          ? "walk-left-contact"
          : "walk-passing";
  }

  if (plan.motionProfile === "run-cycle") {
    return plan.frameCount === 2
      ? (frameIndex === 0 ? "run-right-contact" : "run-left-contact")
      : frameIndex === 0
        ? "run-right-contact"
        : frameIndex === plan.frameCount - 1
          ? "run-left-contact"
          : "run-passing";
  }

  if (plan.motionProfile === "punch-sequence") {
    if (plan.frameCount === 2) {
      return frameIndex === 0 ? "punch-windup" : "punch-impact";
    }
    if (plan.frameCount === 3) {
      return frameIndex === 0 ? "punch-windup" : frameIndex === 1 ? "punch-impact" : "punch-recovery";
    }
    const progress = frameIndex / Math.max(1, plan.frameCount - 1);
    if (progress < 0.28) return "punch-windup";
    if (progress < 0.58) return "punch-impact";
    if (progress < 0.8) return "punch-follow-through";
    return "punch-recovery";
  }

  if (plan.motionProfile === "kick-sequence") {
    if (plan.frameCount === 2) {
      return frameIndex === 0 ? "kick-windup" : "kick-contact";
    }
    if (plan.frameCount === 3) {
      return frameIndex === 0 ? "kick-windup" : frameIndex === 1 ? "kick-contact" : "kick-recovery";
    }
    const progress = frameIndex / Math.max(1, plan.frameCount - 1);
    if (progress < 0.24) return "kick-windup";
    if (progress < 0.52) return "kick-chamber";
    if (progress < 0.76) return "kick-contact";
    return "kick-recovery";
  }

  if (plan.motionProfile === "jump-sequence") {
    if (plan.frameCount === 2) {
      return frameIndex === 0 ? "jump-rise" : "jump-land";
    }
    if (plan.frameCount === 3) {
      return frameIndex === 0 ? "jump-rise" : frameIndex === 1 ? "jump-peak" : "jump-land";
    }
    if (plan.frameCount === 4) {
      return frameIndex === 0
        ? "jump-crouch"
        : frameIndex === 1
          ? "jump-rise"
          : frameIndex === 2
            ? "jump-peak"
            : "jump-land";
    }
    const progress = frameIndex / Math.max(1, plan.frameCount - 1);
    if (progress < 0.2) return "jump-crouch";
    if (progress < 0.42) return "jump-rise";
    if (progress < 0.68) return "jump-peak";
    if (progress < 0.9) return "jump-land";
    return "jump-recovery";
  }

  if (plan.motionProfile === "breathing-cycle") {
    if (plan.frameCount === 2) {
      return frameIndex === 0 ? "breath-in" : "breath-out";
    }
    if (plan.frameCount === 3) {
      return frameIndex === 0 ? "breath-in" : frameIndex === 1 ? "breath-out" : "breath-recover";
    }
    const progress = frameIndex / Math.max(1, plan.frameCount - 1);
    if (progress < 0.26) return "breath-in";
    if (progress < 0.5) return "breath-peak";
    if (progress < 0.78) return "breath-out";
    return "breath-recover";
  }

  if (plan.motionProfile === "spin-sequence") {
    if (plan.frameCount === 2) {
      return frameIndex === 0 ? "spin-start" : "spin-fast";
    }
    if (plan.frameCount === 3) {
      return frameIndex === 0 ? "spin-start" : frameIndex === 1 ? "spin-fast" : "spin-loop";
    }
    const progress = frameIndex / Math.max(1, plan.frameCount - 1);
    if (progress < 0.22) return "spin-start";
    if (progress < 0.62) return "spin-fast";
    if (progress < 0.88) return "spin-loop";
    return "spin-settle";
  }

  if (plan.motionProfile === "bounce-sequence") {
    if (plan.frameCount >= 6) {
      const sequence: FrameMotionBeat[] = [
        "bounce-fall",
        "bounce-fall",
        "bounce-contact",
        "bounce-contact",
        "bounce-rebound",
        "bounce-settle",
      ];
      return sequence[Math.min(frameIndex, sequence.length - 1)] ?? "bounce-settle";
    }
    return plan.frameCount === 2
      ? (frameIndex === 0 ? "bounce-fall" : "bounce-contact")
      : frameIndex === 0
        ? "bounce-fall"
        : frameIndex === plan.frameCount - 1
          ? "bounce-settle"
          : "bounce-contact";
  }

  if (plan.motionProfile === "fall-explosion") {
    return plan.frameCount === 2
      ? (frameIndex === 0 ? "explosion-build" : "explosion-bloom")
      : frameIndex === 0
        ? "fall-high"
        : frameIndex === plan.frameCount - 1
          ? "explosion-bloom"
          : "impact-contact";
  }

  return plan.motionBeat;
};

const inferContinuationFlags = (value: string, workspaceContext?: DrawingAiWorkspaceContext | null) => {
  const wantsContinuation =
    /\b(continue|same project|same scene|same animation|same sequence|same character|keep the same|next frame|after that|then he|then she|now make|animate (?:him|her|it|them)? now|generate the animation|turn this (?:plan|story) into frames|make the frames now|make (?:him|her|it|them) move)\b/i.test(value);
  const wantsCurrentFrameEdit =
    Boolean(workspaceContext?.currentFrameHasBitmap) && CURRENT_FRAME_EDIT_PATTERN.test(value);
  const wantsCurrentSequenceEdit =
    Boolean(workspaceContext?.currentFrameHasBitmap) &&
    (CURRENT_SEQUENCE_EDIT_PATTERN.test(value) || INBETWEEN_REFINEMENT_PATTERN.test(value));

  return {
    preservePlacement: (wantsContinuation || wantsCurrentFrameEdit || wantsCurrentSequenceEdit) && Boolean(workspaceContext?.currentFrameBounds),
    preserveScale:
      (wantsContinuation || wantsCurrentFrameEdit || wantsCurrentSequenceEdit) &&
      Boolean(workspaceContext?.currentFrameBounds) &&
      !SIZE_CHANGE_PATTERN.test(value),
  };
};

const inferLean = (value: string, action: FrameAction) => {
  if (/\blean(?:ing)? forward\b/i.test(value)) return 0.18;
  if (/\blean(?:ing)? back\b/i.test(value)) return -0.14;
  if (/\b(slumped|slouch(?:ed|ing)?|head lowered|drooping)\b/i.test(value)) return -0.08;
  if (action === "run") return 0.2;
  if (action === "breathe") return /\b(hard|pant(?:ing)?|breathing hard)\b/i.test(value) ? 0.04 : 0.02;
  if (action === "jump") return 0.08;
  if (action === "slam") return 0.16;
  return 0;
};

const inferLimbOverrides = (value: string) => {
  const overrides: Partial<Pick<FramePlan, "leftArm" | "rightArm" | "leftLeg" | "rightLeg">> = {};
  const mentionsSpecificArm = /\b(left|right) arm\b/i.test(value);

  if (/\bleft arm\b.*\b(up|raise|raised)\b/i.test(value)) overrides.leftArm = "up";
  if (/\bright arm\b.*\b(up|raise|raised)\b/i.test(value)) overrides.rightArm = "up";
  if (/\bleft arm\b.*\b(back)\b/i.test(value)) overrides.leftArm = "back";
  if (/\bright arm\b.*\b(back)\b/i.test(value)) overrides.rightArm = "back";
  if (/\bleft arm\b.*\b(forward|out)\b/i.test(value)) overrides.leftArm = "forward";
  if (/\bright arm\b.*\b(forward|out)\b/i.test(value)) overrides.rightArm = "forward";
  if (/\bleft leg\b.*\b(forward|up)\b/i.test(value)) overrides.leftLeg = "forward";
  if (/\bright leg\b.*\b(forward|up)\b/i.test(value)) overrides.rightLeg = "forward";
  if (/\bleft leg\b.*\b(back)\b/i.test(value)) overrides.leftLeg = "back";
  if (/\bright leg\b.*\b(back)\b/i.test(value)) overrides.rightLeg = "back";

  if (/\b(arms up|both arms up|raise both arms|hands up)\b/i.test(value)) {
    overrides.leftArm = "up";
    overrides.rightArm = "up";
  } else if (!mentionsSpecificArm) {
    if (/\b(raise|raised|lifting|lift)\b.*\barm\b|\barm\b.*\b(up)\b/i.test(value)) {
      overrides.rightArm = "up";
    } else if (/\barm\b.*\b(forward|out)\b/i.test(value)) {
      overrides.rightArm = "forward";
    } else if (/\barm\b.*\b(back)\b/i.test(value)) {
      overrides.rightArm = "back";
    }
  }

  if (/\bone arm back\b/i.test(value)) {
    overrides.rightArm ??= "back";
    overrides.leftArm ??= "forward";
  }

  return overrides;
};

const createBaseFramePlan = (
  descriptorText: string,
  frameDescriptorText: string,
  frameCount: number,
  workspaceContext?: DrawingAiWorkspaceContext | null,
): FramePlan => {
  const combinedText = descriptorText.trim();
  const frameSpecificText = frameDescriptorText.trim();
  const variationSeed = hashTextToPositiveInt(`${combinedText}\n${frameSpecificText}\nframes=${frameCount}`);
  const subjectType = inferSubjectType(combinedText);
  const actionFromFrameText = frameSpecificText.length > 0 ? inferAction(frameSpecificText) : "stand";
  let action =
    actionFromFrameText !== "stand" || /\bstand\b/i.test(frameSpecificText)
      ? actionFromFrameText
      : inferAction(combinedText);
  const preferredCharacterAction =
    subjectType !== "simple-object"
      ? inferCharacterPreferredAction(frameSpecificText.length > 0 ? `${frameSpecificText}\n${combinedText}` : combinedText)
      : null;
  if (preferredCharacterAction) {
    action = preferredCharacterAction;
  }
  const continuationFlags = inferContinuationFlags(combinedText, workspaceContext);
  const overrides = inferLimbOverrides(combinedText);
  const facing = inferFacing(combinedText);
  const centerLock = inferCenterLock(combinedText);
  const motionProfile = inferMotionProfile(combinedText, action);
  const motionBeatSource = frameSpecificText.length > 0 ? frameSpecificText : combinedText;
  const motionBeatExplicit = hasExplicitMotionBeat(frameSpecificText, motionProfile);
  const motionBeat = inferMotionBeat(motionBeatSource, motionProfile);
  const explicitColor = hasExplicitColorMention(combinedText);
  const explicitFacialFeatures = hasExplicitFacialFeaturesRequest(combinedText);
  const effectType = inferEffectType(frameSpecificText.length > 0 ? `${frameSpecificText}\n${combinedText}` : combinedText);
  const effectPhaseSource = frameSpecificText.length > 0 ? frameSpecificText : combinedText;
  const effectPhase = inferEffectPhase(effectPhaseSource, effectType);
  const effectPhaseExplicit = hasExplicitEffectPhase(frameSpecificText, effectType);
  const impactStrength = inferImpactStrength(combinedText);
  const weightBias = inferWeightBias(combinedText);
  const speedBias = inferSpeedBias(combinedText);
  const cartoonBias = inferCartoonBias(combinedText);
  const smoothnessBias = inferSmoothnessBias(combinedText);
  const coreIntensity = clamp(
    effectType === "explosion"
      ? 0.8 + (/\b(bright|dense core|hotter|intense|white-yellow core)\b/i.test(combinedText) ? 0.16 : 0) + (impactStrength - 1) * 0.32
      : effectType === "lightning"
        ? 0.78 + (impactStrength - 1) * 0.24
        : effectType === "shockwave"
          ? 0.4
          : effectType === "smoke"
            ? 0.24
            : 0,
    0,
    1,
  );
  const expansionStrength = clamp(
    effectType === "explosion" || effectType === "shockwave"
      ? 0.78 + (/\b(bigger|larger|wider|huge|massive|expansion)\b/i.test(combinedText) ? 0.18 : 0) + (impactStrength - 1) * 0.32
      : effectType === "smoke"
        ? 0.54
        : 0.42,
    0,
    1,
  );
  const spikeSharpness = clamp(
    /\b(spiky|jagged|starburst|sharp spikes?|zig(?:-|\s)?zag|forked|branch(?:ed|ing)?)\b/i.test(combinedText)
      ? effectType === "lightning"
        ? 0.96
        : 0.9
      : effectType === "lightning"
        ? 0.9
        : effectType === "explosion"
          ? 0.58
          : 0.18,
    0,
    1,
  );
  const breakupAmount = clamp(
    /\b(breakup|break apart|fragments?|debris|fragmentation|corrosive|chaotic)\b/i.test(combinedText)
      ? 0.82
      : effectType === "explosion"
        ? 0.7
        : 0.28,
    0,
    1,
  );
  const smokeDensity = clamp(
    /\b(smoke|dust|mist|vapor|aftermath|lingering)\b/i.test(combinedText)
      ? 0.78
      : effectType === "explosion"
        ? 0.34
        : effectType === "smoke"
          ? 0.88
          : 0.18,
    0,
    1,
  );
  const debrisLevel = clamp(
    /\b(debris|fragments?|chips?|dust|breakup)\b/i.test(combinedText)
      ? 0.72
      : effectType === "explosion"
        ? 0.54
        : 0.08,
    0,
    1,
  );
  const glowStrength = clamp(
    /\b(glow|bright|afterglow|white-yellow|acid-lime|electric|motion blur|ghost trail|afterimage)\b/i.test(combinedText)
      ? 0.84
      : effectType === "explosion" || effectType === "lightning"
        ? effectType === "lightning"
          ? 0.56
          : 0.66
        : 0.26,
    0,
    1,
  );
  const mentionedColors = detectMentionedColors(combinedText);
  const sceneSetting = inferSceneSetting(combinedText);
  const sceneDescriptors = inferSceneDescriptors(combinedText);
  const sceneProps = inferSceneProps(combinedText);
  const secondaryFigureEnabled = inferSecondaryFigureEnabled(combinedText);
  const stageBackgroundColor = inferStageBackgroundColor(combinedText);
  const airborneAction = /\b(jump|jumping|leap|leaping|airborne|flying|mid[- ]air|aerial)\b/i.test(combinedText);
  const roundKickStyle = /\b(round(?:house)?|spinning|spin kick|round kick)\b/i.test(combinedText);

  const defaultPlan: FramePlan = {
    subjectType,
    objectShape: inferObjectShape(combinedText),
    effectType,
    effectPhase,
    expression: inferExpression(combinedText),
    facialFeaturesEnabled: explicitFacialFeatures || subjectType === "round-character",
    action,
    motionProfile,
    motionBeat,
    facing,
    leftArm: "neutral",
    rightArm: "neutral",
    leftLeg: "neutral",
    rightLeg: "neutral",
    armLengthScale: inferArmLengthScale(combinedText),
    placementX: centerLock ? "center" : inferPlacementX(combinedText),
    placementY: inferPlacementY(combinedText),
    visibility: inferVisibility(combinedText),
    strokeColor: parseColor(combinedText),
    scale: inferScale(combinedText, workspaceContext),
    lean: inferLean(combinedText, action),
    hasStaff: /\b(bamboo|staff|rod|spear|lance|polearm)\b/i.test(combinedText),
    robotStyle: /\brobot\b/i.test(combinedText),
    zombieStyle: /\bzombie\b/i.test(combinedText),
    alienStyle: /\balien\b/i.test(combinedText),
    groundhogStyle: /\bgroundhog\b/i.test(combinedText),
    hornedStyle: /\b(horns?|devil|demon)\b/i.test(combinedText),
    wingedStyle: /\b(wings?|winged)\b/i.test(combinedText),
    capeStyle: /\b(cape|cloak|mantle)\b/i.test(combinedText),
    backgroundMode: BACKGROUND_PATTERN.test(combinedText),
    filledHeadColor: inferFilledHeadColor(combinedText, parseColor(combinedText)),
    objectFillColor: inferObjectFillColor(combinedText, parseColor(combinedText)),
    stageBackgroundColor,
    eyeColor: null,
    eyeScale: inferEyeScale(combinedText),
    hasSunglasses: /\bsunglasses|shades\b/i.test(combinedText),
    headTurnOffset: inferHeadTurnOffset(combinedText, facing),
    centerLock,
    preservePlacement: continuationFlags.preservePlacement,
    preserveScale: continuationFlags.preserveScale,
    hasExplicitColor: explicitColor,
    motionBeatExplicit,
    effectPhaseExplicit,
    denseInbetweens: INBETWEEN_REFINEMENT_PATTERN.test(combinedText),
    pixelStyle: PIXEL_STYLE_PATTERN.test(combinedText),
    arcadeStyle: ARCADE_STYLE_PATTERN.test(combinedText),
    hasExplosionOverlay:
      /\b(explosion|explode|blast|detonation|fireball)\b/i.test(combinedText) && subjectType !== "simple-object" && subjectType !== "effect",
    hasSmokeOverlay: /\b(smoke|dust|debris|mist)\b/i.test(combinedText) && subjectType !== "simple-object" && subjectType !== "effect",
    hasShockwaveOverlay: /\b(shockwave|dusty shockwave|dust ring|blast ring)\b/i.test(combinedText),
    backgroundOverlayShape:
      subjectType !== "simple-object" && subjectType !== "effect" && BACKGROUND_PATTERN.test(combinedText)
        ? inferBackgroundOverlayShape(combinedText)
        : null,
    backgroundScroll: /\b(scroll|scrolling|move the background|moving background|background move|camera moving|camera move|parallax)\b/i.test(combinedText),
    secondaryFigureEnabled,
    secondaryFigureColor: secondaryFigureEnabled && mentionedColors[1] ? parseColor(mentionedColors[1]) : null,
    sceneSetting,
    sceneDescriptors,
    sceneProps,
    coreIntensity,
    expansionStrength,
    spikeSharpness,
    breakupAmount,
    smokeDensity,
    debrisLevel,
    glowStrength,
    impactStrength,
    weightBias,
    speedBias,
    cartoonBias,
    smoothnessBias,
    airborneAction,
    roundKickStyle,
    supportLevel:
      workspaceContext?.currentFrameHasBitmap &&
      (INBETWEEN_REFINEMENT_PATTERN.test(combinedText) || /\b(cleaner|polish it|same animation but)\b/i.test(combinedText))
        ? "partial"
        : "full",
    frameCount: clampRequestedFrameCount(frameCount),
    variationSeed,
  };
  defaultPlan.eyeColor = inferEyeColor(combinedText, defaultPlan.filledHeadColor);
  if (defaultPlan.subjectType === "stick-figure" && !defaultPlan.robotStyle && !defaultPlan.facialFeaturesEnabled && defaultPlan.filledHeadColor == null) {
    defaultPlan.filledHeadColor = defaultPlan.strokeColor;
  }
  if (!defaultPlan.facialFeaturesEnabled) {
    defaultPlan.eyeColor = null;
  }

  if (defaultPlan.objectShape === "lightning" && defaultPlan.strokeColor === DEFAULT_STROKE_COLOR) {
    defaultPlan.strokeColor = "#e6f6ff";
  }
  if (defaultPlan.effectType === "lightning" && defaultPlan.strokeColor === DEFAULT_STROKE_COLOR) {
    defaultPlan.strokeColor = "#9ad8ff";
  }
  if (defaultPlan.effectType === "smoke" && defaultPlan.strokeColor === DEFAULT_STROKE_COLOR) {
    defaultPlan.strokeColor = "#59606a";
  }
  if (defaultPlan.effectType === "shockwave" && defaultPlan.strokeColor === DEFAULT_STROKE_COLOR) {
    defaultPlan.strokeColor = "#b58f6a";
  }
  if (defaultPlan.effectType === "explosion" && defaultPlan.strokeColor === DEFAULT_STROKE_COLOR) {
    defaultPlan.strokeColor = "#ff7a18";
  }
  if (defaultPlan.objectShape === "flame" && defaultPlan.strokeColor === DEFAULT_STROKE_COLOR) {
    defaultPlan.strokeColor = "#ff8d2a";
  }
  if (defaultPlan.objectShape === "rain" && defaultPlan.strokeColor === DEFAULT_STROKE_COLOR) {
    defaultPlan.strokeColor = "#6d88b8";
  }
  if (defaultPlan.objectShape === "slash-arc" && defaultPlan.strokeColor === DEFAULT_STROKE_COLOR) {
    defaultPlan.strokeColor = "#8fe8ff";
  }
  if (defaultPlan.objectShape === "smoke-cloud" && defaultPlan.strokeColor === DEFAULT_STROKE_COLOR) {
    defaultPlan.strokeColor = "#59606a";
  }
  if (defaultPlan.objectShape === "room-background" && defaultPlan.strokeColor === DEFAULT_STROKE_COLOR) {
    defaultPlan.strokeColor = "#171a22";
  }
  if (defaultPlan.objectShape === "plain-landscape" && defaultPlan.strokeColor === DEFAULT_STROKE_COLOR) {
    defaultPlan.strokeColor = "#6f8761";
  }
  if (defaultPlan.objectShape === "city-background" && defaultPlan.strokeColor === DEFAULT_STROKE_COLOR) {
    defaultPlan.strokeColor = "#20283c";
  }
  if (defaultPlan.objectShape === "concrete-cracks" && defaultPlan.strokeColor === DEFAULT_STROKE_COLOR) {
    defaultPlan.strokeColor = "#5d6671";
  }

  if (action === "run") {
    defaultPlan.leftArm = facing === "right" ? "back" : "forward";
    defaultPlan.rightArm = facing === "right" ? "forward" : "back";
    defaultPlan.leftLeg = facing === "right" ? "forward" : "back";
    defaultPlan.rightLeg = facing === "right" ? "back" : "forward";
  } else if (action === "breathe") {
    defaultPlan.leftArm = "neutral";
    defaultPlan.rightArm = "neutral";
    defaultPlan.leftLeg = "neutral";
    defaultPlan.rightLeg = "neutral";
  } else if (action === "jump") {
    defaultPlan.leftArm = "up";
    defaultPlan.rightArm = "up";
    defaultPlan.leftLeg = "back";
    defaultPlan.rightLeg = "back";
  } else if (action === "land") {
    defaultPlan.leftArm = "forward";
    defaultPlan.rightArm = "forward";
    defaultPlan.leftLeg = "down";
    defaultPlan.rightLeg = "down";
  } else if (action === "punch") {
    const frontIsRight = facing !== "left";
    defaultPlan.leftArm = frontIsRight ? "back" : "forward";
    defaultPlan.rightArm = frontIsRight ? "forward" : "back";
    defaultPlan.leftLeg = frontIsRight ? "back" : "forward";
    defaultPlan.rightLeg = frontIsRight ? "forward" : "back";
  } else if (action === "kick") {
    const frontIsRight = facing !== "left";
    defaultPlan.leftArm = "guard";
    defaultPlan.rightArm = "guard";
    defaultPlan.leftLeg = frontIsRight ? "back" : "forward";
    defaultPlan.rightLeg = frontIsRight ? "forward" : "back";
  } else if (action === "slam") {
    defaultPlan.leftArm = "up";
    defaultPlan.rightArm = "up";
    defaultPlan.leftLeg = "back";
    defaultPlan.rightLeg = "forward";
  } else if (action === "guard") {
    defaultPlan.leftArm = "guard";
    defaultPlan.rightArm = "guard";
    defaultPlan.leftLeg = facing === "left" ? "forward" : "back";
    defaultPlan.rightLeg = facing === "left" ? "back" : "forward";
  } else if (action === "staff-spin") {
    defaultPlan.leftArm = "forward";
    defaultPlan.rightArm = "up";
    defaultPlan.leftLeg = "neutral";
    defaultPlan.rightLeg = "neutral";
  } else if (action === "step") {
    defaultPlan.leftArm = "back";
    defaultPlan.rightArm = "forward";
    defaultPlan.leftLeg = "forward";
    defaultPlan.rightLeg = "back";
  } else if (action === "stumble") {
    defaultPlan.leftArm = "forward";
    defaultPlan.rightArm = "forward";
    defaultPlan.leftLeg = "forward";
    defaultPlan.rightLeg = "back";
  } else if (
    /\b(animation|animate|make (?:him|her|them) move|generate the animation|turn (?:this|the) (?:plan|story) into frames|make the frames now|continue the animation)\b/i.test(
      combinedText,
    ) &&
    defaultPlan.subjectType !== "simple-object" &&
    defaultPlan.subjectType !== "effect" &&
    defaultPlan.action === "stand"
  ) {
    defaultPlan.action = defaultPlan.zombieStyle ? "stumble" : "step";
    defaultPlan.leftArm = defaultPlan.zombieStyle ? "forward" : "back";
    defaultPlan.rightArm = "forward";
    defaultPlan.leftLeg = "forward";
    defaultPlan.rightLeg = "back";
  }

  const shouldLockNeutralStillPose =
    frameCount <= 1 &&
    defaultPlan.subjectType !== "effect" &&
    /\b(setup|single(?:\s+\w+){0,2}\s+frame|still|neutral|balanced|upright|finished setup|composition-first|no unnecessary animation)\b/i.test(
      combinedText,
    ) &&
    !/\b(run(?:ning)?|walk(?:ing)?|step(?:ping)?|jump(?:ing)?|mid[- ]air|punch|kick|slam|guard|fight(?:ing)?|attack|hit|explode|explosion|lightning|smoke|burst|fall(?:ing)?|bounce|roll(?:ing)?)\b/i.test(
      combinedText,
    );

  if (shouldLockNeutralStillPose) {
    defaultPlan.action = "stand";
    defaultPlan.motionProfile = "generic";
    defaultPlan.motionBeat = "generic";
    defaultPlan.leftArm = "neutral";
    defaultPlan.rightArm = "neutral";
    defaultPlan.leftLeg = "neutral";
    defaultPlan.rightLeg = "neutral";
    defaultPlan.lean = 0;
  }

  return {
    ...defaultPlan,
    ...overrides,
  };
};

const resolvePlacement = (
  width: number,
  height: number,
  plan: FramePlan,
  workspaceContext?: DrawingAiWorkspaceContext | null,
) => {
  const preservedBounds = plan.preservePlacement ? workspaceContext?.currentFrameBounds ?? null : null;

  if (preservedBounds) {
    return {
      x: preservedBounds.left + preservedBounds.width / 2,
      y: preservedBounds.top + preservedBounds.height / 2,
      scale: plan.scale,
    };
  }

  const xMap: Record<FramePlacementX, number> = {
    "off-left": width * -0.08,
    "left-entry": width * 0.1,
    left: width * 0.28,
    center: width * 0.5,
    right: width * 0.72,
    "right-entry": width * 0.9,
    "off-right": width * 1.08,
  };
  const yMap: Record<FramePlacementY, number> = {
    "off-top": height * -0.05,
    "top-entry": height * 0.09,
    upper: height * 0.34,
    center: height * 0.54,
    lower: height * 0.68,
    "bottom-entry": height * 0.88,
    "off-bottom": height * 1.08,
  };

  return {
    x: xMap[plan.placementX],
    y: yMap[plan.placementY],
    scale: plan.scale,
  };
};

const translate = (point: Vec2, offsetX: number, offsetY: number): Vec2 => ({
  x: point.x + offsetX,
  y: point.y + offsetY,
});

const applyPoseOffset = (pose: Pose, key: keyof Pose, x: number, y: number) => {
  pose[key] = translate(pose[key], x, y);
};

const applyLimbState = (
  pose: Pose,
  side: "left" | "right",
  state: LimbState,
  facing: FrameFacing,
  armLengthScale: number,
) => {
  const elbowKey = side === "left" ? "leftElbow" : "rightElbow";
  const handKey = side === "left" ? "leftHand" : "rightHand";
  const kneeKey = side === "left" ? "leftKnee" : "rightKnee";
  const footKey = side === "left" ? "leftFoot" : "rightFoot";
  const direction = side === "left" ? -1 : 1;
  const facingDirection = facing === "left" ? -1 : 1;

  if (state === "up") {
    pose[elbowKey] = translate(pose.neck, direction * 18 * armLengthScale, -44 * armLengthScale);
    pose[handKey] = translate(pose.neck, direction * 10 * armLengthScale, -88 * armLengthScale);
    return;
  }

  if (state === "forward") {
    pose[elbowKey] = translate(pose.neck, facingDirection * 28 * armLengthScale, -12);
    pose[handKey] = translate(pose.neck, facingDirection * 68 * armLengthScale, -6);
    return;
  }

  if (state === "back") {
    pose[elbowKey] = translate(pose.neck, -facingDirection * 18 * armLengthScale, -18);
    pose[handKey] = translate(pose.neck, -facingDirection * 52 * armLengthScale, -6);
    return;
  }

  if (state === "guard") {
    pose[elbowKey] = translate(pose.neck, direction * 22 * armLengthScale, -18);
    pose[handKey] = translate(pose.neck, direction * 36 * armLengthScale, -44 * armLengthScale);
    return;
  }

  if (state === "down") {
    pose[elbowKey] = translate(pose.neck, direction * 12 * armLengthScale, 16);
    pose[handKey] = translate(pose.neck, direction * 14 * armLengthScale, 62 * armLengthScale);
    pose[kneeKey] = translate(pose.hip, direction * 18, 38);
    pose[footKey] = translate(pose.hip, direction * 24, 88);
    return;
  }

  if (state === "neutral") {
    return;
  }

  if (state === "back") {
    return;
  }
};

const applyLegState = (
  pose: Pose,
  side: "left" | "right",
  state: LimbState,
  facing: FrameFacing,
) => {
  const kneeKey = side === "left" ? "leftKnee" : "rightKnee";
  const footKey = side === "left" ? "leftFoot" : "rightFoot";
  const direction = facing === "left" ? -1 : 1;

  if (state === "forward") {
    pose[kneeKey] = translate(pose.hip, direction * 20, 34);
    pose[footKey] = translate(pose.hip, direction * 54, 78);
    return;
  }

  if (state === "back") {
    pose[kneeKey] = translate(pose.hip, -direction * 10, 30);
    pose[footKey] = translate(pose.hip, -direction * 32, 84);
    return;
  }

  if (state === "down") {
    pose[kneeKey] = translate(pose.hip, side === "left" ? -8 : 8, 46);
    pose[footKey] = translate(pose.hip, side === "left" ? -14 : 14, 86);
  }
};

const scalePose = (pose: Pose, centerX: number, centerY: number, scale: number): Pose => {
  const out = { ...pose } as Pose;
  (Object.keys(pose) as Array<keyof Pose>).forEach((key) => {
    const point = pose[key];
    out[key] = {
      x: centerX + (point.x - centerX) * scale,
      y: centerY + (point.y - centerY) * scale,
    };
  });
  return out;
};

const createBounds = (left: number, top: number, right: number, bottom: number): DrawingAiWorkspaceBitmapBounds => ({
  left,
  top,
  width: Math.max(1, right - left),
  height: Math.max(1, bottom - top),
});

const getBoundsRight = (bounds: DrawingAiWorkspaceBitmapBounds) => bounds.left + bounds.width;
const getBoundsBottom = (bounds: DrawingAiWorkspaceBitmapBounds) => bounds.top + bounds.height;

const clampBoundsToCanvas = (
  bounds: DrawingAiWorkspaceBitmapBounds,
  width: number,
  height: number,
): DrawingAiWorkspaceBitmapBounds => {
  const left = clamp(bounds.left, 0, width - 1);
  const top = clamp(bounds.top, 0, height - 1);
  const right = clamp(getBoundsRight(bounds), left + 1, width);
  const bottom = clamp(getBoundsBottom(bounds), top + 1, height);
  return createBounds(left, top, right, bottom);
};

const buildPoseBounds = (
  pose: Pose,
  headRadius: number,
  padding: number,
): DrawingAiWorkspaceBitmapBounds => {
  const points = Object.values(pose);
  const minX = Math.min(...points.map((point) => point.x), pose.head.x - headRadius) - padding;
  const maxX = Math.max(...points.map((point) => point.x), pose.head.x + headRadius) + padding;
  const minY = Math.min(...points.map((point) => point.y), pose.head.y - headRadius) - padding;
  const maxY = Math.max(...points.map((point) => point.y), pose.leftFoot.y, pose.rightFoot.y) + padding;
  return createBounds(minX, minY, maxX, maxY);
};

const estimateStickFigureStrokeCount = (plan: FramePlan) =>
  10 + (plan.expression === "neutral" ? 1 : 3) + (plan.hasStaff ? 1 : 0) + (plan.robotStyle ? 1 : 0);

const estimateRoundCharacterStrokeCount = (plan: FramePlan) =>
  6 + (plan.expression === "neutral" ? 1 : 3) + (plan.groundhogStyle ? 1 : 0);

const estimateObjectStrokeCount = (plan: FramePlan) => {
  if (plan.action === "explode") {
    return 12;
  }
  if (plan.objectShape === "lightning") {
    return 7;
  }
  if (plan.objectShape === "smoke-cloud") {
    return 7;
  }
  if (plan.objectShape === "flame") {
    return 6;
  }
  if (plan.objectShape === "rain") {
    return 8;
  }
  if (plan.objectShape === "slash-arc") {
    return 6;
  }
  if (plan.objectShape === "hallway-background") {
    return 8;
  }
  if (plan.objectShape === "room-background") {
    return 9;
  }
  if (plan.objectShape === "plain-landscape") {
    return 8;
  }
  if (plan.objectShape === "city-background") {
    return 12;
  }
  if (plan.objectShape === "concrete-cracks") {
    return 10;
  }
  if (plan.objectShape === "cloud" || plan.objectShape === "mountain") {
    return 4;
  }
  return 3;
};

const estimateObjectCount = (plan: FramePlan) => (plan.action === "explode" ? 2 : 1);

const estimateEffectStrokeCount = (plan: FramePlan) => {
  if (plan.effectType === "explosion") {
    return 26;
  }
  if (plan.effectType === "lightning") {
    return 14;
  }
  if (plan.effectType === "smoke") {
    return 16;
  }
  if (plan.effectType === "shockwave") {
    return 10;
  }
  return 8;
};

const estimateEffectCount = (plan: FramePlan) => {
  if (plan.effectType === "explosion") {
    return 5;
  }
  if (plan.effectType === "smoke") {
    return 4;
  }
  return 2;
};

const isOversizedSubjectBounds = (
  bounds: DrawingAiWorkspaceBitmapBounds,
  width: number,
  height: number,
  {
    allowLarge = false,
    widthRatio = MAX_NON_BACKGROUND_WIDTH_RATIO,
    heightRatio = MAX_NON_BACKGROUND_HEIGHT_RATIO,
    areaRatio = MAX_NON_BACKGROUND_AREA_RATIO,
  }: {
    allowLarge?: boolean;
    widthRatio?: number;
    heightRatio?: number;
    areaRatio?: number;
  } = {},
) => {
  if (allowLarge) {
    return false;
  }

  return (
    bounds.width > width * widthRatio ||
    bounds.height > height * heightRatio ||
    bounds.width * bounds.height > width * height * areaRatio
  );
};

const setPosePoint = (pose: Pose, key: keyof Pose, x: number, y: number) => {
  pose[key] = { x, y };
};

const getFacingDirection = (facing: FrameFacing) => (facing === "left" ? -1 : 1);

const applyWalkLikeBeatPose = (
  pose: Pose,
  plan: FramePlan,
  beat: FrameMotionBeat,
) => {
  const direction = getFacingDirection(plan.facing);
  const isRun = plan.motionProfile === "run-cycle";
  const speedBoost = 1 + Math.max(0, plan.speedBias - 1) * 0.34;
  const smoothBoost = 1 + Math.max(0, plan.smoothnessBias - 1) * 0.18;
  const weightBoost = 1 + Math.max(0, plan.weightBias - 1) * 0.24;
  const stride = (isRun ? 66 : 54) * speedBoost;
  const reach = (isRun ? 28 : 20) * speedBoost;
  const trail = (isRun ? 24 : 16) * smoothBoost;
  const armReach = (isRun ? 70 : 58) * speedBoost;
  const armLift = (isRun ? 22 : 14) * (0.94 + Math.max(0, plan.weightBias - 1) * 0.2);
  const passingLift = (isRun ? 20 : 14) * (1 + Math.max(0, plan.smoothnessBias - 1) * 0.22);
  const bodyDrop = Math.max(0, plan.weightBias - 1) * 8;

  if (beat === "walk-passing" || beat === "run-passing") {
    setPosePoint(pose, "neck", pose.neck.x + direction * (isRun ? 10 : 6) * speedBoost, pose.neck.y - (isRun ? 6 : 2) * smoothBoost + bodyDrop * 0.15);
    setPosePoint(pose, "hip", pose.hip.x + direction * (isRun ? 6 : 3) * speedBoost, pose.hip.y - (isRun ? 4 : 2) * smoothBoost + bodyDrop * 0.2);
    setPosePoint(pose, "leftElbow", pose.neck.x - direction * 16, pose.neck.y - armLift);
    setPosePoint(pose, "leftHand", pose.neck.x - direction * 34, pose.neck.y + 8);
    setPosePoint(pose, "rightElbow", pose.neck.x + direction * 20, pose.neck.y - 4);
    setPosePoint(pose, "rightHand", pose.neck.x + direction * 44, pose.neck.y - armLift);
    setPosePoint(pose, "leftKnee", pose.hip.x - direction * 6, pose.hip.y + 34);
    setPosePoint(pose, "leftFoot", pose.hip.x - direction * 24, pose.hip.y + 84);
    setPosePoint(pose, "rightKnee", pose.hip.x + direction * reach, pose.hip.y + 18);
    setPosePoint(pose, "rightFoot", pose.hip.x + direction * 12, pose.hip.y + 74 - passingLift);
    return;
  }

  const leadRight =
    beat === "walk-right-contact" || beat === "run-right-contact" || beat === "jump-rise";
  const leadLeg: "left" | "right" = leadRight ? "right" : "left";
  const trailLeg: "left" | "right" = leadRight ? "left" : "right";
  const leadArm: "left" | "right" = leadRight ? "left" : "right";
  const trailArm: "left" | "right" = leadRight ? "right" : "left";
  const leadKneeKey = leadLeg === "left" ? "leftKnee" : "rightKnee";
  const leadFootKey = leadLeg === "left" ? "leftFoot" : "rightFoot";
  const trailKneeKey = trailLeg === "left" ? "leftKnee" : "rightKnee";
  const trailFootKey = trailLeg === "left" ? "leftFoot" : "rightFoot";
  const leadElbowKey = leadArm === "left" ? "leftElbow" : "rightElbow";
  const leadHandKey = leadArm === "left" ? "leftHand" : "rightHand";
  const trailElbowKey = trailArm === "left" ? "leftElbow" : "rightElbow";
  const trailHandKey = trailArm === "left" ? "leftHand" : "rightHand";

  setPosePoint(pose, leadKneeKey, pose.hip.x + direction * reach, pose.hip.y + 28);
  setPosePoint(pose, leadFootKey, pose.hip.x + direction * stride, pose.hip.y + 84);
  setPosePoint(pose, trailKneeKey, pose.hip.x - direction * trail, pose.hip.y + 36);
  setPosePoint(pose, trailFootKey, pose.hip.x - direction * (stride * 0.55), pose.hip.y + 88);
  setPosePoint(pose, leadElbowKey, pose.neck.x + direction * 16, pose.neck.y - 4);
  setPosePoint(pose, leadHandKey, pose.neck.x + direction * armReach, pose.neck.y - armLift);
  setPosePoint(pose, trailElbowKey, pose.neck.x - direction * 16, pose.neck.y - 16);
  setPosePoint(pose, trailHandKey, pose.neck.x - direction * (armReach * 0.72), pose.neck.y + 10);
  if (bodyDrop > 0) {
    setPosePoint(pose, "hip", pose.hip.x, pose.hip.y + bodyDrop);
    setPosePoint(pose, "neck", pose.neck.x, pose.neck.y + bodyDrop * 0.45);
  }
};

const applyPunchBeatPose = (pose: Pose, plan: FramePlan, beat: FrameMotionBeat) => {
  const direction = getFacingDirection(plan.facing);
  const strikingRight = direction === 1;
  const strikeElbowKey = strikingRight ? "rightElbow" : "leftElbow";
  const strikeHandKey = strikingRight ? "rightHand" : "leftHand";
  const guardElbowKey = strikingRight ? "leftElbow" : "rightElbow";
  const guardHandKey = strikingRight ? "leftHand" : "rightHand";
  const impactBoost = 1 + Math.max(0, plan.impactStrength - 1) * 0.42;
  const anticipationBias = 1 + seededSignedForPlan(plan, 20.3) * 0.14;
  const guardLift = seededSignedForPlan(plan, 21.1) * 6;
  const stanceWidthBias = seededSignedForPlan(plan, 21.9) * 10;
  const strikeArcLift = seededSignedForPlan(plan, 22.7) * 8;

  if (beat === "punch-windup") {
    setPosePoint(pose, "neck", pose.neck.x - direction * 8, pose.neck.y + 2);
    setPosePoint(pose, "hip", pose.hip.x - direction * 10, pose.hip.y + 6);
    setPosePoint(pose, strikeElbowKey, pose.neck.x - direction * 24 * impactBoost * anticipationBias, pose.neck.y - 18 - Math.max(0, plan.impactStrength - 1) * 8 + strikeArcLift * 0.5);
    setPosePoint(pose, strikeHandKey, pose.neck.x - direction * 54 * impactBoost * anticipationBias, pose.neck.y - 8 + strikeArcLift);
    setPosePoint(pose, guardElbowKey, pose.neck.x + direction * (18 + stanceWidthBias * 0.12), pose.neck.y - 12 - guardLift * 0.45);
    setPosePoint(pose, guardHandKey, pose.neck.x + direction * (28 + stanceWidthBias * 0.18), pose.neck.y - 36 - guardLift);
    setPosePoint(pose, "leftKnee", pose.hip.x - direction * (20 + stanceWidthBias * 0.3), pose.hip.y + 40);
    setPosePoint(pose, "leftFoot", pose.hip.x - direction * (34 + stanceWidthBias * 0.5), pose.hip.y + 92);
    setPosePoint(pose, "rightKnee", pose.hip.x + direction * (18 + stanceWidthBias * 0.2), pose.hip.y + 32);
    setPosePoint(pose, "rightFoot", pose.hip.x + direction * (42 + stanceWidthBias * 0.35), pose.hip.y + 88);
    return;
  }

  if (beat === "punch-follow-through") {
    setPosePoint(pose, "neck", pose.neck.x + direction * 12, pose.neck.y - 2);
    setPosePoint(pose, "hip", pose.hip.x + direction * 14, pose.hip.y + 4);
    setPosePoint(pose, strikeElbowKey, pose.neck.x + direction * 28 * impactBoost, pose.neck.y - 6);
    setPosePoint(pose, strikeHandKey, pose.neck.x + direction * 68 * impactBoost, pose.neck.y + 4);
    setPosePoint(pose, guardElbowKey, pose.neck.x - direction * 8, pose.neck.y - 8);
    setPosePoint(pose, guardHandKey, pose.neck.x - direction * 20, pose.neck.y - 24);
    setPosePoint(pose, "leftKnee", pose.hip.x - direction * 8, pose.hip.y + 34);
    setPosePoint(pose, "rightKnee", pose.hip.x + direction * 22, pose.hip.y + 32);
    return;
  }

  if (beat === "punch-impact") {
    setPosePoint(pose, "neck", pose.neck.x + direction * 14, pose.neck.y - 4);
    setPosePoint(pose, "hip", pose.hip.x + direction * 16, pose.hip.y + 4);
    setPosePoint(pose, strikeElbowKey, pose.neck.x + direction * 38 * impactBoost, pose.neck.y - 14 - Math.max(0, plan.impactStrength - 1) * 6 - strikeArcLift * 0.45);
    setPosePoint(pose, strikeHandKey, pose.neck.x + direction * 82 * impactBoost * (0.94 + anticipationBias * 0.08), pose.neck.y - 10 - strikeArcLift);
    setPosePoint(pose, guardElbowKey, pose.neck.x - direction * 12, pose.neck.y - 12 - guardLift * 0.35);
    setPosePoint(pose, guardHandKey, pose.neck.x - direction * 24, pose.neck.y - 30 - guardLift * 0.75);
    setPosePoint(pose, "leftKnee", pose.hip.x - direction * (12 + stanceWidthBias * 0.18), pose.hip.y + 36);
    setPosePoint(pose, "leftFoot", pose.hip.x - direction * (26 + stanceWidthBias * 0.32), pose.hip.y + 90);
    setPosePoint(pose, "rightKnee", pose.hip.x + direction * (26 + stanceWidthBias * 0.24), pose.hip.y + 30);
    setPosePoint(pose, "rightFoot", pose.hip.x + direction * (48 + stanceWidthBias * 0.42), pose.hip.y + 86);
    return;
  }

  if (beat === "punch-recovery") {
    setPosePoint(pose, "neck", pose.neck.x + direction * 4, pose.neck.y);
    setPosePoint(pose, "hip", pose.hip.x + direction * 2, pose.hip.y + 2);
    setPosePoint(pose, strikeElbowKey, pose.neck.x + direction * 10 * impactBoost, pose.neck.y - 10);
    setPosePoint(pose, strikeHandKey, pose.neck.x + direction * 26 * impactBoost, pose.neck.y - 28);
    setPosePoint(pose, guardElbowKey, pose.neck.x - direction * 10, pose.neck.y - 10);
    setPosePoint(pose, guardHandKey, pose.neck.x - direction * 26, pose.neck.y - 30);
    setPosePoint(pose, "leftKnee", pose.hip.x - 12, pose.hip.y + 40);
    setPosePoint(pose, "rightKnee", pose.hip.x + 12, pose.hip.y + 40);
    return;
  }

  setPosePoint(pose, "neck", pose.neck.x + direction * 8, pose.neck.y - 2);
  setPosePoint(pose, "hip", pose.hip.x + direction * 10, pose.hip.y + 2);
  setPosePoint(pose, strikeElbowKey, pose.neck.x + direction * 30 * impactBoost, pose.neck.y - 12 - Math.max(0, plan.impactStrength - 1) * 4);
  setPosePoint(pose, strikeHandKey, pose.neck.x + direction * 70 * impactBoost, pose.neck.y - 8);
  setPosePoint(pose, guardElbowKey, pose.neck.x - direction * 12, pose.neck.y - 10);
  setPosePoint(pose, guardHandKey, pose.neck.x - direction * 22, pose.neck.y - 28);
};

const applyJumpBeatPose = (pose: Pose, plan: FramePlan, beat: FrameMotionBeat) => {
  const direction = getFacingDirection(plan.facing);
  const stretchBoost = 1 + Math.max(0, plan.smoothnessBias - 1) * 0.18;

  if (beat === "jump-crouch") {
    setPosePoint(pose, "neck", pose.neck.x, pose.neck.y + 14);
    setPosePoint(pose, "hip", pose.hip.x, pose.hip.y + 22);
    setPosePoint(pose, "leftElbow", pose.neck.x - 24, pose.neck.y + 4);
    setPosePoint(pose, "leftHand", pose.neck.x - 44, pose.neck.y + 24);
    setPosePoint(pose, "rightElbow", pose.neck.x + 24, pose.neck.y + 4);
    setPosePoint(pose, "rightHand", pose.neck.x + 44, pose.neck.y + 24);
    setPosePoint(pose, "leftKnee", pose.hip.x - 22, pose.hip.y + 30);
    setPosePoint(pose, "leftFoot", pose.hip.x - 34, pose.hip.y + 64);
    setPosePoint(pose, "rightKnee", pose.hip.x + 22, pose.hip.y + 30);
    setPosePoint(pose, "rightFoot", pose.hip.x + 34, pose.hip.y + 64);
    return;
  }

  if (beat === "jump-rise") {
    setPosePoint(pose, "neck", pose.neck.x + direction * 4, pose.neck.y - 10 * stretchBoost);
    setPosePoint(pose, "hip", pose.hip.x + direction * 2, pose.hip.y - 8 * stretchBoost);
    setPosePoint(pose, "leftElbow", pose.neck.x - 18, pose.neck.y - 30);
    setPosePoint(pose, "leftHand", pose.neck.x - 10, pose.neck.y - 74);
    setPosePoint(pose, "rightElbow", pose.neck.x + 18, pose.neck.y - 30);
    setPosePoint(pose, "rightHand", pose.neck.x + 10, pose.neck.y - 74);
    setPosePoint(pose, "leftKnee", pose.hip.x - 18, pose.hip.y + 38);
    setPosePoint(pose, "leftFoot", pose.hip.x - 28, pose.hip.y + 82);
    setPosePoint(pose, "rightKnee", pose.hip.x + 12, pose.hip.y + 18);
    setPosePoint(pose, "rightFoot", pose.hip.x + 34, pose.hip.y + 56);
    return;
  }

  if (beat === "jump-peak") {
    setPosePoint(pose, "neck", pose.neck.x, pose.neck.y - 14);
    setPosePoint(pose, "hip", pose.hip.x, pose.hip.y - 12);
    setPosePoint(pose, "leftElbow", pose.neck.x - 18, pose.neck.y - 28);
    setPosePoint(pose, "leftHand", pose.neck.x - 6, pose.neck.y - 64);
    setPosePoint(pose, "rightElbow", pose.neck.x + 18, pose.neck.y - 28);
    setPosePoint(pose, "rightHand", pose.neck.x + 6, pose.neck.y - 64);
    setPosePoint(pose, "leftKnee", pose.hip.x - 18, pose.hip.y + 16);
    setPosePoint(pose, "leftFoot", pose.hip.x - 32, pose.hip.y + 46);
    setPosePoint(pose, "rightKnee", pose.hip.x + 18, pose.hip.y + 16);
    setPosePoint(pose, "rightFoot", pose.hip.x + 32, pose.hip.y + 46);
    return;
  }

  if (beat === "jump-recovery") {
    setPosePoint(pose, "leftElbow", pose.neck.x - 18, pose.neck.y - 8);
    setPosePoint(pose, "leftHand", pose.neck.x - 34, pose.neck.y + 22);
    setPosePoint(pose, "rightElbow", pose.neck.x + 18, pose.neck.y - 8);
    setPosePoint(pose, "rightHand", pose.neck.x + 34, pose.neck.y + 22);
    setPosePoint(pose, "leftKnee", pose.hip.x - 14, pose.hip.y + 38);
    setPosePoint(pose, "leftFoot", pose.hip.x - 24, pose.hip.y + 82);
    setPosePoint(pose, "rightKnee", pose.hip.x + 14, pose.hip.y + 38);
    setPosePoint(pose, "rightFoot", pose.hip.x + 24, pose.hip.y + 82);
    return;
  }

  if (beat === "jump-land") {
    setPosePoint(pose, "neck", pose.neck.x + direction * 2, pose.neck.y + 10);
    setPosePoint(pose, "hip", pose.hip.x, pose.hip.y + 18);
    setPosePoint(pose, "leftElbow", pose.neck.x - 20, pose.neck.y - 2);
    setPosePoint(pose, "leftHand", pose.neck.x - 34, pose.neck.y + 20);
    setPosePoint(pose, "rightElbow", pose.neck.x + 20, pose.neck.y - 2);
    setPosePoint(pose, "rightHand", pose.neck.x + 34, pose.neck.y + 20);
    setPosePoint(pose, "leftKnee", pose.hip.x - 18, pose.hip.y + 28);
    setPosePoint(pose, "leftFoot", pose.hip.x - 26, pose.hip.y + 72);
    setPosePoint(pose, "rightKnee", pose.hip.x + 18, pose.hip.y + 28);
    setPosePoint(pose, "rightFoot", pose.hip.x + 26, pose.hip.y + 72);
    return;
  }

  setPosePoint(pose, "neck", pose.neck.x + direction * 2, pose.neck.y + 6);
  setPosePoint(pose, "hip", pose.hip.x, pose.hip.y + 12);
  setPosePoint(pose, "leftElbow", pose.neck.x - 26, pose.neck.y - 2);
  setPosePoint(pose, "leftHand", pose.neck.x - 40, pose.neck.y + 18);
  setPosePoint(pose, "rightElbow", pose.neck.x + 26, pose.neck.y - 2);
  setPosePoint(pose, "rightHand", pose.neck.x + 40, pose.neck.y + 18);
  setPosePoint(pose, "leftKnee", pose.hip.x - 22, pose.hip.y + 30);
  setPosePoint(pose, "leftFoot", pose.hip.x - 34, pose.hip.y + 72);
  setPosePoint(pose, "rightKnee", pose.hip.x + 22, pose.hip.y + 30);
  setPosePoint(pose, "rightFoot", pose.hip.x + 34, pose.hip.y + 72);
};

const applyBreathingBeatPose = (pose: Pose, plan: FramePlan, beat: FrameMotionBeat) => {
  const strainLift = 1 + Math.max(0, plan.weightBias - 1) * 0.12 + Math.max(0, plan.smoothnessBias - 1) * 0.08;

  if (beat === "breath-in") {
    setPosePoint(pose, "neck", pose.neck.x, pose.neck.y - 4 * strainLift);
    setPosePoint(pose, "hip", pose.hip.x, pose.hip.y - 2);
    setPosePoint(pose, "leftElbow", pose.neck.x - 22, pose.neck.y - 4);
    setPosePoint(pose, "leftHand", pose.neck.x - 32, pose.neck.y + 24);
    setPosePoint(pose, "rightElbow", pose.neck.x + 22, pose.neck.y - 4);
    setPosePoint(pose, "rightHand", pose.neck.x + 32, pose.neck.y + 24);
    return;
  }

  if (beat === "breath-peak") {
    setPosePoint(pose, "head", pose.head.x, pose.head.y - 4);
    setPosePoint(pose, "neck", pose.neck.x, pose.neck.y - 8);
    setPosePoint(pose, "hip", pose.hip.x, pose.hip.y - 4);
    setPosePoint(pose, "leftElbow", pose.neck.x - 26, pose.neck.y - 10);
    setPosePoint(pose, "leftHand", pose.neck.x - 36, pose.neck.y + 16);
    setPosePoint(pose, "rightElbow", pose.neck.x + 26, pose.neck.y - 10);
    setPosePoint(pose, "rightHand", pose.neck.x + 36, pose.neck.y + 16);
    return;
  }

  if (beat === "breath-out") {
    setPosePoint(pose, "head", pose.head.x, pose.head.y + 4);
    setPosePoint(pose, "neck", pose.neck.x, pose.neck.y + 8);
    setPosePoint(pose, "hip", pose.hip.x, pose.hip.y + 10);
    setPosePoint(pose, "leftElbow", pose.neck.x - 18, pose.neck.y + 6);
    setPosePoint(pose, "leftHand", pose.neck.x - 28, pose.neck.y + 30);
    setPosePoint(pose, "rightElbow", pose.neck.x + 18, pose.neck.y + 6);
    setPosePoint(pose, "rightHand", pose.neck.x + 28, pose.neck.y + 30);
    return;
  }

  setPosePoint(pose, "neck", pose.neck.x, pose.neck.y + 2);
  setPosePoint(pose, "hip", pose.hip.x, pose.hip.y + 4);
  setPosePoint(pose, "leftElbow", pose.neck.x - 20, pose.neck.y);
  setPosePoint(pose, "leftHand", pose.neck.x - 30, pose.neck.y + 24);
  setPosePoint(pose, "rightElbow", pose.neck.x + 20, pose.neck.y);
  setPosePoint(pose, "rightHand", pose.neck.x + 30, pose.neck.y + 24);
};

const applyKickBeatPose = (pose: Pose, plan: FramePlan, beat: FrameMotionBeat) => {
  const direction = getFacingDirection(plan.facing);
  const kickingRight = direction === 1;
  const kickKneeKey = kickingRight ? "rightKnee" : "leftKnee";
  const kickFootKey = kickingRight ? "rightFoot" : "leftFoot";
  const supportKneeKey = kickingRight ? "leftKnee" : "rightKnee";
  const supportFootKey = kickingRight ? "leftFoot" : "rightFoot";
  const guardLeadElbowKey = kickingRight ? "leftElbow" : "rightElbow";
  const guardLeadHandKey = kickingRight ? "leftHand" : "rightHand";
  const rearElbowKey = kickingRight ? "rightElbow" : "leftElbow";
  const rearHandKey = kickingRight ? "rightHand" : "leftHand";
  const airborneLift = plan.airborneAction ? 16 : 0;
  const chamberBias = seededSignedForPlan(plan, 23.9) * 8;
  const supportWidthBias = seededSignedForPlan(plan, 24.7) * 10;
  const kickReachBias = 1 + seededSignedForPlan(plan, 25.5) * 0.12;
  const guardBias = seededSignedForPlan(plan, 26.3) * 6;

  if (beat === "kick-windup") {
    setPosePoint(pose, "neck", pose.neck.x - direction * 8, pose.neck.y + 4);
    setPosePoint(pose, "hip", pose.hip.x - direction * 10, pose.hip.y + 8);
    setPosePoint(pose, guardLeadElbowKey, pose.neck.x - direction * 10, pose.neck.y - 10 - guardBias * 0.3);
    setPosePoint(pose, guardLeadHandKey, pose.neck.x - direction * 18, pose.neck.y - 34 - guardBias);
    setPosePoint(pose, rearElbowKey, pose.neck.x + direction * 12, pose.neck.y - 4 - guardBias * 0.2);
    setPosePoint(pose, rearHandKey, pose.neck.x + direction * 28, pose.neck.y - 28 - guardBias * 0.6);
    setPosePoint(pose, supportKneeKey, pose.hip.x - direction * (10 + supportWidthBias * 0.18), pose.hip.y + 34);
    setPosePoint(pose, supportFootKey, pose.hip.x - direction * (18 + supportWidthBias * 0.32), pose.hip.y + 84);
    setPosePoint(pose, kickKneeKey, pose.hip.x + direction * (18 + supportWidthBias * 0.18), pose.hip.y + 26 - airborneLift * 0.5 - chamberBias * 0.35);
    setPosePoint(pose, kickFootKey, pose.hip.x + direction * (42 * kickReachBias), pose.hip.y + 58 - airborneLift - chamberBias * 0.18);
    return;
  }

  if (beat === "kick-chamber") {
    setPosePoint(pose, "neck", pose.neck.x + direction * 2, pose.neck.y - 4 - airborneLift * 0.2);
    setPosePoint(pose, "hip", pose.hip.x + direction * 4, pose.hip.y - airborneLift * 0.4);
    setPosePoint(pose, guardLeadElbowKey, pose.neck.x - direction * 8, pose.neck.y - 8);
    setPosePoint(pose, guardLeadHandKey, pose.neck.x - direction * 18, pose.neck.y - 34);
    setPosePoint(pose, rearElbowKey, pose.neck.x + direction * 16, pose.neck.y - 18);
    setPosePoint(pose, rearHandKey, pose.neck.x + direction * 28, pose.neck.y - 44);
    setPosePoint(pose, supportKneeKey, pose.hip.x - direction * 4, pose.hip.y + 30);
    setPosePoint(pose, supportFootKey, pose.hip.x - direction * 10, pose.hip.y + 80);
    setPosePoint(pose, kickKneeKey, pose.hip.x + direction * 30, pose.hip.y + 6 - airborneLift);
    setPosePoint(pose, kickFootKey, pose.hip.x + direction * 24, pose.hip.y + 34 - airborneLift * 1.25);
    return;
  }

  if (beat === "kick-recovery") {
    setPosePoint(pose, "neck", pose.neck.x + direction * 4, pose.neck.y);
    setPosePoint(pose, "hip", pose.hip.x + direction * 2, pose.hip.y + 4);
    setPosePoint(pose, guardLeadElbowKey, pose.neck.x - direction * 14, pose.neck.y - 10);
    setPosePoint(pose, guardLeadHandKey, pose.neck.x - direction * 24, pose.neck.y - 30);
    setPosePoint(pose, rearElbowKey, pose.neck.x + direction * 12, pose.neck.y - 10);
    setPosePoint(pose, rearHandKey, pose.neck.x + direction * 24, pose.neck.y - 28);
    setPosePoint(pose, supportKneeKey, pose.hip.x - 12, pose.hip.y + 36);
    setPosePoint(pose, supportFootKey, pose.hip.x - 20, pose.hip.y + 84);
    setPosePoint(pose, kickKneeKey, pose.hip.x + direction * 10, pose.hip.y + 28);
    setPosePoint(pose, kickFootKey, pose.hip.x + direction * 28, pose.hip.y + 76);
    return;
  }

  if (beat === "kick-contact") {
    const swingHeight = plan.roundKickStyle ? 20 : 10;
    setPosePoint(pose, "neck", pose.neck.x + direction * 14, pose.neck.y - 6 - airborneLift * 0.22);
    setPosePoint(pose, "hip", pose.hip.x + direction * 16, pose.hip.y - airborneLift * 0.34);
    setPosePoint(pose, guardLeadElbowKey, pose.neck.x - direction * 8, pose.neck.y - 10 - guardBias * 0.25);
    setPosePoint(pose, guardLeadHandKey, pose.neck.x - direction * 18, pose.neck.y - 30 - guardBias * 0.8);
    setPosePoint(pose, rearElbowKey, pose.neck.x + direction * 18, pose.neck.y - 18 - guardBias * 0.3);
    setPosePoint(pose, rearHandKey, pose.neck.x + direction * 36, pose.neck.y - 40 - guardBias * 0.65);
    setPosePoint(pose, supportKneeKey, pose.hip.x - direction * (2 + supportWidthBias * 0.12), pose.hip.y + 32);
    setPosePoint(pose, supportFootKey, pose.hip.x - direction * (6 + supportWidthBias * 0.22), pose.hip.y + 84);
    setPosePoint(pose, kickKneeKey, pose.hip.x + direction * (30 + supportWidthBias * 0.1), pose.hip.y + 6 - airborneLift * 0.6 - chamberBias * 0.2);
    setPosePoint(pose, kickFootKey, pose.hip.x + direction * (plan.roundKickStyle ? 94 : 82) * kickReachBias, pose.hip.y - swingHeight - airborneLift - chamberBias * 0.15);
    return;
  }

  const swingHeight = plan.roundKickStyle ? 18 : 8;
  setPosePoint(pose, "neck", pose.neck.x + direction * 12, pose.neck.y - 4 - airborneLift * 0.2);
  setPosePoint(pose, "hip", pose.hip.x + direction * 14, pose.hip.y - airborneLift * 0.3);
  setPosePoint(pose, guardLeadElbowKey, pose.neck.x - direction * 8, pose.neck.y - 10);
  setPosePoint(pose, guardLeadHandKey, pose.neck.x - direction * 18, pose.neck.y - 28);
  setPosePoint(pose, rearElbowKey, pose.neck.x + direction * 18, pose.neck.y - 18);
  setPosePoint(pose, rearHandKey, pose.neck.x + direction * 34, pose.neck.y - 38);
  setPosePoint(pose, supportKneeKey, pose.hip.x - direction * 4, pose.hip.y + 34);
  setPosePoint(pose, supportFootKey, pose.hip.x - direction * 8, pose.hip.y + 86);
  setPosePoint(pose, kickKneeKey, pose.hip.x + direction * 28, pose.hip.y + 8 - airborneLift * 0.6);
  setPosePoint(pose, kickFootKey, pose.hip.x + direction * (plan.roundKickStyle ? 88 : 78), pose.hip.y - swingHeight - airborneLift);
};

const buildStickFigurePose = (
  width: number,
  height: number,
  initialPlan: FramePlan,
  workspaceContext?: DrawingAiWorkspaceContext | null,
  frameIndex = 0,
) => {
  let plan = initialPlan;
  const resolvedMotionBeat = resolveMotionBeatForFrame(plan, frameIndex);
  const placement = resolvePlacement(width, height, plan, workspaceContext);
  const sequenceProgress = plan.frameCount <= 1 ? 0 : frameIndex / Math.max(1, plan.frameCount - 1);
  const travelMagnitude = (plan.action === "run" ? width * 0.08 : width * 0.05) * (1 + Math.max(0, plan.speedBias - 1) * 0.22);
  const allowHorizontalTravel =
    !plan.centerLock &&
    plan.frameCount > 1 &&
    (plan.motionProfile === "walk-cycle" || plan.motionProfile === "run-cycle" || plan.action === "step" || plan.action === "run");
  const sequenceOffsetX = allowHorizontalTravel ? getFacingDirection(plan.facing) * travelMagnitude * sequenceProgress : 0;
  const sequenceOffsetY =
    plan.motionProfile === "walk-cycle" || plan.motionProfile === "run-cycle"
      ? Math.sin(sequenceProgress * Math.PI * 2) * (plan.motionProfile === "run-cycle" ? height * 0.012 : height * 0.008) * (0.9 + Math.max(0, plan.smoothnessBias - 1) * 0.18)
      : plan.frameCount > 1 && (plan.action === "jump" || plan.airborneAction || plan.motionProfile === "jump-sequence")
        ? -height * (plan.airborneAction ? 0.2 : 0.16) * Math.sin(Math.PI * sequenceProgress)
        : 0;
  let pose = makeDefaultPose(placement.x + sequenceOffsetX, placement.y + sequenceOffsetY);

  if (plan.motionProfile === "walk-cycle" || plan.motionProfile === "run-cycle") {
    applyWalkLikeBeatPose(pose, plan, resolvedMotionBeat);
    plan = {
      ...plan,
      lean:
        (plan.motionProfile === "run-cycle" ? 0.18 : 0.08) +
        Math.max(0, plan.speedBias - 1) * 0.06 +
        Math.max(0, plan.weightBias - 1) * 0.04,
    };
  } else if (plan.motionProfile === "breathing-cycle") {
    applyBreathingBeatPose(pose, plan, resolvedMotionBeat);
  } else if (plan.motionProfile === "punch-sequence") {
    applyPunchBeatPose(pose, plan, resolvedMotionBeat);
  } else if (plan.motionProfile === "kick-sequence") {
    applyKickBeatPose(pose, plan, resolvedMotionBeat);
  } else if (plan.motionProfile === "jump-sequence") {
    applyJumpBeatPose(pose, plan, resolvedMotionBeat);
  } else if (plan.frameCount > 1) {
    if (plan.action === "run" || plan.action === "step") {
      const swingForward = frameIndex % 2 === 0;
      plan = {
        ...plan,
        leftArm: swingForward ? "back" : "forward",
        rightArm: swingForward ? "forward" : "back",
        leftLeg: swingForward ? "forward" : "back",
        rightLeg: swingForward ? "back" : "forward",
      };
    } else if (plan.action === "punch") {
      if (frameIndex === 0) {
        plan = { ...plan, leftArm: "back", rightArm: "back", leftLeg: "back", rightLeg: "forward" };
      } else if (frameIndex === plan.frameCount - 1) {
        plan = { ...plan, leftArm: "guard", rightArm: "guard", leftLeg: "neutral", rightLeg: "neutral" };
      }
    } else if (plan.action === "stumble") {
      const forwardBeat = frameIndex % 2 === 0;
      plan = {
        ...plan,
        leftArm: "forward",
        rightArm: "forward",
        leftLeg: forwardBeat ? "forward" : "back",
        rightLeg: forwardBeat ? "back" : "forward",
        lean: 0.22,
      };
    }

    applyLimbState(pose, "left", plan.leftArm, plan.facing, plan.armLengthScale);
    applyLimbState(pose, "right", plan.rightArm, plan.facing, plan.armLengthScale);
    applyLegState(pose, "left", plan.leftLeg, plan.facing);
    applyLegState(pose, "right", plan.rightLeg, plan.facing);
  } else {
    applyLimbState(pose, "left", plan.leftArm, plan.facing, plan.armLengthScale);
    applyLimbState(pose, "right", plan.rightArm, plan.facing, plan.armLengthScale);
    applyLegState(pose, "left", plan.leftLeg, plan.facing);
    applyLegState(pose, "right", plan.rightLeg, plan.facing);
  }

  applyPoseOffset(pose, "neck", plan.lean * 30, 0);
  applyPoseOffset(pose, "hip", plan.lean * 18, 4);

  if (plan.expression === "sad") {
    pose.head = translate(pose.head, 0, 6);
    pose.neck = translate(pose.neck, 0, 4);
    pose.leftHand = translate(pose.leftHand, 0, 6);
    pose.rightHand = translate(pose.rightHand, 0, 6);
  } else if (plan.expression === "angry") {
    pose.head = translate(pose.head, plan.facing === "left" ? -3 : 3, 2);
    pose.neck = translate(pose.neck, plan.facing === "left" ? -2 : 2, 1);
    pose.leftHand = translate(pose.leftHand, 0, -2);
    pose.rightHand = translate(pose.rightHand, 0, -2);
  } else if (plan.expression === "smile") {
    pose.head = translate(pose.head, 0, -2);
    pose.neck = translate(pose.neck, 0, -1);
    pose.leftHand = translate(pose.leftHand, 0, -1);
    pose.rightHand = translate(pose.rightHand, 0, -1);
  }

  if (plan.action === "staff-spin" && plan.hasStaff) {
    pose.leftHand = translate(pose.neck, -12, -2);
    pose.rightHand = translate(pose.neck, 14, -18);
  }

  if (plan.headTurnOffset !== 0) {
    pose.head = translate(pose.head, plan.headTurnOffset, 0);
  }

  const scaledPose = scalePose(pose, placement.x + sequenceOffsetX, placement.y + sequenceOffsetY, placement.scale);
  const headRadius = Math.max(14, 18 * placement.scale);

  return {
    pose: scaledPose,
    plan,
    placement,
    headRadius,
    bounds: buildPoseBounds(scaledPose, headRadius, Math.max(6, 10 * placement.scale)),
  };
};

const drawExpression = (
  ctx: CanvasRenderingContext2D,
  centerX: number,
  centerY: number,
  scale: number,
  color: string,
  expression: FrameExpression,
  eyeColor: string | null = null,
  eyeScale = 1,
  hasSunglasses = false,
) => {
  const eyeOffsetX = 6 * scale;
  const eyeY = centerY - 3 * scale;
  const mouthY = centerY + 8 * scale;

  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = Math.max(1, 2 * scale);

  if (hasSunglasses) {
    ctx.fillStyle = "#111111";
    ctx.beginPath();
    ctx.roundRect(centerX - 11 * scale, eyeY - 5 * scale, 9 * scale, 7 * scale, 2 * scale);
    ctx.roundRect(centerX + 2 * scale, eyeY - 5 * scale, 9 * scale, 7 * scale, 2 * scale);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(centerX - 2 * scale, eyeY - 1 * scale);
    ctx.lineTo(centerX + 2 * scale, eyeY - 1 * scale);
    ctx.stroke();
    ctx.restore();
    return;
  }

  const drawEye = (x: number, mode: "dot" | "wide" | "angry" | "sad") => {
    ctx.fillStyle = eyeColor ?? color;
    ctx.strokeStyle = eyeColor ?? color;
    if (mode === "dot") {
      ctx.beginPath();
      ctx.arc(x, eyeY, Math.max(1.2, 1.8 * scale * eyeScale), 0, Math.PI * 2);
      ctx.fill();
      return;
    }

    if (mode === "wide") {
      ctx.beginPath();
      ctx.arc(x, eyeY, Math.max(2.6, 3.2 * scale * eyeScale), 0, Math.PI * 2);
      ctx.stroke();
      return;
    }

    ctx.beginPath();
    ctx.moveTo(x - 4 * scale * eyeScale, eyeY + (mode === "angry" ? 2 : -2) * scale);
    ctx.lineTo(x + 4 * scale * eyeScale, eyeY + (mode === "angry" ? -2 : 2) * scale);
    ctx.stroke();
  };

  if (expression === "shocked") {
    drawEye(centerX - eyeOffsetX, "wide");
    drawEye(centerX + eyeOffsetX, "wide");
    ctx.beginPath();
    ctx.arc(centerX, mouthY, Math.max(3.2, 4.6 * scale), 0, Math.PI * 2);
    ctx.stroke();
  } else if (expression === "smile") {
    drawEye(centerX - eyeOffsetX, "dot");
    drawEye(centerX + eyeOffsetX, "dot");
    ctx.beginPath();
    ctx.arc(centerX, mouthY - 3 * scale, 9 * scale, 0.15 * Math.PI, 0.85 * Math.PI);
    ctx.stroke();
  } else if (expression === "angry") {
    drawEye(centerX - eyeOffsetX, "angry");
    drawEye(centerX + eyeOffsetX, "angry");
    ctx.beginPath();
    ctx.moveTo(centerX - 8 * scale, mouthY + 3 * scale);
    ctx.lineTo(centerX + 8 * scale, mouthY - 1 * scale);
    ctx.stroke();
  } else if (expression === "sad" || expression === "scared") {
    drawEye(centerX - eyeOffsetX, expression === "scared" ? "wide" : "sad");
    drawEye(centerX + eyeOffsetX, expression === "scared" ? "wide" : "sad");
    ctx.beginPath();
    ctx.arc(centerX, mouthY + 8 * scale, 8 * scale, 1.15 * Math.PI, 1.85 * Math.PI);
    ctx.stroke();
  } else if (expression === "determined") {
    drawEye(centerX - eyeOffsetX, "angry");
    drawEye(centerX + eyeOffsetX, "angry");
    ctx.beginPath();
    ctx.moveTo(centerX - 8 * scale, mouthY);
    ctx.lineTo(centerX + 8 * scale, mouthY);
    ctx.stroke();
  } else {
    drawEye(centerX - eyeOffsetX, "dot");
    drawEye(centerX + eyeOffsetX, "dot");
    ctx.beginPath();
    ctx.moveTo(centerX - 7 * scale, mouthY);
    ctx.lineTo(centerX + 7 * scale, mouthY);
    ctx.stroke();
  }

  ctx.restore();
};

const renderStickFigure = (
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  initialPlan: FramePlan,
  workspaceContext?: DrawingAiWorkspaceContext | null,
  frameIndex = 0,
) => {
  const { pose, plan, placement, headRadius } = buildStickFigurePose(
    width,
    height,
    initialPlan,
    workspaceContext,
    frameIndex,
  );

  drawPose(ctx, pose, {
    color: plan.strokeColor,
    lineWidth: Math.max(3, 4 * placement.scale),
    headRadius,
  });

  if (plan.filledHeadColor) {
    ctx.save();
    ctx.fillStyle = plan.filledHeadColor;
    ctx.beginPath();
    ctx.arc(pose.head.x, pose.head.y, Math.max(12, 16 * placement.scale), 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = plan.strokeColor;
    ctx.lineWidth = Math.max(2, 3 * placement.scale);
    ctx.stroke();
    ctx.restore();
  }

  if (plan.robotStyle) {
    const headSize = 18 * placement.scale;
    ctx.save();
    ctx.strokeStyle = plan.strokeColor;
    ctx.lineWidth = Math.max(2, 3 * placement.scale);
    ctx.strokeRect(pose.head.x - headSize * 0.85, pose.head.y - headSize * 0.85, headSize * 1.7, headSize * 1.7);
    ctx.strokeRect(pose.neck.x - headSize * 0.72, pose.neck.y - headSize * 0.1, headSize * 1.44, (pose.hip.y - pose.neck.y) * 0.82);
    ctx.beginPath();
    ctx.moveTo(pose.neck.x - headSize * 0.72, pose.neck.y + headSize * 0.38);
    ctx.lineTo(pose.neck.x + headSize * 0.72, pose.neck.y + headSize * 0.38);
    ctx.moveTo(pose.neck.x - headSize * 0.48, pose.neck.y + headSize * 0.82);
    ctx.lineTo(pose.neck.x + headSize * 0.48, pose.neck.y + headSize * 0.82);
    ctx.stroke();
    const jointRadius = Math.max(2, 3.5 * placement.scale);
    for (const point of [pose.neck, pose.hip, pose.leftElbow, pose.rightElbow, pose.leftKnee, pose.rightKnee]) {
      ctx.beginPath();
      ctx.arc(point.x, point.y, jointRadius, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  if (plan.capeStyle) {
    ctx.save();
    ctx.fillStyle = rgba(plan.strokeColor, 0.16);
    ctx.beginPath();
    ctx.moveTo(pose.neck.x, pose.neck.y);
    ctx.lineTo(pose.leftElbow.x - 10 * placement.scale, pose.hip.y + 8 * placement.scale);
    ctx.lineTo(pose.hip.x, pose.hip.y + 54 * placement.scale);
    ctx.lineTo(pose.rightElbow.x + 10 * placement.scale, pose.hip.y + 8 * placement.scale);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  if (plan.wingedStyle) {
    ctx.save();
    ctx.strokeStyle = rgba(plan.strokeColor, 0.82);
    ctx.lineWidth = Math.max(2, 3 * placement.scale);
    ctx.beginPath();
    ctx.moveTo(pose.neck.x, pose.neck.y - 4 * placement.scale);
    ctx.quadraticCurveTo(
      pose.leftElbow.x - 44 * placement.scale,
      pose.hip.y - 18 * placement.scale,
      pose.leftElbow.x - 26 * placement.scale,
      pose.hip.y + 18 * placement.scale,
    );
    ctx.moveTo(pose.neck.x, pose.neck.y - 4 * placement.scale);
    ctx.quadraticCurveTo(
      pose.rightElbow.x + 44 * placement.scale,
      pose.hip.y - 18 * placement.scale,
      pose.rightElbow.x + 26 * placement.scale,
      pose.hip.y + 18 * placement.scale,
    );
    ctx.stroke();
    ctx.restore();
  }

  if (plan.hornedStyle) {
    ctx.save();
    ctx.strokeStyle = plan.strokeColor;
    ctx.lineWidth = Math.max(2, 3 * placement.scale);
    ctx.beginPath();
    ctx.moveTo(pose.head.x - 8 * placement.scale, pose.head.y - 14 * placement.scale);
    ctx.lineTo(pose.head.x - 16 * placement.scale, pose.head.y - 28 * placement.scale);
    ctx.moveTo(pose.head.x + 8 * placement.scale, pose.head.y - 14 * placement.scale);
    ctx.lineTo(pose.head.x + 16 * placement.scale, pose.head.y - 28 * placement.scale);
    ctx.stroke();
    ctx.restore();
  }

  if (plan.facialFeaturesEnabled) {
    drawExpression(
      ctx,
      pose.head.x,
      pose.head.y,
      placement.scale,
      plan.strokeColor,
      plan.expression,
      plan.eyeColor,
      plan.eyeScale,
      plan.hasSunglasses,
    );
  }

  if (plan.hasStaff) {
    ctx.save();
    ctx.strokeStyle = "#8b5a2b";
    ctx.lineWidth = Math.max(3, 5 * placement.scale);
    ctx.lineCap = "round";
    const angle =
      plan.action === "staff-spin"
        ? -0.75
        : plan.facing === "left"
          ? Math.PI * 0.82
          : Math.PI * 0.18;
    const length = 130 * placement.scale;
    const centerX = (pose.leftHand.x + pose.rightHand.x) / 2;
    const centerY = (pose.leftHand.y + pose.rightHand.y) / 2;
    ctx.beginPath();
    ctx.moveTo(centerX - Math.cos(angle) * length * 0.5, centerY - Math.sin(angle) * length * 0.5);
    ctx.lineTo(centerX + Math.cos(angle) * length * 0.5, centerY + Math.sin(angle) * length * 0.5);
    ctx.stroke();

    if (plan.action === "staff-spin") {
      ctx.strokeStyle = "rgba(139,90,43,0.28)";
      ctx.lineWidth = Math.max(1, 2 * placement.scale);
      ctx.beginPath();
      ctx.arc(centerX, centerY, 52 * placement.scale, Math.PI * 0.15, Math.PI * 1.12);
      ctx.stroke();
    }
    ctx.restore();
  }
};

const renderRoundCharacter = (
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  plan: FramePlan,
  workspaceContext?: DrawingAiWorkspaceContext | null,
) => {
  const placement = resolvePlacement(width, height, plan, workspaceContext);
  const radius = 38 * placement.scale;
  const centerX = placement.x;
  const centerY = placement.y;
  const strokeColor = plan.strokeColor;

  ctx.save();
  ctx.strokeStyle = strokeColor;
  ctx.fillStyle = "rgba(255,255,255,0)";
  ctx.lineWidth = Math.max(3, 4 * placement.scale);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  ctx.beginPath();
  ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
  if (plan.filledHeadColor) {
    ctx.fillStyle = plan.filledHeadColor;
    ctx.fill();
  }
  ctx.stroke();

  const limbLength = 34 * placement.scale;
  const legLength = 44 * placement.scale;
  const resolveArmEndPoint = (side: "left" | "right", state: LimbState) => {
    const sideDirection = side === "left" ? -1 : 1;
    const facingDirection = plan.facing === "left" ? -1 : 1;

    if (state === "up") {
      return {
        x: centerX + sideDirection * radius * 0.9,
        y: centerY - limbLength * plan.armLengthScale,
      };
    }

    if (state === "forward") {
      return {
        x: centerX + facingDirection * radius * (1.15 + 0.4 * plan.armLengthScale),
        y: centerY - radius * 0.08,
      };
    }

    if (state === "back") {
      return {
        x: centerX - facingDirection * radius * (0.75 + 0.4 * plan.armLengthScale),
        y: centerY + radius * 0.2,
      };
    }

    if (state === "guard") {
      return {
        x: centerX + sideDirection * radius * 0.9,
        y: centerY - radius * 0.55,
      };
    }

    return {
      x: centerX + sideDirection * radius * (0.75 + 0.45 * plan.armLengthScale),
      y: centerY + limbLength * 0.15,
    };
  };
  const resolveLegEndPoint = (side: "left" | "right", state: LimbState) => {
    const sideDirection = side === "left" ? -1 : 1;
    const facingDirection = plan.facing === "left" ? -1 : 1;

    if (state === "forward") {
      return {
        x: centerX + facingDirection * radius * 0.95,
        y: centerY + radius * 0.8 + legLength * 0.76,
      };
    }

    if (state === "back") {
      return {
        x: centerX - facingDirection * radius * 0.75,
        y: centerY + radius * 0.8 + legLength * 0.88,
      };
    }

    if (state === "down") {
      return {
        x: centerX + sideDirection * radius * 0.45,
        y: centerY + radius * 0.8 + legLength * 0.92,
      };
    }

    return {
      x: centerX + sideDirection * radius * 0.55,
      y: centerY + radius * 0.8 + legLength,
    };
  };
  const leftArmEnd = resolveArmEndPoint("left", plan.leftArm);
  const rightArmEnd = resolveArmEndPoint("right", plan.rightArm);
  const leftLegEnd = resolveLegEndPoint("left", plan.leftLeg);
  const rightLegEnd = resolveLegEndPoint("right", plan.rightLeg);

  ctx.beginPath();
  ctx.moveTo(centerX - radius * 0.55, centerY - radius * 0.15);
  ctx.lineTo(leftArmEnd.x, leftArmEnd.y);
  ctx.moveTo(centerX + radius * 0.55, centerY - radius * 0.15);
  ctx.lineTo(rightArmEnd.x, rightArmEnd.y);
  ctx.moveTo(centerX - radius * 0.35, centerY + radius * 0.8);
  ctx.lineTo(leftLegEnd.x, leftLegEnd.y);
  ctx.moveTo(centerX + radius * 0.35, centerY + radius * 0.8);
  ctx.lineTo(rightLegEnd.x, rightLegEnd.y);
  ctx.moveTo(leftLegEnd.x - 8 * placement.scale, leftLegEnd.y);
  ctx.lineTo(leftLegEnd.x + 6 * placement.scale, leftLegEnd.y);
  ctx.moveTo(rightLegEnd.x - 6 * placement.scale, rightLegEnd.y);
  ctx.lineTo(rightLegEnd.x + 8 * placement.scale, rightLegEnd.y);
  ctx.stroke();

  drawExpression(
    ctx,
    centerX,
    centerY,
    placement.scale,
    strokeColor,
    plan.expression,
    plan.eyeColor,
    plan.eyeScale,
    plan.hasSunglasses,
  );

  if (plan.groundhogStyle) {
    ctx.beginPath();
    ctx.arc(centerX - radius * 0.4, centerY - radius * 0.95, radius * 0.18, 0, Math.PI * 2);
    ctx.arc(centerX + radius * 0.4, centerY - radius * 0.95, radius * 0.18, 0, Math.PI * 2);
    ctx.stroke();
  }
  if (plan.capeStyle) {
    ctx.save();
    ctx.fillStyle = rgba(strokeColor, 0.14);
    ctx.beginPath();
    ctx.moveTo(centerX, centerY - radius * 0.45);
    ctx.lineTo(centerX - radius * 0.8, centerY + radius * 0.9);
    ctx.lineTo(centerX + radius * 0.8, centerY + radius * 0.9);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
  if (plan.wingedStyle) {
    ctx.beginPath();
    ctx.moveTo(centerX - radius * 0.66, centerY - radius * 0.18);
    ctx.quadraticCurveTo(centerX - radius * 1.55, centerY - radius * 0.62, centerX - radius * 1.08, centerY + radius * 0.62);
    ctx.moveTo(centerX + radius * 0.66, centerY - radius * 0.18);
    ctx.quadraticCurveTo(centerX + radius * 1.55, centerY - radius * 0.62, centerX + radius * 1.08, centerY + radius * 0.62);
    ctx.stroke();
  }
  if (plan.hornedStyle) {
    ctx.beginPath();
    ctx.moveTo(centerX - radius * 0.22, centerY - radius * 0.92);
    ctx.lineTo(centerX - radius * 0.48, centerY - radius * 1.3);
    ctx.moveTo(centerX + radius * 0.22, centerY - radius * 0.92);
    ctx.lineTo(centerX + radius * 0.48, centerY - radius * 1.3);
    ctx.stroke();
  }
  if (plan.alienStyle) {
    ctx.beginPath();
    ctx.moveTo(centerX - radius * 0.28, centerY - radius * 0.9);
    ctx.lineTo(centerX - radius * 0.45, centerY - radius * 1.35);
    ctx.moveTo(centerX + radius * 0.28, centerY - radius * 0.9);
    ctx.lineTo(centerX + radius * 0.45, centerY - radius * 1.35);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(centerX - radius * 0.45, centerY - radius * 1.35, radius * 0.08, 0, Math.PI * 2);
    ctx.arc(centerX + radius * 0.45, centerY - radius * 1.35, radius * 0.08, 0, Math.PI * 2);
    ctx.fillStyle = strokeColor;
    ctx.fill();
  }
  ctx.restore();
};

const buildFrameSummary = (plan: FramePlan) => {
  const stylePrefix =
    plan.pixelStyle || plan.arcadeStyle
      ? `${[plan.pixelStyle ? "pixely" : null, plan.arcadeStyle ? "arcadey" : null].filter(Boolean).join(" ")} `
      : "";

  if (plan.subjectType === "effect") {
    const phaseLabel = plan.effectPhase !== "none" ? ` ${plan.effectPhase}` : "";
    return `${stylePrefix}${plan.effectType}${phaseLabel} frame`.trim();
  }

  if (plan.subjectType === "simple-object") {
    const subjectLabel =
      plan.objectShape === "ball"
        ? "ball"
        : plan.objectShape === "plain-landscape"
          ? "plains and mountain background"
          : plan.objectShape === "city-background"
            ? "night city background"
        : plan.objectShape === "room-background"
          ? "dark room background"
          : plan.objectShape === "concrete-cracks"
            ? "concrete cracks"
            : plan.objectShape === "smoke-cloud"
              ? "smoke effect"
              : plan.objectShape;
    if (plan.action === "stand") {
      return plan.frameCount > 1 ? `${stylePrefix}${subjectLabel} sequence` : `${stylePrefix}${subjectLabel} frame`;
    }
    return plan.frameCount > 1
      ? `${stylePrefix}${subjectLabel} ${plan.action} sequence`
      : `${stylePrefix}${subjectLabel} ${plan.action} frame`;
  }

  const actionLabel =
    plan.action === "staff-spin"
      ? "staff-spin frame"
      : `${plan.action} frame`;
  const placementLabel =
    plan.visibility === "partial" ? `partial ${plan.placementX}` : plan.placementX;
  return `${stylePrefix}${plan.subjectType} ${actionLabel} at ${placementLabel}`;
};

const getObjectFrameRadius = (plan: FramePlan, placementScale: number) => {
  if (plan.objectShape === "hallway-background") {
    return { radiusX: 280 * placementScale, radiusY: 210 * placementScale };
  }

  if (plan.objectShape === "lightning") {
    return { radiusX: 74 * placementScale, radiusY: 212 * placementScale };
  }

  if (plan.objectShape === "smoke-cloud") {
    return { radiusX: 96 * placementScale, radiusY: 64 * placementScale };
  }

  if (plan.objectShape === "flame") {
    return { radiusX: 74 * placementScale, radiusY: 122 * placementScale };
  }

  if (plan.objectShape === "rain") {
    return { radiusX: 120 * placementScale, radiusY: 168 * placementScale };
  }

  if (plan.objectShape === "slash-arc") {
    return { radiusX: 112 * placementScale, radiusY: 72 * placementScale };
  }

  if (plan.objectShape === "mountain") {
    return { radiusX: 170 * placementScale, radiusY: 110 * placementScale };
  }

  if (plan.objectShape === "plain-landscape") {
    return { radiusX: 360 * placementScale, radiusY: 190 * placementScale };
  }

  if (plan.objectShape === "city-background") {
    return { radiusX: 320 * placementScale, radiusY: 190 * placementScale };
  }

  if (plan.objectShape === "room-background") {
    return { radiusX: 320 * placementScale, radiusY: 190 * placementScale };
  }

  if (plan.objectShape === "concrete-cracks") {
    return { radiusX: 180 * placementScale, radiusY: 96 * placementScale };
  }

  if (plan.objectShape === "cloud") {
    return { radiusX: 84 * placementScale, radiusY: 44 * placementScale };
  }

  if (plan.objectShape === "door") {
    return { radiusX: 42 * placementScale, radiusY: 86 * placementScale };
  }

  if (plan.objectShape === "pillar") {
    return { radiusX: 34 * placementScale, radiusY: 112 * placementScale };
  }

  if (plan.objectShape === "crystal") {
    return { radiusX: 40 * placementScale, radiusY: 86 * placementScale };
  }

  if (plan.objectShape === "mushroom") {
    return { radiusX: 42 * placementScale, radiusY: 60 * placementScale };
  }

  if (plan.objectShape === "portal") {
    return { radiusX: 56 * placementScale, radiusY: 92 * placementScale };
  }

  if (plan.objectShape === "torch") {
    return { radiusX: 20 * placementScale, radiusY: 72 * placementScale };
  }

  if (plan.objectShape === "fence") {
    return { radiusX: 88 * placementScale, radiusY: 44 * placementScale };
  }

  if (plan.objectShape === "sign") {
    return { radiusX: 52 * placementScale, radiusY: 56 * placementScale };
  }

  if (plan.objectShape === "rubble-pile") {
    return { radiusX: 68 * placementScale, radiusY: 40 * placementScale };
  }

  if (plan.objectShape === "desk") {
    return { radiusX: 68 * placementScale, radiusY: 44 * placementScale };
  }

  if (plan.objectShape === "crate") {
    return { radiusX: 42 * placementScale, radiusY: 42 * placementScale };
  }

  if (plan.objectShape === "rock") {
    return { radiusX: 46 * placementScale, radiusY: 34 * placementScale };
  }

  if (plan.objectShape === "rectangle") {
    return { radiusX: 52 * placementScale, radiusY: 32 * placementScale };
  }

  if (plan.objectShape === "square") {
    return { radiusX: 40 * placementScale, radiusY: 40 * placementScale };
  }

  if (plan.objectShape === "rod") {
    return { radiusX: 64 * placementScale, radiusY: 8 * placementScale };
  }

  if (plan.objectShape === "tree") {
    return { radiusX: 48 * placementScale, radiusY: 72 * placementScale };
  }

  if (plan.objectShape === "plant") {
    return { radiusX: 30 * placementScale, radiusY: 54 * placementScale };
  }

  if (plan.objectShape === "fan") {
    return { radiusX: 52 * placementScale, radiusY: 72 * placementScale };
  }

  return { radiusX: 36 * placementScale, radiusY: 36 * placementScale };
};

const getObjectSequencePlacement = (
  width: number,
  height: number,
  plan: FramePlan,
  workspaceContext: DrawingAiWorkspaceContext | null | undefined,
  frameIndex: number,
) => {
  const basePlacement = resolvePlacement(width, height, plan, workspaceContext);
  const progress = plan.frameCount <= 1 ? 0 : frameIndex / Math.max(1, plan.frameCount - 1);
  const resolvedMotionBeat = resolveMotionBeatForFrame(plan, frameIndex);
  const fromLeft = !plan.centerLock && (plan.placementX === "off-left" || plan.placementX === "left-entry" || plan.facing === "right");
  const fromRight = !plan.centerLock && (plan.placementX === "off-right" || plan.placementX === "right-entry" || plan.facing === "left");
  const fromTop = plan.placementY === "off-top" || plan.placementY === "top-entry";
  const fromBottom = plan.placementY === "off-bottom" || plan.placementY === "bottom-entry";

  let x = basePlacement.x;
  let y = basePlacement.y;
  let scaleX = 1;
  let scaleY = 1;
  let rotation = 0;

  if (
    plan.backgroundMode ||
    plan.objectShape === "hallway-background" ||
    plan.objectShape === "room-background" ||
    plan.objectShape === "concrete-cracks" ||
    plan.objectShape === "mountain" ||
    plan.objectShape === "cloud"
  ) {
    x = width * 0.5;
    y =
      plan.objectShape === "cloud"
        ? height * 0.22
        : plan.objectShape === "mountain"
          ? height * 0.72
          : plan.objectShape === "concrete-cracks"
            ? height * 0.78
          : plan.backgroundMode
            ? height * 0.66
            : height * 0.5;
  }

  if (plan.motionProfile === "fall-explosion") {
    if (resolvedMotionBeat === "fall-high") {
      y = height * 0.18;
    } else if (resolvedMotionBeat === "fall-fast") {
      y = height * 0.46;
    } else if (resolvedMotionBeat === "explosion-build") {
      y = height * 0.74;
      scaleX = 0.84;
      scaleY = 0.84;
    } else if (resolvedMotionBeat === "impact-contact") {
      y = height * 0.74;
      scaleX = 1.18;
      scaleY = 0.82;
    } else if (resolvedMotionBeat === "explosion-bloom" || resolvedMotionBeat === "explosion-fade") {
      y = height * 0.74;
      scaleX = resolvedMotionBeat === "explosion-fade" ? 1.22 : 1.48;
      scaleY = resolvedMotionBeat === "explosion-fade" ? 1.16 : 1.42;
    }
  } else if (plan.action === "bounce" || plan.action === "rebound") {
    const groundY = height * (0.72 + (fromTop ? -0.12 : 0));
    const heavyMultiplier = 1 / clamp(plan.weightBias, 0.75, 1.5);
    const cartoonLiftBoost = 1 + Math.max(0, plan.cartoonBias - 1) * 0.45;
    const speedCompression = 1 / clamp(plan.speedBias, 0.7, 1.4);
    const smoothLiftBoost = 1 + Math.max(0, plan.smoothnessBias - 1) * 0.14;
    const primaryLift = height * 0.24 * heavyMultiplier * cartoonLiftBoost * speedCompression * smoothLiftBoost;
    const reboundLift =
      primaryLift *
      clamp(0.54 - Math.max(0, plan.weightBias - 1) * 0.16 + Math.max(0, plan.cartoonBias - 1) * 0.1, 0.26, 0.72);
    const settleLift = height * 0.045 * heavyMultiplier;
    const fallEnd = 0.38;
    const contactEnd = 0.5;
    const reboundPeak = 0.72;
    const settleStart = 0.88;
    const normalizedProgress = clamp(progress, 0, 1);
    const contactCompression =
      normalizedProgress <= fallEnd || normalizedProgress >= contactEnd
        ? 0
        : Math.sin(((normalizedProgress - fallEnd) / Math.max(0.001, contactEnd - fallEnd)) * Math.PI);
    const fallStretch = normalizedProgress < contactEnd ? Math.max(0, 1 - normalizedProgress / contactEnd) : 0;
    const reboundStretch =
      normalizedProgress <= contactEnd || normalizedProgress >= reboundPeak
        ? 0
        : Math.sin(((normalizedProgress - contactEnd) / Math.max(0.001, reboundPeak - contactEnd)) * Math.PI);

    if (normalizedProgress <= fallEnd) {
      y = groundY - lerp(primaryLift, height * 0.02, easeInQuad(normalizedProgress / fallEnd));
    } else if (normalizedProgress <= contactEnd) {
      const t = (normalizedProgress - fallEnd) / Math.max(0.001, contactEnd - fallEnd);
      y = groundY - lerp(height * 0.02, 0, easeOutQuad(t));
    } else if (normalizedProgress <= reboundPeak) {
      const t = (normalizedProgress - contactEnd) / Math.max(0.001, reboundPeak - contactEnd);
      y = groundY - reboundLift * easeOutQuad(t);
    } else if (normalizedProgress <= settleStart) {
      const t = (normalizedProgress - reboundPeak) / Math.max(0.001, settleStart - reboundPeak);
      y = groundY - lerp(reboundLift, settleLift, easeInQuad(t));
    } else {
      const t = (normalizedProgress - settleStart) / Math.max(0.001, 1 - settleStart);
      y = groundY - lerp(settleLift, 0, easeOutQuad(t));
    }

    scaleX = 1;
    scaleY = 1;
    if (resolvedMotionBeat === "bounce-contact" || contactCompression > 0) {
      scaleX =
        1.06 +
        contactCompression * (0.16 + Math.max(0, plan.cartoonBias - 1) * 0.24 + Math.max(0, plan.weightBias - 1) * 0.12);
      scaleY =
        0.96 -
        contactCompression * (0.14 + Math.max(0, plan.cartoonBias - 1) * 0.12 + Math.max(0, plan.weightBias - 1) * 0.08);
    } else if (normalizedProgress < contactEnd || resolvedMotionBeat === "bounce-fall") {
      scaleX = 0.98 - fallStretch * Math.max(0, plan.cartoonBias - 1) * 0.12;
      scaleY = 1.02 + fallStretch * (0.08 + Math.max(0, plan.cartoonBias - 1) * 0.18);
    } else if (normalizedProgress < reboundPeak || resolvedMotionBeat === "bounce-rebound" || resolvedMotionBeat === "bounce-rise") {
      scaleX = 0.98 - reboundStretch * Math.max(0, plan.cartoonBias - 1) * 0.12;
      scaleY = 1.02 + reboundStretch * (0.06 + Math.max(0, plan.cartoonBias - 1) * 0.16);
    } else if (resolvedMotionBeat === "bounce-settle" || normalizedProgress >= reboundPeak) {
      scaleX = 1.02 + Math.max(0, plan.weightBias - 1) * 0.06;
      scaleY = 0.98 - Math.max(0, plan.weightBias - 1) * 0.04;
    }

    if (fromLeft) {
      x = width * (0.14 + progress * (0.3 + Math.max(0, plan.speedBias - 1) * 0.04));
    } else if (fromRight) {
      x = width * (0.86 - progress * (0.3 + Math.max(0, plan.speedBias - 1) * 0.04));
    }
  } else if (plan.action === "fall" || plan.action === "land") {
    const fallTravel = height * 0.42;
    y = basePlacement.y - fallTravel + progress * fallTravel;
    if (frameIndex === plan.frameCount - 1) {
      scaleX = 1.14;
      scaleY = 0.84;
    }
  } else if (plan.action === "explode") {
    const burstScale = resolvedMotionBeat === "explosion-fade" ? 1.2 : 1.45;
    scaleX = burstScale;
    scaleY = burstScale;
    y = plan.centerLock ? height * 0.74 : basePlacement.y;
  } else if (plan.objectShape === "lightning") {
    x = width * 0.5;
    y = height * 0.44;
    scaleX = frameIndex === 1 ? 1.08 : frameIndex === 2 ? 0.92 : 1;
    scaleY = frameIndex === 1 ? 1.06 : frameIndex === 2 ? 0.94 : 0.98;
  } else if (plan.objectShape === "smoke-cloud") {
    x = plan.centerLock ? width * 0.5 : basePlacement.x;
    y = height * 0.62 - Math.sin(progress * Math.PI) * height * 0.04;
    scaleX = frameIndex === 0 ? 0.92 : frameIndex === plan.frameCount - 1 ? 1.18 : 1.06;
    scaleY = frameIndex === 0 ? 0.9 : frameIndex === plan.frameCount - 1 ? 1.08 : 1;
  } else if (plan.objectShape === "flame") {
    x = plan.centerLock ? width * 0.5 : basePlacement.x;
    y = height * 0.72;
    rotation = Math.sin(progress * Math.PI * 1.4) * 0.05;
    scaleX = frameIndex === 1 ? 1.12 : frameIndex === 2 ? 0.95 : 1;
    scaleY = frameIndex === 0 ? 1.08 : frameIndex === 1 ? 0.94 : 0.9;
  } else if (plan.objectShape === "fan") {
    x = plan.centerLock ? width * 0.5 : basePlacement.x;
    y = plan.centerLock ? height * 0.58 : basePlacement.y;
    if (plan.motionProfile === "spin-sequence" || plan.action === "spin") {
      rotation = 0;
      scaleX = resolvedMotionBeat === "spin-fast" ? 1.02 : 1;
      scaleY = resolvedMotionBeat === "spin-fast" ? 0.98 : 1;
    }
  } else if (plan.objectShape === "rain") {
    x = width * 0.5;
    y = height * 0.54;
    rotation = 0;
    scaleX = 1;
    scaleY = frameIndex === 1 ? 1.04 : 0.98;
  } else if (plan.objectShape === "slash-arc") {
    x = plan.centerLock ? width * 0.5 : basePlacement.x;
    y = plan.centerLock ? height * 0.56 : basePlacement.y;
    rotation = (plan.facing === "left" ? -1 : 1) * (frameIndex === 0 ? -0.18 : frameIndex === plan.frameCount - 1 ? 0.12 : 0);
    scaleX = frameIndex === 0 ? 0.84 : frameIndex === plan.frameCount - 1 ? 0.92 : 1.06;
    scaleY = frameIndex === 0 ? 0.82 : frameIndex === plan.frameCount - 1 ? 0.88 : 1;
  } else if (plan.action === "roll" || plan.action === "slide") {
    const distance = width * 0.34;
    if (fromRight) {
      x = basePlacement.x + distance * 0.5 - progress * distance;
    } else {
      x = basePlacement.x - distance * 0.5 + progress * distance;
    }
    rotation = progress * Math.PI * 1.35 * (fromRight ? -1 : 1);
  } else if (plan.action === "sway" || plan.action === "bob") {
    rotation = Math.sin(progress * Math.PI * 1.15) * (plan.action === "sway" ? 0.18 : 0.08);
    y = basePlacement.y - Math.sin(progress * Math.PI) * (plan.action === "bob" ? height * 0.04 : height * 0.015);
  } else if (plan.placementX === "left-entry" || plan.placementX === "right-entry" || fromLeft || fromRight || fromTop || fromBottom) {
    const deltaX = fromLeft ? width * 0.32 : fromRight ? -width * 0.32 : 0;
    const deltaY = fromTop ? height * 0.3 : fromBottom ? -height * 0.3 : 0;
    x = basePlacement.x + deltaX * (1 - progress);
    y = basePlacement.y + deltaY * (1 - progress);
  }

  return {
    x,
    y,
    scale: basePlacement.scale,
    scaleX,
    scaleY,
    rotation,
  };
};

const buildObjectBounds = (
  placement: ReturnType<typeof getObjectSequencePlacement>,
  drawRadiusX: number,
  drawRadiusY: number,
): DrawingAiWorkspaceBitmapBounds =>
  createBounds(
    placement.x - drawRadiusX - 12,
    placement.y - drawRadiusY - 12,
    placement.x + drawRadiusX + 12,
    placement.y + drawRadiusY + 12,
  );

const getObjectPalette = (plan: FramePlan, frameIndex: number) => {
  if (plan.action === "explode" || plan.motionProfile === "fall-explosion") {
    const explosionBase = plan.hasExplicitColor ? plan.strokeColor : "#ff7a18";
    const hotCore = plan.hasExplicitColor ? mixColors(explosionBase, "#ffffff", 0.36) : "#ffd34d";
    const smoke = plan.hasExplicitColor ? mixColors(explosionBase, "#4f5560", 0.52) : "#59606a";
    return {
      stroke: explosionBase,
      fill: rgba(mixColors(explosionBase, "#ffcc57", 0.3), frameIndex === 2 ? 0.16 : 0.24),
      accent: hotCore,
      accentFill: rgba(hotCore, frameIndex === 2 ? 0.2 : 0.34),
      shadow: rgba(smoke, frameIndex === 2 ? 0.26 : 0.18),
    };
  }

  if (plan.objectShape === "lightning") {
    const lightningBase = plan.hasExplicitColor ? plan.strokeColor : "#9ad8ff";
    return {
      stroke: frameIndex === 1 ? "#f7fcff" : lightningBase,
      fill: rgba(lightningBase, frameIndex === 1 ? 0.24 : 0.16),
      accent: "#ffffff",
      accentFill: rgba("#ffffff", frameIndex === 1 ? 0.22 : 0.1),
      shadow: rgba(lightningBase, 0.2),
    };
  }

  if (plan.objectShape === "flame") {
    const flameBase = plan.hasExplicitColor ? plan.strokeColor : "#ff8d2a";
    return {
      stroke: flameBase,
      fill: rgba(mixColors(flameBase, "#ffd55c", 0.26), 0.22),
      accent: plan.hasExplicitColor ? mixColors(flameBase, "#ffffff", 0.28) : "#ffd54a",
      accentFill: rgba(plan.hasExplicitColor ? mixColors(flameBase, "#ffffff", 0.28) : "#ffd54a", 0.26),
      shadow: rgba(mixColors(flameBase, "#6c2710", 0.44), 0.2),
    };
  }

  if (plan.objectShape === "rain") {
    const rainBase = plan.hasExplicitColor ? plan.strokeColor : "#6d88b8";
    return {
      stroke: rainBase,
      fill: rgba(rainBase, 0.12),
      accent: mixColors(rainBase, "#d9e8ff", 0.55),
      accentFill: rgba(mixColors(rainBase, "#d9e8ff", 0.55), 0.12),
      shadow: rgba(rainBase, 0.1),
    };
  }

  if (plan.objectShape === "slash-arc") {
    const slashBase = plan.hasExplicitColor ? plan.strokeColor : "#8fe8ff";
    return {
      stroke: slashBase,
      fill: rgba(slashBase, 0.12),
      accent: mixColors(slashBase, "#ffffff", 0.4),
      accentFill: rgba(mixColors(slashBase, "#ffffff", 0.4), 0.14),
      shadow: rgba(slashBase, 0.18),
    };
  }

  if (plan.objectFillColor) {
    const fillBase = plan.objectFillColor;
    return {
      stroke: plan.strokeColor,
      fill: rgba(fillBase, fillBase === STICK_FIGURE_COLORS.black ? 0.88 : 0.62),
      accent: mixColors(fillBase, "#ffffff", 0.24),
      accentFill: rgba(mixColors(fillBase, "#ffffff", 0.24), 0.18),
      shadow: rgba(mixColors(fillBase, "#11151d", 0.5), 0.16),
    };
  }

  return {
    stroke: plan.strokeColor,
    fill: `${plan.strokeColor}22`,
    accent: mixColors(plan.strokeColor, "#ffffff", 0.2),
    accentFill: rgba(mixColors(plan.strokeColor, "#ffffff", 0.2), 0.14),
    shadow: rgba(plan.strokeColor, 0.14),
  };
};

const getEffectPalette = (plan: FramePlan, frameIndex: number) => {
  if (plan.effectType === "lightning") {
    const lightningBase = plan.hasExplicitColor ? plan.strokeColor : "#9ad8ff";
    const strikeWhite = mixColors(lightningBase, "#ffffff", 0.72);
    return {
      base: lightningBase,
      core: strikeWhite,
      shell: rgba(lightningBase, frameIndex === 1 ? 0.36 : 0.24),
      smoke: rgba(mixColors(lightningBase, "#5b6682", 0.44), 0.16),
      glow: rgba(strikeWhite, 0.4 + plan.glowStrength * 0.18),
      fragment: mixColors(lightningBase, "#ffffff", 0.38),
    };
  }

  if (plan.effectType === "smoke") {
    const smokeBase = plan.hasExplicitColor ? mixColors(plan.strokeColor, "#4f5560", 0.5) : "#59606a";
    return {
      base: smokeBase,
      core: mixColors(smokeBase, "#9aa3ad", 0.24),
      shell: rgba(smokeBase, 0.26),
      smoke: rgba(smokeBase, 0.28),
      glow: rgba(mixColors(smokeBase, "#ffffff", 0.08), 0.08),
      fragment: mixColors(smokeBase, "#c2cad2", 0.18),
    };
  }

  if (plan.effectType === "shockwave") {
    const dustBase = plan.hasExplicitColor ? mixColors(plan.strokeColor, "#c3a97c", 0.34) : "#b58f6a";
    return {
      base: dustBase,
      core: mixColors(dustBase, "#f0d4aa", 0.42),
      shell: rgba(dustBase, 0.16),
      smoke: rgba(mixColors(dustBase, "#6b6258", 0.4), 0.18),
      glow: rgba(mixColors(dustBase, "#ffffff", 0.18), 0.12),
      fragment: mixColors(dustBase, "#f4e3c6", 0.28),
    };
  }

  const explosionBase = plan.hasExplicitColor ? plan.strokeColor : "#ff7a18";
  const poisonous = /\b(poisonous|toxic|acid(?:ic)?)\b/i.test(explosionBase) ? true : /#25a85b|#67d88f/i.test(explosionBase);
  const hotTarget = poisonous ? "#f6ff9d" : "#fff0a2";
  const outerTarget = poisonous ? "#9ef15c" : "#ffb548";
  const smokeTarget = poisonous ? "#66776c" : "#4f5560";
  return {
    base: mixColors(explosionBase, outerTarget, 0.16),
    core: mixColors(explosionBase, hotTarget, 0.56),
    shell: rgba(mixColors(explosionBase, outerTarget, 0.28), 0.3),
    smoke: rgba(mixColors(explosionBase, smokeTarget, 0.56), 0.28),
    glow: rgba(mixColors(explosionBase, "#ffffff", 0.28), 0.18 + plan.glowStrength * 0.22),
    fragment: mixColors(explosionBase, poisonous ? "#d8ff9b" : "#ffd57a", 0.34),
  };
};

const seededUnit = (seed: number) => {
  const raw = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return raw - Math.floor(raw);
};

const seededUnitForPlan = (plan: Pick<FramePlan, "variationSeed">, offset: number) =>
  seededUnit(((plan.variationSeed % 10000) + 1) * 0.013 + offset);

const seededSignedForPlan = (plan: Pick<FramePlan, "variationSeed">, offset: number) =>
  seededUnitForPlan(plan, offset) * 2 - 1;

const buildIrregularBurstPath = ({
  ctx,
  radiusX,
  radiusY,
  pointCount,
  seed,
  jaggedness,
  lobeBias,
}: {
  ctx: CanvasRenderingContext2D;
  radiusX: number;
  radiusY: number;
  pointCount: number;
  seed: number;
  jaggedness: number;
  lobeBias: number;
}) => {
  ctx.beginPath();
  for (let index = 0; index < pointCount; index += 1) {
    const progress = index / pointCount;
    const angle = progress * Math.PI * 2;
    const baseNoise = 0.82 + seededUnit(seed + index * 0.61) * 0.38;
    const spikePulse = Math.sin(angle * 3.0 + seed * 0.17) * lobeBias + Math.sin(angle * 7.0 + seed * 0.11) * jaggedness;
    const spikeScale = 1 + spikePulse * 0.22;
    const localRadiusX = radiusX * baseNoise * spikeScale;
    const localRadiusY = radiusY * (0.84 + seededUnit(seed + index * 0.37) * 0.34) * spikeScale;
    const x = Math.cos(angle) * localRadiusX;
    const y = Math.sin(angle) * localRadiusY;
    if (index === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  }
  ctx.closePath();
};

const getFrameSequenceProgress = (plan: FramePlan, frameIndex: number) =>
  plan.frameCount <= 1 ? 1 : frameIndex / Math.max(1, plan.frameCount - 1);

const getWindowProgress = (progress: number, start: number, end: number) =>
  clamp((progress - start) / Math.max(0.0001, end - start), 0, 1);

const resolveEffectPhaseForFrame = (plan: FramePlan, frameIndex: number): FrameEffectPhase => {
  if (plan.effectPhaseExplicit || plan.frameCount <= 1) {
    return plan.effectPhase;
  }

  const progress = getFrameSequenceProgress(plan, frameIndex);

  if (plan.effectType === "explosion") {
    if (progress < 0.12) return "build";
    if (progress < 0.24) return "ignite";
    if (progress < 0.42) return "blast";
    if (progress < 0.56) return "peak";
    if (progress < 0.72) return "breakup";
    if (progress < 0.88) return "smoke";
    return "fade";
  }

  if (plan.effectType === "lightning") {
    if (progress < 0.12) return "build";
    if (progress < 0.24) return "ignite";
    if (progress < 0.4) return "blast";
    if (progress < 0.58) return "peak";
    return "fade";
  }

  if (plan.effectType === "shockwave") {
    if (progress < 0.2) return "build";
    if (progress < 0.52) return "blast";
    if (progress < 0.78) return "peak";
    return "fade";
  }

  if (plan.effectType === "smoke") {
    if (progress < 0.16) return "build";
    if (progress < 0.76) return "smoke";
    return "fade";
  }

  return "none";
};

const getEffectPlacement = ({
  width,
  height,
  plan,
  workspaceContext,
  frameIndex,
}: {
  width: number;
  height: number;
  plan: FramePlan;
  workspaceContext: DrawingAiWorkspaceContext | null | undefined;
  frameIndex: number;
}) => {
  const basePlacement = resolvePlacement(width, height, plan, workspaceContext);
  const phase = resolveEffectPhaseForFrame(plan, frameIndex);
  const progress = getFrameSequenceProgress(plan, frameIndex);
  let x = basePlacement.x;
  let y = basePlacement.y;
  let scale = plan.scale;

  if (plan.effectType === "explosion") {
    const lateralBias = seededSignedForPlan(plan, 1.7);
    const riseBias = seededSignedForPlan(plan, 2.4);
    x = plan.centerLock ? width * 0.5 : basePlacement.x;
    y = plan.centerLock ? height * 0.68 : Math.min(height * 0.74, basePlacement.y + height * 0.08);
    if (!plan.centerLock) {
      x += width * lateralBias * (0.014 + plan.expansionStrength * 0.018);
    }
    if (phase === "build") scale *= 0.46;
    if (phase === "ignite") scale *= 0.64;
    if (phase === "blast") scale *= 1.18;
    if (phase === "peak") scale *= 1.36;
    if (phase === "breakup") scale *= 1.22;
    if (phase === "smoke") {
      const smokeProgress = getWindowProgress(progress, 0.72, 0.88);
      scale *= lerp(1.08, 1.18, smokeProgress);
      y -= height * lerp(0.04, 0.1, smokeProgress);
    }
    if (phase === "fade") {
      const fadeProgress = getWindowProgress(progress, 0.88, 1);
      scale *= lerp(0.98, 0.7, fadeProgress);
      y -= height * lerp(0.06, 0.12, fadeProgress);
    }
    y -= height * Math.max(0, riseBias) * (phase === "blast" || phase === "peak" ? 0.018 : 0.008);
  } else if (plan.effectType === "lightning") {
    const strikeLean = seededSignedForPlan(plan, 3.1);
    const fadeProgress = phase === "fade" ? getWindowProgress(progress, 0.58, 1) : 0;
    x = (plan.centerLock ? width * 0.5 : basePlacement.x) + width * strikeLean * 0.018;
    y = (plan.centerLock ? height * 0.42 : basePlacement.y) - (phase === "fade" ? height * (0.02 + fadeProgress * 0.05) : 0);
    scale *=
      phase === "build"
        ? 0.7
        : phase === "ignite"
          ? 0.9
          : phase === "peak"
          ? 1.08
          : phase === "fade"
              ? lerp(0.44, 0.05, fadeProgress)
              : 1;
  } else if (plan.effectType === "smoke") {
    x = plan.centerLock ? width * 0.5 : basePlacement.x;
    y = plan.centerLock ? height * 0.62 : basePlacement.y;
    y -= Math.sin(progress * Math.PI) * height * 0.04;
    scale *= 0.96 + progress * 0.28;
  } else if (plan.effectType === "shockwave") {
    x = plan.centerLock ? width * 0.5 : basePlacement.x;
    y = Math.min(height * 0.78, basePlacement.y + height * 0.14);
    scale *= 0.92 + progress * 0.44;
  }

  return { x, y, scale, phase };
};

const getEffectFrameRadius = (plan: FramePlan, placementScale: number, phase: FrameEffectPhase) => {
  if (plan.effectType === "lightning") {
    const widthBias = 1 + seededSignedForPlan(plan, 4.7) * 0.14;
    const heightBias = 1 + seededSignedForPlan(plan, 5.4) * 0.12;
    const widthScale = phase === "build" ? 0.46 : phase === "ignite" ? 0.72 : phase === "peak" ? 1.04 : phase === "fade" ? 0.18 : 0.88;
    const heightScale = phase === "build" ? 0.48 : phase === "ignite" ? 0.78 : phase === "peak" ? 1.02 : phase === "fade" ? 0.16 : 0.92;
    return {
      radiusX: 92 * placementScale * widthScale * widthBias,
      radiusY: 228 * placementScale * heightScale * heightBias,
    };
  }
  if (plan.effectType === "smoke") {
    return { radiusX: 116 * placementScale, radiusY: 84 * placementScale };
  }
  if (plan.effectType === "shockwave") {
    const multiplier = phase === "fade" ? 1.56 : phase === "peak" ? 1.34 : 1.1;
    return { radiusX: 160 * placementScale * multiplier, radiusY: 44 * placementScale * multiplier };
  }

  const phaseScale =
    phase === "build"
      ? 0.24
      : phase === "ignite"
        ? 0.46
        : phase === "blast"
          ? 1.24
          : phase === "peak"
            ? 1.52
            : phase === "breakup"
              ? 1.18
              : phase === "smoke"
                ? 0.92
                : 0.56;
  const lateralStretch = 1 + seededSignedForPlan(plan, 6.1) * (0.12 + plan.expansionStrength * 0.08);
  const verticalStretch = 1 + seededSignedForPlan(plan, 6.8) * (0.1 + plan.breakupAmount * 0.06);
  return {
    radiusX: 108 * placementScale * (0.92 + plan.expansionStrength * 0.44) * phaseScale * lateralStretch,
    radiusY: 90 * placementScale * (0.88 + plan.expansionStrength * 0.38) * phaseScale * verticalStretch,
  };
};

const drawExplosionEffect = (
  ctx: CanvasRenderingContext2D,
  plan: FramePlan,
  placement: { x: number; y: number; scale: number; phase: FrameEffectPhase },
  frameIndex: number,
  alphaMultiplier = 1,
) => {
  const phase = placement.phase;
  const palette = getEffectPalette(plan, frameIndex);
  const progress = getFrameSequenceProgress(plan, frameIndex);
  const { radiusX, radiusY } = getEffectFrameRadius(plan, placement.scale, phase);
  const phaseAlphaMultiplier =
    phase === "build"
      ? 0.84
      : phase === "ignite"
        ? 0.98
        : phase === "blast"
          ? 1
          : phase === "peak"
            ? 1
            : phase === "breakup"
              ? 0.9
              : phase === "smoke"
                ? 0.72
                : 0.5;
  const effectiveAlpha = clamp(alphaMultiplier * phaseAlphaMultiplier, 0, 1);
  const glowRadius = Math.max(radiusX, radiusY) * (1.34 + plan.glowStrength * 0.46);
  const glowGradient = ctx.createRadialGradient(placement.x, placement.y, glowRadius * 0.08, placement.x, placement.y, glowRadius);
  glowGradient.addColorStop(0, rgba(palette.core, clamp((0.34 + plan.glowStrength * 0.28) * effectiveAlpha, 0, 1)));
  glowGradient.addColorStop(0.45, rgba(palette.base, clamp((0.18 + plan.glowStrength * 0.16) * effectiveAlpha, 0, 1)));
  glowGradient.addColorStop(1, rgba(palette.base, 0));
  ctx.save();
  ctx.fillStyle = glowGradient;
  ctx.beginPath();
  ctx.arc(placement.x, placement.y, glowRadius, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  const burstRotation = seededSignedForPlan(plan, 7.5) * 0.18;
  const coreOffsetX = radiusX * seededSignedForPlan(plan, 8.2) * 0.12;
  const coreOffsetY = radiusY * seededSignedForPlan(plan, 8.9) * 0.08;
  const burstPointCount = 24 + Math.round(seededUnitForPlan(plan, 9.6) * 8);
  const innerBurstPointCount = 14 + Math.round(seededUnitForPlan(plan, 10.3) * 6);
  const familySeed = plan.variationSeed * 0.0011;

  if (phase === "blast" || phase === "peak") {
    const streakCount = Math.max(6, Math.round(6 + plan.expansionStrength * 6 + seededUnitForPlan(plan, 11.1) * 2));
    ctx.save();
    ctx.strokeStyle = rgba(mixColors(palette.core, "#fff7d8", 0.24), clamp((0.22 + plan.spikeSharpness * 0.18) * effectiveAlpha, 0, 1));
    ctx.lineWidth = Math.max(1.5, 2.2 * placement.scale);
    for (let index = 0; index < streakCount; index += 1) {
      const angle =
        burstRotation +
        -Math.PI * 0.95 +
        (Math.PI * 1.9 * index) / Math.max(1, streakCount - 1) +
        seededSignedForPlan(plan, 12.2 + index) * 0.08;
      const inner = Math.max(radiusX, radiusY) * (0.74 + seededUnit(index * 3.7 + frameIndex + familySeed) * 0.16);
      const outer = inner * (1.28 + seededUnit(index * 9.1 + frameIndex * 1.8 + familySeed) * 0.22);
      ctx.beginPath();
      ctx.moveTo(placement.x + Math.cos(angle) * inner, placement.y + Math.sin(angle) * inner * 0.86);
      ctx.lineTo(placement.x + Math.cos(angle) * outer, placement.y + Math.sin(angle) * outer * 0.9);
      ctx.stroke();
    }
    ctx.restore();
  }

  ctx.save();
  ctx.translate(placement.x, placement.y);
  ctx.rotate(burstRotation);
  buildIrregularBurstPath({
    ctx,
    radiusX,
    radiusY,
    pointCount: burstPointCount,
    seed: frameIndex + plan.spikeSharpness * 17 + familySeed,
    jaggedness: plan.spikeSharpness * 1.04,
    lobeBias: 0.32 + plan.breakupAmount * 0.38,
  });
  const shellGradient = ctx.createRadialGradient(0, 0, Math.max(radiusX, radiusY) * 0.1, 0, 0, Math.max(radiusX, radiusY));
  shellGradient.addColorStop(0, rgba(palette.core, clamp((0.52 + plan.coreIntensity * 0.22) * effectiveAlpha, 0, 1)));
  shellGradient.addColorStop(0.42, rgba(palette.base, clamp((0.54 + plan.coreIntensity * 0.12) * effectiveAlpha, 0, 1)));
  shellGradient.addColorStop(1, rgba(mixColors(palette.base, "#2f1b10", 0.42), clamp((0.42 + plan.breakupAmount * 0.14) * effectiveAlpha, 0, 1)));
  ctx.fillStyle = shellGradient;
  ctx.strokeStyle = rgba(mixColors(palette.base, "#ffffff", 0.12), clamp((0.32 + plan.spikeSharpness * 0.18) * effectiveAlpha, 0, 1));
  ctx.lineWidth = Math.max(2, 3 * placement.scale);
  ctx.fill();
  ctx.stroke();

  ctx.save();
  ctx.translate(coreOffsetX, coreOffsetY);
  buildIrregularBurstPath({
    ctx,
    radiusX: radiusX * (0.42 + plan.coreIntensity * 0.16),
    radiusY: radiusY * (0.38 + plan.coreIntensity * 0.14),
    pointCount: innerBurstPointCount,
    seed: frameIndex + 91 + familySeed,
    jaggedness: plan.spikeSharpness * 0.28,
    lobeBias: 0.18 + plan.coreIntensity * 0.16,
  });
  ctx.fillStyle = rgba(palette.core, clamp((0.64 + plan.coreIntensity * 0.2) * effectiveAlpha, 0, 1));
  ctx.fill();
  ctx.restore();

  if (phase === "breakup" || phase === "smoke" || phase === "fade") {
    const fragmentCount = Math.max(5, Math.round(7 + plan.debrisLevel * 12 + seededUnitForPlan(plan, 13.4) * 3));
    ctx.fillStyle = rgba(palette.fragment, clamp((0.3 + plan.debrisLevel * 0.28) * effectiveAlpha, 0, 1));
    for (let index = 0; index < fragmentCount; index += 1) {
      const angle = burstRotation + ((Math.PI * 2) / fragmentCount) * index + seededUnit(frameIndex * 31 + index * 9 + familySeed) * 0.28;
      const distance = Math.max(radiusX, radiusY) * (0.72 + seededUnit(index * 4.2 + frameIndex + familySeed) * (0.62 + plan.breakupAmount * 0.4));
      const size = (4 + seededUnit(index * 11.4 + frameIndex * 2.7 + familySeed) * 11) * placement.scale * (0.74 + plan.debrisLevel * 0.64);
      ctx.beginPath();
      ctx.arc(Math.cos(angle) * distance, Math.sin(angle) * distance * 0.8, size, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();

  if (
    phase === "breakup" ||
    phase === "smoke" ||
    phase === "fade" ||
    (phase === "peak" && plan.smokeDensity > 0.7)
  ) {
    const smokeCount = Math.max(5, Math.round(5 + plan.smokeDensity * 10 + seededUnitForPlan(plan, 14.1) * 3));
    ctx.save();
    ctx.fillStyle = rgba(mixColors(palette.base, "#5e6670", 0.62), clamp((0.12 + plan.smokeDensity * 0.18) * effectiveAlpha, 0, 1));
    ctx.strokeStyle = rgba(mixColors(palette.base, "#40454e", 0.54), clamp((0.12 + plan.smokeDensity * 0.16) * effectiveAlpha, 0, 1));
    ctx.lineWidth = Math.max(1.5, 2.4 * placement.scale);
    for (let index = 0; index < smokeCount; index += 1) {
      const angle = burstRotation + ((Math.PI * 2) / smokeCount) * index + seededUnit(index * 8.1 + frameIndex * 1.7 + familySeed) * 0.4;
      const distance = Math.max(radiusX, radiusY) * (0.78 + seededUnit(index * 3.4 + frameIndex * 5.1 + familySeed) * 0.62);
      const puffX = placement.x + Math.cos(angle) * distance;
      const puffY = placement.y + Math.sin(angle) * distance * 0.72 - heightAdjustmentForSmoke(phase, placement.scale);
      const puffRadiusX = (20 + seededUnit(index * 12.7 + frameIndex * 2.3 + familySeed) * 38) * placement.scale * (0.74 + plan.smokeDensity * 0.52);
      const puffRadiusY = (14 + seededUnit(index * 7.8 + frameIndex * 3.1 + familySeed) * 32) * placement.scale * (0.72 + plan.smokeDensity * 0.46);
      ctx.beginPath();
      ctx.ellipse(puffX, puffY, puffRadiusX, puffRadiusY, seededUnit(index * 2.3 + frameIndex + familySeed) * 0.8 - 0.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();
  }

  if (phase === "smoke" || phase === "fade") {
    const plumeProgress = phase === "smoke" ? getWindowProgress(progress, 0.72, 0.88) : getWindowProgress(progress, 0.88, 1);
    const plumeColor = mixColors(palette.base, "#5a616a", 0.7);
    const capY = placement.y - radiusY * (0.92 + plumeProgress * 0.4);
    const capRadiusX = radiusX * (0.88 + plumeProgress * 0.22);
    const capRadiusY = radiusY * (0.56 + plumeProgress * 0.16);
    const stemY = placement.y - radiusY * (0.26 + plumeProgress * 0.16);
    const stemRadiusX = radiusX * (0.18 + plan.smokeDensity * 0.08);
    const stemRadiusY = radiusY * (0.48 + plumeProgress * 0.14);
    ctx.save();
    ctx.fillStyle = rgba(plumeColor, clamp((0.16 + plan.smokeDensity * 0.18) * effectiveAlpha, 0, 1));
    ctx.strokeStyle = rgba(mixColors(plumeColor, "#2d3137", 0.26), clamp((0.12 + plan.smokeDensity * 0.12) * effectiveAlpha, 0, 1));
    ctx.lineWidth = Math.max(1.5, 2.1 * placement.scale);
    ctx.beginPath();
    ctx.ellipse(placement.x, capY, capRadiusX, capRadiusY, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(placement.x, stemY, stemRadiusX, stemRadiusY, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  if (plan.hasShockwaveOverlay || plan.effectType === "shockwave") {
    drawShockwaveEffect(ctx, plan, {
      x: placement.x,
      y: placement.y + radiusY * 0.22,
      scale: placement.scale * (0.94 + plan.expansionStrength * 0.18),
      phase,
    }, frameIndex, effectiveAlpha);
  }
};

const heightAdjustmentForSmoke = (phase: FrameEffectPhase, scale: number) => {
  if (phase === "smoke") return 18 * scale;
  if (phase === "fade") return 24 * scale;
  return 10 * scale;
};

const drawLightningEffect = (
  ctx: CanvasRenderingContext2D,
  plan: FramePlan,
  placement: { x: number; y: number; scale: number; phase: FrameEffectPhase },
  frameIndex: number,
  alphaMultiplier = 1,
) => {
  const palette = getEffectPalette(plan, frameIndex);
  const { radiusX, radiusY } = getEffectFrameRadius(plan, placement.scale, placement.phase);
  const phase = placement.phase;
  const progress = getFrameSequenceProgress(plan, frameIndex);
  const fadeProgress = phase === "fade" ? getWindowProgress(progress, 0.58, 1) : 0;
  const strikeLean = seededSignedForPlan(plan, 15.3);
  const branchBias = seededSignedForPlan(plan, 16.1);
  const branchDensityBias = Math.round(seededUnitForPlan(plan, 16.8) * 2);
  const segmentCount =
    phase === "peak"
      ? 8 + branchDensityBias
      : phase === "blast"
        ? 7 + Math.max(0, branchDensityBias - 1)
        : phase === "ignite"
          ? 6
          : phase === "build"
            ? 4
            : fadeProgress > 0.55
              ? 2
              : 3;
  const startY = -radiusY;
  const endY = phase === "fade" ? lerp(radiusY * 0.48, radiusY * 0.14, fadeProgress) : radiusY;
  const sway =
    radiusX *
    (phase === "build"
      ? 0.34
      : phase === "ignite"
        ? 0.48
        : phase === "fade"
          ? lerp(0.18, 0.06, fadeProgress)
          : 0.62) *
    (0.88 + seededUnitForPlan(plan, 17.5) * 0.34);
  const horizontalTravel = radiusX * strikeLean * 0.32;
  const points = Array.from({ length: segmentCount }, (_, index) => {
    if (index === 0) {
      return { x: -radiusX * 0.06 + horizontalTravel * 0.18, y: startY };
    }
    const t = index / Math.max(1, segmentCount - 1);
    const noise = seededUnit(frameIndex * 7.7 + index * 2.1 + plan.variationSeed * 0.0009) - 0.5;
    const travelOffset = horizontalTravel * (0.28 + t * 0.72);
    const x = travelOffset + noise * sway * (index % 2 === 0 ? 1.18 : 0.82);
    const y = lerp(startY, endY, t);
    return { x, y };
  });
  const branchAlpha = phase === "fade" ? 0.12 * (1 - fadeProgress) : phase === "build" ? 0.24 : 0.42;
  const glowAlpha = clamp(
    alphaMultiplier *
      (phase === "build"
        ? 0.18
        : phase === "ignite"
          ? 0.32
          : phase === "blast"
            ? 0.46
            : phase === "peak"
              ? 0.54
              : lerp(0.16, 0.04, fadeProgress)),
    0,
    1,
  );
  const coreAlpha = clamp(
    alphaMultiplier *
      (phase === "build"
        ? 0.56
        : phase === "ignite"
          ? 0.78
          : phase === "blast"
            ? 0.9
            : phase === "peak"
              ? 0.96
              : lerp(0.34, 0.08, fadeProgress)),
    0,
    1,
  );

  const drawPolyline = (lineWidth: number, strokeStyle: string) => {
    ctx.beginPath();
    ctx.moveTo(points[0]!.x, points[0]!.y);
    for (let index = 1; index < points.length; index += 1) {
      ctx.lineTo(points[index]!.x, points[index]!.y);
    }
    ctx.strokeStyle = strokeStyle;
    ctx.lineWidth = lineWidth;
    ctx.stroke();
  };

  ctx.save();
  ctx.translate(placement.x, placement.y);
  ctx.lineCap = phase === "build" ? "butt" : "square";
  ctx.lineJoin = "miter";
  drawPolyline(
    Math.max(3.5, (phase === "fade" ? 5.5 : 7.5) * placement.scale * (phase === "fade" ? lerp(1, 0.42, fadeProgress) : 1)),
    rgba(palette.base, glowAlpha),
  );
  drawPolyline(
    Math.max(1.4, (phase === "fade" ? 2 : 2.8) * placement.scale * (phase === "fade" ? lerp(1, 0.38, fadeProgress) : 1)),
    rgba(palette.core, coreAlpha),
  );
  drawPolyline(
    Math.max(0.8, (phase === "fade" ? 1.1 : 1.5) * placement.scale * (phase === "fade" ? lerp(1, 0.34, fadeProgress) : 1)),
    rgba("#ffffff", clamp(coreAlpha * 0.92, 0, 1)),
  );

  if (phase !== "fade" || fadeProgress < 0.15) {
    ctx.strokeStyle = rgba(palette.fragment, clamp(branchAlpha * alphaMultiplier, 0, 1));
    ctx.lineWidth = Math.max(1.5, 2.4 * placement.scale);
    const candidateBranchIndexes = [...new Set([
      1,
      Math.max(1, Math.floor((points.length - 1) * 0.38)),
      Math.max(1, Math.floor((points.length - 1) * 0.62)),
      Math.max(1, points.length - 2),
    ])].filter((index) => index > 0 && index < points.length);
    const branchIndexes =
      phase === "build"
        ? candidateBranchIndexes.slice(0, 1)
        : phase === "ignite"
          ? candidateBranchIndexes.slice(0, 2)
          : candidateBranchIndexes.slice(0, Math.min(candidateBranchIndexes.length, 3 + branchDensityBias));
    branchIndexes.forEach((branchIndex, offsetIndex) => {
      const anchor = points[Math.min(branchIndex, points.length - 2)];
      const angleDirection = offsetIndex % 2 === 0 ? 1 : -1;
      const branchLength =
        radiusX *
        (phase === "peak" ? 0.42 : 0.3) *
        (1 - offsetIndex * 0.08) *
        (0.9 + seededUnitForPlan(plan, 18.7 + offsetIndex) * 0.3);
      ctx.beginPath();
      ctx.moveTo(anchor!.x, anchor!.y);
      ctx.lineTo(
        anchor!.x + branchLength * angleDirection,
        anchor!.y + radiusY * (0.08 + offsetIndex * 0.06 + branchBias * 0.04),
      );
      ctx.stroke();
    });
  }
  ctx.restore();
};

const drawSmokeEffect = (
  ctx: CanvasRenderingContext2D,
  plan: FramePlan,
  placement: { x: number; y: number; scale: number; phase: FrameEffectPhase },
  frameIndex: number,
  alphaMultiplier = 1,
) => {
  const palette = getEffectPalette(plan, frameIndex);
  const { radiusX, radiusY } = getEffectFrameRadius(plan, placement.scale, placement.phase);
  const puffCount = Math.max(5, Math.round(5 + plan.smokeDensity * 8));
  ctx.save();
  ctx.fillStyle = rgba(mixColors(palette.base, "#8a949e", 0.16), clamp((0.18 + plan.smokeDensity * 0.18) * alphaMultiplier, 0, 1));
  ctx.strokeStyle = rgba(mixColors(palette.base, "#424951", 0.52), clamp((0.16 + plan.smokeDensity * 0.14) * alphaMultiplier, 0, 1));
  ctx.lineWidth = Math.max(1.5, 2.6 * placement.scale);
  for (let index = 0; index < puffCount; index += 1) {
    const angle = ((Math.PI * 2) / puffCount) * index + seededUnit(frameIndex * 3.8 + index * 2.9) * 0.4;
    const distance = Math.min(radiusX, radiusY) * (0.2 + seededUnit(index * 4.6 + frameIndex * 1.8) * 0.72);
    const puffX = placement.x + Math.cos(angle) * distance;
    const puffY = placement.y + Math.sin(angle) * distance * 0.62 - heightAdjustmentForSmoke(placement.phase, placement.scale);
    const puffRadiusX = (18 + seededUnit(index * 6.2 + frameIndex * 2.2) * 28) * placement.scale;
    const puffRadiusY = (12 + seededUnit(index * 9.1 + frameIndex * 3.4) * 24) * placement.scale;
    ctx.beginPath();
    ctx.ellipse(puffX, puffY, puffRadiusX, puffRadiusY, seededUnit(index * 1.9) * 0.8 - 0.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
};

const drawShockwaveEffect = (
  ctx: CanvasRenderingContext2D,
  plan: FramePlan,
  placement: { x: number; y: number; scale: number; phase: FrameEffectPhase },
  frameIndex: number,
  alphaMultiplier = 1,
) => {
  const palette = getEffectPalette(plan, frameIndex);
  const { radiusX, radiusY } = getEffectFrameRadius({ ...plan, effectType: "shockwave" }, placement.scale, placement.phase);
  const ringWidth = Math.max(3, 6 * placement.scale * (0.84 + plan.impactStrength * 0.2));
  ctx.save();
  ctx.strokeStyle = rgba(palette.base, clamp((0.3 + plan.expansionStrength * 0.22) * alphaMultiplier, 0, 1));
  ctx.lineWidth = ringWidth;
  ctx.beginPath();
  ctx.ellipse(placement.x, placement.y, radiusX, radiusY, 0, Math.PI, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = rgba(palette.core, clamp((0.18 + plan.glowStrength * 0.08) * alphaMultiplier, 0, 1));
  ctx.lineWidth = Math.max(1.5, ringWidth * 0.4);
  ctx.beginPath();
  ctx.ellipse(placement.x, placement.y - radiusY * 0.08, radiusX * 0.82, radiusY * 0.6, 0, Math.PI, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
};

const renderEffect = (
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  plan: FramePlan,
  workspaceContext: DrawingAiWorkspaceContext | null | undefined,
  frameIndex: number,
) => {
  const placement = getEffectPlacement({ width, height, plan, workspaceContext, frameIndex });
  if (plan.effectType === "lightning") {
    drawLightningEffect(ctx, plan, placement, frameIndex);
    return;
  }
  if (plan.effectType === "smoke") {
    drawSmokeEffect(ctx, plan, placement, frameIndex);
    return;
  }
  if (plan.effectType === "shockwave") {
    drawShockwaveEffect(ctx, plan, placement, frameIndex);
    return;
  }

  drawExplosionEffect(ctx, plan, placement, frameIndex);
};

const drawExplosionOverlay = (
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  plan: FramePlan,
  frameIndex: number,
) => {
  const overlayPlan: FramePlan = {
    ...plan,
    subjectType: "effect",
    effectType: "explosion",
    effectPhase: resolveEffectPhaseForFrame({ ...plan, subjectType: "effect", effectType: "explosion" }, frameIndex),
    effectPhaseExplicit: plan.effectPhaseExplicit || false,
  };
  drawExplosionEffect(
    ctx,
    overlayPlan,
    {
      x: width * (plan.facing === "left" ? 0.62 : 0.38),
      y: height * 0.68,
      scale: Math.max(0.7, plan.scale * 0.86),
      phase: resolveEffectPhaseForFrame(overlayPlan, frameIndex),
    },
    frameIndex,
    0.82,
  );
};

const drawSmokeOverlay = (
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  plan: FramePlan,
  frameIndex: number,
) => {
  drawSmokeEffect(
    ctx,
    {
      ...plan,
      subjectType: "effect",
      effectType: "smoke",
      effectPhase: "smoke",
      effectPhaseExplicit: true,
      smokeDensity: Math.max(plan.smokeDensity, 0.74),
    },
    {
      x: width * (plan.facing === "left" ? 0.56 : 0.44),
      y: height * 0.7,
      scale: Math.max(0.72, plan.scale * 0.84),
      phase: frameIndex === plan.frameCount - 1 ? "fade" : "smoke",
    },
    frameIndex,
    0.74,
  );
};

const drawShockwaveOverlay = (
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  plan: FramePlan,
  frameIndex: number,
) => {
  drawShockwaveEffect(
    ctx,
    {
      ...plan,
      subjectType: "effect",
      effectType: "shockwave",
      effectPhase: frameIndex === plan.frameCount - 1 ? "fade" : frameIndex > 0 ? "peak" : "blast",
      effectPhaseExplicit: true,
    },
    {
      x: width * 0.5,
      y: height * 0.76,
      scale: Math.max(0.74, plan.scale * 0.92),
      phase: frameIndex === plan.frameCount - 1 ? "fade" : frameIndex > 0 ? "peak" : "blast",
    },
    frameIndex,
    0.8,
  );
};

const drawBackgroundOverlay = (
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  plan: FramePlan,
  frameIndex: number,
) => {
  if (!plan.backgroundOverlayShape) {
    return;
  }

  const panOffset = plan.backgroundScroll ? frameIndex * Math.max(18, width * 0.03) : 0;
  const overlayLeft = -width * 0.3;
  const overlayWidth = width * 1.9;
  const overlayRight = overlayLeft + overlayWidth;

  ctx.save();
  ctx.translate(-panOffset, 0);

  if (plan.backgroundOverlayShape === "plain-landscape" || plan.backgroundOverlayShape === "mountain") {
    ctx.fillStyle = rgba("#d8e3f0", 0.55);
    ctx.fillRect(overlayLeft, 0, overlayWidth, height);

    ctx.fillStyle = rgba("#8da0b5", 0.55);
    ctx.beginPath();
    ctx.moveTo(overlayLeft, height * 0.72);
    ctx.lineTo(overlayLeft + overlayWidth * 0.12, height * 0.48);
    ctx.lineTo(overlayLeft + overlayWidth * 0.24, height * 0.66);
    ctx.lineTo(overlayLeft + overlayWidth * 0.42, height * 0.4);
    ctx.lineTo(overlayLeft + overlayWidth * 0.58, height * 0.7);
    ctx.lineTo(overlayLeft + overlayWidth * 0.76, height * 0.46);
    ctx.lineTo(overlayLeft + overlayWidth * 0.9, height * 0.7);
    ctx.lineTo(overlayLeft + overlayWidth * 1.02, height * 0.44);
    ctx.lineTo(overlayRight, height * 0.72);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = rgba("#7aa06c", 0.42);
    ctx.fillRect(overlayLeft, height * 0.7, overlayWidth, height * 0.34);
  }

  if (plan.backgroundOverlayShape === "city-background") {
    ctx.fillStyle = "rgba(8, 12, 24, 0.3)";
    ctx.fillRect(overlayLeft, 0, overlayWidth, height);

    const skylineHeights = [0.24, 0.34, 0.28, 0.42, 0.31, 0.48, 0.26, 0.38];
    let cursorX = overlayLeft;
    let index = 0;
    while (cursorX < overlayRight + width * 0.12) {
      const skylineHeight = skylineHeights[index % skylineHeights.length]!;
      const buildingWidth = width * (index % 2 === 0 ? 0.12 : 0.09);
      const buildingHeight = height * skylineHeight;
      ctx.fillStyle = rgba(index % 2 === 0 ? "#141c2f" : "#1e2940", 0.86);
      ctx.fillRect(cursorX, height * 0.72 - buildingHeight, buildingWidth, buildingHeight);
      ctx.fillStyle = rgba("#f1d78a", 0.36);
      for (let row = 0; row < 4; row += 1) {
        for (let col = 0; col < 2; col += 1) {
          const windowX = cursorX + buildingWidth * (0.18 + col * 0.34);
          const windowY = height * 0.72 - buildingHeight + 12 + row * 18;
          ctx.fillRect(windowX, windowY, Math.max(2, buildingWidth * 0.1), 8);
        }
      }
      cursorX += buildingWidth + width * 0.02;
      index += 1;
    }
  }

  if (plan.backgroundOverlayShape === "room-background" || plan.backgroundOverlayShape === "hallway-background") {
    ctx.fillStyle = rgba(plan.backgroundOverlayShape === "hallway-background" ? "#cfd8e4" : "#ddd5c8", 0.34);
    ctx.fillRect(overlayLeft, 0, overlayWidth, height);

    ctx.strokeStyle = rgba("#1a2233", 0.35);
    ctx.lineWidth = Math.max(2, Math.min(width, height) * 0.004);
    const leftWall = overlayLeft + overlayWidth * 0.18;
    const centerPoint = overlayLeft + overlayWidth * 0.5;
    const rightWall = overlayLeft + overlayWidth * 0.82;
    ctx.beginPath();
    ctx.moveTo(leftWall, height * 0.26);
    ctx.lineTo(centerPoint, height * 0.18);
    ctx.lineTo(rightWall, height * 0.26);
    ctx.moveTo(leftWall, height * 0.26);
    ctx.lineTo(leftWall, height * 0.78);
    ctx.lineTo(rightWall, height * 0.78);
    ctx.lineTo(rightWall, height * 0.26);
    ctx.stroke();
  }

  ctx.restore();
};

const renderSimpleObject = (
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  plan: FramePlan,
  workspaceContext: DrawingAiWorkspaceContext | null | undefined,
  frameIndex: number,
) => {
  const placement = getObjectSequencePlacement(width, height, plan, workspaceContext, frameIndex);
  const resolvedMotionBeat = resolveMotionBeatForFrame(plan, frameIndex);
  const palette = getObjectPalette(plan, frameIndex);
  const { radiusX, radiusY } = getObjectFrameRadius(plan, placement.scale);
  const drawRadiusX = radiusX * placement.scaleX;
  const drawRadiusY = radiusY * placement.scaleY;

  ctx.save();
  ctx.translate(placement.x, placement.y);
  ctx.rotate(placement.rotation);
  ctx.strokeStyle = palette.stroke;
  ctx.fillStyle = palette.fill;
  ctx.lineWidth = Math.max(3, 4 * placement.scale);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  if (plan.objectShape === "lightning") {
    ctx.strokeStyle = frameIndex === 2 ? rgba(palette.stroke, 0.6) : palette.stroke;
    ctx.lineWidth = Math.max(4, 5 * placement.scale);
    ctx.beginPath();
    ctx.moveTo(-drawRadiusX * 0.14, -drawRadiusY);
    ctx.lineTo(drawRadiusX * 0.12, -drawRadiusY * 0.58);
    ctx.lineTo(-drawRadiusX * 0.2, -drawRadiusY * 0.14);
    ctx.lineTo(drawRadiusX * 0.2, drawRadiusY * 0.16);
    ctx.lineTo(-drawRadiusX * 0.06, drawRadiusY);
    ctx.stroke();

    ctx.strokeStyle = rgba(palette.accent, 0.74);
    ctx.lineWidth = Math.max(2, 3 * placement.scale);
    ctx.beginPath();
    ctx.moveTo(drawRadiusX * 0.06, -drawRadiusY * 0.26);
    ctx.lineTo(drawRadiusX * 0.46, -drawRadiusY * 0.02);
    ctx.moveTo(-drawRadiusX * 0.08, drawRadiusY * 0.12);
    ctx.lineTo(-drawRadiusX * 0.42, drawRadiusY * 0.42);
    ctx.stroke();

    if (frameIndex === 1) {
      ctx.strokeStyle = palette.shadow;
      ctx.lineWidth = Math.max(8, 10 * placement.scale);
      ctx.beginPath();
      ctx.moveTo(-drawRadiusX * 0.14, -drawRadiusY);
      ctx.lineTo(drawRadiusX * 0.12, -drawRadiusY * 0.58);
      ctx.lineTo(-drawRadiusX * 0.2, -drawRadiusY * 0.14);
      ctx.lineTo(drawRadiusX * 0.2, drawRadiusY * 0.16);
      ctx.lineTo(-drawRadiusX * 0.06, drawRadiusY);
      ctx.stroke();
    }
  } else if (plan.objectShape === "smoke-cloud") {
    const drift = frameIndex === 0 ? -drawRadiusX * 0.08 : frameIndex === plan.frameCount - 1 ? drawRadiusX * 0.1 : 0;
    const puffs = [
      [-drawRadiusX * 0.48 + drift, drawRadiusY * 0.12, drawRadiusX * 0.42, drawRadiusY * 0.34],
      [0 + drift * 0.6, -drawRadiusY * 0.12, drawRadiusX * 0.58, drawRadiusY * 0.42],
      [drawRadiusX * 0.46 + drift, drawRadiusY * 0.08, drawRadiusX * 0.44, drawRadiusY * 0.32],
    ] as const;

    for (const [offsetX, offsetY, puffRadiusX, puffRadiusY] of puffs) {
      ctx.beginPath();
      ctx.ellipse(offsetX, offsetY, puffRadiusX, puffRadiusY, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
  } else if (plan.objectShape === "flame") {
    const flickerOffset = frameIndex === 1 ? drawRadiusX * 0.14 : frameIndex === 2 ? -drawRadiusX * 0.1 : 0;
    ctx.beginPath();
    ctx.moveTo(0, drawRadiusY);
    ctx.quadraticCurveTo(-drawRadiusX * 0.88, drawRadiusY * 0.26, -drawRadiusX * 0.24 + flickerOffset, -drawRadiusY * 0.12);
    ctx.quadraticCurveTo(drawRadiusX * 0.04 + flickerOffset, -drawRadiusY, drawRadiusX * 0.3 + flickerOffset, -drawRadiusY * 0.18);
    ctx.quadraticCurveTo(drawRadiusX * 0.94, drawRadiusY * 0.3, 0, drawRadiusY);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.strokeStyle = rgba(palette.accent, 0.82);
    ctx.fillStyle = palette.accentFill;
    ctx.beginPath();
    ctx.moveTo(0, drawRadiusY * 0.7);
    ctx.quadraticCurveTo(-drawRadiusX * 0.36, drawRadiusY * 0.08, -drawRadiusX * 0.08 + flickerOffset * 0.5, -drawRadiusY * 0.18);
    ctx.quadraticCurveTo(drawRadiusX * 0.03 + flickerOffset * 0.4, -drawRadiusY * 0.62, drawRadiusX * 0.12 + flickerOffset * 0.35, -drawRadiusY * 0.1);
    ctx.quadraticCurveTo(drawRadiusX * 0.34, drawRadiusY * 0.14, 0, drawRadiusY * 0.7);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  } else if (plan.objectShape === "rain") {
    const streakCount = 7;
    const fallOffset = (frameIndex / Math.max(1, plan.frameCount)) * drawRadiusY * 0.36;
    ctx.strokeStyle = palette.stroke;
    ctx.lineWidth = Math.max(2, 2.6 * placement.scale);
    for (let index = 0; index < streakCount; index += 1) {
      const normalized = index / Math.max(1, streakCount - 1);
      const x = -drawRadiusX + normalized * drawRadiusX * 2;
      const startY = -drawRadiusY + (index % 3) * drawRadiusY * 0.18 + fallOffset;
      const endY = startY + drawRadiusY * (0.34 + (index % 2) * 0.12);
      ctx.beginPath();
      ctx.moveTo(x, startY);
      ctx.lineTo(x - drawRadiusX * 0.08, endY);
      ctx.stroke();
    }
  } else if (plan.objectShape === "slash-arc") {
    const direction = plan.facing === "left" ? -1 : 1;
    ctx.strokeStyle = palette.stroke;
    ctx.lineWidth = Math.max(4, 5 * placement.scale);
    ctx.beginPath();
    ctx.arc(
      -direction * drawRadiusX * 0.12,
      drawRadiusY * 0.16,
      drawRadiusX * 0.92,
      direction === 1 ? Math.PI * 1.12 : Math.PI * 1.68,
      direction === 1 ? Math.PI * 1.86 : Math.PI * 1.32,
      direction === -1,
    );
    ctx.stroke();

    ctx.strokeStyle = rgba(palette.accent, frameIndex === 1 ? 0.9 : 0.58);
    ctx.lineWidth = Math.max(2, 3 * placement.scale);
    ctx.beginPath();
    ctx.arc(
      -direction * drawRadiusX * 0.08,
      drawRadiusY * 0.12,
      drawRadiusX * 0.72,
      direction === 1 ? Math.PI * 1.16 : Math.PI * 1.64,
      direction === 1 ? Math.PI * 1.82 : Math.PI * 1.36,
      direction === -1,
    );
    ctx.stroke();
  } else if (plan.objectShape === "hallway-background") {
    ctx.strokeStyle = `${plan.strokeColor}88`;
    ctx.lineWidth = Math.max(2, 3 * placement.scale);
    ctx.beginPath();
    ctx.moveTo(-width * 0.22, -height * 0.06);
    ctx.lineTo(0, -height * 0.18);
    ctx.lineTo(width * 0.22, -height * 0.06);
    ctx.moveTo(-width * 0.22, height * 0.18);
    ctx.lineTo(0, 0);
    ctx.lineTo(width * 0.22, height * 0.18);
    ctx.moveTo(-width * 0.34, -height * 0.22);
    ctx.lineTo(-width * 0.18, height * 0.22);
    ctx.moveTo(width * 0.34, -height * 0.22);
    ctx.lineTo(width * 0.18, height * 0.22);
    ctx.stroke();
  } else if (plan.objectShape === "room-background") {
    ctx.strokeStyle = rgba(palette.stroke, 0.82);
    ctx.lineWidth = Math.max(2, 3 * placement.scale);
    ctx.beginPath();
    ctx.moveTo(-width * 0.28, -height * 0.14);
    ctx.lineTo(0, -height * 0.06);
    ctx.lineTo(width * 0.28, -height * 0.14);
    ctx.moveTo(-width * 0.28, -height * 0.14);
    ctx.lineTo(-width * 0.28, height * 0.18);
    ctx.lineTo(0, height * 0.26);
    ctx.lineTo(width * 0.28, height * 0.18);
    ctx.lineTo(width * 0.28, -height * 0.14);
    ctx.moveTo(-width * 0.28, height * 0.18);
    ctx.lineTo(width * 0.28, height * 0.18);
    ctx.stroke();

    ctx.fillStyle = rgba("#0b0e14", 0.24);
    ctx.beginPath();
    ctx.rect(-width * 0.28, height * 0.18, width * 0.56, height * 0.08);
    ctx.fill();
  } else if (plan.objectShape === "concrete-cracks") {
    ctx.strokeStyle = rgba(palette.stroke, 0.9);
    ctx.lineWidth = Math.max(2, 3 * placement.scale);
    const originY = drawRadiusY * 0.22;
    const branches = [
      [0, originY, -drawRadiusX * 0.82, -drawRadiusY * 0.24],
      [0, originY, -drawRadiusX * 0.42, drawRadiusY * 0.34],
      [0, originY, drawRadiusX * 0.88, -drawRadiusY * 0.18],
      [0, originY, drawRadiusX * 0.38, drawRadiusY * 0.42],
      [0, originY, 0, -drawRadiusY * 0.72],
    ] as const;
    for (const [startX, startY, endX, endY] of branches) {
      ctx.beginPath();
      ctx.moveTo(startX, startY);
      ctx.lineTo(endX * 0.45, startY + endY * 0.35);
      ctx.lineTo(endX, endY);
      ctx.stroke();
    }
  } else if (plan.objectShape === "plain-landscape") {
    ctx.fillStyle = rgba("#89a86d", 0.42);
    ctx.beginPath();
    ctx.moveTo(-width * 0.34, drawRadiusY * 0.1);
    ctx.quadraticCurveTo(-width * 0.1, -drawRadiusY * 0.1, width * 0.08, drawRadiusY * 0.02);
    ctx.quadraticCurveTo(width * 0.26, drawRadiusY * 0.12, width * 0.34, drawRadiusY * 0.06);
    ctx.lineTo(width * 0.34, drawRadiusY * 0.42);
    ctx.lineTo(-width * 0.34, drawRadiusY * 0.42);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = rgba("#7d8ba0", 0.48);
    ctx.beginPath();
    ctx.moveTo(-width * 0.3, drawRadiusY * 0.02);
    ctx.lineTo(-width * 0.14, -drawRadiusY * 0.42);
    ctx.lineTo(-width * 0.02, drawRadiusY * 0.02);
    ctx.lineTo(width * 0.08, -drawRadiusY * 0.52);
    ctx.lineTo(width * 0.2, drawRadiusY * 0.02);
    ctx.lineTo(width * 0.3, -drawRadiusY * 0.34);
    ctx.lineTo(width * 0.42, drawRadiusY * 0.02);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  } else if (plan.objectShape === "city-background") {
    const buildingSpecs = [
      [-drawRadiusX * 1.18, drawRadiusX * 0.34, drawRadiusY * 0.82],
      [-drawRadiusX * 0.72, drawRadiusX * 0.28, drawRadiusY * 1.14],
      [-drawRadiusX * 0.32, drawRadiusX * 0.36, drawRadiusY * 0.92],
      [drawRadiusX * 0.14, drawRadiusX * 0.26, drawRadiusY * 1.26],
      [drawRadiusX * 0.52, drawRadiusX * 0.34, drawRadiusY * 0.98],
    ] as const;

    for (const [offsetX, widthScale, heightScale] of buildingSpecs) {
      ctx.fillStyle = rgba("#1b2438", 0.88);
      ctx.fillRect(offsetX, -heightScale * 0.74, widthScale, heightScale);
      ctx.strokeRect(offsetX, -heightScale * 0.74, widthScale, heightScale);
      ctx.fillStyle = rgba("#f2d77a", 0.36);
      for (let row = 0; row < 4; row += 1) {
        for (let col = 0; col < 2; col += 1) {
          ctx.fillRect(offsetX + widthScale * (0.18 + col * 0.28), -heightScale * 0.62 + row * 16, 6, 8);
        }
      }
    }
  } else if (plan.objectShape === "door") {
    ctx.beginPath();
    ctx.rect(-drawRadiusX * 0.72, -drawRadiusY, drawRadiusX * 1.44, drawRadiusY * 2);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(drawRadiusX * 0.4, 0, Math.max(2, 3 * placement.scale), 0, Math.PI * 2);
    ctx.fill();
  } else if (plan.objectShape === "pillar") {
    ctx.beginPath();
    ctx.rect(-drawRadiusX * 0.44, -drawRadiusY, drawRadiusX * 0.88, drawRadiusY * 2);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-drawRadiusX * 0.62, -drawRadiusY * 0.88);
    ctx.lineTo(drawRadiusX * 0.62, -drawRadiusY * 0.88);
    ctx.moveTo(-drawRadiusX * 0.68, drawRadiusY * 0.86);
    ctx.lineTo(drawRadiusX * 0.68, drawRadiusY * 0.86);
    ctx.stroke();
  } else if (plan.objectShape === "crystal") {
    ctx.beginPath();
    ctx.moveTo(0, -drawRadiusY);
    ctx.lineTo(drawRadiusX * 0.7, -drawRadiusY * 0.18);
    ctx.lineTo(drawRadiusX * 0.36, drawRadiusY);
    ctx.lineTo(-drawRadiusX * 0.36, drawRadiusY);
    ctx.lineTo(-drawRadiusX * 0.7, -drawRadiusY * 0.18);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, -drawRadiusY);
    ctx.lineTo(0, drawRadiusY);
    ctx.moveTo(-drawRadiusX * 0.18, 0);
    ctx.lineTo(drawRadiusX * 0.22, 0);
    ctx.stroke();
  } else if (plan.objectShape === "mushroom") {
    ctx.beginPath();
    ctx.moveTo(0, drawRadiusY);
    ctx.lineTo(0, drawRadiusY * 0.08);
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(0, -drawRadiusY * 0.12, drawRadiusX, drawRadiusY * 0.54, 0, Math.PI, 0, true);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(-drawRadiusX * 0.32, -drawRadiusY * 0.12, Math.max(2, drawRadiusX * 0.12), 0, Math.PI * 2);
    ctx.arc(drawRadiusX * 0.28, -drawRadiusY * 0.2, Math.max(2, drawRadiusX * 0.1), 0, Math.PI * 2);
    ctx.fillStyle = palette.accentFill;
    ctx.fill();
    ctx.fillStyle = palette.fill;
  } else if (plan.objectShape === "portal") {
    ctx.strokeStyle = rgba(palette.stroke, 0.9);
    ctx.lineWidth = Math.max(4, 5 * placement.scale);
    ctx.beginPath();
    ctx.ellipse(0, 0, drawRadiusX, drawRadiusY, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = rgba(palette.accent, 0.7);
    ctx.lineWidth = Math.max(2, 3 * placement.scale);
    ctx.beginPath();
    ctx.ellipse(0, 0, drawRadiusX * 0.78, drawRadiusY * 0.78, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = rgba(palette.accentFill, 0.35);
    ctx.beginPath();
    ctx.ellipse(0, 0, drawRadiusX * 0.62, drawRadiusY * 0.62, 0, 0, Math.PI * 2);
    ctx.fill();
  } else if (plan.objectShape === "torch") {
    ctx.beginPath();
    ctx.moveTo(0, drawRadiusY);
    ctx.lineTo(0, -drawRadiusY * 0.18);
    ctx.stroke();
    ctx.fillStyle = palette.accentFill;
    ctx.beginPath();
    ctx.moveTo(0, -drawRadiusY);
    ctx.quadraticCurveTo(-drawRadiusX * 0.7, -drawRadiusY * 0.2, 0, drawRadiusY * 0.02);
    ctx.quadraticCurveTo(drawRadiusX * 0.72, -drawRadiusY * 0.18, 0, -drawRadiusY);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  } else if (plan.objectShape === "fence") {
    ctx.beginPath();
    for (let postIndex = -2; postIndex <= 2; postIndex += 1) {
      const x = postIndex * drawRadiusX * 0.42;
      ctx.moveTo(x, drawRadiusY);
      ctx.lineTo(x, -drawRadiusY);
    }
    ctx.moveTo(-drawRadiusX, -drawRadiusY * 0.28);
    ctx.lineTo(drawRadiusX, -drawRadiusY * 0.28);
    ctx.moveTo(-drawRadiusX, drawRadiusY * 0.22);
    ctx.lineTo(drawRadiusX, drawRadiusY * 0.22);
    ctx.stroke();
  } else if (plan.objectShape === "sign") {
    ctx.beginPath();
    ctx.rect(-drawRadiusX, -drawRadiusY, drawRadiusX * 2, drawRadiusY * 1.1);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, drawRadiusY * 0.12);
    ctx.lineTo(0, drawRadiusY);
    ctx.stroke();
  } else if (plan.objectShape === "rubble-pile") {
    const rubbleShapes = [
      [-drawRadiusX * 0.72, drawRadiusY * 0.1, drawRadiusX * 0.4, drawRadiusY * 0.28],
      [-drawRadiusX * 0.22, -drawRadiusY * 0.06, drawRadiusX * 0.46, drawRadiusY * 0.34],
      [drawRadiusX * 0.34, drawRadiusY * 0.02, drawRadiusX * 0.5, drawRadiusY * 0.3],
    ] as const;
    for (const [offsetX, offsetY, radiusX, radiusY] of rubbleShapes) {
      ctx.beginPath();
      ctx.ellipse(offsetX, offsetY, radiusX, radiusY, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
  } else if (plan.objectShape === "desk") {
    ctx.beginPath();
    ctx.moveTo(-drawRadiusX, -drawRadiusY * 0.25);
    ctx.lineTo(drawRadiusX, -drawRadiusY * 0.25);
    ctx.moveTo(-drawRadiusX * 0.82, -drawRadiusY * 0.25);
    ctx.lineTo(-drawRadiusX * 0.72, drawRadiusY);
    ctx.moveTo(drawRadiusX * 0.82, -drawRadiusY * 0.25);
    ctx.lineTo(drawRadiusX * 0.72, drawRadiusY);
    ctx.stroke();
  } else if (plan.objectShape === "crate") {
    ctx.beginPath();
    ctx.rect(-drawRadiusX, -drawRadiusY, drawRadiusX * 2, drawRadiusY * 2);
    ctx.moveTo(-drawRadiusX, -drawRadiusY);
    ctx.lineTo(drawRadiusX, drawRadiusY);
    ctx.moveTo(drawRadiusX, -drawRadiusY);
    ctx.lineTo(-drawRadiusX, drawRadiusY);
    ctx.stroke();
  } else if (plan.objectShape === "cloud") {
    ctx.beginPath();
    ctx.ellipse(-drawRadiusX * 0.35, 0, drawRadiusX * 0.42, drawRadiusY * 0.4, 0, 0, Math.PI * 2);
    ctx.ellipse(0, -drawRadiusY * 0.16, drawRadiusX * 0.52, drawRadiusY * 0.48, 0, 0, Math.PI * 2);
    ctx.ellipse(drawRadiusX * 0.4, 0, drawRadiusX * 0.38, drawRadiusY * 0.34, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  } else if (plan.objectShape === "mountain") {
    ctx.beginPath();
    ctx.moveTo(-drawRadiusX * 1.3, drawRadiusY);
    ctx.lineTo(-drawRadiusX * 0.42, -drawRadiusY * 0.7);
    ctx.lineTo(0, drawRadiusY * 0.2);
    ctx.lineTo(drawRadiusX * 0.74, -drawRadiusY);
    ctx.lineTo(drawRadiusX * 1.4, drawRadiusY);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  } else if (plan.objectShape === "rock") {
    ctx.beginPath();
    ctx.moveTo(-drawRadiusX * 0.92, drawRadiusY * 0.18);
    ctx.lineTo(-drawRadiusX * 0.4, -drawRadiusY * 0.72);
    ctx.lineTo(drawRadiusX * 0.52, -drawRadiusY * 0.58);
    ctx.lineTo(drawRadiusX, drawRadiusY * 0.22);
    ctx.lineTo(drawRadiusX * 0.2, drawRadiusY);
    ctx.lineTo(-drawRadiusX * 0.72, drawRadiusY * 0.84);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  } else if (plan.objectShape === "ball" || plan.objectShape === "circle") {
    const shadowWidth = drawRadiusX * (1.08 + Math.max(0, plan.weightBias - 1) * 0.18);
    const shadowHeight = drawRadiusY * (0.18 + Math.max(0, plan.weightBias - 1) * 0.06);
    ctx.save();
    ctx.fillStyle = rgba("#1c2430", 0.12 + Math.max(0, plan.weightBias - 1) * 0.08);
    ctx.beginPath();
    ctx.ellipse(0, drawRadiusY + shadowHeight * 0.9, shadowWidth, shadowHeight, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    ctx.beginPath();
    ctx.ellipse(0, 0, drawRadiusX, drawRadiusY, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = palette.accentFill;
    ctx.beginPath();
    ctx.ellipse(-drawRadiusX * 0.22, -drawRadiusY * 0.24, drawRadiusX * 0.28, drawRadiusY * 0.2, -0.4, 0, Math.PI * 2);
    ctx.fill();
  } else if (plan.objectShape === "square" || plan.objectShape === "rectangle") {
    const depthX = drawRadiusX * 0.28;
    const depthY = drawRadiusY * 0.22;
    ctx.beginPath();
    ctx.rect(-drawRadiusX, -drawRadiusY, drawRadiusX * 2, drawRadiusY * 2);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(drawRadiusX, -drawRadiusY);
    ctx.lineTo(drawRadiusX + depthX, -drawRadiusY - depthY);
    ctx.lineTo(drawRadiusX + depthX, drawRadiusY - depthY);
    ctx.lineTo(drawRadiusX, drawRadiusY);
    ctx.closePath();
    ctx.fillStyle = rgba(palette.accentFill, 0.5);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-drawRadiusX, -drawRadiusY);
    ctx.lineTo(-drawRadiusX + depthX, -drawRadiusY - depthY);
    ctx.lineTo(drawRadiusX + depthX, -drawRadiusY - depthY);
    ctx.lineTo(drawRadiusX, -drawRadiusY);
    ctx.closePath();
    ctx.fillStyle = rgba(palette.accent, 0.22);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = palette.fill;
  } else if (plan.objectShape === "rod") {
    ctx.beginPath();
    ctx.moveTo(-drawRadiusX, 0);
    ctx.lineTo(drawRadiusX, 0);
    ctx.stroke();
  } else if (plan.objectShape === "tree") {
    ctx.lineWidth = Math.max(4, 6 * placement.scale);
    ctx.beginPath();
    ctx.moveTo(0, drawRadiusY);
    ctx.lineTo(0, drawRadiusY * 0.08);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, drawRadiusY * 0.18);
    ctx.lineTo(-drawRadiusX * 0.22, -drawRadiusY * 0.08);
    ctx.moveTo(0, drawRadiusY * 0.02);
    ctx.lineTo(drawRadiusX * 0.24, -drawRadiusY * 0.18);
    ctx.stroke();
    ctx.fillStyle = rgba(palette.fill, 0.94);
    ctx.beginPath();
    ctx.ellipse(0, -drawRadiusY * 0.52, drawRadiusX * 0.92, drawRadiusY * 0.52, 0, 0, Math.PI * 2);
    ctx.ellipse(-drawRadiusX * 0.42, -drawRadiusY * 0.28, drawRadiusX * 0.48, drawRadiusY * 0.34, -0.18, 0, Math.PI * 2);
    ctx.ellipse(drawRadiusX * 0.42, -drawRadiusY * 0.3, drawRadiusX * 0.46, drawRadiusY * 0.32, 0.22, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  } else if (plan.objectShape === "fan") {
    const cageY = -drawRadiusY * 0.24;
    const cageRadiusX = drawRadiusX * 0.86;
    const cageRadiusY = drawRadiusX * 0.72;
    const spinning = plan.motionProfile === "spin-sequence" || plan.action === "spin";
    const bladeRotation =
      spinning
        ? resolvedMotionBeat === "spin-start"
          ? (frameIndex / Math.max(1, plan.frameCount)) * Math.PI * 0.9
          : resolvedMotionBeat === "spin-fast"
            ? (frameIndex + 1) * Math.PI * 1.7
            : resolvedMotionBeat === "spin-loop"
              ? (frameIndex + 1) * Math.PI * 2.2
              : (frameIndex + 1) * Math.PI * 1.1
        : 0;

    ctx.beginPath();
    ctx.moveTo(0, drawRadiusY);
    ctx.lineTo(0, drawRadiusY * 0.18);
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(0, drawRadiusY * 0.92, drawRadiusX * 0.48, drawRadiusY * 0.12, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.save();
    ctx.fillStyle = rgba(palette.fill, 0.16);
    ctx.beginPath();
    ctx.ellipse(0, cageY, cageRadiusX, cageRadiusY, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    ctx.beginPath();
    ctx.ellipse(0, cageY, cageRadiusX, cageRadiusY, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-cageRadiusX * 0.86, cageY);
    ctx.lineTo(cageRadiusX * 0.86, cageY);
    ctx.moveTo(0, cageY - cageRadiusY * 0.86);
    ctx.lineTo(0, cageY + cageRadiusY * 0.86);
    ctx.stroke();

    ctx.save();
    ctx.translate(0, cageY);
    ctx.rotate(bladeRotation);
    if (spinning && (resolvedMotionBeat === "spin-fast" || resolvedMotionBeat === "spin-loop")) {
      ctx.strokeStyle = rgba(palette.accent, 0.42);
      ctx.lineWidth = Math.max(2, 3 * placement.scale);
      ctx.beginPath();
      ctx.ellipse(0, 0, cageRadiusX * 0.68, cageRadiusY * 0.58, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    for (let bladeIndex = 0; bladeIndex < 3; bladeIndex += 1) {
      ctx.save();
      ctx.rotate((Math.PI * 2 * bladeIndex) / 3);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.quadraticCurveTo(cageRadiusX * 0.34, -cageRadiusY * 0.08, cageRadiusX * 0.52, 0);
      ctx.quadraticCurveTo(cageRadiusX * 0.18, cageRadiusY * 0.16, 0, 0);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
    ctx.beginPath();
    ctx.arc(0, 0, Math.max(5, 7 * placement.scale), 0, Math.PI * 2);
    ctx.fillStyle = palette.accentFill;
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  } else if (plan.objectShape === "plant") {
    ctx.beginPath();
    ctx.moveTo(0, drawRadiusY);
    ctx.quadraticCurveTo(drawRadiusX * 0.15, 0, 0, -drawRadiusY * 0.55);
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(-drawRadiusX * 0.45, -drawRadiusY * 0.1, drawRadiusX * 0.38, drawRadiusY * 0.18, -0.7, 0, Math.PI * 2);
    ctx.ellipse(drawRadiusX * 0.45, -drawRadiusY * 0.26, drawRadiusX * 0.34, drawRadiusY * 0.16, 0.65, 0, Math.PI * 2);
    ctx.stroke();
  } else {
    ctx.beginPath();
    ctx.ellipse(0, 0, drawRadiusX, drawRadiusY, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }

  if (plan.action === "explode") {
    ctx.strokeStyle = palette.stroke;
    ctx.fillStyle = palette.fill;
    ctx.beginPath();
    ctx.arc(0, 0, Math.max(drawRadiusX, drawRadiusY) * 0.54, 0, Math.PI * 2);
    ctx.fill();

    if (resolvedMotionBeat !== "explosion-build") {
      ctx.beginPath();
      const spikeCount = 8;
      for (let index = 0; index < spikeCount; index += 1) {
        const angle = (Math.PI * 2 * index) / spikeCount;
        const innerRadius = Math.min(drawRadiusX, drawRadiusY) * 0.35;
        const outerRadius = Math.max(drawRadiusX, drawRadiusY) * (index % 2 === 0 ? 1.1 : 0.82);
        const radius = index % 2 === 0 ? outerRadius : innerRadius;
        const x = Math.cos(angle) * radius;
        const y = Math.sin(angle) * radius;
        if (index === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      }
      ctx.closePath();
      ctx.stroke();
    }

    ctx.fillStyle = palette.accentFill;
    ctx.beginPath();
    ctx.arc(0, 0, Math.max(drawRadiusX, drawRadiusY) * (resolvedMotionBeat === "explosion-build" ? 0.22 : 0.34), 0, Math.PI * 2);
    ctx.fill();

    if (resolvedMotionBeat === "explosion-fade") {
      ctx.strokeStyle = palette.shadow;
      ctx.beginPath();
      ctx.arc(0, 0, Math.max(drawRadiusX, drawRadiusY) * 0.72, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  if (plan.action === "roll" || plan.action === "slide") {
    ctx.beginPath();
    ctx.moveTo(-drawRadiusX * 0.65, 0);
    ctx.lineTo(drawRadiusX * 0.65, 0);
    ctx.stroke();
  }

  ctx.restore();
};

const estimateRoundCharacterBounds = (
  width: number,
  height: number,
  plan: FramePlan,
  workspaceContext?: DrawingAiWorkspaceContext | null,
) => {
  const placement = resolvePlacement(width, height, plan, workspaceContext);
  const radius = 38 * placement.scale;
  const limbReach = 44 * placement.scale;
  return createBounds(
    placement.x - radius - limbReach,
    placement.y - radius - 18,
    placement.x + radius + limbReach,
    placement.y + radius + limbReach + 30,
  );
};

const estimateSimpleObjectBounds = (
  width: number,
  height: number,
  plan: FramePlan,
  workspaceContext: DrawingAiWorkspaceContext | null | undefined,
  frameIndex: number,
) => {
  const placement = getObjectSequencePlacement(width, height, plan, workspaceContext, frameIndex);
  const { radiusX, radiusY } = getObjectFrameRadius(plan, placement.scale);
  const drawRadiusX = radiusX * placement.scaleX * (plan.action === "explode" ? 1.45 : 1);
  const drawRadiusY = radiusY * placement.scaleY * (plan.action === "explode" ? 1.45 : 1);
  return buildObjectBounds(placement, drawRadiusX, drawRadiusY);
};

const estimateFrameBounds = (
  width: number,
  height: number,
  plan: FramePlan,
  workspaceContext: DrawingAiWorkspaceContext | null | undefined,
  frameIndex: number,
) => {
  if (plan.subjectType === "round-character") {
    return estimateRoundCharacterBounds(width, height, plan, workspaceContext);
  }

  if (plan.subjectType === "effect") {
    const placement = getEffectPlacement({ width, height, plan, workspaceContext, frameIndex });
    const { radiusX, radiusY } = getEffectFrameRadius(plan, placement.scale, placement.phase);
    const padding = Math.max(20, 28 * placement.scale);
    return createBounds(
      placement.x - radiusX - padding,
      placement.y - radiusY - padding,
      placement.x + radiusX + padding,
      placement.y + radiusY + padding,
    );
  }

  if (plan.subjectType === "simple-object") {
    return estimateSimpleObjectBounds(width, height, plan, workspaceContext, frameIndex);
  }

  return buildStickFigurePose(width, height, plan, workspaceContext, frameIndex).bounds;
};

const sanitizeFramePlanGeometry = (
  plan: FramePlan,
  width: number,
  height: number,
  workspaceContext: DrawingAiWorkspaceContext | null | undefined,
  frameIndex: number,
) => {
  const allowLargeBounds =
    plan.backgroundMode ||
    plan.objectShape === "hallway-background" ||
    plan.objectShape === "room-background" ||
    plan.objectShape === "concrete-cracks" ||
    plan.objectShape === "plain-landscape" ||
    plan.objectShape === "city-background" ||
    plan.objectShape === "mountain" ||
    plan.backgroundOverlayShape != null;
  const geometryLimits =
    plan.subjectType === "effect"
      ? {
          allowLarge: false,
          widthRatio: MAX_EFFECT_WIDTH_RATIO,
          heightRatio: MAX_EFFECT_HEIGHT_RATIO,
          areaRatio: MAX_EFFECT_AREA_RATIO,
        }
      : {
          allowLarge: allowLargeBounds,
          widthRatio: MAX_NON_BACKGROUND_WIDTH_RATIO,
          heightRatio: MAX_NON_BACKGROUND_HEIGHT_RATIO,
          areaRatio: MAX_NON_BACKGROUND_AREA_RATIO,
        };
  let nextPlan = plan;
  let geometryClamped = false;
  let bounds = estimateFrameBounds(width, height, nextPlan, workspaceContext, frameIndex);

  if (isOversizedSubjectBounds(bounds, width, height, geometryLimits)) {
    const widthScale = (width * geometryLimits.widthRatio) / Math.max(1, bounds.width);
    const heightScale = (height * geometryLimits.heightRatio) / Math.max(1, bounds.height);
    const areaScale = Math.sqrt((width * height * geometryLimits.areaRatio) / Math.max(1, bounds.width * bounds.height));
    const scaleMultiplier = clamp(Math.min(widthScale, heightScale, areaScale), 0.42, 1);
    nextPlan = {
      ...nextPlan,
      scale: clamp(nextPlan.scale * scaleMultiplier, 0.46, 1.08),
      placementX: nextPlan.centerLock ? "center" : nextPlan.placementX,
    };
    geometryClamped = true;
    bounds = estimateFrameBounds(width, height, nextPlan, workspaceContext, frameIndex);
  }

  return {
    plan: nextPlan,
    bounds: clampBoundsToCanvas(bounds, width, height),
    geometryClamped,
    absurdlyOversized: isOversizedSubjectBounds(bounds, width, height, geometryLimits),
  };
};

type PreparedGeneratedFrame = {
  plan: FramePlan;
  diagnostics: GeneratedFrameDiagnosticsFrame;
  sourcePose: string;
  sourceDescription: string;
  sourceText: string;
};

const EXECUTOR_MULTI_ACTOR_PATTERN =
  /\b((?:two|2)\s+(?:stick(?:\s|-)?figures?|fighters?|characters?|people|combatants?|robots?|balls?)|both figures?|opponent|defender|attacker|versus|vs\.?|against|left figure|right figure|red and blue)\b/i;
const EXECUTOR_SCENE_PATTERN =
  /\b(background|backdrop|scene|setting|environment|landscape|neighborhood|forest|cave|room|city|arena|rooftop|alley|plains|mountains|temple)\b/i;
const EXECUTOR_EFFECT_PATTERN =
  /\b(explosion|explode|blast|detonation|fireball|lightning|bolt|shockwave|smoke|dust|eruption|impact|flash|afterglow)\b/i;
const EXECUTOR_EXPLICIT_COLOR_PATTERN =
  /\b(red|blue|green|yellow|orange|purple|pink|black|white|gray|grey|cyan|teal|lime)\b/i;
const EXECUTOR_EXPLICIT_PLACEMENT_PATTERN =
  /\b(off-left|off-right|left-entry|right-entry|left side|right side|center|middle|upper|lower|top|bottom|facing left|facing right|turn(?:ed|ing)? left|turn(?:ed|ing)? right)\b/i;
const EXECUTOR_EXPLICIT_SIZE_PATTERN =
  /\b(bigger|larger|smaller|tiny|massive|huge|shorter|taller|scale|scaled)\b/i;

const cloneFramePlan = (plan: FramePlan): FramePlan => ({
  ...plan,
  sceneDescriptors: [...plan.sceneDescriptors],
  sceneProps: [...plan.sceneProps],
});

const getGeneratedFrameQualityContext = (generatedFramePlan: DrawingAiGeneratedFramePlan): {
  renderingQualityProfile: DrawingAiRenderingQualityProfile | null;
  familyQualityContract: DrawingAiFamilyQualityContract | null;
  principleActivationProfile: DrawingAiGeneratedFramePlan["principleActivationProfile"] | null;
  variationEnvelope: DrawingAiGeneratedFramePlan["variationEnvelope"] | null;
  renderAcceptanceContract: DrawingAiRenderAcceptanceContract | null;
} => ({
  renderingQualityProfile: generatedFramePlan.renderingQualityProfile ?? null,
  familyQualityContract: generatedFramePlan.familyQualityContract ?? null,
  principleActivationProfile: generatedFramePlan.principleActivationProfile ?? null,
  variationEnvelope: generatedFramePlan.variationEnvelope ?? null,
  renderAcceptanceContract: generatedFramePlan.renderAcceptanceContract ?? null,
});

const evaluatePreparedFramesAgainstQualityContracts = ({
  preparedFrames,
  renderingQualityProfile,
  principleActivationProfile,
  variationEnvelope,
  renderAcceptanceContract,
}: {
  preparedFrames: readonly PreparedGeneratedFrame[];
  renderingQualityProfile: DrawingAiRenderingQualityProfile | null;
  principleActivationProfile: DrawingAiGeneratedFramePlan["principleActivationProfile"] | null;
  variationEnvelope: DrawingAiGeneratedFramePlan["variationEnvelope"] | null;
  renderAcceptanceContract: DrawingAiRenderAcceptanceContract | null;
}) => {
  if (preparedFrames.length === 0 || renderingQualityProfile == null || renderAcceptanceContract == null) {
    return null;
  }

  const frameCount = preparedFrames.length;
  const motionBeats = preparedFrames.map((frame) => frame.plan.motionBeat);
  const effectPhases = preparedFrames.map((frame) => frame.plan.effectPhase);
  const maxExpansionStrength = Math.max(...preparedFrames.map((frame) => frame.plan.expansionStrength));
  const maxBreakupAmount = Math.max(...preparedFrames.map((frame) => frame.plan.breakupAmount));
  const maxSpikeSharpness = Math.max(...preparedFrames.map((frame) => frame.plan.spikeSharpness));
  const anchoredFrames = preparedFrames.filter((frame) => frame.plan.centerLock || frame.plan.preservePlacement).length;
  const scaleValues = preparedFrames.map((frame) => frame.plan.scale);
  const scaleSpread = Math.max(...scaleValues) - Math.min(...scaleValues);
  const firstPlan = preparedFrames[0]!.plan;
  const lastPlan = preparedFrames[preparedFrames.length - 1]!.plan;
  const hasPrimaryAnticipation =
    principleActivationProfile?.activations?.some(
      (activation) => activation.principle === "anticipation" && activation.activationLevel === "primary",
    ) ?? false;
  const forbidsCannedRepeat =
    variationEnvelope?.forbiddenSubstitutions?.some((value) => /canned|fake variety/i.test(value)) ?? false;

  switch (renderingQualityProfile.family) {
    case "explosion":
      if (frameCount >= 4) {
        const hasPeak = effectPhases.some((phase) => phase === "blast" || phase === "peak");
        const hasEnding = effectPhases.some((phase) => phase === "breakup" || phase === "smoke" || phase === "fade");
        const supportOverwhelmsCore =
          preparedFrames.filter((frame) => frame.plan.hasSmokeOverlay || frame.plan.hasShockwaveOverlay).length >=
            Math.max(3, Math.ceil(frameCount * 0.7)) && maxExpansionStrength < 0.76;
        if (!hasPeak || !hasEnding || maxExpansionStrength < 0.68 || maxBreakupAmount < 0.5 || supportOverwhelmsCore) {
          return "Executor could not keep this explosion strong enough to read as a full blast with breakup and aftermath.";
        }
      }
      return null;
    case "lightning":
      if (
        maxSpikeSharpness < 0.78 ||
        preparedFrames.some((frame) => frame.plan.hasExplosionOverlay || frame.plan.hasSmokeOverlay) ||
        (frameCount >= 2 && !["fade", "none"].includes(lastPlan.effectPhase))
      ) {
        return "Executor could not keep this lightning pass sharp, brief, and vanishing without drifting into blob or lingering behavior.";
      }
      return null;
    case "combat": {
      const hasWindup = motionBeats.some((beat) => /windup|chamber/.test(beat));
      const hasImpact = motionBeats.some((beat) => /impact|contact/.test(beat));
      const hasRecovery = motionBeats.some((beat) => /recovery|follow-through|settle/.test(beat));
      if (frameCount >= 3 && ((hasPrimaryAnticipation && !hasWindup) || !hasImpact || !hasRecovery)) {
        return "Executor could not keep this combat action readable through anticipation, impact, and recovery.";
      }
      return null;
    }
    case "breathing": {
      const hasInhale = motionBeats.some((beat) => /breath-in/.test(beat));
      const hasExhale = motionBeats.some((beat) => /breath-out/.test(beat));
      const hasRecover = motionBeats.some((beat) => /breath-recover/.test(beat));
      if (!hasInhale || !hasExhale || !hasRecover) {
        return "Executor could not keep this breathing action inside a readable inhale-exhale-recover rhythm.";
      }
      return null;
    }
    case "background-scroll":
      if (
        !preparedFrames.some((frame) => frame.plan.backgroundScroll) ||
        anchoredFrames < Math.max(1, Math.min(frameCount - 1, 2))
      ) {
        return "Executor could not preserve the anchored-subject plus moving-environment illusion for this background-scroll request.";
      }
      return null;
    case "character":
      if (scaleSpread > 0.22) {
        return "Executor let the character proportions drift too much across frames instead of keeping the same family identity.";
      }
      return null;
    case "background":
      if (firstPlan.subjectType === "stick-figure" || firstPlan.subjectType === "round-character") {
        return "Executor could not keep this background request free of foreground character takeover.";
      }
      return null;
    default:
      if (
        forbidsCannedRepeat &&
        frameCount >= 3 &&
        new Set(motionBeats).size <= 1 &&
        new Set(effectPhases).size <= 1
      ) {
        return "Executor collapsed the sequence into canned repetition instead of controlled family variation.";
      }
      return null;
  }
};

const estimateGovernedPreservedScale = (
  plan: FramePlan,
  bounds: DrawingAiWorkspaceBitmapBounds | null | undefined,
) => {
  if (!bounds) {
    return plan.scale;
  }

  if (plan.subjectType === "stick-figure" || plan.subjectType === "round-character") {
    const widthScale = bounds.width / 116;
    const heightScale = bounds.height / 224;
    return clamp((widthScale + heightScale) / 2, 0.42, 1.08);
  }

  if (plan.subjectType === "effect") {
    return clamp(Math.max(bounds.width / 220, bounds.height / 220), 0.42, 1.18);
  }

  return clamp(Math.max(bounds.width / 150, bounds.height / 150), 0.42, 1.08);
};

const governPreparedFrames = ({
  userPrompt,
  generatedFramePlan,
  preparedFrames,
  workspaceContext,
}: {
  userPrompt: string;
  generatedFramePlan: DrawingAiGeneratedFramePlan;
  preparedFrames: PreparedGeneratedFrame[];
  workspaceContext: DrawingAiWorkspaceContext | null;
}) => {
  if (preparedFrames.length === 0) {
    return {
      preparedFrames,
      failureReason: null as string | null,
    };
  }

  const anchorPlan = cloneFramePlan(preparedFrames[0]!.plan);
  const normalizedPrompt = userPrompt.trim().toLowerCase();
  const behaviorType = generatedFramePlan.workspaceIntent?.behaviorType ?? null;
  const targetLayerIntent = generatedFramePlan.workspaceIntent?.targetLayerIntent ?? null;
  const qualityContext = getGeneratedFrameQualityContext(generatedFramePlan);
  const qualityFamily = qualityContext.renderingQualityProfile?.family ?? null;
  const hasBitmapAnchor = workspaceContext?.currentFrameHasBitmap === true;
  const anchoredBitmapEdit =
    hasBitmapAnchor &&
    (behaviorType === "animation-continuation" ||
      behaviorType === "cleanup-edit" ||
      behaviorType === "effect-drawing");
  const allowMultiActor = EXECUTOR_MULTI_ACTOR_PATTERN.test(normalizedPrompt) || anchorPlan.secondaryFigureEnabled;
  const allowScene =
    EXECUTOR_SCENE_PATTERN.test(normalizedPrompt) ||
    behaviorType === "background-generation" ||
    targetLayerIntent === "background-layer" ||
    anchorPlan.backgroundMode ||
    anchorPlan.sceneSetting != null ||
    anchorPlan.sceneProps.length > 0 ||
    anchorPlan.backgroundOverlayShape != null;
  const allowCoreEffect =
    EXECUTOR_EFFECT_PATTERN.test(normalizedPrompt) ||
    behaviorType === "effect-drawing" ||
    anchorPlan.subjectType === "effect" ||
    anchorPlan.effectType !== "none" ||
    anchorPlan.hasExplosionOverlay ||
    anchorPlan.hasSmokeOverlay ||
    anchorPlan.hasShockwaveOverlay;
  const shouldSuppressSceneRerender =
    anchoredBitmapEdit ||
    (hasBitmapAnchor &&
      behaviorType === "tool-drawing" &&
      generatedFramePlan.workspaceIntent?.generationAllowed === false &&
      targetLayerIntent !== "background-layer");
  const shouldLockVisualFamily = preparedFrames.length > 1 || anchoredBitmapEdit;
  const characterFamilyAnchor =
    anchorPlan.subjectType === "stick-figure" || anchorPlan.subjectType === "round-character";
  const promptAllowsAnchoredColorChange =
    /\b(recolor|re-colou?r|change(?: the)?(?: current| existing)?(?: subject| figure| one| head| body| outline)?(?: color| colours?| coloring)?|turn(?: the)?(?: current| existing)?(?: subject| figure| one| head| body| outline)?(?: solid| filled)?|fill(?: in| the)?(?: current| existing)?(?: head| body| outline)?)\b[\s\S]{0,80}\b(red|blue|green|yellow|orange|purple|pink|black|white|gray|grey|cyan|teal|lime)\b/i.test(
      normalizedPrompt,
    ) ||
    /\b(red|blue|green|yellow|orange|purple|pink|black|white|gray|grey|cyan|teal|lime)\b[\s\S]{0,80}\b(head|body|figure|one)\b[\s\S]{0,40}\b(solid|filled|make|change|turn|recolor|colour|color)\b/i.test(
      normalizedPrompt,
    );
  const promptAllowsAnchoredPlacementChange =
    /\b(move|shift|slide|step|run|walk|jump|leap|bounce|roll|turn|face|facing|left side|right side|center|middle|off-left|off-right|left-entry|right-entry)\b/i.test(
      normalizedPrompt,
    );

  const governedFrames = preparedFrames.map((preparedFrame, frameIndex) => {
    let adjusted = false;
    const frameText = preparedFrame.sourceText.toLowerCase();
    const explicitColorCue =
      frameIndex === 0 ||
      ((!(anchoredBitmapEdit && !promptAllowsAnchoredColorChange)) && EXECUTOR_EXPLICIT_COLOR_PATTERN.test(frameText));
    const explicitPlacementCue =
      frameIndex === 0 ||
      ((!(anchoredBitmapEdit && !promptAllowsAnchoredPlacementChange)) &&
        EXECUTOR_EXPLICIT_PLACEMENT_PATTERN.test(frameText));
    const explicitSizeCue = frameIndex === 0 || EXECUTOR_EXPLICIT_SIZE_PATTERN.test(frameText);
    const explicitSceneCue = frameIndex === 0 || EXECUTOR_SCENE_PATTERN.test(frameText);
    let nextPlan = cloneFramePlan(preparedFrame.plan);

    if (shouldLockVisualFamily) {
      if (anchorPlan.subjectType === "effect") {
        if (nextPlan.subjectType !== "effect") {
          nextPlan.subjectType = "effect";
          adjusted = true;
        }
        if (anchorPlan.effectType !== "none" && nextPlan.effectType !== anchorPlan.effectType) {
          nextPlan.effectType = anchorPlan.effectType;
          adjusted = true;
        }
        if (nextPlan.secondaryFigureEnabled) {
          nextPlan.secondaryFigureEnabled = false;
          nextPlan.secondaryFigureColor = null;
          adjusted = true;
        }
      } else if (!allowCoreEffect && nextPlan.subjectType === "effect") {
        nextPlan.subjectType = anchorPlan.subjectType;
        nextPlan.effectType = "none";
        adjusted = true;
      }

      if (anchorPlan.subjectType === "simple-object" && nextPlan.objectShape !== anchorPlan.objectShape) {
        nextPlan.objectShape = anchorPlan.objectShape;
        adjusted = true;
      }

      if (characterFamilyAnchor) {
        if (nextPlan.subjectType !== anchorPlan.subjectType && nextPlan.subjectType !== "effect") {
          nextPlan.subjectType = anchorPlan.subjectType;
          adjusted = true;
        }
        for (const key of [
          "robotStyle",
          "zombieStyle",
          "alienStyle",
          "groundhogStyle",
          "hornedStyle",
          "wingedStyle",
          "capeStyle",
          "pixelStyle",
          "arcadeStyle",
          "hasSunglasses",
        ] as const) {
          if (nextPlan[key] !== anchorPlan[key]) {
            nextPlan[key] = anchorPlan[key];
            adjusted = true;
          }
        }
        if (nextPlan.facialFeaturesEnabled !== anchorPlan.facialFeaturesEnabled) {
          nextPlan.facialFeaturesEnabled = anchorPlan.facialFeaturesEnabled;
          adjusted = true;
        }
      }
    }

    if (!allowMultiActor && nextPlan.secondaryFigureEnabled) {
      nextPlan.secondaryFigureEnabled = false;
      nextPlan.secondaryFigureColor = null;
      adjusted = true;
    }

    if (behaviorType === "effect-drawing") {
      if (nextPlan.backgroundMode) {
        nextPlan.backgroundMode = false;
        adjusted = true;
      }
      if (nextPlan.backgroundOverlayShape != null) {
        nextPlan.backgroundOverlayShape = null;
        adjusted = true;
      }
      if (nextPlan.secondaryFigureEnabled) {
        nextPlan.secondaryFigureEnabled = false;
        nextPlan.secondaryFigureColor = null;
        adjusted = true;
      }
      if (
        nextPlan.subjectType !== "effect" &&
        nextPlan.effectType === "none" &&
        !nextPlan.hasExplosionOverlay &&
        !nextPlan.hasSmokeOverlay &&
        !nextPlan.hasShockwaveOverlay &&
        anchorPlan.effectType !== "none"
      ) {
        nextPlan.subjectType = "effect";
        nextPlan.effectType = anchorPlan.effectType;
        adjusted = true;
      }
    }

    if (behaviorType === "background-generation" || targetLayerIntent === "background-layer") {
      if (nextPlan.secondaryFigureEnabled) {
        nextPlan.secondaryFigureEnabled = false;
        nextPlan.secondaryFigureColor = null;
        adjusted = true;
      }
      if (nextPlan.hasExplosionOverlay || nextPlan.hasSmokeOverlay || nextPlan.hasShockwaveOverlay) {
        nextPlan.hasExplosionOverlay = false;
        nextPlan.hasSmokeOverlay = false;
        nextPlan.hasShockwaveOverlay = false;
        adjusted = true;
      }
    }

    if (shouldSuppressSceneRerender) {
      if (
        nextPlan.backgroundMode ||
        nextPlan.backgroundOverlayShape != null ||
        nextPlan.sceneSetting != null ||
        nextPlan.sceneDescriptors.length > 0 ||
        nextPlan.sceneProps.length > 0 ||
        nextPlan.stageBackgroundColor != null
      ) {
        nextPlan.backgroundMode = false;
        nextPlan.backgroundOverlayShape = null;
        nextPlan.sceneSetting = null;
        nextPlan.sceneDescriptors = [];
        nextPlan.sceneProps = [];
        nextPlan.stageBackgroundColor = null;
        adjusted = true;
      }
    } else if (shouldLockVisualFamily && frameIndex > 0 && !explicitSceneCue) {
      if (nextPlan.sceneSetting !== anchorPlan.sceneSetting) {
        nextPlan.sceneSetting = anchorPlan.sceneSetting;
        adjusted = true;
      }
      if (nextPlan.backgroundMode !== anchorPlan.backgroundMode) {
        nextPlan.backgroundMode = anchorPlan.backgroundMode;
        adjusted = true;
      }
      if (nextPlan.backgroundOverlayShape !== anchorPlan.backgroundOverlayShape) {
        nextPlan.backgroundOverlayShape = anchorPlan.backgroundOverlayShape;
        adjusted = true;
      }
      if (nextPlan.stageBackgroundColor !== anchorPlan.stageBackgroundColor) {
        nextPlan.stageBackgroundColor = anchorPlan.stageBackgroundColor;
        adjusted = true;
      }
      if (
        nextPlan.sceneDescriptors.join("|") !== anchorPlan.sceneDescriptors.join("|") ||
        nextPlan.sceneProps.join("|") !== anchorPlan.sceneProps.join("|")
      ) {
        nextPlan.sceneDescriptors = [...anchorPlan.sceneDescriptors];
        nextPlan.sceneProps = [...anchorPlan.sceneProps];
        adjusted = true;
      }
    }

    if (!explicitColorCue) {
      if (nextPlan.strokeColor !== anchorPlan.strokeColor) {
        nextPlan.strokeColor = anchorPlan.strokeColor;
        adjusted = true;
      }
      if (nextPlan.filledHeadColor !== anchorPlan.filledHeadColor) {
        nextPlan.filledHeadColor = anchorPlan.filledHeadColor;
        adjusted = true;
      }
      if (nextPlan.objectFillColor !== anchorPlan.objectFillColor) {
        nextPlan.objectFillColor = anchorPlan.objectFillColor;
        adjusted = true;
      }
      if (allowMultiActor && nextPlan.secondaryFigureColor !== anchorPlan.secondaryFigureColor) {
        nextPlan.secondaryFigureColor = anchorPlan.secondaryFigureColor;
        adjusted = true;
      }
    }

    if (!explicitPlacementCue) {
      if (nextPlan.placementX !== anchorPlan.placementX) {
        nextPlan.placementX = anchorPlan.placementX;
        adjusted = true;
      }
      if (nextPlan.placementY !== anchorPlan.placementY) {
        nextPlan.placementY = anchorPlan.placementY;
        adjusted = true;
      }
      if (nextPlan.facing !== anchorPlan.facing) {
        nextPlan.facing = anchorPlan.facing;
        adjusted = true;
      }
      if (nextPlan.centerLock !== anchorPlan.centerLock) {
        nextPlan.centerLock = anchorPlan.centerLock;
        adjusted = true;
      }
    }

    if (anchoredBitmapEdit) {
      const shouldPreservePlacement = Boolean(workspaceContext?.currentFrameBounds);
      if (nextPlan.preservePlacement !== shouldPreservePlacement) {
        nextPlan.preservePlacement = shouldPreservePlacement;
        adjusted = true;
      }
      if (nextPlan.preserveScale !== shouldPreservePlacement) {
        nextPlan.preserveScale = shouldPreservePlacement;
        adjusted = true;
      }
      if (workspaceContext?.currentFrameBounds) {
        const preservedScale = estimateGovernedPreservedScale(anchorPlan, workspaceContext.currentFrameBounds);
        if (Math.abs(nextPlan.scale - preservedScale) > 0.04) {
          nextPlan.scale = preservedScale;
          adjusted = true;
        }
      }
    } else if (preparedFrames.length > 1 && !explicitSizeCue) {
      const clampedScale = clamp(nextPlan.scale, Math.max(0.42, anchorPlan.scale - 0.08), Math.min(1.12, anchorPlan.scale + 0.08));
      if (Math.abs(clampedScale - nextPlan.scale) > 0.001) {
        nextPlan.scale = clampedScale;
        adjusted = true;
      }
    }

    if (allowCoreEffect) {
      if (anchorPlan.effectType === "lightning" || nextPlan.effectType === "lightning") {
        if (nextPlan.hasExplosionOverlay || nextPlan.hasSmokeOverlay || nextPlan.hasShockwaveOverlay) {
          nextPlan.hasExplosionOverlay = false;
          nextPlan.hasSmokeOverlay = false;
          nextPlan.hasShockwaveOverlay = false;
          adjusted = true;
        }
        const sharpened = Math.max(nextPlan.spikeSharpness, anchorPlan.spikeSharpness, 0.78);
        if (Math.abs(sharpened - nextPlan.spikeSharpness) > 0.001) {
          nextPlan.spikeSharpness = sharpened;
          adjusted = true;
        }
        const fasterLightning = Math.max(nextPlan.speedBias, anchorPlan.speedBias, 1.08);
        if (Math.abs(fasterLightning - nextPlan.speedBias) > 0.001) {
          nextPlan.speedBias = fasterLightning;
          adjusted = true;
        }
      }
      if (anchorPlan.effectType === "explosion" || nextPlan.effectType === "explosion" || nextPlan.hasExplosionOverlay) {
        const latePhase = ["breakup", "smoke", "fade"].includes(nextPlan.effectPhase);
        if (!latePhase && frameIndex < preparedFrames.length - 1 && nextPlan.hasSmokeOverlay) {
          nextPlan.hasSmokeOverlay = false;
          adjusted = true;
        }
        const strongerExpansion = Math.max(nextPlan.expansionStrength, anchorPlan.expansionStrength, 0.72);
        if (Math.abs(strongerExpansion - nextPlan.expansionStrength) > 0.001) {
          nextPlan.expansionStrength = strongerExpansion;
          adjusted = true;
        }
        const strongerBreakup = Math.max(nextPlan.breakupAmount, anchorPlan.breakupAmount, 0.58);
        if (Math.abs(strongerBreakup - nextPlan.breakupAmount) > 0.001) {
          nextPlan.breakupAmount = strongerBreakup;
          adjusted = true;
        }
        const strongerCore = Math.max(nextPlan.coreIntensity, anchorPlan.coreIntensity, 0.72);
        if (Math.abs(strongerCore - nextPlan.coreIntensity) > 0.001) {
          nextPlan.coreIntensity = strongerCore;
          adjusted = true;
        }
      }
    } else if (nextPlan.hasExplosionOverlay || nextPlan.hasSmokeOverlay || nextPlan.hasShockwaveOverlay) {
      nextPlan.hasExplosionOverlay = false;
      nextPlan.hasSmokeOverlay = false;
      nextPlan.hasShockwaveOverlay = false;
      adjusted = true;
    }

    if (!allowScene && frameIndex > 0) {
      if (
        nextPlan.backgroundMode ||
        nextPlan.backgroundOverlayShape != null ||
        nextPlan.sceneSetting != null ||
        nextPlan.sceneDescriptors.length > 0 ||
        nextPlan.sceneProps.length > 0
      ) {
        nextPlan.backgroundMode = false;
        nextPlan.backgroundOverlayShape = null;
        nextPlan.sceneSetting = null;
        nextPlan.sceneDescriptors = [];
        nextPlan.sceneProps = [];
        adjusted = true;
      }
    }

    if (qualityFamily === "background-scroll") {
      if (!nextPlan.backgroundScroll) {
        nextPlan.backgroundScroll = true;
        adjusted = true;
      }
      if (!nextPlan.centerLock) {
        nextPlan.centerLock = true;
        adjusted = true;
      }
    } else if (qualityFamily === "breathing") {
      const smootherBreathing = Math.max(nextPlan.smoothnessBias, 0.74);
      if (Math.abs(smootherBreathing - nextPlan.smoothnessBias) > 0.001) {
        nextPlan.smoothnessBias = smootherBreathing;
        adjusted = true;
      }
    } else if (qualityFamily === "combat") {
      const strongerImpact = Math.max(nextPlan.impactStrength, 1.08);
      if (Math.abs(strongerImpact - nextPlan.impactStrength) > 0.001) {
        nextPlan.impactStrength = strongerImpact;
        adjusted = true;
      }
      const heavierCombat = Math.max(nextPlan.weightBias, 0.96);
      if (Math.abs(heavierCombat - nextPlan.weightBias) > 0.001) {
        nextPlan.weightBias = heavierCombat;
        adjusted = true;
      }
    }

    if (adjusted && nextPlan.supportLevel !== "partial") {
      nextPlan.supportLevel = "partial";
    }

    return {
      ...preparedFrame,
      plan: nextPlan,
      diagnostics: {
        ...preparedFrame.diagnostics,
        strokeColor: nextPlan.strokeColor,
        fillColor: nextPlan.objectFillColor ?? nextPlan.filledHeadColor ?? preparedFrame.diagnostics.fillColor,
      },
    };
  });

  if (
    behaviorType === "effect-drawing" &&
    governedFrames.every(
      (frame) =>
        frame.plan.subjectType !== "effect" &&
        frame.plan.effectType === "none" &&
        !frame.plan.hasExplosionOverlay &&
        !frame.plan.hasSmokeOverlay &&
        !frame.plan.hasShockwaveOverlay,
    )
  ) {
    return {
      preparedFrames: governedFrames,
      failureReason:
        "Executor could not keep this effect pass inside the requested effect family without inventing unrelated content.",
    };
  }

  if (
    (behaviorType === "background-generation" || targetLayerIntent === "background-layer") &&
    governedFrames.some((frame) => frame.plan.subjectType === "stick-figure" || frame.plan.subjectType === "round-character")
  ) {
    return {
      preparedFrames: governedFrames,
      failureReason: "Executor could not keep this background pass free of foreground character subjects.",
    };
  }

  const qualityFailureReason = evaluatePreparedFramesAgainstQualityContracts({
    preparedFrames: governedFrames,
    renderingQualityProfile: qualityContext.renderingQualityProfile,
    principleActivationProfile: qualityContext.principleActivationProfile,
    variationEnvelope: qualityContext.variationEnvelope,
    renderAcceptanceContract: qualityContext.renderAcceptanceContract,
  });
  if (qualityFailureReason) {
    return {
      preparedFrames: governedFrames,
      failureReason: qualityFailureReason,
    };
  }

  return {
    preparedFrames: governedFrames,
    failureReason: null as string | null,
  };
};

const prepareGeneratedFrameAnalysis = ({
  userPrompt,
  generatedFramePlan,
  workspaceContext,
  width,
  height,
}: GeneratedFrameRenderInput): {
  safeFrameCount: number;
  boundedRenderSize: { width: number; height: number };
  boundedRenderWorkspaceContext: DrawingAiWorkspaceContext | null;
  preparedFrames: PreparedGeneratedFrame[];
  diagnostics: GeneratedFramePlanDiagnostics;
  governanceFailureReason: string | null;
} => {
  const promptText = userPrompt.trim();
  const safeFrameDrafts = clampFrameDraftsToRequest(
    generatedFramePlan.frames,
    generatedFramePlan.requestedFrameCount,
    "Generate Frames render input",
  );
  const safeFrameCount = clampRequestedFrameCount(safeFrameDrafts.length);
  const sequenceVariationSeed = hashTextToPositiveInt(
    [
      promptText,
      generatedFramePlan.renderingQualityProfile?.family ?? "generic",
      ...(generatedFramePlan.variationEnvelope?.lockedIdentityTraits ?? []),
      ...(generatedFramePlan.variationEnvelope?.allowedVariationAxes ?? []),
      ...safeFrameDrafts.map((frameDraft) => `${frameDraft.pose.trim()}|${frameDraft.description.trim()}`),
    ].join("\n"),
  );
  const preliminaryPlan = buildSafeRenderPlan(
    {
      ...createBaseFramePlan(
        buildFrameDescriptorText(promptText, safeFrameDrafts[0]!),
        buildFrameSpecificDescriptorText(safeFrameDrafts[0]!),
        safeFrameCount,
        workspaceContext,
      ),
      variationSeed: sequenceVariationSeed,
    },
    width,
    height,
  );
  const boundedRenderSize =
    preliminaryPlan.frameCount > 1
      ? getScaledCanvasSize(width, height, MAX_MULTI_FRAME_RENDER_DIMENSION)
      : getScaledCanvasSize(width, height, MAX_SINGLE_FRAME_RENDER_DIMENSION);
  const boundedRenderWorkspaceContext = scaleWorkspaceContextForRender(
    workspaceContext,
    width,
    height,
    boundedRenderSize.width,
    boundedRenderSize.height,
  );
  const renderScaleDownApplied = boundedRenderSize.width !== width || boundedRenderSize.height !== height;
  const preparedFrames = safeFrameDrafts.slice(0, safeFrameCount).map((frameDraft, frameIndex) => {
    const basePlan = buildSafeRenderPlan(
      {
        ...createBaseFramePlan(
          buildFrameDescriptorText(promptText, frameDraft),
          buildFrameSpecificDescriptorText(frameDraft),
          safeFrameCount,
          boundedRenderWorkspaceContext,
        ),
        variationSeed: sequenceVariationSeed,
      },
      width,
      height,
    );
    const sanitized = sanitizeFramePlanGeometry(
      basePlan,
      boundedRenderSize.width,
      boundedRenderSize.height,
      boundedRenderWorkspaceContext,
      frameIndex,
    );
    const estimatedStrokeCount =
      sanitized.plan.subjectType === "effect"
        ? estimateEffectStrokeCount(sanitized.plan)
        : sanitized.plan.subjectType === "simple-object"
        ? estimateObjectStrokeCount(sanitized.plan)
        : sanitized.plan.subjectType === "round-character"
          ? estimateRoundCharacterStrokeCount(sanitized.plan)
          : estimateStickFigureStrokeCount(sanitized.plan);
    const estimatedObjectCount =
      sanitized.plan.subjectType === "effect"
        ? estimateEffectCount(sanitized.plan)
        : sanitized.plan.subjectType === "simple-object"
          ? estimateObjectCount(sanitized.plan)
          : 1;

    return {
      plan: sanitized.plan,
      diagnostics: {
        frameIndex,
        summary:
          safeFrameCount > 1
            ? `${buildFrameSummary(sanitized.plan)} ${frameIndex + 1}/${safeFrameCount}`
            : buildFrameSummary(sanitized.plan),
        motionBeat: resolveMotionBeatForFrame(sanitized.plan, frameIndex),
        bounds: sanitized.bounds,
        estimatedStrokeCount,
        estimatedObjectCount,
        centerLockApplied: sanitized.plan.centerLock,
        geometryClamped: sanitized.geometryClamped,
        absurdlyOversized: sanitized.absurdlyOversized,
        performanceProtectionTriggered: renderScaleDownApplied || sanitized.geometryClamped,
        renderScaleDownApplied,
        strokeColor: sanitized.plan.strokeColor,
        fillColor: sanitized.plan.objectFillColor,
      },
      sourcePose: frameDraft.pose.trim(),
      sourceDescription: frameDraft.description.trim(),
      sourceText: buildFrameSpecificDescriptorText(frameDraft),
    };
  });
  const governed = governPreparedFrames({
    userPrompt: promptText,
    generatedFramePlan,
    preparedFrames,
    workspaceContext: boundedRenderWorkspaceContext,
  });
  const governedPreparedFrames = governed.preparedFrames;

  return {
    safeFrameCount,
    boundedRenderSize,
    boundedRenderWorkspaceContext,
    preparedFrames: governedPreparedFrames,
    diagnostics: {
      frameCount: governedPreparedFrames.length,
      renderWidth: boundedRenderSize.width,
      renderHeight: boundedRenderSize.height,
      renderScaleDownApplied,
      performanceProtectionTriggered:
        renderScaleDownApplied || governedPreparedFrames.some((frame) => frame.diagnostics.geometryClamped),
      geometryClamped: governedPreparedFrames.some((frame) => frame.diagnostics.geometryClamped),
      frames: governedPreparedFrames.map((frame) => frame.diagnostics),
    },
    governanceFailureReason: governed.failureReason,
  };
};

export const analyzeGeneratedFramePlan = (
  input: GeneratedFrameRenderInput,
): GeneratedFramePlanDiagnostics | null => {
  try {
    const analysis = prepareGeneratedFrameAnalysis(input);
    return analysis.governanceFailureReason ? null : analysis.diagnostics;
  } catch (error) {
    console.warn("Failed to analyze generated frame plan before rendering.", error);
    return null;
  }
};

const buildSafeRenderPlan = (plan: FramePlan, width: number, height: number): FramePlan => {
  void width;
  void height;

  if (plan.frameCount <= MAX_FRAMES_PER_REQUEST) {
    return plan;
  }

  console.warn("Generated frame render plan exceeded MAX_FRAMES_PER_REQUEST and was truncated.", {
    frameCount: plan.frameCount,
    maxFramesPerRequest: MAX_FRAMES_PER_REQUEST,
  });

  return {
    ...plan,
    frameCount: MAX_FRAMES_PER_REQUEST,
    supportLevel: "partial",
  };
};

const getScaledCanvasSize = (width: number, height: number, maxDimension: number) => {
  const longestSide = Math.max(width, height);
  if (longestSide <= maxDimension) {
    return { width, height };
  }

  const scale = maxDimension / Math.max(1, longestSide);
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
};

const renderCanvasToPreviewUrl = (
  sourceCanvas: HTMLCanvasElement,
  previewCanvas: HTMLCanvasElement,
  smoothingEnabled: boolean,
) => {
  const previewCtx = previewCanvas.getContext("2d");
  if (!previewCtx) {
    return sourceCanvas.toDataURL("image/png");
  }

  const previewSize = getScaledCanvasSize(sourceCanvas.width, sourceCanvas.height, PREVIEW_MAX_DIMENSION);
  previewCanvas.width = previewSize.width;
  previewCanvas.height = previewSize.height;
  previewCtx.clearRect(0, 0, previewCanvas.width, previewCanvas.height);
  previewCtx.imageSmoothingEnabled = smoothingEnabled;
  previewCtx.drawImage(sourceCanvas, 0, 0, previewCanvas.width, previewCanvas.height);
  return previewCanvas.toDataURL("image/png");
};

const scaleWorkspaceContextForRender = (
  workspaceContext: DrawingAiWorkspaceContext | null | undefined,
  sourceWidth: number,
  sourceHeight: number,
  targetWidth: number,
  targetHeight: number,
) => {
  if (!workspaceContext || (sourceWidth === targetWidth && sourceHeight === targetHeight)) {
    return workspaceContext ?? null;
  }

  const scaleX = targetWidth / Math.max(1, sourceWidth);
  const scaleY = targetHeight / Math.max(1, sourceHeight);

  return {
    ...workspaceContext,
    canvasWidth: targetWidth,
    canvasHeight: targetHeight,
    currentFrameBounds: workspaceContext.currentFrameBounds
      ? {
          left: workspaceContext.currentFrameBounds.left * scaleX,
          top: workspaceContext.currentFrameBounds.top * scaleY,
          width: workspaceContext.currentFrameBounds.width * scaleX,
          height: workspaceContext.currentFrameBounds.height * scaleY,
        }
      : null,
  };
};

const applyPixelFinish = (
  canvas: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D,
  pixelSize: number,
) => {
  const scaledWidth = Math.max(1, Math.round(canvas.width / pixelSize));
  const scaledHeight = Math.max(1, Math.round(canvas.height / pixelSize));
  const pixelCanvas = document.createElement("canvas");
  pixelCanvas.width = scaledWidth;
  pixelCanvas.height = scaledHeight;
  const pixelCtx = pixelCanvas.getContext("2d");

  if (!pixelCtx) {
    return;
  }

  pixelCtx.imageSmoothingEnabled = false;
  pixelCtx.clearRect(0, 0, scaledWidth, scaledHeight);
  pixelCtx.drawImage(canvas, 0, 0, scaledWidth, scaledHeight);

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(pixelCanvas, 0, 0, scaledWidth, scaledHeight, 0, 0, canvas.width, canvas.height);
};

const buildFrameDescriptorText = (
  userPrompt: string,
  frameDraft: DrawingAiGeneratedFramePlan["frames"][number],
) => [userPrompt.trim(), frameDraft.pose.trim(), frameDraft.description.trim()].filter((value) => value.length > 0).join("\n");

const buildFrameSpecificDescriptorText = (
  frameDraft: DrawingAiGeneratedFramePlan["frames"][number],
) => [frameDraft.pose.trim(), frameDraft.description.trim()].filter((value) => value.length > 0).join("\n");

const drawComposedSceneBackdrop = (
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  plan: FramePlan,
) => {
  if (!plan.backgroundMode && plan.sceneSetting == null && plan.sceneProps.length === 0 && plan.stageBackgroundColor == null) {
    return;
  }

  ctx.save();

  const horizonY = height * 0.64;
  const sceneDescriptors = new Set(plan.sceneDescriptors.map((descriptor) => descriptor.toLowerCase()));
  const hasDescriptor = (value: string) => sceneDescriptors.has(value);
  const bioluminescent = hasDescriptor("bioluminescent");
  const crystalline = hasDescriptor("crystalline");
  const ruined = hasDescriptor("ruined");
  const overgrown = hasDescriptor("overgrown");
  const volcanic = hasDescriptor("volcanic");
  const neon = hasDescriptor("neon") || hasDescriptor("cyberpunk");
  const alien = hasDescriptor("alien");
  const ancient = hasDescriptor("ancient");

  if (plan.stageBackgroundColor) {
    ctx.fillStyle = rgba(plan.stageBackgroundColor, 0.92);
    ctx.fillRect(0, 0, width, height);
  }

  if (plan.sceneSetting === "forest") {
    ctx.fillStyle = "rgba(214, 234, 216, 0.9)";
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = "rgba(124, 161, 110, 0.26)";
    for (let index = 0; index < 5; index += 1) {
      const x = width * (0.12 + index * 0.18);
      ctx.beginPath();
      ctx.arc(x, horizonY - 120, 70, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = "rgba(104, 72, 50, 0.78)";
    for (let index = 0; index < 6; index += 1) {
      const x = width * (0.08 + index * 0.16);
      ctx.fillRect(x, horizonY - 150, 18, 180);
    }
    ctx.fillStyle = "rgba(90, 132, 78, 0.88)";
    ctx.fillRect(0, horizonY, width, height - horizonY);
  } else if (plan.sceneSetting === "canyon") {
    ctx.fillStyle = "rgba(242, 221, 196, 0.92)";
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = "rgba(187, 121, 76, 0.92)";
    ctx.beginPath();
    ctx.moveTo(0, height);
    ctx.lineTo(0, height * 0.28);
    ctx.lineTo(width * 0.22, height * 0.48);
    ctx.lineTo(width * 0.3, height);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(width, height);
    ctx.lineTo(width, height * 0.26);
    ctx.lineTo(width * 0.78, height * 0.5);
    ctx.lineTo(width * 0.68, height);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "rgba(208, 160, 112, 0.92)";
    ctx.fillRect(0, horizonY, width, height - horizonY);
  } else if (plan.sceneSetting === "cave") {
    ctx.fillStyle = "rgba(36, 40, 52, 0.96)";
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = "rgba(78, 86, 102, 0.78)";
    ctx.beginPath();
    ctx.moveTo(0, height * 0.18);
    ctx.lineTo(width * 0.12, height * 0.08);
    ctx.lineTo(width * 0.28, height * 0.22);
    ctx.lineTo(width * 0.42, height * 0.1);
    ctx.lineTo(width * 0.56, height * 0.24);
    ctx.lineTo(width * 0.72, height * 0.12);
    ctx.lineTo(width * 0.88, height * 0.22);
    ctx.lineTo(width, height * 0.14);
    ctx.lineTo(width, 0);
    ctx.lineTo(0, 0);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "rgba(62, 56, 68, 0.88)";
    ctx.fillRect(0, horizonY, width, height - horizonY);
  } else if (plan.sceneSetting === "underground") {
    ctx.fillStyle = "rgba(28, 32, 44, 0.96)";
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = "rgba(52, 60, 82, 0.54)";
    for (let index = 0; index < 6; index += 1) {
      const x = width * (0.08 + index * 0.16);
      ctx.fillRect(x, horizonY - 120 - (index % 2) * 24, 26, 180 + (index % 3) * 16);
    }
    ctx.fillStyle = "rgba(40, 48, 62, 0.92)";
    ctx.fillRect(0, horizonY, width, height - horizonY);
  } else if (plan.sceneSetting === "arena") {
    ctx.fillStyle = "rgba(228, 221, 205, 0.96)";
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = "rgba(152, 126, 92, 0.9)";
    ctx.fillRect(0, horizonY + 10, width, height - horizonY);
    ctx.strokeStyle = "rgba(122, 92, 66, 0.76)";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(width * 0.5, horizonY + 88, width * 0.3, Math.PI, Math.PI * 2);
    ctx.stroke();
  } else if (plan.sceneSetting === "rooftop") {
    ctx.fillStyle = "rgba(220, 228, 244, 0.95)";
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = "rgba(126, 142, 171, 0.42)";
    for (let index = 0; index < 7; index += 1) {
      const buildingWidth = 54 + (index % 3) * 18;
      const x = width * 0.06 + index * 92;
      const buildingHeight = 150 + (index % 4) * 26;
      ctx.fillRect(x, horizonY - buildingHeight, buildingWidth, buildingHeight);
    }
    ctx.fillStyle = "rgba(70, 74, 86, 0.94)";
    ctx.fillRect(0, horizonY + 28, width, height - horizonY);
    ctx.fillStyle = "rgba(48, 52, 60, 0.9)";
    ctx.fillRect(width * 0.08, horizonY - 4, width * 0.84, 16);
  } else if (plan.sceneSetting === "bedroom") {
    ctx.fillStyle = "rgba(237, 228, 220, 0.96)";
    ctx.fillRect(0, 0, width, horizonY);
    ctx.fillStyle = "rgba(196, 176, 156, 0.96)";
    ctx.fillRect(0, horizonY, width, height - horizonY);
    ctx.fillStyle = "rgba(156, 123, 102, 0.92)";
    ctx.fillRect(width * 0.1, horizonY - 70, width * 0.34, 90);
    ctx.fillStyle = "rgba(226, 233, 238, 0.95)";
    ctx.fillRect(width * 0.13, horizonY - 48, width * 0.28, 48);
  } else if (plan.sceneSetting === "city") {
    ctx.fillStyle = "rgba(216, 226, 242, 0.95)";
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = "rgba(116, 128, 158, 0.58)";
    for (let index = 0; index < 8; index += 1) {
      const buildingWidth = 48 + (index % 3) * 18;
      const x = width * 0.04 + index * 84;
      const buildingHeight = 130 + (index % 5) * 22;
      ctx.fillRect(x, horizonY - buildingHeight, buildingWidth, buildingHeight);
    }
    ctx.fillStyle = "rgba(74, 82, 98, 0.94)";
    ctx.fillRect(0, horizonY + 12, width, height - horizonY);
  } else if (plan.sceneSetting === "neighborhood") {
    ctx.fillStyle = "rgba(221, 233, 247, 0.96)";
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = "rgba(190, 212, 234, 0.72)";
    ctx.fillRect(0, horizonY - 12, width, 84);
    for (const [x, widthScale, heightValue, color] of [
      [0.06, 0.15, 136, "rgba(178, 144, 126, 0.92)"],
      [0.28, 0.16, 124, "rgba(154, 166, 188, 0.92)"],
      [0.54, 0.18, 142, "rgba(196, 172, 146, 0.92)"],
      [0.78, 0.14, 118, "rgba(164, 150, 176, 0.92)"],
    ] as const) {
      const houseX = width * x;
      const houseWidth = width * widthScale;
      ctx.fillStyle = color;
      ctx.fillRect(houseX, horizonY - heightValue, houseWidth, heightValue);
      ctx.fillStyle = "rgba(124, 92, 78, 0.94)";
      ctx.beginPath();
      ctx.moveTo(houseX - 10, horizonY - heightValue + 12);
      ctx.lineTo(houseX + houseWidth * 0.5, horizonY - heightValue - 34);
      ctx.lineTo(houseX + houseWidth + 10, horizonY - heightValue + 12);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "rgba(242, 231, 189, 0.9)";
      ctx.fillRect(houseX + houseWidth * 0.18, horizonY - heightValue + 34, houseWidth * 0.18, 28);
      ctx.fillRect(houseX + houseWidth * 0.56, horizonY - heightValue + 40, houseWidth * 0.16, 24);
    }
    ctx.fillStyle = "rgba(118, 124, 134, 0.92)";
    ctx.fillRect(0, horizonY + 26, width, height - horizonY);
    ctx.fillStyle = "rgba(210, 212, 214, 0.98)";
    ctx.fillRect(0, horizonY + 6, width, 18);
    ctx.strokeStyle = "rgba(96, 88, 76, 0.9)";
    ctx.lineWidth = 4;
    ctx.beginPath();
    for (let index = 0; index < 6; index += 1) {
      const x = width * 0.08 + index * 152;
      ctx.moveTo(x, horizonY + 18);
      ctx.lineTo(x, horizonY - 38);
    }
    ctx.moveTo(width * 0.08, horizonY - 6);
    ctx.lineTo(width * 0.82, horizonY - 6);
    ctx.stroke();
  } else if (plan.sceneSetting === "alley") {
    ctx.fillStyle = "rgba(208, 214, 224, 0.95)";
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = "rgba(132, 140, 152, 0.92)";
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(width * 0.18, 0);
    ctx.lineTo(width * 0.34, height);
    ctx.lineTo(0, height);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(width, 0);
    ctx.lineTo(width * 0.82, 0);
    ctx.lineTo(width * 0.66, height);
    ctx.lineTo(width, height);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "rgba(90, 96, 106, 0.92)";
    ctx.fillRect(width * 0.34, horizonY + 28, width * 0.32, height - horizonY);
  } else if (plan.sceneSetting === "plains") {
    ctx.fillStyle = "rgba(220, 235, 219, 0.96)";
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = "rgba(142, 176, 118, 0.88)";
    ctx.fillRect(0, horizonY, width, height - horizonY);
    ctx.fillStyle = "rgba(116, 148, 108, 0.42)";
    ctx.beginPath();
    ctx.moveTo(0, horizonY + 22);
    ctx.quadraticCurveTo(width * 0.28, horizonY - 12, width * 0.54, horizonY + 20);
    ctx.quadraticCurveTo(width * 0.76, horizonY + 38, width, horizonY + 6);
    ctx.lineTo(width, height);
    ctx.lineTo(0, height);
    ctx.closePath();
    ctx.fill();
  } else if (plan.sceneSetting === "mountains") {
    ctx.fillStyle = "rgba(220, 228, 239, 0.96)";
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = "rgba(116, 132, 156, 0.72)";
    ctx.beginPath();
    ctx.moveTo(0, horizonY + 8);
    ctx.lineTo(width * 0.16, horizonY - 84);
    ctx.lineTo(width * 0.32, horizonY + 6);
    ctx.lineTo(width * 0.46, horizonY - 110);
    ctx.lineTo(width * 0.62, horizonY + 12);
    ctx.lineTo(width * 0.78, horizonY - 92);
    ctx.lineTo(width, horizonY + 2);
    ctx.lineTo(width, height);
    ctx.lineTo(0, height);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "rgba(126, 158, 122, 0.88)";
    ctx.fillRect(0, horizonY + 14, width, height - horizonY);
  } else if (plan.sceneSetting === "room") {
    ctx.fillStyle = "rgba(229, 228, 222, 0.96)";
    ctx.fillRect(0, 0, width, horizonY);
    ctx.fillStyle = "rgba(197, 184, 164, 0.96)";
    ctx.fillRect(0, horizonY, width, height - horizonY);
    ctx.strokeStyle = "rgba(120, 108, 96, 0.62)";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(0, horizonY);
    ctx.lineTo(width, horizonY);
    ctx.moveTo(width * 0.28, horizonY);
    ctx.lineTo(width * 0.28, 0);
    ctx.moveTo(width * 0.72, horizonY);
    ctx.lineTo(width * 0.72, 0);
    ctx.stroke();
  } else if (plan.sceneSetting === "temple") {
    ctx.fillStyle = "rgba(220, 212, 196, 0.96)";
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = "rgba(164, 148, 118, 0.88)";
    for (let index = 0; index < 4; index += 1) {
      const x = width * (0.14 + index * 0.2);
      ctx.fillRect(x, horizonY - 150, 34, 190);
    }
    ctx.fillStyle = "rgba(144, 128, 96, 0.92)";
    ctx.fillRect(0, horizonY + 14, width, height - horizonY);
  } else if (plan.backgroundOverlayShape == null && plan.stageBackgroundColor == null) {
    ctx.fillStyle = "rgba(232, 236, 240, 0.9)";
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = "rgba(188, 198, 182, 0.9)";
    ctx.fillRect(0, horizonY, width, height - horizonY);
  }

  if (volcanic || plan.sceneProps.includes("lava-pools")) {
    ctx.fillStyle = "rgba(255, 128, 48, 0.18)";
    ctx.fillRect(0, horizonY - 18, width, 86);
  }

  if (neon) {
    ctx.fillStyle = "rgba(57, 208, 255, 0.12)";
    ctx.fillRect(0, 0, width, height * 0.46);
  }

  if (bioluminescent) {
    ctx.fillStyle = "rgba(112, 255, 194, 0.18)";
    for (let index = 0; index < 18; index += 1) {
      const x = width * (0.06 + (index % 6) * 0.16);
      const y = horizonY - 40 - Math.floor(index / 6) * 42;
      ctx.beginPath();
      ctx.arc(x, y, 12 + (index % 3) * 4, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  if (plan.sceneProps.includes("boulders")) {
    ctx.fillStyle = "rgba(108, 114, 122, 0.88)";
    const rockY = height * 0.76;
    [width * 0.18, width * 0.72].forEach((x, index) => {
      ctx.beginPath();
      ctx.ellipse(x, rockY + index * 12, 38, 24, index === 0 ? -0.2 : 0.18, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  if (plan.sceneProps.includes("trees") && plan.sceneSetting !== "forest") {
    ctx.fillStyle = "rgba(96, 70, 52, 0.84)";
    ctx.fillRect(width * 0.14, horizonY - 110, 18, 140);
    ctx.fillRect(width * 0.8, horizonY - 96, 16, 126);
    ctx.fillStyle = "rgba(88, 142, 82, 0.82)";
    ctx.beginPath();
    ctx.arc(width * 0.15, horizonY - 126, 54, 0, Math.PI * 2);
    ctx.arc(width * 0.81, horizonY - 112, 48, 0, Math.PI * 2);
    ctx.fill();
  }

  if (plan.sceneProps.includes("stalactites")) {
    ctx.fillStyle = "rgba(92, 100, 118, 0.84)";
    for (let index = 0; index < 6; index += 1) {
      const x = width * (0.08 + index * 0.16);
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x - 18, 54 + (index % 2) * 22);
      ctx.lineTo(x + 14, 68 + (index % 3) * 18);
      ctx.closePath();
      ctx.fill();
    }
  }

  if (plan.sceneProps.includes("pillars")) {
    ctx.fillStyle = ancient ? "rgba(166, 150, 124, 0.92)" : "rgba(138, 136, 132, 0.9)";
    [width * 0.18, width * 0.82].forEach((x) => {
      ctx.fillRect(x - 18, horizonY - 132, 36, 170);
      ctx.fillRect(x - 28, horizonY - 142, 56, 16);
      ctx.fillRect(x - 30, horizonY + 24, 60, 18);
    });
  }

  if (plan.sceneProps.includes("crystals")) {
    ctx.fillStyle = crystalline ? "rgba(130, 234, 255, 0.58)" : "rgba(164, 198, 255, 0.34)";
    [width * 0.24, width * 0.74].forEach((x, index) => {
      ctx.beginPath();
      ctx.moveTo(x, horizonY - 78);
      ctx.lineTo(x + 24, horizonY - 10);
      ctx.lineTo(x + 8, horizonY + 32);
      ctx.lineTo(x - 10, horizonY + 32);
      ctx.lineTo(x - 24, horizonY - 10);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = "rgba(110, 170, 220, 0.7)";
      ctx.stroke();
      if (index === 0 && bioluminescent) {
        ctx.fillStyle = "rgba(112, 255, 194, 0.24)";
        ctx.beginPath();
        ctx.arc(x, horizonY - 20, 22, 0, Math.PI * 2);
        ctx.fill();
      }
    });
  }

  if (plan.sceneProps.includes("mushrooms")) {
    ctx.fillStyle = bioluminescent ? "rgba(92, 248, 178, 0.68)" : "rgba(174, 118, 176, 0.64)";
    [width * 0.12, width * 0.2, width * 0.82].forEach((x) => {
      ctx.beginPath();
      ctx.ellipse(x, horizonY + 8, 22, 12, 0, Math.PI, 0, true);
      ctx.closePath();
      ctx.fill();
      ctx.fillRect(x - 4, horizonY + 8, 8, 28);
    });
  }

  if (plan.sceneProps.includes("banners")) {
    ctx.fillStyle = "rgba(158, 42, 42, 0.72)";
    [width * 0.24, width * 0.76].forEach((x) => {
      ctx.fillRect(x, horizonY - 144, 10, 96);
      ctx.beginPath();
      ctx.moveTo(x + 10, horizonY - 140);
      ctx.lineTo(x + 72, horizonY - 124);
      ctx.lineTo(x + 28, horizonY - 90);
      ctx.lineTo(x + 72, horizonY - 56);
      ctx.lineTo(x + 10, horizonY - 44);
      ctx.closePath();
      ctx.fill();
    });
  }

  if (plan.sceneProps.includes("torches")) {
    ctx.strokeStyle = "rgba(82, 56, 34, 0.9)";
    ctx.lineWidth = 6;
    [width * 0.16, width * 0.84].forEach((x) => {
      ctx.beginPath();
      ctx.moveTo(x, horizonY + 20);
      ctx.lineTo(x, horizonY - 44);
      ctx.stroke();
      ctx.fillStyle = "rgba(255, 180, 92, 0.74)";
      ctx.beginPath();
      ctx.moveTo(x, horizonY - 80);
      ctx.quadraticCurveTo(x - 18, horizonY - 54, x, horizonY - 36);
      ctx.quadraticCurveTo(x + 18, horizonY - 54, x, horizonY - 80);
      ctx.closePath();
      ctx.fill();
    });
  }

  if (plan.sceneProps.includes("rubble") || ruined) {
    ctx.fillStyle = "rgba(124, 120, 116, 0.74)";
    for (const [x, y, rx, ry] of [
      [width * 0.14, horizonY + 34, 42, 18],
      [width * 0.26, horizonY + 40, 30, 14],
      [width * 0.76, horizonY + 38, 38, 16],
    ] as const) {
      ctx.beginPath();
      ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  if (plan.sceneProps.includes("vines") || overgrown) {
    ctx.strokeStyle = "rgba(72, 120, 76, 0.7)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(width * 0.22, 0);
    ctx.quadraticCurveTo(width * 0.18, horizonY * 0.28, width * 0.26, horizonY * 0.72);
    ctx.moveTo(width * 0.78, 0);
    ctx.quadraticCurveTo(width * 0.84, horizonY * 0.24, width * 0.76, horizonY * 0.76);
    ctx.stroke();
  }

  if (plan.sceneProps.includes("crowd")) {
    ctx.fillStyle = "rgba(58, 60, 68, 0.36)";
    for (let index = 0; index < 9; index += 1) {
      const x = width * (0.08 + index * 0.1);
      ctx.beginPath();
      ctx.arc(x, horizonY - 56 + (index % 2) * 8, 18, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillRect(x - 10, horizonY - 38 + (index % 2) * 8, 20, 42);
    }
  }

  if (plan.sceneProps.includes("neon-signs")) {
    ctx.fillStyle = "rgba(64, 228, 255, 0.54)";
    ctx.fillRect(width * 0.16, horizonY - 122, 92, 28);
    ctx.fillStyle = "rgba(255, 72, 156, 0.48)";
    ctx.fillRect(width * 0.68, horizonY - 146, 118, 24);
  }

  if (plan.sceneProps.includes("fence")) {
    ctx.strokeStyle = "rgba(92, 86, 74, 0.88)";
    ctx.lineWidth = 4;
    ctx.beginPath();
    for (let index = 0; index < 8; index += 1) {
      const x = width * 0.08 + index * 92;
      ctx.moveTo(x, horizonY + 22);
      ctx.lineTo(x, horizonY - 26);
    }
    ctx.moveTo(width * 0.08, horizonY - 10);
    ctx.lineTo(width * 0.76, horizonY - 10);
    ctx.moveTo(width * 0.08, horizonY + 12);
    ctx.lineTo(width * 0.76, horizonY + 12);
    ctx.stroke();
  }

  if (plan.sceneProps.includes("lava-pools")) {
    ctx.fillStyle = "rgba(255, 116, 42, 0.52)";
    ctx.beginPath();
    ctx.ellipse(width * 0.28, horizonY + 58, 72, 18, 0, 0, Math.PI * 2);
    ctx.ellipse(width * 0.74, horizonY + 66, 94, 22, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  if (plan.sceneProps.includes("cables")) {
    ctx.strokeStyle = "rgba(62, 68, 78, 0.72)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, height * 0.18);
    ctx.quadraticCurveTo(width * 0.22, height * 0.1, width * 0.46, height * 0.18);
    ctx.quadraticCurveTo(width * 0.72, height * 0.26, width, height * 0.12);
    ctx.stroke();
  }

  if (plan.sceneProps.includes("buildings") && plan.sceneSetting !== "city" && plan.sceneSetting !== "rooftop") {
    ctx.fillStyle = "rgba(102, 116, 142, 0.32)";
    for (let index = 0; index < 4; index += 1) {
      const buildingWidth = 54 + (index % 2) * 16;
      const x = width * 0.1 + index * 140;
      const buildingHeight = 92 + (index % 3) * 24;
      ctx.fillRect(x, horizonY - buildingHeight, buildingWidth, buildingHeight);
    }
  }

  if (plan.sceneProps.includes("ledge") && plan.sceneSetting !== "rooftop") {
    ctx.fillStyle = "rgba(96, 98, 106, 0.82)";
    ctx.fillRect(width * 0.62, horizonY - 6, width * 0.2, 14);
  }

  if (alien) {
    ctx.fillStyle = "rgba(132, 182, 255, 0.14)";
    ctx.beginPath();
    ctx.arc(width * 0.18, height * 0.18, 54, 0, Math.PI * 2);
    ctx.arc(width * 0.82, height * 0.12, 30, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
};

const resolvePairedStickFigurePlans = (plan: FramePlan): [FramePlan, FramePlan] => {
  const primaryPlacementX = plan.placementX === "center" ? "left" : plan.placementX;
  const secondaryPlacementX =
    primaryPlacementX === "left" || primaryPlacementX === "left-entry" || primaryPlacementX === "off-left" ? "right" : "left";

  const primaryPlan: FramePlan = {
    ...plan,
    placementX: primaryPlacementX,
    facing: plan.facing === "front" ? (primaryPlacementX === "left" ? "right" : "left") : plan.facing,
    secondaryFigureEnabled: false,
  };

  const secondaryPlan: FramePlan = {
    ...plan,
    placementX: secondaryPlacementX,
    strokeColor: plan.secondaryFigureColor ?? plan.strokeColor,
    filledHeadColor: plan.filledHeadColor ?? plan.secondaryFigureColor ?? plan.strokeColor,
    facialFeaturesEnabled: false,
    eyeColor: null,
    facing: secondaryPlacementX === "right" ? "left" : "right",
    scale: plan.scale,
    secondaryFigureEnabled: false,
  };

  return [primaryPlan, secondaryPlan];
};

const renderPreparedFrameToCanvas = ({
  preparedFrame,
  workspaceContext,
  width,
  height,
}: {
  preparedFrame: PreparedGeneratedFrame;
  workspaceContext: DrawingAiWorkspaceContext | null;
  width: number;
  height: number;
}) => {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");

  if (!ctx) {
    return null;
  }

  ctx.clearRect(0, 0, width, height);

  if (
    preparedFrame.plan.backgroundMode ||
    preparedFrame.plan.sceneSetting != null ||
    preparedFrame.plan.sceneProps.length > 0 ||
    preparedFrame.plan.stageBackgroundColor != null
  ) {
    drawComposedSceneBackdrop(ctx, width, height, preparedFrame.plan);
  }

  if (preparedFrame.plan.backgroundOverlayShape) {
    drawBackgroundOverlay(ctx, width, height, preparedFrame.plan, preparedFrame.diagnostics.frameIndex);
  }

  if (preparedFrame.plan.hasShockwaveOverlay && preparedFrame.plan.subjectType !== "effect") {
    drawShockwaveOverlay(ctx, width, height, preparedFrame.plan, preparedFrame.diagnostics.frameIndex);
  }

  if (preparedFrame.plan.subjectType !== "simple-object" && preparedFrame.plan.subjectType !== "effect") {
    if (preparedFrame.plan.hasExplosionOverlay) {
      drawExplosionOverlay(ctx, width, height, preparedFrame.plan, preparedFrame.diagnostics.frameIndex);
    }
    if (preparedFrame.plan.hasSmokeOverlay) {
      drawSmokeOverlay(ctx, width, height, preparedFrame.plan, preparedFrame.diagnostics.frameIndex);
    }
  }

  if (preparedFrame.plan.subjectType === "effect") {
    renderEffect(ctx, width, height, preparedFrame.plan, workspaceContext, preparedFrame.diagnostics.frameIndex);
  } else if (preparedFrame.plan.subjectType === "simple-object") {
    renderSimpleObject(ctx, width, height, preparedFrame.plan, workspaceContext, preparedFrame.diagnostics.frameIndex);
  } else if (preparedFrame.plan.subjectType === "round-character") {
    renderRoundCharacter(ctx, width, height, preparedFrame.plan, workspaceContext);
  } else if (preparedFrame.plan.secondaryFigureEnabled) {
    const [primaryPlan, secondaryPlan] = resolvePairedStickFigurePlans(preparedFrame.plan);
    renderStickFigure(ctx, width, height, primaryPlan, workspaceContext, preparedFrame.diagnostics.frameIndex);
    renderStickFigure(ctx, width, height, secondaryPlan, workspaceContext, preparedFrame.diagnostics.frameIndex);
  } else {
    renderStickFigure(ctx, width, height, preparedFrame.plan, workspaceContext, preparedFrame.diagnostics.frameIndex);
  }

  const pixelSize = preparedFrame.plan.pixelStyle ? 4 : preparedFrame.plan.arcadeStyle ? 3 : null;
  if (pixelSize) {
    applyPixelFinish(canvas, ctx, pixelSize);
  }

  return canvas;
};

const scaleRenderedCanvasToOutput = ({
  sourceCanvas,
  outputWidth,
  outputHeight,
  smoothingEnabled,
}: {
  sourceCanvas: HTMLCanvasElement;
  outputWidth: number;
  outputHeight: number;
  smoothingEnabled: boolean;
}) => {
  if (sourceCanvas.width === outputWidth && sourceCanvas.height === outputHeight) {
    return sourceCanvas;
  }

  const outputCanvas = document.createElement("canvas");
  outputCanvas.width = outputWidth;
  outputCanvas.height = outputHeight;
  const outputCtx = outputCanvas.getContext("2d");
  if (!outputCtx) {
    return null;
  }

  outputCtx.clearRect(0, 0, outputWidth, outputHeight);
  outputCtx.imageSmoothingEnabled = smoothingEnabled;
  outputCtx.drawImage(sourceCanvas, 0, 0, outputWidth, outputHeight);
  return outputCanvas;
};

export const renderGeneratedFrame = ({
  userPrompt,
  generatedFramePlan,
  workspaceContext = null,
  width,
  height,
}: GeneratedFrameRenderInput): GeneratedFrameRenderResult => {
  if (typeof document === "undefined") {
    return {
      ok: false,
      reason: "Local frame rendering requires a browser canvas environment.",
    };
  }

  if (!generatedFramePlan.frames.length) {
    return {
      ok: false,
      reason: "No generated frames were available to render.",
    };
  }

  try {
    const {
      preparedFrames,
      diagnostics,
      boundedRenderSize,
      boundedRenderWorkspaceContext,
      governanceFailureReason,
    } = prepareGeneratedFrameAnalysis({
      userPrompt,
      generatedFramePlan,
      workspaceContext,
      width,
      height,
    });

    if (preparedFrames.length === 0) {
      return {
        ok: false,
        reason: "Generate Frames analysis produced no renderable frames.",
      };
    }

    if (governanceFailureReason) {
      return {
        ok: false,
        reason: governanceFailureReason,
      };
    }

    const renderedFrames = preparedFrames.map((preparedFrame) => {
      const renderCanvas = renderPreparedFrameToCanvas({
        preparedFrame,
        workspaceContext: boundedRenderWorkspaceContext,
        width: boundedRenderSize.width,
        height: boundedRenderSize.height,
      });

      if (!renderCanvas) {
        return null;
      }

      const outputCanvas = scaleRenderedCanvasToOutput({
        sourceCanvas: renderCanvas,
        outputWidth: width,
        outputHeight: height,
        smoothingEnabled: !(preparedFrame.plan.pixelStyle || preparedFrame.plan.arcadeStyle),
      });

      if (!outputCanvas) {
        return null;
      }

      const outputCtx = outputCanvas.getContext("2d");
      if (!outputCtx) {
        return null;
      }

      return {
        bitmap: outputCtx.getImageData(0, 0, outputCanvas.width, outputCanvas.height),
        previewUrl: null,
        summary: preparedFrame.diagnostics.summary,
      };
    });

    if (renderedFrames.some((frame) => frame == null)) {
      return {
        ok: false,
        reason: "Generate Frames could not convert every prepared frame into bitmap output.",
      };
    }

    const completeFrames = renderedFrames.filter((frame): frame is NonNullable<typeof frame> => frame != null);
    const summary = buildFrameSummary(preparedFrames[0]!.plan);
    const supportLevel = preparedFrames.some((frame) => frame.plan.supportLevel === "partial") ? "partial" : "full";

    return {
      ok: true,
      bitmap: completeFrames[0]!.bitmap,
      previewUrl: completeFrames[0]!.previewUrl,
      summary,
      supportLevel,
      diagnostics,
      workspaceIntent: generatedFramePlan.workspaceIntent ?? null,
      frames: completeFrames,
    };
  } catch (error) {
    console.error("Generate Frames local rendering failed.", error);
    return {
      ok: false,
      reason: error instanceof Error ? error.message : "Unknown frame rendering failure.",
    };
  }
};
