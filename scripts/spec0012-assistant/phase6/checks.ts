import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';

const output = 'output/spec-0012/phase-6/checks'; mkdirSync(output, { recursive: true });
const focused = [
  'src/lib/assistant/assistantContracts.ts', 'src/lib/assistant/assistantStorage.ts', 'src/lib/assistant/assistantProvider.ts', 'src/lib/assistant/assistantJobService.ts',
  'src/components/assistant/useAssistantSessions.ts', 'src/components/assistant/AssistantConversation.tsx', 'src/components/assistant/AssistantComposer.tsx',
  'scripts/spec0012-assistant/phase6',
];
const commands = [
  { name: 'typescript', command: './node_modules/.bin/tsc', args: ['--noEmit'] },
  { name: 'focused-lint', command: './node_modules/.bin/eslint', args: focused },
  { name: 'full-lint', command: './node_modules/.bin/eslint', args: ['.', '--ignore-pattern', 'output/**'] },
  { name: 'diff', command: 'git', args: ['diff', '--check'] },
  { name: 'staged-diff', command: 'git', args: ['diff', '--cached', '--check'] },
];
const results: { name: string; exitCode: number; findingSummary?: string }[] = [];
for (const task of commands) {
  const run = spawnSync(task.command, task.args, { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
  const log = `${run.stdout}\n${run.stderr}`; writeFileSync(`${output}/${task.name}.log`, log);
  if (task.name === 'full-lint') {
    const summary = /✖ (\d+) problems? \((\d+) errors?, (\d+) warnings?\)/.exec(log);
    assert.ok(summary, 'full lint baseline must be measured');
    assert.equal(Number(summary[2]), 5); assert.equal(Number(summary[3]), 81);
    for (const path of focused.filter(path => !path.endsWith('/phase6'))) assert.ok(!log.includes(path), `${path} has no full-lint finding`);
    results.push({ name: task.name, exitCode: run.status ?? -1, findingSummary: summary[0] });
  } else { assert.equal(run.status, 0, `${task.name}: ${log.slice(-2000)}`); results.push({ name: task.name, exitCode: 0 }); }
}
writeFileSync(`${output}/result.json`, JSON.stringify({ status: 'PASS', results, realProviderCalls: 0, paidCalls: 0 }, null, 2));
console.log(JSON.stringify({ status: 'PASS', checks: results.length, fullLint: results.find(r => r.name === 'full-lint')?.findingSummary }));
