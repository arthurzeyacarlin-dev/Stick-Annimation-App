import { AsyncLocalStorage } from "node:async_hooks";

// (Nov 17, Part 2) WHAT HE IS DOING RIGHT NOW, while one chat turn is being answered. The panel sends a random liveKey with its turn and asks
// GET ?live=<key> every half second: it sees his words AS HE WRITES THEM (the say text, read from the streamed answer) instead of waiting
// ~30 s for the whole card. Nothing here changes the answer: the turn's result is exactly what it was. Kept in memory only (one server),
// only for the owner who sent the turn, and dropped as soon as the turn is answered.

export type V1Live = { say: string; searching: string[]; at: number };
type Entry = V1Live & { ownerId: string };
const g = globalThis as typeof globalThis & { diamondV1Live?: Map<string, Entry>; diamondV1LiveScope?: AsyncLocalStorage<string> };
const live = (g.diamondV1Live ??= new Map());   // (survives hot reloads like the runner)
const scope = (g.diamondV1LiveScope ??= new AsyncLocalStorage<string>());

export const isV1LiveKey = (v: unknown): v is string => typeof v === "string" && /^[A-Za-z0-9-]{8,64}$/.test(v);

/** runs one turn with its live key; the key is gone again when the turn is answered (or failed) */
export async function withV1Live<T>(key: string | null, ownerId: string, run: () => Promise<T>): Promise<T> {
  if (!key) return run();
  live.set(key, { ownerId, say: "", searching: [], at: Date.now() });
  try { return await scope.run(key, run); } finally { live.delete(key); }
}

/** the AI call reports into the turn it belongs to (null = no live key: nothing is reported) */
export function v1LiveReporter(): ((patch: Partial<V1Live>) => void) | null {
  const key = scope.getStore();
  if (!key) return null;
  return (patch) => { const e = live.get(key); if (e) live.set(key, { ...e, ...patch, at: Date.now() }); };
}

export function readV1Live(key: string, ownerId: string): V1Live | null {
  const e = live.get(key);
  return e && e.ownerId === ownerId ? { say: e.say, searching: e.searching, at: e.at } : null;
}

// The "say" text of a tool answer that is still being written (its JSON arrives in pieces). say is the 2nd key of the turn schema
// (after intent), so the first words come early. Returns what is readable so far ("" = not started); never throws.
export function partialSay(json: string): string {
  const m = /"say"\s*:\s*"/.exec(json);
  if (!m) return "";
  let out = "";
  for (let i = m.index + m[0].length; i < json.length; i += 1) {
    const c = json[i];
    if (c === "\"") return out;
    if (c !== "\\") { out += c; continue; }
    const n = json[i + 1];
    if (n === undefined) return out;   // (an escape cut in half: wait for the next piece)
    if (n === "u") { const hex = json.slice(i + 2, i + 6); if (!/^[0-9a-fA-F]{4}$/.test(hex)) return out; out += String.fromCharCode(parseInt(hex, 16)); i += 5; continue; }
    out += n === "n" ? "\n" : n === "t" ? "\t" : n === "r" ? "" : n === "b" || n === "f" ? "" : n;
    i += 1;
  }
  return out;
}
