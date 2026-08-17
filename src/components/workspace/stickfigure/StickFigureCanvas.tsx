import {useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState} from "react";
import {
  STICK_SEGMENT_ROLE_PAIRS,
  deriveStickLineHead,
} from "../../../lib/stickfigure/stickProjectContract";
import type {
  StickJointRoleV1,
  StickProjectDocumentV1,
} from "../../../lib/stickfigure/stickProjectContract";
import {
  projectPointFromClient,
  resolveStickTimelinePose,
  roundedClampedJointPoint,
} from "../../../lib/stickfigure/stickTimeline";
import type {StickCompletedJointEditV1} from "../../../lib/stickfigure/stickTimeline";
import type {StickFigureCanvasStage, StickFigurePoint} from "./types";
import type {StickFigureToolName} from "./StickFigureToolBar";

type ActiveGesture = {
  terminal: "active" | "committed" | "cancelled";
  pointerId: number;
  baseWorkspaceInstanceId: string;
  projectId: string;
  baseRevision: number;
  baseWorkspaceGeneration: number;
  preStateDigest: string;
  selectedFrameId: string;
  selectedFrameIndex: number;
  controllingFrameId: string;
  controllingFrameIndex: number;
  poseId: string;
  jointId: string;
  jointRole: StickJointRoleV1;
  from: StickFigurePoint;
  offset: StickFigurePoint;
};

type StickFigureCanvasProps = {
  document: StickProjectDocumentV1;
  frameIndex: number;
  workspaceInstanceId: string;
  workspaceGeneration: number;
  documentDigest: string;
  publicationReady: boolean;
  isPlaying: boolean;
  activeTool: StickFigureToolName | null;
  canvasMovementEnabled: boolean;
  cameraZoom: number;
  cameraPan: StickFigurePoint;
  canvasBackgroundColor: string;
  onCameraPanChange: (point: StickFigurePoint) => void;
  onCompletedJointEdit: (edit: StickCompletedJointEditV1) => void;
  onGestureCheckpoint: (checkpoint: {state: "idle" | "active" | "committed" | "cancelled"; preview: StickFigurePoint | null}) => void;
};

const EMPTY_STAGE: StickFigureCanvasStage = {left: 0, top: 0, scale: 1, width: 0, height: 0};

export function StickFigureCanvas({
  document,
  frameIndex,
  workspaceInstanceId,
  workspaceGeneration,
  documentDigest,
  publicationReady,
  isPlaying,
  activeTool,
  canvasMovementEnabled,
  cameraZoom,
  cameraPan,
  canvasBackgroundColor,
  onCameraPanChange,
  onCompletedJointEdit,
  onGestureCheckpoint,
}: StickFigureCanvasProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const gestureRef = useRef<ActiveGesture | null>(null);
  const checkpointCallbackRef = useRef(onGestureCheckpoint);
  const panRef = useRef<{pointerId: number; client: StickFigurePoint; origin: StickFigurePoint} | null>(null);
  const liveRef = useRef({document, frameIndex, workspaceInstanceId, workspaceGeneration, documentDigest, publicationReady, isPlaying, activeTool});
  const [stage, setStage] = useState(EMPTY_STAGE);
  const [preview, setPreview] = useState<StickFigurePoint | null>(null);
  const [activeJointId, setActiveJointId] = useState<string | null>(null);
  const [gestureState, setGestureState] = useState<"idle" | "active" | "committed" | "cancelled">("idle");
  const resolved = useMemo(() => resolveStickTimelinePose(document, frameIndex), [document, frameIndex]);

  useLayoutEffect(() => {
    liveRef.current = {document, frameIndex, workspaceInstanceId, workspaceGeneration, documentDigest, publicationReady, isPlaying, activeTool};
    checkpointCallbackRef.current = onGestureCheckpoint;
  }, [activeTool, document, documentDigest, frameIndex, isPlaying, onGestureCheckpoint, publicationReady, workspaceGeneration, workspaceInstanceId]);

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const update = () => {
      const rect = container.getBoundingClientRect();
      const baseScale = Math.min(rect.width / document.coordinateSpace.width, rect.height / document.coordinateSpace.height);
      const scale = baseScale * cameraZoom;
      const width = document.coordinateSpace.width * scale;
      const height = document.coordinateSpace.height * scale;
      setStage({
        left: rect.left + (rect.width - width) / 2 + cameraPan.x,
        top: rect.top + (rect.height - height) / 2 + cameraPan.y,
        scale,
        width,
        height,
      });
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(container);
    return () => observer.disconnect();
  }, [cameraPan.x, cameraPan.y, cameraZoom, document.coordinateSpace.height, document.coordinateSpace.width]);

  const clearGesture = useCallback((terminal: "committed" | "cancelled") => {
    const gesture = gestureRef.current;
    if (!gesture || gesture.terminal !== "active") return;
    gesture.terminal = terminal;
    setPreview(null);
    setActiveJointId(null);
    setGestureState(terminal);
    checkpointCallbackRef.current({state: terminal, preview: null});
    const target = containerRef.current;
    if (target?.hasPointerCapture(gesture.pointerId)) {
      try { target.releasePointerCapture(gesture.pointerId); } catch {}
    }
    gestureRef.current = null;
  }, []);

  useEffect(() => {
    const gesture = gestureRef.current;
    if (gesture && (
      !publicationReady || isPlaying || activeTool !== "Select" || frameIndex !== gesture.selectedFrameIndex ||
      workspaceInstanceId !== gesture.baseWorkspaceInstanceId || workspaceGeneration !== gesture.baseWorkspaceGeneration ||
      documentDigest !== gesture.preStateDigest
    )) {
      let superseded = false;
      queueMicrotask(() => {if (!superseded) clearGesture("cancelled");});
      return () => {superseded = true;};
    }
  }, [activeTool, clearGesture, documentDigest, frameIndex, isPlaying, publicationReady, workspaceGeneration, workspaceInstanceId]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") clearGesture("cancelled");
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      clearGesture("cancelled");
    };
  }, [clearGesture]);

  const beginJointGesture = (event: React.PointerEvent, jointRole: StickJointRoleV1, jointId: string, point: StickFigurePoint) => {
    if (
      event.isPrimary !== true || event.button !== 0 || activeTool !== "Select" || canvasMovementEnabled ||
      isPlaying || !publicationReady || gestureRef.current || !resolved
    ) return;
    const pointerProject = projectPointFromClient({x: event.clientX, y: event.clientY}, stage);
    const gesture: ActiveGesture = {
      terminal: "active",
      pointerId: event.pointerId,
      baseWorkspaceInstanceId: workspaceInstanceId,
      projectId: document.projectId,
      baseRevision: document.documentRevision,
      baseWorkspaceGeneration: workspaceGeneration,
      preStateDigest: documentDigest,
      selectedFrameId: resolved.selectedCell.frameId,
      selectedFrameIndex: frameIndex,
      controllingFrameId: resolved.controllingCell.frameId,
      controllingFrameIndex: resolved.controllingFrameIndex,
      poseId: resolved.pose.poseId,
      jointId,
      jointRole,
      from: {x: point.x, y: point.y},
      offset: {x: point.x - pointerProject.x, y: point.y - pointerProject.y},
    };
    gestureRef.current = gesture;
    setPreview(gesture.from);
    setActiveJointId(jointId);
    setGestureState("active");
    checkpointCallbackRef.current({state: "active", preview: gesture.from});
    try { containerRef.current?.setPointerCapture(event.pointerId); } catch {}
    event.preventDefault();
    event.stopPropagation();
  };

  const moveGesture = (event: React.PointerEvent<HTMLDivElement>) => {
    const pan = panRef.current;
    if (pan && pan.pointerId === event.pointerId) {
      onCameraPanChange({x: pan.origin.x + event.clientX - pan.client.x, y: pan.origin.y + event.clientY - pan.client.y});
      return;
    }
    const gesture = gestureRef.current;
    if (!gesture || gesture.terminal !== "active" || gesture.pointerId !== event.pointerId) return;
    const next = roundedClampedJointPoint(
      projectPointFromClient({x: event.clientX, y: event.clientY}, stage),
      gesture.offset,
      document.coordinateSpace,
    );
    setPreview(next);
    checkpointCallbackRef.current({state: "active", preview: next});
  };

  const endGesture = (event: React.PointerEvent<HTMLDivElement>) => {
    if (panRef.current?.pointerId === event.pointerId) {
      panRef.current = null;
      try { containerRef.current?.releasePointerCapture(event.pointerId); } catch {}
      return;
    }
    const gesture = gestureRef.current;
    if (!gesture || gesture.terminal !== "active" || gesture.pointerId !== event.pointerId) return;
    const live = liveRef.current;
    const liveResolved = resolveStickTimelinePose(live.document, live.frameIndex);
    const valid = live.publicationReady && !live.isPlaying && live.activeTool === "Select" &&
      live.workspaceInstanceId === gesture.baseWorkspaceInstanceId && live.document.projectId === gesture.projectId &&
      live.document.documentRevision === gesture.baseRevision && live.workspaceGeneration === gesture.baseWorkspaceGeneration &&
      live.documentDigest === gesture.preStateDigest && live.frameIndex === gesture.selectedFrameIndex &&
      liveResolved?.selectedCell.frameId === gesture.selectedFrameId &&
      liveResolved?.controllingCell.frameId === gesture.controllingFrameId &&
      liveResolved?.controllingFrameIndex === gesture.controllingFrameIndex && liveResolved?.pose.poseId === gesture.poseId;
    if (!valid) {
      clearGesture("cancelled");
      return;
    }
    const to = preview ?? gesture.from;
    gesture.terminal = "committed";
    setPreview(null);
    setActiveJointId(null);
    setGestureState("committed");
    checkpointCallbackRef.current({state: "committed", preview: null});
    if (to.x !== gesture.from.x || to.y !== gesture.from.y) {
      onCompletedJointEdit({...gesture, from: gesture.from, to});
    }
    if (containerRef.current?.hasPointerCapture(event.pointerId)) {
      try { containerRef.current.releasePointerCapture(event.pointerId); } catch {}
    }
    gestureRef.current = null;
  };

  const cancelPointer = (event: React.PointerEvent<HTMLDivElement>) => {
    if (panRef.current?.pointerId === event.pointerId) panRef.current = null;
    clearGesture("cancelled");
  };

  const pointByRole = new Map<StickJointRoleV1, {jointId: string; x: number; y: number}>();
  if (resolved) {
    document.rigs[0].joints.forEach((joint, index) => {
      const canonical = resolved.pose.points[index];
      const point = preview && activeJointId === joint.jointId ? preview : canonical;
      pointByRole.set(joint.role, {jointId: joint.jointId, x: point.x, y: point.y});
    });
  }
  const lineHead = pointByRole.get("head") ? deriveStickLineHead(pointByRole.get("head")!) : null;

  return (
    <div
      ref={containerRef}
      data-testid="stick-canvas"
      data-stick-frame={frameIndex + 1}
      data-gesture-state={gestureState}
      onPointerDown={(event) => {
        if (canvasMovementEnabled) {
          if (event.button !== 0 || !event.isPrimary) return;
          panRef.current = {pointerId: event.pointerId, client: {x: event.clientX, y: event.clientY}, origin: cameraPan};
          try { event.currentTarget.setPointerCapture(event.pointerId); } catch {}
          return;
        }
        if (gestureRef.current || !resolved) return;
        const pointer = projectPointFromClient({x: event.clientX, y: event.clientY}, stage);
        const closest = document.rigs[0].joints
          .map((joint) => ({joint, point: pointByRole.get(joint.role)!}))
          .map((candidate) => ({...candidate, distance: Math.hypot(candidate.point.x - pointer.x, candidate.point.y - pointer.y)}))
          .sort((left, right) => left.distance - right.distance)[0];
        if (closest && closest.distance <= 55) beginJointGesture(event, closest.joint.role, closest.joint.jointId, closest.point);
      }}
      onPointerMove={moveGesture}
      onPointerUp={endGesture}
      onPointerCancel={cancelPointer}
      onLostPointerCapture={(event) => {
        if (gestureRef.current?.pointerId === event.pointerId && gestureRef.current.terminal === "active") clearGesture("cancelled");
      }}
      style={{position: "relative", flex: 1, minWidth: 0, minHeight: 0, overflow: "hidden", background: "#10141b", touchAction: "none"}}
    >
      <svg
        data-testid="stick-stage"
        viewBox={`0 0 ${document.coordinateSpace.width} ${document.coordinateSpace.height}`}
        width={stage.width}
        height={stage.height}
        aria-label={resolved ? `Stick figure on Frame ${frameIndex + 1}` : `Blank Frame ${frameIndex + 1}`}
        style={{position: "fixed", left: stage.left, top: stage.top, background: canvasBackgroundColor, outline: "1px solid rgba(255,255,255,.18)", boxShadow: "0 18px 42px rgba(0,0,0,.28)"}}
      >
        {resolved && STICK_SEGMENT_ROLE_PAIRS.map(([from, to]) => {
          const a = pointByRole.get(from)!;
          const b = pointByRole.get(to)!;
          return <line key={`${from}-${to}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#18202b" strokeWidth="18" strokeLinecap="round" />;
        })}
        {lineHead ? <line data-testid="stick-line-head" x1={lineHead.from.x} y1={lineHead.from.y} x2={lineHead.to.x} y2={lineHead.to.y} stroke="#18202b" strokeWidth="18" strokeLinecap="round" /> : null}
        {resolved && document.rigs[0].joints.map((joint) => {
          const point = pointByRole.get(joint.role)!;
          return (
            <circle
              key={joint.jointId}
              data-testid={`stick-joint-${joint.role}`}
              data-joint-role={joint.role}
              aria-label={`${joint.role} joint`}
              cx={point.x}
              cy={point.y}
              r={38}
              fill="transparent"
              stroke="transparent"
              onPointerDown={(event) => beginJointGesture(event, joint.role, joint.jointId, point)}
              style={{cursor: publicationReady && !isPlaying && activeTool === "Select" && !canvasMovementEnabled ? "grab" : "default"}}
            />
          );
        })}
      </svg>
      {!resolved ? (
        <div data-testid="stick-blank-canvas" style={{position: "absolute", inset: 0, display: "grid", placeItems: "center", color: "rgba(255,255,255,.72)", pointerEvents: "none"}}>
          This frame is blank. Use Start Pose from Previous to begin.
        </div>
      ) : null}
    </div>
  );
}
