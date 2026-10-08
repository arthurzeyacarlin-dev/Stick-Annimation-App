// THE GROUND SHOWS THE PLACE (Arthur, 2026-10-07: rain falling on the plain white ground "looks like snowing"). An
// OUTDOOR background (sky, weather, trees, hills...) with no ground of its own gets the place's ground under the
// ground line: grass green outdoors (darker under a storm), white only for snow, sand for a beach or desert, gray
// rock for the moon, red rock for Mars, gray road for a city. No background = the plain page (the empty studio), and a
// page colour the user asked for (canvasColor) is left as it is.
import type { BackgroundSpec, EffectTrack } from "./types.ts";

// Pieces that say "we are outside".
const OUTDOOR = new Set(["sky", "sun", "clouds", "hills", "trees", "grass", "rain", "thunderstorm", "waterfall", "spikes", "pit"]);
// Pieces that already ARE the ground.
const GROUND = new Set(["ground"]);

// The ground of a place, from its words (the first that matches wins); stormy = darker grass.
const PLACES: [RegExp, { color: string; color2: string }][] = [
  [/snow|winter|blizzard|arctic|antarctic|ski\b|igloo|frozen|tundra|north pole/i, { color: "#f6f9fc", color2: "#d3dfea" }],
  // (THE GROUND IS WHERE THE FIGURES STAND, Arthur 2026-10-08: "drives to the moon" starts on Earth — grass under a
  // night sky; a moon in the sky is not the moon's ground. Moon/Mars rock only when the words put them ON it.)
  [/\b(on|onto|across|land(s|ed|ing)? on|walk(s|ing)? on) (the |a )?moon\b|moon'?s surface|lunar (surface|base|lander|landscape|ground)|asteroid|crater/i, { color: "#a3a3a8", color2: "#6c6c73" }],
  [/\b(on|onto|across|land(s|ed|ing)? on|walk(s|ing)? on) mars\b|mars'? surface|martian (surface|ground|desert|landscape)/i, { color: "#c45a2c", color2: "#7d3317" }],
  [/beach|desert|sand|dune|sahara|shore|coast/i, { color: "#ead08f", color2: "#c9a35c" }],
  [/city|street|road|town|parking|highway|downtown/i, { color: "#7b7b80", color2: "#4e4e53" }],
  [/storm|thunder|rain|night|dark/i, { color: "#4f8a3f", color2: "#24401c" }],
];

export function placeGround(background: BackgroundSpec | undefined, words: string, canvasColor?: string): BackgroundSpec | undefined {
  const pieces = background?.pieces ?? [];
  if (!pieces.length || canvasColor || pieces.some((p) => GROUND.has(p.kind)) || !pieces.some((p) => OUTDOOR.has(p.kind))) return background;
  // (the pieces' own words count too: a night sky, a storm sky)
  const all = `${words} ${pieces.map((p) => `${p.kind} ${typeof p.params?.time === "string" ? p.params.time : ""}`).join(" ")}`;
  const place = PLACES.find(([re]) => re.test(all))?.[1];
  // (first, so rain splashes and lightning on the ground are drawn on top of it)
  return { ...background, pieces: [{ kind: "ground", ...(place ? { params: { ...place } } : {}) }, ...pieces] };
}

// THE SKY SHOWS THE TIME OF DAY (Arthur, 2026-10-07, a car to the moon: "nighttime if the moon is out... a dark
// background instead of a bright one; daytime the opposite"). Like the storm's dark sky: a scene that SHOWS the moon
// (a moon prop, a `sun` piece with `moon: true`) or stars, or SAYS night / midnight / evening, gets a dark NIGHT sky
// (dark blue, stars); outer space gets a black sky with stars; one that shows the sun or says day / morning gets a day
// sky. An AI-written sky with no time takes it; a page colour the user asked for (canvasColor), a storm, or a sky the
// AI coloured itself is left as it is. FIGURES STAY READABLE (they are drawn dark): the sky lightens toward the
// horizon, where the figures stand, at least as much as the storm's (#565d68), so a black figure still reads.
const NIGHT_SKY = { time: "night", color: "#0b1030", color2: "#4a5c96", stars: true };
const SPACE_SKY = { time: "night", color: "#000000", color2: "#474c6c", stars: true };
const SPACE = /outer space|\bin space|\bspace ?(ship|station|walk)|galaxy|\borbit|astronaut|zero gravity/i;
const NIGHT = /\bnight|midnight|evening|dusk|\bmoon(lit|light)?\b|\bstars\b|starry|\bdark sky/i;
const DAY = /\bday(time|light)?\b|morning|\bnoon|afternoon|sunny|\bsun\b|sunshine/i;
export function placeSky(background: BackgroundSpec | undefined, words: string, effects: EffectTrack[] = [], canvasColor?: string): BackgroundSpec | undefined {
  const pieces = background?.pieces ?? [];
  if (canvasColor || pieces.some((p) => p.kind === "thunderstorm")) return background;
  const sky = pieces.find((p) => p.kind === "sky");
  if (sky && (typeof sky.params?.color === "string" || (typeof sky.params?.time === "string" && sky.params.time !== "day"))) return background;
  const props = effects.filter((e) => e.kind === "prop").map((e) => String(e.params?.symbol ?? "")).join(" ");
  const moonPiece = pieces.some((p) => p.kind === "sun" && p.params?.moon === true);
  const sunPiece = pieces.some((p) => p.kind === "sun" && p.params?.moon !== true) || /\bsun\b/i.test(props);
  const all = `${words} ${props}${moonPiece ? " moon" : ""}`;
  const time = SPACE.test(all) ? SPACE_SKY : NIGHT.test(all) ? NIGHT_SKY : sunPiece || (DAY.test(all) && pieces.length) ? { time: "day" } : undefined;
  if (!time || (sky && time.time === "day")) return background;
  const rest = pieces.filter((p) => p !== sky);
  // (first, behind everything. Called BEFORE placeGround, so the sky makes it outdoors and the place's ground comes
  // under the figures' feet — the moon's gray rock, night grass — never a white strip; space gets a dark floor.)
  const floor = time === SPACE_SKY && !rest.some((p) => GROUND.has(p.kind)) ? [{ kind: "ground", params: { color: "#2c3150", color2: "#1b1e33" } }] : [];
  return { ...(background ?? {}), pieces: [{ kind: "sky", params: { ...(sky?.params ?? {}), ...time } }, ...floor, ...rest] };
}
