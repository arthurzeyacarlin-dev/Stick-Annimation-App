import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { ASSISTANT_LIMITS, ASSISTANT_SEARCH_LIMITS, AssistantError, CATALOG_VERSION, sealSession, validateSession } from '../../../src/lib/assistant/assistantContracts.ts';
import { buildAssistantResponseRequest, createAssistantProvider, providerInput } from '../../../src/lib/assistant/assistantProvider.ts';
import { DiamondAssistantJobService } from '../../../src/lib/assistant/assistantJobService.ts';
import { fixtureRequest, fixtureResult, fixtureSession } from '../phase2Fixtures.ts';
import { searchRequest } from '../phase4Fixtures.ts';

const output = 'output/spec-0012/phase-6/oracle'; mkdirSync(output, { recursive: true });
const checks: string[] = [];
const check = (value: unknown, label: string) => { assert.ok(value, label); checks.push(label); };
const equal = (actual: unknown, expected: unknown, label: string) => { assert.deepEqual(actual, expected, label); checks.push(label); };
equal(ASSISTANT_LIMITS.sessions, 50, 'exact 50 sessions');
equal(ASSISTANT_LIMITS.messages, 200, 'exact 200 messages');
equal(ASSISTANT_LIMITS.sessionBytes, 1024 * 1024, 'one MiB session bound');
equal(ASSISTANT_LIMITS.databaseBytes, 32 * 1024 * 1024, '32 MiB database bound');
equal(ASSISTANT_LIMITS.contextMessages, 32, '32 message context bound');
equal(ASSISTANT_LIMITS.contextChars, 48000, '48k context character bound');
equal(ASSISTANT_LIMITS.inputTokens, 24000, '24k estimated input token bound');
equal(ASSISTANT_LIMITS.outputTokens, 4000, '4k output token bound');
equal(ASSISTANT_SEARCH_LIMITS.toolCalls, 2, 'two hosted calls maximum');
equal(ASSISTANT_SEARCH_LIMITS.processedSources, 8, 'eight processed sources maximum');
equal(ASSISTANT_SEARCH_LIMITS.displayedSources, 6, 'six displayed sources maximum');
equal(ASSISTANT_SEARCH_LIMITS.queryChars, 512, '512 search query characters maximum');
const local = buildAssistantResponseRequest(fixtureRequest());
equal(local.body.model, 'gpt-5.6-terra', 'fixed Terra model');
equal(local.body.tools, [], 'internal guidance has no tools');
equal(local.body.store, false, 'provider store disabled');
check(local.estimatedTokens <= ASSISTANT_LIMITS.inputTokens, 'local input under ceiling');
const search = buildAssistantResponseRequest(searchRequest());
equal(search.body.tools?.[0]?.type, 'web_search', 'current public fact offers hosted search');
equal(search.body.max_tool_calls, 2, 'hosted tool call ceiling sent to provider');
equal(search.body.store, false, 'search provider store disabled');
check(providerInput(searchRequest()).decision.mode === 'required', 'external question is search eligible');
process.env.OPENAI_API_KEY = 'deterministic-test-key';
try {
  const broken = createAssistantProvider(() => ({ create: async () => { throw new TypeError('simulated network loss'); } }));
  for (const [name, request] of [['search', searchRequest()], ['local', fixtureRequest()]] as const) {
    await assert.rejects(() => broken(request, { signal: new AbortController().signal }), error => error instanceof AssistantError && error.code === 'network' && error.message.includes(name === 'search' ? 'Could not reach web search' : 'Terra could not connect'));
    checks.push(`${name} network loss maps to safe terminal message`);
  }
} finally { delete process.env.OPENAI_API_KEY; }
let attempts = 0;
const jobs = new DiamondAssistantJobService(async request => { attempts++; return fixtureResult(request); }, 1000, 1);
const identity = fixtureRequest(); jobs.submit(identity); jobs.submit(identity);
await new Promise(resolve => setTimeout(resolve, 20));
equal(attempts, 1, 'same job identity never duplicates provider call');
equal(jobs.get(identity.jobId, identity.sessionId)?.status, 'done', 'single job completes');
const session = await fixtureSession(6);
const mutated = structuredClone(session); mutated.turns[0].priorAttempts = [{ jobId: 'prior_attempt_0001', status: 'failed', endedAt: mutated.turns[0].at, error: 'Connection lost.' }];
await validateSession(await sealSession(mutated)); checks.push('bounded prior attempt receipt validates');
const duplicate = structuredClone(mutated); duplicate.turns[0].priorAttempts![0].jobId = duplicate.turns[0].jobId;
await assert.rejects(async () => validateSession(await sealSession(duplicate))); checks.push('duplicate retry identity rejected');
const excess = structuredClone(mutated); excess.turns[0].priorAttempts = Array.from({ length: 11 }, (_, i) => ({ jobId: `prior_attempt_${i.toString().padStart(4, '0')}`, status: 'failed' as const, endedAt: excess.turns[0].at, error: 'Connection lost.' }));
await assert.rejects(async () => validateSession(await sealSession(excess))); checks.push('excessive retry receipts rejected');
equal(CATALOG_VERSION, 'diamond-animator-knowledge/v1:2026-09-22', 'current checked-in catalog identity');
writeFileSync(`${output}/result.json`, JSON.stringify({ status: 'PASS', checks, realProviderCalls: 0, paidCalls: 0, credentialsRead: false, source: 'deterministic provider and contract oracle' }, null, 2));
console.log(JSON.stringify({ status: 'PASS', checks: checks.length, realProviderCalls: 0 }));
