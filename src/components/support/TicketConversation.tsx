"use client";

import { useCallback, useEffect, useId, useState, type FormEvent } from "react";
import { cleanTicketMessage, TICKET_MESSAGE_MAX, type TicketMessageKind } from "@/src/lib/support/supportRules";
import styles from "./ProblemReportsScreen.module.css";

// SPEC-0027 (Nov 26): one ticket's conversation in the owner's inbox. "Send reply" = the person sees it in their help bubble
// AND gets it by email. "Private note" = only here. A draft from Claude (the ticket API) can be used (it fills the box,
// Arthur still reads and presses Send) or thrown away.
type Message = { id: string; createdAt: number; kind: TicketMessageKind; author: string; text: string };
type Ticket = { id: string; status: string; messages: Message[] };

const when = (time: number) => new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(time);
const LABEL: Record<TicketMessageKind, string> = { user: "", owner: "Reply sent", note: "Private note", draft: "Draft from Claude" };

export function TicketConversation({ reportId, reporter, onChanged }: { reportId: string; reporter: string; onChanged: (status: string) => void }) {
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const boxId = useId();
  const url = `/api/account/problem-reports/${encodeURIComponent(reportId)}`;

  const load = useCallback(async () => {
    try {
      const response = await fetch(url, { cache: "no-store" });
      const body = await response.json().catch(() => null) as { ticket?: Ticket; error?: string } | null;
      if (!response.ok || !body?.ticket) throw new Error(body?.error || "The conversation couldn't be loaded.");
      setTicket(body.ticket);
      setError(null);
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : "The conversation couldn't be loaded.");
    }
  }, [url]);
  useEffect(() => { const first = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(first); }, [load]);

  const post = async (payload: Record<string, unknown>) => {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const body = await response.json().catch(() => null) as { ticket?: Ticket; error?: string } | null;
      if (!response.ok) throw new Error(body?.error || "That couldn't be saved. Try again.");
      if (body?.ticket) { setTicket(body.ticket); onChanged(body.ticket.status); } else await load();
      setBusy(false);
      return true;
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : "That couldn't be saved. Try again.");
      setBusy(false);
      return false;
    }
  };

  const send = async (action: "reply" | "note", event?: FormEvent) => {
    event?.preventDefault();
    const check = cleanTicketMessage(text);
    if (!check.ok) { setError(check.message); return; }
    if (await post({ action, text: check.text })) setText("");
  };

  return (
    <div className={styles.thread}>
      {error && <p role="alert" className={styles.error}>{error}</p>}
      {!ticket && !error && <p className={styles.muted}>Loading the conversation</p>}
      {ticket && ticket.messages.length > 0 && (
        <ol className={styles.threadList}>
          {ticket.messages.map((message) => (
            <li key={message.id} className={styles.threadItem} data-kind={message.kind}>
              <span className={styles.threadWho}>
                {message.kind === "user" ? reporter : `${LABEL[message.kind]} · ${message.author}`} · {when(message.createdAt)}
              </span>
              <p className={styles.text}>{message.text}</p>
              {message.kind === "draft" && (
                <span className={styles.actions}>
                  <button type="button" className={styles.button} disabled={busy} onClick={() => setText(message.text)}>Use this draft</button>
                  <button type="button" className={styles.button} disabled={busy} onClick={() => void post({ action: "discard-draft", id: message.id })}>Throw away</button>
                </span>
              )}
            </li>
          ))}
        </ol>
      )}
      {ticket && (
        <form className={styles.replyForm} onSubmit={(event) => void send("reply", event)}>
          <label htmlFor={boxId} className={styles.replyLabel}>Answer {reporter}</label>
          <textarea id={boxId} className={styles.textarea} rows={4} maxLength={TICKET_MESSAGE_MAX} value={text} onChange={(event) => setText(event.target.value)}
            placeholder="They see this in their help bubble and get it by email." />
          <span className={styles.actions}>
            <button type="submit" className={`${styles.button} ${styles.primary}`} disabled={busy || !text.trim()}>{busy ? "Sending" : "Send reply"}</button>
            <button type="button" className={styles.button} disabled={busy || !text.trim()} onClick={() => void send("note")}>Save as private note</button>
          </span>
        </form>
      )}
    </div>
  );
}
