// (Nov 8 night, Arthur: "never again") REPLAY GATE ($0): every edit Arthur ever sent (saved ops + steps) through the new edit logic. Fails loudly on any asked change dropped,
// any unasked change, or a crash.
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";
import { applyV1Ops, editBlocks, keepUnchanged, stepsEdit, withAskedTiming, h3EndOf } from "./v1AnimatorCore.ts";
import { readLunaBook, readEngineWords } from "./v1LunaBook.ts";

const OUT = "/Users/arthurcarlin/Projects/diamond-review/ltx-effects/out/app-v1";
const book = readLunaBook("/Users/arthurcarlin/Projects/diamond-review/ltx-effects/v1k/luna-book.json");
const words = readEngineWords("/Users/arthurcarlin/Projects/diamond-review/ltx-effects/v1k/passed_engine_book.json");
const J = (p: string) => JSON.parse(readFileSync(p, "utf8"));
const key = (s: any) => JSON.stringify({ ...s, changed: undefined });

test("replay every saved edit Arthur sent (skipped where the saved runs are not on this machine)", { skip: !existsSync(OUT) }, () => {
  let n = 0, skipped = 0; const fails: string[] = [];
  for (const proj of readdirSync(OUT)) for (const anim of existsSync(join(OUT, proj)) ? readdirSync(join(OUT, proj)) : []) {
    const A = join(OUT, proj, anim); if (!existsSync(join(A, "v1"))) continue;
    const vs = readdirSync(A).filter((d) => /^v\d+$/.test(d)).map((d) => Number(d.slice(1))).sort((a, b) => a - b);
    for (const v of vs) {
      const opsP = join(A, `v${v}`, "ops.json"), inP = join(A, `v${v}`, "input.plan.json");
      if (v < 2 || !existsSync(opsP) || !existsSync(inP)) continue;
      const prev = [...vs].reverse().find((u) => u < v && existsSync(join(A, `v${u}`, "report.json")) && existsSync(join(A, `v${u}`, "plan.json")));
      if (!prev) { skipped++; continue; }
      const base = J(join(A, `v${prev}`, "plan.json")), ops = J(opsP), inp = J(inP);
      const steps = (inp.blocks ?? []).flatMap((b: any) => b.steps ?? []);
      const old = (base.blocks ?? []).flatMap((b: any) => b.steps ?? []);
      if (!steps.length || !old.length) { skipped++; continue; }
      const tag = `${proj.slice(0, 6)}/${anim.slice(0, 6)}/v${v}`;
      try {
        const applied = applyV1Ops(base, ops, book, words, { message: inp.context?.change ?? "", retried: true });
        if ("error" in applied) { skipped++; continue; }   // (the app re-asks Sonnet; not an edit result)
        n++;
        const h3 = h3EndOf(join(A, `v${prev}`), J(join(A, `v${prev}`, "report.json")));
        const out = withAskedTiming(stepsEdit(steps, applied.plan, base, ops, book, h3), applied.plan, base);   // (the saved steps are already the app's processed steps)
        const outSteps = out.blocks.flatMap((b: any) => b.steps ?? []);
        // 1. the asked steps are exactly the steps made
        if (outSteps.length !== steps.length || outSteps.some((s: any, i: number) => key(s) !== key(steps[i]))) fails.push(`${tag}: steps differ from the asked steps`);
        // 2. asked slow motion never dropped
        for (const o of ops.filter((o: any) => o.op === "timing")) {
          const b = out.blocks.find((x: any) => x.id === o.block) ?? out.blocks[0];
          if (!(b.timing ?? []).some((t: any) => t.move === o.beat - 1)) fails.push(`${tag}: slow motion of move ${o.beat} dropped`);
        }
        // 3. asked look kept
        for (const k of ["colour", "style", "mirror", "size", "look", "partColours"]) if (JSON.stringify((applied.plan as any)[k] ?? null) !== JSON.stringify((out as any)[k] ?? null)) fails.push(`${tag}: look '${k}' dropped`);
        // 4. nothing before the first changed step changes
        const sameSteps = steps.length === old.length && steps.every((s: any, i: number) => key(s) === key(old[i]));
        const f = sameSteps ? -1 : steps.findIndex((s: any, i: number) => !old[i] || key(s) !== key(old[i]));
        let at = 0;
        for (const b of base.blocks) {
          const len = (b.steps ?? []).length, o = out.blocks.find((x: any) => x.id === b.id);
          const lastBefore = f >= 0 && at + len <= f && !base.blocks.slice(base.blocks.indexOf(b) + 1).some((x: any, j: number) => at + len + base.blocks.slice(base.blocks.indexOf(b) + 1, base.blocks.indexOf(b) + 1 + j).reduce((t: number, y: any) => t + (y.steps ?? []).length, 0) + (x.steps ?? []).length <= f);
          if (f >= 0 && at + len <= f && lastBefore && h3[b.id] !== undefined) { const w = h3[b.id]; if (w >= 1 ? (!o || o.edit_from_beat !== w) : !!o && o.sentence === b.sentence && o.seed_bump === b.seed_bump) fails.push(`${tag}: part ${b.id} ends on H3 - should keep moves before ${w + 1}`); else console.log(`ok ${tag}: ${b.id} ends on H3 -> kept before move ${w + 1}`); }
          else if (f >= 0 && at + len <= f) { if (!o || o.sentence !== b.sentence || o.seed_bump !== b.seed_bump || o.edit_from_beat != null) fails.push(`${tag}: part ${b.id} before the change was not kept`); }
          else if (f >= at && f < at + len && f - at >= 1 && len > 0) { if (!o || o.edit_from_beat !== f - at) fails.push(`${tag}: part ${b.id} should keep moves before ${f - at + 1} (edit_from_beat ${o?.edit_from_beat})`); }
          at += len;
        }
        // 5. same words, "redo move k" = only from move k
        if (sameSteps) for (const o of ops.filter((o: any) => o.op === "rewrite" && typeof o.beat === "number" && o.beat > 1)) {
          const b = out.blocks.find((x: any) => x.id === o.block), bb = base.blocks.find((x: any) => x.id === o.block);
          if (b && bb && b.sentence === bb.sentence && b.edit_from_beat !== o.beat - 1) fails.push(`${tag}: redo of move ${o.beat} not limited to that move`);
        }
        // 6. same steps and no motion op = no new take (a $0 re-draw)
        if (sameSteps && !ops.some((o: any) => o.op === "redo" || o.op === "rewrite")) for (const b of out.blocks) { const bb = base.blocks.find((x: any) => x.id === b.id); if (bb && b.seed_bump !== bb.seed_bump) fails.push(`${tag}: a look/timing edit would re-make ${b.id}`); }
      } catch (e) { fails.push(`${tag}: CRASH ${String(e).slice(0, 120)}`); }
    }
  }
  console.log(`replayed ${n} saved edits (skipped ${skipped} without steps / no base / re-asked)`);
  for (const f of fails) console.log("FAIL " + f);
  assert.equal(fails.length, 0);
});
