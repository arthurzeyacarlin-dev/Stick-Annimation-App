export type Vec2 = { x: number; y: number };

export type Pose = {
  head: Vec2;
  neck: Vec2;
  hip: Vec2;

  leftElbow: Vec2;
  leftHand: Vec2;
  rightElbow: Vec2;
  rightHand: Vec2;

  leftKnee: Vec2;
  leftFoot: Vec2;
  rightKnee: Vec2;
  rightFoot: Vec2;
};

export function makeDefaultPose(cx: number, cy: number): Pose {
  return {
    head: { x: cx, y: cy - 88 },
    neck: { x: cx, y: cy - 58 },
    hip: { x: cx, y: cy + 8 },
    leftElbow: { x: cx - 30, y: cy - 26 },
    leftHand: { x: cx - 40, y: cy + 20 },
    rightElbow: { x: cx + 30, y: cy - 26 },
    rightHand: { x: cx + 40, y: cy + 20 },
    leftKnee: { x: cx - 18, y: cy + 52 },
    leftFoot: { x: cx - 30, y: cy + 96 },
    rightKnee: { x: cx + 18, y: cy + 52 },
    rightFoot: { x: cx + 30, y: cy + 96 },
  };
}

export function drawPose(
  ctx: CanvasRenderingContext2D,
  pose: Pose,
  options?: { lineWidth?: number; color?: string; headRadius?: number }
) {
  const lineWidth = options?.lineWidth ?? 4;
  const color = options?.color ?? "white";
  const headRadius = options?.headRadius ?? 18;

  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.lineCap = "round";

  // head
  ctx.beginPath();
  ctx.arc(pose.head.x, pose.head.y, headRadius, 0, Math.PI * 2);
  ctx.stroke();

  function line(a: Vec2, b: Vec2) {
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }  // neck-to-head connector (attaches head to body)
  line(pose.neck, { x: pose.head.x, y: pose.head.y + headRadius });

  // body
  line(pose.neck, pose.hip);

  // arms
  line(pose.neck, pose.leftElbow);
  line(pose.leftElbow, pose.leftHand);
  line(pose.neck, pose.rightElbow);
  line(pose.rightElbow, pose.rightHand);

  // legs
  line(pose.hip, pose.leftKnee);
  line(pose.leftKnee, pose.leftFoot);
  line(pose.hip, pose.rightKnee);
  line(pose.rightKnee, pose.rightFoot);
} export function drawJoints(ctx: CanvasRenderingContext2D, pose: Pose) {
  const keys = Object.keys(pose) as (keyof Pose)[];
  ctx.fillStyle = "white";
  for (const k of keys) {
    const p = pose[k];
    ctx.beginPath();
    ctx.arc(p.x, p.y, 6, 0, Math.PI * 2);
    ctx.fill();
  }
}export function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}export function lerpPose(a: Pose, b: Pose, t: number): Pose {
  const out = {} as Pose;
  const keys = Object.keys(a) as (keyof Pose)[];
  for (const k of keys) {
    out[k] = {
      x: lerp(a[k].x, b[k].x, t),
      y: lerp(a[k].y, b[k].y, t),
    };
  }
  return out;
}
