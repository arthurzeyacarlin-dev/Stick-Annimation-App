import { AssistantTranscriptionService } from "@/src/lib/assistant/assistantTranscriptionService";
import { recordUsageEvent } from "@/src/lib/usage-journal/usageJournalRuntime";
import { requireAccountRequest } from "@/src/lib/account/access";
import { withAccountUsageOwner } from "@/src/lib/account-usage/accountUsageStore";

export const runtime = "nodejs";
const owner = globalThis as typeof globalThis & { diamondAssistantTranscriptionV1?: AssistantTranscriptionService };
const transcription = owner.diamondAssistantTranscriptionV1 ??= new AssistantTranscriptionService(fetch,
  () => process.env.OPENAI_API_KEY, undefined, recordUsageEvent);
export const POST = async (request: Request) => {
  const access = await requireAccountRequest(request);
  if ("response" in access) return access.response;
  return withAccountUsageOwner(access.session.user.id, () => transcription.transcribe(request));
};
export const DELETE = async (request: Request) => {
  const access = await requireAccountRequest(request);
  if ("response" in access) return access.response;
  return withAccountUsageOwner(access.session.user.id, () => transcription.cancel(request));
};
