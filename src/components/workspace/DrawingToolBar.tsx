import { TextIcon, PencilIcon, EraserIcon, FillIcon, LassoIcon, SelectIcon } from "@/src/components/ui/ToolIcons";
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
              style={{
                width: 42,
                height: 42,
                borderRadius: 10,
                border: isSelected ? "1px solid var(--da-selected-border, #3a6aa3)" : "1px solid var(--da-border, #244267)",
                background: isSelected ? "var(--da-selected-bg, #0f2a52)" : "var(--da-panel, #071120)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                boxSizing: "border-box",
                color: isSelected ? "var(--da-on-selected, #eaf3ff)" : "var(--da-muted, #8fabd0)",
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
            <svg
              viewBox="0 0 42 42"
              aria-hidden="true"
              style={{
                width: 28,
                height: 28,
                overflow: "visible",
              }}
            >
              <polygon points="5,5 25,5 5,25" fill="currentColor" />
              <polygon points="37,37 17,37 37,17" fill="currentColor" />
              <line
                x1="6"
                y1="36"
                x2="36"
                y2="6"
                stroke="currentColor"
                strokeWidth="2.1"
                strokeDasharray="3 4"
                strokeLinecap="round"
              />
            </svg>
          ) : t === "Shape" ? (
            <svg
              viewBox="0 0 40 40"
              aria-hidden="true"
              style={{
                width: 24,
                height: 24,
                overflow: "visible",
              }}
            >
              <polygon points="20,3 28,16 12,16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
              <circle cx="10" cy="30" r="6.5" fill="none" stroke="currentColor" strokeWidth="2" />
              <rect x="23" y="24" width="14" height="14" rx="1" fill="none" stroke="currentColor" strokeWidth="2" />
            </svg>
          ) : t === "Text" ? (
            <TextIcon size={26} />
          ) : t === "Fill" ? (
            <FillIcon size={26} />
          ) : t === "Eraser" ? (
            <EraserIcon size={26} />
          ) : t === "Brush" ? (
            <PencilIcon size={26} />
          ) : t === "Lasso" ? (
            <LassoIcon size={26} />
          ) : t === "Select" ? (
            <SelectIcon size={26} />
          ) : (
            t[0]
          )}
            </button>

          </div>
        );
      })}
    </div>
  );
}
