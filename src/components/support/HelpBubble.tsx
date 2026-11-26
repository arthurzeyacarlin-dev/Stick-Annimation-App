"use client";

import { usePathname } from "next/navigation";
import { useCallback, useEffect, useId, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { AssistantConversation } from "@/src/components/assistant/AssistantConversation";
import { AssistantComposer } from "@/src/components/assistant/AssistantComposer";
import { useAssistantSessions } from "@/src/components/assistant/useAssistantSessions";
import { DiamondLogo } from "@/src/components/chrome/DiamondLogo";
import { ReportProblemForm } from "@/src/components/chrome/ReportProblemDialog";
import { CloseButton } from "@/src/components/ui/CloseButton";
import { cleanTicketMessage, OPEN_HELP_EVENT, ticketAreaLabel, TICKET_MESSAGE_MAX } from "@/src/lib/support/supportRules";
import styles from "./HelpBubble.module.css";

// SPEC-0027 (Nov 26, dad: beta users' problems fixed within 1 hour): the help bubble, bottom-right on every signed-in page.
//   Ask AI          — the same Help assistant as /assistant (same chats, same answers, same credits per answer)
//   Talk to a person — free: a ticket in the problem-report inbox; Arthur gets an instant email
//   My messages     — the person's tickets with Arthur's replies; they can answer back. A dot when a reply is unread.
// The panel floats over the page (the canvas never resizes). Not shown on /assistant, which IS the full Help.
type View = "ask" | "person" | "messages";
type MyMessage = { id: string; createdAt: number; kind: "user" | "owner"; text: string };
type MyTicket = { id: string; createdAt: number; text: string; status: string; area: string; hasScreenshot: boolean; lastActivityAt: number; userUnread: boolean; messages: MyMessage[] };

const POLL_MS = 2 * 60 * 1000;
const when = (time: number) => new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(time);
const statusWords = (status: string) => status === "done" ? "Solved" : status === "working" ? "We're on it" : "Sent";

export function HelpBubble() {
  const pathname = usePathname() ?? "/";
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<View>("ask");
  const [everOpened, setEverOpened] = useState(false);
  const [unread, setUnread] = useState(0);
  const panelId = useId();
  const buttonRef = useRef<HTMLButtonElement>(null);

  // The dot: does the person have an unread reply from Arthur? Asked every 2 minutes while the page is visible + on focus.
  const askUnread = useCallback(async () => {
    if (document.hidden) return;
    try {
      const response = await fetch("/api/support/mine?count=1", { cache: "no-store" });
      const body = await response.json() as { unread?: unknown };
      if (response.ok && typeof body.unread === "number") setUnread(body.unread);
    } catch { /* keep the dot as it is */ }
  }, []);
  useEffect(() => {
    const first = window.setTimeout(() => void askUnread(), 0);
    const timer = window.setInterval(() => void askUnread(), POLL_MS);
    const onFocus = () => void askUnread();
    window.addEventListener("focus", onFocus);
    return () => { window.clearTimeout(first); window.clearInterval(timer); window.removeEventListener("focus", onFocus); };
  }, [askUnread]);

  // The editor's Help menu (the bubble steps aside in the editor) opens the panel on a given part.
  useEffect(() => {
    const onOpen = (event: Event) => {
      const want = (event as CustomEvent<unknown>).detail;
      setView(want === "person" || want === "messages" ? want : "ask");
      setEverOpened(true);
      setOpen(true);
    };
    window.addEventListener(OPEN_HELP_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_HELP_EVENT, onOpen);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") { setOpen(false); buttonRef.current?.focus(); } };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (pathname === "/assistant") return null;

  const toggle = () => {
    if (!open) {
      setEverOpened(true);
      if (unread > 0) setView("messages");
    }
    setOpen(!open);
  };

  return (
    <>
      <button ref={buttonRef} type="button" className={styles.bubble} data-open={open ? "true" : "false"} aria-expanded={open} aria-controls={panelId}
        aria-label={unread > 0 ? "Help — you have a new reply" : "Help"} title="Help" onClick={toggle}>
        {open ? <CloseIcon /> : <HelpIcon />}
        {unread > 0 && !open && <span className={styles.dot} aria-hidden="true" />}
      </button>
      {everOpened && (
        <section id={panelId} className={styles.panel} hidden={!open} aria-label="Help">
          <header className={styles.head}>
            <div className={styles.tabs} role="tablist" aria-label="Help">
              <Tab view="ask" current={view} onPick={setView}>Ask AI</Tab>
              <Tab view="person" current={view} onPick={setView}>Talk to a person</Tab>
              <Tab view="messages" current={view} onPick={setView}>My messages{unread > 0 && <span className={styles.tabDot} aria-label=" (new reply)" />}</Tab>
            </div>
            <CloseButton label="Close help" onClick={() => { setOpen(false); buttonRef.current?.focus(); }} />
          </header>
          <div className={styles.body}>
            <div hidden={view !== "ask"} className={styles.askView}><BubbleAsk onPerson={() => setView("person")} /></div>
            {view === "person" && <BubblePerson onSeeMessages={() => setView("messages")} />}
            {view === "messages" && <BubbleMessages onRead={() => setUnread(0)} onPerson={() => setView("person")} />}
          </div>
        </section>
      )}
    </>
  );
}

function Tab({ view, current, onPick, children }: { view: View; current: View; onPick: (view: View) => void; children: React.ReactNode }) {
  return <button type="button" role="tab" aria-selected={view === current} className={styles.tab} onClick={() => onPick(view)}>{children}</button>;
}

/** The Help assistant, small: the same chats as /assistant (a new chat each time the page opens; older chats are on /assistant). */
function BubbleAsk({ onPerson }: { onPerson: () => void }) {
  const chats = useAssistantSessions({ inPage: false });
  return (
    <div className={styles.ask} data-help-bubble-chat>
      <AssistantConversation key={chats.selectedId ?? "blank"} chats={chats} mark={<DiamondLogo />} />
      <AssistantComposer key={`composer:${chats.selectedId ?? "blank"}`} chats={chats} />
      <p className={styles.askFoot}>
        Each AI answer uses credits. <button type="button" className={styles.linkButton} onClick={onPerson}>Talk to a person</button> — free.
        {chats.selected && <> · <button type="button" className={styles.linkButton} onClick={chats.newChat}>New chat</button></>}
        {" · "}<Link href="/assistant" className={styles.link}>Open full Help</Link>
      </p>
    </div>
  );
}

function BubblePerson({ onSeeMessages }: { onSeeMessages: () => void }) {
  const [sent, setSent] = useState(false);
  if (sent) {
    return (
      <div className={styles.thanks} role="status">
        <p><strong>Thanks — your message reached us.</strong></p>
        <p>We&rsquo;ll answer you here (in My messages) and by email as soon as we can.</p>
        <button type="button" className={styles.button} onClick={onSeeMessages}>See my messages</button>
      </div>
    );
  }
  return (
    <div className={styles.person}>
      <p className={styles.lead}>A real person (Arthur, who makes Diamond Animator) reads every message. Free, no credits.</p>
      <ReportProblemForm areaPicker submitLabel="Send to a person" placeholder="What happened? What were you trying to do?" onSent={() => setSent(true)} />
    </div>
  );
}

function BubbleMessages({ onRead, onPerson }: { onRead: () => void; onPerson: () => void }) {
  const [tickets, setTickets] = useState<MyTicket[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/support/mine", { cache: "no-store" });
      const body = await response.json().catch(() => null) as { tickets?: MyTicket[]; error?: string } | null;
      if (!response.ok || !Array.isArray(body?.tickets)) throw new Error(body?.error || "Your messages couldn't be loaded. Try again in a moment.");
      setTickets(body.tickets);
      setError(null);
      if (body.tickets.some((ticket) => ticket.userUnread)) {
        await fetch("/api/support/mine", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: "{}" }).catch(() => null);
      }
      onRead();
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : "Your messages couldn't be loaded.");
    }
  }, [onRead]);
  useEffect(() => { const first = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(first); }, [load]);

  if (error) return <p role="alert" className={styles.error}>{error}</p>;
  if (!tickets) return <p className={styles.muted}>Loading your messages</p>;
  if (tickets.length === 0) {
    return <div className={styles.empty}><p className={styles.muted}>No messages yet.</p><button type="button" className={styles.button} onClick={onPerson}>Talk to a person</button></div>;
  }
  const ticket = tickets.find((item) => item.id === openId);
  if (ticket) return <TicketThread ticket={ticket} onBack={() => setOpenId(null)} onSent={load} />;
  return (
    <ul className={styles.ticketList}>
      {tickets.map((item) => {
        const last = item.messages.at(-1);
        return (
          <li key={item.id}>
            <button type="button" className={styles.ticketRow} onClick={() => setOpenId(item.id)}>
              <span className={styles.ticketTop}>
                <span className={styles.ticketArea}>{ticketAreaLabel(item.area)}</span>
                <span className={styles.ticketStatus} data-status={item.status}>{item.userUnread ? "New reply" : statusWords(item.status)}</span>
              </span>
              <span className={styles.ticketText}>{last ? `${last.kind === "owner" ? "Arthur: " : "You: "}${last.text}` : item.text}</span>
              <span className={styles.ticketWhen}>{when(item.lastActivityAt)}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function TicketThread({ ticket, onBack, onSent }: { ticket: MyTicket; onBack: () => void; onSent: () => Promise<void> }) {
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputId = useId();
  const send = async (event: FormEvent) => {
    event.preventDefault();
    const check = cleanTicketMessage(text);
    if (!check.ok) { setError(check.message); return; }
    setSending(true);
    setError(null);
    try {
      const response = await fetch("/api/support/mine", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reportId: ticket.id, text: check.text }) });
      const body = await response.json().catch(() => null) as { error?: string } | null;
      if (!response.ok) throw new Error(body?.error || "Your message couldn't be sent. Try again in a moment.");
      setText("");
      await onSent();
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : "Your message couldn't be sent.");
    }
    setSending(false);
  };
  return (
    <div className={styles.thread}>
      <button type="button" className={styles.linkButton} onClick={onBack}>‹ All messages</button>
      <p className={styles.threadHead}>{ticketAreaLabel(ticket.area)} · {statusWords(ticket.status)}</p>
      <ol className={styles.messages}>
        <li className={styles.mine}><span className={styles.from}>You · {when(ticket.createdAt)}</span><p>{ticket.text}</p>{ticket.hasScreenshot && <span className={styles.from}>(with a screenshot)</span>}</li>
        {ticket.messages.map((message) => (
          <li key={message.id} className={message.kind === "owner" ? styles.theirs : styles.mine}>
            <span className={styles.from}>{message.kind === "owner" ? "Arthur, Diamond Animator" : "You"} · {when(message.createdAt)}</span>
            <p>{message.text}</p>
          </li>
        ))}
      </ol>
      <form className={styles.replyForm} onSubmit={(event) => void send(event)}>
        <label htmlFor={inputId} className={styles.srOnly}>Your answer</label>
        <textarea id={inputId} className={styles.textarea} rows={3} maxLength={TICKET_MESSAGE_MAX} value={text} placeholder="Write an answer" onChange={(event) => setText(event.target.value)} />
        {error && <p role="alert" className={styles.error}>{error}</p>}
        <button type="submit" className={`${styles.button} ${styles.primary}`} disabled={sending || !text.trim()}>{sending ? "Sending" : "Send"}</button>
      </form>
    </div>
  );
}

function HelpIcon() {
  return (
    <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12a8.5 8.5 0 0 1-12.3 7.6L3 21l1.4-5.4A8.5 8.5 0 1 1 21 12Z" />
      <path d="M9.6 9.4a2.5 2.5 0 0 1 4.8 1c0 1.7-2.4 2.1-2.4 3.4" />
      <path d="M12 16.9h.01" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}
