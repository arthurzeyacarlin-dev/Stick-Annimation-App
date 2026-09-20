import type { UnifiedAnimationProjectV2 } from "@/src/lib/animation/unifiedAnimationContractV2";

export const EXPORT_AUDIO_SAMPLE_RATE = 48_000;

type ScheduledAttachment = { frameIndex: number; id: string; dataUrl: string };

const decodeDataUrlBytes = (dataUrl: string) => {
  const match = /^data:(audio\/[a-z0-9.+-]+);base64,([a-z0-9+/=]+)$/i.exec(dataUrl);
  if (!match) throw new Error("export_audio_data_invalid");
  const binary = atob(match[2]);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes.buffer;
};

export const collectExportAudioAttachments = (project: UnifiedAnimationProjectV2): ScheduledAttachment[] => {
  const attachments: ScheduledAttachment[] = [];
  for (const layer of project.document.layers) {
    if (!layer.visible) continue;
    for (const [frameIndex, cell] of layer.cells.entries()) {
      const attachment = cell.content?.soundAttachment;
      if (!attachment) continue;
      if (!attachment.audioDataUrl) throw new Error(`export_audio_missing:${attachment.id}`);
      attachments.push({ frameIndex, id: attachment.id, dataUrl: attachment.audioDataUrl });
    }
  }
  return attachments.sort((left, right) => left.frameIndex - right.frameIndex || left.id.localeCompare(right.id));
};

export async function renderDeterministicAudioMix(
  project: UnifiedAnimationProjectV2,
  totalFrames: number,
  signal?: AbortSignal,
): Promise<AudioBuffer | null> {
  const attachments = collectExportAudioAttachments(project);
  if (attachments.length === 0) return null;
  const durationSeconds = totalFrames / project.document.fps;
  const outputFrames = Math.max(1, Math.ceil(durationSeconds * EXPORT_AUDIO_SAMPLE_RATE));
  const offline = new OfflineAudioContext(2, outputFrames, EXPORT_AUDIO_SAMPLE_RATE);
  const decoder = new AudioContext({ sampleRate: EXPORT_AUDIO_SAMPLE_RATE });
  try {
    for (const attachment of attachments) {
      if (signal?.aborted) throw new DOMException("Export cancelled", "AbortError");
      let buffer: AudioBuffer;
      try {
        buffer = await decoder.decodeAudioData(decodeDataUrlBytes(attachment.dataUrl));
      } catch {
        throw new Error(`export_audio_decode_failed:${attachment.id}`);
      }
      const source = offline.createBufferSource();
      source.buffer = buffer;
      source.connect(offline.destination);
      source.start(attachment.frameIndex / project.document.fps);
    }
    if (signal?.aborted) throw new DOMException("Export cancelled", "AbortError");
    return await offline.startRendering();
  } finally {
    await decoder.close().catch(() => undefined);
  }
}
