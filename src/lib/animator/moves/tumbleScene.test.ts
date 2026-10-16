import test from "node:test";
import assert from "node:assert/strict";
import { pitOutline } from "../effects/backgrounds.ts";
import { propBox } from "../laws/propBox.ts";
import type { EffectTrack } from "../effects/types.ts";
import { restScenery, sceneryRest, scenePits, tumbleScene } from "./tumbleScene.ts";
import { tumblePath } from "./tumble.ts";

// EVERYTHING RESTS ON SOMETHING (Oct 14, Arthur on the cliff fall: he floats above the pit floor, the rocks float in mid-air, he
// "almost goes through them"). One source of truth: the physics reads the scene exactly as it is drawn.
const H = 120, G = 400;
const rock = (x: number, y: number, size = 1): EffectTrack => ({ kind: "prop", start: -1, end: 30, anchor: { x, y }, params: { name: "rock shelf", size, onWall: true, parts: [{ shape: "ellipse", x: 0, y: 0, w: 1, h: 0.4, color: "#777" }] } } as EffectTrack);
const plan = (effects: EffectTrack[]) => ({ height: H, groundY: G, effects, background: { pieces: [{ kind: "pit", params: { x: 1100, w: 1000, h: 560, seed: 3 } }] } });

test("a rock on a wall / down in a pit is measured where it is DRAWN (not on the ground line)", () => {
  const b = propBox({ height: H, groundY: G } as never, rock(900, 640))!;
  assert.ok(Math.abs(b.top - (640 - 0.2 * H)) < 0.5 && Math.abs(b.bottom - (640 + 0.2 * H)) < 0.5, `box ${b.top}..${b.bottom}`);
  const s = tumbleScene(plan([rock(900, 640)])).surfaces[0];
  assert.ok(Math.abs(G - s.top - (640 - 0.2 * H)) < 0.5, `the fall's rock top = the drawn rock top (${G - s.top})`);
});

test("the falling body lies ON the drawn pit floor (its lowest point = the floor's highest point under it, never above a dip)", () => {
  const p = plan([]), pit = tumbleScene(p).pits[0], drawn = pitOutline(p.background.pieces[0].params as never, { width: 1920, height: H, groundY: G });
  for (const x of [800, 1000, 1150, 1300]) {
    const under = [...drawn.bottom, drawn.left[6], drawn.right[6]].filter((q) => Math.abs(q.x - x) <= 0.45 * H).map((q) => q.y);
    const geo = scenePits(p)[0], line = Array.from({ length: 13 }, (_, k) => geo.floorY(x - 0.45 * H + (0.9 * H * k) / 12));
    const top = Math.min(...under, ...line);
    assert.ok(Math.abs(G - pit.floorAt!(x) - top) < 0.01, `x ${x}: rests at ${G - pit.floorAt!(x)}, drawn floor top ${top}`);
  }
  const { samples } = tumblePath(620, 1, H, { pits: [pit], speed: 110 });
  const last = samples[samples.length - 1];
  assert.ok(Math.abs(last.y - pit.floorAt!(last.x)) < 0.5, `lies on the drawn floor (${last.y} vs ${pit.floorAt!(last.x)})`);
  // inside the drawn walls at every depth
  for (const s of samples) if (s.y < -0.05 * H) assert.ok(s.x >= pit.wallAt!(-1, s.y) - 1 && s.x <= pit.wallAt!(1, s.y) + 1, `inside the walls at ${s.t}`);
});

test("scenery rests: a floating ledge in a pit grows out of the nearest wall or stands on a pillar; nothing left floating", () => {
  const p = plan([rock(760, 560), rock(1100, 640), rock(1150, 900, 0.8)]);
  const before = p.effects.map((e) => sceneryRest(p, e)!);
  assert.ok(before.some((r) => !r.touches), "some float before");
  const after = restScenery(p);
  for (const e of after.effects) assert.ok(sceneryRest(after, e)!.touches, `${JSON.stringify(e.anchor)} touches a wall or the floor`);
  // its top (what catches a falling body) stays where it was put
  for (const [i, e] of after.effects.entries()) assert.ok(Math.abs(propBox({ height: H, groundY: G } as never, e)!.top - propBox({ height: H, groundY: G } as never, p.effects[i])!.top) < 0.01, "top stays");
  // a rock "on a wall" out in the open sky (no wall, no pit) is caught by the floats law's check
  const sky = { height: H, groundY: G, effects: [rock(300, 150)], background: { pieces: [] as { kind: string }[] } };
  assert.equal(sceneryRest(sky, sky.effects[0])!.touches, false);
});

test("a body lying at rest follows the floor's slope (flat floor → 0°, rising floor → tilted, never more than 20°)", async () => {
  const { restSlope } = await import("./tumbleScene.ts");
  const flat = [{ left: 0, right: 1000, bottom: -300, floorAt: () => -300 }];
  assert.equal(restSlope(flat, 500, H), 0);
  const ramp = [{ left: 0, right: 1000, bottom: -300, floorAt: (x: number) => -300 + 0.2 * x }];
  assert.ok(Math.abs(restSlope(ramp, 500, H) - (Math.atan(0.2) * 180) / Math.PI) < 0.01);
  const steep = [{ left: 0, right: 1000, bottom: -300, floorAt: (x: number) => -300 + 3 * x }];
  assert.equal(restSlope(steep, 500, H), 20);
});

// STANDING IN A PIT (Oct 15, Arthur's screenshot: a figure standing in the pit FLOATED above the floor): a standing figure's height is
// the drawn floor under its FEET (about a foot either side), never the highest bump under a whole lying body — so it is never above
// the floor where it stands, and never lower than where it lay.
test("a figure standing in a pit stands on the drawn floor under its feet, not on a bump half a body away", () => {
  const p = plan([]), pit = tumbleScene(p).pits[0], geo = scenePits(p)[0];
  for (const x of [800, 950, 1000, 1150, 1300]) {
    const feet = Math.min(...Array.from({ length: 7 }, (_, k) => geo.floorY(x - 0.12 * H + (0.24 * H * k) / 6)));
    assert.ok(Math.abs(G - pit.standAt!(x) - feet) < 0.01, `x ${x}: stands at ${G - pit.standAt!(x)}, floor under the feet ${feet}`);
    assert.ok(pit.standAt!(x) <= pit.floorAt!(x) + 1e-9, `x ${x}: standing never higher than lying`);
  }
});
