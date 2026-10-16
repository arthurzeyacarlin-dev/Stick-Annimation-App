// THE BODY GOES TO THE THING IT TOUCHES — read from the WORDS (Oct 15 deep audit). bodyGoesToThing (claudeAnimator.ts) places a
// figure within reach of a spot only when an effect has a `cause` hand. A custom move that SAYS it touches a thing ("puts her
// hand down on the stove", "leans on the railing", "knocks on the door") had no cause, so the figure stopped where the walk
// ended and the hand stopped in the air. Rule: every touch the engine reads (moves/declareContacts.ts readTouches) on a drawn
// thing becomes a virtual touch for bodyGoesToThing: its spot is the thing's DRAWN surface from the World (world.ts) — the top,
// a hand's width in from the figure's side, or the nearest surface — at the key's moment. Same family as `cause`: the figure
// walks the same steps and ends at the thing; the hand gets a target on the spot; contacts.ts then solves it exactly.
import { readTouches } from "../moves/declareContacts.ts";
import { propTargetPoint, worldAt } from "../world.ts";
import { buildScene, type Scene, type SceneFrames } from "../engine.ts";

export type VirtualTouch = { kind: "touch"; start: number; anchor: { x: number; y: number }; cause: { character: string; joint: string }; params: Record<string, unknown> };
const INSET = 0.06; // x height: a hand put ON a thing lands this far in from the thing's near edge (on it, not on its corner)

export function intentTouches(plan: Record<string, unknown>, build: (plan: Record<string, unknown>) => { scene: Scene & { marks?: Record<string, number> }; built: SceneFrames }): VirtualTouch[] {
  const all = readTouches(plan as Parameters<typeof readTouches>[0]);
  // (A PARTNER TOUCH — a handshake, a high-five, a pat: the figure that walks or runs up to the partner is the one placed within
  // reach of the partner's hand; when both or neither approach, the later-listed one. Never both: they would overshoot.)
  const chars = (plan.characters as { id: string; actions?: { move?: string }[] }[] | undefined) ?? [];
  const approaches = (id: string, n: number) => { const acts = chars.find((c) => c.id === id)?.actions ?? []; let k = 0; for (let i = 0; i < acts.length; i += 1) { if (acts[i].move !== "custom") continue; k += 1; if (k === n) return /^(walk|run|jog|sprint|step|march|creep|sneak|tiptoe)$/.test(String(acts[i - 1]?.move ?? "")); } return false; };
  const touches = all.filter((t) => {
    if ("prop" in t.target) return true;
    if (!("figure" in t.target)) return false;
    const tg = t.target as { figure: string; joint: string };
    const back = all.find((o) => o !== t && o.figure === tg.figure && "figure" in o.target && (o.target as { figure: string }).figure === t.figure);
    if (!back) return true;
    const mine = approaches(t.figure, t.n), theirs = approaches(back.figure, back.n);
    if (mine !== theirs) return mine;
    return chars.findIndex((c) => c.id === t.figure) > chars.findIndex((c) => c.id === back.figure);
  });
  if (!touches.length) return [];
  let made: ReturnType<typeof build>;
  try { made = build(plan); } catch { return []; }
  const { scene, built } = made, marks = scene.marks ?? {}, H = Number(plan.height ?? 300);
  const out: VirtualTouch[] = [];
  for (const tm of touches) {
    const first = tm.keys[0];
    const t = marks[`${tm.figure}.custom${tm.n}.k${first.j + 1}`];
    if (t === undefined) continue;
    const i = Math.min(built.frames.length - 1, Math.max(0, Math.round(t * built.fps)));
    const fig = built.frames[i]?.find((c) => c.id === tm.figure);
    if (!fig) continue;
    if ("figure" in tm.target) {
      // (the partner's joint at the touch moment — where their hand is held out; bodyGoesToThing places us a reach from it)
      const tg = tm.target as { figure: string; joint: keyof typeof fig.skeleton };
      const them = built.frames[i]?.find((c) => c.id === tg.figure);
      const at = them?.skeleton[tg.joint];
      if (at) out.push({ kind: "touch", start: t, anchor: { x: at.x, y: at.y }, cause: { character: tm.figure, joint: tm.joint }, params: { name: tg.figure } });
      continue;
    }
    const tg = tm.target as { prop: number; point?: "top" | "near" };
    const thing = worldAt(scene, built, i).thing(tg.prop);
    if (!thing) continue;
    let spot: { x: number; y: number };
    const part = (tg.point as string) === "part" ? propTargetPoint(scene, built.frames, built.fps, i, tg, fig.skeleton[tm.joint], H) : null;
    if (part) spot = part; // (the part on top — the pan on the stove: the walk ends within reach of IT, the same spot the hand goes to)
    else if (tg.point === "top") {
      const fromLeft = fig.skeleton.hip.x <= (thing.box.left + thing.box.right) / 2;
      const x = fromLeft ? Math.min(thing.box.right, thing.box.left + INSET * H) : Math.max(thing.box.left, thing.box.right - INSET * H);
      spot = { x, y: thing.topAt(x) };
    } else spot = thing.nearestSurfacePoint(fig.skeleton[tm.joint]);
    out.push({ kind: "touch", start: t, anchor: spot, cause: { character: tm.figure, joint: tm.joint }, params: { name: thing.name } });
  }
  return out;
}
export const touchIntentBuilder = (plan: Record<string, unknown>, make: (p: never, w: number) => Scene & { marks?: Record<string, number> }) => { const scene = make(plan as never, 1920); return { scene, built: buildScene({ ...scene, contacts: undefined }, 24) }; }; // (the PLANNED limbs: the contact solver would already have pulled the partner's hand to the meeting spot)

// PARTNERS TOUCH IN TIME (Oct 15 T1, the office handshake: Sam arrived first, played his whole shake into the air and dropped his arm
// while Priya was still pumping, so the solver pulled her hand half-way to Sam's hip — 28 px short). When two figures touch EACH
// OTHER (a handshake, a high-five, a fist bump — readTouches, both sides), the one whose touch key comes EARLIER holds that first key
// (its hand out, waiting) until the other's touch key: from then on both play their touch keys together and let go together.
// Family: every mutual touch where one partner arrives first. (Never more than MAX_WAIT: a longer gap is a different moment.)
const MAX_WAIT = 3;
export function partnersTouchInTime(plan: Record<string, unknown>, build: (plan: Record<string, unknown>) => { scene: Scene & { marks?: Record<string, number> }; built: SceneFrames }): Record<string, unknown> {
  const all = readTouches(plan as Parameters<typeof readTouches>[0]);
  const fig = (t: (typeof all)[number]) => ("figure" in t.target ? (t.target as { figure: string }).figure : null);
  const pairs = all.flatMap((a) => all.filter((b) => a.figure < b.figure && fig(a) === b.figure && fig(b) === a.figure).map((b) => [a, b] as const));
  if (!pairs.length) return plan;
  let marks: Record<string, number>;
  try { marks = build(plan).scene.marks ?? {}; } catch { return plan; }
  const chars = ((plan.characters as { id: string; actions?: { move?: string; params?: Record<string, unknown> }[] }[] | undefined) ?? []).map((c) => ({ ...c, actions: (c.actions ?? []).map((x) => ({ ...x })) }));
  let changed = false;
  for (const [a, b] of pairs) {
    // (THE STRIKES MEET, not the wind-ups — Oct 15 fist bump: the first "touching" key was the wind-up, so the strike keys still landed
    // 0.5 s apart. The strike = the touching key whose arm reaches furthest; the early figure holds the key BEFORE it, then both strike.)
    const keysOf = (t: (typeof all)[number]) => { let k = 0; const act = chars.find((x) => x.id === t.figure)?.actions?.find((x) => x.move === "custom" && (k += 1) === t.n); return ((act?.params?.keys as { pose?: Record<string, unknown> }[] | undefined) ?? []); };
    const strikeOf = (t: (typeof all)[number]) => { const ks = keysOf(t), side = String(t.joint).startsWith("l") ? "l" : "r"; const reach = (j: number) => Math.abs(Number(ks[j]?.pose?.[`${side}Shoulder`] ?? 0)) - 0.3 * Math.abs(Number(ks[j]?.pose?.[`${side}Elbow`] ?? 0)); return t.keys.reduce((best, k) => (reach(k.j) >= reach(best) ? k.j : best), t.keys[0].j); };
    const sa = strikeOf(a), sb = strikeOf(b);
    const ta = marks[`${a.figure}.custom${a.n}.k${sa + 1}`], tb = marks[`${b.figure}.custom${b.n}.k${sb + 1}`];
    if (ta === undefined || tb === undefined || Math.abs(ta - tb) < 1 / 24 || Math.abs(ta - tb) > MAX_WAIT) continue;
    const early = ta < tb ? a : b, wait = Math.abs(ta - tb);
    const c = chars.find((x) => x.id === early.figure);
    let k = 0;
    const act = c?.actions?.find((x) => x.move === "custom" && (k += 1) === early.n);
    const keys = act ? [...((act.params?.keys as Record<string, unknown>[] | undefined) ?? [])] : [];
    const strike = early === a ? sa : sb, j = Math.max(0, strike - 1);
    if (!act || !keys[j]) continue;
    keys[j] = { ...keys[j], hold: +((Number(keys[j].hold ?? 0) || 0) + wait).toFixed(2) };
    act.params = { ...act.params, keys };
    changed = true;
  }
  return changed ? { ...plan, characters: chars } : plan;
}
