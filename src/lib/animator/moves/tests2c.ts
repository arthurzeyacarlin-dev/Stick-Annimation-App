import type { Scene } from "../engine.ts";
import type { BackgroundSpec, EffectTrack } from "../effects/types.ts";
import { DEFAULT_STYLE } from "../rig.ts";
import { LIBRARY } from "./library.ts";
import { fitBackgroundPlanToPage, fitPlanToPage, planToScene, type Action, type ScenePlan } from "./plan.ts";
import { parkourPlan } from "./scenes2c.ts";
import { sisterTestPlan, teleportPlan } from "./scenesPowers.ts";
import { iceMountainPlan, iceThrowPlan } from "./scenesIce.ts";
import { laserEyesPlan } from "./scenesLaser.ts";
import { elementalFightTestPlan } from "./elementalFight.ts";
import { policeEscortPlan } from "./scenesCuffs.ts";
import { rainyWindyDayPlan, waterfallPlan } from "./scenesBackgrounds.ts";
import { cameraPlanToScene, isCameraPlan, runOffCutArrivePlan } from "./camera.ts";
import { grenadeClosePlan, grenadeFarPlan } from "./scenesGrenade.ts";
import { swordFightTestPlan } from "./weaponFight.ts";
import { explosionTextPlan } from "./scenesText.ts";

// SPEC-0017 Phase 2C: review-only EFFECTS test scenes for the Engine test panel ("Effects (2C)"), removed with
// the rest of the test panel in Phase 5. Like tests.ts, each one is a SCENE PLAN (figures + `effects` tracks,
// maybe a `background`); the engine and the effect recipes make every picture. An effect id that has no recipe
// yet simply draws nothing.
//
// This file is the ONE place the 2C test scenes are wired (powers: scenesPowers.ts; backgrounds: scenes2c.ts).
// An entry whose scene isn't written yet has `plan: null` and is not shown in the panel.

export type EffectsTestEntry = { id: string; label: string; plan: ScenePlan | null };

const GROUND = 900;
const HEIGHT = 300;

// One figure doing `actions` in the middle of the stage, with `effects` (and maybe a `background`).
const oneFigure = (id: string, title: string, actions: Action[], effects: EffectTrack[], background?: BackgroundSpec): ScenePlan => ({
  id, title, height: HEIGHT, groundY: GROUND,
  characters: [{ id: "a", name: "Hero", x: 960, facing: "right", look: { color: DEFAULT_STYLE.color }, actions }],
  effects,
  ...(background ? { background } : {}),
});
const stand = (seconds: number): Action => ({ move: "stand", params: { seconds } });

// Simple effect-only scenes, made right here. The figure just STANDS (breathing) a sensible way off from the
// effect — no random waving, and no hand in an effect (Arthur: "for Blue Fire, the stick figure is waving, and it
// seems like his hand is on the blue fire"). (If a figure ever MAKES an effect, its pose must make sense: the arm
// pointed out at the target.)
const lightningStrike = () => oneFigure("fx-lightning-strike", "Lightning strike", [stand(3)], [
  { kind: "lightning", start: 0.8, end: 1.4, anchor: { x: 1300, y: 0 }, target: { x: 1300, y: GROUND }, params: { seed: 7 } },
], { pieces: [{ kind: "sky", params: { color: "#0b1430", color2: "#26345e" } }, { kind: "ground" }], seed: 3 });
const flickeringBulb = () => oneFigure("fx-flicker", "Flickering bulb", [stand(4)], [
  { kind: "flicker", start: 0, end: 4, anchor: { x: 960, y: GROUND - HEIGHT * 1.6 }, params: { color: "#ffe9a8", seed: 11 } },
]);
const smoke = () => oneFigure("fx-smoke", "Smoke", [stand(4)], [
  { kind: "smoke", start: 0, end: 4, anchor: { x: 1270, y: GROUND }, params: { seed: 5 }, layer: "back" },
]);
// (A blue fire burning on the ground in front of him, about a body length away.)
const blueFire = () => oneFigure("fx-blue-fire", "Blue fire", [stand(4)], [
  { kind: "fire", start: 0, end: 4, anchor: { x: 1250, y: GROUND }, params: { color: "#2f7bff", seed: 2 } },
]);
// (Purple lightning from the sky, striking the ground well in front of him.)
const purpleLightning = () => oneFigure("fx-purple-lightning", "Purple lightning", [stand(3)], [
  { kind: "lightning", start: 0.6, end: 2.2, anchor: { x: 1400, y: 0 }, target: { x: 1400, y: GROUND }, params: { color: "#a64dff", seed: 9 } },
]);

// The Effects (2C) list, in panel order. Each button builds its plan only when it is pressed (building every plan
// up front froze the page for seconds on every reload: the sword fight alone takes about 3.6 s).
export type EffectsTestButton = { id: string; label: string; make: () => ScenePlan | null };
export function effectsTestButtons(): EffectsTestButton[] {
  return [
    { id: "sisterTest", label: "Fire blast vs water shield (sister's test)", make: sisterTestPlan },
    { id: "teleport", label: "Teleport", make: teleportPlan },
    { id: "iceMountain", label: "Ice mountain", make: iceMountainPlan },
    { id: "iceCrystals", label: "Ice crystals", make: iceThrowPlan },
    { id: "laserEyes", label: "Laser eyes", make: laserEyesPlan },
    { id: "elementalFight", label: "Elemental fight: laser eyes vs ice", make: elementalFightTestPlan },
    { id: "policeEscort", label: "Police escort", make: policeEscortPlan },
    { id: "parkour", label: "Parkour over 3 spikes", make: parkourPlan },
    { id: "rainyWindyDay", label: "Rainy, windy day", make: rainyWindyDayPlan },
    { id: "waterfall", label: "Waterfall", make: waterfallPlan },
    { id: "lightningStrike", label: "Lightning strike", make: lightningStrike },
    { id: "flicker", label: "Flickering bulb", make: flickeringBulb },
    { id: "smoke", label: "Smoke", make: smoke },
    { id: "blueFire", label: "Blue fire", make: blueFire },
    { id: "purpleLightning", label: "Purple lightning", make: purpleLightning },
    { id: "camera", label: "Run off, cut, arrive (camera)", make: runOffCutArrivePlan },
    { id: "grenadeFar", label: "Grenade: throw far (overhand)", make: grenadeFarPlan },
    { id: "grenadeClose", label: "Grenade: drop close (underhand)", make: grenadeClosePlan },
    { id: "swordFight", label: "Sword fight", make: swordFightTestPlan },
    { id: "explosionText", label: "Explosion with text", make: () => explosionTextPlan() },
  ];
}

// The same list with every plan built (tests and the frame viewer). Entries whose scene isn't written yet have
// `plan: null`.
export function effectsTestScenes(): EffectsTestEntry[] {
  return effectsTestButtons().map(({ id, label, make }) => ({ id, label, plan: make() }));
}

// Build an effects test scene, fitted to the page like the other test scenes. A scene with a BACKGROUND is
// zoomed out as one piece (figures and background together: fitBackgroundPlanToPage), so the spikes stay exactly
// where the jumps clear them and nobody leaves the page by accident, whatever the page's shape.
export function makeEffectsTestScene(plan: ScenePlan, stageWidth?: number): Scene {
  // (THE CAMERA, camera.ts: only a plan with film cuts or a screen shake.)
  if (isCameraPlan(plan)) return cameraPlanToScene(plan, LIBRARY, stageWidth);
  if (stageWidth === undefined) return planToScene(plan, LIBRARY);
  return plan.background ? planToScene(fitBackgroundPlanToPage(plan, LIBRARY, stageWidth), LIBRARY) : fitPlanToPage(plan, LIBRARY, stageWidth);
}
