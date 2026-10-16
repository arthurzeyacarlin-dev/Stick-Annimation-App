// STORY MEMORY (SPEC-0024, Oct 14): a story is built block by block (about 7 seconds each). Each block must carry on from the
// last one: the same figures (same look, size, style), standing where they ended, facing the way they ended, still holding what
// they held, and every thing still where it was (a ball stuck in a tree stays in the tree). The engine remembers this from the
// block it really built — the last picture — so Claude only writes what CHANGES in the next block. Never hard-coded: it is read
// from whatever the last block was.
import { buildScene } from "../engine.ts";
import { makeEffectsTestScene } from "../moves/tests2c.ts";

type Plan = Record<string, unknown>;
type Char = { id: string; name?: string; look?: unknown; size?: number; style?: string; x?: number; facing?: string; actions?: unknown[] };
type Obj = { id: string; name?: string; look?: { size?: number }; heldBy?: string; keys?: { t: number; x: number; y: number }[] };

export type StoryMemory = {
  characters: { id: string; name?: string; look?: unknown; size?: number; style?: string; x: number; facing: string; lying: boolean; holding: string[] }[];
  objects: { id: string; name?: string; look?: unknown; x: number; y: number; heldBy?: string }[];
};

// What the last picture of a built block shows.
export function rememberBlock(plan: Plan): StoryMemory | null {
  let built: ReturnType<typeof buildScene>;
  try { built = buildScene(makeEffectsTestScene(plan as Parameters<typeof makeEffectsTestScene>[0], 1920), 12); } catch { return null; }
  const last = built.frames.length - 1;
  const shots = [plan, ...((plan.cuts as Plan[] | undefined) ?? [])];
  // a figure's look/name come from the first shot that says them (cuts usually only give ids)
  const info = new Map<string, Char>();
  for (const sh of shots) for (const c of (sh.characters as Char[] | undefined) ?? []) info.set(c.id, { ...c, ...info.get(c.id), ...(info.get(c.id)?.look ? {} : { look: c.look }) });
  const objLooks = new Map<string, Obj>();
  for (const sh of shots) for (const o of (sh.objects as Obj[] | undefined) ?? []) if (!objLooks.has(o.id)) objLooks.set(o.id, o);
  const frame = built.frames[last] ?? [], objs = built.objects[last] ?? [];
  const H = Number(plan.height ?? 300), G = Number(plan.groundY ?? 900);
  const objects = objs.map((o) => {
    const holder = frame.find((f) => Math.min(Math.hypot(f.skeleton.lHand.x - o.x, f.skeleton.lHand.y - o.y), Math.hypot(f.skeleton.rHand.x - o.x, f.skeleton.rHand.y - o.y)) <= 0.12 * H + (o.look.size ?? 30) / 2);
    const known = objLooks.get(o.id);
    return { id: o.id, ...(known?.name ? { name: known.name } : {}), look: known?.look ?? o.look, x: Math.round(o.x), y: Math.round(o.y), ...(holder ? { heldBy: holder.id } : {}) };
  });
  const characters = frame.map((f) => {
    const c = info.get(f.id) ?? { id: f.id };
    const lying = f.skeleton.hip.y > G - 0.25 * H && Math.abs(f.skeleton.head.y - f.skeleton.hip.y) < 0.3 * H;
    return { id: f.id, ...(c.name ? { name: c.name } : {}), ...(c.look ? { look: c.look } : {}), ...(c.size ? { size: c.size } : {}), ...(c.style ? { style: c.style } : {}),
      x: Math.round(f.skeleton.hip.x), facing: f.facing ?? c.facing ?? "right", lying, holding: objects.filter((o) => o.heldBy === f.id).map((o) => o.id) };
  });
  return { characters, objects };
}

// The next block, carried on from the memory: what the new plan leaves out is filled from it. What it says wins
// (a new colour, a new spot, a new prop) — only the gaps are filled.
export function continueStory(memory: StoryMemory, plan: Plan): Plan {
  const chars = ((plan.characters as Char[] | undefined) ?? []).map((c) => {
    const m = memory.characters.find((x) => x.id === c.id);
    if (!m) return c;
    return { ...c, ...(c.name === undefined && m.name ? { name: m.name } : {}), ...(c.look === undefined && m.look ? { look: m.look } : {}),
      ...(c.size === undefined && m.size ? { size: m.size } : {}), ...(c.style === undefined && m.style ? { style: m.style } : {}),
      ...(c.x === undefined ? { x: m.x } : {}), ...(c.facing === undefined ? { facing: m.facing } : {}) };
  });
  const listed = new Set(((plan.objects as Obj[] | undefined) ?? []).map((o) => o.id));
  const used = JSON.stringify(plan.characters ?? []);
  // a thing from the last block comes back when the new block uses it, or someone still holds it (never a duplicate)
  const carried = memory.objects.filter((o) => !listed.has(o.id) && (used.includes(`"${o.id}"`) || (o.heldBy && chars.some((c) => c.id === o.heldBy))))
    .map((o) => (o.heldBy && chars.some((c) => c.id === o.heldBy) ? { id: o.id, ...(o.name ? { name: o.name } : {}), look: o.look, heldBy: o.heldBy } : { id: o.id, ...(o.name ? { name: o.name } : {}), look: o.look, keys: [{ t: 0, x: o.x, y: o.y }] }));
  const objects = [...((plan.objects as Obj[] | undefined) ?? []).map((o) => {
    const m = memory.objects.find((x) => x.id === o.id);
    return m && o.look === undefined ? { ...o, look: m.look } : o;
  }), ...carried];
  return { ...plan, characters: chars, ...(objects.length ? { objects } : {}) };
}

// One short line for Claude: what is true at the start of the next block.
export function memoryNote(memory: StoryMemory): string {
  const who = memory.characters.map((c) => `${c.name ?? c.id} (id ${c.id}) at x ${c.x} facing ${c.facing}${c.lying ? ", lying down" : ""}${c.holding.length ? `, holding ${c.holding.join(", ")}` : ""}`).join("; ");
  const what = memory.objects.filter((o) => !o.heldBy).map((o) => `${o.name ?? o.id} at x ${o.x}, y ${o.y}`).join("; ");
  return `STORY SO FAR (end of the last block): ${who || "nobody"}.${what ? ` Things: ${what}.` : ""} Keep the same ids; leave out look/x/facing to carry them on; only write what changes.`;
}
