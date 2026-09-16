/** The closed set of existing, explicit destructive editor commands. */
export const DESTRUCTIVE_COMMAND_REGISTRY = {
  eraser: { control: "Eraser", target: "sampled raster mask", confirmation: false, referenceRule: "owner pixels only" },
  knife: { control: "Knife", target: "intersected raster or selection", confirmation: false, referenceRule: "selected pieces only" },
  "shape-cutout": { control: "Shape → Cutout", target: "drawn shape mask on the current raster owner", confirmation: false, referenceRule: "current owner; filled shape mask only" },
  "delete-selection": { control: "Delete selection", target: "selected raster, text or instance", confirmation: false, referenceRule: "selected IDs only" },
  "remove-frame": { control: "Remove Frame", target: "selected frame owner and its holds", confirmation: false, referenceRule: "retain timeline minimum" },
  "delete-layer": { control: "Delete Layer", target: "active or context-targeted layer", confirmation: true, referenceRule: "retain one layer" },
  "clear-canvas": { control: "Clear Canvas", target: "current raster owner", confirmation: true, referenceRule: "current owner only" },
  "delete-instance": { control: "Delete Instance", target: "selected symbol instance", confirmation: false, referenceRule: "retain definition and other instances" },
  "delete-definition": { control: "Delete definition", target: "unreferenced symbol definition", confirmation: false, referenceRule: "reject any live reference" },
  "remove-attached-sound": { control: "Remove Attached Sound", target: "selected frame sound attachment", confirmation: false, referenceRule: "retain unrelated asset bytes" },
} as const;

export type DestructiveCommandId = keyof typeof DESTRUCTIVE_COMMAND_REGISTRY;
export type DestructiveCommandRequest = {
  commandId: DestructiveCommandId;
  targetIds: readonly string[];
  availableTargetIds: readonly string[];
  confirmed?: boolean;
  remainingCount?: number;
  referenced?: boolean;
};
export const DESTRUCTIVE_COMMAND_VERSION = 1;
export const DESTRUCTIVE_COMMAND_HISTORY = "one-global-history-entry; exact Undo/Redo";
export const DESTRUCTIVE_COMMAND_PERSISTENCE = "canonical V2 coordinator and repository; retain untargeted content";

export function authorizeDestructiveCommand(request: DestructiveCommandRequest): { allowed: boolean; code: string } {
  const entry = DESTRUCTIVE_COMMAND_REGISTRY[request.commandId];
  if (!entry) return { allowed: false, code: "unknown_destructive_command" };
  if (!request.targetIds.length || new Set(request.targetIds).size !== request.targetIds.length ||
      request.targetIds.some(id => !id || !request.availableTargetIds.includes(id))) {
    return { allowed: false, code: "invalid_destructive_target" };
  }
  if (entry.confirmation && request.confirmed !== true) return { allowed: false, code: "confirmation_required" };
  if ((request.commandId === "delete-layer" || request.commandId === "remove-frame") &&
      (!Number.isSafeInteger(request.remainingCount) || request.remainingCount! < 1)) {
    return { allowed: false, code: "minimum_content_required" };
  }
  if (request.commandId === "delete-definition" && request.referenced !== false) {
    return { allowed: false, code: "definition_referenced" };
  }
  return { allowed: true, code: "authorized" };
}

export type AuthoringSnapshotIdentity = { generation: number; contextKey: string };

/** A readback is publishable only to the unchanged owner that produced it. */
export function isAuthoringSnapshotCurrent(
  before: AuthoringSnapshotIdentity | null | undefined,
  captured: AuthoringSnapshotIdentity | null | undefined,
  after: AuthoringSnapshotIdentity | null | undefined,
  expectedContext: string,
): boolean {
  return Boolean(before && captured && after &&
    Number.isSafeInteger(before.generation) && before.generation >= 0 &&
    before.contextKey === expectedContext && captured.contextKey === expectedContext && after.contextKey === expectedContext &&
    before.generation === captured.generation && captured.generation === after.generation);
}
