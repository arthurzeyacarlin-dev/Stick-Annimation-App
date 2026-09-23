import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { ASSISTANT_LIMITS } from '../../../src/lib/assistant/assistantContracts.ts';
import { DICTATION_LIMITS } from '../../../src/lib/assistant/assistantDictationContract.ts';

const output = 'output/spec-0012/phase-6/security'; mkdirSync(output, { recursive: true });
const checks: string[] = [];
const check = (condition: unknown, label: string) => { assert.ok(condition, label); checks.push(label); };
const sourcePaths = [
  'src/lib/assistant/assistantContracts.ts', 'src/lib/assistant/assistantDictationCapture.ts', 'src/lib/assistant/assistantDictationContract.ts', 'src/lib/assistant/assistantJobService.ts', 'src/lib/assistant/assistantKnowledge.ts', 'src/lib/assistant/assistantProvider.ts', 'src/lib/assistant/assistantSearchPolicy.ts', 'src/lib/assistant/assistantStorage.ts', 'src/lib/assistant/assistantTranscriptionService.ts',
  'src/components/assistant/AssistantComposer.tsx', 'src/components/assistant/AssistantConversation.tsx', 'src/components/assistant/AssistantSessionSidebar.tsx', 'src/components/assistant/AssistantText.tsx', 'src/components/assistant/DiamondAssistantScreen.tsx', 'src/components/assistant/useAssistantSessions.ts',
  'app/api/diamond-assistant/route.ts', 'app/api/diamond-assistant-transcription/route.ts',
];
const files = sourcePaths.map(path => ({ path, source: readFileSync(path, 'utf8') }));
check(files.every(file => !/console\.(?:log|info|warn|error|debug)/.test(file.source)), 'Assistant runtime contains no prompt, answer, audio or secret console logging');
const client = files.filter(file => file.path.startsWith('src/components/assistant/') || /assistant(?:Contracts|DictationCapture|DictationContract|Storage)\.ts$/.test(file.path));
check(client.every(file => !file.source.includes('process.env.OPENAI_API_KEY')), 'browser-owned modules cannot read provider credentials');
check(files.filter(file => file.source.includes('process.env.OPENAI_API_KEY')).every(file => /assistant(?:Provider|TranscriptionService)\.ts$/.test(file.path)), 'credential access is confined to server provider adapters');
check(files.every(file => !/from\s+["'][^"']*(?:ai-animator|projectRepository|projectStorage|recovery|export|DrawingWorkspace|manualCapability)/i.test(file.source)), 'Assistant imports no animation or project mutation owner');
check(ASSISTANT_LIMITS.activeJobs === 2 && ASSISTANT_LIMITS.deadlineMs === 55000, 'local review concurrency and deadline remain bounded');
check(DICTATION_LIMITS.active === 2 && DICTATION_LIMITS.identities === 500, 'transcription active and identity resources remain bounded');
const origin = 'http://127.0.0.1:58160';
const calls: { route: string; status: number }[] = [];
for (const [route, headers, body, expected] of [
  ['/api/diamond-assistant', ['Host: remote.example', 'Content-Type: application/json'], '{}', 403],
  ['/api/diamond-assistant', ['Origin: https://remote.example', 'Content-Type: application/json'], '{}', 403],
  ['/api/diamond-assistant', ['Content-Type: application/json'], '{}', 400],
  ['/api/diamond-assistant-transcription', ['Host: remote.example', 'Content-Type: audio/wav'], 'invalid', 403],
] as const) {
  const status = Number(execFileSync('curl', ['-s', '-o', '/dev/null', '-w', '%{http_code}', ...headers.flatMap(value => ['-H', value]), '--data-binary', body, `${origin}${route}`], { encoding: 'utf8' }));
  assert.equal(status, expected, `${route} expected ${expected}`);
  calls.push({ route, status });
}
checks.push('local route rejects foreign host/origin and malformed request before provider use');
writeFileSync(`${output}/result.json`, JSON.stringify({ status: 'PASS', checks, calls, reviewedSourcePaths: sourcePaths, realProviderCalls: 0, paidCalls: 0, secretValuesInspected: false }, null, 2));
console.log(JSON.stringify({ status: 'PASS', checks: checks.length, routeCases: calls.length }));
