import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const originalPath = 'scripts/spec0012-assistant/phase2BrowserProof.ts';
const original = readFileSync(originalPath, 'utf8');
const output = resolve('output/spec-0012/phase-6/inherited-stress'); mkdirSync(output, { recursive: true });
const adapted = original
  .replace('http://127.0.0.1:57970', 'http://127.0.0.1:58160')
  .replace('output/spec-0012/phase-2-correction/browser', 'output/spec-0012/phase-6/inherited-stress/browser')
  // Phase 4 intentionally allows a new healthy chat beside an unreadable row;
  // the raw corrupted bytes and capacity accounting remain protected below.
  .replace('equal(corruptResult, { issues: 1, blocked: true }, "corrupt digest visible and unsafe writes blocked")', 'equal(corruptResult, { issues: 1, blocked: false }, "Phase 4 preserves a corrupt row while a healthy new chat remains usable")')
  .replace('equal(await rawRead(storePage), corruptBefore, "corrupt raw bytes preserved")', 'equal((await rawRead(storePage)).find(row => (row as { id?: unknown }).id === corrupt[0].id), corruptBefore[0], "corrupt raw bytes preserved beside a healthy new chat")')
  .replaceAll('"../../src/', `"${resolve('src')}/`)
  .replaceAll('"./phase2Fixtures.ts"', `"${resolve('scripts/spec0012-assistant/phase2Fixtures.ts')}"`);
assert.notEqual(adapted, original);
assert.ok(adapted.includes('Phase 4 preserves a corrupt row while a healthy new chat remains usable'));
assert.ok(adapted.includes('corrupt raw bytes preserved beside a healthy new chat'));
const adapterPath = `${output}/adapted.ts`; writeFileSync(adapterPath, adapted);
const run = spawnSync(process.execPath, ['--experimental-strip-types', adapterPath], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, env: { PATH: process.env.PATH ?? '', NODE_ENV: 'test', OPENAI_API_KEY: '' } });
writeFileSync(`${output}/run.log`, `${run.stdout}\n${run.stderr}`);
assert.equal(run.status, 0, `${run.stdout.slice(-1500)} ${run.stderr.slice(-2000)}`);
writeFileSync(`${output}/binding.json`, JSON.stringify({ originalPath, originalSha256: createHash('sha256').update(original).digest('hex'), adapterSha256: createHash('sha256').update(adapted).digest('hex'), replacements: ['port', 'phase-owned output', 'Phase 4 accepted corrupt-row behavior', 'absolute imports'], exitCode: run.status, realProviderCalls: 0 }, null, 2));
console.log(run.stdout.slice(-500));
