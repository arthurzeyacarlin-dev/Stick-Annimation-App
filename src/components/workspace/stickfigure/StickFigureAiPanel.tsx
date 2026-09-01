import {useEffect, useRef, useState} from "react";
import {WorkspaceAiComposerShell, WorkspaceAiPanelShell} from "../ai/WorkspaceAiPanelShell";
import {
  parseStickCommandBatch,
  type StickCommandBatchV1,
  type StickCommandBatchV2,
} from "../../../lib/ai/stickFigureAiContract";
import {
  STICK_AI_CANONICAL_INTENT_V2,
  interpretStickAiPromptV2,
} from "../../../lib/ai/stickFigureAiIntentMatcher";
import {
  buildStickAiRequestV2,
  type StickAiWorkspaceBindingV2,
  type StickFigureAiWorkspaceAdapterV2,
} from "../../../lib/ai/stickFigureAiWorkspaceAdapter";
import {STICK_FIGURE_AI_MOCK_STARTER} from "../../../lib/ai/stickFigureAiMockServer";
import {canonicalJson} from "../../../lib/stickfigure/stickProjectContract";

type AvailabilityState =
  | {status: "checking"; reason: null}
  | {status: "available"; reason: "available"}
  | {status: "unavailable"; reason: string}
  | {status: "failed"; reason: null};

type PreviewState = {
  envelope: StickCommandBatchV1;
  binding: StickAiWorkspaceBindingV2;
};

const PREVIEW_COPY = "Understood: one stick figure, a three-pose wave, 12 frames at 12 FPS. No changes have been made.";
const UNSUPPORTED_COPY = "I couldn’t safely match that request to the one supported result: one stick figure, a three-pose wave, 12 frames at 12 FPS. No changes were made.";
const IDLE_COPY = "Ask the assistant for help with your stick figure.";
const POST_APPLY_COPY = "AI editing comes later; use manual tools.";
const REQUEST_TIMEOUT_MS = 10_000;

const availabilityCopy = (availability: AvailabilityState) => {
  if (availability.status === "checking") return "Checking Stick AI availability…";
  if (availability.status === "failed") return "Stick AI availability could not be checked. Try again.";
  if (availability.status === "available") return "Stick AI is ready.";
  switch (availability.reason) {
    case "capability_disabled": return "Stick AI wave creation is not enabled in this environment.";
    case "server_not_configured": return "Stick AI is unavailable because the server is not configured.";
    case "production_forbidden": return "Stick AI wave creation is not available in production.";
    default: return "Stick AI is temporarily unavailable. Check again.";
  }
};

const buttonStyle = (enabled = true) => ({
  borderRadius: 9,
  border: "1px solid rgba(110,170,255,0.30)",
  background: enabled ? "rgba(110,170,255,0.14)" : "rgba(255,255,255,0.04)",
  color: enabled ? "rgba(225,238,255,0.94)" : "rgba(255,255,255,0.35)",
  padding: "8px 11px",
  fontSize: 11,
  fontWeight: 700,
  cursor: enabled ? "pointer" : "default",
} as const);

export function StickFigureAiPanel({adapter}: {adapter: StickFigureAiWorkspaceAdapterV2}) {
  const [availability, setAvailability] = useState<AvailabilityState>({status: "checking", reason: null});
  const [availabilityEpoch, setAvailabilityEpoch] = useState(0);
  const [prompt, setPrompt] = useState("");
  const [message, setMessage] = useState(IDLE_COPY);
  const [hasSentAttempt, setHasSentAttempt] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const [preview, setPreview] = useState<PreviewState | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const abortReasonRef = useRef<"stopped" | "timeout" | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setAvailability({status: "checking", reason: null});
    void fetch("/api/ai", {
      method: "GET",
      headers: {"X-Diamond-AI-Workspace": "stick-figure", Accept: "application/json"},
      cache: "no-store",
      signal: controller.signal,
    }).then(async (response) => {
      const value = await response.json() as unknown;
      if (!response.ok || !value || typeof value !== "object" || Array.isArray(value)) throw new Error("invalid_availability");
      const record = value as Record<string, unknown>;
      if (Object.keys(record).sort().join(",") !== "available,reason" || typeof record.available !== "boolean" || typeof record.reason !== "string") {
        throw new Error("invalid_availability");
      }
      if (record.available !== (record.reason === "available")) throw new Error("contradictory_availability");
      setAvailability(record.available
        ? {status: "available", reason: "available"}
        : {status: "unavailable", reason: record.reason});
    }).catch(() => {
      if (!controller.signal.aborted) setAvailability({status: "failed", reason: null});
    });
    return () => controller.abort();
  }, [availabilityEpoch]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const canCompose = !requesting && !preview;

  const submit = async () => {
    if (!canCompose) return;
    setHasSentAttempt(true);
    const snapshot = adapter.readSnapshot();
    if (!snapshot?.ready) {
      setMessage("Preparing this Stick project…");
      return;
    }
    if (snapshot.playing) {
      setMessage("Pause playback before requesting or applying an AI change.");
      return;
    }
    if (snapshot.aiCreationConsumed) {
      setMessage(POST_APPLY_COPY);
      return;
    }
    if (!snapshot.eligible) {
      setMessage("This AI shortcut works only before you change the built-in starter. You can still build the wave with the timeline controls. No changes were made.");
      return;
    }
    if (availability.status !== "available") {
      setMessage(availabilityCopy(availability));
      return;
    }
    const local = interpretStickAiPromptV2(prompt);
    if (!local.ok) {
      setMessage(UNSUPPORTED_COPY);
      return;
    }
    const binding = adapter.captureBinding();
    if (!binding) {
      setMessage("The project changed while the AI was working. Request a new preview.");
      return;
    }
    setRequesting(true);
    setMessage("Preparing a safe preview…");
    const controller = new AbortController();
    abortRef.current = controller;
    abortReasonRef.current = null;
    const timeoutHandle = window.setTimeout(() => {
      abortReasonRef.current = "timeout";
      controller.abort();
    }, REQUEST_TIMEOUT_MS);
    try {
      const request = await buildStickAiRequestV2(prompt);
      const response = await fetch("/api/ai", {
        method: "POST",
        headers: {"Content-Type": "application/json", "X-Diamond-AI-Workspace": "stick-figure", Accept: "application/json"},
        body: JSON.stringify(request),
        signal: controller.signal,
      });
      const responseValue = await response.json() as unknown;
      if (!response.ok) {
        const error = responseValue && typeof responseValue === "object" && !Array.isArray(responseValue)
          ? (responseValue as Record<string, unknown>).error
          : null;
        const code = error && typeof error === "object" && !Array.isArray(error)
          ? (error as Record<string, unknown>).code
          : null;
        setMessage(code === "unsupported_prompt" ? UNSUPPORTED_COPY : "The AI request could not be completed. No changes were made.");
        return;
      }
      const parsed = await parseStickCommandBatch(responseValue, STICK_FIGURE_AI_MOCK_STARTER);
      if (!parsed.ok) {
        setMessage("The AI response was invalid and was not applied.");
        return;
      }
      const envelope = parsed.value as unknown as StickCommandBatchV2;
      if (envelope.envelopeVersion !== 2 || envelope.requestId !== request.requestId || envelope.transactionId !== request.transactionId ||
        canonicalJson(envelope.interpretedIntent) !== canonicalJson(STICK_AI_CANONICAL_INTENT_V2) ||
        canonicalJson(local.value.intent) !== canonicalJson(envelope.interpretedIntent)) {
        setMessage("The AI response was invalid and was not applied.");
        return;
      }
      const outcome = await adapter.preview(binding, envelope as unknown as StickCommandBatchV1);
      if (!outcome.accepted || outcome.outcomeCode !== "previewed") {
        setMessage(outcome.errorCode === "stale_document"
          ? "The project changed while the AI was working. Request a new preview."
          : "The AI response was invalid and was not applied.");
        return;
      }
      setPreview({envelope: envelope as unknown as StickCommandBatchV1, binding});
      setMessage(PREVIEW_COPY);
    } catch {
      if (controller.signal.aborted) setMessage(abortReasonRef.current === "timeout"
        ? "The AI request timed out. No changes were made."
        : "Request stopped. No changes were made.");
      else setMessage("The AI request could not be completed. No changes were made.");
    } finally {
      window.clearTimeout(timeoutHandle);
      abortRef.current = null;
      abortReasonRef.current = null;
      setRequesting(false);
    }
  };

  const cancelPreview = async () => {
    if (!preview) return;
    const outcome = await adapter.cancel(preview.envelope);
    setPreview(null);
    setMessage(outcome.outcomeCode === "preview_cancelled"
      ? "Preview cancelled. No changes were made."
      : "The change could not be cancelled safely. No project data changed.");
  };

  const applyPreview = async () => {
    if (!preview) return;
    const outcome = await adapter.apply(preview.binding, preview.envelope);
    setPreview(null);
    if (outcome.accepted && outcome.outcomeCode === "applied") {
      setMessage("The three-pose wave was applied as one undoable change.");
    }
    else if (outcome.outcomeCode === "duplicate") setMessage("This change was already applied.");
    else if (outcome.errorCode === "stale_document") setMessage("The project changed while the AI was working. Request a new preview.");
    else setMessage("The change could not be applied and was rolled back. No project data changed.");
  };

  const body = (
    <>
      {!hasSentAttempt ? (
        <div style={{flex: 1, display: "flex", alignItems: "center", justifyContent: "center", textAlign: "center", color: "rgba(255,255,255,0.34)", fontSize: 14, userSelect: "none"}}>
          {IDLE_COPY}
        </div>
      ) : (
        <div role="status" aria-live="polite" style={{border: "1px solid rgba(255,255,255,0.10)", borderRadius: 10, padding: 10, color: "rgba(255,255,255,0.76)", fontSize: 12, lineHeight: 1.45}}>
          {message}
        </div>
      )}
      {preview ? (
        <div aria-label="Stick AI preview" style={{border: "1px solid rgba(110,170,255,0.26)", borderRadius: 10, padding: 10, display: "grid", gap: 8, color: "rgba(255,255,255,0.78)", fontSize: 12}}>
          <div>1 stick figure · 3 key poses · 12 frames · 12 FPS · 1 second</div>
          <div style={{display: "flex", gap: 8}}>
            <button type="button" onClick={() => void applyPreview()} style={buttonStyle(true)}>Apply</button>
            <button type="button" onClick={() => void cancelPreview()} style={buttonStyle(true)}>Cancel</button>
          </div>
        </div>
      ) : null}
      {hasSentAttempt && availability.status !== "available" ? (
        <div style={{display: "flex", alignItems: "center", gap: 8, color: "rgba(255,255,255,0.54)", fontSize: 11}}>
          {availability.status !== "checking" ? <button type="button" onClick={() => setAvailabilityEpoch((value) => value + 1)} style={buttonStyle(true)}>Check again</button> : null}
        </div>
      ) : null}
    </>
  );

  const composer = (
    <form onSubmit={(event) => { event.preventDefault(); void submit(); }}>
      <WorkspaceAiComposerShell
        input={<textarea aria-label="Stick Figure AI request" value={prompt} disabled={!canCompose}
          onChange={(event) => setPrompt(event.target.value)}
          onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void submit(); } }}
          placeholder="Chat here"
          rows={1}
          style={{flex: 1, minWidth: 0, minHeight: 18, maxHeight: 108, padding: 0, paddingRight: 2, border: "none", background: "transparent", color: "rgba(255,255,255,0.92)", fontSize: 12, lineHeight: 1.45, resize: "none", outline: "none", overflowY: "hidden", fontFamily: "inherit"}} />}
        controls={<>
          {requesting
            ? <button type="button" onClick={() => { abortReasonRef.current = "stopped"; abortRef.current?.abort(); }} style={buttonStyle(true)}>Stop</button>
            : <span aria-hidden="true" />}
          <button type="submit" aria-label="Send Stick Figure AI request" disabled={!canCompose || prompt.trim().length === 0}
            style={{width: 28, height: 28, border: "none", padding: 0, cursor: canCompose && prompt.trim().length > 0 ? "pointer" : "default", opacity: canCompose && prompt.trim().length > 0 ? 1 : 0.5, background: "rgba(255,255,255,0.96)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, borderRadius: 999, boxShadow: "0 0 10px rgba(255,255,255,0.08)", alignSelf: "flex-end"}}>
            <svg viewBox="0 0 24 24" style={{width: 16, height: 16, display: "block"}} aria-hidden="true">
              <path d="M5 12.5l4.2 4.2L19 7.8" fill="none" stroke="#0b0d12" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </>}
      />
    </form>
  );

  return <WorkspaceAiPanelShell body={body} composer={composer} />;
}

export {
  POST_APPLY_COPY as STICK_AI_POST_APPLY_COPY,
  PREVIEW_COPY as STICK_AI_PREVIEW_COPY,
  UNSUPPORTED_COPY as STICK_AI_UNSUPPORTED_COPY,
};
