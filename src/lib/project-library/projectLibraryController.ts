import { listProjectCollection, type ProjectCollectionEntry } from "../animation/unifiedProjectCollection.ts";
import { createBrowserProjectSourceReader, type ProjectSourceReader } from "../animation/unifiedProjectSourceReader.ts";
import { loadExportProjectSnapshot } from "../export/exportPhase1.ts";
import { resolveCanonicalPosterFrameIndex, type ProjectLibrarySnapshot } from "./projectLibraryModel.ts";

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
      void load(task.entry)
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
    evaluate: load,
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
