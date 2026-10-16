# SPEC-0025 — Kimodo AI Animator, live Oct 20

Status: direction chosen by Arthur + dad on 2026-10-15 (after the Kimodo test). This spec **replaces SPEC-0024's engine plan**. SPEC-0024 stays only as history.
Owner: PM (Claude). New work goes in a **new app copy**. The old copy `diamond-review/claude-app` is kept as a backup (`backups/engine-oct15-roundA-plus.tgz`, label "before Kimodo") and is not deleted.

## The goal in one sentence

The user types "animate this", and **Kimodo** (NVIDIA's text-to-real-human-motion AI) moves the bodies like real people. Our engine turns that motion into **editable 2D stick-figure frames** and adds the hits, objects, effects, backgrounds and camera.

## Why we switched (the test on Oct 15)

On the same prompts (fall, sweep, dig, ball pass, fight), Kimodo's motion was clearly more real than our hand-made engine: real weight, gravity and balance. Arthur, dad and Arthur's sister all agreed.

Kimodo learned from 700 hours of real motion capture. We stop hand-making motion.

## What we keep, delete and add

**Keep:**
- The app, the timeline and frame editing.
- The Claude chat brain.
- Objects, effects, backgrounds and symbols.
- The contact solver (hands meet, fists land).
- Story memory.
- The 3D → 2D idea (our founding vision).

**Delete from the engine:**
- The hundreds of hand-made move recipes, pose fixes and tumble/ragdoll code.
- Most of the laws.
- The 7-second plan-card flow.

These are archived, not lost.

**Add:**
1. **Kimodo service.** Kimodo runs on a rented graphics card (Modal), costs about 1–5¢ per 15-second clip, and caches every motion so a repeat is instant and free.
2. **Dots → stick figure.**
   - Take Kimodo's 3D joints and keep our 11 stick joints.
   - A camera chooses the view: side by default; front or circling for cinematic shots.
   - Then 24 fps frames.
3. **The few rules (laws).** Arthur:
   - The head always sits on the neck.
   - Feet stay on the ground, no floating.
   - Nothing teleports.
   - A punch really lands on the other person, and every hit gets a reaction.
   - Things held stay in the hands, and tools touch what they work on.
4. **The director (many people).**
   - Claude writes who stands where and which motion sentence each person does, and when.
   - The engine asks Kimodo for each person with targets ("right fist at his head at 2.1 s").
   - The person who is hit plays a real "gets hit" motion at that moment.
   - Fighters and passers always face each other.
5. **"Animate this" chat.**
   - No 7-second skeletons to approve.
   - Claude quietly plans and animates, and only asks when something is truly unclear.
   - Long stories are split into scenes behind the scenes.

## The 4 build days: one phase per day, each with a milestone Arthur can check

Symbols and backgrounds run as a **parallel track from Oct 16** with one light helper (drawing code, little RAM). They are separate from Kimodo, but they show in every video, so they must not wait until Day 3 (Arthur, Oct 15).

| Day | Main phase (Claude) | Parallel track (1 helper) | Milestone (what Arthur sees) |
|---|---|---|---|
| **Thu Oct 16** | **1. Kimodo engine core** | **Symbols**: fix broken ones; things look like what they are | In the new app copy, type "a man trips and falls flat": Kimodo makes the motion and it lands on the timeline as editable stick-figure frames. The head is on the neck and the feet are on the floor. Also walk, run, sweep and dig. |
| **Fri Oct 17** | **2. Many people + things** | **Backgrounds from the words** | The fight director: fighters face each other, punches land, the loser reacts and falls. A ball pass where the ball is caught in the hands. Tools in the real hands. A pre-checked batch. |
| **Sat Oct 18** | **3. Camera + "animate this" chat** | Symbols and backgrounds polish from Arthur's review | The camera (side, front, follow, circle). The simple chat: type, then animate, then edit. Long stories are split into scenes. 10 fresh stories end to end. |
| **Sun Oct 19** | **4. Review, cost, lock** | 50 fresh prompts, pre-screened, with only passes shown. Checks on cost per clip vs credits and on wait time. Fix day. Arthur + dad final OK. Commit/push only with OK. |
| **Mon Oct 20** | **Launch** | Beta users. |

## Needed from dad (before Phase 1 can finish)

- A **payment method on Modal** (modal.com → Settings → Billing), plus a spending limit of about $10/month.
- **Meta's "yes"** for Llama 3 on Hugging Face (already requested Oct 15, pending). Kimodo's text reader needs it.

Without these two, Phase 1 can still build the engine side using motions saved from the free demo, but real users can't animate.

## Risks and the honest plan for each

- **Meta approval is slow.** We keep building with saved demo motions. If it's still pending on Oct 17, we look at Kimodo's other text options.
- **Wait time is 30–90 s per clip.** The animating card shows progress. Common motions are made ahead of time and cached (instant).
- **3D → 2D looks odd when someone turns around.** The camera picks the side that shows the action best.
- **Cost.** It's about the same as the current Claude call, inside the 2-credit action. Checked on Oct 19.

## Rules for every day

- Back up before every round.
- Before/after comparison on every change. Claude watches every video, including passes.
- Arthur sees only pre-checked videos, never known-broken ones.
- Tasks are 30–60 min each and never over 1 h 30.
- Max 3 helpers. One heavy job at a time. Watch RAM: the 8 GB Mac gets laggy.

## Oct 16 — progress, decisions and the ONE plan (PM v2 AI Animator; read this first)

**Arthur's phase list (Oct 16, replaces the day table above where they differ):** 1 = engine director for 2+ people (Oct 16–17) · 2 = things: tools + symbols + backgrounds together, must work with 3D (Oct 17) · 3 = camera (circle the fighters, zoom out, quick cut to a face) + "animate this" chat (Oct 18) · 4 = final check: review, cost, lock (Oct 19) · launch Oct 20. Reviews: ~10 videos each; rounds 1 h (30 min follow-ups); fix sure bugs yourself, give unsure ones to Arthur, never show known-broken videos.

**Rule (Arthur):** Kimodo is the animator; the engine is only the DIRECTOR — it may decide where/when/how hard, never change Kimodo's poses. "It's 3D motion that looks 2D": keep everything 3D and flatten with one camera at the very end.

**What exists (app copy `/Users/arthurcarlin/Projects/diamond-review/kimodo-app`, not merged, not committed):**
- `src/lib/animator/moves/realMotion.ts` — pass-through of Kimodo joints; `timeMap` (director's clock), true 30→24 fps picture times, ease-in from the real clip start, `StageView` (one 3D stage: uniform whole-stage scale, camera turned 18°, depth draw order).
- `src/lib/animator/kimodo/director.ts` — `directBeats` (plan.beats by/on/result: hit|block|touch|sync|react): finds real moments, lines clocks up, hits land at the striking height (head/chest/stomach), bodies ≥0.3 H apart, touches meet in the middle; for clips made together (`stage` field) it only puts both on the stage (no 2D slide/snap/warp). `director.test.ts` (3 tests).
- `src/lib/animator/kimodo/library.ts` — saved clips (`motions/*.json`, 24 fps 14 joints + `hits`, `limbs`, `stage`). Clip sets: `d-*` (Phase 1 singles), `r-*` (Session A reactions), `s-*-a/-b` (Session A2/A3 duets).
- `src/lib/animator/engine.ts` — ground check on the drawn real-motion figure; stage depth draw order. `render.ts` — light halo for dark figures on dark scenes (`style.halo`, set in moves/plan.ts via effects/ground.ts `darkBackdrop`).
- Kimodo on Modal: `/Users/arthurcarlin/Projects/diamond-review/kimodo/kimodo_modal.py` (`generate(prompt, duration, seed, constraints, num_samples)`, L4, **max 5 GPUs at once** — dad's Oct 16 "10 GPU limit" email = Starter-plan concurrency, not a bill; no upgrade needed). `make_clips.py`: `duo` (singles), `react` (reactions with root2d knock-back, best of 3), `duet` (3 passes: attacker → reaction → contact pass with end-effector constraint; env REACT_SEED / CONTACT_SEED), `roundtrip` (safety test: PASSED, hand 0.0 cm). HF token only in Modal secret `huggingface-secret`.
- Review harness: `/Users/arthurcarlin/Projects/diamond-review/harness-phase4/review` — `bash sheets50/render-k.sh "$PWD/sheets-p1/<SHEET>.json" <id>` (laws + picture sheet + webm + videocheck); sheets Q (Phase 1), R (Session A), S (A2/A3), CAM. Recorder draws a still background once (teach.ts) and records VP8.
- Boards: local http://127.0.0.1:3300 (`/Users/arthurcarlin/Projects/diamond-review/board`, preview config "ai-board"; `board.py log|task|run|set|usage <weekly> <5h> <resets> <context%>`; tiles: RAM, CPU, chat memory) + cloud copy https://claude.ai/code/artifact/UXEM4wCkn7Pye2WzCYDnKZ (db `board/status`: ramGB, cpuPct, contextPct, usagePct, next, review, blockers). Resume note: `board/RESUME_PHASE1.md`.

**Reviews so far (all NOT pass):** Phase 1 duos (timing off, weak reactions) → Session A reactions made for the hit (strength mismatch, combo punched air) → A2 one plan + 3 passes (contact 0–4 cm in 3D, but drawing squeezed fighters: per-person 2D) → A3 one 3D stage + camera (Arthur: "not a pass — good with one stick figure, not with multiple; needs high fives, handshakes, real reactions").

**Root cause (audit Oct 16, agreed with Fable):** every version generated each person ALONE and lined them up; the receiver ACTS "gets hit" — nothing in his body is moved by the hit; touches meet at one picture only.

**THE ONE PLAN for Session A (proposed to Arthur Oct 16 12:50, waiting for his OK) — an interaction layer on the same pipeline, not a restart:**
1. Every interaction = a contact script on the shared 3D stage: which joint of A touches which joint of B, when; hits carry an impulse (speed × strength 1–5).
2. Touches (handshake, high five, fist bump): BOTH people generated with end-effector constraints pinning their hands to the SAME world points at sparse keyframes (start, 2–3 mids, end).
3. Hits: the receiver gets FULL-BODY keyframes (in-distribution for Kimodo): impact frame = his own pose moved so the struck part is at the real fist point, + 1–2 follow frames pushed along the punch by the impulse; root2d only a loose clamp. Do NOT bet on pinning Head/Spine with end-effectors (model trained on hand/foot only — "rubber neck" risk).
4. Checker: contact <3 cm at every scripted frame AND receiver displacement within ±30% of the impulse; alternate A→B→A max 2 rounds, best of 3.
5. Templates: punch, kick, push, block, handshake, high five, fist bump; grab/hug "not yet".
Order: A4 touches (1 h) → A5 caused hit reactions + one 3-person scene (1 h) → ~10-video review → Session B many people (chains per contact pair, in parallel; Fable) → Phase 3 camera. Confidence ~70% (Fable + PM).
**Open bugs:** shove stage S negative (wrong push moment picked); uppercut reaction no longer falls with margin-only root path (keep full path for strength 5); punch-then-kick contact 14.6 cm.

**Session A4 result (Oct 16 13:45, interaction layer step 1 — touches):** `make_clips.py::touch` (pass 1 both act alone → stage S so reaches meet, hips ≥0.7 m apart → meeting points halfway at sparse keyframes → pass 2 both pinned with end-effector constraints + a smooth walk-up root2d path to the touch spot; best pair = hands together over the whole span, no pops). `director.ts` stage camera now looks ACROSS the pair at the contact moment (+18°) — this also changes the fight scenes (re-render S.json before showing fights). PASS (on board k-p1u for Arthur): handshake (hands ≤10 cm for the whole shake), high five (≤7 cm). FAIL, left out: fist bump walking (they end side by side, walked past), standing fist bump (S 0.72 m: too close, tangled — the 0.7 m hip rule must also hold during pass 2, check the 3D hip gap per picture in the scorer), double high five (two end-effector sets at once did not pin — try one combined "end-effector" with both hand names), jumping high five (runners: S 10.5 m — clamp the walk-up distance). Next: A5 caused hit reactions (full-body keyframes) + these fixes.

**Oct 16 14:00 — research verdict (PM + Fable) and the proposed GROUP ENGINE (waiting for Arthur's OK):**
- No better AI at our cost/license: Uthana text-to-motion $0.02–0.10 per SECOND, single person; DeepMotion/Krikey quote-only, no multi-character text; HY-Motion excludes the EU; two-person research models use non-commercial data. BONES-SEED (Kimodo's 700 h training data, huggingface bones-studio/seed): usable by startups <$1M revenue incl. fine-tuning, BUT generative models whose primary purpose is generating motion data are restricted and it has no two-person captures → do NOT train a two-person block on it.
- GROUP ENGINE = coupled sampling (InterControl, NeurIPS 2024 — single-person diffusion + per-step joint control + LLM contact plans; 0.84 cm contact error, 81% preferred): all N people in ONE Kimodo batch, our own loop over `denoising_step`; from ~30% of the steps on, decode each person's pred_clean to joints and refresh every person's conditions (`create_conditions_from_constraints_batched` → observed_motion/motion_mask, re-encoded each step) from the contact script (hands to the same points, receiver's struck part at the attacker's current fist + impulse push, spacing ≥0.7 m, face the partner); Kimodo post-opt at the end. Only if contact >3 cm: 5–10 L-BFGS/Adam iterations on pred_clean through the FK decode in the last 50% of steps (loss ReLU(d−d′) contact, ReLU(d′−d) spacing, facing). Never a head pin alone for hits. The coupling layer is OURS and model-agnostic (Kimodo = swappable prior). Cost ≈ 1–3¢ per 15 s for all N people in one GPU call. Risks: conditions encoded once before the loop (must re-encode), differentiable FK for step 2, memory for N=10 on L4.
- Sessions: G1 (1 h) = N-person batch + per-step refresh; handshake + punch; measure vs A4. G2 (1 h) = guidance if needed + a 4-person scene. A4 sequential passes stay as the fallback. Confidence: beats A4 by Oct 20 ~60%; best known path at this cost and license ~90%.

**Oct 16 evening — PM v3 (FINAL plan, Arthur 19:05):** Kimodo animates every figure ALONE; NVIDIA ARDY (streaming cousin of Kimodo, same data, free weights) animates ONLY the contact moments, continuing from Kimodo's last pose; the switch must be invisible (kimodo/seam_check.py). Rejected today: G1 per-step coupling (teleports), leader-follower with Kimodo (late/weak/floating — floating was a real bug, fixed: each figure's own floor in realMotion.ts), AI video → pose (jitter, slow-mo). Research: no AI makes 2+ interacting people at Kimodo cost with a commercial license; retraining Kimodo for two = after launch. Blind test singles: Kimodo 5–ARDY 4; two figures: ARDY preferred. Ready to run: kimodo/live.py (handshake, punch). BLOCKER 19:18: Modal workspace disabled (dad: billing). Full brief: diamond-review/board/HANDOFF_MESSAGE.md.

**Oct 16 night — PM v4 overnight (Arthur 21:25: fix handshake bounce + punch wind-up, then high five, fist bump, push, block, combo; ≤$10 Modal; only passing videos on the board):** `diamond-review/kimodo/live.py` v2 (v1 kept as `live_v1.py`).
- ROOT CAUSE of the bounce (ARDY source, `interactive_demo/constraints.py`): every hand target ALSO pins the Hips ("Always include Hips"). v1 slid the hips UP/DOWN a different amount at each target → the body bobbed. RULE: targets slide the hips only forward/sideways + ONE steady height per figure (≤3 cm). Result: hip bob 1.5 cm.
- Second cause found: different ARDY seeds made the two shakes pump out of step (hands 17 cm apart between targets). RULE: both people of a touch use the SAME ARDY seed; targets only while both arms are really out (reach ≥85% of the peak), every 3 pictures.
- Wind-up RULE for every move: `say(anticipation, action, follow-through)` writes all three in order; strikes pick the best of 4 takes by measured wind-up (fist moves back first) + strike speed; pass 2 keeps the best wind-up among takes that land (<6 cm).
- New moves: high five, fist bump (touch), push (both hands on the real chest, one shared hips slide), combo (jab, jab, cross pinned on the real head of the reaction piece), block (defender's hand pinned just in front of the real fist, the hand on the fist's side).
- Reliability: Modal calls hung once (no machines, "Deadline exceeded") → every call has a 15-min deadline + 1 retry (`calls()`).
- Results by 00:50 Oct 17 (all switch checks OK, laws pass): handshake (hips bob 1.5 cm, hands ≤3.4 cm), high five (redone: quick slap above the heads — first one met at head height and hovered 0.9 s), fist bump (0.5 cm), block (forearm 0 cm on the real fist), combo (3 hits 9–12 cm from head centre = on the face; cross 6.5 m/s, 27 cm wind-up), punch (31 cm wind-up, lands 2.1 cm, 4.0 m/s).
- Rules learned tonight: (1) wind-up sentences need 4-s clips (the punch comes ~2.5 s in); (2) a strike take only counts if ≥3 m/s AND its real fist reaches the target with hips ≥0.6 m apart; (3) pass 2 re-makes the take from the SAME seed and ALSO pins the take's own pulled-back pose — a new seed / no wind-up pin lost the wind-up every time; (4) clips start 1.6 s before the first hit (`kimodo/trim.py`) and the app shows such mid-action clips without the 0.3 s ease-in from standing (`midAction`, realMotion.ts); (5) `seam_check.py`: a reaction that builds up over pictures is OK, only one-picture spikes are teleports; (6) one Modal job at a time — two at once stalled twice (0 machines).
- Push wording: "pulls both hands back…" = weak shoves (≤2.7 m/s); "steps forward, then shoves…, then steps back" = 3.3–3.9 m/s.
- Oct 17 01:55 — overnight result: 6/7 pass (card k-lv2: handshake, punch, high five, fist bump, block, combo). PUSH NOT DONE (stopped, waits for Arthur): every strong ARDY shove (16 takes, 2 wordings) happens face to face — heads 0.13–0.22 m apart before the shove, and the aim pass pulls them closer (0.13 m = heads overlapping). New rule kept: strikes need heads ≥0.4 m apart before the hit (`heads` per move). Possible fixes to propose: the receiver's guard piece stands back (a root path) so the pusher has to step in from further; or reach-in wording ("reaches out and shoves from arm's length"); or Kimodo for the pusher (single figure) with ARDY only for the reaction.
