// THE THING MAKER (SPEC-0017 Phase 4, T1 — Arthur, 2026-10-09: "It has to think, what is a cool hat? Specifically for
// hiking, not Halloween… the walking stick, not a giant cigarette… the engine has to learn how to create a backpack
// itself"). ONE OBJECT MODEL for the things in a scene. Luna writes MEANING in plain words ("hiking hat", "backpack",
// "walking stick", "tray", "karate board", "goal"); the engine finds the THING:
// - its CATEGORY (hat, bag, pole, rod, umbrella, board, plate, structure…),
// - HOW IT ATTACHES: worn on the head or on the back, held upright and PLANTED on the ground as you walk (a walking
//   stick), held out forward (a fishing rod), held up overhead (an umbrella), flat on one palm (a tray), tucked along
//   the arm (a skateboard), standing on the ground (a goal, a board on its stand),
// - its REAL SIZE next to a figure (x the figure's height: its longest side) and its picture's shape (`aspect` = the
//   picture's width / height),
// - its PICTURE: a recipe made from the category + the describing words (symbolMaker.ts THING_RECIPES; a hiking hat is
//   a brimmed outdoor hat, never a witch hat).
// CONTEXT PICKS THE KIND: a bare "hat" / "cool hat" / "cap" / "helmet" is the one the story's words call for (hiking →
// a hiking hat, the west → a cowboy hat, snow → a beanie…). Words the model does not know give null: the caller keeps
// what it did before (never the nearest WRONG item, never a random one).

export type ThingAttach = "head" | "back" | "planted" | "forward" | "upright" | "palm" | "underArm" | "carried" | "ground" | "fist" | "hanging" | "aimed";
export type Thing = {
  id: string; // the engine's name for it ("hikingHat")
  category: "hat" | "bag" | "pole" | "rod" | "umbrella" | "board" | "plate" | "box" | "structure" | "vehicle" | "light";
  attach: ThingAttach;
  symbol: string; // the Library symbol's name ("Hiking hat")
  recipe: string; // symbolMaker.ts recipe id
  size: number; // x the figure's height: its longest side
  aspect: number; // the picture's width / height
  words: RegExp; // the words that name it (lower-case, camelCase split)
  mouth?: { x: number; y: number }; // where a shot goes IN (a hoop's rim), as fractions of its picture (facing right)
  door?: { x: number; y: number }; // a vehicle's door: its middle (x) and its step (y), fractions of its picture
  open?: { symbol: string; recipe: string }; // its picture once its lid has come off (a present)
  stands?: true; // H24: on its own (not held) it stands PLANTED upright in the ground (a flag), never lies or floats
  byHandle?: true; // H27: held BY ITS SIDE HANDLE (a mug): upright, the hand in the handle at its side, level — never by its top/steam
  flies?: true; // H12: a ground vehicle that can also fly UP (a rocket: launches, lands — moves/vehicles.ts)
};

// Most specific first (a "pizza on a tray" is the pizza; "skateboard" before "board").
export const THINGS: Thing[] = [
  // WORN ON THE HEAD (effects/worn.ts HEAD_WEAR places them; a hat's brim covers the top of the head)
  // (H5: role costumes worn on the head — a pirate's tricorn and eye patch, a robot's boxy head, an astronaut's helmet)
  { id: "pirateHat", category: "hat", attach: "head", symbol: "Pirate hat", recipe: "piratehat", size: 0.2, aspect: 1.8, words: /\b(pirate|tricorn|tricorne|captain'?s?)\s*hats?\b|\btricornes?\b|\bpirate bandanas?\b/ },
  { id: "eyePatch", category: "hat", attach: "head", symbol: "Eye patch", recipe: "eyepatch", size: 0.12, aspect: 1.4, words: /\beye ?patch(es)?\b/ },
  { id: "robotHead", category: "hat", attach: "head", symbol: "Robot head", recipe: "robothead", size: 0.2, aspect: 0.85, words: /\brobot (heads?|helmets?|masks?)\b/ },
  { id: "spaceHelmet", category: "hat", attach: "head", symbol: "Space helmet", recipe: "spacehelmet", size: 0.2, aspect: 1, words: /\b(space|astronaut'?s?|bubble|fishbowl)\s*helmets?\b/ },
  { id: "hikingHat", category: "hat", attach: "head", symbol: "Hiking hat", recipe: "hikinghat", size: 0.2, aspect: 2, words: /\b(hiking|bucket|boonie|safari|explorer|outdoor|camping|fishing|bush|trekking|adventure|explorer's)\s+hats?\b/ },
  { id: "cowboyHat", category: "hat", attach: "head", symbol: "Cowboy hat", recipe: "cowboyhat", size: 0.22, aspect: 2.2, words: /\b(cowboy|cowgirl|western|stetson|ranch|rodeo)\s*hats?\b|\bstetsons?\b/ },
  { id: "topHat", category: "hat", attach: "head", symbol: "Top hat", recipe: "tophat", size: 0.18, aspect: 1, words: /\b(top|magician'?s?|fancy|tall black)\s*hats?\b|\btophats?\b/ },
  { id: "sunHat", category: "hat", attach: "head", symbol: "Sun hat", recipe: "sunhat", size: 0.24, aspect: 2.4, words: /\b(sun|straw|beach|garden|summer|farmer'?s?)\s*hats?\b|\bsombreros?\b/ },
  { id: "partyHat", category: "hat", attach: "head", symbol: "Party hat", recipe: "partyhat", size: 0.15, aspect: 0.75, words: /\b(party|birthday|cone)\s*hats?\b/ },
  { id: "beanie", category: "hat", attach: "head", symbol: "Beanie", recipe: "beanie", size: 0.15, aspect: 1.25, words: /\bbeanies?\b|\b(winter|wool|woolly|knit|knitted|ski|bobble)\s*(hat|cap)s?\b|\btoques?\b/ },
  { id: "crown", category: "hat", attach: "head", symbol: "Crown", recipe: "crown", size: 0.15, aspect: 1.4, words: /\bcrowns?\b|\btiaras?\b/ },
  { id: "hardHat", category: "hat", attach: "head", symbol: "Hard hat", recipe: "hardhat", size: 0.17, aspect: 1.5, words: /\b(hard|construction|safety|bike|bicycle|cycling|skate|climbing)\s*(hat|helmet)s?\b|\bhardhats?\b/ },
  { id: "baseballCap", category: "hat", attach: "head", symbol: "Baseball cap", recipe: "baseballcap", size: 0.17, aspect: 1.6, words: /\b(baseball|ball|trucker|sports?|snapback|backwards?)\s*caps?\b|\bsnapbacks?\b/ },
  // WORN ON THE BACK: a rounded pack with a strap over the shoulder (effects/worn.ts backWearPlacement)
  { id: "backpack", category: "bag", attach: "back", symbol: "Backpack", recipe: "backpack", size: 0.26, aspect: 0.75, words: /\b(back ?packs?|rucksacks?|knapsacks?|daypacks?|school ?bags?|book ?bags?|hiking packs?|camping packs?)\b/ },
  // A CAPE / CLOAK: worn from the shoulders down the back, moving with the body (drawn like the robe, no belt)
  { id: "cape", category: "bag", attach: "back", symbol: "Cape", recipe: "cape", size: 0.6, aspect: 0.75, words: /\b(capes?|cloaks?|mantles?)\b/ },
  // HELD: a walking stick is PLANTED (upright, its tip on the ground in step with the walk — effects/weapons.ts)
  { id: "walkingStick", category: "pole", attach: "planted", symbol: "Walking stick", recipe: "walkingstick", size: 0.66, aspect: 22, words: /\b(walking|hiking|trekking|hike|walk)\s*(sticks?|poles?|staffs?|canes?)\b|\bcanes?\b/ },
  { id: "fishingRod", category: "rod", attach: "forward", symbol: "Fishing rod", recipe: "fishingrod", size: 0.95, aspect: 30, words: /\bfishing\s*(rods?|poles?)\b|\b(fishing|fish)\b.*\brods?\b|\brods?\b.*\bfish/ },
  // HELD LIGHTS (H5 fix round 2): a torch / a candle UPRIGHT IN THE FIST, a lantern HANGING from the hand by its bail,
  // a flashlight AIMED forward with its beam — each with its own live flame or light (effects/weapons.ts heldLightShapes).
  { id: "flashlight", category: "light", attach: "aimed", symbol: "Flashlight", recipe: "flashlight", size: 0.22, aspect: 3.6, words: /\bflash ?lights?\b|\b(electric|pocket|led) torch(es)?\b/ },
  { id: "torch", category: "light", attach: "fist", symbol: "Torch", recipe: "heldtorch", size: 0.42, aspect: 0.22, words: /\b(flaming |burning |fire |tiki |wooden )?torch(es)?\b|\bfirebrands?\b/ },
  { id: "lantern", category: "light", attach: "hanging", symbol: "Lantern", recipe: "lantern", size: 0.2, aspect: 0.62, words: /\blanterns?\b|\b(oil|hurricane|miner'?s?|camping|kerosene) lamps?\b/ },
  { id: "candle", category: "light", attach: "fist", symbol: "Candle", recipe: "candle", size: 0.17, aspect: 0.7, words: /\bcandles?\b|\bcandle ?(holder|stick)s?\b|\bcandlesticks?\b/ },
  { id: "umbrella", category: "umbrella", attach: "upright", symbol: "Umbrella", recipe: "umbrella", size: 0.72, aspect: 0.9, words: /\bumbrellas?\b|\bparasols?\b/ },
  { id: "skateboard", category: "board", attach: "underArm", symbol: "Skateboard", recipe: "skateboard", size: 0.3, aspect: 4.2, words: /\bskate ?boards?\b|\blongboards?\b/ },
  { id: "pizza", category: "plate", attach: "palm", symbol: "Pizza on a tray", recipe: "pizzatray", size: 0.3, aspect: 3, words: /\bpizzas?\b/ },
  { id: "tray", category: "plate", attach: "palm", symbol: "Tray", recipe: "tray", size: 0.3, aspect: 6, words: /\b(trays?|platters?|serving plates?)\b/ },
  // STANDING ON THE GROUND (a structure keeps its real size and stands on the ground line; it never floats)
  { id: "goal", category: "structure", attach: "ground", symbol: "Soccer goal", recipe: "soccergoal", size: 1.5, aspect: 1.5, words: /^\s*goals?\s*$|\b(soccer|football|hockey)\s+goals?\b|\bgoal ?posts?\b|\bgoal (net|frame)s?\b/ },
  // H5 (Block 2): things drawn from parts by category — never an empty square.
  { id: "present", category: "box", attach: "carried", symbol: "Present", recipe: "present", size: 0.3, aspect: 1, open: { symbol: "Open present", recipe: "presentopen" }, words: /\b(presents?|gifts?|gift ?box(es)?|birthday box(es)?)\b/ },
  { id: "groceryBag", category: "bag", attach: "carried", symbol: "Grocery bag", recipe: "grocerybag", size: 0.3, aspect: 0.8, words: /\b(grocer(y|ies) ?bags?|bags? of (groceries|food|apples|shopping)|(shopping|paper|plastic) ?bags?|groceries)\b/ },
  { id: "basketballHoop", category: "structure", attach: "ground", symbol: "Basketball hoop", recipe: "basketballhoop", size: 1.7, aspect: 0.55, mouth: { x: 0.74, y: 0.27 }, words: /\b(basketball )?hoops?\b|\bbasketball (goal|net|rim|basket)s?\b/ },
  { id: "bus", category: "vehicle", attach: "ground", symbol: "Bus", recipe: "bus", size: 2.8, aspect: 2.6, door: { x: 0.8, y: 0.86 }, words: /\b(school ?|city ?)?bus(es)?\b|\btrams?\b/ },
  { id: "car", category: "vehicle", attach: "ground", symbol: "Car", recipe: "car", size: 1.5, aspect: 2.2, door: { x: 0.5, y: 0.8 }, words: /\b(cars?|taxis?|cabs?|police cars?|race ?cars?|vans?|jeeps?|trucks?|automobiles?|sedans?)\b/ },
  // H12 (Round 3): a ROCKET is a vehicle at its real size next to a figure (a figure looks out of its round window; it
  // launches and lands — moves/vehicles.ts); a COCKPIT is a seat + a control panel; a LAUNCH PAD is the tower + pad of
  // a launch site; a broken WIRE hangs from its pole; TOOLS (a wrench, a hammer) are held in the fist (and float and
  // slowly spin in space — moves/transform.ts).
  { id: "rocket", category: "vehicle", attach: "ground", symbol: "Rocket", recipe: "rocket", size: 2.6, aspect: 0.42, door: { x: 0.5, y: 0.78 }, flies: true, words: /\b(rockets?|rocket ?ships?|space ?rockets?|space ?shuttles?|shuttles?)\b/ },
  { id: "cockpit", category: "structure", attach: "ground", symbol: "Cockpit", recipe: "cockpit", size: 1.1, aspect: 1.4, words: /\b(cockpits?|control ?panels?|control ?desks?|flight ?decks?|dashboards?)\b/ },
  { id: "launchPad", category: "structure", attach: "ground", symbol: "Launch pad", recipe: "launchpad", size: 1.8, aspect: 1.1, words: /\b(launch ?(pad|tower|site|platform|complex)s?|launchpads?|nasa (launch )?(site|base|center|centre))\b/ },
  { id: "wire", category: "structure", attach: "ground", symbol: "Broken wire", recipe: "wire", size: 1.6, aspect: 0.9, words: /\b((broken|live|loose|sparking|power|electric|electrical|cut|downed) ?(wires?|cables?|lines?)|wires?|power ?lines?)\b/ },
  { id: "wrench", category: "pole", attach: "fist", symbol: "Wrench", recipe: "wrench", size: 0.22, aspect: 3.2, words: /\b(wrench(es)?|spanners?)\b/ },
  { id: "hammer", category: "pole", attach: "fist", symbol: "Hammer", recipe: "hammer", size: 0.24, aspect: 2.6, words: /\b(hammers?|mallets?)\b/ },
  { id: "skateRamp", category: "structure", attach: "ground", symbol: "Skate ramp", recipe: "skateramp", size: 1.1, aspect: 1.9, words: /\b((skate|half|quarter|bmx|bike|wooden)[ -]?(ramps?|pipes?)|ramps?|half ?pipes?|quarter ?pipes?)\b/ },
  { id: "karateBoard", category: "board", attach: "ground", symbol: "Karate board", recipe: "karateboard", size: 0.6, aspect: 0.55, words: /^\s*(boards?|planks?)\s*$|\b(karate|breaking)\s+(boards?|planks?)\b|\bwooden\s+boards?\b/ },
  // H24 (Round 7): the everyday V1 things — real filled pictures (effects/thingPictures.ts), real sizes, held by a grip.
  { id: "pillow", category: "box", attach: "fist", symbol: "Pillow", recipe: "pillow", size: 0.3, aspect: 1.5, words: /\b(pillows?|cushions?)\b/ },
  { id: "coffeeMug", category: "box", attach: "fist", symbol: "Coffee mug", recipe: "coffeemug", size: 0.12, aspect: 1.1, byHandle: true, words: /\b(coffee|tea|cocoa|hot chocolate)\b(?!\s*(tables?|shops?|makers?|machines?|beans?))|\bmugs?\b|\b(coffee|tea) ?cups?\b/ },
  { id: "sandcastle", category: "structure", attach: "ground", symbol: "Sandcastle", recipe: "sandcastle", size: 0.5, aspect: 1.2, words: /\bsand ?castles?\b/ },
  { id: "bucket", category: "bag", attach: "carried", symbol: "Bucket", recipe: "bucket", size: 0.16, aspect: 0.9, words: /\b(buckets?|pails?)\b/ },
  { id: "bananaPeel", category: "plate", attach: "ground", symbol: "Banana peel", recipe: "bananapeel", size: 0.2, aspect: 1.6, words: /\bbanana( ?(peel|skin)s?)?s?\b|\bpeels?\b/ },
  { id: "shovel", category: "pole", attach: "fist", symbol: "Shovel", recipe: "shovel", size: 0.3, aspect: 3, words: /\b(shovels?|spades?)\b/ },
  { id: "flag", category: "pole", attach: "upright", symbol: "Flag", recipe: "flag", size: 0.85, aspect: 0.6, stands: true, words: /\bflags?\b(?!\s*football)/ },
];
export const THING_BY_ID: Record<string, Thing> = Object.fromEntries(THINGS.map((t) => [t.id, t]));

// A bare word for a worn or held thing, whose kind the STORY decides ("a cool hat" on a hike = a hiking hat).
const GENERIC_HEAD = /\b(hats?|caps?|helmets?|headwear|lids?)\b/;
const GENERIC_BACK = /\b(packs?|bags?)\b/;
const GENERIC_POLE = /\b(sticks?|poles?|staffs?)\b/;
// Context words → the hat the story calls for (first match wins). Wizard, police, army and knight hats are the role
// looks the engine already has (moves/wear.ts ACCESSORIES).
const HAT_CONTEXT: [RegExp, string][] = [
  [/\b(wizards?|witch(es)?|sorcer\w*|mages?|halloween|spells?|magic wand)\b/, "wizardHat"],
  [/\b(police|cops?|officers?)\b/, "policeCap"],
  [/\b(army|soldiers?|military|troops?)\b/, "militaryCap"],
  [/\bknights?\b/, "knightHelmet"],
  [/\bpirates?\b/, "pirateHat"],
  [/\b(astronauts?|cosmonauts?|spacesuits?|space ?m[ae]n)\b/, "spaceHelmet"],
  [/\b(hik\w*|trails?|forest|woods|camp\w*|mountains?|explor\w*|safari|jungle|trek\w*|outdoors?|fishing)\b/, "hikingHat"],
  [/\b(cowboys?|cowgirls?|western|ranch\w*|rodeo|horses?|desert|wild west|sheriff)\b/, "cowboyHat"],
  [/\b(snow\w*|winter|cold|ski\w*|ice|icy|christmas|freezing)\b/, "beanie"],
  [/\b(beach|summer|sunny|garden\w*|farm\w*|vacation)\b/, "sunHat"],
  [/\b(kings?|queens?|princes?|princess(es)?|royal|throne|castle)\b/, "crown"],
  [/\b(party|birthday|celebrat\w*)\b/, "partyHat"],
  [/\b(construction|builders?|building site|workers?|mine|miners?|bik\w*|cycl\w*|skat\w*)\b/, "hardHat"],
  [/\b(magician|circus|ringmaster|gentleman|fancy|tuxedo)\b/, "topHat"],
];
const words = (raw: string) => raw.trim().replace(/([a-z])([A-Z])/g, "$1 $2").replace(/[_\-.]+/g, " ").replace(/\s+/g, " ").toLowerCase();

// Things that are NOT the thing their last word sounds like (a punching bag is not a backpack, a sleeping bag neither).
const NOT_A_THING = /\b(punching|sleeping|tea|bean|sand|garbage|trash)\s+bags?\b|\b(laundry|picnic|clothes|toy) baskets?\b|\bhula ?hoops?\b|\bboard games?\b|\b(dart|chess|diving|surf|key|black|white|score|bill|card|ironing|cutting)\s*boards?\b|\bgoal ?keepers?\b|\brocket (launchers?|boots?|punch(es)?|packs?|jumps?|kicks?|fists?|arms?)\b|\bwire ?(fu|frames?)\b|\bcut ?lines?\b|\b(sledge ?)?hammer ?(throws?|fists?|punch(es)?|strikes?|kicks?)\b/;

// (H31, night audit b23 — "a glowing cut line" through a rock is the line of a cut, never a broken wire: the checker had
// stood a pole with a wire and a sparking star next to the superhero's rock.)
// The thing named by `name` (a wear, a held thing, an object id, a prop's symbol), in the story `context` (the user's
// words and the plan's title): null when the words name no thing the model knows.
export function thingFor(name: unknown, context = ""): Thing | null {
  if (typeof name !== "string" || !name.trim()) return null;
  const w = words(name);
  if (THING_BY_ID[name]) return THING_BY_ID[name];
  if (NOT_A_THING.test(w)) return null;
  const direct = THINGS.find((t) => t.words.test(w));
  if (direct) return direct;
  const story = words(context);
  if (GENERIC_HEAD.test(w)) {
    // (a bare hat word: the story picks the hat — "a cool hat" on a hike is a hiking hat — else a cap: casual and cool;
    // "helmet" alone is a hard hat)
    const pick = HAT_CONTEXT.find(([re]) => re.test(story))?.[1];
    if (pick && THING_BY_ID[pick]) return THING_BY_ID[pick];
    if (pick) return null; // (a role look the engine already has: the caller keeps that id)
    return /\bhelmets?\b/.test(w) ? THING_BY_ID.hardHat : THING_BY_ID.baseballCap;
  }
  if (GENERIC_BACK.test(w) && /\b(back|school|hik\w*|camp\w*|trail|travel\w*|student|class)\b/.test(`${w} ${story}`)) return THING_BY_ID.backpack;
  if (GENERIC_POLE.test(w) && /\b(walk\w*|hik\w*|trails?|old (man|woman|lady)|grand(pa|ma|father|mother)|forest|mountains?|trek\w*)\b/.test(story) && !/\b(fight\w*|battle|duel|wizards?|spear)\b/.test(story)) return THING_BY_ID.walkingStick;
  return null;
}

// The role-look hat a bare hat word means in this story ("wizardHat" in a wizard story), when it is one the engine had
// before this model (moves/wear.ts ACCESSORIES ids), else undefined.
export function roleHatFor(name: string, context: string): string | undefined {
  const w = words(name);
  if (!GENERIC_HEAD.test(w) || THINGS.some((t) => t.words.test(w))) return undefined;
  const pick = HAT_CONTEXT.find(([re]) => re.test(words(context)))?.[1];
  return pick && !THING_BY_ID[pick] ? pick : undefined;
}

// DESCRIBING WORDS → COLOR (the procedural part of every picture: "a red cape", "a blue cowboy hat", "a wooden chair",
// "a metal wrench"): the first color or material word in the name, as a color; undefined when there is none.
const COLOR_OF: [RegExp, string][] = [
  [/\bred\b/, "#d63b3b"], [/\bblue\b/, "#2f5fb3"], [/\bgreen\b/, "#3f9b45"], [/\byellow\b/, "#f2c230"], [/\borange\b/, "#ff7a1a"],
  [/\b(purple|violet)\b/, "#8e44ad"], [/\bpink\b/, "#e86fa8"], [/\bblack\b/, "#2b2b2b"], [/\bwhite\b/, "#f4f4f4"], [/\b(gray|grey)\b/, "#9aa3ad"],
  [/\bbrown\b/, "#8a5a2b"], [/\b(gold|golden)\b/, "#e8b923"], [/\bsilver\b/, "#c0c6cf"], [/\b(wood|wooden|oak|pine)\b/, "#a0703c"],
  [/\b(metal|steel|iron|chrome)\b/, "#9aa3ad"], [/\bglass\b/, "#cfe8f5"], [/\bstone\b/, "#8d8d8d"], [/\bnavy\b/, "#1f3566"], [/\b(khaki|tan|beige)\b/, "#c8b48a"],
];
export function colorFromWords(name: unknown): string | undefined {
  if (typeof name !== "string") return undefined;
  const w = words(name);
  return COLOR_OF.find(([re]) => re.test(w))?.[1];
}

// Can it be worn (on the head or the back)?
export const wornThing = (t: Thing | null): t is Thing => !!t && (t.attach === "head" || t.attach === "back");
// Is it held in the hand(s) (and how)?
export const heldThing = (t: Thing | null): t is Thing => !!t && ["planted", "forward", "upright", "palm", "underArm", "fist", "hanging", "aimed"].includes(t.attach);
