// SPEC-0021 PHASE 5 — CLAUDE IS THE APP'S AI ANIMATOR (the same loop Arthur passed on the review page, now inside the app):
// the user's words → Claude writes a scene plan in VERSION 1's format (the passed moves library) → the engine builds it → THE LAWS
// (checker only) → Claude fixes only what broke (≤ 3 rounds) → the better version, or an honest refusal. EDITS: Claude gets the
// project's current plan and changes only what was asked. Server only (the API key never reaches the browser).
// Money: every call is priced (upper estimate) and added to CLAUDE_TEST_SPEND_FILE; refused before CLAUDE_TEST_BUDGET_USD
// (default $20 — the test budget Arthur's dad approved, Sun 2026-10-11).
import { urgentTalks } from "../moves/talk.ts";
import { appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { LIBRARY } from "../moves/library.ts";
import { pullsFromCustom } from "../moves/pullPlan.ts";
import { doorsSwing, pushesFromCustom } from "../moves/pushPlan.ts";
import { hugsFromCustom } from "../moves/hug.ts";
import type { Action } from "../moves/plan.ts";
import { PROPORTIONS, STAND } from "../rig.ts";
import { NEVER_TAUGHT } from "../moves/customExamples.ts";
import { PLACED_SYMBOLS } from "../symbolMaker.ts";
import { COMBO_TESTS } from "../moves/tests.ts";
import { effectsTestButtons, makeEffectsTestScene } from "../moves/tests2c.ts";
import { aimRealHits, directBeats } from "../kimodo/director.ts";
import { fillLiveMotions, sizeOneFigure, withoutClips } from "../kimodo/live.ts";
import { BACKGROUND_PIECES, EFFECTS, heldTip } from "../effects/index.ts";
import { toolAtThing } from "./toolAtThing.ts"; // (THE TOOL'S WORKING END REACHES THE WORKED THING)
import { intentTouches, partnersTouchInTime, touchIntentBuilder } from "./touchIntent.ts"; // (THE BODY GOES TO THE THING IT SAYS IT TOUCHES)
import { buildScene } from "../engine.ts";
import { tripsAtTheThing } from "../moves/tripAtThing.ts";
import { measurePlan, type Measure } from "../laws/measure.ts";
import { lawKind } from "../laws/kinds.ts";
import "../moves/transform.ts";

export const CLAUDE_ANIMATOR_MODEL = process.env.CLAUDE_ANIMATOR_MODEL ?? "claude-sonnet-5-5";
const PRICE = { in: 2, cacheRead: 0.2, cacheWrite: 2.5, out: 10 }; // claude-sonnet-5-5 real prices per million tokens (Anthropic price list)
const SEARCH_USD = 0.01; // (a web search's own fee, counted on the safe side — about a cent each)
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
  // THE ENGINE WRITES THE BOOK (Arthur's audit, Oct 12: the parkour recipe he passed was not in the book, so Claude never saw it):
  // EVERY passed scene recipe (the Engine-test buttons) is shown; claudeGuide.test.ts fails if a move, an effect, a background
  // piece, a drawable symbol or a passed recipe is missing — the engine learns something, Claude knows it.
  const SCENE_IDS = effectsTestButtons().map((b: { id: string }) => b.id);
  const sceneExamples = effectsTestButtons().filter((b: { id: string }) => SCENE_IDS.includes(b.id)).map((b: { label: string; make: () => unknown }) => { try { return `${b.label}:\n${JSON.stringify(b.make())}`; } catch { return ""; } }).filter(Boolean).join("\n\n");
  const LOOK = { style: "natural", speed: "normal", energy: 0.7, direction: 1 };
  const examples = ["passBack", "sneakRun", "blockBlockHit", "tripFall"].flatMap((id) => COMBO_TESTS.filter((t) => t.id === id)).map((t) => `${t.title}:\n${JSON.stringify(t.plan(LOOK as Parameters<typeof t.plan>[0]))}`).join("\n\n");
  return `You are the ANIMATOR of Diamond Animator. For the user's sentence you write a SCENE PLAN (JSON) for a 2D stick-figure
  animation; the engine animates it with its passed moves library (math: real joints, feet planted, eased timing). Then the LAWS
  measure it and you look at pictures of it, and you fix only what is wrong.

  PEOPLE ARE REAL MOTION (Oct 17 — read this first): every person's body is moved by realMotion (Kimodo, real people), also
  when two people's HANDS MEET — a high five, a fist bump, a handshake, handing a thing over. NEVER use the old moves
  "highFive", "fistBump", "handshake", "walk", "wave", "nod", "point" for people any more: write realMotion steps + "beats"
  (rules below). The old engine moves are only for what real people cannot do (magic, effects) and for hits that land.

  SEVERAL PEOPLE WHO DO NOT TOUCH = REAL MOTION TOO (Oct 17 R2): when the figures do not touch each other (walking together,
  waving, talking, pointing and nodding, working side by side, a chase, a crowd cheering), EVERY figure gets its own ONE
  realMotion with \`steps\` (the rules below), and they share ONE CLOCK: step 1 of every figure starts at 0 s, so line them
  up with the step seconds — a figure that waits for someone says so ("A person stands still and watches." for the seconds
  until its cue), then reacts. Each figure is made from real people separately; the engine gives each its own seed, so two
  people never move like copies (vary the words a little too). Place them: people who talk or wave to each other FACE each
  other (left one "facing":"right", right one "facing":"left") about 1.5 figure heights apart; people walking or running
  together face the same way, a little apart; a chaser starts behind the runner and starts a beat later. A leader who sends
  others somewhere stands BEHIND them on the side away from where he points and they FACE HIM while he points (he points past
  them): leader "A person points forward with the right arm straight out." (starting at once); the others: "A person stands
  and watches." (about 1 s — waits are short) → "A person nods yes, moving the head up and down several times." (1.5 s,
  "show": ["nod"]) → "A person turns around and walks forward." People who watch or listen to someone always FACE them.
  People who listen nod the same way ("show": ["nod"] — the engine keeps the take that really nods); people who talk move
  their hands ("A person talks, moving both hands while speaking."). Nobody walks through anybody: the engine keeps them apart. People whose HANDS MEET (a high five, a fist bump, a handshake, handing a thing over) are real
  motion too: each gets its own realMotion with steps, the two FACE each other, and the plan gets "beats": [{"by": "<first id>",
  "on": "<second id>", "result": "touch"}] — the director lines up their clocks and places them so the hands meet (only where
  they stand and when; their motion is Kimodo's own). Words, one person each: "A person walks up to someone and gives a high
  five with the right arm reaching straight out, hand raised high." (every touch: "show": ["reach"] — the engine keeps the take
  whose arm reaches out furthest, so the two can stand a real arm's length apart) / "A person bumps fists, pushing the right fist straight out forward at chest height." / "A person
  shakes hands with the right hand." HANDING A THING OVER (a hammer, a ball, a cup): the giver "A person walks forward and holds
  out the right hand, handing something over." (the thing is a held prop anchored to the giver's "rHand" with "giveTo": the
  taker's id — the engine moves it into the taker's hand the moment their hands meet); the taker "A person stands, then
  reaches out the right hand and takes something, then holds it." Hits that land (a punch, a push, a fight, a hug) keep using
  the engine's moves — not realMotion.
  ONE PERSON = REAL MOTION (Oct 17): when the scene has ONE figure, its body is moved by REAL human motion (Kimodo makes it live
  from real people) — ONE realMotion action with \`steps\`: the action in order as SHORT steps, each ONE simple thing the body
  does, starting "A person", with its \`seconds\` (0.6–4; all steps together = the length the user asked for, else about 4–6 s):
  {"move":"realMotion","params":{"steps":[{"text":"A person walks forward.","seconds":1.5},{"text":"A person slips and falls
  backward onto their back.","seconds":2},{"text":"A person lies on the ground.","seconds":1}],"show":["slip"]}}
  - Say only what the BODY does, in plain common words — no objects, places or other people it would have to touch.
  - Say HOW it looks when that matters, in body words: a march = STOMPING with HIGH steps, never wide steps and never a jog (Arthur, Oct 17):
    "A person marches in place like a soldier, stomping: lifting each knee up high and stamping each foot down hard." (or
    "marches forward …, stomping: …" when they go somewhere) with "show": ["knees-high", "stomp"]. A count = repeat the step ("A person does
    a jumping jack." ×3). Words like "run", "jog", "jump", "hop", "skip" only when the user asked for them — the engine keeps only
    takes with one foot on the ground otherwise.
  - Turning: a turn and the walk after it are ONE step, in Kimodo's own words: "A person walks forward, turns around and walks
    back." (never "A person turns around." then "A person walks forward." — Kimodo then forgets to go back) with "show":
    ["turn-around"]. Never "spins" or "twirls" unless the user asked — the engine drops a take that spins more than the words say.
  - Running and jogging leave the ground (that is right for them): "A person runs forward fast." / "A person jogs forward at an
    easy pace." Walking never does.
  - An accident happens IN the middle of something: a slip or trip starts while walking, never from standing still.
  - Hopping, jumping or running only when the user asked for it. No engine moves for that figure.
  - \`show\` (optional): what the action must clearly SHOW — any of "knees-high" (march: knees up to hip level), "stomp" (each foot stamped down hard: marching, stomping), "turn-around" (ends up facing the other way), "nod" (the head really nods up and down), "big-steps", "slip" (a slip or
    trip: the foot shoots out before the fall), "fast-fall" (falls, knock-downs), "hands-up" (cheers, reaching up). Kimodo makes 3
    takes and the engine keeps the one that shows it most.

  TOUCH MEANS TOUCH: when a hand / foot / held tool must touch something (lighting a fire, pressing, knocking, painting, pushing),
  give the effect a \`cause\` (that hand) and place the figure within reach (step, kneel, bend; a custom key's rHand/lHand target on
  the spot). The BODY GOES TO THE THING — never move the thing to the hand (the engine also does this for you; law "touches").
  A STRIKE HAS A TARGET: a punch or kick lands on something — a pad or board a partner holds out (strike that thing, at its
  height), a hanging bag, or an opponent — never thin air, unless the user asked for a kata / shadow boxing. Teaching or copying
  a move = side by side facing the same way (each at their own bag), or the teacher holding pads facing the student at striking
  distance (law "strikeAtNothing").

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
    "notes"?: "ONLY what you could not make exactly as asked IN THIS REQUEST, in one or two short plain sentences a 12-year-old understands — no numbers like px, no figure ids or letters, no engine words; null if everything was made",
  "objects"?: [ { "id": "ball", "look": { "kind": "ball", "size": 44, "color": "#e02424", "filled": true, "detail": "plain" }, "heldBy"?: "a" } ] }
  Each figure's actions run in order; "stand" {seconds} is ONLY for a wait the user asked for (the "idle" law measures it). Two figures that meet line up with
  "sync" (e.g. the second high five's "slap" at "a.highFive1.slap"). Distances are px; the engine keeps the feet planted.
  THE MOVES (id: what it does and its params):
  ${Object.entries(LIBRARY).map(([k, v]: [string, { about?: string; title?: string }]) => `- ${k}: ${String(v.about ?? v.title)}`).join("\n")}
  YOUR OWN POSES AND MOVES ("custom"): ANY pose or move not in the list — a different way to sit, a bigger stomp, a dance, a
  pose the user describes — is written with "custom" key poses. NEVER say a pose or move "cannot be animated": write it.
  PULLING anything (tug of war, a rope, a sled, a cart, a stuck door, a bell rope) is the "pull" move, never custom keys; the rope is a
  "prop" with "string": true from the puller's rHand to the other end (the other puller's lHand), drawn taut in bright rope brown.
  A tug of war someone WINS ends with the losers falling: give the loser's pull role "lose" then a forward fall (or "fall": true) —
  the winners give one huge last heave, the losers are yanked off balance and fall flat (they stay down unless the fall says
  getUp: true); a winner who then cheers lets go and the rope's end falls to the ground like a whip by itself.
  TALKING (telling, asking, giving directions, arguing) is the "talk" move — a stick figure has no mouth, it SAYS things with
  gestures (point, point, tap the shoulder…); the LISTENER answers with its own "talk" (say "yes" / "look") synced to the speaker's
  mark. An EMERGENCY talk ("urgent": true — hurry, danger, get out) turns to face the viewer and points / waves big and fast; a calm talk stays side-on. TOGETHER, NOT TWINS: figures cheering / celebrating / waving together get the same move with "kind" left open — each plays its own version.
  Angles in degrees, side view facing right, 0 = straight down the parent bone, + = toward the front:
  lean (torso tilt, + forward), head (tilt on the torso), lShoulder / rShoulder (upper arm from the torso's down line: 90 = arm
  straight forward, 180 = straight up, -40 = back), lElbow / rElbow (forearm bend, 0..150), lHip / rHip (thigh: 90 = knee up
  in front, -30 = leg back), lKnee / rKnee (shin bends back, 0..150). Standing: ${JSON.stringify(STAND)}.
  Examples the engine passed: ${JSON.stringify(NEVER_TAUGHT.robotDance)} ${JSON.stringify(NEVER_TAUGHT.victory)} ${JSON.stringify(NEVER_TAUGHT.dab)}
  Give every custom move a clear "name" that says what it is ("windmill spin", "flying kick", "victory dance") — the laws read it.
  TIME LAPSE: the plan's "timeScale" (5–10) plays the WHOLE scene that many times faster — a real time lapse (a day of work in a few
  seconds). Write the moves at normal speed; the clock does the rest.
  STRENGTH ↔ RESULT: a kicked or punched ball flies by the move's "energy" (0.3 a soft tap … 1 a huge kick); a heavy thing is lifted
  slowly ("speed": "slow", big wind-up); anticipation always goes OPPOSITE the action (wind down before an upward throw).
  SMALL THINGS, SMALL EFFECTS: a candle's smoke "size" ≈ 0.02, a pot's steam ≈ 0.03, a campfire's smoke ≈ 0.1; water is calm unless the
  user asks for waves. Breaking a rock / stone / brick thing: thingBreak with "material": "rock".
  FRAMING: the figures decide the framing — put things close to them (a thing placed far off to one side gets cut off, never shrinks
  everyone).
  BREATHING: a figure's "breath" (0.3 barely, calm … 1 normal … 1.6 heavy, out of breath) — "breathe less" = a lower "breath"
  (and no "catchBreath" move). TIME LAPSE / FAST-FORWARD / SPED UP: the user asks for speed — use "speed": "fast" and quick,
  many small actions (the speed law steps aside when the words ask for it).
  SKY AND TIME OF DAY: sunrise / sunset / night = the "sky" piece's colors (warm orange-pink low, deep blue-purple high for a
  sunset), a low "sun", darker ground and trees for night — an edit changes only those colors.
  BIGGER / SMALLER / HARDER / SOFTER: "energy" (0.2 small and soft … 1 huge and hard) and "speed" change any library move — a
  "bigger stomp" = "stomp" with energy 1 (and custom keys for an even bigger one).
  VERSION 1's PASSED PLANS (copy their style):
  ${examples}

  EFFECTS ("effects": [ { "kind", "start", "end" (seconds), "anchor": { "x", "y" } | { "character": id, "joint": "rHand"|"lHand"|"head"|"hip"… },
    "target"?: same shape, "params"?: {…}, "layer"?: "back"|"front" } ] — fire, smoke, lightning, explosions, a held SWORD
    ("heldWeapon" on the figure's hand: swords need it or they are not drawn), text…):
  ${Object.entries(EFFECTS).map(([k, v]: [string, { about?: string; title?: string }]) => `- ${k}: ${String(v.about ?? "").slice(0, 600)}`).join("\n")}
  BACKGROUND ("background": { "pieces": [ { "kind", "params" } ] } — a place built from what the user says; copy the examples):
  ${Object.entries(BACKGROUND_PIECES).map(([k, v]: [string, { about?: string }]) => `- ${k}: ${String(v.about ?? "").slice(0, 400)}`).join("\n")}
  THINGS — YOU CAN DRAW ANY THING (never say a thing "cannot be drawn"): a "prop" effect is a thing on the page.
  - A ready symbol: "params": { "symbol": one of ${Object.keys(PLACED_SYMBOLS).join(", ")}, "size": its height x the figure's }.
  - ANY OTHER THING (a desk, a chair, a laptop, a mug, a table, a bed, a door, a tent, a house front, a sign, a lamp, a book…) is
    BUILT FROM SIMPLE PARTS: "params": { "size": its height x the figure's height, "parts": [ { "shape": "rect" | "round" |
    "circle" | "ellipse" | "line", "x", "y" (the part's middle, in units of the size, 0,0 = the thing's middle, + right / down),
    "w", "h" (units of the size; a line goes from x,y to x+w,y+h), "color" } ] } (up to 16 parts; real colors; it must LOOK like
    the thing). Its lowest part stands ON the floor by itself; one placed higher hangs on a chain unless "flies": true.
    A thing ON A WALL (a window, a poster, a picture, a chalkboard, a clock, a sign, a button panel, a screen) gets "onWall": true
    at its spot: it hangs on the room's back wall (the backdrop). Believable sizes next to a person: a skateboard about half a
    figure long (deck + 2 wheels), a ball ~0.15 of the figure, a box 0.3–0.5, a bucket ~0.25, a shovel ~0.6 — never a tiny speck.
  - A HELD THING (a mug, a phone, a book, a torch…): anchor { "character": id, "joint": "rHand" | "lHand" }, "layer": "front" —
    it moves with the hand; the other hand must not rest on it. A SWORD or bat uses "heldWeapon" instead.
  - A THING ON A STRING (a kite, a balloon, a leash, a fishing line, a rope): the thing's prop gets "string": true (or a color)
    and "target": { "character": id, "joint": "rHand" } — a string from the thing to that hand, sagging and swaying. A flying
    thing ("flies": true, or a kite / balloon / bird) drifts and tilts gently on the air by itself.
    A PULLED rope (tug of war, hauling, a leash pulling) adds "taut": true — a straight, tight line.
  - DEPTH — BEHIND AND IN FRONT: a figure (or one action) can say "depth": "behind" | "front" | "around". Walking past each
    other on a sidewalk: the one on the far side gets "depth": "behind". A HUG is the "hug" move for BOTH figures (they walk in chest to chest themselves); the front one's hug gets "depth": "around"
    (in front, its far arm goes round the other's back). A body swung or walking round another switches behind / in front by
    itself (the engine sees it go round). HIDING BEHIND a bush / tree / wall / box: the hider gets "depth": "behind" and the
    prop it hides behind gets "layer": "front" and is big enough to cover it (a bush ≈ 0.6 x height for a crouching hider);
    keep the others out of that prop's width while they look (it covers whoever stands behind it). HIDING MUST READ: the
    engine sizes the cover so the top of the hider's head shows; give the hider a peek (rise up a little, look, duck back down)
    while the seeker is not looking. A seeker walking past IN FRONT of the cover is drawn in front of it by the engine.
  - A SCENE THAT OPENS MID-POSE (already sitting at a desk, lying in bed, crouched): the first "custom" move gets
    "startsInPose": true — the figure is in its first key's pose from the first picture.
    SITTING ON THE FLOOR FROM THE START: the figure gets "start": "sitting" and its first move is "sit" with "seconds" = how long it
    stays down — it is already sitting (never stands first), then stands up at the end of that sit.
  - SITTING ON A CHAIR / BENCH / STOOL: a "custom" move with "seated": true and a seated pose (lHip/rHip ≈ 90, lKnee/rKnee ≈ 90,
    feet "both"); the hips end about 0.17 x the figure's height BEHIND its x — put the seat's middle there, seat top ≈ 0.23 x
    height above the floor. A desk's front edge is right at the figure's x (the knees go under it); the typing hands reach about 0.1 x height in
    front of x.
  - HAZARDS ARE CLEARED IN TIME ("hazard" law): spikes and pits are jumped BEFORE the feet reach them (one "jump" per row, like
    the passed parkour recipe) — the engine slides each row under a jump; a figure that runs into one without a jump is broken.
  - NOTHING IS LATE: a reaction, a catch, a jump, a hit is exactly on time — never after the moment it belongs to.
  THE CAMERA (cuts to new places, figures running off / in, screen shake):
  ${CAMERA_DOC}
  (There is NO zoom in / zoom out yet — tell the user plainly in "outside" if they ask for one.)
  PASSED SCENES — every recipe Arthur passed (effects, places, the camera, swords, parkour — learn how they are built; never copy one as the answer):
  ${sceneExamples}

  RULES FROM ARTHUR'S REVIEWS (always):
  - A BIG EVENT GETS A REACTION FROM EVERYONE: an explosion or a blast — whoever is near is blown away ("blownAway" with "from" =
    the blast point, synced to the blast); whoever is farther away, the thrower too, STARTLES ("blownAway" with "from" = the blast
    point and a small "strength" like 0.3: a flinch, an arm up, a step back), synced to the blast. Nobody ignores an explosion.
  - A FALL OFF ANYTHING HIGH (a cliff, roof, ledge, stairs) is "tumble": the ground line is the top; the drop is a "pit" background
    piece; rocks / ledges / steps on the way down are props ("name": "ledge", parts, "onWall": true) — the engine finds them and the
    body bounces off each one, left and right, down to the bottom. Follow with "getUp" if they get up.
    EVERYTHING RESTS ON SOMETHING: put each rock / ledge against the pit's wall (its side touching the wall) or on the floor — the
    engine joins a floating one to the nearest wall or gives it a pillar, and a rock in the open air breaks the "floats" law.
  - NOTHING UNASKED: no "celebrate", wave or extra move nobody asked for (a fight's winner may celebrate at the very end).
  - A THING ALREADY THERE IS ALREADY THERE: a campfire, a torch flame, lights already on at the start: its effect starts at -1.5
    (before the scene) so it is fully burning in the first picture, and ends after the scene's end.
  - EVERYTHING HAS A CAUSE (nothing from thin air): a fire someone LIGHTS gets "cause": { "character": id, "joint": "rHand" }
    (the hand holding the match / lighter / torch prop) — the engine starts it the moment that hand touches its spot and it grows
    from a flicker, so the figure must really bend / kneel and reach the spot with the match. CAUSE CHAINS: prepare → act →
    CONTACT → small effect → big effect — the engine makes lighting a strike (the match / lighter hand lifts, strikes the spot,
    a spark, then the flame), breaks a "thingBreak" the picture the fist / foot lands, and a board / pad held out to be struck
    is held UPRIGHT in BOTH hands by a braced holder who absorbs the hit — so just give the "cause", the held prop and the strike.
    A CONTACT HAS A CONSEQUENCE: a hand that touches a fire / electric fence / ice / spikes / hot stove reacts by itself (burn,
    shock, cold, spikes) and a strike on a held thing pushes the holder's arms back — so warming hands = beside / above the fire,
    never in it (the engine keeps the gap); name a hazard prop plainly ("electric fence", "hot stove", "ice block"). Bubbles: anchor them on the wand hand
    (they come out of it). Blowing out a candle / fire: just end the "fire" when the blow lands — the engine shrinks it and adds the
    thin smoke rising from it. An explosion / fireBurst where a fireball lands is started by the engine when the fireball ARRIVES.
    DIGGING: a "pit" with "dugBy": the digger's id (holding a "shovel" prop), the digger doing several dig strokes ("custom", the
    shovel hand going down into the pit each time) right beside it — the hole starts as a dent and gets deeper at every dig, a dirt
    clump rides the blade and lands on the pile, which grows at each toss (the hand's highest moment after a dig). Things that come out of something (smoke, steam, bubbles, sparks)
    are anchored ON their source (the fire's spot, the wand hand) — the engine makes them start small there and grow out of it.
    PLANTING A FLAG / SIGN / STAKE: a "flag" prop on the carrier's hand AND the same prop standing at the spot (anchor x, ground y);
    the carrier walks there and pushes it down ("custom": lean in, hand down). The engine shows the standing one only from that
    push, where the hand put it, and ends the carried one then.
    A STONE / thing thrown into a lake (a "water" background piece, x = its middle, w narrower than the page = a pond with a natural shore) splashes and is gone — the engine adds the splash and
    ripples; never a stone lying on the water.
    PAINTING / DRAWING / WRITING on a canvas, wall or board: a "paint" effect (anchor = the canvas middle at shoulder height, w, h,
    color, "by": the painter) + a "paintbrush" prop on the painting hand; the paint appears ONLY where the brush goes, so the
    painter's keys use HAND TARGETS tracing the shape (a sun: ~10 keys round a circle, then each ray out and back), the canvas
    middle ≈ 0.22 forward, 0.8 up, w ≈ h ≈ 0.32 (small enough to reach every part). The engine draws: body, canvas, then the hand + brush in front.
  - HAND TARGETS: any "custom" key may give "rHand" / "lHand": { "x": forward from the hips, "y": up from the floor } (x height;
    the arm reaches ≈ 0.3 from the shoulder at 0.75 up; further = the body leans) — the engine bends that arm so the hand is
    exactly there. Use it for pointing, pressing a button, touching a thing, writing / painting a shape.
    Smoke from a candle / match / small flame: "smoke" size under 0.05 = one thin wavy wisp. Small fires make small smoke.
    Smoke rises STRAIGHT UP from its flame; give "wind" only when the scene has wind (small, ≤ 1). A carried torch's smoke trails behind it by itself.
    EMITTERS ONLY WHEN THEIR CAUSE IS TRUE: bubbles from a held wand come out only while the wand's loop is AT THE MOUTH (hand target
    at the mouth: x ≈ 0.12, y ≈ 0.85) or waved fast; a whistle / trumpet only at the mouth. Lowering the wand stops new bubbles by itself.
  - THE WORLD DOES THESE BY ITSELF (never add them yourself): every sword block sparks ON THE BLADE near the tip; a thing standing
    next to an explosion (a car, a crate…) breaks into its real pieces (a car: wheels, front, back, doors, roof, glass) that fly.
    So: give swords to sword fighters (heldWeapon) and put the thing that explodes right where the explosion is.
  - A NAMED PLACE (a park, a kitchen, a boxing ring, a street at night, a classroom, a gym, a beach, a rooftop…) = ONE "place"
    piece { "kind": "place", "params": { "place": "<the user's place words>", "time": "day" | "sunset" | "night" } } — it draws the
    whole place (sky or walls, ground or floor, the things that belong there, the light); never rebuild it from sky/ground/hills.
    A story that names a place and has no background gets it from the engine by itself.
  - NEVER IGNORE ANY PART OF THE REQUEST. Every thing the user asks for must be in the plan. Places are built ONLY from these
  background pieces: ${Object.keys(BACKGROUND_PIECES).join(", ")} (a pond / lake / swamp water = "water"; a swamp = water + trees +
  grass + a darker sky…). If something truly cannot be made (not a piece, not an effect, not a move), make the closest honest
  version AND say it plainly in the plan's "notes" field (e.g. "There is no house piece yet, so they walk off toward the trees.").
- ONE PLACE: the whole animation happens in ONE place, as ONE continuous shot — never add "cuts", a new place or a jump in time
  unless the user asks for a new place, a new scene or a time skip. When the user later asks to continue in a new place, add
  exactly that one scene and keep everything before it exactly as it was.
- THE FOLLOWING CAMERA ("camera": { "follow": "<figure id>" | "all" }): for a walk, run, chase or race longer than the page.
  The figures keep their normal size and walk as far as the story needs (distances of 2000–4000 px are fine); the world is as
  wide as they go and background pieces WITHOUT x / w fill all of it; things placed with x can be anywhere along the path
  (x up to where they walk). The camera stays still until they pass the middle, then glides with them. One shot, no cuts.
- FIGURES NOTICE AND REACT: a figure hit by a thrown thing feels it (the engine adds the getHit, thrown AWAY from where it came
  from, and turns it to look at the thrower); figures near a hit look at it; figures near a grenade, bomb or explosion run
  away. Write what they do AFTER noticing (throw back, shout, chase) — never let them carry on as if nothing happened. A wave
  or high-five names who it is for ("to" / "with"): it faces that person.
- EACH THING FLIES ITS OWN WAY: name a thrown object what it IS in its id (frisbee, disc, paper plane, balloon, feather, ball,
  rock) — the engine picks the throw and the flight from that: a frisbee is thrown backhand and glides flat, hangs and drifts down
  to the catcher; a paper plane swoops; a balloon / feather floats slowly; a ball arcs. A trip on a rock / peel / hose: put the
  thing on the ground ahead of the runner and write run → fallDown; the engine times the fall to the step that meets it.
- WALKS keep a normal walking pace (no "fast" walk unless asked); after a stop or a wave, the next walk is still normal.
  - IN-BETWEENS ARE ACTION, NOT STANDING (Arthur, Oct 12; the "idle" law: at most 1.5 s of doing nothing, 1.4 s in a fight):
    between story beats every figure keeps doing what the scene is about — a FIGHT keeps fighting (more punches, kicks, blocks,
    a dodge, circling: an exchange every second), a HIKE keeps walking, a GAME keeps playing, a WORKER keeps working. No
    standing around, no looking around, no unasked stops — unless the user asks for a wait. One figure noticing something on
    purpose (looks at a butterfly) is fine when it fits.
  - NO PATTERNS, NO TWINS (Arthur: "they should feel like two separate people, not one machine"): two figures never move in
    sync unless the user asks — different start times (0.2–0.8 s apart), different distances and speeds or styles, one
    passes the other, one pauses a beat. Background pieces are never copies: different sizes, heights and spacing.

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

type Block = { type: string; text?: string; name?: string; id?: string; input?: Record<string, unknown>; citations?: unknown[]; [k: string]: unknown };
// ONE CLAUDE CALL, STREAMED: the answer arrives piece by piece, so the app can say live what Claude is searching for
// (Arthur: "say what it's searching about"). A web search can pause Claude's turn ("pause_turn") or eat the room it had:
// Claude then CONTINUES from where it stopped (up to 3 times) instead of failing — a search never ends in "Sorry".
async function streamOnce(system: string, messages: unknown[], o: { maxTokens?: number; signal?: AbortSignal; tools?: unknown[]; onSearch?: (query: string) => void }, key: string): Promise<{ blocks: Block[]; usage: Record<string, number> & { server_tool_use?: { web_search_requests?: number } }; stop: string }> {
  const res = await fetch("https://api.anthropic.com/v1/messages", { method: "POST", signal: o.signal, headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model: CLAUDE_ANIMATOR_MODEL, max_tokens: o.maxTokens ?? 6000, stream: true, system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }], messages, ...(o.tools ? { tools: o.tools } : {}) }) });
  if (!res.ok || !res.body) { let m = ""; try { m = ((await res.json()) as { error?: { message?: string } }).error?.message ?? ""; } catch { /* no body */ } throw new Error(`Claude could not answer (${res.status}${m ? `: ${m}` : ""}).`); }
  const blocks: Block[] = [], json: string[] = [];
  let usage: Record<string, number> & { server_tool_use?: { web_search_requests?: number } } = {}, stop = "end_turn", buf = "";
  const reader = res.body.getReader(), dec = new TextDecoder();
  const handle = (ev: Record<string, unknown>) => {
    const i = Number(ev.index ?? -1);
    if (ev.type === "message_start") usage = { ...(((ev.message as { usage?: typeof usage })?.usage) ?? {}) };
    else if (ev.type === "content_block_start") { blocks[i] = { ...(ev.content_block as Block) }; json[i] = ""; }
    else if (ev.type === "content_block_delta") {
      const d = ev.delta as { type: string; text?: string; partial_json?: string; citation?: unknown };
      if (d.type === "text_delta") blocks[i].text = (blocks[i].text ?? "") + (d.text ?? "");
      else if (d.type === "input_json_delta") json[i] += d.partial_json ?? "";
      else if (d.type === "citations_delta") (blocks[i].citations ??= []).push(d.citation);
    } else if (ev.type === "content_block_stop") {
      if (json[i]) { try { blocks[i].input = JSON.parse(json[i]); } catch { /* keep what came */ } }
      if (blocks[i]?.type === "server_tool_use" && blocks[i].name === "web_search" && typeof blocks[i].input?.query === "string") { try { o.onSearch?.(String(blocks[i].input!.query)); } catch { /* the live note is best effort */ } }
    } else if (ev.type === "message_delta") { stop = String((ev.delta as { stop_reason?: string })?.stop_reason ?? stop); usage = { ...usage, ...((ev.usage as typeof usage) ?? {}) }; }
    else if (ev.type === "error") throw new Error(`Claude could not answer (${(ev.error as { message?: string })?.message ?? "stream error"}).`);
  };
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let k;
    while ((k = buf.indexOf("\n\n")) >= 0) {
      const chunk = buf.slice(0, k); buf = buf.slice(k + 2);
      const data = chunk.split("\n").filter((l) => l.startsWith("data:")).map((l) => l.slice(5).trim()).join("");
      if (data) handle(JSON.parse(data) as Record<string, unknown>);
    }
  }
  return { blocks: blocks.filter(Boolean), usage, stop };
}
export async function askClaude(system: string, messages: Msg[], o: { maxTokens?: number; signal?: AbortSignal; tools?: unknown[]; kind?: string; onSearch?: (query: string) => void } = {}): Promise<{ text: string; usage: ClaudeUsage; searches: string[] }> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("The AI Animator's Claude key is not set up on this server.");
  if (claudeSpent() >= budget() - 0.25) throw new ClaudeBudgetError(`The AI Animator's test budget is used up ($${claudeSpent().toFixed(2)} of $${budget()}). No animation changed.`);
  const all: Block[] = [], convo: unknown[] = [...messages];
  const total = { inputTokens: 0, outputTokens: 0, usd: 0 };
  for (let leg = 0; leg < 4; leg += 1) {
    const r = await streamOnce(system, convo, o, key);
    const u = r.usage, searchCount = Number(u.server_tool_use?.web_search_requests ?? 0);
    const usd = ((u.input_tokens ?? 0) * PRICE.in + (u.cache_read_input_tokens ?? 0) * PRICE.cacheRead + (u.cache_creation_input_tokens ?? 0) * PRICE.cacheWrite + (u.output_tokens ?? 0) * PRICE.out) / 1e6 + searchCount * SEARCH_USD;
    total.inputTokens += (u.input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0); total.outputTokens += u.output_tokens ?? 0; total.usd += usd;
    const f = spendFile();
    if (f) { try { const L = existsSync(f) ? JSON.parse(readFileSync(f, "utf8")) : { total: 0, calls: [] }; L.total = +(Number(L.total ?? 0) + usd).toFixed(4); (L.calls ??= []).push({ at: new Date().toISOString(), model: CLAUDE_ANIMATOR_MODEL, usage: u, usd: +usd.toFixed(4), where: "app", kind: o.kind ?? "animate", stop: r.stop, ...(searchCount ? { searches: searchCount } : {}) }); writeFileSync(f, JSON.stringify(L, null, 1)); } catch { /* the spend note is best effort; the cap check above still ran */ } }
    all.push(...r.blocks);
    const answered = r.blocks.slice(r.blocks.map((c) => c.type).lastIndexOf("web_search_tool_result") + 1).some((c) => c.type === "text" && (c.text ?? "").includes("}"));
    // (paused by the search, or out of room before the answer: continue from exactly where it stopped)
    if (!(r.stop === "pause_turn" || (r.stop === "max_tokens" && !answered && o.tools))) break;
    convo.push({ role: "assistant", content: r.blocks });
    if (r.stop === "max_tokens") convo.push({ role: "user", content: "Continue: write your final JSON answer now." });
  }
  // (after a web search the answer is the text AFTER the last search result; the searched words are kept so the reply can say them)
  const lastTool = all.map((c) => c.type).lastIndexOf("web_search_tool_result");
  const searches = all.filter((c) => c.type === "server_tool_use" && c.name === "web_search").map((c) => String(c.input?.query ?? "")).filter(Boolean);
  return { searches, text: all.slice(lastTool + 1).filter((c) => c.type === "text").map((c) => c.text ?? "").join(""), usage: total };
}
export const firstJson = (t: string): unknown => { const a = t.indexOf("{"), b = t.lastIndexOf("}"); return JSON.parse(t.slice(a, b + 1)); };

// THE LAWS on a plan, built exactly as the workspace places it (makeEffectsTestScene at the page's 1920 stage).
// NOTHING IS DROPPED SILENTLY (Arthur: "it ignored the ponds"): a move, effect or background piece the engine does not know would be
// skipped without a word — it comes back to Claude as a problem instead.
function unknownNames(plan: Record<string, unknown>): string[] {
  const out: string[] = [];
  const shots = [plan, ...(((plan.cuts as Record<string, unknown>[] | undefined) ?? []))];
  for (const shot of shots) {
    for (const c of (shot.characters as { actions?: { move?: string }[] }[] | undefined) ?? []) for (const a of c.actions ?? []) if (a.move && !(a.move in LIBRARY)) out.push(`ENGINE: the move "${a.move}" does not exist — use a move from the list (or "custom" poses).`);
    for (const e of (shot.effects as { kind?: string }[] | undefined) ?? []) if (e.kind && !(e.kind in EFFECTS)) out.push(`ENGINE: the effect "${e.kind}" does not exist — use one from the list, or say plainly in "notes" that it cannot be made yet.`);
    for (const b of ((shot.background as { pieces?: { kind?: string }[] } | undefined)?.pieces) ?? []) if (b.kind && !(b.kind in BACKGROUND_PIECES)) out.push(`ENGINE: the background piece "${b.kind}" does not exist — build the place from: ${Object.keys(BACKGROUND_PIECES).join(", ")} (a pond = water), or say plainly in "notes" what cannot be made yet.`);
  }
  return [...new Set(out)];
}
// TIDY BEFORE BUILDING (free, no AI): a reaction to a strike ("getHit", a block, an almost-fall) is timed by the ENGINE to the
// moment the strike lands; a time Claude guessed itself would let a figure react before the punch (Arthur, Oct 12).
// A MOVE NAME THAT DOES NOT EXIST ("sitDownOn") would crash the build: the closest real move is used ("sit" — the longest library
// name the made-up one starts with, or that starts with it); a name with nothing close is left out (the reply's notes say what
// could not be made, and the request check sees it).
function knownMove(a: Record<string, unknown>): Record<string, unknown> | null {
  const m = String(a.move ?? "");
  if (!m || m in LIBRARY || m === "wait") return a;
  const low = m.toLowerCase(), names = Object.keys(LIBRARY);
  const close = names.filter((n) => low.startsWith(n.toLowerCase()) || n.toLowerCase().startsWith(low)).sort((x, y) => y.length - x.length)[0];
  return close ? { ...a, move: close } : null;
}
// PEOPLE WHO DO NOT TOUCH NEVER WALK THROUGH EACH OTHER (Oct 17 R2b — Arthur: in the chase the officer ran into and through the
// thief, and the two kept swapping in front / behind). When every figure moves by real motion (the scenes where nobody touches),
// the scene is built once and each pair's hips must stay at least half a figure height apart, on the SAME side they started on;
// if not, the second figure starts farther away by exactly what was missing (where it stands, never how it moves — Kimodo's
// motion is untouched). No overlap also means no front/back flipping (depth.ts orders figures only when they are close).
export function keepApart(plan: Record<string, unknown>): Record<string, unknown> {
  const chars = (Array.isArray(plan.characters) ? plan.characters : []) as { id?: string; x?: number; actions?: { move?: string }[] }[];
  if (chars.length < 2 || !chars.every((c) => (c.actions ?? []).some((a) => a.move === "realMotion"))) return plan;
  if (Array.isArray(plan.beats) && plan.beats.length) return plan; // (people who TOUCH are placed by the director — kimodo/director.ts)
  const gap = 0.5 * (Number(plan.height) || 300);
  for (let pass = 0; pass < 3; pass += 1) {
    let frames: { id: string; offPage?: boolean; skeleton: Record<string, { x: number }> }[][];
    try { frames = buildScene(makeEffectsTestScene(plan as never, 1920), 24).frames as never; } catch { return plan; }
    let moved = false;
    for (let a = 0; a < chars.length; a += 1) for (let b = a + 1; b < chars.length; b += 1) {
      const d = frames.map((f) => { const A = f.find((x) => x.id === chars[a].id), B = f.find((x) => x.id === chars[b].id); return A && B && !A.offPage && !B.offPage ? B.skeleton.hip.x - A.skeleton.hip.x : NaN; }).filter(Number.isFinite);
      if (!d.length) continue;
      const side = Math.sign(d.slice(0, 6).reduce((t, v) => t + v, 0)) || 1;
      const need = Math.max(0, ...d.map((v) => gap - side * v));
      if (need > 1) { chars[b].x = Math.round(Number(chars[b].x ?? 960) + side * (need + 10)); moved = true; }
    }
    if (!moved) break;
  }
  return plan;
}

// HANDING A THING OVER (Oct 17 R3 — Arthur: "walking over, here's my hammer, and he gets it"): a held prop with "giveTo": "<id>"
// stays in its holder's hand until the two people's hands are CLOSEST (after the director has made them meet), then it is in the
// other person's same-side hand. It never flies or teleports: at the switch the two hands are at the same spot. Only which hand
// holds it changes — both people's motion is Kimodo's own.
export function handOver(plan: Record<string, unknown>): Record<string, unknown> {
  // ONE THING, ONE OWNER AT A TIME (R3b — Arthur: "the hammers get duplicated… no objects are supposed to duplicate; if the person
  // had three items he should be able to give them"): a given thing stays ONE prop with an OWNER TIMELINE ("owners": who holds
  // it from when — effects/index.ts draws it once per picture, in its owner's hand). The switch is the touch pose the director
  // measured (plan.touchAt) — both hands are on it — else the picture where the two hands are closest. Two separate props
  // (the old way) made the first one DROP while the second was already in the taker's hand: a duplicate that floated.
  const effects = (plan.effects as HeldProp[] | undefined) ?? [];
  const giveOf = (e: HeldProp) => { const g = (e as { giveTo?: unknown }).giveTo ?? e.params?.giveTo; return typeof g === "string" ? g : undefined; };
  if (!effects.some((e) => e.kind === "prop" && giveOf(e) && e.anchor?.character)) return plan;
  const touches = (plan.touchAt as { by: string; on: string; t: number; hand?: string }[] | undefined) ?? [];
  let frames: { id: string; skeleton: Record<string, { x: number; y: number }> }[][] | null = null;
  const out = effects.map((e) => {
    const to = giveOf(e);
    if (e.kind !== "prop" || !to || !e.anchor?.character) return e;
    const from = e.anchor.character, j = (e.anchor.joint ?? "rHand") as string, t0 = Number(e.start ?? 0);
    let at = touches.find((x) => (x.by === from && x.on === to) || (x.by === to && x.on === from))?.t, hand = "rHand";
    if (frames === null) { try { frames = buildScene(makeEffectsTestScene(plan as never, 1920), 24).frames as never; } catch { frames = []; } }
    let best = { i: -1, d: Infinity, hand: "rHand" };
    (frames ?? []).forEach((f, i) => {
      if (i / 24 < t0 + 0.5 || (at !== undefined && Math.abs(i / 24 - at) > 0.15)) return;
      const A = f.find((x) => x.id === from), B = f.find((x) => x.id === to);
      if (!A || !B) return;
      for (const h of ["rHand", "lHand"]) { const d = Math.hypot(A.skeleton[j].x - B.skeleton[h].x, A.skeleton[j].y - B.skeleton[h].y); if (d < best.d) best = { i, d, hand: h }; }
    });
    if (best.i >= 0) { at = best.i / 24; hand = best.hand; }
    if (at === undefined) return e;
    const { giveTo: _g, ...rest } = e as HeldProp & { giveTo?: string };
    const { giveTo: _p, ...params } = (rest.params ?? {}) as Record<string, unknown>;
    return { ...rest, params, owners: [{ t: t0, character: from, joint: j }, { t: +at.toFixed(3), character: to, joint: hand }] };
  });
  return { ...plan, effects: out };
}

// THE TOUCH GATE (Oct 17 R3b, Fable): before Arthur sees a touching video — (1) both people's hands reach their touch pose (their
// peak reach toward each other, measured on the FINAL pictures) within 2 pictures of each other; (2) at the touch the two hands
// are within 3 cm (stage px: figure height = 1.75 m); (3) every handed thing is in exactly ONE place on every picture.
export function touchGate(plan: Record<string, unknown>): { ok: boolean; notes: string[] } {
  const touches = (plan.touchAt as { by: string; on: string; t: number }[] | undefined) ?? [];
  const notes: string[] = [];
  let frames: { id: string; skeleton: Record<string, { x: number; y: number }> }[][];
  try { frames = buildScene(makeEffectsTestScene(plan as never, 1920), 24).frames as never; } catch (e) { return { ok: false, notes: [`build failed: ${String(e).slice(0, 80)}`] }; }
  const H = Number(plan.height) || 300, cm3 = (0.03 / 1.75) * H;
  for (const tc of touches) {
    const i0 = Math.round(tc.t * 24), lo = Math.max(0, i0 - 14), hi = Math.min(frames.length - 1, i0 + 14);
    // (WHEN EACH ARM RISES AND FALLS: a fist bump holds a flat top for half a second, so its "peak" picture is noise — the
    // picture the reach crosses halfway up, and halfway down again, are what must match)
    const edges = (who: string, other: string) => {
      const r: number[] = [];
      for (let i = lo; i <= hi; i += 1) {
        const A = frames[i].find((x) => x.id === who), B = frames[i].find((x) => x.id === other);
        const toward = A && B ? Math.sign(B.skeleton.hip.x - A.skeleton.hip.x) || 1 : 1;
        r.push(A ? Math.max(...["lHand", "rHand"].map((h) => (A.skeleton[h].x - A.skeleton.hip.x) * toward)) : 0);
      }
      const mn = Math.min(...r), mx = Math.max(...r), mid = (mn + mx) / 2, k = r.indexOf(mx);
      let up = k; while (up > 0 && r[up - 1] >= mid) up -= 1;
      let down = k; while (down < r.length - 1 && r[down + 1] >= mid) down += 1;
      return { up, down };
    };
    const ea = edges(tc.by, tc.on), eb = edges(tc.on, tc.by), ia = 0, ib = Math.max(Math.abs(ea.up - eb.up), Math.abs(ea.down - eb.down));
    const A = frames[i0]?.find((x) => x.id === tc.by), B = frames[i0]?.find((x) => x.id === tc.on);
    const d = A && B ? Math.min(...["lHand", "rHand"].flatMap((h) => ["lHand", "rHand"].map((k) => Math.hypot(A.skeleton[h].x - B.skeleton[k].x, A.skeleton[h].y - B.skeleton[k].y)))) : Infinity;
    notes.push(`touch ${tc.by}→${tc.on} at ${tc.t.toFixed(2)} s: arms rise/fall ${Math.abs(ia - ib)} pictures apart (≤2), hands ${(d / H * 1.75 * 100).toFixed(1)} cm apart (≤3)`);
    if (Math.abs(ia - ib) > 2 || d > cm3) notes.push("GATE FAIL: touch timing or distance");
  }
  const props = ((plan.effects as HeldProp[] | undefined) ?? []).filter((e) => e.kind === "prop" && e.anchor?.character);
  const name = (e: HeldProp) => String(e.params?.symbol ?? e.params?.name ?? "");
  for (let i = 0; i < frames.length; i += 1) {
    const t = i / 24, seen = new Map<string, number>();
    for (const e of props) if (t >= Number(e.start ?? 0) - 1e-9 && t <= Number(e.end ?? Infinity) + 1e-9) seen.set(name(e), (seen.get(name(e)) ?? 0) + 1);
    const dup = [...seen].find(([n, k]) => n && k > 1);
    if (dup) { notes.push(`GATE FAIL: "${dup[0]}" is in two places at ${t.toFixed(2)} s`); break; }
  }
  return { ok: !notes.some((n) => n.startsWith("GATE FAIL")), notes };
}

// UNTIL THE GATE PASSES (Oct 17 R3b): a touching pair that fails the touch gate gets FRESH Kimodo takes — the same words, new
// seeds (+100 each try), at most 2 more tries — and the take pair, the director's clock and place and the hand-over run again.
// The best try is kept and the gate's notes say what is still off; a failing pair is never presented as a pass.
export async function gateTouches(plan: Record<string, unknown>, words: string, signal?: AbortSignal): Promise<{ plan: Record<string, unknown>; gate: { ok: boolean; notes: string[] }; tries: number }> {
  let best = { plan, gate: touchGate(plan) }, cur = plan, tries = 0;
  const score = (g: { notes: string[] }) => g.notes.filter((n) => n.startsWith("GATE FAIL")).length;
  while (!best.gate.ok && tries < 2 && Array.isArray(cur.touchAt) && cur.touchAt.length) {
    tries += 1;
    const next = JSON.parse(JSON.stringify(cur, withoutClips)) as Record<string, unknown>;
    for (const c of (next.characters as { actions?: { move?: string; params?: Record<string, unknown> }[] }[]) ?? []) for (const a of c.actions ?? []) {
      if (a.move !== "realMotion" || !a.params) continue;
      a.params.seed = Number(a.params.seed ?? 11) + 100; delete a.params.timeMap;
    }
    for (const e of (next.effects as (HeldProp & { owners?: { character: string; joint: string }[]; giveTo?: string })[] | undefined) ?? []) {
      if (e.owners?.length) { e.giveTo = e.owners[e.owners.length - 1].character; e.anchor = { ...e.anchor, character: e.owners[0].character, joint: e.owners[0].joint }; delete e.owners; }
    }
    delete next.touchAt;
    let p2 = (await fillLiveMotions(next, { signal })).plan;
    p2 = handOver(autoRepair(keepApart(sizeOneFigure(p2)), words, null).plan);
    const g = touchGate(p2);
    cur = p2;
    if (g.ok || score(g) < score(best.gate)) best = { plan: p2, gate: g };
  }
  return { ...best, tries };
}

export function tidyPlan(plan: Record<string, unknown>): Record<string, unknown> {
  const shot = (s: Record<string, unknown>) => !Array.isArray(s.characters) ? s : ({ ...s, characters: ((s.characters as Record<string, unknown>[] | undefined) ?? []).map((c) => ({ ...c,
    actions: ((c.actions as Record<string, unknown>[] | undefined) ?? []).map(knownMove).filter((a): a is Record<string, unknown> => a !== null).map((a) => a.move === "getHit" && a.sync && typeof (a.params as { from?: unknown } | undefined)?.from === "string" ? (({ sync: _s, ...rest }) => { void _s; return rest; })(a) : a) })) });
  // NO TWIN BACKGROUNDS (Arthur, Oct 12: "the background looked like it was basically duplicated"): every piece without its own
  // seed drew from the same seed 1, so two tree groups came out as exact copies — each piece now gets its own.
  let n = 0;
  const seeded = (s0: Record<string, unknown>) => {
    const bg = s0.background as { pieces?: { kind?: string; params?: Record<string, unknown> }[] } | undefined;
    if (!bg?.pieces) return s0;
    return { ...s0, background: { ...bg, pieces: bg.pieces.map((q) => (n += 1, q.params && "seed" in q.params ? q : { ...q, params: { ...(q.params ?? {}), seed: 3 + n * 5 } })) } };
  };
  // SCENERY FITS THE PAGE (free; the "cutOff" law): a piece placed with `x` (its middle) and `w` that reaches past a page edge is
  // slid back in (and narrowed to the page if wider) — Claude often reads `x` as the left edge.
  const W = 1920;
  const fitted = (s0: Record<string, unknown>) => {
    const bg = s0.background as { pieces?: { kind?: string; params?: Record<string, unknown> }[] } | undefined;
    if (!bg?.pieces) return s0;
    return { ...s0, background: { ...bg, pieces: bg.pieces.map((q0) => {
      // (A SEA NEVER ENDS LIKE A WALL — Arthur, Oct 12: "the net is cutting off the ocean, like the end of the world": water that is
      // wide or reaches a page edge is a sea / lake to the horizon — it spans the whole page; a small puddle or pond keeps its size)
      const q = q0.kind === "water" && typeof q0.params?.w === "number" && typeof q0.params?.x === "number" && (q0.params.w >= 0.45 * W || q0.params.x - q0.params.w / 2 <= 0.06 * W || q0.params.x + q0.params.w / 2 >= 0.94 * W)
        ? { ...q0, params: Object.fromEntries(Object.entries(q0.params).filter(([k]) => k !== "x" && k !== "w")) } : q0;
      const x = q.params?.x, w = q.params?.w;
      if (typeof x !== "number" || typeof w !== "number" || w >= 0.9 * W) return q;
      const w2 = Math.min(w, 0.88 * W), x2 = Math.min(W - w2 / 2, Math.max(w2 / 2, x));
      return x2 === x && w2 === w ? q : { ...q, params: { ...q.params, x: Math.round(x2), w: Math.round(w2) } };
    }) } };
  };
  // NO TWINS AT THE START (Arthur: "if there's even stick figures walking, they should not be in sync"): figures that begin with the
  // same walk / jog / run and no sync of their own start a beat apart (0.25 s, 0.5 s…), so they never step as one machine.
  const destagger = (s0: Record<string, unknown>) => {
    if (!Array.isArray(s0.characters)) return s0;
    const seen = new Map<string, number>();
    return { ...s0, characters: (s0.characters as Record<string, unknown>[]).map((c) => {
      const first = ((c.actions as Record<string, unknown>[] | undefined) ?? [])[0];
      if (!first || !/^(walk|jog|run)$/.test(String(first.move)) || first.sync) return c;
      const key = `${first.move}|${first.speed ?? c.speed ?? ""}|${first.style ?? c.style ?? ""}`, k = seen.get(key) ?? 0;
      seen.set(key, k + 1);
      return k === 0 ? c : { ...c, actions: [{ move: "stand", params: { seconds: Math.min(0.75, 0.25 * k) } }, ...((c.actions as unknown[]) ?? [])] };
    }) };
  };
  // EVERY FIGURE STANDS OUT (Oct 12: a green figure vanished in front of green trees): a tree, grass or hill color too close to a
  // figure's color is shifted darker or lighter — only those background colors (the figures keep the colors the user chose).
  const rgb = (c: string) => { const m = /^#?([0-9a-f]{6})$/i.exec(c.trim()); if (!m) return null; const n = parseInt(m[1], 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
  const hex = (v: number[]) => `#${v.map((x) => Math.max(0, Math.min(255, Math.round(x))).toString(16).padStart(2, "0")).join("")}`;
  const DEFAULTS: Record<string, string> = { trees: "#3f9b4a", grass: "#3d8a37", hills: "#5f9e5a" };
  const contrasted = (s0: Record<string, unknown>) => {
    const bg = s0.background as { pieces?: { kind?: string; params?: Record<string, unknown> }[] } | undefined;
    const figs = ((plan.characters as { look?: { color?: string } }[] | undefined) ?? []).map((c) => rgb(String(c.look?.color ?? "#111111"))).filter((v): v is number[] => !!v);
    if (!bg?.pieces || !figs.length) return s0;
    return { ...s0, background: { ...bg, pieces: bg.pieces.map((q) => {
      const base = typeof q.params?.color === "string" ? q.params.color : DEFAULTS[String(q.kind)];
      const c = base ? rgb(base) : null;
      if (!c || !(q.kind! in DEFAULTS)) return q;
      const near = figs.find((f) => Math.hypot(f[0] - c[0], f[1] - c[1], f[2] - c[2]) < 90);
      if (!near) return q;
      const lum = (v: number[]) => 0.3 * v[0] + 0.59 * v[1] + 0.11 * v[2], dark = lum(near) > 110;
      const to = dark ? [18, 46, 34] : [205, 230, 200], u = 0.55;
      return { ...q, params: { ...(q.params ?? {}), color: hex(c.map((x, i) => x + (to[i] - x) * u)) } };
    }) } };
  };
  // (a FOLLOW camera's world is wider than the page: its scenery is laid along the whole walk, so it is not slid into one page)
  const follows = !!(plan.camera as { follow?: unknown } | undefined)?.follow;
  // THE SKY LIGHTS THE WHOLE WORLD (Arthur, Oct 12: "it's nighttime, and the engine forgot to make the mountains darker"): a dark
  // night sky darkens and cools the hills, ground, grass, trees and water with it; a warm sunset sky tints them warm — any colors
  // (the user's or the defaults), so a night is never a daytime landscape under a black sky.
  const BASE: Record<string, string> = { hills: "#79c26f", ground: "#5cb85c", grass: "#3d8a37", trees: "#3f9b4a", water: "#2f8fd8" };
  const lit = (s0: Record<string, unknown>) => {
    const bg = s0.background as { pieces?: { kind?: string; params?: Record<string, unknown> }[] } | undefined;
    const sky = bg?.pieces?.find((q) => q.kind === "sky"), c = sky && typeof sky.params?.color === "string" ? rgb(sky.params.color) : null;
    if (!bg?.pieces || !c) return s0;
    const L = 0.3 * c[0] + 0.59 * c[1] + 0.11 * c[2], warm = c[0] > c[2] + 40 && L > 70 && L < 190;
    const [to, u] = L < 75 ? [[14, 26, 51], 0.6] : warm ? [[110, 60, 80], 0.25] : [null, 0];
    if (!to) return s0;
    const tint = (col: string) => { const v = rgb(col); return v ? hex(v.map((x, i) => x + ((to as number[])[i] - x) * (u as number))) : col; };
    return { ...s0, background: { ...bg, pieces: bg.pieces.map((q) => !(q.kind! in BASE) || q.params?.lit === (L < 75 ? "night" : "warm") ? q : { ...q, params: { ...(q.params ?? {}), lit: L < 75 ? "night" : "warm", color: tint(typeof q.params?.color === "string" ? q.params.color : BASE[q.kind!]), ...(q.kind === "trees" ? { color2: tint(typeof q.params?.color2 === "string" ? q.params.color2 : "#7a4a24") } : {}) } }) } };
  };
  // (PUSHING IS WALKING — moves/pushPlan.ts: a "custom" push of a wheelbarrow / cart / box in the hand that travels forward = a real walk)
  // (PULLING IS THE PULL MOVE — moves/pullPlan.ts: a rope-holder's "custom" pull/tug/heave keys become the library "pull")
  const out = lit(contrasted((follows ? (x: Record<string, unknown>) => x : fitted)(seeded(destagger(hugsFromCustom(doorsSwing(pushesFromCustom(pullsFromCustom(shot(plan))))))))));
  if (Array.isArray(plan.cuts)) out.cuts = (plan.cuts as Record<string, unknown>[]).map((c) => lit(contrasted(fitted(seeded(hugsFromCustom(doorsSwing(pushesFromCustom(pullsFromCustom(shot(c))))))))));
  return out;
}
function failedLaws(p: Parameters<typeof makeEffectsTestScene>[0], words: string, askedSec: number | null): (Measure & { marks: Record<string, number> })[] {
  const scene = makeEffectsTestScene(p, 1920), built = buildScene(scene, 24);
  return measurePlan(p as never, scene, built, 24, { stageWidth: 1920, words, askedSec }).filter((m) => !m.ok).map((m) => ({ ...m, marks: scene.marks ?? {} }));
}

// THE ENGINE FIXES "TOO FAST" ITSELF (free, no AI — the cause of most refusals, 11 of 17 law problems in the logs): the move of
// that figure playing at that moment is slowed (fast → normal → slow, then less energy) and the laws run again, up to 6 times.
// Claude only hears about what the engine could not fix.
function hazardsUnderJumps(plan: Record<string, unknown>, who: string): Record<string, unknown> | null {
  let built: ReturnType<typeof buildScene>;
  try { built = buildScene(makeEffectsTestScene(plan as Parameters<typeof makeEffectsTestScene>[0], 1920), 24); } catch { return null; }
  const idx = ((plan.characters as { id: string }[] | undefined) ?? []).findIndex((c) => c.id === who);
  if (idx < 0) return null;
  const G = Number(plan.groundY ?? 900), cutAt = built.camera?.cuts?.[0] ?? built.frames.length;
  // the jumps: runs of pictures with both feet off the ground; each jump's peak = where the lower foot is highest
  // (only REAL JUMPS count — a run's strides are in the air too, but nobody clears spikes with a stride: each jump move's span
  // comes from its marks "<who>.<jump move><n>.<mark>")
  const spans = new Map<string, [number, number]>();
  for (const [k, v] of Object.entries((makeEffectsTestScene(plan as Parameters<typeof makeEffectsTestScene>[0], 1920).marks ?? {}))) {
    const m = /^([^.]+)\.((?:jump|leap|flip|cartwheel|vault|custom)\d+)\.\w+$/i.exec(k);
    if (m && m[1] === who && Number.isFinite(v)) { const s0 = spans.get(m[2]); spans.set(m[2], s0 ? [Math.min(s0[0], v), Math.max(s0[1], v)] : [v, v]); }
  }
  const peaks: number[] = [];
  for (const [from, to] of [...spans.values()].sort((a, b) => a[0] - b[0])) {
    let best: { x: number; clear: number } | null = null;
    for (let i = Math.max(0, Math.floor((from - 0.6) * 24)); i <= Math.min(cutAt - 1, Math.ceil((to + 0.3) * 24), built.frames.length - 1); i += 1) {
      const sk = built.frames[i]?.[idx]?.skeleton;
      const clear = sk ? G - Math.max(sk.lFoot.y, sk.rFoot.y) : 0;
      if (sk && clear > 0.12 * Number(plan.height ?? 300) && (!best || clear > best.clear)) best = { x: sk.hip.x, clear };
    }
    if (best) peaks.push(best.x);
  }
  const bg = plan.background as { pieces?: { kind?: string; params?: Record<string, unknown> }[] } | undefined;
  const hazards = (bg?.pieces ?? []).map((pc, i) => ({ pc, i })).filter(({ pc }) => pc.kind === "spikes" || pc.kind === "pit").sort((a, b) => Number(a.pc.params?.x ?? 960) - Number(b.pc.params?.x ?? 960));
  if (!peaks.length || !hazards.length || peaks.length < hazards.length) return null;
  const pieces = [...(bg!.pieces ?? [])];
  hazards.forEach(({ pc, i }, k) => { pieces[i] = { ...pc, params: { ...(pc.params ?? {}), x: Math.round(peaks[k]) } }; });
  return { ...plan, background: { ...bg, pieces } };
}
// THE SEAT GOES UNDER THE HIPS (Arthur, Oct 12: "he's not physically sitting on the chair, he's doing the horse pose"): for every
// figure's "seated" move, the nearest chair / bench / stool / couch (a placed thing) is slid so its middle is right under the hips
// while they sit — the animator never has to guess where seated hips end up.
function seatsUnderHips(plan: Record<string, unknown>): Record<string, unknown> {
  const chars = (plan.characters as { id: string; actions?: Action[] }[] | undefined) ?? [];
  const effects = (plan.effects as { kind?: string; anchor?: { x?: number; y?: number; character?: string }; params?: Record<string, unknown> }[] | undefined) ?? [];
  if (!effects.length || !chars.some((c) => c.actions?.some((a) => a.move === "custom" && (a.params as { seated?: boolean } | undefined)?.seated))) return plan;
  let built: ReturnType<typeof buildScene>, marks: Record<string, number>;
  try { const sc = makeEffectsTestScene(plan as Parameters<typeof makeEffectsTestScene>[0], 1920); built = buildScene(sc, 12); marks = sc.marks ?? {}; } catch { return plan; }
  const seatLike = (e: (typeof effects)[number]) => e.kind === "prop" && typeof e.anchor?.x === "number" && !e.anchor?.character && /chair|bench|stool|couch|sofa|seat|throne|log|crate|box|rock/i.test(String(e.params?.name ?? e.params?.symbol ?? e.params?.scriptId ?? "seat"));
  const next = effects.map((e) => ({ ...e }));
  chars.forEach((c, ci) => {
    let k = 0;
    for (const a of c.actions ?? []) {
      if (a.move !== "custom") continue;
      k += 1;
      if (!(a.params as { seated?: boolean } | undefined)?.seated) continue;
      const t = marks[`${c.id}.custom${k}.k1`];
      if (t === undefined) continue;
      const hip = built.frames[Math.min(built.frames.length - 1, Math.round(t * built.fps) + 2)]?.[ci]?.skeleton.hip;
      if (!hip) continue;
      let best = -1, bd = 0.9 * Number(plan.height ?? 300);
      next.forEach((e, i) => { if (seatLike(e)) { const d = Math.abs((e.anchor!.x as number) - hip.x); if (d < bd) { bd = d; best = i; } } });
      if (best >= 0) next[best] = { ...next[best], anchor: { ...next[best].anchor, x: Math.round(hip.x) } };
    }
  });
  return { ...plan, effects: next };
}
// LET GO TO USE YOUR HANDS (Arthur, Oct 12–14: "glued hands… easy let go"; the tug-of-war rope floated above Red's head when he
// cheered). A thing held in a figure's hand (a prop anchored to its hand) stays in that hand only while the figure's moves are
// about holding it. When the figure starts a move that needs its hands on their own (cheer, throw, punch, wave, clap…), it lets
// go first, at the end of the move before: a rope stretched to someone else stays in THEIR hand and drops slack to the ground;
// anything else drops to the ground right under the hand. Works for any prop and any move, in every scene.
const FREE_HANDS = /^(celebrate|cheer|throw|punch|jab|hook|uppercut|barrage|wave|clap|highFive|point|dance|block|guard|parry|sword|dashSlash|catch|pickUp|grab|hug|shrug|facepalm|groundPunch|liftSlam|grapple)/i;
type HeldProp = { kind?: string; start?: number; end?: number; anchor?: { character?: string; joint?: string; x?: number; y?: number }; target?: { character?: string; joint?: string; x?: number; y?: number }; params?: Record<string, unknown> };
export function letGoForFreeHands(plan: Record<string, unknown>): Record<string, unknown> {
  const effects = (plan.effects as HeldProp[] | undefined) ?? [];
  const chars = (plan.characters as { id: string; actions?: Action[] }[] | undefined) ?? [];
  // (a balloon or kite string is NOT let go: it would float away — a different story the sheet must write)
  const inHand = (e: HeldProp) => e.kind === "prop" && !!e.anchor?.character && /Hand$/.test(String(e.anchor?.joint ?? "")) && e.params?.flies !== true && !/kite|balloon|bird|butterfly|bee|drone|plane|ghost/i.test(String(e.params?.symbol ?? e.params?.name ?? ""));
  if (!effects.some(inHand)) return plan;
  let built: ReturnType<typeof buildScene>, marks: Record<string, number>;
  try { const sc = makeEffectsTestScene(plan as Parameters<typeof makeEffectsTestScene>[0], 1920); built = buildScene(sc, 12); marks = sc.marks ?? {}; } catch { return plan; }
  const G = Number(plan.groundY ?? 900);
  // when each figure first needs its hands free: the end of the move before its first free-hands move
  const freeAt = new Map<string, number>();
  for (const c of chars) {
    const count = new Map<string, number>();
    let prevEnd: number | undefined;
    for (const a of c.actions ?? []) {
      const n = (count.get(a.move) ?? 0) + 1; count.set(a.move, n);
      const mine = Object.entries(marks).filter(([k]) => k.startsWith(`${c.id}.${a.move}${n}.`)).map(([, v]) => v).filter(Number.isFinite);
      if (FREE_HANDS.test(a.move) && prevEnd !== undefined) { freeAt.set(c.id, prevEnd); break; }
      if (mine.length) prevEnd = Math.max(...mine);
    }
  }
  const out: HeldProp[] = [];
  let changed = false;
  for (const e of effects) {
    const t = inHand(e) ? freeAt.get(e.anchor!.character!) : undefined;
    if (t === undefined || t <= (e.start ?? 0) || t >= (e.end ?? Infinity)) { out.push(e); continue; }
    const ci = chars.findIndex((c) => c.id === e.anchor!.character);
    const hand = built.frames[Math.min(built.frames.length - 1, Math.round(t * built.fps))]?.[ci]?.skeleton[e.anchor!.joint as "rHand"];
    const ground = { x: Math.round(hand?.x ?? 960), y: G };
    out.push({ ...e, end: t, params: { ...e.params, letGo: true } }); // (letGo: the plan keeps this end — props otherwise last the scene)
    const other = e.target?.character && /Hand$/.test(String(e.target.joint ?? "")) && e.target.character !== e.anchor!.character;
    if (other) out.push({ ...e, start: t, anchor: e.target, target: { x: ground.x, y: G - 2 }, params: { ...e.params, slack: true, ...(hand ? { dropFrom: { x: Math.round(hand.x), y: Math.round(hand.y) } } : {}) } }); // (dropFrom: the free end FALLS from the hand to the ground, like a whip — never jumps there)
    else out.push({ ...e, start: t, anchor: ground, ...(e.target ? { target: e.target } : {}) });
    changed = true;
  }
  return changed ? { ...plan, effects: out } : plan;
}
// A DODGE IS TIMED TO THE THING IT DODGES (Arthur: Blue ducked while the dodgeball was still far away, stood up, and it went
// through him). A duck/squat/jump/roll that is synced to some moment, by a figure a thrown thing flies past, is moved so its
// synced moment (its "bottom" or peak) happens when the thing really reaches that figure. Works for any thrown or flying object.
const DODGES = /^(squat|duck|crouch|dodge|jump|leap|roll|lean|limbo)/i;
export function dodgesOnTime(plan: Record<string, unknown>): Record<string, unknown> {
  const chars = (plan.characters as { id: string; actions?: (Action & { sync?: { mark?: string; at?: string; offset?: number } })[] }[] | undefined) ?? [];
  if (!(plan.objects as unknown[] | undefined)?.length || !chars.some((c) => c.actions?.some((a) => DODGES.test(a.move) && a.sync?.mark))) return plan;
  let built: ReturnType<typeof buildScene>, marks: Record<string, number>;
  try { const sc = makeEffectsTestScene(plan as Parameters<typeof makeEffectsTestScene>[0], 1920); built = buildScene(sc, 24); marks = sc.marks ?? {}; } catch { return plan; }
  let changed = false;
  const next = chars.map((c, ci) => {
    const count = new Map<string, number>();
    return { ...c, actions: (c.actions ?? []).map((a) => {
      const n = (count.get(a.move) ?? 0) + 1; count.set(a.move, n);
      if (!DODGES.test(a.move) || !a.sync?.mark) return a;
      // (THE DODGE'S DEEPEST MOMENT is what meets the thing — a jump's "top", a duck's "bottom" — whatever moment the plan synced
      // ("takeoff", "peak", "lowest"…): otherwise the feet are still on the floor when a shot at the feet arrives)
      const own = Object.keys(marks).filter((k) => k.startsWith(`${c.id}.${a.move}${n}.`)).map((k) => k.split(".").pop()!);
      const ALIAS: Record<string, string[]> = { top: ["peak", "apex", "highest", "air", "up", "takeoff"], bottom: ["lowest", "down", "low", "duck", "deepest"] };
      const extreme = /^(jump|leap)/i.test(a.move) ? "top" : /^(squat|duck|crouch|limbo)/i.test(a.move) ? "bottom" : undefined;
      const mark = extreme && own.includes(extreme) ? extreme : own.includes(a.sync.mark) ? a.sync.mark : Object.keys(ALIAS).find((m) => own.includes(m) && ALIAS[m].includes(a.sync!.mark!.toLowerCase())) ?? a.sync.mark;
      const at = marks[`${c.id}.${a.move}${n}.${mark}`], ref = a.sync.at ? marks[a.sync.at] : undefined;
      if (!Number.isFinite(at)) return a;
      if (mark !== a.sync.mark) { changed = true; a = { ...a, sync: { ...a.sync, mark } }; }
      // when a loose (unheld) object crosses this figure's hips
      let cross: number | undefined;
      for (let i = 1; i < built.frames.length && cross === undefined; i += 1) {
        const hip = built.frames[i]?.[ci]?.skeleton.hip; if (!hip) continue;
        for (const o of built.objects[i] ?? []) {
          const prev = built.objects[i - 1]?.find((p) => p.id === o.id); if (!prev || (o as { heldBy?: string }).heldBy) continue;
          if (Math.abs(o.x - prev.x) > 2 && (prev.x - hip.x) * (o.x - hip.x) <= 0) { cross = i / built.fps; break; }
        }
      }
      if (cross === undefined) return a;
      // (synced to a moment we know → the offset that puts the deepest moment exactly at the crossing)
      if (Number.isFinite(ref)) { const off = Math.round((cross - ref!) * 100) / 100; if (Math.abs(off - (a.sync!.offset ?? 0)) < 0.04 && mark === a.sync!.mark) return a; changed = true; return { ...a, sync: { ...a.sync!, offset: off } }; }
      if (Math.abs(cross - at) < 0.06) return a;
      changed = true;
      return { ...a, sync: { ...a.sync!, offset: Math.round(((a.sync!.offset ?? 0) + cross - at) * 100) / 100 } };
    }) };
  });
  return changed ? { ...plan, characters: next } : plan;
}
// A SHOT THAT REACHES A BODY HITS IT (Arthur, Oct 14: "if he was actually trying to throw it at a stick figure… it should look like
// he's throwing it at him" — and it hits unless he dodges in time). After the dodges are timed, a thrown thing whose flight still
// touches another figure's body really HITS: it bounces back off at that moment (`hitAt` on the throw) and the figure reacts —
// a `getHit` timed to the contact. A figure that dodged in time is never touched, so it is never hit.
export function shotsHit(plan: Record<string, unknown>): Record<string, unknown> {
  type Act = Action & { sync?: { mark?: string; at?: string; offset?: number } };
  const chars = (plan.characters as { id: string; actions?: Act[] }[] | undefined) ?? [];
  const objs = (plan.objects as { id: string; look?: { size?: number } }[] | undefined) ?? [];
  if (!objs.length || !chars.some((c) => c.actions?.some((a) => a.move === "throw" && !(a.params as { hitAt?: number } | undefined)?.hitAt))) return plan;
  let built: ReturnType<typeof buildScene>, marks: Record<string, number>;
  try { const sc = makeEffectsTestScene(plan as Parameters<typeof makeEffectsTestScene>[0], 1920); built = buildScene(sc, 24); marks = sc.marks ?? {}; } catch { return plan; }
  const H = Number(plan.height ?? 300);
  let next = chars.map((c) => ({ ...c, actions: [...(c.actions ?? [])] }));
  let changed = false;
  chars.forEach((c, ci) => {
    let n = 0;
    (c.actions ?? []).forEach((a, ai) => {
      if (a.move !== "throw") return;
      n += 1;
      const p = (a.params ?? {}) as { object?: string; to?: string; hitAt?: number };
      if (!p.object || p.hitAt || (p.to && p.to !== "")) return;
      const rel = marks[`${c.id}.throw${n}.release`];
      if (!Number.isFinite(rel)) return;
      // (someone DODGES this throw — a dodge synced to it, timed by dodgesOnTime: never stack a hit in front of the dodge)
      if (chars.some((x) => x.id !== c.id && (x.actions ?? []).some((y) => DODGES.test(y.move) && String(y.sync?.at ?? "").startsWith(`${c.id}.throw${n}.`)))) return;
      const r = (objs.find((o) => o.id === p.object)?.look?.size ?? 40) / 2;
      let hit: { t: number; who: number; behind?: boolean } | undefined;
      for (let i = Math.ceil(rel * built.fps) + 1; i < Math.min(built.frames.length, (rel + 2.5) * built.fps) && !hit; i += 1) {
        const o = built.objects[i]?.find((x) => x.id === p.object); if (!o) continue;
        built.frames[i]?.forEach((f, fi) => {
          if (hit || fi === ci) return;
          const sk = f.skeleton as unknown as Record<string, { x: number; y: number }>;
          // (the BODY: head, chest, belly, hips, legs — a ball brushing a waving hand is not a hit)
          const pts = ["neck", "hip", "lKnee", "rKnee", "lFoot", "rFoot"].map((k) => sk[k]).filter((q) => q && typeof q.x === "number");
          const mid = sk.neck && sk.hip ? [0.25, 0.5, 0.75].map((u) => ({ x: sk.neck.x + (sk.hip.x - sk.neck.x) * u, y: sk.neck.y + (sk.hip.y - sk.neck.y) * u })) : [];
          const touches = (b: { x: number; y: number }) => [...pts, ...mid].some((q) => Math.hypot(q.x - b.x, q.y - b.y) <= r + 0.04 * H) || (!!sk.head && Math.hypot(sk.head.x - b.x, sk.head.y - b.y) <= r + f.headRadius);
          const near = touches(o);
          // (FROM BEHIND: the thing flies the way the figure faces — it hits its back, so the body is thrown forward)
          const prev = built.objects[i - 1]?.find((x) => x.id === p.object), dx = prev ? o.x - prev.x : 0;
          // (THE TOUCHING MOMENT, between pictures: a hard throw moves ~50 px a picture — the first picture "near" can already be
          // deep in the body, so the moment it first reaches the body's edge is found along the way from the picture before)
          let u = 1;
          if (near && prev) for (const s of [0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875]) if (touches({ x: prev.x + (o.x - prev.x) * s, y: prev.y + (o.y - prev.y) * s })) { u = s; break; }
          if (near) hit = { t: (i - 1 + u) / built.fps, who: fi, behind: (f.facing === "right" && dx > 0) || (f.facing === "left" && dx < 0) };
        });
      }
      if (!hit) return;
      const target = chars[hit.who];
      const after = Math.round((hit.t - rel) * 100) / 100; // (the moment it TOUCHES the body: the bounce starts there, no gap, never inside)
      next = next.map((x, xi) => {
        if (xi === ci) return { ...x, actions: x.actions.map((y, yi) => yi === ai ? { ...y, params: { ...(y.params ?? {}), hitAt: after } } : y) };
        if (xi !== hit!.who) return x;
        // the reaction goes after the moves that end before the hit
        let k = 0, cnt = new Map<string, number>();
        for (const y of x.actions) { const m = (cnt.get(y.move) ?? 0) + 1; cnt.set(y.move, m); const ends = Object.entries(marks).filter(([kk]) => kk.startsWith(`${target.id}.${y.move}${m}.`)).map(([, v]) => v); if (ends.length && Math.max(...ends) <= hit!.t + 0.05) k += 1; else break; }
        // (as hard as the throw: a hard shot staggers, a soft one is a flinch; timed by the sync, not by a punch)
        const power = Math.round((0.5 + 0.7 * Number(a.energy ?? (c as { energy?: number }).energy ?? 0.7)) * 100) / 100;
        const behind = hit!.behind ? { fromBehind: true } : {};
        const react: Act = { move: "getHit", params: { power, ...behind }, sync: { mark: "hit", at: `${c.id}.throw${n}.release`, offset: after } } as Act;
        // (the plan already has its reaction to this throw → it is re-timed to the real contact, never a second one)
        const own = x.actions.findIndex((y) => y.move === "getHit" && String(y.sync?.at ?? "").startsWith(`${c.id}.throw${n}.`));
        if (own >= 0) return { ...x, actions: x.actions.map((y, yi) => yi === own ? { ...y, params: { ...(y.params ?? {}), ...behind }, sync: { ...y.sync!, mark: "hit", offset: after } } : y) };
        // A HIT IS FELT (Arthur, Oct 14: Blue was hit and "keeps waving at Green"): the hit STOPS what the figure was doing — a
        // repeated gesture it was in the middle of (wave, clap, cheer… `times`) is cut to the repeats done before the hit, the
        // rest is dropped — and a figure hit from behind then TURNS to look at where it came from. Its later moves follow after.
        const moveEnd = (yi: number) => { let m = 0; const cc = new Map<string, number>(); for (let q = 0; q <= yi; q += 1) { const y = x.actions[q]; m = (cc.get(y.move) ?? 0) + 1; cc.set(y.move, m); } const v = Object.entries(marks).filter(([kk]) => kk.startsWith(`${target.id}.${x.actions[yi].move}${m}.`)).map(([, t]) => t); return v.length ? Math.max(...v) : undefined; };
        const before: Act[] = [];
        let rest = x.actions.slice(k);
        const cur0 = rest[0], times = Number((cur0?.params as { times?: number } | undefined)?.times);
        const s0 = k > 0 ? moveEnd(k - 1) ?? 0 : 0, e0 = cur0 ? moveEnd(k) : undefined;
        if (cur0 && !cur0.sync && Number.isFinite(times) && times >= 1 && e0 !== undefined && e0 > hit!.t && s0 < hit!.t) {
          const done = Math.floor(times * Math.max(0, hit!.t - s0 - 0.4) / Math.max(0.1, e0 - s0)); // (done well before the hit: the reaction is never late)
          if (done >= 1) before.push({ ...cur0, params: { ...(cur0.params ?? {}), times: done } } as Act);
          rest = rest.slice(1);
        }
        const srcX = built.frames[Math.min(built.frames.length - 1, Math.round(hit!.t * built.fps))]?.[ci]?.skeleton.hip.x;
        const meX = built.frames[Math.min(built.frames.length - 1, Math.round(hit!.t * built.fps))]?.[hit!.who]?.skeleton.hip.x;
        const look: Act[] = hit!.behind && srcX !== undefined && meX !== undefined && rest[0]?.move !== "turn" ? [{ move: "turn", params: { to: srcX < meX ? "left" : "right", slow: true } } as Act] : [];
        return { ...x, actions: [...x.actions.slice(0, k), ...before, react, ...look, ...rest] };
      });
      changed = true;
    });
  });
  return changed ? { ...plan, characters: next } : plan;
}
// FIGURES NOTICE AND REACT (Arthur, Oct 14: "if they throw a grenade at his head and he turns and sees it's a grenade, he has to
// start running"; Green just stared while Blue was hit). After the hits are known, each LOUD or DANGEROUS moment near a figure —
// someone else getting hit, a grenade or bomb landing, an explosion — is noticed by every other figure within ~4.5 body heights
// that is not busy with a move the plan timed to it: it stops the repeated gesture it was in (wave, clap… cut to the repeats done)
// and about 0.3 s later turns toward it if it faced away (a hit = it LOOKS); for DANGER it turns away and RUNS. Any scene.
const DANGER = /grenade|bomb|dynamite|tnt|explosive|mine\b/i;
export function othersNotice(plan: Record<string, unknown>): Record<string, unknown> {
  type Act = Action & { sync?: { mark?: string; at?: string; offset?: number } };
  const chars = (plan.characters as { id: string; actions?: Act[] }[] | undefined) ?? [];
  if (chars.length < 2) return plan;
  const effs = (plan.effects as { kind?: string; start?: number; end?: number; anchor?: { x?: number }; target?: { x?: number }; params?: Record<string, unknown> }[] | undefined) ?? [];
  const hasHit = chars.some((c) => c.actions?.some((a) => a.move === "getHit"));
  const dangerFx = effs.filter((e) => e.kind === "explosion" || e.kind === "grenade" && (e.params?.mode === "flight" || !e.params?.mode) || e.kind === "prop" && DANGER.test(String(e.params?.name ?? e.params?.symbol ?? "")));
  if (!hasHit && !dangerFx.length) return plan;
  let built: ReturnType<typeof buildScene>, marks: Record<string, number>;
  try { const sc = makeEffectsTestScene(plan as Parameters<typeof makeEffectsTestScene>[0], 1920); built = buildScene(sc, 24); marks = sc.marks ?? {}; } catch { return plan; }
  const H = Number(plan.height ?? 300);
  const frameAt = (t: number) => built.frames[Math.max(0, Math.min(built.frames.length - 1, Math.round(t * built.fps)))];
  type Ev = { t: number; x: number; key?: string; danger: boolean; skip: Set<string> };
  const evs: Ev[] = [];
  for (const [k, t] of Object.entries(marks)) {
    const m = /^([^.]+)\.getHit\d+\.hit$/.exec(k); if (!m || !Number.isFinite(t)) continue;
    const ci = chars.findIndex((c) => c.id === m[1]); const hip = frameAt(t)?.[ci]?.skeleton.hip; if (!hip) continue;
    const src = (chars[ci].actions ?? []).find((a) => a.move === "getHit")?.sync?.at?.split(".")[0] ?? String((chars[ci].actions ?? []).find((a) => a.move === "getHit")?.params?.from ?? "");
    evs.push({ t, x: hip.x, key: k, danger: false, skip: new Set([m[1], src]) });
  }
  for (const e of dangerFx) {
    const t = e.kind === "grenade" ? Number(e.end ?? NaN) : Number(e.start ?? NaN), x = Number((e.kind === "grenade" ? e.target?.x : undefined) ?? e.anchor?.x ?? NaN);
    if (Number.isFinite(t) && Number.isFinite(x)) evs.push({ t: Math.max(0, e.kind === "grenade" ? t - 1.2 : t), x, danger: true, skip: new Set() });
  }
  if (!evs.length) return plan;
  let changed = false;
  const next = chars.map((c, ci) => {
    const acts = c.actions ?? [];
    // (the plan already reacts to something then — a move synced to it — or this figure is in a fight: its own business)
    if (acts.some((a) => a.move === "getHit" || a.sync)) return c;
    for (const ev of evs.sort((a, b) => a.t - b.t)) {
      if (ev.skip.has(c.id)) continue;
      const me = frameAt(ev.t)?.[ci]; if (!me) continue;
      if (Math.abs(me.skeleton.hip.x - ev.x) > 4.5 * H) continue;
      // which move plays then: count moves that end before it
      const cnt = new Map<string, number>(); let k = 0, s0 = 0, e0: number | undefined;
      for (const a of acts) { const n = (cnt.get(a.move) ?? 0) + 1; cnt.set(a.move, n); const v = Object.entries(marks).filter(([kk]) => kk.startsWith(`${c.id}.${a.move}${n}.`)).map(([, t]) => t); const end = v.length ? Math.max(...v) : undefined; if (end !== undefined && end <= ev.t) { k += 1; s0 = end; } else { e0 = end; break; } }
      const cur0 = acts[k], times = Number((cur0?.params as { times?: number } | undefined)?.times);
      // (busy with a real move — walking, throwing… — it keeps going; only free gestures and standing around are interrupted)
      if (cur0 && !(Number.isFinite(times) && times >= 1)) continue;
      const before: Act[] = [];
      if (cur0 && e0 !== undefined) { const done = Math.floor(times * Math.max(0, ev.t - s0 - 0.3) / Math.max(0.1, e0 - s0)); if (done >= 1) before.push({ ...cur0, params: { ...(cur0.params ?? {}), times: done } } as Act); }
      const towards: "left" | "right" = ev.x < me.skeleton.hip.x ? "left" : "right", away: "left" | "right" = towards === "left" ? "right" : "left";
      const wait = (lead: number): Act[] => ev.key ? [] : [{ move: "wait", params: { seconds: Math.max(0.05, Math.round((ev.t + lead - (before.length ? ev.t : s0)) * 100) / 100) } } as Act];
      const syncTo = (mark: string, off: number) => ev.key ? { sync: { mark, at: ev.key, offset: off } } : {};
      let react: Act[];
      if (ev.danger) react = [...wait(0.3), ...(me.facing !== away ? [{ move: "turn", params: { to: away }, ...syncTo("start", 0.3) } as Act] : []), { move: "run", params: { distance: Math.round(3 * H) } } as Act];
      else if (me.facing !== towards) react = [{ move: "turn", params: { to: towards, slow: true }, ...syncTo("start", 0.3) } as Act];
      else react = before.length || cur0 ? [] : [];
      if (!react.length && !cur0) continue;
      changed = true;
      return { ...c, actions: [...acts.slice(0, k), ...before, ...react] };
    }
    return c;
  });
  return changed ? { ...plan, characters: next } : plan;
}
// EVERY SCENE OF A STORY (Helper F, Oct 14: the dodge and hit rules only looked at the first scene): a rule that reads one scene's
// figures runs on the first scene and on each later scene ("cuts") built on its own, and writes back only that scene's figures.
// THE BODY GOES TO THE THING (Arthur, Oct 14: "the stick figure holding the match has to actually hit it [the campfire]"). When
// a plan says a hand or foot CAUSES something at a fixed spot (`cause` on an effect: lighting a fire or a candle, pressing a
// button, knocking, painting, pushing…), the figure is PLACED within reach of that spot (its whole path moves: it walks the
// same steps and ends at the thing) and, for a hand, the key pose held at that moment puts the hand (or the tool it holds)
// exactly on the spot (a hand target: the arm bends, the body leans or kneels to it). The thing never moves to the hand.
const striker0 = (tool: TouchFx | undefined, e: TouchFx) => !!tool && LIGHTS.test(String(tool.params?.name ?? tool.params?.symbol ?? "")) && /^(fire|wildfire)$/.test(String(e.kind));
const LIGHTS = /\b(match(es|stick)?|lighter|flint|sparkler|fuse|fire ?starter)\b/i; // (things that light by a strike)
// ARM'S REACH IS MEASURED FROM THE SHOULDER (Oct 15 T1: the old flat 0.35 x height from the hips is LONGER than the whole arm
// (upper arm + forearm = 0.31) at handshake / shoulder height, so every touch at standing height stopped short and leaned or
// slid). A standing touch puts the hips this far (x height) from the spot: a comfortably bent arm (COMFY_ARM of its length)
// from the shoulder (SHOULDER_UP above the floor) to the spot's height. Family: handshakes, pats, hands on tables / stoves /
// doors / walls / buttons, partner touches one-sided or mutual.
export const COMFY_ARM = 0.9, SHOULDER_UP = 0.76;
// (A spot below the chest is reached BENDING: the torso leans in up to 45° as the spot gets lower, carrying the shoulder forward
// and down — so a low stove top is reached from about as far as before, never from a cramped crouch against it.)
export const comfortableReach = (spotUp: number) => {
  const arm = COMFY_ARM * (PROPORTIONS.upperArm + PROPORTIONS.forearm), hipUp = SHOULDER_UP - PROPORTIONS.torso;
  const lean = (Math.min(45, Math.max(0, (0.62 - spotUp) * 150)) * Math.PI) / 180;
  const sx = PROPORTIONS.torso * Math.sin(lean), sy = hipUp + PROPORTIONS.torso * Math.cos(lean);
  const dy = Math.min(arm * 0.95, Math.abs(sy - spotUp));
  return Math.min(0.32, Math.max(0.12, sx + Math.sqrt(arm * arm - dy * dy)));
};
export const TOUCH_REACH = 0.03; // (x height: a touch is within this of the thing — plus the length of a held tool)
type TouchFx = { kind?: string; start?: number; anchor?: { x?: number; y?: number; character?: string; joint?: string }; cause?: { character?: string; joint?: string }; params?: Record<string, unknown> };
export function bodyGoesToThing(plan: Record<string, unknown>): Record<string, unknown> {
  plan = toolAtThing(plan); // (a floor-tool job works where the tool's head reaches the worked thing: claude/toolAtThing.ts)
  plan = partnersTouchInTime(plan, (p) => touchIntentBuilder(p, makeEffectsTestScene as never)); // (the one who arrives first waits, hand out)
  const effects = (plan.effects as TouchFx[] | undefined) ?? [];
  const touches: TouchFx[] = effects.filter((e) => e.cause?.character && /^[rl](Hand|Foot)$/.test(String(e.cause.joint)) && typeof e.anchor?.x === "number" && typeof e.anchor?.y === "number" && !e.anchor.character);
  // (…and every touch the WORDS declare — "puts her hand on the stove" — on a drawn thing's surface: claude/touchIntent.ts)
  for (const v of intentTouches(plan, (p) => touchIntentBuilder(p, makeEffectsTestScene as never))) if (!touches.some((e) => e.cause?.character === v.cause.character && Math.abs(Number(e.start ?? 0) - v.start) < 0.5)) touches.push(v);
  if (!touches.length) return plan;
  const H = Number(plan.height ?? 300);
  let cur = plan;
  for (let pass = 0; pass < 4; pass += 1) {
    let built: ReturnType<typeof buildScene>, marks: Record<string, number>;
    // (MEASURED HONESTLY, Oct 15 T1: on the PLANNED limbs — the build without the contact solver. The solver's IK + step-in made a
    // hand that stopped 28 px short look "already touching", so the figure was never walked closer and the law then found the gap.)
    try { const sc = makeEffectsTestScene(cur as Parameters<typeof makeEffectsTestScene>[0], 1920); built = buildScene({ ...sc, contacts: undefined }, 24); marks = sc.marks ?? {}; } catch { return cur; }
    const G = Number(cur.groundY ?? 900);
    const chars = ((cur.characters as { id: string; x?: number; actions?: Action[] }[] | undefined) ?? []).map((c) => ({ ...c, actions: (c.actions ?? []).map((a) => ({ ...a, params: a.params ? { ...a.params } : a.params })) }));
    let changed = false;
    const placed = new Set<string>();
    for (const e of touches) {
      const id = e.cause!.character!, joint = e.cause!.joint as "rHand" | "lHand" | "rFoot" | "lFoot", ci = chars.findIndex((c) => c.id === id);
      if (ci < 0) continue;
      const spot = { x: e.anchor!.x!, y: e.anchor!.y! };
      // (the tool in that hand — a match, a brush, a stick — reaches further than the bare hand)
      const tool = effects.find((p) => p.kind === "prop" && p.anchor?.character === id && p.anchor?.joint === joint);
      const tip = Number(tool?.params?.size ?? 0) * H;
      // (the touch moment: the closest approach within 1 s of the planned start)
      const t0 = Number(e.start ?? 0);
      let best: { i: number; d: number; p: { x: number; y: number }; hand: { x: number; y: number } } | undefined;
      // (THE TOOL'S TIP TOUCHES, not the hand: a held match / lighter / brush is measured at its drawn tip — effects heldTip)
      // (from just before the planned moment: a hand passing by on its way up is not the touch)
      for (let i = Math.max(0, Math.floor((t0 - 0.3) * built.fps)); i <= Math.min(built.frames.length - 1, Math.ceil((t0 + 1) * built.fps)); i += 1) {
        const p = joint.endsWith("Hand") ? heldTip(effects as never, id, joint, built.frames[i] ?? [], H, G, 1920, i / built.fps) : built.frames[i]?.find((c) => c.id === id)?.skeleton[joint];
        if (!p) continue;
        const d = Math.hypot(p.x - spot.x, p.y - spot.y);
        if (!best || d < best.d) best = { i, d, p, hand: built.frames[i]?.find((c) => c.id === id)?.skeleton[joint] ?? p };
      }
      if (!best) continue;
      // (a thing on the floor is reached KNEELING, just past the front foot; a thing higher up at a comfortable arm's length)
      const low = (G - spot.y) / H < 0.3, reach = joint.endsWith("Foot") ? 0.55 : low ? 0.32 : comfortableReach((G - spot.y) / H);
      const kneels = (j0: number) => { let k = 0, hit: { a: Action; j: number } | undefined, kt = 1.5; for (const a of chars[ci].actions ?? []) { if (a.move !== "custom") continue; k += 1; ((a.params as { keys?: unknown[] } | undefined)?.keys ?? []).forEach((_, j) => { const m = marks[`${id}.custom${k}.k${j + 1}`]; if (m !== undefined && Math.abs(m - j0) < kt) { kt = Math.abs(m - j0); hit = { a, j }; } }); } return hit; };
      if (best.d <= TOUCH_REACH * H + (joint.endsWith("Hand") ? 0 : tip)) {
        // (already touching from a squat: a low touch still KNEELS — the next pass re-checks the reach)
        const at0 = low && joint.endsWith("Hand") ? kneels(best.i / built.fps) : undefined;
        const ks = at0 ? [...((at0.a.params as { keys: Record<string, unknown>[] }).keys)] : [];
        if (at0 && !ks[at0.j].kneel && !(Number(ks[at0.j].lift ?? 0) > 0)) { ks[at0.j] = { ...ks[at0.j], kneel: true }; (at0.a as { params: Record<string, unknown> }).params = { ...at0.a.params, keys: ks }; changed = true; }
        continue;
      }
      const fc = built.frames[best.i].find((c) => c.id === id)!, f = fc.facing === "left" ? -1 : 1, t = best.i / built.fps;
      let dx = Math.round(spot.x - f * reach * H - fc.skeleton.hip.x);
      // (…but NEVER INTO IT: the thing standing at the spot (the logs under the fire, the cake under the candle, a table) keeps
      // the figure's feet out — no foot, on the way there or while kneeling, goes past its near edge; the hand / tool reaches)
      const under = effects.filter((p) => p.kind === "prop" && typeof p.anchor?.x === "number" && typeof p.anchor?.y === "number" && !p.anchor.character && Math.abs(p.anchor.x - spot.x) < 0.4 * H && p.anchor.y >= spot.y - 0.05 * H);
      if (under.length) {
        const parts = (q: TouchFx) => ((q.params?.parts as { x?: number; w?: number }[] | undefined) ?? [{ x: 0, w: 1 }]);
        const edge = Math.min(...under.map((q) => f * q.anchor!.x! - Math.max(...parts(q).map((r) => Math.abs(Number(r.x ?? 0)) + Math.abs(Number(r.w ?? 0.3)) / 2)) * Number(q.params?.size ?? 0.2) * H)) - 0.02 * H;
        let front = -Infinity;
        for (let i = 0; i <= Math.min(built.frames.length - 1, best.i + Math.round(built.fps)); i += 1) { const c = built.frames[i]?.find((q) => q.id === id); if (c) front = Math.max(front, f * c.skeleton.lFoot.x, f * c.skeleton.rFoot.x); }
        if (Number.isFinite(front) && front + f * dx > edge) dx = Math.round(f * (edge - front));
      }
      // (one figure touching SEVERAL things — two candles — is placed once per look, by its first touch: never moved twice)
      const moves = Math.abs(dx) > 2 && !placed.has(id);
      if (moves) { chars[ci].x = Number(chars[ci].x ?? 0) + dx; changed = true; }
      placed.add(id);
      const hipAfter = fc.skeleton.hip.x + (moves ? dx : 0);
      if (!joint.endsWith("Hand")) continue;
      // (the key pose held at that moment gets a hand target on the spot; the tool's tip, not the fist, touches it)
      let k = 0, keyAt: { a: Action; j: number } | undefined, kt = 1.5; // (the key pose nearest that moment)
      for (const a of chars[ci].actions ?? []) {
        if (a.move !== "custom") continue;
        k += 1;
        const keys = (a.params as { keys?: unknown[] } | undefined)?.keys ?? [];
        keys.forEach((_, j) => { const m = marks[`${id}.custom${k}.k${j + 1}`]; if (m !== undefined && Math.abs(m - t) < kt) { kt = Math.abs(m - t); keyAt = { a, j }; } });
      }
      if (!keyAt) continue;
      const keys = [...((keyAt.a.params as { keys: Record<string, unknown>[] }).keys)];
      if (keys[keyAt.j].prep && keys[keyAt.j + 1]) keyAt = { ...keyAt, j: keyAt.j + 1 }; // (the strike's raised key: the touch is the next)
      // (a hand target already there that still misses: corrected by how far the TIP misses, measured in this build)
      // (the HAND goes where the TIP lands on the spot: the hand target = the spot minus the held tool's reach, as drawn in this
      // build — from wherever the hips now are)
      const tv = { x: best.p.x - best.hand.x, y: best.p.y - best.hand.y };
      const want = { x: +Math.max(0.12, ((spot.x - tv.x - hipAfter) * f) / H).toFixed(3), y: +Math.max(0, (G - (spot.y - tv.y)) / H).toFixed(3) };
      if (striker0(tool, e) && keys[keyAt.j - 1]?.prep) keys[keyAt.j - 1] = { ...keys[keyAt.j - 1], [joint]: { x: +(want.x - 0.08).toFixed(3), y: +(want.y + 0.16).toFixed(3) } };
      // (LIGHTING IS A STRIKE — cause chains, Arthur Oct 14: "he's supposed to hit, and then it turns on": a match / lighter /
      // flint / sparkler / fuse hand first lifts a little up and back (a raised key), then STRIKES down onto the spot (a strike
      // key: quick, with its anticipation); causes.ts then sparks at the contact and the flame catches)
      const striker = striker0(tool, e);
      if (striker && !keys[keyAt.j - 1]?.prep) {
        const { hold: _h, strike: _s, at: _a, ...base } = keys[keyAt.j];
        keys.splice(keyAt.j, 0, { ...base, [joint]: { x: +(want.x - 0.08).toFixed(3), y: +(want.y + 0.16).toFixed(3) }, hold: 0.15, prep: true });
        keyAt = { ...keyAt, j: keyAt.j + 1 };
        keys[keyAt.j] = { ...keys[keyAt.j], strike: true };
      }
      const had = keys[keyAt.j][joint] as { x?: number; y?: number } | undefined;
      if (had && Math.abs(Number(had.x) - want.x) < 0.01 && Math.abs(Number(had.y) - want.y) < 0.01) { if (striker && keys[keyAt.j - 1]?.prep && keys.length !== ((keyAt.a.params as { keys: unknown[] }).keys).length) { (keyAt.a as { params: Record<string, unknown> }).params = { ...keyAt.a.params, keys }; changed = true; } continue; }
      // (REACHING LOW = THE KNEEL, Arthur Oct 14: one knee on the floor, the front foot flat, the back leaning in — custom.ts
      // kneelPose; the low keys next to it kneel too. Not a held deep squat, never a lean-back first.)
      const kneel = low && !(Number(keys[keyAt.j].lift ?? 0) > 0) ? { kneel: keys[keyAt.j].kneel ?? true } : {};
      keys[keyAt.j] = { ...keys[keyAt.j], ...kneel, [joint]: want };
      // (a touch that lights / presses STAYS a moment: a key held under half a second hands the target on to the next key too)
      if (Number(keys[keyAt.j].hold ?? 0) < 0.5 && keys[keyAt.j + 1]) keys[keyAt.j + 1] = { ...keys[keyAt.j + 1], [joint]: want };
      (keyAt.a as { params: Record<string, unknown> }).params = { ...keyAt.a.params, keys };
      changed = true;
    }
    if (!changed) break;
    cur = { ...cur, characters: chars };
  }
  return cur;
}
// A STRIKE LANDS ON ITS THING (Arthur, Oct 14: "they're just kicking thin air… too much space"): a punch or kick at a THING (a bag,
// a pad on a stand, a board — a prop in front, no figure named as target) is made from striking distance: when the fist / foot
// at the hit falls short of the nearest thing in front (within 1.5 H), the figure is placed that much closer (its whole path
// moves). The thing never moves to the fist. Figures fighting figures keep the fight engine's own spacing.
export function strikesReachThings(plan: Record<string, unknown>): Record<string, unknown> {
  let chars0 = (plan.characters as { id: string; x?: number; actions?: Action[] }[] | undefined) ?? [];
  const things = ((plan.effects as TouchFx[] | undefined) ?? []).filter((e) => e.kind === "prop" && typeof e.anchor?.x === "number" && typeof e.anchor?.y === "number" && !e.anchor.character);
  // (STRIKE WHAT THEY HOLD OUT: a strike at a figure that holds a pad / board / bag in a hand is struck at that thing — the strike
  // gets `holdOut` = how far the held thing's near edge sticks out in front of that figure's hips, x height; plan.ts keeps the
  // striking distance from there. Measured once on a build without it.)
  const heldBy = (id: string) => ((plan.effects as (TouchFx & { end?: number })[] | undefined) ?? []).filter((e) => e.kind === "prop" && e.anchor?.character === id && /Hand$/.test(String(e.anchor?.joint)));
  if (chars0.some((c) => c.actions?.some((a) => /^(punch|kick)$/.test(a.move) && typeof a.params?.target === "string" && a.params?.holdOut === undefined && heldBy(String(a.params.target)).length))) {
    let built: ReturnType<typeof buildScene> | undefined, marks: Record<string, number> = {};
    try { const sc = makeEffectsTestScene(plan as Parameters<typeof makeEffectsTestScene>[0], 1920); built = buildScene(sc, 24); marks = sc.marks ?? {}; } catch { built = undefined; }
    if (built) {
      const H0 = Number(plan.height ?? 300);
      const next = chars0.map((c) => {
        const n: Record<string, number> = { punch: 0, kick: 0 };
        return { ...c, actions: (c.actions ?? []).map((a) => {
          if (!/^(punch|kick)$/.test(a.move)) return a;
          n[a.move] += 1;
          const tid = String(a.params?.target ?? ""), held = heldBy(tid), t = marks[`${c.id}.${a.move}${n[a.move]}.hit`];
          if (!held.length || a.params?.holdOut !== undefined || t === undefined) return a;
          const i = Math.max(0, Math.min(built!.frames.length - 1, Math.round(t * built!.fps) - 2));
          const me = built!.frames[i]?.find((x) => x.id === c.id), them = built!.frames[i]?.find((x) => x.id === tid);
          if (!me || !them) return a;
          const toward = Math.sign(me.skeleton.hip.x - them.skeleton.hip.x) || 1;
          let out = 0, up = -1;
          for (const e of held) {
            if (t < Number(e.start ?? -1e9) || t > Number(e.end ?? 1e9) + 0.5) continue; // (a board that breaks AT the hit ends about then)
            const hand = them.skeleton[e.anchor!.joint as "rHand" | "lHand"];
            const w = Math.max(0.5, ...(((e.params?.parts as { w?: number }[] | undefined) ?? []).map((q) => Math.abs(Number(q.w ?? 0)))));
            out = Math.max(out, ((hand.x - them.skeleton.hip.x) * toward + 0.5 * w * Number(e.params?.size ?? 0.2) * H0) / H0 - 0.08);
            up = Math.max(up, (Number(plan.groundY ?? 900) - hand.y) / H0);
          }
          // (A KICK AIMS WHERE THE THING IS: pads held at the chest take a high kick, at the belly a mid one, low a low one)
          const height = a.move === "kick" && up > 0 ? (up >= 0.62 ? "high" : up >= 0.35 ? "mid" : "low") : undefined;
          return out > 0.05 ? { ...a, params: { ...a.params, holdOut: +out.toFixed(2), ...(height ? { height, landBack: true } : {}) } } : a;
        }) };
      });
      plan = { ...plan, characters: next }; chars0 = next;
    }
  }
  if (!things.length || !chars0.some((c) => c.actions?.some((a) => /^(punch|kick)$/.test(a.move) && !chars0.some((o) => o.id === a.params?.target)))) return plan;
  let built: ReturnType<typeof buildScene>, marks: Record<string, number>;
  try { const sc = makeEffectsTestScene(plan as Parameters<typeof makeEffectsTestScene>[0], 1920); built = buildScene(sc, 24); marks = sc.marks ?? {}; } catch { return plan; }
  const H = Number(plan.height ?? 300), REACH = 0.12 * H;
  const moved = new Map<string, number>(), landers = new Set<string>();
  for (const c of chars0) {
    let n = { punch: 0, kick: 0 } as Record<string, number>;
    for (const a of c.actions ?? []) {
      if (!/^(punch|kick)$/.test(a.move)) continue;
      n[a.move] += 1;
      if (moved.has(c.id) || chars0.some((o) => o.id === a.params?.target)) continue;
      const t = marks[`${c.id}.${a.move}${n[a.move]}.hit`];
      if (t === undefined) continue;
      const fc = built.frames[Math.min(built.frames.length - 1, Math.round(t * built.fps))]?.find((x) => x.id === c.id);
      if (!fc) continue;
      const f = fc.facing === "left" ? -1 : 1, sk = fc.skeleton as unknown as Record<string, { x: number; y: number }>;
      const end = [sk.lHand, sk.rHand, sk.lFoot, sk.rFoot].reduce((b, p) => ((p.x - sk.hip.x) * f > (b.x - sk.hip.x) * f ? p : b));
      // (the nearest thing in front at that height: its near edge, from its drawn size)
      let gap = Infinity;
      for (const e of things) {
        const half = Number(e.params?.size ?? 0.2) * H * 0.2, d = (e.anchor!.x! - end.x) * f - half;
        if ((e.anchor!.x! - sk.hip.x) * f > 0 && d > -half && d < 1.5 * H && d < gap) gap = d;
      }
      if (gap === Infinity) continue;
      if (a.move === "kick") landers.add(c.id);
      if (gap <= REACH) continue;
      moved.set(c.id, Math.round(f * (gap - 0.03 * H)));
    }
  }
  if (!moved.size && !landers.size) return plan;
  // (and a kick at a thing lands back in place — never a step forward into the bag: kick.ts landBack)
  return { ...plan, characters: chars0.map((c) => moved.has(c.id) || landers.has(c.id) ? { ...c, x: Number(c.x ?? 0) + (moved.get(c.id) ?? 0), actions: (c.actions ?? []).map((a) => a.move === "kick" && !chars0.some((o) => o.id === a.params?.target) ? { ...a, params: { ...a.params, landBack: true } } : a) } : c) };
}
// HELD TO BE STRUCK (cause chains, Arthur Oct 14: "holding with only one of his hands, not both… a wider stance… he's moving a
// lot"): a thing a figure holds out for someone else to strike (a board, plank, pad, brick, tile, target — or any held prop
// that breaks: a thingBreak of its name) is held in BOTH hands (anchored between them, one hand on each end), and the holder
// stands braced — feet apart, knees a little bent — on every key that does not set the legs, steady (no step) until the hit.
const STRUCK_THING = /\b(board|plank|pad|mitt|brick|tile|target|block|shield|melon|bottle)\b/i;
export function heldToBeStruck(plan: Record<string, unknown>): Record<string, unknown> {
  const chars = (plan.characters as { id: string; actions?: Action[] }[] | undefined) ?? [];
  const effects = (plan.effects as (TouchFx & { anchor?: Record<string, unknown> })[] | undefined) ?? [];
  const struck = new Set(chars.flatMap((c) => (c.actions ?? []).filter((a) => /^(punch|kick|chop|custom)$/.test(a.move) && typeof a.params?.target === "string" && a.params.target !== c.id).map((a) => String(a.params!.target))));
  const breaks = new Set(effects.filter((e) => e.kind === "thingBreak").map((e) => String(e.params?.name ?? "")).filter(Boolean));
  const holders = new Set<string>();
  const next = effects.map((e) => {
    const a = e.anchor as { character?: string; joint?: string; with?: string } | undefined;
    if (e.kind !== "prop" || !a?.character || !/^[rl]Hand$/.test(String(a.joint)) || a.with) return e;
    const name = String(e.params?.name ?? e.params?.symbol ?? "");
    if (!(struck.has(a.character) && STRUCK_THING.test(name)) && !breaks.has(name)) return e;
    if (!chars.some((c) => c.id !== a.character && (c.actions ?? []).some((x) => /^(punch|kick|chop|custom)$/.test(x.move)))) return e;
    holders.add(a.character);
    // (it STANDS UPRIGHT facing the striker, held by its two side edges: a board drawn lying flat (wider than tall) is turned a
    // quarter turn — seen from the side it is a thin upright plank the fist meets flat-on)
    const parts = (Array.isArray(e.params?.parts) ? e.params!.parts : []) as Record<string, unknown>[];
    const n = (v: unknown, d: number) => (typeof v === "number" && Number.isFinite(v) ? v : d);
    const wide = parts.length && Math.max(...parts.map((q) => Math.abs(n(q.x, 0)) + Math.abs(n(q.w, 0.3)) / 2)) > 1.5 * Math.max(...parts.map((q) => Math.abs(n(q.y, 0)) + Math.abs(n(q.h, 0.3)) / 2));
    const turned = wide ? parts.map((q) => q.shape === "line" ? { ...q, x: -n(q.y, 0), y: n(q.x, 0), w: -n(q.h, 0), h: n(q.w, 0) } : { ...q, x: -n(q.y, 0), y: n(q.x, 0), w: n(q.h, 0.3), h: n(q.w, 0.3) }) : parts;
    return { ...e, anchor: { ...a, with: a.joint === "rHand" ? "lHand" : "rHand" }, params: { ...e.params, ...(wide ? { parts: turned, upright: true } : {}) } };
  });
  if (!holders.size) return plan;
  const BRACE = { lHip: 16, rHip: -14, lKnee: 14, rKnee: 10 };
  return { ...plan, effects: next, characters: chars.map((c) => !holders.has(c.id) ? c : { ...c, actions: (c.actions ?? []).map((a) => a.move !== "custom" ? a : { ...a, params: { ...a.params, keys: (((a.params as { keys?: Record<string, unknown>[] })?.keys) ?? []).map((k) => { const p = (k.pose ?? {}) as Record<string, number>; return ["lHip", "rHip", "lKnee", "rKnee"].some((j) => p[j] !== undefined) ? k : { ...k, pose: { ...p, ...BRACE } }; }) } }) }) };
}
function inEveryShot(plan: Record<string, unknown>, rule: (p: Record<string, unknown>) => Record<string, unknown>): Record<string, unknown> {
  const first = rule(plan);
  const cuts = plan.cuts as Record<string, unknown>[] | undefined;
  if (!Array.isArray(cuts) || !cuts.length) return first;
  let changed = first !== plan;
  const { cuts: _drop, ...base } = plan;
  const next = cuts.map((c) => {
    const solo = { ...base, ...c, objects: c.objects ?? [], effects: c.effects ?? [] };
    const out = rule(solo);
    if (out === solo) return c;
    changed = true;
    return { ...c, characters: out.characters, ...(out.effects !== solo.effects ? { effects: out.effects } : {}) };
  });
  return changed ? { ...first, cuts: next } : plan;
}
// WHAT A HAZARD TOUCH MEANS (Arthur, Oct 15: "warms his hands" near the fire is fine; IN it is a burn): each fire / hazard prop gets
// `touch`: "avoid" when the words only want warmth or care near it (warm, heat, cook, roast, careful) and say nothing of an
// accident; "safe" when the words make it harmless on purpose (fire-proof, immune, unharmed); otherwise a touch is felt
// (effects/contactConsequence.ts reacts by the hazard's kind).
const ACCIDENT = /\b(accident\w*|touch\w*|grab\w*|burn\w*|electrocut\w*|shock\w*|zap\w*|slip\w*|trip\w*|hurt\w*|ouch|stung|prick\w*|freez\w*|by mistake|into the (fire|flames?))\b/i;
const WARMTH = /\b(warm\w*|heat\w*|cook\w*|roast\w*|toast\w*|careful\w*|near|beside|by the (fire|campfire|stove))\b/i;
const HARMLESS = /\b(fire-?proof|immune|unharmed|unhurt|without (getting )?(burn|hurt)\w*|doesn'?t (get )?(burn|hurt)\w*)\b/i;
const HAZARD_NAME = /\b(fire|flames?|campfire|bonfire|stove|grill|lava|electric\w*|live wire|power ?line|ice|snow|frozen|spikes?|thorns?|cactus|barbed)\b/i;
export function hazardIntent(plan: Record<string, unknown>, words: string): Record<string, unknown> {
  const mode = HARMLESS.test(words) ? "safe" : WARMTH.test(words) && !ACCIDENT.test(words) ? "avoid" : null;
  const effects = plan.effects as { kind: string; anchor?: Record<string, unknown>; params?: Record<string, unknown> }[] | undefined;
  if (!mode || !Array.isArray(effects)) return plan;
  let changed = false;
  const next = effects.map((e) => {
    const hz = e.kind === "fire" || e.kind === "wildfire" || (e.kind === "prop" && HAZARD_NAME.test(String(e.params?.name ?? e.params?.symbol ?? "")));
    if (!hz || e.params?.touch !== undefined || (e.anchor && "character" in e.anchor)) return e;
    changed = true;
    return { ...e, params: { ...e.params, touch: mode } };
  });
  return changed ? { ...plan, effects: next } : plan;
}
export function autoRepair(plan: Record<string, unknown>, words: string, askedSec: number | null): { plan: Record<string, unknown>; fixed: number } {
  plan = directBeats(aimRealHits(plan)); // (THE DIRECTOR — beats: kimodo/director.ts directBeats;, SPEC-0025: real-motion attacks land on their target — kimodo/director.ts)
  type Ch = { id: string; actions?: Action[] };
  // (a story in several scenes: the engine plays a figure's moves of every scene ("cuts") one after another, so its n-th walk may be
  // in a later scene — the moves are looked up across all scenes, in order)
  const shotsOf = (p: Record<string, unknown>): Record<string, unknown>[] => [p, ...((p.cuts as Record<string, unknown>[] | undefined) ?? [])];
  const movesOf = (p: Record<string, unknown>, id: string) => shotsOf(p).flatMap((sh, si) => ((sh.characters as Ch[] | undefined) ?? []).flatMap((c, ci) => c.id === id ? (c.actions ?? []).map((a, ai) => ({ si, ci, ai, a })) : []));
  const rewrite = (p: Record<string, unknown>, id: string, change: (a: Action, si: number, ai: number) => Action): Record<string, unknown> => {
    const shot = (sh: Record<string, unknown>, si: number) => Array.isArray(sh.characters) ? { ...sh, characters: (sh.characters as Ch[]).map((c) => c.id === id ? { ...c, actions: (c.actions ?? []).map((a, ai) => change(a, si, ai)) } : c) } : sh;
    const out = shot(p, 0);
    if (Array.isArray(p.cuts)) out.cuts = (p.cuts as Record<string, unknown>[]).map((c, i) => shot(c, i + 1));
    return out;
  };
  const seated = seatsUnderHips(inEveryShot(inEveryShot(inEveryShot(inEveryShot(urgentTalks(plan, words), (p) => hazardIntent(p, words)), heldToBeStruck), bodyGoesToThing), strikesReachThings));
  // (THE TRIP HAPPENS AT THE REAL CONTACT: a fall after a walk / run starts where the foot meets the rock / peel / hose — tripAtThing.ts)
  const tripped = inEveryShot(seated, tripsAtTheThing);
  const freed = inEveryShot(tripped, letGoForFreeHands);
  const named = inEveryShot(freed, dodgesOnTime); // (a second look once a renamed moment really syncs)
  const timed = named === freed ? named : inEveryShot(named, dodgesOnTime);
  const hitDone = inEveryShot(timed, shotsHit), noticed = inEveryShot(hitDone, othersNotice);
  let cur = noticed, fixed = (seated === plan ? 0 : 1) + (tripped === seated ? 0 : 1) + (freed === tripped ? 0 : 1) + (hitDone === timed ? 0 : 1) + (noticed === hitDone ? 0 : 1);
  for (let step = 0; step < 12; step += 1) {
    let fails: ReturnType<typeof failedLaws>;
    try { fails = failedLaws(cur as Parameters<typeof makeEffectsTestScene>[0], words, askedSec); } catch { break; }
    // (HAZARDS WHERE THE JUMPS ARE — the passed parkour recipe's rule: each spike row / pit goes under one of the figure's jumps,
    // in order, at the spot where both feet are highest; a figure with no jump is Claude's to fix)
    const hz = fails.find((m) => m.law === "hazard" && m.who);
    if (hz && step < 3) { const moved = hazardsUnderJumps(cur, hz.who!); if (moved) { cur = moved; fixed += 1; continue; } }
    const f = fails.find((m) => m.law === "tooFast" && m.who && m.at !== undefined);
    if (!f) break;
    const moves = movesOf(cur, f.who!);
    if (!moves.length) break;
    // (which of its moves plays at that moment: each move's marks "<who>.<move><n>.<mark>" — the first to end after it)
    const ends = new Map<string, number>();
    for (const [k, v] of Object.entries(f.marks)) { const m = /^([^.]+)\.([A-Za-z]+)(\d+)\.\w+$/.exec(k); if (m && m[1] === f.who && Number.isFinite(v)) ends.set(`${m[2]}#${m[3]}`, Math.max(ends.get(`${m[2]}#${m[3]}`) ?? 0, v)); }
    // (A MOVE CUT SHORT is not the one playing: when a synced reaction interrupts a gesture — a hit in the middle of a wave — the
    // gesture's marks run on past the cut; the move playing is the LATEST to have started by then, so the wave before a hit is
    // never slowed for the hit's speed, which would only push the reaction late)
    const starts = new Map<string, number>();
    for (const [k, v] of Object.entries(f.marks)) { const m = /^([^.]+)\.([A-Za-z]+)(\d+)\.\w+$/.exec(k); if (m && m[1] === f.who && Number.isFinite(v)) starts.set(`${m[2]}#${m[3]}`, Math.min(starts.get(`${m[2]}#${m[3]}`) ?? Infinity, v)); }
    const playing = [...ends.entries()].filter(([key, t]) => t >= f.at! - 1e-3 && (starts.get(key) ?? Infinity) <= f.at! + 1e-3).sort((x, y) => (starts.get(y[0]) ?? 0) - (starts.get(x[0]) ?? 0))[0]?.[0];
    const hit = playing ?? [...ends.entries()].sort((x, y) => x[1] - y[1]).find(([, t]) => t >= f.at! - 1e-3)?.[0];
    let found: (typeof moves)[number] | undefined;
    if (hit) { const [move, n] = hit.split("#"); let k = 0; found = moves.find((m) => m.a.move === move && (k += 1) === Number(n)); }
    if (!found) break;
    const a = found.a, speed = a.speed ?? "normal";
    // (a "custom" move whose key poses carry their own times ignores "speed": stretch its times instead, at most 3 times)
    const keys = (a.params as { keys?: { at?: number; hold?: number }[] } | undefined)?.keys;
    if (a.move === "custom" && keys?.some((k) => typeof k.at === "number") && Number((a.params as { stretched?: number }).stretched ?? 0) < 3) {
      const stretched: Action = { ...a, params: { ...a.params, stretched: Number((a.params as { stretched?: number }).stretched ?? 0) + 1, keys: keys.map((k) => ({ ...k, ...(typeof k.at === "number" ? { at: +(k.at * 1.3).toFixed(3) } : {}), ...(typeof k.hold === "number" ? { hold: +(k.hold * 1.15).toFixed(3) } : {}) })) } };
      cur = rewrite(cur, f.who!, (x, si, ai) => si === found!.si && ai === found!.ai ? stretched : x);
      fixed += 1; continue;
    }
    const next: Action = speed === "fast" ? { ...a, speed: "normal" } : speed === "normal" ? { ...a, speed: "slow" } : (a.energy ?? 0.5) > 0.25 ? { ...a, energy: +Math.max(0.2, (a.energy ?? 0.5) * 0.7).toFixed(2) } : a;
    if (next === a) break;
    // (the same move of that figure changes together, in every scene — three stomps stay alike instead of one tiny one)
    const same = (x: Action) => x.move === a.move && (x.speed ?? "normal") === speed && (x.energy ?? 0.5) === (a.energy ?? 0.5);
    cur = rewrite(cur, f.who!, (x) => same(x) ? { ...x, speed: next.speed ?? x.speed, energy: next.energy ?? x.energy } : x);
    fixed += 1;
  }
  // THE BOUNCE AGREES WITH THE TOUCH (Lead, Oct 14: the ball sat inside Blue 0.4 s — the touching moment was found on a build
  // from before the other repairs): once everything else is repaired, the hits are found again on the final plan, until the
  // moment each thrown thing bounces agrees with the moment it touches the body (within a picture).
  if (cur !== noticed || hitDone !== timed) for (let k = 0; k < 3; k += 1) {
    const again = inEveryShot(stripHitAt(cur), shotsHit);
    const a = hitAts(cur), b = hitAts(again);
    if (a.length === b.length && a.every((v, i) => Math.abs(v - b[i]) <= 1 / 24 + 1e-6)) break;
    cur = again; fixed += 1;
  }
  return { plan: cur, fixed };
}
type ThrowAct = { move: string; params?: { hitAt?: number } };
const shotList = (p: Record<string, unknown>) => [p, ...((p.cuts as Record<string, unknown>[] | undefined) ?? [])];
const hitAts = (p: Record<string, unknown>): number[] => shotList(p).flatMap((sh) => ((sh.characters as { actions?: ThrowAct[] }[] | undefined) ?? []).flatMap((c) => (c.actions ?? []).filter((a) => a.move === "throw").map((a) => Number(a.params?.hitAt ?? -1))));
function stripHitAt(p: Record<string, unknown>): Record<string, unknown> {
  const strip = (sh: Record<string, unknown>) => Array.isArray(sh.characters) ? { ...sh, characters: (sh.characters as { actions?: ThrowAct[] }[]).map((c) => ({ ...c, actions: (c.actions ?? []).map((a) => { if (a.move !== "throw" || a.params?.hitAt === undefined) return a; const { hitAt: _h, ...rest } = a.params; return { ...a, params: rest }; }) })) } : sh;
  const out = strip(p);
  if (Array.isArray(p.cuts)) out.cuts = (p.cuts as Record<string, unknown>[]).map(strip);
  return out;
}
export function lawProblems(plan: unknown, words: string, askedSec: number | null = null): string[] {
  try {
    const p = plan as Parameters<typeof makeEffectsTestScene>[0];
    const unknown = unknownNames(plan as Record<string, unknown>).map((x) => x.replace(/^ENGINE: /, "TASTE engine: "));
    return [...failedLaws(p, words, askedSec).map((m) => `${lawKind(m.law) === "broken" ? "LAW" : "TASTE"} ${m.law}: ${m.say}`), ...unknown];
  } catch (e) { return [`LAW engine: it could not be built: ${e instanceof Error ? e.message.slice(0, 300) : String(e)}`]; }
}

export type AnimateProgress = { percent: number; note: string; etaSec: number | null };
export type AnimateResult = { ok: boolean; plan: Record<string, unknown> | null; title: string; problems: string[]; rounds: number; usage: ClaudeUsage; ms: number; notes: string | null };
const planSeconds = (plan: Record<string, unknown> | null | undefined): number => { if (!plan) return 0; try { const b = buildScene(makeEffectsTestScene(plan as Parameters<typeof makeEffectsTestScene>[0], 1920), 12); return b.frames.length / b.fps; } catch { return 0; } };
const wordsSeconds = (w: string): number | null => { const all = [...w.matchAll(/(\d+(?:\.\d+)?)\s*(seconds?|secs?|s\b|minutes?|mins?)/gi)].map((m) => Number(m[1]) * (/^m/i.test(m[2]) ? 60 : 1)); return all.length ? Math.max(...all) : null; };

// THE REQUEST CHECK (Arthur: "Claude is never supposed to ignore anything I said"): once the laws pass, Claude reads the plan against
// the user's words and lists anything asked for that is NOT in it; missing parts go back to the animator as problems.
// WHAT AN EDIT CHANGED (free, no AI): the parts of the plan that differ from the animation before the edit — each figure's look,
// place and moves, the place (background), the things and effects, the scenes, the camera. The request check gets this list and
// flags every change the user did NOT ask for (Arthur, Oct 12: "he just wants it nighttime… does he want the stick figures to
// change? No. Does he want a time lapse? No.") — Claude then puts those parts back exactly as they were.
export function planDiff(before: Record<string, unknown>, after: Record<string, unknown>): string[] {
  const j = (v: unknown) => JSON.stringify(v ?? null, withoutClips), out: string[] = [];
  type Ch = { id: string; name?: string; look?: unknown; actions?: unknown; x?: unknown; facing?: unknown; size?: unknown; breath?: unknown; style?: unknown; speed?: unknown };
  const A = (before.characters as Ch[] | undefined) ?? [], B = (after.characters as Ch[] | undefined) ?? [];
  for (const c of B) {
    const o = A.find((x) => x.id === c.id), n = c.name ?? c.id;
    if (!o) { out.push(`a new figure "${n}" was added`); continue; }
    if (j(o.look) !== j(c.look)) out.push(`${n}'s look (color, head…) changed`);
    if (j(o.actions) !== j(c.actions)) out.push(`${n}'s moves changed`);
    if (j(o.x) !== j(c.x) || j(o.facing) !== j(c.facing) || j(o.size) !== j(c.size)) out.push(`${n}'s place, facing or size changed`);
    if (j(o.style) !== j(c.style) || j(o.speed) !== j(c.speed) || j(o.breath) !== j(c.breath)) out.push(`${n}'s style, speed or breathing changed`);
  }
  for (const c of A) if (!B.some((x) => x.id === c.id)) out.push(`the figure "${c.name ?? c.id}" was removed`);
  for (const [k, say] of [["background", "the place (background)"], ["effects", "the things and effects"], ["objects", "the objects"], ["cuts", "the scenes (cuts)"], ["camera", "the camera"], ["height", "the figures' size"]] as const)
    if (j(before[k]) !== j(after[k])) out.push(`${say} changed`);
  return out;
}
// PUT BACK WHAT WASN'T ASKED (free, exact): each change the request check calls "UNASKED" — in planDiff's own words — is undone
// by copying that part back from the animation before the edit.
export function revertUnasked(before: Record<string, unknown>, after: Record<string, unknown>, unasked: string[]): Record<string, unknown> {
  type Ch = Record<string, unknown> & { id: string; name?: string };
  let out: Record<string, unknown> = { ...after };
  const A = (before.characters as Ch[] | undefined) ?? [];
  const said = (t: string) => unasked.some((u) => u.toLowerCase().includes(t.toLowerCase()));
  out.characters = ((after.characters as Ch[] | undefined) ?? []).flatMap((c) => {
    const o = A.find((x) => x.id === c.id), n = c.name ?? c.id;
    if (!o) return said(`new figure "${n}"`) ? [] : [c];
    let k: Ch = { ...c };
    if (said(`${n}'s look`)) k = { ...k, look: o.look };
    if (said(`${n}'s moves`)) k = { ...k, actions: o.actions };
    if (said(`${n}'s place`)) k = { ...k, x: o.x, facing: o.facing, size: o.size };
    if (said(`${n}'s style`)) k = { ...k, style: o.style, speed: o.speed, breath: o.breath };
    return [k];
  });
  for (const c of A) if (said(`figure "${c.name ?? c.id}" was removed`)) (out.characters as Ch[]).push(c);
  for (const [k, say] of [["background", "the place (background)"], ["effects", "the things and effects"], ["objects", "the objects"], ["cuts", "the scenes (cuts)"], ["camera", "the camera"], ["height", "the figures' size"]] as const)
    if (said(say)) { out = { ...out }; if (before[k] === undefined) delete out[k]; else out[k] = before[k]; }
  return out;
}
async function missingParts(words: string, plan: Record<string, unknown>, edit: boolean, signal?: AbortSignal, changed: string[] = []): Promise<{ missing: string[]; usage: ClaudeUsage }> {
  const r = await askClaude(`You check a 2D stick-figure animation plan against what the user asked. Reply with ONE JSON object: {"missing": ["…"]} — every thing the user asked for${edit ? " in this edit" : ""} that the plan does NOT do (a figure, a count, a color, a place, an action, an effect, a length). The engine CAN draw any physical thing (built from parts: a desk, a chair, a mug, a laptop, a tent…), sit figures on seats and put things in hands — so a note saying such a thing "cannot be drawn" does NOT excuse it: it is missing. Only things truly impossible in a 2D stick-figure scene (animals, real people) may be excused by the notes. Empty list if everything is there.`, [{ role: "user", content: `The user asked: "${words}"\n\nThe plan:\n${JSON.stringify(plan, withoutClips)}${edit ? `\n\nTHIS IS AN EDIT. Compared with the animation before it, the edit changed: ${changed.length ? changed.join("; ") : "nothing"}. Add to "missing", each written as "UNASKED: " + the change's words EXACTLY as listed, every one of these changes the user did NOT ask for (e.g. they asked for night: only the sky, light and colors of the place may change — not the figures, their moves, the things or the scenes). A change the user's words clearly need is fine.` : ""}` }], { maxTokens: 400, signal, kind: "check" });
  let missing: string[] = [];
  try { const j = firstJson(r.text) as { missing?: unknown }; missing = Array.isArray(j.missing) ? j.missing.map(String).filter(Boolean).slice(0, 6) : []; } catch { /* unreadable: nothing flagged */ }
  return { missing, usage: r.usage };
}
// MAKE or EDIT: \`current\` = the project's current plan for an edit ("make him green": change only that).
export async function claudeAnimate(words: string, o: { current?: Record<string, unknown> | null; conversation?: string; research?: string; signal?: AbortSignal; onProgress?: (p: AnimateProgress) => void } = {}): Promise<AnimateResult> {
  const t0 = Date.now(), usage: ClaudeUsage = { inputTokens: 0, outputTokens: 0, usd: 0 };
  const first = o.current
    ? `This is the CURRENT animation's plan:\n${JSON.stringify(o.current, withoutClips)}\n\nThe user asks for an EDIT: "${words}". Change ONLY what they asked (a color, a length, one more scene, removing a thing…) and keep everything else EXACTLY the same — same figures, ids, moves, timing and places. Reply with the whole edited plan JSON.`
    : `${o.conversation ? `Recent conversation (for context):\n${o.conversation}\n\n` : ""}${o.research ? `What a web search found about what they mention:\n${o.research}\n\n` : ""}The user typed: "${words}". Write the plan.`;
  const progress = (percent: number, note: string, etaSec: number | null) => { try { o.onProgress?.({ percent, note, etaSec }); } catch { /* the card is best effort */ } };
  // (an edit that adds scenes may run longer than 15 s: the length law allows the current length + 30 s, or what the words ask)
  const askedSec = Math.max(wordsSeconds(words) ?? 0, o.current ? planSeconds(o.current) + 30 : 0) || null;
  const messages: Msg[] = [{ role: "user", content: first }];
  let best: { score: number; plan: Record<string, unknown>; problems: string[]; round: number } | null = null;
  // THE FIX LOOP (Arthur's audit, Oct 12 — laws/kinds.ts): only BROKEN laws ("LAW …") can keep an animation off the canvas; up to
  // 3 tries fix them. TASTE ("TASTE …": length, standing, pace, page edges, extra moves) and the request check ("MISSING …") get ONE
  // improvement try at most and never block. The engine already fixed what it can for free (tidyPlan, autoRepair).
  const isBroken = (x: string) => x.startsWith("LAW ");
  let tasteTries = 0;
  for (let round = 0; round <= 3; round += 1) {
    progress(10 + round * 22, round === 0 ? (o.current ? "Editing your animation" : "Animating your idea") : "Polishing the movements", Math.max(8, 40 - round * 8));
    const r = await askClaude(animatorGuide(), messages, { signal: o.signal, kind: "animate" });
    usage.inputTokens += r.usage.inputTokens; usage.outputTokens += r.usage.outputTokens; usage.usd += r.usage.usd;
    let plan: Record<string, unknown>;
    try { plan = tidyPlan(firstJson(r.text) as Record<string, unknown>); plan.groundY ??= 900; plan.height ??= 300; plan.id ??= "ai"; plan.pace ??= "natural"; }
    catch { messages.push({ role: "assistant", content: r.text }, { role: "user", content: "That was not one valid JSON object. Reply with only the plan JSON." }); continue; }
    messages.push({ role: "assistant", content: r.text });
    progress(20 + round * 22, "Making the movements feel right", Math.max(6, 30 - round * 8));
    // (LIVE KIMODO, Oct 17: each sentence of real motion is made now and travels inside the plan — kimodo/live.ts; cached = free)
    plan = (await fillLiveMotions(plan, { signal: o.signal, onLog: (x) => { try { process.stderr.write(`${x}\n`); } catch { /* log only */ } } })).plan;
    plan = keepApart(sizeOneFigure(plan));
    plan = handOver(autoRepair(plan, words, askedSec).plan);
    let problems = lawProblems(plan, words, askedSec);
    if (!problems.some(isBroken) && tasteTries === 0) {
      progress(26 + round * 22, "Double-checking everything you asked for", Math.max(5, 25 - round * 8));
      const check = await missingParts(words, plan, !!o.current, o.signal, o.current ? planDiff(o.current, plan) : []);
      usage.inputTokens += check.usage.inputTokens; usage.outputTokens += check.usage.outputTokens; usage.usd += check.usage.usd;
      // (an edit's unasked changes are put back by the engine — exactly, for free — and the laws run again on the result)
      const unasked = check.missing.filter((m) => /^UNASKED:/i.test(m)).map((m) => m.replace(/^UNASKED:\s*/i, ""));
      if (o.current && unasked.length) {
        const back = revertUnasked(o.current, plan, unasked), again = lawProblems(back, words, askedSec);
        if (!again.some(isBroken)) { plan = back; problems = again; check.missing = check.missing.filter((m) => !/^UNASKED:/i.test(m)); }
      }
      problems = [...problems, ...check.missing.map((m) => `MISSING from the request: ${m}`)];
    }
    // (THE ANIMATOR LOG: every round's problems, so a refusal can always be traced to its real cause — no guessing)
    try { const lf = spendFile().replace(/claude-spend\.json$/, "animator-log.jsonl"); if (lf && lf !== spendFile()) appendFileSync(lf, JSON.stringify({ at: new Date().toISOString(), words: words.slice(0, 400), edit: !!o.current, round, problems, plan }, withoutClips) + "\n"); } catch { /* best effort */ }
    const broken = problems.filter(isBroken), taste = problems.filter((x) => !isBroken(x));
    const score = broken.length * 100 + taste.length;
    if (!best || score < best.score) best = { score, plan, problems, round };
    if (!broken.length && (!taste.length || tasteTries >= 1)) break;
    if (!broken.length) tasteTries += 1;
    const must = broken.length ? `MUST FIX (the animation is broken here):\n- ${broken.join("\n- ")}\n` : "";
    const nice = taste.length ? `IMPROVE IF YOU CAN (never break anything for these; keep the length and everything the user asked for):\n- ${taste.join("\n- ")}\n` : "";
    // (the last try never gives up on the user: a SIMPLER version of only the broken part, said plainly in "notes")
    messages.push({ role: "user", content: round < 2 || !broken.length
      ? `${must}${nice}Change ONLY what is listed (keep everything that works) and reply with the whole corrected plan JSON.`
      : `${must}LAST TRY: keep the main idea, the length and everything the user asked for that works, and replace ONLY the part that keeps breaking with a simpler move that passes (a slower or smaller version, a library move instead of custom keys). Say in "notes", in plain words, what you made simpler. Reply with the whole plan JSON.` });
  }
  // (placed when nothing is BROKEN; what taste or the request check still finds is SAID in the reply, never hidden)
  const lawsOk = !!best && !best.problems.some(isBroken);
  const waits = best?.problems.filter((x) => x.startsWith("TASTE idle:")).map((x) => x.replace(/^TASTE idle: /, "").replace(/ \(at most.*$/, "")) ?? [];
  const gaps = best?.problems.filter((x) => x.startsWith("MISSING")).map((x) => x.replace(/^MISSING from the request: /, "")) ?? [];
  const notes = [typeof best?.plan?.notes === "string" && best.plan.notes.trim() ? best.plan.notes.trim() : "", gaps.length ? `Not in it yet: ${gaps.join("; ")}.` : "", waits.length ? `Still a bit of standing: ${waits.join("; ")}. Ask me to fill it with more action.` : ""].filter(Boolean).join(" ") || null;
  if (lawsOk && best && Array.isArray(best.plan.touchAt) && best.plan.touchAt.length) {
    progress(90, "Checking the touch", 30);
    const g = await gateTouches(best.plan, words, o.signal);
    best = { ...best, plan: g.plan, problems: [...best.problems, ...g.gate.notes.filter((n) => n.startsWith("GATE FAIL")).map((n) => `TASTE touch: ${n}`)] };
  }
  progress(96, lawsOk ? "Adding it to your canvas" : "Finishing up", 2);
  return { ok: lawsOk, plan: best?.plan ?? null, title: String(best?.plan?.title ?? "Animation"), problems: best?.problems ?? ["Claude did not write a plan."], rounds: (best?.round ?? 0) + 1, usage, ms: Date.now() - t0, notes };
}
