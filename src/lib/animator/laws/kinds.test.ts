import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { LAW_KINDS } from "./kinds.ts";

// Every law the laws file can report has a kind (broken / taste) — a new law cannot quietly become a reason to refuse.
test("every law has a kind", () => {
  const src = readFileSync(new URL("./measure.ts", import.meta.url), "utf8");
  const laws = [...new Set([...src.matchAll(/law: "([A-Za-z]+)"/g)].map((m) => m[1]))];
  assert.ok(laws.length > 20);
  assert.deepEqual(laws.filter((l) => !(l in LAW_KINDS)), []);
});
