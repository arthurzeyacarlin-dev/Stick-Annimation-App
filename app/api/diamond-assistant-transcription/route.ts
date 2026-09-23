import { AssistantTranscriptionService } from "@/src/lib/assistant/assistantTranscriptionService";

export const runtime = "nodejs";
const owner = globalThis as typeof globalThis & { diamondAssistantTranscriptionV1?: AssistantTranscriptionService };
const transcription = owner.diamondAssistantTranscriptionV1 ??= new AssistantTranscriptionService();
export const POST = (request: Request) => transcription.transcribe(request);
export const DELETE = (request: Request) => transcription.cancel(request);
