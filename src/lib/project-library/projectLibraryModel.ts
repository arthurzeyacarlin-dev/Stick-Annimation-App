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

export type ProjectLibrarySort = "updated-desc" | "updated-asc" | "name-asc" | "name-desc";

const normalizedTitle = (title: string) => {
  try { return title.normalize("NFC"); } catch { return title; }
};

const stableIdentity = (entry: ProjectCollectionEntry) => `${entry.sourceKind}:${entry.sourceId}:${entry.locator}`;

export const filterAndSortProjectEntries = (
  entries: readonly ProjectCollectionEntry[],
  query: string,
  sort: ProjectLibrarySort,
) => {
  const collator = new Intl.Collator(undefined, { sensitivity: "base", numeric: true, usage: "sort" });
  const needle = normalizedTitle(query).trim().toLocaleLowerCase();
  return entries
    .filter(entry => !needle || normalizedTitle(entry.title).toLocaleLowerCase().includes(needle))
    .map(entry => ({ ...entry }))
    .sort((left, right) => {
      let result = 0;
      if (sort === "updated-desc" || sort === "updated-asc") {
        const leftTime = left.updatedAt ? Date.parse(left.updatedAt) : Number.NaN;
        const rightTime = right.updatedAt ? Date.parse(right.updatedAt) : Number.NaN;
        const leftValid = Number.isFinite(leftTime);
        const rightValid = Number.isFinite(rightTime);
        if (leftValid !== rightValid) result = leftValid ? -1 : 1;
        else if (leftValid && rightValid) result = sort === "updated-desc" ? rightTime - leftTime : leftTime - rightTime;
      } else {
        result = collator.compare(normalizedTitle(left.title), normalizedTitle(right.title));
        if (sort === "name-desc") result *= -1;
      }
      return result || stableIdentity(left).localeCompare(stableIdentity(right));
    });
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

// SPEC-0020 Phase 5: a project's length in plain words. Short animations show
// tenths of a second ("0.3 s") instead of "0:00"; longer ones show m:ss.
export const formatProjectLength = (durationSeconds: number) => {
  const totalSeconds = Number.isFinite(durationSeconds) ? Math.max(0, durationSeconds) : 0;
  if (totalSeconds < 10) {
    const tenths = Math.round(totalSeconds * 10) / 10;
    return `${Number.isInteger(tenths) ? tenths : tenths.toFixed(1)} s`;
  }
  return formatProjectDuration(totalSeconds);
};

export const formatProjectUpdatedAt = (updatedAt: string | null) => {
  if (!updatedAt) return { visible: "Save time unknown", iso: null };
  const value = new Date(updatedAt);
  if (Number.isNaN(value.getTime())) return { visible: "Save time unknown", iso: null };
  return { visible: value.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }), iso: value.toISOString() };
};

// SPEC-0020 Phase 5: "Edited 5 minutes ago" / "Edited yesterday" / "Edited Oct 3".
export const formatProjectEditedAgo = (updatedAt: string | null, now = Date.now()) => {
  const time = updatedAt ? Date.parse(updatedAt) : Number.NaN;
  if (!Number.isFinite(time)) return "Edited earlier";
  const minutes = Math.floor(Math.max(0, now - time) / 60_000);
  if (minutes < 1) return "Edited just now";
  if (minutes < 60) return `Edited ${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Edited ${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "Edited yesterday";
  if (days < 7) return `Edited ${days} days ago`;
  const date = new Date(time);
  const sameYear = date.getFullYear() === new Date(now).getFullYear();
  return `Edited ${date.toLocaleDateString(undefined, sameYear ? { month: "short", day: "numeric" } : { month: "short", day: "numeric", year: "numeric" })}`;
};

export const projectClassificationLabel = (entry: ProjectCollectionEntry) => {
  if (entry.classification === "invalid") return "Can't be opened";
  if (entry.classification === "legacy") return "Older project";
  return "Saved animation";
};

export const projectFailureMessage = (error: unknown) => {
  const code = error instanceof Error ? error.message : typeof error === "string" ? error : "storage_read_failed";
  if (code === "source_changed") return { code, message: "This project changed or was deleted. Refresh and try again." };
  if (code === "duplicate_identity") return { code, message: "Two saved copies of this project don't match, so it can't be opened." };
  if (code === "asset_missing" || code === "asset_digest_mismatch" || code === "source_digest_mismatch") {
    return { code, message: "Part of this project is missing or damaged, so it can't be opened." };
  }
  if (code === "invalid_record" || code === "invalid_cell_owner" || code === "source_space_inconsistent") {
    return { code, message: "This project is damaged and can't be opened." };
  }
  if (code === "unsupported_version" || code === "rig_migration_incomplete") {
    return { code, message: "This project was made with an older version of the app and can't be opened yet." };
  }
  if (code === "project_too_large") return { code, message: "This project is too big to open." };
  if (code === "no_frames") return { code, message: "This animation has no frames to export yet." };
  return { code, message: "This project can't be opened right now. Nothing was changed." };
};
