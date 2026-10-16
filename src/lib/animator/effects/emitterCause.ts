// EMITTERS ONLY WHEN THEIR CAUSE IS TRUE (Arthur, Oct 14, the bubble wand: "he should only blow bubbles when it's next to his face —
// he's shooting bubbles a mile away from him"). Things that come OUT of something held come out only while the thing is really being
// used: a bubble wand makes bubbles only while its loop is at the mouth (being blown) or swept fast through the air (waved); a
// whistle / trumpet / flute / kazoo / harmonica / a blowpipe sounds or puffs only at the mouth. While the cause is false, no new
// piece comes out — the pieces already out keep floating on (EMITTED THINGS LIVE IN THE WORLD, random.ts sourceAt).
// One shared gate, worked out per picture from the BUILT pictures (where the emitter's source is, where its figure's head is, how fast
// the source moves); every emitter recipe asks `ctx.emitsAt(born)` before letting a piece be born. A plan can say it outright with
// params.needs: "mouth" | "moving" | "mouthOrMoving" | "none".
import type { FrameCharacter } from "../engine.ts";
import type { EffectTrack, Point } from "./types.ts";

export type EmitterNeed = "mouth" | "moving" | "mouthOrMoving";
const NEEDS = new Set(["mouth", "moving", "mouthOrMoving"]);
// (things you put to your mouth to use)
const AT_MOUTH = /whistle|trumpet|horn|flute|kazoo|harmonica|recorder|blowpipe|bugle|saxophone|clarinet|straw/i;
const BLOWN = /wand|bubble/i;

// What the emitter needs to be true before anything comes out (undefined = it always emits while its track runs).
export function emitterNeed(track: EffectTrack, tracks: readonly EffectTrack[]): EmitterNeed | undefined {
  const p = track.params ?? {};
  if (p.needs === "none" || p.needs === false) return undefined;
  if (typeof p.needs === "string" && NEEDS.has(p.needs)) return p.needs as EmitterNeed;
  const a = track.anchor as { character?: string; joint?: string };
  if (!a.character || !/Hand$/.test(String(a.joint)) || track.kind === "prop") return undefined;
  if (track.kind === "bubbles" && p.motion === "float") return undefined;
  // (what that hand holds while this emitter runs)
  const held = tracks.filter((e) => e.kind === "prop" && e.start < track.end && e.end > track.start && (e.anchor as { character?: string }).character === a.character && (e.anchor as { joint?: string }).joint === a.joint);
  const names = held.map((e) => `${e.params?.name ?? ""} ${e.params?.symbol ?? ""}`).join(" ");
  if (AT_MOUTH.test(names)) return "mouth";
  if (track.kind === "bubbles" && (BLOWN.test(names) || held.length > 0)) return "mouthOrMoving";
  return undefined;
}

// How near the mouth (x figure height) counts as AT the mouth. A WAVE: within about WAVE_WINDOW_S either side, the source makes fast
// sweeps (≥ SWEEP_SPEED x height a second) in OPPOSITE directions — back and forth. Lifting the wand up to the mouth or lowering it is
// one move one way, not a wave.
export const MOUTH_NEAR = 0.2, SWEEP_SPEED = 1.2, WAVE_WINDOW_S = 0.75;

// Where a figure's mouth is: just in front of and a little below the middle of its head.
export function mouthOf(c: FrameCharacter): Point {
  const side = c.facing === "left" ? -1 : c.facing === "right" ? 1 : 0, h = c.skeleton.head, r = c.headRadius;
  return { x: h.x + side * 0.6 * r, y: h.y + 0.35 * r };
}

// Per picture: is the cause true? `src[j]` = the emitter's source in picture j, `who[j]` = its figure there.
export function causeList(need: EmitterNeed, src: readonly (Point | undefined)[], who: readonly (FrameCharacter | undefined)[], fps: number, height: number): boolean[] {
  const n = src.length, w = Math.max(1, Math.round(WAVE_WINDOW_S * fps));
  const atMouth = src.map((s, j) => { const c = who[j]; if (!s || !c) return false; const m = mouthOf(c); return Math.hypot(s.x - m.x, s.y - m.y) <= MOUTH_NEAR * height + c.headRadius; });
  // (each step's direction when it is a fast sweep)
  const sweep = src.map((s, j) => {
    const p = src[j - 1];
    if (!s || !p) return undefined;
    const dx = s.x - p.x, dy = s.y - p.y, d = Math.hypot(dx, dy);
    return d * fps >= SWEEP_SPEED * height ? { x: dx / d, y: dy / d } : undefined;
  });
  const waving = src.map((s, j) => {
    if (!s || !who[j]) return false;
    const dirs = sweep.slice(Math.max(0, j - w), Math.min(n, j + w + 1)).filter((v): v is Point => !!v);
    return dirs.some((a) => dirs.some((b) => a.x * b.x + a.y * b.y < -0.3));
  });
  const raw = src.map((_, j) => (need === "mouth" ? atMouth[j] : need === "moving" ? waving[j] : atMouth[j] || waving[j]));
  // (no flicker: a true moment shorter than 2 pictures between false ones is noise, and a false gap that short is bridged)
  const out = raw.slice();
  for (let j = 1; j + 1 < raw.length; j += 1) if (raw[j - 1] === raw[j + 1] && raw[j] !== raw[j - 1]) out[j] = raw[j - 1];
  return out;
}
