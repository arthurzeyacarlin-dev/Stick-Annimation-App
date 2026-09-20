import {
  AudioBufferSource,
  BlobSource,
  CanvasSource,
  Input,
  MP4,
  Mp4OutputFormat,
  Output,
  QUALITY_HIGH,
  StreamTarget,
  canEncodeAudio,
  canEncodeVideo,
  type StreamTargetChunk,
} from "mediabunny";
import type { ExportProjectSnapshot } from "./exportPhase1";
import type { ExportRequestV1, ExportJobStage } from "./exportContracts";
import { renderDeterministicAudioMix } from "./exportAudio";
import { renderCanonicalExportFrame } from "./exportRenderer";

declare global {
  interface Window {
    showSaveFilePicker?: (options?: {
      suggestedName?: string;
      types?: Array<{ description: string; accept: Record<string, string[]> }>;
      excludeAcceptAllOption?: boolean;
    }) => Promise<FileSystemFileHandle>;
  }
}

export type ExportProgress = {
  stage: ExportJobStage;
  completed: number;
  total: number;
  bytesWritten?: number;
};

export type ExportInspection = {
  filename: string;
  byteLength: number;
  width: number;
  height: number;
  fps: number;
  frameCount: number;
  durationSeconds: number;
  videoCodec: string;
  audioCodec: string | null;
};

const abortError = () => new DOMException("Export cancelled", "AbortError");
const assertNotAborted = (signal: AbortSignal) => { if (signal.aborted) throw abortError(); };
const yieldToBrowser = () => new Promise<void>(resolve => {
  const channel = new MessageChannel();
  channel.port1.onmessage = () => { channel.port1.close(); channel.port2.close(); resolve(); };
  channel.port2.postMessage(null);
});

export async function preflightLocalMp4(request: ExportRequestV1) {
  if (!window.isSecureContext || typeof window.showSaveFilePicker !== "function") throw new Error("export_finder_unavailable");
  if (!(await canEncodeVideo("avc", {
    width: request.outputCanvas.width,
    height: request.outputCanvas.height,
    bitrate: request.outputCanvas.width * request.outputCanvas.height > 1280 * 720 ? 12_000_000 : 7_000_000,
  }))) throw new Error("export_video_encoder_unavailable");
  if (request.audioCodec === "aac" && !(await canEncodeAudio("aac", { numberOfChannels: 2, sampleRate: 48_000, bitrate: 192_000 }))) {
    throw new Error("export_audio_encoder_unavailable");
  }
}

export async function chooseExportFile(request: ExportRequestV1) {
  const picker = window.showSaveFilePicker;
  if (!picker) throw new Error("export_finder_unavailable");
  try {
    return await picker.call(window, {
      suggestedName: request.sanitizedBaseFilename,
      excludeAcceptAllOption: true,
      types: [{ description: "MP4 video", accept: { "video/mp4": [".mp4"] } }],
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw new Error("export_finder_cancelled");
    if (error instanceof DOMException && error.name === "NotAllowedError") throw new Error("export_permission_denied");
    throw error;
  }
}

async function inspectWrittenMp4(file: File, request: ExportRequestV1): Promise<ExportInspection> {
  if (file.size === 0) throw new Error("export_validation_empty");
  const input = new Input({ formats: [MP4], source: new BlobSource(file) });
  try {
    if (!(await input.canRead()) || (await input.getFormat()) !== MP4) throw new Error("export_validation_container");
    const videos = await input.getVideoTracks();
    if (videos.length !== 1) throw new Error("export_validation_video_track");
    const video = videos[0];
    const [codec, width, height, duration, stats] = await Promise.all([
      video.getCodec(), video.getCodedWidth(), video.getCodedHeight(), video.computeDuration(), video.computePacketStats(),
    ]);
    if (codec !== "avc") throw new Error("export_validation_video_codec");
    if (width !== request.outputCanvas.width || height !== request.outputCanvas.height) throw new Error("export_validation_dimensions");
    if (stats.packetCount !== request.totalFrames) throw new Error("export_validation_frame_count");
    const expectedDuration = request.durationMs / 1000;
    if (Math.abs(duration - expectedDuration) > 0.5 / request.fps) throw new Error("export_validation_duration");
    if (Math.abs(stats.averagePacketRate - request.fps) > 0.05) throw new Error("export_validation_fps");
    const audios = await input.getAudioTracks();
    const audioCodec = audios[0] ? await audios[0].getCodec() : null;
    if (request.audioCodec === "aac" && (audios.length !== 1 || audioCodec !== "aac")) throw new Error("export_validation_audio_track");
    if (request.audioCodec === "none" && audios.length !== 0) throw new Error("export_validation_unexpected_audio");
    return {
      filename: file.name,
      byteLength: file.size,
      width,
      height,
      fps: stats.averagePacketRate,
      frameCount: stats.packetCount,
      durationSeconds: duration,
      videoCodec: codec,
      audioCodec,
    };
  } finally {
    input.dispose();
  }
}

export async function exportSnapshotToMp4(options: {
  snapshot: ExportProjectSnapshot;
  request: ExportRequestV1;
  handle: FileSystemFileHandle;
  signal: AbortSignal;
  onProgress: (progress: ExportProgress) => void;
}): Promise<ExportInspection> {
  const { snapshot, request, handle, signal, onProgress } = options;
  assertNotAborted(signal);
  let writable: FileSystemWritableFileStream | null = null;
  let pipe: Promise<void> | null = null;
  let output: Output<Mp4OutputFormat, StreamTarget> | null = null;
  let outputCancellation: Promise<void> | null = null;
  let finalized = false;
  let bytesWritten = 0;
  const cancelActiveOutput = () => {
    if (output && output.state === "started" && !outputCancellation) outputCancellation = output.cancel().catch(() => undefined);
  };
  signal.addEventListener("abort", cancelActiveOutput, { once: true });
  try {
    writable = await handle.createWritable({ keepExistingData: false });
    const trackedStream = new TransformStream<StreamTargetChunk, StreamTargetChunk>({
      transform(chunk, controller) {
        bytesWritten = Math.max(bytesWritten, chunk.position + chunk.data.byteLength);
        onProgress({ stage: "writing", completed: bytesWritten, total: Math.max(bytesWritten, 1), bytesWritten });
        controller.enqueue(chunk);
      },
    });
    pipe = trackedStream.readable.pipeTo(writable as unknown as WritableStream<StreamTargetChunk>, { signal });
    const target = new StreamTarget(trackedStream.writable, { chunked: true, chunkSize: 4 * 1024 * 1024 });
    output = new Output({ format: new Mp4OutputFormat({ fastStart: false }), target });
    const canvas = document.createElement("canvas");
    canvas.width = request.outputCanvas.width;
    canvas.height = request.outputCanvas.height;
    const videoSource = new CanvasSource(canvas, {
      codec: "avc",
      quality: QUALITY_HIGH,
      keyFrameInterval: 2,
      latencyMode: "quality",
      sizeChangeBehavior: "deny",
    });
    output.addVideoTrack(videoSource, { maximumPacketCount: request.totalFrames });
    onProgress({ stage: "preflighting", completed: 1, total: request.audioCodec === "aac" ? 2 : 1 });
    const audioMix = await renderDeterministicAudioMix(snapshot.project, request.totalFrames, signal);
    await yieldToBrowser();
    let audioSource: AudioBufferSource | null = null;
    if (audioMix) {
      audioSource = new AudioBufferSource({ codec: "aac", quality: QUALITY_HIGH });
      output.addAudioTrack(audioSource);
    }
    assertNotAborted(signal);
    await output.start();
    const frameDuration = 1 / request.fps;
    for (let frameIndex = 0; frameIndex < request.totalFrames; frameIndex += 1) {
      assertNotAborted(signal);
      await renderCanonicalExportFrame(canvas, snapshot.project, frameIndex, signal);
      onProgress({ stage: "rendering", completed: frameIndex + 1, total: request.totalFrames, bytesWritten });
      await videoSource.add(frameIndex * frameDuration, frameDuration);
      onProgress({ stage: "encoding", completed: frameIndex + 1, total: request.totalFrames, bytesWritten });
      if ((frameIndex + 1) % 4 === 0) await yieldToBrowser();
    }
    if (audioSource && audioMix) await audioSource.add(audioMix);
    assertNotAborted(signal);
    await yieldToBrowser();
    await output.finalize();
    finalized = true;
    await pipe;
    assertNotAborted(signal);
    await yieldToBrowser();
    onProgress({ stage: "validating", completed: 0, total: 4, bytesWritten });
    const file = await handle.getFile();
    onProgress({ stage: "validating", completed: 1, total: 4, bytesWritten: file.size });
    const inspection = await inspectWrittenMp4(file, request);
    onProgress({ stage: "validating", completed: 4, total: 4, bytesWritten: file.size });
    return inspection;
  } catch (error) {
    if (output && !finalized && output.state !== "canceled") {
      cancelActiveOutput();
      await outputCancellation;
    }
    if (writable) {
      await pipe?.catch(() => undefined);
      try {
        const cleanupWritable = await handle.createWritable({ keepExistingData: false });
        await cleanupWritable.truncate(0);
        await cleanupWritable.close();
      } catch (cleanupError) {
        throw new Error("export_cleanup_failed", { cause: cleanupError });
      }
    }
    if (signal.aborted) throw abortError();
    throw error;
  } finally {
    signal.removeEventListener("abort", cancelActiveOutput);
  }
}
