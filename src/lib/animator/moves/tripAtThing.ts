// THE TRIP HAPPENS AT THE REAL CONTACT (Arthur, Oct 15, "a kid trips on a rock": "he goes in front of the rock — he's fine; the NEXT
// step he trips. No, the rock is the cause."). A trip / slip / stumble caused by a thing lying on the ground (a rock, a hose, a step,
// a banana peel, a patch of ice, a toy) starts on the picture the foot actually meets it. The engine finds that picture from the BUILT
// walk / run frames — never from guesses:
//   1. RETIME FIRST: the walk / run before the fall is made longer or shorter until the foot the fall catches lands at the thing
//      (the fall happens where the thing is, so the thing the planner placed stays put);
//   2. what is left over (strides come in steps, so the foot never lands exactly there) is closed by sliding the thing under that foot.
// Broad: every "a travelling body falls because of a thing on the ground" — trip, slip, stumble, step on a peel / puddle / ice.
// (A thing on the ground the body touches on purpose — a button, a puddle splash — is bodyGoesToThing's job: its effect has a cause.)
import { buildScene } from "../engine.ts";
import { makeEffectsTestScene } from "./tests2c.ts";

type Fx = { kind?: string; start?: number; end?: number; anchor?: { x?: number; y?: number; character?: string; joint?: string }; params?: Record<string, unknown>; cause?: unknown };
type Act = { move: string; params?: Record<string, unknown> };
type Ch = { id: string; x?: number; facing?: string; size?: number; actions?: Act[] };

const TRAVEL = /^(walk|run|jog|sneak|dash|sprint|march|skip)$/i;
const FALLS = /^(fallDown|fall|trip|stumble|slip|tumble)$/i;

// The foot the fall catches: the lower (planted) foot on the first picture of the fall, its x, and which way the body goes.
function caughtFoot(plan: Record<string, unknown>, who: string, travelMove: string, n: number) {
  let built: ReturnType<typeof buildScene>, marks: Record<string, number>;
  try { const sc = makeEffectsTestScene(plan as Parameters<typeof makeEffectsTestScene>[0], 1920); built = buildScene(sc, 24); marks = sc.marks ?? {}; } catch { return null; }
  const ci = ((plan.characters as Ch[] | undefined) ?? []).findIndex((c) => c.id === who);
  if (ci < 0) return null;
  const ends = Object.entries(marks).filter(([k, v]) => k.startsWith(`${who}.${travelMove}${n}.`) && Number.isFinite(v)).map(([, v]) => v);
  if (!ends.length) return null;
  const tEnd = Math.max(...ends), i = Math.min(built.frames.length - 1, Math.round(tEnd * built.fps));
  const sk = built.frames[i]?.[ci]?.skeleton, before = built.frames[Math.max(0, i - 6)]?.[ci]?.skeleton;
  if (!sk || !before) return null;
  const foot = sk.lFoot.y >= sk.rFoot.y ? sk.lFoot : sk.rFoot;
  const dir = Math.sign(sk.hip.x - before.hip.x) || 1;
  return { x: foot.x, dir, startX: built.frames[0]?.[ci]?.skeleton.hip.x ?? foot.x };
}

export function tripsAtTheThing(plan: Record<string, unknown>): Record<string, unknown> {
  const chars = (plan.characters as Ch[] | undefined) ?? [];
  const effects = (plan.effects as Fx[] | undefined) ?? [];
  const H = Number(plan.height ?? 300), G = Number(plan.groundY ?? 900);
  // things lying on the ground, placed on the stage (not carried, not caused)
  const onGround = effects.map((e, i) => ({ e, i })).filter(({ e }) => e.kind === "prop" && !e.anchor?.character && typeof e.anchor?.x === "number" && Math.abs(Number(e.anchor?.y ?? G) - G) <= 0.15 * H);
  if (!onGround.length) return plan;
  let cur = plan;
  const used = new Set<number>();
  for (const c of chars) {
    const acts = c.actions ?? [];
    const count = new Map<string, number>();
    for (let ai = 0; ai < acts.length; ai += 1) {
      const a = acts[ai];
      count.set(a.move, (count.get(a.move) ?? 0) + 1);
      const next = acts[ai + 1];
      if (!TRAVEL.test(a.move) || !next || !FALLS.test(next.move)) continue;
      const n = count.get(a.move)!;
      const first = caughtFoot(cur, c.id, a.move, n);
      if (!first) continue;
      // the thing this fall is about: the nearest ground thing to where the foot is, along the way it travels (not behind the start)
      const pick = onGround.filter(({ i }) => !used.has(i)).map(({ e, i }) => ({ e, i, d: Math.abs(Number(e.anchor!.x) - first.x) }))
        .filter(({ e }) => (Number(e.anchor!.x) - first.startX) * first.dir > 0).sort((p, q) => p.d - q.d)[0];
      if (!pick || pick.d > 4 * H) continue;
      used.add(pick.i);
      const thingX = Number(pick.e.anchor!.x);
      // the toe meets it: the thing sits just in front of the caught foot
      const toe = 0.05 * H;
      // 1. RETIME: stretch / shorten the travel so the caught foot lands at the thing (a few looks: strides come in steps)
      // (strides come in whole steps, so a longer run can land the OTHER foot first: every try is measured and the closest kept)
      const missOf = (f: { x: number; dir: number }) => (thingX - toe * f.dir - f.x) * f.dir;
      let foot = first, best = { plan: cur, foot: first, miss: Math.abs(missOf(first)) };
      if (typeof a.params?.distance === "number") {
        for (let pass = 0; pass < 4 && best.miss >= 0.04 * H; pass += 1) {
          const miss = missOf(foot) * (pass < 2 ? 1 : 0.5);
          const base = pass < 2 ? cur : best.plan;
          const shots = (base.characters as Ch[]).map((x) => x.id !== c.id ? x : { ...x, actions: (x.actions ?? []).map((y, k) => k !== ai ? y : { ...y, params: { ...(y.params ?? {}), distance: Math.max(0.3 * H, Math.round(Number(y.params?.distance ?? 0) + miss)) } }) });
          const tried = { ...base, characters: shots };
          const f2 = caughtFoot(tried, c.id, a.move, n);
          if (!f2) break;
          cur = tried; foot = f2;
          if (Math.abs(missOf(f2)) < best.miss) best = { plan: tried, foot: f2, miss: Math.abs(missOf(f2)) };
        }
      }
      cur = best.plan; foot = best.foot;
      // 2. what is left: the thing slides under the foot
      const want = Math.round(foot.x + toe * foot.dir);
      if (Math.abs(want - thingX) >= 1) {
        const fx = [...((cur.effects as Fx[] | undefined) ?? [])];
        fx[pick.i] = { ...fx[pick.i], anchor: { ...fx[pick.i].anchor, x: want } };
        cur = { ...cur, effects: fx };
      }
    }
  }
  return cur;
}
