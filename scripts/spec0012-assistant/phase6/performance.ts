import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { chromium } from 'playwright-core';
import { fixtureSession } from '../phase2Fixtures.ts';

const output = 'output/spec-0012/phase-6/performance'; mkdirSync(output, { recursive: true });
const origin = 'http://127.0.0.1:58160'; const blocked: string[] = [];
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--disable-background-networking', '--disable-component-update', '--disable-sync', '--no-first-run'] });
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await context.route('**/*', async route => { const url = new URL(route.request().url()); if (url.origin !== origin || url.pathname.startsWith('/api/')) { blocked.push(route.request().url()); await route.abort(); } else await route.continue(); });
  const page = await context.newPage(); await page.goto(`${origin}/assistant`);
  const sessions = await Promise.all(Array.from({ length: 50 }, (_, index) => fixtureSession(500 + index, 60, 350)));
  await page.evaluate(values => new Promise<void>((resolve, reject) => {
    const open = indexedDB.open('diamond-assistant-session-v1', 1);
    open.onsuccess = () => { const db = open.result; const tx = db.transaction('sessions', 'readwrite'); const store = tx.objectStore('sessions'); store.clear(); for (const value of values) store.put(value); tx.oncomplete = () => { db.close(); resolve(); }; tx.onerror = () => reject(tx.error); };
    open.onerror = () => reject(open.error);
  }), sessions);
  const started = performance.now(); await page.reload();
  await page.getByRole('button', { name: 'Open chat: Saved chat 549' }).waitFor();
  await page.waitForFunction(() => document.querySelectorAll('[aria-label^="Open chat:"]').length === 50);
  const fiftySessionLoadMs = performance.now() - started;
  assert.ok(fiftySessionLoadMs < 10000, `50-session load took ${fiftySessionLoadMs.toFixed(0)} ms`);
  assert.ok(await page.getByRole('button', { name: 'New Chat', exact: true }).isDisabled(), '51st New Chat remains disabled');
  await page.getByRole('button', { name: 'Open chat: Saved chat 549' }).click();
  const pane = page.getByRole('region', { name: 'Conversation' });
  await pane.evaluate(element => { element.scrollTop = 0; });
  await page.getByRole('button', { name: 'Jump to latest' }).waitFor();
  const jumpStarted = performance.now(); await page.getByRole('button', { name: 'Jump to latest' }).click();
  await page.waitForFunction(() => { const element = document.querySelector('[aria-label="Conversation"]'); return !!element && element.scrollHeight - element.scrollTop - element.clientHeight < 5; });
  const jumpMs = performance.now() - jumpStarted;
  assert.ok(jumpMs < 1000, `long-chat jump took ${jumpMs.toFixed(0)} ms`);
  const memory = await page.evaluate(() => { const value = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory; return value ? value.usedJSHeapSize : null; });
  assert.deepEqual(blocked, [], 'no external or API request during performance proof');
  writeFileSync(`${output}/result.json`, JSON.stringify({ status: 'PASS', sessions: 50, messagesPerSession: 120, totalMessages: 6000, fiftySessionLoadMs, jumpMs, usedJsHeapBytes: memory, browser: 'desktop Chrome', blocked, realProviderCalls: 0, paidCalls: 0 }, null, 2));
  console.log(JSON.stringify({ status: 'PASS', fiftySessionLoadMs: Math.round(fiftySessionLoadMs), jumpMs: Math.round(jumpMs) }));
  await context.close();
} finally { await browser.close(); }
