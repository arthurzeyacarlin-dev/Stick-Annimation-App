import type { UnifiedEncodedAssetV2 } from "./unifiedProjectStorageV2.ts";

export const PROJECT_RECOVERY_SCHEMA_V1 = "project-recovery-envelope/v1" as const;
export const PROJECT_RECOVERY_DRAFT_ID_V1 = "latest" as const;
export const PROJECT_RECOVERY_ENCODING_V1 = "unified-project-storage-v2" as const;
export const PROJECT_RECOVERY_BYTE_LIMIT_V1 = 134_217_728;

export type ProjectRecoveryAssetBindingV1 = Pick<
  UnifiedEncodedAssetV2,
  "assetId" | "sha256" | "byteLength" | "encoding"
>;

export type ProjectRecoveryEnvelopeV1 = {
  schemaVersion: typeof PROJECT_RECOVERY_SCHEMA_V1;
  draftId: typeof PROJECT_RECOVERY_DRAFT_ID_V1;
  draftSequence: number;
  ownerSessionId: string;
  workspaceInstanceId: string;
  sourceProjectId: string;
  sourceRevision: number;
  sourceProjectDigest: string;
  sourceTitle: string;
  workspaceGeneration: number;
  candidateDigest: string;
  candidateEncodingVersion: typeof PROJECT_RECOVERY_ENCODING_V1;
  assetBindings: ProjectRecoveryAssetBindingV1[];
  createdAt: string;
  updatedAt: string;
  lastMeaningfulEditAt: string;
  storedByteLength: number;
  status: "staged" | "current";
};

const sha256 = /^[0-9a-f]{64}$/;
const assetId = /^sha256:[0-9a-f]{64}$/;
const canonicalText = (value: unknown, maximum: number, allowEmpty = false) =>
  typeof value === "string" &&
  value.normalize("NFC") === value &&
  new TextEncoder().encode(value).byteLength <= maximum &&
  (allowEmpty || value.trim().length > 0);
const timestamp = (value: unknown) =>
  typeof value === "string" && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
const exactKeys = (value: object, keys: readonly string[]) =>
  Object.keys(value).sort().join("\n") === [...keys].sort().join("\n");

export const assertProjectRecoveryEnvelopeV1 = (value: unknown): ProjectRecoveryEnvelopeV1 => {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("recovery_invalid_record");
  const envelope = value as ProjectRecoveryEnvelopeV1;
  if (!exactKeys(envelope, [
    "schemaVersion", "draftId", "draftSequence", "ownerSessionId", "workspaceInstanceId",
    "sourceProjectId", "sourceRevision", "sourceProjectDigest", "sourceTitle", "workspaceGeneration",
    "candidateDigest", "candidateEncodingVersion", "assetBindings", "createdAt", "updatedAt",
    "lastMeaningfulEditAt", "storedByteLength", "status",
  ])) throw new Error("recovery_invalid_record");
  if (
    envelope.schemaVersion !== PROJECT_RECOVERY_SCHEMA_V1 ||
    envelope.draftId !== PROJECT_RECOVERY_DRAFT_ID_V1 ||
    envelope.candidateEncodingVersion !== PROJECT_RECOVERY_ENCODING_V1 ||
    (envelope.status !== "staged" && envelope.status !== "current") ||
    !Number.isSafeInteger(envelope.draftSequence) || envelope.draftSequence < 1 ||
    !Number.isSafeInteger(envelope.sourceRevision) || envelope.sourceRevision < 0 ||
    !Number.isSafeInteger(envelope.workspaceGeneration) || envelope.workspaceGeneration < 1 ||
    !Number.isSafeInteger(envelope.storedByteLength) || envelope.storedByteLength < 1 ||
    envelope.storedByteLength > PROJECT_RECOVERY_BYTE_LIMIT_V1 ||
    !canonicalText(envelope.ownerSessionId, 256) ||
    !canonicalText(envelope.workspaceInstanceId, 256) ||
    !canonicalText(envelope.sourceProjectId, 256) ||
    !canonicalText(envelope.sourceTitle, 512, true) ||
    !sha256.test(envelope.sourceProjectDigest) ||
    !sha256.test(envelope.candidateDigest) ||
    !timestamp(envelope.createdAt) || !timestamp(envelope.updatedAt) || !timestamp(envelope.lastMeaningfulEditAt) ||
    Date.parse(envelope.createdAt) > Date.parse(envelope.updatedAt) ||
    Date.parse(envelope.lastMeaningfulEditAt) > Date.parse(envelope.updatedAt) ||
    !Array.isArray(envelope.assetBindings)
  ) throw new Error("recovery_invalid_record");

  const seen = new Set<string>();
  for (const binding of envelope.assetBindings) {
    if (!binding || typeof binding !== "object" || Array.isArray(binding) ||
      !exactKeys(binding, ["assetId", "sha256", "byteLength", "encoding"]) ||
      !assetId.test(binding.assetId) || !sha256.test(binding.sha256) ||
      binding.assetId !== `sha256:${binding.sha256}` || seen.has(binding.assetId) ||
      !Number.isSafeInteger(binding.byteLength) || binding.byteLength < 0 ||
      (binding.encoding !== "typed-array" && binding.encoding !== "data-url")) {
      throw new Error("recovery_invalid_record");
    }
    seen.add(binding.assetId);
  }
  const sortedIds = envelope.assetBindings.map(binding => binding.assetId);
  if (JSON.stringify(sortedIds) !== JSON.stringify([...sortedIds].sort())) throw new Error("recovery_invalid_record");
  return envelope;
};

export const projectRecoveryEnvelopeMatchesOwnerV1 = (
  envelope: ProjectRecoveryEnvelopeV1,
  ownerSessionId: string,
  workspaceInstanceId: string,
) => envelope.ownerSessionId === ownerSessionId && envelope.workspaceInstanceId === workspaceInstanceId;
