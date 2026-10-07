import type { Point } from "../rig.ts";
import type { DrawnLook, JointPick } from "../moves/fromDrawing.ts";

// SPEC-0017 "50-50": the engine LOOKS at the user's drawing itself (Arthur, 2026-10-07: "no more asking questions" —
// never make the user click joints). The app hands the engine one frame of one layer as an RGBA picture.
// A pixel (px, py) of the picture is the page point (x0 + px / scale, y0 + py / scale) — page space is the app's
// 1080-tall page (x centred on 960), the same space engine scenes use.
export type InkImage = { width: number; height: number; data: Uint8ClampedArray | Uint8Array; x0: number; y0: number; scale: number };
export const inkToPage = (img: InkImage, px: number, py: number): Point => ({ x: img.x0 + px / img.scale, y: img.y0 + py / img.scale });

// A stick figure the engine found in a picture: its joints (page space), its look, and how sure the engine is (0..1).
// `explained` = the share of the picture's ink that the figure accounts for (the rest is something else: effect lines,
// a background, a second drawing).
export type FoundFigure = { joints: Record<JointPick, Point>; look: DrawnLook; confidence: number; explained: number };

// What a drawing IS (when it is not, or not only, a stick figure).
export type DrawingKind = "stickFigure" | "explosion" | "airExplosion" | "fire" | "water" | "lightning" | "ice" | "smoke" | "unknown";
export type Box = { x: number; y: number; w: number; h: number }; // page space
export type ReadDrawing = { kind: DrawingKind; box: Box; groundY: number; colors: string[]; figure: FoundFigure | null; reason: string };
