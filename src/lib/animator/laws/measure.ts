import type { DirectedPlan } from "../director/repair.ts";
import { footfalls } from "../director/repair.ts";
import type { FrameCharacter, FrameObject, Scene, SceneFrames } from "../engine.ts";
import { JOINTS } from "../rig.ts";
import { animationBounds, effectFitBounds } from "../stageFit.ts";
import { propBox } from "./propBox.ts";
import type { EffectTrack } from "../effects/types.ts";
const SIT_ABOVE = 0.03; // x H: the hips center sits this far above the seat point (world/contacts.ts in the rejected copy)
import { EFFECTS, anchorAt } from "../effects/index.ts";
import type { Shape } from "../effects/types.ts";
import { thingFor } from "../things.ts";
import { placedSymbol } from "../symbolMaker.ts";
import { FAST_MOVES, FAST_WORDS, HAND_SPEED_MAX, SPEED_JUMP_MAX, STILL_SPEED, THROW_SPEED_MAX } from "../moves/timing.ts";

// SPEC-0021 NEW COPY: THE LAWS, carried over from the rejected copy as a CHECKER ONLY — they measure and say what broke; they never
// change the motion.
// THE MEASURER (SPEC-0019 Phase 0, Sat 2026-10-10): the engine reports in NUMBERS what it built, law by law, in kid words.
// It never changes anything. Every Measure is one law: ok / the value / the limit / when / who / what a kid would say.
// LAWS.md "THE STRAIGHT LINE" lists each law with its number.
export type Measure = { law: string; ok: boolean; value: number; limit: number; at?: number; who?: string; say: string };
export type MeasureContext = { stageWidth: number; askedSec?: number | null; words?: string };

export const HAND_TOL = 0.02; // x H: a hand is ON what it uses within this
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
export const STRIKE_MOVES = /punch|kick|jab|hook|uppercut|slap|block|dodge|strike|hit|getHit|clash|barrage|combo|dash/i; // fight moves that are fast on purpose (longEnough)
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
      const limit = HAND_TOL * H, ok = rep.reachable && rep.worstMissPx <= limit;
      out.push({ law: "hand", ok, value: r1(rep.worstMissPx), limit: r1(limit), at: c.from, who: c.figure, say: ok ? `${who(c.figure)}'s hand is on what it reaches for at ${sec(c.from)}.` : rep.reachable ? `${who(c.figure)}'s hand misses what it reaches for by ${px(rep.worstMissPx)} at ${sec(c.from)}.` : `${who(c.figure)} can't reach what the hand goes for at ${sec(c.from)} (too far by ${px(rep.worstMissPx)}): step closer.` });
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
  // "failed" during the flight because it was checked against the first holder on every frame). The palm hold puts the ball's
  // center about half its size + 8 px from the hand point: the limit is half the size + 0.03H.
  for (const so of (scene.objects ?? [])) {
    const holdsOf = (so.segments ?? []).filter((g): g is Extract<typeof g, { mode: "held" }> => g.mode === "held");
    if (!holdsOf.length) continue;
    const lim = HELD_TOL_PALM * H + so.look.size / 2;
    let worst = 0, at: number | undefined, who0 = holdsOf[0].character;
    for (const g of holdsOf) {
      const f0 = Math.max(0, Math.ceil(g.from * fps)), f1 = Math.min(last, Math.floor(g.to * fps));
      for (let i = f0; i <= f1; i += 1) {
        const fo = built.objects[i]?.find((x) => x.id === so.id), fc = frames[i]?.find((c) => c.id === g.character);
        if (!fo || !fc) continue;
        const d = Math.min(dist(fo, fc.skeleton.lHand), dist(fo, fc.skeleton.rHand));
        if (d > worst) { worst = d; at = i / fps; who0 = g.character; }
      }
    }
    out.push({ law: "held", ok: worst <= lim, value: r1(worst), limit: r1(lim), at, who: who0, say: worst <= lim ? `The ${so.name ?? so.id} stays in the hand of whoever holds it.` : `The ${so.name ?? so.id} is ${px(worst)} away from ${who(who0)}'s hand at ${sec(at ?? 0)} while held.` });
  }
  for (const e of props) {
    const h = heldAnchor(e);
    if (h) out.push({ law: "held", ok: true, value: 0, limit: r1(HELD_TOL * H), at: e.start, who: h.character, say: `The ${thingName(e)} rides ${who(h.character)}'s hand from ${sec(e.start)}.` });
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
      const overlap = Math.min(a.end, b.end, scene.durationSec) - Math.max(a.start, b.start);
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
  for (const { e, a, box } of boxes) {
    if (e.params?.onWall || e.params?.hangs) continue;
    // (Phase C2, PM: measured at the thing's BOTTOM — a catalog mug's anchor is its middle, so the anchor said "floats 231 px" for a mug sitting on the table)
    const bottomY = Number.isFinite(box.bottom) ? box.bottom : a.y;
    const on = restsOn(bottomY, a.x, e.start, e.end, e);
    const gap = Math.abs(bottomY - G);
    out.push({ law: "floats", ok: on !== null, value: r1(gap), limit: r1(REST_TOL * H), at: e.start, say: on ? `The ${thingName(e)} stands on ${on}.` : `The ${thingName(e)} floats ${px(gap)} above the ground from ${sec(e.start)}: nothing holds it up.` });
  }
  for (const o of plan.objects ?? []) {
    if (o.heldBy || !o.keys?.length) continue;
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
    const held = Boolean(heldAnchor(e)), want = held ? "front" : "back", layer = e.layer ?? "back", ok = held ? layer === "front" || layer === "top" : layer === want;
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

  // 8. PACE: a walk covers its distance at 1.2–2.2 steps a second (footfalls over each travel span)
  for (const c of plan.characters) {
    const moves = c.actions.map((a) => a.move);
    if (!moves.includes("walk") || moves.some((m) => m === "run" || m === "jog")) continue;
    const mine = charFrames(c.id);
    const moving = mine.map((f, i) => Boolean(f && i > 0 && mine[i - 1] && Math.abs(f.skeleton.hip.x - mine[i - 1]!.skeleton.hip.x) > 0.004 * H));
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
      const ground = Math.abs((mine[j]?.skeleton.hip.x ?? 0) - (mine[i]?.skeleton.hip.x ?? 0));
      if (seconds >= TRAVEL_MIN_SEC && ground >= 0.5 * H) {
        const steps = footfalls(mine.slice(i, j + 2).map((f) => f?.skeleton), G, H).length;
        const rate = steps / seconds, ok = rate >= PACE_MIN && rate <= PACE_MAX;
        out.push({ law: "pace", ok, value: r2(rate), limit: PACE_MAX, at: r2(i / fps), who: c.id, say: ok ? `${who(c.id)} walks at a normal pace (${r1(rate)} steps a second).` : `${who(c.id)}'s walk at ${sec(i / fps)} is ${rate < PACE_MIN ? "too slow" : "too fast"}: ${r1(rate)} steps a second (should be ${PACE_MIN}–${PACE_MAX}).` });
      }
    }
  }

  // 9. LENGTH ≤ 15 s unless asked
  const limitSec = ctx.askedSec ? Math.max(MAX_SECONDS, ctx.askedSec + 2) : MAX_SECONDS;
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
        if (!before && !p?.grows && !p?.found && !p?.revealed) { fails.push(`the ${thingName(e)} appears from nowhere at ${sec(e.start)}`); at ??= e.start; }
      }
      for (const so of scene.objects ?? []) {
        const flights = (so.segments ?? []).filter((g) => g.mode === "flight");
        for (let i = 1; i < n; i += 1) {
          const a = built.objects[i - 1]?.find((o) => o.id === so.id), b2 = built.objects[i]?.find((o) => o.id === so.id);
          if (!a || !b2) continue; const t = i / fps;
          if (Math.hypot(b2.x - a.x, b2.y - a.y) > 0.25 * H && !flights.some((g) => t >= g.from - frameSec && t <= g.to + frameSec)) { fails.push(`the ${so.name ?? so.id} jumps ${px(Math.hypot(b2.x - a.x, b2.y - a.y))} in one picture at ${sec(t)}`); at ??= t; break; }
        }
      }
    }
    // (Bench 1: a HAND-OVER must not jump — at each rest→hand and hand→rest change of one thing, the DRAWN picture's center moves
    // ≤ 0.03H between the two pictures; EN found 54 px at a grab and 237 px at a put-down that the old law let through)
    if (!asked) for (const e of allTracks) {
      if (e.kind !== "prop" && e.kind !== "heldWeapon") continue;
      const prev = allTracks.find((o) => o !== e && Math.abs(o.end - e.start) <= 1.5 * frameSec && (o.kind === "prop" || o.kind === "heldWeapon") && (("character" in (o.anchor as object)) !== ("character" in (e.anchor as object))) && (thingKey(o) === thingKey(e) || o.kind !== e.kind));
      if (!prev) continue;
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
    for (const piece of (scene as Scene & { background?: { pieces?: { kind: string; params?: Record<string, unknown> }[] } }).background?.pieces ?? []) {
      const x = piece.params?.x, w = piece.params?.w;
      if (typeof x !== "number" || typeof w !== "number" || w >= 0.9 * W2) continue;
      const l = x - w / 2, r = x + w / 2;
      if ((l < -PAGE_TOL && r > 0) || (r > W2 + PAGE_TOL && l < W2)) cut.push(`the ${piece.kind}`);
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
  const fixedTracks = allTracks.filter((e) => e.kind === "prop" && fixedAnchor(e) && !((e.params?.onWall || e.params?.hangs) && canHang(e)) && !e.params?.flies && !e.params?.fast);
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
        const allowed = Math.max(1, asked2.get(base) ?? 0, scriptIds.get(base)?.size ?? 0, plural ? 6 : 0, holders.size);
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
        if (free <= FAKE_HOLD_TOL * H && withIt) { run += 1; if (run / fps > worstRun) { worstRun = run / fps; what = name; whoF = figure; at = (i - run + 1) / fps; } } else run = 0;
      }
    };
    for (const so of scene.objects ?? []) for (const g of (so.segments ?? [])) {
      if (g.mode !== "held" || g.joint === "hands") continue;
      check(so.name ?? so.id, g.character, Math.max(0, Math.ceil(g.from * fps)), Math.min(last, Math.floor(g.to * fps)), (i) => { const fo = built.objects[i]?.find((x) => x.id === so.id); return fo ? { x: fo.x, y: fo.y, r: so.look.size / 2 } : undefined; }, g.joint);
    }
    for (const e of allTracks) {
      const h = heldAnchor(e); if (!h || (e.kind !== "heldWeapon" && e.kind !== "prop")) continue;
      // (a sword, bat, axe, spear or staff is gripped with BOTH hands in a fight — that second hand is honest)
      if (/sword|katana|bat|axe|spear|staff|club|hammer|pole/i.test(String(e.params?.weapon ?? e.params?.symbol ?? e.params?.name ?? ""))) continue;
      if (h.joint !== "lHand" && h.joint !== "rHand") continue;
      const f0 = Math.max(0, Math.ceil(e.start * fps)), f1 = Math.min(last, Math.floor(Math.min(e.end, scene.durationSec) * fps));
      check(e.kind === "heldWeapon" ? String(e.params?.weapon ?? "thing") : thingName(e), h.character, f0, f1, (i) => { const bx = drawnBox(e, i); return bx ? { x: (bx.left + bx.right) / 2, y: (bx.top + bx.bottom) / 2, r: 0, box: bx } : undefined; }, h.joint as "lHand" | "rHand");
    }
    out.push({ law: "honestHands", ok: worstRun < FAKE_HOLD_S, value: r2(worstRun), limit: FAKE_HOLD_S, at, who: whoF || undefined, say: worstRun < FAKE_HOLD_S ? "Every hand that looks like it holds something really holds it." : `${who(whoF)}'s free hand sits on the ${what} for ${sec(worstRun)} at ${sec(at ?? 0)} but doesn't hold it: hands don't lie.` });
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
    const ok = fastest <= RISE_MAX + 1e-6 && riseS >= RISE_MIN_S - 1e-6;
    out.push({ law: "standUp", ok, value: r2(fastest), limit: RISE_MAX, at: atF, who: c.id, say: ok ? `${who(c.id)} stands up like a person (${sec(riseS)}).` : `${who(c.id)} gets up like a ghost at ${sec(atF ?? 0)}: hips rise ${r2(fastest)} H a second (max ${RISE_MAX}) and the get-up takes ${sec(riseS)} (at least ${RISE_MIN_S} s).` });
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
    const allMarks = Object.entries((scene as Scene & { marks?: Record<string, number> }).marks ?? {});
    for (const c of plan.characters) {
      // the figure's beats (from its marks "<who>.<move><n>.<mark>"): each beat's last mark; a picture belongs to the next beat to end
      // (its approach / wind-up) and, within 0.6 s after a beat, also to that beat (its recovery)
      const ends = new Map<string, number>();
      for (const [key, v] of allMarks) { const m = key.match(/^([^.]+)\.([A-Za-z]+\d+)\.(\w+)$/); if (m && m[1] === c.id && Number.isFinite(v)) ends.set(m[2], Math.max(ends.get(m[2]) ?? -Infinity, v)); }
      const beats = [...ends].map(([mv, end]) => ({ name: mv.replace(/\d+$/, ""), end })).sort((a, b2) => a.end - b2.end);
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
          const t = i / fps, { next, prev } = beatAt(t);
          if ((next && FAST_MOVES.test(next)) || (prev && FAST_MOVES.test(prev))) continue;
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

  // 11. BODY: bones never stretch, planted feet never slide, nobody goes under the ground (the engine's own report)
  for (const r of built.report.characters) {
    out.push({ law: "bones", ok: r.maxBoneErrorPx <= 0.5, value: r1(r.maxBoneErrorPx), limit: 0.5, who: r.id, say: r.maxBoneErrorPx <= 0.5 ? `${who(r.id)}'s bones keep their length.` : `${who(r.id)}'s bones stretch or shrink by ${px(r.maxBoneErrorPx)}.` });
    out.push({ law: "feet", ok: r.maxFootDriftPx <= 1, value: r1(r.maxFootDriftPx), limit: 1, who: r.id, say: r.maxFootDriftPx <= 1 ? `${who(r.id)}'s planted feet stay put.` : `${who(r.id)}'s planted feet slide ${px(r.maxFootDriftPx)}.` });
    out.push({ law: "ground", ok: r.belowGroundFrames === 0, value: r.belowGroundFrames, limit: 0, who: r.id, say: r.belowGroundFrames === 0 ? `${who(r.id)} stays above the ground.` : `${who(r.id)} goes under the ground in ${r.belowGroundFrames} pictures.` });
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
          const b = drawnBox(e, i); if (!b || b.bottom - b.top < 0.08 * H) continue;
          const k = frames[i]?.find((q) => q.id === c.id); if (!k) continue;
          for (const foot of [k.skeleton.lFoot, k.skeleton.rFoot]) {
            if (foot.x > b.left + SOLID_IN && foot.x < b.right - SOLID_IN && foot.y > b.top + SOLID_IN && foot.y < b.bottom + 2) { hits.push(`${who(c.id)}'s foot goes into the ${thingName(e)} at ${sec(i / fps)}`); at0 ??= i / fps; hit = true; break; }
          }
        }
      }
    }
    out.push({ law: "solid", ok: !hits.length, value: hits.length, limit: 0, ...(at0 !== undefined ? { at: at0 } : {}), say: hits.length ? `${hits.join("; ")} — nothing walks through a solid thing.` : "Nobody walks through a solid thing." });
  }
  return out;
}

export const failedSays = (measures: readonly Measure[], max = 2) => measures.filter((m) => !m.ok).slice(0, max).map((m) => m.say);
