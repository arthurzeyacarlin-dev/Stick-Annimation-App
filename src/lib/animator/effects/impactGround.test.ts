// Arthur 2026-10-07: what happens on impact depends on what the thing is made of; the ground shows the place.
import assert from "node:assert/strict";
import test from "node:test";
import { buildScene } from "../engine.ts";
import { planToScene, type ScenePlan } from "../moves/plan.ts";
import { LIBRARY } from "../moves/library.ts";
import { ballLook } from "../objects.ts";
import { buildEffectFrames, EFFECTS, type EffectScene, type EffectTrack } from "./index.ts";
import { materialOf } from "./impact.ts";

const H = 300, G = 900;
const throwPlan = (id: string, name: string, effects: EffectTrack[], title = "throw"): ScenePlan => ({
  id: "t", title, height: H, groundY: G, stageWidth: 1920,
  objects: [{ id, name, look: ballLook("ball", { size: 45, color: "#ff6a00" }) }],
  characters: [{ id: "a", name: "A", x: 500, facing: "right", actions: [{ move: "throw", params: { object: id, distance: 500 } }] }],
  effects,
});
const landings = (plan: ScenePlan, id: string) => ((planToScene(plan, LIBRARY) as EffectScene).effects ?? []).filter((e) => "object" in e.anchor && e.anchor.object === id && e.anchor.landing);

test("a thing's material is read from the effect ON it first, then its name words", () => {
  assert.equal(materialOf("ball", ["fireball"]), "fire");
  assert.equal(materialOf("ball", ["lightning"]), "electric");
  assert.equal(materialOf("orb", ["glow"]), "energy");
  assert.equal(materialOf("orb", ["sparks"], [{ stars: true }]), "energy", "a star-sparkling ball is magic, not electricity");
  assert.equal(materialOf("bottle glass bottle"), "glass");
  assert.equal(materialOf("iceBall ice ball"), "ice");
  assert.equal(materialOf("ball"), undefined, "a plain ball: no idea → nothing added (it just bounces)");
});

test("a FIREBALL that lands makes a small fiery explosion sized by the fire — never shards", () => {
  const small = landings(throwPlan("fb", "fireball", [{ kind: "fireball", start: 0, end: 2.5, anchor: { object: "fb" }, params: { size: 0.15 } }]), "fb");
  const big = landings(throwPlan("fb", "fireball", [{ kind: "fireball", start: 0, end: 2.5, anchor: { object: "fb" }, params: { size: 0.4 } }]), "fb");
  assert.deepEqual(small.map((e) => e.kind), ["fireBurst"]);
  assert.ok(Number(small[0].params?.size) < Number(big[0].params?.size), "a bigger fire makes a bigger burst");
  assert.ok(Number(big[0].params?.size) <= 0.45, "a TINY explosion, not a grenade");
  // (a shatter the plan put on a fireball becomes its fiery burst)
  const fixed = landings(throwPlan("fb", "fireball", [{ kind: "fireball", start: 0, end: 2.5, anchor: { object: "fb" } }, { kind: "iceShatter", start: 1.4, end: 2.2, anchor: { object: "fb", landing: true } }]), "fb");
  assert.deepEqual(fixed.map((e) => e.kind), ["fireBurst"]);
  // (and it really draws where the ball lands, then the ball is gone)
  const scene = planToScene(throwPlan("fb", "fireball", [{ kind: "fireball", start: 0, end: 2.5, anchor: { object: "fb" } }]), LIBRARY) as EffectScene, built = buildScene(scene, 12);
  assert.ok(buildEffectFrames(scene, built).some((f) => f.front.length > 6), "the burst is drawn");
  assert.equal(built.objects[built.objects.length - 1].find((o) => o.id === "fb"), undefined, "the fireball is gone after it bursts");
});

test("an ELECTRIC ball crackles (flash + sparks), a GLASS bottle shatters, a soft ball just bounces", () => {
  const zap = landings(throwPlan("zb", "ball", [{ kind: "sparks", start: 0, end: 2.5, anchor: { object: "zb" }, params: { color: "#7fd4ff" } }]), "zb");
  assert.deepEqual(zap.map((e) => e.kind), ["flash", "sparks"]);
  assert.notEqual(zap[1].params?.stars, true);
  assert.equal(zap[1].params?.color, "#7fd4ff", "in the electricity's own colour");
  assert.deepEqual(landings(throwPlan("bottle", "glass bottle", []), "bottle").map((e) => e.kind), ["iceShatter"]);
  assert.deepEqual(landings(throwPlan("ball", "rubber ball", []), "ball"), [], "a soft ball: no burst");
});

test("the purple energy ball still BURSTS INTO STARS — glowing stars blooming out, not glass falling", () => {
  const stars: EffectTrack = { kind: "sparks", start: 1.4, end: 2.1, anchor: { object: "eb", landing: true }, params: { burst: true, stars: true, color: "#c77dff" } };
  const lands = landings(throwPlan("eb", "energy ball", [{ kind: "glow", start: 0, end: 2.6, anchor: { object: "eb" }, params: { color: "#b04dff" } }, stars]), "eb");
  assert.deepEqual(lands.map((e) => e.kind), ["sparks"], "the plan's own stars are kept, nothing added");
  const ctx = { duration: 0.7, fps: 24, at: { x: 900, y: G - 20 }, height: H, groundY: G, stageWidth: 1920 };
  const early = EFFECTS.sparks.draw({ ...ctx, t: 0.05 }, stars.params!);
  assert.ok(early.some((s) => s.kind === "circle" && (s.glow ?? 0) >= 16), "a glowing flash where it bursts");
  // (half a second on, most stars are still twinkling in the air — they float out, they don't drop like shards)
  const later = EFFECTS.sparks.draw({ ...ctx, t: 0.45 }, stars.params!).filter((s) => s.kind === "poly");
  assert.ok(later.length >= 8, `stars still in the air (${later.length})`);
  // (an ENERGY ball with no burst named gets a glowing flash and a burst of glowing motes thrown out, not shards —
  // 2026-10-08: the flash and glow alone, centred on the floor, were squashed flat there)
  const glowOnly = landings(throwPlan("eb", "energy ball", [{ kind: "glow", start: 0, end: 2.6, anchor: { object: "eb" } }]), "eb");
  assert.deepEqual(glowOnly.map((e) => e.kind), ["flash", "glow", "sparks"]);
  assert.ok(glowOnly.every((e) => e.kind !== "iceShatter"), "never glass");
});

const sceneWith = (title: string, pieces: { kind: string; params?: Record<string, unknown> }[], canvasColor?: string) =>
  planToScene({ id: "bg", title, height: H, groundY: G, stageWidth: 1920, characters: [{ id: "a", name: "A", x: 900, facing: "right", actions: [{ move: "stand", params: { seconds: 1 } }] }], background: { pieces }, ...(canvasColor ? { canvasColor } : {}) }, LIBRARY) as EffectScene;
const groundColor = (scene: EffectScene) => scene.background?.pieces.find((p) => p.kind === "ground")?.params?.color as string | undefined;
const isWhite = (c: string | undefined) => !!c && parseInt(c.slice(1, 3), 16) > 225 && parseInt(c.slice(3, 5), 16) > 225 && parseInt(c.slice(5, 7), 16) > 225;

test("THE GROUND SHOWS THE PLACE: rain / a thunderstorm on grass (never snow-white); snow is white; no background = the plain page", () => {
  const storm = sceneWith("Thunderstorm", [{ kind: "thunderstorm" }]);
  assert.equal(storm.background?.pieces[0].kind, "ground", "a ground under the storm, drawn first (rain splashes on it)");
  assert.ok(!isWhite(groundColor(storm)), `storm ground ${groundColor(storm)} is not white`);
  const rain = sceneWith("walking in the rain", [{ kind: "sky", params: { time: "overcast" } }, { kind: "rain" }]);
  assert.ok(rain.background?.pieces.some((p) => p.kind === "ground"));
  assert.ok(!isWhite(groundColor(rain)));
  // (and it is really drawn below the ground line, in every picture)
  const built = buildScene(storm, 12), fr = buildEffectFrames(storm, built);
  assert.ok(fr.every((f) => f.background.some((s) => s.kind === "rect" && s.y === G && !isWhite(s.fill))), "a coloured ground band at the ground line");
  assert.ok(isWhite(groundColor(sceneWith("a snowy day", [{ kind: "sky" }, { kind: "clouds" }]))), "snow = white ground");
  assert.equal(groundColor(sceneWith("on the moon", [{ kind: "sky", params: { time: "night" } }])), "#a3a3a8", "gray rock on the moon");
  assert.ok(sceneWith("a beach day", [{ kind: "sun" }]).background?.pieces.some((p) => p.kind === "ground" && p.params?.color === "#ead08f"), "sand on a beach");
  // (a ground the plan gave is kept; a page colour the user asked for is kept)
  assert.equal(sceneWith("park", [{ kind: "sky" }, { kind: "ground", params: { color: "#8b5a2b" } }]).background?.pieces.filter((p) => p.kind === "ground").length, 1);
  assert.equal(sceneWith("storm", [{ kind: "rain" }], "#1d2333").background?.pieces.some((p) => p.kind === "ground"), false);
});
