// AI ANIMATOR VERSION 1 - SAME ENGINE (Nov 1 night, board/v1-single/CONTRACT_SAME_ENGINE.md, helper T1).
// ONE stick figure, moved only by the PASSED engine (ltx-effects/v1k/passed_engine.py -> seedance/run_sentence.py -> director.mjs ->
// plan_to_steps.py -> make.py -> kimodo_scene.py: ONE blended Kimodo call per ~10 s block). Luna talks and writes each block as ONE
// sentence in the user's own body words; the app applies her edit ops to the plan here in TypeScript (v1AnimatorCore.ts applyV1Ops).
// Every word lives in a book (ltx-effects/v1k/luna-book.json, ltx-effects/v1k/passed_engine_book.json); nothing here lists a verb.
// Behind switches, default OFF: DIAMOND_V1_ANIMATOR=1 (server) + NEXT_PUBLIC_DIAMOND_V1_ANIMATOR=1 (panel).
// SHARED FILE: the server and the panel (T3) both import it.

export const V1_ANIMATOR_UI_ENABLED = process.env.NEXT_PUBLIC_DIAMOND_V1_ANIMATOR === "1";

// ---- The animation plan the app hands the engine (contract "v1-blocks")
export type V1Look = "passed" | "neckless"; // "passed" = the review pages' look (neck line); "neckless" = book look.v1k drawing only (app default)
// (Nov 4 PM12) one Kimodo step exactly as the chat AI wrote it (text = Kimodo's words, seconds, travels = he moves place)
// (Nov 7 eve, Arthur: "Sonnet should know when to use Wan") wan = the planner judged Kimodo can't do this move for real: Wan animates it
export type V1KimodoStep = { text: string; before?: string; seconds: number; travels: boolean; airborne?: boolean; changed?: boolean; look?: string; wan?: boolean; face?: "viewer"; said?: string;
  step?: number; after?: number;
  part?: number };   // (Nov 17, PLAN_FINAL_NOV17) a create over 15 s: which part (from 1) this step is in - never in a saved plan: the app makes part 1, then each next part as "add the next part"   // (Nov 15) ONLY in the AI's edit answer, never in a saved plan: step = the saved step this one replaces (from 1), else after = the saved step it follows (0 = the start) - see applyStepEdits
//   // (Nov 14) look = a LOOK change of this step, in a few words ("the axe is red"): its pictures are redrawn, nothing is animated (kimodo/wan.py relook)   // (Nov 10) said: the user's own phrase(s) this step came from (askedDetails), sent to the animator with the timing // (Nov 10) face: the planner marks a move shown facing the viewer; the drawer turns the camera for it
export type V1Block = {
  id: string; // b1, b2, ... (an id is never reused inside one animation)
  sentence: string; // the user's own words for this ~10 s part
  seed_bump: number; // 0 = the passed seed; redo = +1 (a fresh Kimodo take of the same words)
  // (Nov 2 night, EDIT BY MOVE, attack 7) the FROZEN moves of this block's take as it was made (the director's beats from the engine report;
  // no beats there = the sentence cut by the book's splitter). The app fills it when a version is done; the AI sees them numbered.
  beats?: string[];
  steps?: V1KimodoStep[]; // (Nov 4 PM12) this take's Kimodo steps as written (then no planner runs for it)
  // (Nov 2 night) a rewrite of ONE move: the take is re-made from beat edit_from_beat (0-based) on; beats before it are kept byte-identical
  // (helper A's engine contract). Only on the version that made the change; the app checks the kept pictures (identity check).
  edit_from_beat?: number;
  timing?: V1Timing[]; // (Nov 3 FINAL V2) asked timing of this block's moves (slow motion of a move, pose holds), drawn $0 from the same take
};
export type V1Plan = {
  contract: "v1-blocks";
  colour: string; // CSS colour
  look: V1Look;
  mirror: boolean; // $0 left <-> right flip of the drawn take
  size?: number; // $0 scale of the drawn pictures about his feet (1 = the house size; book passed_engine_book.json "size"); absent = 1
  partColours?: V1PartColours; // $0 re-draw: a CSS colour per body part (a part not named = `colour`); absent = all `colour`
  style?: V1Style; // (Nov 2) $0 re-draw: hollow head / glow / pen thickness; absent = the plain drawing
  asked_s?: number;
  context?: { words: string; previous?: string; change?: string }; // (Nov 3 final part A) the user's own words + on edits the previous instructions, for the planner // (Nov 3 one-take round) the length the user asked, in seconds: the engine fits the take to it (book length_law)
  page?: number; // (Nov 14) the page's shape (width / height) the animation was made for: the animator's frame has this shape (h3_scene.py); absent = 16:9
  scene?: string; // (Nov 14) the first picture in words, nothing moving: the animator draws the scene first and the story starts from it - kimodo/wan.py chain
  room?: "big"; start?: "left" | "right"; // (Nov 14) the first picture: big = he is drawn smaller so a tall thing fits; where he starts (absent = the middle) - h3_scene.py
  cameraMoves?: true; // (Nov 17, Arthur: "H3 is the camera") the user asked for camera moves, cuts or transitions: H3 is told the camera does what the words say (kimodo/wan.py SAID, env H3_CAMERA); absent = the locked camera, exactly as before
  noFigure?: true; // (Nov 13, Version 1 = with objects) things moving on their own: no stick figure is drawn, the first picture is the empty page (kimodo/wan.py NO_FIGURE)
  camera?: "still"; // (Nov 2 final round, "defaults never rules") absent = the follow camera (the DEFAULT); "still" = the user asked for a still
  //   camera: the engine never follows (book app_engine_book.camera_still_set) and the app fits by the first picture, so he can walk off the page
  blocks: V1Block[];
};
export type V1Camera = "follow" | "still";
// (Nov 2) a colour per body part; "spine" / "torso" = body. Engine side: passed_engine.py reads plan.partColours.
export const V1_PARTS = ["head", "arms", "body", "legs", "leftArm", "rightArm", "leftLeg", "rightLeg"] as const; // (Nov 5) one arm / leg on its own wins over its group
export type V1Part = (typeof V1_PARTS)[number];
export type V1PartColours = Partial<Record<V1Part, string>>;
// (Nov 2) APPEARANCE STYLE (never refused). Engine side: passed_engine.py reads plan.style -> kimodo_scene.py --style; the numbers (pen
// multipliers, glow blur/strength) live in passed_engine_book.json app_engine_book.set["kimodo_scene.style"]; the names below are its keys.
//   hollowHead: the head drawn as a ring (same size, the pen's width, see-through inside)
//   glow: a soft halo around every stroke; colour = CSS colour (absent = each stroke's own colour); strength = book glow keys
//   pen: line thickness = book pen keys (thin / normal / thick)
export type V1Pen = "thin" | "normal" | "thick";
export type V1GlowStrength = "soft" | "strong";
export type V1Glow = { colour?: string; strength?: V1GlowStrength };
export type V1Outline = { colour?: string; width?: number }; // (Nov 5) one outline ring around every line; width in pens
export type V1Style = {
  hollowHead?: boolean; glow?: V1Glow | null; pen?: V1Pen; headScale?: number; penScale?: number; // (Nov 2) head size / line thickness x plain (book style.scale ranges)
  outlines?: V1Outline[]; opacity?: number; partThick?: Partial<Record<V1Part, number>>; partOpacity?: Partial<Record<V1Part, number>>; headShape?: string; // (Nov 5) any look
};

// (Nov 3 FINAL V2) ONE asked timing of ONE move of a block: move = 0-based beat; from / to = the share of that move (0..1, absent = all of it);
// factor = slow motion (0 < factor < 1: 0.5 = half speed); hold = pose-to-pose: "keys" (his key poses held, then the next) or "every" (on n's)
export type V1TimingHold = "keys" | "every" | "still"; // (Nov 8 night) still = the move's peak pose held for `seconds` ("hold the flex longer")
export type V1Timing = { move: number; from?: number; to?: number; factor?: number; hold?: V1TimingHold; n?: number; seconds?: number };

// ---- Luna's edit ops (applied to the CURRENT plan, in order, by applyV1Ops)
export type V1EditOp =
  | { op: "rewrite"; block: string; sentence: string; parts?: string[]; beat?: number } // (Nov 2 night) beat = the 1-based move that changes (edit by move) // new words for ONE block (every word not asked to change stays);
  //   (Nov 2) parts = the AI's split of that sentence into separate actions (2+ = the block becomes that many blocks, in order)
  | { op: "append"; sentence: string } // the next part: a new block at the end
  | { op: "delete"; block: string }
  | { op: "redo"; block: string } // same words, a fresh take (seed_bump + 1)
  | { op: "colour"; colour: string } // $0 re-draw (the WHOLE figure: clears any part colours)
  | { op: "partColours"; partColours: V1PartColours } // $0 re-draw: only the parts named change colour
  | { op: "style"; style: V1Style } // $0 re-draw: only the style keys named change (glow null = no glow, pen "normal" = the plain pen)
  | { op: "mirror" } // $0 re-draw (left <-> right; a toggle)
  | { op: "look"; look: V1Look } // $0 re-draw
  | { op: "size"; size: number } // $0 re-draw: his NEW size (1 = normal, 0.5 = half, 1.5 = half again as big)
  | { op: "fps"; fps: number } // $0, no engine run: the project's pictures per second (playback smoothness)
  | { op: "timing"; block: string; beat: number; factor?: number | null; hold?: V1TimingHold | "none" | null; seconds?: number | null; from?: number | null; to?: number | null } // (Nov 3 FINAL V2) $0 re-draw: slow motion / pose holds of ONE move (beat 1-based); factor 1 + hold none = as made
  | { op: "speed"; speed: number } // (Nov 2) $0, no engine run: how fast it plays (1 = as made; the placed pictures are re-timed)
  | { op: "camera"; camera: V1Camera } // (Nov 2 final round) the follow camera (default) or a still camera (he can leave the screen)
  | { op: "clear"; scope: V1ClearScope; confirmed?: boolean }; // (Nov 2) $0, no engine run: the panel clears the canvas (app Undo brings it back)
// (Nov 2) clear canvas: "ai" = the AI animation's layer(s) and frames; "all" = every frame on the canvas (only once the user said yes:
// confirmed true; else the server asks the book's one-sentence question first)
export type V1ClearScope = "ai" | "all";

// ---- One Luna turn
export type V1Intent = "conversation" | "create" | "edit" | "clarify" | "refuse";
export type V1LunaTurn = {
  removeSteps?: number[] | null;   // (Nov 15) an edit: the numbers (from 1) of the saved steps the user asked to take out
  intent: V1Intent;
  say: string; // what Luna says to the user (plain, short, honest)
  blocks?: { sentence: string; parts?: string[] }[]; // intent "create": the FIRST ~10 s block, the user's own body words
  //   (Nov 2) parts = that sentence split into its separate actions (2+ = the server makes each its own block, in order)
  colour?: string | null; // intent "create": only when the user named his colour
  partColours?: V1PartColours | null; // intent "create": only when the user named a colour for a body part
  style?: V1Style | null; // intent "create": only when the user asked for a hollow head, a glow or thinner / thicker lines
  size?: number | null; // intent "create": only when the user said how big ("a really tiny stick figure"), same scale as the size op
  noFigure?: boolean; // create: things moving on their own, with no stick figure at all
  cameraMoves?: boolean; // (Nov 17) create / edit: the user asked for a camera move, cut, transition or teleport (H3 animates the camera)
  scene?: string | null; room?: "normal" | "big" | null; start?: "left" | "middle" | "right" | null; // create (Nov 14): how much room the story needs, where he starts
  still?: boolean; // create / edit: the result is ONE still pose (no motion) -> the panel says "Drawing", not "Animating"
  ops?: V1EditOp[]; // intent "edit"
  requestedSeconds?: number | null; // (Nov 2) the length the user asked for, by meaning (absent / null = none said)
  notDrawn?: string[]; // (Nov 11) asked for but NOT drawn (shown on the gate card)
  lookBriefs?: string[]; // (Nov 11) one detailed gate line per look change
  newThings?: string; // (Nov 22) an edit / added part brings NEW things: one still sentence of them where they first appear (the card's picture)
  questions?: { text: string; options: string[] }[] | null; // (Nov 11) the question card: up to 3 questions, first option of each = pre-picked
  stepBriefs?: string[]; // (Nov 11) one short line per kimodoSteps step, for the gate card only (the animator reads the step text)
  heard?: string | null; // (Nov 11) the request as the user means it (slips fixed, "go" / "again" spelled out); the words H3 reads when making
  askedDetails?: { said: string; step: number }[] | null; // (Nov 4 PM12) the user's whole message in pieces -> the step holding each (0 = not motion)
  kimodoSteps?: V1KimodoStep[] | null; // (Nov 4 PM12, NO TELEPHONE) the chat AI's own Kimodo steps for the WHOLE animation, sent as written
  storyPlan?: V1StoryPlan | null; // (Nov 2) plan first: the story's parts (clarify = the proposed plan; create = the agreed plan)
  leftward?: boolean | null; // (Nov 2 final) intent "create": he moves / faces toward the LEFT of the screen (the user said so) -> the plan starts mirrored
  camera?: V1Camera | null; // (Nov 2 final round) intent "create": only when the user asked how the camera behaves (null = the follow default)
  clear?: { scope: V1ClearScope } | null; // (Nov 2, server -> panel) clear the canvas now ($0, no engine run)
};
// (Nov 2) plan first: a story made in parts of about one block each (book long_scenes)
export type V1StoryPlan = { parts: { seconds: number; says: string }[] };

// ---- What the panel shows while work happens. The engine prints `STAGE <code> <words>` and `PROGRESS <pct> <eta_s>` lines.
export type V1StageCode = "thinking" | "planning" | "animating" | "checking" | "joining" | "drawing" | "placing";
export type V1Progress = { pct: number; etaS: number; late?: boolean; part?: [number, number] }; // 0-100, seconds left; (Nov 22) late = past its expected time; part = [this part, of parts] of a long story
export type V1Stage = { code: V1StageCode; words: string; i?: number; n?: number; progress?: V1Progress };

// ---- What the engine reports (D/report.json)
export type V1BlockReport = {
  id: string;
  sentence: string;
  made: "new" | "same" | "edited"; // (Nov 10 editing) "edited" = made FROM the version before (an edit: the small-edit price); "same" = (sentence, seed_bump) unchanged: the identical folder of the version before
  frames: number;
  labels: string[]; // honest plain words
  firstFrame: number;
  lengthS: number;
  moves: string[]; // the director's beat words
  seedBump: number;
  redrawn: boolean; // colour / look / mirror re-draw of the same take ($0)
  kimodoCalls: number;
  checks?: V1ActionCheck[]; // (Nov 2) the engine's own check of each action the user named in this block
  checkWords?: string[]; // (Nov 2, server) those checks in plain words (book server_words check_seen / check_not_seen)
  editFromBeat?: number | null; // (Nov 2 night) the engine honoured block.edit_from_beat (absent = it re-made the whole block)
  beatStarts?: number[] | null; // (Nov 2 night) each beat's first picture, counted from the block's firstFrame
  backup?: [number, number][] | null; // (Nov 8 eve) the pictures [from, to] the backup animator (H3) drew in this part
};
// (Nov 2) passed_engine.py report blocks[].checks: action = the user's words, sign = what was measured, value = the measure, pass
export type V1ActionCheck = { action: string; sign: string; value: number | null; pass: boolean };
// (Nov 2) passed_engine.py report kept_previous: the new take came out worse, so that block kept the version before
export type V1KeptPrevious = { block: string; why: string };
export type V1FrameChanges = { edited: number; added: number; deleted: number }; // vs the version before, on the layer pictures
export type V1Report = {
  ok: boolean;
  refused: string | null; // the book's / director's refusal words; 0 Kimodo calls
  blocks: V1BlockReport[];
  mirror?: boolean; // (Nov 4 PM12) the engine's FINAL left/right setting (it turns him around when the AI checker saw the wrong way)
  labels: string[];
  frames: V1FrameChanges;
  lengthS: number;
  kimodoCalls: number;
  fps: number;
  stage: [number, number]; // the drawing's page size
  layersDir: string; // transparent pictures, one per picture at fps (NNNN.png)
  video: string | null;
  inkBox?: [number, number, number, number] | null; // where the figure moves, in stage pixels (the canvas centres it on the page)
  moments?: { frame: number; x: number; y: number }[]; // (Nov 2 night) key moments (a foot raised high), stage pixels, time order
  size?: number; // the size really drawn (may be less than asked when bigger does not fit the screen)
  keptPrevious?: V1KeptPrevious | null; // (Nov 2) see V1KeptPrevious
  keptPreviousSay?: string | null; // (Nov 2, server) what the panel says then (book server_words kept_previous)
  viewerSheet?: string | null; // (Nov 3 key 2) D/viewer_sheet.png: each move's PEAK picture, numbered (the viewer looks at it)
  viewer?: { showsRequest: boolean | null; missing: string; tries: number } | null; // (Nov 3 key 2, server) the viewer's verdict on THIS take (null = no verdict) + the takes made
  viewerSay?: string | null; // (Nov 3 key 2, server) the ONE honest line the panel says after the result (null = it showed what was asked)
};

// ---- One animation = a list of versions (Undo / Redo walk this list: instant, $0, outputs kept)
export type V1JobStatus = "running" | "done" | "refused" | "failed" | "cancelled";
export type V1Version = {
  n: number; // 1, 2, ...
  plan: V1Plan;
  still?: boolean; // (app side only) this version is one still pose: the panel says "Drawing" while it is made
  edits: V1EditOp[] | null; // the ops that made this version from the one before (null for the first)
  status: V1JobStatus;
  stage: V1Stage | null; // while running
  progress: V1Progress | null; // while running (the engine's PROGRESS lines)
  report: V1Report | null;
  inkBox?: [number, number, number, number]; // (Nov 8 night) a move edit's canvas placement = the version it edits (its kept pictures stay exactly where they were); absent = from the fit
  dir?: string; // (Nov 3 key 2) the folder (under the animation's) this version was really made in; absent = v<n> (the viewer's re-try = v<n>-viewer<k>)
  message: string | null; // plain words for the user when refused / failed
  createdAt: string;
  finishedAt: string | null;
};
export type V1AnimationSnapshot = {
  animationId: string;
  projectId: string;
  versions: V1Version[];
  current: number; // the version on the canvas (Undo = the done version before, Redo = the done version after)
  fps?: number | null; // the playback pictures per second asked with the fps op (null = the engine's own fps)
  speed?: number | null; // (Nov 2) the playback speed asked with the speed op (null = 1, as made)
  layerId?: string | null; // the canvas layer the panel put it on (so edits / Undo / Redo after a reload replace THAT layer)
  layerCount?: number | null; // how many frames of that layer it fills (what a replace takes out)
  // (Nov 2) FIXED GROUND LINE: the FIRST done version's page fit (where he moves, in stage pixels, and whether that take was mirrored).
  // Every later version is fitted to the page with THIS box, so size / colour / look edits never move his feet. Kept in animation.json.
  fit?: V1Fit | null;
  storyPartsLeft?: number; // (Nov 20) a story in parts: how many parts are still to come (the panel keeps watching until 0)
  storyPartsHeld?: number; // (Nov 20) a story that stopped half way (no money / no video): the parts kept for "Make the rest of my story"
};
export type V1Fit = { inkBox: [number, number, number, number]; mirror: boolean };
// One saved chat line (server side, next to animation.json; restored when the panel opens again after a reload / restart).
export type V1SavedLine = { role: "user" | "assistant"; text: string; at: string; kind?: "result" | "note" | "error" | "plan"; version?: number };

// (Nov 2 final round) THE AI SEES THE CANVAS: ONE small picture of what the USER drew (their layers, the current frame; the AI's own
// figure layer left out), sent with a chat turn only when there is user drawing. The limits come from the book (luna-book.json "canvas"):
// the server gives them to the panel (GET restore answer `canvas`), and drops any picture outside them. data = base64, no "data:" prefix.
export type V1CanvasMediaType = "image/jpeg" | "image/png";
// (Nov 2 final round) ground = the book's ground-line ruler (canvas.ground, v1PageFit.ts): the panel finds the user's ground line with it
// (Nov 2 night) sheetFrames = book canvas.sheet.max_frames: the panel may send ONE contact sheet of up to that many frames (absent = no sheet)
export type V1CanvasLimits = { maxPx: number; mediaType: V1CanvasMediaType; quality: number; maxBytes: number; ground?: import("./v1PageFit.ts").V1GroundRule; sheetFrames?: number };
export type V1CanvasPicture = { mediaType: V1CanvasMediaType; data: string; width: number; height: number; frames?: number[]; note?: string }; // frames = a contact sheet's frame numbers (1-based, time order)
