import {useEffect, useMemo, useRef, useState} from "react";
import type {StickManualActionV1, StickProjectDocumentV1, StickTimelineCellV1} from "../../../lib/stickfigure/stickProjectContract";
import {nextManualWaveActionAvailability} from "../../../lib/stickfigure/stickTimeline";

export type TimelineFrameKind = "frame" | "keyframe" | "tween";
export type TimelineFrameCellType = "empty" | "keyframe" | "blank-keyframe" | "hold" | "tween";
export type TimelineFrame = {id: number; kind: TimelineFrameKind; cellType: TimelineFrameCellType; stateId: number; isBlank: boolean; hasTweenEndpoint: boolean};
export type TimelineLayer = {id: string; name: string; frames: TimelineFrame[]};

type StickFigureTimelineRowProps = {
  document: StickProjectDocumentV1;
  currentFrameIndex: number;
  selectedTimelineIndex: number;
  isPlaying: boolean;
  isOnionEnabled: boolean;
  authoringReady: boolean;
  onTimelinePositionSelect: (index: number) => void;
  onToggleOnion: () => void;
  onPlay: () => void;
  onPause: () => void;
  onManualAction: (action: StickManualActionV1) => void;
};

const cellKind = (cell: StickTimelineCellV1) => cell.cellType === "keyframe"
  ? cell.poses.length === 0 ? "blank keyframe" : "keyframe"
  : cell.cellType === "hold" ? "held frame" : "empty frame";

export function StickFigureTimelineRow({
  document,
  currentFrameIndex,
  selectedTimelineIndex,
  isPlaying,
  isOnionEnabled,
  authoringReady,
  onTimelinePositionSelect,
  onToggleOnion,
  onPlay,
  onPause,
  onManualAction,
}: StickFigureTimelineRowProps) {
  const [menuIndex, setMenuIndex] = useState<number | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const availability = useMemo(() => nextManualWaveActionAvailability(document), [document]);
  const cells = document.layers[0].cells;

  useEffect(() => {
    if (menuIndex === null) return;
    const close = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setMenuIndex(null);
    };
    globalThis.document.addEventListener("pointerdown", close);
    return () => globalThis.document.removeEventListener("pointerdown", close);
  }, [menuIndex]);

  const run = (action: StickManualActionV1) => {
    setMenuIndex(null);
    onManualAction(action);
  };

  return (
    <section aria-label="Stick figure timeline" style={{height: 150, flexShrink: 0, background: "#151a22", borderBottom: "1px solid rgba(255,255,255,.09)", display: "flex", flexDirection: "column"}}>
      <div style={{height: 46, display: "flex", alignItems: "center", gap: 8, padding: "0 14px", color: "rgba(255,255,255,.84)"}}>
        <button type="button" aria-label={isPlaying ? "Pause" : "Play"} onClick={isPlaying ? onPause : onPlay} disabled={!authoringReady} style={controlStyle(authoringReady)}>
          {isPlaying ? "Pause" : "Play"}
        </button>
        <button type="button" aria-label="Onion skin" aria-pressed={isOnionEnabled} onClick={onToggleOnion} style={controlStyle(true)}>Onion {isOnionEnabled ? "on" : "off"}</button>
        <span data-testid="stick-fps" style={{fontSize: 12, padding: "6px 10px", borderRadius: 7, background: "rgba(255,255,255,.05)"}}>{document.fps} FPS</span>
        <button type="button" disabled title="Multiple layers are unavailable in this version." style={controlStyle(false)}>Add Layer</button>
        <button type="button" disabled title="Layer removal is unavailable in this version." style={controlStyle(false)}>Remove Layer</button>
        <span style={{marginLeft: "auto", fontSize: 12, color: "rgba(255,255,255,.58)"}}>12 addressable timeline cells</span>
      </div>
      <div style={{display: "flex", alignItems: "stretch", gap: 6, padding: "7px 14px 12px", overflowX: "auto"}}>
        {cells.map((cell, index) => {
          const selected = selectedTimelineIndex === index;
          const current = currentFrameIndex === index;
          return (
            <div key={cell.frameId} style={{position: "relative", flex: "1 0 70px", minWidth: 62}}>
              <button
                type="button"
                data-testid={`stick-frame-${index + 1}`}
                aria-label={`Frame ${index + 1}, ${cellKind(cell)}`}
                onClick={() => onTimelinePositionSelect(index)}
                onContextMenu={(event) => {event.preventDefault(); onTimelinePositionSelect(index); setMenuIndex(index);}}
                disabled={!authoringReady && !isPlaying}
                style={{
                  width: "100%", height: 64, borderRadius: 8,
                  border: selected ? "2px solid #7cb8ff" : current ? "2px solid #f0cf76" : "1px solid rgba(255,255,255,.14)",
                  background: cell.cellType === "keyframe" ? cell.poses.length ? "rgba(78,130,190,.32)" : "rgba(255,255,255,.04)" : cell.cellType === "hold" ? "rgba(78,130,190,.14)" : "rgba(255,255,255,.025)",
                  color: "rgba(255,255,255,.86)", cursor: authoringReady || isPlaying ? "pointer" : "default", padding: 5,
                }}
              >
                <strong style={{display: "block", fontSize: 13}}>Frame {index + 1}</strong>
                <span style={{display: "block", marginTop: 5, fontSize: 10, color: "rgba(255,255,255,.62)"}}>{cellKind(cell)}</span>
              </button>
              <button
                type="button"
                data-testid={`stick-frame-actions-${index + 1}`}
                aria-label={`Frame ${index + 1} actions`}
                onClick={() => {onTimelinePositionSelect(index); setMenuIndex(index);}}
                disabled={!authoringReady}
                style={{position: "absolute", right: 3, top: 3, width: 22, height: 20, border: 0, borderRadius: 5, background: "rgba(0,0,0,.32)", color: "white", cursor: authoringReady ? "pointer" : "default"}}
              >•••</button>
              {menuIndex === index ? (
                <div ref={menuRef} role="menu" aria-label={`Frame ${index + 1} actions menu`} style={{position: "absolute", zIndex: 30, left: 0, top: 70, minWidth: 230, padding: 6, border: "1px solid rgba(255,255,255,.15)", borderRadius: 8, background: "#202631", boxShadow: "0 14px 32px rgba(0,0,0,.42)"}}>
                  <MenuButton label="Hold Pose Through This Frame" enabled={availability.holdThrough.includes(index)} onClick={() => run({actionVersion: 1, type: "hold-pose-through", targetFrameIndex: index})} />
                  <MenuButton label="Insert Blank Keyframe" enabled={availability.insertBlank.includes(index)} onClick={() => run({actionVersion: 1, type: "insert-blank-keyframe", targetFrameIndex: index})} />
                  <MenuButton label="Insert Keyframe — unavailable" enabled={false} />
                  <MenuButton label="Remove Frame — unavailable" enabled={false} />
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function MenuButton({label, enabled, onClick}: {label: string; enabled: boolean; onClick?: () => void}) {
  return <button type="button" role="menuitem" disabled={!enabled} onClick={onClick} title={enabled ? undefined : "This action is unavailable for the current wave step."} style={{width: "100%", border: 0, borderRadius: 6, padding: "8px 9px", textAlign: "left", background: "transparent", color: enabled ? "rgba(255,255,255,.9)" : "rgba(255,255,255,.38)", cursor: enabled ? "pointer" : "default"}}>{label}</button>;
}

const controlStyle = (enabled: boolean) => ({border: "1px solid rgba(255,255,255,.14)", borderRadius: 7, padding: "6px 10px", background: enabled ? "rgba(255,255,255,.07)" : "rgba(255,255,255,.025)", color: enabled ? "rgba(255,255,255,.88)" : "rgba(255,255,255,.38)", cursor: enabled ? "pointer" : "default"} as const);
