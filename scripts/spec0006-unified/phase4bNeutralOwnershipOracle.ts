import assert from "node:assert/strict";
export const assertNeutralOwnership = (source: string) => {
  assert.doesNotMatch(source, /contentKind\s*:/);
  assert.match(source, /stickByCell/);
  assert.match(source, /saveUnifiedProjectV2/);
  return true;
};
