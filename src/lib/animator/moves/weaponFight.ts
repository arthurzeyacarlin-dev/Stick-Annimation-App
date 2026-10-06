import { buildScene } from "../engine.ts";
import type { EffectTrack } from "../effects/types.ts";
import type { CharacterStyle } from "../rig.ts";
import { LIBRARY } from "./library.ts";
import { planToScene, type Action, type CharacterPlan, type ScenePlan } from "./plan.ts";
import { DASH_SLASH_REACH, STRIKES as PATHS } from "./swordMoves.ts";
import { clashKind, segmentsMeet, weaponLine, weaponOf, type WeaponKind } from "./weapons.ts";

// SPEC-0017 Phase 2C extras (2026-10-06): the WEAPON FIGHT director (Arthur: "Two stick figures fight with swords,
// ~10 seconds. It's everything the engine learned about fighting, but with swords — it should actually look like a
// sword fight"). Like the energetic fight director (fightScene.ts) it only decides WHAT happens and WHEN, from a seed;
// the weapon moves (swordMoves.ts), the engine's own hit reactions (getHit), the dash (dash.ts) and the weapon table
// (weapons.ts) make every picture. ITS RULES (the energetic fight's, with a weapon):
// - THE WEAPON DOES THE HITTING (about 9 attacks in 10): alternating slashes LEFT, RIGHT (down across, up across — an
//   X), overhead chops, thrusts, spin attacks; a kick now and then (about 1 in 10) to break the rhythm.
// - IT OPENS WITH A STRONG MOVE: a DASH SLASH from far off (run holding the weapon, airborne with both hands on it
//   cocked back, slash as the feet land) — met blade on blade.
// - EVERY ATTACK GETS AN ANSWER, timed to its hit: a BLOCK with the weapon (blade meets blade — upright, or over the
//   head against a chop — pushed back by the force), a PARRY (knocked aside), a DODGE (hop back), or a real HIT (the
//   engine's reaction: flinch, stagger, knocked down at the end).
// - SOMETHING EVERY SECOND OR SO: combos of 2-4 slashes, the one who just defended often COUNTERS straight back, never
//   the same kind of exchange twice running, nobody walks back and forth or stands about.
// - IT REALLY REACHES: before it is shown, the fight is built and every strike's hitting part is measured against what
//   it hits (the other weapon, or the body) at the hit picture; the step in (`lunge`, `advance`) is set so it gets
//   there — no portal hits, no blade passing through a body while the other "blocks" thin air.
// - CLASH SPARKS: blade on blade, metal on metal, makes a little yellow spark at the exact contact point (big on a
//   strong hit, tiny on a light one); wood makes a dull hit.
// - IT ENDS CLEARLY: a big last blow knocks the loser down and the winner raises the weapon.

export type WeaponFightOptions = { seed?: number; seconds?: number; weapon?: WeaponKind; colors?: [string, string]; stageWidth?: number };
type Id = "a" | "b";
type Result = "block" | "parry" | "hit" | "dodge" | "knockdown";
export type WeaponAttack = {
  by: Id; move: string; side?: "down" | "up"; result: Result; strong: boolean; first: boolean;
  lunge: number; advance?: number; reachExtra?: number; k: number; // k: this attacker's k-th use of `move`
  counter?: boolean; // a COUNTER-STRIKE: the one who just met the last strike strikes straight back (trading blows)
  reaction?: { move: string; n: number };
};

const RED = "#e02424", BLUE = "#2563eb";
const HEIGHT = 300, GROUND = 900;
const other = (id: Id): Id => (id === "a" ? "b" : "a");
const handOf = (id: Id): "l" | "r" => (id === "a" ? "l" : "r"); // (the hand nearer the viewer: a faces right, b left)

// The script: who does what, from the seed (no positions — those are measured).
function script(seed: number, seconds: number) {
  let state = (Math.floor(Math.abs(seed)) * 2654435761) % 2147483647 || 1;
  const random = () => (state = (state * 48271) % 2147483647) / 2147483647;
  for (let i = 0; i < 4; i += 1) random();
  const pick = <T,>(list: readonly T[]) => list[Math.floor(random() * list.length)];
  const winner: Id = random() < 0.5 ? "a" : "b", opener: Id = random() < 0.5 ? "a" : "b";
  const attacks: WeaponAttack[] = [];
  const uses: Record<string, number> = {};
  const add = (a: Omit<WeaponAttack, "k">) => { const key = `${a.by}.${a.move}`; uses[key] = (uses[key] ?? 0) + 1; attacks.push({ ...a, k: uses[key] }); };
  // OPEN STRONG: the dash slash, met blade on blade.
  add({ by: opener, move: "dashSlash", result: "block", strong: true, first: true, lunge: 0, reachExtra: DASH_SLASH_REACH });
  // (Rough lengths, seconds, to fill about `seconds`: measured afterwards.)
  const LONG: Record<string, number> = { dashSlash: 2.7, swordSlash: 0.95, swordChop: 1.1, swordThrust: 1.05, swordSpin: 1.25, kick: 1.4 };
  let time = LONG.dashSlash + 0.35, last: Id = opener, lastKind = "";
  const KINDS = [{ kind: "slashes", w: 4.2 }, { kind: "chop", w: 1.4 }, { kind: "thrust", w: 1.4 }, { kind: "spin", w: 1.1 }, { kind: "kick", w: 0.6 }];
  let hitsOn: Record<Id, number> = { a: 0, b: 0 };
  while (time < seconds - 3) {
    // WHO: the one who just defended counters about 6 times in 10; the winner a little more often as it goes on.
    const by: Id = random() < 0.72 ? other(last) : random() < 0.55 ? winner : other(winner);
    const choices = KINDS.filter((k) => k.kind !== lastKind);
    let r = random() * choices.reduce((s, k) => s + k.w, 0);
    const kind = (choices.find((k) => (r -= k.w) <= 0) ?? choices[0]).kind;
    lastKind = kind;
    const answer = (options: [Result, number][]): Result => {
      // (Hits land on the loser more often; nobody is hit twice running.)
      const tuned = options.map(([res, w]) => [res, res === "hit" ? w * (other(by) === winner ? 0.6 : 1.4) * (hitsOn[other(by)] > hitsOn[by] + 1 ? 0.3 : 1) : w] as [Result, number]);
      let u = random() * tuned.reduce((s, [, w]) => s + w, 0);
      return (tuned.find(([, w]) => (u -= w) <= 0) ?? tuned[0])[0];
    };
    if (kind === "slashes") {
      const n = 2 + Math.floor(random() * 3);
      let side: "down" | "up" = random() < 0.6 ? "down" : "up";
      for (let i = 0; i < n; i += 1) {
        const res = answer(i === n - 1 ? [["block", 3], ["parry", 2.5], ["hit", 1.2], ["dodge", 0.8]] : [["block", 5], ["parry", 3], ["hit", 0.4], ["dodge", 0.4]]);
        const strong = i === n - 1 || random() < 0.25;
        // TRADING BLOWS (Arthur, review 6: "you barely fight, Red"): the slashes go back and forth — each one is met by the
        // other's swing and answered by a counter-strike, alternating sides (an X between them).
        const who: Id = i % 2 === 0 ? by : other(by);
        add({ by: who, move: "swordSlash", side, result: res, strong, first: true, lunge: PATHS[side].lunge, advance: 0, ...(i > 0 ? { counter: true } : {}) });
        time += LONG.swordSlash;
        side = side === "down" ? "up" : "down";
        if (res === "hit" || res === "dodge") break;
      }
    } else if (kind === "chop") {
      add({ by, move: "swordChop", result: answer([["block", 3.5], ["hit", 1], ["dodge", 0.8]]), strong: true, first: true, lunge: PATHS.chop.lunge, advance: 0 });
      time += LONG.swordChop;
    } else if (kind === "thrust") {
      add({ by, move: "swordThrust", result: answer([["parry", 3], ["dodge", 1.2], ["hit", 1]]), strong: true, first: true, lunge: PATHS.thrust.lunge, advance: 0 });
      time += LONG.swordThrust;
    } else if (kind === "spin") {
      add({ by, move: "swordSpin", result: answer([["block", 3], ["hit", 1.2]]), strong: true, first: true, lunge: 0.3, advance: 0 });
      time += LONG.swordSpin + 0.2;
    } else {
      add({ by, move: "kick", result: "hit", strong: false, first: true, lunge: 0, advance: 0.2 });
      time += LONG.kick + 0.3;
    }
    const lastAttack = attacks[attacks.length - 1];
    if (lastAttack.result === "hit") { hitsOn[other(by)] += 1; time += 0.3; }
    last = by;
    time += 0.15;
  }
  // THE END: the winner's big blow knocks the loser down.
  const finisher = pick(["swordSpin", "swordChop"] as const);
  add({ by: winner, move: finisher, result: "knockdown", strong: true, first: true, lunge: finisher === "swordSpin" ? 0.3 : PATHS.chop.lunge, advance: 0 });
  hitsOn = { a: 0, b: 0 };
  return { attacks, winner, opener };
}

// The plan for a script (attack knobs as they are now): both fighters' actions and the held weapons.
function planFor(o: Required<Pick<WeaponFightOptions, "seed" | "weapon">> & WeaponFightOptions, s: ReturnType<typeof script>, xs: Record<Id, number>, extraTracks: EffectTrack[] = []): ScenePlan {
  const weapon = o.weapon;
  const acts: Record<Id, Action[]> = { a: [], b: [] };
  const ready: Record<Id, string | undefined> = { a: undefined, b: undefined };
  const n: Record<Id, Record<string, number>> = { a: {}, b: {} };
  const count = (id: Id, move: string) => (n[id][move] = (n[id][move] ?? 0) + 1);
  let lastBy: Id | undefined;
  s.attacks.forEach((at, index) => {
    const X = at.by, D = other(X), mine = `${X}.${at.move}${at.k}`;
    const base = { hand: handOf(X), weapon };
    // (PRESSING: the next strike is this one's straight on — no stepping back out between.)
    const following = s.attacks[index + 1], pressing = following !== undefined && following.by === X && !following.first;
    // (Answered by a counter-strike: it stays in — no stepping back out — and the other strikes back from where it is.)
    const countered = following?.counter === true;
    // (Every attack starts once the other is ready again — after its block, its dodge, its own strike — waiting in the
    // weapon guard till then: WAIT IN THE WEAPON GUARD, plan.ts.)
    // OVERLAP (SMOOTH, NOT ROBOTIC): the next attack winds up while the other is still giving ground — timed so its
    // contact comes just as long after the other is ready again as a block takes to get into place.
    // (Long enough for the other to READ it: its meeting swing's wind-up starts with this one's.)
    // (AT STRIKING DISTANCE the next contact comes ~1 s after the last: the other's recovery flows into its wind-up.)
    // (Straight after the other's strike its recovery flows into this wind-up — a little sooner; after a kick or a dodge
    // it gets the longer read.)
    const prevAt = s.attacks[index - 1], flows = prevAt !== undefined && prevAt.by === D && prevAt.move !== "kick" && prevAt.move !== "dashSlash" && prevAt.result !== "dodge";
    const when = ready[D] ? { sync: { mark: "hit", at: ready[D]!, offset: flows ? 0.42 : 0.56 } } : {};
    if (at.move === "dashSlash") {
      acts[X].push({ move: "dashSlash", params: { ...base, target: D, reachExtra: at.reachExtra ?? DASH_SLASH_REACH, blocked: at.result === "block" }, energy: 0.85 });
    } else if (at.move === "kick") {
      acts[X].push({ move: "swordStep", params: { ...base, advance: at.advance ?? 0 }, ...(ready[D] ? { sync: { mark: "begin", at: ready[D]! } } : {}) });
      acts[X].push({ move: "kick", params: { height: "mid" }, energy: 0.75 });
      // (Then it steps back out to the STRIKING GAP it came from — as far as it stepped in: a kick is thrown from close in.)
      acts[X].push({ move: "swordStep", params: { ...base, advance: -Math.max(0.2, Math.min(0.7, at.advance ?? 0.4)) } });
    } else {
      // (The finishing blow doesn't step back out: it stands over the one it knocked down.)
      // EXCHANGES AT STRIKING DISTANCE (Arthur, Oct 6: "after the dash they should be standing… striking about every
      // second", not "walking forward, walking backward"): every strike but the spin and the finisher lunges and pushes
      // straight back to its stance (`stay`) — the two keep one striking gap, feet planted, the next wind-up flowing on.
      const stay = at.move !== "swordSpin" && at.result !== "knockdown";
      const p: Record<string, unknown> = { ...base, lunge: at.lunge, strong: at.strong, last: !pressing && !countered && at.result !== "knockdown", ...(stay ? { stay: true } : {}), ...(at.side ? { side: at.side } : {}), ...(at.advance !== undefined ? { advance: at.advance } : {}) };
      if (at.result === "block") p.blocked = true;
      if (at.result === "parry") p.parried = true;
      acts[X].push({ move: at.move, params: p, ...when, energy: at.strong ? 0.85 : 0.7 });
    }
    count(X, at.move);
    // THE ANSWER, exactly on the hit.
    const sync = { mark: "hit", at: `${mine}.hit` };
    const height = at.move === "swordChop" ? "high" : at.move === "swordThrust" ? "low" : "mid";
    let r: { move: string; n: number };
    if (at.result === "block" || at.result === "parry") {
      // GIVING GROUND (the push): a combo PRESSES — the attacker steps on with every strike and the one blocking is driven
      // back about as far; the last strike of an exchange (it steps back out after it) only knocks it back a little.
      // (A strike after a big wind-up carries the body's momentum: the dash slash drives the one blocking well back.)
      // (AT STRIKING DISTANCE an ordinary block only rocks the weight back — no steps: the gap stays the same.)
      const push = at.move === "dashSlash" ? 0.32 : pressing ? Math.max(0.05, at.lunge - 0.03) : 0;
      // (MEET IT: the one answering swings its own weapon into the strike — both blades moving into each other.)
      acts[D].push({ move: "swordBlock", params: { hand: handOf(D), weapon, height, push, parry: at.result === "parry", strong: at.strong, meet: at.move !== "dashSlash", ...(at.move === "dashSlash" ? { driven: true } : {}), ...(at.side ? { side: at.side } : {}) }, sync });
      r = { move: "swordBlock", n: count(D, "swordBlock") };
    } else if (at.result === "dodge") {
      // (Hops well back — the whole swing and its follow-through pass in front of it, never through its hands.)
      acts[D].push({ move: "swordDodge", params: { hand: handOf(D), weapon, distance: 0.45 }, sync });
      r = { move: "swordDodge", n: count(D, "swordDodge") };
    } else {
      const down = at.result === "knockdown";
      acts[D].push({ move: "getHit", params: { power: down ? 1.8 : at.move === "kick" ? 0.5 : at.strong ? 0.7 : 0.5, ...(down ? { result: "knockdown", stayDown: true } : {}) }, sync });
      r = { move: "getHit", n: count(D, "getHit") };
    }
    at.reaction = r;
    ready[D] = `${D}.${r.move}${r.n}.ready`;
    // (The attacker is ready once its strike is over.)
    ready[X] = at.move === "dashSlash" ? `${X}.dashSlash${at.k}.step` : at.move === "kick" ? `${X}.swordStep${2 * at.k}.stepped` : `${mine}.ready`;
    lastBy = X;
  });
  // THE END: the winner raises the weapon as the loser goes down.
  const fin = s.attacks[s.attacks.length - 1];
  if (fin.reaction) acts[s.winner].push({ move: "swordVictory", params: { hand: handOf(s.winner), weapon, seconds: 0.6 }, sync: { mark: "start", at: `${other(s.winner)}.getHit${fin.reaction.n}.hit`, offset: 0.55 } });
  void lastBy;
  const [colorA, colorB] = o.colors ?? [RED, BLUE];
  const lookOf = (color: string): Partial<CharacterStyle> => ({ color, headFilled: true });
  const characters: CharacterPlan[] = [
    { id: "a", name: "Red", x: xs.a, facing: "right", look: lookOf(colorA), style: "angry", speed: "normal", energy: 0.8, actions: acts.a },
    { id: "b", name: "Blue", x: xs.b, facing: "left", look: lookOf(colorB), style: "natural", speed: "normal", energy: 0.8, actions: acts.b },
  ];
  const held = (id: Id): EffectTrack => ({ kind: "heldWeapon", start: 0, end: 60, anchor: { character: id, joint: `${handOf(id)}Hand` }, target: { character: id, joint: `${handOf(id)}Elbow` }, params: { weapon } });
  return { id: `weapon-fight-${o.seed}`, title: `${weaponOf(weapon).symbol} fight #${o.seed}`, height: HEIGHT, groundY: GROUND, characters, effects: [held("a"), held("b"), ...extraTracks], ...(o.stageWidth !== undefined ? { stageWidth: o.stageWidth } : {}) };
}

type Built = ReturnType<typeof buildScene>;
const FPS = 48;
type P = { x: number; y: number };
// One fighter's picture at time t.
// (The picture AT or just after the moment — a spin is still turned the picture before its hit.)
const frameAt = (b: Built, t: number) => b.frames[Math.max(0, Math.min(b.frames.length - 1, Math.ceil(t * b.fps - 1e-6)))];
// The hitting part of a fighter's weapon in a picture.
export function hittingPart(c: { skeleton: Record<string, P> }, hand: "l" | "r", weapon: WeaponKind, H = HEIGHT) {
  const w = weaponOf(weapon), line = weaponLine(c.skeleton[`${hand}Hand`], c.skeleton[`${hand}Elbow`], H, w);
  return { from: line.at(w.hitting[0]), to: line.at(1), line };
}
const torsoPoint = (c: { skeleton: Record<string, P> }, k: number): P => ({ x: c.skeleton.hip.x + (c.skeleton.neck.x - c.skeleton.hip.x) * k, y: c.skeleton.hip.y + (c.skeleton.neck.y - c.skeleton.hip.y) * k });

// How far (px, along the attacker's forward) its hitting part is short of its target at the hit (+ = short).
export function missOf(scene: { marks: Record<string, number> }, built: Built, at: WeaponAttack, weapon: WeaponKind): number | undefined {
  const X = at.by, D = other(X), t = scene.marks[`${X}.${at.move}${at.k}.hit`];
  if (t === undefined) return undefined;
  const ix = X === "a" ? 0 : 1, dir = X === "a" ? 1 : -1;
  const fr = frameAt(built, t), A = fr[ix], Dc = fr[1 - ix];
  let sweet: P, target: P;
  if (at.move === "kick") {
    const foot = [A.skeleton.lFoot, A.skeleton.rFoot].sort((p, q) => (q.x - p.x) * dir)[0];
    // (KICKING DISTANCE: the foot meets the front of the body — the kicker never steps inside the other.)
    const front = torsoPoint(Dc, 0.45);
    sweet = foot; target = { x: front.x - 0.05 * HEIGHT * dir, y: front.y };
  } else {
    const hp = hittingPart(A, handOf(X), weapon);
    // (A DODGED strike reaches with its tip to where the body was — it would have hit — so once it hops back the swing and
    // its follow-through pass in front of it, never through its hands.)
    sweet = hp.line.at(at.result === "dodge" ? 1 : at.move === "swordThrust" ? 0.96 : 0.82);
    if (at.result === "block" || at.result === "parry") {
      // BLADE MEETS BLADE: the step that makes the two blades really CROSS — the hitting part meeting the other blade
      // well along both (not at the very tip, not at the hilt), the smallest step that does it.
      const dl = hittingPart(Dc, handOf(D), weapon).line, d0 = dl.at(0.25), d1 = dl.at(1);
      // (Already crossing well — touching, along the hitting part, on the other blade: no change.)
      const now = segmentsMeet(hp.from, hp.to, d0, d1);
      // (ON THE UPPER HALF OF BOTH BLADES: never at the handle — it would read as cutting the hand.)
      if (now.distance <= 3 && now.s >= 0.72 && now.s <= 0.97 && now.t >= 0.6 && now.t <= 0.97) return 0;
      let best = { cost: Infinity, shift: 0 };
      for (let k = -90; k <= 90; k += 1) {
        const sh = k * 4, m = segmentsMeet({ x: hp.from.x + sh * dir, y: hp.from.y }, { x: hp.to.x + sh * dir, y: hp.to.y }, d0, d1);
        // (MEETS IN FRONT: near the attacking blade's tip — the rest of it never reaches past into the head.)
        const cost = 10 * Math.max(0, m.distance - 2) + 60 * Math.abs(m.s - 0.85) + 40 * Math.abs(m.t - 0.75) + 0.05 * Math.abs(sh);
        if (cost < best.cost) best = { cost, shift: sh };
      }
      return best.shift;
    } else if (at.result === "dodge") {
      // (Aimed at where the body was as the attack began: it hops out of the way.)
      const t0 = scene.marks[`${X}.${at.move}${at.k}.begin`] ?? t;
      target = torsoPoint(frameAt(built, t0)[1 - ix], 0.75);
    } else target = torsoPoint(Dc, 0.75);
  }
  return (target.x - sweet.x) * dir;
}

// The finished plan: script -> plan -> built and MEASURED -> each strike's step in set so it reaches -> again, until
// every strike reaches (a few rounds); then the fight is centred on the page and the sparks go where blades meet.
const made = new Map<string, ScenePlan>();
export function weaponFightPlan(options: WeaponFightOptions = {}): ScenePlan {
  const o = { seed: options.seed ?? 7, weapon: options.weapon ?? ("sword" as WeaponKind), seconds: options.seconds ?? 10, ...options };
  const key = JSON.stringify(o);
  const known = made.get(key);
  if (known) return known;
  const s = script(o.seed, o.seconds);
  // (Far enough apart for the opening DASH to take off a full dash-length plus the weapon's reach out — after the
  // shortest run-up — a long, flat, full-speed flight, never a short hop right in front of them: Arthur, Oct 6.)
  // (THE OPENER NEEDS ROOM: the shortest run-up, a weapon dash's ~0.5 s flight at full run speed and the weapon's reach
  // — about 4.6 heights. Less, and the flight has to slow down in the air: Arthur, review 11, "it slows down".)
  const H = HEIGHT, startGap = 4.6 * H;
  const xs: Record<Id, number> = s.opener === "a" ? { a: 960 - 0.6 * startGap, b: 960 + 0.4 * startGap } : { a: 960 - 0.4 * startGap, b: 960 + 0.6 * startGap };
  let plan = planFor(o, s, xs), scene = planToScene(plan, LIBRARY), built = buildScene(scene, FPS);
  const rounds: number[] = [];
  for (let round = 0; round < 5; round += 1) {
    const shift: Record<Id, number> = { a: 0, b: 0 }; // (world px each one is already moved by this round's changes)
    let worst = 0;
    for (const [index, at] of s.attacks.entries()) {
      const raw = missOf(scene, built, at, o.weapon);
      if (raw === undefined) continue;
      const X = at.by, D = other(X), dir = X === "a" ? 1 : -1;
      const miss = (raw + (shift[D] - shift[X]) * dir) / H; // x height
      worst = Math.max(worst, Math.abs(raw / H));
      if (process.env.AIM_DEBUG) console.log("round", round, at.by, at.move, at.k, (raw / H).toFixed(3), (miss).toFixed(3));
      if (Math.abs(miss) < 0.01) continue;
      let moved = 0;
      if (at.move === "dashSlash") {
        const before = at.reachExtra ?? DASH_SLASH_REACH;
        at.reachExtra = Math.min(0.9, Math.max(0, before - miss));
        moved = before - at.reachExtra;
      } else if (at.move === "kick") {
        const before = at.advance ?? 0;
        at.advance = Math.min(1.5, Math.max(-0.6, before + miss));
        // (It steps back out as far as it stepped in — up to 0.7: only what's beyond that moves it on.)
        moved = Math.max(0, at.advance - 0.7) - Math.max(0, before - 0.7);
      } else {
        const lo = 0.06, hi = at.move === "swordSpin" ? 0.5 : 0.42, total = at.lunge + (at.advance ?? 0) + miss;
        const beforeL = at.lunge, beforeA = at.advance ?? 0;
        // REACH BY THE LUNGE FIRST (striking distance): the lunge (and the lean and arm that go with it) takes up the
        // difference; the feet step in or out only for what the lunge can't reach — never a walk in or out to aim.
        if (at.advance !== undefined) {
          const over = total - Math.min(hi, Math.max(lo, total));
          at.advance = Math.abs(over) < 0.04 ? 0 : Math.min(1, Math.max(-0.6, over));
        }
        at.lunge = Math.min(hi, Math.max(lo, total - (at.advance ?? 0)));
        // (What it moves on by: its steps in — and, pressing, the lunge too; a spin lands half its lunge on.)
        const next = s.attacks[index + 1], presses = next !== undefined && next.by === at.by && !next.first;
        // (A strike AT STRIKING DISTANCE pushes back to its stance: only its steps move it on.)
        const stays = at.move !== "swordSpin" && at.result !== "knockdown";
        moved = (at.advance ?? 0) - beforeA + (presses ? 1 : stays ? 0 : 0.5) * (at.lunge - beforeL);
      }
      shift[X] += moved * H * dir;
      // (Pressing, the one blocking gives as much ground as the attacker takes: it moves with it.)
      const next = s.attacks[index + 1];
      if (next !== undefined && next.by === X && !next.first && (at.result === "block" || at.result === "parry")) shift[D] += moved * H * dir;
    }
    rounds.push(Math.round(worst * 1000) / 1000);
    // ON THE PAGE, IN THE MIDDLE: the whole fight moved so its middle is the page's middle (with the next round).
    let lo = Infinity, hi = -Infinity;
    for (const f of built.frames) for (const c of f) { lo = Math.min(lo, c.skeleton.hip.x); hi = Math.max(hi, c.skeleton.hip.x); }
    const dx = Math.round((o.stageWidth ?? 1920) / 2 - (lo + hi) / 2);
    if (worst < 0.03 && Math.abs(dx) <= 6) break;
    xs.a += dx; xs.b += dx;
    plan = planFor(o, s, xs);
    scene = planToScene(plan, LIBRARY);
    built = buildScene(scene, FPS);
  }
  // CLASH SPARKS where the blades meet (strong: a real spark; light: a tiny one); a dull hit for wood.
  const tracks: EffectTrack[] = [];
  const w = weaponOf(o.weapon);
  s.attacks.forEach((at, i) => {
    if ((at.result !== "block" && at.result !== "parry") || at.move === "kick") return;
    const X = at.by, D = other(X), t = scene.marks[`${X}.${at.move}${at.k}.hit`];
    if (t === undefined) return;
    const ix = X === "a" ? 0 : 1, fr = frameAt(built, t);
    const mine = hittingPart(fr[ix], handOf(X), o.weapon), theirs = hittingPart(fr[1 - ix], handOf(D), o.weapon);
    const meet = segmentsMeet(mine.from, mine.to, theirs.line.at(0.22), theirs.to);
    const hand = fr[1 - ix].skeleton[`${handOf(D)}Hand`];
    const strong = at.strong;
    // (EVERY CLASH SHOWS — Arthur, review 10: "every time their swords hit each other there should always be a yellow
    // spark… otherwise it looks like they're just moving their swords": a light hit's spark is smaller, never invisible.)
    tracks.push({ kind: clashKind(w, w), start: t, end: t + (strong ? 0.25 : 0.2), anchor: { character: D, joint: `${handOf(D)}Hand`, dx: meet.mid.x - hand.x, dy: meet.mid.y - hand.y }, params: { size: strong ? 1 : 0.6, seed: i + 1 } });
  });
  plan = planFor(o, s, xs, tracks);
  const end = Math.ceil(built.frames.length / FPS) + 1; // (held to the very last picture at any frame rate)
  // (BEHIND THE BODY ON THE FAR SIDE of a turn: the moves' behindFrom / behindTo marks.)
  const behindOf = (id: string) => Object.entries(scene.marks).flatMap(([name, from]) => {
    const to = name.startsWith(`${id}.`) && name.endsWith(".behindFrom") ? scene.marks[name.replace(/behindFrom$/, "behindTo")] : undefined;
    return to !== undefined && to > from ? [[from, to] as [number, number]] : [];
  });
  plan = { ...plan, effects: plan.effects!.map((e) => {
    if (e.kind !== "heldWeapon") return e;
    const behind = [...new Map(behindOf(String((e.anchor as { character?: string }).character)).map((span) => [span.join(), span])).values()];
    return { ...e, end, ...(behind.length ? { behind } : {}) };
  }) };
  const result = { ...plan, title: `${w.symbol} fight: ${s.winner === "a" ? "Red" : "Blue"} wins`, aimRounds: rounds, weaponScript: s } as ScenePlan;
  made.set(key, result);
  return result;
}

// The script of a finished fight (for the tests): what each attack was and how it was answered.
export function weaponFightScript(options: WeaponFightOptions = {}) {
  return script(options.seed ?? 7, options.seconds ?? 10);
}

// THE REVIEW SCENE (Engine test panel, Effects (2C): "Sword fight"): red vs blue with swords, about 10 s, a fixed good
// seed (dash-slash opener, alternating slashes blocked and parried with sparks, a thrust, a chop, a spin attack, the
// knock-down and the raised sword).
export const SWORD_FIGHT_SEED = 14;
export const SWORD_FIGHT_SECONDS = 13; // (review 1, Arthur: slower and readable — "less speed, more fighting": ~12-15 s)
export const swordFightTestPlan = (): ScenePlan => ({ ...weaponFightPlan({ seed: SWORD_FIGHT_SEED, seconds: SWORD_FIGHT_SECONDS, weapon: "sword" }), id: "fx-sword-fight" });
