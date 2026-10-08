// EVERY THING THE STORY NAMES IS IN THE SCENE (Arthur, 2026-10-08: "it clearly says the stick figure throws a powerful
// punch at a punching bag, not a stick figure throws a powerful punch"). A cheap word check, no AI: a thing the
// request names after a doing-word or place-word ("at a punching bag", "holding an umbrella", "next to a tree") that
// appears NOWHERE in the plan (no object, prop, effect, background piece or figure carries its name) is a problem the
// AI is asked to fix in its one review — it adds the thing (an object, or a prop made of parts). Figures, body parts
// and other words that are never things are skipped.
import type { DirectedPlan } from "./repair.ts";

const NAMES_A_THING = /\b(?:at|with|on|onto|into|holding|holds|hold|carrying|carries|carry|kicks?|kicking|punch(?:es|ing)?|hits?|hitting|throws?|throwing|catch(?:es|ing)?|picks? up|rides?|riding|drives?|opens?|climbs?|over|next to|near|behind|under|beside|inside|from|out of|against|toward|towards)\s+(?:a|an|the|his|her|their|its|some|two|three)\s+([a-z]+(?:\s+[a-z]+)?)/gi;
const NOT_A_THING = new Set([
  "stick", "figure", "figures", "man", "men", "guy", "person", "people", "boy", "girl", "kid", "friend", "friends", "dad", "mom", "brother", "sister",
  "one", "other", "opponent", "enemy", "hero", "crowd", "camera", "screen", "page", "viewer", "audience",
  "hand", "hands", "arm", "arms", "leg", "legs", "foot", "feet", "head", "knee", "knees", "back", "face", "body", "chest", "fist", "fists", "hips", "hip",
  "time", "moment", "end", "start", "way", "air", "ground", "floor", "same", "first", "second", "third", "last", "next", "thing", "things", "top", "side", "left", "right", "middle",
  "punch", "punches", "kick", "kicks", "jump", "jumps", "hit", "hits", "blow", "blows", "move", "moves", "pose", "dance", "celebration", "cartwheel", "flip", "wave", "times", "steps", "step", "run", "walk", "throw", "catch", "block", "blocks", "turn", "spin", "look", "smile", "attack", "attacks", "shot", "shots", "power", "fight",
  "and", "then", "while", "but", "very", "really", "big", "small", "little", "powerful", "strong", "fast", "slow", "red", "blue", "green", "black", "white", "purple", "pink", "yellow", "orange",
]);

const stem = (w: string) => w.toLowerCase().replace(/(?:es|s)$/i, "");

export function missingThings(prompt: string, plan: DirectedPlan): string[] {
  const blob = JSON.stringify({ objects: plan.objects ?? [], effects: (plan as { effects?: unknown }).effects ?? [], background: plan.background ?? null, characters: plan.characters.map((c) => [c.id, c.name]) }).toLowerCase();
  const out: string[] = [];
  for (const m of prompt.matchAll(NAMES_A_THING)) {
    const words = m[1].toLowerCase().split(/\s+/).filter((w) => !NOT_A_THING.has(w));
    if (!words.length) continue;
    const noun = words[words.length - 1];
    if (NOT_A_THING.has(noun) || noun.length < 3) continue;
    if (blob.includes(stem(noun))) continue;
    const phrase = words.join(" ");
    if (!out.includes(phrase)) out.push(phrase);
  }
  return out;
}

export const missingThingsProblem = (missing: string[]) =>
  `The request names ${missing.map((m) => `a ${m}`).join(", ")}, but the plan never shows it — add it: an object, or a prop made of parts (params.parts in the prop's own units), standing or hanging where the story needs it.`;
