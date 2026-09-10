import type { StickFigureFrameContent } from "../../components/workspace/stickfigure/types.ts";
import type { ResolvedUnifiedCell } from "./unifiedCellResolver.ts";

export type StickRenderCommand = { kind: "stick-rig/v1"; layerId: string; ownerId: string; content: StickFigureFrameContent };
export function stickRenderCommand(resolved: ResolvedUnifiedCell): StickRenderCommand {
  const content = resolved.owner.payload as StickFigureFrameContent;
  if (!content || !Array.isArray(content.figures) || !Array.isArray(content.structureGraph?.joints) || !Array.isArray(content.structureGraph?.limbs)) throw new Error("invalid_render_command");
  const ids = new Set(content.structureGraph.joints.map(j => j.id));
  if (ids.size !== content.structureGraph.joints.length || content.structureGraph.joints.some(j => !Number.isFinite(j.x) || !Number.isFinite(j.y)) || content.structureGraph.limbs.some(l => !ids.has(l.startJointId) || !ids.has(l.endJointId))) throw new Error("invalid_render_command");
  if (content.figures.some(f => ![f.x, f.y, f.scale, f.rotation].every(Number.isFinite) || f.scale <= 0)) throw new Error("invalid_render_command");
  return { kind: "stick-rig/v1", layerId: resolved.layer.layerId, ownerId: resolved.owner.cellId, content };
}
export function drawUnifiedStick(ctx: CanvasRenderingContext2D, command: StickRenderCommand) {
  // Canvas2D extraction of StickFigureCanvas's SVG semantics. No projection,
  // pose generation, tinting of inactive authored layers, or payload mutation.
  const { structureGraph: graph, figures } = command.content;
  const joints = new Map(graph.joints.map(j => [j.id, j]));
  const degree = new Map<string, number>();
  ctx.save();
  try {
    ctx.strokeStyle = "#10131b"; ctx.lineWidth = 8; ctx.lineCap = "round";
    for (const limb of graph.limbs) {
      const a = joints.get(limb.startJointId)!, b = joints.get(limb.endJointId)!;
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      degree.set(a.id, (degree.get(a.id) ?? 0) + 1); degree.set(b.id, (degree.get(b.id) ?? 0) + 1);
    }
    for (const joint of graph.joints) {
      ctx.fillStyle = "#ffffff"; ctx.strokeStyle = (degree.get(joint.id) ?? 0) <= 1 ? "#10131b" : "rgba(16,19,27,0.76)"; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(joint.x, joint.y, 6, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    }
    for (const figure of figures) {
      ctx.save();
      const width = Math.max(42, figure.scale * .55), height = Math.max(72, figure.scale), scale = Math.min(width / 64, height / 120);
      ctx.translate(960 + figure.x, 540 + figure.y); ctx.rotate(figure.rotation * Math.PI / 180); ctx.scale(scale, scale); ctx.translate(-32, -60);
      ctx.strokeStyle = "#10131b"; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(32, 18, 12, 0, Math.PI * 2); ctx.stroke();
      for (const [x1,y1,x2,y2] of [[32,30,32,70],[12,48,52,48],[32,70,12,106],[32,70,52,106]]) { ctx.beginPath(); ctx.moveTo(x1,y1); ctx.lineTo(x2,y2); ctx.stroke(); }
      ctx.restore();
    }
  } finally { ctx.restore(); }
}
