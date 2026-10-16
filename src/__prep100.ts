// Prepares the 100-sheet review: engine tidy + repairs + laws for every sheet → runs/<id>.json (for teach.ts render) + summary.json.
import { readFileSync, writeFileSync as writeRaw, existsSync } from "node:fs";
// (a run file is only rewritten when it really changed, so a video already made is never made again)
const writeFileSync = (f: string, t: string) => { if (existsSync(f) && readFileSync(f, "utf8") === t) return; writeRaw(f, t); };
import { autoRepair, lawProblems, planDiff, tidyPlan } from "./lib/animator/claude/claudeAnimator.ts";
const R = "/Users/arthurcarlin/Projects/diamond-review/harness-phase4/review";
const out: unknown[] = [];
for (const f of ["a-action", "b-life", "c-world"]) {
  const file = `${R}/sheets100/${f}.json`;
  if (!existsSync(file)) continue;
  for (const s of JSON.parse(readFileSync(file, "utf8")) as { id: string; prompt: string; mustNot?: string[]; plan: Record<string, unknown>; edit?: { prompt: string; plan: Record<string, unknown> } }[]) {
    // (THE EDIT: the same scene changed by the user's next words — built and checked the same way; "changed" proves only the asked part changed)
    let edit: unknown = null;
    if (s.edit?.plan) {
      try {
        const ep = autoRepair(tidyPlan(s.edit.plan), s.edit.prompt, null).plan, epr = lawProblems(ep, s.edit.prompt, null);
        writeFileSync(`${R}/runs/s100-${s.id}-edit.json`, JSON.stringify({ id: `s100-${s.id}-edit`, prompt: s.edit.prompt, viaChat: false, result: { ok: !epr.some((x) => x.startsWith("LAW ")), plan: ep, by: "hand" } }));
        edit = { prompt: s.edit.prompt, broken: epr.filter((x) => x.startsWith("LAW ")), taste: epr.filter((x) => !x.startsWith("LAW ")), changed: planDiff(s.plan, s.edit.plan) };
      } catch (e) { edit = { prompt: s.edit.prompt, broken: [`ENGINE ERROR: ${(e as Error).message.slice(0, 200)}`], taste: [], changed: [] }; }
    }
    try {
      const p = autoRepair(tidyPlan(s.plan), s.prompt, null).plan, pr = lawProblems(p, s.prompt, null);
      const broken = pr.filter((x) => x.startsWith("LAW ")), taste = pr.filter((x) => !x.startsWith("LAW "));
      writeFileSync(`${R}/runs/s100-${s.id}.json`, JSON.stringify({ id: `s100-${s.id}`, prompt: s.prompt, viaChat: false, result: { ok: !broken.length, plan: p, by: "hand" } }));
      out.push({ id: s.id, group: f, prompt: s.prompt, mustNot: s.mustNot ?? [], broken, taste, edit });
    } catch (e) { out.push({ id: s.id, group: f, prompt: s.prompt, mustNot: s.mustNot ?? [], broken: [`ENGINE ERROR: ${(e as Error).message.slice(0, 200)}`], taste: [] }); }
  }
}
writeFileSync(`${R}/sheets100/summary.json`, JSON.stringify(out, null, 1));
console.log(out.length, "sheets,", (out as { edit: unknown }[]).filter((x) => x.edit).length, "edits;", (out as { broken: string[] }[]).filter((x) => !x.broken.length).length, "pass the broken laws");
