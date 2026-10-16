// Every old review sheet (and its edit) → engine tidy + repairs + laws, in ONE process (fast; no video) → runs/s50-<id>.json
// + one line per sheet in harness-phase4/review/sheets-p1/laws-all.tsv: id, ok/broken, the first broken law.
// Usage: npx tsx src/__lawsAll.ts <sheet json> [<sheet json> …]
import { appendFileSync, readFileSync, writeFileSync } from "node:fs";
import { autoRepair, lawProblems, tidyPlan } from "./lib/animator/claude/claudeAnimator.ts";
const OUT = "/Users/arthurcarlin/Projects/diamond-review/harness-phase4/review/sheets-p1/laws-all.tsv";
type Sheet = { id: string; prompt: string; plan: Record<string, unknown>; edit?: { prompt: string; plan: Record<string, unknown> } };
for (const file of process.argv.slice(2)) {
  const raw = JSON.parse(readFileSync(file, "utf8"));
  const list = (Array.isArray(raw) ? raw : raw.scenes ?? raw.items ?? []) as Sheet[];
  for (const s of list) {
    if (!s?.plan) continue;
    const jobs: [string, Record<string, unknown>, string][] = [[s.id, s.plan, s.prompt]];
    if (s.edit?.plan) jobs.push([`${s.id}-edit`, s.edit.plan, `${s.prompt}. Then: ${s.edit.prompt}`]);
    for (const [id, plan, words] of jobs) {
      let line: string;
      try {
        const p = autoRepair(tidyPlan(plan), words, null).plan, pr = lawProblems(p, words, null);
        const broken = pr.filter((x) => x.startsWith("LAW "));
        writeFileSync(`/Users/arthurcarlin/Projects/diamond-review/harness-phase4/review/runs/s50-${id}.json`, JSON.stringify({ id: `s50-${id}`, prompt: words, viaChat: false, result: { ok: true, plan: p, by: "laws-all" } }));
        line = `${id}\t${broken.length ? "broken" : "ok"}\t${broken[0]?.slice(4, 140) ?? ""}`;
      } catch (e) { line = `${id}\terror\t${String((e as Error).message).slice(0, 140)}`; }
      appendFileSync(OUT, line + "\n");
    }
  }
}
console.log("done");
