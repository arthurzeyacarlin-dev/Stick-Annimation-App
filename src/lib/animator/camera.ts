// THE CAMERA (SPEC-0017 Phase 2C extras, 2026-10-06): film CUTS between shots and SCREEN SHAKE on big impacts.
// Only when a scene asks for it (`shots` / `shake`); every other scene is built exactly as before (engine.ts
// buildScene and effects/index.ts buildEffectFrames hand a scene over to this file only when hasCamera says so).
//
// CUTS: a scene can be several SHOTS in a row (each its own ordinary scene: its figures, their spots and actions,
// its own background and effects), joined by hard cuts like a film. Each shot is built on its own and its pictures
// follow the last shot's: shot k starts on picture round(start x fps), so the cut lands on the same moment at any
// frame rate, and its background and effects change exactly on that picture. A figure that runs off the page on
// purpose (or runs in from the edge) is marked `offPage` in those pictures, so the page fit ignores it there
// (stageFit.ts animationBounds), like a ball thrown away.
//
// SCREEN SHAKE: on a really big impact the WHOLE picture (figures, objects, effects and background together) is
// moved a few px and back for a moment: strongest on the impact picture, alternating up and down each picture,
// fading fast to nothing (seeded, so it is the same every time). Its size is a share of the page height and its
// length is in seconds, so it looks the same at 8, 12 or 24 pictures a second.
// (No runtime imports from engine.ts or effects/index.ts: they import this file; their builders are passed in.)
import type { CharacterReport, FrameCharacter, FrameObject, Scene, SceneFrames } from "./engine.ts";
import type { EffectFrame, Shape } from "./effects/types.ts";
import { rand } from "./effects/random.ts";
import { JOINTS, type Point } from "./rig.ts";

// One screen shake: at `at` seconds (the first picture at or after it is the impact picture). `strength` = how far
// the picture moves at first, as a share of the page height (default 0.008, at most 0.015 = 1.5%); `seconds` = how
// long it takes to fade to nothing (default 0.3, 0.15–0.5). `impact` = THE IMPACT JOLT of a big blast (Arthur, Oct 7:
// "only two impact frames ... I don't really feel the strength"): a hard jolt that stays strong for its whole short
// time (about 2 pictures at 12 a second) and then stops dead — down, then up — up to 2.5% of the page, never a wobble.
export type ShakeMark = { at: number; strength?: number; seconds?: number; seed?: number; impact?: boolean };
// A figure off the page ON PURPOSE in one shot (the page fit ignores it in those pictures):
// "enter" — it runs in from `side`: off from the shot's start until its hips first reach `x` (where it arrives);
// "leave" — it runs off toward `side`: off after the last picture its hips are at `x` (where it set off from).
export type OffPageRule = { id: string; kind: "enter" | "leave"; side: "left" | "right"; x: number };
// One shot: an ordinary scene (with its own effects / background / stageWidth), starting `start` seconds into the
// whole scene. `shake` times are seconds into this shot.
export type CameraShot = { scene: Scene; start: number; offPage?: OffPageRule[]; shake?: ShakeMark[] };
// A scene that uses the camera. `characters` is the cast (everyone who appears in any shot, first look kept);
// `shake` (seconds into the whole scene) is for a scene without shots.
export type CameraScene = Scene & { shots?: CameraShot[]; shake?: ShakeMark[] };
// What the camera did, per picture of the built scene (SceneFrames.camera).
export type CameraFrames = {
  shots: { from: number; to: number }[]; // each shot's pictures: from (included) .. to (not included)
  cuts: number[]; // the pictures where a new shot starts (the first picture of shots 2, 3, ...)
  shake: Point[] | null; // how far each whole picture is moved (stage px), or null when it never shakes
  // Pictures a background that is redrawn only every few pictures must redraw anyway (toFrames.ts
  // rasterizeShapeFrames `mustDraw`): every cut, every shaken picture and the first still picture after a shake.
  redraw: number[];
};

export const SHAKE = { strength: 0.008, maxStrength: 0.015, impactMaxStrength: 0.025, seconds: 0.3, minSeconds: 0.15, maxSeconds: 0.5, sideways: 0.5 };
const PAGE_HEIGHT = 1080; // stage px the page shows from top to bottom

export const hasCamera = (scene: Scene) => {
  const s = scene as CameraScene;
  return Boolean(s.shots?.length || s.shake?.length);
};
const withoutCamera = (scene: Scene): Scene => {
  const plain = { ...scene } as CameraScene;
  delete plain.shots;
  delete plain.shake;
  return plain;
};
const frameCount = (seconds: number, fps: number) => Math.max(1, Math.round(seconds * fps) + 1);

// How far one shake moves the picture `u` seconds after its impact picture, on the `k`-th picture since then.
export function shakeAt(mark: ShakeMark, u: number, k: number): Point {
  const seconds = Math.min(SHAKE.maxSeconds, Math.max(SHAKE.minSeconds, mark.seconds ?? SHAKE.seconds));
  if (!(u >= -1e-9) || u >= seconds - 1e-9) return { x: 0, y: 0 };
  const strength = Math.min(mark.impact ? SHAKE.impactMaxStrength : SHAKE.maxStrength, Math.max(0, mark.strength ?? SHAKE.strength));
  const fade = mark.impact ? 1 - 0.3 * (Math.max(0, u) / seconds) : (1 - Math.max(0, u) / seconds) ** 2;
  const size = strength * PAGE_HEIGHT * fade, seed = mark.seed ?? 1;
  // Down on the impact, then up, down... (a heavy hit jolts the world down first), a little sideways.
  return { x: size * SHAKE.sideways * (2 * rand(seed, k, 2) - 1), y: size * (k % 2 === 0 ? 1 : -1) * (0.8 + 0.2 * rand(seed, k, 1)) };
}

// Adds each shake to the pictures from..to (not included) whose times are `times` (seconds, same clock as the marks).
function addShakes(out: Point[], marks: readonly ShakeMark[], times: readonly number[], from = 0, to = times.length) {
  for (const mark of marks) {
    if (!Number.isFinite(mark.at)) continue;
    let first = -1;
    for (let i = from; i < to; i += 1) if (times[i] >= mark.at - 1e-6) { first = i; break; }
    if (first < 0) continue;
    for (let i = first; i < to; i += 1) {
      const d = shakeAt(mark, times[i] - times[first], i - first);
      if (d.x === 0 && d.y === 0) break;
      out[i] = { x: out[i].x + d.x, y: out[i].y + d.y };
    }
  }
}

const moveCharacter = (c: FrameCharacter, d: Point): FrameCharacter => {
  const skeleton = { ...c.skeleton };
  for (const name of JOINTS) skeleton[name] = { x: c.skeleton[name].x + d.x, y: c.skeleton[name].y + d.y };
  return { ...c, skeleton };
};
const moveObject = (o: FrameObject, d: Point): FrameObject => ({ ...o, x: o.x + d.x, y: o.y + d.y });
export const moveShape = (s: Shape, d: Point): Shape => (s.kind === "circle" || s.kind === "rect" || s.kind === "symbol"
  ? { ...s, x: s.x + d.x, y: s.y + d.y }
  : { ...s, points: s.points.map((v, i) => v + (i % 2 === 0 ? d.x : d.y)) });

// The figures marked off the page on purpose in one shot's pictures (by its rules).
function markOffPage(frames: FrameCharacter[][], rules: readonly OffPageRule[], scene: Scene) {
  for (const rule of rules) {
    const height = scene.characters.find((c) => c.id === rule.id)?.height ?? 300, slack = 0.02 * height;
    const dir = (rule.kind === "enter" ? rule.side === "left" : rule.side === "right") ? 1 : -1;
    const hipX = (j: number) => frames[j].find((c) => c.id === rule.id)?.skeleton.hip.x;
    const off = new Set<number>();
    if (rule.kind === "enter") {
      for (let j = 0; j < frames.length; j += 1) { const x = hipX(j); if (x === undefined) continue; if (dir * (x - rule.x) >= -slack) break; off.add(j); }
    } else {
      let last = -1;
      frames.forEach((_, j) => { const x = hipX(j); if (x !== undefined && dir * (x - rule.x) <= slack) last = j; });
      for (let j = last + 1; j < frames.length; j += 1) off.add(j);
    }
    for (const j of off) frames[j] = frames[j].map((c) => (c.id === rule.id ? { ...c, offPage: true } : c));
  }
}

const mergeReports = (a: CharacterReport, b: CharacterReport): CharacterReport => ({
  id: a.id, maxBoneErrorPx: Math.max(a.maxBoneErrorPx, b.maxBoneErrorPx), maxFootDriftPx: Math.max(a.maxFootDriftPx, b.maxFootDriftPx),
  clampedAngles: a.clampedAngles + b.clampedAngles, belowGroundFrames: a.belowGroundFrames + b.belowGroundFrames,
  maxJointStepPx: Math.max(a.maxJointStepPx, b.maxJointStepPx), maxFastStepPx: Math.max(a.maxFastStepPx, b.maxFastStepPx),
});

// buildScene for a scene that uses the camera. `build` = the engine's own buildScene (each shot is an ordinary
// scene), `timesOf` = its momentTimes (each picture's real time: below 12 fps a picture can be moved to show a
// moment, and a shake starts on that picture).
export function buildCameraFrames(scene: CameraScene, fps: number, build: (scene: Scene, fps: number) => SceneFrames, timesOf: (scene: Scene, fps: number, count: number) => number[]): SceneFrames {
  if (!scene.shots?.length) {
    const plain = withoutCamera(scene);
    const built = build(plain, fps);
    const shake = built.frames.map(() => ({ x: 0, y: 0 }));
    addShakes(shake, scene.shake ?? [], timesOf(plain, fps, built.frames.length));
    return finish(built, [{ from: 0, to: built.frames.length }], shake);
  }
  const shots = scene.shots, last = shots.length - 1;
  // Shot k's first picture (each shot gets at least one).
  const starts: number[] = [];
  shots.forEach((shot, k) => starts.push(k === 0 ? 0 : Math.max(starts[k - 1] + 1, Math.round(shot.start * fps))));
  const total = starts[last] + frameCount(shots[last].scene.durationSec, fps);
  const cast = scene.characters.map((c) => c.id);
  const order = (list: FrameCharacter[]) => [...list].sort((a, b) => (cast.indexOf(a.id) + 1 || Infinity) - (cast.indexOf(b.id) + 1 || Infinity));
  const frames: FrameCharacter[][] = [], objects: FrameObject[][] = [], times: number[] = [];
  const reports = new Map<string, CharacterReport>();
  const shake: Point[] = Array.from({ length: total }, () => ({ x: 0, y: 0 }));
  const ranges = shots.map((_, k) => ({ from: starts[k], to: k < last ? starts[k + 1] : total }));
  let ok = true;
  shots.forEach((shot, k) => {
    const { from, to } = ranges[k], count = to - from;
    const own = { ...withoutCamera(shot.scene), durationSec: Math.max(shot.scene.durationSec, (count - 1) / fps) };
    const built = build(own, fps);
    const local = timesOf(own, fps, built.frames.length);
    const mine: FrameCharacter[][] = [];
    for (let j = 0; j < count; j += 1) {
      const at = Math.min(j, built.frames.length - 1);
      mine.push(order(built.frames[at]));
      objects.push(built.objects[at] ?? []);
      times.push(from / fps + local[at]);
    }
    markOffPage(mine, shot.offPage ?? [], own);
    frames.push(...mine);
    addShakes(shake, shot.shake ?? [], times.map((t) => t - from / fps), from, to);
    for (const r of built.report.characters) reports.set(r.id, reports.has(r.id) ? mergeReports(reports.get(r.id)!, r) : r);
    ok &&= built.report.ok;
  });
  addShakes(shake, scene.shake ?? [], times);
  const report = { frameCount: total, fps, characters: [...reports.values()], ok };
  return finish({ fps, frames, objects, report }, ranges, shake);
}

// The whole pictures moved by the shake (figures and objects), and what the camera did.
function finish(built: SceneFrames, shots: { from: number; to: number }[], shake: Point[]): SceneFrames {
  const shaken = shake.some((d) => d.x !== 0 || d.y !== 0);
  const moved = (i: number) => shake[i].x !== 0 || shake[i].y !== 0;
  const redraw = new Set(shots.slice(1).map((s) => s.from));
  if (shaken) shake.forEach((_, i) => { if (moved(i) || (i > 0 && moved(i - 1))) redraw.add(i); });
  const camera: CameraFrames = { shots, cuts: shots.slice(1).map((s) => s.from), shake: shaken ? shake : null, redraw: [...redraw].sort((a, b) => a - b) };
  if (!shaken) return { ...built, camera };
  return {
    ...built,
    frames: built.frames.map((list, i) => (moved(i) ? list.map((c) => moveCharacter(c, shake[i])) : list)),
    objects: built.objects.map((list, i) => (moved(i) ? list.map((o) => moveObject(o, shake[i])) : list)),
    camera,
  };
}

// buildEffectFrames for a scene that uses the camera: each shot's own background and effects (on its own clock,
// from its first picture), then the whole picture moved by the shake. `buildFx` = the ordinary buildEffectFrames.
// Effects follow the figures from where they are before the shake, so a flame on a hand isn't moved twice.
export function cameraEffectFrames(scene: CameraScene, built: SceneFrames, buildFx: (scene: Scene, built: SceneFrames) => EffectFrame[]): EffectFrame[] {
  const camera = built.camera!;
  const shake = camera.shake;
  const still: SceneFrames = { ...built, camera: undefined };
  if (shake) {
    still.frames = built.frames.map((list, i) => list.map((c) => moveCharacter(c, { x: -shake[i].x, y: -shake[i].y })));
    still.objects = built.objects.map((list, i) => list.map((o) => moveObject(o, { x: -shake[i].x, y: -shake[i].y })));
  }
  const pictures = !scene.shots?.length ? buildFx(withoutCamera(scene), still)
    : scene.shots.flatMap((shot, k) => {
      const { from, to } = camera.shots[k];
      return buildFx(withoutCamera(shot.scene), { ...still, frames: still.frames.slice(from, to), objects: still.objects.slice(from, to) });
    });
  if (!shake) return pictures;
  return pictures.map((p, i) => {
    const d = shake[i];
    if (d.x === 0 && d.y === 0) return p;
    return { background: p.background.map((s) => moveShape(s, d)), back: p.back.map((s) => moveShape(s, d)), front: p.front.map((s) => moveShape(s, d)), ...(p.top ? { top: p.top.map((s) => moveShape(s, d)) } : {}) };
  });
}
