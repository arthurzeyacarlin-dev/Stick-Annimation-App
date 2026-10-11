# SPEC-0019 v2 — The Animator: one studio, a Body engine first, Luna linked in (Sun 2026-10-11 05:40; updated 06:00 — Arthur asked for this plan; waiting for his "go" to start Phase A)

> **SUPERSEDED IN PART — Sun 2026-10-11 ~16:30 (decided with Arthur's dad): see SPEC-0021 "The AI Writes the Motion"
> (docs/specs/0021-ai-writes-the-motion.md).** The AI (Claude API first) becomes the animator: it writes a motion sheet, the engine
> builds it in strict mode (adds nothing), the laws check it, the AI looks and fixes only broken steps (≤ 3 rounds) or refuses.
> Luna's "short order + rule compiler" path below stops being the main path. KEPT from this spec: the rule, the finish line,
> the laws, the pose book, the Body judge, the symbol and place books.


**Why v2:** Arthur's review of the night round (Sun 05:30): "none of these are good animations; stick figures don't move naturally." Phase 0
fixed real contact bugs (the zoom-after-measure root), but the figures are still stiff: their poses are COMPUTED (a hand pulled to a point,
hips solved onto a seat), not DESIGNED. Nobody ever decided what a natural stick figure looks like sitting on a log, holding a mug or
waiting. Arthur: "we need an engine just for stick figures — how they look, act, react; if they see this they do this; that ain't natural
for a stick figure." v1 below is kept as history; its laws, gate and rules still apply.

**The rule (unchanged):** no broken animation made by the AI Animator ever reaches a user. Better, never worse. Refuse rather than degrade.

## THE FINISH LINE (Arthur, Sun 2026-10-11 06:10 — the test the whole plan must pass)
In the app, by chat with Luna, with nothing broken at any point:
1. "Make a 30-second fight scene of two stick figures." → 30 s, natural, no broken figures, no sudden fast-forward bits (one second
   fast, then normal), it looks good.
2. "I like it. Change it to fire versus water." → the same fight, now a fire-vs-water power fight.
3. "When Blue wins, he leaves the scene, then it cuts to a new place: a cup on a table; he grabs it and drinks." → the fight, Blue walks
   off, a cut to a new place, a real table and a real cup of coffee (side-on, handle toward him), he grabs it by the handle and drinks.
The app must animate reliably, ADD scenes and EDIT scenes this way. Phase G's benchmark includes this exact story.

## The decision: ONE engine (one studio) with five departments, sharing ONE world and ONE dictionary
Not five separate programs that pass plans to each other (that is what produced the plan-rewriting mess). One studio, one picture of the
world, one vocabulary that Luna also speaks:
1. **The Body (the stick-figure engine) — NEW, the heart.** How a stick figure looks, stands, sits, holds, reacts. Three parts:
   - **The pose book:** designed natural key poses for every everyday action (stand idle ×3, sit on a chair/bench/log/ground, hold a
     mug by the handle, drink, eat, hold a pan, carry, pick up, put down, knock, wave, high five, stir, kneel, bow, look, point, catch,
     throw, fall, get up, scared, happy, tired…). Each pose is a picture Arthur approves ONCE; every move then uses the approved poses.
   - **The body laws (the "that ain't natural" judge), measured on every frame:** balance over the feet (or the seat); joints in a
     comfortable range; never ruler-straight (a relaxed back curves a little, relaxed arms bend, the head leads); no perfect mirror
     symmetry; hands do something meaningful (rest, hold, gesture), never float stiffly; weight shifts before a step; contacts are true.
   - **The behavior rules (if → then):** before sitting he looks at the seat and turns; seated, he leans back a little with hands on the
     thighs; holding a mug the elbow bends and the mug stays near the chest; when hit he recoils away; after landing he absorbs; idle, he
     breathes and shifts weight; scared, the shoulders rise and he steps back.
2. **Motion** (exists): timing, arcs, ease in/out, anticipation, follow-through, three paces — between the Body's poses.
3. **Symbols** (exists): things that look like the thing, with grips/handles/seats and moving parts; side-on vs facing the camera.
4. **Backgrounds** (exists): places from words, animated pieces (flames, flicker, rain), never unasked.
5. **The judge** (exists, extended): the measurer + the Body laws + **Luna's eyes** on the pictures. Only a pass reaches a user.

## Luna linked in ("their brains linked")
Luna does not write numbers or a detailed plan. She writes in the studio's OWN words — the dictionary of poses, behaviors, things,
places and effects ("sits on the log, relaxed; warms his hands at the campfire") — and every department understands those words exactly.
New words (a thing or place the studio doesn't know) she describes in shape words, and the department adds it to the dictionary. The studio
answers her in the same words plus pictures ("the hand misses the mug by 20 px", "this pose isn't in the book"), and she looks at the
pictures like Arthur does and accepts, rewrites, or refuses.

## Every department works the same way (Arthur, 06:00)
Each department has three parts, and Arthur approves its book ONCE, as pictures:
| Department | The book (approved once) | The laws ("that's broken", measured) | The if → then rules |
|---|---|---|---|
| Body | ~20 everyday actions as natural key poses | balance, comfortable joints, never ruler-straight, no mirror symmetry, hands always doing something, true contacts | seated → lean back, hands on thighs; hit → recoil away; idle → breathe, shift weight |
| Symbols | ~30 common things as pictures (mug with a handle, campfire, snowman, pan, chest, bench…) | real size, grip/handle/seat points, side-on vs facing the camera, nothing floats, no hidden squares | held → grip in the hand, body points away; opened → lid swings on its hinge, the inside shows |
| Motion | a timing card per action (how long, where it speeds up and slows down) | no snapping, real arcs, ease in/out, no unnecessary moves, three paces | anticipation before a jump or throw; follow-through after; never perfectly in sync |
| Backgrounds | ~10 common places (beach, forest, park, city at night, haunted castle, snowy field, kitchen, gym, stadium, party) | never unasked, depth (far things smaller), animated pieces, never cut off | night → dark sky and lights; haunted → dead trees, fog, flicker |
New poses, things and places beyond the books: combined from approved ones, or described by Luna in shape words; the laws judge them and a
broken one is rejected, never shown. Every approval grows the book. It does not "learn" by itself; every miss becomes a rule.

## Phases (each ends with Arthur's review of the review page; fresh never-seen scenes every time; nothing runs during a review)
Target: Sunday A–C, Monday D–F, then G. Each phase ≈ 1 h 30 of work plus Arthur's review.
- **Phase A — The Body judge.** The body laws as measurements on every frame; run on all 24 night-round videos → a list per video of what
  is unnatural and by how much, with the frames. Review: does the judge's list match what Arthur sees?
- **Phase B — The pose book.** ~20 everyday actions drawn as pose sheets (stills). Arthur approves or marks each pose. Approved poses become
  the only poses the moves use. Review: still pictures.
- **Phase C — Behaviors and idle life.** The Body's if → then rules and natural idle. Review: fresh everyday videos built from approved poses.
  **Reuse what Arthur already passed (his rule, Sun 08:40: "I don't want to reteach and relearn"):** the walk, run, jump, running jump,
  fights, cartwheel/backflip timing and every other move Arthur passed in SPEC-0017 Phase 2 / 2C (moves library, D-0180–D-0182) stay the
  base motion; Phase C only replaces their key POSES with approved pose-book poses where the book has one, and adds the behaviors.
  Motion must also know its kind: a pat just lowers the hand; a punch, a throw and a high five wind up first (anticipation).
- **Phase C2 — FIX + LUNA'S EYES NOW (moved up by Arthur, Sun 12:00: "Luna has to see this; I want Luna to be embarrassed of itself").**
  1. Narrow and fix the root causes Arthur saw in the Phase C videos (who made them, in which file): the FLOATING + DUPLICATED mug and
     the mug "eaten" instead of drunk by the handle; the high five with two hands on one side; a ball "held with both hands" that is
     really in one; standing up too fast ("like a ghost"); a 1.1-second scene (the scared walk).
  2. New HARD LAWS (gate): NOTHING FLOATS (a thing rests on something or is held — unless the scene is in space / the user asks);
     NOTHING DUPLICATES (one of each thing unless the user asks for more); A SCENE IS LONG ENOUGH TO TELL ITS STORY (no 1-second scenes);
     HANDS DON'T LIE (a hand that looks like it holds something holds it; one-hand vs two-hand holds are what the picture shows).
  3. LUNA'S EYES on every review video: the existing whole-animation look (script/look.ts — 24 pictures, verdict happy / ok / hate) runs
     on each video before Arthur sees it; her list of what a viewer would hate goes on the card; a "hate" fails the video. Test calls
     ≤ $5/day (≈ 1–2 cents a look).
  4. EDITS stay easy (Arthur's finish line): "make the blue figure pink", "make the chair black" — a recolor is one edit, nothing else changes.
- **THE BENCHMARK (Arthur, Sun 14:08 — how Phase C is passed and how every round is judged from now on):** brand-new prompts written
  into plans by the REAL Luna: 25 simple, 25 complex (places, props, two figures), 25 very complex (effects, cuts, close-ups, jump scares,
  several beats); later 100 the engine has never seen. PASS = Arthur reviews ~100 and only 10–15 fail. Each round: run the benchmark →
  group the failures by CAUSE → fix the causes that break the most videos (broad rules, Arthur's "puzzle piece") → rerun the SAME
  prompts (the before/after count is the proof) + the gate (no regression) → then a fresh set. Runner: harness-phase4/review/bench.sh.
- **THE LUNA LAW (Arthur, Sun 14:08):** Luna verifies that the user's message is TRUE in the video, beat by beat — counted (one fall is one
  fall), who (the asked winner wins; the loser never celebrates), order, duration, travel (no teleport). Her teachings live in ONE lesson
  book (director/lunaLessons.ts) that she reads every time — in the app too.
- **Fire meets cold (Arthur's law):** fire melts a cold thing slowly (a snowman sags into a puddle); cold puts out fire.
- **Pulled forward because the benchmark needs them:** symbols (D), places (F) and the camera / cuts / close-ups (E) are worked on inside
  the benchmark loop, not after it.
- **Phase D — The symbol book.** ~30 common things as pictures with their laws (size, grips, facing, nothing floats). Review: still pictures
  of the things, then fresh videos using them.
- **Phase E — Luna linked in (her eyes already came in C2).** Luna writes in the studio's own words (poses, behaviors, things, places, effects); new words in shape words;
  the studio answers in the same words plus pictures; Luna's eyes accept, rewrite (≤ 3) or refuse. Review: fresh prompts through real Luna
  (≤ $5/day of test calls).
- **Phase F — The timing cards and the place book.** Motion timing per action; ~10 places with their laws. Review: fresh videos.
- **Phase G — THE FINISH LINE story above + Arthur's fresh benchmark, the honest "can't yet" list, then the app copy.** Engine freeze. After that only bugs and cost,
  for October 20.

## Honest limits
- Two days is enough for the Body engine's core, the pose book for everyday actions, and Luna linked. It is not enough to promise that
  ANY animation will look natural. Complex scenes (tables, mugs, two figures, props) get the most attention; what still can't be made
  right is refused in one plain sentence.
- The pose book needs Arthur's eyes once per pose. That is the fastest real way to make stick figures look good: engineering rules alone
  produce stiff motion.

---

# SPEC-0019 — The Animator (the final engine plan, Sat 2026-10-10 → Mon 2026-10-12)

**Owner:** Arthur. **PM:** Claude (PM2). **Copy:** `diamond-review/diamond-engine` (port 58670) — the FINAL copy; no more copies.
**The rule (tattooed):** no broken animation made by the AI Animator ever reaches a user. Better, never worse. Refuse rather than degrade.

## The idea in one sentence
Luna animates the way a good animator works — write, build, measure, fix, repeat — and the engine is her hands and her ruler:
it builds in seconds, measures in numbers, and never rewrites her plan behind her back.

## How one animation gets made
1. **Luna writes the scene**: who, what things, the place, the beats, and what each beat must look like at its key moment
   ("hand on the handle", "lid up", "bottom on the seat"). Meaning, never pixels.
2. **The engine builds it**: contacts solved every frame (`world/contacts.ts`), the passed moves (walk/run/jump/fights/powers),
   things from the Symbol engine, places from the Background engine. **No silent change**: what Luna wrote is what is built.
3. **The engine measures it and reports in numbers + pictures**: "hand 40 px from the handle at 3.2 s", "the book appears twice",
   "walk 4 s for 2 steps = slow", "figure behind the bench", plus the 24 key pictures.
4. **Mechanical misses are fixed by the engine itself** (step closer, shorten the walk); the rest goes to **Luna, up to 3 rounds**
   (medium reasoning).
5. **Pass or refuse**: every law measures true AND Luna's eyes say a beta user would like it → it lands. Otherwise one honest sentence.

## What stays (never rewritten)
Everything Arthur passed: the moves library (walk, jog, run, jump, fights, swords, powers, parkour, cartwheel…), the 38 effects,
the places, the renderer and the editor, the Library symbols, the chat (Luna talks, plans, remembers, edits by chat, searches),
the script layer (`script/*`), the contact pass (`world/contacts.ts`), the symbol points (`world/symbols.ts`), Luna's whole-animation
look (`script/look.ts`), the law book (`LAWS.md`).

## What goes (on the AI path only)
Every pass that rewrites a plan after it is made: the checker's fixers (statue retiming, adding things, moving starts, deleting
copies, pose inserts), keep-on-page shifts, the safety net that replaces failed moves with standing, the word rules, the kit gate,
zoom after the fact. The checker only JUDGES (pass/fail + the law that broke). The page size is known before compiling.

## The laws (LAWS.md — each: a kid sentence, the measurement, the test)
Physics (nothing floats, a thing moves only when moved, smoothly; gravity; solids don't pass through), Body (joint limits, back ≤ 35°,
step closer, feet planted, hands touch what they use), Scene (figure in front of what it sits on; everything named shown, nothing
unasked; real sizes and shapes), Story (the outcome happens; ends with the story; ≤ 15 s unless asked), Pace (normal / action /
slow; never in sync), Honesty (what can't be measured right is refused; no animals; no power for an everyday verb).

## Phases (each "done when" is visible on the review page, http://localhost:3210)
- **Phase 0 — tonight 18:40 → 19:25: the final copy and the straight line.** `diamond-engine` made once. Fixers off on the AI path.
  The gate = TEN everyday scenes written by hand (no Luna), each with Arthur's "what a human expects" line, built and MEASURED on
  the frames (hand on the grip at the grab; thing in the hand until the release; placed on top after; one copy at any time; figure in
  front; nothing floats; ≤ 15 s; walking pace 1.2–2.2 steps/s). The "no silent change" law. **Done when** the ten build and the
  measurements pass — or the exact engine faults are listed. Arthur reviews the ten videos: are the engine's HANDS right?
- **Phase 1 — tonight: Luna in the loop.** The measurer's report, engine self-fixes, ≤ 3 Luna rounds, pass or honest refusal, the
  script check (one thing per noun, every thing named, the user's words own the things, place only if asked). **Done when** fresh
  everyday prompts land right or are refused honestly — nothing broken.
- **Phase 2 — Sunday morning: Symbol + Background engines.** Every thing looks like the thing with contact points and moving parts;
  Luna describes new things in shape words; places from Luna's words, animated pieces, never unasked; a review-size picture per new
  thing/state. **Done when** things and places pass Arthur's eyes on fresh prompts.
- **Phase 3 — Sunday morning: Motion laws.** The 12 principles where missing (squash & stretch, follow-through, anticipation),
  three paces, never in sync, intentional vs accident, the right look of every move (a cartwheel faces the camera). **Done when**
  measured on fights, walks and everyday scenes without downgrading the passed moves.
- **Phase 4 — Sunday afternoon: original moves + the benchmark.** Luna writes key poses for moves nobody taught, through the same
  loop. Arthur's fresh benchmark, the honest "can't yet" list, then the app copy review. Engine freeze Sunday night.
- **Phase 5 — Monday: bugs Arthur finds + cost tuning.** Nothing else.
Order of sacrifice if time slips: Phase 4 originals first, then fancy backgrounds. Everyday, fights, chases and honesty never slip.

## The regression net
Every scene Arthur passes is saved as a measured gate case; every round compares before/after; a number that gets worse blocks the
round. Plus the moves tests, the type check and the 30-prompt benchmark score. Run: `harness-phase4/gate-score.sh`.

## Process
One owner for the core path per round; other helpers touch content only (symbols, moves, scenes). The PM runs real prompts through the
whole chain every hour, not at the end. Rounds ≤ 1 h 30; fresh prompts at every review; nothing runs while Arthur reviews; the app
copy only when Arthur says the videos are good. Money: ≤ $5/day of test calls; 2–5 ¢ per animation in the app.

## Stop rule
If at the end of Phase 0 the ten scenes cannot pass without Luna, the engine's hands are the fault — say so that night and fix exactly
that before any Luna work. No new copies, no new paths.
