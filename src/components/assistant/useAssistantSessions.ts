"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AssistantError, isId, requestFor, type JobSnapshot, type Reasoning, type Session } from "../../lib/assistant/assistantContracts";
import { beginTurn, deleteSession, listSessions, renameSession, retryTurn, setSessionReasoning, subscribeSessions } from "../../lib/assistant/assistantStorage";
import {
  acceptAssistantJobSnapshotV1,
  commitAssistantInterruptedV1,
  getAssistantObserverSnapshotV1,
  resumeAssistantObserverV1,
  setAssistantJobPostingV1,
  subscribeAssistantObserverV1,
} from "../../lib/notifications/assistantCompletionObserver";

const readableError = (error: unknown) => error instanceof AssistantError ? error.message : "The Assistant could not connect. Your saved chats and unsent draft are kept. Try again when the connection returns.";
export const ASSISTANT_LONG_WAIT_MS = 8000;
export function useAssistantSessions() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [ready, setReady] = useState(false); const [storageBlocked, setStorageBlocked] = useState(false);
  const [notice, setNotice] = useState(""); const [busy, setBusy] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, string>>({}); const [blankReasoning, setBlankReasoning] = useState<Reasoning>("medium");
  const [observer, setObserver] = useState(getAssistantObserverSnapshotV1);
  const live = observer.live as Record<string, JobSnapshot>;
  const pausedJobs = [...observer.pausedJobs];
  const [reveal, setReveal] = useState<Record<string, string>>({});
  const [progressJobId, setProgressJobId] = useState<string | null>(null);
  const progressEligible = useRef(new Set<string>()); const progressShown = useRef(new Set<string>());
  const observedPendingJobs = useRef(new Set<string>());
  const sendGuard = useRef(false);
  const mounted = useRef(true);
  const refreshGeneration = useRef(0);
  const selected = sessions.find(s => s.id === selectedId) ?? null;
  const selectedTurn = selected?.turns.at(-1); const selectedLive = selectedTurn ? live[selectedTurn.jobId] : null;
  const thinkingJobId = selectedTurn?.status === "pending" && selectedLive?.status === "thinking" && !storageBlocked && !pausedJobs.includes(selectedTurn.jobId) ? selectedTurn.jobId : null;
  const thinkingStartedAt = selectedLive?.events[0].at;
  useEffect(() => {
    if (!thinkingJobId || !thinkingStartedAt || !progressEligible.current.has(thinkingJobId) || progressShown.current.has(thinkingJobId)) return;
    const timer = window.setTimeout(() => { if (progressEligible.current.has(thinkingJobId) && !progressShown.current.has(thinkingJobId)) { progressShown.current.add(thinkingJobId); setProgressJobId(thinkingJobId); } }, Math.max(0, ASSISTANT_LONG_WAIT_MS - (Date.now() - thinkingStartedAt)));
    return () => window.clearTimeout(timer);
  }, [thinkingJobId, thinkingStartedAt]);
  const draftKey = selectedId ?? "blank"; const draft = drafts[draftKey] ?? "";
  const refresh = useCallback(async () => {
    const generation = ++refreshGeneration.current;
    try {
      const result = await listSessions(); if (!mounted.current || generation !== refreshGeneration.current) return;
      setSessions(result.sessions); setStorageBlocked(false); setReady(true);
      return result;
    } catch (error) { if (mounted.current && generation === refreshGeneration.current) { progressEligible.current.clear(); setProgressJobId(null); setNotice(readableError(error)); setStorageBlocked(true); setReady(true); } }
  }, []);
  useEffect(() => {
    mounted.current = true;
    const selectHashChat = () => {
      const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
      const id = hash.get("chat");
      if (isId(id)) setSelectedId(id);
    };
    selectHashChat();
    window.addEventListener("hashchange", selectHashChat);
    window.addEventListener("popstate", selectHashChat);
    void refresh(); const unsubscribe = subscribeSessions(() => { void refresh(); });
    const unsubscribeObserver = subscribeAssistantObserverV1(next => {
      setObserver(next);
      if (next.notice) setNotice(next.notice);
    });
    return () => { mounted.current = false; unsubscribe(); unsubscribeObserver(); window.removeEventListener("hashchange", selectHashChat); window.removeEventListener("popstate", selectHashChat); };
  }, [refresh]);
  useEffect(() => {
    const currentJobs = new Set<string>(); const completed: Record<string, string> = {};
    for (const session of sessions) {
      const turn = session.turns.at(-1); if (!turn) continue;
      currentJobs.add(turn.jobId);
      if (turn.status === "pending") observedPendingJobs.current.add(turn.jobId);
      else if (observedPendingJobs.current.delete(turn.jobId) && turn.status === "done") completed[session.id] = turn.id;
    }
    for (const jobId of observedPendingJobs.current) if (!currentJobs.has(jobId)) observedPendingJobs.current.delete(jobId);
    if (Object.keys(completed).length) setReveal(current => ({ ...current, ...completed }));
  }, [sessions]);
  const select = useCallback((id: string | null) => {
    setSelectedId(id); setReveal({}); setProgressJobId(null); setNotice(""); window.history.replaceState(null, "", `${window.location.pathname}${id ? `#chat=${id}` : ""}`);
  }, []);
  useEffect(() => {
    if (ready && selectedId && !selected && !storageBlocked) { select(null); setNotice("That chat is no longer saved. You can start a new conversation."); }
  }, [ready, selected, selectedId, storageBlocked, select]);
  const send = async () => {
    if (sendGuard.current || storageBlocked || !ready || !draft.trim() || selected?.turns.at(-1)?.status === "pending") return;
    sendGuard.current = true; setBusy(true); setNotice("");
    let created: Session | null = null;
    try {
      const id = selected?.id ?? crypto.randomUUID();
      created = await beginTurn(id, draft, selected?.reasoning ?? blankReasoning, selected);
      refreshGeneration.current++;
      const turn = created.turns.at(-1)!; setAssistantJobPostingV1(turn.jobId, true);
      progressEligible.current.add(turn.jobId);
      setDrafts(current => { const remaining = current[draftKey] === draft ? "" : current[draftKey]; return { ...current, [draftKey]: "", [id]: remaining }; });
      setSessions(current => [created!, ...current.filter(s => s.id !== id)]); select(id);
      if (!navigator.onLine) {
        await commitAssistantInterruptedV1(created, turn.jobId, "Internet connection unavailable. Your question is saved; no answer was requested. Reconnect, then choose Retry.");
        return;
      }
      const response = await fetch("/api/diamond-assistant", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(requestFor(created, turn)), signal: AbortSignal.timeout(15000) });
      if (!response.ok && response.status >= 500) throw new Error("uncertain-submission");
      if (!response.ok) {
        const text = response.status === 429 ? "Two answers are running or the server limit is reached. Your message is saved; try again later." : "This answer could not start. Your message is saved. Nothing was retried.";
        await commitAssistantInterruptedV1(created, turn.jobId, text); setNotice(text);
      } else await acceptAssistantJobSnapshotV1(created, await response.json());
    } catch (error) { setNotice(readableError(error)); }
    finally {
      if (created) setAssistantJobPostingV1(created.turns.at(-1)!.jobId, false);
      await refresh(); sendGuard.current = false; if (mounted.current) setBusy(false);
    }
  };
  const retry = async () => {
    if (sendGuard.current || storageBlocked || !ready || !selected || selected.turns.at(-1)?.status === "pending") return;
    if (!navigator.onLine) { setNotice("Internet connection unavailable. Reconnect, then choose Retry. Nothing was sent."); return; }
    sendGuard.current = true; setBusy(true); setNotice("");
    let prepared: Session | null = null;
    try {
      prepared = await retryTurn(selected);
      refreshGeneration.current++;
      const turn = prepared.turns.at(-1)!; setAssistantJobPostingV1(turn.jobId, true); progressEligible.current.add(turn.jobId);
      setSessions(current => [prepared!, ...current.filter(session => session.id !== prepared!.id)]);
      const response = await fetch("/api/diamond-assistant", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(requestFor(prepared, turn)), signal: AbortSignal.timeout(15000) });
      if (!response.ok && response.status >= 500) throw new Error("uncertain-submission");
      if (!response.ok) await commitAssistantInterruptedV1(prepared, turn.jobId, "This answer could not start. Your question is saved. Nothing was retried automatically.");
      else await acceptAssistantJobSnapshotV1(prepared, await response.json());
    } catch (error) { setNotice(readableError(error)); }
    finally {
      if (prepared) setAssistantJobPostingV1(prepared.turns.at(-1)!.jobId, false);
      await refresh(); sendGuard.current = false; if (mounted.current) setBusy(false);
    }
  };
  const cancel = async () => {
    if (!selected) return; const turn = selected.turns.at(-1); if (turn?.status !== "pending") return;
    progressEligible.current.delete(turn.jobId); setProgressJobId(null);
    try {
      const response = await fetch("/api/diamond-assistant", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify(requestFor(selected, turn)), signal: AbortSignal.timeout(10000) });
      if (response.status === 404) { await commitAssistantInterruptedV1(selected, turn.jobId, "This answer is no longer available. Nothing was resent."); await refresh(); }
      else if (response.ok) await acceptAssistantJobSnapshotV1(selected, await response.json());
      else throw new Error("cancel");
    } catch { setNotice("Cancellation could not be confirmed. Reconnect to check this answer; it may still be running."); }
  };
  return {
    sessions, selected, selectedId, ready, storageBlocked, notice, busy, draft,
    showLongWaitProgress: !!thinkingJobId && progressJobId === thinkingJobId,
    reasoning: selected?.reasoning ?? blankReasoning, live, reveal, pausedJobs,
    setDraft: (value: string) => setDrafts(current => ({ ...current, [draftKey]: value })),
    select, send, retry, cancel,
    newChat: () => { if (sessions.length >= 50 || busy || storageBlocked) return; select(null); setBlankReasoning("medium"); setDrafts(current => ({ ...current, blank: "" })); },
    reasoningChange: async (reasoning: Reasoning) => { if (!selected) setBlankReasoning(reasoning); else try { await setSessionReasoning(selected.id, reasoning); await refresh(); } catch (error) { setNotice(readableError(error)); } },
    rename: async (session: Session, name: string) => { try { await renameSession(session.id, name, session); await refresh(); } catch (error) { await refresh(); throw error; } },
    remove: async (session: Session) => { try { await deleteSession(session); if (selectedId === session.id) select(null); await refresh(); } catch (error) { await refresh(); throw error; } },
    retryConnection: () => { progressEligible.current.clear(); setProgressJobId(null); resumeAssistantObserverV1(); setNotice(""); void refresh(); },
  };
}
