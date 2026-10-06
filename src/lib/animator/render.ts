import type { FrameCharacter, FrameObject } from "./engine.ts";
import { BASKETBALL_SEAM, lookThickness } from "./objects.ts";
import type { Point } from "./rig.ts";

// Maps 1920x1080 stage units to the pixels of the picture being drawn.
export type StageToPixels = { scale: number; offsetX: number; offsetY: number };

type Ctx = Pick<CanvasRenderingContext2D,
  "save" | "restore" | "beginPath" | "moveTo" | "lineTo" | "arc" | "closePath" | "stroke" | "fill" | "setTransform"> & {
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

// Opt-in (default: everything is drawn, unchanged): `skipHeads` leaves the head circles out, for
// callers that show heads as separate Library symbols instead (the torso still ends at the head).
export type DrawFrameOptions = { skipHeads?: boolean };

// Draws one frame of stick figures, then its objects on top (so a held ball is in front of the hand).
// Far-side limbs first so near-side limbs sit on top.
export function drawFrame(ctx: Ctx, characters: FrameCharacter[], map: StageToPixels, objects: readonly FrameObject[] = [], options: DrawFrameOptions = {}) {
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
    // Torso (and the neck, if the figure has one) up to the bottom of the head circle.
    const dx = s.head.x - s.neck.x, dy = s.head.y - s.neck.y, length = Math.hypot(dx, dy) || 1;
    const headBottom = { x: s.head.x - (dx / length) * headRadius, y: s.head.y - (dy / length) * headRadius };
    line(ctx, Math.hypot(headBottom.x - s.neck.x, headBottom.y - s.neck.y) > 0.5 ? [s.hip, s.neck, headBottom] : [s.hip, s.neck]);
    leg(near);
    arm(near);
    if (options.skipHeads) continue;
    ctx.beginPath();
    ctx.arc(s.head.x, s.head.y, headRadius, 0, Math.PI * 2);
    if (style.headFilled) ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
  if (objects.length > 0) drawObjects(ctx, objects, map);
}

// One head on its own, drawn exactly as drawFrame draws it (same color, thickness, solid/hollow and
// radius), centered at `center` (stage units). Used to make a head picture for a Library symbol.
export function drawHead(ctx: Ctx, character: Pick<FrameCharacter, "style" | "headRadius">, center: Point, map: StageToPixels) {
  const { style, headRadius } = character;
  ctx.save();
  ctx.setTransform(map.scale, 0, 0, map.scale, map.offsetX, map.offsetY);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = style.color;
  ctx.fillStyle = style.color;
  ctx.lineWidth = style.thickness;
  ctx.beginPath();
  ctx.arc(center.x, center.y, headRadius, 0, Math.PI * 2);
  if (style.headFilled) ctx.fill();
  ctx.stroke();
  ctx.restore();
}

// Basketball side seams: arcs centered 1.6 radii out, 1.25 radii big, cut where they meet the ball.
const SEAM_CENTER = 1.6, SEAM_RADIUS = 1.25;
const SEAM_HALF_ANGLE = (() => {
  const x = (1 - SEAM_RADIUS ** 2 + SEAM_CENTER ** 2) / (2 * SEAM_CENTER);
  return 0.94 * Math.atan2(Math.sqrt(1 - x * x), SEAM_CENTER - x); // stop just inside the outline
})();

// Draws objects. Each is placed at its center, turned by its rotation, then squashed/stretched along
// the stage axes (so a bouncing ball always squashes up/down, whatever way it has turned).
export function drawObjects(ctx: Ctx, objects: readonly FrameObject[], map: StageToPixels) {
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (const object of objects) {
    const { look } = object;
    const r = (object.rotation * Math.PI) / 180, cos = Math.cos(r), sin = Math.sin(r), k = map.scale;
    ctx.setTransform(k * object.scaleX * cos, k * object.scaleY * sin, -k * object.scaleX * sin, k * object.scaleY * cos, map.offsetX + k * object.x, map.offsetY + k * object.y);
    const half = look.size / 2;
    const thickness = lookThickness(look);
    ctx.strokeStyle = look.color;
    ctx.fillStyle = look.color;
    ctx.lineWidth = thickness;
    ctx.beginPath();
    if (look.kind === "ball") {
      ctx.arc(0, 0, half, 0, Math.PI * 2);
    } else {
      ctx.moveTo(-half, -half); ctx.lineTo(half, -half); ctx.lineTo(half, half); ctx.lineTo(-half, half); ctx.closePath();
    }
    if (look.filled) ctx.fill();
    if (look.detail === "basketball" && look.kind === "ball") {
      // Dark outline and seams, readable even when the ball is small.
      ctx.strokeStyle = BASKETBALL_SEAM;
      ctx.stroke();
      ctx.lineWidth = Math.max(1, thickness * 0.75);
      const inner = half - thickness / 2;
      ctx.beginPath(); ctx.moveTo(0, -inner); ctx.lineTo(0, inner); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-inner, 0); ctx.lineTo(inner, 0); ctx.stroke();
      ctx.beginPath(); ctx.arc(-SEAM_CENTER * half, 0, SEAM_RADIUS * half, -SEAM_HALF_ANGLE, SEAM_HALF_ANGLE); ctx.stroke();
      ctx.beginPath(); ctx.arc(SEAM_CENTER * half, 0, SEAM_RADIUS * half, Math.PI - SEAM_HALF_ANGLE, Math.PI + SEAM_HALF_ANGLE); ctx.stroke();
    } else {
      ctx.stroke();
    }
  }
  ctx.restore();
}
