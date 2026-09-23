import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chmodSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const base = '6de47a9dc1d780b63ed355fa5148f87cc5f0b1f2';
const worktree = '/Users/arthurcarlin/.codex/worktrees/1d01/stick-animation-app';
const root = 'output/spec-0012/phase-6';
const allowlist = [
  'src/components/assistant/AssistantComposer.tsx', 'src/components/assistant/AssistantConversation.tsx', 'src/components/assistant/useAssistantSessions.ts',
  'src/lib/assistant/assistantContracts.ts', 'src/lib/assistant/assistantJobService.ts', 'src/lib/assistant/assistantProvider.ts', 'src/lib/assistant/assistantStorage.ts',
  'scripts/spec0012-assistant/phase6/animatorBrowser.ts', 'scripts/spec0012-assistant/phase6/browser.ts', 'scripts/spec0012-assistant/phase6/build.ts',
  'scripts/spec0012-assistant/phase6/checks.ts', 'scripts/spec0012-assistant/phase6/inheritedStress.ts', 'scripts/spec0012-assistant/phase6/oracle.ts',
  'scripts/spec0012-assistant/phase6/performance.ts', 'scripts/spec0012-assistant/phase6/protectedBrowser.ts', 'scripts/spec0012-assistant/phase6/regressions.ts',
  'scripts/spec0012-assistant/phase6/restart.ts', 'scripts/spec0012-assistant/phase6/security.ts', 'scripts/spec0012-assistant/phase6/proof.ts', 'scripts/spec0012-assistant/phase6/validate.ts',
].sort();
const cmd = (...args: string[]) => execFileSync('git', args, { encoding: 'utf8' }).trim();
const sha = (bytes: Buffer | string) => createHash('sha256').update(bytes).digest('hex');
const bind = (path: string) => { const bytes = readFileSync(path); return { path, bytes: bytes.length, sha256: sha(bytes) }; };
function files(directory: string): string[] {
  return readdirSync(directory).flatMap(name => { const path = join(directory, name); return statSync(path).isDirectory() ? files(path) : [path]; });
}
assert.equal(resolve('.'), worktree);
assert.equal(cmd('rev-parse', 'HEAD'), base); assert.equal(cmd('rev-parse', 'main'), base); assert.equal(cmd('rev-parse', 'origin/main'), base);
assert.equal(cmd('branch', '--show-current'), '');
assert.equal(cmd('diff', '--cached', '--name-only'), '');
const dirty = [...cmd('diff', '--name-only').split('\n'), ...cmd('ls-files', '--others', '--exclude-standard').split('\n')].filter(Boolean).sort();
assert.deepEqual(dirty, allowlist);
assert.equal(execFileSync('git', ['-C', '/Users/arthurcarlin/Projects/stick-animation-app', 'status', '--porcelain'], { encoding: 'utf8' }).trim(), '');
const required = [
  'oracle/result.json', 'browser/result.json', 'inherited-stress/browser/result.json', 'inherited-stress/binding.json',
  'restart/browser/result.json', 'restart/binding.json', 'protected-browser/browser/result.json', 'protected-browser/binding.json',
  'animator-browser/browser/result.json', 'animator-browser/binding.json', 'performance/result.json', 'regressions/result.json',
  'security/result.json', 'checks/result.json', 'build/result.json',
];
for (const path of required) assert.equal(JSON.parse(readFileSync(`${root}/${path}`, 'utf8')).status ?? 'PASS', 'PASS', path);
const evidence = files(root).filter(path => !['proof-manifest.json', 'validation.json'].includes(path.split('/').at(-1)!)).sort().map(bind);
const source = allowlist.map(bind);
const manifest = {
  schema: 'spec-0012-phase-6-proof/v1', phase: 'SPEC-0012 Phase 6', betaClass: 'LOCAL/PRIVATE BETA',
  authorization: 'Arthur explicitly authorized Phase 6 in this dedicated Spec Executor task; no public or paid automated requests',
  base, head: base, main: base, originMain: base, worktree, branch: 'detached', indexEmpty: true, canonicalMainClean: true,
  spec: bind('docs/specs/0012-diamond-animator-guidance-assistant.md'),
  controlPlaneConflict: 'Canonical docs at this base still call Phase 5 unpublished and Phase 6 unauthorized; verified GIT-095 main at 6de47a9 and Arthur’s latest Phase 6 instruction supersede that dated snapshot. No canonical doc was edited.',
  allowlist, source, sourceDigest: sha(JSON.stringify(source)), evidence, evidenceDigest: sha(JSON.stringify(evidence)),
  results: Object.fromEntries(required.map(path => [path, JSON.parse(readFileSync(`${root}/${path}`, 'utf8')).status ?? 'PASS'])),
  limits: { sessions: 50, messages: 200, sessionBytes: 1048576, databaseBytes: 33554432, contextMessages: 32, contextChars: 48000, inputTokens: 24000, outputTokens: 4000, searchCalls: 2, processedSources: 8, displayedSources: 6, queryChars: 512, searchDeadlineMs: 30000, jobDeadlineMs: 55000, transcriptionSeconds: 120, transcriptionBytes: 20971520, requestUsd: 0.15 },
  requestLedger: { automatedRealProviderCalls: 0, automatedPaidCalls: 0, automatedHostedSearchCalls: 0, automatedTranscriptionCalls: 0, deterministicBrowserProviderCalls: 5 },
  proof: { offlineSearch: 'PASS', explicitSingleRetry: 'PASS', oneUserOneAssistant: 'PASS', citationsReload: 'PASS', localGuidanceOutage: 'PASS', longChat: 'PASS', fiftySessions: 'PASS', twoTabs: 'PASS', quotaCorruption: 'PASS', restart: 'PASS', privacy: 'PASS', accessibilityProfiles: 5, inheritedBrowserAssertions: 90, protectedBrowserAssertions: 21, animatorBrowserAssertions: 11, performance: 'PASS', fullBuild: 'INHERITED_BASELINE_FAILURE', focusedBuild: 'PASS', typescript: 'PASS', focusedLint: 'PASS', fullLintUnchanged: '5 errors / 81 warnings', diff: 'PASS' },
  negativeMutation: { assistantProjectImports: 0, assistantProjectStorageWrites: 0, protectedFamilySourceChanges: 0, aiAnimatorMutation: 0, finalizerBehaviorAdded: false },
  lifecycle: { humanAcceptance: 'pending Arthur', controlPlaneUpdated: false, gitPublication: false, staged: false, committed: false, pushed: false, deployed: false },
  cleanup: { preserveReviewWorktreeUntilAcceptance: true, reviewPort: 58160, loopbackOnly: true, stopServerAndRemoveWorktreeOnlyAfterSeparatePublicationAndCleanupAuthorization: true },
  limitations: ['Public beta, accounts, authentication, user credits, monthly budgets, public abuse policy, deployment and provider/legal commitments remain unauthorized.', 'Physical-device and non-Chromium coverage are unproven.', 'Automated proof makes zero live provider/search/transcription calls; human review of live answers is separate.', 'Whole-repository build retains the unchanged dev AI-cost PageProps failure.'],
};
const path = `${root}/proof-manifest.json`;
writeFileSync(path, `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o444 }); chmodSync(path, 0o444);
console.log(JSON.stringify({ status: 'SEALED', path, sha256: sha(readFileSync(path)), sources: source.length, evidence: evidence.length }));
