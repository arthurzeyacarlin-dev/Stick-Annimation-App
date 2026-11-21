import assert from "node:assert/strict";
import test from "node:test";
import { creditsText, dollarsText } from "./credits.ts";

test("credits read as credits, never as money", () => {
  assert.equal(creditsText(470), "470 credits");
  assert.equal(creditsText(1), "1 credit");
  assert.equal(creditsText(0), "0 credits");
  assert.equal(creditsText(1200), "1,200 credits");
  assert.equal(creditsText(-6), "−6 credits");
  assert.equal(creditsText(66.6), "67 credits");
});

test("real payments read as dollars", () => {
  assert.equal(dollarsText(999), "$9.99");
  assert.equal(dollarsText(59), "$0.59");
  assert.equal(dollarsText(0), "$0.00");
  assert.equal(dollarsText(-730), "−$7.30");
});
