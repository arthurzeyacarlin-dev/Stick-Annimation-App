export type StickFigureSelectionTarget = "workspace" | "figure" | "joint" | "element";

export type StickFigurePoint = {
  x: number;
  y: number;
};

export type StickFigureFigureItem = {
  id: string;
  name: string;
  x: number;
  y: number;
  scale: number;
  rotation: number;
};

export type StickFigureStructureJoint = StickFigurePoint & {
  id: string;
};

export type StickFigureStructureLimb = {
  id: string;
  startJointId: string;
  endJointId: string;
};

export type StickFigureStructureGraph = {
  joints: StickFigureStructureJoint[];
  limbs: StickFigureStructureLimb[];
  activeJointId: string | null;
};

export type StickFigureFrameContent = {
  figures: StickFigureFigureItem[];
  structureGraph: StickFigureStructureGraph;
};

export const createEmptyStickFigureFrameContent = (): StickFigureFrameContent => ({
  figures: [],
  structureGraph: {joints: [], limbs: [], activeJointId: null},
});

export const cloneStickFigureFrameContent = (content: StickFigureFrameContent): StickFigureFrameContent => ({
  figures: content.figures.map((figure) => ({...figure})),
  structureGraph: {
    joints: content.structureGraph.joints.map((joint) => ({...joint})),
    limbs: content.structureGraph.limbs.map((limb) => ({...limb})),
    activeJointId: content.structureGraph.activeJointId,
  },
});

export const isStickFigureFrameContentEmpty = (content: StickFigureFrameContent) =>
  content.figures.length === 0 && content.structureGraph.joints.length === 0 && content.structureGraph.limbs.length === 0;

export type StickFigureStructureTool = "idle" | "addLimb";

export type StickFigureStructureSegmentDraft = {
  startPoint: StickFigurePoint;
  endPoint: StickFigurePoint;
  startJointId?: string | null;
  endJointId?: string | null;
};

export type StickFigureSelection =
  | { target: "workspace" }
  | { target: "figure"; figureId: string }
  | { target: "joint"; figureId: string; jointId: string }
  | { target: "element"; figureId: string; elementId: string };

export type StickFigureGestureTerminalState = "active" | "committed" | "cancelled";

export type StickFigureDragPreview = {
  pointerId: number;
  jointId: string;
  point: StickFigurePoint;
  terminalState: StickFigureGestureTerminalState;
};

export type StickFigureCanvasStage = {
  left: number;
  top: number;
  scale: number;
  width: number;
  height: number;
};
