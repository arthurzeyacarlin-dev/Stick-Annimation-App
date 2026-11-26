// SPEC-0029: testimonials — who is asked, what an answer may contain, THE KIDS RULE (only 13+ with the box ticked, 4-5 stars
// and the owner's approval are ever exported), and the store (one answer per account, skip twice = never again).
// Run: node --test src/lib/account/testimonials.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  canBeFeatured, checkDisplayName, checkTestimonialInput, isExported, isTestimonialId, shouldAskTestimonial, testimonialDisplayName,
  testimonialRateOk, wantsPhotoNudge, TESTIMONIAL_TEXT_MAX,
} from "./testimonials.ts";
import {
  deleteTestimonialsForUser, listTestimonials, markTestimonialExportSeen, openTestimonialDatabase, readOwnTestimonial, readTestimonialAsk, removeOwnTestimonial,
  saveTestimonial, skipTestimonialAsk, updateTestimonial, useTestimonialDatabaseForTests,
} from "./testimonialStore.ts";

test("the ask: never again once answered or skipped twice; at an export only once", () => {
  assert.equal(shouldAskTestimonial(null, "animation"), true);
  assert.equal(shouldAskTestimonial(null, "export"), true);
  assert.equal(shouldAskTestimonial({ skips: 1, answered: false, exportSeen: false }, "animation"), true);
  assert.equal(shouldAskTestimonial({ skips: 2, answered: false, exportSeen: false }, "animation"), false);
  assert.equal(shouldAskTestimonial({ skips: 0, answered: true, exportSeen: false }, "animation"), false);
  assert.equal(shouldAskTestimonial({ skips: 1, answered: false, exportSeen: true }, "export"), false);
  assert.equal(shouldAskTestimonial({ skips: 1, answered: false, exportSeen: true }, "animation"), true);
});

test("an answer: 1-5 whole stars, optional short words, the box only when exactly true", () => {
  assert.deepEqual(checkTestimonialInput({ stars: 5, text: "  So  fun!\n", featureOk: true, where: "animation" }),
    { ok: true, value: { stars: 5, text: "So fun!", featureOk: true, where: "animation" } });
  assert.equal(checkTestimonialInput({ stars: 4, where: "export" }).ok, true);
  assert.equal((checkTestimonialInput({ stars: 4, featureOk: "yes", where: "export" }) as { value: { featureOk: boolean } }).value.featureOk, false);
  for (const stars of [0, 6, 4.5, "5", null]) assert.equal(checkTestimonialInput({ stars, where: "animation" }).ok, false);
  assert.equal(checkTestimonialInput({ stars: 5, where: "home" }).ok, false);
  assert.equal(checkTestimonialInput({ stars: 5, text: "a".repeat(TESTIMONIAL_TEXT_MAX + 1), where: "animation" }).ok, false);
  assert.equal(checkTestimonialInput([]).ok, false);
});

test("THE KIDS RULE: featured only with the 13+ box ticked, 4-5 stars, words, and the owner's approval", () => {
  const good = { stars: 5, text: "Love it", featureOk: true };
  assert.equal(canBeFeatured(good), true);
  assert.equal(canBeFeatured({ ...good, featureOk: false }), false);   // no tick (maybe under 13) = private forever
  assert.equal(canBeFeatured({ ...good, stars: 3 }), false);
  assert.equal(canBeFeatured({ ...good, text: "" }), false);
  assert.equal(isExported({ ...good, status: "approved" }), true);
  assert.equal(isExported({ ...good, status: "new" }), false);
  assert.equal(isExported({ ...good, status: "hidden" }), false);
  assert.equal(isExported({ ...good, featureOk: false, status: "approved" }), false);
});

test("shown name = first name + last initial, never an email", () => {
  assert.equal(testimonialDisplayName("Maya Rodriguez"), "Maya R.");
  assert.equal(testimonialDisplayName("maya de la cruz"), "maya C.");
  assert.equal(testimonialDisplayName("Maya"), "Maya");
  assert.equal(testimonialDisplayName("maya@example.com"), "A Diamond Animator user");
  assert.equal(testimonialDisplayName(""), "A Diamond Animator user");
  assert.equal(checkDisplayName(" Sam K. "), "Sam K.");
  assert.equal(checkDisplayName("sam@x.com"), null);
  assert.equal(checkDisplayName(""), null);
});

test("photo nudge only for a featurable answer from someone without a photo; ids; hourly guard", () => {
  assert.equal(wantsPhotoNudge({ stars: 5, text: "", featureOk: true }, false), true);
  assert.equal(wantsPhotoNudge({ stars: 5, text: "", featureOk: true }, true), false);
  assert.equal(wantsPhotoNudge({ stars: 5, text: "", featureOk: false }, false), false);
  assert.equal(wantsPhotoNudge({ stars: 3, text: "", featureOk: true }, false), false);
  assert.equal(isTestimonialId(`tm_${"a".repeat(32)}`), true);
  assert.equal(isTestimonialId("pr_x"), false);
  assert.equal(testimonialRateOk([1, 2, 3, 4], 10), true);
  assert.equal(testimonialRateOk([1, 2, 3, 4, 5], 10), false);
});

test("store: one answer per account, skip twice, owner approval, take-back and account deletion", () => {
  const db = openTestimonialDatabase(":memory:");
  useTestimonialDatabaseForTests(db);
  try {
    const who = { userId: "u1", userName: "Maya Rodriguez", userEmail: "maya@example.com" };
    const saved = saveTestimonial({ ...who, stars: 5, text: "Love it", featureOk: true, where: "animation" }, 1000);
    assert.equal(saved.ok, true);
    const t = (saved as { testimonial: { id: string; displayName: string; featurable: boolean; status: string } }).testimonial;
    assert.equal(t.displayName, "Maya R.");
    assert.equal(t.featurable, true);
    assert.equal(t.status, "new");
    assert.deepEqual(saveTestimonial({ ...who, stars: 1, text: "", featureOk: false, where: "export" }, 2000), { ok: false, reason: "answered" });
    assert.equal(readTestimonialAsk("u1").answered, true);

    assert.equal(updateTestimonial(t.id, { status: "approved", displayName: "Maya", usePhoto: false }), true);
    assert.equal(updateTestimonial(`tm_${"0".repeat(32)}`, { status: "approved" }), false);
    const listed = listTestimonials("approved");
    assert.equal(listed.length, 1);
    assert.equal(listed[0].displayName, "Maya");
    assert.equal(listed[0].usePhoto, false);

    skipTestimonialAsk("u2", "export", 1000);
    assert.deepEqual(readTestimonialAsk("u2"), { skips: 1, answered: false, exportSeen: true });
    skipTestimonialAsk("u2", "animation", 1001);
    assert.equal(shouldAskTestimonial(readTestimonialAsk("u2"), "animation"), false);

    // a child (no tick): kept privately, never featurable
    saveTestimonial({ userId: "kid", userName: "Kid", userEmail: "parent@example.com", stars: 5, text: "Cool", featureOk: false, where: "animation" }, 3000);
    assert.equal(readOwnTestimonial("kid")?.featurable, false);

    assert.equal(removeOwnTestimonial("kid"), true);
    assert.equal(readOwnTestimonial("kid"), null);
    deleteTestimonialsForUser("u1");
    assert.equal(readOwnTestimonial("u1"), null);
    assert.equal(readTestimonialAsk("u1").answered, false);

    markTestimonialExportSeen("u4");
    assert.equal(shouldAskTestimonial(readTestimonialAsk("u4"), "export"), false);
    assert.equal(shouldAskTestimonial(readTestimonialAsk("u4"), "animation"), true);

    for (let i = 0; i < 5; i++) skipTestimonialAsk("u3", "animation", 5000 + i);
    assert.deepEqual(skipTestimonialAsk("u3", "animation", 5010), { ok: false });
  } finally {
    useTestimonialDatabaseForTests(null);
    db.close();
  }
});
