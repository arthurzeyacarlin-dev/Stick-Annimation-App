import { useEffect, useRef, useState } from "react";

type StickFigureTopBarProps = {
  projectTitle?: string;
  onSave?: () => void;
  onSaveAs?: () => void;
  onUndo?: () => void;
  onRedo?: () => void;
  canUndo?: boolean;
  canRedo?: boolean;
  historyScopeLabel?: string;
  statusText?: string;
  statusDisclosure?: string;
};

const topBarButtonStyle = (isActive = false, cursor: "pointer" | "default" = "default") =>
  ({
    padding: "4px 8px",
    borderRadius: 6,
    border: isActive ? "1px solid rgba(255,255,255,0.12)" : "1px solid transparent",
    background: isActive ? "rgba(255,255,255,0.06)" : "transparent",
    color: isActive ? "rgba(255,255,255,0.92)" : "rgba(255,255,255,0.72)",
    fontSize: 12,
    cursor,
    outline: "none",
    userSelect: "none" as const,
  });

const historyButtonStyle = (isHovered: boolean, isEnabled: boolean) =>
  ({
    width: 28,
    height: 28,
    padding: 0,
    borderRadius: 7,
    border: isHovered && isEnabled ? "1px solid rgba(255,255,255,0.12)" : "1px solid transparent",
    background: isHovered && isEnabled ? "rgba(255,255,255,0.08)" : "transparent",
    color: isEnabled ? "rgba(255,255,255,0.86)" : "rgba(255,255,255,0.38)",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: isEnabled ? "pointer" : "default",
    opacity: isEnabled ? 1 : 0.72,
    outline: "none",
    userSelect: "none" as const,
  });

const historyIconStyle = {
  width: 15,
  height: 15,
  display: "block",
  flexShrink: 0,
} as const;

export function StickFigureTopBar({
  projectTitle = "Unnamed stick figure project",
  onSave,
  onSaveAs,
  onUndo,
  onRedo,
  canUndo = false,
  canRedo = false,
  historyScopeLabel,
  statusText,
  statusDisclosure,
}: StickFigureTopBarProps) {
  const [isFileMenuOpen, setIsFileMenuOpen] = useState(false);
  const [hoveredHistoryAction, setHoveredHistoryAction] = useState<"undo" | "redo" | null>(null);
  const fileMenuRef = useRef<HTMLDivElement | null>(null);
  const hasFileMenu = typeof onSave === "function" || typeof onSaveAs === "function";
  const hasHistoryControls = typeof onUndo === "function" || typeof onRedo === "function";

  useEffect(() => {
    if (!isFileMenuOpen) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (!fileMenuRef.current?.contains(event.target as Node)) {
        setIsFileMenuOpen(false);
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [isFileMenuOpen]);

  const runFileAction = (action?: () => void) => {
    setIsFileMenuOpen(false);
    action?.();
  };

  return (
    <div
      style={{
        height: 44,
        display: "flex",
        alignItems: "center",
        gap: 14,
        padding: "0 14px",
        background: "rgb(20, 24, 32)",
        borderBottom: "1px solid rgba(255,255,255,0.08)",
        flexShrink: 0,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
        <div ref={fileMenuRef} style={{ position: "relative", display: "flex", alignItems: "center" }}>
          <button
            type="button"
            aria-haspopup={hasFileMenu ? "menu" : undefined}
            aria-expanded={hasFileMenu ? isFileMenuOpen : undefined}
            onClick={() => {
              if (!hasFileMenu) {
                return;
              }

              setIsFileMenuOpen((current) => !current);
            }}
            style={topBarButtonStyle(isFileMenuOpen, hasFileMenu ? "pointer" : "default")}
          >
            File
          </button>

          {hasFileMenu && isFileMenuOpen && (
            <div
              role="menu"
              style={{
                position: "absolute",
                top: "calc(100% + 6px)",
                left: 0,
                minWidth: 148,
                padding: 4,
                borderRadius: 8,
                border: "1px solid rgba(255,255,255,0.10)",
                background: "rgb(24, 28, 36)",
                boxShadow: "0 12px 24px rgba(0,0,0,0.26)",
                display: "flex",
                flexDirection: "column",
                gap: 2,
                zIndex: 20,
              }}
            >
              <button
                type="button"
                role="menuitem"
                onClick={() => runFileAction(onSave)}
                style={{
                  width: "100%",
                  padding: "7px 10px",
                  border: "none",
                  borderRadius: 6,
                  background: "transparent",
                  color: "rgba(255,255,255,0.88)",
                  fontSize: 12,
                  textAlign: "left",
                  cursor: "pointer",
                }}
              >
                Save
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => runFileAction(onSaveAs)}
                style={{
                  width: "100%",
                  padding: "7px 10px",
                  border: "none",
                  borderRadius: 6,
                  background: "transparent",
                  color: "rgba(255,255,255,0.88)",
                  fontSize: 12,
                  textAlign: "left",
                  cursor: "pointer",
                }}
              >
                Save As
              </button>
            </div>
          )}
        </div>

        {(["Edit", "View", "Window", "Help"] as const).map((label) => (
          <button key={label} type="button" style={topBarButtonStyle()}>
            {label}
          </button>
        ))}
      </div>

      {hasHistoryControls && (
        <div style={{ display: "flex", alignItems: "center", gap: 4, marginLeft: 2 }}>
          {historyScopeLabel ? (
            <div
              style={{
                marginRight: 2,
                color: "rgba(180,220,255,0.56)",
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                userSelect: "none",
              }}
            >
              {historyScopeLabel}
            </div>
          ) : null}
          <button
            type="button"
            aria-label={historyScopeLabel ? `Undo ${historyScopeLabel.toLowerCase()} action` : "Undo"}
            title={historyScopeLabel ? `Undo ${historyScopeLabel.toLowerCase()} action` : "Undo"}
            disabled={!onUndo || !canUndo}
            onClick={onUndo}
            onMouseEnter={() => setHoveredHistoryAction("undo")}
            onMouseLeave={() => setHoveredHistoryAction((current) => (current === "undo" ? null : current))}
            style={historyButtonStyle(hoveredHistoryAction === "undo", Boolean(onUndo) && canUndo)}
          >
            <svg viewBox="0 0 16 16" fill="none" aria-hidden="true" style={historyIconStyle}>
              <path
                d="M6 3.5 1.75 7.75 6 12M2.25 7.75H14"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
          <button
            type="button"
            aria-label={historyScopeLabel ? `Redo ${historyScopeLabel.toLowerCase()} action` : "Redo"}
            title={historyScopeLabel ? `Redo ${historyScopeLabel.toLowerCase()} action` : "Redo"}
            disabled={!onRedo || !canRedo}
            onClick={onRedo}
            onMouseEnter={() => setHoveredHistoryAction("redo")}
            onMouseLeave={() => setHoveredHistoryAction((current) => (current === "redo" ? null : current))}
            style={historyButtonStyle(hoveredHistoryAction === "redo", Boolean(onRedo) && canRedo)}
          >
            <svg viewBox="0 0 16 16" fill="none" aria-hidden="true" style={historyIconStyle}>
              <path
                d="m10 3.5 4.25 4.25L10 12M13.75 7.75H2"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </div>
      )}

      <div
        style={{
          fontSize: 13,
          fontWeight: 700,
          color: "rgba(255,255,255,0.88)",
          marginLeft: 8,
          userSelect: "none",
        }}
      >
        {projectTitle}
      </div>

      <div style={{ flex: 1 }} />

      {statusText ? (
        <div
          data-testid="stick-project-save-status"
          title={statusDisclosure}
          aria-label={statusDisclosure ? `${statusText}. ${statusDisclosure}` : statusText}
          style={{
            color: "rgba(255,255,255,0.58)",
            fontSize: 11,
            whiteSpace: "nowrap",
            userSelect: "none",
          }}
        >
          {statusText}
        </div>
      ) : null}
    </div>
  );
}
