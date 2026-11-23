// (Nov 23, Arthur: "every time I make a project, I always forget to name it") when an AI animation lands on the timeline
// of a project that still has no name, the project is named after what he asked for. Only the name: how animations are
// made, edited and placed is untouched. No AI call: the name is his own first words, tidied into a short title.

const UNNAMED = /^(?:untitled project(?:\s*\(?\d+\)?)?|unnamed drawing project|untitled)$/i;

/** True while a project still has no name of its own (a new project's default name). */
export function isUnnamedProject(title: string | null | undefined): boolean {
  const t = (title ?? "").trim();
  return !t || UNNAMED.test(t);
}

const MAX = 60;

/** "make an animation of a dog chasing a cat." -> "A dog chasing a cat". null when nothing usable is left. */
export function aiProjectName(words: string | null | undefined): string | null {
  let t = (words ?? "").replace(/[\r\n]+/g, ". ").replace(/\s+/g, " ").trim();
  t = t.split(/(?<=[.!?])\s/)[0] ?? t;   // the first sentence
  t = t.replace(/^(?:(?:please|pls|hey|ok|okay)[,!]?\s+|(?:can|could|would|will) you\s+|i (?:want|need|would like|'d like)\s+(?:you\s+)?(?:to\s+)?|let'?s\s+)+/i, "");
  t = t.replace(/^(?:make|create|do|draw|animate|show|generate)\s+(?:me\s+|us\s+)?(?:(?:(?:an?|the|some)\s+)?(?:(?:short|quick|cool|funny|simple|little|small|stick[\s-]?figure|2d|cartoon)\s+)*(?:animation|animated|video|clip|scene|story|cartoon)s?(?:\s+|$))?(?:(?:of|where|with|about|that shows|showing|in which)(?:\s+|$))?/i, "");
  t = t.replace(/^["'“‘]+|["'”’]+$/g, "").replace(/[\s.!?,;:]+$/, "").trim();
  if (t.length > MAX) {
    t = t.slice(0, MAX + 1).replace(/\s+\S*$/, "");
    t = t.replace(/(?:[\s,;:]+(?:and|or|but|the|a|an|so|to|of|with|it|that|then|in|on|at|his|her|their))+$/i, "").replace(/[\s,;:]+$/, "").trim();
  }
  if (!t || !/[\p{L}\p{N}]/u.test(t)) return null;
  return t.charAt(0).toUpperCase() + t.slice(1);
}
