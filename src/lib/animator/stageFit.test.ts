import assert from "node:assert/strict";
import { test } from "node:test";
import { buildScene } from "./engine.ts";
import { makeMoveTestScene, MOVE_SPEEDS, MOVE_STYLES } from "./moves/index.ts";
import { animationBounds, centerAnimation, STAGE_CENTER_X, STAGE_HEIGHT } from "./stageFit.ts";
import { ENGINE_TEST_SCENES } from "./testScenes.ts";

// Arthur, 2026-10-04: every animation is always fully inside the page and centered as a whole, at the
// figures' normal size, on any page shape (tall phone to wide screen).
const ASPECTS = [9 / 16, 3 / 4, 1, 16 / 9];

test("every move fits inside the page and is centered, on every page shape", () => {
  for (const aspect of ASPECTS) {
    const stageWidth = STAGE_HEIGHT * aspect;
    for (const move of ["walk", "run"] as const) for (const style of MOVE_STYLES) for (const speed of MOVE_SPEEDS) for (const direction of [1, -1] as const) {
      const scene = makeMoveTestScene({ move, style, speed, energy: 0.85, direction, stageWidth });
      const before = buildScene(scene, 12).frames;
      const { frames, fits, bounds } = centerAnimation(before, stageWidth);
      const label = `${move}/${style}/${speed}/${direction} on a ${aspect.toFixed(2)} page`;
      assert.ok(fits, `${label}: outside the page (${bounds.left.toFixed(0)}..${bounds.right.toFixed(0)} of ${stageWidth.toFixed(0)} wide)`);
      assert.ok(Math.abs((bounds.left + bounds.right) / 2 - STAGE_CENTER_X) < 0.5 && Math.abs((bounds.top + bounds.bottom) / 2 - STAGE_HEIGHT / 2) < 0.5, `${label}: centered`);
      // Only slid as one piece: sizes and motion are untouched.
      const a = before[before.length - 1][0].skeleton, b = frames[frames.length - 1][0].skeleton;
      assert.ok(Math.abs((a.head.y - a.lFoot.y) - (b.head.y - b.lFoot.y)) < 1e-9 && Math.abs((a.hip.x - before[0][0].skeleton.hip.x) - (b.hip.x - frames[0][0].skeleton.hip.x)) < 1e-9, `${label}: same size and motion`);
    }
  }
});

test("a wide page gives a run room to speed up, cruise and slow down; a narrow page a shorter trip", () => {
  const travel = (aspect: number) => { const k = makeMoveTestScene({ move: "run", style: "natural", speed: "normal", energy: 0.5, direction: 1, stageWidth: STAGE_HEIGHT * aspect }).characters[0].keys; return Math.abs(k[k.length - 1].x - k[0].x); };
  assert.ok(travel(16 / 9) > 1.5 * travel(3 / 4));
});

test("the Phase 1 test scenes are centered and fit a square or wider page", () => {
  for (const scene of ENGINE_TEST_SCENES) for (const aspect of [1, 16 / 9]) {
    const frames = buildScene(scene, 12).frames;
    const { fits } = centerAnimation(frames, STAGE_HEIGHT * aspect);
    const b = animationBounds(frames);
    assert.ok(fits, `${scene.title} on a ${aspect.toFixed(2)} page: ${(b.right - b.left).toFixed(0)} wide, ${(b.bottom - b.top).toFixed(0)} tall`);
  }
});

test("a stick figure can be any of the named colors (and the AI's color words map onto them)", async () => {
  const { FIGURE_COLORS, figureColor } = await import("./colors.ts");
  const scene = makeMoveTestScene({ move: "walk", style: "natural", speed: "normal", energy: 0.5, direction: 1, color: FIGURE_COLORS.red });
  assert.equal(buildScene(scene, 12).frames[0][0].style.color, FIGURE_COLORS.red);
  assert.equal(figureColor("Green"), FIGURE_COLORS.green);
  assert.equal(figureColor("grey"), FIGURE_COLORS.gray);
  assert.equal(figureColor("#FF0000"), "#ff0000");
  assert.equal(figureColor("sparkly"), null);
});

test("the classic stick figure is the default: solid head right on the body, no neck; both are options", async () => {
  const { DEFAULT_STYLE, PROPORTIONS } = await import("./rig.ts");
  assert.equal(DEFAULT_STYLE.headFilled, true);
  assert.equal(DEFAULT_STYLE.neck, false);
  const top = (neck: boolean, hollowHead: boolean) => {
    const scene = makeMoveTestScene({ move: "walk", style: "natural", speed: "normal", energy: 0.5, direction: 1, neck, hollowHead });
    const built = buildScene(scene, 12);
    const r = built.report.characters[0];
    assert.ok(r.maxBoneErrorPx <= 0.5 && r.belowGroundFrames === 0, "body rules hold");
    const f = built.frames[0][0];
    return { gap: Math.hypot(f.skeleton.head.x - f.skeleton.neck.x, f.skeleton.head.y - f.skeleton.neck.y) - f.headRadius, filled: f.style.headFilled };
  };
  const classic = top(false, false), withNeck = top(true, true);
  assert.ok(Math.abs(classic.gap) < 1e-6 && classic.filled, "head sits right on the shoulders, solid");
  assert.ok(Math.abs(withNeck.gap - PROPORTIONS.neck * 300) < 1e-6 && !withNeck.filled, "with a neck and a hollow head");
});
