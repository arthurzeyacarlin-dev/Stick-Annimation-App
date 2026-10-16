// Prepares the 100-sheet review: engine tidy + repairs + laws for every sheet → runs/<id>.json (for teach.ts render) + summary.json.
import { readFileSync, writeFileSync as writeRaw, existsSync } from "node:fs";
// (a run file is only rewritten when it really changed, so a video already made is never made again)
const writeFileSync = (f: string, t: string) => { if (existsSync(f) && readFileSync(f, "utf8") === t) return; writeRaw(f, t); };
import { autoRepair, lawProblems, planDiff, tidyPlan } from "./lib/animator/claude/claudeAnimator.ts";
const R = "/Users/arthurcarlin/Projects/diamond-review/harness-phase4/review";
const out: unknown[] = [];
for (const f of ["setA", "setB"]) {
  const file = `${R}/sheets25/${f}.json`;
  if (!existsSync(file)) continue;
  for (const s of JSON.parse(readFileSync(file, "utf8")) as { id: string; prompt: string; mustNot?: string[]; plan: Record<string, unknown>; edit?: { prompt: string; plan: Record<string, unknown> } }[]) {
    // (THE EDIT: the same scene changed by the user's next words — built and checked the same way; "changed" proves only the asked part changed)
    let edit: unknown = null;
    if (s.edit?.plan) {
      try {
        const ew = `${s.prompt}. Then: ${s.edit.prompt}`, ep = autoRepair(tidyPlan(s.edit.plan), ew, null).plan, epr = lawProblems(ep, ew, null);
        edit = { prompt: s.edit.prompt, broken: epr.filter((x) => x.startsWith("LAW ")), taste: epr.filter((x) => !x.startsWith("LAW ")), changed: planDiff(s.plan, s.edit.plan) };
      } catch (e) { edit = { prompt: s.edit.prompt, broken: [`ENGINE ERROR: ${(e as Error).message.slice(0, 200)}`], taste: [], changed: [] }; }
    }
    try {
      const p = autoRepair(tidyPlan(s.plan), s.prompt, null).plan, pr = lawProblems(p, s.prompt, null);
      const broken = pr.filter((x) => x.startsWith("LAW ")), taste = pr.filter((x) => !x.startsWith("LAW "));
      out.push({ id: s.id, group: f, prompt: s.prompt, mustNot: s.mustNot ?? [], broken, taste, edit });
    } catch (e) { out.push({ id: s.id, group: f, prompt: s.prompt, mustNot: s.mustNot ?? [], broken: [`ENGINE ERROR: ${(e as Error).message.slice(0, 200)}`], taste: [] }); }
  }
}
writeFileSync(`${R}/sheets25/summary.json`, JSON.stringify(out, null, 1));
console.log(out.length, "sheets,", (out as { edit: unknown }[]).filter((x) => x.edit).length, "edits;", (out as { broken: string[] }[]).filter((x) => !x.broken.length).length, "pass the broken laws");
