import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript";

const path = "scripts/spec0008-ai-animator/phase1BrowserProof.ts";
const original = readFileSync(path, "utf8");
const sha = (value: string) => createHash("sha256").update(value).digest("hex");
assert.equal(sha(original), "58c7f69ebcaa3aaaca5cf5e8d02c05e1c8baec3fd9e22bbdaa4733045e581365");
const output = "output/spec-0012/phase-2-correction/animator-smoke"; mkdirSync(output, { recursive: true });
// Reuse the frozen fixture's provider protocol, reply, and exact storage/canvas digests.
// This intentionally focused smoke is not represented as the historical timing suite.
const prefix = original.split("const browser = await chromium.launch({")[0].replace('const outputRoot = "output/spec-0008/phase-1/browser";', `const outputRoot = "${output}";`);
const body = `
const browser = await chromium.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true });
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 814 } });
  await context.addInitScript(() => { localStorage.setItem("da_welcome_seen", "1"); localStorage.setItem("da_welcome_never_show", "1"); });
  await installRoutes(context);
  const page = await context.newPage(); page.on("pageerror", error => errors.push(error.message));
  const assistantRequests: string[] = []; page.on("request", request => { if (request.url().includes("/api/diamond-assistant")) assistantRequests.push(request.method()); });
  await openNew(page);
  const beforeCanvas = await canvasDigest(page); const beforeStore = await projectStoreDigest(page);
  await page.getByLabel("Message AI Animator").fill("hello");
  await page.getByRole("button", { name: /^(Send|Send AI message)$/ }).click();
  const status = page.getByRole("status", { name: "AI Animator request status" }); await status.waitFor();
  equal((await status.textContent())?.trim(), "Thinking", "Animator retains complete truthful Thinking label");
  const presentation = await status.locator(".ai-animator-thinking").evaluate(element => ({ primary: getComputedStyle(element, "::before").animationName, follow: getComputedStyle(element, "::after").animationName }));
  const statusStyle = await status.locator(".ai-animator-thinking").evaluate(element => {
    const style = getComputedStyle(element); const layer = (pseudo: string) => { const s = getComputedStyle(element, pseudo); return { gradient: s.backgroundImage, mask: s.maskImage, maskSize: s.maskSize, backgroundSize: s.backgroundSize, backgroundPosition: s.backgroundPosition, backgroundRepeat: s.backgroundRepeat, duration: s.animationDuration, timing: s.animationTimingFunction, textFill: s.webkitTextFillColor }; };
    return { fontFamily: style.fontFamily, fontSize: style.fontSize, fontWeight: style.fontWeight, color: style.color, lineHeight: style.lineHeight, before: layer("::before"), after: layer("::after") };
  });
  check(presentation.primary !== "none" && presentation.follow !== "none", "Animator retains both original Thinking sweep animations");
  const reply = page.locator("[data-ai-assistant-message]").filter({ hasText: /Hello! I’m Terra/ }); await reply.waitFor({ timeout: 20000 });
  await status.waitFor({ state: "detached" }); await page.waitForTimeout(800);
  equal(await reply.locator(".ai-animator-sr-only").textContent(), "Terra: " + assistantReply("hello", "conversation"), "real Animator renders exact deterministic Terra reply and accessible copy");
  equal(await canvasDigest(page), beforeCanvas, "Animator guidance preserves exact canvas bytes");
  equal(await projectStoreDigest(page), beforeStore, "Animator guidance preserves exact saved project store bytes");
  equal(assistantRequests, [], "Animator makes zero Assistant requests");
  equal(await page.evaluate(async () => (await indexedDB.databases()).filter(db => db.name === "diamond-assistant-session-v1")), [], "Animator neither creates nor writes Assistant database");
  equal(capturedRequests.length, 1, "one deterministic Animator request");
  equal(capturedRequests[0].reasoningLevel, "medium", "Animator retains Medium default");
  equal(errors, [], "no Animator page errors"); equal(externalRequests, [], "no external requests");
  await page.screenshot({ path: outputRoot + "/reply.png" });
  writeFileSync(outputRoot + "/result.json", JSON.stringify({ status: "PASS", assertions, presentation, statusStyle, capturedRequests: capturedRequests.length, assistantRequests, errors, externalRequests, realProviderCalls: 0, paidCalls: 0 }, null, 2));
  console.log(JSON.stringify({ status: "PASS", assertions }));
} finally { await browser.close(); }
`;
const generated = ts.transpileModule(prefix + body, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText;
const target = resolve(output, "smoke.mjs"); writeFileSync(target, generated);
writeFileSync(resolve(output, "binding.json"), JSON.stringify({ source: path, sourceSha256: sha(original), generatedSha256: sha(generated), coverage: "Focused deterministic real-browser smoke, not full historical animation timing proof" }, null, 2));
const result = spawnSync(process.execPath, [target, "--url=http://127.0.0.1:57970/"], { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
writeFileSync(resolve(output, "run.log"), `${result.stdout}\n${result.stderr}`); assert.equal(result.status, 0, result.stderr); console.log(result.stdout);
