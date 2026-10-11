// Image exports for SPEC-0020 Phase 5: animated GIF, PNG frames and a ZIP of PNGs, plus the
// "save to my computer" step. Pure browser TypeScript, no React and no npm dependencies: the GIF
// encoder (palette + LZW) and the ZIP writer (STORE, no compression) are written here by hand.
//
// Memory rule (the Mac has 8 GB): never hold every rendered frame at once. The streaming API is
// the main path — buildGifPalette(a few sample frames) → createGifWriter → addFrame(frame) one at
// a time (each frame is quantized + compressed immediately and only the compressed bytes are
// kept) → finish(). encodeGif / encodeGifAsync are thin wrappers for callers that already have
// all frames in memory (tests, short clips).

export type ImageExportKind = "gif" | "png" | "zip" | "mp4";

export type GifPalette = {
  /** RGB triples, `count` colours (1–255; one slot of the 256 is kept spare). */
  readonly rgb: Uint8Array;
  readonly count: number;
  /** For each 15-bit colour bucket that made it into the palette: its palette index, otherwise -1. */
  readonly bucketIndex: Int16Array;
};

export type GifWriterOptions = {
  width: number;
  height: number;
  palette: GifPalette;
  /** Time each frame stays on screen, in 1/100 s (GIF's unit). Browsers show 0–1 as 0.1 s. */
  delayCentiseconds: number;
  /** true = loop forever (NETSCAPE2.0 extension, loop count 0). */
  loop: boolean;
};

export type GifWriter = {
  /** Quantize + LZW-encode this frame now; only the compressed bytes are kept. */
  addFrame(frame: ImageData): void;
  /** Header + palette + all frames + trailer. Call once, after the last addFrame. */
  finish(): Uint8Array;
};

export type GifEncodeControl = {
  signal?: AbortSignal;
  onProgress?: (done: number, total: number) => void;
};

export type SaveTarget = { type: "file"; handle: FileSystemFileHandle } | { type: "download" };

const abortError = () => new DOMException("Export cancelled", "AbortError");
const assertNotAborted = (signal?: AbortSignal) => { if (signal?.aborted) throw abortError(); };
const yieldToBrowser = () => new Promise<void>(resolve => setTimeout(resolve, 0));

// ---------------------------------------------------------------------------------------------
// Growable byte buffer (used by the GIF writer).

class ByteWriter {
  bytes = new Uint8Array(1024);
  length = 0;

  private ensure(extra: number) {
    if (this.length + extra <= this.bytes.length) return;
    let size = this.bytes.length * 2;
    while (size < this.length + extra) size *= 2;
    const grown = new Uint8Array(size);
    grown.set(this.bytes.subarray(0, this.length));
    this.bytes = grown;
  }

  byte(value: number) {
    this.ensure(1);
    this.bytes[this.length++] = value & 0xff;
  }

  u16(value: number) {
    this.ensure(2);
    this.bytes[this.length++] = value & 0xff;
    this.bytes[this.length++] = (value >>> 8) & 0xff;
  }

  ascii(text: string) {
    for (let i = 0; i < text.length; i += 1) this.byte(text.charCodeAt(i));
  }

  append(data: Uint8Array) {
    this.ensure(data.length);
    this.bytes.set(data, this.length);
    this.length += data.length;
  }

  result() {
    return this.bytes.slice(0, this.length);
  }
}

// ---------------------------------------------------------------------------------------------
// Colours. Every pixel is reduced to a 15-bit bucket key (5 bits per channel). Animations are
// mostly line drawings on a flat background, so a few hundred buckets cover them well.

const BUCKET_COUNT = 1 << 15;
const MAX_PALETTE_COLORS = 255;

const bucketKey = (r: number, g: number, b: number) => ((r & 0xf8) << 7) | ((g & 0xf8) << 2) | (b >> 3);

/** Calls visit(r, g, b) for each pixel. Pixels that are not fully opaque are drawn over white. */
const forEachOpaquePixel = (frame: ImageData, visit: (r: number, g: number, b: number, pixel: number) => void) => {
  const data = frame.data;
  const pixels = frame.width * frame.height;
  for (let pixel = 0, o = 0; pixel < pixels; pixel += 1, o += 4) {
    const a = data[o + 3];
    if (a === 255) {
      visit(data[o], data[o + 1], data[o + 2], pixel);
    } else {
      const white = 255 - a;
      visit(
        ((data[o] * a) / 255 + white) | 0,
        ((data[o + 1] * a) / 255 + white) | 0,
        ((data[o + 2] * a) / 255 + white) | 0,
        pixel,
      );
    }
  }
};

/** Evenly spaced frame indices to sample for the palette (first and last frame always included). */
export function pickPaletteSampleIndices(frameCount: number, sampleCount = 12): number[] {
  if (frameCount <= 0) return [];
  if (frameCount <= sampleCount) return Array.from({ length: frameCount }, (_, i) => i);
  const picks = new Set<number>();
  for (let i = 0; i < sampleCount; i += 1) picks.add(Math.round((i * (frameCount - 1)) / (sampleCount - 1)));
  return [...picks].sort((a, b) => a - b);
}

/**
 * Builds a global palette (≤255 colours) from a few sample frames: count pixels per 15-bit
 * bucket, keep the most frequent buckets, and use each bucket's average colour.
 */
export function buildGifPalette(samples: ImageData[]): GifPalette {
  if (samples.length === 0) throw new Error("gif_palette_needs_samples");
  const counts = new Float64Array(BUCKET_COUNT);
  const sumR = new Float64Array(BUCKET_COUNT);
  const sumG = new Float64Array(BUCKET_COUNT);
  const sumB = new Float64Array(BUCKET_COUNT);
  for (const frame of samples) {
    forEachOpaquePixel(frame, (r, g, b) => {
      const key = bucketKey(r, g, b);
      counts[key] += 1;
      sumR[key] += r;
      sumG[key] += g;
      sumB[key] += b;
    });
  }

  const used: number[] = [];
  for (let key = 0; key < BUCKET_COUNT; key += 1) if (counts[key] > 0) used.push(key);
  // Most frequent first; ties by key so the same input always gives the same palette.
  used.sort((a, b) => counts[b] - counts[a] || a - b);
  const chosen = used.slice(0, MAX_PALETTE_COLORS);

  const rgb = new Uint8Array(chosen.length * 3);
  const bucketIndex = new Int16Array(BUCKET_COUNT).fill(-1);
  chosen.forEach((key, index) => {
    const n = counts[key];
    rgb[index * 3] = Math.round(sumR[key] / n);
    rgb[index * 3 + 1] = Math.round(sumG[key] / n);
    rgb[index * 3 + 2] = Math.round(sumB[key] / n);
    bucketIndex[key] = index;
  });
  return { rgb, count: chosen.length, bucketIndex };
}

/** Nearest palette colour (plain RGB distance) to the centre of a 15-bit bucket. */
const nearestPaletteIndex = (palette: GifPalette, key: number) => {
  const r = ((key >> 10) << 3) | 4;
  const g = (((key >> 5) & 31) << 3) | 4;
  const b = ((key & 31) << 3) | 4;
  let best = 0;
  let bestDistance = Infinity;
  for (let i = 0; i < palette.count; i += 1) {
    const dr = palette.rgb[i * 3] - r;
    const dg = palette.rgb[i * 3 + 1] - g;
    const db = palette.rgb[i * 3 + 2] - b;
    const distance = dr * dr + dg * dg + db * db;
    if (distance < bestDistance) { bestDistance = distance; best = i; }
  }
  return best;
};

/** Colour table size bits: the table holds 2^bits entries (GIF needs at least 2). */
const colorTableBits = (count: number) => {
  let bits = 1;
  while ((1 << bits) < count) bits += 1;
  return bits;
};

// ---------------------------------------------------------------------------------------------
// LZW (GIF flavour): variable code size starting at minCodeSize+1, clear + end codes, at most
// 4096 codes (12 bits), output split into data sub-blocks of ≤255 bytes, ended by a 0 block.
// The dictionary is the classic open-addressing hash used by UNIX compress / GIF encoders.

const LZW_MAX_CODE = 4096;
const HASH_SIZE = 5003; // prime, bigger than 4096
const HASH_SHIFT = 4; // (pixel << 4) ^ prefix < 4096 < HASH_SIZE

const lzwHashKeys = new Int32Array(HASH_SIZE);
const lzwHashCodes = new Int32Array(HASH_SIZE);

function writeLzwImageData(indices: Uint8Array, minCodeSize: number, out: ByteWriter) {
  const clearCode = 1 << minCodeSize;
  const endCode = clearCode + 1;
  let codeSize = minCodeSize + 1;
  let nextCode = endCode + 1;

  // Bit packing (least significant bit first) into 255-byte sub-blocks.
  const block = new Uint8Array(255);
  let blockLength = 0;
  let bitBuffer = 0;
  let bitCount = 0;
  const pushByte = (value: number) => {
    block[blockLength++] = value;
    if (blockLength === 255) {
      out.byte(255);
      out.append(block);
      blockLength = 0;
    }
  };
  const emit = (code: number) => {
    bitBuffer |= code << bitCount;
    bitCount += codeSize;
    while (bitCount >= 8) {
      pushByte(bitBuffer & 0xff);
      bitBuffer >>>= 8;
      bitCount -= 8;
    }
  };
  // The decoder adds its dictionary entries one code late, so it widens the code size when its
  // next free code reaches 2^codeSize right after reading a code. Mirror that exactly here.
  const widenIfNeeded = () => {
    if (nextCode >= (1 << codeSize) && codeSize < 12) codeSize += 1;
  };

  out.byte(minCodeSize);
  lzwHashKeys.fill(-1);
  emit(clearCode);

  let prefix = indices[0];
  outer: for (let i = 1; i < indices.length; i += 1) {
    const pixel = indices[i];
    const fullKey = (pixel << 12) + prefix;
    let slot = (pixel << HASH_SHIFT) ^ prefix;
    if (lzwHashKeys[slot] === fullKey) { prefix = lzwHashCodes[slot]; continue; }
    if (lzwHashKeys[slot] >= 0) {
      const step = slot === 0 ? 1 : HASH_SIZE - slot;
      do {
        slot -= step;
        if (slot < 0) slot += HASH_SIZE;
        if (lzwHashKeys[slot] === fullKey) { prefix = lzwHashCodes[slot]; continue outer; }
      } while (lzwHashKeys[slot] >= 0);
    }
    // prefix+pixel is new: send prefix, remember prefix+pixel, start again from pixel.
    emit(prefix);
    widenIfNeeded();
    prefix = pixel;
    if (nextCode < LZW_MAX_CODE) {
      lzwHashCodes[slot] = nextCode++;
      lzwHashKeys[slot] = fullKey;
    } else {
      // Dictionary full: clear (sent at 12 bits) and start a fresh dictionary.
      emit(clearCode);
      lzwHashKeys.fill(-1);
      codeSize = minCodeSize + 1;
      nextCode = endCode + 1;
    }
  }
  emit(prefix);
  widenIfNeeded();
  emit(endCode);
  if (bitCount > 0) pushByte(bitBuffer & 0xff);
  if (blockLength > 0) {
    out.byte(blockLength);
    out.append(block.subarray(0, blockLength));
  }
  out.byte(0); // block terminator
}

// ---------------------------------------------------------------------------------------------
// GIF89a writer.

/** Streaming GIF writer: add frames one at a time, then finish(). */
export function createGifWriter(options: GifWriterOptions): GifWriter {
  const { width, height, palette, loop } = options;
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width > 65535 || height > 65535) {
    throw new Error("gif_invalid_size");
  }
  if (palette.count < 1 || palette.count > 256) throw new Error("gif_invalid_palette");
  const delay = Math.max(0, Math.min(65535, Math.round(options.delayCentiseconds)));
  const tableBits = colorTableBits(palette.count);
  const minCodeSize = Math.max(2, tableBits);

  // Bucket → palette index cache: starts with the palette's own buckets, other buckets are
  // filled in the first time they appear (nearest palette colour).
  const cache = Int16Array.from(palette.bucketIndex);
  const indices = new Uint8Array(width * height);
  const body = new ByteWriter();
  let frameCount = 0;
  let finished = false;

  return {
    addFrame(frame) {
      if (finished) throw new Error("gif_already_finished");
      if (frame.width !== width || frame.height !== height || frame.data.length !== width * height * 4) {
        throw new Error("gif_frame_size_mismatch");
      }
      forEachOpaquePixel(frame, (r, g, b, pixel) => {
        const key = bucketKey(r, g, b);
        let index = cache[key];
        if (index < 0) index = cache[key] = nearestPaletteIndex(palette, key);
        indices[pixel] = index;
      });

      // Graphic Control Extension: disposal 1 (leave in place), no transparency, the delay.
      body.byte(0x21); body.byte(0xf9); body.byte(4);
      body.byte(1 << 2);
      body.u16(delay);
      body.byte(0);
      body.byte(0);
      // Image descriptor: full frame at 0,0, uses the global colour table, not interlaced.
      body.byte(0x2c);
      body.u16(0); body.u16(0); body.u16(width); body.u16(height);
      body.byte(0);
      writeLzwImageData(indices, minCodeSize, body);
      frameCount += 1;
    },

    finish() {
      if (finished) throw new Error("gif_already_finished");
      if (frameCount === 0) throw new Error("gif_no_frames");
      finished = true;
      const head = new ByteWriter();
      head.ascii("GIF89a");
      // Logical screen descriptor: global colour table present, 8-bit colour resolution.
      head.u16(width); head.u16(height);
      head.byte(0x80 | (7 << 4) | (tableBits - 1));
      head.byte(0); // background colour index
      head.byte(0); // pixel aspect ratio: not given
      const table = new Uint8Array(3 << tableBits); // unused slots stay black
      table.set(palette.rgb.subarray(0, palette.count * 3));
      head.append(table);
      if (loop) {
        head.byte(0x21); head.byte(0xff); head.byte(11);
        head.ascii("NETSCAPE2.0");
        head.byte(3); head.byte(1);
        head.u16(0); // 0 = loop forever
        head.byte(0);
      }
      const out = new Uint8Array(head.length + body.length + 1);
      out.set(head.bytes.subarray(0, head.length), 0);
      out.set(body.bytes.subarray(0, body.length), head.length);
      out[out.length - 1] = 0x3b; // trailer
      return out;
    },
  };
}

const checkFrames = (frames: ImageData[]) => {
  if (frames.length === 0) throw new Error("gif_no_frames");
  const { width, height } = frames[0];
  if (frames.some(frame => frame.width !== width || frame.height !== height)) throw new Error("gif_frame_size_mismatch");
  return { width, height };
};

/** All frames in memory → GIF bytes. Palette from up to 12 evenly spaced frames. */
export function encodeGif(frames: ImageData[], options: { delayCentiseconds: number; loop: boolean }): Uint8Array {
  const { width, height } = checkFrames(frames);
  const palette = buildGifPalette(pickPaletteSampleIndices(frames.length).map(i => frames[i]));
  const writer = createGifWriter({ width, height, palette, ...options });
  for (const frame of frames) writer.addFrame(frame);
  return writer.finish();
}

/** Same as encodeGif, but lets the browser breathe between frames and can be cancelled. */
export async function encodeGifAsync(
  frames: ImageData[],
  options: { delayCentiseconds: number; loop: boolean },
  control: GifEncodeControl = {},
): Promise<Uint8Array> {
  const { signal, onProgress } = control;
  assertNotAborted(signal);
  const { width, height } = checkFrames(frames);
  const palette = buildGifPalette(pickPaletteSampleIndices(frames.length).map(i => frames[i]));
  const writer = createGifWriter({ width, height, palette, ...options });
  for (let i = 0; i < frames.length; i += 1) {
    await yieldToBrowser();
    assertNotAborted(signal);
    writer.addFrame(frames[i]);
    onProgress?.(i + 1, frames.length);
  }
  assertNotAborted(signal);
  return writer.finish();
}

// ---------------------------------------------------------------------------------------------
// ZIP (STORE method — PNGs are already compressed). No ZIP64: max 65535 files and 4 GB.

let crcTable: Uint32Array | null = null;

/** Standard CRC-32 (the one ZIP and PNG use). */
export function crc32(data: Uint8Array): number {
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let n = 0; n < 256; n += 1) {
      let c = n;
      for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable[n] = c >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i += 1) crc = crcTable[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

const dosDateTime = (date: Date) => ({
  time: (date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1),
  date: ((Math.max(1980, date.getFullYear()) - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
});

export function createStoredZip(files: { name: string; data: Uint8Array }[]): Uint8Array {
  if (files.length > 0xffff) throw new Error("zip_too_many_files");
  const encoder = new TextEncoder();
  const { time, date } = dosDateTime(new Date());
  const entries = files.map(file => {
    const name = encoder.encode(file.name);
    if (name.length > 0xffff) throw new Error("zip_name_too_long");
    return { name, data: file.data, crc: crc32(file.data) };
  });
  const localSize = entries.reduce((sum, entry) => sum + 30 + entry.name.length + entry.data.length, 0);
  const centralSize = entries.reduce((sum, entry) => sum + 46 + entry.name.length, 0);
  if (localSize + centralSize + 22 > 0xffffffff) throw new Error("zip_too_large");

  const out = new Uint8Array(localSize + centralSize + 22);
  const view = new DataView(out.buffer);
  const UTF8_NAMES = 1 << 11;
  let offset = 0;
  const localOffsets: number[] = [];

  for (const entry of entries) {
    localOffsets.push(offset);
    view.setUint32(offset, 0x04034b50, true); // local file header
    view.setUint16(offset + 4, 20, true); // version needed (2.0)
    view.setUint16(offset + 6, UTF8_NAMES, true);
    view.setUint16(offset + 8, 0, true); // method: STORE
    view.setUint16(offset + 10, time, true);
    view.setUint16(offset + 12, date, true);
    view.setUint32(offset + 14, entry.crc, true);
    view.setUint32(offset + 18, entry.data.length, true); // compressed size
    view.setUint32(offset + 22, entry.data.length, true); // uncompressed size
    view.setUint16(offset + 26, entry.name.length, true);
    view.setUint16(offset + 28, 0, true); // extra field length
    out.set(entry.name, offset + 30);
    out.set(entry.data, offset + 30 + entry.name.length);
    offset += 30 + entry.name.length + entry.data.length;
  }

  const centralStart = offset;
  entries.forEach((entry, i) => {
    view.setUint32(offset, 0x02014b50, true); // central directory header
    view.setUint16(offset + 4, 20, true); // version made by
    view.setUint16(offset + 6, 20, true); // version needed
    view.setUint16(offset + 8, UTF8_NAMES, true);
    view.setUint16(offset + 10, 0, true); // STORE
    view.setUint16(offset + 12, time, true);
    view.setUint16(offset + 14, date, true);
    view.setUint32(offset + 16, entry.crc, true);
    view.setUint32(offset + 20, entry.data.length, true);
    view.setUint32(offset + 24, entry.data.length, true);
    view.setUint16(offset + 28, entry.name.length, true);
    view.setUint16(offset + 30, 0, true); // extra
    view.setUint16(offset + 32, 0, true); // comment
    view.setUint16(offset + 34, 0, true); // disk number
    view.setUint16(offset + 36, 0, true); // internal attributes
    view.setUint32(offset + 38, 0, true); // external attributes
    view.setUint32(offset + 42, localOffsets[i], true);
    out.set(entry.name, offset + 46);
    offset += 46 + entry.name.length;
  });

  view.setUint32(offset, 0x06054b50, true); // end of central directory
  view.setUint16(offset + 4, 0, true);
  view.setUint16(offset + 6, 0, true);
  view.setUint16(offset + 8, entries.length, true);
  view.setUint16(offset + 10, entries.length, true);
  view.setUint32(offset + 12, offset - centralStart, true);
  view.setUint32(offset + 16, centralStart, true);
  view.setUint16(offset + 20, 0, true); // comment length
  return out;
}

// ---------------------------------------------------------------------------------------------
// PNG + names.

export function canvasToPngBytes(canvas: HTMLCanvasElement): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => {
      if (!blob) { reject(new Error("png_encode_failed")); return; }
      blob.arrayBuffer().then(buffer => resolve(new Uint8Array(buffer)), reject);
    }, "image/png");
  });
}

/** 0-based frame index → 1-based, zero-padded label: (0, 24) → "001", (99, 1200) → "0100". */
export function padFrameNumber(index: number, total: number): string {
  const digits = Math.max(3, String(Math.max(1, total)).length);
  return String(index + 1).padStart(digits, "0");
}

// ---------------------------------------------------------------------------------------------
// Saving. The browser only allows the save window right after a click, so callers open it with
// pickSaveTarget BEFORE rendering, then writeSaveTarget when the bytes are ready.

const SAVE_TYPES: Record<ImageExportKind, { description: string; mime: string; extension: string }> = {
  gif: { description: "GIF animation", mime: "image/gif", extension: ".gif" },
  png: { description: "PNG image", mime: "image/png", extension: ".png" },
  zip: { description: "ZIP of PNG images", mime: "application/zip", extension: ".zip" },
  mp4: { description: "MP4 video", mime: "video/mp4", extension: ".mp4" },
};

type SaveFilePicker = (options?: {
  suggestedName?: string;
  types?: Array<{ description: string; accept: Record<string, string[]> }>;
  excludeAcceptAllOption?: boolean;
}) => Promise<FileSystemFileHandle>;

/**
 * The browser panel inside the Claude desktop app has a save window that answers "cancelled", "not allowed",
 * or never answers at all, so exports there always download instead (SPEC-0020 Phase 5, found in Arthur's review).
 */
export const isEmbeddedClaudeBrowser = () => typeof navigator !== "undefined" && /\bClaude\/\d/.test(navigator.userAgent);

/** Faster than this, a "cancelled" save window was never really shown. */
export const SAVE_WINDOW_MIN_HUMAN_MS = 400;

const isAbortError = (error: unknown) => error instanceof DOMException && error.name === "AbortError";

/**
 * Opens the save window. Returns the chosen file, { type: "download" } when the browser has no
 * save window (Safari/Firefox) or refuses to open it, or null when the user cancelled.
 */
export async function pickSaveTarget(suggestedName: string, kind: ImageExportKind): Promise<SaveTarget | null> {
  const picker = (window as unknown as { showSaveFilePicker?: SaveFilePicker }).showSaveFilePicker;
  if (typeof picker !== "function" || isEmbeddedClaudeBrowser()) return { type: "download" };
  const type = SAVE_TYPES[kind];
  const startedAt = performance.now();
  try {
    const handle = await picker.call(window, {
      suggestedName,
      types: [{ description: type.description, accept: { [type.mime]: [type.extension] } }],
    });
    return { type: "file", handle };
  } catch (error) {
    // Some windows (e.g. the browser inside the Claude app) can't show a save window at all and answer
    // "cancelled" instantly. A person can't cancel that fast, so treat it as "no save window": download.
    if (isAbortError(error)) return performance.now() - startedAt < SAVE_WINDOW_MIN_HUMAN_MS ? { type: "download" } : null;
    // e.g. SecurityError when not called right after a click: a normal download still works.
    return { type: "download" };
  }
}

export async function writeSaveTarget(
  target: SaveTarget,
  data: Uint8Array | Blob,
  suggestedName: string,
  kind: ImageExportKind,
): Promise<"saved" | "downloaded"> {
  const blob = data instanceof Blob ? data : new Blob([data as Uint8Array<ArrayBuffer>], { type: SAVE_TYPES[kind].mime });
  if (target.type === "file") {
    let writable: FileSystemWritableFileStream;
    try {
      writable = await target.handle.createWritable({ keepExistingData: false });
    } catch (error) {
      // Some windows (e.g. the browser inside the Claude app) hand back a file but won't let it be written:
      // download it instead of failing.
      if (error instanceof DOMException && (error.name === "NotAllowedError" || error.name === "SecurityError")) {
        return writeSaveTarget({ type: "download" }, blob, suggestedName, kind);
      }
      throw error;
    }
    try {
      await writable.write(blob);
      await writable.close();
    } catch (error) {
      await writable.abort().catch(() => undefined);
      throw error;
    }
    return "saved";
  }
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = suggestedName;
  link.rel = "noopener";
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Give the browser time to start the download before the URL is released.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return "downloaded";
}

/** Pick + write in one go (only safe when called right after a click). */
export async function saveBytesAsFile(
  bytes: Uint8Array | Blob,
  suggestedName: string,
  kind: ImageExportKind,
): Promise<"saved" | "downloaded" | "cancelled"> {
  const target = await pickSaveTarget(suggestedName, kind);
  if (!target) return "cancelled";
  try {
    return await writeSaveTarget(target, bytes, suggestedName, kind);
  } catch (error) {
    if (isAbortError(error)) return "cancelled";
    throw error;
  }
}
