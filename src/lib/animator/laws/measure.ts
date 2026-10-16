import type { DirectedPlan } from "../director/repair.ts";
import { footfalls } from "../director/repair.ts";
import type { FrameCharacter, FrameObject, Scene, SceneFrames } from "../engine.ts";
import { JOINTS } from "../rig.ts";
import { animationBounds, effectFitBounds } from "../stageFit.ts";
import { propBox } from "./propBox.ts";
import { SCENERY_REACH, restScenery, sceneryRest } from "../moves/tumbleScene.ts";
import { hangsOnBackWall } from "./backWall.ts";
import { IN_SYNC_SEC, inSyncSpan } from "./inSync.ts";
import type { EffectTrack } from "../effects/types.ts";
const SIT_ABOVE = 0.03; // x H: the hips center sits this far above the seat point (world/contacts.ts in the rejected copy)
import { EFFECTS, anchorAt, fromToolHead, glideOffset, heldTip, thingGlides, toolHeads, toolWorkers, trackBodyAt } from "../effects/index.ts";
import { causeList, emitterNeed } from "../effects/emitterCause.ts";
import type { Shape } from "../effects/types.ts";
import { thingFor } from "../things.ts";
import { placedSymbol } from "../symbolMaker.ts";
import { spikeRow } from "../effects/backgrounds.ts";
import { travelSpeedLaw } from "./travel.ts";
import { FAST_MOVES, FAST_WORDS, HAND_SPEED_MAX, SPEED_JUMP_MAX, STILL_SPEED, THROW_SPEED_MAX } from "../moves/timing.ts";

// SPEC-0021 NEW COPY: THE LAWS, carried over from the rejected copy as a CHECKER ONLY — they measure and say what broke; they never
// change the motion.
// THE MEASURER (SPEC-0019 Phase 0, Sat 2026-10-10): the engine reports in NUMBERS what it built, law by law, in kid words.
// It never changes anything. Every Measure is one law: ok / the value / the limit / when / who / what a kid would say.
// LAWS.md "THE STRAIGHT LINE" lists each law with its number.
export type Measure = { law: string; ok: boolean; value: number; limit: number; at?: number; who?: string; say: string };
export type MeasureContext = { stageWidth: number; askedSec?: number | null; words?: string };

import { CONTACT_LIMIT_PX } from "../contacts.ts";
import { CONTACT_GAP_PX, LEGACY_HOLD_GAP, bodyOutline, outlineGap, touchObject, touchVerb, worldOutline, type Outline } from "./outline.ts";
import { hazardZones, hazardKindOf } from "../effects/contactConsequence.ts";
import { objectHalfExtents } from "../objects.ts";
const objectHalfExtentsOf = (fo: FrameObject) => objectHalfExtents(fo.look, fo.rotation ?? 0, fo.scaleX ?? 1, fo.scaleY ?? 1);
export const HAND_TOL = 0.02; // x H: (legacy, unused by the touch laws since Oct 15 — every touch law is CONTACT_GAP_PX flat against the drawn outline)
export const SIT_THIGH = 0.08; // x H: seated knees within this of the hips' height (thighs level) — fix 3
export const SIT_SHIN = 0.12; // x H: a seated foot within this of its knee sideways (shins down) — fix 3; helper G aims at 0.06
export const SIT_TOL = 0.04; // x H: the hips are on the seat within this; the lower foot on the floor within this
export const HELD_TOL_PALM = 0.03; // x H (+ half the thing): a ball held in the palm (night round)
export const HELD_TOL = 0.02; // x H (+ half the thing): a held thing stays at the hand
export const REST_TOL = 0.02; // x H: a thing's bottom is on the ground or on a top within this
export const STILL_TOL = 0.015; // x H: all joints within this = not moving
export const STATUE_SEC = 1.2; // seconds: still longer than this while the scene goes on = a statue
export const PACE_MIN = 1.2, PACE_MAX = 2.3; // steps a second for a walk (the passed library walk at normal speed strides at 2.23: measured in the Phase 0 gate, scene 4 — the law matches the move Arthur passed)
export const TRAVEL_MIN_SEC = 1.0; // a travel shorter than this (or shorter than 0.5H of ground) is not a walk to measure for pace
export const MAX_SECONDS = 15; // unless asked
// (the dad's policy, Oct 12: a core clip is about 15 s, 30 s at most; a story told in several scenes ("cuts") may run 20 s a scene)
export const MAX_CLIP_SECONDS = 30, SCENE_SECONDS = 20;
export const STRIKE_MOVES = /stomp|punch|kick|jab|hook|uppercut|slap|block|dodge|strike|hit|getHit|clash|barrage|combo|dash/i; // fight moves that are fast on purpose (longEnough)
export const PAGE_TOL = 0.5; // px over the page edge
// ARTHUR'S PHASE C2 LAWS (Sun 12:00, review of g-1…g-8): numbers for H5–H9
export const REST_GAP_PX = 1; // H5: a resting thing's DRAWN bottom is on the ground or on another thing's drawn top within 1 px
export const MIN_SCENE_S = 2.5, MIN_BEAT_S = 0.6, MIN_WALK_S = 1.5; // H7: a scene, a beat, a walk at least this long
export const FAKE_HOLD_WITH = 0.008; // x H per picture: a free hand that stays this still relative to the held thing is moving WITH it (a fake hold); faster = it is swinging past
export const FAKE_HOLD_TOL = 0.02, FAKE_HOLD_S = 0.3; // H8: a free hand this near (x H) a held thing for this long = a fake two-hand hold
export const RISE_MAX = 0.9, RISE_MIN_S = 1.0; // H9: hips rise at most 0.9 H a second when standing up; the whole get-up takes ≥ 1.0 s

const r1 = (v: number) => Math.round(v * 10) / 10;
const r2 = (v: number) => Math.round(v * 100) / 100;
const px = (v: number) => `${r1(v)} px`;
const sec = (v: number) => `${r1(v)} s`;

type Fixed = { x: number; y: number };
const fixedAnchor = (e: EffectTrack): Fixed | null => { const a = e.anchor as { x?: unknown; y?: unknown; character?: unknown }; return typeof a.x === "number" && typeof a.y === "number" && !a.character ? { x: a.x, y: a.y } : null; };
const heldAnchor = (e: EffectTrack): { character: string; joint: string } | null => { const a = e.anchor as { character?: unknown; joint?: unknown }; return typeof a.character === "string" ? { character: a.character, joint: String(a.joint ?? "rHand") } : null; };
// (Phase C3: an unnamed prop is keyed by where it stands, never all "prop")
const thingKey = (e: EffectTrack) => String(e.params?.scriptId ?? e.params?.name ?? e.params?.symbol ?? `${e.kind}:${Math.round(Number((e.anchor as { x?: number }).x ?? 0) / 40)}`);
const thingName = (e: EffectTrack) => String(e.params?.name ?? e.params?.symbol ?? thingKey(e)).replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase();
const nameOf = (plan: DirectedPlan, id: string) => plan.characters.find((c) => c.id === id)?.name ?? id;
const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);

export function measurePlan(plan: DirectedPlan, scene: Scene, built: SceneFrames, fps: number, ctx: MeasureContext): Measure[] {
  const out: Measure[] = [];
  const H = plan.height, G = scene.groundY;
  const frames = built.frames, n = frames.length, last = Math.max(0, n - 1);
  const who = (id: string) => nameOf(plan, id);
  const charFrames = (id: string): (FrameCharacter | undefined)[] => frames.map((f) => f.find((c) => c.id === id));
  // WHAT THE PAGE DRAWS: one track's shapes at picture i (the same recipe the page uses), as a box; null when it draws nothing or a symbol
  const drawnBox = (e: EffectTrack, i: number) => {
    const recipe = EFFECTS[e.kind]; if (!recipe) return null;
    const at = anchorAt(e.anchor, frames[i] ?? [], built.objects[i] ?? []); if (!at) return null;
    const facing = "character" in e.anchor ? (frames[i] ?? []).find((c) => c.id === (e.anchor as { character: string }).character)?.facing : undefined;
    let shapes: Shape[] = [];
    try { shapes = recipe.draw({ t: i / fps - e.start, duration: e.end - e.start, fps, at, target: e.target ? anchorAt(e.target, frames[i] ?? [], built.objects[i] ?? []) : undefined, height: H, groundY: G, stageWidth: ctx.stageWidth, ...(facing ? { facing } : {}), ...("character" in e.anchor ? { held: true } : {}) } as never, e.params ?? {}); } catch { return null; }
    const xs: number[] = [], ys: number[] = [];
    // (a placed symbol is drawn like draw.ts draws it: its own shapes, centered on (x, y), turned and scaled)
    const walk = (list: readonly Shape[], tf: (x: number, y: number) => [number, number]) => {
      for (const sh of list) {
        if ((sh as { alpha?: number }).alpha === 0) continue;
        const put = (x: number, y: number) => { const [X, Y] = tf(x, y); xs.push(X); ys.push(Y); };
        if (sh.kind === "symbol") {
          const made = placedSymbol(sh), k = sh.scale ?? 1, rad = ((sh.rotation ?? 0) * Math.PI) / 180, cos = Math.cos(rad), sin = Math.sin(rad);
          if (!(k > 0)) continue;
          walk(made.shapes as Shape[], (x, y) => { const lx = (x - made.width / 2) * k * (sh.flipX ? -1 : 1), ly = (y - made.height / 2) * k; return tf(sh.x + lx * cos - ly * sin, sh.y + lx * sin + ly * cos); });
        } else if (sh.kind === "circle") { put(sh.x - sh.r, sh.y - sh.r); put(sh.x + sh.r, sh.y + sh.r); }
        else if (sh.kind === "rect") { put(sh.x, sh.y); put(sh.x + sh.w, sh.y); put(sh.x, sh.y + sh.h); put(sh.x + sh.w, sh.y + sh.h); }
        else if ("points" in sh) for (let k = 0; k + 1 < sh.points.length; k += 2) put(sh.points[k], sh.points[k + 1]);
      }
    };
    walk(shapes, (x, y) => [x, y]);
    return xs.length ? { left: Math.min(...xs), right: Math.max(...xs), top: Math.min(...ys), bottom: Math.max(...ys) } : null;
  };
  // (Phase 0 fix 2: measured on the SCENE's effects — what is drawn — not the plan's: planToScene used to stretch a
  // resting thing to the end and the plan-side count said "one copy" while the video showed two.)
  const props = (((scene as Scene & { effects?: EffectTrack[] }).effects ?? plan.effects ?? []) as EffectTrack[]).filter((e) => e.kind === "prop");

  // 1. HANDS TOUCH WHAT THEY USE (from the build's contact reports; a miss is never silent)
  // (no contact solver in the new copy: nothing to report unless one is added — the report's shape is the rejected copy's world/contacts.ts)
  type ContactReport = { reachable: boolean; worstMissPx: number; contact: { kind: string; figure: string; from: number; to: number; seat: { x: number; y: number } } };
  for (const rep of (built as SceneFrames & { contacts?: ContactReport[] }).contacts ?? []) {
    const c = rep.contact;
    if (c.kind === "hand") {
      const limit = CONTACT_GAP_PX, ok = rep.reachable && rep.worstMissPx <= limit;
      out.push({ law: "hand", ok, value: r1(rep.worstMissPx), limit: r1(limit), at: c.from, who: c.figure, say: ok ? `${who(c.figure)}'s hand is on what it reaches for at ${sec(c.from)}.` : rep.reachable ? `${who(c.figure)}'s hand misses what it reaches for by ${px(rep.worstMissPx)} at ${sec(c.from)}.` : `${who(c.figure)} can't reach what the hand goes for at ${sec(c.from)} (too far by ${px(rep.worstMissPx)}): step closer.` });
    }
    // 1b. DECLARED CONTACTS (contacts.ts, the final contact pass): a hand/foot a move declared on a target is ON it, flat px.
    if (String(c.kind) === "contact") {
      const ok = rep.reachable && rep.worstMissPx <= CONTACT_LIMIT_PX;
      out.push({ law: "contact", ok, value: r1(rep.worstMissPx), limit: CONTACT_LIMIT_PX, at: c.from, who: c.figure, say: ok ? `${who(c.figure)}'s ${(c as { joint?: string }).joint ?? "hand"} is on what it touches from ${sec(c.from)} to ${sec(c.to)}.` : rep.reachable ? `${who(c.figure)}'s ${(c as { joint?: string }).joint ?? "hand"} misses what it touches by ${px(rep.worstMissPx)} (from ${sec(c.from)}).` : `${who(c.figure)} can't reach what it touches at ${sec(c.from)} (short by ${px(rep.worstMissPx)}): the figures must stand closer.` });
      continue;
    }
    if (c.kind === "sit") {
      // 2. HIPS SIT ON THE SEAT, FEET ON THE FLOOR (measured on every frame of the sit)
      const f0 = Math.max(0, Math.round(c.from * fps)), f1 = Math.min(last, Math.round(c.to * fps));
      let hipMiss = 0, footGap = 0;
      for (let f = f0; f <= f1; f += 1) {
        const fc = frames[f]?.find((x) => x.id === c.figure);
        if (!fc) continue;
        hipMiss = Math.max(hipMiss, Math.abs(fc.skeleton.hip.y - (c.seat.y - SIT_ABOVE * H)));
        footGap = Math.max(footGap, G - Math.max(fc.skeleton.lFoot.y, fc.skeleton.rFoot.y));
      }
      const lim = SIT_TOL * H;
      out.push({ law: "sit", ok: hipMiss <= lim, value: r1(hipMiss), limit: r1(lim), at: c.from, who: c.figure, say: hipMiss <= lim ? `${who(c.figure)}'s bottom is on the seat from ${sec(c.from)}.` : `${who(c.figure)}'s bottom is ${px(hipMiss)} off the seat while sitting (from ${sec(c.from)}).` });
      out.push({ law: "sitFeet", ok: footGap <= lim, value: r1(footGap), limit: r1(lim), at: c.from, who: c.figure, say: footGap <= lim ? `${who(c.figure)}'s feet stay on the floor while sitting.` : `${who(c.figure)}'s feet hang ${px(footGap)} above the floor while sitting.` });
      // 2b. IT LOOKS LIKE SITTING (fix 3 — Arthur: "he's never truly sitting; it counts but it isn't true"): on the last seated
      // frame the THIGHS ARE LEVEL (the knees within SIT_THIGH of the hips' height, never above them) and the SHINS GO DOWN
      // (each foot within SIT_SHIN of its knee sideways). A figure whose hips touch the seat with its knees on the floor is not sitting.
      const fl = frames[f1]?.find((x) => x.id === c.figure);
      if (fl) {
        const k = fl.skeleton;
        const thigh = Math.max(Math.abs(k.lKnee.y - k.hip.y), Math.abs(k.rKnee.y - k.hip.y));
        const shin = Math.max(Math.abs(k.lFoot.x - k.lKnee.x), Math.abs(k.rFoot.x - k.rKnee.x));
        out.push({ law: "sitThighs", ok: thigh <= SIT_THIGH * H, value: r1(thigh), limit: r1(SIT_THIGH * H), at: c.to, who: c.figure, say: thigh <= SIT_THIGH * H ? `${who(c.figure)}'s thighs are level while sitting.` : `${who(c.figure)}'s knees are ${px(thigh)} off the hips' height while sitting: that is not a sitting shape.` });
        out.push({ law: "sitShins", ok: shin <= SIT_SHIN * H, value: r1(shin), limit: r1(SIT_SHIN * H), at: c.to, who: c.figure, say: shin <= SIT_SHIN * H ? `${who(c.figure)}'s shins go down to the floor while sitting.` : `${who(c.figure)}'s feet are ${px(shin)} away from under the knees while sitting: that is not a sitting shape.` });
      }
    }
  }

  // 3. A HELD THING STAYS IN THE HAND — measured on each HELD SEGMENT of the build's own timeline (who holds it, from when to when),
  // so a passed ball is checked against the thrower until the release and the catcher from the catch (night round: play catch
  // "failed" during the flight because it was checked against the first holder on every frame).
  // ONE TRUTH (Oct 15): the holding hand's REAL gap to the thing's DRAWN outline (the World's, else the drawn ball / box with its
  // outline line) is within CONTACT_GAP_PX — no "+ half the size + 0.03H". A hold no move has DECLARED (scene.contacts) keeps a
  // small LEGACY_HOLD_GAP until it is declared; a "hands" hold measures BOTH hands.
  const declared = (figure: string, joint: string, from: number, to: number) => (scene.contacts ?? []).some((c) => c.figure === figure && (joint === "hands" ? /Hand$/.test(c.joint) : c.joint === joint) && c.from < to && c.to > from);
  const objOutline = (fo: FrameObject, i: number): Outline => {
    const w = worldOutline(built, i, [fo.id]); if (w) return w;
    const half = objectHalfExtentsOf(fo), pad = (fo.look.thickness ?? Math.max(2, Math.round(fo.look.size * 0.08))) / 2;
    return fo.look.kind === "ball" && Math.abs(half.halfW - half.halfH) < 0.5 ? { circle: { x: fo.x, y: fo.y, r: half.halfW }, pad } : { box: { left: fo.x - half.halfW, right: fo.x + half.halfW, top: fo.y - half.halfH, bottom: fo.y + half.halfH }, pad };
  };
  for (const so of (scene.objects ?? [])) {
    const holdsOf = (so.segments ?? []).filter((g): g is Extract<typeof g, { mode: "held" }> => g.mode === "held");
    if (!holdsOf.length) continue;
    let worst = 0, worstOver = -Infinity, lim = CONTACT_GAP_PX, at: number | undefined, who0 = holdsOf[0].character;
    for (const g of holdsOf) {
      // (AN EMPTY HOLD IS NO HOLD, Oct 15 T2: a zero-long hold — a switch to one hand at the very moment the hold starts — is only
      // the thing's starting place; the hold that starts with it is the one drawn on that picture.)
      if (g.to - g.from < 1e-6 && holdsOf.some((o) => o !== g && o.from <= g.from + 1e-6 && o.to > g.from)) continue;
      const gl = declared(g.character, g.joint, g.from, g.to) ? CONTACT_GAP_PX : Math.max(CONTACT_GAP_PX, LEGACY_HOLD_GAP * H);
      const f0 = Math.max(0, Math.ceil(g.from * fps)), f1 = Math.min(last, Math.floor(g.to * fps));
      for (let i = f0; i <= f1; i += 1) {
        const fo = built.objects[i]?.find((x) => x.id === so.id), fc = frames[i]?.find((c) => c.id === g.character);
        if (!fo || !fc) continue;
        const o = objOutline(fo, i), gL = outlineGap(o, fc.skeleton.lHand), gR = outlineGap(o, fc.skeleton.rHand);
        const d = g.joint === "hands" ? Math.max(gL, gR) : g.joint === "lHand" ? gL : g.joint === "rHand" ? gR : Math.min(gL, gR);
        if (d - gl > worstOver) { worstOver = d - gl; worst = d; lim = gl; at = i / fps; who0 = g.character; }
      }
    }
    out.push({ law: "held", ok: worst <= lim, value: r1(worst), limit: r1(lim), at, who: who0, say: worst <= lim ? `The ${so.name ?? so.id} stays in the hand of whoever holds it.` : `The ${so.name ?? so.id} is ${px(worst)} away from ${who(who0)}'s hand at ${sec(at ?? 0)} while held: a held thing touches the palm (within ${CONTACT_GAP_PX} px of its drawn edge).` });
  }
  // (a held PROP rides its joint: the hand's real gap to what the page draws for it, on every picture of the hold)
  for (const e of props) {
    const h = heldAnchor(e);
    if (!h) continue;
    const gl = /Hand$/.test(h.joint) && declared(h.character, h.joint, e.start, e.end) ? CONTACT_GAP_PX : Math.max(CONTACT_GAP_PX, LEGACY_HOLD_GAP * H);
    let worst = 0, at = e.start;
    if (/Hand$/.test(h.joint)) for (let i = Math.max(0, Math.ceil(e.start * fps)); i <= Math.min(last, Math.floor(Math.min(e.end, scene.durationSec) * fps)); i += 1) {
      const fc = frames[i]?.find((c) => c.id === h.character); if (!fc) continue;
      const o = worldOutline(built, i, [String(e.params?.scriptId ?? ""), String(e.params?.name ?? ""), (e as { id?: string }).id]) ?? (() => { const bx = drawnBox(e, i); return bx ? { box: bx } : null; })();
      if (!o) continue;
      const d = outlineGap(o, (fc.skeleton as unknown as Record<string, { x: number; y: number }>)[h.joint]);
      if (d > worst) { worst = d; at = i / fps; }
    }
    out.push({ law: "held", ok: worst <= gl, value: r1(worst), limit: r1(gl), at, who: h.character, say: worst <= gl ? `The ${thingName(e)} rides ${who(h.character)}'s hand from ${sec(e.start)}.` : `The ${thingName(e)} is drawn ${px(worst)} away from ${who(h.character)}'s hand at ${sec(at)} while held: a held thing touches the palm.` });
  }

  // 4. ONE COPY: at any time at most one visible track per thing
  const byKey = new Map<string, EffectTrack[]>();
  for (const e of props) { const k = thingKey(e); byKey.set(k, [...(byKey.get(k) ?? []), e]); }
  for (const [, list] of byKey) {
    let worst = 0, at: number | undefined;
    for (let i = 0; i < list.length; i += 1) for (let j = i + 1; j < list.length; j += 1) {
      const a = list[i], b = list[j];
      // (two knights each holding a sword are two swords: copies in two DIFFERENT figures' hands are not one thing twice)
      const ha = (a.anchor as { character?: string }).character, hb = (b.anchor as { character?: string }).character;
      if (ha && hb && ha !== hb) continue;
      // (a bucket in EACH hand: two copies in two different hands of one figure are two things too — Oct 15 "carries a bucket in each hand")
      const ja = (a.anchor as { joint?: string }).joint, jb = (b.anchor as { joint?: string }).joint;
      if (ha && hb && ja && jb && ja !== jb && /Hand$/.test(ja) && /Hand$/.test(jb)) continue;
      // (two balloons, two buildings, two flower pots STANDING at different spots are two things — a copy is the same thing in a hand
      // and on a table at once, or two at one spot; Oct 12: same-named props side by side were called duplicates)
      const fa = fixedAnchor(a), fb = fixedAnchor(b);
      if (fa && fb && Math.hypot(fa.x - fb.x, fa.y - fb.y) > 0.3 * H) continue;
      // (in a story told in shots, a thing belongs to its own shot: it is gone at the next cut — never "two copies" with the next shot's)
      const shotEnd = (st: number) => { const nx = (built.camera?.cuts ?? []).map((cf0) => cf0 / fps).filter((c) => c > st + 1e-6).sort((x, y) => x - y)[0]; return nx ?? Infinity; };
      const overlap = Math.min(a.end, b.end, scene.durationSec, shotEnd(a.start), shotEnd(b.start)) - Math.max(a.start, b.start);
      if (overlap > 1 / fps && overlap > worst) { worst = overlap; at = Math.max(a.start, b.start); }
    }
    out.push({ law: "oneCopy", ok: worst === 0, value: r2(worst), limit: 0, at, say: worst === 0 ? `There is one ${thingName(list[0])} at a time.` : `There are two ${thingName(list[0])}s on the page at once for ${sec(worst)} (from ${sec(at ?? 0)}).` });
  }

  // 5. NOTHING FLOATS / PLACED: every standing thing's bottom is on the ground or on a top (± 0.02H), inside that top's width
  const boxes = props.flatMap((e) => { const a = fixedAnchor(e); const b = a ? propBox(plan, e) : null; return a && b ? [{ e, a, box: b }] : []; });
  const restsOn = (bottom: number, x: number, start: number, end: number, self: EffectTrack | null) => {
    if (Math.abs(bottom - G) <= REST_TOL * H) return "the ground";
    for (const s of boxes) {
      if (s.e === self || s.e.end <= start || s.e.start >= end) continue;
      if (x >= s.box.left - 1 && x <= s.box.right + 1 && bottom >= s.box.top - REST_TOL * H && bottom <= s.box.bottom - 1) return `the ${thingName(s.e)}`;
    }
    return null;
  };
  // (SCENERY RESTS ON SOMETHING — moves/tumbleScene.ts: a rock / ledge on a wall or down in a pit must touch the pit's wall or the
  // floor under it, as DRAWN — after the engine's own attaching (restScenery), so what the law sees is what the page shows.)
  const rested = restScenery(plan as never) as unknown as DirectedPlan;
  for (const [i, e] of (rested.effects ?? []).entries()) {
    const r = sceneryRest(rested as never, e);
    if (!r || r.touches) continue;
    const own = (plan.effects ?? [])[i] ?? e;
    if (hangsOnBackWall(plan as never, own, !!r.pit)) continue; // (a window / poster / chalkboard hangs on the room's back wall: laws/backWall.ts)
    out.push({ law: "floats", ok: false, value: r1(Number.isFinite(r.gap) ? r.gap : H), limit: r1(SCENERY_REACH * H), at: own.start, say: `The ${thingName(own)} floats in the air on the wall side: it touches no wall and stands on nothing — put it against a cliff / pit wall or on the ground.` });
  }
  for (const { e, a, box } of boxes) {
    if (e.params?.onWall || e.params?.hangs || e.params?.onWater === true) continue; // (a thing floating on the water rests on it: plan.ts floatsOnWater)
    // (THE LAW SEES WHAT IS DRAWN — moves/transform.ts drawProp: a thing that FLIES (a kite, a bird, a balloon, the moon… or
    // "flies": true) is up there on purpose, and a thing built from parts that is off the floor is drawn HANGING on a chain;
    // neither floats. Oct 12: a flying kite was called "floating".)
    if (e.params?.flies === true || /bird|balloon|kite|plane|cloud|drone|ufo|ghost|butterfly|bee|star|moon|sun|planet|rocket|spaceship|fly|float|hover/i.test(String(e.params?.symbol ?? ""))) continue;
    if (Array.isArray(e.params?.parts) && e.params?.hangs !== false) continue;
    // (Phase C2, PM: measured at the thing's BOTTOM — a catalog mug's anchor is its middle, so the anchor said "floats 231 px" for a mug sitting on the table)
    const bottomY = Number.isFinite(box.bottom) ? box.bottom : a.y;
    const on = restsOn(bottomY, a.x, e.start, e.end, e);
    const gap = Math.abs(bottomY - G);
    out.push({ law: "floats", ok: on !== null, value: r1(gap), limit: r1(REST_TOL * H), at: e.start, say: on ? `The ${thingName(e)} stands on ${on}.` : `The ${thingName(e)} floats ${px(gap)} above the ground from ${sec(e.start)}: nothing holds it up.` });
  }
  for (const o of plan.objects ?? []) {
    if (o.heldBy || !o.keys?.length) continue;
    // (a thing that FLIES on its path — a kite, a balloon, a bird, "flies": true — is up there on purpose: Oct 14)
    if ((o as { flies?: unknown }).flies === true || /kite|balloon|bird|plane|drone|butterfly|bee|bubble|leaf|feather/i.test(`${o.name ?? ""} ${o.id}`)) continue;
    for (const k of [o.keys[0], o.keys[o.keys.length - 1]]) {
      const bottom = k.y + o.look.size / 2;
      // (a thing whose keys end IN A HAND — picked up and kept — rests in that hand: measured on the last frame against every hand)
      const lastFrame = frames[last] ?? [], fo = built.objects[last]?.find((x) => x.id === o.id);
      const holder = k === o.keys[o.keys.length - 1] && fo ? lastFrame.find((c) => Math.min(dist(fo, c.skeleton.lHand), dist(fo, c.skeleton.rHand)) <= HELD_TOL * H + o.look.size / 2) : undefined;
      const on = holder ? `${who(holder.id)}'s hand` : restsOn(bottom, k.x, k.t, k.t + 1 / fps, null);
      out.push({ law: "floats", ok: on !== null, value: r1(Math.abs(bottom - G)), limit: r1(REST_TOL * H), at: k.t, say: on ? `The ${o.name ?? o.id} rests on ${on} at ${sec(k.t)}.` : `The ${o.name ?? o.id} floats at ${sec(k.t)}: nothing holds it up.` });
      if (o.keys.length === 1) break;
    }
  }

  // 6. IN FRONT: figures are drawn in front of standing things; a thing in the hand is in front
  for (const e of props) {
    // (a worn thing — a crown, a chef's hat — rides the head on the "top" layer: in front too)
    // (HIDING: a standing thing in front is right when a figure is said to be BEHIND something — `depth: "behind"` — a bush, a wall)
    const hiding = plan.characters.some((c) => (c as { depth?: unknown }).depth === "behind" || c.actions.some((a) => (a as { depth?: unknown }).depth === "behind"));
    // (NEAR-SIDE LIMBS IN FRONT, Arthur Oct 15: a thing on a FOOT — a board ridden, a thing stood on — may sit behind the rider so
    // the feet on it read in front; autoEffects.ts draws a ride's board on the back layer)
    const onFoot = /Foot$/.test(heldAnchor(e)?.joint ?? "");
    const held = Boolean(heldAnchor(e)), want = held ? "front" : "back", layer = e.layer ?? "back", ok = held ? layer === "front" || layer === "top" || (onFoot && layer === "back") : layer === want || (hiding && layer === "front");
    out.push({ law: "inFront", ok, value: ok ? 0 : 1, limit: 0, at: e.start, say: ok ? (held ? `The ${thingName(e)} is in front of the hand.` : `The figure is drawn in front of the ${thingName(e)}.`) : held ? `The ${thingName(e)} hides behind the hand that holds it.` : `The ${thingName(e)} is drawn over the figure; it should be behind.` });
  }

  // 7. NO STATUE: no figure still longer than 1.2 s WHILE THE SCENE GOES ON (someone or something else moves meanwhile; a quiet
  // moment where nothing moves — the sit at the end, the last hold — is not a statue)
  const sceneGoesOn = (me: string, i: number, j: number) => {
    for (const other of plan.characters) {
      if (other.id === me) continue;
      const of = charFrames(other.id), base = of[i]?.skeleton;
      if (!base) continue;
      for (let k = i + 1; k <= j; k += 1) { const sk = of[k]?.skeleton; if (sk && JOINTS.some((jn) => dist(sk[jn], base[jn]) > STILL_TOL * H)) return true; }
    }
    const o0 = built.objects[i] ?? [];
    for (let k = i + 1; k <= j; k += 1) for (const o of built.objects[k] ?? []) { const b = o0.find((x) => x.id === o.id); if (b && dist(o, b) > STILL_TOL * H) return true; }
    return false;
  };
  // (a statue is a STANDING figure frozen: a figure sitting or kneeling still is holding a pose it was asked for; and a figure whose own
  // beats are over — its last key has passed — may rest while the story ends for the others: "ends with the story" is the length law)
  for (const c of plan.characters) {
    const mine = charFrames(c.id);
    const keys = scene.characters.find((s) => s.id === c.id)?.keys ?? [];
    const storyOver = keys.length ? keys[keys.length - 1].t : scene.durationSec;
    let worst = 0, at: number | undefined, i = 0;
    while (i < n) {
      const base = mine[i]?.skeleton;
      if (!base) { i += 1; continue; }
      let j = i;
      while (j + 1 < n) { const sk = mine[j + 1]?.skeleton; if (!sk || JOINTS.some((jn) => dist(sk[jn], base[jn]) > STILL_TOL * H)) break; j += 1; }
      const span = (j - i) / fps, standing = base.hip.y < G - 0.4 * H, inStory = i / fps < storyOver - 1 / fps;
      if (span > STATUE_SEC && span > worst && standing && inStory && sceneGoesOn(c.id, i, j)) { worst = span; at = i / fps; }
      i = j + 1;
    }
    out.push({ law: "statue", ok: worst <= STATUE_SEC, value: r2(worst), limit: STATUE_SEC, at, who: c.id, say: worst <= STATUE_SEC ? `${who(c.id)} keeps moving.` : `${who(c.id)} stands frozen like a statue for ${sec(worst)} at ${sec(at ?? 0)} while the scene goes on.` });
  }

  // 7b. NOBODY MOVES IN PERFECT SYNC (laws/inSync.ts, Arthur Oct 14): two figures whose joints move as copies (or mirror copies)
  // for more than a second — walking, running, waving, pulling in lockstep — are not people.
  for (let p = 0; p < plan.characters.length; p += 1) for (let q = p + 1; q < plan.characters.length; q += 1) {
    const A = plan.characters[p], B = plan.characters[q];
    const span = inSyncSpan(charFrames(A.id).map((f) => f?.skeleton), charFrames(B.id).map((f) => f?.skeleton), fps, H);
    const ok = span.seconds <= IN_SYNC_SEC;
    out.push({ law: "inSync", ok, value: r2(span.seconds), limit: IN_SYNC_SEC, at: ok ? undefined : r2(span.at), who: A.id, say: ok ? `${who(A.id)} and ${who(B.id)} each move in their own way.` : `${who(A.id)} and ${who(B.id)} move as exact copies for ${sec(span.seconds)} at ${sec(span.at)}: nobody moves in perfect sync — give each its own start, tempo and strength.` });
  }

  // 8. PACE: a walk covers its distance at 1.2–2.2 steps a second (footfalls over each travel span)
  for (const c of plan.characters) {
    const moves = c.actions.map((a) => a.move);
    if (!moves.includes("walk") || moves.some((m) => m === "run" || m === "jog")) continue;
    const mine = charFrames(c.id);
    // (a FOLLOW camera keeps a walker near the middle of the page: travel is measured in the WORLD — the camera's slide undone)
    const camX = (i: number) => built.camera?.shake?.[i]?.x ?? 0;
    const moving = mine.map((f, i) => Boolean(f && i > 0 && mine[i - 1] && Math.abs((f.skeleton.hip.x - camX(i)) - (mine[i - 1]!.skeleton.hip.x - camX(i - 1))) > 0.004 * H));
    // (travel spans: frames where the hips move sideways; a pause shorter than 0.3 s inside a walk does not split it; only a real walk
    // — at least 1 s and half a figure's height of ground — is measured, never a shuffle onto a seat)
    const spans: [number, number][] = [];
    let i = 0;
    while (i < n) {
      if (!moving[i]) { i += 1; continue; }
      let j = i;
      while (j + 1 < n && moving[j + 1]) j += 1;
      const prev = spans[spans.length - 1];
      if (prev && i - prev[1] <= 0.3 * fps) prev[1] = j; else spans.push([i, j]);
      i = j + 1;
    }
    for (const [i, j] of spans) {
      const seconds = (j - i + 1) / fps;
      const ground = Math.abs(((mine[j]?.skeleton.hip.x ?? 0) - camX(j)) - ((mine[i]?.skeleton.hip.x ?? 0) - camX(i)));
      if (seconds >= TRAVEL_MIN_SEC && ground >= 0.5 * H) {
        // (steps counted in the WORLD too: a planted foot slides on the page while the camera follows)
        const world = (sk: NonNullable<(typeof mine)[number]>["skeleton"] | undefined, k: number) => sk && camX(k) !== 0 ? Object.fromEntries(Object.entries(sk).map(([jn, pt]) => [jn, { x: (pt as { x: number; y: number }).x - camX(k), y: (pt as { x: number; y: number }).y }])) as typeof sk : sk;
        const steps = footfalls(mine.slice(i, j + 2).map((f, k) => world(f?.skeleton, i + k)), G, H).length;
        const rate = steps / seconds, ok = (rate >= PACE_MIN || false) && (rate <= PACE_MAX || FAST_WORDS.test(ctx.words ?? ""));
        out.push({ law: "pace", ok, value: r2(rate), limit: PACE_MAX, at: r2(i / fps), who: c.id, say: ok ? `${who(c.id)} walks at a normal pace (${r1(rate)} steps a second).` : `${who(c.id)}'s walk at ${sec(i / fps)} is ${rate < PACE_MIN ? "too slow" : "too fast"}: ${r1(rate)} steps a second (should be ${PACE_MIN}–${PACE_MAX}).` });
      }
    }
  }

  // 8b. NO DOING NOTHING (Arthur, Oct 12: "the in-betweens should not be a lot of standing and doing nothing… fight scenes, more
  // punching; a hike, more walking"). The breathing the engine adds to a wait hides it from the statue law, so this law looks at
  // the BIG motion: a standing figure whose joints all stay within IDLE_TOL of where they were (only breathing, a weight shift) is
  // doing nothing. At most IDLE_SEC of that (IDLE_FIGHT_SEC in a fight) while the scene goes on — unless the words ask for waiting.
  {
    const IDLE_TOL = 0.06, IDLE_SEC = 1.5, IDLE_FIGHT_SEC = 1.4, IDLE_POWER_SEC = 2.6;
    const askedToWait = /\b(wait|waits|waiting|watch|watches|watching|rest|rests|resting|stand(s|ing)? still|pause|pauses|idle|freeze|frozen|breath|listen|listens|talk|talks|talking|chat|look(s|ing)? at|stare|stares|admire|admires|think|thinks|sleep|sleeps|guard(s|ing)?)\b/i.test(ctx.words ?? "");
    const fighting = plan.characters.some((c) => c.actions.some((a) => /punch|kick|getHit|block|sword|dashSlash|barrage|guard/.test(a.move)));
    const limit = fighting ? IDLE_FIGHT_SEC : IDLE_SEC;
    for (const c of askedToWait ? [] : plan.characters) {
      const mine = charFrames(c.id);
      const keys = scene.characters.find((s) => s.id === c.id)?.keys ?? [];
      const storyOver = keys.length ? keys[keys.length - 1].t : scene.durationSec;
      // (a power is cast from a held pose — aiming, charging, holding a shield — so a figure with powers may hold longer)
      const lim = c.actions.some((a) => /fireBlast|waterShield|teleport|iceMountain|iceThrow|laserEyes|iceBlast|waterBlast/.test(a.move)) ? IDLE_POWER_SEC : limit;
      let worst = 0, at: number | undefined, i = 0;
      while (i < n) {
        const base = mine[i]?.skeleton;
        if (!base) { i += 1; continue; }
        let j = i;
        while (j + 1 < n) { const sk = mine[j + 1]?.skeleton; if (!sk || JOINTS.some((jn) => dist(sk[jn], base[jn]) > IDLE_TOL * H)) break; j += 1; }
        const span = (j - i) / fps, standing = base.hip.y < G - 0.4 * H, inStory = i / fps < storyOver - 1 / fps && i / fps > 0.3;
        if (span > lim && span > worst && standing && inStory) { worst = span; at = i / fps; }
        i = j + 1;
      }
      out.push({ law: "idle", ok: worst <= lim, value: r2(worst), limit: lim, at, who: c.id, say: worst <= lim ? `${who(c.id)} keeps doing something.` : `${who(c.id)} stands around doing nothing for ${sec(worst)} at ${sec(at ?? 0)} (at most ${sec(lim)}${fighting ? " in a fight" : ""}): fill the in-between with real action that fits the scene — ${fighting ? "more punches, blocks, dodges, circling" : "keep walking, working, playing"} — not standing, unless the user asked for waiting.` });
    }
  }

  // 9. LENGTH ≤ 15 s unless asked
  const cutList = (plan as unknown as { cuts?: unknown }).cuts, shots = 1 + (Array.isArray(cutList) ? cutList.length : 0);
  const limitSec = Math.max(MAX_CLIP_SECONDS, SCENE_SECONDS * shots, ctx.askedSec ? ctx.askedSec + 2 : 0);
  out.push({ law: "length", ok: scene.durationSec <= limitSec, value: r2(scene.durationSec), limit: limitSec, say: scene.durationSec <= limitSec ? `It lasts ${sec(scene.durationSec)}.` : `It lasts ${sec(scene.durationSec)}: longer than ${limitSec} seconds.` });

  // 10. ON THE PAGE: everything built is inside the page (never shifted or zoomed after the fact)
  const b = animationBounds(frames, built.objects as FrameObject[][], effectFitBounds(scene));
  if (Number.isFinite(b.left) && Number.isFinite(b.right)) {
    const over = Math.max(0, -b.left, b.right - ctx.stageWidth);
    out.push({ law: "onPage", ok: over <= PAGE_TOL, value: r1(over), limit: PAGE_TOL, say: over <= PAGE_TOL ? "Everything stays on the page." : `Part of it is ${px(over)} off the page.` });
  } else out.push({ law: "onPage", ok: false, value: 0, limit: PAGE_TOL, say: "Nothing was drawn." });

  // 12. ARTHUR'S HARD LAWS (Sun 2026-10-11 11:15 — "as hard as a rock"; gate laws, measured on what the page draws)
  const allTracks = (((scene as Scene & { effects?: EffectTrack[] }).effects ?? plan.effects ?? []) as EffectTrack[]);
  const asked = (plan.characters ?? []).some((c) => c.actions.some((a) => /teleport/i.test(a.move))) || allTracks.some((e) => /teleport/i.test(e.kind));
  const frameSec = 1 / fps;
  // H1 NOTHING FLASHES: a drawn thing or effect on the page for ≤ 2 pictures (a dot, a star, a broken frame) — unless it flies very fast
  {
    let worst = 0, what = "", at = 0;
    // (one thing = all its tracks back to back: a chest's ten lid steps are ONE chest on the page, not ten flashes)
    const spansOf = new Map<string, { s: number; e: number; t: EffectTrack }[]>();
    for (const e of [...allTracks].sort((a, b2) => a.start - b2.start)) {
      const k = e.kind === "prop" ? thingKey(e) : `${e.kind}:${JSON.stringify(e.anchor)}`, list = spansOf.get(k) ?? [];
      const last = list[list.length - 1], end = Math.min(e.end, scene.durationSec);
      if (last && e.start <= last.e + 1.5 * frameSec) last.e = Math.max(last.e, end); else list.push({ s: e.start, e: end, t: e });
      spansOf.set(k, list);
    }
    for (const list of spansOf.values()) for (const sp of list) { const d = sp.e - sp.s; if (d > 0 && d <= 2 * frameSec + 1e-6 && !(sp.t.params as { fast?: boolean } | undefined)?.fast) { const frames2 = Math.max(1, Math.round(d * fps)); if (!worst || frames2 < worst) { worst = frames2; what = thingName(sp.t); at = sp.s; } } }
    for (const so of scene.objects ?? []) {
      const seen = built.objects.map((fo) => (fo ?? []).some((o) => o.id === so.id));
      let i = 0; while (i < n) { if (!seen[i]) { i += 1; continue; } let j = i; while (j + 1 < n && seen[j + 1]) j += 1; if (j - i + 1 <= 2 && n > 3) { worst = worst || j - i + 1; what = what || (so.name ?? so.id); at = at || i / fps; } i = j + 1; }
    }
    out.push({ law: "flash", ok: !worst, value: worst, limit: 0, at, say: !worst ? "Nothing flashes on for a picture or two." : `The ${what} shows up for only ${worst} picture${worst > 1 ? "s" : ""} at ${sec(at)}: nothing may flash on and off.` });
  }
  // H2 NO TELEPORT: nothing pops into a hand or jumps across the page (unless the user asked for a teleport)
  {
    const fails: string[] = []; let at: number | undefined;
    if (!asked) {
      for (const e of allTracks) {
        if (e.kind !== "prop" || e.start <= frameSec) continue;
        // (a hand-over is not a teleport: the same thing just before it, or ANY track riding a figure's hand that ends right then — the
        // engine draws a held thing as its own kind of track — a mug put down comes out of the hand)
        const k = thingKey(e), before = allTracks.some((o) => o !== e && Math.abs(o.end - e.start) <= 1.5 * frameSec && ((o.kind === "prop" && thingKey(o) === k) || "character" in (o.anchor as object)));
        const p = e.params as { grows?: boolean; found?: boolean; revealed?: boolean } | undefined;
        // (A FILM CUT starts a new shot: a thing there from the shot's first picture did not "appear from nowhere" — Oct 12 stories)
        const atCut = (built.camera?.cuts ?? []).some((cf0) => Math.abs(e.start - cf0 / fps) <= 2 * frameSec);
        if (!before && !atCut && !p?.grows && !p?.found && !p?.revealed) { fails.push(`the ${thingName(e)} appears from nowhere at ${sec(e.start)}`); at ??= e.start; }
      }
      for (const so of scene.objects ?? []) {
        // (a STRUCK BALL in flight — hitThings.ts ballFlight — moves fast on purpose, like a thrown one)
        const struck = (so as { struckFlight?: [number, number] }).struckFlight;
        const flights = [...(so.segments ?? []).filter((g) => g.mode === "flight"), ...(struck ? [{ from: struck[0], to: struck[1] }] : [])];
        for (let i = 1; i < n; i += 1) {
          const a = built.objects[i - 1]?.find((o) => o.id === so.id), b2 = built.objects[i]?.find((o) => o.id === so.id);
          if (!a || !b2) continue; const t = i / fps;
          // (already FLYING that fast the picture before, the same way — a hard throw in a later scene, whose flight times are the
          // scene's own — is fast motion, not a jump out of nowhere)
          const z = built.objects[i - 2]?.find((o) => o.id === so.id), moving = z ? (a.x - z.x) * (b2.x - a.x) + (a.y - z.y) * (b2.y - a.y) > 0.5 * Math.hypot(b2.x - a.x, b2.y - a.y) ** 2 : false;
          // (EVERY PICTURE, ~0.08 H — Oct 14 "nothing ever jumps": beyond what the hand carrying it moved, when it is in a hand)
          let rel = Math.hypot(b2.x - a.x, b2.y - a.y);
          for (const c0 of frames[i - 1] ?? []) for (const j of ["lHand", "rHand"] as const) {
            const h0 = c0.skeleton[j], h1 = (frames[i] ?? []).find((c1) => c1.id === c0.id)?.skeleton[j];
            if (h1 && Math.hypot(h0.x - a.x, h0.y - a.y) < 0.12 * H) rel = Math.min(rel, Math.hypot(b2.x - a.x - (h1.x - h0.x), b2.y - a.y - (h1.y - h0.y)));
          }
          if (rel > 0.08 * H && !moving && !flights.some((g) => t >= g.from - frameSec && t <= g.to + frameSec)) { fails.push(`the ${so.name ?? so.id} jumps ${px(rel)} in one picture at ${sec(t)}`); at ??= t; break; }
        }
      }
    }
    // (EVERY DRAWN THING, EVERY PICTURE — Arthur, Oct 14, a13 tug of war: the rope's knot jumped from Red's hand to Blue's when Red
    // let go, and nothing above saw it: the hand-over check only looks at hand↔rest changes. Each named thing's drawn BODY (its
    // string is not its body), whichever track draws it, may not move more than 0.08 H in one picture beyond what its own anchor
    // moved — unless it is already flying that way (fast motion keeps going). The glides (effects/index.ts thingGlides) are what
    // the page draws, so they are measured too.)
    if (!asked) {
      const glides = thingGlides(allTracks, built, H, G, ctx.stageWidth), cuts = built.camera?.cuts ?? [];
      const byKey = new Map<string, EffectTrack[]>();
      for (const e of allTracks) if ((e.kind === "prop" || e.kind === "heldWeapon") && (e.params?.scriptId ?? e.params?.name ?? e.params?.symbol) !== undefined) { const k = thingKey(e); byKey.set(k, [...(byKey.get(k) ?? []), e]); }
      for (const list of byKey.values()) {
        let prev: { p: { x: number; y: number }; e: EffectTrack; i: number; step?: { x: number; y: number } } | undefined;
        for (let i = 0; i < n; i += 1) {
          const t = i / fps, e = list.filter((o) => t >= o.start - 1e-9 && t <= o.end + 1e-9).sort((a2, b2) => b2.start - a2.start)[0];
          const b0 = e ? trackBodyAt(e, built, i, H, G, ctx.stageWidth) : undefined;
          if (!e || !b0) { prev = undefined; continue; }
          const g = glideOffset(glides.get(e), t), p = { x: b0.x + g.x, y: b0.y + g.y };
          if (!prev || prev.i !== i - 1) { prev = { p, e, i }; continue; }
          let ax = 0, ay = 0; // (what its own anchor moved: a held thing goes where the hand goes)
          if (prev.e === e) { const a0 = anchorAt(e.anchor, frames[i - 1] ?? [], built.objects[i - 1] ?? []), a1 = anchorAt(e.anchor, frames[i] ?? [], built.objects[i] ?? []); if (a0 && a1) { ax = a1.x - a0.x; ay = a1.y - a0.y; } }
          const step = { x: p.x - prev.p.x, y: p.y - prev.p.y }, jump = Math.hypot(step.x - ax, step.y - ay);
          const moving = prev.step ? prev.step.x * step.x + prev.step.y * step.y > 0.5 * Math.hypot(step.x, step.y) ** 2 : false;
          // (a held thing SWUNG by a fast hand — a sword strike — turns with the forearm: that is the hand's motion, not a jump)
          const swung = prev.e === e && "character" in e.anchor && Math.hypot(ax, ay) > 0.03 * H;
          // (SET GOING — a punched bag, a kicked can: it starts fast and KEEPS GOING that way the next picture; a teleport lands and stays)
          const goes = () => { if (i + 1 >= n || (t + 1 / fps) > e.end + 1e-9) return false; const q0 = trackBodyAt(e, built, i + 1, H, G, ctx.stageWidth); if (!q0) return false; const g1 = glideOffset(glides.get(e), t + 1 / fps), nx = q0.x + g1.x - p.x, ny = q0.y + g1.y - p.y; return nx * step.x + ny * step.y > 0.3 * Math.hypot(step.x, step.y) ** 2; };
          if (jump > 0.08 * H && !moving && !swung && !cuts.some((cf) => Math.abs(cf - i) <= 1) && !goes()) { fails.push(`the ${thingName(e)} jumps ${px(jump)} in one picture at ${sec(t)}`); at ??= t; break; }
          prev = { p, e, i, step };
        }
      }
    }
    // (Bench 1: a HAND-OVER must not jump — at each rest→hand and hand→rest change of one thing, the DRAWN picture's center moves
    // ≤ 0.03H between the two pictures; EN found 54 px at a grab and 237 px at a put-down that the old law let through)
    const handGlides = asked ? new Map() : thingGlides(allTracks, built, H, G, ctx.stageWidth);
    if (!asked) for (const e of allTracks) {
      if (e.kind !== "prop" && e.kind !== "heldWeapon") continue;
      const prev = allTracks.find((o) => o !== e && Math.abs(o.end - e.start) <= 1.5 * frameSec && (o.kind === "prop" || o.kind === "heldWeapon") && (("character" in (o.anchor as object)) !== ("character" in (e.anchor as object))) && (thingKey(o) === thingKey(e) || o.kind !== e.kind));
      // (a change the page GLIDES — effects/index.ts thingGlides — is measured picture by picture, as drawn, by the check above)
      if (!prev || handGlides.has(e)) continue;
      const fa = Math.max(0, Math.min(last, Math.floor(prev.end * fps))), fb = Math.max(0, Math.min(last, Math.ceil(e.start * fps)));
      const ba = drawnBox(prev, fa), bb = drawnBox(e, fb);
      if (!ba || !bb) continue;
      const jump = Math.hypot((ba.left + ba.right) / 2 - (bb.left + bb.right) / 2, (ba.top + ba.bottom) / 2 - (bb.top + bb.bottom) / 2);
      if (jump > 0.03 * H) { fails.push(`the ${thingName(e)} jumps ${px(jump)} as it changes hands at ${sec(e.start)}`); at ??= e.start; }
    }
    out.push({ law: "teleport", ok: !fails.length, value: fails.length, limit: 0, at, say: !fails.length ? (asked ? "A teleport was asked for." : "Nothing teleports.") : `${fails[0]}${fails.length > 1 ? ` (+${fails.length - 1} more)` : ""}: nothing teleports unless you ask.` });
  }
  // H3 EVERYTHING IS ANIMATED: a thing that changes shape (a lid opens) goes through in-between states — two states with a pop between them fail
  {
    const byThing = new Map<string, EffectTrack[]>();
    for (const e of allTracks) if (e.kind === "prop") { const k = thingKey(e); byThing.set(k, [...(byThing.get(k) ?? []), e]); }
    let bad = "", at: number | undefined;
    for (const [, list] of byThing) {
      const shapes = list.filter((e) => Array.isArray((e.params as { parts?: unknown } | undefined)?.parts)).sort((a, b2) => a.start - b2.start);
      const changes = shapes.filter((e, i) => i > 0 && JSON.stringify((e.params as { parts?: unknown }).parts) !== JSON.stringify((shapes[i - 1].params as { parts?: unknown }).parts));
      if (changes.length === 1 && shapes.length === 2) { bad = `the ${thingName(shapes[1])} changes in one picture at ${sec(shapes[1].start)}`; at = shapes[1].start; }
    }
    out.push({ law: "animated", ok: !bad, value: bad ? 1 : 0, limit: 0, at, say: !bad ? "Every change is animated." : `${bad}: every change must move through in-between states.` });
  }
  // H4 NEVER CUT OFF: a background piece or a thing half outside the page (a full-width ground or sky is fine)
  {
    const W2 = ctx.stageWidth, cut: string[] = [];
    const WB = (scene as Scene & { backgroundWidth?: number }).backgroundWidth ?? W2; // (a follow camera's world is wider)
    for (const piece of (scene as Scene & { background?: { pieces?: { kind: string; params?: Record<string, unknown> }[] } }).background?.pieces ?? []) {
      const x = piece.params?.x, w = piece.params?.w;
      if (typeof x !== "number" || typeof w !== "number" || w >= 0.9 * WB) continue;
      const l = x - w / 2, r = x + w / 2;
      if ((l < -PAGE_TOL && r > 0) || (r > WB + PAGE_TOL && l < WB)) cut.push(`the ${piece.kind}`);
    }
    for (const e of allTracks) {
      if (e.kind !== "prop" || "character" in (e.anchor as object)) continue;
      try { const bx = propBox({ ...plan, effects: allTracks } as DirectedPlan, e); if (bx && ((bx.left < -PAGE_TOL && bx.right > 0) || (bx.right > W2 + PAGE_TOL && bx.left < W2))) cut.push(`the ${thingName(e)}`); } catch { /* a thing without a box */ }
    }
    out.push({ law: "cutOff", ok: !cut.length, value: cut.length, limit: 0, say: !cut.length ? "Nothing is cut off by the page edge." : `${[...new Set(cut)].join(", ")} ${cut.length > 1 ? "are" : "is"} cut off by the page edge.` });
  }

  // H5 NOTHING FLOATS (drawn): every thing that is not held or flying rests — its DRAWN bottom (the shapes the page draws) is on the
  // ground or on another thing's drawn top within 1 px — unless the place is outer space or the words say it hangs / flies.
  const place = String((plan as { place?: unknown }).place ?? "") + " " + ((scene as Scene & { background?: { pieces?: { kind: string }[] } }).background?.pieces ?? []).map((p) => p.kind).join(" ");
  const inSpace = /\b(space|stars?field|planet|orbit|moon ?surface)\b/i.test(place);
  // (onWall / hangs only count for a thing that CAN hang — a catalog mug is never on a wall: "onWall" on a resting mug hid it from the floats law)
  const canHang = (e: EffectTrack) => { const t = thingFor(e.params?.symbol ?? e.params?.name); return !t || t.attach === "hanging"; };
  // (THE LAW SEES WHAT IS DRAWN, as in "floats": a thing built from parts that is up off the floor is drawn hanging on its chain, and
  // "onWall" / "hangs" on a thing built from parts (a window, a banner, a scoreboard, traffic lights) is fixed up there — none floats)
  const fromParts = (e: EffectTrack) => Array.isArray(e.params?.parts) && (e.params?.parts as unknown[]).length > 0;
  const fixedTracks = allTracks.filter((e) => e.kind === "prop" && fixedAnchor(e) && !((e.params?.onWall || e.params?.hangs) && (canHang(e) || fromParts(e))) && !(fromParts(e) && e.params?.hangs !== false) && !e.params?.flies && !e.params?.fast);
  const drawnOf = (e: EffectTrack, i: number) => { const bx = drawnBox(e, i); return bx ?? (() => { const b = propBox({ ...plan, effects: allTracks } as DirectedPlan, e); return b ? { left: b.left, right: b.right, top: b.top, bottom: b.bottom } : null; })(); };
  {
    let worst = 0, what = "", at: number | undefined, checked = 0;
    if (!inSpace) for (const e of fixedTracks) {
      const i = Math.min(last, Math.max(0, Math.ceil(e.start * fps)));
      if (i / fps > Math.min(e.end, scene.durationSec) + 1e-6) continue;
      const me = drawnOf(e, i); if (!me) continue; checked += 1;
      const cx = (me.left + me.right) / 2;
      let gap = Math.abs(me.bottom - G);
      for (const o of fixedTracks) {
        if (o === e || o.end < i / fps - 1e-6 || o.start > i / fps + 1e-6 || thingKey(o) === thingKey(e)) continue;
        const ob = drawnOf(o, i); if (!ob || cx < ob.left - 1 || cx > ob.right + 1) continue;
        gap = Math.min(gap, Math.abs(me.bottom - ob.top));
      }
      if (gap > REST_GAP_PX && gap > worst) { worst = gap; what = thingName(e); at = e.start; }
    }
    out.push({ law: "rests", ok: worst <= REST_GAP_PX, value: r1(worst), limit: REST_GAP_PX, at, say: worst <= REST_GAP_PX ? (inSpace ? "Out in space things may float." : `Every thing rests on the ground or on another thing (${checked} checked).`) : `The ${what} floats ${px(worst)} above what should hold it up at ${sec(at ?? 0)}: nothing floats.` });
  }
  // H6 NOTHING DUPLICATES: one of each thing on every picture — counting EVERY drawn kind (a standing prop, a thing in a hand drawn as
  // "heldWeapon", a flying object) by its THING (the catalog thing it is) — unless the script itself has two of it.
  {
    const idOf = (name: unknown) => { const w = String(name ?? ""); return thingFor(w)?.id ?? w.toLowerCase().replace(/[^a-z]/g, ""); };
    const asked2 = new Map<string, number>();
    for (const o of plan.objects ?? []) asked2.set(idOf(o.name ?? o.id), (asked2.get(idOf(o.name ?? o.id)) ?? 0) + 1);
    const scriptIds = new Map<string, Set<string>>();
    for (const e of allTracks) if (e.kind === "prop" && e.params?.scriptId) { const k = idOf(e.params?.symbol ?? e.params?.name); scriptIds.set(k, (scriptIds.get(k) ?? new Set()).add(String(e.params.scriptId))); }
    let worst = 0, what = "", at: number | undefined, frames2 = 0;
    for (let i = 0; i < n; i += 1) {
      const t = i / fps, seen = new Map<string, { x: number; y: number }[]>();
      const add = (k: string, p: { x: number; y: number } | undefined) => { if (k && p) seen.set(k, [...(seen.get(k) ?? []), p]); };
      for (const e of allTracks) {
        if (t < e.start - 1e-9 || t > e.end + 1e-9) continue;
        // (PM, Phase C3 real-Luna test: two knights each holding a sword are TWO swords, not a duplicate — a thing in a hand counts per HOLDER;
        // one holder with two copies of it, or a copy left behind, is the duplicate)
        const holder = (e.anchor as { character?: string }).character, hk = (k: string) => (holder ? `${k}@${holder}` : k);
        if (e.kind === "prop") add(hk(idOf(e.params?.symbol ?? e.params?.name ?? e.params?.scriptId)), anchorAt(e.anchor, frames[i] ?? [], built.objects[i] ?? []));
        else if (e.kind === "heldWeapon") add(hk(idOf(e.params?.weapon ?? e.params?.name)), anchorAt(e.anchor, frames[i] ?? [], built.objects[i] ?? []));
      }
      for (const fo of built.objects[i] ?? []) add(idOf((scene.objects ?? []).find((so) => so.id === fo.id)?.name ?? fo.id), fo);
      // (merge per THING: a copy in a hand + a copy left on the floor = two mugs; two knights each holding a sword = two holders, two swords)
      const merged = new Map<string, { list: { x: number; y: number }[]; holders: Set<string> }>();
      for (const [k0, list0] of seen) { const [b0, h0] = k0.split("@"); const m = merged.get(b0) ?? { list: [], holders: new Set<string>() }; m.list.push(...list0); if (h0) m.holders.add(h0); merged.set(b0, m); }
      for (const [k, { list, holders }] of merged) {
        // (the user's words ask for several — "cups", "glasses", "swords" — so several may stand on the page)
        const base = k.split("@")[0], words2 = `${ctx.words ?? ""} ${plan.title ?? ""}`.toLowerCase(), plural = base.length > 2 && new RegExp(`\\b${base}(e?s)\\b|\\b(two|three|four|five|several|some|pair of)\\b[^.]*\\b${base}`).test(words2);
        // (SCENERY the plan itself placed at different fixed spots — two flag poles at the fair's two ends, two lamps — is meant)
        const placed = new Set(allTracks.filter((e) => e.kind === "prop" && !(e.anchor as { character?: string }).character && typeof (e.anchor as { x?: number }).x === "number" && idOf(e.params?.symbol ?? e.params?.name ?? e.params?.scriptId) === base && t >= e.start - 1e-9 && t <= e.end + 1e-9).map((e) => Math.round((e.anchor as { x: number }).x / (0.3 * H)))).size;
        const allowed = Math.max(1, asked2.get(base) ?? 0, scriptIds.get(base)?.size ?? 0, plural ? 6 : 0, holders.size + placed);
        // (two copies on the very same spot for a hand-over picture are one thing on the page)
        const spots = list.filter((p, j) => list.findIndex((q) => dist(p, q) <= 0.02 * H) === j);
        if (spots.length > allowed) { frames2 += 1; if (spots.length > worst || !what) { worst = spots.length; what = k; at ??= t; } }
      }
    }
    out.push({ law: "oneThing", ok: frames2 === 0, value: frames2, limit: 0, at, say: frames2 === 0 ? "There is one of each thing on every picture." : `There are ${worst} ${what.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase()}s on the page at once in ${frames2} pictures (from ${sec(at ?? 0)}): nothing duplicates.` });
  }
  // H7 LONG ENOUGH: the scene lasts ≥ 2.5 s, every beat ≥ 0.6 s, every walk (≥ 1 H of ground) ≥ 1.5 s (a story squeezed into 1.1 s is an automatic fail).
  {
    const fails: string[] = [];
    if (scene.durationSec < MIN_SCENE_S - 1e-6) fails.push(`it lasts only ${sec(scene.durationSec)} (at least ${MIN_SCENE_S} s)`);
    // (a beat = one move of one figure: its marks "<who>.<move><n>.<mark>"; it lasts from the figure's previous beat's last mark to its own)
    const marks = Object.entries((scene as Scene & { marks?: Record<string, number> }).marks ?? {});
    for (const c of plan.characters) {
      const ends = new Map<string, number>();
      for (const [k, v] of marks) { const m = k.match(/^([^.]+)\.([A-Za-z]+\d+)\.(\w+)$/); if (m && m[1] === c.id && !/fast/.test(m[3]) && Number.isFinite(v)) ends.set(m[2], Math.max(ends.get(m[2]) ?? 0, v)); }
      // (back-to-back walk beats — the long walk and the last step up to the chair — are ONE walk: ≥ 1.5 s together)
      let prev = 0, walkFrom = -1, walkEnd = 0;
      // (a few steps to a spot — under 1 H of ground — is not a story walk; it may be quicker)
      const ground = (t0: number, t1: number) => { const cf = charFrames(c.id), a0 = cf[Math.min(last, Math.round(t0 * fps))]?.skeleton.hip, a1 = cf[Math.min(last, Math.round(t1 * fps))]?.skeleton.hip; return a0 && a1 ? Math.abs(a1.x - a0.x) : 0; };
      // (the ground a walk COVERS on the page or the ground it was PLANNED to cover — a walk on the spot squeezed into 1.1 s still fails)
      const walks = c.actions.filter((x) => x.move === "walk").map((x) => Math.abs(Number((x.params as { distance?: unknown } | undefined)?.distance) || 0));
      let planned = 0;
      const endWalk = () => { if (walkFrom >= 0 && walkEnd - walkFrom < MIN_WALK_S - 1e-6 && Math.max(planned, ground(walkFrom, walkEnd)) >= H) fails.push(`${who(c.id)}'s walk lasts only ${sec(walkEnd - walkFrom)} (from ${sec(walkFrom)})`); walkFrom = -1; planned = 0; };
      for (const [move, end] of [...ends].sort((a, b2) => a[1] - b2[1])) {
        const name = move.replace(/\d+$/, "");
        if (name === "walk") { if (walkFrom < 0) walkFrom = prev; walkEnd = end; planned += walks[Number(move.match(/\d+$/)?.[0] ?? 1) - 1] ?? 0; }
        // (PM: a STRIKE in a fight is fast on purpose — punch, kick, dash punch, block, slap — the 0.6 s minimum is for everyday beats)
        else { endWalk(); if (end - prev < MIN_BEAT_S - 1e-6 && end - prev > 1e-6 && name !== "custom" && !STRIKE_MOVES.test(name)) fails.push(`${who(c.id)}'s ${name} lasts only ${sec(end - prev)} (at ${sec(prev)})`); }
        prev = end;
      }
      endWalk();
    }
    out.push({ law: "longEnough", ok: !fails.length, value: fails.length, limit: 0, say: !fails.length ? `It is long enough for its story (${sec(scene.durationSec)}).` : `${fails[0]}${fails.length > 1 ? ` (+${fails.length - 1} more)` : ""}: too short — a story needs time (scene ≥ ${MIN_SCENE_S} s, beat ≥ ${MIN_BEAT_S} s, walk ≥ ${MIN_WALK_S} s).` });
  }
  // H8 HANDS DON'T LIE: a hand that is NOT holding a thing may not sit on it for ≥ 0.3 s (it looks like a two-hand hold when it is
  // one) — a ball truly held in two hands (both hands as near, the ball between them) is honest.
  {
    let worstRun = 0, what = "", whoF = "", at: number | undefined;
    // (the build says which hand holds: a one-hand hold ("lHand"/"rHand") with the OTHER hand within 0.02H of the thing's edge — or
    // inside its drawn box — is a fake two-hand hold; a "hands" hold is truly two-handed and honest)
    type Th = { x: number; y: number; r: number; box?: { left: number; right: number; top: number; bottom: number } };
    const gapTo = (th: Th, p: { x: number; y: number }) => th.box ? Math.hypot(Math.max(th.box.left - p.x, 0, p.x - th.box.right), Math.max(th.box.top - p.y, 0, p.y - th.box.bottom)) : Math.max(0, dist(th, p) - th.r);
    const check = (name: string, figure: string, f0: number, f1: number, at0: (i: number) => Th | undefined, holdJoint: "lHand" | "rHand") => {
      let run = 0, prevRel: { x: number; y: number } | null = null;
      for (let i = f0; i <= f1; i += 1) {
        const c = frames[i]?.find((x) => x.id === figure), th = at0(i);
        if (!c || !th) { run = 0; prevRel = null; continue; }
        const hand = holdJoint === "lHand" ? c.skeleton.rHand : c.skeleton.lHand;
        const free = gapTo(th, hand);
        // (PM: a FAKE hold is a free hand that MOVES WITH the thing — a swinging arm passing the spoon on a walk is not pretending to hold it)
        const rel = { x: hand.x - th.x, y: hand.y - th.y }, withIt = !prevRel || Math.hypot(rel.x - prevRel.x, rel.y - prevRel.y) <= FAKE_HOLD_WITH * H * (24 / fps);
        prevRel = rel;
        if (free <= CONTACT_GAP_PX && withIt) { // (ONE TRUTH, Oct 15: the free hand is ON the drawn thing — real gap ≤ 2 px — not "near" it)
          run += 1; if (run / fps > worstRun) { worstRun = run / fps; what = name; whoF = figure; at = (i - run + 1) / fps; } } else run = 0;
      }
    };
    for (const so of scene.objects ?? []) for (const g of (so.segments ?? [])) {
      if (g.mode !== "held" || g.joint === "hands") continue;
      check(so.name ?? so.id, g.character, Math.max(0, Math.ceil(g.from * fps)), Math.min(last, Math.floor(g.to * fps)), (i) => { const fo = built.objects[i]?.find((x) => x.id === so.id); return fo ? { x: fo.x, y: fo.y, r: so.look.size / 2 } : undefined; }, g.joint);
    }
    for (const e of allTracks) {
      const h = heldAnchor(e); if (!h || (e.kind !== "heldWeapon" && e.kind !== "prop")) continue;
      // (a sword, bat, axe, spear or staff is gripped with BOTH hands in a fight — that second hand is honest; so is any LONG thing
      // people hold in two hands: a rope, a leash, an oar, a broom, a shovel, a rake; and a thing PUSHED by both hands — moves/pushPlan.ts:
      // a wheelbarrow, cart, stroller, mower, box, crate — both hands are on its handles / side)
      if (/sword|katana|bat|axe|spear|staff|club|hammer|pole|rope|leash|chain|cable|reins|oar|paddle|broom|shovel|rake|mop|barrow|cart|trolley|stroller|pram|buggy|wagon|mower|wheelchair|\bbox|crate/i.test(String(e.params?.weapon ?? e.params?.symbol ?? e.params?.name ?? ""))) continue;
      if (h.joint !== "lHand" && h.joint !== "rHand") continue;
      // (EACH HAND ITS OWN THING — a coach's two pads, a torch in one hand and a shield in the other: the "free" hand holds its own
      // thing at the same time, so it is not pretending to hold this one)
      const otherJoint = h.joint === "lHand" ? "rHand" : "lHand";
      if (allTracks.some((o) => o !== e && (o.kind === "prop" || o.kind === "heldWeapon") && heldAnchor(o)?.character === h.character && heldAnchor(o)?.joint === otherJoint && o.start < e.end && o.end > e.start)) continue;
      const f0 = Math.max(0, Math.ceil(e.start * fps)), f1 = Math.min(last, Math.floor(Math.min(e.end, scene.durationSec) * fps));
      check(e.kind === "heldWeapon" ? String(e.params?.weapon ?? "thing") : thingName(e), h.character, f0, f1, (i) => { const bx = drawnBox(e, i); return bx ? { x: (bx.left + bx.right) / 2, y: (bx.top + bx.bottom) / 2, r: 0, box: bx } : undefined; }, h.joint as "lHand" | "rHand");
    }
    out.push({ law: "honestHands", ok: worstRun < FAKE_HOLD_S, value: r2(worstRun), limit: FAKE_HOLD_S, at, who: whoF || undefined, say: worstRun < FAKE_HOLD_S ? "Every hand that looks like it holds something really holds it." : `${who(whoF)}'s free hand sits on the ${what} for ${sec(worstRun)} at ${sec(at ?? 0)} but doesn't hold it: hands don't lie.` });
  }
  // SPIN FOLLOWS MOTION (Oct 14, Arthur on cliff tumbles: "walking into the pit leaning forward, and all of a sudden mid-air he does a
  // backflip… flips that aren't supposed to be possible"): a FALLING body turns the way it travels — tipping forward off an edge turns
  // forward, a bounce back the other way turns back GRADUALLY — never against its travel for long, never flip-flopping from one picture
  // to the next, and never more than most of a turn between two impacts (each hit may start a new flip, Oct 15). (A flip / somersault / roll the user asked for steps aside.)
  if (!/flip|somersault|spin|cartwheel|roll|twirl|tumbl\w* (over|head over)/i.test(ctx.words ?? "")) for (const c of plan.characters) {
    const cf = charFrames(c.id);
    const ang = (i: number) => { const s = cf[i]?.skeleton; return s ? (Math.atan2(s.neck.x - s.hip.x, s.hip.y - s.neck.y) * 180) / Math.PI : undefined; };
    const falling = new Array(n).fill(false), win = Math.round(0.4 * fps);
    for (let i = 1; i < n; i += 1) { const a = cf[i - 1]?.skeleton.hip, b2 = cf[i]?.skeleton.hip; if (a && b2 && (b2.y - a.y) * fps >= 1.2 * H) for (let k = Math.max(1, i - win); k <= Math.min(last, i + win); k += 1) falling[k] = true; }
    let bad = "", at: number | undefined, against = 0, total = 0, prevW = 0, value = 0;
    for (let i = 1; i < n && !bad; i += 1) {
      if (!falling[i]) { against = 0; total = 0; prevW = 0; continue; }
      const a0 = ang(i - 1), a1 = ang(i), h0 = cf[i - 1]?.skeleton.hip, h1 = cf[i]?.skeleton.hip;
      if (a0 === undefined || a1 === undefined || !h0 || !h1) continue;
      let d = a1 - a0; while (d > 180) d -= 360; while (d < -180) d += 360;
      const w = d * fps, vx = (h1.x - h0.x) * fps;
      // (Oct 15, Arthur: "a fall, boom, a forward flip, boom…": only a HIT gives a falling body a new turn — so the "how much it turns"
      // count starts again at each impact, where the hips stop going down; a flip per bounce is real, a spin out of nothing is not)
      const h00 = cf[i - 2]?.skeleton.hip;
      if (h00 && (h0.y - h00.y) * fps > 0.3 * H && (h1.y - h0.y) * fps < 0.1 * H) total = 0;
      total += d;
      against = Math.abs(vx) >= 0.6 * H && w * Math.sign(vx) < -150 ? against + 1 : 0;
      if (against >= Math.round(0.15 * fps)) { bad = `${who(c.id)} turns against the way it falls at ${sec(i / fps)} (a backflip while going forward)`; at = i / fps; value = r1(Math.abs(w)); }
      else if (prevW * w < 0 && Math.min(Math.abs(prevW), Math.abs(w)) > 120) { bad = `${who(c.id)}'s turn flips from one way to the other in one picture at ${sec(i / fps)}`; at = i / fps; value = r1(Math.abs(w - prevW)); }
      else if (Math.abs(total) > 540) { bad = `${who(c.id)} turns over ${Math.round(Math.abs(total))}° in one fall by ${sec(i / fps)} (more than a real body can between two hits)`; at = i / fps; value = r1(Math.abs(total)); }
      prevW = w;
    }
    if (falling.some(Boolean)) out.push({ law: "spinFollowsMotion", ok: !bad, value, limit: 0, at, who: c.id, say: bad ? `${bad}: a falling body turns the way it travels, gradually.` : `${who(c.id)}'s falls turn the way it travels.` });
  }

  // H9 STAND UP LIKE A PERSON (bench law): from sitting, the hips rise at most 0.9 H a second, and the get-up (lean forward, push, ease
  // into standing) takes at least 1.0 s — never a ghost floating up.
  for (const c of plan.characters) {
    const cf = charFrames(c.id); let fastest = 0, atF: number | undefined, riseS = Infinity, rises = 0;
    let i = 1;
    while (i < n) {
      const a = cf[i - 1]?.skeleton.hip, b2 = cf[i]?.skeleton.hip;
      if (!a || !b2 || (a.y - b2.y) * fps < 0.05 * H) { i += 1; continue; }
      let j = i; while (j + 1 < n && cf[j] && cf[j + 1] && (cf[j]!.skeleton.hip.y - cf[j + 1]!.skeleton.hip.y) * fps >= 0.05 * H) j += 1;
      // (the eased tails count: the rise goes on while the hips still come up ≥ 0.01 H a second)
      let jEnd = j; while (jEnd + 1 < n && cf[jEnd] && cf[jEnd + 1] && (cf[jEnd]!.skeleton.hip.y - cf[jEnd + 1]!.skeleton.hip.y) * fps >= 0.01 * H) jEnd += 1;
      const rise = a.y - (cf[j]?.skeleton.hip.y ?? a.y);
      // (a get-up = the hips rise ≥ 0.2 H from low — a seat or the floor — to standing; a hop or a jump is not one)
      // (from SITTING only — the figure has a "seated" mark before the rise: a bend down to pick a ball off the floor is not a get-up)
      const sat = Object.entries((scene as Scene & { marks?: Record<string, number> }).marks ?? {}).some(([k, v]) => k.startsWith(`${c.id}.`) && /\.seated$/.test(k) && v <= (i + 1) / fps);
      const startLow = sat && G - a.y < 0.45 * H, jumps = cf.slice(i, j + 1).some((x) => x && Math.min(x.skeleton.lFoot.y, x.skeleton.rFoot.y) < G - 0.05 * H);
      if (rise >= 0.2 * H && startLow && !jumps) {
        rises += 1;
        for (let k = i; k <= j; k += 1) { const v = ((cf[k - 1]?.skeleton.hip.y ?? 0) - (cf[k]?.skeleton.hip.y ?? 0)) * fps / H; if (v > fastest) { fastest = v; atF = k / fps; } }
        // the get-up starts with the lean forward: the moment the chest and head start moving before the hips rise (up to 0.8 s earlier)
        let s0 = i - 1; for (let k = i - 2; k >= Math.max(0, i - Math.round(0.8 * fps)); k -= 1) { const p = cf[k]?.skeleton, q = cf[k + 1]?.skeleton; if (p && q && (["neck", "head"] as const).some((jn) => dist(p[jn], q[jn]) > 0.0005 * H)) s0 = k; else break; }
        riseS = Math.min(riseS, (jEnd - s0) / fps);
      }
      i = j + 1;
    }
    if (!rises) continue;
    // (a time lapse, fast-forward or "really fast" asks for speed: the get-up law steps aside like the speed law — Arthur, Oct 12)
    const ok = FAST_WORDS.test(ctx.words ?? "") || (fastest <= RISE_MAX + 1e-6 && riseS >= RISE_MIN_S - 1e-6);
    out.push({ law: "standUp", ok, value: r2(fastest), limit: RISE_MAX, at: atF, who: c.id, say: ok ? `${who(c.id)} stands up like a person (${sec(riseS)}).` : `${who(c.id)} gets up like a ghost at ${sec(atF ?? 0)}: hips rise ${r2(fastest)} H a second (max ${RISE_MAX}) and the get-up takes ${sec(riseS)} (at least ${RISE_MIN_S} s).` });
  }

  // CAREFUL MOVES DON'T WIND UP (Arthur, Oct 14, campfire: "whenever a stick figure goes to kneel down… they always lean back super
  // fast, then slowly lean forward"): right before a CAREFUL forward move — the body goes down low (the hips drop 0.15 H+) while the
  // chest leans 20°+ forward at a calm speed (kneeling, bending, reaching to the floor, picking up, sitting down to tie a shoe) — the
  // torso or the head never jerks BACK more than CAREFUL_JERK° first. (A strike's wind-up is fast forward after it: not careful.)
  {
    const CAREFUL_JERK = 10, BACK_S = 0.4, AHEAD_S = 1.2, CALM_DEG_S = 400;
    let bad: { who: string; at: number; deg: number } | undefined;
    for (const c of plan.characters) {
      const cf = charFrames(c.id);
      const tilt = (a: { x: number; y: number }, b: { x: number; y: number }, f: number) => (Math.atan2(f * (b.x - a.x), a.y - b.y) * 180) / Math.PI;
      const torso = cf.map((x) => (x ? tilt(x.skeleton.hip, x.skeleton.neck, x.facing === "left" ? -1 : 1) : NaN));
      const head = cf.map((x) => (x ? tilt(x.skeleton.neck, x.skeleton.head, x.facing === "left" ? -1 : 1) : NaN));
      for (const ang of [torso, head]) {
        for (let m = 1; m + 1 < n && !bad; m += 1) {
          if (!(ang[m] <= ang[m - 1] && ang[m] < ang[m + 1])) continue;
          if (((built as { reflexes?: { who: string; from: number; to: number }[] }).reflexes ?? []).some((r) => r.who === c.id && m >= r.from && m <= r.to + Math.round(0.3 * fps))) continue; // (a reflex flinch is not a wind-up)
          let back = 0; for (let k = Math.max(0, m - Math.round(BACK_S * fps)); k < m; k += 1) if (Number.isFinite(ang[k])) back = Math.max(back, ang[k] - ang[m]);
          if (back <= CAREFUL_JERK) continue;
          const end = Math.min(n - 1, m + Math.round(AHEAD_S * fps)), hip0 = cf[m]?.skeleton.hip.y ?? 0;
          let fwd = 0, drop = 0, fast = 0;
          for (let k = m + 1; k <= end; k += 1) {
            if (!Number.isFinite(ang[k])) continue;
            fwd = Math.max(fwd, ang[k] - ang[m]); drop = Math.max(drop, (cf[k]?.skeleton.hip.y ?? hip0) - hip0);
            fast = Math.max(fast, Math.abs(ang[k] - ang[k - 1]) * fps);
          }
          // (in the air — a jump, a flip — is not a careful move)
          const airborne = cf.slice(m, end + 1).some((x) => x && Math.max(x.skeleton.lFoot.y, x.skeleton.rFoot.y) < G - 0.05 * H);
          if (fwd >= 20 && drop >= 0.15 * H && fast < CALM_DEG_S && !airborne) bad = { who: c.id, at: m / fps, deg: back };
        }
      }
    }
    out.push({ law: "carefulWindUp", ok: !bad, value: bad ? r1(bad.deg) : 0, limit: 10, at: bad?.at, who: bad?.who,
      say: bad ? `${who(bad.who)} jerks back ${Math.round(bad.deg)}° at ${sec(bad.at)} right before going down carefully: a careful move (kneel, bend, reach low, pick up) goes STRAIGHT to its pose at a calm speed — wind-ups are only for power moves (strikes, jumps, throws).` : "Careful moves go straight to their pose (no lean-back first)." });
  }
  // H10 NATURAL SPEED (Phase C3, Arthur Sun 12:55: "Red high fives HYPERSONICALLY — like Sonic"; NEW LAW: "everything moves at a natural
  // accelerating/decelerating pace, never hypersonic, unless the user explicitly asks"). Outside fights / strikes / falls / flights /
  // runs (moves/timing.ts FAST_MOVES), no hand or foot moves faster than HAND_SPEED_MAX (a throw's release: THROW_SPEED_MAX) — measured
  // against the figure's own hips (a walk carries the hands; that is not the hand moving), over two pictures — and every move eases in
  // and out: the speed never jumps by more than SPEED_JUMP_MAX from one picture to the next. Words that ask for speed lift the law.
  {
    const words = `${ctx.words ?? ""} ${(plan as { title?: string }).title ?? ""}`;
    const asked = FAST_WORDS.test(words);
    let worst = 0, worstLim = HAND_SPEED_MAX, at: number | undefined, whoF = "", what = "", jump = 0, jumpAt: number | undefined, jumpWho = "", jumpWhat = "";
    const span = Math.max(1, Math.round(fps / 12)), k24 = 24 / fps;
    const cutFrames = built.camera?.cuts ?? [];
    const allMarks = Object.entries((scene as Scene & { marks?: Record<string, number> }).marks ?? {});
    for (const c of plan.characters) {
      // the figure's beats (from its marks "<who>.<move><n>.<mark>"): each beat's last mark; a picture belongs to the next beat to end
      // (its approach / wind-up) and, within 0.6 s after a beat, also to that beat (its recovery)
      const ends = new Map<string, number>();
      // (a later scene's moments are "shot<k>/<who>.<move><n>.<mark>": the same figure's beats there count too — "s<k>|<move><n>")
      for (const [key, v] of allMarks) { const m = key.match(/^(?:shot(\d+)\/)?([^.]+)\.([A-Za-z]+\d+)\.(\w+)$/); if (m && m[2] === c.id && Number.isFinite(v)) { const mv = (m[1] ? `s${m[1]}|` : "") + m[3]; ends.set(mv, Math.max(ends.get(mv) ?? -Infinity, v)); } }
      // (an ORIGINAL move — "custom" — is named by its own "name": a "breakdance windmill spin" or a "flying kick" is fast on purpose
      // like the library's spins and kicks; Arthur, Oct 12: new moves were refused as hypersonic)
      const customNames = c.actions.filter((a) => a.move === "custom").map((a) => String((a.params as { name?: unknown } | undefined)?.name ?? "custom"));
      const beats = [...ends].map(([full, end]) => { const mv = full.split("|").pop()!; return { name: /^custom\d+$/.test(mv) ? (customNames[Number(mv.slice(6)) - 1] ?? "custom") : mv.replace(/\d+$/, ""), end }; }).sort((a, b2) => a.end - b2.end);
      const fastAsked = c.actions.some((a) => FAST_WORDS.test(String((a.params as { manner?: unknown; speed?: unknown } | undefined)?.manner ?? "")) || Number((a.params as { speed?: unknown } | undefined)?.speed ?? 1) > 1.3);
      if (asked || fastAsked) continue;
      const beatAt = (t: number) => { const next = beats.find((b2) => b2.end >= t - 1e-6); const prev = [...beats].reverse().find((b2) => b2.end < t - 1e-6); return { next: next?.name, prev: prev && t - prev.end <= 0.6 ? prev.name : undefined }; };
      const cf = charFrames(c.id);
      // (each figure's speed in ITS OWN heights a second — the drawn figure's height, so a small kid and a framed plan measure right)
      const Hc = scene.characters.find((x) => x.id === c.id)?.height ?? H;
      const impacts = allMarks.filter(([key]) => key.startsWith(`${c.id}.`) && /\.(touch|slap|catch|hit|contact|grab|land|caught)$/.test(key)).map(([, v0]) => v0);
      for (const jn of ["lHand", "rHand", "lFoot", "rFoot"] as const) {
        // v[i]: the speed over the two pictures up to i (null = not measured: a fast move, or the figure not on the page)
        const v: (number | null)[] = new Array(n).fill(null);
        for (let i = span; i < n; i += 1) {
          const a = cf[i - span]?.skeleton, q = cf[i]?.skeleton;
          if (!a || !q) continue;
          // (a figure OFF the page — walking in or out — is not seen: its speed there is not judged, like the smooth law)
          if ([cf[i - span], cf[i]].some((f) => (f as { offPage?: boolean } | undefined)?.offPage) || [a, q].some((sk) => sk.hip.x < -0.1 * H || sk.hip.x > ctx.stageWidth + 0.1 * H)) continue;
          const t = i / fps, { next, prev } = beatAt(t);
          if ((next && FAST_MOVES.test(next)) || (prev && FAST_MOVES.test(prev))) continue;
          // (A REFLEX is involuntary — a hand yanked out of a fire, a body thrown by a shock — the fastest move there is: not judged)
          if (((built as { reflexes?: { who: string; from: number; to: number }[] }).reflexes ?? []).some((r) => r.who === c.id && i >= r.from && i - span <= r.to)) continue;
          // (A FILM CUT is a new shot: a figure walking in the next shot does not "snap" from where it stood in the last one —
          // the pictures right at a cut are not compared; Arthur's swamp, Oct 12, was refused for a "snap" at its cut)
          if (cutFrames.some((cf0) => cf0 > i - 2 * span && cf0 <= i)) continue;
          const rel = (s: typeof q) => ({ x: s[jn].x - s.hip.x, y: s[jn].y - s.hip.y });
          v[i] = dist(rel(q), rel(a)) * fps / span / Hc;
          const lim = (next === "throw" || prev === "throw") ? THROW_SPEED_MAX : HAND_SPEED_MAX;
          if (v[i]! / lim > worst / worstLim) { worst = v[i]!; worstLim = lim; at = t; whoF = c.id; what = jn; }
          // EASE IN AND OUT: from (nearly) still to fast — or fast to a dead stop — within two pictures is a snap
          const p = v[i - span];
          // (a dead stop AT an impact — the palms meet, the ball lands in the hand — is the hit, not a snap: hands stop on what they meet)
          const impact = v[i]! < p! && impacts.some((m) => Math.abs(m - t) <= (span + 1) / fps);
          if (p !== null && p !== undefined && !impact && Math.min(p, v[i]!) <= STILL_SPEED) { const d = Math.abs(v[i]! - p) / k24; if (d > jump) { jump = d; jumpAt = t; jumpWho = c.id; jumpWhat = jn; } }
        }
      }
    }
    const part = (j: string) => ({ lHand: "left hand", rHand: "right hand", lFoot: "left foot", rFoot: "right foot" } as Record<string, string>)[j] ?? j;
    const fast = worst > worstLim + 1e-6, snap = jump > SPEED_JUMP_MAX + 1e-6;
    out.push({ law: "tooFast", ok: !fast && !snap, value: r2(worst), limit: worstLim, at: fast ? at : snap ? jumpAt : at, who: (fast ? whoF : snap ? jumpWho : whoF) || undefined,
      say: asked ? "Speed was asked for: the natural-speed law steps aside." : fast ? `${who(whoF)}'s ${part(what)} moves at ${r1(worst)} H a second at ${sec(at ?? 0)}: hypersonic (a person's everyday limit is ${worstLim} H a second unless you ask for fast).`
        : snap ? `${who(jumpWho)}'s ${part(jumpWhat)} snaps between still and fast with no ease at ${sec(jumpAt ?? 0)} (speed jumps ${r1(jump)} H a second; at most ${SPEED_JUMP_MAX}): every move eases in and out.`
        : `Everything moves at a natural pace (fastest hand or foot ${r1(worst)} H a second; ${worstLim} max) and eases in and out.` });
  }

  // TRAVEL SPEED (laws/travel.ts, Oct 14: the skater "going the speed of sound"): the whole body's travel over the ground per activity.
  {
    const marks0 = Object.entries((scene as Scene & { marks?: Record<string, number> }).marks ?? {});
    const beatsOf = (id: string) => {
      const c = plan.characters.find((x) => x.id === id), ends = new Map<string, number>();
      for (const [key, v] of marks0) { const m = key.match(/^(?:shot(\d+)\/)?([^.]+)\.([A-Za-z]+\d+)\.(\w+)$/); if (m && m[2] === id && Number.isFinite(v)) { const mv = (m[1] ? `s${m[1]}|` : "") + m[3]; ends.set(mv, Math.max(ends.get(mv) ?? -Infinity, v)); } }
      const customNames = (c?.actions ?? []).filter((a) => a.move === "custom").map((a) => String((a.params as { name?: unknown } | undefined)?.name ?? "custom"));
      return [...ends].map(([full, end]) => { const mv = full.split("|").pop()!; return { name: /^custom\d+$/.test(mv) ? (customNames[Number(mv.slice(6)) - 1] ?? "custom") : mv.replace(/\d+$/, ""), end }; }).sort((a, b2) => a.end - b2.end);
    };
    const hipX = (id: string) => frames.map((f) => { const fc = f.find((x) => x.id === id); return !fc || (fc as { offPage?: boolean }).offPage ? undefined : fc.skeleton.hip.x; });
    out.push(travelSpeedLaw(plan.characters, hipX, (id) => scene.characters.find((x) => x.id === id)?.height ?? H, beatsOf, fps, built.camera?.cuts ?? [], `${ctx.words ?? ""} ${(plan as { title?: string }).title ?? ""}`, who));
  }

  // SMOOTH MOTION — LAW #1 (Arthur, Oct 14: "everything is supposed to be smooth motion… nothing teleports unless the user says"):
  // no joint POPS — one picture's move many times bigger than the pictures on either side of it (a snap into a pose, a frozen
  // picture then a rush, a limb flicking for one picture). Measured on every figure's head, hips, hands and feet, film cuts skipped.
  {
    const cutAt = built.camera?.cuts ?? [];
    let pops = 0, popAt: number | undefined, popWho = "", popWhat = "";
    for (const c of plan.characters) {
      for (const jn of ["head", "hip", "lHand", "rHand", "lFoot", "rFoot"] as const) {
        const v: number[] = [0];
        for (let i = 1; i < n; i += 1) {
          const fa = frames[i - 1]?.find((f) => f.id === c.id), fq = frames[i]?.find((f) => f.id === c.id);
          // (a figure OFF the page — walked out, or not in yet — is not seen: its motion there is not judged)
          const off = (f: typeof fa) => !f || (f as { offPage?: boolean }).offPage || f.skeleton.hip.x < -0.1 * H || f.skeleton.hip.x > ctx.stageWidth + 0.1 * H;
          const a = off(fa) || off(fq) ? undefined : fa!.skeleton[jn], q = off(fa) || off(fq) ? undefined : fq!.skeleton[jn];
          v.push(a && q ? (dist(a, q) * fps) / H : 0);
        }
        for (let i = 2; i < v.length - 1; i += 1) {
          if (cutAt.some((k) => Math.abs(k - i) <= 1)) continue;
          if (v[i] > 1.2 && v[i] > 3 * Math.max(v[i - 1], v[i + 1], 0.15)) { pops += 1; if (popAt === undefined) { popAt = i / fps; popWho = c.id; popWhat = jn; } }
        }
      }
    }
    out.push({ law: "smooth", ok: pops === 0, value: pops, limit: 0, at: popAt, who: popWho || undefined,
      say: pops === 0 ? "Every move flows: nothing pops or snaps." : `${who(popWho)}'s ${({ head: "head", hip: "body", lHand: "left hand", rHand: "right hand", lFoot: "left foot", rFoot: "right foot" } as Record<string, string>)[popWhat] ?? popWhat} pops at ${sec(popAt ?? 0)} (+${pops - 1} more): one picture jumps far more than the ones around it — every move must flow (law #1).` });
  }

  // 11. BODY: bones never stretch, planted feet never slide, nobody goes under the ground (the engine's own report)
  for (const r of built.report.characters) {
    out.push({ law: "bones", ok: r.maxBoneErrorPx <= 0.5, value: r1(r.maxBoneErrorPx), limit: 0.5, who: r.id, say: r.maxBoneErrorPx <= 0.5 ? `${who(r.id)}'s bones keep their length.` : `${who(r.id)}'s bones stretch or shrink by ${px(r.maxBoneErrorPx)}.` });
    out.push({ law: "feet", ok: r.maxFootDriftPx <= 1, value: r1(r.maxFootDriftPx), limit: 1, who: r.id, say: r.maxFootDriftPx <= 1 ? `${who(r.id)}'s planted feet stay put.` : `${who(r.id)}'s planted feet slide ${px(r.maxFootDriftPx)}.` });
    out.push({ law: "ground", ok: r.belowGroundFrames === 0, value: r.belowGroundFrames, limit: 0, who: r.id, say: r.belowGroundFrames === 0 ? `${who(r.id)} stays above the ground.` : `${who(r.id)} goes under the ground in ${r.belowGroundFrames} pictures.` });
  }
  // 11b. A HIT TOUCHES (Arthur, Oct 12: "he's kicking air and somehow affects orange"; the contact report was an empty shell in
  // this copy): when a figure REACTS to a hit (its "<who>.getHit<n>.hit" mark), at that picture some striker's fist or foot is on
  // the reacting body (any of its joints or bones, within HIT_TOUCH). A dodge, a miss on purpose or a strike at a thing has no
  // reaction mark, so it is not measured.
  {
    const all2 = Object.entries(scene.marks ?? {}).filter(([, v]) => Number.isFinite(v));
    let miss: { who: string; by: string; at: number; gap: number } | null = null;
    for (const [k, t] of all2) {
      const m = /^([^.]+)\.getHit\d+\.hit$/.exec(k);
      if (!m) continue;
      const i = Math.max(0, Math.min(n - 1, Math.round(t * fps)));
      const victimF = charFrames(m[1])[i], victim = victimF?.skeleton as Record<string, { x: number; y: number }> | undefined;
      if (!victim || !victimF) continue;
      // (ONE TRUTH, Oct 15: the victim's DRAWN body — every bone as the line it is drawn with, the head as its drawn circle — or the
      // World's outline of that figure; the fist / foot is ON it within CONTACT_GAP_PX)
      const vBody = worldOutline(built, i, [m[1]]) ?? bodyOutline(victim, victimF.headRadius ?? 0.07 * H, victimF.style?.thickness ?? 3);
      // (only FIST AND FOOT hits are measured here: the figures whose punch / kick / dash punch / ground punch / barrage lands at
      // that moment — a blast from afar or a weapon's blade has its own laws)
      const strikers = new Set(all2.filter(([sk, v]) => Math.abs(v - t) <= 1.5 / fps && /^[^.]+\.(punch|kick|dashPunch|groundPunch|barrage)\d+\.hit\d*$/.test(sk)).map(([sk]) => sk.split(".")[0]));
      if (!strikers.size) continue;
      let best = Infinity, by = "";
      for (const c of plan.characters) {
        if (c.id === m[1] || !strikers.has(c.id)) continue;
        // (the striker's fist or foot at the hit — one picture either side, the same leeway the hit-timing law gives)
        for (const di of [-1, 0, 1]) {
          const sk = charFrames(c.id)[Math.max(0, Math.min(n - 1, i + di))]?.skeleton as Record<string, { x: number; y: number }> | undefined;
          if (!sk) continue;
          for (const end of ["lHand", "rHand", "lFoot", "rFoot"]) if (sk[end]) { const d = outlineGap(vBody, sk[end]); if (d < best) { best = d; by = c.id; } }
        }
      }
      if (best > CONTACT_GAP_PX && (!miss || best > miss.gap)) miss = { who: m[1], by, at: t, gap: best };
    }
    out.push({ law: "hitTouch", ok: !miss, value: miss ? r1(miss.gap) : 0, limit: CONTACT_GAP_PX, at: miss?.at, who: miss?.who,
      say: miss ? `${who(miss.who)} reacts to a hit at ${sec(miss.at)} but ${who(miss.by)}'s fist or foot is ${px(miss.gap)} away from the body: a hit TOUCHES — stand at striking distance (or step in) so the fist or foot lands on the body.` : "Every hit touches the body it hits." });
  }
  // TOUCH MEANS TOUCH (Arthur, Oct 14: "the stick figure holding the match has to actually hit it"): an effect CAUSED by a hand or
  // foot at a fixed spot (lighting, pressing, knocking, painting) starts when that hand / foot (or the tool it holds) is ON the
  // spot: at the contact moment (its closest approach within 1 s of the start) its tip is within CONTACT_GAP_PX of the drawn spot.
  {
    const tracks = (((scene as Scene & { effects?: EffectTrack[] }).effects ?? plan.effects ?? []) as EffectTrack[]);
    let miss: { who: string; at: number; gap: number } | null = null;
    for (const e of tracks) {
      const c = (e as { cause?: { character?: string; joint?: string } }).cause, a = e.anchor as { x?: number; y?: number; character?: string };
      if (!c?.character || !/^[rl](Hand|Foot)$/.test(String(c.joint)) || typeof a.x !== "number" || typeof a.y !== "number" || a.character) continue;
      // (THE TOOL'S TIP TOUCHES: a held match / lighter / brush is measured at its drawn tip — effects/index.ts heldTip — never the
      // hand plus the tool's length, which passed a match stopping above the logs)
      // (ONE TRUTH, Oct 15: the tip is ON what is drawn there — the World's outline of the effect, the effect's own drawn shapes at its
      // start, or a fixed prop drawn under the spot (the logs a fire sits on, the machine a button is on) — within CONTACT_GAP_PX)
      const allow = CONTACT_GAP_PX, i0 = Math.max(0, Math.min(last, Math.ceil(e.start * fps)));
      const spot = { x: a.x, y: a.y };
      const targets: Outline[] = [{ points: [spot] }];
      const wo = worldOutline(built, i0, [String(e.params?.scriptId ?? ""), String(e.params?.name ?? ""), (e as { id?: string }).id]); if (wo) targets.push(wo);
      const db = drawnBox(e, i0); if (db) targets.push({ box: db });
      for (const pr of props) { if (heldAnchor(pr) || pr.start > e.start + 1e-6 || pr.end < e.start) continue; const pb = worldOutline(built, i0, [String(pr.params?.scriptId ?? ""), String(pr.params?.name ?? "")]) ?? (() => { const b0 = drawnBox(pr, i0) ?? propBox(plan, pr); return b0 ? { box: b0 } : null; })(); if (pb && outlineGap(pb, spot) <= CONTACT_GAP_PX) targets.push(pb); }
      let best: { at: number; gap: number } | undefined;
      for (let i = Math.max(0, Math.floor((e.start - 1) * fps)); i <= Math.min(last, Math.ceil((e.start + 1) * fps)); i += 1) {
        const p = /Hand$/.test(String(c.joint)) ? heldTip(tracks, c.character, c.joint!, frames[i] ?? [], H, G, ctx.stageWidth, i / fps) : (charFrames(c.character)[i]?.skeleton as unknown as Record<string, { x: number; y: number }> | undefined)?.[c.joint!];
        if (!p) continue;
        const d = Math.min(...targets.map((o) => outlineGap(o, p)));
        if (!best || d < best.gap) best = { at: i / fps, gap: d };
      }
      if (best && best.gap > allow && (!miss || best.gap > miss.gap)) miss = { who: c.character, at: best.at, gap: best.gap };
    }
    out.push({ law: "touches", ok: !miss, value: miss ? r1(miss.gap) : 0, limit: CONTACT_GAP_PX, at: miss?.at, who: miss?.who,
      say: miss ? `${who(miss.who)}'s hand (or foot) never reaches the thing it should touch at ${sec(miss.at)} — ${px(miss.gap)} short: THE BODY GOES TO THE THING — place ${who(miss.who)} within reach (step in, kneel, bend) and put the hand on the spot (a custom key's rHand/lHand target); never move the thing to the hand.` : "Every touch really touches." });
  }
  // CAUSE SHOWN (cause chains, Arthur Oct 14: "he never hits it… it automatically turns on"): a CAUSED effect starts within
  // 0.15 s of a REAL contact by its cause — a lit fire / a spark near the moment the held tool's tip is closest to its spot (and
  // on it), a thing that breaks (thingBreak) at the moment another figure's fist / foot is ON it (within 0.12 H).
  {
    const GAP = 0.15, tracks = (((scene as Scene & { effects?: EffectTrack[] }).effects ?? plan.effects ?? []) as EffectTrack[]);
    let bad: { at: number; what: string; off: number } | null = null;
    for (const e of tracks) {
      const c = (e as { cause?: { character?: string; joint?: string } }).cause, a = e.anchor as { x?: number; y?: number; character?: string };
      if (typeof a.x !== "number" || typeof a.y !== "number" || a.character || e.start <= 0.05) continue;
      let best: { at: number; gap: number } | undefined;
      if (c?.character && /^[rl]Hand$/.test(String(c.joint)) && /^(fire|wildfire|sparks|explosion|fireBurst|flash)$/.test(e.kind)) {
        // (contact = the held tip ON the spot (0.06 H) or passing it between two pictures, within GAP before the start)
        let prev: { x: number; y: number } | undefined;
        for (let i = Math.max(0, Math.floor((e.start - 1) * fps)); i <= Math.min(last, Math.ceil((e.start + 0.3) * fps)); i += 1) {
          const p = heldTip(tracks, c.character, c.joint!, frames[i] ?? [], H, G, ctx.stageWidth, i / fps);
          if (!p) continue;
          const crossed = !!prev && Math.abs(p.x - a.x) <= 0.06 * H && Math.sign(prev.y - a.y) !== Math.sign(p.y - a.y);
          const d = crossed ? 0 : Math.hypot(p.x - a.x, p.y - a.y);
          prev = p;
          if (d <= 0.06 * H && (!best || Math.abs(i / fps - e.start) < Math.abs(best.at - e.start)) && i / fps <= e.start + 0.05) best = { at: i / fps, gap: d };
        }
        if (!best || e.start - best.at > GAP + 0.5 / fps) bad = bad ?? { at: e.start, what: `the ${e.kind}`, off: best ? e.start - best.at : 9 };
      } else if (e.kind === "thingBreak") {
        for (let i = Math.max(0, Math.floor((e.start - 1.5) * fps)); i <= Math.min(last, Math.ceil((e.start + 0.3) * fps)); i += 1) for (const f of frames[i] ?? []) for (const j of ["rHand", "lHand", "rFoot", "lFoot"] as const) {
          const d = Math.hypot(f.skeleton[j].x - a.x, f.skeleton[j].y - a.y);
          if (d <= 0.12 * H && (!best || Math.abs(i / fps - e.start) < Math.abs(best.at - e.start))) best = { at: i / fps, gap: d };
        }
        if (!best || Math.abs(best.at - e.start) > GAP) bad = bad ?? { at: e.start, what: `the ${thingName(e)} breaking`, off: best ? Math.abs(best.at - e.start) : 9 };
      }
    }
    out.push({ law: "causeShown", ok: !bad, value: bad ? r1(bad.off) : 0, limit: GAP, at: bad?.at,
      say: bad ? `${bad.what} at ${sec(bad.at)} starts without a real contact by its cause (${bad.off >= 9 ? "nothing touches it" : `${bad.off.toFixed(2)} s off`}): prepare → act → CONTACT → small effect → big effect — the match / fist really lands on the spot, then it lights / breaks.` : "Every caused effect starts at a real contact." });
  }
  // A STRIKE HAS A TARGET (Arthur, Oct 14: "they're just kicking thin air… too much space… I don't understand"): a punch or kick
  // lands ON something — a figure, a pad, a bag, a board — within reach of the fist / foot at its hit, unless the words ask for a
  // demo in the air (kata, shadow boxing, warm-up).
  {
    const demo = /\b(kata|shadow ?box\w*|in the air|thin air|warm(s|ing)? up|alone|practi[cs]es? alone|exercise)\b/i.test(ctx.words ?? "");
    const REACH = 0.25;
    let bad: { who: string; at: number; gap: number } | null = null;
    if (!demo) for (const [k, t] of Object.entries(scene.marks ?? {})) {
      const m = /^([^.]+)\.(punch|kick|jab|hook|uppercut)\d+\.hit$/.exec(k);
      if (!m || !Number.isFinite(t)) continue;
      const i = Math.max(0, Math.min(last, Math.round(t * fps)));
      const sk = charFrames(m[1])[i]?.skeleton as unknown as Record<string, { x: number; y: number }> | undefined;
      if (!sk) continue;
      const ends = [sk.lHand, sk.rHand, sk.lFoot, sk.rFoot].filter(Boolean);
      const pts: { x: number; y: number }[] = [];
      for (const c of frames[i] ?? []) if (c.id !== m[1]) pts.push(...Object.values(c.skeleton as unknown as Record<string, { x: number; y: number }>));
      for (const o of built.objects[i] ?? []) pts.push({ x: o.x, y: o.y });
      for (const e of (((scene as Scene & { effects?: EffectTrack[] }).effects ?? plan.effects ?? []) as EffectTrack[])) {
        if (e.kind !== "prop" || i / fps < e.start || i / fps > e.end || (e.anchor as { character?: string }).character === m[1]) continue;
        const at = anchorAt(e.anchor, frames[i] ?? [], built.objects[i] ?? []); if (at) pts.push(at);
      }
      let gap = Infinity;
      for (const q of ends) for (const p of pts) gap = Math.min(gap, Math.hypot(q.x - p.x, q.y - p.y));
      if (gap > REACH * H && (!bad || gap > bad.gap)) bad = { who: m[1], at: t, gap };
    }
    out.push({ law: "strikeAtNothing", ok: !bad, value: bad ? r1(Math.min(bad.gap, 99 * H)) : 0, limit: r1(REACH * H), at: bad?.at, who: bad?.who,
      say: bad ? `${who(bad.who)} strikes thin air at ${sec(bad.at)} (the nearest thing is ${Number.isFinite(bad.gap) ? px(bad.gap) : "nowhere"} away): a strike has a TARGET — a pad held by a partner at kicking distance, a bag, a board, or an opponent; teaching = side by side facing the same way, or the teacher holding pads for the student.` : "Every strike lands on something." });
  }
  // EMITTER CAUSE (taste; Arthur, Oct 14, the bubble wand: "he should only blow bubbles when it's next to his face"): the engine lets an
  // emitter make pieces only while its cause is true (effects/emitterCause.ts — a wand at the mouth or waved, a whistle at the mouth).
  // An emitter whose cause is NEVER true in its whole time makes nothing: the plan must bring the thing to the mouth / wave it.
  {
    const tracks = (((scene as Scene & { effects?: EffectTrack[] }).effects ?? plan.effects ?? []) as EffectTrack[]);
    const heads = toolHeads(tracks, H), workers = toolWorkers(scene);
    let bad: { who: string; at: number; what: string } | null = null, gated = 0;
    for (const e of tracks) {
      const need = emitterNeed(e, tracks), ch = (e.anchor as { character?: string }).character;
      if (!need || !ch || bad) continue;
      gated += 1;
      const src = frames.map((f, j) => fromToolHead(e, f, heads, workers) ?? anchorAt(e.anchor, f, built.objects[j] ?? []));
      const gate = causeList(need, src, frames.map((f) => f.find((c) => c.id === ch)), fps, H);
      const live = gate.filter((g, j) => g && j / fps >= e.start - 1e-9 && j / fps <= e.end + 1e-9).length;
      if (!live) bad = { who: ch, at: Math.max(0, e.start), what: e.kind };
    }
    out.push({ law: "emitterCause", ok: !bad, value: bad ? 0 : gated, limit: 1, at: bad?.at, who: bad?.who,
      say: bad ? `${who(bad.who)}'s ${bad.what} never come out: they come out only while their cause is true — bring the wand / whistle to the mouth (hand target at the mouth) to blow, or wave it fast.` : "Every emitter comes out only while its cause is true." });
  }
  // HIT FELT (Arthur, Oct 14: the dodgeball hit Blue's back and he kept waving): a thing FLYING fast (not held, not rolling) that
  // touches a figure's body (head to knees) makes that figure react — a getHit within 0.3 s. The figure that let it go is not hit
  // by it as it leaves the hand.
  {
    // (a story's later scenes name their moments "shot<k>/<who>.<move><n>.<mark>" — read them the same way)
    const marksAll = Object.entries(scene.marks ?? {}).filter(([, v]) => Number.isFinite(v)).map(([k, v]) => [k.replace(/^shot\d+\//, ""), v] as [string, number]);
    let bad: { who: string; at: number } | null = null;
    const touched = new Set<string>();
    for (let i = 1; i < n && !bad; i += 1) for (const o of built.objects[i] ?? []) {
      const prev = built.objects[i - 1]?.find((x) => x.id === o.id); if (!prev || (o as { heldBy?: string }).heldBy || (prev as { heldBy?: string }).heldBy || o.behind) continue; // (passing BEHIND a figure is not a hit — depth.ts)
      if (Math.hypot(o.x - prev.x, o.y - prev.y) * fps < 2.5 * H || o.y > G - 0.12 * H) continue; // (fast and off the ground)
      // (only a THROWN thing in flight is a hit — a thing moved along its own path (knocked out of a tree, falling past) is not)
      const so0 = (scene.objects ?? []).find((x) => x.id === o.id), tNow = i / fps;
      if (!(so0?.segments ?? []).some((g) => g.mode === "flight" && tNow >= g.from - 1 / fps && tNow <= g.to + 1 / fps)) continue;
      const r = Number(o.look?.size ?? 40) / 2;
      for (const c of frames[i] ?? []) {
        if (touched.has(`${o.id}:${c.id}`)) continue;
        const sk = c.skeleton as unknown as Record<string, { x: number; y: number }>;
        const pts = [sk.neck, sk.hip, sk.lKnee, sk.rKnee].filter(Boolean);
        const mid = sk.neck && sk.hip ? [0.33, 0.66].map((u) => ({ x: sk.neck.x + (sk.hip.x - sk.neck.x) * u, y: sk.neck.y + (sk.hip.y - sk.neck.y) * u })) : [];
        const head = sk.head && Math.hypot(sk.head.x - o.x, sk.head.y - o.y) <= r + c.headRadius - 2;
        if (!head && ![...pts, ...mid].some((q) => Math.hypot(q.x - o.x, q.y - o.y) <= r + 0.02 * H)) continue;
        // (in or at its own hand — held, caught, carried — not a hit)
        if ([sk.lHand, sk.rHand].some((q) => q && Math.hypot(q.x - o.x, q.y - o.y) <= r + 0.06 * H)) continue;
        // (it just left this figure's own hand — a throw, not a hit)
        const thrower = marksAll.some(([k, v]) => k.startsWith(`${c.id}.`) && /\.(throw|spinThrow|iceThrow)\d+\.release$/.test(k) && i / fps - v >= 0 && i / fps - v < 0.5);
        if (thrower) continue;
        touched.add(`${o.id}:${c.id}`);
        const t = i / fps;
        const felt = marksAll.some(([k, v]) => k.startsWith(`${c.id}.`) && /\.(getHit|catch|block|swordBlock|parry|blownAway|barraged)\d+\./.test(k) && v >= t - 0.15 && v <= t + 0.3);
        if (!felt && !bad) bad = { who: c.id, at: t };
      }
    }
    out.push({ law: "hitFelt", ok: !bad, value: bad ? 1 : 0, limit: 0, at: bad?.at, who: bad?.who,
      say: bad ? `Something flying hits ${who(bad.who)} at ${sec(bad.at)} and ${who(bad.who)} does not react: a hit is FELT — give ${who(bad.who)} a getHit synced to that moment (thrown away from where it came from), or move it out of the way.` : "Every flying thing that touches a body is felt." });
  }
  // FACES WHO IT GREETS (Arthur, Oct 14: Red waved back with his back to his friend): a wave / high-five / point aimed at someone
  // (`to` / `target`) is made FACING that person (or facing the viewer) at its top.
  {
    let bad: { who: string; at: number; to: string } | null = null;
    for (const c of plan.characters) {
      const cnt = new Map<string, number>();
      for (const a of c.actions) {
        const k = (cnt.get(a.move) ?? 0) + 1; cnt.set(a.move, k);
        if (!/^(wave|highFive|point|beckon|thumbsUp|salute)$/.test(a.move) || bad) continue;
        const to = String((a.params as { to?: unknown; target?: unknown } | undefined)?.to ?? (a.params as { target?: unknown } | undefined)?.target ?? "");
        if (!plan.characters.some((x) => x.id === to) || to === c.id) continue;
        const t = (scene.marks ?? {})[`${c.id}.${a.move}${k}.up`] ?? (scene.marks ?? {})[`${c.id}.${a.move}${k}.hit`] ?? (scene.marks ?? {})[`${c.id}.${a.move}${k}.slap`];
        if (!Number.isFinite(t)) continue;
        const i = Math.max(0, Math.min(n - 1, Math.round(t * fps)));
        const me = charFrames(c.id)[i], them = charFrames(to)[i];
        if (!me || !them || (me.facing !== "left" && me.facing !== "right")) continue;
        const dx = them.skeleton.hip.x - me.skeleton.hip.x;
        if (Math.abs(dx) > 0.15 * H && (me.facing === "right") !== (dx > 0)) bad = { who: c.id, at: t, to };
      }
    }
    out.push({ law: "facesWhoItGreets", ok: !bad, value: bad ? 1 : 0, limit: 0, at: bad?.at, who: bad?.who,
      say: bad ? `${who(bad.who)} greets ${who(bad.to)} at ${sec(bad.at)} with its back to them: turn to face them first.` : "Every wave or high-five faces the one it is for." });
  }
  // 12. HIT TIMING (Arthur, Oct 12: "black got hit before blue even punched him"): a figure reacts to a hit only when a punch or
  // kick lands — never before it. Each "<who>.getHit<n>.hit" must have a strike landing at that moment (within one picture),
  // not only later.
  {
    const all = Object.entries(scene.marks ?? {}).filter(([, v]) => Number.isFinite(v));
    const lands = all.filter(([k]) => /\.(punch|kick|dashPunch|strike|groundPunch|barrage|swordSlash|swordChop|swordThrust|swordSpin|dashSlash)\d+\.hit\d*$/.test(k));
    let bad: { who: string; at: number; next: number } | null = null;
    if (lands.length) for (const [k, t] of all) {
      const m = /^([^.]+)\.getHit\d+\.hit$/.exec(k);
      if (!m) continue;
      const theirs = lands.filter(([lk]) => !lk.startsWith(`${m[1]}.`)).map(([, v]) => v);
      if (!theirs.length || theirs.some((v) => Math.abs(v - t) <= 1.5 / fps)) continue;
      const next = theirs.filter((v) => v > t).sort((x, y) => x - y)[0];
      if (next !== undefined && (!bad || t < bad.at)) bad = { who: m[1], at: t, next };
    }
    out.push({ law: "hitTiming", ok: !bad, value: bad ? r1(bad.next - bad.at) : 0, limit: 0, at: bad?.at, who: bad?.who,
      say: bad ? `${who(bad.who)} reacts to a hit at ${sec(bad.at)}, but the punch only lands at ${sec(bad.next)}: a hit is felt exactly when it lands (give the getHit "from": the striker and NO sync of its own).` : "Every hit is felt exactly when it lands." });
  }
  // 13. NOTHING IS LATE — HAZARDS ARE CLEARED (Arthur, Oct 12: "the motion sheet created three spikes, but the stick figure never
  // actually hopped over it… nothing should be late, ever, unless the user says"): no foot touches the ground on spikes or over a
  // pit, unless the words ask for the fall. The message names exactly where the hazard is, so the jump can be placed before it.
  {
    const pieces = (scene as Scene & { background?: { pieces?: { kind: string; params?: Record<string, unknown> }[] } }).background?.pieces ?? [];
    const st = { width: ctx.stageWidth, height: H, groundY: G } as Parameters<typeof spikeRow>[1];
    // (over spikes a foot must be ABOVE the tips, not just off the ground; over a pit it must not be down on the ground line)
    const hazards = pieces.flatMap((pc) => pc.kind === "spikes" ? [{ what: "the spikes", ...(({ left, right, tall }) => ({ left, right, top: G - tall - CONTACT_GAP_PX }))(spikeRow(pc.params ?? {}, st)) }]
      : pc.kind === "pit" ? [{ what: "the pit", left: Number(pc.params?.x ?? ctx.stageWidth / 2) - Number(pc.params?.w ?? 0.9 * H) / 2, right: Number(pc.params?.x ?? ctx.stageWidth / 2) + Number(pc.params?.w ?? 0.9 * H) / 2, top: G - CONTACT_GAP_PX }] : []);
    // (ONE TRUTH, Oct 15: a foot counts only when it REALLY touches — within CONTACT_GAP_PX of the drawn spike tips or of the pit's
    // ground line — never "near" them)
    // (a figure that TUMBLES off an edge falls into what is below on purpose — the plan itself asks for the fall)
    const askedFall = /\b(falls?|lands?|steps?|trips?|dies|die|hurt|impaled|onto|into)\b[^.]*\b(spikes?|pit)\b|\b(spikes?|pit)\b[^.]*\b(falls?|dies|hurt)\b/i.test(ctx.words ?? "") || plan.characters.some((c) => c.actions.some((a) => a.move === "tumble"));
    const firstCut = built.camera?.cuts?.[0] ?? n;
    let bad: { who: string; at: number; what: string; left: number; right: number } | null = null;
    if (hazards.length && !askedFall) for (const c of plan.characters) {
      const mine = charFrames(c.id);
      for (let i = 0; i < Math.min(n, firstCut) && !bad; i += 1) {
        const sk = mine[i]?.skeleton;
        if (!sk) continue;
        // (a FOLLOW camera slides each picture: the hazard is where it is in the WORLD — undo the slide)
        const camDx = built.camera?.shake?.[i]?.x ?? 0;
        for (const ft0 of [sk.lFoot, sk.rFoot]) { const ft = { x: ft0.x - camDx, y: ft0.y }; const hz = hazards.find((h0) => ft.x > h0.left + 2 && ft.x < h0.right - 2 && ft.y >= h0.top); if (hz) { bad = { who: c.id, at: i / fps, what: hz.what, left: hz.left, right: hz.right }; break; } }
      }
    }
    out.push({ law: "hazard", ok: !bad, value: bad ? 1 : 0, limit: 0, at: bad?.at, who: bad?.who,
      say: bad ? `${who(bad.who)} steps on ${bad.what} at ${sec(bad.at)} (${bad.what} run from x ${Math.round(bad.left)} to ${Math.round(bad.right)}): nothing is late — the jump takes off BEFORE ${bad.what} and lands AFTER them (one jump per hazard, or one long jump over all), unless the user asked for the fall.` : "Every hazard is cleared in time." });
  }
  // 14. A CONTACT HAS A CONSEQUENCE (Arthur, Oct 15: "his arms are IN the fire — he's supposed to get burned"): no hand stays
  // inside a hazard (a fire, an electric fence, ice, spikes, a hot stove) longer than 0.3 s with no reaction — and a hand that only
  // warms itself ("touch": "avoid") never goes in at all.
  {
    let bad: { who: string; at: number; what: string; avoid: boolean } | null = null;
    // (ONE TRUTH, Oct 15 — the hazard code put the stove 100 px higher than it is drawn: a hand only counts as IN a hazard when it
    // REALLY touches it — within CONTACT_GAP_PX of its DRAWN outline (the World's, else the page's own shapes, else its prop box) —
    // never by nearness to a guessed oval or box. The hazard's kind / mode / lighter still come from hazardZones.)
    try {
      const hzTracks = allTracks.filter((e) => !("character" in e.anchor) && !("object" in e.anchor) && (e.kind === "fire" || e.kind === "wildfire" || (e.kind === "prop" && hazardKindOf(String(e.params?.name ?? e.params?.symbol ?? "") + " " + String(e.params?.hazard ?? "")))));
      const runs = new Map<string, number>();
      for (let i = 0; i < n && !bad; i += 1) {
        const t = i / fps;
        for (const e of hzTracks) {
          if (t < e.start || t > e.end) continue;
          const z = hazardZones([e], H, t)[0];
          if (!z || (z.mode !== "react" && z.mode !== "avoid")) continue;
          const o = worldOutline(built, i, [String(e.params?.scriptId ?? ""), String(e.params?.name ?? ""), (e as { id?: string }).id]) ?? (() => { const b0 = drawnBox(e, i) ?? (e.kind === "prop" ? propBox(plan, e) : null); return b0 ? { box: b0 } as Outline : null; })();
          if (!o) continue;
          for (const c of frames[i] ?? []) for (const side of ["l", "r"] as const) {
            const key = `${c.id}:${side}:${allTracks.indexOf(e)}`;
            if (z.lighter === `${c.id}:${side}Hand` || outlineGap(o, c.skeleton[`${side}Hand`]) > CONTACT_GAP_PX) { runs.delete(key); continue; }
            const run = (runs.get(key) ?? 0) + 1; runs.set(key, run);
            const avoid = z.mode === "avoid";
            if (run / fps > (avoid ? 0.1 : 0.3)) { bad = { who: c.id, at: (i - run + 1) / fps, what: z.what, avoid }; break; }
          }
          if (bad) break;
        }
      }
    } catch { /* (a scene the hazard check cannot read is not failed by it) */ }
    out.push({ law: "contactConsequence", ok: !bad, value: bad ? 1 : 0, limit: 0, at: bad?.at, who: bad?.who,
      say: bad ? (bad.avoid ? `${who(bad.who)}'s hand goes INTO ${bad.what} at ${sec(bad.at)} while only warming: keep a gap (hands beside / above it, never in it).` : `${who(bad.who)}'s hand stays inside ${bad.what} from ${sec(bad.at)} with no reaction: a burn / shock / cold / spike touch is felt — pull it out within 0.15 s (or the words must say it is on purpose).`) : "Every touch of a hazard gets its reaction." });
  }
  if (!n) out.push({ law: "frames", ok: false, value: 0, limit: 1, say: "The animation has no pictures." });
  // THE NOTHING-UNASKED LAW (SPEC-0019 v2, bench 1 — Arthur: "80% of the time it adds extra movements I never asked for… why is the
  // engine calling these a pass?"): no law compared the MOVES with what was asked — the forest girl ran past the log and turned back,
  // the seated typist stood up and walked, the chair walk stopped and started. Every figure's moves are read from the plan; a move
  // nobody asked for FAILS: a stop-and-go (two walks back to back), a turn back (travel, turn, travel) the words never ask for, a fall
  // the words never ask for, a sitter who stands up when nothing asks to stand or go, a figure who never moves in a handshake or a hug.
  {
    const words = `${ctx.words ?? ""}`.toLowerCase();
    if (words.trim()) {
      const TRAVEL = new Set(["walk", "run", "jog", "tiptoe", "sneak"]);
      const turnAsked = /\b(back|turns?|turned|turning|around|returns?|returned|spins?|paces?|fight|fights|spar|chase|chases|race|races|dance|dances|find|finds|search|searches|looks? for|looking for|lost)\b/.test(words);
      const fallAsked = /\b(fall|falls|fell|falling|trip|trips|tripped|slip|slips|slipped|knock|knocks|knocked|hit|hits|punch|punches|kick|kicks|fight|fights|spar|faint|faints|collapse|collapses|dive|dives|tumble|tumbles|stumble|stumbles|crash|crashes|explo\w*|wins?|loses?|knockout|lands?)\b/.test(words);
      const standAsked = /\b(stand|stands|stood|get up|gets up|got up|rise|rises|walk|walks|run|runs|leave|leaves|go|goes|jump|jumps|dance|dances|wake|wakes|bow|bows|greet|greets|chase|chases)\b/.test(words);
      const pairAsked = /\b(shake hands|shakes hands|handshake|hug|hugs)\b/.test(words);
      const bad: string[] = [];
      for (const c of plan.characters) {
        const acts = c.actions ?? [], name = who(c.id);
        for (let k = 1; k < acts.length; k += 1) {
          const a = acts[k - 1], b = acts[k];
          if (TRAVEL.has(a.move) && b.move === a.move && typeof a.params?.distance === "number" && typeof b.params?.distance === "number") bad.push(`${name} ${a.move}s, stops and ${a.move}s again`);
          if (!turnAsked && k + 1 < acts.length && TRAVEL.has(a.move) && b.move === "turn" && TRAVEL.has(acts[k + 1].move)) bad.push(`${name} turns back although nobody asked`);
        }
        if (!fallAsked && acts.some((a) => /^(fall|fallDown|knockedDown|knockDown|trip)$/.test(a.move))) bad.push(`${name} falls although nobody asked`);
        const sitAt = acts.findIndex((a) => a.move === "sitDownOn");
        if (!standAsked && sitAt >= 0 && acts.slice(sitAt + 1).some((a) => a.move === "standUp")) bad.push(`${name} stands up although nobody asked`);
        if (pairAsked && plan.characters.length >= 2 && !acts.length) bad.push(`${name} never moves in a two-person action`);
      }
      const uniq = [...new Set(bad)];
      out.push({ law: "unasked", ok: !uniq.length, value: uniq.length, limit: 0, say: uniq.length ? `Something nobody asked for: ${uniq.join("; ")}.` : "Every move was asked for." });
    }
  }
  // THE SOLID-THINGS LAW (SPEC-0019 v2, bench 1 — Arthur: "he jumps too late, he's already past the box"; the forest girl ran THROUGH
  // the log): measured on the drawn frames, a foot never goes INSIDE a solid thing standing on the ground (a box, a log, a rock, a chest,
  // a fence…): more than SOLID_IN into its drawn box, below its top. On its top (standing / landing on it) is fine; a held thing is skipped.
  {
    const SOLID = /\b(box|crate|chest|log|rock|stone|boulder|block|barrel|trunk|bale|fence|wall|bin|suitcase|snowman|cake|campfire|cauldron|pot|tree|stump)\b/i;
    const SOLID_IN = 0.04 * H;
    const solids = allTracks.filter((e) => e.kind === "prop" && !("character" in (e.anchor as object)) && SOLID.test(thingName(e)));
    const hits: string[] = [];
    let at0: number | undefined;
    for (const e of solids) {
      const f0 = Math.max(0, Math.ceil(e.start * fps)), f1 = Math.min(last, Math.floor(e.end * fps));
      for (const c of plan.characters) {
        // (the seat a figure sits on is not walked through: seen from the side, the hanging legs overlap a log or a box seat)
        if (e.params?.seat !== undefined && c.actions.some((a) => a.move === "sitDownOn")) continue;
        let hit = false;
        for (let i = f0; i <= f1 && !hit; i += 2) {
          // (the THING only — a rope tied to it and pulled by the figure is not part of the solid: Oct 14, a farmer pulling a stump)
          const b = drawnBox(e.params?.string ? { ...e, params: { ...e.params, string: undefined } } : e, i); if (!b || b.bottom - b.top < 0.08 * H) continue;
          const k = frames[i]?.find((q) => q.id === c.id); if (!k) continue;
          for (const foot of [k.skeleton.lFoot, k.skeleton.rFoot]) {
            if (foot.x > b.left + SOLID_IN && foot.x < b.right - SOLID_IN && foot.y > b.top + SOLID_IN && foot.y < b.bottom + 2) { hits.push(`${who(c.id)}'s foot goes into the ${thingName(e)} at ${sec(i / fps)}`); at0 ??= i / fps; hit = true; break; }
          }
        }
      }
    }
    out.push({ law: "solid", ok: !hits.length, value: hits.length, limit: 0, ...(at0 !== undefined ? { at: at0 } : {}), say: hits.length ? `${hits.join("; ")} — nothing walks through a solid thing.` : "Nobody walks through a solid thing." });
  }
  // HUGS AIR (Arthur, Oct 15, the station hug: "the pink stick figure hugs thin air, and the brown also hugs thin air — they never
  // truly hug"): from just after a hug's arms close (`touch`) until they start to let go, the hugger's nearer hand is ON the
  // partner's back — within CONTACT_GAP_PX of the partner's drawn torso (neck to hip). Arms closed round empty air = broken.
  {
    const RELEASE_S = 0.6; // (the `release` mark is where the arms are open again: they start opening ~0.5–0.6 s before)
    const all3 = (scene as Scene & { marks?: Record<string, number> }).marks ?? {};
    let worst = 0, worstLim = CONTACT_GAP_PX, whoW = "", atW: number | undefined, partnerW = "", bad = false;
    for (const c of plan.characters) {
      c.actions.forEach((a, idx) => {
        if (a.move !== "hug") return;
        const n = c.actions.slice(0, idx + 1).filter((x) => x.move === "hug").length;
        const t0 = all3[`${c.id}.hug${n}.touch`], t1 = all3[`${c.id}.hug${n}.release`];
        if (t0 === undefined || t1 === undefined) return;
        const withId = (a.params as { with?: unknown } | undefined)?.with;
        const mine = charFrames(c.id);
        for (let i = Math.max(0, Math.ceil((t0 + 0.08) * fps)); i <= Math.min(last, Math.floor((t1 - RELEASE_S) * fps)); i += 1) {
          const me = mine[i]; if (!me) continue;
          // (the partner: the one named, else the nearest other figure)
          const others = (frames[i] ?? []).filter((q) => q.id !== c.id && (typeof withId !== "string" || q.id === withId));
          const them = others.sort((p, q) => Math.abs(p.skeleton.hip.x - me.skeleton.hip.x) - Math.abs(q.skeleton.hip.x - me.skeleton.hip.x))[0];
          if (!them) continue;
          const A = them.skeleton.neck, B = them.skeleton.hip, ab = { x: B.x - A.x, y: B.y - A.y }, L2 = ab.x * ab.x + ab.y * ab.y || 1;
          const toTorso = (p: { x: number; y: number }) => { const u = Math.max(0, Math.min(1, ((p.x - A.x) * ab.x + (p.y - A.y) * ab.y) / L2)); return Math.hypot(p.x - (A.x + ab.x * u), p.y - (A.y + ab.y * u)); };
          // (ONE TRUTH, Oct 15: the nearer hand is ON the partner's DRAWN back — the torso line as drawn (half its line width), or the
          // World's outline of the partner — within CONTACT_GAP_PX; no 0.1 H "near the back")
          const wo = worldOutline(built, i, [them.id]), pad = (them.style?.thickness ?? 3) / 2;
          const gapOf = (p: { x: number; y: number }) => wo ? outlineGap(wo, p) : Math.max(0, toTorso(p) - pad);
          const gap = Math.min(gapOf(me.skeleton.lHand), gapOf(me.skeleton.rHand));
          if (gap - CONTACT_GAP_PX > worst - worstLim) { worst = gap; worstLim = CONTACT_GAP_PX; whoW = c.id; atW = i / fps; partnerW = them.id; bad = gap > CONTACT_GAP_PX; }
        }
      });
    }
    out.push({ law: "hugsAir", ok: !bad, value: r1(worst), limit: r1(worstLim), ...(atW !== undefined ? { at: atW } : {}), ...(whoW ? { who: whoW } : {}), say: !bad ? "Every hug wraps round a real body." : `${who(whoW)} hugs thin air at ${sec(atW ?? 0)}: the hands are ${px(worst)} from ${who(partnerW)}'s back — the arms close only when the two bodies touch (the faster one keeps coming to meet the slower).` });
  }
  // TOUCH INTENT (Oct 15 core audit: "contacts only work for 4 move types — custom 'touch/shake' moves have no contact at all"): a
  // CUSTOM move whose name says the hand goes ONTO something (touch, hold, shake hands, press, push, catch, grab, knock, pat, tap) must
  // really get a hand within CONTACT_GAP_PX of that target's DRAWN outline at its closest moment during the move. The target is the
  // figure / thing the name mentions, else the nearest figure or thing. Family: every custom touch the AI writes — knocks on doors,
  // pats on backs, taps on hats, pressed buttons, pushed carts, caught balls, grabbed ropes, handshakes.
  {
    let bad: { who: string; at: number; move: string; what: string; gap: number } | null = null;
    const marks5 = scene.marks ?? {};
    const words = (t: string) => t.toLowerCase().replace(/([a-z])([A-Z])/g, "$1 $2").split(/[^a-z0-9]+/).filter((w) => w.length >= 3 && !["the", "and", "his", "her", "its", "big", "small", "little"].includes(w));
    for (const c of plan.characters) {
      let nCustom = 0;
      for (const a of c.actions) {
        if (a.move !== "custom") continue;
        nCustom += 1;
        const name = String((a.params as { name?: unknown } | undefined)?.name ?? "");
        const verb = touchVerb(name), object = verb ? touchObject(name) : null;
        if (!verb || !object) continue;
        const pre = `${c.id}.custom${nCustom}.`, ts = Object.entries(marks5).filter(([k, v]) => k.startsWith(pre) && Number.isFinite(v)).map(([, v]) => v);
        if (!ts.length) continue;
        const f0 = Math.max(0, Math.floor((Math.min(...ts) - 0.15) * fps)), f1 = Math.min(last, Math.ceil((Math.max(...ts) + 0.15) * fps));
        const nameWords = new Set(words(object));
        const handshake = /\b(handshake|shake\w*\s+(his|her|their|the)?\s*hands?|shak\w*\s+hands?)\b/i.test(name);
        // the candidates: other figures, props, objects — each with its drawn outline at picture i
        type Cand = { what: string; named: boolean; at: (i: number) => Outline | null };
        const cands: Cand[] = [];
        for (const o of plan.characters) if (o.id !== c.id) cands.push({ what: who(o.id), named: words(`${o.name ?? ""} ${o.id}`).some((w) => nameWords.has(w)), at: (i) => { const f = frames[i]?.find((q) => q.id === o.id); if (!f) return null; if (handshake) return { segs: [[f.skeleton.rHand, f.skeleton.rHand], [f.skeleton.lHand, f.skeleton.lHand]], pad: (f.style?.thickness ?? 3) / 2 }; return worldOutline(built, i, [o.id]) ?? bodyOutline(f.skeleton as unknown as Record<string, { x: number; y: number }>, f.headRadius ?? 0.07 * H, f.style?.thickness ?? 3); } });
        if (!handshake) {
          for (const e of allTracks) { if (e.kind !== "prop" || heldAnchor(e)?.character === c.id) continue; const lbl = `${e.params?.name ?? ""} ${e.params?.symbol ?? ""}`; cands.push({ what: `the ${thingName(e)}`, named: words(lbl).some((w) => nameWords.has(w)), at: (i) => { if (i / fps < e.start || i / fps > e.end) return null; const w = worldOutline(built, i, [String(e.params?.scriptId ?? ""), String(e.params?.name ?? ""), (e as { id?: string }).id]); if (w) return w; const b0 = drawnBox(e, i) ?? propBox(plan, e); return b0 ? { box: b0 } : null; } }); }
          for (const so of scene.objects ?? []) cands.push({ what: `the ${so.name ?? so.id}`, named: words(`${so.name ?? ""} ${so.id}`).some((w) => nameWords.has(w)), at: (i) => { const fo = built.objects[i]?.find((x) => x.id === so.id); return fo ? objOutline(fo, i) : null; } });
        }
        const pool = cands.some((q) => q.named) ? cands.filter((q) => q.named) : cands;
        if (!pool.length) continue;
        let best = Infinity, bestAt = f0, bestWhat = pool[0].what;
        for (let i = f0; i <= f1; i += 1) {
          const me = frames[i]?.find((q) => q.id === c.id); if (!me) continue;
          for (const q of pool) { const o = q.at(i); if (!o) continue; const g = Math.min(outlineGap(o, me.skeleton.lHand), outlineGap(o, me.skeleton.rHand)); if (g < best) { best = g; bestAt = i; bestWhat = q.what; } }
        }
        if (Number.isFinite(best) && best > CONTACT_GAP_PX && (!bad || best > bad.gap)) bad = { who: c.id, at: bestAt / fps, move: name, what: bestWhat, gap: best };
      }
    }
    out.push({ law: "touchIntent", ok: !bad, value: bad ? r1(bad.gap) : 0, limit: CONTACT_GAP_PX, ...(bad ? { at: bad.at, who: bad.who } : {}),
      say: bad ? `${who(bad.who)}'s move "${bad.move}" says the hand touches ${bad.what}, but at its closest (${sec(bad.at)}) the hand is still ${px(bad.gap)} away: a touch TOUCHES — put the hand ON it (a custom key's rHand/lHand target on the thing, or step closer).` : "Every move that says it touches really touches." });
  }
  // ROPE IN BOTH FISTS (Arthur, Oct 15, tug of war: "he's holding the rope — but it's just a pixel he's not holding; we're going for
  // perfection"): while a figure PULLS a rope (the pull move: both hands on it), the DRAWN rope passes through BOTH its hands — each
  // within ROPE_GRIP px of the rope's line or its loose end.
  {
    const ROPE_GRIP = 2;
    const all4 = (scene as Scene & { marks?: Record<string, number> }).marks ?? {};
    const pullEnd = (id: string) => Math.max(-Infinity, ...Object.entries(all4).filter(([k]) => new RegExp(`^${id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\.pull\\d+\\.`).test(k)).map(([, v]) => v));
    let worst = 0, whoR = "", atR: number | undefined;
    for (const e of allTracks) {
      if (e.kind !== "prop" || !e.params?.string || e.params?.slack === true || !e.target) continue;
      const recipe = EFFECTS[e.kind]; if (!recipe) continue;
      const holders = [heldAnchor(e)?.character, (e.target as { character?: unknown }).character].filter((x): x is string => typeof x === "string");
      const pullers = holders.filter((id) => plan.characters.find((c) => c.id === id)?.actions.some((a) => a.move === "pull"));
      if (!pullers.length) continue;
      const f0 = Math.max(0, Math.ceil(e.start * fps)), f1 = Math.min(last, Math.floor((e.end - 0.01) * fps));
      for (let i = f0; i <= f1; i += 2) {
        const at = anchorAt(e.anchor, frames[i] ?? [], built.objects[i] ?? []); if (!at) continue;
        const facing = "character" in e.anchor ? (frames[i] ?? []).find((c) => c.id === (e.anchor as { character: string }).character)?.facing : undefined;
        let shapes: Shape[] = [];
        try { shapes = recipe.draw({ t: i / fps - e.start, duration: e.end - e.start, fps, at, target: anchorAt(e.target, frames[i] ?? [], built.objects[i] ?? []), height: H, groundY: G, stageWidth: ctx.stageWidth, ...(facing ? { facing } : {}), ...("character" in e.anchor ? { held: true } : {}) } as never, e.params ?? {}); } catch { continue; }
        const lines = shapes.filter((s): s is Extract<Shape, { kind: "line" }> => s.kind === "line");
        if (!lines.length) continue;
        const toRope = (p: { x: number; y: number }) => { let best = Infinity; for (const l of lines) for (let k = 0; k + 3 < l.points.length; k += 2) { const ax = l.points[k], ay = l.points[k + 1], bx = l.points[k + 2], by = l.points[k + 3], dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy || 1, u = Math.max(0, Math.min(1, ((p.x - ax) * dx + (p.y - ay) * dy) / L2)); best = Math.min(best, Math.hypot(p.x - ax - dx * u, p.y - ay - dy * u)); } return best; };
        for (const id of pullers) {
          if (i / fps > pullEnd(id)) continue;
          const k = frames[i]?.find((c) => c.id === id); if (!k) continue;
          for (const hnd of [k.skeleton.lHand, k.skeleton.rHand]) { const g = toRope(hnd); if (g > worst) { worst = g; whoR = id; atR = i / fps; } }
        }
      }
    }
    out.push({ law: "ropeGrip", ok: worst <= ROPE_GRIP, value: r1(worst), limit: ROPE_GRIP, ...(atR !== undefined ? { at: atR } : {}), ...(whoR ? { who: whoR } : {}), say: worst <= ROPE_GRIP ? "Every puller's two fists are on the rope." : `${who(whoR)}'s hand is ${px(worst)} off the rope at ${sec(atR ?? 0)}: a puller holds the rope in BOTH fists, exactly.` });
  }
  return out;
}

export const failedSays =(measures: readonly Measure[], max = 2) => measures.filter((m) => !m.ok).slice(0, max).map((m) => m.say);
