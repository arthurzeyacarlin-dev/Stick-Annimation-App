import { forwardKinematics } from "../pose.ts";
import { STAND, withPose, type PoseAngles } from "../rig.ts";
import { beatsToKeys, type MoveOutput, type MoveSettings, type Stance } from "./motion.ts";
import { feetAhead, hipsOver, levelFeet, placeBeats, safePose, type PlacedBeat } from "./squat.ts";

// A REAL HUG (Arthur, Oct 14: the race hug "looks like a fist bump at arm's length"). The hugger WALKS IN until the two chests
// nearly touch (hip to hip HUG_CLOSE x height; when both figures hug, each walks half the gap), OPENS its arms wide (the
// anticipation), then steps the chest in and WRAPS both arms round the other's back — one arm high over the shoulder blade,
// one low round the waist, hands just past the other's spine (draw it with "depth": "around": the far arm goes BEHIND the
// other figure) — a SQUEEZE (leans in, arms tighten), a little side-to-side SWAY while it holds `seconds`, then lets go (arms
// down). Marks: `touch` (arms close round), `squeeze`, `release`. The planner fills `partnerDistance`
// (hip to hip when the move starts) and `both` (the partner hugs back) from where the two really are.
export type HugParams = { partnerDistance?: number; both?: boolean; seconds?: number; with?: string; partnerScale?: number };
// CHESTS TOGETHER (Arthur, Oct 14: "they're not putting their chest together"): hip to hip 0.18 x height, each leaning in ~13°
// so the two chests meet, the heads side by side over the other's shoulder.
export const HUG_CLOSE = 0.18;
// The arms open wide for the hug (the anticipation). A walk, jog or run straight into a hug opens them over its last steps
// (plan.ts ONE CONTINUOUS APPROACH); a hug that starts with the arms already open goes straight to the wrap.
export const HUG_REACH_FROM_REST = 0.68; // s from a standing start (no walk-in) to the wrap: open 0.32 + wrap 0.36
export const HUG_OPEN_ARMS = { head: -6, lShoulder: 100, lElbow: 25, rShoulder: 95, rElbow: 20 } as const;
export const HUG_ABOUT = "A real hug of a partner (`with` = their id; default the nearest in front). A walk/jog/run straight before it carries on right into the hug (no stop, then creep): it slows over its last steps with the arms opening. It walks in until the chests touch (each walks half when both hug), opens the arms wide, steps in and wraps both arms round the other's back (one high, one round the waist), squeezes, sways a little while holding `seconds` (1.2), lets go. Give BOTH figures a hug facing each other, the same start, and the front one \"depth\": \"around\" (its far arm goes behind the other). Marks touch, squeeze, release.";

// OPEN ON THE WAY IN: the arms (and head) of a walk's keys open into the hug over its last `window` seconds before `until` (the
// moment the feet stop), easing in — so the walk/run flows straight into the wrap. Returns the new keys.
export const OPEN_WINDOW = 0.5;
export function openArmsOnTheWay(keys: MoveOutput["keys"], until: number, window = OPEN_WINDOW): MoveOutput["keys"] {
  return keys.map((k) => {
    const u = Math.min(1, Math.max(0, (k.t - (until - window)) / window));
    if (u <= 0) return k;
    const w = u * u * (3 - 2 * u);
    const pose = { ...k.pose };
    for (const [name, angle] of Object.entries(HUG_OPEN_ARMS) as [keyof PoseAngles, number][]) pose[name] = k.pose[name] + (angle - k.pose[name]) * w;
    return { ...k, pose };
  });
}

type Walker = (start: Stance, params: Record<string, unknown>, settings: MoveSettings) => MoveOutput;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function hug(start: Stance, params: HugParams, settings: MoveSettings, walk: Walker): MoveOutput {
  const H = settings.height;
  const gap = clamp(Number(params.partnerDistance ?? 0.4 * H), 0, 6 * H);
  const share = params.both === false ? 1 : 0.5;
  const walkIn = Math.max(0, (gap - HUG_CLOSE * H) * share);
  const keys: MoveOutput["keys"] = [];
  let at = start;
  const marks: Record<string, number> = {};
  // (the gap is closed by a real walk first — feet stepping, never sliding)
  if (walkIn > 0.03 * H) {
    // (a walk ends mid-stride: the feet come together under the hips as the arms open, which carries the hips on by where the
    // feet were — so the walk stops that much short and the chests end HUG_CLOSE apart)
    let w = walk(start, { distance: walkIn }, settings);
    const on = feetAhead(w.end.pose) * H;
    if (Math.abs(on) > 1 && walkIn - on > 0.03 * H) w = walk(start, { distance: walkIn - on }, settings);
    // (the arms open over the last steps of the walk in: one flow, never stop, then open)
    const opened = openArmsOnTheWay(w.keys, w.end.t);
    keys.push(...opened);
    at = { ...w.end, pose: opened[opened.length - 1].pose };
  }
  const feet = feetAhead(at.pose) * H;
  // HUG AT THE PARTNER'S TORSO (Arthur, Oct 15: grandpa's arms closed over the little girl's head — "they never truly hug"): a
  // partner `partnerScale` times this one's size has its chest that much lower (or higher). Coming DOWN to a smaller one: the
  // knees bend (a squat, deep for a small child) so the chest drops to theirs, and the back leans in a little more; UP to a taller
  // one: it stands tall and the arms wrap higher. The drop is the chest height difference (~0.7 x height x (1 - ratio)).
  const r = clamp(Number(params.partnerScale ?? 1), 0.35, 2.5);
  const drop = clamp((1 - r) * 0.75, 0, 0.34); // (x H: with the extra lean the neck ends just above theirs, the chin over their shoulder)
  const hipUp = (a: number) => { const k = forwardKinematics({ ...STAND, lHip: a, rHip: a, lKnee: 2 * a, rKnee: 2 * a }, "right", { x: 0, y: 0 }, 1, "normal", false); return Math.max(k.lFoot.y, k.rFoot.y); };
  let bend = 0;
  if (drop > 0.005) { const full = hipUp(0); let lo = 0, hi = 75; for (let i = 0; i < 20; i += 1) { const m = (lo + hi) / 2; if (full - hipUp(m) < drop) lo = m; else hi = m; } bend = (lo + hi) / 2; }
  const leanMore = clamp((1 - r) * 15, 0, 6), armsUp = params.both ? 0 : clamp((r - 1) * 50, 0, 40); // (both hug: the bigger one comes down, the smaller one hugs at its own height)
  const legs = { lHip: STAND.lHip + bend, rHip: STAND.rHip + bend, lKnee: STAND.lKnee + 2 * bend, rKnee: STAND.rKnee + 2 * bend };
  // (the legs stay standing straight under the hips while the chest leans in: a hip angle is measured from the chest)
  const pose = (p: Partial<PoseAngles>) => {
    const wrapIn = (p.lean ?? 0) > 6; // (only the wrapped poses come down / up to the partner — the open-arms anticipation is upright)
    const lean = (p.lean ?? 0) + (wrapIn ? leanMore : 0), l = wrapIn ? legs : { lHip: STAND.lHip, rHip: STAND.rHip, lKnee: STAND.lKnee, rKnee: STAND.rKnee };
    // (a smaller body is thinner: the elbows fold more so the hands land ON its back, not past it in the air)
    const tuck = wrapIn ? clamp((1 - r) * 70, 0, 25) : 0;
    const arms = wrapIn ? { lShoulder: (p.lShoulder ?? STAND.lShoulder) + armsUp, rShoulder: (p.rShoulder ?? STAND.rShoulder) + armsUp, lElbow: (p.lElbow ?? STAND.lElbow) + tuck, rElbow: (p.rElbow ?? STAND.rElbow) + tuck } : {};
    return levelFeet(safePose(withPose(STAND, { ...l, ...p, lean, lHip: l.lHip + lean, rHip: l.rHip + lean, ...arms })));
  };
  const open = pose({ lean: -4, ...HUG_OPEN_ARMS });
  // (wrapped: one forearm comes back up over the other's shoulder blade, the other round the waist — the hands past the
  // other's spine; the chests meet: lean ~13°)
  const wrap = pose({ lean: 12, head: 8, lShoulder: 68, lElbow: 128, rShoulder: 24, rElbow: 122 });
  const squeeze = pose({ lean: 14, head: 11, lShoulder: 66, lElbow: 136, rShoulder: 22, rElbow: 130 });
  const swayA = pose({ lean: 13, head: 14, lShoulder: 66, lElbow: 134, rShoulder: 22, rElbow: 128 });
  const swayB = pose({ lean: 15, head: 6, lShoulder: 67, lElbow: 132, rShoulder: 23, rElbow: 126 });
  // (ARMS ALREADY OPEN — they opened on the way in: no stop to open them, straight into the wrap)
  const armsOpen = at.pose.lShoulder > 70 && at.pose.rShoulder > 70;
  const hold = clamp(Number(params.seconds ?? 1.2), 0.4, 5);
  const placed: PlacedBeat[] = [
    ...(armsOpen ? [] : [{ kind: "anticipation" as const, seconds: 0.32, pose: open, at: hipsOver(feet, open, H) }]),
    { kind: "action", seconds: armsOpen ? 0.3 : 0.36, pose: wrap, at: hipsOver(feet, wrap, H), name: "touch" },
    { kind: "follow", seconds: 0.24, pose: squeeze, at: hipsOver(feet, squeeze, H), name: "squeeze" },
  ];
  const sways = Math.max(1, Math.round(hold / 0.55));
  for (let i = 0; i < sways; i += 1) { const p = i % 2 === 0 ? swayA : swayB; placed.push({ kind: "hold", seconds: hold / sways, pose: p, at: hipsOver(feet, p, H) }); }
  placed.push(
    { kind: "settle", seconds: 0.5, pose: open, at: hipsOver(feet, open, H), name: "release" },
    { kind: "settle", seconds: 0.55, pose: STAND, at: hipsOver(feet, STAND, H), recover: true },
  );
  const out = beatsToKeys(at, placeBeats(placed, settings), settings);
  for (const [k, v] of Object.entries(out.marks)) marks[k] = v;
  // (the walk-in keys come first: the hand-over point (\`flow\`) counts them too, or a following move would cut the walk off)
  return { ...out, keys: [...keys, ...out.keys], marks, ...(out.flow ? { flow: { ...out.flow, keys: out.flow.keys + keys.length } } : {}) };
}

// A HUG IS THE HUG MOVE (tidyPlan): a "custom" action whose name says hug / embrace becomes the library "hug" (its held time kept,
// its depth kept), so a hug is never two arms-out poses at arm's length. When two figures hug and none of their hugs says a depth,
// the first one's hug gets "depth": "around" (in front, its far arm round the other's back).
type Rec = Record<string, unknown>;
const HUG_WORDS = /\b(hug|hugs|hugging|embrace|embraces|embracing|cuddle)\b/i;
export function hugsFromCustom(plan: Rec): Rec {
  if (!Array.isArray(plan.characters)) return plan;
  let changed = false;
  const chars: Rec[] = (plan.characters as Rec[]).map((c): Rec => ({ ...c, actions: ((c.actions as Rec[] | undefined) ?? []).map((a) => {
    const p = (a.params ?? {}) as Rec;
    if (a.move !== "custom" || !HUG_WORDS.test(String(p.name ?? ""))) return a;
    changed = true;
    const keys = Array.isArray(p.keys) ? (p.keys as Rec[]) : [];
    const held = keys.reduce((s, k) => s + (typeof k.hold === "number" ? k.hold : 0), 0) * Math.max(1, Number(p.repeat ?? 1));
    const { params: _p, ...rest } = a; void _p;
    return { ...rest, move: "hug", params: { ...(typeof p.with === "string" ? { with: p.with } : {}), seconds: Math.min(5, Math.max(0.8, held || 1.2)) } };
  }) }));
  const huggers = chars.filter((c) => (c.actions as Rec[]).some((a) => a.move === "hug"));
  if (huggers.length >= 2 && !huggers.some((c) => c.depth !== undefined || (c.actions as Rec[]).some((a) => a.move === "hug" && a.depth !== undefined))) {
    changed = true;
    const first = huggers[0];
    first.actions = (first.actions as Rec[]).map((a) => (a.move === "hug" ? { ...a, depth: "around" } : a));
  }
  return changed ? { ...plan, characters: chars } : plan;
}
