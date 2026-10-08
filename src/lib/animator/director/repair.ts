import { buildScene, type Scene, type SceneFrames } from "../engine.ts";
import { BACKGROUND_PIECES, EFFECTS } from "../effects/index.ts";
import { LIBRARY } from "../moves/library.ts";
import { fitBackgroundPlanToPage, fitPlanToPage, planToScene, shortenCourseForPage, type Action, type CharacterPlan, type MoveEntry, type ScenePlan } from "../moves/plan.ts";
import { JOINTS } from "../rig.ts";
import { animationBounds, centerAnimation, effectFitBounds, lostOffPage } from "../stageFit.ts";
import { PLAN_HEIGHT, STAGE_MIDDLE } from "./schema.ts";

// SPEC-0017 Phase 3 (spec 6.6): CHECK AND REPAIR what Terra wrote before the engine builds it, then build it and run
// the engine's automatic checks. Every repair is written down in plain words.

export type DirectedPlan = ScenePlan & { fps?: number };
export type Repaired = { plan: DirectedPlan; repairs: string[]; failure?: string };

// Words Terra might use for a library move.
const SAME_AS: Record<string, string> = {
  idle: "stand", breathe: "stand", rest: "stand", standstill: "stand", hop: "jump", leap: "jump", sprint: "run", dash: "run",
  strike: "punch", jab: "punch", hook: "punch", uppercut: "punch", hit: "punch", fireball: "fireBlast", fire: "fireBlast",
  shield: "waterShield", laser: "laserEyes", lasers: "laserEyes", hello: "wave", greet: "wave", duck: "squat", crouch: "squat",
  trip: "fall", stumble: "fall", fallover: "fallDown", getup: "getUp", standup: "getUp", react: "getHit", gethit: "getHit",
  dodge: "swordDodge", slash: "swordSlash", sword: "swordSlash", throwball: "throw", catchball: "catch", lookaround: "lookBack",
  turnaround: "turn", spin: "turn", sitdown: "sit", pickup: "pickUp", highfive: "highFive", kickup: "kipUp", explode: "blownAway",
  victory: "celebrate", celebration: "celebrate", cheer: "celebrate", tiptoes: "tiptoe", tiptoeing: "tiptoe",
};

function distance(a: string, b: string) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)] as number[]);
  for (let j = 1; j <= b.length; j += 1) d[0][j] = j;
  for (let i = 1; i <= a.length; i += 1) for (let j = 1; j <= b.length; j += 1) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}

// The library move a wrong id most likely meant (or `custom`, when the action carries its own key poses).
export function nearestMove(id: string, params: Record<string, unknown> | undefined, moves: Record<string, MoveEntry> = LIBRARY): string {
  const ids = Object.keys(moves);
  const key = id.replace(/[^a-z]/gi, "").toLowerCase();
  const exact = ids.find((m) => m.toLowerCase() === key);
  if (exact) return exact;
  if (moves.custom && params && ["keys", "keyPoses", "poses", "pose"].some((name) => name in params)) return "custom";
  if (SAME_AS[key] && moves[SAME_AS[key]]) return SAME_AS[key];
  // (A name made of several words keeps its MOST SPECIFIC part: "tiptoeWalk" = tiptoe, never walk; "victoryJump" =
  // celebrate, never jump. Then a library id that contains the word.)
  const words: [string, string][] = [...ids.map((m) => [m.toLowerCase(), m] as [string, string]), ...Object.entries(SAME_AS).filter(([w, m]) => w.length >= 5 && moves[m])];
  const part = key.length >= 4 ? words.filter(([w]) => key.includes(w)).sort((a, b) => b[0].length - a[0].length)[0] : undefined;
  if (part) return part[1];
  const contains = ids.find((m) => key.length >= 4 && m.toLowerCase().includes(key));
  if (contains) return contains;
  const best = ids.filter((m) => m !== "custom").map((m) => ({ m, d: distance(key, m.toLowerCase()) / Math.max(key.length, m.length) })).sort((a, b) => a.d - b.d)[0];
  if (best && best.d <= 0.5) return best.m;
  return moves.custom ? "custom" : "stand";
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
// Sensible ranges for the common knobs (anything else is left as the move's own rules handle it).
const RANGES: Record<string, [number, number]> = { energy: [0, 1], seconds: [0, 8], times: [1, 8], count: [1, 12], depth: [0, 1], hold: [0, 5], lunge: [-1.5, 1.5], advance: [-3, 3], push: [0, 3] };
const ID_PARAMS = ["target", "from", "with"];
// KNOB LIMITS PER MOVE (Arthur's parkour review, 2026-10-07: Terra wrote jump {height: 300}; the jump's `height` is x BODY
// HEIGHT, so the figure flew to space). The ranges the library abouts allow; a knob outside is brought back and written down.
export const MOVE_RANGES: Record<string, Record<string, [number, number]>> = {
  jump: { height: [0.1, 1.2], distance: [0, 900] },
};

// SIZE SHOWS AGE AND ROLE (Arthur, 2026-10-07: "the dad would be the biggest, the children would be smaller, of
// course"): grown-ups (dad, mom, teacher, grandpa...) full size, teens a bit smaller, kids ~0.7, babies smallest;
// a "giant" / "tiny" word wins over age. Body height x the scene's (1 = grown-up).
const WHO_SIZES: [RegExp, number][] = [
  [/(?<![a-z])(giant|huge|titan)(?![a-z])/, 1.35],
  [/(?<![a-z])(tiny|mini|miniature)(?![a-z])/, 0.5],
  [/(?<![a-z])(baby|babies|toddler|infant|newborn)(?![a-z])/, 0.5],
  [/(?<![a-z])(kids?|child|children|son|daughter|boy|girl|little ?(brother|sister|one)|grandkid|grandson|granddaughter)(?![a-z])/, 0.7],
  [/(?<![a-z])(teens?|teenager)(?![a-z])/, 0.88],
];
export function sizeForWho(words: string): number {
  const w = words.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase();
  return WHO_SIZES.find(([re]) => re.test(w))?.[1] ?? 1;
}

// EFFECT SIZES ARE IN FIGURE HEIGHTS (Luna wrote bubbles `size: 28` — too big to see at all — and a moon `size: 180`
// that filled the page): an effect's or background piece's `size` is x the figure's height (effects/types.ts). A size
// past PIXEL_SIZE_FROM (no sensible figure-height size is that big) was meant in PIXELS: it is divided by the plan's
// figure height, then kept inside SIZE_RANGE (a speck to a whole-page piece). Every effect and background piece.
export const PIXEL_SIZE_FROM = 6;
export const SIZE_RANGE: [number, number] = [0.02, 4];
export function fixSize(kind: string, params: { size?: unknown } | undefined, height: number, repairs: string[]): void {
  const v = params?.size;
  if (!params || typeof v !== "number" || !Number.isFinite(v) || v <= PIXEL_SIZE_FROM) return;
  const fixed = Math.round(clamp(v / height, SIZE_RANGE[0], SIZE_RANGE[1]) * 1000) / 1000;
  repairs.push(`The ${kind} size was ${v}, which looks like pixels; sizes are x the figure's height, so I made it ${fixed} (${Math.round(fixed * height)} px).`);
  params.size = fixed;
}

export function repairPlan(input: DirectedPlan, stageWidth: number, moves: Record<string, MoveEntry> = LIBRARY): Repaired {
  const repairs: string[] = [];
  const plan: DirectedPlan = structuredClone(input);
  if (!plan.characters.length && !(plan.objects ?? []).length && !(plan.effects ?? []).length && !plan.background) {
    return { plan, repairs, failure: "I couldn't turn that into an animation. Try telling me who is in it and what they do." };
  }
  // Unique ids.
  const seen = new Set<string>();
  for (const c of plan.characters) {
    let id = c.id || "c";
    for (let n = 2; seen.has(id); n += 1) id = `${c.id}${n}`;
    if (id !== c.id) repairs.push(`Two figures were both called "${c.id}"; one is now "${id}".`);
    c.id = id;
    seen.add(id);
  }
  const ids = new Set(plan.characters.map((c) => c.id));
  const nameOf = (c: CharacterPlan) => c.name ?? c.id;
  // On the page: every starting spot inside the visible page (a little in from the edges).
  const half = stageWidth / 2, margin = Math.min(150, stageWidth * 0.08);
  for (const c of plan.characters) {
    const x = clamp(c.x, STAGE_MIDDLE - half + margin, STAGE_MIDDLE + half - margin);
    if (Math.abs(x - c.x) > 0.5) { repairs.push(`${nameOf(c)} started off the page, so I moved them onto it.`); c.x = x; }
    if (c.energy !== undefined) c.energy = clamp(c.energy, 0, 1);
    if (!c.actions.length) { c.actions = [{ move: "stand", params: { seconds: 1 } }]; repairs.push(`${nameOf(c)} had nothing to do, so they stand and breathe.`); }
    c.actions = c.actions.map((a) => repairAction(a, c, ids, stageWidth, moves, repairs));
    if (c.wears) c.wears = c.wears.filter((w) => w === "militaryCap" || (repairs.push(`${nameOf(c)} can't wear "${w}" yet, so I left it off.`), false));
    // SIZE SHOWS AGE AND ROLE (no size given): read from who it is, quietly — it is understanding, not a fix.
    if (c.size === undefined) { const size = sizeForWho(`${c.id} ${c.name ?? ""}`); if (size !== 1) c.size = size; }
  }
  // Objects held by someone who is there.
  for (const o of plan.objects ?? []) if (o.heldBy && !ids.has(o.heldBy)) { repairs.push(`The ${o.id} was held by someone who isn't in the scene, so it starts on its own.`); delete o.heldBy; }
  // Effects and background pieces the engine knows.
  const objectIds = new Set((plan.objects ?? []).map((o) => o.id));
  if (plan.effects) {
    plan.effects = plan.effects.filter((e) => {
      if (!EFFECTS[e.kind]) { repairs.push(`There is no "${e.kind}" effect yet, so I left it out.`); return false; }
      if ("character" in e.anchor && !ids.has(e.anchor.character)) { repairs.push(`The ${e.kind} was on someone who isn't in the scene, so I left it out.`); return false; }
      if ("object" in e.anchor && !objectIds.has(e.anchor.object)) { repairs.push(`The ${e.kind} was on a "${e.anchor.object}" that isn't in the scene, so I left it out.`); return false; }
      if (e.target && "object" in e.target && !objectIds.has(e.target.object)) delete e.target;
      if ("character" in e.anchor && !(JOINTS as readonly string[]).includes(e.anchor.joint)) e.anchor = { ...e.anchor, joint: "hip" };
      if (e.target && "character" in e.target && !ids.has(e.target.character)) delete e.target;
      fixSize(e.kind, e.params, plan.height ?? PLAN_HEIGHT, repairs);
      e.start = Math.max(0, e.start);
      if (!(e.end > e.start)) { e.end = e.start + 1; repairs.push(`The ${e.kind} ended before it started, so it now lasts 1 second.`); }
      return true;
    });
    if (!plan.effects.length) delete plan.effects;
  }
  if (plan.background) {
    plan.background.pieces = plan.background.pieces.filter((p) => BACKGROUND_PIECES[p.kind] || (repairs.push(`There is no "${p.kind}" background piece yet, so I left it out.`), false));
    for (const p of plan.background.pieces) fixSize(p.kind, p.params, plan.height ?? PLAN_HEIGHT, repairs);
    if (!plan.background.pieces.length) delete plan.background;
  }
  if (plan.canvasColor && !/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(plan.canvasColor)) { repairs.push(`"${plan.canvasColor}" isn't a color code, so the page keeps its color.`); delete plan.canvasColor; }
  if (plan.fps !== undefined) plan.fps = clamp(Math.round(plan.fps), 1, 60);
  roomForRangedAttacks(plan, repairs);
  plan.stageWidth = stageWidth;
  // It must build.
  try { planToScene(plan, moves); } catch (error) {
    return { plan, repairs, failure: `The engine couldn't build that plan (${error instanceof Error ? error.message : "unknown problem"}).` };
  }
  // FIGURES STAY BIG ENOUGH TO READ (plan.ts shortenCourseForPage): a course too long for the page at a readable size
  // is shortened by the engine (distances and pieces closer together; the same moves), and that is written down.
  if (plan.background) {
    const short = shortenCourseForPage(plan, moves, stageWidth);
    if (short.factor < 1) {
      Object.assign(plan, { characters: short.plan.characters, background: short.plan.background, ...(short.plan.effects ? { effects: short.plan.effects } : {}) });
      repairs.push(`The course was too long for the page (the figures would have been tiny), so I made it ${Math.round(short.factor * 100)}% as long: the same moves, with the runs and the obstacles closer together.`);
    }
  }
  return { plan, repairs };
}

// RANGED ATTACKS NEED ROOM (H42, Arthur's fire-vs-water card: "they need some space between each other if the red one
// is going to do a fire beam — about twice bigger"): how far apart two figures START depends on the reach of the first
// attack between them. Melee (punch, kick, block) starts at striking distance (the plan's own gap is kept); a beam,
// blast, throw or power starts at least RANGED_GAP apart (2 x the punch's striking distance), so the attack is seen
// travelling and the other one has time to react. Both are moved apart evenly around their middle.
export const STRIKING_DISTANCE = 0.75; // x height, hip to hip (hit.ts IN_RANGE: where a punch fight starts)
export const RANGED_GAP = 2 * STRIKING_DISTANCE;
export const RANGED_MOVES = new Set(["fireBlast", "waterBlast", "iceBlast", "iceThrow", "iceMountain", "laserEyes", "throw"]);
const MELEE_MOVES = new Set(["punch", "dashPunch", "kick", "stompDown", "groundPunch", "liftSlam", "barrage", "swordSlash", "swordChop", "swordThrust", "swordSpin", "dashSlash"]);
function roomForRangedAttacks(plan: DirectedPlan, repairs: string[]): void {
  const h = plan.height ?? PLAN_HEIGHT;
  for (const c of plan.characters) {
    const first = c.actions.find((a) => RANGED_MOVES.has(a.move) || MELEE_MOVES.has(a.move));
    if (!first || !RANGED_MOVES.has(first.move)) continue;
    const named = typeof first.params?.target === "string" ? plan.characters.find((o) => o.id === first.params!.target) : undefined;
    const ahead = (o: CharacterPlan) => (o.x - c.x) * (c.facing === "left" ? -1 : 1);
    const other = named ?? plan.characters.filter((o) => o !== c && ahead(o) > 0).sort((p, q) => ahead(p) - ahead(q))[0];
    if (!other) continue;
    const gap = Math.abs(other.x - c.x), want = RANGED_GAP * h;
    if (gap >= want - 1) continue;
    const middle = (c.x + other.x) / 2, side = Math.sign(other.x - c.x) || (c.facing === "left" ? -1 : 1);
    c.x = middle - (side * want) / 2;
    other.x = middle + (side * want) / 2;
    repairs.push(`${c.name ?? c.id}'s ${first.move} reaches far, so ${c.name ?? c.id} and ${other.name ?? other.id} start ${Math.round(want)} px apart (twice a punch's distance) to give it room.`);
  }
}

function repairAction(a: Action, c: CharacterPlan, ids: Set<string>, stageWidth: number, moves: Record<string, MoveEntry>, repairs: string[]): Action {
  const out: Action = { ...a, params: a.params ? { ...a.params } : undefined };
  if (out.move !== "wait" && !moves[out.move]) {
    const near = nearestMove(out.move, out.params, moves);
    repairs.push(`"${out.move}" isn't a move I know, so ${c.name ?? c.id} does "${near}" instead.`);
    out.move = near;
  }
  if (out.energy !== undefined) out.energy = clamp(out.energy, 0, 1);
  const p = out.params;
  if (p) {
    for (const [name, [lo, hi]] of Object.entries(RANGES)) {
      if (typeof p[name] === "number" && (p[name] as number) !== clamp(p[name] as number, lo, hi)) { repairs.push(`${c.name ?? c.id}'s ${out.move} ${name} was ${p[name]}; I kept it between ${lo} and ${hi}.`); p[name] = clamp(p[name] as number, lo, hi); }
      else if (typeof p[name] === "string" && Number.isFinite(Number(p[name]))) p[name] = clamp(Number(p[name]), lo, hi);
    }
    for (const [name, [lo, hi]] of Object.entries(MOVE_RANGES[out.move] ?? {})) {
      if (typeof p[name] === "string" && Number.isFinite(Number(p[name]))) p[name] = Number(p[name]);
      if (typeof p[name] !== "number") continue;
      const v = p[name] as number, kept = clamp(v, lo, hi);
      // (A pixel number for a body-height knob, like height 300, means "about that many px": turned into body heights first.)
      const scaled = hi <= 2 && v > 10 ? clamp(v / PLAN_HEIGHT, lo, hi) : kept;
      if (scaled !== v) { repairs.push(`${c.name ?? c.id}'s ${out.move} ${name} was ${v}; the most it can be is ${lo}-${hi}${hi <= 2 ? " x body height" : " px"}, so I made it ${Math.round(scaled * 100) / 100}.`); p[name] = scaled; }
    }
    if (typeof p.distance === "string" && Number.isFinite(Number(p.distance))) p.distance = Number(p.distance);
    if (typeof p.distance === "number") {
      const max = stageWidth * 2;
      if (Math.abs(p.distance) > max) { repairs.push(`${c.name ?? c.id}'s ${out.move} was too far (${Math.round(p.distance)} px); I made it ${Math.round(max)} px.`); p.distance = Math.sign(p.distance) * max; }
    }
    for (const name of ID_PARAMS) if (typeof p[name] === "string" && !ids.has(p[name] as string) && !(name === "from" && out.move === "blownAway")) { repairs.push(`${c.name ?? c.id}'s ${out.move} pointed at "${p[name]}", who isn't in the scene, so I left that out.`); delete p[name]; }
    if (out.move !== "turn" && typeof p.to === "string" && !ids.has(p.to) && !["left", "right", "front"].includes(p.to)) delete p.to;
  }
  if (out.sync) {
    const who = out.sync.at.split(".")[0];
    if (!ids.has(who)) { repairs.push(`${c.name ?? c.id}'s ${out.move} was timed to "${who}", who isn't in the scene, so it just follows on.`); delete out.sync; }
  }
  return out;
}

// ---- Build and the automatic checks ----

export type PlanCheck = { plan: DirectedPlan; scene: Scene; built: SceneFrames; problems: string[]; lost?: string[] };

// The scene the page shows for a plan: fitted to the page (a plan with a background is zoomed out as a whole).
export function sceneForPage(plan: DirectedPlan, stageWidth: number, moves: Record<string, MoveEntry> = LIBRARY): { plan: DirectedPlan; scene: Scene } {
  if (plan.background) {
    const fitted = spikesUnderJumps(fitBackgroundPlanToPage(plan, moves, stageWidth) as DirectedPlan, moves);
    return { plan: fitted, scene: planToScene(fitted, moves) };
  }
  return { plan, scene: fitPlanToPage(plan, moves, stageWidth) };
}

// SPIKES GO WHERE THE JUMPS CLEAR THEM (H31, Arthur's parkour card): a RUNNING jump flies as far as the run's speed
// carries it, not the plan's `distance`, so spikes Terra placed by the plan's numbers sat in the wrong spots. When one
// figure jumps exactly as many times as there are single-spike pieces, each spike (left to right) is put under that
// jump's highest point (where the feet are highest). Anything else is left as written.
// HAZARDS CLOSE TOGETHER ARE CROSSED IN STRIDE (H42, Arthur's parkour card: "one leg should land in between the spikes
// and the other leg goes over them ... without slowing down"): running, an obstacle is cleared with the SMALLEST move
// that clears it at the same speed. Spikes closer than CLOSE_HAZARDS x height to the next one are a group the RUN
// itself crosses (no jump, no hop-stop-hop): each spike of the group goes between two of the run's footfalls, so a foot
// lands between neighbouring spikes and the other one strides over; a lone spike gets its running leap (as above). Used
// when the runner jumps once per LONE spike.
export const CLOSE_HAZARDS = 1.0;
// SEPARATE HAZARDS ARE SEPARATE PIECES (both AIs' parkour, 2026-10-07: "spikes, count 3, spacing 200" drew ONE clump
// of three, and the three jumps flew over empty ground): a row with a `spacing`, or with exactly as many spikes as a
// figure has jumps, is split into single spikes `spacing` apart (default 1.2 figure heights) before they are placed.
function splitHazardRows(plan: DirectedPlan): DirectedPlan {
  const pieces = plan.background?.pieces ?? [];
  const mostJumps = Math.max(0, ...plan.characters.map((c) => c.actions.filter((a) => a.move === "jump").length));
  let split = false;
  const out = pieces.flatMap((p) => {
    const count = Math.round(Number(p.params?.count ?? 1)), x = p.params?.x;
    if (p.kind !== "spikes" || count < 2 || count > 12 || typeof x !== "number" || (typeof p.params?.spacing !== "number" && count !== mostJumps)) return [p];
    split = true;
    const gap = typeof p.params?.spacing === "number" && p.params.spacing > 0 ? p.params.spacing : 1.2 * plan.height;
    return Array.from({ length: count }, (_, k) => ({ ...p, params: { ...p.params, count: 1, x: x + k * gap } }));
  });
  return split ? { ...plan, background: { ...plan.background!, pieces: out } } : plan;
}

function spikesUnderJumps(plan: DirectedPlan, moves: Record<string, MoveEntry>): DirectedPlan {
  plan = splitHazardRows(plan);
  const pieces = plan.background?.pieces ?? [];
  const spikes = pieces.filter((p) => p.kind === "spikes" && (p.params?.count ?? 1) === 1 && typeof p.params?.x === "number");
  if (!spikes.length) return plan;
  const order = [...spikes].sort((a, b) => (a.params!.x as number) - (b.params!.x as number));
  const groups: (typeof spikes)[] = [];
  for (const p of order) { const last = groups[groups.length - 1]; if (last && (p.params!.x as number) - (last[last.length - 1].params!.x as number) < CLOSE_HAZARDS * plan.height) last.push(p); else groups.push([p]); }
  const lone = groups.filter((g) => g.length === 1).flat(), jumps = (c: CharacterPlan) => c.actions.filter((a) => a.move === "jump").length;
  let jumper = plan.characters.find((c) => jumps(c) === spikes.length), leapt = order;
  if (!jumper && lone.length < spikes.length) { jumper = plan.characters.find((c) => jumps(c) === lone.length && c.actions.some((a) => a.move === "run")); leapt = lone; }
  if (!jumper) return plan;
  const scene = planToScene(plan, moves), built = buildScene(scene, 24), i = plan.characters.indexOf(jumper);
  const marks = (scene as { marks?: Record<string, number> }).marks ?? {};
  const tops = leapt.map((_, n) => marks[`${jumper.id}.jump${n + 1}.top`]);
  if (tops.some((t) => typeof t !== "number")) return plan;
  const xs = tops.map((t) => { const f = built.frames[Math.min(built.frames.length - 1, Math.round(t * 24))]?.[i]?.skeleton; return f ? (f.lFoot.x + f.rFoot.x) / 2 : undefined; });
  if (xs.some((x) => x === undefined)) return plan;
  const moved = new Map(leapt.map((p, n) => [p, xs[n] as number]));
  if (leapt !== order) {
    const steps = footfalls(built.frames.map((f) => f[i]?.skeleton), plan.groundY, plan.height), roomy = 0.3 * plan.height;
    for (const group of groups.filter((g) => g.length > 1)) {
      const want = group.reduce((sum, p) => sum + (p.params!.x as number), 0) / group.length;
      let best = -1, miss = Infinity;
      for (let k = 0; k + group.length < steps.length; k += 1) {
        const run = steps.slice(k, k + group.length + 1), lo = Math.min(...run), hi = Math.max(...run);
        if (run.slice(1).some((x, n) => Math.abs(x - run[n]) < roomy) || (xs as number[]).some((x) => x > lo - roomy && x < hi + roomy)) continue;
        const d = Math.abs((lo + hi) / 2 - want);
        if (d < miss) { miss = d; best = k; }
      }
      if (best >= 0) group.forEach((p, n) => moved.set(p, (steps[best + n] + steps[best + n + 1]) / 2));
    }
  }
  return { ...plan, background: { ...plan.background!, pieces: pieces.map((p) => (moved.has(p) ? { ...p, params: { ...p.params, x: moved.get(p) } } : p)) } };
}

// Where a figure's feet come down on the ground, in order (a foot that lands and stays; two feet landing together = one).
type Feet = { lFoot: { x: number; y: number }; rFoot: { x: number; y: number } } | undefined;
export function footfalls(frames: Feet[], groundY: number, height: number): number[] {
  const out: number[] = [];
  const down = (f: Feet, foot: "lFoot" | "rFoot") => f !== undefined && groundY - f[foot].y < 2;
  frames.forEach((f, t) => {
    for (const foot of ["lFoot", "rFoot"] as const) {
      if (!f || !down(f, foot) || (t > 0 && down(frames[t - 1], foot))) continue;
      const x = f[foot].x;
      if (out.length && Math.abs(out[out.length - 1] - x) < 0.15 * height) out[out.length - 1] = (out[out.length - 1] + x) / 2; else out.push(x);
    }
  });
  return out;
}

const px = (v: number) => `${Math.round(v * 10) / 10} px`;

export function checkPlan(plan: DirectedPlan, fps: number, stageWidth: number, moves: Record<string, MoveEntry> = LIBRARY): PlanCheck {
  const fitted = sceneForPage(plan, stageWidth, moves);
  const built = buildScene(fitted.scene, fps);
  const problems: string[] = [];
  const names = new Map(fitted.plan.characters.map((c) => [c.id, c.name ?? c.id]));
  for (const r of built.report.characters) {
    const who = names.get(r.id) ?? r.id;
    if (r.maxBoneErrorPx > 0.5) problems.push(`${who}'s bones stretch or shrink (up to ${px(r.maxBoneErrorPx)}).`);
    if (r.maxFootDriftPx > 1) problems.push(`${who}'s planted feet slide (up to ${px(r.maxFootDriftPx)}).`);
    if (r.belowGroundFrames > 0) problems.push(`${who} goes below the ground in ${r.belowGroundFrames} pictures.`);
  }
  if (!built.frames.length) problems.push("The animation has no pictures.");
  // ORIGINAL MOVES need numbers: a custom key whose pose is words (or has no angle) can't move the body — Terra fixes it.
  for (const c of plan.characters) for (const a of c.actions) {
    if (a.move !== "custom") continue;
    const keys = Array.isArray((a.params as { keys?: unknown } | undefined)?.keys) ? (a.params as { keys: unknown[] }).keys : [];
    const bad = keys.filter((k) => { const pose = (k as { pose?: unknown } | null)?.pose; return pose !== undefined && (typeof pose !== "object" || pose === null || !Object.values(pose).some((v) => typeof v === "number")); }).length;
    if (!keys.length) problems.push(`${names.get(c.id) ?? c.id}'s original move has no key poses.`);
    else if (bad) problems.push(`${names.get(c.id) ?? c.id}'s original move has ${bad} key pose${bad > 1 ? "s" : ""} written in words: each pose must be joint ANGLES in degrees ({lean, head, lShoulder, rShoulder, lElbow, rElbow, lHip, rHip, lKnee, rKnee}), or the body cannot move.`);
  }
  const extra = effectFitBounds(fitted.scene);
  const b = animationBounds(built.frames, built.objects, extra);
  if (Number.isFinite(b.left) && b.right - b.left > stageWidth + 0.5) problems.push(`The animation is ${Math.round(b.right - b.left)} px wide, wider than the page (${Math.round(stageWidth)} px): part of it is off the page.`);
  const shown = centerAnimation(built.frames, stageWidth, built.objects, extra);
  const lost = lostOffPage(shown.frames, stageWidth, built.camera?.cuts);
  for (const l of lost) problems.push(`${names.get(l.id) ?? l.id} leaves the page and is never seen again.`);
  return { plan: fitted.plan, scene: fitted.scene, built, problems, ...(lost.length ? { lost: lost.map((l) => l.id) } : {}) };
}

// KEEP THEM ON THE PAGE (Arthur's parkour review): when the check (after Terra's review) still finds a figure that
// leaves the page for good, the engine brings them back itself instead of accepting it: the lost figure's travel
// (`distance`) and jump heights are made smaller step by step, then their start is moved toward the middle, until
// nobody is lost. Keeps the try with the fewest problems; every change is written down.
export function keepOnPage(plan: DirectedPlan, check: PlanCheck, fps: number, stageWidth: number, moves: Record<string, MoveEntry> = LIBRARY): { plan: DirectedPlan; check: PlanCheck; repairs: string[] } {
  if (!check.lost?.length) return { plan, check, repairs: [] };
  const lostIds = new Set(check.lost);
  const names = plan.characters.filter((c) => lostIds.has(c.id)).map((c) => c.name ?? c.id).join(" and ");
  const shrink = (k: number, middle: boolean): DirectedPlan => {
    const next = structuredClone(plan);
    for (const c of next.characters) {
      if (!lostIds.has(c.id)) continue;
      if (middle) c.x = STAGE_MIDDLE + (c.x - STAGE_MIDDLE) * 0.3;
      for (const a of c.actions) {
        if (!a.params) continue;
        if (typeof a.params.distance === "number") a.params.distance = Math.round(a.params.distance * k);
        if (a.move === "jump" && typeof a.params.height === "number") a.params.height = clamp(Math.round(a.params.height * Math.max(k, 0.5) * 100) / 100, 0.1, 1.2);
      }
    }
    return next;
  };
  let best = { plan, check };
  for (const [k, middle] of [[0.7, false], [0.5, false], [0.5, true], [0.3, true]] as const) {
    const tryPlan = shrink(k, middle);
    let tryCheck: PlanCheck;
    try { tryCheck = checkPlan(tryPlan, fps, stageWidth, moves); } catch { continue; }
    if ((tryCheck.lost?.length ?? 0) < (best.check.lost?.length ?? 0) || ((tryCheck.lost?.length ?? 0) === (best.check.lost?.length ?? 0) && tryCheck.problems.length < best.check.problems.length)) {
      best = { plan: tryPlan, check: tryCheck };
      if (!tryCheck.lost?.length) {
        return { ...best, repairs: [`${names} left the page, so I kept them on it: their moves travel ${Math.round(k * 100)}% as far${middle ? " and they start nearer the middle" : ""}.`] };
      }
    }
  }
  return best.plan === plan
    ? { plan, check, repairs: [`${names} still leave the page; I couldn't keep them on it.`] }
    : { ...best, repairs: [`${names} left the page, so I made their moves travel less (some of it may still be off the page).`] };
}
