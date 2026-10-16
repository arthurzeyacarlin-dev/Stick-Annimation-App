// One sheet (or its edit when id ends in "-edit") → engine tidy + repairs + laws → runs/s50-<id>.json, printing the laws' verdict.
import { readFileSync, writeFileSync } from "node:fs";
import { autoRepair, lawProblems, tidyPlan } from "./lib/animator/claude/claudeAnimator.ts";
const [file, id] = process.argv.slice(2);
const list = JSON.parse(readFileSync(file, "utf8")) as { id: string; prompt: string; plan: Record<string, unknown>; edit?: { prompt: string; plan: Record<string, unknown> } }[];
const base = list.find((s) => s.id === id.replace(/-edit$/, ""));
if (!base) throw new Error(`no sheet ${id}`);
const isEdit = id.endsWith("-edit"), plan = isEdit ? base.edit!.plan : base.plan, words = isEdit ? `${base.prompt}. Then: ${base.edit!.prompt}` : base.prompt;
const p = autoRepair(tidyPlan(plan), words, null).plan, pr = lawProblems(p, words, null);
const broken = pr.filter((x) => x.startsWith("LAW "));
writeFileSync(`/Users/arthurcarlin/Projects/diamond-review/harness-phase4/review/runs/s50-${id}.json`, JSON.stringify({ id: `s50-${id}`, prompt: words, viaChat: false, result: { ok: true, plan: p, by: "hand" } }));
console.log(broken.length ? `BROKEN: ${broken.map((x) => x.slice(0, 220)).join(" | ")}` : "laws: nothing broken", pr.filter((x) => !x.startsWith("LAW ")).map((x) => ` [taste: ${x.slice(0, 100)}]`).join(""));
