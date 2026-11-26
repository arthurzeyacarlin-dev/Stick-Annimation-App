import { NextResponse } from "next/server";
import { readBytes } from "@/src/lib/account/readJson";
import { requireAccountRequest } from "@/src/lib/account/access";
import { auth } from "@/src/lib/account/auth";
import { isAccountProfileImage } from "@/src/lib/account/accountConfig";
import { isOwnerEmail } from "@/src/lib/account/owner";
import { giveGiftCreditsOnce, hasMadeAnimation } from "@/src/lib/account/aiCredits";
import {
  checkDisplayName, checkTestimonialInput, isExported, isTestimonialId, isTestimonialStatus, isTestimonialWhere, shouldAskTestimonial,
  testimonialDisclosure, testimonialThankYouEvent, TESTIMONIAL_DISCLOSURE_RULE, TESTIMONIAL_THANK_YOU_CREDITS, wantsPhotoNudge,
  type WallOfLoveEntry,
} from "@/src/lib/account/testimonials";
import {
  countNewTestimonials, listTestimonials, readOwnTestimonial, markTestimonialExportSeen, readTestimonialAsk, removeOwnTestimonial, saveTestimonial,
  skipTestimonialAsk, updateTestimonial,
} from "@/src/lib/account/testimonialStore";

// SPEC-0029: testimonials.
//   GET  ?ask=animation|export — signed in: should the ask be shown now? (+ the thank-you credits it may promise)
//   GET ?mine=1 — signed in: my own testimonial.
//   POST { stars, text, featureOk, where } — the one answer (+ the thank-you credits, once per account; Nov 26)
//   POST { skip: true, where } — "Not now" / closed.
//   DELETE — signed in: take my testimonial back.
//   GET ?proof=1 — signed in: up to 3 Wall of Love quotes for the plans page (SPEC-0031).
//   GET (owner) ?status=new|approved|hidden|all — the list;  GET (owner) ?export=1 — the Wall of Love entries (+ photos).
//   PATCH (owner) { id, status?, displayName?, usePhoto? }.
// Anyone who isn't the owner gets a plain "not found" for the owner parts.
export const runtime = "nodejs";

const NO_STORE = { "Cache-Control": "no-store" };
const MAX_BODY_BYTES = 16 * 1024;
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: NO_STORE });
const notFound = () => json({ error: "Not found." }, 404);

async function readBody(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const parsed = JSON.parse(Buffer.from(await readBytes(request, MAX_BODY_BYTES)).toString("utf8")) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null;
  } catch { return null; }
}

export async function GET(request: Request) {
  const access = await requireAccountRequest(request);
  if ("response" in access) return access.response;
  const { user } = access.session;
  const params = new URL(request.url).searchParams;
  try {
    const where = params.get("ask");
    if (where !== null) {
      const ask = isTestimonialWhere(where) && shouldAskTestimonial(readTestimonialAsk(user.id), where);
      // The card promises the thank-you only when Send will really give it (same check as POST below).
      return json({ ask, thankYouCredits: ask && hasMadeAnimation(user.id) ? TESTIMONIAL_THANK_YOU_CREDITS : 0 });
    }
    if (params.get("mine") === "1") {
      const mine = readOwnTestimonial(user.id);
      return json({ testimonial: mine && { stars: mine.stars, text: mine.text, featureOk: mine.featureOk, status: mine.status } });
    }
    // SPEC-0031: the plans page's proof strip: up to 3 that are in the Wall of Love (approved + 13 or older + OK to feature),
    // name + stars + words only (no photo, no account).
    if (params.get("proof") === "1") {
      const proof = listTestimonials("approved").filter(isExported).slice(0, 3)
        .map((t) => ({ id: t.id, name: t.displayName, stars: t.stars, quote: t.text, disclosure: testimonialDisclosure(t) }));
      return json({ proof });
    }
    if (!isOwnerEmail(user.email)) return notFound();
    if (params.get("export") === "1") {
      const context = await auth.$context;
      const entries: WallOfLoveEntry[] = [];
      for (const t of listTestimonials("approved").filter(isExported)) {
        // the person's photo as it is NOW (removed photo or deleted account = gone from the next export)
        const person = await context.internalAdapter.findUserById(t.userId);
        if (!person) continue;
        const photo = t.usePhoto && isAccountProfileImage(person.image) ? person.image : null;
        entries.push({ id: t.id, name: t.displayName, stars: t.stars, quote: t.text, date: new Date(t.createdAt).toISOString().slice(0, 10), photo,
          disclosure: testimonialDisclosure(t) });
      }
      return json({ schema: "diamond-wall-of-love/v1", disclosureRule: TESTIMONIAL_DISCLOSURE_RULE, entries });
    }
    const status = params.get("status") ?? "new";
    const filter = status === "all" || isTestimonialStatus(status) ? status : "new";
    // the owner sees the photo that would go on the wall (to check it is not a young child), only for ones that can be featured
    const context = await auth.$context;
    const testimonials = await Promise.all(listTestimonials(filter).map(async (t) => {
      const person = t.featurable ? await context.internalAdapter.findUserById(t.userId) : null;
      return { ...t, photo: person && isAccountProfileImage(person.image) ? person.image : null };
    }));
    return json({ schema: "diamond-testimonial-list/v1", newCount: countNewTestimonials(), testimonials });
  } catch {
    return json({ error: "Testimonials couldn't be loaded. Try again." }, 503);
  }
}

export async function POST(request: Request) {
  const access = await requireAccountRequest(request);
  if ("response" in access) return access.response;
  const { user } = access.session;
  const body = await readBody(request);
  try {
    if (body?.seen === "export") { markTestimonialExportSeen(user.id); return json({ ok: true }); }
    if (body?.skip === true) {
      if (!isTestimonialWhere(body.where)) return json({ error: "That couldn't be read." }, 400);
      return json({ ok: skipTestimonialAsk(user.id, body.where).ok });
    }
    const check = checkTestimonialInput(body);
    if (!check.ok) return json({ error: check.message }, 400);
    // Nov 26 THE THANK-YOU: the same credits for every answer (never looks at the stars or the box), once per account, only
    // for an account that really made an AI animation (the card's normal trigger; a script can't farm it), paid inside the save.
    const thankYou = hasMadeAnimation(user.id)
      ? () => (giveGiftCreditsOnce(user.id, TESTIMONIAL_THANK_YOU_CREDITS, testimonialThankYouEvent(user.id)) ? TESTIMONIAL_THANK_YOU_CREDITS : 0)
      : undefined;
    const saved = saveTestimonial({
      ...check.value,
      userId: user.id,
      userName: typeof user.name === "string" ? user.name.trim().slice(0, 80) : "",
      userEmail: user.email,
    }, Date.now(), thankYou);
    if (!saved.ok) {
      if (saved.reason === "rate") return json({ error: "Please try again in a little while." }, 429);
      if (saved.reason === "not_asked") return json({ error: "Thanks! There's nothing to answer right now." }, 409);
      // already answered (a retry after a lost reply): say the same thing again, nothing is given twice
      return json({ ok: true, photoNudge: false, credits: readOwnTestimonial(user.id)?.creditsGiven ?? 0 });
    }
    return json({ ok: true, photoNudge: wantsPhotoNudge(check.value, isAccountProfileImage(user.image)), credits: saved.testimonial.creditsGiven }, 201);
  } catch {
    return json({ error: "That couldn't be sent. Try again in a moment." }, 503);
  }
}

export async function DELETE(request: Request) {
  const access = await requireAccountRequest(request);
  if ("response" in access) return access.response;
  try {
    return json({ ok: true, removed: removeOwnTestimonial(access.session.user.id) });
  } catch {
    return json({ error: "That couldn't be removed. Try again." }, 503);
  }
}

export async function PATCH(request: Request) {
  const access = await requireAccountRequest(request);
  if ("response" in access) return access.response;
  if (!isOwnerEmail(access.session.user.email)) return notFound();
  const body = await readBody(request);
  if (!body || !isTestimonialId(body.id)) return json({ error: "That change couldn't be read. Reload the page and try again." }, 400);
  const change: { status?: "new" | "approved" | "hidden"; displayName?: string; usePhoto?: boolean } = {};
  if (body.status !== undefined) { if (!isTestimonialStatus(body.status)) return json({ error: "That change couldn't be read." }, 400); change.status = body.status; }
  if (body.displayName !== undefined) {
    const name = checkDisplayName(body.displayName);
    if (!name) return json({ error: "The name must be 1 to 40 letters and can't be an email." }, 400);
    change.displayName = name;
  }
  if (typeof body.usePhoto === "boolean") change.usePhoto = body.usePhoto;
  try {
    if (!updateTestimonial(body.id, change)) return json({ error: "That testimonial wasn't found. Reload the page." }, 404);
    return json({ ok: true, newCount: countNewTestimonials() });
  } catch {
    return json({ error: "That change couldn't be saved. Try again." }, 503);
  }
}
