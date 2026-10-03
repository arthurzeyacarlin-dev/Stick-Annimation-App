import { useEffect, useRef, useState } from "react";

type DrawingTopBarProps = {
  projectTitle?: string;
  onSave?: () => void | Promise<void>;
  onSaveAs?: () => void | Promise<void>;
  onExport?: () => void;
  onSaveAndExit?: () => void | Promise<void>;
  saveState?: "not-saved" | "unsaved" | "saving" | "saved" | "quiet-saved" | "too-large" | "failed";
  accountSaved?: boolean;
  recoveryState?: "checking" | "idle" | "pending" | "writing" | "current" | "blocked" | "unavailable" | "failed";
  isLegacyProject?: boolean;
  onUndo?: () => void;
  onRedo?: () => void;
  canUndo?: boolean;
  canRedo?: boolean;
};

const topBarButtonStyle = (isActive = false, cursor: "pointer" | "default" = "default") =>
  ({
    height: 30,
    padding: "0 10px",
    borderRadius: 8,
    border: isActive ? "1px solid #3a6aa3" : "1px solid transparent",
    background: isActive ? "#0f2a52" : "transparent",
    color: isActive ? "#f6f9ff" : "#c9d6ea",
    fontSize: 13,
    fontWeight: 500,
    fontFamily: "inherit",
    lineHeight: 1,
    display: "inline-flex",
    alignItems: "center",
    cursor,
    outline: "none",
    userSelect: "none" as const,
  });

const historyButtonStyle = (isEnabled: boolean) =>
  ({
    width: 30,
    height: 30,
    padding: 0,
    borderRadius: 8,
    border: "1px solid transparent",
    background: "transparent",
    color: "#8fabd0",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: isEnabled ? "pointer" : "default",
    opacity: isEnabled ? 1 : 0.4,
    outline: "none",
    userSelect: "none" as const,
  });

const historyIconStyle = {
  width: 15,
  height: 15,
  display: "block",
  flexShrink: 0,
} as const;

const menuStyle = (minWidth: number) =>
  ({
    position: "absolute" as const,
    top: "calc(100% + 6px)",
    left: 0,
    minWidth,
    padding: 4,
    borderRadius: 10,
    border: "1px solid #244267",
    background: "#071120",
    boxShadow: "0 16px 32px rgba(0,0,0,0.38)",
    display: "flex",
    flexDirection: "column" as const,
    gap: 2,
    zIndex: 20,
  });

const menuItemStyle = (isEnabled = true) =>
  ({
    width: "100%",
    padding: "8px 10px",
    border: "1px solid transparent",
    borderRadius: 7,
    background: "transparent",
    color: "#c9d6ea",
    fontSize: 13,
    fontFamily: "inherit",
    textAlign: "left" as const,
    cursor: isEnabled ? "pointer" : "default",
    opacity: isEnabled ? 1 : 0.4,
  });

export function DrawingTopBar({
  projectTitle = "Unnamed drawing project",
  onSave,
  onSaveAs,
  onExport,
  onSaveAndExit,
  saveState = "not-saved",
  accountSaved = false,
  recoveryState = "checking",
  isLegacyProject = false,
  onUndo,
  onRedo,
  canUndo = false,
  canRedo = false,
}: DrawingTopBarProps) {
  const [isFileMenuOpen, setIsFileMenuOpen] = useState(false);
  const fileMenuRef = useRef<HTMLDivElement | null>(null);
  const hasFileMenu = typeof onSave === "function" || typeof onSaveAs === "function" || typeof onExport === "function" || typeof onSaveAndExit === "function";
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
    saved: accountSaved ? "Saved to your account" : "Saved on this browser",
    "quiet-saved": "Saved",
    "too-large": "Too large to save",
    failed: "Save failed",
  }[saveState];
  const recoveryStateLabel = {
    checking: "Checking safety backup…",
    idle: "Safety backup ready",
    pending: "Safety backup pending",
    writing: "Updating safety backup…",
    current: "Safety backup current",
    blocked: "Unsaved draft found — use Save",
    unavailable: "Safety backup unavailable — use Save",
    failed: "Safety backup failed — use Save",
  }[recoveryState];

  const hasRecoveryWarning = recoveryState === "blocked" || recoveryState === "unavailable" || recoveryState === "failed";
  const hasSaveProblem = saveState === "failed" || saveState === "too-large";
  const syncLabel = isLegacyProject ? "Older local project — Save to upgrade on this browser" : "Local only — not synced to another device";
  const statusDotColor = hasSaveProblem
    ? "#ff8a95"
    : saveState === "saved" || saveState === "quiet-saved"
      ? "#4fa8a0"
      : saveState === "saving"
        ? "#8cbbf3"
        : "#b8955a";

  return (
    <div
      style={{
        height: 48,
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "0 16px",
        background: "#071120",
        borderBottom: "1px solid #163058",
        flexShrink: 0,
      }}
    >
      <div style={{ flex: "1 1 0", display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
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
              <div role="menu" style={menuStyle(168)}>
                <button
                  type="button"
                  role="menuitem"
                  disabled={isSaving}
                  onClick={() => runFileAction(onSave)}
                  style={menuItemStyle(!isSaving)}
                >
                  Save
                </button>
                <button
                  type="button"
                  role="menuitem"
                  disabled={isSaving}
                  onClick={() => runFileAction(onSaveAs)}
                  style={menuItemStyle(!isSaving)}
                >
                  Save As
                </button>
                {onExport ? (
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => runFileAction(onExport)}
                    style={menuItemStyle()}
                  >
                    Export…
                  </button>
                ) : null}
                {onSaveAndExit ? (
                  <>
                    <div aria-hidden="true" style={{ height: 1, margin: "2px 6px", background: "#163058" }} />
                    <button
                      type="button"
                      role="menuitem"
                      disabled={isSaving}
                      onClick={() => runFileAction(onSaveAndExit)}
                      style={menuItemStyle(!isSaving)}
                    >
                      Save and Exit
                    </button>
                  </>
                ) : null}
              </div>
            )}
          </div>

          {/* Not wired yet; a later spec will decide what these menus do. */}
          {(["Edit", "View", "Window", "Help"] as const).map((label) => (
            <button key={label} type="button" aria-disabled="true" tabIndex={-1} style={topBarButtonStyle(false, "default")}>
              {label}
            </button>
          ))}
        </div>

        {hasHistoryControls && (
          <>
            <div aria-hidden="true" style={{ width: 1, height: 18, background: "#163058", flexShrink: 0 }} />
            <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
              <button
                type="button"
                aria-label="Undo"
                title="Undo"
                disabled={!onUndo || !canUndo}
                onClick={onUndo}
                style={historyButtonStyle(Boolean(onUndo) && canUndo)}
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
                style={historyButtonStyle(Boolean(onRedo) && canRedo)}
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
          </>
        )}
      </div>

      <div
        title={projectTitle}
        style={{
          flex: "0 1 auto",
          minWidth: 0,
          maxWidth: "40%",
          fontSize: 13,
          fontWeight: 600,
          color: "#f6f9ff",
          textAlign: "center",
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
          userSelect: "none",
        }}
      >
        {projectTitle}
      </div>

      <div
        data-project-recovery-state={recoveryState}
        style={{ flex: "1 1 0", display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 10, whiteSpace: "nowrap" }}
      >
        {hasRecoveryWarning ? (
          <span style={{ fontSize: 12, fontWeight: 500, color: "#ff8a95" }}>{recoveryStateLabel}</span>
        ) : null}
        {isLegacyProject ? <span style={{ fontSize: 12, color: "#8fabd0" }}>{syncLabel}</span> : null}
        <div
          role="status"
          aria-live="polite"
          title={`${recoveryStateLabel} · ${syncLabel}`}
          style={{
            height: 26,
            display: "inline-flex",
            alignItems: "center",
            gap: 7,
            padding: "0 10px",
            borderRadius: 999,
            border: "1px solid #163058",
            background: "#030914",
            color: hasSaveProblem ? "#ff8a95" : "#c9d6ea",
            fontSize: 12,
            fontWeight: 500,
            userSelect: "none",
          }}
        >
          <span aria-hidden="true" style={{ width: 6, height: 6, borderRadius: 999, background: statusDotColor, flexShrink: 0 }} />
          {saveStateLabel}
        </div>
      </div>
    </div>
  );
}
