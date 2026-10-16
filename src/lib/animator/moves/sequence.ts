// A NEW MOVE IS A SEQUENCE OF LEARNED PIECES (Oct 14, Arthur: "teach the engine to use other animations it has learned — combine
// them and create its own"). A never-seen move (tumbling down a cliff, falling down stairs, thrown off a roof, sliding down a slope)
// is not new physics: it is pieces the engine already knows — tip over an edge, fly through the air (fall / blownAway), land on
// something and crumple (getHit / slammed), push off, lie still (fallDown), get up hurt (getUp) — run one after another, each
// starting exactly where the last one ended (same time, place, pose: no pop between them). Each piece names its moment as a mark.
import type { CharacterKey } from "../engine.ts";
import type { MoveOutput, Stance } from "./motion.ts";

export type Piece = { name: string; run: (at: Stance) => MoveOutput };

// Run the pieces in order from `start`; the keys join into one move (a piece's first key, which repeats where the last one ended,
// is dropped), the marks are merged (and each piece's start is marked with its name).
export function sequence(start: Stance, pieces: Piece[]): MoveOutput {
  const keys: CharacterKey[] = [];
  const marks: Record<string, number> = {};
  let at = start;
  for (const piece of pieces) {
    const out = piece.run(at);
    if (!out.keys.length) continue;
    marks[piece.name] = out.keys[0].t;
    const first = keys.length && Math.abs(out.keys[0].t - keys[keys.length - 1].t) < 1e-6 ? 1 : 0;
    keys.push(...out.keys.slice(first));
    Object.assign(marks, out.marks);
    at = out.end;
  }
  return { keys, end: at, marks };
}

// A piece that holds the body where it is for `seconds` (lying still, stunned), breathing a little so it never freezes.
export function holdPiece(name: string, seconds: number, lift = 0, breathe: (k: number) => Partial<Record<string, number>> = () => ({})): Piece {
  return {
    name,
    run: (at) => {
      const n = Math.max(2, Math.round(seconds / 0.25));
      const keys: CharacterKey[] = [];
      for (let i = 0; i <= n; i += 1) {
        const k = i / n;
        keys.push({ t: at.t + k * seconds, x: at.x, pose: { ...at.pose, ...breathe(k) } as Stance["pose"], facing: at.facing, lift, contacts: [], ease: "inOut", xEase: "inOut", liftEase: "linear" });
      }
      return { keys, end: { ...at, t: at.t + seconds }, marks: {} };
    },
  };
}
