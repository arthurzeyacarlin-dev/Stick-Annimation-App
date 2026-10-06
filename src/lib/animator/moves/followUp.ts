import { LIBRARY } from "./library.ts";
import { planToScene, type Action, type CharacterPlan, type ScenePlan } from "./plan.ts";

// FILL IN A VAGUE FIGHT (round 11, Arthur: "When blue kicks, red fell down. I was expecting, when he was
// getting up, that blue would go over there and hurt him... unless the user gave detail, if the user only
// said 'create a fight animation', the engine has to know: he fell down, now I have an advantage. He should
// walk over there, stomp on him, or punch him, or kick him... And then red is supposed to block, or move out
// of the way, or get hit again, or strike back.")
// A plan flagged `fillIn` (the user only asked for "a fight", no detail) whose fight just STOPS after one
// figure strikes the other is carried on for a couple more exchanges:
// - PRESS THE ADVANTAGE: the attacker goes after the one it hit — knocked DOWN (the engine decides that,
//   from how hard the hit really was and the room to fall): it walks over to where it lies and stomps on it,
//   or waits for it to get up and strikes again; still standing: once its guard is back, it strikes again.
// - THE OTHER ANSWERS (varied): it blocks and strikes back, gets hit again, or strikes straight back.
// Only WHAT and WHEN is added; how it looks is the engine's. A detailed plan (no `fillIn`) is left alone.

const STRIKES = new Set(["punch", "kick"]);
const isStrikeAt = (a: Action | undefined, id: string) => Boolean(a && STRIKES.has(a.move) && a.params?.target === id);
const isHitFrom = (a: Action | undefined, id: string) => Boolean(a && a.move === "getHit" && a.params?.from === id);

export function fillInFight(plan: ScenePlan, seed: number, stageWidth?: number): ScenePlan {
  if (!plan.fillIn) return plan;
  // WHO: one figure's last action is a strike at the other, and the other's last is taking it (nothing more for them).
  const pair = plan.characters.flatMap((a) => plan.characters.filter((d) => d !== a && isStrikeAt(a.actions.at(-1), d.id) && isHitFrom(d.actions.at(-1), a.id)).map((d) => [a, d] as const))[0];
  if (!pair) return plan;
  let state = (Math.floor(Math.abs(seed)) * 69069 + 12345) % 2147483647 || 1;
  const random = () => (state = (state * 48271) % 2147483647) / 2147483647;
  for (let i = 0; i < 3; i += 1) random();
  const pick = <T,>(list: readonly T[]) => list[Math.floor(random() * list.length)];
  const strike = (target: string): Action => (random() < 0.6
    ? { move: "punch", params: { target, technique: pick(["straight", "straight", "power", "overhand"]), hand: random() < 0.5 ? "front" : "back" } }
    : { move: "kick", params: { target, height: pick(["mid", "mid", "high"]) } });

  const [attacker, defender] = pair;
  const a = attacker.id, d = defender.id;
  const taken = defender.actions.filter((x) => x.move === "getHit").length;
  // Plan it once (on the page it will be shown on: the room to fall decides who can go down) and read what the engine made of the last hit.
  const marks = planToScene({ ...plan, ...(stageWidth !== undefined ? { stageWidth } : {}) }, LIBRARY).marks;
  const last = `${d}.getHit${taken}`;
  if (marks[`${last}.out`] !== undefined) return plan; // (beaten: the fight is over)
  const down = marks[`${last}.knockdown`] !== undefined && marks[`${last}.down`] !== undefined && marks[`${last}.ready`] !== undefined;
  const more: Record<string, Action[]> = { [a]: [], [d]: [] };
  const names: string[] = [];
  const next = `${last}.ready`;
  // PRESS THE ADVANTAGE: he fell down — go over there and stomp on him (most of the time) while he lies there.
  if (down && random() < 0.7) {
    more[a].push({ move: "stompDown", params: { target: d }, sync: { mark: "start", at: `${last}.down` } });
    names.push(`${attacker.name} stomps on ${defender.name}`);
  }
  // THE OTHER ANSWERS once it is back on guard: blocks and strikes back, gets hit again, or strikes straight back.
  const answer = random();
  if (answer < 0.35) {
    more[a].push({ move: "guard", params: { seconds: 0.1 }, sync: { mark: "start", at: next } }, strike(d));
    more[d].push({ move: "getHit", params: { from: a, result: "block" } }, strike(a));
    more[a].push({ move: "getHit", params: { from: d } });
    names.push(`${defender.name} blocks and strikes back`);
  } else if (answer < 0.65) {
    more[a].push({ move: "guard", params: { seconds: 0.1 }, sync: { mark: "start", at: next } }, strike(d));
    more[d].push({ move: "getHit", params: { from: a } });
    names.push(`${defender.name} gets hit again`);
  } else {
    more[d].push(strike(a));
    more[a].push({ move: "getHit", params: { from: d } });
    names.push(`${defender.name} strikes back`);
  }
  const characters: CharacterPlan[] = plan.characters.map((c) => (more[c.id] ? { ...c, actions: [...c.actions, ...more[c.id]] } : c));
  return { ...plan, characters, title: `${plan.title} → ${names.join(" → ")}` };
}
