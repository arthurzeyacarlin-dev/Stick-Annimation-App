import { solveTwoBone } from "./ik.ts";
import { translateSkeleton } from "./pose.ts";
import { boneLengths, type Point, type Skeleton } from "./rig.ts";
import type { FrameCharacter, FrameObject, Scene, SceneCharacter, SceneObject } from "./engine.ts";
import { buildObjectFrames, carryWeight, pictureOf } from "./objects.ts";
import { propBox } from "./laws/propBox.ts";
import { FLAT_SCALE, flightStyleOf } from "./objectFlight.ts";

// THE WORLD'S RESOLVER (world.ts registers `propTargetPoint` here when it loads — a registry, not an import, so the engine's
// module order stays as it was: engine → contacts must not pull the whole effects pipeline in).
export type PropTargetResolver = (scene: Scene, frames: FrameCharacter[][], fps: number, index: number, target: { prop: number; point?: "top" | "near" }, hand: Point, height: number) => Point | null;
let propTargetPoint: PropTargetResolver | undefined;
export function setPropTargetResolver(fn: PropTargetResolver) { propTargetPoint = fn; }
import type { EffectTrack } from "./effects/types.ts";

// THE FINAL CONTACT-SOLVE PASS (Oct 15 audit). A move only PLANS a touch (a handshake, a high-five, a hug, both fists on a
// rope, a hand on a shoulder, a hand on a stove top, a hand on a frisbee's rim) as pose angles against a GUESS of where the
// partner / thing will be. Then the engine re-samples the angles, plants feet and moves hips — so the hands drift apart. This
// pass runs AFTER all of that on the FINAL frames: a move DECLARES its contacts on the scene (`scene.contacts`), and for every
// picture inside a contact the limb is re-solved with exact bone lengths (two-bone IK) so the hand or foot is exactly on its
// target, read from the final frame data (the other figure's real joint, a point, a rope line, a prop's drawn box, an
// object's surface). Two figures reaching for each other meet at the MIDPOINT. Out of reach: the whole figure shifts a little
// toward the target (at most CONTACT_SHIFT x height); further than that it can't reach and the law reports it.
// THE BLEND-IN: the solve eases in over ~3 pictures (CONTACT_BLEND_PICTURES) so nothing pops (law #1: smooth).
// THE CLEAN LET-GO (Arthur, Oct 15: the high-five arms were "glued — they couldn't separate"): when a contact ends, the hand is
// NOT held at the meeting point while the arms pull apart. The seat where the touch ended is frozen, and over the blend-out
// the hand's goal slides from that frozen seat back onto the limb's OWN planned path (where the arm is naturally going) —
// so two hands that met leave each other along their own swings, never dragging each other.
// Objects are anchored AFTER this pass, so a held thing rides the solved hand (a caught frisbee follows the solved catch).
// Family: every touch of anything — handshakes, high-fives, hugs, taps, pats, rope pulls, catches, grabs, holds, hands on
// stoves / tables / walls, ride decks — and every clean release of one.

export type ContactJoint = "lHand" | "rHand" | "lFoot" | "rFoot";
export type ContactTarget =
  | { figure: string; joint: keyof Skeleton; offset?: Point } // another figure's joint (offset in stage px)
  | { x: number; y: number } // a fixed spot on the stage
  | { line: [Point, Point] } // the nearest spot on a line (a rope): the fist slides along it, never off it
  | { prop: number; point?: "top" | "near" } // a fixed prop's drawn box (scene.effects index): its top middle, or the nearest spot on its edge
  | { object: string; grip?: "rim" | "palm" }; // a scene object's surface nearest the hand (rim), or a palm's grip a little into it
export type SceneContact = { figure: string; joint: ContactJoint; target: ContactTarget; from: number; to: number; blendPictures?: number };
// firstTouch: the time (s) of the first picture where the joint is on its target (within CONTACT_LIMIT_PX), from the blend-in on;
// firstTouchFrame: that picture's index; gapPx: the miss at that moment (the first-touch gap the events start from).
export type ContactReport = {
  reachable: boolean; worstMissPx: number;
  firstTouch?: number; firstTouchFrame?: number; gapPx?: number;
  contact: { kind: string; figure: string; joint: ContactJoint; from: number; to: number; seat: Point };
};

export const CONTACT_SHIFT = 0.05; // x height: the most the whole figure shifts toward a target it can't quite reach
export const CONTACT_BLEND_PICTURES = 3; // the solve eases in over this many pictures before `from` and out after `to`
export const CONTACT_LIMIT_PX = 2; // a declared contact joint is on its target within this (flat px) on every picture inside it
const PALM_SINK = 0.1; // x the object's radius: a palm grip sits this little way into the thing (objects.ts GRIP = 0.9)

const smooth = (u: number) => { const c = Math.min(1, Math.max(0, u)); return c * c * (3 - 2 * c); };
const nearestOnLine = (p: Point, [a, b]: [Point, Point]): Point => {
  const dx = b.x - a.x, dy = b.y - a.y, len2 = dx * dx + dy * dy;
  const u = len2 < 1e-9 ? 0 : Math.min(1, Math.max(0, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
  return { x: a.x + dx * u, y: a.y + dy * u };
};

// How strongly a contact applies at time t: 1 inside [from, to], easing to 0 over the blend window outside it.
export const contactWeight = (c: SceneContact, t: number, fps: number) => {
  const blend = (c.blendPictures ?? CONTACT_BLEND_PICTURES) / fps;
  if (t >= c.from && t <= c.to) return 1;
  if (t < c.from) return smooth(1 - (c.from - t) / blend);
  return smooth(1 - (t - c.to) / blend);
};

const limbOf = (joint: ContactJoint) => joint.endsWith("Hand")
  ? { root: "neck" as const, mid: (joint === "lHand" ? "lElbow" : "rElbow") as keyof Skeleton, upper: "upperArm" as const, lower: "forearm" as const }
  : { root: "hip" as const, mid: (joint === "lFoot" ? "lKnee" : "rKnee") as keyof Skeleton, upper: "thigh" as const, lower: "shin" as const };

type FxScene = Scene & { effects?: EffectTrack[]; height?: number };
const sceneHeight = (scene: FxScene) => Number(scene.height ?? Math.max(0, ...scene.characters.map((c) => c.height))) || 300;

// The nearest spot on a box's edge to p (p inside the box: the nearest edge).
function nearestOnBox(p: Point, b: { left: number; right: number; top: number; bottom: number }): Point {
  const x = Math.min(b.right, Math.max(b.left, p.x)), y = Math.min(b.bottom, Math.max(b.top, p.y));
  if (x !== p.x || y !== p.y) return { x, y };
  const d = [{ d: p.x - b.left, q: { x: b.left, y } }, { d: b.right - p.x, q: { x: b.right, y } }, { d: p.y - b.top, q: { x, y: b.top } }, { d: b.bottom - p.y, q: { x, y: b.bottom } }];
  return d.sort((a, c) => a.d - c.d)[0].q;
}

// Where this contact wants the joint, read from the FINAL picture. A partner contact that points back at us (a handshake,
// a high-five: both hands declared on each other) meets at the midpoint of the two current joints.
function targetOf(c: SceneContact, all: SceneContact[], frame: FrameCharacter[], own: Skeleton, scene: FxScene, objects: FrameObject[] | undefined, at?: { frames: FrameCharacter[][]; fps: number; index: number }): Point | null {
  const tg = c.target;
  if ("line" in tg) return nearestOnLine(own[c.joint], tg.line);
  if ("figure" in tg) {
    const other = frame.find((f) => f.id === tg.figure);
    if (!other) return null;
    const theirs = other.skeleton[tg.joint];
    const back = all.some((o) => o !== c && o.figure === tg.figure && o.joint === tg.joint && "figure" in o.target && o.target.figure === c.figure && o.target.joint === c.joint);
    const p = { x: theirs.x + (tg.offset?.x ?? 0), y: theirs.y + (tg.offset?.y ?? 0) };
    return back ? { x: (p.x + own[c.joint].x) / 2, y: (p.y + own[c.joint].y) / 2 } : p;
  }
  if ("prop" in tg) {
    // (ONE WORLD, world.ts: the thing's EXACT drawn outline in this very picture — its drawn top under the hand, or its nearest
    // drawn surface. The laws' propBox is the fallback when the thing is not drawn in this picture.)
    if (at && propTargetPoint) { const p = propTargetPoint(scene, at.frames, at.fps, at.index, tg, own[c.joint], sceneHeight(scene)); if (p) return p; }
    const e = scene.effects?.[tg.prop];
    if (!e) return null;
    const box = propBox({ height: sceneHeight(scene), groundY: scene.groundY } as Parameters<typeof propBox>[0], e);
    if (!box) return null;
    return tg.point === "near" ? nearestOnBox(own[c.joint], box) : { x: box.cx, y: box.top };
  }
  if ("object" in tg) {
    const o = objects?.find((f) => f.id === tg.object);
    if (!o) return null;
    const r = (o.look.size / 2) * (Math.abs(o.scaleX) + Math.abs(o.scaleY)) / 2;
    const h = own[c.joint], d = Math.hypot(h.x - o.x, h.y - o.y);
    const u = d > 1e-6 ? { x: (h.x - o.x) / d, y: (h.y - o.y) / d } : { x: 0, y: -1 };
    const at = tg.grip === "palm" ? r * (1 - PALM_SINK) : r;
    return { x: o.x + u.x * at, y: o.y + u.y * at };
  }
  return { x: tg.x, y: tg.y };
}

// Re-solve the limb so `joint` sits on `target` (blend 0..1 pulls it part of the way: the target is blended, the bones stay exact).
export function solveLimbTo(skeleton: Skeleton, joint: ContactJoint, target: Point, height: number, weight: number): { skeleton: Skeleton; missPx: number; reachable: boolean } {
  const bones = boneLengths(height), limb = limbOf(joint);
  const root = skeleton[limb.root], now = skeleton[joint];
  const goal = { x: now.x + (target.x - now.x) * weight, y: now.y + (target.y - now.y) * weight };
  const reach = bones[limb.upper] + bones[limb.lower];
  let body = skeleton;
  const far = Math.hypot(goal.x - root.x, goal.y - root.y);
  let reachable = true;
  if (far > reach * 0.999) {
    // The whole figure shifts a little toward the target (never more than CONTACT_SHIFT x height).
    const need = far - reach * 0.999, allowed = Math.min(need, CONTACT_SHIFT * height) * weight;
    const ux = (goal.x - root.x) / far, uy = (goal.y - root.y) / far;
    body = translateSkeleton(skeleton, ux * allowed, uy * allowed);
    reachable = need <= CONTACT_SHIFT * height + 1e-6;
  }
  const r = body[limb.root];
  // The middle joint keeps bending the way it bends now (a knee stays forward, an elbow stays as the move drew it).
  const midNow = body[limb.mid], mx = (r.x + body[joint].x) / 2, my = (r.y + body[joint].y) / 2;
  let bend = { x: midNow.x - mx, y: midNow.y - my };
  if (Math.hypot(bend.x, bend.y) < 1e-3) bend = limb.root === "hip" ? { x: 0, y: -1 } : { x: 0, y: 1 };
  const solved = solveTwoBone(r, goal, bones[limb.upper], bones[limb.lower], bend);
  const out = { ...body, [limb.mid]: solved.mid, [joint]: solved.end } as Skeleton;
  return { skeleton: out, missPx: Math.hypot(out[joint].x - target.x, out[joint].y - target.y), reachable };
}

// The pass itself: edits the frames in place; returns one report per declared contact (worst miss inside [from, to], first touch).
export function solveContacts(scene: Scene, frames: FrameCharacter[][], pictureTimes: number[], fps: number): ContactReport[] {
  const contacts = scene.contacts ?? [];
  if (!contacts.length) return [];
  const heights = new Map(scene.characters.map((c: SceneCharacter) => [c.id, c.height]));
  // (OBJECT TARGETS: where the things are before anyone's hand is solved onto them — their keys and flights; a held thing is
  // rebuilt on the solved hand afterwards by the engine.)
  const objects = contacts.some((c) => "object" in c.target) ? buildObjectFrames(scene, fps, frames, pictureTimes) : undefined;
  const reports = contacts.map((c): ContactReport => ({ reachable: true, worstMissPx: 0, contact: { kind: "contact", figure: c.figure, joint: c.joint, from: c.from, to: c.to, seat: { x: 0, y: 0 } } }));
  // THE CLEAN LET-GO: the seat where each touch ended, frozen; after `to` the goal slides from it back onto the limb's own path.
  const frozen: (Point | null)[] = contacts.map(() => null);
  for (let index = 0; index < frames.length; index += 1) {
    const t = pictureTimes[index], frame = frames[index];
    // Two passes so a pair meeting at the midpoint both read the same meeting spot.
    const goals = contacts.map((c, k) => {
      const w = contactWeight(c, t, fps);
      if (w <= 0) return null;
      const me = frame.find((f) => f.id === c.figure);
      if (!me) return null;
      // (A HAND REACHES FOR WHERE THE THING WILL BE, Oct 15 T2: during the blend-in an object target is read on the picture where the
      // touch starts — the hands close onto the catch spot as the ball arrives, never lunge out at it while it is still in the air.)
      const objectsAt = objects && "object" in c.target && t < c.from ? objects[Math.min(objects.length - 1, pictureOf(c.from, fps, objects.length, pictureTimes))] : objects?.[index];
      const target = t > c.to && frozen[k] ? frozen[k] : targetOf(c, contacts, frame, me.skeleton, scene as FxScene, objectsAt, { frames, fps, index });
      return target ? { c, w, target } : null;
    });
    goals.forEach((g, k) => {
      if (!g) return;
      const me = frame.find((f) => f.id === g.c.figure)!;
      const height = heights.get(g.c.figure) ?? 400;
      const solved = solveLimbTo(me.skeleton, g.c.joint, g.target, height, g.w);
      me.skeleton = solved.skeleton;
      const rep = reports[k];
      if (rep.firstTouch === undefined && solved.missPx <= CONTACT_LIMIT_PX) { rep.firstTouch = t; rep.firstTouchFrame = index; rep.gapPx = solved.missPx; }
      if (t >= g.c.from - 1e-9 && t <= g.c.to + 1e-9) {
        frozen[k] = g.target;
        if (solved.missPx > rep.worstMissPx) { rep.worstMissPx = solved.missPx; rep.contact.seat = g.target; }
        if (!solved.reachable) rep.reachable = false;
      }
    });
  }
  // (never on it: the first touch is reported at `from` with the worst gap, so the events still know where it should have been)
  reports.forEach((rep, k) => { if (rep.firstTouch === undefined) { rep.firstTouch = contacts[k].from; rep.gapPx = rep.worstMissPx; } });
  return reports;
}

// BOTH PALMS ON A SMALL THING (Oct 15, T2: the caught baseball hung 9.5 px off Dad's palms, the relay baton 19 px off the
// teammate's): the two-hand poses (catch, hold, take) are drawn for a basketball (throwCatch.ts BALL_RADIUS), so anything
// smaller held "in both hands" sat in the middle with each palm floating off it. Every two-hand hold of a LIGHT thing
// (objects.ts carryWeight) declares both hands on the thing at palm grip for the whole hold — the pass closes the hands onto
// its drawn edge, and the blend-in (CONTACT_BLEND_PICTURES) is the hands closing onto it as it arrives (caught, handed over,
// picked up), never a pop. A basketball already sits at palm grip, so it does not move. A hand some move already declared
// in that span keeps its own contact. Family: every two-hand catch, take, hand-off and carry of a small thing.
export function palmsOnSmallThings(objects: readonly SceneObject[], heightOf: (figure: string) => number, already: readonly SceneContact[] = []): SceneContact[] {
  const out: SceneContact[] = [];
  for (const o of objects) for (const g of o.segments ?? []) {
    // (THE HAND-OFF PICTURE: the giver's hand is still on the thing at the moment the taker's hands have it — a light thing passed
    // straight from one figure's hold into another's keeps the giver's holding hand(s) on it at that instant, then they let go.)
    const next = g.mode === "held" ? (o.segments ?? []).find((n) => n.mode === "held" && n.character !== g.character && Math.abs(n.from - g.to) < 1e-6) : undefined;
    if (g.mode === "held" && next && g.to > g.from && carryWeight(o.look, heightOf(g.character)) === "light" && FLAT_SCALE[flightStyleOf(o.id, o.name, o.look.kind)] === 1)
      for (const joint of g.joint === "hands" ? (["lHand", "rHand"] as const) : g.joint === "lHand" || g.joint === "rHand" ? [g.joint] : []) {
        if (!already.some((c) => c.figure === g.character && c.joint === joint && c.from <= g.to && c.to >= g.to)) out.push({ figure: g.character, joint, target: { object: o.id, grip: "palm" }, from: g.to, to: g.to });
      }
    if (g.mode !== "held" || g.joint !== "hands" || g.to <= g.from) continue;
    if (carryWeight(o.look, heightOf(g.character)) !== "light") continue;
    // (a flat thing seen edge-on — a frisbee — is gripped at its rim by objects.ts heldCenter's ellipse, not a round palm grip)
    if (FLAT_SCALE[flightStyleOf(o.id, o.name, o.look.kind)] !== 1) continue;
    for (const joint of ["lHand", "rHand"] as const) {
      if (already.some((c) => c.figure === g.character && c.joint === joint && c.from < g.to && c.to > g.from)) continue;
      out.push({ figure: g.character, joint, target: { object: o.id, grip: "palm" }, from: g.from, to: g.to });
    }
  }
  return out;
}
