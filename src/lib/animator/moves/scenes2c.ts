// SPEC-0017 Phase 2C scenes with a BACKGROUND (review only).
import { buildScene } from "../engine.ts";
import { spikeRow } from "../effects/backgrounds.ts";
import type { BackgroundPiece } from "../effects/types.ts";
import { LIBRARY } from "./library.ts";
import { planToScene, type ScenePlan } from "./plan.ts";

// Arthur's PARKOUR TEST (roadmap): "hop over 3 spikes (run, jump, land, three times), then tired, hand on knee,
// breathing hard." The figure's moves come first; then each row of spikes is put where that jump's feet are
// HIGHEST over the ground (the spot with the most room between the soles and the spike tips), so the spikes
// always sit exactly where the jumps clear them — even if the jump rules change.
const GROUND = 900, HEIGHT = 150, PAGE = 1920;
const SPIKES = { count: 2, size: 0.3, color: "#a7b0bb", color2: "#4b5563" };

export function parkourPlan(): ScenePlan {
  const jump = { move: "jump", params: { height: 0.6 } };
  const figure: ScenePlan = {
    id: "parkour-spikes", title: "Parkour: hop over 3 spikes, then tired", height: HEIGHT, groundY: GROUND, stageWidth: PAGE,
    characters: [{ id: "a", name: "Runner", x: 300, facing: "right", style: "natural", speed: "normal", energy: 0.6, actions: [
      { move: "run", params: { distance: 60 } }, jump,
      { move: "run", params: { distance: 30 } }, jump,
      { move: "run", params: { distance: 30 } }, jump,
      { move: "run", params: { distance: 40 }, style: "tired" }, { move: "catchBreath", params: { seconds: 2.5 } },
    ] }],
  };
  const stage = { width: PAGE, groundY: GROUND, height: HEIGHT };
  const scene = planToScene(figure, LIBRARY), fps = 60, frames = buildScene(scene, fps).frames;
  const spikes: BackgroundPiece[] = [];
  for (let k = 1; k <= 3; k += 1) {
    const t0 = scene.marks[`a.jump${k}.takeoff`], t1 = scene.marks[`a.jump${k}.land`];
    if (t0 === undefined || t1 === undefined) continue;
    const from = Math.max(0, Math.floor((t0 - 0.3) * fps)), to = Math.min(frames.length - 1, Math.ceil((t1 + 0.3) * fps));
    const feet = frames.slice(from, to + 1).flatMap((f) => [f[0].skeleton.lFoot, f[0].skeleton.rFoot]);
    const x0 = frames[Math.round(t0 * fps)][0].skeleton.hip.x, x1 = frames[Math.round(t1 * fps)][0].skeleton.hip.x;
    let best = { x: (x0 + x1) / 2, room: -Infinity };
    for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x += 1) {
      const room = spikeRoom(spikeRow({ ...SPIKES, x }, stage), feet);
      if (room > best.room) best = { x, room };
    }
    spikes.push({ kind: "spikes", params: { ...SPIKES, x: Math.round(best.x) } });
  }
  return {
    ...figure,
    background: { seed: 3, pieces: [
      { kind: "sky", params: { time: "day" } },
      { kind: "sun", params: { x: 1660, y: 330 } },
      { kind: "clouds", params: { count: 5, speed: 1, y: 90, h: 150 } },
      { kind: "hills", params: { h: 300 } },
      { kind: "ground" },
      ...spikes,
    ] },
  };
}

// How much room the feet leave above a row of spikes: the smallest gap (px) between any foot over the row and the
// spike surface under it (negative = a foot would be in a spike). Feet not over the row don't count.
export function spikeRoom(row: ReturnType<typeof spikeRow>, feet: readonly { x: number; y: number }[]): number {
  let room = Infinity;
  for (const f of feet) {
    if (f.x < row.left || f.x > row.right) continue;
    const tip = row.tips.reduce((a, b) => (Math.abs(b.x - f.x) < Math.abs(a.x - f.x) ? b : a));
    const surface = row.base - row.tall * Math.max(0, 1 - Math.abs(f.x - tip.x) / (row.wide / 2));
    room = Math.min(room, surface - f.y);
  }
  return room;
}
