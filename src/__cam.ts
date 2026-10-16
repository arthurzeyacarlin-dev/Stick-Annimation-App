import { writeFileSync } from "node:fs";
import { autoRepair, lawProblems, tidyPlan } from "./lib/animator/claude/claudeAnimator.ts";
import { makeEffectsTestScene } from "./lib/animator/moves/tests2c.ts";
import { buildScene } from "./lib/animator/engine.ts";
const plan = { id: "cam1", title: "forest walk, camera follows", height: 300, groundY: 900, pace: "natural", camera: { follow: "all" },
  background: { pieces: [{ kind: "sky", params: { color: "#a9d6f5", color2: "#eef7fd" } }, { kind: "hills", params: { color: "#6aa864" } },
    { kind: "trees", params: { count: 14, shape: "mixed", wind: 0.15, leaves: 1 } }, { kind: "ground", params: { color: "#557d3c" } }, { kind: "grass", params: { count: 40, wind: 0.15 } }] },
  characters: [
    { id: "o", name: "Orange", x: 420, facing: "right", look: { color: "#f28c28", headFilled: false }, actions: [{ move: "walk", params: { distance: 2500 } }] },
    { id: "r", name: "Red", x: 300, facing: "right", look: { color: "#d62828" }, actions: [{ move: "walk", params: { distance: 2450 } }] },
    { id: "g", name: "Green", x: 180, facing: "right", look: { color: "#1f8a3a" }, actions: [{ move: "walk", params: { distance: 2400 } }] } ] };
const words = "three stick figures walk in a forest for about 15 seconds, then they stop";
const p = autoRepair(tidyPlan(plan), words, null).plan;
console.log(lawProblems(p, words, null).map((x) => x.slice(0, 180)).join("\n") || "NO PROBLEMS");
const sc = makeEffectsTestScene(p as never, 1920) as { durationSec: number; backgroundWidth?: number };
const b = buildScene(sc as never, 12);
const xs = b.frames.map((f) => f.map((c) => Math.round(c.skeleton.hip.x)));
console.log("seconds", sc.durationSec.toFixed(1), "world", sc.backgroundWidth, "screen hips at 0/25/50/75/100%:", [0, .25, .5, .75, 1].map((u) => xs[Math.min(xs.length - 1, Math.floor(u * (xs.length - 1)))].join("/")).join("  "));
writeFileSync("/Users/arthurcarlin/Projects/diamond-review/harness-phase4/review/runs/pm2-cam1.json", JSON.stringify({ id: "pm2-cam1", prompt: words, viaChat: false, result: { ok: true, plan: p, by: "hand" } }));
