import assert from "node:assert/strict";
import { test } from "node:test";
import { join } from "node:path";
import { ENGINE_PAID_ENV, engineArgs, engineEnv, lineSplitter, parseEngineLine, v1EngineConfig } from "./v1EngineCli.ts";
import { makeTestRoot } from "./__fixtures__/v1TestRoot.ts";

test("STAGE, PROGRESS, RESULT and ERROR lines; anything else is engine log", () => {
  assert.deepEqual(parseEngineLine("STAGE animating Animating"), { type: "stage", stage: { code: "animating", words: "Animating" } });
  assert.deepEqual(parseEngineLine("STAGE drawing Drawing your stick figure\r"), { type: "stage", stage: { code: "drawing", words: "Drawing your stick figure" } });
  assert.equal(parseEngineLine("STAGE dancing not a contract code"), null, "a code outside V1StageCode is ignored, never shown");
  assert.deepEqual(parseEngineLine("PROGRESS 42 73"), { type: "progress", progress: { pct: 42, etaS: 73 } });
  assert.deepEqual(parseEngineLine("PROGRESS 140 0"), { type: "progress", progress: { pct: 100, etaS: 0 } }, "pct is kept inside 0-100");
  assert.equal(parseEngineLine("PROGRESS soon"), null);
  assert.deepEqual(parseEngineLine("RESULT /x/v1/report.json"), { type: "result", path: "/x/v1/report.json" });
  assert.deepEqual(parseEngineLine("ERROR this part needs a new plan"), { type: "error", words: "this part needs a new plan" });
  assert.equal(parseEngineLine("[sentence] planned - route kimodo_only"), null);
});

test("config: the PASSED engine by default, --cache-only unless Kimodo is allowed; no edit script", () => {
  const { root, env } = makeTestRoot();
  const c = v1EngineConfig(env)!;
  assert.equal(c.engineScript, join(root, "ltx-effects", "v1k", "passed_engine.py"));
  assert.equal(c.engineBook, join(root, "ltx-effects", "v1k", "passed_engine_book.json"));
  assert.equal(c.cacheOnly, true);
  assert.deepEqual(engineArgs(c, "/p.json", "/D", null), [c.engineScript, "/p.json", "--out-dir", "/D", "--cache-only"]);
  assert.deepEqual(engineArgs({ ...c, cacheOnly: false }, "/p.json", "/D", "/P"), [c.engineScript, "/p.json", "--out-dir", "/D", "--prev", "/P"]);
  assert.equal(v1EngineConfig({}), null, "no engine root = null (nothing spawned)");
});

test("engine env: cache-only gets no keys; paid gets ONLY the names the passed pipeline reads", () => {
  const { env } = makeTestRoot();
  const c = v1EngineConfig(env)!;
  const full = { ...env, ANTHROPIC_API_KEY: "test-not-a-key", OPENAI_API_KEY: "test-other", MODAL_TOKEN_ID: "test-id", HOME: "/h" };
  const dry = engineEnv(c, full);
  assert.equal(dry.CACHE_ONLY, "1");
  assert.equal(dry.ANTHROPIC_API_KEY, undefined);
  const paid = engineEnv({ ...c, cacheOnly: false }, full);
  assert.equal(paid.CACHE_ONLY, undefined);
  assert.equal(paid.ANTHROPIC_API_KEY, "test-not-a-key");
  assert.equal(paid.MODAL_TOKEN_ID, "test-id");
  assert.equal(paid.OPENAI_API_KEY, undefined, "the app's other keys never reach the engine");
  assert.ok(Object.keys(paid).every((k) => ["PATH", "HOME", "USER", "LANG", "TMPDIR", ...ENGINE_PAID_ENV].includes(k)));
});

test("lines split over chunks are joined", () => {
  const got: string[] = [];
  const s = lineSplitter((l) => got.push(l));
  s.push("PROGRESS 1"); s.push("0 20\nSTAGE plan"); s.push("ning Planning\nRESULT /r");
  s.end();
  assert.deepEqual(got, ["PROGRESS 10 20", "STAGE planning Planning", "RESULT /r"]);
});
