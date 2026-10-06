// SPEC-0017 Phase 2C extras: the POLICE ESCORT review scene (Arthur's little sister's request; cuffs.ts).
import { FIGURE_COLORS } from "../colors.ts";
import { ESCORT_GAP } from "./cuffs.ts";
import type { ScenePlan } from "./plan.ts";

const GROUND = 900, HEIGHT = 300;

// The police (blue) walks the cuffed robber (red) across the page, right behind him, one hand on the handcuffs and
// one on his shoulder. Mid-walk — out of nowhere, no stop first — the robber tries to break free; the police reacts a
// moment later, digs in and pulls him back, and they walk on (the escape is the only thing that stops them).
export function policeEscortPlan(): ScenePlan {
  const start = 560;
  return {
    id: "police-escort", title: "Police escort: mid-walk the cuffed robber tries to break free and is pulled back", height: HEIGHT, groundY: GROUND,
    characters: [
      // (The escort starts right behind its prisoner by itself; this x is where that is.)
      { id: "police", name: "Officer", x: start - ESCORT_GAP * HEIGHT, facing: "right", look: { color: FIGURE_COLORS.blue }, actions: [{ move: "escort", params: { partner: "robber" } }] },
      { id: "robber", name: "Robber", x: start, facing: "right", look: { color: FIGURE_COLORS.red }, cuffed: true, actions: [
        { move: "walk", params: { distance: 410 } },
        { move: "tug" },
        { move: "walk", params: { distance: 330 } },
      ] },
    ],
  };
}
