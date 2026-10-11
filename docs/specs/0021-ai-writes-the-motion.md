# SPEC-0021 — The AI Writes the Motion

Status: RESTARTED in a new copy (Sun 2026-10-11 18:35, Arthur) — see "THE NEW COPY" at the top; the old copy diamond-engine is REJECTED
Owner: Arthur (decisions with his dad)
Implementer: Claude (PM2, AI Animator engine)
Created: 2026-10-11
Last updated: 2026-10-11
Decision links: dad's approval of the direction and a $20 Claude test budget (chat, Sun 2026-10-11)
TODO IDs: none yet
Baseline: engine copy `/Users/arthurcarlin/Projects/diamond-review/diamond-engine` (not git); backup `backups/diamond-engine-before-unasked`
Last verified: Phase 2 checked Sun 2026-10-11 17:25 (engine copy, not git): sheets build in strict mode, laws run, gate 9/10 (same as before: scene 7 pan grab jump)

## THE NEW COPY (Sun 2026-10-11 18:35 — Arthur: "start over… 100% Claude, 100% math… like it was last time")

The first copy (diamond-review/diamond-engine) is REJECTED: half Luna, half Claude; its later layers (the verb compiler, the
contact solver that bent arms, the zoom-after-measure fixes) made motion worse — the Claude high five broke its arms. It stays
on disk as a backup only (REJECTED.md inside).

**New copy:** `diamond-review/claude-animator`, a git worktree on branch `claude/spec0021-claude-animator`, from main aa2e907 —
version 1's Oct 7 engine (SPEC-0017 Phase 2/2C moves library, fights, effects, published D-0181/D-0182) plus the published app
work since. The motion sheet = VERSION 1's PLAN FORMAT (characters with library moves, params, `sync`, objects, effects,
background) — what version 1 wrote by hand and what Claude will write. Edits ("make the jump 1 s, not 3 s") change that sheet.

**Carried over, as checkers or human-pace fixes only** (nothing that changes motion by itself):
- `laws/measure.ts` — THE LAWS (all of them), checker only, + `laws/propBox.ts`, `things.ts` (the drawn-things catalog,
  data), `moves/timing.ts` (the timing card).
- `moves/highFive.ts`, `moves/celebrate.ts` — version 1's moves with the human-speed timing (no hypersonic, no flinch).
Left behind: the verb compiler (script/compile.ts), the contact solver (world/), the old Luna path pieces.

**Phases (new plan):**
1. The new copy + laws as checker + a few animations Arthur reviews to confirm it animates like version 1. ← NOW
2. Connect Claude: writes the plan-format sheet → engine → laws → looks at 24 pictures → fixes only what broke (≤ 3) or refuses.
3. Claude's 20 brand-new animations → Arthur reviews.
4. Fix what Arthur fails until it passes his bar → then into the app (the chat at the bottom left).

Phase 1 PASSED by Arthur (18:50; "the high five a bit faster" → timing card windUp 0.42, swing 0.32, follow 0.45, armsDown 0.62,
still 23/23 laws). Phase 2 (18:51–19:02): harness review/claude22.ts — Claude writes VERSION 1's plan format (guide = the 60
library moves' own "about" texts + 5 of version 1's passed plans as examples) → new-copy engine → laws → Claude looks at the
24-picture sheet (teach.ts render) → fixes ≤ 3. 10 brand-new prompts: 5 PASS everything (walk + wave 9¢, trip + get up 6¢,
cartwheel + celebrate 8¢, tired runner 5¢, ninja tiptoe / look back / run 51¢ after 3 fixes); 2 made but Claude's own look said
not good (boxers end in a clinch, bodies touching; the fire wizard's enemy is never blown away, and flinches early) — not shown;
3 refused by the laws, all VERSION 1 MOVES vs Arthur's later laws: the jump's arms 3.6 H/s, the throw release snaps (2.3 > 1.8),
swordStep lasts 0.5 s (< 0.6). Spend total $3.00 of $20 (upper estimate). Next: those move fixes (they rescue every jump /
throw / sword prompt), blownAway reaction timing, then more prompts.
Phase 1 so far (18:35–18:50): copy made; laws run in it (17–23 laws per scene); 5 fresh prompts in version 1's format:
4 pass every law (meet + high five, run-jump-cheer, sneak-look-run, jab-punch-kick); ball passing has 1 left (the throw
release snaps right at the ease limit, version 1's throwCatch). Figures look small: version 1's zoom (bigFigures) only turns on
for AI plans (`pace` set) — Claude's plans will set it. Still to carry over: the Body judge (a checker), the pose book, the
grab/kick fixes if the moves need them.

## 1. Exact Goal

A user types a sentence ("a boy jumps over a box", "make a 30-second fight, fire versus water") and gets a good animation:
it shows exactly what was asked, with no extra moves, nothing floating, teleporting, duplicated or cut off, at a natural pace.
When the AI can't make it well, it says so honestly instead of showing something broken.

The change: **an AI becomes the animator.** It writes the motion for each animation itself, builds it with our engine,
checks it against the laws, looks at the pictures, and fixes only what is broken, a few times, the way Claude did by hand
when Arthur liked the results. The AI is no longer just taking a short order for a rule machine to animate.

Pass bar (Arthur): out of about 100 never-seen prompts (simple, complex, very complex), 15 or fewer fail his review.
Every review uses new prompts.

## 2. Current Behavior and Evidence

- Today: Luna (GPT, `gpt-5.6-luna`) writes a short verb script → `script/compile.ts` (rules) turns it into motion → laws
  measure → Luna looks once and may rewrite the script once. (code verified)
- Benchmark 1 (Sun 2026-10-11, 75 fresh prompts, real Luna): **8 of 75 good**. 28 became videos; Arthur accepted about
  half; 47 were refused by the laws. (check verified; Arthur's review)
- Arthur's main complaint: about 80% of videos add moves nobody asked for. Audit (Sun 15:52–16:10) traced them to the rule
  compiler, not to Luna's script: a seated man stood up and walked to his laptop (seated rule D3), a girl ran past a log
  and turned back (run-up measured from the wrong spot), walk-stop-walk (two walk-ups), three knocks with returns between
  (three beats instead of one ×3). No law compared the moves with what was asked. (code verified, replayed)
- When Claude programmed scenes by hand (Oct 5–8) with looking and fixing, Arthur liked the results. (Arthur's reviews)

## 3. Root Cause

The weak link is the **job split**, not the model: in the app, the real animator is a fixed rule compiler that never
looks at what it made. Each new kind of prompt needs new rules, and the rules add unasked moves. The by-hand results were
good because the animator wrote each scene's motion and looked and fixed. (fact: the audit; hypothesis to prove: an AI
in that role does as well through the API)

## 4. Scope

- A **motion sheet**: the data format the AI writes (section 6). Data only, never code that runs.
- A **builder** that turns a motion sheet into frames with the existing engine (rig, poses, moves, props, places, effects).
- The **loop**: write → build → laws (free) → look (paid) → fix only what is broken → at most 3 rounds → keep the better
  version → show it or refuse honestly.
- A **Claude provider** for the loop (Anthropic API, key loaded the way the app loads keys; never read, printed or committed).
- The test harness and review page for the 20-prompt test.
- Cost and time recording per animation.

## 5. Non-Goals

- No change to login, accounts, saving, user data, usage recording, the drawing editor or export.
- Not wired into the live app before Arthur's review passes (the app copy is reviewed only at the end).
- No Blender clip library (decided with dad, Sun 2026-10-11: not pursued for now).
- No model split test until the Claude loop works (dad: process first, then a cheaper model).
- No sharing between users yet (section 8 says how it would work later).

## 6. Design

### 6.1 What we keep (already built and approved)

- **The laws** (`script/measure.ts`): hand contact, sitting on the seat, held things at the hand and by the handle, one
  copy, nothing floats, no flashes, no teleports, everything animated, nothing cut off, natural pace, nothing unasked,
  nothing walks through solid things, and the rest in LAWS.md. Free to run, numbers not opinions.
- **Arthur's 120 approved poses** (pose book) and the **passed moves** (walk, run, sit, jump, flips, fights, throw/catch).
- **The Body judge** (joint pops, robot timing, fast-forward bits).
- **The drawn things and places** (chairs side-on, mugs with handles, campfires, rooms, forests, night).
- **Luna's lesson book** (`director/lunaLessons.ts`): becomes the animator's lesson book.

### 6.2 The motion sheet (what the AI writes)

Per scene: the place, the things (from the drawn-things list, where they stand, which way they face), the camera, and
per figure a timeline of **steps**. A step is one of:
- a passed move with settings (`walk to the chair`, `backflip`, `sit on chair1`): the engine already does these well;
- a key pose from the pose book or the AI's own joint angles, with a time and an ease (for anything new: typing, a
  handshake, warming hands at a fire);
- a hold of a thing (which hand, by the handle), a let-go, a hand-over;
- an effect (fire, rain, steam, a melt) with its timing.
The builder checks the sheet before building (names exist, times in order, poses within joint limits) and says what's wrong.

### 6.3 The loop

1. **Write.** The AI gets the sentence, the engine guide (moves, poses, things, laws, lessons, the sheet format) and
   writes a sheet. The guide is the same every time, so it is cached and cheap after the first call.
2. **Build** with the engine (one build: the camera framing happens before measuring).
3. **Laws** (free): every failure comes back as a plain sentence with the time and who ("the boy's foot goes into the box
   at 3.3 s").
4. **Look** (paid, only when the laws pass): a sheet of key pictures; the AI checks the user's sentence beat by beat
   (THE LUNA LAW: is each part TRUE in the pictures?) and lists anything extra, wrong or ugly.
5. **Fix**: the AI edits only the broken steps of its own sheet (small edits, like a user editing), never a rebuild.
6. Repeat up to 3 rounds. Keep whichever version is better (fewer failed laws, then fewer look problems). If it still
   fails the laws, refuse honestly with what couldn't be made.

### 6.4 Length

Cost and time grow with how much happens (beats, figures, shots), not with seconds. A long animation is made **shot by
shot** (each shot one loop), which also matches Arthur's finish line: add a scene, cut to a new place, edit one scene.

### 6.5 The app guides the user: core first, then build up (dad, Sun 2026-10-11)

Users don't know the cheap, reliable way to use an AI animator, so the app leads them through it:
1. **The core first**: a short clip (about 15 seconds, at most 30): the figures, the story, the moves. Cheapest, and the
   easiest to judge ("is this the direction I want?").
2. **Then build on it**, one step at a time: add a place or background, add things, recolor, add effects (fire, rain,
   a melt), make it longer by adding the next shot, cut to a new place. Each step changes only its own part, so the user
   pays only for the new part and never for a full redo.
3. **Before anything that costs credits**, the app shows the cost of that action (for example on the button), asks before
   a big one, and suggests a cheaper way when there is one ("make the first 15 seconds first, then add more").
4. **A refused or failed animation costs nothing.**
5. **Almost-free edits** (recolor, rename, move a thing) need no AI look and cost (almost) nothing.
This is app work for PM3 (app + website); this spec only makes the engine support it: per-shot building, edits that
touch only their part, and a cost estimate before each action.

## 7. Cost and Time

Estimates until measured in the test:
- one simple shot: about 10–40 cents with a mid-size Claude model, more with the largest; about 1–4 minutes;
- a 30-second scene of several shots: roughly the sum of its shots.
The test records the real cost and time of every animation.

The test budget is **$20 for Claude calls** (approved by dad, Sun 2026-10-11), tracked in the harness spend file and
refused when reached.

## 8. Making It Cheaper Over Time (the goal: a few cents an animation)

The more pieces exist, the less the AI has to write:
- **Caching**: the engine guide is cached; each animation pays mainly for its own new words.
- **A growing library of proven pieces**: when a piece passes the laws and Arthur's review (a typing loop, a handshake,
  a warm-hands pose), it is saved as a named move. Next time the AI uses the name instead of writing it.
- **Fewer fix rounds**: every fixed mistake becomes a law or a lesson, so later animations pass on the first try more often.
- **Cheaper models for small jobs**: once the loop works, test a smaller model for writing or for fixing.
- **Later, shared pieces between users**: only the motion pieces (poses, timing), never a user's words, drawings or
  projects; needs a privacy and terms check before it's built.
Target: a few cents per simple animation. This is a goal, not a promise; the test gives the starting point.

## 9. Phases (each ends with a check; nothing starts without Arthur's go)

1. **Spec OK.** Arthur and his dad read this and say yes or change it.
2. **The sheet and the builder.** Claude (in this chat, no API cost) writes 5 sheets by hand for fresh prompts; they build
   and pass the laws. Proves the format can express good animations.
3. **The loop with the Claude API.** The same steps automated, with cost and time recorded.
4. **The test.** 20 brand-new prompts (simple, complex, very complex) through the loop → the review page → Arthur reviews.
   Report: how many good, real cost and time per animation.
5. **Decide.** Keep going toward the 100-prompt bar, try a cheaper model, and what launches on Oct 20.

## 10. Tests and Checks

- The 10-scene gate (`script/scenes10.test.ts`) stays green for the old path until it is retired.
- Unit tests for the sheet checker and the builder.
- Every review uses new prompts; the old ones only in a hidden gate.
- Nothing runs while Arthur reviews. Rounds are undoable (backup before each round).

## 11. Risks

- The API animator may do worse than Claude-by-hand (no long chat with Arthur, fewer looks). The test shows it.
- Cost could start above the estimate. The budget cap stops spending; the report says the real number.
- Oct 20 is close: if the loop isn't passing by then, the AI Animator launches labeled beta or waits (decision in phase 5).

## 12. Open Decisions

- Which Claude model for the loop (start with a mid-size one; compare with the largest on a few prompts).
- Whether the AI Animator launches on Oct 20 (beta) or waits for the pass bar.

## 13. Progress Log

### Phase 2 — Sun 2026-10-11, 17:00–17:30 (no AI money spent)

Built in the engine copy (backup before: `backups/diamond-engine-before-unasked`):
- **The motion sheet = the script plus**: exact positions (`x` as a share of the page width, `faces`), the animator's own
  key poses (verb `pose`, `keys`: pose-book ids like `handshake#1` or joint angles, `at`, `hold`, `seated`), the `type` verb.
- **Strict mode** (`CompileContext.strict`): the engine never adds a move. It may only lengthen the animator's own walk to
  end at the right spot; a missing walk, turn or stand-up comes back as a `needsMove` error. Story order: a beat starts
  after the beat before it. The animator's timing is kept (`pace: "asked"`).
- Runner: `harness-phase4/review/sheet.ts sheets21.json` (strict compile → laws → a run `teach.ts render` can draw).

Result on 5 brand-new prompts written by hand: **4 pass every law** (wave back, handshake, treasure chest, desk typing);
1 refused honestly (mug: it jumps 22 px at the grab and floats 1 px — the same root cause as gate scene 7's pan).
Fixed on the way: the resting mug was stretched to the scene's end next to the held one (moves/plan.ts handsOver did not
know a held catalog thing — `heldWeapon` — is the same thing); the client lifted his hand 2 s early (natural pace squeezed
his wait); both figures waved at once (story order). The Body judge still lists rough spots (fast elbow whips in the wave,
the library walk's stiff back and knee pops, the typist's free hand) — the look-and-fix loop in phase 3 is for these.

Next (phase 3, on Arthur's go): the grab jump (one fix for the mug and the pan), then the Claude API loop with cost/time
recording, then the 20-prompt test.

### Arthur's review of phase 2 (Sun 17:20) and phase 3 start (17:26–17:36, $1.31 of the $20 spent, upper estimate)

Arthur: wave back FAIL (the friend reacts far too late), handshake FAIL (hands don't really hold), chest PASS, typing PASS;
plus two general bugs: reactions off timing, and hands not exactly on what they grab. Fixed: REACTION TIMING (another
figure's next beat starts as the one before winds down: max(start + 0.6 s, end − 0.5 s)); REAL HAND CONTACT for pose keys
(`touch` → a hand contact the engine solves and the hand law measures).

The Claude loop works end to end (`harness-phase4/review/claude21.ts`, model claude-sonnet-5-5, the app's own key with this
chat's key unset, every call in claude-spend.json, refused at the $20 cap): write → strict build → laws → LOOK (24 pictures,
the sentence checked beat by beat) → fix ≤ 3 rounds. First 4 prompts: 1 passed with a "good" look (wave goodbye, 15 s, ~7¢);
3 refused honestly — and in each one Claude's eyes found the true cause, which a sheet cannot fix because it is IN THE ENGINE:
- sitting from the side: the walker comes from behind the seat, passes through the backrest and stands on the seat before
  sitting (a person walks to the FRONT of the seat, turns, sits back) — the sit approach;
- the library high five swings at 3.7 H/s (the speed law refuses it) — the moves' human joint speed (bench 1 cause #1);
- a kick does not launch a ball (it creeps 20 px) — a kick needs a ball that flies (and Arthur's anticipation = output law);
- (and the grab jump of the mug / pan).
A side-on bench drawing was tried and REVERTED (it made gate scene 9's walk too slow and did not fix the sit). Gate 9/10.

Next (on Arthur's go): fix those four engine gaps (each one rescues many prompts), then the 20-prompt test.

### Fix round 1 (go 1) — Sun 18:11–18:20 (no Claude money spent)

- HUMAN SPEED: the timing card's high five ~1.45–1.7× slower (windUp 0.5, swing 0.38, follow 0.55, armsDown 0.75, partner
  0.95 / 1.25) and celebrate's action / follow / settle beats ~1.6× longer → Claude's high-five sheet passes the speed law
  (was 3.7 H/s). timing.test.ts updated to the new card. Still seen by eye: the partner BENDS his whole body sideways at the
  slap (the partner-hand contact pulls the torso) — next.
- A KICK SENDS THE BALL: a kick whose target is a ball object rests the ball until the foot's `hit` mark, then flies it in an
  arc (up eased out, down eased in), lands and rolls; hard / "far" ≈ 3 H, normal ≈ 1.6 H. Claude's kick sheet now passes.
- THE GRAB: the held picture is gripped, not centered — the offset is measured on the heldWeapon recipe at the grab picture
  and taken off: the mug no longer jumps (teleport law passes). Left: the mug floats 1.1 px on the table (on-support placement)
  and gate scene 7's pan still jumps 64 px (the pan is not drawn by that recipe).
- NOT DONE: sitting from the side (walk to the seat's FRONT, turn, sit back).
Gate 9/10 (unchanged), tsc clean.
