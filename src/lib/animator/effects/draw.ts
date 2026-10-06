// Drawing effect shapes on a 2D canvas (the same stage-to-pixels map the figures use).
import type { StageToPixels } from "../render.ts";
import { placedSymbol } from "../symbolMaker.ts";
import { TEXT_OUTLINE, textFont, textPlacement } from "./text.ts";
import type { Shape } from "./types.ts";

type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

export function drawShapes(ctx: Ctx, shapes: readonly Shape[], map: StageToPixels) {
  if (!shapes.length) return;
  ctx.save();
  ctx.setTransform(map.scale, 0, 0, map.scale, map.offsetX, map.offsetY);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  drawList(ctx, shapes, 1);
  ctx.restore();
}

// The shapes, in the transform already set; `alpha` multiplies each shape's own (a placed symbol's fade).
function drawList(ctx: Ctx, shapes: readonly Shape[], alpha: number) {
  for (const s of shapes) {
    if (s.kind === "symbol") {
      // A placed symbol (STILL THINGS ARE SYMBOLS): its own shapes, moved, turned and sized.
      const made = placedSymbol(s), k = s.scale ?? 1;
      if (!(k > 0)) continue;
      ctx.save();
      ctx.translate(s.x, s.y);
      if (s.rotation) ctx.rotate((s.rotation * Math.PI) / 180);
      ctx.scale(s.flipX ? -k : k, k);
      ctx.translate(-made.width / 2, -made.height / 2);
      drawList(ctx, made.shapes, alpha * Math.max(0, Math.min(1, s.alpha ?? 1)));
      ctx.restore();
      continue;
    }
    ctx.globalAlpha = alpha * Math.max(0, Math.min(1, s.alpha ?? 1));
    const glow = "glow" in s ? s.glow ?? 0 : 0;
    ctx.shadowBlur = glow;
    ctx.shadowColor = glow ? ("fill" in s && s.fill ? s.fill : "stroke" in s && s.stroke ? s.stroke : "#fff") : "transparent";
    if (s.kind === "text") {
      // WORDS (text.ts): the thick dark outline first (with the glow), then the letters over it, top color fading
      // to the bottom one — turned and squashed/stretched about the words' center.
      if (!s.text || !(s.size > 0) || s.points.length < 8) continue;
      const at = textPlacement(s);
      if (!(at.scaleX > 0) || !(at.scaleY > 0)) continue;
      ctx.save();
      ctx.translate(at.x, at.y);
      if (at.rotation) ctx.rotate((at.rotation * Math.PI) / 180);
      ctx.scale(at.scaleX, at.scaleY);
      ctx.font = textFont(s.size);
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      if (s.stroke) { ctx.strokeStyle = s.stroke; ctx.lineWidth = s.width ?? TEXT_OUTLINE * s.size; ctx.strokeText(s.text, 0, 0); }
      ctx.shadowBlur = 0;
      if (s.fill2 && s.fill) {
        const g = ctx.createLinearGradient(0, -s.size / 2, 0, s.size / 2);
        g.addColorStop(0, s.fill);
        g.addColorStop(1, s.fill2);
        ctx.fillStyle = g;
      } else ctx.fillStyle = s.fill ?? "#fff";
      ctx.fillText(s.text, 0, 0);
      ctx.restore();
      continue;
    }
    if (s.kind === "circle") {
      ctx.beginPath();
      ctx.arc(s.x, s.y, Math.max(0, s.r), 0, Math.PI * 2);
      if (s.fill) { ctx.fillStyle = s.fill; ctx.fill(); }
      if (s.stroke) { ctx.strokeStyle = s.stroke; ctx.lineWidth = s.width ?? 2; ctx.stroke(); }
    } else if (s.kind === "rect") {
      if (s.fill2 && s.fill) {
        const g = ctx.createLinearGradient(0, s.y, 0, s.y + s.h);
        g.addColorStop(0, s.fill);
        g.addColorStop(1, s.fill2);
        ctx.fillStyle = g;
      } else if (s.fill) ctx.fillStyle = s.fill;
      if (s.fill) ctx.fillRect(s.x, s.y, s.w, s.h);
      if (s.stroke) { ctx.strokeStyle = s.stroke; ctx.lineWidth = s.width ?? 2; ctx.strokeRect(s.x, s.y, s.w, s.h); }
    } else {
      if (s.points.length < 4) continue;
      ctx.beginPath();
      ctx.moveTo(s.points[0], s.points[1]);
      for (let i = 2; i + 1 < s.points.length; i += 2) ctx.lineTo(s.points[i], s.points[i + 1]);
      if (s.kind === "poly") {
        ctx.closePath();
        if (s.fill) { ctx.fillStyle = s.fill; ctx.fill(); }
        if (s.stroke) { ctx.strokeStyle = s.stroke; ctx.lineWidth = s.width ?? 2; ctx.stroke(); }
      } else {
        ctx.strokeStyle = s.stroke;
        ctx.lineWidth = s.width;
        ctx.stroke();
      }
    }
  }
}
