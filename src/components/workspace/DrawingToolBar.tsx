import { TextIcon, PencilIcon, EraserIcon, FillIcon, LassoIcon, SelectIcon, KnifeIcon, ShapeIcon } from "@/src/components/ui/ToolIcons";
const TOOL_NAMES = ["Select", "Lasso", "Brush", "Eraser", "Fill", "Text", "Shape", "Knife"] as const;
export type DrawingToolName = (typeof TOOL_NAMES)[number];
export type DrawingShapeType = "Square" | "Triangle" | "Circle";

type DrawingToolBarProps = {
  activeTool: DrawingToolName;
  onToolSelect: (tool: DrawingToolName) => void;
  rightPanelWidth: number;
};

export function DrawingToolBar({
  activeTool,
  onToolSelect,
  rightPanelWidth,
}: DrawingToolBarProps) {
  return (
    <div
      data-workspace-tool-bar="true"
      className="drawing-toolbar"
      style={{
        height: 56,
        width: `calc(100% - ${rightPanelWidth}px)`,
        boxSizing: "border-box",
        borderTop: "1px solid var(--da-line, #163058)",
        borderRight: "1px solid var(--da-line, #163058)",
        background: "var(--da-panel, #071120)",
        display: "grid",
        gridTemplateColumns: "repeat(8, minmax(42px, 1fr))",
        alignItems: "center",
        padding: 0,
        gap: 0,
        flexShrink: 0,
      }}
    >
      {TOOL_NAMES.map((t) => {
        const isSelected = activeTool === t;

        return (
          <div key={t} style={{ position: "relative", display: "flex", justifyContent: "center", minWidth: 42 }}>
            <button
              data-workspace-tool={t.toLowerCase()}
              type="button"
              aria-label={t === "Shape" ? "Shape tool" : t === "Knife" ? "Knife tool" : t === "Brush" ? "Pencil" : t}
              data-tooltip={t === "Shape" ? "Shape tool" : t === "Knife" ? "Knife tool" : t === "Brush" ? "Pencil" : t}
              data-tooltip-side="above"
              onClick={() => onToolSelect(t)}
              aria-pressed={isSelected}
              data-selected={isSelected ? "true" : undefined}
              className="drawing-tool-button"
              // Workspace makeover (Arthur 2026-10-26): quiet tools, the chosen one solid bright blue (look in globals.css).
              style={{
                width: 60,
                height: 44,
                borderRadius: 10,
                border: "1px solid transparent",
                background: "transparent",
                display: "flex",
                flexDirection: "column",
                gap: 3,
                alignItems: "center",
                justifyContent: "center",
                boxSizing: "border-box",
                color: isSelected ? "#ffffff" : "var(--da-muted, #8fabd0)",
                fontSize: 11,
                fontWeight: 700,
                userSelect: "none",
                cursor: "pointer",
                padding: 0,
                outline: "none",
                appearance: "none",
              }}
            >
          {t === "Knife" ? (
            <KnifeIcon size={20} />
          ) : t === "Shape" ? (
            <ShapeIcon size={20} />
          ) : t === "Text" ? (
            <TextIcon size={20} />
          ) : t === "Fill" ? (
            <FillIcon size={20} />
          ) : t === "Eraser" ? (
            <EraserIcon size={20} />
          ) : t === "Brush" ? (
            <PencilIcon size={20} />
          ) : t === "Lasso" ? (
            <LassoIcon size={20} />
          ) : t === "Select" ? (
            <SelectIcon size={20} />
          ) : (
            t[0]
          )}
              <span className="drawing-tool-label" aria-hidden="true">{t === "Brush" ? "Pencil" : t}</span>
            </button>

          </div>
        );
      })}
    </div>
  );
}
