import { useEffect, useRef, useState } from "react";

type DrawingTopBarProps = {
  projectTitle?: string;
  onSave?: () => void | Promise<void>;
  onSaveAs?: () => void | Promise<void>;
  saveState?: "not-saved" | "unsaved" | "saving" | "saved" | "too-large" | "failed";
  isLegacyProject?: boolean;
  onUndo?: () => void;
  onRedo?: () => void;
  canUndo?: boolean;
  canRedo?: boolean;
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

export function DrawingTopBar({
  projectTitle = "Unnamed drawing project",
  onSave,
  onSaveAs,
  saveState = "not-saved",
  isLegacyProject = false,
  onUndo,
  onRedo,
  canUndo = false,
  canRedo = false,
}: DrawingTopBarProps) {
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

  const runFileAction = (action?: () => void | Promise<void>) => {
    setIsFileMenuOpen(false);
    void action?.();
  };
  const isSaving = saveState === "saving";
  const saveStateLabel = {
    "not-saved": "Not saved",
    unsaved: "Unsaved changes",
    saving: "Saving…",
    saved: "Saved on this browser",
    "too-large": "Too large to save",
    failed: "Save failed",
  }[saveState];

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
                disabled={isSaving}
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
                  cursor: isSaving ? "default" : "pointer",
                  opacity: isSaving ? 0.5 : 1,
                }}
              >
                Save
              </button>
              <button
                type="button"
                role="menuitem"
                disabled={isSaving}
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
                  cursor: isSaving ? "default" : "pointer",
                  opacity: isSaving ? 0.5 : 1,
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
          <button
            type="button"
            aria-label="Undo"
            title="Undo"
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
            aria-label="Redo"
            title="Redo"
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
      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", lineHeight: 1.2 }}>
        <div
          role="status"
          aria-live="polite"
          style={{
            fontSize: 12,
            fontWeight: 650,
            color: saveState === "failed" || saveState === "too-large" ? "#ff9e9e" : "rgba(255,255,255,0.78)",
          }}
        >
          {saveStateLabel}
        </div>
        <div style={{ fontSize: 10, color: "rgba(255,255,255,0.48)" }}>
          {isLegacyProject ? "Older local project — Save to upgrade on this browser" : "Local only — not synced to another device"}
        </div>
      </div>
    </div>
  );
}
