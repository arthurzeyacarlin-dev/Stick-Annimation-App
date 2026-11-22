import "server-only";

// (Nov 11 security) ONE bounded JSON reader for every API route: a body bigger than the limit is refused by its announced size and again by the
// bytes actually read, before anything is parsed. Normal requests are kilobytes; a 2 GB body can no longer crash the app.
export const JSON_BODY_MAX = 64 * 1024;

export class BodyTooLarge extends Error {
  status = 413;
  constructor() { super("Request is too large."); }
}

/** The raw body, at most maxBytes: refused by its announced size, then again by the bytes actually read (a chunked body cannot lie). */
export async function readBytes(request: Request, maxBytes: number): Promise<Uint8Array<ArrayBuffer>> {
  if (Number(request.headers.get("content-length") ?? 0) > maxBytes) throw new BodyTooLarge();
  const reader = request.body?.getReader();
  if (!reader) return new Uint8Array();
  const chunks: Uint8Array[] = [];
  let length = 0;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    length += value.byteLength;
    if (length > maxBytes) { void reader.cancel().catch(() => {}); throw new BodyTooLarge(); }   // not awaited: on a cloned (tee'd) body the cancel only settles once the other branch closes
    chunks.push(value);
  }
  return new Uint8Array(Buffer.concat(chunks));
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- the caller checks the shape, exactly as it did with request.json()
export async function readJson<T = any>(request: Request, maxBytes = JSON_BODY_MAX): Promise<T> {
  if (!request.body) return null as T;
  return JSON.parse(Buffer.from(await readBytes(request, maxBytes)).toString("utf8")) as T;
}
