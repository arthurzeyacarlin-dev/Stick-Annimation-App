// THE TIMING CARD (SPEC-0019 v2 Phase C3, Sun 2026-10-11 — Arthur: "Red high fives HYPERSONICALLY, like Sonic", "why so SLOW
// eating — drinking is the slow one", "everything moves at a natural accelerating/decelerating pace, never hypersonic, unless the
// user explicitly asks"). ONE table of everyday paces, in real seconds, that the moves read and the measurer checks against.
// A move that needs a pace takes it from here — never its own private number — so "how fast is a sip" has one answer.

export const TIMING = {
  // DRINKING IS THE SLOW ONE: the cup comes up slowly, tips at the mouth for a sip, goes back down eased.
  drink: { up: 0.9, sip: 0.6, down: 0.8 }, // (= moves/interact/bringToMouth.ts MOUTH_PACE.drink, helper X)
  // EATING AT A NORMAL PACE: hand to the mouth, a quick bite, hand down — about 1.1 s a bite.
  eat: { up: 0.5, bite: 0.15, down: 0.4 }, // (= MOUTH_PACE.eat: 1.05 s a bite)
  // WAVING: 2–3 waves, each side-to-side swing about 0.4 s.
  wave: { each: 0.4, min: 2, max: 3 },
  // THE HIGH FIVE at a human pace (both figures): wind up, swing, slap, follow through, arms come down eased.
  // The PARTNER's hand (pinned to the mover's palm by a contact in script/compile.ts) comes up over `partnerUp` and goes back
  // down over `partnerDown` — the same pace as the mover's own wind-up + swing and follow-through + arms down.
  highFive: { stepIn: 0.25, windUp: 0.42, swing: 0.32, press: 0.08, follow: 0.45, armsDown: 0.62, partnerUp: 0.95, partnerDown: 1.25 }, // (new copy, Arthur 18:50: "a bit faster" — still under HAND_SPEED_MAX) // (SPEC-0021 phase 3: Claude's high five still swung a hand at 3.7 H/s — every phase ~1.45× longer, under HAND_SPEED_MAX)
  // WAITING (idle life): a slow breath and a tiny weight shift, the head level — never a drunk sway.
  idle: { beat: 0.6, shift: 0.02, headDeg: 2, kneeDeg: 7 }, // (beat: the breath rhythm; amplitude is what made it look drunk, not the rhythm)
} as const;

// THE NATURAL SPEED LAW (gate law "tooFast", script/measure.ts): outside fights, strikes, falls and flights, no hand or foot moves
// faster than an everyday human limit (x height a second, peak over two pictures) — unless the words ask for speed.
export const HAND_SPEED_MAX = 2.5; // H/s: an everyday reach, wave, high five, pick-up, sip
export const THROW_SPEED_MAX = 4.0; // H/s: a throw's release (the ball must leave at its flight speed: an easy toss ≈ 3 H/s)
// ...and every move eases in and out: a hand or foot that is (nearly) still — under STILL_SPEED — and two pictures later is
// moving faster than STILL_SPEED + SPEED_JUMP_MAX (or the other way round: fast, then a dead stop) has no ease: a snap, not a person.
// (Speeds over two pictures at 24 fps; the jump is scaled to 24 fps.)
export const STILL_SPEED = 0.3; // H/s
export const SPEED_JUMP_MAX = 1.8; // H/s within two pictures (gate scene 3, the witch reaching into the stir right after her walk, measures 1.6: a passed move sits under it)
// The words that ask for speed (the law then steps aside for that scene).
export const FAST_WORDS = /\b(fast|faster|quick|quickly|hurry|hurries|hurried|rush|rushes|rushing|speed|speedy|sprint|lightning|hyper|zoom|race|races|racing|instantly|snap)\b/i;
// The moves that are fast on purpose (exempt): fights and strikes, falls, flights and jumps, runs, and anything thrown or blown.
export const FAST_MOVES = /punch|kick|jab|hook|uppercut|slap|block|dodge|strike|hit|getHit|clash|barrage|combo|dash|fight|fall|trip|knock|faint|blown|fly|flight|float|jump|leap|flip|cartwheel|run|flee|chase|electro|power|blast|spin|slam|grapple|lift|transform|ice|laser|fire|grenade|sword|weapon|parry|landing/i;
