"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ProjectCollectionEntry } from "@/src/lib/animation/unifiedProjectCollection";
import { createBrowserProjectLibraryController } from "@/src/lib/project-library/projectLibraryController";
import {
  formatProjectDuration,
  formatProjectUpdatedAt,
  projectClassificationLabel,
  projectFailureMessage,
  shortenProjectIdentity,
  type ProjectLibrarySnapshot,
} from "@/src/lib/project-library/projectLibraryModel";
import { ProjectMovieViewer } from "../project-player/ProjectMovieViewer";
import { ProjectPoster } from "./ProjectPoster";
import styles from "./projectLibrary.module.css";

type Props = { onBack: () => void };
type SnapshotState =
  | { status: "loading" }
  | { status: "ready"; project: ProjectLibrarySnapshot }
  | { status: "failed"; code: string; message: string };

const entryFailure = (entry: ProjectCollectionEntry): SnapshotState => {
  const failure = projectFailureMessage(entry.error ?? "invalid_record");
  return { status: "failed", ...failure };
};

export function ProjectLibrary({ onBack }: Props) {
  const controller = useMemo(() => createBrowserProjectLibraryController(), []);
  const [entries, setEntries] = useState<ProjectCollectionEntry[]>([]);
  const [snapshots, setSnapshots] = useState<Record<string, SnapshotState>>({});
  const [loading, setLoading] = useState(true);
  const [collectionUnavailable, setCollectionUnavailable] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [busyEntryId, setBusyEntryId] = useState<string | null>(null);
  const [viewer, setViewer] = useState<{ project: ProjectLibrarySnapshot; entryId: string } | null>(null);
  const generationRef = useRef(0);
  const cardRefs = useRef(new Map<string, HTMLButtonElement>());
  const queuedEntryIdsRef = useRef(new Set<string>());
  const libraryRef = useRef<HTMLElement | null>(null);

  const loadCollection = useCallback(async (nextNotice: string | null = null) => {
    const generation = generationRef.current + 1;
    generationRef.current = generation;
    setLoading(true);
    setCollectionUnavailable(false);
    setNotice(nextNotice);
    queuedEntryIdsRef.current.clear();
    try {
      const collection = await controller.list();
      if (generationRef.current !== generation) return;
      setEntries(collection);
      setLoading(false);
      const initialStates: Record<string, SnapshotState> = {};
      for (const entry of collection) {
        if (entry.classification === "invalid") initialStates[entry.id] = entryFailure(entry);
        else initialStates[entry.id] = { status: "loading" };
      }
      setSnapshots(initialStates);
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
    const generation = generationRef.current;
    const validEntries = new Map(entries.filter(entry => entry.classification !== "invalid").map(entry => [entry.id, entry]));
    if (validEntries.size === 0) return;
    const settle = (entry: ProjectCollectionEntry, result: { project: ProjectLibrarySnapshot } | { error: unknown }) => {
      if (generationRef.current !== generation) return;
      if ("project" in result) {
        setSnapshots(current => ({ ...current, [entry.id]: { status: "ready", project: result.project } }));
      } else {
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
        if (entry) {
          enqueue(entry);
          observer.unobserve(record.target);
        }
      }
    }, { root: libraryRef.current, rootMargin: "600px 0px" });
    for (const node of nodes) observer.observe(node);
    return () => observer.disconnect();
  }, [controller, entries]);

  const restoreCardFocus = useCallback((entryId: string) => {
    window.setTimeout(() => cardRefs.current.get(entryId)?.focus({ preventScroll: true }), 0);
  }, []);

  const closeViewer = useCallback(() => {
    const entryId = viewer?.entryId;
    setViewer(null);
    if (entryId) restoreCardFocus(entryId);
  }, [restoreCardFocus, viewer?.entryId]);

  const watchProject = async (entry: ProjectCollectionEntry) => {
    const state = snapshots[entry.id];
    if (state?.status !== "ready" || busyEntryId) return;
    setBusyEntryId(entry.id);
    setNotice("Checking the exact saved animation…");
    try {
      const current = await controller.watch(entry);
      if (current.snapshot.projectDigest !== state.project.snapshot.projectDigest) throw new Error("source_changed");
      setViewer({ project: current, entryId: entry.id });
      setNotice(null);
    } catch (error) {
      const failure = projectFailureMessage(error);
      if (failure.code === "source_changed") await loadCollection(failure.message);
      else setNotice(failure.message);
    } finally {
      setBusyEntryId(null);
    }
  };

  return (
    <main ref={libraryRef} className={styles.library} data-project-library="my-projects" aria-labelledby="my-projects-heading">
      <div className={styles.shell}>
        <header className={styles.header}>
          <button type="button" onClick={onBack} className={styles.secondaryButton}>← Back</button>
          <div className={styles.headingGroup}>
            <div className={styles.eyebrow}>Project library</div>
            <h1 id="my-projects-heading">My Projects</h1>
            <p>Watch saved animations stored in this browser</p>
          </div>
          <button type="button" onClick={() => void loadCollection()} className={styles.secondaryButton}>Refresh</button>
        </header>

        <div className={styles.localNote} role="note">
          Local only. Projects and posters stay in this browser; watching does not change saved work or recovery drafts.
        </div>

        {notice ? (
          <div className={styles.notice} role="status" aria-live="polite">
            <span>{notice}</span>
            {notice.includes("Refresh") ? <button type="button" onClick={() => void loadCollection()} className={styles.inlineButton}>Try again</button> : null}
          </div>
        ) : null}

        <section aria-label="Saved projects" className={styles.results} aria-busy={loading}>
          {loading && entries.length === 0 ? (
            <div className={styles.loadingGrid} aria-label="Loading local projects">
              {[0, 1, 2].map(index => <div key={index} className={styles.skeletonCard} />)}
              <div className={styles.loadingText}>Loading saved projects…</div>
            </div>
          ) : collectionUnavailable ? (
            <div className={styles.statePanel}>
              <h2>Projects unavailable</h2>
              <p>Local project storage could not be read. Nothing was changed.</p>
              <button type="button" onClick={() => void loadCollection()} className={styles.primaryButton}>Try again</button>
            </div>
          ) : entries.length === 0 ? (
            <div className={styles.statePanel}>
              <h2>No saved projects</h2>
              <p>No saved projects are available locally in this browser.</p>
              <button type="button" onClick={onBack} className={styles.primaryButton}>Back to Home</button>
            </div>
          ) : (
            <div className={styles.grid}>
              {entries.map(entry => {
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
                  <article
                    key={entry.id}
                    className={styles.card}
                    data-project-library-entry={entry.classification}
                    data-project-evaluate-id={entry.classification === "invalid" ? undefined : entry.id}
                  >
                    <button
                      ref={node => {
                        if (node) cardRefs.current.set(entry.id, node);
                        else cardRefs.current.delete(entry.id);
                      }}
                      type="button"
                      className={styles.cardButton}
                      aria-disabled={cardDisabled}
                      aria-label={ready ? `Watch ${entry.title}` : `${entry.title}. ${unavailable ? state.message : "Preparing saved project details"}`}
                      onClick={() => { if (!cardDisabled) void watchProject(entry); }}
                    >
                      <span className={styles.posterFrame}>
                        {ready ? <ProjectPoster key={state.project.snapshot.projectDigest} project={state.project} /> : (
                          <span className={unavailable ? styles.posterFailure : styles.posterStatus}>
                            {unavailable ? "Unavailable" : "Preparing exact poster…"}
                          </span>
                        )}
                      </span>
                      <span className={styles.cardBody}>
                        <span className={styles.titleRow}>
                          <span className={styles.projectTitle}>{entry.title}</span>
                          <span className={ready ? styles.watchPill : styles.statusPill}>{busy ? "Checking…" : ready ? "Watch" : unavailable ? "Unavailable" : "Loading"}</span>
                        </span>
                        <span className={styles.updatedAt}>
                          {updatedAt.iso ? <time dateTime={updatedAt.iso} aria-label={`Last updated ${updatedAt.iso}`}>{updatedAt.visible}</time> : updatedAt.visible}
                        </span>
                        <span className={styles.metadata}>
                          {ready && stage && fps !== null && duration !== null ? (
                            <>
                              <span aria-label={`Duration ${duration.toFixed(3)} seconds`}>{formatProjectDuration(duration)}</span>
                              <span>{fps} FPS</span>
                              <span>{stage.width}×{stage.height}</span>
                            </>
                          ) : unavailable ? <span className={styles.failureText}>{state.message}</span> : <span>Checking duration, FPS, and stage…</span>}
                        </span>
                        <span className={styles.classification}>{projectClassificationLabel(entry)}</span>
                        <span className={styles.identity}>ID {shortenProjectIdentity(entry)}</span>
                      </span>
                    </button>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </div>
      {viewer ? <ProjectMovieViewer project={viewer.project} onClose={closeViewer} /> : null}
    </main>
  );
}
