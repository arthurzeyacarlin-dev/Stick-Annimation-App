import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const base = '6de47a9dc1d780b63ed355fa5148f87cc5f0b1f2';
const root = 'output/spec-0012/phase-6/regressions'; mkdirSync(root, { recursive: true });
const paths = [
  'scripts/spec0012-assistant/phase4Oracle.ts', 'scripts/spec0012-assistant/phase5/oracle.ts',
  'scripts/spec0008-ai-animator/validatePhase1Contract.ts',
  'scripts/spec0011-project-library/phase1Oracle.ts', 'scripts/spec0011-project-library/phase2Oracle.ts', 'scripts/spec0011-project-library/phase2AudioOracle.ts', 'scripts/spec0011-project-library/phase3Oracle.ts',
  'scripts/spec0009-export/phase1Oracle.ts', 'scripts/spec0009-export/phase2Oracle.ts',
  'scripts/spec0010-project-safety/phase1Contract.ts', 'scripts/spec0010-project-safety/phase2Contract.ts', 'scripts/spec0010-project-safety/phase3Contract.ts', 'scripts/spec0010-project-safety/phase3Oracle.ts',
  'scripts/spec0007-manual/phase-5/staticOracle.ts',
];
const results: { path: string; sourceSha256: string; exitCode: number; log: string }[] = [];
for (const [index, path] of paths.entries()) {
  const result = spawnSync(process.execPath, ['--experimental-strip-types', path], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, env: { PATH: process.env.PATH ?? '', NODE_ENV: 'test', OPENAI_API_KEY: '' } });
  const log = `${root}/${index.toString().padStart(2, '0')}.log`;
  writeFileSync(log, `${result.stdout}\n${result.stderr}`);
  results.push({ path, sourceSha256: createHash('sha256').update(readFileSync(path)).digest('hex'), exitCode: result.status ?? -1, log });
  assert.equal(result.status, 0, `${path}: ${(result.stderr ?? '').slice(-1500)}`);
  console.log(`PASS ${path}`);
}
const protectedPaths = [
  'AGENTS.md', 'docs', 'project/project_structure.txt', 'package.json', 'package-lock.json',
  'app/page.tsx', 'app/layout.tsx', 'app/globals.css', 'app/api/ai-animator',
  'src/lib/animation', 'src/lib/ai', 'src/lib/openai', 'src/lib/export', 'src/lib/project-library', 'src/lib/project-player',
  'src/components/workspace', 'src/components/export', 'src/components/recovery', 'src/components/project-library', 'src/components/project-player', 'src/components/open-project', 'src/components/tutorials', 'src/components/chrome',
];
const changed = execFileSync('git', ['diff', '--name-only', base, '--', ...protectedPaths], { encoding: 'utf8' }).trim();
assert.equal(changed, '', 'protected product families remain byte-identical to canonical base');
writeFileSync(`${root}/result.json`, JSON.stringify({ status: 'PASS', base, results, protectedPaths, protectedChanged: [], realProviderCalls: 0, paidCalls: 0 }, null, 2));
console.log(JSON.stringify({ status: 'PASS', inheritedOracles: results.length, protectedChanged: 0 }));
