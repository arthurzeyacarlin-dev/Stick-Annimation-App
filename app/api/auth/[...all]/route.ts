import { toNextJsHandler } from "better-auth/next-js";
import { auth } from "@/src/lib/account/auth";
import { isTrustedAccountRequest } from "@/src/lib/account/access";

export const runtime = "nodejs";

const handlers = toNextJsHandler(auth);
const guarded = (handler: (request: Request) => Promise<Response>) => (request: Request) =>
  isTrustedAccountRequest(request)
    ? handler(request)
    : Promise.resolve(Response.json({ error: "Access is limited to the Diamond Animator app itself." }, { status: 403 }));

export const GET = guarded(handlers.GET);
export const POST = guarded(handlers.POST);
export const PATCH = guarded(handlers.PATCH);
export const PUT = guarded(handlers.PUT);
export const DELETE = guarded(handlers.DELETE);
