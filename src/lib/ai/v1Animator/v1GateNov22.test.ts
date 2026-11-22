import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { test } from "node:test";
import { createV1Animator, type Spawner, type V1LunaCall } from "./v1AnimatorCore.ts";
import { v1EngineConfig } from "./v1EngineCli.ts";
import { normalizeV1LunaTurn, readEngineWords, readLunaBook } from "./v1LunaBook.ts";
import { ANSWERS, fakeLuna, fakeSpawner, makeTestRoot, playEngineOk, until } from "./__fixtures__/v1TestRoot.ts";

// (Nov 22, Arthur) a short animation's motion edit = the WHOLE animation made again from the same first picture (no --prev); steps added at
// the end keep everything before (--prev); an edit that brings NEW things gets its picture on the card (H3_GATE_STILL). $0: fakes only.
const setup = (...keys: string[]) => {
  const { env } = makeTestRoot({ oneTake: true }), config = v1EngineConfig({ ...env, DIAMOND_ENGINE_ALLOW_KIMODO: "1" })!;
  const books = () => ({ book: readLunaBook(config.lunaBook), words: readEngineWords(config.engineBook) }), { book, words } = books();
  const { luna } = fakeLuna((r) => normalizeV1LunaTurn(r, words, book), "create_jacks_flip_steps", ...keys);
  const { spawn, calls } = fakeSpawner((c) => playEngineOk(c.args));
  const animator = createV1Animator({ config: () => config, books, luna: luna as V1LunaCall, spawn: spawn as Spawner, gate: true });
  return { animator, calls };
};
const me = { ownerId: "o", projectId: "p" };
async function made(animator: ReturnType<typeof createV1Animator>) {
  const first = await animator.turn({ ...me, animationId: null, message: "a stick figure does a few jumping jacks and then a front flip", recentConversation: [] });
  assert.ok(first.ok && first.gate && !first.gate.picture, "no scene sentence = no picture");
  // (Nov 22, Arthur: "not ridiculous amounts" / "the credits always gotta pay for fal") the card is the animator's price only (his answer
  // was paid when answered): 4 credits a second for the steps (5.9 s), the opening scene (3 s) and the settle second (1 s) = 40
  assert.equal(first.ok && first.gate ? first.gate.credits : 0, 40);
  const go = animator.confirm(me.ownerId, me.projectId); assert.ok(go.ok && go.animation);
  const id = go.ok && go.animation ? go.animation.animationId : "";
  await until(() => animator.get(me.ownerId, me.projectId, id)!.versions[0].status === "done");
  return id;
}

test("(Nov 22) a short animation's changed step = the whole animation made again from the same first picture (no --prev), said on the card", async () => {
  ANSWERS.nov22_step1 = { intent: "edit", say: "Five fast jumping jacks.", blocks: null, ops: null, kimodoSteps: [{ step: 1, text: "A person does five fast jumping jacks.", seconds: 3.5, travels: false, changed: true }], askedDetails: [{ said: "faster", step: 1 }] };
  const { animator, calls } = setup("nov22_step1");
  const id = await made(animator);
  const edit = await animator.turn({ ...me, animationId: id, message: "make the jumping jacks faster", recentConversation: [] });
  assert.ok(edit.ok && edit.gate && !edit.gate.picture, JSON.stringify(edit).slice(0, 300));
  assert.ok(edit.ok && edit.gate!.lines.some((l) => /whole animation is animated again from the same first picture/.test(l)));
  assert.ok(edit.ok && edit.gate!.lines.some((l) => /front flip/.test(l)), "every step is on the card: every step is made again");
  const go = animator.confirm(me.ownerId, me.projectId); assert.ok(go.ok);
  await until(() => calls.length === 2);
  assert.ok(!calls[1].args.includes("--prev"), "made whole, as a new animation is made");
  await until(() => animator.get(me.ownerId, me.projectId, id)!.versions[1].status === "done");
});

test("(Nov 22) steps added at the end keep everything before (--prev); NEW things get their picture (H3_GATE_STILL), paid once", async () => {
  ANSWERS.nov22_ball = { intent: "edit", say: "He kicks a red ball.", blocks: null, ops: null, newThings: "A small red ball lies on the ground in front of him.",
    kimodoSteps: [{ after: 2, before: "He stands in the middle of the picture.", text: "A person kicks a small red ball away.", seconds: 2, travels: false, changed: true }], askedDetails: [{ said: "kicks a red ball", step: 1 }] };
  const { animator, calls } = setup("nov22_ball");
  const id = await made(animator);
  const edit = await animator.turn({ ...me, animationId: id, message: "then he kicks a red ball", recentConversation: [] });
  assert.ok(edit.ok && edit.gate && edit.gate.picture === "new", JSON.stringify(edit).slice(0, 300));
  assert.ok(edit.ok && !edit.gate!.lines.some((l) => /whole animation/.test(l)), "an add-on keeps everything before");
  const pic = await animator.gatePicture(me.ownerId, me.projectId);
  assert.ok(pic.ok && pic.kind === "new");
  const drawn = calls.find((c) => c.env.H3_GATE_STILL);
  assert.ok(drawn && /red ball/.test(String(drawn.env.H3_GATE_STILL)) && String(drawn.env.PYTHONPATH).includes("gate-picture") && drawn.args.includes("--prev"), "the picture run is the edit's own run");
  assert.equal(drawn!.env.H3_GATE_KEEP, "He stands in the middle of the picture.", "what is already there is named, so the picture keeps it");
  const go = animator.confirm(me.ownerId, me.projectId); assert.ok(go.ok);
  await until(() => calls.filter((c) => !c.env.H3_GATE_PICTURE).length === 2);
  const run = calls.filter((c) => !c.env.H3_GATE_PICTURE)[1];
  assert.ok(run.args.includes("--prev") && !run.env.H3_GATE_STILL && !String(run.env.PYTHONPATH ?? "").includes("gate-picture"), "Animate runs the edit exactly as before");
});

test("(Nov 22, Arthur: 'it needs to show everything that is about to show') a new animation's LATER things are put into its first picture; Animate runs unchanged; only the still is paid with Animate", async () => {
  ANSWERS.nov22_later = { ...(structuredClone(ANSWERS.create_jacks_flip_steps) as Record<string, unknown>), scene: "A black stick figure stands at the left side of the picture on a flat ground line.",
    newThings: "A small brown dog stands on the ground beside him." };
  const { env } = makeTestRoot({ oneTake: true }), config = v1EngineConfig({ ...env, DIAMOND_ENGINE_ALLOW_KIMODO: "1" })!;
  const books = () => ({ book: readLunaBook(config.lunaBook), words: readEngineWords(config.engineBook) }), { book, words } = books();
  const { luna } = fakeLuna((r) => normalizeV1LunaTurn(r, words, book), "nov22_later", "nov22_later");
  // the picture run: like the real one, it writes its picture + json and waits to be stopped (scene $0.12, still $0.12)
  const { spawn, calls } = fakeSpawner((c) => c.env.H3_GATE_PICTURE ? { code: 0, hang: true, before: () => {
    const out = String(c.env.H3_GATE_PICTURE), png = out.replace(/\.json$/, ".png");
    writeFileSync(png, "png"); writeFileSync(out, JSON.stringify({ png, usd: 0.24, kept_usd: 0.12, pid: 0 }));
  } } : playEngineOk(c.args));
  const charged: number[] = [];
  const animator = createV1Animator({ config: () => config, books, luna: luna as V1LunaCall, spawn: spawn as Spawner, gate: true, usage: { pictureCharge: (_o, _r, n) => { charged.push(n); } } });
  const ask = () => animator.turn({ ...me, animationId: null, message: "a stick figure does jumping jacks and a front flip, then a small brown dog walks in", recentConversation: [] });
  const first = await ask();
  assert.ok(first.ok && first.gate && first.gate.picture === "first", "a new animation with things: the picture shows, as before");
  const pic = await animator.gatePicture(me.ownerId, me.projectId);
  assert.ok(pic.ok && pic.picture?.startsWith("data:image/png;base64,") && pic.credits === 24 && pic.animateCredits === 12, JSON.stringify(pic).slice(0, 200));
  const drawn = calls.find((c) => c.env.H3_GATE_PICTURE);
  assert.ok(drawn && /brown dog/.test(String(drawn.env.H3_GATE_STILL)) && !drawn.args.includes("--prev"), "the later things go into the new animation's own first picture");
  const again = await ask();   // replaced by a new message: the whole picture is paid
  assert.ok(again.ok && again.gate?.picture === "first");
  assert.deepEqual(charged, [24]);
  await animator.gatePicture(me.ownerId, me.projectId);
  const go = animator.confirm(me.ownerId, me.projectId); assert.ok(go.ok && go.animation);
  await until(() => calls.filter((c) => !c.env.H3_GATE_PICTURE).length === 1);
  const run = calls.filter((c) => !c.env.H3_GATE_PICTURE)[0];
  assert.ok(!run.env.H3_GATE_STILL && !String(run.env.PYTHONPATH ?? "").includes("gate-picture") && !run.args.includes("--prev"), "Animate makes the animation exactly as before");
  assert.deepEqual(charged, [24, 12], "animated: the scene is reused (included), only the still is paid");
  await until(() => animator.get(me.ownerId, me.projectId, go.ok && go.animation ? go.animation.animationId : "")!.versions[0].status === "done");
});

test("(Nov 22, hour 2: 'the progress bar has to be genuinely accurate') the bar runs on real times, not the engine's old guess", async () => {
  const { env } = makeTestRoot({ oneTake: true }), config = v1EngineConfig({ ...env, DIAMOND_ENGINE_ALLOW_KIMODO: "1" })!;
  const books = () => ({ book: readLunaBook(config.lunaBook), words: readEngineWords(config.engineBook) }), { book, words } = books();
  const { luna } = fakeLuna((r) => normalizeV1LunaTurn(r, words, book), "create_jacks_flip_steps");
  // the engine says 50 % at once (its old guess raced ahead); the bar must follow the clock instead
  const { spawn } = fakeSpawner(() => ({ code: 0, hang: true, stdout: ["STAGE animating Animating", "PROGRESS 50 10"] }));
  const animator = createV1Animator({ config: () => config, books, luna: luna as V1LunaCall, spawn: spawn as Spawner, gate: true });
  const first = await animator.turn({ ...me, animationId: null, message: "a stick figure does a few jumping jacks and then a front flip", recentConversation: [] });
  assert.ok(first.ok && first.gate);
  const go = animator.confirm(me.ownerId, me.projectId); assert.ok(go.ok && go.animation);
  const id = go.ok && go.animation ? go.animation.animationId : "";
  await until(() => animator.get(me.ownerId, me.projectId, id)!.versions[0].progress !== null);
  const p = animator.get(me.ownerId, me.projectId, id)!.versions[0].progress!;
  // a new animation of 3.5 s + 2.4 s: 13 + 3.35 x 5.9 = 32.8 s (no real jobs yet)
  assert.ok(p.pct < 5, `just started: near 0 %, not the engine's 50 % (${p.pct})`);
  assert.ok(Math.abs(p.etaS - 33) <= 2, `about 33 s left (${p.etaS})`);
  assert.ok(!p.late && !p.part, "on time, one part");
  animator.cancel(me.ownerId, me.projectId, id);
  await until(() => animator.get(me.ownerId, me.projectId, id)!.versions[0].status !== "running");
});
