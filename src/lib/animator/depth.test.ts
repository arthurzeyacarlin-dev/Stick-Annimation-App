import assert from "node:assert/strict";
import { test } from "node:test";
import { buildScene, type CharacterKey, type FrameCharacter, type Scene } from "./engine.ts";
import { DEFAULT_STYLE, STAND } from "./rig.ts";

const H = 300;
const fig = (id: string, keys: CharacterKey[]) => ({ id, name: id, facing: "right" as const, height: H, style: { ...DEFAULT_STYLE }, keys });
const scene = (characters: ReturnType<typeof fig>[], durationSec = 2): Scene => ({ id: "depth", title: "depth", durationSec, groundY: 900, characters });
// Which figure is drawn first (behind) in each picture.
const backOf = (frame: FrameCharacter[]) => [...frame].map((c, n) => ({ c, k: c.draw ?? n })).sort((a, b) => a.k - b.k)[0].c.id;

test("DEPTH: two figures passing through each other — one is clearly behind while they overlap, the lists keep the plan's order", () => {
  const built = buildScene(scene([fig("a", [{ t: 0, x: 600, pose: STAND }, { t: 2, x: 1300, pose: STAND }]), fig("b", [{ t: 0, x: 950, pose: STAND }, { t: 2, x: 950, pose: STAND }])]), 24);
  const close = built.frames.filter((f) => Math.abs(f[0].skeleton.hip.x - f[1].skeleton.hip.x) < 0.5 * H);
  assert.ok(close.length > 5);
  // a moves right past b: a is behind the whole time they overlap (one clear order, never flickering).
  assert.ok(close.every((f) => backOf(f) === "a"), "the passer is behind");
  assert.ok(built.frames.every((f) => f[0].id === "a" && f[1].id === "b"), "lists keep the plan's order (moves and laws read by position)");
});

test("DEPTH: a body swung round another goes BEHIND for half the circle and in front for the other half", () => {
  const keys: CharacterKey[] = [];
  for (let k = 0; k <= 48; k += 1) { const t = k / 24; keys.push({ t, x: 960 + 0.35 * H * Math.cos(2 * Math.PI * t), pose: STAND }); }
  const built = buildScene(scene([fig("held", keys), fig("spinner", [{ t: 0, x: 960, pose: STAND }, { t: 2, x: 960, pose: STAND }])]), 24);
  const backs = built.frames.slice(2, -2).map(backOf);
  const behind = backs.filter((id) => id === "held").length, front = backs.filter((id) => id === "spinner").length;
  assert.ok(behind > 0.3 * backs.length && front > 0.3 * backs.length, `behind ${behind}, in front ${front}`);
  // It switches at the sides (where it turns back), not at random: about 4 switches in 2 turns.
  const switches = backs.filter((id, n) => n > 0 && id !== backs[n - 1]).length;
  assert.ok(switches >= 3 && switches <= 5, `switches ${switches}`);
});

test("DEPTH: figures that only come close (a fight) and never swap sides keep the plan's order", () => {
  const built = buildScene(scene([fig("a", [{ t: 0, x: 800, pose: STAND }, { t: 1, x: 900, pose: STAND }, { t: 2, x: 800, pose: STAND }]), fig("b", [{ t: 0, x: 1030, pose: STAND }, { t: 2, x: 1030, pose: STAND }])]), 24);
  assert.ok(built.frames.every((f) => f.every((c) => c.draw === undefined)));
});

test("DEPTH: a said depth wins — z behind is drawn first; wrap is carried to the picture", () => {
  const built = buildScene(scene([
    fig("hider", [{ t: 0, x: 900, pose: STAND, z: -1 }, { t: 2, x: 900, pose: STAND, z: -1 }]),
    fig("hugger", [{ t: 0, x: 980, pose: STAND }, { t: 1, x: 980, pose: STAND, z: 1, wrap: true }, { t: 2, x: 980, pose: STAND }]),
  ]), 24);
  // (z -1 vs 0: the hider is first in the list already, so nothing is marked until the hugger says it too — still behind.)
  assert.ok(built.frames.every((f) => backOf(f) === "hider"));
  assert.equal(built.frames[30][1].wrap, true);
  assert.equal(built.frames[5][1].wrap, undefined);
});
