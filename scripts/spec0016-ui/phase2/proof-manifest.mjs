import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();
const base = '511155a4230f4f005c1064a7cad57d1051a8fb73';
const root = 'output/spec-0016/phase-2';
const manifestPath = `${root}/proof-manifest.json`;
const sources = ['src/components/account/ExistingHome.tsx', 'src/components/project-library/ProjectLibrary.tsx', 'src/components/project-library/projectLibrary.module.css', 'src/components/project-player/ProjectMovieViewer.tsx', 'src/components/export/AnimationExportFlow.tsx', 'src/components/home/HomeWorkspace.module.css', 'src/components/home/useInstantHover.ts', ...['boundary-oracle', 'action-oracle', 'instant-hover-oracle', 'record-technical', 'proof-manifest'].map(name => `scripts/spec0016-ui/phase2/${name}.mjs`)];
const hash = path => createHash('sha256').update(readFileSync(path)).digest('hex');
assert.equal(git('rev-parse', 'HEAD'), base);
assert.equal(git('diff', '--cached', '--name-only'), '');
const dirty = execFileSync('git', ['status', '--porcelain', '--untracked-files=all'], { encoding: 'utf8' }).trimEnd().split('\n').filter(Boolean).map(line => line.slice(3));
for (const path of dirty) assert.ok(sources.includes(path), `Outside exact allowlist: ${path}`);
assert.deepEqual([...dirty].sort(), [...sources].sort(), 'Exact dirty-path set must match reviewed sources');
if (process.argv.includes('--validate')) {
  const manifest = JSON.parse(readFileSync(manifestPath));
  assert.equal(manifest.base, base);
  assert.equal(manifest.branch, git('branch', '--show-current'));
  assert.equal(manifest.publication, false);
  assert.deepEqual(manifest.dirtyPathAllowlist, sources);
  for (const path of sources) assert.ok(manifest.files[path], `Missing source hash: ${path}`);
  for (const [path, digest] of Object.entries(manifest.files)) assert.equal(hash(path), digest, path);
  console.log(`PASS: independently validated manifest SHA256 ${hash(manifestPath)}`);
} else {
  const evidence = readdirSync(root).filter(name => name !== 'proof-manifest.json').map(name => `${root}/${name}`);
  writeFileSync(manifestPath, JSON.stringify({ schema: 'spec0016-phase2-proof/v1', role: 'Spec Executor, root only', base, branch: git('branch', '--show-current'), reviewOrigin: 'http://127.0.0.1:58584', publication: false, dirtyPathAllowlist: sources, files: Object.fromEntries([...sources, ...evidence].map(path => [path, hash(path)])) }, null, 2) + '\n');
  console.log(`Manifest SHA256 ${hash(manifestPath)}`);
}
