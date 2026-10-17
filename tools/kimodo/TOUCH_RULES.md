# TOUCH & TIMING RULES — the engine's book for people who touch or hit (Oct 17, PM v5 + Fable + critic; Arthur's reviews)

Arthur's teach-the-engine rule: every fix is a general rule (code + lesson + test), reused everywhere, never re-learned.
Kimodo itself is NEVER changed. Allowed: words, timed steps, which take we keep, hand/hip targets, the shared clock, placement, camera.

## 0. The root cause (never forget)
Touching looked bad for 3 PMs because the touch was never made by the motion AI: bodies were made alone and GLUED after (moved,
re-timed, held, hands pulled, arms re-solved). Every glue step shows as a snap / teleport / bounce / early-late.
- NEVER: per-figure clock warps, "holds", pulling hands together, re-solving arms with 2D IK at a contact, whole-pose pins,
  ARDY for contacts, gates that pass on centimetres the eye can't see.
- Timing must be DECIDED before generating ("director's stopwatch"), never discovered afterwards with one generic detector.

## 1. Hits (punch, kick, push) — `kimodo/beat_hits.py` (passed by Arthur: kicks, hook)
1. Attacker = Kimodo with TIMED STEPS: guard 1.0 s → strike 1.0 s → back to guard 1.6 s. Its real hit (limb arrival = first
   picture after the speed peak under half the peak speed) must fall inside the strike step. That hit time IS the beat.
2. Receiver = Kimodo made TO the beat: "stands still in guard" for exactly t_hit, then the reaction words; hips path (root2d) still
   until the hit, then knocked back only as far as the move is strong (punch ≤0.45 m, kick ≤0.7, push ≤1 step 0.5 m — Fable/Arthur).
3. CHECK, never stretch: the receiver's reaction must start within ±2 pictures of the hit; no flinch before (≤5 cm); knock-back ≤ cap;
   engine retries ≤2 (new seeds) — still off → shown as FAIL (later: "coming soon" for that move), never hidden.
4. ONE placement (struck part on the real fist/foot + body radius), camera STRAIGHT across the contact line (0°).
5. Shared-clock timing pass (same clock for BOTH people = no glue): slower wind-up, short hold on the loaded pose, fast strike
   (~1.6x), 2-picture impact hold, then normal. Arthur asked for anticipation + speed change.
6. TODO (agreed Oct 17 19:40): punches need hips ≥80 cm (guards overlapped at 67–74 cm in B1) + the fist travelling along the line
   between them; mirror the pair so the striking arm is the NEAREST arm on screen; push: pusher's hands stay on the chest 2–3
   pictures BEFORE the receiver's first step (cause before effect), "takes one step back" words.

## 2. Hand touches (high five, fist bump, handshake, hand-over) — `kimodo_modal.generate_follow` + `kimodo/touch_test.py`
1. Leader = Kimodo free (3 takes): keep the take with ONE continuous touch (never let go and grab again) and a clean let-go; for
   handshakes ≥2 visible pumps (≥8 cm). Never Kimodo's post-processing for touches (it pulled hands 20 cm apart).
2. The touch MOMENT is action-specific, never one generic detector: high five = hand HIGHEST while reaching forward; fist bump = fist
   furthest forward; handshake = grasp start + pumps. Never argmax on a plateau (holds) — use "first picture the hands are within 6 cm".
3. Follower = Kimodo from the SAME noise as its own free draft, with HAND-ONLY position targets (only the hand's own joints; hips and
   everything else = its own draft), SPARSE: arm start (its own rest hand), half-way, touch, let-go (+ every ~2 frames through a
   hold). Diffusion sees the targets ahead → its own anticipation and timing; the hands pump TOGETHER.
4. TODO (agreed Oct 17 19:40): aim at the SAME point (palm offset 0 — the 4 cm offset made "not holding hands"; accept ≤1.5 cm
   median in the hold); draw the two hand ends as ONE overlapping grip circle for the hold span (a look, not a motion);
   natural-arm check: reject follower takes with the elbow above the hand >3 pictures (B7 had 66) or above the shoulder for
   handshake/fist bump; test dropping the wrist ROTATION target (position only) if arms look twisted; 4 follower seeds per call.
5. Objects handed over = ONE object with ONE owner at a time (owner timeline; switch when both hands are on it) — never two copies.

## 3. The gate (what Arthur's eye sees) — run before he sees anything
- No 1-picture spikes (a joint moving >3× the pictures around it and >2 cm = teleport; a hand's acceleration spike = snap).
- No bodies inside each other (hips ≥45 cm; punches ≥80 cm before the hit). No hopping unless asked (one-foot-on-ground rule).
- Both people's moments within ±2 pictures; contact ≤3 cm in 3D and overlapping in 2D; hold: pump correlation ≥0.9, lag ≤1.
- Plus the eyes: every video checked on its picture sheet. Verdicts: PASS only if sure, FAIL only if clearly broken, else UNSURE.

## 4. Review rules (Arthur)
- Version 1 only: every review video is the engine's FIRST output for a fresh prompt (its own automatic retries are fine); never
  re-make the same prompt as v2, never hand-pick.
- ~10–12 videos per 1-hour round, a mix of actions; compare with the previous round by action type.

## 5. Infra lessons
- Modal: ONE job at a time; after `modal deploy` verify the new code runs (return a "ver" field) — warm/racing deploys served old
  code twice; `modal app stop -y` is not a valid flag.
- Cost: ~2–3¢ per touching pair (2 Kimodo calls ≈ 100 s each on an L4); a 12-video round ≈ 30–40¢.
