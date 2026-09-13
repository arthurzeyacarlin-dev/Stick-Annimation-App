import { migrateLegacySourceReadOnly, type UnifiedLegacyMigrationSourceV1 } from "./unifiedAnimationMigration.ts";
import { validateUnifiedAnimationCandidateV1, type UnifiedAnimationMigrationCandidateV1 } from "./unifiedAnimationContract.ts";
import type { ProjectSourceReader } from "./unifiedProjectSourceReader.ts";

export type ProjectCollectionEntry = {
  id: string;
  locator: string;
  title: string;
  updatedAt: string | null;
  classification: "canonical" | "legacy" | "invalid";
  sourceKind: UnifiedLegacyMigrationSourceV1["sourceKind"] | "unified-v1" | "unified-v2";
  sourceId: string;
  sourceDigest: string | null;
  candidateDigest: string | null;
  error: string | null;
  protectedSource: boolean;
  provenanceKey: string | null;
};
const compareId = (left: string, right: string) => left < right ? -1 : left > right ? 1 : 0;
const timestamp = (value: string | null) => value ? Date.parse(value) || 0 : 0;
const sourceProvenanceKey = (entry: Pick<ProjectCollectionEntry, "sourceKind" | "sourceId" | "sourceDigest">) =>
  entry.sourceDigest ? `${entry.sourceKind}:${entry.sourceId}:${entry.sourceDigest}` : null;
const collectionError = (failure: unknown) => {
  if (failure && typeof failure === "object" && "code" in failure && typeof failure.code === "string") return failure.code;
  if (failure instanceof Error && ["asset_missing", "asset_digest_mismatch", "invalid_record", "unsupported_version", "project_too_large", "source_digest_mismatch", "invalid_cell_owner", "source_space_inconsistent"].includes(failure.message)) return failure.message;
  return "storage_read_failed";
};

// Canonical records have no repository until the persistence phase. This pure
// collection rule already defines exact-provenance adoption without title dedupe.
export const orderProjectCollection = (entries: readonly ProjectCollectionEntry[]): ProjectCollectionEntry[] => {
  const sorted = entries.map((entry) => ({ ...entry })).sort((left, right) => timestamp(right.updatedAt) - timestamp(left.updatedAt) || compareId(left.id, right.id));
  const canonical = new Map<string, ProjectCollectionEntry>();
  for (const entry of sorted) {
    if (entry.classification === "canonical" && entry.provenanceKey && !canonical.has(entry.provenanceKey)) canonical.set(entry.provenanceKey, entry);
  }
  const seen = new Set<string>();
  return sorted.filter((entry) => {
    if (entry.classification === "invalid") return true;
    const key = entry.provenanceKey ?? sourceProvenanceKey(entry) ?? `identity:${entry.id}`;
    const adopted = canonical.get(key);
    if (adopted && entry !== adopted) { adopted.protectedSource ||= entry.classification === "legacy"; return false; }
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

export const listProjectCollection = async (reader: ProjectSourceReader): Promise<ProjectCollectionEntry[]> => {
  const entries: ProjectCollectionEntry[] = [];
  for (const source of await reader.list()) {
    let candidate: UnifiedAnimationMigrationCandidateV1 | null = null;
    let error = source.error ?? null;
    if (!error && source.sourceKind === "unified-v2") {
      entries.push({ id: source.locator, locator: source.locator, title: source.title, updatedAt: source.updatedAt, classification: "canonical", sourceKind: source.sourceKind, sourceId: source.sourceId, sourceDigest: source.sourceId, candidateDigest: source.sourceId, error: null, protectedSource: false, provenanceKey: source.canonicalAdoptionKey ?? null });
      continue;
    }
    if (!error) {
      try {
        const raw = await source.read();
        if (raw.sourceKind === "unified-v1") candidate = await validateUnifiedAnimationCandidateV1(raw.candidate);
        else {
          const result = await migrateLegacySourceReadOnly(raw);
          if (result.ok) candidate = result.candidate;
          else error = result.error.code;
        }
      } catch (failure) { error = collectionError(failure); }
    }
    entries.push({
      id: `${source.sourceKind}:${source.sourceId}:${source.locator}`, locator: source.locator,
      title: candidate?.project.title ?? source.title, updatedAt: candidate?.project.updatedAt ?? source.updatedAt,
      classification: candidate ? "legacy" : "invalid", sourceKind: source.sourceKind, sourceId: source.sourceId,
      sourceDigest: candidate ? (source.sourceKind === "unified-v1" ? candidate.project.candidateDigest : candidate.project.provenance.sourceRecordDigest) : null, candidateDigest: candidate?.project.candidateDigest ?? null,
      error, protectedSource: false,
      provenanceKey: candidate ? `${source.sourceKind}:${source.sourceId}:${source.sourceKind === "unified-v1" ? candidate.project.candidateDigest : candidate.project.provenance.sourceRecordDigest}` : null,
    });
  }
  // Conflicting records for one source identity are ambiguous, even when titles
  // agree. Keep each recoverable entry visible and prohibit partial opening.
  const digests = new Map<string, Set<string>>();
  for (const entry of entries) {
    const key = `${entry.sourceKind.startsWith("stick") ? "stick" : entry.sourceKind}:${entry.sourceId}`;
    const values = digests.get(key) ?? new Set<string>();
    values.add(entry.sourceDigest ?? `invalid:${entry.locator}`);
    digests.set(key, values);
  }
  for (const entry of entries) {
    const key = `${entry.sourceKind.startsWith("stick") ? "stick" : entry.sourceKind}:${entry.sourceId}`;
    if ((digests.get(key)?.size ?? 0) > 1) { entry.classification = "invalid"; entry.error = "duplicate_identity"; }
  }
  return orderProjectCollection(entries);
};

export const readCollectionCandidate = async (reader: ProjectSourceReader, entry: ProjectCollectionEntry) => {
  if (entry.sourceKind === "unified-v2") throw new Error("native_v2_direct_read");
  if (entry.classification === "invalid" || !entry.candidateDigest) throw new Error(entry.error ?? "invalid_record");
  const sources = await reader.list();
  const source = sources.find((value) => value.locator === entry.locator && value.sourceId === entry.sourceId && value.sourceKind === entry.sourceKind);
  if (!source || source.error) throw new Error("source_changed");
  const raw = await source.read();
  const candidate = raw.sourceKind === "unified-v1"
    ? await validateUnifiedAnimationCandidateV1(raw.candidate)
    : await migrateLegacySourceReadOnly(raw).then(result => { if (!result.ok) throw new Error(result.error.code); return result.candidate; });
  const sourceDigest = raw.sourceKind === "unified-v1" ? candidate.project.candidateDigest : candidate.project.provenance.sourceRecordDigest;
  if (candidate.project.candidateDigest !== entry.candidateDigest || sourceDigest !== entry.sourceDigest) throw new Error("source_changed");
  // A second same-ID source introduced after listing must also fail closed.
  for (const duplicate of sources.filter((value) => value !== source && value.sourceId === entry.sourceId && (value.sourceKind === entry.sourceKind || value.sourceKind.startsWith("stick") && entry.sourceKind.startsWith("stick")))) {
    if (duplicate.error) throw new Error("duplicate_identity");
    const duplicateRaw = await duplicate.read();
    const mappedCandidate = duplicateRaw.sourceKind === "unified-v1"
      ? await validateUnifiedAnimationCandidateV1(duplicateRaw.candidate)
      : await migrateLegacySourceReadOnly(duplicateRaw).then(result => { if (!result.ok) throw new Error("duplicate_identity"); return result.candidate; });
    if (mappedCandidate.project.candidateDigest !== entry.candidateDigest) throw new Error("duplicate_identity");
  }
  return { candidate, source: raw };
};
