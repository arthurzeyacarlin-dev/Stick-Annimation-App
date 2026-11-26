import "server-only";

// SPEC-0027: small shared pieces of the support API routes (plain JSON answers, never cached; a body read with a size limit).
import { NextResponse } from "next/server";
import { readBytes } from "@/src/lib/account/readJson";
import { checkSupportApiKey, supportApiKey } from "./supportApiKey";

export const NO_STORE = { "Cache-Control": "no-store" };
export const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: NO_STORE });
export const notFound = () => json({ error: "Not found." }, 404);

/** The request body as an object (null when it isn't one, or is bigger than `max` bytes). */
export async function readObject(request: Request, max = 64 * 1024): Promise<Record<string, unknown> | null> {
  try {
    const value = JSON.parse(Buffer.from(await readBytes(request, max)).toString("utf8")) as unknown;
    return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

/** The ticket API's key check: no key on the server, or a wrong key = the same plain "not found" as a missing page. */
export const hasSupportApiKey = (request: Request) => checkSupportApiKey(request.headers.get("authorization"), supportApiKey());
