"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent, KeyboardEvent } from "react";
import {
  AI_ANIMATOR_REASONING_EFFORT,
  isAiAnimatorTerminalStatus,
  normalizeAiAnimatorJobSnapshot,
  type AiAnimatorConversationMessage,
  type AiAnimatorJobSnapshot,
  type AiAnimatorRequest,
} from "@/src/lib/ai/aiAnimatorContract";
import {
  createEmptyAiAnimatorLedger,
  readAccountAiAnimatorLedger,
  subscribeAccountAiAnimatorLedger,
  type AiAnimatorLedger,
} from "@/src/lib/ai/aiAnimatorStorage";
import type {
  DrawingAiActionPlan,
  DrawingAiProjectMemory,
  DrawingAiReasoningLevel,
  DrawingAiWorkspaceContext,
} from "@/src/lib/ai/drawingAiContract";
import type { GeneratedFrameRenderResult } from "@/src/lib/ai/drawingFrameExecutor";
import {
  acceptTerraJobSnapshotV1,
  getPendingTerraDescriptorV1,
  registerPendingTerraJobV1,
  setTerraJobPostingV1,
  type TerraPendingDescriptorV1,
} from "@/src/lib/notifications/terraCompletionObserver";
import {
  clearNotificationNavigationIntentV1,
  confirmNotificationTargetArrivalV1,
  peekNotificationNavigationIntentV1,
  registerNotificationOriginSurfaceV1,
  registerNotificationTargetSurfaceV1,
  subscribeNotificationNavigationIntentV1,
} from "@/src/lib/notifications/notificationNavigation";
import type { NotificationTargetV1 } from "@/src/lib/notifications/notificationContracts";
import { WorkspaceAiPanelShell } from "./WorkspaceAiPanelShell";
import { AssistantDictationCapture, type DictationView } from "@/src/lib/assistant/assistantDictationCapture";
import { ChatDictateButton, ChatDictationPanel, ChatReasoningSelect, ChatSendButton, ChatStopButton, ChatToolsRow, chatComposerStyles } from "@/src/components/ui/ChatComposerParts";
import { workspaceColors } from "../workspaceTheme";
import type { Scene as AnimatorScene } from "@/src/lib/animator/engine";
import { ENGINE_TEST_SCENES } from "@/src/lib/animator/testScenes";

// SPEC-0017 Phase 1-2 review-only list of hand-written engine scenes (hidden unless the review flag is set).
const ENGINE_TEST_ENABLED = process.env.NEXT_PUBLIC_SPEC0017_ENGINE_TEST === "1";

type DrawingAiPanelProps = {
  workspaceContext?: DrawingAiWorkspaceContext | null;
  projectAiMemory?: DrawingAiProjectMemory | null;
  onProjectAiMemoryChange?: (memory: DrawingAiProjectMemory | null) => void;
  onApplyGeneratedFrame?: (result: GeneratedFrameRenderResult, source: { prompt: string; response: string }) => Promise<boolean> | boolean;
  onExecuteActionPlan?: (actionPlan: NonNullable<DrawingAiActionPlan>) => Promise<boolean> | boolean;
  onApplyAnimatorScene?: (scene: AnimatorScene) => boolean;
  readOnly?: boolean;
};

const REASONING_OPTIONS: Array<{ value: DrawingAiReasoningLevel; label: string }> = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
  { value: "extra-high", label: "Extra High" },
];
const MINIMUM_THINKING_PRESENTATION_MS = 2_000;
const PENDING_PROMPT_DIGEST = "0".repeat(64);
const EMPTY_USAGE = { inputTokens: null, outputTokens: null, totalTokens: null, estimatedCostUsd: null };
const notificationProjectTitle = (value: string) => {
  const normalized = value.normalize("NFC").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim() || "Untitled project";
  const scalars = Array.from(normalized);
  return scalars.length <= 120 ? normalized : `${scalars.slice(0, 119).join("")}…`;
};

const readAiAnimatorResponse = async (response: Response): Promise<unknown> => {
  const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
  if (!contentType.includes("application/json")) {
    throw new Error(`Terra service returned an unexpected ${response.status} response. No animation changed. Try again when the service is available.`);
  }
  try {
    return await response.json() as unknown;
  } catch {
    throw new Error("Terra service returned an unreadable response. No animation changed. Try again when the service is available.");
  }
};

const newMessage = (role: "user" | "assistant", content: string, jobId?: string): AiAnimatorConversationMessage => ({
  id: crypto.randomUUID(), jobId, role, content, createdAt: new Date().toISOString(),
});

const TYPEWRITER_MIN_MS = 220;
const TYPEWRITER_MAX_MS = 720;
const TYPEWRITER_MS_PER_CHARACTER = 3.5;
const TYPEWRITER_EDGE_CHARACTERS = 14;

function AiAnimatorAssistantReply({
  message,
  animate,
  onRevealComplete,
}: {
  message: AiAnimatorConversationMessage;
  animate: boolean;
  onRevealComplete: (messageId: string) => void;
}) {
  const [visibleCharacters, setVisibleCharacters] = useState(animate ? 0 : message.content.length);
  const complete = visibleCharacters >= message.content.length;

  useEffect(() => {
    if (!animate || message.content.length === 0) {
      onRevealComplete(message.id);
      return;
    }
    const duration = Math.min(TYPEWRITER_MAX_MS, Math.max(TYPEWRITER_MIN_MS, message.content.length * TYPEWRITER_MS_PER_CHARACTER));
    const startedAt = performance.now();
    let frame = 0;
    const reveal = (now: number) => {
      const progress = Math.min(1, (now - startedAt) / duration);
      setVisibleCharacters(Math.min(message.content.length, Math.max(1, Math.ceil(message.content.length * progress))));
      if (progress < 1) {
        frame = requestAnimationFrame(reveal);
      } else {
        onRevealComplete(message.id);
      }
    };
    frame = requestAnimationFrame(reveal);
    return () => cancelAnimationFrame(frame);
  }, [animate, message.content, message.id, onRevealComplete]);

  const edgeStart = complete ? visibleCharacters : Math.max(0, visibleCharacters - TYPEWRITER_EDGE_CHARACTERS);
  const settledText = message.content.slice(0, edgeStart);
  const leadingText = message.content.slice(edgeStart, visibleCharacters);

  return (
    <div
      className="ai-animator-message ai-animator-assistant-message"
      data-ai-assistant-message={message.id}
      data-reveal-state={complete ? "complete" : "revealing"}
      aria-live="polite"
      style={{ alignSelf: "flex-start", maxWidth: "92%", color: workspaceColors.textSecondary, fontSize: 12, lineHeight: 1.55 }}
    >
      <span className="ai-animator-sr-only">Terra: {message.content}</span>
      <span className="ai-animator-assistant-visual" data-ai-assistant-visual aria-hidden="true">
        {complete ? message.content : <>{settledText}<span className="ai-animator-typewriter-edge">{leadingText}</span></>}
      </span>
      <span className="ai-animator-reduced-copy" aria-hidden="true">{message.content}</span>
    </div>
  );
}

export function DrawingAiPanel({
  workspaceContext = null,
  projectAiMemory: _projectAiMemory,
  onProjectAiMemoryChange: _onProjectAiMemoryChange,
  onApplyGeneratedFrame: _onApplyGeneratedFrame,
  onExecuteActionPlan: _onExecuteActionPlan,
  onApplyAnimatorScene,
  readOnly = false,
}: DrawingAiPanelProps = {}) {
  void _projectAiMemory; void _onProjectAiMemoryChange; void _onApplyGeneratedFrame; void _onExecuteActionPlan;
  const projectId = workspaceContext?.workspaceIdentity?.trim() || workspaceContext?.projectId?.trim() || "unsaved-workspace";
  const projectGeneration = workspaceContext?.projectGeneration ?? 0;
  const [ledger, setLedger] = useState<AiAnimatorLedger>(() => createEmptyAiAnimatorLedger(projectId));
  const [reasoningLevel, setReasoningLevel] = useState<DrawingAiReasoningLevel>("medium");
  const [inputValue, setInputValue] = useState("");
  const [engineTestStatus, setEngineTestStatus] = useState("");
  const [dictation, setDictation] = useState<DictationView>({ phase: "idle", seconds: 0, message: "", levels: [] });
  const dictationRef = useRef<AssistantDictationCapture | null>(null);
  const [requestError, setRequestError] = useState<string | null>(null);
  const shellRef = useRef<HTMLDivElement | null>(null);
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const composerRef = useRef<HTMLTextAreaElement | null>(null);
  const observedWorkspaceRef = useRef({ projectId, projectGeneration });
  const pendingRevealMessageIdsRef = useRef(new Set<string>());
  const knownMessageIdsRef = useRef(new Set(ledger.messages.map(message => message.id)));
  const submittedThinkingStartedAtRef = useRef(new Map<string, number>());
  const presentationTimersRef = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const [navigationTarget, setNavigationTarget] = useState<Extract<NotificationTargetV1, { kind: "workspace-terra-turn" }> | null>(() => {
    const intent = typeof window === "undefined" ? null : peekNotificationNavigationIntentV1();
    return intent?.kind === "workspace-terra-turn" ? intent : null;
  });
  const activeJob = useMemo(
    () => [...ledger.jobs].reverse().find((job) => !isAiAnimatorTerminalStatus(job.status)) ?? null,
    [ledger.jobs],
  );

  useEffect(() => {
    let cancelled = false;
    for (const timer of presentationTimersRef.current.values()) clearTimeout(timer);
    presentationTimersRef.current.clear();
    submittedThinkingStartedAtRef.current.clear();
    pendingRevealMessageIdsRef.current.clear();
    const initial = createEmptyAiAnimatorLedger(projectId);
    knownMessageIdsRef.current = new Set();
    setReasoningLevel("medium"); setInputValue(""); setRequestError(null); setLedger(initial);
    void readAccountAiAnimatorLedger(projectId).then(result => {
      if (cancelled) return;
      knownMessageIdsRef.current = new Set(result.ledger.messages.map(message => message.id));
      setLedger(result.ledger);
    }).catch(() => { if (!cancelled) setRequestError("Saved Terra history is temporarily unavailable."); });
    const unsubscribe = subscribeAccountAiAnimatorLedger(projectId, next => {
      const submittedOnThisMount = new Set(submittedThinkingStartedAtRef.current.keys());
      for (const job of next.jobs) {
        if (job.status === "cancelled") {
          submittedThinkingStartedAtRef.current.delete(job.jobId);
          const timer = presentationTimersRef.current.get(job.jobId);
          if (timer) clearTimeout(timer);
          presentationTimersRef.current.delete(job.jobId);
        }
      }
      const delayed = [...next.jobs].reverse().find(job => isAiAnimatorTerminalStatus(job.status) && job.status !== "cancelled" && submittedThinkingStartedAtRef.current.has(job.jobId));
      if (delayed) {
        const startedAt = submittedThinkingStartedAtRef.current.get(delayed.jobId)!;
        const remaining = MINIMUM_THINKING_PRESENTATION_MS - (Date.now() - startedAt);
        if (remaining > 0) {
          const priorTimer = presentationTimersRef.current.get(delayed.jobId);
          if (priorTimer) clearTimeout(priorTimer);
          const timer = setTimeout(() => {
            presentationTimersRef.current.delete(delayed.jobId);
            submittedThinkingStartedAtRef.current.delete(delayed.jobId);
            void readAccountAiAnimatorLedger(projectId).then(({ ledger: terminal }) => {
              if (cancelled) return;
              for (const message of terminal.messages) {
                if (message.role === "assistant" && !knownMessageIdsRef.current.has(message.id)) pendingRevealMessageIdsRef.current.add(message.id);
                knownMessageIdsRef.current.add(message.id);
              }
              setLedger(terminal);
            });
          }, remaining);
          presentationTimersRef.current.set(delayed.jobId, timer);
          return;
        }
        submittedThinkingStartedAtRef.current.delete(delayed.jobId);
      }
      for (const message of next.messages) {
        if (message.role === "assistant" && submittedOnThisMount.has(message.jobId ?? "") && !knownMessageIdsRef.current.has(message.id)) pendingRevealMessageIdsRef.current.add(message.id);
        knownMessageIdsRef.current.add(message.id);
      }
      setLedger(next);
    });
    return () => { cancelled = true; unsubscribe(); };
  }, [projectId]);

  useEffect(() => () => {
    for (const timer of presentationTimersRef.current.values()) clearTimeout(timer);
    presentationTimersRef.current.clear();
  }, []);

  useEffect(() => subscribeNotificationNavigationIntentV1(target => {
    if (target.kind === "workspace-terra-turn") setNavigationTarget(target);
  }), []);

  useEffect(() => { if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight; }, [activeJob?.status, ledger.messages.length]);

  useEffect(() => {
    const observed = observedWorkspaceRef.current;
    if (observed.projectId !== projectId) {
      observedWorkspaceRef.current = { projectId, projectGeneration };
      return;
    }
    if (observed.projectGeneration === projectGeneration) return;
    observedWorkspaceRef.current = { projectId, projectGeneration };
    if (!activeJob || activeJob.projectGeneration !== observed.projectGeneration) return;
    const failedAt = new Date().toISOString();
    const descriptor = getPendingTerraDescriptorV1(activeJob.jobId);
    if (!descriptor) return;
    void acceptTerraJobSnapshotV1(descriptor, {
      ...activeJob,
      status: "failed",
      intent: null,
      lastSequence: activeJob.lastSequence + 1,
      updatedAt: failedAt,
      completedAt: failedAt,
      telemetry: { ...activeJob.telemetry, outcome: "failed", latencyMs: Date.now() - Date.parse(activeJob.createdAt) },
      events: [...activeJob.events, {
        sequence: activeJob.lastSequence + 1,
        status: "failed",
        createdAt: failedAt,
        errorCode: "stale_generation",
        errorMessage: "The workspace changed before Terra finished. No animation changed. Send the message again for the current project state.",
      }],
    }).catch(error => setRequestError(error instanceof Error ? error.message : "Terra could not save the terminal result."));
  }, [activeJob, projectGeneration, projectId]);

  useEffect(() => {
    const surface = shellRef.current;
    const region = bodyRef.current;
    const latestJob = ledger.jobs.at(-1);
    if (!surface || !region || !workspaceContext || !latestJob) return;
    const origin = {
      kind: "workspace-terra",
      workspaceIdentity: workspaceContext.workspaceIdentity,
      projectId: workspaceContext.projectId,
      projectGeneration: latestJob.projectGeneration,
      jobId: latestJob.jobId,
      projectTitle: notificationProjectTitle(workspaceContext.projectTitle),
    } as const;
    const originHandle = registerNotificationOriginSurfaceV1({ origin, surfaceElement: surface, terminalRegionElement: region });
    return () => originHandle.unregister();
  }, [ledger.jobs, workspaceContext]);

  useEffect(() => {
    const surface = shellRef.current;
    const body = bodyRef.current;
    const target = navigationTarget;
    if (!surface || !body || !target || target.projectId !== workspaceContext?.projectId || target.workspaceIdentity !== workspaceContext.workspaceIdentity) return;
    const job = ledger.jobs.find(candidate => candidate.jobId === target.jobId && candidate.projectGeneration === target.projectGeneration);
    if (!job || !isAiAnimatorTerminalStatus(job.status)) return;
    const message = ledger.messages.find(candidate => candidate.jobId === target.jobId && candidate.role === "assistant");
    const region = message ? body.querySelector<HTMLElement>(`[data-ai-assistant-message="${message.id}"]`) ?? body : body;
    const handle = registerNotificationTargetSurfaceV1({ target, surfaceElement: surface, targetRegionElement: region });
    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    const arrive = async (attempt: number) => {
      if (cancelled) return;
      region.scrollIntoView({ block: "nearest" });
      region.tabIndex = -1;
      region.focus({ preventScroll: true });
      try {
        const result = await confirmNotificationTargetArrivalV1(handle);
        if (cancelled) return;
        if (result.matched) {
          clearNotificationNavigationIntentV1(target);
          setNavigationTarget(null);
          return;
        }
      } catch { /* The unread item remains available if storage cannot confirm arrival. */ }
      if (attempt < 12) retryTimer = setTimeout(() => { void arrive(attempt + 1); }, 80);
    };
    const frame = requestAnimationFrame(() => { void arrive(0); });
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      if (retryTimer) clearTimeout(retryTimer);
      handle.unregister();
    };
  }, [ledger.jobs, ledger.messages, navigationTarget, workspaceContext?.projectId, workspaceContext?.workspaceIdentity]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const message = inputValue.trim();
    if (!message || activeJob || readOnly || !workspaceContext) return;
    const jobId = crypto.randomUUID();
    const turnId = crypto.randomUUID();
    const now = new Date().toISOString();
    const localJob: AiAnimatorJobSnapshot = {
      version: 1, jobId, turnId, projectId, projectGeneration: workspaceContext.projectGeneration, reasoningLevel, intent: null,
      status: "thinking", lastSequence: 1, createdAt: now, updatedAt: now,
      completedAt: null,
      telemetry: { model: "gpt-5.6-terra", effort: AI_ANIMATOR_REASONING_EFFORT[reasoningLevel], outcome: "active", latencyMs: null, promptDigest: PENDING_PROMPT_DIGEST, usage: EMPTY_USAGE },
      events: [{ sequence: 1, status: "thinking", createdAt: now }],
    };
    const priorMessages = ledger.messages;
    submittedThinkingStartedAtRef.current.set(jobId, Date.now());
    const userMessage = newMessage("user", message, jobId);
    const descriptor: TerraPendingDescriptorV1 = {
      schema: "terra-pending-descriptor/v1",
      workspaceIdentity: workspaceContext.workspaceIdentity,
      projectId,
      projectGeneration: workspaceContext.projectGeneration,
      projectTitle: notificationProjectTitle(workspaceContext.projectTitle),
      jobId,
      turnId,
      createdAt: Date.parse(now),
      acceptedAt: null,
    };
    setInputValue(""); setRequestError(null); dictationRef.current?.cancel("");
    const requestBody: AiAnimatorRequest = {
      jobId, turnId, message, reasoningLevel,
      recentConversation: priorMessages.slice(-12).map(({ role, content }) => ({ role, content })),
      workspace: {
        projectId, projectTitle: workspaceContext.projectTitle, projectGeneration: workspaceContext.projectGeneration,
        totalLayers: workspaceContext.totalLayers, authoredFrameCount: workspaceContext.authoredFrameCount,
        timelineFps: workspaceContext.timelineFps, activeTool: workspaceContext.activeTool,
      },
    };
    setTerraJobPostingV1(jobId, true);
    try {
      await registerPendingTerraJobV1(descriptor, userMessage, localJob);
      const response = await fetch("/api/ai-animator", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(requestBody) });
      const body = await readAiAnimatorResponse(response);
      const snapshot = normalizeAiAnimatorJobSnapshot(body);
      if (!response.ok || !snapshot) {
        const errorMessage = typeof body === "object" && body !== null && "error" in body && typeof body.error === "string"
          ? body.error : "Terra could not start. No animation changed.";
        throw new Error(errorMessage);
      }
      await acceptTerraJobSnapshotV1(descriptor, snapshot);
    } catch (error) {
      const messageText = error instanceof Error ? error.message : "Terra could not start. No animation changed.";
      const failedAt = new Date().toISOString();
      if (getPendingTerraDescriptorV1(jobId)) await acceptTerraJobSnapshotV1(descriptor, { ...localJob, status: "failed", lastSequence: 2, updatedAt: failedAt, completedAt: failedAt,
        telemetry: { ...localJob.telemetry, outcome: "failed", latencyMs: Date.now() - Date.parse(localJob.createdAt) },
        events: [...localJob.events, { sequence: 2, status: "failed", createdAt: failedAt, errorCode: "submit_failed", errorMessage: messageText }],
      }).catch(() => setRequestError(messageText));
      else setRequestError(messageText);
    } finally {
      setTerraJobPostingV1(jobId, false);
    }
  };

  const cancelActiveJob = async () => {
    if (!activeJob) return;
    const descriptor = getPendingTerraDescriptorV1(activeJob.jobId);
    if (!descriptor) return;
    setTerraJobPostingV1(activeJob.jobId, true);
    try {
      const response = await fetch("/api/ai-animator", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jobId: activeJob.jobId, projectId }) });
      const snapshot = normalizeAiAnimatorJobSnapshot(await readAiAnimatorResponse(response));
      if (!response.ok || !snapshot) throw new Error("Cancellation could not be confirmed.");
      await acceptTerraJobSnapshotV1(descriptor, snapshot);
    } catch (error) {
      setRequestError(`${error instanceof Error ? error.message : "Cancellation failed."} The request status will keep updating.`);
    } finally {
      setTerraJobPostingV1(activeJob.jobId, false);
    }
  };

  // Same voice typing as the Assistant: recorded audio is sent for transcription and the text is added to the draft.
  useEffect(() => {
    const controller = new AssistantDictationCapture(setDictation, (text) => {
      setInputValue((current) => current ? `${current}${/\s$/.test(current) ? "" : " "}${text}` : text);
      composerRef.current?.focus();
      return true;
    });
    dictationRef.current = controller;
    const leave = () => controller.cancel("Dictation stopped because you left the editor. Nothing was inserted.");
    const hide = () => { if (document.hidden) leave(); };
    window.addEventListener("pagehide", leave); document.addEventListener("visibilitychange", hide);
    return () => { window.removeEventListener("pagehide", leave); document.removeEventListener("visibilitychange", hide); controller.dispose(); dictationRef.current = null; };
  }, []);

  const handleComposerKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); }
  };
  const finishAssistantReveal = useCallback((messageId: string) => {
    pendingRevealMessageIdsRef.current.delete(messageId);
  }, []);
  const reasoningDisabled = Boolean(activeJob) || readOnly;
  const dictationActive = dictation.phase !== "idle";
  const sendDisabled = !inputValue.trim() || readOnly || !workspaceContext;

  return (
    <>
      <style>{`
        .ai-animator-thinking { position: relative; display: inline-block; color: ${workspaceColors.accentMuted}; font-weight: 600; }
        .ai-animator-thinking::before, .ai-animator-thinking::after { content: attr(data-text); position: absolute; inset: 0; z-index: 1; pointer-events: none; color: transparent; background-size: 100% 100%; background-position: 50% 50%; background-repeat: no-repeat; background-clip: text; -webkit-background-clip: text; -webkit-text-fill-color: transparent; -webkit-mask-image: linear-gradient(90deg, transparent 0%, rgba(0,0,0,.34) 8%, #000 18%, #000 82%, rgba(0,0,0,.34) 92%, transparent 100%); mask-image: linear-gradient(90deg, transparent 0%, rgba(0,0,0,.34) 8%, #000 18%, #000 82%, rgba(0,0,0,.34) 92%, transparent 100%); -webkit-mask-size: 57% 100%; mask-size: 57% 100%; -webkit-mask-position: -132.5581% 50%; mask-position: -132.5581% 50%; -webkit-mask-repeat: no-repeat; mask-repeat: no-repeat; opacity: 0; }
        .ai-animator-thinking::before { background-image: linear-gradient(90deg, #2f86ff 0%, #58aaff 30%, #a9eeff 52%, #5bb8ff 74%, #2a7be4 100%); animation: ai-animator-sweep-primary 3.75s linear infinite, ai-animator-sweep-primary-visibility 3.75s steps(1, end) infinite; }
        .ai-animator-thinking::after { background-image: linear-gradient(90deg, #103f82 0%, #1764ae 26%, #48cee7 52%, #278bc5 76%, #123f7a 100%); animation: ai-animator-sweep-follow 3.75s linear infinite, ai-animator-sweep-follow-visibility 3.75s steps(1, end) infinite; }
        @keyframes ai-animator-sweep-primary { 0% { -webkit-mask-position: -132.5581% 50%; mask-position: -132.5581% 50%; } 26.6667%, 100% { -webkit-mask-position: 232.5581% 50%; mask-position: 232.5581% 50%; } }
        @keyframes ai-animator-sweep-follow { 0%, 26.6667% { -webkit-mask-position: -132.5581% 50%; mask-position: -132.5581% 50%; } 53.3333%, 100% { -webkit-mask-position: 232.5581% 50%; mask-position: 232.5581% 50%; } }
        @keyframes ai-animator-sweep-primary-visibility { 0% { opacity: 1; } 26.6667%, 100% { opacity: 0; } }
        @keyframes ai-animator-sweep-follow-visibility { 0% { opacity: 0; } 26.6667% { opacity: 1; } 53.3333%, 100% { opacity: 0; } }
        .ai-animator-message { animation: ai-animator-reveal .18s ease-out both; overflow-wrap: anywhere; }
        @keyframes ai-animator-reveal { from { opacity: 0; transform: translateY(3px); } to { opacity: 1; transform: translateY(0); } }
        .ai-animator-assistant-message { padding: 0; border: 0; border-radius: 0; background: transparent; white-space: pre-wrap; }
        .ai-animator-assistant-visual { white-space: pre-wrap; }
        .ai-animator-typewriter-edge { color: transparent; background: linear-gradient(90deg, #89bfff 0%, #71e7ff 62%, rgba(255,255,255,.92) 100%); background-clip: text; -webkit-background-clip: text; -webkit-text-fill-color: transparent; text-shadow: 0 0 10px rgba(79,181,255,.18); }
        .ai-animator-reduced-copy { display: none; white-space: pre-wrap; }
        .animator-engine-test { display: grid; gap: 8px; padding: 10px; border: 1px solid ${workspaceColors.border}; border-radius: 10px; background: #071120; }
        .animator-engine-test h3 { margin: 0; font-size: 12px; font-weight: 700; color: #f6f9ff; }
        .animator-engine-test p { margin: 0; font-size: 11px; line-height: 1.45; color: #8fabd0; }
        .animator-engine-test-list { display: flex; flex-wrap: wrap; gap: 6px; }
        .animator-engine-test-list button { min-height: 30px; padding: 4px 10px; border-radius: 10px; border: 1px solid #3a6aa3; background: #0f2a52; color: #f6f9ff; font: inherit; font-size: 12px; font-weight: 600; cursor: pointer; transition: none; }
        .animator-engine-test-list button:hover:enabled { border-color: #0066ff; background: #0066ff; color: #fff; }
        .animator-engine-test-list button:disabled { opacity: .45; cursor: not-allowed; }
        .animator-engine-test-list button:focus-visible { outline: 2px solid #66c7ff; outline-offset: 2px; }
        .ai-animator-sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0,0,0,0); white-space: nowrap; border: 0; }
        @media (prefers-reduced-motion: reduce) { .ai-animator-thinking::before, .ai-animator-thinking::after { animation: none; display: none; } .ai-animator-message { animation: none; } .ai-animator-assistant-visual { display: none; } .ai-animator-reduced-copy { display: inline; } }
      `}</style>
      <WorkspaceAiPanelShell
        shellRef={shellRef}
        bodyRef={bodyRef}
        body={<>
          {ENGINE_TEST_ENABLED && onApplyAnimatorScene && (
            <section className="animator-engine-test" aria-label="Engine test">
              <h3>Engine test</h3>
              <p>Review copy only. Each button adds a ready-made scene on a new layer. No AI is used.</p>
              <div className="animator-engine-test-list">
                {ENGINE_TEST_SCENES.map((scene) => (
                  <button type="button" key={scene.id} disabled={readOnly} onClick={() => {
                    const ok = onApplyAnimatorScene(scene);
                    setEngineTestStatus(ok ? `Added "${scene.title}" on layer "AI: ${scene.title}". Press Play to watch.` : "Couldn't add the scene. Stop playback or finish your current edit, then try again.");
                  }}>{scene.title}</button>
                ))}
              </div>
              {engineTestStatus && <p role="status">{engineTestStatus}</p>}
            </section>
          )}
          {ledger.messages.length === 0 && !activeJob && <div style={{ margin: "auto", maxWidth: 240, textAlign: "center", color: workspaceColors.textMuted, fontSize: 12, lineHeight: 1.55 }}>Ask Terra anything about your animation. Creating and editing frames comes later.</div>}
          {ledger.messages.map((message) => message.role === "user"
            ? <div className="ai-animator-message" data-ai-user-message={message.id} key={message.id} style={{ alignSelf: "flex-end", maxWidth: "88%", padding: "9px 11px", borderRadius: 12, whiteSpace: "pre-wrap", color: "#eaf3ff", background: workspaceColors.selectedFill, border: `1px solid ${workspaceColors.selectedBorder}`, fontSize: 12, lineHeight: 1.48 }}>{message.content}</div>
            : <AiAnimatorAssistantReply key={message.id} message={message} animate={pendingRevealMessageIdsRef.current.has(message.id)} onRevealComplete={finishAssistantReveal} />)}
          {activeJob && <div role="status" aria-live="polite" aria-label="AI Animator request status" style={{ alignSelf: "flex-start", padding: "8px 4px", fontSize: 12 }}><span className="ai-animator-thinking" data-text="Thinking" data-sweep-pattern="paired-continuous-long-pause">Thinking</span></div>}
          {requestError && <div role="alert" style={{ color: workspaceColors.danger, fontSize: 11, lineHeight: 1.4 }}>{requestError}</div>}
        </>}
        composer={<form onSubmit={submit} className={`${chatComposerStyles.box} ${chatComposerStyles.compact}`} aria-label="AI Animator message composer">
          <textarea ref={composerRef} aria-label="Message AI Animator" value={inputValue} onChange={(event) => setInputValue(event.target.value)} onKeyDown={handleComposerKeyDown} placeholder="Chat with Terra" disabled={Boolean(activeJob) || readOnly} rows={2} />
          <ChatDictationPanel dictation={dictation} onCancel={() => { dictationRef.current?.cancel(); composerRef.current?.focus(); }} onStop={() => void dictationRef.current?.stop()} />
          <ChatToolsRow
            left={<ChatReasoningSelect value={reasoningLevel} options={REASONING_OPTIONS} disabled={reasoningDisabled} onChange={setReasoningLevel} title={`Terra effort: ${AI_ANIMATOR_REASONING_EFFORT[reasoningLevel]}`} />}
            right={<>
              <ChatDictateButton disabled={dictationActive || Boolean(activeJob) || readOnly} onClick={() => void dictationRef.current?.start()} />
              {activeJob
                ? <ChatStopButton label={`Cancel AI Animator job ${activeJob.jobId}`} onClick={cancelActiveJob} />
                : <ChatSendButton disabled={sendDisabled} />}
            </>}
          />
          <div className={chatComposerStyles.dictationNotice} role="status" aria-live="polite">{dictation.message}</div>
        </form>}
      />
    </>
  );
}
