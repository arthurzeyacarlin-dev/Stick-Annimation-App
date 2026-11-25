import { NextResponse } from "next/server";
import { AssistantError, isId } from "@/src/lib/assistant/assistantContracts";
import { DiamondAssistantJobService } from "@/src/lib/assistant/assistantJobService";
import { generateAssistantReply } from "@/src/lib/assistant/assistantProvider";
import { recordUsageEvent } from "@/src/lib/usage-journal/usageJournalRuntime";
import { requireAccountRequest, isTrustedAccountRequest } from "@/src/lib/account/access";
import { withAccountUsageOwner } from "@/src/lib/account-usage/accountUsageStore";
import { accountAiCreditGate } from "@/src/lib/account/aiCredits";

export const runtime = "nodejs";
const owner = globalThis as typeof globalThis & { diamondGuidanceAssistantV2?: DiamondAssistantJobService };
const jobs = owner.diamondGuidanceAssistantV2 ??= new DiamondAssistantJobService(generateAssistantReply, undefined, undefined, recordUsageEvent, accountAiCreditGate);
const respond = (value: unknown, status = 200) => NextResponse.json(value, { status, headers: { "Cache-Control": "no-store" } });
// (Nov 25, going online) "this app only": the same check as accounts use - this Mac's own address here, the one public
// https address online (accountConfig.ts). The account check before it still decides who may use it.
const localRequest = (request: Request) => isTrustedAccountRequest(request);
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
  if (!localRequest(request)) return respond({ error: "Assistant access is limited to this local review app." }, 403);
  try { const body = await boundedJson(request); return respond(withAccountUsageOwner(access.session.user.id,
    () => jobs.submit(body, access.session.user.id)), 202); }
  catch (error) { return respond({ error: error instanceof AssistantError ? error.message : "The Assistant request could not be read." }, error instanceof AssistantError && error.code === "conflict" ? 409 : error instanceof AssistantError && error.code === "capacity" ? 429 : error instanceof AssistantError && error.code === "credits" ? 402 : 400); }
}
export async function GET(request: Request) {
  const access = await requireAccountRequest(request);
  if ("response" in access) return access.response;
  if (!localRequest(request)) return respond({ error: "Local access required." }, 403);
  const url = new URL(request.url); const jobId = url.searchParams.get("jobId"); const sessionId = url.searchParams.get("sessionId");
  if (!isId(jobId) || !isId(sessionId)) return respond({ error: "Exact chat and job identities are required." }, 400);
  const snapshot = jobs.get(jobId, sessionId, access.session.user.id);
  return snapshot ? respond(snapshot) : respond({ error: "This answer was interrupted or the review server restarted. Nothing was resent." }, 404);
}
export async function DELETE(request: Request) {
  const access = await requireAccountRequest(request);
  if ("response" in access) return access.response;
  if (!localRequest(request)) return respond({ error: "Local access required." }, 403);
  try {
    const body = await boundedJson(request);
    return respond(withAccountUsageOwner(access.session.user.id,
      () => jobs.cancelRequest(body, access.session.user.id)));
  } catch { return respond({ error: "Cancellation request could not be read." }, 400); }
}
