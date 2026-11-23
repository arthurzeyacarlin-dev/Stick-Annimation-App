"use client";

import Link from "next/link";
import { DiamondLogo } from "@/src/components/chrome/DiamondLogo";

// (Nov 23) the app's own "something broke" page, in the same look as the 404 page (app/globals.css "Not found page" block),
// so a rare crash never shows a blank screen. Saved projects live in the account, so they are safe.
export default function AppError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="da-notfound">
      <div className="da-notfound-card">
        <span className="da-notfound-logo"><DiamondLogo size={56} /></span>
        <p className="da-notfound-code">Oops</p>
        <h1>Something went wrong here</h1>
        <p>Your saved projects are safe. Try again, or go back to Home.</p>
        <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
          <button type="button" className="da-notfound-home da-super" style={{ border: 0, cursor: "pointer", font: "inherit", fontSize: 15, fontWeight: 700 }} onClick={() => reset()}>Try again</button>
          <Link href="/" className="da-notfound-home da-notfound-quiet">Go to Home</Link>
        </div>
      </div>
    </main>
  );
}
