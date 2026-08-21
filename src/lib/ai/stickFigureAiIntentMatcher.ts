export const STICK_AI_CANONICAL_INTENT_V2 = {
  kind: "stick-ai-interpreted-intent",
  intentVersion: 2,
  capability: "stick.pose-sequence.create/v1",
  figureCount: 1,
  figureKind: "stick-figure",
  action: "wave",
  keyPoseCount: 3,
  timelineFrameCount: 12,
  fps: 12,
  durationMs: 1000,
} as const;

export type StickAiInterpretedIntentV2 = typeof STICK_AI_CANONICAL_INTENT_V2;

export type StickAiPromptCorrectionV2 = {
  source: string;
  target: string;
  distance: number;
};

export type StickAiPromptMatchV2 = {
  intent: StickAiInterpretedIntentV2;
  normalizedPrompt: string;
  corrections: StickAiPromptCorrectionV2[];
  defaults: Array<"keyPoseCount" | "fps">;
  numericCorrection: "122-fps-to-12" | null;
};

export type StickAiPromptMatchResultV2 =
  | {ok: true; value: StickAiPromptMatchV2}
  | {ok: false; error: {code: "unsupported_prompt"; reason: string}};

export const STICK_AI_TYPO_MAP_V2 = {
  plese: "please",
  craete: "create",
  creat: "create",
  maek: "make",
  animte: "animate",
  simlpe: "simple",
  pses: "poses",
  stik: "stick",
  stcik: "stick",
  figuer: "figure",
  fgiure: "figure",
  onne: "one",
  singel: "single",
  wwave: "wave",
  waev: "wave",
  waevs: "waves",
  wavig: "waving",
  animaton: "animation",
  animtion: "animation",
  fpps: "fps",
} as const;

const ACCEPTED_LEXICON = new Set([
  "please", "create", "make", "animate", "a", "simple", "three", "pose", "poses", "wave",
  "animation", "with", "one", "single", "the", "this", "stick", "figure", "that", "waves",
  "to", "waving", "at", "twelve", "fps", "frames", "per", "second",
]);

const fail = (reason: string): StickAiPromptMatchResultV2 => ({
  ok: false,
  error: {code: "unsupported_prompt", reason},
});

const osaDistance = (left: string, right: string) => {
  const rows = left.length + 1;
  const columns = right.length + 1;
  const matrix = Array.from({length: rows}, () => Array<number>(columns).fill(0));
  for (let row = 0; row < rows; row += 1) matrix[row][0] = row;
  for (let column = 0; column < columns; column += 1) matrix[0][column] = column;
  for (let row = 1; row < rows; row += 1) {
    for (let column = 1; column < columns; column += 1) {
      const substitution = left[row - 1] === right[column - 1] ? 0 : 1;
      matrix[row][column] = Math.min(
        matrix[row - 1][column] + 1,
        matrix[row][column - 1] + 1,
        matrix[row - 1][column - 1] + substitution,
      );
      if (row > 1 && column > 1 && left[row - 1] === right[column - 2] && left[row - 2] === right[column - 1]) {
        matrix[row][column] = Math.min(matrix[row][column], matrix[row - 2][column - 2] + 1);
      }
    }
  }
  return matrix[left.length][right.length];
};

const distanceLimitForTarget = (target: string) => target.length >= 8 && target.length <= 12 ? 2 : 1;

export const validateStickAiTypoMapV2 = (): {ok: true} | {ok: false; reason: string} => {
  const seen = new Set<string>();
  for (const [source, target] of Object.entries(STICK_AI_TYPO_MAP_V2)) {
    if (!/^[a-z]+$/.test(source) || !/^[a-z]+$/.test(target)) return {ok: false, reason: "non_ascii_map_entry"};
    if (seen.has(source) || ACCEPTED_LEXICON.has(source)) return {ok: false, reason: "duplicate_or_accepted_source"};
    seen.add(source);
    const distance = osaDistance(source, target);
    if (distance < 1 || distance > distanceLimitForTarget(target)) return {ok: false, reason: "distance_out_of_bounds"};
    const nearest = [...ACCEPTED_LEXICON]
      .map((candidate) => ({candidate, distance: osaDistance(source, candidate)}))
      .filter((entry) => entry.distance <= distanceLimitForTarget(entry.candidate));
    const minimum = Math.min(...nearest.map((entry) => entry.distance));
    const winners = nearest.filter((entry) => entry.distance === minimum);
    if (winners.length !== 1 || winners[0].candidate !== target || minimum !== distance) {
      return {ok: false, reason: "ambiguous_map_entry"};
    }
  }
  return {ok: true};
};

const wellFormedUtf16 = (value: string) => {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return false;
      index += 1;
    } else if (code >= 0xdc00 && code <= 0xdfff) return false;
  }
  return true;
};

const normalize = (rawPrompt: string): {ok: true; normalized: string; tokens: string[]} | {ok: false; reason: string} => {
  if (!wellFormedUtf16(rawPrompt)) return {ok: false, reason: "malformed_utf16"};
  if (new TextEncoder().encode(rawPrompt).byteLength > 128) return {ok: false, reason: "prompt_too_large"};
  for (const character of rawPrompt) {
    if (character.codePointAt(0)! > 0x7f) return {ok: false, reason: "non_ascii"};
    if (!/[A-Za-z0-9 \t\r\n\f.!?\-]/.test(character)) return {ok: false, reason: "forbidden_character"};
  }
  let normalized = rawPrompt.replace(/^[ \t\r\n\f]+|[ \t\r\n\f]+$/g, "");
  normalized = normalized.replace(/[ \t\r\n\f]+/g, " ").replace(/[A-Z]/g, (value) => value.toLowerCase());
  const punctuation = [...normalized].filter((character) => character === "." || character === "!" || character === "?");
  if (punctuation.length > 1) return {ok: false, reason: "malformed_punctuation"};
  if (punctuation.length === 1) {
    const match = normalized.match(/^(.*?)[ ]?([.!?])$/);
    if (!match) return {ok: false, reason: "internal_punctuation"};
    normalized = match[1].replace(/ +$/g, "");
  }
  if (normalized.includes("-")) {
    if (/(^|[^a-z0-9])-|-(?:$|[^a-z0-9])|--/.test(normalized)) return {ok: false, reason: "malformed_hyphen"};
    normalized = normalized.replace(/-/g, " ");
  }
  if (!normalized || !/^[a-z0-9 ]+$/.test(normalized)) return {ok: false, reason: "invalid_tokens"};
  return {ok: true, normalized, tokens: normalized.match(/[a-z]+|[0-9]+/g) ?? []};
};

type Cursor = {tokens: string[]; index: number};
const take = (cursor: Cursor, token: string) => cursor.tokens[cursor.index] === token ? (cursor.index += 1, true) : false;
const takeOneOf = (cursor: Cursor, tokens: readonly string[]) => tokens.some((token) => take(cursor, token));

const parseSingularFigure = (cursor: Cursor) => {
  const start = cursor.index;
  let determiner = false;
  if (take(cursor, "this")) determiner = take(cursor, "one") || true;
  else if (take(cursor, "a")) {
    // The published closed matrix includes the exact phrase "a single stick figure".
    take(cursor, "single");
    determiner = true;
  } else determiner = takeOneOf(cursor, ["one", "1", "single", "the"]);
  if (!determiner || !take(cursor, "stick") || !take(cursor, "figure")) {
    cursor.index = start;
    return false;
  }
  return true;
};

const parseFps = (cursor: Cursor): {present: boolean; numericCorrection: boolean} | null => {
  const start = cursor.index;
  take(cursor, "at");
  const value = cursor.tokens[cursor.index];
  if (!(value === "12" || value === "twelve" || value === "122")) {
    cursor.index = start;
    return {present: false, numericCorrection: false};
  }
  cursor.index += 1;
  const unit = take(cursor, "fps") || (take(cursor, "frames") && take(cursor, "per") && take(cursor, "second"));
  if (!unit) return null;
  return {present: true, numericCorrection: value === "122"};
};

const parseOutcomeFirst = (cursor: Cursor) => {
  if (!takeOneOf(cursor, ["create", "make", "animate"])) return null;
  take(cursor, "a");
  take(cursor, "simple");
  let posePresent = false;
  if (takeOneOf(cursor, ["three", "3"])) {
    if (!takeOneOf(cursor, ["pose", "poses"])) return null;
    posePresent = true;
  }
  if (!take(cursor, "wave")) return null;
  take(cursor, "animation");
  if (!take(cursor, "with") || !parseSingularFigure(cursor)) return null;
  const fps = parseFps(cursor);
  if (!fps) return null;
  return {posePresent, ...fps};
};

const parseSubjectFirst = (cursor: Cursor) => {
  if (!takeOneOf(cursor, ["create", "make", "animate"]) || !parseSingularFigure(cursor)) return null;
  const action = take(cursor, "wave") || take(cursor, "waving") ||
    (take(cursor, "that") && take(cursor, "waves")) || (take(cursor, "to") && take(cursor, "wave"));
  if (!action) return null;
  const fps = parseFps(cursor);
  if (!fps) return null;
  return {posePresent: false, ...fps};
};

export const interpretStickAiPromptV2 = (rawPrompt: unknown): StickAiPromptMatchResultV2 => {
  if (typeof rawPrompt !== "string") return fail("not_a_string");
  const mapValidation = validateStickAiTypoMapV2();
  if (!mapValidation.ok) return fail(mapValidation.reason);
  const normalized = normalize(rawPrompt);
  if (!normalized.ok) return fail(normalized.reason);
  const corrections: StickAiPromptCorrectionV2[] = [];
  const correctedTokens = normalized.tokens.map((token) => {
    if (/^[0-9]+$/.test(token) || ACCEPTED_LEXICON.has(token)) return token;
    const target = STICK_AI_TYPO_MAP_V2[token as keyof typeof STICK_AI_TYPO_MAP_V2];
    if (!target) return token;
    corrections.push({source: token, target, distance: osaDistance(token, target)});
    return target;
  });
  if (corrections.length > 2 || corrections.reduce((sum, entry) => sum + entry.distance, 0) > 2) {
    return fail("correction_budget_exceeded");
  }
  const cursor: Cursor = {tokens: correctedTokens, index: 0};
  take(cursor, "please");
  const bodyStart = cursor.index;
  let parsed = parseOutcomeFirst(cursor);
  if (!parsed || cursor.index !== correctedTokens.length) {
    cursor.index = bodyStart;
    parsed = parseSubjectFirst(cursor);
  }
  if (!parsed || cursor.index !== correctedTokens.length) return fail("unsupported_semantics");
  const defaults: Array<"keyPoseCount" | "fps"> = [];
  if (!parsed.posePresent) defaults.push("keyPoseCount");
  if (!parsed.present) defaults.push("fps");
  return {
    ok: true,
    value: {
      intent: {...STICK_AI_CANONICAL_INTENT_V2},
      normalizedPrompt: normalized.normalized,
      corrections,
      defaults,
      numericCorrection: parsed.numericCorrection ? "122-fps-to-12" : null,
    },
  };
};
