// ELEMENTS (SPEC-0017 Phase 2C extras, ELEMENTAL FIGHTS, 2026-10-06 — Arthur: "the engine only learned one fight
// with elements... it needs to understand: this does this, he does that"). The engine's understanding of what each
// element can do and what happens when elements meet. The powers' own files make each power's body move and its own
// effect (powers.ts fire/water/teleport, powerIce.ts ice, powerLaser.ts laser); this file is the last word on the
// tracks once every power's effects are made (powers.ts powerEffects calls elementalTracks): wherever two powers
// MEET in the plan, it changes and adds effects by these rules —
// - ELEMENTS INTERACT: a laser or fire on ice → the ice CRACKS where it is hit, steam rises off the hot spot, and
//   if it keeps hitting the ice SHATTERS (pieces of ice + a puff of steam); fire on ice melts it (water drops +
//   steam); laser or fire on water → steam (FIRE MEETS WATER); ice on water → a splash and frost; ice on ice →
//   shards.
// - A BLOCK STOPS IT: a beam or thrown crystals reaching someone behind a wall (an ice mountain, a water shield)
//   hit the wall's face, not the body.
// - A COUNTER: a beam switched on while thrown crystals are flying at the one who fires it ZAPS them mid-air: they
//   shatter where the beam meets them (with a puff of steam for a hot beam) — except the last `through` of them,
//   which fly under it and on (`through`, on the beam). A crystal flying at someone who has jumped out of the way
//   smashes into the ground where he stood.
// - A CLASH: two beams or streams fired at each other at the same time meet in the middle: a CLASH POINT (sparks,
//   steam, shards) that pushes back and forth, toward the weaker side, the winner's push wins (`win: true` on its
//   beam); when the streams stop, the point swells for CLASH_SWELL seconds and BURSTS — both are knocked back by it
//   (the plan times their getHit to that moment: "<id>.<beam><k>.end" + CLASH_SWELL).
// Each figure's power is ONE element: laser (laserEyes), ice (iceMountain, iceThrow, iceBlast), fire (fireBlast),
// water (waterShield, waterBlast). A power's `element` param says what a stand-in power is made of.
// (Only types and pure helpers are imported at the top level, so powers.ts and this file can import each other.)
import type { CharacterKey } from "../engine.ts";
import { ELEMENT_COLORS, isElement, makesSteam, STEAM_GRAY, STEAM_LIGHT, type Element } from "../effects/clash.ts";
import type { Anchor, EffectTrack } from "../effects/types.ts";
import type { Facing, Point } from "../rig.ts";
import { standingSkeleton } from "./punch.ts";
import type { ScenePlan } from "./plan.ts";

export type { Element };
export type PowerKind = "beam" | "volley" | "ground" | "wall";

// What each power move is made of and what kind of power it is.
export const ELEMENT_OF_MOVE: Record<string, Element> = {
  fireBlast: "fire", laserEyes: "laser", iceBlast: "ice", iceThrow: "ice", iceMountain: "ice", waterBlast: "water", waterShield: "water",
};
export function powerKind(move: string, params: Record<string, unknown> = {}): PowerKind | undefined {
  if (move === "fireBlast" || move === "laserEyes" || move === "iceBlast" || move === "waterBlast") return "beam";
  if (move === "iceThrow") return "volley";
  if (move === "waterShield") return "wall";
  // (An ice mountain is a WALL when it rises in front of its maker — `shape: "mountain"` with no target — and a
  // GROUND attack when it runs along the ground to someone.)
  if (move === "iceMountain") return params.target === undefined && (params.shape === "mountain" || params.wall === true || params.distance !== undefined) ? "wall" : "ground";
  return undefined;
}
export const elementOf = (move: string, params: Record<string, unknown> = {}): Element | undefined => (isElement(params.element) ? params.element : ELEMENT_OF_MOVE[move]);

// ---- Timing rules (seconds) -----------------------------------------------------------------------------
// How fast each stream flies (figure heights a second): a laser is light (there in a blink); fire, ice and water
// streams about as fast as fire.ts fireStream.
export const STREAM_SPEED: Record<Element, number> = { laser: 40, fire: 3, ice: 3.4, water: 3 };
export const streamTravel = (element: Element, distancePx: number, height: number) => Math.max(element === "laser" ? 0.03 : 0.06, Math.abs(distancePx) / (STREAM_SPEED[element] * height));
// A hot beam on ice: cracks CRACK_AFTER after it starts hitting; the ice SHATTERS after BREAK_AFTER of hitting
// (a laser cuts quicker than fire melts).
export const CRACK_AFTER = 0.08;
export const BREAK_AFTER: Record<Element, number> = { laser: 0.5, fire: 0.75, ice: 0.6, water: 0.9 };
// A clash: when the streams stop, the clash point swells this long, then bursts.
export const CLASH_SWELL = 0.4;
// How long the streams take to meet at the start of a clash.
const CLASH_REACH = 0.12;
// An ice mountain used as a wall: it is all up this long after its `release` (powerIce.ts MOUNTAIN_REACH +
// effects/ice.ts GROW_SECONDS).
export const WALL_UP = 0.15 + 0.18;
// ...and it already stops what hits it this long after its `release` (its spikes coming up).
const WALL_RISING = 0.12;
// Ice: the crystals fly at ICE_FLY_SPEED heights a second, SHARD_STAGGER seconds apart (effects/ice.ts).
const ICE_FLY_SPEED = 5;
const SHARD_STAGGER = 0.06;
const HIT_SECONDS = 0.75;
// The mountain's size when nobody says (effects/ice.ts iceSpikes size): its biggest spike is 1.12 x this tall.
const SPIKE_SIZE = 0.85;
// An ice mountain that blocks is at least this big (its biggest spike 1.12 x this tall: a head taller than a figure).
export const WALL_SIZE = 1.05;

// ---- Where things are -------------------------------------------------------------------------------------
type KeysOf = (id: string) => readonly CharacterKey[] | undefined;

// A figure's key at time t (interpolated hips and pose taken from the nearest earlier key), else its plan spot.
function keyAt(plan: ScenePlan, id: string, t: number, keysOf?: KeysOf): { x: number; facing: Facing; key?: CharacterKey } {
  const c = plan.characters.find((ch) => ch.id === id);
  const keys = keysOf?.(id);
  if (!keys || keys.length === 0) return { x: c?.x ?? 960, facing: c?.facing ?? "right" };
  let facing: Facing = c?.facing ?? "right", at = keys[0];
  for (const k of keys) { if (k.t > t + 1e-9) break; facing = k.facing ?? facing; at = k; }
  const i = keys.indexOf(at), b = keys[i + 1];
  const x = b && b.t > at.t ? at.x + (b.x - at.x) * Math.min(1, Math.max(0, (t - at.t) / (b.t - at.t))) : at.x;
  return { x, facing, key: at };
}
const dirOf = (facing: Facing) => (facing === "left" ? -1 : 1);
// Where a joint of a figure is at time t (from its keys).
function jointAt(plan: ScenePlan, id: string, t: number, joint: "head" | "neck" | "hip" | "lHand" | "rHand", keysOf?: KeysOf): Point {
  const k = keyAt(plan, id, t, keysOf);
  if (!k.key) return { x: k.x, y: plan.groundY - (joint === "hip" ? 0.5 : 0.85) * plan.height };
  return standingSkeleton(k.key.pose, k.facing, k.x, plan.height, plan.groundY, k.key.lift ?? 0)[joint];
}
// The stage point an anchor is at, at time t.
function pointOf(plan: ScenePlan, a: Anchor, t: number, keysOf?: KeysOf): Point {
  if (!("character" in a)) return a;
  const j = (a.joint === "head" || a.joint === "neck" || a.joint === "hip" || a.joint === "lHand" || a.joint === "rHand") ? a.joint : "neck";
  const p = jointAt(plan, a.character, t, j, keysOf);
  return { x: p.x + (a.dx ?? 0), y: p.y + (a.dy ?? 0) };
}
const characterOf = (a: Anchor | undefined) => (a && "character" in a ? a.character : undefined);

// ---- The powers in a plan ---------------------------------------------------------------------------------

export type PowerUse = {
  id: string; move: string; k: number; element: Element; kind: PowerKind; params: Record<string, unknown>; target?: string;
  // beam: the stream comes out .. stops; volley: thrown .. the last crystal lands; ground: it starts .. it shatters;
  // wall: fully up .. down (or shattered)
  start: number; end: number;
  windup?: number;
};

// The first of these marks that the move has.
const markOf = (marks: Record<string, number>, base: string, names: string[]) => names.map((n) => marks[`${base}.${n}`]).find((v) => v !== undefined);

export function powerUses(plan: ScenePlan, marks: Record<string, number>): PowerUse[] {
  const out: PowerUse[] = [];
  for (const c of plan.characters) {
    const count: Record<string, number> = {};
    for (const a of c.actions) {
      count[a.move] = (count[a.move] ?? 0) + 1;
      const params = a.params ?? {};
      const kind = powerKind(a.move, params), element = elementOf(a.move, params);
      if (!kind || !element) continue;
      const k = count[a.move], base = `${c.id}.${a.move}${k}`;
      const target = typeof params.target === "string" && plan.characters.some((o) => o.id === params.target) ? params.target : undefined;
      let start: number | undefined, end: number | undefined;
      if (kind === "beam") { start = markOf(marks, base, ["release", "fire", "shoot"]); end = markOf(marks, base, ["end", "cut"]); }
      else if (kind === "volley") { start = marks[`${base}.release`]; const hit = marks[`${base}.hit`]; end = hit === undefined ? undefined : hit + (Number(params.count ?? 3) - 1) * SHARD_STAGGER; }
      else if (kind === "ground") { start = marks[`${base}.release`]; end = marks[`${base}.shatter`]; }
      else if (a.move === "waterShield") { start = marks[`${base}.hold`]; end = marks[`${base}.release`]; }
      else { const r = marks[`${base}.release`]; start = r === undefined ? undefined : r + WALL_RISING; end = marks[`${base}.shatter`]; }
      if (start === undefined || end === undefined) continue;
      out.push({ id: c.id, move: a.move, k, element, kind, params, target, start, end, windup: marks[`${base}.windup`] });
    }
  }
  return out;
}

// The tracks a power made (powers.ts, powerIce.ts, powerLaser.ts, and the blasts below): its kinds, from its owner
// (or a fixed spot), starting within its time.
const OWN_KINDS: Record<string, string[]> = {
  fireBlast: ["fireStream", "fireBurst", "smokeBurst", "smoke"], laserEyes: ["laserEyes", "laserHit"], iceBlast: ["iceStream", "iceShatter"], waterBlast: ["waterStream", "splash"],
  iceThrow: ["iceShards"], iceMountain: ["iceSpikes"], waterShield: ["waterShield"],
};
function ownTracks(u: PowerUse, tracks: readonly EffectTrack[]): EffectTrack[] {
  const kinds = OWN_KINDS[u.move] ?? [];
  const from = (u.windup ?? u.start) - 0.6, to = u.end + 0.05;
  return tracks.filter((tr) => kinds.includes(tr.kind) && tr.start >= from - 1e-6 && tr.start <= to + 1e-6 && (characterOf(tr.anchor) === undefined || characterOf(tr.anchor) === u.id || characterOf(tr.anchor) === u.target));
}
// The track a power's stream is drawn by (its source is its anchor).
const STREAM_KINDS = new Set(["fireStream", "laserEyes", "iceStream", "waterStream"]);

// Stop a stream's track at time t (a laser's beams cut off then and its eyes fade).
function cutAt(tr: EffectTrack, t: number) {
  if (tr.kind === "laserEyes") { tr.params = { ...tr.params, cutAt: Math.max(Number(tr.params?.fireAt ?? 0), t - tr.start) }; tr.end = Math.min(tr.end, t + 0.3); }
  else tr.end = Math.min(tr.end, t);
}

// ---- The rules -------------------------------------------------------------------------------------------

const STEAM = { color: STEAM_GRAY, color2: STEAM_LIGHT };
const colorsOf = (u: PowerUse) => ({ color: typeof u.params.color === "string" ? u.params.color : ELEMENT_COLORS[u.element][0], color2: typeof u.params.color2 === "string" ? u.params.color2 : ELEMENT_COLORS[u.element][1] });
const seedOf = (u: PowerUse) => (u.id.charCodeAt(0) * 7 + u.k * 13 + u.move.length) % 97;
const hot = (e: Element) => e === "laser" || e === "fire";

// The blasts made here (iceBlast, waterBlast): a stream from the front hand to the target and what it does there.
function blastTracks(plan: ScenePlan, u: PowerUse, keysOf?: KeysOf): EffectTrack[] {
  const h = plan.height, me = keyAt(plan, u.id, u.start, keysOf), dir = dirOf(me.facing);
  const anchor: Anchor = { character: u.id, joint: "lHand", dx: dir * 0.02 * h };
  const from = pointOf(plan, anchor, u.start, keysOf);
  const target: Anchor = u.target ? { character: u.target, joint: "neck", dy: 0.1 * h } : { x: from.x + dir * Number(u.params.distance ?? 2.6 * h), y: from.y };
  const travel = streamTravel(u.element, Math.abs(pointOf(plan, target, u.start, keysOf).x - from.x), h);
  const arrive = Math.min(u.end, u.start + travel), fx = colorsOf(u);
  return u.element === "ice"
    ? [{ kind: "iceStream", start: u.start, end: u.end, anchor, target, params: { ...fx, reach: travel } },
      { kind: "iceShatter", start: arrive, end: u.end + 0.9, anchor: target, params: { size: 0.12, count: 7, direction: dir > 0 ? -60 : -120, spread: 120 } }]
    : [{ kind: "waterStream", start: u.start, end: u.end + 0.3, anchor, target, params: { ...fx } },
      { kind: "splash", start: arrive, end: u.end + 0.8, anchor: target, params: { ...fx, direction: dir > 0 ? 180 : 0, size: 0.4 } }];
}

// THE CLASH POINT's path: it meets in the middle, pushes back and forth (3 swings, a little different every time),
// then the winner's push drives it most of the way to the loser. u along left → right (0 = left's source).
export function clashPush(seconds: number, leftWins: boolean, seed: number): number[] {
  const r = (i: number) => { const v = Math.sin(seed * 12.9898 + i * 78.233) * 43758.5453; return v - Math.floor(v); };
  const s = r(1) < 0.5 ? 1 : -1, w = leftWins ? 1 : -1, D = Math.max(0.3, seconds);
  const keys = [0, 0.5, CLASH_REACH, 0.5,
    CLASH_REACH + 0.28 * D, 0.5 + s * (0.09 + 0.05 * r(2)),
    CLASH_REACH + 0.5 * D, 0.5 - s * (0.1 + 0.06 * r(3)),
    CLASH_REACH + 0.68 * D, 0.5 + s * (0.04 + 0.04 * r(4)),
    D, 0.5 + w * (0.24 + 0.06 * r(5)),
  ];
  return keys.map((v) => Math.round(v * 1000) / 1000);
}

// The near face of an ice mountain (centre cx on the ground, `size`, facing the one at x `fromX`) at height y.
function wallFace(plan: ScenePlan, cx: number, size: number, fromX: number, y: number): Point {
  const h = plan.height, H = size * 1.12 * h, W = H * 0.41 + 0.05 * h, up = Math.max(0, Math.min(H * 0.9, plan.groundY - y));
  return { x: cx + Math.sign(fromX - cx) * (W / 2) * (1 - up / H), y: plan.groundY - up };
}

export function elementalTracks(plan: ScenePlan, marks: Record<string, number>, tracks: EffectTrack[], keysOf?: KeysOf): EffectTrack[] {
  const uses = powerUses(plan, marks);
  if (uses.length === 0) return tracks;
  const h = plan.height, g = plan.groundY;
  let out = [...tracks];
  // (The blasts made here: their own stream and hit.)
  for (const u of uses) if (u.move === "iceBlast" || u.move === "waterBlast") out.push(...blastTracks(plan, u, keysOf));
  const drop = (gone: EffectTrack[]) => { out = out.filter((tr) => !gone.includes(tr)); };
  const add = (...more: EffectTrack[]) => out.push(...more);
  const beams = uses.filter((u) => u.kind === "beam");
  const clashed = new Set<PowerUse>();

  // 1) CLASH: two beams fired at each other at the same time.
  for (const a of beams) for (const b of beams) {
    if (a === b || clashed.has(a) || clashed.has(b) || a.target !== b.id || b.target !== a.id) continue;
    const c0 = Math.max(a.start, b.start), c1 = Math.min(a.end, b.end);
    if (c1 - c0 < 0.25) continue;
    clashed.add(a); clashed.add(b);
    const [left, right] = keyAt(plan, a.id, c0, keysOf).x <= keyAt(plan, b.id, c0, keysOf).x ? [a, b] : [b, a];
    const own = [...ownTracks(left, out), ...ownTracks(right, out)];
    const src = (u: PowerUse): Anchor => own.find((tr) => STREAM_KINDS.has(tr.kind) && characterOf(tr.anchor) === u.id)?.anchor ?? { character: u.id, joint: u.element === "laser" ? "head" : "lHand" };
    const leftWins = left.params.win === true || (right.params.win !== true && seedOf(left) % 2 === 0);
    // (it bursts CLASH_SWELL after the streams stop — or, when the plan has both knocked back soon after, right then)
    const knocks = [left.id, right.id].map((id) => Math.min(...Object.entries(marks).filter(([k, t]) => new RegExp(`^${id}\\.getHit\\d+\\.hit$`).test(k) && t >= c1 && t <= c1 + 1).map(([, t]) => t)));
    const swell = (knocks.every(Number.isFinite) ? Math.max(c1 + 0.1, Math.min(...knocks)) : c1 + CLASH_SWELL) - c0;
    const push = clashPush(c1 - c0, leftWins, seedOf(left) + seedOf(right));
    // (The burst stays where they last met, whatever the bodies do next: a fixed spot.)
    const A = pointOf(plan, src(left), c1, keysOf), B = pointOf(plan, src(right), c1, keysOf), u = push[push.length - 1];
    const burstAt = { x: A.x + (B.x - A.x) * u, y: Math.min(g - 0.3 * h, A.y + (B.y - A.y) * u) };
    // (Each stream's own track is drawn up to the moment they meet — a laser's charge, the eyes starting to glow — and
    // the clash draws both streams from then on; what each would have done to the other's body is gone.)
    const gapOf = (u: PowerUse) => own.find((tr) => tr.kind === "laserEyes" && characterOf(tr.anchor) === u.id)?.params?.gap;
    const gaps = { leftGap: gapOf(left), rightGap: gapOf(right) };
    for (const tr of own) {
      if (STREAM_KINDS.has(tr.kind) && tr.start < c0 - 1e-6) tr.end = Math.min(tr.end, c0);
      else drop([tr]);
    }
    const lc = colorsOf(left), rc = colorsOf(right);
    add({ kind: "clash", start: c0, end: c0 + swell + 1.6, anchor: src(left), target: src(right), params: {
      left: left.element, right: right.element, leftColor: lc.color, leftColor2: lc.color2, rightColor: rc.color, rightColor2: rc.color2,
      push, reach: CLASH_REACH, cut: c1 - c0, burst: swell, burstX: burstAt.x, burstY: burstAt.y, seed: seedOf(left) + 1,
      ...(typeof gaps.leftGap === "number" ? { leftGap: gaps.leftGap } : {}), ...(typeof gaps.rightGap === "number" ? { rightGap: gaps.rightGap } : {}),
    } });
  }

  // 2) WALLS: a beam or crystals reaching someone behind a wall hit the wall.
  // A WATER SHIELD stops a beam at its near edge, at the height it comes in (powers.ts does it for fire and
  // powerIce.ts for crystals; here the rest): a laser or a hot stream turns to steam there, ice to frost and a splash.
  const shieldHit = (att: PowerUse, wall: PowerUse, arrive: number) => {
    if (att.kind !== "beam" || att.move === "fireBlast") return;
    const own = ownTracks(att, out), stream = own.find((tr) => STREAM_KINDS.has(tr.kind));
    if (!stream) return;
    const from = pointOf(plan, stream.anchor, att.start, keysOf), hip = jointAt(plan, wall.id, arrive, "hip", keysOf);
    const toward = Math.sign(from.x - hip.x) || 1, R = 0.65 * h, rise = Math.max(-0.9 * R, Math.min(0.9 * R, hip.y - from.y));
    const edge = { x: hip.x + toward * Math.sqrt(R * R - rise * rise), y: hip.y - rise };
    stream.target = edge;
    if (stream.kind === "laserEyes" && stream.params) stream.params = { ...stream.params, sweep: 0 };
    for (const tr of own.filter((x) => x !== stream && x.start >= arrive - 0.2)) {
      if (tr.kind === "laserHit" || tr.kind === "iceShatter" || tr.kind === "splash") { tr.anchor = edge; if (tr.kind === "laserHit") tr.end = Math.min(tr.end, att.end + 1); } else drop([tr]);
    }
    if (hot(att.element)) {
      add({ kind: "smokeBurst", start: arrive, end: att.end + 0.7, anchor: edge, params: { ...STEAM, size: 0.35, direction: -90, seed: seedOf(att) } });
      add({ kind: "smoke", start: arrive, end: att.end + 1, anchor: edge, params: { ...STEAM, size: 0.12, intensity: 1.1, direction: -90, seed: seedOf(att) + 1 } });
    } else add({ kind: "splash", start: arrive, end: att.end + 0.6, anchor: edge, params: { size: 0.3, direction: toward > 0 ? 0 : 180 } });
  };
  const walls = uses.filter((u) => u.kind === "wall");
  for (const att of uses.filter((u) => (u.kind === "beam" || u.kind === "volley") && !clashed.has(u) && u.target)) {
    const travelTo = (x: number) => (att.kind === "beam" ? streamTravel(att.element, Math.abs(x - keyAt(plan, att.id, att.start, keysOf).x), h) : Math.abs(x - keyAt(plan, att.id, att.start, keysOf).x) / (ICE_FLY_SPEED * h));
    const arrive = att.start + travelTo(keyAt(plan, att.target!, att.start, keysOf).x);
    const wall = walls.find((w) => w.id === att.target && w.start <= arrive + 1e-6 && arrive <= w.end + 1e-6);
    if (!wall) continue;
    if (wall.element === "water") { shieldHit(att, wall, arrive); continue; }
    // An ICE MOUNTAIN in front: where it stands and where the beam meets its face.
    const spikes = ownTracks(wall, out).find((tr) => tr.kind === "iceSpikes");
    if (!spikes) continue;
    const cx = spikes.target && !("character" in spikes.target) ? spikes.target.x : (spikes.anchor as Point).x;
    const size = Math.max(WALL_SIZE, Number(spikes.params?.size ?? SPIKE_SIZE));
    const own = ownTracks(att, out);
    const stream = own.find((tr) => STREAM_KINDS.has(tr.kind) || tr.kind === "iceShards");
    if (!stream) continue;
    const from = pointOf(plan, stream.anchor, att.start, keysOf);
    const aimed = stream.target ? pointOf(plan, stream.target, att.start, keysOf) : { x: cx, y: g - 0.7 * h };
    // (where the beam's line meets the face: its height there, along the line from its source to what it aimed at)
    let face = wallFace(plan, cx, size, from.x, att.kind === "beam" ? aimed.y : g - 0.68 * h);
    if (att.kind === "beam") for (let i = 0; i < 2; i += 1) face = wallFace(plan, cx, size, from.x, from.y + ((aimed.y - from.y) * (face.x - from.x)) / ((aimed.x - from.x) || 1));
    const hitAt = att.start + travelTo(face.x);
    const dir = Math.sign(face.x - from.x) || 1;
    // (it hits the face: its stream ends there, and its hit — sparks, a burst — is on the face, not the body)
    stream.target = face;
    if (stream.kind === "laserEyes" && stream.params) stream.params = { ...stream.params, sweep: 0 };
    for (const tr of own.filter((x) => x !== stream && x.start >= hitAt - 0.2)) {
      if (tr.kind === "laserHit" || tr.kind === "fireBurst" || tr.kind === "iceShatter" || tr.kind === "splash") { tr.anchor = face; if (tr.kind === "laserHit") tr.end = Math.min(tr.end, att.end + 1); }
      else drop([tr]);
    }
    // (a wall that blocks is tall enough to hide behind)
    if (Number(spikes.params?.size ?? SPIKE_SIZE) < WALL_SIZE) spikes.params = { ...spikes.params, size: WALL_SIZE };
    if (att.kind === "volley") continue; // (crystals on ice: they shatter on its face, iceShards' own hit)
    const hitting = att.end - hitAt;
    if (hot(att.element)) {
      // HOT ON ICE: cracks spread from the hot spot, steam rises off it; if it keeps hitting long enough, the ice
      // SHATTERS (the mountain's own shatter, brought forward) with a puff of steam; fire melts it into drops.
      const breaks = hitting >= BREAK_AFTER[att.element] - 1e-6;
      const shatterAt = breaks ? hitAt + BREAK_AFTER[att.element] : wall.end;
      add({ kind: "iceCracks", start: hitAt + CRACK_AFTER, end: Math.min(shatterAt, spikes.end), anchor: face, params: { size: 0.32 * (size / SPIKE_SIZE), direction: dir > 0 ? 180 : 0, seed: seedOf(att) } });
      add({ kind: "smoke", start: hitAt, end: Math.min(att.end, shatterAt) + 0.5, anchor: face, params: { ...STEAM, size: 0.04, intensity: 0.6, wind: -0.2 * dir, direction: -90, seed: seedOf(att) + 2 } });
      if (att.element === "fire") add({ kind: "splash", start: hitAt + 0.25, end: Math.min(att.end, shatterAt) + 0.6, anchor: { x: face.x, y: g }, params: { color: ELEMENT_COLORS.water[0], color2: ELEMENT_COLORS.water[1], size: 0.25, direction: dir > 0 ? 180 : 0, spread: 120 } });
      if (breaks) {
        const crackAt = Number(spikes.params?.crack ?? 0) + spikes.start, ownShatter = Number(spikes.params?.shatter ?? 0) + spikes.start;
        if (ownShatter > shatterAt) {
          spikes.params = { ...spikes.params, crack: Math.max(0.05, Math.min(crackAt, shatterAt - 0.2) - spikes.start), shatter: shatterAt - spikes.start };
          spikes.end = Math.min(spikes.end, shatterAt + 0.9);
        }
        add({ kind: "smokeBurst", start: shatterAt, end: shatterAt + 1, anchor: face, params: { ...STEAM, size: 0.26, direction: dir > 0 ? -110 : -70, seed: seedOf(att) + 4 } });
        // (the beam stops at the ice: the plan ends it as the ice breaks — a beam that went on would now reach the
        // body behind it, so it is cut there)
        if (att.end > shatterAt + 0.05) cutAt(stream, shatterAt);
      }
    } else if (att.element === "water") add({ kind: "splash", start: hitAt, end: att.end + 0.6, anchor: face, params: { size: 0.3, direction: dir > 0 ? 180 : 0 } });
  }

  // 3) COUNTER: a beam switched on while crystals fly at the one who fires it zaps them mid-air.
  for (const zap of beams.filter((u) => !clashed.has(u))) {
    // (only crystals in the air while the beam is on: thrown before it stops, still flying when it starts)
    for (const vol of uses.filter((u) => u.kind === "volley" && u.target === zap.id && u.id === zap.target && u.start < zap.end && u.end > zap.start)) {
      const shards = ownTracks(vol, out).find((tr) => tr.kind === "iceShards" && Math.abs(tr.start - vol.start) < 1e-3);
      const beam = ownTracks(zap, out).find((tr) => STREAM_KINDS.has(tr.kind));
      if (!shards || !beam) continue;
      const count = Math.round(Number(shards.params?.count ?? 3)), through = Math.max(0, Math.min(count, Math.round(Number(zap.params.through ?? 0))));
      const travel = Number(shards.params?.travel ?? 0.5);
      const zapped = Array.from({ length: count }, (_, i) => i).filter((i) => i < count - through && vol.start + i * SHARD_STAGGER + travel > zap.start + 0.05);
      if (zapped.length === 0) continue;
      // Where the beam meets them: where the first one is when the beam reaches it (on its flat arc).
      const from = shards.anchor as Point, to = pointOf(plan, shards.target ?? from, vol.start + travel, keysOf);
      const at = (i: number, t: number) => {
        const u = Math.min(1, Math.max(0, (t - vol.start - i * SHARD_STAGGER) / travel)), dist = Math.hypot(to.x - from.x, to.y - from.y);
        return { x: from.x + (to.x - from.x) * u, y: from.y + (to.y - from.y) * u - 0.08 * dist * 4 * u * (1 - u), u };
      };
      const meet = Math.max(zap.start + 0.03, vol.start + 0.12);
      const Q = at(zapped[0], meet);
      const passQ = (i: number) => vol.start + i * SHARD_STAGGER + Q.u * travel;
      if (passQ(zapped[0]) > zap.end) continue;
      // The beam hits there (not the thrower) while it is on; each zapped crystal shatters as it gets there.
      beam.target = { x: Q.x, y: Q.y };
      if (beam.kind === "laserEyes" && beam.params) beam.params = { ...beam.params, sweep: 0 };
      for (const tr of ownTracks(zap, out).filter((x) => x !== beam && x.start >= zap.start - 1e-6)) {
        if (tr.kind === "laserHit" || tr.kind === "fireBurst") { tr.anchor = { x: Q.x, y: Q.y }; tr.end = Math.min(tr.end, zap.end + 0.6); } else drop([tr]);
      }
      drop([shards]);
      const dir = Math.sign(to.x - from.x) || 1;
      for (let i = 0; i < count; i += 1) {
        const t0 = vol.start + i * SHARD_STAGGER;
        const one: EffectTrack = { ...shards, start: t0, params: { ...shards.params, count: 1, seed: Number(shards.params?.seed ?? 1) + i } };
        if (zapped.includes(i) && passQ(i) <= zap.end + 1e-6) {
          const hitT = Math.max(passQ(i), meet);
          add({ ...one, end: hitT });
          // (a laser SHATTERS a crystal — pieces, and a puff of steam off the hot spot; fire MELTS it — drops of water
          // and steam; anything else just breaks it)
          if (zap.element === "fire") add({ kind: "splash", start: hitT, end: hitT + 0.8, anchor: { x: Q.x, y: Q.y }, params: { color: ELEMENT_COLORS.water[0], color2: ELEMENT_COLORS.water[1], size: 0.18, direction: -90, spread: 160, seed: 11 + i } });
          else add({ kind: "iceShatter", start: hitT, end: hitT + 0.8, anchor: { x: Q.x, y: Q.y }, params: { size: 0.07, count: 6, direction: dir > 0 ? -60 : -120, spread: 140, seed: 11 + i } });
          if (hot(zap.element)) add({ kind: "smokeBurst", start: hitT, end: hitT + 0.8, anchor: { x: Q.x, y: Q.y }, params: { ...STEAM, size: 0.16, direction: -90, seed: 21 + i } });
        } else {
          // (flying under the beam and on: at someone who has jumped out of the way it smashes into the ground
          // where he stood)
          const arrive = t0 + travel;
          const away = jumpAt(plan, marks, zap.id, arrive);
          if (away) {
            const spot = { x: keyAt(plan, zap.id, t0, keysOf).x, y: g };
            add({ ...one, target: spot, end: t0 + Math.hypot(spot.x - from.x, spot.y - from.y) / (ICE_FLY_SPEED * h) + HIT_SECONDS, params: { ...one.params, travel: Math.hypot(spot.x - from.x, spot.y - from.y) / (ICE_FLY_SPEED * h) } });
          } else add(one);
        }
      }
      // (a hot beam on ice crystals: a puff of steam lingers where they were zapped)
      if (hot(zap.element)) add({ kind: "smoke", start: meet, end: zap.end + 0.5, anchor: { x: Q.x, y: Q.y }, params: { ...STEAM, size: 0.045, intensity: 0.6, direction: -90, seed: 5 } });
    }
  }

  // 4) DODGES: crystals or a stream at someone in the air (a jump out of the way) go where he was.
  for (const vol of uses.filter((u) => u.kind === "volley" && u.target)) {
    for (const tr of ownTracks(vol, out).filter((x) => x.kind === "iceShards" && characterOf(x.target) === vol.target)) {
      const travel = Number(tr.params?.travel ?? 0.5), arrive = tr.start + travel;
      if (!jumpAt(plan, marks, vol.target!, arrive)) continue;
      const from = tr.anchor as Point, spot = { x: keyAt(plan, vol.target!, tr.start, keysOf).x, y: g };
      const fly = Math.hypot(spot.x - from.x, spot.y - from.y) / (ICE_FLY_SPEED * h);
      tr.target = spot; tr.params = { ...tr.params, travel: fly }; tr.end = tr.start + fly + (Number(tr.params?.count ?? 1) - 1) * SHARD_STAGGER + HIT_SECONDS;
    }
  }
  return out;
}

// Is `id` in the air (between a jump's take-off and landing) at time t?
export function jumpAt(plan: ScenePlan, marks: Record<string, number>, id: string, t: number): boolean {
  for (let k = 1; marks[`${id}.jump${k}.takeoff`] !== undefined; k += 1) if (marks[`${id}.jump${k}.takeoff`] - 0.02 <= t && t <= marks[`${id}.jump${k}.land`] + 0.02) return true;
  return false;
}

