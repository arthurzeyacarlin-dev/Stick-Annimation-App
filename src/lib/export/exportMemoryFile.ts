// SPEC-0020 Phase 5: browsers without a save window (Safari, Firefox) still export.
// The MP4 writer expects a file handle it can write to at any position; this one keeps the bytes in memory,
// and the Export screen downloads them when the video is finished.

const INITIAL_BYTES = 4 * 1024 * 1024;

type PositionedWrite = { type: "write"; data: BufferSource; position?: number };

const toBytes = (data: BufferSource) =>
  data instanceof Uint8Array ? data : ArrayBuffer.isView(data) ? new Uint8Array(data.buffer, data.byteOffset, data.byteLength) : new Uint8Array(data);

export type MemoryFileHandle = FileSystemFileHandle & { toBlob: () => Blob };

export function createMemoryFileHandle(name: string, type: string): MemoryFileHandle {
  let buffer = new Uint8Array(INITIAL_BYTES);
  let length = 0;

  const ensureCapacity = (needed: number) => {
    if (needed <= buffer.length) return;
    let next = buffer.length;
    while (next < needed) next *= 2;
    const grown = new Uint8Array(next);
    grown.set(buffer.subarray(0, length));
    buffer = grown;
  };

  const writeAt = (bytes: Uint8Array, position: number) => {
    ensureCapacity(position + bytes.byteLength);
    buffer.set(bytes, position);
    length = Math.max(length, position + bytes.byteLength);
  };

  const toBlob = () => new Blob([buffer.slice(0, length)], { type });

  const handle = {
    kind: "file" as const,
    name,
    toBlob,
    async getFile() { return new File([buffer.slice(0, length)], name, { type }); },
    async createWritable(options?: { keepExistingData?: boolean }) {
      if (!options?.keepExistingData) length = 0;
      let cursor = 0;
      const stream = new WritableStream<PositionedWrite | BufferSource>({
        write(chunk) {
          if (chunk && typeof chunk === "object" && "type" in chunk && chunk.type === "write") {
            const bytes = toBytes(chunk.data);
            const position = chunk.position ?? cursor;
            writeAt(bytes, position);
            cursor = position + bytes.byteLength;
            return;
          }
          const bytes = toBytes(chunk as BufferSource);
          writeAt(bytes, cursor);
          cursor += bytes.byteLength;
        },
      });
      return Object.assign(stream, {
        async truncate(size: number) { length = Math.min(length, Math.max(0, size)); cursor = Math.min(cursor, length); },
      });
    },
  };
  return handle as unknown as MemoryFileHandle;
}
