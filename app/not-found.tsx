import { BackButton } from "@/src/components/ui/BackButton";
import { DiamondLogo } from "@/src/components/chrome/DiamondLogo";

// SPEC-0020 Phase 6: the app's own "not found" page (was Next.js's plain black 404).
export default function NotFound() {
  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24, background: "var(--da-page)", color: "var(--da-text)" }}>
      <div style={{ position: "fixed", top: 20, left: 24 }}><BackButton href="/">Back to Home</BackButton></div>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, maxWidth: 380, textAlign: "center" }}>
        <DiamondLogo size={40} />
        <h1 style={{ margin: "8px 0 0", fontSize: 26, fontWeight: 740, letterSpacing: "-0.03em" }}>This page isn&apos;t here</h1>
        <p style={{ margin: 0, color: "var(--da-text-3)", fontSize: 15, lineHeight: 1.55 }}>
          It may have moved, or your account can&apos;t open it. Use the arrow to go back to Home.
        </p>
      </div>
    </main>
  );
}
