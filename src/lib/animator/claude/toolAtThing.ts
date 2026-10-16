// THE WORKING END REACHES THE WORKED THING (Arthur, Oct 15: "now they must master TOOLS" — the rake never reached the leaves, the
// broom never reached the crumbs). A figure doing a TOOL JOB with a long floor tool — raking, sweeping, mopping, shoveling, hoeing —
// works WHERE THE TOOL'S HEAD REACHES THE THING: the head's strokes along the ground (heldTip, measured on the planned limbs) are
// centered on the worked thing (the one the move names — "rakes the leaves into the pile" — else the nearest loose pile: leaves,
// crumbs, dust, dirt, sand, snow), so the head sweeps through it and effects/index.ts pushedByTools moves it. The figure is placed
// (its start x moves, like bodyGoesToThing) — the hands, the grip and the pose are untouched. Family: every floor-tool job on a thing.
import { heldTip } from "../effects/index.ts";
import { buildScene } from "../engine.ts";
import { makeEffectsTestScene } from "../moves/tests2c.ts";
import { FLOOR_TOOL } from "../moves/transform.ts";

export const TOOL_VERB = /\b(rak(e|es|ing)|sweep(s|ing)?|swept|mop(s|ped|ping)?|shovel(s|ed|ing|ling)?|dig(s|ging)?|hoe(s|ing)?|scoop(s|ing)?|scrub(s|bing)?|brush(es|ing)?)\b/i;
const LOOSE = /lea(f|ves)|crumbs?|dust|dirt|sand|snow|litter|trash|soil|gravel|hay|pile|heap|hole/i;
const STOP = new Set(["the", "and", "with", "into", "onto", "from", "pile", "into", "her", "his", "its", "some", "of"]);
type Fx = { kind?: string; anchor?: { x?: number; y?: number; character?: string; joint?: string; object?: unknown }; params?: Record<string, unknown> };
type Ch = { id: string; x?: number; actions?: { move?: string; params?: Record<string, unknown> }[] };

export function toolAtThing(plan: Record<string, unknown>): Record<string, unknown> {
  const effects = (plan.effects as Fx[] | undefined) ?? [], chars = (plan.characters as Ch[] | undefined) ?? [];
  const name = (e: Fx) => `${e.params?.name ?? ""} ${e.params?.symbol ?? ""}`.toLowerCase();
  const things = effects.map((e, i) => ({ e, i })).filter(({ e }) => e.kind === "prop" && typeof e.anchor?.x === "number" && typeof e.anchor?.y === "number" && !e.anchor.character && !e.anchor.object);
  const jobs: { id: string; n: number; joint: string; thing: Fx }[] = [];
  for (const c of chars) {
    let n = 0;
    for (const a of c.actions ?? []) {
      if (a.move !== "custom") continue;
      n += 1;
      const words = String(a.params?.name ?? "");
      if (!TOOL_VERB.test(words)) continue;
      const tool = effects.find((e) => e.kind === "prop" && e.anchor?.character === c.id && /^[lr]Hand$/.test(String(e.anchor?.joint)) && FLOOR_TOOL.test(name(e)));
      if (!tool) continue;
      // (the thing the words name — most shared content words — else the nearest loose pile within 3 heights)
      const H = Number(plan.height ?? 300), x0 = Number(c.x ?? 0);
      const score = (e: Fx) => name(e).split(/[^a-z']+/).filter((w) => w.length > 2 && !STOP.has(w) && new RegExp(`\\b${w}(s|es)?\\b`, "i").test(words)).length;
      const named = things.map((t) => ({ ...t, s: score(t.e) })).filter((t) => t.s > 0 && LOOSE.test(name(t.e))).sort((p, q) => q.s - p.s)[0];
      const loose = named ?? things.filter((t) => LOOSE.test(name(t.e)) && Math.abs(Number(t.e.anchor!.x) - x0) <= 3 * H).sort((p, q) => Math.abs(Number(p.e.anchor!.x) - x0) - Math.abs(Number(q.e.anchor!.x) - x0))[0];
      if (loose) jobs.push({ id: c.id, n, joint: String(tool.anchor!.joint), thing: loose.e });
    }
  }
  if (!jobs.length) return plan;
  let scene, built;
  try { scene = makeEffectsTestScene(plan as never, 1920); built = buildScene({ ...scene, contacts: undefined }, 24); } catch { return plan; }
  const marks = (scene as { marks?: Record<string, number> }).marks ?? {}, G = Number(plan.groundY ?? 900);
  const out = chars.map((c) => ({ ...c }));
  const placed = new Set<string>();
  for (const j of jobs) {
    if (placed.has(j.id)) continue;
    const from = marks[`${j.id}.custom${j.n}.k1`], to = marks[`${j.id}.custom${j.n}.done`] ?? from + 6;
    if (from === undefined) continue;
    const Hc = Number(scene.characters.find((c) => c.id === j.id)?.height ?? plan.height ?? 300);
    const xs: number[] = [], all: number[] = [];
    for (let i = Math.round(from * built.fps); i <= Math.min(built.frames.length - 1, Math.round(to * built.fps)); i += 1) {
      const tip = heldTip(effects as never, j.id, j.joint, built.frames[i] ?? [], Hc, G, 1920, i / built.fps);
      if (!tip) continue;
      all.push(tip.x);
      if (tip.y >= G - 0.07 * Hc) xs.push(tip.x); // (the head on the ground: a working stroke)
    }
    const use = xs.length >= 3 ? xs : all;
    if (!use.length) continue;
    const mid = (Math.min(...use) + Math.max(...use)) / 2, dx = Math.round(Number(j.thing.anchor!.x) - mid);
    if (Math.abs(dx) < 0.03 * Hc || Math.abs(dx) > 3 * Hc) continue;
    const ci = out.findIndex((c) => c.id === j.id);
    out[ci] = { ...out[ci], x: Number(out[ci].x ?? 0) + dx };
    placed.add(j.id);
  }
  return placed.size ? { ...plan, characters: out } : plan;
}
