const TOOL_NAMES = ["Select", "Lasso", "Brush", "Eraser", "Fill", "Text", "Shape", "Knife"] as const;
export type DrawingToolName = (typeof TOOL_NAMES)[number];
export type DrawingShapeType = "Square" | "Triangle" | "Circle";

type DrawingToolBarProps = {
  activeTool: DrawingToolName;
  onToolSelect: (tool: DrawingToolName) => void;
};

export function DrawingToolBar({
  activeTool,
  onToolSelect,
}: DrawingToolBarProps) {
  return (
    <div
      style={{
        height: 56,
        width: "calc(100% - min(420px, 46vw) + 1px)",
        borderTop: "1px solid rgba(255,255,255,0.08)",
        borderRight: "1px solid rgba(255,255,255,0.10)",
        background: "rgba(18,22,28,0.88)",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-evenly",
        padding: "0 18px",
        gap: 10,
        flexShrink: 0,
      }}
    >
      {TOOL_NAMES.map((t) => {
        const isSelected = activeTool === t;

        return (
          <div key={t} style={{ position: "relative" }}>
            <button
              type="button"
              title={t}
              onClick={() => onToolSelect(t)}
              style={{
                width: 42,
                height: 42,
                borderRadius: 12,
                border: isSelected ? "1px solid rgba(110, 170, 255, 0.34)" : "1px solid rgba(255,255,255,0.10)",
                background: isSelected ? "rgba(110, 170, 255, 0.10)" : "rgba(255,255,255,0.025)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: isSelected ? "rgba(255,255,255,0.92)" : "rgba(255,255,255,0.68)",
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
              <polygon points="5,5 25,5 5,25" fill="#ffffff" />
              <polygon points="37,37 17,37 37,17" fill="#ffffff" />
              <line
                x1="6"
                y1="36"
                x2="36"
                y2="6"
                stroke="#ffffff"
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
              <polygon points="20,3 28,16 12,16" fill="none" stroke="#ffffff" strokeWidth="2" strokeLinejoin="round" />
              <circle cx="10" cy="30" r="6.5" fill="none" stroke="#ffffff" strokeWidth="2" />
              <rect x="23" y="24" width="14" height="14" rx="1" fill="none" stroke="#ffffff" strokeWidth="2" />
            </svg>
          ) : t === "Text" ? (
            <svg
              viewBox="0 0 40 40"
              aria-hidden="true"
              style={{
                width: 24,
                height: 24,
                overflow: "visible",
              }}
            >
              <path
                d="M9 10 H31 M20 10 V30 M14 30 H26"
                fill="none"
                stroke="#ffffff"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          ) : t === "Fill" ? (
            <svg
              viewBox="0 0 40 40"
              aria-hidden="true"
              style={{
                width: 28,
                height: 28,
                overflow: "visible",
              }}
            >
              <g transform="translate(16 20) rotate(25) translate(-20 -20)">
                <rect x="14" y="10" width="16" height="19" rx="3" fill="none" stroke="#ffffff" strokeWidth="2.4" />
              </g>
            <path
  d="M32.1 20.4 C32.1 18.2 30.5 16.9 29 15.4 C27.5 16.9 25.9 18.2 25.9 20.4 C25.9 22.8 27.4 24.6 29 24.6 C30.6 24.6 32.1 22.8 32.1 20.4 Z"
  fill="#ffffff"
/>
            </svg>
          ) : t === "Eraser" ? (
            <svg
              viewBox="0 0 40 40"
              aria-hidden="true"
              style={{
                width: 24,
                height: 24,
              }}
            >
              <g transform="rotate(35 20 20)">
                <rect x="12" y="7" width="16" height="22" rx="4" fill="none" stroke="#ffffff" strokeWidth="2.6" />
                <line x1="12" y1="16.5" x2="28" y2="16.5" stroke="#ffffff" strokeWidth="2.6" strokeLinecap="butt" />
              </g>
              <line
                x1="10.5"
                y1="30.5"
                x2="36.5"
                y2="30.5"
                stroke="#ffffff"
                strokeWidth="3"
                strokeLinecap="butt"
                shapeRendering="geometricPrecision"
              />
            </svg>
          ) : t === "Brush" ? (
            <svg
              viewBox="0 0 40 40"
              aria-hidden="true"
              style={{
                width: 24,
                height: 24,
              }}
            >
              <line x1="9" y1="31" x2="29" y2="11" stroke="#ffffff" strokeWidth="5" strokeLinecap="round" />
              <path
                d="M29 2
     C36 2 38 8 34 13
     C32 16 30 18 29 19
     C28 18 26 16 24 13
     C20 8 22 2 29 2
     Z"
                fill="#ffffff"
                transform="rotate(-135 29 11)"
              />
              <polygon points="29,16 27,13 31,13" fill="#ffffff" />
            </svg>
          ) : t === "Lasso" ? (
            <svg viewBox="0 0 32 32" width="100%" height="100%">
              <line x1="16" y1="6" x2="16" y2="10" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
              <line x1="16" y1="22" x2="16" y2="26" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
              <line x1="6" y1="16" x2="10" y2="16" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
              <line x1="22" y1="16" x2="26" y2="16" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
              <circle cx="16" cy="16" r="4.75" stroke="white" strokeWidth="1.25" fill="none" />
              <circle cx="16" cy="16" r="1.25" fill="white" />
            </svg>
          ) : t === "Select" ? (
            <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
              <path
                d="M4 3 L19 12 L12.5 14 L15 21 L11.8 22 L9.5 15.5 L4 19 Z"
                fill="none"
                stroke="white"
                strokeWidth="2"
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            </svg>
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
