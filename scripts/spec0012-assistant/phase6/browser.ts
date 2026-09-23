import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright-core';
import { DiamondAssistantJobService } from '../../../src/lib/assistant/assistantJobService.ts';
import { AssistantError, type AssistantRequest } from '../../../src/lib/assistant/assistantContracts.ts';
import { fixtureResult } from '../phase2Fixtures.ts';
import { searchProviderResult, youtubePrompt, youtubeSource } from '../phase4Fixtures.ts';

const origin = 'http://127.0.0.1:58160';
const output = 'output/spec-0012/phase-6/browser';
mkdirSync(output, { recursive: true });
const checks: string[] = []; const errors: string[] = []; const requests: string[] = [];
const check = (value: unknown, label: string) => { assert.ok(value, label); checks.push(label); };
const equal = (actual: unknown, expected: unknown, label: string) => { assert.deepEqual(actual, expected, label); checks.push(label); };
let calls = 0; let mode: 'search-failure' | 'search-success' | 'local-failure' | 'local-success' = 'search-success';
const jobs = new DiamondAssistantJobService(async (request, options) => {
  calls++;
  if (mode === 'search-failure') {
    options.onActivity?.({ type: 'search-start', topic: 'current YouTube Shorts requirements' });
    await new Promise(resolve => setTimeout(resolve, 120));
    throw new AssistantError('network', 'Could not reach web search. Check your internet connection. Your question is saved; no current answer was published. Reconnect, then choose Retry.');
  }
  if (mode === 'local-failure') throw new AssistantError('network', 'Terra could not connect. Your question is saved; no answer was published. Reconnect, then choose Retry.');
  if (mode === 'local-success') return fixtureResult(request, 'Open the File menu, then select Save.', 'Saving a project');
  options.onActivity?.({ type: 'search-start', topic: 'current YouTube Shorts requirements' });
  options.onActivity?.({ type: 'search-end' });
  return searchProviderResult(request);
}, 55000, 30);
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--disable-background-networking', '--disable-component-update', '--disable-sync', '--no-first-run'] });
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await context.route('**/*', async route => {
    const request = route.request(); const url = new URL(request.url());
    if (url.origin !== origin) { errors.push(`external:${url.origin}`); await route.abort(); return; }
    if (url.pathname === '/api/diamond-assistant') {
      requests.push(request.method());
      const result = request.method() === 'POST' ? jobs.submit(request.postDataJSON() as AssistantRequest)
        : request.method() === 'DELETE' ? jobs.cancelRequest(request.postDataJSON())
        : jobs.get(url.searchParams.get('jobId')!, url.searchParams.get('sessionId')!);
      await route.fulfill({ status: result ? request.method() === 'POST' ? 202 : 200 : 404, contentType: 'application/json', body: JSON.stringify(result ?? {}) }); return;
    }
    if (url.pathname.startsWith('/api/')) { errors.push(`unrelated:${url.pathname}`); await route.abort(); return; }
    await route.continue();
  });
  const page = await context.newPage(); page.on('pageerror', error => errors.push(error.message));
  await page.goto(`${origin}/assistant`);
  const input = page.getByRole('textbox', { name: 'Message the Assistant' });
  await input.waitFor();
  await context.setOffline(true);
  await input.fill(youtubePrompt); await page.getByRole('button', { name: 'Send', exact: true }).click();
  await page.getByText('Internet connection unavailable. Your question is saved; no answer was requested. Reconnect, then choose Retry.').waitFor();
  equal(calls, 0, 'offline submission makes zero provider requests');
  equal(requests.length, 0, 'offline submission makes zero route requests');
  equal(await page.getByRole('article', { name: 'Your message' }).count(), 1, 'offline prompt is saved once');
  equal(await page.getByRole('article', { name: 'Assistant reply' }).count(), 0, 'offline never publishes a fake answer');
  equal(await page.locator('[class*=activity]').count(), 0, 'offline shows no endless activity');
  await page.screenshot({ path: `${output}/offline-search.png` });
  await context.setOffline(false);
  await page.getByRole('button', { name: 'Retry answer' }).click();
  await page.getByRole('article', { name: 'Assistant reply' }).waitFor();
  equal(calls, 1, 'explicit Retry makes one provider request');
  equal(requests.filter(value => value === 'POST').length, 1, 'explicit Retry makes one POST');
  equal(await page.getByRole('article', { name: 'Your message' }).count(), 1, 'retry keeps one user turn');
  equal(await page.getByRole('article', { name: 'Assistant reply' }).count(), 1, 'retry publishes one assistant answer');
  check(await page.getByRole('link', { name: /Understand three-minute YouTube Shorts/ }).getAttribute('href') === youtubeSource, 'retried answer retains validated citation');
  await page.reload();
  await page.getByRole('article', { name: 'Assistant reply' }).waitFor();
  equal(await page.getByRole('article', { name: 'Your message' }).count(), 1, 'reload keeps one user turn');
  equal(await page.getByRole('article', { name: 'Assistant reply' }).count(), 1, 'reload keeps one assistant answer');
  check(await page.getByRole('link', { name: /Understand three-minute YouTube Shorts/ }).getAttribute('href') === youtubeSource, 'citation survives reload');
  await page.screenshot({ path: `${output}/recovered-search.png` });
  await page.getByRole('button', { name: 'New Chat', exact: true }).click();
  mode = 'search-failure'; await input.fill(youtubePrompt); await page.getByRole('button', { name: 'Send', exact: true }).click();
  await page.getByText('Could not reach web search. Check your internet connection. Your question is saved; no current answer was published. Reconnect, then choose Retry.').waitFor();
  equal(calls, 2, 'search transport failure uses one attempt');
  equal(await page.getByRole('article', { name: 'Assistant reply' }).count(), 0, 'search transport failure has no answer');
  equal(await page.locator('[class*=activity]').count(), 0, 'search transport failure ends activity');
  await page.screenshot({ path: `${output}/lost-during-search.png` });
  mode = 'search-success'; await page.getByRole('button', { name: 'Retry answer' }).click();
  await page.getByRole('article', { name: 'Assistant reply' }).waitFor();
  equal(calls, 3, 'mid-search failure needs exactly one explicit retry');
  equal(await page.getByRole('article', { name: 'Your message' }).count(), 1, 'mid-search retry keeps one question');
  equal(await page.getByRole('article', { name: 'Assistant reply' }).count(), 1, 'mid-search retry gives one answer');
  const stored = await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => { const request = indexedDB.open('diamond-assistant-session-v1'); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    const rows = await new Promise<unknown[]>((resolve, reject) => { const request = db.transaction('sessions').objectStore('sessions').getAll(); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); }); db.close(); return rows;
  }) as { messages: { role: string }[]; turns: { status: string; priorAttempts?: { status: string }[]; search?: unknown }[] }[];
  equal(stored.length, 2, 'two chats remain separate');
  equal(stored.flatMap(s => s.messages.filter(m => m.role === 'assistant')).length, 2, 'two successful answers stored exactly once');
  check(stored.every(s => s.turns[0].priorAttempts?.length === 1 && !!s.turns[0].search), 'failed attempt receipt and search proof survive');
  await page.getByRole('button', { name: 'New Chat', exact: true }).click();
  mode = 'local-failure'; await input.fill('Where is Save in Diamond Animator?'); await page.getByRole('button', { name: 'Send', exact: true }).click();
  await page.getByText('Terra could not connect. Your question is saved; no answer was published. Reconnect, then choose Retry.').waitFor();
  equal(await page.getByRole('article', { name: 'Assistant reply' }).count(), 0, 'local guidance outage publishes no answer');
  mode = 'local-success'; await page.getByRole('button', { name: 'Retry answer' }).click();
  await page.getByRole('article', { name: 'Assistant reply' }).waitFor();
  equal(await page.getByRole('article', { name: 'Your message' }).count(), 1, 'local guidance retry keeps one question');
  equal(await page.getByRole('article', { name: 'Assistant reply' }).count(), 1, 'local guidance retry publishes one answer');
  equal(await page.getByRole('link', { name: /source/i }).count(), 0, 'local guidance never invents a web source');
  const profiles = [
    { name: 'compact', width: 390, height: 844, reducedMotion: false, forcedColors: false },
    { name: 'narrow', width: 320, height: 740, reducedMotion: false, forcedColors: false },
    { name: 'zoom200', width: 720, height: 450, reducedMotion: false, forcedColors: false },
    { name: 'reduced', width: 1280, height: 900, reducedMotion: true, forcedColors: false },
    { name: 'forced', width: 1280, height: 900, reducedMotion: false, forcedColors: true },
  ];
  for (const profile of profiles) {
    await page.setViewportSize({ width: profile.width, height: profile.height });
    await page.emulateMedia({ reducedMotion: profile.reducedMotion ? 'reduce' : 'no-preference', forcedColors: profile.forcedColors ? 'active' : 'none' });
    check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${profile.name} has no page overflow`);
    await page.getByRole('button', { name: 'New Chat', exact: true }).focus();
    check(await page.getByRole('button', { name: 'New Chat', exact: true }).evaluate(element => element === document.activeElement), `${profile.name} keyboard focus reaches New Chat`);
    await page.screenshot({ path: `${output}/${profile.name}.png` });
    await page.addScriptTag({ path: 'node_modules/axe-core/axe.min.js' });
    const violations = await page.evaluate(async () => { const axe = (window as unknown as { axe: { run: (selector: string) => Promise<{ violations: { impact: string }[] }> } }).axe; return (await axe.run('[data-assistant-screen]')).violations.filter(v => v.impact === 'serious' || v.impact === 'critical'); });
    equal(violations, [], `${profile.name} has zero serious or critical accessibility findings`);
  }
  equal(errors, [], 'no page errors, external requests or unrelated API calls');
  writeFileSync(`${output}/result.json`, JSON.stringify({ status: 'PASS', checks, requests, providerCalls: calls, realProviderCalls: 0, paidCalls: 0, errors, profiles: profiles.map(p => p.name) }, null, 2));
  console.log(JSON.stringify({ status: 'PASS', checks: checks.length, providerCalls: calls, realProviderCalls: 0 }));
  await context.close();
} finally { await browser.close(); }
