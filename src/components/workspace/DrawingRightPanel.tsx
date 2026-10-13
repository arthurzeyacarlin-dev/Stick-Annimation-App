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
  onApplyAnimatorScene?: (scene: SceneForPage) => boolean;
  engineDrawing?: EngineDrawingBridge;
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
  onApplyAnimatorScene,
  engineDrawing,
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
        background: "var(--da-panel, #071120)",
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
          const isActiveTab = rightPanelTab === tab;

          return (
            <button
              key={tab}
              type="button"
              onClick={() => onRightPanelTabChange(tab)}
              aria-pressed={isActiveTab}
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
        </div>
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
          borderBottom: "1px solid var(--da-line, #163058)",
          background: "var(--da-panel, #071120)",
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
        onApplyAnimatorScene={onApplyAnimatorScene}
        engineDrawing={engineDrawing}
      />
    </div>
  );
}
