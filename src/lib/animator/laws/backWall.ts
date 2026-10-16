// THINGS ON WALLS HANG ON THE WALL (Arthur, Oct 15: the office window, the poster in the kid's room, the elevator's button panel and
// the classroom chalkboard were all called "floats in the air on the wall side: it touches no wall"). The page's backdrop behind the
// figures IS a wall wherever there is one: every room has a back wall, and a building's face is a wall outdoors. A thing placed
// `onWall` that is NOT down in a pit / on a cliff face (those must touch the pit's own wall — moves/tumbleScene.ts) hangs on that back
// wall when either
//   - it is a thing that is made to hang on a wall (a window, a poster, a picture, a chalkboard, a clock, a sign, a button panel, a
//     screen, a mirror, a shelf, a light switch…), or
//   - the scene is INDOORS (its background has no open-air pieces: no sun, clouds, hills, trees, mountains, stars…) — the whole
//     backdrop is the room's wall.
// A rock or ledge "onWall" in the open air with no pit near still floats (that is the cliff-fall rule's job).
import { placeIsIndoors } from "../effects/places.ts";

type PieceLike = { kind?: unknown };
type PlanLike = { background?: { pieces?: PieceLike[] } | null };
type TrackLike = { params?: Record<string, unknown> | null };

export const WALL_HUNG = /\b(window|poster|picture|painting|portrait|photo|frame|chalk ?board|black ?board|white ?board|notice ?board|bulletin|board|clock|sign|plaque|button|panel|keypad|intercom|switch|socket|outlet|thermostat|display|screen|monitor|tv|television|mirror|shelf|shelves|banner|calendar|map|chart|dart ?board|scoreboard|vent|lamp|light|sconce|hook|coat ?rack|curtain|blinds|cabinet|cupboard|speaker|alarm|fire ?extinguisher|mailbox|basketball hoop|hoop|net|flag|diploma|certificate|wreath|mask|shield|antlers)s?\b/i;
const OPEN_AIR = /^(sun|moon|clouds?|hills?|mountains?|trees?|forest|stars?|grass|flowers?|bushes|bush|city|skyline|buildings?|fence|water|sea|ocean|lake|river|beach|sand|snow|rain|desert|cactus|field|road|path|street|park|pit|cliff|volcano|aurora|rainbow)$/i;

export function isIndoors(plan: PlanLike): boolean {
  // (a whole named place — effects/places.ts — knows itself whether it is a room: a kitchen yes, a park no)
  const place = (plan.background?.pieces ?? []).find((p) => p?.kind === "place") as { params?: { place?: unknown } } | undefined;
  if (place) return placeIsIndoors(place.params?.place);
  const kinds = (plan.background?.pieces ?? []).map((p) => String(p?.kind ?? ""));
  if (kinds.some((k) => /room|wall|indoor|interior|office|classroom|kitchen|hall|elevator|lobby|floorboards|tiles/i.test(k))) return true;
  return kinds.length > 0 && !kinds.some((k) => OPEN_AIR.test(k));
}

export function hangsOnBackWall(plan: PlanLike, e: TrackLike, inPit: boolean): boolean {
  const p = e.params ?? {};
  if (p.onWall !== true || inPit) return false;
  const name = `${String(p.name ?? "")} ${String(p.symbol ?? "")}`;
  return WALL_HUNG.test(name) || isIndoors(plan);
}
