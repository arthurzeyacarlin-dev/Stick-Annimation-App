import { ASSISTANT_LIMITS, AssistantError, byteSize, insist, isReasoning, normalizeText, normalizeTitle, recentContext, sealSession, stableJson, validateSession, validateSnapshot, requestFor, type JobSnapshot, type Reasoning, type Session } from "./assistantContracts.ts";

export const ASSISTANT_DB = "diamond-assistant-session-v1";
const STORE = "sessions";
const LOCK = "diamond-assistant-write-v1";
const CHANNEL = "diamond-assistant-invalidation-v1";
const LEASE_MS = 5000;
type RawRow = { key: IDBValidKey; value: unknown };
export type SessionList = { sessions: Session[]; issues: string[] };
type Lease = { owner: string; expires: number };
const storageError = (error: unknown) => error instanceof AssistantError ? error : new AssistantError("storage", error instanceof DOMException && error.name === "QuotaExceededError" ? "Local storage is full. Your previous chats are safe. Free space, then try again." : "Local chat storage is unavailable. Your last readable chats and draft are kept here. Try again when storage is available.");
function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    let blocked = false;
    const request = indexedDB.open(ASSISTANT_DB, 1);
    request.onupgradeneeded = () => { const db = request.result; db.createObjectStore(STORE, { keyPath: "id" }); db.createObjectStore("leases"); };
    request.onerror = () => reject(storageError(request.error));
    request.onblocked = () => { blocked = true; reject(new AssistantError("blocked", "Another tab is blocking local chats. Close its old Assistant page and try again.")); };
    request.onsuccess = () => { const db = request.result; if (blocked) { db.close(); return; } db.onversionchange = () => db.close(); resolve(db); };
  });
}
function readRows(db: IDBDatabase): Promise<RawRow[]> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly"); const store = tx.objectStore(STORE);
    const values = store.getAll(); const keys = store.getAllKeys();
    tx.oncomplete = () => resolve(values.result.map((value, i) => ({ key: keys.result[i], value })));
    tx.onabort = tx.onerror = () => reject(storageError(tx.error));
  });
}
async function inspectRows(rows: RawRow[]): Promise<SessionList> {
  const sessions: Session[] = []; const issues: string[] = [];
  for (const row of rows) {
    try { const session = await validateSession(row.value); insist(row.key === session.id); sessions.push(session); }
    catch { issues.push("A saved chat could not be verified. Its original data is preserved. Changes are blocked to protect your chats."); }
  }
  const reserved = sessions.reduce((sum, s) => sum + byteSize(s) + (s.turns.at(-1)?.status === "pending" ? ASSISTANT_LIMITS.replyReserveBytes : 0), 0);
  if (rows.length > ASSISTANT_LIMITS.sessions || reserved > ASSISTANT_LIMITS.databaseBytes) issues.push("Saved chats exceed the supported storage limit. Data is preserved; changes are blocked.");
  return { sessions: sessions.sort((a, b) => b.updatedAt - a.updatedAt || a.id.localeCompare(b.id)), issues };
}
async function leaseChange(db: IDBDatabase, owner: string, action: "claim" | "release") {
  return new Promise<boolean>((resolve, reject) => {
    const tx = db.transaction("leases", "readwrite"); const store = tx.objectStore("leases"); const request = store.get(LOCK); let acquired = false;
    request.onsuccess = () => {
      const current = request.result as Lease | undefined;
      if (action === "release") { if (current?.owner === owner) store.delete(LOCK); }
      else if (!current || current.owner === owner || current.expires <= Date.now()) { store.put({ owner, expires: Date.now() + LEASE_MS }, LOCK); acquired = true; }
    };
    tx.oncomplete = () => resolve(acquired); tx.onabort = tx.onerror = () => reject(storageError(tx.error));
  });
}
async function coordinated<T>(db: IDBDatabase, run: (owner: string | null) => Promise<T>): Promise<T> {
  if (typeof navigator !== "undefined" && navigator.locks) return navigator.locks.request(LOCK, { mode: "exclusive" }, () => run(null));
  const owner = crypto.randomUUID();
  insist(await leaseChange(db, owner, "claim"), "busy", "Another tab is saving a chat. Try again in a moment.");
  // Final commit checks the lease in its own transaction; an expired/suspended holder cannot publish.
  const heartbeat = setInterval(() => { void leaseChange(db, owner, "claim").catch(() => {}); }, LEASE_MS / 3);
  try { return await run(owner); }
  finally { clearInterval(heartbeat); await leaseChange(db, owner, "release").catch(() => {}); }
}
function commit(db: IDBDatabase, observed: RawRow[], next: Session | null, targetId: string, leaseOwner: string | null): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORE, "leases"], "readwrite"); const store = tx.objectStore(STORE);
    const values = store.getAll(); const keys = store.getAllKeys(); const lease = tx.objectStore("leases").get(LOCK); let failure: unknown;
    lease.onsuccess = () => {
      try {
        const current = values.result.map((value, i) => ({ key: keys.result[i], value }));
        insist(stableJson(current) === stableJson(observed), "conflict", "This chat changed in another tab. Reloaded chats are authoritative; try your action again.");
        if (leaseOwner) insist(lease.result?.owner === leaseOwner && lease.result.expires > Date.now(), "lease", "Another tab took over saving. Your previous chat is safe; try again.");
        if (next) store.put(next); else store.delete(targetId);
      } catch (error) { failure = error; tx.abort(); }
    };
    tx.oncomplete = () => resolve(); tx.onabort = tx.onerror = () => reject(storageError(failure ?? tx.error));
  });
}
function notify() {
  try { if (typeof BroadcastChannel !== "undefined") { const channel = new BroadcastChannel(CHANNEL); try { channel.postMessage("reread"); } finally { channel.close(); } } } catch { /* Invalidation is only a hint. Never report an already committed write as failed. */ }
}
export function subscribeSessions(onChange: () => void) {
  let channel: BroadcastChannel | null = null;
  try { if (typeof BroadcastChannel !== "undefined") channel = new BroadcastChannel(CHANNEL); } catch { /* Focus/visibility/periodic rereads remain authoritative when channels are blocked. */ }
  if (channel) channel.onmessage = () => onChange();
  const visible = () => { if (document.visibilityState === "visible") onChange(); };
  window.addEventListener("focus", onChange); document.addEventListener("visibilitychange", visible);
  // Periodic authoritative reread also covers browsers without BroadcastChannel.
  const interval = window.setInterval(visible, 3000);
  return () => { channel?.close(); window.removeEventListener("focus", onChange); document.removeEventListener("visibilitychange", visible); clearInterval(interval); };
}
export async function listSessions(): Promise<SessionList> {
  let db: IDBDatabase | undefined;
  try { db = await openDatabase(); return await inspectRows(await readRows(db)); }
  catch (error) { throw storageError(error); }
  finally { db?.close(); }
}
async function mutate(targetId: string, update: (current: Session | undefined, all: Session[]) => Session | null | Promise<Session | null>): Promise<Session | null> {
  let db: IDBDatabase | undefined;
  try {
    db = await openDatabase();
    const connection = db;
    const result = await coordinated(connection, async owner => {
      const rows = await readRows(connection); const { sessions, issues } = await inspectRows(rows);
      insist(!issues.length, "corrupt", issues[0]);
      const current = sessions.find(s => s.id === targetId);
      const draft = await update(current ? structuredClone(current) : undefined, sessions);
      if (draft && current && stableJson(draft) === stableJson(current)) return current;
      const next = draft ? await sealSession({ ...draft, revision: (current?.revision ?? 0) + 1, updatedAt: Math.max(Date.now(), current?.updatedAt ?? 0), digest: "" }) : null;
      if (next) await validateSession(next);
      const others = sessions.filter(s => s.id !== targetId);
      insist(others.length + (next ? 1 : 0) <= ASSISTANT_LIMITS.sessions, "capacity", "You have 50 saved chats. Delete a chat before creating another.");
      const total = [...others, ...(next ? [next] : [])].reduce((sum, s) => sum + byteSize(s) + (s.turns.at(-1)?.status === "pending" ? ASSISTANT_LIMITS.replyReserveBytes : 0), 0);
      insist(total <= ASSISTANT_LIMITS.databaseBytes, "capacity", "Local chats have reached the 32 MiB limit. Delete a chat to make space. Nothing was removed.");
      await commit(connection, rows, next, targetId, owner); return next;
    });
    notify(); return result;
  } catch (error) { throw storageError(error); }
  finally { db?.close(); }
}
export async function beginTurn(sessionId: string, text: string, reasoning: Reasoning, expected: Pick<Session, "revision" | "digest"> | null): Promise<Session> {
  return (await mutate(sessionId, current => {
    insist(isReasoning(reasoning)); const message = normalizeText(text);
    insist(message.length > 0 && message.length <= ASSISTANT_LIMITS.userChars, "message", "Please enter a message of up to 12,000 characters.");
    insist(expected ? current?.revision === expected.revision && current.digest === expected.digest : !current, "conflict", "This chat changed in another tab. Review the latest conversation and send again.");
    const now = Math.max(Date.now(), current?.updatedAt ?? 0);
    const session: Session = current ?? { schema: "diamond-assistant-session/v1", id: sessionId, title: "Untitled chat", titleSource: "automatic", manualTitleRevision: 0, createdAt: now, updatedAt: now, reasoning, revision: 0, digest: "", messages: [], turns: [] };
    insist(session.turns.at(-1)?.status !== "pending", "active", "This chat is still answering. Cancel or wait before sending another message.");
    insist(session.messages.length + 2 <= ASSISTANT_LIMITS.messages, "capacity", "This chat has reached its message limit. Start a new chat to continue.");
    const contextIds = recentContext(session.messages).map(m => m.id); const turnId = crypto.randomUUID();
    session.messages.push({ id: crypto.randomUUID(), turnId, role: "user", text: message, at: now });
    session.turns.push({ id: turnId, jobId: crypto.randomUUID(), status: "pending", reasoning, at: now, acceptedAt: null, endedAt: null, contextIds, error: null, usage: null });
    session.reasoning = reasoning; return session;
  }))!;
}
export async function recordAccepted(sessionId: string, jobId: string) {
  return mutate(sessionId, current => {
    insist(current); const turn = current.turns.find(t => t.jobId === jobId); insist(turn);
    if (turn.status === "pending" && turn.acceptedAt === null) turn.acceptedAt = Math.max(Date.now(), current.updatedAt);
    return current;
  });
}
export async function finishTurn(sessionId: string, jobId: string, terminal: JobSnapshot | { interrupted: string }): Promise<Session | null> {
  return mutate(sessionId, current => {
    insist(current, "missing", "This chat is no longer available."); const turn = current.turns.find(t => t.jobId === jobId);
    insist(turn, "missing", "This answer does not belong to the saved chat.");
    if (turn.status !== "pending") return current;
    const now = Math.max(Date.now(), current.updatedAt);
    if ("interrupted" in terminal) { turn.status = "interrupted"; turn.error = terminal.interrupted; }
    else {
      validateSnapshot(terminal, requestFor(current, turn)); insist(["done", "failed", "cancelled"].includes(terminal.status));
      if (terminal.status === "done") {
        current.messages.push({ id: `${turn.id}_answer`, turnId: turn.id, role: "assistant", text: terminal.result!.reply.answer, at: now });
        turn.status = "done"; turn.usage = terminal.result!.usage;
        if (current.titleSource === "automatic" && current.title === "Untitled chat") current.title = terminal.result!.reply.title;
      } else { turn.status = terminal.status as "failed" | "cancelled"; turn.error = terminal.error; }
    }
    turn.endedAt = now; return current;
  });
}
export async function renameSession(id: string, title: string, expected: Pick<Session, "manualTitleRevision">) {
  return mutate(id, current => {
    insist(current && current.manualTitleRevision === expected.manualTitleRevision, "conflict", "This chat was renamed in another tab. Review its current name and try again.");
    const normalized = normalizeTitle(title); insist(Array.from(normalized).length >= 1 && Array.from(normalized).length <= 80, "title", "Use a chat name between 1 and 80 characters.");
    current.title = normalized; current.titleSource = "manual"; current.manualTitleRevision = current.revision + 1; return current;
  });
}
export async function setSessionReasoning(id: string, reasoning: Reasoning) {
  return mutate(id, current => { insist(current && isReasoning(reasoning)); current.reasoning = reasoning; return current; });
}
export async function deleteSession(expected: Pick<Session, "id" | "revision" | "digest">) {
  return mutate(expected.id, current => {
    insist(current && current.revision === expected.revision && current.digest === expected.digest, "conflict", "This chat changed after you opened the confirmation. Check it and confirm deletion again.");
    insist(current.turns.at(-1)?.status !== "pending", "active", "Cancel this chat’s active answer and wait for it to stop before deleting it."); return null;
  });
}
