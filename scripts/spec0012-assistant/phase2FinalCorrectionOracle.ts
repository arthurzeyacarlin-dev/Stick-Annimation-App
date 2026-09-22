import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { generateAssistantReply, providerInput, ASSISTANT_PRICE } from "../../src/lib/assistant/assistantProvider.ts";
import { ASSISTANT_LIMITS, ASSISTANT_MODEL, REASONING, validateUsage } from "../../src/lib/assistant/assistantContracts.ts";
import { DiamondAssistantJobService } from "../../src/lib/assistant/assistantJobService.ts";
import { fixtureRequest, fixtureResult } from "./phase2Fixtures.ts";

const cwd = process.cwd(); const root = resolve("output/spec-0012/phase-2-final-correction"); mkdirSync(root, { recursive: true });
const assertions: string[] = []; const check = (value: unknown, name: string) => { assert.ok(value, name); assertions.push(name); }; const equal = (a: unknown, b: unknown, name: string) => { assert.deepEqual(a, b, name); assertions.push(name); };
const sha = (value: Buffer) => createHash("sha256").update(value).digest("hex");
const inventory = (path: string): unknown[] => existsSync(path) ? readdirSync(path, { withFileTypes: true }).sort((a,b) => a.name.localeCompare(b.name)).map(e => e.isDirectory() ? { name: e.name, files: inventory(resolve(path,e.name)) } : { name: e.name, hash: sha(readFileSync(resolve(path,e.name))) }) : [];
process.env.OPENAI_API_KEY = "deterministic-test-not-a-credential";
let transports = 0; let mode: "success" | "error" | "bad-output" = "success"; const requests: Array<{ model: string; reasoning: { effort: string }; max_output_tokens: number; tools: unknown[]; store: boolean; stream: boolean }> = [];
// The production adapter and installed SDK run unchanged. Replace their complete HTTP transport
// before any request; this function never invokes fetch, http, https or any network primitive.
globalThis.fetch = async (input, init) => {
  transports++; assert.equal(String(input), "https://api.openai.com/v1/responses"); assert.equal(init?.method, "POST");
  const request = JSON.parse(String(init?.body)); requests.push(request);
  if (mode === "error") return new Response('{"error":{"message":"deterministic service failure"}}', { status: 503, headers: { "content-type": "application/json" } });
  const response = { id: `response_${transports.toString().padStart(6,"0")}`, status: "completed", model: ASSISTANT_MODEL, usage: { input_tokens: 24000, output_tokens: mode === "bad-output" ? 4001 : 4000, total_tokens: mode === "bad-output" ? 28001 : 28000 }, output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify({ answer: "Here is a clear explanation from the local test.", title: "Learning Diamond Animator" }) }] }] };
  return new Response(`event: response.completed\ndata: ${JSON.stringify({ type: "response.completed", response })}\n\ndata: [DONE]\n\n`, { status: 200, headers: { "content-type": "text/event-stream" } });
};
const scenarioResults = []; let simulatedUsageUsd = 0; let formerReservationsUsd = 0;
try {
  for (const scenario of ["exhausted", "malformed", "locked", "absent"] as const) {
    const sandbox = resolve(root, "provider-sandboxes", scenario); mkdirSync(sandbox, { recursive: true }); process.chdir(sandbox);
    const directory = resolve("output/diamond-assistant-private");
    if (scenario !== "absent") { mkdirSync(directory, { recursive: true }); const now = new Date().toISOString(); writeFileSync(resolve(directory,"budget.json"), scenario === "malformed" ? "invalid-json" : JSON.stringify({ schema: "diamond-assistant-budget/v1", days: { [now.slice(0,10)]: 1000 }, months: { [now.slice(0,7)]: 1000 } })); if (scenario === "locked") mkdirSync(resolve(directory,"budget.lock"), { recursive: true }); }
    const before = inventory(directory); const start = transports;
    for (let i=0;i<30;i++) { const request=fixtureRequest({ reasoningLevel: (Object.keys(REASONING) as Array<keyof typeof REASONING>)[i%4] }); const result=await generateAssistantReply(request,{signal:new AbortController().signal}); validateUsage(result.usage); assert.equal(result.usage.reasoning,request.reasoningLevel); assert.equal(result.usage.estimatedCostUsd,.096); simulatedUsageUsd += result.usage.estimatedCostUsd; formerReservationsUsd += (providerInput(request).estimatedTokens*2+4000*12)/1000000; }
    equal(transports-start,30, `${scenario}: all thirty repeated calls reach the deterministic SDK transport exactly once`); equal(inventory(directory),before,`${scenario}: legacy budget file/lock remains untouched`); if(scenario==="absent") equal(existsSync(directory),false,"provider creates no private budget directory or ledger"); scenarioResults.push({scenario,completedRequests:30,legacyBytesUnchanged:true});
  }
  process.chdir(cwd);
  check(formerReservationsUsd > 5 && simulatedUsageUsd > 5,"120 deterministic calls exceed both former daily/monthly totals without a cumulative stop");
  equal(ASSISTANT_PRICE,{date:"2026-09-22",inputPerMillion:2,outputPerMillion:12,requestUsd:.15},"pricing and per-request cap remain while cumulative caps are absent");
  check(requests.every(r=>r.model===ASSISTANT_MODEL && r.max_output_tokens===4000 && r.tools.length===0 && r.store===false && r.stream===true),"actual SDK request bodies preserve fixed model, output ceiling, no tools/search and store:false");
  equal([...new Set(requests.map(r=>r.reasoning.effort))].sort(),["high","low","medium","xhigh"],"all four reasoning levels reach the SDK unchanged");
  let before=transports; await assert.rejects(generateAssistantReply(fixtureRequest({message:"漢".repeat(12000)}),{signal:new AbortController().signal})); equal(transports,before,"oversized input fails before transport");
  const controller=new AbortController();controller.abort(); await assert.rejects(generateAssistantReply(fixtureRequest(),{signal:controller.signal})); equal(transports,before,"pre-cancelled request makes no transport call");
  mode="error"; await assert.rejects(generateAssistantReply(fixtureRequest(),{signal:new AbortController().signal})); equal(transports,before+1,"503 makes exactly one SDK attempt; maxRetries 0 prevents retry");
  mode="bad-output";before=transports;await assert.rejects(generateAssistantReply(fixtureRequest(),{signal:new AbortController().signal}));equal(transports,before+1,"over-limit provider usage is rejected without retry");
  process.env.OPENAI_API_KEY="";before=transports;await assert.rejects(generateAssistantReply(fixtureRequest(),{signal:new AbortController().signal}));equal(transports,before,"missing server credential fails before transport");
  const provider=readFileSync("src/lib/assistant/assistantProvider.ts","utf8"); check(!/budget|dayUsd|monthUsd|node:fs|node:path|reserveBudget/i.test(provider),"runtime provider has no cumulative cap, ledger, lock or old budget failure path");
  for(const dir of ["src/lib/assistant","src/components/assistant","app/api/diamond-assistant"]) for(const file of readdirSync(dir)) if(/\.(tsx?|css)$/.test(file)) check(!/The local Assistant review budget is reached|The local Assistant budget could not be verified|diamond-assistant-budget\/v1|budget\.lock|reserveBudget/.test(readFileSync(`${dir}/${file}`,"utf8")),`old budget messages/mechanism absent: ${dir}/${file}`);
  check(provider.includes('maximumCostUsd <= ASSISTANT_PRICE.requestUsd') && provider.includes('maxRetries: 0, timeout: ASSISTANT_LIMITS.deadlineMs'),"preflight per-request cost cap and SDK timeout/retry settings remain");
  equal(ASSISTANT_LIMITS.inputTokens,24000,"input token ceiling unchanged");equal(ASSISTANT_LIMITS.outputTokens,4000,"output token ceiling unchanged");equal(ASSISTANT_LIMITS.activeJobs,2,"two active jobs unchanged");equal(ASSISTANT_LIMITS.sessions,50,"fifty local chats unchanged");
  let jobsCalled=0;const jobs=new DiamondAssistantJobService(async req=>{jobsCalled++;return fixtureResult(req)},90000,0);
  // Install terminal cancellation tombstones so the fixed memory bound is exercised quickly.
  for(let i=0;i<500;i++) jobs.cancelRequest(fixtureRequest()); assert.throws(()=>jobs.submit(fixtureRequest()), /request limit/); equal(jobsCalled,0,"500-job memory cap still blocks before provider without evicting identities");
  writeFileSync(resolve(root,"final-correction-oracle.json"),JSON.stringify({status:"PASS",assertions,scenarioResults,successfulRepeatedProviderCalls:120,sdkTransportDoubleCalls:transports,formerReservationsUsd,simulatedUsageUsd,realProviderCalls:0,paidCalls:0,automatedCostUsd:0,actualReviewLedgerUntouched:true},null,2)); console.log(JSON.stringify({status:"PASS",assertions:assertions.length,successfulRepeatedProviderCalls:120,sdkTransportDoubleCalls:transports,formerReservationsUsd,simulatedUsageUsd,realProviderCalls:0}));
} finally {process.chdir(cwd);}
