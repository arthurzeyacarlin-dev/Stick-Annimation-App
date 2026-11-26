# SPEC-0027 — Help bubble, tickets, alerts, Claude ticket access, status page (Nov 26)

Status: BUILT in worktree modest-keller-7ed79f (Arthur's "program" 09:48, relayed by dad's session; dad "Start all 3" 09:52).
Not committed — reaches the live server only through "Website pm" after Arthur's review.
Asked by: dad (Nov 26 09:03): beta users' problems fixed within 1 hour.

## Goal (in one line)
Anyone signed in can get help from a bubble in the corner; if the AI can't help, they talk to Arthur; Arthur hears about it
at once, answers from /reports, the person sees the answer in the bubble and by email; Claude can read tickets on a schedule;
a status page + banner say "We're fixing X" and then "Resolved".

## What changes
1. **Help bubble** (new `src/components/support/HelpBubble.tsx`, mounted once in `app/layout.tsx` for signed-in people).
   - Round button bottom-right. Opens a panel with two parts:
     - **Ask** — the same Help assistant as `/assistant` (same chats, same answers, same credits per answer; it reuses
       `useAssistantSessions`, `AssistantConversation`, `AssistantComposer`). "Open full Help" link.
     - **Talk to a person** — always visible in the panel, free (no credits). One picker "What's it about?" (Sign-in &
       account · AI Animator · Saving & opening projects · Payments & credits · Something else), what happened, optional
       screenshot. It saves a ticket in the EXISTING problem-report store (same table, same 5-per-hour limit).
       The form is the existing Report a Problem form, moved into one shared piece used by both the menu dialog and the bubble.
     - **My messages** — the person's own tickets with Arthur's replies; they can answer back in the same ticket.
       A dot on the bubble when Arthur has replied and they haven't read it.
   - Not shown on `/assistant` (it IS the full Help). **In the editor it steps aside** (every corner holds a tool or the
     timeline — tested on computer and phone); the editor's Help menu gets "Talk to a person", which opens the same panel.
     Phone/tablet: the panel is a bottom sheet, the button sits above the bottom tab bar and hides while typing elsewhere.
2. **Replies.** `/reports` gets, per ticket: the conversation, a reply box ("Send reply"), private notes, Claude's draft
   ("Use this draft"), status New / Working / Done. Sending a reply shows it in the person's bubble AND emails them through
   the existing sender (`sendAccountMail`, Resend online, the test inbox `/dev/mail` locally).
3. **Instant alert.** Every new ticket and every answer-back emails the owner at once (subject "New ticket: <name> — <first
   words>", link to /reports). The existing bell stays. New setting `SUPPORT_ALERT_TO` (optional, extra addresses, e.g. dad).
4. **Ticket API for a Claude routine** (`/api/support/tickets…`). Only works with `Authorization: Bearer <DIAMOND_SUPPORT_API_KEY>`
   (new server setting; name only in `deploy/server-settings.example`; no setting = the API is switched off, answers 404).
   It can: list tickets, read one (with its conversation and screenshot), add a private note, set status, post a reply
   DRAFT, set the app status. It can NOT send anything to a user — Arthur presses Send. Plus `docs/SUPPORT_ROUTINE.md`:
   the ready text for the scheduled Claude routine (set up after it is live, with Arthur's OK).
5. **Status page + banner.** Public `/status` (works signed out — people who can't sign in must see it): Sign-in,
   AI Animator, Saving, Payments, each "Working" / "Checking reports" / "We're fixing it" / "Resolved". A thin banner on every
   page while something is not Working ("We're fixing a problem with the AI Animator. Your work is safe." → "Resolved: …",
   closable, gone after 2 h). Set by the owner on `/reports` (one row per area: Problem / Resolved) or by the ticket API.
   **Suspected outage:** 3+ tickets from 3 different people about the same area within 30 min → that area shows "Checking
   reports" and the owner gets an urgent email (once per 2 h per area). It clears by itself when the reports stop.
   (The DigitalOcean uptime check keeps covering "the whole server is down" — then this page is down too.)
6. **The red 404** for non-owners: the layout passes "is owner: yes/no" to the bell, so only the owner's browser asks
   `/api/account/problem-reports?summary=1`. Nobody else asks at all.

7. **AI Animator line alert** (added by dad, 09:55): when anyone waits more than 3 minutes in the AI Animator line, the owner
   gets ONE email per wait episode (no more while the line stays long; never within 30 min). It only READS the line (one read-only `lineWait()` in `v1AnimatorCore.ts`, checked
   every 30 s from `v1AnimatorServer.ts`); what is made, and in which order, is unchanged.

Data: new tables in the SAME `problem-reports.sqlite` (ticket messages, who read what, app status). The old reports table only
gets 2 new columns (area, last activity); old reports keep working as tickets.

## What does NOT change
Sign-in / sign-up, account ownership, saving, the AI Animator (making/editing), the Help assistant's answers, price and
credits code, drawing / export engines, money. The menu's "Report a Problem" still works the same (it now also lands as a
ticket). No new paid service.

## How it is tested
- New unit tests (`node --test`): ticket thread store, API key check (wrong/missing key refused, timing-safe), suspected-outage
  rule (3 people / 30 min / same area; 3 tickets from 1 person does not count), status + 2-hour "Resolved".
- Type check + all existing tests.
- Real app, ONE local dev server (asked first): as a test user open the bubble on Home, editor, phone size; send a ticket;
  as owner see the alert in `/dev/mail`, reply on /reports; the user sees the reply + dot + email; answer back; API with
  curl (wrong key → 404, right key → list/note/status/draft); 3 tickets from 3 test users → "Checking reports" + alert;
  set "We're fixing" → banner, "Resolved" → banner; `/status` signed out; no red 404 as a non-owner.
- AI part of the bubble: ONE real Help question (about 1 credit, a fraction of a cent) — only with a yes first.
- Honest time: about 2 hours to build + 30 min testing, in one go.

## Tested (Nov 26, 10:13–10:20, one local dev server, real email OFF, AI Animator OFF)
- Normal user: no `?summary=1` request, no red 404. Bubble opens; "Talk to a person" ticket sent ("Saving"); thanks screen.
- 3 different people about Saving → status "Checking reports" + banner + ONE urgent email; a 4th ticket → no second urgent email.
- Every ticket and every answer-back → owner alert email (test inbox /dev/mail).
- Owner /reports: "We're fixing it" + words → banner on every page; Answer → reply shown in the person's bubble (red dot, My
  messages), emailed to them; their answer → back to New + owner email. Ticket API: no/wrong key 404; note/draft/status OK;
  "reply" refused; status "Resolved" via the key → "Resolved" banner. /status works signed out.
- Phone size: bubble above the tab bar, bottom sheet; editor (phone + computer): bubble steps aside, Help → Talk to a person works.
- Menu "Report a Problem" window unchanged. "Ask AI" in the bubble reaches the Help assistant route (this test server has no
  AI key, so it answered "not configured"; the one real paid Help question is for the server after deploy).
- Type check clean; lint 0 new errors; tests: supportRules 8/8, ticketStore 2/2, problemReports 7/7.
- Not runnable on this Mac (before and after the change): the AI Animator test files (they need engine books that aren't here).
