// LIVE KIMODO (Oct 17, R1 — dad OK'd the Modal connection): every realMotion action whose `motion` is a SENTENCE (not a saved clip
// id) is made by Kimodo right now, and the clip is put INSIDE the plan (params.clip), so the canvas, the laws and the renderer all
// use the very same motion. Kimodo itself is never changed — we only send it words, seconds and a seed (kimodo/live_clip.py).
// Same sentence + seconds + seed again = instant and free (live-cache/). Any failure → the saved library, never a broken scene.
import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import { MOTIONS, makeClip, type KimodoClip, type KimodoFrame } from "./library.ts";

const BRIDGE = process.env.KIMODO_LIVE_SCRIPT ?? "/Users/arthurcarlin/Projects/diamond-review/kimodo/live_clip.py";
const LIVE_TIMEOUT_MS = 4 * 60_000; // (a cold start loads the model: ~1–2 min; a warm call ~20–60 s)

type Action = { move?: string; params?: Record<string, unknown> };
type Char = { id?: string; actions?: Action[] };

export const isSavedClip = (motion: string) => MOTIONS.some((m) => m.id === motion.trim());

type Step = { text: string; seconds: number };
// (the 3 moments of a touch, measured by the bridge on the kept take, in clip seconds — kimodo/live_clip.py touch_moments)
export type TouchMoments = { start: number; touch: number; letgo: number; hand: "rHand" | "lHand" };
// (R1b, Oct 17: the words go as SHORT STEPS — Kimodo's own multi-step prompt — and Kimodo makes TAKES takes in one call; the bridge's
// checker (no AI) keeps the take that best SHOWS what the plan asks: knees-high, big-steps, slip, fast-fall, hands-up)
export const TAKES = 3;
export const SHOW_SIGNS = ["knees-high", "big-steps", "slip", "fast-fall", "hands-up", "stomp", "turn-around", "nod", "reach"] as const;
function liveClip(steps: Step[], seed: number, show: string[], signal?: AbortSignal): Promise<{ clip: KimodoClip | null; cached: boolean; sec: number; take?: number; error?: string }> {
  const req = JSON.stringify({ steps, seed, takes: show.length ? TAKES : 1, show }); // (3 takes only when the look must SHOW something: ~2.5x slower)
  return new Promise((resolve) => {
    execFile("nice", ["-n", "10", "python3", BRIDGE, req], { timeout: LIVE_TIMEOUT_MS, signal, maxBuffer: 1 << 20 }, (err, stdout) => {
      try {
        const line = String(stdout).trim().split("\n").pop() ?? "";
        const r = JSON.parse(line) as { ok: boolean; file?: string; cached?: boolean; sec?: number; take?: number; error?: string };
        if (!r.ok || !r.file) return resolve({ clip: null, cached: false, sec: 0, error: r.error ?? String(err ?? "no answer") });
        const data = JSON.parse(readFileSync(r.file, "utf8")) as { fps: number; srcFps?: number; blended?: boolean; frames: KimodoFrame[] };
        resolve({ clip: makeClip(`live-${seed}`, steps.map((x) => x.text).join(" "), data), cached: !!r.cached, sec: r.sec ?? 0, take: r.take });
      } catch (e) { resolve({ clip: null, cached: false, sec: 0, error: String(err ?? e) }); }
    });
  });
}

// (DIFFERENT SEEDS PER FIGURE — the same clip ×3 looks robotic; the seed is saved in the plan, so an edit can re-ask with the same one)
const seedFor = (figureIndex: number, actionIndex: number) => 11 + figureIndex * 10 + actionIndex;

function liveClips(reqs: { steps: Step[]; seed: number; show: string[]; pair?: number; partner?: string }[], signal?: AbortSignal): Promise<{ clip: KimodoClip | null; cached: boolean; sec: number; take?: number; error?: string }[]> {
  // (R2, Oct 17: ALL the figures of a scene in ONE bridge call → ONE Modal job — kimodo/live_clip.py run_jobs)
  // (two people who touch: 3 takes each and "pair" = the partner's job, so the bridge keeps the take PAIR whose moments match)
  const req = JSON.stringify({ jobs: reqs.map((r) => ({ steps: r.steps, seed: r.seed, takes: r.show.length || r.pair !== undefined ? TAKES : 1, show: r.show, ...(r.pair !== undefined ? { pair: r.pair, partner: r.partner } : {}) })) });
  const fail = (error: string) => reqs.map(() => ({ clip: null, cached: false, sec: 0, error }));
  return new Promise((resolve) => {
    execFile("nice", ["-n", "10", "python3", BRIDGE, req], { timeout: LIVE_TIMEOUT_MS * 2, signal, maxBuffer: 1 << 22 }, (err, stdout) => {
      try {
        const line = String(stdout).trim().split("\n").pop() ?? "";
        const all = JSON.parse(line) as { ok: boolean; error?: string; results?: { ok: boolean; file?: string; cached?: boolean; sec?: number; take?: number; error?: string }[] };
        if (!all.ok || !all.results) return resolve(fail(all.error ?? String(err ?? "no answer")));
        resolve(all.results.map((r, i) => {
          if (!r?.ok || !r.file) return { clip: null, cached: false, sec: 0, error: r?.error ?? "no answer" };
          const data = JSON.parse(readFileSync(r.file, "utf8")) as { fps: number; srcFps?: number; blended?: boolean; frames: KimodoFrame[]; moments?: TouchMoments };
          const clip = makeClip(`live-${reqs[i].seed}`, reqs[i].steps.map((x) => x.text).join(" "), data);
          return { clip: data.moments ? { ...clip, moments: data.moments } : clip, cached: !!r.cached, sec: r.sec ?? 0, take: r.take };
        }));
      } catch (e) { resolve(fail(String(err ?? e))); }
    });
  });
}

export async function fillLiveMotions(plan: Record<string, unknown>, o: { signal?: AbortSignal; onLog?: (s: string) => void } = {}): Promise<{ plan: Record<string, unknown>; made: number; failed: string[] }> {
  const chars = (Array.isArray(plan.characters) ? plan.characters : []) as Char[];
  let made = 0; const failed: string[] = [];
  const want: { c: Char; ci: number; ai: number; p: Record<string, unknown>; steps: Step[]; seed: number; show: string[] }[] = [];
  for (const [ci, c] of chars.entries()) {
    for (const [ai, a] of (c.actions ?? []).entries()) {
      if (a.move !== "realMotion") continue;
      const p = (a.params ??= {});
      const sentence = String(p.motion ?? p.prompt ?? "").trim();
      const given = Array.isArray(p.steps) ? (p.steps as { text?: unknown; seconds?: unknown }[]).map((x) => ({ text: String(x?.text ?? "").trim(), seconds: Math.min(6, Math.max(0.6, Number(x?.seconds) || 1.5)) })).filter((x) => x.text) : [];
      if ((!sentence && !given.length) || (!given.length && isSavedClip(sentence)) || (p.clip && (p.clip as KimodoClip).frames?.length)) continue;
      const steps: Step[] = (given.length ? given.slice(0, 6) : [{ text: sentence, seconds: Math.min(10, Math.max(2, Number(p.seconds) || 4)) }])
        // (A TURN-AROUND NEEDS TIME, R1e: a step that turns around and goes back gets at least 4 s)
        .map((x) => (/\bturns? (a)?round\b/i.test(x.text) && /\bback\b/i.test(x.text) ? { ...x, seconds: Math.max(x.seconds, 4) } : x));
      const show = (Array.isArray(p.show) ? p.show : []).map(String).filter((x) => (SHOW_SIGNS as readonly string[]).includes(x));
      const seed = Number.isFinite(Number(p.seed)) ? Number(p.seed) : seedFor(ci, ai);
      want.push({ c, ci, ai, p, steps, seed, show });
    }
  }
  if (!want.length) return { plan, made, failed };
  // (WHO TOUCHES WHOM: each "touch" beat pairs the two people's real motions)
  const beats = (Array.isArray(plan.beats) ? plan.beats : []) as { by?: string; on?: string; result?: string }[];
  const idx = (id?: string) => want.findIndex((w) => w.c.id === id);
  const pairOf = new Map<number, number>();
  for (const b of beats) { const a = idx(b.by), q = idx(b.on); if (b.result === "touch" && a >= 0 && q >= 0 && !pairOf.has(a) && !pairOf.has(q)) { pairOf.set(a, q); pairOf.set(q, a); } }
  const words = (k: number) => want[k].steps.map((x) => x.text).join(" ");
  const got = await liveClips(want.map((w, k) => ({ steps: w.steps, seed: w.seed, show: w.show, ...(pairOf.has(k) ? { pair: pairOf.get(k)!, partner: words(pairOf.get(k)!) } : {}) })), o.signal);
  want.forEach((w, i) => {
    const r = got[i], words = w.steps.map((x) => `${x.text} (${x.seconds}s)`).join(" | ");
    o.onLog?.(`kimodo ${w.c.id ?? w.ci}#${w.ai} ${words.slice(0, 160)} seed ${w.seed} show [${w.show.join(",")}]: ${r.clip ? (r.cached ? "cached" : `${r.sec}s take ${r.take}`) : `FAILED ${r.error}`}`);
    if (!r.clip) { failed.push(words); return; }
    w.p.seed = w.seed; w.p.motion = w.steps.map((x) => x.text).join(" "); w.p.seconds = +w.steps.reduce((t, x) => t + x.seconds, 0).toFixed(2); w.p.clip = r.clip; made += 1;
  });
  return { plan, made, failed };
}

// (the plan shown back to Claude for an edit leaves the motion pictures out — only the words and the seed matter to it)
export const withoutClips = (_k: string, v: unknown) => (_k === "clip" ? undefined : v);

// ONE FIGURE IS BIG ENOUGH TO SEE (Oct 17 R1 — Arthur: the jumping-jacks man was tiny at height 300): a scene with ONE figure moved
// by real motion is drawn at least 480 tall (of the 1080 picture), like the passed one-figure review sheets.
export const ONE_FIGURE_HEIGHT = 480;
export function sizeOneFigure(plan: Record<string, unknown>): Record<string, unknown> {
  const chars = (Array.isArray(plan.characters) ? plan.characters : []) as Char[];
  if (chars.length === 1 && (chars[0].actions ?? []).some((a) => a.move === "realMotion") && !(Number(plan.height) >= ONE_FIGURE_HEIGHT)) plan.height = ONE_FIGURE_HEIGHT;
  // (A GROUP IS BIG ENOUGH TO SEE TOO, R2 — the AI made groups 260–340 tall: nods, hand-talk and waves were too small to read.
  // When EVERY figure moves by real motion: 2 people ≥ 420, 3 ≥ 380, 4 or more ≥ 340 tall)
  else if (chars.length > 1 && chars.every((c) => (c.actions ?? []).some((a) => a.move === "realMotion"))) {
    const min = chars.length === 2 ? 420 : chars.length === 3 ? 380 : 340;
    if (!(Number(plan.height) >= min)) plan.height = min;
  }
  return plan;
}
