import assert from "node:assert/strict";
import test from "node:test";
import { creditMeterPercent } from "./creditMeter.ts";

test("the same spend fills a smaller plan faster than a bigger plan", () => {
  const basic = creditMeterPercent(25, 180);
  const creator = creditMeterPercent(25, 750);
  assert.ok(basic > creator * 4);
});

test("a spent plan is full on every plan, and a bought pack makes the bar shrink", () => {
  assert.equal(creditMeterPercent(180, 180), 100);
  assert.equal(creditMeterPercent(750, 750), 100);
  assert.ok(creditMeterPercent(150, 180, 30) < creditMeterPercent(150, 180, 0));
});

test("never below 0 or above 100", () => {
  assert.equal(creditMeterPercent(-5, 180), 0);
  assert.equal(creditMeterPercent(500, 180), 100);
});
