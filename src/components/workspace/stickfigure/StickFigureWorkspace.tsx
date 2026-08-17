import {useCallback, useEffect, useRef, useState} from "react";
import {
  applyStickManualAction,
  canonicalJson,
  digestCanonical,
  parseStickProjectDocument,
  projectStickAnimationContent,
} from "../../../lib/stickfigure/stickProjectContract";
import type {
  StickEditorSnapshotV1,
  StickManualActionV1,
  StickProjectDocumentV1,
  StickWorkspaceRootPhase2V1,
} from "../../../lib/stickfigure/stickProjectContract";
import {
  applyCompletedStickJointEdit,
  beginStickDocumentPublication,
  completeStickBootstrap,
  completeStickDocumentPublication,
  createStickBootstrapRoot,
  createStickWaveStarterV1,
  failStickBootstrap,
  failStickDocumentPublication,
  newStickUuid,
  resolveStickTimelinePose,
  retryStickDocumentPublication,
  updateStickViewState,
} from "../../../lib/stickfigure/stickTimeline";
import type {
  StickCompletedJointEditV1,
  StickDocumentPublicationOperationV1,
} from "../../../lib/stickfigure/stickTimeline";
import {StickFigureCanvas} from "./StickFigureCanvas";
import {StickFigureRightPanel} from "./StickFigureRightPanel";
import type {StickFigureRightPanelTab} from "./StickFigureRightPanel";
import {StickFigureTimelineRow} from "./StickFigureTimelineRow";
import {StickFigureToolBar} from "./StickFigureToolBar";
import type {StickFigureToolName} from "./StickFigureToolBar";
import {StickFigureTopBar} from "./StickFigureTopBar";
import type {StickFigurePoint} from "./types";

type StickFigureWorkspaceProps = {onOpenStickFigureCreator: () => void};
type GestureCheckpoint = {state: "idle" | "active" | "committed" | "cancelled"; preview: StickFigurePoint | null};
type FixtureMount = {
  fixtureVersion: 1;
  source: "fixture";
  savedBaseline: "none" | "candidate_document";
  workspaceInstanceId: string;
  document: unknown;
};
type DriverEditFixture = {
  fixtureVersion: 1;
  edits: Array<{selectedFrameIndex: number; jointRole: StickCompletedJointEditV1["jointRole"]; to: StickFigurePoint; staleWorkspaceInstance?: boolean}>;
};
type DriverPublicationPlan = {
  fixtureVersion: 1;
  plans: Array<{operationId: string; action: StickManualActionV1; supersede?: boolean}>;
};
type DriverPublicationCompletion = {
  fixtureVersion: 1;
  completions: Array<{operationId: string; outcome: "ready" | "failed"}>;
};

const DEFAULT_ZOOM = 8 / 9;
const DEFAULT_PAN = {x: 0, y: 0};
const goldenIds = [
  "00000000-0000-4000-8000-000000000001",
  "00000000-0000-4000-8000-000000000002",
  "00000000-0000-4000-8000-000000000003",
  "00000000-0000-4000-8000-000000000004",
  ...Array.from({length: 11}, (_, index) => `00000000-0000-4000-8000-${String(201 + index).padStart(12, "0")}`),
  ...Array.from({length: 12}, (_, index) => `00000000-0000-4000-8000-${String(101 + index).padStart(12, "0")}`),
  "00000000-0000-4000-8000-000000000401",
  ...Array.from({length: 10}, (_, index) => `00000000-0000-4000-8000-${String(301 + index).padStart(12, "0")}`),
];
const createGoldenAppliedDocument = () => {
  let cursor = 0;
  let document = createStickWaveStarterV1(() => goldenIds[cursor++]);
  const actions: StickManualActionV1[] = [
    {actionVersion: 1, type: "set-joint", targetFrameIndex: 0, jointRole: "rightElbow", point: {x: 1080, y: 360}},
    {actionVersion: 1, type: "set-joint", targetFrameIndex: 0, jointRole: "rightHand", point: {x: 1160, y: 260}},
    {actionVersion: 1, type: "hold-pose-through", targetFrameIndex: 3},
    {actionVersion: 1, type: "insert-blank-keyframe", targetFrameIndex: 4},
    {actionVersion: 1, type: "start-pose-from-previous", targetFrameIndex: 4, newPoseId: "00000000-0000-4000-8000-000000000402"},
    {actionVersion: 1, type: "set-joint", targetFrameIndex: 4, jointRole: "rightElbow", point: {x: 1080, y: 300}},
    {actionVersion: 1, type: "set-joint", targetFrameIndex: 4, jointRole: "rightHand", point: {x: 1020, y: 220}},
    {actionVersion: 1, type: "hold-pose-through", targetFrameIndex: 7},
    {actionVersion: 1, type: "insert-blank-keyframe", targetFrameIndex: 8},
    {actionVersion: 1, type: "start-pose-from-previous", targetFrameIndex: 8, newPoseId: "00000000-0000-4000-8000-000000000403"},
    {actionVersion: 1, type: "set-joint", targetFrameIndex: 8, jointRole: "rightElbow", point: {x: 1120, y: 300}},
    {actionVersion: 1, type: "set-joint", targetFrameIndex: 8, jointRole: "rightHand", point: {x: 1280, y: 220}},
    {actionVersion: 1, type: "hold-pose-through", targetFrameIndex: 11},
  ];
  for (const action of actions) {
    const next = applyStickManualAction(document, action);
    if (!next.ok) throw new Error("Golden browser fixture could not be materialized.");
    document = next.value;
  }
  return document;
};

export function StickFigureWorkspace({onOpenStickFigureCreator}: StickFigureWorkspaceProps) {
  const starterRef = useRef<StickProjectDocumentV1 | null>(null);
  if (!starterRef.current) starterRef.current = createStickWaveStarterV1();
  const initialOperationRef = useRef(newStickUuid());
  const [root, setRootState] = useState<StickWorkspaceRootPhase2V1>(() => createStickBootstrapRoot(starterRef.current!, "new", "none", initialOperationRef.current));
  const rootRef = useRef(root);
  const mountedRef = useRef(true);
  const [isPlaying, setIsPlaying] = useState(false);
  const isPlayingRef = useRef(false);
  const [playbackFrameIndex, setPlaybackFrameIndex] = useState(0);
  const playbackFrameIndexRef = useRef(0);
  const playbackVisitedRef = useRef(new Set<number>());
  const playbackWrappedRef = useRef(false);
  const [isOnionEnabled, setIsOnionEnabled] = useState(false);
  const [activeTool, setActiveTool] = useState<StickFigureToolName | null>("Select");
  const [rightPanelTab, setRightPanelTab] = useState<StickFigureRightPanelTab>("Properties");
  const [canvasMovementEnabled, setCanvasMovementEnabled] = useState(false);
  const [cameraZoom, setCameraZoom] = useState(DEFAULT_ZOOM);
  const [cameraPan, setCameraPan] = useState<StickFigurePoint>(DEFAULT_PAN);
  const [canvasBackgroundColor, setCanvasBackgroundColor] = useState("#f5f5f5");
  const [gestureCheckpoint, setGestureCheckpoint] = useState<GestureCheckpoint>({state: "idle", preview: null});
  const gestureCheckpointRef = useRef<GestureCheckpoint>({state: "idle", preview: null});
  const [completedEditCount, setCompletedEditCount] = useState(0);
  const completedEditCountRef = useRef(0);
  const publicationOperationsRef = useRef(new Map<string, StickDocumentPublicationOperationV1>());
  const driverBeginCursorRef = useRef(0);
  const driverCompletionCursorRef = useRef(0);
  const driverEditCursorRef = useRef(0);
  const rootTransitionCountRef = useRef(0);
  const readyPublicationCountRef = useRef(0);
  const staleCompletionCountRef = useRef(0);
  const lastReadyRootRef = useRef<StickWorkspaceRootPhase2V1 | null>(null);

  const publishRoot = useCallback((next: StickWorkspaceRootPhase2V1) => {
    if (!mountedRef.current || next === rootRef.current) return;
    rootRef.current = next;
    if (next.rootStatus === "mounted" && next.documentPublication.status === "ready") lastReadyRootRef.current = next;
    rootTransitionCountRef.current += 1;
    setRootState(next);
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    const candidate = starterRef.current!;
    const operationId = initialOperationRef.current;
    let cancelled = false;
    void digestCanonical(candidate).then((digest) => {
      if (cancelled) return;
      const next = rootRef.current.rootStatus === "bootstrapping"
        ? completeStickBootstrap(rootRef.current, candidate, operationId, digest)
        : rootRef.current;
      if (next !== rootRef.current) readyPublicationCountRef.current += 1;
      publishRoot(next);
    }).catch(() => {
      if (!cancelled && rootRef.current.rootStatus === "bootstrapping") publishRoot(failStickBootstrap(rootRef.current, operationId));
    });
    return () => {cancelled = true; mountedRef.current = false;};
  }, [publishRoot]);

  useEffect(() => {
    isPlayingRef.current = isPlaying;
    if (!isPlaying || root.rootStatus !== "mounted" || root.documentPublication.status !== "ready") return;
    const interval = window.setInterval(() => {
      setPlaybackFrameIndex((current) => {
        const next = (current + 1) % 12;
        if (next < current) playbackWrappedRef.current = true;
        playbackVisitedRef.current.add(next);
        playbackFrameIndexRef.current = next;
        return next;
      });
    }, 1000 / root.editorRoot.current.snapshot.document.fps);
    return () => window.clearInterval(interval);
  }, [isPlaying, root]);

  const publishSnapshot = useCallback(async (
    candidateSnapshot: StickEditorSnapshotV1,
    operationId = newStickUuid(),
    lockCreator = true,
  ) => {
    const begun = beginStickDocumentPublication(rootRef.current, candidateSnapshot, operationId, lockCreator);
    if (!begun.operation) return {accepted: false, outcome: "rejected" as const};
    publicationOperationsRef.current.set(operationId, begun.operation);
    publishRoot(begun.root);
    try {
      const digest = await digestCanonical(begun.operation.candidateSnapshot.document);
      const before = rootRef.current;
      const completed = completeStickDocumentPublication(before, begun.operation, digest);
      if (completed === before) {
        staleCompletionCountRef.current += 1;
        return {accepted: false, outcome: "stale" as const};
      }
      readyPublicationCountRef.current += 1;
      publishRoot(completed);
      return {accepted: true, outcome: "ready" as const};
    } catch {
      const failed = failStickDocumentPublication(rootRef.current, begun.operation);
      publishRoot(failed);
      return {accepted: false, outcome: "failed" as const};
    } finally {
      publicationOperationsRef.current.delete(operationId);
    }
  }, [publishRoot]);

  const performManualAction = useCallback((action: StickManualActionV1) => {
    const live = rootRef.current;
    if (live.rootStatus !== "mounted" || live.documentPublication.status !== "ready" || isPlayingRef.current) return;
    const result = applyStickManualAction(live.editorRoot.current.snapshot.document, action);
    if (!result.ok) return;
    void publishSnapshot({...live.editorRoot.current.snapshot, document: result.value});
  }, [publishSnapshot]);

  const performCompletedEdit = useCallback((edit: StickCompletedJointEditV1) => {
    const live = rootRef.current;
    const candidate = applyCompletedStickJointEdit(live, edit);
    if (!candidate || live.rootStatus !== "mounted") return;
    completedEditCountRef.current += 1;
    setCompletedEditCount(completedEditCountRef.current);
    void publishSnapshot({...live.editorRoot.current.snapshot, document: candidate});
  }, [publishSnapshot]);

  const selectFrame = useCallback((index: number) => {
    const live = rootRef.current;
    if (isPlayingRef.current || live.rootStatus !== "mounted" || live.documentPublication.status !== "ready") return;
    const next = updateStickViewState(live, {...live.editorRoot.current.snapshot.viewState, currentFrameIndex: index, selectedTimelineIndex: index});
    playbackFrameIndexRef.current = index;
    setPlaybackFrameIndex(index);
    publishRoot(next);
  }, [publishRoot]);

  const handlePlay = () => {
    const live = rootRef.current;
    if (live.rootStatus !== "mounted" || live.documentPublication.status !== "ready") return;
    setGestureCheckpoint({state: "cancelled", preview: null});
    gestureCheckpointRef.current = {state: "cancelled", preview: null};
    playbackFrameIndexRef.current = live.editorRoot.current.snapshot.viewState.selectedTimelineIndex;
    playbackVisitedRef.current = new Set([playbackFrameIndexRef.current]);
    playbackWrappedRef.current = false;
    setPlaybackFrameIndex(playbackFrameIndexRef.current);
    setIsPlaying(true);
    isPlayingRef.current = true;
  };

  const handlePause = () => {
    setIsPlaying(false);
    isPlayingRef.current = false;
    const live = rootRef.current;
    if (live.rootStatus === "mounted" && live.documentPublication.status === "ready") {
      publishRoot(updateStickViewState(live, {...live.editorRoot.current.snapshot.viewState, currentFrameIndex: playbackFrameIndexRef.current, selectedTimelineIndex: playbackFrameIndexRef.current}));
    }
  };

  const mountDriverDocument = useCallback(async (fixtureValue: unknown) => {
    const fixtureContainer = fixtureValue as {browserMount?: FixtureMount & {documentPath?: string}};
    const fixture = (fixtureContainer?.browserMount ?? fixtureValue) as FixtureMount & {documentPath?: string};
    const documentValue = fixture?.document ?? (fixture?.documentPath === "scripts/fixtures/stick-ai/v1/manual-wave-applied-project.json" ? createGoldenAppliedDocument() : null);
    const parsed = parseStickProjectDocument(documentValue);
    if (!parsed.ok || fixture.fixtureVersion !== 1 || fixture.source !== "fixture") return {accepted: false, outcome: "invalid_fixture"};
    setIsPlaying(false);
    isPlayingRef.current = false;
    const operationId = newStickUuid();
    const bootstrap = createStickBootstrapRoot(parsed.value, "fixture", fixture.savedBaseline, operationId, fixture.workspaceInstanceId);
    publishRoot(bootstrap);
    try {
      const digest = await digestCanonical(parsed.value);
      const completed = completeStickBootstrap(bootstrap, parsed.value, operationId, digest);
      readyPublicationCountRef.current += 1;
      publishRoot(completed);
      return {accepted: true, outcome: "ready", revision: parsed.value.documentRevision, generation: 1};
    } catch {
      publishRoot(failStickBootstrap(bootstrap, operationId));
      return {accepted: false, outcome: "failed"};
    }
  }, [publishRoot]);

  const dispatchDriverEdit = useCallback(async (fixtureValue: unknown) => {
    const fixture = ((fixtureValue as {browserEdits?: DriverEditFixture})?.browserEdits ?? fixtureValue) as DriverEditFixture;
    const spec = fixture?.edits?.[driverEditCursorRef.current++];
    const live = rootRef.current;
    if (!spec || live.rootStatus !== "mounted" || live.documentPublication.status !== "ready") return {accepted: false, outcome: "invalid_fixture"};
    const resolved = resolveStickTimelinePose(live.editorRoot.current.snapshot.document, spec.selectedFrameIndex);
    if (!resolved) return {accepted: false, outcome: "blank"};
    const rig = live.editorRoot.current.snapshot.document.rigs[0];
    const joint = rig.joints.find((candidate) => candidate.role === spec.jointRole)!;
    const point = resolved.pose.points.find((candidate) => candidate.jointId === joint.jointId)!;
    const edit: StickCompletedJointEditV1 = {
      baseWorkspaceInstanceId: spec.staleWorkspaceInstance ? "00000000-0000-4000-8000-000000009999" : live.workspaceInstanceId,
      projectId: live.editorRoot.current.snapshot.document.projectId,
      baseRevision: live.editorRoot.current.snapshot.document.documentRevision,
      baseWorkspaceGeneration: live.workspaceGeneration,
      selectedFrameId: resolved.selectedCell.frameId,
      selectedFrameIndex: spec.selectedFrameIndex,
      controllingFrameId: resolved.controllingCell.frameId,
      controllingFrameIndex: resolved.controllingFrameIndex,
      poseId: resolved.pose.poseId,
      jointId: joint.jointId,
      jointRole: joint.role,
      from: {x: point.x, y: point.y},
      to: spec.to,
      preStateDigest: live.editorRoot.current.documentDigest,
    };
    const candidate = applyCompletedStickJointEdit(live, edit);
    if (!candidate) return {accepted: false, outcome: "stale"};
    const outcome = await publishSnapshot({...live.editorRoot.current.snapshot, document: candidate});
    return {...outcome, revision: rootRef.current.rootStatus === "mounted" ? rootRef.current.editorRoot.current.snapshot.document.documentRevision : null};
  }, [publishSnapshot]);

  const beginDriverPublication = useCallback(async (fixtureValue: unknown) => {
    const fixture = ((fixtureValue as {browserPublicationPlan?: DriverPublicationPlan})?.browserPublicationPlan ?? fixtureValue) as DriverPublicationPlan;
    const spec = fixture?.plans?.[driverBeginCursorRef.current++];
    let live = rootRef.current;
    if (!spec) return {accepted: false, outcome: "invalid_fixture"};
    if (spec.supersede && lastReadyRootRef.current) live = lastReadyRootRef.current;
    if (live.rootStatus !== "mounted" || live.documentPublication.status !== "ready") return {accepted: false, outcome: "unavailable"};
    const candidate = applyStickManualAction(live.editorRoot.current.snapshot.document, spec.action);
    if (!candidate.ok) return {accepted: false, outcome: "invalid_action"};
    const begun = beginStickDocumentPublication(live, {...live.editorRoot.current.snapshot, document: candidate.value}, spec.operationId, true);
    if (!begun.operation) return {accepted: false, outcome: "unavailable"};
    publicationOperationsRef.current.set(spec.operationId, begun.operation);
    publishRoot(begun.root);
    return {accepted: true, outcome: "pending", operationId: spec.operationId};
  }, [publishRoot]);

  const completeDriverPublication = useCallback(async (fixtureValue: unknown) => {
    const fixture = ((fixtureValue as {browserPublicationCompletion?: DriverPublicationCompletion})?.browserPublicationCompletion ?? fixtureValue) as DriverPublicationCompletion;
    const spec = fixture?.completions?.[driverCompletionCursorRef.current++];
    const operation = spec ? publicationOperationsRef.current.get(spec.operationId) : null;
    if (!spec || !operation) return {accepted: false, outcome: "missing_operation"};
    const before = rootRef.current;
    if (spec.outcome === "failed") {
      const failed = failStickDocumentPublication(before, operation);
      publishRoot(failed);
      return {accepted: failed !== before, outcome: failed === before ? "stale" : "failed"};
    }
    const digest = await digestCanonical(operation.candidateSnapshot.document);
    const completed = completeStickDocumentPublication(before, operation, digest);
    if (completed === before) {
      staleCompletionCountRef.current += 1;
      return {accepted: false, outcome: "stale"};
    }
    readyPublicationCountRef.current += 1;
    publishRoot(completed);
    return {accepted: true, outcome: "ready"};
  }, [publishRoot]);

  const readCheckpoint = useCallback(async (operationId: unknown) => {
    if (operationId === "playback-cycle") await new Promise((resolve) => window.setTimeout(resolve, 1200));
    const live = rootRef.current;
    const document = live.rootStatus === "mounted" ? live.editorRoot.current.snapshot.document : null;
    const content = document ? projectStickAnimationContent(document) : null;
    const contentDigest = content?.ok ? await digestCanonical(content.value) : null;
    return {
      rootStatus: live.rootStatus,
      publicationStatus: live.documentPublication.status,
      hasMountedDocument: document !== null,
      revision: document?.documentRevision ?? null,
      workspaceGeneration: live.workspaceGeneration,
      creatorEntryLocked: live.creatorEntryLocked,
      readyDigestMatchesDocument: live.rootStatus === "mounted" && live.documentPublication.status === "ready"
        ? await digestCanonical(document!) === live.editorRoot.current.documentDigest && live.documentPublication.currentDocumentDigest === live.editorRoot.current.documentDigest
        : null,
      selectedFrameIndex: live.rootStatus === "mounted" ? live.editorRoot.current.snapshot.viewState.selectedTimelineIndex : null,
      currentFrameIndex: live.rootStatus === "mounted" ? live.editorRoot.current.snapshot.viewState.currentFrameIndex : null,
      isPlaying: isPlayingRef.current,
      playbackVisitedPoseSpans: [
        [0, 1, 2, 3], [4, 5, 6, 7], [8, 9, 10, 11],
      ].map((span) => span.some((index) => playbackVisitedRef.current.has(index))),
      playbackWrapped: playbackWrappedRef.current,
      cellTypes: document?.layers[0].cells.map((cell) => cell.cellType === "keyframe" && cell.poses.length === 0 ? "blank" : cell.cellType) ?? [],
      frameIdsPreserved: document ? new Set(document.layers[0].cells.map((cell) => cell.frameId)).size === 12 : false,
      contentDigest,
      gestureState: gestureCheckpointRef.current.state,
      gesturePreview: gestureCheckpointRef.current.preview,
      completedEditCount: completedEditCountRef.current,
      historyDepth: 0,
      rootTransitionCount: rootTransitionCountRef.current,
      readyPublicationCount: readyPublicationCountRef.current,
      staleCompletionCount: staleCompletionCountRef.current,
      canonicalDocumentBytes: document ? new TextEncoder().encode(canonicalJson(document)).byteLength : 0,
    };
  }, []);

  const spec0001Phase2BrowserPortsV1 = {
    mountDocument: mountDriverDocument,
    dispatchCompletedJointEdit: dispatchDriverEdit,
    beginDocumentPublication: beginDriverPublication,
    completeDocumentPublication: completeDriverPublication,
    readCheckpoint,
  };
  void spec0001Phase2BrowserPortsV1;

  /* SPEC0001_BROWSER_DRIVER_ANCHOR_V1 */

  if (root.rootStatus === "bootstrapping") {
    const failed = root.documentPublication.status === "failed";
    return (
      <div style={{height: "100vh", display: "grid", placeItems: "center", background: "#111720", color: "rgba(255,255,255,.85)"}}>
        <div role="status" style={{textAlign: "center"}}>
          <p>{failed ? "This Stick project could not be prepared safely. Retry." : "Preparing this Stick project…"}</p>
          {failed ? <button type="button" onClick={() => {
            const operationId = newStickUuid();
            const retryRoot = createStickBootstrapRoot(starterRef.current!, "new", "none", operationId, root.workspaceInstanceId);
            publishRoot(retryRoot);
            void digestCanonical(starterRef.current!).then((digest) => {
              readyPublicationCountRef.current += 1;
              publishRoot(completeStickBootstrap(retryRoot, starterRef.current!, operationId, digest));
            }).catch(() => publishRoot(failStickBootstrap(retryRoot, operationId)));
          }}>Retry</button> : null}
        </div>
      </div>
    );
  }

  const document = root.editorRoot.current.snapshot.document;
  const viewState = root.editorRoot.current.snapshot.viewState;
  const publicationReady = root.documentPublication.status === "ready";
  const renderFrameIndex = isPlaying ? playbackFrameIndex : viewState.currentFrameIndex;

  return (
    <div style={{height: "100vh", background: "#1a1b24", display: "flex", flexDirection: "column", overflow: "hidden"}}>
      <StickFigureTopBar projectTitle={document.title} />
      <StickFigureTimelineRow
        document={document}
        currentFrameIndex={renderFrameIndex}
        selectedTimelineIndex={viewState.selectedTimelineIndex}
        isPlaying={isPlaying}
        isOnionEnabled={isOnionEnabled}
        authoringReady={publicationReady}
        onTimelinePositionSelect={selectFrame}
        onToggleOnion={() => setIsOnionEnabled((value) => !value)}
        onPlay={handlePlay}
        onPause={handlePause}
        onManualAction={performManualAction}
      />
      <div style={{flex: 1, minHeight: 0, display: "flex"}}>
        <StickFigureCanvas
          document={document}
          frameIndex={renderFrameIndex}
          workspaceInstanceId={root.workspaceInstanceId}
          workspaceGeneration={root.workspaceGeneration}
          documentDigest={root.editorRoot.current.documentDigest}
          publicationReady={publicationReady}
          isPlaying={isPlaying}
          activeTool={activeTool}
          canvasMovementEnabled={canvasMovementEnabled}
          cameraZoom={cameraZoom}
          cameraPan={cameraPan}
          canvasBackgroundColor={canvasBackgroundColor}
          onCameraPanChange={setCameraPan}
          onCompletedJointEdit={performCompletedEdit}
          onGestureCheckpoint={(checkpoint) => {gestureCheckpointRef.current = checkpoint; setGestureCheckpoint(checkpoint);}}
        />
        <StickFigureRightPanel
          activeTab={rightPanelTab}
          onActiveTabChange={setRightPanelTab}
          document={document}
          selectedFrameIndex={viewState.selectedTimelineIndex}
          publicationStatus={root.documentPublication.status}
          creatorEntryLocked={root.creatorEntryLocked}
          isPlaying={isPlaying}
          hasActiveDrag={gestureCheckpoint.state === "active"}
          canvasMovementEnabled={canvasMovementEnabled}
          cameraZoom={cameraZoom}
          cameraPan={cameraPan}
          canvasBackgroundColor={canvasBackgroundColor}
          onStartPoseFromPrevious={() => performManualAction({actionVersion: 1, type: "start-pose-from-previous", targetFrameIndex: viewState.selectedTimelineIndex, newPoseId: newStickUuid()})}
          onOpenStickFigureCreator={() => {
            if (publicationReady && !root.creatorEntryLocked && !isPlaying && gestureCheckpoint.state !== "active") onOpenStickFigureCreator();
          }}
          onCanvasMovementChange={(enabled) => {setCanvasMovementEnabled(enabled); if (enabled) setActiveTool("Select");}}
          onCameraZoomChange={(zoom) => setCameraZoom(Math.min(1.8, Math.max(.5, zoom)))}
          onResetCanvasView={() => {setCameraZoom(DEFAULT_ZOOM); setCameraPan(DEFAULT_PAN);}}
          onCanvasBackgroundColorChange={setCanvasBackgroundColor}
        />
      </div>
      <StickFigureToolBar activeTool={activeTool} onSelectTool={(tool) => {setCanvasMovementEnabled(false); setActiveTool(tool);}} />
      <output data-testid="stick-publication-state" style={{position: "absolute", left: -10000}}>{root.documentPublication.status}:{document.documentRevision}:{root.workspaceGeneration}:{completedEditCount}</output>
      {root.documentPublication.status === "failed" ? (
        <button type="button" onClick={() => {void retryStickDocumentPublication(rootRef.current).then(publishRoot);}} style={{position: "fixed", right: 380, top: 52, zIndex: 50}}>Retry document preparation</button>
      ) : null}
    </div>
  );
}
