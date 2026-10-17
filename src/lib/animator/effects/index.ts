// The effects registry and the per-picture builder (SPEC-0017 Phase 2C).
import { addBuiltHook, type FrameCharacter, type FrameObject, type Scene, type SceneFrames } from "../engine.ts";
import { bodyTouch, objectHalfExtents } from "../objects.ts";
import { cameraEffectFrames, hasCamera } from "../camera.ts";
import { BACKGROUNDS } from "./backgrounds.ts";
import { RECIPES as BUBBLES } from "./bubbles.ts";
import { RECIPES as CLASH } from "./clash.ts";
import { RECIPES as EXPLOSION } from "./explosion.ts";
import { RECIPES as FIRE } from "./fire.ts";
import { RECIPES as HANDCUFFS } from "./handcuffs.ts";
import { RECIPES as ICE } from "./ice.ts";
import { RECIPES as LASER } from "./laser.ts";
import { RECIPES as LIGHT } from "./light.ts";
import { RECIPES as LIGHTNING } from "./lightning.ts";
import { RECIPES as SMOKE } from "./smoke.ts";
import { RECIPES as TEXT } from "./text.ts";
import { STORM } from "./thunderstorm.ts";
import { RECIPES as WATER } from "./water.ts";
import { RECIPES as WEAPONS } from "./weapons.ts";
import { RECIPES as CAUSED } from "./causedThings.ts"; // (A THING THAT SINKS IS GONE, a flag is carried and planted, paint where the brush moves, a cover hides only those behind it)
import { RECIPES as CAUSES } from "./causes.ts"; // (EVERYTHING HAS A CAUSE: lit by a match, bursts when the fireball arrives, smoke as a flame goes out, holes grow with each dig)
import { RECIPES as TRANSFORM } from "../moves/transform.ts";
import { carriedUpright, FLOOR_TOOL, MIN_FLOOR_TOOL } from "../moves/transform.ts";
import { causeList, emitterNeed } from "./emitterCause.ts";
import type { Anchor, BackgroundRecipe, BackgroundSpec, EffectFrame, EffectParams, EffectRecipe, EffectTrack, Point, Shape } from "./types.ts";
import "../world.ts"; // (ONE WORLD: loads last, after every recipe, and registers the contact pass's thing resolver)

export type * from "./types.ts";

export const EFFECTS: Record<string, EffectRecipe> = Object.fromEntries([...FIRE, ...SMOKE, ...WATER, ...LIGHTNING, ...LIGHT, ...ICE, ...LASER, ...HANDCUFFS, ...CLASH, ...EXPLOSION, ...WEAPONS, ...TEXT, ...BUBBLES, ...CAUSED, ...CAUSES, ...TRANSFORM].map((r) => [r.id, r]));
export const BACKGROUND_PIECES: Record<string, BackgroundRecipe> = Object.fromEntries([...BACKGROUNDS, ...STORM].map((r) => [r.id, r]));

// A scene with effects and a background (both optional; a plain scene draws none).
// (`effectHeight`: the figure size the effects are measured by when the scene has no figures — an effect put on the
// user's own drawing, moves/fromDrawing.ts; a scene with figures always uses its first figure's height.)
export type EffectScene = Scene & { effects?: EffectTrack[]; background?: BackgroundSpec; stageWidth?: number; effectHeight?: number };

// Where an anchor is in one picture (a joint follows its character; a missing character → the point itself).
// (An anchor on an OBJECT follows it in this picture's `objects`; gone from the picture → no effect there.)
// ONE THING, ONE OWNER (Oct 17 R3b): a prop handed from person to person has an owner timeline ("owners": [{ t, character, joint }])
// — at each moment it is in exactly ONE hand: the latest owner whose time has come (claude/claudeAnimator.ts handOver).
export function ownerAt(track: EffectTrack, t: number): EffectTrack {
  const owners = (track as { owners?: { t: number; character: string; joint: string }[] }).owners;
  if (!Array.isArray(owners) || !owners.length || !("character" in track.anchor)) return track;
  let o = owners[0];
  for (const x of owners) if (t >= x.t - 1e-9) o = x;
  return { ...track, anchor: { ...track.anchor, character: o.character, joint: o.joint } as Anchor };
}

export function anchorAt(anchor: Anchor, characters: readonly FrameCharacter[], objects: readonly FrameObject[] = []): Point | undefined {
  if ("object" in anchor) {
    const o = objects.find((f) => f.id === anchor.object);
    return o ? { x: o.x + (anchor.dx ?? 0), y: o.y + (anchor.dy ?? 0) } : undefined;
  }
  if (!("character" in anchor)) return anchor;
  const c = characters.find((f) => f.id === anchor.character);
  if (!c) return undefined;
  const p0 = c.skeleton[anchor.joint], q = anchor.with ? c.skeleton[anchor.with] : undefined;
  const p = q ? { x: (p0.x + q.x) / 2, y: (p0.y + q.y) / 2 } : p0; // (held in both hands: between them)
  if (anchor.onHead) {
    // (A spot on the face: "up the head" is from the neck to the head's middle; the face is a quarter turn from it.)
    const s = c.skeleton, ux = s.head.x - s.neck.x, uy = s.head.y - s.neck.y, L = Math.hypot(ux, uy) || 1;
    const side = c.facing === "left" ? -1 : c.facing === "right" ? 1 : 0, f = anchor.onHead.forward * c.headRadius, u = anchor.onHead.up * c.headRadius;
    return { x: s.head.x + (-side * uy * f + ux * u) / L + (anchor.dx ?? 0), y: s.head.y + (side * ux * f + uy * u) / L + (anchor.dy ?? 0) };
  }
  return { x: p.x + (anchor.dx ?? 0), y: p.y + (anchor.dy ?? 0) };
}

// HELD TOOLS TILT WITH THE HAND (Oct 14): an anchor on a figure's hand → the unit direction from its elbow to that hand
// (a held shovel, wand, broom or torch points the way the forearm points — moves/transform.ts drawPropBody).
export function forearmOf(anchor: Anchor, characters: readonly FrameCharacter[], twoHands = false): Point | undefined {
  if (!("character" in anchor) || (anchor.joint !== "lHand" && anchor.joint !== "rHand") || anchor.with) return undefined; // (a thing held in both hands keeps its own drawn angle)
  const c = characters.find((f) => f.id === anchor.character);
  if (!c) return undefined;
  const hand = c.skeleton[anchor.joint], elbow = c.skeleton[anchor.joint === "lHand" ? "lElbow" : "rElbow"];
  const dx = hand.x - elbow.x, dy = hand.y - elbow.y, L = Math.hypot(dx, dy);
  if (L <= 1e-6) return undefined;
  // (TWO HANDS ON ONE TOOL — a shovel, an axe, a rake, a broom, a bat: the other hand holds the shaft a little further down the
  // way this forearm points (0.5–2.8 forearms away, within ~55° of it) → the tool runs from this hand THROUGH the other hand)
  const other = c.skeleton[anchor.joint === "lHand" ? "rHand" : "lHand"], ox = other.x - hand.x, oy = other.y - hand.y, D = Math.hypot(ox, oy);
  // (`twoHands`: the figure is doing a tool job — the "work" move — so the other hand IS on the shaft: always through it)
  // (a dig / rake / sweep tool hangs DOWN from the higher hand through the lower one — its head never flips up into the air)
  // (the shaft only runs through the other hand once that hand is clearly LOWER on it — hands side by side (just picking the tool
  // up, arms hanging) leave it along the forearm; in between it turns smoothly from one to the other, so it never jumps)
  if (twoHands && D > 0.15 * L && D < 2.8 * L) {
    // (and only once the hands are apart: hands nearly together → along the forearm; the shaft eases over as they part)
    // (…and eases back out as the hands get too far apart to share the shaft (2.2–2.8 forearms): never a jump at the limit)
    const k = Math.min(1, Math.max(0, (oy / D - 0.1) / 0.4)) * Math.min(1, Math.max(0, (D / L - 0.15) / 0.45)) * Math.min(1, Math.max(0, (2.8 - D / L) / 0.6)), w = k * k * (3 - 2 * k);
    if (w >= 1) return { x: ox / D, y: oy / D };
    // (turned by ANGLE, the short way round — a straight average of two nearly opposite directions flipped the tool, Oct 15 N03)
    if (w > 0) { const a1 = Math.atan2(dy, dx), a2 = Math.atan2(oy, ox); let da = a2 - a1; while (da > Math.PI) da -= 2 * Math.PI; while (da < -Math.PI) da += 2 * Math.PI; if (Math.abs(da) > 0.6 * Math.PI && Math.sin(a1 + da / 2) < 0) da -= 2 * Math.PI * Math.sign(da); /* (nearly opposite: always turn the way through DOWN — a tool head never swings up over the top) */ const a = a1 + w * da; return { x: Math.cos(a), y: Math.sin(a) }; }
    return { x: dx / L, y: dy / L };
  }
  if (D > 0.5 * L && D < 2.8 * L && (ox * dx + oy * dy) / (D * L) > 0.57) return { x: ox / D, y: oy / D };
  return { x: dx / L, y: dy / L };
}

// THINGS COME FROM THEIR SOURCE (Arthur, Oct 14: "bubbles … from the little bubble stick"): an EMITTED effect (bubbles, smoke,
// steam, sparks, spray, dust) anchored on a hand that holds a long tool (a wand, a hose, a torch, a smoking pipe…) comes out of
// the tool's HEAD — the far end along the way the tool points, every picture — not from a fixed offset beside the hand.
const EMITS = new Set(["dirtClump", "bubbles", "smoke", "steam", "sparks", "spray", "dust", "mist", "breath", "water"]);
// (CARRIED UPRIGHT — moves/transform.ts carriedUpright: a torch, a candle, a flag… is drawn pole up whatever the arm does, so its
// head is straight ABOVE the hand — smoke from a carried torch rises from the torch's top, never from where a tilted torch's tip would
// be, in front of the arm; Arthur, Oct 14: "he is holding the torch, but the smoke is in front of him")
export type ToolHeads = Map<string, number> & { upright?: Set<string> };
export function toolHeads(effects: readonly EffectTrack[], height: number): ToolHeads {
  const out: ToolHeads = new Map<string, number>();
  out.upright = new Set();
  for (const e of effects) {
    const a = e.anchor as { character?: string; joint?: string };
    if (e.kind !== "prop" || !a.character || !/Hand$/.test(String(a.joint)) || e.params?.tilts === false || e.params?.hangs === true) continue;
    const parts = (Array.isArray(e.params?.parts) ? e.params!.parts : []) as { x?: number; y?: number; w?: number; h?: number; shape?: string }[];
    const ys = parts.flatMap((q) => { const y = Number(q.y ?? 0), h = Number(q.h ?? 0.3); return q.shape === "line" ? [y, y + h] : [y - Math.abs(q.shape === "circle" ? Number(q.w ?? 0.3) : h) / 2, y + Math.abs(q.shape === "circle" ? Number(q.w ?? 0.3) : h) / 2]; });
    const span = ys.length ? Math.max(...ys) - Math.min(...ys) : 1;
    if (span < 0.5) continue; // (a short thing — a ball, a cup — is not a tool with a head)
    // (a long floor tool is drawn at least real size — moves/transform.ts MIN_FLOOR_TOOL — so its head is that far out)
    const floor = FLOOR_TOOL.test(`${e.params?.name ?? ""} ${e.params?.symbol ?? ""}`) ? MIN_FLOOR_TOOL / span : 0;
    if (floor) {
      // (A FLOOR TOOL'S HEAD is where it is DRAWN — moves/transform.ts heldTool: gripped 12% in from the handle end, the head = the
      // area-weighted middle of its parts — so a dirt clump rides ON the shovel's blade, not on its shaft or in the air below it)
      const box = parts.map((q) => { const y = Number(q.y ?? 0), h = Number(q.h ?? 0.3), w = Number(q.w ?? 0.3); return q.shape === "line" ? { cy: y + h / 2, area: 0.03 * Math.hypot(w, h) } : { cy: y, area: Math.abs(w * (q.shape === "circle" ? w : h)) }; });
      const top = Math.min(...ys), bottom = Math.max(...ys), area = box.reduce((s2, b) => s2 + b.area, 0) || 1, heavy = box.reduce((s2, b) => s2 + b.area * b.cy, 0) / area;
      const grip = heavy >= (top + bottom) / 2 ? top + 0.12 * span : bottom - 0.12 * span;
      out.set(`${a.character}:${a.joint}`, Math.abs(heavy - grip) * Math.max(Number(e.params?.size ?? 0.5), floor) * height);
    } else out.set(`${a.character}:${a.joint}`, 0.72 * span * Number(e.params?.size ?? 0.5) * height); // (grip → the middle of the head)
    if (carriedUpright(e.params ?? {})) out.upright!.add(`${a.character}:${a.joint}`);
  }
  return out;
}
// (who is doing a tool job — a "work" move — with both hands on the tool)
// TWO-HAND TOOLS (Arthur, Oct 15: "now they must master TOOLS"): a long tool worked with both hands — a broom, a rake, a shovel,
// a spade, a mop, a hoe, a pitchfork, an axe, a sledgehammer, a paint roller on a pole — is held with BOTH hands whatever move
// works it (a "work" move or the AI's own custom key poses): drawn from the top hand THROUGH the lower hand, never along one
// forearm waving in the sky.
export const TWO_HAND_TOOL = /\b(broom|rakes?|shovel|spade|mop|hoe|pitchfork|axe|sledge ?hammer|(paint )?roller|scythe|oar|paddle)\b/i;
const twoHandTool = (e: EffectTrack) => e.kind === "prop" && TWO_HAND_TOOL.test(`${e.params?.name ?? ""} ${e.params?.symbol ?? ""}`);
export function toolWorkers(scene: Scene): Set<string> {
  // (the built scene has no actions any more: a "work" move leaves marks named "<id>.work<n>.k<m>")
  const out = new Set(Object.keys((scene as { marks?: Record<string, number> }).marks ?? {}).flatMap((k) => { const m = /^(.+)\.work\d+\./.exec(k); return m ? [m[1]] : []; }));
  for (const e of (scene as { effects?: readonly EffectTrack[] }).effects ?? []) {
    const a = e.anchor as { character?: string; joint?: string; with?: string };
    if (e.kind === "prop" && a.character && /Hand$/.test(String(a.joint)) && !a.with && TWO_HAND_TOOL.test(`${e.params?.name ?? ""} ${e.params?.symbol ?? ""}`)) out.add(a.character);
  }
  return out;
}
export function fromToolHead(track: EffectTrack, characters: readonly FrameCharacter[], heads: Map<string, number>, workers: Set<string> = new Set()): Point | undefined {
  const a = track.anchor as { character?: string; joint?: "lHand" | "rHand" };
  if (!EMITS.has(track.kind) || !a.character || !a.joint || track.params?.fromHand === true) return undefined;
  const key = `${a.character}:${a.joint}`, len = heads.get(key), f = len ? ((heads as ToolHeads).upright?.has(key) ? { x: 0, y: -1 } : forearmOf(track.anchor, characters, workers.has(a.character))) : undefined;
  const c = characters.find((q) => q.id === a.character);
  if (!len || !f || !c) return undefined;
  const hand = c.skeleton[a.joint];
  return { x: hand.x + f.x * len, y: hand.y + f.y * len };
}

// THE TOOL'S TIP TOUCHES, NOT THE HAND (cause chains, Oct 14: the match stopped above the logs while its hand was "close
// enough"): where a thing held in a hand REACHES — the drawn point of the prop farthest from the hand, as it is drawn in that
// picture (tilted with the forearm, upright, whatever the prop rules do). No prop in that hand → the hand itself.
export function heldTip(tracks: readonly EffectTrack[], who: string, joint: string, characters: readonly FrameCharacter[], height: number, groundY: number, stageWidth = 1920, t = 0): Point | undefined {
  const c = characters.find((f) => f.id === who);
  if (!c) return undefined;
  const hand = c.skeleton[joint as "rHand"];
  const tool = tracks.find((e) => e.kind === "prop" && "character" in e.anchor && e.anchor.character === who && e.anchor.joint === joint && !e.anchor.with && t >= e.start - 1e-6 && t <= e.end + 1e-6)
    ?? tracks.find((e) => e.kind === "prop" && "character" in e.anchor && e.anchor.character === who && e.anchor.joint === joint && !e.anchor.with);
  const recipe = tool ? EFFECTS[tool.kind] : undefined;
  if (!tool || !recipe || !hand) return hand;
  const at = anchorAt(tool.anchor, characters);
  if (!at) return hand;
  const forearm = forearmOf(tool.anchor, characters, twoHandTool(tool));
  let shapes: Shape[] = [];
  try { shapes = recipe.draw({ t: Math.max(0, t - tool.start), duration: Math.max(0.1, tool.end - tool.start), fps: 24, at, height, groundY, stageWidth, facing: c.facing, held: true, ...(forearm ? { forearm } : {}) } as never, tool.params ?? {}); } catch { return hand; }
  let best: Point = hand, bd = -1;
  const put = (x: number, y: number) => { if (!Number.isFinite(x) || !Number.isFinite(y)) return; const d = Math.hypot(x - hand.x, y - hand.y); if (d > bd) { bd = d; best = { x, y }; } };
  for (const s of shapes) {
    if ((s as { alpha?: number }).alpha === 0) continue;
    if (s.kind === "circle") { const dx = s.x - hand.x, dy = s.y - hand.y, L = Math.hypot(dx, dy) || 1; put(s.x + (dx / L) * s.r, s.y + (dy / L) * s.r); }
    else if (s.kind === "rect") { put(s.x, s.y); put(s.x + s.w, s.y); put(s.x, s.y + s.h); put(s.x + s.w, s.y + s.h); }
    else if ("points" in s) for (let k = 0; k + 1 < s.points.length; k += 2) put(s.points[k], s.points[k + 1]);
  }
  return best;
}

// RAKED LEAVES MOVE (Oct 14, "everything has a cause"): a loose pile on the ground — leaves, a leaf pile, sand, snow, dust, dirt,
// litter (a prop at a fixed spot, by its name) — is pushed along by a held rake / broom / mop / hoe / shovel whose far end (its
// head) touches the ground over the pile: it moves with the head's stroke (a rake only drags it toward the one raking; a broom or
// mop pushes it either way), and stays where it was left. Per picture: how far (px) each such pile has been pushed.
const PUSHABLE = /lea(f|ves)|sand|snow|dust|dirt|litter|trash|crumbs/i, PUSHER = /rake|broom|mop|hoe|shovel|sweep/i;
function pushedByTools(scene: EffectScene, built: SceneFrames, height: number, stageWidth: number): Map<EffectTrack, number[]> {
  const out = new Map<EffectTrack, number[]>();
  const tracks = scene.effects ?? [];
  const nameOf = (e: EffectTrack) => `${e.params?.name ?? ""} ${e.params?.symbol ?? ""}`;
  const piles = tracks.filter((e) => e.kind === "prop" && !("character" in e.anchor) && !("object" in e.anchor) && PUSHABLE.test(nameOf(e)) && !PUSHER.test(nameOf(e)));
  const tools = tracks.filter((e) => e.kind === "prop" && "character" in e.anchor && (e.anchor.joint === "lHand" || e.anchor.joint === "rHand") && PUSHER.test(nameOf(e)));
  if (!piles.length || !tools.length) return out;
  // (each tool's head per picture: its drawn point farthest from the hand)
  const heads = tools.map((e) => built.frames.map((characters, i) => {
    const t = i / built.fps;
    if (t < e.start - 1e-9 || t > e.end + 1e-9) return undefined;
    const at = anchorAt(e.anchor, characters, built.objects[i]), forearm = forearmOf(e.anchor, characters, "character" in e.anchor && toolWorkers(scene).has(e.anchor.character));
    const who = characters.find((c) => c.id === (e.anchor as { character: string }).character);
    if (!at || !who) return undefined;
    let far: Point | undefined, d = -1;
    for (const sh of EFFECTS.prop.draw({ t: t - e.start, duration: e.end - e.start, fps: built.fps, at, height, groundY: scene.groundY, stageWidth, facing: who.facing, ...(forearm ? { forearm } : {}) }, e.params ?? {})) {
      const p = (sh as { points?: number[] }).points ?? [];
      for (let k = 0; k + 1 < p.length; k += 2) { const q = Math.hypot(p[k] - at.x, p[k + 1] - at.y); if (q > d) { d = q; far = { x: p[k], y: p[k + 1] }; } }
    }
    return far ? { ...far, holder: who.skeleton.hip.x, rake: /rake|hoe/i.test(nameOf(e)) } : undefined;
  }));
  for (const pile of piles) {
    const a = pile.anchor as Point, half = Math.max(0.12 * height, 0.5 * Number(pile.params?.size ?? 0.3) * height);
    let shove = 0;
    const list = built.frames.map((_, i) => {
      for (const h of heads) {
        const now = h[i], before = h[i - 1];
        if (!now || !before) continue;
        const touching = now.y >= scene.groundY - 0.07 * height && Math.abs(now.x - (a.x + shove)) <= half;
        const dx = now.x - before.x, toward = Math.sign(now.holder - now.x) === Math.sign(dx);
        if (touching && Math.abs(dx) > 0.5 && (!now.rake || toward)) {
          shove += 0.8 * dx;
          // (a pile is never dragged in under the worker's own feet: it stops a short step in front of the hips)
          const gap = a.x + shove - now.holder, keep = 0.3 * height;
          if (Math.abs(gap) < keep) shove = now.holder + (Math.sign(a.x - now.holder) || 1) * keep - a.x;
        }
      }
      return shove;
    });
    if (list.some((v) => v !== 0)) out.set(pile, list);
  }
  return out;
}

// NOTHING EVER JUMPS (Arthur, Oct 14, a13 tug of war: "red is holding this orange dot… when he lets go, blue is now holding that —
// no teleporting allowed, freaking enforce that law"). One thing can be drawn by several tracks back to back (let go, handed over,
// caught, picked up, put down, a prop split into pieces). Where a track takes over from the one before it, its DRAWN BODY starts
// exactly where the body was and travels to its new spot: dropped (no longer in a hand, lower down) → it FALLS under gravity;
// anything else (hand to hand, hand to table…) → it glides over ~0.25–0.8 s (farther = longer). Used by the page AND the no-teleport law.
export type Glide = { dx: number; dy: number; t0: number; dur: number; fall: boolean };
const glideKey = (e: EffectTrack) => { const p = e.params as { scriptId?: unknown; name?: unknown; symbol?: unknown } | undefined; const k = p?.scriptId ?? p?.name ?? p?.symbol; return k === undefined ? undefined : `${e.kind === "heldWeapon" ? "prop" : e.kind}:${String(k)}`; };
export function shapesCenter(shapes: readonly Shape[]): Point | undefined {
  // (the thing's BODY: a rope's or a kite's string lines are not its body — only its own shapes, unless it is all lines)
  const body = shapes.some((s) => s.kind !== "line") ? shapes.filter((s) => s.kind !== "line") : shapes;
  let l = Infinity, r = -Infinity, t = Infinity, b = -Infinity;
  const put = (x: number, y: number) => { if (!Number.isFinite(x) || !Number.isFinite(y)) return; l = Math.min(l, x); r = Math.max(r, x); t = Math.min(t, y); b = Math.max(b, y); };
  for (const s of body) {
    if ((s as { alpha?: number }).alpha === 0) continue;
    if (s.kind === "circle") { put(s.x - s.r, s.y - s.r); put(s.x + s.r, s.y + s.r); }
    else if (s.kind === "rect") { put(s.x, s.y); put(s.x + s.w, s.y + s.h); }
    else if ("points" in s) for (let k = 0; k + 1 < s.points.length; k += 2) put(s.points[k], s.points[k + 1]);
    else if ("x" in s && "y" in s) put((s as { x: number }).x, (s as { y: number }).y);
  }
  return l <= r ? { x: (l + r) / 2, y: (t + b) / 2 } : undefined;
}
export function shiftShapes(shapes: Shape[], dx: number, dy: number): Shape[] {
  if (!dx && !dy) return shapes;
  return shapes.map((s) => {
    const o = { ...s } as Shape & { x?: number; y?: number; points?: number[] };
    if ("points" in s && Array.isArray(s.points)) o.points = s.points.map((v, k) => v + (k % 2 ? dy : dx));
    if (typeof (s as { x?: unknown }).x === "number") { o.x = (s as { x: number }).x + dx; o.y = (s as { y: number }).y + dy; }
    return o as Shape;
  });
}
// The body's middle as one track draws it at picture i (before any glide), or undefined when it draws nothing there.
export function trackBodyAt(e: EffectTrack, built: SceneFrames, i: number, height: number, groundY: number, stageWidth: number): Point | undefined {
  const recipe = EFFECTS[e.kind], characters = built.frames[i] ?? [];
  if (!recipe) return undefined;
  const at = anchorAt(e.anchor, characters, built.objects[i] ?? []);
  if (!at) return undefined;
  const target = e.target ? anchorAt(e.target, characters, built.objects[i] ?? []) : undefined;
  const facing = "character" in e.anchor ? characters.find((c) => c.id === (e.anchor as { character: string }).character)?.facing : undefined;
  const forearm = forearmOf(e.anchor, characters, twoHandTool(e));
  try { return shapesCenter(recipe.draw({ t: i / built.fps - e.start, duration: e.end - e.start, fps: built.fps, at, target, height, groundY, stageWidth, ...(facing ? { facing } : {}), ...(forearm ? { forearm } : {}) }, e.params ?? {})); } catch { return undefined; }
}
export function thingGlides(tracks: readonly EffectTrack[], built: SceneFrames, height: number, groundY: number, stageWidth: number): Map<EffectTrack, Glide> {
  const out = new Map<EffectTrack, Glide>(), fps = built.fps, last = built.frames.length - 1, frame = 1 / fps;
  if (last < 1) return out;
  for (const e of tracks) {
    if (e.kind !== "prop" && e.kind !== "heldWeapon") continue;
    const k = glideKey(e); if (!k || e.start <= frame) continue;
    const prev = tracks.filter((o) => o !== e && glideKey(o) === k && o.start < e.start - 1e-9 && Math.abs(o.end - e.start) <= 1.5 * frame).sort((a, b) => b.end - a.end)[0];
    if (!prev) continue;
    const fb = Math.max(0, Math.min(last, Math.ceil(e.start * fps - 1e-6))), fa = Math.max(0, Math.min(last, Math.floor(prev.end * fps + 1e-6)));
    const pa = trackBodyAt(prev, built, Math.min(fa, Math.max(0, fb - 1)), height, groundY, stageWidth);
    const pb = trackBodyAt(e, built, fb, height, groundY, stageWidth);
    if (!pa || !pb) continue;
    const dx = pa.x - pb.x, dy = pa.y - pb.y, d = Math.hypot(dx, dy);
    if (d <= 0.02 * height) continue;
    const fall = !("character" in e.anchor) && "character" in prev.anchor && dy < 0;
    const g = (9.8 * height) / 1.7, dur = fall ? Math.min(0.6, Math.max(0.25, Math.sqrt((2 * -dy) / g))) : Math.min(0.8, Math.max(0.25, 0.25 + (0.25 * d) / height));
    out.set(e, { dx, dy, t0: e.start, dur, fall });
  }
  return out;
}
// How far the body still is from where its own track draws it, `t` s into the scene (0, 0 = arrived).
export function glideOffset(g: Glide | undefined, t: number): Point {
  if (!g) return { x: 0, y: 0 };
  const u = Math.min(1, Math.max(0, (t - g.t0) / g.dur));
  if (u >= 1) return { x: 0, y: 0 };
  if (g.fall) return { x: g.dx * (1 - u), y: g.dy * (1 - u * u) }; // (falls faster and faster, drifting the way it was going)
  const s = u * u * (3 - 2 * u);
  return { x: g.dx * (1 - s), y: g.dy * (1 - s) };
}

// Every picture's shapes: the background (behind everything), effects behind the figures, effects in front.
// Picture i is at time i / fps (the same clock as buildScene's pictures).
export function buildEffectFrames(scene: EffectScene, built: SceneFrames): EffectFrame[] {
  // THE CAMERA (camera.ts): only a scene with film cuts or a screen shake — each shot's own background and effects.
  if (built.camera && hasCamera(scene)) return cameraEffectFrames(scene, built, buildEffectFrames);
  const height = scene.characters[0]?.height ?? scene.effectHeight ?? 300;
  const stageWidth = scene.stageWidth ?? 1920;
  // (A burst where a thrown thing LANDS: moved to that moment, fixed at that spot.)
  const landed = new Map<EffectTrack, EffectTrack>();
  for (const track of scene.effects ?? []) {
    const on = track.anchor;
    if (!("object" in on) || !on.landing) continue;
    const land = objectLanding(built, on.object, scene.groundY);
    if (land) landed.set(track, { ...track, start: land.t, end: land.t + (track.end - track.start), anchor: { x: land.x + (on.dx ?? 0), y: land.y + (on.dy ?? 0) } });
  }
  const lastSeen = new Map<EffectTrack, { at: Point; facing?: "left" | "right" | "front" }>(); // (staysWhenGone)
  const pushed = pushedByTools(scene, built, height, stageWidth);
  const heads = toolHeads(scene.effects ?? [], height), workers = toolWorkers(scene);
  const glides = thingGlides(scene.effects ?? [], built, height, scene.groundY, stageWidth); // (NOTHING EVER JUMPS)
  // (EMITTED THINGS LIVE IN THE WORLD — random.ts sourceAt: where each track's anchor was seen in picture j, so a recipe can ask
  // where its source was when a bubble / puff / spark was born. Worked out once per track and picture, only when asked.)
  const seenCache = new Map<EffectTrack, (Point | null)[]>();
  const seenIn = (raw: EffectTrack, track: EffectTrack, j: number): Point | undefined => {
    let list = seenCache.get(raw);
    if (!list) seenCache.set(raw, (list = []));
    if (list[j] === undefined) {
      const p0 = fromToolHead(track, built.frames[j], heads, workers) ?? anchorAt(track.anchor, built.frames[j], built.objects[j]), sh = pushed.get(raw)?.[j] ?? 0;
      list[j] = p0 ? (sh ? { ...p0, x: p0.x + sh } : p0) : null;
    }
    return list[j] ?? undefined;
  };
  const anchorAtTime = (raw: EffectTrack, track: EffectTrack, now: number) => (tt: number): Point | undefined => {
    const f = clampNum((track.start + tt) * built.fps, 0, Math.min(now, built.frames.length - 1)), j0 = Math.floor(f), j1 = Math.min(j0 + 1, now), w = f - j0;
    const a = seenIn(raw, track, j0), b = j1 === j0 ? a : seenIn(raw, track, j1);
    if (!a || !b) return a ?? b;
    return { x: a.x + (b.x - a.x) * w, y: a.y + (b.y - a.y) * w };
  };
  // (EMITTERS ONLY WHEN THEIR CAUSE IS TRUE — emitterCause.ts: per track, in which pictures its cause is true — the wand at the
  // mouth or waved, the whistle at the mouth — from where its source and its figure's head really are in the built pictures)
  const gates = new Map<EffectTrack, boolean[] | null>();
  const gateOf = (raw: EffectTrack, track: EffectTrack): boolean[] | null => {
    if (!gates.has(raw)) {
      const need = emitterNeed(track, scene.effects ?? []), who = (track.anchor as { character?: string }).character;
      gates.set(raw, need && who ? causeList(need, built.frames.map((_, j) => seenIn(raw, track, j)), built.frames.map((f) => f.find((c) => c.id === who)), built.fps, height) : null);
    }
    return gates.get(raw) ?? null;
  };
  const emitsAtTime = (gate: boolean[], track: EffectTrack) => (tt: number): boolean => gate[clampNum(Math.round((track.start + tt) * built.fps), 0, gate.length - 1)] ?? false;
  return built.frames.map((characters, i) => {
    const t = i / built.fps;
    const frame: EffectFrame = { background: [], back: [], front: [] };
    for (const piece of scene.background?.pieces ?? []) {
      const recipe = BACKGROUND_PIECES[piece.kind];
      // (a FOLLOW camera's world is wider than the page: the background fills all of it — camera.ts backgroundWidth)
      if (recipe) frame.background.push(...recipe.draw({ ...piece, params: { seed: scene.background?.seed, ...piece.params } }, t, { width: (scene as { backgroundWidth?: number }).backgroundWidth ?? stageWidth, groundY: scene.groundY, height }));
    }
    for (const raw of scene.effects ?? []) {
      const track = ownerAt(landed.get(raw) ?? raw, t);
      if (t < track.start - 1e-9 || t > track.end + 1e-9) continue;
      const recipe = EFFECTS[track.kind];
      const seen0 = fromToolHead(track, characters, heads, workers) ?? anchorAt(track.anchor, characters, built.objects[i]), shove = pushed.get(raw)?.[i] ?? 0;
      const seen = seen0 && shove ? { ...seen0, x: seen0.x + shove } : seen0, at = seen ?? (recipe?.staysWhenGone ? lastSeen.get(raw)?.at : undefined);
      if (!recipe || !at) continue;
      const target = track.target ? anchorAt(track.target, characters, built.objects[i]) : undefined;
      // (`facing`: the way the anchor's figure faces — a cap's peak points that way.)
      const facing = "character" in track.anchor ? characters.find((c) => c.id === (track.anchor as { character: string }).character)?.facing ?? lastSeen.get(raw)?.facing : undefined;
      if (seen && recipe.staysWhenGone) lastSeen.set(raw, { at: seen, facing });
      const forearm = seen ? forearmOf(track.anchor, characters, "character" in track.anchor && workers.has(track.anchor.character)) : undefined;
      const gl = glideOffset(glides.get(raw), t);
      const gate = seen ? gateOf(raw, track) : null;
      const shapes0 = recipe.draw({ t: t - track.start, duration: track.end - track.start, fps: built.fps, at, ...(seen ? { anchorAt: anchorAtTime(raw, track, i) } : {}), ...(gate ? { emitsAt: emitsAtTime(gate, track) } : {}), target, height, groundY: scene.groundY, stageWidth, ...(facing ? { facing } : {}), ...(forearm ? { forearm } : {}) }, track.params ?? {});
      const shapes = shiftShapes(shapes0, gl.x, gl.y);
      if (track.layer === "top") (frame.top ??= []).push(...shapes); // (over the heads: laser beams from the eyes)
      else (track.layer === "back" || track.behind?.some(([from, to]) => t >= from - 1e-9 && t < to - 1e-9) ? frame.back : frame.front).push(...shapes);
    }
    return frame;
  });
}

// WHERE AND WHEN A THROWN THING LANDS: the first picture, after it has been up off the floor, in which it comes down
// onto the floor (its bottom within 3 px of the ground, falling or stopped), or hits a figure in flight (its middle
// inside a figure's body box, not its holder's hands); never landing → the last picture it is seen in.
export function objectLanding(built: SceneFrames, id: string, groundY: number): { t: number; x: number; y: number } | undefined {
  let up = false, fell = false, last: { t: number; x: number; y: number } | undefined, prev: FrameObject | undefined;
  for (let i = 0; i < built.objects.length; i += 1) {
    const o = built.objects[i].find((f) => f.id === id);
    if (!o) { prev = undefined; continue; }
    const bottom = o.y + objectHalfExtents(o.look, o.rotation, o.scaleX, o.scaleY).halfH;
    const here = { t: i / built.fps, x: o.x, y: Math.min(o.y, groundY) };
    if (up && prev && o.y >= prev.y - 0.5 && bottom >= groundY - 3) return { ...here, y: groundY };
    // (a bounce between two pictures, at a low frame rate: falling, then rising again near the floor)
    if (up && prev && fell && o.y < prev.y - 0.5 && bottom >= groundY - 80) return { t: (i - 0.5) / built.fps, x: (o.x + prev.x) / 2, y: groundY };
    fell = prev !== undefined && o.y > prev.y + 0.5;
    if (up && prev && Math.abs(o.x - prev.x) > 1) {
      // A THING FLYING INTO A BODY LANDS ON ITS SKIN (Arthur, Oct 15: the snowball "never truly hits him" — the splat went off at
      // the body's box edge, a body-width short of his back): the landing is the moment, between this picture and the one
      // before, that the thing first REACHES a body line (objects.ts bodyTouch), and its spot is the skin point it touches there.
      const r = objectHalfExtents(o.look, o.rotation, o.scaleX, o.scaleY).halfW;
      for (const c of built.frames[i]) {
        const s = c.skeleton;
        const nearHands = Math.min(Math.hypot(s.lHand.x - o.x, s.lHand.y - o.y), Math.hypot(s.rHand.x - o.x, s.rHand.y - o.y)) < 80;
        if (nearHands) continue;
        const touch = bodyTouch(o, prev, c, r, c.headRadius * 8);
        if (touch) return { t: (i - 1 + touch.u) / built.fps, x: touch.at.x, y: Math.min(touch.at.y, groundY) };
      }
    }
    if (bottom < groundY - 30) up = true;
    last = here; prev = o;
  }
  return last;
}

const clampNum = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

// The lesson lines for the AI: what each effect and background piece is.
export const effectLessons = () => [...Object.values(EFFECTS).map((r) => `${r.id}: ${r.about}`), ...Object.values(BACKGROUND_PIECES).map((r) => `background ${r.id}: ${r.about}`)];

export type { Shape };

// AN IMPACT IS BIGGER THAN WHAT MADE IT (Arthur, 2026-10-08: the power ball's burst "is literally smaller than the
// ball"): a burst at a thing's landing (sparks or stars, a fiery burst, a flash, a splash, a shatter...) spreads at
// least IMPACT_REACH × the thing's own radius — measured on the recipe's OWN drawing (its clearly visible shapes), so it
// holds for every recipe, and a bigger ball makes a bigger burst. Only ever made bigger; words are not a burst.
export const IMPACT_REACH = 3.5;
const NOT_A_BURST = new Set(TEXT.map((r) => r.id));
// How far a burst reaches from where it is, at its widest in its first 0.3 s (an impact is big AT ONCE, not only when
// fading out): the body of it — 70% of its clearly visible shapes (alpha ≥ 0.2) are within this — not one stray spark.
export function burstReach(kind: string, params: EffectParams, at: Point, height: number, groundY: number, seconds: number): number {
  const recipe = EFFECTS[kind];
  if (!recipe) return 0;
  let reach = 0;
  for (let k = 0; k <= 12; k += 1) {
    const t = (k / 12) * Math.min(Math.max(0.05, seconds), 0.3), far: number[] = [];
    for (const s of recipe.draw({ t, duration: seconds, fps: 24, at, height, groundY, stageWidth: 1920 }, params)) {
      const q = s as { kind: string; alpha?: number; points?: number[]; x?: number; y?: number; r?: number };
      if ((q.alpha ?? 1) < 0.2) continue;
      const pts = Array.isArray(q.points) ? q.points : typeof q.x === "number" && typeof q.y === "number" ? [q.x, q.y] : [];
      let d = 0;
      for (let j = 0; j + 1 < pts.length; j += 2) d = Math.max(d, Math.hypot(pts[j] - at.x, pts[j + 1] - at.y) + (q.kind === "circle" ? q.r ?? 0 : 0));
      if (pts.length) far.push(d);
    }
    far.sort((x, y) => x - y);
    if (far.length) reach = Math.max(reach, far[Math.min(far.length - 1, Math.floor(far.length * 0.7))]);
  }
  return reach;
}
function impactBigEnough(e: EffectTrack, radius: number, land: { x: number; y: number } | undefined, a: { dx?: number; dy?: number }, height: number, groundY: number): EffectTrack {
  if (!radius || !land || NOT_A_BURST.has(e.kind) || !EFFECTS[e.kind]) return e;
  const at = { x: land.x + (a.dx ?? 0), y: land.y + (a.dy ?? 0) }, need = IMPACT_REACH * radius, seconds = e.end - e.start;
  const reachAt = (size: number | undefined) => burstReach(e.kind, size === undefined ? e.params ?? {} : { ...e.params, size }, at, height, groundY, seconds);
  const before = reachAt(undefined);
  if (before <= 0 || before >= need) return e;
  const given = typeof e.params?.size === "number" ? e.params.size : undefined;
  let size = given ?? 1, reach = reachAt(size);
  for (let k = 0; k < 5 && reach > 0 && reach < need && size < 2.5; k += 1) { size = Math.min(2.5, size * (need / reach) * 1.02); reach = reachAt(size); }
  return reach > before && (given === undefined || size > given) ? { ...e, params: { ...e.params, size } } : e;
}

// A THING THAT BURSTS IS GONE (Arthur: a thrown power ball "bursts into stars" — it doesn't roll on after): an object
// with an effect anchored at its landing ({object, landing: true}) is not drawn after it lands.
addBuiltHook((scene, built) => {
  // AN EFFECT RIDING ON A THROWN THING LASTS AS LONG AS THE THING FLIES (2026-10-07, Luna's power ball lost its glow
  // halfway): an effect on an object that lands keeps going until the landing, whatever end the plan wrote. (New
  // track objects — the plan's own are never changed.)
  const riding = (scene as Scene & { effects?: EffectTrack[] }).effects ?? [];
  if (riding.some((e) => typeof (e.anchor as { object?: unknown })?.object === "string")) {
    // A GLOW AROUND A THING IS BIGGER THAN THE THING (the same review: a glow `size` 0.3 was smaller than the ball and
    // hid behind it): a glow riding on an object reaches at least ~1.8× the object's own radius.
    const height = scene.characters[0]?.height ?? 300;
    const radiusOf = (id: string) => {
      const o = built.objects.flat().find((x) => x.id === id);
      if (!o) return 0;
      const { halfW, halfH } = objectHalfExtents(o.look, 0, Math.abs(o.scaleX ?? 1), Math.abs(o.scaleY ?? 1));
      return Math.max(halfW, halfH);
    };
    (scene as Scene & { effects?: EffectTrack[] }).effects = riding.map((e) => {
      const a = e.anchor as { object?: unknown; landing?: unknown; dx?: number; dy?: number };
      if (typeof a?.object === "string" && a.landing === true) return impactBigEnough(e, radiusOf(a.object), objectLanding(built, a.object, scene.groundY), a, height, scene.groundY);
      if (typeof a?.object !== "string") return e;
      const land = objectLanding(built, a.object, scene.groundY);
      let out = land && e.end < land.t ? { ...e, end: land.t } : e;
      if (e.kind === "glow") {
        const least = (1.8 * radiusOf(a.object)) / (0.13 * height); // (the glow's reach is 0.13 × height × size)
        const size = typeof e.params?.size === "number" ? e.params.size : 1;
        if (size < least) out = { ...out, params: { ...e.params, size: least } };
      }
      return out;
    });
  }
  const effects = (scene as Scene & { effects?: EffectTrack[] }).effects ?? [];
  const gone = new Map<string, number>();
  for (const e of effects) {
    const a = e.anchor as { object?: unknown; landing?: unknown };
    if (typeof a?.object !== "string" || a.landing !== true) continue;
    const land = objectLanding(built, a.object, scene.groundY);
    if (land) gone.set(a.object, Math.min(gone.get(a.object) ?? Infinity, land.t));
  }
  if (!gone.size) return built;
  // (Kept through the picture it lands in, so where it landed — and the burst there — stay the same.)
  return { ...built, objects: built.objects.map((frame, i) => frame.filter((o) => !(gone.has(o.id) && i > Math.ceil(gone.get(o.id)! * built.fps - 1e-6)))) };
});

// A CONTACT HAS A CONSEQUENCE ON THE BODY (Arthur, Oct 15): a hand in a fire / on an electric fence / on ice reacts; a strike on a
// held thing pushes the holder. Registered last, after causes.ts has given every fire its real start.
import { contactConsequences, BODY_STATUS } from "./contactConsequence.ts";
addBuiltHook(contactConsequences);
EFFECTS[BODY_STATUS.id] = BODY_STATUS; // (status ON the body: arcs / a flame on the hand / frost / drips)
