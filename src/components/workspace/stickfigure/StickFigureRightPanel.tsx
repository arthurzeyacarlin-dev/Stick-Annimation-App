import type {ReactNode} from "react";
import type {StickProjectDocumentV1} from "../../../lib/stickfigure/stickProjectContract";
import {nextManualWaveActionAvailability, resolveStickTimelinePose} from "../../../lib/stickfigure/stickTimeline";
import {DrawingAiPanel} from "../ai/DrawingAiPanel";
import type {StickFigurePoint} from "./types";

const PANEL_TABS = ["Properties", "Tools", "Library", "Assets"] as const;
export type StickFigureRightPanelTab = (typeof PANEL_TABS)[number];

type StickFigureRightPanelProps = {
  activeTab: StickFigureRightPanelTab;
  onActiveTabChange: (tab: StickFigureRightPanelTab) => void;
  document: StickProjectDocumentV1;
  selectedFrameIndex: number;
  publicationStatus: "ready" | "pending" | "failed";
  creatorEntryLocked: boolean;
  isPlaying: boolean;
  hasActiveDrag: boolean;
  canvasMovementEnabled: boolean;
  cameraZoom: number;
  cameraPan: StickFigurePoint;
  canvasBackgroundColor: string;
  onStartPoseFromPrevious: () => void;
  onOpenStickFigureCreator: () => void;
  onCanvasMovementChange: (enabled: boolean) => void;
  onCameraZoomChange: (zoom: number) => void;
  onResetCanvasView: () => void;
  onCanvasBackgroundColorChange: (color: string) => void;
};

export function StickFigureRightPanel({
  activeTab,
  onActiveTabChange,
  document,
  selectedFrameIndex,
  publicationStatus,
  creatorEntryLocked,
  isPlaying,
  hasActiveDrag,
  canvasMovementEnabled,
  cameraZoom,
  cameraPan,
  canvasBackgroundColor,
  onStartPoseFromPrevious,
  onOpenStickFigureCreator,
  onCanvasMovementChange,
  onCameraZoomChange,
  onResetCanvasView,
  onCanvasBackgroundColorChange,
}: StickFigureRightPanelProps) {
  const resolved = resolveStickTimelinePose(document, selectedFrameIndex);
  const selectedCell = document.layers[0].cells[selectedFrameIndex];
  const startEnabled = publicationStatus === "ready" && !isPlaying && nextManualWaveActionAvailability(document).startFromPrevious.includes(selectedFrameIndex);
  const creatorEnabled = publicationStatus === "ready" && !creatorEntryLocked && !isPlaying && !hasActiveDrag;
  const guidance = publicationStatus === "pending"
    ? "Preparing this Stick project…"
    : publicationStatus === "failed"
      ? "This Stick project could not be prepared safely. Retry."
      : selectedCell.cellType === "keyframe" && selectedCell.poses.length === 0
        ? "This keyframe is blank. Start this body position from the previous pose."
        : resolved && selectedCell.cellType === "hold"
          ? `Editing the keyframe used by Frames ${resolved.spanStartIndex + 1}–${resolved.spanEndIndex + 1}.`
          : resolved
            ? "Drag any joint to adjust this body position."
            : "Select a nonblank keyframe or held frame to edit its pose.";

  return (
    <aside aria-label="Stick figure right panel" style={{width: "min(360px, 38vw)", minWidth: 280, flexShrink: 0, borderLeft: "1px solid rgba(255,255,255,.1)", background: "#171c25", color: "rgba(255,255,255,.86)", display: "flex", flexDirection: "column"}}>
      <div role="tablist" aria-label="Stick figure panel tabs" style={{display: "grid", gridTemplateColumns: "repeat(4, 1fr)", borderBottom: "1px solid rgba(255,255,255,.09)"}}>
        {PANEL_TABS.map((tab) => (
          <button key={tab} type="button" aria-pressed={activeTab === tab} aria-label={tab === "Tools" ? "Stick Figure Tools" : `Stick Figure ${tab}`} onClick={() => onActiveTabChange(tab)} style={{padding: "12px 4px", border: 0, borderBottom: activeTab === tab ? "2px solid #78b7ff" : "2px solid transparent", background: "transparent", color: activeTab === tab ? "white" : "rgba(255,255,255,.55)", cursor: "pointer"}}>{tab}</button>
        ))}
      </div>
      <div style={{padding: 16, overflowY: "auto", display: "flex", flex: "0 0 48%", minHeight: 0, flexDirection: "column", gap: 14, borderBottom: "1px solid rgba(255,255,255,.09)"}}>
        {activeTab === "Properties" ? (
          <>
            <PanelCard title={`Frame ${selectedFrameIndex + 1}`}>
              <p data-testid="stick-edit-guidance" style={copyStyle}>{guidance}</p>
              <button type="button" disabled={!startEnabled} onClick={onStartPoseFromPrevious} style={primaryButton(startEnabled)}>Start Pose from Previous</button>
            </PanelCard>
            <PanelCard title="Canvas view">
              <label style={labelStyle}>Zoom {Math.round(cameraZoom * 100)}%</label>
              <input aria-label="Stick canvas zoom" type="range" min="50" max="180" value={Math.round(cameraZoom * 100)} onChange={(event) => onCameraZoomChange(Number(event.target.value) / 100)} />
              <label style={{...labelStyle, display: "flex", alignItems: "center", gap: 8}}><input type="checkbox" aria-label="Pan canvas" checked={canvasMovementEnabled} onChange={(event) => onCanvasMovementChange(event.target.checked)} /> Pan canvas</label>
              <button type="button" onClick={onResetCanvasView} style={secondaryButton(true)}>Reset view ({Math.round(cameraPan.x)}, {Math.round(cameraPan.y)})</button>
              <label style={labelStyle}>Canvas background <input aria-label="Canvas background" type="color" value={canvasBackgroundColor} onChange={(event) => onCanvasBackgroundColorChange(event.target.value)} /></label>
            </PanelCard>
          </>
        ) : null}
        {activeTab === "Tools" ? (
          <>
            <PanelCard title="Structure">
              <p style={copyStyle}>The fixed humanoid-11-v1 figure is ready. Topology changes are unavailable in this version.</p>
              <button type="button" disabled title="Add Limb is unavailable for the fixed Phase 2 figure." style={secondaryButton(false)}>Add Limb — unavailable</button>
              <button type="button" disabled title="Clear Canvas is unavailable because it would remove the fixed figure." style={secondaryButton(false)}>Clear Canvas — unavailable</button>
            </PanelCard>
            <PanelCard title="Creator">
              <button type="button" aria-label="Create New Stick Figure" disabled={!creatorEnabled} onClick={onOpenStickFigureCreator} style={primaryButton(creatorEnabled)}>Create New Stick Figure</button>
              <p data-testid="stick-creator-copy" style={copyStyle}>{creatorEntryLocked
                ? "Creator opens a separate workspace and cannot return to this Workspace session. Return Home and start a new Stick project to use Creator."
                : "Creator is available before the first edit. It opens a separate workspace."}</p>
            </PanelCard>
          </>
        ) : null}
        {activeTab === "Library" ? <PanelCard title="Library"><p style={copyStyle}>Figure libraries and Creator Save are unavailable in this version.</p></PanelCard> : null}
        {activeTab === "Assets" ? <PanelCard title="Assets"><p style={copyStyle}>Props, shapes, and additional figures are unavailable in this version.</p></PanelCard> : null}
      </div>
      <DrawingAiPanel readOnly />
    </aside>
  );
}

function PanelCard({title, children}: {title: string; children: ReactNode}) {
  return <section style={{border: "1px solid rgba(255,255,255,.1)", borderRadius: 10, padding: 13, background: "rgba(255,255,255,.025)", display: "flex", flexDirection: "column", gap: 10}}><h3 style={{fontSize: 13, margin: 0}}>{title}</h3>{children}</section>;
}

const copyStyle = {fontSize: 12, lineHeight: 1.45, color: "rgba(255,255,255,.65)", margin: 0} as const;
const labelStyle = {fontSize: 12, color: "rgba(255,255,255,.7)"} as const;
const primaryButton = (enabled: boolean) => ({border: "1px solid rgba(120,183,255,.35)", borderRadius: 8, padding: "9px 10px", background: enabled ? "rgba(80,145,220,.22)" : "rgba(255,255,255,.035)", color: enabled ? "white" : "rgba(255,255,255,.36)", cursor: enabled ? "pointer" : "default"} as const);
const secondaryButton = (enabled: boolean) => ({border: "1px solid rgba(255,255,255,.12)", borderRadius: 8, padding: "8px 10px", background: "rgba(255,255,255,.04)", color: enabled ? "rgba(255,255,255,.8)" : "rgba(255,255,255,.36)", cursor: enabled ? "pointer" : "default"} as const);
