import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript";

// Keep every historical Animator assertion. Adapt only fixture setup/navigation
// to the subsequently published recovery gate and Open Project's Edit label.
const path = "scripts/spec0008-ai-animator/phase1BrowserProof.ts";
const original = readFileSync(path, "utf8");
const sha = (value: string) => createHash("sha256").update(value).digest("hex");
assert.equal(sha(original), "58c7f69ebcaa3aaaca5cf5e8d02c05e1c8baec3fd9e22bbdaa4733045e581365");
const output = "output/spec-0012/phase-1-correction/animator";
mkdirSync(output, { recursive: true });
let adapted = original;
const replacements: Array<[string, string]> = [
  ['const outputRoot = "output/spec-0008/phase-1/browser";', `const outputRoot = "${output}";`],
  ['  await page.goto(url);\n  await page.getByRole("button", { name: /^New Project/ }).click();', `  await page.goto(url);
  await page.getByRole("button", { name: /^New Project/ }).or(page.getByRole("button", { name: "Discard Draft", exact: true })).waitFor();
  if (await page.getByRole("button", { name: "Discard Draft", exact: true }).isVisible()) {
    await page.getByRole("button", { name: "Discard Draft", exact: true }).click();
    await page.getByRole("alert").getByRole("button", { name: "Discard Draft", exact: true }).click();
  }
  await page.getByRole("button", { name: /^New Project/ }).click();`],
  ['name: "Open Untitled Project", exact: true', 'name: "Edit Untitled Project", exact: true'],
  ['const context = await browser.newContext(', 'try {\nconst context = await browser.newContext('],
  ['const revealingReplyObserved = revealingReply.waitFor({ timeout: 30_000 });', 'const revealingReplyObserved = revealingReply.waitFor({ timeout: 30_000 });\nvoid revealingReplyObserved.catch(() => undefined);'],
];
for (const [before, after] of replacements) {
  assert.equal(adapted.split(before).length - 1, 1, `one bounded adapter target: ${before}`);
  adapted = adapted.replace(before, after);
}
adapted += "\n} catch (error) { console.error(error); throw error; } finally { await browser.close(); }\n";
const generated = ts.transpileModule(adapted, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText;
const generatedPath = resolve(output, "adapted-browser.mjs");
writeFileSync(generatedPath, generated);
writeFileSync(resolve(output, "adapter-binding.json"), JSON.stringify({ sourcePath: path, sourceSha256: sha(original), generatedSha256: sha(generated), replacements: replacements.map(([before]) => before), assertionsRemoved: 0 }, null, 2));
const result = spawnSync(process.execPath, [generatedPath, "--url=http://127.0.0.1:57950/"], { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
writeFileSync(resolve(output, "run.log"), `${result.stdout}\n${result.stderr}`);
assert.equal(result.status, 0, (result.stderr || result.stdout).slice(-5000));
const proof = JSON.parse(readFileSync(resolve(output, "browser-result.json"), "utf8"));
assert.equal(proof.status, "PASS");
assert.deepEqual(proof.externalRequests, []);
assert.deepEqual(proof.errors, []);
console.log(JSON.stringify({ status: "PASS", assertions: proof.assertions, mockedRequests: proof.capturedRequests, adapter: "recovery fixture discard and Open/Edit label only; all original assertions retained" }));
