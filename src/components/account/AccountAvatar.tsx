"use client";

import type { AccountPublicUser } from "@/src/lib/account/accountConfig";

// SPEC-0020 Phase 1: the account picture, or the first letter of the name when there is no picture.
export function AccountAvatarContent({ account, imageClassName }: { account: Pick<AccountPublicUser, "name" | "email" | "image">; imageClassName?: string }) {
  if (account.image) {
    // A small data URL saved with the account, so a plain <img> is right here (no image optimizer).
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={account.image} alt="" className={imageClassName} draggable={false} />;
  }
  return <>{(account.name || account.email || "A").trim().slice(0, 1).toUpperCase()}</>;
}
