import "./globals.css";
import "./themes.css";
import "./studio.css";
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { NotificationCenterProvider } from "@/src/components/notifications/NotificationCenterProvider";
import { AccountSessionProvider } from "@/src/components/account/AccountSessionProvider";
import { getServerAccountSession, toAccountPublicUser } from "@/src/lib/account/access";
import { AppearanceSync } from "@/src/components/account/AppearanceSync";
import { parseAppearanceCookie } from "@/src/lib/account/appearance";
import { ChunkReloadGuard } from "@/src/components/chrome/ChunkReloadGuard";
import { PageLoadingMark } from "@/src/components/chrome/PageLoadingMark";
import { ChoicePills } from "@/src/components/chrome/ChoicePills";
import { LearnMode } from "@/src/components/learn/LearnMode";
import { IconNames } from "@/src/components/chrome/IconNames";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Diamond Animator",
  description: "Bring your stories to life. Animation drawn by you or animated by AI, on a timeline you can edit.",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = await getServerAccountSession();
  // One look for everyone: dark with Diamond blue.
  const appearance = parseAppearanceCookie(null); // always the one look; older saved choices are ignored
  return (
    // Browser add-ons (Grammarly, dark-mode, translators, phone browsers) change <html>/<body> before the app starts;
    // that made Next.js show a "didn't match" error. Only these two tags ignore it — the app's own parts still check.
    <html lang="en" data-theme={appearance.theme} data-accent={appearance.accent} suppressHydrationWarning>
      <body
        suppressHydrationWarning
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <AccountSessionProvider user={session ? toAccountPublicUser(session) : null}>
          {session && <AppearanceSync />}
          <NotificationCenterProvider>
            <ChunkReloadGuard />
            {children}
            <PageLoadingMark />
            <ChoicePills />
            {/* The guided tour (it was left out by the redesign; Arthur 2026-10-26 put it back). */}
            <IconNames />
            {session && <LearnMode />}
          </NotificationCenterProvider>
        </AccountSessionProvider>
      </body>
    </html>
  );
}
