// THE CAMERA for plans (SPEC-0017 Phase 2C extras, 2026-10-06): FILM CUTS (a story told in several shots, joined by
// hard cuts like a film) and SCREEN SHAKE on a really big impact. Only when a plan asks for it (isCameraPlan); every
// other plan is built exactly as before. The pictures are made by ../camera.ts (through the engine's buildScene).
//
// A CAMERA PLAN is an ordinary scene plan (it is shot 1: its figures, background, effects) plus:
//   cuts:  the next shots, in order. Each has its own `characters` (spots, actions), and maybe its own `background`,
//          `effects`, `objects`, `shake`. The same figure (same id) keeps its look and name in every shot.
//          A shot starts at `at` seconds into the story, or — when a figure ran off the page in the shot before —
//          `after` seconds (default 1) once it is fully off the page, or else when the shot before has finished.
//   shake: screen shakes in shot 1 ([{ at, strength, seconds }]; `at` = seconds into the shot, or one of its moments
//          like "a.jump1.land" or "b.liftSlam1.slam"). Small and short: strength 0.008 x page height by default,
//          at most 0.015; 0.3 s by default.
// and, on a figure in any shot:
//   leave: "left" | "right" — after its actions it runs (`leaveMove`) off the page that way, on purpose: the shot
//          then cuts to the next one, about a second after it is gone.
//   enter: "left" | "right" — it runs (`enterMove`) in from that edge to its `x`, then does its actions.
// Figures leaving or coming in this way are left out of the page fit while they do it (the rest of the story is
// centered on the page as usual); the page edges they cross are worked out for the page the scene is shown on.
import { buildScene, type SceneCharacter, type SceneObject } from "../engine.ts";
import type { CameraScene, CameraShot, OffPageRule, ShakeMark } from "../camera.ts";
import { BACKGROUND_PIECES } from "../effects/index.ts";
import type { Anchor, BackgroundPiece, BackgroundSpec, EffectTrack } from "../effects/types.ts";
import { animationBounds, STAGE_CENTER_X } from "../stageFit.ts";
import { DEFAULT_STYLE, JOINTS, type Facing } from "../rig.ts";
import { fitBackgroundPlanToPage, fitPlanToPage, planToScene, type Action, type CharacterPlan, type MoveEntry, type ObjectPlan, type ScenePlan } from "./plan.ts";

export type ShakePlan = { at: number | string; strength?: number; seconds?: number; seed?: number; impact?: boolean };
export type Gait = "walk" | "jog" | "run";
export type ShotCharacter = CharacterPlan & { enter?: "left" | "right"; leave?: "left" | "right"; enterMove?: Gait; leaveMove?: Gait };
export type ShotPlan = { title?: string; characters: ShotCharacter[]; background?: BackgroundSpec; effects?: EffectTrack[]; objects?: ObjectPlan[]; at?: number; after?: number; shake?: ShakePlan[] };
export type CameraPlan = ScenePlan & { characters: ShotCharacter[]; shake?: ShakePlan[]; cuts?: ShotPlan[] };

export const isCameraPlan = (plan: ScenePlan): plan is CameraPlan => {
  const p = plan as CameraPlan;
  return Boolean(p.cuts?.length || p.shake?.length || (p.characters as ShotCharacter[]).some((c) => c.enter || c.leave));
};

// Seconds between a figure being fully off the page and the cut to the next shot.
export const CUT_AFTER = 1;
// x height past the page edge: an arriving figure starts this far out (so it comes in already running, not
// pushing off where it can be seen); a leaving one runs this far past it (so it is gone before it slows down).
const ENTER_MARGIN = 1.4;
const LEAVE_MARGIN = 2;
// As plan.ts: the share of the page kept free at each side when the story is fitted to it.
const PAGE_MARGIN = 0.04;
const GONE_FPS = 30;

type Layout = { k: number; s: number; stageWidth: number };
const zoomX = (x: number, k: number) => STAGE_CENTER_X + (x - STAGE_CENTER_X) * k;

// ZOOM (one size for every shot, so a figure looks the same in all of them): like plan.ts fitBackgroundPlanToPage,
// spots move toward the middle and lengths shrink by k; the figures' height shrinks with them.
const LENGTHS = ["distance", "partnerDistance"];
const zoomActions = (actions: Action[], k: number): Action[] => (k === 1 ? actions : actions.map((a) => (!a.params ? a : {
  ...a, params: Object.fromEntries(Object.entries(a.params).map(([name, v]) => [name, typeof v !== "number" ? v : LENGTHS.includes(name) ? v * k : name === "to" ? zoomX(v, k) : v])),
})));
function zoomShotParts(shot: ShotPlan, k: number, groundY: number) {
  if (k === 1) return { background: shot.background, effects: shot.effects, objects: shot.objects };
  const zy = (y: number) => groundY + (y - groundY) * k;
  const spot = (a: Anchor): Anchor => ("character" in a || "object" in a ? { ...a, ...(a.dx !== undefined ? { dx: a.dx * k } : {}), ...(a.dy !== undefined ? { dy: a.dy * k } : {}) } : { x: zoomX(a.x, k), y: zy(a.y) });
  const piece = (p: NonNullable<BackgroundPiece["params"]>) => Object.fromEntries(Object.entries(p).map(([name, v]) => [name,
    typeof v !== "number" ? v : name === "x" ? zoomX(v, k) : name === "y" ? zy(v) : name === "w" || name === "h" ? v * k : v]));
  return {
    background: shot.background && { ...shot.background, pieces: shot.background.pieces.map((p) => (p.params ? { ...p, params: piece(p.params) } : p)) },
    effects: shot.effects?.map((e) => ({ ...e, anchor: spot(e.anchor), ...(e.target ? { target: spot(e.target) } : {}) })),
    objects: shot.objects?.map((o) => (o.keys ? { ...o, keys: o.keys.map((key) => ({ ...key, x: zoomX(key.x, k), y: zy(key.y) })) } : o)),
  };
}

const resolveShake = (marks: readonly ShakePlan[] | undefined, moments: Record<string, number>): ShakeMark[] => (marks ?? []).flatMap((m) => {
  const at = typeof m.at === "number" ? m.at : moments[m.at];
  return typeof at === "number" && Number.isFinite(at) ? [{ ...m, at }] : [];
});

type BuiltShot = { scene: ReturnType<typeof planToScene> & { stageWidth: number }; rules: OffPageRule[]; shake: ShakeMark[]; gone?: number };

// One shot as an ordinary scene: arrivals start past the page edge and run in, leavers run off the page after their
// actions. `gone` = when every leaver is fully off the page (seconds into the shot).
function buildShot(plan: CameraPlan, shot: ShotPlan, n: number, cast: Map<string, ShotCharacter>, layout: Layout, moves: Record<string, MoveEntry>): BuiltShot {
  const { k, s, stageWidth } = layout;
  const height = plan.height * k;
  // The page edges, where they will be once the app has centered the story on the page (it slides it by s).
  const edge = { left: STAGE_CENTER_X - stageWidth / 2 - s, right: STAGE_CENTER_X + stageWidth / 2 - s };
  const rules: OffPageRule[] = [];
  const characters: CharacterPlan[] = shot.characters.map((c) => {
    const who = cast.get(c.id) ?? c; // SAME FIGURE, SAME LOOK in every shot
    const base: CharacterPlan = { ...c, name: who.name, look: who.look, x: zoomX(c.x, k), actions: zoomActions(c.actions, k) };
    for (const field of ["enter", "leave", "enterMove", "leaveMove"] as const) delete (base as ShotCharacter)[field];
    if (!c.enter) return base;
    const dir = c.enter === "left" ? 1 : -1;
    const start = (dir > 0 ? edge.left : edge.right) - dir * ENTER_MARGIN * height;
    rules.push({ id: c.id, kind: "enter", side: c.enter, x: base.x });
    return { ...base, x: start, facing: dir > 0 ? "right" : "left", actions: [{ move: c.enterMove ?? "run", params: { distance: Math.abs(base.x - start) } }, ...base.actions] };
  });
  let scenePlan: ScenePlan = {
    id: `${plan.id}-shot${n}`, title: shot.title ?? `${plan.title} (shot ${n})`, height, groundY: plan.groundY, stageWidth,
    lengthScale: (plan.lengthScale ?? 1) * k, characters, ...zoomShotParts(shot, k, plan.groundY),
  };
  const leavers = shot.characters.filter((c) => c.leave);
  if (leavers.length > 0) {
    // Where each leaver is when its own actions are done; from there it runs off the page.
    const before = planToScene(scenePlan, moves);
    scenePlan = { ...scenePlan, characters: scenePlan.characters.map((c) => {
      const leaver = leavers.find((l) => l.id === c.id);
      const keys = before.characters.find((b) => b.id === c.id)?.keys;
      if (!leaver?.leave || !keys?.length) return c;
      const at = keys[keys.length - 1];
      let facing: Facing = c.facing;
      for (const key of keys) facing = key.facing ?? facing;
      const dir = leaver.leave === "right" ? 1 : -1, want: Facing = dir > 0 ? "right" : "left";
      const goal = (dir > 0 ? edge.right : edge.left) + dir * LEAVE_MARGIN * height;
      rules.push({ id: c.id, kind: "leave", side: leaver.leave, x: at.x });
      const off: Action[] = [...(facing !== want ? [{ move: "turn", params: { to: want } }] : []), { move: leaver.leaveMove ?? "run", params: { distance: Math.max(height, dir * (goal - at.x)) } }];
      return { ...c, actions: [...c.actions, ...off] };
    }) };
  }
  // (Backgrounds and effects are drawn on the whole 1920-wide stage the page is a window onto — as every other
  // background scene — not on a stage as narrow as the page: a hill or cloud band laid out across a narrower stage
  // would stop short of the page edge. On a 16:9 page the two are the same.)
  const scene = { ...planToScene(scenePlan, moves), stageWidth: 2 * STAGE_CENTER_X };
  let gone: number | undefined;
  if (leavers.length > 0) {
    const built = buildScene(scene, GONE_FPS);
    gone = 0;
    for (const leaver of leavers) {
      const right = leaver.leave === "right";
      const off = (i: number) => {
        const f = built.frames[i].find((c) => c.id === leaver.id);
        if (!f) return true;
        const pad = f.headRadius + f.style.thickness;
        return JOINTS.every((name) => (right ? f.skeleton[name].x - pad > edge.right : f.skeleton[name].x + pad < edge.left));
      };
      let i = built.frames.length;
      while (i > 0 && off(i - 1)) i -= 1;
      gone = Math.max(gone, Math.min(scene.durationSec, i / GONE_FPS));
    }
  }
  return { scene, rules, shake: resolveShake(shot.shake, scene.marks), gone };
}

// Every shot built and joined into one scene (the cuts at their times).
function joinShots(plan: CameraPlan, shots: ShotPlan[], cast: Map<string, ShotCharacter>, layout: Layout, moves: Record<string, MoveEntry>): CameraScene & { marks: Record<string, number>; stageWidth: number } {
  const built = shots.map((shot, n) => buildShot(plan, shot, n + 1, cast, layout, moves));
  const starts: number[] = [0], lengths: number[] = [];
  built.forEach((b, n) => {
    const next = shots[n + 1];
    const length = next?.at !== undefined ? Math.max(0.2, next.at - starts[n])
      : b.gone !== undefined ? (next ? b.gone + (next.after ?? CUT_AFTER) : Math.min(b.scene.durationSec, b.gone + CUT_AFTER))
      : b.scene.durationSec;
    lengths.push(length);
    if (next) starts.push(starts[n] + length);
  });
  const cameraShots: CameraShot[] = built.map((b, n) => ({ scene: { ...b.scene, durationSec: lengths[n] }, start: starts[n], offPage: b.rules, shake: b.shake }));
  const characters = new Map<string, SceneCharacter>(), objects = new Map<string, SceneObject>();
  for (const b of built) {
    for (const c of b.scene.characters) if (!characters.has(c.id)) characters.set(c.id, c);
    for (const o of b.scene.objects ?? []) if (!objects.has(o.id)) objects.set(o.id, o);
  }
  // (The moments of shot 2, 3... are kept as "shot2/a.jump1.land" at their time in the whole story.)
  const marks: Record<string, number> = { ...built[0].scene.marks };
  built.slice(1).forEach((b, i) => { for (const [name, t] of Object.entries(b.scene.marks)) marks[`shot${i + 2}/${name}`] = starts[i + 1] + t; });
  // (The whole story's effects and first background, for anyone who only asks whether it has any; the pictures
  // come from each shot's own: camera.ts cameraEffectFrames.)
  const effects = built.flatMap((b, n) => ((b.scene as { effects?: EffectTrack[] }).effects ?? []).map((e) => ({ ...e, start: e.start + starts[n], end: e.end + starts[n] })));
  const background = built.map((b) => (b.scene as { background?: BackgroundSpec }).background).find((bg) => bg?.pieces.length);
  const last = built.length - 1;
  return {
    id: plan.id, title: plan.title, groundY: plan.groundY, durationSec: starts[last] + lengths[last],
    characters: [...characters.values()], objects: [...objects.values()], marks, shots: cameraShots, stageWidth: layout.stageWidth,
    ...(effects.length ? { effects } : {}), ...(background ? { background } : {}), ...(plan.canvasColor ? { canvasColor: plan.canvasColor } : {}),
  } as CameraScene & { marks: Record<string, number>; stageWidth: number };
}

// A camera plan → one scene, fitted to a page `stageWidth` stage px wide: the story (everything but the figures
// running off or in on purpose) is zoomed out if it is too wide — every shot the same, so figures keep one size — and
// the page edges they cross are put where the app's centering will put them.
export function cameraPlanToScene(plan: CameraPlan, moves: Record<string, MoveEntry>, stageWidth = plan.stageWidth ?? 1920): CameraScene & { marks: Record<string, number>; stageWidth: number } {
  const { cuts, shake, ...first } = plan;
  const shots: ShotPlan[] = [{ characters: first.characters, background: first.background, effects: first.effects, objects: first.objects, shake }, ...(cuts ?? [])];
  // Only a shake, in one ordinary shot: the usual page fit, then the shake.
  if (shots.length === 1 && !(plan.characters as ShotCharacter[]).some((c) => c.enter || c.leave)) {
    const scene = first.background ? planToScene(fitBackgroundPlanToPage(first, moves, stageWidth), moves) : fitPlanToPage(first, moves, stageWidth);
    return { ...scene, stageWidth: (scene as { stageWidth?: number }).stageWidth ?? stageWidth, shake: resolveShake(shake, scene.marks) };
  }
  const cast = new Map<string, ShotCharacter>();
  for (const shot of shots) for (const c of shot.characters) if (!cast.has(c.id)) cast.set(c.id, c);
  const room = stageWidth * (1 - 2 * PAGE_MARGIN);
  let layout: Layout = { k: 1, s: 0, stageWidth };
  let scene = joinShots(plan, shots, cast, layout, moves);
  for (let pass = 0; pass < 4; pass += 1) {
    // (The fit is worked out without the shakes: a camera move, not part of the story.)
    const built = buildScene({ ...scene, shots: scene.shots?.map((shot) => ({ ...shot, shake: [] })) } as CameraScene, 12);
    const b = animationBounds(built.frames, built.objects);
    if (!Number.isFinite(b.left)) break;
    const width = b.right - b.left;
    const k = width > room + 0.5 ? layout.k * ((room - 4) / width) : layout.k;
    const s = k === layout.k ? STAGE_CENTER_X - (b.left + b.right) / 2 : layout.s;
    if (Math.abs(k - layout.k) < 1e-3 && Math.abs(s - layout.s) < 1) break;
    layout = { k, s, stageWidth };
    scene = joinShots(plan, shots, cast, layout, moves);
  }
  return scene;
}

// ---- Engine test (review only): "Run off, cut, arrive (camera)" -------------------------------------------------
// Shot 1, on the hills: the runner stands a moment, then runs off the right edge of the page on purpose. About a
// second later, CUT to shot 2 somewhere else (a waterfall when that background piece exists, else an evening
// forest): it runs in from the left, makes a big running jump, lands hard — a small SCREEN SHAKE on the landing —
// and stops on the page.
const GROUND = 900, HEIGHT = 200;
export function runOffCutArrivePlan(): CameraPlan {
  const there: BackgroundPiece[] = BACKGROUND_PIECES.waterfall
    ? [{ kind: "sky", params: { time: "day", color: "#7cc4f2", color2: "#e4f5ff" } }, { kind: "waterfall", params: { x: 1700 } }, { kind: "trees", params: { count: 2, shape: "pine", x: 330, w: 420, size: 1.4 } }, { kind: "ground", params: { color: "#4f9a4a" } }]
    : [
      { kind: "sky", params: { time: "sunset" } },
      { kind: "sun", params: { x: 1500, y: 640, size: 0.3, color: "#ffb347", color2: "#ffd9a0" } },
      { kind: "clouds", params: { count: 3, speed: -0.6, y: 120, h: 140, color: "#ffe2c8", color2: "#f2b9a0" } },
      { kind: "trees", params: { count: 5, shape: "pine", size: 1.5, color: "#2f6b3a", color2: "#5a3a22" } },
      { kind: "ground", params: { color: "#3f7d3a" } },
    ];
  return {
    id: "camera-run-off-cut-arrive", title: "Run off, cut, arrive (camera)", height: HEIGHT, groundY: GROUND,
    characters: [{ id: "a", name: "Runner", x: 680, facing: "right", look: { color: DEFAULT_STYLE.color }, energy: 0.6, actions: [{ move: "stand", params: { seconds: 0.6 } }], leave: "right" }],
    background: { seed: 3, pieces: [
      { kind: "sky", params: { time: "day" } },
      { kind: "sun", params: { x: 1660, y: 330 } },
      { kind: "clouds", params: { count: 4, speed: 1, y: 90, h: 150 } },
      { kind: "hills", params: { h: 300 } },
      { kind: "ground" },
    ] },
    cuts: [{
      title: "Run off, cut, arrive (camera): shot 2",
      after: CUT_AFTER,
      background: { seed: 5, pieces: there },
      characters: [{ id: "a", x: 540, facing: "right", energy: 0.7, enter: "left", actions: [{ move: "jump", params: { height: 0.8 } }] }],
      shake: [{ at: "a.jump1.land", strength: 0.01, seconds: 0.3 }],
    }],
  };
}
