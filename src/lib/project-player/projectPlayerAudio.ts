import type { UnifiedAnimationProjectV2 } from "../animation/unifiedAnimationContractV2.ts";
import {
  collectExportAudioAttachments,
  decodeExportAudioDataUrlBytes,
  type ScheduledAttachment,
} from "../export/exportAudio.ts";

type DecodedAttachment = ScheduledAttachment & { buffer: AudioBuffer };

export type ProjectPlayerAudioStartResult =
  | { status: "silent"; clockSeconds: null }
  | { status: "scheduled"; clockSeconds: number }
  | { status: "blocked"; clockSeconds: null }
  | { status: "unavailable"; clockSeconds: null; detail: string };

export type ProjectPlayerAudioPreparation =
  | { status: "silent" }
  | { status: "ready"; attachmentCount: number; uniqueAssetCount: number }
  | { status: "unavailable"; detail: string };

const unavailableDetail = (error: unknown) => {
  const message = error instanceof Error ? error.message : "audio_decode_failed";
  if (message.startsWith("export_audio_missing:")) return `Saved audio ${message.slice("export_audio_missing:".length)} is missing.`;
  if (message.startsWith("export_audio_decode_failed:")) return `Saved audio ${message.slice("export_audio_decode_failed:".length)} could not be decoded.`;
  if (message === "export_audio_data_invalid") return "A saved audio asset uses an unsupported format.";
  return "Saved audio could not be prepared in this browser.";
};

export class ProjectPlayerAudioController {
  private readonly project: UnifiedAnimationProjectV2;
  private context: AudioContext | null = null;
  private attachments: ScheduledAttachment[] = [];
  private decoded: DecodedAttachment[] = [];
  private activeSources: AudioBufferSourceNode[] = [];
  private preparation: Promise<ProjectPlayerAudioPreparation> | null = null;
  private unavailable: string | null = null;
  private disposed = false;

  constructor(project: UnifiedAnimationProjectV2) {
    this.project = project;
  }

  get clockSeconds() {
    return this.context?.currentTime ?? null;
  }

  get hasAuthoredAudio() {
    try {
      return collectExportAudioAttachments(this.project).length > 0;
    } catch {
      return true;
    }
  }

  prepare(): Promise<ProjectPlayerAudioPreparation> {
    if (this.preparation) return this.preparation;
    this.preparation = this.prepareOnce();
    return this.preparation;
  }

  private async prepareOnce(): Promise<ProjectPlayerAudioPreparation> {
    try {
      this.attachments = collectExportAudioAttachments(this.project);
      if (this.attachments.length === 0) return { status: "silent" };
      if (this.disposed) throw new Error("audio_disposed");
      this.context = new AudioContext();
      const uniqueDataUrls = [...new Set(this.attachments.map(attachment => attachment.dataUrl))];
      const decodedByDataUrl = new Map<string, AudioBuffer>();
      let cursor = 0;
      const worker = async () => {
        while (cursor < uniqueDataUrls.length) {
          const dataUrl = uniqueDataUrls[cursor++];
          let buffer: AudioBuffer;
          try {
            const bytes = decodeExportAudioDataUrlBytes(dataUrl);
            buffer = await this.context!.decodeAudioData(bytes.slice(0));
          } catch {
            const first = this.attachments.find(attachment => attachment.dataUrl === dataUrl);
            throw new Error(`export_audio_decode_failed:${first?.id ?? "unknown"}`);
          }
          decodedByDataUrl.set(dataUrl, buffer);
        }
      };
      await Promise.all(Array.from({ length: Math.min(2, uniqueDataUrls.length) }, worker));
      if (this.disposed) throw new Error("audio_disposed");
      this.decoded = this.attachments.map(attachment => ({
        ...attachment,
        buffer: decodedByDataUrl.get(attachment.dataUrl)!,
      }));
      return {
        status: "ready",
        attachmentCount: this.decoded.length,
        uniqueAssetCount: uniqueDataUrls.length,
      };
    } catch (error) {
      this.unavailable = unavailableDetail(error);
      return { status: "unavailable", detail: this.unavailable };
    }
  }

  async start(mediaTimeSeconds: number, durationSeconds: number): Promise<ProjectPlayerAudioStartResult> {
    const prepared = await this.prepare();
    if (this.disposed) return { status: "unavailable", clockSeconds: null, detail: "Saved audio is no longer available." };
    if (prepared.status === "silent") return { status: "silent", clockSeconds: null };
    if (prepared.status === "unavailable" || !this.context) {
      return { status: "unavailable", clockSeconds: null, detail: this.unavailable ?? "Saved audio is unavailable." };
    }
    try {
      await this.context.resume();
    } catch {
      return { status: "blocked", clockSeconds: null };
    }
    if (this.context.state !== "running") return { status: "blocked", clockSeconds: null };
    this.stop();
    const clockSeconds = this.context.currentTime;
    const fps = Math.max(1, this.project.document.fps);
    for (const attachment of this.decoded) {
      const attachmentStart = attachment.frameIndex / fps;
      const attachmentEnd = Math.min(durationSeconds, attachmentStart + attachment.buffer.duration);
      if (attachmentEnd <= mediaTimeSeconds || attachmentStart >= durationSeconds) continue;
      const sourceOffset = Math.max(0, mediaTimeSeconds - attachmentStart);
      const scheduleDelay = Math.max(0, attachmentStart - mediaTimeSeconds);
      const scheduledMediaStart = Math.max(mediaTimeSeconds, attachmentStart);
      const playableDuration = Math.min(
        attachment.buffer.duration - sourceOffset,
        durationSeconds - scheduledMediaStart,
      );
      if (playableDuration <= 0) continue;
      const source = this.context.createBufferSource();
      source.buffer = attachment.buffer;
      source.connect(this.context.destination);
      source.onended = () => {
        this.activeSources = this.activeSources.filter(candidate => candidate !== source);
        try { source.disconnect(); } catch { /* already disconnected */ }
      };
      this.activeSources.push(source);
      source.start(clockSeconds + scheduleDelay, sourceOffset, playableDuration);
    }
    return { status: "scheduled", clockSeconds };
  }

  stop() {
    for (const source of this.activeSources) {
      source.onended = null;
      try { source.stop(); } catch { /* already stopped */ }
      try { source.disconnect(); } catch { /* already disconnected */ }
    }
    this.activeSources = [];
  }

  async close() {
    if (this.disposed) return;
    this.disposed = true;
    this.stop();
    const context = this.context;
    this.context = null;
    if (context && context.state !== "closed") await context.close().catch(() => undefined);
  }
}
