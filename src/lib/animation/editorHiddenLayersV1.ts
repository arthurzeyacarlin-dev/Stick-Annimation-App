// SPEC-0020 Phase 7 (Arthur): the editor's eye button is remembered with the project.
// The saved project keeps the hidden layers' document ids in `auxiliary.editorHiddenLayerIds`
// (editor-only — export and thumbnails still show every layer). The editor's own layer ids and the
// saved document's layers line up by position, exactly like the rest of the save/reopen code.

/** Saved document layer ids of the layers hidden in the editor. */
export const savedHiddenLayerIdsV1 = (
  documentLayerIds: readonly string[],
  workspaceLayerIds: readonly string[],
  hiddenWorkspaceLayerIds: readonly string[],
): string[] => {
  if (hiddenWorkspaceLayerIds.length === 0) return [];
  const hidden = new Set(hiddenWorkspaceLayerIds);
  return documentLayerIds.filter((_, index) => hidden.has(workspaceLayerIds[index]));
};

/** Editor layer ids that start hidden when a saved project opens. */
export const openedHiddenLayerIdsV1 = (
  savedHiddenLayerIds: unknown,
  documentLayerIds: readonly string[],
  workspaceLayerIds: readonly string[],
): string[] => {
  if (!Array.isArray(savedHiddenLayerIds) || savedHiddenLayerIds.length === 0) return [];
  if (documentLayerIds.length !== workspaceLayerIds.length) return [];
  const saved = new Set(savedHiddenLayerIds.filter((id): id is string => typeof id === "string"));
  return workspaceLayerIds.filter((_, index) => saved.has(documentLayerIds[index]));
};
