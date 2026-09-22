import { NextResponse } from "next/server";
import { AssistantError, isId } from "@/src/lib/assistant/assistantContracts";
import { DiamondAssistantJobService } from "@/src/lib/assistant/assistantJobService";
import { generateAssistantReply } from "@/src/lib/assistant/assistantProvider";

export const runtime = "nodejs";
const owner = globalThis as typeof globalThis & { diamondGuidanceAssistantV1?: DiamondAssistantJobService };
const jobs = owner.diamondGuidanceAssistantV1 ??= new DiamondAssistantJobService(generateAssistantReply);
const respond = (value: unknown, status = 200) => NextResponse.json(value, { status, headers: { "Cache-Control": "no-store" } });
const localRequest = (request: Request) => {
  const host = request.headers.get("host") ?? ""; const origin = request.headers.get("origin");
  // This phase is a local review surface, not a public unauthenticated paid endpoint.
  return /^(127\.0\.0\.1|localhost|\[::1\]):\d{1,5}$/.test(host) && (!origin || origin === `http://${host}`) && !["cross-site", "same-site"].includes(request.headers.get("sec-fetch-site") ?? "");
};
async function boundedJson(request: Request, max = 256000): Promise<unknown> {
  if (Number(request.headers.get("content-length") ?? 0) > max) throw new AssistantError("invalid", "The Assistant request is too large.");
  const reader = request.body?.getReader(); if (!reader) throw new AssistantError("invalid", "A request body is required.");
  const decoder = new TextDecoder("utf-8", { fatal: true }); let text = ""; let size = 0;
  try { while (true) { const { done, value } = await reader.read(); if (done) break; size += value.byteLength; if (size > max) { await reader.cancel(); throw new AssistantError("invalid", "The Assistant request is too large."); } text += decoder.decode(value, { stream: true }); } text += decoder.decode(); return JSON.parse(text); }
  finally { reader.releaseLock(); }
}
export async function POST(request: Request) {
  if (!localRequest(request)) return respond({ error: "Assistant access is limited to this local review app." }, 403);
  try { return respond(jobs.submit(await boundedJson(request)), 202); }
  catch (error) { return respond({ error: error instanceof AssistantError ? error.message : "The Assistant request could not be read." }, error instanceof AssistantError && error.code === "conflict" ? 409 : error instanceof AssistantError && error.code === "capacity" ? 429 : 400); }
}
export async function GET(request: Request) {
  if (!localRequest(request)) return respond({ error: "Local access required." }, 403);
  const url = new URL(request.url); const jobId = url.searchParams.get("jobId"); const sessionId = url.searchParams.get("sessionId");
  if (!isId(jobId) || !isId(sessionId)) return respond({ error: "Exact chat and job identities are required." }, 400);
  const snapshot = jobs.get(jobId, sessionId);
  return snapshot ? respond(snapshot) : respond({ error: "This answer was interrupted or the review server restarted. Nothing was resent." }, 404);
}
export async function DELETE(request: Request) {
  if (!localRequest(request)) return respond({ error: "Local access required." }, 403);
  try {
    return respond(jobs.cancelRequest(await boundedJson(request)));
  } catch { return respond({ error: "Cancellation request could not be read." }, 400); }
}
