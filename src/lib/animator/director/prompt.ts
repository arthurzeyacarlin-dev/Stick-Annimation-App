import { BACKGROUND_PIECES, EFFECTS } from "../effects/index.ts";
import { JOINTS } from "../rig.ts";
import { LIBRARY } from "../moves/library.ts";
import { moveLesson, PRINCIPLES, styleLesson } from "../moves/lessons.ts";
import { MOVE_SPEEDS } from "../moves/styles.ts";
import { POSE_KINDS } from "../moves/poseMaker.ts";
import { ACCESSORIES } from "../moves/wear.ts";
import { WEAPONS } from "../moves/weapons.ts";
import type { MoveEntry, ScenePlan } from "../moves/plan.ts";
import { PLAN_GROUND, PLAN_HEIGHT, planTo, STAGE_MIDDLE } from "./schema.ts";

// SPEC-0017 Phase 3: what Terra reads before it plans. The full lesson pack (moves/lessons.ts lessonPack) is
// ~260,000 characters — far over the 5-cent cap — so this is a COMPACT pack made from the same sources (it can
// never disagree with the real moves): every principle (its rule, shortened), the styles and speeds, every
// library move as `id: about` (shortened; a `custom` move's about in full), full key poses for only a few
// reference moves, the effects, powers, backgrounds and wearables. The stable part (this whole string) goes
// first and never changes between requests, so the provider can cache it; the request goes in `input`.

// Shortens a text to at most `max` characters, at a sentence end when there is one.
export function brief(text: string, max: number): string {
  const t = text.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const end = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("; "), cut.lastIndexOf(": "));
  if (end > max * 0.55) return cut.slice(0, end + 1);
  const space = cut.lastIndexOf(" ");
  return `${cut.slice(0, space > 0 ? space : max)}…`;
}

const PRINCIPLE_CHARS = 50;
// The heart of it (plan-not-frames, anticipation, speed-up/slow-down, weight, body rules, page rule): longer.
// Picked by their opening words, not by place (new principles get added at the top and must not push these out).
const CORE_STARTS = ["The AI never draws frames", "Almost every movement", "Everything speeds up", "Weight:", "Body rules:", "Page rule:"];
const isCore = (p: string) => CORE_STARTS.some((s) => p.startsWith(s));
const CORE_CHARS = 260;
// A principle's own name ("STRIKE POWER: …"), or its first words.
export const principleName = (p: string) => {
  const head = /^([A-Z][A-Z0-9 ,'’\-/&]{2,48}[A-Z)])\s*[:(—]/.exec(p.trim());
  return head ? head[1] : brief(p, PRINCIPLE_CHARS).replace(/[:;,.…]+$/, "");
};
const ABOUT_CHARS = 85;
const EFFECT_CHARS = 60;
export const REFERENCE_MOVES = ["walk", "punch", "jump", "wave"];
const REFERENCE_KEYS = 5;

// Moves whose whole description Terra needs (writing an original move).
const FULL_ABOUT = new Set(["custom"]);

const r0 = (v: number) => Math.round(v);
function referenceMove(id: string, entry: MoveEntry) {
  const lesson = moveLesson(id, entry);
  // (Spread over the whole move, so the example shows its whole shape: wind-up, action, settle.)
  const n = lesson.keyPoses.length;
  const picked = n <= REFERENCE_KEYS ? lesson.keyPoses : Array.from({ length: REFERENCE_KEYS }, (_, i) => lesson.keyPoses[Math.round((i * (n - 1)) / (REFERENCE_KEYS - 1))]);
  const keys = picked.map((k) => `t${k.t} dx${r0(k.dx)} lift${k.lift} feet:${k.feet} ${Object.entries(k.pose).map(([n, v]) => `${n}${v}`).join(" ")}`);
  const more = n > REFERENCE_KEYS ? ` (${REFERENCE_KEYS} of its ${n} keys)` : "";
  return `${id} (${lesson.seconds}s, marks ${JSON.stringify(lesson.marks)})${more}:\n${keys.join("\n")}`;
}

const HEADER = `You are Luna, the animation director inside Diamond Animator (a stick-figure animation app).
The user asks for an animation. You do NOT draw frames: you write a SCENE PLAN (who is there, what each one does in order, with knobs and timing). The ENGINE turns the plan into every frame and applies the animation fundamentals itself: anticipation, acceleration and deceleration, follow-through, weight, balance, planted feet, natural timing. Your job is WHAT happens; the engine knows HOW.
Return ONLY the required JSON object:
- reply: one or two friendly sentences to the user (plain, simple words; the user may be a kid).
- says: exactly in this form: "First I'll …, then I'll …, and finally I'll … — then your animation is ready."
- plan: the scene plan (null only if the request cannot be animated; then explain kindly in reply).
- edits: [] for a new animation.
RULES
- Make ONLY what was asked. Do not add extra moves, characters, effects or backgrounds the user did not ask for. A vague request ("a fight") may be filled in with a short sensible sequence.
- FIGHT LOOK: fighters stand loose with the hands low between strikes; set "guard" only when the user asks for realistic/boxing/MMA fighting ("realistic") or higher hands ("high").
- Use library move ids exactly as listed. USE THE PASSED MOVES FIRST: if the library has the action, use it and change only its knobs, style, energy, look or effects — a way of walking = walk/jog/run with a style (sneak = sneaky, limp = hurt; tiptoe = the tiptoe move); throwing anything, a power ball included = throw or the power moves (fireBlast… with a color/effect), never a home-made arm swing; a cartwheel or celebration = their library moves when listed. Only when NOTHING in the library fits, use the "custom" move to make an original move from key poses (whole moves, not a re-make of a library move). "wait" = do nothing (params seconds).
- Stage: figures are ${PLAN_HEIGHT} px tall, the ground is at y=${PLAN_GROUND}, the page middle is x=${STAGE_MIDDLE}; the page width is given with the request: keep every figure on the page. x = hip position at the start. facing: "right", "left" or "front" (facing the viewer).
- Two figures that interact face each other: the left one faces right. Say who a figure is in its id/name (dad, kid, baby, teen, giant): the engine sizes it by age. A fighting distance is about 0.6-1.2 x the figure height (180-360 px).
- Every action starts where the previous one ended. Time one character's action to another's moment with sync: { mark: the mark in THIS action, at: "<characterId>.<moveId><n>.<mark>" (n = 1 for that character's first such move), offset: seconds }. Reactions (getHit, block, almostFall, barraged, slammed, spunThrown, coverUp) are timed automatically to the strike of "from".
- params is a list of { name, value } where value is JSON text: { "name": "distance", "value": "300" }, { "name": "target", "value": "\\"b\\"" }.
- Knobs per character and per action: style (${styleLesson().map((s) => s.style).join(", ")}), speed (${MOVE_SPEEDS.join(", ")}), energy 0..1 (0.5 normal; higher = stronger, bigger).
- color: a #rrggbb color for a figure. canvasColor: the PAGE background color only when the user asks for one. fps only when the user asks for a frame rate.
- Objects: ball / basketball / box with size px and heldBy (a character id). Throw/catch/pickUp pass them.
- Effects: { kind, start, end (seconds), anchor (a character + joint, an object id = on that object, or a stage x,y), target, params, layer }. Joints: ${JOINTS.join(", ")}. Powers (fireBlast, iceBlast, laserEyes…) make their own effects: do not add them again. params.size (effects and background pieces) is x the figure's height (0.06 a bubble, 0.3 a moon), never px. Background pieces are listed below; leave background [] unless asked.
- Wearables (wears): ${Object.entries(ACCESSORIES).map(([id, a]) => `${id} (${brief(a.about, 80)})`).join("; ")}. Weapons (weapon param of the weapon moves): ${Object.keys(WEAPONS).join(", ")}.
- ORIGINAL MOVES AND POSES: anything not in the library is a "custom" move: write only its rough KEY POSES (see its description and the reference key poses below for real angles); the engine adds anticipation, acceleration and deceleration, follow-through, gravity, planted feet and balance. A held pose is a key with hold. A key's "pose" is ALWAYS an object of joint ANGLES in degrees — NEVER words: {lean, head, lShoulder, rShoulder, lElbow, rElbow, lHip, rHip, lKnee, rKnee}; side view facing right; 0 = down the parent bone, + = toward the front: lean = torso tilt (forward +), shoulders/hips = upper arm/thigh from the torso's downward line (90 = straight forward, 180 = straight up, negative = behind), elbows bend 0..150 (+ only), knees bend 0..150 (+ only). Standing = {lean:0, head:0, lShoulder:8, rShoulder:-6, lElbow:14, rElbow:10, lHip:3, rHip:-3, lKnee:3, rKnee:3}. A custom move is side view: give the figure facing "left" or "right", not "front". The engine checks ${POSE_KINDS.join(", ")} poses against its body rules. A figure can TURN INTO a symbol: effect transform (anchor {character, joint:'hip'}; params {into:'car', size:0.45, path:[{t: seconds after the morph, dx, dy px}], back}) — the engine does the crouch, the morph, the sparkles and the eased drive/flight. It STAYS that form (back:true only if the user says it changes back); going TO a thing (the moon) = the path ENDS at it, along the floor then up. One walk/tiptoe lasts at most ~8 s at its own speed (tiptoe = short). A still prop (a moon) = effect prop {symbol:'moon', size}; end both at the scene's end and give the figure actions that last that long. Symbols: the built-in ones (car, moon, grenade, sword…); otherwise use objects (ball, box), weapons and effects. Every thing named is SHOWN; no symbol = prop params.parts [{shape:rect|round|ellipse|line,x,y,w,h,color}] (a mailbox). Draw it like the REAL thing: true shape and proportions + the details that make it recognizable (4–8 parts; ellipse = egg/ball/head, a cylinder seen from the side — a can, a pillar, a bottle — is a tall "round" rect with caps); nothing floats — it stands on a base or hangs from a chain.
- FOLLOW-UPS: when a previous plan is given, return the SAME plan with ONLY what the user asked changed. Prefer edits (plan null) when the change fits an edit kind: stronger/weaker (an action: character + move + nth, 1-based), faster/slower, color, bigger/smaller (an effect kind), effectParams (an effect kind + its own params: count, size, motion...; the SAME effect, edited), replace (newMove), add (after the referenced action), remove, rename, fps, backgroundColor, skyColor. Otherwise return the whole plan with everything else EXACTLY as before. Never turn it into a different scene.
- REVIEW: when the engine reports problems with your plan, fix only those problems and return the corrected plan.`;

// SCENE LESSONS from Arthur's reviews (2026-10-07 round 2). Effects that may not exist yet are named only when they do.
export function sceneLessons(): string {
  const has = (id: string) => Boolean((EFFECTS as Record<string, unknown>)[id]);
  const storm = (BACKGROUND_PIECES as Record<string, unknown>).thunderstorm ? "the thunderstorm background piece (dark sky + heavy rain + frequent lightning)" : has("thunderstorm") ? "the thunderstorm effect" : "a dark canvasColor (#1d2333) + HEAVY rain (the rain background piece, dense) + FREQUENT lightning effects (one every 1-2 s over the whole scene)";
  return [
    "SCENE LESSONS:",
    "- FIGHTS: the fighters START at striking distance (about 200-260 px apart, facing each other); a beam, blast, throw or power starts about TWICE that apart, so it is seen travelling. Repeated strikes at the same target need NO `distance` (never walk out and back between punches) and NO `hand` (the engine alternates hands; never 3 in a row with one hand); about one strike per second; the defender's block / getHit is synced to each strike.",
    "- PARKOUR over N spikes (or gaps): run, then a RUNNING jump over EACH spike standing alone (jump straight after a run; `height` just enough to clear it, about 0.3-0.6), then run on; spikes under a body height apart get NO jump: the run strides over them at the same speed (a foot between), never hop-stop-hop. Put the spikes in the background ON the runner's path. Keep the course about one page long (runs ~100-200 px) so the figure stays big.",
    "- KNOB LIMITS: jump `height` is x BODY HEIGHT (0.1-1.2, never a pixel number); `distance` is px. Every figure stays on the page for the whole scene: a long run over a narrow page = shorter distances.",
    `- THROWING a power ball = \`throw\` with the object (a colored ball): its glow/fire effect is ON the ball (anchor {object: "<ball id>"}: it follows the ball in the hand and in flight), and the burst (explosion / fireBurst / splash) is WHERE it lands (anchor {object: "<ball id>", landing: true}; "bursts into stars" = sparks {burst: true, stars: true}). The engine throws a glowing ball overhand. The burst matches what it is MADE OF: fire → a small fireBurst sized by the fire, electricity → flash + sparks, magic/energy → a glowing flash (or what it bursts into), water → splash; only glass/ice shatters.`,
    `- THUNDERSTORM = ${storm}. OUTDOORS THE GROUND SHOWS THE PLACE (a ground piece: grass; white only for snow, sand for a beach, gray rock on the moon).${has("bubbles") ? " BUBBLES = the bubbles effect." : ""}`,
    "- EDITS change ONLY what was asked; faster / slower / smoother / slow motion change ONLY the timing (speed, seconds), never the moves, places or effects.",
    "- FACING: a move shown TO the viewer faces the screen: a cartwheel (start facing \"front\"; it is front view by itself), waving at the camera, a victory pose to a crowd. Backflips / front flips are SIDE view, from a walk or run facing left/right.",
    "- PICK THE MOVE: only the asked action (tiptoe across = the tiptoe move only: no turning, no running); a victory = celebrate (one arm up, a dip first; kind hop = a small hop); A HELD POSE (superhero, ta-da, flexing) = custom facing left/right: a key with knees bent 20, then the pose held (dx 20, hold 1.2), e.g. superhero {lean:-8, head:-6, lShoulder:-25, rShoulder:-25, lElbow:45, rElbow:45, lHip:18, rHip:-18, lKnee:2, rKnee:2} (fists on hips, chest out, wide stance); A DANCE = custom in its style: 4-6 clear keys, hold 0.25 each, repeat 2 (robot dance = style robot, arms at right angles).",
  ].join("\n");
}

// A move's about, shortened, plus every knob it mentions (so a shortened about never hides a param).
function withKnobs(about: string) {
  const short = brief(about, ABOUT_CHARS);
  const knobs = [...new Set([...about.matchAll(/`([A-Za-z][A-Za-z0-9]*)`/g)].map((m) => m[1]))].filter((k) => !short.includes(`\`${k}\``));
  return knobs.length ? `${short} (also named: ${knobs.join(", ")})` : short;
}

// The stable instructions (built once).
let cached: string | null = null;
export function directorInstructions(moves: Record<string, MoveEntry> = LIBRARY): string {
  if (cached && moves === LIBRARY) return cached;
  const styles = [styleLesson().map((s) => `${s.style} (speed-up/slow-down ${s.speedUpAndSlowDown})`).join("; ")];
  const out = [
    HEADER,
    sceneLessons(),
    "PRINCIPLES (the rules the engine follows; the engine applies them, you plan WITH them):",
    ...PRINCIPLES.filter(isCore).map((p) => `- ${brief(p, CORE_CHARS)}`),
    `More engine rules (by name): ${PRINCIPLES.filter((p) => !isCore(p)).map(principleName).join("; ")}.`,
    "STYLES:",
    ...styles,
    `SPEEDS: ${MOVE_SPEEDS.join(", ")}`,
    "MOVES (id: what it does; knobs in `backticks` are params):",
    ...Object.entries(moves).map(([id, e]) => `- ${id}: ${FULL_ABOUT.has(id) ? e.about : withKnobs(e.about)}`),
    "REFERENCE KEY POSES (natural, normal speed, energy 0.5, facing right; t seconds, dx px forward, lift px, angles in degrees):",
    ...REFERENCE_MOVES.filter((id) => moves[id]).map((id) => referenceMove(id, moves[id])),
    "EFFECTS (kind: what it is):",
    ...Object.values(EFFECTS).map((r) => `- ${r.id}: ${brief(r.about, EFFECT_CHARS)}`),
    "BACKGROUND PIECES (kind: what it is):",
    ...Object.values(BACKGROUND_PIECES).map((r) => `- ${r.id}: ${brief(r.about, EFFECT_CHARS)}`),
  ].join("\n");
  if (moves === LIBRARY) cached = out;
  return out;
}

// The request (changes every time; goes after the stable part).
export function directorInput(req: { prompt: string; fps: number; stageWidth: number; previousPlan?: ScenePlan }, review?: { plan: ScenePlan; problems: string[] }) {
  const left = Math.round(STAGE_MIDDLE - req.stageWidth / 2), right = Math.round(STAGE_MIDDLE + req.stageWidth / 2);
  return JSON.stringify({
    request: req.prompt,
    page: { width: Math.round(req.stageWidth), visibleX: [left, right], groundY: PLAN_GROUND, figureHeight: PLAN_HEIGHT, fps: req.fps },
    ...(req.previousPlan ? { previousPlan: planTo(req.previousPlan) } : {}),
    ...(review ? { yourPlan: planTo(review.plan), engineFoundProblems: review.problems, task: "Fix these problems and return the corrected plan (only what is needed)." } : {}),
  });
}
