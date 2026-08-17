"use client";

import {
  deleteStoredDrawingProject,
  duplicateStoredDrawingProject,
  listStoredDrawingProjects,
  openStoredDrawingProject,
  renameStoredDrawingProject,
  type DrawingProjectCatalogEntry,
  type DrawingProjectOpenCandidate,
} from "@/src/lib/drawingProjectStorage";
import { deleteDrawingProjectAiMemoryFromSupabase } from "@/src/lib/ai/drawingProjectAiMemorySync";
import { DRAWING_PROJECT_V2_LIMITS } from "@/src/lib/drawingProjectV2Contract";
import { useCallback, useEffect, useRef, useState } from "react";

type OpenProjectBrowserProps = {
  activeDrawingProjectId?: string | null;
  onBack: () => void;
  onOpenDrawingProject: (project: DrawingProjectOpenCandidate) => void;
  onDrawingProjectDeleted?: (projectId: string) => void;
};

const OPEN_PROJECT_MENU_WIDTH = 164;
const OPEN_PROJECT_MENU_HEIGHT = 162;
const DRAWING_PROJECT_STORAGE_REFERENCE_BYTES = DRAWING_PROJECT_V2_LIMITS.projectStoredBytes;
const openProjectEmptyStateStyle = {
  minHeight: 220,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  textAlign: "center" as const,
  color: "rgba(255,255,255,0.55)",
  fontSize: "13px",
  width: "100%",
};

const formatProjectUpdatedAt = (updatedAt?: string | null) => {
  if (!updatedAt) {
    return null;
  }

  const parsedDate = new Date(updatedAt);
  if (Number.isNaN(parsedDate.getTime())) {
    return null;
  }

  return parsedDate.toLocaleString();
};

const formatProjectStorageSize = (sizeBytes: number) => {
  if (sizeBytes < 1024) {
    return `${sizeBytes} B`;
  }

  if (sizeBytes < 1024 * 1024) {
    const sizeInKb = sizeBytes / 1024;
    return `${sizeInKb >= 100 ? Math.round(sizeInKb) : sizeInKb.toFixed(1)} KB`;
  }

  const sizeInMb = sizeBytes / (1024 * 1024);
  return `${sizeInMb >= 10 ? Math.round(sizeInMb) : sizeInMb.toFixed(1)} MB`;
};

const getDrawingProjectStorageUsageRatio = (sizeBytes: number) =>
  Math.min(1, sizeBytes / DRAWING_PROJECT_STORAGE_REFERENCE_BYTES);

const blendChannel = (start: number, end: number, progress: number) =>
  Math.round(start + (end - start) * progress);

const blendRgbColor = (
  start: readonly [number, number, number],
  end: readonly [number, number, number],
  progress: number,
) =>
  `rgb(${blendChannel(start[0], end[0], progress)}, ${blendChannel(start[1], end[1], progress)}, ${blendChannel(start[2], end[2], progress)})`;

const getDrawingProjectStorageUsageColor = (usageRatio: number) => {
  const clampedRatio = Math.max(0, Math.min(1, usageRatio));

  if (clampedRatio <= 0.45) {
    return blendRgbColor([34, 197, 94], [234, 179, 8], clampedRatio / 0.45);
  }

  if (clampedRatio <= 0.75) {
    return blendRgbColor([234, 179, 8], [249, 115, 22], (clampedRatio - 0.45) / 0.3);
  }

  return blendRgbColor([249, 115, 22], [239, 68, 68], (clampedRatio - 0.75) / 0.25);
};

const getDrawingProjectStorageDisplayRatio = (usageRatio: number) => {
  const clampedRatio = Math.max(0, Math.min(1, usageRatio));

  if (clampedRatio === 0) {
    return 0;
  }

  return Math.max(0.04, Math.pow(clampedRatio, 0.82));
};

export function OpenProjectBrowser({
  activeDrawingProjectId = null,
  onBack,
  onOpenDrawingProject,
  onDrawingProjectDeleted,
}: OpenProjectBrowserProps) {
  const [openProjectBackHover, setOpenProjectBackHover] = useState(false);
  const [savedDrawingProjects, setSavedDrawingProjects] = useState<DrawingProjectCatalogEntry[]>([]);
  const [catalogState, setCatalogState] = useState<"loading" | "ready" | "failed">("loading");
  const [operationMessage, setOperationMessage] = useState<string | null>(null);
  const [busyProjectId, setBusyProjectId] = useState<string | null>(null);
  const openAttemptRef = useRef(0);
  const [activeOpenProjectTab, setActiveOpenProjectTab] = useState<"drawing" | "stickFigure">("drawing");
  const [openProjectCardMenu, setOpenProjectCardMenu] = useState<{ projectId: string; top: number; left: number } | null>(null);
  const [hoveredProjectMenuButtonId, setHoveredProjectMenuButtonId] = useState<string | null>(null);
  const [hoveredProjectMenuActionId, setHoveredProjectMenuActionId] = useState<string | null>(null);

  const refreshSavedDrawingProjects = useCallback(async () => {
    setCatalogState("loading");
    try {
      setSavedDrawingProjects(await listStoredDrawingProjects());
      setCatalogState("ready");
    } catch {
      setCatalogState("failed");
      setOperationMessage("Local projects could not be read. Nothing was changed.");
    }
  }, []);

  const closeOpenProjectCardMenu = () => {
    setOpenProjectCardMenu(null);
    setHoveredProjectMenuButtonId(null);
    setHoveredProjectMenuActionId(null);
  };

  const toggleOpenProjectCardMenu = (button: HTMLButtonElement, projectId: string) => {
    const rect = button.getBoundingClientRect();
    const viewportPadding = 12;
    const nextTop =
      window.innerHeight - rect.bottom >= OPEN_PROJECT_MENU_HEIGHT + 8
        ? rect.bottom + 8
        : Math.max(viewportPadding, rect.top - OPEN_PROJECT_MENU_HEIGHT - 8);
    const nextLeft = Math.min(
      window.innerWidth - OPEN_PROJECT_MENU_WIDTH - viewportPadding,
      Math.max(viewportPadding, rect.right - OPEN_PROJECT_MENU_WIDTH),
    );

    setOpenProjectCardMenu((currentMenu) =>
      currentMenu?.projectId === projectId
        ? null
        : {
            projectId,
            top: nextTop,
            left: nextLeft,
          },
    );
    setHoveredProjectMenuActionId(null);
  };

  const findProject = (entryId: string) => savedDrawingProjects.find((project) => project.id === entryId) ?? null;

  const handleOpenDrawingProject = async (entry: DrawingProjectCatalogEntry) => {
    if (entry.kind === "unavailable" || busyProjectId) return;
    const attempt = ++openAttemptRef.current;
    setBusyProjectId(entry.id);
    setOperationMessage("Checking the complete local project before opening…");
    try {
      const candidate = await openStoredDrawingProject(entry);
      if (openAttemptRef.current !== attempt) return;
      setOperationMessage(null);
      onOpenDrawingProject(candidate);
    } catch {
      if (openAttemptRef.current === attempt) setOperationMessage("This project could not be opened safely. The current editor was not changed.");
    } finally {
      if (openAttemptRef.current === attempt) setBusyProjectId(null);
    }
  };

  const handleDeleteDrawingProject = async (entryId: string) => {
    const entry = findProject(entryId);
    if (!entry || entry.kind === "unavailable" || busyProjectId || !window.confirm(`Delete “${entry.name}” from this browser?`)) {
      return;
    }
    setBusyProjectId(entry.id);
    setOperationMessage("Deleting local project…");
    try {
      const result = await deleteStoredDrawingProject(entry);
      if (result.status === "failed") {
        setOperationMessage(`Delete failed (${result.code}). The project was left unchanged.`);
        return;
      }
      if (entry.projectId) void deleteDrawingProjectAiMemoryFromSupabase(entry.projectId);
      if (entry.projectId && activeDrawingProjectId === entry.projectId) onDrawingProjectDeleted?.(entry.projectId);
      setOperationMessage(result.legacyCleanup === "pending" ? "Deleted locally. Background cleanup is still pending." : "Deleted from this browser.");
      await refreshSavedDrawingProjects();
      closeOpenProjectCardMenu();
    } catch {
      setOperationMessage("Delete failed. The project was left unchanged.");
    } finally {
      setBusyProjectId(null);
    }
  };

  const handleDuplicateDrawingProject = async (entryId: string) => {
    const entry = findProject(entryId);
    if (!entry || entry.kind === "unavailable" || busyProjectId) return;
    setBusyProjectId(entry.id);
    setOperationMessage("Duplicating local project…");
    try {
      await duplicateStoredDrawingProject(entry);
      setOperationMessage("Duplicate saved on this browser.");
      await refreshSavedDrawingProjects();
      closeOpenProjectCardMenu();
    } catch {
      setOperationMessage("Duplicate failed. The source project was not changed.");
    } finally {
      setBusyProjectId(null);
    }
  };

  const handleRenameDrawingProject = async (entryId: string) => {
    const targetProject = findProject(entryId);
    if (!targetProject || targetProject.kind !== "v2" || busyProjectId) return;

    const promptedProjectName = window.prompt("Rename project", targetProject.name);
    if (promptedProjectName === null) {
      return;
    }

    const trimmedProjectName = promptedProjectName.trim();
    if (!trimmedProjectName) {
      return;
    }

    setBusyProjectId(targetProject.id);
    try {
      await renameStoredDrawingProject(targetProject, trimmedProjectName);
      setOperationMessage("Project renamed on this browser.");
      await refreshSavedDrawingProjects();
      closeOpenProjectCardMenu();
    } catch {
      setOperationMessage("Rename failed. The project was not changed.");
    } finally {
      setBusyProjectId(null);
    }
  };

  useEffect(() => {
    let cancelled = false;
    void refreshSavedDrawingProjects().then(() => {
      if (cancelled) openAttemptRef.current += 1;
    });
    return () => {
      cancelled = true;
      openAttemptRef.current += 1;
    };
  }, [refreshSavedDrawingProjects]);

  useEffect(() => {
    if (!openProjectCardMenu) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (
        target instanceof Element &&
        (target.closest("[data-project-card-actions]") || target.closest("[data-project-card-menu]"))
      ) {
        return;
      }

      closeOpenProjectCardMenu();
    };

    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [openProjectCardMenu]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeOpenProjectCardMenu();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const activeMenuProject = openProjectCardMenu ? findProject(openProjectCardMenu.projectId) : null;

  return (
    <div
      onScroll={closeOpenProjectCardMenu}
      style={{
        minHeight: "100vh",
        background: "rgb(26, 27, 36)",
        display: "flex",
        flexDirection: "column",
        overflowY: "auto",
        padding: "20px 20px 56px 20px",
        position: "relative",
      }}
    >
      <div
        style={{
          width: "min(1120px, 100%)",
          margin: "0 auto",
          display: "flex",
          flexDirection: "column",
          gap: "30px",
        }}
      >
        <div
          style={{
            minHeight: 48,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "16px",
          }}
        >
          <button
            type="button"
            onClick={(event) => {
              event.currentTarget.blur();
              setOpenProjectBackHover(false);
              closeOpenProjectCardMenu();
              onBack();
            }}
            onMouseEnter={() => setOpenProjectBackHover(true)}
            onMouseLeave={() => setOpenProjectBackHover(false)}
            onBlur={() => setOpenProjectBackHover(false)}
            style={{
              padding: "10px 12px",
              borderRadius: "10px",
              border: openProjectBackHover
                ? "1px solid rgba(64,142,255,0.58)"
                : "1px solid rgba(255,255,255,0.15)",
              background: openProjectBackHover ? "rgba(12,45,86,0.42)" : "rgba(255,255,255,0.05)",
              boxShadow: openProjectBackHover
                ? "0 0 14px rgba(22,96,194,0.16), 0 8px 18px rgba(0,0,0,0.28)"
                : "none",
              color: "rgba(255,255,255,0.88)",
              fontSize: "13px",
              cursor: "pointer",
              outline: "none",
              appearance: "none",
              transition: "all 160ms ease",
            }}
          >
            ← Back
          </button>

          <div
            style={{
              fontSize: "12px",
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: "rgba(255,255,255,0.48)",
            }}
          >
            Projects
          </div>

          <div style={{ width: 72 }} />
        </div>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "24px",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "center",
            }}
          >
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "8px",
                padding: "4px",
                borderRadius: "999px",
                background: "rgba(255,255,255,0.04)",
              }}
            >
              <button
                type="button"
                onClick={() => {
                  closeOpenProjectCardMenu();
                  setActiveOpenProjectTab("drawing");
                }}
                style={{
                  minWidth: 116,
                  padding: "10px 18px",
                  borderRadius: "999px",
                  border: "none",
                  background: activeOpenProjectTab === "drawing" ? "rgba(255,255,255,0.12)" : "transparent",
                  color: activeOpenProjectTab === "drawing" ? "rgba(255,255,255,0.94)" : "rgba(255,255,255,0.58)",
                  fontSize: "13px",
                  fontWeight: activeOpenProjectTab === "drawing" ? 700 : 600,
                  cursor: "pointer",
                  transition: "background 140ms ease, color 140ms ease",
                }}
              >
                Drawing
              </button>
              <button
                type="button"
                onClick={() => {
                  closeOpenProjectCardMenu();
                  setActiveOpenProjectTab("stickFigure");
                }}
                style={{
                  minWidth: 116,
                  padding: "10px 18px",
                  borderRadius: "999px",
                  border: "none",
                  background: activeOpenProjectTab === "stickFigure" ? "rgba(255,255,255,0.12)" : "transparent",
                  color:
                    activeOpenProjectTab === "stickFigure" ? "rgba(255,255,255,0.94)" : "rgba(255,255,255,0.58)",
                  fontSize: "13px",
                  fontWeight: activeOpenProjectTab === "stickFigure" ? 700 : 600,
                  cursor: "pointer",
                  transition: "background 140ms ease, color 140ms ease",
                }}
              >
                Stick Figure
              </button>
            </div>
          </div>

          {activeOpenProjectTab === "drawing" ? (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr",
                gap: "16px",
              }}
            >
              {operationMessage ? (
                <div role="status" aria-live="polite" style={{ color: "rgba(255,255,255,0.72)", fontSize: 12 }}>
                  {operationMessage}
                </div>
              ) : null}
              {catalogState === "loading" && savedDrawingProjects.length === 0 ? (
                <div style={openProjectEmptyStateStyle}>Loading local projects…</div>
              ) : catalogState === "failed" ? (
                <div style={openProjectEmptyStateStyle}>
                  <button type="button" onClick={() => void refreshSavedDrawingProjects()}>Retry local projects</button>
                </div>
              ) : savedDrawingProjects.length > 0 ? (
                savedDrawingProjects.map((project) => {
                  const projectSizeBytes = project.storedByteLength;
                  const projectUsageRatio = getDrawingProjectStorageUsageRatio(projectSizeBytes);
                  const projectUsageDisplayRatio = getDrawingProjectStorageDisplayRatio(projectUsageRatio);
                  const projectUsageColor = getDrawingProjectStorageUsageColor(projectUsageRatio);
                  const projectUsageStatus = project.kind === "v2"
                    ? "Saved on this browser"
                    : project.kind === "legacy"
                      ? "Older local project — Save to upgrade"
                      : project.detail;
                  const isUnavailable = project.kind === "unavailable";
                  const isBusy = busyProjectId === project.id;

                  return (
                    <div
                      key={project.id}
                      style={{
                        borderRadius: "16px",
                        border: "1px solid rgba(255,255,255,0.05)",
                        background: "rgba(255,255,255,0.035)",
                        boxShadow: "0 14px 34px rgba(0,0,0,0.16)",
                        padding: "14px 16px 14px 16px",
                        display: "flex",
                        alignItems: "center",
                        gap: "14px",
                        color: "rgba(255,255,255,0.90)",
                      }}
                    >
                      <button
                        type="button"
                        disabled={isUnavailable || isBusy}
                        aria-label={isUnavailable ? `${project.name} unavailable` : `Open ${project.name}`}
                        onClick={() => {
                          closeOpenProjectCardMenu();
                          void handleOpenDrawingProject(project);
                        }}
                        style={{
                          flex: 1,
                          minWidth: 0,
                          display: "flex",
                          alignItems: "center",
                          gap: "14px",
                          border: "none",
                          background: "transparent",
                          padding: 0,
                          color: "inherit",
                          textAlign: "left",
                          cursor: isUnavailable || isBusy ? "default" : "pointer",
                          opacity: isUnavailable ? 0.72 : 1,
                        }}
                      >
                        <div
                          style={{
                            width: 92,
                            height: 68,
                            borderRadius: "10px",
                            border: "1px solid rgba(255,255,255,0.06)",
                            background: project.previewDataUrl ? "#ffffff" : "rgba(255,255,255,0.04)",
                            overflow: "hidden",
                            flexShrink: 0,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            padding: project.previewDataUrl ? "4px" : 0,
                          }}
                        >
                          {project.previewDataUrl ? (
                            <div
                              aria-hidden="true"
                              style={{
                                width: "100%",
                                height: "100%",
                                borderRadius: "6px",
                                backgroundColor: "#ffffff",
                                backgroundImage: `url("${project.previewDataUrl}")`,
                                backgroundPosition: "center",
                                backgroundRepeat: "no-repeat",
                                backgroundSize: "contain",
                              }}
                            />
                          ) : (
                            <div style={{ color: "rgba(255,255,255,0.42)", fontSize: "11px" }}>No preview</div>
                          )}
                        </div>

                        <div style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: "8px" }}>
                          <div
                            style={{
                              fontSize: "15px",
                              fontWeight: 700,
                              whiteSpace: "nowrap",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                            }}
                          >
                            {project.name}
                          </div>
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "space-between",
                              gap: "10px",
                              color: "rgba(255,255,255,0.58)",
                              fontSize: "12px",
                            }}
                          >
                            <span>{formatProjectUpdatedAt(project.updatedAt) ?? "Local project"}</span>
                            <span style={{ color: "rgba(255,255,255,0.48)", whiteSpace: "nowrap" }}>
                              {formatProjectStorageSize(projectSizeBytes)}
                            </span>
                          </div>
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "space-between",
                              gap: "8px",
                            }}
                          >
                            <span
                              style={{
                                fontSize: "11px",
                                fontWeight: 600,
                                letterSpacing: "0.02em",
                                color: projectUsageColor,
                              }}
                            >
                              {isBusy ? "Working…" : projectUsageStatus}
                            </span>
                          </div>
                          <div
                            aria-hidden="true"
                            style={{
                              height: 6,
                              borderRadius: 999,
                              background: "rgba(255,255,255,0.08)",
                              overflow: "hidden",
                            }}
                          >
                            <div
                              style={{
                                width: `${projectUsageDisplayRatio * 100}%`,
                                height: "100%",
                                borderRadius: 999,
                                background: projectUsageColor,
                              }}
                            />
                          </div>
                        </div>
                      </button>

                      <div
                        data-project-card-actions="true"
                        style={{ display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}
                        onClick={(event) => event.stopPropagation()}
                      >
                        <button
                          type="button"
                          aria-label={`Project actions for ${project.name}`}
                          aria-haspopup="menu"
                          aria-expanded={openProjectCardMenu?.projectId === project.id}
                          onMouseEnter={() => setHoveredProjectMenuButtonId(project.id)}
                          onMouseLeave={() =>
                            setHoveredProjectMenuButtonId((currentId) => (currentId === project.id ? null : currentId))
                          }
                          disabled={isUnavailable || isBusy}
                          onClick={(event) => {
                            event.stopPropagation();
                            toggleOpenProjectCardMenu(event.currentTarget, project.id);
                          }}
                          style={{
                            width: 40,
                            height: 40,
                            borderRadius: 999,
                            border: "none",
                            background:
                              openProjectCardMenu?.projectId === project.id || hoveredProjectMenuButtonId === project.id
                                ? "rgba(18,78,150,0.38)"
                                : "transparent",
                            color: "rgba(255,255,255,0.84)",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            cursor: isUnavailable || isBusy ? "default" : "pointer",
                            opacity: isUnavailable ? 0.45 : 1,
                            transition: "background 140ms ease",
                          }}
                        >
                          <svg width="18" height="18" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                            <circle cx="3" cy="8" r="1.2" />
                            <circle cx="8" cy="8" r="1.2" />
                            <circle cx="13" cy="8" r="1.2" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div style={openProjectEmptyStateStyle}>
                  No saved drawing projects yet.
                </div>
              )}
            </div>
          ) : (
            <div style={openProjectEmptyStateStyle}>
              No stick figure projects yet.
            </div>
          )}
        </div>
      </div>

      {openProjectCardMenu ? (
        <div
          data-project-card-menu="true"
          role="menu"
          style={{
            position: "fixed",
            top: openProjectCardMenu.top,
            left: openProjectCardMenu.left,
            width: OPEN_PROJECT_MENU_WIDTH,
            borderRadius: "12px",
            border: "1px solid rgba(255,255,255,0.10)",
            background: "rgba(20,24,32,0.98)",
            boxShadow: "0 14px 36px rgba(0,0,0,0.34)",
            padding: "6px",
            display: "flex",
            flexDirection: "column",
            gap: "4px",
            zIndex: 50,
          }}
        >
          <button
            type="button"
            role="menuitem"
            disabled={!activeMenuProject || activeMenuProject.kind === "unavailable" || Boolean(busyProjectId)}
            onMouseEnter={() => setHoveredProjectMenuActionId(`${openProjectCardMenu.projectId}:duplicate`)}
            onMouseLeave={() =>
              setHoveredProjectMenuActionId((currentId) =>
                currentId === `${openProjectCardMenu.projectId}:duplicate` ? null : currentId,
              )
            }
            onClick={() => void handleDuplicateDrawingProject(openProjectCardMenu.projectId)}
            style={{
              minHeight: 42,
              border: "none",
              background:
                hoveredProjectMenuActionId === `${openProjectCardMenu.projectId}:duplicate`
                  ? "rgba(18,78,150,0.32)"
                  : "transparent",
              color: "rgba(255,255,255,0.88)",
              textAlign: "left",
              padding: "10px 12px",
              borderRadius: "8px",
              cursor: "pointer",
              fontSize: "13px",
            }}
          >
            Duplicate
          </button>
          <button
            type="button"
            role="menuitem"
            disabled={!activeMenuProject || activeMenuProject.kind !== "v2" || Boolean(busyProjectId)}
            onMouseEnter={() => setHoveredProjectMenuActionId(`${openProjectCardMenu.projectId}:rename`)}
            onMouseLeave={() =>
              setHoveredProjectMenuActionId((currentId) =>
                currentId === `${openProjectCardMenu.projectId}:rename` ? null : currentId,
              )
            }
            onClick={() => void handleRenameDrawingProject(openProjectCardMenu.projectId)}
            style={{
              minHeight: 42,
              border: "none",
              background:
                hoveredProjectMenuActionId === `${openProjectCardMenu.projectId}:rename`
                  ? "rgba(18,78,150,0.32)"
                  : "transparent",
              color: "rgba(255,255,255,0.88)",
              textAlign: "left",
              padding: "10px 12px",
              borderRadius: "8px",
              cursor: "pointer",
              fontSize: "13px",
            }}
          >
            Rename
          </button>
          <button
            type="button"
            role="menuitem"
            disabled={!activeMenuProject || activeMenuProject.kind === "unavailable" || Boolean(busyProjectId)}
            onMouseEnter={() => setHoveredProjectMenuActionId(`${openProjectCardMenu.projectId}:delete`)}
            onMouseLeave={() =>
              setHoveredProjectMenuActionId((currentId) =>
                currentId === `${openProjectCardMenu.projectId}:delete` ? null : currentId,
              )
            }
            onClick={() => void handleDeleteDrawingProject(openProjectCardMenu.projectId)}
            style={{
              minHeight: 42,
              border: "none",
              background:
                hoveredProjectMenuActionId === `${openProjectCardMenu.projectId}:delete`
                  ? "rgba(18,78,150,0.32)"
                  : "transparent",
              color: "rgba(255,255,255,0.88)",
              textAlign: "left",
              padding: "10px 12px",
              borderRadius: "8px",
              cursor: "pointer",
              fontSize: "13px",
            }}
          >
            Delete
          </button>
        </div>
      ) : null}
    </div>
  );
}
