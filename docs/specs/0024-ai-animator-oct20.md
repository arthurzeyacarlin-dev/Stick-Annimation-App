# SPEC-0024 — AI Animator, done by Oct 18–19, live Oct 20

Status: approved direction (Arthur + dad, 2026-10-13/14). Replaces the old AI Animator specs (moved to `old/`: 0004, 0005, 0008, 0015, 0017, 0019, 0021).
Owner: PM2 (Claude). Engine work lives in the app copy `/Users/arthurcarlin/Projects/diamond-review/claude-app` until Arthur accepts it.

## The goal in one sentence

Type any stick-figure story, and the AI Animator plans it with you in blocks of about 7 seconds, then animates each block with no broken moves, good backgrounds and symbols, and never a red error.

## What the user sees (the AI Animator = a hidden project manager)

1. The user tells the story. The AI acknowledges it warmly, asks questions if needed, and honestly says if the story hits a Version 1 limit (and when V2/V3 removes it).
2. It explains the process: we build the story block by block, each about 7 seconds (not exact). This means nobody pays for a long animation they don't like.
3. For each block: a **plan card** appears → "Accept or tweak?" → the user tweaks (e.g. "make him red", "white background") → **Animate** → a progress bar (it quietly searches the internet if needed) → the block lands on the timeline → small edits → next block.
4. It recommends transitions at the right moments and answers questions at any time.
5. Edits change only what was asked; everything else stays.

## How it works behind the scenes (our own "Blender made for AI")

Claude is the animator who sets the key poses; the engine is the rig, physics, drawing and laws.

- **One plan, three sheets** in a strict format (it can't be broken):
  - **World sheet:** the background, layers, lighting, camera.
  - **Symbol sheet:** each thing built from simple, editable shapes (tree, grenade, hammer, spikes, car…). Made from the words, never hard-coded.
  - **Motion sheet:** the key poses, timing, strength, contacts ("hand holds ball", "feet planted"), and who is in front.
- **Contacts are rules the engine solves every frame:** held things follow the hand, let go cleanly, high-fives meet, feet stay planted, ropes stay in the hands.
- **Story memory between blocks:** the same characters, the same props, who holds what, where things are.
- **The laws check every video; auto-repair fixes it quietly.** The user never sees a broken video or an error message.

## Must animate

Falling, fighting, explosions, figures driving and chasing in cars, machines, sports, daily life, stories with cuts, close-ups and transitions; backgrounds like an image generator (but editable and animatable).

## Arthur's laws (full list: `diamond-review/harness-phase4/review/sheets100/CRITERIA.md`)

No broken or unnecessary moves, no in-betweens of doing nothing, no floating (except in space), no duplicates, no teleporting, nothing late. Anticipation goes opposite the action; strength matches the result; everything has a cause; real contact without glue; real sizes and facing; depth/layers; calm water and a straight horizon; nothing cut off; natural things irregular. **NEVER hard-coded outputs.**

## Plan by day

| Day | Build |
|---|---|
| Oct 14 | This spec + the board; then contacts as engine rules + story memory |
| Oct 15 | Going behind (layers), causes, digging/painting, smart symbol + background maker |
| Oct 16 | Project-manager flow: chat → plan card → tweak → accept → 7-second block → next block; transitions |
| Oct 17 | Cars, chases, machines, falls; story camera (close-ups, cuts) |
| Oct 18 | Big review: ~50–65 fresh videos (pre-checked by me) + the app copy |
| Oct 19 | Fixes, lock, Arthur's OK, commit/push |
| Oct 20 | Live |

## Rules for working

- Short plan → Arthur OKs → build → test → Arthur reviews. No programming without Arthur's OK.
- Every fix is a broad rule that helps future animations, with a test.
- The lost-ball basketball story is a permanent test: replay, save/reopen, export after every engine change.
- Reviews use fresh, never-seen sheets; I watch every video first; ≥90% must pass.
- Every programming task 30–60 min, max 1 h 30 (Arthur, Oct 14).
- Usage: medium effort when planning, high when programming. Mac RAM: slow down parallel work above 7.3 GB of 8; one heavy job at a time.
- No commits, pushes, paid AI calls or deploys without Arthur's OK.

## Board

The live board (artifact) shows each day's phase, tasks, next task, blockers, the latest review score, usage and RAM. Every helper reads it first and ticks off its tasks.
