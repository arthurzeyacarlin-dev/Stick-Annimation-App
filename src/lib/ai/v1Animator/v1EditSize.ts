// (Nov 2 app round, PLAN_EDIT_SPEED_NOV2 fix 3 + DESTROY hole 3) EDITS KEEP SIZE - the SERVER guard behind the book rule (luna-book.json
// edit.size_guard). A rewrite changes HOW, not HOW MANY: the actions of a sentence = its pieces between the book's splitters after every repeat
// phrase is taken out (a repeat = ONE action with a count). Pure functions; every word / number is the book's.
import type { LunaBook } from "./v1LunaBook.ts";

export type EditSize = { maxBeats: number; splitters: string[]; repeatPhrases: string[]; moreWords: string[]; newPartSubject: string; retryWords: string };

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
// a repeat phrase may be a pattern ("\\d+ times"): book strings are used as written, whole words
const repeatRe = (g: EditSize) => new RegExp(`(?<![A-Za-z])(?:${g.repeatPhrases.map((p) => (/\\d/.test(p) ? p : esc(p))).join("|")})(?![A-Za-z])`, "gi");
const splitRe = (g: EditSize) => new RegExp(`(${g.splitters.map(esc).join("|")})`, "i");

// the sentence cut into its actions, each piece in the user's own words (repeat phrases kept INSIDE their action, never cut by " and ")
export function actionPieces(sentence: string, g: EditSize): string[] {
  const kept: string[] = [];
  const masked = sentence.trim().replace(/[.!?]+$/, "").replace(repeatRe(g), (m) => { kept.push(m); return `\u0000${kept.length - 1}\u0000`; });
  const parts = masked.split(splitRe(g)).filter((_, i) => i % 2 === 0);
  return parts.map((p) => p.replace(/\u0000(\d+)\u0000/g, (_, i: string) => kept[Number(i)]).trim()).filter((p) => p.length > 0);
}
export const actionCount = (sentence: string, g: EditSize) => actionPieces(sentence, g).length;

// the user asked for MORE (whole words / phrases of the book's more_words, by the user's own message)
export const askedForMore = (message: string, g: EditSize) =>
  g.moreWords.some((w) => new RegExp(`(?<![A-Za-z])${esc(w)}(?![A-Za-z])`, "i").test(message));

// a too-big sentence -> the first part keeps `keep` actions (the block), the rest go in new parts of at most maxBeats actions each
export function splitBySize(sentence: string, keep: number, g: EditSize): string[] {
  const pieces = actionPieces(sentence, g);
  if (pieces.length <= keep) return [sentence];
  const head = pieces.slice(0, keep), rest = pieces.slice(keep), out = [cap(head.join(", ")) + "."];
  for (let i = 0; i < rest.length; i += g.maxBeats) out.push(`${g.newPartSubject} ${rest.slice(i, i + g.maxBeats).join(", ")}.`);
  return out;
}
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

// -> null (fine) or the guard's verdict for one rewritten sentence of a block that had `before` actions
export function sizeVerdict(sentence: string, before: number, g: EditSize): { after: number; keep: number } | null {
  const after = actionCount(sentence, g);
  return after > g.maxBeats && after > before ? { after, keep: g.maxBeats } : null;   // the part may grow up to the cap, the rest goes in new parts
}

export function readEditSize(raw: unknown, need: <T>(v: T | undefined | null, key: string) => T): EditSize {
  const r = (raw ?? {}) as Record<string, unknown>;
  const list = (k: string) => { const v = need(r[k] as string[] | undefined, `edit.size_guard.${k}`); if (!Array.isArray(v) || !v.every((x) => typeof x === "string")) throw new Error(`book key edit.size_guard.${k} is not a list of words`); return v; };
  const maxBeats = Number(need(r.max_beats as number | undefined, "edit.size_guard.max_beats"));
  if (!Number.isSafeInteger(maxBeats) || maxBeats < 1) throw new Error("book key edit.size_guard.max_beats is not a whole number >= 1");
  return { maxBeats, splitters: list("splitters"), repeatPhrases: list("repeat_phrases"), moreWords: list("more_words"),
    newPartSubject: need(r.new_part_subject as string | undefined, "edit.size_guard.new_part_subject"), retryWords: need(r.retry_words as string | undefined, "edit.size_guard.retry_words") };
}

export const retryWords = (book: LunaBook, fill: { block: string; before: number; after: number }) =>
  book.editSize.retryWords.replace(/\{(\w+)\}/g, (_, k: string) => String(k === "max_beats" ? book.editSize.maxBeats : (fill as Record<string, string | number>)[k] ?? `{${k}}`));
