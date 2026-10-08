import "server-only";

import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { auth } from "./auth";
import { isAccountPreviewPlan, isTrustedAccountRequest, type AccountPublicUser } from "./accountConfig";

export { isTrustedAccountRequest } from "./accountConfig";

export const getServerAccountSession = async () => auth.api.getSession({ headers: await headers() });

export const requireAccountRequest = async (request: Request) => {
  if (!isTrustedAccountRequest(request)) {
    return { response: NextResponse.json({ error: "Access is limited to the Diamond Animator app itself." }, { status: 403 }) } as const;
  }
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) {
    return { response: NextResponse.json({ error: "Please log in to continue." }, { status: 401 }) } as const;
  }
  return { session } as const;
};

export const toAccountPublicUser = (session: NonNullable<Awaited<ReturnType<typeof getServerAccountSession>>>): AccountPublicUser => ({
  id: session.user.id,
  name: session.user.name,
  email: session.user.email,
  emailVerified: session.user.emailVerified,
  previewPlan: isAccountPreviewPlan(session.user.previewPlan) ? session.user.previewPlan : "starter_preview",
});
