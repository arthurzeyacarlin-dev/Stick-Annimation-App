"use client";
import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent, ReactNode, RefObject } from "react";
import type { SceneForPage } from "@/src/lib/animator/stageFit";
import type { EngineDrawingBridge } from "./ai/engineDrawingBridge";

import { DrawingAiPanel } from "./ai/DrawingAiPanel";
import type { DrawingAiActionPlan, DrawingAiProjectMemory, DrawingAiWorkspaceContext } from "@/src/lib/ai/drawingAiContract";
import type { GeneratedFrameRenderResult } from "@/src/lib/ai/drawingFrameExecutor";

export type DrawingRightPanelTab = "Properties" | "Assets" | "Library";

export type BrushToolVariant = "Brush" | "Pixelate" | "Sketch" | "Pencil" | "Glow";

const RIGHT_PANEL_TABS: DrawingRightPanelTab[] = ["Properties", "Library", "Assets"];
const BRUSH_TOOLS: BrushToolVariant[] = ["Brush", "Pixelate", "Sketch", "Pencil", "Glow"];

// Phones and tablets: the bottom sheet's three sizes. The AI chat opens full, the other tabs half; each remembers the
// last size the user chose (this browser only — a convenience, not project data).
type SheetSize = "small" | "half" | "full";
const SHEET_TOP_GAP_PX = 12; // full size stops just under the timeline, so it is not a wall of settings
const SHEET_SIZES_KEY = "diamond.phoneSheetSizes.v1";
const isSheetSize = (value: unknown): value is SheetSize => value === "small" || value === "half" || value === "full";
function readSheetSizes(): { ai: SheetSize; panels: SheetSize; last: SheetSize } {
  const fallback = { ai: "full" as SheetSize, panels: "half" as SheetSize, last: "half" as SheetSize };
  if (typeof window === "undefined") return fallback;
  try {
    const saved = JSON.parse(window.localStorage.getItem(SHEET_SIZES_KEY) ?? "{}") as Record<string, unknown>;
    return {
      ai: isSheetSize(saved.ai) && saved.ai !== "small" ? saved.ai : fallback.ai,
      panels: isSheetSize(saved.panels) && saved.panels !== "small" ? saved.panels : fallback.panels,
      last: isSheetSize(saved.last) ? saved.last : fallback.last,
    };
  } catch { return fallback; }
}
const TIMELINE_BASE_KEY = "diamond.phoneTimelineBase.v1";
function readTimelineBase(): number {
  try { return Number(window.localStorage.getItem(TIMELINE_BASE_KEY)) || 0; } catch { return 0; }
}
function writeTimelineBase(px: number) {
  try { window.localStorage.setItem(TIMELINE_BASE_KEY, String(px)); } catch { /* not remembered */ }
}
function writeSheetSize(forAi: boolean, size: SheetSize) {
  try {
    const saved = readSheetSizes();
    window.localStorage.setItem(SHEET_SIZES_KEY, JSON.stringify({ ...saved, [forAi ? "ai" : "panels"]: size, last: size === "full" ? "half" : size }));
  } catch { /* storage blocked: sizes just are not remembered */ }
}

type DrawingRightPanelProps = {
  rightPanelRef: RefObject<HTMLDivElement | null>;
  rightPanelTabsRef: RefObject<HTMLDivElement | null>;
  rightPanelTab: DrawingRightPanelTab;
  onRightPanelTabChange: (tab: DrawingRightPanelTab) => void;
  rightPanelContent: ReactNode;
  fileDragActive?: boolean;
  showBrushToolsMenu: boolean;
  brushToolsMenuRef: RefObject<HTMLDivElement | null>;
  brushToolsMenuPosition: { left: number; width: number; top: number } | null;
  brushToolVariant: BrushToolVariant;
  onBrushToolSelect: (tool: BrushToolVariant) => void;
  panelWidth: number;
  panelMinWidth: number;
  panelMaxWidth: number;
  panelDefaultWidth: number;
  panelResizing: boolean;
  onPanelResizePointerDown: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onPanelResizePointerMove: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onPanelResizePointerEnd: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onPanelResizeKeyDown: (event: ReactKeyboardEvent<HTMLDivElement>) => void;
  onPanelResizeReset: () => void;
  workspaceContext?: DrawingAiWorkspaceContext | null;
  projectAiMemory?: DrawingAiProjectMemory | null;
  onProjectAiMemoryChange?: (memory: DrawingAiProjectMemory | null) => void;
  onApplyGeneratedFrame?: (
    result: GeneratedFrameRenderResult,
    source: { prompt: string; response: string },
  ) => Promise<boolean> | boolean;
  onExecuteActionPlan?: (actionPlan: NonNullable<DrawingAiActionPlan>) => Promise<boolean> | boolean;
  onApplyAnimatorScene?: (scene: SceneForPage) => boolean;
  engineDrawing?: EngineDrawingBridge;
};

export function DrawingRightPanel({
  rightPanelRef,
  rightPanelTabsRef,
  rightPanelTab,
  onRightPanelTabChange,
  rightPanelContent,
  fileDragActive = false,
  showBrushToolsMenu,
  brushToolsMenuRef,
  brushToolsMenuPosition,
  brushToolVariant,
  onBrushToolSelect,
  panelWidth,
  panelMinWidth,
  panelMaxWidth,
  panelDefaultWidth,
  panelResizing,
  onPanelResizePointerDown,
  onPanelResizePointerMove,
  onPanelResizePointerEnd,
  onPanelResizeKeyDown,
  onPanelResizeReset,
  workspaceContext = null,
  projectAiMemory = null,
  onProjectAiMemoryChange,
  onApplyGeneratedFrame,
  onExecuteActionPlan,
  onApplyAnimatorScene,
  engineDrawing,
}: DrawingRightPanelProps) {
  // SPEC-0022 Phase 4: the AI Animator is a fourth tab with the whole panel (it no longer sits in the bottom corner).
  // Phones (≤ 640 px) open on the AI Animator tab: tell it what you want instead of drawing frame by frame.
  const [aiTabActive, setAiTabActive] = useState(() => typeof window !== "undefined" && window.innerWidth <= 640);
  // Phones and tablets: like the computer, the panel is always there and one tab is always selected (no hide button).
  const [seenPanelTab, setSeenPanelTab] = useState(rightPanelTab);
  if (seenPanelTab !== rightPanelTab) { setSeenPanelTab(rightPanelTab); setAiTabActive(false); }
  // Phones and tablets (Arthur 2026-10-24: "so cramped"): the panel is a sheet with three sizes that slides OVER the canvas
  // — the canvas never changes size (Arthur). Small = tabs only, half = up to the canvas's bottom edge, full = up to just
  // under the timeline (a small gap stays). Drag the sheet's top edge or tap a tab. Computers ignore all of this.
  // Phone layout (Arthur 2026-10-28): the panel starts closed so the canvas is free; tap a chip to open it.
  const [sheetSize, setSheetSize] = useState<SheetSize>("small");
  const sheetRef = useRef<HTMLDivElement | null>(null);
  const suppressTabClickRef = useRef(false);
  const [sheetLiveHeight, setSheetLiveHeight] = useState<number | null>(null);
  const [sheetHeights, setSheetHeights] = useState<Record<SheetSize, number> | null>(null);
  const measureSheetHeights = (): Record<SheetSize, number> | null => {
    const sheet = sheetRef.current;
    const split = sheet?.parentElement;
    const tabs = sheet?.querySelector<HTMLElement>(".da-sheet-tabs");
    const host = split?.querySelector<HTMLElement>('[data-workspace-canvas-host="true"]');
    if (!sheet || !split || !tabs || !host || getComputedStyle(sheet).display === "contents") return null;
    // The canvas is anchored (Arthur): its area starts where a one-layer timeline ends, wherever the timeline grows to.
    // A taller timeline (more layers) slides over the canvas; full size always stops at the timeline's real bottom.
    const timeline = document.querySelector<HTMLElement>(".drawing-timeline");
    const splitBox = split.getBoundingClientRect();
    let timelineBase = readTimelineBase();
    let timelineBottom = splitBox.top;
    if (timeline) {
      const timelineBox = timeline.getBoundingClientRect();
      timelineBottom = timelineBox.bottom;
      // The one-layer timeline height is the canvas's fixed starting line; remember it whenever one layer shows.
      const rowTops = new Set([...timeline.querySelectorAll<HTMLElement>("[data-timeline-layer-row]")].map((row) => Math.round(row.getBoundingClientRect().top / 4)));
      if (rowTops.size === 1) { timelineBase = Math.round(timelineBox.height); writeTimelineBase(timelineBase); }
      else if (!timelineBase) timelineBase = Math.round(timelineBox.height); // opened with many layers first: best guess until one shows
    }
    split.style.setProperty("--da-timeline-base", `${timelineBase}px`);
    const topbar = document.querySelector<HTMLElement>(".drawing-topbar");
    if (timeline?.parentElement && topbar) timeline.parentElement.style.setProperty("--da-topbar-h", `${topbar.offsetHeight}px`);
    const splitHeight = split.clientHeight;
    const small = tabs.offsetHeight;
    // Phone layout (Arthur 2026-10-28): the timeline sits at the bottom, so the panel slides up from there over the
    // canvas — half = about half the screen, full = up to just under the top bar.
    if (timeline && timeline.getBoundingClientRect().top > splitBox.top + splitBox.height / 2) {
      const phoneFull = Math.max(small, splitHeight - SHEET_TOP_GAP_PX);
      // Short screens (a phone turned sideways): a panel opens full height, so it shows just like on a computer.
      const halfPhone = window.innerHeight <= 500 ? phoneFull : Math.min(phoneFull, Math.max(small, Math.round(splitHeight * 0.55)));
      return { small, half: halfPhone, full: phoneFull };
    }
    const full = Math.max(small, splitBox.bottom - timelineBottom - SHEET_TOP_GAP_PX);
    // Half keeps its height from when the canvas sat at the top (12 px padding); the centered canvas slides under it.
    const canvasBottom = timelineBase + SHEET_TOP_GAP_PX + host.getBoundingClientRect().height;
    const half = Math.min(full, Math.max(small, splitHeight - canvasBottom - SHEET_TOP_GAP_PX));
    return { small, half, full };
  };
  useEffect(() => {
    const split = sheetRef.current?.parentElement;
    if (!split) return;
    const update = () => setSheetHeights((previous) => {
      const next = measureSheetHeights();
      if (!next || (previous && previous.small === next.small && previous.half === next.half && previous.full === next.full)) return next ?? previous;
      return next;
    });
    update();
    const observer = new ResizeObserver(update);
    observer.observe(split);
    const timeline = document.querySelector(".drawing-timeline");
    if (timeline) observer.observe(timeline); // a layer added makes the timeline taller: full stops at its new bottom
    window.addEventListener("resize", update);
    return () => { observer.disconnect(); window.removeEventListener("resize", update); };
  }, []);
  const chooseSheetSize = (size: SheetSize, forAi: boolean) => {
    setSheetSize(size);
    if (size !== "small") writeSheetSize(forAi, size);
  };
  const openSizeFor = (forAi: boolean) => {
    const saved = readSheetSizes();
    return forAi ? saved.ai : saved.panels;
  };
  const startSheetDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    const heights = measureSheetHeights();
    const sheet = sheetRef.current;
    if (!heights || !sheet || event.button > 0) return;
    const forAi = aiTabActive;
    const drag = { startY: event.clientY, startH: sheet.getBoundingClientRect().height, moved: false, pointerId: event.pointerId };
    const heightAt = (clientY: number) => Math.min(heights.full, Math.max(heights.small, drag.startH - (clientY - drag.startY)));
    // The window follows the finger, so a fast drag that leaves the tab bar still moves the sheet.
    const move = (moveEvent: PointerEvent) => {
      if (moveEvent.pointerId !== drag.pointerId) return;
      if (!drag.moved && Math.abs(moveEvent.clientY - drag.startY) < 8) return; // a tap stays a tap
      drag.moved = true;
      setSheetLiveHeight(heightAt(moveEvent.clientY));
    };
    const end = (endEvent: PointerEvent) => {
      if (endEvent.pointerId !== drag.pointerId) return;
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
      if (!drag.moved) return;
      // The click that may follow a drag is not a tab tap.
      suppressTabClickRef.current = true;
      window.setTimeout(() => { suppressTabClickRef.current = false; }, 0);
      const finalH = heightAt(endEvent.clientY);
      const nearest = (Object.entries(heights) as [SheetSize, number][])
        .reduce((best, entry) => Math.abs(entry[1] - finalH) < Math.abs(best[1] - finalH) ? entry : best);
      setSheetHeights(heights);
      setSheetLiveHeight(null);
      chooseSheetSize(nearest[0], forAi);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
  };
  const sheetHeight = sheetLiveHeight ?? sheetHeights?.[sheetSize] ?? null;

  return (
    <div
      ref={sheetRef}
      className="da-sheet"
      data-sheet-size={sheetSize}
      data-sheet-dragging={sheetLiveHeight === null ? undefined : "true"}
      style={sheetHeight === null ? undefined : { ["--da-sheet-px" as string]: `${sheetHeight}px` }}
    >
    <div
      className="da-sheet-tabs"
      data-sheet-size={sheetSize}
      onPointerDown={startSheetDrag}
      onClickCapture={(event) => {
        if (!suppressTabClickRef.current) return;
        suppressTabClickRef.current = false;
        event.stopPropagation();
        event.preventDefault();
      }}
    >
      <button
        type="button"
        className="da-sheet-handle"
        data-hover="icon"
        aria-label={sheetSize === "small" ? "Show panel (or drag the top edge)" : "Make panel smaller (or drag the top edge)"}
        onClick={() => {
          if (sheetSize === "small") chooseSheetSize(openSizeFor(aiTabActive), aiTabActive);
          else chooseSheetSize(sheetSize === "full" ? "half" : "small", aiTabActive);
        }}
      />
      <div role="tablist" aria-label="Panels" className="da-sheet-tab-row">
      {([...RIGHT_PANEL_TABS, "AI Animator"] as const).map((name) => {
        const active = name === "AI Animator" ? aiTabActive : !aiTabActive && rightPanelTab === name;
        const forAi = name === "AI Animator";
        return (
          <button
            key={name}
            type="button"
            role="tab"
            aria-selected={active}
            data-file-target={name === "Assets" && fileDragActive ? "true" : undefined}
            onClick={() => {
              if (active) {
                // The open tab again: a small sheet opens, an open sheet gets small (the canvas comes back).
                chooseSheetSize(sheetSize === "small" ? openSizeFor(forAi) : "small", forAi);
                return;
              }
              if (forAi) setAiTabActive(true);
              else { setAiTabActive(false); onRightPanelTabChange(name); }
              chooseSheetSize(openSizeFor(forAi), forAi);
            }}
          >
            {name === "AI Animator" ? "AI" : name}
          </button>
        );
      })}
      </div>
    </div>
    <div
      ref={rightPanelRef}
      className="drawing-right-panel"
      data-sheet-open="true"
      data-workspace-right-panel="true"
      style={{
        width: panelWidth,
        flex: `0 0 ${panelWidth}px`,
        maxWidth: "none",
        borderLeft: 0,
        background: "var(--da-page, #030914)",
        display: "flex",
        flexDirection: "column",
        minHeight: 0,
        position: "absolute",
        inset: "0 0 -56px auto", // runs to the bottom of the window, past the 56 px tools row (Arthur: no dark rectangle)
        zIndex: 20,
      }}
    >
      <style>{`
        .drawing-right-panel-resizer::after {
          content: "";
          position: absolute;
          inset: 0 auto 0 4px;
          width: 1px;
          background: var(--da-line, #163058);
        }

        .drawing-right-panel-resizer:hover::after,
        .drawing-right-panel-resizer:focus-visible::after,
        .drawing-right-panel-resizer[data-resizing="true"]::after {
          background: var(--da-hover, #0066ff);
        }

        .drawing-right-panel-resizer:focus-visible {
          outline: 2px solid var(--da-focus, #66c7ff);
          outline-offset: -2px;
        }

        @media (max-width: 640px) {
          .drawing-right-panel {
            position: relative !important;
            inset: auto !important;
          }

          .drawing-right-panel-resizer {
            display: none !important;
          }
        }

        .workspace-properties-scroll {
          scrollbar-width: thin;
          scrollbar-color: var(--da-border, #244267) var(--da-panel, #071120);
        }

        .workspace-properties-scroll::-webkit-scrollbar {
          width: 12px;
        }

        .workspace-properties-scroll::-webkit-scrollbar-track {
          background: var(--da-panel, #071120);
        }

        .workspace-properties-scroll::-webkit-scrollbar-thumb {
          background: var(--da-border, #244267);
          border-radius: 999px;
          border: 2px solid var(--da-panel, #071120);
        }

        .workspace-properties-scroll::-webkit-scrollbar-thumb:hover {
          background: var(--da-selected-border, #3a6aa3);
        }
      `}</style>

      <div
        role="separator"
        aria-label="Resize workspace sidebar"
        aria-orientation="vertical"
        aria-valuemin={panelMinWidth}
        aria-valuemax={panelMaxWidth}
        aria-valuenow={panelWidth}
        aria-valuetext={`${panelWidth} pixels; default ${panelDefaultWidth} pixels`}
        tabIndex={0}
        className="drawing-right-panel-resizer"
        data-workspace-right-panel-resizer="true"
        data-resizing={panelResizing ? "true" : "false"}
        title="Drag to resize. Arrow keys resize; Enter or double-click resets."
        onPointerDown={onPanelResizePointerDown}
        onPointerMove={onPanelResizePointerMove}
        onPointerUp={onPanelResizePointerEnd}
        onPointerCancel={onPanelResizePointerEnd}
        onLostPointerCapture={onPanelResizePointerEnd}
        onKeyDown={onPanelResizeKeyDown}
        onDoubleClick={onPanelResizeReset}
        style={{
          position: "absolute",
          inset: "0 auto 0 -5px",
          width: 10,
          zIndex: 50,
          cursor: "col-resize",
          touchAction: "none",
          userSelect: "none",
        }}
      />

      <div
        ref={rightPanelTabsRef}
        style={{
          display: "flex",
          gap: 8,
          padding: "10px 10px 8px 10px",
          borderBottom: "1px solid var(--da-line, #163058)",
          flexShrink: 0,
        }}
      >
        <div role="group" aria-label="Right panel" style={{ display: "flex", gap: 2, padding: 3, width: "100%", border: "1px solid var(--da-border, #244267)", borderRadius: 11, background: "var(--da-page, #030914)" }}>
        {RIGHT_PANEL_TABS.map((tab) => {
          const isActiveTab = !aiTabActive && rightPanelTab === tab;

          return (
            <button
              key={tab}
              type="button"
              onClick={() => { setAiTabActive(false); onRightPanelTabChange(tab); }}
              aria-pressed={isActiveTab}
              data-file-target={tab === "Assets" && fileDragActive ? "true" : undefined}
              style={{
                flex: 1,
                height: 32,
                padding: "0 12px",
                borderRadius: 8,
                border: 0,
                background: isActiveTab ? "var(--da-selected-bg, #0f2a52)" : "transparent",
                boxShadow: isActiveTab ? "inset 0 0 0 1px var(--da-selected-border, #3a6aa3)" : "none",
                color: isActiveTab ? "#ffffff" : "var(--da-text-3, #a8bddd)",
                fontSize: 13,
                fontWeight: 600,
                userSelect: "none",
                cursor: "pointer",
                outline: "none",
                appearance: "none",
              }}
            >
              {tab}
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => setAiTabActive(true)}
          aria-pressed={aiTabActive}
          style={{
            flex: 1, height: 32, padding: "0 12px", borderRadius: 8, border: 0,
            background: aiTabActive ? "var(--da-selected-bg, #0f2a52)" : "transparent",
            boxShadow: aiTabActive ? "inset 0 0 0 1px var(--da-selected-border, #3a6aa3)" : "none",
            color: aiTabActive ? "#ffffff" : "var(--da-text-3, #a8bddd)",
            fontSize: 13, fontWeight: 600, userSelect: "none", cursor: "pointer", outline: "none", appearance: "none", whiteSpace: "nowrap",
          }}
        >
          AI Animator
        </button>
        </div>
      </div>

      <div
        className="workspace-properties-scroll"
        data-workspace-right-panel-content={rightPanelTab.toLowerCase()}
        style={{
          display: aiTabActive ? "none" : "block",
          flex: "1 1 0",
          maxHeight: "100%",
          minHeight: 0,
          padding: rightPanelTab === "Assets" ? "12px 12px 8px 12px" : rightPanelTab === "Library" ? "12px 12px 6px 12px" : 12,
          boxSizing: "border-box",
          borderBottom: "1px solid var(--da-line, #163058)",
          background: "var(--da-page, #030914)",
          color: "var(--da-muted, #8fabd0)",
          fontSize: 12,
          lineHeight: 1.5,
          overflowX: "hidden",
          overflowY: "auto",
          scrollbarWidth: "thin",
          scrollbarColor: "var(--da-border, #244267) var(--da-panel, #071120)",
        }}
      >
        {rightPanelContent}
      </div>

      {showBrushToolsMenu && (
        <div
          ref={brushToolsMenuRef}
          style={{
            position: "absolute",
            left: brushToolsMenuPosition?.left ?? 0,
            width: brushToolsMenuPosition?.width ?? 180,
            top: brushToolsMenuPosition?.top ?? 0,
            display: "flex",
            flexDirection: "column",
            gap: 4,
            padding: 6,
            borderRadius: 12,
            border: "1px solid var(--da-line, #163058)",
            background: "var(--da-panel, #071120)",
            boxShadow: "0 18px 44px rgba(0,0,0,0.45)",
            zIndex: 30,
            transformOrigin: "bottom center",
            visibility: brushToolsMenuPosition ? "visible" : "hidden",
            pointerEvents: brushToolsMenuPosition ? "auto" : "none",
          }}
        >
          {BRUSH_TOOLS.map((option) => {
            const isSelected = brushToolVariant === option;

            return (
              <button
                key={option}
                type="button"
                onClick={() => onBrushToolSelect(option)}
                style={{
                  width: "100%",
                  minHeight: 34,
                  padding: "8px 12px",
                  borderRadius: 10,
                  border: isSelected ? "1px solid var(--da-selected-border, #3a6aa3)" : "1px solid var(--da-border, #244267)",
                  background: isSelected ? "var(--da-selected-bg, #0f2a52)" : "var(--da-panel, #071120)",
                  color: isSelected ? "var(--da-on-selected, #eaf3ff)" : "var(--da-text-2, #c9d6ea)",
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: "pointer",
                  textAlign: "left",
                }}
              >
                {option === "Brush" ? "Pencil" : option === "Pencil" ? "Graphite" : option}
              </button>
            );
          })}
        </div>
      )}

      <div className="drawing-ai-tab" style={{ display: aiTabActive ? "flex" : "none", flex: "1 1 0", minHeight: 0, flexDirection: "column" }}>
        <style>{`.drawing-ai-tab > .workspace-ai-panel-shell { flex: 1 1 0 !important; border-top: 0 !important; background: var(--da-page, #030914) !important; } .drawing-ai-tab .workspace-ai-messages-scroll { background: transparent !important; } .drawing-ai-tab .workspace-ai-panel-shell > style + div { display: none !important; } .drawing-ai-tab .workspace-ai-panel-shell > * { background: var(--da-page, #030914) !important; }`}</style>
      <DrawingAiPanel
        workspaceContext={workspaceContext}
        projectAiMemory={projectAiMemory}
        onProjectAiMemoryChange={onProjectAiMemoryChange}
        onApplyGeneratedFrame={onApplyGeneratedFrame}
        onExecuteActionPlan={onExecuteActionPlan}
        onApplyAnimatorScene={onApplyAnimatorScene}
        engineDrawing={engineDrawing}
      />
      </div>
    </div>
    </div>
  );
}
