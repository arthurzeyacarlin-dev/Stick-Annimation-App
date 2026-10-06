import { LIBRARY } from "./library.ts";
import { CLASH_SWELL, BREAK_AFTER, streamTravel, type Element } from "./elements.ts";
import { fitPlanToPage, planToScene, type Action, type CharacterPlan, type ScenePlan } from "./plan.ts";
import type { MoveStyle } from "./styles.ts";

// SPEC-0017 Phase 2C extras (review only): the ELEMENTAL FIGHT director (Arthur, 2026-10-06: "the engine only learned
// one fight animation with elements... It needs to learn a bit more about fighting with elements, so it has an
// understanding: this does this, he does that"). Like the energetic fight director (fightScene.ts) it only decides
// WHAT happens and WHEN, from a random seed and the two fighters' powers; the engine makes every move and every
// effect, and elements.ts decides what the powers do to each other when they meet (a laser cracks and shatters an
// ice wall, a beam zaps crystals mid-air, two beams clash). Each seed is a fight nobody wrote. ITS RULES:
// - EVERY POWER ATTACK GETS AN ANSWER within about half a second of reaching him: a BLOCK (a wall of ice, a water
//   shield, raised as the other one charges), a DODGE (jump back out of the way), a COUNTER (zap the crystals
//   mid-air with a beam) or a real HIT (knocked back; knocked down only by a big one).
// - ENERGETIC: it opens with a strong power, something happens every second or so, powers are mixed with the body
//   (dash in and punch, kick, block), BOTH attack and both defend, the one who just answered goes next (this does
//   this, he answers with that), nobody stands about or walks back and forth, everyone stays on the page.
// - IT ENDS CLEARLY: the big CLASH — both fire at once, the streams meet in the middle and push back and forth, the
//   winner's push wins, it bursts and knocks both down — and one gets up first. (Two figures without a beam each:
//   a big power hit that knocks the other down.)

// What each element can do (the move that does it, if the library has it): a BEAM (a stream at someone; also used to
// zap things out of the air), a VOLLEY (things thrown), a GROUND attack (along the floor to someone), a WALL (a block).
type Kit = { beam?: string; volley?: string; ground?: string; wall?: string };
const KITS: Record<Element, Kit> = {
  laser: { beam: "laserEyes" },
  ice: { beam: "iceBlast", volley: "iceThrow", ground: "iceMountain", wall: "iceMountain" },
  fire: { beam: "fireBlast" },
  water: { beam: "waterBlast", wall: "waterShield" },
};
const kitOf = (e: Element): Kit => Object.fromEntries(Object.entries(KITS[e]).filter(([, move]) => LIBRARY[move] !== undefined)) as Kit;
// A power's name (as a user or the AI says it) → its element.
export function elementNamed(name: string): Element | undefined {
  const n = name.toLowerCase();
  if (n.includes("laser")) return "laser";
  if (n.includes("ice") || n.includes("frost")) return "ice";
  if (n.includes("fire") || n.includes("flame")) return "fire";
  if (n.includes("water")) return "water";
  return undefined;
}

const H = 300;
const GROUND = 900;
const RED = "#e02424";
const BLUE = "#2563eb";
// Where they start: far enough apart for powers, near enough that the fight stays in the middle of the page.
const GAP = 3.1;
// An ice wall rises this far in front of its maker (x height): between him and what is coming.
const WALL_AHEAD = 0.95;
// After a beam's `end` mark, how long its body takes before the next move can start (the fire blast's arms come down
// first; laser eyes go straight on).
const AFTER_END: Record<string, number> = { laserEyes: 0, fireBlast: 0.4, iceBlast: 0.4, waterBlast: 0.4 };
// How much later than `release + seconds` a beam's `end` mark comes (the blasts' hold starts after their recoil).
const END_LAG: Record<string, number> = { laserEyes: 0, fireBlast: 0.15, iceBlast: 0.15, waterBlast: 0.15 };

type Fighter = { id: "red" | "blue"; name: string; element: Element; kit: Kit; actions: Action[]; n: Record<string, number>; strikes: number; ready: string | null; lastStrike: boolean };
type Cue = { at: string; offset: number } | null;

// (`middle`: the stage x the fight starts round — given, the plan is made straight away; left out, the fight is tried
// out once and moved so that where they go is centred on the page. `center: false`: neither, the page middle.)
export type ElementalFightOptions = { seed: number; seconds?: number; red?: string; blue?: string; middle?: number; center?: boolean };

// (`fixes`, filled in when a try-out shows the engine needed them — fightScene.ts does the same: `dashWait`, the one
// dashed at strikes back only once the dash has stopped (a counter that came while the dasher was still skidding was
// answered late); `knockOnRed`, both knock-backs of the clash timed from Red's moments (the one built first), so they
// land on the very same picture.)
// (`noCounter`: still answered late even so — the engine couldn't settle it — the counter is left out: the dash, then
// both back off.)
type Fixes = { dashWait?: boolean; knockOnRed?: boolean; noCounter?: boolean };

export function elementalFightPlan(options: ElementalFightOptions, fixes: Fixes = {}): ScenePlan {
  const seed = options.seed, seconds = options.seconds ?? 10;
  const redEl = elementNamed(options.red ?? "laserEyes") ?? "laser", blueEl = elementNamed(options.blue ?? "ice") ?? "ice";
  let state = (Math.floor(Math.abs(seed)) * 2654435761) % 2147483647 || 1;
  const random = () => (state = (state * 48271) % 2147483647) / 2147483647;
  for (let i = 0; i < 4; i += 1) random();
  const pick = <T,>(list: readonly T[]) => list[Math.floor(random() * list.length)];
  const fighter = (id: "red" | "blue", element: Element): Fighter => ({ id, name: id === "red" ? "Red" : "Blue", element, kit: kitOf(element), actions: [], n: {}, strikes: 0, ready: null, lastStrike: false });
  const red = fighter("red", redEl), blue = fighter("blue", blueEl);
  const other = (f: Fighter) => (f === red ? blue : red);
  // Add an action; its marks are "<id>.<move><k>.<mark>".
  const add = (f: Fighter, move: string, params: Record<string, unknown>, extra: Partial<Action> = {}): string => {
    const k = (f.n[move] = (f.n[move] ?? 0) + 1);
    f.actions.push({ move, params, ...extra });
    if (move === "punch" || move === "kick" || move === "dashPunch") f.strikes += 1;
    return `${f.id}.${move}${k}`;
  };
  // Start an exchange at a cue (a moment in the other's actions), on guard.
  const begin = (f: Fighter, cue: Cue) => { f.actions.push({ move: "guard", params: { seconds: 0.02 }, ...(cue ? { sync: { mark: "start", at: cue.at, offset: cue.offset } } : {}) }); };
  const hitMark = (f: Fighter) => `${f.id}.getHit${(f.n.getHit ?? 0)}.ready`;
  const travel = (e: Element, gapH: number) => streamTravel(e, gapH * H, H);
  // A beam's `seconds` so that it ends `after` seconds after it comes out.
  const beamFor = (f: Fighter, after: number) => Math.max(0.4, after - (END_LAG[f.kit.beam!] ?? 0));

  // ---- THE EXCHANGES: "this does this, he answers with that" ------------------------------------------------
  type Exchange = { kind: string; can: (x: Fighter, y: Fighter) => boolean; run: (x: Fighter, y: Fighter, cue: Cue) => Cue };
  const EXCHANGES: Exchange[] = [
    // A BEAM, BLOCKED: the other raises a wall as it charges; a laser or fire on an ice wall cracks it and, held on it,
    // shatters it (steam where hot meets cold); on a water shield it steams and the shield holds.
    { kind: "beamBlock", can: (x, y) => !!x.kit.beam && !!y.kit.wall, run: (x, y, cue) => {
      begin(x, cue);
      const ice = y.kit.wall === "iceMountain";
      // (it pours long enough to get there — fire and water fly slower than a laser — and to keep hitting a moment)
      const hold = ice ? travel(x.element, GAP - WALL_AHEAD) + BREAK_AFTER[x.element] + 0.06 : travel(x.element, GAP - 0.7) + 0.5 + 0.3 * random();
      const b = add(x, x.kit.beam!, { target: y.id, seconds: beamFor(x, hold) });
      if (ice) {
        const w = add(y, "iceMountain", { distance: WALL_AHEAD * H, shape: "mountain", seconds: 0.3 }, { sync: { mark: "release", at: `${b}.release`, offset: -0.3 } });
        return { at: `${w}.shatter`, offset: 0.02 };
      }
      const w = add(y, "waterShield", { seconds: hold + 0.5 }, { sync: { mark: "hold", at: `${b}.release`, offset: -0.25 } });
      return { at: `${w}.release`, offset: 0 };
    } },
    // A BEAM THAT HITS: knocked back hard (it staggers, or almost falls).
    { kind: "beamHit", can: (x) => !!x.kit.beam, run: (x, y, cue) => {
      begin(x, cue);
      const b = add(x, x.kit.beam!, { target: y.id, seconds: beamFor(x, travel(x.element, GAP) + 0.45 + 0.15 * random()) });
      const big = random() < 0.4;
      add(y, "getHit", { power: big ? 1.2 : 0.9, result: big ? "catch" : "stagger" }, { sync: { mark: "hit", at: `${b}.release`, offset: travel(x.element, GAP) } });
      return { at: hitMark(y), offset: 0 };
    } },
    // CRYSTALS, ZAPPED (a counter): thrown at someone with a beam, who zaps them out of the air as they come (they
    // shatter mid-air, with a puff of steam); one more is thrown at once, and that one he dodges (jumps back: it smashes
    // into the ground where he stood), blocks or takes.
    { kind: "volleyZap", can: (x, y) => !!x.kit.volley && !!y.kit.beam, run: (x, y, cue) => {
      begin(x, cue);
      const v1 = add(x, x.kit.volley!, { target: y.id, count: 2 });
      add(y, y.kit.beam!, { target: x.id, seconds: 0.4, counter: true }, { sync: { mark: "release", at: `${v1}.release`, offset: 0.16 } });
      const v2 = add(x, x.kit.volley!, { target: y.id, count: 1 });
      return dodge(y, `${v2}.hit`, ["jump", "jump", "block"]);
    } },
    // CRYSTALS, BLOCKED by a wall (they shatter on it), or DODGED, or they HIT.
    { kind: "volley", can: (x) => !!x.kit.volley, run: (x, y, cue) => {
      begin(x, cue);
      const v = add(x, x.kit.volley!, { target: y.id, count: 2 + Math.floor(random() * 2) });
      if (y.kit.wall === "waterShield" && random() < 0.5) {
        const w = add(y, "waterShield", { seconds: 1.1 }, { sync: { mark: "hold", at: `${v}.release`, offset: 0 } });
        return { at: `${w}.release`, offset: 0 };
      }
      return dodge(y, `${v}.hit`, ["jump", "block", "hit"]);
    } },
    // ICE ALONG THE GROUND: spikes run along the floor to him; he jumps back out of the way just as they reach him,
    // and goes in as they shatter.
    { kind: "groundJump", can: (x) => !!x.kit.ground, run: (x, y, cue) => {
      begin(x, cue);
      const m = add(x, x.kit.ground!, { target: y.id, seconds: 0.3 });
      add(y, "jump", { distance: -0.45 * H, height: 0.4 }, { sync: { mark: "takeoff", at: `${m}.reach`, offset: -0.14 } });
      return { at: `${m}.shatter`, offset: -0.05 };
    } },
  ];
  // The answer to something thrown: jump back, block it (forearms up), or take it.
  const dodge = (y: Fighter, arrives: string, ways: string[]): Cue => {
    const way = pick(ways);
    if (way === "jump") {
      const j = add(y, "jump", { distance: -0.4 * H, height: 0.34 }, { sync: { mark: "takeoff", at: arrives, offset: -0.16 } });
      return { at: `${j}.land`, offset: 0 };
    }
    add(y, "getHit", way === "block" ? { power: 0.5, result: "block" } : { power: 0.8 }, { sync: { mark: "hit", at: arrives, offset: 0 } });
    return { at: hitMark(y), offset: 0 };
  };

  // CLOSE IN: one dashes in with a dash punch (the other blocks it or takes it), then they trade 2-3 strikes —
  // both attack, both defend — and both jump back out to power range.
  const P = (technique: string, hand: "front" | "back"): Action => ({ move: "punch", params: { technique, hand } });
  const K = (height: string): Action => ({ move: "kick", params: { height } });
  // (Close in, the strikes land but never floor anyone — a block, a parry, a flinch or a stagger: the knock-down is
  // kept for the end. Strikes are thrown a little lighter than full power.)
  const land = (a: Fighter, d: Fighter, strike: Action, result?: string) => {
    // (a turn change: it waits for the other to be back on guard after its own strike)
    if (d.ready) a.actions.push({ move: "guard", params: { seconds: 0.02 }, sync: { mark: "start", at: d.ready } });
    if (d.lastStrike && d.strikes > 0) a.actions.push({ move: "guard", params: { seconds: 0.02 }, sync: { mark: "start", at: `${d.id}.strike${d.strikes}.done` } });
    // (a dash at full tilt stays at normal speed: faster, its fist would jump too far between two pictures at 8 fps)
    add(a, strike.move, { ...strike.params, target: d.id }, { energy: Math.round(100 * (0.55 + 0.1 * random())) / 100, ...(strike.move === "dashPunch" ? { speed: "normal" as const } : {}) });
    const big = strike.move !== "punch" || strike.params?.technique !== "straight";
    if (result === undefined) result = big ? "stagger" : undefined;
    a.lastStrike = strike.move !== "dashPunch";
    d.lastStrike = false;
    add(d, "getHit", { from: a.id, ...(result ? { result } : {}) });
    d.ready = hitMark(d);
  };
  const closeIn = (x: Fighter, y: Fighter, cue: Cue): Cue => {
    begin(x, cue);
    x.actions.push({ move: "guard", params: { seconds: 0.02 } }); // (a dash wants a guard just before it: then it runs up)
    y.ready = null; x.ready = null;
    // the dash punch (blocked, or it lands) ...
    land(x, y, { move: "dashPunch", params: {} }, random() < 0.5 ? "block" : "stagger");
    if (fixes.dashWait) x.ready = `${x.id}.dashPunch${x.n.dashPunch}.stop`;
    // ... and the other strikes straight back (it is blocked or parried, or it lands)
    const strikes = [P("straight", "front"), P("power", "back"), K("mid"), K("high"), P("uppercut", "back"), P("overhand", "front")];
    const counter = pick(strikes), result = random() < 0.45 ? pick(["block", "parry"]) : undefined;
    if (!fixes.noCounter) land(y, x, counter, result);
    // BACK OFF: both jump back out to power range together, the moment the last one hit has its guard back.
    // (each as soon as it can: the one hit once its guard is back, the other just after it; the end starts when both
    // have landed)
    const j = add(x, "jump", { distance: -0.8 * H, height: 0.3 }, { sync: { mark: "start", at: hitMark(x), offset: 0.02 } });
    const j2 = add(y, "jump", { distance: -0.8 * H, height: 0.3 }, { sync: { mark: "takeoff", at: `${j}.takeoff`, offset: 0.04 } });
    red.lastStrike = blue.lastStrike = false; red.ready = blue.ready = null;
    return { at: `${j2}.land`, offset: 0.02 };
  };

  // THE END: the big CLASH — both fire at each other at once; the winner's push wins; it bursts; both are knocked down
  // and one (the winner) gets up first. (Without two beams: a big beam hit knocks the other down.)
  const finale = (cue: Cue) => {
    const winner = random() < 0.5 ? red : blue, loser = other(winner);
    if (red.kit.beam && blue.kit.beam) {
      begin(red, cue); begin(blue, cue);
      const S = 1.1 + 0.3 * random();
      // (the side whose body needs longer after its `end` — a blast's arms coming down — ends first: the burst waits
      // for it, so both are knocked back the moment it bursts)
      const slow = (AFTER_END[red.kit.beam] ?? 0) >= (AFTER_END[blue.kit.beam] ?? 0) ? red : blue, fast = other(slow);
      const bs = add(slow, slow.kit.beam!, { target: fast.id, seconds: beamFor(slow, S), ...(slow === winner ? { win: true } : {}) }, { style: "natural" });
      // (a laser goes on a moment longer than the blast — its body is free at once after; two blasts end together)
      const lag = (AFTER_END[fast.kit.beam!] ?? 0) > 0 ? 0 : 0.25;
      add(fast, fast.kit.beam!, { target: slow.id, seconds: beamFor(fast, S + lag), ...(fast === winner ? { win: true } : {}) }, { style: "natural", sync: { mark: "release", at: `${bs}.release`, offset: 0 } });
      const burst = { at: `${bs}.end`, offset: CLASH_SWELL };
      if (fixes.knockOnRed) {
        // (Red's knock-back from its own beam's end; Blue's at Red's knock-back)
        const k = (red.n.getHit ?? 0) + 1;
        const own = red === slow ? burst : { at: `red.${red.kit.beam}${red.n[red.kit.beam!]}.end`, offset: CLASH_SWELL - lag };
        add(red, "getHit", red === loser ? { power: 1.15, result: "knockdown", seconds: 1.2 } : { power: 1.05, result: "knockdown" }, { sync: { mark: "hit", at: own.at, offset: own.offset } });
        add(blue, "getHit", blue === loser ? { power: 1.15, result: "knockdown", seconds: 1.2 } : { power: 1.05, result: "knockdown" }, { sync: { mark: "hit", at: `red.getHit${k}.hit`, offset: 0 } });
        return;
      }
      // (both knocked down by the burst; the loser lies there a moment longer: the winner is up first)
      // (power: how much it hurts — a knock-down, never a knock-out)
      add(loser, "getHit", { power: 1.15, result: "knockdown", seconds: 1.2 }, { sync: { mark: "hit", at: burst.at, offset: burst.offset } });
      add(winner, "getHit", { power: 1.05, result: "knockdown" }, { sync: { mark: "hit", at: burst.at, offset: burst.offset } });
      return;
    }
    const x = winner.kit.beam ? winner : loser.kit.beam ? loser : winner, y = other(x);
    begin(x, cue);
    const b = add(x, x.kit.beam ?? x.kit.volley ?? "punch", { target: y.id, seconds: beamFor(x, 0.6) });
    add(y, "getHit", { power: 1.15, result: "knockdown" }, { sync: { mark: "hit", at: `${b}.release`, offset: travel(x.element, GAP) } });
  };

  // ---- THE FIGHT ---------------------------------------------------------------------------------------------
  // OPEN WITH A STRONG POWER (whoever has the strongest opener; a coin toss between equals), then a few power
  // exchanges — the one who just answered goes next, never the same kind twice running — a close fight, and the end.
  const opener = random() < 0.5 ? red : blue;
  const openers = EXCHANGES.filter((e) => e.kind !== "volleyZap" && e.can(opener, other(opener)));
  const middleCount = Math.max(1, Math.min(4, Math.round((seconds - 8) / 1.8)));
  let cue: Cue = null, x = opener, last = "";
  const done: string[] = [];
  for (let i = 0; i < 1 + middleCount; i += 1) {
    const y = other(x);
    const options = (i === 0 ? openers : EXCHANGES.filter((e) => e.can(x, y))).filter((e) => e.kind !== last && !(done.includes(e.kind) && done.length < 3));
    const choices = options.length ? options : EXCHANGES.filter((e) => e.can(x, y));
    if (!choices.length) { x = y; continue; }
    // (a block and a counter are the most fun to watch: a bit more likely)
    const weight = (e: Exchange) => (e.kind === "beamBlock" || e.kind === "volleyZap" ? 2 : e.kind === "groundJump" ? 1.6 : 1);
    let r = random() * choices.reduce((s, e) => s + weight(e), 0);
    const chosen = choices.find((e) => (r -= weight(e)) <= 0) ?? choices[0];
    cue = chosen.run(x, y, cue);
    done.push(chosen.kind); last = chosen.kind;
    // (whoever answered goes next — after a jump back from the ground spikes he goes straight in: the close fight)
    x = y;
    if (chosen.kind === "groundJump" && i >= 1) break;
  }
  if (seconds >= 7.5) cue = closeIn(x, other(x), cue);
  finale(cue);

  const styles: MoveStyle[] = ["angry", "natural", "angry"];
  const look = (color: string) => ({ color, headFilled: true });
  const characters: CharacterPlan[] = [
    { id: "red", name: `Red (${redEl})`, x: 960 - (GAP * H) / 2, facing: "right", look: look(RED), style: pick(styles), speed: "fast", energy: 0.8 + 0.15 * random(), actions: red.actions },
    { id: "blue", name: `Blue (${blueEl})`, x: 960 + (GAP * H) / 2, facing: "left", look: look(BLUE), style: pick(styles), speed: "fast", energy: 0.8 + 0.15 * random(), actions: blue.actions },
  ];
  const plan: ScenePlan = { id: `elemental-${redEl}-${blueEl}-${seed}`, title: `Elemental fight: ${redEl} vs ${blueEl} #${seed}`, height: H, groundY: GROUND, characters };
  // EVERYONE STAYS ON THE PAGE: the fight drifts (jumps back, knock-backs, a dash in), so it is tried out once and moved
  // so that where they go is centred on the page.
  if (options.middle !== undefined) return { ...plan, characters: characters.map((c) => ({ ...c, x: c.x + options.middle! - 960 })) };
  if (options.center === false) return plan;
  const tried = planToScene(plan, LIBRARY);
  // (what the try-out shows the engine needed: planned again with the fixes)
  const late = Object.entries(tried.marks).some(([k, t]) => {
    const m = /^(\w+)\.strike(\d+)\.hit$/.exec(k);
    if (!m) return false;
    const them = m[1] === "red" ? blue : red;
    const theirs = them.actions.filter((a) => a.move === "getHit").map((a, n) => ({ from: a.params?.from, n: n + 1 }));
    const mine = theirs.filter((x) => x.from === m[1])[Number(m[2]) - 1];
    return !mine || Math.abs((tried.marks[`${them.id}.getHit${mine.n}.hit`] ?? Infinity) - t) > 1e-3;
  });
  const knocks = Object.entries(tried.marks).filter(([k]) => /^\w+\.getHit\d+\.knockdown$/.test(k)).map(([, t]) => t);
  const apart = knocks.length === 2 && Math.abs(knocks[0] - knocks[1]) > 1e-3;
  if ((late && !fixes.noCounter) || (apart && !fixes.knockOnRed)) return elementalFightPlan(options, { dashWait: fixes.dashWait || late, noCounter: fixes.noCounter || (late && fixes.dashWait), knockOnRed: fixes.knockOnRed || apart });
  const xs = tried.characters.flatMap((c) => c.keys.map((k) => k.x));
  const shift = Math.round(960 - (Math.min(...xs) + Math.max(...xs)) / 2);
  return { ...plan, characters: characters.map((c) => ({ ...c, x: c.x + shift })) };
}

export function makeElementalFightScene(options: ElementalFightOptions, stageWidth?: number): ReturnType<typeof planToScene> {
  const plan = elementalFightPlan(options);
  return stageWidth === undefined ? planToScene(plan, LIBRARY) : fitPlanToPage(plan, LIBRARY, stageWidth);
}

// THE ENGINE TEST BUTTON ("Elemental fight: laser eyes vs ice", tests2c.ts): Red (laser eyes) vs Blue (ice), about 10 s,
// a fixed good seed — Red's laser on Blue's ice wall (cracks, shatter, steam), Blue's crystals zapped mid-air and one
// more dodged, Red dashes in and they trade blows, both jump back, the big clash. (`middle`: where that fight is
// centred on the page, measured once — elementalFight.test.ts checks it — so the panel needn't try it out first.)
export const ELEMENTAL_TEST: ElementalFightOptions = { seed: 9, seconds: 10, red: "laserEyes", blue: "ice", middle: 882 };
export const elementalFightTestPlan = (): ScenePlan => ({ ...elementalFightPlan(ELEMENTAL_TEST), id: "fx-elemental-fight", title: "Elemental fight: laser eyes vs ice" });
