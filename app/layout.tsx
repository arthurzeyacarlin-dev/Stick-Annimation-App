import "./globals.css";
import "./themes.css";
import type { Metadata } from "next";
import { Geist, Geist_Mono, Plus_Jakarta_Sans } from "next/font/google";
import { ScrollbarActivity } from "./ScrollbarActivity";
import { NotificationCenterProvider } from "@/src/components/notifications/NotificationCenterProvider";
import { AccountSessionProvider } from "@/src/components/account/AccountSessionProvider";
import { getServerAccountSession, toAccountPublicUser } from "@/src/lib/account/access";
import { cookies } from "next/headers";
import { AppearanceSync } from "@/src/components/account/AppearanceSync";
import { APPEARANCE_COOKIE, parseAppearanceCookie } from "@/src/lib/account/appearance";
import { ChunkReloadGuard } from "@/src/components/chrome/ChunkReloadGuard";
import { PageLoadingMark } from "@/src/components/chrome/PageLoadingMark";
import { SlidingSelection } from "@/src/components/chrome/SlidingSelection";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

// Redesign: the heading font used across the new screens.
const display = Plus_Jakarta_Sans({ subsets: ["latin"], weight: ["600", "700", "800"], variable: "--font-display" });

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Diamond Animator",
  description: "Bring your stories to life. Stick figure animation, drawn by you or animated by AI.",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = await getServerAccountSession();
  // SPEC-0020 Phase 3: Settings → Appearance, rendered on the first paint from the cookie (signed out = default).
  const appearance = session ? parseAppearanceCookie((await cookies()).get(APPEARANCE_COOKIE)?.value) : parseAppearanceCookie(null);
  return (
    <html lang="en" data-theme={appearance.theme} data-accent={appearance.accent}>
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${display.variable} antialiased`}
      >
        <AccountSessionProvider user={session ? toAccountPublicUser(session) : null}>
          {session && <AppearanceSync />}
          <NotificationCenterProvider>
            <ScrollbarActivity />
            <ChunkReloadGuard />
            {children}
            <PageLoadingMark />
            <SlidingSelection />
          </NotificationCenterProvider>
        </AccountSessionProvider>
      </body>
    </html>
  );
}
