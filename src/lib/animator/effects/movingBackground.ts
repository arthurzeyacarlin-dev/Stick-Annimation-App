// MOVING BACKGROUNDS ON THEIR OWN LAYERS (SPEC-0017 Phase 2C extras, 2026-10-06; used by the app: DrawingWorkspace
// applyAnimatorScene). The app turns the background into page-sized pictures; one for every frame would use too
// much memory, so its memory guard would redraw a moving background only every few pictures (jumpy). A scene with
// rain, a waterfall or wind (effects/backgrounds.ts) is split instead into:
//   - the STILL part (the same in every picture): the background layer, one picture held all through;
//   - the FAST part (rain, the waterfall's water): its own layer just above, drawn every picture — raindrops are
//     symbols there, so it costs little;
//   - the SLOW part (trees and grass in the wind, drifting clouds, anything else that moves): its own layer between
//     them, drawn every picture while memory allows (so a long scene on a big screen can never make the rain jumpy).
// Each moving layer is only as big as its moving things. Drawing order is kept: a shape drawn over one in a higher
// layer that it overlaps goes up into that layer. null = nothing to split: the background is drawn exactly as before.
import type { SceneFrames } from "../engine.ts";
import { shapeBounds } from "../symbolMaker.ts";
import { BACKGROUND_PIECES } from "./index.ts";
import type { BackgroundPiece, BackgroundSpec, Shape } from "./types.ts";

const FAST = new Set(["rain", "waterfall"]);
const isMoving = (piece: BackgroundPiece) => FAST.has(piece.kind) || ((piece.kind === "trees" || piece.kind === "grass") && typeof piece.params?.wind === "number" && piece.params.wind !== 0);
const moved = (s: Shape, dx: number, dy: number): Shape => (dx === 0 && dy === 0 ? s : s.kind === "circle" || s.kind === "rect" || s.kind === "symbol"
  ? { ...s, x: s.x + dx, y: s.y + dy }
  : { ...s, points: s.points.map((v, i) => v + (i % 2 === 0 ? dx : dy)) });
type Box = ReturnType<typeof shapeBounds>;
const overlap = (a: Box, b: Box) => a.minX < b.maxX && b.minX < a.maxX && a.minY < b.maxY && b.minY < a.maxY;

export type MovingBackground = { still: Shape[][]; layers: { name: string; pictures: Shape[][] }[] };

// `pictures` = the background as the app has it (toFrames.ts sceneEffectLayers, slid by `shift`); it is rebuilt
// here piece by piece to know which piece each shape is from, and left alone (null) if that doesn't match exactly.
// (THE CAMERA: a scene with film cuts or a screen shake is split shot by shot by animator/cameraLayers.ts, which calls
// this for each shot; here such a scene gives null.)
type SceneLike = { background?: BackgroundSpec; groundY: number; stageWidth?: number; characters: { height?: number }[] };
export function movingBackgroundLayers(scene: object, built: SceneFrames, shift: { x: number; y: number }, pictures: readonly (readonly Shape[])[]): MovingBackground | null {
  const fx = scene as SceneLike, pieces = fx.background?.pieces ?? [];
  if (!pieces.some(isMoving) || pictures.length < 2 || pictures.length !== built.frames.length || (built as { camera?: unknown }).camera) return null;
  const stage = { width: fx.stageWidth ?? 1920, groundY: fx.groundY, height: fx.characters[0]?.height ?? 300 };
  type Item = { shape: Shape; key: string; fast: boolean; box: Box; lane: number };
  const items: Item[][] = [];
  for (let i = 0; i < pictures.length; i += 1) {
    const list: Item[] = [];
    for (const piece of pieces) {
      const recipe = BACKGROUND_PIECES[piece.kind];
      if (!recipe) continue;
      for (const s of recipe.draw({ ...piece, params: { seed: fx.background?.seed, ...piece.params } }, i / built.fps, stage)) {
        const shape = moved(s, shift.x, shift.y);
        list.push({ shape, key: JSON.stringify(shape), fast: FAST.has(piece.kind), box: shapeBounds([shape]), lane: 0 });
      }
    }
    if (list.length !== pictures[i].length || list.some((item, j) => item.key !== JSON.stringify(pictures[i][j]))) return null;
    items.push(list);
  }
  // Still = the same shape in every picture. Lanes: 0 still, 1 slow, 2 fast; a shape goes up to the highest lane of
  // any shape drawn before it that it overlaps (a still shape: in any picture, so it stays the same everywhere).
  const seen = new Map<string, number>();
  for (const list of items) for (const key of new Set(list.map((item) => item.key))) seen.set(key, (seen.get(key) ?? 0) + 1);
  const stillLane = new Map([...seen].filter(([, count]) => count === items.length).map(([key]) => [key, 0]));
  for (let changed = true; changed;) {
    changed = false;
    for (const list of items) {
      list.forEach((item, j) => {
        let lane = stillLane.get(item.key) ?? (item.fast ? 2 : 1);
        for (let k = 0; k < j && lane < 2; k += 1) if (list[k].lane > lane && overlap(list[k].box, item.box)) lane = list[k].lane;
        item.lane = lane;
        const before = stillLane.get(item.key);
        if (before !== undefined && lane > before) { stillLane.set(item.key, lane); changed = true; }
      });
    }
  }
  const lanePictures = (lane: number) => items.map((list) => list.filter((item) => item.lane === lane).map((item) => item.shape));
  const still = lanePictures(0);
  if (still.every((list) => list.length === 0)) return null;
  const kinds = new Set(pieces.filter(isMoving).map((piece) => piece.kind));
  const fastName = kinds.has("rain") && kinds.has("waterfall") ? "rain and water" : kinds.has("rain") ? "rain" : "water";
  const slowName = kinds.has("trees") || kinds.has("grass") ? "wind" : "moving background";
  const layers = [{ name: fastName, pictures: lanePictures(2) }, { name: slowName, pictures: lanePictures(1) }].filter((layer) => layer.pictures.some((list) => list.length > 0));
  return layers.length ? { still, layers } : null;
}
