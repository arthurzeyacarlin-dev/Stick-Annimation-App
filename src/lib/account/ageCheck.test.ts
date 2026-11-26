// Run: node --import ./scripts/money-test-loader.mjs --test src/lib/account/ageCheck.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { ageAllowed, birthYearChoices, isAgeGroup, isSignUpAgeGroup, isUnder13, mayGetEmails, needsBirthMonth } from "./ageCheck.ts";

const NOW = new Date(2026, 10, 26); // Nov 26, 2026

test("clearly 13 or older, and clearly under 13", () => {
  assert.equal(isUnder13(2012, null, NOW), false); // 14
  assert.equal(isUnder13(1980, null, NOW), false);
  assert.equal(isUnder13(2014, null, NOW), true); // 12
  assert.equal(isUnder13(2020, null, NOW), true);
  assert.equal(isUnder13(2026, null, NOW), true);
});

test("born exactly 13 years ago: the month decides, and no month means under 13", () => {
  assert.equal(needsBirthMonth(2013, NOW), true);
  assert.equal(needsBirthMonth(2012, NOW), false);
  assert.equal(needsBirthMonth(2014, NOW), false);
  assert.equal(isUnder13(2013, null, NOW), true);
  assert.equal(isUnder13(2013, 1, NOW), false); // January: already 13
  assert.equal(isUnder13(2013, 10, NOW), false); // October: already 13
  assert.equal(isUnder13(2013, 11, NOW), true); // November: maybe not yet (the day isn't asked)
  assert.equal(isUnder13(2013, 12, NOW), true); // December: still 12
  assert.equal(isUnder13(2013, 13, NOW), true); // nonsense month
});

test("the year list starts this year and goes back 100 years, with no year picked for you", () => {
  const years = birthYearChoices(NOW);
  assert.equal(years[0], 2026);
  assert.equal(years.at(-1), 1926);
  assert.equal(years.length, 101);
});

test("only 13+ and parent accounts may use the app and get emails", () => {
  for (const value of ["13plus", "parent"]) { assert.equal(ageAllowed(value), true); assert.equal(mayGetEmails(value), true); }
  for (const value of ["under13", null, undefined, "", "18plus", 13]) { assert.equal(ageAllowed(value), false); assert.equal(mayGetEmails(value), false); }
});

test("a sign-up may only say 13plus or parent; under13 is only for old accounts", () => {
  assert.equal(isSignUpAgeGroup("13plus"), true);
  assert.equal(isSignUpAgeGroup("parent"), true);
  assert.equal(isSignUpAgeGroup("under13"), false);
  assert.equal(isSignUpAgeGroup(undefined), false);
  assert.equal(isAgeGroup("under13"), true);
  assert.equal(isAgeGroup("kid"), false);
});
