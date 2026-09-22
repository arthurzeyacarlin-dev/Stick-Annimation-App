import { ASSISTANT_MODEL, CATALOG_VERSION, sealSession, type AssistantRequest, type ProviderResult, type Reasoning, type Session } from "../../src/lib/assistant/assistantContracts.ts";

export const newcomerAnswer = "Welcome! New Project starts a new animation. Open Project reopens a saved animation so you can keep editing. My Projects is for watching your saved movies, including fullscreen playback; use Open Project when you want to edit.\n\nTutorials is the place for learning the basics, though its lesson cards currently say Coming Later. I can walk you through the steps here. Try New Project, draw a pose, add another keyframe, and use Play to preview it. Save your work from the File menu.\n\nExport prepares and downloads a finished animation as a local MP4. AI Animator currently helps with conversation and planning, but cannot create or edit animation yet. AI Project Finalizer is planned and unavailable; its future purpose is careful finishing such as smoothing, blur and glow without overprocessing.";
export function fixtureRequest(overrides: Partial<AssistantRequest> = {}): AssistantRequest {
  return { schema: "diamond-assistant-request/v1", jobId: crypto.randomUUID(), sessionId: crypto.randomUUID(), turnId: crypto.randomUUID(), message: "I am new. What do the Home buttons do?", reasoningLevel: "medium", recentConversation: [], catalogVersion: CATALOG_VERSION, clientSessionRevision: 1, ...overrides };
}
export function fixtureResult(request: AssistantRequest, answer = newcomerAnswer, title = "Getting started with Diamond Animator"): ProviderResult {
  return { reply: { answer, title }, usage: { inputTokens: 200, outputTokens: 150, totalTokens: 350, estimatedCostUsd: .0022, priceDate: "2026-09-22", responseId: `fixture_${request.jobId}`, latencyMs: 40, model: ASSISTANT_MODEL, reasoning: request.reasoningLevel, toolCalls: 0 } };
}
export async function fixtureSession(index: number, pairs = 1, answerChars = 100, reasoning: Reasoning = "medium", userChars = 20): Promise<Session> {
  const at = 1790073000000 + index * 1000;
  const session: Session = { schema: "diamond-assistant-session/v1", id: `fixture_session_${index.toString().padStart(4, "0")}`, title: `Saved chat ${index}`, titleSource: "automatic", manualTitleRevision: 0, createdAt: at, updatedAt: at + pairs * 2, reasoning, revision: pairs * 2, digest: "", messages: [], turns: [] };
  for (let i = 0; i < pairs; i++) {
    const turnId = `turn_${index}_${i.toString().padStart(5, "0")}`; const jobId = `job_${index}_${i.toString().padStart(5, "0")}`; const time = at + i * 2;
    session.messages.push({ id: `${turnId}_user`, turnId, role: "user", text: "Question ".padEnd(userChars, "q"), at: time }, { id: `${turnId}_answer`, turnId, role: "assistant", text: "Answer ".padEnd(answerChars, "a"), at: time + 1 });
    session.turns.push({ id: turnId, jobId, status: "done", reasoning, at: time, acceptedAt: time, endedAt: time + 1, contextIds: [], error: null, usage: fixtureResult(fixtureRequest({ jobId, reasoningLevel: reasoning })).usage });
  }
  return sealSession(session);
}
