# SPEC-0017 — AI Animator Engine and Director

Status: **Approved 2026-10-04. Phase 1 published (product commit b7a0800c61973d7729e1d9cf2f7a0bea90f537b2); Phase 2 next.**
Owner: Arthur
Builder: Claude
Created: 2026-10-03
Decision link: D-0179
TODO IDs: AIANIM-ENGINE, AIANIM-TESTS
Starting point: `main` at `19ba17c`
Time box: 8–10 working days (Phases 1–5), so V1 can still be ready around 2026-11-02.

---

## 1. In one minute

**What we're building:** a way for the AI Animator to make real stick-figure animations. You type "two stick figures run in and high-five". New frames appear on your timeline. You can play them, draw on them, erase them and undo them, like any frames you drew yourself.

**The big idea: the AI never draws, and it never makes frames. It is the director.**

Earlier tries failed about 6 times. Each time the AI had to invent every pose and every frame itself, and the bodies looked wrong. Turning videos into frames cost too much. This time the work is split into three jobs:

| Job | Who does it | What it means |
| --- | --- | --- |
| **What happens** | The AI (Grok or Terra) | Picks the characters, the moves, the styles, the timing and where everyone stands. For a move that isn't in the library, it invents new key poses using what the library taught it. It writes a short plan, not pictures. |
| **How moves look** | The **moves library** (made with math, built into the app) | About 12 body moves (walk, run, jump, wave, sit, squat, kick, punch, turn, fall, high-five, stand still) plus object moves (slide, bounce, spin, grow/shrink). Each move has knobs like speed, energy, direction and height, plus a **style** (natural, robot, sneaky, tired, happy, angry, heavy…). |
| **Keeping it natural** | The **engine rules** | Arms and legs never stretch. Elbows and knees only bend the right way. Feet stay put on the ground when they should. Moves speed up and slow down smoothly and follow curved paths. The engine checks and fixes every AI plan before anything reaches your timeline. |

**Why it works without Blender:** the AI picks moves, styles and knobs, and the math library and engine rules make every pose. So a confused AI can't produce a broken body. The worst case is a plain or wrong move, never a twisted one. **Blender files are optional** (Arthur's dad, 2026-10-04: they're expensive to make). They're only used if a move can't look natural with math.

**How the AI learns (Arthur's idea: teach it the basics, then let it solve new problems).** Like teaching a kid 5 + 5 = 10 and 10 − 2 = 8, then asking 3 + 3: every time the AI connects, it is first given **lessons** made from the moves library. Each lesson shows a move's key poses and timing, and *why* they look natural (wind-up before a punch, bending to land, speeding up and slowing down). Then, when you ask for something the library doesn't have ("do a cartwheel", "robot dance"), the AI writes **its own original key poses** using what the lessons taught. The engine still does all the in-between math, timing and body rules, so **every animation, library or original, stays natural. That is permanent in Diamond Animator.**

**You only talk to the AI.** The finished AI Animator has **no move-picker buttons**. You chat: "a stick figure walks in and punches a bag." It plans the animation and shows it. Then you edit by chatting: "make the punch more powerful", "make him walk like a robot". The AI changes only what you asked for.

**You judge the look before any money is spent.** Phases 1 and 2 use no AI at all. You see the engine and the moves and say if they look good. Only then do we pay for small AI tests.

## 2. What it will NOT do in V1

- It will **not animate your hand-drawn pictures limb by limb.** A drawing is just colored dots (pixels) with no bones inside. The AI *can* move a drawing you named as a Symbol as one whole piece: slide it, bounce it, spin it, grow it or shrink it.
- Characters are **stick figures only.** You can choose color, line thickness and head size. No faces, clothes or custom bodies yet.
- **No drag-the-joints posing tool** for now. You chose to leave it out. It could be added later in about 1 day.
- No talking or lip-sync, no crowds (V1 limit: up to 4 characters and 4 objects in a scene), no 3D camera moves.
- Scenes are short: up to about 8 seconds (the exact cap comes from Phase 1's memory test).
- **No fade** (objects slowly appearing/disappearing). Arthur's decision: it doesn't fit the app.
- **V1 = animation only.** No sound effects and no character voices; those are Version 2 or later.
- **No move-picker buttons** in the finished app. Everything is made and edited through chat. (The test buttons in Phases 1–4 are temporary and only in review copies.)
- It never changes your existing frames or layers. Every new scene goes on a **new layer**.
- **You never have to place anything.** You don't move the playhead or type frame numbers. You say it in story words ("after the stick figure punches, a ball bounces") and the AI works out where it goes.

## 3. The 5 phases

Each phase is built in a separate review copy of the app (same as SPEC-0016). You test it there. Nothing reaches the real app until you say PASS and then "publish".

### Phase 1 result — D-0179 (Arthur PASS, published `b7a0800`)

- **Built:** `src/lib/animator/` — `rig.ts` (11 joints, proportions, bend limits, style), `pose.ts` (forward kinematics from angles), `easing.ts` (monotone-cubic channels, ease curves, shortest-turn shoulders), `ik.ts` (two-bone solver), `engine.ts` (key poses → frames: clamp limits, stand on ground with `lift`, planted-foot locks, hips sink when a planted foot is out of reach, swinging feet never go through the floor, per-frame report), `render.ts`, `toFrames.ts` (compact frame pictures + holds), `testScenes.ts` (5 scenes), `engine.test.ts` (17 checks). Editor hook: `applyAnimatorScene` in `DrawingWorkspace.tsx` (new top layer `AI: <title>`, starts at frame 1, one undo step). Scenes are sized by page height and centered.
- **Compact frames (added during Phase 1 with Arthur's OK):** `src/lib/animation/compactRasterBitmap.ts` (+6 checks). See D-0179 for results and limits.
- **Arthur:** PASS — "definitely natural"; keep the engine untouched. Engine files are frozen at this version unless Arthur asks.
- **Not included (as planned):** AI, moves library, joint-posing tool.

### Phase 1 — Characters + engine (no AI) · about 2 days

**Builds:** the stick-figure character (real joints, fixed bone lengths, bend limits), more than one character in a scene, the pose format, the in-between engine with the body rules, and the step that turns poses into normal frames on a new layer.

**How Arthur tests it:** in the AI Animator area there is a temporary **"Engine test"** list (review copy only) with 5 ready-made scenes written by hand. There is no AI in this phase.
1. **Jump:** crouch, jump, land, stand.
2. **Wave:** stand and wave with one arm.
3. **Squat and stand:** go down slowly and come back up.
4. **Two figures high-five:** two characters walk together and slap hands.
5. **Fast vs slow:** the same jump at two speeds, side by side.

Click a scene. Frames appear on a new layer. Press Play. Then pick a generated frame and draw or erase on it to prove it's a normal frame. Press Undo: the whole scene goes away in one step.

**Pass when:** the motion looks smooth and natural, with soft starts and stops. Arms and legs never stretch or bend backwards. Feet don't slide or sink into the ground. Two characters don't flicker or glitch. Generated frames can be drawn on, erased, undone, saved, reopened and exported. A 2-character scene of about 48 frames appears in a few seconds, and the editor stays smooth.

**Not included:** AI, the moves library, the joint-posing tool.

### Phase 2 — Moves library (no AI) · about 2 days

**Builds:** the math-made moves, **walk and run first** (they're the hardest to make natural and decide whether any Blender files are needed). Body: walk, run, stand still/breathe, jump, wave, sit, squat, kick, punch, turn around, fall down, high-five. Objects (for Symbols): slide along a path, bounce, spin, grow/shrink. (No fade — Arthur's decision.)

Every move also gets a **style** knob: natural, robot, sneaky, tired, happy, angry, heavy. A style changes *how* the move looks (a robot walk is stiff with sharp starts and stops; a tired walk is slumped and slow), and the engine rules still apply. Each move is also written up as a **lesson** for the AI (its key poses, timing and why it looks natural). The lessons are made automatically from the same move code, so they can never disagree with the moves.

**How Arthur tests it:** the "Engine test" list gets a **Moves** section (review copy only). Pick a move, change 2–3 knobs (speed slow/normal/fast, energy, height, direction left/right, **style**) and press Make. Start with walk and run, natural and robot. For object moves, draw something (a ball), name it as a Symbol, then pick "bounce". Arthur and his dad decide if walk and run look natural enough to skip Blender files.

**Pass when:** you'd be happy to see each move in a real cartoon. You mark each move good / OK / redo. Moves marked "redo" get fixed before Phase 3. Knobs and styles change the motion the way you expect (a robot walk clearly looks like a robot, and still never breaks the body rules).

**Not included:** AI.

### Phase 3 — AI director = Test 1 (Grok vs Terra) · about 2 days

**Builds:** the AI director. When it connects, it first gets the **lessons** from the moves library (see section 1). Grok (xAI) and Terra each get the same request and write a plan. The engine checks and fixes the plan, then makes the frames. A private **test bench page** runs a fixed set of **20 test prompts** through both AIs and shows the results side by side. **5 of the 20 are "never taught" moves** (for example a cartwheel, a robot dance, tiptoeing, throwing a ball, a victory celebration): the "3 + 3" test of whether the AI can invent original moves that still look natural. Others use styles ("walk like a robot", "a tired run") and energy ("a powerful punch").

**Needs first:** the xAI key, set up by your dad, and **your OK for small paid test calls** (see section 4).

**How Arthur tests it:** open the test bench and press Run. Watch each prompt's result from Grok and from Terra play side by side. Rate each one good / OK / bad. The page also shows how many plans worked, how many needed fixing, the cost per animation and the time per animation.

**Pass when:** at least 17 of 20 prompts give a usable scene for the winning AI, **including at least 4 of the 5 never-taught moves looking natural to Arthur**. Zero broken bodies reach the frames (the engine catches 100%). Each animation costs a few cents or less. You pick Grok, Terra or "use both".

**Not included:** typing in the real editor chat (that's Phase 4), Blender motion.

### Phase 4 — AI Animator in the editor · about 2 days

**Builds:** the real flow, **chat only, no move-picker buttons**. Type in the shared chat box. The AI plans the animation and a small **preview** plays right in the chat. Press **Apply** and editable frames appear on a new layer. Undo works. Follow-ups edit only what you asked: "make the punch more powerful" changes that punch's energy, "make him walk like a robot" changes that walk's style, "make the jump higher" or "slower" change those knobs. The kept plan is changed and the scene is remade.

*Stretch goal, only if time allows:* say "remember that move as robot dance" and an AI-invented move is saved into the library, so the library grows for free.

**How Arthur tests it:**
1. Type "a stick figure walks in and waves". A preview plays in the chat.
2. Press Apply. A new layer appears with the frames. Press Play.
3. Draw on one of those frames. Undo, then Redo.
4. Type "make him wave twice". The scene updates.
5. Type "after he waves, a ball bounces" (with a Ball symbol). The ball starts right after the wave ends — no playhead needed.
6. Save, reopen and export. Check the AI Dashboard shows the usage.

**Pass when:** all 6 steps work. Story-order requests ("after…", "then…", "at the same time as…", "at the end") land in the right place. Nothing else in the project changes. The chat box looks exactly the same as the Assistant's. If the AI fails, you see a friendly message and nothing changes.

**Not included:** Blender motion. Animating hand drawings limb by limb.

### Phase 5 — Library check + cleanup (Blender optional) · about 1 day

**Builds:** cleanup and the final check. The temporary test lists are removed, so only the chat remains. The full library and the never-taught moves are re-checked in the real editor flow. **Blender is optional** (decided 2026-10-04 with Arthur's dad, since motion files are expensive): only if a move still can't look natural with math do we bring in motion for **just that move**, from a few Blender files or a free motion-capture library (license checked first). It goes through the converter in 6.12, under the same move name, and the engine rules still apply.

**When:** after Phase 4. Blender work happens only if Phase 2 or 3 shows a move that math can't make natural.

**How Arthur tests it:** make a few animations only by chatting, and edit them by chatting. If any move needed motion files, compare it math vs file side by side and pick.

**Pass when:** the AI Animator works by chat alone, every library move is marked good, and any motion-file move (if used) works in the editor flow.

## 4. Timeline and money

| Days | Phase | AI money |
| --- | --- | --- |
| 1–2 | 1. Characters + engine | $0 |
| 3–4 | 2. Moves library | $0 |
| 5–6 | 3. Grok vs Terra test | about $1–4 total, **hard cap $5** |
| 7–8 | 4. In the editor | under $1 of test calls |
| 9–10 | 5. Library check + cleanup (Blender optional) | under $1 |

Your review time is extra, usually the same day. Target finish: around **2026-10-15 to 10-17**, which leaves about 2 weeks for the rest of V1.

**Money safety:**
- No paid AI call happens before you say OK for Phase 3. Keys are set up by your dad, not by Claude.
- Every AI request has a limit on how much text the AI may write, and a cost check before it's sent (about 5 cents at most per request).
- A plan gets at most **1 retry**. After that you see a friendly "couldn't make that — try something simpler" message.
- The test bench stops by itself when the run reaches its budget.
- Keys stay on the server. The browser never sees them.
- Rough real-use cost after V1: about 1–5 cents per animation (to be measured in Phase 3).

**Biggest risk: it still might not look natural.** Fix: you judge the engine (Phase 1) and every move (Phase 2) **before** any AI money is spent. If a move looks wrong, we fix that one move's math. We don't ask the AI to try harder. Motion files (optional) are the backup only for a move that math can't make look good.

## 5. Protected — what must NOT change

SPEC-0017 adds a **new engine alongside** the app. It only writes **ordinary frames** (and ordinary Symbol placements) onto a **new layer**, using the same insert, undo and save steps the editor already uses. It does not change:

- login/logout, accounts, who owns which project
- saving, Save As, reopen, recovery drafts and the project file format (no new fields)
- your existing frames, layers and drawings (no silent deletion, ever)
- Assistant AI replies, web search and dictation
- notifications
- usage recording math (Phase 3/4 only adds the provider name, "xai" or "openai", to the same records)
- the drawing engine (brushes, eraser, fill, lasso, tweens) and the export engine
- the look rules from SPEC-0016: the shared chat box `src/components/ui/ChatComposerParts.tsx` stays identical for the Assistant and the AI Animator; the canvas stays white; timeline frames stay gray `rgb(124,128,136)` with black dots; hover stays `#0066FF`; colors come from the `--da-*` tokens in `app/globals.css`
- the old legacy `/api/ai` route and the old stick-figure workspace (left alone; cleanup is a separate task)

**Relation to SPEC-0008:** SPEC-0017 replaces SPEC-0008's paused Phases 2–6 (the video→frames path). SPEC-0008 Phase 1 (Terra chat) stays. Arthur's Preview → Apply flow replaces SPEC-0008's "auto-commit with no Apply" rule. D-0179 records this.

---

## 6. Technical design (for the programmer)

### 6.1 Character rig

- 11 joints, the same shape as the old `app/engine/stickRig.ts`: `head, neck, hip, lElbow, lHand, rElbow, rHand, lKnee, lFoot, rKnee, rFoot`. The head is drawn as a circle at the end of the neck bone.
- Bone lengths are fractions of character height `H`: torso (hip→neck) 0.30, neck→head 0.10, upper arm 0.16, forearm 0.15, thigh 0.23, shin 0.23. Head radius is 0.07 (small 0.055, large 0.09). Default `H` is 0.30 of stage height (324 px on 1920×1080).
- Style per character: `color` (hex), `thickness` (2–14 px at 1080p), `headSize` (`small|normal|large`), `headFilled` (bool).
- **Poses are stored as angles, not points.** Points are always rebuilt by forward kinematics. This means bones *cannot* change length. That's the single biggest fix over the old attempts.

### 6.2 Pose format

```ts
type PoseAngles = {          // degrees; 0 = straight down the parent bone
  root: { x: number; y: number }; // hip position in stage units (0..1920, 0..1080)
  facing: "left" | "right" | "front";
  lean: number;              // torso vs vertical, -35..35 (hinge moves up to 70)
  head: number;              // head vs torso, -25..25
  lShoulder: number; rShoulder: number;  // upper arm vs torso, -180..180
  lElbow: number; rElbow: number;        // bend 0..150, one direction only
  lHip: number; rHip: number;            // thigh vs torso, -110..100 (front/back per facing)
  lKnee: number; rKnee: number;          // bend 0..140, backwards only
};
type PoseKey = { t: number; pose: PoseAngles; contacts?: ("lFoot"|"rFoot"|"lHand"|"rHand")[]; ease?: EaseName };
```

**Bend direction comes from `facing`, never from which side of the screen a joint is on.** (Choosing the wrong bend this way caused past rejections.) For `front`, knees bend outward and elbows bend down/out. Walk, run, kick and punch require `left`/`right`. The engine turns `front` into a side view for those moves through `turn`.

### 6.3 The plan (what the AI writes)

The AI writes a strict JSON object. A strict schema is enforced with structured outputs on both providers:

```json
{
  "version": 1,
  "title": "Run and high-five",
  "durationSec": 4,
  "groundY": 0.85,
  "characters": [
    { "id": "a", "name": "Red", "style": { "color": "#d23a52", "thickness": 6, "headSize": "normal" },
      "start": { "x": 0.15, "facing": "right" } },
    { "id": "b", "name": "Blue", "style": { "color": "#1f5fbf", "thickness": 6, "headSize": "normal" },
      "start": { "x": 0.85, "facing": "left" } }
  ],
  "objects": [ { "id": "ball", "symbolName": "Ball", "start": { "x": 0.5, "y": 0.6, "scale": 1, "rotation": 0 } } ],
  "steps": [
    { "actor": "a", "move": "run", "at": 0, "dur": 1.5, "params": { "speed": "fast", "toX": 0.45 } },
    { "actor": "b", "move": "run", "at": 0, "dur": 1.5, "params": { "speed": "fast", "toX": 0.55 } },
    { "actor": "a", "move": "highFive", "at": 1.5, "dur": 0.8, "params": { "partner": "b" } },
    { "actor": "ball", "move": "bounce", "at": 0, "dur": 3, "params": { "height": 0.2, "count": 3 } },
    { "actor": "a", "move": "custom", "at": 2.5, "dur": 1, "keyPoses": [ { "t": 0, "pose": { "...": "PoseAngles" } } ] }
  ],
  "place": { "type": "after", "ref": "scene-1:a:punch" },
  "reply": "Red and Blue run in and high-five."
}
```

- Positions are fractions of the stage (0..1). Times are in seconds. The engine renders at the **project's current FPS** and never changes it.
- Limits: ≤4 characters, ≤4 objects, ≤8 s (final number set in Phase 1), ≤40 steps, ≤6 key poses per `custom` step.
- `custom` is for special moves only. The AI writes a few key poses as angles, and the engine clamps them and fills in everything between.
- The plan is kept, so follow-ups edit the plan, not the pixels.

### 6.4 Moves library

Every move is a pure function: `(params, durationSec, startPose, ctx) → PoseKey[]` (key poses with timing, easing and contacts). The engine does the in-betweens. Body moves: `idle, walk, run, jump, wave, sit, squat, kick, punch, turn, fall, highFive`. Shared knobs are `speed` (slow/normal/fast or a number), `energy` (0–1: bigger swings, more squash), `direction`, `height` (jump/kick), `toX` (travel) and `side` (which arm/leg).

Animation principles built in: anticipation (dip before a jump, wind-up before a punch), follow-through/settle (land and recover), arcs (hands and head travel on curves), slow-in/slow-out (eased keys), and a contra-posed arm/leg swing for walk and run. Walk and run use a gait cycle with planted feet, so they look the same at any `toX`. Object moves (`slide` along a path, `bounce` with squash timing, `spin`, `scale`) change x, y, rotation and scale over time. No `fade` (D-0179).

**Styles** (`params.style`: `natural | robot | sneaky | tired | happy | angry | heavy`): a style is a small set of changes applied to a move's key poses and timing, never a separate move. For example: robot = linear segment timing with short holds at each key, stiff elbows/knees, no follow-through, squared arm swings; tired = slumped lean, smaller swings, slower; sneaky = crouched, high slow knees, long holds; happy = bouncy root, bigger arm swings; angry = forward lean, fast sharp keys; heavy = deeper knee bends, longer settles. The engine rules (bone lengths, limits, feet, ground) apply after every style.

**Lessons for the AI:** `moves/lessons.ts` turns each move into a lesson: its name and meaning, its knobs and styles, a compact sample of its key poses (angles + timing + contacts) for one or two settings, and the principle it shows (anticipation, follow-through, weight shift, arcs, slow-in/slow-out). Lessons are generated from the move code, so they never drift from it.

A move is plain data plus a function, so a motion-file clip (optional, Phase 5) can register under the same name and replace or sit beside the math version.

### 6.5 Engine pipeline

```
plan JSON → parse (schema) → check & repair (6.6) → per actor: expand steps to PoseKeys via moves library
→ blend between steps (0.15–0.25 s eased cross-fade in angle space, shortest-turn interpolation)
→ per frame: interpolate angles (eased) → apply joint limits → forward kinematics → points
→ contacts: planted foot locked to its world spot via two-bone IK (bend side from facing);
   root height adjusted so the lowest planted foot sits on groundY; nothing goes below ground
→ final per-frame checks (bone length, limits, travel per frame, ground) → frames
```

It is deterministic: the same plan always gives the same frames. It's pure TypeScript with no React or DOM, except the render step.

### 6.6 Check and repair (bad AI output never reaches the timeline)

1. **Schema:** strict JSON schema. If it fails, there is one retry with the error list sent back to the AI. If it fails again, the user sees a friendly message and nothing changes.
2. **Meaning:** unknown actor or move, `partner` not existing, or a missing Symbol name → treated as a retry reason. The engine never guesses silently.
3. **Repair (no retry needed):** out-of-range numbers are clamped (angles to joint limits, positions to the stage, durations to limits). Overlapping steps for the same actor are trimmed. Total length is capped. Each repair is written into a short report, shown on the test bench and kept in the job record.
4. **Final frame checks:** bone lengths within 0.5 px, every joint inside its limits, planted feet drift ≤1 px, no joint below ground, no joint jump bigger than a set per-frame limit (except at declared impacts). If a frame fails after repair, the scene is rejected. It is never partly applied.

### 6.7 Turning poses into frames (rendering)

- **Finding from the code:** a frame is a full-canvas `ImageData` bitmap (`WorkspaceTimelineFrame.bitmap` in `DrawingWorkspace.tsx`) plus text objects. Symbol placements are stored per cell, keyed `${layerId}:${stateId}`. There is no skeleton in the project file. Export only accepts "drawing-only" projects (`assertDrawingOnlyUnifiedProjectV2` rejects `stick-rig/v1` items). So **stick figures must be drawn as pixels into normal frame bitmaps.** That's exactly what we want: they are fully editable.
- The canvas bitmap is the "authoring world", about 4.6× the visible stage times the screen's pixel ratio. Map the 1920×1080 stage into bitmap pixels with `drawingCanvasRef.current.getPlaybackSurfaceLayout()` (`drawingCanvasWidth/Height`, `worldDisplayRect`, `stageDisplayRect`).
- Draw with Canvas 2D (`OffscreenCanvas` if available): round caps and joins, the style's color and thickness scaled to the bitmap, the head circle, and draw order (back-facing limbs first). Read back with `getImageData` to make an `ImageData` the same size as the canvas.
- **Hold cells:** if a frame is pixel-identical to the previous one (for example, standing still), use a `hold` cell instead of a new bitmap. This saves memory.
- **Insert:** add a new callback `applyAnimatorScene` in `DrawingWorkspace.tsx`, modeled on the existing `applyGeneratedFrameToWorkspace` (~line 8410). It creates **one new layer** named `AI: <title>` the same way `addLayer` does (~line 7515). It fills cells from the **start frame chosen by the placement rule (6.11)** — never from the playhead — with `createTimelineFrame(..., "keyframe", "keyframe", ...)`. It writes symbol tracks into `symbolInstancesByCellRef`, calls `recordUndoSnapshot()` once before and `commitCurrentHistoryState({ assumeChanged: true })` once after, then `renderWorkspaceCanvases`. Result: **one Undo removes the whole scene.** Saving is untouched: the existing `buildUnifiedProjectSnapshot` (~line 7149) crops and saves these frames like hand-drawn ones.
- Don't reuse the legacy callback as-is. It is capped at 20 frames (`MAX_FRAMES_PER_REQUEST` in `frameGenerationSafety.ts`), has a debounce, and may paint onto the *active* layer.

### 6.8 Objects (Symbols)

- Symbols are saved definitions (`catalogs.symbols`: PNG + size) placed per cell as `symbol-instance/v1` with `x, y, width, height, rotation, flipX, flipY`. Export already draws them (`exportRenderer.ts`).
- Object moves write one symbol instance per generated cell on the scene's layer. **The objects stay movable whole objects** after Apply.
- **Limit found:** symbol instances have **no opacity field**, so there is **no fade in V1** (Arthur's decision, D-0179). Objects always stay movable whole objects; the save format is not changed.
- Must verify in Phase 2: a cell that holds only symbol instances (no bitmap) saves, reopens and exports correctly. Fallback: draw the symbol into the frame bitmap.

### 6.9 AI director: providers, prompt and cost caps

- **Provider adapter** (`director/providers.ts`): `plan(request) → { planJson, provider, model, usage, estimatedCostUsd, latencyMs }`.
  - **Terra:** existing `getOpenAiClient()` (`src/lib/openai/client.ts`, env `OPENAI_API_KEY`). Uses the Responses API with a `json_schema` strict format, the same as `generateAiAnimatorReply.ts`. Model `gpt-5.6-terra`. The estimator prices it at $2 / $12 per million input/output tokens.
  - **Grok:** **no xAI code exists today.** Add a client: the `openai` package with `baseURL: "https://api.x.ai/v1"` and a new env var **`XAI_API_KEY`** (set by Arthur's dad in `.env.local`; Claude never reads it). Exact model name, structured-output support and prices get confirmed from xAI's docs at Phase 3 start and written into a pricing table with a version string.
- **Prompt:** short instructions, the **lessons** (6.4: every move's meaning, knobs, styles and sample key poses, plus the animation principles and joint limits), the schema, the stage size, the names of the project's Symbols, and the current plan (for follow-ups). The lessons come first and stay the same between requests, so they can use the provider's prompt caching to keep cost low. For a move that isn't in the library, the AI writes a `custom` step with its own key poses, following the lessons; the engine adds all in-betweens and body rules. No pixels or frames are sent.
- **Caps (server-side, per request):** max output tokens about 3,000. Input trimmed to about 6,000 tokens. Pre-send estimated cost ≤ $0.05, or the request is refused. One retry max. The existing 90 s deadline and the 2-active-jobs limit stay (`aiAnimatorJobService.ts`). The bench has a run budget (default $3, Phase 3 total hard cap $5) and stops when it is reached.
- **Usage:** record with the existing usage journal. The `operationKind: "animation_job"` already exists in `usageJournalContract.ts`, and `provider` is a free string. `usageJournalEvents.ts` currently hardcodes `provider: "openai"` and the Terra model in project events. The only change is passing the provider and model through.
- **Phase 3 bench** (dev only, signed-in, `NODE_ENV=development`): `app/dev/animator-bench/page.tsx` + `app/api/dev/animator-bench/route.ts`. It runs the 20 prompts in `director/benchPrompts.ts` one at a time against each provider, previews both results with the Phase 1 renderer, and collects ratings. Results go to ignored `output/spec-0017/`. The 20 prompts cover single moves, combos, 2–3 characters, objects, styles ("walk like a robot"), energy ("a powerful punch"), **5 never-taught moves** (the "3 + 3" test), timing words ("slowly", "suddenly") story-order requests ("after he punches, a ball bounces", "then", "at the same time", "at the end"), and 3 "tricky" prompts (impossible or vague) to test the fallback.

### 6.10 Editor flow, follow-ups and Undo (Phase 4)

- `DrawingAiPanel.tsx` today only chats. It receives `onApplyGeneratedFrame` but ignores it (`void _onApplyGeneratedFrame`). Phase 4 adds a new prop `onApplyAnimatorScene`, passed from `DrawingWorkspace` → `DrawingCanvas` → `DrawingRightPanel` → `DrawingAiPanel`.
- Server: when Terra's intent is `create-animation`/`edit-animation`, the job runs the director, checks the plan, and returns the plan in the finished job event. The browser runs the engine again (same pure code), shows a small preview card in the chat (a mini canvas looping the scene) with **Apply** and **Discard**, and Apply calls `onApplyAnimatorScene`.
- Contract change: `aiAnimatorContract.ts` locks the model to the literal `gpt-5.6-terra` (`AI_ANIMATOR_MODEL`, also checked in `normalizeAiAnimatorJobSnapshot`). Widen it to the chosen director provider/model and add an optional `scenePlan` field on the done event.
- **Plan kept:** in the finished job record in the existing per-project AI Animator ledger (`aiAnimatorStorage.ts`), linked to the scene's layer by name and ID. The project file format doesn't change.
- **Follow-up ("jump higher"):** the AI edits the kept plan, and the engine remakes the frames. If the scene's layer is **unchanged since Apply**, its frames are replaced as one undoable step. If the user has drawn on it, a **new** layer `AI: <title> (2)` is made and the chat says so. User drawing is never silently overwritten.
- The chat box stays the shared `ChatComposerParts`. The preview card uses `--da-*` tokens.

### 6.11 Where a new scene goes (placement — Arthur's rule)

Arthur's rule (D-0179): **users never place things by hand and never use frame numbers.** They talk in story order — "after the stick figure punches, a ball bounces". The AI works out the start frame. The playhead is **ignored**.

- **Timeline summary sent to the AI:** with each request the server sends a short list of what is already in the project: total length in frames/seconds, and for every AI scene (from the kept plans) its layer, start/end time and each step (`scene-1: Red punches 1.2–1.8 s; ball bounces 2.0–3.0 s`). No pixels.
- **The plan's `place` field** (one of):
  - `start` — begin at frame 1 (plays with the whole movie)
  - `end` — begin right after the project's last frame
  - `after` + `ref` — begin right after a named step/scene ends (`scene-1:a:punch`)
  - `with` + `ref` — begin at the same time as a named step/scene
  - optional `gapSec` (0–3) for "a moment later"
- **Default when the user gives no clue:** a follow-up to the last AI scene goes right **after** it; anything else starts at **frame 1** (`start`).
- **Validation:** an unknown `ref` is a retry reason (never a silent guess). The timeline grows if needed (`ensureTimelineLength`). The start frame is computed in code from the kept plans, not by the AI doing frame math.
- **Honest limit:** the AI knows what's in **AI-made scenes** (it kept their plans). It cannot *see* hand-drawn frames (no vision in V1), so for hand drawings it only knows their length and layer names. "After my drawn dog jumps" won't work in V1; "at the end" or "after the punch" will.

### 6.12 Motion-file import (optional, Phase 5)

- **What to ask the Blender person for** (only if a move needs motion files): one action per file; 24 or 30 fps; side view with the character facing +X; in place or with root motion clearly noted; standard bone names (Rigify, Mixamo or similar). Delivered as **`.blend` + BVH export** (BVH is a standard per-frame rotation format). If possible, also run our small script `scripts/blender/export_stick_motion.py`, which writes per-frame world positions of the needed bones as JSON.
- **Converter** (`blender/importClip.ts`): map bones → our 11 joints (hips→hip, spine top/neck→neck, head→head, upper_arm/forearm/hand→elbow/hand, thigh/shin/foot→knee/foot). Project to 2D (x→x, z→−y). Convert to **our angles** (our bone lengths are kept, so proportions stay ours). Resample to the project FPS. Detect foot contacts from low foot speed near the lowest height. Register as a `ClipMove` under the same move name.
- Clips still pass through the same limits, contacts and checks. They improve the look; they don't bypass the rules.

## 7. Where it plugs in

**Existing files touched (small, additive):**

| File | Change | Phase |
| --- | --- | --- |
| `src/components/workspace/DrawingWorkspace.tsx` | new `applyAnimatorScene` callback next to `applyGeneratedFrameToWorkspace`; pass it down | 1 |
| `src/components/workspace/DrawingCanvas.tsx` | pass the new prop through to the right panel (no drawing-engine change) | 1 |
| `src/components/workspace/DrawingRightPanel.tsx` | pass the new prop to `DrawingAiPanel` | 1 |
| `src/components/workspace/ai/DrawingAiPanel.tsx` | temporary "Engine test" list (review flag only; Phases 1–2); preview card + Apply (Phase 4) | 1, 2, 4 |
| `src/lib/ai/aiAnimatorContract.ts` | allow director provider/model; optional `scenePlan` | 4 |
| `src/lib/ai/aiAnimatorJobService.ts` | run the director for create/edit intents; caps | 4 |
| `src/lib/openai/client.ts` (or new `director/providers.ts`) | xAI client from `XAI_API_KEY` | 3 |
| `src/lib/usage-journal/usageJournalEvents.ts` | pass provider/model through (no math change) | 3 |
| `package.json` | add `"test:animator": "node --test src/lib/animator"` | 1 |

**New files (proposed), all under `src/lib/animator/` unless noted:**

- `rig.ts`: joints, bones, proportions, style options
- `pose.ts`: `PoseAngles`, forward kinematics (angles → points)
- `limits.ts`: joint limits per facing, and clamping
- `easing.ts`: ease curves, shortest-turn angle interpolation
- `ik.ts`: two-bone IK with bend side from facing (for foot lock)
- `scene.ts`: scene/plan types (characters, objects, steps)
- `planSchema.ts`: the JSON schema given to the AI, and the parser
- `validatePlan.ts`: check & repair, with a repair report
- `engine.ts`: plan → per-frame poses (blend, contacts, ground, final checks)
- `moves/index.ts`: move registry (math moves and, later, Blender clips)
- `moves/body/*.ts`: idle, walk, run, jump, wave, sit, squat, kick, punch, turn, fall, highFive
- `moves/objects.ts`: slide, bounce, spin, scale
- `moves/styles.ts`: style changes (robot, tired, sneaky, happy, angry, heavy)
- `moves/lessons.ts`: turns each move into a lesson for the AI
- `render.ts`: draws one frame (characters + optional baked symbols) into `ImageData` using stage→bitmap mapping
- `toFrames.ts`: scene → frames + symbol tracks + hold detection
- `testScenes.ts`: the Phase 1 hand-written scenes (removed or hidden in Phase 5 cleanup)
- `director/prompt.ts`: AI instructions + move catalog text
- `director/providers.ts`: Terra and Grok adapters, pricing table, caps
- `director/benchPrompts.ts`: the 20 fixed test prompts
- `blender/importClip.ts`: BVH/JSON → `ClipMove` (Phase 5)
- `*.test.ts` beside each logic file
- `app/dev/animator-bench/page.tsx`, `app/api/dev/animator-bench/route.ts`: Phase 3 bench (dev only)
- `scripts/blender/export_stick_motion.py`: optional helper for the Blender person (Phase 5)

**Old code: honest status**

- *Reuse by calling, not changing:* `createTimelineFrame`, `replaceLayerFrames`, `ensureTimelineLength`, `normalizeLayerOrder`, `recordUndoSnapshot`, `commitCurrentHistoryState` and `renderWorkspaceCanvases` (all in `DrawingWorkspace.tsx`); `getPlaybackSurfaceLayout()` (DrawingCanvas handle); the job service and `/api/ai-animator`; the usage journal; `getOpenAiClient`.
- *Ideas only (don't import):* `src/lib/ai/stickFigureMotionEngine.ts` (smoothstep, shortest signed turn, rebuild from lengths) and `src/lib/ai/stickFigureBodySafety.ts` (useful numbers: elbow 8–150°, knee 6–125°, torso lean ≤30°, relaxed limbs stay near rest, and the lesson to pick the bend side by facing). Both are tied to the old stick project format.
- *Leave alone (legacy, not mounted):* `src/components/workspace/stickfigure/*`, `src/lib/stickfigure/*`, `src/lib/ai/stickFigure*.ts`, `drawingFrameExecutor.ts`, `generateFramesRuntime.ts`, `DrawingWorkspaceTask_*.ts`, `app/api/ai/route.ts`, `app/engine/stickRig.ts` (still imported by the legacy executor). Deleting these is the separate cleanup task.

## 8. Automated checks

There is no test runner today. Node 24 can run TypeScript tests directly with `node --test`, so **no new packages are needed**. Engine files are pure functions, so they're easy to test.

- **Bones:** every bone length stays constant (±0.5 px) on every frame of every move and test scene.
- **Joints:** elbows and knees stay in their limits and bend the right way for the facing, on every frame.
- **Feet:** a planted foot drifts ≤1 px while planted. No joint goes below ground.
- **Smoothness:** easing starts at 0, ends at 1 and never goes backwards. Per-frame joint travel stays under the limit. No pop at step boundaries.
- **Plans:** 20+ bad plan fixtures are either clamped (with a report entry) or rejected. Unknown moves, actors or Symbols are rejected. Overlong scenes are capped.
- **Repeatable:** the same plan gives the same poses.
- **Frames:** frame count = duration × FPS. Output size = requested canvas size. Identical frames become holds.
- **Motion files (only if used, Phase 5):** a small sample clip converts with our bone lengths and detected contacts.
- Also run each phase: `npx tsc --noEmit`, and `npx eslint` on changed files.
- **In the real app** (each phase, review copy): insert → play → draw/erase → undo/redo → save → reopen → export. Assistant chat still works, and AI Dashboard numbers still add up.

## 9. Risks and Arthur's decisions

**Risks**
1. **Natural look:** the biggest risk. Arthur judges Phases 1–2 before any AI spend. Bad moves get fixed one by one; motion files (only for a move that math can't fix) are the backup.
6. **AI-invented (never-taught) moves** may look less natural than library moves. Mitigation: the lessons, the engine's body and timing rules, and the 5 never-taught bench prompts that Arthur judges in Phase 3.
7. **Prompt size:** lessons for every move make the prompt longer. Mitigation: compact lessons and the provider's prompt caching; the per-request cost cap still applies.
2. **Memory:** frames are full-canvas bitmaps (about 4.6× the stage times the screen's pixel ratio). Dozens of new frames could use a lot of browser memory. Phase 1 measures a 48-frame, 2-character scene. Fixes, in order: hold cells → render on twos (every other frame held) → lower the scene length cap. Changing how the editor stores frames would touch the drawing engine, which needs Arthur's OK.
3. **AI plan quality:** the AI may pick odd moves or timing. Strict schema, repair, one retry and the 20-prompt bench measure and limit this.
4. **Inserting a layer shifts saved layer IDs.** The save step matches layers by position (`buildUnifiedProjectSnapshot`). The new layer is inserted the same way the existing "+ Layer" button does it, so this adds no new risk. Phase 1 still checks save → reopen with layers above and below.
5. **xAI details** (model name, structured output, price) aren't in the code yet and are confirmed at Phase 3 start.

**Arthur's decisions (2026-10-04, recorded as D-0179)**
1. Replace SPEC-0008's paused video plan with this one: **Yes.**
2. Layers: **one new layer per scene** for V1; revisit if editing feels hard.
3. Fade: **no fade.** It doesn't fit the app.
4. Where a scene goes: **the AI decides from story words** ("after the punch", "then", "at the same time", "at the end"); never the playhead, never frame numbers. Default: frame 1, or right after the last AI scene for follow-ups (6.11).
5. If both Grok and Terra pass: **decide after seeing the Phase 3 results.**

**Arthur's later decisions (2026-10-04)**
6. **Blender files are optional** (his dad: they're expensive). Walk and run are built first in Phase 2; motion files are used only for a move math can't make natural. Phase 5 becomes "library check + cleanup".
7. **Chat only:** no move-picker buttons in the finished AI Animator; create and edit everything by chatting ("more powerful punch", "walk like a robot").
8. **Styles:** every move has a style knob (natural, robot, sneaky, tired, happy, angry, heavy).
9. **Teach-by-example:** the AI is taught with lessons from the moves library every time it connects, so it can invent original moves that are still natural; tested with never-taught prompts in Phase 3.
10. **V1 = animation only:** no sound effects or voices until Version 2+.
