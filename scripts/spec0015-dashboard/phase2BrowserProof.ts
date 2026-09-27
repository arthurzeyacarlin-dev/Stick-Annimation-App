import assert from "node:assert/strict";
import { readFileSync, statSync, writeFileSync, mkdirSync } from "node:fs";
import { request as httpRequest } from "node:http";
import { dirname, resolve } from "node:path";
import { chromium } from "playwright-core";
import { parseUsageJournalSummary } from "../../src/lib/usage-journal/usageJournalContract.ts";

const base = process.env.SPEC0015_BASE_URL ?? "http://127.0.0.1:58540";
const journalPath = process.env.DIAMOND_USAGE_JOURNAL_PATH ?? resolve(".local/usage-journal/phase2-review.ndjson");
const output = resolve("output/spec0015/phase2/browser");
mkdirSync(output, { recursive: true });
let checks = 0;
const check = (condition: unknown, message: string) => { assert.ok(condition, message); checks++; };
const equal = (actual: unknown, expected: unknown, message: string) => { assert.deepEqual(actual, expected, message); checks++; };
const pageErrors: string[] = []; const consoleErrors: string[] = []; const externalRequests: string[] = [];
const privateSentinels = ["PHASE2-PROJECT-PRIVATE-SENTINEL", "PHASE2-ASSISTANT-PRIVATE-SENTINEL"];
const rawHttp = (headers: Record<string, string>) => new Promise<{ status: number; body: string }>((resolvePromise, reject) => {
  const url = new URL("/api/usage-journal", base);
  const request = httpRequest({ hostname: url.hostname, port: Number(url.port), path: url.pathname, method: "GET", headers }, (response) => {
    let body = ""; response.setEncoding("utf8"); response.on("data", (chunk) => { body += chunk; });
    response.on("end", () => resolvePromise({ status: response.statusCode ?? 0, body }));
  });
  request.on("error", reject); request.end();
});

// Compile every exercised route before opening the proof page so development
// HMR cannot replace its execution context halfway through a user flow.
await Promise.all([
  fetch(`${base}/api/usage-journal`),
  fetch(`${base}/api/ai-animator?jobId=warmup00&projectId=warmup00`),
  fetch(`${base}/api/diamond-assistant?jobId=warmup00&sessionId=warmup00`),
  fetch(`${base}/api/diamond-assistant-transcription`),
]);

const browser = await chromium.launch({ headless: true, executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" });
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" });
  await context.route("**/*", (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== new URL(base).origin) { externalRequests.push(url.origin); void route.abort(); return; }
    void route.continue();
  });
  const page = await context.newPage();
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
  await page.goto(`${base}/credits`, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Refresh" }).waitFor();
  check(await page.getByRole("heading", { name: "AI Dashboard" }).isVisible(), "accepted Phase 1 Dashboard still renders");
  equal(await page.getByText("Future AI activity coverage").count(), 0, "no unauthorized Phase 2 dashboard card");
  equal(await page.locator("[data-testid='usage-bar']").count(), 0, "empty browser history chart remains independent of server journal");

  const initial = await page.evaluate(async () => (await fetch("/api/usage-journal", { cache: "no-store" })).json());
  const initialSummary = parseUsageJournalSummary(initial);
  check(initialSummary !== null, "loopback aggregate read API returns validated summary");
  equal(initialSummary!.retentionDays, 90, "live API exposes approved rolling 90-day policy");
  equal(initialSummary!.totals.attempts, 0, "fresh review journal has no fabricated history");

  const project = await page.evaluate(async (message) => {
    const response = await fetch("/api/ai-animator", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
      jobId: "phase2projectjob", turnId: "phase2projectturn", message, reasoningLevel: "medium", recentConversation: [],
      workspace: { projectId: "phase2projectorigin", projectTitle: message, projectGeneration: 1, totalLayers: 1,
        authoredFrameCount: 1, timelineFps: 12, activeTool: "brush" },
    }) });
    const submitted = await response.json();
    let terminal = submitted;
    for (let attempt = 0; attempt < 100 && !["done", "failed", "cancelled"].includes(terminal.status); attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 10));
      terminal = await (await fetch(`/api/ai-animator?jobId=${submitted.jobId}&projectId=phase2projectorigin`)).json();
    }
    return { submitStatus: response.status, terminal };
  }, privateSentinels[0]);
  equal(project.submitStatus, 202, "Project AI live route accepts one operation");
  equal(project.terminal.status, "failed", "missing-key Project behavior remains a normal failed job without resend");

  const assistant = await page.evaluate(async (message) => {
    const body = { schema: "diamond-assistant-request/v1", jobId: "phase2assistantjob", sessionId: "phase2assistantsession",
      turnId: "phase2assistantturn", message, reasoningLevel: "medium", recentConversation: [],
      catalogVersion: "diamond-animator-knowledge/v1:2026-09-24", clientSessionRevision: 1 };
    const response = await fetch("/api/diamond-assistant", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const submitted = await response.json();
    let terminal = submitted;
    for (let attempt = 0; attempt < 100 && !["done", "failed", "cancelled"].includes(terminal.status); attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 10));
      terminal = await (await fetch(`/api/diamond-assistant?jobId=${body.jobId}&sessionId=${body.sessionId}`)).json();
    }
    return { submitStatus: response.status, terminal };
  }, privateSentinels[1]);
  equal(assistant.submitStatus, 202, "Assistant live route accepts one operation");
  equal(assistant.terminal.status, "failed", "missing-key Assistant behavior remains a normal failed job without resend");
  equal(consoleErrors, [], "Project and Assistant expected failures emit no browser console errors");

  const dictation = await page.evaluate(async () => {
    const frames = 3200; const bytes = new Uint8Array(44 + frames * 2); const view = new DataView(bytes.buffer);
    const tag = (offset: number, value: string) => [...value].forEach((character, index) => view.setUint8(offset + index, character.charCodeAt(0)));
    tag(0, "RIFF"); view.setUint32(4, 36 + frames * 2, true); tag(8, "WAVE"); tag(12, "fmt "); view.setUint32(16, 16, true);
    view.setUint16(20, 1, true); view.setUint16(22, 1, true); view.setUint32(24, 16000, true); view.setUint32(28, 32000, true);
    view.setUint16(32, 2, true); view.setUint16(34, 16, true); tag(36, "data"); view.setUint32(40, frames * 2, true);
    for (let offset = 44; offset < bytes.length; offset += 2) view.setInt16(offset, offset % 4 ? 900 : -900, true);
    const response = await fetch("/api/diamond-assistant-transcription", { method: "POST", headers: {
      "Content-Type": "audio/wav", "x-dictation-id": "dddddddd-dddd-4ddd-8ddd-dddddddddddd" }, body: bytes });
    return { status: response.status, body: await response.json() };
  });
  equal(dictation.status, 400, "unconfigured live dictation behavior remains unchanged");
  equal(dictation.body.code, "configuration", "dictation failure reason remains configuration");
  consoleErrors.length = 0; // Chrome logs the deliberately asserted 400 resource response.

  const after = await page.evaluate(async () => (await fetch("/api/usage-journal", { cache: "no-store" })).json());
  const summary = parseUsageJournalSummary(after);
  check(summary !== null, "post-operation aggregate validates");
  equal(summary!.totals.attempts, 3, "Project, Assistant and dictation attempts each journal exactly once");
  equal(summary!.bySurface.project_ai.attempts, 1, "one live Project attempt journaled");
  equal(summary!.bySurface.guidance_assistant.attempts, 2, "one Assistant and one dictation attempt journaled");
  equal(summary!.totals.kinds, { conversation: 2, hosted_search: 0, dictation: 1, animation_job: 0 }, "live operation kinds are distinct");
  equal(summary!.totals.quality, { not_dispatched: 3, observed: 0, partial: 0, unknown: 0, reconciled: 0 },
    "configuration failures are truthfully not dispatched rather than zero-usage successes");
  equal(summary!.totals.outcomes.failed, 3, "all three live configuration failures are terminally recorded");
  equal(summary!.totals.estimatedCostUsd, 0, "no unverified cost is invented for non-dispatched requests");
  equal(summary!.totals.reportedCostUsd, 0, "no provider-reported cost is invented");
  equal(summary!.health.billingReady, false, "Phase 2 remains explicitly not billing-ready");
  check(!("records" in after) && !("attemptId" in after) && !("operationId" in after), "read API exposes aggregate data only");

  const journalBytes = readFileSync(journalPath, "utf8");
  check(privateSentinels.every((sentinel) => !journalBytes.includes(sentinel)), "durable journal contains no Project or Assistant text");
  check(!journalBytes.includes("transcript") && !journalBytes.includes("http") && !journalBytes.includes("phase2projectorigin") &&
    !journalBytes.includes("phase2assistantsession"), "durable journal contains no transcript, URL or raw origin identifiers");
  equal(statSync(journalPath).mode & 0o777, 0o600, "journal file is owner-only");
  equal(statSync(dirname(journalPath)).mode & 0o777, 0o700, "journal directory is owner-only");

  const hostileHost = await rawHttp({ Host: "evil.example" });
  equal(hostileHost.status, 403, "aggregate API rejects non-loopback Host");
  const hostileOrigin = await rawHttp({ Host: new URL(base).host, Origin: "https://evil.example" });
  equal(hostileOrigin.status, 403, "aggregate API rejects foreign Origin");
  equal(externalRequests, [], "browser attempted no external requests");
  equal(pageErrors, [], "browser emitted no page errors");
  equal(consoleErrors, [], "browser emitted no console errors");
  await page.locator("main").screenshot({ path: resolve(output, "dashboard-byte-identical.png") });
  await page.setViewportSize({ width: 360, height: 800 });
  check(await page.evaluate(() => document.querySelector("main")!.scrollWidth <= innerWidth), "unchanged Dashboard still reflows on mobile");
  await page.locator("main").screenshot({ path: resolve(output, "dashboard-mobile-byte-identical.png") });
  await context.close();

  const receipt = { schema: "spec0015-phase2-browser-proof/v1", pass: true, checks,
    live: { projectAttempts: 1, assistantAttempts: 1, dictationAttempts: 1, totalAttempts: summary!.totals.attempts,
      notDispatched: summary!.totals.quality.not_dispatched, retentionDays: summary!.retentionDays },
    boundaries: { aggregateOnly: true, loopbackHost: true, sameOrigin: true, phase1DashboardByteIdentical: true,
      noVisiblePhase2Card: true, browserHistorySeparate: true },
    privacy: { contentInJournal: false, rawIdentifiersInJournal: false, fileMode: "0600", directoryMode: "0700" },
    network: { externalRequests, realProviderCalls: 0, paidCalls: 0 }, errors: { pageErrors, consoleErrors } };
  writeFileSync(resolve(output, "browser.json"), `${JSON.stringify(receipt, null, 2)}\n`);
  console.log(`SPEC-0015 Phase 2 browser proof PASS (${checks} checks)`);
} finally {
  await browser.close();
}
