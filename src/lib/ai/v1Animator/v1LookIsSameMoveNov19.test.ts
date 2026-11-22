// (Nov 19) A STEP THAT ONLY GETS A LOOK IS THE OLD STEP: Arthur's two real cases from disk (potion v2 -> v3, excavator v1 -> v2).
import assert from "node:assert/strict";
import { test } from "node:test";
import { join } from "node:path";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { editBlocks } from "./v1AnimatorCore.ts";
import { readLunaBook } from "./v1LunaBook.ts";
import type { V1KimodoStep, V1Plan } from "./v1AnimatorContract.ts";
const LX = "/Users/arthurcarlin/Projects/diamond-review/ltx-effects";
const book = readLunaBook(join(LX, "v1k", "luna-book.json"));
const anim = (pid: string) => { const p = join(LX, "out", "app-v1", pid); return JSON.parse(readFileSync(join(p, readdirSync(p).filter((d) => !d.startsWith("."))[0], "animation.json"), "utf8")); };
const plan = (a: { versions: { n: number; plan: V1Plan }[] }, n: number) => a.versions.find((v) => v.n === n)!.plan;
const stepsOf = (p: V1Plan) => p.blocks.flatMap((b) => b.steps ?? []) as V1KimodoStep[];
for (const [pid, from, to] of [["8c97f0f9-1525-4b09-9843-687b633902e5", 2, 3], ["5cd2600a", 1, 2]] as const) {
  const root = existsSync(join(LX, "out", "app-v1")) ? readdirSync(join(LX, "out", "app-v1")).find((d) => d.startsWith(pid)) : undefined;
  test(`${pid.slice(0, 8)} v${from} -> v${to}: a colour look never becomes a new take`, { skip: !root }, () => {
    if (!root) return;
    const a = anim(root), base = plan(a, from), asked = stepsOf(plan(a, to));
    const out = editBlocks(asked, base, book);
    assert.deepEqual(out.map((b) => b.seed_bump), base.blocks.map((b) => b.seed_bump), "the take number stays");
    const got = out.flatMap((b) => b.steps ?? []);
    assert.deepEqual(got.map((s) => s.look ?? ""), asked.map((s) => s.look ?? ""), "the looks are the asked looks");
  });
}

// (Nov 19) the chat AI is told the measured colours when the version has them; without them the turn text is what it always was
import { lunaTurnInput } from "./v1LunaBook.ts";
test("an edit turn carries the measured colours of the steps when the animation picture has them", () => {
  const cur = { contract: "v1-blocks", colour: "#111111", look: "neckless", mirror: false, blocks: [{ id: "b1", sentence: "He waves.", seed_bump: 0 }] } as unknown as V1Plan;
  const pic = { mediaType: "image/png" as const, data: "AA==", width: 0, height: 0 };
  const base = { message: "make the potion blue", recentConversation: [], current: cur, checkerSaid: null, lastAnswer: null } as unknown as Parameters<typeof lunaTurnInput>[1];
  const plain = lunaTurnInput(book, { ...base, animation: pic }), noted = lunaTurnInput(book, { ...base, animation: { ...pic, note: "MEASURED COLOURS - step 1: #7603b0 0.4%" } });
  assert.ok(!plain.includes("MEASURED COLOURS"));
  assert.ok(noted.includes("step 1: #7603b0 0.4%"));
  assert.equal(noted.replace(" MEASURED COLOURS - step 1: #7603b0 0.4%", ""), plain);
});
