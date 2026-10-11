import "./globals.css";
import "./themes.css";
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ScrollbarActivity } from "./ScrollbarActivity";
import { NotificationCenterProvider } from "@/src/components/notifications/NotificationCenterProvider";
import { AccountSessionProvider } from "@/src/components/account/AccountSessionProvider";
import { getServerAccountSession, toAccountPublicUser } from "@/src/lib/account/access";
import { cookies } from "next/headers";
import { AppearanceSync } from "@/src/components/account/AppearanceSync";
import { APPEARANCE_COOKIE, parseAppearanceCookie } from "@/src/lib/account/appearance";

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
  description: "Draw, animate and bring your ideas to life.",
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
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <AccountSessionProvider user={session ? toAccountPublicUser(session) : null}>
          {session && <AppearanceSync />}
          <NotificationCenterProvider>
            <ScrollbarActivity />
            {children}
          </NotificationCenterProvider>
        </AccountSessionProvider>
      </body>
    </html>
  );
}
