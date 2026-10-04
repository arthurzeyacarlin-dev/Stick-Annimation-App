import type { FrameCharacter } from "./engine.ts";
import type { Point } from "./rig.ts";

// Maps 1920x1080 stage units to the pixels of the picture being drawn.
export type StageToPixels = { scale: number; offsetX: number; offsetY: number };

type Ctx = Pick<CanvasRenderingContext2D,
  "save" | "restore" | "beginPath" | "moveTo" | "lineTo" | "arc" | "stroke" | "fill" | "setTransform"> & {
  strokeStyle: string | CanvasGradient | CanvasPattern;
  fillStyle: string | CanvasGradient | CanvasPattern;
  lineWidth: number;
  lineCap: CanvasLineCap;
  lineJoin: CanvasLineJoin;
};

const line = (ctx: Ctx, points: Point[]) => {
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (const point of points.slice(1)) ctx.lineTo(point.x, point.y);
  ctx.stroke();
};

// Draws one frame of stick figures. Far-side limbs first so near-side limbs sit on top.
export function drawFrame(ctx: Ctx, characters: FrameCharacter[], map: StageToPixels) {
  ctx.save();
  ctx.setTransform(map.scale, 0, 0, map.scale, map.offsetX, map.offsetY);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (const { skeleton: s, style, headRadius, facing } of characters) {
    ctx.strokeStyle = style.color;
    ctx.fillStyle = style.color;
    ctx.lineWidth = style.thickness;
    const near = facing === "left" ? "r" : "l";
    const far = near === "l" ? "r" : "l";
    const arm = (side: "l" | "r") => line(ctx, [s.neck, s[`${side}Elbow`], s[`${side}Hand`]]);
    const leg = (side: "l" | "r") => line(ctx, [s.hip, s[`${side}Knee`], s[`${side}Foot`]]);
    arm(far);
    leg(far);
    // Torso + neck up to the bottom of the head circle.
    const dx = s.head.x - s.neck.x, dy = s.head.y - s.neck.y, length = Math.hypot(dx, dy) || 1;
    line(ctx, [s.hip, s.neck, { x: s.head.x - (dx / length) * headRadius, y: s.head.y - (dy / length) * headRadius }]);
    leg(near);
    arm(near);
    ctx.beginPath();
    ctx.arc(s.head.x, s.head.y, headRadius, 0, Math.PI * 2);
    if (style.headFilled) ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
}
