import { AssistantTranscriptionService } from "@/src/lib/assistant/assistantTranscriptionService";
import { recordUsageEvent } from "@/src/lib/usage-journal/usageJournalRuntime";
import { requireAccountRequest } from "@/src/lib/account/access";
import { withAccountUsageOwner } from "@/src/lib/account-usage/accountUsageStore";
import { randomUUID } from "node:crypto";
import { assertAiCreditAvailable, spendAiCredit } from "@/src/lib/account/aiCredits";
import { AI_ACTION_CREDITS } from "@/src/lib/account/plans";

export const runtime = "nodejs";
const owner = globalThis as typeof globalThis & { diamondAssistantTranscriptionV1?: AssistantTranscriptionService };
const transcription = owner.diamondAssistantTranscriptionV1 ??= new AssistantTranscriptionService(fetch,
  () => process.env.OPENAI_API_KEY, undefined, recordUsageEvent);
export const POST = async (request: Request) => {
  const access = await requireAccountRequest(request);
  if ("response" in access) return access.response;
  // (Nov 11 security) voice typing is a paid call: one credit per transcription, checked before and spent after a successful one.
  const ownerId = access.session.user.id;
  try { assertAiCreditAvailable(ownerId, 0, AI_ACTION_CREDITS.dictation); }
  catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Not enough credits left." }, { status: 402 }); }
  const response = await withAccountUsageOwner(ownerId, () => transcription.transcribe(request, ownerId));
  if (response.ok) { try { spendAiCredit(ownerId, randomUUID(), AI_ACTION_CREDITS.dictation, "dictation"); } catch { /* already typed */ } }
  return response;
};
export const DELETE = async (request: Request) => {
  const access = await requireAccountRequest(request);
  if ("response" in access) return access.response;
  return withAccountUsageOwner(access.session.user.id, () => transcription.cancel(request, access.session.user.id));
};
