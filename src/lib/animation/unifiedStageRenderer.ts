import type { UnifiedAnimationAssetManifestV1, UnifiedAnimationDocumentV1, UnifiedAnimationResolvedAssetV1 } from "./unifiedAnimationContract.ts";
import { resolveUnifiedRenderList } from "./unifiedCellResolver.ts";
import { drawingRenderCommand, drawUnifiedDrawing, type DrawingRenderCommand } from "./unifiedDrawingRenderAdapter.ts";
import { stickRenderCommand, drawUnifiedStick, type StickRenderCommand } from "./unifiedStickRenderAdapter.ts";
import { STAGE_RGBA_BYTES } from "./unifiedStageGeometry.ts";

export type UnifiedRenderCommand = DrawingRenderCommand | StickRenderCommand;
export const createUnifiedRenderCommands = (document: UnifiedAnimationDocumentV1, index: number): UnifiedRenderCommand[] => resolveUnifiedRenderList(document, index).map(cell => {
  if (cell.layer.contentKind === "drawing/v1") return drawingRenderCommand(cell);
  if (cell.layer.contentKind === "stick-rig/v1") return stickRenderCommand(cell);
  throw new Error("invalid_render_command");
});
export type StageAccounting = { decodedBytes: number; backingBytes: number; pendingDecodeBytes: number; peakOwnedBytes: number; decodedAssets: number; decodeCount: number };
export type StagePresentationReceipt = { index: number; layerIds: string[]; elapsedMs: number; accounting: StageAccounting };

export class UnifiedStageRenderer {
  private readonly canvas: HTMLCanvasElement;
  private readonly work = document.createElement("canvas");
  private readonly manifests: Map<string, UnifiedAnimationAssetManifestV1>;
  private readonly encoded: Map<string, Uint8Array>;
  private readonly cache = new Map<string, { image: ImageBitmap; bytes: number }>();
  private readonly cacheBudget: number;
  private tail: Promise<unknown> = Promise.resolve();
  private generation = 0;
  private disposed = false;
  private pendingDecodeBytes = 0;
  private peakOwnedBytes = 2 * STAGE_RGBA_BYTES;
  private decodeCount = 0;

  constructor(canvas: HTMLCanvasElement, assets: readonly UnifiedAnimationAssetManifestV1[], resolvedAssets: readonly UnifiedAnimationResolvedAssetV1[]) {
    this.canvas = canvas;
    canvas.width = this.work.width = 1920; canvas.height = this.work.height = 1080;
    this.manifests = new Map(assets.map(a => [a.assetId, a]));
    this.encoded = new Map(resolvedAssets.map(a => [a.assetId, a.bytes]));
    const largest = Math.max(0, ...assets.map(a => "rgbaByteLength" in a ? a.rgbaByteLength : 0));
    this.cacheBudget = 2 * largest + STAGE_RGBA_BYTES;
  }
  accounting(): StageAccounting {
    const decodedBytes = [...this.cache.values()].reduce((sum, a) => sum + a.bytes, 0);
    const backingBytes = this.disposed ? 0 : 2 * STAGE_RGBA_BYTES;
    this.peakOwnedBytes = Math.max(this.peakOwnedBytes, decodedBytes + backingBytes + this.pendingDecodeBytes);
    return { decodedBytes, backingBytes, pendingDecodeBytes: this.pendingDecodeBytes, peakOwnedBytes: this.peakOwnedBytes, decodedAssets: this.cache.size, decodeCount: this.decodeCount };
  }
  private trim(reserved = 0) {
    while (this.cache.size && this.accounting().decodedBytes + reserved > this.cacheBudget) {
      const key = this.cache.keys().next().value!;
      this.cache.get(key)!.image.close(); this.cache.delete(key);
    }
  }
  private async raster(id: string): Promise<ImageBitmap> {
    const cached = this.cache.get(id);
    if (cached) { this.cache.delete(id); this.cache.set(id, cached); return cached.image; }
    const asset = this.manifests.get(id), bytes = this.encoded.get(id);
    if (!asset || !bytes || asset.kind === "drawing-audio-wav") throw new Error("asset_missing");
    this.trim(asset.rgbaByteLength);
    // At most one decode is in flight; no eager project hydration or history copy.
    // Raw decoding temporarily owns an ImageData copy and its decoded bitmap.
    this.pendingDecodeBytes = asset.rgbaByteLength * (asset.kind === "drawing-raster-rgba" ? 2 : 1);
    this.accounting();
    let image: ImageBitmap | null = null;
    try {
      const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new Uint8Array(bytes)));
      if ([...digest].map(v => v.toString(16).padStart(2, "0")).join("") !== asset.sha256 || bytes.byteLength !== asset.byteLength) throw new Error("asset_digest_mismatch");
      image = asset.kind === "drawing-raster-png"
        ? await createImageBitmap(new Blob([new Uint8Array(bytes)], { type: "image/png" }))
        : await createImageBitmap(new ImageData(new Uint8ClampedArray(bytes), asset.width, asset.height));
      if (this.disposed || image.width !== asset.width || image.height !== asset.height) throw new Error("asset_decode_failed");
      this.cache.set(id, { image, bytes: asset.rgbaByteLength }); this.decodeCount++;
      return image;
    } catch (error) { image?.close(); throw error; }
    finally { this.pendingDecodeBytes = 0; this.accounting(); }
  }
  render(document: UnifiedAnimationDocumentV1, index: number): Promise<StagePresentationReceipt | null> {
    const generation = ++this.generation;
    const job = async () => {
      if (this.disposed || generation !== this.generation) return null;
      const start = performance.now(), commands = createUnifiedRenderCommands(document, index);
      const ctx = this.work.getContext("2d")!, output = this.canvas.getContext("2d")!;
      ctx.setTransform(1,0,0,1,0,0); ctx.globalAlpha = 1; ctx.globalCompositeOperation = "source-over";
      ctx.clearRect(0,0,1920,1080); ctx.fillStyle = "#f5f5f5"; ctx.fillRect(0,0,1920,1080);
      for (const command of commands) {
        if (this.disposed || generation !== this.generation) return null;
        if (command.kind === "drawing/v1") {
          const raster = command.raster ? await this.raster(command.raster.assetId) : null;
          if (this.disposed || generation !== this.generation) return null;
          drawUnifiedDrawing(ctx, command, raster);
        } else drawUnifiedStick(ctx, command);
      }
      if (this.disposed || generation !== this.generation) return null;
      // Publish only a complete ordered frame. Failures retain the previous
      // visible snapshot, never a partially painted composite.
      output.setTransform(1,0,0,1,0,0); output.clearRect(0,0,1920,1080); output.drawImage(this.work,0,0);
      this.trim();
      return { index, layerIds: commands.map(c => c.layerId), elapsedMs: performance.now() - start, accounting: this.accounting() };
    };
    const result = this.tail.then(job); this.tail = result.catch(() => {}); return result;
  }
  // The visible canvas is the shared thumbnail/proof snapshot. Consumers own
  // any exported Blob; there is no separate compositor or retained raster copy.
  snapshot(): Promise<Blob> {
    return new Promise((resolve, reject) => this.canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error("snapshot_failed")), "image/png"));
  }
  dispose() {
    this.disposed = true; this.generation++;
    for (const asset of this.cache.values()) asset.image.close(); this.cache.clear();
    this.work.width = this.work.height = 0;
    this.canvas.width = this.canvas.height = 0;
  }
}
