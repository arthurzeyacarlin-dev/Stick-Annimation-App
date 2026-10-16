// Usage: npx tsx src/__check100.ts <file.json> — checks each sheet: tidy + engine repairs + the laws (broken / taste).
import { readFileSync } from "node:fs";
import { autoRepair, lawProblems, tidyPlan } from "./lib/animator/claude/claudeAnimator.ts";
const list = JSON.parse(readFileSync(process.argv[2], "utf8")) as { id: string; prompt: string; plan: Record<string, unknown> }[];
for (const s of list) {
  try {
    const p = autoRepair(tidyPlan(s.plan), s.prompt, null).plan, pr = lawProblems(p, s.prompt, null);
    const b = pr.filter((x) => x.startsWith("LAW ")), t = pr.filter((x) => !x.startsWith("LAW "));
    console.log(`${b.length ? "BROKEN" : "OK    "} ${s.id}: ${b.map((x) => x.slice(0, 200)).join(" | ")}${t.length ? `  [taste: ${t.map((x) => x.slice(0, 90)).join(" | ")}]` : ""}`);
  } catch (e) { console.log(`ERROR  ${s.id}: ${(e as Error).message.slice(0, 200)}`); }
}
