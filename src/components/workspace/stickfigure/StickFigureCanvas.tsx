import { useMemo, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent, WheelEvent as ReactWheelEvent } from "react";

import type { StickFigureToolName } from "./StickFigureToolBar";
import type {
  StickFigureFigureItem,
  StickFigurePoint,
  StickFigureSelection,
  StickFigureStructureGraph,
  StickFigureStructureJoint,
  StickFigureStructureSegmentDraft,
  StickFigureStructureTool,
} from "./types";

type StickFigureCanvasProps = {
  figures: StickFigureFigureItem[];
  selection: StickFigureSelection;
  onSelectFigure: (figureId: string) => void;
  activeTool: StickFigureToolName | null;
  structureTool: StickFigureStructureTool;
  structureGraph: StickFigureStructureGraph;
  canvasMovementEnabled: boolean;
  cameraZoom: number;
  cameraPan: StickFigurePoint;
  canvasBackgroundColor: string;
  onCommitStructureSegment: (draft: StickFigureStructureSegmentDraft) => boolean;
  onSelectStructureJoint: (jointId: string | null) => void;
  onMoveStructureJoint: (jointId: string, point: StickFigurePoint) => void;
  onCameraZoomChange: (zoom: number) => void;
  onCameraPanChange: (pan: StickFigurePoint) => void;
};

type DragPreview = {
  pointerId: number;
  startPoint: StickFigurePoint;
  currentPoint: StickFigurePoint;
  startJointId: string | null;
};

type JointDragState = {
  pointerId: number;
  jointId: string;
  offsetX: number;
  offsetY: number;
};

type CanvasPanState = {
  pointerId: number;
  pointerX: number;
  pointerY: number;
  startPanX: number;
  startPanY: number;
};

const JOINT_RADIUS = 6;
const SELECT_HIT_DISTANCE = 18;
const SNAP_DISTANCE = 18;
const MIN_SEGMENT_LENGTH = 18;
const MIN_CAMERA_ZOOM = 0.5;
const MAX_CAMERA_ZOOM = 3;
const PAN_BASE_LIMIT_FACTOR = 0.5;

function StickFigureStageGlyph({ scale, rotation }: { scale: number; rotation: number }) {
  return (
    <svg
      viewBox="0 0 64 120"
      aria-hidden="true"
      style={{
        width: Math.max(42, scale * 0.55),
        height: Math.max(72, scale),
        display: "block",
        transform: `rotate(${rotation}deg)`,
      }}
    >
      <circle cx="32" cy="18" r="12" fill="none" stroke="#10131b" strokeWidth="4" />
      <line x1="32" y1="30" x2="32" y2="70" stroke="#10131b" strokeWidth="4" strokeLinecap="round" />
      <line x1="12" y1="48" x2="52" y2="48" stroke="#10131b" strokeWidth="4" strokeLinecap="round" />
      <line x1="32" y1="70" x2="12" y2="106" stroke="#10131b" strokeWidth="4" strokeLinecap="round" />
      <line x1="32" y1="70" x2="52" y2="106" stroke="#10131b" strokeWidth="4" strokeLinecap="round" />
    </svg>
  );
}

export function StickFigureCanvas({
  figures,
  selection,
  onSelectFigure,
  activeTool,
  structureTool,
  structureGraph,
  canvasMovementEnabled,
  cameraZoom,
  cameraPan,
  canvasBackgroundColor,
  onCommitStructureSegment,
  onSelectStructureJoint,
  onMoveStructureJoint,
  onCameraZoomChange,
  onCameraPanChange,
}: StickFigureCanvasProps) {
  const stageScale = 0.85;
  const stageInset = `${((1 - stageScale) * 100) / 2}%`;
  const canvasHostRef = useRef<HTMLDivElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const canvasPanStartRef = useRef<CanvasPanState | null>(null);
  const [dragPreview, setDragPreview] = useState<DragPreview | null>(null);
  const [jointDrag, setJointDrag] = useState<JointDragState | null>(null);
  const [isPanning, setIsPanning] = useState(false);

  const jointsById = useMemo(
    () => new Map(structureGraph.joints.map((joint) => [joint.id, joint])),
    [structureGraph.joints],
  );
  const jointDegreeById = useMemo(() => {
    const nextDegrees = new Map<string, number>();

    structureGraph.limbs.forEach((limb) => {
      nextDegrees.set(limb.startJointId, (nextDegrees.get(limb.startJointId) ?? 0) + 1);
      nextDegrees.set(limb.endJointId, (nextDegrees.get(limb.endJointId) ?? 0) + 1);
    });

    return nextDegrees;
  }, [structureGraph.limbs]);
  const endpointJoints = useMemo<StickFigureStructureJoint[]>(
    () => structureGraph.joints.filter((joint) => (jointDegreeById.get(joint.id) ?? 0) <= 1),
    [jointDegreeById, structureGraph.joints],
  );
  const previewEndJoint = useMemo<StickFigureStructureGraph["joints"][number] | null>(() => {
    if (!dragPreview) {
      return null;
    }

    let bestMatch: StickFigureStructureJoint | null = null;
    let bestDistance = SNAP_DISTANCE;

    structureGraph.joints.forEach((joint) => {
      if (joint.id === dragPreview.startJointId) {
        return;
      }

      const distance = Math.hypot(joint.x - dragPreview.currentPoint.x, joint.y - dragPreview.currentPoint.y);
      if (distance <= bestDistance) {
        bestDistance = distance;
        bestMatch = joint;
      }
    });

    return bestMatch;
  }, [dragPreview, structureGraph.joints]);
  const previewEndPoint = previewEndJoint
    ? { x: previewEndJoint.x, y: previewEndJoint.y }
    : dragPreview?.currentPoint ?? null;

  const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

  const clampPan = (pan: StickFigurePoint, zoom: number): StickFigurePoint => {
    const rect = canvasHostRef.current?.getBoundingClientRect();
    if (!rect) {
      return pan;
    }

    const zoomOverflowX = Math.max(0, (rect.width * zoom - rect.width) / 2);
    const zoomOverflowY = Math.max(0, (rect.height * zoom - rect.height) / 2);
    const panLimitX = zoomOverflowX + rect.width * PAN_BASE_LIMIT_FACTOR;
    const panLimitY = zoomOverflowY + rect.height * PAN_BASE_LIMIT_FACTOR;

    return {
      x: clamp(pan.x, -panLimitX, panLimitX),
      y: clamp(pan.y, -panLimitY, panLimitY),
    };
  };

  const zoomCanvas = (event: ReactWheelEvent<HTMLDivElement>) => {
    const hostBounds = canvasHostRef.current?.getBoundingClientRect();
    if (!hostBounds) {
      return;
    }

    const centerX = hostBounds.width / 2;
    const centerY = hostBounds.height / 2;
    const hostX = event.clientX - hostBounds.left;
    const hostY = event.clientY - hostBounds.top;

    const nextZoom = clamp(cameraZoom * Math.exp(-event.deltaY * 0.0015), MIN_CAMERA_ZOOM, MAX_CAMERA_ZOOM);
    if (nextZoom === cameraZoom) {
      return;
    }

    const worldX = (hostX - centerX - cameraPan.x) / cameraZoom;
    const worldY = (hostY - centerY - cameraPan.y) / cameraZoom;
    const nextPan = {
      x: hostX - centerX - worldX * nextZoom,
      y: hostY - centerY - worldY * nextZoom,
    };

    onCameraZoomChange(nextZoom);
    onCameraPanChange(clampPan(nextPan, nextZoom));
  };

  const resolveStagePoint = (event: ReactPointerEvent<HTMLDivElement>): StickFigurePoint | null => {
    const stage = stageRef.current;
    const stageBounds = stage?.getBoundingClientRect();
    if (!stage || !stageBounds || stageBounds.width === 0 || stageBounds.height === 0) {
      return null;
    }

    return {
      x: ((event.clientX - stageBounds.left) / stageBounds.width) * stage.offsetWidth,
      y: ((event.clientY - stageBounds.top) / stageBounds.height) * stage.offsetHeight,
    };
  };

  const findNearestJoint = (
    point: StickFigurePoint,
    joints: StickFigureStructureJoint[],
    excludeJointId: string | null = null,
    maxDistance = SNAP_DISTANCE,
  ): StickFigureStructureJoint | null => {
    let bestMatch: StickFigureStructureJoint | null = null;
    let bestDistance = maxDistance;

    joints.forEach((joint) => {
      if (joint.id === excludeJointId) {
        return;
      }

      const distance = Math.hypot(joint.x - point.x, joint.y - point.y);
      if (distance <= bestDistance) {
        bestDistance = distance;
        bestMatch = joint;
      }
    });

    return bestMatch;
  };

  const handleSelectPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (activeTool !== "Select" || canvasMovementEnabled || event.button !== 0) {
      return;
    }

    const stagePoint = resolveStagePoint(event);
    if (!stagePoint) {
      return;
    }

    const selectedJoint = findNearestJoint(stagePoint, structureGraph.joints, null, SELECT_HIT_DISTANCE);
    if (!selectedJoint) {
      onSelectStructureJoint(null);
      return;
    }

    onSelectStructureJoint(selectedJoint.id);
    setJointDrag({
      pointerId: event.pointerId,
      jointId: selectedJoint.id,
      offsetX: selectedJoint.x - stagePoint.x,
      offsetY: selectedJoint.y - stagePoint.y,
    });
    stageRef.current?.setPointerCapture(event.pointerId);
    event.preventDefault();
  };

  const handleSelectPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (jointDrag && canvasMovementEnabled) {
      setJointDrag(null);
      return;
    }

    if (!jointDrag || event.pointerId !== jointDrag.pointerId || activeTool !== "Select" || canvasMovementEnabled) {
      return;
    }

    const stagePoint = resolveStagePoint(event);
    if (!stagePoint) {
      return;
    }

    onMoveStructureJoint(jointDrag.jointId, {
      x: stagePoint.x + jointDrag.offsetX,
      y: stagePoint.y + jointDrag.offsetY,
    });
    event.preventDefault();
  };

  const completeSelectDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!jointDrag || event.pointerId !== jointDrag.pointerId) {
      return;
    }

    if (stageRef.current?.hasPointerCapture(event.pointerId)) {
      stageRef.current.releasePointerCapture(event.pointerId);
    }
    setJointDrag(null);
  };

  const cancelSelectDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    completeSelectDrag(event);
  };

  const handleStructurePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (structureTool !== "addLimb" || event.button !== 0) {
      return;
    }

    const stagePoint = resolveStagePoint(event);
    if (!stagePoint) {
      return;
    }

    const startJoint = findNearestJoint(stagePoint, endpointJoints);
    const startPoint = startJoint ? { x: startJoint.x, y: startJoint.y } : stagePoint;

    setDragPreview({
      pointerId: event.pointerId,
      startPoint,
      currentPoint: stagePoint,
      startJointId: startJoint?.id ?? null,
    });
    stageRef.current?.setPointerCapture(event.pointerId);
    event.preventDefault();
  };

  const handleStructurePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragPreview || event.pointerId !== dragPreview.pointerId) {
      return;
    }

    const stagePoint = resolveStagePoint(event);
    if (!stagePoint) {
      return;
    }

    setDragPreview((current) =>
      current && current.pointerId === event.pointerId
        ? {
            ...current,
            currentPoint: stagePoint,
          }
        : current,
    );
  };

  const completeStructureDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragPreview || event.pointerId !== dragPreview.pointerId) {
      return;
    }

    const stagePoint = resolveStagePoint(event) ?? dragPreview.currentPoint;
    const endJoint = findNearestJoint(stagePoint, structureGraph.joints, dragPreview.startJointId);
    const endPoint = endJoint ? { x: endJoint.x, y: endJoint.y } : stagePoint;
    const segmentLength = Math.hypot(endPoint.x - dragPreview.startPoint.x, endPoint.y - dragPreview.startPoint.y);

    stageRef.current?.releasePointerCapture(event.pointerId);
    setDragPreview(null);

    if (segmentLength < MIN_SEGMENT_LENGTH) {
      return;
    }

    onCommitStructureSegment({
      startPoint: dragPreview.startPoint,
      endPoint,
      startJointId: dragPreview.startJointId,
      endJointId: endJoint?.id ?? null,
    });
  };

  const handleStructurePointerCancel = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragPreview || event.pointerId !== dragPreview.pointerId) {
      return;
    }

    stageRef.current?.releasePointerCapture(event.pointerId);
    setDragPreview(null);
  };

  const handleStagePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (structureTool === "addLimb") {
      handleStructurePointerDown(event);
      return;
    }

    handleSelectPointerDown(event);
  };

  const handleStagePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (dragPreview) {
      handleStructurePointerMove(event);
      return;
    }

    handleSelectPointerMove(event);
  };

  const handleStagePointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (dragPreview) {
      completeStructureDrag(event);
      return;
    }

    completeSelectDrag(event);
  };

  const handleStagePointerCancel = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (dragPreview) {
      handleStructurePointerCancel(event);
      return;
    }

    cancelSelectDrag(event);
  };

  const startCanvasPan = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (activeTool !== "Select" || !canvasMovementEnabled || event.button !== 0) {
      return;
    }

    setJointDrag(null);
    canvasPanStartRef.current = {
      pointerId: event.pointerId,
      pointerX: event.clientX,
      pointerY: event.clientY,
      startPanX: cameraPan.x,
      startPanY: cameraPan.y,
    };
    setIsPanning(true);
    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
  };

  const moveCanvasPan = (event: ReactPointerEvent<HTMLDivElement>) => {
    const panStart = canvasPanStartRef.current;
    if (!panStart || panStart.pointerId !== event.pointerId || activeTool !== "Select" || !canvasMovementEnabled) {
      return;
    }

    onCameraPanChange(clampPan({
      x: panStart.startPanX + event.clientX - panStart.pointerX,
      y: panStart.startPanY + event.clientY - panStart.pointerY,
    }, cameraZoom));
  };

  const endCanvasPan = (event: ReactPointerEvent<HTMLDivElement>) => {
    const panStart = canvasPanStartRef.current;
    if (!panStart || panStart.pointerId !== event.pointerId) {
      return;
    }

    canvasPanStartRef.current = null;
    setIsPanning(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const cameraTransform = `translate(${cameraPan.x}px, ${cameraPan.y}px) scale(${cameraZoom})`;
  const isSelectToolActive = activeTool === "Select" && structureTool !== "addLimb";

  return (
    <div style={{ flex: 1, minWidth: 0, padding: 14 }}>
      <div
        ref={canvasHostRef}
        style={{
          height: "100%",
          borderRadius: 0,
          border: "1px solid rgba(255,255,255,0.12)",
          background: "rgb(34, 36, 47)",
          position: "relative",
          overflow: "hidden",
        }}
      >
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            inset: stageInset,
            background: canvasBackgroundColor,
            boxShadow: "0 0 0 1px rgba(0,0,0,0.28), 0 16px 34px rgba(0,0,0,0.34)",
            pointerEvents: "none",
            transform: cameraTransform,
            transformOrigin: "center center",
          }}
        />

        <div
          ref={stageRef}
          style={{
            position: "absolute",
            inset: stageInset,
            overflow: "hidden",
            cursor: structureTool === "addLimb" ? "crosshair" : isSelectToolActive && !canvasMovementEnabled ? "default" : "default",
            touchAction: "none",
            transform: cameraTransform,
            transformOrigin: "center center",
          }}
          onPointerDown={handleStagePointerDown}
          onPointerMove={handleStagePointerMove}
          onPointerUp={handleStagePointerUp}
          onPointerCancel={handleStagePointerCancel}
        >
          <svg
            aria-hidden="true"
            style={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              pointerEvents: "none",
            }}
          >
            {structureGraph.limbs.map((limb) => {
              const startJoint = jointsById.get(limb.startJointId);
              const endJoint = jointsById.get(limb.endJointId);

              if (!startJoint || !endJoint) {
                return null;
              }

              return (
                <line
                  key={limb.id}
                  x1={startJoint.x}
                  y1={startJoint.y}
                  x2={endJoint.x}
                  y2={endJoint.y}
                  stroke="#10131b"
                  strokeWidth="8"
                  strokeLinecap="round"
                />
              );
            })}

            {dragPreview && previewEndPoint ? (
              <line
                x1={dragPreview.startPoint.x}
                y1={dragPreview.startPoint.y}
                x2={previewEndPoint.x}
                y2={previewEndPoint.y}
                stroke="rgba(69, 116, 209, 0.78)"
                strokeWidth="6"
                strokeLinecap="round"
                strokeDasharray="10 8"
              />
            ) : null}

            {structureGraph.joints.map((joint) => {
              const isEndpoint = (jointDegreeById.get(joint.id) ?? 0) <= 1;
              const isActive = structureGraph.activeJointId === joint.id;

              return (
                <circle
                  key={joint.id}
                  cx={joint.x}
                  cy={joint.y}
                  r={JOINT_RADIUS}
                  fill={isActive ? "#7bb0ff" : "#ffffff"}
                  stroke={isEndpoint ? "#10131b" : "rgba(16,19,27,0.76)"}
                  strokeWidth={isActive ? "4" : "3"}
                  style={{ filter: isActive ? "drop-shadow(0 0 6px rgba(123,176,255,0.55))" : "none" }}
                />
              );
            })}
          </svg>

          {structureTool === "addLimb" && (
            <div
              aria-hidden="true"
              style={{
                position: "absolute",
                top: 18,
                left: 18,
                padding: "10px 12px",
                borderRadius: 12,
                border: "1px solid rgba(69,116,209,0.18)",
                background: "rgba(16,19,27,0.78)",
                color: "rgba(255,255,255,0.78)",
                fontSize: 12,
                lineHeight: 1.45,
                pointerEvents: "none",
                boxShadow: "0 8px 18px rgba(0,0,0,0.18)",
                maxWidth: 280,
              }}
            >
              Click and drag to place a limb. Drag from an existing endpoint to extend the connected skeleton.
            </div>
          )}

          {figures.length > 0 &&
            figures.map((figure) => {
              const isSelected = selection.target === "figure" && selection.figureId === figure.id;

              return (
                <button
                  key={figure.id}
                  type="button"
                  onClick={() => onSelectFigure(figure.id)}
                  style={{
                    position: "absolute",
                    left: `calc(50% + ${figure.x}px)`,
                    top: `calc(50% + ${figure.y}px)`,
                    transform: "translate(-50%, -50%)",
                    border: isSelected ? "1px solid rgba(90,150,255,0.28)" : "1px solid transparent",
                    background: isSelected ? "rgba(90,150,255,0.06)" : "transparent",
                    borderRadius: 16,
                    padding: "12px 10px 8px",
                    cursor: "pointer",
                  }}
                >
                  <StickFigureStageGlyph scale={figure.scale} rotation={figure.rotation} />
                  <div
                    style={{
                      marginTop: 6,
                      color: "rgba(16,19,27,0.78)",
                      fontSize: 11,
                      fontWeight: 700,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {figure.name}
                  </div>
                </button>
              );
            })}
        </div>

        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            inset: 0,
            zIndex: 8,
            pointerEvents: isSelectToolActive && canvasMovementEnabled ? "auto" : "none",
            cursor: isSelectToolActive && canvasMovementEnabled ? (isPanning ? "grabbing" : "grab") : "default",
            touchAction: "none",
          }}
          onPointerDown={startCanvasPan}
          onPointerMove={moveCanvasPan}
          onPointerUp={endCanvasPan}
          onPointerCancel={endCanvasPan}
          onWheel={zoomCanvas}
        />
      </div>
    </div>
  );
}
