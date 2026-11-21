// THE ONE CHARGE DOOR (Nov 20, Arthur: "If I spend any AI calls on anything, it always gets transferred to the AI dashboard").
// Every app route that can reach a paid AI (OpenAI, Anthropic, fal, the AI Animator, the Help Assistant, voice typing, the drawing
// AI) must go through the credit gate, which checks the price first and puts every spend on the AI Dashboard. This test fails the
// moment a new AI route forgets it. Development-only routes (404 outside development) and the engine-blocks route (off unless
// DIAMOND_ENGINE_BLOCKS=1) are the only exceptions, each named here.
// Run: node --test src/lib/account/aiChargeDoor.test.ts
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";

const ROOT = path.resolve(import.meta.dirname, "../../..");
const AI_MODULES = /from "[^"]*(openai|anthropic|assistantProvider|assistantTranscription|assistantJobService|v1AnimatorServer|aiAnimatorJobService|engineBlocksServer|drawingAiPrompting|generateAi|terraProvider|v1Luna|fal)[^"]*"/i;
const GATE = /assertAiCreditAvailable|accountAiCreditGate|AiAnimatorJobService|v1AnimatorServer|DiamondAssistantJobService/;
const EXCEPTIONS: Record<string, string> = {
  "app/api/ai-animator/engine/route.ts": "engine blocks: off unless DIAMOND_ENGINE_BLOCKS=1 (never on for users)",
  "app/api/dev/animator-bench/route.ts": "development only (404 outside development)",
  "app/api/dev/ai-checker/route.ts": "development only (404 outside development)",
};

const routes = (dir: string): string[] => fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
  const full = path.join(dir, entry.name);
  return entry.isDirectory() ? routes(full) : entry.name === "route.ts" ? [full] : [];
});

test("every API route that can reach a paid AI goes through the credit gate (checked before, on the AI Dashboard after)", () => {
  const checked: string[] = [];
  for (const file of routes(path.join(ROOT, "app/api"))) {
    const rel = path.relative(ROOT, file);
    const source = fs.readFileSync(file, "utf8");
    if (!AI_MODULES.test(source)) continue;
    checked.push(rel);
    if (EXCEPTIONS[rel]) continue;
    assert.match(source, GATE, `${rel} calls a paid AI without the credit gate`);
  }
  assert.ok(checked.length >= 5, `found the AI routes (${checked.join(", ")})`);
});

test("the AI Animator charges through the same credit gate (checked before, spent after an answer)", () => {
  const source = fs.readFileSync(path.join(ROOT, "src/lib/ai/aiAnimatorJobService.ts"), "utf8");
  assert.match(source, /credits: AiCreditGate = accountAiCreditGate/);
  assert.match(source, /this\.credits\.assertAvailable\(/);
  assert.match(source, /this\.credits\.spend\(/);
});

test("the development-only exceptions really are closed outside development", () => {
  for (const rel of Object.keys(EXCEPTIONS)) {
    const file = path.join(ROOT, rel);
    if (!fs.existsSync(file)) continue;
    const source = fs.readFileSync(file, "utf8");
    assert.match(source, /NODE_ENV [!=]== "development"|engineBlocksServerEnabled\(\)/, `${rel} must be closed for users`);
  }
});
