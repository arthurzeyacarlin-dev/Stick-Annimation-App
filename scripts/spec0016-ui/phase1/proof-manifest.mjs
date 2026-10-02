import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
const base = execFileSync('git', ['rev-parse', 'HEAD']).toString().trim();
const root = 'output/spec-0016/phase-1';
const manifestPath = `${root}/proof-manifest.json`;
const hash = path => createHash('sha256').update(readFileSync(path)).digest('hex');
const sources = ['src/components/account/ExistingHome.tsx', 'src/components/home/HomeWorkspace.module.css', 'src/components/chrome/AIcreditspage.tsx', 'src/components/chrome/appChrome.module.css', ...['navigation-oracle', 'protected-regressions', 'browser-proof', 'proof-manifest'].map(name => `scripts/spec0016-ui/phase1/${name}.mjs`)];
assert.equal(base, '413f71ba4cd3e6b12e05040aacfb8038b67bcd28');
const dirtyPaths = execFileSync('git', ['status', '--porcelain', '--untracked-files=all']).toString().trimEnd().split('\n').filter(Boolean).map(line => line.slice(3));
for (const path of dirtyPaths) assert.ok(sources.includes(path), `Outside exact allowlist: ${path}`);
assert.equal(execFileSync('git', ['diff', '--cached', '--name-only']).toString().trim(), '');
if (process.argv.includes('--validate')) {
  const manifest = JSON.parse(readFileSync(manifestPath));
  assert.equal(manifest.base, base);
  for (const [path, digest] of Object.entries(manifest.files)) assert.equal(hash(path), digest, path);
  console.log(`PASS: independently revalidated manifest ${hash(manifestPath)}`);
} else {
  const evidence = existsSync(root) ? readdirSync(root).filter(name => name !== 'proof-manifest.json').map(name => `${root}/${name}`) : [];
  const files = Object.fromEntries([...sources, ...evidence].map(path => [path, hash(path)]));
  writeFileSync(manifestPath, JSON.stringify({ schema: 'spec0016-phase1-proof/v1', base, publication: false, files }, null, 2) + '\n');
  console.log(`Manifest SHA256: ${hash(manifestPath)}`);
}
