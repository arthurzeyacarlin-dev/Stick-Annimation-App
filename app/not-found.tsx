import Link from "next/link";
import { DiamondLogo } from "@/src/components/chrome/DiamondLogo";

// SPEC-0020 Phase 6: the app's own "not found" page. Arthur (2026-10-27): blue glow over a dot grid, a glowing logo and
// a bright Go to Home button (styles: "Not found page" block in app/globals.css).
export default function NotFound() {
  return (
    <main className="da-notfound">
      <div className="da-notfound-card">
        <span className="da-notfound-logo"><DiamondLogo size={56} /></span>
        <p className="da-notfound-code">404</p>
        <h1>This page isn&apos;t here</h1>
        <p>It may have moved, or your account can&apos;t open it.</p>
        <Link href="/" className="da-notfound-home da-super">Go to Home</Link>
      </div>
    </main>
  );
}
