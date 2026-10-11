import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildGifPalette,
  crc32,
  createGifWriter,
  createStoredZip,
  encodeGif,
  encodeGifAsync,
  padFrameNumber,
  pickPaletteSampleIndices,
} from "./exportImages.ts";

type Rgb = [number, number, number];

// Node has no ImageData; the encoder only reads width, height and data.
const makeFrame = (width: number, height: number, colorAt: (x: number, y: number) => Rgb) => {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const [r, g, b] = colorAt(x, y);
      const o = (y * width + x) * 4;
      data[o] = r; data[o + 1] = g; data[o + 2] = b; data[o + 3] = 255;
    }
  }
  return { width, height, data, colorSpace: "srgb" } as unknown as ImageData;
};

// Tiny independent GIF LZW decoder (straightforward array dictionary, not the encoder's hash).
const lzwDecode = (data: Uint8Array, minCodeSize: number) => {
  const clearCode = 1 << minCodeSize;
  const endCode = clearCode + 1;
  let codeSize = minCodeSize + 1;
  let dict: number[][] = [];
  let prev: number[] | null = null;
  const reset = () => {
    dict = [];
    for (let i = 0; i < clearCode; i += 1) dict.push([i]);
    dict.push([], []);
    codeSize = minCodeSize + 1;
    prev = null;
  };
  reset();
  const out: number[] = [];
  let bitPos = 0;
  let sawEnd = false;
  while (bitPos + codeSize <= data.length * 8) {
    let code = 0;
    for (let bit = 0; bit < codeSize; bit += 1, bitPos += 1) {
      if (data[bitPos >> 3] & (1 << (bitPos & 7))) code |= 1 << bit;
    }
    if (code === clearCode) { reset(); continue; }
    if (code === endCode) { sawEnd = true; break; }
    if (prev === null) {
      assert.ok(code < clearCode, "first code after clear must be a literal");
      out.push(code);
      prev = [code];
      continue;
    }
    const previous: number[] = prev;
    let entry: number[];
    if (code < dict.length) entry = dict[code];
    else if (code === dict.length) entry = [...previous, previous[0]];
    else throw new Error(`bad LZW code ${code} (dictionary ${dict.length})`);
    out.push(...entry);
    if (dict.length < 4096) dict.push([...previous, entry[0]]);
    if (dict.length === 1 << codeSize && codeSize < 12) codeSize += 1;
    prev = entry;
  }
  assert.ok(sawEnd, "LZW stream must end with the end code");
  return out;
};

// Walks the GIF block structure and decodes every frame to palette indices.
const parseGif = (bytes: Uint8Array) => {
  const ascii = (from: number, length: number) => String.fromCharCode(...bytes.subarray(from, from + length));
  const u16 = (at: number) => bytes[at] | (bytes[at + 1] << 8);
  const signature = ascii(0, 6);
  const width = u16(6);
  const height = u16(8);
  const packed = bytes[10];
  assert.ok(packed & 0x80, "global colour table flag");
  const tableBits = (packed & 7) + 1;
  const palette = bytes.subarray(13, 13 + (3 << tableBits));
  let pos = 13 + (3 << tableBits);
  const readSubBlocks = () => {
    const parts: number[] = [];
    for (;;) {
      const size = bytes[pos++];
      if (size === 0) break;
      assert.ok(size <= 255);
      parts.push(...bytes.subarray(pos, pos + size));
      pos += size;
    }
    return new Uint8Array(parts);
  };
  const frames: number[][] = [];
  const delays: number[] = [];
  let loopCount: number | null = null;
  let trailer = false;
  while (pos < bytes.length) {
    const introducer = bytes[pos++];
    if (introducer === 0x3b) { trailer = true; break; }
    if (introducer === 0x21) {
      const label = bytes[pos++];
      const body = readSubBlocks();
      if (label === 0xf9) delays.push(body[1] | (body[2] << 8));
      if (label === 0xff && String.fromCharCode(...body.subarray(0, 11)) === "NETSCAPE2.0") loopCount = body[12] | (body[13] << 8);
      continue;
    }
    assert.equal(introducer, 0x2c, `unexpected block 0x${introducer.toString(16)} at ${pos - 1}`);
    assert.equal(u16(pos + 4), width);
    assert.equal(u16(pos + 6), height);
    pos += 9;
    const minCodeSize = bytes[pos++];
    frames.push(lzwDecode(readSubBlocks(), minCodeSize));
  }
  return { signature, width, height, tableBits, palette, frames, delays, loopCount, trailer, endsAt: pos };
};

const colorOf = (palette: Uint8Array, index: number): Rgb => [palette[index * 3], palette[index * 3 + 1], palette[index * 3 + 2]];

// Deterministic pseudo-random numbers for the noise frames.
const random = (seed: number) => () => {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 2 ** 32;
};

test("GIF: header, size, frame count, loop, delay and trailer are right", () => {
  const frames = [0, 1, 2].map(shift => makeFrame(7, 5, (x, y) => (x === y + shift ? [0, 0, 0] : [255, 255, 255])));
  const gif = encodeGif(frames, { delayCentiseconds: 8, loop: true });
  const parsed = parseGif(gif);
  assert.equal(parsed.signature, "GIF89a");
  assert.equal(parsed.width, 7);
  assert.equal(parsed.height, 5);
  assert.equal(parsed.frames.length, 3);
  assert.deepEqual(parsed.delays, [8, 8, 8]);
  assert.equal(parsed.loopCount, 0);
  assert.ok(parsed.trailer);
  assert.equal(parsed.endsAt, gif.length, "trailer is the last byte");
  assert.equal(gif.filter(b => b === 0x2c).length >= 3, true);

  const noLoop = parseGif(encodeGif(frames, { delayCentiseconds: 8, loop: false }));
  assert.equal(noLoop.loopCount, null);
});

test("GIF: LZW round trip gives back every pixel colour (small frames)", () => {
  const frames = [0, 1, 2].map(shift => makeFrame(7, 5, (x, y) => (x === y + shift ? [0, 0, 0] : x === 0 ? [200, 40, 40] : [255, 255, 255])));
  const parsed = parseGif(encodeGif(frames, { delayCentiseconds: 4, loop: true }));
  frames.forEach((frame, f) => {
    assert.equal(parsed.frames[f].length, 35);
    parsed.frames[f].forEach((index, p) => {
      assert.deepEqual(colorOf(parsed.palette, index), [frame.data[p * 4], frame.data[p * 4 + 1], frame.data[p * 4 + 2]]);
    });
  });
});

test("GIF: LZW round trip with 200 colours of noise (12-bit codes and dictionary clears)", () => {
  const colors: Rgb[] = Array.from({ length: 200 }, (_, i) => [(i % 8) * 32, (Math.floor(i / 8) % 5) * 48, Math.floor(i / 40) * 40]);
  const next = random(42);
  const frame = makeFrame(300, 200, () => colors[Math.floor(next() * colors.length)]);
  const gif = encodeGif([frame], { delayCentiseconds: 10, loop: false });
  const parsed = parseGif(gif);
  assert.equal(parsed.tableBits, 8);
  assert.equal(parsed.frames[0].length, 300 * 200);
  parsed.frames[0].forEach((index, p) => {
    assert.deepEqual(colorOf(parsed.palette, index), [frame.data[p * 4], frame.data[p * 4 + 1], frame.data[p * 4 + 2]]);
  });
});

test("GIF: one-colour frame and long runs still decode", () => {
  const flat = makeFrame(640, 360, () => [255, 255, 255]);
  const parsed = parseGif(encodeGif([flat, flat], { delayCentiseconds: 4, loop: true }));
  assert.equal(parsed.frames.length, 2);
  for (const frame of parsed.frames) {
    assert.equal(frame.length, 640 * 360);
    assert.ok(frame.every(index => index === 0));
  }
  assert.deepEqual(colorOf(parsed.palette, 0), [255, 255, 255]);
});

test("GIF: more than 255 colours → at most 255 palette colours and the frame still decodes", () => {
  // Worst case for a popularity palette: a smooth 2-D gradient (~1000 buckets, all equally common).
  const frame = makeFrame(256, 64, (x, y) => [x, y * 4, 255 - x]);
  const parsed = parseGif(encodeGif([frame], { delayCentiseconds: 4, loop: false }));
  assert.equal(buildGifPalette([frame]).count, 255);
  assert.equal(parsed.frames[0].length, 256 * 64);
  assert.ok(parsed.frames[0].every(index => index < 255));
});

test("GIF: anti-aliased line drawing with >255 colours keeps strokes and background exact", () => {
  // White paper, 10 stroke colours, each with a soft edge blending into white over 40 steps.
  const strokes: Rgb[] = [[0, 0, 0], [220, 30, 30], [30, 90, 220], [20, 160, 60], [250, 180, 0], [140, 40, 180], [0, 170, 170], [120, 80, 40], [255, 105, 180], [90, 90, 90]];
  const blend = (c: Rgb, t: number): Rgb => [0, 1, 2].map(i => Math.round(c[i] + (255 - c[i]) * t)) as Rgb;
  const frame = makeFrame(400, 300, (x, y) => {
    const band = Math.floor(y / 30);
    const across = x - 100;
    if (across < 0 || across >= 240) return [255, 255, 255];
    if (across < 200) return strokes[band]; // solid stroke
    return blend(strokes[band], (across - 199) / 41); // soft edge
  });
  const palette = buildGifPalette([frame]);
  assert.equal(palette.count, 255, "more than 255 colours went in");
  const parsed = parseGif(encodeGif([frame], { delayCentiseconds: 4, loop: false }));
  let worst = 0;
  parsed.frames[0].forEach((index, p) => {
    const [r, g, b] = colorOf(parsed.palette, index);
    const source = [frame.data[p * 4], frame.data[p * 4 + 1], frame.data[p * 4 + 2]];
    const distance = Math.hypot(r - source[0], g - source[1], b - source[2]);
    const x = p % 400;
    if (x < 300) assert.ok(distance < 3, `solid stroke / paper pixel ${p} changed (${distance.toFixed(1)})`);
    worst = Math.max(worst, distance);
  });
  assert.ok(worst < 32, `soft edge drifted too far (${worst.toFixed(1)})`);
});

test("GIF streaming writer: colours missing from the sample palette map to the nearest colour", () => {
  const sample = makeFrame(4, 4, x => (x < 2 ? [0, 0, 0] : [255, 255, 255]));
  const palette = buildGifPalette([sample]);
  assert.equal(palette.count, 2);
  const writer = createGifWriter({ width: 4, height: 4, palette, delayCentiseconds: 5, loop: true });
  writer.addFrame(sample);
  writer.addFrame(makeFrame(4, 4, x => (x < 2 ? [20, 10, 0] : [240, 250, 230])));
  assert.throws(() => writer.addFrame(makeFrame(3, 4, () => [0, 0, 0])), /gif_frame_size_mismatch/);
  const parsed = parseGif(writer.finish());
  assert.equal(parsed.frames.length, 2);
  assert.deepEqual(parsed.frames[1], parsed.frames[0]);
  assert.throws(() => writer.finish(), /gif_already_finished/);
});

test("GIF async: reports progress and can be cancelled", async () => {
  const frames = Array.from({ length: 5 }, (_, i) => makeFrame(8, 8, x => (x === i ? [0, 0, 0] : [255, 255, 255])));
  const progress: string[] = [];
  const gif = await encodeGifAsync(frames, { delayCentiseconds: 4, loop: true }, { onProgress: (done, total) => progress.push(`${done}/${total}`) });
  assert.deepEqual(progress, ["1/5", "2/5", "3/5", "4/5", "5/5"]);
  assert.deepEqual(gif, encodeGif(frames, { delayCentiseconds: 4, loop: true }));

  const controller = new AbortController();
  await assert.rejects(
    encodeGifAsync(frames, { delayCentiseconds: 4, loop: true }, { signal: controller.signal, onProgress: done => { if (done === 2) controller.abort(); } }),
    (error: unknown) => error instanceof DOMException && error.name === "AbortError" && error.message === "Export cancelled",
  );
});

test("palette sample indices are evenly spaced and include first and last", () => {
  assert.deepEqual(pickPaletteSampleIndices(3), [0, 1, 2]);
  const picks = pickPaletteSampleIndices(300, 12);
  assert.equal(picks.length, 12);
  assert.equal(picks[0], 0);
  assert.equal(picks[11], 299);
});

test("ZIP: signatures, counts, UTF-8 names, STORE and CRCs are right", () => {
  assert.equal(crc32(new TextEncoder().encode("123456789")), 0xcbf43926);
  const files = [
    { name: "My Animation 001.png", data: new Uint8Array([137, 80, 78, 71, 1, 2, 3]) },
    { name: "Ünïcode 002.png", data: new Uint8Array(1000).map((_, i) => (i * 7) & 255) },
    { name: "empty.png", data: new Uint8Array(0) },
  ];
  const zip = createStoredZip(files);
  const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
  const eocd = zip.length - 22;
  assert.equal(view.getUint32(eocd, true), 0x06054b50);
  assert.equal(view.getUint16(eocd + 8, true), 3);
  assert.equal(view.getUint16(eocd + 10, true), 3);
  const centralSize = view.getUint32(eocd + 12, true);
  let central = view.getUint32(eocd + 16, true);
  assert.equal(central + centralSize, eocd);

  const decoder = new TextDecoder();
  files.forEach(file => {
    assert.equal(view.getUint32(central, true), 0x02014b50);
    assert.equal(view.getUint16(central + 8, true) & 0x800, 0x800, "UTF-8 name flag");
    assert.equal(view.getUint16(central + 10, true), 0, "STORE");
    const crc = view.getUint32(central + 16, true);
    assert.equal(crc, crc32(file.data));
    assert.equal(view.getUint32(central + 20, true), file.data.length);
    const nameLength = view.getUint16(central + 28, true);
    assert.equal(decoder.decode(zip.subarray(central + 46, central + 46 + nameLength)), file.name);
    const local = view.getUint32(central + 42, true);
    assert.equal(view.getUint32(local, true), 0x04034b50);
    assert.equal(view.getUint16(local + 6, true) & 0x800, 0x800);
    assert.equal(view.getUint32(local + 14, true), crc);
    const localNameLength = view.getUint16(local + 26, true);
    const start = local + 30 + localNameLength + view.getUint16(local + 28, true);
    assert.deepEqual(zip.subarray(start, start + file.data.length), file.data);
    central += 46 + nameLength;
  });
});

test("frame numbers are 1-based and zero-padded", () => {
  assert.equal(padFrameNumber(0, 24), "001");
  assert.equal(padFrameNumber(23, 24), "024");
  assert.equal(padFrameNumber(99, 1200), "0100");
});
