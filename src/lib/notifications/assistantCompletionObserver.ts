import {
  ASSISTANT_LIMITS,
  AssistantError,
  requestFor,
  stableJson,
  validateSnapshot,
  type JobSnapshot,
  type Session,
} from "../assistant/assistantContracts.ts";
import {
  finishTurn,
  listSessions,
  recordAccepted,
  subscribeSessions,
} from "../assistant/assistantStorage.ts";
import { publishValidatedNotificationTerminalV1 } from "./notificationStorage.ts";

const POLL_INTERVAL_MS = 450;
const REQUEST_TIMEOUT_MS = 10_000;

export type AssistantObserverSnapshotV1 = Readonly<{
  live: Readonly<Record<string, JobSnapshot>>;
  pausedJobs: readonly string[];
  notice: string;
}>;

let observerSnapshot: AssistantObserverSnapshotV1 = { live: {}, pausedJobs: [], notice: "" };
const listeners = new Set<(snapshot: AssistantObserverSnapshotV1) => void>();
const latest = new Map<string, JobSnapshot>();
const posting = new Set<string>();
const polling = new Map<string, AbortController>();
const paused = new Set<string>();
let rootOwners = 0;
let unsubscribeSessions: (() => void) | null = null;
let scanTimer: ReturnType<typeof setTimeout> | null = null;
let scanInFlight = false;

const readableError = (error: unknown) => error instanceof AssistantError
  ? error.message
  : "The Assistant could not reconnect. Your saved chats are safe. Reconnect checks the same answer; it does not send again.";

const emit = (notice = observerSnapshot.notice) => {
  observerSnapshot = Object.freeze({
    live: Object.freeze(Object.fromEntries(latest)),
    pausedJobs: Object.freeze([...paused]),
    notice,
  });
  for (const listener of listeners) listener(observerSnapshot);
};

export const getAssistantObserverSnapshotV1 = () => observerSnapshot;

export function subscribeAssistantObserverV1(listener: (snapshot: AssistantObserverSnapshotV1) => void) {
  listeners.add(listener);
  listener(observerSnapshot);
  return () => { listeners.delete(listener); };
}

export function setAssistantJobPostingV1(jobId: string, value: boolean) {
  if (value) posting.add(jobId);
  else posting.delete(jobId);
  scheduleScan(0);
}

const rereadExactTerminal = async (sessionId: string, turnId: string, jobId: string) => {
  const session = (await listSessions()).sessions.find(candidate => candidate.id === sessionId);
  const turn = session?.turns.find(candidate => candidate.id === turnId && candidate.jobId === jobId);
  if (!session || !turn || turn.status === "pending" || turn.endedAt === null) return null;
  return { session, turn };
};

const publishExactTerminal = async (sessionId: string, turnId: string, jobId: string) => {
  const source = await rereadExactTerminal(sessionId, turnId, jobId);
  if (!source || source.turn.status === "pending" || source.turn.status === "cancelled") return;
  const outcome = source.turn.status;
  await publishValidatedNotificationTerminalV1({
    schema: "assistant-notification-terminal/v1",
    session: source.session,
    sessionId,
    turnId,
    jobId,
    outcome,
    occurredAt: source.turn.endedAt!,
  });
};

export async function commitAssistantInterruptedV1(session: Session, jobId: string, message: string) {
  const turn = session.turns.find(candidate => candidate.jobId === jobId);
  if (!turn) throw new AssistantError("missing", "This answer does not belong to the saved chat.");
  await finishTurn(session.id, jobId, { interrupted: message });
  await publishExactTerminal(session.id, turn.id, jobId);
  scheduleScan(0);
}

export async function acceptAssistantJobSnapshotV1(session: Session, value: unknown) {
  const turn = session.turns.at(-1);
  if (!turn) throw new AssistantError("missing", "This answer does not belong to the saved chat.");
  const snapshot = validateSnapshot(value, requestFor(session, turn));
  const previous = latest.get(snapshot.jobId);
  if (previous) {
    if (snapshot.events[0].at !== previous.events[0].at && snapshot.status === "cancelled" && snapshot.error === "Answer cancelled before submission. Your message is saved.") {
      await commitAssistantInterruptedV1(session, turn.jobId, "The server restarted before cancellation. Your message is saved; nothing was resent.");
      return true;
    }
    if (snapshot.events.length < previous.events.length) return false;
    if (stableJson(snapshot.events.slice(0, previous.events.length)) !== stableJson(previous.events)) {
      if (snapshot.status === "cancelled" && snapshot.error === "Answer cancelled before submission. Your message is saved.") {
        await commitAssistantInterruptedV1(session, turn.jobId, "The server restarted before cancellation. Your message is saved; nothing was resent.");
        return true;
      }
      throw new AssistantError("invalid", "The answer’s activity sequence could not be verified. Nothing was resent.");
    }
  }
  latest.set(snapshot.jobId, snapshot);
  paused.delete(snapshot.jobId);
  emit("");
  if (!["done", "failed", "cancelled"].includes(snapshot.status)) {
    if (turn.acceptedAt === null) await recordAccepted(session.id, turn.jobId);
    scheduleScan(0);
    return false;
  }
  await finishTurn(session.id, turn.jobId, snapshot);
  await publishExactTerminal(session.id, turn.id, turn.jobId);
  scheduleScan(0);
  return true;
}

const exactPending = async (sessionId: string, turnId: string, jobId: string) => {
  const session = (await listSessions()).sessions.find(candidate => candidate.id === sessionId);
  const turn = session?.turns.find(candidate => candidate.id === turnId && candidate.jobId === jobId);
  return session && turn?.status === "pending" ? { session, turn } : null;
};

const poll = async (initialSession: Session, initialTurn: Session["turns"][number], controller: AbortController) => {
  const { id: sessionId } = initialSession;
  const { id: turnId, jobId } = initialTurn;
  try {
    while (!controller.signal.aborted && rootOwners > 0) {
      const pending = await exactPending(sessionId, turnId, jobId);
      if (!pending) break;
      const response = await fetch(`/api/diamond-assistant?jobId=${encodeURIComponent(jobId)}&sessionId=${encodeURIComponent(sessionId)}`, {
        cache: "no-store",
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(REQUEST_TIMEOUT_MS)]),
      });
      if (response.status === 404) {
        const authoritative = await exactPending(sessionId, turnId, jobId);
        if (!authoritative) break;
        if (authoritative.turn.acceptedAt !== pending.turn.acceptedAt) continue;
        if (authoritative.turn.acceptedAt !== null) {
          await commitAssistantInterruptedV1(authoritative.session, jobId, "This answer was interrupted or the server restarted. Nothing was resent. Send again when ready.");
          break;
        }
        if (Date.now() - authoritative.turn.at > ASSISTANT_LIMITS.deadlineMs + 3_000) {
          const cancellation = await fetch("/api/diamond-assistant", {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(requestFor(authoritative.session, authoritative.turn)),
            signal: AbortSignal.any([controller.signal, AbortSignal.timeout(REQUEST_TIMEOUT_MS)]),
          });
          if (!cancellation.ok) throw new Error("unaccepted-cancel");
          if (await acceptAssistantJobSnapshotV1(authoritative.session, await cancellation.json())) break;
        }
      } else {
        if (!response.ok) throw new Error("assistant-poll-failed");
        if (await acceptAssistantJobSnapshotV1(pending.session, await response.json())) break;
      }
      await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS));
    }
  } catch (error) {
    if (!controller.signal.aborted) {
      paused.add(jobId);
      emit(`${readableError(error)} Reconnect checks this same answer; it does not send again.`);
    }
  } finally {
    polling.delete(jobId);
    scheduleScan(POLL_INTERVAL_MS);
  }
};

async function scan() {
  if (scanInFlight || rootOwners === 0) return;
  scanInFlight = true;
  try {
    const { sessions } = await listSessions();
    for (const session of sessions) {
      const turn = session.turns.at(-1);
      if (!turn || turn.status !== "pending" || posting.has(turn.jobId) || paused.has(turn.jobId) || polling.has(turn.jobId)) continue;
      const controller = new AbortController();
      polling.set(turn.jobId, controller);
      void poll(session, turn, controller);
    }
  } catch (error) {
    emit(readableError(error));
  } finally {
    scanInFlight = false;
  }
}

function scheduleScan(delay = POLL_INTERVAL_MS) {
  if (rootOwners === 0 || scanTimer) return;
  scanTimer = setTimeout(() => {
    scanTimer = null;
    void scan();
  }, delay);
}

export function resumeAssistantObserverV1() {
  paused.clear();
  emit("");
  scheduleScan(0);
}

export function startAssistantCompletionObserverV1() {
  rootOwners += 1;
  if (rootOwners === 1) {
    unsubscribeSessions = subscribeSessions(() => scheduleScan(0));
    scheduleScan(0);
  }
  return () => {
    rootOwners = Math.max(0, rootOwners - 1);
    if (rootOwners > 0) return;
    unsubscribeSessions?.();
    unsubscribeSessions = null;
    if (scanTimer) clearTimeout(scanTimer);
    scanTimer = null;
    for (const controller of polling.values()) controller.abort();
    polling.clear();
  };
}
