import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { ASSISTANT_MODEL, CATALOG_VERSION, type JobSnapshot } from "../../src/lib/assistant/assistantContracts.ts";

const origin = "http://127.0.0.1:58040"; const startedAt = Date.now(); const sessionId = randomUUID(); const jobId = randomUUID(); const turnId = randomUUID();
const body = { schema: "diamond-assistant-request/v1", jobId, sessionId, turnId, message: "What is YouTube Shorts’ current maximum video length?", reasoningLevel: "low", recentConversation: [], catalogVersion: CATALOG_VERSION, clientSessionRevision: 1 } as const;
const headers = { "Content-Type": "application/json", Origin: origin }; let postCount = 0; let snapshot: JobSnapshot | undefined; const observations: Array<{ elapsedMs: number; status: string; events: Array<{ sequence: number; status: string; topic?: string }> }> = [];
postCount++; const accepted = await fetch(`${origin}/api/diamond-assistant`, { method: "POST", headers, body: JSON.stringify(body) }); assert.equal(accepted.status, 202); snapshot = await accepted.json() as JobSnapshot;
let signature = "";
for (let attempt = 0; attempt < 420 && ["thinking", "searching", "finalizing"].includes(snapshot.status); attempt++) {
  const nextSignature = JSON.stringify(snapshot.events); if (nextSignature !== signature) { signature = nextSignature; observations.push({ elapsedMs: Date.now() - startedAt, status: snapshot.status, events: snapshot.events.map(event => ({ sequence: event.sequence, status: event.status, ...(event.topic ? { topic: event.topic } : {}) })) }); }
  await new Promise(resolve => setTimeout(resolve, 250)); const response = await fetch(`${origin}/api/diamond-assistant?jobId=${jobId}&sessionId=${sessionId}`, { headers: { Origin: origin } }); assert.equal(response.status, 200); snapshot = await response.json() as JobSnapshot;
}
const nextSignature = JSON.stringify(snapshot.events); if (nextSignature !== signature) observations.push({ elapsedMs: Date.now() - startedAt, status: snapshot.status, events: snapshot.events.map(event => ({ sequence: event.sequence, status: event.status, ...(event.topic ? { topic: event.topic } : {}) })) });
assert.equal(postCount, 1); assert.equal(snapshot.jobId, jobId); assert.equal(snapshot.sessionId, sessionId); assert.equal(snapshot.reasoning, "low"); assert.equal(snapshot.result?.usage.model ?? ASSISTANT_MODEL, ASSISTANT_MODEL);
const result = { status: snapshot.status === "done" ? "PASS" : "DIAGNOSTIC_TERMINAL_FAILURE", requestCount: 1, retries: 0, prompt: body.message, reasoning: body.reasoningLevel, elapsedMs: Date.now() - startedAt, terminalStatus: snapshot.status, terminalError: snapshot.error, events: snapshot.events.map(event => ({ sequence: event.sequence, status: event.status, ...(event.topic ? { topic: event.topic } : {}) })), observations, answerPublished: snapshot.status === "done", toolCalls: snapshot.result?.usage.toolCalls ?? null, sourceCount: snapshot.result?.search?.sources.length ?? null };
writeFileSync("output/spec-0012/phase-4/live/diagnostic.json", JSON.stringify(result, null, 2)); console.log(JSON.stringify(result));
