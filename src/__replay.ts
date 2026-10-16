import { readFileSync, readdirSync } from "node:fs";
import { autoRepair, lawProblems, tidyPlan } from "./lib/animator/claude/claudeAnimator.ts";
const R = "/Users/arthurcarlin/Projects/diamond-review/harness-phase4/review";
const items: { id: string; words: string; plan: Record<string, unknown>; wasOk: boolean | null }[] = [];
for (const f of readdirSync(`${R}/runs`).filter((x) => x.endsWith(".json"))) {
  try { const d = JSON.parse(readFileSync(`${R}/runs/${f}`, "utf8")); if (d.result?.by === "claude" && d.result.plan && !String(d.id).startsWith("pm2-")) items.push({ id: d.id, words: d.prompt, plan: d.result.plan, wasOk: !!d.result.ok }); } catch { /* skip */ }
}
for (const l of readFileSync(`${R}/animator-log.jsonl`, "utf8").split("\n").filter(Boolean)) { const d = JSON.parse(l); items.push({ id: `log-r${d.round}`, words: d.words, plan: d.plan, wasOk: !d.problems.some((x: string) => x.startsWith("LAW ")) }); }
let newlyBroken = 0;
for (const it of items) { const b = lawProblems(autoRepair(tidyPlan(it.plan), it.words, null).plan, it.words, null).filter((x) => x.startsWith("LAW ")); if (it.wasOk === true && b.length) { newlyBroken += 1; console.log("NEWLY BROKEN", it.id, b[0].slice(0, 140)); } }
console.log(`plans ${items.length}; passed before but broken now ${newlyBroken}`);
