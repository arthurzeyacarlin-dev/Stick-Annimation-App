// SPEC-0021 PHASE 5 — CLAUDE IS THE APP'S AI ANIMATOR (the same loop Arthur passed on the review page, now inside the app):
// the user's words → Claude writes a scene plan in VERSION 1's format (the passed moves library) → the engine builds it → THE LAWS
// (checker only) → Claude fixes only what broke (≤ 3 rounds) → the better version, or an honest refusal. EDITS: Claude gets the
// project's current plan and changes only what was asked. Server only (the API key never reaches the browser).
// Money: every call is priced (upper estimate) and added to CLAUDE_TEST_SPEND_FILE; refused before CLAUDE_TEST_BUDGET_USD
// (default $20 — the test budget Arthur's dad approved, Sun 2026-10-11).
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { LIBRARY } from "../moves/library.ts";
import { COMBO_TESTS } from "../moves/tests.ts";
import { effectsTestButtons, makeEffectsTestScene } from "../moves/tests2c.ts";
import { EFFECTS } from "../effects/index.ts";
import { buildScene } from "../engine.ts";
import { measurePlan } from "../laws/measure.ts";
import "../moves/transform.ts";

export const CLAUDE_ANIMATOR_MODEL = process.env.CLAUDE_ANIMATOR_MODEL ?? "claude-sonnet-5-5";
const PRICE = { in: 5, cacheRead: 0.5, cacheWrite: 6.25, out: 25 }; // (UPPER ESTIMATE per million tokens — the cap errs safe)
const CAMERA_DOC = `THE CAMERA for plans (SPEC-0017 Phase 2C extras, 2026-10-06): FILM CUTS (a story told in several shots, joined by
hard cuts like a film) and SCREEN SHAKE on a really big impact. Only when a plan asks for it (isCameraPlan); every
other plan is built exactly as before. The pictures are made by ../camera.ts (through the engine's buildScene).

A CAMERA PLAN is an ordinary scene plan (it is shot 1: its figures, background, effects) plus:
  cuts:  the next shots, in order. Each has its own \`characters\` (spots, actions), and maybe its own \`background\`,
         \`effects\`, \`objects\`, \`shake\`. The same figure (same id) keeps its look and name in every shot.
         A shot starts at \`at\` seconds into the story, or — when a figure ran off the page in the shot before —
         \`after\` seconds (default 1) once it is fully off the page, or else when the shot before has finished.
  shake: screen shakes in shot 1 ([{ at, strength, seconds }]; \`at\` = seconds into the shot, or one of its moments
         like "a.jump1.land" or "b.liftSlam1.slam"). Small and short: strength 0.008 x page height by default,
         at most 0.015; 0.3 s by default.
and, on a figure in any shot:
  leave: "left" | "right" — after its actions it runs (\`leaveMove\`) off the page that way, on purpose: the shot
         then cuts to the next one, about a second after it is gone.
  enter: "left" | "right" — it runs (\`enterMove\`) in from that edge to its \`x\`, then does its actions.
Figures leaving or coming in this way are left out of the page fit while they do it (the rest of the story is`;

let guideCache: string | null = null;
export function animatorGuide(): string {
  if (guideCache) return guideCache;
  guideCache = (() => {
  const BLAST = { id: "blast", title: "Fire blast blows the enemy away", height: 300, groundY: 900, pace: "natural", characters: [{ id: "a", name: "Wizard", x: 620, facing: "right", look: { color: "#7c3aed" }, actions: [{ move: "fireBlast", params: { target: "b" } }, { move: "celebrate" }] }, { id: "b", name: "Enemy", x: 1180, facing: "left", look: { color: "#111827" }, actions: [{ move: "blownAway", params: { from: { x: 1120, y: 790 }, strength: 1.3, getUp: false, seconds: 1 }, sync: { mark: "blast", at: "a.fireBlast1.release", offset: 0.3 } }] }] };
  const SCENE_IDS = ["rainyWindyDay", "waterfall", "lightningStrike", "blueFire", "grenadeFar", "explosionText", "laserEyes", "teleport", "policeEscort", "camera", "swordFight", "sisterTest"];
  const sceneExamples = effectsTestButtons().filter((b: { id: string }) => SCENE_IDS.includes(b.id)).map((b: { label: string; make: () => unknown }) => { try { return `${b.label}:\n${JSON.stringify(b.make())}`; } catch { return ""; } }).filter(Boolean).join("\n\n");
  const LOOK = { style: "natural", speed: "normal", energy: 0.7, direction: 1 };
  const examples = ["meetHighFive", "passBack", "sneakRun", "blockBlockHit", "tripFall"].flatMap((id) => COMBO_TESTS.filter((t) => t.id === id)).map((t) => `${t.title}:\n${JSON.stringify(t.plan(LOOK as Parameters<typeof t.plan>[0]))}`).join("\n\n");
  return `You are the ANIMATOR of Diamond Animator. For the user's sentence you write a SCENE PLAN (JSON) for a 2D stick-figure
  animation; the engine animates it with its passed moves library (math: real joints, feet planted, eased timing). Then the LAWS
  measure it and you look at pictures of it, and you fix only what is wrong.

  THE USER'S SENTENCE IS THE LAW: show exactly what they asked — every part true, nothing extra (no unasked moves, falls, turns,
  pauses, things), nothing floating, teleporting or duplicated, nothing off the page, a natural human pace (never hypersonic
  unless asked), feet planted, reactions right after what they react to. Keep it short and clear: about 3–10 seconds.

  THE PLAN (reply with ONE JSON object, nothing else):
  { "id": short id, "title": string, "height": figure height in px (300 normal; up to 420 for 1–2 figures that stay near the
    middle; smaller, ~200, when someone travels far), "groundY": 900, "pace": "natural",
    "characters": [ { "id": "a", "name": string, "x": hip x in px where it starts (the page is 1920 wide; keep everyone on it),
       "facing": "left"|"right", "look": { "color": "#rrggbb" }, "actions": [ { "move": a move id below, "params": {…},
       "style"?: "natural"|"sneaky"|…, "speed"?: "slow"|"normal"|"fast", "energy"?: 0..1,
       "sync"?: { "mark": a mark of THIS move, "at": "<otherId>.<move><n>.<mark>", "offset"?: seconds } } ] } ],
    "objects"?: [ { "id": "ball", "look": { "kind": "ball", "size": 44, "color": "#e02424", "filled": true, "detail": "plain" }, "heldBy"?: "a" } ] }
  Each figure's actions run in order; a figure waits (breathing) with "stand" {seconds}. Two figures that meet line up with
  "sync" (e.g. the second high five's "slap" at "a.highFive1.slap"). Distances are px; the engine keeps the feet planted.
  THE MOVES (id: what it does and its params):
  ${Object.entries(LIBRARY).map(([k, v]: [string, { about?: string; title?: string }]) => `- ${k}: ${String(v.about ?? v.title).slice(0, 260)}`).join("\n")}
  VERSION 1's PASSED PLANS (copy their style):
  ${examples}

  EFFECTS ("effects": [ { "kind", "start", "end" (seconds), "anchor": { "x", "y" } | { "character": id, "joint": "rHand"|"lHand"|"head"|"hip"… },
    "target"?: same shape, "params"?: {…}, "layer"?: "back"|"front" } ] — fire, smoke, lightning, explosions, a held SWORD
    ("heldWeapon" on the figure's hand: swords need it or they are not drawn), text…):
  ${Object.entries(EFFECTS).map(([k, v]: [string, { about?: string; title?: string }]) => `- ${k}: ${String(v.about ?? "").slice(0, 220)}`).join("\n")}
  BACKGROUND ("background": { "pieces": [ { "kind", "params" } ] } — a place: sky, ground, trees, buildings, rain, wind… copy the
    examples below). Only when the user asks for a place or the story needs one.
  THE CAMERA (cuts to new places, figures running off / in, screen shake):
  ${CAMERA_DOC}
  (There is NO zoom in / zoom out yet — tell the user plainly in "outside" if they ask for one.)
  VERSION 1's PASSED SCENES with effects, places, the camera and swords (copy their style; keep a scene under 15 s):
  ${sceneExamples}

  RULES FROM ARTHUR'S REVIEWS (always):
  - A BIG EVENT GETS A REACTION FROM EVERYONE: an explosion or a blast — whoever is near is blown away ("blownAway" with "from" =
    the blast point, synced to the blast); whoever is farther away, the thrower too, STARTLES ("blownAway" with "from" = the blast
    point and a small "strength" like 0.3: a flinch, an arm up, a step back), synced to the blast. Nobody ignores an explosion.
  - NOTHING UNASKED: no "celebrate", wave or extra move nobody asked for (a fight's winner may celebrate at the very end).
  - A THING ALREADY THERE IS ALREADY THERE: a campfire, a torch flame, lights already on at the start: its effect starts at -1.5
    (before the scene) so it is fully burning in the first picture, and ends after the scene's end.
  - THE WORLD DOES THESE BY ITSELF (never add them yourself): every sword block sparks ON THE BLADE near the tip; a thing standing
    next to an explosion (a car, a crate…) breaks into its real pieces (a car: wheels, front, back, doors, roof, glass) that fly.
    So: give swords to sword fighters (heldWeapon) and put the thing that explodes right where the explosion is.
  - WALKS keep a normal walking pace (no "fast" walk unless asked); after a stop or a wave, the next walk is still normal.
  - Waiting figures breathe by themselves (the engine) — a figure can "stand" while others act; never leave a scene's key person out.

  PASSED RECIPES:
  - A BLAST THAT BLOWS SOMEONE AWAY ("from" = the point where the fire HITS him, just in front of his chest — never the shooter, or he is "far" and only startles; he reacts when the fire ARRIVES, never before; the shooter does something after, never a statue): ${JSON.stringify(BLAST)}
  - FIGHTS: fighters stand about 230 px apart (striking distance) facing each other and STAY on their spots; a punch or kick has
    "target"; the one hit uses "getHit" { "from": attacker id, "result": "block" | "hit" | "stagger" | "knockdown" } (the planner
    times it to the blow). Never walk fighters into each other, never a clinch or a hug. The winner can "celebrate" at the end.`;
  })();
  return guideCache;
}

type Msg = { role: "user" | "assistant"; content: string | unknown[] };
export type ClaudeUsage = { inputTokens: number; outputTokens: number; usd: number };
const spendFile = () => process.env.CLAUDE_TEST_SPEND_FILE ?? "";
const budget = () => Number(process.env.CLAUDE_TEST_BUDGET_USD ?? 20);
export const claudeSpent = () => { const f = spendFile(); try { return f && existsSync(f) ? Number(JSON.parse(readFileSync(f, "utf8")).total ?? 0) : 0; } catch { return 0; } };
export class ClaudeBudgetError extends Error {}

export async function askClaude(system: string, messages: Msg[], o: { maxTokens?: number; signal?: AbortSignal } = {}): Promise<{ text: string; usage: ClaudeUsage }> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("The AI Animator's Claude key is not set up on this server.");
  if (claudeSpent() >= budget() - 0.25) throw new ClaudeBudgetError(`The AI Animator's test budget is used up ($${claudeSpent().toFixed(2)} of $${budget()}). No animation changed.`);
  const res = await fetch("https://api.anthropic.com/v1/messages", { method: "POST", signal: o.signal, headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model: CLAUDE_ANIMATOR_MODEL, max_tokens: o.maxTokens ?? 6000, system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }], messages }) });
  const j = await res.json() as { content?: { type: string; text?: string }[]; usage?: Record<string, number>; error?: { message?: string } };
  if (!res.ok) throw new Error(`Claude could not answer (${res.status}${j.error?.message ? `: ${j.error.message}` : ""}).`);
  const u = j.usage ?? {};
  const usd = ((u.input_tokens ?? 0) * PRICE.in + (u.cache_read_input_tokens ?? 0) * PRICE.cacheRead + (u.cache_creation_input_tokens ?? 0) * PRICE.cacheWrite + (u.output_tokens ?? 0) * PRICE.out) / 1e6;
  const f = spendFile();
  if (f) { try { const L = existsSync(f) ? JSON.parse(readFileSync(f, "utf8")) : { total: 0, calls: [] }; L.total = +(Number(L.total ?? 0) + usd).toFixed(4); (L.calls ??= []).push({ at: new Date().toISOString(), model: CLAUDE_ANIMATOR_MODEL, usage: u, usd: +usd.toFixed(4), where: "app" }); writeFileSync(f, JSON.stringify(L, null, 1)); } catch { /* the spend note is best effort; the cap check above still ran */ } }
  return { text: (j.content ?? []).filter((c) => c.type === "text").map((c) => c.text ?? "").join(""), usage: { inputTokens: (u.input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0), outputTokens: u.output_tokens ?? 0, usd } };
}
export const firstJson = (t: string): unknown => { const a = t.indexOf("{"), b = t.lastIndexOf("}"); return JSON.parse(t.slice(a, b + 1)); };

// THE LAWS on a plan, built exactly as the workspace places it (makeEffectsTestScene at the page's 1920 stage).
export function lawProblems(plan: unknown, words: string): string[] {
  try {
    const p = plan as Parameters<typeof makeEffectsTestScene>[0];
    const scene = makeEffectsTestScene(p, 1920), built = buildScene(scene, 24);
    return measurePlan(p as never, scene, built, 24, { stageWidth: 1920, words }).filter((m) => !m.ok).map((m) => `LAW ${m.law}: ${m.say}`);
  } catch (e) { return [`ENGINE: it could not be built: ${e instanceof Error ? e.message.slice(0, 300) : String(e)}`]; }
}

export type AnimateResult = { ok: boolean; plan: Record<string, unknown> | null; title: string; problems: string[]; rounds: number; usage: ClaudeUsage; ms: number };
// MAKE or EDIT: \`current\` = the project's current plan for an edit ("make him green": change only that).
export async function claudeAnimate(words: string, o: { current?: Record<string, unknown> | null; conversation?: string; signal?: AbortSignal } = {}): Promise<AnimateResult> {
  const t0 = Date.now(), usage: ClaudeUsage = { inputTokens: 0, outputTokens: 0, usd: 0 };
  const first = o.current
    ? `This is the CURRENT animation's plan:\n${JSON.stringify(o.current)}\n\nThe user asks for an EDIT: "${words}". Change ONLY what they asked (a color, a length, one more scene, removing a thing…) and keep everything else EXACTLY the same — same figures, ids, moves, timing and places. Reply with the whole edited plan JSON.`
    : `${o.conversation ? `Recent conversation (for context):\n${o.conversation}\n\n` : ""}The user typed: "${words}". Write the plan.`;
  const messages: Msg[] = [{ role: "user", content: first }];
  let best: { score: number; plan: Record<string, unknown>; problems: string[]; round: number } | null = null;
  for (let round = 0; round <= 3; round += 1) {
    const r = await askClaude(animatorGuide(), messages, { signal: o.signal });
    usage.inputTokens += r.usage.inputTokens; usage.outputTokens += r.usage.outputTokens; usage.usd += r.usage.usd;
    let plan: Record<string, unknown>;
    try { plan = firstJson(r.text) as Record<string, unknown>; plan.groundY ??= 900; plan.height ??= 300; plan.id ??= "ai"; plan.pace ??= "natural"; }
    catch { messages.push({ role: "assistant", content: r.text }, { role: "user", content: "That was not one valid JSON object. Reply with only the plan JSON." }); continue; }
    messages.push({ role: "assistant", content: r.text });
    const problems = lawProblems(plan, words);
    if (!best || problems.length < best.score) best = { score: problems.length, plan, problems, round };
    if (!problems.length) break;
    messages.push({ role: "user", content: `Problems found:\n- ${problems.join("\n- ")}\nFix ONLY what is wrong (keep everything that works) and reply with the whole corrected plan JSON.` });
  }
  return { ok: !!best && best.score === 0, plan: best?.plan ?? null, title: String(best?.plan?.title ?? "Animation"), problems: best?.problems ?? ["Claude did not write a plan."], rounds: (best?.round ?? 0) + 1, usage, ms: Date.now() - t0 };
}
