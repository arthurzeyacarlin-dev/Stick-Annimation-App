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
