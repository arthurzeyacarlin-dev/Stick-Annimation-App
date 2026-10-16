// ACTIVE RAGDOLL FOR FALLS (Oct 15, Arthur on every fall: "not ragdoll — he's supposed to be completely just falling down and
// actually look good. Like 50% stiff, 50% ragdoll"). PRINCIPLE: A FALLING BODY IS WEIGHTS ON STRINGS WITH MUSCLES. Every joint is
// a small weight; every bone is a string of fixed length between two of them; gravity pulls every weight down (so the fall speeds
// up for real), the drawn rocks / steps / floor / pit walls stop them (a bounce, some slide), and the arms and legs swing on
// from their own momentum instead of being painted on — that is the loose half. The stiff half is the body's MUSCLES: every
// step they pull each weight half-way back toward the protective pose the tumble (tumble.ts) already planned at that moment
// (tuck, brace, crumple, lying), so the body still curls, braces and comes to lie the way the plan says. Knees and elbows bend
// one way only; the head stays with the torso. Fades in over the first moments of the fall and fades out as the body comes to
// rest, so the plan's own lying pose and get-up start cleanly. General for every tumble off anything.
// SAFETY: `ragdollFalls.on` — OFF until Arthur has judged it better than the stiff fall (this morning's "curls up and floats"
// falls change was rejected; nothing ships on a guess).
import { addBuiltHook, momentTimes, type Scene, type SceneFrames } from "../engine.ts";
import { JOINTS, type JointName, type Point, type Skeleton } from "../rig.ts";
import { FALL_GRAVITY } from "./fall.ts";
import { TUMBLE_BOUNCE, TUMBLE_SIDE_KEEP, type TumblePit, type TumbleSurface } from "./tumble.ts";

export const ragdollFalls = { on: process.env.DIAMOND_RAGDOLL === "on" };

export const RAGDOLL_MUSCLE = 0.38; // per picture: how far each joint is pulled back toward the planned (stiff) pose (Arthur's "50% stiff": at 0.5 the swing was invisible, 0.3 shows it)
export const RAGDOLL_SUBSTEPS = 4;
export const RAGDOLL_ITERATIONS = 6;
export const RAGDOLL_DAMPING = 0.97; // per substep: a body in the air loses a little speed (air, muscle)
export const RAGDOLL_FRICTION = 0.85; // sideways speed kept each step while touching a surface (a slide, not a nail)
export const RAGDOLL_IN_S = 0.15; // the ragdoll takes over this fast after balance is lost
export const RAGDOLL_OUT_S = 0.3; // ...and hands back to the planned lying pose this fast once it is down
export const RAGDOLL_HEAD_MAX_DEG = 40;
export const RAGDOLL_MAX_SPEED_H = 2.5; // body heights per second: the fastest any joint may move
export const RAGDOLL_MUSCLE_SPRING = 0.7; // how much of each muscle pull does NOT become speed (1 = pure position hold, 0 = a full spring) // the head stays within this of the torso's line

// What tumble.ts tells the ragdoll about each fall (registered by `tumble`; matched to the figure by its `edge` mark time).
export type RagdollJob = { edgeT: number; slideT: number; downT: number; H: number; level: number; surfaces: TumbleSurface[]; pits: TumblePit[]; page: [number, number] };
const jobs: RagdollJob[] = [];
export function registerTumbleForRagdoll(job: RagdollJob) {
  const i = jobs.findIndex((j) => Math.abs(j.edgeT - job.edgeT) < 1e-6);
  if (i >= 0) jobs[i] = job; else jobs.push(job);
  if (jobs.length > 64) jobs.shift();
}

const BONES: [JointName, JointName][] = [["hip", "neck"], ["neck", "head"], ["neck", "lElbow"], ["lElbow", "lHand"], ["neck", "rElbow"], ["rElbow", "rHand"], ["hip", "lKnee"], ["lKnee", "lFoot"], ["hip", "rKnee"], ["rKnee", "rFoot"]];
const HINGES: [JointName, JointName, JointName][] = [["neck", "lElbow", "lHand"], ["neck", "rElbow", "rHand"], ["hip", "lKnee", "lFoot"], ["hip", "rKnee", "rFoot"]];
const smooth = (k: number) => { const c = Math.min(1, Math.max(0, k)); return c * c * (3 - 2 * c); };
const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
const cross = (o: Point, a: Point, b: Point) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
const lerpSkel = (a: Skeleton, b: Skeleton, k: number): Skeleton => { const s = {} as Skeleton; for (const j of JOINTS) s[j] = { x: a[j].x + (b[j].x - a[j].x) * k, y: a[j].y + (b[j].y - a[j].y) * k }; return s; };
const copy = (s: Skeleton): Skeleton => { const c = {} as Skeleton; for (const j of JOINTS) c[j] = { ...s[j] }; return c; };

// The scene's solid world, in stage px (y down): what is under a point, the pit walls, the page.
export type RagdollWorld = { groundY: number; H: number; headRadius: number; surfaces: TumbleSurface[]; pits: TumblePit[]; page: [number, number] };
// The y (stage px) of the top of what would catch a point at x that was at `prevY` a moment ago (a rock only catches what comes
// from above it: a point already under a ledge is not thrown up through it).
// (`hipY`: where the body's middle is. A LIMB TRAILING A BODY THAT WENT OVER AN EDGE FOLLOWS IT OVER — once the hips are down past
// the ground line, the edge it left no longer hooks a foot or hand left behind near it: it slides off, it does not hang the body.)
export function floorYUnder(w: RagdollWorld, x: number, prevY: number, hipY = -Infinity) {
  const pit = w.pits.find((p) => x > p.left && x < p.right);
  let top = pit ? (pit.floorAt ? pit.floorAt(x) : pit.bottom) : 0;
  if (!pit && hipY > w.groundY - 0.35 * w.H && w.pits.some((p) => Math.abs(x - p.left) < 0.7 * w.H || Math.abs(x - p.right) < 0.7 * w.H)) top = -Infinity;
  for (const s of w.surfaces) if (x >= s.left - 0.08 * w.H && x <= s.right + 0.08 * w.H && s.top > top && w.groundY - s.top >= prevY - 0.04 * w.H) top = s.top;
  return w.groundY - top;
}

// Pull the bones back to their lengths (equal weights), a few rounds.
function constrainBones(p: Skeleton, lengths: number[], rounds: number) {
  for (let r = 0; r < rounds; r += 1) for (const [bi, [a, b]] of BONES.entries()) {
    const d = dist(p[a], p[b]); if (d < 1e-6) continue;
    const k = ((d - lengths[bi]) / d) * 0.5, dx = (p[b].x - p[a].x) * k, dy = (p[b].y - p[a].y) * k;
    p[a].x += dx; p[a].y += dy; p[b].x -= dx; p[b].y -= dy;
  }
}

// THE SIMULATION: `targets[i]` = the planned (stiff) skeleton at `times[i]`; returns the ragdoll's skeleton for each picture
// (already blended with the plan by `weight(t)`), bone lengths exact, nothing under the floor or inside a wall.
export function simulateRagdoll(targets: Skeleton[], times: number[], w: RagdollWorld, weight: (t: number) => number): Skeleton[] {
  const g = FALL_GRAVITY * w.H;
  const lengths = BONES.map(([a, b]) => dist(targets[0][a], targets[0][b]));
  const out: Skeleton[] = [copy(targets[0])];
  let p = copy(targets[0]), prev = copy(targets[0]); // (it starts from the plan's pose, at rest: the muscles and gravity take it from there)
  // (it starts with the plan's own speed: the second picture's motion carried in)
  for (let i = 1; i < targets.length; i += 1) {
    const dt = Math.max(1e-3, times[i] - times[i - 1]), h = dt / RAGDOLL_SUBSTEPS;
    const pull = 1 - Math.pow(1 - RAGDOLL_MUSCLE, 1 / RAGDOLL_SUBSTEPS);
    for (let s = 1; s <= RAGDOLL_SUBSTEPS; s += 1) {
      const tgt = lerpSkel(targets[i - 1], targets[i], s / RAGDOLL_SUBSTEPS);
      const before = copy(p);
      // gravity + momentum (Verlet), then the muscles
      const vmax = RAGDOLL_MAX_SPEED_H * w.H * h, vInt = {} as Record<JointName, Point>, touched = new Set<JointName>();
      for (const j of JOINTS) {
        let vx = (p[j].x - prev[j].x) * RAGDOLL_DAMPING, vy = (p[j].y - prev[j].y) * RAGDOLL_DAMPING;
        const sp = Math.hypot(vx, vy); if (sp > vmax) { vx *= vmax / sp; vy *= vmax / sp; } // (a joint never whips faster than a falling body can: no pops)
        const mx = (tgt[j].x - p[j].x) * pull, my = (tgt[j].y - p[j].y) * pull;
        p[j].x += vx + mx;
        p[j].y += vy + g * h * h + my;
        vInt[j] = { x: vx + mx, y: vy + g * h * h + my };
        // (the muscles are mostly a POSITION hold, not a spring: only a part of the pull becomes speed, so the body does not bounce
        // back and forth around the planned pose — that would read as a flip-flopping turn)
        before[j].x += mx * RAGDOLL_MUSCLE_SPRING; before[j].y += my * RAGDOLL_MUSCLE_SPRING;
      }
      prev = before;
      for (let r = 0; r < RAGDOLL_ITERATIONS; r += 1) {
        constrainBones(p, lengths, 1);
        // cross-brace: the head stays with the torso (hip–head distance as planned, within the head's angle limit)
        const want = dist(tgt.hip, tgt.head), minHH = Math.hypot(lengths[0] + lengths[1] * Math.cos((RAGDOLL_HEAD_MAX_DEG * Math.PI) / 180), lengths[1] * Math.sin((RAGDOLL_HEAD_MAX_DEG * Math.PI) / 180));
        const d = dist(p.hip, p.head);
        if (d > 1e-6) { const goal = Math.max(want, minHH), k = ((d - goal) / d) * (d < minHH ? 0.5 : 0.25); p.head.x -= (p.head.x - p.hip.x) * k; p.head.y -= (p.head.y - p.hip.y) * k; }
        // hinges bend one way only: the way the plan bends them (the rig's sign, whatever the facing)
        for (const [root, mid, end] of HINGES) {
          const planned = cross(tgt[root], tgt[mid], tgt[end]), now = cross(p[root], p[mid], p[end]);
          if (Math.abs(planned) < 1e-3 || planned * now >= 0) continue;
          // (fold it back over the bone's line, softly)
          const ax = p[mid].x - p[root].x, ay = p[mid].y - p[root].y, L = Math.hypot(ax, ay); if (L < 1e-6) continue;
          const ux = ax / L, uy = ay / L, ex = p[end].x - p[mid].x, ey = p[end].y - p[mid].y, side = ex * -uy + ey * ux; // (signed distance off the line)
          p[end].x -= -uy * side * 0.35; p[end].y -= ux * side * 0.35;
        }
        // the world: nothing under what it fell on, nothing in a wall or off the page
        for (const j of JOINTS) {
          const r = j === "head" ? w.headRadius : 0;
          const fy = floorYUnder(w, p[j].x, prev[j].y + r, p.hip.y) - r;
          // (THE RAGDOLL NEVER FIGHTS THE PLAN'S OWN GROUND: where the planned pose itself puts this joint under a surface — the stiff
          // tumble's trailing leg sweeping through a cliff top — that surface is not solid for it; hooking it there would hang the
          // whole body on one foot and throw the turn backwards. The ragdoll adds weight and swing; it does not correct the plan.)
          if (tgt[j].y + r > fy + r + 1) continue;
          // (a joint that was let under a surface (above) comes back out over a few steps, never in one jump — no pop)
          if (p[j].y > fy + 0.03 * w.H) { p[j].y -= 0.3 * (p[j].y - fy); continue; }
          if (p[j].y > fy - 0.01) { p[j].y = Math.min(p[j].y, fy); touched.add(j); }
          const hgt = w.groundY - p[j].y;
          for (const pit of w.pits) {
            if (hgt > -0.02 * w.H) continue;
            const L = (pit.wallAt ? pit.wallAt(-1, hgt) : pit.left) + 0.03 * w.H, R = (pit.wallAt ? pit.wallAt(1, hgt) : pit.right) - 0.03 * w.H;
            if (p[j].x < L && prev[j].x >= L - 0.3 * w.H) { p[j].x = L; prev[j].x = p[j].x + (prev[j].x - p[j].x) * -TUMBLE_SIDE_KEEP; }
            if (p[j].x > R && prev[j].x <= R + 0.3 * w.H) { p[j].x = R; prev[j].x = p[j].x + (prev[j].x - p[j].x) * -TUMBLE_SIDE_KEEP; }
          }
          if (p[j].x < w.page[0]) { p[j].x = w.page[0]; prev[j].x = p[j].x; }
          if (p[j].x > w.page[1]) { p[j].x = w.page[1]; prev[j].x = p[j].x; }
        }
      }
      // (the hit, once per step: a part of the downward speed comes back up — the bounce — and the slide loses some sideways speed)
      for (const j of touched) { prev[j].y = p[j].y + Math.max(0, vInt[j].y) * TUMBLE_BOUNCE; prev[j].x = p[j].x - (p[j].x - prev[j].x) * RAGDOLL_FRICTION; }
    }
    // blend with the plan, then make the bones exact again and keep it out of the floor
    const k = weight(times[i]);
    const mixed = lerpSkel(targets[i], p, k);
    for (let r = 0; r < 8; r += 1) {
      constrainBones(mixed, lengths, 1);
      for (const j of JOINTS) { const rad = j === "head" ? w.headRadius : 0; const fy = floorYUnder(w, mixed[j].x, mixed[j].y + rad - 0.04 * w.H, mixed.hip.y) - rad; if (mixed[j].y > fy && targets[i][j].y <= fy + 1) mixed[j].y = Math.max(fy, mixed[j].y - 0.3 * (mixed[j].y - fy) - 0.01 * w.H); }
    }
    constrainBones(mixed, lengths, 2);
    out.push(mixed);
  }
  return out;
}

// THE HOOK: after the scene is built, every tumble window (edge → down) of every figure gets the ragdoll.
export function ragdollFallsHook(scene: Scene, built: SceneFrames): SceneFrames {
  if (!ragdollFalls.on || !scene.marks) return built;
  const times = momentTimes(scene, built.fps, built.frames.length);
  for (const [mark, edgeT] of Object.entries(scene.marks)) {
    const m = /^(.+)\.tumble\d+\.edge$/.exec(mark); if (!m) continue;
    const job = jobs.find((j) => Math.abs(j.edgeT - edgeT) < 1e-6); if (!job) continue;
    const id = m[1], character = scene.characters.find((c) => c.id === id); if (!character) continue;
    const i0 = times.findIndex((t) => t >= edgeT - 1e-6), i1 = times.findIndex((t) => t > job.downT + 1e-6);
    const end = i1 < 0 ? times.length : i1; if (i0 < 0 || end - i0 < 3) continue;
    const idx = built.frames[i0].findIndex((c) => c.id === id); if (idx < 0) continue;
    const fc = built.frames[i0][idx];
    const world: RagdollWorld = { groundY: scene.groundY, H: job.H, headRadius: fc.headRadius, surfaces: job.surfaces, pits: job.pits, page: job.page };
    const targets = built.frames.slice(i0, end).map((f) => f[idx].skeleton);
    const weight = (t: number) => smooth((t - edgeT) / RAGDOLL_IN_S) * (1 - smooth((t - (job.slideT + 0.2)) / RAGDOLL_OUT_S));
    const sim = simulateRagdoll(targets, times.slice(i0, end), world, weight);
    for (let i = i0; i < end; i += 1) built.frames[i][idx] = { ...built.frames[i][idx], skeleton: sim[i - i0] };
  }
  return built;
}
addBuiltHook(ragdollFallsHook);
