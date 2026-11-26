import { notFound } from "next/navigation";
import { AppChrome } from "@/src/components/chrome/AIcreditspage";
import { TestimonialsScreen } from "@/src/components/testimonials/TestimonialsScreen";
import { getServerAccountSession } from "@/src/lib/account/access";
import { isOwnerEmail } from "@/src/lib/account/owner";

// SPEC-0029: the owner's testimonials (approve, hide, export the Wall of Love). Anyone else (or signed out) gets "not found".
export const dynamic = "force-dynamic";

export default async function TestimonialsPage() {
  const session = await getServerAccountSession();
  if (!session || !isOwnerEmail(session.user.email)) notFound();
  return (
    <div className="da-polished-page" style={{ minHeight: "100vh", background: "var(--da-page)", color: "var(--da-text)" }}>
      <AppChrome page="dashboard" />
      <TestimonialsScreen />
    </div>
  );
}
