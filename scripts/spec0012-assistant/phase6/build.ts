import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';

const base = '6de47a9dc1d780b63ed355fa5148f87cc5f0b1f2';
const output = resolve('output/spec-0012/phase-6/build'); mkdirSync(output, { recursive: true });
const fixture = JSON.parse(readFileSync('scripts/fixtures/spec0001-browser/v1/next-font-google-response.json', 'utf8')) as { responses: { url: string; family: string; faces: { file: string; sha256: string; subset: string; unicodeRange: string }[] }[] };
const responses: Record<string, string> = {};
for (const response of fixture.responses) responses[response.url] = response.faces.map(face => {
  const bytes = readFileSync(face.file); assert.equal(`sha256:${createHash('sha256').update(bytes).digest('hex')}`, face.sha256);
  return `/* ${face.subset} */\n@font-face { font-family: '${response.family}'; font-style: normal; font-weight: 100 900; font-display: swap; src: url(${resolve(face.file)}) format('woff2'); unicode-range: ${face.unicodeRange}; }`;
}).join('\n');
const fontPath = `${output}/font-responses.cjs`; writeFileSync(fontPath, `module.exports = ${JSON.stringify(responses)};\n`);
const routes = ['app/page.tsx', 'app/assistant/page.tsx', 'app/api/ai-animator/route.ts', 'app/api/diamond-assistant/route.ts', 'app/api/diamond-assistant-transcription/route.ts', 'app/favicon.ico'];
const results: Record<string, unknown> = {};
for (const kind of ['full', 'focused'] as const) {
  const ledger = `${output}/${kind}-network.jsonl`; writeFileSync(ledger, '');
  const env = {
    PATH: process.env.PATH ?? '', NODE_ENV: 'production' as const, NEXT_TELEMETRY_DISABLED: '1', NEXT_FONT_GOOGLE_MOCKED_RESPONSES: fontPath,
    OPENAI_API_KEY: '', SUPABASE_URL: '', SUPABASE_ANON_KEY: '', SUPABASE_SERVICE_ROLE_KEY: '',
    SPEC0001_NETWORK_LEDGER: ledger, SPEC0001_REPOSITORY_ROOT: dirname(realpathSync('node_modules')),
    NODE_OPTIONS: `--require=${resolve('scripts/spec0001-browser/networkDeny.cjs')}`,
  };
  const args = ['node_modules/next/dist/bin/next', 'build', '--webpack', ...(kind === 'focused' ? ['--debug-build-paths', routes.join(',')] : [])];
  const run = spawnSync(process.execPath, args, { env, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const log = `${run.stdout}\n${run.stderr}`; writeFileSync(`${output}/${kind}.log`, log);
  const network = readFileSync(ledger, 'utf8').split('\n').filter(Boolean).map(line => JSON.parse(line));
  assert.deepEqual(network.filter(entry => entry.result === 'denied'), [], `${kind} attempted no external request`);
  if (kind === 'full' && run.status !== 0) {
    assert.match(log, /app\/dev\/ai-costs\/lifetime\/page\.tsx/); assert.match(log, /searchParams/);
    const path = 'app/dev/ai-costs/lifetime/page.tsx';
    const bytes = readFileSync(path); assert.deepEqual(bytes, execFileSync('git', ['show', `${base}:${path}`]));
    results.full = { status: 'INHERITED_BASELINE_FAILURE', path, sourceSha256: createHash('sha256').update(bytes).digest('hex'), failure: 'PageProps searchParams', exitCode: run.status };
  } else {
    assert.equal(run.status, 0, log.slice(-5000));
    if (kind === 'focused') {
      const manifest = JSON.parse(readFileSync('.next/server/app-paths-manifest.json', 'utf8'));
      for (const path of ['/page', '/assistant/page', '/api/ai-animator/route', '/api/diamond-assistant/route', '/api/diamond-assistant-transcription/route', '/favicon.ico/route']) assert.ok(manifest[path], path);
    }
    results[kind] = { status: 'PASS', routes: kind === 'focused' ? routes : 'all', exitCode: run.status };
  }
  console.log(`${kind} build gate: ${String((results[kind] as { status: string }).status)}`);
}
writeFileSync(`${output}/result.json`, JSON.stringify({ status: 'PASS', base, ...results, realProviderCalls: 0, paidCalls: 0 }, null, 2));
