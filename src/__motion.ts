// Motion meter: finds pops (one picture jumps far more than its neighbours) and stop-go stutter in built animations.
import { readFileSync } from "node:fs";
import { makeEffectsTestScene } from "/Users/arthurcarlin/Projects/diamond-review/claude-app/src/lib/animator/moves/tests2c.ts";
import { buildScene } from "/Users/arthurcarlin/Projects/diamond-review/claude-app/src/lib/animator/engine.ts";
import "/Users/arthurcarlin/Projects/diamond-review/claude-app/src/lib/animator/moves/transform.ts";
const R = "/Users/arthurcarlin/Projects/diamond-review/harness-phase4/review/runs/";
for (const id of process.argv.slice(2)) {
  const plan = JSON.parse(readFileSync(R + "s50-" + id + ".json", "utf8")).result.plan;
  const sc: any = makeEffectsTestScene(plan, 1920); const b: any = buildScene(sc, 24);
  const H = plan.height ?? 300, fps = 24, cuts: number[] = b.camera?.cuts ?? [];
  const out: string[] = [];
  const nC = b.frames[0].length;
  for (let ci = 0; ci < nC; ci++) {
    const id2 = b.frames[0][ci].id;
    for (const j of ["hip", "head", "lHand", "rHand", "lFoot", "rFoot"]) {
      const v: number[] = [0];
      for (let i = 1; i < b.frames.length; i++) { const a = b.frames[i - 1][ci]?.skeleton[j], q = b.frames[i][ci]?.skeleton[j]; v.push(a && q ? Math.hypot(q.x - a.x, q.y - a.y) * fps / H : 0); }
      let pops = 0, firstPop = -1, stops = 0, firstStop = -1;
      for (let i = 2; i < v.length - 1; i++) {
        if (cuts.some((c) => Math.abs(c - i) <= 1)) continue;
        if (v[i] > 1.2 && v[i] > 3 * Math.max(v[i - 1], v[i + 1], 0.15)) { pops++; if (firstPop < 0) firstPop = i; }
        // stop-go: moving, then nearly still for 1-3 pictures, then moving again
        if (v[i - 1] > 0.6 && v[i] < 0.12) { let k = i; while (k < v.length && v[k] < 0.12 && k - i < 4) k++; if (k - i <= 3 && v[k] > 0.6) { stops++; if (firstStop < 0) firstStop = i; } }
      }
      if (pops || stops >= 3) out.push(`${id2}.${j}: pops ${pops}${pops ? ` (first ${(firstPop / fps).toFixed(2)}s)` : ""}, stop-go ${stops}${stops ? ` (first ${(firstStop / fps).toFixed(2)}s)` : ""}`);
    }
  }
  // draw-order flips (a figure jumping in front/behind every other picture)
  let flips = 0; for (let i = 2; i < b.frames.length; i++) { const o = (k: number) => b.frames[k].map((c: any) => c.draw ?? 0).join(","); if (o(i) !== o(i - 1) && o(i) === o(i - 2)) flips++; }
  // objects drawn behind/in front flicker
  let objFlick = 0; for (let i = 2; i < b.objects.length; i++) for (const o of b.objects[i]) { const p = b.objects[i - 1].find((x: any) => x.id === o.id), pp = b.objects[i - 2].find((x: any) => x.id === o.id); if (p && pp && !!o.behind !== !!p.behind && !!o.behind === !!pp.behind) objFlick++; }
  console.log(`== ${id} (${b.frames.length} pictures) depth flicker ${flips}, ball layer flicker ${objFlick}\n  ` + (out.join("\n  ") || "smooth"));
}
