import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent, ReactNode, RefObject } from "react";

import { DrawingAiPanel } from "./ai/DrawingAiPanel";
import type { DrawingAiActionPlan, DrawingAiProjectMemory, DrawingAiWorkspaceContext } from "@/src/lib/ai/drawingAiContract";
import type { GeneratedFrameRenderResult } from "@/src/lib/ai/drawingFrameExecutor";

export type DrawingRightPanelTab = "Properties" | "Assets" | "Library";

export type BrushToolVariant = "Brush" | "Pixelate" | "Sketch" | "Pencil" | "Glow";

const RIGHT_PANEL_TABS: DrawingRightPanelTab[] = ["Properties", "Library", "Assets"];
const BRUSH_TOOLS: BrushToolVariant[] = ["Brush", "Pixelate", "Sketch", "Pencil", "Glow"];

type DrawingRightPanelProps = {
  rightPanelRef: RefObject<HTMLDivElement | null>;
  rightPanelTabsRef: RefObject<HTMLDivElement | null>;
  rightPanelTab: DrawingRightPanelTab;
  onRightPanelTabChange: (tab: DrawingRightPanelTab) => void;
  rightPanelContent: ReactNode;
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
};

export function DrawingRightPanel({
  rightPanelRef,
  rightPanelTabsRef,
  rightPanelTab,
  onRightPanelTabChange,
  rightPanelContent,
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
}: DrawingRightPanelProps) {
  return (
    <div
      ref={rightPanelRef}
      className="drawing-right-panel"
      data-workspace-right-panel="true"
      style={{
        width: panelWidth,
        flex: `0 0 ${panelWidth}px`,
        maxWidth: "none",
        borderLeft: 0,
        background: "rgba(18,22,28,0.92)",
        display: "flex",
        flexDirection: "column",
        minHeight: 0,
        position: "absolute",
        inset: "0 0 0 auto",
        zIndex: 20,
      }}
    >
      <style>{`
        .drawing-right-panel-resizer::after {
          content: "";
          position: absolute;
          inset: 0 auto 0 4px;
          width: 1px;
          background: rgba(255,255,255,0.18);
          transition: background-color 120ms ease, box-shadow 120ms ease;
        }

        .drawing-right-panel-resizer:hover::after,
        .drawing-right-panel-resizer:focus-visible::after,
        .drawing-right-panel-resizer[data-resizing="true"]::after {
          background: rgba(110,170,255,0.88);
          box-shadow: 0 0 8px rgba(70,140,255,0.34);
        }

        .drawing-right-panel-resizer:focus-visible {
          outline: 2px solid rgba(110,170,255,0.72);
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
          scrollbar-color: rgba(255,255,255,0.18) rgba(18,22,28,0.92);
        }

        .workspace-properties-scroll::-webkit-scrollbar {
          width: 12px;
        }

        .workspace-properties-scroll::-webkit-scrollbar-track {
          background: rgba(18,22,28,0.92);
        }

        .workspace-properties-scroll::-webkit-scrollbar-thumb {
          background: rgba(255,255,255,0.18);
          border-radius: 999px;
          border: 2px solid rgba(18,22,28,0.92);
        }

        .workspace-properties-scroll::-webkit-scrollbar-thumb:hover {
          background: rgba(255,255,255,0.24);
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
          borderBottom: "1px solid rgba(255,255,255,0.08)",
          flexShrink: 0,
        }}
      >
        {RIGHT_PANEL_TABS.map((tab) => {
          const isActiveTab = rightPanelTab === tab;

          return (
            <button
              key={tab}
              type="button"
              onClick={() => onRightPanelTabChange(tab)}
              style={{
                padding: "8px 12px",
                borderRadius: 8,
                border: isActiveTab ? "1px solid rgba(110,170,255,0.34)" : "1px solid rgba(255,255,255,0.08)",
                background: isActiveTab ? "rgba(110,170,255,0.10)" : "rgba(255,255,255,0.02)",
                color: isActiveTab ? "rgba(225,238,255,0.92)" : "rgba(255,255,255,0.70)",
                fontSize: 12,
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
      </div>

      <div
        className="workspace-properties-scroll"
        data-workspace-right-panel-content={rightPanelTab.toLowerCase()}
        style={{
          flex: "0 0 45%",
          maxHeight: "100%",
          minHeight: 0,
          padding: rightPanelTab === "Assets" ? "12px 12px 8px 12px" : rightPanelTab === "Library" ? "12px 12px 6px 12px" : 12,
          boxSizing: "border-box",
          borderBottom: "1px solid rgba(255,255,255,0.08)",
          background: "rgba(18,22,28,0.92)",
          color: "rgba(255,255,255,0.55)",
          fontSize: 12,
          lineHeight: 1.5,
          overflowX: "hidden",
          overflowY: "auto",
          scrollbarWidth: "thin",
          scrollbarColor: "rgba(255,255,255,0.18) rgba(18,22,28,0.92)",
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
            border: "1px solid rgba(255,255,255,0.16)",
            background: "rgba(18,22,28,0.98)",
            boxShadow: "0 10px 22px rgba(0,0,0,0.34)",
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
                  border: isSelected ? "1px solid rgba(110,170,255,0.36)" : "1px solid rgba(255,255,255,0.12)",
                  background: isSelected ? "rgba(110,170,255,0.12)" : "rgba(255,255,255,0.045)",
                  color: "rgba(255,255,255,0.9)",
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: "pointer",
                  textAlign: "left",
                }}
              >
                {option}
              </button>
            );
          })}
        </div>
      )}

      <DrawingAiPanel
        workspaceContext={workspaceContext}
        projectAiMemory={projectAiMemory}
        onProjectAiMemoryChange={onProjectAiMemoryChange}
        onApplyGeneratedFrame={onApplyGeneratedFrame}
        onExecuteActionPlan={onExecuteActionPlan}
      />
    </div>
  );
}
