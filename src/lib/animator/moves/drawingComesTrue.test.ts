// MAKE MY DRAWING COME TRUE — ANY DRAWING: the engine's own effect, where the drawing is and as big as it.
import assert from "node:assert/strict";
import { test } from "node:test";
import { buildEffectFrames } from "../effects/index.ts";
import { buildScene } from "../engine.ts";
import { readDrawingWith } from "../vision/drawingShape.ts";
import { arthurExplosion } from "../vision/fixtures/arthurExplosion.ts";
import type { DrawingKind, ReadDrawing } from "../vision/types.ts";
import { biggestPicture, effectComesTrueScene, pictureBox } from "./drawingComesTrue.ts";

const GROUND_KINDS: DrawingKind[] = ["explosion", "fire", "water", "ice", "smoke", "lightning"];
const drawn = (kind: DrawingKind, box: ReadDrawing["box"], colors: string[] = ["#141414"]): ReadDrawing => ({ kind, box, groundY: box.y + box.h, colors, figure: null, reason: "test" });

test("Arthur's explosion drawing comes true as the engine's ground explosion, where and as big as he drew it (8/12/24 fps)", () => {
  const d = readDrawingWith(arthurExplosion(), () => null);
  assert.equal(d.kind, "explosion");
  for (const fps of [8, 12, 24]) {
    const scene = effectComesTrueScene(d, { fps });
    assert.equal(scene.characters.length, 0, "no figures");
    assert.equal(scene.effects[0].kind, "explosion");
    const { box, index, frames } = biggestPicture(scene, fps);
    assert.ok(box && index > 0, "it grows into its biggest picture");
    const w = box.x1 - box.x0, h = box.y1 - box.y0;
    assert.ok(Math.abs(w / d.box.w - 1) <= 0.35 && Math.abs(h / d.box.h - 1) <= 0.35, `${fps} fps: ${w.toFixed(0)}x${h.toFixed(0)} vs drawn ${d.box.w}x${d.box.h}`);
    assert.ok(Math.abs((box.x0 + box.x1) / 2 - (d.box.x + d.box.w / 2)) <= d.box.w * 0.2, "centred on the drawing");
    assert.ok(Math.abs(box.y1 - d.groundY) <= d.box.h * 0.08, `stands on the ground: ${box.y1.toFixed(0)} vs ${d.groundY}`);
    const first = pictureBox(frames[0]);
    assert.ok(!first || (first.x1 - first.x0) * (first.y1 - first.y0) < 0.5 * w * h, "starts small (from nothing)");
  }
});

test("every effect kind builds at 8/12/24 fps, its biggest picture about the drawn size, ground ones on the ground", () => {
  const boxes: Record<string, ReadDrawing["box"]> = {
    explosion: { x: 700, y: 400, w: 380, h: 460 }, airExplosion: { x: 800, y: 200, w: 360, h: 340 }, fire: { x: 800, y: 500, w: 220, h: 360 },
    water: { x: 700, y: 650, w: 500, h: 210 }, ice: { x: 700, y: 600, w: 420, h: 260 }, smoke: { x: 800, y: 350, w: 300, h: 510 }, lightning: { x: 900, y: 120, w: 160, h: 740 },
  };
  for (const [kind, box] of Object.entries(boxes) as [DrawingKind, ReadDrawing["box"]][]) {
    const d = drawn(kind, box);
    for (const fps of [8, 12, 24]) {
      const scene = effectComesTrueScene(d, { fps });
      const built = buildScene(scene, fps);
      const frames = buildEffectFrames(scene, built);
      assert.ok(frames.length > 4 && frames.some((f) => f.back.length + f.front.length > 0), `${kind} ${fps} fps draws`);
      const { box: b } = biggestPicture(scene, fps);
      assert.ok(b, kind);
      const size = Math.sqrt((b.x1 - b.x0) * (b.y1 - b.y0)), want = Math.sqrt(box.w * box.h);
      assert.ok(Math.abs(size / want - 1) <= 0.35, `${kind} ${fps} fps: size ${size.toFixed(0)} vs drawn ${want.toFixed(0)}`);
      if (GROUND_KINDS.includes(kind)) {
        let low = -Infinity;
        for (const f of frames) { const fb = pictureBox(f); if (fb) low = Math.max(low, fb.y1); }
        assert.ok(low <= d.groundY + box.h * 0.05, `${kind} stays on the ground: ${low.toFixed(0)} vs ${d.groundY}`);
      }
    }
  }
});

test("a drawing the engine has no effect for (a stick figure, unknown) is not turned into an effect", () => {
  for (const kind of ["stickFigure", "unknown"] as DrawingKind[]) assert.throws(() => effectComesTrueScene(drawn(kind, { x: 0, y: 0, w: 100, h: 100 }), { fps: 12 }));
});
