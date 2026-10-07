// What is this drawing? A stick figure (H1's finder) — or an explosion, fire, water, lightning, ice or smoke the
// engine knows how to animate (drawingShape.ts: general shape + colour rules). "Make my drawing come TRUE", any drawing.
import { findStickFigure } from "./stickFigure.ts";
import { readDrawingWith } from "./drawingShape.ts";
import type { InkImage, ReadDrawing } from "./types.ts";

export function readDrawing(img: InkImage): ReadDrawing {
  return readDrawingWith(img, findStickFigure);
}
