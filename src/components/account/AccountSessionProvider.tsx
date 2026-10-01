"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { AccountPublicUser } from "@/src/lib/account/accountConfig";
import { configureAccountDataOwner } from "@/src/lib/account/accountDataClient";

const AccountSessionContext = createContext<AccountPublicUser | null>(null);

export function AccountSessionProvider({ user, children }: { user: AccountPublicUser | null; children: ReactNode }) {
  if (typeof window !== "undefined") configureAccountDataOwner(user?.id ?? null);
  return <AccountSessionContext.Provider value={user}>{children}</AccountSessionContext.Provider>;
}

export const useAccountSession = () => useContext(AccountSessionContext);
