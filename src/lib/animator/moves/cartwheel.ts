import { buildRollTrack, rollShiftAt, type CharacterKey, type FootContact } from "../engine.ts";
import { forwardKinematics } from "../pose.ts";
import { STAND_FRONT, withPose, type PoseAngles } from "../rig.ts";
import { leadTheFall, SINK_BEAT, seenWeightArm, stackedBend, tempoOf, weightBend, wholeBodyTurnSeconds, type MoveOutput, type MoveSettings, type Stance } from "./motion.ts";

// SPEC-0017 Phase 3 (Arthur: "his arms and legs are supposed to make an X. He's supposed to SPIN"): a CARTWHEEL,
// seen from the front. Built on THE WHOLE BODY CAN TURN OVER (engine.ts `spin` + `roll`): the joints stay
// natural (arms up in a V, straight legs spread from the hips in an X — never the splits) and the WHOLE BODY
// turns a full circle in the picture, rolling over hand, hand, foot, foot — each planted where it touches.
// Anticipation (arms back down, the lead leg lifts and steps out into a lunge, arms swing up), acceleration
// into the turn, follow-through on the landing (knee bends, arms stay up), then it stands.
export type CartwheelParams = { direction?: "left" | "right"; distance?: number };
export const CARTWHEEL_ABOUT =
  "Cartwheel, FRONT view (the figure faces the viewer): arms back then up in a V, the lead leg steps out into a lunge, the WHOLE BODY turns a full circle sideways over the hands (hand, hand down on the floor, legs straight in a wide X over the top — never the splits), feet land one after the other, arms up, stand. `direction` left/right (default right); it travels sideways by rolling over its hands and feet (about 2.5 body heights; `distance` is not used yet). Marks `handDown`, `top`, `land`.";

export function cartwheel(start: Stance, params: CartwheelParams, settings: MoveSettings): MoveOutput {
  // (Facing the side, it cartwheels the way it faces unless told; the move is always drawn from the front.)
  const d = (params.direction ?? (start.facing === "left" ? "left" : "right")) === "left" ? -1 : 1;
  const tempo = tempoOf(settings);
  const h = settings.height;
  // Lead side = the side it travels toward (screen right = the figure's r side in a front view).
  const lead = d > 0 ? "r" : "l", trail = d > 0 ? "l" : "r";
  const pose = (o: { lS: number; tS: number; lE?: number; tE?: number; lH: number; tH: number; lK?: number; tK?: number; lean?: number; head?: number }): PoseAngles =>
    withPose(STAND_FRONT, {
      lean: d * (o.lean ?? 0), head: d * (o.head ?? 0),
      [`${lead}Shoulder`]: o.lS, [`${trail}Shoulder`]: o.tS, [`${lead}Elbow`]: o.lE ?? 0, [`${trail}Elbow`]: o.tE ?? 0,
      [`${lead}Hip`]: o.lH, [`${trail}Hip`]: o.tH, [`${lead}Knee`]: o.lK ?? 0, [`${trail}Knee`]: o.tK ?? 0,
    } as Partial<PoseAngles>);
  const V = 155; // arms up in a V
  // A BODY IS HEAVY (motion.ts): an elbow bends CLEARLY while its hand takes the weight; the weight moves hand -> hand
  // -> foot -> foot.
  // A BEND THAT CARRIES WEIGHT MUST BE SEEN (motion.ts `seenWeightArm`): each arm with the weight turns out at the
  // shoulder so its bent elbow sits out to the side, clear of the head, its hand planted a little wider than the shoulders.
  // (Knowing how far the body has turned, the bend stops before the head comes near the floor or an elbow touches it.)
  const bear = (p: PoseAngles, sides: ("l" | "r")[], bend: number, spin: number) => sides.reduce((q, s) => seenWeightArm(q, s, bend, "front", spin), p);
  const trailFoot: FootContact = `${trail}Foot`;
  const t0 = start.t;
  const keys: CharacterKey[] = [];
  let t = t0;
  // BIG WHOLE-BODY MOVES TAKE TIME (motion.ts): a key that turns the whole body takes at least the body's turning time.
  const key = (dt: number, p: PoseAngles, extra: Partial<CharacterKey>) => {
    const turn = extra.spin === undefined ? 0 : wholeBodyTurnSeconds(extra.spin - (keys[keys.length - 1].spin ?? 0), settings, extra.spinEase ?? extra.ease);
    t += Math.max(dt * tempo, turn); keys.push({ t, pose: p, x: keys[keys.length - 1].x, ...extra }); return t; };
  keys.push({ t: t0, pose: start.facing === "front" ? start.pose : STAND_FRONT, x: start.x, contacts: ["lFoot", "rFoot"], spin: 0, facing: "front" });
  // ANTICIPATION: arms swing down and back across, knees dip, the lead leg lifts.
  key(0.3, pose({ lS: -12, tS: -12, lE: 10, tE: 10, lH: 28, tH: 6, lK: 30, tK: 12, lean: -6 }), { contacts: [trailFoot], spin: 0, ease: "inOut" });
  // STEP IN to a lunge, arms swing UP into the V.
  // (The hips go where the planted back foot still reaches with this pose: the roll starts on it without a slide.)
  const lunge = pose({ lS: V, tS: V, lH: 34, tH: 10, lK: 22, tK: 0, lean: 4 });
  const trailAt = forwardKinematics(keys[0].pose, "front", { x: start.x, y: 0 }, h)[trailFoot].x;
  key(0.2, lunge, { contacts: ["lFoot", "rFoot"], spin: 0, roll: true, ease: "out", x: trailAt - forwardKinematics(lunge, "front", { x: 0, y: 0 }, h)[trailFoot].x });
  // ACCELERATION into the turn: tips over the lead leg, the back leg kicks up.
  key(0.16, pose({ lS: V, tS: V, lH: 30, tH: 40, lK: 6 }), { spin: d * 45, roll: true, spinEase: "in", ease: "in" });
  // (Arthur, round 2: "the body is really stiff ... when he's upside down his ELBOWS should bend a little — the
  // weight is on his arms": the elbow of the hand that has the weight gives, the knees stay a little soft; only
  // the X over the top is straight.)
  // (The first hand bends a little less as the weight comes onto it — the lead foot still holds some of it (a quarter
  // share): its arm still slants, so a deeper bend would put the elbow through the floor or drag that foot.)
  // HOW MUCH A SUPPORT GIVES (motion.ts `stackedBend`): the first and last hands, with the body still leaning off them,
  // give clearly less; upside down over BOTH hands the body is stacked right above them: the deepest bend.
  // THE SINK IS SLOW (motion.ts): the body eases down into that bend as the turn slows into the top, holds a beat at
  // the bottom (SINK_BEAT), then the turn speeds up again out of it.
  const handDown = key(0.12, bear(pose({ lS: V, tS: V, tE: 6, lH: 40, tH: 42, lK: 8, tK: 6 }), [lead], stackedBend(0.2), d * 100), { spin: d * 100, roll: true, spinEase: "linear", ease: "linear" });
  const stacked = (sp: number) => bear(pose({ lS: V, tS: V, lH: 42, tH: 42 }), [lead, trail], stackedBend(1), d * sp);
  // (The arms ease down into the bend; the turn slows to a crawl over the top for the beat, then carries on at speed.)
  const top = key(0.14, stacked(174), { spin: d * 174, roll: true, spinEase: "linear", ease: "out" });
  key(SINK_BEAT, stacked(186), { spin: d * 186, roll: true, spinEase: "linear", ease: "linear" });
  // A BODY TIPPING OVER LEADS WITH ITS WEIGHT (motion.ts `leadTheFall`): past the top it falls toward the landing
  // side, so the legs swing that way — the trail (landing) leg reaches for its spot, the lead leg follows.
  // WEIGHT HANDS OVER (motion.ts): from here the arms straighten as they let go while the landing legs start to give.
  key(0.14, leadTheFall(bear(pose({ lS: V, tS: V, lE: 6, lH: 42, tH: 40, lK: 6, tK: 10 }), [trail], stackedBend(0.3), d * 265), trail), { spin: d * 265, roll: true, spinEase: "linear", ease: "in" });
  // FOLLOW-THROUGH: the first foot lands with a soft knee, the turn slows to upright.
  const land = key(0.16, pose({ lS: 160, tS: 160, lH: 34, tH: 26, tK: 22 }), { spin: d * 330, roll: true, spinEase: "out", ease: "out" });
  // Upright: the lead leg closes in as it comes down, so it lands beside the first foot — FEET TOGETHER, the
  // normal stand's legs (the same legs from here on, so the feet never slide).
  const upright = pose({ lS: 165, tS: 165, lH: STAND_FRONT.lHip, tH: STAND_FRONT.rHip });
  // A LIMB THAT TAKES THE BODY'S WEIGHT BENDS (Arthur: "when he lands on his legs, the weight from his arms needs to
  // transfer to his legs"): as the second foot comes down the weight arrives on both legs — the knees give (bowing out
  // in the front view, hips opened so the feet stay exactly where they landed), then straighten as it stands.
  // (The hips open just enough that each foot stays exactly where the stand puts it, however much the knees bend.)
  const KNEES = weightBend(0.5);
  const footOff = (q: PoseAngles) => { const b = forwardKinematics(q, "front", { x: 0, y: 0 }, h); return b.rFoot.x - b.hip.x; };
  const standOff = footOff(STAND_FRONT);
  let open = 0;
  for (let a = 0; a <= 60; a += 0.25) if (Math.abs(footOff(withPose(STAND_FRONT, { lHip: a, rHip: a, lKnee: KNEES, rKnee: KNEES })) - standOff) < Math.abs(footOff(withPose(STAND_FRONT, { lHip: open, rHip: open, lKnee: KNEES, rKnee: KNEES })) - standOff)) open = a;
  const absorb = pose({ lS: 165, tS: 165, lH: open, tH: open, lK: KNEES, tK: KNEES });
  key(0.2, absorb, { spin: d * 360, roll: true, contacts: ["lFoot", "rFoot"], spinEase: "out", ease: "out" });
  // (Arthur, round 2: "the standing stance at the start/end is too wide ... a standing pose has the legs together,
  // arms by his sides": it lands into the normal stand's legs, holds a moment on both feet, the arms come down.)
  const track = buildRollTrack(keys.map((k) => ({ ...k })), "front", h);
  const shiftEnd = rollShiftAt(track, t);
  key(0.14, upright, { spin: d * 360, contacts: ["lFoot", "rFoot"], ease: "inOut" });
  const rest = STAND_FRONT;
  key(0.4, rest, { spin: d * 360, contacts: ["lFoot", "rFoot"], ease: "inOut" });
  const endX = keys[keys.length - 1].x + shiftEnd;
  return {
    keys,
    end: { t, x: endX, facing: "front", pose: rest },
    marks: { handDown, top, land, fastFrom: keys[3].t, fastTo: land },
  };
}
