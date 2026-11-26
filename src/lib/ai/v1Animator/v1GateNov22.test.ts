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
  assert.equal(first.ok && first.gate ? first.gate.credits : 0, 70);   // (dad, Nov 26) + the 30-credit planning amount: planning is in the price
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
  assert.deepEqual(charged, [24], "(dad, Nov 26, option d) a first picture replaced by a change is charged its real cost, once");
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

test("(dad, Nov 26, money only) a paid gate picture is written down as WAITING until it is animated or charged; Animate's check leaves its own picture out", async () => {
  ANSWERS.nov26_wait = { ...(structuredClone(ANSWERS.create_jacks_flip_steps) as Record<string, unknown>), scene: "A black stick figure stands at the left side of the picture on a flat ground line." };
  const { env } = makeTestRoot({ oneTake: true }), config = v1EngineConfig({ ...env, DIAMOND_ENGINE_ALLOW_KIMODO: "1" })!;
  const books = () => ({ book: readLunaBook(config.lunaBook), words: readEngineWords(config.engineBook) }), { book, words } = books();
  const { luna } = fakeLuna((r) => normalizeV1LunaTurn(r, words, book), "nov26_wait", "nov26_wait");
  const { spawn, calls } = fakeSpawner((c) => c.env.H3_GATE_PICTURE ? { code: 0, hang: true, before: () => {
    const out = String(c.env.H3_GATE_PICTURE), png = out.replace(/\.json$/, ".png");
    writeFileSync(png, "png"); writeFileSync(out, JSON.stringify({ png, usd: 0.12, kept_usd: 0.12, pid: 0 }));
  } } : playEngineOk(c.args));
  const waiting = new Map<string, number>(), charged: number[] = [], excepts: (string | null | undefined)[] = [];
  const animator = createV1Animator({ config: () => config, books, luna: luna as V1LunaCall, spawn: spawn as Spawner, gate: true, usage: {
    pictureCharge: (_o, _r, n) => { charged.push(n); },
    pictureWaiting: (_o, id, n) => { if (n > 0) waiting.set(id, n); else waiting.delete(id); },
    creditsShort: (_o, _c, _h, except) => { excepts.push(except); return null; },
  } });
  const ask = () => animator.turn({ ...me, animationId: null, message: "a stick figure does jumping jacks and a front flip", recentConversation: [] });
  assert.ok((await ask()).ok);
  await animator.gatePicture(me.ownerId, me.projectId);
  assert.deepEqual([...waiting.values()], [12], "the drawn first picture is waiting with its real cost");
  const firstId = [...waiting.keys()][0];
  assert.ok((await ask()).ok);   // replaced by a new message (a change of the plan): charged once (option d), no longer waiting
  assert.deepEqual(charged, [12]);
  assert.ok(!waiting.has(firstId));
  await animator.gatePicture(me.ownerId, me.projectId);
  const secondId = [...waiting.keys()][0];
  assert.ok(secondId && secondId !== firstId);
  const go = animator.confirm(me.ownerId, me.projectId); assert.ok(go.ok && go.animation);
  assert.equal(excepts.at(-1), secondId, "Animate's credit check leaves out its own picture (its price includes it)");
  assert.equal(waiting.size, 0, "animated: no longer waiting (the scene is included, nothing more is charged)");
  assert.deepEqual(charged, [12]);
  await until(() => calls.filter((c) => !c.env.H3_GATE_PICTURE).length === 1);
  await until(() => animator.get(me.ownerId, me.projectId, go.ok && go.animation ? go.animation.animationId : "")!.versions[0].status === "done");
});

test("(dad + Arthur, Nov 26) PLANNING IS IN THE PRICE: the first plan + 4 text changes are free (the card counts down), the 6th answer is charged; Animate starts the count again; an edit card says a small fix is free by hand", async () => {
  const { env } = makeTestRoot({ oneTake: true }), config = v1EngineConfig({ ...env, DIAMOND_ENGINE_ALLOW_KIMODO: "1" })!;
  const books = () => ({ book: readLunaBook(config.lunaBook), words: readEngineWords(config.engineBook) }), { book, words } = books();
  ANSWERS.nov22_step1 ??= { intent: "edit", say: "Five fast jumping jacks.", blocks: null, ops: null, kimodoSteps: [{ step: 1, text: "A person does five fast jumping jacks.", seconds: 3.5, travels: false, changed: true }], askedDetails: [{ said: "faster", step: 1 }] };
  const { luna } = fakeLuna((r) => normalizeV1LunaTurn(r, words, book), ...Array(6).fill("create_jacks_flip_steps"), "nov22_step1");
  const { spawn } = fakeSpawner((c) => playEngineOk(c.args));
  const turns: { free?: boolean }[] = [];
  const animator = createV1Animator({ config: () => config, books, luna: luna as V1LunaCall, spawn: spawn as Spawner, gate: true, usage: { turnAnswered: (t) => { turns.push(t); } } });
  const left: number[] = [];
  for (let i = 0; i < 6; i++) {
    const out = await animator.turn({ ...me, projectId: "p-plan", animationId: null, message: "a stick figure does jumping jacks and a front flip", recentConversation: [] });
    assert.ok(out.ok && out.gate);
    left.push(out.ok && out.gate ? out.gate.freeChangesLeft ?? -1 : -1);
    assert.equal(out.ok && out.gate?.credits, 70, "one price, planning included, every time");
  }
  assert.deepEqual(turns.map((t) => t.free), [true, true, true, true, true, false]);
  assert.deepEqual(left, [4, 3, 2, 1, 0, 0], "the card says how many free changes are left (0 = the next change is charged)");
  const go = animator.confirm(me.ownerId, "p-plan"); assert.ok(go.ok && go.animation);
  const id = go.ok && go.animation ? go.animation.animationId : "";
  await until(() => animator.get(me.ownerId, "p-plan", id)!.versions[0].status === "done");
  const edit = await animator.turn({ ...me, projectId: "p-plan", animationId: id, message: "make the jumping jacks faster", recentConversation: [] });
  assert.ok(edit.ok && edit.gate);
  assert.equal(edit.ok && edit.gate?.freeChangesLeft, 4);
  // (dad + Arthur, 16:07) the edit card offers both ways: where to fix it by hand (step 1 = 0-3.5 s) and exactly what the AI makes again
  const fix = edit.ok ? edit.gate?.handFix : null;
  assert.ok(fix);
  assert.deepEqual([fix!.firstStep, fix!.lastStep, fix!.fromS, fix!.toS, fix!.recommend, fix!.remake?.whole], [1, 1, 0, 3.5, "remake", true]);
  assert.equal(edit.ok && edit.gate?.edit, true);
  assert.equal(turns.at(-1)?.free, true);
});

test("(dad, Nov 26 15:57) TEXT PLAN -> FIRST PICTURE -> ANIMATE: no picture until the text is approved, no Animate before the picture, a change after the picture charges it and goes back to text; the animation run is exactly the animation run", async () => {
  ANSWERS.nov26_offer = { ...(structuredClone(ANSWERS.create_jacks_flip_steps) as Record<string, unknown>), scene: "A black stick figure stands at the left side of the picture on a flat ground line.",
    newThings: "A small brown dog stands on the ground beside him." };
  const { env } = makeTestRoot({ oneTake: true }), config = v1EngineConfig({ ...env, DIAMOND_ENGINE_ALLOW_KIMODO: "1" })!;
  const books = () => ({ book: readLunaBook(config.lunaBook), words: readEngineWords(config.engineBook) }), { book, words } = books();
  const { luna } = fakeLuna((r) => normalizeV1LunaTurn(r, words, book), "nov26_offer", "nov26_offer", "nov26_offer");
  const { spawn, calls } = fakeSpawner((c) => c.env.H3_GATE_PICTURE ? { code: 0, hang: true, before: () => {
    const out = String(c.env.H3_GATE_PICTURE), png = out.replace(/\.json$/, ".png");
    writeFileSync(png, "png"); writeFileSync(out, JSON.stringify({ png, usd: 0.24, kept_usd: 0.12, pid: 0 }));
  } } : playEngineOk(c.args));
  const charged: number[] = [];
  const animator = createV1Animator({ config: () => config, books, luna: luna as V1LunaCall, spawn: spawn as Spawner, gate: true, usage: { pictureCharge: (_o, _r, n) => { charged.push(n); } } });
  const ask = () => animator.turn({ ...me, projectId: "p-steps", animationId: null, message: "a stick figure does jumping jacks and a front flip, then a small brown dog walks in", recentConversation: [] });
  // step 1: the text plan; its picture is described with its price, nothing is drawn, and Animate is refused
  const first = await ask();
  assert.ok(first.ok && first.gate);
  assert.deepEqual(first.ok && first.gate?.pictureOffer, { credits: 24, reused: 12 });
  await new Promise((r) => setTimeout(r, 100));
  assert.equal(calls.length, 0, "no picture is drawn before the text is approved");
  const early = animator.confirm(me.ownerId, "p-steps");
  assert.ok(!early.ok && early.status === 409 && /approve the plan and look at the first picture/.test(early.error));
  // step 2: approved -> the picture (the same engine run as before Nov 26: H3_GATE_PICTURE + the still of the dog)
  const pic = await animator.gatePicture(me.ownerId, "p-steps");
  assert.ok(pic.ok && pic.picture && pic.credits === 24 && pic.animateCredits === 12);
  assert.ok(calls[0].env.H3_GATE_PICTURE && /brown dog/.test(String(calls[0].env.H3_GATE_STILL)));
  // a change now: the picture is thrown away (charged once) and the plan is text again - nothing is redrawn by itself
  const changed = await ask();
  assert.ok(changed.ok && changed.gate?.picture === "first");
  assert.deepEqual(charged, [24]);
  await new Promise((r) => setTimeout(r, 100));
  assert.equal(calls.length, 1, "not redrawn until the new text is approved");
  assert.ok(!animator.confirm(me.ownerId, "p-steps").ok, "and no Animate before the new picture");
  // approve again -> picture -> Animate: the animation run is the animation run (no picture settings), only the still is paid
  await animator.gatePicture(me.ownerId, "p-steps");
  const go = animator.confirm(me.ownerId, "p-steps"); assert.ok(go.ok && go.animation);
  await until(() => calls.filter((c) => !c.env.H3_GATE_PICTURE).length === 1);
  const run = calls.filter((c) => !c.env.H3_GATE_PICTURE)[0];
  assert.ok(!run.env.H3_GATE_STILL && !String(run.env.PYTHONPATH ?? "").includes("gate-picture"), "Animate makes the animation exactly as before");
  assert.deepEqual(charged, [24, 12], "the thrown-away picture + the still of the dog; the scene is in the price");
  await until(() => animator.get(me.ownerId, "p-steps", go.ok && go.animation ? go.animation.animationId : "")!.versions[0].status === "done");
});


test("(dad + Arthur, Nov 26) a look the AI can't change comes with WHERE to fix it by hand (recommended); adding at the end is priced by its new seconds and has no hand fix", async () => {
  ANSWERS.nov26_look = { intent: "edit", say: "Red.", blocks: null, ops: null, colour: null, kimodoSteps: [{ step: 2, text: "A person does a front flip.", seconds: 2.4, travels: false, changed: true, look: "his shirt is red" }], askedDetails: [{ said: "red", step: 1 }] };
  ANSWERS.nov26_more = { intent: "edit", say: "Then he bows.", blocks: null, ops: null, colour: null, kimodoSteps: [{ after: 2, text: "A person takes a deep bow.", seconds: 2, travels: false, changed: true }], askedDetails: [{ said: "then he bows", step: 1 }] };
  const { animator } = setup("nov26_look", "nov26_more");
  const id = await made(animator);
  const look = await animator.turn({ ...me, animationId: id, message: "make his shirt red", recentConversation: [] });
  assert.ok(look.ok && !look.gate && look.handFix, JSON.stringify(look).slice(0, 300));
  assert.deepEqual([look.ok && look.handFix?.firstStep, look.ok && look.handFix?.recommend, look.ok && look.handFix?.remake], [2, "hand", null]);
  const more = await animator.turn({ ...me, animationId: id, message: "then he bows", recentConversation: [] });
  assert.ok(more.ok && more.gate);
  assert.equal(more.ok && more.gate?.handFix, undefined, "adding at the end is new animation: no hand fix");
  assert.equal(more.ok && more.gate?.credits, 4 * (2 + 1) + 30, "priced by the new seconds only (+ the ending second + planning)");
});
