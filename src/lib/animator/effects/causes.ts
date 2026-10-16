// EVERYTHING HAS A CAUSE (Arthur's review rule 15, Oct 12–14: "campfire from thin air", "smoke from the shrinking flame",
// "an explosion happens when the fireball ARRIVES", "the hole and the dirt pile grow with each shovel dig"). Broad rules the
// engine applies to EVERY scene after the moves are built (the real motion decides, never a guessed time):
// 1. LIT BY SOMETHING: an effect with a `cause` (a figure's joint, e.g. the hand holding the match / torch / wand, or a thing)
//    starts the moment that cause TOUCHES the effect's spot (within reach), keeping its length — and a fire grows up from a
//    small flicker over about a second. A fire / smoke at a fixed spot that starts DURING the scene, with a figure holding a
//    match, lighter or torch, is caused by that hand even when the plan forgot to say so.
// 2. A BURST WHERE A PROJECTILE LANDS starts when it ARRIVES: an explosion / fireBurst / flash / smokeBurst / splash near a
//    fireball's target starts at the fireball's arrival (its end), never before.
// 3. A FLAME THAT GOES OUT SMOKES: a fire that ends while the scene goes on shrinks (its fade) and a thin smoke rises from
//    the top of the flame as it shrinks, sized to the flame (a candle → a thin wisp) — added when the plan has none there;
//    a plan's own smoke there starts as the flame shrinks.
// 4. A HOLE GROWS WITH WORK: a "pit" being dug (params.dugBy = the digger's id, or a figure holding a shovel / spade next to
//    it) starts as a shallow dent and gets deeper and wider at EACH dig (each time the digging hand reaches its lowest point
//    near the pit), with a lumpy dirt pile beside it growing at the same steps (backgrounds.ts pit `steps`).
import { addBuiltHook, type FrameCharacter, type FrameObject, type Scene, type SceneFrames } from "../engine.ts";
import type { Anchor, EffectContext, EffectParams, EffectRecipe, EffectTrack, Point, Shape } from "./types.ts";
import { fromToolHead, heldTip, toolHeads, toolWorkers } from "./index.ts";
import { takeHit } from "./contactConsequence.ts";

type FxScene = Scene & { effects?: EffectTrack[]; background?: { pieces?: { kind: string; params?: Record<string, unknown> }[] } };
type Caused = EffectTrack & { cause?: Anchor };

function where(a: Anchor, chars: readonly FrameCharacter[], objs: readonly FrameObject[]): Point | undefined {
  if ("object" in a) { const o = objs.find((f) => f.id === a.object); return o ? { x: o.x + (a.dx ?? 0), y: o.y + (a.dy ?? 0) } : undefined; }
  if (!("character" in a)) return a;
  const c = chars.find((f) => f.id === a.character);
  if (!c) return undefined;
  const p = c.skeleton[a.joint], q = a.with ? c.skeleton[a.with] : p; // (held in both hands: between them)
  return { x: (p.x + q.x) / 2 + (a.dx ?? 0), y: (p.y + q.y) / 2 + (a.dy ?? 0) };
}
const LIGHTER = /\b(match(es|stick)?|lighter|torch|flint|candle lighter|fire ?starter)\b/i;
const GROWS = new Set(["fire", "wildfire", "smoke"]);
const BURSTS = new Set(["explosion", "fireBurst", "flash", "smokeBurst", "splash", "laserHit", "clashSpark", "dullHit"]);
const PROJECTILES = new Set(["fireball", "iceShards"]); // (they fly over the whole effect: they arrive at its end)
const DIGGER = /\b(shovel|spade|trowel|pickaxe|hoe)\b/i;

// The time (s) the cause first reaches the effect's spot (within `reach` px), searching from `from`; never → closest approach.
export function touchTime(built: SceneFrames, cause: Anchor, spot: Anchor, reach: number, from = 0): number | undefined {
  let best: { t: number; d: number } | undefined;
  for (let i = Math.max(0, Math.floor(from * built.fps)); i < built.frames.length; i += 1) {
    const a = where(cause, built.frames[i], built.objects[i] ?? []), b = where(spot, built.frames[i], built.objects[i] ?? []);
    if (!a || !b) continue;
    const d = Math.hypot(a.x - b.x, a.y - b.y), t = i / built.fps;
    if (d <= reach) return t;
    if (!best || d < best.d) best = { t, d };
  }
  return best?.t;
}

export const CONTACT = 0.03; // (x height: a fist / foot this close to a thing's drawn box is ON it)
export const TIP_ON = 0.04; // (x height: a struck tip this close to the spot is on it)
export const CHAIN_GAP = 0.08; // (s: the spark first, then the flame catches — within the causeShown law's 0.15 s)
// A HOLDER ABSORBS A HIT: the holding arms (elbows, hands) give back `push` px away from the hit, easing out and back over 0.3 s.
export function absorb(built: SceneFrames, who: string, t: number, push: number) {
  const i0 = Math.round(t * built.fps), n = Math.max(2, Math.round(0.3 * built.fps));
  const c0 = built.frames[i0]?.find((c) => c.id === who);
  if (!c0) return;
  const back = c0.facing === "left" ? 1 : -1;
  for (let k = 0; k <= n; k += 1) {
    const row = built.frames[i0 + k], ci = row?.findIndex((c) => c.id === who) ?? -1;
    if (!row || ci < 0) break;
    const f = row[ci], u = k / n, w = Math.sin(Math.PI * Math.min(1, u * 1.6)) * (1 - u) ** 0.5; // (quick give, slow return)
    const sk = { ...f.skeleton };
    for (const j of ["lElbow", "rElbow", "lHand", "rHand"] as const) sk[j] = { ...sk[j], x: sk[j].x + back * push * w * (j.endsWith("Hand") ? 1 : 0.6) };
    row[ci] = { ...f, skeleton: sk };
  }
}

// The dig moments: each time the hand comes down to a low point (a dip of ≥ 0.06 H after rising) close to the pit.
export function digTimes(built: SceneFrames, who: string, joint: "rHand" | "lHand", pitX: number, pitW: number, H: number): number[] {
  const ys: (number | undefined)[] = built.frames.map((f) => { const c = f.find((x) => x.id === who); return c && Math.abs(c.skeleton[joint].x - pitX) < pitW / 2 + 0.6 * H ? c.skeleton[joint].y : undefined; });
  const out: number[] = [];
  let top = Infinity, armed = false;
  for (let i = 1; i < ys.length - 1; i += 1) {
    const y = ys[i];
    if (y === undefined) { armed = false; top = Infinity; continue; }
    top = Math.min(top, y);
    if (y - top >= 0.06 * H) armed = true;
    const prev = ys[i - 1] ?? y, next = ys[i + 1] ?? y;
    if (armed && y >= prev && y > next) { out.push(i / built.fps); armed = false; top = y; }
  }
  return out;
}

addBuiltHook((scene0, built) => {
  const scene = scene0 as FxScene;
  if ((built as { camera?: unknown }).camera || (!scene.effects?.length && !scene.background?.pieces?.length)) return built;
  const H = scene.characters[0]?.height ?? 300, end = scene.durationSec;
  let effects = [...(scene.effects ?? [])] as Caused[];
  // (who holds a match / torch / lighter, and who holds a shovel: a prop on that figure's hand)
  const heldBy = (re: RegExp) => effects.filter((e) => e.kind === "prop" && "character" in e.anchor && /Hand$/.test(String((e.anchor as { joint?: string }).joint)) && re.test(String(e.params?.name ?? e.params?.symbol ?? ""))).map((e) => e.anchor as { character: string; joint: "rHand" | "lHand" });
  const lighters = heldBy(LIGHTER);
  const planned = effects.map((e) => e.start); // (the plan's own times: a strike is looked for near them)
  // 1. LIT BY SOMETHING
  const slides: { from: number; dx: number }[] = [];
  effects = effects.map((e) => {
    let cause = e.cause;
    if (!cause && GROWS.has(e.kind) && "x" in e.anchor && e.start > 0.3 && lighters.length) cause = lighters[0];
    if (!cause) return e;
    const reach = Number(e.params?.reach ?? 0.3 * H);
    const t = touchTime(built, cause, e.anchor, reach, 0);
    if (t === undefined) return e;
    // (THE BODY GOES TO THE THING, never the thing to the hand — Arthur, Oct 14: the fire used to slide under a match that
    // fell short; now claudeAnimator bodyGoesToThing places the figure and its hand on the spot before the build)
    if (Math.abs(t - e.start) < 1 / built.fps) return e;
    const length = e.end - e.start, grows = GROWS.has(e.kind);
    return { ...e, start: t, end: Math.max(t + 0.5, e.end >= end - 0.05 ? e.end : t + length), params: { ...e.params, ...(grows && e.params?.grow === undefined ? { grow: 1.2 } : {}) } };
  });
  if (slides.length) effects = effects.map((e) => { const a = e.anchor as Point; const s0 = e.kind === "prop" && "x" in e.anchor ? slides.find((q) => Math.abs(q.from - a.x) < 0.25 * H) : undefined; return s0 ? { ...e, anchor: { ...a, x: a.x + s0.dx } } : e; });
  // 1c. CAUSE CHAINS (Arthur, Oct 14: "he's supposed to hit, and then it turns on — like when you hit swords and it creates a
  // spark"; "I was expecting him to lift up his hand and hit it"): prepare → act → CONTACT → small effect → big effect.
  // A fire lit by a match / lighter / flint / sparkler / fuse in a hand: a small SPARK bursts at the contact the moment the
  // struck tip touches the spot, and the flame catches just after it (CHAIN_GAP) and grows (rule 1's grow).
  effects = effects.flatMap((e, k) => {
    if (!GROWS.has(e.kind) || e.kind === "smoke" || !e.cause || !("character" in e.cause) || !("x" in e.anchor)) return [e];
    const c = e.cause as { character: string; joint: string };
    if (!lighters.some((l) => l.character === c.character && l.joint === c.joint)) return [e];
    const had = effects.find((o) => o.kind === "sparks" && (o as { chainOf?: unknown }).chainOf && Math.hypot((o.anchor as Point).x - (e.anchor as Point).x, (o.anchor as Point).y - (e.anchor as Point).y) < 1);
    if (had) return [{ ...e, start: had.start + CHAIN_GAP }]; // (built again: the chain stays)
    if (e.start <= 0) return [e];
    // (the REAL contact: the struck tip's closest approach in the second after it first comes within reach — never the
    // moment it is merely near)
    // (…near the plan's own time: a hand only passing by on its way up is not the strike)
    const from = Math.max(e.start, (planned[k] ?? e.start) - 0.3), to = Math.max(e.start, planned[k] ?? e.start) + 1.2;
    let t = from, dmin = Infinity;
    for (let i = Math.round(from * built.fps); i <= Math.min(built.frames.length - 1, Math.round(to * built.fps)); i += 1) {
      const a = heldTip(effects, c.character, c.joint, built.frames[i], H, scene.groundY, 1920, i / built.fps) ?? where(e.cause, built.frames[i], built.objects[i] ?? []), b = e.anchor as Point;
      if (!a) continue;
      // (the FIRST picture the tip is ON it — or passes it between two pictures — is the contact; never a later pass-by)
      const w = i > 0 ? heldTip(effects, c.character, c.joint, built.frames[i - 1], H, scene.groundY, 1920, (i - 1) / built.fps) : undefined;
      const crossed = !!w && Math.abs(a.x - b.x) <= TIP_ON * H && Math.sign(w.y - b.y) !== Math.sign(a.y - b.y);
      const d = crossed ? 0 : Math.hypot(a.x - b.x, a.y - b.y);
      if (d <= TIP_ON * H) { t = i / built.fps; dmin = d; break; }
      if (d < dmin - 0.5) { dmin = d; t = i / built.fps; }
    }
    // (the spark is sized to the flame it lights: a candle's is a tiny flick, a campfire's a small burst)
    const spark = { kind: "sparks", start: t, end: t + 0.35, anchor: e.anchor, params: { burst: true, spread: 120, intensity: 0.8, size: +Math.min(0.6, Math.max(0.2, 1.6 * Number(e.params?.size ?? 0.35))).toFixed(2), color: "#ffd27a", seed: 3 }, layer: "front", chainOf: true } as Caused;
    return [spark, { ...e, start: t + CHAIN_GAP, end: Math.max(e.end, t + CHAIN_GAP + 0.5) }];
  });
  // A THING BREAKS AT THE CONTACT (thingBreak): it breaks the very picture a strike (another figure's fist / foot / edge of the
  // hand) is closest to it (within 1.5 s of the planned time) — never before the hit, never after — at the spot where the thing
  // IS then (a board held out moves with the holder's hands); the whole thing (a prop of that name) ends that same moment. A
  // holder ABSORBS the hit: the holding arms give back a little and come back (a small recoil, 0.3 s).
  for (const b of effects.filter((e) => e.kind === "thingBreak" && !(e as { atContact?: boolean }).atContact)) {
    const name = String(b.params?.name ?? "");
    const whole = effects.find((e) => e.kind === "prop" && name && String(e.params?.name ?? "") === name && Math.abs(e.end - b.start) < 1.6);
    const thing: Anchor = whole?.anchor ?? b.anchor, holder = "character" in thing ? thing.character : undefined;
    let best: { i: number; d: number; at: Point; from: number; who: string; j: "rHand" | "lHand" | "rFoot" | "lFoot" } | undefined;
    const parts = ((whole?.params?.parts as { x?: number; y?: number; w?: number; h?: number }[] | undefined) ?? []), sz = Number(whole?.params?.size ?? b.params?.size ?? 0.2) * H;
    const box = parts.length ? { w: Math.max(...parts.map((q) => Math.abs(Number(q.x ?? 0)) + Math.abs(Number(q.w ?? 0.3)) / 2)) * sz, h: Math.max(...parts.map((q) => Math.abs(Number(q.y ?? 0)) + Math.abs(Number(q.h ?? 0.3)) / 2)) * sz } : { w: 0.1 * sz, h: 0.1 * sz };
    for (let i = Math.max(0, Math.floor((b.start - 1.5) * built.fps)); i <= Math.min(built.frames.length - 1, Math.ceil((b.start + 1.5) * built.fps)); i += 1) {
      const at = where(thing, built.frames[i], built.objects[i] ?? []);
      if (!at) continue;
      for (const c of built.frames[i]) {
        if (c.id === holder) continue;
        // (ON IT = inside the thing's drawn box, plus a fist's width: a tall upright board is hit anywhere on its face)
        // (a fast fist can pass the thing BETWEEN two pictures: crossing its line, at its height, is a contact too)
        const was = built.frames[i - 1]?.find((q) => q.id === c.id), atWas = i > 0 ? where(thing, built.frames[i - 1], built.objects[i - 1] ?? []) : undefined;
        for (const j of ["rHand", "lHand", "rFoot", "lFoot"] as const) {
          const ox = Math.max(0, Math.abs(c.skeleton[j].x - at.x) - box.w), oy = Math.max(0, Math.abs(c.skeleton[j].y - at.y) - box.h);
          const crossed = !!was && !!atWas && oy <= CONTACT * H && Math.sign(was.skeleton[j].x - atWas.x) !== Math.sign(c.skeleton[j].x - at.x) && Math.abs(was.skeleton[j].x - atWas.x) < 0.5 * H;
          const d = crossed ? 0 : Math.hypot(ox, oy);
          if (!best || (best.d > CONTACT * H && d < best.d - 0.5)) best = { i, d, at, from: c.skeleton.hip.x, who: c.id, j };
        }
      }
      if (best && best.d <= CONTACT * H) break; // (the FIRST picture the fist / foot reaches it — then it goes on THROUGH the broken thing)
    }
    if (!best || best.d > 0.35 * H) continue;
    const t = best.i / built.fps, len = b.end - b.start;
    // (an UPRIGHT board snaps top / bottom and flies the way the strike went; the whole board is gone the picture it breaks)
    const upright = whole?.params?.upright === true ? { upright: true, away: Math.sign(best.at.x - best.from) || 1 } : {};
    effects = effects.map((e) => e === b ? { ...e, start: t, end: t + len, anchor: { x: Math.round(best!.at.x), y: Math.round(best!.at.y) }, params: { ...e.params, ...upright }, atContact: true } as Caused : e === whole ? { ...e, end: t - 0.5 / built.fps } : e);
    // (THE ENERGY TRANSFERS — Arthur, Oct 15: "the holder's arms bend a little from the impact, just like if he got punched": the
    // strike's speed at the contact is its power; the holder takes it like a hit — contactConsequence.ts takeHit)
    if (holder) {
      const p = built.frames[best.i]?.find((c) => c.id === best!.who)?.skeleton[best.j], q = built.frames[Math.max(0, best.i - 2)]?.find((c) => c.id === best!.who)?.skeleton[best.j];
      const speed = p && q ? Math.hypot(p.x - q.x, p.y - q.y) / (Math.min(2, best.i) / built.fps || 1) / H : 4;
      takeHit(built, holder, t, Math.max(0.5, speed / 6), Math.sign(best.at.x - best.from) || 1);
    }
  }
  // 1b. PUT OUT BY SOMETHING (a blow, water, a stamp): a fire that goes out during the scene goes out when what puts it out
  // comes CLOSEST to it — `outBy` (an anchor), or else the head of whoever leans in nearest to it (within 0.8 H) around the
  // planned end (± 2.5 s): it starts shrinking right as the blow lands, never before.
  effects = effects.map((e) => {
    if (e.kind !== "fire" || e.end >= end - 0.5) return e;
    const own = (e as { outBy?: Anchor }).outBy;
    if (!own && !("x" in e.anchor)) return e; // (a held torch is not blown out by its own holder's head)
    const tries: Anchor[] = own ? [own] : scene.characters.map((c) => ({ character: c.id, joint: "head" as const }));
    let best: { t: number; d: number } | undefined;
    for (const by of tries) for (let i = Math.max(0, Math.ceil((Math.max(e.start, e.end - 2.5)) * built.fps)); i <= Math.min(built.frames.length - 1, Math.floor((e.end + 2.5) * built.fps)); i += 1) {
      const p = where(by, built.frames[i], built.objects[i] ?? []), q = where(e.anchor, built.frames[i], built.objects[i] ?? []);
      if (!p || !q) continue;
      const d = Math.hypot(p.x - q.x, p.y - q.y);
      if (!best || d < best.d - 1) best = { t: i / built.fps, d };
    }
    if (!best || (!own && best.d > 0.8 * H)) return e;
    const fade = Math.min(0.8, (e.end - e.start) * 0.3);
    return Math.abs(best.t + fade - e.end) < 0.2 ? e : { ...e, end: best.t + fade }; // (built again: stays put)
  });
  // 2. A BURST WHERE A PROJECTILE LANDS
  for (const p of effects.filter((e) => PROJECTILES.has(e.kind) && e.target)) {
    const i = Math.min(built.frames.length - 1, Math.round(p.end * built.fps)), aim = where(p.target!, built.frames[i], built.objects[i] ?? []);
    if (!aim) continue;
    effects = effects.map((e) => {
      if (!BURSTS.has(e.kind) || e.cause || Math.abs(e.start - p.end) < 1 / built.fps) return e;
      const at = where(e.anchor, built.frames[i], built.objects[i] ?? []);
      return at && Math.hypot(at.x - aim.x, at.y - aim.y) <= 0.6 * H ? { ...e, start: p.end, end: p.end + (e.end - e.start) } : e;
    });
  }
  // 2b. THINGS COME FROM THEIR SOURCE (Arthur, Oct 14: "when the campfire lights, the smoke needs to be forming from the fire, not
  // from thin air"): smoke / steam / sparks at a fixed spot over a fire (within 0.5 H sideways, from its base up to 1.5 flame
  // heights above it) comes out of THAT flame: it starts at the flame's upper middle (inside it, drawn just behind it, so it
  // rises out of the flame's tip) and never before the flame has grown in (0.6 s after it is lit).
  for (const f of effects.filter((e) => e.kind === "fire" && "x" in e.anchor)) {
    const fa = f.anchor as Point, fh = Number(f.params?.size ?? 0.35) * H;
    effects = effects.flatMap((e) => {
      if (e === f || (e as { chainOf?: unknown }).chainOf || !/^(smoke|steam|sparks)$/.test(e.kind) || !("x" in e.anchor) || "character" in e.anchor || "object" in e.anchor) return [e];
      const a = e.anchor as Point;
      if (Math.abs(a.x - fa.x) > 0.5 * H || a.y > fa.y + 5 || a.y < fa.y - 1.5 * fh) return [e];
      const start = Math.max(e.start, f.start + 0.6);
      return [{ ...e, start, end: Math.max(e.end, start + 0.5), anchor: { x: fa.x, y: fa.y - 0.55 * fh }, layer: f.layer ?? e.layer, sourceFire: true } as Caused];
    });
    // (drawn just behind its flame: emitted things before the fire in the list)
    const from = effects.filter((e) => (e as { sourceFire?: boolean }).sourceFire && Math.abs((e.anchor as Point).x - fa.x) < 1);
    if (from.length) { effects = effects.filter((e) => !from.includes(e)); effects.splice(effects.indexOf(f), 0, ...from); }
  }
  // 3. A FLAME THAT GOES OUT SMOKES
  for (const f of effects.filter((e) => e.kind === "fire" && e.end < end - 0.5)) {
    const size = Number(f.params?.size ?? 0.35), fade = Math.min(0.8, (f.end - f.start) * 0.3), from = f.end - fade;
    const top = "x" in f.anchor ? { x: f.anchor.x, y: f.anchor.y - size * H * 0.8 } : { ...f.anchor, dy: ((f.anchor as { dy?: number }).dy ?? 0) - size * H * 0.8 };
    const near = (e: Caused) => e.kind === "smoke" && "x" in e.anchor && "x" in f.anchor && Math.hypot(e.anchor.x - f.anchor.x, (e.anchor as Point).y - (f.anchor as Point).y) < 0.5 * H;
    const own = effects.find(near);
    if (own) { if (Math.abs(own.start - from) > 0.4) effects = effects.map((e) => e === own ? { ...e, start: from, end: Math.max(e.end, from + 1.5) } : e); continue; }
    effects.push({ kind: "smoke", start: from, end: Math.min(end, from + 3), anchor: top as Anchor, params: { size: Math.max(0.025, size * 0.25), intensity: 0.6, wind: 0.1, seed: 5 }, layer: f.layer ?? "front" });
  }
  scene.effects = effects;
  // 4. A HOLE GROWS WITH WORK
  const shovels = heldBy(DIGGER);
  const pieces = scene.background?.pieces, clumps: Caused[] = [], heads = toolHeads(effects, H);
  if (pieces?.some((q) => q.kind === "pit")) {
    scene.background = { ...scene.background, pieces: pieces.map((q) => {
      if (q.kind !== "pit" || Array.isArray(q.params?.steps)) return q;
      const x = Number(q.params?.x ?? 960), w = Number(q.params?.w ?? 0.9 * H);
      const named = typeof q.params?.dugBy === "string" ? String(q.params.dugBy) : undefined;
      const tool = shovels.find((s) => !named || s.character === named);
      const who = named ?? (tool && built.frames[0]?.some((c) => c.id === tool.character && Math.abs(c.skeleton.hip.x - x) < w / 2 + 1.5 * H) ? tool.character : undefined);
      if (!who) return q;
      const steps = digTimes(built, who, tool?.joint ?? "rHand", x, w, H);
      if (!steps.length) return q;
      const hip = built.frames[0]?.find((c) => c.id === who)?.skeleton.hip.x ?? x, side = hip < x ? 1 : -1;
      // (THE HOLE IS WHERE THE SHOVEL GOES IN: its middle just past the digging hand at the dig moments, away from the digger)
      const hands = steps.map((t) => built.frames[Math.round(t * built.fps)]?.find((c) => c.id === who)?.skeleton[tool?.joint ?? "rHand"].x).filter((v): v is number => v !== undefined);
      // (…but never under the digger's own feet: its near edge stays just past the front foot)
      const feet = built.frames.flatMap((f) => { const c = f.find((d) => d.id === who); return c ? [c.skeleton.lFoot.x, c.skeleton.rFoot.x] : []; });
      const front = side > 0 ? Math.max(...feet) : Math.min(...feet), least = front + side * (w / 2 + 0.04 * H);
      const want = hands.length ? hands.reduce((a, v) => a + v, 0) / hands.length + side * 0.2 * w : x;
      const at = side > 0 ? Math.max(want, least) : Math.min(want, least);
      // (TOOLS DO REAL WORK CYCLES: after each stab the scoop is TOSSED — the digging hand's highest moment before the next stab —
      // a dirt clump rides the blade from the stab to the toss, then flies onto the pile, which grows when it lands)
      const joint = tool?.joint ?? "rHand", tosses: number[] = [];
      steps.forEach((t0, k) => {
        const t1 = steps[k + 1] ?? end;
        let best: { t: number; y: number } | undefined;
        for (let i = Math.ceil(t0 * built.fps) + 1; i < Math.min(built.frames.length, Math.floor(t1 * built.fps)); i += 1) {
          const y = built.frames[i].find((c) => c.id === who)?.skeleton[joint].y;
          if (y !== undefined && (!best || y < best.y)) best = { t: i / built.fps, y };
        }
        if (!best || best.t - t0 < 0.2) return;
        const pile = { x: Math.round(at) + side * (w / 2 + 0.28 * w), y: Number(q.params?.y ?? scene.groundY) - 0.08 * w };
        const size = 0.05 * (0.8 + 0.4 * ((k * 7) % 5) / 4), ride: Caused = { kind: "dirtClump", start: t0 + 0.1, end: best.t, anchor: { character: who, joint }, params: { size, seed: k + 3 }, layer: "front" };
        const fi = Math.min(built.frames.length - 1, Math.round(best.t * built.fps)), from = fromToolHead(ride, built.frames[fi], heads, toolWorkers(scene));
        clumps.push(ride);
        if (from) clumps.push({ kind: "dirtClump", start: best.t, end: best.t + 0.4, anchor: from, params: { size, seed: k + 3, to: pile, fly: 0.4 }, layer: "front" });
        tosses.push(best.t + 0.4);
      });
      return { ...q, params: { ...q.params, x: Math.round(at), steps, pileSide: side, ...(tosses.length === steps.length ? { pileSteps: tosses } : {}) } };
    }) };
    if (clumps.length) scene.effects = [...(scene.effects ?? []), ...clumps];
  }
  return built;
});

// A DIRT CLUMP (TOOLS DO REAL WORK CYCLES): a lumpy clod of dirt riding on the shovel's blade (anchored on the digging hand: it
// sits on the tool's head — index.ts fromToolHead), or — with `to` and `fly` (s) — flying in a short arc from where it left the
// blade onto the pile, breaking up into crumbs as it lands. size x height (0.05).
function dirtClump(ctx: EffectContext, p: EffectParams): Shape[] {
  const r = Number(p.size ?? 0.05) * ctx.height, seed = Number(p.seed ?? 1), dirt = String(p.color ?? "#6b4a2f");
  let x = ctx.at.x, y = ctx.at.y - 0.5 * r, k = 0;
  const to = p.to as Point | undefined, fly = Number(p.fly ?? 0);
  if (to && fly > 0) {
    const u = Math.min(1, ctx.t / fly);
    x = ctx.at.x + (to.x - ctx.at.x) * u; y = ctx.at.y + (to.y - ctx.at.y) * u - 0.35 * ctx.height * 0.25 * 4 * u * (1 - u);
    k = Math.max(0, (u - 0.85) / 0.15);
  }
  const pts: number[] = [];
  for (let j = 0; j < 9; j += 1) { const a = (j / 9) * Math.PI * 2, rr = r * (0.75 + 0.4 * Math.abs(Math.sin(seed * 3.1 + j * 1.7))); pts.push(x + Math.cos(a) * rr * (1 + 0.6 * k), y + Math.sin(a) * rr * 0.7 * (1 - 0.5 * k)); }
  return [{ kind: "poly", points: pts, fill: dirt }, { kind: "circle", x: x - 0.3 * r, y: y - 0.25 * r, r: 0.25 * r, fill: "#8a6a4a" }];
}
export const RECIPES: EffectRecipe[] = [{ id: "dirtClump", about: "dirt clod on a shovel blade (engine-added when digging a pit).", draw: dirtClump }];
