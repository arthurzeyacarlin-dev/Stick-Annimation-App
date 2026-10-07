# SPEC-0017 — AI Animator Engine and Director

Status: **Approved 2026-10-04. Phase 1 published (b7a0800c61973d7729e1d9cf2f7a0bea90f537b2). Phase 2 Round A (walk + run) published (3e40515c99b04c370b07b9aeb93fcf5fe4e3b2cf). Phase 2 Part B (all other moves, moods, fights, objects) built in a review copy through round 8 (2026-10-05), not published yet. Phases changed 2026-10-05 (Arthur): new Phase 2C "Beyond stick figures" and a 5-day deadline (section 3).**
Owner: Arthur
Builder: Claude
Created: 2026-10-03
Decision links: D-0179, D-0180
TODO IDs: AIANIM-ENGINE, AIANIM-TESTS
Starting point: `main` at `19ba17c`
Time box: **5 days, Monday 2026-10-05 to Friday 2026-10-09** (Arthur, 2026-10-05). Monday and Tuesday are school-free, so the hardest, longest work goes there (about 8 hours Monday, 12–14 hours Tuesday). Wednesday to Friday are school days, so they hold the lighter work, and Arthur's part on them is short reviews. Live plan: the AI Animator Roadmap page (claude.ai artifact 3hnFrm1L79HU6wmJT9RPfP), which always matches this section and section 3.

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

**Why it works without Blender:** the AI picks moves, styles and knobs, and the math library and engine rules make every pose. So a confused AI can't produce a broken body. The worst case is a plain or wrong move, never a twisted one.

**V1 rule: no Blender files and no motion files of any kind** (Arthur and his dad, 2026-10-04: they're expensive, slow to make, and V1 is due in a month). This is a fact, not a test: there is no "math vs Blender" comparison. Every V1 move is made by the engine's math. Motion files may be considered for Version 2 or 3 when there is money (see section 10).

**Permanent rule: every animation must always look natural**, made by the engine, whether it's a library move or one the AI invents. If a move doesn't look natural, the only fix is better math (more key poses, better timing, a better style). If one move still isn't good enough by the deadline, it is left out of V1 rather than shipped unnatural.

**How the AI learns (Arthur's idea: teach it the basics, then let it solve new problems).** Like teaching a kid 5 + 5 = 10 and 10 − 2 = 8, then asking 3 + 3: every time the AI connects, it is first given **lessons** made from the moves library. Each lesson shows a move's key poses and timing, and *why* they look natural (wind-up before a punch, bending to land, speeding up and slowing down). Then, when you ask for something the library doesn't have ("do a cartwheel", "robot dance"), the AI writes **its own original key poses** using what the lessons taught. The engine still does all the in-between math, timing and body rules, so **every animation, library or original, stays natural. That is permanent in Diamond Animator.**

**You only talk to the AI.** The finished AI Animator has **no move-picker buttons**. You chat: "a stick figure walks in and punches a bag." It plans the animation and shows it. Then you edit by chatting: "make the punch more powerful", "make him walk like a robot". The AI changes only what you asked for.

**You judge the look before any money is spent.** Phases 1 and 2 use no AI at all. You see the engine and the moves and say if they look good. Only then do we pay for small AI tests.

**More than stick figures (Arthur, 2026-10-05).** The engine is taught the fundamentals of animation for things that are *not* stick figures too, the same way it was taught walking and punching: rules, never hard-coded frames. In V1 these are simple cartoon versions:
- **Effects:** fire, lightning, water, smoke that breaks apart and drifts away, a light bulb flickering. Each has its own timing, anticipation and follow-through (a fire blast builds up before it shoots; smoke thins out as it rises).
- **Powers ("elementalists"):** a stick figure blasts fire from its hands, another blocks with a water shield, someone teleports. The body move and the effect are timed together (pose → build-up → blast → recoil). Arthur's sister's example: a fire stick figure against a water stick figure.
- **Backgrounds:** the engine draws simple backgrounds (sky, ground, hills, trees, buildings) on their own layer and can move parts of them (clouds drifting, water flowing, a light flickering).
- **Original things:** the engine makes **original symbols** (new props built from simple shapes, given a name), **original key poses** (a different way to sit, a new fighting style) and original animations. It **learns from the user**: a pose, style or character the user names ("remember this as my fighting style") is kept and used again.
- **Editing:** the engine can change an animation it already made (a stronger punch, slower, another color) by remaking only what was asked.

**50-50: AI and your own drawing work together (Arthur, 2026-10-05).** Nobody should have to pick "all by hand" or "all AI". Both directions work in V1:
- **AI frames are yours to edit:** everything the AI makes is normal frames on a new layer, so every manual tool works on it (this was already the rule).
- **The AI adds to your own animation:** you animated a fight by hand, but the fire and water aren't there ("they're fighting with air"). You say "red is a fire fighter, blue is a water fighter". The AI looks at small pictures of your frames to find where the figures and hands are. The engine then draws the fire and water on a **new layer**, timed to your frames. Your drawings are never changed. If the AI isn't sure where something goes, it asks. You can move or fix the new layer with the normal tools.
- **Your drawing comes true (Arthur, 2026-10-06):** you draw **one picture** (a stick figure in a pose, maybe with an effect — e.g. a hand lifted and an ice mountain) and say "animate him starting from standing, lifting his hand; the ice grows from small to big". The engine reads the pose and the look of your stick figure (color, thickness, head filled or hollow, size, where it stands) and **makes it come true**: an engine stick figure that looks like yours moves from standing into your pose with the passed fundamentals (anticipation, acceleration and deceleration, weight), plus the effect you drew. Your drawn frame is then **replaced** by the animation — hidden, not deleted, so one Undo brings it back.
- **Finish my animation:** "I'm halfway done, I got tired — animate the rest." The engine reads the pose and look of your last drawn frame and continues from it with engine stick figures that look like yours, doing what you say, on a new layer after your frames. Your frames stay as they are.
- **Clean up my animation (Arthur, 2026-10-07):** "I animated a run but it was too hard — the arms, legs and head are scribbly. Draw my stick figure way better, with the same animation." The engine reads the pose in each of your drawn frames (the same timing, the same moves you meant) and redraws it as a clean engine stick figure — straight even lines, a round head, steady proportions and size from frame to frame, joints that never jump — and smooths only what was clearly unintended (a wobbling leg length, a shaking head). It replaces your scribbly figure; one Undo brings your drawing back. It never changes what you were animating. This also covers a **mixed** animation: the AI Animator made most of it, but it struggled with one part, so you animated that part yourself (scribbly) — the engine cleans your part up to match the rest.
- **Make my animation better (Arthur, 2026-10-07, item 5 — he asked for it himself):** "I animated something, I want the animation to be better, and I want the drawing to be better. Keeping the same stick figure, whether it's a hollow head or not." Everything the clean-up does (neat lines, one steady size, the user's own look: color, line thickness, solid or hollow head) **and the motion gets better**: key poses (turn-arounds, start/end of a hold, a foot landing or lifting, any bend in the path) stay on their frames; a drawing a few degrees off the smooth line through its neighbours is pencil shake and is smoothed; the spacing in between is the engine's (even, easing into and out of stops); planted feet stay put; same frame count. Clean up (item 4) keeps the user's exact motion; this one improves it. Replaces the frames; one Undo brings them back.
- **Round 1 review → round 2 (Arthur, 2026-10-07 morning):** "No more asking questions" — the 11 joint clicks are a fail; **the engine finds the stick figure itself** ("the biggest body part is the head, a circle; the arms come out under the head; the spine goes down the middle, then splits into two for the legs"), even in scribbly drawings, with no neck unless one is drawn. **"Add an effect to my drawing" is removed** (a drawing with effect lines is a job for "make my drawing come true"). **Make my drawing come true works for ANY drawing** ("not make my STICK FIGURE come true"): a drawn explosion becomes the engine's explosion where and as big as it was drawn; a stick figure comes true **without sliding feet**. **Clean up** only fixes the drawings — same frames, holds stay holds, nothing added. **Make my animation better** improves the ANIMATION from the user's key poses (in-betweens, timing, anticipation, settle, weight, no foot sliding) as well as the drawing, for all frames at once. **Finish** reads where the animation is and keeps going by default. Every tool is one press on the current layer.
- **Round 2 review (Arthur, 2026-10-07 09:23):** **Make my drawing come true — PASS** (stick figures, lightning, explosion: "pretty good without the AI"). **Clean up my animation — PASS.** Finish — fail: it always ran; a half-drawn HOP must finish as a hop (fall and land) — "90% of animations start on the ground", the floor is where the figure stood, never levitating. Make my animation better — must be clean-up FIRST, then check the animation like an animator (not smooth? floating? sliding?) and fix it, visibly. **Size is kept**: a big drawn figure stays big, a tiny one stays tiny, in every tool.
- **Round 3 review (Arthur, 2026-10-07 10:00):** size kept — GOOD. The eyes missed an obvious figure (square head, arms up through the head): "draw the worst way possible to the engine, and it can still handle it — the engine has to be a machine." Finish and Make better must work for things other than stick figures (lightning, explosions), read where the animation is going (stand → crouch → legs extended = a hop: up, then down onto the floor), know the floor and size, never levitate or slide, never swap/cross arms, and **never make the user's animation worse**. Round 4: horrible-drawing tests, reading a whole animation (floor, size, matched limbs, phases), finish where it's going, make better never worse.
- **Round 4 review (Arthur, 2026-10-07 ~10:40):** **Finish my animation — PASS. Clean up — PASS. Make my drawing come true — PASS.** Make my animation better currently looks the same as Clean up (good as a first step); still wanted: add frames where the motion is too fast ("hypersonic") and fix motion that is too slow — unless it is clearly on purpose. Round 5 (the last): Make better also fixes the PACE — too fast → frames added, too slow → frames taken out, normal pace for the kind of move by default (a run stays fast); kept only when the user says it's intentional (later, through the AI).
- **Round 5 review (Arthur, 2026-10-07 11:30):** the pace rule made his jump WORSE — **undone** (Make better back to round 4). Round 6: Clean up (and so Make better) asks **"what pose is this?"** after neatening — a leaning/limping stand that isn't hurt becomes a proper standing pose, a sloppy crouch a proper anticipation crouch; Make better adds only TIMING: a hop drawn at lightning speed gets the fundamentals (anticipation, launch, slow-down at the top, speed-up falling, landing) with added frames; a run stays fast; slow parts are left for the AI. Both work for effect drawings too (explosions, lightning, teleportation), not only stick figures.
- **Round 6 review (Arthur, 2026-10-07 12:25):** liked — the default pace and the good key poses (pose fix). Not liked — Make better only in-betweens the drawn key poses, so a hop looks broken: "it should not be any different from all the other animations the engine creates… all the other animations are a pass, 10/10 — the engine is supposed to use those animations for guidance." Round 7: Make better RECOGNIZES the move (hop, walk, run, punch…) and animates it with the engine's PASSED move, fitted to the drawing (size, place, floor, facing, look, jump height/distance); unrecognized drawings keep the round-6 behaviour.
- **Rounds 7–8 and the ROUTE CHANGE (Arthur, 2026-10-07 ~13:50):** the engine named moves from drawings (hop, walk, run, punch, kick, stomp, wave, squat, sit, fall) and redid them with its passed moves — but on Arthur's growing explosion (a tiny dot that expands, then breaks up) Make better saw LIGHTNING: "a real fail… the engine has to understand what this animation is." Agreed route change: **understanding what an animation IS and what the user wants from "make it better" moves to Phase 3** — the user tells Terra ("make it better, an explosion with color, smoother, with acceleration and deceleration"), Grok tells the engine what it is and what to do, and the engine does it with its passed moves and effects. The engine-only 50-50 ends with **Come true, Clean up (with "what pose is this?") and Finish — all PASSED**. In the app copy, Make better is back to the round-4 version (the same as Clean up, which Arthur called good), and drawings of effects across several frames are left as drawn by Clean up and Make better. The move-naming code (rounds 7–8) is kept outside the app for Phase 3 to reuse as hints for Grok. Known issue: Finish once made a hop far too high ("turned into a rocket") — TODO FINISH-HOP-HEIGHT.
- **Helping is a skill the engine learns, not four buttons (Arthur, 2026-10-07):** these five items are *examples* (item 5, "make my animation better", was added by Arthur himself on 2026-10-07), like the fundamentals were — **no more items get added**; from these the engine learns to help in ways nobody listed. Example of the same skill: the engine made an ice mountain, and on a frame you draw how you want it to look ("like this, not that — and at the start it grows like this"); the engine reads your drawing and **edits its own animation to match** (item 2 applied to an animation it already made). The engine is taught the general way to help with someone's own animation, so it can solve beta users' other problems too: read what you drew (the poses, the look, the timing, the story), **keep what you meant**, fix or finish only what you asked for (or what you clearly couldn't do), match your figure's look unless you ask for a cleaner one, and always be undoable — your drawings are replaced or added to, never silently changed. When it isn't sure what you meant, it asks.
- **Or the whole thing with no drawing at all** (the AI director, Phase 3).
- **How these are built:** the **engine half first** — you point things out yourself (click the joints of your drawn figure — for "clean up", on each drawn frame, or only on your key frames and the engine keeps your timing in between — click the spot and pick the frame for an effect) and the engine does the rest; the **AI half tomorrow** (Phase 3) — the AI looks at small pictures of your frames and finds the pose, the hands and the spots by itself, and asks if it isn't sure.
- **Not in V1:** redrawing or "improving" your hand drawings in place (e.g. "my drawing looks stiff, add acceleration"), or adding in-betweens between your drawn frames. A drawing is only pixels with no bones, so this needs much more than V1 has (Version 2+). V1 *replaces* a drawn figure with an engine figure that looks like it; it never edits your drawing.

**Internet search is the AI's job, not the engine's.** When a request needs outside knowledge ("make the Dark Lord from my sister's favorite YouTube channel"), Terra or Grok may search the internet, **and the chat shows what it is searching** ("Searching YouTube for …"). The AI then turns what it learned into engine words, for example "Dark Lord = a red stick figure with a hollow head". That character is remembered, so the next "Dark Lord" looks the same. The engine itself never searches. It only gets plans, like today.

## 2. What it will NOT do in V1

- It will **not animate your hand-drawn pictures limb by limb**, redraw them, or add in-betweens between your drawn frames. A drawing is just colored dots (pixels) with no bones inside. The AI *can* move a drawing you named as a Symbol as one whole piece (slide, bounce, spin, grow or shrink), and it *can* add effects, powers and backgrounds on a new layer over your own animation (section 1, "50-50").
- Characters are **stick figures only.** By default the classic stick figure: a solid head sitting right on the body, no neck (Arthur, D-0180). You can choose color, line thickness, head size, hollow or solid head, and neck or no neck. No faces or custom bodies (four arms, animals) in V1; simple outfits are only colored body lines. (Effects, powers, simple backgrounds and engine-made symbols *are* in V1: see section 1, "More than stick figures". Detailed drawn backgrounds, drawn clothes and other bodies are Version 2+.)
- **No drag-the-joints posing tool** for now. You chose to leave it out. It could be added later in about 1 day.
- No talking or lip-sync, no crowds (V1 limit: up to 4 characters and 4 objects in a scene), no 3D camera moves.
- Scenes: up to about 40 seconds. A 30-second fight saves, using the compressed save Arthur approved (2026-10-05).
- **No fade** (objects slowly appearing/disappearing). Arthur's decision: it doesn't fit the app. Effects like smoke don't fade either: they break into smaller pieces that drift and shrink away.
- **V1 = animation only.** No sound effects and no character voices; those are Version 2 or later.
- **No Blender or motion files.** Every move is made by the engine's math (Version 2 or 3 may revisit this).
- **No move-picker buttons** in the finished app. Everything is made and edited through chat. (The test buttons in Phases 1–4 are temporary and only in review copies.)
- It never changes your existing frames or layers. Every new scene goes on a **new layer**.
- **You never have to place anything.** You don't move the playhead or type frame numbers. You say it in story words ("after the stick figure punches, a ball bounces") and the AI works out where it goes.

## 3. The phases (5-day plan, Arthur 2026-10-05)

Each phase is built in a separate review copy of the app (same as SPEC-0016). You test it there. Nothing reaches the real app until you say PASS and then "publish".

| Day | Arthur's day | Phase | What gets done |
| --- | --- | --- | --- |
| **Mon Oct 5** | No school, **big day** (about 8 h) | 2, Part B | Stick-figure fundamentals finished: round 8 review, then fix the last notes (cartoon fight with no pattern, arms never swing round the head, a runner stops before the friend he runs to, "Saved" stays Saved when you press Play). PASS → publish Part B. |
| **Tue Oct 6** | No school, **biggest day** (12–14 h) | 2C (new) | Beyond stick figures: effects (fire, lightning, water, smoke, flickering light), powers (fire blast, water shield, teleport), simple backgrounds that move, original symbols and key poses, editing a made animation, effects aimed at any spot and timed to frames you drew. Several review rounds. |
| **Wed Oct 7** | School, light | 3 | AI connected: Terra and Grok get the lessons first, internet search with a visible "Searching …" line, names become remembered characters, adding effects to your own hand-drawn animation ("50-50"), plan checker, test bench. Needs Dad's xAI key and Arthur's OK for paid tests. |
| **Thu Oct 8** | School, light | 3 test + 4 | Test day (Arthur rates results, 15–30 min) and the AI Animator in the editor: chat → preview → Apply, follow-up edits, colors and frames per second by chat, simple outfits. |
| **Fri Oct 9** | School, light | 5 | Cleanup: test buttons removed, final check by chatting, final PASS, publish. Dad's side test: Blender files (outside the app). |

**Honest risk:** this is a lot for 5 days. Every new thing is built as a simple V1 version first. The permanent rule still wins: anything that doesn't look natural or good by Friday is left out of V1, not shipped broken.

### Phase 2 Part B progress (review copy, rounds 1–8, not published)

- **Built:** every basic move (stand/breathe, jump and running jump, wave, sit, squat, kick, punch with jab/straight/power/uppercut/overhand, block, get hit, almost fall and catch yourself, get knocked down, get up, turn, look back, fall/trip, high-five, throw/catch/hand-off/bounce pass, pick up), moods (natural, robot, sneaky, tired, happy, angry, irritated, sad, hurt, heavy), scene planner (moves flow into each other, partners timed to each other, held objects stay in the hands, eyes look where it matters), the energetic fight director, and the review-only "Random combo" exam (a new never-seen combo every press).
- **Rules the engine learned** (each one is code plus a line in `moves/lessons.ts`): anticipation always opposite the action ("input behind, output in front"), arms swing round the body and never windmill or go round the head, balance (the weight stays over the feet), personal space in fights, no unnecessary key poses, accidents have a cause, arrive into a move, go from where you are, hands busy, one way round.
- **Round 8 (2026-10-05):** 280 automated tests pass; 400 never-seen random plans and 1,800 move pairs have 0 problems; a 30-second fight saves, reopens and plays in the app.
- **Arthur's decision (2026-10-05):** the robot's high-five arm stays **bent** on the way up behind the head, and straightens only at the slap.
- **Round 8 review (2026-10-05):** walk-turn-walk 9–10, walk up and high-five 10, passes and long pass 10, run-trip-get-up 9–10, squat-jump-sit 9–10, run-grab-throw 9, jab-punch-kick 8–9, sneak 8–9, long fight 8, block-block-hit 7–8, run 7, energetic fight 5–6, one random combo 3 (others 7–9). **Parkour: "a master animation"**. It is the reference for a good run, weight, anticipation, speeding up and slowing down, with run-grab-throw, the passes and run-trip-get-up.
- **Round 10 (Arthur's final stick-figure round, 2026-10-05):** walk 10, run 10, parkour 10, passes and high-five 9–10, trip-get-up 9–10, random combo 7 (first time). Fixes: jog with a small hop, lower resting arms, no guard stance by default, straight arm paths (never round the head), ground fight without floating or wiggling, both-hand punches, dash punch, catch the punch, lift-and-slam, squash and stretch at high fps, 3 new story buttons.
- **Round 10 review and Round 11 = THE LAST ROUND (Arthur, 2026-10-05, ~7 PM):** walk, run and jog 10; jab-punch-kick and long fight 8–10; walk up and high-five 9–10; passes 9–10; story 1 9–10; story 2 10 except the carried ball held straight out (4); story 3 10 except the sad walk at the start (0–1); parkour 10; run-grab-throw, trip-get-up and squat-jump-sit 9; sneak 8; ground fight 8; overhand-from-range 7–8; ground counter 6–7; energetic fight 5; dash punch "better than I expected". Arthur: **no more rounds after round 11, no new buttons** (only the random combo changes). Round 11 fixes, built at the same time by 10 helpers: almost-fall = short teeter then a catching step back; dash anticipation (punching fist cocked by the head in the air, shoulders twist on landing, slight arc, then a step forward); fast get-up in a fight (legs push away, a hard visible arm push, legs extend, face the other); no fighting-stance feet by default (natural stand, walk over with hands up a little, no boxer shuffle); press the advantage when the other is down or off balance (unless the request says otherwise); a vague fight is filled in (random combo); carry by weight (a ball in one hand at the side); every walk lifts its feet; strikes straight out of a jog.
- **Round 11 result (2026-10-05, built and checked, waiting for Arthur):** 315 of 316 automated tests pass; 400 never-seen plans, 1,800 move pairs, all exams and arm paths have 0 problems; all 8 energetic fights pass at 24 and 12 fps; 2 of 200 random combos have a problem. Not done: the gait does not yet flow straight into a strike (it jogs over, then a short stop); grab the punch, lift-and-slam, roll away; an angry dash on a very wide page has one 250 px joint jump at 12 fps (limit 240); some energetic fights take 10–35 s to build.
- **Round 11 review and Round 12 (Arthur, 2026-10-05 night):** almost everything 10/10. A small final fix: the dash punch must SHOW the loaded punch (fist cocked behind, other arm out in front, leaning back) for the whole airborne part, then the arms switch on landing, one step; get-ups 2–3× slower (too fast is unnatural); the energetic fight needs breaks of 3–4 s at most, more punching, varied follow-ups (not always a stomp: a hop-and-punch down, a lift-and-slam, a parry and fast counter) and never a pattern.
- **Round 12 review and Round 13 (Arthur, 2026-10-05, ~9 PM; Phase 2B must finish tonight):** dash: the anticipation speeds up through the air, then an overhand that goes straight into the face (never downward), a visible impact, and he ends STANDING (no lunge or half-fall). Get-ups: no sliding on the floor (friction), same overall speed, the rise from the crouch a bit slower and ending in a small hop backwards (spine leaning back) for space. Energetic fight: action about every second, mixed hands (not left-left-left then a right), smarter fighters (dodge a stomp and counter, fight harder when hurt), never a pattern. New rule: a figure standing still always stands upright unless asked otherwise.
- **Round 13 review (Arthur, 2026-10-05, ~10:15 PM):** dash punch PASS (8/10); ground fight 7–8/10 (rise slower, no pause before a farther back hop, legs straighten in the air and bend a little on landing — done that night). Energetic fight: no slow, off-timing dash at the start (a dash only with room for a full-speed run-up — done), no fast walking ("walking fast looks weird": jog, run or dash instead), run over to someone on the floor, more special attacks (grab, spin, throw), a hit about every second, break any pattern the moment it shows. Worked on overnight; Arthur reviews on Tue Oct 6.
- **2026-10-06 — Phase 2 PASS (D-0181):** barrage, lift-and-slam and energetic fights passed after the Oct 6 rounds; everything in the review copy published in `6430fcf85936dceffdbd5b3276ed7231775264c4`. Open engine checks listed in TODO (ANIM-KNOWN-3).
- **Oct 6 review steers (Arthur):** back hop = a real jump (load, legs extend, feet close together in the air, land, squash) on Earth gravity (air time from the hop height, never from mood); lift-and-slam = grab the FOOT, haul (a strain, jogging pace), swing overhead like a bat, turn, gravity slams him fast, the body bounces up on impact, air resistance (limbs trail, the body bows, never stiff); a fighter turns to face the opponent before taking a hit, and a hit pushes the body away from where it came from; a BARRAGE = a punch about every 0.3 s, leaning back for power; no walking or jogging in a fight. Grab-spin-throw: built but paused in fights. Arthur's tip: in 2D the thrown one must be drawn BEHIND the thrower as he swings round, then in front again (this needs a per-picture drawing order, which is a drawing change waiting for Arthur's OK).
- **Round 9 (2026-10-05):**
  - **A real run plus a new jog.** Walk, jog and run are three speeds. Jog is nearly twice walking speed and never airborne. Run is airborne at full speed: both feet leave the ground every step (Arthur's drawing: back foot just left its spot, front foot not landed yet), like parkour's run. The legs and arms pass each other only while a foot is on the ground, never in the air.
  - **Frames per second:** every move is checked at 8, 10, 13, 15 and 24 FPS.
  - **Faster kick.**
  - **Tired:** smaller breathing, and the arms sink a little. Very tired means bent over, arms straight down onto the knees.
  - **"Almost knocked over" pose** from Arthur's drawing (head and chest thrown back, an arm flung up by the head), with a smooth way into it, facing either way.
  - **A mad stomp** that doesn't look like limping or skipping.
  - **Energetic fight:**
    - no random "step back, hands down, hands up"
    - no repeating pattern
    - **ground fighting**, used only when the request (or the energetic fight) calls for it: stomp on someone down, mount and punch, grab the feet and throw, and a quick get-up counter (grab the arm, spin, throw).

### Phase 2C — Beyond stick figures (new, 2026-10-05) · Tuesday Oct 6

**V1 size (Arthur, 2026-10-05): "version one, not version 10."** A beta user needs the basics working well, not everything. So Phase 2C is a **small set done well**: the few effects, powers and background pieces below, each one simple and good. Anything more (more powers, more effects, detailed backgrounds) waits for Version 2+.

**Builds:** the fundamentals of animation for things that are not stick figures, taught as rules, not drawn frames:
- **Effects:** fire (flames flicker and rise), lightning (a fast jagged flash), water (flows, splashes), smoke (puffs that break apart, drift and shrink), a light bulb flickering. Each effect has knobs: size, color, direction, speed, spread, and where it starts (a hand, the ground, a point in the sky).
- **Original effects, never told (Arthur, 2026-10-05):** effects follow the same "3 + 3" rule as stick figures. The engine learns *what makes* fire look like fire (flicker, rising, spreading, colors fading from bright to dark), not one fixed fire. So it can make things nobody wrote: a **green flame**, a **wildfire** that spreads along the ground, a huge fire, or other variants built from the same rules. When the AI doesn't know what something looks like, it searches the internet (Phase 3) or uses what it already knows, then describes it to the engine in engine words (color, size, spread, speed).
- **Powers:** effects joined to body moves with the same timing rules as a punch: a ready pose, a build-up (anticipation), the blast, a recoil. V1 powers: fire blast from the hands, water shield, teleport (gone in a flash or puff, appears somewhere else). The other figure can react (shield up, get hit, get knocked back).
- **Backgrounds:** simple drawn backgrounds (sky, ground, hills, trees, buildings, spikes, a pit) on their own layer behind the figures, plus moving pieces (clouds, flowing water, a flickering light).
- **Original symbols:** the engine builds new props from simple shapes (circles, lines, polygons) and names them ("Spike", "Box", "Bat"). They become normal Library symbols.
- **Original key poses:** a new sitting style or fighting style, written as key poses. The engine still does every in-between and keeps the body rules. A named pose or style is kept and can be used again ("remember this as my fighting style").
- **Editing a made animation:** remake only the part that changed (a stronger punch, a slower run, another color) from the kept plan.
- **Effects for your own animation (engine half of "50-50"):** an effect or power can be aimed at any spot on the page and timed to frames that are already there, on a new layer. (The AI half, finding the spot in your drawing, is Phase 3.)

**How Arthur tests it:** review buttons in the app copy (temporary, like Part B): fire blast vs water shield, teleport, lightning strike, smoke, flickering bulb, a background with drifting clouds, "make an original symbol", "a new sitting style", "edit: make the punch stronger". Plus random combos that mix moves, powers and effects.

**Pass when:** the effects and powers look good at 12 fps, have clear anticipation and timing, stay inside the page, and save, reopen and export like other frames.

**Phase 2C round 1 review (Arthur, 2026-10-06, ~85% to PASS; his sister: "thumbs up × 3"):** the motion and timing of the effects and powers pass ("better than I imagined"); the flickering bulb, lightning strike, blue fire and purple lightning pass; parkour "looks really realistic". New rules the engine learns (teaching, not one-off fixes):
- **Drawable by hand.** Everything the engine draws must be something a person could draw in the app in about 1–2 minutes per picture with its tools: a few bold flat shapes in 3–4 flat colors (fire = red, orange, yellow, fading to gray smoke), never hundreds of tiny pieces, but still a professional cartoon look — about 40% simpler than round 1 (fire stream, fire burst, smoke, water droplets). The water bubble itself stays as it is.
- **Still things are symbols.** A prop or piece that keeps its look (water droplet, light bulb, spike, rock, tree) is a Library symbol placed per picture — drawn once, easy to edit, duplicate and move; only things that change shape (fire, smoke, splashes) are drawn into the frames.
- **Teleport is quick.** Crouch, a quick flash (or a portal), gone, there — no dust cloud, no fire or ice; fading is plain transparency. A teleport never needs the figure to turn round first: it can go anywhere it faces or not.
- **Off the page only on purpose.** A figure never leaves the page by accident (on any page shape, background scenes too). If the story sends it somewhere else it may run off, and about a second later the scene cuts to it there (like a film cut) — never just gone.
- **Background color and FPS on request.** "Make the background gray" uses the existing canvas background color setting (Select tool → Properties); a thunderstorm sky can be dark blue while the hills stay green (only the sky piece changes); "make it 8 FPS" remakes at that frame rate.
- **No unneeded poses.** In an effect scene a figure stands naturally unless the story gives it something to do (no random wave, no hand inside an effect).
- **Editor fix (side task):** Pause keeps the frame you paused on (it was jumping back to frame 1).

**Phase 2C rounds 2–3 (Arthur, 2026-10-06): everything PASSED** — teleport, parkour, lightning strike, purple lightning, flickering bulb, Library symbols, Pause fix (round 2); fire, smoke and the impact smoke (round 3). Rules learned on the way:
- **Drawable by hand, not too simple.** Round 2 made fire and smoke *too* simple (a spear, diamonds, cloud puffs — "I can draw that in 5 seconds") and failed. The right amount is about **1.5 minutes per picture by hand**: a few layered flat colors with rough **zigzag, wavy outlines that change every picture** and a little glow. Reference: the standing blue flame ("perfect complexity"). The fire blast is that flame turned to come out of the hands, wider and thicker, with chunks breaking off.
- **Smoke is not clouds.** Smoke keeps coming out of its source, rises, widens, drifts and breaks into wavy wisps that fade by a certain height (like a volcano). The dark and middle grays never sit at a fixed height — how high they reach changes randomly. Round puffs are only for a sky background.
- **Fire meets water.** Where fire hits water there is plenty of smoke — gray and light gray, never dark gray: a big puff on impact, then smoke that keeps rising while the fire keeps hitting.
- **Light on the ground** (lightning, a bulb, fire) is a thin, dim line of light along the ground — a reflection — never a thick dome or a white disc.
- **The frame viewer shows exactly the app copy's test buttons** — nothing extra.

**Phase 2C extras (Arthur and his sister, 2026-10-06)** — four more things the engine learns *before* Phase 2C is published, each as rules plus an Engine test button (same scene in the app copy and the frame viewer), drawn by hand at the round-3 detail level:
1. **Moving backgrounds.** A background on its own layer can be animated, not only still: **rain** (slanted falling streaks, small splashes on the ground, wind slants it, drizzle → storm), **trees and grass moving in the wind** (trunks stay, crowns and tips sway more, a leaf blows off now and then), **a waterfall** (water pouring over a cliff, foam and mist at the bottom, ripples in the pool). Motion is smooth (every picture), and the engine can mix pieces into an original background (e.g. a thunderstorm: dark sky, rain, bending trees, lightning).
2. **Laser eyes** (a power, for his sister). Anticipation (head dips, the eyes glow), then two thin bright beams shoot from the eyes to the target (white-hot core, colored glow — any color), a small recoil of the head, sparks, a scorch and a little smoke where it hits, and a thin line of light on the ground. Works for filled and hollow heads; the eye spot is the front of the head.
3. **Ice** (a power). Raise a hand (anticipation) and an **ice mountain** — jagged ice spikes — grows out of the ground toward the target, then cracks and shatters into crystals that fade; or **throw ice crystals** that fly, spin and shatter on the hit with frost mist. Light blues and white with facet lines and a little glow. An **"Ice crystal" is a Library symbol** (a still thing, like the water droplet).
4. **Handcuffs and a police escort** (for his sister). **"Handcuffs" is a Library symbol** (two rings and a short chain) on the cuffed figure's wrists. **A cuffed figure's hands stay together behind its back** — its arms never swing, even when walking; it balances with its shoulders and body instead. **The police figure walks right behind**, one hand holding the cuffed hands, the other on the shoulder, in step, so the prisoner can't escape; if the prisoner pulls, the police pulls back.
5. **Elemental fights** (Arthur: the engine only knew one fight with elements). A director makes a new ~10 s fight with powers from rules, not one fixed sequence; the review scene is **laser eyes (Red) vs ice (Blue)**. **Every power attack gets an answer within about half a second** — block (ice wall, water shield), dodge (jump over, jump back, sidestep), counter (zap the thrown crystals mid-air) or a real hit. **Elements interact:** laser or fire on ice → cracks, shatter, steam; fire on water → steam; ice meets fire → melts; two beams meeting → a clash point that pushes back and forth, then a burst. Energetic-fight rhythm (something every 1–1.5 s, powers mixed with punches, kicks and jumps, a clear ending).
6. **Camera (Claude's pick, Arthur passed it):** film cuts between shots (leave the page on purpose → about 1 s later cut to the next shot, maybe a new background) and a small screen shake only on really big impacts. Backgrounds always fill the page, through cuts, shakes and zoom-outs.
7. **Explosions (Arthur, after the app review):** a ground explosion is a flash and fireball, then a thin stem with a big cloud on top (a small mushroom, not a nuke), debris thrown out, the cloud breaks up and fades; an air explosion is a round burst. Two review scenes: a soldier (Military cap symbol) throws a **Grenade** symbol **overhand far** (overhand = far, underhand = short) — it bounces lower each time, settles, explodes and a crate **breaks apart** (animated, not a symbol); and an **underhand** short toss that explodes close and **blows him away** (a fast launch, slowing at the top, falling faster with gravity, a hard landing; airborne in a C shape with the limbs trailing toward the blast — it looks unintentional). How far a blast pushes depends on its strength and distance (a stronger blast reaches farther).
8. **Weapon fights (Arthur: beta users will want sword, stick and bat fights).** The engine builds them from what it learned about fighting: the weapon does the hitting — alternating slashes left and right, overhead chops, thrusts, spin attacks, a dash where the fighter runs with the weapon, goes airborne with both hands on it and slashes on landing, blocks and parries with the weapon; punches, pushes and kicks only ~10% of the time. The weapon is a Library symbol held in the hand(s). Metal on metal makes a small yellow spark at the contact point on strong hits (almost none on light ones); wood makes a dull hit. Review scene: a ~10 s **sword fight**; the same rules cover a bamboo stick, a wooden stick and metal or baseball bats.
- **App review fixes (Arthur, 2026-10-06):** worn handcuffs are a band around each wrist with a tiny chain (not two rings someone holds); an escape attempt is sudden mid-walk and the police reacts after it, holds tight and keeps walking; a head symbol is "<color> stick figure head" unless the user named the character; no near-duplicate symbols (one "Leaf", not "Leaf" and "Leaf 2").

Published 2026-10-07 (D-0182, below). Done (2026-10-07): the engine half of "50-50" — Come true, Clean up, Finish passed; Make better moved to Phase 3 (AI). Next: Phase 3 (AI connected) — needs the Grok (xAI) key and Arthur's OK for small paid AI calls.

**The end goal of all this teaching (Arthur, 2026-10-06):** once the engine needs no more teaching, it creates everything originally and reliably from what it learned — animations (from the 7–10/10 fundamentals: anticipation, acceleration and deceleration, impact timing, weight), key poses, symbols, backgrounds and effects nobody described ("one tall spike on a plain gray background", a rainy thunderstorm background with lightning). Phase 3's test bench checks this with never-taught requests for each kind (see Phase 3).

**Storage note:** remembering named poses, styles and characters must use places the project already saves (the Library symbols and the per-project AI Animator record). If it needs anything new in the saved file or the account, Claude asks Arthur first (saving and user data are protected).

### "50-50" engine half result — D-0183 (Arthur PASS 2026-10-07, published `690b498`)

Make my drawing come true, Clean up my animation (with "what pose is this?") and Finish my animation PASSED — one press each, the engine reads the drawing itself (`src/lib/animator/vision/`), no joint clicking. "Add an effect to my drawing" removed. "Make my animation better" moved to Phase 3 (the AI understands the animation and what the user wants; Grok tells the engine); until then it does the clean-up. The round-by-round review notes are in section 1 ("50-50"). Open: FINISH-HOP-HEIGHT was fixed before publishing (a finished hop's hips rise at most a quarter of the body); PLAN-STAND-AFTER-JUMP; MAKE-BETTER-AI.

### Phase 2C result — D-0182 (Arthur PASS 2026-10-07, published `2827350`)

All 20 Effects (2C) review scenes passed (see the extras above, plus two added at the end):
9. **Weapon fight polish (scene 19):** a dash that flies ~0.5 s at full speed, hits as the front foot lands and keeps swinging through and down (no pause on the hit), the block knocked back off its feet; the spin goes one way round with the sword behind the body on the far side; blades meet near the tip, never the hands; every clash shows a bigger cartoon spark ('+', a broken ring, thick rays — Arthur's drawing).
10. **Explosion with text (scene 20):** a white page, two stick figures, an air burst high above them (it bursts evenly all round — on the ground an explosion can only go up), a hard 2-picture impact jolt, and "BOOM!" bursting out of its middle — a general text effect for any words.

Also published: the workspace lag fixes (timeline, saves and safety backups, opening, undo — same behaviour and saved data). Open engine-quality items are in `TODO.md` (foot slips, sword rhythm, other-seed sword hands). Next: the "50-50" engine half, then Phase 3.

### Phase 1 result — D-0179 (Arthur PASS, published `b7a0800`)

- **Built:** `src/lib/animator/` — `rig.ts` (11 joints, proportions, bend limits, style), `pose.ts` (forward kinematics from angles), `easing.ts` (monotone-cubic channels, ease curves, shortest-turn shoulders), `ik.ts` (two-bone solver), `engine.ts` (key poses → frames: clamp limits, stand on ground with `lift`, planted-foot locks, hips sink when a planted foot is out of reach, swinging feet never go through the floor, per-frame report), `render.ts`, `toFrames.ts` (compact frame pictures + holds), `testScenes.ts` (5 scenes), `engine.test.ts` (17 checks). Editor hook: `applyAnimatorScene` in `DrawingWorkspace.tsx` (new top layer `AI: <title>`, starts at frame 1, one undo step). Scenes are sized by page height and centered.
- **Compact frames (added during Phase 1 with Arthur's OK):** `src/lib/animation/compactRasterBitmap.ts` (+6 checks). See D-0179 for results and limits.
- **Arthur:** PASS — "definitely natural"; keep the engine untouched. Engine files are frozen at this version unless Arthur asks.
- **Not included (as planned):** AI, moves library, joint-posing tool.

### Phase 2 Round A result — D-0180 (Arthur PASS, published `3e40515`)

- **Built:** `src/lib/animator/moves/` — `gait.ts` (walk + run from foot plants: hip path, stance legs by IK, run swing leg from phase curves, arm waves, step plan with speed-up/cruise/slow-down), `styles.ts` (8 styles, speeds, energy, `RAMP_SCALE`), `index.ts` (library list + review-only Moves test scene), `moves.test.ts`. `src/lib/animator/stageFit.ts` (page rule) and `colors.ts` (figure colors + color words). Engine: per-key `facing`; optional `neck` (default off) and solid head by default. Editor: `applyAnimatorScene` takes a scene or a recipe that fits itself to the page, and centers the whole animation.
- **Engine lessons (apply to every move):** no frozen ready pose; speed-up and slow-down about half a second (arms/legs grow then shrink; slow running = small arm swing); robot none; tired ≈1–1.5 s, hurt longer and hesitant, low energy longer, lively/angry quicker; hips never sink so low a knee touches the floor.
- **Page rule (strict):** the whole animation is centered and always fully inside the page, figure size unchanged; a move covers only the ground that fits (natural step length kept).
- **Checks:** 53 tests; independent audit 0 canvas failures over 288 moves × 4 page shapes.
- **Arthur:** PASS — "great for version one"; no more tweaks to walk/run.

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

**Builds:** the math-made moves, **walk and run first** (they're the hardest moves to make natural with math, so we find out early and have the most time to perfect them). Body: walk, run, stand still/breathe, jump, wave, sit, squat, kick, punch, turn around, fall down, high-five. Objects (for Symbols): slide along a path, bounce, spin, grow/shrink. (No fade — Arthur's decision.)

Every move also gets a **style** knob: natural, robot, sneaky, tired, happy, angry, heavy. A style changes *how* the move looks (a robot walk is stiff with sharp starts and stops; a tired walk is slumped and slow), and the engine rules still apply. Each move is also written up as a **lesson** for the AI (its key poses, timing and why it looks natural). The lessons are made automatically from the same move code, so they can never disagree with the moves.

**How Arthur tests it:** the "Engine test" list gets a **Moves** section (review copy only). Pick a move, change 2–3 knobs (speed slow/normal/fast, energy, height, direction left/right, **style**) and press Make. Start with walk and run, natural and robot. For object moves, draw something (a ball), name it as a Symbol, then pick "bounce". Arthur and his dad judge walk and run first.

**Pass when:** you'd be happy to see each move in a real cartoon. You mark each move good / OK / redo. Moves marked "redo" get fixed before Phase 3. Knobs and styles change the motion the way you expect (a robot walk clearly looks like a robot, and still never breaks the body rules).

**Not included:** AI.

### Phase 3 — AI director = Test 1 (Grok vs Terra) · Wednesday Oct 7 (build), Thursday Oct 8 (test)

**Builds:** the AI director. When it connects, it first gets the **lessons** from the moves library and from Phase 2C's effects, powers and backgrounds (see section 1). Grok (xAI) and Terra each get the same request and write a plan. The engine checks and fixes the plan, then makes the frames. A private **test bench page** runs a fixed set of **20 test prompts** through both AIs and shows the results side by side. **5 of the 20 are "never taught" moves** (for example a cartwheel, a robot dance, tiptoeing, a victory celebration, a new power): the "3 + 3" test of whether the AI can invent original moves that still look natural. Others use styles ("walk like a robot", "a tired run"), energy ("a powerful punch"), powers ("a fire stick figure blasts fire, the blue one shields with water") and Dad's and Arthur's story tests (block-block-hit, parkour over spikes).

**Also builds (2026-10-05):**
- **Internet search, only when needed.** Terra and Grok may search the internet when a request needs it (a YouTube channel's characters, what something looks like). The chat shows a line saying what it is searching ("Searching YouTube for …"). The search is the AI's job; the engine never searches. The Assistant's own search is not changed.
- **Names become characters.** The AI turns what it learns into engine words ("Dark Lord = a red stick figure with a hollow head") and the character is remembered for later requests (see the storage note in Phase 2C).
- **Adding to your own animation ("50-50").** Only when you ask it to add to frames you drew, the AI is sent small pictures of those frames so it can find where the figures and hands are. It then writes a plan for effects on a new layer, timed to your frames. If it isn't sure, it asks you. Your drawings are never changed. Test: you draw a short fight by hand, then say "red is fire, blue is water".

**Needs first:** the xAI key, set up by your dad, and **your OK for small paid test calls** (see section 4).

**How Arthur tests it:** open the test bench and press Run. Watch each prompt's result from Grok and from Terra play side by side. Rate each one good / OK / bad. The page also shows how many plans worked, how many needed fixing, the cost per animation and the time per animation.

**Pass when:** at least 17 of 20 prompts give a usable scene for the winning AI, **including at least 4 of the 5 never-taught moves looking natural to Arthur**. **Originals too (Arthur, 2026-10-06):** the test bench also has never-taught requests for an original background (e.g. a thunderstorm with rain, "one tall spike on a gray background"), an original effect, an original symbol and an original key pose, plus "change the background color" and "make it 8 FPS"; each must come out right from the engine's rules. Zero broken bodies reach the frames (the engine catches 100%). Each animation costs a few cents or less. You pick Grok, Terra or "use both".

**Not included:** typing in the real editor chat (that's Phase 4).

### Phase 4 — AI Animator in the editor · Thursday Oct 8

**Builds:** the real flow, **chat only, no move-picker buttons**. Type in the shared chat box. The AI plans the animation and a small **preview** plays right in the chat. Press **Apply** and editable frames appear on a new layer. Undo works. Follow-ups edit only what you asked: "make the punch more powerful" changes that punch's energy, "make him walk like a robot" changes that walk's style, "make the jump higher" or "slower" change those knobs. The kept plan is changed and the scene is remade. The AI can also set figure colors and the frames per second, and add a simple outfit (shirt and pants as colored body lines), when the user asks.

**"0-100" — AI only, and the engine edits its OWN animation (Arthur, 2026-10-07):** besides 50-50 (the user draws, the engine helps), the AI can make the whole animation and then keep editing it on request: "make him jump higher", "punch harder", "stronger anticipation", "make the run last longer until he leaves the screen, then take him to a different white background". Each follow-up changes only what was asked (the kept plan is edited and the scene remade). The same goes for timing: by default the engine keeps every animation at a normal, smooth pace for its kind (a run is fast); only when the user says a fast or slow part is intentional ("keep all this the same, only tweak this") is it left alone — the AI passes that to the engine (`keepPace`).

*Stretch goal, only if time allows:* say "remember that move as robot dance" and an AI-invented move is saved into the library, so the library grows for free.

**How Arthur tests it:**
1. Type "a stick figure walks in and waves". A preview plays in the chat.
2. Press Apply. A new layer appears with the frames. Press Play.
3. Draw on one of those frames. Undo, then Redo.
4. Type "make him wave twice". The scene updates.
5. Type "after he waves, a ball bounces" (with a Ball symbol). The ball starts right after the wave ends — no playhead needed.
6. Save, reopen and export. Check the AI Dashboard shows the usage.

**Pass when:** all 6 steps work. Story-order requests ("after…", "then…", "at the same time as…", "at the end") land in the right place. Nothing else in the project changes. The chat box looks exactly the same as the Assistant's. If the AI fails, you see a friendly message and nothing changes.

**Not included:** Animating hand drawings limb by limb.

### Phase 5 — Library check + cleanup · Friday Oct 9

**Builds:** cleanup and the final check. The temporary test lists are removed, so only the chat remains. The full library, the effects and powers, and the never-taught moves are re-checked in the real editor flow. Any move that still isn't natural gets better math; if it can't be fixed in time, it's left out of V1. No motion files are used in the app.

**Dad's side test (outside the app):** Dad tries Blender files on Friday to learn what they could add later. This doesn't change the V1 rule in section 1: the V1 app makes every move with the engine's math, unless Arthur and Dad decide otherwise.

**When:** after Phase 4.

**How Arthur tests it:** make a few animations only by chatting, and edit them by chatting, including never-taught moves.

**Pass when:** the AI Animator works by chat alone, and every move in V1 is marked good (natural).

## 4. Timeline and money

| Day | Phase | AI money |
| --- | --- | --- |
| Done (Oct 3–4) | 1. Characters + engine; 2 Round A walk + run | $0 |
| Mon Oct 5 | 2 Part B: stick-figure fundamentals finished | $0 |
| Tue Oct 6 | 2C: effects, powers, backgrounds, original symbols and poses, editing | $0 |
| Wed Oct 7 | 3: AI connected (+ internet search) | small test calls only, inside the cap below |
| Thu Oct 8 | 3 test (Grok vs Terra) + 4: in the editor | about $1–4 total for Phases 3–5, **hard cap $5** |
| Fri Oct 9 | 5: cleanup, final PASS, publish | inside the same cap |

Target finish: **Friday 2026-10-09** (Arthur, 2026-10-05). After that, a one-week roadmap for the rest of the app; V1 in about a month.

**Arthur's time:** Monday and Tuesday are long working days with many short review rounds. Wednesday to Friday, Arthur only does short reviews and ratings (about 15–30 minutes a day), and Dad sets up the xAI key.

**Money safety:**
- No paid AI call happens before you say OK for Phase 3. Keys are set up by your dad, not by Claude.
- Every AI request has a limit on how much text the AI may write, and a cost check before it's sent (about 5 cents at most per request).
- A plan gets at most **1 retry**. After that you see a friendly "couldn't make that — try something simpler" message.
- The test bench stops by itself when the run reaches its budget.
- Keys stay on the server. The browser never sees them.
- Rough real-use cost after V1: about 1–5 cents per animation (to be measured in Phase 3).
- **Internet search costs extra** per search. The AI searches only when a request needs it, and searches count toward the same per-request cap and the $5 test cap.
- **Pictures of your frames cost extra** too. They are sent only when you ask the AI to add to your own animation, kept small, and counted toward the same caps.

**Biggest risk: it still might not look natural.** Fix: you judge the engine (Phase 1) and every move (Phase 2) **before** any AI money is spent. If a move looks wrong, we fix that one move's math. We don't ask the AI to try harder, and we never fall back to motion files in V1. If one move can't be made natural in time, it's left out of V1.

## 5. Protected — what must NOT change

SPEC-0017 adds a **new engine alongside** the app. It only writes **ordinary frames** (and ordinary Symbol placements) onto a **new layer**, using the same insert, undo and save steps the editor already uses. It does not change:

- login/logout, accounts, who owns which project
- saving, Save As, reopen, recovery drafts and the project file format (no new fields)
- your existing frames, layers and drawings (no silent deletion, ever)
- Assistant AI replies, web search and dictation (the AI Animator's own search in Phase 3 is new and separate; the Assistant's search is not changed)
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

- Positions are fractions of the stage (0..1). Times are in seconds. **Frames per second (Arthur, 2026-10-05, not optional):** the engine always animates at the **project's own FPS**, whatever number the user picked (8, 12, 13, 15, 24…). It never switches to 12 by itself. It changes the FPS only when the user asks ("make it 8 FPS"); then the project's FPS changes and the same animation is remade with the same timing in seconds, just with fewer or more pictures. Every move must look right at any FPS from 8 to 30.
- Limits: ≤4 characters, ≤4 objects, ≤8 s (final number set in Phase 1), ≤40 steps, ≤6 key poses per `custom` step.
- `custom` is for special moves only. The AI writes a few key poses as angles, and the engine clamps them and fills in everything between.
- The plan is kept, so follow-ups edit the plan, not the pixels.
- **Phase 2C additions (2026-10-05, exact fields set when built):** effect steps (`fire`, `lightning`, `water`, `smoke`, `flicker`) with knobs (size, color, direction, speed, start point such as an actor's hand); power steps that join a body move and an effect (`fireBlast`, `waterShield`, `teleport`); a `background` section (simple pieces and their moving parts, on their own layer); `newSymbols` (a name plus simple shapes); `newPoses` (a name plus key poses as angles). Named poses, styles and characters (e.g. "Dark Lord" → red, hollow head) are kept for later requests.

### 6.4 Moves library

Every move is a pure function: `(params, durationSec, startPose, ctx) → PoseKey[]` (key poses with timing, easing and contacts). The engine does the in-betweens. Body moves: `idle, walk, run, jump, wave, sit, squat, kick, punch, turn, fall, highFive`. Shared knobs are `speed` (slow/normal/fast or a number), `energy` (0–1: bigger swings, more squash), `direction`, `height` (jump/kick), `toX` (travel) and `side` (which arm/leg).

Animation principles built in: anticipation (dip before a jump, wind-up before a punch), follow-through/settle (land and recover), arcs (hands and head travel on curves), slow-in/slow-out (eased keys), and a contra-posed arm/leg swing for walk and run. Walk and run use a gait cycle with planted feet, so they look the same at any `toX`. Object moves (`slide` along a path, `bounce` with squash timing, `spin`, `scale`) change x, y, rotation and scale over time. No `fade` (D-0179).

**Styles** (`params.style`: `natural | robot | sneaky | tired | happy | angry | heavy`): a style is a small set of changes applied to a move's key poses and timing, never a separate move. For example: robot = linear segment timing with short holds at each key, stiff elbows/knees, no follow-through, squared arm swings; tired = slumped lean, smaller swings, slower; sneaky = crouched, high slow knees, long holds; happy = bouncy root, bigger arm swings; angry = forward lean, fast sharp keys; heavy = deeper knee bends, longer settles. The engine rules (bone lengths, limits, feet, ground) apply after every style.

**Lessons for the AI:** `moves/lessons.ts` turns each move into a lesson: its name and meaning, its knobs and styles, a compact sample of its key poses (angles + timing + contacts) for one or two settings, and the principle it shows (anticipation, follow-through, weight shift, arcs, slow-in/slow-out). Lessons are generated from the move code, so they never drift from it.

A move is plain data plus a function. (Future, Version 2+: a motion-file clip could register under the same name; see section 10.)

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
- **Honest limit:** the AI knows what's in **AI-made scenes** (it kept their plans). Hand-drawn frames are only looked at (small pictures) when you ask it to add to your own animation (section 1, "50-50"). Otherwise it only knows their length and layer names. "After the punch" or "at the end" always work; finding a moment inside a hand drawing works only when it is looking at those frames.

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
- `moves/index.ts`: move registry (math moves)
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
- `*.test.ts` beside each logic file
- `app/dev/animator-bench/page.tsx`, `app/api/dev/animator-bench/route.ts`: Phase 3 bench (dev only)

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
- Also run each phase: `npx tsc --noEmit`, and `npx eslint` on changed files.
- **In the real app** (each phase, review copy): insert → play → draw/erase → undo/redo → save → reopen → export. Assistant chat still works, and AI Dashboard numbers still add up.

## 9. Risks and Arthur's decisions

**Risks**
1. **Natural look:** the biggest risk. Arthur judges Phases 1–2 before any AI spend. Bad moves get fixed one by one with better math; no motion files in V1.
6. **AI-invented (never-taught) moves** may look less natural than library moves. Mitigation: the lessons, the engine's body and timing rules, and the 5 never-taught bench prompts that Arthur judges in Phase 3.
7. **Prompt size:** lessons for every move make the prompt longer. Mitigation: compact lessons and the provider's prompt caching; the per-request cost cap still applies.
2. **Memory:** frames are full-canvas bitmaps (about 4.6× the stage times the screen's pixel ratio). Dozens of new frames could use a lot of browser memory. Phase 1 measures a 48-frame, 2-character scene. Fixes, in order: hold cells → render on twos (every other frame held) → lower the scene length cap. Changing how the editor stores frames would touch the drawing engine, which needs Arthur's OK.
3. **AI plan quality:** the AI may pick odd moves or timing. Strict schema, repair, one retry and the 20-prompt bench measure and limit this.
4. **Inserting a layer shifts saved layer IDs.** The save step matches layers by position (`buildUnifiedProjectSnapshot`). The new layer is inserted the same way the existing "+ Layer" button does it, so this adds no new risk. Phase 1 still checks save → reopen with layers above and below.
5. **xAI details** (model name, structured output, price) aren't in the code yet and are confirmed at Phase 3 start.
8. **Five days is tight** (2026-10-05). Mitigation: hardest work on the two free days, simple V1 versions of every new thing, and anything that isn't good by Friday is left out of V1.

**Arthur's decisions (2026-10-04, recorded as D-0179)**
1. Replace SPEC-0008's paused video plan with this one: **Yes.**
2. Layers: **one new layer per scene** for V1; revisit if editing feels hard.
3. Fade: **no fade.** It doesn't fit the app.
4. Where a scene goes: **the AI decides from story words** ("after the punch", "then", "at the same time", "at the end"); never the playhead, never frame numbers. Default: frame 1, or right after the last AI scene for follow-ups (6.11).
5. If both Grok and Terra pass: **decide after seeing the Phase 3 results.**

**Arthur's later decisions (2026-10-04)**
6. **No Blender or motion files in V1** (Arthur and his dad: too expensive and slow; V1 is due in a month). Not a comparison test anymore. Every V1 move is made by the engine's math and must always look natural; a move that can't be made natural in time is left out of V1. Motion files may be considered for Version 2 or 3 (section 10). Phase 5 is "library check + cleanup".
7. **Chat only:** no move-picker buttons in the finished AI Animator; create and edit everything by chatting ("more powerful punch", "walk like a robot").
8. **Styles:** every move has a style knob (natural, robot, sneaky, tired, happy, angry, heavy).
9. **Teach-by-example:** the AI is taught with lessons from the moves library every time it connects, so it can invent original moves that are still natural; tested with never-taught prompts in Phase 3.
10. **V1 = animation only:** no sound effects or voices until Version 2+.

**Arthur's decisions (2026-10-05)**
11. **Deadline: 5 days, Mon Oct 5 – Fri Oct 9.** The hardest, longest work goes on the two school-free days (Mon, Tue). Wed–Fri hold the lighter work and short reviews.
12. **V1 is "version one, not version 10":** the basics a beta user needs, working well. New things are small, simple versions.
13. **Beyond stick figures (new Phase 2C):** the engine learns effects (fire, lightning, water, smoke, flicker), powers (fire blast, water shield, teleport), simple moving backgrounds, original symbols, original key poses, and editing a made animation, all as rules.
14. **Learns from the user:** named poses, styles and characters are remembered and reused.
15. **Internet search:** Terra and Grok (not the engine) search only when needed and show what they search. They turn references into engine words ("Dark Lord" = red stick figure, hollow head).
16. **Robot high-five:** the arm stays bent on the way up behind the head; it straightens only at the slap.
17. **Blender:** Dad tests Blender files on Friday as a side test. The V1 app still uses no motion files unless Arthur and Dad decide otherwise.
18. **No new bodies in V1:** four legs, four arms, three heads, stretchy bodies and regenerating limbs are Version 2+ (they need a new body and break the "bones never stretch" rule).
19. **50-50 (Claude's call, Arthur asked):** in V1 the AI can add effects, powers and backgrounds on a new layer over the user's own animation (it looks at small pictures of those frames only when asked). Redrawing hand drawings or adding in-betweens to them is Version 2+.
20. **Frames per second is not optional:** every animation follows the project's FPS; the AI changes it only when asked, and the same animation is remade at the new FPS (section 6.3).
21. **Walk, jog, run:** three speeds. Jog = a short, low hop every step (well under half a second; Arthur's round 10 correction: "jogging, you're actually airborne a little"); run = a clear airborne moment every step. Legs and arms pass each other only while a foot is on the ground (parkour is the reference).
22. **Ground fighting** (mount, stomp, grab and throw, get-up counter) is part of V1 fights, used when the user's request or the energetic fight calls for it.
23. **No guard stance by default (round 10):** stick-figure fights stand loose, hands low (about half as high as in a real guard, around the belly), arms a little apart. Hands held higher only when the user asks for it. A real boxing guard only when the user explicitly asks for realistic or educational (MMA-style) fighting. The engine can do all three.
24. **Fights never have a pattern:** both hands punch about 50/50 (strong punches with either hand), everything a little different each time; a fighter lowers his hands while the other is down or staggering.
25. **Dash punch:** run to top speed, crouch, push off into a short airborne dash (arm back), the front foot lands as the punch hits, then a little slow-down (Arthur's drawings). Also: catching a punch with both hands, and lifting a fallen fighter to slam him (Arthur's drawings).
26. **Squash and stretch only at high frame rates** (Claude's recommendation: 20 fps and up), one or two pictures (e.g. a dash push-off); never at 12 fps or below, where it looks wrong on stick figures.
27. **Lying is lying:** a figure on the floor never floats or wiggles; a stomp dents the body and bounces the legs; getting up is a real physical get-up.
28. **Press the advantage (round 11):** in a fight the user did not describe in detail, a fighter who sees the other down or off balance goes after them (stomp, kick, overhand, uppercut) and the other answers (cover up, move away, get hit, strike back). Only a request that says otherwise ("blue looks at him while he gets up") holds back.
29. **Carry by weight (round 11):** a held symbol changes how the figure moves by its weight: a ball is carried in one hand at the side and the walk stays the same; heavy things use both arms, shorter steps and a lean back.
30. **No guard stance means the feet too (round 11):** by default fighters stand naturally and walk or run over with the hands up a little; the boxer stance and shuffle steps only for a realistic guard.
31. **Ideas noted for later, not in round 11:** a jump-and-punch-the-ground shockwave that can't be blocked (an effect, Phase 2C), grabbing the hand, a kick that drops someone to their knees, a push to the floor.

## 10. Future (Version 2 or 3, not V1): motion files

Not part of V1 (Arthur and his dad, 2026-10-04). Kept only as notes for when there is money.


- **What to ask the Blender person for**: one action per file; 24 or 30 fps; side view with the character facing +X; in place or with root motion clearly noted; standard bone names (Rigify, Mixamo or similar). Delivered as **`.blend` + BVH export** (BVH is a standard per-frame rotation format). If possible, also run our small script `scripts/blender/export_stick_motion.py`, which writes per-frame world positions of the needed bones as JSON.
- **Converter** (`blender/importClip.ts`): map bones → our 11 joints (hips→hip, spine top/neck→neck, head→head, upper_arm/forearm/hand→elbow/hand, thigh/shin/foot→knee/foot). Project to 2D (x→x, z→−y). Convert to **our angles** (our bone lengths are kept, so proportions stay ours). Resample to the project FPS. Detect foot contacts from low foot speed near the lowest height. Register as a `ClipMove` under the same move name.
- Clips still pass through the same limits, contacts and checks. They improve the look; they don't bypass the rules.
