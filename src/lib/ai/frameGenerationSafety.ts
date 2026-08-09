export const MAX_FRAMES_PER_REQUEST = 20;
export const FRAME_GENERATION_DEBOUNCE_MS = 250;

export type DrawingAiFrameRequestKind =
  | "single-frame"
  | "in-between"
  | "continuation"
  | "small-animation";

const IN_BETWEEN_PATTERN = /\b(in[- ]between|inbetween|between (?:these|those|the) frames|bridge frame)\b/i;
const CONTINUATION_PATTERN =
  /\b(next frame|continu(?:e|ation)|after this|after that|follow[- ]through|same animation|same sequence|same scene|same project)\b/i;
const SEQUENCE_WIDE_EDIT_PATTERN =
  /\b(all frames|every frame|whole animation|entire animation|whole sequence|entire sequence|throughout the animation|throughout the sequence|across all frames|across the whole animation)\b/i;
const LARGE_ANIMATION_PATTERN =
  /\b(full animation|whole animation|complete animation|entire animation|full sequence|whole sequence|complete sequence)\b/i;
const MULTI_STEP_SEQUENCE_PATTERN =
  /\b(then|after that|followed by|ending in|ending with|ends in|ends with|before landing|before settling|before recovering)\b/i;
const STAGED_ACTION_PATTERN =
  /\b(fireball|projectile|martial arts guard stance|guard stance|spin(?:ning)?|airborne|right hand|left hand|multi-step|combo)\b/i;
const SMALL_ANIMATION_PATTERN =
  /\b(animation|animate|sequence|timeline frames|bounce|bouncing|roll(?:ing)?|walk(?:ing|s)?|run(?:ning|s)?|wav(?:e|es|ed|ing)|stumble|sway|bob|breath(?:e|es|ing)|breathing hard|hard breathing|pant(?:ing)?|inhale|exhale|jump and land|punch(?:,? then recover| then recover)?|kick(?:,? then land| then land)?|explosion|explode|blast|fireball|projectile|debris|lightning|lightning strike|bolt|fire|flame|rain|rainfall|energy slash|slash effect|slash arc|sword swing|recoil|recover|recovery|dribbl(?:e|ing)|settl(?:e|ing)|fade(?: out)?|impact|contact|break(?:ing)?|shatter(?:ing)?|smash(?:ing)?|morph(?:ing)?|transform(?:ing)?|shockwave|scroll(?:ing)?|move the background|moving background|background move(?:ment)?|camera moving|camera movement|camera move|camera follow|parallax|spinning fan|fan spinning|rotating fan|spinning propeller)\b/i;
const EXPLICIT_THREE_FRAME_PATTERN = /\b(3[- ]frame|three[- ]frame|three frame|3 frame)\b/i;
const EXPLICIT_FRAME_COUNT_PATTERN =
  /\b([1-9]|1\d|20)\s*[- ]?frames?\b|\b(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s*[- ]?frames?\b/i;
const LARGE_SEQUENCE_PATTERN =
  /\b(full animation|whole animation|complete animation|entire animation|full sequence|whole sequence|complete sequence|ultimate attack|apocalypse|morph(?:ing)? .* anything|add (?:more )?in[- ]betweens?|more in[- ]betweens?|smooth(?:er)? animation)\b/i;
const MOTION_COMPLETION_BASELINE_PATTERN =
  /\b(bounc(?:e|ing)|rebound|squash|sett(?:le|ling)|walk(?:ing|s)?|run(?:ning|s)?|wav(?:e|es|ed|ing)|stride|step impact|step plant|breath(?:e|es|ing)|breathing hard|pant(?:ing)?|inhale|exhale|punch(?:,? then recover| then recover)?|follow[- ]through|recovery|explosion|explode|blast|smoke|debris|fade(?: out| away)?|disintegrat(?:e|ing)|dissipat(?:e|ing)|lightning|shockwave|break(?:ing)?|shatter(?:ing)?|smash(?:ing)?|smoother|cleaner|faster|quicker|snappier|cartoony|heavier|weightier)\b/i;
const THREE_BEAT_PATTERN =
  /\b(walk(?:ing|s)?(?: in place)?|walk cycle|walking cycle|run(?:ning|s)?(?: in place)?|run cycle|treadmill|wav(?:e|es|ed|ing)|bounc(?:e|ing)(?: in place)?|breath(?:e|es|ing)|breathing hard|pant(?:ing)?|gravity|explosion|explode|blast|debris|fall(?:ing)? .* explosion|jump and land|lightning|lightning strike|bolt|fire|flame|rain|rainfall|energy slash|slash effect|slash arc|sword swing|morph(?:ing)?|transform(?:ing)?|shockwave|scroll(?:ing)?|moving background|background movement|camera moving|camera movement|camera move|camera follow|parallax|spinning fan|fan spinning|rotating fan)\b/i;
const MULTI_STAGE_MOTION_PATTERN =
  /\b(smooth(?:er)?|dribbl(?:e|ing)|settl(?:e|ing)|stop(?:ping)?|until it stops|fade(?: out| away)?|buildup|build up|impact|contact|rebound|bounce a little|recover|recovery|recoil|multiple hits|afterglow|follow[- ]through|break(?:ing)?|shatter(?:ing)?|smash(?:ing)?|realistic|quickly|slowly)\b/i;
const PLAIN_PUNCH_SEQUENCE_PATTERN = /\bpunch(?:ing|es)?\b/i;
const EXPLICIT_SINGLE_FRAME_PATTERN =
  /\b(single frame|one frame|still frame|setup frame|opening frame|first frame|start(?:ing)? point|starting scene|opening scene|initial scene|first still|just the opening|just the start|do not animate|don't animate|no animation|not an animation|still image|single setup)\b/i;
const EFFECT_BASELINE_PATTERN =
  /\b(explosion|explode|blast|detonation|fireball|lightning|lightning strike|bolt|shockwave|dusty shockwave|smoke|dust cloud|fire|flame)\b/i;
const GENERAL_EVENT_PATTERN =
  /\b(explosion|explode|blast|detonation|fireball|projectile|lightning|lightning strike|bolt|shockwave|smoke bomb|eruption|erupt(?:ing|ion)?|impact|bullet hitting the ground|bullet hit|bullet impact|hit(?:ting)? the ground|collision|collid(?:e|ing)|crash(?:ing)?|slam(?:ming)?|break(?:ing)?|shatter(?:ing)?|smash(?:ing)?|burst(?:ing)?|release(?:s|ing)?|flash)\b/i;
const GENERAL_ACTION_ANIMATION_PATTERN =
  /\b(fight(?:ing)?|duel(?:ing)?|battle|chase|run(?:ning|s)?|walk(?:ing|s)?|wav(?:e|es|ed|ing)|jump(?:ing|s)?|fall(?:ing)?|throw(?:ing|s)?|swing(?:ing|s)?|slash(?:ing)?|punch(?:ing|es)?|kick(?:ing|s)?|breath(?:e|es|ing)|pant(?:ing)?)\b/i;

const parseExplicitFrameCount = (prompt: string) => {
  const match = prompt.match(EXPLICIT_FRAME_COUNT_PATTERN);
  if (!match) {
    return null;
  }

  const numericValue = match[1] ? Number.parseInt(match[1], 10) : null;
  if (numericValue && Number.isFinite(numericValue)) {
    return clampRequestedFrameCount(numericValue);
  }

  const word = (match[2] ?? "").toLowerCase();
  const wordValueMap: Record<string, number> = {
    one: 1,
    two: 2,
    three: 3,
    four: 4,
    five: 5,
    six: 6,
    seven: 7,
    eight: 8,
    nine: 9,
    ten: 10,
    eleven: 11,
    twelve: 12,
  };
  return wordValueMap[word] ? clampRequestedFrameCount(wordValueMap[word]) : null;
};

export const inferDrawingAiFrameRequestKind = (prompt: string): DrawingAiFrameRequestKind => {
  const normalizedPrompt = prompt.trim();
  if (!normalizedPrompt) {
    return "single-frame";
  }

  if (IN_BETWEEN_PATTERN.test(normalizedPrompt)) {
    return "in-between";
  }

  if (EXPLICIT_SINGLE_FRAME_PATTERN.test(normalizedPrompt)) {
    return "single-frame";
  }

  if (CONTINUATION_PATTERN.test(normalizedPrompt)) {
    return "continuation";
  }

  if (SEQUENCE_WIDE_EDIT_PATTERN.test(normalizedPrompt)) {
    return "small-animation";
  }

  if (
    MULTI_STEP_SEQUENCE_PATTERN.test(normalizedPrompt) &&
    (GENERAL_EVENT_PATTERN.test(normalizedPrompt) || GENERAL_ACTION_ANIMATION_PATTERN.test(normalizedPrompt) || STAGED_ACTION_PATTERN.test(normalizedPrompt))
  ) {
    return "small-animation";
  }

  if (
    LARGE_ANIMATION_PATTERN.test(normalizedPrompt) ||
    SMALL_ANIMATION_PATTERN.test(normalizedPrompt) ||
    GENERAL_EVENT_PATTERN.test(normalizedPrompt) ||
    GENERAL_ACTION_ANIMATION_PATTERN.test(normalizedPrompt)
  ) {
    return "small-animation";
  }

  return "single-frame";
};

export const resolveRequestedFrameCount = (prompt: string) => {
  const requestKind = inferDrawingAiFrameRequestKind(prompt);
  const explicitFrameCount = parseExplicitFrameCount(prompt);

  if (explicitFrameCount != null) {
    return explicitFrameCount;
  }

  if (EXPLICIT_SINGLE_FRAME_PATTERN.test(prompt)) {
    return 1;
  }

  if (requestKind === "in-between" || requestKind === "continuation") {
    return 1;
  }

  if (requestKind === "small-animation") {
    if (
      MULTI_STEP_SEQUENCE_PATTERN.test(prompt) &&
      (GENERAL_EVENT_PATTERN.test(prompt) || GENERAL_ACTION_ANIMATION_PATTERN.test(prompt) || STAGED_ACTION_PATTERN.test(prompt))
    ) {
      return 12;
    }

    if ((EFFECT_BASELINE_PATTERN.test(prompt) || GENERAL_EVENT_PATTERN.test(prompt)) && !EXPLICIT_SINGLE_FRAME_PATTERN.test(prompt)) {
      return 12;
    }

    if (LARGE_SEQUENCE_PATTERN.test(prompt)) {
      return 16;
    }

    if (
      MOTION_COMPLETION_BASELINE_PATTERN.test(prompt) ||
      MULTI_STAGE_MOTION_PATTERN.test(prompt) ||
      SEQUENCE_WIDE_EDIT_PATTERN.test(prompt)
    ) {
      return 10;
    }

    if (
      EXPLICIT_THREE_FRAME_PATTERN.test(prompt) ||
      LARGE_ANIMATION_PATTERN.test(prompt) ||
      THREE_BEAT_PATTERN.test(prompt) ||
      (PLAIN_PUNCH_SEQUENCE_PATTERN.test(prompt) && !EXPLICIT_SINGLE_FRAME_PATTERN.test(prompt))
    ) {
      return 8;
    }
    return 6;
  }

  return 1;
};

export const clampRequestedFrameCount = (count: number) =>
  Math.max(1, Math.min(MAX_FRAMES_PER_REQUEST, Math.floor(Number.isFinite(count) ? count : 1)));

export const clampFrameDraftsToRequest = <T>(
  frames: readonly T[] | null | undefined,
  requestedFrameCount: number,
  warningContext: string,
) => {
  const safeFrames = Array.isArray(frames) ? frames : [];
  const safeRequestedFrameCount = clampRequestedFrameCount(requestedFrameCount);
  const hardCappedFrames =
    safeFrames.length > MAX_FRAMES_PER_REQUEST ? safeFrames.slice(0, MAX_FRAMES_PER_REQUEST) : safeFrames;

  if (safeFrames.length > MAX_FRAMES_PER_REQUEST) {
    console.warn(`${warningContext}: frame count exceeded MAX_FRAMES_PER_REQUEST and was truncated.`, {
      requestedFrameCount: safeRequestedFrameCount,
      returnedFrameCount: safeFrames.length,
      maxFramesPerRequest: MAX_FRAMES_PER_REQUEST,
    });
  }

  if (hardCappedFrames.length > safeRequestedFrameCount) {
    console.warn(`${warningContext}: frame count exceeded the safe request count and was truncated.`, {
      requestedFrameCount: safeRequestedFrameCount,
      returnedFrameCount: hardCappedFrames.length,
      maxFramesPerRequest: MAX_FRAMES_PER_REQUEST,
    });
  }

  return hardCappedFrames.slice(0, safeRequestedFrameCount);
};
