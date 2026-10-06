import assert from "node:assert/strict";
import { test } from "node:test";
import { buildScene, momentTimes } from "../engine.ts";
import { LIBRARY } from "./library.ts";
import { barrageHands, barragePattern, HIT_STOP } from "./barrage.ts";
import { planToScene, type ScenePlan } from "./plan.ts";
import { armPathProblems, TEST_HEIGHT } from "./testkit.ts";
import type { MoveStyle } from "./styles.ts";

// BARRAGE (barrage.ts): A throws a fast barrage of straight punches at B ~200 px away; B covers up, takes
// them on the forearms, is driven back a step, and the last one gets through to the stomach.
const barragePlan = (style: MoveStyle, aFacing: "right" | "left", count: number, seed = 0, energy = 0.6, speed: "normal" | "fast" = "normal"): ScenePlan => ({
  id: "bar", title: "bar", height: TEST_HEIGHT, groundY: 900,
  characters: [
    { id: "a", x: 960 + (aFacing === "right" ? -100 : 100), facing: aFacing, style, energy, speed, actions: [{ move: "wait", params: { seconds: 0.5 } }, { move: "barrage", params: { target: "b", count, seed } }] },
    { id: "b", x: 960 + (aFacing === "right" ? 100 : -100), facing: aFacing === "right" ? "left" : "right", style, energy: 0.5, actions: [{ move: "barraged", params: { from: "a" } }] },
  ],
});

test("barrage: registered, fast and on one steady beat, a mix of punches, every punch meets B's forearm on the same beat, body rules at 8/12/24 fps, both directions, every mood", () => {
  assert.ok(LIBRARY.barrage && LIBRARY.barraged);
  const moods: MoveStyle[] = ["natural", "angry", "robot", "tired", "happy", "sad", "hurt", "sneaky", "heavy", "irritated"];
  // (Different seeds give different mixes of punches: each one is checked.)
  // (Seed 6 and 7: energy 0.9 and speed fast, like a fight — the beat must hardly change.)
  for (const [style, seed] of [...moods.map((m) => [m, 0] as const), ["natural", 1], ["natural", 2], ["angry", 3], ["robot", 4], ["happy", 5], ["natural", 6], ["angry", 7]] as const) for (const facing of ["right", "left"] as const) {
    const n = style === "angry" ? 10 : seed % 2 ? 7 : 8;
    const scene = planToScene(barragePlan(style, facing, n, seed, seed >= 6 ? 0.9 : 0.6, seed >= 6 ? "fast" : "normal"), LIBRARY);
    const hits: number[] = [];
    for (let i = 1; i <= n; i += 1) {
      const a = scene.marks[`a.barrage1.hit${i}`], b = scene.marks[`b.barraged1.hit${i}`];
      assert.ok(a !== undefined && b !== undefined && Math.abs(a - b) < 1e-6, `${style} ${facing}: punch ${i} lands on B's beat`);
      hits.push(a);
    }
    // ONE STEADY RHYTHM: every punch (straight, overhand, uppercut, strong) on the same beat — no extra
    // wind-ups, no gaps — and fast (natural: about every 0.2 s).
    const gaps = hits.slice(1, -1).map((t, i) => t - hits[i]);
    const pattern = barragePattern(n, seed);
    // (Round 7, Arthur: "seriously make it slower": one beat of 1/2 s — 6 pictures at 12 a second — in every mood, energy and speed.)
    // (Round 10: "a bit faster visually": 5/12 s — 5 pictures at 12 a second.)
    assert.ok(Math.abs(gaps[0] - 5 / 12) < 1e-6, `${style} seed ${seed}: one beat of 5/12 s (${gaps[0].toFixed(3)} s)`);
    // (Round 8: no slowing down — the last punch on the same beat too — and strictly left, right, left, right.)
    assert.ok(Math.abs(hits[n - 1] - hits[n - 2] - 5 / 12) < 1e-6, `${style} seed ${seed}: the last punch on the beat too`);
    assert.ok(barrageHands(n).every((h, k, a) => k === 0 || h !== a[k - 1]), "strictly alternating hands");
    // (Every barrage has at least one overhand and one uppercut.)
    assert.ok(pattern.some((p) => p.kind === "overhand") && pattern.some((p) => p.kind === "uppercut"), `${style} seed ${seed}: the mix`);
    assert.ok(Math.max(...gaps) - Math.min(...gaps) < 0.01, `${style}: the same beat (${gaps.map((g) => g.toFixed(3)).join(" ")})`);
    // A STRAIGHT PUNCH ON THE FOREARMS: at the exact moment of each blocked punch (the scene shifted so it
    // falls on a 24 fps picture) the punching elbow is bent under 25 degrees and the fist is within 15 px
    // of B's covering forearm.
    for (let i = 1; i < n; i += 1) {
      const shift = Math.ceil(hits[i - 1] * 24 - 1e-9) / 24 - hits[i - 1];
      const moved = { ...scene, durationSec: scene.durationSec + shift, characters: scene.characters.map((c) => ({ ...c, keys: c.keys.map((k) => ({ ...k, t: k.t + shift })) })) };
      const frame = buildScene(moved, 24).frames[Math.round((hits[i - 1] + shift) * 24)];
      const A = frame.find((c) => c.id === "a")!.skeleton, B = frame.find((c) => c.id === "b")!.skeleton;
      const side = Math.abs(A.lHand.x - B.hip.x) < Math.abs(A.rHand.x - B.hip.x) ? "l" : "r", straight = pattern[i - 1].kind === "straight";
      const e = A[`${side}Elbow`], h = A[`${side}Hand`];
      const bend = Math.abs(((Math.atan2(h.y - e.y, h.x - e.x) - Math.atan2(e.y - A.neck.y, e.x - A.neck.x)) * 180) / Math.PI);
      const near = Math.min(...[[B.lElbow, B.lHand], [B.rElbow, B.rHand]].map(([p, q]) => segDist(h, p, q)));
      if (straight) assert.ok(Math.min(bend, 360 - bend) < 25, `${style} ${facing}: punch ${i} arm straight (elbow bent ${bend.toFixed(0)})`);
      assert.ok(near < (straight ? 15 : 20), `${style} ${facing}: punch ${i} (${pattern[i - 1].kind}) meets the forearm (${near.toFixed(0)} px off)`);
    }
    for (const fps of [8, 12, 24]) {
      const built = buildScene(scene, fps);
      // EVERY PUNCH TOUCHES (Arthur: "I need to see impact always on blue with Red's hands"): each hit is ON
      // a picture (at 12 and 24 a second exactly; lower, the engine moves a picture onto it), and on that
      // picture the fist is within 6 px of B's guard (the last one: of B's body).
      const times = momentTimes(scene, fps), hs = barrageHands(n);
      // (Below 12 a second the pictures are further apart than a beat's parts: there, the picture shown during
      // the contact — from the fist meeting the guard to the end of the hit-stop — is the one checked.)
      for (let i = 1; i <= n; i += 1) {
        const touchAt = (k: number) => {
          const f = built.frames[k], A = f.find((c) => c.id === "a")!.skeleton, B = f.find((c) => c.id === "b")!.skeleton, h = A[`${hs[i - 1]}Hand`];
          return i === n ? segDist(h, B.hip, B.neck) : Math.min(segDist(h, B.lElbow, B.lHand), segDist(h, B.rElbow, B.rHand));
        };
        let k = 0;
        for (let j = 0; j < times.length; j += 1) if (Math.abs(times[j] - hits[i - 1]) < Math.abs(times[k] - hits[i - 1])) k = j;
        if (fps >= 12) assert.ok(Math.abs(times[k] - hits[i - 1]) < 1e-6, `${style} ${facing} ${fps} fps: punch ${i} on a picture`);
        const during = times.map((t, j) => [t, j] as const).filter(([t]) => t >= hits[i - 1] - 1 / 48 - 1e-6 && t <= hits[i - 1] + HIT_STOP + 1e-6).map(([, j]) => j);
        assert.ok(during.length > 0, `${style} ${facing} ${fps} fps: punch ${i} has a contact picture`);
        const touch = fps >= 12 ? touchAt(k) : Math.min(...during.map(touchAt));
        assert.ok(touch <= (fps >= 12 ? 3 : 6), `${style} ${facing} ${fps} fps: punch ${i} touches B (${touch.toFixed(1)} px off)`);
      }
      // NO LIMB THROUGH ANOTHER BODY: from the last punch's load to the end, A's punching arm never comes
      // within 6 px of B's head.
      const hand = barrageHands(n)[n - 1], cock = scene.marks["a.barrage1.cock"], end = scene.marks["a.barrage1.end"];
      built.frames.forEach((f, k) => {
        if (k / fps < cock - 1e-6 || k / fps > end + 1e-6) return;
        const a = f.find((c) => c.id === "a")!.skeleton, b = f.find((c) => c.id === "b")!.skeleton;
        const gap = Math.min(segDist(b.head, a.neck, a[`${hand}Elbow`]), segDist(b.head, a[`${hand}Elbow`], a[`${hand}Hand`])) - 0.07 * TEST_HEIGHT;
        assert.ok(gap > 6, `${style} ${facing} ${fps} fps: the last punch's arm ${gap.toFixed(0)} px from B's head at ${(k / fps).toFixed(2)} s`);
      });
      // (Heads never overlap, even as the last punch folds B over.)
      const heads = Math.min(...built.frames.map((f) => { const a = f.find((c) => c.id === "a")!.skeleton.head, b = f.find((c) => c.id === "b")!.skeleton.head; return Math.hypot(a.x - b.x, a.y - b.y); }));
      // (Round 9: a clear gap of at least a head's width — 0.12 x height — between the heads on every picture.)
      assert.ok(heads - 2 * 0.07 * TEST_HEIGHT >= 0.12 * TEST_HEIGHT, `${style} ${facing} ${fps} fps: heads only ${(heads - 2 * 0.07 * TEST_HEIGHT).toFixed(0)} px apart`);
      for (const r of built.report.characters) {
        assert.ok(r.maxBoneErrorPx <= 0.5 && r.maxFootDriftPx <= 1 && r.belowGroundFrames === 0, `${style} ${facing} ${fps} fps ${r.id}: body rules ${JSON.stringify(r)}`);
        assert.ok(r.maxJointStepPx < 2880 / fps, `${style} ${facing} ${fps} fps ${r.id}: joint jump ${r.maxJointStepPx.toFixed(0)}`);
      }
      assert.deepEqual(armPathProblems(built.frames, fps, 2400 / fps), [], `${style} ${facing} ${fps} fps: arm paths`);
    }
  }
});

function segDist(p: { x: number; y: number }, a: { x: number; y: number }, b: { x: number; y: number }) {
  const dx = b.x - a.x, dy = b.y - a.y, l = dx * dx + dy * dy || 1;
  const k = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l));
  return Math.hypot(p.x - a.x - k * dx, p.y - a.y - k * dy);
}
