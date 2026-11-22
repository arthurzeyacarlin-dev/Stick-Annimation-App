// (Nov 11, Arthur: "the chat session is not saved when I made an animation") THE CHAT FOLLOWS A COPY ($0, fixtures only): after a crash the app can
// open the work as a "Recovered copy" with a new project id. The first time that copy opens, its parent's AI chat and animation come along:
// the chat is there, the animation is the copy's own (its folder, its id), an edit goes on from it, and the parent keeps everything it had.
import assert from "node:assert/strict";
import { test } from "node:test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { createV1Animator, type Spawner, type V1LunaCall } from "./v1AnimatorCore.ts";
import { v1EngineConfig } from "./v1EngineCli.ts";
import { normalizeV1LunaTurn, readEngineWords, readLunaBook } from "./v1LunaBook.ts";
import { fakeLuna, fakeSpawner, makeTestRoot, playEngineOk, until } from "./__fixtures__/v1TestRoot.ts";

test("a copy of a project opens with its parent's AI chat and animation, and both go on separately", async () => {
  const { env } = makeTestRoot({ oneTake: true }), config = v1EngineConfig({ ...env, DIAMOND_ENGINE_ALLOW_KIMODO: "1" })!;
  const books = () => ({ book: readLunaBook(config.lunaBook), words: readEngineWords(config.engineBook) }), { book, words } = books();
  const { spawn, calls } = fakeSpawner((call) => playEngineOk(call.args));
  const { luna } = fakeLuna((raw) => normalizeV1LunaTurn(raw, words, book), "create_jacks_flip", "edit_backflip");
  const animator = createV1Animator({ config: () => config, books, luna: luna as V1LunaCall, spawn: spawn as Spawner });
  const made = await animator.turn({ ownerId: "me", projectId: "parent", animationId: null, message: "a stick figure does a few jumping jacks and then a front flip", recentConversation: [] });
  assert.ok(made.ok && made.animation);
  const id = made.ok && made.animation ? made.animation.animationId : "";
  await until(() => animator.get("me", "parent", id)!.versions[0].status !== "running");
  const before = animator.latest("me", "parent");

  assert.deepEqual(animator.latest("me", "copy").lines, [], "a project with no AI folder and no parent starts empty, as before");
  const fresh = createV1Animator({ config: () => config, books, luna: luna as V1LunaCall, spawn: spawn as Spawner });   // (the server after the crash)
  fresh.adopt("copy", "parent");
  const after = fresh.latest("me", "copy");
  assert.deepEqual(after.lines.map((l) => [l.role, l.text]), before.lines.map((l) => [l.role, l.text]), "the whole chat came along");
  const mine = after.animation?.animationId ?? "";
  assert.ok(mine && mine !== id, "the copy's animation has its own id");
  assert.equal(after.animation?.versions[0].status, "done");
  assert.ok(after.lines.some((l) => l.animationId === mine) && !after.lines.some((l) => l.animationId === id), "its chat lines point at its own animation");
  assert.ok(existsSync(join(config.outDir, "copy", mine, "v1")), "its pictures are in the copy's own folder");
  assert.equal(fresh.latest("me", "parent").animation?.animationId, id, "the parent still has its own animation");
  assert.deepEqual(fresh.latest("me", "parent").lines.length, before.lines.length, "the parent keeps everything it had");

  const runs = calls.length;
  const edit = await fresh.turn({ ownerId: "me", projectId: "copy", animationId: mine, message: "make it a backflip instead", recentConversation: [] });
  assert.ok(edit.ok && edit.started, JSON.stringify(edit));
  await until(() => fresh.get("me", "copy", mine)!.versions.at(-1)!.status !== "running");
  assert.equal(calls.length, runs + 1);
  assert.ok(calls.at(-1)!.args.some((a) => a.includes(join("copy", mine))), "the edit is made in the copy's folder");
  assert.equal(fresh.latest("me", "parent").animation?.versions.length, 1, "the parent's animation is untouched by the copy's edit");
  assert.ok(fresh.undo("me", "copy", mine).ok, "Undo works on the copy");
  assert.deepEqual([fresh.get("me", "copy", mine)!.current, fresh.latest("me", "parent").animation?.current], [1, 1], "Undo went back to the version from before the crash; the parent is as it was");
  fresh.adopt("copy", "parent");
  assert.equal(fresh.get("me", "copy", mine)!.versions.length, 2, "asking again changes nothing");
});
