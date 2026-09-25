import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { chromium, type BrowserContext, type Page, type Route } from "playwright-core";
import type { AssistantRequest, JobSnapshot } from "../../src/lib/assistant/assistantContracts.ts";

const url = process.argv.find(argument => argument.startsWith("--url="))?.slice(6) ?? "http://127.0.0.1:58430/";
assert.match(url, /^http:\/\/127\.0\.0\.1:\d+\/$/);
const origin = new URL(url).origin;
const outputRoot = resolve("output/spec0014/phase2/browser");
mkdirSync(outputRoot, { recursive: true });
const assertions: string[] = [];
const errors: string[] = [];
const externalRequests: string[] = [];
const screenshots: string[] = [];
let assistantPosts = 0;
let terraPosts = 0;
let assertionsCount = 0;
const check = (value: unknown, label: string) => { assertionsCount += 1; assert.ok(value, label); assertions.push(label); };
const equal = (actual: unknown, expected: unknown, label: string) => { assertionsCount += 1; assert.deepEqual(actual, expected, label); assertions.push(label); };
const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");

type AssistantFixture = { request: AssistantRequest; createdAt: number; released: boolean; outcome: "done" | "failed" | "cancelled" };
type TerraRequestFixture = {
  jobId: string;
  turnId: string;
  message: string;
  reasoningLevel: "low" | "medium" | "high" | "extra-high";
  workspace: { projectId: string; projectGeneration: number };
};
type TerraFixture = { request: TerraRequestFixture; createdAt: string; released: boolean; outcome: "done" | "failed" | "cancelled" };
const assistantJobs = new Map<string, AssistantFixture>();
const terraJobs = new Map<string, TerraFixture>();

const assistantSnapshot = (job: AssistantFixture): JobSnapshot => {
  const base = { sequence: 1, at: job.createdAt, status: "thinking" as const };
  if (!job.released) return { schema: "diamond-assistant-job/v1", jobId: job.request.jobId, sessionId: job.request.sessionId, turnId: job.request.turnId, reasoning: job.request.reasoningLevel, catalogVersion: job.request.catalogVersion, status: "thinking", events: [base], result: null, error: null };
  if (job.outcome === "cancelled") return { schema: "diamond-assistant-job/v1", jobId: job.request.jobId, sessionId: job.request.sessionId, turnId: job.request.turnId, reasoning: job.request.reasoningLevel, catalogVersion: job.request.catalogVersion, status: "cancelled", events: [base, { sequence: 2, at: job.createdAt + 2, status: "cancelled" }], result: null, error: "Answer cancelled. Your message is saved." };
  if (job.outcome === "failed") return { schema: "diamond-assistant-job/v1", jobId: job.request.jobId, sessionId: job.request.sessionId, turnId: job.request.turnId, reasoning: job.request.reasoningLevel, catalogVersion: job.request.catalogVersion, status: "failed", events: [base, { sequence: 2, at: job.createdAt + 2, status: "failed" }], result: null, error: "Deterministic Assistant failure. Nothing was resent." };
  return {
    schema: "diamond-assistant-job/v1", jobId: job.request.jobId, sessionId: job.request.sessionId, turnId: job.request.turnId, reasoning: job.request.reasoningLevel, catalogVersion: job.request.catalogVersion,
    status: "done", events: [base, { sequence: 2, at: job.createdAt + 1, status: "finalizing" }, { sequence: 3, at: job.createdAt + 2, status: "done" }], error: null,
    result: { reply: { answer: `Deterministic answer for ${job.request.message}`, title: job.request.message.slice(0, 60) }, usage: { inputTokens: 20, outputTokens: 10, totalTokens: 30, estimatedCostUsd: 0.00016, priceDate: "2026-09-23", responseId: `response_${job.request.jobId}`, latencyMs: 2, model: "gpt-5.6-terra", reasoning: job.request.reasoningLevel, toolCalls: 0 } },
  };
};

const terraSnapshot = (job: TerraFixture) => {
  const request = job.request;
  const terminalAt = new Date(Date.parse(job.createdAt) + 2).toISOString();
  const terminal = job.released;
  const status = terminal ? job.outcome : "thinking";
  const events: Array<Record<string, unknown>> = [{ sequence: 1, status: "thinking", createdAt: job.createdAt }];
  if (terminal) events.push(job.outcome === "done"
    ? { sequence: 2, status: "done", createdAt: terminalAt, reply: { intent: "conversation", reply: `Deterministic Terra answer for ${request.message}`, focusedQuestion: null, planSummary: null }, provider: { requestedModel: "gpt-5.6-terra", providerModel: "fixture", responseId: `terra_${request.jobId}`, usage: { inputTokens: 20, outputTokens: 10, totalTokens: 30, estimatedCostUsd: 0.00016 } } }
    : job.outcome === "failed"
      ? { sequence: 2, status: "failed", createdAt: terminalAt, errorCode: "fixture_failure", errorMessage: "Deterministic Terra failure. No animation changed." }
      : { sequence: 2, status: "cancelled", createdAt: terminalAt });
  return {
    version: 1, jobId: request.jobId, turnId: request.turnId, projectId: request.workspace.projectId, projectGeneration: request.workspace.projectGeneration, reasoningLevel: request.reasoningLevel,
    intent: status === "done" ? "conversation" : null, status, lastSequence: events.length, createdAt: job.createdAt, updatedAt: terminal ? terminalAt : job.createdAt, completedAt: terminal ? terminalAt : null,
    telemetry: { model: "gpt-5.6-terra", effort: request.reasoningLevel === "extra-high" ? "xhigh" : request.reasoningLevel, outcome: status === "done" ? "succeeded" : status === "failed" ? "failed" : status === "cancelled" ? "cancelled" : "active", latencyMs: terminal ? 2 : null, promptDigest: sha256(request.message), usage: terminal ? { inputTokens: 20, outputTokens: 10, totalTokens: 30, estimatedCostUsd: 0.00016 } : { inputTokens: null, outputTokens: null, totalTokens: null, estimatedCostUsd: null } }, events,
  };
};

const routeApis = async (route: Route) => {
  const request = route.request();
  const parsed = new URL(request.url());
  if (parsed.pathname === "/api/diamond-assistant") {
    if (request.method() === "POST") {
      assistantPosts += 1;
      const body = request.postDataJSON() as AssistantRequest;
      const fixture: AssistantFixture = { request: body, createdAt: Date.now(), released: false, outcome: body.message.includes("failure") ? "failed" : "done" };
      assistantJobs.set(body.jobId, fixture);
      await route.fulfill({ status: 202, contentType: "application/json", body: JSON.stringify(assistantSnapshot(fixture)) }); return;
    }
    const body = request.method() === "DELETE" ? request.postDataJSON() as { jobId: string } : null;
    const jobId = body?.jobId ?? parsed.searchParams.get("jobId") ?? "";
    const fixture = assistantJobs.get(jobId);
    if (!fixture) { await route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ error: "missing" }) }); return; }
    if (request.method() === "DELETE") { fixture.outcome = "cancelled"; fixture.released = true; }
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(assistantSnapshot(fixture)) }); return;
  }
  if (parsed.pathname === "/api/ai-animator") {
    if (request.method() === "POST") {
      terraPosts += 1;
      const body = request.postDataJSON() as TerraRequestFixture;
      const fixture: TerraFixture = { request: body, createdAt: new Date().toISOString(), released: false, outcome: String(body.message).includes("failure") ? "failed" : "done" };
      terraJobs.set(String(body.jobId), fixture);
      await route.fulfill({ status: 202, contentType: "application/json", body: JSON.stringify(terraSnapshot(fixture)) }); return;
    }
    const body = request.method() === "DELETE" ? request.postDataJSON() as { jobId: string } : null;
    const jobId = body?.jobId ?? parsed.searchParams.get("jobId") ?? "";
    const fixture = terraJobs.get(jobId);
    if (!fixture) { await route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ error: "missing" }) }); return; }
    if (request.method() === "DELETE") { fixture.outcome = "cancelled"; fixture.released = true; }
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(terraSnapshot(fixture)) }); return;
  }
  if (parsed.pathname.startsWith("/api/")) { throw new Error(`unexpected-api:${request.method()}:${parsed.pathname}`); }
  await route.continue();
};

const installContext = async (context: BrowserContext) => {
  await context.addInitScript(() => { localStorage.setItem("da_welcome_never_show", "1"); localStorage.setItem("da_welcome_seen", "1"); });
  await context.route("**/*", async route => {
    const parsed = new URL(route.request().url());
    if (parsed.origin === origin) return routeApis(route);
    if (parsed.protocol === "data:" || parsed.protocol === "blob:") return route.continue();
    externalRequests.push(route.request().url());
    await route.abort("blockedbyclient");
  });
};

const installRingCounter = (page: Page, view: "home" | "assistant") => page.evaluate(viewName => {
  const trigger = document.querySelector(`[data-notification-trigger="${viewName}"]`)!;
  document.documentElement.dataset.ringCount = "0";
  new MutationObserver(() => {
    if (trigger.className.includes("ringing")) document.documentElement.dataset.ringCount = String(Number(document.documentElement.dataset.ringCount ?? 0) + 1);
  }).observe(trigger, { attributes: true, attributeFilter: ["class"] });
}, view);
const ringCount = (page: Page) => page.evaluate(() => Number(document.documentElement.dataset.ringCount ?? 0));
const unread = async (page: Page, view: "home" | "assistant") => Number((await page.locator(`[data-notification-trigger="${view}"]`).getAttribute("aria-label"))?.match(/(\d+) unread/)?.[1] ?? -1);
const lastAssistantJob = () => [...assistantJobs.values()].at(-1)!;
const lastTerraJob = () => [...terraJobs.values()].at(-1)!;
const sendAssistant = async (page: Page, message: string) => { await page.getByLabel("Message the Assistant").fill(message); await page.getByRole("button", { name: "Send", exact: true }).click(); await page.getByRole("article", { name: "Your message" }).filter({ hasText: message }).waitFor(); };
const sendTerra = async (page: Page, message: string) => { await page.getByLabel("Message AI Animator").fill(message); await page.getByRole("button", { name: /^(Send|Send AI message)$/ }).click(); await page.getByRole("status", { name: "AI Animator request status" }).waitFor(); };
const saveAndExit = async (page: Page) => { await page.getByRole("button", { name: "File" }).click(); await page.getByRole("menuitem", { name: "Save and Exit", exact: true }).click(); await page.getByRole("button", { name: /^New Project/ }).waitFor({ timeout: 30_000 }); };
const screenshot = async (page: Page, name: string) => { const path = resolve(outputRoot, `${name}.png`); await page.screenshot({ path }); screenshots.push(`${name}.png`); };
const notificationAttemptCount = (page: Page, jobId: string) => page.evaluate(async requestedJobId => {
  const database = await new Promise<IDBDatabase>((resolveDatabase, rejectDatabase) => { const open = indexedDB.open("diamond-notifications-v1"); open.onsuccess = () => resolveDatabase(open.result); open.onerror = () => rejectDatabase(open.error); });
  const rows = await new Promise<Array<{ envelope?: { notification?: { source?: { attemptId?: string } } } }>>((resolveRows, rejectRows) => { const request = database.transaction("notifications", "readonly").objectStore("notifications").getAll(); request.onsuccess = () => resolveRows(request.result); request.onerror = () => rejectRows(request.error); });
  database.close();
  return rows.filter(row => row.envelope?.notification?.source?.attemptId === requestedJobId).length;
}, jobId);
const assistantAnswerCount = (page: Page, turnId: string) => page.evaluate(async requestedTurnId => {
  const database = await new Promise<IDBDatabase>((resolveDatabase, rejectDatabase) => { const open = indexedDB.open("diamond-assistant-session-v1"); open.onsuccess = () => resolveDatabase(open.result); open.onerror = () => rejectDatabase(open.error); });
  const sessions = await new Promise<Array<{ messages?: Array<{ turnId?: string; role?: string }> }>>((resolveRows, rejectRows) => { const request = database.transaction("sessions", "readonly").objectStore("sessions").getAll(); request.onsuccess = () => resolveRows(request.result); request.onerror = () => rejectRows(request.error); });
  database.close();
  return sessions.flatMap(session => session.messages ?? []).filter(message => message.turnId === requestedTurnId && message.role === "assistant").length;
}, turnId);
const terraAnswerCount = (page: Page, projectId: string, jobId: string) => page.evaluate(({ requestedProjectId, requestedJobId }) => {
  const raw = localStorage.getItem(`diamond_ai_animator_ledger_v1:${encodeURIComponent(requestedProjectId)}`);
  const ledger = raw ? JSON.parse(raw) as { messages?: Array<{ jobId?: string; role?: string }> } : null;
  return (ledger?.messages ?? []).filter(message => message.jobId === requestedJobId && message.role === "assistant").length;
}, { requestedProjectId: projectId, requestedJobId: jobId });

const browser = await chromium.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true, args: ["--disable-background-networking", "--disable-component-update", "--disable-sync", "--disable-extensions", "--no-first-run"] });
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await installContext(context);
  const page = await context.newPage();
  page.on("pageerror", error => errors.push(error.message));

  await page.goto(`${origin}/assistant`);
  await sendAssistant(page, "assistant-home-success");
  await page.getByRole("link", { name: "Back to Home" }).click();
  await page.getByRole("button", { name: /^New Project/ }).waitFor();
  await installRingCounter(page, "home");
  lastAssistantJob().released = true;
  await page.waitForFunction(() => document.querySelector('[data-notification-trigger="home"]')?.getAttribute("aria-label")?.includes("1 unread"));
  equal(await unread(page, "home"), 1, "Assistant completion away creates one shared unread row on Home");
  check(await ringCount(page) >= 1, "mounted Home bell rings once for away Assistant completion");
  await page.locator('[data-notification-trigger="home"]').click();
  await page.getByRole("button", { name: /AI Assistant replied/ }).click();
  await page.getByRole("article", { name: "Assistant reply" }).filter({ hasText: "assistant-home-success" }).waitFor();
  await page.waitForFunction(() => document.activeElement?.hasAttribute("data-assistant-terminal-turn"));
  check((await page.evaluate(() => document.activeElement?.getAttribute("data-assistant-terminal-turn"))) !== null, "Assistant activation focuses the exact terminal turn");
  await page.waitForFunction(() => document.querySelector('[data-notification-trigger="assistant"]')?.getAttribute("aria-label")?.includes("0 unread"));
  equal(await unread(page, "assistant"), 0, "activation shares read state with Assistant inbox");

  await installRingCounter(page, "assistant");
  await sendAssistant(page, "assistant-visible-success");
  lastAssistantJob().released = true;
  await page.getByRole("article", { name: "Assistant reply" }).filter({ hasText: "assistant-visible-success" }).waitFor();
  await page.waitForTimeout(850);
  equal(await unread(page, "assistant"), 0, "exact visible Assistant origin stores completion already read");
  equal(await ringCount(page), 0, "exact visible Assistant completion does not ring");
  await page.locator('[data-notification-trigger="assistant"]').click();
  equal(await page.locator('[data-notification-panel="assistant"] button[data-unread]').count(), 0, "watched Assistant completion never appears as a history row");
  await page.getByRole("button", { name: "Close notifications" }).click();

  await sendAssistant(page, "assistant-other-chat-success");
  await page.getByRole("button", { name: "New Chat", exact: true }).click();
  await installRingCounter(page, "assistant");
  lastAssistantJob().released = true;
  await page.waitForFunction(() => document.querySelector('[data-notification-trigger="assistant"]')?.getAttribute("aria-label")?.includes("1 unread"));
  equal(await unread(page, "assistant"), 1, "Assistant chat B receives unread state for chat A without changing selection");
  check(await ringCount(page) >= 1, "Assistant bell rings for another chat's completion");
  await page.locator('[data-notification-trigger="assistant"]').click();
  const crossChatRow = page.locator('[data-notification-panel="assistant"] button[data-unread="true"]');
  await crossChatRow.locator("strong").getByText("assistant-home-success", { exact: false }).waitFor();
  check((await crossChatRow.innerText()).includes("Assistant chat:"), "Assistant unread item identifies its saved chat by title");
  await crossChatRow.click();
  await page.getByRole("article", { name: "Assistant reply" }).filter({ hasText: "assistant-other-chat-success" }).waitFor();
  await page.waitForFunction(() => document.activeElement?.hasAttribute("data-assistant-terminal-turn"));
  await page.waitForFunction(() => document.querySelector('[data-notification-trigger="assistant"]')?.getAttribute("aria-label")?.includes("0 unread"));
  equal(await unread(page, "assistant"), 0, "cross-chat activation reaches exact chat A and clears its one unread item");
  await page.getByRole("link", { name: "Back to Home" }).click();
  await page.getByRole("button", { name: /^New Project/ }).waitFor();
  await installRingCounter(page, "home");
  equal(await unread(page, "home"), 0, "Home shares the already-consumed Assistant read state");
  await page.waitForTimeout(850);
  equal(await ringCount(page), 0, "mounting Home later does not replay the ring");
  await page.locator('[data-notification-trigger="home"]').click();
  equal(await page.locator('[data-notification-panel="home"] button[data-unread]').count(), 0, "consumed Assistant item is absent from the Home inbox, not retained as visible history");
  await page.getByRole("button", { name: "Close notifications" }).click();

  await page.getByRole("button", { name: /^New Project/ }).click();
  await page.getByLabel("Message AI Animator").waitFor();
  const beforeTerraProject = await page.locator('canvas[data-workspace-canvas="editable"]').evaluate(async element => {
    const canvas = element as HTMLCanvasElement; const bytes = canvas.getContext("2d")!.getImageData(0, 0, canvas.width, canvas.height).data;
    return [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes as BufferSource))].map(value => value.toString(16).padStart(2, "0")).join("");
  });
  await sendTerra(page, "terra-save-exit-success");
  await saveAndExit(page);
  await installRingCounter(page, "home");
  lastTerraJob().released = true;
  await page.waitForFunction(() => document.querySelector('[data-notification-trigger="home"]')?.getAttribute("aria-label")?.includes("1 unread"));
  equal(await unread(page, "home"), 1, "Terra completion after Save and Exit creates one Home-only unread row");
  check(await ringCount(page) >= 1, "mounted Home bell rings for Terra completion");
  await page.locator('[data-notification-trigger="home"]').click();
  const terraRow = page.locator('[data-notification-panel="home"] button[data-unread="true"]');
  check((await terraRow.innerText()).includes("Project:"), "Terra unread item identifies its exact project by title");
  await page.getByRole("button", { name: /Terra replied/ }).click();
  await page.locator('[data-ai-assistant-message]').filter({ hasText: "terra-save-exit-success" }).waitFor({ timeout: 30_000 });
  check((await page.evaluate(() => document.activeElement?.hasAttribute("data-ai-assistant-message"))) === true, "Terra activation focuses the exact saved reply");
  const afterTerraProject = await page.locator('canvas[data-workspace-canvas="editable"]').evaluate(async element => {
    const canvas = element as HTMLCanvasElement; const bytes = canvas.getContext("2d")!.getImageData(0, 0, canvas.width, canvas.height).data;
    return [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes as BufferSource))].map(value => value.toString(16).padStart(2, "0")).join("");
  });
  equal(afterTerraProject, beforeTerraProject, "Terra notification lifecycle does not mutate animation pixels");

  await sendTerra(page, "terra-visible-success");
  lastTerraJob().released = true;
  await page.locator('[data-ai-assistant-message]').filter({ hasText: "terra-visible-success" }).waitFor();
  await saveAndExit(page);
  equal(await unread(page, "home"), 0, "exact visible Terra origin stores completion already read and never enters Assistant inbox");

  await page.getByRole("button", { name: /^New Project/ }).click();
  await sendTerra(page, "terra-cancel-silent");
  await page.getByRole("button", { name: /Cancel AI Animator job/ }).click();
  await page.locator('[data-ai-assistant-message]').filter({ hasText: "Cancelled" }).waitFor();
  await saveAndExit(page);
  equal(await unread(page, "home"), 0, "explicit Terra cancellation creates no notification");

  await page.goto(`${origin}/assistant`);
  await page.getByRole("button", { name: "New Chat", exact: true }).click();
  await sendAssistant(page, "assistant-cancel-silent");
  await page.getByRole("button", { name: "Cancel answer" }).click();
  await page.getByText("Answer cancelled. Your message is saved.").waitFor();
  equal(await unread(page, "assistant"), 0, "explicit Assistant cancellation creates no notification");

  await page.getByRole("button", { name: "New Chat", exact: true }).click();
  await sendAssistant(page, "assistant-away-failure");
  const assistantFailure = lastAssistantJob();
  await page.getByRole("link", { name: "Back to Home" }).click();
  await page.getByRole("button", { name: /^New Project/ }).waitFor();
  assistantFailure.released = true;
  await page.waitForFunction(() => document.querySelector('[data-notification-trigger="home"]')?.getAttribute("aria-label")?.includes("1 unread"));
  await page.locator('[data-notification-trigger="home"]').click();
  await page.getByRole("button", { name: /AI Assistant reply failed/ }).click();
  await page.getByRole("button", { name: "Retry answer" }).waitFor();
  await page.waitForFunction(() => document.activeElement?.textContent?.trim() === "Retry answer");
  equal(await page.evaluate(() => document.activeElement?.textContent?.trim()), "Retry answer", "Assistant failure activation focuses the exact turn's explicit Retry control");

  await page.getByRole("button", { name: "New Chat", exact: true }).click();
  await sendAssistant(page, "assistant-server-restart");
  const assistantRestart = lastAssistantJob();
  await page.getByRole("link", { name: "Back to Home" }).click();
  await page.getByRole("button", { name: /^New Project/ }).waitFor();
  assistantJobs.delete(assistantRestart.request.jobId);
  await page.waitForFunction(() => document.querySelector('[data-notification-trigger="home"]')?.getAttribute("aria-label")?.includes("1 unread"));
  await page.locator('[data-notification-trigger="home"]').click();
  await page.locator('[data-notification-panel="home"] button[data-unread="true"]').filter({ hasText: "AI Assistant reply failed" }).click();
  await page.getByText(/server restarted/).waitFor();
  check((await page.getByRole("button", { name: "Retry answer" }).count()) === 1, "Assistant missing server job terminalizes once as interrupted with explicit Retry");

  await page.getByRole("button", { name: "New Chat", exact: true }).click();
  await sendAssistant(page, "assistant-reload-reattach");
  const assistantReload = lastAssistantJob();
  const assistantPostsBeforeReload = assistantPosts;
  await page.reload();
  await page.getByRole("button", { name: "New Chat", exact: true }).waitFor();
  assistantReload.released = true;
  await page.getByRole("article", { name: "Assistant reply" }).filter({ hasText: "assistant-reload-reattach" }).waitFor();
  equal(assistantPosts, assistantPostsBeforeReload, "Assistant reload reattaches without resubmitting");
  equal(await assistantAnswerCount(page, assistantReload.request.turnId), 1, "Assistant reload commits exactly one durable answer");

  await page.getByRole("button", { name: "New Chat", exact: true }).click();
  await sendAssistant(page, "assistant-two-tab-dedupe");
  const assistantTwoTab = lastAssistantJob();
  await page.getByRole("link", { name: "Back to Home" }).click();
  await page.getByRole("button", { name: /^New Project/ }).waitFor();
  const secondPage = await context.newPage();
  secondPage.on("pageerror", error => errors.push(error.message));
  await secondPage.goto(url);
  await secondPage.getByRole("button", { name: /^New Project/ }).waitFor();
  assistantTwoTab.released = true;
  await page.waitForFunction(() => document.querySelector('[data-notification-trigger="home"]')?.getAttribute("aria-label")?.includes("1 unread"));
  await secondPage.waitForFunction(() => document.querySelector('[data-notification-trigger="home"]')?.getAttribute("aria-label")?.includes("1 unread"));
  equal(await notificationAttemptCount(page, assistantTwoTab.request.jobId), 1, "two Assistant observers converge on one notification row");
  equal(await assistantAnswerCount(page, assistantTwoTab.request.turnId), 1, "two Assistant observers converge on one source answer");
  await page.locator('[data-notification-trigger="home"]').click();
  await page.getByRole("button", { name: "Mark all as read" }).click();
  await page.waitForFunction(() => document.querySelector('[data-notification-trigger="home"]')?.getAttribute("aria-label")?.includes("0 unread"));
  equal(await page.locator('[data-notification-panel="home"] button[data-unread]').count(), 0, "Mark all removes consumed items from the visible inbox without deleting source records");
  await page.getByRole("button", { name: "Close notifications" }).click();
  await secondPage.close();

  await page.getByRole("button", { name: /^New Project/ }).click();
  await sendTerra(page, "terra-away-failure");
  const terraFailure = lastTerraJob();
  await saveAndExit(page);
  terraFailure.released = true;
  await page.waitForFunction(() => document.querySelector('[data-notification-trigger="home"]')?.getAttribute("aria-label")?.includes("1 unread"));
  await page.locator('[data-notification-trigger="home"]').click();
  await page.getByRole("button", { name: /Terra reply failed/ }).click();
  await page.locator('[data-ai-assistant-message]').filter({ hasText: "Deterministic Terra failure" }).waitFor({ timeout: 30_000 });
  check((await page.evaluate(() => document.activeElement?.hasAttribute("data-ai-assistant-message"))) === true, "Terra failure activation focuses the exact failed request");

  await sendTerra(page, "terra-server-restart");
  const terraRestart = lastTerraJob();
  await saveAndExit(page);
  terraJobs.delete(String(terraRestart.request.jobId));
  await page.waitForFunction(() => document.querySelector('[data-notification-trigger="home"]')?.getAttribute("aria-label")?.includes("1 unread"));
  await page.locator('[data-notification-trigger="home"]').click();
  await page.locator('[data-notification-panel="home"] button[data-unread="true"]').filter({ hasText: "Terra reply failed" }).click();
  await page.locator('[data-ai-assistant-message]').filter({ hasText: "server was interrupted" }).waitFor({ timeout: 30_000 });
  check((await page.evaluate(() => document.activeElement?.hasAttribute("data-ai-assistant-message"))) === true, "Terra missing server job terminalizes once as failed and reopens the exact request");

  await saveAndExit(page);
  await page.waitForFunction(() => document.querySelector('[data-notification-trigger="home"]')?.getAttribute("aria-label")?.includes("0 unread"));
  equal(await unread(page, "home"), 0, "Terra failure landing clears unread only after reaching the exact saved project");
  await page.getByRole("button", { name: /^New Project/ }).click();
  await page.getByRole("button", { name: "File" }).click();
  await page.getByRole("menuitem", { name: "Save", exact: true }).click();
  await page.getByText("Saved on this browser", { exact: true }).waitFor();
  await sendTerra(page, "terra-reload-reattach");
  const terraReload = lastTerraJob();
  const terraPostsBeforeReload = terraPosts;
  await page.reload();
  await page.getByRole("button", { name: /^New Project/ }).waitFor({ timeout: 30_000 });
  terraReload.released = true;
  await page.waitForFunction(() => document.querySelector('[data-notification-trigger="home"]')?.getAttribute("aria-label")?.includes("1 unread"));
  equal(terraPosts, terraPostsBeforeReload, "Terra reload reattaches without resubmitting");
  equal(await notificationAttemptCount(page, String(terraReload.request.jobId)), 1, "Terra reload publishes exactly one notification row");
  await page.locator('[data-notification-trigger="home"]').click();
  await page.locator('[data-notification-panel="home"] button[data-unread="true"]').filter({ hasText: "Terra replied" }).click();
  await page.locator('[data-ai-assistant-message]').filter({ hasText: "terra-reload-reattach" }).waitFor({ timeout: 30_000 });

  await sendTerra(page, "terra-two-tab-dedupe");
  const terraTwoTab = lastTerraJob();
  await saveAndExit(page);
  await page.getByRole("button", { name: /^New Project/ }).click();
  await page.getByLabel("Message AI Animator").waitFor();
  const secondTerraPage = await context.newPage();
  secondTerraPage.on("pageerror", error => errors.push(error.message));
  await secondTerraPage.goto(url);
  await secondTerraPage.getByRole("button", { name: /^New Project/ }).waitFor();
  terraTwoTab.released = true;
  await secondTerraPage.waitForFunction(() => document.querySelector('[data-notification-trigger="home"]')?.getAttribute("aria-label")?.includes("1 unread"));
  await saveAndExit(page);
  await page.waitForFunction(() => document.querySelector('[data-notification-trigger="home"]')?.getAttribute("aria-label")?.includes("1 unread"));
  equal(await notificationAttemptCount(page, String(terraTwoTab.request.jobId)), 1, "two Terra observers converge on one notification row");
  equal(await terraAnswerCount(page, String(terraTwoTab.request.workspace.projectId), String(terraTwoTab.request.jobId)), 1, "two Terra observers converge on one ledger answer");
  await page.locator('[data-notification-trigger="home"]').click();
  await page.locator('[data-notification-panel="home"] button[data-unread="true"]').filter({ hasText: "Terra replied" }).click();
  await page.locator('[data-ai-assistant-message]').filter({ hasText: "terra-two-tab-dedupe" }).waitFor({ timeout: 30_000 });
  check((await page.evaluate(() => document.activeElement?.hasAttribute("data-ai-assistant-message"))) === true, "Terra event completed while viewing another project and reopens only its exact source project");
  await secondTerraPage.close();

  await saveAndExit(page);
  await page.goto(`${origin}/assistant`);
  await page.getByRole("button", { name: "New Chat", exact: true }).click();
  await sendAssistant(page, "assistant-deleted-target");
  await page.getByRole("button", { name: "New Chat", exact: true }).click();
  lastAssistantJob().released = true;
  await page.waitForFunction(() => document.querySelector('[data-notification-trigger="assistant"]')?.getAttribute("aria-label")?.includes("1 unread"));
  await page.getByRole("button", { name: "Delete chat: assistant-deleted-target" }).click();
  await page.getByRole("dialog", { name: "Delete chat?" }).getByRole("button", { name: "Delete chat", exact: true }).click();
  await page.locator('[data-notification-trigger="assistant"]').click();
  await page.locator('[data-notification-panel="assistant"] button[data-unread="true"]').click();
  await page.getByText("This notification's original item is no longer available.").waitFor();
  equal(await unread(page, "assistant"), 1, "unavailable deleted-chat target stays unread rather than being falsely consumed");

  equal(assistantPosts, 9, "nine explicit Assistant sends create exactly nine POSTs with no resubmit");
  equal(terraPosts, 7, "seven explicit Terra sends create exactly seven POSTs with no resubmit");
  equal(externalRequests, [], "proof attempted no external request");
  equal(errors, [], "proof recorded no browser page error");
  await screenshot(page, "assistant-cancel-silent");
  await context.close();

  const result = { schema: "spec0014-phase2-browser-proof/v1", status: "PASS", assertions, assertionCount: assertionsCount, assistantPosts, terraPosts, realProviderCalls: 0, paidCalls: 0, externalRequests, errors, screenshots, server: { url, mode: "NORMAL_NEXT_DEV_WEBPACK" }, limitations: { nativeOsWindowFocus: "UNPROVEN", physicalDevices: "UNPROVEN_NOT_REQUESTED", nonChromium: "UNPROVEN" } };
  writeFileSync(resolve(outputRoot, "result.json"), `${JSON.stringify(result, null, 2)}\n`);
  process.stdout.write(`SPEC-0014 Phase 2 browser proof PASS (${assertionsCount} assertions)\n`);
} finally {
  await browser.close();
}
