// THE CAMERA and the app's MOVING-BACKGROUND layers (SPEC-0017 Phase 2C extras, 2026-10-06; used by DrawingWorkspace
// applyAnimatorScene only for a scene with film cuts or a screen shake). effects/movingBackground.ts splits a
// background into its still part (one held picture) and its moving parts (rain, a waterfall's water, trees in the
// wind: their own layers, drawn every picture). It works on one ordinary scene, so a scene with cuts is split SHOT BY
// SHOT here (each shot's own pieces, on its own clock), then joined: the still layer changes right on the cut, each
// moving layer is empty in a shot that has none, and the screen shake is added back to every layer (the whole
// picture moves together). null = no shot has moving parts: the background is drawn as one layer, as before.
import { moveShape, type CameraScene } from "./camera.ts";
import { buildEffectFrames } from "./effects/index.ts";
import { movingBackgroundLayers, type MovingBackground } from "./effects/movingBackground.ts";
import type { Shape } from "./effects/types.ts";
import type { Scene, SceneFrames } from "./engine.ts";

const plain = (scene: Scene): Scene => {
  const s = { ...scene } as CameraScene;
  delete s.shots;
  delete s.shake;
  return s;
};

export function cameraMovingBackground(scene: CameraScene, built: SceneFrames, shift: { x: number; y: number }): MovingBackground | null {
  const camera = built.camera;
  if (!camera) return null;
  const shots = scene.shots?.length ? scene.shots.map((shot, k) => ({ own: shot.scene, ...camera.shots[k] })) : [{ own: plain(scene), ...camera.shots[0] }];
  const parts = shots.map(({ own, from, to }) => {
    const sub: SceneFrames = { ...built, camera: undefined, frames: built.frames.slice(from, to), objects: built.objects.slice(from, to) };
    // This shot's background as the app has it without the shake (slid by the same shift: sceneEffectLayers).
    const calm = buildEffectFrames(plain(own), sub).map((f) => (shift.x === 0 && shift.y === 0 ? f.background : f.background.map((s) => moveShape(s, shift))));
    return { from, to, calm, made: movingBackgroundLayers(plain(own), sub, shift, calm) };
  });
  if (parts.every((p) => !p.made)) return null;
  const shaken = (list: Shape[], i: number) => {
    const d = camera.shake?.[i];
    return !d || (d.x === 0 && d.y === 0) ? list : list.map((s) => moveShape(s, d));
  };
  const names = [...new Set(parts.flatMap((p) => p.made?.layers.map((layer) => layer.name) ?? []))];
  const out: MovingBackground = { still: [], layers: names.map((name) => ({ name, pictures: [] })) };
  for (const p of parts) for (let j = 0; j < p.to - p.from; j += 1) {
    out.still.push(shaken(p.made ? p.made.still[j] : p.calm[j], p.from + j));
    out.layers.forEach((layer) => layer.pictures.push(shaken(p.made?.layers.find((l) => l.name === layer.name)?.pictures[j] ?? [], p.from + j)));
  }
  return out;
}
