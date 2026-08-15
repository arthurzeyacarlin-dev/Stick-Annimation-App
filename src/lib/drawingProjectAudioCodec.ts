import {
  DRAWING_PROJECT_V2_LIMITS,
  DrawingProjectV2Error,
  parseDrawingSoundAttachmentV2,
  requireCanonicalString,
  requireExactKeys,
  requireProjectId,
  requireUtcTimestamp,
  type DrawingProjectAudioAssetV2,
  type DrawingProjectV2ErrorCode,
  type DrawingSoundAttachmentV2,
} from "./drawingProjectV2Contract.ts";
import { sha256Hex } from "./drawingProjectV2Canonical.ts";

const AUDIO_PREFIX = "data:audio/wav;base64,";
const CANONICAL_BASE64 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

export type LiveDrawingSoundAttachment = {
  id: string;
  title: string;
  description: string;
  timingFeel: string | null;
  intensityFeel: string | null;
  audioDataUrl: string | null;
  contentType: "sfx" | "voice-placeholder";
  speechText: string | null;
  sourceTask: "generate-sounds";
  attachedAt: string;
};

const invalidAudio = (stage: string, message: string, code: DrawingProjectV2ErrorCode = "invalid_record"): never => {
  throw new DrawingProjectV2Error(code, stage, message);
};

export const assertCanonicalAudioBase64Length = (characterLength: number) => {
  if (!Number.isSafeInteger(characterLength) || characterLength < 4 || characterLength % 4 !== 0) {
    invalidAudio("audio.data-url", "Audio base64 length is malformed or oversized.");
  }
  if (characterLength > DRAWING_PROJECT_V2_LIMITS.audioBase64Characters) {
    invalidAudio("audio.data-url", "Audio base64 length exceeds the project limit.", "project_too_large");
  }
  return characterLength;
};

const decodeCanonicalBase64 = (payload: string) => {
  assertCanonicalAudioBase64Length(payload.length);
  if (!CANONICAL_BASE64.test(payload)) {
    invalidAudio("audio.data-url", "Audio base64 is malformed, noncanonical, or oversized.");
  }
  let binary = "";
  try {
    binary = globalThis.atob(payload);
  } catch {
    invalidAudio("audio.data-url", "Audio base64 cannot be decoded.");
  }
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  if (bytes.byteLength > DRAWING_PROJECT_V2_LIMITS.audioBytes) invalidAudio("audio.data-url", "Audio exceeds the decoded byte limit.", "project_too_large");
  if (bytesToBase64(bytes) !== payload) invalidAudio("audio.data-url", "Audio base64 is not canonical RFC4648.");
  return bytes;
};

export const parseCanonicalWavDataUrl = (value: string) => {
  if (!value.startsWith(AUDIO_PREFIX)) {
    invalidAudio(
      "audio.data-url",
      "Only canonical audio/wav data URLs are supported.",
      /^(?:https?:|blob:|data:)/i.test(value) ? "unsupported_version" : "invalid_record",
    );
  }
  return decodeCanonicalBase64(value.slice(AUDIO_PREFIX.length));
};

export const bytesToBase64 = (bytes: Uint8Array) => {
  let binary = "";
  const chunkSize = 32_768;
  for (let offset = 0; offset < bytes.byteLength; offset += chunkSize) {
    const chunk = bytes.subarray(offset, Math.min(bytes.byteLength, offset + chunkSize));
    for (const byte of chunk) binary += String.fromCharCode(byte);
  }
  return globalThis.btoa(binary);
};

export const createCanonicalWavDataUrl = (bytes: Uint8Array) => `${AUDIO_PREFIX}${bytesToBase64(bytes)}`;

const validateLiveAttachment = (value: unknown): LiveDrawingSoundAttachment => {
  const record = requireExactKeys(
    value,
    ["id", "title", "description", "timingFeel", "intensityFeel", "audioDataUrl", "contentType", "speechText", "sourceTask", "attachedAt"],
    "liveSound",
  );
  requireProjectId(record.id, "liveSound.id");
  requireCanonicalString(record.title, "liveSound.title");
  requireCanonicalString(record.description, "liveSound.description");
  if (record.timingFeel !== null) requireCanonicalString(record.timingFeel, "liveSound.timingFeel");
  if (record.intensityFeel !== null) requireCanonicalString(record.intensityFeel, "liveSound.intensityFeel");
  if (record.audioDataUrl !== null && typeof record.audioDataUrl !== "string") invalidAudio("liveSound.audioDataUrl", "Audio data URL must be string or null.");
  if (record.contentType !== "sfx" && record.contentType !== "voice-placeholder") invalidAudio("liveSound.contentType", "Unsupported sound content type.", "unsupported_version");
  if (record.speechText !== null) requireCanonicalString(record.speechText, "liveSound.speechText");
  if (record.sourceTask !== "generate-sounds") invalidAudio("liveSound.sourceTask", "Unsupported sound source task.", "unsupported_version");
  requireUtcTimestamp(record.attachedAt, "liveSound.attachedAt");
  return value as LiveDrawingSoundAttachment;
};

export const snapshotDrawingSoundAttachment = async (
  value: unknown,
): Promise<{ attachment: DrawingSoundAttachmentV2; asset: DrawingProjectAudioAssetV2 | null }> => {
  const live = validateLiveAttachment(value);
  if (live.audioDataUrl === null) {
    const attachment: DrawingSoundAttachmentV2 = { ...live, audioDataUrl: null };
    parseDrawingSoundAttachmentV2(attachment);
    return { attachment, asset: null };
  }
  const bytes = parseCanonicalWavDataUrl(live.audioDataUrl);
  const sha256 = await sha256Hex(bytes);
  const assetId = `audio-${sha256}`;
  const asset: DrawingProjectAudioAssetV2 = {
    assetId,
    kind: "audio",
    mimeType: "audio/wav",
    byteLength: bytes.byteLength,
    sha256,
    bytes: new Blob([bytes], { type: "audio/wav" }),
  };
  const attachment: DrawingSoundAttachmentV2 = { ...live, audioDataUrl: { assetId } };
  parseDrawingSoundAttachmentV2(attachment);
  return { attachment, asset };
};

export const hydrateDrawingSoundAttachment = async (
  attachmentValue: unknown,
  asset: DrawingProjectAudioAssetV2 | null,
): Promise<LiveDrawingSoundAttachment> => {
  const attachment = parseDrawingSoundAttachmentV2(attachmentValue);
  if (attachment.audioDataUrl === null) {
    if (asset !== null) throw new DrawingProjectV2Error("invalid_record", "audio.hydrate", "Null audio cannot carry an asset.");
    return { ...attachment, audioDataUrl: null };
  }
  if (!asset || asset.kind !== "audio" || asset.assetId !== attachment.audioDataUrl.assetId) {
    throw new DrawingProjectV2Error("asset_missing", "audio.hydrate", "Sound audio reference does not resolve.");
  }
  if (asset.mimeType !== "audio/wav" || asset.bytes.type !== "audio/wav") {
    throw new DrawingProjectV2Error("unsupported_version", "audio.hydrate", "Audio MIME mismatch.");
  }
  if (asset.byteLength > DRAWING_PROJECT_V2_LIMITS.audioBytes || asset.bytes.size > DRAWING_PROJECT_V2_LIMITS.audioBytes) {
    throw new DrawingProjectV2Error("project_too_large", "audio.length", "Audio exceeds the decoded byte limit.");
  }
  if (asset.bytes.size !== asset.byteLength || asset.byteLength < 1) {
    throw new DrawingProjectV2Error("asset_digest_mismatch", "audio.length", "Audio length mismatch.");
  }
  let bytes: Uint8Array;
  try {
    bytes = new Uint8Array(await asset.bytes.arrayBuffer());
  } catch {
    throw new DrawingProjectV2Error("asset_digest_mismatch", "audio.read", "Audio Blob could not be read.");
  }
  if (bytes.byteLength > DRAWING_PROJECT_V2_LIMITS.audioBytes) {
    throw new DrawingProjectV2Error("project_too_large", "audio.length", "Audio exceeds the decoded byte limit.");
  }
  if (bytes.byteLength !== asset.byteLength || (await sha256Hex(bytes)) !== asset.sha256) {
    throw new DrawingProjectV2Error("asset_digest_mismatch", "audio.digest", "Audio digest mismatch.");
  }
  const audioDataUrl = createCanonicalWavDataUrl(bytes);
  const reparsed = parseCanonicalWavDataUrl(audioDataUrl);
  if (reparsed.byteLength !== bytes.byteLength || (await sha256Hex(reparsed)) !== asset.sha256) {
    throw new DrawingProjectV2Error("asset_digest_mismatch", "audio.reconstruction", "Audio data URL reconstruction mismatch.");
  }
  return { ...attachment, audioDataUrl };
};
