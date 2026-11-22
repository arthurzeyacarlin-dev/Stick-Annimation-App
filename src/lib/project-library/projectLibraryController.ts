import { listProjectCollection, type ProjectCollectionEntry } from "../animation/unifiedProjectCollection.ts";
import { createBrowserProjectSourceReader, type ProjectSourceReader } from "../animation/unifiedProjectSourceReader.ts";
import { assertDrawingOnlyUnifiedProjectV2 } from "../animation/unifiedAnimationContractV2.ts";
import { retireLegacyRigsV3 } from "../animation/legacyRigRetirementV3.ts";
import { getExportAuthoredFrameCount, loadExportProjectSnapshot } from "../export/exportPhase1.ts";
import { frameHasVisibleCanonicalContent, resolveCanonicalPosterFrameIndex, type ProjectLibrarySnapshot } from "./projectLibraryModel.ts";

export type ProjectLibraryController = {
  list: () => Promise<ProjectCollectionEntry[]>;
  evaluate: (entry: ProjectCollectionEntry) => Promise<ProjectLibrarySnapshot>;
  enqueueVisible: (
    entry: ProjectCollectionEntry,
    onSettled: (entry: ProjectCollectionEntry, result: { project: ProjectLibrarySnapshot } | { error: unknown }) => void,
    isCurrent?: () => boolean,
  ) => void;
  evaluateVisibleQueue: (
    entries: readonly ProjectCollectionEntry[],
    onSettled: (entry: ProjectCollectionEntry, result: { project: ProjectLibrarySnapshot } | { error: unknown }) => void,
    isCurrent?: () => boolean,
  ) => Promise<void>;
  watch: (entry: ProjectCollectionEntry) => Promise<ProjectLibrarySnapshot>;
};

export const createProjectLibraryController = (createReader: () => ProjectSourceReader): ProjectLibraryController => {
  const load = async (entry: ProjectCollectionEntry): Promise<ProjectLibrarySnapshot> => {
    const snapshot = await loadExportProjectSnapshot(createReader(), entry);
    return { snapshot, posterFrameIndex: resolveCanonicalPosterFrameIndex(snapshot) };
  };
  // (Nov 14) A card and the home screen show ONE frame of a project (its poster) and its length. They used to open the
  // whole project for that, four projects at a time, and keep them all: with long AI animations (5 GB opened each)
  // that froze the page and crashed the tab. Now only the frames up to the first one with something on it are
  // opened. Watch and Export still open the project whole (`watch`), and check it is the same version.
  // null = this project cannot be read that way (an old one-file save not opened on this computer yet, an old rig
  // project that is converted on opening): it is opened whole, as before.
  const loadPoster = async (entry: ProjectCollectionEntry): Promise<ProjectLibrarySnapshot | null> => {
    const reader = createReader();
    if (!reader.readPosterProject || entry.sourceKind !== "unified-v2" || entry.classification === "invalid") return null;
    for (let cells = 2; ; cells *= 8) {
      const read = await reader.readPosterProject(entry.sourceId, cells);
      if (!read || read.projectDigest !== entry.candidateDigest || (entry.updatedAt && read.project.updatedAt !== entry.updatedAt)) return null;
      if (await retireLegacyRigsV3(read.project, { sourceKind: "unified-v2", sourceDigest: read.projectDigest }) !== read.project) return null;
      const project = assertDrawingOnlyUnifiedProjectV2(read.project);
      const frameCount = getExportAuthoredFrameCount(project);
      const snapshot = { entry: { ...entry }, project, projectDigest: read.projectDigest, frameCount, durationSeconds: frameCount / project.document.fps };
      const posterFrameIndex = resolveCanonicalPosterFrameIndex(snapshot);
      if (read.complete || (posterFrameIndex < cells && frameHasVisibleCanonicalContent(project, posterFrameIndex))) return { snapshot, posterFrameIndex };
    }
  };
  const loadCard = async (entry: ProjectCollectionEntry) => await loadPoster(entry).catch(() => null) ?? load(entry);
  type QueueTask = {
    entry: ProjectCollectionEntry;
    onSettled: (entry: ProjectCollectionEntry, result: { project: ProjectLibrarySnapshot } | { error: unknown }) => void;
    isCurrent: () => boolean;
  };
  const pending: QueueTask[] = [];
  let active = 0;
  const pump = () => {
    while (active < 4 && pending.length > 0) {
      const task = pending.shift()!;
      if (!task.isCurrent()) continue;
      active += 1;
      void loadCard(task.entry)
        .then(project => { if (task.isCurrent()) task.onSettled(task.entry, { project }); })
        .catch(error => { if (task.isCurrent()) task.onSettled(task.entry, { error }); })
        .finally(() => { active -= 1; pump(); });
    }
  };
  const enqueueVisible: ProjectLibraryController["enqueueVisible"] = (entry, onSettled, isCurrent = () => true) => {
    pending.push({ entry, onSettled, isCurrent });
    pump();
  };
  return {
    list: () => listProjectCollection(createReader()),
    evaluate: loadCard,
    enqueueVisible,
    evaluateVisibleQueue: async (entries, onSettled, isCurrent = () => true) => {
      if (entries.length === 0) return;
      await new Promise<void>(resolve => {
        let settled = 0;
        for (const entry of entries) {
          enqueueVisible(entry, (settledEntry, result) => {
            onSettled(settledEntry, result);
            settled += 1;
            if (settled === entries.length) resolve();
          }, isCurrent);
        }
      });
    },
    watch: load,
  };
};

export const createBrowserProjectLibraryController = () => createProjectLibraryController(createBrowserProjectSourceReader);
