import { after, NextResponse } from "next/server";
import { AssistantError, isId } from "@/src/lib/assistant/assistantContracts";
import { DiamondAssistantJobService } from "@/src/lib/assistant/assistantJobService";
import { generateAssistantReply } from "@/src/lib/assistant/assistantProvider";
import { recordUsageEvent } from "@/src/lib/usage-journal/usageJournalRuntime";
import { requireAccountRequest } from "@/src/lib/account/access";
import { flushAccountUsageWrites, withAccountUsageOwner } from "@/src/lib/account-usage/accountUsageStore";
import { sharedJobStoreFromEnv } from "@/src/lib/ai-jobs/postgresSharedJobStore";

export const runtime = "nodejs";
// Online the answer keeps running after the 202 reply (Next's after()); the answer deadline is 55 s.
export const maxDuration = 120;
const owner = globalThis as typeof globalThis & { diamondGuidanceAssistantV1?: DiamondAssistantJobService };
const jobs = owner.diamondGuidanceAssistantV1 ??= new DiamondAssistantJobService(generateAssistantReply, undefined, undefined, recordUsageEvent);
const respond = (value: unknown, status = 200) => NextResponse.json(value, { status, headers: { "Cache-Control": "no-store" } });
// Online only: a database problem is reported in plain words, never with the database's own error text.
const storageProblem = () => respond({ error: "The Assistant could not reach its job storage. Your message is saved. Try again." }, 503);
const assistantErrorStatus = (error: AssistantError) => error.code === "conflict" ? 409 : error.code === "capacity" ? 429 : 400;
// Not a public endpoint: requireAccountRequest runs the shared same-site check (local http or the
// configured https app address) and needs a logged-in account before any paid AI work starts.
async function boundedJson(request: Request, max = 256000): Promise<unknown> {
  if (Number(request.headers.get("content-length") ?? 0) > max) throw new AssistantError("invalid", "The Assistant request is too large.");
  const reader = request.body?.getReader(); if (!reader) throw new AssistantError("invalid", "A request body is required.");
  const decoder = new TextDecoder("utf-8", { fatal: true }); let text = ""; let size = 0;
  try { while (true) { const { done, value } = await reader.read(); if (done) break; size += value.byteLength; if (size > max) { await reader.cancel(); throw new AssistantError("invalid", "The Assistant request is too large."); } text += decoder.decode(value, { stream: true }); } text += decoder.decode(); return JSON.parse(text); }
  finally { reader.releaseLock(); }
}
export async function POST(request: Request) {
  const access = await requireAccountRequest(request);
  if ("response" in access) return access.response;
  const store = sharedJobStoreFromEnv();
  if (store) {
    let body: unknown;
    try { body = await boundedJson(request); }
    catch (error) { return respond({ error: error instanceof AssistantError ? error.message : "The Assistant request could not be read." }, error instanceof AssistantError ? assistantErrorStatus(error) : 400); }
    const ownerId = access.session.user.id;
    try {
      // Online: the answer lives in the shared table, and after() keeps the AI call alive past this reply.
      const { snapshot, work } = await withAccountUsageOwner(ownerId, () => jobs.submitShared(store, body, ownerId));
      after(async () => { await work; await flushAccountUsageWrites(); }); // its usage record is saved before the server copy stops
      return respond(snapshot, 202);
    } catch (error) { return error instanceof AssistantError ? respond({ error: error.message }, assistantErrorStatus(error)) : storageProblem(); }
  }
  try { const body = await boundedJson(request); return respond(withAccountUsageOwner(access.session.user.id,
    () => jobs.submit(body, access.session.user.id)), 202); }
  catch (error) { return respond({ error: error instanceof AssistantError ? error.message : "The Assistant request could not be read." }, error instanceof AssistantError && error.code === "conflict" ? 409 : error instanceof AssistantError && error.code === "capacity" ? 429 : 400); }
}
export async function GET(request: Request) {
  const access = await requireAccountRequest(request);
  if ("response" in access) return access.response;
  const url = new URL(request.url); const jobId = url.searchParams.get("jobId"); const sessionId = url.searchParams.get("sessionId");
  if (!isId(jobId) || !isId(sessionId)) return respond({ error: "Exact chat and job identities are required." }, 400);
  const store = sharedJobStoreFromEnv();
  let snapshot;
  if (store) { try { snapshot = await jobs.getShared(store, jobId, sessionId, access.session.user.id); } catch { return storageProblem(); } }
  else snapshot = jobs.get(jobId, sessionId, access.session.user.id);
  return snapshot ? respond(snapshot) : respond({ error: "This answer was interrupted or the review server restarted. Nothing was resent." }, 404);
}
export async function DELETE(request: Request) {
  const access = await requireAccountRequest(request);
  if ("response" in access) return access.response;
  const store = sharedJobStoreFromEnv();
  if (store) {
    let body: unknown;
    try { body = await boundedJson(request); } catch { return respond({ error: "Cancellation request could not be read." }, 400); }
    const ownerId = access.session.user.id;
    try { return respond(await withAccountUsageOwner(ownerId, () => jobs.cancelRequestShared(store, body, ownerId))); }
    catch (error) { return error instanceof AssistantError ? respond({ error: "Cancellation request could not be read." }, 400) : storageProblem(); }
  }
  try {
    const body = await boundedJson(request);
    return respond(withAccountUsageOwner(access.session.user.id,
      () => jobs.cancelRequest(body, access.session.user.id)));
  } catch { return respond({ error: "Cancellation request could not be read." }, 400); }
}
