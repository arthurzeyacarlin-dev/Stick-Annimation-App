import { useRef, useState } from "react";
import type { CSSProperties, PointerEvent as ReactPointerEvent, ReactNode } from "react";

type StickFigureCreatorWorkspaceProps = {
  onExit: () => void;
};

type CreatorCanvasSize = "Small" | "Standard" | "Large";
type CreatorJoint = {
  id: string;
  x: number;
  y: number;
};
type CreatorLimb = {
  id: string;
  startJointId: string;
  endJointId: string;
  colorOverride?: string;
  thicknessOverride?: number;
};
type CreatorShapeType = "circle" | "rectangle" | "triangle";
type CreatorShape = {
  id: string;
  jointId: string;
  type: CreatorShapeType;
  fillColor: string;
};
type CreatorJointDrag = {
  pointerId: number;
  jointId: string;
  offsetX: number;
  offsetY: number;
};
type CreatorDrawGesture = {
  pointerId: number;
  startJointId: string;
  startPoint: { x: number; y: number };
  previewPoint: { x: number; y: number };
  createdStartJointId: string | null;
};
type CreatorRigBounds = {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
};
type CreatorLimbHit = {
  limb: CreatorLimb;
  projectedPoint: { x: number; y: number };
  distance: number;
  ratio: number;
  startJoint: CreatorJoint;
  endJoint: CreatorJoint;
};

const DEFAULT_FIGURE_NAME = "Untitled Stick Figure";
const DEFAULT_STROKE_COLOR = "#10131b";
const DEFAULT_JOINT_FILL_COLOR = "#ffffff";
const DEFAULT_SHAPE_FILL_COLOR = "#f5c84c";
const CREATOR_JOINT_HANDLE_RADIUS = 5;
const CREATOR_JOINT_HIT_RADIUS = 22;
const CREATOR_LIMB_HIT_RADIUS = 16;
const CREATOR_MIN_DRAW_DISTANCE = 12;
const CREATOR_INSERT_ENDPOINT_GUARD = 24;
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const creatorCanvasSizes: Record<CreatorCanvasSize, { width: number; height: number }> = {
  Small: { width: 560, height: 360 },
  Standard: { width: 760, height: 520 },
  Large: { width: 920, height: 620 },
};

const creatorToolNames = ["Draw", "Select", "Insert", "Pose", "Mirror", "Center"] as const;
type CreatorToolName = (typeof creatorToolNames)[number];

const shellButtonStyle: CSSProperties = {
  minHeight: 32,
  padding: "7px 12px",
  borderRadius: 8,
  border: "1px solid rgba(255,255,255,0.12)",
  background: "rgba(255,255,255,0.045)",
  color: "rgba(255,255,255,0.86)",
  fontSize: 12,
  fontWeight: 700,
  appearance: "none",
  outline: "none",
};

const panelCardStyle: CSSProperties = {
  borderRadius: 14,
  border: "1px solid rgba(255,255,255,0.08)",
  background: "linear-gradient(180deg, rgba(255,255,255,0.04), rgba(255,255,255,0.022))",
  padding: 14,
  display: "flex",
  flexDirection: "column",
  gap: 12,
};

const propertyRowStyle: CSSProperties = {
  minHeight: 36,
  borderRadius: 10,
  border: "1px solid rgba(255,255,255,0.09)",
  background: "rgba(255,255,255,0.035)",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: "8px 10px",
  color: "rgba(255,255,255,0.74)",
  fontSize: 12,
};

const sectionTitleStyle: CSSProperties = {
  color: "rgba(255,255,255,0.46)",
  fontSize: 11,
  fontWeight: 800,
  letterSpacing: "0.12em",
  textTransform: "uppercase",
  userSelect: "none",
};

const sectionDescriptionStyle: CSSProperties = {
  color: "rgba(255,255,255,0.58)",
  fontSize: 12,
  lineHeight: 1.45,
};

const controlButtonStyle = (isSelected = false): CSSProperties => ({
  minHeight: 34,
  borderRadius: 9,
  border: isSelected ? "1px solid rgba(110,170,255,0.42)" : "1px solid rgba(255,255,255,0.12)",
  background: isSelected ? "rgba(110,170,255,0.13)" : "rgba(255,255,255,0.04)",
  color: isSelected ? "rgba(225,238,255,0.95)" : "rgba(255,255,255,0.82)",
  fontSize: 11,
  fontWeight: 800,
  cursor: "pointer",
  appearance: "none",
  outline: "none",
  userSelect: "none",
});

const fieldLabelStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 8,
  color: "rgba(255,255,255,0.72)",
  fontSize: 12,
  fontWeight: 700,
};

const textInputStyle: CSSProperties = {
  minHeight: 36,
  borderRadius: 10,
  border: "1px solid rgba(255,255,255,0.12)",
  background: "rgba(255,255,255,0.045)",
  color: "rgba(255,255,255,0.9)",
  padding: "8px 10px",
  fontSize: 12,
  outline: "none",
};

const colorInputStyle: CSSProperties = {
  width: 44,
  height: 30,
  borderRadius: 8,
  border: "1px solid rgba(255,255,255,0.16)",
  background: "rgba(255,255,255,0.06)",
  padding: 3,
  cursor: "pointer",
};

const rangeInputStyle: CSSProperties = {
  width: "100%",
  accentColor: "rgb(110,170,255)",
};

function PropertyRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={propertyRowStyle}>
      <span>{label}</span>
      <span style={{ color: "rgba(180,220,255,0.56)", fontWeight: 700 }}>{value}</span>
    </div>
  );
}

function PlaceholderSection({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section style={panelCardStyle}>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <div style={sectionTitleStyle}>{title}</div>
        {description ? <div style={sectionDescriptionStyle}>{description}</div> : null}
      </div>
      {children}
    </section>
  );
}

function RangeControl({
  label,
  value,
  min,
  max,
  step,
  displayValue,
  onChange,
  disabled = false,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  displayValue: string;
  onChange: (value: number) => void;
  disabled?: boolean;
}) {
  return (
    <label style={{ ...fieldLabelStyle, opacity: disabled ? 0.5 : 1 }}>
      <span style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <span>{label}</span>
        <span style={{ color: "rgba(180,220,255,0.66)", fontWeight: 800 }}>{displayValue}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(Number(event.currentTarget.value))}
        style={{ ...rangeInputStyle, cursor: disabled ? "default" : "pointer" }}
      />
    </label>
  );
}

function ColorControl({
  label,
  value,
  onChange,
  disabled = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  return (
    <label
      style={{
        ...propertyRowStyle,
        cursor: disabled ? "default" : "pointer",
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <span>{label}</span>
      <input
        type="color"
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.currentTarget.value)}
        style={{
          ...colorInputStyle,
          cursor: disabled ? "default" : "pointer",
        }}
      />
    </label>
  );
}

function DisabledFutureRow({ label }: { label: string }) {
  return (
    <div
      aria-disabled="true"
      style={{
        ...propertyRowStyle,
        opacity: 0.52,
      }}
    >
      <span>{label}</span>
      <span style={{ color: "rgba(255,255,255,0.38)", fontWeight: 800 }}>Future</span>
    </div>
  );
}

export function StickFigureCreatorWorkspace({ onExit }: StickFigureCreatorWorkspaceProps) {
  const creatorStageSvgRef = useRef<SVGSVGElement | null>(null);
  const nextCreatorJointIdRef = useRef(1);
  const nextCreatorLimbIdRef = useRef(1);
  const nextCreatorShapeIdRef = useRef(1);
  const [figureName, setFigureName] = useState(DEFAULT_FIGURE_NAME);
  const [canvasSize, setCanvasSize] = useState<CreatorCanvasSize>("Standard");
  const [canvasScale, setCanvasScale] = useState(1);
  const [activeCreatorTool, setActiveCreatorTool] = useState<CreatorToolName>("Draw");
  const [globalStrokeColor, setGlobalStrokeColor] = useState(DEFAULT_STROKE_COLOR);
  const [globalOpacity, setGlobalOpacity] = useState(1);
  const [defaultLimbThickness, setDefaultLimbThickness] = useState(8);
  const [creatorJoints, setCreatorJoints] = useState<CreatorJoint[]>([]);
  const [creatorLimbs, setCreatorLimbs] = useState<CreatorLimb[]>([]);
  const [creatorShapes, setCreatorShapes] = useState<CreatorShape[]>([]);
  const [selectedCreatorJointId, setSelectedCreatorJointId] = useState<string | null>(null);
  const [selectedCreatorLimbId, setSelectedCreatorLimbId] = useState<string | null>(null);
  const [jointDrag, setJointDrag] = useState<CreatorJointDrag | null>(null);
  const [drawGesture, setDrawGesture] = useState<CreatorDrawGesture | null>(null);
  const displayedFigureName = figureName.trim() || DEFAULT_FIGURE_NAME;
  const selectedCanvasSize = creatorCanvasSizes[canvasSize];
  const standardCreatorCanvasSize = creatorCanvasSizes.Standard;
  const creatorPaperOffset = {
    x: (selectedCanvasSize.width - standardCreatorCanvasSize.width) / 2,
    y: (selectedCanvasSize.height - standardCreatorCanvasSize.height) / 2,
  };
  const creatorVisibleBounds = {
    minX: -creatorPaperOffset.x,
    maxX: selectedCanvasSize.width - creatorPaperOffset.x,
    minY: -creatorPaperOffset.y,
    maxY: selectedCanvasSize.height - creatorPaperOffset.y,
  };
  const canInsertJoint = creatorLimbs.length > 0;
  const canPoseRig = creatorJoints.length > 0;
  const canCenterRig = creatorJoints.length > 0;
  const canMirrorRig = creatorJoints.length >= 2;
  const creatorJointsById = new Map(creatorJoints.map((joint) => [joint.id, joint]));
  const selectedCreatorJoint = selectedCreatorJointId
    ? creatorJoints.find((joint) => joint.id === selectedCreatorJointId)
    : null;
  const selectedCreatorLimb = selectedCreatorLimbId
    ? creatorLimbs.find((limb) => limb.id === selectedCreatorLimbId)
    : null;
  const selectedCreatorShape = selectedCreatorJoint
    ? creatorShapes.find((shape) => shape.jointId === selectedCreatorJoint.id)
    : null;
  const canRemoveSelectedLimb = Boolean(selectedCreatorLimb);
  const resetCreatorCanvas = () => {
    setCanvasSize("Standard");
    setCanvasScale(1);
  };
  const clearTransientCreatorActionState = () => {
    setJointDrag(null);
    setDrawGesture(null);
  };
  const clearCreatorSelection = () => {
    setSelectedCreatorJointId(null);
    setSelectedCreatorLimbId(null);
  };
  const activateDrawTool = () => {
    setActiveCreatorTool("Draw");
    clearTransientCreatorActionState();
    clearCreatorSelection();
  };
  const activateSelectTool = () => {
    setActiveCreatorTool("Select");
    clearTransientCreatorActionState();
  };
  const activateInsertTool = () => {
    if (!canInsertJoint) {
      return;
    }

    setActiveCreatorTool("Insert");
    clearTransientCreatorActionState();
    clearCreatorSelection();
  };
  const activatePoseTool = () => {
    if (creatorJoints.length === 0) {
      return;
    }

    setActiveCreatorTool("Pose");
    clearTransientCreatorActionState();
    clearCreatorSelection();
  };
  const getCreatorRigBounds = (): CreatorRigBounds | null => {
    if (creatorJoints.length === 0) {
      return null;
    }

    return creatorJoints.reduce<CreatorRigBounds>(
      (bounds, joint) => ({
        minX: Math.min(bounds.minX, joint.x),
        maxX: Math.max(bounds.maxX, joint.x),
        minY: Math.min(bounds.minY, joint.y),
        maxY: Math.max(bounds.maxY, joint.y),
      }),
      {
        minX: creatorJoints[0].x,
        maxX: creatorJoints[0].x,
        minY: creatorJoints[0].y,
        maxY: creatorJoints[0].y,
      },
    );
  };
  const getCreatorRigCenter = (bounds = getCreatorRigBounds()) => {
    if (!bounds) {
      return null;
    }

    return {
      x: (bounds.minX + bounds.maxX) / 2,
      y: (bounds.minY + bounds.maxY) / 2,
    };
  };
  const centerCreatorRig = () => {
    const rigCenter = getCreatorRigCenter();
    if (!rigCenter) {
      return;
    }

    clearTransientCreatorActionState();
    clearCreatorSelection();
    const stageCenter = {
      x: selectedCanvasSize.width / 2 - creatorPaperOffset.x,
      y: selectedCanvasSize.height / 2 - creatorPaperOffset.y,
    };
    const delta = {
      x: stageCenter.x - rigCenter.x,
      y: stageCenter.y - rigCenter.y,
    };

    setCreatorJoints((currentJoints) =>
      currentJoints.map((joint) => ({
        ...joint,
        x: joint.x + delta.x,
        y: joint.y + delta.y,
      })),
    );
  };
  const mirrorCreatorRig = () => {
    const rigCenter = getCreatorRigCenter();
    if (!rigCenter || creatorJoints.length < 2) {
      return;
    }

    clearTransientCreatorActionState();
    clearCreatorSelection();
    setCreatorJoints((currentJoints) =>
      currentJoints.map((joint) => ({
        ...joint,
        x: rigCenter.x + (rigCenter.x - joint.x),
      })),
    );
  };
  const resolveCreatorStagePoint = (event: ReactPointerEvent<SVGSVGElement>) => {
    const svg = creatorStageSvgRef.current;
    const bounds = svg?.getBoundingClientRect();

    if (!svg || !bounds || bounds.width === 0 || bounds.height === 0) {
      return null;
    }

    const rawPaperPoint = {
      x: ((event.clientX - bounds.left) / bounds.width) * selectedCanvasSize.width,
      y: ((event.clientY - bounds.top) / bounds.height) * selectedCanvasSize.height,
    };

    return {
      x: rawPaperPoint.x - creatorPaperOffset.x,
      y: rawPaperPoint.y - creatorPaperOffset.y,
    };
  };
  const createCreatorJoint = (point: Pick<CreatorJoint, "x" | "y">) => {
    const nextJointId = nextCreatorJointIdRef.current;
    nextCreatorJointIdRef.current += 1;
    const nextJoint: CreatorJoint = {
      id: `creator-joint-${nextJointId}`,
      x: clamp(point.x, creatorVisibleBounds.minX, creatorVisibleBounds.maxX),
      y: clamp(point.y, creatorVisibleBounds.minY, creatorVisibleBounds.maxY),
    };

    setCreatorJoints((currentJoints) => [...currentJoints, nextJoint]);
    return nextJoint;
  };
  const removeCreatorJointIfUnused = (jointId: string) => {
    setCreatorJoints((currentJoints) => currentJoints.filter((joint) => joint.id !== jointId));
    setCreatorShapes((currentShapes) => currentShapes.filter((shape) => shape.jointId !== jointId));
    setSelectedCreatorJointId((currentSelectedJointId) =>
      currentSelectedJointId === jointId ? null : currentSelectedJointId,
    );
  };
  const findNearestCreatorJoint = (point: Pick<CreatorJoint, "x" | "y">): CreatorJoint | null => {
    let nearestJoint: CreatorJoint | null = null;
    let nearestDistance = CREATOR_JOINT_HIT_RADIUS;

    creatorJoints.forEach((joint) => {
      const distance = Math.hypot(joint.x - point.x, joint.y - point.y);

      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestJoint = joint;
      }
    });

    return nearestJoint;
  };
  const getProjectedPointOnSegment = (
    point: Pick<CreatorJoint, "x" | "y">,
    startJoint: CreatorJoint,
    endJoint: CreatorJoint,
  ) => {
    const segmentX = endJoint.x - startJoint.x;
    const segmentY = endJoint.y - startJoint.y;
    const segmentLengthSquared = segmentX * segmentX + segmentY * segmentY;

    if (segmentLengthSquared === 0) {
      return {
        point: { x: startJoint.x, y: startJoint.y },
        ratio: 0,
        distance: Math.hypot(point.x - startJoint.x, point.y - startJoint.y),
      };
    }

    const ratio = clamp(
      ((point.x - startJoint.x) * segmentX + (point.y - startJoint.y) * segmentY) / segmentLengthSquared,
      0,
      1,
    );
    const projectedPoint = {
      x: startJoint.x + ratio * segmentX,
      y: startJoint.y + ratio * segmentY,
    };

    return {
      point: projectedPoint,
      ratio,
      distance: Math.hypot(point.x - projectedPoint.x, point.y - projectedPoint.y),
    };
  };
  const findNearestCreatorLimbHit = (point: Pick<CreatorJoint, "x" | "y">): CreatorLimbHit | null => {
    let nearestHit: CreatorLimbHit | null = null;
    let nearestDistance = CREATOR_LIMB_HIT_RADIUS;

    creatorLimbs.forEach((limb) => {
      const startJoint = creatorJointsById.get(limb.startJointId);
      const endJoint = creatorJointsById.get(limb.endJointId);

      if (!startJoint || !endJoint) {
        return;
      }

      const projection = getProjectedPointOnSegment(point, startJoint, endJoint);

      if (projection.distance < nearestDistance) {
        nearestDistance = projection.distance;
        nearestHit = {
          limb,
          projectedPoint: projection.point,
          distance: projection.distance,
          ratio: projection.ratio,
          startJoint,
          endJoint,
        };
      }
    });

    return nearestHit;
  };
  const hasCreatorLimbBetween = (startJointId: string, endJointId: string) => {
    return creatorLimbs.some(
      (limb) =>
        (limb.startJointId === startJointId && limb.endJointId === endJointId) ||
        (limb.startJointId === endJointId && limb.endJointId === startJointId),
    );
  };
  const createCreatorLimb = (
    startJointId: string,
    endJointId: string,
    styleSource?: Pick<CreatorLimb, "colorOverride" | "thicknessOverride">,
  ) => {
    if (startJointId === endJointId || hasCreatorLimbBetween(startJointId, endJointId)) {
      return null;
    }

    const nextLimbId = nextCreatorLimbIdRef.current;
    nextCreatorLimbIdRef.current += 1;
    const nextLimb: CreatorLimb = {
      id: `creator-limb-${nextLimbId}`,
      startJointId,
      endJointId,
      ...(styleSource?.colorOverride ? { colorOverride: styleSource.colorOverride } : {}),
      ...(styleSource?.thicknessOverride ? { thicknessOverride: styleSource.thicknessOverride } : {}),
    };

    setCreatorLimbs((currentLimbs) => [...currentLimbs, nextLimb]);
    return nextLimb;
  };
  const splitCreatorLimbAtPoint = (limbHit: CreatorLimbHit) => {
    const startDistance = Math.hypot(
      limbHit.projectedPoint.x - limbHit.startJoint.x,
      limbHit.projectedPoint.y - limbHit.startJoint.y,
    );
    const endDistance = Math.hypot(
      limbHit.projectedPoint.x - limbHit.endJoint.x,
      limbHit.projectedPoint.y - limbHit.endJoint.y,
    );

    if (startDistance < CREATOR_INSERT_ENDPOINT_GUARD || endDistance < CREATOR_INSERT_ENDPOINT_GUARD) {
      clearCreatorSelection();
      return;
    }

    const insertedJoint = createCreatorJoint(limbHit.projectedPoint);
    const firstLimbId = nextCreatorLimbIdRef.current;
    nextCreatorLimbIdRef.current += 1;
    const secondLimbId = nextCreatorLimbIdRef.current;
    nextCreatorLimbIdRef.current += 1;
    const inheritedStyle = {
      ...(limbHit.limb.colorOverride ? { colorOverride: limbHit.limb.colorOverride } : {}),
      ...(limbHit.limb.thicknessOverride ? { thicknessOverride: limbHit.limb.thicknessOverride } : {}),
    };
    const firstReplacement: CreatorLimb = {
      id: `creator-limb-${firstLimbId}`,
      startJointId: limbHit.limb.startJointId,
      endJointId: insertedJoint.id,
      ...inheritedStyle,
    };
    const secondReplacement: CreatorLimb = {
      id: `creator-limb-${secondLimbId}`,
      startJointId: insertedJoint.id,
      endJointId: limbHit.limb.endJointId,
      ...inheritedStyle,
    };

    setCreatorLimbs((currentLimbs) => [
      ...currentLimbs.filter((limb) => limb.id !== limbHit.limb.id),
      firstReplacement,
      secondReplacement,
    ]);
    clearCreatorSelection();
  };
  const handleCreatorStagePointerDown = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (event.button !== 0 || !event.isPrimary) {
      return;
    }

    const stagePoint = resolveCreatorStagePoint(event);
    if (!stagePoint) {
      return;
    }

    if (activeCreatorTool === "Draw") {
      const targetJoint = findNearestCreatorJoint(stagePoint);
      const startJoint = targetJoint ?? createCreatorJoint(stagePoint);

      clearCreatorSelection();
      setDrawGesture({
        pointerId: event.pointerId,
        startJointId: startJoint.id,
        startPoint: { x: startJoint.x, y: startJoint.y },
        previewPoint: stagePoint,
        createdStartJointId: targetJoint ? null : startJoint.id,
      });
      setJointDrag(null);
      event.currentTarget.setPointerCapture(event.pointerId);
      event.preventDefault();
      return;
    }

    if (activeCreatorTool === "Insert") {
      if (findNearestCreatorJoint(stagePoint)) {
        clearCreatorSelection();
        event.preventDefault();
        return;
      }

      const limbHit = findNearestCreatorLimbHit(stagePoint);
      if (limbHit) {
        splitCreatorLimbAtPoint(limbHit);
      } else {
        clearCreatorSelection();
      }
      event.preventDefault();
      return;
    }

    if (activeCreatorTool === "Select" || activeCreatorTool === "Pose") {
      const targetJoint = findNearestCreatorJoint(stagePoint);

      if (!targetJoint) {
        if (activeCreatorTool === "Select") {
          const targetLimb = findNearestCreatorLimbHit(stagePoint)?.limb ?? null;

          if (targetLimb) {
            setSelectedCreatorJointId(null);
            setSelectedCreatorLimbId(targetLimb.id);
            setJointDrag(null);
            event.preventDefault();
            return;
          }
        }

        clearCreatorSelection();
        setJointDrag(null);
        event.preventDefault();
        return;
      }

      setSelectedCreatorJointId(targetJoint.id);
      setSelectedCreatorLimbId(null);
      setJointDrag({
        pointerId: event.pointerId,
        jointId: targetJoint.id,
        offsetX: targetJoint.x - stagePoint.x,
        offsetY: targetJoint.y - stagePoint.y,
      });
      event.currentTarget.setPointerCapture(event.pointerId);
      event.preventDefault();
    }
  };
  const removeSelectedCreatorLimb = () => {
    if (!selectedCreatorLimbId) {
      return;
    }

    setCreatorLimbs((currentLimbs) => currentLimbs.filter((limb) => limb.id !== selectedCreatorLimbId));
    clearCreatorSelection();
  };
  const handleCreatorStagePointerMove = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (drawGesture && event.pointerId === drawGesture.pointerId && event.isPrimary) {
      const stagePoint = resolveCreatorStagePoint(event);
      if (!stagePoint) {
        return;
      }

      setDrawGesture((currentGesture) =>
        currentGesture && currentGesture.pointerId === event.pointerId
          ? {
              ...currentGesture,
              previewPoint: stagePoint,
            }
          : currentGesture,
      );
      event.preventDefault();
      return;
    }

    if (jointDrag && activeCreatorTool !== "Select" && activeCreatorTool !== "Pose") {
      setJointDrag(null);
      return;
    }

    if (!jointDrag || event.pointerId !== jointDrag.pointerId || !event.isPrimary) {
      return;
    }

    const stagePoint = resolveCreatorStagePoint(event);
    if (!stagePoint) {
      return;
    }

    const nextPoint = {
      x: clamp(stagePoint.x + jointDrag.offsetX, creatorVisibleBounds.minX, creatorVisibleBounds.maxX),
      y: clamp(stagePoint.y + jointDrag.offsetY, creatorVisibleBounds.minY, creatorVisibleBounds.maxY),
    };

    setCreatorJoints((currentJoints) =>
      currentJoints.map((joint) => (joint.id === jointDrag.jointId ? { ...joint, ...nextPoint } : joint)),
    );
    event.preventDefault();
  };
  const completeCreatorStageGesture = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (drawGesture && event.pointerId === drawGesture.pointerId) {
      const stagePoint = resolveCreatorStagePoint(event);
      const endPoint = stagePoint ?? drawGesture.previewPoint;
      const dragDistance = Math.hypot(endPoint.x - drawGesture.startPoint.x, endPoint.y - drawGesture.startPoint.y);

      if (dragDistance < CREATOR_MIN_DRAW_DISTANCE) {
        if (drawGesture.createdStartJointId) {
          removeCreatorJointIfUnused(drawGesture.createdStartJointId);
        }
        clearCreatorSelection();
      } else {
        const targetEndJoint = findNearestCreatorJoint(endPoint);
        const endJoint = targetEndJoint ?? createCreatorJoint(endPoint);
        const createdLimb = createCreatorLimb(drawGesture.startJointId, endJoint.id);

        if (createdLimb) {
          setSelectedCreatorJointId(null);
          setSelectedCreatorLimbId(createdLimb.id);
        } else if (!targetEndJoint) {
          removeCreatorJointIfUnused(endJoint.id);
        }

        if (!createdLimb && drawGesture.createdStartJointId) {
          removeCreatorJointIfUnused(drawGesture.createdStartJointId);
        }

        if (!createdLimb) {
          clearCreatorSelection();
        }
      }

      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
      setDrawGesture(null);
      event.preventDefault();
      return;
    }

    if (!jointDrag || event.pointerId !== jointDrag.pointerId) {
      return;
    }

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    setJointDrag(null);
  };
  const updateSelectedLimb = (updates: Pick<CreatorLimb, "colorOverride" | "thicknessOverride">) => {
    if (!selectedCreatorLimbId) {
      return;
    }

    setCreatorLimbs((currentLimbs) =>
      currentLimbs.map((limb) => (limb.id === selectedCreatorLimbId ? { ...limb, ...updates } : limb)),
    );
  };
  const resetSelectedLimbStyle = () => {
    if (!selectedCreatorLimbId) {
      return;
    }

    setCreatorLimbs((currentLimbs) =>
      currentLimbs.map((limb) => {
        if (limb.id !== selectedCreatorLimbId) {
          return limb;
        }

        return {
          id: limb.id,
          startJointId: limb.startJointId,
          endJointId: limb.endJointId,
        };
      }),
    );
  };
  const attachShapeToSelectedJoint = (shapeType: CreatorShapeType) => {
    if (!selectedCreatorJointId) {
      return;
    }

    setCreatorShapes((currentShapes) => {
      const existingShape = currentShapes.find((shape) => shape.jointId === selectedCreatorJointId);

      if (existingShape) {
        return currentShapes.map((shape) => (shape.id === existingShape.id ? { ...shape, type: shapeType } : shape));
      }

      const nextShapeId = nextCreatorShapeIdRef.current;
      nextCreatorShapeIdRef.current += 1;
      return [
        ...currentShapes,
        {
          id: `creator-shape-${nextShapeId}`,
          jointId: selectedCreatorJointId,
          type: shapeType,
          fillColor: DEFAULT_SHAPE_FILL_COLOR,
        },
      ];
    });
  };
  const updateSelectedShapeFill = (fillColor: string) => {
    if (!selectedCreatorShape) {
      return;
    }

    setCreatorShapes((currentShapes) =>
      currentShapes.map((shape) => (shape.id === selectedCreatorShape.id ? { ...shape, fillColor } : shape)),
    );
  };
  const removeShapeFromSelectedJoint = () => {
    if (!selectedCreatorJointId) {
      return;
    }

    setCreatorShapes((currentShapes) => currentShapes.filter((shape) => shape.jointId !== selectedCreatorJointId));
  };
  const getLimbStroke = (limb: CreatorLimb) => limb.colorOverride ?? globalStrokeColor;
  const getLimbStrokeWidth = (limb: CreatorLimb) => limb.thicknessOverride ?? defaultLimbThickness;

  return (
    <div
      style={{
        height: "100vh",
        background: "rgb(26, 27, 36)",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        color: "white",
      }}
    >
      <header
        style={{
          height: 52,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 14,
          padding: "0 14px",
          background: "rgb(20, 24, 32)",
          borderBottom: "1px solid rgba(255,255,255,0.08)",
          flexShrink: 0,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button
            type="button"
            onClick={onExit}
            style={{
              ...shellButtonStyle,
              cursor: "pointer",
              background: "rgba(110,170,255,0.08)",
              border: "1px solid rgba(110,170,255,0.20)",
            }}
          >
            Back
          </button>
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <div
              style={{
                fontSize: 10,
                fontWeight: 800,
                letterSpacing: "0.15em",
                textTransform: "uppercase",
                color: "rgba(180,220,255,0.62)",
              }}
            >
              Stick Figure Creator
            </div>
            <div style={{ color: "rgba(255,255,255,0.92)", fontSize: 15, fontWeight: 800 }}>
              {displayedFigureName}
            </div>
          </div>
        </div>
        <button
          type="button"
          disabled
          aria-disabled="true"
          title="Save is intentionally disabled in this creator pass"
          style={{
            ...shellButtonStyle,
            cursor: "default",
            opacity: 0.72,
            background: "rgba(255,255,255,0.035)",
          }}
        >
          Save Stick Figure
        </button>
      </header>

      <div style={{ flex: 1, minHeight: 0, display: "flex" }}>
        <main
          style={{
            flex: 1,
            minWidth: 0,
            minHeight: 0,
            display: "flex",
            flexDirection: "column",
            background: "radial-gradient(circle at 50% 35%, rgba(110,170,255,0.08), transparent 34%), rgb(30,32,42)",
          }}
        >
          <div
            style={{
              flex: 1,
              minHeight: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: 24,
            }}
          >
            <div
              style={{
                width: selectedCanvasSize.width,
                height: selectedCanvasSize.height,
                minWidth: selectedCanvasSize.width,
                minHeight: selectedCanvasSize.height,
                maxWidth: selectedCanvasSize.width,
                maxHeight: selectedCanvasSize.height,
                flexShrink: 0,
                position: "relative",
                transform: `scale(${canvasScale})`,
                transformOrigin: "center center",
                transition: "transform 180ms ease",
              }}
            >
              <div
                aria-label="Stick figure creator canvas"
                style={{
                  width: "100%",
                  height: "100%",
                  boxSizing: "border-box",
                  position: "relative",
                  overflow: "hidden",
                  userSelect: "none",
                  borderRadius: 18,
                  border: "1px solid rgba(255,255,255,0.14)",
                  background:
                    "linear-gradient(90deg, rgba(0,0,0,0.035) 1px, transparent 1px), linear-gradient(rgba(0,0,0,0.035) 1px, transparent 1px), #f5f5f5",
                  backgroundSize: "32px 32px",
                  boxShadow: "0 24px 56px rgba(0,0,0,0.24)",
                }}
              >
                {creatorJoints.length === 0 ? (
                  <div
                    aria-hidden="true"
                    style={{
                      position: "absolute",
                      inset: 0,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      padding: 24,
                      pointerEvents: "none",
                      textAlign: "center",
                    }}
                  >
                    <div
                      style={{
                        maxWidth: 360,
                        borderRadius: 16,
                        border: "1px solid rgba(18,22,28,0.08)",
                        background: "rgba(255,255,255,0.62)",
                        padding: "14px 16px",
                        color: "rgba(18,22,28,0.56)",
                        fontSize: 13,
                        fontWeight: 800,
                        lineHeight: 1.45,
                      }}
                    >
                      Drag anywhere to create the first limb. Start from an existing joint to extend the figure.
                    </div>
                  </div>
                ) : null}
                <svg
                  ref={creatorStageSvgRef}
                  aria-label="Stick figure creator stage"
                  width={selectedCanvasSize.width}
                  height={selectedCanvasSize.height}
                  viewBox={`0 0 ${selectedCanvasSize.width} ${selectedCanvasSize.height}`}
                  preserveAspectRatio="xMinYMin meet"
                  onPointerDown={handleCreatorStagePointerDown}
                  onPointerMove={handleCreatorStagePointerMove}
                  onPointerUp={completeCreatorStageGesture}
                  onPointerCancel={completeCreatorStageGesture}
                  style={{
                    display: "block",
                    position: "absolute",
                    left: 0,
                    top: 0,
                    width: selectedCanvasSize.width,
                    height: selectedCanvasSize.height,
                    minWidth: selectedCanvasSize.width,
                    minHeight: selectedCanvasSize.height,
                    maxWidth: selectedCanvasSize.width,
                    maxHeight: selectedCanvasSize.height,
                    transform: "none",
                    transformOrigin: "top left",
                    overflow: "hidden",
                    cursor: drawGesture
                      ? "crosshair"
                      : jointDrag
                        ? "grabbing"
                        : activeCreatorTool === "Draw"
                          ? "crosshair"
                          : activeCreatorTool === "Insert"
                            ? "copy"
                            : activeCreatorTool === "Pose"
                              ? "grab"
                              : "default",
                    touchAction: "none",
                  }}
                >
                  <rect
                    x="0"
                    y="0"
                    width={selectedCanvasSize.width}
                    height={selectedCanvasSize.height}
                    fill="transparent"
                    pointerEvents="all"
                  />
                  <g opacity={globalOpacity} transform={`translate(${creatorPaperOffset.x} ${creatorPaperOffset.y})`}>
                    {creatorShapes.map((shape) => {
                      const joint = creatorJointsById.get(shape.jointId);

                      if (!joint) {
                        return null;
                      }

                      if (shape.type === "circle") {
                        return (
                          <circle
                            key={shape.id}
                            data-creator-shape-id={shape.id}
                            cx={joint.x}
                            cy={joint.y - 34}
                            r={28}
                            fill={shape.fillColor}
                            stroke={globalStrokeColor}
                            strokeWidth="3"
                            pointerEvents="none"
                            vectorEffect="non-scaling-stroke"
                          />
                        );
                      }

                      if (shape.type === "rectangle") {
                        return (
                          <rect
                            key={shape.id}
                            data-creator-shape-id={shape.id}
                            x={joint.x - 28}
                            y={joint.y - 48}
                            width={56}
                            height={36}
                            rx={7}
                            fill={shape.fillColor}
                            stroke={globalStrokeColor}
                            strokeWidth="3"
                            pointerEvents="none"
                            vectorEffect="non-scaling-stroke"
                          />
                        );
                      }

                      return (
                        <path
                          key={shape.id}
                          data-creator-shape-id={shape.id}
                          d={`M ${joint.x} ${joint.y - 58} L ${joint.x - 34} ${joint.y - 8} L ${joint.x + 34} ${
                            joint.y - 8
                          } Z`}
                          fill={shape.fillColor}
                          stroke={globalStrokeColor}
                          strokeWidth="3"
                          pointerEvents="none"
                          vectorEffect="non-scaling-stroke"
                        />
                      );
                    })}
                    {creatorLimbs.map((limb) => {
                      const startJoint = creatorJointsById.get(limb.startJointId);
                      const endJoint = creatorJointsById.get(limb.endJointId);

                      if (!startJoint || !endJoint) {
                        return null;
                      }

                      return (
                        <g key={limb.id} pointerEvents="none">
                          <line
                            data-creator-limb-id={limb.id}
                            x1={startJoint.x}
                            y1={startJoint.y}
                            x2={endJoint.x}
                            y2={endJoint.y}
                            stroke={getLimbStroke(limb)}
                            strokeWidth={getLimbStrokeWidth(limb)}
                            strokeLinecap="round"
                            pointerEvents="none"
                            vectorEffect="non-scaling-stroke"
                          />
                        </g>
                      );
                    })}
                    {drawGesture ? (
                      <line
                        data-creator-draw-preview="true"
                        x1={drawGesture.startPoint.x}
                        y1={drawGesture.startPoint.y}
                        x2={drawGesture.previewPoint.x}
                        y2={drawGesture.previewPoint.y}
                        stroke={globalStrokeColor}
                        strokeWidth={defaultLimbThickness}
                        strokeLinecap="round"
                        strokeDasharray="16 12"
                        opacity="0.48"
                        pointerEvents="none"
                        vectorEffect="non-scaling-stroke"
                      />
                    ) : null}
                    {creatorJoints.map((joint) => (
                      <g key={joint.id} pointerEvents="none">
                        <circle
                          data-creator-joint-id={joint.id}
                          cx={joint.x}
                          cy={joint.y}
                          r={CREATOR_JOINT_HANDLE_RADIUS}
                          fill={DEFAULT_JOINT_FILL_COLOR}
                          stroke={DEFAULT_STROKE_COLOR}
                          strokeWidth="2.5"
                          vectorEffect="non-scaling-stroke"
                          style={{ filter: "drop-shadow(0 2px 3px rgba(0,0,0,0.22))" }}
                        />
                      </g>
                    ))}
                  </g>
                </svg>
              </div>
            </div>
          </div>

          <div
            aria-label="Stick figure creator toolbar"
            style={{
              height: 56,
              borderTop: "1px solid rgba(255,255,255,0.08)",
              borderRight: "1px solid rgba(255,255,255,0.10)",
              background: "rgba(18,22,28,0.88)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-evenly",
              padding: "0 18px",
              gap: 10,
              flexShrink: 0,
            }}
          >
            {creatorToolNames.map((tool) => {
              const isDrawTool = tool === "Draw";
              const isSelectTool = tool === "Select";
              const isInsertTool = tool === "Insert";
              const isPoseTool = tool === "Pose";
              const isMirrorTool = tool === "Mirror";
              const isCenterTool = tool === "Center";
              const isActionTool = isMirrorTool || isCenterTool;
              const isEnabledTool =
                isDrawTool ||
                isSelectTool ||
                (isInsertTool && canInsertJoint) ||
                (isPoseTool && canPoseRig) ||
                (isMirrorTool && canMirrorRig) ||
                (isCenterTool && canCenterRig);
              const isActive = !isActionTool && activeCreatorTool === tool;
              const toolCellStyle: CSSProperties = {
                minWidth: 72,
                height: 38,
                borderRadius: 12,
                border: isActive ? "1px solid rgba(110,170,255,0.28)" : "1px solid rgba(255,255,255,0.10)",
                background: isActive ? "rgba(110,170,255,0.10)" : "rgba(255,255,255,0.025)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: isActive ? "rgba(255,255,255,0.90)" : "rgba(255,255,255,0.62)",
                fontSize: 11,
                fontWeight: 800,
                userSelect: "none",
              };

              if (isEnabledTool) {
                return (
                  <button
                    key={tool}
                    type="button"
                    aria-pressed={isActionTool ? undefined : isActive}
                    onClick={
                      isDrawTool
                        ? activateDrawTool
                        : isSelectTool
                          ? activateSelectTool
                          : isInsertTool
                            ? activateInsertTool
                            : isPoseTool
                              ? activatePoseTool
                              : isMirrorTool
                                ? mirrorCreatorRig
                                : centerCreatorRig
                    }
                    style={{
                      ...toolCellStyle,
                      cursor: "pointer",
                      appearance: "none",
                      outline: "none",
                    }}
                  >
                    {tool}
                  </button>
                );
              }

              return (
                <div
                  key={tool}
                  aria-disabled="true"
                  title={
                    isInsertTool || isMirrorTool
                      ? "Create at least one segment first"
                      : isPoseTool || isCenterTool
                        ? "Create at least one joint first"
                        : `${tool} unavailable`
                  }
                  style={{
                    ...toolCellStyle,
                    opacity: isInsertTool || isPoseTool || isMirrorTool || isCenterTool ? 0.48 : 1,
                    pointerEvents: "none",
                  }}
                >
                  {tool}
                </div>
              );
            })}
          </div>
        </main>

        <aside
          style={{
            width: "min(420px, 46vw)",
            minWidth: 320,
            borderLeft: "1px solid rgba(255,255,255,0.08)",
            background: "rgba(18,22,28,0.92)",
            display: "flex",
            flexDirection: "column",
            gap: 14,
            padding: 14,
            overflow: "auto",
          }}
        >
          <PlaceholderSection
            title="Canvas"
            description="Controls the creator canvas only. The graph stays local to this creator."
          >
            <label style={fieldLabelStyle}>
              Figure Name
              <input
                aria-label="Figure Name"
                type="text"
                value={figureName}
                onChange={(event) => setFigureName(event.currentTarget.value)}
                placeholder={DEFAULT_FIGURE_NAME}
                style={textInputStyle}
              />
            </label>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ color: "rgba(255,255,255,0.72)", fontSize: 12, fontWeight: 700 }}>Canvas Size</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 8 }}>
                {(["Small", "Standard", "Large"] as const).map((size) => (
                  <button
                    key={size}
                    type="button"
                    onClick={() => setCanvasSize(size)}
                    style={controlButtonStyle(canvasSize === size)}
                  >
                    {size}
                  </button>
                ))}
              </div>
            </div>
            <RangeControl
              label="Canvas Scale"
              min={0.75}
              max={1.25}
              step={0.05}
              value={canvasScale}
              displayValue={`${Math.round(canvasScale * 100)}%`}
              onChange={setCanvasScale}
            />
            <button type="button" onClick={resetCreatorCanvas} style={{ ...controlButtonStyle(false), width: "100%" }}>
              Reset Canvas
            </button>
            <PropertyRow label="Joints" value={`${creatorJoints.length}`} />
            <PropertyRow label="Limbs" value={`${creatorLimbs.length}`} />
          </PlaceholderSection>

          <PlaceholderSection
            title="Build"
            description="Draw: drag to create limbs. Insert: click a segment to add a bend joint."
          >
            <PropertyRow label="Active Tool" value={activeCreatorTool} />
            <div style={sectionDescriptionStyle}>
              Start a drag on empty canvas for a new segment, or start from a joint to extend the figure.
            </div>
          </PlaceholderSection>

          <PlaceholderSection title="Whole Figure" description="Default styling for the current creator figure.">
            <ColorControl label="Stroke Color" value={globalStrokeColor} onChange={setGlobalStrokeColor} />
            <RangeControl
              label="Opacity"
              min={0.2}
              max={1}
              step={0.05}
              value={globalOpacity}
              displayValue={`${Math.round(globalOpacity * 100)}%`}
              onChange={setGlobalOpacity}
            />
            <RangeControl
              label="Default Thickness"
              min={2}
              max={20}
              step={1}
              value={defaultLimbThickness}
              displayValue={`${defaultLimbThickness}px`}
              onChange={setDefaultLimbThickness}
            />
          </PlaceholderSection>

          <PlaceholderSection
            title="Selected Segment"
            description={
              selectedCreatorLimb
                ? "Overrides apply only to the selected segment."
                : "Create or select a segment to edit its style."
            }
          >
            {selectedCreatorLimb ? (
              <>
                <ColorControl
                  label="Color Override"
                  value={selectedCreatorLimb.colorOverride ?? globalStrokeColor}
                  onChange={(nextColor) => updateSelectedLimb({ colorOverride: nextColor })}
                />
                <RangeControl
                  label="Thickness Override"
                  min={2}
                  max={24}
                  step={1}
                  value={selectedCreatorLimb.thicknessOverride ?? defaultLimbThickness}
                  displayValue={`${selectedCreatorLimb.thicknessOverride ?? defaultLimbThickness}px`}
                  onChange={(nextThickness) => updateSelectedLimb({ thicknessOverride: nextThickness })}
                />
                <button
                  type="button"
                  onClick={resetSelectedLimbStyle}
                  style={{ ...controlButtonStyle(false), width: "100%" }}
                >
                  Reset Segment Style
                </button>
                <button
                  type="button"
                  onClick={removeSelectedCreatorLimb}
                  style={{
                    ...controlButtonStyle(canRemoveSelectedLimb),
                    width: "100%",
                    border: "1px solid rgba(255,110,110,0.28)",
                    background: "rgba(255,110,110,0.08)",
                  }}
                >
                  Remove Limb
                </button>
              </>
            ) : (
              <div style={propertyRowStyle}>
                <span>Status</span>
                <span style={{ color: "rgba(255,255,255,0.42)", fontWeight: 800 }}>No segment selected</span>
              </div>
            )}
          </PlaceholderSection>

          <PlaceholderSection
            title="Selected Joint"
            description={
              selectedCreatorJoint
                ? "Joint selected for movement. Joints are control points; style the current segment instead."
                : "Select a joint to move structure."
            }
          >
            {selectedCreatorJoint ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <PropertyRow label="Status" value="Movement handle" />
                <div style={sectionDescriptionStyle}>
                  Drag this joint to reposition connected segments. Joints stay small and fixed; segment color and
                  thickness are edited in Selected Segment.
                </div>
              </div>
            ) : (
              <div style={propertyRowStyle}>
                <span>Status</span>
                <span style={{ color: "rgba(255,255,255,0.42)", fontWeight: 800 }}>No joint selected</span>
              </div>
            )}
          </PlaceholderSection>

          {selectedCreatorJoint ? (
            <PlaceholderSection
              title="Shapes"
              description="Attach one simple shape to the selected joint. Shapes follow joint movement."
            >
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 8 }}>
                {(["circle", "rectangle", "triangle"] as const).map((shapeType) => (
                  <button
                    key={shapeType}
                    type="button"
                    onClick={() => attachShapeToSelectedJoint(shapeType)}
                    style={controlButtonStyle(selectedCreatorShape?.type === shapeType)}
                  >
                    {shapeType[0].toUpperCase()}
                    {shapeType.slice(1)}
                  </button>
                ))}
              </div>
              {selectedCreatorShape ? (
                <>
                  <ColorControl
                    label="Shape Fill"
                    value={selectedCreatorShape.fillColor}
                    onChange={updateSelectedShapeFill}
                  />
                  <button
                    type="button"
                    onClick={removeShapeFromSelectedJoint}
                    style={{ ...controlButtonStyle(false), width: "100%" }}
                  >
                    Remove Shape
                  </button>
                </>
              ) : (
                <div style={propertyRowStyle}>
                  <span>Status</span>
                  <span style={{ color: "rgba(255,255,255,0.42)", fontWeight: 800 }}>No shape attached</span>
                </div>
              )}
            </PlaceholderSection>
          ) : null}

          <PlaceholderSection title="Future" description="Visible roadmap controls only. These are intentionally disabled.">
            <DisabledFutureRow label="Gradients" />
            <DisabledFutureRow label="Advanced Styles" />
          </PlaceholderSection>
        </aside>
      </div>
    </div>
  );
}
