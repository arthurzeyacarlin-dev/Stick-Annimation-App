"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ProjectCollectionEntry } from "@/src/lib/animation/unifiedProjectCollection";
import type { BootstrapResult } from "@/src/lib/animation/unifiedWorkspaceBootstrap";
import {
  acquireProjectOpenLeaseV2,
  createProjectManagementCommandOwnerV2,
  subscribeProjectManagementInvalidationV2,
} from "@/src/lib/animation/unifiedProjectManagementV2";
import { createBrowserProjectLibraryController } from "@/src/lib/project-library/projectLibraryController";
import {
  filterAndSortProjectEntries,
  formatProjectDuration,
  formatProjectUpdatedAt,
  projectClassificationLabel,
  projectFailureMessage,
  shortenProjectIdentity,
  type ProjectLibrarySnapshot,
  type ProjectLibrarySort,
} from "@/src/lib/project-library/projectLibraryModel";
import { ProjectMovieViewer } from "../project-player/ProjectMovieViewer";
import { ProjectPoster } from "./ProjectPoster";
import styles from "./projectLibrary.module.css";

type Props = {
  onBack: () => void;
  surface?: "watch" | "edit";
  onOpenProject?: (entry: ProjectCollectionEntry) => Promise<BootstrapResult>;
};
type SnapshotState =
  | { status: "loading" }
  | { status: "ready"; project: ProjectLibrarySnapshot }
  | { status: "failed"; code: string; message: string };
type MenuState = { entryId: string; x: number; y: number } | null;
type DialogState =
  | { kind: "rename" | "duplicate"; entry: ProjectCollectionEntry; value: string }
  | { kind: "delete"; entry: ProjectCollectionEntry }
  | null;

const entryFailure = (entry: ProjectCollectionEntry): SnapshotState => {
  const failure = projectFailureMessage(entry.error ?? "invalid_record");
  return { status: "failed", ...failure };
};

const sortLabels: Array<{ value: ProjectLibrarySort; label: string }> = [
  { value: "updated-desc", label: "Last edited — newest" },
  { value: "updated-asc", label: "Last edited — oldest" },
  { value: "name-asc", label: "Name — A to Z" },
  { value: "name-desc", label: "Name — Z to A" },
];

export function ProjectLibrary({ onBack, surface = "watch", onOpenProject }: Props) {
  const controller = useMemo(() => createBrowserProjectLibraryController(), []);
  const commandOwner = useMemo(() => createProjectManagementCommandOwnerV2(), []);
  const [entries, setEntries] = useState<ProjectCollectionEntry[]>([]);
  const [snapshots, setSnapshots] = useState<Record<string, SnapshotState>>({});
  const [loading, setLoading] = useState(true);
  const [collectionUnavailable, setCollectionUnavailable] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [busyEntryId, setBusyEntryId] = useState<string | null>(null);
  const [viewer, setViewer] = useState<{ project: ProjectLibrarySnapshot; entryId: string } | null>(null);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<ProjectLibrarySort>("updated-desc");
  const [menu, setMenu] = useState<MenuState>(null);
  const [dialog, setDialog] = useState<DialogState>(null);
  const [dialogError, setDialogError] = useState<string | null>(null);
  const generationRef = useRef(0);
  const primaryRefs = useRef(new Map<string, HTMLButtonElement>());
  const overflowRefs = useRef(new Map<string, HTMLButtonElement>());
  const queuedEntryIdsRef = useRef(new Set<string>());
  const libraryRef = useRef<HTMLElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const menuInvokerRef = useRef<HTMLElement | null>(null);
  const dialogInitialRef = useRef<HTMLInputElement | HTMLButtonElement | null>(null);
  const pendingFocusIdRef = useRef<string | null>(null);

  const heading = surface === "watch" ? "My Projects" : "Open Project";
  const help = surface === "watch" ? "Watch saved animations stored in this browser" : "Choose a saved project to edit";
  const actionLabel = surface === "watch" ? "Watch" : "Edit";
  const visibleEntries = useMemo(() => filterAndSortProjectEntries(entries, query, sort), [entries, query, sort]);

  const loadCollection = useCallback(async (nextNotice: string | null = null) => {
    const generation = generationRef.current + 1;
    generationRef.current = generation;
    setLoading(true);
    setCollectionUnavailable(false);
    if (nextNotice !== null) setNotice(nextNotice);
    queuedEntryIdsRef.current.clear();
    try {
      const collection = await controller.list();
      if (generationRef.current !== generation) return;
      setEntries(collection);
      setLoading(false);
      const initialStates: Record<string, SnapshotState> = {};
      for (const entry of collection) initialStates[entry.id] = entry.classification === "invalid" ? entryFailure(entry) : { status: "loading" };
      setSnapshots(initialStates);
      const focusId = pendingFocusIdRef.current;
      pendingFocusIdRef.current = null;
      if (focusId) window.setTimeout(() => (primaryRefs.current.get(focusId) ?? overflowRefs.current.get(focusId))?.focus({ preventScroll: true }), 0);
    } catch {
      if (generationRef.current !== generation) return;
      setEntries([]);
      setSnapshots({});
      setLoading(false);
      setCollectionUnavailable(true);
    }
  }, [controller]);

  useEffect(() => {
    void loadCollection();
    return () => { generationRef.current += 1; };
  }, [loadCollection]);

  useEffect(() => {
    const refresh = () => { if (!document.hidden) void loadCollection(); };
    const unsubscribe = subscribeProjectManagementInvalidationV2(refresh);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      unsubscribe();
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [loadCollection]);

  useEffect(() => {
    const generation = generationRef.current;
    const validEntries = new Map(entries.filter(entry => entry.classification !== "invalid").map(entry => [entry.id, entry]));
    if (validEntries.size === 0) return;
    const settle = (entry: ProjectCollectionEntry, result: { project: ProjectLibrarySnapshot } | { error: unknown }) => {
      if (generationRef.current !== generation) return;
      if ("project" in result) setSnapshots(current => ({ ...current, [entry.id]: { status: "ready", project: result.project } }));
      else {
        const failure = projectFailureMessage(result.error);
        setSnapshots(current => ({ ...current, [entry.id]: { status: "failed", ...failure } }));
      }
    };
    const enqueue = (entry: ProjectCollectionEntry) => {
      if (queuedEntryIdsRef.current.has(entry.id)) return;
      queuedEntryIdsRef.current.add(entry.id);
      controller.enqueueVisible(entry, settle, () => generationRef.current === generation);
    };
    const nodes = Array.from(libraryRef.current?.querySelectorAll<HTMLElement>("[data-project-evaluate-id]") ?? []);
    if (typeof IntersectionObserver === "undefined") {
      for (const entry of validEntries.values()) enqueue(entry);
      return;
    }
    const observer = new IntersectionObserver(records => {
      for (const record of records) {
        if (!record.isIntersecting) continue;
        const id = (record.target as HTMLElement).dataset.projectEvaluateId;
        const entry = id ? validEntries.get(id) : null;
        if (entry) { enqueue(entry); observer.unobserve(record.target); }
      }
    }, { root: libraryRef.current, rootMargin: "600px 0px" });
    for (const node of nodes) observer.observe(node);
    return () => observer.disconnect();
  }, [controller, entries]);

  useEffect(() => {
    if (!viewer) return;
    return acquireProjectOpenLeaseV2(viewer.project.snapshot.project.projectId, "viewer");
  }, [viewer]);

  const restorePrimaryFocus = useCallback((entryId: string) => {
    window.setTimeout(() => primaryRefs.current.get(entryId)?.focus({ preventScroll: true }), 0);
  }, []);

  const closeViewer = useCallback(() => {
    const entryId = viewer?.entryId;
    setViewer(null);
    if (entryId) restorePrimaryFocus(entryId);
  }, [restorePrimaryFocus, viewer?.entryId]);

  useEffect(() => {
    if (!viewer) return;
    const entry = entries.find(candidate => candidate.id === viewer.entryId);
    if (!entry) return;
    let active = true;
    let checking = false;
    const revalidateOpenSource = async () => {
      if (checking || document.hidden) return;
      checking = true;
      try {
        const current = await controller.watch(entry);
        if (!active || current.snapshot.projectDigest === viewer.project.snapshot.projectDigest) return;
        const failure = projectFailureMessage("source_changed");
        setViewer(null);
        setNotice(failure.message);
        restorePrimaryFocus(viewer.entryId);
      } catch (error) {
        if (!active) return;
        const failure = projectFailureMessage(error);
        setViewer(null);
        setNotice(failure.message);
        restorePrimaryFocus(viewer.entryId);
      } finally { checking = false; }
    };
    const handle = () => { void revalidateOpenSource(); };
    window.addEventListener("focus", handle);
    window.addEventListener("storage", handle);
    document.addEventListener("visibilitychange", handle);
    return () => {
      active = false;
      window.removeEventListener("focus", handle);
      window.removeEventListener("storage", handle);
      document.removeEventListener("visibilitychange", handle);
    };
  }, [controller, entries, restorePrimaryFocus, viewer]);

  useEffect(() => {
    if (!menu) return;
    const close = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setMenu(null);
    };
    window.addEventListener("pointerdown", close);
    return () => window.removeEventListener("pointerdown", close);
  }, [menu]);

  useEffect(() => {
    if (!dialog) return;
    window.setTimeout(() => dialogInitialRef.current?.focus(), 0);
  }, [dialog]);

  const activateProject = async (entry: ProjectCollectionEntry) => {
    const state = snapshots[entry.id];
    if (state?.status !== "ready" || busyEntryId) return;
    setBusyEntryId(entry.id);
    setNotice(surface === "watch" ? "Checking the exact saved animation…" : "Checking the complete local project before opening…");
    try {
      if (surface === "watch") {
        const current = await controller.watch(entry);
        if (current.snapshot.projectDigest !== state.project.snapshot.projectDigest) throw new Error("source_changed");
        setViewer({ project: current, entryId: entry.id });
        setNotice(null);
      } else {
        const result = await onOpenProject?.(entry);
        if (!result || result.status === "failed") setNotice(`This project could not be opened safely${result?.status === "failed" ? ` (${result.code})` : ""}. The current editor was not changed.`);
        else if (result.status === "stale") setNotice("Open cancelled. Nothing was changed.");
      }
    } catch (error) {
      const failure = projectFailureMessage(error);
      if (failure.code === "source_changed") await loadCollection(failure.message);
      else setNotice(failure.message);
    } finally { setBusyEntryId(null); }
  };

  const openMenu = (entry: ProjectCollectionEntry, x: number, y: number, invoker: HTMLElement) => {
    menuInvokerRef.current = invoker;
    setMenu({ entryId: entry.id, x: Math.max(232, Math.min(x, window.innerWidth - 12)), y: Math.max(12, Math.min(y, window.innerHeight - 210)) });
    window.setTimeout(() => {
      const target = menuRef.current?.querySelector<HTMLButtonElement>('button:not([disabled])') ?? menuRef.current;
      target?.focus();
    }, 0);
  };

  const openMenuFromButton = (entry: ProjectCollectionEntry, button: HTMLButtonElement) => {
    const rect = button.getBoundingClientRect();
    openMenu(entry, Math.min(rect.right, window.innerWidth - 12), Math.min(rect.bottom + 6, window.innerHeight - 12), button);
  };

  const closeDialog = (restore = true) => {
    setDialog(null);
    setDialogError(null);
    if (restore) window.setTimeout(() => menuInvokerRef.current?.focus({ preventScroll: true }), 0);
  };

  const beginCommand = (kind: "rename" | "duplicate" | "delete", entry: ProjectCollectionEntry) => {
    setMenu(null);
    setDialogError(null);
    if (kind === "delete") setDialog({ kind, entry });
    else setDialog({ kind, entry, value: kind === "rename" ? entry.title : `${entry.title} copy` });
  };

  const runDialogCommand = async () => {
    if (!dialog || busyEntryId) return;
    const entry = dialog.entry;
    setBusyEntryId(entry.id);
    setDialogError(null);
    const currentIndex = visibleEntries.findIndex(item => item.id === entry.id);
    const nextLogicalId = visibleEntries[currentIndex + 1]?.id ?? visibleEntries[currentIndex - 1]?.id ?? null;
    const result = dialog.kind === "rename"
      ? await commandOwner.rename(entry, dialog.value)
      : dialog.kind === "duplicate"
        ? await commandOwner.duplicate(entry, dialog.value)
        : await commandOwner.delete(entry);
    setBusyEntryId(null);
    if (!result.ok) {
      if (result.code === "invalid_title" || result.code === "invalid_title_length") {
        setDialogError(result.message);
        dialogInitialRef.current?.focus();
        return;
      }
      setDialog(null);
      setDialogError(null);
      setNotice(result.message);
      if (result.code === "source_changed" || result.code === "stale_revision") {
        pendingFocusIdRef.current = entry.id;
        await loadCollection(result.message);
      } else {
        window.setTimeout(() => menuInvokerRef.current?.focus({ preventScroll: true }), 0);
      }
      return;
    }
    setDialog(null);
    setDialogError(null);
    const focusId = result.kind === "delete" ? nextLogicalId : result.project ? `unified-v2:${result.project.projectId}` : entry.id;
    pendingFocusIdRef.current = focusId;
    await loadCollection(result.kind === "rename" ? "Project renamed." : result.kind === "duplicate" ? "Project duplicated as an independent native copy." : "Project deleted from this browser.");
  };

  const menuEntry = menu ? entries.find(entry => entry.id === menu.entryId) ?? null : null;
  const menuSnapshot = menuEntry ? snapshots[menuEntry.id] : null;
  const nativeManageable = menuEntry?.sourceKind === "unified-v2" && menuEntry.classification === "canonical";
  const canDuplicate = !!menuEntry && menuEntry.classification !== "invalid" && menuSnapshot?.status === "ready";

  const handleMenuKeys = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not([disabled])'));
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (event.key === "Escape") {
      event.preventDefault();
      setMenu(null);
      menuInvokerRef.current?.focus({ preventScroll: true });
    } else if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key) && buttons.length) {
      event.preventDefault();
      const target = event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1 : event.key === "ArrowDown" ? (index + 1 + buttons.length) % buttons.length : (index - 1 + buttons.length) % buttons.length;
      buttons[target]?.focus();
    }
  };

  const handleDialogKeys = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") { event.preventDefault(); closeDialog(); return; }
    if (event.key !== "Tab") return;
    const focusable = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('input,button:not([disabled]),select,textarea,[tabindex]:not([tabindex="-1"])'));
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable.at(-1)!;
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  };

  return (
    <>
      <main ref={libraryRef} className={styles.library} data-project-library={surface === "watch" ? "my-projects" : "open-project"} aria-labelledby="project-library-heading">
        <div className={styles.shell}>
          <header className={styles.header}>
            <button type="button" onClick={onBack} className={styles.secondaryButton}>← Back</button>
            <div className={styles.headingGroup}>
              <div className={styles.eyebrow}>Project library</div>
              <h1 id="project-library-heading">{heading}</h1>
              <p>{help}</p>
            </div>
            <button type="button" onClick={() => void loadCollection()} className={styles.secondaryButton}>Refresh</button>
          </header>

          <div className={styles.localNote} role="note">
            Local only. Projects and posters stay in this browser; {surface === "watch" ? "watching" : "browsing"} does not change saved work or recovery drafts.
          </div>

          <div className={styles.toolbar} aria-label="Project search and sort">
            <label className={styles.searchLabel}><span>Search</span><input type="search" value={query} onChange={event => setQuery(event.currentTarget.value)} placeholder="Search project names" /></label>
            <label className={styles.sortLabel}><span>Sort</span><select value={sort} onChange={event => setSort(event.currentTarget.value as ProjectLibrarySort)}>{sortLabels.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
          </div>

          {notice ? <div className={styles.notice} role="status" aria-live="polite"><span>{notice}</span>{notice.includes("Refresh") ? <button type="button" onClick={() => void loadCollection()} className={styles.inlineButton}>Try again</button> : null}</div> : null}

          <section aria-label="Saved projects" className={styles.results} aria-busy={loading}>
            {loading && entries.length === 0 ? (
              <div className={styles.loadingGrid} aria-label="Loading local projects">{[0, 1, 2].map(index => <div key={index} className={styles.skeletonCard} />)}<div className={styles.loadingText}>Loading saved projects…</div></div>
            ) : collectionUnavailable ? (
              <div className={styles.statePanel}><h2>Projects unavailable</h2><p>Local project storage could not be read. Nothing was changed.</p><button type="button" onClick={() => void loadCollection()} className={styles.primaryButton}>Try again</button></div>
            ) : entries.length === 0 ? (
              <div className={styles.statePanel}><h2>No saved projects</h2><p>No saved projects are available locally in this browser.</p><button type="button" onClick={onBack} className={styles.primaryButton}>Back to Home</button></div>
            ) : visibleEntries.length === 0 ? (
              <div className={styles.statePanel}><h2>No matching projects</h2><p>Try a different project name or clear Search.</p><button type="button" onClick={() => setQuery("")} className={styles.primaryButton}>Clear Search</button></div>
            ) : (
              <div className={styles.grid}>
                {visibleEntries.map(entry => {
                  const state = snapshots[entry.id] ?? (entry.classification === "invalid" ? entryFailure(entry) : { status: "loading" as const });
                  const ready = state.status === "ready";
                  const unavailable = state.status === "failed";
                  const busy = busyEntryId === entry.id;
                  const updatedAt = formatProjectUpdatedAt(entry.updatedAt);
                  const stage = ready ? state.project.snapshot.project.document.logicalStage : null;
                  const fps = ready ? state.project.snapshot.project.document.fps : null;
                  const duration = ready ? state.project.snapshot.durationSeconds : null;
                  const cardDisabled = !ready || busyEntryId !== null;
                  return (
                    <article key={entry.id} className={styles.card} data-project-library-entry={entry.classification} data-project-evaluate-id={entry.classification === "invalid" ? undefined : entry.id}
                      onContextMenu={event => { event.preventDefault(); openMenu(entry, event.clientX, event.clientY, primaryRefs.current.get(entry.id) ?? event.currentTarget); }}
                      onKeyDown={event => {
                        if ((event.shiftKey && event.key === "F10") || event.key === "ContextMenu") {
                          event.preventDefault();
                          const invoker = event.target as HTMLElement;
                          const rect = invoker.getBoundingClientRect();
                          openMenu(entry, rect.left + Math.min(32, rect.width / 2), rect.top + Math.min(32, rect.height / 2), invoker);
                        }
                      }}>
                      <button ref={node => { if (node) primaryRefs.current.set(entry.id, node); else primaryRefs.current.delete(entry.id); }} type="button" className={styles.cardButton} aria-disabled={cardDisabled}
                        aria-label={ready ? `${actionLabel} ${entry.title}` : `${entry.title}. ${unavailable ? state.message : "Preparing saved project details"}`}
                        onClick={() => { if (!cardDisabled) void activateProject(entry); }}>
                        <span className={styles.posterFrame}>{ready ? <ProjectPoster key={state.project.snapshot.projectDigest} project={state.project} /> : <span className={unavailable ? styles.posterFailure : styles.posterStatus}>{unavailable ? "Unavailable" : "Preparing exact poster…"}</span>}</span>
                        <span className={styles.cardBody}>
                          <span className={styles.titleRow}><span className={styles.projectTitle}>{entry.title}</span><span className={ready ? styles.watchPill : styles.statusPill}>{busy ? "Working…" : ready ? actionLabel : unavailable ? "Unavailable" : "Loading"}</span></span>
                          <span className={styles.updatedAt}>{updatedAt.iso ? <time dateTime={updatedAt.iso} aria-label={`Last updated ${updatedAt.iso}`}>{updatedAt.visible}</time> : updatedAt.visible}</span>
                          <span className={styles.metadata}>{ready && stage && fps !== null && duration !== null ? <><span aria-label={`Duration ${duration.toFixed(3)} seconds`}>{formatProjectDuration(duration)}</span><span>{fps} FPS</span><span>{stage.width}×{stage.height}</span></> : unavailable ? <span className={styles.failureText}>{state.message}</span> : <span>Checking duration, FPS, and stage…</span>}</span>
                          <span className={styles.classification}>{projectClassificationLabel(entry)}</span><span className={styles.identity}>ID {shortenProjectIdentity(entry)}</span>
                        </span>
                      </button>
                      <button ref={node => { if (node) overflowRefs.current.set(entry.id, node); else overflowRefs.current.delete(entry.id); }} type="button" className={styles.overflowButton}
                        aria-label={`Manage ${entry.title}`} aria-haspopup="menu" aria-expanded={menu?.entryId === entry.id}
                        onClick={event => { event.stopPropagation(); openMenuFromButton(entry, event.currentTarget); }}>•••</button>
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      </main>

      {menu && menuEntry ? (
        <div ref={menuRef} className={styles.contextMenu} role="menu" tabIndex={-1} aria-label={`Manage ${menuEntry.title}`} style={{ left: menu.x, top: menu.y }} onKeyDown={handleMenuKeys}>
          <button type="button" role="menuitem" disabled={!nativeManageable} onClick={() => beginCommand("rename", menuEntry)}>Rename</button>
          <button type="button" role="menuitem" disabled={!canDuplicate} onClick={() => beginCommand("duplicate", menuEntry)}>Duplicate</button>
          <button type="button" role="menuitem" className={styles.destructiveMenuItem} disabled={!nativeManageable} onClick={() => beginCommand("delete", menuEntry)}>Delete</button>
          {!nativeManageable && menuEntry.classification !== "invalid" ? <p>Open and save a native copy before managing this legacy project.</p> : null}
        </div>
      ) : null}

      {dialog ? (
        <div className={styles.dialogBackdrop} onPointerDown={event => { if (event.target === event.currentTarget) closeDialog(); }}>
          <div className={styles.managementDialog} role="dialog" aria-modal="true" aria-labelledby="management-dialog-title" aria-describedby="management-dialog-description" onKeyDown={handleDialogKeys}>
            <h2 id="management-dialog-title">{dialog.kind === "rename" ? "Rename project" : dialog.kind === "duplicate" ? "Duplicate project" : "Delete project?"}</h2>
            {dialog.kind === "delete" ? (
              <><p id="management-dialog-description">Delete <strong>{dialog.entry.title}</strong>, last updated {formatProjectUpdatedAt(dialog.entry.updatedAt).visible}, ID {shortenProjectIdentity(dialog.entry)}? This removes the saved project and its local history and cannot be undone.</p>
                {dialogError ? <div className={styles.dialogError} role="alert">{dialogError}</div> : null}
                <div className={styles.dialogActions}><button ref={node => { dialogInitialRef.current = node; }} type="button" className={styles.secondaryButton} onClick={() => closeDialog()} disabled={busyEntryId !== null}>Cancel</button><button type="button" className={styles.deleteButton} onClick={() => void runDialogCommand()} disabled={busyEntryId !== null}>{busyEntryId ? "Deleting…" : "Delete project"}</button></div></>
            ) : (
              <><p id="management-dialog-description">{dialog.kind === "rename" ? "Change only this project’s saved name. Its identity and history stay intact." : "Create a new independent native copy with its own identity and history."}</p>
                <label className={styles.dialogField}><span>Project name</span><input ref={node => { dialogInitialRef.current = node; }} value={dialog.value} maxLength={512} onChange={event => setDialog({ ...dialog, value: event.currentTarget.value })} onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); void runDialogCommand(); } }} /></label>
                {dialogError ? <div className={styles.dialogError} role="alert">{dialogError}</div> : null}
                <div className={styles.dialogActions}><button type="button" className={styles.secondaryButton} onClick={() => closeDialog()} disabled={busyEntryId !== null}>Cancel</button><button type="button" className={styles.primaryButton} onClick={() => void runDialogCommand()} disabled={busyEntryId !== null}>{busyEntryId ? "Working…" : dialog.kind === "rename" ? "Rename" : "Duplicate"}</button></div></>
            )}
          </div>
        </div>
      ) : null}

      {viewer ? <ProjectMovieViewer project={viewer.project} onClose={closeViewer} /> : null}
    </>
  );
}
