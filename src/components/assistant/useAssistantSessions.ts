"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ASSISTANT_LIMITS, AssistantError, isId, requestFor, stableJson, validateSnapshot, type JobSnapshot, type Reasoning, type Session } from "../../lib/assistant/assistantContracts";
import { beginTurn, deleteSession, finishTurn, listSessions, recordAccepted, renameSession, setSessionReasoning, subscribeSessions } from "../../lib/assistant/assistantStorage";

const readableError = (error: unknown) => error instanceof AssistantError ? error.message : "The Assistant could not connect. Your saved chats and unsent draft are kept. Try again when the connection returns.";
export const ASSISTANT_LONG_WAIT_MS = 8000;
export function useAssistantSessions() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [ready, setReady] = useState(false); const [storageBlocked, setStorageBlocked] = useState(false);
  const [notice, setNotice] = useState(""); const [busy, setBusy] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, string>>({}); const [blankReasoning, setBlankReasoning] = useState<Reasoning>("medium");
  const [live, setLive] = useState<Record<string, JobSnapshot>>({}); const [reveal, setReveal] = useState<Record<string, string>>({});
  const [pausedJobs, setPausedJobs] = useState<string[]>([]);
  const [progressJobId, setProgressJobId] = useState<string | null>(null);
  const progressEligible = useRef(new Set<string>()); const progressShown = useRef(new Set<string>());
  const sendGuard = useRef(false); const posting = useRef(new Set<string>()); const polling = useRef(new Set<string>());
  const mounted = useRef(true); const latest = useRef<Record<string, JobSnapshot>>({}); const halted = useRef(new Set<string>());
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
    const id = window.location.hash.startsWith("#chat=") ? window.location.hash.slice(6) : null;
    if (isId(id)) setSelectedId(id);
    void refresh(); const unsubscribe = subscribeSessions(() => { void refresh(); });
    return () => { mounted.current = false; unsubscribe(); };
  }, [refresh]);
  const select = useCallback((id: string | null) => {
    setSelectedId(id); setReveal({}); setProgressJobId(null); setNotice(""); window.history.replaceState(null, "", `${window.location.pathname}${id ? `#chat=${id}` : ""}`);
  }, []);
  useEffect(() => {
    if (ready && selectedId && !selected && !storageBlocked) { select(null); setNotice("That chat is no longer saved. You can start a new conversation."); }
  }, [ready, selected, selectedId, storageBlocked, select]);
  const accept = useCallback(async (session: Session, value: unknown) => {
    const turn = session.turns.at(-1)!; const snapshot = validateSnapshot(value, requestFor(session, turn));
    const previous = latest.current[snapshot.jobId];
    if (previous) {
      if (snapshot.events[0].at !== previous.events[0].at && snapshot.status === "cancelled" && snapshot.error === "Answer cancelled before submission. Your message is saved.") {
        await finishTurn(session.id, turn.jobId, { interrupted: "The server restarted before cancellation. Your message is saved; nothing was resent." }); await refresh(); return true;
      }
      if (snapshot.events.length < previous.events.length) return false;
      if (stableJson(snapshot.events.slice(0, previous.events.length)) !== stableJson(previous.events)) {
        if (snapshot.status === "cancelled" && snapshot.error === "Answer cancelled before submission. Your message is saved.") {
          await finishTurn(session.id, turn.jobId, { interrupted: "The server restarted before cancellation. Your message is saved; nothing was resent." }); await refresh(); return true;
        }
        throw new AssistantError("invalid", "The answer’s activity sequence could not be verified. Nothing was resent.");
      }
    }
    latest.current[snapshot.jobId] = snapshot;
    if (snapshot.status !== "thinking") { progressEligible.current.delete(snapshot.jobId); setProgressJobId(current => current === snapshot.jobId ? null : current); }
    if (mounted.current) setLive(current => ({ ...current, [snapshot.jobId]: snapshot }));
    if (["done", "failed", "cancelled"].includes(snapshot.status)) {
      const saved = await finishTurn(session.id, turn.jobId, snapshot);
      if (mounted.current && saved && snapshot.status === "done") setReveal(current => ({ ...current, [saved.id]: turn.id }));
      await refresh(); return true;
    }
    if (turn.acceptedAt === null) { await recordAccepted(session.id, turn.jobId); await refresh(); }
    return false;
  }, [refresh]);
  useEffect(() => {
    if (storageBlocked) return;
    for (const session of sessions) {
      const turn = session.turns.at(-1);
      if (!turn || turn.status !== "pending" || posting.current.has(turn.jobId) || polling.current.has(turn.jobId) || halted.current.has(turn.jobId)) continue;
      polling.current.add(turn.jobId);
      void (async () => {
        try {
          while (mounted.current) {
            const beforeRequest = (await listSessions()).sessions.find(s => s.id === session.id)?.turns.find(t => t.jobId === turn.jobId);
            if (!beforeRequest || beforeRequest.status !== "pending") { await refresh(); break; }
            const response = await fetch(`/api/diamond-assistant?jobId=${turn.jobId}&sessionId=${session.id}`, { cache: "no-store", signal: AbortSignal.timeout(10000) });
            if (response.status === 404) {
              const authoritative = await listSessions(); const latestTurn = authoritative.sessions.find(s => s.id === session.id)?.turns.find(t => t.jobId === turn.jobId);
              if (!latestTurn || latestTurn.status !== "pending") { await refresh(); break; }
              if (latestTurn.acceptedAt !== beforeRequest.acceptedAt) continue;
              if (latestTurn.acceptedAt !== null) { await finishTurn(session.id, turn.jobId, { interrupted: "This answer was interrupted or the server restarted. Nothing was resent. Send again when ready." }); await refresh(); break; }
              // A prepared turn can be visible to other tabs before its one POST arrives.
              // After its deadline, install a cancellation tombstone before locally settling it.
              if (Date.now() - turn.at > ASSISTANT_LIMITS.deadlineMs + 3000) {
                const cancellation = await fetch("/api/diamond-assistant", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify(requestFor(session, turn)), signal: AbortSignal.timeout(10000) });
                if (!cancellation.ok) throw new Error("unaccepted-cancel");
                if (await accept(session, await cancellation.json())) break;
              }
              await new Promise(resolve => setTimeout(resolve, 450)); continue;
            }
            if (!response.ok) throw new Error("poll");
            if (await accept(session, await response.json())) break;
            await new Promise(resolve => setTimeout(resolve, 450));
          }
        } catch (error) {
          halted.current.add(turn.jobId);
          progressEligible.current.delete(turn.jobId); setProgressJobId(current => current === turn.jobId ? null : current);
          if (mounted.current) { setNotice(`${readableError(error)} Reconnect checks this same answer; it does not send again.`); setPausedJobs([...halted.current]); }
        } finally { polling.current.delete(turn.jobId); }
      })();
    }
  }, [sessions, storageBlocked, accept, refresh]);
  const send = async () => {
    if (sendGuard.current || storageBlocked || !ready || !draft.trim() || selected?.turns.at(-1)?.status === "pending") return;
    sendGuard.current = true; setBusy(true); setNotice("");
    let created: Session | null = null;
    try {
      const id = selected?.id ?? crypto.randomUUID();
      created = await beginTurn(id, draft, selected?.reasoning ?? blankReasoning, selected);
      refreshGeneration.current++;
      const turn = created.turns.at(-1)!; posting.current.add(turn.jobId);
      progressEligible.current.add(turn.jobId);
      setDrafts(current => { const remaining = current[draftKey] === draft ? "" : current[draftKey]; return { ...current, [draftKey]: "", [id]: remaining }; });
      setSessions(current => [created!, ...current.filter(s => s.id !== id)]); select(id);
      const response = await fetch("/api/diamond-assistant", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(requestFor(created, turn)), signal: AbortSignal.timeout(15000) });
      if (!response.ok && response.status >= 500) throw new Error("uncertain-submission");
      if (!response.ok) {
        const text = response.status === 429 ? "Two answers are running or the server limit is reached. Your message is saved; try again later." : "This answer could not start. Your message is saved. Nothing was retried.";
        await finishTurn(id, turn.jobId, { interrupted: text }); setNotice(text);
      } else await accept(created, await response.json());
    } catch (error) { setNotice(readableError(error)); }
    finally {
      if (created) posting.current.delete(created.turns.at(-1)!.jobId);
      await refresh(); sendGuard.current = false; if (mounted.current) setBusy(false);
    }
  };
  const cancel = async () => {
    if (!selected) return; const turn = selected.turns.at(-1); if (turn?.status !== "pending") return;
    progressEligible.current.delete(turn.jobId); setProgressJobId(null);
    try {
      const response = await fetch("/api/diamond-assistant", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify(requestFor(selected, turn)), signal: AbortSignal.timeout(10000) });
      if (response.status === 404) { await finishTurn(selected.id, turn.jobId, { interrupted: "This answer is no longer available. Nothing was resent." }); await refresh(); }
      else if (response.ok) await accept(selected, await response.json());
      else throw new Error("cancel");
    } catch { setNotice("Cancellation could not be confirmed. Reconnect to check this answer; it may still be running."); }
  };
  return {
    sessions, selected, selectedId, ready, storageBlocked, notice, busy, draft,
    showLongWaitProgress: !!thinkingJobId && progressJobId === thinkingJobId,
    reasoning: selected?.reasoning ?? blankReasoning, live, reveal, pausedJobs,
    setDraft: (value: string) => setDrafts(current => ({ ...current, [draftKey]: value })),
    select, send, cancel,
    newChat: () => { if (sessions.length >= 50 || busy || storageBlocked) return; select(null); setBlankReasoning("medium"); setDrafts(current => ({ ...current, blank: "" })); },
    reasoningChange: async (reasoning: Reasoning) => { if (!selected) setBlankReasoning(reasoning); else try { await setSessionReasoning(selected.id, reasoning); await refresh(); } catch (error) { setNotice(readableError(error)); } },
    rename: async (session: Session, name: string) => { try { await renameSession(session.id, name, session); await refresh(); } catch (error) { await refresh(); throw error; } },
    remove: async (session: Session) => { try { await deleteSession(session); if (selectedId === session.id) select(null); await refresh(); } catch (error) { await refresh(); throw error; } },
    retryConnection: () => { progressEligible.current.clear(); setProgressJobId(null); halted.current.clear(); setPausedJobs([]); setNotice(""); void refresh(); },
  };
}
