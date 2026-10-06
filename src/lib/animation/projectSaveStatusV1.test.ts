import assert from "node:assert/strict";
import { test } from "node:test";
import { accountSaveStatusV1 } from "./projectSaveStatusV1.ts";

test("after an account save the top bar says Saved, even if the old safety backup could not be cleared", () => {
  // Arthur's round-8 case: the save worked, the project reopens and plays, only the backup cleanup failed.
  assert.equal(accountSaveStatusV1({ officialWriteSucceeded: true, coversCurrentGeneration: true, recoveryDraftCleared: false }), "saved");
  assert.equal(accountSaveStatusV1({ officialWriteSucceeded: true, coversCurrentGeneration: true, recoveryDraftCleared: true }), "saved");
});

test("it still says Unsaved changes when the save failed or edits happened while it ran", () => {
  assert.equal(accountSaveStatusV1({ officialWriteSucceeded: false, coversCurrentGeneration: false, recoveryDraftCleared: false }), "unsaved");
  assert.equal(accountSaveStatusV1({ officialWriteSucceeded: true, coversCurrentGeneration: false, recoveryDraftCleared: true }), "unsaved");
  assert.equal(accountSaveStatusV1({ officialWriteSucceeded: false, coversCurrentGeneration: true, recoveryDraftCleared: true }), "unsaved");
});
