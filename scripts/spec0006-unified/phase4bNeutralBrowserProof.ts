import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const result = JSON.parse(readFileSync("output/spec-0006/phase-4-neutral/4b/browser-result.json", "utf8"));
assert.equal(result.status, "PASS"); assert.equal(result.externalRequests, 0); assert.equal(result.realApiRequests, 0);
for (const flow of ["ordinary-new-empty","drawing-and-stick-same-frame","undo-redo","play-pause","add-layer","save-reopen"]) assert.equal(result.flows[flow], true);
console.log(JSON.stringify({ status: "PASS", flows: Object.keys(result.flows).length }));
