import assert from "node:assert/strict";
import { test } from "node:test";
import { buildEffectFrames } from "../effects/index.ts";
import { buildScene, frameCountFor, measureBoneError } from "../engine.ts";
import { forwardKinematics } from "../pose.ts";
import { HEAD_RADIUS, STAND, STAND_FRONT, type Facing, type Point, type PoseAngles, type Skeleton } from "../rig.ts";
import { cleanUpScene, comeTrueScene, improveAnimationScene, readKeepGoing, DRAWING_EFFECTS, effectOnDrawingScene, FINISH_CHOICES, finishScene, JOINT_PICKS, lookFromPixels, readDrawnFigure, type DrawnLook, type JointPick } from "./fromDrawing.ts";
import { LIBRARY } from "./library.ts";
import { planToScene } from "./plan.ts";

const H = 300;
const PICKS = JOINT_PICKS.map((p) => p.joint);
const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
const LOOK: DrawnLook = { color: "#2563eb", thickness: 6, headFilled: true, headRadius: HEAD_RADIUS.normal * H };
const jointsOf = (s: Skeleton): Record<JointPick, Point> => Object.fromEntries(PICKS.map((j) => [j, { ...s[j] }])) as Record<JointPick, Point>;
// A figure "drawn" by the engine: its joints where forwardKinematics puts them, feet on a floor at y = 820.
const drawn = (pose: PoseAngles, facing: Facing, x = 700, floor = 820) => {
  const s = forwardKinematics(pose, facing, { x, y: 0 }, H, "normal", false);
  const dy = floor - Math.max(s.lFoot.y, s.rFoot.y);
  for (const p of Object.values(s)) p.y += dy;
  return jointsOf(s);
};
const worst = (s: Skeleton, joints: Record<JointPick, Point>) => Math.max(...PICKS.map((j) => dist(s[j], joints[j])));

const POSES: [string, PoseAngles, Facing][] = [
  ["stand right", STAND, "right"],
  ["stand left", STAND, "left"],
  ["stand front", STAND_FRONT, "front"],
  ["stride", { lean: 8, head: 0, lShoulder: 40, rShoulder: -35, lElbow: 70, rElbow: 60, lHip: 35, rHip: -20, lKnee: 15, rKnee: 60 }, "right"],
  ["punch", { lean: 12, head: -5, lShoulder: 88, rShoulder: -20, lElbow: 4, rElbow: 120, lHip: 25, rHip: -15, lKnee: 20, rKnee: 10 }, "left"],
  ["kick", { lean: -15, head: 5, lShoulder: -40, rShoulder: 50, lElbow: 30, rElbow: 40, lHip: 95, rHip: -5, lKnee: 10, rKnee: 12 }, "right"],
  ["crouch", { lean: 30, head: -10, lShoulder: 60, rShoulder: 45, lElbow: 50, rElbow: 40, lHip: 100, rHip: 90, lKnee: 120, rKnee: 110 }, "left"],
  ["arms up front", { lean: 0, head: 0, lShoulder: 150, rShoulder: 140, lElbow: 20, rElbow: 10, lHip: 20, rHip: 12, lKnee: 0, rKnee: 0 }, "front"],
];

test("JOINT_PICKS asks for every joint once, in plain words", () => {
  assert.equal(new Set(PICKS).size, 11);
  for (const p of JOINT_PICKS) assert.ok(p.prompt.length > 8 && !/\bleft\b|\bright\b/i.test(p.prompt), p.prompt);
});

test("readDrawnFigure: joints -> pose -> joints again (round trip within 2% of the height), height and placement", () => {
  for (const [name, pose, facing] of POSES) {
    const joints = drawn(pose, facing);
    const fig = readDrawnFigure(joints, LOOK);
    assert.ok(Math.abs(fig.height - H) < 0.01 * H, `${name}: height ${fig.height}`);
    assert.equal(fig.x, joints.hip.x, name);
    const s = forwardKinematics(fig.pose, fig.facing, fig.joints.hip, fig.height, fig.style.headSize, fig.style.neck);
    assert.ok(worst(s, fig.joints) < 0.02 * H, `${name}: round trip off by ${worst(s, fig.joints).toFixed(1)} px (read ${fig.facing})`);
    if (facing !== "front" && !name.startsWith("stand")) assert.equal(fig.facing, facing, `${name}: facing`);
    assert.equal(fig.style.headSize, "normal", name);
    assert.equal(fig.style.color, LOOK.color);
  }
});

test("readDrawnFigure: the user may click the arms and legs in either order", () => {
  for (const [name, pose, facing] of POSES) {
    const j = drawn(pose, facing);
    const swapped = { ...j, lElbow: j.rElbow, lHand: j.rHand, rElbow: j.lElbow, rHand: j.lHand, lKnee: j.rKnee, lFoot: j.rFoot, rKnee: j.lKnee, rFoot: j.lFoot };
    const fig = readDrawnFigure(swapped, LOOK);
    const s = forwardKinematics(fig.pose, fig.facing, fig.joints.hip, fig.height, fig.style.headSize, fig.style.neck);
    // (Every drawn joint is still matched by one of the read figure's joints of the same kind.)
    for (const kind of ["Elbow", "Hand", "Knee", "Foot"] as const) {
      for (const side of ["l", "r"] as const) {
        const want = j[`${side}${kind}`];
        assert.ok(Math.min(dist(s[`l${kind}`], want), dist(s[`r${kind}`], want)) < 0.02 * H, `${name}: ${side}${kind}`);
      }
    }
  }
});

test("readDrawnFigure: the engine stands the read figure exactly where it was drawn", () => {
  for (const [name, pose, facing] of POSES) {
    const joints = drawn(pose, facing);
    const fig = readDrawnFigure(joints, LOOK);
    const built = buildScene({ id: "t", title: "t", durationSec: 0, groundY: fig.groundY, characters: [{ id: "a", name: "a", facing: fig.facing, height: fig.height, style: fig.style, keys: [{ t: 0, pose: fig.pose, x: fig.x, lift: fig.lift }] }] }, 12);
    const s = built.frames[0][0].skeleton;
    assert.ok(worst(s, fig.joints) < 0.03 * H, `${name}: placed off by ${worst(s, fig.joints).toFixed(1)} px`);
  }
});

// A drawing as pixels: lines `thickness` wide, the head a filled disc or a ring.
function painter(joints: Record<JointPick, Point>, look: { color: string; thickness: number; headFilled: boolean; r: number }) {
  const rgb = [1, 3, 5].map((i) => parseInt(look.color.slice(i, i + 2), 16));
  const bones: [JointPick, JointPick][] = [["hip", "neck"], ["neck", "lElbow"], ["lElbow", "lHand"], ["neck", "rElbow"], ["rElbow", "rHand"], ["hip", "lKnee"], ["lKnee", "lFoot"], ["hip", "rKnee"], ["rKnee", "rFoot"]];
  const segDist = (p: Point, a: Point, b: Point) => {
    const L2 = (b.x - a.x) ** 2 + (b.y - a.y) ** 2;
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / L2));
    return Math.hypot(p.x - a.x - t * (b.x - a.x), p.y - a.y - t * (b.y - a.y));
  };
  return (x: number, y: number) => {
    const p = { x: Math.floor(x) + 0.5, y: Math.floor(y) + 0.5 };
    const half = look.thickness / 2;
    const dh = dist(p, joints.head);
    const ink = bones.some(([a, b]) => segDist(p, joints[a], joints[b]) <= half) || (look.headFilled ? dh <= look.r + half : Math.abs(dh - look.r) <= half);
    return ink ? ([rgb[0], rgb[1], rgb[2], 255] as const) : ([0, 0, 0, 0] as const);
  };
}

test("lookFromPixels reads the color, line thickness, solid or hollow head and its size", () => {
  for (const [color, thickness, headFilled] of [["#2563eb", 6, true], ["#111111", 3, false], ["#dc2626", 10, true], ["#16a34a", 8, false]] as const) {
    const joints = drawn(POSES[3][1], "right");
    const r = dist(joints.head, joints.neck);
    const look = lookFromPixels(painter(joints, { color, thickness, headFilled, r }), joints);
    assert.equal(look.color, color);
    assert.ok(Math.abs(look.thickness - thickness) <= 1, `thickness ${look.thickness} vs ${thickness}`);
    assert.equal(look.headFilled, headFilled);
    assert.ok(look.headRadius !== undefined && Math.abs(look.headRadius - r) <= 2, `head radius ${look.headRadius} vs ${r}`);
    // Clicks a few px off the lines still read the same look.
    const off = Object.fromEntries(Object.entries(joints).map(([k, p]) => [k, { x: p.x + 2, y: p.y - 2 }])) as Record<JointPick, Point>;
    const again = lookFromPixels(painter(joints, { color, thickness, headFilled, r }), off);
    assert.equal(again.color, color);
    assert.ok(Math.abs(again.thickness - thickness) <= 1.5);
  }
});

test("comeTrueScene: starts standing on the same spot, dips first (anticipation), overshoots a little and ends exactly in the pose", () => {
  for (const [name, pose, facing] of POSES) {
    const joints = drawn(pose, facing);
    const fig = readDrawnFigure(joints, LOOK);
    const scene = comeTrueScene(fig);
    assert.ok(scene.durationSec >= 1 && scene.durationSec <= 1.6);
    for (const fps of [8, 12, 24]) {
      const built = buildScene(scene, fps);
      const frames = built.frames.map((f) => f[0].skeleton);
      const first = frames[0], last = frames[frames.length - 1];
      assert.equal(built.report.characters[0].belowGroundFrames, 0, `${name} ${fps}: below ground`);
      assert.ok(built.report.characters[0].maxFootDriftPx <= 1, `${name} ${fps}: foot drift`);
      // Standing on the drawn floor, placed so one drawn foot is ALREADY on its drawn spot (it never slides; round 2,
      // Arthur: "the engine can't slide its feet") — so the start is near, not always exactly at, the drawn hips.
      const drawnSk = frames[frames.length - 1];
      assert.ok((["lFoot", "rFoot"] as const).some((f) => dist(first[f], drawnSk[f]) < 0.01 * H), `${name}: no foot starts on its drawn spot`);
      assert.ok(Math.abs(first.hip.x - fig.x) < 0.35 * H, `${name}: start x`);
      assert.ok(Math.abs(Math.max(first.lFoot.y, first.rFoot.y) - fig.groundY) < 0.5, `${name}: start floor`);
      assert.ok(worst(last, fig.joints) < 0.03 * H, `${name} ${fps}: end off by ${worst(last, fig.joints).toFixed(1)}`);
      // Anticipation: before reaching the pose the hips dip below the standing hips.
      const lowest = Math.max(...frames.slice(0, Math.ceil(0.7 * fps)).map((s) => s.hip.y));
      assert.ok(lowest > first.hip.y + 0.015 * H, `${name} ${fps}: no dip`);
      // The first pictures hold still (a beat standing).
      // (The upper body; the engine re-bends planted knees from the second picture on, in every scene.)
      for (const j of ["hip", "neck", "head", "lElbow", "lHand", "rElbow", "rHand"] as const) assert.ok(dist(frames[1][j], first[j]) < 1, `${name} ${fps}: not still at the start (${j})`);
    }
    // The overshoot key goes past the pose and the last stretch holds it.
    const keys = scene.characters[0].keys;
    assert.deepEqual(keys[keys.length - 1].pose, fig.pose);
    assert.notDeepEqual(keys[keys.length - 3].pose, fig.pose);
  }
});

test("finishScene \"keepGoing\" (the default) reads where the animation is and CARRIES ON: run, walk, jump, punch, settle", () => {
  assert.equal(FINISH_CHOICES[0].id, "keepGoing");
  const stride: PoseAngles = { lean: 8, head: 0, lShoulder: 40, rShoulder: -35, lElbow: 70, rElbow: 60, lHip: 35, rHip: -20, lKnee: 15, rKnee: 60 };
  const ARMS_UP: PoseAngles = { ...STAND, lShoulder: 150, rShoulder: 140, lHip: 20, rHip: -10, lKnee: 30, rKnee: 40 };
  const cases: [string, "run" | "walk" | "jump" | "punch" | "settle", { pose: PoseAngles; x: number; floor: number }[]][] = [
    ["running right", "run", [0, 1, 2, 3].map((k) => ({ pose: stride, x: 600 + k * 50, floor: 820 }))],
    ["walking right", "walk", [0, 1, 2, 3].map((k) => ({ pose: stride, x: 600 + k * 14, floor: 820 }))],
    ["going up", "jump", [0, 1, 2, 3].map((k) => ({ pose: ARMS_UP, x: 700 + k * 6, floor: 820 - k * 22 }))],
    ["arm thrown forward", "punch", [{ pose: GUARD, x: 700, floor: 820 }, { pose: GUARD, x: 700, floor: 820 }, { pose: { ...GUARD, lean: 12, lHip: 25, rHip: -5, lShoulder: 80, lElbow: 40 }, x: 700, floor: 820 }, { pose: { ...GUARD, lean: 12, lHip: 25, rHip: -5, lShoulder: 92, lElbow: 4 }, x: 700, floor: 820 }]],
    ["stopped", "settle", [0, 1, 2, 3].map(() => ({ pose: stride, x: 700, floor: 820 }))],
  ];
  for (const [name, kind, drawings] of cases) {
    const figs = drawings.map((d) => readDrawnFigure(drawn(d.pose, "right", d.x, d.floor), LOOK));
    const fig = figs[figs.length - 1];
    const previous = figs.slice(0, -1).map((f, frame) => ({ frame, fig: f }));
    assert.equal(readKeepGoing(fig, { previous, fps: 12 }).kind, kind, name);
    // (The app's other way: the earlier drawings alone, oldest first.)
    assert.equal(readKeepGoing(fig, { previous: figs.slice(0, -1), fps: 12 }).kind, kind, `${name} (figures only)`);
    for (const fps of [8, 12, 24]) {
      const scene = finishScene(fig, "keepGoing", { stageWidth: 1920, previous, fps });
      const built = buildScene(scene, fps);
      const frames = built.frames.map((f) => f[0].skeleton);
      assert.ok(worst(frames[0], fig.joints) < 0.03 * H, `${name} @${fps}: first picture off by ${worst(frames[0], fig.joints).toFixed(1)}`);
      const r = built.report.characters[0];
      assert.ok(r.maxBoneErrorPx <= 0.5 && r.maxFootDriftPx <= 1 && r.belowGroundFrames === 0, `${name} @${fps}: body rules ${JSON.stringify(r)}`);
      const end = frames[frames.length - 1];
      if (kind === "run" || kind === "walk") assert.ok(end.hip.x > 1920 + 0.3 * H, `${name} @${fps}: still on the page at ${end.hip.x.toFixed(0)}`);
      if (kind === "jump") {
        assert.ok(Math.min(...frames.map((f) => f.hip.y)) < frames[0].hip.y - 0.02 * H, `${name} @${fps}: does not keep rising`);
        assert.ok(Math.abs(Math.max(end.lFoot.y, end.rFoot.y) - 820) < 1, `${name} @${fps}: does not land on the floor`);
      }
      if (kind === "settle") {
        assert.ok(worstSlide(frames, scene.groundY) <= 0.005 * H, `${name} @${fps}: a foot slid`);
        assert.ok(Math.abs(end.neck.x - end.hip.x) < 0.08 * H, `${name} @${fps}: does not stand up`);
      }
    }
  }
});

// FOOT SLIDING: the most any foot that is on the floor (within 1% of the height) in two pictures in a row moves sideways.
const worstSlide = (frames: Skeleton[], floor: number) => {
  let most = 0;
  for (let i = 1; i < frames.length; i++) for (const f of ["lFoot", "rFoot"] as const) {
    if (floor - frames[i][f].y <= 0.01 * H && floor - frames[i - 1][f].y <= 0.01 * H) most = Math.max(most, Math.abs(frames[i][f].x - frames[i - 1][f].x));
  }
  return most;
};
const MORE_POSES: [string, PoseAngles, Facing][] = [
  ...POSES,
  ["wide stance front", { ...STAND_FRONT, lHip: 38, rHip: 38, lKnee: 10, rKnee: 10 }, "front"],
  ["lunge", { lean: 10, head: 0, lShoulder: 30, rShoulder: -30, lElbow: 40, rElbow: 40, lHip: 70, rHip: -35, lKnee: 75, rKnee: 5 }, "right"],
  ["both feet moved (very wide)", { lean: 4, head: 0, lShoulder: 60, rShoulder: -40, lElbow: 20, rElbow: 20, lHip: 48, rHip: -38, lKnee: 30, rKnee: 4 }, "left"],
];

test("comeTrueScene NEVER SLIDES A FOOT: a foot on the floor stays put, a foot moves only lifted, and it ends exactly as drawn", () => {
  for (const [name, pose, facing] of MORE_POSES) {
    const fig = readDrawnFigure(drawn(pose, facing), LOOK);
    const scene = comeTrueScene(fig);
    for (const fps of [8, 12, 24]) {
      const built = buildScene(scene, fps);
      const frames = built.frames.map((f) => f[0].skeleton);
      const slid = worstSlide(frames, scene.groundY);
      assert.ok(slid <= 0.005 * H, `${name} @${fps}: a foot on the floor slid ${slid.toFixed(1)} px`);
      assert.ok(worst(frames[frames.length - 1], fig.joints) < 0.03 * H, `${name} @${fps}: ends off by ${worst(frames[frames.length - 1], fig.joints).toFixed(1)}`);
      const r = built.report.characters[0];
      assert.ok(r.maxBoneErrorPx <= 0.5 && r.maxFootDriftPx <= 1 && r.belowGroundFrames === 0, `${name} @${fps}: body rules ${JSON.stringify(r)}`);
    }
  }
});

test("finishScene: the first picture is the drawing, then the chosen move; walk/run off leave the page", () => {
  for (const [name, pose, facing] of POSES.filter(([n]) => ["stride", "punch", "stand front", "kick"].includes(n))) {
    const joints = drawn(pose, facing);
    const fig = readDrawnFigure(joints, LOOK);
    for (const choice of FINISH_CHOICES) {
      const scene = finishScene(fig, choice.id, { stageWidth: 1920 });
      const built = buildScene(scene, 12);
      const frames = built.frames.map((f) => f[0].skeleton);
      assert.ok(worst(frames[0], fig.joints) < 0.03 * H, `${name}/${choice.id}: first picture off by ${worst(frames[0], fig.joints).toFixed(1)}`);
      assert.equal(built.report.characters[0].belowGroundFrames, 0, `${name}/${choice.id}: below ground`);
      assert.ok(built.report.characters[0].maxBoneErrorPx <= 0.5, `${name}/${choice.id}: bones`);
      assert.ok(scene.durationSec > 0.8, `${name}/${choice.id}: too short`);
      const end = frames[frames.length - 1];
      if (choice.id === "walkOff" || choice.id === "runOff") assert.ok(end.hip.x > 1920 + 0.3 * H || end.hip.x < -0.3 * H, `${name}/${choice.id}: still on the page at ${end.hip.x.toFixed(0)}`);
      else assert.ok(end.hip.x > -0.3 * H && end.hip.x < 1920 + 0.3 * H, `${name}/${choice.id}: wandered off`);
    }
  }
  assert.ok(FINISH_CHOICES.length >= 6);
  assert.throws(() => finishScene(readDrawnFigure(drawn(STAND, "right"), LOOK), "nope"));
});

test("finishScene FLOWS ON from the drawing: it joins the move where it already is (no stand-still beat), feet planted", () => {
  for (const [name, pose, facing] of POSES.filter(([n]) => ["stride", "punch", "kick"].includes(n))) {
    const fig = readDrawnFigure(drawn(pose, facing), LOOK);
    for (const choice of FINISH_CHOICES) {
      for (const fps of [8, 12, 24]) {
        const built = buildScene(finishScene(fig, choice.id, { stageWidth: 1920 }), fps);
        const frames = built.frames.map((f) => f[0].skeleton);
        // The longest run of (nearly) still pictures in the first second: a stop in a stand would be 0.4 s or more.
        let run = 0, longest = 0;
        for (let i = 1; i < Math.min(frames.length, fps + 1); i++) {
          const moved = Math.max(...PICKS.map((j) => dist(frames[i][j], frames[i - 1][j])));
          run = moved < (0.072 * H) / fps ? run + 1 : 0;
          longest = Math.max(longest, run);
        }
        assert.ok(longest / fps < 0.26, `${name}/${choice.id} @${fps}: stands still for ${(longest / fps).toFixed(2)} s before the move`);
        assert.ok(built.report.characters[0].maxFootDriftPx <= 1, `${name}/${choice.id} @${fps}: a planted foot slides`);
      }
    }
  }
});

// A hand-drawn run: the engine's own run, its joints wobbled by up to `wobble` x the height (a fixed pseudo-random).
function scribbledRun(fps: number, wobble: number) {
  const plan = planToScene({ id: "r", title: "r", height: H, groundY: 820, characters: [{ id: "a", x: 300, facing: "right", actions: [{ move: "run", params: { distance: 900 } }] }] }, LIBRARY);
  const built = buildScene(plan, fps);
  let seed = 7;
  const rand = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647 - 0.5; };
  return built.frames.slice(Math.round(0.4 * fps), Math.round(1.6 * fps)).map((f) => {
    const j = jointsOf(f[0].skeleton);
    for (const p of Object.values(j)) { p.x += 2 * rand() * wobble * H; p.y += 2 * rand() * wobble * H; }
    return j;
  });
}

test("cleanUpScene: every clicked pose on its own frame, one steady size, the same timing", () => {
  for (const fps of [8, 12, 24]) {
    const drawnFrames = scribbledRun(fps, 0);
    const keys = drawnFrames.map((j, frame) => ({ frame, fig: readDrawnFigure(j, LOOK) }));
    const scene = cleanUpScene(keys, { fps, frameCount: drawnFrames.length });
    const built = buildScene(scene, fps);
    assert.equal(built.frames.length, drawnFrames.length, `${fps}: same number of pictures`);
    built.frames.forEach((f, i) => {
      const s = f[0].skeleton;
      assert.ok(worst(s, drawnFrames[i]) < 0.04 * H, `${fps} frame ${i}: off by ${worst(s, drawnFrames[i]).toFixed(1)}`);
      assert.ok(measureBoneError(s, scene.characters[0].height, f[0].headRadius, scene.characters[0].style.neck === true) <= 0.5);
    });
    assert.equal(built.report.characters[0].belowGroundFrames, 0);
  }
});

test("cleanUpScene: a scribbly run comes out clean and steady; a frame with no drawing keeps the one before", () => {
  const fps = 12;
  const drawnFrames = scribbledRun(fps, 0.012);
  const reads = drawnFrames.map((j) => readDrawnFigure(j, LOOK));
  // The scribbles make the read sizes wobble; the clean-up keeps one size.
  assert.ok(Math.max(...reads.map((r) => r.height)) - Math.min(...reads.map((r) => r.height)) > 2);
  const every = cleanUpScene(reads.map((fig, frame) => ({ frame, fig })), { fps, frameCount: drawnFrames.length });
  const built = buildScene(every, fps);
  built.frames.forEach((f, i) => assert.ok(worst(f[0].skeleton, drawnFrames[i]) < 0.06 * H, `frame ${i}: off by ${worst(f[0].skeleton, drawnFrames[i]).toFixed(1)}`));
  // Only every other frame clicked: the clicked ones are still hit; the others SHOW THE DRAWING BEFORE (round 2, Arthur:
  // clean-up "should not add frames or anything like that" — nothing is in-betweened).
  const clean = scribbledRun(fps, 0);
  const half = cleanUpScene(clean.map((j, frame) => ({ frame, fig: readDrawnFigure(j, LOOK) })).filter((k) => k.frame % 2 === 0), { fps, frameCount: clean.length });
  const builtHalf = buildScene(half, fps);
  assert.equal(builtHalf.frames.length, clean.length);
  builtHalf.frames.forEach((f, i) => { assert.ok(worst(f[0].skeleton, clean[i - (i % 2)]) < 0.04 * H, `half frame ${i}`); });
  assert.equal(builtHalf.report.characters[0].belowGroundFrames, 0);
  assert.ok(builtHalf.report.characters[0].maxBoneErrorPx <= 0.5);
});

// How shaky a run of pictures is: the joints' changes of speed from picture to picture, added up.
const shake = (frames: Skeleton[]) => {
  let sum = 0;
  for (let i = 1; i < frames.length - 1; i++) for (const j of PICKS) sum += Math.hypot(frames[i + 1][j].x - 2 * frames[i][j].x + frames[i - 1][j].x, frames[i + 1][j].y - 2 * frames[i][j].y + frames[i - 1][j].y);
  return sum;
};
const HOLLOW: DrawnLook = { color: "#16a34a", thickness: 4, headFilled: false, headRadius: HEAD_RADIUS.normal * H };

test("improveAnimationScene: a shaky hand-drawn run gets smoother motion AND neat lines, same look, same frames", () => {
  for (const fps of [12, 24]) {
    const drawnFrames = scribbledRun(fps, 0.012);
    const keys = drawnFrames.map((j, frame) => ({ frame, fig: readDrawnFigure(j, HOLLOW) }));
    const cleaned = buildScene(cleanUpScene(keys, { fps, frameCount: drawnFrames.length }), fps);
    const scene = improveAnimationScene(keys, { fps, frameCount: drawnFrames.length });
    const better = buildScene(scene, fps);
    assert.equal(better.frames.length, drawnFrames.length, `${fps}: same number of pictures`);
    // The same figure: hollow head stays hollow, same color and line thickness.
    assert.equal(scene.characters[0].style.headFilled, false);
    assert.equal(scene.characters[0].style.color, HOLLOW.color);
    assert.equal(scene.characters[0].style.thickness, HOLLOW.thickness);
    const a = shake(cleaned.frames.map((f) => f[0].skeleton)), b = shake(better.frames.map((f) => f[0].skeleton));
    assert.ok(b < (fps >= 24 ? 0.9 : 1) * a, `${fps}: not smoother (${b.toFixed(0)} vs clean-up ${a.toFixed(0)})`);
    // Still the same run: every picture near what they drew, first and last right on it.
    better.frames.forEach((f, i) => assert.ok(worst(f[0].skeleton, drawnFrames[i]) < 0.08 * H, `${fps} frame ${i}: off by ${worst(f[0].skeleton, drawnFrames[i]).toFixed(1)}`));
    for (const i of [0, drawnFrames.length - 1]) assert.ok(worst(better.frames[i][0].skeleton, drawnFrames[i]) < 0.05 * H, `${fps} frame ${i}`);
    const r = better.report.characters[0];
    assert.ok(r.maxBoneErrorPx <= 0.5 && r.maxFootDriftPx <= 1 && r.belowGroundFrames === 0, `${fps}: body rules ${JSON.stringify(r)}`);
  }
});

test("improveAnimationScene: uneven spacing gets even; turn-arounds and holds stay on their frames", () => {
  const fps = 12;
  // An arm raised in bunches (three small steps, a jump, ...), held, then brought back down past the middle.
  const shoulder = [8, 10, 12, 70, 74, 76, 140, 142, 144, 144, 144, 144, 100, 40, 8];
  const drawnFrames = shoulder.map((lShoulder) => drawn({ ...STAND, lShoulder }, "right"));
  const keys = drawnFrames.map((j, frame) => ({ frame, fig: readDrawnFigure(j, LOOK) }));
  const cleaned = buildScene(cleanUpScene(keys, { fps, frameCount: shoulder.length }), fps).frames.map((f) => f[0].skeleton);
  const better = buildScene(improveAnimationScene(keys, { fps, frameCount: shoulder.length }), fps).frames.map((f) => f[0].skeleton);
  assert.equal(better.length, shoulder.length);
  const step = (fr: Skeleton[], a: number, b: number) => Math.max(...fr.slice(a + 1, b + 1).map((s, i) => dist(s.lHand, fr[a + i].lHand)));
  // The raise (pictures 0-8): the biggest jump of the hand is clearly smaller — the steps are even.
  assert.ok(step(better, 0, 8) < 0.75 * step(cleaned, 0, 8), `raise not evened: ${step(better, 0, 8).toFixed(0)} vs ${step(cleaned, 0, 8).toFixed(0)}`);
  // Key poses stay: the start, the top (start and end of the hold) and the end, each on its own frame.
  for (const i of [0, 8, 11, 14]) assert.ok(worst(better[i], drawnFrames[i]) < 0.03 * H, `frame ${i} moved: ${worst(better[i], drawnFrames[i]).toFixed(1)}`);
  // The hold is still a hold.
  for (const i of [9, 10, 11]) assert.ok(dist(better[i].lHand, better[8].lHand) < 1, `hold broken at ${i}`);
});

// A "horrible" key-poses-only animation (Arthur's test): each drawn pose held for a few pictures, nothing in between.
const GUARD: PoseAngles = { lean: 5, head: 0, lShoulder: 60, rShoulder: 40, lElbow: 110, rElbow: 120, lHip: 18, rHip: -12, lKnee: 15, rKnee: 15 };
// (Round 6: the engine's own proper anticipation crouch — clean-up now tidies a crouch into exactly this pose, poseFix.ts;
// it used to be lean 25, arms -30/-25, legs 75/110, which clean-up now straightens — these tests are about timing.)
const CROUCH: PoseAngles = { lean: 28, head: -12, lShoulder: -42, rShoulder: -50, lElbow: 22, rElbow: 18, lHip: 74, rHip: 74, lKnee: 105, rKnee: 105 };
const CHOPPY: [string, Facing, [PoseAngles, number, number][]][] = [
  ["punch", "right", [[GUARD, 5, 0], [{ ...GUARD, lean: 12, lHip: 25, rHip: -5, lShoulder: 92, lElbow: 4 }, 4, 0], [GUARD, 5, 0], [{ ...GUARD, lean: 10, lHip: 23, rHip: -7, rShoulder: 90, rElbow: 6 }, 4, 0], [GUARD, 6, 0]]],
  ["wave", "front", [[STAND_FRONT, 5, 0], [{ ...STAND_FRONT, rShoulder: 150, rElbow: 30 }, 4, 0], [{ ...STAND_FRONT, rShoulder: 150, rElbow: -20 }, 4, 0], [{ ...STAND_FRONT, rShoulder: 150, rElbow: 30 }, 4, 0], [STAND_FRONT, 6, 0]]],
  ["jump", "right", [[STAND, 5, 0], [CROUCH, 5, 0], [{ ...STAND, lShoulder: 150, rShoulder: 140, lHip: 20, rHip: -10, lKnee: 30, rKnee: 40 }, 5, 70], [CROUCH, 4, 0], [STAND, 6, 0]]],
];
function choppy(poses: [PoseAngles, number, number][], facing: Facing, look = HOLLOW) {
  const frames: Record<JointPick, Point>[] = [], starts: number[] = [];
  for (const [pose, hold, up] of poses) { starts.push(frames.length); for (let k = 0; k < hold; k++) frames.push(drawn(pose, facing, 700, 820 - up)); }
  return { frames, starts, keys: frames.map((j, frame) => ({ frame, fig: readDrawnFigure(j, look) })) };
}
const longestHold = (frames: Skeleton[]) => {
  let run = 1, most = 1;
  for (let i = 1; i < frames.length; i++) { run = PICKS.every((j) => dist(frames[i][j], frames[i - 1][j]) < 0.5) ? run + 1 : 1; most = Math.max(most, run); }
  return most;
};

test("improveAnimationScene from KEY POSES ONLY: the choppy animation becomes a real one (in-betweens, anticipation, settle, feet planted, same look)", () => {
  const fps = 12;
  for (const [name, facing, poses] of CHOPPY) {
    for (const format of ["every frame", "hold start and end"] as const) {
      const c = choppy(poses, facing);
      const keys = format === "every frame" ? c.keys : c.keys.filter((k, i) => c.starts.includes(i) || c.starts.includes(i + 1) || i === c.keys.length - 1);
      const scene = improveAnimationScene(keys, { fps, frameCount: c.frames.length });
      const built = buildScene(scene, fps);
      const frames = built.frames.map((f) => f[0].skeleton);
      const tag = `${name} (${format})`;
      assert.ok(Math.abs(frames.length - c.frames.length) <= 1, `${tag}: length ${frames.length} vs ${c.frames.length}`);
      // (a) No frozen stretches: the drawn holds (0.33-0.5 s of identical pictures) are now motion.
      const before = longestHold(buildScene(cleanUpScene(keys, { fps, frameCount: c.frames.length }), fps).frames.map((f) => f[0].skeleton));
      assert.ok(before >= 4, `${tag}: the drawing itself should be choppy`);
      assert.ok(longestHold(frames) / fps <= 0.42, `${tag}: still holds ${longestHold(frames)} identical pictures`);
      // (b) Every drawn key pose is reached near its own time.
      c.starts.forEach((s, i) => {
        const near = Math.min(...frames.slice(Math.max(0, s - 2), Math.min(frames.length, s + 4)).map((f) => worst(f, c.frames[s])));
        assert.ok(near < 0.04 * H, `${tag}: key pose ${i} (frame ${s}) missed by ${near.toFixed(1)} px`);
      });
      // (c) Anticipation before the biggest change (a key that goes the OTHER way first) and an overshoot that settles.
      const ck = scene.characters[0].keys, P = poses.map(([p]) => p);
      let big = 1, bigJoint: keyof PoseAngles = "lean", bigGap = 0;
      for (let i = 1; i < P.length; i++) for (const k of Object.keys(P[i]) as (keyof PoseAngles)[]) if (Math.abs(P[i][k] - P[i - 1][k]) > bigGap) { bigGap = Math.abs(P[i][k] - P[i - 1][k]); big = i; bigJoint = k; }
      const tA = c.starts[big - 1] / fps, tB = c.starts[big] / fps, dir = Math.sign(P[big][bigJoint] - P[big - 1][bigJoint]);
      assert.ok(ck.some((k) => k.t > tA && k.t < tB && dir * (k.pose[bigJoint] - P[big - 1][bigJoint]) < -1), `${tag}: no anticipation on ${bigJoint} before key ${big}`);
      assert.ok(ck.some((k) => Math.abs(k.t - tB) < 0.02 && dir * (k.pose[bigJoint] - P[big][bigJoint]) > 0.5) || name === "jump", `${tag}: no overshoot on ${bigJoint} at key ${big}`);
      // (d) Body rules: no foot sliding, bones steady, nothing below the ground.
      const r = built.report.characters[0];
      assert.ok(r.maxBoneErrorPx <= 0.5 && r.maxFootDriftPx <= 1 && r.belowGroundFrames === 0, `${tag}: body rules ${JSON.stringify(r)}`);
      assert.ok(worstSlide(frames, scene.groundY) <= 0.005 * H, `${tag}: a foot on the floor slid ${worstSlide(frames, scene.groundY).toFixed(1)} px`);
      // (e) The same look.
      assert.equal(scene.characters[0].style.headFilled, false);
      assert.equal(scene.characters[0].style.color, HOLLOW.color);
      assert.equal(scene.characters[0].style.thickness, HOLLOW.thickness);
    }
  }
});

test("improveAnimationScene: the jump's landing has WEIGHT (the hips dip lower than the drawn landing crouch, then come back)", () => {
  const fps = 12;
  const [, facing, poses] = CHOPPY[2];
  const c = choppy(poses, facing);
  const frames = buildScene(improveAnimationScene(c.keys, { fps, frameCount: c.frames.length }), fps).frames.map((f) => f[0].skeleton);
  const land = c.starts[3];
  const lowest = Math.max(...frames.slice(land, land + 3).map((f) => f.hip.y));
  assert.ok(lowest > c.frames[land].hip.y + 0.02 * H, `no landing dip: ${lowest.toFixed(1)} vs drawn ${c.frames[land].hip.y.toFixed(1)}`);
});

test("cleanUpScene is STRICTLY IN PLACE: same frame count, every drawing on its own frame with its own pose, holds stay holds, nothing in-betweened", () => {
  for (const fps of [8, 12, 24]) {
    for (const [name, facing, poses] of CHOPPY) {
      const c = choppy(poses, facing, LOOK);
      const scene = cleanUpScene(c.keys, { fps, frameCount: c.frames.length });
      const frames = buildScene(scene, fps).frames.map((f) => f[0].skeleton);
      assert.equal(frames.length, c.frames.length, `${name} @${fps}: frame count`);
      frames.forEach((f, i) => assert.ok(worst(f, c.frames[i]) < 0.03 * H, `${name} @${fps} frame ${i}: off by ${worst(f, c.frames[i]).toFixed(1)}`));
      // Holds stay holds: every drawn hold is the same picture all the way; the change happens in ONE picture (no in-betweens).
      for (let i = 1; i < frames.length; i++) {
        const sameDrawing = !c.starts.includes(i);
        const moved = Math.max(...PICKS.map((j) => dist(frames[i][j], frames[i - 1][j])));
        if (sameDrawing) assert.ok(moved < 0.01, `${name} @${fps}: hold broken at ${i} (${moved.toFixed(2)} px)`);
      }
    }
    // Only the start of each drawing given (the app's way to say "held"): the same pictures.
    const c = choppy(CHOPPY[0][2], "right", LOOK);
    const sparse = cleanUpScene(c.keys.filter((_, i) => c.starts.includes(i)), { fps, frameCount: c.frames.length });
    const frames = buildScene(sparse, fps).frames.map((f) => f[0].skeleton);
    assert.equal(frames.length, c.frames.length);
    frames.forEach((f, i) => assert.ok(worst(f, c.frames[i]) < 0.03 * H, `sparse @${fps} frame ${i}: off by ${worst(f, c.frames[i]).toFixed(1)}`));
  }
});

test("effectOnDrawingScene: every effect builds alone (no figures) at 8, 12 and 24 fps at the clicked spot", () => {
  for (const effect of DRAWING_EFFECTS) {
    for (const fps of [8, 12, 24]) {
      const scene = effectOnDrawingScene(effect.id, { x: 800, y: 700 }, { fps, height: 240, ...(effect.needsText ? { text: "POW!" } : {}) });
      assert.equal(scene.characters.length, 0);
      assert.equal(scene.effects.length, 1);
      const built = buildScene(scene, fps);
      assert.equal(built.frames.length, frameCountFor(scene.durationSec, fps));
      const fx = buildEffectFrames(scene, built);
      assert.equal(fx.length, built.frames.length);
      const drawnPictures = fx.filter((f) => f.front.length + f.back.length + (f.top?.length ?? 0) > 0).length;
      assert.ok(drawnPictures >= Math.floor(built.frames.length * 0.5), `${effect.id} ${fps}: only ${drawnPictures} pictures drawn`);
    }
  }
  assert.equal(effectOnDrawingScene("fire", { x: 800, y: 700 }, { fps: 12 }).groundY, 700);
  assert.equal((effectOnDrawingScene("fire", { x: 800, y: 700 }, { fps: 12, groundY: 760 }).effects[0].anchor as Point).y, 760);
  assert.throws(() => effectOnDrawingScene("nope", { x: 0, y: 0 }, { fps: 12 }));
});

// FINISHING SOMEONE'S ANIMATION (Arthur: "the air turned into a ground for him … it's always trying to do a run cycle"):
// half a hop finishes AS A HOP — it falls with gravity onto the floor where the figure stood, lands and stands.
const HOP_UP: PoseAngles = { ...STAND, lShoulder: 150, rShoulder: 140, lHip: 20, rHip: -10, lKnee: 30, rKnee: 40 };
const TUCK: PoseAngles = { lean: 5, head: 0, lShoulder: 120, rShoulder: 100, lElbow: 30, rElbow: 30, lHip: 110, rHip: 105, lKnee: 150, rKnee: 150 };
const TAKE_OFF: PoseAngles = { ...STAND, lean: 10, lShoulder: 120, rShoulder: 110, lHip: 10, rHip: -5, lKnee: 5, rKnee: 5 };
function checkHopFinish(name: string, scene: ReturnType<typeof finishScene>, fps: number, floor: number, startX: number, drift: number) {
  const built = buildScene(scene, fps);
  const frames = built.frames.map((f) => f[0].skeleton);
  const r = built.report.characters[0];
  assert.ok(r.maxBoneErrorPx <= 0.5 && r.belowGroundFrames === 0, `${name} @${fps}: body rules ${JSON.stringify(r)}`);
  const feetY = frames.map((f) => Math.max(f.lFoot.y, f.rFoot.y));
  assert.ok(Math.max(...feetY) <= floor + 0.01 * H, `${name} @${fps}: goes below the floor`);
  const end = frames[frames.length - 1];
  assert.ok(Math.abs(Math.max(end.lFoot.y, end.rFoot.y) - floor) < 0.01 * H, `${name} @${fps}: ends at ${Math.max(end.lFoot.y, end.rFoot.y).toFixed(1)}, not on the floor ${floor}`);
  assert.ok(Math.abs(end.neck.x - end.hip.x) < 0.08 * H, `${name} @${fps}: does not stand up`);
  // Never runs: the hips travel no further than the hop's own drift; once landed, the feet stay put (no stepping).
  assert.ok(Math.max(...frames.map((f) => Math.abs(f.hip.x - startX))) <= Math.abs(drift) + 0.15 * H, `${name} @${fps}: travels like a run`);
  const land = feetY.findIndex((y) => y >= floor - 0.01 * H);
  assert.ok(land > 0, `${name} @${fps}: never lands`);
  for (let i = land + 1; i < frames.length; i++) for (const f of ["lFoot", "rFoot"] as const) assert.ok(Math.abs(frames[i][f].x - frames[land][f].x) < 0.01 * H && floor - frames[i][f].y < 0.02 * H, `${name} @${fps}: steps after landing`);
  // Gravity: from the top to the landing the hips fall faster and faster.
  const top = frames.slice(0, land + 1).reduce((b, f, i) => (f.hip.y < frames[b].hip.y ? i : b), 0);
  const drops = frames.slice(top + 1, land + 1).map((f, i) => f.hip.y - frames[top + i].hip.y);
  for (let i = 1; i < drops.length - 1; i++) assert.ok(drops[i] >= drops[i - 1] - 0.5, `${name} @${fps}: the fall slows down (${drops.map((d) => d.toFixed(1)).join(", ")})`);
  if (drops.length >= 3) assert.ok(drops[drops.length - 2] > drops[0], `${name} @${fps}: the fall does not speed up (${drops.map((d) => d.toFixed(1)).join(", ")})`);
}
test("finishScene keepGoing: HALF A HOP finishes as a hop — falls with gravity onto the ORIGINAL floor, lands, stands; never runs", () => {
  for (const [name, dx] of [["straight up", 0], ["sideways right", 22], ["sideways left", -22]] as const) {
    const drawings = [
      { pose: STAND, x: 700, floor: 820 },
      { pose: CROUCH, x: 700 + dx, floor: 820 },
      { pose: TAKE_OFF, x: 700 + 2 * dx, floor: 818 },
      { pose: HOP_UP, x: 700 + 3 * dx, floor: 820 - 0.3 * H },
    ];
    const facing: Facing = dx < 0 ? "left" : "right";
    const figs = drawings.map((d) => readDrawnFigure(drawn(d.pose, facing, d.x, d.floor), LOOK));
    const fig = figs[figs.length - 1];
    for (const fps of [8, 12, 24]) {
      const step = Math.max(1, Math.round(fps / 8));
      const previous = figs.slice(0, -1).map((f, k) => ({ frame: k * step, fig: f }));
      // (The app passes every drawn frame of the layer, the last one too.)
      const all = figs.map((f, k) => ({ frame: k * step, fig: f }));
      for (const [how, prev] of [["earlier frames", previous], ["all frames", all]] as const) {
        const reading = readKeepGoing(fig, { previous: prev, fps });
        assert.equal(reading.kind, "jump", `${name} (${how}) @${fps}`);
        assert.ok(Math.abs(reading.floor - 820) < 0.5, `${name} (${how}) @${fps}: floor ${reading.floor}`);
        const scene = finishScene(fig, "keepGoing", { stageWidth: 1920, previous: prev, fps });
        assert.ok(Math.abs(scene.groundY - 820) < 0.5, `${name} @${fps}: scene floor ${scene.groundY}`);
        checkHopFinish(`${name} (${how})`, scene, fps, 820, fig.x, 3 * dx * 3);
      }
    }
  }
});
test("finishScene keepGoing: a LONE drawing clearly in the air (knees up) falls to a floor below it — never stands in the air", () => {
  const fig = readDrawnFigure(drawn(TUCK, "right", 900, 600), LOOK);
  const floor = fig.groundY + 0.35 * H;
  for (const fps of [8, 12, 24]) {
    const reading = readKeepGoing(fig, { fps });
    assert.equal(reading.kind, "jump", `@${fps}`);
    assert.ok(reading.floor > fig.groundY + 0.3 * H, `@${fps}: stands on air`);
    checkHopFinish("lone airborne drawing", finishScene(fig, "keepGoing", { stageWidth: 1920, fps }), fps, floor, fig.x, 0);
  }
  // A crouch drawn alone is on the floor (feet well below the hips): it settles where it is.
  const crouch = readDrawnFigure(drawn(CROUCH, "right", 900, 820), LOOK);
  assert.equal(readKeepGoing(crouch, { fps: 12 }).kind, "settle");
  assert.equal(readKeepGoing(crouch, { fps: 12 }).floor, crouch.groundY);
});
