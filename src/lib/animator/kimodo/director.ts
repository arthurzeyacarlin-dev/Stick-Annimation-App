// THE DIRECTOR FOR TWO+ PEOPLE (SPEC-0025 Phase 2): Kimodo makes each person ALONE, so the director makes them meet.
// HITS LAND: a real motion with `hits: "<figure id>"` is an attack on that figure. The director builds the scene once, finds the
// attacker's STRIKE (the picture where a fist reaches furthest toward the target), and moves the target so its HEAD is right
// where that fist arrives at that moment. The target's own real motion carries the reaction (its move list is timed so "gets
// punched" starts at the strike). Kimodo's motion is never changed — only where people stand.
import { buildScene } from "../engine.ts";
import { makeEffectsTestScene } from "../moves/tests2c.ts";
import { findMotion, type KimodoClip } from "./library.ts";

type Act = { move?: string; params?: Record<string, unknown> };
// (LIVE CLIPS, Oct 17 R3: a motion Kimodo made live for this plan travels inside it — params.clip; else the saved library)
const clipOf = (a: Act | undefined) => { const c = a?.params?.clip as KimodoClip | undefined; return c && Array.isArray(c.frames) && c.frames.length > 1 ? c : findMotion(String(a?.params?.motion ?? "")); };
type Ch = { id: string; x?: number; actions?: Act[] };

export function aimRealHits(plan: Record<string, unknown>): Record<string, unknown> {
  const chars = (plan.characters as Ch[] | undefined) ?? [];
  const attacks = chars.flatMap((c) => (c.actions ?? []).map((a, i) => ({ c, a, n: (c.actions ?? []).slice(0, i + 1).filter((x) => x.move === "realMotion").length })).filter(({ a }) => a.move === "realMotion" && typeof a.params?.hits === "string"));
  if (!attacks.length) return plan;
  let out = plan;
  for (const { c, n, a } of attacks) {
    const targetId = String(a.params!.hits);
    let scene: ReturnType<typeof makeEffectsTestScene> & { marks?: Record<string, number> }, built: ReturnType<typeof buildScene>;
    try { scene = makeEffectsTestScene(out as never, 1920) as never; built = buildScene({ ...scene, contacts: undefined }, 24); } catch { return out; }
    const marks = scene.marks ?? {}, fps = built.fps;
    const t0 = marks[`${c.id}.realMotion${n}.start`], t1 = marks[`${c.id}.realMotion${n}.done`];
    if (t0 === undefined || t1 === undefined) continue;
    let best: { i: number; fist: { x: number; y: number }; reach: number } | null = null;
    // (when the director knows THE strike — it timed the target's "gets hit" to it — it aims at that moment, not at the
    // longest reach: a straight jab reaches further than the hook that is meant to land)
    const strike = Number(a.params!.strike), only = Number.isFinite(strike) ? Math.round((t0 + strike) * fps) : -1;
    for (let i = Math.ceil(t0 * fps); i <= Math.min(built.frames.length - 1, Math.floor(t1 * fps)); i += 1) {
      if (only >= 0 && Math.abs(i - only) > 1) continue;
      const me = built.frames[i].find((x) => x.id === c.id), them = built.frames[i].find((x) => x.id === targetId);
      if (!me || !them) continue;
      const toward = Math.sign(them.skeleton.hip.x - me.skeleton.hip.x) || 1;
      for (const h of ["lHand", "rHand"] as const) {
        const reach = (me.skeleton[h].x - me.skeleton.neck.x) * toward; // (how far the fist is out in front, toward the target)
        if (!best || reach > best.reach) best = { i, fist: me.skeleton[h], reach };
      }
    }
    if (!best) continue;
    const them = built.frames[best.i].find((x) => x.id === targetId)!, me = built.frames[best.i].find((x) => x.id === c.id)!;
    const toward = Math.sign(them.skeleton.hip.x - me.skeleton.hip.x) || 1;
    // (the head's near edge meets the fist: move the target so it does — along the ground only)
    const dx = best.fist.x - (them.skeleton.head.x - toward * them.headRadius);
    out = { ...out, characters: ((out.characters as Ch[]) ?? []).map((x) => x.id === targetId ? { ...x, x: Math.round((x.x ?? 0) + dx) } : x) };
    // (and the last few pixels: the striking fist is ON the head at the strike — the engine's contact pass snaps it, eases in/out)
    const hand = Math.abs(me.skeleton.lHand.x - best.fist.x) < 0.5 && Math.abs(me.skeleton.lHand.y - best.fist.y) < 0.5 ? "lHand" : "rHand", tS = best.i / fps;
    out = { ...out, directorContacts: [...(((out as { directorContacts?: unknown[] }).directorContacts) ?? []), { figure: c.id, joint: hand, target: { figure: targetId, joint: "head", offset: { x: -toward * them.headRadius, y: 0 } }, from: tS - 1 / fps, to: tS + 1 / fps, blendPictures: 3 }] };
  }
  return out;
}

// BEATS (Oct 16, Arthur: "they aren't touching, not blocking, no reactions"). Kimodo makes each person alone, so their real moments
// don't meet: a punch is fully out at 0.7 s but the other head snaps back at 2.9 s. A scene names its beats in order —
//   plan.beats = [{ by: "a", on: "b", result: "hit" | "block" | "touch" | "sync" | "react" }]
// and the director FINDS each moment in Kimodo's real motion (from the drawn joints, side view):
//   * a STRIKE = a fist or foot shooting out fast to full reach (rises ≥ 0.2 H in ≤ 0.35 s);
//   * a SNAP = the head jerking away from the other person (the start of the jerk);
//   * a BLOCK = a hand up in front of the face, furthest out;   * a PUMP = a fist at the bottom of its shake (rock-paper-scissors);
//   * a START = the first real movement after standing (a reaction to a wave or a point).
// Then the SECOND person's clock is lined up so each of their moments lands on the first person's (timeMap in moves/realMotion.ts:
// only when pictures are shown changes), they are placed where the contact happens, and the last pixels are snapped by the engine.
type Beat = { by: string; on: string; result: "hit" | "block" | "touch" | "sync" | "react" };
type Fr = { id: string; skeleton: Record<string, { x: number; y: number }>; headRadius: number };
const HANDS = ["lHand", "rHand"] as const, LIMBS = ["lHand", "rHand", "lFoot", "rFoot"] as const;

export function moments(frames: Fr[][], id: string, other: string, fps: number, t0: number, t1: number, H: number, need = 0) {
  const at = (i: number) => frames[i].find((x) => x.id === id)!, them = (i: number) => frames[i].find((x) => x.id === other)!;
  // (from 0.35 s in: the first moment is the ease from standing into the clip — never a strike or a snap)
  const i0 = Math.max(1, Math.ceil((t0 + 0.35) * fps)), i1 = Math.min(frames.length - 2, Math.floor(t1 * fps));
  const toward = (i: number) => Math.sign(them(i).skeleton.hip.x - at(i).skeleton.hip.x) || 1;
  const reach = (i: number, l: string) => (at(i).skeleton[l].x - (l.endsWith("Foot") ? at(i).skeleton.hip.x : at(i).skeleton.neck.x)) * toward(i);
  const strikes: { t: number; limb: string }[] = [], snaps: number[] = [], blocks: { t: number; limb: string }[] = [], pumps: number[] = [];
  const W = Math.round(0.35 * fps);
  // (a STRIKE = a fist, or a RAISED foot, moving fast against the body — jab, hook, uppercut, push or kick alike; the HIT is the
  // picture where it arrives: its speed falls below half of that burst's top speed. Walking feet never count: a foot must be up.)
  const rel = (i: number, l: string) => { const s = at(i).skeleton, b = l.endsWith("Foot") ? s.hip : s.neck; return { x: s[l].x - b.x, y: s[l].y - b.y }; };
  const sp = (i: number, l: string) => { const a = rel(i, l), b = rel(i - 1, l); return Math.hypot(a.x - b.x, a.y - b.y) * fps; };
  // (THE BEATS SAY HOW MANY: Kimodo's punches differ a lot in speed — a sharp one 4 H/s, a soft one 1 H/s — so no single speed
  // works. Every burst counts (a local top of speed ≥ 0.6 H/s, scored by its speed plus how far it went out or up), and the
  // person's `need` strongest are their strikes, in time order.)
  const bursts: { t: number; limb: string; score: number }[] = [];
  for (const l of LIMBS) for (let i = i0; i <= i1; i += 1) {
    if (l.endsWith("Foot") && at(i).skeleton[l].y > at(i).skeleton.hip.y + 0.2 * H) continue;
    const v = sp(i, l);
    if (v < 0.6 * H || v < sp(i - 1, l) || v < sp(i + 1, l)) continue;
    let hit = i; while (hit + 1 <= i1 && sp(hit + 1, l) > 0.5 * v) hit += 1;
    const j = Math.max(0, i - W), gain = Math.max(reach(hit, l) - reach(j, l), (rel(j, l).y - rel(hit, l).y) * 0.8);
    // (a hand that ends UP — a high five, a punch at the head — counts more than an arm swinging by the hips while walking)
    const raised = !l.endsWith("Foot") && at(hit).skeleton[l].y < at(hit).skeleton.neck.y + 0.05 * H ? 1.5 : 0;
    if (gain > 0.04 * H) bursts.push({ t: hit / fps, limb: l, score: v / H + (3 * gain) / H + raised });
  }
  bursts.sort((a, b) => b.score - a.score);
  for (const b of bursts) if (strikes.length < need && strikes.every((x) => Math.abs(x.t - b.t) >= 0.3)) strikes.push({ t: b.t, limb: b.limb });
  strikes.sort((a, b) => a.t - b.t);
  // (the head jerking away: its speed away from the other person, relative to nothing — a snap is fast; its START is the moment)
  const away = (i: number) => (at(i).skeleton.head.x - at(i - 1).skeleton.head.x) * -toward(i) * fps;
  const peak = Math.max(0, ...Array.from({ length: i1 - i0 + 1 }, (_, k) => away(i0 + k)));
  if (peak > 0.35 * H) for (let i = i0; i <= i1; i += 1) if (away(i) >= 0.35 * peak && away(i - 1) < 0.35 * peak && (!snaps.length || i / fps - snaps[snaps.length - 1] > 0.5)) snaps.push(i / fps);
  for (let i = i0; i <= i1; i += 1) for (const l of HANDS) {
    const s = at(i).skeleton, r = reach(i, l);
    if (s[l].y < s.neck.y && r > 0.1 * H && r >= reach(i - 1, l) && r >= reach(i + 1, l) && (!blocks.length || i / fps - blocks[blocks.length - 1].t > 0.35)) blocks.push({ t: i / fps, limb: l });
  }
  for (let i = i0; i <= i1; i += 1) {
    const y = Math.max(...HANDS.map((l) => at(i).skeleton[l].y - at(i).skeleton.neck.y)), yp = Math.max(...HANDS.map((l) => at(i - 1).skeleton[l].y - at(i - 1).skeleton.neck.y)), yn = Math.max(...HANDS.map((l) => at(i + 1).skeleton[l].y - at(i + 1).skeleton.neck.y));
    const top = Math.min(...Array.from({ length: W }, (_, k) => Math.max(...HANDS.map((l) => at(Math.max(0, i - 1 - k)).skeleton[l].y - at(Math.max(0, i - 1 - k)).skeleton.neck.y))));
    if (y >= yp && y > yn && y - top > 0.04 * H && (!pumps.length || i / fps - pumps[pumps.length - 1] > 0.25)) pumps.push(i / fps);
  }
  // (the first real movement: summed joint speed passes 30% of its biggest)
  const speed = (i: number) => Object.keys(at(i).skeleton).reduce((t, k) => t + Math.hypot(at(i).skeleton[k].x - at(i - 1).skeleton[k].x, at(i).skeleton[k].y - at(i - 1).skeleton[k].y), 0);
  const top = Math.max(...Array.from({ length: i1 - i0 + 1 }, (_, k) => speed(i0 + k)));
  let start = t0 + 0.3; for (let i = Math.max(i0, Math.ceil((t0 + 0.3) * fps)); i <= i1; i += 1) if (speed(i) > 0.3 * top) { start = i / fps; break; }
  return { strikes, snaps, blocks, pumps, start };
}

// WHERE A HIT LANDS (Oct 16: a kick to the stomach and a push on the chest were aimed at the head): at the striking fist's / foot's
// HEIGHT — above the neck it is the head (just inside its edge at that height), below it the body line between neck and hips.
function landing(B: Fr, p: { x: number; y: number }, toward: number) {
  const s = B.skeleton, r = B.headRadius;
  if (p.y < s.neck.y) { const dy = Math.max(-0.7 * r, Math.min(0.7 * r, p.y - s.head.y)); return { j: "head", off: { x: -toward * 0.85 * Math.sqrt(r * r - dy * dy), y: dy } }; }
  const y = Math.min(s.hip.y, p.y), u = (y - s.neck.y) / ((s.hip.y - s.neck.y) || 1), x = s.neck.x + (s.hip.x - s.neck.x) * u;
  return { j: "neck", off: { x: x - s.neck.x - toward * 3, y: y - s.neck.y } };
}

export function directBeats(plan: Record<string, unknown>): Record<string, unknown> {
  const beats = (plan.beats as Beat[] | undefined) ?? [];
  const chars = (plan.characters as Ch[] | undefined) ?? [];
  if (!beats.length) return plan;
  const lead = beats[0].by, follow = beats[0].on;
  const realOf = (c: Ch | undefined) => (c?.actions ?? []).findIndex((a) => a.move === "realMotion");
  const fc = chars.find((c) => c.id === follow), fi = realOf(fc);
  if (!fc || fi < 0 || realOf(chars.find((c) => c.id === lead)) < 0) return plan;
  // ONE 3D STAGE (Session A3): two people made TOGETHER (make_clips.py duet — same clock, contact already true in 3D) are only put on
  // their shared stage and filmed by one camera (moves/realMotion.ts StageView). No 2D sliding, snapping, re-timing or facing
  // guesses: those flattened each person separately and folded the punching arm (Oct 16 review).
  const lc0 = chars.find((c) => c.id === lead), li0 = realOf(lc0);
  const ca = clipOf((lc0?.actions ?? [])[li0]), cb = clipOf((fc.actions ?? [])[fi]);
  if (ca.stage && cb.stage && ca.stage.S > 0.2) {
    const f0 = ca.frames[0] as Record<string, number[]>, tall = f0.HeadEnd[1] - Math.min(f0.LeftFoot[1], f0.RightFoot[1]);
    // (THE CAMERA LOOKS ACROSS THE PAIR, Oct 16: people shaking hands stand a little diagonal, like real people — seen from the plain
    // side they tangled. At the contact moment the camera turns so the line between the two hips runs across the picture, +18°.)
    const tC = ca.touch ? (ca.touch.from + ca.touch.to) / 2 : (ca.hits?.[0] ?? 0), k = (c: typeof ca) => Math.min(c.frames.length - 1, Math.max(0, Math.round(tC * c.fps)));
    const ha = (ca.frames[k(ca)] as Record<string, number[]>).Hips, hb = (cb.frames[k(cb)] as Record<string, number[]>).Hips;
    const across = Math.atan2(-hb[0] - ha[0], ca.stage.S - hb[2] - ha[2]);
    const H0 = Number(plan.height) || 240, view = { originX: Number(lc0!.x ?? 800), S: ca.stage.S, floor: ca.stage.floor, theta: across + ((Number(plan.stageTheta) || 18) * Math.PI) / 180, scale: H0 / Math.max(0.5, tall) };
    const put = (c: Ch, k: number, side: number) => { const acts = [...(c.actions ?? [])]; acts[k] = { ...acts[k], params: { ...(acts[k].params ?? {}), stage: { ...view, side } } }; return { ...c, actions: acts }; };
    return { ...plan, characters: chars.map((c) => (c.id === lead ? put(c, li0, ca.stage!.side) : c.id === follow ? put(c, fi, cb.stage!.side) : c)), directorReport: { stage: view } };
  }
  const build = (p: Record<string, unknown>) => { const scene = makeEffectsTestScene(p as never, 1920) as never as { marks?: Record<string, number>; height?: number }; const b = buildScene({ ...(scene as object), contacts: undefined } as never, 24); return { scene, b }; };
  const H = Number(plan.height) || 240;
  const read = (p: Record<string, unknown>) => {
    const { scene, b } = build(p), m = scene.marks ?? {}, fps = b.fps, frames = b.frames as unknown as Fr[][];
    const win = (id: string) => [m[`${id}.realMotion1.start`] ?? 0, m[`${id}.realMotion1.done`] ?? frames.length / fps];
    const [a0, a1] = win(lead), [b0, b1] = win(follow);
    const need = (id: string) => beats.filter((b) => b.by === id && b.result !== "sync" && b.result !== "react").length + beats.filter((b) => b.on === id && b.result === "touch").length + (beats.some((b) => b.by === id && b.result === "react") ? 1 : 0);
    return { frames, fps, b0, a0, L: moments(frames, lead, follow, fps, a0, a1, H, need(lead)), F: moments(frames, follow, lead, fps, b0, b1, H, need(follow)) };
  };
  let r: ReturnType<typeof read>;
  try { r = read(plan); } catch { return plan; }
  // (A REACTION MADE FOR ITS HIT knows its own hit times — make_clips.py react: it was told "get hit at 1.0 s" and knocked back
  // there — so the director uses those exact times, never a guess from the motion)
  const known = clipOf((fc.actions ?? [])[fi]).hits;
  if (known?.length) r.F.snaps = known.map((h) => r.b0 + h);
  // (ONE PLAN FOR BOTH, Session A2: an attacker made from the same plan knows its real hit times and limbs too — make_clips.py duet)
  const lc = chars.find((c) => c.id === lead), lClip = clipOf((lc?.actions ?? [])[realOf(lc)]);
  const LIMB: Record<string, string> = { LeftHand: "lHand", RightHand: "rHand", LeftFoot: "lFoot", RightFoot: "rFoot" };
  if (lClip.hits?.length && lClip.limbs?.length === lClip.hits.length) r.L.strikes = lClip.hits.map((h, k) => ({ t: r.a0 + h, limb: LIMB[lClip.limbs![k]] ?? "rHand" }));
  // 1. THE CLOCK: pair each beat's moment of the follower with the leader's, in order
  const used = { Ls: 0, Lsn: 0, Fs: 0, Fsn: 0, Fb: 0, Lp: 0, Fp: 0 }, pairs: [number, number][] = [], contacts: { t: number; by: string; limb: string; on: string; result: string }[] = [];
  for (const bt of beats) {
    const leaderActs = bt.by === lead;
    if (bt.result === "sync") { for (let k = 0; k < Math.min(r.L.pumps.length, r.F.pumps.length); k += 1) pairs.push([r.F.pumps[k], r.L.pumps[k]]); continue; }
    if (bt.result === "react") { const lt = (r.L.strikes[used.Ls] ?? { t: r.L.start + 0.6 }).t; pairs.push([r.F.start, lt + 0.35]); continue; }
    if (leaderActs) {
      const s = r.L.strikes[used.Ls++]; if (!s) continue;
      const fm = bt.result === "hit" ? (r.F.snaps[used.Fsn++] ?? (used.Fsn === 1 ? r.F.start : undefined)) : bt.result === "block" ? r.F.blocks[used.Fb++]?.t : r.F.strikes[used.Fs++]?.t;
      if (fm !== undefined) pairs.push([fm, bt.result === "hit" ? s.t + 1 / 24 : s.t]);
      contacts.push({ t: s.t, by: bt.by, limb: s.limb, on: bt.on, result: bt.result });
    } else {
      const s = r.F.strikes[used.Fs++]; if (!s) continue;
      const lm = bt.result === "hit" ? r.L.snaps[used.Lsn++] : bt.result === "block" ? r.L.blocks[used.Lp++]?.t : r.L.strikes[used.Ls++]?.t;
      if (lm !== undefined) pairs.push([s.t, bt.result === "hit" ? lm - 1 / 24 : lm]);
      contacts.push({ t: lm !== undefined ? (bt.result === "hit" ? lm - 1 / 24 : lm) : s.t, by: bt.by, limb: s.limb, on: bt.on, result: bt.result });
    }
  }
  // (scene time → this person's clip time; keep the order, and the speed between 0.6x and 1.7x)
  const map: [number, number][] = [];
  for (const [ft, lt] of pairs.sort((x, y) => x[0] - y[0])) {
    const clipT = ft - r.b0, sceneT = lt - r.b0, last = map[map.length - 1];
    if (last && (clipT - last[0] < 0.1 || (sceneT - last[1]) / (clipT - last[0]) < 0.6 || (sceneT - last[1]) / (clipT - last[0]) > 1.7)) continue;
    map.push([clipT, sceneT]);
  }
  let out = plan;
  if (map.length) {
    const acts = [...(fc.actions ?? [])]; acts[fi] = { ...acts[fi], params: { ...(acts[fi].params ?? {}), timeMap: map } };
    out = { ...plan, characters: chars.map((c) => (c.id === follow ? { ...c, actions: acts } : c)) };
  }
  // THE 3 MOMENTS OF A TOUCH (Oct 17 R3b — Arthur: "one is early, one is late"; Fable's rules): when both people's live clips
  // carry their measured moments (arm starts, touch pose, let go — kimodo/live_clip.py touch_moments, the bridge already kept
  // the take PAIR that matches best), the follower's clock is lined up on ALL THREE: the touch pose lands EXACTLY on the
  // leader's, the arm start and the let go as close as the speed limit allows (0.75x–1.35x — a bigger change would spoil
  // Kimodo's feel), and BOTH hold the touch for 2 more pictures. Only WHEN pictures show changes; never a pose.
  const ma = ca.moments, mb = cb.moments;
  if (ma && mb && beats.every((b) => b.result === "touch")) {
    const F = 1 / 24, clampR = (x: number) => Math.min(1.35, Math.max(0.75, x));
    const S = ma.start, T = ma.touch, G = ma.letgo + 2 * F, shift = r.a0 - r.b0; // (leader scene times, relative to its own start)
    const lacts = [...(lc0!.actions ?? [])]; lacts[li0] = { ...lacts[li0], params: { ...(lacts[li0].params ?? {}), timeMap: [[T, T], [T + F, T + 3 * F]] } };
    const tT = T + shift, tS = S + shift, tG = G + shift, fmap: [number, number][] = [];
    if (mb.touch - mb.start > 2 * F) fmap.push([mb.start, tT - clampR((tT - tS) / (mb.touch - mb.start)) * (mb.touch - mb.start)]);
    fmap.push([mb.touch, tT], [mb.touch + F, tT + 3 * F]);
    if (mb.letgo - mb.touch > 3 * F) fmap.push([mb.letgo, tT + 3 * F + clampR((tG - (tT + 3 * F)) / (mb.letgo - mb.touch - F)) * (mb.letgo - mb.touch - F)]);
    const facts = [...(fc.actions ?? [])]; facts[fi] = { ...facts[fi], params: { ...(facts[fi].params ?? {}), timeMap: fmap } };
    out = { ...plan, characters: chars.map((c) => (c.id === lead ? { ...c, actions: lacts } : c.id === follow ? { ...c, actions: facts } : c)), touchAt: [{ by: lead, on: follow, t: r.a0 + T, until: r.a0 + G, hand: ma.hand }] };
    contacts.length = 0; contacts.push({ t: r.a0 + T + 1 * F, by: lead, limb: ma.hand, on: follow, result: "touch" });
  }
  // (A GENTLE TOUCH, Oct 17 R3 — handing a hammer over has no fast "strike", so no contact was found and the giver walked right
  // through the taker: then the touch is where the leader's hand reaches out FURTHEST toward the other person in its clip)
  if (!contacts.length && beats.some((b) => b.result === "touch")) {
    try { r = read(out); } catch { return out; }
    let best: { t: number; limb: string; reach: number } | null = null;
    for (let i = Math.ceil((r.a0 + 0.35) * r.fps); i < r.frames.length; i += 1) {
      const A = r.frames[i].find((x) => x.id === lead), B = r.frames[i].find((x) => x.id === follow);
      if (!A || !B) continue;
      const toward = Math.sign(B.skeleton.hip.x - A.skeleton.hip.x) || 1;
      for (const l of HANDS) { const reach = (A.skeleton[l].x - A.skeleton.neck.x) * toward; if (!best || reach > best.reach) best = { t: i / r.fps, limb: l, reach }; }
    }
    if (best) contacts.push({ t: best.t, by: lead, limb: best.limb, on: follow, result: "touch" });
  }
  // 2. THE PLACE: move the follower so the first contact meets (a fist on the head's near edge, a fist on the blocking hand, hand to hand)
  if (!contacts.length) return out;
  try { r = read(out); } catch { return out; }
  const c0 = contacts[0], i = Math.min(r.frames.length - 1, Math.round(c0.t * r.fps));
  const A = r.frames[i].find((x) => x.id === c0.by)!, B = r.frames[i].find((x) => x.id === c0.on)!;
  const toward = Math.sign(B.skeleton.hip.x - A.skeleton.hip.x) || 1;
  const l0 = landing(B, A.skeleton[c0.limb], toward);
  const goal = c0.result === "hit" ? { x: B.skeleton[l0.j].x + l0.off.x, j: l0.j, off: l0.off.x } : (() => { const h = HANDS.reduce((m, l) => (Math.abs(B.skeleton[l].x - A.skeleton[c0.limb].x) < Math.abs(B.skeleton[m].x - A.skeleton[c0.limb].x) ? l : m), "lHand" as string); return { x: B.skeleton[h].x, j: h, off: 0 }; })();
  const dx = (A.skeleton[c0.limb].x - goal.x) * (c0.on === follow ? 1 : -1);
  out = { ...out, characters: ((out.characters as Ch[]) ?? []).map((x) => (x.id === follow ? { ...x, x: Math.round((x.x ?? 0) + dx) } : x)) };
  // 2b. BODIES NEVER STAND INSIDE EACH OTHER (Oct 16: the high-fivers kept walking into each other): hip to hip at least 0.3 H in
  // every picture, on the same sides they started — if not, the second person stands back by what is missing.
  try { r = read(out); } catch { return out; }
  { const side = Math.sign((r.frames[0].find((x) => x.id === follow)!.skeleton.hip.x) - (r.frames[0].find((x) => x.id === lead)!.skeleton.hip.x)) || 1;
    const gaps = r.frames.map((f) => (f.find((x) => x.id === follow)!.skeleton.hip.x - f.find((x) => x.id === lead)!.skeleton.hip.x) * side);
    // (AFTER the last contact, walking on into the other person is just the clip running on: both stop there and stay standing —
    // their real motion is cut, never changed. Before or during the contacts, the second person stands back instead.)
    const lastT = Math.max(...contacts.map((c) => c.t)), late = gaps.findIndex((g, i) => i / r.fps > lastT + 0.3 && g < 0.3 * H);
    if (late > 0 && Math.min(...gaps.slice(0, late)) >= 0.3 * H) {
      const cut = late / r.fps;
      out = { ...out, characters: ((out.characters as Ch[]) ?? []).map((x) => { const k = realOf(x); if (k < 0) return x; const acts = [...(x.actions ?? [])], m = (acts[k].params?.timeMap as [number, number][] | undefined) ?? []; const sceneStart = 0;
        // (scene second → clip second for this person, through its clock)
        let clipT = cut - sceneStart; for (let q = m.length - 1; q >= 0; q -= 1) if (cut >= m[q][1]) { clipT = m[q][0] + (cut - m[q][1]); break; }
        acts[k] = { ...acts[k], params: { ...(acts[k].params ?? {}), seconds: Math.max(0.6, clipT) } }; return { ...x, actions: acts }; }) };
      try { r = read(out); } catch { return out; }
    }
    const gap = Math.min(...r.frames.map((f) => (f.find((x) => x.id === follow)!.skeleton.hip.x - f.find((x) => x.id === lead)!.skeleton.hip.x) * side));
    if (gap < 0.3 * H) { out = { ...out, characters: ((out.characters as Ch[]) ?? []).map((x) => (x.id === follow ? { ...x, x: Math.round((x.x ?? 0) + side * (0.3 * H - gap)) } : x)) }; try { r = read(out); } catch { return out; } } }
  // 3. THE LAST PIXELS: every contact is snapped by the engine's contact pass (eases in and out), if it is already close
  const snaps = contacts.flatMap((c) => {
    const k = Math.min(r.frames.length - 1, Math.round(c.t * r.fps)), a = r.frames[k].find((x) => x.id === c.by)!, b = r.frames[k].find((x) => x.id === c.on)!;
    const tw = Math.sign(b.skeleton.hip.x - a.skeleton.hip.x) || 1;
    const land = landing(b, a.skeleton[c.limb], tw);
    const j = c.result === "hit" ? land.j : HANDS.reduce((m, l) => (Math.hypot(b.skeleton[l].x - a.skeleton[c.limb].x, b.skeleton[l].y - a.skeleton[c.limb].y) < Math.hypot(b.skeleton[m].x - a.skeleton[c.limb].x, b.skeleton[m].y - a.skeleton[c.limb].y) ? l : m), "lHand" as string);
    // (a hit sinks a little into the head: it LANDS, never stops short)
    const off = c.result === "hit" ? land.off.x : 0, offY = c.result === "hit" ? land.off.y : 0, tx = b.skeleton[j].x + off, ty = b.skeleton[j].y + offY;
    if (Math.hypot(a.skeleton[c.limb].x - tx, a.skeleton[c.limb].y - ty) > 0.18 * H) return [];
    // (A TOUCH MEETS IN THE MIDDLE: a high five or a fist bump — both hands reach halfway, nobody's arm does all of it)
    if (c.result === "touch") {
      const hx = (b.skeleton[j].x - a.skeleton[c.limb].x) / 2, hy = (b.skeleton[j].y - a.skeleton[c.limb].y) / 2;
      return [{ figure: c.by, joint: c.limb, target: { figure: c.on, joint: j, offset: { x: -hx, y: -hy } }, from: c.t, to: c.t + 0.4 / 24, blendPictures: 3 },
        { figure: c.on, joint: j, target: { figure: c.by, joint: c.limb, offset: { x: hx, y: hy } }, from: c.t, to: c.t + 0.4 / 24, blendPictures: 3 }];
    }
    return [{ figure: c.by, joint: c.limb, target: { figure: c.on, joint: j, offset: { x: off, y: offY } }, from: c.t, to: c.t + 0.4 / 24, blendPictures: 3 }];
  });
  return { ...out, directorContacts: [...(((out as { directorContacts?: unknown[] }).directorContacts) ?? []), ...snaps], directorReport: { pairs, contacts, L: { strikes: r.L.strikes, snaps: r.L.snaps }, F: { strikes: r.F.strikes, snaps: r.F.snaps, blocks: r.F.blocks.length, pumps: r.F.pumps } } };
}
