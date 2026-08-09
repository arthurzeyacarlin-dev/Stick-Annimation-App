import type { ReactNode, RefObject } from "react";

import { DrawingAiPanel } from "./ai/DrawingAiPanel";
import type { DrawingAiActionPlan, DrawingAiProjectMemory, DrawingAiWorkspaceContext } from "@/src/lib/ai/drawingAiContract";
import type { GeneratedFrameRenderResult } from "@/src/lib/ai/drawingFrameExecutor";

export type DrawingRightPanelTab = "Properties" | "Assets" | "Library";

export type BrushToolVariant = "Brush" | "Pixelate" | "Sketch" | "Pencil" | "Glow";

const RIGHT_PANEL_TABS: DrawingRightPanelTab[] = ["Properties", "Assets", "Library"];
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
  workspaceContext = null,
  projectAiMemory = null,
  onProjectAiMemoryChange,
  onApplyGeneratedFrame,
  onExecuteActionPlan,
}: DrawingRightPanelProps) {
  return (
    <div
      ref={rightPanelRef}
      style={{
        width: 420,
        maxWidth: "46vw",
        borderLeft: "1px solid rgba(255,255,255,0.10)",
        background: "rgba(18,22,28,0.92)",
        display: "flex",
        flexDirection: "column",
        minHeight: 0,
        position: "relative",
      }}
    >
      <style>{`
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
