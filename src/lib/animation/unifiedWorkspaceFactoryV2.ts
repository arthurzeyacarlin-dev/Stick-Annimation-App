import type { UnifiedAnimationProjectV2 } from "./unifiedAnimationContractV2";
import { assertUnifiedAnimationProjectV2 } from "./unifiedAnimationContractV2.ts";

// SPEC-0020 Phase 3: Settings → "Frames per second" for new projects (12 by default; the contract allows 1–55).
export function createNativeUnifiedProjectV2(now = new Date().toISOString(), options: { fps?: number } = {}): UnifiedAnimationProjectV2 {
  const fps = Number.isInteger(options.fps) && options.fps! >= 1 && options.fps! <= 55 ? options.fps! : 12;
  const projectId = crypto.randomUUID();
  const layerId = crypto.randomUUID();
  const cellId = crypto.randomUUID();
  return assertUnifiedAnimationProjectV2({
    kind: "diamond-animation-project", schemaVersion: 2, projectId, title: "Untitled Project", createdAt: now, updatedAt: now, revision: 0,
    document: {
      kind: "diamond-animation-document", schemaVersion: 2, projectId,
      logicalStage: { width: 1920, height: 1080, origin: "top-left", xAxis: "right", yAxis: "down" }, fps,
      background: { kind: "solid-color/v1", color: "#ffffff" },
      layers: [{ layerId, name: "Layer 1", orderIndex: 0, visible: true, locked: false, cells: [{ cellId, cellType: "blank-keyframe", ownerCellId: cellId, content: { items: [], soundAttachment: null } }] }],
      catalogs: { symbols: [], assets: [] }, toolState: { drawingTool: "Select", stickTool: "idle" },
      reopenState: { activeLayerId: layerId, currentFrameIndex: 0, onionEnabled: false },
    },
  });
}
