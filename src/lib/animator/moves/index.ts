import { buildScene, type Scene } from "../engine.ts";
import { animationBounds } from "../stageFit.ts";
import { DEFAULT_STYLE } from "../rig.ts";
import { buildGait, naturalDistance, type GaitKind } from "./gait.ts";
import type { MoveSpeed, MoveStyle } from "./styles.ts";

// SPEC-0017 Phase 2: the moves library. Each move turns a few settings into key poses for the engine.
export { MOVE_SPEEDS, MOVE_STYLES, type MoveSpeed, type MoveStyle } from "./styles.ts";

export const LIBRARY_MOVES = [
  { id: "walk", title: "Walk" },
  { id: "run", title: "Run" },
] as const;
export type LibraryMoveId = (typeof LIBRARY_MOVES)[number]["id"];

// stageWidth: how much of the stage the page shows (stage units); the move then covers only as much
// ground as fits, so the whole animation stays on the page at the figure's normal size.
export type MoveTestOptions = { move: LibraryMoveId; style: MoveStyle; speed: MoveSpeed; energy: number; direction: 1 | -1; stageWidth?: number; color?: string; hollowHead?: boolean; neck?: boolean };

const GROUND = 900;
const HEIGHT = 300;

const PAGE_MARGIN = 0.04; // keep this share of the page free at each side

// A one-character scene for the review-only Moves test, centered on the stage. A run needs room to
// speed up, cruise and slow down, so on a wide page it covers more ground; on a narrower page it covers
// only what fits (the editor then centers the whole animation on the page).
export function makeMoveTestScene(options: MoveTestOptions): Scene {
  const wanted = options.move === "run" ? 1500 : 700;
  let scene = moveScene(options, wanted);
  if (options.stageWidth === undefined) return scene;
  const room = options.stageWidth * (1 - 2 * PAGE_MARGIN);
  // The body reaches past its hips (arms, legs, head); measure how far, and shorten the trip to fit.
  for (let i = 0, span = wanted; i < 3; i += 1) {
    const b = animationBounds(buildScene(scene, 24).frames);
    if (b.right - b.left <= room + 0.5) break;
    span = Math.max(MIN_SPAN, span - (b.right - b.left - room) - 2);
    scene = moveScene(options, span);
  }
  return scene;
}

const MIN_SPAN = 60;

function moveScene(options: MoveTestOptions, maxSpan: number): Scene {
  const recipe = { kind: options.move as GaitKind, direction: options.direction, height: HEIGHT, speed: options.speed, style: options.style, energy: options.energy };
  // Natural step lengths: cover a little less ground rather than stretch or squeeze the steps.
  const span = naturalDistance({ ...recipe, startX: 0 }, maxSpan);
  const startX = 960 - (options.direction * span) / 2;
  const gait = buildGait({ ...recipe, startX, distance: span });
  const title = `${options.style === "natural" ? "" : `${options.style[0].toUpperCase()}${options.style.slice(1)} `}${options.move}${options.speed === "normal" ? "" : ` (${options.speed})`}`;
  return {
    id: `move-${options.move}-${options.style}-${options.speed}`,
    title: title[0].toUpperCase() + title.slice(1),
    durationSec: Math.ceil((gait.endT + 0.2) * 10) / 10,
    groundY: GROUND,
    characters: [{ id: "a", name: "Mover", facing: options.direction > 0 ? "right" : "left", height: HEIGHT, style: { ...DEFAULT_STYLE, color: options.color ?? DEFAULT_STYLE.color, headFilled: !options.hollowHead, neck: options.neck === true }, keys: gait.keys }],
  };
}
