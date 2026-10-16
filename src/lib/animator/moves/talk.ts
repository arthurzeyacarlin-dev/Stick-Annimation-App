import { STAND, STAND_FRONT, withPose, type PoseAngles } from "../rig.ts";
import { turn } from "./turn.ts";
import { beatsToKeys, type MoveOutput, type MoveSettings, type Stance } from "./motion.ts";
import { feetAhead, hipsOver, levelFeet, placeBeats, safePose, type PlacedBeat } from "./squat.ts";

// TALKING = GESTURES (Arthur, Oct 15: "stick figures can't talk — they turn around, point, point, then tap the other — 'go there,
// go there'"). A stick figure has no mouth: what it SAYS is shown by its body. `talk` turns words into the gestures people make
// while they talk, each with anticipation, an eased action and a settle (never a pop): face the listener (the planner turns it),
// POINT (twice by default: "there — there!"), BECKON ("come here"), NOD ("yes"), SHAKE the head with a hand wave-off ("no"), open
// EXPLAINING hands, a SHRUG, and a TAP on the listener's shoulder (a real contact: it walks in until its hand reaches their
// shoulder). The same move is the LISTENER's reaction: `say: "yes"` (nods) synced to the speaker's mark, or "look" (turns the
// head and chest the way pointed). Side view (facing the listener).
export const TALK_SAYS = ["point", "come here", "no", "yes", "explain", "shrug", "tap", "look"] as const;
export type TalkSay = (typeof TALK_SAYS)[number];
export type TalkParams = { to?: string; say?: TalkSay | TalkSay[]; toward?: "ahead" | "back" | "up" | "down"; times?: number; partnerDistance?: number; urgent?: boolean };
export const TALK_TAP_GAP = 0.42; // x height: hip to hip from where a reached-out hand lands on the other's shoulder
export const TALK_ABOUT = "Talk with gestures (no mouth: the body says it). `to` = listener (faced first); `say` = one or a list: point (twice; `toward` ahead/back/up/down), come here, yes (nod), no, explain, shrug, tap (walks in, taps their shoulder), look. The listener answers with its own talk synced to a mark (point, tap, nod). `urgent: true` (an EMERGENCY — hurry, danger, get out): it turns to face the viewer, looks at the listener, looks where it means, and points / waves big and fast with the arm on that side, then turns back.";

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
type Walker = (start: Stance, params: Record<string, unknown>, settings: MoveSettings) => MoveOutput;

// URGENT GESTURES OPEN TO THE VIEWER (Arthur, Oct 15: "if it was an emergency, he'd be facing the screen a bit — looks at him, looks
// over there, points — only if it's an emergency"). An urgent talk TURNS TO FACE THE VIEWER (a real turn, like a cartwheel or a
// windmill is shown to the screen), then each gesture is made with the arm on the side it means — pointing: the arm on the side it
// points to; beckoning / waving back / no / tap: the arm on the listener's side — big and fast, the head snapping between the
// listener and the place it means; then it turns back to the side it faced. A calm talk is unchanged (side view).
const swapSides = (p: Partial<PoseAngles>): Partial<PoseAngles> => Object.fromEntries(Object.entries(p).map(([k, v]) => [k.startsWith("l") && k !== "lean" ? `r${k.slice(1)}` : k.startsWith("r") ? `l${k.slice(1)}` : k, v])) as Partial<PoseAngles>;
function urgentTalk(start: Stance, params: TalkParams, list: TalkSay[], settings: MoveSettings): MoveOutput {
  const H = settings.height;
  const side = start.facing === "left" ? "left" : "right";
  const other = side === "left" ? "right" : "left";
  const dir = params.toward ?? "ahead";
  // (where it means: ahead = the way it faced; back = behind it. The listener: the way it faced when it has one — the planner turned
  // it to them — else behind it, the way it turned away from.)
  const pointSide = dir === "back" ? other : side;
  const listenerSide = params.to ? side : other;
  const keys: MoveOutput["keys"] = [];
  const toFront = start.facing === "front" ? undefined : turn(start, { to: "front" }, settings);
  if (toFront) keys.push(...toFront.keys);
  const at = toFront?.end ?? start;
  const times = clamp(Math.round(Number(params.times ?? 3)), 1, 5);
  const fast = 0.85; // (quick and big, still a person's speed: the hand stays under ~2.5 H a second)
  const pose = (p: Partial<PoseAngles>, onSide: "left" | "right") => withPose(STAND_FRONT, onSide === "right" ? swapSides(p) : p);
  const placed: PlacedBeat[] = [];
  const add = (kind: PlacedBeat["kind"], seconds: number, p: PoseAngles, name?: string) => placed.push({ kind, seconds: seconds * fast, pose: p, at: 0, ...(name ? { name } : {}) });
  // (front view: the l arm draws as from the left-facing side, the r arm as from the right — l poses are written once and mirrored)
  const lookAt = (s0: "left" | "right") => (s0 === "left" ? -10 : 10);
  const aim = dir === "up" ? 140 : dir === "down" ? 60 : 92;
  list.forEach((say, n) => {
    // (between two gestures the busy arm comes down first — one arm hands over to the other, never a whip)
    if (n > 0) add("follow", 0.42, pose({ head: lookAt(listenerSide) * 0.5, lShoulder: 30, lElbow: 50, rShoulder: 30, rElbow: 50 }, side));
    if (say === "point" || say === "look") {
      add("anticipation", 0.3, pose({ head: lookAt(listenerSide), lShoulder: 45, lElbow: 100 }, pointSide));
      for (let i = 0; i < times; i += 1) {
        add("action", 0.26, pose({ head: lookAt(pointSide), lShoulder: aim + 8, lElbow: 2 }, pointSide), i === 0 ? say : undefined);
        add("hold", 0.24, pose({ head: lookAt(pointSide), lShoulder: aim + 10, lElbow: 4 }, pointSide));
        // (looks back at the listener between the points: "you — THERE")
        if (i < times - 1) add("follow", 0.26, pose({ head: lookAt(listenerSide), lShoulder: aim - 24, lElbow: 45 }, pointSide));
      }
    } else if (say === "come here" || say === "no" || say === "tap" || say === "explain") {
      // (waving them in / back, fast and big: the whole arm swings over the head toward itself)
      add("anticipation", 0.22, pose({ head: lookAt(listenerSide), lShoulder: 60, lElbow: 40 }, listenerSide));
      for (let i = 0; i < times; i += 1) {
        add("action", 0.26, pose({ head: lookAt(listenerSide), lShoulder: 160, lElbow: 25, rShoulder: 30, rElbow: 40 }, listenerSide), i === 0 ? (say === "come here" ? "beckon" : say) : undefined);
        add("follow", 0.26, pose({ head: lookAt(listenerSide) * 0.6, lShoulder: 125, lElbow: 80, rShoulder: 26, rElbow: 40 }, listenerSide));
      }
    } else if (say === "yes") {
      for (let i = 0; i < times; i += 1) { add("action", 0.18, pose({ head: 16 }, side), i === 0 ? "nod" : undefined); add("follow", 0.18, pose({ head: -2 }, side)); }
    } else if (say === "shrug") {
      add("action", 0.26, pose({ head: 8, lShoulder: 40, lElbow: 100, rShoulder: 40, rElbow: 100 }, side), "shrug");
      add("hold", 0.36, pose({ head: 9, lShoulder: 42, lElbow: 102, rShoulder: 42, rElbow: 102 }, side));
    }
  });
  add("settle", 0.6, STAND_FRONT, "done");
  const out = beatsToKeys(at, placeBeats(placed, settings), settings);
  keys.push(...out.keys);
  // (then it turns back to the side it faced, a real turn — the next move starts from its own view)
  const back = start.facing === "front" ? undefined : turn(out.end, { to: start.facing }, settings);
  if (back) keys.push(...back.keys);
  return { keys, end: back?.end ?? out.end, marks: { ...out.marks } };
}

export function talk(start: Stance, params: TalkParams, settings: MoveSettings, walk?: Walker): MoveOutput {
  const H = settings.height;
  if (params.urgent === true) {
    const says = (Array.isArray(params.say) ? params.say : [params.say ?? "point"]).filter((s): s is TalkSay => TALK_SAYS.includes(s as TalkSay));
    return urgentTalk(start, params, says.length ? says : ["point"], settings);
  }
  const says = (Array.isArray(params.say) ? params.say : [params.say ?? "point"]).filter((s): s is TalkSay => TALK_SAYS.includes(s as TalkSay));
  const list: TalkSay[] = says.length ? says : ["point"];
  const times = clamp(Math.round(Number(params.times ?? 2)), 1, 4);
  const keys: MoveOutput["keys"] = [];
  const marks: Record<string, number> = {};
  let at = start;
  // (A TAP IS A REAL TOUCH: too far for the hand, it first walks in — feet stepping, never sliding — until the hand reaches.)
  const gap = Number(params.partnerDistance ?? 0);
  if (list.includes("tap") && walk && gap > (TALK_TAP_GAP + 0.04) * H) {
    const w = walk(start, { distance: gap - TALK_TAP_GAP * H }, settings);
    keys.push(...w.keys);
    at = w.end;
  }
  const feet = feetAhead(at.pose) * H;
  const legs = { lHip: STAND.lHip, rHip: STAND.rHip, lKnee: STAND.lKnee, rKnee: STAND.rKnee };
  const pose = (p: Partial<PoseAngles>) => { const lean = p.lean ?? 0; return levelFeet(safePose(withPose(STAND, { ...legs, lHip: legs.lHip + lean, rHip: legs.rHip + lean, ...p }))); };
  const placed: PlacedBeat[] = [];
  const add = (kind: PlacedBeat["kind"], seconds: number, p: PoseAngles, name?: string) => placed.push({ kind, seconds, pose: p, at: hipsOver(feet, p, H), ...(name ? { name } : {}) });
  // The pointing arm: the near (left) arm in a side view; "back" points behind with the chest turned a little.
  const dir = params.toward ?? "ahead";
  const aim = dir === "up" ? 140 : dir === "down" ? 55 : dir === "back" ? -70 : 95;
  const head = dir === "up" ? -14 : dir === "down" ? 10 : 0;
  for (const say of list) {
    if (say === "point") {
      add("anticipation", 0.26, pose({ lean: 2, head, lShoulder: aim > 0 ? 40 : -20, lElbow: 95 }));
      for (let i = 0; i < times; i += 1) {
        add("action", 0.24, pose({ lean: dir === "back" ? -4 : 5, head, lShoulder: aim, lElbow: 4 }), i === 0 ? "point" : undefined);
        add("hold", 0.3, pose({ lean: dir === "back" ? -4 : 5, head: head + 2, lShoulder: aim + (aim > 0 ? 3 : -3), lElbow: 6 }));
        if (i < times - 1) add("follow", 0.2, pose({ lean: 2, head, lShoulder: aim - (aim > 0 ? 18 : -14), lElbow: 40 })); // pulls back a little for the next jab
      }
    } else if (say === "come here") {
      add("anticipation", 0.24, pose({ lean: -2, lShoulder: 50, lElbow: 25 }));
      for (let i = 0; i < times; i += 1) {
        add("action", 0.22, pose({ lean: -3, head: -4, lShoulder: 48, lElbow: 115 }), i === 0 ? "beckon" : undefined);
        add("follow", 0.22, pose({ lean: -2, lShoulder: 52, lElbow: 30 }));
      }
    } else if (say === "yes") {
      for (let i = 0; i < times; i += 1) {
        add("action", 0.2, pose({ lean: 2, head: 20 }), i === 0 ? "nod" : undefined);
        add("follow", 0.22, pose({ lean: 0, head: -2 }));
      }
    } else if (say === "no") {
      add("anticipation", 0.2, pose({ head: 4, lShoulder: 30, lElbow: 70 }));
      for (let i = 0; i < times; i += 1) {
        add("action", 0.18, pose({ lean: -3, head: -8, lShoulder: 46, lElbow: 55 }), i === 0 ? "no" : undefined);
        add("action", 0.18, pose({ lean: 1, head: 9, lShoulder: 34, lElbow: 100 }));
      }
    } else if (say === "explain") {
      for (let i = 0; i < times; i += 1) {
        add("action", 0.3, pose({ lean: 3, head: 3, lShoulder: 45, lElbow: 70, rShoulder: 30, rElbow: 90 }), i === 0 ? "explain" : undefined);
        add("follow", 0.3, pose({ lean: 1, head: -2, lShoulder: 34, lElbow: 92, rShoulder: 42, rElbow: 72 }));
      }
    } else if (say === "shrug") {
      add("anticipation", 0.2, pose({ lean: 2, head: 2, lShoulder: 4, lElbow: 30, rShoulder: 2, rElbow: 30 }));
      add("action", 0.28, pose({ lean: -4, head: 12, lShoulder: 18, lElbow: 100, rShoulder: 14, rElbow: 100 }), "shrug");
      add("hold", 0.4, pose({ lean: -4, head: 14, lShoulder: 19, lElbow: 102, rShoulder: 15, rElbow: 102 }));
    } else if (say === "tap") {
      // The hand lands on the listener's shoulder (arm level, a little lean), two light taps, then back.
      const reach = gap > 0 ? Math.min(gap, (TALK_TAP_GAP + 0.04) * H) : TALK_TAP_GAP * H;
      const elbow = clamp(25 + (TALK_TAP_GAP * H - reach) / H * 400, 15, 85); // closer = more bent
      add("anticipation", 0.24, pose({ lean: 3, lShoulder: 55, lElbow: 70 }));
      add("action", 0.26, pose({ lean: 9, head: 4, lShoulder: 80, lElbow: elbow }), "tap");
      for (let i = 0; i < times; i += 1) {
        add("follow", 0.14, pose({ lean: 9, head: 4, lShoulder: 85, lElbow: elbow + 18 }));
        add("action", 0.14, pose({ lean: 9, head: 4, lShoulder: 80, lElbow: elbow }));
      }
      add("hold", 0.2, pose({ lean: 8, head: 3, lShoulder: 79, lElbow: elbow + 2 }));
    } else if (say === "look") {
      const lookBack = dir === "back";
      add("anticipation", 0.22, pose({ lean: 2, head: 4 }));
      add("action", 0.34, pose({ lean: lookBack ? -10 : 3, head: lookBack ? -20 : head - 4 }), "look");
      add("hold", 0.6, pose({ lean: lookBack ? -11 : 3, head: lookBack ? -22 : head - 5 }));
    }
  }
  add("settle", 0.5, STAND, "done");
  // (the hands always come home at the end — never `recover`: a following stand would otherwise keep the arm out for seconds)
  const out = beatsToKeys(at, placeBeats(placed, settings), settings);
  for (const [k, v] of Object.entries(out.marks)) marks[k] = v;
  // (the walk-in keys come first: the hand-over point (\`flow\`) counts them too, or a following move would cut the walk off)
  return { ...out, keys: [...keys, ...out.keys], marks, ...(out.flow ? { flow: { ...out.flow, keys: out.flow.keys + keys.length } } : {}) };
}

// URGENT FROM THE WORDS (Arthur, Oct 15): when the story says it is an EMERGENCY — emergency, urgent, hurry, danger, quick, get out,
// look out, watch out, run for it, help — the figures telling others what to do (point, come here, no, tap, explain) talk urgently:
// facing the viewer, big fast gestures. A calm story (directions on a sunny walk) is never made urgent. Plan-level, every shot.
export const URGENT_WORDS = /\b(emergenc\w*|urgent\w*|hurry|hurries|hurried|danger\w*|quick(ly)?|get out|look out|watch out|run for (it|your)|help!|sos)\b/i;
export function urgentTalks<P extends Record<string, unknown>>(plan: P, words: string): P {
  if (!URGENT_WORDS.test(`${words} ${String(plan.title ?? "")}`)) return plan;
  const shot = (s: Record<string, unknown>) => !Array.isArray(s.characters) ? s : { ...s, characters: (s.characters as { actions?: { move: string; params?: Record<string, unknown> }[] }[]).map((c) => ({ ...c, actions: (c.actions ?? []).map((a) => {
    if (a.move !== "talk" || a.params?.urgent !== undefined) return a;
    const says = [a.params?.say ?? "point"].flat().map(String);
    return says.some((x) => ["point", "come here", "no", "tap", "explain"].includes(x)) ? { ...a, params: { ...(a.params ?? {}), urgent: true } } : a;
  }) })) };
  const out = shot(plan) as P;
  return Array.isArray(plan.cuts) ? { ...out, cuts: (plan.cuts as Record<string, unknown>[]).map(shot) } : out;
}
