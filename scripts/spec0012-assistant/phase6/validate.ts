import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = 'output/spec-0012/phase-6';
const manifestPath = `${root}/proof-manifest.json`;
const expectedBase = '6de47a9dc1d780b63ed355fa5148f87cc5f0b1f2';
const expectedWorktree = '/Users/arthurcarlin/.codex/worktrees/1d01/stick-animation-app';
const expectedPaths = [
  'src/components/assistant/AssistantComposer.tsx', 'src/components/assistant/AssistantConversation.tsx', 'src/components/assistant/useAssistantSessions.ts',
  'src/lib/assistant/assistantContracts.ts', 'src/lib/assistant/assistantJobService.ts', 'src/lib/assistant/assistantProvider.ts', 'src/lib/assistant/assistantStorage.ts',
  'scripts/spec0012-assistant/phase6/animatorBrowser.ts', 'scripts/spec0012-assistant/phase6/browser.ts', 'scripts/spec0012-assistant/phase6/build.ts',
  'scripts/spec0012-assistant/phase6/checks.ts', 'scripts/spec0012-assistant/phase6/inheritedStress.ts', 'scripts/spec0012-assistant/phase6/oracle.ts',
  'scripts/spec0012-assistant/phase6/performance.ts', 'scripts/spec0012-assistant/phase6/protectedBrowser.ts', 'scripts/spec0012-assistant/phase6/regressions.ts',
  'scripts/spec0012-assistant/phase6/restart.ts', 'scripts/spec0012-assistant/phase6/security.ts', 'scripts/spec0012-assistant/phase6/proof.ts', 'scripts/spec0012-assistant/phase6/validate.ts',
].sort();
type Binding = { path: string; bytes: number; sha256: string };
type Manifest = { schema: string; phase: string; betaClass: string; base: string; head: string; main: string; originMain: string; worktree: string; branch: string; indexEmpty: boolean; canonicalMainClean: boolean; spec: Binding; allowlist: string[]; source: Binding[]; sourceDigest: string; evidence: Binding[]; evidenceDigest: string; results: Record<string, string>; limits: Record<string, number>; requestLedger: Record<string, number>; proof: Record<string, unknown>; negativeMutation: Record<string, unknown>; lifecycle: Record<string, unknown>; cleanup: Record<string, unknown> };
const sha = (value: Buffer | string) => createHash('sha256').update(value).digest('hex');
const git = (...args: string[]) => execFileSync('git', args, { encoding: 'utf8' }).trim();
const actual = (path: string): Binding => { const bytes = readFileSync(path); return { path, bytes: bytes.length, sha256: sha(bytes) }; };
const files = (directory: string): string[] => readdirSync(directory).flatMap(name => { const path = join(directory, name); return statSync(path).isDirectory() ? files(path) : [path]; });
const same = (left: unknown, right: unknown, label: string) => assert.deepEqual(left, right, label);
function audit(m: Manifest) {
  same(m.schema, 'spec-0012-phase-6-proof/v1', 'schema'); same(m.phase, 'SPEC-0012 Phase 6', 'phase'); same(m.betaClass, 'LOCAL/PRIVATE BETA', 'beta class');
  for (const key of ['base', 'head', 'main', 'originMain'] as const) same(m[key], expectedBase, key);
  same(m.worktree, expectedWorktree, 'worktree'); same(m.branch, 'detached', 'branch'); same(m.indexEmpty, true, 'empty index'); same(m.canonicalMainClean, true, 'clean main');
  same(m.spec, actual('docs/specs/0012-diamond-animator-guidance-assistant.md'), 'spec hash');
  same(m.allowlist, expectedPaths, 'exact dirty path allowlist');
  same(m.source, expectedPaths.map(actual), 'source hashes and sizes'); same(m.sourceDigest, sha(JSON.stringify(m.source)), 'source digest');
  const evidencePaths = files(root).filter(path => !['proof-manifest.json', 'validation.json'].includes(path.split('/').at(-1)!)).sort();
  same(m.evidence, evidencePaths.map(actual), 'evidence hashes, sizes and exact set'); same(m.evidenceDigest, sha(JSON.stringify(m.evidence)), 'evidence digest');
  for (const path of ['oracle/result.json', 'browser/result.json', 'inherited-stress/browser/result.json', 'restart/browser/result.json', 'protected-browser/browser/result.json', 'animator-browser/browser/result.json', 'performance/result.json', 'regressions/result.json', 'security/result.json', 'checks/result.json', 'build/result.json']) {
    same(m.results[path], 'PASS', path); same(JSON.parse(readFileSync(`${root}/${path}`, 'utf8')).status, 'PASS', `${path} receipt`);
  }
  same(m.limits, { sessions: 50, messages: 200, sessionBytes: 1048576, databaseBytes: 33554432, contextMessages: 32, contextChars: 48000, inputTokens: 24000, outputTokens: 4000, searchCalls: 2, processedSources: 8, displayedSources: 6, queryChars: 512, searchDeadlineMs: 30000, jobDeadlineMs: 55000, transcriptionSeconds: 120, transcriptionBytes: 20971520, requestUsd: 0.15 }, 'limits');
  same(m.requestLedger, { automatedRealProviderCalls: 0, automatedPaidCalls: 0, automatedHostedSearchCalls: 0, automatedTranscriptionCalls: 0, deterministicBrowserProviderCalls: 5 }, 'request ledger');
  same(m.proof.offlineSearch, 'PASS', 'offline'); same(m.proof.oneUserOneAssistant, 'PASS', 'single turn'); same(m.proof.citationsReload, 'PASS', 'citations');
  same(m.proof.accessibilityProfiles, 5, 'accessibility profiles'); same(m.proof.performance, 'PASS', 'performance'); same(m.proof.focusedBuild, 'PASS', 'focused build');
  same(m.negativeMutation, { assistantProjectImports: 0, assistantProjectStorageWrites: 0, protectedFamilySourceChanges: 0, aiAnimatorMutation: 0, finalizerBehaviorAdded: false }, 'mutation boundary');
  same(m.lifecycle, { humanAcceptance: 'pending Arthur', controlPlaneUpdated: false, gitPublication: false, staged: false, committed: false, pushed: false, deployed: false }, 'lifecycle');
  same(m.cleanup.reviewPort, 58160, 'review port'); same(m.cleanup.loopbackOnly, true, 'loopback');
  same(resolve('.'), expectedWorktree, 'current worktree'); same(git('rev-parse', 'HEAD'), expectedBase, 'HEAD'); same(git('rev-parse', 'main'), expectedBase, 'main'); same(git('rev-parse', 'origin/main'), expectedBase, 'origin');
  same(git('branch', '--show-current'), '', 'detached HEAD'); same(git('diff', '--cached', '--name-only'), '', 'empty index');
  const dirty = [...git('diff', '--name-only').split('\n'), ...git('ls-files', '--others', '--exclude-standard').split('\n')].filter(Boolean).sort(); same(dirty, expectedPaths, 'current dirty set');
  same(execFileSync('git', ['-C', '/Users/arthurcarlin/Projects/stick-animation-app', 'status', '--porcelain'], { encoding: 'utf8' }).trim(), '', 'canonical main clean');
}
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as Manifest;
audit(manifest);
const negative: string[] = [];
for (const [name, change] of [
  ['base', (m: Manifest) => { m.base = 'wrong'; }], ['worktree', (m: Manifest) => { m.worktree = '/tmp/wrong'; }],
  ['path-set', (m: Manifest) => { m.allowlist.pop(); }], ['source', (m: Manifest) => { m.source[0].sha256 = '0'.repeat(64); }],
  ['evidence', (m: Manifest) => { m.evidence[0].sha256 = '0'.repeat(64); }], ['limit', (m: Manifest) => { m.limits.sessions = 51; }],
  ['paid-call', (m: Manifest) => { m.requestLedger.automatedPaidCalls = 1; }], ['accessibility', (m: Manifest) => { m.proof.accessibilityProfiles = 0; }],
  ['performance', (m: Manifest) => { m.proof.performance = 'FAIL'; }], ['mutation', (m: Manifest) => { m.negativeMutation.aiAnimatorMutation = 1; }],
  ['acceptance', (m: Manifest) => { m.lifecycle.humanAcceptance = 'accepted'; }], ['publication', (m: Manifest) => { m.lifecycle.gitPublication = true; }],
] as const) {
  const altered = structuredClone(manifest); change(altered); assert.throws(() => audit(altered), name); negative.push(name);
}
const receipt = { status: 'VALID', manifestSha256: sha(readFileSync(manifestPath)), sourceCount: manifest.source.length, evidenceCount: manifest.evidence.length, negativeMutationsRejected: negative, exactBase: expectedBase, exactWorktree: expectedWorktree, indexEmpty: true };
writeFileSync(`${root}/validation.json`, `${JSON.stringify(receipt, null, 2)}\n`);
console.log(JSON.stringify(receipt));
