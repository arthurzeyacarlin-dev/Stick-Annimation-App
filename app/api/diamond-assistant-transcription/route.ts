import { after } from "next/server";
import { AssistantTranscriptionService } from "@/src/lib/assistant/assistantTranscriptionService";
import { recordUsageEvent } from "@/src/lib/usage-journal/usageJournalRuntime";
import { requireAccountRequest } from "@/src/lib/account/access";
import { flushAccountUsageWrites, withAccountUsageOwner } from "@/src/lib/account-usage/accountUsageStore";
import { isTrustedAccountRequest } from "@/src/lib/account/accountConfig";
import { sharedJobStoreFromEnv } from "@/src/lib/ai-jobs/postgresSharedJobStore";

export const runtime = "nodejs";
// Dictation answers in the same request (45 s limit); this leaves room for reading the upload.
export const maxDuration = 60;
const owner = globalThis as typeof globalThis & { diamondAssistantTranscriptionV1?: AssistantTranscriptionService };
// The same "is this really our own app page?" check as every account route (local http or the
// configured https app address), instead of the old this-computer-only rule that blocked it online.
const transcription = owner.diamondAssistantTranscriptionV1 ??= new AssistantTranscriptionService(fetch,
  () => process.env.OPENAI_API_KEY, undefined, recordUsageEvent,
  { allowRequest: (request) => isTrustedAccountRequest(request), sharedStore: sharedJobStoreFromEnv });
export const POST = async (request: Request) => {
  const access = await requireAccountRequest(request);
  if ("response" in access) return access.response;
  after(flushAccountUsageWrites); // the dictation usage record is saved before the server copy stops
  return withAccountUsageOwner(access.session.user.id, () => transcription.transcribe(request, access.session.user.id));
};
export const DELETE = async (request: Request) => {
  const access = await requireAccountRequest(request);
  if ("response" in access) return access.response;
  return withAccountUsageOwner(access.session.user.id, () => transcription.cancelShared(request, access.session.user.id));
};
