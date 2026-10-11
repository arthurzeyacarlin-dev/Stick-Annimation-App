// SPEC-0020 Phase 1 (dev only): the local test inbox. Until the real email service is connected, account emails
// (password reset) land here instead of being sent. 404 outside development.
import { notFound } from "next/navigation";
import { readAccountMailOutbox } from "@/src/lib/account/accountMail";

export const dynamic = "force-dynamic";

// The link is shown as a path so it opens on whichever address (localhost or 127.0.0.1) this page is on.
const samePagePath = (link: string) => {
  try {
    const url = new URL(link);
    return `${url.pathname}${url.search}`;
  } catch {
    return null;
  }
};

export default function DevMailPage() {
  if (process.env.NODE_ENV !== "development") notFound();
  const mail = readAccountMailOutbox();
  return (
    <main style={{ minHeight: "100vh", padding: "32px 24px", background: "#030914", color: "#f6f9ff", font: "14px/1.55 system-ui, sans-serif" }}>
      <div style={{ maxWidth: 760, margin: "0 auto", display: "grid", gap: 16 }}>
        <div>
          <p style={{ margin: 0, color: "#7895bc", fontSize: 11, fontWeight: 700, letterSpacing: ".12em", textTransform: "uppercase" }}>Developer only</p>
          <h1 style={{ margin: "6px 0 4px", fontSize: 26 }}>Test inbox</h1>
          <p style={{ margin: 0, color: "#a8bddd" }}>Emails the app would send. Nothing here was sent over the internet. Newest first.</p>
        </div>
        {mail.length === 0 && <p style={{ color: "#8fabd0" }}>No emails yet. Try Log in → Forgot password?</p>}
        {mail.map((item) => {
          const path = item.link ? samePagePath(item.link) : null;
          return (
            <article key={`${item.at}-${item.to}`} style={{ padding: 16, border: "1px solid #163058", borderRadius: 12, background: "#071120", display: "grid", gap: 6 }}>
              <strong>{item.subject}</strong>
              <span style={{ color: "#8fabd0", fontSize: 12 }}>To {item.to} · {new Date(item.at).toLocaleString()}</span>
              <p style={{ margin: 0, color: "#c9d6ea", whiteSpace: "pre-wrap" }}>{item.text}</p>
              {path && <a href={path} style={{ color: "#8cbbf3", fontWeight: 700 }}>Open the link</a>}
            </article>
          );
        })}
      </div>
    </main>
  );
}
