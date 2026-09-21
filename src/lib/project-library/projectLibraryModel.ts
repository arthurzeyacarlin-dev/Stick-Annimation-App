import type { UnifiedAnimationProjectV2 } from "../animation/unifiedAnimationContractV2.ts";
import type { UnifiedRasterBitmapV2 } from "../animation/unifiedAnimationContentV2.ts";
import type { ProjectCollectionEntry } from "../animation/unifiedProjectCollection.ts";
import {
  resolveExportOwnerCell,
  resolveExportRasterPlacement,
  type ExportProjectSnapshot,
} from "../export/exportPhase1.ts";

export type ProjectLibrarySnapshot = {
  snapshot: ExportProjectSnapshot;
  posterFrameIndex: number;
};

const bitmapHasVisiblePixel = (bitmap: UnifiedRasterBitmapV2) => {
  for (let alphaIndex = 3; alphaIndex < bitmap.data.length; alphaIndex += 4) {
    if (bitmap.data[alphaIndex] !== 0) return true;
  }
  return false;
};

const frameHasVisibleCanonicalContent = (project: UnifiedAnimationProjectV2, frameIndex: number) => {
  const definitions = new Map(project.document.catalogs.symbols.map(definition => [definition.definitionId, definition.definitionDigest]));
  for (const layer of project.document.layers) {
    if (!layer.visible) continue;
    const owner = resolveExportOwnerCell(layer, frameIndex);
    if (!owner?.content) continue;
    for (const item of owner.content.items) {
      if (item.kind === "drawing-raster/v1") {
        const placement = resolveExportRasterPlacement(layer, frameIndex, item);
        if (placement && bitmapHasVisiblePixel(placement.bitmap)) return true;
        continue;
      }
      if (item.kind === "drawing-text/v1") {
        if (item.text.length > 0 && item.fontSize > 0 && item.width > 0) return true;
        continue;
      }
      if (item.kind === "symbol-instance/v1") {
        if (item.width > 0 && item.height > 0 && definitions.get(item.definitionId) === item.definitionDigest) return true;
      }
    }
  }
  return false;
};

export const resolveCanonicalPosterFrameIndex = (snapshot: ExportProjectSnapshot) => {
  for (let frameIndex = 0; frameIndex < snapshot.frameCount; frameIndex += 1) {
    if (frameHasVisibleCanonicalContent(snapshot.project, frameIndex)) return frameIndex;
  }
  return 0;
};

export const formatProjectDuration = (durationSeconds: number) => {
  const totalSeconds = Math.max(0, durationSeconds);
  const roundedSeconds = Math.floor(totalSeconds + 0.000_001);
  const hours = Math.floor(roundedSeconds / 3_600);
  const minutes = Math.floor((roundedSeconds % 3_600) / 60);
  const seconds = roundedSeconds % 60;
  if (hours > 0) return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
};

export const formatProjectUpdatedAt = (updatedAt: string | null) => {
  if (!updatedAt) return { visible: "Saved locally · time unavailable", iso: null };
  const value = new Date(updatedAt);
  if (Number.isNaN(value.getTime())) return { visible: "Saved locally · invalid saved time", iso: null };
  return { visible: value.toLocaleString(), iso: value.toISOString() };
};

export const shortenProjectIdentity = (entry: ProjectCollectionEntry) => {
  const identity = entry.sourceId || entry.locator;
  return identity.length <= 18 ? identity : `${identity.slice(0, 8)}…${identity.slice(-6)}`;
};

export const projectClassificationLabel = (entry: ProjectCollectionEntry) => {
  if (entry.classification === "invalid") return "Unavailable local record";
  if (entry.classification === "legacy") return "Protected legacy source";
  if (entry.protectedSource) return "Native project · original legacy source kept";
  return "Native project · saved in this browser";
};

export const projectFailureMessage = (error: unknown) => {
  const code = error instanceof Error ? error.message : typeof error === "string" ? error : "storage_read_failed";
  if (code === "source_changed") return { code, message: "Project changed or was deleted. Refresh and try again." };
  if (code === "duplicate_identity") return { code, message: "Conflicting local records share this project identity. Watching is disabled." };
  if (code === "asset_missing" || code === "asset_digest_mismatch" || code === "source_digest_mismatch") {
    return { code, message: "Saved project data is missing or corrupt. The record remains listed." };
  }
  if (code === "invalid_record" || code === "invalid_cell_owner" || code === "source_space_inconsistent") {
    return { code, message: "This local project record is invalid and cannot be watched safely." };
  }
  if (code === "unsupported_version" || code === "rig_migration_incomplete") {
    return { code, message: "This local project format is not supported for watching yet." };
  }
  if (code === "project_too_large") return { code, message: "This project is too large to load safely." };
  return { code, message: "This local project is unavailable. Nothing was changed." };
};
