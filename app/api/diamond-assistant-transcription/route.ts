import { AssistantTranscriptionService } from "@/src/lib/assistant/assistantTranscriptionService";
import { recordUsageEvent } from "@/src/lib/usage-journal/usageJournalRuntime";

export const runtime = "nodejs";
const owner = globalThis as typeof globalThis & { diamondAssistantTranscriptionV1?: AssistantTranscriptionService };
const transcription = owner.diamondAssistantTranscriptionV1 ??= new AssistantTranscriptionService(fetch,
  () => process.env.OPENAI_API_KEY, undefined, recordUsageEvent);
export const POST = (request: Request) => transcription.transcribe(request);
export const DELETE = (request: Request) => transcription.cancel(request);
