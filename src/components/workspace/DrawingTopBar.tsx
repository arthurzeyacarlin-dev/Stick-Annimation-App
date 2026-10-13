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
  /** SPEC-0020 Phase 4: Edit / View / Window / Help menus, built by DrawingWorkspace from its own handlers. */
  menus?: TopBarMenu[];
};

export type TopBarMenuItem =
  | { kind?: "item"; label: string; shortcut?: string; onSelect: () => void; disabled?: boolean; checked?: boolean }
  | { kind: "separator" };
export type TopBarMenu = { label: "Edit" | "View" | "Window" | "Help"; items: TopBarMenuItem[] };

const topBarButtonStyle = (isActive = false, cursor: "pointer" | "default" = "default") =>
  ({
    height: 30,
    padding: "0 10px",
    borderRadius: 8,
    border: isActive ? "1px solid var(--da-selected-border, #3a6aa3)" : "1px solid transparent",
    background: isActive ? "var(--da-selected-bg, #0f2a52)" : "transparent",
    color: isActive ? "var(--da-on-selected, #eaf3ff)" : "var(--da-text-2, #c9d6ea)",
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
    color: "var(--da-muted, #8fabd0)",
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
    borderRadius: 12,
    border: "1px solid var(--da-line, #163058)",
    background: "var(--da-panel, #071120)",
    boxShadow: "0 18px 44px rgba(0,0,0,0.45)",
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
    color: "var(--da-text-2, #c9d6ea)",
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
  menus = [],
}: DrawingTopBarProps) {
  const [openMenu, setOpenMenu] = useState<TopBarMenu["label"] | null>(null);
  const menuBarRef = useRef<HTMLDivElement | null>(null);
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

    // SPEC-0020 Phase 7: Escape closes the File menu too (it only closed the other menus).
    const handleKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") setIsFileMenuOpen(false); };
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown, true);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [isFileMenuOpen]);

  useEffect(() => {
    if (!openMenu) return;
    const handlePointerDown = (event: PointerEvent) => {
      if (!menuBarRef.current?.contains(event.target as Node)) setOpenMenu(null);
    };
    const handleKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") setOpenMenu(null); };
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown, true);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [openMenu]);

  const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);
  const fileShortcut = { save: isMac ? "⌘S" : "Ctrl+S", saveAs: isMac ? "⇧⌘S" : "Ctrl+Shift+S", export: isMac ? "⌘E" : "Ctrl+E", exit: isMac ? "⌥⌘S" : "Ctrl+Alt+S" };
  const shortcutLabel = (label: string, keys: string) => (
    <span style={{ display: "flex", alignItems: "center", gap: 16, width: "100%" }}><span style={{ flex: 1 }}>{label}</span><span style={{ color: "var(--da-muted, #8fabd0)", fontSize: 12 }}>{keys}</span></span>
  );
  const runFileAction = (action?: () => void | Promise<void>) => {
    setIsFileMenuOpen(false);
    void action?.();
  };
  const isSaving = saveState === "saving";
  const saveStateLabel = {
    "not-saved": "Not saved",
    unsaved: "Unsaved changes",
    saving: "Saving",
    saved: accountSaved ? "Saved to your account" : "Saved on this browser",
    "quiet-saved": "Saved",
    "too-large": "Too large to save",
    failed: "Save failed",
  }[saveState];
  const recoveryStateLabel = {
    checking: "Checking safety backup",
    idle: "Safety backup ready",
    pending: "Safety backup pending",
    writing: "Updating safety backup",
    current: "Safety backup current",
    blocked: "Unsaved draft found — use Save",
    unavailable: "Safety backup unavailable — use Save",
    failed: "Safety backup failed — use Save",
  }[recoveryState];

  const hasRecoveryWarning = recoveryState === "blocked" || recoveryState === "unavailable" || recoveryState === "failed";
  const hasSaveProblem = saveState === "failed" || saveState === "too-large";
  const syncLabel = accountSaved
    ? (isLegacyProject ? "Older project — Save to add it to your account" : "Projects save to your account")
    : isLegacyProject ? "Older local project — Save to upgrade on this browser" : "Local only — not synced to another device";
  const statusDotColor = hasSaveProblem
    ? "var(--da-danger, #ff8a95)"
    : saveState === "saved" || saveState === "quiet-saved"
      ? "#7fd8a6"
      : saveState === "saving"
        ? "var(--da-link, #8cbbf3)"
        : "#f3d89c";

  return (
    <div
      style={{
        height: 48,
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "0 16px",
        background: "var(--da-panel, #071120)",
        borderBottom: "1px solid var(--da-line, #163058)",
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

                setOpenMenu(null);
                setIsFileMenuOpen((current) => !current);
              }}
              style={topBarButtonStyle(isFileMenuOpen, hasFileMenu ? "pointer" : "default")}
            >
              File
            </button>

            {hasFileMenu && isFileMenuOpen && (
              <div role="menu" style={menuStyle(220)}>
                <button
                  type="button"
                  role="menuitem"
                  disabled={isSaving}
                  onClick={() => runFileAction(onSave)}
                  style={menuItemStyle(!isSaving)}
                >
                  {shortcutLabel("Save", fileShortcut.save)}
                </button>
                <button
                  type="button"
                  role="menuitem"
                  disabled={isSaving}
                  onClick={() => runFileAction(onSaveAs)}
                  style={menuItemStyle(!isSaving)}
                >
                  {shortcutLabel("Save As", fileShortcut.saveAs)}
                </button>
                {onExport ? (
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => runFileAction(onExport)}
                    style={menuItemStyle()}
                  >
                    {shortcutLabel("Export", fileShortcut.export)}
                  </button>
                ) : null}
                {onSaveAndExit ? (
                  <>
                    <div aria-hidden="true" style={{ height: 1, margin: "2px 6px", background: "var(--da-line, #163058)" }} />
                    <button
                      type="button"
                      role="menuitem"
                      disabled={isSaving}
                      onClick={() => runFileAction(onSaveAndExit)}
                      style={menuItemStyle(!isSaving)}
                    >
                      {shortcutLabel("Save and Exit", fileShortcut.exit)}
                    </button>
                  </>
                ) : null}
              </div>
            )}
          </div>

          {/* SPEC-0020 Phase 4: Edit / View / Window / Help — real actions from the workspace. */}
          <div ref={menuBarRef} style={{ display: "flex", alignItems: "center", gap: 2 }}>
            {menus.map((menu) => (
              <div key={menu.label} style={{ position: "relative", display: "flex", alignItems: "center" }}>
                <button
                  type="button"
                  aria-haspopup="menu"
                  aria-expanded={openMenu === menu.label}
                  onClick={() => { setIsFileMenuOpen(false); setOpenMenu((current) => current === menu.label ? null : menu.label); }}
                  onPointerEnter={() => { if (openMenu && openMenu !== menu.label) setOpenMenu(menu.label); }}
                  style={topBarButtonStyle(openMenu === menu.label, "pointer")}
                >
                  {menu.label}
                </button>
                {openMenu === menu.label && (
                  <div role="menu" aria-label={menu.label} style={menuStyle(220)}>
                    {menu.items.map((item, index) => item.kind === "separator"
                      ? <div key={`sep-${index}`} aria-hidden="true" style={{ height: 1, margin: "2px 6px", background: "var(--da-line, #163058)" }} />
                      : (
                        <button
                          key={item.label}
                          type="button"
                          role={item.checked === undefined ? "menuitem" : "menuitemcheckbox"}
                          aria-checked={item.checked}
                          disabled={item.disabled}
                          onClick={() => { setOpenMenu(null); item.onSelect(); }}
                          style={{ ...menuItemStyle(!item.disabled), display: "flex", alignItems: "center", gap: 10 }}
                        >
                          <span aria-hidden="true" style={{ width: 12, flexShrink: 0, textAlign: "center" }}>{item.checked ? "✓" : ""}</span>
                          <span style={{ flex: 1 }}>{item.label}</span>
                          {item.shortcut ? <span style={{ color: "var(--da-muted, #8fabd0)", fontSize: 12 }}>{item.shortcut}</span> : null}
                        </button>
                      ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {hasHistoryControls && (
          <>
            <div aria-hidden="true" style={{ width: 1, height: 18, background: "var(--da-line, #163058)", flexShrink: 0 }} />
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
          color: "var(--da-text, #f6f9ff)",
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
          <span style={{ fontSize: 12, fontWeight: 500, color: "var(--da-danger, #ff8a95)" }}>{recoveryStateLabel}</span>
        ) : null}
        {isLegacyProject ? <span style={{ fontSize: 12, color: "var(--da-muted, #8fabd0)" }}>{syncLabel}</span> : null}
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
            border: "1px solid var(--da-line, #163058)",
            background: "var(--da-page, #030914)",
            color: hasSaveProblem ? "var(--da-danger, #ff8a95)" : "var(--da-text-2, #c9d6ea)",
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
