import { drawDrawingTextObject } from "../../components/workspace/drawingText.ts";
import type { UnifiedDrawingCellPayloadV1, UnifiedAnimationSourceDisplayTransformV1 } from "./unifiedAnimationContract.ts";
import type { ResolvedUnifiedCell } from "./unifiedCellResolver.ts";

export type DrawingRenderCommand = {
  kind: "drawing/v1"; layerId: string; ownerId: string;
  transform: UnifiedAnimationSourceDisplayTransformV1 | null;
  raster: { assetId: string; x: number; y: number } | null;
  text: UnifiedDrawingCellPayloadV1["textObjects"];
};
export function drawingRenderCommand(resolved: ResolvedUnifiedCell): DrawingRenderCommand {
  const payload = resolved.owner.payload as UnifiedDrawingCellPayloadV1;
  if (!payload || !("bitmapAssetId" in payload) || !Array.isArray(payload.textObjects)) throw new Error("invalid_render_command");
  let raster = payload.bitmapAssetId ? { assetId: payload.bitmapAssetId, x: 0, y: 0 } : null;
  if (resolved.progress !== null) {
    const tween = payload.motionTween;
    if (!tween?.spriteAssetId || !tween.startOrigin || !tween.endOrigin || !payload.tweenEndAssetId) throw new Error("invalid_render_command");
    raster = { assetId: tween.spriteAssetId,
      x: Math.round(tween.startOrigin.x + (tween.endOrigin.x - tween.startOrigin.x) * resolved.progress),
      y: Math.round(tween.startOrigin.y + (tween.endOrigin.y - tween.startOrigin.y) * resolved.progress) };
  }
  if (raster && (!Number.isFinite(raster.x) || !Number.isFinite(raster.y))) throw new Error("invalid_render_command");
  const transform = resolved.layer.sourceDisplayTransform;
  if (transform && (![transform.scale, transform.offsetX, transform.offsetY].every(Number.isFinite) || transform.scale <= 0)) throw new Error("invalid_render_command");
  return { kind: "drawing/v1", layerId: resolved.layer.layerId, ownerId: resolved.owner.cellId, transform, raster, text: payload.textObjects };
}
export function drawUnifiedDrawing(ctx: CanvasRenderingContext2D, command: DrawingRenderCommand, raster: ImageBitmap | null) {
  ctx.save();
  try {
    const t = command.transform;
    if (t) { ctx.translate(t.offsetX, t.offsetY); ctx.scale(t.scale, t.scale); }
    ctx.imageSmoothingEnabled = false;
    if (raster && command.raster) ctx.drawImage(raster, command.raster.x, command.raster.y);
    // Same text implementation as the compatibility editor; paused, playback,
    // and snapshot all execute this list (including non-active layers).
    for (const text of command.text) drawDrawingTextObject(ctx, text);
  } finally { ctx.restore(); }
}
