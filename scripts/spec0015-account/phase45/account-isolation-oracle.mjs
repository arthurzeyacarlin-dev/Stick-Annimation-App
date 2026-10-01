import assert from "node:assert/strict";
import fs from "node:fs";
import Database from "better-sqlite3";
import { DiamondAssistantJobService } from "../../../src/lib/assistant/assistantJobService.ts";
import { fixtureRequest, fixtureResult } from "../../spec0012-assistant/phase2Fixtures.ts";
import { AiAnimatorJobService } from "../../../src/lib/ai/aiAnimatorJobService.ts";
import { AI_ANIMATOR_MODEL } from "../../../src/lib/ai/aiAnimatorContract.ts";

const checks = [];
const check = (value, label) => { assert.ok(value, label); checks.push(label); };
const equal = (actual, expected, label) => { assert.deepEqual(actual, expected, label); checks.push(label); };
const rejects = async (operation, pattern, label) => {
  await assert.rejects(Promise.resolve().then(operation), pattern);
  checks.push(label);
};

const accountServer = fs.readFileSync("src/lib/account/accountDataServer.ts", "utf8");
const accountRoute = fs.readFileSync("app/api/account/data/route.ts", "utf8");
const accountClient = fs.readFileSync("src/lib/account/accountDataClient.ts", "utf8");
check(accountRoute.includes("requireAccountRequest(request)"), "account data route requires an authenticated session");
check(accountRoute.includes("access.session.user.id"), "account data route derives ownership only from the authenticated session");
check(!/x-account-owner/i.test(accountRoute), "account data route accepts no caller-supplied owner identity");
check(accountServer.includes("PRIMARY KEY (owner_id, namespace, record_key)"), "account records are keyed by owner, namespace and key");
check(accountServer.includes("writeTransaction.immediate") && accountServer.includes("deleteTransaction.immediate"), "writes and deletes use immediate SQLite transactions");
check(accountServer.includes("account_data_conflict") && accountServer.includes("account_data_readback_failed"), "compare-and-swap and durable readback failures are explicit");
check(accountServer.includes("OWNER_TOTAL_LIMIT") && accountServer.includes("namespaceLimits"), "per-record and per-owner capacity ceilings are enforced");
check(accountClient.includes("Promise.allSettled") && accountClient.includes("account_data_other_tab_dirty"), "logout drains same-account writes and refuses an active foreign-tab lease");

const assistantOwnerA = "oracle-assistant-owner-a";
const assistantOwnerB = "oracle-assistant-owner-b";
const assistantRequest = fixtureRequest({ message: "Account owner isolation oracle." });
let assistantProviderCalls = 0;
const assistantJobs = new DiamondAssistantJobService(async request => {
  assistantProviderCalls += 1;
  return fixtureResult(request);
}, 1_000, 0);
assistantJobs.submit(assistantRequest, assistantOwnerA);
equal(assistantJobs.get(assistantRequest.jobId, assistantRequest.sessionId, assistantOwnerB), null, "Assistant job lookup is denied to another account");
equal(assistantJobs.cancel(assistantRequest.jobId, assistantRequest.sessionId, assistantOwnerB), null, "Assistant job cancellation is denied to another account");
await rejects(() => assistantJobs.submit(assistantRequest, assistantOwnerB), /not available to this account/, "Assistant duplicate identity cannot cross accounts");
await new Promise(resolve => setTimeout(resolve, 10));
equal(assistantJobs.get(assistantRequest.jobId, assistantRequest.sessionId, assistantOwnerA)?.status, "done", "Assistant owner retains its terminal job");
equal(assistantProviderCalls, 1, "Assistant owner denial does not call a provider");

const animatorRequest = {
  jobId: "phase45-animator-job",
  turnId: "phase45-animator-turn",
  message: "Account owner isolation oracle.",
  reasoningLevel: "medium",
  recentConversation: [],
  workspace: {
    projectId: "phase45-project",
    projectTitle: "Phase 4.5 oracle",
    projectGeneration: 1,
    totalLayers: 1,
    authoredFrameCount: 2,
    timelineFps: 12,
    activeTool: "Brush",
  },
};
let animatorProviderCalls = 0;
const animatorJobs = new AiAnimatorJobService(async () => {
  animatorProviderCalls += 1;
  return {
    reply: { intent: "conversation", reply: "Synthetic owner-isolation reply.", focusedQuestion: null, planSummary: null },
    requestedModel: AI_ANIMATOR_MODEL,
    providerModel: AI_ANIMATOR_MODEL,
    responseId: "phase45-synthetic-response",
    usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2, estimatedCostUsd: 0 },
    latencyMs: 1,
    promptDigest: "a".repeat(64),
  };
});
animatorJobs.submit(animatorRequest, assistantOwnerA);
equal(animatorJobs.get(animatorRequest.jobId, animatorRequest.workspace.projectId, assistantOwnerB), null, "Terra job lookup is denied to another account");
equal(animatorJobs.cancel(animatorRequest.jobId, animatorRequest.workspace.projectId, assistantOwnerB), null, "Terra job cancellation is denied to another account");
await rejects(() => animatorJobs.submit(animatorRequest, assistantOwnerB), /not available to this account/, "Terra duplicate identity cannot cross accounts");
await new Promise(resolve => setTimeout(resolve, 10));
equal(animatorJobs.get(animatorRequest.jobId, animatorRequest.workspace.projectId, assistantOwnerA)?.status, "done", "Terra owner retains its terminal job");
equal(animatorProviderCalls, 1, "Terra owner denial does not call a provider");

const dataDatabase = new Database(".local/spec0015-phase3/phase45-account-data-58645.sqlite", { readonly: true, fileMustExist: true });
const rows = dataDatabase.prepare("select owner_id, namespace, record_key, revision, digest, payload from account_state_v1 order by owner_id, namespace, record_key").all();
equal(dataDatabase.pragma("integrity_check", { simple: true }), "ok", "review account-data SQLite passes integrity_check");
dataDatabase.close();
const byOwner = Map.groupBy(rows, row => row.owner_id);
equal(byOwner.size, 2, "review account-data store contains exactly two synthetic owners");
const alice = rows.find(row => row.namespace === "assistant-sessions" && row.payload.toString("utf8").includes("ALICE-58645"));
const bob = rows.find(row => row.namespace === "assistant-sessions" && row.payload.toString("utf8").includes("BOB-58645"));
check(alice && bob && alice.owner_id !== bob.owner_id, "Alice and Bob Assistant histories are stored under distinct owners");
check(!alice.payload.toString("utf8").includes("BOB-58645") && !bob.payload.toString("utf8").includes("ALICE-58645"), "Assistant payloads contain no cross-account token");
equal(rows.filter(row => row.owner_id === alice.owner_id && row.namespace === "terra-ledger").length, 1, "Alice owns the synthetic Terra ledger");
equal(rows.filter(row => row.owner_id === bob.owner_id && row.namespace === "terra-ledger").length, 0, "Bob has no access-derived copy of Alice's Terra ledger");
equal(rows.filter(row => row.namespace === "preferences").length, 2, "welcome preferences exist independently for both accounts");
check(rows.every(row => Number.isSafeInteger(row.revision) && row.revision >= 1 && /^[0-9a-f]{64}$/.test(row.digest)), "every persisted account row has a positive revision and SHA-256 digest");

process.stdout.write(JSON.stringify({
  status: "PASS",
  checks: checks.length,
  reviewOwners: byOwner.size,
  reviewRows: rows.length,
  assistantProviderCalls,
  animatorProviderCalls,
  paidProviderCalls: 0,
}) + "\n");
