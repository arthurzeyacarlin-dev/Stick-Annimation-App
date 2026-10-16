import type { SceneContact } from "../contacts.ts";
import type { ScenePlan } from "./plan.ts";
import { HIGH_FIVE_DEFAULTS, touchGap } from "./highFive.ts";
import { notATouch, touchObject, touchVerb } from "../laws/outline.ts";
import { propBox } from "../laws/propBox.ts";

// THE MOVES DECLARE THEIR TOUCHES (Oct 15 contact pass, contacts.ts). Read from the marks the moves already set, so every
// move of a family declares its contact the same way:
// - a HIGH-FIVE / a HANDSHAKE (`<id>.highFive<n>.slap`): both figures' slapping hands (lHand, highFive.ts SLAP_HAND) are
//   declared on each other's → the pass meets them at the midpoint for the press (SLAP_PRESS_SEC around the slap).
// - a HUG (`<id>.hug<n>.touch` .. `.release`): each hand is declared on the partner's back — one high by the neck, one low
//   by the hips, a little past the partner's spine (away from the hugger) — for the whole hold.
// A figure without a partner at the same moment declares nothing (one-sided taps are the move's own reach).
export const SLAP_PRESS_SEC = 0.03; // the press lasts about this long each side of the slap at any speed
const SAME_MOMENT = 0.12;
export const TAP_TOUCH_SEC = 0.2; // the hand stays on the shoulder about this long at the first tap
export const HUG_BLEND_PICTURES = 8; // a hug's hands ease onto / off the partner's back over this many pictures // partners whose slap marks fall within this are one high-five

type PlanLike = Pick<ScenePlan, "characters" | "height"> & { characters: { id: string; x?: number; actions?: { move?: string; params?: Record<string, unknown> }[] }[]; effects?: { kind: string; anchor?: unknown; params?: Record<string, unknown> }[] };

export function declareContacts(plan: PlanLike, marks: Record<string, number>): SceneContact[] {
  // (THE DIRECTOR's touches — kimodo/director.ts: a real-motion strike's fist ON the target's head at the strike, snapped exactly)
  const out: SceneContact[] = [...(((plan as unknown as { directorContacts?: SceneContact[] }).directorContacts) ?? [])];
  const ids = plan.characters.map((c) => c.id);
  const H = plan.height;
  const slaps = Object.entries(marks).filter(([k]) => /^[^.]+\.highFive\d+\.slap$/.test(k)).map(([k, t]) => ({ id: k.split(".")[0], t }));
  for (const a of slaps) for (const b of slaps) {
    if (a.id >= b.id || !ids.includes(a.id) || !ids.includes(b.id) || Math.abs(a.t - b.t) > SAME_MOMENT) continue;
    const t = (a.t + b.t) / 2;
    // THE CONTACT RULE (highFive.ts): the round line ends just touch — the hand points stay one line thickness apart, tip to tip.
    const A = plan.characters.find((c) => c.id === a.id)!, B = plan.characters.find((c) => c.id === b.id)!;
    const th = (c: typeof A) => Number((c as { look?: { thickness?: number } }).look?.thickness ?? HIGH_FIVE_DEFAULTS.thickness);
    const gap = touchGap(th(A), th(B)), dir = (A.x ?? 0) <= (B.x ?? 0) ? -1 : 1; // offset toward a's own side
    out.push({ figure: a.id, joint: "lHand", target: { figure: b.id, joint: "lHand", offset: { x: dir * gap, y: 0 } }, from: t - SLAP_PRESS_SEC, to: t + SLAP_PRESS_SEC });
    out.push({ figure: b.id, joint: "lHand", target: { figure: a.id, joint: "lHand", offset: { x: -dir * gap, y: 0 } }, from: t - SLAP_PRESS_SEC, to: t + SLAP_PRESS_SEC });
  }
  const hugs = Object.entries(marks).filter(([k]) => /^[^.]+\.hug\d+\.touch$/.test(k)).map(([k, t]) => ({ id: k.split(".")[0], base: k.slice(0, -".touch".length), t }));
  for (const h of hugs) {
    const release = marks[`${h.base}.release`];
    const partner = hugs.find((o) => o.id !== h.id && Math.abs(o.t - h.t) <= 0.6);
    if (release === undefined || !partner) continue;
    const me = plan.characters.find((c) => c.id === h.id), them = plan.characters.find((c) => c.id === partner.id);
    if (!me || !them) continue;
    const away = (me.x ?? 0) <= (them.x ?? 0) ? 1 : -1; // past the partner's spine, on the far side from the hugger
    const to = Math.min(release, marks[`${partner.base}.release`] ?? release);
    // (From the SQUEEZE, when the arms are round the partner — at the touch the chests meet and the arms are still closing.)
    const from = Math.max(marks[`${h.base}.squeeze`] ?? h.t, marks[`${partner.base}.squeeze`] ?? partner.t);
    if (from >= to) continue;
    // (On the partner's spine line — chest height and waist height, a touch past it; a hug's arms come a long way from the planned
    // pose, so the blend is longer (HUG_BLEND_PICTURES) so the let-go stays smooth.)
    out.push({ figure: h.id, joint: "lHand", target: { figure: partner.id, joint: "neck", offset: { x: away * 0.02 * H, y: 0.08 * H } }, from, to, blendPictures: HUG_BLEND_PICTURES });
    out.push({ figure: h.id, joint: "rHand", target: { figure: partner.id, joint: "hip", offset: { x: away * 0.02 * H, y: -0.04 * H } }, from, to, blendPictures: HUG_BLEND_PICTURES });
  }
  // A TAP (talk.ts `<id>.talk<n>.tap`, say "tap"): the near hand lands on the listener's shoulder (its neck point, a touch toward the
  // tapper) for the first tap. The listener is the talk action's `to` (else the nearest other figure).
  const taps = Object.entries(marks).filter(([k]) => /^[^.]+\.talk\d+\.tap$/.test(k)).map(([k, t]) => ({ id: k.split(".")[0], t }));
  for (const tap of taps) {
    const me = plan.characters.find((c) => c.id === tap.id);
    if (!me) continue;
    const to = (me.actions ?? []).map((a) => (a.params as { to?: unknown } | undefined)?.to).find((x) => typeof x === "string" && ids.includes(x)) as string | undefined;
    const them = plan.characters.find((c) => c.id === to) ?? plan.characters.filter((c) => c.id !== me.id).sort((a, b) => Math.abs((a.x ?? 0) - (me.x ?? 0)) - Math.abs((b.x ?? 0) - (me.x ?? 0)))[0];
    if (!them) continue;
    const toward = (me.x ?? 0) <= (them.x ?? 0) ? -1 : 1;
    out.push({ figure: me.id, joint: "lHand", target: { figure: them.id, joint: "neck", offset: { x: toward * 0.03 * H, y: 0.01 * H } }, from: tap.t, to: tap.t + TAP_TOUCH_SEC, blendPictures: 5 });
  }
  out.push(...touchIntents(plan, marks));
  return out;
}

// THE ENGINE READS A TOUCH (Oct 15 deep audit: ~30% of touches missed because only 4 move types declared contacts; a custom move
// "puts her hand down on the stove" or two custom "handshake"s were pose angles against a guess, so the hand stopped in the air).
// Rule: a custom move whose NAME says it touches something (TOUCH_VERBS), or whose key says `touch: "<thing name | figure id[.joint]>"`,
// DECLARES that touch: the reaching hand (the key's `hand`, else the arm the key raises most) is put ON the target for the held
// keys. The target is read from the words: a named thing in the plan's effects → {prop: index, point: "top" | "near"} (the solver
// asks the World where its drawn surface is); another figure (a handshake / high-five / pat / punch) → that figure's hand (both
// sides declared → they meet in the middle); nothing named → the nearest thing to the figure (one thing in the scene = that one).
// Family: every hand-on-something — hands on stoves, railings, tables, walls, doors, shoulders; handshakes; grabs; knocks; pats.
const TOUCH_VERBS = /\b(puts?|putting|places?|placing|lays?|laying|rests?|resting|leans?|leaning|touch(?:es|ing)?|press(?:es|ing)?|push(?:es|ing)?|grabs?|grabbing|grips?|gripping|holds?|holding|catch(?:es|ing)?|shakes? hands?|shaking hands|handshake|knocks?|knocking|pats?|patting|punch(?:es|ing)?|kicks?|kicking|hits?|hitting|slaps?|slapping|pokes?|poking|strokes?|stroking|pets?|petting|taps?|tapping)\b/i;
const ON_TOP = /\b(puts?|putting|places?|placing|lays?|laying|rests?|resting|leans?|leaning|pats?|patting|knocks?|knocking|taps?|tapping|slaps?|slapping)\b/i; // the hand lands ON the thing's top
const PARTNER = /\b(shakes? hands?|shaking hands|handshake|high[- ]?five|fist[- ]?bump|pats?|patting|punch(?:es|ing)?|slaps?|slapping|pokes?|poking|hugs?|hugging)\b/i;
const FOOT = /\b(kicks?|kicking|stomps?|stomping|steps? on|stepping on)\b/i;
const ARM_UP = 25; // degrees: a shoulder raised at least this far is the reaching arm
const KEY_TOUCH_SEC = 0.15; // a key with no hold touches about this long
const TALL_TOP = 0.85; // x height: a thing whose top is above this is touched on its near face (above the shoulders)
const WALK_TO = 3; // x height: an unnamed thing counts as the touched one only this close to the figure's start

type Key = { pose?: Record<string, unknown>; hold?: unknown; touch?: unknown; hand?: unknown; rHand?: unknown; lHand?: unknown };
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : undefined);
const thingName = (e: { params?: Record<string, unknown> }) => String(e.params?.name ?? e.params?.symbol ?? "").trim().toLowerCase();
const thingX = (e: { anchor?: unknown }) => num((e.anchor as { x?: unknown } | undefined)?.x);

// Which thing in the plan the words name (the longest thing name found in the words wins; "stove" finds "hot stove").
const STOP_WORDS = new Set(["the", "and", "with", "for", "from", "into", "onto", "over", "under", "near", "his", "her", "their", "its", "one", "big", "small", "little", "old", "new", "top", "side", "front", "back"]);
function namedThing(words: string, effects: PlanLike["effects"]): number {
  const w = words.toLowerCase();
  let best = -1, bestLen = 0;
  (effects ?? []).forEach((e, index) => {
    if (e.kind !== "prop" || !e.anchor || typeof e.anchor !== "object" || "character" in e.anchor || "object" in e.anchor) return;
    const name = thingName(e);
    if (!name) return;
    // (only CONTENT words count — Oct 15: "the" in "poster on the wall" matched "puts the book on the table" and the hand went to the
    // poster 375 px away; the thing whose name shares the most real words with the move wins)
    const parts = name.toLowerCase().split(/[^a-z0-9']+/).filter((part) => part.length > 2 && !STOP_WORDS.has(part));
    const found = parts.filter((part) => new RegExp(`\\b${part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(s|es)?\\b`, "i").test(w)).length;
    if (found > bestLen) { best = index; bestLen = found; }
  });
  return best;
}

// Every custom move that touches: which figure, which custom move (n), which limb, which keys (j = 0-based), and the target.
export type TouchMove = { figure: string; n: number; joint: SceneContact["joint"]; keys: { j: number; hold?: number }[]; target: SceneContact["target"] };
export function readTouches(plan: PlanLike): TouchMove[] {
  const out: TouchMove[] = [];
  const ids = plan.characters.map((c) => c.id);
  for (const me of plan.characters) {
    let n = 0;
    for (const action of me.actions ?? []) {
      if (action.move !== "custom") continue;
      n += 1;
      const p = action.params ?? {}, name = String(p.name ?? ""), keys = (Array.isArray(p.keys) ? p.keys : []) as Key[];
      if (!keys.length) continue;
      const explicit = keys.some((k) => typeof k.touch === "string" && k.touch.trim());
      // (a partner move — fist bump, high-five — IS a touch even without a touch verb; Oct 15: "fist bump" slipped past this gate, so
      // nobody waited for the partner and each punched the air)
      if (!explicit && !TOUCH_VERBS.test(name) && !PARTNER.test(name)) continue;
      // (the same word reader as the touch laws: a gesture / self-touch / verb with no object — "pushes twice" on a skateboard, "grabs at
      // his head" as the hat blows off — is not a touch of a thing; Oct 15 S09/S10 got false contacts 500–900 px away)
      if (!explicit && (notATouch(name) || (touchVerb(name) !== null && touchObject(name) === null))) continue;
      // The reaching limb: the key's `hand`, else the arm the touch keys raise most (a kick: the foot the keys lift).
      const kick = FOOT.test(name) && !/\bhand/i.test(name);
      const raise = (k: Key, side: "l" | "r") => Math.abs(num(k.pose?.[`${side}${kick ? "Hip" : "Shoulder"}`]) ?? 0);
      const peak = keys.reduce((b, k) => (Math.max(raise(k, "l"), raise(k, "r")) > Math.max(raise(b, "l"), raise(b, "r")) ? k : b), keys[0]);
      const handWord = typeof p.hand === "string" ? p.hand : typeof peak.hand === "string" ? peak.hand : "";
      const side: "l" | "r" = /^l/i.test(handWord) ? "l" : /^r/i.test(handWord) ? "r" : raise(peak, "l") > raise(peak, "r") ? "l" : "r";
      const joint = `${side}${kick ? "Foot" : "Hand"}` as SceneContact["joint"];
      // The keys that touch: every key whose reaching limb is raised (explicit `touch` keys always), as one run per target.
      const touching = keys.map((k, j) => ({ k, j, on: typeof k.touch === "string" && k.touch.trim() ? true : !explicit && raise(k, side) >= ARM_UP })).filter((x) => x.on);
      if (!touching.length) continue;
      // The target, from the key's `touch` word, else the move's words.
      // (A TALL THING — a wall, a door, a tree, a fridge: its top is above the shoulders — is leaned / knocked / put on at its NEAR
      // FACE, never its top: Oct 15 T1, "leans a hand on the wall" put the hand on the wall's top and the head went into the wall.)
      const tall = (idx: number) => { const e = plan.effects?.[idx]; const b = e ? propBox(plan as never, e as never) : null; return !!b && (Number((plan as { groundY?: number }).groundY ?? 900) - b.top) / plan.height > TALL_TOP; };
      const targetOf = (word: string): SceneContact["target"] | null => {
        const w = word.trim();
        const [fid, fj] = w.split(".");
        if (ids.includes(fid) && fid !== me.id) return { figure: fid, joint: (fj || joint) as keyof import("../rig.ts").Skeleton };
        // (A NAMED FIGURE'S BODY PART is that figure, never a thing that shares the word — Oct 15 T1: "pats the student's shoulder"
        // went to the "student desk". "<name|id>'s shoulder / back / arm / hand / head / knee" → that figure's joint.)
        for (const o of plan.characters) {
          if (o.id === me.id) continue;
          const nm = [o.id, String((o as { name?: unknown }).name ?? "")].filter((x) => x.length > 0).map((x) => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
          const m = new RegExp(`\\b(?:${nm.join("|")})(?:'s|s'|’s)\\s+(?:left\\s+|right\\s+)?(shoulders?|back|arms?|hands?|head|knees?|elbows?)\\b`, "i").exec(w);
          if (m) return { figure: o.id, joint: (/^(shoulder|back)/i.test(m[1]) ? "neck" : /^hand/i.test(m[1]) ? joint : /^head/i.test(m[1]) ? "head" : /^knee/i.test(m[1]) ? `${side}Knee` : `${side}Elbow`) as keyof import("../rig.ts").Skeleton };
        }
        const idx = namedThing(w, plan.effects);
        // (THE THING ON TOP — Oct 15, the hot pan: "kitchen stove with a hot pan on it" + "touches the hot pan" — the hand goes onto the
        // part that sits on top (the pan), not the nearest corner of the whole thing (the tip of the pan's handle))
        const onIt = /\bwith (?:an? |the |some )?(.+?) (?:on (?:it|top)|on)\b/i.exec(thingName(plan.effects?.[idx] ?? {}))?.[1];
        if (idx >= 0 && onIt && onIt.split(/\s+/).some((wd) => wd.length > 2 && !STOP_WORDS.has(wd) && new RegExp(`\\b${wd.replace(/[.*+?^${}()|[\]\\]/g, "")}`, "i").test(w))) return { prop: idx, point: "part" } as unknown as SceneContact["target"];
        if (idx >= 0) return { prop: idx, point: (ON_TOP.test(word) || ON_TOP.test(name)) && !tall(idx) ? "top" : "near" } as unknown as SceneContact["target"];
        return null;
      };
      let target: SceneContact["target"] | null = targetOf(touching[0].k.touch as string ?? "") ?? targetOf(name);
      if (!target) {
        // No thing named: a partner move → the nearest other figure's same hand (a handshake, a high-five) or shoulder (a pat, a punch
        // lands on the body); else the nearest thing in the scene (its drawn surface, read by the solver from the World).
        const partner = plan.characters.filter((c) => c.id !== me.id).sort((a, b) => Math.abs((a.x ?? 0) - (me.x ?? 0)) - Math.abs((b.x ?? 0) - (me.x ?? 0)))[0];
        if (PARTNER.test(name) && partner) target = { figure: partner.id, joint: /\b(pats?|patting|punch|slaps?|slapping|pokes?|poking|hugs?|hugging)/i.test(name) ? "neck" : joint };
        else {
          const things = (plan.effects ?? []).map((e, index) => ({ e, index })).filter(({ e }) => e.kind === "prop" && thingX(e) !== undefined && !(typeof e.anchor === "object" && e.anchor && ("character" in e.anchor || "object" in e.anchor)));
          const near = things.sort((a, b) => Math.abs(thingX(a.e)! - (me.x ?? 0)) - Math.abs(thingX(b.e)! - (me.x ?? 0)))[0];
          // (only a thing the figure can plausibly be at: within WALK_TO x height of where it starts, else "holds a pose" would grab a far tree)
          if (near && Math.abs(thingX(near.e)! - (me.x ?? 0)) <= WALK_TO * plan.height) target = { prop: near.index, point: ON_TOP.test(name) && !tall(near.index) ? "top" : "near" } as unknown as SceneContact["target"];
        }
      }
      if (!target) continue;
      out.push({ figure: me.id, n, joint, keys: touching.map((x) => ({ j: x.j, ...(num(x.k.hold) !== undefined ? { hold: num(x.k.hold) } : {}) })), target });
    }
  }
  return out;
}

export function touchIntents(plan: PlanLike, marks: Record<string, number>): SceneContact[] {
  const out: SceneContact[] = [];
  for (const tm of readTouches(plan)) {
    const base = `${tm.figure}.custom${tm.n}.`;
    const touching = tm.keys.map((k) => ({ ...k, t: marks[`${base}k${k.j + 1}`] })).filter((x) => x.t !== undefined);
    // One contact per run of touching keys: from the first key's moment to the end of the last key's hold.
    let run: typeof touching = [];
    const flush = () => {
      if (!run.length) return;
      const last = run[run.length - 1], from = run[0].t!, to = last.t! + (last.hold ?? KEY_TOUCH_SEC);
      if (to > from) out.push({ figure: tm.figure, joint: tm.joint, target: tm.target, from, to, blendPictures: 5 });
      run = [];
    };
    for (const x of touching) { if (run.length && x.j !== run[run.length - 1].j + 1) flush(); run.push(x); }
    flush();
  }
  // TWO HANDS MEET AT ONE MOMENT (Oct 15, the office handshake: Sam's keys reached out at 2.2 s while Priya was still walking in, so
  // both "touched" air). When two figures touch EACH OTHER, the touch starts when the LATER one arrives — the earlier one holds its
  // hand out and waits — and lasts until both are done. Family: handshakes, high-fives, fist bumps, hand-offs, hugs, partner pats.
  const fig = (c: SceneContact) => ("figure" in c.target ? (c.target as { figure: string }).figure : null);
  for (const a of out) for (const b of out) {
    if (a === b || fig(a) !== b.figure || fig(b) !== a.figure || Math.abs(a.from - b.from) > 3) continue;
    const from = Math.max(a.from, b.from), to = Math.max(a.to, b.to, from + KEY_TOUCH_SEC);
    a.from = b.from = from; a.to = b.to = to;
  }
  return out;
}
