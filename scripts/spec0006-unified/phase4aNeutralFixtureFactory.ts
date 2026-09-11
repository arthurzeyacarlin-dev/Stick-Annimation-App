import { createNativeUnifiedProjectV2 } from "../../src/lib/animation/unifiedWorkspaceFactoryV2.ts";

export const createPhase4aNeutralFixture = () => {
  const project = createNativeUnifiedProjectV2("2026-09-11T00:00:00.000Z");
  const owner = project.document.layers[0].cells[0];
  owner.cellType = "keyframe";
  owner.content!.items = [
    { itemId: crypto.randomUUID(), kind: "drawing-raster/v1", strokes: [{ id: "stroke", color: "#111111", width: 4, points: [{ x: 10, y: 20 }, { x: 30, y: 40 }] }], shapes: [] },
    { itemId: crypto.randomUUID(), kind: "drawing-text/v1", text: "mixed", x: 80, y: 90, color: "#111111", fontSize: 24, rotation: 0, width: 120, flipX: false, flipY: false, fontFamily: "Arial", bold: false, italic: false },
    { itemId: crypto.randomUUID(), kind: "stick-rig/v1", content: { figures: [], structureGraph: { joints: [{ id: "a", x: 100, y: 100 }, { id: "b", x: 100, y: 200 }], limbs: [{ id: "limb", startJointId: "a", endJointId: "b" }], activeJointId: null } } },
    { itemId: crypto.randomUUID(), kind: "symbol-instance/v1", definitionId: "symbol", definitionDigest: "0".repeat(64), x: 0, y: 0, width: 10, height: 10, rotation: 0, flipX: false, flipY: false },
  ];
  return project;
};
