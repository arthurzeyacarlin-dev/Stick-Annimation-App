import type { CharacterKey, FootContact } from "../engine.ts";
import { forwardKinematics } from "../pose.ts";
import type { Facing } from "../rig.ts";

// PLANTED FEET DON'T MOVE (taught to the engine, 2026-10-04). While a foot is on the ground, the body
// goes wherever that foot puts it: the hips' position on every key comes from the planted feet (where
// they landed) and the pose, not from how far the move says the body travels. Each move is written to
// do this, but small differences add up over a long chain of moves the engine was never shown (catch
// your breath, squat, sit...) until a leg can no longer reach its foot and the foot slides. The planner
// runs every move's keys through this, so any chain — and any new move the AI writes — keeps its feet.
// Keys in the air (a jump, a step's swing with no planted foot) keep the same correction as the key
// before, so the path stays smooth.

const FEET: FootContact[] = ["lFoot", "rFoot"];

export function footPlanter(height: number) {
  const locks: Partial<Record<FootContact, number>> = {};
  let facing: Facing | null = null;
  let lastContacts: readonly FootContact[] = [];
  return (keys: readonly CharacterKey[]): CharacterKey[] => {
    let offset = 0;
    return keys.map((key) => {
      const view = key.facing ?? facing ?? "right";
      const contacts = key.contacts ?? [];
      // A view switch re-plants the feet, except one that stays down through it (the engine does the same).
      if (view !== facing) for (const foot of FEET) if (!(lastContacts.includes(foot) && contacts.includes(foot))) delete locks[foot];
      for (const foot of FEET) if (!contacts.includes(foot)) delete locks[foot];
      const body = forwardKinematics(key.pose, view, { x: 0, y: 0 }, height, "normal", false);
      const held = contacts.filter((foot) => locks[foot] !== undefined);
      let x = key.x + offset;
      if (held.length > 0) {
        x = held.reduce((sum, foot) => sum + locks[foot]! - body[foot].x, 0) / held.length;
        offset = x - key.x;
      }
      for (const foot of contacts) if (locks[foot] === undefined) locks[foot] = x + body[foot].x;
      facing = view;
      lastContacts = contacts;
      return Math.abs(x - key.x) > 1e-3 ? { ...key, x } : key;
    });
  };
}
