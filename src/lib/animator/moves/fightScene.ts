import { buildScene } from "../engine.ts";
import { DEFAULT_STYLE, type CharacterStyle } from "../rig.ts";
import { LIBRARY } from "./library.ts";
// The attacks on someone down the director picks from (only those the library has).
const FLOOR_ATTACKS = ["stompDown", "groundPunch", "liftSlam"];
import { fitPlanToPage, planToScene, type Action, type CharacterPlan, type ScenePlan } from "./plan.ts";
import type { MoveSpeed, MoveStyle } from "./styles.ts";

// SPEC-0017 Phase 2 (review only): the ENERGETIC FIGHT director (Arthur, 2026-10-05: "an energetic fight
// scene. Two characters fighting each other. When they get hit, they get hurt, get back up... until
// they're genuinely beat up by strong hits... Like Red vs Blue... Maybe a 30-second fight scene").
// The director only decides WHAT happens and WHEN, from a random seed: they walk up to each other, who
// attacks, with which combo (quick jabs, a big power shot, a kick), which punches get blocked, and that the
// attacker waits for the other to be back on guard. It never says HOW anything looks: how hard each hit
// really was, how the other reacts (flinch, stagger, almost falls, knocked down), how long they stay down,
// how slumped and slow they get, where they step to get in range or keep their distance, how far a
// knocked-down fighter can fall on this page — the engine works all of that out from its rules (plan.ts,
// hit.ts). Each seed is a fight nobody wrote.

// (`guard: "realistic"`: a real boxing guard between strikes — only for realistic, educational fighting;
// `guard: "high"`: loose, hands at the chest; otherwise the fighters stand loose, hands low: punch.ts FIGHT LOOK.)
export type FightLook = { color?: string; hollowHead?: boolean; neck?: boolean; colors?: [string, string]; guard?: "loose" | "high" | "realistic" };
const RED = "#e02424";
const BLUE = "#2563eb";

// (`ready`: the moment it can be attacked again — back on guard, or up off the floor; `n`: how many of
// each ground move it has done, to name their marks.)
type Fighter = { id: "a" | "b"; actions: Action[]; strikes: number; hits: number; ready: string; n: Record<string, number> };

const P = (technique: string, hand: "front" | "back"): Action => ({ move: "punch", params: { technique, hand } });
const K = (height: string): Action => ({ move: "kick", params: { height } });
const guardOf = (look: FightLook) => (look.guard === "realistic" || look.guard === "high" ? { guard: look.guard } : {});
const big = (strike: Action) => strike.params?.technique === "power" || strike.params?.technique === "overhand" || strike.move === "kick";

// NO PATTERN (Arthur, round 8-9: "a cartoon, exciting fight... punch, punch, kick, got hit, got hit again,
// block, punch, fell down from a strong hit, got up..."; "no repeating pattern"). The director throws dice for
// every exchange instead of picking from a short list, so no two fights (and no two minutes of one fight)
// run the same way:
// - WHAT is thrown: a BARRAGE of quick punches (both hands, sometimes ending in a big one), punches into a
//   kick, a DOUBLE KICK, a kick then punches, a lone big shot, an uppercut into an overhand, a lone jab, two
//   jabs and a power shot;
// - WHO goes next: the one just hit COUNTERS straight back, or the same one PRESSES ON, or either (the one
//   who will win a bit more often as the fight goes on);
// - WHEN: at once (as soon as the other's guard is back) or after a short breather;
// - which punches get BLOCKED (a few, at random — never every one, never the big last shot);
// - whether a big last shot is meant to put the other one DOWN ("fell down from a strong hit, got up"):
//   the engine still decides if there is room to fall, how hard every other hit really lands, and waits
//   for a fighter who is down to get up before PUNCHING or KICKING it again.
// PRESS THE ADVANTAGE (Arthur, round 11: "he fell down, now I have an advantage. He should walk over there,
// stomp on him... And then red is supposed to block, or do something about it... or get hit again, or
// strike back"; "if he sees that the other is off balance... he should jog over there, and right when he
// stops jogging, his leg lifts and kicks him — or an overhand or an uppercut"; "a dash attack is only when
// they're far apart"). Unless the user's request says to hold back, the director never lets an advantage go:
// - a fighter put DOWN stays down a moment and the other goes over to where it lies and attacks it there
//   (stompDown, once or twice); the one on the floor covers up (coverUp: the block on the ground) and then,
//   by the dice, gets up fast (kipUp) and strikes straight back, gets up fast and squares up, or gets up
//   slowly (hurt);
// - a fighter thrown OFF BALANCE (almost falls, staggers) is hit again straight away: no guard between, the
//   attacker closes in at once (the engine's STRIKE RANGE: a jog for a long gap) into a kick, an overhand or
//   an uppercut;
// - FAR APART (DASH_ROOM body heights or more: room for a full-speed dash, at the start): now and then the opener DASHES in with a dash
//   punch instead of walking up.
// (What the engine did when it was tried — hits named "<id>.<k>", that fighter's k-th hit taken: `floored`:
// it knocked it down by itself (the hit was that hard), so that one is pressed on the floor too; `noRoom`:
// no room on this page to fall, it almost fell instead, so the attacker presses it standing.)

const DASH_ROOM = 3;
const HEIGHT = 300;
export function fightPlan(seed: number, seconds = 30, look: FightLook = {}, tried: { floored?: ReadonlySet<string>; noRoom?: ReadonlySet<string> } = {}): ScenePlan {
  const floored = tried.floored ?? new Set<string>(), noRoom = tried.noRoom ?? new Set<string>();
  let state = (Math.floor(Math.abs(seed)) * 2654435761) % 2147483647 || 1;
  const random = () => (state = (state * 48271) % 2147483647) / 2147483647;
  for (let i = 0; i < 4; i += 1) random(); // (small seeds start with tiny numbers: stir first)
  const pick = <T,>(list: readonly T[]) => list[Math.floor(random() * list.length)];
  const between = (lo: number, hi: number) => lo + Math.floor(random() * (hi - lo + 1));
  // BOTH HANDS, 50/50 (Arthur, round 9): every punch's hand is a coin toss — a run of punches mostly
  // alternates (left, right, left...) but now and then doubles up on one hand — and the big shots (power,
  // overhand, uppercut) come from either hand too. Never a fixed order.
  // HANDS IN RUNS (round 13, Arthur: "always left, left, left, left, strong hit with the right. No. It should
  // be like: left, right, right, right, strong punch with the left"): each next punch switches hands only
  // about half the time, so the same hand often goes 2-3 times running (never more than 3), and a strong
  // punch's hand is its own coin toss — either hand, never always the rear one.
  const coin = (): "front" | "back" => (random() < 0.5 ? "front" : "back");
  const flip = (hand: "front" | "back"): "front" | "back" => (hand === "front" ? "back" : "front");
  const run = (techniques: string[]): Action[] => {
    let hand = coin(), same = 1;
    return techniques.map((t, i) => {
      if (i > 0) {
        const strong = t !== "straight", u = random();
        // (Round 13 review, Arthur: "use both your hands — left, right, left, right": mostly switching, the same
        // hand at most twice running.)
        const next = strong ? (u < 0.6 ? flip(hand) : hand) : same >= 2 || u < 0.75 ? flip(hand) : hand;
        same = next === hand ? same + 1 : 1;
        hand = same > 2 ? flip(hand) : next;
        if (same > 2) same = 1;
      }
      return P(t, hand);
    });
  };
  const combo = (): Action[] => {
    const n = between(2, 4);
    return run(Array.from({ length: n }, (_, i) => (i === n - 1 && random() < 0.35 ? pick(["power", "power", "overhand"]) : "straight")));
  };
  // A HIT ABOUT EVERY SECOND (round 14, Arthur: "about every second there should be a punch landing — someone
  // getting hit every second"): most exchanges are COMBOS of 3-5 strikes; a lone shot is rare.
  // A FLURRY (round 15, Arthur: "more punching, more frequently... a BARRAGE / FLURRY: under every half second a
  // punch... the other either dodges or blocks"): 5-8 quick straight punches, hands mostly alternating, most of
  // them blocked or parried, a few landing, ending in a big shot or a kick. The most common exchange.
  // (Round 15, Arthur: "70 to 85% of the fight is punches": a flurry is 2-4 quick punches into its finisher.)
  // (Round 16, Arthur: "60% of the fight scene should be punches, the other 40% barrage, dash punch, running hammer strike,
  // lift and slam, ground fight, kicking": a flurry is 3-4 quick punches into its finisher.)
  const flurry = (): Action[] => [...run(Array.from({ length: between(3, 4) }, () => "straight")), random() < 0.5 ? K(pick(["mid", "high"])) : P(pick(["power", "overhand", "uppercut"]), coin())];
  const EXCHANGES: { kind: string; weight: number; make: () => Action[]; punchy?: boolean }[] = [
    // PUNCH BARRAGE (round 15, Arthur: "use barrage... more commonly — those are cool for fighting"): the
    // two-figure barrage move (barrage.ts: 6-10 fast punches into the other's cover, the last one in under it to
    // the stomach; the other covers up, is driven back a step and doubles over). The most common exchange.
    { kind: "barrage", weight: 4, make: () => [{ move: "barrage", params: { count: between(6, 9), seed: between(1, 999) } }] },
    // NOT ALL PUNCHES (round 15, Arthur: "70-85% of the fight is punches... I like it when they do OTHER stuff —
    // that breaks the pattern and really stimulates the viewer"): the plain punch exchanges (`punchy`) are about a
    // third of the dice; the rest are barrages, kicks and big shots (and dashes and floor attacks when there's room
    // or someone is down).
    // (Kicks and big shots carry at most one jab.)
    // PUNCHES ARE MOST OF IT, THE REST IS THE COOL STUFF (round 16, Arthur: "60% punches, 40% barrage, dash punch,
    // running hammer strike, lift and slam, ground fight, kicking"): the punch exchanges (flurries, combos, jabs into
    // a big shot, big shots, uppercut combos) carry about 60% of the strikes; barrages, kicks, dashes and the floor
    // attacks the rest — and every fight has at least one barrage.
    { kind: "flurry", weight: 4, make: flurry, punchy: true },
    { kind: "combo", weight: 3, make: combo, punchy: true },
    { kind: "punchesKick", weight: 1.5, make: () => [...run(Array.from({ length: between(0, 1) }, () => "straight")), K(pick(["mid", "high"]))] },
    { kind: "doubleKick", weight: 1, make: () => [K(pick(["mid", "high"])), K(pick(["mid", "high"])), ...run(Array.from({ length: between(0, 1) }, () => "straight"))] },
    { kind: "kickPunches", weight: 1.5, make: () => [K(pick(["mid", "mid", "high"])), ...run(Array.from({ length: between(0, 1) }, () => "straight")), P(pick(["power", "overhand", "uppercut"]), coin())] },
    { kind: "bigShot", weight: 2, make: () => [P(pick(["power", "overhand"]), coin())] },
    { kind: "uppercut", weight: 2, make: () => run(["uppercut", "overhand"]) },
    { kind: "jab", weight: 0.5, make: () => [P("straight", coin())], punchy: true },
    { kind: "jabsBig", weight: 2.5, make: () => run([...Array.from({ length: between(1, 2) }, () => "straight"), pick(["power", "overhand"])]) },
  ];
  // NEVER A PATTERN, BROKEN AS SOON AS IT SHOWS (round 14, Arthur: "It shouldn't be a pattern... Always something
  // new should be coming. If the user starts seeing a pattern, break it right when it's noticeable"): the
  // director remembers the kinds of exchanges so far — never the same kind twice running, and never the same
  // two kinds one after the other twice in a fight. (One die per pick, whatever is left: a fight planned again
  // with what the engine did goes on the same way.)
  const kinds: string[] = [], pairs = new Set<string>();
  const exchange = () => {
    const prev = kinds[kinds.length - 1];
    // (Two plain punch exchanges running: the next is something else — a barrage, a kick, a big shot.)
    const punchy = (kind: string) => EXCHANGES.find((e) => e.kind === kind)?.punchy === true;
    const tooPunchy = kinds.length >= 3 && kinds.slice(-3).every(punchy);
    // (Every fight has a barrage, early — fights are cut, and the floor fights take time: the second exchange is
    // one if the first wasn't.)
    const owesBarrage = kinds.length === 1 && !kinds.includes("barrage");
    const notTwice = owesBarrage ? EXCHANGES.filter((e) => e.kind === "barrage") : EXCHANGES.filter((e) => e.kind !== prev && !(tooPunchy && e.punchy));
    const fresh = notTwice.filter((e) => prev === undefined || !pairs.has(`${prev}>${e.kind}`));
    const choices = fresh.length ? fresh : notTwice;
    let r = random() * choices.reduce((sum, e) => sum + e.weight, 0);
    const chosen = choices.find((e) => (r -= e.weight) <= 0) ?? choices[0];
    if (prev !== undefined) pairs.add(`${prev}>${chosen.kind}`);
    kinds.push(chosen.kind);
    return chosen.make();
  };
  // The strike that punishes someone off balance: a kick, an overhand or an uppercut (either hand).
  const punish = (): Action => { const r = random(), hand = coin(); return r < 0.25 ? K("mid") : r < 0.45 ? K("high") : r < 0.75 ? P("overhand", hand) : P("uppercut", hand); };
  const [colorA, colorB] = look.colors ?? [RED, BLUE];
  const lookOf = (color: string): Partial<CharacterStyle> => ({ color, headFilled: !look.hollowHead, neck: look.neck === true });
  // Energetic: lively, quick fighters (a little different every time).
  const styles: MoveStyle[] = ["angry", "natural", "angry", "heavy"];
  const fighter = (id: "a" | "b"): Fighter => ({ id, actions: [], strikes: 0, hits: 0, ready: `${id}.walk1.arrived`, n: {} });
  const a = fighter("a"), b = fighter("b");
  const other = (f: Fighter) => (f === a ? b : a);
  const count = (f: Fighter, move: string) => (f.n[move] = (f.n[move] ?? 0) + 1);
  // Who will win: they attack a bit more often and go for the big shots (the engine decides if they land hard).
  const winner = random() < 0.5 ? a : b;
  const energyA = 0.75 + 0.2 * random(), energyB = 0.75 + 0.2 * random();
  // NEVER THE SAME TWICE (Arthur, round 9: "everything a little off each time"): each strike's energy is a
  // little off the fighter's own (a touch harder, quicker or softer), so no two punches take the same time.
  const jitter = (f: Fighter) => Math.round(100 * Math.min(1, Math.max(0.3, (f === a ? energyA : energyB) + 0.14 * (random() - 0.5)))) / 100;
  // One strike and the other's answer to it.
  const land = (attacker: Fighter, defender: Fighter, strike: Action, energy: number, result?: string, stayDown = false) => {
    attacker.actions.push({ ...strike, energy, params: { ...strike.params, target: defender.id } });
    attacker.strikes += 1;
    defender.hits += 1;
    defender.actions.push({ move: "getHit", params: { from: attacker.id, ...(result ? { result } : {}), ...(stayDown ? { stayDown: true } : {}) } });
    defender.ready = `${defender.id}.getHit${defender.hits}.ready`;
  };
  // ON THE FLOOR: the attacker sees it go down, goes over (the planner walks it to where it lies) and stomps
  // on it, once or twice; the one down covers up under each stomp; the attacker steps back to its spot
  // (leaving room to get up) and the one down gets up — fast (kip-up) or slowly. True: it strikes straight back.
  type Dice = { look: number; stomps: number; size: number; quick: boolean; back: boolean; energy: [number, number]; kind: number };
  let lastFloor = "", lastAnswer = "";
  const onTheFloor = (attacker: Fighter, defender: Fighter, dice: Dice): boolean => {
    // NO SAME ANSWER TWICE (round 14): the answer to a knock-down — get hit again (two attacks), cover up and get up
    // slowly, kip up and square up, kip up and strike straight back — is never the same as the last one.
    const ANSWERS = ["again", "slow", "kip", "kipBack"];
    const thrown = dice.stomps > 1 ? "again" : !dice.quick ? "slow" : dice.back ? "kipBack" : "kip";
    const answer = thrown === lastAnswer ? ANSWERS[(ANSWERS.indexOf(thrown) + 1 + Math.floor(dice.look * 3)) % 4] : thrown;
    lastAnswer = answer;
    const d: Dice = { ...dice, stomps: answer === "again" ? 2 : 1, quick: answer === "kip" || answer === "kipBack" || (answer === "again" && dice.quick), back: answer === "kipBack" || (answer === "again" && dice.quick && dice.back) };
    // (It takes in that it is down a moment — long enough for the one down to see it coming and cover up in time.)
    // (NO DEAD STRETCH, round 15, Arthur: "every 1.5 seconds something should happen": a short look, then in.)
    attacker.actions.push({ move: "wait", params: { seconds: Math.round(100 * (0.35 + 0.2 * d.look)) / 100 }, sync: { mark: "start", at: `${defender.id}.getHit${defender.hits}.ready` } });
    // NEVER ALWAYS A STOMP (round 12, Arthur: "it should not be always a stomp... the beta user will see that
    // pattern"): the attack on the one down is a stomp, a hop-and-punch down or a lift-and-slam (the moves
    // the library has), never the same kind as the last one in this fight; sometimes two in a row.
    const kinds = FLOOR_ATTACKS.filter((m) => LIBRARY[m] !== undefined);
    const fresh = kinds.filter((m) => m !== lastFloor);
    const pick = (u: number) => (fresh.length ? fresh : kinds)[Math.min((fresh.length ? fresh : kinds).length - 1, Math.floor(u * (fresh.length ? fresh : kinds).length))];
    // ABOUT A THIRD EACH (round 16, Arthur: "roughly 30% lift and slam, 30% hammer strike, 30% stomp" on someone
    // down): the first attack is any of the three (never the last one's kind); a second attack (now and then) is
    // never another lift-and-slam — so the lift-and-slam is picked a little more often to keep its third.
    const first = d.kind < 0.4 && fresh.includes("liftSlam") ? "liftSlam" : pick(d.kind < 0.4 ? d.kind / 0.4 : (d.kind - 0.4) / 0.6);
    const attacks = d.stomps > 1 && first !== "liftSlam" ? [first, kinds.filter((m) => m !== first && m !== "liftSlam")[0] ?? first] : [first];
    attacks.forEach((move, s) => {
      const g = count(attacker, move);
      attacker.actions.push({ move, params: { target: defender.id, ...(move === "stompDown" ? { size: Math.round(100 * (0.9 + 0.3 * d.size)) / 100 } : {}) }, energy: d.energy[s] });
      defender.actions.push({ move: move === "liftSlam" ? "slammed" : "coverUp", params: { from: attacker.id } });
      attacker.ready = `${attacker.id}.${move}${g}.stomp`;
      lastFloor = move;
    });
    attacker.actions.push({ move: "guard", params: { seconds: Math.round(100 * (0.1 + 0.15 * d.look)) / 100 } });
    const up = d.quick ? "kipUp" : "getUp";
    defender.actions.push({ move: up });
    defender.ready = `${defender.id}.${up}${count(defender, up)}.up`;
    return d.quick && d.back;
  };

  // OPENING (Red vs Blue): they walk up to each other (MEET IN THE MIDDLE: each to its fighting spot,
  // arriving in the guard). Now and then one does a giant stomp first (a dramatic moment; rare) and the
  // other starts coming when the foot slams down. Far apart, now and then the opener dashes in instead.
  const spread = random();
  const opener = random() < 0.5 ? winner : other(winner);
  const stomps = random() < 0.15; // (round 16, Arthur: "open most fights with a dash" — a strong opener; the giant stomp now and then)
  // (Round 13 review, Arthur: a slow-motion, off-timing dash at the start is "negative 10 out of 10": a dash only
  // with room for a real run-up and a full-speed airborne dash — DASH_ROOM heights apart.)
  // DASH MORE OFTEN (round 15, Arthur: "running dash... more commonly — those are cool for fighting"): about one
  // fight in three they start far apart (DASH_ROOM heights and more) and the opener dashes in.
  const dashes = !stomps; // (round 16, Arthur: "energetic fight scenes need to have dash punches": every fight that doesn't open with a giant stomp opens with a dash)
  const gap = dashes ? DASH_ROOM * HEIGHT + Math.round(spread * 200) : 520 + Math.round(spread * 200);
  let last: Fighter | null = null;
  // (Did the last attacker's turn end on a punch or kick — so it marks being back on guard, "strike<k>.done"?)
  let endedOnStrike = true;
  // (PRESS AFTER THE DASH, round 16: the opening dash put them down — the engine did, last time it was tried —
  // so the dasher goes straight in on the floor, never 9 s of standing about while they lie and get up.)
  let openingPress: "on" | "back" | null = null;
  if (dashes) {
    const foe = other(opener), first = `${foe.id}.${foe.hits + 1}`, pressDown = floored.has(first) && !noRoom.has(first);
    opener.actions.push({ move: "dashPunch", params: { target: foe.id }, energy: jitter(opener) });
    opener.strikes += 1;
    foe.hits += 1;
    foe.actions.push({ move: "getHit", params: { from: opener.id, ...(pressDown ? { stayDown: true } : {}) } });
    foe.ready = `${foe.id}.getHit1.ready`;
    opener.ready = `${opener.id}.dashPunch1.stop`;
    if (pressDown) {
      const dice: Dice = { look: random(), stomps: random() < 0.3 ? 2 : 1, size: random(), quick: random() < 0.6, back: random() < 0.6, energy: [jitter(opener), jitter(opener)], kind: random() };
      openingPress = onTheFloor(opener, foe, dice) ? "back" : "on";
    }
    last = opener;
    endedOnStrike = false;
  } else {
    if (stomps) opener.actions.push({ move: "stomp", params: { size: 1 + 0.25 * random() } });
    opener.actions.push({ move: "walk", params: { to: other(opener).id } });
    other(opener).actions.push({ move: "walk", params: { to: opener.id }, ...(stomps ? { sync: { mark: "start", at: `${opener.id}.stomp1.stomp` } } : {}) });
  }

  // EXCHANGES: plenty of them; the engine's damage rule decides when someone is beaten, and the scene is
  // cut to about `seconds` afterwards (makeFightScene).
  const exchanges = Math.ceil(seconds / 1.2) + 4;
  let strikesBack: Fighter | null = openingPress === "back" && dashes ? other(opener) : null, pressOn: Fighter | null = openingPress === "on" ? opener : null;
  for (let i = 0; i < exchanges; i += 1) {
    const phase = Math.min(1, i / exchanges);
    // WHO: a COUNTER (the one just hit hits back) about 4 times in 10, otherwise either one — or the one
    // who just got up off the floor striking straight back.
    const counter = last !== null && random() < 0.4;
    const chosen: Fighter = counter && last ? other(last) : random() < (winner === a ? 1 : -1) * (0.04 + 0.25 * phase) + 0.5 ? a : b;
    // (GO STRAIGHT BACK IN, round 14: the one who just attacked someone on the floor goes straight back in as it
    // gets up — unless the one getting up strikes first.)
    const attacker: Fighter = strikesBack ?? pressOn ?? chosen;
    pressOn = null;
    const defender = other(attacker);
    const strikes = exchange();
    const inFlurry = kinds[kinds.length - 1] === "flurry";
    // WHEN: as soon as the other's guard is back (half the time), or after a short breather; the very
    // first attack waits until the other has walked up (or got its guard back after a dash).
    // (SHORT BREATHERS, round 15, Arthur: "every 1.5 seconds something should happen — 2 seconds tops": the
    // breather is a blink, never a pause.)
    const breather = strikesBack || pressOn || random() < 0.5 ? 0.02 : 0.03 + 0.07 * random();
    // (Striking straight back off the floor: the kip-up lands in the guard and the strike goes straight on.)
    if (!strikesBack) attacker.actions.push({ move: "guard", params: { seconds: breather }, sync: { mark: "start", at: defender.ready } });
    strikesBack = null;
    // (A turn change: it starts once the other is back on guard, on its spot, after its own attack.)
    if (last && last !== attacker && defender.strikes > 0 && endedOnStrike) attacker.actions.push({ move: "guard", params: { seconds: 0.02 }, sync: { mark: "start", at: `${defender.id}.strike${defender.strikes}.done` } });
    endedOnStrike = true;
    // (Every strike's dice are thrown, used or not — a combo cut short by a knock-down too — so a fight
    // planned again with what the engine did goes on the same way.)
    let over = false;
    strikes.forEach((strike, k) => {
      const lastOne = k === strikes.length - 1;
      const blocks = strike.move === "punch" && !(big(strike) && lastOne) && random() < (inFlurry ? 0.65 : defender === winner ? 0.3 : 0.24 - 0.1 * phase);
      // (Most exchanges now end in a kick or a big shot, so each one puts the other down or off balance less often:
      // about as many knock-downs as before, and no long stretches on the floor one after another.)
      const down = !blocks && big(strike) && lastOne && random() < (attacker === winner ? 0.05 + 0.15 * phase : 0.04);
      const off = !down && random() < 0.2, staggers = random() < 0.5, follow = punish(), followDown = random() < 0.25;
      const energy = Math.min(1, jitter(attacker) + (inFlurry && !lastOne ? 0.3 : 0)), followEnergy = jitter(attacker);
      const dice: Dice = { look: random(), stomps: random() < 0.3 ? 2 : 1, size: random(), quick: random() < 0.6, back: random() < 0.6, energy: [jitter(attacker), jitter(attacker)], kind: random() };
      const parries = random() < (inFlurry ? 0.8 : 0.45); // (a flurry is mostly swatted aside: a parry is ready again quicker than a block, so the punches keep coming)
      if (over) return;
      // (A barrage: the other one covers up under it — `barraged`, timed to every punch by the engine — and both
      // are ready again when it is over: the barrager back in its stand, the other straightened up.)
      if (strike.move === "barrage") {
        attacker.actions.push({ ...strike, energy, params: { ...strike.params, target: defender.id } });
        defender.actions.push({ move: "barraged", params: { from: attacker.id } });
        attacker.ready = `${attacker.id}.barrage${count(attacker, "barrage")}.ready`;
        defender.ready = `${defender.id}.barraged${count(defender, "barraged")}.ready`;
        endedOnStrike = false;
        return;
      }
      // DOWN: meant to be (a big last shot), or the engine put it down by itself last time it was tried.
      const key = (f: Fighter) => `${f.id}.${f.hits + 1}`;
      const pressDown = !blocks && (down || floored.has(key(defender))) && !noRoom.has(key(defender));
      // OFF BALANCE: a big last shot meant to stagger or almost fell it (or meant to put it down, with no room).
      const offBalance = lastOne && big(strike) && !blocks && !pressDown && (off || down);
      // (A kick or big shot not meant to put the other down is thrown a little lighter, so the engine doesn't floor
      // it by itself every time: knock-downs stay a highlight, not the whole fight.)
      const thrown = big(strike) && !down && !pressDown ? Math.min(energy, 0.62) : energy;
      land(attacker, defender, strike, thrown, blocks ? (parries ? "parry" : "block") : down ? "knockdown" : offBalance ? (staggers ? "stagger" : "catch") : undefined, pressDown);
      if (pressDown) { over = true; endedOnStrike = false; if (onTheFloor(attacker, defender, dice)) strikesBack = defender; else pressOn = attacker; return; }
      if (!offBalance) return;
      // OFF BALANCE: straight in after it, no guard between.
      const finish = followDown && !noRoom.has(key(defender));
      const finishes = finish || floored.has(key(defender));
      land(attacker, defender, follow, followEnergy, finish ? "knockdown" : undefined, finishes && !noRoom.has(key(defender)));
      if (finishes && !noRoom.has(`${defender.id}.${defender.hits}`)) { endedOnStrike = false; if (onTheFloor(attacker, defender, dice)) strikesBack = defender; else pressOn = attacker; }
    });
    last = attacker;
  }

  const speed: MoveSpeed = random() < 0.5 ? "fast" : "normal";
  const characters: CharacterPlan[] = [
    { id: "a", name: "Red", x: 960 - gap / 2, facing: "right", look: lookOf(colorA), style: pick(styles), speed, energy: energyA, ...guardOf(look), actions: a.actions },
    { id: "b", name: "Blue", x: 960 + gap / 2, facing: "left", look: lookOf(colorB), style: pick(styles), speed, energy: energyB, ...guardOf(look), actions: b.actions },
  ];
  return { id: `fight-${seed}`, title: `Energetic fight #${seed}`, height: HEIGHT, groundY: 900, characters };
}

// The fight, cut to about `seconds`: the engine builds the whole thing once; if someone is knocked out
// (fully beaten: mark "<id>.out"), the fight ends there; otherwise it ends after the last exchange that
// finishes by `seconds`. The winner then does a victory stomp and gets its breath back.
export function finishedFightPlan(seed: number, seconds = 30, look: FightLook = {}, stageWidth?: number, cutAt?: number): ScenePlan {
  // (Tried out only a little past `seconds`: a knock-out just after it still ends the fight. Tried on the
  // page it will be shown on: how much room there is to fall decides who can be knocked down. A knock-down
  // the engine had no room for — it almost fell instead — is pressed standing; a hit the engine made a
  // knock-down by itself is pressed on the floor: planned again with what the engine did, up to 4 times.)
  const noRoom = new Set<string>(), floored = new Set<string>();
  const tryOut = (p: ScenePlan) => planToScene({ ...p, until: seconds + 6, ...(stageWidth !== undefined ? { stageWidth } : {}) }, LIBRARY);
  let full = fightPlan(seed, seconds, look, { floored, noRoom });
  let scene = tryOut(full);
  for (let tries = 0; tries < 7; tries += 1) {
    let changed = false;
    for (const c of full.characters) {
      let k = 0;
      for (const action of c.actions) {
        if (action.move !== "getHit") continue;
        const name = `${c.id}.getHit${(k += 1)}`, hit = `${c.id}.${k}`;
        if (scene.marks[`${name}.hit`] === undefined || scene.marks[`${name}.out`] !== undefined) continue;
        const down = scene.marks[`${name}.knockdown`] !== undefined;
        if (action.params?.stayDown && !down && !noRoom.has(hit)) { noRoom.add(hit); changed = true; }
        if (!action.params?.stayDown && down && !noRoom.has(hit) && !floored.has(hit)) { floored.add(hit); changed = true; }
      }
    }
    if (!changed) break;
    full = fightPlan(seed, seconds, look, { floored, noRoom });
    scene = tryOut(full);
  }
  const marks = scene.marks;
  const out = (["a", "b"] as const).find((id) => marks[`${id}.out`] !== undefined && marks[`${id}.out`] <= seconds + 6);
  // (NO DEAD END: on points, a long quiet stretch across the cut — someone getting up, closing in — doesn't end the
  // fight early: it ends on the first strike after it instead, up to a few seconds past.)
  const hitsAt = Object.entries(marks).filter(([k]) => /^\w\.(strike|barrage)\d+\.hit$/.test(k)).map(([, t]) => t);
  const before = Math.max(0, ...hitsAt.filter((t) => t <= seconds - 3)), after = Math.min(...hitsAt.filter((t) => t > seconds - 3));
  let endAt = out ? marks[`${out}.out`] : before < seconds - 6 && after <= seconds + 4 ? after : seconds - 3;
  // Keep each fighter's actions up to the end: strikes that land by then, hits taken by then. (A press on
  // the floor that has begun is kept whole: the stomps, the covering up and the getting up.)
  // (A press on the floor takes a few seconds: one is only begun if it starts by FLOOR_TIME before the end.)
  const FLOOR_TIME = 5;
  const pressed = new Set<string>();
  for (const c of full.characters) {
    let k = 0;
    for (const action of c.actions) if (action.move === "getHit" && (k += 1) && action.params?.stayDown) { pressed.add(`${c.id}.${k}`); pressed.add(`${String(action.params.from)}.strike${k}`); }
  }
  const keep = (c: CharacterPlan) => {
    const kept: Action[] = [];
    let strikes = 0, hits = 0, stomps = 0, barrages = 0, barraged = 0;
    const covers: Record<string, number> = {};
    for (const action of c.actions) {
      // (A barrage is kept whole if its last punch lands by the end, and so is the other's covering up under it.)
      if (action.move === "barrage" || action.move === "barraged") {
        const t = marks[action.move === "barrage" ? `${c.id}.barrage${(barrages += 1)}.hit` : `${String(action.params?.from)}.barrage${(barraged += 1)}.hit`];
        if (t === undefined || t > endAt + 1e-6) break;
      } else if (action.move === "punch" || action.move === "kick" || action.move === "dashPunch") {
        const t = marks[`${c.id}.strike${strikes + 1}.hit`];
        if (t === undefined || t > endAt - (pressed.has(`${c.id}.strike${strikes + 1}`) ? FLOOR_TIME : 0) + 1e-6) break;
        strikes += 1;
      } else if (action.move === "getHit") {
        const from = String(action.params?.from);
        const opponent = full.characters.find((o) => o.id === from)!;
        const k = hits + 1;
        const t = marks[`${opponent.id}.strike${k}.hit`];
        if (t === undefined || t > endAt - (pressed.has(`${c.id}.${k}`) ? FLOOR_TIME : 0) + 1e-6) break;
        hits += 1;
      } else if (FLOOR_ATTACKS.includes(action.move)) {
        if (marks[`${c.id}.groundHit${(stomps += 1)}`] === undefined) break;
      } else if (action.move === "coverUp" || action.move === "slammed") {
        const from = String(action.params?.from);
        if (marks[`${from}.groundHit${(covers[from] = (covers[from] ?? 0) + 1)}`] === undefined) break;
      } else if (action.move === "wait" && action.sync) {
        if (marks[action.sync.at] === undefined) break;
      } else if (action.sync && (marks[action.sync.at] === undefined || marks[action.sync.at] > endAt + 1e-6)) break;
      kept.push(action);
    }
    // Drop a trailing guard that would start a new exchange (not the step back after a stomp).
    while (kept.length && kept[kept.length - 1].move === "guard" && !FLOOR_ATTACKS.includes(kept[kept.length - 2]?.move ?? "")) kept.pop();
    return kept;
  };
  // (Each cut on its own, one fighter may keep covering up under a barrage the other no longer throws: cut there.)
  const matched = (cs: CharacterPlan[]) => cs.map((c) => {
    let n = 0;
    const theirs = cs.find((o) => o.id !== c.id)?.actions.filter((x) => x.move === "barrage").length ?? 0;
    const at = c.actions.findIndex((x) => x.move === "barraged" && (n += 1) > theirs);
    return at < 0 ? c : { ...c, actions: c.actions.slice(0, at) };
  });
  let characters = matched(full.characters.map((c) => ({ ...c, actions: keep(c) })));
  // (Still ending well short of `seconds` — a press on the floor that didn't fit — the cut moves a few seconds on.)
  const lastStrike = () => Math.max(0, ...characters.map((c) => marks[`${c.id}.strike${c.actions.filter((x) => x.move === "punch" || x.move === "kick" || x.move === "dashPunch").length}.hit`] ?? 0));
  if (!out && lastStrike() < seconds - 7) { endAt = seconds + 3; characters = matched(full.characters.map((c) => ({ ...c, actions: keep(c) }))); }
  // Who won: the one knocked out lost; otherwise the one the engine says is hurt more (after the cut).
  const hitsOn = (c: CharacterPlan) => c.actions.filter((x) => x.move === "getHit").length;
  // NO PORTAL PUNCHES, EVER (round 16, Arthur: "he got hit before the hit even happened"): makeFightScene checks
  // the finished fight; a strike the engine couldn't bring within reach is never shown — the fight ends just before
  // it (`cutAt`).
  if (cutAt !== undefined && cutAt < endAt) { endAt = cutAt; characters = matched(full.characters.map((c) => ({ ...c, actions: keep(c) }))); }
  const cut = planToScene({ ...full, characters, ...(stageWidth !== undefined ? { stageWidth } : {}) }, LIBRARY).hurt;
  const loser = out ?? ((cut.a ?? 0) >= (cut.b ?? 0) ? "a" : "b");
  const winner = characters.find((c) => c.id !== loser)!;
  const lastHit = loser === "a" ? hitsOn(characters[0]) : hitsOn(characters[1]);
  if (lastHit > 0) winner.actions.push({ move: "guard", params: { seconds: 0.4 }, sync: { mark: "start", at: `${loser}.getHit${lastHit}.${out ? "out" : "ready"}` } });
  // A knock-out ends with the winner's victory stomp (the dramatic moment); on points, it just stays on guard.
  if (out) winner.actions.push({ move: "stomp", params: { size: 1.3 } }, { move: "stand", params: { seconds: 1.2 } });
  else winner.actions.push({ move: "guard", params: { seconds: 1.2 } });
  return { ...full, characters, title: `Energetic fight: ${out ? `${winner.name} wins by knock-out` : `${winner.name} wins on points`}` };
}

// The first landed strike whose fist or foot is nowhere near the other body (more than about a third of a height away
// at the moment it lands, a picture either side), or undefined.
function portalIn(scene: ReturnType<typeof planToScene>): number | undefined {
  const built = buildScene(scene, 24), ids = scene.characters.map((c) => c.id), H = scene.characters[0]?.height ?? 300;
  type P = { x: number; y: number };
  const seg = (p: P, a: P, b: P) => { const dx = b.x - a.x, dy = b.y - a.y, L = dx * dx + dy * dy, t = L ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / L)) : 0; return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy); };
  const hits = Object.entries(scene.marks).filter(([n]) => /^\w+\.(strike\d+\.hit|barrage\d+\.hit\d+|dashPunch\d+\.hit)$/.test(n)).sort((x, y) => x[1] - y[1]);
  for (const [name, t] of hits) {
    const ai = ids.indexOf(name.split(".")[0]);
    if (ai < 0 || ids.length !== 2 || t < 8) continue; // (the opening is never cut: a fight needs its start)
    const f = Math.min(built.frames.length - 1, Math.round(t * 24));
    const reach = Math.min(...[f - 1, f, f + 1].filter((g) => g >= 0 && g < built.frames.length).map((g) => {
      const A = built.frames[g][ai].skeleton, D = built.frames[g][1 - ai].skeleton, r = built.frames[g][1 - ai].headRadius;
      const body = (p: P) => Math.min(Math.hypot(p.x - D.head.x, p.y - D.head.y) - r, seg(p, D.neck, D.hip), seg(p, D.neck, D.lElbow), seg(p, D.neck, D.rElbow), seg(p, D.lElbow, D.lHand), seg(p, D.rElbow, D.rHand), seg(p, D.hip, D.lKnee), seg(p, D.hip, D.rKnee));
      return Math.min(body(A.lHand), body(A.rHand), body(A.lFoot), body(A.rFoot));
    }));
    if (reach > 0.3 * H) return t;
  }
  return undefined;
}

export function makeFightScene(seed: number, look: FightLook = {}, stageWidth?: number, seconds = 30): ReturnType<typeof planToScene> {
  // (No re-tries: every fight the director writes comes out with each reaction exactly at its hit, on
  // any page — the engine's rules see to it.)
  const build = (cutAt?: number) => { const p = finishedFightPlan(seed, seconds, look, stageWidth, cutAt); return stageWidth === undefined ? planToScene(p, LIBRARY) : fitPlanToPage(p, LIBRARY, stageWidth); };
  let scene = build();
  // (NO PORTAL PUNCHES: a strike that doesn't really reach — the fight ends just before it; up to twice.)
  for (let tries = 0; tries < 2; tries += 1) {
    const at = portalIn(scene);
    if (at === undefined) break;
    scene = build(at - 0.05);
  }
  return scene;
}

// DAD'S TEST (round 7), written exactly as an AI director would write it: "Blue punches three times; the
// stick figure on the left (Red) blocks the first two; the third one hits, he gets beat up and almost
// falls down but catches himself." Only WHAT and WHEN: the engine does the rest.
export function blockBlockHitPlan(look: FightLook = {}): ScenePlan {
  const [colorA, colorB] = look.colors ?? [RED, BLUE];
  const lookOf = (color: string): Partial<CharacterStyle> => ({ color, headFilled: !look.hollowHead, neck: look.neck === true });
  return {
    id: "block-block-hit", title: "Blue punches 3 times: Red blocks 2, the 3rd hits", height: 300, groundY: 900,
    characters: [
      { id: "a", name: "Red", x: 760, facing: "right", look: lookOf(colorA), style: "natural", energy: 0.6, actions: [
        { move: "walk", params: { to: "b" } },
        { move: "getHit", params: { from: "b", result: "block" } },
        { move: "getHit", params: { from: "b", result: "block" } },
        { move: "getHit", params: { from: "b", result: "catch" } },
      ] },
      { id: "b", name: "Blue", x: 1160, facing: "left", look: lookOf(colorB), style: "angry", energy: 0.8, actions: [
        { move: "walk", params: { to: "a" } },
        { move: "guard", params: { seconds: 0.3 } },
        { move: "punch", params: { target: "a", technique: "straight", hand: "front" } },
        { move: "punch", params: { target: "a", technique: "straight", hand: "back" } },
        { move: "punch", params: { target: "a", technique: "power", hand: "back" } },
      ] },
    ],
  };
}
export function makeBlockBlockHitScene(look: FightLook = {}, stageWidth?: number): ReturnType<typeof planToScene> {
  const p = blockBlockHitPlan(look);
  return stageWidth === undefined ? planToScene(p, LIBRARY) : fitPlanToPage(p, LIBRARY, stageWidth);
}

// Every reaction starts exactly when its hit lands.
export function reactionsOnTime(scene: { marks: Record<string, number> }): boolean {
  return Object.entries(scene.marks).every(([name, t]) => {
    const m = /^(\w)\.getHit(\d+)\.hit$/.exec(name);
    if (!m) return true;
    const strike = scene.marks[`${m[1] === "a" ? "b" : "a"}.strike${m[2]}.hit`];
    return strike !== undefined && Math.abs(strike - t) < 1e-3;
  });
}

// (Kept for the look of the review panel: the default figure color is the panel's; fights use red and blue.)
export const FIGHT_DEFAULT_COLOR = DEFAULT_STYLE.color;
