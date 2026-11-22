// (Nov 11, Arthur: "next part" cut to a standing figure) NEXT PART JOINS ($0): h3EndOf says a one-part H3 animation ends on H3's drawing, so the
// planner (editBlocks, unchanged) keeps moves added at the end in that same part. Replays every saved edit of an H3-only animation: an edit
// that is not an addition at the end must be planned exactly as without it; an addition at the end of a one-part animation must stay one part.
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";
import { editBlocks, h3EndOf } from "./v1AnimatorCore.ts";
import { readLunaBook } from "./v1LunaBook.ts";
import type { V1Block, V1KimodoStep, V1Plan } from "./v1AnimatorContract.ts";

const ROOT = join(import.meta.dirname, "../../../../..");   // (the engine folder that holds v1-single and ltx-effects)
const OUT = join(ROOT, "ltx-effects/out/app-v1"), book = readLunaBook(join(ROOT, "ltx-effects/v1k/luna-book.json"));
const J = (p: string) => JSON.parse(readFileSync(p, "utf8"));
const key = (s: V1KimodoStep) => JSON.stringify({ ...s, changed: undefined });
const steps = (n: number, from = 0): V1KimodoStep[] => Array.from({ length: n }, (_, i) => ({ text: `A person does move ${from + i + 1}.`, seconds: 3, travels: false }));

test("moves added at the end of a one-part H3 animation stay in that part", () => {
  const old = steps(3), base: V1Plan = { contract: "v1-blocks", colour: "#111111", look: book.defaultLook as V1Plan["look"], mirror: false, blocks: [{ id: "b1", sentence: "x", seed_bump: 0, steps: old }] };
  const added = [...old, ...steps(2, 3)];
  assert.deepEqual(editBlocks(added, base, book, {}).map((b) => [b.id, b.steps!.length]), [["b1", 3], ["b2", 2]], "the reader saw nothing: a new part (the cut)");
  assert.deepEqual(editBlocks(added, base, book, { b1: 0 }).map((b) => [b.id, b.steps!.length]), [["b1", 5]], "the part ends on H3's drawing: one part");
  const changed = [old[0], { ...old[1], seconds: 4 }, old[2]];
  assert.deepEqual(editBlocks(changed, base, book, { b1: 0 }), editBlocks(changed, base, book, {}), "any other edit is planned the same");
});

test("replay: every saved edit of an H3-only animation", { skip: !existsSync(OUT) }, () => {
  let other = 0, added = 0, older = 0;
  for (const p of readdirSync(OUT)) for (const an of existsSync(join(OUT, p)) && !p.includes(".") ? readdirSync(join(OUT, p)) : []) {
    const A = join(OUT, p, an); if (!existsSync(join(A, "animation.json"))) continue;
    let vs: { n: number; plan: V1Plan }[]; try { vs = (J(join(A, "animation.json")).versions ?? []).filter((v: { plan?: V1Plan }) => v.plan?.blocks?.length); } catch { continue; }
    for (let i = 1; i < vs.length; i++) {
      const base = vs[i - 1].plan, was = base.blocks.flatMap((b) => b.steps ?? []), now = vs[i].plan.blocks.flatMap((b) => b.steps ?? []), pd = join(A, `v${vs[i - 1].n}`);
      if (!was.length || !now.length || !existsSync(join(pd, "report.json"))) continue;
      const h3 = base.blocks.every((b) => { try { const d = join(pd, "blocks", b.id); return J(join(d, readdirSync(d).find((f) => f.endsWith("-layers"))!, "manifest.json")).h3_only === true; } catch { return false; } });
      if (!h3) continue;
      const seen = h3EndOf(pd, J(join(pd, "report.json"))), plan: V1Block[] = editBlocks(now, base, book, seen), tag = `${p.slice(0, 8)}/${an.slice(0, 8)} v${vs[i].n}`;
      const atEnd = now.length > was.length && was.every((s, k) => key(s) === key(now[k]));
      if (!atEnd) { other++; assert.deepEqual(plan, editBlocks(now, base, book, {}), `${tag}: not an addition at the end = planned as before`); continue; }
      if (base.blocks.length > 1) { older++; assert.deepEqual(plan, editBlocks(now, base, book, {}), `${tag}: an older animation of several parts = as before`); continue; }
      added++; assert.deepEqual(plan.map((b) => [b.id, b.steps!.length]), [[base.blocks[0].id, now.length]], `${tag}: the added moves stay in his one part`);
    }
  }
  console.log(`replayed: ${other} other edits planned as before, ${added} additions kept in one part, ${older} on older several-part animations as before`);
});
