// FINISH MY ANIMATION — from a READ of the whole animation (SPEC-0017 "50-50" round 4, 2026-10-07). Arthur: "It has
// to understand where this animation is going. He's standing, has an anticipation, and fully extended his legs — it's
// a hop: he goes up and comes down. Where is the floor? He should not levitate." And: "What if I'm not drawing a stick
// figure — lightning, an explosion…? The engine has to know other than stick figures."
// The eyes (vision/readAnimation.ts) say where the floor is, how big the figure is, what each drawn frame is doing
// (phases) and which frames are effects. This file decides what comes NEXT and builds it with the engine's own moves:
//   take-off / going up      -> finish the hop: up at a take-off speed that fits the crouch, gravity, land ON the floor
//   crouch (anticipation)    -> the hop it was winding up for (push off, then the same hop)
//   top / coming down / any  -> fall with gravity from where it is, land on the floor with a dip, stand
//   pose above the floor
//   walking / running        -> keep going off the page
//   landing / standing       -> absorb / settle into a stand
//   an effect (no figure)    -> THE EFFECT finishes from the stage the drawing shows (lightning strikes and fades, an
//                               explosion breaks up and fades…), as big and where it was drawn
// The physics is the engine's (moves/fromDrawing.ts keepGoing: gravity arc, landing dip, planted stand) — never new.
// Starts exactly at the last drawn pose (the first picture is the drawing; the app skips it).
import type { EffectTrack } from "../effects/types.ts";
import type { Scene } from "../engine.ts";
import { forwardKinematics } from "../pose.ts";
import { STAND, STAND_FRONT, type PoseAngles } from "../rig.ts";
import type { FoundFigure, ReadDrawing } from "../vision/types.ts";
import { biggestPicture, effectComesTrueScene, pictureBox } from "./drawingComesTrue.ts";
import { FINISH_CHOICES, finishScene, readDrawnFigure, readKeepGoing, type ReadFigure } from "./fromDrawing.ts";

// The read of a whole animation (vision/readAnimation.ts AnimationRead — the same shape; only what Finish needs).
export type FinishPhase = "standing" | "anticipation" | "takeoff" | "rising" | "top" | "falling" | "landing" | "walking" | "running" | "moving" | "unknown";
export type AnimationReadForFinish = {
  floor: number; height: number;
  figures: readonly { frame: number; fig: ReadFigure; found?: FoundFigure }[];
  missed?: readonly number[];
  effects: readonly { frame: number; read: ReadDrawing }[];
  phases: readonly { frame: number; phase: FinishPhase | string }[];
  going?: string;
  travel?: { dir: -1 | 0 | 1; speed: number }; // (optional: the eyes' reading of the sideways travel; speed in heights per second)
};
export type FinishResult = Scene & { effects?: EffectTrack[]; effectHeight?: number; says: string };

const G = 5.6; // gravity, in figure heights per second per second (the same as fromDrawing.ts keepGoing)
const EFFECT_KINDS = new Set(["explosion", "airExplosion", "fire", "water", "lightning", "ice", "smoke"]);
const EFFECT_WORDS: Record<string, [string, string]> = {
  lightning: ["lightning", "the strike finishes and fades away"],
  explosion: ["an explosion", "it grows to full size, breaks up and fades away"],
  airExplosion: ["an explosion in the air", "it grows to full size, breaks up and fades away"],
  fire: ["fire", "it keeps burning and then dies down"],
  smoke: ["smoke", "it keeps puffing and drifts away"],
  water: ["a splash of water", "it splashes and settles"],
  ice: ["ice", "the ice finishes growing and then melts away"],
};
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

// The figure at the size the whole animation agrees on (one steady size, Arthur: "small stays small").
function sized(f: { fig: ReadFigure; found?: FoundFigure }, height: number): ReadFigure {
  if (!(height > 0) || Math.abs(f.fig.height - height) <= 0.005 * height) return f.fig;
  const look = f.found?.look ?? { color: f.fig.style.color, thickness: f.fig.style.thickness, headFilled: f.fig.style.headFilled };
  return readDrawnFigure(f.fig.joints, look, { height, facing: f.fig.facing });
}
// The same figure measured from THE floor of the animation (where it stood): its lowest point never below it.
function onFloor(fig: ReadFigure, floor: number): ReadFigure {
  return { ...fig, groundY: floor, lift: Math.max(0, fig.lift + (floor - fig.groundY)) };
}
// A one-picture-before figure that makes the engine's keep-going read THIS speed (vx sideways, vy down; page px/s).
const withSpeed = (fig: ReadFigure, floor: number, vx: number, vy: number, fps: number) => ({
  frame: 0,
  fig: { ...fig, groundY: floor, joints: { ...fig.joints, hip: { x: fig.joints.hip.x - vx / fps, y: fig.joints.hip.y - vy / fps } } },
});
// The hip's height above the floor when standing (rest pose).
function standHipHeight(fig: ReadFigure) {
  const s = forwardKinematics(fig.facing === "front" ? STAND_FRONT : STAND, fig.facing, { x: 0, y: 0 }, fig.height, fig.style.headSize, fig.style.neck === true);
  return Math.max(s.lFoot.y, s.rFoot.y) - s.hip.y;
}

// THE WAY IT WAS ALREADY GOING (Arthur: "he's hopping BACKWARDS"): a hop drifts sideways only the way the drawn body
// was already travelling across the frames — measured where it STANDS (the middle of the feet; a lean or a crouch moves
// the hips, not the body) over the last second of drawings, and the hips must agree. Barely moving (under a tenth of
// its height) = straight up, no drift. Never the other way, never backwards unless the drawings travel backwards.
function travelDrift(a: AnimationReadForFinish, figs: readonly { frame: number; fig: ReadFigure }[], floor: number, H: number, fps: number) {
  if (a.travel) return !a.travel.dir || !(a.travel.speed > 0) ? 0 : a.travel.dir * clamp(Math.abs(a.travel.speed) * H, 0, 1.2 * H);
  const lastFrame = figs[figs.length - 1].frame;
  const recent = figs.filter((f) => lastFrame - f.frame <= Math.max(2, Math.round(fps)));
  if (recent.length < 2) return 0;
  const first = recent[0], last = recent[recent.length - 1];
  const base = (f: ReadFigure) => (f.joints.lFoot.x + f.joints.rFoot.x) / 2;
  const travel = base(last.fig) - base(first.fig), hips = last.fig.joints.hip.x - first.fig.joints.hip.x;
  if (Math.abs(travel) < 0.1 * H || Math.sign(hips) !== Math.sign(travel)) return 0;
  return clamp(travel / ((last.frame - first.frame) / fps), -1.2 * H, 1.2 * H);
}

// ---- The hop: take-off speed that fits the crouch (a deeper crouch = a bigger hop) ----------------------------------
// ...but a HOP stays a hop: never higher than about a third of the body (the passed library jump goes 0.3 high).
// (Arthur, 2026-10-07: "the stick figure literally turned into a rocket — how the heck did he jump so high?")
const HOP_MAX = 0.25; // x the height: the most a finished hop's HIPS rise (the feet, tucked, then clear about 0.3-0.4: the passed jump)
function hopHeight(figs: readonly ReadFigure[], floor: number) {
  const H = figs[figs.length - 1].height, stand = standHipHeight(figs[figs.length - 1]);
  const onGround = figs.filter((f) => floor - f.groundY <= 0.05 * H);
  const lowest = onGround.length ? Math.min(...onGround.map((f) => floor - f.joints.hip.y)) : stand;
  const depth = stand - lowest;
  return depth > 0.04 * H ? clamp(1.2 * depth, 0.15 * H, HOP_MAX * H) : 0.22 * H;
}
// The push-off pose: legs straight, arms swung up and forward.
function pushOffPose(fig: ReadFigure): PoseAngles {
  const rest = fig.facing === "front" ? STAND_FRONT : STAND;
  return fig.facing === "front" ? { ...rest, lShoulder: rest.lShoulder + 40, rShoulder: rest.rShoulder + 40 } : { ...rest, lean: 8, lShoulder: 120, rShoulder: 110, lHip: 8, rHip: -4, lKnee: 4, rKnee: 4 };
}
// The crouch's feet stay where they were: the push-off figure stands on the floor over the same feet.
function pushOffFigure(crouch: ReadFigure, floor: number): ReadFigure {
  const pose = pushOffPose(crouch);
  const s = forwardKinematics(pose, crouch.facing, { x: 0, y: 0 }, crouch.height, crouch.style.headSize, crouch.style.neck === true);
  const feetX = (crouch.joints.lFoot.x + crouch.joints.rFoot.x) / 2;
  const dx = feetX - (s.lFoot.x + s.rFoot.x) / 2, dy = floor - Math.max(s.lFoot.y, s.rFoot.y, s.lKnee.y, s.rKnee.y, s.hip.y);
  const j = Object.fromEntries(Object.entries(s).map(([k, p]) => [k, { x: p.x + dx, y: p.y + dy }])) as unknown as ReadFigure["joints"];
  return { ...crouch, pose, x: j.hip.x, groundY: floor, lift: 0, joints: j };
}
function hopScene(fig: ReadFigure, floor: number, v0: number, vx: number, o: { stageWidth: number; fps: number }): Scene {
  return finishScene(fig, "keepGoing", { stageWidth: o.stageWidth, fps: o.fps, previous: [withSpeed(fig, floor, vx, -v0, o.fps)] });
}
const shifted = (scene: Scene, dt: number): Scene => ({
  ...scene,
  durationSec: scene.durationSec + dt,
  characters: scene.characters.map((c) => ({ ...c, keys: c.keys.map((k) => ({ ...k, t: k.t + dt })) })),
  marks: Object.fromEntries(Object.entries(scene.marks ?? {}).map(([n, t]) => [n, t + dt])),
});

// ---- The effect: finish it from the stage the drawing shows --------------------------------------------------------
function effectFinish(effects: AnimationReadForFinish["effects"], o: { fps: number }): FinishResult {
  const last = effects[effects.length - 1].read;
  const same = effects.filter((e) => e.read.kind === last.kind);
  const area = (d: ReadDrawing) => Math.max(1, d.box.w * d.box.h);
  // Still growing (each drawing of it bigger than the one before): its full size is bigger than the last drawing.
  const growing = same.length >= 2 && area(last) > 1.2 * area(same[same.length - 2].read);
  const k = growing ? 1.4 : 1;
  const full: ReadDrawing = growing ? { ...last, box: { x: last.box.x + last.box.w / 2 - (k * last.box.w) / 2, y: last.box.y + last.box.h - k * last.box.h, w: k * last.box.w, h: k * last.box.h } } : last;
  const scene = effectComesTrueScene(full, { fps: o.fps });
  // The picture that looks like the drawing (by size) — at or before the effect's biggest moment: start there.
  const big = biggestPicture(scene, o.fps);
  let at = Math.max(0, big.index);
  if (growing) {
    let best = Infinity;
    for (let i = 0; i <= big.index; i++) {
      const b = pictureBox(big.frames[i]);
      if (!b) continue;
      const gap = Math.abs(Math.log(Math.max(1, (b.x1 - b.x0) * (b.y1 - b.y0)) / area(last)));
      if (gap < best) { best = gap; at = i; }
    }
  }
  const skip = at / o.fps;
  const tracks = scene.effects.map((t) => ({ ...t, start: t.start - skip, end: t.end - skip }));
  const [what, next] = EFFECT_WORDS[last.kind] ?? ["an effect", "it finishes and fades away"];
  return { ...scene, id: `finish-${last.kind}`, title: `Finish: your ${last.kind === "airExplosion" ? "explosion" : last.kind}`, durationSec: Math.max(1 / o.fps, scene.durationSec - skip), effects: tracks, says: `I saw ${what}, so ${next}.` };
}

// ---- Finish ------------------------------------------------------------------------------------------------------
export function finishAnimation(a: AnimationReadForFinish, choiceId: string, o: { stageWidth: number; fps: number }): FinishResult {
  const fps = Math.max(1, o.fps), stageWidth = o.stageWidth;
  const figures = [...a.figures].sort((p, q) => p.frame - q.frame);
  const effects = [...a.effects].filter((e) => EFFECT_KINDS.has(e.read.kind)).sort((p, q) => p.frame - q.frame);
  const lastFigFrame = figures.length ? figures[figures.length - 1].frame : -Infinity;
  const lastEffFrame = effects.length ? effects[effects.length - 1].frame : -Infinity;
  // NOT A STICK FIGURE: the animation ends on an effect drawing with no figure in it — finish THE EFFECT.
  if (effects.length && lastEffFrame > lastFigFrame) return effectFinish(effects, { fps });
  if (!figures.length) throw new Error("I couldn't find a stick figure or an effect to finish on this layer.");
  const extra = lastEffFrame === lastFigFrame ? effects[effects.length - 1].read.kind : undefined;
  const also = extra ? ` I also saw ${EFFECT_WORDS[extra]?.[0] ?? "effect"} lines — I left those as you drew them.` : "";

  const H = a.height > 0 ? a.height : figures[figures.length - 1].fig.height;
  const floor = a.floor;
  const figs = figures.map((f) => sized(f, H));
  const last = figs[figs.length - 1], lastFrame = figures[figures.length - 1].frame;
  const phaseAt = (frame: number) => a.phases.find((p) => p.frame === frame)?.phase ?? "unknown";
  const phase = phaseAt(lastFrame);
  const up = floor - last.groundY; // how far its lowest point is above the floor
  // Speed from the drawing before (within half a second): sideways drift, and up/down.
  const before = figures.length >= 2 && lastFrame - figures[figures.length - 2].frame <= Math.max(2, Math.round(0.5 * fps)) ? figs[figs.length - 2] : undefined;
  const dt = before ? (lastFrame - figures[figures.length - 2].frame) / fps : 1;
  const vx = before ? (last.joints.hip.x - before.joints.hip.x) / dt : 0;
  const vy = before ? (last.joints.hip.y - before.joints.hip.y) / dt : 0; // + = going down
  const drift = travelDrift(a, figures.map((f, i) => ({ frame: f.frame, fig: figs[i] })), floor, H, fps);

  if (choiceId !== "keepGoing") {
    // The other choices: the engine's move from the matched last figure, on THE floor (never walks in the air: it
    // steps down onto the floor as it joins the move).
    const scene = finishScene(onFloor(last, floor), choiceId, { stageWidth, fps });
    const label = FINISH_CHOICES.find((c) => c.id === choiceId)?.label.toLowerCase() ?? choiceId;
    return { ...scene, says: `I saw your stick figure, so he does "${label}" from where you left him, on the floor.${also}` };
  }

  // (In the air it keeps its own lowest point — the engine measures its height above THE floor from it.)
  const fig = up <= 0.03 * H ? onFloor(last, floor) : last;
  const say = (s: string): FinishResult => ({ ...s0, says: s + also });
  let s0: Scene;
  // TAKE-OFF / GOING UP: finish the hop — up at a take-off speed that fits the crouch, gravity, land on the floor.
  if (phase === "takeoff" || phase === "rising") {
    const v0 = Math.sqrt(2 * G * H * hopHeight(figs, floor));
    const vUp = phase === "rising" ? Math.max(-vy, 0.7 * v0) : v0;
    s0 = hopScene(fig, floor, vUp, drift, { stageWidth, fps });
    return say(phase === "takeoff" ? "I saw a hop — he was taking off, so he goes up and lands back on the floor." : "I saw a jump going up, so he keeps going up, comes down and lands on the floor.");
  }
  // CROUCH (anticipation) on the floor: the hop it was winding up for — push off (feet planted), then the same hop.
  if (phase === "anticipation" && up <= 0.05 * H) {
    const push = pushOffFigure(fig, floor), T = 0.12;
    const v0 = Math.sqrt(2 * G * H * hopHeight(figs, floor));
    const hop = shifted(hopScene(push, floor, v0, drift, { stageWidth, fps }), T);
    const ch = hop.characters[0];
    const crouchKey = { t: 0, pose: fig.pose, x: fig.x, lift: fig.lift, contacts: ["lFoot", "rFoot"] as ("lFoot" | "rFoot")[], ease: "in" as const };
    s0 = { ...hop, characters: [{ ...ch, keys: [crouchKey, ...ch.keys] }] };
    return say("I saw him crouch to get ready, so he jumps: up, then back down onto the floor.");
  }
  // UP IN THE AIR (the top, coming down, or any pose drawn above the floor): NO LEVITATING — fall with gravity.
  if (up > 0.03 * H || phase === "top" || phase === "falling") {
    if (up > 0.03 * H) {
      s0 = finishScene(fig, "keepGoing", { stageWidth, fps, previous: [withSpeed(fig, floor, drift, Math.max(0, vy), fps)] });
      return say(phase === "top" ? "I saw him at the top of a jump, so he falls down and lands on the floor."
        : phase === "falling" ? "I saw him coming down, so he keeps falling and lands on the floor."
        : "I saw him up in the air, so he comes down and lands on the floor — no floating.");
    }
  }
  // WALKING / RUNNING on the floor: keep going that way off the page.
  if (phase === "walking" || phase === "running") {
    const previous = figs.map((f, i) => ({ frame: figures[i].frame, fig: onFloor(f, floor) }));
    const r = readKeepGoing(fig, { stageWidth, fps, previous });
    s0 = r.kind === "run" || r.kind === "walk" ? finishScene(fig, "keepGoing", { stageWidth, fps, previous }) : finishScene(fig, phase === "running" ? "runOff" : "walkOff", { stageWidth, fps });
    return say(phase === "running" ? "I saw him running, so he keeps running off the page." : "I saw him walking, so he keeps walking off the page.");
  }
  // LANDING / STANDING / anything else on the floor: absorb and settle into a stand (feet stay where they were drawn).
  s0 = finishScene(fig, "keepGoing", { stageWidth, fps, previous: before ? [{ frame: 0, fig: onFloor(before, floor) }, { frame: Math.max(1, Math.round(dt * fps)), fig }] : [] });
  return say(phase === "landing" ? "I saw him landing, so he bends to soak it up and stands." : "I saw him standing, so he settles into a relaxed stand.");
}
