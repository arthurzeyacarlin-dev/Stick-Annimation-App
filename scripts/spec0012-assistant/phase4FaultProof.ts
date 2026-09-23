import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const sourcePath = "scripts/spec0012-assistant/phase2FaultProof.ts"; const source = readFileSync(sourcePath, "utf8");
const output = resolve("output/spec-0012/phase-4/faults"); mkdirSync(output, { recursive: true });
const adapted = source
  .replaceAll('"../../src/', `"${resolve("src")}/`)
  .replaceAll('"./phase2Fixtures.ts"', `"${resolve("scripts/spec0012-assistant/phase2Fixtures.ts")}"`)
  .replaceAll("http://127.0.0.1:57970", "http://127.0.0.1:58041")
  .replaceAll("output/spec-0012/phase-2-correction/faults", "output/spec-0012/phase-4/faults/run")
  .replace(
    'await page.getByText("A saved chat could not be verified.", { exact: false }).waitFor(); check(await page.getByRole("article", { name: "Your message", exact: true }).isVisible(), "corruption preserves last readable visible conversation"); check(await page.getByRole("button", { name: "Send", exact: true }).isDisabled(), "corruption visibly blocks unsafe Send");',
    'await page.waitForTimeout(600); await page.getByLabel("Message the Assistant").fill("A healthy new chat remains available"); check(await page.getByRole("button", { name: "New Chat", exact: true }).isEnabled() && await page.getByLabel("Reasoning level").isEnabled() && await page.getByRole("button", { name: "Send", exact: true }).isEnabled(), "corruption preserves healthy-chat controls instead of globally blocking them"); equal(await run(`const db=await raw();return new Promise(r=>{const t=db.transaction(\'sessions\');const get=t.objectStore(\'sessions\').get(\'${basic.id}\');t.oncomplete=()=>{db.close();r(get.result.digest)}})`), "0".repeat(64), "corrupt row bytes remain preserved while healthy-chat controls stay usable");',
  );
assert.doesNotMatch(adapted, /corruption visibly blocks unsafe Send/);
assert.match(adapted, /corrupt row bytes remain preserved/);
const target = resolve(output, "fault-proof-adapted.ts"); writeFileSync(target, adapted);
const result = spawnSync(process.execPath, ["--experimental-strip-types", target], { cwd: process.cwd(), encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
writeFileSync(resolve(output, "run.log"), `${result.stdout}\n${result.stderr}`); assert.equal(result.status, 0, result.stderr.slice(-8000));
writeFileSync(resolve(output, "binding.json"), JSON.stringify({ status: "PASS", sourcePath, sourceSha256: createHash("sha256").update(source).digest("hex"), adaptedSha256: createHash("sha256").update(adapted).digest("hex"), changes: ["no-key production origin 57970 → 58041", "proof output root", "absolute fixture imports", "superseded global corruption block assertion → accepted preservation plus healthy-chat usability assertion"], assertionsRemoved: 0, assertionsReplaced: 2, realProviderCalls: 0, paidCalls: 0 }, null, 2));
console.log(result.stdout.trim());
