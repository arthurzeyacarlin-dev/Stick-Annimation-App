// EVERY LAW HAS ONE JOB (SPEC-0021, Arthur's audit, Oct 12: "it should be very rare that it ever says the animation could not be
// put on the timeline"). His swamp was refused although Claude's first try was a good animation: a length cap, trees past the
// page edge and a foot snap at a cut — preferences — were treated exactly like a broken body, and Claude spent every fix try
// squashing his 15-second walk until it really broke. So each law says what kind it is:
// - "broken": the animation is wrong (floating, teleporting, stretched bones, sliding feet, through the ground, a hit before the
//   punch…). ONLY these can ever stop an animation from being placed.
// - "taste": how it could be nicer (length, standing around, walking pace, things past the page edge, extra moves). These NEVER
//   stop an animation: the AI improves them once if it can, otherwise the reply says it in a short note.
// The ENGINE fixes some laws itself before the AI hears about them (claudeAnimator autoRepair: too fast → slower, past the page
// edge → slid in). kinds.test.ts checks that every law the laws file can report has a kind here — a new law cannot skip this.
export type LawKind = "broken" | "taste";
export const LAW_KINDS: Record<string, LawKind> = {
  animated: "broken", bones: "broken", feet: "broken", flash: "broken", floats: "broken", frames: "broken", ground: "broken",
  hand: "broken", held: "broken", hitTiming: "broken", honestHands: "broken", inFront: "broken", oneCopy: "broken",
  oneThing: "broken", rests: "broken", sit: "broken", sitFeet: "broken", sitShins: "broken", sitThighs: "broken",
  smooth: "broken", solid: "broken", hugsAir: "broken", ropeGrip: "broken", standUp: "broken", hazard: "broken", hitTouch: "broken", teleport: "broken", tooFast: "broken", travelSpeed: "broken", onPage: "broken", hitFelt: "broken", touches: "broken", touchIntent: "broken", contact: "broken", spinFollowsMotion: "broken",
  cutOff: "taste", inSync: "taste", length: "taste", longEnough: "taste", pace: "taste", statue: "taste", idle: "taste", unasked: "taste", facesWhoItGreets: "taste", strikeAtNothing: "taste", carefulWindUp: "taste", emitterCause: "taste", causeShown: "taste", contactConsequence: "taste",
};
// (an unknown law counts as broken — the safe side — and the test makes sure there is none)
export const lawKind = (law: string): LawKind => LAW_KINDS[law] ?? "broken";
