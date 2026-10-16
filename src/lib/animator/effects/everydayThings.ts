// EVERY NAMED THING HAS A PICTURE (Arthur, Oct 15: "sometimes there's broken symbols"). A prop named by a plain word — "ball",
// "broom", "chair", "ladder" — with no parts and no built-in symbol was drawn as NOTHING (35 of 38 everyday things on the Oct 15
// symbol sheet). This is the engine's picture book of everyday things, written as simple PARTS (the same parts language the AI
// writes: moves/transform.ts partsShapes — shape rect | round | circle | ellipse | triangle | line, x, y, w, h, color, in the
// thing's own units: its HEIGHT = 1, its middle at 0, 0, + = right / down; a line runs from x, y to x + w, y + h).
// Because the picture is PARTS, every parts rule works on it for free: it stands on the floor, hangs from a chain when it is up in
// the air, a long tool held in a hand tilts with the forearm and keeps its head on the floor, a hit makes it rock, the laws measure it.
// Rules:
// - the HEAD NOUN wins: the last word(s) of the name are looked up first ("basketball hoop" is a hoop, "soccer ball" a ball);
// - each entry has a believable default SIZE (its height × the figure's); a size the AI wrote is kept (moves/believableSize.ts
//   only corrects a clearly wrong one);
// - tools stand upright with their head (blade, bristles, teeth) at the BOTTOM, so the hand grips the handle end;
// - side-view things face RIGHT (a chair's back on the left, a pan's handle on the right);
// - colors are the thing's real colors (a red ball, a brown handle, a white soccer ball), a dark outline on every part;
// - a word that is in no entry gives null: the caller keeps what it did before (never a random or wrong picture).
export type EverydayPart = { shape: "rect" | "round" | "circle" | "ellipse" | "triangle" | "line"; x: number; y: number; w: number; h: number; color: string };
export type EverydayThing = { id: string; words: RegExp; size: number; parts: EverydayPart[] };

const P = (shape: EverydayPart["shape"], x: number, y: number, w: number, h: number, color: string): EverydayPart => ({ shape, x, y, w, h, color });
const WOOD = "#a0703c", DARK_WOOD = "#7a4b2a", HANDLE = "#8b5a2b", STEEL = "#9aa3ad", DARK = "#333333";

// (most specific first; each is looked up by the name's last words first — see thingPicture)
export const EVERYDAY: EverydayThing[] = [
  { id: "basketballHoop", words: /\b(basketball hoop|hoop|basket ?ball net)\b/, size: 2.0, parts: [
    P("rect", -0.35, 0.1, 0.07, 0.8, "#555555"), P("rect", -0.22, -0.28, 0.26, 0.05, "#555555"), P("rect", -0.08, -0.33, 0.06, 0.34, "#ffffff"),
    P("line", -0.03, -0.2, 0.05, 0.16, "#dddddd"), P("line", 0.19, -0.2, -0.05, 0.16, "#dddddd"), P("line", 0.08, -0.2, 0, 0.16, "#dddddd"), P("line", 0.02, -0.04, 0.12, 0, "#dddddd"),
    P("rect", 0.08, -0.21, 0.24, 0.03, "#e4572e")] },
  { id: "hulaHoop", words: /\bhula ?hoops?\b/, size: 0.5, parts: [P("ellipse", 0, 0, 1, 1, "#d63384"), P("ellipse", 0, 0, 0.84, 0.84, "#ffffff")] },
  { id: "punchingBag", words: /\b(punching bag|heavy bag|boxing bag|sandbag)\b/, size: 0.7, parts: [
    P("round", 0, 0.05, 0.42, 0.9, "#c0392b"), P("rect", 0, -0.44, 0.36, 0.1, DARK), P("rect", 0, 0.05, 0.43, 0.06, DARK), P("line", 0, -0.5, 0, 0.06, DARK)] },
  { id: "soccerBall", words: /\b(soccer ?ball|football)\b/, size: 0.12, parts: [
    P("circle", 0, 0, 1, 1, "#ffffff"), P("circle", 0, 0, 0.32, 0.32, "#222222"), P("circle", 0.3, -0.12, 0.16, 0.16, "#222222"),
    P("circle", -0.3, -0.12, 0.16, 0.16, "#222222"), P("circle", 0.19, 0.28, 0.16, 0.16, "#222222"), P("circle", -0.19, 0.28, 0.16, 0.16, "#222222"), P("circle", 0, -0.34, 0.16, 0.16, "#222222")] },
  { id: "basketball", words: /\bbasket ?balls?\b/, size: 0.13, parts: [
    P("circle", 0, 0, 1, 1, "#e8731a"), P("line", 0, -0.5, 0, 1, "#2b1a10"), P("line", -0.5, 0, 1, 0, "#2b1a10"), P("ellipse", -0.18, 0, 0.36, 0.86, "#e8731a"), P("line", 0, -0.5, 0, 1, "#2b1a10")] },
  { id: "beachBall", words: /\bbeach ?balls?\b/, size: 0.2, parts: [
    P("circle", 0, 0, 1, 1, "#ffffff"), P("ellipse", 0, 0, 0.6, 1, "#e4572e"), P("ellipse", 0, 0, 0.22, 1, "#2f5fb3"), P("circle", 0, 0, 0.14, 0.14, "#f6c945")] },
  { id: "ball", words: /\b(ball|balls|tennis ball|baseball|dodgeball|kickball|volleyball)\b/, size: 0.12, parts: [
    P("circle", 0, 0, 1, 1, "#e02424"), P("circle", -0.2, -0.2, 0.24, 0.24, "#ff9a9a")] },
  { id: "broom", words: /\bbrooms?\b/, size: 0.8, parts: [
    P("line", 0, -0.5, 0, 0.74, "#c99a5b"), P("rect", 0, 0.27, 0.12, 0.06, "#c0392b"), P("round", 0, 0.39, 0.32, 0.22, "#d9b44a"),
    P("line", -0.08, 0.32, -0.03, 0.18, "#a8862e"), P("line", 0.08, 0.32, 0.03, 0.18, "#a8862e")] },
  { id: "mop", words: /\bmops?\b/, size: 0.8, parts: [
    P("line", 0, -0.5, 0, 0.72, "#3a7bd5"), P("rect", 0, 0.24, 0.18, 0.05, "#555555"), P("round", 0, 0.37, 0.3, 0.24, "#ece6d2"),
    ...[-0.09, -0.03, 0.03, 0.09].map((x) => P("line", x, 0.3, x * 0.4, 0.18, "#b9b29a"))] },
  { id: "rake", words: /\brakes?\b/, size: 0.8, parts: [
    P("line", 0, -0.5, 0, 0.88, HANDLE), P("rect", 0, 0.4, 0.36, 0.04, "#777777"),
    ...[-0.15, -0.09, -0.03, 0.03, 0.09, 0.15].map((x) => P("line", x, 0.42, 0, 0.08, "#666666"))] },
  { id: "shovel", words: /\b(shovels?|spades?)\b/, size: 0.8, parts: [
    P("rect", 0, -0.47, 0.14, 0.05, DARK), P("line", 0, -0.47, 0, 0.66, HANDLE), P("rect", 0, 0.2, 0.08, 0.05, "#6d6d6d"), P("round", 0, 0.34, 0.2, 0.32, STEEL)] },
  { id: "wateringCan", words: /\bwatering ?cans?\b/, size: 0.2, parts: [
    P("line", 0.42, 0.25, 0.5, -0.55, "#2f7d3a"), P("rect", 0.95, -0.32, 0.14, 0.14, "#2f7d3a"), P("round", 0, 0.1, 0.9, 0.8, "#3f9b45"),
    P("rect", -0.1, -0.42, 0.55, 0.07, "#2f7d3a"), P("line", -0.37, -0.42, 0, 0.12, "#2f7d3a"), P("line", 0.17, -0.42, 0, 0.12, "#2f7d3a")] },
  { id: "bucket", words: /\b(buckets?|pails?)\b/, size: 0.2, parts: [
    P("line", -0.42, -0.3, 0.42, -0.2, "#555555"), P("line", 0, -0.5, 0.42, 0.2, "#555555"), P("rect", 0, 0.1, 0.8, 0.8, "#3b82c4"), P("rect", 0, -0.3, 0.9, 0.08, "#2a5f91")] },
  { id: "jug", words: /\b(jugs?|pitchers?|milk|carafe)\b/, size: 0.15, parts: [
    P("round", 0.36, -0.05, 0.16, 0.44, "#f2f2f2"), P("round", 0, 0.1, 0.62, 0.8, "#f2f2f2"), P("rect", 0, -0.37, 0.26, 0.12, "#2f5fb3")] },
  { id: "fryingPan", words: /\b(frying ?pans?|skillets?|pans?|wok)\b/, size: 0.09, parts: [
    P("round", 0.95, -0.15, 1.3, 0.26, "#5a3a22"), P("round", -0.5, 0, 1.4, 1, "#2b2b2b")] },
  { id: "cup", words: /\b(cups?|mugs?|teacups?)\b/, size: 0.06, parts: [P("round", 0.42, 0, 0.3, 0.55, "#e4572e"), P("rect", 0, 0, 0.8, 1, "#e4572e"), P("rect", 0, -0.42, 0.8, 0.08, "#ffffff")] },
  { id: "glass", words: /\b(glass|glasses|tumbler)\b/, size: 0.07, parts: [P("rect", 0, 0, 0.6, 1, "#d6ecf8"), P("rect", 0, 0.2, 0.6, 0.6, "#7fb8e6"), P("line", -0.18, -0.35, 0, 0.6, "#ffffff")] },
  { id: "book", words: /\b(books?|notebooks?|diary|novel)\b/, size: 0.1, parts: [
    P("rect", 0.32, 0, 0.12, 0.92, "#f4f1e6"), P("rect", -0.04, 0, 0.72, 1, "#2f5fb3"), P("rect", -0.04, -0.2, 0.42, 0.1, "#f6c945")] },
  { id: "phone", words: /\b(phones?|smartphones?|cell ?phones?|mobile)\b/, size: 0.08, parts: [P("round", 0, 0, 0.5, 1, "#222222"), P("rect", 0, -0.03, 0.4, 0.78, "#5fa8e8"), P("circle", 0, 0.44, 0.06, 0.06, "#888888")] },
  { id: "flashlight", words: /\b(flashlights?|flash light|torchlight)\b/, size: 0.06, parts: [
    P("round", 0, 0, 1.8, 0.62, "#f6c945"), P("rect", 1.0, 0, 0.5, 1, "#444444"), P("rect", 1.27, 0, 0.06, 0.86, "#fff5b0"), P("rect", 0, -0.34, 0.22, 0.08, "#c0392b")] },
  { id: "chair", words: /\b(chairs?|stools?|seats?)\b/, size: 0.5, parts: [
    P("line", -0.25, 0.08, 0, 0.42, DARK_WOOD), P("line", 0.24, 0.08, 0, 0.42, DARK_WOOD), P("rect", -0.25, -0.22, 0.07, 0.56, WOOD), P("rect", 0, 0.05, 0.56, 0.08, WOOD)] },
  { id: "desk", words: /\b(desks?|workbench)\b/, size: 0.42, parts: [
    P("rect", -0.62, 0.05, 0.08, 0.9, DARK_WOOD), P("rect", 0.42, 0.05, 0.5, 0.9, WOOD), P("rect", 0.42, -0.12, 0.42, 0.003, DARK_WOOD), P("rect", 0.42, 0.2, 0.42, 0.003, DARK_WOOD),
    P("circle", 0.42, -0.25, 0.06, 0.06, DARK), P("circle", 0.42, 0.05, 0.06, 0.06, DARK), P("rect", 0, -0.45, 1.5, 0.1, WOOD)] },
  { id: "table", words: /\b(tables?|counters?)\b/, size: 0.42, parts: [P("rect", -0.7, 0.05, 0.08, 0.9, DARK_WOOD), P("rect", 0.7, 0.05, 0.08, 0.9, DARK_WOOD), P("rect", 0, -0.45, 1.65, 0.1, WOOD)] },
  { id: "bench", words: /\b(benches|bench|park bench)\b/, size: 0.4, parts: [
    P("rect", -0.9, 0.05, 0.1, 0.9, "#444444"), P("rect", 0.9, 0.05, 0.1, 0.9, "#444444"), P("rect", 0, -0.42, 2.2, 0.12, WOOD), P("rect", 0, -0.06, 2.3, 0.13, WOOD)] },
  { id: "door", words: /\b(doors?|doorway)\b/, size: 1.1, parts: [
    P("rect", 0, 0, 0.5, 1, DARK_WOOD), P("rect", 0, -0.22, 0.34, 0.36, "#8b5a2b"), P("rect", 0, 0.22, 0.34, 0.36, "#8b5a2b"), P("circle", 0.17, 0.02, 0.06, 0.06, "#c9a227")] },
  { id: "gate", words: /\b(gates?|fences?|picket)\b/, size: 0.7, parts: [
    P("rect", 0, -0.25, 1.2, 0.07, DARK_WOOD), P("rect", 0, 0.25, 1.2, 0.07, DARK_WOOD),
    ...[-0.4, -0.2, 0, 0.2, 0.4].map((x) => P("rect", x, 0.05, 0.1, 0.9, "#e6d3b0")), P("rect", -0.62, 0, 0.1, 1, DARK_WOOD), P("rect", 0.62, 0, 0.1, 1, DARK_WOOD)] },
  { id: "ladder", words: /\bladders?\b/, size: 1.2, parts: [
    ...[-0.4, -0.24, -0.08, 0.08, 0.24, 0.4].map((y) => P("rect", 0, y, 0.34, 0.035, WOOD)), P("rect", -0.17, 0, 0.05, 1, DARK_WOOD), P("rect", 0.17, 0, 0.05, 1, DARK_WOOD)] },
  { id: "skateboard", words: /\bskate ?boards?\b/, size: 0.07, parts: [
    P("rect", -2.2, 0.08, 0.6, 0.2, "#888888"), P("rect", 2.2, 0.08, 0.6, 0.2, "#888888"), P("circle", -2.2, 0.28, 0.44, 0.44, "#f6c945"), P("circle", 2.2, 0.28, 0.44, 0.44, "#f6c945"),
    P("round", 0, -0.2, 6.5, 0.45, "#e4572e")] },
  { id: "bike", words: /\b(bikes?|bicycles?)\b/, size: 0.5, parts: [
    P("circle", -0.62, 0.18, 0.64, 0.64, "#222222"), P("circle", -0.62, 0.18, 0.5, 0.5, "#ffffff"), P("circle", 0.62, 0.18, 0.64, 0.64, "#222222"), P("circle", 0.62, 0.18, 0.5, 0.5, "#ffffff"),
    P("line", -0.62, 0.18, 0.47, -0.48, "#2f5fb3"), P("line", -0.15, -0.3, 0.6, 0, "#2f5fb3"), P("line", 0.45, -0.3, 0.17, 0.48, "#2f5fb3"),
    P("line", 0, 0.18, -0.15, -0.48, "#2f5fb3"), P("line", -0.62, 0.18, 0.62, 0, "#2f5fb3"), P("line", 0, 0.18, 0.45, -0.48, "#2f5fb3"),
    P("line", 0.45, -0.3, 0.05, -0.17, DARK), P("rect", 0.54, -0.47, 0.16, 0.05, DARK), P("rect", -0.17, -0.35, 0.22, 0.06, DARK)] },
  { id: "house", words: /\b(houses?|home|cabin|cottage)\b/, size: 1.4, parts: [
    P("rect", 0.32, -0.3, 0.12, 0.3, "#8b3a2e"), P("triangle", 0, -0.25, 1.3, 0.5, "#b03a2e"), P("rect", 0, 0.2, 1.1, 0.6, "#f2d6a2"),
    P("rect", 0.25, 0.3, 0.2, 0.4, DARK_WOOD), P("rect", -0.25, 0.12, 0.26, 0.2, "#bfe6ff")] },
  { id: "campfire", words: /\b(camp ?fires?|bonfires?|fire ?pit|fireplace)\b/, size: 0.28, parts: [
    P("triangle", 0, -0.08, 0.72, 0.84, "#ff7a1a"), P("triangle", -0.22, 0.08, 0.3, 0.5, "#e4572e"), P("triangle", 0.22, 0.08, 0.3, 0.5, "#e4572e"), P("triangle", 0, 0.08, 0.36, 0.5, "#ffd84a"),
    P("round", 0, 0.36, 1.1, 0.14, DARK_WOOD), P("circle", -0.5, 0.42, 0.16, 0.16, "#8c8c88"), P("circle", 0.5, 0.42, 0.16, 0.16, "#8c8c88")] },
  { id: "stove", words: /\b(stoves?|ovens?|cooker|kitchen range)\b/, size: 0.5, parts: [
    P("rect", 0, 0.05, 0.9, 0.9, "#e8e8e8"), P("rect", 0, -0.43, 0.96, 0.06, DARK), P("rect", 0, 0.18, 0.7, 0.45, "#444444"), P("rect", 0, 0.18, 0.5, 0.25, "#8a8a8a"),
    ...[-0.3, -0.1, 0.1, 0.3].map((x) => P("circle", x, -0.27, 0.08, 0.08, "#222222"))] },
  // (batch 2, Oct 15: more things stories name)
  { id: "trashCan", words: /\b(trash ?cans?|garbage ?cans?|bins?|dustbins?)\b/, size: 0.4, parts: [P("rect", 0, 0.08, 0.6, 0.84, "#6b7b8c"), P("rect", 0, -0.38, 0.7, 0.1, "#55636f"), P("rect", 0, -0.46, 0.2, 0.06, "#55636f"), P("line", -0.15, -0.2, 0, 0.6, "#55636f"), P("line", 0.15, -0.2, 0, 0.6, "#55636f")] },
  { id: "barrel", words: /\bbarrels?\b/, size: 0.5, parts: [P("round", 0, 0, 0.7, 1, "#a0703c"), P("rect", 0, -0.3, 0.72, 0.05, "#555555"), P("rect", 0, 0.3, 0.72, 0.05, "#555555")] },
  { id: "umbrella", words: /\b(umbrellas?|parasols?)\b/, size: 0.6, parts: [P("line", 0, -0.2, 0, 0.62, DARK), P("line", 0, 0.42, 0.08, 0.06, DARK), P("triangle", 0, -0.32, 1.2, 0.36, "#d63384")] },
  { id: "backpack", words: /\b(back ?packs?|school ?bags?|rucksacks?)\b/, size: 0.28, parts: [P("round", 0, 0, 0.75, 1, "#2f5fb3"), P("round", 0, 0.2, 0.55, 0.4, "#244a8c"), P("rect", 0, -0.38, 0.3, 0.06, DARK)] },
  { id: "lantern", words: /\blanterns?\b/, size: 0.18, parts: [P("line", 0, -0.5, 0, 0.12, DARK), P("rect", 0, -0.33, 0.6, 0.12, DARK), P("rect", 0, 0.05, 0.5, 0.65, "#ffd84a"), P("ellipse", 0, 0.05, 0.22, 0.38, "#ff9a1a"), P("rect", 0, 0.42, 0.66, 0.1, DARK)] },
  { id: "candle", words: /\bcandles?\b/, size: 0.12, parts: [P("rect", 0, 0.15, 0.3, 0.7, "#f4f1e6"), P("line", 0, -0.2, 0, -0.08, DARK), P("ellipse", 0, -0.36, 0.18, 0.28, "#ff9a1a")] },
  { id: "present", words: /\b(presents?|gifts?|gift ?box(es)?)\b/, size: 0.22, parts: [P("rect", 0, 0.1, 0.9, 0.8, "#d63384"), P("rect", 0, 0.1, 0.14, 0.8, "#f6c945"), P("rect", 0, -0.25, 1.0, 0.14, "#d63384"), P("rect", 0, -0.25, 0.14, 0.14, "#f6c945"), P("ellipse", -0.14, -0.4, 0.26, 0.18, "#f6c945"), P("ellipse", 0.14, -0.4, 0.26, 0.18, "#f6c945")] },
  { id: "hammer", words: /\b(hammers?|mallets?)\b/, size: 0.2, parts: [P("line", 0, -0.2, 0, 0.7, HANDLE), P("rect", 0, -0.35, 0.7, 0.3, "#6d6d6d")] },
  { id: "axe", words: /\b(axes|axe|hatchets?)\b/, size: 0.45, parts: [P("line", 0, -0.5, 0, 1, HANDLE), P("triangle", 0.18, -0.36, 0.34, 0.26, STEEL)] },
  { id: "wrench", words: /\b(wrench(es)?|spanners?)\b/, size: 0.18, parts: [P("rect", 0, 0.05, 0.16, 0.8, "#8a8a8a"), P("round", 0, -0.38, 0.4, 0.24, "#8a8a8a"), P("rect", 0, -0.45, 0.14, 0.12, "#ffffff")] },
  { id: "fishingRod", words: /\b(fishing ?rods?|fishing ?poles?|rods?)\b/, size: 0.9, parts: [P("line", 0, -0.5, 0, 1, "#3d3d3d"), P("circle", 0.06, 0.3, 0.1, 0.1, "#888888"), P("rect", 0, 0.42, 0.05, 0.16, "#7a4b2a")] },
  { id: "flag", words: /\b(flags?|banners?)\b/, size: 0.9, parts: [P("line", -0.3, -0.5, 0, 1, "#555555"), P("rect", 0.0, -0.33, 0.6, 0.36, "#e4572e"), P("rect", 0.0, -0.33, 0.6, 0.12, "#ffffff")] },
  { id: "pillow", words: /\b(pillows?|cushions?)\b/, size: 0.12, parts: [P("round", 0, 0, 2.4, 1, "#f2f2f8")] },
  { id: "bed", words: /\bbeds?\b/, size: 0.35, parts: [P("rect", -1.4, 0, 0.12, 1, DARK_WOOD), P("rect", 0, 0.2, 2.9, 0.3, WOOD), P("rect", 0, 0.0, 2.8, 0.2, "#2f5fb3"), P("round", -1.05, -0.15, 0.5, 0.2, "#ffffff"), P("rect", 1.4, 0.2, 0.1, 0.6, DARK_WOOD)] },
  { id: "couch", words: /\b(couch(es)?|sofas?)\b/, size: 0.4, parts: [P("round", 0, -0.2, 2.2, 0.5, "#8e44ad"), P("round", 0, 0.15, 2.4, 0.4, "#8e44ad"), P("round", -1.15, 0.05, 0.3, 0.6, "#73368c"), P("round", 1.15, 0.05, 0.3, 0.6, "#73368c"), P("rect", -1.0, 0.43, 0.1, 0.14, DARK), P("rect", 1.0, 0.43, 0.1, 0.14, DARK)] },
  { id: "tent", words: /\btents?\b/, size: 0.8, parts: [P("triangle", 0, 0, 1.8, 1, "#3f9b45"), P("triangle", 0, 0.2, 0.5, 0.6, "#24612b")] },
  { id: "bottle", words: /\b(bottles?|water bottles?)\b/, size: 0.12, parts: [P("rect", 0, -0.42, 0.18, 0.1, "#2f5fb3"), P("rect", 0, -0.3, 0.2, 0.16, "#9fd3f0"), P("round", 0, 0.18, 0.4, 0.66, "#9fd3f0"), P("rect", 0, 0.15, 0.4, 0.2, "#ffffff")] },
  { id: "bowl", words: /\bbowls?\b/, size: 0.06, parts: [P("ellipse", 0, -0.1, 2.0, 1.1, "#e4572e"), P("rect", 0, -0.35, 2.1, 0.3, "#ffffff"), P("rect", 0, 0.42, 0.8, 0.16, "#c0392b")] },
  { id: "plate", words: /\b(plates?|dish(es)?|trays?)\b/, size: 0.025, parts: [P("round", 0, 0, 8, 1, "#f2f2f2")] },
  { id: "apple", words: /\bapples?\b/, size: 0.06, parts: [P("line", 0, -0.5, 0.05, 0.2, "#7a4b2a"), P("ellipse", 0.15, -0.38, 0.3, 0.14, "#3f9b45"), P("circle", 0, 0.1, 0.8, 0.8, "#d62828")] },
  { id: "cake", words: /\b(cakes?|birthday cake)\b/, size: 0.18, parts: [P("rect", 0, 0.4, 1.4, 0.06, "#cccccc"), P("rect", 0, 0.18, 1.2, 0.38, "#f2c6de"), P("rect", 0, -0.12, 0.85, 0.28, "#f2c6de"), P("rect", 0, -0.04, 1.2, 0.05, "#ffffff"), P("line", 0, -0.42, 0, 0.16, "#2f5fb3"), P("ellipse", 0, -0.46, 0.08, 0.1, "#ff9a1a")] },
  { id: "pizza", words: /\b(pizzas?|pizza slice)\b/, size: 0.1, parts: [P("triangle", 0, 0, 0.9, 1, "#f6c945"), P("rect", 0, 0.45, 0.95, 0.12, "#c98a3b"), P("circle", -0.1, 0.2, 0.14, 0.14, "#c0392b"), P("circle", 0.12, 0.25, 0.12, 0.12, "#c0392b"), P("circle", 0, -0.05, 0.1, 0.1, "#c0392b")] },
  { id: "laptop", words: /\b(laptops?|computers?)\b/, size: 0.12, parts: [P("rect", 0, -0.08, 1.4, 0.84, "#444444"), P("rect", 0, -0.08, 1.24, 0.7, "#5fa8e8"), P("rect", 0, 0.44, 1.7, 0.12, "#888888")] },
  { id: "tv", words: /\b(tvs?|televisions?|tv screen)\b/, size: 0.4, parts: [P("rect", 0, -0.1, 1.6, 0.8, "#222222"), P("rect", 0, -0.1, 1.46, 0.68, "#3b6fa8"), P("rect", 0, 0.38, 0.12, 0.16, "#333333"), P("rect", 0, 0.47, 0.6, 0.06, "#333333")] },
  { id: "guitar", words: /\bguitars?\b/, size: 0.5, parts: [P("rect", 0, -0.25, 0.08, 0.5, DARK_WOOD), P("rect", 0, -0.46, 0.12, 0.08, DARK), P("ellipse", 0, 0.12, 0.36, 0.3, "#c97a2b"), P("ellipse", 0, 0.32, 0.46, 0.36, "#c97a2b"), P("circle", 0, 0.18, 0.12, 0.12, "#3a2410")] },
  { id: "hat", words: /\b(hats?|caps?|beanies?)\b/, size: 0.14, parts: [P("rect", 0, 0.38, 1.6, 0.16, "#3a3a3a"), P("round", 0, -0.05, 0.9, 0.86, "#3a3a3a"), P("rect", 0, 0.18, 0.92, 0.12, "#c0392b")] },
  { id: "balloon", words: /\bballoons?\b/, size: 0.22, parts: [P("ellipse", 0, -0.1, 0.62, 0.8, "#e02424"), P("triangle", 0, 0.34, 0.1, 0.08, "#e02424"), P("ellipse", -0.12, -0.28, 0.12, 0.2, "#ff9a9a")] },
  { id: "kite", words: /\bkites?\b/, size: 0.3, parts: [P("triangle", 0, -0.25, 0.7, 0.5, "#f6c945"), P("triangle", 0, 0.12, 0.7, 0.25, "#e4572e"), P("line", 0, 0.24, 0.08, 0.26, "#555555")] },
];

const stemKey = (s: string) => s.toLowerCase().replace(/([a-z])([A-Z])/g, "$1 $2").replace(/[^a-z]+/g, " ").trim();

// The everyday thing a name means (the head noun — its last words — first), or null.
export function everydayThing(name: unknown): EverydayThing | null {
  const words = stemKey(String(name ?? "")).split(" ").filter(Boolean);
  for (let k = 1; k <= words.length; k += 1) {
    const tail = words.slice(words.length - k).join(" ");
    // (the shortest tail that names a thing; for that tail, the most specific entry — the first in the book)
    const hit = EVERYDAY.find((t) => t.words.test(tail));
    if (hit) {
      // (a longer tail may name something MORE specific: "basketball hoop" vs "hoop" are one entry; "soccer ball" vs "ball" are not)
      const longer = words.length > k ? EVERYDAY.find((t) => t.words.test(words.slice(words.length - k - 1).join(" "))) : undefined;
      return longer && EVERYDAY.indexOf(longer) < EVERYDAY.indexOf(hit) ? longer : hit;
    }
  }
  return null;
}

// A prop's params with its picture filled in from the book when it has none (no parts and no built-in symbol), its default size
// set when none was written. Anything else comes back unchanged.
export function withEverydayPicture<T extends Record<string, unknown>>(params: T, hasSymbol: (name: unknown) => boolean): T {
  if (Array.isArray(params.parts) && params.parts.length) return params;
  if (params.symbol !== undefined && hasSymbol(params.symbol)) return params;
  const thing = everydayThing(params.symbol ?? params.name);
  if (!thing) return params;
  return { ...params, parts: thing.parts.map((p) => ({ ...p })), ...(typeof params.size === "number" && params.size > 0 ? {} : { size: thing.size }), everyday: thing.id };
}
